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
const hardEvApi = require('../engine/ai/support/hard-ev');
const hardPushFoldApi = require('../engine/ai/support/hard-push-fold');
const hardDefenseTiebreakApi = require('../engine/ai/support/hard-defense-tiebreak');
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
      runtime.passReaction(seatKey, { reason: 'validate-hard-headless-stats-pass' });
    }
  });
}

function fastForwardToRightFirstDiscard(runtime) {
  runtime.start();
  assert(runtime.getCurrentTurnSeat() === 'bottom', `expected bottom to open the round, got ${runtime.getCurrentTurnSeat()}`);
  runtime.drawTile('bottom');
  const bottomHandCodes = runtime.getSeatHandCodes('bottom');
  assert(bottomHandCodes.length > 0, 'expected bottom seat to have drawable hand codes');
  runtime.discardTile('bottom', bottomHandCodes[bottomHandCodes.length - 1]);
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
}

function setSeatHand(runtime, seatKey, paistr) {
  const seatIndex = runtime.getSeatIndex(seatKey);
  assert(seatIndex >= 0, `expected valid seat ${seatKey}`);
  runtime.board.shoupai[seatIndex] = coreAdapter.createShoupaiFromString(paistr);
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

function setRoundCounts(runtime, counts = {}) {
  ['changbang', 'lizhibang'].forEach((key) => {
    if (!Number.isFinite(Number(counts[key]))) return;
    const value = Number(counts[key]);
    if (runtime.board) runtime.board[key] = value;
    if (runtime.roundConfig) runtime.roundConfig[key] = value;
  });
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

function chooseDiscard(runtime, seatKey, difficulty) {
  return discardEvaluatorApi.evaluateRuntimeDiscard(runtime, seatKey, {
    difficulty,
    profile: 'default'
  });
}

function normalizeCandidateForDiscard(candidate) {
  return String(candidate || '').replace(/\*$/, '');
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
    danger: defense && defense.danger ? defense.danger : null,
    pushFoldState: defense && defense.pushFoldState ? defense.pushFoldState : null
  };
}

function evaluateHardRiichiCandidate(runtime, seatKey, tileCode, overrides = {}) {
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
    difficulty: 'hard',
    policyId: 'hard',
    danger: overrides.danger || candidate.danger,
    pushFoldState: overrides.pushFoldState || candidate.pushFoldState,
    metrics: {
      xiangting: candidate.xiangting,
      tingpaiCount: candidate.tingpaiCount,
      ukeireCount: candidate.ukeireCount,
      handValueEstimate: candidate.handValueEstimate
    },
    hardMetrics: candidate.hardMetrics,
    reasons: ['validate-hard-headless-riichi-candidate']
  };

  return {
    candidate,
    riichiDecision: riichiEvaluatorApi.evaluateRuntimeRiichi(
      runtime,
      seatKey,
      shoupai,
      discardDecision,
      { difficulty: 'hard', profile: 'default' }
    )
  };
}

function collectRightReactionActions(runtime) {
  assert(runtime.pendingReaction && Array.isArray(runtime.pendingReaction.actions), 'expected pending reaction window');
  return runtime.pendingReaction.actions.filter((action) => (
    action
    && action.payload
    && action.payload.seat === 'right'
  ));
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
    profile: 'default'
  });

  return {
    runtime,
    rightActions,
    decision
  };
}

function createStats() {
  return {
    samples: 0,
    hardAdvantages: 0,
    regressions: 0,
    pressureSafetyWins: 0,
    noPressureEvWins: 0,
    crossXiangtingFoldWins: 0,
    lowDangerDefenseWins: 0,
    lowPressureSoftFoldWins: 0,
    protectedPushWins: 0,
    riichiAccepts: 0,
    riichiRejects: 0,
    callAccepts: 0,
    callRejects: 0,
    cases: []
  };
}

