'use strict';

const fs = require('fs');
const path = require('path');

const { SingleRoundRuntime } = require('../engine/runtime/single-round-runtime');
const { createScriptedDrawPolicy } = require('../engine/base/draw-policy');
const coreAdapter = require('../engine/base/majiang-core-adapter');
const baseAiApi = require('../engine/ai/base-ai');
const discardEvaluatorApi = require('../engine/ai/discard-evaluator');
const riichiEvaluatorApi = require('../engine/ai/evaluators/riichi-evaluator');
const callEvaluatorApi = require('../engine/ai/evaluators/call-evaluator');
const defenseEvaluatorApi = require('../engine/ai/evaluators/defense-evaluator');
const handMetricsApi = require('../engine/ai/support/hand-metrics');
const visibleTilesApi = require('../engine/ai/support/visible-tiles');
const dangerModelApi = require('../engine/ai/support/danger-model');
const hardEvApi = require('../engine/ai/support/hard-ev');
const hardPushFoldApi = require('../engine/ai/support/hard-push-fold');
const hardDefenseTiebreakApi = require('../engine/ai/support/hard-defense-tiebreak');
const hardDefensiveProfileApi = require('../engine/ai/support/hard-defensive-profile');
const discardRankingApi = require('../engine/ai/support/discard-ranking');
const hardPolicyApi = require('../engine/ai/difficulty/hard-policy');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function withRightDifficulty(config, difficulty) {
  const next = clone(config);
  next.ai = {
    ...(next.ai || {}),
    implementedDifficulties: ['easy', 'normal', 'hard'],
    defaultDifficulty: difficulty
  };
  next.players = (Array.isArray(next.players) ? next.players : []).map((player) => {
    if (!player || player.seat !== 'right') return player;
    return {
      ...player,
      ai: {
        ...(player.ai || {}),
        enabled: true,
        difficulty,
        profile: 'default'
      }
    };
  });
  return next;
}

function createRuntimeFromConfig(config) {
  const scripted = config
    && config.engine
    && config.engine.wall
    && config.engine.wall.scripted
    && typeof config.engine.wall.scripted === 'object'
      ? config.engine.wall.scripted
      : null;
  const drawPolicy = scripted ? createScriptedDrawPolicy(scripted) : null;
  return new SingleRoundRuntime({
    ...config,
    drawPolicy
  });
}

function createAiController(runtime, config) {
  return baseAiApi.createAiController(runtime, config);
}

function passAllPendingReactions(runtime) {
  const seatOrder = ['right', 'top', 'left', 'bottom'];
  seatOrder.forEach((seatKey) => {
    if (!runtime.pendingReaction || !Array.isArray(runtime.pendingReaction.actions)) return;
    const hasSeatAction = runtime.pendingReaction.actions.some((action) => (
      action
      && action.payload
      && action.payload.seat === seatKey
    ));
    if (hasSeatAction) {
      runtime.passReaction(seatKey, { reason: 'validate-hard-ai-pass' });
    }
  });
}

function fastForwardToRightFirstDiscard(runtime) {
  runtime.start();
  assert(runtime.getCurrentTurnSeat() === 'bottom', `expected bottom to open the round, got ${runtime.getCurrentTurnSeat()}`);
  runtime.drawTile('bottom');
  const bottomHandCodes = runtime.getSeatHandCodes('bottom');
  assert(bottomHandCodes.length > 0, 'expected bottom seat to have drawable hand codes');
  const bottomDiscard = bottomHandCodes[bottomHandCodes.length - 1];
  runtime.discardTile('bottom', bottomDiscard);
  passAllPendingReactions(runtime);
  runtime.drawTile('right');
  const currentTurnSeat = typeof runtime.getCurrentTurnSeat === 'function'
    ? runtime.getCurrentTurnSeat()
    : runtime.turnSeat;
  const currentPhase = runtime.stateMachine && typeof runtime.stateMachine.getPhase === 'function'
    ? runtime.stateMachine.getPhase()
    : runtime.phase;
  assert(currentTurnSeat === 'right', `expected right turn after fast-forward, got ${currentTurnSeat}`);
  assert(currentPhase === 'await_discard', `expected await_discard after right draw, got ${currentPhase}`);
  return runtime.getSnapshot();
}

function setRiichiPressure(runtime, opponentSeatKey, riverCodes) {
  const seatIndex = runtime.getSeatIndex(opponentSeatKey);
  assert(seatIndex >= 0, `expected valid opponent seat ${opponentSeatKey}`);
  runtime.riichiState[opponentSeatKey].declared = true;
  runtime.riichiState[opponentSeatKey].ippatsuPending = true;
  runtime.board.he[seatIndex]._pai = riverCodes.slice();
}

function setDoraIndicators(runtime, doraIndicators) {
  const originalGetWallState = runtime.getWallState.bind(runtime);
  runtime.getWallState = function getWallStateOverride() {
    const wallState = originalGetWallState();
    return {
      ...wallState,
      baopai: doraIndicators.slice(),
      doraIndicators: Array.from({ length: 5 }, (_, index) => doraIndicators[index] || null),
      revealedDoraCount: doraIndicators.length
    };
  };
}

function setRemainingTiles(runtime, remaining) {
  const originalGetWallState = runtime.getWallState.bind(runtime);
  runtime.getWallState = function getWallStateOverride() {
    const wallState = originalGetWallState();
    return {
      ...wallState,
      remaining,
      liveWallRemaining: remaining
    };
  };
}

function setScoreMap(runtime, scoresBySeat = {}) {
  Object.entries(scoresBySeat).forEach(([seatKey, score]) => {
    const playerIndex = typeof runtime.getPlayerIdentityIndex === 'function'
      ? runtime.getPlayerIdentityIndex(seatKey)
      : -1;
    if (playerIndex >= 0 && runtime.board && Array.isArray(runtime.board.defen)) {
      runtime.board.defen[playerIndex] = Number(score || 0) || 0;
    }
  });
}

function setRoundCounts(runtime, counts = {}) {
  ['changbang', 'lizhibang'].forEach((key) => {
    if (!Number.isFinite(Number(counts[key]))) return;
    const value = Number(counts[key]);
    if (runtime.board) runtime.board[key] = value;
    if (runtime.roundConfig) runtime.roundConfig[key] = value;
  });
}

function chooseDiscard(runtime, seatKey, difficulty, options = {}) {
  return discardEvaluatorApi.evaluateRuntimeDiscard(runtime, seatKey, {
    ...options,
    difficulty,
    profile: 'default'
  });
}

function chooseHardDiscard(runtime, seatKey) {
  return chooseDiscard(runtime, seatKey, 'hard');
}

function createHardPolicyWithShapeReview(enabled, discardOverrides = {}) {
  const policy = hardPolicyApi.createHardPolicy();
  policy.discard = {
    ...(policy.discard || {}),
    enableNoPressureShapeReview: Boolean(enabled),
    ...(discardOverrides && typeof discardOverrides === 'object' ? discardOverrides : {})
  };
  return policy;
}

function chooseHardDiscardWithShapeReview(runtime, seatKey, enabled, options = {}) {
  const discardOverrides = options.discardOverrides && typeof options.discardOverrides === 'object'
    ? options.discardOverrides
    : {};
  const nextOptions = { ...options };
  delete nextOptions.discardOverrides;
  return chooseDiscard(runtime, seatKey, 'hard', {
    ...nextOptions,
    policy: createHardPolicyWithShapeReview(enabled, discardOverrides)
  });
}

function setSeatHand(runtime, seatKey, paistr) {
  const seatIndex = runtime.getSeatIndex(seatKey);
  assert(seatIndex >= 0, `expected valid seat ${seatKey}`);
  runtime.board.shoupai[seatIndex] = coreAdapter.createShoupaiFromString(paistr);
}

function normalizeCandidateForDiscard(candidate) {
  return String(candidate || '').replace(/\*$/, '');
}

function normalizeTileIdentityForAssert(tileCode) {
  const stripped = String(tileCode || '').replace(/[\*_\+\=\-]+$/g, '');
  const redMatch = stripped.match(/^([mps])0$/);
  return redMatch ? `${redMatch[1]}5` : stripped;
}

function findHardCandidateDiagnostic(decision, tileCode) {
  const normalizedTileCode = normalizeTileIdentityForAssert(tileCode);
  const diagnostics = decision && Array.isArray(decision.hardCandidateDiagnostics)
    ? decision.hardCandidateDiagnostics
    : [];
  return diagnostics.find((candidate) => (
    candidate
    && normalizeTileIdentityForAssert(candidate.tileCode) === normalizedTileCode
  )) || null;
}

function collectRightReactionActions(runtime) {
  assert(runtime.pendingReaction && Array.isArray(runtime.pendingReaction.actions), 'expected pending reaction window');
  return runtime.pendingReaction.actions.filter((action) => (
    action
    && action.payload
    && action.payload.seat === 'right'
  ));
}

function evaluateHardDiscardCandidate(runtime, seatKey, tileCode) {
  const seatIndex = runtime.getSeatIndex(seatKey);
  assert(seatIndex >= 0, `expected valid seat ${seatKey}`);
  const shoupai = runtime.board && runtime.board.shoupai
    ? runtime.board.shoupai[seatIndex]
    : null;
  assert(shoupai && typeof shoupai.clone === 'function', `expected ${seatKey} shoupai`);

  const discardCode = normalizeCandidateForDiscard(tileCode);
  const simulated = shoupai.clone().dapai(discardCode);
  const xiangting = coreAdapter.calculateXiangting(simulated);
  const tingpai = coreAdapter.getTingpai(simulated);
  const ukeireCount = handMetricsApi.estimateUkeireCount(coreAdapter, simulated);
  const handValueEstimate = handMetricsApi.estimateHandShapeValue(simulated);
  const handMetrics = {
    xiangting,
    tingpaiCount: tingpai.length,
    ukeireCount,
    handValueEstimate
  };
  const hardMetrics = hardEvApi.evaluateHardDiscardMetrics(
    coreAdapter,
    runtime,
    seatKey,
    simulated,
    {
      handValueEstimate,
      policy: {
        weights: {
          liveUkeire: 3,
          liveTingpai: 8,
          waitQuality: 4,
          handValue: 1
        }
      }
    }
  );
  const defense = defenseEvaluatorApi.evaluateRuntimeDefense(
    runtime,
    seatKey,
    discardCode,
    handMetrics,
    { difficulty: 'hard' }
  );

  return {
    tileCode: discardCode,
    xiangting,
    tingpai,
    tingpaiCount: tingpai.length,
    ukeireCount,
    handValueEstimate,
    metrics: handMetrics,
    hardMetrics,
    danger: defense && defense.danger
      ? defense.danger
      : dangerModelApi.evaluateRuntimeHardTileDanger(runtime, seatKey, discardCode, handMetrics, { difficulty: 'hard' }),
    pushFoldState: defense && defense.pushFoldState ? defense.pushFoldState : null
  };
}

function evaluateRiichiCandidate(runtime, seatKey, tileCode, difficulty, overrides = {}) {
  const seatIndex = runtime.getSeatIndex(seatKey);
  assert(seatIndex >= 0, `expected valid seat ${seatKey}`);
  const shoupai = runtime.board && runtime.board.shoupai
    ? runtime.board.shoupai[seatIndex]
    : null;
  assert(shoupai && typeof shoupai.clone === 'function', `expected ${seatKey} shoupai`);

  const candidate = evaluateHardDiscardCandidate(runtime, seatKey, tileCode);
  const discardDecision = {
    type: 'discard',
    seatKey,
    tileCode: candidate.tileCode,
    tileIndex: 0,
    shouldRiichi: false,
    difficulty,
    policyId: difficulty,
    danger: overrides.danger || candidate.danger,
    pushFoldState: overrides.pushFoldState || candidate.pushFoldState,
    metrics: {
      xiangting: candidate.xiangting,
      tingpaiCount: candidate.tingpaiCount,
      ukeireCount: candidate.ukeireCount,
      handValueEstimate: candidate.handValueEstimate
    },
    hardMetrics: candidate.hardMetrics,
    reasons: ['validate-hard-riichi-candidate']
  };

  return {
    candidate,
    riichiDecision: riichiEvaluatorApi.evaluateRuntimeRiichi(
      runtime,
      seatKey,
      shoupai,
      discardDecision,
      { difficulty, profile: 'default' }
    )
  };
}

function evaluateHardRiichiCandidate(runtime, seatKey, tileCode, overrides = {}) {
  return evaluateRiichiCandidate(runtime, seatKey, tileCode, 'hard', overrides);
}

function evaluateRightReaction(config, discardTileCode, difficulty, options = {}) {
  const runtime = createRuntimeFromConfig(config);
  runtime.start();
  if (options.riichiPressure) {
    setRiichiPressure(
      runtime,
      options.riichiPressure.seatKey || 'top',
      options.riichiPressure.riverCodes || ['z1*']
    );
  }
  runtime.drawTile('bottom');
  runtime.discardTile('bottom', discardTileCode);

  const rightActions = collectRightReactionActions(runtime);
  const decision = callEvaluatorApi.evaluateCalls(runtime, 'right', rightActions, {
    difficulty,
    profile: 'default',
    ...(options.policy ? { policy: options.policy } : {})
  });

  return {
    runtime,
    rightActions,
    decision
  };
}

function evaluateRightHardReaction(config, discardTileCode, options = {}) {
  return evaluateRightReaction(config, discardTileCode, 'hard', options);
}

function runFormalControllerSmoke(cwd) {
  const baseConfig = loadJson(path.join(cwd, 'test', 'game-config.ai-normal-current-turn-smoke.json'));
  const config = withRightDifficulty(baseConfig, 'hard');
  const runtime = createRuntimeFromConfig(config);
  const aiController = createAiController(runtime, config);

  fastForwardToRightFirstDiscard(runtime);

  const controllerConfig = aiController.getSeatConfig('right');
  const decision = aiController.chooseDiscard('right');

  assert(controllerConfig && controllerConfig.difficulty === 'hard', `expected hard seat config, got ${JSON.stringify(controllerConfig)}`);
  assert(controllerConfig.implemented === true, `expected hard to be formally implemented, got ${JSON.stringify(controllerConfig)}`);
  assert(decision && decision.type === 'discard', `expected BaseAI hard to discard, got ${JSON.stringify(decision)}`);
  assert(decision.difficulty === 'hard', `expected formal hard difficulty, got ${JSON.stringify(decision)}`);
  assert(decision.policyId === 'hard', `expected formal hard policy, got ${JSON.stringify(decision)}`);
  assert(decision.hardMetrics && decision.hardMetrics.hardContext, `expected formal hard metrics and context, got ${JSON.stringify(decision)}`);

  return {
    name: 'hard-formal-controller-smoke',
    snapshot: {
      difficulty: controllerConfig.difficulty,
      implemented: controllerConfig.implemented,
      tileCode: decision.tileCode,
      policyId: decision.policyId,
      hardContext: decision.hardMetrics.hardContext
    }
  };
}

function runCurrentTurnDirectDiscardSmoke(cwd) {
  const baseConfig = loadJson(path.join(cwd, 'test', 'game-config.ai-normal-current-turn-smoke.json'));
  const config = withRightDifficulty(baseConfig, 'hard');
  const runtime = createRuntimeFromConfig(config);

  fastForwardToRightFirstDiscard(runtime);

  const decision = chooseHardDiscard(runtime, 'right');

  assert(decision && decision.type === 'discard', `expected formal hard direct evaluator to discard, got ${JSON.stringify(decision)}`);
  assert(decision.difficulty === 'hard', `expected hard difficulty, got ${JSON.stringify(decision)}`);
  assert(decision.policyId === 'hard', `expected hard policy, got ${JSON.stringify(decision)}`);
  assert(decision.hardMetrics && decision.hardMetrics.hardContext, `expected hard metrics and context, got ${JSON.stringify(decision)}`);

  return {
    name: 'hard-current-turn-direct-discard',
    snapshot: {
      tileCode: decision.tileCode,
      difficulty: decision.difficulty,
      policyId: decision.policyId,
      hardContext: decision.hardMetrics.hardContext
    }
  };
}

function assertNoHardCandidateDiagnostics(decision, label) {
  assert(
    decision && !Object.prototype.hasOwnProperty.call(decision, 'hardCandidateDiagnostics'),
    `expected no hard candidate diagnostics for ${label}, got ${JSON.stringify(decision && decision.hardCandidateDiagnostics)}`
  );
}

function assertExactKeys(value, expectedKeys, label) {
  const actualKeys = Object.keys(value || {}).sort();
  const expected = expectedKeys.slice().sort();
  assert(
    actualKeys.length === expected.length && actualKeys.every((key, index) => key === expected[index]),
    `expected ${label} keys ${JSON.stringify(expected)}, got ${JSON.stringify(actualKeys)}`
  );
}

function assertCompactHardCandidateDiagnostic(candidate) {
  assertExactKeys(candidate, [
    'danger',
    'hardMetrics',
    'isDrawDiscard',
    'metrics',
    'selectedFinal',
    'selectedInitial',
    'route',
    'shape',
    'tileCode',
    'tileIndex'
  ], 'hard candidate diagnostic');
  assert(typeof candidate.tileCode === 'string' && candidate.tileCode, `expected diagnostic tile code, got ${JSON.stringify(candidate)}`);
  assert(Number.isFinite(Number(candidate.tileIndex)), `expected diagnostic tile index, got ${JSON.stringify(candidate)}`);
  assert(typeof candidate.isDrawDiscard === 'boolean', `expected diagnostic draw flag, got ${JSON.stringify(candidate)}`);
  assert(typeof candidate.selectedInitial === 'boolean', `expected diagnostic selectedInitial flag, got ${JSON.stringify(candidate)}`);
  assert(typeof candidate.selectedFinal === 'boolean', `expected diagnostic selectedFinal flag, got ${JSON.stringify(candidate)}`);

  assertExactKeys(candidate.metrics, [
    'handValueEstimate',
    'tingpaiCount',
    'ukeireCount',
    'xiangting'
  ], 'hard candidate metrics');
  assert(Number.isFinite(Number(candidate.metrics.tingpaiCount)), `expected diagnostic tingpai count, got ${JSON.stringify(candidate.metrics)}`);
  assert(Number.isFinite(Number(candidate.metrics.ukeireCount)), `expected diagnostic ukeire count, got ${JSON.stringify(candidate.metrics)}`);
  assert(Number.isFinite(Number(candidate.metrics.handValueEstimate)), `expected diagnostic hand value, got ${JSON.stringify(candidate.metrics)}`);

  assertExactKeys(candidate.danger, [
    'categories',
    'dangerScore',
    'defenseTileRank',
    'reasons',
    'safetyRank',
    'safetyReasons'
  ], 'hard candidate danger');
  assert(Number.isFinite(Number(candidate.danger.dangerScore)), `expected diagnostic danger score, got ${JSON.stringify(candidate.danger)}`);
  assert(Number.isFinite(Number(candidate.danger.safetyRank)), `expected diagnostic safety rank, got ${JSON.stringify(candidate.danger)}`);
  assert(Number.isFinite(Number(candidate.danger.defenseTileRank)), `expected diagnostic defense tile rank, got ${JSON.stringify(candidate.danger)}`);
  assert(Array.isArray(candidate.danger.categories), `expected diagnostic danger categories, got ${JSON.stringify(candidate.danger)}`);
  assert(Array.isArray(candidate.danger.reasons), `expected diagnostic danger reasons, got ${JSON.stringify(candidate.danger)}`);
  assert(Array.isArray(candidate.danger.safetyReasons), `expected diagnostic safety reasons, got ${JSON.stringify(candidate.danger)}`);

  assertExactKeys(candidate.hardMetrics, [
    'bestWaitType',
    'contextualHandValueEstimate',
    'hardEvScore',
    'liveTingpaiCount',
    'liveUkeireCount',
    'waitQualityScore'
  ], 'hard candidate hardMetrics');
  assert(!Object.prototype.hasOwnProperty.call(candidate.hardMetrics, 'waits'), `diagnostic hardMetrics must not include waits: ${JSON.stringify(candidate.hardMetrics)}`);
  assert(!Object.prototype.hasOwnProperty.call(candidate.hardMetrics, 'hardContext'), `diagnostic hardMetrics must not include hardContext: ${JSON.stringify(candidate.hardMetrics)}`);

  if (candidate.shape != null) {
    assertExactKeys(candidate.shape, [
      'discardShapeScore',
      'discardTileRole',
      'doraRetentionPenalty',
      'fiveOrRedFiveCutPenalty',
      'isolatedHonorCleanupBonus',
      'keptUsefulMiddleCount',
      'middleTileCutPenalty',
      'pairOrBlockBreakPenalty',
      'reasons',
      'weakTerminalCleanupBonus'
    ], 'hard candidate shape');
    assert(Number.isFinite(Number(candidate.shape.discardShapeScore)), `expected diagnostic shape score, got ${JSON.stringify(candidate.shape)}`);
    assert(typeof candidate.shape.discardTileRole === 'string', `expected diagnostic shape role, got ${JSON.stringify(candidate.shape)}`);
    assert(Array.isArray(candidate.shape.reasons), `expected diagnostic shape reasons, got ${JSON.stringify(candidate.shape)}`);
    ['waits', 'hardContext', 'hand', 'runtime', 'beforeShoupai', 'afterShoupai'].forEach((key) => {
      assert(!Object.prototype.hasOwnProperty.call(candidate.shape, key), `diagnostic shape must not include ${key}: ${JSON.stringify(candidate.shape)}`);
    });
  }

  assertExactKeys(candidate.route, [
    'breaksRyanmenBlock',
    'breaksValueRoute',
    'breaksYakuhaiPair',
    'closedRiichiRouteRisk',
    'cutsFive',
    'cutsRedFive',
    'cutsYakuhai',
    'discardAdjacentToDora',
    'discardIsDora',
    'discardTileRole',
    'keepsDoraCount',
    'keepsFiveCount',
    'keepsYakuhaiCount',
    'reasons'
  ], 'hard candidate route');
  [
    'breaksRyanmenBlock',
    'breaksValueRoute',
    'breaksYakuhaiPair',
    'closedRiichiRouteRisk',
    'cutsFive',
    'cutsRedFive',
    'cutsYakuhai',
    'discardAdjacentToDora',
    'discardIsDora'
  ].forEach((key) => {
    assert(typeof candidate.route[key] === 'boolean', `expected route boolean ${key}, got ${JSON.stringify(candidate.route)}`);
  });
  assert(Number.isFinite(Number(candidate.route.keepsDoraCount)), `expected route dora count, got ${JSON.stringify(candidate.route)}`);
  assert(Number.isFinite(Number(candidate.route.keepsFiveCount)), `expected route five count, got ${JSON.stringify(candidate.route)}`);
  assert(Number.isFinite(Number(candidate.route.keepsYakuhaiCount)), `expected route yakuhai count, got ${JSON.stringify(candidate.route)}`);
  assert(Array.isArray(candidate.route.reasons), `expected route reasons, got ${JSON.stringify(candidate.route)}`);
  ['waits', 'hardContext', 'hand', 'runtime', 'beforeShoupai', 'afterShoupai'].forEach((key) => {
    assert(!Object.prototype.hasOwnProperty.call(candidate.route, key), `diagnostic route must not include ${key}: ${JSON.stringify(candidate.route)}`);
  });
}

