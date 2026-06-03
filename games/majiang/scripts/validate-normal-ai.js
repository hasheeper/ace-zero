'use strict';

const fs = require('fs');
const path = require('path');

const { SingleRoundRuntime } = require('../engine/runtime/single-round-runtime');
const { createScriptedDrawPolicy } = require('../engine/base/draw-policy');
const baseAiApi = require('../engine/ai/base-ai');

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
    implementedDifficulties: ['easy', 'normal'],
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
      runtime.passReaction(seatKey, { reason: 'validate-normal-ai-pass' });
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

function setRiichiPressure(runtime, opponentSeatKey, genbutsuTileCode) {
  const seatIndex = runtime.getSeatIndex(opponentSeatKey);
  assert(seatIndex >= 0, `expected valid opponent seat ${opponentSeatKey}`);
  runtime.riichiState[opponentSeatKey].declared = true;
  runtime.riichiState[opponentSeatKey].ippatsuPending = true;
  runtime.board.he[seatIndex]._pai = [`${genbutsuTileCode}*`];
}

function collectRightReactionActions(runtime) {
  assert(runtime.pendingReaction && Array.isArray(runtime.pendingReaction.actions), 'expected pending reaction window');
  return runtime.pendingReaction.actions.filter((action) => (
    action
    && action.payload
    && action.payload.seat === 'right'
  ));
}

function runCurrentTurnSmoke(cwd) {
  const config = loadJson(path.join(cwd, 'test', 'game-config.ai-normal-current-turn-smoke.json'));
  const runtime = createRuntimeFromConfig(config);
  const aiController = createAiController(runtime, config);

  fastForwardToRightFirstDiscard(runtime);

  const decision = aiController.chooseDiscard('right');
  assert(decision && typeof decision.tileCode === 'string', 'expected normal AI to produce a discard decision');
  assert(decision.difficulty === 'normal', `expected normal decision difficulty, got ${JSON.stringify(decision)}`);
  assert(decision.policyId === 'normal', `expected normal policyId, got ${JSON.stringify(decision)}`);
  assert(Number.isInteger(decision.tileIndex), 'expected normal discard decision to include tileIndex');

  return {
    name: 'normal-current-turn-smoke',
    snapshot: {
      tileCode: decision.tileCode,
      tileIndex: decision.tileIndex,
      difficulty: decision.difficulty,
      policyId: decision.policyId,
      metrics: decision.metrics || null
    }
  };
}

function runRiichiThresholdSmoke(cwd) {
  const baseConfig = loadJson(path.join(cwd, 'test', 'game-config.ai-normal-riichi-threshold-smoke.json'));
  const decisions = {};

  ['easy', 'normal'].forEach((difficulty) => {
    const config = withRightDifficulty(baseConfig, difficulty);
    const runtime = createRuntimeFromConfig(config);
    const aiController = createAiController(runtime, config);
    fastForwardToRightFirstDiscard(runtime);
    setRemainingTiles(runtime, 16);
    decisions[difficulty] = aiController.chooseDiscard('right');
  });

  assert(decisions.easy && decisions.easy.shouldRiichi === false, `expected easy to skip late riichi, got ${JSON.stringify(decisions.easy)}`);
  assert(
    decisions.easy.riichiDecision
      && Array.isArray(decisions.easy.riichiDecision.reasons)
      && decisions.easy.riichiDecision.reasons.includes('riichi-too-late'),
    `expected easy skip reason riichi-too-late, got ${JSON.stringify(decisions.easy && decisions.easy.riichiDecision)}`
  );
  assert(decisions.normal && decisions.normal.shouldRiichi === true, `expected normal to declare riichi, got ${JSON.stringify(decisions.normal)}`);
  assert(decisions.normal.difficulty === 'normal', `expected normal difficulty, got ${JSON.stringify(decisions.normal)}`);

  return {
    name: 'normal-riichi-threshold-smoke',
    snapshot: {
      easy: {
        tileCode: decisions.easy.tileCode,
        shouldRiichi: decisions.easy.shouldRiichi,
        reasons: decisions.easy.riichiDecision ? decisions.easy.riichiDecision.reasons : []
      },
      normal: {
        tileCode: decisions.normal.tileCode,
        shouldRiichi: decisions.normal.shouldRiichi,
        thresholds: decisions.normal.riichiDecision ? decisions.normal.riichiDecision.thresholds : null
      }
    }
  };
}

