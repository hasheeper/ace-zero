'use strict';

const fs = require('fs');
const path = require('path');

const { SingleRoundRuntime } = require('../engine/runtime/single-round-runtime');
const { createScriptedDrawPolicy } = require('../engine/base/draw-policy');
const createMatchStateHelpers = require('../shared/match/match-state');
const createRoundTransitionHelpers = require('../shared/match/round-transition');
const createBrowserGameSessionRuntime = require('../frontend/scripts/runtime/session/game-session-runtime');

const matchStateHelpers = createMatchStateHelpers();
const roundTransitionHelpers = createRoundTransitionHelpers();

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function createDefaultDeadWallTiles() {
  return ['m1', 'm1', 'm2', 'm2', 'm3', 'm3', 'p1', 'p1', 'p2', 'p2', 's1', 's1', 'z1', 'z1'];
}

function applyRuntimeSetup(runtime, setup = {}) {
  if (!setup || typeof setup !== 'object') return;
  const shan = runtime && runtime.board ? runtime.board.shan : null;
  if (!shan) return;

  if (Array.isArray(setup.liveWallTiles)) {
    const deadWallTiles = Array.isArray(setup.deadWallTiles) && setup.deadWallTiles.length >= 14
      ? setup.deadWallTiles.slice(0, 14)
      : createDefaultDeadWallTiles();
    shan._pai = deadWallTiles.concat(setup.liveWallTiles.slice().reverse());
  }

  if (typeof setup.weikaigang === 'boolean') {
    shan._weikaigang = setup.weikaigang;
  }
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

function runScenario(configPath) {
  const config = loadJson(configPath);
  const runtime = createRuntimeFromConfig(config);
  runtime.start();

  if (config.testing && config.testing.runtimeSetup) {
    applyRuntimeSetup(runtime, config.testing.runtimeSetup);
  }

  const actions = config.testing && Array.isArray(config.testing.fastForwardActions)
    ? config.testing.fastForwardActions
    : [];
  actions.forEach((action) => runtime.dispatch(action));

  return {
    config,
    runtime,
    snapshot: runtime.getSnapshot()
  };
}

function expectEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
  }
}

function expectOneOf(actual, expectedValues, message) {
  if (!Array.isArray(expectedValues) || !expectedValues.includes(actual)) {
    throw new Error(`${message}: expected one of ${JSON.stringify(expectedValues)} but got ${JSON.stringify(actual)}`);
  }
}

function expectDeepValue(object, pathParts, expected, message) {
  let current = object;
  pathParts.forEach((part) => {
    current = current == null ? current : current[part];
  });
  expectEqual(current, expected, message);
}

function createMatchStateFromConfig(config, overrides = {}) {
  return matchStateHelpers.createInitialMatchState({
    ruleset: config.ruleset || 'riichi-4p',
    targetScore: Number.isFinite(Number(config.targetScore)) ? Number(config.targetScore) : undefined,
    qijia: config.round && Number.isInteger(config.round.qijia) ? config.round.qijia : 0,
    dealerSeat: overrides.dealerSeat,
    zhuangfeng: config.round && Number.isInteger(config.round.zhuangfeng) ? config.round.zhuangfeng : 0,
    jushu: config.round && Number.isInteger(config.round.jushu) ? config.round.jushu : 0,
    changbang: config.round && Number.isInteger(config.round.changbang) ? config.round.changbang : 0,
    lizhibang: config.round && Number.isInteger(config.round.lizhibang) ? config.round.lizhibang : 0,
    scores: {
      bottom: 25000,
      right: 25000,
      top: 25000,
      left: 25000
    },
    ruleConfig: config.ruleOverrides || {}
  });
}

