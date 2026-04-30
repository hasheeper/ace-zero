(function(global) {
  'use strict';

  function createRuntimeStatusOverlay(options = {}) {
    const normalizeTileCodeKey = typeof options.normalizeTileCodeKey === 'function'
      ? options.normalizeTileCodeKey
      : ((code) => String(code || '').trim().toLowerCase());
    const formatWaitTileFromCode = typeof options.formatWaitTileFromCode === 'function'
      ? options.formatWaitTileFromCode
      : ((code) => ({ text: String(code || '').trim() }));
    const getSnapshot = typeof options.getSnapshot === 'function'
      ? options.getSnapshot
      : (() => null);
    const layer = options.layer || document.getElementById('debug-hand-status-layer');

    let baseOverlayState = {
      visible: false,
      tenpai: null,
      furiten: null,
      pao: null,
      kuikae: []
    };
    let runtimeOverlayState = {
      visible: false,
      tenpai: null,
      furiten: null,
      pao: null,
      kuikae: []
    };
    let overlayNodes = null;
    let bladeState = {
      tenpai: { phase: 'hidden', holdTimer: null, exitTimer: null, lastKey: '' },
      furiten: { phase: 'hidden', holdTimer: null, exitTimer: null, lastKey: '' },
      pao: { phase: 'hidden', holdTimer: null, exitTimer: null, lastKey: '' }
    };

    function normalizeHandStatusWait(wait) {
      if (wait == null) return null;
      if (typeof wait === 'string') {
        const trimmed = wait.trim();
        return trimmed ? { text: trimmed } : null;
      }
      const text = String(wait.text || '').trim();
      const rank = String(wait.rank || '').trim();
      const suit = String(wait.suit || '').trim();
      if (!text && !rank && !suit) return null;
      return {
        text: text || '',
        rank: rank || '',
        suit: suit || ''
      };
    }

    function normalizeHandStatusBlock(value, defaults = {}) {
      if (!value) return null;
      if (value === true) {
        return {
          active: true,
          title: defaults.title || '',
          targetText: defaults.targetText || '',
          countText: defaults.countText || '',
          waits: []
        };
      }
      if (typeof value !== 'object') return null;
      const waits = Array.isArray(value.waits)
        ? value.waits.map(normalizeHandStatusWait).filter(Boolean)
        : [];
      return {
        active: value.active !== false,
        title: String(value.title || defaults.title || '').trim(),
        targetText: String(value.targetText || defaults.targetText || '').trim(),
        countText: String(value.countText || defaults.countText || '').trim(),
        waits
      };
    }

    function normalizeHandStatusOverlayState(nextState = {}) {
      const tenpai = normalizeHandStatusBlock(nextState.tenpai, { title: '听牌' });
      const furiten = normalizeHandStatusBlock(nextState.furiten, { title: '振听' });
      const pao = normalizeHandStatusBlock(nextState.pao, { title: '包解' });
      const kuikae = Array.isArray(nextState.kuikae)
        ? nextState.kuikae.map(normalizeTileCodeKey).filter(Boolean)
        : [];
      const visible = nextState.visible !== false && Boolean(
        (tenpai && tenpai.active)
        || (furiten && furiten.active)
        || (pao && pao.active)
        || kuikae.length
      );
      return {
        visible,
        tenpai: tenpai && tenpai.active ? tenpai : null,
        furiten: furiten && furiten.active ? furiten : null,
        pao: pao && pao.active ? pao : null,
        kuikae
      };
    }

    function cloneHandStatusOverlayState(state = baseOverlayState) {
      return {
        visible: Boolean(state.visible),
        tenpai: state.tenpai
          ? {
              ...state.tenpai,
              waits: (state.tenpai.waits || []).map((wait) => ({ ...wait }))
            }
          : null,
        furiten: state.furiten ? { ...state.furiten } : null,
        pao: state.pao ? { ...state.pao } : null,
        kuikae: Array.isArray(state.kuikae) ? state.kuikae.slice() : []
      };
    }

    function mergeHandStatusOverlayStates(baseState = {}, runtimeState = {}) {
      const base = normalizeHandStatusOverlayState(baseState);
      const runtime = normalizeHandStatusOverlayState(runtimeState);
      return normalizeHandStatusOverlayState({
        visible: base.visible || runtime.visible,
        tenpai: runtime.tenpai || base.tenpai,
        furiten: runtime.furiten || base.furiten,
        pao: runtime.pao || base.pao,
        kuikae: [...new Set([...(base.kuikae || []), ...(runtime.kuikae || [])])]
      });
    }

    function shouldHideHandStatusUi(snapshot = null) {
      const resolvedSnapshot = snapshot || getSnapshot();
      const roundResult = resolvedSnapshot && resolvedSnapshot.roundResult ? resolvedSnapshot.roundResult : null;
      return Boolean(roundResult && roundResult.type === 'hule');
    }

    function getResolvedOverlay() {
      if (shouldHideHandStatusUi()) {
        return normalizeHandStatusOverlayState({});
      }
      return mergeHandStatusOverlayStates(baseOverlayState, runtimeOverlayState);
    }

    function createRuntimeHandStatusOverlayFromSnapshot(snapshot = {}) {
      if (shouldHideHandStatusUi(snapshot)) {
        return normalizeHandStatusOverlayState({});
      }
      const bottomSeat = snapshot && snapshot.seats ? snapshot.seats.bottom : null;
      const bottomStatus = bottomSeat && bottomSeat.status ? bottomSeat.status : null;
      const interaction = snapshot && snapshot.interaction ? snapshot.interaction : null;
      const tenpaiStatus = bottomStatus && bottomStatus.tenpai ? bottomStatus.tenpai : null;
      const furiten = bottomStatus && bottomStatus.furiten
        ? bottomStatus.furiten
        : (interaction && interaction.furiten
          ? interaction.furiten
          : (bottomSeat && bottomSeat.furitenState ? bottomSeat.furitenState : null));
      const discardSelection = interaction && interaction.discardSelection ? interaction.discardSelection : null;
      const waitingTileCodes = Array.isArray(tenpaiStatus && tenpaiStatus.waitingTileCodes)
        ? [...new Set(tenpaiStatus.waitingTileCodes.map(normalizeTileCodeKey).filter(Boolean))]
        : Array.isArray(furiten && furiten.waitingTileCodes)
          ? [...new Set(furiten.waitingTileCodes.map(normalizeTileCodeKey).filter(Boolean))]
          : [];
      const tenpaiWaits = waitingTileCodes.length > 0 && waitingTileCodes.length <= 4
        ? waitingTileCodes.map(formatWaitTileFromCode).filter(Boolean)
        : [];
      const tenpaiCountText = waitingTileCodes.length > 4
        ? `${waitingTileCodes.length}面听`
        : '';
      const isFuriten = Boolean(
        furiten
        && (
          furiten.active
          || furiten.discardFuriten
          || furiten.sameTurnFuriten
          || furiten.skipRonFuriten
          || furiten.nengRong === false
        )
      );
      const bottomHandCodes = Array.isArray(bottomSeat && bottomSeat.handTiles)
        ? bottomSeat.handTiles
          .map((tile) => normalizeTileCodeKey(tile && tile.code ? tile.code : ''))
          .filter(Boolean)
        : [];
      const legalDiscardCodes = discardSelection && discardSelection.active && Array.isArray(discardSelection.legalTileCodes)
        ? discardSelection.legalTileCodes.map(normalizeTileCodeKey).filter(Boolean)
        : [];
      const kuikae = Array.isArray(bottomStatus && bottomStatus.kuikaeBlockedCodes)
        ? bottomStatus.kuikaeBlockedCodes.map(normalizeTileCodeKey).filter(Boolean)
        : (discardSelection && discardSelection.active && legalDiscardCodes.length
          ? [...new Set(bottomHandCodes.filter((code) => !legalDiscardCodes.includes(code)))]
          : []);
      return normalizeHandStatusOverlayState({
        tenpai: ((tenpaiStatus && tenpaiStatus.active) || waitingTileCodes.length)
          ? {
              waits: tenpaiWaits,
              countText: tenpaiCountText
            }
          : null,
        furiten: isFuriten ? true : null,
        kuikae
      });
    }

    function renderHandStatusWait(wait = {}) {
      if (wait.text) {
        return `<span class="wait-tile">${wait.text}</span>`;
      }
      const rank = String(wait.rank || '').trim();
      const suit = String(wait.suit || '').trim();
      return `<span class="wait-tile">${rank}${suit ? `<span class="suit">${suit}</span>` : ''}</span>`;
    }

    function clearBladeTimer(bladeKey, timerKey) {
      const blade = bladeState[bladeKey];
      if (!blade || !blade[timerKey]) return;
      clearTimeout(blade[timerKey]);
      blade[timerKey] = null;
    }

    function clearBladeTimers(bladeKey) {
      clearBladeTimer(bladeKey, 'holdTimer');
      clearBladeTimer(bladeKey, 'exitTimer');
    }

    function createWaitMarkup(block) {
      if (!block || !Array.isArray(block.waits) || !block.waits.length) return '';
      return `${block.waits.map(renderHandStatusWait).join('<span class="wait-separator">/</span>')}${block.countText ? `<span class="wait-count">${block.countText}</span>` : ''}`;
    }

    function getBladeMarkupKey(block) {
      return JSON.stringify(block || null);
    }

    function ensureOverlayNodes() {
      if (!layer) return null;
      if (overlayNodes) return overlayNodes;
      layer.innerHTML = [
        '<div class="hand-meta-bar">',
        '  <div class="ink-blade status-tenpai" data-status-blade="tenpai">',
        '    <div class="ink-blade-bg"></div>',
        '    <div class="sharp-line top"></div>',
        '    <div class="blade-title"></div>',
        '    <div class="tenpai-waits"></div>',
        '    <div class="sharp-line bottom"></div>',
        '  </div>',
        '  <div class="right-status-stack">',
        '    <div class="ink-blade status-pao" data-status-blade="pao">',
        '      <div class="ink-blade-bg"></div>',
        '      <div class="sharp-line top"></div>',
        '      <div class="blade-title"></div>',
        '      <div class="pao-target"></div>',
        '      <div class="sharp-line bottom"></div>',
        '    </div>',
        '    <div class="ink-blade status-furiten" data-status-blade="furiten">',
        '      <div class="ink-blade-bg"></div>',
        '      <div class="sharp-line top" style="left: -20vw; right: -5vw;"></div>',
        '      <div class="blade-title"></div>',
        '      <div class="sharp-line bottom" style="left: -5vw; right: -20vw;"></div>',
        '    </div>',
        '  </div>',
        '</div>'
      ].join('');

      overlayNodes = {
        bar: layer.querySelector('.hand-meta-bar'),
        tenpai: layer.querySelector('[data-status-blade="tenpai"]'),
        pao: layer.querySelector('[data-status-blade="pao"]'),
        furiten: layer.querySelector('[data-status-blade="furiten"]')
      };
      return overlayNodes;
    }

    function setBladePhase(bladeEl, phase) {
      if (!bladeEl) return;
      bladeEl.classList.remove('is-entering', 'is-holding', 'is-exiting');
      if (phase === 'entering') bladeEl.classList.add('is-entering');
      if (phase === 'holding') bladeEl.classList.add('is-holding');
      if (phase === 'exiting') bladeEl.classList.add('is-exiting');
    }

    function updateBladeContent(bladeKey, block) {
      const nodes = ensureOverlayNodes();
      const bladeEl = nodes && nodes[bladeKey] ? nodes[bladeKey] : null;
      if (!bladeEl) return;
      const titleEl = bladeEl.querySelector('.blade-title');
      const waitsEl = bladeEl.querySelector('.tenpai-waits');
      const targetEl = bladeEl.querySelector('.pao-target');
      if (titleEl) {
        const title = block && block.title
          ? block.title
          : (bladeKey === 'tenpai' ? '听牌' : bladeKey === 'furiten' ? '振听' : '包解');
        titleEl.textContent = title;
      }
      if (waitsEl) {
        waitsEl.innerHTML = block ? createWaitMarkup(block) : '';
      }
      if (targetEl) {
        targetEl.textContent = block && block.targetText ? block.targetText : '';
      }
    }

    function setBladeVisible(bladeKey, block, visible) {
      const nodes = ensureOverlayNodes();
      const bladeEl = nodes && nodes[bladeKey] ? nodes[bladeKey] : null;
      const blade = bladeState[bladeKey];
      if (!bladeEl || !blade) return;

      if (visible) {
        const nextKey = getBladeMarkupKey(block);
        clearBladeTimer(bladeKey, 'exitTimer');
        updateBladeContent(bladeKey, block);

        const shouldRestart = blade.phase === 'hidden' || blade.phase === 'exiting' || blade.lastKey !== nextKey;
        blade.lastKey = nextKey;
        if (shouldRestart) {
          clearBladeTimer(bladeKey, 'holdTimer');
          setBladePhase(bladeEl, null);
          void bladeEl.offsetWidth;
          blade.phase = 'entering';
          setBladePhase(bladeEl, 'entering');
          blade.holdTimer = setTimeout(() => {
            blade.holdTimer = null;
            if (blade.phase !== 'entering') return;
            blade.phase = 'holding';
            setBladePhase(bladeEl, 'holding');
          }, 750);
          return;
        }

        if (blade.phase === 'entering') {
          return;
        }

        if (blade.phase !== 'holding') {
          blade.phase = 'holding';
          setBladePhase(bladeEl, 'holding');
        }
        return;
      }

      if (blade.phase === 'hidden' || blade.phase === 'exiting') {
        return;
      }
      clearBladeTimer(bladeKey, 'holdTimer');
      blade.phase = 'exiting';
      setBladePhase(bladeEl, 'exiting');
      blade.exitTimer = setTimeout(() => {
        blade.exitTimer = null;
        blade.phase = 'hidden';
        blade.lastKey = '';
        setBladePhase(bladeEl, null);
        if (bladeKey === 'tenpai') {
          updateBladeContent(bladeKey, null);
        } else if (bladeKey === 'pao') {
          updateBladeContent(bladeKey, null);
        }
        updateLayerVisibility();
      }, 460);
    }

    function updateLayerVisibility() {
      if (!layer) return;
      const hasVisibleBlade = Object.values(bladeState).some((blade) => blade.phase !== 'hidden');
      layer.classList.toggle('is-visible', hasVisibleBlade);
      layer.classList.toggle('is-hiding', false);
    }

    function render() {
      if (!layer) return;
      const state = getResolvedOverlay();
      const hasTenpai = Boolean(state.tenpai && state.tenpai.active);
      const hasFuriten = Boolean(state.furiten && state.furiten.active);
      const hasPao = Boolean(state.pao && state.pao.active);
      ensureOverlayNodes();
      setBladeVisible('tenpai', state.tenpai, hasTenpai);
      setBladeVisible('pao', state.pao, hasPao);
      setBladeVisible('furiten', state.furiten, hasFuriten);
      updateLayerVisibility();
    }

    function getHandStatusKuikaeCodeSet() {
      const resolvedState = getResolvedOverlay();
      return new Set((resolvedState.kuikae || []).map(normalizeTileCodeKey).filter(Boolean));
    }

    function applyToTiles(tiles = [], options = {}) {
      if ((options.seatKey || '') !== 'bottom') return tiles;
      const kuikaeCodes = getHandStatusKuikaeCodeSet();
      if (!kuikaeCodes.size) return tiles;
      return tiles.map((tile) => {
        const codeKey = normalizeTileCodeKey(tile && tile.code ? tile.code : '');
        if (!codeKey || !kuikaeCodes.has(codeKey)) return tile;
        return {
          ...tile,
          extraClass: `${tile && tile.extraClass ? `${tile.extraClass} ` : ''}tile-kuikae`.trim()
        };
      });
    }

    function syncFromSnapshot(snapshot = {}) {
      runtimeOverlayState = createRuntimeHandStatusOverlayFromSnapshot(snapshot);
      return cloneHandStatusOverlayState(runtimeOverlayState);
    }

    function setBaseOverlay(nextState = {}) {
      baseOverlayState = normalizeHandStatusOverlayState(nextState);
      return cloneHandStatusOverlayState(baseOverlayState);
    }

    function clearBaseOverlay() {
      baseOverlayState = normalizeHandStatusOverlayState({});
      return cloneHandStatusOverlayState(baseOverlayState);
    }

    function clearRuntimeOverlay() {
      runtimeOverlayState = normalizeHandStatusOverlayState({});
      Object.keys(bladeState).forEach((bladeKey) => {
        clearBladeTimers(bladeKey);
        bladeState[bladeKey].phase = 'hidden';
        bladeState[bladeKey].lastKey = '';
      });
      if (layer) {
        layer.classList.remove('is-visible', 'is-hiding');
        if (overlayNodes) {
          Object.keys(overlayNodes).forEach((key) => {
            if (key === 'bar') return;
            setBladePhase(overlayNodes[key], null);
          });
        }
      }
      return cloneHandStatusOverlayState(runtimeOverlayState);
    }

    return {
      syncFromSnapshot,
      render,
      applyToTiles,
      getResolvedOverlay() {
        return cloneHandStatusOverlayState(getResolvedOverlay());
      },
      getBaseOverlay() {
        return cloneHandStatusOverlayState(baseOverlayState);
      },
      setBaseOverlay,
      clearBaseOverlay,
      clearRuntimeOverlay
    };
  }

  global.AceMahjongCreateRuntimeStatusOverlay = createRuntimeStatusOverlay;
})(window);
