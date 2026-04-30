(function () {
  'use strict';

  const utils = window.ACE0DashboardUtils || {};
  const bridge = window.ACE0DashboardBridge || {};
  const state = window.ACE0DashboardExpansionState || (window.ACE0DashboardExpansionState = {
    tabs: [],
    currentTabId: '',
    latestHostPayload: null,
    embeddedUrl: ''
  });

  const normalizeDashboardString = utils.normalizeDashboardString || ((value, fallback = '') => (typeof value === 'string' ? value.trim() : fallback));
  const escapeDashboardHtml = utils.escapeDashboardHtml || ((value) => String(value ?? ''));
  const messageTypes = bridge.MESSAGE_TYPES || {
    init: 'ACE0_DASHBOARD_INIT',
    refresh: 'ACE0_DASHBOARD_REFRESH'
  };

  function getPageRefs() {
    const page = document.getElementById('dashboard-page-expansion');
    return {
      page,
      shell: page?.querySelector('.expansion-shell') || null,
      kicker: document.getElementById('expansion-kicker'),
      title: document.getElementById('expansion-title'),
      subtitle: document.getElementById('expansion-subtitle'),
      tabs: document.getElementById('expansion-tabs'),
      panel: document.getElementById('expansion-panel')
    };
  }

  function getEmbeddedPagesStore() {
    return window.ACE0_EMBEDDED_PAGES && typeof window.ACE0_EMBEDDED_PAGES === 'object'
      ? window.ACE0_EMBEDDED_PAGES
      : {};
  }

  function getEmbeddedPageHtml(pageId) {
    const normalizedId = normalizeDashboardString(pageId, '');
    if (!normalizedId) return '';
    const pages = getEmbeddedPagesStore();
    return typeof pages[normalizedId] === 'string' ? pages[normalizedId] : '';
  }

  function getBuiltinTabs() {
    return [];
  }

  function disposeEmbeddedUrl() {
    if (!state.embeddedUrl) return;
    try {
      URL.revokeObjectURL(state.embeddedUrl);
    } catch (_) {}
    state.embeddedUrl = '';
  }

  function getFrame() {
    return getPageRefs().panel?.querySelector('[data-expansion-frame]') || null;
  }

  function buildExpansionFrameSrc(tab) {
    if (!tab || tab.type !== 'iframe') return '';

    const embeddedHtml = getEmbeddedPageHtml(tab.embeddedPageId);
    if (embeddedHtml) {
      disposeEmbeddedUrl();
      state.embeddedUrl = URL.createObjectURL(new Blob([embeddedHtml], { type: 'text/html;charset=utf-8' }));
      return state.embeddedUrl;
    }

    disposeEmbeddedUrl();
    return normalizeDashboardString(tab.src, '');
  }

  function postFrameData(messageType = 'ACE0_ACT_REFRESH') {
    if (typeof bridge.postExpansionFrameData !== 'function') return false;
    return bridge.postExpansionFrameData(getFrame(), state.latestHostPayload, messageType);
  }

  function postFrameMessage(messageType, payload) {
    if (typeof bridge.postExpansionFrameMessage !== 'function') return false;
    return bridge.postExpansionFrameMessage(getFrame(), messageType, payload);
  }

  function attachActCommitBridge() {
    if (typeof bridge.attachExpansionFrameActCommitBridge !== 'function') return false;
    return bridge.attachExpansionFrameActCommitBridge(getFrame());
  }

  function normalizeExtensionTab(tab, index) {
    if (!tab || typeof tab !== 'object') return null;

    const id = normalizeDashboardString(tab.id, `expansion-${index + 1}`);
    const label = normalizeDashboardString(tab.label, `EXP ${index + 1}`);
    const title = normalizeDashboardString(tab.title, label);
    const subtitle = normalizeDashboardString(tab.subtitle, '');
    const kicker = normalizeDashboardString(tab.kicker, 'DLC TERMINAL');
    const body = normalizeDashboardString(tab.body, '暂无扩展说明。');
    const type = normalizeDashboardString(tab.type, '').toLowerCase() === 'iframe' ? 'iframe' : 'card';
    const src = normalizeDashboardString(tab.src, '');
    const embeddedPageId = normalizeDashboardString(tab.embeddedPageId, '');
    const items = Array.isArray(tab.items)
      ? tab.items
        .map((item) => {
          if (!item || typeof item !== 'object') return null;
          return {
            label: normalizeDashboardString(item.label, 'INFO'),
            value: normalizeDashboardString(item.value, '')
          };
        })
        .filter(Boolean)
      : [];

    return {
      id,
      label,
      title,
      subtitle,
      kicker,
      body,
      type,
      src,
      embeddedPageId,
      items,
      order: Number.isFinite(tab.order) ? tab.order : 100
    };
  }

  function extractExtensionsFromPayload(payload) {
    if (!payload || typeof payload !== 'object') {
      state.tabs = getBuiltinTabs();
      return state.tabs;
    }

    const rawTabs = payload.extensions?.tabs
      || payload.data?.extensions?.tabs
      || payload.stat_data?.extensions?.tabs
      || [];

    const normalizedTabs = Array.isArray(rawTabs)
      ? rawTabs.map((tab, index) => normalizeExtensionTab(tab, index)).filter(Boolean)
      : [];

    const mergedTabs = [...getBuiltinTabs(), ...normalizedTabs];
    const seen = new Set();

    state.tabs = mergedTabs
      .filter((tab) => {
        if (!tab || seen.has(tab.id)) return false;
        seen.add(tab.id);
        return true;
      })
      .sort((left, right) => left.order - right.order);

    return state.tabs;
  }

  function setHostPayload(payload) {
    state.latestHostPayload = payload || null;
  }

  function renderPage() {
    const refs = getPageRefs();
    if (!refs.tabs || !refs.panel || !refs.title || !refs.subtitle || !refs.kicker) {
      return state.tabs;
    }

    if (!state.tabs.length) {
      state.currentTabId = '';
      refs.kicker.textContent = 'ACEZERO EXPANSION BUS';
      refs.title.textContent = 'NO ACTIVE EXPANSION';
      refs.subtitle.textContent = '启用并激活一个 DLC 后，这里会显示它注册进来的实验面板。';
      refs.tabs.innerHTML = '';
      refs.panel.innerHTML = '<div class="expansion-empty">当前没有激活中的 DLC 面板。</div>';
      return state.tabs;
    }

    if (!state.tabs.some((tab) => tab.id === state.currentTabId)) {
      state.currentTabId = state.tabs[0].id;
    }

    const activeTab = state.tabs.find((tab) => tab.id === state.currentTabId) || state.tabs[0];
    const isEmbeddedView = activeTab.type === 'iframe';

    if (refs.page) refs.page.classList.toggle('is-embedded-view', isEmbeddedView);
    if (refs.shell) refs.shell.classList.toggle('is-embedded-view', isEmbeddedView);

    refs.kicker.textContent = activeTab.kicker;
    refs.title.textContent = activeTab.title;
    refs.subtitle.textContent = activeTab.subtitle || '该页签内容来自当前激活 DLC 的 dashboard 注册。';

    refs.tabs.innerHTML = state.tabs.map((tab) => `
      <button
        class="expansion-tab${tab.id === activeTab.id ? ' is-active' : ''}"
        type="button"
        data-expansion-tab="${tab.id}">
        ${escapeDashboardHtml(tab.label)}
      </button>
    `).join('');

    refs.panel.classList.toggle('is-embedded', isEmbeddedView);

    if (isEmbeddedView) {
      const frameSrc = buildExpansionFrameSrc(activeTab);

      refs.panel.innerHTML = `
        <div class="expansion-embedded-shell">
          <iframe
            class="expansion-embedded-frame"
            data-expansion-frame="1"
            title="${escapeDashboardHtml(activeTab.title)}"
            src="${escapeDashboardHtml(frameSrc)}"
            loading="eager"
            allow="autoplay; fullscreen">
          </iframe>
        </div>
      `;

      const embeddedFrame = refs.panel.querySelector('[data-expansion-frame]');
      if (embeddedFrame) {
        embeddedFrame.addEventListener('load', () => {
          attachActCommitBridge();
          postFrameData('ACE0_ACT_INIT');
        }, { once: true });
        window.setTimeout(() => {
          attachActCommitBridge();
          postFrameData('ACE0_ACT_REFRESH');
        }, 80);
      }
    } else {
      disposeEmbeddedUrl();

      const sidebarItems = activeTab.items.length > 0
        ? activeTab.items.map((item) => `
            <div class="expansion-list-item">
              <span class="expansion-list-label">${escapeDashboardHtml(item.label)}</span>
              <span class="expansion-list-value">${escapeDashboardHtml(item.value || '—')}</span>
            </div>
          `).join('')
        : '<div class="expansion-empty">这个实验页签暂时没有附加条目。</div>';

      refs.panel.innerHTML = `
        <article class="expansion-card">
          <div class="expansion-card-head">
            <div>
              <div class="expansion-card-kicker">${escapeDashboardHtml(activeTab.kicker)}</div>
              <h2 class="expansion-card-title">${escapeDashboardHtml(activeTab.title)}</h2>
            </div>
          </div>
          <p class="expansion-card-desc">${escapeDashboardHtml(activeTab.body)}</p>
        </article>
        <aside class="expansion-aside">
          <div class="expansion-aside-title">Linked Signals</div>
          <div class="expansion-list">${sidebarItems}</div>
        </aside>
      `;
    }

    refs.tabs.querySelectorAll('[data-expansion-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        state.currentTabId = button.dataset.expansionTab || '';
        renderPage();
      });
    });

    return state.tabs;
  }

  window.ACE0DashboardExpansionPage = {
    getBuiltinTabs,
    extractExtensionsFromPayload,
    renderPage,
    setHostPayload,
    getTabs: () => state.tabs,
    getCurrentTabId: () => state.currentTabId,
    getFrame,
    postFrameData,
    postFrameMessage,
    attachActCommitBridge,
    messageTypes
  };
})();
