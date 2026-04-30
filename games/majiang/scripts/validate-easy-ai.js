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

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
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
      runtime.passReaction(seatKey, { reason: 'validate-easy-ai-pass' });
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

function runCurrentTurnSmoke(cwd) {
  const configPath = path.join(cwd, 'game-config.json');
  const config = loadJson(configPath);
  const runtime = createRuntimeFromConfig(config);
  const aiController = createAiController(runtime, config);

  fastForwardToRightFirstDiscard(runtime);

  const decision = aiController.chooseDiscard('right');
  assert(decision && typeof decision.tileCode === 'string', 'expected easy AI to produce a discard decision on right seat turn');
  assert(decision.seatKey === 'right', `expected decision seat to be right, got ${decision && decision.seatKey}`);
  assert(Number.isInteger(decision.tileIndex), 'expected discard decision to include tileIndex');

  return {
    name: 'easy-ai-current-turn-smoke',
    snapshot: {
      phase: runtime.stateMachine && typeof runtime.stateMachine.getPhase === 'function'
        ? runtime.stateMachine.getPhase()
        : runtime.phase,
      turnSeat: typeof runtime.getCurrentTurnSeat === 'function'
        ? runtime.getCurrentTurnSeat()
        : runtime.turnSeat,
      tileCode: decision.tileCode,
      tileIndex: decision.tileIndex,
      shouldRiichi: Boolean(decision.shouldRiichi),
      metrics: decision.metrics || null
    }
  };
}

function runRiichiSmoke(cwd) {
  const configPath = path.join(cwd, 'test', 'game-config.ai-easy-riichi-smoke.json');
  const config = loadJson(configPath);
  const runtime = createRuntimeFromConfig(config);
  const aiController = createAiController(runtime, config);

  fastForwardToRightFirstDiscard(runtime);

  const decision = aiController.chooseDiscard('right');
  assert(decision && typeof decision.tileCode === 'string', 'expected riichi smoke to produce a discard decision');
  assert(decision.shouldRiichi === true, `expected easy AI riichi smoke to declare riichi, got ${JSON.stringify(decision)}`);

  runtime.discardTile('right', decision.tileCode, { riichi: true });

  const rightSeatIndex = runtime.getSeatIndex('right');
  const rightRiichiState = runtime.riichiState && runtime.riichiState.right
    ? runtime.riichiState.right
    : null;
  const rightRiver = runtime.board && runtime.board.he && runtime.board.he[rightSeatIndex]
    ? runtime.board.he[rightSeatIndex]._pai || []
    : [];

  assert(rightRiichiState && rightRiichiState.declared === true, 'expected right seat riichi state to be declared after discard');
  assert(rightRiver.some((code) => /\*$/.test(String(code || ''))), `expected riichi river mark in right river, got ${JSON.stringify(rightRiver)}`);

  return {
    name: 'easy-ai-riichi-smoke',
    snapshot: {
      phase: runtime.stateMachine && typeof runtime.stateMachine.getPhase === 'function'
        ? runtime.stateMachine.getPhase()
        : runtime.phase,
      turnSeat: typeof runtime.getCurrentTurnSeat === 'function'
        ? runtime.getCurrentTurnSeat()
        : runtime.turnSeat,
      tileCode: decision.tileCode,
      shouldRiichi: true,
      riichiState: {
        declared: rightRiichiState.declared,
        ippatsuPending: Boolean(rightRiichiState.ippatsuPending),
        doubleRiichi: Boolean(rightRiichiState.doubleRiichi)
      },
      river: rightRiver
    }
  };
}

function runUkeireSmoke(cwd) {
  const configPath = path.join(cwd, 'test', 'game-config.ai-easy-ukeire-smoke.json');
  const config = loadJson(configPath);
  const runtime = createRuntimeFromConfig(config);
  const aiController = createAiController(runtime, config);

  fastForwardToRightFirstDiscard(runtime);

  const decision = aiController.chooseDiscard('right');
  assert(decision && typeof decision.tileCode === 'string', 'expected ukeire smoke to produce a discard decision');
  assert(decision.tileCode === 's2', `expected easy AI to prefer s2 by ukeire tiebreak, got ${JSON.stringify(decision)}`);
  assert(decision.metrics && decision.metrics.ukeireCount === 13, `expected chosen discard to retain ukeireCount 13, got ${JSON.stringify(decision && decision.metrics)}`);

  return {
    name: 'easy-ai-ukeire-smoke',
    snapshot: {
      phase: runtime.stateMachine && typeof runtime.stateMachine.getPhase === 'function'
        ? runtime.stateMachine.getPhase()
        : runtime.phase,
      turnSeat: typeof runtime.getCurrentTurnSeat === 'function'
        ? runtime.getCurrentTurnSeat()
        : runtime.turnSeat,
      tileCode: decision.tileCode,
      tileIndex: decision.tileIndex,
      metrics: decision.metrics || null
    }
  };
}

