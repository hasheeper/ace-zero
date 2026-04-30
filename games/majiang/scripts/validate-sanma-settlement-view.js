'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const settlementViewModelPath = path.resolve(__dirname, '../frontend/scripts/ui/settlement-view-model.js');

function loadSettlementViewModelBuilder() {
  const source = fs.readFileSync(settlementViewModelPath, 'utf8');
  const sandbox = {
    window: {},
    console
  };
  vm.runInNewContext(source, sandbox, { filename: settlementViewModelPath });
  const builder = sandbox.window.AceMahjongBuildSettlementViewModel;
  if (typeof builder !== 'function') {
    throw new Error('AceMahjongBuildSettlementViewModel was not registered.');
  }
  return builder;
}

function assertEqual(actual, expected, label, errors) {
  if (actual !== expected) {
    errors.push(`${label} expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
  }
}

function assertArrayEqual(actual, expected, label, errors) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    errors.push(`${label} expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
  }
}

function main() {
  const buildSettlementViewModel = loadSettlementViewModelBuilder();
  const payload = {
    roundText: '东一',
    seatOrder: ['bottom', 'right', 'left'],
    seatLabels: {
      bottom: '自',
      right: '下',
      left: '上'
    },
    seatNames: {
      bottom: '庄家',
      right: '赢家',
      left: '闲家'
    },
    seatDeltaMap: {
      bottom: -4000,
      right: 6000,
      left: -2000
    },
    roundResult: {
      type: 'hule',
      winnerSeat: 'right',
      fromSeat: null,
      zhuangfeng: 0,
      jushu: 0,
      scores: {
        bottom: 31000,
        right: 41000,
        left: 28000
      },
      result: {
        fu: 40,
        fanshu: 5,
        defen: 6000,
        fenpei: [-4000, 6000, 0, -2000],
        hupai: [
          { name: '門前清自摸和', fanshu: 1 },
          { name: 'ドラ', fanshu: 4 }
        ]
      }
    }
  };

  const viewModel = buildSettlementViewModel(payload);
  const errors = [];

  if (!viewModel) {
    throw new Error('Settlement view model should not be null.');
  }

  assertEqual(viewModel.mode, 'single-hule', 'mode', errors);
  assertEqual(viewModel.subtitle, '自摸和牌', 'subtitle', errors);
  assertEqual(Array.isArray(viewModel.scoreRows) ? viewModel.scoreRows.length : 0, 3, 'scoreRows.length', errors);
  assertArrayEqual(
    (viewModel.scoreRows || []).map((row) => row.seatKey),
    ['right', 'bottom', 'left'],
    'scoreRows.seatKey order',
    errors
  );
  assertArrayEqual(
    (viewModel.scoreRows || []).map((row) => row.delta),
    [6000, -4000, -2000],
    'scoreRows.delta',
    errors
  );
  assertEqual(viewModel.total && viewModel.total.pointText, '6,000', 'total.pointText', errors);

  if (errors.length) {
    console.error('[FAIL] sanma-settlement-view');
    errors.forEach((error) => {
      console.error(`  - ${error}`);
    });
    process.exitCode = 1;
    return;
  }

  console.log('[PASS] sanma-settlement-view');
  console.log(`  subtitle=${viewModel.subtitle}`);
  console.log(`  rows=${viewModel.scoreRows.map((row) => `${row.seatKey}:${row.delta}`).join(', ')}`);
  console.log(`  total=${viewModel.total.pointText}${viewModel.total.unit}`);
}

main();
