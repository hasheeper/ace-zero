(function(global) {
  'use strict';

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function createSettlementPanel(options = {}) {
    const root = options.root || document.body;
    const assetBase = String(options.assetBase || '../../assets').replace(/\/$/, '');
    const tileAssetBase = `${assetBase}/riichi-mahjong-tiles`;
    let continueHandler = typeof options.onContinue === 'function' ? options.onContinue : null;
    let currentViewModel = null;
    let pendingOpenFrameId = 0;
    let skipArmAt = 0;

    const overlay = document.createElement('div');
    overlay.className = 'settlement-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    root.appendChild(overlay);

    function buildOverlayMarkup() {
      return [
      '<div class="backdrop"></div>',
      '<div class="result-stage">',
      '  <div class="board-header">',
      '    <div id="settlement-win-title" class="win-title"></div>',
      '    <div class="winner-badge">',
      '      <div class="wb-meta">',
      '        <span class="wb-en">和牌者</span>',
      '      </div>',
      '      <div id="settlement-winner-name" class="wb-name"></div>',
      '    </div>',
      '  </div>',
      '  <div class="unified-board">',
      '    <div class="board-hand">',
      '      <div class="hand-spotlight"></div>',
      '      <div class="tile-row">',
      '        <div id="result-hand" class="tile-render-list" aria-label="和牌手牌"></div>',
      '        <div class="winning-gap" aria-hidden="true"></div>',
      '        <div id="winning-tile" class="tile-render-list" aria-label="和了牌"></div>',
      '      </div>',
      '      <div class="area-divider"></div>',
      '      <div class="dora-row">',
      '        <div class="dora-group">',
      '          <div class="dora-lbl">表宝牌</div>',
      '          <div id="omote-dora" class="dora-tiles" aria-label="表宝牌"></div>',
      '        </div>',
      '        <div class="dora-group">',
      '          <div class="dora-lbl">里宝牌</div>',
      '          <div id="ura-dora" class="dora-tiles" aria-label="里宝牌"></div>',
      '        </div>',
      '      </div>',
      '    </div>',
      '    <div class="h-divider"></div>',
      '    <div class="board-details">',
      '      <div class="detail-left">',
      '        <div id="yaku-scroll-area" class="yaku-scroll-area"></div>',
      '        <div id="yaku-total" class="yaku-total"></div>',
      '      </div>',
      '      <div class="v-divider"></div>',
      '      <div id="detail-right" class="detail-right"></div>',
      '    </div>',
      '  </div>',
      '  <div class="settlement-runtime-controls">',
      '    <div class="settlement-runtime-copy" data-settlement-runtime-copy></div>',
      '    <div class="settlement-runtime-actions">',
      '      <button type="button" class="settlement-runtime-btn is-primary" data-settlement-continue>确认</button>',
      '    </div>',
      '  </div>',
      '</div>'
      ].join('');
    }

    let titleEl = null;
    let winnerNameEl = null;
    let winnerBadgeEl = null;
    let resultHandEl = null;
    let winningTileEl = null;
    let omoteDoraEl = null;
    let uraDoraEl = null;
    let yakuScrollAreaEl = null;
    let yakuTotalEl = null;
    let detailRightEl = null;
    let runtimeCopyEl = null;
    let skipButton = null;
    let continueButton = null;

    function bindElements() {
      titleEl = overlay.querySelector('#settlement-win-title');
      winnerNameEl = overlay.querySelector('#settlement-winner-name');
      winnerBadgeEl = overlay.querySelector('.winner-badge');
      resultHandEl = overlay.querySelector('#result-hand');
      winningTileEl = overlay.querySelector('#winning-tile');
      omoteDoraEl = overlay.querySelector('#omote-dora');
      uraDoraEl = overlay.querySelector('#ura-dora');
      yakuScrollAreaEl = overlay.querySelector('#yaku-scroll-area');
      yakuTotalEl = overlay.querySelector('#yaku-total');
      detailRightEl = overlay.querySelector('#detail-right');
      runtimeCopyEl = overlay.querySelector('[data-settlement-runtime-copy]');
      skipButton = overlay.querySelector('[data-settlement-skip]');
      continueButton = overlay.querySelector('[data-settlement-continue]');
    }

    function attachStaticListeners() {
      if (yakuScrollAreaEl) {
        yakuScrollAreaEl.addEventListener('animationstart', (event) => {
          if (!event.target.classList.contains('y-row')) return;
          const row = event.target;
          const rowBottom = row.offsetTop + row.offsetHeight;
          const visibleBottom = yakuScrollAreaEl.scrollTop + yakuScrollAreaEl.clientHeight;
          const maskBuffer = 24;

          if (rowBottom > visibleBottom - maskBuffer) {
            yakuScrollAreaEl.scrollTo({
              top: rowBottom - yakuScrollAreaEl.clientHeight + maskBuffer,
              behavior: 'smooth'
            });
          }
        });
      }

      if (continueButton) {
        continueButton.addEventListener('pointerdown', (event) => {
          event.preventDefault();
          event.stopPropagation();
        });
        continueButton.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (typeof continueHandler === 'function') {
            continueHandler(currentViewModel);
            return;
          }
          close();
        });
      }
    }

    function rebuildOverlayDom() {
      overlay.innerHTML = buildOverlayMarkup();
      bindElements();
      attachStaticListeners();
    }

    rebuildOverlayDom();

    function cancelPendingOpenRender() {
      if (!pendingOpenFrameId) return;
      window.cancelAnimationFrame(pendingOpenFrameId);
      pendingOpenFrameId = 0;
    }

    function scheduleOpenRender(viewModel) {
      cancelPendingOpenRender();
      pendingOpenFrameId = window.requestAnimationFrame(() => {
        pendingOpenFrameId = window.requestAnimationFrame(() => {
          rebuildOverlayDom();
          render(viewModel);
          if (continueButton && typeof continueButton.focus === 'function') {
            continueButton.focus({ preventScroll: true });
          }
          pendingOpenFrameId = 0;
        });
      });
    }

    function getPrimaryWinnerViewModel(viewModel) {
      if (!viewModel || viewModel.mode !== 'multi-hule') return viewModel;
      const primaryWinner = Array.isArray(viewModel.winners) && viewModel.winners.length
        ? viewModel.winners[0]
        : null;
      return {
        ...viewModel,
        winner: primaryWinner
          ? {
              seat: primaryWinner.seat,
              name: primaryWinner.name || ''
            }
          : null,
        showWinner: false,
        handTiles: primaryWinner && Array.isArray(primaryWinner.handTiles) ? primaryWinner.handTiles : [],
        winningTile: primaryWinner && Array.isArray(primaryWinner.winningTile) ? primaryWinner.winningTile : [],
        yakuList: primaryWinner && Array.isArray(primaryWinner.yakuList) ? primaryWinner.yakuList : [],
        total: primaryWinner && primaryWinner.total ? primaryWinner.total : null
      };
    }

    function buildTimeline(viewModel) {
      const activeViewModel = getPrimaryWinnerViewModel(viewModel) || {};
      const tileRevealDuration = 0.38;
      const handCount = Array.isArray(activeViewModel.handTiles) ? activeViewModel.handTiles.length : 0;
      const winningCount = Array.isArray(activeViewModel.winningTile) ? activeViewModel.winningTile.length : 0;
      const handBase = 0.7;
      const handStep = 0.055;
      const omoteCount = Array.isArray(activeViewModel.omoteDoraTiles) ? activeViewModel.omoteDoraTiles.length : 0;
      const uraCount = Array.isArray(activeViewModel.uraDoraTiles) ? activeViewModel.uraDoraTiles.length : 0;
      const yakuCount = Array.isArray(activeViewModel.yakuList) ? activeViewModel.yakuList.length : 0;
      const handEnd = handBase + Math.max(0, (handCount - 1) * handStep) + tileRevealDuration;
      const winningBase = handEnd + (winningCount > 0 ? 0.12 : 0);
      const omoteBase = winningBase + 0.22;
      const doraStep = 0.08;
      const omoteEnd = omoteBase + Math.max(0, (omoteCount - 1) * doraStep) + tileRevealDuration;
      const uraBase = omoteEnd + 0.16;
      const uraEnd = uraBase + Math.max(0, (uraCount - 1) * doraStep) + tileRevealDuration;
      const yakuBase = uraEnd + 0.32;
      const yakuStep = 0.13;
      const yakuEnd = yakuBase + Math.max(0, (yakuCount - 1) * yakuStep) + 0.4;
      const totalDelay = yakuEnd + 0.14;
      const scoreRowDelay = totalDelay + 0.34;
      const scoreBaseDelay = scoreRowDelay + 0.14;
      const scoreRowStep = 0.16;

      return {
        handBase,
        handStep,
        winningBase,
        omoteBase,
        doraStep,
        uraBase,
        yakuBase,
        yakuStep,
        totalDelay,
        scoreRowDelay,
        scoreBaseDelay,
        scoreRowStep,
        scoreDeltaOffset: 0.1
      };
    }

    function renderTile(tile, index = 0, options = {}) {
      const safeTile = tile && typeof tile === 'object' ? tile : {};
      const scaleClass = safeTile.size === 'small' ? ' tile-scale-small' : '';
      const winningClass = String(safeTile.extraClass || '').includes('is-winning') ? ' tile-winning' : '';
      const extraClasses = String(safeTile.extraClass || '')
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token && token !== 'is-winning')
        .join(' ');
      const animationDelay = typeof options.baseDelay === 'number'
        ? `${options.baseDelay + (index * (options.stepDelay ?? 0.06))}s`
        : '0s';
      const tileMarkup = safeTile.hidden
        ? ''
        : `<img class="tile-watermark" src="${escapeHtml(`${tileAssetBase}/Black/${safeTile.asset}.svg`)}" alt="${escapeHtml(safeTile.label || safeTile.asset || '')}">`;
      return [
        `<div class="tile-motion${scaleClass}${winningClass}${extraClasses ? ` ${extraClasses}` : ''}" style="--tile-reveal-delay:${animationDelay};">`,
        `  <div class="tile-cube tile-stand${safeTile.hidden ? ' tile-flipped' : ''}">`,
        `    ${tileMarkup}`,
        '  </div>',
        '</div>'
      ].join('');
    }

    function renderTileGroup(target, tiles, options = {}) {
      if (!target) return;
      const normalizedTiles = Array.isArray(tiles) ? tiles : [];
      target.innerHTML = normalizedTiles.map((tile, index) => renderTile(tile, index, options)).join('');
    }

    function renderWinTitle(words) {
      if (!titleEl) return;
      const safeWords = Array.isArray(words) ? words : [];
      titleEl.innerHTML = safeWords.map((word, index) => {
        if (index === 0) return `<span class="w-word">${escapeHtml(word)}</span>`;
        return `<div class="w-slash"></div><span class="w-word">${escapeHtml(word)}</span>`;
      }).join('');
    }

    function renderWinnerName(winner) {
      if (!winnerNameEl) return;
      if (winnerBadgeEl) {
        winnerBadgeEl.classList.toggle('is-hidden', !winner || !winner.name);
      }
      winnerNameEl.textContent = winner && winner.name ? winner.name : '';
    }

    function renderYakuList(yakuList, yakuBase, yakuStep) {
      if (!yakuScrollAreaEl) return;
      const rows = Array.isArray(yakuList) ? yakuList : [];
      yakuScrollAreaEl.innerHTML = rows.map((yaku, index) => (
        `<div class="y-row" style="--row-delay:${(yakuBase + (index * yakuStep)).toFixed(2)}s;">` +
          `<div class="y-name">${escapeHtml(yaku && yaku.name ? yaku.name : '')}</div>` +
          `<div class="y-val">${escapeHtml(yaku && yaku.han != null ? String(yaku.han) : '')}<span>番</span></div>` +
        '</div>'
      )).join('');
    }

    function renderYakuTotal(total, delay) {
      if (!yakuTotalEl) return;
      const shouldShow = Boolean(total && total.pointText);
      yakuTotalEl.classList.toggle('is-hidden', !shouldShow);
      if (!shouldShow) {
        yakuTotalEl.innerHTML = '';
        yakuTotalEl.style.removeProperty('--total-delay');
        return;
      }
      yakuTotalEl.style.setProperty('--total-delay', `${delay.toFixed(2)}s`);
      yakuTotalEl.innerHTML = [
        `<div class="t-stamp">${escapeHtml(total.stamp || '')}</div>`,
        '<div class="t-score-wrap">',
        `  <div class="ts-han">${escapeHtml(total.han != null ? String(total.han) : '')}<span>番</span></div>`,
        `  <div class="ts-pt">${escapeHtml(total.pointText || '')}</div>`,
        `  <div class="ts-unit">${escapeHtml(total.unit || '')}</div>`,
        '</div>'
      ].join('');
    }

    function renderScoreRows(rows, scoreRowDelay, scoreBaseDelay, scoreRowStep, scoreDeltaOffset) {
      if (!detailRightEl) return;
      const scoreRows = Array.isArray(rows) ? rows : [];
      detailRightEl.innerHTML = scoreRows.map((row, index) => {
        const rowDelay = (scoreRowDelay + (index * scoreRowStep)).toFixed(2);
        const baseDelay = (scoreBaseDelay + (index * scoreRowStep)).toFixed(2);
        const deltaDelay = (scoreBaseDelay + (index * scoreRowStep) + scoreDeltaOffset).toFixed(2);
        const deltaClass = Number(row && row.delta || 0) >= 0 ? 'plus' : 'minus';
        const deltaValue = Math.abs(Number(row && row.delta || 0));
        const rowClass = row && row.winner ? 's-row winner' : 's-row';
        return [
          `<div class="${rowClass}" style="--score-row-delay:${rowDelay}s;">`,
          '  <div class="s-owner">',
          `    <div class="s-seat">${escapeHtml(row && row.seat ? row.seat : '')}</div>`,
          `    <div class="s-name">${escapeHtml(row && row.name ? row.name : '')}</div>`,
          '  </div>',
          `  <div class="s-base" style="--value-delay:${baseDelay}s;">${escapeHtml(row && row.base ? row.base : '')}</div>`,
          `  <div class="s-delta ${deltaClass}" style="--value-delay:${deltaDelay}s;">${escapeHtml(String(deltaValue))}</div>`,
          '</div>'
        ].join('');
      }).join('');
    }

    function render(viewModel) {
      currentViewModel = viewModel || null;
      const activeViewModel = getPrimaryWinnerViewModel(viewModel);
      if (yakuScrollAreaEl) {
        yakuScrollAreaEl.scrollTop = 0;
      }
      if (!activeViewModel) {
        renderWinTitle([]);
        renderWinnerName(null);
        renderTileGroup(resultHandEl, []);
        renderTileGroup(winningTileEl, []);
        renderTileGroup(omoteDoraEl, []);
        renderTileGroup(uraDoraEl, []);
        renderYakuList([], 0, 0);
        renderYakuTotal(null, 0);
        renderScoreRows([], 0, 0, 0, 0);
        if (runtimeCopyEl) runtimeCopyEl.textContent = '';
        return;
      }

      overlay.classList.remove('skip-anim');
      const timeline = buildTimeline(activeViewModel);

      renderWinTitle(activeViewModel.titleWords || []);
      renderWinnerName(activeViewModel.showWinner === false ? null : activeViewModel.winner);
      renderTileGroup(resultHandEl, activeViewModel.handTiles, { baseDelay: timeline.handBase, stepDelay: timeline.handStep });
      renderTileGroup(winningTileEl, activeViewModel.winningTile, { baseDelay: timeline.winningBase, stepDelay: 0 });
      renderTileGroup(omoteDoraEl, activeViewModel.omoteDoraTiles, { baseDelay: timeline.omoteBase, stepDelay: timeline.doraStep });
      renderTileGroup(uraDoraEl, activeViewModel.uraDoraTiles, { baseDelay: timeline.uraBase, stepDelay: timeline.doraStep });
      renderYakuList(activeViewModel.yakuList || [], timeline.yakuBase, timeline.yakuStep);
      renderYakuTotal(activeViewModel.total, timeline.totalDelay);
      renderScoreRows(
        activeViewModel.scoreRows || [],
        timeline.scoreRowDelay,
        timeline.scoreBaseDelay,
        timeline.scoreRowStep,
        timeline.scoreDeltaOffset
      );

      if (runtimeCopyEl) {
        const copyText = activeViewModel.paoSummary || activeViewModel.subtitle || '';
        runtimeCopyEl.textContent = copyText;
      }
      if (skipButton) {
        skipButton.disabled = activeViewModel.controls && activeViewModel.controls.canSkipAnimation === false;
      }
      continueButton.disabled = activeViewModel.controls && activeViewModel.controls.canContinue === false;
    }

    function open(viewModel) {
      currentViewModel = viewModel || null;
      cancelPendingOpenRender();
      overlay.classList.remove('skip-anim');
      overlay.classList.add('is-open');
      overlay.setAttribute('aria-hidden', 'false');
      skipArmAt = Date.now() + 450;
      scheduleOpenRender(viewModel);
      return currentViewModel;
    }

    function close() {
      cancelPendingOpenRender();
      skipArmAt = 0;
      const activeElement = document.activeElement;
      if (activeElement && overlay.contains(activeElement) && typeof activeElement.blur === 'function') {
        activeElement.blur();
      }
      overlay.classList.remove('is-open');
      overlay.classList.remove('skip-anim');
      overlay.setAttribute('aria-hidden', 'true');
      if (yakuScrollAreaEl) {
        yakuScrollAreaEl.scrollTop = 0;
      }
      return currentViewModel;
    }

    function skipAnimation() {
      if (!currentViewModel) return null;
      overlay.classList.add('skip-anim');
      if (yakuScrollAreaEl) {
        yakuScrollAreaEl.scrollTop = yakuScrollAreaEl.scrollHeight;
      }
      if (typeof skipHandler === 'function') {
        skipHandler(currentViewModel);
      }
      return currentViewModel;
    }

    function isOpen() {
      return overlay.classList.contains('is-open');
    }

    function setContinueHandler(handler) {
      continueHandler = typeof handler === 'function' ? handler : null;
    }

    overlay.addEventListener('click', (event) => {
      if (!isOpen()) return;
      if (event.target.closest('[data-settlement-continue]')) return;
      event.preventDefault();
      event.stopPropagation();
    });

    return {
      open,
      close,
      skipAnimation,
      isOpen,
      setContinueHandler
    };
  }

  global.AceMahjongCreateSettlementPanel = createSettlementPanel;
})(window);
