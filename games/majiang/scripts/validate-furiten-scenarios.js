'use strict';

const fs = require('fs');
const path = require('path');

const { SingleRoundRuntime } = require('../engine/runtime/single-round-runtime');
const { createScriptedDrawPolicy } = require('../engine/base/draw-policy');

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

function compareStateSubset(actual, expected = {}, label, errors) {
  Object.keys(expected || {}).forEach((key) => {
    const actualValue = actual ? actual[key] : undefined;
    const expectedValue = expected[key];
    if (actualValue !== expectedValue) {
      errors.push(`${label}.${key} expected ${expectedValue} but got ${actualValue}`);
    }
  });
}

function compareExpected(snapshot, expected = {}) {
  const errors = [];

  if (expected.phase && snapshot.phase !== expected.phase) {
    errors.push(`phase expected ${expected.phase} but got ${snapshot.phase}`);
  }
  if (expected.turnSeat && snapshot.turnSeat !== expected.turnSeat) {
    errors.push(`turnSeat expected ${expected.turnSeat} but got ${snapshot.turnSeat}`);
  }

  if (expected.bottomFuriten) {
    compareStateSubset(snapshot && snapshot.seats && snapshot.seats.bottom && snapshot.seats.bottom.furitenState, expected.bottomFuriten, 'bottomFuriten', errors);
  }

  if (expected.bottomRiichi) {
    compareStateSubset(snapshot && snapshot.seats && snapshot.seats.bottom && snapshot.seats.bottom.riichiState, expected.bottomRiichi, 'bottomRiichi', errors);
  }

  if (Array.isArray(expected.availableActionTypes)) {
    const actualTypes = Array.isArray(snapshot && snapshot.availableActions)
      ? snapshot.availableActions.map((action) => action && action.type).filter(Boolean)
      : [];
    expected.availableActionTypes.forEach((expectedType) => {
      if (!actualTypes.includes(expectedType)) {
        errors.push(`availableActionTypes missing ${expectedType}`);
      }
    });
  }

  if (Array.isArray(expected.forbiddenActionTypes)) {
    const actualTypes = Array.isArray(snapshot && snapshot.availableActions)
      ? snapshot.availableActions.map((action) => action && action.type).filter(Boolean)
      : [];
    expected.forbiddenActionTypes.forEach((forbiddenType) => {
      if (actualTypes.includes(forbiddenType)) {
        errors.push(`forbiddenActionTypes expected no ${forbiddenType} but found one`);
      }
    });
  }

  return errors;
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
    const errors = compareExpected(snapshot, expected);

    return {
      configPath,
      snapshot,
      errors
    };
  } catch (error) {
    return {
      configPath,
      snapshot: { phase: 'error', turnSeat: null, seats: {} },
      errors: [error && error.stack ? error.stack.split('\n')[0] : String(error)]
    };
  }
}

function main() {
  const cwd = path.resolve(__dirname, '..');
  const defaultConfigs = [
    'game-config.p4-furiten-discard.json',
    'game-config.p4-furiten-pass-ron.json',
    'game-config.p4-furiten-clear-after-discard.json',
    'game-config.p4-furiten-riichi-lock.json'
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
      console.error(`  bottomFuriten=${JSON.stringify(result.snapshot.seats && result.snapshot.seats.bottom ? result.snapshot.seats.bottom.furitenState : null)}`);
      return;
    }

    console.log(`[PASS] ${name}`);
    console.log(`  phase=${result.snapshot.phase} turnSeat=${result.snapshot.turnSeat}`);
    console.log(`  bottomFuriten=${JSON.stringify(result.snapshot.seats.bottom.furitenState)}`);
  });

  process.exitCode = hasFailure ? 1 : 0;
}

main();
