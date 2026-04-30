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

function getSeatMelds(runtime, seatKey) {
  const seatIndex = runtime.getSeatIndex(seatKey);
  const shoupai = runtime.board && runtime.board.shoupai
    ? runtime.board.shoupai[seatIndex]
    : null;
  const melds = shoupai && Array.isArray(shoupai._fulou)
    ? shoupai._fulou.slice()
    : [];
  return melds;
}

function getReactionActionsForSeat(runtime, seatKey) {
  return runtime && runtime.pendingReaction && Array.isArray(runtime.pendingReaction.actions)
    ? runtime.pendingReaction.actions.filter((action) => (
        action
        && action.payload
        && action.payload.seat === seatKey
      ))
    : [];
}

function runChiExecutionSmoke(cwd) {
  const configPath = path.join(cwd, 'test', 'game-config.ai-easy-call-smoke.json');
  const config = loadJson(configPath);
  const runtime = createRuntimeFromConfig(config);
  const aiController = createAiController(runtime, config);

  runtime.start();
  runtime.drawTile('bottom');
  runtime.discardTile('bottom', 'm4');

  const rightActions = getReactionActionsForSeat(runtime, 'right');
  assert(rightActions.length > 0, 'expected right seat to have reaction actions in chi execution smoke');

  const decision = aiController.chooseReaction('right', rightActions);
  assert(decision && decision.type === 'call', `expected easy AI to choose chi call, got ${JSON.stringify(decision)}`);
  assert(decision.payload && decision.payload.callType === 'chi', `expected chi call, got ${JSON.stringify(decision)}`);
  assert(decision.payload && decision.payload.meldString === 'm234-', `expected m234- chi, got ${JSON.stringify(decision)}`);

  runtime.dispatch(decision);

  const melds = getSeatMelds(runtime, 'right');
  assert(melds.includes('m234-'), `expected right seat meld list to contain m234-, got ${JSON.stringify(melds)}`);
  assert(runtime.getCurrentTurnSeat() === 'right', `expected right to keep turn after chi, got ${runtime.getCurrentTurnSeat()}`);
  assert(
    runtime.stateMachine && typeof runtime.stateMachine.getPhase === 'function' && runtime.stateMachine.getPhase() === 'await_discard',
    `expected await_discard after chi, got ${runtime.stateMachine && runtime.stateMachine.getPhase ? runtime.stateMachine.getPhase() : 'unknown'}`
  );

  return {
    name: 'easy-ai-call-execution-chi-smoke',
    snapshot: {
      chosenAction: {
        key: decision.key,
        type: decision.type,
        callType: decision.payload.callType,
        meldString: decision.payload.meldString
      },
      melds,
      turnSeat: runtime.getCurrentTurnSeat(),
      phase: runtime.stateMachine.getPhase()
    }
  };
}

function runPengExecutionSmoke(cwd) {
  const configPath = path.join(cwd, 'test', 'game-config.ai-easy-yakuhai-call-smoke.json');
  const config = loadJson(configPath);
  const runtime = createRuntimeFromConfig(config);
  const aiController = createAiController(runtime, config);

  runtime.start();
  runtime.drawTile('bottom');
  runtime.discardTile('bottom', 'z7');

  const rightActions = getReactionActionsForSeat(runtime, 'right');
  assert(rightActions.length > 0, 'expected right seat to have reaction actions in peng execution smoke');

  const decision = aiController.chooseReaction('right', rightActions);
  assert(decision && decision.type === 'call', `expected easy AI to choose peng call, got ${JSON.stringify(decision)}`);
  assert(decision.payload && decision.payload.callType === 'peng', `expected peng call, got ${JSON.stringify(decision)}`);
  assert(
    decision.payload
      && typeof decision.payload.meldString === 'string'
      && /^z777[\+\=\-]$/.test(decision.payload.meldString),
    `expected z777 peng, got ${JSON.stringify(decision)}`
  );

  runtime.dispatch(decision);

  const melds = getSeatMelds(runtime, 'right');
  assert(
    melds.some((meld) => /^z777[\+\=\-]$/.test(meld)),
    `expected right seat meld list to contain z777 peng, got ${JSON.stringify(melds)}`
  );
  assert(runtime.getCurrentTurnSeat() === 'right', `expected right to keep turn after peng, got ${runtime.getCurrentTurnSeat()}`);
  assert(
    runtime.stateMachine && typeof runtime.stateMachine.getPhase === 'function' && runtime.stateMachine.getPhase() === 'await_discard',
    `expected await_discard after peng, got ${runtime.stateMachine && runtime.stateMachine.getPhase ? runtime.stateMachine.getPhase() : 'unknown'}`
  );

  return {
    name: 'easy-ai-call-execution-peng-smoke',
    snapshot: {
      chosenAction: {
        key: decision.key,
        type: decision.type,
        callType: decision.payload.callType,
        meldString: decision.payload.meldString
      },
      melds,
      turnSeat: runtime.getCurrentTurnSeat(),
      phase: runtime.stateMachine.getPhase()
    }
  };
}

function main() {
  const cwd = path.resolve(__dirname, '..');
  const results = [
    runChiExecutionSmoke(cwd),
    runPengExecutionSmoke(cwd)
  ];

  results.forEach((result) => {
    console.log(`[PASS] ${result.name}`);
    console.log(`  snapshot=${JSON.stringify(result.snapshot)}`);
  });
}

main();
