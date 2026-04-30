'use strict';

const {
  SEAT_KEYS,
  Majiang,
  createRule,
  createBoard,
  getRiichiChoices,
  getDiscardCandidates,
  calculateXiangting,
  getTingpai,
  validateMeldString,
  allowNoDaopai,
  getSeatIndexByKey,
  getSeatKeyByIndex,
  calculateHule,
  toFrontendTile,
  clone
} = require('../base/majiang-core-adapter');
const { getRulesetProfile, normalizeFriendlyRuleConfig } = require('../base/ruleset-profile');
const createRoundContinuationPolicy = require('../../shared/core/round-continuation');
const {
  createActionWindow,
  createPassAction,
  createReactionAction
} = require('../base/action-builder');
const { createSeatTopology } = require('../base/seat-topology');
const { createWallService } = require('../base/wall-service');
const { createExtensionManager } = require('../extensions/extension-manager');
const {
  ROUND_PHASES,
  createRoundStateMachine
} = require('./round-state-machine');
const {
  REACTION_PRIORITY,
  findBlockingReactionAction,
  getClaimTileCode,
  sortReactionActions
} = require('./reaction-priority');
const { createActionResolver } = require('./action-resolver');
const { buildRuntimeSnapshot } = require('./snapshot-builder');
const {
  buildHuleRoundResult,
  buildMultiHuleRoundResult,
  buildDrawRoundResult
} = require('./round-result-builder');
const createRuntimeRuleHelpers = require('../../shared/runtime/rules/rules');
const createRuntimePostReactionHelpers = require('../../shared/runtime/reaction/post-reaction');
const createRuntimeReactionHelpers = require('../../shared/runtime/reaction/reaction-candidates');
const createRuntimeSettlementHelpers = require('../../shared/runtime/scoring/settlement');
const createRuntimeReactionFlowHelpers = require('../../shared/runtime/reaction/reaction-flow');
const createRuntimeRoundStateSupportHelpers = require('../../shared/runtime/state/round-state-support');
const createRuntimeTestingSetupHelpers = require('../../shared/runtime/support/testing-setup');
const createRuntimeKanHelpers = require('../../shared/runtime/rules/kan');
const createRuntimeFuritenHelpers = require('../../shared/runtime/rules/furiten');
const createRuntimeHuleGateHelpers = require('../../shared/runtime/scoring/hule-gate');
const createRuntimeSeatStatusHelpers = require('../../shared/runtime/state/seat-status');
const createRuntimeRiichiFlowHelpers = require('../../shared/runtime/rules/riichi-flow');
const createRuntimeDrawSupportHelpers = require('../../shared/runtime/state/draw-support');
const roundContinuationPolicy = createRoundContinuationPolicy();
const runtimeRuleHelpers = createRuntimeRuleHelpers({
  seatKeys: SEAT_KEYS,
  normalizeMeld: validateMeldString
});
const runtimePostReactionHelpers = createRuntimePostReactionHelpers();
const runtimeReactionHelpers = createRuntimeReactionHelpers();
const runtimeSettlementHelpers = createRuntimeSettlementHelpers();
const runtimeReactionFlowHelpers = createRuntimeReactionFlowHelpers();
const runtimeRoundStateSupportHelpers = createRuntimeRoundStateSupportHelpers({
  seatKeys: SEAT_KEYS
});
const runtimeTestingSetupHelpers = createRuntimeTestingSetupHelpers();
const runtimeKanHelpers = createRuntimeKanHelpers({
  normalizeMeld: validateMeldString
});
const runtimeFuritenHelpers = createRuntimeFuritenHelpers({
  calculateXiangting,
  getTingpai,
  getSeatFuritenState: (runtime, seatKey) => runtimeRoundStateSupportHelpers.getSeatFuritenState(runtime, seatKey),
  getSeatRiichiState: (runtime, seatKey) => runtimeRoundStateSupportHelpers.getSeatRiichiState(runtime, seatKey),
  getActiveSeats: (runtime) => (
    runtime && runtime.topology && Array.isArray(runtime.topology.activeSeats)
      ? runtime.topology.activeSeats.slice()
      : SEAT_KEYS.slice()
  )
});
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
    Majiang && Majiang.Game && typeof Majiang.Game.allow_hule === 'function'
      ? Majiang.Game.allow_hule(rule, shoupai, tileCode, zhuangfeng, menfeng, hupaiFlag, nengRong)
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
    getDiscardCandidates(runtime.rule, shoupai.clone ? shoupai.clone() : shoupai) || []
  ),
  getCurrentTurnSeat: (runtime) => (
    runtime && typeof runtime.getCurrentTurnSeat === 'function' ? runtime.getCurrentTurnSeat() : null
  ),
  getCurrentPhase: (runtime) => (
    runtime && runtime.stateMachine && typeof runtime.stateMachine.getPhase === 'function'
      ? runtime.stateMachine.getPhase()
      : null
  ),
  awaitDiscardPhase: ROUND_PHASES.AWAIT_DISCARD,
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
  getSeatKeys: () => SEAT_KEYS.slice(),
  getLegalRiichiChoices: (runtime, seatKey) => {
    const seatIndex = runtime.getSeatIndex(seatKey);
    if (seatIndex < 0) return [];
    const playerIndex = runtime.getPlayerIdentityIndex(seatKey);
    const wallState = runtime && typeof runtime.getWallState === 'function'
      ? runtime.getWallState()
      : null;
    const choices = getRiichiChoices(
      runtime.rule,
      runtime.board.shoupai[seatIndex].clone(),
      wallState && Number.isFinite(Number(wallState.remaining)) ? Number(wallState.remaining) : 0,
      runtime.board.defen[playerIndex] || 0
    );
    return Array.isArray(choices)
      ? choices.map((choice) => String(choice || '').replace(/[\*_\+\=\-]+$/g, ''))
      : [];
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
  getSeatKeys: () => SEAT_KEYS.slice(),
  getSeatKeyByIndex: (runtime, seatIndex) => runtime.getSeatKeyByIndex(seatIndex),
  getSeatIndex: (runtime, seatKey) => runtime.getSeatIndex(seatKey),
  calculateXiangting,
  getTingpai,
  getSeatRiichiState: (runtime, seatKey) => getSeatRiichiState(runtime, seatKey),
  getDeclaredNoDaopaiSeats: (runtime) => (
    runtime && Array.isArray(runtime.declaredNoDaopaiSeats)
      ? runtime.declaredNoDaopaiSeats.slice()
      : []
  ),
  getTianhuValue: (runtime, seatKey, options) => getTianhuValue(runtime, seatKey, options),
  allowPingju: (runtime, shoupai, diyizimo) => (
    Majiang && Majiang.Game && typeof Majiang.Game.allow_pingju === 'function'
      ? Majiang.Game.allow_pingju(runtime.rule, shoupai, diyizimo)
      : false
  ),
  allowNoDaopai: (runtime, shoupai, paishu) => (
    allowNoDaopai(runtime.rule, shoupai, paishu)
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

function normalizeSeatKitaTiles(tiles = []) {
  return (Array.isArray(tiles) ? tiles : []).slice(0, 4).map((tile) => {
    if (!tile) return null;
    if (typeof tile === 'string') {
      const frontendTile = toFrontendTile(tile);
      return {
        ...frontendTile,
        code: tile,
        open: true
      };
    }
    if (typeof tile !== 'object') return null;
    const code = typeof tile.code === 'string' ? tile.code : null;
    const frontendTile = code ? toFrontendTile(code) : null;
    return {
      asset: tile.asset || (frontendTile ? frontendTile.asset : null),
      label: tile.label || code || '',
      kind: tile.kind || 'flat',
      hidden: Boolean(tile.hidden),
      code,
      open: tile.open !== false
    };
  }).filter(Boolean);
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

function createSeatMeta(options = {}) {
  const overrides = options && options.seatMeta && typeof options.seatMeta === 'object'
    ? options.seatMeta
    : {};
  const base = {
    bottom: { title: '自家', name: '南宫', kitaTiles: [] },
    right: { title: '大师', name: '隐僧', kitaTiles: [] },
    top: { title: '对家', name: '幽兰', kitaTiles: [] },
    left: { title: '雀豪', name: '剑客', kitaTiles: [] }
  };

  Object.keys(base).forEach((seatKey) => {
    if (overrides[seatKey] && typeof overrides[seatKey] === 'object') {
      base[seatKey] = {
        ...base[seatKey],
        ...overrides[seatKey]
      };
    }
    base[seatKey].kitaTiles = normalizeSeatKitaTiles(base[seatKey].kitaTiles || []);
  });

  if (Array.isArray(options.players)) {
    options.players.forEach((player) => {
      if (!player || typeof player !== 'object' || typeof player.seat !== 'string' || !base[player.seat]) return;
      base[player.seat] = {
        ...base[player.seat],
        title: typeof player.title === 'string' && player.title ? player.title : base[player.seat].title,
        name: typeof player.name === 'string' && player.name ? player.name : base[player.seat].name,
        kitaTiles: normalizeSeatKitaTiles(player.kitaTiles || base[player.seat].kitaTiles || [])
      };
    });
  }

  return base;
}

function getSeatMenfengIndex(runtime, seatKeyOrIndex) {
  const seatIndex = Number.isInteger(seatKeyOrIndex)
    ? seatKeyOrIndex
    : runtime.getSeatIndex(seatKeyOrIndex);
  return seatIndex;
}

function getWindLabelByIndex(index) {
  return ['东', '南', '西', '北'][Number(index)] || '';
}

const settlementHooks = {
  seatKeys: SEAT_KEYS,
  getSeatIndex: (runtime, seatKey) => runtime.getSeatIndex(seatKey),
  getSeatKeyByIndex: (runtime, seatIndex) => runtime.getSeatKeyByIndex(seatIndex),
  getSeatMenfengIndex: (runtime, seatKey, resolvedSeatIndex) => (
    getSeatMenfengIndex(runtime, Number.isInteger(resolvedSeatIndex) ? resolvedSeatIndex : seatKey)
  ),
  getSeatRiichiState,
  getSeatKitaState: (runtime, seatKey) => runtime && runtime.seatMeta ? runtime.seatMeta[seatKey] : null,
  getSeatTurnState
};

const settlementFubaopaiHooks = {
  seatKeys: SEAT_KEYS,
  getSeatKeyByIndex: (runtime, seatIndex) => runtime.getSeatKeyByIndex(seatIndex),
  getSeatRiichiState
};

function getTianhuValue(runtime, seatKey, options = {}) {
  return runtimeSettlementHelpers.getTianhuValue(runtime, seatKey, options, settlementHooks);
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

function createRuntimeRoundConfig(options = {}, rulesetProfile) {
  const round = options.round && typeof options.round === 'object' ? options.round : {};
  return {
    ...round,
    tableSize: Number(options.tableSize || round.tableSize || rulesetProfile.tableSize) || rulesetProfile.tableSize,
    ruleset: options.ruleset || round.ruleset || rulesetProfile.id,
    uiMode: options.uiMode || round.uiMode || rulesetProfile.uiMode,
    tableLayout: options.tableLayout || round.tableLayout || rulesetProfile.tableLayout,
    defen: Array.isArray(round.defen)
      ? round.defen.slice(0, rulesetProfile.seatCount)
      : Array.from({ length: rulesetProfile.seatCount }, () => rulesetProfile.startingScore)
  };
}

function createPresentationConfig(options = {}, rulesetProfile, roundConfig) {
  const round = roundConfig && typeof roundConfig === 'object' ? roundConfig : {};
  const topology = options.topology || createSeatTopology({
    tableSize: round.tableSize || options.tableSize || rulesetProfile.tableSize,
    threePlayerLayout: options.threePlayerLayout || round.threePlayerLayout || null
  });

  const activeSeats = Array.isArray(options.activeSeats)
    ? options.activeSeats.slice()
    : Array.isArray(round.activeSeats)
      ? round.activeSeats.slice()
      : topology.activeSeats.slice();
  const hiddenSeats = Array.isArray(options.hiddenSeats)
    ? options.hiddenSeats.slice()
    : Array.isArray(round.hiddenSeats)
      ? round.hiddenSeats.slice()
      : topology.hiddenSeats.slice();

  const advancedMode = typeof options.advancedMode === 'boolean'
    ? options.advancedMode
      : typeof round.advancedMode === 'boolean'
        ? round.advancedMode
      : false;

  return {
    tableSize: topology.tableSize,
    activeSeats,
    hiddenSeats,
    ruleset: round.ruleset || rulesetProfile.id,
    uiMode: round.uiMode || rulesetProfile.uiMode,
    tableLayout: round.tableLayout || rulesetProfile.tableLayout,
    advancedMode,
    centerRiichiVisible: typeof options.centerRiichiVisible === 'boolean'
      ? options.centerRiichiVisible
      : typeof round.centerRiichiVisible === 'boolean'
        ? round.centerRiichiVisible
        : advancedMode,
    centerDoraVisible: typeof options.centerDoraVisible === 'boolean'
      ? options.centerDoraVisible
      : typeof round.centerDoraVisible === 'boolean'
        ? round.centerDoraVisible
        : advancedMode,
    centerKitaVisible: typeof options.centerKitaVisible === 'boolean'
      ? options.centerKitaVisible
      : typeof round.centerKitaVisible === 'boolean'
        ? round.centerKitaVisible
        : (round.uiMode === 'sanma' || topology.tableSize === 3),
    view: {
      is25d: options.view && typeof options.view.is25d === 'boolean'
        ? options.view.is25d
        : true,
      hideZones: options.view && typeof options.view.hideZones === 'boolean'
        ? options.view.hideZones
        : false
    }
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
  return calculateHule(
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

function createDefaultPlayers(options = {}, topology) {
  if (Array.isArray(options.players) && options.players.length) {
    const playersBySeat = new Map();
    options.players.forEach((player) => {
      if (!player || typeof player !== 'object' || typeof player.seat !== 'string') return;
      playersBySeat.set(player.seat, player);
    });
    return SEAT_KEYS.map((seatKey, seatIndex) => {
      const player = playersBySeat.get(seatKey);
      return player && typeof player.name === 'string' && player.name
        ? player.name
        : `玩家${seatIndex + 1}`;
    });
  }

  return SEAT_KEYS.map((seatKey, seatIndex) => (
    topology.isActiveSeat(seatKey) ? `玩家${seatIndex + 1}` : `空席${seatIndex + 1}`
  ));
}

function expandSeatValues(activeSeats, values, fallbackValue) {
  const valueBySeat = new Map();
  activeSeats.forEach((seatKey, index) => {
    valueBySeat.set(seatKey, values[index]);
  });

  return SEAT_KEYS.map((seatKey) => {
    if (valueBySeat.has(seatKey)) return valueBySeat.get(seatKey);
    return typeof fallbackValue === 'function' ? fallbackValue(seatKey) : fallbackValue;
  });
}

class SingleRoundRuntime {
  constructor(options = {}) {
    this.mode = 'single-round';
    this.options = options;
    this.extensionManager = options.extensionManager
      || createExtensionManager({
        extensions: Array.isArray(options.extensions) ? options.extensions : [],
        logger: options.logger || null
      });
    this.rulesetProfile = getRulesetProfile({
      id: options.ruleset || (options.round && options.round.ruleset),
      tableSize: options.tableSize || (options.round && options.round.tableSize)
    });
    const normalizedRuleConfig = normalizeFriendlyRuleConfig(options, this.rulesetProfile);
    this.roundConfig = createRuntimeRoundConfig(options, this.rulesetProfile);
    if (this.extensionManager && typeof this.extensionManager.runHook === 'function') {
      const extensionSetup = this.extensionManager.runHook('beforeRoundSetup', {
        roundConfig: clone(this.roundConfig)
      }, {
        ruleset: this.rulesetProfile.id,
        advancedMode: Boolean(options.advancedMode || (options.round && options.round.advancedMode)),
        roundState: this.roundConfig,
        meta: {
          stage: 'constructor:round-setup'
        }
      });
      if (extensionSetup && extensionSetup.result && extensionSetup.result.roundConfigPatch) {
        this.roundConfig = {
          ...this.roundConfig,
          ...clone(extensionSetup.result.roundConfigPatch)
        };
      }
    }
    this.topology = createSeatTopology({
      tableSize: this.roundConfig.tableSize || this.rulesetProfile.tableSize,
      threePlayerLayout: options.threePlayerLayout || (options.round && options.round.threePlayerLayout) || null
    });
    this.ruleOverrides = normalizedRuleConfig.ruleOverrides || {};
    this.customRuleConfig = normalizedRuleConfig.customRuleConfig || { shibariMinYakuHan: 1 };
    this.rule = createRule(this.ruleOverrides);
    this.board = createBoard({
      title: this.roundConfig.title,
      player: createDefaultPlayers(options, this.topology),
      qijia: Number.isInteger(this.roundConfig.qijia) ? this.roundConfig.qijia : 0
    });
    this.seatMeta = createSeatMeta(options);
    this.playerSeatOrder = this.topology.activeSeats.slice();
    this.presentation = createPresentationConfig({
      ...options,
      topology: this.topology
    }, this.rulesetProfile, this.roundConfig);
    this.wallService = createWallService({
      rule: this.rule,
      ruleset: this.rulesetProfile.id,
      rulesetProfile: this.rulesetProfile,
      topology: this.topology,
      tableSize: this.topology.tableSize,
      seatCount: this.topology.activeSeats.length,
      handSize: this.rulesetProfile.handSize,
      drawPolicy: options.drawPolicy || (options.engine && options.engine.wall && options.engine.wall.drawPolicy) || null,
      extensionManager: this.extensionManager,
      shan: options.shan || (options.engine && options.engine.wall && options.engine.wall.shan) || null,
      logger: options.logger || null
    });
    this.actionWindow = null;
    this.lastEvent = null;
    this.listeners = new Set();
    this.stateMachine = createRoundStateMachine(ROUND_PHASES.AWAIT_DRAW);
    this.actionResolver = createActionResolver(this);
    this.playerSeat = options.playerSeat || 'bottom';
    this.roundStartData = null;
    this.engineSource = 'majiang-core';
    this.pendingReaction = null;
    this.pendingKanResolution = null;
    this.roundResult = null;
    this.eventLog = [];
    this.riichiState = createInitialRiichiState();
    this.turnState = createInitialTurnState();
    this.furitenState = createInitialFuritenState();
    this.declaredNoDaopaiSeats = [];
    this.turnCounter = 0;
    this.doubleRiichiWindowOpen = true;
    this.pendingSupplementDrawType = null;
  }

  subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(type, payload = {}, meta = {}) {
    const baseEvent = {
      type,
      payload,
      timestamp: Date.now(),
      meta: {
        phase: this.stateMachine.getPhase(),
        engineSource: this.engineSource,
        ...meta
      }
    };
    this.lastEvent = baseEvent;
    const event = {
      ...baseEvent,
      snapshot: this.getSnapshot()
    };
    this.lastEvent = event;
    this.eventLog.push({
      type: event.type,
      payload: clone(event.payload),
      timestamp: event.timestamp,
      meta: clone(event.meta)
    });
    if (this.eventLog.length > 50) {
      this.eventLog = this.eventLog.slice(-50);
    }
    this.listeners.forEach((listener) => {
      listener(event);
    });
    return event;
  }

  setActionWindow(actionWindow) {
    this.actionWindow = actionWindow ? createActionWindow(actionWindow) : null;
    this.emit('action-window:update', {
      actionWindow: this.actionWindow ? clone(this.actionWindow) : null,
      availableActions: this.actionWindow && Array.isArray(this.actionWindow.actions)
        ? this.actionWindow.actions.map((action) => clone(action))
        : []
    });
    return this.getSnapshot();
  }

  clearActionWindow() {
    return this.setActionWindow(null);
  }

  start() {
    this.roundResult = null;
    this.eventLog = [];
    resetRuntimeRiichiTracking(this);
    this.declaredNoDaopaiSeats = [];
    this.pendingReaction = null;
    this.pendingKanResolution = null;
    this.pendingSupplementDrawType = null;
    this.actionWindow = null;
    const dealResult = this.wallService.dealInitialHands({
      seatCount: this.topology.activeSeats.length,
      handSize: this.rulesetProfile.handSize,
      context: {
        phase: 'round-start',
        round: clone(this.roundConfig)
      }
    });

    const defen = expandSeatValues(
      this.topology.activeSeats,
      Array.isArray(this.roundConfig.defen) ? this.roundConfig.defen : [],
      this.rulesetProfile.startingScore
    );
    const boardDefen = defen.map((_, seatIndex) => {
      const playerIndex = (Number(this.roundConfig.qijia || 0) + Number(this.roundConfig.jushu || 0) + seatIndex) % defen.length;
      return defen[playerIndex];
    });
    const shoupai = expandSeatValues(
      this.topology.activeSeats,
      Array.isArray(dealResult.shoupai) ? dealResult.shoupai : [],
      ''
    );

    this.board.qipai({
      zhuangfeng: this.roundConfig.zhuangfeng,
      jushu: this.roundConfig.jushu,
      changbang: this.roundConfig.changbang,
      lizhibang: this.roundConfig.lizhibang,
      defen: boardDefen,
      baopai: Array.isArray(dealResult.baopai) ? dealResult.baopai.slice(0, 5) : ['m5'],
      shoupai
    });

    refreshAllFuritenStates(this);

    this.board.shan = this.wallService.shan;
    this.roundStartData = {
      source: dealResult.source,
      haipai: clone(dealResult.haipai),
      shoupai: shoupai.slice(),
      meta: clone(dealResult.meta || {})
    };
    if (this.options && this.options.testing && this.options.testing.runtimeSetup) {
      applyTestingRuntimeSetup(this, this.options.testing.runtimeSetup);
      refreshAllFuritenStates(this);
    }
    this.stateMachine.setPhase(ROUND_PHASES.AWAIT_DRAW);
    this.turnSeat = this.getSeatKeyByIndex(0) || this.topology.activeSeats[0] || 'bottom';
    this.emit('round:start', {
      zhuangfeng: this.board.zhuangfeng,
      jushu: this.board.jushu,
      source: dealResult.source
    });
    return this.emit('deal:initial', {
      source: dealResult.source,
      remaining: this.getWallState().remaining,
      baopai: Array.isArray(dealResult.baopai) ? dealResult.baopai.slice() : [],
      haipai: clone(dealResult.haipai),
      meta: clone(dealResult.meta || {})
    }).snapshot;
  }

  dispatch(action) {
    return this.actionResolver.resolve(action);
  }

  getPlayerIdentityIndex(seatKey) {
    const seatOrder = Array.isArray(this.playerSeatOrder) && this.playerSeatOrder.length
      ? this.playerSeatOrder
      : SEAT_KEYS;
    const seatIndex = seatOrder.indexOf(seatKey);
    if (!Number.isInteger(seatIndex) || seatIndex < 0) {
      throw new Error(`Unknown seat key: ${seatKey}`);
    }
    return seatIndex;
  }

  getSeatKeyByPlayerIdentity(playerIndex) {
    const seatOrder = Array.isArray(this.playerSeatOrder) && this.playerSeatOrder.length
      ? this.playerSeatOrder
      : SEAT_KEYS;
    return seatOrder[playerIndex] || null;
  }

  getSeatIndex(seatKey) {
    const playerIndex = this.getPlayerIdentityIndex(seatKey);
    const playerIds = this.board && Array.isArray(this.board.player_id) ? this.board.player_id : null;
    if (!playerIds) return playerIndex;
    const seatIndex = playerIds.indexOf(playerIndex);
    if (!Number.isInteger(seatIndex) || seatIndex < 0) {
      throw new Error(`Unknown seat key: ${seatKey}`);
    }
    return seatIndex;
  }

  getSeatKeyByIndex(seatIndex) {
    if (!Number.isInteger(seatIndex) || seatIndex < 0) return null;
    const playerIds = this.board && Array.isArray(this.board.player_id) ? this.board.player_id : null;
    const playerIndex = playerIds ? playerIds[seatIndex] : seatIndex;
    return this.getSeatKeyByPlayerIdentity(playerIndex);
  }

  getCurrentTurnSeat() {
    if (this.board && Number.isInteger(this.board.lunban) && this.board.lunban >= 0) {
      return this.getSeatKeyByIndex(this.board.lunban);
    }
    return this.turnSeat || this.getSeatKeyByIndex(0);
  }

  getDealerSeat() {
    return this.getSeatKeyByIndex(0);
  }

  getSeatWindIndex(seatKey) {
    return this.getSeatIndex(seatKey);
  }

  getSeatWindMap() {
    return SEAT_KEYS.reduce((result, seatKey) => {
      const windIndex = this.topology.isActiveSeat(seatKey) ? this.getSeatWindIndex(seatKey) : -1;
      result[seatKey] = {
        index: windIndex,
        label: windIndex >= 0 ? getWindLabelByIndex(windIndex) : ''
      };
      return result;
    }, {});
  }

  getScoreMap() {
    return SEAT_KEYS.reduce((result, seatKey) => {
      const playerIndex = this.topology.isActiveSeat(seatKey) ? this.getPlayerIdentityIndex(seatKey) : -1;
      result[seatKey] = playerIndex >= 0 ? (this.board.defen[playerIndex] || 0) : 0;
      return result;
    }, {});
  }

  getWallState() {
    const serviceState = this.wallService && typeof this.wallService.getState === 'function'
      ? this.wallService.getState()
      : null;
    const baopai = serviceState && Array.isArray(serviceState.baopai)
      ? serviceState.baopai.slice()
      : (this.board && this.board.shan && Array.isArray(this.board.shan.baopai) ? this.board.shan.baopai.slice() : []);
    const fubaopai = serviceState && Array.isArray(serviceState.fubaopai)
      ? serviceState.fubaopai.slice()
      : (this.board && this.board.shan && Array.isArray(this.board.shan.fubaopai) ? this.board.shan.fubaopai.slice() : []);
    const deadWallSize = serviceState && Number.isFinite(Number(serviceState.deadWallSize))
      ? Number(serviceState.deadWallSize)
      : Number(this.rulesetProfile.deadWallSize || 14) || 14;
    const doraIndicators = serviceState && Array.isArray(serviceState.doraIndicators)
      ? serviceState.doraIndicators.slice()
      : Array.from({ length: 5 }, (_, index) => baopai[index] || null);
    const uraDoraIndicators = serviceState && Array.isArray(serviceState.uraDoraIndicators)
      ? serviceState.uraDoraIndicators.slice()
      : Array.from({ length: 5 }, (_, index) => fubaopai[index] || null);

    return {
      remaining: serviceState && Number.isFinite(Number(serviceState.remaining))
        ? Number(serviceState.remaining)
        : (this.board && this.board.shan ? this.board.shan.paishu : 0),
      liveWallRemaining: serviceState && Number.isFinite(Number(serviceState.liveWallRemaining))
        ? Number(serviceState.liveWallRemaining)
        : (this.board && this.board.shan ? this.board.shan.paishu : 0),
      deadWallSize,
      baopai,
      fubaopai,
      doraIndicators,
      uraDoraIndicators,
      revealedDoraCount: serviceState && Number.isFinite(Number(serviceState.revealedDoraCount))
        ? Number(serviceState.revealedDoraCount)
        : baopai.length,
      revealedUraDoraCount: serviceState && Number.isFinite(Number(serviceState.revealedUraDoraCount))
        ? Number(serviceState.revealedUraDoraCount)
        : fubaopai.length,
      rinshanTotal: serviceState && Number.isFinite(Number(serviceState.rinshanTotal))
        ? Number(serviceState.rinshanTotal)
        : 4,
      rinshanRemaining: serviceState && Number.isFinite(Number(serviceState.rinshanRemaining))
        ? Number(serviceState.rinshanRemaining)
        : Math.max(0, 4 - Math.max(0, baopai.length - 1)),
      drawSource: this.roundStartData ? this.roundStartData.source : null
    };
  }

  getInteractionState() {
    const isBottomDiscardPhase = this.getCurrentTurnSeat() === 'bottom'
      && this.stateMachine
      && this.stateMachine.getPhase() === ROUND_PHASES.AWAIT_DISCARD;
    const canBottomDeclareKita = isBottomDiscardPhase && this.canDeclareKita('bottom');
    return {
      riichiSelection: {
        active: false,
        legalTileCodes: []
      },
      discardSelection: {
        active: Boolean(isBottomDiscardPhase),
        legalTileCodes: isBottomDiscardPhase ? getSeatDiscardCandidateCodes(this, 'bottom') : []
      },
      specialActions: {
        active: Boolean(isBottomDiscardPhase),
        legalActionKeys: canBottomDeclareKita ? ['kita'] : []
      },
      furiten: clone(this.furitenState && this.furitenState.bottom ? this.furitenState.bottom : null)
    };
  }

  canDeclareKita(seatKey) {
    if (!isKitaEnabled(this)) return false;
    if (!seatKey || seatKey !== this.getCurrentTurnSeat()) return false;
    if (!this.stateMachine || this.stateMachine.getPhase() !== ROUND_PHASES.AWAIT_DISCARD) return false;
    const seatIndex = this.getSeatIndex(seatKey);
    if (seatIndex < 0) return false;
    const seatRiichiState = getSeatRiichiState(this, seatKey);
    if (seatRiichiState && seatRiichiState.declared) return false;
    const seatMeta = this.seatMeta && this.seatMeta[seatKey] ? this.seatMeta[seatKey] : null;
    if (seatMeta && Array.isArray(seatMeta.kitaTiles) && seatMeta.kitaTiles.length >= 4) return false;
    if (this.wallService && typeof this.wallService.canDrawSupplementTile === 'function' && !this.wallService.canDrawSupplementTile()) {
      return false;
    }
    const shoupai = this.board && Array.isArray(this.board.shoupai) ? this.board.shoupai[seatIndex] : null;
    return countTileInHand(shoupai, 'z4') > 0;
  }

  canDeclareNineKindsDraw(seatKey) {
    return canDeclareNineKindsDraw(this, seatKey);
  }

  canDeclareNoDaopai(seatKey) {
    return canDeclareNoDaopai(this, seatKey);
  }

  canSeatHule(seatKey, options = {}) {
    const seatIndex = this.getSeatIndex(seatKey);
    const shoupai = options.shoupai || (
      seatIndex >= 0 && this.board && Array.isArray(this.board.shoupai)
        ? this.board.shoupai[seatIndex]
        : null
    );
    return canSeatHule(this, seatKey, shoupai, options);
  }

  clearNoDaopaiDeclarations() {
    this.declaredNoDaopaiSeats = [];
    return [];
  }

  declareNoDaopai(seatKey) {
    if (!seatKey || !this.canDeclareNoDaopai(seatKey)) return false;
    if (!Array.isArray(this.declaredNoDaopaiSeats)) {
      this.declaredNoDaopaiSeats = [];
    }
    if (!this.declaredNoDaopaiSeats.includes(seatKey)) {
      this.declaredNoDaopaiSeats.push(seatKey);
    }
    return true;
  }

  getSeatStatus(seatKey) {
    return buildSeatStatusState(this, seatKey);
  }

  getSeatHandCodes(seatKey) {
    return getSeatHandTileCodes(this, seatKey);
  }

  getNextSeat(seatKey) {
    return this.topology.getNextSeat(seatKey || this.getCurrentTurnSeat());
  }

  applyWallDraw(seatIndex, tileCode, method = 'zimo') {
    const shan = this.board && this.board.shan;
    if (!shan || typeof shan[method] !== 'function') {
      throw new Error(`Board shan does not support draw method: ${method}`);
    }
    let resolvedTileCode = tileCode || null;
    let drawMeta = null;

    if (!resolvedTileCode && this.wallService) {
      const drawResult = method === 'gangzimo' && typeof this.wallService.drawGangTile === 'function'
        ? this.wallService.drawGangTile({
            seat: this.getSeatKeyByIndex(seatIndex),
            reason: 'runtime-gang-draw'
          })
        : (method === 'zimo' && typeof this.wallService.drawTile === 'function'
          ? this.wallService.drawTile({
              seat: this.getSeatKeyByIndex(seatIndex),
              reason: 'runtime-draw'
            })
          : null);
      if (drawResult && drawResult.tileCode) {
        resolvedTileCode = drawResult.tileCode;
        drawMeta = drawResult;
      }
    }

    if (!resolvedTileCode) {
      resolvedTileCode = shan[method]();
    }
    this.board.lizhi();
    this.board.lunban = seatIndex;
    this.board.shoupai[seatIndex].zimo(resolvedTileCode, false);
    return {
      tileCode: resolvedTileCode,
      meta: drawMeta
    };
  }

  drawNextTile(seatKey = this.getCurrentTurnSeat(), context = {}) {
    return this.drawTile(seatKey, null, {
      source: 'majiang-core:shan',
      context
    });
  }

  drawTile(seatKey, tileCode, options = {}) {
    const resolvedSeat = seatKey || this.getCurrentTurnSeat();
    const seatIndex = this.getSeatIndex(resolvedSeat);
    const drawData = this.applyWallDraw(seatIndex, tileCode, 'zimo');
    const resolvedTileCode = drawData.tileCode;
    markIppatsuPendingExpiry(this, resolvedSeat);
    refreshSeatFuritenState(this, resolvedSeat);
    this.pendingSupplementDrawType = null;
    this.stateMachine.setPhase(ROUND_PHASES.AWAIT_DISCARD);
    const wallState = this.getWallState();
    return this.emit('tile:draw', {
      seat: resolvedSeat,
      tileCode: resolvedTileCode,
      source: options.source || (drawData.meta && drawData.meta.source) || 'majiang-core:shan',
      meta: options.meta || (drawData.meta && drawData.meta.meta) || null,
      remaining: wallState.remaining,
      baopai: Array.isArray(wallState.baopai) ? wallState.baopai.slice() : []
    }).snapshot;
  }

  drawGangTile(seatKey = this.getCurrentTurnSeat(), options = {}) {
    const resolvedSeat = seatKey || this.getCurrentTurnSeat();
    const seatIndex = this.getSeatIndex(resolvedSeat);
    const drawData = this.applyWallDraw(seatIndex, null, 'gangzimo');
    const resolvedTileCode = drawData.tileCode;
    markIppatsuPendingExpiry(this, resolvedSeat);
    refreshSeatFuritenState(this, resolvedSeat);
    this.pendingSupplementDrawType = 'gang';
    this.stateMachine.setPhase(ROUND_PHASES.AWAIT_DISCARD);
    const wallState = this.getWallState();
    return this.emit('tile:gang-draw', {
      seat: resolvedSeat,
      tileCode: resolvedTileCode,
      source: options.source || (drawData.meta && drawData.meta.source) || 'majiang-core:shan:gang',
      meta: options.meta || (drawData.meta && drawData.meta.meta) || null,
      remaining: wallState.remaining,
      baopai: Array.isArray(wallState.baopai) ? wallState.baopai.slice() : []
    }).snapshot;
  }

  discardTile(seatKey, tileCode, options = {}) {
    const seatIndex = this.getSeatIndex(seatKey);
    consumePendingIppatsuExpiry(this, seatKey);
    prepareSeatForDiscard(this, seatKey);
    this.pendingSupplementDrawType = null;
    if (options.riichi) {
      validateRiichiDeclaration(this, seatKey, tileCode);
    }
    const dapaiCode = options.riichi ? `${tileCode}*` : tileCode;
    this.board.dapai({
      l: seatIndex,
      p: dapaiCode
    });
    if (options.riichi) {
      markRiichiDeclaration(this, seatKey);
    }
    finalizeDiscardTurn(this, seatKey);
    refreshSeatFuritenState(this, seatKey);
    this.clearPendingReaction();
    this.stateMachine.setPhase(ROUND_PHASES.AWAIT_REACTION);
    this.emit('tile:discard', {
      seat: seatKey,
      tileCode,
      riichi: Boolean(options.riichi)
    });
    this.openReactionWindow(seatKey, tileCode);
    return this.getSnapshot();
  }

  declareKita(seatKey, options = {}) {
    if (!this.canDeclareKita(seatKey)) {
      throw new Error(`Kita is not available for seat ${seatKey}.`);
    }

    const seatIndex = this.getSeatIndex(seatKey);
    const shoupai = this.board && Array.isArray(this.board.shoupai) ? this.board.shoupai[seatIndex] : null;
    if (!shoupai || typeof shoupai.dapai !== 'function') {
      throw new Error(`Seat ${seatKey} does not have a mutable hand state.`);
    }

    shoupai.dapai('z4');

    if (!this.seatMeta[seatKey]) {
      this.seatMeta[seatKey] = { kitaTiles: [] };
    }
    if (!Array.isArray(this.seatMeta[seatKey].kitaTiles)) {
      this.seatMeta[seatKey].kitaTiles = [];
    }

    const kitaTile = {
      ...toFrontendTile('z4'),
      code: 'z4',
      open: true
    };
    this.seatMeta[seatKey].kitaTiles.push(kitaTile);

    let drawResult = null;
    if (this.wallService && typeof this.wallService.drawKitaTile === 'function') {
      drawResult = this.wallService.drawKitaTile({
        seat: seatKey,
        reason: 'runtime-kita-draw'
      });
    }

    let replacementTileCode = drawResult && drawResult.tileCode ? drawResult.tileCode : null;
    if (!replacementTileCode) {
      const wallState = this.getWallState();
      const shan = this.board && this.board.shan;
      if (!shan || !Array.isArray(shan._pai) || !wallState || wallState.remaining <= 0) {
        throw new Error('No supplement tile available for kita draw.');
      }
      replacementTileCode = shan._pai.shift() || null;
    }

    this.board.lunban = seatIndex;
    this.board.shoupai[seatIndex].zimo(replacementTileCode, false);
    refreshSeatFuritenState(this, seatKey);
    this.pendingSupplementDrawType = 'kita';
    this.stateMachine.setPhase(ROUND_PHASES.AWAIT_DISCARD);

    const wallState = this.getWallState();
    return this.emit('tile:kita', {
      seat: seatKey,
      tileCode: 'z4',
      replacementTileCode,
      source: options.source || (drawResult && drawResult.source) || 'majiang-core:shan:kita',
      meta: options.meta || (drawResult && drawResult.meta) || null,
      remaining: wallState.remaining,
      baopai: Array.isArray(wallState.baopai) ? wallState.baopai.slice() : [],
      kitaCount: this.seatMeta[seatKey].kitaTiles.length
    }).snapshot;
  }

  getBlockingReactionAction(type, seatKey) {
    return findBlockingReactionAction(this.pendingReaction, type, seatKey);
  }

  assertReactionActionAllowed(type, seatKey) {
    if (!this.pendingReaction) return;
    const blockingAction = this.getBlockingReactionAction(type, seatKey);
    if (!blockingAction) return;
    if (blockingAction.reason === 'missing-action') {
      throw new Error(`Reaction action is not available for seat ${seatKey}.`);
    }
    throw new Error(`Reaction action for seat ${seatKey} is blocked by higher-priority ${blockingAction.type}.`);
  }

  callMeld(seatKey, meldString) {
    this.assertReactionActionAllowed('call', seatKey);
    const seatIndex = this.getSeatIndex(seatKey);
    const reactionContext = this.pendingReaction ? clone(this.pendingReaction) : null;
    closeDoubleRiichiWindow(this);
    clearAllIppatsu(this);
    this.clearPendingReaction();
    this.pendingKanResolution = null;
    applyPendingReactionFuriten(this, reactionContext);
    this.board.fulou({
      l: seatIndex,
      m: meldString
    });
    this.board.lunban = seatIndex;
    this.stateMachine.setPhase(ROUND_PHASES.AWAIT_DISCARD);
    return this.emit('meld:call', { seat: seatKey, meld: meldString }).snapshot;
  }

  declareKan(seatKey, meldString) {
    this.assertReactionActionAllowed('kan', seatKey);
    const seatIndex = this.getSeatIndex(seatKey);
    const isReactionKan = Boolean(this.pendingReaction);
    const reactionContext = this.pendingReaction ? clone(this.pendingReaction) : null;
    closeDoubleRiichiWindow(this);
    clearAllIppatsu(this);
    const kanType = detectKanType(meldString, isReactionKan);
    this.clearPendingReaction();
    this.pendingKanResolution = null;
    if (isReactionKan) {
      applyPendingReactionFuriten(this, reactionContext);
    }
    if (isReactionKan) {
      this.board.fulou({
        l: seatIndex,
        m: meldString
      });
    } else {
      this.board.gang({
        l: seatIndex,
        m: meldString
      });
    }
    this.board.lunban = seatIndex;
    this.stateMachine.setPhase(ROUND_PHASES.AWAIT_RESOLUTION);
    return this.emit('meld:kan', { seat: seatKey, meld: meldString, kanType }).snapshot;
  }

  completePendingKanSequence(options = {}) {
    const pendingKan = this.pendingKanResolution;
    if (!pendingKan) return this.getSnapshot();
    const seatKey = pendingKan.seat;
    const meldString = pendingKan.meldString;
    const kanSnapshot = this.declareKan(seatKey, meldString);
    const kanType = this.lastEvent && this.lastEvent.payload ? this.lastEvent.payload.kanType : pendingKan.kanType;
    const gangDrawSnapshot = this.drawGangTile(seatKey, {
      source: pendingKan.drawSource || options.drawSource || 'majiang-core:shan:gang',
      meta: {
        kanType,
        sequence: 'post-kan'
      }
    });
    const doraSnapshot = this.flipDora(pendingKan.doraTileCode || options.doraTileCode, {
      nextPhase: ROUND_PHASES.AWAIT_DISCARD
    });
    return doraSnapshot || gangDrawSnapshot || kanSnapshot;
  }

  openQianggangWindow(seatKey, meldString, options = {}) {
    const seatIndex = this.getSeatIndex(seatKey);
    closeDoubleRiichiWindow(this);
    clearAllIppatsu(this);
    const tileCode = getKanClaimTileCode(meldString);
    if (!tileCode) {
      this.pendingKanResolution = {
        seat: seatKey,
        meldString,
        kanType: 'kan-added',
        doraTileCode: options.doraTileCode || null,
        drawSource: options.drawSource || 'majiang-core:shan:gang'
      };
      return this.completePendingKanSequence(options);
    }

    this.pendingKanResolution = {
      seat: seatKey,
      meldString,
      kanType: 'kan-added',
      tileCode,
      doraTileCode: options.doraTileCode || null,
      drawSource: options.drawSource || 'majiang-core:shan:gang'
    };

    const sorted = runtimeReactionHelpers.buildQianggangReactionCandidates(this, seatKey, tileCode, {
      reactionPriority: REACTION_PRIORITY,
      getSeatIndex: (runtime, currentSeatKey) => runtime.getSeatIndex(currentSeatKey),
      getActiveSeats: (runtime, currentSeatKey) => runtime.topology.activeSeats.filter((otherSeat) => otherSeat !== currentSeatKey),
      getClaimTileCode,
      buildHupaiContext,
      allowHule: (runtime, shoupai, claimTileCode, seatIndexValue, hupai, otherSeat) => (
        canSeatHule(runtime, otherSeat, shoupai, {
          claimTileCode,
          hupai,
          fromSeat: seatKey,
          tileCode
        })
      ),
      createReactionAction,
      createPassAction,
      sortReactionActions
    });
    const reactionActions = sorted.filter((action) => action.type !== 'pass');
    if (!reactionActions.length) {
      getReactionFuritenSeatKeys(this, seatKey, tileCode).forEach((otherSeat) => (
        observeMissedWinningTile(this, otherSeat, { skipRon: false })
      ));
      return this.completePendingKanSequence(options);
    }

    this.pendingReaction = {
      kind: 'qianggang',
      fromSeat: seatKey,
      tileCode,
      nextSeat: this.getNextSeat(seatKey),
      actions: sorted,
      passedSeats: [],
      furitenSeatKeys: getReactionFuritenSeatKeys(this, seatKey, tileCode),
      selectedHuleActions: []
    };

    this.stateMachine.setPhase(ROUND_PHASES.AWAIT_REACTION);
    this.setActionWindow({
      visible: true,
      layout: 'reaction',
      actions: sorted,
      activeActionKey: null
    });

    return this.emit('reaction-window:open', {
      kind: 'qianggang',
      fromSeat: seatKey,
      tileCode,
      actions: sorted.map((action) => clone(action))
    }).snapshot;
  }

  resolveKanSequence(seatKey, meldString, options = {}) {
    const kanType = detectKanType(meldString, Boolean(this.pendingReaction));
    if (kanType === 'kan-added' && !this.pendingReaction) {
      return this.openQianggangWindow(seatKey, meldString, options);
    }
    const kanSnapshot = this.declareKan(seatKey, meldString);
    const gangDrawSnapshot = this.drawGangTile(seatKey, {
      source: options.drawSource || 'majiang-core:shan:gang',
      meta: {
        kanType,
        sequence: 'post-kan'
      }
    });
    const doraSnapshot = this.flipDora(options.doraTileCode, {
      nextPhase: ROUND_PHASES.AWAIT_DISCARD
    });
    return doraSnapshot || gangDrawSnapshot || kanSnapshot;
  }

  flipDora(tileCode, options = {}) {
    if (this.wallService && typeof this.wallService.revealDora === 'function' && !tileCode) {
      this.wallService.revealDora({ reason: 'runtime-flip-dora' });
    } else if (this.board && this.board.shan && typeof this.board.shan.kaigang === 'function' && !tileCode) {
      this.board.shan.kaigang();
    } else {
      this.board.kaigang({
        baopai: tileCode
      });
    }
    const wallState = this.getWallState();
    const resolvedTileCode = Array.isArray(wallState.baopai)
      ? wallState.baopai.slice(-1)[0] || tileCode || null
      : tileCode || null;
    this.stateMachine.setPhase(options.nextPhase || this.stateMachine.phase || ROUND_PHASES.AWAIT_DRAW);
    return this.emit('dora:flip', {
      tileCode: resolvedTileCode,
      source: 'majiang-core:shan:kaigang',
      meta: null,
      remaining: wallState.remaining,
      baopai: Array.isArray(wallState.baopai) ? wallState.baopai.slice() : []
    }).snapshot;
  }

  resolveHule(seatKey, options = {}) {
    if (!options.finalizeImmediately) {
      this.assertReactionActionAllowed('hule', seatKey);
    }

    const reactionContext = this.pendingReaction ? clone(this.pendingReaction) : null;
    const resolvedFromSeat = reactionContext ? reactionContext.fromSeat : (options.fromSeat || null);
    const resolvedTileCode = reactionContext ? reactionContext.tileCode : (options.tileCode || null);
    const discardSeatIndex = resolvedFromSeat ? this.getSeatIndex(resolvedFromSeat) : null;
    const rongpai = options.rongpai
      || options.claimTileCode
      || (resolvedTileCode && discardSeatIndex != null
        ? getClaimTileCode(resolvedTileCode, discardSeatIndex, this.getSeatIndex(seatKey))
        : null);
    const resolvedLingshang = Object.prototype.hasOwnProperty.call(options, 'lingshang')
      ? Boolean(options.lingshang)
      : (!rongpai && Boolean(this.pendingSupplementDrawType));

    if (!options.finalizeImmediately && this.pendingReaction) {
      return runtimeReactionFlowHelpers.queueSelectedHuleAction(this, seatKey, {
        ...options,
        rongpai,
        claimTileCode: options.claimTileCode || rongpai || null
      }, {
        getPendingReactionHuleActions,
        emitReactionHuleSelect: (runtime, payload) => runtime.emit('reaction:hule-select', payload),
        rebuildReactionWindow: (runtime) => runtime.rebuildReactionWindow(),
        getSnapshot: (runtime) => runtime.getSnapshot()
      });
    }

    const seatIndex = this.getSeatIndex(seatKey);
    const shoupai = this.board.shoupai[seatIndex].clone();
    const hupaiContext = buildHupaiContext(this, seatKey, {
      ...options,
      seatIndex,
      shoupai,
      rongpai,
      claimTileCode: options.claimTileCode,
      selfDraw: !rongpai,
      lingshang: resolvedLingshang
    });
    const settledFubaopai = getResolvedFubaopai(this, shoupai, options);
    const rawResult = calculateHule(
      shoupai,
      rongpai,
      createHuleParams(this, shoupai, seatIndex, {
        ...options,
        hupai: hupaiContext,
        seatIndex,
        fubaopai: settledFubaopai
      })
    );
    if (!satisfiesShibari(rawResult, getRuntimeShibariMinYakuHan(this))) {
      throw new Error('Hand does not satisfy shibari requirement.');
    }
    const result = applyKitaSettlementAdjustments(this, seatIndex, rawResult, {
      ...options,
      seatKey,
      fromSeat: resolvedFromSeat,
      rongpai,
      baojiaIndex: resolvedFromSeat ? this.getSeatIndex(resolvedFromSeat) : null,
      kitaCount: Number(hupaiContext.kita || 0)
    }, settlementHooks);

    applyHuleSettlement(this, seatIndex, result, {
      rongpai,
      baojiaIndex: resolvedFromSeat ? this.getSeatIndex(resolvedFromSeat) : null
    });
    if (reactionContext) {
      applyPendingReactionFuriten(this, reactionContext);
    }
    this.setActionWindow(null);
    this.clearPendingReaction();
    this.pendingKanResolution = null;
    this.pendingSupplementDrawType = null;
    this.stateMachine.setPhase(ROUND_PHASES.ROUND_END);
    this.roundResult = buildHuleRoundResult(this, seatKey, result, {
      fromSeat: resolvedFromSeat,
      tileCode: resolvedTileCode,
      rongpai,
      qianggang: Boolean(options.qianggang),
      lingshang: resolvedLingshang,
      haidi: Number(hupaiContext.haidi || 0),
      tianhu: Number(hupaiContext.tianhu || 0),
      kitaCount: Number(result && result.kitaCount || 0),
      kitaTiles: Array.isArray(result && result.kitaTiles) ? result.kitaTiles.map((tile) => ({ ...tile })) : []
    });
    this.emit('round:hule', {
      seat: seatKey,
      result,
      roundResult: this.roundResult
    });
    this.emit('round:end', {
      type: 'hule',
      roundResult: this.roundResult
    });

    return result;
  }

  resolveDraw(reason = 'exhaustive-draw', options = {}) {
    if (options.commitPendingRiichi !== false) {
      runtimeRuleHelpers.commitPendingRiichiStick(this);
    }
    applyDrawSettlement(this, options);
    this.setActionWindow(null);
    this.clearPendingReaction();
    this.pendingKanResolution = null;
    this.stateMachine.setPhase(ROUND_PHASES.ROUND_END);
    this.roundResult = buildDrawRoundResult(this, reason, options);
    this.emit('round:draw', {
      reason,
      roundResult: this.roundResult
    });
    this.emit('round:end', {
      type: 'draw',
      roundResult: this.roundResult
    });
    return this.roundResult;
  }

  resolvePostReactionState(context = {}) {
    if (Array.isArray(context.selectedHuleActions) && context.selectedHuleActions.length) {
      applyPendingReactionFuriten(this, context);
      const orderedSelections = context.selectedHuleActions
        .slice()
        .sort((left, right) => Number(left.reactionOrder || 0) - Number(right.reactionOrder || 0));
      const discardReplyResolution = context.kind === 'discard'
        ? runtimeRuleHelpers.projectDiscardReplyResolution(this, context, {
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
        return this.resolveDraw(discardReplyResolution.reason, drawOptions);
      }

      if (orderedSelections.length === 1) {
        const selection = orderedSelections[0];
        return this.resolveHule(selection.seatKey, {
          ...selection.options,
          fromSeat: context.fromSeat || null,
          tileCode: context.tileCode || null,
          finalizeImmediately: true
        });
      }

      const {
        settlements,
        totalFenpei
      } = runtimePostReactionHelpers.buildSelectedHuleSettlements(this, orderedSelections, context, {
        clone,
        calculateHule,
        buildHupaiContext,
        getResolvedFubaopai,
        createHuleParams,
        applyKitaSettlementAdjustments
      });

      runtimePostReactionHelpers.applyMultiHuleBoardState(this, settlements, totalFenpei, context);

      this.setActionWindow(null);
      this.clearPendingReaction();
      this.pendingKanResolution = null;
      this.stateMachine.setPhase(ROUND_PHASES.ROUND_END);
      this.roundResult = buildMultiHuleRoundResult(this, settlements, {
        qianggang: Boolean(orderedSelections.some((entry) => entry.options && entry.options.qianggang)),
        lingshang: false
      });
      this.emit('round:hule', {
        seat: settlements[0] ? settlements[0].winnerSeat : null,
        result: settlements[0] ? settlements[0].result : null,
        roundResult: this.roundResult
      });
      this.emit('round:end', {
        type: 'hule',
        roundResult: this.roundResult
      });
      return this.roundResult;
    }

    return runtimePostReactionHelpers.resolvePostReactionWithoutHule(this, context, {
      runtimeRuleHelpers,
      completePendingKanSequence: (runtime) => runtime.completePendingKanSequence(),
      resolveDraw: (runtime, reason, options) => runtime.resolveDraw(reason, options),
      isExhaustiveDrawState,
      buildExhaustiveDrawResultOptions,
      advanceToNextTurn: (runtime, nextContext) => {
        runtime.board.lunban = runtime.getSeatIndex(nextContext.nextSeat);
        runtime.stateMachine.setPhase(ROUND_PHASES.AWAIT_DRAW);
        return runtime.getSnapshot();
      }
    });
  }

  setScores(scores = {}) {
    SEAT_KEYS.forEach((seatKey) => {
      const value = scores[seatKey];
      if (typeof value !== 'number') return;
      const playerIndex = this.getPlayerIdentityIndex(seatKey);
      this.board.defen[playerIndex] = value;
    });
    return this.emit('scores:update', { scores }).snapshot;
  }

  clearPendingReaction() {
    this.pendingReaction = null;
    return this.clearActionWindow();
  }

  buildReactionCandidates(discardSeat, tileCode) {
    const candidates = runtimeReactionHelpers.buildReactionCandidates(this, discardSeat, tileCode, {
      reactionPriority: REACTION_PRIORITY,
      getSeatIndex: (runtime, seatKey) => runtime.getSeatIndex(seatKey),
      getActiveSeats: (runtime, currentDiscardSeat) => runtime.topology.activeSeats.filter((seatKey) => seatKey !== currentDiscardSeat),
      getNextSeat: (runtime, seatKey) => runtime.getNextSeat(seatKey),
      getClaimTileCode,
      buildHupaiContext,
      allowHule: (runtime, shoupai, claimTileCode, seatIndex, hupai, seatKey) => (
        canSeatHule(runtime, seatKey, shoupai, {
          claimTileCode,
          hupai,
          fromSeat: discardSeat,
          tileCode
        })
      ),
      getGangMelds: (runtime, shoupai, claimTileCode, paishu) => (
        Majiang.Game.get_gang_mianzi(runtime.rule, shoupai, claimTileCode, paishu, countRuntimeKanMelds(runtime)) || []
      ),
      getPengMelds: (runtime, shoupai, claimTileCode, paishu) => Majiang.Game.get_peng_mianzi(runtime.rule, shoupai, claimTileCode, paishu) || [],
      getChiMelds: (runtime, shoupai, claimTileCode, paishu) => (
        runtime.rulesetProfile && runtime.rulesetProfile.enableChi === false
          ? []
          : (Majiang.Game.get_chi_mianzi(runtime.rule, shoupai, claimTileCode, paishu) || [])
      ),
      createReactionAction,
      createPassAction,
      sortReactionActions
    });

    if (!this.extensionManager || typeof this.extensionManager.runHook !== 'function') {
      return candidates;
    }

    const execution = this.extensionManager.runHook('modifyReactionCandidates', {
      discardSeat,
      tileCode,
      candidates: clone(candidates)
    }, {
      ruleset: this.rulesetProfile.id,
      advancedMode: Boolean(this.presentation && this.presentation.advancedMode),
      actorSeat: discardSeat,
      seatKeys: this.topology.activeSeats.slice(),
      roundState: this.roundConfig,
      wallState: this.getWallState(),
      boardState: this.board,
      presentation: this.presentation,
      meta: {
        stage: 'reaction-candidates'
      }
    });

    return execution && execution.result && Array.isArray(execution.result.candidates)
      ? execution.result.candidates
      : candidates;
  }

  openReactionWindow(discardSeat, tileCode) {
    const candidates = this.buildReactionCandidates(discardSeat, tileCode);
    const nextSeat = this.getNextSeat(discardSeat);
    const furitenSeatKeys = getReactionFuritenSeatKeys(this, discardSeat, tileCode);

    return runtimeReactionFlowHelpers.openPendingReaction(this, {
      kind: 'discard',
      fromSeat: discardSeat,
      tileCode,
      nextSeat,
      actions: candidates,
      furitenSeatKeys
    }, {
      cloneActions: (actions) => actions.map((action) => clone(action)),
      onEmpty: (runtime, context) => {
        context.furitenSeatKeys.forEach((seatKey) => (
          observeMissedWinningTile(runtime, seatKey, { skipRon: false })
        ));
        runtime.pendingReaction = null;
        runtime.clearActionWindow();
      },
      onOpen: (runtime, context) => {
        runtime.stateMachine.setPhase(ROUND_PHASES.AWAIT_REACTION);
        runtime.setActionWindow({
          visible: true,
          layout: 'reaction',
          actions: context.actions,
          activeActionKey: null
        });
      },
      emitReactionWindowEmpty: (runtime, payload, context) => {
        runtime.emit('reaction-window:empty', {
          fromSeat: payload.fromSeat,
          tileCode: payload.tileCode,
          nextSeat: payload.nextSeat
        }).snapshot;
        return runtime.resolvePostReactionState(context);
      },
      emitReactionWindowOpen: (runtime, payload) => runtime.emit('reaction-window:open', {
        fromSeat: payload.fromSeat,
        tileCode: payload.tileCode,
        actions: payload.actions
      }).snapshot
    });
  }

  rebuildReactionWindow() {
    return runtimeReactionFlowHelpers.rebuildPendingReaction(this, {
      cloneContext: (context) => clone(context),
      applyPendingReactionFuriten,
      clearActionWindow: (runtime) => runtime.clearActionWindow(),
      setReactionActionWindow: (runtime, actions) => runtime.setActionWindow({
        visible: true,
        layout: 'reaction',
        actions,
        activeActionKey: null
      }),
      emitReactionWindowClosed: (runtime, payload) => runtime.emit('reaction-window:closed', payload).snapshot,
      resolvePostReactionState: (runtime, context) => runtime.resolvePostReactionState(context),
      getSnapshot: (runtime) => runtime.getSnapshot()
    });
  }

  passReaction(seatKey, options = {}) {
    if (!this.pendingReaction) return this.getSnapshot();
    if (!seatKey) throw new Error('passReaction requires seatKey.');
    applyReactionPassFuriten(this, seatKey, this.pendingReaction);
    if (!this.pendingReaction.passedSeats.includes(seatKey)) {
      this.pendingReaction.passedSeats.push(seatKey);
    }
    this.emit('reaction:pass', {
      seat: seatKey,
      fromSeat: this.pendingReaction.fromSeat,
      tileCode: this.pendingReaction.tileCode,
      reason: options.reason || 'manual-pass'
    });
    return this.rebuildReactionWindow();
  }

  getSnapshot() {
    return buildRuntimeSnapshot(this);
  }
}

module.exports = {
  SingleRoundRuntime,
  ROUND_PHASES
};
