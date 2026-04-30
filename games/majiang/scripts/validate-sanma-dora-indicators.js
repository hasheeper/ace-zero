'use strict';

const Majiang = require('../majiang-core/lib');
const createSettlementHelpers = require('../shared/runtime/scoring/settlement.js');

const settlementHelpers = createSettlementHelpers();

const SANMA_SEAT_INDEX = {
  bottom: 0,
  right: 1,
  left: 2
};

const P4_SEAT_INDEX = {
  bottom: 0,
  right: 1,
  top: 2,
  left: 3
};

function createHooks(seatIndexMap) {
  return {
    getSeatIndex(runtime, seatKey) {
      return Object.prototype.hasOwnProperty.call(seatIndexMap, seatKey)
        ? seatIndexMap[seatKey]
        : -1;
    },
    getSeatRiichiState() {
      return null;
    },
    getSeatTurnState() {
      return { discardTurns: 1 };
    },
    getSeatMenfengIndex(runtime, seatKey, seatIndex) {
      return seatIndex;
    }
  };
}

function createRuntime(rulesetId, baopai) {
  const activeSeats = rulesetId === 'riichi-3p-sanma'
    ? ['bottom', 'right', 'left']
    : ['bottom', 'right', 'top', 'left'];
  return {
    rulesetProfile: { id: rulesetId },
    board: {
      zhuangfeng: 0,
      changbang: 0,
      lizhibang: 0,
      shan: {
        baopai: Array.isArray(baopai) ? baopai.slice() : [],
        fubaopai: []
      }
    },
    getSeatKeyByIndex(index) {
      return activeSeats[index] || null;
    }
  };
}

function getDoraFanshu(result) {
  if (!result || !Array.isArray(result.hupai)) return 0;
  const dora = result.hupai.find((item) => item && item.name === 'ドラ');
  return dora ? Number(dora.fanshu || 0) : 0;
}

const cases = [
  {
    name: 'sanma-indicator-1m-means-9m',
    runtime: createRuntime('riichi-3p-sanma', ['m1']),
    hooks: createHooks(SANMA_SEAT_INDEX),
    hand: 'm99p123p456s123z111',
    expectedInternalBaopai: ['m8'],
    expectedDoraFanshu: 2
  },
  {
    name: 'sanma-indicator-9m-means-1m',
    runtime: createRuntime('riichi-3p-sanma', ['m9']),
    hooks: createHooks(SANMA_SEAT_INDEX),
    hand: 'm11p123p456s123z111',
    expectedInternalBaopai: ['m9'],
    expectedDoraFanshu: 2
  },
  {
    name: 'p4-indicator-1m-still-means-2m',
    runtime: createRuntime('riichi-4p', ['m1']),
    hooks: createHooks(P4_SEAT_INDEX),
    hand: 'm22p123p456s123z111',
    expectedInternalBaopai: ['m1'],
    expectedDoraFanshu: 2
  }
];

function main() {
  let hasFailure = false;

  cases.forEach((testCase) => {
    const shoupai = Majiang.Shoupai.fromString(testCase.hand);
    const params = settlementHelpers.createHuleParams(
      testCase.runtime,
      shoupai,
      1,
      {},
      testCase.hooks
    );
    const result = Majiang.Util.hule(shoupai, null, Majiang.Util.hule_param(params));
    const actualDoraFanshu = getDoraFanshu(result);
    const internalBaopaiMatches = JSON.stringify(params.baopai) === JSON.stringify(testCase.expectedInternalBaopai);
    const doraFanshuMatches = actualDoraFanshu === testCase.expectedDoraFanshu;

    if (!internalBaopaiMatches || !doraFanshuMatches) {
      hasFailure = true;
      console.error(`[FAIL] ${testCase.name}`);
      console.error(`  expected baopai=${JSON.stringify(testCase.expectedInternalBaopai)} dora=${testCase.expectedDoraFanshu}`);
      console.error(`  actual   baopai=${JSON.stringify(params.baopai)} dora=${actualDoraFanshu}`);
      return;
    }

    console.log(`[PASS] ${testCase.name}`);
    console.log(`  baopai=${JSON.stringify(params.baopai)} dora=${actualDoraFanshu}`);
  });

  process.exitCode = hasFailure ? 1 : 0;
}

main();
