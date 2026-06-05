'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const commitRoutes = require('../engine/base/luck-commit-route-evaluator');
const { SingleRoundRuntime } = require('../engine/runtime/single-round-runtime');
const {
  createCompositeDrawPolicy,
  createScriptedDrawPolicy
} = require('../engine/base/draw-policy');
const { createLuckDrawPolicy } = require('../engine/base/luck-draw-policy');

const PROJECT_DIR = path.resolve(__dirname, '..');
const BASE_CONFIG = JSON.parse(fs.readFileSync(path.join(PROJECT_DIR, 'game-config.json'), 'utf8'));

const INITIAL_HANDS = [
  ['m1', 'm2', 'm4', 'm5', 'm6', 'm7', 'm8', 'z1', 'z1', 'p9', 's9', 'z5', 'z6'],
  ['p1', 'p2', 'p3', 's1', 's2', 's3', 'm7', 'm8', 'm9', 'z2', 'z2', 'z3', 'z3'],
  ['m1', 'm2', 'm3', 'p4', 'p5', 'p6', 's7', 's8', 's9', 'z4', 'z4', 'z5', 'z6'],
  ['m7', 'm8', 'm9', 'p1', 'p2', 'p3', 's1', 's1', 's2', 's3', 'z7', 'z7', 'p9']
];

function pass(name) {
  console.log(`[PASS] ${name}`);
}

function createRuntime(luckPolicy, liveWallTiles) {
  return new SingleRoundRuntime({
    ...BASE_CONFIG,
    drawPolicy: createCompositeDrawPolicy([
      createScriptedDrawPolicy({ initialHands: INITIAL_HANDS }),
      luckPolicy
    ]),
    testing: {
      runtimeSetup: {
        liveWallTiles: liveWallTiles.slice()
      }
    }
  });
}

function findCandidate(audit, tileCode) {
  return audit.candidates.find((candidate) => candidate.tileCode === tileCode);
}

function validateSuitRouteDetectionAndScoring() {
  const input = {
    seat: 'bottom',
    dealerSeat: 'bottom',
    activeSeats: ['bottom', 'right', 'top', 'left'],
    handCodes: ['m1', 'm2', 'm4', 'm5', 'm6', 'm7', 'm8', 'z1', 'z1', 'p9', 's9', 'z5', 'z6'],
    roundConfig: { zhuangfeng: 0 },
    wallState: { doraIndicators: ['p4'], revealedDoraCount: 1 }
  };
  const selection = commitRoutes.buildCommitRouteSelection(input, 'suit-m');
  const m3Score = commitRoutes.scoreRouteTile('m3', input, selection);
  const p3Score = commitRoutes.scoreRouteTile('p3', input, selection);

  assert.strictEqual(selection.selectedRouteId, 'suit-m', `expected suit-m selection, got ${JSON.stringify(selection)}`);
  assert(selection.routeConfidence >= 0.35, `expected selectable suit-m confidence, got ${JSON.stringify(selection)}`);
  assert(m3Score > p3Score, `expected m3 commit score > p3, got ${JSON.stringify({ m3Score, p3Score, selection })}`);
  pass('luck-commit-routes suit-route-detection-and-scoring');
}

function validateLowConfidenceRouteDamping() {
  const input = {
    seat: 'bottom',
    dealerSeat: 'bottom',
    activeSeats: ['bottom', 'right', 'top', 'left'],
    handCodes: ['m1', 'm2', 'm4', 'm5', 'm6', 'm7', 'm8', 'z1', 'z1', 'p9', 's9', 'z5', 'z6'],
    roundConfig: { zhuangfeng: 0 },
    wallState: {}
  };
  const selection = commitRoutes.buildCommitRouteSelection(input, 'suit-s');
  const s3Score = commitRoutes.scoreRouteTile('s3', input, selection);

  assert.strictEqual(selection.selectedRouteId, 'suit-s', `expected requested low route to be tracked, got ${JSON.stringify(selection)}`);
  assert.strictEqual(selection.blockedReason, 'route-confidence-too-low', `expected low route blocked reason, got ${JSON.stringify(selection)}`);
  assert(selection.routeConfidence < 0.2, `expected invalid route confidence to be damped, got ${JSON.stringify(selection)}`);
  assert(s3Score < 0.2, `expected damped invalid route score, got ${JSON.stringify({ s3Score, selection })}`);
  pass('luck-commit-routes low-confidence-route-damping');
}

