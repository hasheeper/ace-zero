    let performanceMode = false;
    const frontendConfig = window.AceMahjongFrontendConfig || {};
    const buildSettlementViewModel = window.AceMahjongBuildSettlementViewModel || null;
    const createSettlementPanel = window.AceMahjongCreateSettlementPanel || null;
    const createTableAnimations = window.AceMahjongCreateTableAnimations || null;
    const createRuntimeStatusOverlay = window.AceMahjongCreateRuntimeStatusOverlay || null;
    const createTableRenderer = window.AceMahjongCreateTableRenderer || null;
    const createTableInteractions = window.AceMahjongCreateTableInteractions || null;
    const devLog = window.AceMahjongDevLog || null;
    const uiLogger = devLog && typeof devLog.createScope === 'function'
      ? devLog.createScope('ui')
      : null;
    const assetBase = String(frontendConfig.assetBase || '../../assets').replace(/\/$/, '');
    const DEFAULT_HAND_ORDER_MODE = 'sorted';
    const seatHandOrderPolicies = new Map();
    let interactionState = {
      riichiSelection: {
        active: false,
        legalTileCodes: []
      },
      discardSelection: {
        active: false,
        legalTileCodes: []
      }
    };
    let tableAnimationsApi = null;
    let runtimeStatusOverlayApi = null;
    let tableRendererApi = null;
    let tableInteractionsApi = null;
    let settlementPanelApi = null;
    let settlementActionHandler = null;
    let restoreHandLayerAfterSettlement = false;

    function logUi(level, message, detail) {
      if (!uiLogger || typeof uiLogger[level] !== 'function') return null;
      return uiLogger[level](message, detail);
    }

    function assetUrl(path) {
      return `${assetBase}/${String(path || '').replace(/^\//, '')}`;
    }

    function getEffectiveTileKind(tile) {
      return performanceMode ? 'flat' : tile.kind;
    }

    function cloneTile(tile = {}) {
      return { ...tile };
    }

    function cloneHandOrderPolicy(policy) {
      if (!policy || typeof policy !== 'object') return null;
      return { ...policy };
    }

    function cloneMeld(meld = {}) {
      return {
        ...meld,
        tiles: (meld.tiles || []).map(cloneTile)
      };
    }

    function cloneRiichiState(riichi = {}) {
      return {
        active: Boolean(riichi.active),
        tileIndex: Number.isInteger(riichi.tileIndex) ? riichi.tileIndex : -1,
        displayMode: riichi.displayMode === 'upright' ? 'upright' : 'flat',
        stickVisible: riichi.stickVisible !== false
      };
    }

    function normalizeTileCodeKey(code) {
      const value = String(code || '').trim();
      const match = value.match(/^[mpsz][0-9]/i);
      return match ? match[0].toLowerCase() : value.toLowerCase();
    }

    function formatWaitTileFromCode(code) {
      const normalized = normalizeTileCodeKey(code);
      if (!/^[mpsz][0-9]$/i.test(normalized)) {
        return normalized ? { text: String(code || '').trim() } : null;
      }
      const suitMap = {
        m: '萬',
        p: '筒',
        s: '索',
        z: ''
      };
      const honorMap = {
        z1: '东',
        z2: '南',
        z3: '西',
        z4: '北',
        z5: '白',
        z6: '发',
        z7: '中'
      };
      if (normalized[0] === 'z') {
        return { text: honorMap[normalized] || normalized };
      }
      const rankMap = {
        '0': '五',
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
      return {
        rank: rankMap[normalized[1]] || normalized[1],
        suit: suitMap[normalized[0]] || ''
      };
    }

    function cloneHandStatusOverlayState(state = null) {
      if (state && typeof state === 'object') {
        return JSON.parse(JSON.stringify(state));
      }
      if (!runtimeStatusOverlayApi || typeof runtimeStatusOverlayApi.getBaseOverlay !== 'function') {
        return {
          visible: false,
          tenpai: null,
          furiten: null,
          pao: null,
          kuikae: []
        };
      }
      return runtimeStatusOverlayApi.getBaseOverlay();
    }

    function cloneSimple(value) {
      return value == null ? value : JSON.parse(JSON.stringify(value));
    }

    function normalizeSettlementTileCode(code) {
      const value = String(code || '').trim();
      const match = value.match(/^[mpsz][0-9]/i);
      return match ? match[0].toLowerCase() : null;
    }

    function getSettlementSeatOrder(snapshot = {}) {
      const activeSeats = snapshot && snapshot.info && Array.isArray(snapshot.info.activeSeats) && snapshot.info.activeSeats.length
        ? snapshot.info.activeSeats.slice()
        : null;
      const canonicalOrder = ['bottom', 'right', 'top', 'left'];
      return activeSeats
        ? canonicalOrder.filter((seatKey) => activeSeats.includes(seatKey))
        : canonicalOrder;
    }

    function getSettlementSeatLabels(seatOrder = []) {
      const isHeadsUp = Array.isArray(seatOrder)
        && seatOrder.length === 2
        && seatOrder.includes('bottom')
        && seatOrder.includes('top');
      const labels = isHeadsUp
        ? {
            bottom: '自家',
            top: '对家'
          }
        : {
            bottom: '自',
            right: '下',
            top: '对',
            left: '上'
          };
      return seatOrder.reduce((result, seatKey) => {
        result[seatKey] = labels[seatKey] || seatKey;
        return result;
      }, {});
    }

    function extractSettlementSeatNames(snapshot = {}) {
      const truthSeats = snapshot && snapshot.views && snapshot.views.truthView && snapshot.views.truthView.seats
        ? snapshot.views.truthView.seats
        : null;
      const seats = truthSeats || (snapshot && snapshot.seats ? snapshot.seats : {});
      return getSettlementSeatOrder(snapshot).reduce((result, seatKey) => {
        const seat = seats && seats[seatKey] ? seats[seatKey] : null;
        result[seatKey] = seat && typeof seat.name === 'string' && seat.name
          ? seat.name
          : seatKey;
        return result;
      }, {});
    }

    function extractSettlementWinnerHands(roundResult = null, snapshot = {}) {
      if (!roundResult || roundResult.type !== 'hule') return {};
      const truthSeats = snapshot && snapshot.views && snapshot.views.truthView && snapshot.views.truthView.seats
        ? snapshot.views.truthView.seats
        : null;
      const seats = truthSeats || (snapshot && snapshot.seats ? snapshot.seats : {});
      const winnerSeats = roundResult.multiHule && Array.isArray(roundResult.winners)
        ? roundResult.winners.map((entry) => entry && entry.winnerSeat).filter(Boolean)
        : [roundResult.winnerSeat].filter(Boolean);
      return winnerSeats.reduce((result, seatKey) => {
        const seat = seats && seats[seatKey] ? seats[seatKey] : null;
        const meldTiles = seat && Array.isArray(seat.melds)
          ? seat.melds.reduce((tiles, meld, meldIndex) => {
              const nextTiles = Array.isArray(meld && meld.tiles)
                ? meld.tiles.map((tile, tileIndex) => ({
                    ...cloneTile(tile),
                    extraClass: [
                      tile && tile.extraClass ? tile.extraClass : '',
                      tileIndex === 0 && meldIndex > 0 ? 'tile-group-gap-before' : ''
                    ].filter(Boolean).join(' ')
                  }))
                : [];
              return tiles.concat(nextTiles);
            }, [])
          : [];
        const handTiles = seat && Array.isArray(seat.handTiles)
          ? seat.handTiles.map((tile, tileIndex) => ({
              ...cloneTile(tile),
              extraClass: [
                tile && tile.extraClass ? tile.extraClass : '',
                meldTiles.length && tileIndex === 0 ? 'tile-group-gap-before' : ''
              ].filter(Boolean).join(' ')
            }))
          : [];
        const winnerTiles = meldTiles.concat(handTiles);
        if (winnerTiles.length) {
          result[seatKey] = winnerTiles;
        }
        return result;
      }, {});
    }

    function extractSettlementSeatDeltaMap(roundResult = null, snapshot = {}) {
      if (!roundResult || !roundResult.type) return {};
      const fenpei = roundResult.type === 'draw'
        ? (Array.isArray(roundResult.fenpei) ? roundResult.fenpei : null)
        : (roundResult.result && Array.isArray(roundResult.result.fenpei) ? roundResult.result.fenpei : null);
      const seatWinds = snapshot && snapshot.info && snapshot.info.seatWinds && typeof snapshot.info.seatWinds === 'object'
        ? snapshot.info.seatWinds
        : null;
      const seatOrder = getSettlementSeatOrder(snapshot);

      return seatOrder.reduce((result, seatKey, fallbackIndex) => {
        const windState = seatWinds && seatWinds[seatKey] ? seatWinds[seatKey] : null;
        const windIndex = Number.isInteger(windState && windState.index) ? windState.index : fallbackIndex;
        result[seatKey] = Array.isArray(fenpei) ? Number(fenpei[windIndex] || 0) : 0;
        return result;
      }, {});
    }

    function restoreHandLayerAfterSettlementIfNeeded() {
      if (!restoreHandLayerAfterSettlement) return;
      restoreHandLayerAfterSettlement = false;
      if (handApi && typeof handApi.show === 'function') {
        handApi.show();
      }
    }

    function buildSettlementPayload(payload = {}) {
      const snapshot = payload.snapshot || getRuntimeSnapshot() || {};
      const roundResult = payload.roundResult || (snapshot && snapshot.roundResult) || null;
      if (!roundResult) return null;
      const wallState = snapshot && snapshot.wallState ? snapshot.wallState : {};
      const winnerHands = payload.winnerHands || extractSettlementWinnerHands(roundResult, snapshot);
      const seatNames = payload.seatNames || extractSettlementSeatNames(snapshot);
      const seatOrder = payload.seatOrder || getSettlementSeatOrder(snapshot);
      return {
        roundResult: cloneSimple(roundResult),
        roundText: snapshot && snapshot.info ? snapshot.info.roundText : '',
        seatNames,
        seatDeltaMap: extractSettlementSeatDeltaMap(roundResult, snapshot),
        wallState: cloneSimple(wallState),
        doraIndicators: wallState && Array.isArray(wallState.doraIndicators)
          ? cloneSimple(wallState.doraIndicators)
          : [],
        uraDoraIndicators: wallState && Array.isArray(wallState.uraDoraIndicators)
          ? cloneSimple(wallState.uraDoraIndicators)
          : [],
        winnerHands: cloneSimple(winnerHands),
        winningTile: payload.winningTile || normalizeSettlementTileCode(roundResult.rongpai || roundResult.tileCode || null),
        seatOrder,
        seatLabels: payload.seatLabels || getSettlementSeatLabels(seatOrder)
      };
    }

    function openSettlementPanel(payload = {}) {
      if (!settlementPanelApi || typeof buildSettlementViewModel !== 'function') return null;
      const settlementPayload = buildSettlementPayload(payload);
      if (!settlementPayload) return null;
      const viewModel = buildSettlementViewModel(settlementPayload);
      if (!viewModel) return null;
      if (viewModel.type === 'hule' && handApi && typeof handApi.getState === 'function' && typeof handApi.hide === 'function') {
        const handState = handApi.getState();
        restoreHandLayerAfterSettlement = Boolean(handState && handState.visible);
        if (restoreHandLayerAfterSettlement) {
          handApi.hide();
        }
      } else {
        restoreHandLayerAfterSettlement = false;
      }
      settlementPanelApi.open(viewModel);
      return viewModel;
    }

    function closeSettlementPanel() {
      if (!settlementPanelApi || typeof settlementPanelApi.close !== 'function') return null;
      const closedViewModel = settlementPanelApi.close();
      restoreHandLayerAfterSettlementIfNeeded();
      return closedViewModel;
    }

    function getResolvedHandStatusOverlayState() {
      if (!runtimeStatusOverlayApi || typeof runtimeStatusOverlayApi.getResolvedOverlay !== 'function') {
        return cloneHandStatusOverlayState();
      }
      return runtimeStatusOverlayApi.getResolvedOverlay();
    }

    function applyHandStatusOverlayToTiles(tiles = [], options = {}) {
      if (!runtimeStatusOverlayApi || typeof runtimeStatusOverlayApi.applyToTiles !== 'function') return tiles;
      return runtimeStatusOverlayApi.applyToTiles(tiles, options);
    }

    function splitTileExtraClass(extraClass = '') {
      const tokens = String(extraClass || '')
        .split(/\s+/)
        .map((token) => token.trim())
        .filter(Boolean);
      const wrapperTokens = [];
      const tileTokens = [];

      tokens.forEach((token) => {
        if (token === 'hand-gap') wrapperTokens.push('draw-gap');
        else tileTokens.push(token);
      });

      return {
        wrapperClass: wrapperTokens.join(' '),
        tileClass: tileTokens.join(' ')
      };
    }

    function normalizeTile(tile = {}, fallbackKind = 'flat') {
      const hasDisplayOrder = tile.displayOrder != null && Number.isFinite(Number(tile.displayOrder));
      return {
        asset: tile.asset,
        label: tile.label || tile.asset || '',
        kind: tile.kind || fallbackKind,
        hidden: Boolean(tile.hidden),
        open: tile.open !== false,
        extraClass: tile.extraClass || '',
        code: tile.code || null,
        displayOrder: hasDisplayOrder ? Number(tile.displayOrder) : null
      };
    }

    function normalizeTiles(tiles = [], fallbackKind = 'flat') {
      return (tiles || []).map((tile) => normalizeTile(tile, fallbackKind));
    }

    function createDisplayTileFromCode(code, fallbackKind = 'stand') {
      const normalized = normalizeTileCodeKey(code);
      if (!/^[mpsz][0-9]$/i.test(normalized)) return null;
      const suit = normalized[0];
      const rank = normalized[1];
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
      const honorAssets = {
        z1: { asset: 'Ton', label: '东' },
        z2: { asset: 'Nan', label: '南' },
        z3: { asset: 'Shaa', label: '西' },
        z4: { asset: 'Pei', label: '北' },
        z5: { asset: 'Haku', label: '白' },
        z6: { asset: 'Hatsu', label: '发' },
        z7: { asset: 'Chun', label: '中' }
      };
      if (suit === 'z') {
        const honor = honorAssets[normalized];
        return honor ? normalizeTile({
          asset: honor.asset,
          label: honor.label,
          code: normalized
        }, fallbackKind) : null;
      }

      const suitAssets = {
        m: 'Man',
        p: 'Pin',
        s: 'Sou'
      };
      const rankAsset = rank === '0' ? '5-Dora' : rank;
      return normalizeTile({
        asset: `${suitAssets[suit]}${rankAsset}`,
        label: `${rankLabels[rank] || rank}${suitLabels[suit] || ''}`,
        code: normalized
      }, fallbackKind);
    }

    function getRiichiSelectableBottomHandIndices() {
      const selection = interactionState && interactionState.riichiSelection ? interactionState.riichiSelection : null;
      if (!selection || !selection.active) return new Set();
      const legalCodes = new Set(Array.isArray(selection.legalTileCodes) ? selection.legalTileCodes : []);
      const indices = new Set();
      bottomHandTiles.forEach((tile, index) => {
        if (tile && tile.code && legalCodes.has(tile.code)) {
          indices.add(index);
        }
      });
      return indices;
    }

    function normalizeMeld(meld = {}) {
      return {
        type: meld.type || 'chi',
        source: meld.source || 'right',
        tiles: normalizeTiles(meld.tiles || [], 'flat')
      };
    }

    function formatScore(value) {
      const safeValue = Number.isFinite(Number(value)) ? Number(value) : 0;
      return safeValue.toLocaleString('en-US');
    }

    function queueTableAnimation(type, target) {
      if (!tableAnimationsApi || typeof tableAnimationsApi.queueTableAnimation !== 'function') return;
      tableAnimationsApi.queueTableAnimation(type, target);
    }

    function getDefaultTileSortValue(tile = {}) {
      const code = String(tile.code || '');
      if (/^[mpsz][0-9]$/.test(code)) {
        const suitOrder = { m: 0, p: 1, s: 2, z: 3 };
        const digit = code[1] === '0' ? 5 : Number(code[1]);
        return (suitOrder[code[0]] ?? 9) * 100 + digit;
      }

      const asset = String(tile.asset || '');
      const suitMatch = asset.match(/^(Man|Pin|Sou)(\d+)/);
      if (suitMatch) {
        const suitOrder = { Man: 0, Pin: 1, Sou: 2 };
        return (suitOrder[suitMatch[1]] ?? 9) * 100 + Number(suitMatch[2]);
      }

      const honorOrder = {
        Ton: 301,
        Nan: 302,
        Shaa: 303,
        Pei: 304,
        Haku: 305,
        Hatsu: 306,
        Chun: 307
      };
      if (asset in honorOrder) return honorOrder[asset];

      return Number.MAX_SAFE_INTEGER;
    }

    function normalizeHandOrderPolicy(policy) {
      if (policy == null) return null;
      if (typeof policy === 'string') {
        return { mode: policy };
      }
      if (typeof policy !== 'object') return null;
      return {
        ...policy,
        mode: typeof policy.mode === 'string' ? policy.mode : DEFAULT_HAND_ORDER_MODE
      };
    }

    function hydrateHandOrderPolicies() {
      const configuredPolicies = frontendConfig.handOrderPolicies;
      if (!configuredPolicies || typeof configuredPolicies !== 'object') return;
      Object.entries(configuredPolicies).forEach(([seatKey, policy]) => {
        const normalized = normalizeHandOrderPolicy(policy);
        if (normalized) seatHandOrderPolicies.set(seatKey, normalized);
      });
    }

    function getResolvedHandOrderPolicy(seatKey) {
      const seatPolicy = normalizeHandOrderPolicy(seatHandOrderPolicies.get(seatKey));
      if (seatPolicy) return seatPolicy;
      const wildcardPolicy = normalizeHandOrderPolicy(seatHandOrderPolicies.get('*'));
      if (wildcardPolicy) return wildcardPolicy;
      return normalizeHandOrderPolicy(frontendConfig.handOrderPolicy) || { mode: DEFAULT_HAND_ORDER_MODE };
    }

    function resolveTileDisplayOrder(tile = {}, seatKey) {
      if (tile.displayOrder != null && Number.isFinite(Number(tile.displayOrder))) {
        return Number(tile.displayOrder);
      }

      const policy = getResolvedHandOrderPolicy(seatKey);
      if (policy && typeof policy.getTileOrder === 'function') {
        const customOrder = Number(policy.getTileOrder(tile, {
          seat: seatKey,
          policy
        }));
        if (Number.isFinite(customOrder)) return customOrder;
      }

      return getDefaultTileSortValue(tile);
    }

    function shouldSeatAutoSortHand(seatKey, desiredTiles = []) {
      const policy = getResolvedHandOrderPolicy(seatKey);
      const mode = String(policy?.mode || DEFAULT_HAND_ORDER_MODE).toLowerCase();
      if (mode === 'preserve' || mode === 'none' || mode === 'manual' || mode === 'locked') {
        return false;
      }

      if (typeof policy?.shouldAutoSort === 'function') {
        return policy.shouldAutoSort({
          seat: seatKey,
          tiles: desiredTiles.map(cloneTile),
          policy
        }) !== false;
      }

      return true;
    }

    function setSeatHandOrderPolicyInternal(seatKey, policy) {
      if (!seatKey) return;
      const normalized = normalizeHandOrderPolicy(policy);
      if (!normalized) {
        seatHandOrderPolicies.delete(seatKey);
        return;
      }
      seatHandOrderPolicies.set(seatKey, normalized);
    }

    function renderHandStatusOverlay() {
      if (!runtimeStatusOverlayApi || typeof runtimeStatusOverlayApi.render !== 'function') return;
      runtimeStatusOverlayApi.render();
    }

    function setHandStatusOverlay(nextState = {}) {
      if (!runtimeStatusOverlayApi || typeof runtimeStatusOverlayApi.setBaseOverlay !== 'function') {
        return cloneHandStatusOverlayState();
      }
      const nextOverlay = runtimeStatusOverlayApi.setBaseOverlay(nextState);
      renderAll();
      if (handApi && typeof handApi.render === 'function') {
        handApi.render();
      }
      return nextOverlay;
    }

    function clearHandStatusOverlay() {
      if (!runtimeStatusOverlayApi || typeof runtimeStatusOverlayApi.clearBaseOverlay !== 'function') {
        return cloneHandStatusOverlayState();
      }
      const clearedOverlay = runtimeStatusOverlayApi.clearBaseOverlay();
      renderAll();
      if (handApi && typeof handApi.render === 'function') {
        handApi.render();
      }
      return clearedOverlay;
    }

    function clearRuntimeHandStatusOverlay() {
      if (!runtimeStatusOverlayApi || typeof runtimeStatusOverlayApi.clearRuntimeOverlay !== 'function') {
        return cloneHandStatusOverlayState();
      }
      const clearedOverlay = runtimeStatusOverlayApi.clearRuntimeOverlay();
      renderHandStatusOverlay();
      return clearedOverlay;
    }

    function renderDebugHandButton(tile = {}, options = {}) {
      const isSelected = Boolean(options.isSelected);
      const isPreview = Boolean(options.isPreview);
      const isKuikae = String(tile.extraClass || '').includes('tile-kuikae');
      const isKuikaeClearing = Boolean(options.isKuikaeClearing) && !isKuikae;
      const isInteractive = options.isInteractive !== false && !isKuikae;
      return [
        `<button class="debug-ui-tile${tile.isDrawn ? ' draw-gap' : ''}${isSelected ? ' selected' : ''}${isPreview ? ' preview' : ''}${isKuikae ? ' is-kuikae' : ''}${isKuikaeClearing ? ' is-kuikae-clearing' : ''}" data-debug-tile-id="${tile.id}" data-tile-code="${normalizeTileCodeKey(tile.code || '')}" aria-label="${tile.label}"${isInteractive ? '' : ' disabled aria-disabled="true"'}>`,
        '  <span class="debug-tile-image-stack" aria-hidden="true">',
        `    <img class="debug-tile-image-layer tile-image-base" src="${tileFrontPngSrc()}" alt="">`,
        `    <img class="debug-tile-image-layer tile-image-face" src="${tileFacePngSrc(tile.asset)}" alt="${tile.label}">`,
        '  </span>',
        (isKuikae || isKuikaeClearing)
          ? `  <span class="kuikae-overlay${isKuikaeClearing ? ' is-clearing' : ''}" aria-hidden="true"><span class="slash-line"></span><span class="ban-text">禁</span></span>`
          : '',
        '</button>'
      ].join('');
    }

    function playPendingTableAnimations() {
      if (!tableAnimationsApi || typeof tableAnimationsApi.playPendingTableAnimations !== 'function') return;
      tableAnimationsApi.playPendingTableAnimations();
    }

    function playCutIn(actionType, options = {}) {
      if (!tableAnimationsApi || typeof tableAnimationsApi.playCutIn !== 'function') return 0;
      return tableAnimationsApi.playCutIn(actionType, options);
    }

    function animateBottomHandDiscard(tileIndex, callback) {
      if (!tableAnimationsApi || typeof tableAnimationsApi.animateBottomHandDiscard !== 'function') {
        if (typeof callback === 'function') callback();
        return;
      }
      tableAnimationsApi.animateBottomHandDiscard(tileIndex, callback);
    }

    function animateSeatHandDiscard(seatKey, tileIndex, callback) {
      if (!tableAnimationsApi || typeof tableAnimationsApi.animateSeatHandDiscard !== 'function') {
        if (typeof callback === 'function') callback();
        return;
      }
      tableAnimationsApi.animateSeatHandDiscard(seatKey, tileIndex, callback);
    }

    function animateReactionMeldCapture(action, callback) {
      if (!tableAnimationsApi || typeof tableAnimationsApi.animateReactionMeldCapture !== 'function') {
        if (typeof callback === 'function') callback();
        return false;
      }
      return tableAnimationsApi.animateReactionMeldCapture(action, callback);
    }

    function tileFacePngSrc(asset) {
      return assetUrl(`riichi-mahjong-tiles/Export/Black/${asset}.png`);
    }

    function tileFrontPngSrc() {
      return assetUrl('riichi-mahjong-tiles/Export/Black/Front.png');
    }

    function getInteractiveTableTiles() {
      if (!tableInteractionsApi || typeof tableInteractionsApi.getInteractiveTableTiles !== 'function') return [];
      return tableInteractionsApi.getInteractiveTableTiles();
    }

    function applyTileCodeMatchClasses() {
      if (!tableInteractionsApi || typeof tableInteractionsApi.applyTileCodeMatchClasses !== 'function') return;
      tableInteractionsApi.applyTileCodeMatchClasses();
    }

    function applyBottomHandPreviewClasses() {
      if (!tableInteractionsApi || typeof tableInteractionsApi.applyBottomHandPreviewClasses !== 'function') return;
      tableInteractionsApi.applyBottomHandPreviewClasses();
    }

    function clearActionPreviewSelection() {
      if (!tableInteractionsApi || typeof tableInteractionsApi.clearActionPreviewSelection !== 'function') return;
      tableInteractionsApi.clearActionPreviewSelection();
    }

    function resolveBottomHandPreviewIndices(handTileCodes = []) {
      if (!tableInteractionsApi || typeof tableInteractionsApi.resolveBottomHandPreviewIndices !== 'function') return [];
      return tableInteractionsApi.resolveBottomHandPreviewIndices(handTileCodes);
    }

    function resolveRiverPreviewDescriptorId(target = {}) {
      if (!tableInteractionsApi || typeof tableInteractionsApi.resolveRiverPreviewDescriptorId !== 'function') return null;
      return tableInteractionsApi.resolveRiverPreviewDescriptorId(target);
    }

    function applyActionPreviewSelection(action = null) {
      if (!tableInteractionsApi || typeof tableInteractionsApi.applyActionPreviewSelection !== 'function') return;
      tableInteractionsApi.applyActionPreviewSelection(action);
    }

    function setTableSelectionMode(mode) {
      if (!tableInteractionsApi || typeof tableInteractionsApi.setTableSelectionMode !== 'function') return;
      tableInteractionsApi.setTableSelectionMode(mode);
    }

    function getTableSelectionMode() {
      if (!tableInteractionsApi || typeof tableInteractionsApi.getSelectionMode !== 'function') return 'single';
      return tableInteractionsApi.getSelectionMode();
    }

    function clearSelectedTableTiles() {
      if (!tableInteractionsApi || typeof tableInteractionsApi.clearSelectedTableTiles !== 'function') return;
      tableInteractionsApi.clearSelectedTableTiles();
    }

    function getSelectedTableTiles() {
      if (!tableInteractionsApi || typeof tableInteractionsApi.getSelectedTableTiles !== 'function') return [];
      return tableInteractionsApi.getSelectedTableTiles();
    }

    function clearTableHoverStates() {
      if (!tableInteractionsApi || typeof tableInteractionsApi.clearTableHoverStates !== 'function') return;
      tableInteractionsApi.clearTableHoverStates();
    }

    function clearBottomHandHoverState() {
      if (!tableInteractionsApi || typeof tableInteractionsApi.clearBottomHandHover !== 'function') return;
      tableInteractionsApi.clearBottomHandHover();
    }

    function setBottomHandHoverIndex(tileIndex) {
      if (!tableInteractionsApi || typeof tableInteractionsApi.setBottomHandHoverIndex !== 'function') return false;
      return tableInteractionsApi.setBottomHandHoverIndex(tileIndex);
    }

    function dispatchBottomHandInteraction(detail = {}) {
      if (!tableInteractionsApi || typeof tableInteractionsApi.dispatchBottomHandInteraction !== 'function') return false;
      return tableInteractionsApi.dispatchBottomHandInteraction(detail);
    }

    function scheduleTableInteractionProxySync(durationMs = 0) {
      if (!tableInteractionsApi || typeof tableInteractionsApi.scheduleTableInteractionProxySync !== 'function') return;
      tableInteractionsApi.scheduleTableInteractionProxySync(durationMs);
    }

    function emitInitialTableSelectionState() {
      if (!tableInteractionsApi || typeof tableInteractionsApi.emitTableSelectionChange !== 'function') return;
      tableInteractionsApi.emitTableSelectionChange('init');
    }

    function renderAll() {
      if (!tableRendererApi || typeof tableRendererApi.renderAll !== 'function') return;
      tableRendererApi.renderAll();
    }

    function getSeatStateByKey(seatKey) {
      if (seatKey === 'bottom') return bottomSeatState;
      const seat = opponentSeats.find((item) => item.targetId === `seat-${seatKey}`);
      return seat || null;
    }

    function setSeatRiichiState(seatKey, nextState = {}) {
      const seatState = getSeatStateByKey(seatKey);
      if (!seatState) return;
      seatState.riichi = {
        active: Boolean(nextState.active),
        tileIndex: Number.isInteger(nextState.tileIndex) ? nextState.tileIndex : -1,
        displayMode: nextState.displayMode === 'upright' ? 'upright' : 'flat',
        stickVisible: nextState.stickVisible !== false
      };
      if (seatState.riichi.active && seatState.riichi.stickVisible !== false) {
        queueTableAnimation('riichi-stick', { type: 'riichi-stick', seat: seatKey });
      }
      renderAll();
    }

    function getBottomSeatData() {
      return {
        title: bottomSeatMeta.title,
        name: bottomSeatMeta.name,
        riverTiles: bottomRiverTiles,
        kitaTiles: Array.isArray(bottomSeatState.kitaTiles) ? bottomSeatState.kitaTiles : [],
        handTiles: bottomHandTiles,
        melds: baseBottomMelds,
        riichi: bottomSeatState.riichi
      };
    }

    function getMutableSeatData(seatKey) {
      if (seatKey === 'bottom') return getBottomSeatData();
      return opponentSeats.find((item) => item.targetId === `seat-${seatKey}`) || null;
    }

    function getSeatSnapshot(seatKey) {
      if (tableRendererApi && typeof tableRendererApi.getSeatSnapshot === 'function') {
        return tableRendererApi.getSeatSnapshot(seatKey);
      }
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

    function getSeatHandTilesForRender(seatKey, baseTiles = []) {
      if (!tableAnimationsApi || typeof tableAnimationsApi.getSeatHandTilesForRender !== 'function') {
        return normalizeTiles(baseTiles, 'stand');
      }
      return tableAnimationsApi.getSeatHandTilesForRender(seatKey, normalizeTiles(baseTiles, 'stand'));
    }

    function applyWinnerHandRevealClass(target, seatKey) {
      if (!tableAnimationsApi || typeof tableAnimationsApi.applyWinnerHandRevealClass !== 'function') return;
      tableAnimationsApi.applyWinnerHandRevealClass(target, seatKey);
    }

    function shouldAnimateHandDrawForSeat(seatKey) {
      if (!tableAnimationsApi || typeof tableAnimationsApi.shouldAnimateHandDrawForSeat !== 'function') {
        return true;
      }
      return tableAnimationsApi.shouldAnimateHandDrawForSeat(seatKey);
    }

    function clearWinnerReveal() {
      if (!tableAnimationsApi || typeof tableAnimationsApi.clearWinnerReveal !== 'function') return false;
      return tableAnimationsApi.clearWinnerReveal();
    }

    function playWinnerReveal(options = {}) {
      if (!tableAnimationsApi || typeof tableAnimationsApi.playWinnerReveal !== 'function') return null;
      return tableAnimationsApi.playWinnerReveal(options);
    }

    function applySeatData(seatKey, nextData = {}) {
      const seat = getMutableSeatData(seatKey);
      if (!seat) return null;

      if (Array.isArray(nextData.riverTiles)) {
        seat.riverTiles.length = 0;
        seat.riverTiles.push(...normalizeTiles(nextData.riverTiles, 'flat'));
      }

      if (Array.isArray(nextData.handTiles)) {
        seat.handTiles.length = 0;
        seat.handTiles.push(...normalizeTiles(nextData.handTiles, seatKey === 'bottom' ? 'stand' : 'stand'));
      }

      if (Array.isArray(nextData.kitaTiles)) {
        const normalizedKitaTiles = normalizeTiles(nextData.kitaTiles, 'flat');
        if (seatKey === 'bottom') {
          bottomSeatState.kitaTiles = normalizedKitaTiles;
        } else {
          seat.kitaTiles = normalizedKitaTiles;
        }
      }

      if (Array.isArray(nextData.melds)) {
        seat.melds.length = 0;
        seat.melds.push(...(nextData.melds || []).map(normalizeMeld));
      }

      if (nextData.riichi) {
        const nextRiichiState = cloneRiichiState(nextData.riichi);
        if (seatKey === 'bottom') {
          bottomSeatState.riichi = nextRiichiState;
        } else {
          seat.riichi = nextRiichiState;
        }
      }

      if (Object.prototype.hasOwnProperty.call(nextData, 'handOrderPolicy')) {
        setSeatHandOrderPolicyInternal(seatKey, nextData.handOrderPolicy);
      }

      if (typeof nextData.title === 'string') {
        if (seatKey === 'bottom') bottomSeatMeta.title = nextData.title;
        else seat.title = nextData.title;
      }

      if (typeof nextData.name === 'string') {
        if (seatKey === 'bottom') bottomSeatMeta.name = nextData.name;
        else seat.name = nextData.name;
      }
    }

    function setSeatData(seatKey, nextData = {}) {
      applySeatData(seatKey, nextData);
      renderAll();
      return getSeatSnapshot(seatKey);
    }

    function setSeatHandOrderPolicy(seatKey, policy) {
      setSeatHandOrderPolicyInternal(seatKey, policy);
      renderAll();
      return cloneHandOrderPolicy(getResolvedHandOrderPolicy(seatKey));
    }

    function setHandOrderPolicies(policyMap = {}) {
      if (!policyMap || typeof policyMap !== 'object') return null;
      Object.entries(policyMap).forEach(([seatKey, policy]) => {
        setSeatHandOrderPolicyInternal(seatKey, policy);
      });
      renderAll();
      return {
        bottom: cloneHandOrderPolicy(getResolvedHandOrderPolicy('bottom')),
        right: cloneHandOrderPolicy(getResolvedHandOrderPolicy('right')),
        top: cloneHandOrderPolicy(getResolvedHandOrderPolicy('top')),
        left: cloneHandOrderPolicy(getResolvedHandOrderPolicy('left'))
      };
    }

    function appendSeatTile(seatKey, area, tile, options = {}) {
      const seat = getMutableSeatData(seatKey);
      if (!seat) return null;

      if (area === 'river') {
        seat.riverTiles.push(normalizeTile(tile, 'flat'));
        if (options.riichi) {
          seat.riichi = {
            active: true,
            tileIndex: seat.riverTiles.length - 1,
            displayMode: options.riichiDisplayMode === 'upright' ? 'upright' : 'flat',
            stickVisible: options.riichiStickVisible !== false
          };
          if (seat.riichi.stickVisible !== false) {
            queueTableAnimation('riichi-stick', { type: 'riichi-stick', seat: seatKey });
          }
        }
        queueTableAnimation('discard', { seat: seatKey, area: 'river', tileIndex: seat.riverTiles.length - 1 });
      } else if (area === 'hand') {
        seat.handTiles.push(normalizeTile(tile, seatKey === 'bottom' ? 'stand' : 'stand'));
      } else {
        return null;
      }

      renderAll();
      return getSeatSnapshot(seatKey);
    }

    function removeSeatTile(seatKey, area, tileIndex) {
      const seat = getMutableSeatData(seatKey);
      if (!seat) return null;
      const list = area === 'river' ? seat.riverTiles : area === 'hand' ? seat.handTiles : null;
      if (!list || !Number.isInteger(tileIndex) || tileIndex < 0 || tileIndex >= list.length) return null;
      const [removed] = list.splice(tileIndex, 1);

      if (area === 'river' && seat.riichi?.active && seat.riichi.tileIndex >= list.length) {
        seat.riichi.tileIndex = list.length - 1;
      }

      renderAll();
      return removed ? cloneTile(removed) : null;
    }

    function pushSeatMeld(seatKey, meld, options = {}) {
      const seat = getMutableSeatData(seatKey);
      if (!seat) return null;
      seat.melds.push(normalizeMeld(meld));
      queueTableAnimation('meld', { seat: seatKey, area: 'meld', tileIndex: seat.melds.length - 1 });
      if (options.consumeRiverIndex != null && Number.isInteger(options.consumeRiverIndex)) {
        removeSeatTile(seatKey, 'river', options.consumeRiverIndex);
        return getSeatSnapshot(seatKey);
      }
      renderAll();
      return getSeatSnapshot(seatKey);
    }

    function applyTableInfo(nextState = {}) {
      if (Number.isInteger(nextState.tableSize)) tableInfoState.tableSize = nextState.tableSize;
      if (Array.isArray(nextState.activeSeats)) tableInfoState.activeSeats = nextState.activeSeats.slice();
      if (Array.isArray(nextState.hiddenSeats)) tableInfoState.hiddenSeats = nextState.hiddenSeats.slice();
      if (typeof nextState.ruleset === 'string') tableInfoState.ruleset = nextState.ruleset;
      if (typeof nextState.tableLayout === 'string') tableInfoState.tableLayout = nextState.tableLayout;
      if (typeof nextState.uiMode === 'string') tableInfoState.uiMode = nextState.uiMode;
      if (typeof nextState.roundText === 'string') tableInfoState.roundText = nextState.roundText;
      if (typeof nextState.advancedMode === 'boolean') tableInfoState.advancedMode = nextState.advancedMode;
      if (typeof nextState.honba === 'number') tableInfoState.honba = nextState.honba;
      if (typeof nextState.riichiSticks === 'number') tableInfoState.riichiSticks = nextState.riichiSticks;
      if (typeof nextState.centerRiichiVisible === 'boolean') tableInfoState.centerRiichiVisible = nextState.centerRiichiVisible;
      if (typeof nextState.centerDoraVisible === 'boolean') tableInfoState.centerDoraVisible = nextState.centerDoraVisible;
      if (typeof nextState.centerKitaVisible === 'boolean') tableInfoState.centerKitaVisible = nextState.centerKitaVisible;
      if (typeof nextState.remaining === 'number') tableInfoState.remaining = nextState.remaining;
      if (typeof nextState.turnSeat === 'string') tableInfoState.turnSeat = nextState.turnSeat;
      if (typeof nextState.dealerSeat === 'string') tableInfoState.dealerSeat = nextState.dealerSeat;
      if (nextState.seatWinds && typeof nextState.seatWinds === 'object') {
        tableInfoState.seatWinds = JSON.parse(JSON.stringify(nextState.seatWinds));
      }
      if (nextState.scores && typeof nextState.scores === 'object') {
        tableInfoState.scores = {
          ...tableInfoState.scores,
          ...nextState.scores
        };
      }
      if (Array.isArray(nextState.doraTiles)) {
        tableInfoState.doraTiles = nextState.doraTiles.slice(0, 5).map((tile) => tile ? ({
          asset: tile.asset,
          label: tile.label || tile.asset || '',
          open: Boolean(tile.open)
        }) : { open: false });
      }
      if (Array.isArray(nextState.kitaTiles)) {
        tableInfoState.kitaTiles = nextState.kitaTiles.slice(0, 4).map((tile) => tile ? ({
          asset: tile.asset,
          label: tile.label || tile.asset || '',
          open: tile.open !== false
        }) : { open: false });
        tableInfoState.kitaCount = tableInfoState.kitaTiles.filter((tile) => tile && tile.open && tile.asset).length;
      }
      if (typeof nextState.kitaCount === 'number') {
        tableInfoState.kitaCount = nextState.kitaCount;
      }
      if (Object.prototype.hasOwnProperty.call(nextState, 'coachState')) {
        tableInfoState.coachState = nextState.coachState ? JSON.parse(JSON.stringify(nextState.coachState)) : null;
      }
      if (Object.prototype.hasOwnProperty.call(nextState, 'coachAnalysisState')) {
        tableInfoState.coachAnalysisState = nextState.coachAnalysisState ? JSON.parse(JSON.stringify(nextState.coachAnalysisState)) : null;
      }
    }

    function setTableInfo(nextState = {}) {
      applyTableInfo(nextState);
      renderAll();
      return getTableState();
    }

    function getTableState() {
      return {
        is25d: appRoot ? appRoot.classList.contains('is-25d') : false,
        performanceMode,
        coachState: tableInfoState.coachState ? JSON.parse(JSON.stringify(tableInfoState.coachState)) : null,
        coachAnalysisState: tableInfoState.coachAnalysisState ? JSON.parse(JSON.stringify(tableInfoState.coachAnalysisState)) : null,
        selectionMode: getTableSelectionMode(),
        selectedTiles: getSelectedTableTiles(),
        handStatusOverlay: cloneHandStatusOverlayState(),
        handOrderPolicies: {
          bottom: cloneHandOrderPolicy(getResolvedHandOrderPolicy('bottom')),
          right: cloneHandOrderPolicy(getResolvedHandOrderPolicy('right')),
          top: cloneHandOrderPolicy(getResolvedHandOrderPolicy('top')),
          left: cloneHandOrderPolicy(getResolvedHandOrderPolicy('left'))
        },
        info: {
          tableSize: tableInfoState.tableSize,
          activeSeats: Array.isArray(tableInfoState.activeSeats) ? tableInfoState.activeSeats.slice() : ['bottom', 'right', 'top', 'left'],
          hiddenSeats: Array.isArray(tableInfoState.hiddenSeats) ? tableInfoState.hiddenSeats.slice() : [],
          ruleset: tableInfoState.ruleset || 'riichi-4p',
          tableLayout: tableInfoState.tableLayout || '4p-octagon',
          uiMode: tableInfoState.uiMode || 'standard',
          advancedMode: tableInfoState.advancedMode,
          roundText: tableInfoState.roundText,
          honba: tableInfoState.honba,
          riichiSticks: tableInfoState.riichiSticks,
          centerRiichiVisible: tableInfoState.centerRiichiVisible,
          centerDoraVisible: tableInfoState.centerDoraVisible,
          centerKitaVisible: tableInfoState.centerKitaVisible,
          remaining: tableInfoState.remaining,
          turnSeat: tableInfoState.turnSeat,
          dealerSeat: tableInfoState.dealerSeat || null,
          seatWinds: tableInfoState.seatWinds ? JSON.parse(JSON.stringify(tableInfoState.seatWinds)) : {},
          scores: { ...tableInfoState.scores },
          doraTiles: (tableInfoState.doraTiles || []).map((tile) => ({ ...tile })),
          kitaTiles: (tableInfoState.kitaTiles || []).map((tile) => ({ ...tile })),
          kitaCount: Number(tableInfoState.kitaCount || 0)
        },
        seats: {
          bottom: getSeatSnapshot('bottom'),
          right: getSeatSnapshot('right'),
          top: getSeatSnapshot('top'),
          left: getSeatSnapshot('left')
        }
      };
    }

    function setTableView(nextState = {}) {
      if (!appRoot.classList.contains('hide-zones') && typeof nextState.hideZones !== 'boolean') {
        appRoot.classList.add('hide-zones');
      }
      if (typeof nextState.is25d === 'boolean') {
        if (nextState.is25d && !performanceMode) appRoot.classList.add('is-25d');
        else appRoot.classList.remove('is-25d');
      }
      if (typeof nextState.hideZones === 'boolean') {
        appRoot.classList.toggle('hide-zones', nextState.hideZones);
      }
      scheduleTableInteractionProxySync(240);
      updateDebugStatusText();
      return getTableState();
    }

    function applySnapshot(snapshot = {}) {
      interactionState = snapshot.interaction && typeof snapshot.interaction === 'object'
        ? {
            riichiSelection: {
              active: Boolean(snapshot.interaction.riichiSelection && snapshot.interaction.riichiSelection.active),
              legalTileCodes: Array.isArray(snapshot.interaction.riichiSelection && snapshot.interaction.riichiSelection.legalTileCodes)
                ? snapshot.interaction.riichiSelection.legalTileCodes.slice()
                : []
            },
            discardSelection: {
              active: Boolean(snapshot.interaction.discardSelection && snapshot.interaction.discardSelection.active),
              legalTileCodes: Array.isArray(snapshot.interaction.discardSelection && snapshot.interaction.discardSelection.legalTileCodes)
                ? snapshot.interaction.discardSelection.legalTileCodes.slice()
                : []
            }
          }
        : {
            riichiSelection: {
              active: false,
              legalTileCodes: []
            },
            discardSelection: {
              active: false,
              legalTileCodes: []
            }
          };
      if (snapshot.info) {
        applyTableInfo(snapshot.info);
      }

      if (snapshot.seats && typeof snapshot.seats === 'object') {
        ['bottom', 'right', 'top', 'left'].forEach((seatKey) => {
          if (!snapshot.seats[seatKey]) return;
          applySeatData(seatKey, snapshot.seats[seatKey]);
        });
      }

      if (snapshot.view && typeof snapshot.view === 'object') {
        if (typeof snapshot.view.is25d === 'boolean') {
          if (snapshot.view.is25d && !performanceMode) appRoot.classList.add('is-25d');
          else appRoot.classList.remove('is-25d');
        }
        if (typeof snapshot.view.hideZones === 'boolean') {
          appRoot.classList.toggle('hide-zones', snapshot.view.hideZones);
        } else {
          appRoot.classList.add('hide-zones');
        }
      } else {
        appRoot.classList.add('hide-zones');
      }

      renderAll();

      if (handApi && typeof handApi.syncFromSnapshot === 'function') {
        handApi.syncFromSnapshot(snapshot);
      }

      if (snapshot.actionWindow && window.AceZeroMahjongUI && window.AceZeroMahjongUI.actions) {
        const actions = window.AceZeroMahjongUI.actions;
        if (Array.isArray(snapshot.actionWindow.actions)) {
          actions.setActions(snapshot.actionWindow.actions);
        }
        if (snapshot.actionWindow.layout) {
          actions.setLayout(snapshot.actionWindow.layout);
        }
        actions.setReactionCountdown(snapshot.actionWindow.countdownEndsAt || null);
        if (snapshot.actionWindow.activeActionKey) {
          actions.setActiveAction(snapshot.actionWindow.activeActionKey);
        }
        if (snapshot.actionWindow.visible === false) actions.hide();
        else if (snapshot.actionWindow.visible === true) actions.show();
      } else if (window.AceZeroMahjongUI && window.AceZeroMahjongUI.actions) {
        const actions = window.AceZeroMahjongUI.actions;
        if (Array.isArray(snapshot.availableActions) && snapshot.availableActions.length) {
          actions.setActions(snapshot.availableActions);
          actions.setReactionCountdown(null);
          actions.show();
        } else {
          actions.hide();
        }
      }

      if (debugPanelModule && typeof debugPanelModule.setRuntimeStatus === 'function') {
        debugPanelModule.setRuntimeStatus(formatRuntimeStatus(snapshot));
      }
      updateDebugStatusText();

      if (!snapshot.roundResult && settlementPanelApi && typeof settlementPanelApi.isOpen === 'function' && settlementPanelApi.isOpen()) {
        settlementPanelApi.close();
      }

      return getTableState();
    }

    function playTableAnimation(type, target = {}) {
      queueTableAnimation(type, target);
      playPendingTableAnimations();
    }

    function createInteractiveHandApi() {
      const layer = document.getElementById('ui-debug-layer');
      const tilesRoot = document.getElementById('debug-hand-tiles');
      const statusEl = document.getElementById('debug-status');
      const hintInput = document.getElementById('debug-hint-input');
      const jsonInput = document.getElementById('debug-hand-json');

      let isVisible = true;
      let isInteractive = true;
      let selectedTileId = null;
      let nextTileId = 1000;
      let isProcessing = false;
      let interactionHandler = null;
      let tiles = defaultDebugHandTiles.map((tile, index) => ({ id: index + 1, ...tile }));
      let previewTileIds = new Set();
      let recentKuikaeClearIds = new Set();
      let lastRenderedKuikaeIds = new Set();
      let kuikaeClearTimer = null;
      let lastRenderedTilesMarkup = '';
      let dealRevealResetTimer = null;

      function serializeTiles() {
        return tiles.map(({ id, ...tile }) => tile);
      }

      function syncTextarea() {
        jsonInput.value = JSON.stringify(serializeTiles(), null, 2);
      }

      function updateStatus() {
        statusEl.textContent = `hand layer: ${isVisible ? 'visible' : 'hidden'} · interactive: ${isInteractive ? 'on' : 'off'} · tiles: ${tiles.length} · selected: ${selectedTileId ?? '-'} · perf: ${performanceMode ? 'on' : 'off'} · table: ${document.getElementById('app').classList.contains('is-25d') ? '2.5D' : '2D'}`;
      }

      function setHint(text) {
        const safeText = text || '请出牌...';
        hintInput.value = safeText;
        updateStatus();
      }

      function normalizeTiles(nextTiles) {
        return (nextTiles || []).map((tile, index) => ({
          id: tile.id ?? (index + 1),
          asset: tile.asset,
          label: tile.label || tile.asset,
          isDrawn: Boolean(tile.isDrawn),
          code: tile.code || null,
          extraClass: tile.extraClass || ''
        }));
      }

      function toDebugTile(tile = {}, index = 0) {
        return {
          id: index + 1,
          asset: tile.asset,
          label: tile.label || tile.asset,
          isDrawn: String(tile.extraClass || '').includes('hand-gap'),
          code: tile.code || null,
          extraClass: tile.extraClass || ''
        };
      }

      function clearKuikaeClearTimer() {
        if (kuikaeClearTimer) {
          clearTimeout(kuikaeClearTimer);
          kuikaeClearTimer = null;
        }
      }

      function clearDealRevealResetTimer() {
        if (!dealRevealResetTimer) return;
        clearTimeout(dealRevealResetTimer);
        dealRevealResetTimer = null;
      }

      function prepareDealReveal() {
        clearDealRevealResetTimer();
        layer.classList.add('is-deal-hidden');
        const tileNodes = Array.from(tilesRoot.querySelectorAll('.debug-ui-tile'));
        tileNodes.forEach((node) => {
          node.classList.remove('anim-deal-in');
          node.style.removeProperty('--deal-delay');
        });
      }

      function scheduleKuikaeClearRender() {
        clearKuikaeClearTimer();
        if (!recentKuikaeClearIds.size) return;
        kuikaeClearTimer = setTimeout(() => {
          recentKuikaeClearIds.clear();
          kuikaeClearTimer = null;
          render();
        }, 260);
      }

      function render() {
        const effectiveTiles = applyHandStatusOverlayToTiles(tiles, { seatKey: 'bottom' });
        const currentKuikaeIds = new Set(
          effectiveTiles
            .filter((tile) => String(tile && tile.extraClass || '').includes('tile-kuikae'))
            .map((tile) => tile.id)
        );
        lastRenderedKuikaeIds.forEach((tileId) => {
          if (!currentKuikaeIds.has(tileId)) recentKuikaeClearIds.add(tileId);
        });
        recentKuikaeClearIds.forEach((tileId) => {
          if (currentKuikaeIds.has(tileId) || !effectiveTiles.some((tile) => tile.id === tileId)) {
            recentKuikaeClearIds.delete(tileId);
          }
        });
        lastRenderedKuikaeIds = currentKuikaeIds;
        scheduleKuikaeClearRender();
        layer.classList.toggle('is-disabled', !isInteractive);
        renderHandStatusOverlay();
        const nextTilesMarkup = effectiveTiles.map((tile) => renderDebugHandButton(tile, {
          isSelected: tile.id === selectedTileId,
          isPreview: previewTileIds.has(tile.id),
          isInteractive,
          isKuikaeClearing: recentKuikaeClearIds.has(tile.id)
        })).join('');
        if (nextTilesMarkup !== lastRenderedTilesMarkup) {
          tilesRoot.innerHTML = nextTilesMarkup;
          lastRenderedTilesMarkup = nextTilesMarkup;
        }
        applyTileCodeMatchClasses();
        syncTextarea();
        updateStatus();
      }

      function show() {
        isVisible = true;
        layer.classList.add('is-visible');
        updateStatus();
        if (window.AceZeroMahjongUI && window.AceZeroMahjongUI.actions) {
          window.AceZeroMahjongUI.actions.updateLayerOffset();
        }
      }

      function hide() {
        isVisible = false;
        layer.classList.remove('is-visible');
        selectedTileId = null;
        updateStatus();
        render();
        if (window.AceZeroMahjongUI && window.AceZeroMahjongUI.actions) {
          window.AceZeroMahjongUI.actions.updateLayerOffset();
        }
      }

      function toggle() {
        if (isVisible) hide();
        else show();
      }

      function setTiles(nextTiles) {
        tiles = normalizeTiles(nextTiles);
        nextTileId = tiles.reduce((maxId, tile) => Math.max(maxId, tile.id), 0) + 1;
        selectedTileId = null;
        previewTileIds.clear();
        isProcessing = false;
        render();
      }

      function setInteractive(enabled) {
        isInteractive = Boolean(enabled);
        if (!isInteractive) {
          selectedTileId = null;
          isProcessing = false;
          if (window.AceZeroMahjongUI && window.AceZeroMahjongUI.table && typeof window.AceZeroMahjongUI.table.clearBottomHandHover === 'function') {
            window.AceZeroMahjongUI.table.clearBottomHandHover();
          }
        }
        render();
      }

      function syncFromSeatData(seatData = {}, options = {}) {
        const nextTiles = Array.isArray(seatData.handTiles)
          ? seatData.handTiles.map(toDebugTile)
          : [];
        setTiles(nextTiles);
        if (typeof options.hint === 'string' && options.hint) {
          setHint(options.hint);
        } else {
          updateStatus();
        }
        if (!isVisible) show();
      }

      function syncFromSnapshot(snapshot = {}) {
        const bottomSeat = snapshot && snapshot.seats ? snapshot.seats.bottom : null;
        const turnSeat = snapshot && snapshot.info ? snapshot.info.turnSeat : null;
        if (runtimeStatusOverlayApi && typeof runtimeStatusOverlayApi.syncFromSnapshot === 'function') {
          runtimeStatusOverlayApi.syncFromSnapshot(snapshot);
        }
        setInteractive(turnSeat === 'bottom');
        const hint = turnSeat === 'bottom' ? '请出牌...' : '等待其他玩家...';
        syncFromSeatData(bottomSeat || {}, { hint });
      }

      function getState() {
        return {
          visible: isVisible,
          interactive: isInteractive,
          hint: hintInput.value,
          selectedTileId,
          previewTileIds: [...previewTileIds],
          tiles: tiles.map((tile) => ({ ...tile }))
        };
      }

      function setPreviewTileIndices(indices = []) {
        previewTileIds = new Set(
          (indices || [])
            .map((index) => tiles[index] ? tiles[index].id : null)
            .filter((id) => id != null)
        );
        render();
      }

      function clearPreviewTiles() {
        if (!previewTileIds.size) return;
        previewTileIds.clear();
        render();
      }

      function mergeDrawnTile() {
        tiles = tiles.map((tile) => ({ ...tile, isDrawn: false }));
      }

      function drawTile(tile) {
        tiles.push({
          id: nextTileId++,
          asset: tile.asset,
          label: tile.label || tile.asset,
          isDrawn: true
        });
        render();
      }

      function playDealReveal(options = {}) {
        const durationMs = Number.isFinite(Number(options.durationMs)) ? Math.max(120, Number(options.durationMs)) : 420;
        const staggerMs = Number.isFinite(Number(options.staggerMs)) ? Math.max(20, Number(options.staggerMs)) : 42;
        const tileNodes = Array.from(tilesRoot.querySelectorAll('.debug-ui-tile'));
        layer.classList.remove('is-deal-hidden');
        if (!tileNodes.length) return;
        clearDealRevealResetTimer();
        tileNodes.forEach((node, index) => {
          node.classList.remove('anim-deal-in');
          node.style.setProperty('--deal-delay', `${index * staggerMs}ms`);
        });
        void tilesRoot.offsetWidth;
        tileNodes.forEach((node) => {
          node.classList.add('anim-deal-in');
        });
        dealRevealResetTimer = window.setTimeout(() => {
          tileNodes.forEach((node) => {
            node.classList.remove('anim-deal-in');
            node.style.removeProperty('--deal-delay');
          });
          dealRevealResetTimer = null;
        }, durationMs + staggerMs * tileNodes.length + 80);
      }

      function discardTileById(tileId) {
        if (isProcessing) return;
        const tileIndex = tiles.findIndex((tile) => tile.id === tileId);
        if (tileIndex < 0) return;
        const tileEl = tilesRoot.querySelector(`[data-debug-tile-id="${tileId}"]`);
        if (!tileEl) return;
        isProcessing = true;
        selectedTileId = null;
        tileEl.classList.add('discarding');
        if (window.AceZeroMahjongUI && window.AceZeroMahjongUI.table && typeof window.AceZeroMahjongUI.table.clearBottomHandHover === 'function') {
          window.AceZeroMahjongUI.table.clearBottomHandHover();
        }

        let accepted = false;
        if (window.AceZeroMahjongUI && window.AceZeroMahjongUI.table && typeof window.AceZeroMahjongUI.table.dispatchBottomHandInteraction === 'function') {
          accepted = window.AceZeroMahjongUI.table.dispatchBottomHandInteraction({
            tileIndex,
            source: 'hand-layer'
          });
        } else if (typeof interactionHandler === 'function') {
          accepted = interactionHandler({
            seat: 'bottom',
            area: 'hand-layer',
            tileId,
            tileIndex,
            tile: tiles[tileIndex] ? { ...tiles[tileIndex] } : null
          }) !== false;
        }

        if (!accepted) {
          isProcessing = false;
          tileEl.classList.remove('discarding');
          setHint('当前还不能出牌');
          return;
        }

        setHint('等待其他玩家...');
      }

      tilesRoot.addEventListener('click', (event) => {
        if (!isInteractive) return;
        const tileButton = event.target.closest('[data-debug-tile-id]');
        if (!tileButton || isProcessing) return;
        const tileId = Number(tileButton.dataset.debugTileId);
        discardTileById(tileId);
      });

      tilesRoot.addEventListener('mouseover', (event) => {
        if (!isInteractive) return;
        const tileButton = event.target.closest('[data-debug-tile-id]');
        if (!tileButton) return;
        const tileId = Number(tileButton.dataset.debugTileId);
        const tileIndex = tiles.findIndex((tile) => tile.id === tileId);
        if (tileIndex < 0) return;
        if (window.AceZeroMahjongUI && window.AceZeroMahjongUI.table && typeof window.AceZeroMahjongUI.table.setBottomHandHoverIndex === 'function') {
          window.AceZeroMahjongUI.table.setBottomHandHoverIndex(tileIndex);
        }
      });

      tilesRoot.addEventListener('mouseleave', () => {
        if (window.AceZeroMahjongUI && window.AceZeroMahjongUI.table && typeof window.AceZeroMahjongUI.table.clearBottomHandHover === 'function') {
          window.AceZeroMahjongUI.table.clearBottomHandHover();
        }
      });

      document.body.addEventListener('click', (event) => {
        if (event.target.closest('.debug-panel') || event.target.closest('#ui-debug-layer')) return;
        if (selectedTileId == null || isProcessing) return;
        selectedTileId = null;
        setHint('请出牌...');
        render();
      });

      document.getElementById('debug-toggle-hand').addEventListener('click', toggle);
      document.getElementById('debug-load-sample').addEventListener('click', () => {
        const snapshot = getRuntimeSnapshot();
        if (snapshot) {
          syncFromSnapshot(snapshot);
          setHint(snapshot.info && snapshot.info.turnSeat === 'bottom' ? '请出牌...' : '等待其他玩家...');
          show();
          return;
        }
        setTiles(defaultDebugHandTiles);
        setHint('请出牌...');
        show();
      });
      document.getElementById('debug-draw-tile').addEventListener('click', () => {
        const runtimeSnapshot = dispatchRuntimeAction({
          type: 'draw-seat',
          payload: {
            seat: 'bottom'
          }
        });
        if (runtimeSnapshot && typeof runtimeSnapshot === 'object') {
          syncFromSnapshot(runtimeSnapshot);
          setHint('请出牌...');
          show();
          return;
        }
        drawTile({ asset: 'Haku', label: '白' });
        setHint('请出牌...');
        show();
      });
      document.getElementById('debug-clear-hand').addEventListener('click', () => {
        setTiles([]);
        setHint('手牌已清空');
        show();
      });
      document.getElementById('debug-apply-json').addEventListener('click', () => {
        try {
          const nextTiles = JSON.parse(jsonInput.value);
          setTiles(nextTiles);
          setHint(hintInput.value || '请出牌...');
          show();
        } catch (error) {
          setHint('JSON 格式错误');
        }
      });
      document.getElementById('debug-sync-json').addEventListener('click', syncTextarea);
      hintInput.addEventListener('input', () => setHint(hintInput.value));

      layer.classList.add('is-visible');
      syncTextarea();
      updateStatus();

      return {
        show,
        hide,
        toggle,
        render,
        setHint,
        setTiles,
        drawTile,
        discardTileById,
        getState,
        syncFromSeatData,
        syncFromSnapshot,
        setInteractive,
        setPreviewTileIndices,
        clearPreviewTiles,
        getStatusOverlay() {
          return cloneHandStatusOverlayState(getResolvedHandStatusOverlayState());
        },
        setStatusOverlay(nextState = {}) {
          return setHandStatusOverlay(nextState);
        },
        clearStatusOverlay() {
          return clearHandStatusOverlay();
        },
        setInteractionHandler(handler) {
          interactionHandler = typeof handler === 'function' ? handler : null;
        },
        prepareDealReveal() {
          prepareDealReveal();
        },
        playDealReveal(options = {}) {
          playDealReveal(options);
        }
      };
    }

    function createActionPanelApi(handApi) {
      const layer = document.getElementById('ui-actions-layer');
      const wrap = document.getElementById('debug-actions-wrap');
      const statusEl = document.getElementById('debug-actions-status');
      const jsonInput = document.getElementById('debug-actions-json');
      const pickerRoot = document.getElementById('debug-action-picker');
      const modeSingleButton = document.getElementById('debug-action-mode-single');
      const modeMultiButton = document.getElementById('debug-action-mode-multi');
      const modeClearButton = document.getElementById('debug-action-mode-clear');

      let isVisible = false;
      let layout = 'double';
      let catalog = defaultDebugActions.map((action) => ({ ...action }));
      let visibleActionKeys = catalog.map((action) => action.key);
      let selectionMode = 'single';
      let actions = catalog.map((action) => ({ ...action }));
      let activeActionKey = null;
      let actionHandler = null;
      let hoverArmed = false;
      let hoverOriginPoint = null;
      let hoveredActionKey = null;
      let hoverEnabledAfter = 0;
      let isClosing = false;
      let closingActionKey = null;
      let closeAnimationTimer = null;
      let pendingPanelSync = null;

      function clearCloseAnimationTimer() {
        if (!closeAnimationTimer) return;
        clearTimeout(closeAnimationTimer);
        closeAnimationTimer = null;
      }

      function queuePendingPanelSync(patch = {}) {
        pendingPanelSync = {
          ...(pendingPanelSync || {}),
          ...patch
        };
      }

      function applyPendingPanelSync() {
        if (!pendingPanelSync) return;
        const pending = pendingPanelSync;
        pendingPanelSync = null;
        if (Object.prototype.hasOwnProperty.call(pending, 'nextActions')) {
          setActions(pending.nextActions);
        }
        if (Object.prototype.hasOwnProperty.call(pending, 'nextLayout')) {
          setLayout(pending.nextLayout);
        }
        if (Object.prototype.hasOwnProperty.call(pending, 'nextActiveActionKey')) {
          setActiveAction(pending.nextActiveActionKey);
        }
        if (Object.prototype.hasOwnProperty.call(pending, 'visible')) {
          if (pending.visible) show();
          else hide();
        }
      }

      function resetCloseAnimationState() {
        clearCloseAnimationTimer();
        isClosing = false;
        closingActionKey = null;
        layer.classList.remove('is-closing');
      }

      function finishHide() {
        isVisible = false;
        layer.classList.remove('is-visible');
        resetCloseAnimationState();
        activeActionKey = null;
        actions = [];
        catalog = [];
        visibleActionKeys = [];
        wrap.innerHTML = '';
        setHoverArmed(false);
        hoverOriginPoint = null;
        hoveredActionKey = null;
        hoverEnabledAfter = 0;
        if (tableInteractionsApi && typeof tableInteractionsApi.setDefaultPreviewTileIds === 'function') {
          tableInteractionsApi.setDefaultPreviewTileIds([]);
        }
        clearActionPreviewSelection();
        updateStatus();
        applyPendingPanelSync();
      }

      function syncDefaultReactionPreview() {
        const nextPreviewIds = [];
        if (layout !== 'reaction') {
          if (tableInteractionsApi && typeof tableInteractionsApi.setDefaultPreviewTileIds === 'function') {
            tableInteractionsApi.setDefaultPreviewTileIds(nextPreviewIds);
          }
          return;
        }
        const targetAction = actions.find((action) => (
          action
          && action.payload
          && action.payload.preview
          && action.payload.preview.riverTarget
        )) || null;
        if (!targetAction) {
          if (tableInteractionsApi && typeof tableInteractionsApi.setDefaultPreviewTileIds === 'function') {
            tableInteractionsApi.setDefaultPreviewTileIds(nextPreviewIds);
          }
          return;
        }
        const riverDescriptorId = resolveRiverPreviewDescriptorId(targetAction.payload.preview.riverTarget);
        if (riverDescriptorId) nextPreviewIds.push(riverDescriptorId);
        if (tableInteractionsApi && typeof tableInteractionsApi.setDefaultPreviewTileIds === 'function') {
          tableInteractionsApi.setDefaultPreviewTileIds(nextPreviewIds);
        }
      }

      function setHoverArmed(armed) {
        hoverArmed = Boolean(armed);
        layer.classList.toggle('hover-armed', hoverArmed);
      }

      function normalizeAction(action, index) {
        const label = action.label || action.key || `动作${index + 1}`;
        return {
          key: action.key || `action-${index + 1}`,
          label,
          bgChar: action.bgChar || label[0] || '牌',
          variant: action.variant || '',
          textLayout: action.textLayout || (label.length === 2 ? 'len-2' : label.length >= 4 ? 'len-4' : '')
        };
      }

      function serializeActions() {
        return actions.map(({ key, label, bgChar, variant, textLayout }) => ({
          key,
          label,
          bgChar,
          variant,
          textLayout
        }));
      }

      function syncTextarea() {
        jsonInput.value = JSON.stringify(serializeActions(), null, 2);
      }

      function updateLayerOffset() {
        layer.classList.toggle('with-hand', handApi.getState().visible);
        layer.classList.toggle('without-hand', !handApi.getState().visible);
      }

      function syncPickerUi() {
        pickerRoot.innerHTML = catalog.map((action) => (
          `<button class="debug-chip${visibleActionKeys.includes(action.key) ? ' is-active' : ''}" data-picker-key="${action.key}" type="button">${action.label}</button>`
        )).join('');
        modeSingleButton.classList.toggle('is-active', selectionMode === 'single');
        modeMultiButton.classList.toggle('is-active', selectionMode === 'multi');
      }

      function updateStatus() {
        statusEl.textContent = `actions layer: ${isVisible ? 'visible' : 'hidden'} · layout: ${layout} · actions: ${actions.length} · active: ${activeActionKey ?? '-'}`;
      }

      function labelMarkup(action) {
        if (action.textLayout === 'len-2' && action.label.length >= 2) {
          return `<div class="debug-action-fg len-2"><span>${action.label[0]}</span><span>${action.label.slice(1)}</span></div>`;
        }
        if (action.textLayout === 'len-4') {
          const pieces = action.label.length > 2 ? `${action.label.slice(0, 2)}<br>${action.label.slice(2)}` : action.label;
          return `<div class="debug-action-fg len-4">${pieces}</div>`;
        }
        return `<div class="debug-action-fg">${action.label}</div>`;
      }

      function render() {
        const normalized = actions.map(normalizeAction);
        wrap.innerHTML = [
          `<div class="debug-actions-row is-single-line${isVisible ? ' animate-in' : ''}">`,
          ...normalized.map((action) => [
            `<button class="debug-action-btn ${action.variant || ''}${action.key === hoveredActionKey ? ' is-hovered' : ''}${isClosing ? (action.key === closingActionKey ? ' is-clicked' : ' is-dismissed') : ''}" data-action-key="${action.key}" type="button" aria-label="${action.label}">`,
            `  <div class="debug-action-bg">${action.bgChar}</div>`,
            '  <div class="debug-action-ink"></div>',
            '  <div class="debug-action-particles">',
            '    <div class="debug-action-dust dust-1"></div>',
            '    <div class="debug-action-dust dust-2"></div>',
            '    <div class="debug-action-dust dust-3"></div>',
            '    <div class="debug-action-dust dust-4"></div>',
            '  </div>',
            `  ${labelMarkup(action)}`,
            '</button>'
          ].join('')),
          '</div>'
        ].join('');

        syncTextarea();
        syncPickerUi();
        updateLayerOffset();
        syncDefaultReactionPreview();
        clearActionPreviewSelection();
        updateStatus();
      }

      function syncActionButtonClasses() {
        Array.from(wrap.querySelectorAll('[data-action-key]')).forEach((button) => {
          const actionKey = button.dataset.actionKey;
          button.classList.toggle('is-hovered', actionKey === hoveredActionKey);
        });
      }

      function show() {
        if (isClosing) {
          queuePendingPanelSync({ visible: true });
          return;
        }
        resetCloseAnimationState();
        isVisible = true;
        layer.classList.add('is-visible');
        setHoverArmed(false);
        hoverOriginPoint = null;
        hoveredActionKey = null;
        hoverEnabledAfter = performance.now() + 180;
        render();
      }

      function hide() {
        if (isClosing) {
          queuePendingPanelSync({ visible: false });
          return;
        }
        finishHide();
      }

      function toggle() {
        if (isVisible) hide();
        else show();
      }

      function setActions(nextActions) {
        if (isClosing) {
          queuePendingPanelSync({
            nextActions: (nextActions || []).map((action) => ({ ...action }))
          });
          return;
        }
        resetCloseAnimationState();
        catalog = (nextActions || []).map((action) => ({ ...action }));
        visibleActionKeys = catalog.map((action) => action.key);
        actions = catalog.map((action) => ({ ...action }));
        activeActionKey = null;
        hoveredActionKey = null;
        syncDefaultReactionPreview();
        clearActionPreviewSelection();
        render();
      }

      function setLayout(nextLayout) {
        if (isClosing) {
          queuePendingPanelSync({ nextLayout });
          return;
        }
        layout = nextLayout === 'single' || nextLayout === 'reaction' ? nextLayout : 'double';
        render();
      }

      function setReactionCountdown() {}

      function setActiveAction(actionKey) {
        if (isClosing) {
          queuePendingPanelSync({ nextActiveActionKey: actionKey || null });
          return;
        }
        activeActionKey = actionKey || null;
        updateStatus();
      }

      function setHoveredAction(actionKey) {
        hoveredActionKey = actionKey || null;
        const action = actions.find((item) => item && item.key === hoveredActionKey) || null;
        applyActionPreviewSelection(action);
        syncActionButtonClasses();
        updateStatus();
      }

      function applyVisibleKeys(nextKeys) {
        visibleActionKeys = nextKeys.filter((key, index, array) => array.indexOf(key) === index);
        actions = catalog.filter((action) => visibleActionKeys.includes(action.key));
        if (!actions.some((action) => action.key === activeActionKey)) {
          activeActionKey = null;
        }
        if (!actions.some((action) => action.key === hoveredActionKey)) {
          hoveredActionKey = null;
        }
        const action = actions.find((item) => item && item.key === hoveredActionKey) || null;
        applyActionPreviewSelection(action);
        render();
      }

      function setSelectionMode(mode) {
        selectionMode = mode === 'multi' ? 'multi' : 'single';
        syncPickerUi();
      }

      function playRepeatableSelfActionClick(button, callback) {
        const buttons = Array.from(wrap.querySelectorAll('[data-action-key]'));
        const clickedButton = button instanceof HTMLElement ? button : null;
        if (!clickedButton || !buttons.length) {
          if (typeof callback === 'function') callback();
          return;
        }

        setHoverArmed(false);
        hoverOriginPoint = null;
        hoveredActionKey = null;
        hoverEnabledAfter = 0;
        clearActionPreviewSelection();
        buttons.forEach((currentButton) => {
          currentButton.classList.remove('is-hovered');
          currentButton.classList.toggle('is-clicked', currentButton === clickedButton);
          currentButton.classList.toggle('is-dismissed', currentButton !== clickedButton);
        });
        updateStatus();

        window.setTimeout(() => {
          if (typeof callback === 'function') callback();
        }, 160);
      }

      function setActionHandler(handler) {
        actionHandler = typeof handler === 'function' ? handler : null;
      }

      function getState() {
        return {
          visible: isVisible,
          layout,
          selectionMode,
          activeActionKey,
          visibleActionKeys: [...visibleActionKeys],
          actions: actions.map((action) => ({ ...action }))
        };
      }

      wrap.addEventListener('click', (event) => {
        const button = event.target.closest('[data-action-key]');
        if (!button) return;
        if (isClosing) return;
        const actionKey = button.dataset.actionKey;
        const action = actions.find((item) => item && item.key === actionKey) || null;
        const actionGroupKey = action
          ? `${action.payload && action.payload.callType ? action.payload.callType : action.type}:${action.payload && action.payload.seat ? action.payload.seat : ''}`
          : '';
        const siblingCount = action
          ? actions.filter((item) => (
              `${item && item.payload && item.payload.callType ? item.payload.callType : item && item.type}:${item && item.payload && item.payload.seat ? item.payload.seat : ''}` === actionGroupKey
            )).length
          : 0;
        const requiresPreviewPick = layout === 'reaction'
          && siblingCount > 1
          && activeActionKey !== actionKey;
        if (requiresPreviewPick) {
          setActiveAction(actionKey);
          setHoveredAction(actionKey);
          return;
        }
        const isRepeatableSelfAction = action && ['kita', 'nuki', 'bei'].includes(action.type);
        setActiveAction(actionKey);
        if (isRepeatableSelfAction) {
          playRepeatableSelfActionClick(button, () => {
            if (actionHandler) actionHandler(action || actionKey, getState());
          });
          return;
        }
        isClosing = true;
        closingActionKey = actionKey;
        layer.classList.add('is-closing');
        setHoverArmed(false);
        hoverOriginPoint = null;
        hoveredActionKey = null;
        hoverEnabledAfter = 0;
        clearActionPreviewSelection();
        render();
        closeAnimationTimer = setTimeout(() => {
          finishHide();
        }, 500);
        if (actionHandler) actionHandler(action || actionKey, getState());
      });

      wrap.addEventListener('pointermove', (event) => {
        if (!isVisible) return;
        if (performance.now() < hoverEnabledAfter) return;
        if (!hoverArmed) {
          if (!hoverOriginPoint) {
            hoverOriginPoint = { x: event.clientX, y: event.clientY };
            return;
          }
          const dx = event.clientX - hoverOriginPoint.x;
          const dy = event.clientY - hoverOriginPoint.y;
          if (Math.abs(dx) + Math.abs(dy) < 6) return;
          setHoverArmed(true);
        }
        const button = event.target.closest('[data-action-key]');
        if (!button) {
          if (hoveredActionKey != null) setHoveredAction(null);
          return;
        }
        const actionKey = button.dataset.actionKey;
        if (actionKey !== hoveredActionKey) {
          setHoveredAction(actionKey);
        }
      });

      wrap.addEventListener('pointerleave', () => {
        hoverOriginPoint = null;
        setHoverArmed(false);
        if (hoveredActionKey != null) {
          setHoveredAction(null);
        } else {
          applyActionPreviewSelection(null);
        }
      });

      pickerRoot.addEventListener('click', (event) => {
        const button = event.target.closest('[data-picker-key]');
        if (!button) return;
        const actionKey = button.dataset.pickerKey;
        if (selectionMode === 'single') {
          applyVisibleKeys(visibleActionKeys.length === 1 && visibleActionKeys[0] === actionKey ? [] : [actionKey]);
        } else {
          const nextKeys = visibleActionKeys.includes(actionKey)
            ? visibleActionKeys.filter((key) => key !== actionKey)
            : [...visibleActionKeys, actionKey];
          applyVisibleKeys(nextKeys);
        }
        show();
      });

      document.getElementById('debug-toggle-actions').addEventListener('click', toggle);
      document.getElementById('debug-load-actions').addEventListener('click', () => {
        const snapshot = getRuntimeSnapshot();
        if (snapshot && Array.isArray(snapshot.availableActions) && snapshot.availableActions.length) {
          setActions(snapshot.availableActions);
          if (snapshot.actionWindow && snapshot.actionWindow.layout) {
            setLayout(snapshot.actionWindow.layout);
          }
          show();
          return;
        }
        setActions(defaultDebugActions);
        show();
      });
      document.getElementById('debug-layout-actions').addEventListener('click', () => {
        setLayout(layout === 'single' ? 'double' : 'single');
        show();
      });
      document.getElementById('debug-reset-actions').addEventListener('click', () => {
        activeActionKey = null;
        const snapshot = getRuntimeSnapshot();
        if (snapshot && Array.isArray(snapshot.availableActions)) {
          setActions(snapshot.availableActions);
          if (snapshot.actionWindow && snapshot.actionWindow.layout) {
            setLayout(snapshot.actionWindow.layout);
          }
        } else {
          setActions(defaultDebugActions);
        }
        hide();
      });
      modeSingleButton.addEventListener('click', () => setSelectionMode('single'));
      modeMultiButton.addEventListener('click', () => setSelectionMode('multi'));
      modeClearButton.addEventListener('click', () => {
        applyVisibleKeys([]);
        show();
      });
      document.getElementById('debug-apply-actions-json').addEventListener('click', () => {
        try {
          const nextActions = JSON.parse(jsonInput.value);
          setActions(nextActions);
          show();
        } catch (error) {
          statusEl.textContent = 'actions layer: JSON 格式错误';
        }
      });
      document.getElementById('debug-sync-actions-json').addEventListener('click', syncTextarea);

      render();

      return {
        show,
        hide,
        toggle,
        render,
        setActions,
        setLayout,
        setReactionCountdown,
        setActiveAction,
        applyVisibleKeys,
        setSelectionMode,
        setActionHandler,
        getState,
        updateLayerOffset
      };
    }

    renderAll();
    const debugPanelModule = window.AceMahjongDebugPanel || null;
    if (debugPanelModule && typeof debugPanelModule.ensureMounted === 'function') {
      debugPanelModule.ensureMounted();
      if (typeof debugPanelModule.syncVisibility === 'function') {
        debugPanelModule.syncVisibility();
      }
    }
    const appRoot = document.getElementById('app');
    let handApi = null;
    let actionsApi = null;
    if (typeof createTableInteractions === 'function') {
      tableInteractionsApi = createTableInteractions({
        normalizeTileCodeKey,
        getSeatSnapshot,
        getBottomSeatData,
        getRiichiSelectableBottomHandIndices,
        getHandApi: () => handApi
      });
    }
    if (typeof createTableAnimations === 'function') {
      tableAnimationsApi = createTableAnimations({
        normalizeTile,
        createDisplayTileFromCode,
        renderAll,
        getInteractiveTableTiles,
        resolveBottomHandPreviewIndices,
        resolveRiverPreviewDescriptorId
      });
    }
    if (typeof createRuntimeStatusOverlay === 'function') {
      runtimeStatusOverlayApi = createRuntimeStatusOverlay({
        normalizeTileCodeKey,
        formatWaitTileFromCode,
        getSnapshot: getRuntimeSnapshot,
        layer: document.getElementById('debug-hand-status-layer')
      });
    }
    if (typeof createTableRenderer === 'function') {
      tableRendererApi = createTableRenderer({
        assetUrl,
        formatScore,
        getAppRoot: () => appRoot,
        getTableInfoState: () => tableInfoState,
        getBottomSeatMeta: () => bottomSeatMeta,
        getBottomRiverTiles: () => bottomRiverTiles,
        getBottomHandTiles: () => bottomHandTiles,
        getBaseBottomMelds: () => baseBottomMelds,
        getBottomSeatState: () => bottomSeatState,
        getOpponentSeats: () => opponentSeats,
        renderHandStatusOverlay,
        getSeatHandTilesForRender,
        applyWinnerHandRevealClass,
        applyHandStatusOverlayToTiles,
        shouldAnimateHandDrawForSeat,
        scheduleTableInteractionProxySync,
        applyBottomHandPreviewClasses,
        playPendingTableAnimations,
        normalizeTiles,
        normalizeMeld,
        cloneTile,
        cloneMeld,
        cloneRiichiState,
        cloneHandOrderPolicy,
        getResolvedHandOrderPolicy,
        getMutableSeatData,
        getEffectiveTileKind,
        splitTileExtraClass,
        resolveTileDisplayOrder,
        shouldSeatAutoSortHand,
        getBottomHandInteractionHandler: () => (
          tableInteractionsApi
          && typeof tableInteractionsApi.getBottomHandInteractionHandler === 'function'
            ? tableInteractionsApi.getBottomHandInteractionHandler()
            : null
        ),
        isBottomHandActionLocked: () => Boolean(
          tableAnimationsApi
          && typeof tableAnimationsApi.isBottomHandActionLocked === 'function'
          && tableAnimationsApi.isBottomHandActionLocked()
        )
      });
    }
    if (typeof createSettlementPanel === 'function') {
      settlementPanelApi = createSettlementPanel({
        root: document.body,
        assetBase,
        onContinue(viewModel) {
          restoreHandLayerAfterSettlementIfNeeded();
          if (typeof settlementActionHandler === 'function') {
            settlementActionHandler(viewModel);
            return;
          }
          closeSettlementPanel();
        }
      });
    }

    function updateDebugStatusText() {
      const handVisible = handApi ? handApi.getState().visible : false;
      const text = `hand layer: ${handVisible ? 'visible' : 'hidden'} · perf: ${performanceMode ? 'on' : 'off'} · table: ${appRoot.classList.contains('is-25d') ? '2.5D' : '2D'}`;
      if (debugPanelModule && typeof debugPanelModule.setMainStatus === 'function') {
        debugPanelModule.setMainStatus(text);
      }
      if (debugPanelModule && typeof debugPanelModule.setCoachRequestEnabled === 'function') {
        const bridge = getRuntimeBridgeApi();
        const availability = bridge && typeof bridge.getCoachRequestAvailability === 'function'
          ? bridge.getCoachRequestAvailability()
          : null;
        debugPanelModule.setCoachRequestEnabled(
          Boolean(availability && availability.ok),
          availability && availability.ok ? '手动请求建议' : '仅玩家回合可请求'
        );
      }
      if (debugPanelModule && typeof debugPanelModule.setCoachAutoEnabled === 'function') {
        const bridge = getRuntimeBridgeApi();
        const enabled = bridge && typeof bridge.getAutoCoachEnabled === 'function'
          ? Boolean(bridge.getAutoCoachEnabled())
          : false;
        debugPanelModule.setCoachAutoEnabled(enabled, enabled ? '关闭自动复盘' : '开启自动复盘');
      }
      if (debugPanelModule && typeof debugPanelModule.setCoachAutoStatus === 'function') {
        const bridge = getRuntimeBridgeApi();
        const enabled = bridge && typeof bridge.getAutoCoachEnabled === 'function'
          ? Boolean(bridge.getAutoCoachEnabled())
          : false;
        debugPanelModule.setCoachAutoStatus(`review auto: ${enabled ? 'on' : 'off'}`);
      }
    }

    function setPerformanceMode(enabled) {
      performanceMode = Boolean(enabled);
      appRoot.classList.toggle('perf-lite', performanceMode);
      if (performanceMode) {
        appRoot.classList.remove('is-25d');
      }
      renderAll();
      scheduleTableInteractionProxySync(performanceMode ? 220 : 900);
      updateDebugStatusText();
      logUi('info', '性能模式切换', {
        enabled: performanceMode
      });
    }

    function getRuntimeBridgeApi() {
      const bridge = window.AceMahjongRuntimeBridge || null;
      return bridge && typeof bridge === 'object' ? bridge : null;
    }

    function getRuntimeSnapshot() {
      const bridge = getRuntimeBridgeApi();
      return bridge && typeof bridge.getSnapshot === 'function'
        ? bridge.getSnapshot()
        : null;
    }

    function dispatchRuntimeAction(action) {
      const bridge = getRuntimeBridgeApi();
      return bridge && typeof bridge.dispatch === 'function'
        ? bridge.dispatch(action)
        : null;
    }

    function getRuntimeInfo() {
      const bridge = getRuntimeBridgeApi();
      return bridge && typeof bridge.getRuntimeInfo === 'function'
        ? bridge.getRuntimeInfo()
        : null;
    }

    function setTileInteractionHandler(handler) {
      if (!tableInteractionsApi || typeof tableInteractionsApi.setTileInteractionHandler !== 'function') return;
      tableInteractionsApi.setTileInteractionHandler(handler);
    }

    function setTileSelectionHandler(handler) {
      if (!tableInteractionsApi || typeof tableInteractionsApi.setTileSelectionHandler !== 'function') return;
      tableInteractionsApi.setTileSelectionHandler(handler);
    }

    function setBottomHandInteractionHandler(handler) {
      if (!tableInteractionsApi || typeof tableInteractionsApi.setBottomHandInteractionHandler !== 'function') return;
      tableInteractionsApi.setBottomHandInteractionHandler(handler);
    }

    function setSettlementContinueHandler(handler) {
      settlementActionHandler = typeof handler === 'function' ? handler : null;
      if (settlementPanelApi && typeof settlementPanelApi.setContinueHandler === 'function') {
        settlementPanelApi.setContinueHandler((viewModel) => {
          restoreHandLayerAfterSettlementIfNeeded();
          if (typeof settlementActionHandler === 'function') {
            settlementActionHandler(viewModel);
            return;
          }
          closeSettlementPanel();
        });
      }
    }

    function createRuntimePublicApi() {
      return {
        getRuntime() {
          const bridge = getRuntimeBridgeApi();
          return bridge && typeof bridge.getRuntime === 'function'
            ? bridge.getRuntime()
            : null;
        },
        getSnapshot() {
          return getRuntimeSnapshot();
        },
        getInfo() {
          return getRuntimeInfo();
        },
        dispatch(action) {
          return dispatchRuntimeAction(action);
        },
        subscribe(listener) {
          const bridge = getRuntimeBridgeApi();
          return bridge && typeof bridge.subscribe === 'function'
            ? bridge.subscribe(listener)
            : (() => {});
        }
      };
    }

    function createTablePublicApi() {
      return {
        render: renderAll,
        getState: getTableState,
        getSeatState: getSeatSnapshot,
        applySnapshot,
        setSeatData,
        setInfo: setTableInfo,
        setView: setTableView,
        syncInteractionLayer: scheduleTableInteractionProxySync,
        playAnimation: playTableAnimation,
        playCutIn(actionType, options = {}) {
          return playCutIn(actionType, options);
        },
        clearHover: clearTableHoverStates,
        clearSelectedTiles: clearSelectedTableTiles,
        getSelectedTiles: getSelectedTableTiles,
        setRiichiState: setSeatRiichiState,
        appendToRiver(seatKey, tile, options = {}) {
          return appendSeatTile(seatKey, 'river', tile, options);
        },
        drawToHand(seatKey, tile) {
          return appendSeatTile(seatKey, 'hand', tile);
        },
        removeRiverTile(seatKey, tileIndex) {
          return removeSeatTile(seatKey, 'river', tileIndex);
        },
        removeHandTile(seatKey, tileIndex) {
          return removeSeatTile(seatKey, 'hand', tileIndex);
        },
        addMeld(seatKey, meld, options = {}) {
          return pushSeatMeld(seatKey, meld, options);
        },
        getSelectionMode() {
          return getTableSelectionMode();
        },
        setSelectionMode: setTableSelectionMode,
        setTileInteractionHandler,
        setTileSelectionHandler,
        setBottomHandInteractionHandler,
        setBottomHandHoverIndex,
        clearBottomHandHover() {
          clearBottomHandHoverState();
        },
        dispatchBottomHandInteraction,
        setSeatHandOrderPolicy(seatKey, policy) {
          return setSeatHandOrderPolicy(seatKey, policy);
        },
        setHandOrderPolicies(policyMap) {
          return setHandOrderPolicies(policyMap);
        },
        getHandOrderPolicy(seatKey) {
          return cloneHandOrderPolicy(getResolvedHandOrderPolicy(seatKey));
        },
        getHandStatusOverlay() {
          return cloneHandStatusOverlayState();
        },
        setHandStatusOverlay(nextState = {}) {
          return setHandStatusOverlay(nextState);
        },
        clearHandStatusOverlay() {
          return clearHandStatusOverlay();
        },
        clearRuntimeHandStatusOverlay() {
          return clearRuntimeHandStatusOverlay();
        },
        animateBottomHandDiscard(tileIndex, callback) {
          animateBottomHandDiscard(tileIndex, callback);
        },
        animateSeatHandDiscard(seatKey, tileIndex, callback) {
          animateSeatHandDiscard(seatKey, tileIndex, callback);
        },
        animateReactionMeldCapture(action, callback) {
          return animateReactionMeldCapture(action, callback);
        },
        playWinnerReveal(options = {}) {
          return playWinnerReveal(options);
        },
        playWinnerRevealForSeat(seatKey, options = {}) {
          return playWinnerReveal({
            ...options,
            seat: seatKey
          });
        },
        clearWinnerReveal() {
          return clearWinnerReveal();
        },
        openSettlementPanel(payload = {}) {
          return openSettlementPanel(payload);
        },
        closeSettlementPanel() {
          return closeSettlementPanel();
        },
        setSettlementActionHandler: setSettlementContinueHandler
        ,
        getCoachState() {
          return tableInfoState.coachState ? JSON.parse(JSON.stringify(tableInfoState.coachState)) : null;
        },
        setCoachState(nextState = null) {
          tableInfoState.coachState = nextState ? JSON.parse(JSON.stringify(nextState)) : null;
          renderAll();
          return getTableState();
        },
        getCoachAnalysisState() {
          return tableInfoState.coachAnalysisState ? JSON.parse(JSON.stringify(tableInfoState.coachAnalysisState)) : null;
        },
        setCoachAnalysisState(nextState = null) {
          tableInfoState.coachAnalysisState = nextState ? JSON.parse(JSON.stringify(nextState)) : null;
          renderAll();
          return getTableState();
        }
      };
    }

    function createPerfPublicApi() {
      return {
        isEnabled() {
          return performanceMode;
        },
        enable() {
          setPerformanceMode(true);
        },
        disable() {
          setPerformanceMode(false);
        },
        toggle() {
          setPerformanceMode(!performanceMode);
        }
      };
    }

    function formatRuntimeStatus(snapshot = {}) {
      const runtimeInfo = getRuntimeInfo();
      const phase = snapshot.phase || 'unknown';
      const turnSeat = snapshot.info && snapshot.info.turnSeat ? snapshot.info.turnSeat : 'unknown';
      const actionCount = Array.isArray(snapshot.availableActions)
        ? snapshot.availableActions.length
        : (snapshot.actionWindow && Array.isArray(snapshot.actionWindow.actions)
          ? snapshot.actionWindow.actions.length
          : 0);
      const roundResult = snapshot.roundResult || null;
      const baojiaText = roundResult && roundResult.baojiaSeat
        ? ` · pao: ${roundResult.baojiaSeat}${roundResult.baojiaYaku ? `/${roundResult.baojiaYaku}` : ''}`
        : '';
      const huleResultText = (() => {
        if (!roundResult || roundResult.type !== 'hule') return '';
        if (roundResult.multiHule && Array.isArray(roundResult.winners) && roundResult.winners.length) {
          const seats = roundResult.winners
            .map((entry) => entry && entry.winnerSeat ? entry.winnerSeat : null)
            .filter(Boolean);
          return `hule(${seats.length ? seats.join('/') : (roundResult.winnerSeat || 'unknown')}:multi)`;
        }
        return `hule(${roundResult.winnerSeat || 'unknown'}${roundResult.result && Array.isArray(roundResult.result.hupai) && roundResult.result.hupai.length ? `:${roundResult.result.hupai.map((item) => item && item.name).filter(Boolean).join('/')}` : ''})`;
      })();
      const resultText = roundResult
        ? roundResult.type === 'hule'
          ? ` · result: ${huleResultText}`
          : ` · result: ${roundResult.type}${roundResult.reason ? `(${roundResult.reason})` : ''}`
        : '';
      const runtimeKind = runtimeInfo && runtimeInfo.kind ? runtimeInfo.kind : 'unknown-runtime';
      const runtimeSource = runtimeInfo && runtimeInfo.source ? runtimeInfo.source : 'unknown';
      return `runtime: ${phase} · turn: ${turnSeat} · actions: ${actionCount}${resultText}${baojiaText} · kind: ${runtimeKind} · source: ${runtimeSource}`;
    }

    if (debugPanelModule && typeof debugPanelModule.bindControls === 'function') {
      debugPanelModule.bindControls({
        onToggle25d() {
          if (performanceMode) return;
          appRoot.classList.toggle('is-25d');
          scheduleTableInteractionProxySync(900);
          updateDebugStatusText();
        },
        onTogglePerf() {
          setPerformanceMode(!performanceMode);
        },
        onToggleZones() {
          appRoot.classList.toggle('hide-zones');
        },
        onLoadHandStatus() {
          if (!handApi || typeof handApi.setStatusOverlay !== 'function') return;
          handApi.setStatusOverlay({
            tenpai: {
              waits: [
                { rank: '四', suit: '萬' },
                { rank: '七', suit: '萬' }
              ],
              countText: '余 5'
            },
            furiten: true,
            pao: {
              targetText: '役满·下家'
            }
          });
        },
        onClearHandStatus() {
          if (!handApi || typeof handApi.clearStatusOverlay !== 'function') return;
          handApi.clearStatusOverlay();
        },
        onRequestCoach() {
          const bridge = window.AceMahjongRuntimeBridge || null;
          if (!bridge || typeof bridge.requestCoachSuggestion !== 'function') return;
          bridge.requestCoachSuggestion({
            source: 'debug-panel'
          });
        },
        onClearCoach() {
          const bridge = window.AceMahjongRuntimeBridge || null;
          if (!bridge || typeof bridge.clearCoachState !== 'function') return;
          bridge.clearCoachState();
        },
        onToggleCoachAuto() {
          const bridge = window.AceMahjongRuntimeBridge || null;
          if (!bridge || typeof bridge.toggleAutoCoachEnabled !== 'function') return;
          bridge.toggleAutoCoachEnabled();
          updateDebugStatusText();
        },
        onTableModeSingle() {
          setTableSelectionMode('single');
        },
        onTableModeMulti() {
          setTableSelectionMode('multi');
        },
        onTableModeClear() {
          clearSelectedTableTiles();
        }
      });
    }
    handApi = createInteractiveHandApi();
    actionsApi = createActionPanelApi(handApi);
    hydrateHandOrderPolicies();
    window.addEventListener('resize', () => {
      scheduleTableInteractionProxySync(180);
    });
    window.AceZeroMahjongUI = {
      renderTable: renderAll,
      devlog: devLog,
      runtime: createRuntimePublicApi(),
      table: createTablePublicApi(),
      hand: handApi,
      actions: actionsApi,
      perf: createPerfPublicApi()
    };
    logUi('info', '麻将前端 UI 已就绪', {
      performanceMode,
      assetBase,
      debugPanelEnabled: frontendConfig.debugPanelEnabled !== false
    });
    updateDebugStatusText();
    emitInitialTableSelectionState();
  
