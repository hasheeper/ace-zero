'use strict';

const Majiang = require('../majiang-core/lib');
const wallServiceApi = require('../engine/base/wall-service.js');
const rulesetApi = require('../engine/base/ruleset-profile.js');

function createService() {
  const rule = Majiang.rule({ '場数': 0 });
  const rulesetProfile = rulesetApi.getRulesetProfile('riichi-3p-sanma');
  return wallServiceApi.createWallService({
    rule,
    rulesetProfile,
    tableSize: 3
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function validateOpeningCounts() {
  const service = createService();
  const deal = service.dealInitialHands({ seatCount: 3, handSize: 13 });
  const state = service.getState();

  assert(deal.haipai.flat().length + state.remaining + state.deadWallSize === 108, 'Sanma wall should total 108 tiles.');
  assert(deal.remaining === 55, `Expected opening remaining to be 55, got ${deal.remaining}.`);

  console.log('[PASS] sanma-opening-counts');
  console.log(`  total=108 openingRemaining=${deal.remaining}`);
}

function validateSupplementRotation() {
  const service = createService();
  service.shan._pai = [
    'm1', 'm9', 'p1', 'p9',
    'z1', 'z2', 'z3', 'z4', 'z5',
    'z6', 'z7', 's1', 's2', 's3',
    'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 's4', 's5', 's6'
  ];

  const draws = [];
  for (let index = 0; index < 5; index += 1) {
    draws.push(service.drawKitaTile({ seat: 'bottom', reason: 'dead-wall-validation' }).tileCode);
  }

  const state = service.getState();

  assert(
    JSON.stringify(draws) === JSON.stringify(['m1', 'm9', 'p1', 'p9', 'p2']),
    `Unexpected supplement draw order: ${JSON.stringify(draws)}`
  );
  assert(
    JSON.stringify(state.doraIndicators) === JSON.stringify(['z1', null, null, null, null]),
    `Dora indicators were touched by supplement draws: ${JSON.stringify(state.doraIndicators)}`
  );
  assert(state.deadWallSize === 14, `Dead wall size should stay 14, got ${state.deadWallSize}.`);

  console.log('[PASS] sanma-supplement-rotation');
  console.log(`  draws=${JSON.stringify(draws)} dora=${JSON.stringify(state.doraIndicators)}`);
}

function main() {
  validateOpeningCounts();
  validateSupplementRotation();
}

main();
