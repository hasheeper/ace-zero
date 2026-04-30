(function(global) {
  'use strict';

  const PANEL_HTML = `
  <aside class="debug-panel" id="debug-panel">
    <div class="debug-panel-header">
      <div class="debug-title">UI 调试面板</div>
      <button class="debug-collapse" id="debug-collapse" type="button">收起</button>
    </div>
    <div class="debug-panel-body">
      <div class="debug-subtitle">预留给后续主 UI 调用的 2D 手牌层。你可以在这里切换牌桌状态、切换 2D 手牌层、改数据、试摸牌与切牌。</div>
      <div class="debug-status" id="debug-status">hand layer: hidden</div>
      <div class="debug-status" id="debug-runtime-status">runtime: waiting</div>
      <div class="debug-status" id="debug-coach-status">coach: idle</div>
      <div class="debug-status" id="debug-coach-detail">coach detail: -</div>
      <div class="debug-status" id="debug-coach-auto-status">review auto: off</div>
      <div class="debug-grid">
        <button class="debug-action" id="debug-request-coach" type="button">手动请求建议</button>
        <button class="debug-action" id="debug-clear-coach" type="button">清空教练建议</button>
        <button class="debug-action" id="debug-toggle-coach-auto" type="button">开启自动复盘</button>
      </div>
      <div class="debug-grid">
        <button class="debug-action" id="debug-toggle-25d" type="button">切换 2.5D</button>
        <button class="debug-action" id="debug-toggle-perf" type="button">性能模式</button>
        <button class="debug-action" id="debug-toggle-zones" type="button">切换区域虚线</button>
        <button class="debug-action" id="debug-toggle-hand" type="button">显示/隐藏手牌层</button>
        <button class="debug-action" id="debug-load-sample" type="button">载入样例手牌</button>
        <button class="debug-action" id="debug-draw-tile" type="button">模拟摸牌</button>
        <button class="debug-action" id="debug-clear-hand" type="button">清空手牌</button>
        <button class="debug-action" id="debug-load-hand-status" type="button">载入状态样例</button>
        <button class="debug-action" id="debug-clear-hand-status" type="button">清空状态样例</button>
      </div>
      <div class="debug-status" id="debug-actions-status">actions layer: hidden</div>
      <div class="debug-grid">
        <button class="debug-action" id="debug-toggle-actions" type="button">显示/隐藏动作层</button>
        <button class="debug-action" id="debug-load-actions" type="button">载入样例动作</button>
        <button class="debug-action" id="debug-layout-actions" type="button">切换单双排</button>
        <button class="debug-action" id="debug-reset-actions" type="button">重置动作状态</button>
      </div>
      <div class="debug-status" id="debug-table-status">table select: single · selected: 0</div>
      <div class="debug-field">
        <label class="debug-label">桌面点击模式（牌河 / 对手手牌）</label>
        <div class="debug-inline-row">
          <button class="debug-segment is-active" id="debug-table-mode-single" type="button">单选</button>
          <button class="debug-segment" id="debug-table-mode-multi" type="button">多选</button>
          <button class="debug-segment" id="debug-table-mode-clear" type="button">清空</button>
        </div>
      </div>
      <div class="debug-field">
        <label class="debug-label">动作按钮筛选</label>
        <div class="debug-inline-row">
          <button class="debug-segment is-active" id="debug-action-mode-single" type="button">单选</button>
          <button class="debug-segment" id="debug-action-mode-multi" type="button">多选</button>
          <button class="debug-segment" id="debug-action-mode-clear" type="button">取消</button>
        </div>
        <div class="debug-chip-list" id="debug-action-picker"></div>
      </div>
      <div class="debug-field">
        <label class="debug-label" for="debug-hint-input">提示语</label>
        <input class="debug-input" id="debug-hint-input" type="text" value="请出牌...">
      </div>
      <div class="debug-field">
        <label class="debug-label" for="debug-hand-json">手牌 JSON（asset / label / isDrawn）</label>
        <textarea class="debug-textarea" id="debug-hand-json" spellcheck="false"></textarea>
      </div>
      <div class="debug-grid">
        <button class="debug-action" id="debug-apply-json" type="button">应用 JSON</button>
        <button class="debug-action" id="debug-sync-json" type="button">同步当前状态</button>
      </div>
      <div class="debug-field">
        <label class="debug-label" for="debug-actions-json">动作 JSON（label / key / variant / bgChar / textLayout / row）</label>
        <textarea class="debug-textarea" id="debug-actions-json" spellcheck="false"></textarea>
      </div>
      <div class="debug-grid">
        <button class="debug-action" id="debug-apply-actions-json" type="button">应用动作 JSON</button>
        <button class="debug-action" id="debug-sync-actions-json" type="button">同步动作状态</button>
      </div>
      <div class="debug-footnote">暴露接口：\`window.AceZeroMahjongUI.table\`、\`window.AceZeroMahjongUI.hand\`、\`window.AceZeroMahjongUI.actions\` 与 \`window.AceZeroMahjongUI.perf\`。桌面侧已支持 \`getState()\`、\`setSeatData()\`、\`appendToRiver()\`、\`drawToHand()\`、\`addMeld()\`、\`setInfo()\`、\`setRiichiState()\`、\`playAnimation()\`。</div>
    </div>
  </aside>`;

  let mounted = false;
  let panelEl = null;
  let collapseBtn = null;
  let statusEl = null;
  let runtimeStatusEl = null;
  let coachStatusEl = null;
  let coachDetailEl = null;
  let coachAutoStatusEl = null;
  let requestCoachBtn = null;
  let toggleCoachAutoBtn = null;

  function isEnabled() {
    const config = global.AceMahjongFrontendConfig || {};
    return config.debugPanelEnabled !== false;
  }

  function ensureMounted() {
    if (mounted) return;
    const root = document.getElementById('debug-panel-root');
    if (!root) return;
    root.innerHTML = PANEL_HTML;
    panelEl = document.getElementById('debug-panel');
    collapseBtn = document.getElementById('debug-collapse');
    statusEl = document.getElementById('debug-status');
    runtimeStatusEl = document.getElementById('debug-runtime-status');
    coachStatusEl = document.getElementById('debug-coach-status');
    coachDetailEl = document.getElementById('debug-coach-detail');
    coachAutoStatusEl = document.getElementById('debug-coach-auto-status');
    requestCoachBtn = document.getElementById('debug-request-coach');
    toggleCoachAutoBtn = document.getElementById('debug-toggle-coach-auto');
    if (collapseBtn && panelEl) {
      collapseBtn.addEventListener('click', () => {
        const collapsed = panelEl.classList.toggle('is-collapsed');
        collapseBtn.textContent = collapsed ? '展开' : '收起';
      });
    }
    panelEl.style.display = isEnabled() ? '' : 'none';
    mounted = true;
  }

  function bindControls(handlers = {}) {
    ensureMounted();
    const bindingMap = {
      'debug-toggle-25d': handlers.onToggle25d,
      'debug-toggle-perf': handlers.onTogglePerf,
      'debug-toggle-zones': handlers.onToggleZones,
      'debug-load-hand-status': handlers.onLoadHandStatus,
      'debug-clear-hand-status': handlers.onClearHandStatus,
      'debug-request-coach': handlers.onRequestCoach,
      'debug-clear-coach': handlers.onClearCoach,
      'debug-toggle-coach-auto': handlers.onToggleCoachAuto,
      'debug-table-mode-single': handlers.onTableModeSingle,
      'debug-table-mode-multi': handlers.onTableModeMulti,
      'debug-table-mode-clear': handlers.onTableModeClear
    };

    Object.entries(bindingMap).forEach(([id, handler]) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.onclick = typeof handler === 'function' ? handler : null;
    });
  }

  function setMainStatus(text) {
    ensureMounted();
    if (statusEl) statusEl.textContent = text;
  }

  function getPanelElement() {
    ensureMounted();
    return panelEl;
  }

  function setRuntimeStatus(text) {
    ensureMounted();
    if (runtimeStatusEl) runtimeStatusEl.textContent = text;
  }

  function setCoachStatus(text) {
    ensureMounted();
    if (coachStatusEl) coachStatusEl.textContent = text;
  }

  function setCoachDetail(text) {
    ensureMounted();
    if (coachDetailEl) coachDetailEl.textContent = text;
  }

  function setCoachRequestEnabled(enabled, label) {
    ensureMounted();
    if (!requestCoachBtn) return;
    requestCoachBtn.disabled = !enabled;
    requestCoachBtn.textContent = label || '手动请求建议';
  }

  function setCoachAutoStatus(text) {
    ensureMounted();
    if (coachAutoStatusEl) coachAutoStatusEl.textContent = text;
  }

  function setCoachAutoEnabled(enabled, label) {
    ensureMounted();
    if (!toggleCoachAutoBtn) return;
    toggleCoachAutoBtn.textContent = label || (enabled ? '关闭自动复盘' : '开启自动复盘');
    toggleCoachAutoBtn.classList.toggle('is-active', Boolean(enabled));
  }

  function syncVisibility() {
    ensureMounted();
    if (!panelEl) return;
    panelEl.style.display = isEnabled() ? '' : 'none';
  }

  global.AceMahjongDebugPanel = {
    ensureMounted,
    bindControls,
    setMainStatus,
    setRuntimeStatus,
    setCoachStatus,
    setCoachDetail,
    setCoachRequestEnabled,
    setCoachAutoStatus,
    setCoachAutoEnabled,
    getPanelElement,
    isEnabled,
    syncVisibility
  };

  ensureMounted();
})(window);
