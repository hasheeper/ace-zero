(function(global) {
  'use strict';

  function createTableInteractions(deps = {}) {
    const normalizeTileCodeKey = typeof deps.normalizeTileCodeKey === 'function'
      ? deps.normalizeTileCodeKey
      : ((value) => String(value || '').trim().toLowerCase());
    const getSeatSnapshot = typeof deps.getSeatSnapshot === 'function' ? deps.getSeatSnapshot : (() => null);
    const getBottomSeatData = typeof deps.getBottomSeatData === 'function'
      ? deps.getBottomSeatData
      : (() => ({ handTiles: [], melds: [] }));
    const getRiichiSelectableBottomHandIndices = typeof deps.getRiichiSelectableBottomHandIndices === 'function'
      ? deps.getRiichiSelectableBottomHandIndices
      : (() => new Set());
    const getHandApi = typeof deps.getHandApi === 'function' ? deps.getHandApi : (() => null);

    let tableInteractionProxyRafId = 0;
    let tableTileInteractionHandler = null;
    let tableTileSelectionHandler = null;
    let bottomHandInteractionHandler = null;
    let tableSelectionMode = 'single';
    let selectedTableTileIds = new Set();
    let defaultPreviewTableTileIds = new Set();
    let previewSelectedTableTileIds = new Set();
    let previewSelectedBottomHandIndices = new Set();
    let hoveredBottomMatchTileCode = null;
    let selectedTableMatchTileCode = null;
    let selectedBoardOnlyTileCode = null;

    function getTileRankValue(code) {
      if (!code || typeof code !== 'string') return code;
      if (code.length < 2) return code;
      return `${code[0]}${code[1] === '0' ? '5' : code[1]}`;
    }

    function getTileCodeKeyFromValue(value) {
      const normalized = normalizeTileCodeKey(value);
      return normalized || null;
    }

    function findUnusedTileIndexByCode(tiles = [], targetCode, usedIndices = new Set()) {
      const normalizedTarget = getTileCodeKeyFromValue(targetCode);
      if (!normalizedTarget) return -1;

      const exactIndex = tiles.findIndex((tile, index) => (
        !usedIndices.has(index)
        && tile
        && getTileCodeKeyFromValue(tile.code) === normalizedTarget
      ));
      if (exactIndex >= 0) return exactIndex;

      const normalizedRankTarget = getTileRankValue(normalizedTarget);
      return tiles.findIndex((tile, index) => (
        !usedIndices.has(index)
        && tile
        && tile.code
        && getTileRankValue(tile.code) === normalizedRankTarget
      ));
    }

    function getBottomOwnedTileCodeSet() {
      const ownedCodes = new Set();
      const bottomSeat = getBottomSeatData();
      (bottomSeat.handTiles || []).forEach((tile) => {
        const code = getTileCodeKeyFromValue(tile && tile.code);
        if (code) ownedCodes.add(code);
      });
      (bottomSeat.kitaTiles || []).forEach((tile) => {
        const code = getTileCodeKeyFromValue(tile && tile.code);
        if (code) ownedCodes.add(code);
      });
      (bottomSeat.melds || []).forEach((meld) => {
        (meld && Array.isArray(meld.tiles) ? meld.tiles : []).forEach((tile) => {
          const code = getTileCodeKeyFromValue(tile && tile.code);
          if (code) ownedCodes.add(code);
        });
      });
      return ownedCodes;
    }

    function hasBottomOwnedTileCode(code) {
      const normalized = getTileCodeKeyFromValue(code);
      if (!normalized) return false;
      return getBottomOwnedTileCodeSet().has(normalized);
    }

    function hasBottomHandTileCode(code) {
      const normalized = getTileCodeKeyFromValue(code);
      if (!normalized) return false;
      const handTiles = getBottomSeatData().handTiles || [];
      return handTiles.some((tile) => getTileCodeKeyFromValue(tile && tile.code) === normalized);
    }

    function getBottomHandTileCodeByIndex(tileIndex) {
      if (!Number.isInteger(tileIndex) || tileIndex < 0) return null;
      const handTiles = getBottomSeatData().handTiles || [];
      return getTileCodeKeyFromValue(handTiles[tileIndex] && handTiles[tileIndex].code);
    }

    function clearTableHoverStates() {
      document.querySelectorAll('.tile-cube.is-hover').forEach((tile) => {
        tile.classList.remove('is-hover');
      });
    }

    function clearBottomHandSelectionStates() {
      document.querySelectorAll('#bottom-hand .tile-cube.is-selected').forEach((tile) => {
        tile.classList.remove('is-selected');
      });
    }

    function clearTableSelectionStates() {
      document.querySelectorAll('.tile-cube.is-selected').forEach((tile) => {
        tile.classList.remove('is-selected');
      });
    }

    function clearBottomHandHover() {
      document.querySelectorAll('#bottom-hand .tile-motion.is-hover').forEach((tile) => {
        tile.classList.remove('is-hover');
      });
      document.querySelectorAll('#bottom-hand .tile-cube.is-hover').forEach((tile) => {
        tile.classList.remove('is-hover');
      });
      hoveredBottomMatchTileCode = null;
      applyTileCodeMatchClasses();
    }

    function setBottomHandHoverIndex(tileIndex) {
      clearBottomHandHover();
      if (!Number.isInteger(tileIndex) || tileIndex < 0) return false;
      const wrappers = Array.from(document.querySelectorAll('#bottom-hand .tile-motion'));
      const wrapper = wrappers[tileIndex];
      if (!wrapper) return false;
      const tile = wrapper.querySelector('.tile-cube');
      wrapper.classList.add('is-hover');
      if (tile) tile.classList.add('is-hover');
      hoveredBottomMatchTileCode = getBottomHandTileCodeByIndex(tileIndex);
      applyTileCodeMatchClasses();
      return true;
    }

    function dispatchBottomHandInteraction(detail = {}) {
      if (typeof bottomHandInteractionHandler !== 'function') return false;
      const tileIndex = Number(detail.tileIndex);
      if (!Number.isInteger(tileIndex) || tileIndex < 0) return false;
      const tiles = Array.from(document.querySelectorAll('#bottom-hand .tile-cube'));
      const tile = tiles[tileIndex] || null;
      if (tile) {
        tile.dispatchEvent(new CustomEvent('mahjong:table-tile-interaction', {
          bubbles: true,
          detail: {
            type: 'click',
            seat: 'bottom',
            area: 'hand',
            tileIndex,
            source: detail.source || 'mirror-layer',
            isBottomHand: true
          }
        }));
      }
      return bottomHandInteractionHandler({
        seat: 'bottom',
        area: 'hand',
        tileIndex,
        source: detail.source || 'mirror-layer'
      }) !== false;
    }

    function createTableProxyDescriptor(tile, index) {
      const seatWrapper = tile.closest('.player-wrapper');
      const seatClass = seatWrapper
        ? Array.from(seatWrapper.classList).find((className) => className.startsWith('seat-')) || ''
        : '';
      const seat = seatClass.replace('seat-', '') || 'unknown';
      const parentArea = tile.closest('.river-bottom, .meld-bottom, .kita-strip');
      if (!parentArea) return null;

      const isRiver = parentArea.classList.contains('river-bottom');
      const isMeld = parentArea.classList.contains('meld-bottom');
      const isKita = parentArea.classList.contains('kita-strip');
      const tileIndex = Array.from(parentArea.querySelectorAll('.tile-cube')).indexOf(tile);
      const tileCode = getTileCodeKeyFromValue(
        tile.closest('.tile-motion') && tile.closest('.tile-motion').dataset
          ? tile.closest('.tile-motion').dataset.tileCode
          : tile.dataset.tileCode
      );

      return {
        id: `${seat}-${isRiver ? 'river' : (isMeld ? 'meld' : 'kita')}-${tileIndex >= 0 ? tileIndex : index}`,
        tile,
        seat,
        area: isRiver ? 'river' : (isMeld ? 'meld' : 'kita'),
        tileIndex: tileIndex >= 0 ? tileIndex : index,
        tileCode
      };
    }

    function getInteractiveTableTiles() {
      const candidates = Array.from(document.querySelectorAll('.river-bottom .tile-cube, .meld-bottom .tile-cube, .kita-strip .tile-cube'));
      return candidates
        .map((tile, index) => createTableProxyDescriptor(tile, index))
        .filter(Boolean);
    }

    function getResolvedSelectedTableMatchTileCode() {
      return hasBottomOwnedTileCode(selectedTableMatchTileCode)
        ? getTileCodeKeyFromValue(selectedTableMatchTileCode)
        : null;
    }

    function applyTileCodeMatchClasses() {
      const hoveredCode = getTileCodeKeyFromValue(hoveredBottomMatchTileCode);
      const selectedCode = getResolvedSelectedTableMatchTileCode();
      const boardOnlyCode = !selectedCode ? getTileCodeKeyFromValue(selectedBoardOnlyTileCode) : null;

      getInteractiveTableTiles().forEach((descriptor) => {
        const code = getTileCodeKeyFromValue(descriptor.tileCode);
        descriptor.tile.classList.toggle('is-match-hover', Boolean(hoveredCode && code === hoveredCode));
        descriptor.tile.classList.toggle('is-match-selected', Boolean(selectedCode && code === selectedCode));
        descriptor.tile.classList.toggle('is-board-only-selected', Boolean(boardOnlyCode && code === boardOnlyCode));
      });

      document.querySelectorAll('.table-interaction-proxy').forEach((proxy) => {
        const code = getTileCodeKeyFromValue(proxy.dataset.tileCode);
        proxy.classList.toggle('is-match-hover', Boolean(hoveredCode && code === hoveredCode));
        proxy.classList.toggle('is-match-selected', Boolean(selectedCode && code === selectedCode));
        proxy.classList.toggle('is-board-only-selected', Boolean(boardOnlyCode && code === boardOnlyCode));
      });

      document.querySelectorAll('#debug-hand-tiles [data-debug-tile-id]').forEach((button) => {
        const code = getTileCodeKeyFromValue(button.dataset.tileCode);
        button.classList.toggle('match-hover', Boolean(hoveredCode && code === hoveredCode));
        button.classList.toggle('match-selected', Boolean(selectedCode && code === selectedCode));
      });
    }

    function emitTableTileInteraction(type, descriptor) {
      const eventDetail = {
        type,
        seat: descriptor.seat,
        area: descriptor.area,
        tileIndex: descriptor.tileIndex,
        targetId: descriptor.id,
        isBottomHand: descriptor.seat === 'bottom' && descriptor.area === 'hand'
      };

      descriptor.tile.dispatchEvent(new CustomEvent('mahjong:table-tile-interaction', {
        bubbles: true,
        detail: eventDetail
      }));

      if (typeof tableTileInteractionHandler === 'function') {
        tableTileInteractionHandler(eventDetail);
      }
    }

    function getSelectedTableTiles() {
      return getInteractiveTableTiles()
        .filter((descriptor) => selectedTableTileIds.has(descriptor.id))
        .map((descriptor) => ({
          targetId: descriptor.id,
          seat: descriptor.seat,
          area: descriptor.area,
          tileIndex: descriptor.tileIndex
        }));
    }

    function emitTableSelectionChange(trigger = 'api') {
      const detail = {
        trigger,
        mode: tableSelectionMode,
        selectedTiles: getSelectedTableTiles()
      };

      document.dispatchEvent(new CustomEvent('mahjong:table-selection-change', {
        detail
      }));

      if (typeof tableTileSelectionHandler === 'function') {
        tableTileSelectionHandler(detail);
      }

      const statusEl = document.getElementById('debug-table-status');
      const modeSingleButton = document.getElementById('debug-table-mode-single');
      const modeMultiButton = document.getElementById('debug-table-mode-multi');
      if (statusEl) {
        statusEl.textContent = `table select: ${tableSelectionMode} · selected: ${selectedTableTileIds.size}`;
      }
      if (modeSingleButton) modeSingleButton.classList.toggle('is-active', tableSelectionMode === 'single');
      if (modeMultiButton) modeMultiButton.classList.toggle('is-active', tableSelectionMode === 'multi');
    }

    function applyTableSelectionClasses() {
      clearTableSelectionStates();
      getInteractiveTableTiles().forEach((descriptor) => {
        descriptor.tile.classList.toggle(
          'is-selected',
          selectedTableTileIds.has(descriptor.id)
            || defaultPreviewTableTileIds.has(descriptor.id)
            || previewSelectedTableTileIds.has(descriptor.id)
        );
      });
      applyTileCodeMatchClasses();
    }

    function applyBottomHandPreviewClasses() {
      clearBottomHandSelectionStates();
      const riichiSelectableIndices = getRiichiSelectableBottomHandIndices();
      const tiles = Array.from(document.querySelectorAll('#bottom-hand .tile-cube'));
      tiles.forEach((tile, index) => {
        tile.classList.toggle(
          'is-selected',
          previewSelectedBottomHandIndices.has(index) || riichiSelectableIndices.has(index)
        );
      });
    }

    function setDefaultPreviewTileIds(tileIds = []) {
      defaultPreviewTableTileIds = new Set((tileIds || []).filter(Boolean));
      applyTableSelectionClasses();
    }

    function clearActionPreviewSelection() {
      previewSelectedTableTileIds.clear();
      previewSelectedBottomHandIndices.clear();
      defaultPreviewTableTileIds.forEach((id) => {
        previewSelectedTableTileIds.add(id);
      });
      applyTableSelectionClasses();
      applyBottomHandPreviewClasses();
    }

    function resolveBottomHandPreviewIndices(handTileCodes = []) {
      const tiles = getBottomSeatData().handTiles || [];
      const usedIndices = new Set();
      const indices = [];

      handTileCodes.forEach((targetCode) => {
        const matchedIndex = findUnusedTileIndexByCode(tiles, targetCode, usedIndices);
        if (matchedIndex >= 0) {
          usedIndices.add(matchedIndex);
          indices.push(matchedIndex);
        }
      });

      return indices;
    }

    function resolveRiverPreviewDescriptorId(target = {}) {
      if (!target || !target.seat || !target.tileCode) return null;
      const seatSnapshot = getSeatSnapshot(target.seat);
      const riverTiles = seatSnapshot && Array.isArray(seatSnapshot.riverTiles) ? seatSnapshot.riverTiles : [];
      const normalizedTarget = getTileCodeKeyFromValue(target.tileCode);

      for (let index = riverTiles.length - 1; index >= 0; index -= 1) {
        const tile = riverTiles[index];
        if (tile && getTileCodeKeyFromValue(tile.code) === normalizedTarget) {
          return `${target.seat}-river-${index}`;
        }
      }

      const normalizedRankTarget = getTileRankValue(normalizedTarget);

      for (let index = riverTiles.length - 1; index >= 0; index -= 1) {
        const tile = riverTiles[index];
        if (tile && tile.code && getTileRankValue(tile.code) === normalizedRankTarget) {
          return `${target.seat}-river-${index}`;
        }
      }

      return null;
    }

    function applyActionPreviewSelection(action = null) {
      clearActionPreviewSelection();
      if (!action || !action.payload || !action.payload.preview) return;
      const preview = action.payload.preview;
      if (Array.isArray(preview.handTileCodes) && preview.handTileCodes.length) {
        resolveBottomHandPreviewIndices(preview.handTileCodes).forEach((index) => {
          previewSelectedBottomHandIndices.add(index);
        });
      }
      const riverDescriptorId = resolveRiverPreviewDescriptorId(preview.riverTarget);
      if (riverDescriptorId) previewSelectedTableTileIds.add(riverDescriptorId);
      applyTableSelectionClasses();
      applyBottomHandPreviewClasses();
    }

    function setTableSelectionMode(mode) {
      tableSelectionMode = mode === 'multi' ? 'multi' : 'single';
      if (tableSelectionMode === 'single' && selectedTableTileIds.size > 1) {
        const first = selectedTableTileIds.values().next().value;
        selectedTableTileIds = new Set(first ? [first] : []);
      }
      applyTableSelectionClasses();
      emitTableSelectionChange('mode');
    }

    function clearSelectedTableTiles() {
      selectedTableTileIds.clear();
      selectedTableMatchTileCode = null;
      selectedBoardOnlyTileCode = null;
      applyTableSelectionClasses();
      emitTableSelectionChange('clear');
    }

    function toggleSelectedTableMatchCode(descriptor) {
      const nextCode = getTileCodeKeyFromValue(descriptor && descriptor.tileCode);
      if (!nextCode) {
        selectedTableMatchTileCode = null;
        selectedBoardOnlyTileCode = null;
        applyTileCodeMatchClasses();
        return;
      }
      if (hasBottomOwnedTileCode(nextCode)) {
        selectedBoardOnlyTileCode = null;
        selectedTableMatchTileCode = selectedTableMatchTileCode === nextCode ? null : nextCode;
        applyTileCodeMatchClasses();
        return;
      }
      selectedTableMatchTileCode = null;
      if (!hasBottomHandTileCode(nextCode)) {
        selectedBoardOnlyTileCode = selectedBoardOnlyTileCode === nextCode ? null : nextCode;
      } else {
        selectedBoardOnlyTileCode = null;
      }
      applyTileCodeMatchClasses();
    }

    function toggleSelectedTableTile(descriptor) {
      if (tableSelectionMode === 'single') {
        const isOnlySelected = selectedTableTileIds.size === 1 && selectedTableTileIds.has(descriptor.id);
        selectedTableTileIds = isOnlySelected ? new Set() : new Set([descriptor.id]);
      } else if (selectedTableTileIds.has(descriptor.id)) {
        selectedTableTileIds.delete(descriptor.id);
      } else {
        selectedTableTileIds.add(descriptor.id);
      }

      applyTableSelectionClasses();
      emitTableSelectionChange('click');
    }

    function syncTableInteractionProxyLayer() {
      const layer = document.getElementById('table-interaction-proxy-layer');
      if (!layer) return;

      clearTableHoverStates();
      layer.innerHTML = '';

      const fragment = document.createDocumentFragment();
      const verticalOffset = -12;

      getInteractiveTableTiles().forEach((descriptor) => {
        const rect = descriptor.tile.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) return;

        descriptor.tile.dataset.hoverProxyId = descriptor.id;

        const proxy = document.createElement('div');
        proxy.className = 'table-interaction-proxy';
        proxy.dataset.targetId = descriptor.id;
        proxy.dataset.seat = descriptor.seat;
        proxy.dataset.area = descriptor.area;
        proxy.dataset.tileCode = descriptor.tileCode || '';
        proxy.setAttribute('role', 'button');
        proxy.style.left = `${rect.left}px`;
        proxy.style.top = `${rect.top + verticalOffset}px`;
        proxy.style.width = `${rect.width}px`;
        proxy.style.height = `${rect.height}px`;

        proxy.addEventListener('mouseenter', () => {
          descriptor.tile.classList.add('is-hover');
          emitTableTileInteraction('hover-enter', descriptor);
        });

        proxy.addEventListener('mouseleave', () => {
          descriptor.tile.classList.remove('is-hover');
          emitTableTileInteraction('hover-leave', descriptor);
        });

        proxy.addEventListener('click', () => {
          emitTableTileInteraction('click', descriptor);
          if (descriptor.area === 'river' || descriptor.area === 'meld' || descriptor.area === 'kita') {
            toggleSelectedTableMatchCode(descriptor);
          }
          if (descriptor.seat === 'bottom' && descriptor.area === 'hand') {
            if (typeof bottomHandInteractionHandler === 'function') {
              bottomHandInteractionHandler({
                seat: descriptor.seat,
                area: descriptor.area,
                tileIndex: descriptor.tileIndex,
                targetId: descriptor.id
              });
            }
            return;
          }
          toggleSelectedTableTile(descriptor);
        });

        fragment.appendChild(proxy);
      });

      layer.appendChild(fragment);
      applyTableSelectionClasses();
      applyTileCodeMatchClasses();
    }

    function scheduleTableInteractionProxySync(durationMs = 0) {
      if (tableInteractionProxyRafId) {
        cancelAnimationFrame(tableInteractionProxyRafId);
        tableInteractionProxyRafId = 0;
      }

      const deadline = performance.now() + Math.max(0, durationMs);
      const tick = () => {
        syncTableInteractionProxyLayer();
        if (performance.now() < deadline) {
          tableInteractionProxyRafId = requestAnimationFrame(tick);
        } else {
          tableInteractionProxyRafId = 0;
        }
      };

      tick();
    }

    function setTileInteractionHandler(handler) {
      tableTileInteractionHandler = typeof handler === 'function' ? handler : null;
    }

    function setTileSelectionHandler(handler) {
      tableTileSelectionHandler = typeof handler === 'function' ? handler : null;
    }

    function setBottomHandInteractionHandler(handler) {
      bottomHandInteractionHandler = typeof handler === 'function' ? handler : null;
      scheduleTableInteractionProxySync(180);
    }

    function getSelectionMode() {
      return tableSelectionMode;
    }

    function getBottomHandInteractionHandler() {
      return bottomHandInteractionHandler;
    }

    return {
      scheduleTableInteractionProxySync,
      syncTableInteractionProxyLayer,
      getInteractiveTableTiles,
      emitTableSelectionChange,
      clearTableHoverStates,
      clearBottomHandHover,
      setBottomHandHoverIndex,
      dispatchBottomHandInteraction,
      getSelectedTableTiles,
      getSelectionMode,
      setTableSelectionMode,
      clearSelectedTableTiles,
      applyTileCodeMatchClasses,
      applyBottomHandPreviewClasses,
      clearActionPreviewSelection,
      applyActionPreviewSelection,
      resolveBottomHandPreviewIndices,
      resolveRiverPreviewDescriptorId,
      setTileInteractionHandler,
      setTileSelectionHandler,
      setBottomHandInteractionHandler,
      getBottomHandInteractionHandler,
      setDefaultPreviewTileIds
    };
  }

  global.AceMahjongCreateTableInteractions = createTableInteractions;
})(window);