function runHardCandidateDiagnosticsDefaultHiddenSmoke(cwd) {
  const baseConfig = loadJson(path.join(cwd, 'test', 'game-config.ai-normal-current-turn-smoke.json'));
  const config = withRightDifficulty(baseConfig, 'hard');
  const runtime = createRuntimeFromConfig(config);

  fastForwardToRightFirstDiscard(runtime);

  const hardDefault = chooseDiscard(runtime, 'right', 'hard');
  const normalOptIn = chooseDiscard(runtime, 'right', 'normal', {
    includeHardCandidateDiagnostics: true
  });
  const easyOptIn = chooseDiscard(runtime, 'right', 'easy', {
    includeHardCandidateDiagnostics: true
  });

  assertNoHardCandidateDiagnostics(hardDefault, 'hard default');
  assertNoHardCandidateDiagnostics(normalOptIn, 'normal opt-in');
  assertNoHardCandidateDiagnostics(easyOptIn, 'easy opt-in');

  return {
    name: 'hard-candidate-diagnostics-default-hidden-smoke',
    snapshot: {
      hardTileCode: hardDefault.tileCode,
      normalTileCode: normalOptIn.tileCode,
      easyTileCode: easyOptIn.tileCode
    }
  };
}

function runHardCandidateDiagnosticsOptInSmoke(cwd) {
  const baseConfig = loadJson(path.join(cwd, 'test', 'game-config.ai-normal-current-turn-smoke.json'));
  const config = withRightDifficulty(baseConfig, 'hard');
  const runtime = createRuntimeFromConfig(config);

  fastForwardToRightFirstDiscard(runtime);

  const decision = chooseDiscard(runtime, 'right', 'hard', {
    includeHardCandidateDiagnostics: true
  });
  const diagnostics = decision && Array.isArray(decision.hardCandidateDiagnostics)
    ? decision.hardCandidateDiagnostics
    : [];
  const initialSelections = diagnostics.filter((candidate) => candidate && candidate.selectedInitial);
  const finalSelections = diagnostics.filter((candidate) => candidate && candidate.selectedFinal);

  assert(decision && decision.type === 'discard', `expected hard diagnostic discard decision, got ${JSON.stringify(decision)}`);
  assert(diagnostics.length > 0, `expected hard candidate diagnostics, got ${JSON.stringify(decision)}`);
  assert(initialSelections.length === 1, `expected exactly one initial selection, got ${JSON.stringify(diagnostics)}`);
  assert(finalSelections.length === 1, `expected exactly one final selection, got ${JSON.stringify(diagnostics)}`);
  assert(
    finalSelections[0].tileCode === decision.tileCode,
    `expected final diagnostic to match decision tile, got ${JSON.stringify({ decision, final: finalSelections[0] })}`
  );
  diagnostics.forEach(assertCompactHardCandidateDiagnostic);

  return {
    name: 'hard-candidate-diagnostics-opt-in-smoke',
    snapshot: {
      tileCode: decision.tileCode,
      candidateCount: diagnostics.length,
      initialTileCode: initialSelections[0].tileCode,
      finalTileCode: finalSelections[0].tileCode,
      sample: diagnostics[0]
    }
  };
}

function prepareNoPressureShapeRuntime(cwd, handString, options = {}) {
  const baseConfig = loadJson(path.join(cwd, 'test', 'game-config.ai-normal-current-turn-smoke.json'));
  const config = withRightDifficulty(baseConfig, 'hard');
  const runtime = createRuntimeFromConfig(config);

  fastForwardToRightFirstDiscard(runtime);
  setDoraIndicators(runtime, Array.isArray(options.doraIndicators) ? options.doraIndicators : ['z7']);
  setSeatHand(runtime, 'right', handString);
  return runtime;
}

function runNoPressureShapeTerminalSmoke(cwd) {
  const handString = 'm149p124s8z1234457';
  const runtimeWithShape = prepareNoPressureShapeRuntime(cwd, handString, {
    doraIndicators: ['z7']
  });
  const runtimeWithoutShape = prepareNoPressureShapeRuntime(cwd, handString, {
    doraIndicators: ['z7']
  });

  const shaped = chooseHardDiscardWithShapeReview(runtimeWithShape, 'right', true, {
    includeHardCandidateDiagnostics: true
  });
  const baseline = chooseHardDiscardWithShapeReview(runtimeWithoutShape, 'right', false, {
    includeHardCandidateDiagnostics: true
  });
  const selected = findHardCandidateDiagnostic(shaped, shaped.tileCode);
  const baselineTile = findHardCandidateDiagnostic(shaped, baseline.tileCode);

  assert(shaped && baseline, `expected shape and baseline decisions, got ${JSON.stringify({ shaped, baseline })}`);
  assert(shaped.pushFoldState && shaped.pushFoldState.pressureScore === 0, `expected no pressure shape review, got ${JSON.stringify(shaped.pushFoldState)}`);
  assert(shaped.tileCode === 's8', `expected shape review to clean up weak s8, got ${JSON.stringify(shaped)}`);
  assert(baseline.tileCode === 'm4', `expected no-shape baseline to cut m4, got ${JSON.stringify(baseline)}`);
  assert(selected && baselineTile, `expected selected and baseline diagnostics, got ${JSON.stringify(shaped.hardCandidateDiagnostics)}`);
  assert(selected.metrics.xiangting === baselineTile.metrics.xiangting, `expected same xiangting shape comparison, got ${JSON.stringify({ selected, baselineTile })}`);
  assert(
    Math.abs(selected.hardMetrics.hardEvScore - baselineTile.hardMetrics.hardEvScore) <= 12,
    `expected near-tie hard EV, got ${JSON.stringify({ selected, baselineTile })}`
  );
  assert(
    selected.shape
      && selected.shape.reasons.includes('shape-weak-floating-cleanup')
      && selected.shape.discardShapeScore > baselineTile.shape.discardShapeScore,
    `expected weak terminal cleanup shape to beat middle cut, got ${JSON.stringify({ selected, baselineTile })}`
  );
  assert(
    baselineTile.shape
      && baselineTile.shape.reasons.includes('shape-middle-tile-cut'),
    `expected baseline m4 diagnostic to show middle cut penalty, got ${JSON.stringify(baselineTile)}`
  );

  return {
    name: 'hard-mortal-no-pressure-shape-terminal-smoke',
    snapshot: {
      shaped: {
        tileCode: shaped.tileCode,
        hardEvScore: selected.hardMetrics.hardEvScore,
        shape: selected.shape
      },
      baseline: {
        tileCode: baseline.tileCode,
        hardEvScore: baselineTile.hardMetrics.hardEvScore,
        shape: baselineTile.shape
      }
    }
  };
}

function runNoPressureShapeTiebreakSmoke(cwd) {
  const handString = 'm9p11123468s29z234';
  const runtimeWithShape = prepareNoPressureShapeRuntime(cwd, handString, {
    doraIndicators: ['z1']
  });
  const runtimeWithoutShape = prepareNoPressureShapeRuntime(cwd, handString, {
    doraIndicators: ['z1']
  });

  const shaped = chooseHardDiscardWithShapeReview(runtimeWithShape, 'right', true, {
    includeHardCandidateDiagnostics: true
  });
  const baseline = chooseHardDiscardWithShapeReview(runtimeWithoutShape, 'right', false, {
    includeHardCandidateDiagnostics: true
  });
  const selected = findHardCandidateDiagnostic(shaped, shaped.tileCode);
  const baselineTile = findHardCandidateDiagnostic(shaped, baseline.tileCode);

  assert(shaped && shaped.tileCode === 'z3', `expected shape tiebreak to choose isolated z3, got ${JSON.stringify(shaped)}`);
  assert(baseline && baseline.tileCode === 'z2', `expected no-shape baseline to choose z2 by old tie-break, got ${JSON.stringify(baseline)}`);
  assert(selected && baselineTile, `expected z3/z2 diagnostics, got ${JSON.stringify(shaped && shaped.hardCandidateDiagnostics)}`);
  assert(selected.metrics.xiangting === baselineTile.metrics.xiangting, `expected same xiangting tiebreak, got ${JSON.stringify({ selected, baselineTile })}`);
  assert(
    selected.hardMetrics.hardEvScore === baselineTile.hardMetrics.hardEvScore,
    `expected exact hard EV tie, got ${JSON.stringify({ selected, baselineTile })}`
  );
  assert(
    selected.shape
      && selected.shape.discardShapeScore > baselineTile.shape.discardShapeScore
      && selected.shape.reasons.includes('shape-isolated-honor-cleanup'),
    `expected shape to prefer isolated honor, got ${JSON.stringify({ selected, baselineTile })}`
  );
  assert(
    baselineTile.shape
      && baselineTile.shape.reasons.includes('shape-dora-cut'),
    `expected no-shape baseline tile to expose dora retention penalty, got ${JSON.stringify(baselineTile)}`
  );

  return {
    name: 'hard-mortal-no-pressure-shape-tiebreak-smoke',
    snapshot: {
      shaped: {
        tileCode: shaped.tileCode,
        hardEvScore: selected.hardMetrics.hardEvScore,
        shape: selected.shape
      },
      baseline: {
        tileCode: baseline.tileCode,
        hardEvScore: baselineTile.hardMetrics.hardEvScore,
        shape: baselineTile.shape
      }
    }
  };
}

function runNoPressureFiveRetentionSmoke(cwd) {
  const handString = 'm1789p15s12z124577';
  const runtimeWithShape = prepareNoPressureShapeRuntime(cwd, handString, {
    doraIndicators: ['z1']
  });
  const runtimeWithoutShape = prepareNoPressureShapeRuntime(cwd, handString, {
    doraIndicators: ['z1']
  });

  const shaped = chooseHardDiscardWithShapeReview(runtimeWithShape, 'right', true, {
    includeHardCandidateDiagnostics: true
  });
  const baseline = chooseHardDiscardWithShapeReview(runtimeWithoutShape, 'right', false, {
    includeHardCandidateDiagnostics: true
  });
  const selected = findHardCandidateDiagnostic(shaped, shaped.tileCode);
  const baselineTile = findHardCandidateDiagnostic(shaped, baseline.tileCode);

  assert(shaped && shaped.tileCode === 'm8', `expected shape review to avoid cutting useful p5, got ${JSON.stringify(shaped)}`);
  assert(baseline && baseline.tileCode === 'p5', `expected no-shape baseline to cut p5, got ${JSON.stringify(baseline)}`);
  assert(selected && baselineTile, `expected m8/p5 diagnostics, got ${JSON.stringify(shaped && shaped.hardCandidateDiagnostics)}`);
  assert(selected.metrics.xiangting === baselineTile.metrics.xiangting, `expected same xiangting five retention, got ${JSON.stringify({ selected, baselineTile })}`);
  assert(
    Math.abs(selected.hardMetrics.hardEvScore - baselineTile.hardMetrics.hardEvScore) <= 12,
    `expected shape to act only on near EV tie, got ${JSON.stringify({ selected, baselineTile })}`
  );
  assert(
    baselineTile.shape
      && baselineTile.shape.fiveOrRedFiveCutPenalty > 0
      && baselineTile.shape.reasons.includes('shape-five-cut'),
    `expected p5 diagnostic to include five cut penalty, got ${JSON.stringify(baselineTile)}`
  );
  assert(
    selected.shape
      && selected.shape.discardShapeScore > baselineTile.shape.discardShapeScore,
    `expected retained five shape score to beat baseline p5 cut, got ${JSON.stringify({ selected, baselineTile })}`
  );

  return {
    name: 'hard-mortal-no-pressure-five-retention-smoke',
    snapshot: {
      shaped: {
        tileCode: shaped.tileCode,
        hardEvScore: selected.hardMetrics.hardEvScore,
        shape: selected.shape
      },
      baseline: {
        tileCode: baseline.tileCode,
        hardEvScore: baselineTile.hardMetrics.hardEvScore,
        shape: baselineTile.shape
      }
    }
  };
}

function runNoPressureExistingEvRegressionSmoke(cwd) {
  const runtime = prepareNoPressureShapeRuntime(cwd, 'm12234p123555s123', {
    doraIndicators: ['z1']
  });
  const topIndex = runtime.getSeatIndex('top');
  runtime.board.he[topIndex]._pai = ['m5', 'm5', 'm5', 'm5'];

  const decision = chooseHardDiscardWithShapeReview(runtime, 'right', true, {
    includeHardCandidateDiagnostics: true
  });
  const selected = findHardCandidateDiagnostic(decision, decision.tileCode);
  const lowerEvTerminal = findHardCandidateDiagnostic(decision, 'm1');

  assert(decision && decision.tileCode === 'm2', `expected clear live-EV m2 to survive shape review, got ${JSON.stringify(decision)}`);
  assert(selected && lowerEvTerminal, `expected m2/m1 diagnostics, got ${JSON.stringify(decision && decision.hardCandidateDiagnostics)}`);
  assert(
    selected.hardMetrics.hardEvScore - lowerEvTerminal.hardMetrics.hardEvScore > 12,
    `expected hard EV lead to exceed shape tie-break window, got ${JSON.stringify({ selected, lowerEvTerminal })}`
  );
  assert(
    selected.hardMetrics.liveTingpaiCount > lowerEvTerminal.hardMetrics.liveTingpaiCount,
    `expected live wait advantage to remain primary, got ${JSON.stringify({ selected, lowerEvTerminal })}`
  );

  return {
    name: 'hard-no-pressure-existing-ev-regression-smoke',
    snapshot: {
      tileCode: decision.tileCode,
      selected: {
        hardEvScore: selected.hardMetrics.hardEvScore,
        liveTingpaiCount: selected.hardMetrics.liveTingpaiCount,
        shape: selected.shape
      },
      lowerEvTerminal: {
        tileCode: lowerEvTerminal.tileCode,
        hardEvScore: lowerEvTerminal.hardMetrics.hardEvScore,
        liveTingpaiCount: lowerEvTerminal.hardMetrics.liveTingpaiCount,
        shape: lowerEvTerminal.shape
      }
    }
  };
}

function runNoPressureNoBackstepSmoke(cwd) {
  const runtime = prepareNoPressureShapeRuntime(cwd, 'm269p45s114789z133', {
    doraIndicators: ['z1']
  });

  const decision = chooseHardDiscardWithShapeReview(runtime, 'right', true, {
    includeHardCandidateDiagnostics: true
  });
  const selected = findHardCandidateDiagnostic(decision, decision.tileCode);
  const highShapeBackstep = findHardCandidateDiagnostic(decision, 's1');

  assert(decision && decision.tileCode !== 's1', `expected no-pressure shape review to reject worse-xiangting s1 backstep, got ${JSON.stringify(decision)}`);
  assert(selected && highShapeBackstep, `expected z1/s1 diagnostics, got ${JSON.stringify(decision && decision.hardCandidateDiagnostics)}`);
  assert(
    highShapeBackstep.metrics.xiangting > selected.metrics.xiangting,
    `expected s9 cleanup to be a worse-xiangting backstep, got ${JSON.stringify({ selected, highShapeBackstep })}`
  );
  assert(
    highShapeBackstep.selectedFinal === false,
    `expected better-shape backstep candidate not to be selected, got ${JSON.stringify(highShapeBackstep)}`
  );

  return {
    name: 'hard-no-pressure-no-backstep-smoke',
    snapshot: {
      tileCode: decision.tileCode,
      selected: {
        tileCode: selected.tileCode,
        xiangting: selected.metrics.xiangting,
        shape: selected.shape
      },
      highShapeBackstep: {
        tileCode: highShapeBackstep.tileCode,
        xiangting: highShapeBackstep.metrics.xiangting,
        shape: highShapeBackstep.shape
      }
    }
  };
}

function runShapeLowXiangtingTerminalSmoke(cwd) {
  const handString = 'm578p67789s456679';
  const runtimeWithShape = prepareNoPressureShapeRuntime(cwd, handString, {
    doraIndicators: ['z7']
  });
  const runtimeWithoutShape = prepareNoPressureShapeRuntime(cwd, handString, {
    doraIndicators: ['z7']
  });

  const shaped = chooseHardDiscardWithShapeReview(runtimeWithShape, 'right', true, {
    includeHardCandidateDiagnostics: true
  });
  const baseline = chooseHardDiscardWithShapeReview(runtimeWithoutShape, 'right', false, {
    includeHardCandidateDiagnostics: true
  });
  const selected = findHardCandidateDiagnostic(shaped, shaped.tileCode);
  const baselineTile = findHardCandidateDiagnostic(shaped, baseline.tileCode);

  assert(shaped && shaped.tileCode === 's9_', `expected low-xiangting shape to clean up s9, got ${JSON.stringify(shaped)}`);
  assert(baseline && baseline.tileCode === 'm5', `expected no-shape low-xiangting baseline to cut m5, got ${JSON.stringify(baseline)}`);
  assert(selected && baselineTile, `expected s9/m5 diagnostics, got ${JSON.stringify(shaped && shaped.hardCandidateDiagnostics)}`);
  assert(selected.metrics.xiangting === 2 && baselineTile.metrics.xiangting === 2, `expected low-xiangting same-shanten shape review, got ${JSON.stringify({ selected, baselineTile })}`);
  assert(
    Math.abs(selected.hardMetrics.hardEvScore - baselineTile.hardMetrics.hardEvScore) <= 12,
    `expected low-xiangting terminal cleanup to be a hard EV near-tie, got ${JSON.stringify({ selected, baselineTile })}`
  );
  assert(
    selected.shape
      && baselineTile.shape
      && selected.shape.discardTileRole === 'terminal-block'
      && selected.shape.discardShapeScore > baselineTile.shape.discardShapeScore,
    `expected terminal cleanup shape to beat m5 cut, got ${JSON.stringify({ selected, baselineTile })}`
  );

  return {
    name: 'hard-shape-low-xiangting-terminal-smoke',
    snapshot: {
      shaped: {
        tileCode: shaped.tileCode,
        xiangting: selected.metrics.xiangting,
        hardEvScore: selected.hardMetrics.hardEvScore,
        shape: selected.shape
      },
      baseline: {
        tileCode: baseline.tileCode,
        xiangting: baselineTile.metrics.xiangting,
        hardEvScore: baselineTile.hardMetrics.hardEvScore,
        shape: baselineTile.shape
      }
    }
  };
}

function runShapeLowXiangtingFiveRetentionSmoke(cwd) {
  const handString = 'm578p67789s456679';
  const runtimeWithShape = prepareNoPressureShapeRuntime(cwd, handString, {
    doraIndicators: ['z7']
  });
  const runtimeWithoutShape = prepareNoPressureShapeRuntime(cwd, handString, {
    doraIndicators: ['z7']
  });

  const shaped = chooseHardDiscardWithShapeReview(runtimeWithShape, 'right', true, {
    includeHardCandidateDiagnostics: true
  });
  const baseline = chooseHardDiscardWithShapeReview(runtimeWithoutShape, 'right', false, {
    includeHardCandidateDiagnostics: true
  });
  const selected = findHardCandidateDiagnostic(shaped, shaped.tileCode);
  const baselineTile = findHardCandidateDiagnostic(shaped, baseline.tileCode);

  assert(shaped && shaped.tileCode !== 'm5', `expected low-xiangting shape to retain m5, got ${JSON.stringify(shaped)}`);
  assert(baseline && baseline.tileCode === 'm5', `expected no-shape baseline to cut m5, got ${JSON.stringify(baseline)}`);
  assert(selected && baselineTile, `expected selected/m5 diagnostics, got ${JSON.stringify(shaped && shaped.hardCandidateDiagnostics)}`);
  assert(selected.metrics.xiangting === baselineTile.metrics.xiangting, `expected same-xiangting five retention, got ${JSON.stringify({ selected, baselineTile })}`);
  assert(
    baselineTile.shape
      && baselineTile.shape.discardTileRole === 'useful-five'
      && baselineTile.shape.fiveOrRedFiveCutPenalty > 0
      && baselineTile.shape.reasons.includes('shape-five-cut'),
    `expected m5 diagnostic to include useful-five penalty, got ${JSON.stringify(baselineTile)}`
  );
  assert(
    selected.shape
      && selected.shape.discardShapeScore > baselineTile.shape.discardShapeScore,
    `expected retained-five shape score to beat m5 cut, got ${JSON.stringify({ selected, baselineTile })}`
  );

  return {
    name: 'hard-shape-low-xiangting-five-retention-smoke',
    snapshot: {
      shaped: {
        tileCode: shaped.tileCode,
        shape: selected.shape
      },
      retainedFiveCandidate: {
        tileCode: baselineTile.tileCode,
        shape: baselineTile.shape
      }
    }
  };
}