function runDefenseSmoke(cwd) {
  const configPath = path.join(cwd, 'test', 'game-config.ai-easy-defense-smoke.json');
  const config = loadJson(configPath);
  const runtime = createRuntimeFromConfig(config);
  const aiController = createAiController(runtime, config);

  fastForwardToRightFirstDiscard(runtime);

  const topSeatIndex = runtime.getSeatIndex('top');
  runtime.riichiState.top.declared = true;
  runtime.riichiState.top.ippatsuPending = true;
  runtime.board.he[topSeatIndex]._pai = ['z3*'];

  const decision = aiController.chooseDiscard('right');
  assert(decision && typeof decision.tileCode === 'string', 'expected defense smoke to produce a discard decision');
  assert(decision.tileCode === 'z3', `expected easy AI to prefer safe genbutsu z3 under riichi pressure, got ${JSON.stringify(decision)}`);
  assert(decision.danger && decision.danger.dangerScore === 0, `expected chosen defense tile to be fully safe, got ${JSON.stringify(decision.danger)}`);

  return {
    name: 'easy-ai-defense-smoke',
    snapshot: {
      phase: runtime.stateMachine && typeof runtime.stateMachine.getPhase === 'function'
        ? runtime.stateMachine.getPhase()
        : runtime.phase,
      turnSeat: typeof runtime.getCurrentTurnSeat === 'function'
        ? runtime.getCurrentTurnSeat()
        : runtime.turnSeat,
      tileCode: decision.tileCode,
      tileIndex: decision.tileIndex,
      danger: decision.danger || null,
      pushFoldState: decision.pushFoldState || null,
      metrics: decision.metrics || null
    }
  };
}

function runShapeSmoke(cwd) {
  const configPath = path.join(cwd, 'test', 'game-config.ai-easy-shape-smoke.json');
  const config = loadJson(configPath);
  const runtime = createRuntimeFromConfig(config);
  const aiController = createAiController(runtime, config);

  fastForwardToRightFirstDiscard(runtime);

  const decision = aiController.chooseDiscard('right');
  assert(decision && typeof decision.tileCode === 'string', 'expected shape smoke to produce a discard decision');
  assert(String(decision.tileCode).replace(/_$/g, '') === 'z3', `expected easy AI to drop isolated honor z3 by shape preference, got ${JSON.stringify(decision)}`);
  assert(decision.metrics && decision.metrics.handValueEstimate === 33, `expected chosen shape score 33, got ${JSON.stringify(decision && decision.metrics)}`);

  return {
    name: 'easy-ai-shape-smoke',
    snapshot: {
      phase: runtime.stateMachine && typeof runtime.stateMachine.getPhase === 'function'
        ? runtime.stateMachine.getPhase()
        : runtime.phase,
      turnSeat: typeof runtime.getCurrentTurnSeat === 'function'
        ? runtime.getCurrentTurnSeat()
        : runtime.turnSeat,
      tileCode: decision.tileCode,
      tileIndex: decision.tileIndex,
      metrics: decision.metrics || null
    }
  };
}

function runCallSmoke(cwd) {
  const configPath = path.join(cwd, 'test', 'game-config.ai-easy-call-smoke.json');
  const config = loadJson(configPath);
  const runtime = createRuntimeFromConfig(config);
  const aiController = createAiController(runtime, config);

  runtime.start();
  runtime.drawTile('bottom');
  runtime.discardTile('bottom', 'm4');

  assert(runtime.pendingReaction && Array.isArray(runtime.pendingReaction.actions), 'expected pending reaction window after bottom discard');

  const rightActions = runtime.pendingReaction.actions.filter((action) => (
    action
    && action.payload
    && action.payload.seat === 'right'
  ));
  assert(rightActions.length > 0, 'expected right seat to have reaction actions in call smoke');

  const decision = aiController.chooseReaction('right', rightActions);
  assert(decision && decision.type === 'call', `expected easy AI to choose a call reaction, got ${JSON.stringify(decision)}`);
  assert(decision.payload && decision.payload.callType === 'chi', `expected easy AI to choose chi, got ${JSON.stringify(decision)}`);
  assert(decision.payload && decision.payload.meldString === 'm234-', `expected easy AI to choose m234- chi, got ${JSON.stringify(decision)}`);

  return {
    name: 'easy-ai-call-smoke',
    snapshot: {
      availableActions: rightActions.map((action) => ({
        key: action.key,
        type: action.type,
        callType: action.payload && action.payload.callType ? action.payload.callType : null,
        meldString: action.payload && action.payload.meldString ? action.payload.meldString : null
      })),
      chosenAction: {
        key: decision.key,
        type: decision.type,
        callType: decision.payload && decision.payload.callType ? decision.payload.callType : null,
        meldString: decision.payload && decision.payload.meldString ? decision.payload.meldString : null
      }
    }
  };
}

