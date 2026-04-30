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

function runActions(runtime, actions = []) {
  actions.forEach((action) => {
    runtime.dispatch(action);
  });
}

function validateDealerDoubleRonBoardState() {
  const configPath = path.resolve(__dirname, '..', 'test', 'game-config.p5-double-ron.json');
  const config = loadJson(configPath);
  const runtime = createRuntimeFromConfig(config);
  runtime.start();
  runActions(runtime, config.testing && Array.isArray(config.testing.fastForwardActions)
    ? config.testing.fastForwardActions
    : []);

  const errors = [];
  const board = runtime.board || {};
  const roundResult = runtime.roundResult || {};
  const lastWinner = roundResult && Array.isArray(roundResult.winners) && roundResult.winners.length
    ? roundResult.winners[roundResult.winners.length - 1]
    : null;
  const expectedFenpei = lastWinner && lastWinner.result && Array.isArray(lastWinner.result.fenpei)
    ? lastWinner.result.fenpei
    : null;

  if (board._lianzhuang !== false) {
    errors.push(`expected board._lianzhuang to be false under 場数=0 but got ${board._lianzhuang}`);
  }
  if (board._lizhibang !== 0) {
    errors.push(`expected board._lizhibang to be 0 but got ${board._lizhibang}`);
  }
  if (expectedFenpei && JSON.stringify(board._fenpei) !== JSON.stringify(expectedFenpei)) {
    errors.push(`expected board._fenpei to equal last winner fenpei ${JSON.stringify(expectedFenpei)} but got ${JSON.stringify(board._fenpei)}`);
  }

  return {
    name: 'dealer-double-ron-board-state-default',
    errors
  };
}

function validateDealerDoubleRonRenchanBoardState() {
  const configPath = path.resolve(__dirname, '..', 'test', 'game-config.p5-double-ron.json');
  const config = loadJson(configPath);
  const runtime = createRuntimeFromConfig({
    ...config,
    ruleOverrides: {
      ...(config.ruleOverrides || {}),
      '場数': 1,
      '連荘方式': 2
    }
  });
  runtime.start();
  runActions(runtime, config.testing && Array.isArray(config.testing.fastForwardActions)
    ? config.testing.fastForwardActions
    : []);

  const errors = [];
  const board = runtime.board || {};
  if (board._lianzhuang !== true) {
    errors.push(`expected board._lianzhuang to be true under 場数=1/連荘方式=2 but got ${board._lianzhuang}`);
  }

  return {
    name: 'dealer-double-ron-board-state-renchan',
    errors
  };
}

function main() {
  const checks = [
    validateDealerDoubleRonBoardState(),
    validateDealerDoubleRonRenchanBoardState()
  ];

  let hasFailure = false;
  checks.forEach((check) => {
    if (check.errors.length) {
      hasFailure = true;
      console.error(`[FAIL] ${check.name}`);
      check.errors.forEach((error) => console.error(`  - ${error}`));
      return;
    }
    console.log(`[PASS] ${check.name}`);
  });

  process.exitCode = hasFailure ? 1 : 0;
}

main();