function runShapeStrongOverrideSmoke(cwd) {
  const handString = 'm112p14468s1225z56';
  const runtimeWithStrongShape = prepareNoPressureShapeRuntime(cwd, handString, {
    doraIndicators: ['z7']
  });
  const runtimeWithoutStrongShape = prepareNoPressureShapeRuntime(cwd, handString, {
    doraIndicators: ['z7']
  });

  const shaped = chooseHardDiscardWithShapeReview(runtimeWithStrongShape, 'right', true, {
    includeHardCandidateDiagnostics: true
  });
  const strongDisabled = chooseHardDiscardWithShapeReview(runtimeWithoutStrongShape, 'right', true, {
    discardOverrides: {
      shapeStrongOverrideEnabled: false,
      enableNoPressureCleanupGuard: false
    },
    includeHardCandidateDiagnostics: true
  });
  const selected = findHardCandidateDiagnostic(shaped, shaped.tileCode);
  const baselineTile = findHardCandidateDiagnostic(shaped, strongDisabled.tileCode);

  assert(shaped && shaped.tileCode === 'p1', `expected strong shape override to clean up p1, got ${JSON.stringify(shaped)}`);
  assert(strongDisabled && strongDisabled.tileCode === 'z5', `expected strong-disabled baseline to keep hard EV z5, got ${JSON.stringify(strongDisabled)}`);
  assert(selected && baselineTile, `expected p1/z5 diagnostics, got ${JSON.stringify(shaped && shaped.hardCandidateDiagnostics)}`);
  const hardEvLoss = baselineTile.hardMetrics.hardEvScore - selected.hardMetrics.hardEvScore;
  const shapeDelta = selected.shape.discardShapeScore - baselineTile.shape.discardShapeScore;
  assert(selected.metrics.xiangting === 3 && baselineTile.metrics.xiangting === 3, `expected same-xiangting strong shape override, got ${JSON.stringify({ selected, baselineTile })}`);
  assert(hardEvLoss > 12 && hardEvLoss <= 80, `expected strong shape override to cover small hard EV loss, got ${JSON.stringify({ hardEvLoss, selected, baselineTile })}`);
  assert(shapeDelta >= 18, `expected strong shape override to require a large shape delta, got ${JSON.stringify({ shapeDelta, selected, baselineTile })}`);

  return {
    name: 'hard-shape-strong-override-smoke',
    snapshot: {
      shaped: {
        tileCode: shaped.tileCode,
        hardEvScore: selected.hardMetrics.hardEvScore,
        shape: selected.shape
      },
      strongDisabled: {
        tileCode: strongDisabled.tileCode,
        hardEvScore: baselineTile.hardMetrics.hardEvScore,
        shape: baselineTile.shape
      },
      hardEvLoss,
      shapeDelta
    }
  };
}

function runNoPressureCleanupGuardSmoke() {
  const policy = hardPolicyApi.createHardPolicy().discard;
  const pushFoldState = {
    state: 'neutral',
    pressureScore: 0,
    reasons: []
  };
  const valueHonorCut = buildMockShapeRankingDecision({
    tileCode: 'z5',
    tileIndex: 0,
    xiangting: 4,
    hardEvScore: 1172,
    shapeScore: 1,
    shapeRole: 'value-honor',
    shapeReasons: ['shape-value-honor-retention']
  });
  const isolatedHonorCleanup = buildMockShapeRankingDecision({
    tileCode: 'z3',
    tileIndex: 1,
    xiangting: 4,
    hardEvScore: 1157,
    shapeScore: 13,
    shapeRole: 'isolated-honor',
    shapeReasons: ['shape-isolated-honor-cleanup']
  });

  const cleanupWins = discardRankingApi.compareDiscardDecisionWithContext(
    isolatedHonorCleanup,
    valueHonorCut,
    pushFoldState,
    {
      difficulty: 'hard',
      hardDiscardPolicy: policy,
      pushFoldState
    }
  );
  const protectedCutLoses = discardRankingApi.compareDiscardDecisionWithContext(
    valueHonorCut,
    isolatedHonorCleanup,
    pushFoldState,
    {
      difficulty: 'hard',
      hardDiscardPolicy: policy,
      pushFoldState
    }
  );

  assert(cleanupWins === true, `expected no-pressure cleanup guard to prefer isolated honor, got ${JSON.stringify({ cleanupWins })}`);
  assert(protectedCutLoses === false, `expected no-pressure cleanup guard to reject value honor cut, got ${JSON.stringify({ protectedCutLoses })}`);

  return {
    name: 'hard-no-pressure-cleanup-guard-smoke',
    snapshot: {
      cleanupWins,
      protectedCutLoses,
      valueHonorCut: {
        tileCode: valueHonorCut.tileCode,
        xiangting: valueHonorCut.metrics.xiangting,
        hardEvScore: valueHonorCut.hardMetrics.hardEvScore
      },
      isolatedHonorCleanup: {
        tileCode: isolatedHonorCleanup.tileCode,
        xiangting: isolatedHonorCleanup.metrics.xiangting,
        hardEvScore: isolatedHonorCleanup.hardMetrics.hardEvScore
      }
    }
  };
}

function runNoPressureCleanupGuardNonCleanupSkipSmoke() {
  const policy = hardPolicyApi.createHardPolicy().discard;
  const pushFoldState = {
    state: 'neutral',
    pressureScore: 0,
    reasons: []
  };
  const hardEvChoice = buildMockShapeRankingDecision({
    tileCode: 'p4',
    tileIndex: 0,
    xiangting: 1,
    hardEvScore: 285,
    shapeScore: -18,
    shapeRole: 'useful-middle',
    shapeReasons: ['shape-middle-tile-cut', 'shape-pair-break']
  });
  const nonCleanupAlternative = buildMockShapeRankingDecision({
    tileCode: 'm6',
    tileIndex: 1,
    xiangting: 1,
    hardEvScore: 180,
    shapeScore: -7,
    shapeRole: 'useful-middle',
    shapeReasons: ['shape-middle-tile-cut']
  });

  const nonCleanupLoses = discardRankingApi.compareDiscardDecisionWithContext(
    nonCleanupAlternative,
    hardEvChoice,
    pushFoldState,
    {
      difficulty: 'hard',
      hardDiscardPolicy: policy,
      pushFoldState
    }
  );

  assert(nonCleanupLoses === false, `expected cleanup guard not to override non-cleanup EV conflict, got ${JSON.stringify({ nonCleanupLoses })}`);

  return {
    name: 'hard-no-pressure-cleanup-guard-non-cleanup-skip-smoke',
    snapshot: {
      nonCleanupLoses,
      hardEvChoice: {
        tileCode: hardEvChoice.tileCode,
        hardEvScore: hardEvChoice.hardMetrics.hardEvScore
      },
      nonCleanupAlternative: {
        tileCode: nonCleanupAlternative.tileCode,
        hardEvScore: nonCleanupAlternative.hardMetrics.hardEvScore
      }
    }
  };
}

function runNoPressureCleanupGuardEvCapSmoke() {
  const policy = hardPolicyApi.createHardPolicy().discard;
  const pushFoldState = {
    state: 'neutral',
    pressureScore: 0,
    reasons: []
  };
  const highEvValueHonorCut = buildMockShapeRankingDecision({
    tileCode: 'z5',
    tileIndex: 0,
    xiangting: 4,
    hardEvScore: 1172,
    shapeScore: 1,
    shapeRole: 'value-honor',
    shapeReasons: ['shape-value-honor-retention']
  });
  const tooExpensiveCleanup = buildMockShapeRankingDecision({
    tileCode: 'z3',
    tileIndex: 1,
    xiangting: 4,
    hardEvScore: 1040,
    shapeScore: 20,
    shapeRole: 'isolated-honor',
    shapeReasons: ['shape-isolated-honor-cleanup']
  });

  const expensiveCleanupLoses = discardRankingApi.compareDiscardDecisionWithContext(
    tooExpensiveCleanup,
    highEvValueHonorCut,
    pushFoldState,
    {
      difficulty: 'hard',
      hardDiscardPolicy: policy,
      pushFoldState
    }
  );

  assert(expensiveCleanupLoses === false, `expected cleanup guard to respect hard EV cap, got ${JSON.stringify({ expensiveCleanupLoses })}`);

  return {
    name: 'hard-no-pressure-cleanup-guard-ev-cap-smoke',
    snapshot: {
      expensiveCleanupLoses,
      hardEvLoss: highEvValueHonorCut.hardMetrics.hardEvScore - tooExpensiveCleanup.hardMetrics.hardEvScore,
      maxHardEvLoss: policy.cleanupGuardMaxHardEvLoss
    }
  };
}

function attachMockHardShape(decision, shape) {
  Object.defineProperty(decision, '__hardShapeMetrics', {
    value: shape,
    enumerable: false,
    configurable: true
  });
  return decision;
}

function buildMockShapeRankingDecision(input = {}) {
  return attachMockHardShape({
    type: 'discard',
    seatKey: 'right',
    tileCode: input.tileCode,
    tileIndex: Number.isFinite(Number(input.tileIndex)) ? Number(input.tileIndex) : 0,
    shouldRiichi: false,
    difficulty: 'hard',
    policyId: 'hard',
    isDrawDiscard: false,
    danger: {
      tileCode: input.tileCode,
      dangerScore: 0,
      categories: [],
      reasons: [],
      safetyReasons: []
    },
    pushFoldState: {
      state: 'neutral',
      pressureScore: 0,
      reasons: []
    },
    metrics: {
      xiangting: Number.isFinite(Number(input.xiangting)) ? Number(input.xiangting) : 0,
      tingpaiCount: 2,
      ukeireCount: 6,
      handValueEstimate: 30
    },
    hardMetrics: {
      hardEvScore: Number(input.hardEvScore || 0) || 0,
      liveUkeireCount: 6,
      liveTingpaiCount: 6,
      waitQualityScore: 12,
      bestWaitType: 'ryanmen',
      contextualHandValueEstimate: 30
    },
    reasons: ['validate-hard-shape-ranking']
  }, {
    discardShapeScore: Number(input.shapeScore || 0) || 0,
    discardTileRole: input.shapeRole || 'unknown',
    keptUsefulMiddleCount: 0,
    weakTerminalCleanupBonus: 0,
    isolatedHonorCleanupBonus: 0,
    middleTileCutPenalty: 0,
    fiveOrRedFiveCutPenalty: 0,
    doraRetentionPenalty: 0,
    pairOrBlockBreakPenalty: 0,
    reasons: Array.isArray(input.shapeReasons) ? input.shapeReasons.slice() : []
  });
}

function runShapeTenpaiNearTieOnlySmoke() {
  const policy = hardPolicyApi.createHardPolicy().discard;
  const pushFoldState = {
    state: 'neutral',
    pressureScore: 0,
    reasons: []
  };
  const current = buildMockShapeRankingDecision({
    tileCode: 'm5',
    tileIndex: 0,
    xiangting: 0,
    hardEvScore: 120,
    shapeScore: -20,
    shapeRole: 'useful-five'
  });
  const nearTieCleanup = buildMockShapeRankingDecision({
    tileCode: 'm9',
    tileIndex: 1,
    xiangting: 0,
    hardEvScore: 110,
    shapeScore: 10,
    shapeRole: 'isolated-terminal'
  });
  const strongOnlyCleanup = buildMockShapeRankingDecision({
    tileCode: 'p9',
    tileIndex: 2,
    xiangting: 0,
    hardEvScore: 80,
    shapeScore: 10,
    shapeRole: 'isolated-terminal'
  });

  const nearTieWins = discardRankingApi.compareDiscardDecisionWithContext(nearTieCleanup, current, pushFoldState, {
    difficulty: 'hard',
    hardDiscardPolicy: policy,
    pushFoldState
  });
  const strongOnlyLoses = discardRankingApi.compareDiscardDecisionWithContext(strongOnlyCleanup, current, pushFoldState, {
    difficulty: 'hard',
    hardDiscardPolicy: policy,
    pushFoldState
  });

  assert(nearTieWins === true, `expected tenpai near-tie shape to remain active, got ${JSON.stringify({ nearTieWins })}`);
  assert(strongOnlyLoses === false, `expected tenpai strong shape override to stay disabled, got ${JSON.stringify({ strongOnlyLoses })}`);

  return {
    name: 'hard-shape-tenpai-near-tie-only-smoke',
    snapshot: {
      nearTieWins,
      strongOnlyLoses,
      current: {
        tileCode: current.tileCode,
        hardEvScore: current.hardMetrics.hardEvScore
      },
      nearTieCleanup: {
        tileCode: nearTieCleanup.tileCode,
        hardEvScore: nearTieCleanup.hardMetrics.hardEvScore
      },
      strongOnlyCleanup: {
        tileCode: strongOnlyCleanup.tileCode,
        hardEvScore: strongOnlyCleanup.hardMetrics.hardEvScore
      }
    }
  };
}

function runShapeNoBackstepStillSmoke(cwd) {
  const result = runNoPressureNoBackstepSmoke(cwd);
  return {
    name: 'hard-shape-no-backstep-still-smoke',
    snapshot: result.snapshot
  };
}

function runShapeClearEvAdvantageRegressionSmoke(cwd) {
  const runtime = prepareNoPressureShapeRuntime(cwd, 'm12234p123555s123', {
    doraIndicators: ['z1']
  });
  const topIndex = runtime.getSeatIndex('top');
  runtime.board.he[topIndex]._pai = ['m5', 'm5', 'm5', 'm5'];

  const decision = chooseHardDiscardWithShapeReview(runtime, 'right', true, {
    includeHardCandidateDiagnostics: true
  });
  const selected = findHardCandidateDiagnostic(decision, decision.tileCode);
  const lowerEvTerminal = findHardCandidateDiagnostic(decision, 'm1');
  const hardEvLead = selected.hardMetrics.hardEvScore - lowerEvTerminal.hardMetrics.hardEvScore;

  assert(decision && decision.tileCode === 'm2', `expected clear hard EV advantage to remain selected, got ${JSON.stringify(decision)}`);
  assert(selected && lowerEvTerminal, `expected m2/m1 diagnostics, got ${JSON.stringify(decision && decision.hardCandidateDiagnostics)}`);
  assert(hardEvLead > 80, `expected hard EV lead to exceed strong shape override window, got ${JSON.stringify({ hardEvLead, selected, lowerEvTerminal })}`);

  return {
    name: 'hard-shape-clear-ev-advantage-regression-smoke',
    snapshot: {
      tileCode: decision.tileCode,
      hardEvLead,
      selected: {
        hardEvScore: selected.hardMetrics.hardEvScore,
        shape: selected.shape
      },
      lowerEvTerminal: {
        tileCode: lowerEvTerminal.tileCode,
        hardEvScore: lowerEvTerminal.hardMetrics.hardEvScore,
        shape: lowerEvTerminal.shape
      }
    }
  };
}

function runSanmaBoundarySmoke(cwd) {
  const sanmaConfig = loadJson(path.join(cwd, 'game-config.sanma.json'));
  const config = withRightDifficulty(sanmaConfig, 'hard');
  config.ai = {
    ...(config.ai || {}),
    implementedDifficulties: Array.isArray(sanmaConfig.ai && sanmaConfig.ai.implementedDifficulties)
      ? sanmaConfig.ai.implementedDifficulties.slice()
      : [],
    defaultDifficulty: sanmaConfig.ai && typeof sanmaConfig.ai.defaultDifficulty === 'string'
      ? sanmaConfig.ai.defaultDifficulty
      : 'normal'
  };
  const runtime = createRuntimeFromConfig(config);
  const aiController = createAiController(runtime, config);
  const controllerConfig = aiController.getSeatConfig('right');
  const decision = aiController.chooseDiscard('right');

  assert(runtime.rulesetProfile && runtime.rulesetProfile.id === 'riichi-3p-sanma', `expected sanma runtime, got ${JSON.stringify(runtime.rulesetProfile)}`);
  assert(!config.ai.implementedDifficulties.includes('hard'), `expected sanma config not to expose hard, got ${JSON.stringify(config.ai)}`);
  assert(controllerConfig && controllerConfig.difficulty === 'hard', `expected hard sanma seat config, got ${JSON.stringify(controllerConfig)}`);
  assert(controllerConfig.implemented === true, `expected hard to be globally implemented before ruleset guard, got ${JSON.stringify(controllerConfig)}`);
  assert(decision == null, `expected BaseAI hard to stay disabled outside riichi-4p, got ${JSON.stringify(decision)}`);

  return {
    name: 'hard-sanma-boundary-smoke',
    snapshot: {
      ruleset: runtime.rulesetProfile.id,
      sanmaImplementedDifficulties: config.ai.implementedDifficulties,
      controllerImplemented: controllerConfig.implemented,
      decision: decision || null
    }
  };
}

function runVisibleTilesSmoke(cwd) {
  const baseConfig = loadJson(path.join(cwd, 'test', 'game-config.ai-normal-current-turn-smoke.json'));
  const config = withRightDifficulty(baseConfig, 'hard');
  const runtime = createRuntimeFromConfig(config);

  fastForwardToRightFirstDiscard(runtime);
  setDoraIndicators(runtime, ['z1']);

  const topIndex = runtime.getSeatIndex('top');
  const leftIndex = runtime.getSeatIndex('left');
  runtime.board.he[topIndex]._pai = ['m0*', 'm1'];
  runtime.board.shoupai[leftIndex]._fulou = ['s123-'];

  const wallState = runtime.getWallState();
  const doraIndicator = visibleTilesApi.normalizeTileCode(
    (Array.isArray(wallState.doraIndicators) ? wallState.doraIndicators[0] : null)
      || (Array.isArray(wallState.baopai) ? wallState.baopai[0] : null)
  );
  const visible = visibleTilesApi.buildRuntimeVisibleTiles(runtime, 'right');

  assert(visible.countKnown('m5') === 1, `expected red five river to normalize into one visible m5, got ${visible.countKnown('m5')}`);
  assert(visible.countRemaining('m5') === 3, `expected m5 remaining 3, got ${visible.countRemaining('m5')}`);
  assert(visible.sourceCounts.river.m5 === 1, `expected m5 river source 1, got ${visible.sourceCounts.river.m5}`);
  assert(doraIndicator, `expected dora indicator in wall state, got ${JSON.stringify(wallState)}`);
  assert(visible.sourceCounts.dora[doraIndicator] === 1, `expected ${doraIndicator} dora indicator source 1, got ${visible.sourceCounts.dora[doraIndicator]}`);
  assert(visible.countKnown(doraIndicator) >= 1, `expected ${doraIndicator} to be counted as known, got ${visible.countKnown(doraIndicator)}`);
  assert(visible.sourceCounts.meld.s1 === 1, `expected s1 meld source 1, got ${visible.sourceCounts.meld.s1}`);
  assert(visible.sourceCounts.meld.s2 === 1, `expected s2 meld source 1, got ${visible.sourceCounts.meld.s2}`);
  assert(visible.sourceCounts.meld.s3 === 1, `expected s3 meld source 1, got ${visible.sourceCounts.meld.s3}`);
  assert(visible.countKnown('s1') === 3, `expected two own s1 plus meld s1, got ${visible.countKnown('s1')}`);
  assert(visible.countRemaining('s1') === 1, `expected s1 remaining 1, got ${visible.countRemaining('s1')}`);

  return {
    name: 'hard-visible-tiles-smoke',
    snapshot: {
      m5: {
        known: visible.countKnown('m5'),
        remaining: visible.countRemaining('m5'),
        river: visible.sourceCounts.river.m5
      },
      doraIndicator: {
        tileCode: doraIndicator,
        known: visible.countKnown(doraIndicator),
        remaining: visible.countRemaining(doraIndicator),
        dora: visible.sourceCounts.dora[doraIndicator]
      },
      s1: {
        known: visible.countKnown('s1'),
        remaining: visible.countRemaining('s1'),
        hand: visible.sourceCounts.hand.s1,
        meld: visible.sourceCounts.meld.s1
      }
    }
  };
}

