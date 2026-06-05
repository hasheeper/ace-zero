'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const { SingleRoundRuntime } = require('../engine/runtime/single-round-runtime');
const { createScriptedDrawPolicy } = require('../engine/base/draw-policy');

const FRONTEND_EFFECTS_PATH = path.resolve(__dirname, '../frontend/scripts/runtime/bridge/modules/frontend-effects.js');
const SETTLEMENT_VIEW_MODEL_PATH = path.resolve(__dirname, '../frontend/scripts/ui/settlement-view-model.js');
const DOUBLE_RON_CONFIG_PATH = path.resolve(__dirname, '../test/game-config.p5-double-ron.json');

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function assert(condition, message, errors) {
  if (!condition) {
    errors.push(message);
  }
}

function assertArrayEqual(actual, expected, label, errors) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    errors.push(`${label} expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
  }
}

function loadFrontendEffectsModule() {
  const source = fs.readFileSync(FRONTEND_EFFECTS_PATH, 'utf8');
  const sandbox = {
    window: {},
    console
  };
  vm.runInNewContext(source, sandbox, { filename: FRONTEND_EFFECTS_PATH });
  const moduleApi = sandbox.window.AceMahjongBridgeFrontendEffects;
  if (!moduleApi || typeof moduleApi.create !== 'function') {
    throw new Error('AceMahjongBridgeFrontendEffects was not registered.');
  }
  return moduleApi;
}

function loadSettlementViewModelBuilder() {
  const source = fs.readFileSync(SETTLEMENT_VIEW_MODEL_PATH, 'utf8');
  const sandbox = {
    window: {},
    console
  };
  vm.runInNewContext(source, sandbox, { filename: SETTLEMENT_VIEW_MODEL_PATH });
  const builder = sandbox.window.AceMahjongBuildSettlementViewModel;
  if (typeof builder !== 'function') {
    throw new Error('AceMahjongBuildSettlementViewModel was not registered.');
  }
  return builder;
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

function runDoubleRonScenario() {
  const config = loadJson(DOUBLE_RON_CONFIG_PATH);
  const runtime = createRuntimeFromConfig(config);
  runtime.start();
  const actions = config.testing && Array.isArray(config.testing.fastForwardActions)
    ? config.testing.fastForwardActions
    : [];
  actions.forEach((action) => {
    runtime.dispatch(action);
  });
  return runtime.roundResult;
}

function sumWinnerFenpei(roundResult) {
  return (Array.isArray(roundResult && roundResult.winners) ? roundResult.winners : [])
    .reduce((result, winner) => {
      const fenpei = winner && winner.result && Array.isArray(winner.result.fenpei)
        ? winner.result.fenpei
        : [];
      fenpei.forEach((value, index) => {
        result[index] = Number(result[index] || 0) + Number(value || 0);
      });
      return result;
    }, [0, 0, 0, 0]);
}

function validateRoundResultFenpei(roundResult, errors) {
  assert(roundResult && roundResult.multiHule === true, 'double ron should produce multiHule roundResult', errors);
  assert(Number(roundResult && roundResult.winnerCount || 0) === 2, 'double ron should have winnerCount=2', errors);
  assertArrayEqual(roundResult.fenpei, sumWinnerFenpei(roundResult), 'roundResult.fenpei', errors);
}

function validateFrontendEffects(roundResult, errors) {
  const timerDelays = [];
  const frontendEffects = loadFrontendEffectsModule().create({
    global: {
      setTimeout(callback, delayMs) {
        timerDelays.push(delayMs);
        callback();
        return timerDelays.length;
      }
    },
    logRuntime() {},
    clone
  });

  const summaries = frontendEffects.buildHuleWinnerLogSummaries(roundResult);
  assertArrayEqual(
    summaries.map((entry) => entry.winnerSeat),
    ['bottom', 'right'],
    'winner log seats',
    errors
  );
  assertArrayEqual(
    summaries.map((entry) => entry.fanshu),
    [3, 1],
    'winner log fanshu',
    errors
  );

  const revealCalls = [];
  frontendEffects.queueWinnerReveal({
    playWinnerRevealForSeat(seatKey, options = {}) {
      revealCalls.push({ seatKey, options });
    }
  }, {
    snapshot: {
      views: {
        truthView: {
          seats: {
            bottom: { handTiles: [{ code: 'm1' }, { code: 'z1' }] },
            right: { handTiles: [{ code: 'm4' }, { code: 'z1' }] }
          }
        }
      }
    }
  }, roundResult, {
    delayMs: 10
  });

  assertArrayEqual(
    revealCalls.map((entry) => entry.seatKey),
    ['bottom', 'right'],
    'winner reveal seats',
    errors
  );
  assertArrayEqual(timerDelays, [10, 290], 'winner reveal delays', errors);
  assertArrayEqual(
    revealCalls.map((entry) => entry.options.winningTileCode),
    ['z1', 'z1'],
    'winner reveal winning tiles',
    errors
  );
}

function validateSettlementViewModel(roundResult, errors) {
  const buildSettlementViewModel = loadSettlementViewModelBuilder();
  const viewModel = buildSettlementViewModel({
    roundResult,
    seatOrder: ['bottom', 'right', 'top', 'left'],
    seatNames: {
      bottom: '一号荣和位',
      right: '二号荣和位',
      top: '路过位',
      left: '放铳位'
    }
  });
  assert(viewModel && viewModel.mode === 'multi-hule', `expected multi-hule view model, got ${viewModel && viewModel.mode}`, errors);
  assert(Array.isArray(viewModel && viewModel.winners) && viewModel.winners.length === 2, 'expected two settlement winners', errors);

  const deltaBySeat = (viewModel && Array.isArray(viewModel.scoreRows) ? viewModel.scoreRows : [])
    .reduce((result, row) => {
      result[row.seatKey] = row.delta;
      return result;
    }, {});
  const expectedDeltaBySeat = {
    bottom: Number(roundResult.fenpei[0] || 0),
    right: Number(roundResult.fenpei[1] || 0),
    top: Number(roundResult.fenpei[2] || 0),
    left: Number(roundResult.fenpei[3] || 0)
  };
  assertArrayEqual(deltaBySeat, expectedDeltaBySeat, 'settlement score deltas', errors);
}

function main() {
  const errors = [];
  const roundResult = runDoubleRonScenario();

  validateRoundResultFenpei(roundResult, errors);
  validateFrontendEffects(roundResult, errors);
  validateSettlementViewModel(roundResult, errors);

  if (errors.length) {
    console.error('[FAIL] runtime-bridge-multi-hule-smoke');
    errors.forEach((error) => {
      console.error(`  - ${error}`);
    });
    process.exitCode = 1;
    return;
  }

  console.log('[PASS] runtime-bridge-multi-hule-smoke');
  console.log(`  winners=${roundResult.winners.map((entry) => entry.winnerSeat).join('/')}`);
  console.log(`  fenpei=${JSON.stringify(roundResult.fenpei)}`);
}

main();
