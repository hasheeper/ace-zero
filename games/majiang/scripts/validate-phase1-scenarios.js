'use strict';

const fs = require('fs');
const path = require('path');

const { SingleRoundRuntime } = require('../engine/runtime/single-round-runtime');
const {
  createScriptedDrawPolicy
} = require('../engine/base/draw-policy');
const {
  createShoupaiFromString
} = require('../engine/base/majiang-core-adapter');
const { compareRoundResultExpected } = require('./lib/round-result-assertions');

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

function runRiichiDeclarationRonScenario(cwd) {
  const configPath = path.join(cwd, 'test', 'game-config.p5-riichi-discard-ron.json');
  const config = loadJson(configPath);
  const runtime = createRuntimeFromConfig(config);
  runtime.start();

  const actions = config.testing && Array.isArray(config.testing.fastForwardActions)
    ? config.testing.fastForwardActions
    : [];
  actions.forEach((action) => runtime.dispatch(action));

  const snapshot = runtime.getSnapshot();
  const expected = config.testing && config.testing.expectedSnapshot
    ? config.testing.expectedSnapshot
    : {};

  return {
    name: path.basename(configPath),
    snapshot: {
      phase: snapshot.phase,
      turnSeat: snapshot.turnSeat,
      roundResult: snapshot.roundResult
    },
    errors: compareRoundResultExpected(snapshot, expected)
  };
}

function runFourthKanCandidateGatingScenario() {
  const config = loadJson(path.join(path.resolve(__dirname, '..'), 'test', 'game-config.p5-double-ron.json'));
  const runtime = createRuntimeFromConfig(config);
  runtime.start();

  runtime.board.shoupai[0] = createShoupaiFromString('m123p123s123z11');
  runtime.board.shoupai[0]._fulou = ['m1111', 'p2222', 's3333', 'z4444'];
  runtime.board.shoupai[1] = createShoupaiFromString('m999p123s123z1234');
  runtime.board.shoupai[2] = createShoupaiFromString('m123p456s789z1234');
  runtime.board.shoupai[3] = createShoupaiFromString('m456p456s456z5677');

  const candidates = runtime.buildReactionCandidates('bottom', 'm9');
  const rightKanActions = candidates.filter((action) => (
    action
    && action.type === 'kan'
    && action.payload
    && action.payload.seat === 'right'
  ));
  const rightPengActions = candidates.filter((action) => (
    action
    && action.payload
    && action.payload.seat === 'right'
    && action.payload.callType === 'peng'
  ));

  const errors = [];
  if (rightKanActions.length) {
    errors.push(`expected no right-seat kan candidate after total four kans, but got ${rightKanActions.length}`);
  }
  if (!rightPengActions.length) {
    errors.push('expected right seat to retain peng candidate as a control check, but none was found');
  }

  return {
    name: 'fourth-kan-candidate-gating',
    snapshot: {
      phase: runtime.getSnapshot().phase,
      turnSeat: runtime.getSnapshot().turnSeat,
      actionTypes: candidates.map((action) => `${action.type}:${action.payload && action.payload.seat ? action.payload.seat : '-'}`)
    },
    errors
  };
}

function main() {
  const cwd = path.resolve(__dirname, '..');
  const results = [
    runRiichiDeclarationRonScenario(cwd),
    runFourthKanCandidateGatingScenario()
  ];

  let hasFailure = false;
  results.forEach((result) => {
    if (result.errors.length) {
      hasFailure = true;
      console.error(`[FAIL] ${result.name}`);
      result.errors.forEach((error) => console.error(`  - ${error}`));
      console.error(`  snapshot=${JSON.stringify(result.snapshot)}`);
      return;
    }

    console.log(`[PASS] ${result.name}`);
    console.log(`  snapshot=${JSON.stringify(result.snapshot)}`);
  });

  process.exitCode = hasFailure ? 1 : 0;
}

main();