function runDefenseGenbutsuSmoke(cwd) {
  const baseConfig = loadJson(path.join(cwd, 'test', 'game-config.ai-normal-defense-priority-smoke.json'));
  const config = withRightDifficulty(baseConfig, 'hard');
  const runtime = createRuntimeFromConfig(config);

  fastForwardToRightFirstDiscard(runtime);
  setDoraIndicators(runtime, ['z1']);
  setRiichiPressure(runtime, 'top', ['m8*']);

  const decision = chooseHardDiscard(runtime, 'right');

  assert(decision && decision.tileCode === 'm8', `expected hard to choose genbutsu m8, got ${JSON.stringify(decision)}`);
  assert(decision.danger && decision.danger.dangerScore === 0, `expected m8 danger 0, got ${JSON.stringify(decision && decision.danger)}`);
  assert(
    decision.danger
      && Array.isArray(decision.danger.categories)
      && decision.danger.categories.includes('genbutsu'),
    `expected genbutsu danger category, got ${JSON.stringify(decision && decision.danger)}`
  );
  assert(decision.pushFoldState && decision.pushFoldState.state === 'careful', `expected careful state, got ${JSON.stringify(decision && decision.pushFoldState)}`);

  return {
    name: 'hard-defense-genbutsu-smoke',
    snapshot: {
      tileCode: decision.tileCode,
      difficulty: decision.difficulty,
      policyId: decision.policyId,
      danger: decision.danger,
      pushFoldState: decision.pushFoldState
    }
  };
}

function runDefenseSujiKabeSmoke(cwd) {
  const baseConfig = loadJson(path.join(cwd, 'test', 'game-config.ai-normal-current-turn-smoke.json'));
  const config = withRightDifficulty(baseConfig, 'hard');
  const runtime = createRuntimeFromConfig(config);

  fastForwardToRightFirstDiscard(runtime);
  setDoraIndicators(runtime, ['z1']);
  setRiichiPressure(runtime, 'top', ['m4*']);

  const bottomIndex = runtime.getSeatIndex('bottom');
  const leftIndex = runtime.getSeatIndex('left');
  runtime.board.he[bottomIndex]._pai = ['p2', 'p2', 'p2', 'p2'];
  runtime.board.he[leftIndex]._pai = ['p4', 'p4', 'p4', 'p4'];

  const sujiDanger = dangerModelApi.evaluateRuntimeHardTileDanger(runtime, 'right', 'm1', { xiangting: 2 }, { difficulty: 'hard' });
  const unknownMiddleDanger = dangerModelApi.evaluateRuntimeHardTileDanger(runtime, 'right', 'm5', { xiangting: 2 }, { difficulty: 'hard' });
  const noChanceDanger = dangerModelApi.evaluateRuntimeHardTileDanger(runtime, 'right', 'p3', { xiangting: 2 }, { difficulty: 'hard' });
  const unknownPinDanger = dangerModelApi.evaluateRuntimeHardTileDanger(runtime, 'right', 'p5', { xiangting: 2 }, { difficulty: 'hard' });

  assert(sujiDanger.dangerScore < unknownMiddleDanger.dangerScore, `expected suji m1 safer than unknown m5, got ${JSON.stringify({ sujiDanger, unknownMiddleDanger })}`);
  assert(
    sujiDanger.categories.includes('suji'),
    `expected suji category, got ${JSON.stringify(sujiDanger)}`
  );
  assert(noChanceDanger.dangerScore < unknownPinDanger.dangerScore, `expected no-chance p3 safer than unknown p5, got ${JSON.stringify({ noChanceDanger, unknownPinDanger })}`);
  assert(
    noChanceDanger.categories.includes('no-chance'),
    `expected no-chance category, got ${JSON.stringify(noChanceDanger)}`
  );

  return {
    name: 'hard-defense-suji-kabe-smoke',
    snapshot: {
      suji: {
        tileCode: sujiDanger.tileCode,
        dangerScore: sujiDanger.dangerScore,
        categories: sujiDanger.categories
      },
      unknownMiddle: {
        tileCode: unknownMiddleDanger.tileCode,
        dangerScore: unknownMiddleDanger.dangerScore,
        categories: unknownMiddleDanger.categories
      },
      noChance: {
        tileCode: noChanceDanger.tileCode,
        dangerScore: noChanceDanger.dangerScore,
        categories: noChanceDanger.categories
      },
      unknownPin: {
        tileCode: unknownPinDanger.tileCode,
        dangerScore: unknownPinDanger.dangerScore,
        categories: unknownPinDanger.categories
      }
    }
  };
}

function buildDefenseTiebreakDecision(input = {}) {
  const dangerScore = Number(input.dangerScore || 0) || 0;
  return {
    type: 'discard',
    seatKey: 'right',
    tileCode: input.tileCode,
    tileIndex: Number.isFinite(Number(input.tileIndex)) ? Number(input.tileIndex) : 0,
    shouldRiichi: false,
    difficulty: 'hard',
    policyId: 'hard',
    metrics: {
      xiangting: Number.isFinite(Number(input.xiangting)) ? Number(input.xiangting) : 99,
      tingpaiCount: Number(input.tingpaiCount || 0) || 0,
      ukeireCount: Number(input.ukeireCount || 0) || 0,
      handValueEstimate: Number(input.handValueEstimate || 0) || 0
    },
    danger: {
      tileCode: input.tileCode,
      dangerScore,
      safetyRank: Number.isFinite(Number(input.safetyRank)) ? Number(input.safetyRank) : dangerScore * 10,
      defenseTileRank: Number.isFinite(Number(input.defenseTileRank)) ? Number(input.defenseTileRank) : dangerScore * 100,
      categories: Array.isArray(input.categories) ? input.categories.slice() : [],
      reasons: Array.isArray(input.dangerReasons) ? input.dangerReasons.slice() : [],
      safetyReasons: Array.isArray(input.safetyReasons) ? input.safetyReasons.slice() : []
    },
    pushFoldState: {
      state: 'careful',
      pressureScore: Number.isFinite(Number(input.pressureScore)) ? Number(input.pressureScore) : 8,
      reasons: ['validate-hard-defense-tiebreak']
    },
    hardMetrics: {
      hardEvScore: Number(input.hardEvScore || 0) || 0,
      liveUkeireCount: Number(input.liveUkeireCount || 0) || 0,
      liveTingpaiCount: Number(input.liveTingpaiCount || 0) || 0,
      waitQualityScore: Number(input.waitQualityScore || 0) || 0,
      bestWaitType: input.bestWaitType || 'unknown',
      contextualHandValueEstimate: Number(input.contextualHandValueEstimate || input.handValueEstimate || 0) || 0
    },
    reasons: ['validate-hard-defense-tiebreak-candidate']
  };
}

function evaluateHardDefenseTiebreak(candidates, current, pressureScore) {
  return hardDefenseTiebreakApi.evaluateHardDefenseTiebreakCandidates(candidates, current, {
    policy: hardPolicyApi.createHardPolicy().defense,
    pushPolicy: hardPolicyApi.createHardPolicy().pushFold,
    pushFoldState: {
      state: 'careful',
      pressureScore,
      reasons: ['validate-hard-defense-tiebreak']
    }
  });
}

function runDefenseSafetyRankSmoke(cwd) {
  const baseConfig = loadJson(path.join(cwd, 'test', 'game-config.ai-normal-current-turn-smoke.json'));
  const config = withRightDifficulty(baseConfig, 'hard');
  const runtime = createRuntimeFromConfig(config);

  fastForwardToRightFirstDiscard(runtime);
  setDoraIndicators(runtime, ['z1']);
  setSeatHand(runtime, 'right', 'm123p123s123z66677');
  setRiichiPressure(runtime, 'top', ['m8*']);
  runtime.board.he[runtime.getSeatIndex('bottom')]._pai = ['p2', 'p2', 'p2', 'p2'];

  const genbutsu = dangerModelApi.evaluateRuntimeHardTileDanger(runtime, 'right', 'm8', { xiangting: 2 }, { difficulty: 'hard' });
  const honorThreeVisible = dangerModelApi.evaluateRuntimeHardTileDanger(runtime, 'right', 'z6', { xiangting: 2 }, { difficulty: 'hard' });
  const oneChance = dangerModelApi.evaluateRuntimeHardTileDanger(runtime, 'right', 'p3', { xiangting: 2 }, { difficulty: 'hard' });
  const unknownMiddle = dangerModelApi.evaluateRuntimeHardTileDanger(runtime, 'right', 's5', { xiangting: 2 }, { difficulty: 'hard' });

  assert(genbutsu.safetyRank < honorThreeVisible.safetyRank, `expected genbutsu to rank safest, got ${JSON.stringify({ genbutsu, honorThreeVisible })}`);
  assert(honorThreeVisible.safetyRank < oneChance.safetyRank, `expected three-visible honor to beat one-chance, got ${JSON.stringify({ honorThreeVisible, oneChance })}`);
  assert(oneChance.safetyRank < unknownMiddle.safetyRank, `expected one-chance to beat unknown middle, got ${JSON.stringify({ oneChance, unknownMiddle })}`);
  assert(Array.isArray(genbutsu.safetyReasons) && genbutsu.safetyReasons.includes('safety-genbutsu'), `expected genbutsu safety reason, got ${JSON.stringify(genbutsu)}`);

  return {
    name: 'hard-defense-safety-rank-smoke',
    snapshot: {
      genbutsu,
      honorThreeVisible,
      oneChance,
      unknownMiddle
    }
  };
}

function runLowDangerSameXiangtingSmoke() {
  const current = buildDefenseTiebreakDecision({
    tileCode: 'm8',
    tileIndex: 0,
    xiangting: 1,
    dangerScore: 1,
    safetyRank: 4,
    defenseTileRank: 42,
    hardEvScore: 234,
    liveTingpaiCount: 8,
    waitQualityScore: 28,
    contextualHandValueEstimate: 34,
    categories: ['riichi-unknown', 'one-chance'],
    safetyReasons: ['safety-one-chance']
  });
  const safer = buildDefenseTiebreakDecision({
    tileCode: 'z6',
    tileIndex: 11,
    xiangting: 1,
    dangerScore: 1,
    safetyRank: 1,
    defenseTileRank: 11,
    hardEvScore: 188,
    liveTingpaiCount: 7,
    waitQualityScore: 19,
    contextualHandValueEstimate: 35,
    categories: ['riichi-unknown', 'honor-three-visible'],
    safetyReasons: ['safety-honor-three-visible']
  });
  const review = evaluateHardDefenseTiebreak([current, safer], current, 8);

  assert(review && review.mode === 'same-xiangting-low-danger', `expected same-xiangting low-danger review, got ${JSON.stringify(review)}`);
  assert(review.selectedTileCode === 'z6', `expected z6 safety pick, got ${JSON.stringify(review)}`);
  assert(review.hardEvLoss === 46, `expected hard EV loss 46, got ${JSON.stringify(review)}`);

  return {
    name: 'hard-low-danger-same-xiangting-smoke',
    snapshot: {
      current: current.tileCode,
      safer: safer.tileCode,
      review
    }
  };
}

function runLowPressureSoftFoldSmoke() {
  const current = buildDefenseTiebreakDecision({
    tileCode: 'p2',
    tileIndex: 2,
    xiangting: 0,
    dangerScore: 1,
    safetyRank: 4,
    defenseTileRank: 42,
    hardEvScore: 213,
    liveTingpaiCount: 7,
    waitQualityScore: 28,
    contextualHandValueEstimate: 24,
    categories: ['riichi-unknown', 'one-chance'],
    safetyReasons: ['safety-one-chance']
  });
  const genbutsu = buildDefenseTiebreakDecision({
    tileCode: 'p1',
    tileIndex: 0,
    xiangting: 1,
    dangerScore: 0,
    safetyRank: 0,
    defenseTileRank: 1,
    hardEvScore: 378,
    liveTingpaiCount: 18,
    waitQualityScore: 39,
    contextualHandValueEstimate: 24,
    categories: ['genbutsu'],
    safetyReasons: ['safety-genbutsu']
  });
  const review = evaluateHardDefenseTiebreak([current, genbutsu], current, 4);

  assert(review && review.mode === 'low-pressure-soft-fold', `expected low-pressure soft fold, got ${JSON.stringify(review)}`);
  assert(review.selectedTileCode === 'p1', `expected p1 genbutsu soft fold, got ${JSON.stringify(review)}`);
  assert(review.xiangtingLoss === 1, `expected one xiangting soft fold, got ${JSON.stringify(review)}`);

  return {
    name: 'hard-low-pressure-soft-fold-smoke',
    snapshot: {
      current: current.tileCode,
      safe: genbutsu.tileCode,
      review
    }
  };
}

function runProtectedPushNotSoftFoldSmoke() {
  const current = buildDefenseTiebreakDecision({
    tileCode: 'm1',
    tileIndex: 0,
    xiangting: 0,
    dangerScore: 1,
    safetyRank: 4,
    defenseTileRank: 42,
    hardEvScore: 213,
    liveTingpaiCount: 3,
    waitQualityScore: 8,
    contextualHandValueEstimate: 42,
    categories: ['riichi-unknown', 'one-chance'],
    safetyReasons: ['safety-one-chance']
  });
  const genbutsu = buildDefenseTiebreakDecision({
    tileCode: 'p1',
    tileIndex: 1,
    xiangting: 1,
    dangerScore: 0,
    safetyRank: 0,
    defenseTileRank: 1,
    hardEvScore: 320,
    liveTingpaiCount: 14,
    waitQualityScore: 30,
    contextualHandValueEstimate: 24,
    categories: ['genbutsu'],
    safetyReasons: ['safety-genbutsu']
  });
  const review = evaluateHardDefenseTiebreak([current, genbutsu], current, 4);

  assert(review && review.mode === 'keep-current', `expected protected push to stay current, got ${JSON.stringify(review)}`);
  assert(review.reasons.includes('hard-defense-tiebreak-protected-push'), `expected protected reason, got ${JSON.stringify(review)}`);

  return {
    name: 'hard-protected-push-not-soft-fold-smoke',
    snapshot: {
      current: current.tileCode,
      safe: genbutsu.tileCode,
      review
    }
  };
}

function runDefenseDiagnosticsSafetySmoke(cwd) {
  const baseConfig = loadJson(path.join(cwd, 'test', 'game-config.ai-normal-defense-priority-smoke.json'));
  const config = withRightDifficulty(baseConfig, 'hard');
  const runtime = createRuntimeFromConfig(config);

  fastForwardToRightFirstDiscard(runtime);
  setDoraIndicators(runtime, ['z1']);
  setRiichiPressure(runtime, 'top', ['m8*']);

  const decision = chooseDiscard(runtime, 'right', 'hard', {
    includeHardCandidateDiagnostics: true
  });
  const diagnostics = decision && Array.isArray(decision.hardCandidateDiagnostics)
    ? decision.hardCandidateDiagnostics
    : [];

  assert(diagnostics.length > 0, `expected hard diagnostics under pressure, got ${JSON.stringify(decision)}`);
  diagnostics.forEach((candidate) => {
    assert(candidate.danger && Number.isFinite(Number(candidate.danger.safetyRank)), `expected safety rank diagnostic, got ${JSON.stringify(candidate)}`);
    assert(Number.isFinite(Number(candidate.danger.defenseTileRank)), `expected defense tile rank diagnostic, got ${JSON.stringify(candidate)}`);
    assert(Array.isArray(candidate.danger.safetyReasons), `expected safety reasons diagnostic, got ${JSON.stringify(candidate)}`);
  });

  return {
    name: 'hard-defense-diagnostics-safety-smoke',
    snapshot: {
      tileCode: decision.tileCode,
      sample: diagnostics[0]
    }
  };
}

function runLiveUkeireDiscardSmoke(cwd) {
  const baseConfig = loadJson(path.join(cwd, 'test', 'game-config.ai-normal-current-turn-smoke.json'));
  const config = withRightDifficulty(baseConfig, 'hard');
  const runtime = createRuntimeFromConfig(config);

  fastForwardToRightFirstDiscard(runtime);
  setDoraIndicators(runtime, ['z1']);
  setSeatHand(runtime, 'right', 'm12234p123555s123');

  const topIndex = runtime.getSeatIndex('top');
  runtime.board.he[topIndex]._pai = ['m5', 'm5', 'm5', 'm5'];

  const blockedRyanmen = evaluateHardDiscardCandidate(runtime, 'right', 'm1');
  const liveRyanmen = evaluateHardDiscardCandidate(runtime, 'right', 'm2');
  const decision = chooseHardDiscard(runtime, 'right');

  assert(blockedRyanmen.xiangting === liveRyanmen.xiangting, `expected same xiangting candidates, got ${JSON.stringify({ blockedRyanmen, liveRyanmen })}`);
  assert(blockedRyanmen.tingpaiCount === liveRyanmen.tingpaiCount, `expected same raw tingpai count, got ${JSON.stringify({ blockedRyanmen, liveRyanmen })}`);
  assert(liveRyanmen.hardMetrics.liveTingpaiCount > blockedRyanmen.hardMetrics.liveTingpaiCount, `expected live waits to favor m2, got ${JSON.stringify({ blockedRyanmen, liveRyanmen })}`);
  assert(liveRyanmen.hardMetrics.hardEvScore > blockedRyanmen.hardMetrics.hardEvScore, `expected hard EV to favor m2, got ${JSON.stringify({ blockedRyanmen, liveRyanmen })}`);
  assert(decision && decision.tileCode === 'm2', `expected hard to discard m2 for live waits, got ${JSON.stringify(decision)}`);
  assert(decision.hardMetrics && decision.hardMetrics.liveTingpaiCount === liveRyanmen.hardMetrics.liveTingpaiCount, `expected decision hard metrics to carry live wait count, got ${JSON.stringify(decision)}`);

  return {
    name: 'hard-live-ukeire-discard-smoke',
    snapshot: {
      tileCode: decision.tileCode,
      blockedRyanmen: {
        tileCode: blockedRyanmen.tileCode,
        tingpai: blockedRyanmen.tingpai,
        liveTingpaiCount: blockedRyanmen.hardMetrics.liveTingpaiCount,
        hardEvScore: blockedRyanmen.hardMetrics.hardEvScore
      },
      liveRyanmen: {
        tileCode: liveRyanmen.tileCode,
        tingpai: liveRyanmen.tingpai,
        liveTingpaiCount: liveRyanmen.hardMetrics.liveTingpaiCount,
        hardEvScore: liveRyanmen.hardMetrics.hardEvScore
      }
    }
  };
}

function runWaitQualitySmoke(cwd) {
  const baseConfig = loadJson(path.join(cwd, 'test', 'game-config.ai-normal-current-turn-smoke.json'));
  const config = withRightDifficulty(baseConfig, 'hard');
  const runtime = createRuntimeFromConfig(config);

  fastForwardToRightFirstDiscard(runtime);
  setDoraIndicators(runtime, ['z1']);
  setSeatHand(runtime, 'right', 'm12234p123555s123');

  const topIndex = runtime.getSeatIndex('top');
  runtime.board.he[topIndex]._pai = ['m5', 'm5', 'm5'];

  const ryanmen = evaluateHardDiscardCandidate(runtime, 'right', 'm1');
  const kanchan = evaluateHardDiscardCandidate(runtime, 'right', 'p5');

  assert(ryanmen.xiangting === 0 && kanchan.xiangting === 0, `expected both candidates to keep tenpai, got ${JSON.stringify({ ryanmen, kanchan })}`);
  assert(ryanmen.hardMetrics.liveTingpaiCount === kanchan.hardMetrics.liveTingpaiCount, `expected equal live wait counts, got ${JSON.stringify({ ryanmen, kanchan })}`);
  assert(ryanmen.hardMetrics.liveUkeireCount === kanchan.hardMetrics.liveUkeireCount, `expected equal live ukeire counts, got ${JSON.stringify({ ryanmen, kanchan })}`);
  assert(ryanmen.hardMetrics.bestWaitType === 'ryanmen', `expected ryanmen best wait, got ${JSON.stringify(ryanmen.hardMetrics)}`);
  assert(kanchan.hardMetrics.bestWaitType === 'kanchan', `expected kanchan best wait, got ${JSON.stringify(kanchan.hardMetrics)}`);
  assert(ryanmen.hardMetrics.waitQualityScore > kanchan.hardMetrics.waitQualityScore, `expected ryanmen quality to beat kanchan, got ${JSON.stringify({ ryanmen, kanchan })}`);
  assert(ryanmen.hardMetrics.hardEvScore > kanchan.hardMetrics.hardEvScore, `expected hard EV to prefer ryanmen at equal live count, got ${JSON.stringify({ ryanmen, kanchan })}`);

  return {
    name: 'hard-wait-quality-smoke',
    snapshot: {
      ryanmen: {
        tileCode: ryanmen.tileCode,
        tingpai: ryanmen.tingpai,
        liveTingpaiCount: ryanmen.hardMetrics.liveTingpaiCount,
        waitQualityScore: ryanmen.hardMetrics.waitQualityScore,
        bestWaitType: ryanmen.hardMetrics.bestWaitType,
        hardEvScore: ryanmen.hardMetrics.hardEvScore
      },
      kanchan: {
        tileCode: kanchan.tileCode,
        tingpai: kanchan.tingpai,
        liveTingpaiCount: kanchan.hardMetrics.liveTingpaiCount,
        waitQualityScore: kanchan.hardMetrics.waitQualityScore,
        bestWaitType: kanchan.hardMetrics.bestWaitType,
        hardEvScore: kanchan.hardMetrics.hardEvScore
      }
    }
  };
}

