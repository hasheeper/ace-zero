(function(global) {
  'use strict';

  function createTableRenderer(deps = {}) {
    const assetUrl = typeof deps.assetUrl === 'function' ? deps.assetUrl : ((path) => String(path || ''));
    const formatScore = typeof deps.formatScore === 'function' ? deps.formatScore : ((value) => String(value || 0));
    const getAppRoot = typeof deps.getAppRoot === 'function' ? deps.getAppRoot : (() => document.getElementById('app'));
    const getTableInfoState = typeof deps.getTableInfoState === 'function' ? deps.getTableInfoState : (() => ({}));
    const getBottomSeatMeta = typeof deps.getBottomSeatMeta === 'function' ? deps.getBottomSeatMeta : (() => ({}));
    const getBottomRiverTiles = typeof deps.getBottomRiverTiles === 'function' ? deps.getBottomRiverTiles : (() => []);
    const getBottomHandTiles = typeof deps.getBottomHandTiles === 'function' ? deps.getBottomHandTiles : (() => []);
    const getBaseBottomMelds = typeof deps.getBaseBottomMelds === 'function' ? deps.getBaseBottomMelds : (() => []);
    const getBottomSeatState = typeof deps.getBottomSeatState === 'function' ? deps.getBottomSeatState : (() => ({ riichi: null }));
    const getOpponentSeats = typeof deps.getOpponentSeats === 'function' ? deps.getOpponentSeats : (() => []);
    const renderHandStatusOverlay = typeof deps.renderHandStatusOverlay === 'function' ? deps.renderHandStatusOverlay : (() => {});
    const getSeatHandTilesForRender = typeof deps.getSeatHandTilesForRender === 'function' ? deps.getSeatHandTilesForRender : ((_, tiles) => tiles || []);
    const applyWinnerHandRevealClass = typeof deps.applyWinnerHandRevealClass === 'function' ? deps.applyWinnerHandRevealClass : (() => {});
    const applyHandStatusOverlayToTiles = typeof deps.applyHandStatusOverlayToTiles === 'function' ? deps.applyHandStatusOverlayToTiles : ((tiles) => tiles || []);
    const shouldAnimateHandDrawForSeat = typeof deps.shouldAnimateHandDrawForSeat === 'function' ? deps.shouldAnimateHandDrawForSeat : (() => true);
    const scheduleTableInteractionProxySync = typeof deps.scheduleTableInteractionProxySync === 'function' ? deps.scheduleTableInteractionProxySync : (() => {});
    const applyBottomHandPreviewClasses = typeof deps.applyBottomHandPreviewClasses === 'function' ? deps.applyBottomHandPreviewClasses : (() => {});
    const playPendingTableAnimations = typeof deps.playPendingTableAnimations === 'function' ? deps.playPendingTableAnimations : (() => {});
    const scheduleTimeout = typeof globalThis.setTimeout === 'function'
      ? globalThis.setTimeout.bind(globalThis)
      : (() => 0);
    const cancelTimeout = typeof globalThis.clearTimeout === 'function'
      ? globalThis.clearTimeout.bind(globalThis)
      : (() => {});
    const normalizeTiles = typeof deps.normalizeTiles === 'function' ? deps.normalizeTiles : ((tiles) => tiles || []);
    const normalizeMeld = typeof deps.normalizeMeld === 'function' ? deps.normalizeMeld : ((meld) => meld);
    const cloneTile = typeof deps.cloneTile === 'function' ? deps.cloneTile : ((tile) => ({ ...(tile || {}) }));
    const cloneMeld = typeof deps.cloneMeld === 'function' ? deps.cloneMeld : ((meld) => ({ ...(meld || {}) }));
    const cloneRiichiState = typeof deps.cloneRiichiState === 'function' ? deps.cloneRiichiState : ((riichi) => ({ ...(riichi || {}) }));
    const cloneHandOrderPolicy = typeof deps.cloneHandOrderPolicy === 'function' ? deps.cloneHandOrderPolicy : ((policy) => (policy ? { ...policy } : null));
    const getResolvedHandOrderPolicy = typeof deps.getResolvedHandOrderPolicy === 'function' ? deps.getResolvedHandOrderPolicy : (() => null);
    const getMutableSeatData = typeof deps.getMutableSeatData === 'function' ? deps.getMutableSeatData : (() => null);
    const getEffectiveTileKind = typeof deps.getEffectiveTileKind === 'function' ? deps.getEffectiveTileKind : ((tile) => tile && tile.kind ? tile.kind : 'flat');
    const splitTileExtraClass = typeof deps.splitTileExtraClass === 'function' ? deps.splitTileExtraClass : (() => ({ wrapperClass: '', tileClass: '' }));
    const resolveTileDisplayOrder = typeof deps.resolveTileDisplayOrder === 'function' ? deps.resolveTileDisplayOrder : (() => Number.MAX_SAFE_INTEGER);
    const shouldSeatAutoSortHand = typeof deps.shouldSeatAutoSortHand === 'function' ? deps.shouldSeatAutoSortHand : (() => true);
    const getBottomHandInteractionHandler = typeof deps.getBottomHandInteractionHandler === 'function' ? deps.getBottomHandInteractionHandler : (() => null);
    const isBottomHandActionLocked = typeof deps.isBottomHandActionLocked === 'function' ? deps.isBottomHandActionLocked : (() => false);

    const delayedSeatHandSortTimers = new WeakMap();
    const activeHandSortTargets = new WeakSet();
    const AUTO_DISMISS_MS = 5000;
    let dismissedCoachSignature = null;
    let dismissedReviewSignature = null;
    let dismissedAnalysisSignature = null;
    let coachAutoDismissTimer = null;
    let reviewAutoDismissTimer = null;
    let activeCoachAutoDismissSignature = null;
    let activeReviewAutoDismissSignature = null;

    function applyTileElementData(element, tile = {}, options = {}) {
      if (!element) return;
      const seatKey = options.seatKey || element.dataset.seatKey || 'bottom';
      element.dataset.tileCode = String(tile.code || '');
      element.dataset.tileSortValue = String(resolveTileDisplayOrder(tile, seatKey));
      element.dataset.seatKey = seatKey;
    }

    function renderTile(tile) {
      const classParts = splitTileExtraClass(tile.extraClass);
      const wrapperClass = classParts.wrapperClass ? ` ${classParts.wrapperClass}` : '';
      const extraClass = classParts.tileClass ? ` ${classParts.tileClass}` : '';
      const flippedClass = tile.hidden ? ' tile-flipped' : '';
      const effectiveKind = getEffectiveTileKind(tile);
      const frontMarkup = tile.hidden
        ? '  <div class="face f-front"></div>'
        : `  <div class="face f-front"><img class="tile-watermark" src="${assetUrl(`riichi-mahjong-tiles/Black/${tile.asset}.svg`)}" alt="${tile.label}"></div>`;
      return [
        `<div class="tile-motion${wrapperClass}">`,
        `  <div class="tile-cube tile-${effectiveKind}${extraClass}${flippedClass}">`,
        '    <div class="tile-hit-surface" aria-hidden="true"></div>',
        `    ${frontMarkup.trim()}`,
        '    <div class="face f-back"></div><div class="face f-top"></div><div class="face f-bottom"></div><div class="face f-left"></div><div class="face f-right"></div>',
        '  </div>',
        '</div>'
      ].join('');
    }

    function getTileRenderSignature(tile) {
      return JSON.stringify({
        asset: tile.asset || '',
        label: tile.label || '',
        kind: getEffectiveTileKind(tile),
        hidden: Boolean(tile.hidden),
        extraClass: tile.extraClass || '',
        code: tile.code || ''
      });
    }

    function createTileElement(tile, options = {}) {
      const template = document.createElement('template');
      template.innerHTML = renderTile(tile).trim();
      const element = template.content.firstElementChild;
      if (element) {
        element.dataset.tileSignature = getTileRenderSignature(tile);
        applyTileElementData(element, tile, options);
      }
      return element;
    }

    function getBottomHandTileBaseKey(tile = {}) {
      return [
        tile.code || '',
        tile.asset || '',
        tile.label || '',
        tile.kind || '',
        tile.hidden ? 'hidden' : 'open'
      ].join('|');
    }

    function buildBottomHandStableKeys(tiles = []) {
      const counts = new Map();
      return tiles.map((tile) => {
        const baseKey = getBottomHandTileBaseKey(tile);
        const occurrence = (counts.get(baseKey) || 0) + 1;
        counts.set(baseKey, occurrence);
        return `${baseKey}#${occurrence}`;
      });
    }

    function updateTileElementInPlace(element, tile, options = {}) {
      if (!element) return;
      const nextElement = createTileElement(tile, {
        seatKey: options.seatKey || element.dataset.seatKey || 'bottom'
      });
      if (!nextElement) return;
      const transientClasses = ['draw-gap', 'anim-drop-in', 'discard-fly', 'discard-collapse', 'sorting', 'sort-lift', 'sort-glide'];
      const preserved = transientClasses.filter((className) => element.classList.contains(className));
      element.className = nextElement.className;
      preserved.forEach((className) => element.classList.add(className));
      element.innerHTML = nextElement.innerHTML;
      element.dataset.tileSignature = nextElement.dataset.tileSignature;
      element.dataset.tileCode = nextElement.dataset.tileCode || '';
      element.dataset.tileSortValue = nextElement.dataset.tileSortValue || '';
      element.dataset.seatKey = nextElement.dataset.seatKey || '';
    }

    function stageTileElementReveal(element) {
      if (!element) return;
      element.classList.add('tile-staged');
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          element.classList.remove('tile-staged');
        });
      });
    }

    function placeChildAtIndex(target, node, index) {
      if (!target || !node) return;
      const referenceNode = target.children[index] || null;
      if (referenceNode !== node) {
        target.insertBefore(node, referenceNode);
      }
    }

    function scheduleHandDrawEntry(node) {
      if (!node) return;
      node.classList.add('anim-drop-in');
      node.style.width = '0px';
      node.style.marginLeft = '0px';
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          node.style.width = '';
          node.style.marginLeft = '';
        });
      });
      window.setTimeout(() => {
        node.classList.remove('anim-drop-in');
      }, 320);
    }

    function getHandCrossCount(wrappers, drawnNode, insertNode) {
      const fromIndex = wrappers.indexOf(drawnNode);
      const toIndex = wrappers.indexOf(insertNode);
      if (fromIndex < 0 || toIndex < 0) return 0;
      return Math.abs(fromIndex - toIndex);
    }

    function getHandSortHeights(crossCount) {
      if (crossCount >= 8) return { lift: 'calc(var(--h) * 1.13)', glide: 'calc(var(--h) * 0.97)' };
      if (crossCount >= 6) return { lift: 'calc(var(--h) * 1)', glide: 'calc(var(--h) * 0.87)' };
      if (crossCount >= 4) return { lift: 'calc(var(--h) * 0.84)', glide: 'calc(var(--h) * 0.71)' };
      if (crossCount >= 2) return { lift: 'calc(var(--h) * 0.71)', glide: 'calc(var(--h) * 0.58)' };
      return { lift: 'calc(var(--h) * 0.61)', glide: 'calc(var(--h) * 0.5)' };
    }

    function clearDiscardNodes(target) {
      Array.from(target.querySelectorAll('.tile-motion.discard-collapse, .tile-motion.discard-fly')).forEach((node) => {
        node.remove();
      });
    }

    function reconcileHandNodes(target, desiredTiles, desiredKeys, keyAttr, options = {}) {
      const existingChildren = Array.from(target.children);
      const seatKey = options.seatKey || target.dataset.seatKey || 'bottom';
      const desiredGapKey = desiredTiles.find((tile) => String(tile.extraClass || '').includes('hand-gap'))
        ? desiredKeys[desiredTiles.findIndex((tile) => String(tile.extraClass || '').includes('hand-gap'))]
        : '';

      existingChildren.forEach((node) => {
        if (node.dataset[keyAttr] !== desiredGapKey) {
          node.classList.remove('draw-gap');
        }
      });

      const existingByKey = new Map(
        existingChildren
          .filter((node) => node.dataset[keyAttr])
          .map((node) => [node.dataset[keyAttr], node])
      );

      desiredTiles.forEach((tile, index) => {
        const key = desiredKeys[index];
        let node = existingByKey.get(key) || null;

        if (!node) {
          node = createTileElement(tile, { seatKey });
          if (!node) return;
          if (options.animateDraw && String(tile.extraClass || '').includes('hand-gap') && existingChildren.length > 0) {
            scheduleHandDrawEntry(node);
          }
        } else if (node.dataset.tileSignature !== getTileRenderSignature(tile)) {
          updateTileElementInPlace(node, tile, { seatKey });
        } else {
          applyTileElementData(node, tile, { seatKey });
        }

        if (String(tile.extraClass || '').includes('hand-gap')) node.classList.add('draw-gap');
        else node.classList.remove('draw-gap');
        node.dataset[keyAttr] = key;
        placeChildAtIndex(target, node, index);
        existingByKey.delete(key);
      });

      existingByKey.forEach((node) => node.remove());
    }

    function maybeAnimateHandSort(target, desiredTiles, keyAttr, seatKey) {
      if (!target) return false;
      if (activeHandSortTargets.has(target)) return true;
      if (!shouldSeatAutoSortHand(seatKey, desiredTiles)) return false;
      const hasDrawGapInDesired = desiredTiles.some((tile) => String(tile.extraClass || '').includes('hand-gap'));
      if (hasDrawGapInDesired) return false;

      clearDiscardNodes(target);
      const wrappers = Array.from(target.querySelectorAll('.tile-motion'));
      const drawnNode = wrappers.find((node) => node.classList.contains('draw-gap'));
      if (!drawnNode) return false;

      const desiredKeys = buildBottomHandStableKeys(desiredTiles);
      if (wrappers.length !== desiredTiles.length) return false;

      const targetValue = Number(drawnNode.dataset.tileSortValue || Number.MAX_SAFE_INTEGER);
      let insertNode = null;
      for (const node of wrappers) {
        if (node === drawnNode) continue;
        const nodeValue = Number(node.dataset.tileSortValue || Number.MAX_SAFE_INTEGER);
        if (nodeValue > targetValue) {
          insertNode = node;
          break;
        }
      }

      const finalizeState = () => {
        const finalTiles = Array.from(target.querySelectorAll('.tile-motion'));
        if (finalTiles.length !== desiredTiles.length) {
          reconcileHandNodes(target, desiredTiles, desiredKeys, keyAttr, { seatKey });
          return;
        }
        desiredTiles.forEach((tile, index) => {
          const node = finalTiles[index];
          if (!node) return;
          if (node.dataset.tileSignature !== getTileRenderSignature(tile)) {
            updateTileElementInPlace(node, tile, { seatKey });
          } else {
            applyTileElementData(node, tile, { seatKey });
          }
          node.dataset[keyAttr] = desiredKeys[index];
          node.classList.remove('draw-gap');
        });
      };

      if (!insertNode || drawnNode.nextElementSibling === insertNode) {
        drawnNode.classList.remove('draw-gap');
        finalizeState();
        return true;
      }

      const crossCount = getHandCrossCount(wrappers, drawnNode, insertNode);
      const heights = getHandSortHeights(crossCount);
      activeHandSortTargets.add(target);
      drawnNode.style.setProperty('--sort-lift-z', heights.lift);
      drawnNode.style.setProperty('--sort-glide-z', heights.glide);
      drawnNode.classList.add('sorting', 'sort-lift');

      window.setTimeout(() => {
        const wrappersBefore = Array.from(target.querySelectorAll('.tile-motion'));
        const firstPositions = new Map();
        wrappersBefore.forEach((node) => {
          node.style.transition = 'none';
          firstPositions.set(node, node.offsetLeft);
        });

        drawnNode.classList.remove('draw-gap');
        target.insertBefore(drawnNode, insertNode);

        const wrappersAfter = Array.from(target.querySelectorAll('.tile-motion'));
        wrappersAfter.forEach((node) => {
          const before = firstPositions.get(node);
          if (before == null) return;
          const deltaX = before - node.offsetLeft;
          if (deltaX !== 0) node.style.transform = `translateX(${deltaX}px)`;
        });

        void target.offsetWidth;

        drawnNode.classList.add('sort-glide');
        wrappersAfter.forEach((node) => {
          node.style.transition = 'transform 0.42s cubic-bezier(0.22, 0.78, 0.24, 1)';
          node.style.transform = '';
        });

        window.setTimeout(() => {
          drawnNode.classList.remove('sort-glide');
          drawnNode.classList.remove('sort-lift');

          window.setTimeout(() => {
            wrappersAfter.forEach((node) => {
              node.style.transition = '';
              node.style.transform = '';
            });
            drawnNode.classList.remove('sorting');
            drawnNode.style.removeProperty('--sort-lift-z');
            drawnNode.style.removeProperty('--sort-glide-z');
            activeHandSortTargets.delete(target);
            finalizeState();
          }, 240);
        }, 300);
      }, 90);

      return true;
    }

    function syncSeatHandIncremental(target, tiles, options = {}) {
      const desiredTiles = tiles || [];
      const seatKey = options.seatKey || target.dataset.seatKey || 'right';
      const hasPendingDrawGap = Boolean(target.querySelector('.tile-motion.draw-gap'));
      const shouldDelaySort = !options.forceImmediate
        && hasPendingDrawGap
        && shouldSeatAutoSortHand(seatKey, desiredTiles)
        && !desiredTiles.some((tile) => String(tile.extraClass || '').includes('hand-gap'));

      const existingTimer = delayedSeatHandSortTimers.get(target);
      if (existingTimer) {
        window.clearTimeout(existingTimer);
        delayedSeatHandSortTimers.delete(target);
      }

      if (shouldDelaySort) {
        const timerId = window.setTimeout(() => {
          delayedSeatHandSortTimers.delete(target);
          syncSeatHandIncremental(target, desiredTiles, {
            forceImmediate: true,
            seatKey,
            animateDraw: options.animateDraw
          });
        }, 180);
        delayedSeatHandSortTimers.set(target, timerId);
        return;
      }

      if (maybeAnimateHandSort(target, desiredTiles, 'seatHandKey', seatKey)) return;
      reconcileHandNodes(target, tiles || [], buildBottomHandStableKeys(tiles || []), 'seatHandKey', {
        animateDraw: options.animateDraw !== false,
        seatKey
      });
    }

    function syncTileGroupIncremental(target, tiles, options = {}) {
      const desiredTiles = tiles || [];
      const existingChildren = Array.from(target.children);
      const skipStage = Boolean(options.skipStage);

      desiredTiles.forEach((tile, index) => {
        const signature = getTileRenderSignature(tile);
        const existing = existingChildren[index];

        if (!existing) {
          const nextNode = createTileElement(tile);
          if (nextNode) {
            placeChildAtIndex(target, nextNode, index);
            if (!skipStage) stageTileElementReveal(nextNode);
          }
          return;
        }

        if (existing.dataset.tileSignature !== signature) {
          updateTileElementInPlace(existing, tile);
          if (!skipStage) stageTileElementReveal(existing);
        }
      });

      for (let index = target.children.length - 1; index >= desiredTiles.length; index -= 1) {
        target.children[index].remove();
      }
    }

    function syncBottomHandIncremental(target, tiles, options = {}) {
      const seatKey = options.seatKey || target.dataset.seatKey || 'bottom';
      if (maybeAnimateHandSort(target, tiles, 'bottomHandKey', seatKey)) return;
      reconcileHandNodes(target, tiles || [], buildBottomHandStableKeys(tiles || []), 'bottomHandKey', {
        animateDraw: options.animateDraw !== false,
        seatKey
      });
    }

    function renderTileGroup(targetId, tiles, options = {}) {
      const target = document.getElementById(targetId);
      if (!target) return;
      const seatKey = options.seatKey || target.dataset.seatKey || (targetId === 'bottom-hand' ? 'bottom' : '');
      const effectiveTiles = applyHandStatusOverlayToTiles(tiles || [], { seatKey });
      if (seatKey) target.dataset.seatKey = seatKey;
      if (targetId === 'bottom-hand') {
        if (target.dataset.boundHandClick !== 'true') {
          target.addEventListener('click', (event) => {
            const bottomHandInteractionHandler = getBottomHandInteractionHandler();
            if (typeof bottomHandInteractionHandler !== 'function') return;
            const tileNode = event.target.closest('.tile-motion');
            if (!tileNode || !target.contains(tileNode)) return;
            if (isBottomHandActionLocked()) return;
            if (tileNode.querySelector('.tile-cube.tile-kuikae')) return;
            const tileIndex = Array.from(target.children).indexOf(tileNode);
            if (tileIndex < 0) return;
            bottomHandInteractionHandler({
              seat: 'bottom',
              area: 'hand',
              tileIndex,
              targetId: `bottom-hand-${tileIndex}`
            });
          });
          target.dataset.boundHandClick = 'true';
        }
        syncBottomHandIncremental(target, effectiveTiles, {
          seatKey,
          animateDraw: shouldAnimateHandDrawForSeat(seatKey)
        });
        return;
      }
      if (target.classList.contains('hand-bottom')) {
        syncSeatHandIncremental(target, effectiveTiles, {
          seatKey,
          animateDraw: shouldAnimateHandDrawForSeat(seatKey)
        });
        return;
      }
      syncTileGroupIncremental(target, effectiveTiles, {
        skipStage: target.classList.contains('meld-bottom')
      });
    }

    function getRiverItemSignature(item) {
      if (!item) return '';
      if (item.type === 'gap') return 'gap';
      return `tile:${getTileRenderSignature(item.tile)}`;
    }

    function createRiverGapElement() {
      const gap = document.createElement('div');
      gap.className = 'river-riichi-gap';
      gap.setAttribute('aria-hidden', 'true');
      gap.dataset.riverSignature = 'gap';
      return gap;
    }

    function syncRiverRowIncremental(rowElement, items = []) {
      const existingChildren = Array.from(rowElement.children);

      items.forEach((item, index) => {
        const signature = getRiverItemSignature(item);
        const existing = existingChildren[index];

        if (!existing) {
          const nextNode = item.type === 'gap' ? createRiverGapElement() : createTileElement(item.tile);
          if (nextNode) {
            nextNode.dataset.riverSignature = signature;
            rowElement.appendChild(nextNode);
          }
          return;
        }

        if (existing.dataset.riverSignature !== signature) {
          const nextNode = item.type === 'gap' ? createRiverGapElement() : createTileElement(item.tile);
          if (nextNode) {
            nextNode.dataset.riverSignature = signature;
            existing.replaceWith(nextNode);
          }
          return;
        }

        if (item.type === 'tile' && !existing.dataset.tileSignature) {
          existing.dataset.tileSignature = getTileRenderSignature(item.tile);
        }
      });

      for (let index = rowElement.children.length - 1; index >= items.length; index -= 1) {
        rowElement.children[index].remove();
      }
    }

    function renderRiverGroup(targetId, tiles, riichiState) {
      const target = document.getElementById(targetId);
      if (!target) return;

      const useUprightRiichiTile = !riichiState || riichiState.displayMode !== 'flat';
      const riichiIndex = riichiState && riichiState.active && useUprightRiichiTile && Number.isInteger(riichiState.tileIndex)
        ? riichiState.tileIndex
        : -1;
      const rows = [];
      const maxRows = 3;
      const baseColumns = 6;

      for (let rowIndex = 0; rowIndex < maxRows; rowIndex += 1) {
        const rowStart = rowIndex * baseColumns;
        if (rowStart >= tiles.length) break;
        const rowEnd = rowIndex < maxRows - 1
          ? rowStart + baseColumns
          : tiles.length;
        const rowTiles = tiles.slice(rowStart, rowEnd);
        const rowItems = [];
        rowTiles.forEach((tile, index) => {
          const absoluteIndex = rowStart + index;
          const tileData = absoluteIndex === riichiIndex
            ? { ...tile, extraClass: `${tile.extraClass ? `${tile.extraClass} ` : ''}tile-riichi`.trim() }
            : tile;
          rowItems.push({ type: 'tile', tile: tileData });
          if (absoluteIndex === riichiIndex) {
            rowItems.push({ type: 'gap' });
          }
        });
        rows.push(rowItems);
      }

      const existingRows = Array.from(target.children);
      rows.forEach((rowItems, rowIndex) => {
        let rowElement = existingRows[rowIndex];
        if (!rowElement) {
          rowElement = document.createElement('div');
          rowElement.className = 'river-row';
          target.appendChild(rowElement);
        }
        syncRiverRowIncremental(rowElement, rowItems);
      });

      for (let rowIndex = target.children.length - 1; rowIndex >= rows.length; rowIndex -= 1) {
        target.children[rowIndex].remove();
      }
    }

    function renderRiichiStick(targetId, riichiState) {
      const target = document.getElementById(targetId);
      if (!target) return;
      const stickVisible = !riichiState || riichiState.stickVisible !== false;
      if (!riichiState || !riichiState.active || !stickVisible) {
        target.classList.add('is-hidden');
        target.innerHTML = '';
        return;
      }
      target.classList.remove('is-hidden');
      target.innerHTML = '<div class="stick riichi-stick" aria-label="立直棒"><div class="dot-1000"></div></div>';
    }

    function renderCenterInfo() {
      const tableInfoState = getTableInfoState();
      const roundEl = document.getElementById('info-round-text');
      const tenbouRowEl = document.getElementById('info-tenbou-row');
      const honbaEl = document.getElementById('info-honba-count');
      const riichiEl = document.getElementById('info-riichi-count');
      const riichiItemEl = document.getElementById('info-riichi-item');
      const infoDividerEl = document.getElementById('info-divider');
      const remainEl = document.getElementById('info-remain-count');
      const doraWrapEl = document.getElementById('center-dora-wrap');
      const doraTierEl = document.getElementById('center-dora-tier');
      const scoreMap = {
        top: document.getElementById('score-top'),
        left: document.getElementById('score-left'),
        right: document.getElementById('score-right'),
        bottom: document.getElementById('score-bottom')
      };
      const windMap = {
        top: document.getElementById('wind-top'),
        left: document.getElementById('wind-left'),
        right: document.getElementById('wind-right'),
        bottom: document.getElementById('wind-bottom')
      };
      const activeSeats = new Set(Array.isArray(tableInfoState.activeSeats) && tableInfoState.activeSeats.length
        ? tableInfoState.activeSeats
        : ['bottom', 'right', 'top', 'left']);

      if (roundEl) roundEl.textContent = tableInfoState.roundText || '東一';
      if (tenbouRowEl) tenbouRowEl.style.display = tableInfoState.advancedMode ? '' : 'none';
      if (honbaEl) honbaEl.textContent = String(tableInfoState.honba ?? 0);
      if (riichiEl) riichiEl.textContent = String(tableInfoState.riichiSticks ?? 0);
      if (riichiItemEl) riichiItemEl.style.display = tableInfoState.centerRiichiVisible === false ? 'none' : '';
      if (infoDividerEl) infoDividerEl.style.display = tableInfoState.advancedMode ? '' : 'none';
      if (remainEl) remainEl.textContent = String(tableInfoState.remaining ?? 0);
      if (doraWrapEl) doraWrapEl.style.display = tableInfoState.centerDoraVisible === false ? 'none' : '';

      Object.entries(scoreMap).forEach(([seatKey, el]) => {
        if (!el) return;
        el.style.display = activeSeats.has(seatKey) ? '' : 'none';
        const score = tableInfoState.scores && tableInfoState.scores[seatKey] != null ? tableInfoState.scores[seatKey] : 0;
        const turnLine = el.querySelector('.turn-line');
        el.textContent = formatScore(score);
        if (turnLine) el.appendChild(turnLine);
        el.classList.toggle('is-turn', tableInfoState.turnSeat === seatKey);
      });

      Object.entries(windMap).forEach(([seatKey, el]) => {
        if (!el) return;
        el.style.display = activeSeats.has(seatKey) ? '' : 'none';
        const windState = tableInfoState.seatWinds && tableInfoState.seatWinds[seatKey]
          ? tableInfoState.seatWinds[seatKey]
          : null;
        const windLabel = windState && typeof windState.label === 'string' && windState.label
          ? windState.label
          : '';
        el.textContent = windLabel;
        if (tableInfoState.dealerSeat === seatKey) {
          const badge = document.createElement('div');
          badge.className = 'dealer-badge';
          badge.textContent = '莊';
          el.prepend(badge);
        }
        el.classList.toggle('is-dealer', tableInfoState.dealerSeat === seatKey);
        el.classList.remove('is-turn');
      });

      if (doraTierEl) {
        const doraSlots = Array.from({ length: 5 }, (_, index) => (
          Array.isArray(tableInfoState.doraTiles) ? tableInfoState.doraTiles[index] || null : null
        ));
        doraTierEl.innerHTML = doraSlots.map((tile) => {
          if (tile && tile.open && tile.asset) {
            return `<div class="dora-slot open"><img class="dora-tile" src="${assetUrl(`riichi-mahjong-tiles/Regular/${tile.asset}.svg`)}" alt="${tile.label || tile.asset}"></div>`;
          }
          return '<div class="dora-slot"></div>';
        }).join('');
      }

      renderCoachCard(tableInfoState.coachState);
      renderReviewCard(tableInfoState.coachState);
      renderAnalysisCard(tableInfoState.coachAnalysisState);
    }

    function normalizeCoachTileCode(code) {
      const value = String(code || '').trim();
      const match = value.match(/^[mpsz][0-9]/i);
      return match ? match[0].toLowerCase() : '';
    }

    function formatCoachTileLabel(code) {
      const normalized = normalizeCoachTileCode(code);
      if (!normalized) return String(code || '').trim() || '-';
      const suitLabels = {
        m: '万',
        p: '筒',
        s: '索'
      };
      const rankLabels = {
        '0': '赤五',
        '1': '一',
        '2': '二',
        '3': '三',
        '4': '四',
        '5': '五',
        '6': '六',
        '7': '七',
        '8': '八',
        '9': '九'
      };
      const honorLabels = {
        z1: '东',
        z2: '南',
        z3: '西',
        z4: '北',
        z5: '白',
        z6: '发',
        z7: '中'
      };
      if (normalized[0] === 'z') {
        return honorLabels[normalized] || normalized;
      }
      return `${rankLabels[normalized[1]] || normalized[1]}${suitLabels[normalized[0]] || ''}`;
    }

    function formatCoachSeatLabel(seatKey) {
      const labels = {
        bottom: '自家',
        right: '下家',
        top: '对家',
        left: '上家'
      };
      return labels[String(seatKey || '').toLowerCase()] || String(seatKey || '').trim() || '-';
    }

    function formatCoachStatusLabel(status) {
      const labels = {
        idle: '待命',
        ready: '建议就绪',
        loading: '分析中',
        error: '建议失败'
      };
      return labels[String(status || '').toLowerCase()] || String(status || '待命');
    }

    function formatReviewStatusLabel(status) {
      const labels = {
        idle: '待命',
        ready: '复盘就绪',
        pending: '复盘生成中',
        loading: '复盘生成中',
        error: '复盘失败'
      };
      return labels[String(status || '').toLowerCase()] || String(status || '待命');
    }

    function getCoachStateSignature(state = null) {
      if (!state || typeof state !== 'object') return null;
      if (typeof state.contextSignature === 'string' && state.contextSignature) {
        return [
          state.reviewMode ? 'review' : 'live',
          state.contextSignature,
          state.source || '',
          state.summary || '',
          JSON.stringify(state.recommended || null)
        ].join('::');
      }
      return JSON.stringify({
        status: state.status || null,
        source: state.source || null,
        perspectiveSeat: state.perspectiveSeat || null,
        summary: state.summary || null,
        recommended: state.recommended || null
      });
    }

    function getAnalysisStateSignature(state = null) {
      if (!state || typeof state !== 'object') return null;
      if (Number.isFinite(Number(state.updatedAt))) return `ts:${Number(state.updatedAt)}`;
      return JSON.stringify({
        status: state.status || null,
        source: state.source || null,
        summary: state.summary || null,
        report: state.report || null
      });
    }

    function formatCoachRecommendedText(recommended = null) {
      if (!recommended || typeof recommended !== 'object') return '暂无动作建议';
      const type = String(recommended.type || '').toLowerCase();
      const tileLabel = formatCoachTileLabel(recommended.tileCode);
      const callType = String(recommended.callType || '').toLowerCase();
      if (type === 'discard') {
        return recommended.riichi ? `推荐立直切 ${tileLabel}` : `推荐打出 ${tileLabel}`;
      }
      if (type === 'pass') return '推荐跳过当前反应';
      if (type === 'hule') return '推荐立即和牌';
      if (type === 'call' || type === 'chi' || type === 'peng' || type === 'pon') {
        const callText = callType === 'peng' || callType === 'pon'
          ? '碰'
          : (callType === 'chi' ? '吃' : (recommended.callType || type));
        const meldText = recommended.meldString || tileLabel;
        return `推荐${callText} ${meldText}`.trim();
      }
      if (type === 'daiminkan' || type === 'ankan' || type === 'kakan' || type === 'kan') {
        const meldText = recommended.meldString || tileLabel;
        return `推荐开杠 ${meldText}`.trim();
      }
      return `推荐动作: ${recommended.meldString || recommended.callType || tileLabel || type || '-'}`;
    }

    function getCoachActionFamily(state = null) {
      const recommended = state && state.recommended && typeof state.recommended === 'object'
        ? state.recommended
        : null;
      const type = String(recommended && recommended.type ? recommended.type : '').toLowerCase();
      if (type === 'discard') return 'draw';
      if (['pass', 'hule', 'call', 'chi', 'peng', 'pon', 'kan', 'daiminkan', 'ankan', 'kakan'].includes(type)) {
        return 'reaction';
      }
      if (state && state.reviewMode && /pass|call|chi|peng|pon|kan|hule/.test(String(state.summary || '').toLowerCase())) {
        return 'reaction';
      }
      return 'draw';
    }

    function formatCoachModeLabel(state = null) {
      const family = getCoachActionFamily(state);
      const isReview = Boolean(state && state.reviewMode);
      if (family === 'reaction') return isReview ? '行动复盘' : '行动建议';
      return isReview ? '摸打复盘' : '摸打建议';
    }

    function formatCoachKickerLabel(state = null) {
      const family = getCoachActionFamily(state);
      const status = String(state && state.status ? state.status : '').toLowerCase();
      if (status === 'pending') return family === 'reaction' ? 'Reaction Review' : 'Draw Review';
      if (family === 'reaction') return 'Reaction Coach';
      return 'Draw Coach';
    }

    function formatReviewKickerLabel(state = null) {
      const family = getCoachActionFamily(state);
      const status = String(state && state.status ? state.status : '').toLowerCase();
      if (status === 'pending') return family === 'reaction' ? 'Reaction Pending' : 'Draw Pending';
      return family === 'reaction' ? 'Reaction Review' : 'Draw Review';
    }

    function renderCoachReasons(root, reasons = []) {
      if (!root) return;
      const items = Array.isArray(reasons)
        ? reasons.filter((item) => typeof item === 'string' && item.trim())
        : [];
      if (!items.length) {
        root.innerHTML = '';
        return;
      }
      root.innerHTML = items
        .slice(0, 3)
        .map((reason) => `<div class="coach-card-reason-item">${reason}</div>`)
        .join('');
    }

    function clearCoachAutoDismissTimer() {
      if (!coachAutoDismissTimer) return;
      cancelTimeout(coachAutoDismissTimer);
      coachAutoDismissTimer = null;
    }

    function clearReviewAutoDismissTimer() {
      if (!reviewAutoDismissTimer) return;
      cancelTimeout(reviewAutoDismissTimer);
      reviewAutoDismissTimer = null;
    }

    function scheduleCoachAutoDismiss(signature = null) {
      clearCoachAutoDismissTimer();
      activeCoachAutoDismissSignature = signature || null;
      if (!signature) return;
      coachAutoDismissTimer = scheduleTimeout(() => {
        coachAutoDismissTimer = null;
        if (!activeCoachAutoDismissSignature || activeCoachAutoDismissSignature !== signature) return;
        dismissedCoachSignature = signature;
        renderCenterInfo();
      }, AUTO_DISMISS_MS);
    }

    function scheduleReviewAutoDismiss(signature = null) {
      clearReviewAutoDismissTimer();
      activeReviewAutoDismissSignature = signature || null;
      if (!signature) return;
      reviewAutoDismissTimer = scheduleTimeout(() => {
        reviewAutoDismissTimer = null;
        if (!activeReviewAutoDismissSignature || activeReviewAutoDismissSignature !== signature) return;
        dismissedReviewSignature = signature;
        renderCenterInfo();
      }, AUTO_DISMISS_MS);
    }

    function renderCoachCard(coachState = null) {
      const root = document.getElementById('coach-card');
      const kickerEl = document.getElementById('coach-card-kicker');
      const modeEl = document.getElementById('coach-card-mode');
      const statusEl = document.getElementById('coach-card-status');
      const metaEl = document.getElementById('coach-card-meta');
      const summaryEl = document.getElementById('coach-card-summary');
      const recommendEl = document.getElementById('coach-card-recommend');
      const reasonSummaryEl = document.getElementById('coach-card-reason-summary');
      const reasonsEl = document.getElementById('coach-card-reasons');
      const closeBtn = document.getElementById('coach-card-close');
      if (!root) return;

      const combinedState = coachState && typeof coachState === 'object' ? coachState : null;
      const state = combinedState && combinedState.liveState && typeof combinedState.liveState === 'object'
        ? combinedState.liveState
        : (combinedState && !combinedState.reviewMode ? combinedState : null);
      const status = state && typeof state.status === 'string' && state.status ? state.status : 'idle';
      const recommended = state && state.recommended && typeof state.recommended === 'object'
        ? state.recommended
        : null;
      const signature = getCoachStateSignature(state);
      const isHidden = Boolean(state && state.hidden);
      const hasActiveSuggestion = Boolean(state) && status !== 'idle' && !isHidden && signature !== dismissedCoachSignature;
      const metaParts = [];
      const coachFamily = getCoachActionFamily(state);
      const coachPhase = state && state.reviewMode
        ? (status === 'pending' ? 'pending-review' : 'review')
        : 'live';

      root.dataset.status = status;
      root.dataset.family = coachFamily;
      root.dataset.phase = coachPhase;
      root.classList.toggle('is-active', hasActiveSuggestion);
      root.classList.toggle('is-dismissed', !hasActiveSuggestion && Boolean(state) && status !== 'idle');
      if (hasActiveSuggestion && signature) {
        if (activeCoachAutoDismissSignature !== signature) {
          scheduleCoachAutoDismiss(signature);
        }
      } else {
        clearCoachAutoDismissTimer();
        activeCoachAutoDismissSignature = null;
      }
      if (closeBtn) {
        closeBtn.style.display = hasActiveSuggestion ? '' : 'none';
        closeBtn.onclick = function() {
          clearCoachAutoDismissTimer();
          activeCoachAutoDismissSignature = null;
          dismissedCoachSignature = signature;
          renderCenterInfo();
        };
      }

      if (kickerEl) kickerEl.textContent = formatCoachKickerLabel(state);
      if (modeEl) modeEl.textContent = formatCoachModeLabel(state);
      if (statusEl) statusEl.textContent = formatCoachStatusLabel(status);
      if (state && state.source) metaParts.push(`来源 ${state.source}`);
      if (state && state.perspectiveSeat) metaParts.push(`视角 ${formatCoachSeatLabel(state.perspectiveSeat)}`);
      if (recommended && recommended.seat) metaParts.push(`动作位 ${formatCoachSeatLabel(recommended.seat)}`);
      if (metaEl) metaEl.textContent = metaParts.join(' · ') || (hasActiveSuggestion ? '已接入教练状态' : '等待建议接入');
      if (summaryEl) {
        summaryEl.textContent = state && typeof state.summary === 'string' && state.summary.trim()
          ? state.summary.trim()
          : (status === 'error'
            ? '教练建议生成失败，当前仅保留占位协议。'
            : (hasActiveSuggestion ? '教练已给出当前回合建议。' : '当前还没有教练建议。'));
      }
      if (recommendEl) {
        recommendEl.textContent = state && typeof state.humanRecommended === 'string' && state.humanRecommended.trim()
          ? state.humanRecommended.trim()
          : (status === 'loading'
            ? '正在等待复盘结果'
            : (state && state.source === 'auto-review-unavailable'
              ? '这一步暂时没有可用参考'
              : formatCoachRecommendedText(recommended)));
      }
      if (reasonSummaryEl) {
        reasonSummaryEl.textContent = state && typeof state.reasonSummary === 'string' && state.reasonSummary.trim()
          ? state.reasonSummary.trim()
          : (hasActiveSuggestion ? '当前还没有额外解释理由。' : '当前还没有解释理由。');
      }
      renderCoachReasons(reasonsEl, state && Array.isArray(state.reasons) ? state.reasons : []);
    }

    function renderReviewCard(coachState = null) {
      const root = document.getElementById('review-card');
      const kickerEl = document.getElementById('review-card-kicker');
      const modeEl = document.getElementById('review-card-mode');
      const statusEl = document.getElementById('review-card-status');
      const metaEl = document.getElementById('review-card-meta');
      const summaryEl = document.getElementById('review-card-summary');
      const recommendEl = document.getElementById('review-card-recommend');
      const reasonSummaryEl = document.getElementById('review-card-reason-summary');
      const reasonsEl = document.getElementById('review-card-reasons');
      const closeBtn = document.getElementById('review-card-close');
      if (!root) return;

      const combinedState = coachState && typeof coachState === 'object' ? coachState : null;
      const state = combinedState && combinedState.reviewState && typeof combinedState.reviewState === 'object'
        ? combinedState.reviewState
        : (combinedState && combinedState.reviewMode ? combinedState : null);
      const status = state && typeof state.status === 'string' && state.status ? state.status : 'idle';
      const recommended = state && state.recommended && typeof state.recommended === 'object'
        ? state.recommended
        : null;
      const signature = getCoachStateSignature(state);
      const isHidden = Boolean(state && state.hidden);
      const hasActiveReview = Boolean(state) && status !== 'idle' && !isHidden && signature !== dismissedReviewSignature;
      const metaParts = [];
      const coachFamily = getCoachActionFamily(state);
      const coachPhase = status === 'pending' ? 'pending-review' : 'review';

      root.dataset.status = status;
      root.dataset.family = coachFamily;
      root.dataset.phase = coachPhase;
      root.classList.toggle('is-active', hasActiveReview);
      root.classList.toggle('is-dismissed', !hasActiveReview && Boolean(state) && status !== 'idle');
      if (hasActiveReview && signature) {
        if (activeReviewAutoDismissSignature !== signature) {
          scheduleReviewAutoDismiss(signature);
        }
      } else {
        clearReviewAutoDismissTimer();
        activeReviewAutoDismissSignature = null;
      }
      if (closeBtn) {
        closeBtn.style.display = hasActiveReview ? '' : 'none';
        closeBtn.onclick = function() {
          clearReviewAutoDismissTimer();
          activeReviewAutoDismissSignature = null;
          dismissedReviewSignature = signature;
          renderCenterInfo();
        };
      }

      if (kickerEl) kickerEl.textContent = formatReviewKickerLabel(state);
      if (modeEl) modeEl.textContent = formatCoachModeLabel({
        ...(state || {}),
        reviewMode: true
      });
      if (statusEl) statusEl.textContent = formatReviewStatusLabel(status);
      if (state && state.source) metaParts.push(`来源 ${state.source}`);
      if (state && state.perspectiveSeat) metaParts.push(`视角 ${formatCoachSeatLabel(state.perspectiveSeat)}`);
      if (recommended && recommended.seat) metaParts.push(`动作位 ${formatCoachSeatLabel(recommended.seat)}`);
      if (metaEl) metaEl.textContent = metaParts.join(' · ') || (hasActiveReview ? '已接入复盘状态' : '等待复盘接入');
      if (summaryEl) {
        summaryEl.textContent = state && typeof state.summary === 'string' && state.summary.trim()
          ? state.summary.trim()
          : (hasActiveReview ? '这一步的复盘已经生成。' : '当前还没有复盘。');
      }
      if (recommendEl) {
        recommendEl.textContent = state && typeof state.humanRecommended === 'string' && state.humanRecommended.trim()
          ? state.humanRecommended.trim()
          : (state && state.source === 'auto-review-unavailable'
            ? '这一步暂时没有可用参考'
            : (status === 'pending'
              ? '正在等待模打建议返回'
              : formatCoachRecommendedText(recommended)));
      }
      if (reasonSummaryEl) {
        reasonSummaryEl.textContent = state && typeof state.reasonSummary === 'string' && state.reasonSummary.trim()
          ? state.reasonSummary.trim()
          : (hasActiveReview ? '复盘理由正在整理。' : '当前还没有复盘说明。');
      }
      renderCoachReasons(reasonsEl, state && Array.isArray(state.reasons) ? state.reasons : []);
    }

    function formatAnalysisStatusLabel(status) {
      const labels = {
        idle: '待命',
        ready: '分析就绪',
        loading: '分析中',
        error: '分析失败'
      };
      return labels[String(status || '').toLowerCase()] || String(status || '待命');
    }

    function formatAnalysisRate(value) {
      const number = Number(value);
      if (!Number.isFinite(number)) return '-';
      return `${Math.round(number * 100)}%`;
    }

    function renderAnalysisCard(analysisState = null) {
      const root = document.getElementById('analysis-card');
      const statusEl = document.getElementById('analysis-card-status');
      const metaEl = document.getElementById('analysis-card-meta');
      const summaryEl = document.getElementById('analysis-card-summary');
      const metricsEl = document.getElementById('analysis-card-metrics');
      const focusEl = document.getElementById('analysis-card-focus');
      const closeBtn = document.getElementById('analysis-card-close');
      if (!root) return;

      const state = analysisState && typeof analysisState === 'object' ? analysisState : null;
      const status = state && typeof state.status === 'string' && state.status ? state.status : 'idle';
      const report = state && state.report && typeof state.report === 'object' ? state.report : null;
      const subjects = report && Array.isArray(report.subjects) ? report.subjects : [];
      const primary = subjects[0] || null;
      const summary = primary && primary.summary ? primary.summary : null;
      const signature = getAnalysisStateSignature(state);
      const hasActiveState = Boolean(state) && status !== 'idle' && signature !== dismissedAnalysisSignature;
      const metaParts = [];
      const focusBuckets = summary && summary.bucketCounts
        ? Object.entries(summary.bucketCounts).sort((left, right) => Number(right[1]) - Number(left[1]))
        : [];

      root.dataset.status = status;
      root.classList.toggle('is-active', hasActiveState);
      root.classList.toggle('is-dismissed', !hasActiveState && Boolean(state) && status !== 'idle');
      if (closeBtn) {
        closeBtn.style.display = hasActiveState ? '' : 'none';
        closeBtn.onclick = function() {
          dismissedAnalysisSignature = signature;
          renderCenterInfo();
        };
      }

      if (statusEl) statusEl.textContent = formatAnalysisStatusLabel(status);
      if (state && state.source) metaParts.push(`来源 ${state.source}`);
      if (summary && summary.label) metaParts.push(`对象 ${summary.label}`);
      if (report && report.totals && Number.isFinite(Number(report.totals.subjects))) {
        metaParts.push(`样本对象 ${report.totals.subjects}`);
      }
      if (metaEl) metaEl.textContent = metaParts.join(' · ') || (hasActiveState ? '已接入分析状态' : '等待分析接入');
      if (summaryEl) {
        summaryEl.textContent = state && typeof state.summary === 'string' && state.summary.trim()
          ? state.summary.trim()
          : (summary
            ? '当前对象的参考对照分析已生成，可继续细化到玩家、各 AI 和恶手分布。'
            : '这个版块会专门展示参考一致率、善手恶手和分歧分布。');
      }
      if (metricsEl) {
        metricsEl.textContent = summary
          ? `参考一致率 ${formatAnalysisRate(summary.mortalRate)} · 动作族一致率 ${formatAnalysisRate(summary.actionTypeRate)} · 立直一致率 ${formatAnalysisRate(summary.riichiRate)} · 善手 ${summary.goodCount} / 中性 ${summary.neutralCount} / 恶手 ${summary.badCount}`
          : '暂无分析数据';
      }
      if (focusEl) {
        focusEl.textContent = focusBuckets.length
          ? `重点分歧: ${focusBuckets.slice(0, 3).map(([bucket, count]) => `${bucket} x${count}`).join(' · ')}`
          : '暂无重点问题';
      }
    }

    function renderKitaArea(targetId, tiles = []) {
      const target = document.getElementById(targetId);
      if (!target) return;
      const kitaTiles = Array.isArray(tiles)
        ? tiles
          .filter((tile) => tile && tile.open && tile.asset)
          .slice(0, 4)
        : [];
      const fragment = document.createDocumentFragment();
      kitaTiles.forEach((tile) => {
        const tileElement = createTileElement({
          ...tile,
          kind: 'flat',
          hidden: false
        });
        if (tileElement) {
          fragment.appendChild(tileElement);
        }
      });
      target.innerHTML = '';
      target.appendChild(fragment);
    }

    function renderTableLayoutMode() {
      const tableInfoState = getTableInfoState();
      const root = getAppRoot();
      const board = document.querySelector('.board-container');
      if (!root) return;

      const layout = typeof tableInfoState.tableLayout === 'string' && tableInfoState.tableLayout
        ? tableInfoState.tableLayout
        : (Number(tableInfoState.tableSize) === 3 ? '3p-rounded-triangle' : '4p-octagon');
      const uiMode = typeof tableInfoState.uiMode === 'string' && tableInfoState.uiMode
        ? tableInfoState.uiMode
        : (Number(tableInfoState.tableSize) === 3 ? 'sanma' : 'standard');
      const ruleset = typeof tableInfoState.ruleset === 'string' && tableInfoState.ruleset
        ? tableInfoState.ruleset
        : '';

      root.classList.toggle('layout-4p-octagon', layout === '4p-octagon');
      root.classList.toggle('layout-2p-opposed', layout === '2p-opposed');
      root.classList.toggle('layout-3p-rounded-triangle', layout === '3p-rounded-triangle');
      root.classList.toggle('mode-sanma', uiMode === 'sanma');
      root.classList.toggle('mode-heads-up', uiMode === 'heads-up');
      root.dataset.tableLayout = layout;
      root.dataset.tableSize = String(tableInfoState.tableSize || 4);
      root.dataset.ruleset = ruleset;
      root.dataset.uiMode = uiMode;

      if (board) {
        board.dataset.tableLayout = layout;
        board.dataset.tableSize = String(tableInfoState.tableSize || 4);
        board.dataset.ruleset = ruleset;
        board.dataset.uiMode = uiMode;
      }
    }

    function renderTableRiichiAlert(bottomSeatState, opponentSeats) {
      const root = getAppRoot();
      const board = document.querySelector('.board-container');
      const orientalBase = document.getElementById('oriental-base');
      const seats = [bottomSeatState].concat(Array.isArray(opponentSeats) ? opponentSeats : []);
      const hasRiichiAlert = seats.some((seat) => Boolean(seat && seat.riichi && seat.riichi.active));

      if (root) root.classList.toggle('is-riichi-alert', hasRiichiAlert);
      if (board) board.classList.toggle('is-riichi-alert', hasRiichiAlert);
      if (orientalBase) orientalBase.classList.toggle('is-riichi-alert', hasRiichiAlert);
    }

    function renderSeatVisibility() {
      const tableInfoState = getTableInfoState();
      const activeSeats = new Set(Array.isArray(tableInfoState.activeSeats) && tableInfoState.activeSeats.length
        ? tableInfoState.activeSeats
        : ['bottom', 'right', 'top', 'left']);
      const seatElementMap = {
        bottom: document.getElementById('seat-bottom'),
        right: document.getElementById('seat-right'),
        top: document.getElementById('seat-top'),
        left: document.getElementById('seat-left')
      };
      const windElementMap = {
        bottom: document.getElementById('wind-bottom'),
        right: document.getElementById('wind-right'),
        top: document.getElementById('wind-top'),
        left: document.getElementById('wind-left')
      };
      const scoreElementMap = {
        bottom: document.getElementById('score-bottom'),
        right: document.getElementById('score-right'),
        top: document.getElementById('score-top'),
        left: document.getElementById('score-left')
      };

      Object.entries(seatElementMap).forEach(([seatKey, element]) => {
        if (!element) return;
        element.style.display = activeSeats.has(seatKey) ? '' : 'none';
      });
      Object.entries(windElementMap).forEach(([seatKey, element]) => {
        if (!element) return;
        element.style.display = activeSeats.has(seatKey) ? '' : 'none';
      });
      Object.entries(scoreElementMap).forEach(([seatKey, element]) => {
        if (!element) return;
        element.style.display = activeSeats.has(seatKey) ? '' : 'none';
      });
    }

    function renderBottomSeatMeta() {
      const bottomSeatMeta = getBottomSeatMeta();
      const titleEl = document.getElementById('bottom-nameplate-title');
      const nameEl = document.getElementById('bottom-nameplate-name');
      if (titleEl) titleEl.textContent = bottomSeatMeta.title || '';
      if (nameEl) nameEl.textContent = bottomSeatMeta.name || '';
    }

    function getCalledTileIndex(meld) {
      if (meld.type === 'kan-concealed') return -1;
      const mapping = { left: 0, across: 1, right: meld.tiles.length - 1 };
      return mapping[meld.source] ?? meld.tiles.length - 1;
    }

    function normalizeMeldTiles(meld) {
      if (meld.type !== 'kan-concealed') return meld.tiles;
      return meld.tiles.map((tile, index) => (
        index === 0 || index === meld.tiles.length - 1
          ? { ...tile, hidden: true }
          : tile
      ));
    }

    function createMeldGroupElement(meld, options = {}) {
      const tiles = normalizeMeldTiles(meld);
      const calledIndex = getCalledTileIndex(meld);
      const group = document.createElement('div');
      group.className = 'meld-group';

      tiles.forEach((tile, index) => {
        const tileData = {
          ...tile,
          kind: 'flat',
          extraClass: index === calledIndex ? 'tile-called' : ''
        };
        const slot = document.createElement('div');
        slot.className = index === calledIndex ? 'meld-slot called' : 'meld-slot';
        const tileElement = createTileElement(tileData, {
          seatKey: options.seatKey || 'bottom'
        });
        if (tileElement) {
          slot.appendChild(tileElement);
        }
        group.appendChild(slot);
      });

      return group;
    }

    function renderMeldArea(targetId, melds) {
      const target = document.getElementById(targetId);
      if (!target) return;
      const fragment = document.createDocumentFragment();
      const seatKey = target.dataset.seatKey
        || (targetId.startsWith('bottom') || targetId === 'debug-own-meld'
          ? 'bottom'
          : targetId.replace(/^seat-/, '').replace(/-meld$/, ''));

      (melds || []).forEach((meld) => {
        fragment.appendChild(createMeldGroupElement(meld, { seatKey }));
      });

      target.innerHTML = '';
      target.appendChild(fragment);
    }

    function ensureSeatWrapperStructure(seat) {
      const target = document.getElementById(seat.targetId);
      if (!target) return null;
      if (target.dataset.structureReady === 'true') return target;
      target.innerHTML = [
        `<div class="zone river has-tiles"><div class="river-bottom" id="${seat.targetId}-river"></div></div>`,
        `<div class="riichi-stick-zone is-hidden" id="${seat.targetId}-riichi-stick"></div>`,
        `<div class="zone kita has-tiles"><div class="kita-strip" id="${seat.targetId}-kita"></div></div>`,
        `<div class="zone hand has-tiles"><div class="hand-bottom" id="${seat.targetId}-hand"></div></div>`,
        `<div class="zone meld has-tiles"><div class="meld-bottom" id="${seat.targetId}-meld"></div></div>`,
        `<div class="nameplate"><span class="p-title">${seat.title}</span> <span style="font-weight:700">${seat.name}</span></div>`
      ].join('');
      target.dataset.structureReady = 'true';
      return target;
    }

    function renderSeatWrapper(seat) {
      const target = ensureSeatWrapperStructure(seat);
      if (!target) return;
      const seatKey = String(seat.targetId || '').replace(/^seat-/, '') || 'right';
      const titleEl = target.querySelector('.nameplate .p-title');
      const nameEl = target.querySelector('.nameplate span:last-child');
      if (titleEl) titleEl.textContent = seat.title || '';
      if (nameEl) nameEl.textContent = seat.name || '';
      renderRiverGroup(`${seat.targetId}-river`, seat.riverTiles || [], seat.riichi);
      renderKitaArea(`${seat.targetId}-kita`, seat.kitaTiles || []);
      renderTileGroup(`${seat.targetId}-hand`, getSeatHandTilesForRender(seatKey, seat.handTiles || []), { seatKey });
      applyWinnerHandRevealClass(document.getElementById(`${seat.targetId}-hand`), seatKey);
      renderMeldArea(`${seat.targetId}-meld`, seat.melds || []);
      renderRiichiStick(`${seat.targetId}-riichi-stick`, seat.riichi);
    }

    function getSeatSnapshot(seatKey) {
      const seat = getMutableSeatData(seatKey);
      if (!seat) return null;
      return {
        seat: seatKey,
        title: seat.title || '',
        name: seat.name || '',
        riverTiles: (seat.riverTiles || []).map(cloneTile),
        kitaTiles: (seat.kitaTiles || []).map(cloneTile),
        handTiles: (seat.handTiles || []).map(cloneTile),
        melds: (seat.melds || []).map(cloneMeld),
        riichi: cloneRiichiState(seat.riichi),
        handOrderPolicy: cloneHandOrderPolicy(getResolvedHandOrderPolicy(seatKey))
      };
    }

    function renderAll() {
      const bottomRiverTiles = getBottomRiverTiles();
      const bottomHandTiles = getBottomHandTiles();
      const baseBottomMelds = getBaseBottomMelds();
      const bottomSeatState = getBottomSeatState();
      const opponentSeats = getOpponentSeats();

      renderTableLayoutMode();
      renderTableRiichiAlert(bottomSeatState, opponentSeats);
      renderSeatVisibility();
      renderCenterInfo();
      renderBottomSeatMeta();
      renderHandStatusOverlay();
      renderRiverGroup('bottom-river', bottomRiverTiles, bottomSeatState.riichi);
      renderKitaArea('bottom-kita', bottomSeatState.kitaTiles || []);
      renderTileGroup('bottom-hand', getSeatHandTilesForRender('bottom', bottomHandTiles), { seatKey: 'bottom' });
      applyWinnerHandRevealClass(document.getElementById('bottom-hand'), 'bottom');
      renderMeldArea('bottom-meld', baseBottomMelds);
      renderRiichiStick('bottom-riichi-stick', bottomSeatState.riichi);
      renderMeldArea('debug-own-meld', baseBottomMelds);
      opponentSeats.forEach(renderSeatWrapper);
      scheduleTableInteractionProxySync();
      applyBottomHandPreviewClasses();
      playPendingTableAnimations();
    }

    return {
      renderAll,
      getSeatSnapshot,
      renderCenterInfo,
      renderSeatVisibility,
      renderBottomSeatMeta,
      renderSeatWrapper,
      renderTileGroup,
      renderRiverGroup,
      renderMeldArea,
      renderKitaArea,
      renderRiichiStick,
      renderTableLayoutMode
    };
  }

  global.AceMahjongCreateTableRenderer = createTableRenderer;
})(window);
