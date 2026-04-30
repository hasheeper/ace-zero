'use strict';

const Majiang = require('../majiang-core/lib');
const wallServiceApi = require('../engine/base/wall-service.js');
const rulesetApi = require('../engine/base/ruleset-profile.js');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function createService() {
  const rule = Majiang.rule({ '場数': 2 });
  const rulesetProfile = rulesetApi.getRulesetProfile('riichi-2p-pinzu-honor');
  return wallServiceApi.createWallService({
    rule,
    rulesetProfile,
    tableSize: 2
  });
}

function validateOpeningCounts() {
  const service = createService();
  const deal = service.dealInitialHands({ seatCount: 2, handSize: 13 });
  const state = service.getState();
  const allTiles = deal.haipai.flat();

  assert(allTiles.length === 26, `Expected 26 opening hand tiles, got ${allTiles.length}.`);
  assert(allTiles.every((tile) => /^(p[0-9]|z[1-7])$/.test(tile)), `Opening hands contained non-pinzu/honor tiles: ${JSON.stringify(allTiles)}`);
  assert(allTiles.length + state.remaining + state.deadWallSize === 64, '2p wall should total 64 tiles.');
  assert(deal.remaining === 24, `Expected opening remaining to be 24, got ${deal.remaining}.`);

  console.log('[PASS] p2-opening-counts');
  console.log(`  total=64 openingRemaining=${deal.remaining}`);
}

function validateSupplementRotation() {
  const service = createService();
  service.shan._pai = [
    'p1', 'p2', 'p3', 'p4',
    'z1', 'z2', 'z3', 'z4', 'z5',
    'z6', 'z7', 'p5', 'p6', 'p7',
    'p8', 'p9', 'p1', 'p2', 'p3', 'p4'
  ];

  const draws = [];
  for (let index = 0; index < 5; index += 1) {
    draws.push(service.drawKitaTile({ seat: 'bottom', reason: 'p2-wall-validation' }).tileCode);
  }

  const state = service.getState();

  assert(
    JSON.stringify(draws) === JSON.stringify(['p1', 'p2', 'p3', 'p4', 'p8']),
    `Unexpected 2p supplement draw order: ${JSON.stringify(draws)}`
  );
  assert(
    JSON.stringify(state.doraIndicators) === JSON.stringify(['z1', null, null, null, null]),
    `2p dora indicators were touched by supplement draws: ${JSON.stringify(state.doraIndicators)}`
  );
  assert(state.deadWallSize === 14, `Dead wall size should stay 14, got ${state.deadWallSize}.`);

  console.log('[PASS] p2-supplement-rotation');
  console.log(`  draws=${JSON.stringify(draws)} dora=${JSON.stringify(state.doraIndicators)}`);
}

function main() {
  validateOpeningCounts();
  validateSupplementRotation();
}

main();