function createChildRuntimeFactory(baseConfig) {
  let childCount = 0;
  return function createChildRuntime(runtimeConfig) {
    const runtime = createRuntimeFromConfig(runtimeConfig);
    if (childCount === 0 && baseConfig.testing && baseConfig.testing.runtimeSetup) {
      const originalStart = runtime.start.bind(runtime);
      runtime.start = function patchedStart() {
        const result = originalStart();
        applyRuntimeSetup(runtime, baseConfig.testing.runtimeSetup);
        return result;
      };
    }
    childCount += 1;
    return runtime;
  };
}

async function runSessionScenario(configPath) {
  const config = loadJson(configPath);
  const sessionRuntime = createBrowserGameSessionRuntime({
    config,
    createChildRuntime: createChildRuntimeFactory(config)
  });
  await sessionRuntime.startSession();

  const actions = config.testing && Array.isArray(config.testing.fastForwardActions)
    ? config.testing.fastForwardActions
    : [];
  actions.forEach((action) => sessionRuntime.dispatch(action));

  const pendingRoundResult = sessionRuntime.getRoundResult();
  await sessionRuntime.continueToNextRound();

  return {
    pendingRoundResult,
    matchState: sessionRuntime.getMatchState(),
    currentRuntime: sessionRuntime.getRuntime()
  };
}