function runYakuhaiCallSmoke(cwd) {
  const configPath = path.join(cwd, 'test', 'game-config.ai-easy-yakuhai-call-smoke.json');
  const config = loadJson(configPath);
  const runtime = createRuntimeFromConfig(config);
  const aiController = createAiController(runtime, config);

  runtime.start();
  runtime.drawTile('bottom');
  runtime.discardTile('bottom', 'z7');

  assert(runtime.pendingReaction && Array.isArray(runtime.pendingReaction.actions), 'expected pending reaction window after yakuhai discard');

  const rightActions = runtime.pendingReaction.actions.filter((action) => (
    action
    && action.payload
    && action.payload.seat === 'right'
  ));
  assert(rightActions.length > 0, 'expected right seat to have reaction actions in yakuhai call smoke');

  const decision = aiController.chooseReaction('right', rightActions);
  assert(decision && decision.type === 'call', `expected easy AI to choose yakuhai call reaction, got ${JSON.stringify(decision)}`);
  assert(decision.payload && decision.payload.callType === 'peng', `expected easy AI to choose peng for yakuhai, got ${JSON.stringify(decision)}`);
  assert(
    decision.payload
      && typeof decision.payload.meldString === 'string'
      && /^z777[\+\=\-]$/.test(decision.payload.meldString),
    `expected easy AI to choose z777 peng, got ${JSON.stringify(decision)}`
  );

  return {
    name: 'easy-ai-yakuhai-call-smoke',
    snapshot: {
      availableActions: rightActions.map((action) => ({
        key: action.key,
        type: action.type,
        callType: action.payload && action.payload.callType ? action.payload.callType : null,
        meldString: action.payload && action.payload.meldString ? action.payload.meldString : null,
        tileCode: action.payload && action.payload.tileCode ? action.payload.tileCode : null
      })),
      chosenAction: {
        key: decision.key,
        type: decision.type,
        callType: decision.payload && decision.payload.callType ? decision.payload.callType : null,
        meldString: decision.payload && decision.payload.meldString ? decision.payload.meldString : null
      }
    }
  };
}

function runSpeedupCallSmoke(cwd) {
  const configPath = path.join(cwd, 'test', 'game-config.ai-easy-speedup-call-smoke.json');
  const config = loadJson(configPath);
  const runtime = createRuntimeFromConfig(config);
  const aiController = createAiController(runtime, config);

  runtime.start();
  runtime.drawTile('bottom');
  runtime.discardTile('bottom', 'm4');

  assert(runtime.pendingReaction && Array.isArray(runtime.pendingReaction.actions), 'expected pending reaction window after speed-up discard');

  const rightActions = runtime.pendingReaction.actions.filter((action) => (
    action
    && action.payload
    && action.payload.seat === 'right'
  ));
  assert(rightActions.length > 0, 'expected right seat to have reaction actions in speed-up call smoke');

  const decision = aiController.chooseReaction('right', rightActions);
  assert(decision && decision.type === 'call', `expected easy AI to choose speed-up call reaction, got ${JSON.stringify(decision)}`);
  assert(decision.payload && decision.payload.callType === 'chi', `expected easy AI to choose chi for speed-up, got ${JSON.stringify(decision)}`);
  assert(decision.payload && decision.payload.meldString === 'm4-56', `expected easy AI to choose m4-56 chi, got ${JSON.stringify(decision)}`);

  return {
    name: 'easy-ai-speedup-call-smoke',
    snapshot: {
      availableActions: rightActions.map((action) => ({
        key: action.key,
        type: action.type,
        callType: action.payload && action.payload.callType ? action.payload.callType : null,
        meldString: action.payload && action.payload.meldString ? action.payload.meldString : null,
        tileCode: action.payload && action.payload.tileCode ? action.payload.tileCode : null
      })),
      chosenAction: {
        key: decision.key,
        type: decision.type,
        callType: decision.payload && decision.payload.callType ? decision.payload.callType : null,
        meldString: decision.payload && decision.payload.meldString ? decision.payload.meldString : null
      }
    }
  };
}

function main() {
  const cwd = path.resolve(__dirname, '..');
  const results = [
    runCurrentTurnSmoke(cwd),
    runRiichiSmoke(cwd),
    runUkeireSmoke(cwd),
    runDefenseSmoke(cwd),
    runShapeSmoke(cwd),
    runCallSmoke(cwd),
    runYakuhaiCallSmoke(cwd),
    runSpeedupCallSmoke(cwd)
  ];

  results.forEach((result) => {
    console.log(`[PASS] ${result.name}`);
    console.log(`  snapshot=${JSON.stringify(result.snapshot)}`);
  });
}

main();