function recordCase(stats, result) {
  stats.samples += 1;
  if (result.advantage) stats.hardAdvantages += 1;
  if (result.regression) stats.regressions += 1;
  if (result.pressureSafetyWin) stats.pressureSafetyWins += 1;
  if (result.noPressureEvWin) stats.noPressureEvWins += 1;
  if (result.crossXiangtingFoldWin) stats.crossXiangtingFoldWins += 1;
  if (result.lowDangerDefenseWin) stats.lowDangerDefenseWins += 1;
  if (result.lowPressureSoftFoldWin) stats.lowPressureSoftFoldWins += 1;
  if (result.protectedPushWin) stats.protectedPushWins += 1;
  if (result.riichiAccepted) stats.riichiAccepts += 1;
  if (result.riichiRejected) stats.riichiRejects += 1;
  if (result.callAccepted) stats.callAccepts += 1;
  if (result.callRejected) stats.callRejects += 1;
  stats.cases.push(result);
}

function runFormalControllerCase(cwd) {
  const baseConfig = loadJson(path.join(cwd, 'test', 'game-config.ai-normal-current-turn-smoke.json'));
  const config = withRightDifficulty(baseConfig, 'hard');
  const runtime = createRuntimeFromConfig(config);
  const aiController = baseAiApi.createAiController(runtime, config);

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
    name: 'formal-controller',
    advantage: true,
    regression: false,
    summary: {
      difficulty: controllerConfig.difficulty,
      implemented: controllerConfig.implemented,
      tileCode: decision.tileCode,
      policyId: decision.policyId,
      hasHardContext: Boolean(decision.hardMetrics && decision.hardMetrics.hardContext)
    }
  };
}

function runNoPressureEvCase(cwd) {
  const config = withRightDifficulty(loadJson(path.join(cwd, 'test', 'game-config.ai-normal-current-turn-smoke.json')), 'hard');
  const runtime = createRuntimeFromConfig(config);

  fastForwardToRightFirstDiscard(runtime);
  setDoraIndicators(runtime, ['z1']);
  setSeatHand(runtime, 'right', 'm12234p123555s123');
  runtime.board.he[runtime.getSeatIndex('top')]._pai = ['m5', 'm5', 'm5'];

  const normal = chooseDiscard(runtime, 'right', 'normal');
  const hard = chooseDiscard(runtime, 'right', 'hard');
  const hardWins = Boolean(
    normal
    && hard
    && normal.tileCode === 'm1'
    && hard.tileCode === 'm2'
    && hard.hardMetrics
    && hard.hardMetrics.liveTingpaiCount >= normal.metrics.tingpaiCount
  );

  assert(hardWins, `expected hard no-pressure EV to beat normal baseline, got ${JSON.stringify({ normal, hard })}`);

  return {
    name: 'no-pressure-live-ev',
    advantage: true,
    noPressureEvWin: true,
    regression: false,
    summary: {
      normal: {
        tileCode: normal.tileCode,
        metrics: normal.metrics
      },
      hard: {
        tileCode: hard.tileCode,
        hardMetrics: hard.hardMetrics
      }
    }
  };
}