async function main() {
  const root = path.resolve(__dirname, '..');
  const cases = [];

  const initialShiftedDealerState = matchStateHelpers.createInitialMatchState({
    qijia: 0,
    jushu: 1,
    scores: {
      bottom: 25000,
      right: 25000,
      top: 25000,
      left: 25000
    }
  });
  expectDeepValue(initialShiftedDealerState, ['dealerSeat'], 'right', 'initial shifted dealerSeat from jushu');
  cases.push('initial shifted dealer seat');

  const sessionDealerRon = await runSessionScenario(path.join(root, 'test', 'game-config.p3-houtei-ron.json'));
  expectDeepValue(sessionDealerRon.matchState, ['dealerSeat'], 'bottom', 'session dealer ron dealerSeat');
  expectDeepValue(sessionDealerRon.matchState, ['zhuangfeng'], 0, 'session dealer ron zhuangfeng');
  expectDeepValue(sessionDealerRon.matchState, ['jushu'], 0, 'session dealer ron jushu');
  expectDeepValue(sessionDealerRon.matchState, ['changbang'], 1, 'session dealer ron changbang');
  expectOneOf(sessionDealerRon.matchState && sessionDealerRon.matchState.scores
    ? sessionDealerRon.matchState.scores.bottom
    : null, [37000, 43000], 'session dealer ron bottom score');
  expectDeepValue(sessionDealerRon.currentRuntime, ['roundConfig', 'changbang'], 1, 'session dealer ron next round changbang');
  cases.push('session dealer ron continue');

  const sessionExhaustiveDraw = await runSessionScenario(path.join(root, 'test', 'game-config.p3-exhaustive-draw.json'));
  expectDeepValue(sessionExhaustiveDraw.matchState, ['jushu'], 0, 'session exhaustive draw jushu');
  expectDeepValue(sessionExhaustiveDraw.matchState, ['changbang'], 1, 'session exhaustive draw changbang');
  expectDeepValue(sessionExhaustiveDraw.currentRuntime, ['roundConfig', 'changbang'], 1, 'session exhaustive draw next round changbang');
  cases.push('session exhaustive draw continue');

  const sessionFourRiichi = await runSessionScenario(path.join(root, 'test', 'game-config.p5-four-riichi.json'));
  expectDeepValue(sessionFourRiichi.matchState, ['lizhibang'], 4, 'session four riichi lizhibang');
  expectDeepValue(sessionFourRiichi.matchState, ['changbang'], 1, 'session four riichi changbang');
  expectDeepValue(sessionFourRiichi.matchState, ['jushu'], 0, 'session four riichi jushu');
  expectDeepValue(sessionFourRiichi.currentRuntime, ['roundConfig', 'lizhibang'], 4, 'session four riichi next round lizhibang');
  expectDeepValue(sessionFourRiichi.currentRuntime, ['roundConfig', 'changbang'], 1, 'session four riichi next round changbang');
  cases.push('session four riichi continue');

  const sessionFinishedScenario = await runSessionScenario(path.join(root, 'test', 'game-config.browser-smoke-session-finished.json'));
  expectDeepValue(sessionFinishedScenario.matchState, ['dealerSeat'], 'right', 'session finished dealerSeat');
  expectDeepValue(sessionFinishedScenario.matchState, ['finished'], true, 'session finished flag');
  expectDeepValue(sessionFinishedScenario.matchState, ['finishReason'], 'single-round-complete', 'session finishReason');
  expectDeepValue(sessionFinishedScenario.matchState, ['jushu'], 1, 'session finished next jushu');
  cases.push('session finished');

  const dealerRonScenario = runScenario(path.join(root, 'test', 'game-config.p3-houtei-ron.json'));
  const dealerRonDecision = roundTransitionHelpers.resolveRoundTransition(
    createMatchStateFromConfig(dealerRonScenario.config),
    dealerRonScenario.snapshot.roundResult
  );
  expectEqual(dealerRonDecision.transitionCase, 'hule:dealer-win', 'dealer ron transitionCase');
  expectEqual(dealerRonDecision.dealerContinues, true, 'dealer ron dealerContinues');
  expectEqual(dealerRonDecision.nextJushu, 0, 'dealer ron nextJushu');
  expectEqual(dealerRonDecision.changbangAfter, 1, 'dealer ron changbangAfter');
  cases.push('dealer ron');

  const nonDealerWinDecision = roundTransitionHelpers.resolveRoundTransition(
    createMatchStateFromConfig(dealerRonScenario.config, { dealerSeat: 'left' }),
    dealerRonScenario.snapshot.roundResult
  );
  expectEqual(nonDealerWinDecision.transitionCase, 'hule:nondealer-win', 'nondealer ron transitionCase');
  expectEqual(nonDealerWinDecision.dealerContinues, false, 'nondealer ron dealerContinues');
  expectEqual(nonDealerWinDecision.nextJushu, 1, 'nondealer ron nextJushu');
  expectEqual(nonDealerWinDecision.nextDealerSeat, 'bottom', 'nondealer ron nextDealerSeat');
  cases.push('nondealer ron');

  const exhaustiveDrawScenario = runScenario(path.join(root, 'test', 'game-config.p3-exhaustive-draw.json'));
  expectDeepValue(exhaustiveDrawScenario.snapshot, ['roundResult', 'fenpei', 0], 3000, 'exhaustive draw bottom fenpei');
  expectDeepValue(exhaustiveDrawScenario.snapshot, ['roundResult', 'fenpei', 1], -1000, 'exhaustive draw right fenpei');
  expectDeepValue(exhaustiveDrawScenario.snapshot, ['roundResult', 'fenpei', 2], -1000, 'exhaustive draw top fenpei');
  expectDeepValue(exhaustiveDrawScenario.snapshot, ['roundResult', 'fenpei', 3], -1000, 'exhaustive draw left fenpei');
  const exhaustiveDrawDecision = roundTransitionHelpers.resolveRoundTransition(
    createMatchStateFromConfig(exhaustiveDrawScenario.config),
    exhaustiveDrawScenario.snapshot.roundResult
  );
  expectEqual(exhaustiveDrawDecision.transitionCase, 'draw:exhaustive:ryukyoku', 'exhaustive draw transitionCase');
  expectEqual(exhaustiveDrawDecision.dealerContinues, true, 'exhaustive draw dealerContinues');
  expectEqual(exhaustiveDrawDecision.noGame, false, 'exhaustive draw noGame');
  expectEqual(exhaustiveDrawDecision.changbangAfter, 1, 'exhaustive draw changbangAfter');
  expectEqual(exhaustiveDrawDecision.lizhibangAfter, 0, 'exhaustive draw lizhibangAfter');
  cases.push('exhaustive draw');

  const fourRiichiScenario = runScenario(path.join(root, 'test', 'game-config.p5-four-riichi.json'));
  const fourRiichiDecision = roundTransitionHelpers.resolveRoundTransition(
    createMatchStateFromConfig(fourRiichiScenario.config),
    fourRiichiScenario.snapshot.roundResult
  );
  expectEqual(fourRiichiDecision.transitionCase, 'draw:abortive:four-riichi', 'four riichi transitionCase');
  expectEqual(fourRiichiDecision.dealerContinues, true, 'four riichi dealerContinues');
  expectEqual(fourRiichiDecision.noGame, true, 'four riichi noGame');
  expectEqual(fourRiichiDecision.changbangAfter, 1, 'four riichi changbangAfter');
  expectEqual(fourRiichiDecision.lizhibangAfter, 4, 'four riichi lizhibangAfter');
  cases.push('four riichi');

  const nineKindsScenario = runScenario(path.join(root, 'test', 'game-config.p3-nine-kinds.json'));
  const nineKindsDecision = roundTransitionHelpers.resolveRoundTransition(
    createMatchStateFromConfig(nineKindsScenario.config),
    nineKindsScenario.snapshot.roundResult
  );
  expectEqual(nineKindsDecision.transitionCase, 'draw:abortive:nine-kinds', 'nine kinds transitionCase');
  expectEqual(nineKindsDecision.noGame, true, 'nine kinds noGame');
  expectEqual(nineKindsDecision.dealerContinues, true, 'nine kinds dealerContinues');
  cases.push('nine kinds');

  const fourWindsScenario = runScenario(path.join(root, 'test', 'game-config.p5-four-wind.json'));
  const fourWindsDecision = roundTransitionHelpers.resolveRoundTransition(
    createMatchStateFromConfig(fourWindsScenario.config),
    fourWindsScenario.snapshot.roundResult
  );
  expectEqual(fourWindsDecision.transitionCase, 'draw:abortive:four-winds', 'four winds transitionCase');
  expectEqual(fourWindsDecision.noGame, true, 'four winds noGame');
  expectEqual(fourWindsDecision.dealerContinues, true, 'four winds dealerContinues');
  cases.push('four winds');

  const fourKanScenario = runScenario(path.join(root, 'test', 'game-config.p5-four-kan-draw.json'));
  const fourKanDecision = roundTransitionHelpers.resolveRoundTransition(
    createMatchStateFromConfig(fourKanScenario.config),
    fourKanScenario.snapshot.roundResult
  );
  expectEqual(fourKanDecision.transitionCase, 'draw:abortive:four-kan', 'four kan transitionCase');
  expectEqual(fourKanDecision.noGame, true, 'four kan noGame');
  expectEqual(fourKanDecision.dealerContinues, true, 'four kan dealerContinues');
  cases.push('four kan');

  const tripleRonScenario = runScenario(path.join(root, 'test', 'game-config.p5-triple-ron.json'));
  const tripleRonDecision = roundTransitionHelpers.resolveRoundTransition(
    createMatchStateFromConfig(tripleRonScenario.config),
    tripleRonScenario.snapshot.roundResult
  );
  expectEqual(tripleRonDecision.transitionCase, 'draw:abortive:triple-ron', 'triple ron transitionCase');
  expectEqual(tripleRonDecision.noGame, true, 'triple ron noGame');
  expectEqual(tripleRonDecision.dealerContinues, true, 'triple ron dealerContinues');
  cases.push('triple ron');

  console.log(`[PASS] match/session regression cases=${cases.length}`);
  cases.forEach((name) => console.log(`  - ${name}`));
}

main().catch((error) => {
  console.error('[FAIL] validate-match-session-regression');
  console.error(`  - ${error && error.stack ? error.stack : String(error)}`);
  process.exitCode = 1;
});
