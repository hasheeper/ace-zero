(function(global) {
  'use strict';

  const browserCore = global.AceMahjongBrowserCoreAdapter;
  const createRoundContinuationPolicy = global.AceMahjongCreateRoundContinuationPolicy || null;
  const rulesetProfileApi = global.AceMahjongRulesetProfile || null;
  const actionBuilderApi = global.AceMahjongActionBuilder || null;
  const aiApi = global.AceMahjongBaseAI || null;
  const createRuntimeViewBuilder = global.AceMahjongCreateRuntimeViewBuilder || null;
  const createRuntimeRuleHelpers = global.AceMahjongCreateRuntimeRuleHelpers || null;
  const createRuntimePostReactionHelpers = global.AceMahjongCreateRuntimePostReactionHelpers || null;
  const createRuntimeReactionHelpers = global.AceMahjongCreateRuntimeReactionHelpers || null;
  const createRuntimeSettlementHelpers = global.AceMahjongCreateRuntimeSettlementHelpers || null;
  const createRuntimeRoundResultHelpers = global.AceMahjongCreateRuntimeRoundResultHelpers || null;
  const createRuntimeReactionFlowHelpers = global.AceMahjongCreateRuntimeReactionFlowHelpers || null;
  const createRuntimeRoundStateSupportHelpers = global.AceMahjongCreateRuntimeRoundStateSupportHelpers || null;
  const createRuntimeTestingSetupHelpers = global.AceMahjongCreateRuntimeTestingSetupHelpers || null;
  const createRuntimeKanHelpers = global.AceMahjongCreateRuntimeKanHelpers || null;
  const createRuntimeFuritenHelpers = global.AceMahjongCreateRuntimeFuritenHelpers || null;
  const createRuntimeHuleGateHelpers = global.AceMahjongCreateRuntimeHuleGateHelpers || null;
  const createRuntimeSeatStatusHelpers = global.AceMahjongCreateRuntimeSeatStatusHelpers || null;
  const createRuntimeRiichiFlowHelpers = global.AceMahjongCreateRuntimeRiichiFlowHelpers || null;
  const createRuntimeDrawSupportHelpers = global.AceMahjongCreateRuntimeDrawSupportHelpers || null;
  const reactionPriorityApi = global.AceMahjongReactionPriority || null;
  const createBrowserFormalRuntimeAssembly = global.AceMahjongCreateBrowserFormalRuntimeAssembly || null;
  const createBrowserFormalRuntimeActions = global.AceMahjongCreateBrowserFormalRuntimeActions || null;
  const createBrowserFormalRuntimeInitialization = global.AceMahjongCreateBrowserFormalRuntimeInitialization || null;
  const browserMajiang = global.Majiang || null;

  if (!browserCore) {
    throw new Error('AceMahjongBrowserCoreAdapter is required before browser-formal-runtime-core.js');
  }
  if (typeof createRoundContinuationPolicy !== 'function') {
    throw new Error('AceMahjongCreateRoundContinuationPolicy is required before browser-formal-runtime-core.js');
  }
  if (typeof createRuntimeViewBuilder !== 'function') {
    throw new Error('AceMahjongCreateRuntimeViewBuilder is required before browser-formal-runtime-core.js');
  }
  if (typeof createRuntimeRuleHelpers !== 'function') {
    throw new Error('AceMahjongCreateRuntimeRuleHelpers is required before browser-formal-runtime-core.js');
  }
  if (typeof createRuntimePostReactionHelpers !== 'function') {
    throw new Error('AceMahjongCreateRuntimePostReactionHelpers is required before browser-formal-runtime-core.js');
  }
  if (typeof createRuntimeReactionHelpers !== 'function') {
    throw new Error('AceMahjongCreateRuntimeReactionHelpers is required before browser-formal-runtime-core.js');
  }
  if (typeof createRuntimeSettlementHelpers !== 'function') {
    throw new Error('AceMahjongCreateRuntimeSettlementHelpers is required before browser-formal-runtime-core.js');
  }
  if (typeof createRuntimeRoundResultHelpers !== 'function') {
    throw new Error('AceMahjongCreateRuntimeRoundResultHelpers is required before browser-formal-runtime-core.js');
  }
  if (typeof createRuntimeReactionFlowHelpers !== 'function') {
    throw new Error('AceMahjongCreateRuntimeReactionFlowHelpers is required before browser-formal-runtime-core.js');
  }
  if (typeof createRuntimeRoundStateSupportHelpers !== 'function') {
    throw new Error('AceMahjongCreateRuntimeRoundStateSupportHelpers is required before browser-formal-runtime-core.js');
  }
  if (typeof createRuntimeTestingSetupHelpers !== 'function') {
    throw new Error('AceMahjongCreateRuntimeTestingSetupHelpers is required before browser-formal-runtime-core.js');
  }
  if (typeof createRuntimeKanHelpers !== 'function') {
    throw new Error('AceMahjongCreateRuntimeKanHelpers is required before browser-formal-runtime-core.js');
  }
  if (typeof createRuntimeFuritenHelpers !== 'function') {
    throw new Error('AceMahjongCreateRuntimeFuritenHelpers is required before browser-formal-runtime-core.js');
  }
  if (typeof createRuntimeHuleGateHelpers !== 'function') {
    throw new Error('AceMahjongCreateRuntimeHuleGateHelpers is required before browser-formal-runtime-core.js');
  }
  if (typeof createRuntimeSeatStatusHelpers !== 'function') {
    throw new Error('AceMahjongCreateRuntimeSeatStatusHelpers is required before browser-formal-runtime-core.js');
  }
  if (typeof createRuntimeRiichiFlowHelpers !== 'function') {
    throw new Error('AceMahjongCreateRuntimeRiichiFlowHelpers is required before browser-formal-runtime-core.js');
  }
  if (typeof createRuntimeDrawSupportHelpers !== 'function') {
    throw new Error('AceMahjongCreateRuntimeDrawSupportHelpers is required before browser-formal-runtime-core.js');
  }
  if (!reactionPriorityApi) {
    throw new Error('AceMahjongReactionPriority is required before browser-formal-runtime-core.js');
  }
  if (typeof createBrowserFormalRuntimeAssembly !== 'function') {
    throw new Error('AceMahjongCreateBrowserFormalRuntimeAssembly is required before browser-formal-runtime-core.js');
  }
  if (typeof createBrowserFormalRuntimeActions !== 'function') {
    throw new Error('AceMahjongCreateBrowserFormalRuntimeActions is required before browser-formal-runtime-core.js');
  }
  if (typeof createBrowserFormalRuntimeInitialization !== 'function') {
    throw new Error('AceMahjongCreateBrowserFormalRuntimeInitialization is required before browser-formal-runtime-core.js');
  }

  const CANONICAL_SEAT_KEYS = ['bottom', 'right', 'top', 'left'];
  const FORMAL_PHASES = Object.freeze({
    AWAIT_DRAW: 'await_draw',
    AWAIT_DISCARD: 'await_discard',
    AWAIT_REACTION: 'await_reaction',
    AWAIT_RESOLUTION: 'await_resolution',
    ROUND_END: 'round_end'
  });
  const {
    REACTION_PRIORITY,
    normalizeReactionType,
    normalizeRuntimeActionType,
    getReactionPriority,
    getActionPriority,
    getClaimTileCode,
    sortReactionActions,
    findBlockingReactionAction
  } = reactionPriorityApi;

  const TILE_ASSET_MAP = {
    m: { '0': 'Man5-Dora', '1': 'Man1', '2': 'Man2', '3': 'Man3', '4': 'Man4', '5': 'Man5', '6': 'Man6', '7': 'Man7', '8': 'Man8', '9': 'Man9' },
    p: { '0': 'Pin5-Dora', '1': 'Pin1', '2': 'Pin2', '3': 'Pin3', '4': 'Pin4', '5': 'Pin5', '6': 'Pin6', '7': 'Pin7', '8': 'Pin8', '9': 'Pin9' },
    s: { '0': 'Sou5-Dora', '1': 'Sou1', '2': 'Sou2', '3': 'Sou3', '4': 'Sou4', '5': 'Sou5', '6': 'Sou6', '7': 'Sou7', '8': 'Sou8', '9': 'Sou9' },
    z: { '1': 'Ton', '2': 'Nan', '3': 'Shaa', '4': 'Pei', '5': 'Haku', '6': 'Hatsu', '7': 'Chun' }
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }
  const roundContinuationPolicy = createRoundContinuationPolicy();
  const runtimeRuleHelpers = createRuntimeRuleHelpers({
    seatKeys: CANONICAL_SEAT_KEYS,
    normalizeMeld: (meld) => browserCore.validateMeldString(meld)
  });
  const runtimePostReactionHelpers = createRuntimePostReactionHelpers();
  const runtimeReactionHelpers = createRuntimeReactionHelpers();
  const runtimeSettlementHelpers = createRuntimeSettlementHelpers();
  const runtimeReactionFlowHelpers = createRuntimeReactionFlowHelpers();
  const runtimeRoundStateSupportHelpers = createRuntimeRoundStateSupportHelpers({
    seatKeys: CANONICAL_SEAT_KEYS
  });
  const runtimeTestingSetupHelpers = createRuntimeTestingSetupHelpers();
  const runtimeKanHelpers = createRuntimeKanHelpers({
    normalizeMeld: (meld) => browserCore.validateMeldString(meld)
  });
  const runtimeFuritenHelpers = createRuntimeFuritenHelpers({
    calculateXiangting: browserCore.calculateXiangting,
    getTingpai: browserCore.getTingpai,
    getSeatFuritenState: (runtime, seatKey) => runtimeRoundStateSupportHelpers.getSeatFuritenState(runtime, seatKey),
    getSeatRiichiState: (runtime, seatKey) => runtimeRoundStateSupportHelpers.getSeatRiichiState(runtime, seatKey),
    getActiveSeats: (runtime) => (
      runtime && Array.isArray(runtime.activeSeats)
        ? runtime.activeSeats.slice()
        : CANONICAL_SEAT_KEYS.slice()
    )
  });
  const browserRuntimeAssembly = createBrowserFormalRuntimeAssembly();
  const browserRuntimeActions = createBrowserFormalRuntimeActions();
  const browserRuntimeInitialization = createBrowserFormalRuntimeInitialization();
  const runtimeRoundResultHelpers = createRuntimeRoundResultHelpers({
    clone,
    extractBaojiaSummary: (seatKey, result) => runtimeRuleHelpers.extractBaojiaSummary(seatKey, result)
  });
  const {
    buildHuleRoundResult,
    buildMultiHuleRoundResult,
    buildDrawRoundResult
  } = runtimeRoundResultHelpers;
  const {
    createInitialRiichiState,
    createInitialTurnState,
    createInitialFuritenState,
    getSeatRiichiState,
    getSeatTurnState,
    getSeatFuritenState,
    resetRuntimeRiichiTracking
  } = runtimeRoundStateSupportHelpers;
  const { applyTestingRuntimeSetup } = runtimeTestingSetupHelpers;
  const {
    detectKanType,
    countRuntimeKanMelds,
    getKanClaimTileCode
  } = runtimeKanHelpers;
  const {
    getTileRankValue,
    getSeatWinningTileCodes,
    wouldCompleteHandWithTile,
    refreshSeatFuritenState,
    refreshAllFuritenStates,
    clearTemporaryFuriten,
    prepareSeatForDiscard,
    markSameTurnFuriten,
    markSkipRonFuriten,
    observeMissedWinningTile,
    applyReactionPassFuriten,
    getReactionFuritenSeatKeys,
    applyPendingReactionFuriten,
    getSeatNengRong
  } = runtimeFuritenHelpers;
  const runtimeHuleGateHelpers = createRuntimeHuleGateHelpers({
    allowHule: (rule, shoupai, tileCode, zhuangfeng, menfeng, hupaiFlag, nengRong) => (
      browserMajiang && browserMajiang.Game && typeof browserMajiang.Game.allow_hule === 'function'
        ? browserMajiang.Game.allow_hule(rule, shoupai, tileCode, zhuangfeng, menfeng, hupaiFlag, nengRong)
        : false
    )
  });
  const {
    safeAllowHule,
    getShibariMinYakuHan,
    satisfiesShibari
  } = runtimeHuleGateHelpers;
  const runtimeSeatStatusHelpers = createRuntimeSeatStatusHelpers({
    getSeatIndex: (runtime, seatKey) => runtime.getSeatIndex(seatKey),
    getDiscardCandidates: (runtime, seatKey, seatIndex, shoupai) => (
      browserCore.getDiscardCandidates(runtime.rule, shoupai.clone ? shoupai.clone() : shoupai) || []
    ),
    getCurrentTurnSeat: (runtime) => (runtime ? runtime.turnSeat : null),
    getCurrentPhase: (runtime) => (runtime ? runtime.phase : null),
    awaitDiscardPhase: FORMAL_PHASES.AWAIT_DISCARD,
    getSeatFuritenState: (runtime, seatKey) => getSeatFuritenState(runtime, seatKey),
    getSeatWinningTileCodes: (runtime, seatKey, shoupai) => getSeatWinningTileCodes(runtime, seatKey, shoupai)
  });
  const {
    parseHandTileCodes,
    getSeatHandTileCodes,
    getSeatDiscardCandidateCodes,
    getSeatBlockedDiscardCodes,
    buildSeatStatusState
  } = runtimeSeatStatusHelpers;
  const runtimeRiichiFlowHelpers = createRuntimeRiichiFlowHelpers({
    getSeatRiichiState: (runtime, seatKey) => getSeatRiichiState(runtime, seatKey),
    getSeatTurnState: (runtime, seatKey) => getSeatTurnState(runtime, seatKey),
    getSeatKeys: () => CANONICAL_SEAT_KEYS.slice(),
    getLegalRiichiChoices: (runtime, seatKey) => {
      const seatIndex = runtime.getSeatIndex(seatKey);
      return seatIndex >= 0 ? getRiichiChoices(runtime, seatIndex) : [];
    }
  });
  const {
    closeDoubleRiichiWindow,
    validateRiichiDeclaration,
    markRiichiDeclaration,
    finalizeDiscardTurn,
    clearSeatIppatsu,
    clearAllIppatsu,
    markIppatsuPendingExpiry,
    consumePendingIppatsuExpiry
  } = runtimeRiichiFlowHelpers;
  const runtimeDrawSupportHelpers = createRuntimeDrawSupportHelpers({
    getSeatKeys: () => CANONICAL_SEAT_KEYS.slice(),
    getSeatKeyByIndex: (runtime, seatIndex) => (
      runtime.getSeatKeyByIndex ? runtime.getSeatKeyByIndex(seatIndex) : (CANONICAL_SEAT_KEYS[seatIndex] || null)
    ),
    getSeatIndex: (runtime, seatKey) => runtime.getSeatIndex(seatKey),
    calculateXiangting: browserCore.calculateXiangting,
    getTingpai: browserCore.getTingpai,
    getSeatRiichiState: (runtime, seatKey) => getSeatRiichiState(runtime, seatKey),
    getDeclaredNoDaopaiSeats: (runtime) => (
      runtime && Array.isArray(runtime.declaredNoDaopaiSeats)
        ? runtime.declaredNoDaopaiSeats.slice()
        : []
    ),
    getTianhuValue: (runtime, seatKey, options) => getTianhuValue(runtime, seatKey, options),
    allowPingju: (runtime, shoupai, diyizimo) => (
      browserMajiang && browserMajiang.Game && typeof browserMajiang.Game.allow_pingju === 'function'
        ? browserMajiang.Game.allow_pingju(runtime.rule, shoupai, diyizimo)
        : false
    ),
    allowNoDaopai: (runtime, shoupai, paishu) => (
      browserMajiang && browserMajiang.Game && typeof browserMajiang.Game.allow_no_daopai === 'function'
        ? browserMajiang.Game.allow_no_daopai(runtime.rule, shoupai, paishu)
        : false
    ),
    shouldDealerContinueOnDraw: (ruleConfig, context) => (
      roundContinuationPolicy.shouldDealerContinueOnDraw(ruleConfig, context)
    )
  });
  const {
    isExhaustiveDrawState,
    buildExhaustiveDrawResultOptions,
    getPendingReactionHuleActions,
    canDeclareNineKindsDraw,
    canDeclareNoDaopai
  } = runtimeDrawSupportHelpers;

  function getRulesetProfile(input = {}) {
    if (rulesetProfileApi && typeof rulesetProfileApi.getRulesetProfile === 'function') {
      return rulesetProfileApi.getRulesetProfile(input);
    }
    const tableSize = Number(input.tableSize || 4) || 4;
    return {
      id: typeof input.id === 'string' && input.id ? input.id : `riichi-${tableSize}p`,
      seatCount: tableSize,
      tableSize,
      handSize: 13,
      deadWallSize: 14,
      enableChi: true,
      enablePeng: true,
      enableGang: true,
      enableRiichi: true,
      startingScore: 25000,
      targetScore: 30000,
      tableLayout: tableSize === 3 ? '3p-rounded-triangle' : '4p-octagon',
      uiMode: tableSize === 3 ? 'sanma' : 'standard'
    };
  }

  function normalizeFriendlyRuleConfig(config = {}, rulesetProfile = null) {
    if (rulesetProfileApi && typeof rulesetProfileApi.normalizeFriendlyRuleConfig === 'function') {
      return rulesetProfileApi.normalizeFriendlyRuleConfig(config, rulesetProfile);
    }
    return {
      ruleOverrides: config && config.ruleOverrides && typeof config.ruleOverrides === 'object'
        ? clone(config.ruleOverrides)
        : {},
      customRuleConfig: {
        shibariMinYakuHan: 1
      }
    };
  }

  function createNormalizedActionWindow(actionWindow) {
    if (actionBuilderApi && typeof actionBuilderApi.createActionWindow === 'function') {
      return actionBuilderApi.createActionWindow(actionWindow);
    }
    return actionWindow ? clone(actionWindow) : null;
  }

  function createPassAction(options = {}) {
    if (actionBuilderApi && typeof actionBuilderApi.createPassAction === 'function') {
      return actionBuilderApi.createPassAction(options);
    }
      return {
        type: 'pass',
        key: options.key || 'pass',
        label: options.label || '跳过',
        group: options.group || 'reaction',
        priority: Number.isFinite(options.priority) ? Number(options.priority) : REACTION_PRIORITY.PASS,
        payload: clone(options.payload || {}),
        bgChar: options.bgChar || '过',
        variant: options.variant || 'skip',
        textLayout: options.textLayout || '',
        row: Number.isFinite(options.row) ? Number(options.row) : 1,
        enabled: options.enabled !== false,
        visible: options.visible !== false
      };
  }

  function createReactionAction(options = {}) {
    if (actionBuilderApi && typeof actionBuilderApi.createReactionAction === 'function') {
      return actionBuilderApi.createReactionAction(options);
    }
      return {
        type: options.type || 'call',
        key: options.key || `${options.type || 'call'}:${options.seat || 'unknown'}`,
        label: options.label || options.type || 'reaction',
        group: options.group || 'reaction',
        priority: Number.isFinite(options.priority) ? Number(options.priority) : 0,
        payload: clone(options.payload || {}),
        bgChar: options.bgChar || '',
        variant: options.variant || '',
        textLayout: options.textLayout || '',
        row: Number.isFinite(options.row) ? Number(options.row) : 1,
        enabled: options.enabled !== false,
        visible: options.visible !== false
      };
  }

  function getSeatMenfengIndex(runtime, seatKeyOrIndex) {
    const seatIndex = Number.isInteger(seatKeyOrIndex)
      ? seatKeyOrIndex
      : runtime.getSeatIndex(seatKeyOrIndex);
    return seatIndex;
  }

  const settlementHooks = {
    seatKeys: CANONICAL_SEAT_KEYS,
    getSeatIndex: (runtime, seatKey) => runtime.getSeatIndex(seatKey),
    getSeatKeyByIndex: (runtime, seatIndex) => (
      runtime.getSeatKeyByIndex
        ? runtime.getSeatKeyByIndex(seatIndex)
        : (CANONICAL_SEAT_KEYS[seatIndex] || null)
    ),
    getSeatMenfengIndex: (runtime, seatKey, resolvedSeatIndex) => (
      getSeatMenfengIndex(runtime, Number.isInteger(resolvedSeatIndex) ? resolvedSeatIndex : seatKey)
    ),
    getSeatKitaState: (runtime, seatKey) => (
      runtime && runtime.seatMeta && runtime.seatMeta[seatKey]
        ? runtime.seatMeta[seatKey]
        : null
    ),
    getSeatRiichiState,
    getSeatTurnState
  };

  const settlementFubaopaiHooks = {
    seatKeys: CANONICAL_SEAT_KEYS,
    getSeatKeyByIndex: (runtime, seatIndex) => (
      runtime.getSeatKeyByIndex
        ? runtime.getSeatKeyByIndex(seatIndex)
        : (CANONICAL_SEAT_KEYS[seatIndex] || null)
    ),
    getSeatRiichiState
  };

  function getTileAsset(code) {
    if (!code || code === '_') return null;
    return TILE_ASSET_MAP[code[0]] ? TILE_ASSET_MAP[code[0]][code[1]] || null : null;
  }

  function isKitaEnabled(runtime) {
    return Boolean(
      runtime
        && runtime.rulesetProfile
        && runtime.rulesetProfile.id === 'riichi-3p-sanma'
    );
  }

  function countTileInHand(shoupai, tileCode) {
    if (!shoupai || !shoupai._bingpai || typeof tileCode !== 'string' || tileCode.length < 2) return 0;
    const suit = tileCode[0];
    const rank = Number(tileCode[1]);
    const bingpai = shoupai._bingpai[suit];
    if (!bingpai || !Number.isInteger(rank)) return 0;
    return Number(bingpai[rank] || 0) || 0;
  }

  function getTianhuValue(runtime, seatKey, options = {}) {
    return runtimeSettlementHelpers.getTianhuValue(runtime, seatKey, options, settlementHooks);
  }

  function getKanChoices(runtime, seatIndex) {
    if (!runtime || seatIndex < 0 || !runtime.board || !runtime.board.shoupai[seatIndex]) return [];
    const shoupai = runtime.board.shoupai[seatIndex].clone();
    const wallState = runtime && typeof runtime.getWallState === 'function'
      ? runtime.getWallState()
      : null;
    const paishu = wallState && Number.isFinite(Number(wallState.remaining))
      ? Number(wallState.remaining)
      : 0;
    return browserMajiang.Game.get_gang_mianzi(
      runtime.rule,
      shoupai,
      null,
      paishu,
      countRuntimeKanMelds(runtime)
    ) || [];
  }

  function buildHupaiContext(runtime, seatKey, options = {}) {
    return runtimeSettlementHelpers.buildHupaiContext(runtime, seatKey, options, settlementHooks);
  }

  function createHuleParams(runtime, shoupai, seatIndex, options = {}) {
    return runtimeSettlementHelpers.createHuleParams(runtime, shoupai, seatIndex, options, settlementHooks);
  }

  const closeRoundShan = runtimeSettlementHelpers.closeRoundShan;

  function getResolvedFubaopai(runtime, shoupai, options = {}) {
    return runtimeSettlementHelpers.getResolvedFubaopai(runtime, shoupai, options, settlementFubaopaiHooks);
  }

  const applyHuleSettlement = runtimeSettlementHelpers.applyHuleSettlement;
  const applyDrawSettlement = runtimeSettlementHelpers.applyDrawSettlement;
  const applyKitaSettlementAdjustments = runtimeSettlementHelpers.applyKitaSettlementAdjustments;

  function createDefaultSeatMeta() {
    return {
      bottom: { title: '自家', name: '南宫', human: true, active: true, ai: { enabled: false, difficulty: 'beta' }, kitaTiles: [] },
      right: { title: '大师', name: '隐僧', human: false, active: true, ai: { enabled: true, difficulty: 'beta' }, kitaTiles: [] },
      top: { title: '对家', name: '幽兰', human: false, active: true, ai: { enabled: true, difficulty: 'beta' }, kitaTiles: [] },
      left: { title: '雀豪', name: '剑客', human: false, active: true, ai: { enabled: true, difficulty: 'beta' }, kitaTiles: [] }
    };
  }

  function normalizeSeatKitaTiles(tiles = []) {
    return (Array.isArray(tiles) ? tiles : []).slice(0, 4).map((tile) => {
      if (!tile) return null;
      if (typeof tile === 'string') {
        return {
          asset: getTileAsset(tile),
          label: tile,
          code: tile,
          open: true
        };
      }
      if (typeof tile !== 'object') return null;
      const code = typeof tile.code === 'string' ? tile.code : null;
      return {
        asset: tile.asset || (code ? getTileAsset(code) : null),
        label: tile.label || code || '',
        code,
        open: tile.open !== false
      };
    }).filter(Boolean);
  }

  function createDefaultRound(rulesetProfile, topology = {}) {
    const profile = rulesetProfile || getRulesetProfile({
      tableSize: topology.tableSize || 4
    });
    const tableSize = Number(topology.tableSize || profile.tableSize || profile.seatCount || 4) || 4;
    const activeSeats = Array.isArray(topology.activeSeats) && topology.activeSeats.length
      ? topology.activeSeats.slice()
      : CANONICAL_SEAT_KEYS.slice();
    const hiddenSeats = Array.isArray(topology.hiddenSeats)
      ? topology.hiddenSeats.slice()
      : CANONICAL_SEAT_KEYS.filter((seatKey) => !activeSeats.includes(seatKey));

    const player = tableSize === 2
      ? ['自家', '对家']
      : ['玩家', '下家', '对家', '上家'];

    return {
      title: 'AceZero Mahjong Single Round',
      player,
      qijia: 0,
      zhuangfeng: 0,
      jushu: 0,
      changbang: 0,
      lizhibang: 0,
      advancedMode: false,
      ruleset: profile.id,
      uiMode: profile.uiMode,
      tableLayout: profile.tableLayout,
      tableSize,
      activeSeats,
      hiddenSeats,
      defen: Array.from({ length: profile.seatCount || tableSize }, () => profile.startingScore),
      seatMeta: createDefaultSeatMeta()
    };
  }

  function getRuntimeShibariMinYakuHan(runtime) {
    return getShibariMinYakuHan(runtime && runtime.customRuleConfig ? runtime.customRuleConfig : null);
  }

  function getResolvedRonTileCode(runtime, seatKey, options = {}) {
    if (options.rongpai) return options.rongpai;
    if (options.claimTileCode) return options.claimTileCode;
    if (options.tileCode && options.fromSeat) {
      return getClaimTileCode(options.tileCode, runtime.getSeatIndex(options.fromSeat), runtime.getSeatIndex(seatKey));
    }
    return null;
  }

  function evaluateHuleResult(runtime, seatKey, shoupai, options = {}) {
    if (!runtime || !seatKey || !shoupai) return null;
    const seatIndex = runtime.getSeatIndex(seatKey);
    if (seatIndex < 0) return null;
    const resolvedShoupai = shoupai.clone ? shoupai.clone() : shoupai;
    const rongpai = getResolvedRonTileCode(runtime, seatKey, options);
    const hupaiContext = buildHupaiContext(runtime, seatKey, {
      ...options,
      seatIndex,
      shoupai: resolvedShoupai,
      rongpai,
      claimTileCode: options.claimTileCode || rongpai || null,
      selfDraw: !rongpai,
      lingshang: Boolean(options.lingshang)
    });
    return browserCore.calculateHule(
      resolvedShoupai,
      rongpai,
      createHuleParams(runtime, resolvedShoupai, seatIndex, {
        ...options,
        seatIndex,
        hupai: hupaiContext,
        fubaopai: getResolvedFubaopai(runtime, resolvedShoupai, options)
      })
    );
  }

  function canSeatHule(runtime, seatKey, shoupai, options = {}) {
    if (!runtime || !seatKey || !shoupai) return false;
    const seatIndex = runtime.getSeatIndex(seatKey);
    if (seatIndex < 0) return false;
    const claimTileCode = options.claimTileCode || getResolvedRonTileCode(runtime, seatKey, options);
    const hupaiContext = options.hupai || buildHupaiContext(runtime, seatKey, {
      ...options,
      seatIndex,
      shoupai,
      rongpai: claimTileCode,
      claimTileCode: claimTileCode || null,
      selfDraw: !claimTileCode,
      lingshang: Boolean(options.lingshang)
    });
    if (!safeAllowHule(
      runtime.rule,
      shoupai,
      claimTileCode,
      runtime.board.zhuangfeng,
      getSeatMenfengIndex(runtime, seatKey),
      hupaiContext,
      getSeatNengRong(runtime, seatKey)
    )) {
      return false;
    }
    const shibariMinYakuHan = getRuntimeShibariMinYakuHan(runtime);
    if (shibariMinYakuHan <= 1) return true;
    const result = evaluateHuleResult(runtime, seatKey, shoupai, {
      ...options,
      seatIndex,
      hupai: hupaiContext,
      claimTileCode: claimTileCode || null
    });
    return satisfiesShibari(result, shibariMinYakuHan);
  }

  function getHandCodesFromPaistr(paistr) {
    const shoupai = browserCore.createShoupaiFromString(paistr || '');
    return getShoupaiTiles(shoupai)
      .filter((tile) => !tile.hidden)
      .map((tile) => tile.code);
  }

  function buildPresetRoundData(round, activeSeats = CANONICAL_SEAT_KEYS) {
    const sourceHands = round && round.shoupai;
    const shoupai = activeSeats.map((seatKey, seatIndex) => {
      if (Array.isArray(sourceHands)) return sourceHands[seatIndex] || '';
      if (sourceHands && typeof sourceHands === 'object') return sourceHands[seatKey] || '';
      return '';
    });
    const baopai = Array.isArray(round.baopai) ? round.baopai.slice(0, 5) : ['m5'];

    return {
      source: 'preset',
      shoupai,
      baopai,
      haipai: shoupai.map((paistr) => getHandCodesFromPaistr(paistr)),
      remaining: Math.max(0, 122 - activeSeats.length * 13)
    };
  }

  function getShoupaiTiles(shoupai) {
    if (!shoupai || !shoupai._bingpai) return [];

    const tiles = [];
    const suits = ['m', 'p', 's', 'z'];

    suits.forEach((suit) => {
      const bingpai = shoupai._bingpai[suit];
      if (!bingpai) return;
      let redCount = suit === 'z' ? 0 : bingpai[0];

      for (let value = 1; value < bingpai.length; value += 1) {
        let tileCount = bingpai[value];
        if (shoupai._zimo) {
          if (`${suit}${value}` === shoupai._zimo) tileCount -= 1;
          if (value === 5 && `${suit}0` === shoupai._zimo) {
            tileCount -= 1;
            redCount -= 1;
          }
        }

        for (let index = 0; index < tileCount; index += 1) {
          if (value === 5 && redCount > 0) {
            tiles.push({ code: `${suit}0`, hidden: false });
            redCount -= 1;
          } else {
            tiles.push({ code: `${suit}${value}`, hidden: false });
          }
        }
      }
    });

    const hiddenCount = (shoupai._bingpai._ || 0) + (shoupai._zimo === '_' ? -1 : 0);
    for (let index = 0; index < hiddenCount; index += 1) {
      tiles.push({ code: '_', hidden: true });
    }

    if (shoupai._zimo && shoupai._zimo.length <= 2) {
      tiles.push({
        code: shoupai._zimo,
        hidden: shoupai._zimo === '_'
      });
    }

    return tiles;
  }

  function extractMelds(shoupai) {
    return (shoupai._fulou || []).map((meld) => {
      const normalized = browserCore.validateMeldString(meld);
      if (!normalized) return { type: 'chi', source: 'right', tiles: [] };
      const suit = normalized[0];
      const sourceChar = (normalized.match(/[\+\=\-]/) || [''])[0];
      const sourceMap = { '+': 'left', '=': 'across', '-': 'right' };
      const source = sourceMap[sourceChar] || 'right';
      const digits = normalized.match(/\d/g) || [];
      const normalizedDigits = normalized.replace(/0/g, '5').match(/\d/g) || [];
      let type = 'chi';
      if (digits.length === 4) {
        if (normalized.match(/\d{3}[\+\=\-]\d$/)) type = 'kan-added';
        else type = sourceChar ? 'kan-open' : 'kan-concealed';
      }
      else if (new Set(normalizedDigits).size === 1) type = 'pon';
      return {
        type,
        source,
        tiles: digits.map((digit) => ({
          code: `${suit}${digit}`,
          asset: getTileAsset(`${suit}${digit}`),
          label: `${suit}${digit}`,
          kind: 'flat',
          hidden: false
        }))
      };
    });
  }

  function getSeatSnapshot(board, seatIndex, meta, hiddenHand, options) {
    const shoupai = board.shoupai[seatIndex];
    const he = board.he[seatIndex];
    const seatKey = options && options.seatKey ? options.seatKey : CANONICAL_SEAT_KEYS[seatIndex] || 'bottom';
    if (!shoupai || !he) {
      return {
        seat: seatKey,
        title: meta && meta.title ? meta.title : '',
        name: meta && meta.name ? meta.name : '',
        kitaTiles: Array.isArray(meta && meta.kitaTiles) ? clone(meta.kitaTiles) : [],
        handTiles: [],
        melds: [],
        riverTiles: [],
        inactive: true,
        riichi: {
          active: false,
          tileIndex: -1,
          displayMode: options && options.riichiDisplayMode === 'upright' ? 'upright' : 'flat',
          stickVisible: !options || options.riichiStickVisible !== false
        },
        riichiState: clone(options && options.riichiState ? options.riichiState : null),
        furitenState: clone(options && options.furitenState ? options.furitenState : null),
        status: clone(options && options.status ? options.status : null)
      };
    }

    const parsedTiles = getShoupaiTiles(shoupai);
    const hasDrawnTile = Boolean(shoupai && shoupai._zimo);
    const visibleRiverCodes = (he._pai || []).filter((code) => !/[\+\=\-]$/.test(code));
    const riverTiles = visibleRiverCodes.map((code) => ({
      code: code.replace(/\*$/, ''),
      asset: getTileAsset(code.replace(/\*$/, '')),
      label: code.replace(/\*$/, ''),
      kind: 'flat',
      hidden: false
    }));
    const riichiTileIndex = (he._pai || []).findIndex((code) => /\*$/.test(code));
    const visibleRiichiTileIndex = riichiTileIndex >= 0
      ? (he._pai || []).slice(0, riichiTileIndex + 1).filter((code) => !/[\+\=\-]$/.test(code)).length - 1
      : -1;

    return {
      seat: seatKey,
      title: meta.title,
      name: meta.name,
      kitaTiles: Array.isArray(meta && meta.kitaTiles) ? clone(meta.kitaTiles) : [],
      handTiles: hiddenHand
        ? Array.from({ length: parsedTiles.length || 13 }, (_, index) => ({
            kind: 'stand',
            hidden: true,
            code: parsedTiles[index] ? parsedTiles[index].code : null,
            extraClass: hasDrawnTile && index === (parsedTiles.length || 13) - 1 ? 'hand-gap' : ''
          }))
        : parsedTiles.map((tile, index) => ({
            code: tile.code,
            asset: getTileAsset(tile.code),
            label: tile.code,
            kind: 'stand',
            hidden: tile.hidden,
            extraClass: hasDrawnTile && index === parsedTiles.length - 1 ? 'hand-gap' : ''
          })),
      melds: extractMelds(shoupai),
      riverTiles,
      riichi: {
        active: visibleRiichiTileIndex >= 0,
        tileIndex: visibleRiichiTileIndex,
        displayMode: options && options.riichiDisplayMode === 'upright' ? 'upright' : 'flat',
        stickVisible: !options || options.riichiStickVisible !== false
      },
      riichiState: clone(options && options.riichiState ? options.riichiState : null),
      furitenState: clone(options && options.furitenState ? options.furitenState : null),
      status: clone(options && options.status ? options.status : null)
    };
  }

  function buildInactiveSeatSnapshot(seatKey, meta = {}, options = {}) {
    return {
      seat: seatKey,
      title: meta && meta.title ? meta.title : '',
      name: meta && meta.name ? meta.name : '',
      kitaTiles: Array.isArray(meta && meta.kitaTiles) ? clone(meta.kitaTiles) : [],
      handTiles: [],
      melds: [],
      riverTiles: [],
      inactive: true,
      riichi: {
        active: false,
        tileIndex: -1,
        displayMode: options && options.riichiDisplayMode === 'upright' ? 'upright' : 'flat',
        stickVisible: !options || options.riichiStickVisible !== false
      },
      riichiState: clone(options && options.riichiState ? options.riichiState : null),
      furitenState: clone(options && options.furitenState ? options.furitenState : null),
      status: clone(options && options.status ? options.status : null)
    };
  }

  function buildSharedInfo(runtime) {
    const wallState = runtime && typeof runtime.getWallState === 'function'
      ? runtime.getWallState()
      : { remaining: 0, baopai: [] };
    const scores = CANONICAL_SEAT_KEYS.reduce((result, seatKey) => {
      const isActiveSeat = runtime && runtime.topology && typeof runtime.topology.isActiveSeat === 'function'
        ? runtime.topology.isActiveSeat(seatKey)
        : runtime.activeSeats.includes(seatKey);
      if (!isActiveSeat) {
        result[seatKey] = 0;
        return result;
      }
      const playerIndex = runtime.getPlayerIdentityIndex ? runtime.getPlayerIdentityIndex(seatKey) : CANONICAL_SEAT_KEYS.indexOf(seatKey);
      result[seatKey] = playerIndex >= 0
        ? (runtime.board.defen[playerIndex] || 0)
        : 0;
      return result;
    }, {});
    const seatWinds = typeof runtime.getSeatWindMap === 'function' ? runtime.getSeatWindMap() : {};

    return {
      tableSize: runtime.presentation.tableSize,
      activeSeats: runtime.presentation.activeSeats.slice(),
      hiddenSeats: runtime.presentation.hiddenSeats.slice(),
      ruleset: runtime.presentation.ruleset,
      uiMode: runtime.presentation.uiMode,
      tableLayout: runtime.presentation.tableLayout,
      advancedMode: runtime.presentation.advancedMode,
      roundText: `${['東', '南', '西', '北'][runtime.board.zhuangfeng] || '東'}${runtime.board.jushu + 1}`,
      honba: runtime.board.changbang,
      riichiSticks: runtime.board.lizhibang,
      centerRiichiVisible: runtime.presentation.centerRiichiVisible,
      centerDoraVisible: runtime.presentation.centerDoraVisible,
      centerKitaVisible: runtime.presentation.centerKitaVisible,
      remaining: Number(wallState.remaining || 0) || 0,
      turnSeat: runtime.turnSeat || runtime.getSeatKeyByIndex(runtime.board.lunban) || 'bottom',
      dealerSeat: typeof runtime.getDealerSeat === 'function' ? runtime.getDealerSeat() : 'bottom',
      seatWinds: clone(seatWinds),
      scores,
      doraTiles: (Array.isArray(wallState.baopai) ? wallState.baopai : []).slice(0, 5).map((code) => ({
        asset: getTileAsset(code),
        label: code || '',
        open: Boolean(code)
      }))
    };
  }

  const browserViewBuilder = createRuntimeViewBuilder({
    seatKeys: CANONICAL_SEAT_KEYS,
    clone,
    buildInfo: buildSharedInfo,
    buildSeatSnapshot(runtime, seatKey, hiddenHand) {
      if (runtime && runtime.topology && typeof runtime.topology.isActiveSeat === 'function' && !runtime.topology.isActiveSeat(seatKey)) {
        return buildInactiveSeatSnapshot(
          seatKey,
          runtime.seatMeta[seatKey] || { title: '', name: '' },
          {
            riichiDisplayMode: runtime.presentation.advancedMode ? 'upright' : 'flat',
            riichiStickVisible: runtime.presentation.advancedMode,
            riichiState: runtime.riichiState && runtime.riichiState[seatKey] ? runtime.riichiState[seatKey] : null,
            furitenState: runtime.furitenState && runtime.furitenState[seatKey] ? runtime.furitenState[seatKey] : null,
            status: typeof runtime.getSeatStatus === 'function' ? runtime.getSeatStatus(seatKey) : null
          }
        );
      }
      const seatIndex = runtime.getSeatIndex(seatKey);
      return getSeatSnapshot(
        runtime.board,
        seatIndex,
        runtime.seatMeta[seatKey] || { title: '', name: '' },
        hiddenHand,
        {
          seatKey,
          riichiDisplayMode: runtime.presentation.advancedMode ? 'upright' : 'flat',
          riichiStickVisible: runtime.presentation.advancedMode,
          riichiState: runtime.riichiState && runtime.riichiState[seatKey] ? runtime.riichiState[seatKey] : null,
          furitenState: runtime.furitenState && runtime.furitenState[seatKey] ? runtime.furitenState[seatKey] : null,
          status: typeof runtime.getSeatStatus === 'function' ? runtime.getSeatStatus(seatKey) : null,
          kitaTiles: runtime.seatMeta && runtime.seatMeta[seatKey]
            ? normalizeSeatKitaTiles(runtime.seatMeta[seatKey].kitaTiles || [])
            : []
        }
      );
    }
  });

  function normalizeGameConfig(options = {}) {
    const config = options || {};
    const roundInput = config.round && typeof config.round === 'object' ? config.round : {};
    const rulesetProfile = getRulesetProfile({
      id: config.ruleset || roundInput.ruleset,
      tableSize: config.tableSize || roundInput.tableSize || 4
    });
    const normalizedRuleConfig = normalizeFriendlyRuleConfig(config, rulesetProfile);
    const topologyApi = global.AceMahjongSeatTopology;
    const topology = topologyApi && typeof topologyApi.createSeatTopology === 'function'
      ? topologyApi.createSeatTopology({
          tableSize: config.tableSize || roundInput.tableSize || rulesetProfile.tableSize,
          threePlayerLayout: config.threePlayerLayout || (config.ui && config.ui.threePlayerLayout) || null
        })
      : {
          tableSize: Number(config.tableSize || roundInput.tableSize || rulesetProfile.tableSize) || rulesetProfile.tableSize,
          activeSeats: CANONICAL_SEAT_KEYS.slice(),
          hiddenSeats: [],
          getNextSeat(seatKey) {
            const index = CANONICAL_SEAT_KEYS.indexOf(seatKey);
            return CANONICAL_SEAT_KEYS[(index + 1 + CANONICAL_SEAT_KEYS.length) % CANONICAL_SEAT_KEYS.length] || 'bottom';
          }
        };

    const defaults = createDefaultSeatMeta();
    const players = Array.isArray(config.players) ? config.players.slice() : [];
    const playersBySeat = new Map(
      players
        .filter((player) => player && typeof player === 'object' && typeof player.seat === 'string')
        .map((player) => [player.seat, player])
    );
    const seatMeta = {};
    const orderedPlayers = topology.activeSeats.map((seatKey, seatIndex) => (
      playersBySeat.get(seatKey) || players[seatIndex] || {}
    ));
    const resolvedUiMode = roundInput.uiMode
      || (config.ui && typeof config.ui.uiMode === 'string' ? config.ui.uiMode : null)
      || (topology.tableSize === 3 ? 'sanma' : rulesetProfile.uiMode);
    const resolvedTableLayout = (config.ui && typeof config.ui.tableLayout === 'string' && config.ui.tableLayout)
      ? config.ui.tableLayout
      : (roundInput.tableLayout || (topology.tableSize === 3 ? '3p-rounded-triangle' : rulesetProfile.tableLayout));
    CANONICAL_SEAT_KEYS.forEach((seatKey) => {
      seatMeta[seatKey] = {
        ...defaults[seatKey],
        kitaTiles: normalizeSeatKitaTiles(defaults[seatKey].kitaTiles || []),
        active: topology.activeSeats.includes(seatKey)
      };
    });

    orderedPlayers.forEach((player, seatIndex) => {
      const seatKey = topology.activeSeats[seatIndex];
      if (!seatKey) return;
      seatMeta[seatKey] = {
        ...seatMeta[seatKey],
        title: typeof player.title === 'string' && player.title ? player.title : seatMeta[seatKey].title,
        name: typeof player.name === 'string' && player.name ? player.name : seatMeta[seatKey].name,
        human: typeof player.human === 'boolean' ? player.human : seatKey === 'bottom',
        ai: player.ai && typeof player.ai === 'object'
          ? clone(player.ai)
          : clone(seatMeta[seatKey].ai || { enabled: seatKey !== 'bottom', difficulty: 'beta' }),
        kitaTiles: normalizeSeatKitaTiles(player.kitaTiles || seatMeta[seatKey].kitaTiles || []),
        active: true
      };
    });

    return {
      mode: config.mode || 'single-round',
      ruleset: config.ruleset || rulesetProfile.id,
      rulesetProfile,
      customRuleConfig: normalizedRuleConfig.customRuleConfig || { shibariMinYakuHan: 1 },
      topology,
      ui: config.ui && typeof config.ui === 'object' ? { ...config.ui } : {},
      testing: config.testing && typeof config.testing === 'object' ? clone(config.testing) : {},
      ruleOverrides: normalizedRuleConfig.ruleOverrides || {},
      engine: config.engine && typeof config.engine === 'object' ? { ...config.engine } : {},
      players: orderedPlayers,
      round: {
        ...createDefaultRound(rulesetProfile, topology),
        ...roundInput,
        title: roundInput.title || config.title || 'AceZero Mahjong Single Round',
        ruleset: config.ruleset || rulesetProfile.id,
        uiMode: resolvedUiMode,
        tableLayout: resolvedTableLayout,
        advancedMode: typeof config.advancedMode === 'boolean'
          ? config.advancedMode
          : typeof roundInput.advancedMode === 'boolean'
            ? roundInput.advancedMode
            : false,
        centerKitaVisible: typeof roundInput.centerKitaVisible === 'boolean'
          ? roundInput.centerKitaVisible
          : Boolean(resolvedUiMode === 'sanma' || topology.tableSize === 3),
        tableSize: topology.tableSize,
        activeSeats: topology.activeSeats.slice(),
        hiddenSeats: topology.hiddenSeats.slice(),
        seatMeta
      }
    };
  }

  function createConfiguredDrawPolicy(normalizedConfig) {
    const drawPolicyApi = global.AceMahjongDrawPolicy;
    if (!drawPolicyApi || typeof drawPolicyApi.createNoOpDrawPolicy !== 'function') {
      return null;
    }

    const policies = [];
    const scriptedWall = normalizedConfig
      && normalizedConfig.engine
      && normalizedConfig.engine.wall
      && normalizedConfig.engine.wall.scripted
      && typeof normalizedConfig.engine.wall.scripted === 'object'
        ? normalizedConfig.engine.wall.scripted
        : null;

    if (scriptedWall && typeof drawPolicyApi.createScriptedDrawPolicy === 'function') {
      policies.push(drawPolicyApi.createScriptedDrawPolicy(scriptedWall));
    }

    if (!policies.length) {
      return drawPolicyApi.createNoOpDrawPolicy();
    }

    if (typeof drawPolicyApi.createCompositeDrawPolicy === 'function') {
      policies.push(drawPolicyApi.createNoOpDrawPolicy());
      return drawPolicyApi.createCompositeDrawPolicy(policies);
    }

    return policies[0];
  }

  function getRiichiChoices(runtime, seatIndex) {
    if (seatIndex < 0) return [];
    const seatKey = runtime.getSeatKeyByIndex ? runtime.getSeatKeyByIndex(seatIndex) : (CANONICAL_SEAT_KEYS[seatIndex] || null);
    const playerIndex = seatKey && typeof runtime.getPlayerIdentityIndex === 'function'
      ? runtime.getPlayerIdentityIndex(seatKey)
      : seatIndex;
    const wallState = runtime && typeof runtime.getWallState === 'function'
      ? runtime.getWallState()
      : null;
    const choices = browserCore.getRiichiChoices(
      runtime.rule,
      runtime.board.shoupai[seatIndex].clone(),
      wallState && Number.isFinite(Number(wallState.remaining)) ? Number(wallState.remaining) : 0,
      runtime.board.defen[playerIndex] || 0
    );
    return Array.isArray(choices)
      ? choices.map((choice) => String(choice || '').replace(/[\*_\+\=\-]+$/g, ''))
      : [];
  }

  function createRiichiAction() {
    const baseAction = actionBuilderApi && typeof actionBuilderApi.createRiichiAction === 'function'
      ? actionBuilderApi.createRiichiAction({
          label: '立直',
          group: 'special',
          priority: 10
        })
      : {
          type: 'ui-action',
          key: 'riichi',
          label: '立直',
          group: 'special',
          priority: 10,
          payload: { actionKey: 'riichi' }
        };

    return {
      ...baseAction,
      bgChar: '立',
      textLayout: 'len-2',
      variant: 'riichi',
      row: 0
    };
  }

  function createKitaAction(seatKey = 'bottom') {
    const baseAction = actionBuilderApi && typeof actionBuilderApi.createUiAction === 'function'
      ? actionBuilderApi.createUiAction({
          type: 'kita',
          key: `kita:${seatKey}`,
          actionKey: `kita:${seatKey}`,
          label: '拔北',
          group: 'special',
          priority: 115,
          payload: { seat: seatKey }
        })
      : {
          type: 'kita',
          key: `kita:${seatKey}`,
          label: '拔北',
          group: 'special',
          priority: 115,
          payload: { seat: seatKey }
        };

    return {
      ...baseAction,
      bgChar: '北',
      textLayout: 'len-2',
      variant: 'alert',
      row: 0
    };
  }

  function inferActionType(action) {
    if (!action) return null;
    if (typeof action.type === 'string' && action.type) return normalizeRuntimeActionType(action.type);
    if (typeof action.key === 'string' && action.key) return normalizeRuntimeActionType(action.key.split(':')[0]);
    return null;
  }

  function buildReactionCandidates(runtime, discardSeat, tileCode) {
    if (!browserMajiang || !browserMajiang.Game) return [];
    return runtimeReactionHelpers.buildReactionCandidates(runtime, discardSeat, tileCode, {
      reactionPriority: REACTION_PRIORITY,
      getSeatIndex: (currentRuntime, seatKey) => currentRuntime.getSeatIndex(seatKey),
      getActiveSeats: (currentRuntime, currentDiscardSeat) => currentRuntime.activeSeats.filter((seatKey) => seatKey !== currentDiscardSeat),
      getNextSeat: (currentRuntime, seatKey) => currentRuntime.getNextSeatKey(seatKey),
      getClaimTileCode,
      buildHupaiContext,
      allowHule: (currentRuntime, shoupai, claimTileCode, seatIndex, hupai, seatKey) => (
        canSeatHule(currentRuntime, seatKey, shoupai, {
          claimTileCode,
          hupai,
          fromSeat: discardSeat,
          tileCode
        })
      ),
      getGangMelds: (currentRuntime, shoupai, claimTileCode, paishu) => (
        browserMajiang.Game.get_gang_mianzi(currentRuntime.rule, shoupai, claimTileCode, paishu, countRuntimeKanMelds(currentRuntime)) || []
      ),
      getPengMelds: (currentRuntime, shoupai, claimTileCode, paishu) => browserMajiang.Game.get_peng_mianzi(currentRuntime.rule, shoupai, claimTileCode, paishu) || [],
      getChiMelds: (currentRuntime, shoupai, claimTileCode, paishu) => (
        currentRuntime.rulesetProfile && currentRuntime.rulesetProfile.enableChi === false
          ? []
          : (browserMajiang.Game.get_chi_mianzi(currentRuntime.rule, shoupai, claimTileCode, paishu) || [])
      ),
      createReactionAction,
      createPassAction,
      sortReactionActions
    });
  }

  function rebuildReactionWindow(runtime) {
    return runtimeReactionFlowHelpers.rebuildPendingReaction(runtime, {
      cloneContext: (context) => clone(context),
      applyPendingReactionFuriten,
      clearActionWindow: (currentRuntime) => currentRuntime.setActionWindow(null),
      setReactionActionWindow: (currentRuntime, actions) => currentRuntime.setActionWindow({
        visible: true,
        layout: 'reaction',
        actions,
        activeActionKey: null
      }),
      emitReactionWindowClosed: (currentRuntime, payload) => currentRuntime.emit('reaction-window:closed', payload),
      resolvePostReactionState,
      getSnapshot: (currentRuntime) => currentRuntime.getSnapshot()
    });
  }

  function resolvePostReactionState(runtime, context = {}) {
    if (Array.isArray(context.selectedHuleActions) && context.selectedHuleActions.length) {
      applyPendingReactionFuriten(runtime, context);
      const orderedSelections = context.selectedHuleActions
        .slice()
        .sort((left, right) => Number(left.reactionOrder || 0) - Number(right.reactionOrder || 0));
      const discardReplyResolution = context.kind === 'discard'
        ? runtimeRuleHelpers.projectDiscardReplyResolution(runtime, context, {
            selectedHuleSeats: orderedSelections.map((entry) => entry.seatKey)
          })
        : null;

      if (discardReplyResolution && discardReplyResolution.kind === 'draw') {
        const drawOptions = {
          commitPendingRiichi: Boolean(discardReplyResolution.commitPendingRiichi)
        };
        if (discardReplyResolution.revealedHands) {
          drawOptions.revealedHands = discardReplyResolution.revealedHands;
        }
        return runtime.resolveDraw(discardReplyResolution.reason, drawOptions);
      }

      if (orderedSelections.length === 1) {
        const selection = orderedSelections[0];
        return runtime.resolveHule(selection.seatKey, {
          ...selection.options,
          fromSeat: context.fromSeat || null,
          tileCode: context.tileCode || null,
          finalizeImmediately: true
        });
      }

      const {
        settlements,
        totalFenpei
      } = runtimePostReactionHelpers.buildSelectedHuleSettlements(runtime, orderedSelections, context, {
        clone,
        calculateHule: browserCore.calculateHule,
        buildHupaiContext,
        getResolvedFubaopai,
        createHuleParams
      });

      runtimePostReactionHelpers.applyMultiHuleBoardState(runtime, settlements, totalFenpei, context);

      runtime.setActionWindow(null);
      runtime.pendingReaction = null;
      runtime.pendingKanResolution = null;
      runtime.roundResult = buildMultiHuleRoundResult(runtime, settlements, {
        qianggang: Boolean(orderedSelections.some((entry) => entry.options && entry.options.qianggang)),
        lingshang: false
      });
      runtime.setPhase(FORMAL_PHASES.ROUND_END);
      runtime.emit('round:hule', {
        seat: settlements[0] ? settlements[0].winnerSeat : null,
        result: settlements[0] ? settlements[0].result : null,
        roundResult: runtime.roundResult
      });
      return runtime.emit('round:end', { type: 'hule', roundResult: runtime.roundResult });
    }

    return runtimePostReactionHelpers.resolvePostReactionWithoutHule(runtime, context, {
      runtimeRuleHelpers,
      completePendingKanSequence: (currentRuntime) => currentRuntime.completePendingKanSequence(),
      resolveDraw: (currentRuntime, reason, options) => currentRuntime.resolveDraw(reason, options),
      isExhaustiveDrawState,
      buildExhaustiveDrawResultOptions,
      prepareExhaustiveDrawResolution: (currentRuntime, reason, buildOptions) => (
        typeof currentRuntime.prepareExhaustiveDrawResolution === 'function'
          ? currentRuntime.prepareExhaustiveDrawResolution(reason, buildOptions)
          : null
      ),
      advanceToNextTurn: (currentRuntime, nextContext) => {
        currentRuntime.turnSeat = nextContext.nextSeat;
        currentRuntime.board.lunban = currentRuntime.getSeatIndex(nextContext.nextSeat);
        currentRuntime.setPhase(FORMAL_PHASES.AWAIT_DRAW);
        return currentRuntime.getSnapshot();
      }
    });
  }

  function normalizeActionPayload(action) {
    if (!action || typeof action !== 'object') return {};
    return action.payload && typeof action.payload === 'object'
      ? { ...action.payload }
      : {};
  }

  function chooseAutoDiscardDecision(runtime, seatKey) {
    const seatIndex = runtime.getSeatIndex(seatKey);
    if (seatIndex < 0) return null;
    const shoupai = runtime.board.shoupai[seatIndex];
    if (!shoupai) return null;
    const handCodes = runtime.getSeatHandCodes(seatKey);
    if (!handCodes.length) return null;

    const drawnCode = shoupai._zimo && shoupai._zimo.length <= 2 ? shoupai._zimo : null;
      const candidates = browserCore.getDiscardCandidates(runtime.rule, shoupai.clone())
        .map((code) => String(code || '').replace(/\*$/, ''))
        .filter(Boolean);

    if (!candidates.length) {
      return {
        tileCode: handCodes[handCodes.length - 1],
        tileIndex: handCodes.length - 1
      };
    }

    let best = null;
    candidates.forEach((candidate) => {
      const simulated = shoupai.clone().dapai(candidate);
        const xiangting = browserCore.calculateXiangting(simulated);
        const tingpaiCount = browserCore.getTingpai(simulated).length;
      const isDrawDiscard = candidate === drawnCode;
      const preferredIndex = (() => {
        if (!isDrawDiscard) {
          const nonDrawnIndex = handCodes.findIndex((code, index) => code === candidate && index !== handCodes.length - 1);
          if (nonDrawnIndex >= 0) return nonDrawnIndex;
        }
        return handCodes.findIndex((code) => code === candidate);
      })();

      const next = {
        tileCode: candidate,
        tileIndex: preferredIndex >= 0 ? preferredIndex : handCodes.length - 1,
        xiangting,
        tingpaiCount,
        isDrawDiscard
      };

      if (!best) {
        best = next;
        return;
      }
      if (next.xiangting < best.xiangting) {
        best = next;
        return;
      }
      if (next.xiangting > best.xiangting) return;
      if (next.tingpaiCount > best.tingpaiCount) {
        best = next;
        return;
      }
      if (next.tingpaiCount < best.tingpaiCount) return;
      if (best.isDrawDiscard && !next.isDrawDiscard) {
        best = next;
        return;
      }
      if (next.tileIndex < best.tileIndex) {
        best = next;
      }
    });

    return best;
  }

  function createFormalRuntimeCore(config = {}) {
    const normalizedConfig = normalizeGameConfig(config);
    const runtime = browserRuntimeInitialization.createRuntimeShell(normalizedConfig, {
      FORMAL_PHASES,
      createRule: (ruleOverrides) => browserCore.createRule(ruleOverrides),
      createDefaultRound,
      createDefaultSeatMeta,
      createInitialRiichiState,
      createInitialTurnState,
      createInitialFuritenState,
      createConfiguredDrawPolicy,
      createWallService: (options) => global.AceMahjongWallService.createWallService(options)
    });
    browserRuntimeInitialization.initializeRoundState(runtime, config, {
      buildPresetRoundData,
      createBoard: (options) => browserCore.createBoard(options)
    });
    browserRuntimeAssembly.attachFoundationMethods(runtime, {
      FORMAL_PHASES,
      CANONICAL_SEAT_KEYS,
      browserViewBuilder,
      clone,
      createNormalizedActionWindow,
      getShoupaiTiles,
      getRiichiChoices,
      buildSeatStatusState,
      buildHupaiContext,
      canSeatHule,
      canDeclareKita: (runtime, seatKey) => isKitaEnabled(runtime) && countTileInHand(runtime.board && runtime.board.shoupai ? runtime.board.shoupai[runtime.getSeatIndex(seatKey)] : null, 'z4') > 0 && seatKey === runtime.turnSeat && runtime.phase === FORMAL_PHASES.AWAIT_DISCARD,
      canDeclareNineKindsDraw,
      canDeclareNoDaopai,
      getSeatDiscardCandidateCodes,
      resetRuntimeRiichiTracking,
      applyTestingRuntimeSetup,
      refreshAllFuritenStates
    });

    browserRuntimeActions.attachActionMethods(runtime, {
      FORMAL_PHASES,
      REACTION_PRIORITY,
      browserMajiang,
      clone,
      getTileAsset,
      calculateHule: browserCore.calculateHule,
      runtimeRuleHelpers,
      runtimeReactionHelpers,
      runtimeReactionFlowHelpers,
      applyKitaSettlementAdjustments,
      buildReactionCandidates,
      buildHupaiContext,
      createHuleParams,
      getResolvedFubaopai,
      applyHuleSettlement,
      applyDrawSettlement,
      buildHuleRoundResult,
      buildDrawRoundResult,
      rebuildReactionWindow,
      resolvePostReactionState,
      getPendingReactionHuleActions,
      getReactionFuritenSeatKeys,
      getSeatMenfengIndex,
      getSeatNengRong,
      safeAllowHule,
      getShibariMinYakuHan,
      satisfiesShibari,
      getClaimTileCode,
      getKanClaimTileCode,
      detectKanType,
      createReactionAction,
      createPassAction,
      sortReactionActions,
      findBlockingReactionAction,
      markIppatsuPendingExpiry,
      refreshSeatFuritenState,
      consumePendingIppatsuExpiry,
      prepareSeatForDiscard,
      validateRiichiDeclaration,
      markRiichiDeclaration,
      finalizeDiscardTurn,
      closeDoubleRiichiWindow,
      clearAllIppatsu,
      applyPendingReactionFuriten,
      markSameTurnFuriten,
      observeMissedWinningTile,
      applyReactionPassFuriten
    });

    return runtime;
  }

  global.AceMahjongFormalRuntimeSharedCore = {
    CANONICAL_SEAT_KEYS,
    FORMAL_PHASES,
    clone,
    aiApi,
    getRiichiChoices,
    getKanChoices,
    createRiichiAction,
    createKitaAction,
    isKitaEnabled,
    countTileInHand,
    buildExhaustiveDrawResultOptions,
    inferActionType,
    normalizeActionPayload,
    chooseAutoDiscardDecision,
    createFormalRuntimeCore
  };
})(window);
