'use strict';

const fs = require('fs');
const path = require('path');

const { SingleRoundRuntime } = require('../engine/runtime/single-round-runtime');
const { createScriptedDrawPolicy } = require('../engine/base/draw-policy');
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

function runNagashiScenario(configPath) {
  const config = loadJson(configPath);
  const runtime = createRuntimeFromConfig(config);
  runtime.start();
  const actions = config.testing && Array.isArray(config.testing.fastForwardActions)
    ? config.testing.fastForwardActions
    : [];
  actions.forEach((action) => runtime.dispatch(action));
  const snapshot = runtime.getSnapshot();
  return compareRoundResultExpected(snapshot, config.testing.expectedSnapshot || {});
}

function runNoDaopaiGatingScenario(configPath) {
  const config = loadJson(configPath);
  const runtime = createRuntimeFromConfig(config);
  runtime.start();

  const bottomIndex = runtime.getSeatIndex('bottom');
  const rightIndex = runtime.getSeatIndex('right');
  const topIndex = runtime.getSeatIndex('top');
  if (bottomIndex < 0 || rightIndex < 0 || topIndex < 0) {
    return ['seat index initialization failed'];
  }

  runtime.board.shan._pai = Array.from({ length: 14 }, () => 'm1');
  runtime.board.shoupai[bottomIndex]._zimo = null;
  runtime.board.shoupai[rightIndex]._zimo = null;
  runtime.board.shoupai[topIndex]._zimo = null;
  runtime.board.shoupai[rightIndex]._lizhi = true;

  const errors = [];
  if (runtime.canDeclareNoDaopai('bottom') !== true) {
    errors.push('bottom should be allowed to declare no-daopai at exhaustive draw');
  }
  if (runtime.canDeclareNoDaopai('right') !== false) {
    errors.push('right should not be allowed to declare no-daopai while already riichi');
  }
  if (runtime.canDeclareNoDaopai('top') !== false) {
    errors.push('top should not be allowed to declare no-daopai when not in tenpai');
  }
  return errors;
}

function main() {
  const cwd = path.resolve(__dirname, '..');
  const checks = [
    {
      name: 'p3-nagashi-mangan',
      run: () => runNagashiScenario(path.join(cwd, 'test', 'game-config.p3-nagashi-mangan.json'))
    },
    {
      name: 'phasea-no-daopai-gating',
      run: () => runNoDaopaiGatingScenario(path.join(cwd, 'test', 'game-config.phasea-no-daopai.json'))
    }
  ];

  let hasFailure = false;
  checks.forEach((check) => {
    const errors = check.run();
    if (errors.length) {
      hasFailure = true;
      console.error(`[FAIL] ${check.name}`);
      errors.forEach((error) => console.error(`  - ${error}`));
      return;
    }
    console.log(`[PASS] ${check.name}`);
  });

  process.exitCode = hasFailure ? 1 : 0;
}

main();
