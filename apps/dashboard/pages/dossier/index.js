(function () {
  'use strict';

  function getState(ctx) {
    return typeof ctx.getState === 'function' ? (ctx.getState() || {}) : {};
  }

  function setState(ctx, patch) {
    if (typeof ctx.setState === 'function') {
      ctx.setState(patch || {});
    }
  }

  function renderLogTitleHtml(ctx, title) {
    const escapeHtml = ctx.helpers.escapeHtml;
    const rawTitle = String(title || '').trim();
    return `<span class="log-title-standalone">${escapeHtml(rawTitle || 'SYSTEM IDLE')}</span><span class="cursor"></span>`;
  }

  function renderLogDescHtml(ctx, desc, character) {
    const source = String(desc || '');
    const lines = source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const safeLines = lines.length ? lines : [source.trim()];
    return safeLines.map((line, index) => {
      const bracketMatch = line.match(/^\[([^\]]+)\]\s*(.*)$/);
      if (!bracketMatch) {
        return `<div class="log-desc-line">${ctx.helpers.highlightLoreText(line, character)}</div>`;
      }

      const rawLabel = bracketMatch[1].trim();
      const content = bracketMatch[2].trim();
      const rawLabelParts = rawLabel.split('/').map((part) => part.trim()).filter(Boolean);
      const labelParts = index === 0
        ? rawLabelParts.filter((part) => !/^(T\d+|MOIRAI|CHAOS|PSYCHE|VOID)$/i.test(part))
        : rawLabelParts;
      const labelHtml = labelParts.map((part) => `<span>${ctx.helpers.escapeHtml(part).toUpperCase()}</span>`).join('<span class="log-line-dot" aria-hidden="true">·</span>');

      if (index === 0 && labelParts.length) {
        return [
          '<div class="log-desc-row">',
          `<span class="log-line-head">${labelHtml}</span>`,
          `<div class="log-line-body">${content ? ctx.helpers.highlightLoreText(content, character) : '—'}</div>`,
          '</div>'
        ].join('');
      }

      return [
        '<div class="log-desc-row">',
        `<span class="log-line-head">${labelHtml}</span>`,
        `<div class="log-line-body">${content ? ctx.helpers.highlightLoreText(content, character) : '—'}</div>`,
        '</div>'
      ].join('');
    }).join('');
  }

  function renderLogHintHtml(ctx, primary, hint) {
    const escapeHtml = ctx.helpers.escapeHtml;
    return [
      `<div class="log-desc-line">${escapeHtml(primary)}</div>`,
      hint ? `<div class="log-desc-hint">${escapeHtml(hint)}</div>` : ''
    ].join('');
  }

  function renderLogMetaHtml(ctx, meta, character) {
    const source = String(meta || '').trim();
    if (!source) return '';

    const inner = source.replace(/^\[\s*/, '').replace(/\s*\]$/, '');
    const entries = inner.split('/').map((item) => item.trim()).filter(Boolean);
    if (!entries.length) {
      return `<span class="log-meta-raw">${ctx.helpers.highlightLoreText(source, character)}</span>`;
    }

    return entries.map((entry) => {
      const pair = entry.match(/^([^:：]+)\s*[:：]\s*(.+)$/);
      if (!pair) {
        return `<span class="log-meta-item"><span class="log-meta-raw">${ctx.helpers.highlightLoreText(entry, character)}</span></span>`;
      }

      return [
        '<span class="log-meta-item">',
        `<span class="log-meta-label">${ctx.helpers.escapeHtml(pair[1].trim())}</span>`,
        `<span class="log-meta-value">${ctx.helpers.highlightLoreText(pair[2].trim(), character)}</span>`,
        '</span>'
      ].join('');
    }).join('');
  }

  function renderEncryptedLog(ctx) {
    const { domTitle, domStatus, domDesc, domMeta, logBox } = ctx.refs;
    domTitle.innerHTML = renderLogTitleHtml(ctx, 'ACCESS DENIED');
    if (domStatus) {
      domStatus.innerHTML = 'CLASSIFIED';
      domStatus.style.color = '#9a9a9a';
    }
    domDesc.innerHTML = renderLogHintHtml(ctx, 'DATA ENCRYPTED...', 'Subject not yet introduced.');
    domMeta.innerHTML = renderLogMetaHtml(ctx, '[ STATUS : CLASSIFIED ]');
    logBox.style.borderLeftColor = 'rgba(255,255,255,0.18)';
    logBox.style.setProperty('--log-accent', 'rgba(255,255,255,0.18)');
    domTitle.style.color = 'var(--log-accent)';
  }

  function renderHeader(ctx, character, isUnintroduced = false) {
    const { deckTitle } = ctx.refs;
    const suitSymbol = document.getElementById('char-suit-symbol');
    document.getElementById('char-watermark').textContent = isUnintroduced ? 'UNKNOWN' : (character.watermark || character.name);
    document.getElementById('char-subtitle').textContent = isUnintroduced ? 'DATA ENCRYPTED' : (character.subtitle || '');
    document.getElementById('char-attr').textContent = isUnintroduced ? 'UNKNOWN' : (character.attribute || '');
    document.getElementById('char-name').textContent = isUnintroduced ? '???' : String(character.name || '').toUpperCase();
    document.getElementById('char-level').textContent = isUnintroduced ? '?' : (character.level ?? 0);

    if (suitSymbol) {
      suitSymbol.textContent = isUnintroduced ? '?' : (character.suitSymbol || '♥');
      suitSymbol.className = isUnintroduced ? 'sub-heart' : `sub-heart suit-${character.suitClass || 'heart'}`;
    }

    const resource = character.variables?.resource || {};
    document.getElementById('resource-label').textContent = isUnintroduced ? 'UNKNOWN' : (resource.label || 'FORTUNE');
    document.getElementById('resource-current').textContent = isUnintroduced ? '?' : (resource.current ?? 0);
    document.getElementById('resource-max').textContent = isUnintroduced ? '?' : (resource.max ?? 0);
    deckTitle.textContent = isUnintroduced ? 'Access Denied' : (character.deckTitle || 'Active Protocols');
  }

  function renderHeroStatusBlock(ctx, character) {
    const { statusBlock } = ctx.refs;
    const escapeHtml = ctx.helpers.escapeHtml;
    const hb = character.heroBlock || {};
    const debt = hb.debt || {};
    const assets = hb.assets || {};
    const gold = assets.gold || {};
    const silver = assets.silver || {};
    const resource = character.variables?.resource || {};
    const manaCur = Math.max(0, Math.round(Number(resource.current) || 0));
    const manaMax = Math.max(0, Math.round(Number(resource.max) || 0));

    statusBlock.innerHTML = `
      <div class="hero-status-block">
        ${debt.valueText ? `
        <div class="hero-debt">
          <div class="hero-debt-header">${escapeHtml(debt.headerLabel || 'DEBT')}</div>
          <div class="hero-debt-row">
            <span class="hero-debt-number">${escapeHtml(debt.valueText)}</span>
            <span class="hero-debt-unit">${escapeHtml(debt.unit || '')}</span>
          </div>
          <div class="hero-debt-lock">${escapeHtml(debt.lockText || '')}</div>
        </div>` : ''}
        ${(gold.value || silver.value) ? `
        <div class="hero-assets">
          <div class="hero-asset hero-asset-gold">
            <div class="hero-asset-label">${escapeHtml(gold.label || 'GOLD')}<span class="cn">${escapeHtml(gold.cn || '')}</span></div>
            <div class="hero-asset-val">${escapeHtml(gold.value || '0')}<span class="hero-asset-unit">${escapeHtml(gold.unit || '')}</span></div>
          </div>
          <div class="hero-asset hero-asset-silver">
            <div class="hero-asset-label">${escapeHtml(silver.label || 'DECIMAL')}<span class="cn">${escapeHtml(silver.cn || '')}</span></div>
            <div class="hero-asset-val">${escapeHtml(silver.value || '.00')}<span class="hero-asset-unit">${escapeHtml(silver.unit || '')}</span></div>
          </div>
        </div>` : ''}
      </div>
    `;
  }

  function renderStatusBlock(ctx, character, isUnintroduced = false) {
    const { statusBlock } = ctx.refs;
    const { getMetricScore, getPhaseInfo, renderStatusRow } = ctx.helpers;

    if (character && character.heroBlock) {
      renderHeroStatusBlock(ctx, character);
      return;
    }

    if (isUnintroduced) {
      statusBlock.innerHTML = `
        <div class="status-row is-encrypted">
          <div class="s-header">
            <div class="s-title-group">
              <div class="s-label">状态</div>
              <div class="label-en">STATUS</div>
              <div class="title-sep" aria-hidden="true">·</div>
              <div class="phase-zh">数据已加密</div>
              <div class="phase-en">ENCRYPTED</div>
            </div>
            <div class="s-perc">??%</div>
          </div>
          <div class="track-thin is-encrypted"><div class="fill" style="width: 0%;"></div><div class="nodes"></div></div>
        </div>

        <div class="status-row is-encrypted">
          <div class="s-header inversion">
            <div class="s-title-group">
              <div class="s-label">专属状态</div>
              <div class="label-en">EXCLUSIVE</div>
              <div class="title-sep" aria-hidden="true">·</div>
              <div class="phase-zh">机密</div>
              <div class="phase-en">CLASSIFIED</div>
            </div>
            <div class="s-perc">??%</div>
          </div>
          <div class="track-segmented is-encrypted"><div class="fill" style="width: 0%;"></div><div class="grid-cuts"><div></div><div></div><div></div><div></div><div></div></div></div>
        </div>
      `;
      return;
    }

    const common = character.variables?.common || {};
    const exclusive = character.variables?.exclusive || {};
    const commonValue = getMetricScore(common);
    const exclusiveValue = getMetricScore(exclusive);
    const commonPhaseInfo = getPhaseInfo(commonValue, common.phases || []);
    const exclusivePhaseInfo = getPhaseInfo(exclusiveValue, exclusive.phases || []);

    statusBlock.innerHTML = [
      renderStatusRow(common, commonValue, commonPhaseInfo, {
        color: common.color || '#aaa'
      }),
      renderStatusRow(exclusive, exclusiveValue, exclusivePhaseInfo, {
        color: exclusive.color || 'var(--semantic-exclusive)',
        segmented: true,
        headerClass: 'inversion',
        phaseLabelZh: exclusivePhaseInfo.phase.name || '',
        phaseLabelEn: String(exclusivePhaseInfo.phase.english || '').replace(/^Inversion\s+/i, '')
      })
    ].join('');
  }

  function renderCards(ctx, character, isUnintroduced = false) {
    const { cmdGrid } = ctx.refs;
    const { svgLibrary } = ctx.data;
    const { renderEncryptedLog, showLog, clearLog, updateCardLockState } = ctx.actions;
    const nextState = getState(ctx);

    if (isUnintroduced) {
      nextState.logData = {};
      cmdGrid.innerHTML = `
        <div class="cmd-card locked"><span class="cmd-type">ENCRYPTED</span><span class="cmd-name">DATA CORRUPT</span></div>
        <div class="cmd-card locked"><span class="cmd-type">ENCRYPTED</span><span class="cmd-name">CLASSIFIED</span></div>
        <div class="cmd-card locked"><span class="cmd-type">ENCRYPTED</span><span class="cmd-name">???</span></div>
      `;
      nextState.cmdCards = Array.from(cmdGrid.querySelectorAll('.cmd-card'));
      setState(ctx, { logData: nextState.logData, cmdCards: nextState.cmdCards });
      renderEncryptedLog();
      return;
    }

    const abilities = [...(character.traits || []), ...(character.skills || [])];
    const logData = Object.fromEntries(abilities.map((item) => [item.id, item]));

    cmdGrid.innerHTML = abilities.map((item) => `
      <div class="cmd-card ${item.kind || 'skill'} accent-${item.accent || 'skill'}${item.attrClass ? ` attr-${item.attrClass}` : ''}" data-log-id="${item.id}">
        <span class="cmd-type">${item.type}</span>
        <span class="cmd-name">${item.name}</span>
        ${item.svgId && svgLibrary[item.svgId] ? `<div class="bg-svg-slot" data-svg-id="${item.svgId}" aria-hidden="true"></div>` : ''}
      </div>
    `).join('');

    cmdGrid.querySelectorAll('[data-svg-id]').forEach((slot) => {
      const svgId = slot.dataset.svgId;
      if (svgLibrary[svgId]) slot.innerHTML = svgLibrary[svgId];
    });

    const cmdCards = Array.from(cmdGrid.querySelectorAll('.cmd-card'));
    setState(ctx, { logData, cmdCards });

    cmdCards.forEach((card) => {
      const id = card.dataset.logId;
      card.addEventListener('mouseover', () => showLog(id));
      card.addEventListener('mouseout', () => clearLog());
      card.addEventListener('click', () => window.toggleLog(id));
    });

    updateCardLockState();
  }

  function updateCardLockState(ctx) {
    const { cmdCards = [], lockedLogId = null } = getState(ctx);
    cmdCards.forEach((card) => {
      card.classList.toggle('locked', card.dataset.logId === lockedLogId);
    });
  }

  function resetDepthEffect(ctx) {
    const { visualStage, terminalPanel } = ctx.refs;
    if (visualStage) {
      visualStage.style.transform = '';
      visualStage.style.opacity = '1';
    }
    if (terminalPanel) {
      terminalPanel.style.opacity = '1';
      terminalPanel.style.transform = '';
    }
  }

  function syncDepthEffect(ctx) {
    const { visualStage, terminalPanel, mobileSpacer, detailsGroup, headerBlock, metaBox, terminalBg } = ctx.refs;
    const { isSheetLayout } = ctx.helpers;

    if (!visualStage || !terminalPanel || !mobileSpacer) return;

    if (!isSheetLayout()) {
      resetDepthEffect(ctx);
      if (detailsGroup) {
        detailsGroup.style.opacity = '1';
        detailsGroup.style.pointerEvents = 'auto';
      }
      if (headerBlock) headerBlock.style.opacity = '1';
      if (metaBox) {
        metaBox.style.opacity = '1';
        metaBox.style.pointerEvents = 'auto';
      }
      if (terminalBg) terminalBg.style.opacity = '1';
      return;
    }

    const scrollY = window.scrollY || window.pageYOffset;
    const maxScroll = Math.max(mobileSpacer.offsetHeight || 0, window.innerHeight * 0.68);
    const progress = Math.min(Math.max(scrollY / maxScroll, 0), 1);

    const stageScale = 1 - (0.04 * progress);
    const stageOpacity = 1 - (0.35 * progress);
    visualStage.style.transform = `scale(${stageScale})`;
    visualStage.style.opacity = stageOpacity;

    const panelLift = (1 - progress) * 15;
    terminalPanel.style.transform = `translateY(${panelLift}px)`;
    terminalPanel.style.opacity = '1';

    if (terminalBg) {
      terminalBg.style.opacity = Math.pow(progress, 1.5).toFixed(3);
    }

    if (headerBlock) {
      const headerOp = 0.65 + (0.35 * Math.pow(progress, 0.5));
      headerBlock.style.opacity = headerOp.toFixed(3);
    }

    let detailsOp = 0;
    if (progress > 0.2) {
      detailsOp = (progress - 0.2) / 0.8;
    }

    if (metaBox) {
      metaBox.style.opacity = detailsOp.toFixed(3);
      metaBox.style.pointerEvents = detailsOp < 0.05 ? 'none' : 'auto';
    }

    if (detailsGroup) {
      detailsGroup.style.opacity = detailsOp.toFixed(3);
      detailsGroup.style.pointerEvents = detailsOp < 0.05 ? 'none' : 'auto';
    }
  }

  function getCurrentCharacter(ctx) {
    const { characters, rosterCharacters } = ctx.data;
    const { currentCharacterKey } = getState(ctx);
    return characters[ctx.helpers.normalizeDashboardKey(currentCharacterKey)] || rosterCharacters[0] || Object.values(characters)[0] || null;
  }

  function updateRosterActiveState(ctx) {
    const { rosterItems = [], currentCharacterKey } = getState(ctx);
    rosterItems.forEach((item) => {
      item.classList.toggle('active', item.dataset.characterKey === currentCharacterKey);
    });
  }

  function updateRosterArrowsState(ctx) {
    const { btnLeft, btnRight } = ctx.refs;
    const { rosterCharacters } = ctx.data;
    const { currentCharacterKey } = getState(ctx);
    if (!btnLeft || !btnRight || !rosterCharacters.length) return;

    const currentIndex = rosterCharacters.findIndex((character) => character.key === currentCharacterKey);
    btnLeft.classList.toggle('disabled', currentIndex <= 0);
    btnRight.classList.toggle('disabled', currentIndex >= rosterCharacters.length - 1);
  }

  function centerRosterElement(ctx, element, behavior = 'smooth') {
    const { rosterTrack } = ctx.refs;
    if (!rosterTrack || !element) return;

    const state = getState(ctx);
    const containerCenter = rosterTrack.clientWidth / 2;
    const itemCenter = element.offsetLeft + (element.offsetWidth / 2);
    rosterTrack.scrollTo({ left: itemCenter - containerCenter, behavior });
    setState(ctx, { ignoreRosterScroll: true });

    if (state.rosterScrollReleaseTimer) {
      window.clearTimeout(state.rosterScrollReleaseTimer);
    }

    const nextTimer = window.setTimeout(() => {
      setState(ctx, { ignoreRosterScroll: false });
    }, behavior === 'auto' ? 40 : 420);

    setState(ctx, { rosterScrollReleaseTimer: nextTimer });
  }

  function centerRosterByKey(ctx, key, behavior = 'smooth') {
    const normalizedKey = ctx.helpers.normalizeDashboardKey(key);
    const { rosterItems = [] } = getState(ctx);
    const element = rosterItems.find((item) => ctx.helpers.normalizeDashboardKey(item.dataset.characterKey) === normalizedKey);
    if (element) centerRosterElement(ctx, element, behavior);
  }

  function showLog(ctx, id) {
    const { domTitle, domStatus, domDesc, domMeta, logBox } = ctx.refs;
    const { lockedLogId = null, logData = {} } = getState(ctx);
    if (lockedLogId && lockedLogId !== id) return;

    const data = logData[id];
    if (!data) return;

    const tones = ctx.helpers.getItemToneColors(data);
    const character = getCurrentCharacter(ctx);
    domTitle.innerHTML = renderLogTitleHtml(ctx, data.title);
    if (domStatus) {
      domStatus.innerHTML = 'DECRYPTED';
      domStatus.style.color = tones.text;
    }
    domDesc.innerHTML = renderLogDescHtml(ctx, data.desc, character);
    domMeta.innerHTML = renderLogMetaHtml(ctx, data.meta, character);
    logBox.style.borderLeftColor = tones.border;
    logBox.style.setProperty('--log-accent', tones.border);
    domTitle.style.color = 'var(--log-accent)';
  }

  function clearLog(ctx) {
    const { domTitle, domStatus, domDesc, domMeta, logBox } = ctx.refs;
    const { lockedLogId = null, currentCharacterKey } = getState(ctx);
    if (lockedLogId) return;

    if (ctx.actions.checkIsUnintroduced(currentCharacterKey)) {
      renderEncryptedLog(ctx);
      return;
    }

    domTitle.innerHTML = renderLogTitleHtml(ctx, 'SYSTEM IDLE');
    if (domStatus) {
      domStatus.innerHTML = 'AWAITING';
      domStatus.style.color = 'var(--gold-dim)';
    }
    domDesc.innerHTML = renderLogHintHtml(ctx, 'AWAITING DIRECTIVE...', 'Hover or Tap protocol to decrypt.');
    domMeta.innerHTML = '';
    logBox.style.borderLeftColor = 'var(--gold-dim)';
    logBox.style.setProperty('--log-accent', 'var(--gold-dim)');
    domTitle.style.color = 'var(--log-accent)';
  }

  function triggerRosterChange(ctx, element, options = {}) {
    if (!element) return;
    const key = element.dataset.characterKey;
    if (!key) return;

    const shouldCenter = options.center !== false;
    const behavior = options.behavior || 'smooth';
    const { currentCharacterKey } = getState(ctx);

    if (key !== currentCharacterKey) {
      activateCharacter(ctx, key, { centerDock: false });
    }

    if (shouldCenter) centerRosterElement(ctx, element, behavior);
  }

  function findClosestRosterItem(ctx) {
    const { rosterTrack } = ctx.refs;
    const { rosterItems = [] } = getState(ctx);
    if (!rosterTrack || !rosterItems.length) return null;

    const scrollCenter = rosterTrack.scrollLeft + (rosterTrack.clientWidth / 2);
    let closestItem = null;
    let minDiff = Number.POSITIVE_INFINITY;

    rosterItems.forEach((item) => {
      const itemCenter = item.offsetLeft + (item.offsetWidth / 2);
      const diff = Math.abs(scrollCenter - itemCenter);
      if (diff < minDiff) {
        minDiff = diff;
        closestItem = item;
      }
    });

    return closestItem;
  }

  function renderRosterDock(ctx) {
    const { rosterTrack, btnLeft, btnRight } = ctx.refs;
    const { rosterCharacters } = ctx.data;
    const { getCharacterDashboardStatus, escapeHtml } = ctx.helpers;
    const { currentCharacterKey } = getState(ctx);
    if (!rosterTrack || !rosterCharacters.length) return;

    const visibleCharacters = rosterCharacters.filter((character) => {
      if (character.key === 'kazu') return true;
      return character.dashboardState?.activated !== false;
    });

    rosterTrack.innerHTML = visibleCharacters.map((character) => {
      const statusObj = getCharacterDashboardStatus(character.key);
      const toneClass = ` tone-${statusObj.tone}`;
      const isUnintroduced = statusObj.tone === 'unintroduced';
      const displayName = isUnintroduced ? '???' : character.name;
      const ariaLabel = isUnintroduced ? 'Switch to unknown character' : `Switch to ${character.name}`;

      const avatarSrc = character.avatarUrl || character.portraitUrl || '';
      const noImageClass = avatarSrc ? '' : ' no-image';
      const avatarBody = avatarSrc
        ? `<img src="${escapeHtml(avatarSrc)}" alt="${escapeHtml(displayName)}">`
        : `<span class="char-avatar-text">${escapeHtml((displayName || '?').charAt(0).toUpperCase())}</span>`;

      return `
      <button class="char-avatar${toneClass}${noImageClass}${character.key === currentCharacterKey ? ' active' : ''}" type="button" data-character-key="${character.key}" aria-label="${escapeHtml(ariaLabel)}">
        <span class="char-label">${escapeHtml(displayName)}</span>
        ${avatarBody}
      </button>
    `;
    }).join('');

    const rosterItems = Array.from(rosterTrack.querySelectorAll('.char-avatar'));
    setState(ctx, { rosterItems });

    rosterItems.forEach((item) => {
      item.addEventListener('click', () => triggerRosterChange(ctx, item, { center: true, behavior: 'smooth' }));
    });

    if (btnLeft && btnLeft.dataset.bound !== '1') {
      btnLeft.dataset.bound = '1';
      btnLeft.addEventListener('click', () => {
        const latestState = getState(ctx);
        const currentIndex = latestState.rosterItems.findIndex((item) => item.dataset.characterKey === latestState.currentCharacterKey);
        const previous = latestState.rosterItems[currentIndex - 1];
        if (previous) triggerRosterChange(ctx, previous, { center: true, behavior: 'smooth' });
      });
    }

    if (btnRight && btnRight.dataset.bound !== '1') {
      btnRight.dataset.bound = '1';
      btnRight.addEventListener('click', () => {
        const latestState = getState(ctx);
        const currentIndex = latestState.rosterItems.findIndex((item) => item.dataset.characterKey === latestState.currentCharacterKey);
        const next = latestState.rosterItems[currentIndex + 1];
        if (next) triggerRosterChange(ctx, next, { center: true, behavior: 'smooth' });
      });
    }

    if (rosterTrack.dataset.bound !== '1') {
      rosterTrack.dataset.bound = '1';
      rosterTrack.addEventListener('scroll', () => {
        const latestState = getState(ctx);
        if (latestState.ignoreRosterScroll) return;
        const closest = findClosestRosterItem(ctx);
        if (closest && closest.dataset.characterKey !== latestState.currentCharacterKey) {
          activateCharacter(ctx, closest.dataset.characterKey, { centerDock: false });
        }
      }, { passive: true });
    }

    requestAnimationFrame(() => {
      updateRosterActiveState(ctx);
      updateRosterArrowsState(ctx);
      centerRosterByKey(ctx, currentCharacterKey, 'auto');
    });
  }

  function activateCharacter(ctx, key, options = {}) {
    const normalizedKey = ctx.helpers.normalizeDashboardKey(key);
    const { characters } = ctx.data;
    const character = characters[normalizedKey];
    if (!character) return;

    const { centerDock = false, dockBehavior = 'smooth' } = options;
    const isUnintroduced = ctx.actions.checkIsUnintroduced(normalizedKey);

    setState(ctx, {
      currentCharacterKey: normalizedKey,
      lockedLogId: null
    });
    window.activeDashboardCharacter = normalizedKey;

    document.body.classList.toggle('is-unintroduced', isUnintroduced);

    ctx.actions.applyTheme(character, { masked: isUnintroduced });
    if (isUnintroduced) {
      document.title = 'TERMINAL // UNKNOWN DOSSIER';
    }
    ctx.actions.syncBgmCharacter(normalizedKey);
    renderHeader(ctx, character, isUnintroduced);
    renderStatusBlock(ctx, character, isUnintroduced);
    renderCards(ctx, character, isUnintroduced);
    updateCardLockState(ctx);
    clearLog(ctx);
    updateRosterActiveState(ctx);
    updateRosterArrowsState(ctx);
    syncDepthEffect(ctx);

    if (centerDock) {
      centerRosterByKey(ctx, normalizedKey, dockBehavior);
    }
  }

  window.ACE0DashboardDossierPage = {
    renderEncryptedLog,
    renderHeader,
    renderHeroStatusBlock,
    renderStatusBlock,
    renderCards,
    updateCardLockState,
    resetDepthEffect,
    syncDepthEffect,
    getCurrentCharacter,
    updateRosterActiveState,
    updateRosterArrowsState,
    centerRosterElement,
    centerRosterByKey,
    showLog,
    clearLog,
    triggerRosterChange,
    findClosestRosterItem,
    renderRosterDock,
    activateCharacter
  };
})();
