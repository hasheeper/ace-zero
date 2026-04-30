'use strict';

const createBrowserGameSessionRuntime = require('../frontend/scripts/runtime/session/game-session-runtime');
const createRoundTransitionHelpers = require('../shared/match/round-transition');
const { normalizeFriendlyRuleConfig } = require('../engine/base/ruleset-profile');

const roundTransitionHelpers = createRoundTransitionHelpers();

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function createStubChildRuntime() {
  return {
    start() {},
    startSession() {},
    getSnapshot() { return null; },
    subscribe() { return () => {}; }
  };
}

function validateBankruptcyEndsGameMapping() {
  const enabledConfig = {
    mode: 'match',
    ruleset: 'riichi-4p',
    tableSize: 4,
    rules: {
      bankruptcyEndsGame: true
    }
  };
  const enabledSession = createBrowserGameSessionRuntime({
    config: enabledConfig,
    createChildRuntime: () => createStubChildRuntime()
  });
  const enabledState = enabledSession.getMatchState();
  assert(enabledState.ruleConfig['トビ終了あり'] === true, 'Expected bankruptcyEndsGame=true to map to トビ終了あり=true.');
  const finishDecision = roundTransitionHelpers.resolveRoundTransition(enabledState, {
    type: 'hule',
    winnerSeat: 'bottom',
    fromSeat: 'right',
    scores: {
      bottom: 26000,
      right: -1000,
      top: 25000,
      left: 25000
    }
  });
  assert(finishDecision.gameFinished === true, 'Expected negative score to finish the match when bankruptcyEndsGame=true.');

  const disabledConfig = {
    ...enabledConfig,
    rules: {
      bankruptcyEndsGame: false
    }
  };
  const disabledSession = createBrowserGameSessionRuntime({
    config: disabledConfig,
    createChildRuntime: () => createStubChildRuntime()
  });
  const disabledState = disabledSession.getMatchState();
  assert(disabledState.ruleConfig['トビ終了あり'] === false, 'Expected bankruptcyEndsGame=false to map to トビ終了あり=false.');
  const continueDecision = roundTransitionHelpers.resolveRoundTransition(disabledState, {
    type: 'hule',
    winnerSeat: 'bottom',
    fromSeat: 'right',
    scores: {
      bottom: 26000,
      right: -1000,
      top: 25000,
      left: 25000
    }
  });
  assert(continueDecision.gameFinished === false, 'Expected negative score not to finish the match when bankruptcyEndsGame=false.');

  console.log('[PASS] friendly-bankruptcy-ends-game');
  console.log(`  enabledFinish=${finishDecision.gameFinished} disabledFinish=${continueDecision.gameFinished}`);
}

function validateAkaDoraDistribution() {
  const fourPlayer = normalizeFriendlyRuleConfig({
    ruleset: 'riichi-4p',
    tableSize: 4,
    rules: {
      akaDora: { enabled: true, count: 12 }
    }
  });
  assert(JSON.stringify(fourPlayer.ruleOverrides['赤牌']) === JSON.stringify({ m: 4, p: 4, s: 4 }), 'Expected 4p akaDora count=12 to distribute as 4/4/4.');

  const threePlayer = normalizeFriendlyRuleConfig({
    ruleset: 'riichi-3p-sanma',
    tableSize: 3,
    rules: {
      akaDora: { enabled: true, count: 2 }
    }
  });
  assert(JSON.stringify(threePlayer.ruleOverrides['赤牌']) === JSON.stringify({ m: 0, p: 1, s: 1 }), 'Expected 3p akaDora count=2 to distribute as 0/1/1.');

  const twoPlayer = normalizeFriendlyRuleConfig({
    ruleset: 'riichi-2p-pinzu-honor',
    tableSize: 2,
    rules: {
      akaDora: { enabled: true, count: 4 }
    }
  });
  assert(JSON.stringify(twoPlayer.ruleOverrides['赤牌']) === JSON.stringify({ m: 0, p: 4, s: 0 }), 'Expected 2p akaDora count=4 to distribute as 0/4/0.');

  const disabled = normalizeFriendlyRuleConfig({
    ruleset: 'riichi-4p',
    tableSize: 4,
    rules: {
      akaDora: { enabled: false }
    }
  });
  assert(JSON.stringify(disabled.ruleOverrides['赤牌']) === JSON.stringify({ m: 0, p: 0, s: 0 }), 'Expected akaDora disabled to zero out 赤牌.');

  let threwRange = false;
  try {
    normalizeFriendlyRuleConfig({
      ruleset: 'riichi-2p-pinzu-honor',
      tableSize: 2,
      rules: {
        akaDora: { enabled: true, count: 5 }
      }
    });
  } catch (error) {
    threwRange = error instanceof RangeError;
  }
  assert(threwRange, 'Expected invalid 2p akaDora count to throw RangeError.');

  console.log('[PASS] friendly-aka-dora-distribution');
  console.log(`  fourPlayer=${JSON.stringify(fourPlayer.ruleOverrides['赤牌'])} threePlayer=${JSON.stringify(threePlayer.ruleOverrides['赤牌'])} twoPlayer=${JSON.stringify(twoPlayer.ruleOverrides['赤牌'])}`);
}

function main() {
  validateBankruptcyEndsGameMapping();
  validateAkaDoraDistribution();
}

main();
