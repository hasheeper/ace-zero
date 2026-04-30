'use strict';

const { SingleRoundRuntime } = require('../engine/runtime/single-round-runtime');
const { createShoupaiFromString } = require('../engine/base/majiang-core-adapter');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function createRuntime(rules = {}) {
  return new SingleRoundRuntime({
    mode: 'single-round',
    tableSize: 4,
    ruleset: 'riichi-4p',
    rules,
    players: [
      { seat: 'bottom', title: '测试者', name: '自家', human: true, ai: { enabled: false, difficulty: 'beta' } },
      { seat: 'right', title: '测试者', name: '下家', human: false, ai: { enabled: false, difficulty: 'beta' } },
      { seat: 'top', title: '测试者', name: '对家', human: false, ai: { enabled: false, difficulty: 'beta' } },
      { seat: 'left', title: '测试者', name: '上家', human: false, ai: { enabled: false, difficulty: 'beta' } }
    ],
    round: {
      title: 'Shibari Validation',
      zhuangfeng: 0,
      jushu: 0,
      changbang: 0,
      lizhibang: 0
    }
  });
}

function prepareRuntime(runtime) {
  runtime.start();
  runtime.turnSeat = 'bottom';
  runtime.stateMachine.setPhase('await_discard');
  runtime.turnCounter = 1;
  runtime.doubleRiichiWindowOpen = false;
  return runtime;
}

function validateTwoFanShibariBlocksBonusOnlyUpgrade() {
  const runtime = prepareRuntime(createRuntime({
    akaDora: { enabled: true, count: 3 },
    shibari: { minYakuHan: 2 }
  }));
  const bottomIndex = runtime.getSeatIndex('bottom');
  const shoupai = createShoupaiFromString('m123m456p789z555p5');
  runtime.board.shoupai[bottomIndex] = shoupai;

  const canHule = runtime.canSeatHule('bottom', {
    shoupai,
    claimTileCode: 'p0=',
    fromSeat: 'top'
  });

  assert(canHule === false, 'Expected 2-fan shibari to reject a hand with only one real yaku plus aka dora.');

  let threw = false;
  try {
    runtime.resolveHule('bottom', {
      rongpai: 'p0=',
      claimTileCode: 'p0=',
      fromSeat: 'top',
      finalizeImmediately: true
    });
  } catch (error) {
    threw = /shibari/i.test(error.message);
  }
  assert(threw, 'Expected resolveHule final guard to reject invalid shibari hand.');

  console.log('[PASS] shibari-two-han-gates-bonus-only-upgrade');
  console.log(`  canHule=${canHule} resolveHuleRejected=${threw}`);
}

function validateFourFanShibariBlocksThreeRealHanHand() {
  const runtime = prepareRuntime(createRuntime({
    akaDora: { enabled: true, count: 3 },
    shibari: { minYakuHan: 4 }
  }));
  const bottomIndex = runtime.getSeatIndex('bottom');
  const shoupai = createShoupaiFromString('m123m456p789z555p50');
  runtime.board.shoupai[bottomIndex] = shoupai;
  runtime.riichiState.bottom.declared = true;

  const canHule = runtime.canSeatHule('bottom', {
    shoupai,
    selfDraw: true
  });

  assert(canHule === false, 'Expected 4-fan shibari to reject a hand with three real han plus aka dora.');

  console.log('[PASS] shibari-four-han-blocks-three-real-han');
  console.log(`  canHule=${canHule}`);
}

function validateOneFanShibariAllowsBaseYaku() {
  const runtime = prepareRuntime(createRuntime({
    akaDora: { enabled: true, count: 3 },
    shibari: { minYakuHan: 1 }
  }));
  const bottomIndex = runtime.getSeatIndex('bottom');
  const shoupai = createShoupaiFromString('m123m456p789z555p5');
  runtime.board.shoupai[bottomIndex] = shoupai;

  const canHule = runtime.canSeatHule('bottom', {
    shoupai,
    claimTileCode: 'p0=',
    fromSeat: 'top'
  });

  assert(canHule === true, 'Expected 1-fan shibari to allow a hand with one real yaku.');

  console.log('[PASS] shibari-one-han-allows-base-yaku');
  console.log(`  canHule=${canHule}`);
}

function main() {
  validateOneFanShibariAllowsBaseYaku();
  validateTwoFanShibariBlocksBonusOnlyUpgrade();
  validateFourFanShibariBlocksThreeRealHanHand();
}

main();
