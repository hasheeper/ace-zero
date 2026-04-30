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
  try {
    const config = loadJson(configPath);
    const runtime = createRuntimeFromConfig(config);
    runtime.start();

    const actions = config.testing && Array.isArray(config.testing.fastForwardActions)
      ? config.testing.fastForwardActions
      : [];
    actions.forEach((action) => {
      runtime.dispatch(action);
    });

    const snapshot = runtime.getSnapshot();
    const expected = config.testing && config.testing.expectedSnapshot
      ? config.testing.expectedSnapshot
      : {};

    return {
      configPath,
      snapshot,
      errors: compareRoundResultExpected(snapshot, expected)
    };
  } catch (error) {
    return {
      configPath,
      snapshot: { phase: 'error', turnSeat: null, roundResult: null },
      errors: [error && error.stack ? error.stack.split('\n')[0] : String(error)]
    };
  }
}

function main() {
  const cwd = path.resolve(__dirname, '..');
  const defaultConfigs = [
    'game-config.p5-four-riichi.json',
    'game-config.p5-four-kan-draw.json',
    'game-config.p5-four-wind.json',
    'game-config.p5-triple-ron.json',
    'game-config.p5-double-ron.json',
    'game-config.p5-riichi-discard-ron.json'
  ].map((file) => path.join(cwd, 'test', file));

  const configPaths = process.argv.slice(2).length
    ? process.argv.slice(2).map((input) => path.resolve(process.cwd(), input))
    : defaultConfigs;

  let hasFailure = false;
  configPaths.forEach((configPath) => {
    const result = runScenario(configPath);
    const name = path.basename(configPath);
    if (result.errors.length) {
      hasFailure = true;
      console.error(`[FAIL] ${name}`);
      result.errors.forEach((error) => {
        console.error(`  - ${error}`);
      });
      console.error(`  phase=${result.snapshot.phase} turnSeat=${result.snapshot.turnSeat}`);
      console.error(`  roundResult=${JSON.stringify(result.snapshot.roundResult)}`);
      return;
    }

    console.log(`[PASS] ${name}`);
    console.log(`  phase=${result.snapshot.phase} turnSeat=${result.snapshot.turnSeat}`);
    console.log(`  roundResult=${JSON.stringify(result.snapshot.roundResult)}`);
  });

  process.exitCode = hasFailure ? 1 : 0;
}

main();