function runPressureSafetyCase(cwd) {
  const config = withRightDifficulty(loadJson(path.join(cwd, 'test', 'game-config.ai-normal-defense-priority-smoke.json')), 'hard');
  const runtime = createRuntimeFromConfig(config);

  fastForwardToRightFirstDiscard(runtime);
  setDoraIndicators(runtime, ['z1']);
  setRiichiPressure(runtime, 'top', ['m8*']);

  const safe = evaluateHardDiscardCandidate(runtime, 'right', 'm8');
  const risky = evaluateHardDiscardCandidate(runtime, 'right', 's9_');
  const normal = chooseDiscard(runtime, 'right', 'normal');
  const hard = chooseDiscard(runtime, 'right', 'hard');
  const hardWins = Boolean(
    hard
    && hard.tileCode === 'm8'
    && hard.danger
    && hard.danger.dangerScore === 0
    && safe.danger
    && risky.danger
    && risky.danger.dangerScore > safe.danger.dangerScore
    && risky.hardMetrics
    && safe.hardMetrics
    && risky.hardMetrics.hardEvScore > safe.hardMetrics.hardEvScore
  );

  assert(hardWins, `expected hard pressure safety gate to choose genbutsu over higher EV risk, got ${JSON.stringify({ normal, hard, safe, risky })}`);

  return {
    name: 'pressure-safety',
    advantage: true,
    pressureSafetyWin: true,
    regression: false,
    summary: {
      normal: normal ? {
        tileCode: normal.tileCode,
        danger: normal.danger
      } : null,
      hard: {
        tileCode: hard.tileCode,
        danger: hard.danger,
        hardMetrics: hard.hardMetrics
      },
      risky: {
        tileCode: risky.tileCode,
        danger: risky.danger,
        hardEvScore: risky.hardMetrics.hardEvScore
      }
    }
  };
}

function prepareCrossXiangtingFoldRuntime(cwd, options = {}) {
  const config = withRightDifficulty(loadJson(path.join(cwd, 'test', 'game-config.ai-normal-current-turn-smoke.json')), 'hard');
  const runtime = createRuntimeFromConfig(config);

  fastForwardToRightFirstDiscard(runtime);
  setDoraIndicators(runtime, ['s8']);
  setRemainingTiles(runtime, Number.isFinite(Number(options.remaining)) ? Number(options.remaining) : 12);
  setSeatHand(runtime, 'right', 'm2488p5s3349z11455');
  setRiichiPressure(runtime, 'top', ['m8*']);

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
    reasons: ['validate-hard-headless-push-fold-candidate']
  };
}

function runCrossXiangtingFoldCase(cwd) {
  const runtime = prepareCrossXiangtingFoldRuntime(cwd);
  const hard = chooseDiscard(runtime, 'right', 'hard');

  assert(
    hard
      && hard.tileCode === 'm8'
      && hard.hardPushFold
      && hard.hardPushFold.mode === 'cross-xiangting-fold'
      && hard.hardPushFold.attackTileCode === 'm2'
      && hard.hardPushFold.safeTileCode === 'm8',
    `expected hard cross-xiangting fold, got ${JSON.stringify(hard)}`
  );

  return {
    name: 'cross-xiangting-fold',
    advantage: true,
    crossXiangtingFoldWin: true,
    regression: false,
    summary: {
      tileCode: hard.tileCode,
      danger: hard.danger,
      hardPushFold: hard.hardPushFold
    }
  };
}

