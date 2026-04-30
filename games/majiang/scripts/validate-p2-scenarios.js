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

function readMeldCount(snapshot, seatKey) {
  const seat = snapshot && snapshot.seats ? snapshot.seats[seatKey] : null;
  return seat && Array.isArray(seat.melds) ? seat.melds.length : 0;
}

function compareExpected(snapshot, expected = {}) {
  const errors = [];

  if (expected.phase && snapshot.phase !== expected.phase) {
    errors.push(`phase expected ${expected.phase} but got ${snapshot.phase}`);
  }
  if (expected.turnSeat && snapshot.turnSeat !== expected.turnSeat) {
    errors.push(`turnSeat expected ${expected.turnSeat} but got ${snapshot.turnSeat}`);
  }
  if (expected.lastEventType) {
    const actualLastEventType = snapshot.lastEvent && snapshot.lastEvent.type;
    if (actualLastEventType !== expected.lastEventType) {
      errors.push(`lastEventType expected ${expected.lastEventType} but got ${actualLastEventType}`);
    }
  }
  if (expected.meldCounts && typeof expected.meldCounts === 'object') {
    Object.entries(expected.meldCounts).forEach(([seatKey, count]) => {
      const actual = readMeldCount(snapshot, seatKey);
      if (actual !== count) {
        errors.push(`meldCounts.${seatKey} expected ${count} but got ${actual}`);
      }
    });
  }
  if (expected.wallState && typeof expected.wallState === 'object') {
    Object.entries(expected.wallState).forEach(([key, value]) => {
      const actual = snapshot.wallState ? snapshot.wallState[key] : undefined;
      if (actual !== value) {
        errors.push(`wallState.${key} expected ${value} but got ${actual}`);
      }
    });
  }

  return errors;
}

function runScenario(configPath) {
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
}

function main() {
  const cwd = path.resolve(__dirname, '..');
  const defaultConfigs = [];

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
      console.error(`  phase=${result.snapshot.phase} turnSeat=${result.snapshot.turnSeat} lastEvent=${result.snapshot.lastEvent && result.snapshot.lastEvent.type}`);
      return;
    }

    console.log(`[PASS] ${name}`);
    console.log(`  phase=${result.snapshot.phase} turnSeat=${result.snapshot.turnSeat} lastEvent=${result.snapshot.lastEvent && result.snapshot.lastEvent.type}`);
  });

  process.exitCode = hasFailure ? 1 : 0;
}

main();