function runPressureKeepsSafetySmoke(cwd) {
  const baseConfig = loadJson(path.join(cwd, 'test', 'game-config.ai-normal-defense-priority-smoke.json'));
  const config = withRightDifficulty(baseConfig, 'hard');
  const runtime = createRuntimeFromConfig(config);

  fastForwardToRightFirstDiscard(runtime);
  setDoraIndicators(runtime, ['z1']);
  setRiichiPressure(runtime, 'top', ['m8*']);

  const safe = evaluateHardDiscardCandidate(runtime, 'right', 'm8');
  const highEvDanger = evaluateHardDiscardCandidate(runtime, 'right', 's9_');
  const decision = chooseHardDiscard(runtime, 'right');

  assert(highEvDanger.hardMetrics.hardEvScore > safe.hardMetrics.hardEvScore, `expected risky candidate to have higher hard EV, got ${JSON.stringify({ safe, highEvDanger })}`);
  assert(highEvDanger.danger.dangerScore > safe.danger.dangerScore, `expected risky candidate to be more dangerous, got ${JSON.stringify({ safe, highEvDanger })}`);
  assert(decision && decision.tileCode === 'm8', `expected hard pressure to keep genbutsu m8, got ${JSON.stringify(decision)}`);
  assert(decision.danger && decision.danger.dangerScore === 0, `expected safe decision danger 0, got ${JSON.stringify(decision && decision.danger)}`);
  assert(decision.hardMetrics && decision.hardMetrics.hardEvScore < highEvDanger.hardMetrics.hardEvScore, `expected safety to beat higher hard EV under pressure, got ${JSON.stringify({ decision, highEvDanger })}`);

  return {
    name: 'hard-pressure-keeps-safety-smoke',
    snapshot: {
      tileCode: decision.tileCode,
      safe: {
        tileCode: safe.tileCode,
        dangerScore: safe.danger.dangerScore,
        hardEvScore: safe.hardMetrics.hardEvScore
      },
      highEvDanger: {
        tileCode: highEvDanger.tileCode,
        dangerScore: highEvDanger.danger.dangerScore,
        categories: highEvDanger.danger.categories,
        hardEvScore: highEvDanger.hardMetrics.hardEvScore
      }
    }
  };
}

function runMultiRiichiDefenseSmoke(cwd) {
  const baseConfig = loadJson(path.join(cwd, 'test', 'game-config.ai-normal-defense-priority-smoke.json'));
  const config = withRightDifficulty(baseConfig, 'hard');
  const runtime = createRuntimeFromConfig(config);

  fastForwardToRightFirstDiscard(runtime);
  setDoraIndicators(runtime, ['z1']);
  setRiichiPressure(runtime, 'top', ['m8*']);
  setRiichiPressure(runtime, 'left', ['m8*']);

  const safe = evaluateHardDiscardCandidate(runtime, 'right', 'm8');
  const risky = evaluateHardDiscardCandidate(runtime, 'right', 's9_');
  const decision = chooseHardDiscard(runtime, 'right');

  assert(decision && decision.tileCode === 'm8', `expected hard to choose shared genbutsu m8 under multi-riichi, got ${JSON.stringify(decision)}`);
  assert(safe.danger && safe.danger.dangerScore === 0, `expected shared genbutsu danger 0, got ${JSON.stringify(safe)}`);
  assert(risky.danger && risky.danger.dangerScore > safe.danger.dangerScore, `expected risky tile to aggregate danger, got ${JSON.stringify({ safe, risky })}`);
  assert(
    decision.pushFoldState && decision.pushFoldState.pressureScore >= 16,
    `expected multi-riichi pressure score, got ${JSON.stringify(decision && decision.pushFoldState)}`
  );

  return {
    name: 'hard-multi-riichi-defense-smoke',
    snapshot: {
      tileCode: decision.tileCode,
      pushFoldState: decision.pushFoldState,
      safe: {
        tileCode: safe.tileCode,
        dangerScore: safe.danger.dangerScore,
        reasons: safe.danger.reasons
      },
      risky: {
        tileCode: risky.tileCode,
        dangerScore: risky.danger.dangerScore,
        reasons: risky.danger.reasons
      }
    }
  };
}

function runLateLeaderSafetySmoke(cwd) {
  const baseConfig = loadJson(path.join(cwd, 'test', 'game-config.ai-normal-defense-priority-smoke.json'));
  const config = withRightDifficulty(baseConfig, 'hard');
  const runtime = createRuntimeFromConfig(config);

  fastForwardToRightFirstDiscard(runtime);
  setDoraIndicators(runtime, ['z1']);
  setRemainingTiles(runtime, 12);
  setScoreMap(runtime, {
    bottom: 15000,
    right: 45000,
    top: 25000,
    left: 15000
  });
  setRiichiPressure(runtime, 'top', ['m8*']);

  const safe = evaluateHardDiscardCandidate(runtime, 'right', 'm8');
  const highEvDanger = evaluateHardDiscardCandidate(runtime, 'right', 's9_');
  const decision = chooseHardDiscard(runtime, 'right');

  assert(decision && decision.tileCode === 'm8', `expected late leader hard to keep safety, got ${JSON.stringify(decision)}`);
  assert(highEvDanger.hardMetrics.hardEvScore > safe.hardMetrics.hardEvScore, `expected risky tile to still have higher EV, got ${JSON.stringify({ safe, highEvDanger })}`);
  assert(
    decision.hardMetrics
      && decision.hardMetrics.hardContext
      && decision.hardMetrics.hardContext.isLateRound === true
      && decision.hardMetrics.hardContext.defenseValuePenalty > 0,
    `expected late leader defense context, got ${JSON.stringify(decision && decision.hardMetrics)}`
  );

  return {
    name: 'hard-late-leader-safety-smoke',
    snapshot: {
      tileCode: decision.tileCode,
      safe: {
        tileCode: safe.tileCode,
        dangerScore: safe.danger.dangerScore,
        hardEvScore: safe.hardMetrics.hardEvScore
      },
      highEvDanger: {
        tileCode: highEvDanger.tileCode,
        dangerScore: highEvDanger.danger.dangerScore,
        hardEvScore: highEvDanger.hardMetrics.hardEvScore
      },
      hardContext: decision.hardMetrics.hardContext
    }
  };
}

function prepareCrossXiangtingFoldRuntime(cwd, options = {}) {
  const baseConfig = loadJson(path.join(cwd, 'test', 'game-config.ai-normal-current-turn-smoke.json'));
  const config = withRightDifficulty(baseConfig, 'hard');
  const runtime = createRuntimeFromConfig(config);

  fastForwardToRightFirstDiscard(runtime);
  setDoraIndicators(runtime, ['s8']);
  setRemainingTiles(runtime, Number.isFinite(Number(options.remaining)) ? Number(options.remaining) : 12);
  setSeatHand(runtime, 'right', 'm2488p5s3349z11455');
  setRiichiPressure(runtime, 'top', ['m8*']);

  if (options.multiThreat) {
    setRiichiPressure(runtime, 'left', ['m8*']);
  }
  if (options.scores) {
    setScoreMap(runtime, options.scores);
  }

  return runtime;
}

function buildPushFoldDecisionFromCandidate(candidate) {
  return {
    type: 'discard',
    seatKey: 'right',
    tileCode: candidate.tileCode,
    tileIndex: 0,
    shouldRiichi: false,
    difficulty: 'hard',
    policyId: 'hard',
    metrics: candidate.metrics,
    danger: candidate.danger,
    pushFoldState: candidate.pushFoldState,
    hardMetrics: candidate.hardMetrics,
    reasons: ['validate-hard-push-fold-candidate']
  };
}

function runCrossXiangtingFoldSmoke(cwd) {
  const runtime = prepareCrossXiangtingFoldRuntime(cwd);
  const attack = evaluateHardDiscardCandidate(runtime, 'right', 'm2');
  const safe = evaluateHardDiscardCandidate(runtime, 'right', 'm8');
  const decision = chooseHardDiscard(runtime, 'right');

  assert(attack.xiangting < safe.xiangting, `expected attack to preserve xiangting and safe to fold, got ${JSON.stringify({ attack, safe })}`);
  assert(safe.danger && safe.danger.dangerScore === 0, `expected m8 genbutsu, got ${JSON.stringify(safe)}`);
  assert(decision && decision.tileCode === 'm8', `expected hard to cross-xiangting fold to m8, got ${JSON.stringify(decision)}`);
  assert(
    decision.hardPushFold && decision.hardPushFold.mode === 'cross-xiangting-fold',
    `expected cross-xiangting hard push/fold summary, got ${JSON.stringify(decision)}`
  );
  assert(
    decision.hardPushFold.attackTileCode === 'm2' && decision.hardPushFold.safeTileCode === 'm8',
    `expected m2 attack and m8 safe summary, got ${JSON.stringify(decision.hardPushFold)}`
  );

  return {
    name: 'hard-cross-xiangting-fold-smoke',
    snapshot: {
      tileCode: decision.tileCode,
      attack: {
        tileCode: attack.tileCode,
        xiangting: attack.xiangting,
        dangerScore: attack.danger.dangerScore
      },
      safe: {
        tileCode: safe.tileCode,
        xiangting: safe.xiangting,
        dangerScore: safe.danger.dangerScore
      },
      hardPushFold: decision.hardPushFold
    }
  };
}

function runTenpaiGoodWaitPushSmoke(cwd) {
  const baseConfig = loadJson(path.join(cwd, 'test', 'game-config.ai-normal-current-turn-smoke.json'));
  const config = withRightDifficulty(baseConfig, 'hard');
  const runtime = createRuntimeFromConfig(config);

  fastForwardToRightFirstDiscard(runtime);
  setDoraIndicators(runtime, ['z1']);
  setRemainingTiles(runtime, 25);
  setSeatHand(runtime, 'right', 'm12234p123555s123');
  setRiichiPressure(runtime, 'top', ['p1*']);
  setRoundCounts(runtime, {
    changbang: 3,
    lizhibang: 2
  });
  setScoreMap(runtime, {
    bottom: 45000,
    right: 25000,
    top: 25000,
    left: 15000
  });
  runtime.getDealerSeat = function getDealerSeatOverride() {
    return 'right';
  };

  const attack = buildPushFoldDecisionFromCandidate(evaluateHardDiscardCandidate(runtime, 'right', 'm1'));
  const safe = buildPushFoldDecisionFromCandidate(evaluateHardDiscardCandidate(runtime, 'right', 'p1'));
  const review = hardPushFoldApi.evaluateHardPushFoldCandidates([attack, safe], attack, {
    policy: hardPolicyApi.createHardPolicy().pushFold,
    pushFoldState: {
      state: 'careful',
      pressureScore: 12,
      reasons: ['riichi-opponent', 'forced-tenpai-good-wait-push-smoke']
    }
  });

  assert(attack.metrics.xiangting === 0 && safe.metrics.xiangting > attack.metrics.xiangting, `expected tenpai attack vs fold candidate, got ${JSON.stringify({ attack, safe })}`);
  assert(safe.danger && safe.danger.dangerScore === 0, `expected p1 genbutsu safety candidate, got ${JSON.stringify(safe)}`);
  assert(review && review.mode === 'keep-attack', `expected protected tenpai push, got ${JSON.stringify(review)}`);
  assert(review.pushProtected === true, `expected pushProtected true, got ${JSON.stringify(review)}`);
  assert(review.selectedTileCode === 'm1', `expected m1 attack to be selected, got ${JSON.stringify(review)}`);

  return {
    name: 'hard-tenpai-good-wait-push-smoke',
    snapshot: {
      attack: {
        tileCode: attack.tileCode,
        metrics: attack.metrics,
        hardMetrics: attack.hardMetrics
      },
      safe: {
        tileCode: safe.tileCode,
        metrics: safe.metrics,
        danger: safe.danger
      },
      hardPushFold: review
    }
  };
}

function runMultiThreatCrossFoldSmoke(cwd) {
  const runtime = prepareCrossXiangtingFoldRuntime(cwd, {
    remaining: 30,
    multiThreat: true
  });
  const decision = chooseHardDiscard(runtime, 'right');

  assert(decision && decision.tileCode === 'm8', `expected hard to fold to shared genbutsu under multi-threat, got ${JSON.stringify(decision)}`);
  assert(
    decision.hardPushFold
      && decision.hardPushFold.mode === 'cross-xiangting-fold'
      && decision.hardPushFold.pressureScore >= 16,
    `expected multi-threat cross fold summary, got ${JSON.stringify(decision)}`
  );
  assert(
    decision.hardPushFold.reasons.includes('hard-push-fold-multi-threat'),
    `expected multi-threat reason, got ${JSON.stringify(decision.hardPushFold)}`
  );

  return {
    name: 'hard-multi-threat-cross-fold-smoke',
    snapshot: {
      tileCode: decision.tileCode,
      danger: decision.danger,
      hardPushFold: decision.hardPushFold
    }
  };
}

function runDealerValuePushSmoke(cwd) {
  const baseConfig = loadJson(path.join(cwd, 'test', 'game-config.ai-normal-current-turn-smoke.json'));
  const config = withRightDifficulty(baseConfig, 'hard');
  const runtime = createRuntimeFromConfig(config);

  fastForwardToRightFirstDiscard(runtime);
  setDoraIndicators(runtime, ['z1']);
  setRemainingTiles(runtime, 12);
  setSeatHand(runtime, 'right', 'm234556788p4567s1');
  setRiichiPressure(runtime, 'top', ['m3*']);
  setRoundCounts(runtime, {
    changbang: 3,
    lizhibang: 2
  });
  setScoreMap(runtime, {
    bottom: 45000,
    right: 25000,
    top: 25000,
    left: 15000
  });
  runtime.getDealerSeat = function getDealerSeatOverride() {
    return 'right';
  };

  const decision = chooseHardDiscard(runtime, 'right');

  assert(decision && decision.tileCode === 's1_', `expected boosted dealer context to keep s1 attack, got ${JSON.stringify(decision)}`);
  assert(
    decision.hardPushFold
      && decision.hardPushFold.mode === 'keep-attack'
      && decision.hardPushFold.pushProtected === true,
    `expected protected dealer value push, got ${JSON.stringify(decision)}`
  );
  assert(
    decision.hardMetrics
      && decision.hardMetrics.hardContext
      && decision.hardMetrics.hardContext.attackValueBonus >= 20,
    `expected dealer/honba/riichi-stick/trailing attack bonus, got ${JSON.stringify(decision && decision.hardMetrics)}`
  );

  return {
    name: 'hard-dealer-value-push-smoke',
    snapshot: {
      tileCode: decision.tileCode,
      hardPushFold: decision.hardPushFold,
      hardContext: decision.hardMetrics.hardContext
    }
  };
}

function runLeaderLateCrossFoldSmoke(cwd) {
  const runtime = prepareCrossXiangtingFoldRuntime(cwd, {
    remaining: 12,
    scores: {
      bottom: 15000,
      right: 45000,
      top: 25000,
      left: 15000
    }
  });
  const decision = chooseHardDiscard(runtime, 'right');

  assert(decision && decision.tileCode === 'm8', `expected late leader to cross-fold to m8, got ${JSON.stringify(decision)}`);
  assert(
    decision.hardPushFold
      && decision.hardPushFold.mode === 'cross-xiangting-fold'
      && decision.hardPushFold.reasons.includes('hard-push-fold-late-leader'),
    `expected late leader hard push/fold reason, got ${JSON.stringify(decision)}`
  );
  assert(
    decision.hardMetrics
      && decision.hardMetrics.hardContext
      && decision.hardMetrics.hardContext.defenseValuePenalty > 0,
    `expected late leader defense context, got ${JSON.stringify(decision && decision.hardMetrics)}`
  );

  return {
    name: 'hard-leader-late-cross-fold-smoke',
    snapshot: {
      tileCode: decision.tileCode,
      hardPushFold: decision.hardPushFold,
      hardContext: decision.hardMetrics.hardContext
    }
  };
}

function runGoodWaitRiichiSmoke(cwd) {
  const baseConfig = loadJson(path.join(cwd, 'test', 'game-config.ai-normal-current-turn-smoke.json'));
  const config = withRightDifficulty(baseConfig, 'hard');
  const runtime = createRuntimeFromConfig(config);

  fastForwardToRightFirstDiscard(runtime);
  setDoraIndicators(runtime, ['z1']);
  setRemainingTiles(runtime, 30);
  setSeatHand(runtime, 'right', 'm12234p123555s123');

  const decision = chooseHardDiscard(runtime, 'right');

  assert(decision && decision.shouldRiichi === true, `expected hard to riichi on good live wait, got ${JSON.stringify(decision)}`);
  assert(
    decision.riichiDecision
      && Array.isArray(decision.riichiDecision.reasons)
      && decision.riichiDecision.reasons.includes('hard-riichi-context-cleared'),
    `expected hard riichi context reason, got ${JSON.stringify(decision && decision.riichiDecision)}`
  );
  assert(
    decision.riichiDecision
      && decision.riichiDecision.hardRiichiMetrics
      && decision.riichiDecision.hardRiichiMetrics.bestWaitType === 'ryanmen',
    `expected ryanmen hard riichi metrics, got ${JSON.stringify(decision && decision.riichiDecision)}`
  );
  assert(
    decision.riichiDecision.hardRiichiMetrics.liveTingpaiCount >= 3,
    `expected enough live waits, got ${JSON.stringify(decision.riichiDecision.hardRiichiMetrics)}`
  );

  return {
    name: 'hard-good-wait-riichi-smoke',
    snapshot: {
      tileCode: decision.tileCode,
      shouldRiichi: decision.shouldRiichi,
      reasons: decision.riichiDecision.reasons,
      hardRiichiMetrics: decision.riichiDecision.hardRiichiMetrics
    }
  };
}

function runLateBadWaitNoRiichiSmoke(cwd) {
  const baseConfig = loadJson(path.join(cwd, 'test', 'game-config.ai-normal-current-turn-smoke.json'));
  const config = withRightDifficulty(baseConfig, 'hard');
  const runtime = createRuntimeFromConfig(config);

  fastForwardToRightFirstDiscard(runtime);
  setDoraIndicators(runtime, ['z1']);
  setRemainingTiles(runtime, 13);
  setSeatHand(runtime, 'right', 'm12234p123555s123');

  const result = evaluateHardRiichiCandidate(runtime, 'right', 'p5');
  const riichiDecision = result.riichiDecision;

  assert(riichiDecision && riichiDecision.shouldRiichi === false, `expected hard to skip late bad wait riichi, got ${JSON.stringify(result)}`);
  assert(
    Array.isArray(riichiDecision.reasons)
      && riichiDecision.reasons.some((reason) => /^hard-riichi-/.test(reason)),
    `expected hard-specific no-riichi reason, got ${JSON.stringify(riichiDecision)}`
  );
  assert(
    riichiDecision.hardRiichiMetrics
      && riichiDecision.hardRiichiMetrics.bestWaitType === 'kanchan',
    `expected kanchan metrics for rejected bad wait, got ${JSON.stringify(riichiDecision)}`
  );

  return {
    name: 'hard-late-bad-wait-no-riichi-smoke',
    snapshot: {
      tileCode: result.candidate.tileCode,
      shouldRiichi: riichiDecision.shouldRiichi,
      reasons: riichiDecision.reasons,
      hardRiichiMetrics: riichiDecision.hardRiichiMetrics
    }
  };
}

function prepareThinTankiRiichiRuntime(cwd, remainingTiles = 35) {
  const baseConfig = loadJson(path.join(cwd, 'test', 'game-config.ai-normal-current-turn-smoke.json'));
  const config = withRightDifficulty(baseConfig, 'hard');
  const runtime = createRuntimeFromConfig(config);

  fastForwardToRightFirstDiscard(runtime);
  setDoraIndicators(runtime, ['z1']);
  setRemainingTiles(runtime, remainingTiles);
  setSeatHand(runtime, 'right', 'm123789p123s123p45');

  return runtime;
}

function runThinTankiRiichiSmoke(cwd) {
  const runtime = prepareThinTankiRiichiRuntime(cwd, 35);
  const result = evaluateHardRiichiCandidate(runtime, 'right', 'p4');
  const riichiDecision = result.riichiDecision;

  assert(riichiDecision && riichiDecision.shouldRiichi === true, `expected hard to riichi on no-pressure thin tanki, got ${JSON.stringify(result)}`);
  assert(
    Array.isArray(riichiDecision.reasons)
      && riichiDecision.reasons.includes('hard-riichi-no-pressure-thin-wait-exception'),
    `expected thin wait riichi exception reason, got ${JSON.stringify(riichiDecision)}`
  );
  assert(
    riichiDecision.hardRiichiMetrics
      && riichiDecision.hardRiichiMetrics.bestWaitType === 'tanki'
      && riichiDecision.hardRiichiMetrics.liveTingpaiCount === 3
      && riichiDecision.hardRiichiMetrics.waitQualityScore === 3
      && riichiDecision.hardRiichiMetrics.pressureScore === 0,
    `expected thin tanki hard riichi metrics, got ${JSON.stringify(riichiDecision)}`
  );

  return {
    name: 'hard-mortal-thin-tanki-riichi-smoke',
    snapshot: {
      tileCode: result.candidate.tileCode,
      shouldRiichi: riichiDecision.shouldRiichi,
      reasons: riichiDecision.reasons,
      hardRiichiMetrics: riichiDecision.hardRiichiMetrics
    }
  };
}

function runThinTankiLateNoRiichiSmoke(cwd) {
  const runtime = prepareThinTankiRiichiRuntime(cwd, 29);
  const result = evaluateHardRiichiCandidate(runtime, 'right', 'p4');
  const riichiDecision = result.riichiDecision;

  assert(riichiDecision && riichiDecision.shouldRiichi === false, `expected late thin tanki riichi to stay rejected, got ${JSON.stringify(result)}`);
  assert(
    Array.isArray(riichiDecision.reasons)
      && riichiDecision.reasons.includes('hard-riichi-wait-quality-too-low'),
    `expected wait-quality rejection for late thin tanki, got ${JSON.stringify(riichiDecision)}`
  );

  return {
    name: 'hard-thin-tanki-late-no-riichi-smoke',
    snapshot: {
      tileCode: result.candidate.tileCode,
      shouldRiichi: riichiDecision.shouldRiichi,
      reasons: riichiDecision.reasons,
      hardRiichiMetrics: riichiDecision.hardRiichiMetrics
    }
  };
}

