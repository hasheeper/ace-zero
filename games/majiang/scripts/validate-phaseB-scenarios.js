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

function runScenario(configPath) {
  const config = loadJson(configPath);
  const runtime = createRuntimeFromConfig(config);
  runtime.start();

  const preDeclaredNoDaopaiSeats = config.testing && Array.isArray(config.testing.preDeclaredNoDaopaiSeats)
    ? config.testing.preDeclaredNoDaopaiSeats
    : [];
  if (preDeclaredNoDaopaiSeats.length) {
    runtime.declaredNoDaopaiSeats = preDeclaredNoDaopaiSeats.slice();
  }

  const actions = config.testing && Array.isArray(config.testing.fastForwardActions)
    ? config.testing.fastForwardActions
    : [];
  actions.forEach((action) => runtime.dispatch(action));

  return compareRoundResultExpected(
    runtime.getSnapshot(),
    config.testing && config.testing.expectedSnapshot ? config.testing.expectedSnapshot : {}
  );
}

function main() {
  const cwd = path.resolve(__dirname, '..');
  const configPaths = [
    path.join(cwd, 'test', 'game-config.phaseb-exhaustive-no-daopai.json'),
    path.join(cwd, 'test', 'game-config.phaseb-exhaustive-noten-penalty-off.json')
  ];

  let hasFailure = false;
  configPaths.forEach((configPath) => {
    const errors = runScenario(configPath);
    const name = path.basename(configPath);
    if (errors.length) {
      hasFailure = true;
      console.error(`[FAIL] ${name}`);
      errors.forEach((error) => console.error(`  - ${error}`));
      return;
    }
    console.log(`[PASS] ${name}`);
  });

  process.exitCode = hasFailure ? 1 : 0;
}

main();
