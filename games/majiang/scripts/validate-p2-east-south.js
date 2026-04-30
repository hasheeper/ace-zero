'use strict';

const fs = require('fs');

const createMatchStateHelpers = require('../shared/match/match-state');
const createRoundTransitionHelpers = require('../shared/match/round-transition');
const { SingleRoundRuntime } = require('../engine/runtime/single-round-runtime');

const matchStateHelpers = createMatchStateHelpers();
const roundTransitionHelpers = createRoundTransitionHelpers();

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function validateInitialSchedule() {
  const state = matchStateHelpers.createInitialMatchState({
    ruleset: 'riichi-2p-pinzu-honor',
    seatKeys: ['bottom', 'top'],
    ruleConfig: { '場数': 2 },
    qijia: 0,
    zhuangfeng: 0,
    jushu: 0
  });

  assert(state.maxJushu === 3, `Expected p2 east-south maxJushu to be 3, got ${state.maxJushu}.`);

  const shifted = matchStateHelpers.createInitialMatchState({
    ruleset: 'riichi-2p-pinzu-honor',
    seatKeys: ['bottom', 'top'],
    ruleConfig: { '場数': 2 },
    qijia: 0,
    zhuangfeng: 0,
    jushu: 1
  });

  assert(shifted.dealerSeat === 'top', `Expected East 2 dealer seat to be top, got ${shifted.dealerSeat}.`);

  console.log('[PASS] p2-east-south-initial-schedule');
  console.log(`  maxJushu=${state.maxJushu} east2Dealer=${shifted.dealerSeat}`);
}

function validateRoundAdvance() {
  const matchState = matchStateHelpers.createInitialMatchState({
    ruleset: 'riichi-2p-pinzu-honor',
    seatKeys: ['bottom', 'top'],
    ruleConfig: { '場数': 2, '連荘方式': 2 },
    qijia: 0,
    zhuangfeng: 0,
    jushu: 1
  });

  const roundResult = {
    type: 'hule',
    winnerSeat: 'bottom',
    fromSeat: 'top',
    scores: {
      bottom: 33000,
      top: 17000
    }
  };

  const decision = roundTransitionHelpers.resolveRoundTransition(matchState, roundResult);

  assert(decision.dealerContinues === false, 'Expected East 2 non-dealer win to end dealer continuation.');
  assert(decision.nextDealerSeat === 'bottom', `Expected next dealer seat to be bottom, got ${decision.nextDealerSeat}.`);
  assert(decision.nextZhuangfeng === 1, `Expected next wind to be South, got ${decision.nextZhuangfeng}.`);
  assert(decision.nextJushu === 0, `Expected next jushu to reset to 0, got ${decision.nextJushu}.`);

  console.log('[PASS] p2-east2-to-south1');
  console.log(`  nextDealer=${decision.nextDealerSeat} nextWind=${decision.nextZhuangfeng} nextJushu=${decision.nextJushu}`);
}

function validateSeatWindMap() {
  const config = JSON.parse(fs.readFileSync('/Users/liuhang/Documents/acezero/majiang/game-config.json', 'utf8'));
  const runtime = new SingleRoundRuntime(config);
  runtime.start();

  const seatWindMap = runtime.getSeatWindMap();

  assert(seatWindMap.bottom && seatWindMap.bottom.label === '东', `Expected bottom wind to be 东, got ${seatWindMap.bottom && seatWindMap.bottom.label}.`);
  assert(seatWindMap.top && seatWindMap.top.label === '南', `Expected top wind to be 南, got ${seatWindMap.top && seatWindMap.top.label}.`);

  console.log('[PASS] p2-seat-wind-map');
  console.log(`  bottom=${seatWindMap.bottom.label} top=${seatWindMap.top.label}`);
}

function main() {
  validateInitialSchedule();
  validateRoundAdvance();
  validateSeatWindMap();
}

main();