function runThinTankiPressureNoRiichiSmoke(cwd) {
  const runtime = prepareThinTankiRiichiRuntime(cwd, 35);
  setRiichiPressure(runtime, 'top', ['m4*']);
  const result = evaluateHardRiichiCandidate(runtime, 'right', 'p4', {
    pushFoldState: {
      state: 'careful',
      pressureScore: 8,
      reasons: ['riichi-opponent', 'forced-thin-tanki-pressure-smoke']
    }
  });
  const riichiDecision = result.riichiDecision;

  assert(riichiDecision && riichiDecision.shouldRiichi === false, `expected pressured thin tanki riichi to stay rejected, got ${JSON.stringify(result)}`);
  assert(
    Array.isArray(riichiDecision.reasons)
      && riichiDecision.reasons.includes('hard-riichi-wait-quality-too-low'),
    `expected wait-quality rejection for pressured thin tanki, got ${JSON.stringify(riichiDecision)}`
  );
  assert(
    riichiDecision.hardRiichiMetrics
      && riichiDecision.hardRiichiMetrics.pushFoldState === 'careful'
      && riichiDecision.hardRiichiMetrics.pressureScore > 0,
    `expected pressure metrics for rejected thin tanki, got ${JSON.stringify(riichiDecision)}`
  );

  return {
    name: 'hard-thin-tanki-pressure-no-riichi-smoke',
    snapshot: {
      tileCode: result.candidate.tileCode,
      shouldRiichi: riichiDecision.shouldRiichi,
      reasons: riichiDecision.reasons,
      hardRiichiMetrics: riichiDecision.hardRiichiMetrics
    }
  };
}

function runThinTankiDangerDiscardNoRiichiSmoke(cwd) {
  const runtime = prepareThinTankiRiichiRuntime(cwd, 35);
  const result = evaluateHardRiichiCandidate(runtime, 'right', 'p4', {
    danger: {
      tileCode: 'p4',
      dangerScore: 1,
      visibleCount: 0,
      reasons: ['forced-thin-tanki-danger-discard']
    }
  });
  const riichiDecision = result.riichiDecision;

  assert(riichiDecision && riichiDecision.shouldRiichi === false, `expected dangerous thin tanki riichi to stay rejected, got ${JSON.stringify(result)}`);
  assert(
    Array.isArray(riichiDecision.reasons)
      && riichiDecision.reasons.includes('hard-riichi-wait-quality-too-low'),
    `expected wait-quality rejection for dangerous thin tanki discard, got ${JSON.stringify(riichiDecision)}`
  );
  assert(
    riichiDecision.hardRiichiMetrics
      && riichiDecision.hardRiichiMetrics.discardDangerScore === 1,
    `expected discard danger metric for rejected thin tanki, got ${JSON.stringify(riichiDecision)}`
  );

  return {
    name: 'hard-thin-tanki-danger-discard-no-riichi-smoke',
    snapshot: {
      tileCode: result.candidate.tileCode,
      shouldRiichi: riichiDecision.shouldRiichi,
      reasons: riichiDecision.reasons,
      hardRiichiMetrics: riichiDecision.hardRiichiMetrics
    }
  };
}

function runPressureNoThinRiichiSmoke(cwd) {
  const baseConfig = loadJson(path.join(cwd, 'test', 'game-config.ai-normal-current-turn-smoke.json'));
  const config = withRightDifficulty(baseConfig, 'hard');
  const runtime = createRuntimeFromConfig(config);

  fastForwardToRightFirstDiscard(runtime);
  setDoraIndicators(runtime, ['z1']);
  setRemainingTiles(runtime, 25);
  setSeatHand(runtime, 'right', 'm12234p123555s123');
  setRiichiPressure(runtime, 'top', ['m4*']);

  const result = evaluateHardRiichiCandidate(runtime, 'right', 'm1', {
    pushFoldState: {
      state: 'careful',
      pressureScore: 8,
      reasons: ['riichi-opponent', 'forced-hard-riichi-pressure-smoke']
    }
  });
  const riichiDecision = result.riichiDecision;

  assert(riichiDecision && riichiDecision.shouldRiichi === false, `expected hard to skip pressured thin riichi, got ${JSON.stringify(result)}`);
  assert(
    Array.isArray(riichiDecision.reasons)
      && (
        riichiDecision.reasons.includes('hard-riichi-pressure-value-too-low')
        || riichiDecision.reasons.includes('hard-riichi-pressure-discard-too-dangerous')
      ),
    `expected hard pressure no-riichi reason, got ${JSON.stringify(riichiDecision)}`
  );
  assert(
    riichiDecision.hardRiichiMetrics
      && riichiDecision.hardRiichiMetrics.pushFoldState === 'careful'
      && riichiDecision.hardRiichiMetrics.pressureScore > 0,
    `expected pressure metrics on rejected riichi, got ${JSON.stringify(riichiDecision)}`
  );

  return {
    name: 'hard-pressure-no-thin-riichi-smoke',
    snapshot: {
      tileCode: result.candidate.tileCode,
      shouldRiichi: riichiDecision.shouldRiichi,
      reasons: riichiDecision.reasons,
      hardRiichiMetrics: riichiDecision.hardRiichiMetrics
    }
  };
}

function preparePressureRiichiRuntime(cwd, options = {}) {
  const baseConfig = loadJson(path.join(cwd, 'test', 'game-config.ai-normal-current-turn-smoke.json'));
  const config = withRightDifficulty(baseConfig, 'hard');
  const runtime = createRuntimeFromConfig(config);

  fastForwardToRightFirstDiscard(runtime);
  setDoraIndicators(runtime, ['z1']);
  setRemainingTiles(runtime, Number.isFinite(Number(options.remaining)) ? Number(options.remaining) : 25);
  setSeatHand(runtime, 'right', 'm12234p123555s123');
  setRiichiPressure(runtime, 'top', ['m4*']);

  if (options.forceRightDealer) {
    runtime.getDealerSeat = function getDealerSeatOverride() {
      return 'right';
    };
  }
  if (options.counts) {
    setRoundCounts(runtime, options.counts);
  }
  if (options.scores) {
    setScoreMap(runtime, options.scores);
  }

  return runtime;
}

function runRoundContextRiichiSmoke(cwd) {
  const forcedPressureState = {
    state: 'careful',
    pressureScore: 8,
    reasons: ['riichi-opponent', 'forced-hard-round-context-smoke']
  };

  const neutralRuntime = preparePressureRiichiRuntime(cwd);
  const neutral = evaluateHardRiichiCandidate(neutralRuntime, 'right', 'm1', {
    pushFoldState: forcedPressureState
  });

  const boostedRuntime = preparePressureRiichiRuntime(cwd, {
    forceRightDealer: true,
    counts: {
      changbang: 1,
      lizhibang: 1
    }
  });
  const boosted = evaluateHardRiichiCandidate(boostedRuntime, 'right', 'm1', {
    pushFoldState: forcedPressureState
  });

  const leadingLateRuntime = preparePressureRiichiRuntime(cwd, {
    forceRightDealer: true,
    remaining: 12,
    counts: {
      changbang: 1,
      lizhibang: 1
    },
    scores: {
      bottom: 15000,
      right: 45000,
      top: 25000,
      left: 15000
    }
  });
  const leadingLate = evaluateHardRiichiCandidate(leadingLateRuntime, 'right', 'm1', {
    pushFoldState: forcedPressureState
  });

  assert(neutral.riichiDecision && neutral.riichiDecision.shouldRiichi === false, `expected neutral pressured hand to skip riichi, got ${JSON.stringify(neutral)}`);
  assert(boosted.riichiDecision && boosted.riichiDecision.shouldRiichi === true, `expected dealer/honba/riichi-stick context to allow pressure riichi, got ${JSON.stringify(boosted)}`);
  assert(
    boosted.riichiDecision.hardRiichiMetrics
      && boosted.riichiDecision.hardRiichiMetrics.hardContext
      && boosted.riichiDecision.hardRiichiMetrics.hardContext.attackValueBonus >= 10,
    `expected boosted attack context, got ${JSON.stringify(boosted && boosted.riichiDecision)}`
  );
  assert(leadingLate.riichiDecision && leadingLate.riichiDecision.shouldRiichi === false, `expected late leading context to reject pressure riichi, got ${JSON.stringify(leadingLate)}`);
  assert(
    leadingLate.riichiDecision.hardRiichiMetrics
      && leadingLate.riichiDecision.hardRiichiMetrics.hardContext
      && leadingLate.riichiDecision.hardRiichiMetrics.hardContext.defenseValuePenalty > 0,
    `expected late leader defense penalty, got ${JSON.stringify(leadingLate && leadingLate.riichiDecision)}`
  );

  return {
    name: 'hard-round-context-riichi-smoke',
    snapshot: {
      neutral: {
        shouldRiichi: neutral.riichiDecision.shouldRiichi,
        reasons: neutral.riichiDecision.reasons,
        hardContext: neutral.riichiDecision.hardRiichiMetrics.hardContext
      },
      boosted: {
        shouldRiichi: boosted.riichiDecision.shouldRiichi,
        reasons: boosted.riichiDecision.reasons,
        hardContext: boosted.riichiDecision.hardRiichiMetrics.hardContext
      },
      leadingLate: {
        shouldRiichi: leadingLate.riichiDecision.shouldRiichi,
        reasons: leadingLate.riichiDecision.reasons,
        hardContext: leadingLate.riichiDecision.hardRiichiMetrics.hardContext
      }
    }
  };
}

function runYakuhaiSpeedCallSmoke(cwd) {
  const baseConfig = loadJson(path.join(cwd, 'test', 'game-config.ai-easy-yakuhai-call-smoke.json'));
  const config = withRightDifficulty(baseConfig, 'hard');
  const evaluation = evaluateRightHardReaction(config, 'z7');
  const decision = evaluation.decision;

  assert(decision && decision.action && decision.action.type === 'call', `expected hard to accept yakuhai peng, got ${JSON.stringify(decision)}`);
  assert(decision.callType === 'peng', `expected hard yakuhai call to be peng, got ${JSON.stringify(decision)}`);
  assert(
    Array.isArray(decision.reasons) && decision.reasons.includes('hard-call-yakuhai-peng'),
    `expected hard yakuhai reason, got ${JSON.stringify(decision)}`
  );
  assert(
    decision.hardCallMetrics && decision.hardCallMetrics.isYakuhaiPeng === true,
    `expected hard call metrics to mark yakuhai, got ${JSON.stringify(decision)}`
  );

  return {
    name: 'hard-yakuhai-speed-call-smoke',
    snapshot: {
      chosenAction: {
        key: decision.action.key,
        callType: decision.callType,
        meldString: decision.action.payload ? decision.action.payload.meldString : null
      },
      reasons: decision.reasons,
      hardCallMetrics: decision.hardCallMetrics
    }
  };
}

function runUnsafeFlatCallSmoke(cwd) {
  const baseConfig = loadJson(path.join(cwd, 'test', 'game-config.ai-normal-call-selectivity-smoke.json'));
  const config = withRightDifficulty(baseConfig, 'hard');
  const evaluation = evaluateRightHardReaction(config, 'm4', {
    riichiPressure: {
      seatKey: 'top',
      riverCodes: ['z1*']
    }
  });

  assert(
    evaluation.rightActions.some((action) => action && action.type === 'call'),
    `expected a flat call candidate under pressure, got ${JSON.stringify(evaluation.rightActions)}`
  );
  assert(evaluation.decision == null, `expected hard to reject unsafe flat call under pressure, got ${JSON.stringify(evaluation.decision)}`);

  return {
    name: 'hard-unsafe-flat-call-smoke',
    snapshot: {
      availableActions: evaluation.rightActions.map((action) => ({
        key: action.key,
        type: action.type,
        callType: action.payload && action.payload.callType ? action.payload.callType : null,
        meldString: action.payload && action.payload.meldString ? action.payload.meldString : null
      })),
      chosenAction: null,
      riichiPressure: true
    }
  };
}

function runHardVsNormalComparisonSmoke(cwd) {
  const discardConfig = withRightDifficulty(loadJson(path.join(cwd, 'test', 'game-config.ai-normal-current-turn-smoke.json')), 'hard');
  const discardRuntime = createRuntimeFromConfig(discardConfig);

  fastForwardToRightFirstDiscard(discardRuntime);
  setDoraIndicators(discardRuntime, ['z1']);
  setSeatHand(discardRuntime, 'right', 'm12234p123555s123');
  discardRuntime.board.he[discardRuntime.getSeatIndex('top')]._pai = ['m5', 'm5', 'm5'];

  const normalDiscard = chooseDiscard(discardRuntime, 'right', 'normal');
  const hardDiscard = chooseDiscard(discardRuntime, 'right', 'hard');

  const pressureRuntime = createRuntimeFromConfig(discardConfig);
  fastForwardToRightFirstDiscard(pressureRuntime);
  setDoraIndicators(pressureRuntime, ['z1']);
  setSeatHand(pressureRuntime, 'right', 'm12234p123555s123');
  setRiichiPressure(pressureRuntime, 'top', ['m4*']);

  const bottomIndex = pressureRuntime.getSeatIndex('bottom');
  const leftIndex = pressureRuntime.getSeatIndex('left');
  pressureRuntime.board.he[bottomIndex]._pai = ['p2', 'p2', 'p2', 'p2'];
  pressureRuntime.board.he[leftIndex]._pai = ['p4', 'p4', 'p4', 'p4'];

  const normalPressure = chooseDiscard(pressureRuntime, 'right', 'normal');
  const hardPressure = chooseDiscard(pressureRuntime, 'right', 'hard');

  const riichiRuntime = createRuntimeFromConfig(discardConfig);
  fastForwardToRightFirstDiscard(riichiRuntime);
  setDoraIndicators(riichiRuntime, ['z1']);
  setRemainingTiles(riichiRuntime, 13);
  setSeatHand(riichiRuntime, 'right', 'm12234p123555s123');

  const normalRiichi = evaluateRiichiCandidate(riichiRuntime, 'right', 'm1', 'normal');
  const hardRiichi = evaluateRiichiCandidate(riichiRuntime, 'right', 'm1', 'hard');

  const callConfig = withRightDifficulty(loadJson(path.join(cwd, 'test', 'game-config.ai-easy-yakuhai-call-smoke.json')), 'hard');
  const normalPressureCall = evaluateRightReaction(callConfig, 'z7', 'normal', {
    riichiPressure: {
      seatKey: 'top',
      riverCodes: ['z1*']
    }
  });
  const hardPressureCall = evaluateRightReaction(callConfig, 'z7', 'hard', {
    riichiPressure: {
      seatKey: 'top',
      riverCodes: ['z1*']
    }
  });

  assert(normalDiscard && hardDiscard && normalDiscard.tileCode === 'm1' && hardDiscard.tileCode === 'm2', `expected hard live-EV discard to differ from normal, got ${JSON.stringify({ normalDiscard, hardDiscard })}`);
  assert(
    hardDiscard.hardMetrics
      && hardDiscard.hardMetrics.liveTingpaiCount >= normalDiscard.metrics.tingpaiCount,
    `expected hard discard to expose live wait metrics, got ${JSON.stringify({ normalDiscard, hardDiscard })}`
  );
  assert(
    normalPressure && hardPressure
      && hardPressure.danger
      && normalPressure.danger
      && hardPressure.danger.dangerScore <= normalPressure.danger.dangerScore,
    `expected hard pressure decision to be no more dangerous than normal, got ${JSON.stringify({ normalPressure, hardPressure })}`
  );
  assert(
    hardPressure.danger.categories && hardPressure.danger.categories.length > 0,
    `expected hard pressure decision to include richer danger categories, got ${JSON.stringify(hardPressure)}`
  );
  assert(
    normalRiichi.riichiDecision
      && normalRiichi.riichiDecision.shouldRiichi === false
      && hardRiichi.riichiDecision
      && hardRiichi.riichiDecision.shouldRiichi === true,
    `expected hard riichi context to differ from normal late threshold, got ${JSON.stringify({ normalRiichi, hardRiichi })}`
  );
  assert(
    normalPressureCall.decision
      && normalPressureCall.decision.callType === 'peng'
      && hardPressureCall.decision == null,
    `expected hard to reject pressured low-value yakuhai call that normal accepts, got ${JSON.stringify({ normalPressureCall, hardPressureCall })}`
  );

  return {
    name: 'hard-vs-normal-comparison-smoke',
    snapshot: {
      noPressureDiscard: {
        normal: {
          tileCode: normalDiscard.tileCode,
          metrics: normalDiscard.metrics
        },
        hard: {
          tileCode: hardDiscard.tileCode,
          hardMetrics: hardDiscard.hardMetrics
        }
      },
      pressureDiscard: {
        normal: {
          tileCode: normalPressure.tileCode,
          danger: normalPressure.danger
        },
        hard: {
          tileCode: hardPressure.tileCode,
          danger: hardPressure.danger
        }
      },
      riichi: {
        normal: {
          tileCode: normalRiichi.candidate.tileCode,
          shouldRiichi: normalRiichi.riichiDecision.shouldRiichi,
          reasons: normalRiichi.riichiDecision.reasons
        },
        hard: {
          tileCode: hardRiichi.candidate.tileCode,
          shouldRiichi: hardRiichi.riichiDecision.shouldRiichi,
          reasons: hardRiichi.riichiDecision.reasons,
          hardRiichiMetrics: hardRiichi.riichiDecision.hardRiichiMetrics
        }
      },
      pressureCall: {
        normal: normalPressureCall.decision ? {
          callType: normalPressureCall.decision.callType,
          reasons: normalPressureCall.decision.reasons
        } : null,
        hard: hardPressureCall.decision ? {
          callType: hardPressureCall.decision.callType,
          reasons: hardPressureCall.decision.reasons,
          hardCallMetrics: hardPressureCall.decision.hardCallMetrics || null
        } : null
      }
    }
  };
}

function createClosedRouteValuePolicy(routeOverrides = {}, policyId = 'hard-experimental') {
  const policy = hardPolicyApi.createHardPolicy();
  policy.id = policyId;
  policy.route = {
    ...(policy.route || {}),
    enableClosedRouteValueRebalance: true,
    ...routeOverrides
  };
  return policy;
}

function createClosedRouteValueRuntime(remaining = 34) {
  return {
    getWallState() {
      return {
        remaining,
        liveWallRemaining: remaining
      };
    },
    getSeatIndex() {
      return 0;
    },
    topology: {
      activeSeats: ['bottom', 'right', 'top', 'left']
    },
    riichiState: {
      bottom: { declared: false },
      right: { declared: false },
      top: { declared: false },
      left: { declared: false }
    }
  };
}

function evaluateClosedRouteValueFixture(overrides = {}) {
  const currentMetrics = {
    xiangting: 1,
    tingpaiCount: 0,
    ukeireCount: 20,
    handValueEstimate: 32,
    ...(overrides.currentMetrics || {})
  };
  const nextMetrics = {
    xiangting: 1,
    tingpaiCount: 0,
    ukeireCount: 20,
    handValueEstimate: 8,
    ...(overrides.nextMetrics || {})
  };
  const hardCallMetrics = {
    riichiPressure: 0,
    isYakuhaiPeng: false,
    closedHandBefore: true,
    currentLiveUkeireCount: 20,
    nextLiveUkeireCount: 20,
    liveUkeireDelta: 0,
    currentLiveTingpaiCount: 5,
    nextLiveTingpaiCount: 5,
    liveTingpaiDelta: 0,
    currentWaitQualityScore: 12,
    nextWaitQualityScore: 8,
    waitQualityDelta: -4,
    currentHardEvScore: 120,
    nextHardEvScore: 120,
    hardEvDelta: 0,
    currentContextualHandValueEstimate: 40,
    nextContextualHandValueEstimate: 8,
    contextualHandValueDelta: -32,
    ...(overrides.hardCallMetrics || {})
  };
  const action = overrides.action || {
    type: 'call',
    payload: {
      callType: 'chi',
      tileCode: 'm3',
      meldString: 'm123-'
    }
  };
  return callEvaluatorApi.evaluateClosedRouteValueReview(
    createClosedRouteValueRuntime(overrides.remaining || 34),
    'right',
    currentMetrics,
    nextMetrics,
    action,
    createClosedRouteValuePolicy(overrides.route || {}, overrides.policyId || 'hard-experimental'),
    hardCallMetrics
  );
}

function runClosedRouteValuePassOverrideSmoke() {
  const review = evaluateClosedRouteValueFixture();
  assert(review.enabled === true, `expected route rebalance enabled, got ${JSON.stringify(review)}`);
  assert(review.active === true, `expected active route review, got ${JSON.stringify(review)}`);
  assert(review.override === true && review.allowed === false, `expected pass override, got ${JSON.stringify(review)}`);
  assert(review.reason === 'hard-call-closed-route-value-pass', `unexpected reason: ${review.reason}`);
  assert(review.margin >= review.minMargin, `expected margin to exceed threshold, got ${JSON.stringify(review)}`);
  return {
    name: 'hard-closed-route-value-pass-override-smoke',
    snapshot: {
      reason: review.reason,
      margin: review.margin,
      callOpenRouteScore: review.callOpenRouteScore,
      passClosedRouteScore: review.passClosedRouteScore
    }
  };
}