function runProtectedPushCase(cwd) {
  const config = withRightDifficulty(loadJson(path.join(cwd, 'test', 'game-config.ai-normal-current-turn-smoke.json')), 'hard');
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
      reasons: ['riichi-opponent', 'validate-hard-headless-protected-push']
    }
  });

  assert(
    review
      && review.mode === 'keep-attack'
      && review.pushProtected === true
      && review.selectedTileCode === 'm1',
    `expected protected tenpai push, got ${JSON.stringify({ attack, safe, review })}`
  );

  return {
    name: 'protected-push',
    advantage: true,
    protectedPushWin: true,
    regression: false,
    summary: {
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

function runMultiRiichiSafetyCase(cwd) {
  const config = withRightDifficulty(loadJson(path.join(cwd, 'test', 'game-config.ai-normal-defense-priority-smoke.json')), 'hard');
  const runtime = createRuntimeFromConfig(config);

  fastForwardToRightFirstDiscard(runtime);
  setDoraIndicators(runtime, ['z1']);
  setRiichiPressure(runtime, 'top', ['m8*']);
  setRiichiPressure(runtime, 'left', ['m8*']);

  const hard = chooseDiscard(runtime, 'right', 'hard');

  assert(
    hard
      && hard.tileCode === 'm8'
      && hard.danger
      && hard.danger.dangerScore === 0
      && hard.pushFoldState
      && hard.pushFoldState.pressureScore >= 16,
    `expected hard to choose shared genbutsu under multi-riichi, got ${JSON.stringify(hard)}`
  );

  return {
    name: 'multi-riichi-safety',
    advantage: true,
    pressureSafetyWin: true,
    regression: false,
    summary: {
      tileCode: hard.tileCode,
      danger: hard.danger,
      pushFoldState: hard.pushFoldState
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
      reasons: ['validate-hard-headless-defense-tiebreak']
    },
    hardMetrics: {
      hardEvScore: Number(input.hardEvScore || 0) || 0,
      liveUkeireCount: Number(input.liveUkeireCount || 0) || 0,
      liveTingpaiCount: Number(input.liveTingpaiCount || 0) || 0,
      waitQualityScore: Number(input.waitQualityScore || 0) || 0,
      bestWaitType: input.bestWaitType || 'unknown',
      contextualHandValueEstimate: Number(input.contextualHandValueEstimate || input.handValueEstimate || 0) || 0
    },
    reasons: ['validate-hard-headless-defense-tiebreak-candidate']
  };
}

function evaluateHardDefenseTiebreak(candidates, current, pressureScore) {
  return hardDefenseTiebreakApi.evaluateHardDefenseTiebreakCandidates(candidates, current, {
    policy: hardPolicyApi.createHardPolicy().defense,
    pushPolicy: hardPolicyApi.createHardPolicy().pushFold,
    pushFoldState: {
      state: 'careful',
      pressureScore,
      reasons: ['validate-hard-headless-defense-tiebreak']
    }
  });
}

function runLowDangerDefenseCase() {
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

  assert(
    review && review.mode === 'same-xiangting-low-danger' && review.selectedTileCode === 'z6',
    `expected low-danger same-xiangting defense win, got ${JSON.stringify(review)}`
  );

  return {
    name: 'low-danger-defense-tiebreak',
    advantage: true,
    lowDangerDefenseWin: true,
    regression: false,
    summary: {
      current: current.tileCode,
      safer: safer.tileCode,
      review
    }
  };
}

function runLowPressureSoftFoldCase() {
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
  const safe = buildDefenseTiebreakDecision({
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
  const review = evaluateHardDefenseTiebreak([current, safe], current, 4);

  assert(
    review && review.mode === 'low-pressure-soft-fold' && review.selectedTileCode === 'p1',
    `expected low-pressure soft fold win, got ${JSON.stringify(review)}`
  );

  return {
    name: 'low-pressure-soft-fold',
    advantage: true,
    lowDangerDefenseWin: true,
    lowPressureSoftFoldWin: true,
    regression: false,
    summary: {
      current: current.tileCode,
      safe: safe.tileCode,
      review
    }
  };
}

function runRiichiContextAcceptCase(cwd) {
  const config = withRightDifficulty(loadJson(path.join(cwd, 'test', 'game-config.ai-normal-current-turn-smoke.json')), 'hard');
  const runtime = createRuntimeFromConfig(config);

  fastForwardToRightFirstDiscard(runtime);
  setDoraIndicators(runtime, ['z1']);
  setRemainingTiles(runtime, 25);
  setSeatHand(runtime, 'right', 'm12234p123555s123');
  setRiichiPressure(runtime, 'top', ['m4*']);
  setRoundCounts(runtime, {
    changbang: 1,
    lizhibang: 1
  });
  runtime.getDealerSeat = function getDealerSeatOverride() {
    return 'right';
  };

  const result = evaluateHardRiichiCandidate(runtime, 'right', 'm1', {
    pushFoldState: {
      state: 'careful',
      pressureScore: 8,
      reasons: ['riichi-opponent', 'validate-hard-headless-stats']
    }
  });
  const decision = result.riichiDecision;

  assert(
    decision
      && decision.shouldRiichi === true
      && decision.hardRiichiMetrics
      && decision.hardRiichiMetrics.hardContext
      && decision.hardRiichiMetrics.hardContext.attackValueBonus >= 10,
    `expected hard to accept boosted context riichi, got ${JSON.stringify(result)}`
  );

  return {
    name: 'riichi-context-accept',
    advantage: true,
    riichiAccepted: true,
    regression: false,
    summary: {
      tileCode: result.candidate.tileCode,
      shouldRiichi: decision.shouldRiichi,
      reasons: decision.reasons,
      hardRiichiMetrics: decision.hardRiichiMetrics
    }
  };
}

function runRiichiLateLeaderRejectCase(cwd) {
  const config = withRightDifficulty(loadJson(path.join(cwd, 'test', 'game-config.ai-normal-current-turn-smoke.json')), 'hard');
  const runtime = createRuntimeFromConfig(config);

  fastForwardToRightFirstDiscard(runtime);
  setDoraIndicators(runtime, ['z1']);
  setRemainingTiles(runtime, 12);
  setSeatHand(runtime, 'right', 'm12234p123555s123');
  setRiichiPressure(runtime, 'top', ['m4*']);
  setRoundCounts(runtime, {
    changbang: 1,
    lizhibang: 1
  });
  setScoreMap(runtime, {
    bottom: 15000,
    right: 45000,
    top: 25000,
    left: 15000
  });
  runtime.getDealerSeat = function getDealerSeatOverride() {
    return 'right';
  };

  const result = evaluateHardRiichiCandidate(runtime, 'right', 'm1', {
    pushFoldState: {
      state: 'careful',
      pressureScore: 8,
      reasons: ['riichi-opponent', 'validate-hard-headless-stats']
    }
  });
  const decision = result.riichiDecision;

  assert(
    decision
      && decision.shouldRiichi === false
      && decision.hardRiichiMetrics
      && decision.hardRiichiMetrics.hardContext
      && decision.hardRiichiMetrics.hardContext.defenseValuePenalty > 0,
    `expected late leader context to reject pressure riichi, got ${JSON.stringify(result)}`
  );

  return {
    name: 'riichi-late-leader-reject',
    advantage: true,
    riichiRejected: true,
    regression: false,
    summary: {
      tileCode: result.candidate.tileCode,
      shouldRiichi: decision.shouldRiichi,
      reasons: decision.reasons,
      hardRiichiMetrics: decision.hardRiichiMetrics
    }
  };
}

function runYakuhaiCallAcceptCase(cwd) {
  const config = withRightDifficulty(loadJson(path.join(cwd, 'test', 'game-config.ai-easy-yakuhai-call-smoke.json')), 'hard');
  const hard = evaluateRightReaction(config, 'z7', 'hard');

  assert(
    hard.decision
      && hard.decision.action
      && hard.decision.action.type === 'call'
      && hard.decision.callType === 'peng'
      && hard.decision.hardCallMetrics
      && hard.decision.hardCallMetrics.isYakuhaiPeng === true,
    `expected hard to accept yakuhai peng, got ${JSON.stringify(hard)}`
  );

  return {
    name: 'call-yakuhai-accept',
    advantage: true,
    callAccepted: true,
    regression: false,
    summary: {
      callType: hard.decision.callType,
      reasons: hard.decision.reasons,
      hardCallMetrics: hard.decision.hardCallMetrics
    }
  };
}

function runPressureFlatCallRejectCase(cwd) {
  const config = withRightDifficulty(loadJson(path.join(cwd, 'test', 'game-config.ai-easy-yakuhai-call-smoke.json')), 'hard');
  const normal = evaluateRightReaction(config, 'z7', 'normal', {
    riichiPressure: {
      seatKey: 'top',
      riverCodes: ['z1*']
    }
  });
  const hard = evaluateRightReaction(config, 'z7', 'hard', {
    riichiPressure: {
      seatKey: 'top',
      riverCodes: ['z1*']
    }
  });

  assert(
    hard.rightActions.some((action) => action && action.type === 'call'),
    `expected yakuhai call candidate under pressure, got ${JSON.stringify(hard.rightActions)}`
  );
  assert(
    normal.decision && normal.decision.callType === 'peng',
    `expected normal baseline to accept pressured yakuhai peng, got ${JSON.stringify(normal)}`
  );
  assert(hard.decision == null, `expected hard to reject low-value yakuhai call under pressure, got ${JSON.stringify(hard.decision)}`);

  return {
    name: 'call-pressure-yakuhai-reject',
    advantage: true,
    callRejected: true,
    regression: false,
    summary: {
      normal: normal.decision ? {
        callType: normal.decision.callType,
        reasons: normal.decision.reasons
      } : null,
      hard: null,
      availableActions: hard.rightActions.map((action) => ({
        key: action.key,
        type: action.type,
        callType: action.payload && action.payload.callType ? action.payload.callType : null,
        meldString: action.payload && action.payload.meldString ? action.payload.meldString : null
      }))
    }
  };
}

function buildStats(cwd) {
  const stats = createStats();
  [
    runFormalControllerCase,
    runNoPressureEvCase,
    runPressureSafetyCase,
    runCrossXiangtingFoldCase,
    runProtectedPushCase,
    runMultiRiichiSafetyCase,
    runLowDangerDefenseCase,
    runLowPressureSoftFoldCase,
    runRiichiContextAcceptCase,
    runRiichiLateLeaderRejectCase,
    runYakuhaiCallAcceptCase,
    runPressureFlatCallRejectCase
  ].forEach((runner) => {
    recordCase(stats, runner(cwd));
  });
  return stats;
}

function main() {
  const cwd = path.resolve(__dirname, '..');
  const stats = buildStats(cwd);

  assert(stats.regressions === 0, `expected no hard regressions in deterministic corpus, got ${JSON.stringify(stats)}`);
  assert(stats.noPressureEvWins >= 1, `expected at least one no-pressure EV win, got ${JSON.stringify(stats)}`);
  assert(stats.pressureSafetyWins >= 1, `expected at least one pressure safety win, got ${JSON.stringify(stats)}`);
  assert(stats.crossXiangtingFoldWins >= 1, `expected at least one cross-xiangting fold win, got ${JSON.stringify(stats)}`);
  assert(stats.lowDangerDefenseWins >= 1, `expected at least one low-danger defense win, got ${JSON.stringify(stats)}`);
  assert(stats.lowPressureSoftFoldWins >= 1, `expected at least one low-pressure soft fold win, got ${JSON.stringify(stats)}`);
  assert(stats.protectedPushWins >= 1, `expected at least one protected push win, got ${JSON.stringify(stats)}`);
  assert(stats.riichiAccepts >= 1 && stats.riichiRejects >= 1, `expected riichi accept/reject coverage, got ${JSON.stringify(stats)}`);
  assert(stats.callAccepts >= 1 && stats.callRejects >= 1, `expected call accept/reject coverage, got ${JSON.stringify(stats)}`);

  console.log('[PASS] hard-headless-stats-smoke');
  console.log(`  stats=${JSON.stringify({
    samples: stats.samples,
    hardAdvantages: stats.hardAdvantages,
    regressions: stats.regressions,
    pressureSafetyWins: stats.pressureSafetyWins,
    noPressureEvWins: stats.noPressureEvWins,
    crossXiangtingFoldWins: stats.crossXiangtingFoldWins,
    lowDangerDefenseWins: stats.lowDangerDefenseWins,
    lowPressureSoftFoldWins: stats.lowPressureSoftFoldWins,
    protectedPushWins: stats.protectedPushWins,
    riichiAccepts: stats.riichiAccepts,
    riichiRejects: stats.riichiRejects,
    callAccepts: stats.callAccepts,
    callRejects: stats.callRejects
  })}`);
  console.log(`  cases=${JSON.stringify(stats.cases)}`);
}

if (require.main === module) {
  main();
}

module.exports = {
  buildStats
};