function validateDoraRouteUsesVisibleDoraInHand() {
  const base = {
    seat: 'bottom',
    dealerSeat: 'bottom',
    activeSeats: ['bottom', 'right', 'top', 'left'],
    roundConfig: { zhuangfeng: 0 },
    wallState: { doraIndicators: ['m4'], revealedDoraCount: 1 }
  };
  const withDora = commitRoutes.buildCommitRouteSelection({
    ...base,
    handCodes: ['m5', 'm5', 'm2', 'm3', 'p7', 'p8', 's2', 's3', 'z1', 'z2', 'z5', 'z6', 'z7']
  }, 'dora');
  const withoutDora = commitRoutes.buildCommitRouteSelection({
    ...base,
    handCodes: ['m1', 'm2', 'm3', 'p7', 'p8', 'p9', 's2', 's3', 'z1', 'z2', 'z5', 'z6', 'z7']
  }, 'dora');

  assert(withDora.routeConfidence > withoutDora.routeConfidence, `expected visible dora in hand to raise dora confidence, got ${JSON.stringify({ withDora, withoutDora })}`);
  assert.strictEqual(withoutDora.blockedReason, 'route-confidence-too-low', `expected no-dora route to be blocked, got ${JSON.stringify(withoutDora)}`);
  pass('luck-commit-routes visible-dora-gating');
}

function validatePolicyCommitRouteWeights() {
  const policy = createLuckDrawPolicy({
    id: 'luck-commit-route-policy',
    seed: 'luck-commit-route-policy',
    activeForces: [{ id: 'fortune-a', kind: 'fortune', power: 100 }],
    windStateBySeat: {
      bottom: { systemMode: 'on', mode: 'commit', intensity: 'strong', commitRouteId: 'suit-m' }
    },
    auditLimit: 10
  });
  const runtime = createRuntime(policy, ['m3', 'p3', 'm3', 'p3', 's3', 's3']);
  runtime.start();
  runtime.drawTile('bottom');

  const audit = policy.getAuditLog()[0];
  const m3 = findCandidate(audit, 'm3');
  const p3 = findCandidate(audit, 'p3');
  const routeSelection = audit
    && audit.resolvedForces
    && audit.resolvedForces.activeForces
    ? audit.windState
    : null;
  const autoEvaluation = runtime.eventLog[runtime.eventLog.length - 1].payload.meta.autoEvaluation;

  assert(audit && audit.windState && audit.windState.commitRouteId === 'suit-m', `expected audit windState route, got ${JSON.stringify(audit && audit.windState)}`);
  assert(audit.windState.routeConfidence >= 0.35, `expected audit route confidence, got ${JSON.stringify(audit.windState)}`);
  assert(autoEvaluation && autoEvaluation.commitRouteSelection, `expected public meta autoEvaluation commit route selection, got ${JSON.stringify(autoEvaluation)}`);
  assert(routeSelection, `expected route-aware audit, got ${JSON.stringify(audit)}`);
  assert(m3 && p3, `expected m3/p3 candidates, got ${JSON.stringify(audit && audit.candidates)}`);
  assert(m3.localValue.commit > p3.localValue.commit, `expected suit-m commit value to prefer m3, got ${JSON.stringify({ m3, p3 })}`);
  assert(m3.intentScore > p3.intentScore, `expected commit route intent score to prefer m3, got ${JSON.stringify({ m3, p3 })}`);
  assert(m3.finalWeight > p3.finalWeight, `expected fortune + commit route to weight m3 above p3, got ${JSON.stringify({ m3, p3 })}`);
  pass('luck-commit-routes policy-route-weights');
}

function main() {
  validateSuitRouteDetectionAndScoring();
  validateLowConfidenceRouteDamping();
  validateDoraRouteUsesVisibleDoraInHand();
  validatePolicyCommitRouteWeights();
}

main();
