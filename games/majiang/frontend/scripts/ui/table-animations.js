(function(global) {
  'use strict';

  function createTableAnimations(deps = {}) {
    const normalizeTile = typeof deps.normalizeTile === 'function'
      ? deps.normalizeTile
      : ((tile) => tile);
    const createDisplayTileFromCode = typeof deps.createDisplayTileFromCode === 'function'
      ? deps.createDisplayTileFromCode
      : (() => null);
    const renderAll = typeof deps.renderAll === 'function'
      ? deps.renderAll
      : (() => {});
    const getInteractiveTableTiles = typeof deps.getInteractiveTableTiles === 'function'
      ? deps.getInteractiveTableTiles
      : (() => []);
    const resolveBottomHandPreviewIndices = typeof deps.resolveBottomHandPreviewIndices === 'function'
      ? deps.resolveBottomHandPreviewIndices
      : (() => []);
    const resolveRiverPreviewDescriptorId = typeof deps.resolveRiverPreviewDescriptorId === 'function'
      ? deps.resolveRiverPreviewDescriptorId
      : (() => null);

    let pendingTableAnimations = [];
    let cutInResetTimer = 0;
    let cutInExitTimer = 0;
    let activeCutIn = null;
    const pendingCutInQueue = [];
    let bottomHandActionLock = false;
    let seatHandActionLock = false;
    let winnerHandRevealState = {
      active: false,
      seatKey: 'bottom',
      winningTile: null,
      revealed: false
    };
    let winnerHandRevealTriggerTimer = 0;
    let winnerHandRevealAutoClearTimer = 0;

    function ensureCutInStructure() {
      const layer = document.getElementById('cutin-layer');
      if (!layer) return null;

      let backdropEl = layer.querySelector('.cutin-backdrop');
      if (!backdropEl) {
        backdropEl = document.createElement('div');
        backdropEl.className = 'cutin-backdrop';
        layer.appendChild(backdropEl);
      }

      let lineEl = layer.querySelector('.cutin-line');
      if (!lineEl) {
        lineEl = document.createElement('div');
        lineEl.className = 'cutin-line';
        lineEl.id = 'cutin-line';
        layer.appendChild(lineEl);
      }

      let inkEl = layer.querySelector('.cutin-ink');
      if (!inkEl) {
        inkEl = document.createElement('div');
        inkEl.className = 'cutin-ink';
        inkEl.id = 'cutin-ink';
        layer.appendChild(inkEl);
      }

      let textGroupEl = layer.querySelector('.cutin-text-group');
      if (!textGroupEl) {
        textGroupEl = document.createElement('div');
        textGroupEl.className = 'cutin-text-group';
        textGroupEl.id = 'cutin-text-group';
        layer.appendChild(textGroupEl);
      }

      let watermarkEl = textGroupEl.querySelector('.cutin-watermark');
      if (!watermarkEl) {
        watermarkEl = document.createElement('div');
        watermarkEl.className = 'cutin-watermark';
        watermarkEl.id = 'cutin-watermark';
        textGroupEl.appendChild(watermarkEl);
      }

      let textEl = textGroupEl.querySelector('.cutin-text');
      if (!textEl) {
        const existingTextEl = layer.querySelector('.cutin-text');
        if (existingTextEl && existingTextEl.parentElement !== textGroupEl) {
          textGroupEl.appendChild(existingTextEl);
          textEl = existingTextEl;
        } else {
          textEl = document.createElement('div');
          textEl.className = 'cutin-text';
          textEl.id = 'cutin-text';
          textGroupEl.appendChild(textEl);
        }
      }

      return {
        layer,
        backdropEl,
        lineEl,
        inkEl,
        textGroupEl,
        textEl,
        watermarkEl
      };
    }

    function queueTableAnimation(type, target) {
      pendingTableAnimations.push({ type, target });
    }

    function playPendingTableAnimations() {
      if (!pendingTableAnimations.length) return;
      const animationBatch = pendingTableAnimations.slice();
      pendingTableAnimations = [];

      requestAnimationFrame(() => {
        animationBatch.forEach(({ type, target }) => {
          let element = null;

          if (target && target.selector) {
            element = document.querySelector(target.selector);
          } else if (target && target.seat && target.area) {
            const seatRoot = target.seat === 'bottom'
              ? document
              : document.getElementById(`seat-${target.seat}`);
            const areaSelectorMap = {
              river: '.river-bottom .tile-cube',
              hand: '.hand-bottom .tile-cube',
              meld: '.meld-bottom .meld-group',
              kita: '.kita-strip .tile-motion'
            };
            const scopeSelector = areaSelectorMap[target.area];
            if (seatRoot && scopeSelector) {
              const tiles = seatRoot.querySelectorAll(scopeSelector);
              const tileIndex = Number.isInteger(target.tileIndex) ? target.tileIndex : tiles.length - 1;
              element = tiles[tileIndex] || tiles[tiles.length - 1] || null;
            }
          } else if (target && target.type === 'riichi-stick' && target.seat) {
            const stickId = target.seat === 'bottom' ? 'bottom-riichi-stick' : `seat-${target.seat}-riichi-stick`;
            element = document.querySelector(`#${stickId} .stick`);
          }

          if (!element) return;

          const classMap = {
            discard: 'anim-discard-in',
            meld: 'anim-meld-flash',
            flip: 'anim-flip-in',
            kita: 'anim-discard-in',
            'riichi-stick': 'anim-stick-drop'
          };

          const className = classMap[type];
          if (!className) return;

          const animationTarget = type === 'meld'
            ? element
            : (element.closest('.tile-motion') || element);
          animationTarget.classList.remove(className);
          void animationTarget.offsetWidth;
          animationTarget.classList.add(className);
          window.setTimeout(() => {
            animationTarget.classList.remove(className);
          }, 760);
        });
      });
    }

    function normalizeCutInType(actionType = '') {
      const value = String(actionType || '').toLowerCase();
      if (value.includes('round-start') || value.includes('round')) return { label: '东一局', styleType: 'normal', layout: 'round', watermarkLabel: '东一局' };
      if (value.includes('九種九牌') || value.includes('九种九牌'.toLowerCase())) return { label: '九种九牌', styleType: 'normal' };
      if (value.includes('四家立直'.toLowerCase())) return { label: '四家立直', styleType: 'alert' };
      if (value.includes('四風連打'.toLowerCase()) || value.includes('四风连打'.toLowerCase())) return { label: '四风连打', styleType: 'normal' };
      if (value.includes('四開槓'.toLowerCase()) || value.includes('四杠'.toLowerCase())) return { label: '四杠散了', styleType: 'normal' };
      if (value.includes('三家和'.toLowerCase())) return { label: '三家和', styleType: 'alert' };
      if (value.includes('荒牌平局'.toLowerCase()) || value.includes('荒牌')) return { label: '流 局', styleType: 'normal', layout: 'round', watermarkLabel: '荒牌流局' };
      if (value.includes('riichi') || value.includes('lizhi')) return { label: '立直', styleType: 'alert' };
      if (value.includes('kita') || value.includes('nuki') || value.includes('bei')) return { label: '拔北', styleType: 'normal' };
      if (value.includes('chi')) return { label: '吃', styleType: 'normal' };
      if (value.includes('peng') || value.includes('pon')) return { label: '碰', styleType: 'normal' };
      if (value.includes('kan') || value.includes('gang')) return { label: '杠', styleType: 'alert' };
      if (value.includes('tsumo') || value.includes('zimo')) return { label: '自摸', styleType: 'alert' };
      if (value.includes('ron') || value.includes('hule')) return { label: '和了', styleType: 'alert' };
      if (value.includes('draw') || value.includes('pingju') || value.includes('liuju')) {
        return { label: '流 局', styleType: 'normal', layout: 'round', watermarkLabel: '流局' };
      }
      return { label: String(actionType || '碰'), styleType: 'normal' };
    }

    function runCutIn(actionType, options = {}) {
      const structure = ensureCutInStructure();
      const layer = structure ? structure.layer : null;
      const textEl = structure ? structure.textEl : null;
      const inkEl = structure ? structure.inkEl : null;
      const watermarkEl = structure ? structure.watermarkEl : null;
      const board = document.querySelector('.board-container');
      if (!layer || !textEl || !inkEl || !board) return 0;

      const normalized = normalizeCutInType(actionType);
      const label = String(options.label || normalized.label || '碰');
      const styleType = options.styleType || normalized.styleType || 'normal';
      const layout = options.layout || normalized.layout || 'default';
      const watermarkLabel = String(options.watermarkLabel || normalized.watermarkLabel || label).trim();
      const enterDuration = Number.isFinite(Number(options.duration)) ? Number(options.duration) : (layout === 'round' ? 2000 : 940);
      const exitDuration = Number.isFinite(Number(options.exitDuration)) ? Number(options.exitDuration) : (layout === 'round' ? 500 : 0);

      window.clearTimeout(cutInResetTimer);
      window.clearTimeout(cutInExitTimer);
      layer.className = `cutin-layer cutin-type-${styleType}${layout === 'round' ? ' cutin-layout-round' : ''}`;
      textEl.textContent = label;
      if (watermarkEl) {
        watermarkEl.textContent = watermarkLabel;
      }
      textEl.classList.remove('anim-cutin');
      inkEl.classList.remove('anim-ink-burst');
      board.classList.remove('anim-board-shake');
      layer.classList.remove('is-exiting');
      void layer.offsetWidth;

      layer.classList.add('is-active');
      if (layout !== 'round') {
        textEl.classList.add('anim-cutin');
        inkEl.classList.add('anim-ink-burst');
      }
      if (options.disableShake !== true && layout !== 'round') {
        board.classList.add('anim-board-shake');
      }
      activeCutIn = {
        actionType,
        options: { ...options }
      };

      if (layout === 'round') {
        cutInExitTimer = window.setTimeout(() => {
          layer.classList.add('is-exiting');
        }, Math.max(0, enterDuration));
      }

      cutInResetTimer = window.setTimeout(() => {
        layer.classList.remove('is-active');
        layer.classList.remove('is-exiting');
        textEl.classList.remove('anim-cutin');
        inkEl.classList.remove('anim-ink-burst');
        board.classList.remove('anim-board-shake');
        activeCutIn = null;
        const nextCutIn = pendingCutInQueue.shift();
        if (nextCutIn) {
          window.setTimeout(() => {
            runCutIn(nextCutIn.actionType, nextCutIn.options);
          }, 60);
        }
      }, Math.max(enterDuration + exitDuration, layout === 'round' ? 2500 : 940));

      return 380;
    }

    function playCutIn(actionType, options = {}) {
      if (activeCutIn) {
        pendingCutInQueue.push({
          actionType,
          options: { ...options }
        });
        return 0;
      }
      return runCutIn(actionType, options);
    }

    function runHandDiscardAnimation(target, tileIndex, callback, setLock) {
      if (!target) {
        if (typeof callback === 'function') callback();
        return;
      }

      const tiles = Array.from(target.querySelectorAll('.tile-motion'));
      const tileNode = tiles[tileIndex];
      if (!tileNode) {
        if (typeof callback === 'function') callback();
        return;
      }

      setLock(true);
      tileNode.classList.remove('anim-drop-in', 'sort-lift', 'sort-glide', 'sorting');
      tileNode.classList.add('discard-fly');

      window.setTimeout(() => {
        tileNode.classList.add('discard-collapse');
        window.setTimeout(() => {
          if (typeof callback === 'function') callback();
        }, 250);
        window.setTimeout(() => {
          setLock(false);
        }, 360);
      }, 150);
    }

    function animateBottomHandDiscard(tileIndex, callback) {
      if (bottomHandActionLock) {
        if (typeof callback === 'function') callback();
        return;
      }
      runHandDiscardAnimation(
        document.getElementById('bottom-hand'),
        tileIndex,
        callback,
        (locked) => {
          bottomHandActionLock = locked;
        }
      );
    }

    function animateSeatHandDiscard(seatKey, tileIndex, callback) {
      if (seatHandActionLock) {
        if (typeof callback === 'function') callback();
        return;
      }
      runHandDiscardAnimation(
        document.getElementById(`seat-${seatKey}-hand`),
        tileIndex,
        callback,
        (locked) => {
          seatHandActionLock = locked;
        }
      );
    }

    function animateReactionMeldCapture(action, callback) {
      const preview = action && action.payload ? action.payload.preview : null;
      const reactingSeat = action && action.payload && action.payload.seat
        ? action.payload.seat
        : 'bottom';
      if (!preview) {
        if (typeof callback === 'function') callback();
        return false;
      }

      const riverDescriptorId = resolveRiverPreviewDescriptorId(preview.riverTarget);
      const riverDescriptor = riverDescriptorId
        ? getInteractiveTableTiles().find((descriptor) => descriptor.id === riverDescriptorId) || null
        : null;
      const riverWrapper = riverDescriptor ? riverDescriptor.tile.closest('.tile-motion') : null;
      const handTileCodes = Array.isArray(preview.handTileCodes) ? preview.handTileCodes : [];
      const handCount = handTileCodes.length;
      let handWrappers = [];

      if (reactingSeat === 'bottom') {
        const handIndices = resolveBottomHandPreviewIndices(handTileCodes);
        const bottomHandWrappers = Array.from(document.querySelectorAll('#bottom-hand .tile-motion'));
        handWrappers = handIndices
          .map((index) => bottomHandWrappers[index] || null)
          .filter(Boolean);
      } else {
        const seatHandWrappers = Array.from(document.querySelectorAll(`#seat-${reactingSeat}-hand .tile-motion`));
        const captureCount = Math.max(0, Math.min(handCount || 0, seatHandWrappers.length));
        handWrappers = captureCount > 0
          ? seatHandWrappers.slice(Math.max(0, seatHandWrappers.length - captureCount))
          : [];
      }

      if (!riverWrapper && !handWrappers.length) {
        if (typeof callback === 'function') callback();
        return false;
      }

      if (riverWrapper) {
        riverWrapper.classList.remove('anim-snatch-river');
        void riverWrapper.offsetWidth;
        riverWrapper.classList.add('anim-snatch-river');
      }

      handWrappers.forEach((wrapper) => {
        wrapper.classList.remove('anim-snatch-hand', 'anim-collapse-hand');
        void wrapper.offsetWidth;
        wrapper.classList.add('anim-snatch-hand');
      });

      window.setTimeout(() => {
        handWrappers.forEach((wrapper) => {
          wrapper.classList.add('anim-collapse-hand');
        });
        if (typeof callback === 'function') callback();
      }, 250);

      return true;
    }

    function clearWinnerHandRevealTimers() {
      if (winnerHandRevealTriggerTimer) {
        window.clearTimeout(winnerHandRevealTriggerTimer);
        winnerHandRevealTriggerTimer = 0;
      }
      if (winnerHandRevealAutoClearTimer) {
        window.clearTimeout(winnerHandRevealAutoClearTimer);
        winnerHandRevealAutoClearTimer = 0;
      }
    }

    function normalizeWinnerRevealSeatKey(seatKey) {
      return ['bottom', 'right', 'top', 'left'].includes(seatKey) ? seatKey : 'bottom';
    }

    function buildWinnerRevealTile(tile = {}, options = {}) {
      let nextTile = normalizeTile(tile, 'stand');
      if ((!nextTile.asset || !nextTile.label) && nextTile.code) {
        const fallbackTile = createDisplayTileFromCode(nextTile.code, 'stand');
        if (fallbackTile) {
          nextTile = {
            ...fallbackTile,
            ...nextTile,
            asset: nextTile.asset || fallbackTile.asset,
            label: nextTile.label || fallbackTile.label
          };
        }
      }
      const extraTokens = String(nextTile.extraClass || '')
        .split(/\s+/)
        .map((token) => token.trim())
        .filter(Boolean);
      if (options.withGap) extraTokens.push('hand-gap');
      if (options.isWinning) extraTokens.push('tile-winning');
      return {
        ...nextTile,
        kind: 'stand',
        hidden: options.forceOpen === true ? false : nextTile.hidden,
        extraClass: [...new Set(extraTokens)].join(' ')
      };
    }

    function resolveWinnerHandRevealWinningTile(options = {}) {
      if (Array.isArray(options.winningTiles) && options.winningTiles.length) {
        return buildWinnerRevealTile(options.winningTiles[0], {
          isWinning: true,
          withGap: true
        });
      }
      if (Array.isArray(options.winningTile) && options.winningTile.length) {
        return buildWinnerRevealTile(options.winningTile[0], {
          isWinning: true,
          withGap: true
        });
      }
      if (options.winningTile && typeof options.winningTile === 'object') {
        return buildWinnerRevealTile(options.winningTile, {
          isWinning: true,
          withGap: true
        });
      }
      const winningTileCode = typeof options.winningTile === 'string'
        ? options.winningTile
        : options.winningTileCode;
      if (typeof winningTileCode !== 'string') return null;
      const tile = createDisplayTileFromCode(winningTileCode, 'stand');
      return tile ? buildWinnerRevealTile(tile, { isWinning: true, withGap: true }) : null;
    }

    function getSeatHandTilesForRender(seatKey, baseTiles = []) {
      const tiles = Array.isArray(baseTiles) ? baseTiles.map((tile) => normalizeTile(tile, 'stand')) : [];
      if (!winnerHandRevealState.active || winnerHandRevealState.seatKey !== seatKey) {
        return tiles;
      }
      const openedTiles = tiles.map((tile) => buildWinnerRevealTile(tile, { forceOpen: true }));
      const winningTile = winnerHandRevealState.winningTile;
      if (!winningTile) {
        if (openedTiles.length) {
          const lastIndex = openedTiles.length - 1;
          openedTiles[lastIndex] = buildWinnerRevealTile(openedTiles[lastIndex], {
            isWinning: true,
            withGap: true,
            forceOpen: true
          });
        }
        return openedTiles;
      }
      if (openedTiles.length >= 14) {
        const lastIndex = openedTiles.length - 1;
        openedTiles[lastIndex] = buildWinnerRevealTile(winningTile, {
          isWinning: true,
          withGap: true,
          forceOpen: true
        });
        return openedTiles;
      }
      openedTiles.push(buildWinnerRevealTile(winningTile, {
        isWinning: true,
        withGap: true,
        forceOpen: true
      }));
      return openedTiles;
    }

    function applyWinnerHandRevealClass(target, seatKey) {
      if (!target) return;
      const isActive = Boolean(winnerHandRevealState.active && winnerHandRevealState.seatKey === seatKey);
      target.classList.toggle('anim-winner-reveal', isActive);
      target.classList.toggle('is-revealed', Boolean(isActive && winnerHandRevealState.revealed));
    }

    function shouldAnimateHandDrawForSeat(seatKey) {
      return !(winnerHandRevealState.active && winnerHandRevealState.seatKey === seatKey);
    }

    function clearWinnerReveal() {
      clearWinnerHandRevealTimers();
      winnerHandRevealState = {
        active: false,
        seatKey: 'bottom',
        winningTile: null,
        revealed: false
      };
      const board = document.querySelector('.board-container');
      if (board) board.classList.remove('anim-winner-reveal-shake');
      renderAll();
      return true;
    }

    function playWinnerReveal(options = {}) {
      const seatKey = normalizeWinnerRevealSeatKey(options.seat || options.winnerSeat || 'bottom');
      const winningTile = resolveWinnerHandRevealWinningTile(options);
      clearWinnerReveal();
      winnerHandRevealState = {
        active: true,
        seatKey,
        winningTile,
        revealed: false
      };
      renderAll();

      winnerHandRevealTriggerTimer = window.setTimeout(() => {
        winnerHandRevealState.revealed = true;
        renderAll();
      }, 24);

      const autoClearMs = Number(options.autoClearMs);
      if (Number.isFinite(autoClearMs) && autoClearMs > 0) {
        winnerHandRevealAutoClearTimer = window.setTimeout(() => {
          clearWinnerReveal();
        }, autoClearMs);
      }

      return {
        seat: seatKey,
        winningTileCode: winningTile ? winningTile.code || null : null
      };
    }

    return {
      queueTableAnimation,
      playPendingTableAnimations,
      playCutIn,
      animateBottomHandDiscard,
      animateSeatHandDiscard,
      animateReactionMeldCapture,
      isBottomHandActionLocked() {
        return bottomHandActionLock;
      },
      isSeatHandActionLocked() {
        return seatHandActionLock;
      },
      getSeatHandTilesForRender,
      applyWinnerHandRevealClass,
      shouldAnimateHandDrawForSeat,
      clearWinnerReveal,
      playWinnerReveal
    };
  }

  global.AceMahjongCreateTableAnimations = createTableAnimations;
})(window);
