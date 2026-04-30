'use strict';

const fs = require('fs');
const path = require('path');

const createBrowserGameSessionRuntime = require('../frontend/scripts/runtime/session/game-session-runtime');
const createRoundTransitionHelpers = require('../shared/match/round-transition');

const roundTransitionHelpers = createRoundTransitionHelpers();

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function createStubChildRuntime() {
  return {
    start() {},
    startSession() {},
    getSnapshot() { return null; },
    subscribe() { return () => {}; }
  };
}

function validateConfiguredTargetScoreAndWestEntry() {
  const configPath = path.resolve(__dirname, '../test/game-config.p4-west-entry-target35000.json');
  const config = loadJson(configPath);

  const sessionRuntime = createBrowserGameSessionRuntime({
    config,
    createChildRuntime: () => createStubChildRuntime()
  });
  const matchState = sessionRuntime.getMatchState();

  assert(matchState.targetScore === 35000, `Expected targetScore=35000 from JSON, got ${matchState.targetScore}.`);
  assert(matchState.zhuangfeng === 1 && matchState.jushu === 3, `Expected South 4 start, got zhuangfeng=${matchState.zhuangfeng} jushu=${matchState.jushu}.`);

  const roundResult = {
    type: 'hule',
    winnerSeat: 'bottom',
    fromSeat: 'right',
    scores: {
      bottom: 34000,
      right: 18000,
      top: 31000,
      left: 17000
    }
  };

  const decision = roundTransitionHelpers.resolveRoundTransition(matchState, roundResult);

  assert(decision.gameFinished === false, 'Expected game to continue because nobody reached targetScore.');
  assert(decision.nextZhuangfeng === 2, `Expected west entry next zhuangfeng=2, got ${decision.nextZhuangfeng}.`);
  assert(decision.nextJushu === 0, `Expected west entry next jushu=0, got ${decision.nextJushu}.`);
  assert(decision.finishReason == null, `Expected finishReason=null before west entry, got ${decision.finishReason}.`);

  console.log('[PASS] configured-target-score-west-entry');
  console.log(`  targetScore=${matchState.targetScore} nextWind=${decision.nextZhuangfeng} nextJushu=${decision.nextJushu}`);
}

function validateDefaultTargetWouldFinish() {
  const configPath = path.resolve(__dirname, '../test/game-config.p4-west-entry-target35000.json');
  const config = loadJson(configPath);
  delete config.targetScore;

  const sessionRuntime = createBrowserGameSessionRuntime({
    config,
    createChildRuntime: () => createStubChildRuntime()
  });
  const matchState = sessionRuntime.getMatchState();

  const roundResult = {
    type: 'hule',
    winnerSeat: 'bottom',
    fromSeat: 'right',
    scores: {
      bottom: 34000,
      right: 18000,
      top: 31000,
      left: 17000
    }
  };

  const decision = roundTransitionHelpers.resolveRoundTransition(matchState, roundResult);

  assert(matchState.targetScore === 30000, `Expected default targetScore=30000, got ${matchState.targetScore}.`);
  assert(decision.gameFinished === true, 'Expected game to finish when default targetScore is reached.');
  assert(decision.finishReason === 'leader-over-target', `Expected finishReason=leader-over-target, got ${decision.finishReason}.`);

  console.log('[PASS] default-target-score-finishes');
  console.log(`  targetScore=${matchState.targetScore} finishReason=${decision.finishReason}`);
}

function main() {
  validateConfiguredTargetScoreAndWestEntry();
  validateDefaultTargetWouldFinish();
}

main();
