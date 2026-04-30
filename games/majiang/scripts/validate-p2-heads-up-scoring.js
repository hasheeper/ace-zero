'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const settlementPath = path.resolve(__dirname, '../shared/runtime/scoring/settlement.js');
const rulesetProfileApi = require('../engine/base/ruleset-profile');

function loadSettlementPrivateApi() {
  let source = fs.readFileSync(settlementPath, 'utf8');
  source = source.replace(
    '  return createRuntimeSettlementHelpers;\n});',
    '  createRuntimeSettlementHelpers.__private = { recalculateHandScore };\n  return createRuntimeSettlementHelpers;\n});'
  );

  const sandbox = {
    module: { exports: {} },
    exports: {},
    console
  };

  vm.runInNewContext(source, sandbox, { filename: settlementPath });
  return sandbox.module.exports && sandbox.module.exports.__private
    ? sandbox.module.exports.__private
    : {};
}

function createP2Runtime() {
  const rulesetProfile = rulesetProfileApi.getRulesetProfile('riichi-2p-pinzu-honor');
  return {
    rulesetProfile,
    rule: {
      '数え役満あり': true,
      '切り上げ満貫あり': true
    },
    board: {
      changbang: 0,
      lizhibang: 0
    },
    topology: {
      activeSeats: ['bottom', 'top']
    }
  };
}

const seatIndexBySeatKey = {
  bottom: 0,
  top: 1
};

const hooks = {
  getSeatIndex(runtime, seatKey) {
    return Object.prototype.hasOwnProperty.call(seatIndexBySeatKey, seatKey)
      ? seatIndexBySeatKey[seatKey]
      : -1;
  },
  getSeatMenfengIndex(runtime, seatKey, seatIndex) {
    return seatIndex;
  }
};

const cases = [
  {
    name: 'dealer-tsumo-30fu-1han',
    seatIndex: 0,
    fu: 30,
    fanshu: 1,
    options: {},
    expected: {
      defen: 1500,
      fenpei: [1500, -1500, 0, 0]
    }
  },
  {
    name: 'child-tsumo-30fu-1han',
    seatIndex: 1,
    fu: 30,
    fanshu: 1,
    options: {},
    expected: {
      defen: 1000,
      fenpei: [-1000, 1000, 0, 0]
    }
  },
  {
    name: 'child-ron-mangan',
    seatIndex: 1,
    fu: 40,
    fanshu: 5,
    options: {
      rongpai: 'p5+',
      baojiaIndex: 0
    },
    expected: {
      defen: 8000,
      fenpei: [-8000, 8000, 0, 0]
    }
  },
  {
    name: 'child-tsumo-mangan',
    seatIndex: 1,
    fu: 40,
    fanshu: 5,
    options: {},
    expected: {
      defen: 8000,
      fenpei: [-8000, 8000, 0, 0]
    }
  }
];

function formatFenpei(value) {
  return `[${value.join(', ')}]`;
}

function main() {
  const settlementPrivateApi = loadSettlementPrivateApi();
  const recalculateHandScore = settlementPrivateApi.recalculateHandScore;

  if (typeof recalculateHandScore !== 'function') {
    throw new Error('Unable to access recalculateHandScore for p2 heads-up validation.');
  }

  let hasFailure = false;

  cases.forEach((testCase) => {
    const runtime = createP2Runtime();
    const actual = recalculateHandScore(
      runtime,
      testCase.seatIndex,
      testCase.fu,
      testCase.fanshu,
      testCase.options,
      hooks
    );

    const actualFenpei = Array.isArray(actual && actual.fenpei) ? actual.fenpei : [];
    const expectedFenpei = testCase.expected.fenpei;
    const passed = Number(actual.defen) === Number(testCase.expected.defen)
      && JSON.stringify(actualFenpei) === JSON.stringify(expectedFenpei);

    if (!passed) {
      hasFailure = true;
      console.error(`[FAIL] ${testCase.name}`);
      console.error(`  expected defen=${testCase.expected.defen} fenpei=${formatFenpei(expectedFenpei)}`);
      console.error(`  actual   defen=${actual.defen} fenpei=${formatFenpei(actualFenpei)}`);
      return;
    }

    console.log(`[PASS] ${testCase.name}`);
    console.log(`  defen=${actual.defen} fenpei=${formatFenpei(actualFenpei)}`);
  });

  process.exitCode = hasFailure ? 1 : 0;
}

main();