function runClosedRouteDirectTenpaiAllowSmoke() {
  const review = evaluateClosedRouteValueFixture({
    nextMetrics: {
      xiangting: 0,
      tingpaiCount: 6,
      ukeireCount: 18,
      handValueEstimate: 24
    },
    hardCallMetrics: {
      nextLiveTingpaiCount: 6,
      liveTingpaiDelta: 1,
      nextContextualHandValueEstimate: 24
    }
  });
  assert(review.directTenpai === true, `expected direct tenpai call, got ${JSON.stringify(review)}`);
  assert(review.override === false && review.allowed === true, `expected direct tenpai to remain allowed, got ${JSON.stringify(review)}`);
  assert(review.reason === 'hard-call-closed-route-direct-tenpai-allowed', `unexpected reason: ${review.reason}`);
  return {
    name: 'hard-closed-route-direct-tenpai-allow-smoke',
    snapshot: {
      reason: review.reason,
      directTenpai: review.directTenpai,
      margin: review.margin
    }
  };
}

function runClosedRoutePressureRegressionSmoke() {
  const review = evaluateClosedRouteValueFixture({
    hardCallMetrics: {
      riichiPressure: 1
    }
  });
  assert(review.override === false && review.allowed === true, `expected pressure to disable route override, got ${JSON.stringify(review)}`);
  assert(review.reason === 'hard-call-closed-route-pressure-present', `unexpected reason: ${review.reason}`);
  return {
    name: 'hard-closed-route-pressure-regression-smoke',
    snapshot: {
      reason: review.reason,
      riichiPressure: review.riichiPressure,
      margin: review.margin
    }
  };
}

function runClosedRouteOpenHandRegressionSmoke() {
  const review = evaluateClosedRouteValueFixture({
    hardCallMetrics: {
      closedHandBefore: false
    }
  });
  assert(review.override === false && review.allowed === true, `expected open hand to disable route override, got ${JSON.stringify(review)}`);
  assert(review.reason === 'hard-call-closed-route-open-hand', `unexpected reason: ${review.reason}`);
  return {
    name: 'hard-closed-route-open-hand-regression-smoke',
    snapshot: {
      reason: review.reason,
      closedHandBefore: review.closedHandBefore,
      margin: review.margin
    }
  };
}

function runClosedRouteHighValueCallAllowSmoke() {
  const review = evaluateClosedRouteValueFixture({
    action: {
      type: 'call',
      payload: {
        callType: 'peng',
        tileCode: 'z5',
        meldString: 'z555='
      }
    },
    nextMetrics: {
      handValueEstimate: 260
    },
    hardCallMetrics: {
      isYakuhaiPeng: true,
      liveUkeireDelta: 18,
      liveTingpaiDelta: 4,
      hardEvDelta: 900,
      nextContextualHandValueEstimate: 260
    }
  });
  assert(review.active === true, `expected active route review, got ${JSON.stringify(review)}`);
  assert(review.override === false && review.allowed === true, `expected high-value open route to remain allowed, got ${JSON.stringify(review)}`);
  assert(review.reason === 'hard-call-closed-route-value-call', `unexpected reason: ${review.reason}`);
  assert(review.callOpenRouteScore > review.passClosedRouteScore, `expected open route score to win, got ${JSON.stringify(review)}`);
  return {
    name: 'hard-closed-route-high-value-call-allow-smoke',
    snapshot: {
      reason: review.reason,
      callOpenRouteScore: review.callOpenRouteScore,
      passClosedRouteScore: review.passClosedRouteScore,
      margin: review.margin
    }
  };
}

function runClosedRouteBalancedPolicySmoke() {
  const review = evaluateClosedRouteValueFixture({
    policyId: 'hard-balanced',
    route: {
      enableBalancedRouteState: true,
      closedRouteMaxXiangting: 2,
      closedRouteOverrideMinMargin: 95,
      balancedValueOverrideMinMargin: 85,
      balancedNeutralOverrideMinMargin: 135,
      balancedLowValueMax: 30,
      balancedValueMinContextualHandValue: 30
    }
  });
  assert(review.enabled === true, `expected balanced policy to enable route review, got ${JSON.stringify(review)}`);
  assert(review.active === true, `expected balanced policy route review to be active, got ${JSON.stringify(review)}`);
  assert(review.override === true, `expected balanced policy to override this high-margin fixture, got ${JSON.stringify(review)}`);
  assert(review.minMargin === 95, `expected promoted balanced base margin threshold, got ${JSON.stringify(review)}`);
  assert(review.balancedState === 'value', `expected promoted balanced value state, got ${JSON.stringify(review)}`);
  assert(review.effectiveMinMargin === 85, `expected promoted balanced value margin, got ${JSON.stringify(review)}`);
  return {
    name: 'hard-closed-route-balanced-policy-smoke',
    snapshot: {
      reason: review.reason,
      minMargin: review.minMargin,
      balancedState: review.balancedState,
      effectiveMinMargin: review.effectiveMinMargin,
      margin: review.margin
    }
  };
}

function runClosedRouteBalancedValueOverrideSmoke() {
  const review = evaluateClosedRouteValueFixture({
    policyId: 'hard-balanced',
    route: {
      enableBalancedRouteState: true,
      closedRouteMaxXiangting: 2,
      closedRouteOverrideMinMargin: 150,
      balancedValueOverrideMinMargin: 150,
      balancedNeutralOverrideMinMargin: 180
    },
    currentMetrics: {
      xiangting: 2
    },
    nextMetrics: {
      xiangting: 2
    },
    hardCallMetrics: {
      currentContextualHandValueEstimate: 72
    }
  });
  assert(review.enabled === true, `expected balanced route review enabled, got ${JSON.stringify(review)}`);
  assert(review.active === true, `expected balanced value route review active, got ${JSON.stringify(review)}`);
  assert(review.balancedState === 'value', `expected balanced value state, got ${JSON.stringify(review)}`);
  assert(review.effectiveMinMargin === 150, `expected value effective margin, got ${JSON.stringify(review)}`);
  assert(review.override === true && review.allowed === false, `expected balanced value state to override this fixture, got ${JSON.stringify(review)}`);
  return {
    name: 'hard-closed-route-balanced-value-smoke',
    snapshot: {
      reason: review.reason,
      balancedState: review.balancedState,
      effectiveMinMargin: review.effectiveMinMargin,
      margin: review.margin
    }
  };
}

function runClosedRouteBalancedDirectTenpaiSmoke() {
  const review = evaluateClosedRouteValueFixture({
    policyId: 'hard-balanced',
    route: {
      enableBalancedRouteState: true,
      closedRouteMaxXiangting: 2
    },
    nextMetrics: {
      xiangting: 0,
      tingpaiCount: 6,
      ukeireCount: 18,
      handValueEstimate: 24
    },
    hardCallMetrics: {
      nextLiveTingpaiCount: 6,
      liveTingpaiDelta: 1,
      nextContextualHandValueEstimate: 24
    }
  });
  assert(review.balancedState === 'tenpai-speed', `expected balanced tenpai-speed state, got ${JSON.stringify(review)}`);
  assert(review.override === false && review.allowed === true, `expected balanced direct tenpai call to remain allowed, got ${JSON.stringify(review)}`);
  assert(review.reason === 'hard-call-closed-route-direct-tenpai-allowed', `unexpected reason: ${review.reason}`);
  return {
    name: 'hard-closed-route-balanced-direct-tenpai-smoke',
    snapshot: {
      reason: review.reason,
      balancedState: review.balancedState,
      directTenpai: review.directTenpai
    }
  };
}

function runClosedRouteBalancedPressureSmoke() {
  const review = evaluateClosedRouteValueFixture({
    policyId: 'hard-balanced',
    route: {
      enableBalancedRouteState: true,
      closedRouteMaxXiangting: 2
    },
    hardCallMetrics: {
      riichiPressure: 1
    }
  });
  assert(review.balancedState === 'defense', `expected balanced defense state under pressure, got ${JSON.stringify(review)}`);
  assert(review.override === false && review.allowed === true, `expected pressure to keep call/pass decision unoverridden, got ${JSON.stringify(review)}`);
  assert(review.reason === 'hard-call-closed-route-pressure-present', `unexpected reason: ${review.reason}`);
  return {
    name: 'hard-closed-route-balanced-pressure-smoke',
    snapshot: {
      reason: review.reason,
      balancedState: review.balancedState,
      riichiPressure: review.riichiPressure
    }
  };
}

function createDefensiveProfileFixtureRuntime(options = {}) {
  const activeSeats = ['bottom', 'right', 'top', 'left'];
  const riichiSeats = new Set(options.riichiSeats || ['top']);
  const dealerSeat = options.dealerSeat || 'top';
  const fulouBySeat = options.fulouBySeat || {};
  return {
    topology: {
      activeSeats
    },
    riichiState: activeSeats.reduce((result, seatKey) => {
      result[seatKey] = { declared: riichiSeats.has(seatKey) };
      return result;
    }, {}),
    getDealerSeat() {
      return dealerSeat;
    },
    getSeatIndex(seatKey) {
      return activeSeats.indexOf(seatKey);
    },
    getWallState() {
      return {
        remaining: Number.isFinite(Number(options.remaining)) ? Number(options.remaining) : 14,
        doraIndicators: options.doraIndicators || ['m4']
      };
    },
    board: {
      shoupai: activeSeats.map((seatKey) => ({
        _fulou: (fulouBySeat[seatKey] || []).slice()
      })),
      shan: {
        baopai: options.doraIndicators || ['m4']
      }
    }
  };
}

function createPushFoldDecision(overrides = {}) {
  return {
    tileCode: overrides.tileCode || 'm5',
    tileIndex: Number.isFinite(Number(overrides.tileIndex)) ? Number(overrides.tileIndex) : 0,
    danger: {
      dangerScore: Number.isFinite(Number(overrides.dangerScore)) ? Number(overrides.dangerScore) : 8,
      categories: Array.isArray(overrides.categories) ? overrides.categories.slice() : [],
      safetyRank: Number.isFinite(Number(overrides.safetyRank)) ? Number(overrides.safetyRank) : 9,
      defenseTileRank: Number.isFinite(Number(overrides.defenseTileRank)) ? Number(overrides.defenseTileRank) : 94,
      safetyReasons: Array.isArray(overrides.safetyReasons) ? overrides.safetyReasons.slice() : []
    },
    metrics: {
      xiangting: Number.isFinite(Number(overrides.xiangting)) ? Number(overrides.xiangting) : 1,
      handValueEstimate: Number.isFinite(Number(overrides.handValue)) ? Number(overrides.handValue) : 28
    },
    hardMetrics: {
      hardEvScore: Number.isFinite(Number(overrides.hardEvScore)) ? Number(overrides.hardEvScore) : 100,
      contextualHandValueEstimate: Number.isFinite(Number(overrides.handValue)) ? Number(overrides.handValue) : 28,
      liveTingpaiCount: Number.isFinite(Number(overrides.liveTingpaiCount)) ? Number(overrides.liveTingpaiCount) : 0,
      waitQualityScore: Number.isFinite(Number(overrides.waitQualityScore)) ? Number(overrides.waitQualityScore) : 0,
      hardContext: overrides.hardContext || {}
    }
  };
}

function createDefensiveDevPolicyPatch(overrides = {}) {
  return {
    enableThreatScoreReview: true,
    enableRankAwarePushFold: true,
    enableDealInAttribution: true,
    enableDefensiveUtilityShadow: true,
    enableSafetyGateRerank: true,
    enableSafetyGateDiagnostics: true,
    highThreatScore: 11,
    expectedDealInCostWeight: 0.16,
    safetyGateMinThreatScore: 11,
    safetyGateProtectScore: 8,
    safetyGateMaxXiangtingLoss: 1,
    safetyGateMinDangerDelta: 2,
    safetyGateMinSafetyRankDelta: 2,
    safetyGateMinExpectedCostDelta: 80,
    safetyGateBackstepMinThreatScore: 14,
    safetyGateBackstepMinExpectedCostDelta: 140,
    safetyGateProtectedTenpaiMinHandValue: 42,
    safetyGateProtectedTenpaiMinWaitQuality: 12,
    protectLeadScore: 5000,
    comebackTrailingScore: 7000,
    ...overrides
  };
}

function runDefensiveSafetyGateStableOffSmoke() {
  const runtime = createDefensiveProfileFixtureRuntime({
    dealerSeat: 'top',
    riichiSeats: ['top'],
    remaining: 12
  });
  const attack = createPushFoldDecision({
    tileCode: 'm5',
    dangerScore: 8,
    safetyRank: 9,
    defenseTileRank: 94,
    xiangting: 1
  });
  const safe = createPushFoldDecision({
    tileCode: 'z1',
    dangerScore: 0,
    safetyRank: 0,
    defenseTileRank: 2,
    safetyReasons: ['safety-genbutsu'],
    xiangting: 1,
    tileIndex: 1
  });
  const review = hardPushFoldApi.evaluateSafetyGateRerank([attack, safe], attack, {
    runtime,
    seatKey: 'right',
    defensiveProfilePolicy: createDefensiveDevPolicyPatch({ enableSafetyGateRerank: false })
  });
  assert(review == null, `expected stable/off safety gate to stay disabled, got ${JSON.stringify(review)}`);
  return {
    name: 'hard-defensive-dev-safety-gate-stable-off-smoke',
    snapshot: {
      enabled: false
    }
  };
}

function runDefensiveSafetyGateSameShantenSmoke() {
  const runtime = createDefensiveProfileFixtureRuntime({
    dealerSeat: 'top',
    riichiSeats: ['top'],
    remaining: 12
  });
  const attack = createPushFoldDecision({
    tileCode: 'm5',
    dangerScore: 8,
    safetyRank: 9,
    defenseTileRank: 94,
    xiangting: 1,
    handValue: 24,
    hardEvScore: 140
  });
  const safe = createPushFoldDecision({
    tileCode: 'z1',
    dangerScore: 0,
    safetyRank: 0,
    defenseTileRank: 2,
    safetyReasons: ['safety-genbutsu'],
    xiangting: 1,
    handValue: 20,
    hardEvScore: 90,
    tileIndex: 1
  });
  const review = hardPushFoldApi.evaluateSafetyGateRerank([attack, safe], attack, {
    runtime,
    seatKey: 'right',
    defensiveProfilePolicy: createDefensiveDevPolicyPatch()
  });
  assert(review && review.enabled === true && review.active === true, `expected active safety gate, got ${JSON.stringify(review)}`);
  assert(review.override === true, `expected safety gate override, got ${JSON.stringify(review)}`);
  assert(review.selectedTileCode === 'z1', `expected safer same-shanten tile, got ${JSON.stringify(review)}`);
  assert(review.sameShanten === true && review.backstep === false, `expected same-shanten safety swap, got ${JSON.stringify(review)}`);
  assert(review.reasons.includes('def-safety-gate-same-shanten'), `expected same-shanten reason, got ${JSON.stringify(review)}`);
  return {
    name: 'hard-defensive-dev-safety-gate-same-shanten-smoke',
    snapshot: {
      selectedTileCode: review.selectedTileCode,
      sameShanten: review.sameShanten,
      reasons: review.reasons
    }
  };
}

function runDefensiveSafetyGateRankProtectBackstepSmoke() {
  const runtime = createDefensiveProfileFixtureRuntime({
    dealerSeat: 'top',
    riichiSeats: ['top'],
    remaining: 8
  });
  const attack = createPushFoldDecision({
    tileCode: 'm5',
    dangerScore: 7,
    safetyRank: 8,
    defenseTileRank: 88,
    xiangting: 1,
    handValue: 18,
    hardEvScore: 100,
    hardContext: {
      scoreRank: 1,
      leadOverSecond: 9000,
      isLateRound: true
    }
  });
  const safe = createPushFoldDecision({
    tileCode: 'z1',
    dangerScore: 0,
    safetyRank: 0,
    defenseTileRank: 2,
    safetyReasons: ['safety-genbutsu'],
    xiangting: 2,
    handValue: 5,
    hardEvScore: 10,
    tileIndex: 1,
    hardContext: attack.hardMetrics.hardContext
  });
  const review = hardPushFoldApi.evaluateSafetyGateRerank([attack, safe], attack, {
    runtime,
    seatKey: 'right',
    defensiveProfilePolicy: createDefensiveDevPolicyPatch()
  });
  assert(review && review.override === true, `expected rank-protect safety gate override, got ${JSON.stringify(review)}`);
  assert(review.selectedTileCode === 'z1', `expected safe backstep tile, got ${JSON.stringify(review)}`);
  assert(review.backstep === true, `expected backstep under protect-lead, got ${JSON.stringify(review)}`);
  assert(review.rankDefenseState === 'protect-lead', `expected protect-lead state, got ${JSON.stringify(review)}`);
  return {
    name: 'hard-defensive-dev-safety-gate-rank-protect-backstep-smoke',
    snapshot: {
      selectedTileCode: review.selectedTileCode,
      backstep: review.backstep,
      rankDefenseState: review.rankDefenseState,
      threatScore: review.threatScore
    }
  };
}

function runDefensiveSafetyGateNeutralBackstepBlockedSmoke() {
  const runtime = createDefensiveProfileFixtureRuntime({
    dealerSeat: 'top',
    riichiSeats: ['top'],
    remaining: 12
  });
  const attack = createPushFoldDecision({
    tileCode: 'm5',
    dangerScore: 8,
    safetyRank: 9,
    defenseTileRank: 94,
    xiangting: 1,
    handValue: 24,
    hardEvScore: 140
  });
  const safeBackstep = createPushFoldDecision({
    tileCode: 'z1',
    dangerScore: 0,
    safetyRank: 0,
    defenseTileRank: 2,
    safetyReasons: ['safety-genbutsu'],
    xiangting: 2,
    handValue: 5,
    hardEvScore: 10,
    tileIndex: 1
  });
  const review = hardPushFoldApi.evaluateSafetyGateRerank([attack, safeBackstep], attack, {
    runtime,
    seatKey: 'right',
    defensiveProfilePolicy: createDefensiveDevPolicyPatch()
  });
  assert(review && review.active === true, `expected active neutral pressure safety gate, got ${JSON.stringify(review)}`);
  assert(review.rankDefenseState === 'neutral-defense', `expected neutral-defense state, got ${JSON.stringify(review)}`);
  assert(review.override === false, `expected neutral-defense backstep to be blocked, got ${JSON.stringify(review)}`);
  assert(review.selectedTileCode === 'm5', `expected current attack tile kept without same-shanten safer tile, got ${JSON.stringify(review)}`);
  return {
    name: 'hard-defensive-dev-safety-gate-neutral-backstep-blocked-smoke',
    snapshot: {
      active: review.active,
      rankDefenseState: review.rankDefenseState,
      selectedTileCode: review.selectedTileCode,
      reasons: review.reasons
    }
  };
}

function runDefensiveSafetyGatePrefersSameShantenSmoke() {
  const runtime = createDefensiveProfileFixtureRuntime({
    dealerSeat: 'top',
    riichiSeats: ['top'],
    remaining: 8
  });
  const hardContext = {
    scoreRank: 1,
    leadOverSecond: 9000,
    isLateRound: true
  };
  const attack = createPushFoldDecision({
    tileCode: 'm5',
    dangerScore: 8,
    safetyRank: 9,
    defenseTileRank: 94,
    xiangting: 1,
    handValue: 18,
    hardEvScore: 120,
    hardContext
  });
  const sameShantenSemiSafe = createPushFoldDecision({
    tileCode: 'm8',
    dangerScore: 5,
    safetyRank: 6,
    defenseTileRank: 60,
    xiangting: 1,
    handValue: 18,
    hardEvScore: 80,
    tileIndex: 1,
    hardContext
  });
  const safeBackstep = createPushFoldDecision({
    tileCode: 'z1',
    dangerScore: 0,
    safetyRank: 0,
    defenseTileRank: 2,
    safetyReasons: ['safety-genbutsu'],
    xiangting: 2,
    handValue: 5,
    hardEvScore: 10,
    tileIndex: 2,
    hardContext
  });
  const review = hardPushFoldApi.evaluateSafetyGateRerank([attack, sameShantenSemiSafe, safeBackstep], attack, {
    runtime,
    seatKey: 'right',
    defensiveProfilePolicy: createDefensiveDevPolicyPatch()
  });
  assert(review && review.override === true, `expected safety gate override, got ${JSON.stringify(review)}`);
  assert(review.selectedTileCode === 'm8', `expected same-shanten safer tile to beat backstep, got ${JSON.stringify(review)}`);
  assert(review.sameShanten === true && review.backstep === false, `expected same-shanten override, got ${JSON.stringify(review)}`);
  return {
    name: 'hard-defensive-dev-safety-gate-prefers-same-shanten-smoke',
    snapshot: {
      selectedTileCode: review.selectedTileCode,
      sameShanten: review.sameShanten,
      backstep: review.backstep,
      reasons: review.reasons
    }
  };
}

