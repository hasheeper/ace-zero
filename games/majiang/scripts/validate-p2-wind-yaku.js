'use strict';

const Majiang = require('../majiang-core/lib');
const createSettlementHelpers = require('../shared/runtime/scoring/settlement.js');
const rulesetProfileApi = require('../engine/base/ruleset-profile');

const settlementHelpers = createSettlementHelpers();

const P2_SEAT_INDEX = {
  bottom: 0,
  top: 1
};

function createHooks() {
  return {
    getSeatIndex(runtime, seatKey) {
      return Object.prototype.hasOwnProperty.call(P2_SEAT_INDEX, seatKey)
        ? P2_SEAT_INDEX[seatKey]
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

function createRuntime({ zhuangfeng = 0 } = {}) {
  return {
    rulesetProfile: rulesetProfileApi.getRulesetProfile('riichi-2p-pinzu-honor'),
    board: {
      zhuangfeng,
      changbang: 0,
      lizhibang: 0,
      shan: {
        baopai: [],
        fubaopai: []
      }
    },
    topology: {
      activeSeats: ['bottom', 'top']
    },
    getSeatKeyByIndex(index) {
      return ['bottom', 'top'][index] || null;
    }
  };
}

function getYakuNames(result) {
  return Array.isArray(result && result.hupai)
    ? result.hupai.map((item) => item && item.name).filter(Boolean)
    : [];
}

function assertIncludes(names, expectedName, caseName) {
  if (!names.includes(expectedName)) {
    throw new Error(`${caseName}: expected yaku ${expectedName} but got ${JSON.stringify(names)}`);
  }
}

function assertExcludes(names, unexpectedName, caseName) {
  if (names.includes(unexpectedName)) {
    throw new Error(`${caseName}: unexpected yaku ${unexpectedName} in ${JSON.stringify(names)}`);
  }
}

const cases = [
  {
    name: 'east-round-east-seat-east-triplet',
    runtime: createRuntime({ zhuangfeng: 0 }),
    seatIndex: 0,
    hand: 'p123p456p789z111z22',
    includes: ['場風 東', '自風 東'],
    excludes: ['場風 南', '自風 南', '場風 西', '自風 西', '場風 北', '自風 北']
  },
  {
    name: 'east-round-south-seat-south-triplet',
    runtime: createRuntime({ zhuangfeng: 0 }),
    seatIndex: 1,
    hand: 'p123p456p789z222z11',
    includes: ['自風 南'],
    excludes: ['場風 南', '場風 西', '自風 西', '場風 北', '自風 北']
  },
  {
    name: 'south-round-south-seat-south-triplet',
    runtime: createRuntime({ zhuangfeng: 1 }),
    seatIndex: 1,
    hand: 'p123p456p789z222z11',
    includes: ['場風 南', '自風 南'],
    excludes: ['場風 西', '自風 西', '場風 北', '自風 北']
  },
  {
    name: 'east-round-east-seat-west-triplet-is-not-wind-yaku',
    runtime: createRuntime({ zhuangfeng: 0 }),
    seatIndex: 0,
    hand: 'p123p456p789z333z11',
    includes: [],
    excludes: ['場風 西', '自風 西', '場風 北', '自風 北', '場風 南', '自風 南']
  },
  {
    name: 'east-round-south-seat-north-triplet-is-not-wind-yaku',
    runtime: createRuntime({ zhuangfeng: 0 }),
    seatIndex: 1,
    hand: 'p123p456p789z444z11',
    includes: [],
    excludes: ['場風 北', '自風 北', '場風 西', '自風 西', '場風 南']
  }
];

function main() {
  const hooks = createHooks();
  let hasFailure = false;

  cases.forEach((testCase) => {
    try {
      const shoupai = Majiang.Shoupai.fromString(testCase.hand);
      const params = settlementHelpers.createHuleParams(
        testCase.runtime,
        shoupai,
        testCase.seatIndex,
        {},
        hooks
      );
      const result = Majiang.Util.hule(shoupai, null, Majiang.Util.hule_param(params));
      const yakuNames = getYakuNames(result);

      (testCase.includes || []).forEach((name) => assertIncludes(yakuNames, name, testCase.name));
      (testCase.excludes || []).forEach((name) => assertExcludes(yakuNames, name, testCase.name));

      console.log(`[PASS] ${testCase.name}`);
      console.log(`  yaku=${JSON.stringify(yakuNames)}`);
    } catch (error) {
      hasFailure = true;
      console.error(`[FAIL] ${testCase.name}`);
      console.error(`  ${error && error.message ? error.message : String(error)}`);
    }
  });

  process.exitCode = hasFailure ? 1 : 0;
}

main();