function runDefensePrioritySmoke(cwd) {
  const baseConfig = loadJson(path.join(cwd, 'test', 'game-config.ai-normal-defense-priority-smoke.json'));
  const decisions = {};

  ['easy', 'normal'].forEach((difficulty) => {
    const config = withRightDifficulty(baseConfig, difficulty);
    const runtime = createRuntimeFromConfig(config);
    const aiController = createAiController(runtime, config);
    fastForwardToRightFirstDiscard(runtime);
    setRiichiPressure(runtime, 'top', 'm8');
    decisions[difficulty] = aiController.chooseDiscard('right');
  });

  assert(decisions.easy && decisions.easy.tileCode === 'm1', `expected easy to keep core-value discard m1, got ${JSON.stringify(decisions.easy)}`);
  assert(decisions.normal && decisions.normal.tileCode === 'm8', `expected normal to prefer genbutsu m8, got ${JSON.stringify(decisions.normal)}`);
  assert(decisions.easy.metrics.xiangting === decisions.normal.metrics.xiangting, 'expected defense smoke to compare same-shanten choices');
  assert(Number(decisions.easy.danger && decisions.easy.danger.dangerScore) > Number(decisions.normal.danger && decisions.normal.danger.dangerScore), 'expected normal discard to be safer than easy discard');
  assert(decisions.normal.pushFoldState && decisions.normal.pushFoldState.state === 'careful', `expected careful push/fold state, got ${JSON.stringify(decisions.normal.pushFoldState)}`);

  return {
    name: 'normal-defense-priority-smoke',
    snapshot: {
      easy: {
        tileCode: decisions.easy.tileCode,
        metrics: decisions.easy.metrics,
        danger: decisions.easy.danger
      },
      normal: {
        tileCode: decisions.normal.tileCode,
        metrics: decisions.normal.metrics,
        danger: decisions.normal.danger,
        pushFoldState: decisions.normal.pushFoldState
      }
    }
  };
}

function chooseRightReaction(config, discardTileCode) {
  const runtime = createRuntimeFromConfig(config);
  const aiController = createAiController(runtime, config);
  runtime.start();
  runtime.drawTile('bottom');
  runtime.discardTile('bottom', discardTileCode);
  const rightActions = collectRightReactionActions(runtime);
  return {
    decision: aiController.chooseReaction('right', rightActions),
    rightActions
  };
}

function runCallSelectivitySmoke(cwd) {
  const rejectBaseConfig = loadJson(path.join(cwd, 'test', 'game-config.ai-normal-call-selectivity-smoke.json'));
  const easyRejectConfig = withRightDifficulty(rejectBaseConfig, 'easy');
  const normalRejectConfig = withRightDifficulty(rejectBaseConfig, 'normal');
  const easyReject = chooseRightReaction(easyRejectConfig, 'm4');
  const normalReject = chooseRightReaction(normalRejectConfig, 'm4');

  assert(easyReject.decision && easyReject.decision.type === 'call', `expected easy to accept flat speed-up call, got ${JSON.stringify(easyReject.decision)}`);
  assert(normalReject.decision == null, `expected normal to reject low-shape flat speed-up call, got ${JSON.stringify(normalReject.decision)}`);

  const acceptBaseConfig = loadJson(path.join(cwd, 'test', 'game-config.ai-easy-call-smoke.json'));
  const normalAcceptConfig = withRightDifficulty(acceptBaseConfig, 'normal');
  const normalAccept = chooseRightReaction(normalAcceptConfig, 'm4');
  assert(normalAccept.decision && normalAccept.decision.type === 'call', `expected normal to accept shanten-improving call, got ${JSON.stringify(normalAccept.decision)}`);
  assert(
    normalAccept.decision.payload && normalAccept.decision.payload.meldString === 'm234-',
    `expected normal to choose m234- call, got ${JSON.stringify(normalAccept.decision)}`
  );
  assert(
    normalAccept.decision.aiDecision
      && normalAccept.decision.aiDecision.difficulty === 'normal'
      && normalAccept.decision.aiDecision.policyId === 'normal',
    `expected normal call debug metadata, got ${JSON.stringify(normalAccept.decision)}`
  );

  return {
    name: 'normal-call-selectivity-smoke',
    snapshot: {
      rejectedFlatCall: {
        easyAction: easyReject.decision ? easyReject.decision.key : null,
        normalAction: normalReject.decision ? normalReject.decision.key : null
      },
      acceptedShantenCall: {
        key: normalAccept.decision.key,
        meldString: normalAccept.decision.payload.meldString,
        aiDecision: normalAccept.decision.aiDecision
      }
    }
  };
}

function main() {
  const cwd = path.resolve(__dirname, '..');
  const results = [
    runCurrentTurnSmoke(cwd),
    runRiichiThresholdSmoke(cwd),
    runDefensePrioritySmoke(cwd),
    runCallSelectivitySmoke(cwd)
  ];

  results.forEach((result) => {
    console.log(`[PASS] ${result.name}`);
    console.log(`  snapshot=${JSON.stringify(result.snapshot)}`);
  });
}

main();