function runDefensiveSafetyGateSafeTenpaiProtectedSmoke() {
  const runtime = createDefensiveProfileFixtureRuntime({
    dealerSeat: 'top',
    riichiSeats: ['top'],
    remaining: 12
  });
  const attack = createPushFoldDecision({
    tileCode: 'm5',
    dangerScore: 8,
    safetyRank: 9,
    defenseTileRank: 94,
    xiangting: 0,
    handValue: 72,
    hardEvScore: 1200,
    liveTingpaiCount: 5,
    waitQualityScore: 20,
    hardContext: {
      scoreRank: 4,
      trailingByLeader: 12000
    }
  });
  const safe = createPushFoldDecision({
    tileCode: 'z1',
    dangerScore: 0,
    safetyRank: 0,
    defenseTileRank: 2,
    safetyReasons: ['safety-genbutsu'],
    xiangting: 1,
    handValue: 5,
    hardEvScore: 10,
    tileIndex: 1,
    hardContext: attack.hardMetrics.hardContext
  });
  const review = hardPushFoldApi.evaluateSafetyGateRerank([attack, safe], attack, {
    runtime,
    seatKey: 'right',
    defensiveProfilePolicy: createDefensiveDevPolicyPatch()
  });
  assert(review && review.active === true, `expected active safety gate review, got ${JSON.stringify(review)}`);
  assert(review.override === false, `expected protected tenpai not to be overridden, got ${JSON.stringify(review)}`);
  assert(review.protectedPush === true, `expected protected push flag, got ${JSON.stringify(review)}`);
  assert(review.selectedTileCode === 'm5', `expected current attack tile kept, got ${JSON.stringify(review)}`);
  return {
    name: 'hard-defensive-dev-safety-gate-safe-tenpai-protected-smoke',
    snapshot: {
      selectedTileCode: review.selectedTileCode,
      protectedPush: review.protectedPush,
      rankDefenseState: review.rankDefenseState
    }
  };
}

function runDefensiveSafetyGateComebackProtectedSmoke() {
  const runtime = createDefensiveProfileFixtureRuntime({
    dealerSeat: 'top',
    riichiSeats: ['top'],
    remaining: 12
  });
  const attack = createPushFoldDecision({
    tileCode: 'm5',
    dangerScore: 8,
    safetyRank: 9,
    defenseTileRank: 94,
    xiangting: 1,
    handValue: 56,
    hardEvScore: 700,
    hardContext: {
      scoreRank: 4,
      trailingByLeader: 12000
    }
  });
  const safe = createPushFoldDecision({
    tileCode: 'z1',
    dangerScore: 0,
    safetyRank: 0,
    defenseTileRank: 2,
    safetyReasons: ['safety-genbutsu'],
    xiangting: 2,
    handValue: 5,
    hardEvScore: 10,
    tileIndex: 1,
    hardContext: attack.hardMetrics.hardContext
  });
  const review = hardPushFoldApi.evaluateSafetyGateRerank([attack, safe], attack, {
    runtime,
    seatKey: 'right',
    defensiveProfilePolicy: createDefensiveDevPolicyPatch()
  });
  assert(review && review.active === true, `expected active comeback safety gate review, got ${JSON.stringify(review)}`);
  assert(review.override === false, `expected comeback not to backstep, got ${JSON.stringify(review)}`);
  assert(review.protectedPush === true, `expected comeback protected push, got ${JSON.stringify(review)}`);
  assert(review.rankDefenseState === 'comeback', `expected comeback state, got ${JSON.stringify(review)}`);
  return {
    name: 'hard-defensive-dev-safety-gate-comeback-protected-smoke',
    snapshot: {
      selectedTileCode: review.selectedTileCode,
      protectedPush: review.protectedPush,
      rankDefenseState: review.rankDefenseState
    }
  };
}

function runDefensiveSafetyGateLowPressureInactiveSmoke() {
  const runtime = createDefensiveProfileFixtureRuntime({
    dealerSeat: 'top',
    riichiSeats: [],
    remaining: 42
  });
  const attack = createPushFoldDecision({
    tileCode: 'm5',
    dangerScore: 5,
    safetyRank: 6,
    defenseTileRank: 60,
    xiangting: 1,
    handValue: 28,
    hardEvScore: 180
  });
  const safe = createPushFoldDecision({
    tileCode: 'z1',
    dangerScore: 0,
    safetyRank: 0,
    defenseTileRank: 2,
    safetyReasons: ['safety-genbutsu'],
    xiangting: 1,
    handValue: 5,
    hardEvScore: 10,
    tileIndex: 1
  });
  const review = hardPushFoldApi.evaluateSafetyGateRerank([attack, safe], attack, {
    runtime,
    seatKey: 'right',
    defensiveProfilePolicy: createDefensiveDevPolicyPatch()
  });
  assert(review && review.enabled === true, `expected safety gate diagnostic review, got ${JSON.stringify(review)}`);
  assert(review.active === false, `expected low-pressure safety gate inactive, got ${JSON.stringify(review)}`);
  assert(review.override === false, `expected low-pressure no override, got ${JSON.stringify(review)}`);
  assert(review.reasons.includes('def-safety-gate-low-pressure'), `expected low-pressure reason, got ${JSON.stringify(review)}`);
  return {
    name: 'hard-defensive-dev-safety-gate-low-pressure-inactive-smoke',
    snapshot: {
      active: review.active,
      selectedTileCode: review.selectedTileCode,
      reasons: review.reasons
    }
  };
}

function runDefensiveUtilityShadowSmoke() {
  const runtime = createDefensiveProfileFixtureRuntime({
    dealerSeat: 'top',
    riichiSeats: ['top'],
    remaining: 12
  });
  const attack = createPushFoldDecision({
    tileCode: 'm5',
    dangerScore: 8,
    safetyRank: 9,
    defenseTileRank: 94,
    xiangting: 1,
    handValue: 22,
    hardEvScore: 120,
    hardContext: {
      scoreRank: 1,
      leadOverSecond: 9000,
      isLateRound: true
    }
  });
  const safe = createPushFoldDecision({
    tileCode: 'z1',
    dangerScore: 0,
    safetyRank: 0,
    defenseTileRank: 2,
    safetyReasons: ['safety-genbutsu'],
    xiangting: 2,
    handValue: 5,
    hardEvScore: 10,
    tileIndex: 1,
    hardContext: attack.hardMetrics.hardContext
  });
  const shadow = hardPushFoldApi.evaluateDefensiveUtilityShadow([attack, safe], attack, {
    runtime,
    seatKey: 'right',
    defensiveProfilePolicy: createDefensiveDevPolicyPatch()
  });
  assert(shadow && shadow.enabled === true, `expected defensive utility shadow, got ${JSON.stringify(shadow)}`);
  assert(shadow.currentTileCode === 'm5', `expected current tile unchanged, got ${JSON.stringify(shadow)}`);
  assert(shadow.recommendedTileCode === 'z1', `expected shadow safer tile recommendation, got ${JSON.stringify(shadow)}`);
  assert(shadow.differs === true && shadow.saferAlternative === true && shadow.backstep === true, `expected safer backstep shadow diff, got ${JSON.stringify(shadow)}`);
  assert(shadow.actionable === true, `expected high-threat safer shadow to be actionable, got ${JSON.stringify(shadow)}`);
  assert(shadow.actionableReasons.includes('def-shadow-actionable-pressure'), `expected actionable pressure reason, got ${JSON.stringify(shadow)}`);
  assert(Array.isArray(shadow.top) && shadow.top.length === 2, `expected compact top candidates, got ${JSON.stringify(shadow)}`);
  assert(!Object.prototype.hasOwnProperty.call(shadow, 'runtime'), `shadow must not contain runtime, got ${JSON.stringify(shadow)}`);
  assert(!Object.prototype.hasOwnProperty.call(shadow, 'eventLog'), `shadow must not contain eventLog, got ${JSON.stringify(shadow)}`);

  const tenpaiAttack = createPushFoldDecision({
    tileCode: 'm5',
    dangerScore: 8,
    safetyRank: 9,
    defenseTileRank: 94,
    xiangting: 0,
    handValue: 72,
    hardEvScore: 1200,
    liveTingpaiCount: 5,
    waitQualityScore: 20,
    hardContext: {
      scoreRank: 4,
      trailingByLeader: 12000
    }
  });
  const tenpaiSafe = createPushFoldDecision({
    tileCode: 'z1',
    dangerScore: 0,
    safetyRank: 0,
    defenseTileRank: 2,
    safetyReasons: ['safety-genbutsu'],
    xiangting: 1,
    handValue: 5,
    hardEvScore: 10,
    tileIndex: 1,
    hardContext: tenpaiAttack.hardMetrics.hardContext
  });
  const tenpaiShadow = hardPushFoldApi.evaluateDefensiveUtilityShadow([tenpaiAttack, tenpaiSafe], tenpaiAttack, {
    runtime,
    seatKey: 'right',
    defensiveProfilePolicy: createDefensiveDevPolicyPatch()
  });
  assert(tenpaiShadow && tenpaiShadow.rankDefenseState === 'safe-tenpai', `expected safe-tenpai shadow profile, got ${JSON.stringify(tenpaiShadow)}`);
  assert(tenpaiShadow.recommendedTileCode === 'm5', `expected safe-tenpai shadow to keep attack, got ${JSON.stringify(tenpaiShadow)}`);
  assert(tenpaiShadow.backstep === false, `expected no forced backstep in safe-tenpai, got ${JSON.stringify(tenpaiShadow)}`);
  assert(tenpaiShadow.actionable === false, `expected same-tile safe-tenpai shadow to be non-actionable, got ${JSON.stringify(tenpaiShadow)}`);

  return {
    name: 'hard-defensive-dev-utility-shadow-smoke',
    snapshot: {
      highThreatRecommended: shadow.recommendedTileCode,
      highThreatSaferAlternative: shadow.saferAlternative,
      highThreatActionable: shadow.actionable,
      tenpaiRecommended: tenpaiShadow.recommendedTileCode,
      tenpaiState: tenpaiShadow.rankDefenseState,
      tenpaiActionable: tenpaiShadow.actionable
    }
  };
}

function runDefensiveThreatProfileSmoke() {
  const attack = createPushFoldDecision({
    categories: ['dora-adjacent']
  });
  const childRiichi = hardDefensiveProfileApi.buildThreatProfile(
    createDefensiveProfileFixtureRuntime({
      dealerSeat: 'right',
      riichiSeats: ['top']
    }),
    'right',
    attack,
    { policy: createDefensiveDevPolicyPatch() }
  );
  const dealerRiichi = hardDefensiveProfileApi.buildThreatProfile(
    createDefensiveProfileFixtureRuntime({
      dealerSeat: 'top',
      riichiSeats: ['top']
    }),
    'right',
    attack,
    { policy: createDefensiveDevPolicyPatch() }
  );
  const multiThreat = hardDefensiveProfileApi.buildThreatProfile(
    createDefensiveProfileFixtureRuntime({
      dealerSeat: 'top',
      riichiSeats: ['top', 'left'],
      fulouBySeat: {
        left: ['p123-', 'p456-']
      }
    }),
    'right',
    attack,
    { policy: createDefensiveDevPolicyPatch() }
  );
  assert(dealerRiichi.threatScore > childRiichi.threatScore, `expected dealer riichi to be higher threat than child riichi, got ${JSON.stringify({ childRiichi, dealerRiichi })}`);
  assert(multiThreat.threatScore > dealerRiichi.threatScore, `expected multi threat to be higher than dealer riichi, got ${JSON.stringify({ dealerRiichi, multiThreat })}`);
  assert(multiThreat.reasons.includes('threat-multi'), `expected multi threat reason, got ${JSON.stringify(multiThreat)}`);
  return {
    name: 'hard-defensive-dev-threat-profile-smoke',
    snapshot: {
      childThreat: childRiichi.threatScore,
      dealerThreat: dealerRiichi.threatScore,
      multiThreat: multiThreat.threatScore,
      reasons: multiThreat.reasons
    }
  };
}

function runDefensiveRankAwareFoldSmoke() {
  const runtime = createDefensiveProfileFixtureRuntime({
    dealerSeat: 'top',
    riichiSeats: ['top'],
    remaining: 12
  });
  const attack = createPushFoldDecision({
    tileCode: 'm5',
    dangerScore: 8,
    xiangting: 1,
    handValue: 24,
    hardContext: {
      scoreRank: 1,
      leadOverSecond: 9000,
      isLateRound: true
    }
  });
  const safe = createPushFoldDecision({
    tileCode: 'z1',
    dangerScore: 0,
    xiangting: 2,
    handValue: 5,
    hardEvScore: 10,
    tileIndex: 1,
    hardContext: attack.hardMetrics.hardContext
  });
  const review = hardPushFoldApi.evaluateHardPushFoldCandidates([attack, safe], attack, {
    policy: hardPolicyApi.createHardPolicy().pushFold,
    pushFoldState: {
      state: 'neutral',
      pressureScore: 0,
      reasons: ['defensive-dev-profile-only-fixture']
    },
    runtime,
    seatKey: 'right',
    defensiveProfilePolicy: createDefensiveDevPolicyPatch()
  });
  assert(review.mode === 'cross-xiangting-fold', `expected defensive-dev rank-aware fold, got ${JSON.stringify(review)}`);
  assert(review.selectedTileCode === 'z1', `expected safe tile selected, got ${JSON.stringify(review)}`);
  assert(review.defensiveProfile && review.defensiveProfile.rankDefenseState === 'protect-lead', `expected protect-lead profile, got ${JSON.stringify(review)}`);
  return {
    name: 'hard-defensive-dev-rank-aware-fold-smoke',
    snapshot: {
      mode: review.mode,
      selectedTileCode: review.selectedTileCode,
      rankDefenseState: review.defensiveProfile.rankDefenseState,
      threatScore: review.defensiveProfile.threatProfile.threatScore,
      netPushScore: review.netPushScore
    }
  };
}

function runDefensiveSafeTenpaiPushSmoke() {
  const runtime = createDefensiveProfileFixtureRuntime({
    dealerSeat: 'top',
    riichiSeats: ['top'],
    remaining: 12
  });
  const attack = createPushFoldDecision({
    tileCode: 'm5',
    dangerScore: 8,
    xiangting: 0,
    handValue: 72,
    liveTingpaiCount: 5,
    waitQualityScore: 12,
    hardContext: {
      scoreRank: 4,
      trailingByLeader: 12000
    }
  });
  const safe = createPushFoldDecision({
    tileCode: 'z1',
    dangerScore: 0,
    xiangting: 1,
    handValue: 5,
    hardEvScore: 10,
    tileIndex: 1,
    hardContext: attack.hardMetrics.hardContext
  });
  const review = hardPushFoldApi.evaluateHardPushFoldCandidates([attack, safe], attack, {
    policy: hardPolicyApi.createHardPolicy().pushFold,
    pushFoldState: {
      state: 'careful',
      pressureScore: 14,
      reasons: ['defensive-dev-safe-tenpai-fixture']
    },
    runtime,
    seatKey: 'right',
    defensiveProfilePolicy: createDefensiveDevPolicyPatch()
  });
  assert(review.mode === 'keep-attack', `expected safe-tenpai push to remain attack, got ${JSON.stringify(review)}`);
  assert(review.pushProtected === true, `expected pushProtected safe-tenpai, got ${JSON.stringify(review)}`);
  assert(review.defensiveProfile && review.defensiveProfile.rankDefenseState === 'safe-tenpai', `expected safe-tenpai profile, got ${JSON.stringify(review)}`);
  return {
    name: 'hard-defensive-dev-safe-tenpai-push-smoke',
    snapshot: {
      mode: review.mode,
      rankDefenseState: review.defensiveProfile.rankDefenseState,
      pushProtected: review.pushProtected,
      netPushScore: review.netPushScore
    }
  };
}

function runDealInAttributionSmoke() {
  const cases = [
    [{ threatProfile: { riichiCount: 1 }, xiangting: 1, tileCode: 'm5', closedHandBefore: true }, 'riichi-push'],
    [{ threatProfile: { dealerThreat: true, riichiCount: 1 }, xiangting: 1, tileCode: 'm5', closedHandBefore: true }, 'dealer-threat'],
    [{ threatProfile: { multiThreat: true, riichiCount: 2 }, xiangting: 1, tileCode: 'm5', closedHandBefore: true }, 'multi-threat'],
    [{ threatProfile: { riichiCount: 1 }, xiangting: 0, tileCode: 'm5', closedHandBefore: true }, 'tenpai-push'],
    [{ threatProfile: { riichiCount: 0 }, xiangting: 2, tileCode: 'p5', closedHandBefore: false, safeTileCode: null }, 'open-hand-no-safe'],
    [{ threatProfile: { riichiCount: 0 }, xiangting: 2, tileCode: 's5', closedHandBefore: true }, 'no-pressure-middle'],
    [{ threatProfile: { riichiCount: 1 }, defensiveState: 'comeback', xiangting: 1, tileCode: 'm5' }, 'comeback-push']
  ];
  cases.forEach(([snapshot, expected]) => {
    const actual = hardDefensiveProfileApi.classifyDealInAttribution(snapshot);
    assert(actual === expected, `expected ${expected}, got ${actual} for ${JSON.stringify(snapshot)}`);
  });
  return {
    name: 'hard-defensive-dev-deal-in-attribution-smoke',
    snapshot: {
      categories: cases.map(([, expected]) => expected)
    }
  };
}

function main() {
  const cwd = path.resolve(__dirname, '..');
  const results = [
    runFormalControllerSmoke(cwd),
    runCurrentTurnDirectDiscardSmoke(cwd),
    runHardCandidateDiagnosticsDefaultHiddenSmoke(cwd),
    runHardCandidateDiagnosticsOptInSmoke(cwd),
    runNoPressureShapeTerminalSmoke(cwd),
    runNoPressureShapeTiebreakSmoke(cwd),
    runNoPressureFiveRetentionSmoke(cwd),
    runNoPressureExistingEvRegressionSmoke(cwd),
    runNoPressureNoBackstepSmoke(cwd),
    runShapeLowXiangtingTerminalSmoke(cwd),
    runShapeLowXiangtingFiveRetentionSmoke(cwd),
    runShapeStrongOverrideSmoke(cwd),
    runNoPressureCleanupGuardSmoke(),
    runNoPressureCleanupGuardNonCleanupSkipSmoke(),
    runNoPressureCleanupGuardEvCapSmoke(),
    runShapeTenpaiNearTieOnlySmoke(cwd),
    runShapeNoBackstepStillSmoke(cwd),
    runShapeClearEvAdvantageRegressionSmoke(cwd),
    runSanmaBoundarySmoke(cwd),
    runVisibleTilesSmoke(cwd),
    runDefenseGenbutsuSmoke(cwd),
    runDefenseSujiKabeSmoke(cwd),
    runDefenseSafetyRankSmoke(cwd),
    runLowDangerSameXiangtingSmoke(cwd),
    runLowPressureSoftFoldSmoke(cwd),
    runProtectedPushNotSoftFoldSmoke(cwd),
    runDefenseDiagnosticsSafetySmoke(cwd),
    runLiveUkeireDiscardSmoke(cwd),
    runWaitQualitySmoke(cwd),
    runPressureKeepsSafetySmoke(cwd),
    runMultiRiichiDefenseSmoke(cwd),
    runLateLeaderSafetySmoke(cwd),
    runCrossXiangtingFoldSmoke(cwd),
    runTenpaiGoodWaitPushSmoke(cwd),
    runMultiThreatCrossFoldSmoke(cwd),
    runDealerValuePushSmoke(cwd),
    runLeaderLateCrossFoldSmoke(cwd),
    runGoodWaitRiichiSmoke(cwd),
    runLateBadWaitNoRiichiSmoke(cwd),
    runThinTankiRiichiSmoke(cwd),
    runThinTankiLateNoRiichiSmoke(cwd),
    runThinTankiPressureNoRiichiSmoke(cwd),
    runThinTankiDangerDiscardNoRiichiSmoke(cwd),
    runPressureNoThinRiichiSmoke(cwd),
    runRoundContextRiichiSmoke(cwd),
    runYakuhaiSpeedCallSmoke(cwd),
    runUnsafeFlatCallSmoke(cwd),
    runClosedRouteValuePassOverrideSmoke(),
    runClosedRouteDirectTenpaiAllowSmoke(),
    runClosedRoutePressureRegressionSmoke(),
    runClosedRouteOpenHandRegressionSmoke(),
    runClosedRouteHighValueCallAllowSmoke(),
    runClosedRouteBalancedPolicySmoke(),
    runClosedRouteBalancedValueOverrideSmoke(),
    runClosedRouteBalancedDirectTenpaiSmoke(),
    runClosedRouteBalancedPressureSmoke(),
    runDefensiveThreatProfileSmoke(),
    runDefensiveRankAwareFoldSmoke(),
    runDefensiveSafeTenpaiPushSmoke(),
    runDefensiveSafetyGateStableOffSmoke(),
    runDefensiveSafetyGateSameShantenSmoke(),
    runDefensiveSafetyGateRankProtectBackstepSmoke(),
    runDefensiveSafetyGateNeutralBackstepBlockedSmoke(),
    runDefensiveSafetyGatePrefersSameShantenSmoke(),
    runDefensiveSafetyGateSafeTenpaiProtectedSmoke(),
    runDefensiveSafetyGateComebackProtectedSmoke(),
    runDefensiveSafetyGateLowPressureInactiveSmoke(),
    runDefensiveUtilityShadowSmoke(),
    runDealInAttributionSmoke(),
    runHardVsNormalComparisonSmoke(cwd)
  ];

  results.forEach((result) => {
    console.log(`[PASS] ${result.name}`);
    console.log(`  snapshot=${JSON.stringify(result.snapshot)}`);
  });
}

main();
