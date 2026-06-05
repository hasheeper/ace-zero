'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { SingleRoundRuntime } = require('../engine/runtime/single-round-runtime');
const {
  createCompositeDrawPolicy,
  createScriptedDrawPolicy
} = require('../engine/base/draw-policy');
const { createLuckDrawPolicy } = require('../engine/base/luck-draw-policy');

const PROJECT_DIR = path.resolve(__dirname, '..');
const BASE_CONFIG = JSON.parse(fs.readFileSync(path.join(PROJECT_DIR, 'game-config.json'), 'utf8'));
const INITIAL_HANDS = [
  ['m4', 'm5', 'm6', 'm7', 'm8', 'm9', 'p4', 'p5', 'p6', 's4', 's5', 'z1', 'z1'],
  ['m3', 'm4', 'm5', 'p3', 'p4', 'p5', 's4', 's5', 's6', 'z2', 'z2', 'z3', 'z3'],
  ['m6', 'm7', 'm8', 'p6', 'p7', 'p8', 's6', 's7', 's8', 'z4', 'z4', 'z5', 'z5'],
  ['m9', 'p7', 'p8', 'p9', 's7', 's8', 's9', 'z6', 'z6', 'z7', 'z7', 'm3', 'p3']
];

function pass(name) {
  console.log(`[PASS] ${name}`);
}

function createRuntime(drawPolicy, liveWallTiles) {
  const compositePolicy = createCompositeDrawPolicy([
    createScriptedDrawPolicy({ initialHands: INITIAL_HANDS }),
    drawPolicy
  ]);
  return new SingleRoundRuntime({
    ...BASE_CONFIG,
    drawPolicy: compositePolicy,
    testing: {
      runtimeSetup: {
        liveWallTiles: liveWallTiles.slice()
      }
    }
  });
}

function getLastPayload(runtime, type = 'tile:draw') {
  const event = runtime.eventLog.slice().reverse().find((entry) => entry.type === type);
  return event ? event.payload : null;
}

function findCandidate(audit, tileCode) {
  return audit.candidates.find((candidate) => candidate.tileCode === tileCode);
}

function countTile(tiles, tileCode) {
  return tiles.filter((tile) => tile === tileCode).length;
}

function assertFiniteWeights(audit) {
  audit.candidates.forEach((candidate) => {
    assert(Number.isFinite(candidate.finalWeight), `expected finite finalWeight, got ${JSON.stringify(candidate)}`);
    assert(candidate.finalWeight >= 0, `expected nonnegative finalWeight, got ${JSON.stringify(candidate)}`);
  });
}

function runPolicyDraw(policy, liveWallTiles, seat = 'bottom') {
  const runtime = createRuntime(policy, liveWallTiles);
  runtime.start();
  runtime.drawTile(seat);
  const payload = getLastPayload(runtime);
  assert(payload && payload.tileCode, `expected tile:draw payload, got ${JSON.stringify(payload)}`);
  return {
    runtime,
    payload,
    audit: typeof policy.getAuditLog === 'function' ? policy.getAuditLog().slice(-1)[0] : null
  };
}

function validatePassThroughWithoutForce() {
  const policy = createLuckDrawPolicy({
    id: 'luck-pass-through-smoke',
    seed: 'luck-pass-through',
    auditLimit: 10
  });
  const { payload, audit } = runPolicyDraw(policy, ['m1', 'p1', 's1']);

  assert.strictEqual(payload.source, 'live-shan', `expected pass-through draw source, got ${JSON.stringify(payload)}`);
  assert.strictEqual(payload.tileCode, 'm1', `expected live wall first draw m1, got ${JSON.stringify(payload)}`);
  assert(audit && audit.fallback && audit.fallback.reason === 'no-effective-luck-force', `expected no-force fallback audit, got ${JSON.stringify(audit)}`);
  pass('luck-draw-policy pass-through-without-force');
}

function validateFortuneBackendDraw() {
  const liveWallTiles = ['m1', 'p1', 'm1', 'p1', 's1', 's1'];
  const policy = createLuckDrawPolicy({
    id: 'luck-fortune-smoke',
    seed: 'luck-fortune',
    activeForces: [{ id: 'fortune-a', kind: 'fortune', power: 100 }],
    objectiveIntentBySeat: {
      bottom: { speed: 1, value: 0, safety: 0, commit: 0, pressure: 0, confidence: 1 }
    },
    windStateBySeat: {
      bottom: { mode: 'speed', intensity: 'medium' }
    },
    candidateLocalValues: {
      m1: { speed: 1 },
      p1: { speed: -1 },
      s1: { speed: 0 }
    },
    auditLimit: 10
  });
  const { runtime, payload, audit } = runPolicyDraw(policy, liveWallTiles);

  assert.strictEqual(payload.source, 'policy:luck-fortune-smoke', `expected policy draw source, got ${JSON.stringify(payload)}`);
  assert(payload.meta && payload.meta.luckAuditId === audit.auditId, `expected payload audit id to match, got ${JSON.stringify({ payload, audit })}`);
  assert.strictEqual(audit.selectedTileCode, payload.tileCode, `expected audit selected tile to match draw payload, got ${JSON.stringify({ payload, audit })}`);
  assertFiniteWeights(audit);

  const high = findCandidate(audit, 'm1');
  const low = findCandidate(audit, 'p1');
  assert(high.finalWeight > high.baseWeight, `expected fortune to raise high-score m1, got ${JSON.stringify(high)}`);
  assert(low.finalWeight <= low.baseWeight + 1e-12, `expected fortune not to raise low-score p1, got ${JSON.stringify(low)}`);

  const managedState = runtime.wallService.shan.__aceWallState;
  assert(managedState && Array.isArray(managedState.liveWall), 'expected managed live wall after draw');
  assert.strictEqual(
    countTile(managedState.liveWall, payload.tileCode),
    countTile(liveWallTiles, payload.tileCode) - 1,
    `expected selected tile to be removed from liveWall, got ${JSON.stringify(managedState.liveWall)}`
  );
  pass('luck-draw-policy fortune-backend-draw');
}

function validateCurseBackendWeights() {
  const policy = createLuckDrawPolicy({
    id: 'luck-curse-smoke',
    seed: 'luck-curse',
    activeForces: [{ id: 'curse-a', kind: 'curse', power: 100 }],
    objectiveIntentBySeat: {
      bottom: { speed: 1, value: 0, safety: 0, commit: 0, pressure: 0, confidence: 1 }
    },
    candidateLocalValues: {
      m1: { speed: 1 },
      p1: { speed: -1 },
      s1: { speed: 0 }
    },
    auditLimit: 10
  });
  const { audit } = runPolicyDraw(policy, ['m1', 'p1', 'm1', 'p1', 's1', 's1']);
  const high = findCandidate(audit, 'm1');
  const low = findCandidate(audit, 'p1');
  assert(low.finalWeight > low.baseWeight, `expected curse to raise low-score p1, got ${JSON.stringify(low)}`);
  assert(high.finalWeight <= high.baseWeight + 1e-12, `expected curse not to raise high-score m1, got ${JSON.stringify(high)}`);
  pass('luck-draw-policy curse-backend-weights');
}

function validateRuntimeForceStateTargeting() {
  const policy = createLuckDrawPolicy({
    id: 'luck-panel-curse-smoke',
    seed: 'luck-panel-curse',
    objectiveIntentBySeat: {
      top: { speed: 1, value: 0, safety: 0, commit: 0, pressure: 0, confidence: 1 },
      bottom: { speed: 1, value: 0, safety: 0, commit: 0, pressure: 0, confidence: 1 }
    },
    candidateLocalValues: {
      m1: { speed: 1 },
      p1: { speed: -1 },
      s1: { speed: 0 }
    },
    auditLimit: 10
  });
  const forceState = policy.setLuckForceState('bottom', {
    enabled: true,
    systemMode: 'on',
    sourceSeat: 'bottom',
    targetSeat: 'top',
    activeForces: [
      { id: 'player-bottom-curse', kind: 'curse', sourceSeat: 'bottom', targetSeat: 'top', power: 100 }
    ]
  });
  assert(forceState && forceState.activeForces.length === 1, `expected force state to register one curse, got ${JSON.stringify(forceState)}`);

  const topDraw = runPolicyDraw(policy, ['m1', 'p1', 'm1', 'p1', 's1', 's1'], 'top');
  const topHigh = findCandidate(topDraw.audit, 'm1');
  const topLow = findCandidate(topDraw.audit, 'p1');
  assert.strictEqual(topDraw.payload.source, 'policy:luck-panel-curse-smoke', `expected top draw to use curse policy, got ${JSON.stringify(topDraw.payload)}`);
  assert(topDraw.audit.resolvedForces && topDraw.audit.resolvedForces.dominantKind === 'curse', `expected top draw curse dominance, got ${JSON.stringify(topDraw.audit.resolvedForces)}`);
  assert(topLow.finalWeight > topLow.baseWeight, `expected target curse to raise low-score p1, got ${JSON.stringify(topLow)}`);
  assert(topHigh.finalWeight <= topHigh.baseWeight + 1e-12, `expected target curse not to raise high-score m1, got ${JSON.stringify(topHigh)}`);

  const bottomDraw = runPolicyDraw(policy, ['m1', 'p1', 'm1', 'p1', 's1', 's1'], 'bottom');
  assert.strictEqual(bottomDraw.payload.source, 'live-shan', `expected off-target bottom draw to pass through, got ${JSON.stringify(bottomDraw.payload)}`);
  assert(bottomDraw.audit.fallback && bottomDraw.audit.fallback.reason === 'no-effective-luck-force', `expected off-target fallback audit, got ${JSON.stringify(bottomDraw.audit)}`);
  pass('luck-draw-policy runtime-force-state-targeting');
}

function validateRuntimeForceStateMultiTargeting() {
  const policy = createLuckDrawPolicy({
    id: 'luck-panel-multi-curse-smoke',
    seed: 'luck-panel-multi-curse',
    objectiveIntentBySeat: {
      top: { speed: 1, value: 0, safety: 0, commit: 0, pressure: 0, confidence: 1 },
      left: { speed: 1, value: 0, safety: 0, commit: 0, pressure: 0, confidence: 1 },
      right: { speed: 1, value: 0, safety: 0, commit: 0, pressure: 0, confidence: 1 }
    },
    candidateLocalValues: {
      m1: { speed: 1 },
      p1: { speed: -1 },
      s1: { speed: 0 }
    },
    auditLimit: 10
  });
  policy.setLuckForceState('bottom', {
    enabled: true,
    systemMode: 'on',
    sourceSeat: 'bottom',
    activeForces: [
      { id: 'player-bottom-curse-top', kind: 'curse', sourceSeat: 'bottom', targetSeat: 'top', power: 60 },
      { id: 'player-bottom-curse-left', kind: 'curse', sourceSeat: 'bottom', targetSeat: 'left', power: 100 }
    ]
  });

  const topDraw = runPolicyDraw(policy, ['m1', 'p1', 'm1', 'p1', 's1', 's1'], 'top');
  assert.strictEqual(topDraw.payload.source, 'policy:luck-panel-multi-curse-smoke', `expected top curse draw from policy, got ${JSON.stringify(topDraw.payload)}`);
  assert.strictEqual(topDraw.audit.resolvedForces.sourceCount, 1, `expected top draw to see one matching curse, got ${JSON.stringify(topDraw.audit.resolvedForces)}`);
  assert.strictEqual(topDraw.audit.resolvedForces.activeForces[0].targetSeat, 'top', `expected top-target curse, got ${JSON.stringify(topDraw.audit.resolvedForces.activeForces)}`);

  const leftDraw = runPolicyDraw(policy, ['m1', 'p1', 'm1', 'p1', 's1', 's1'], 'left');
  assert.strictEqual(leftDraw.payload.source, 'policy:luck-panel-multi-curse-smoke', `expected left curse draw from policy, got ${JSON.stringify(leftDraw.payload)}`);
  assert.strictEqual(leftDraw.audit.resolvedForces.sourceCount, 1, `expected left draw to see one matching curse, got ${JSON.stringify(leftDraw.audit.resolvedForces)}`);
  assert.strictEqual(leftDraw.audit.resolvedForces.activeForces[0].targetSeat, 'left', `expected left-target curse, got ${JSON.stringify(leftDraw.audit.resolvedForces.activeForces)}`);

  const rightDraw = runPolicyDraw(policy, ['m1', 'p1', 'm1', 'p1', 's1', 's1'], 'right');
  assert.strictEqual(rightDraw.payload.source, 'live-shan', `expected un-targeted right draw to pass through, got ${JSON.stringify(rightDraw.payload)}`);
  assert(rightDraw.audit.fallback && rightDraw.audit.fallback.reason === 'no-effective-luck-force', `expected right pass-through fallback, got ${JSON.stringify(rightDraw.audit)}`);
  pass('luck-draw-policy runtime-force-state-multi-targeting');
}

function validateEqualTierCurseDominatesFortune() {
  const policy = createLuckDrawPolicy({
    id: 'luck-contested-curse-smoke',
    seed: 'luck-contested-curse',
    activeForces: [
      { id: 'fortune-a', kind: 'fortune', tier: 1, power: 100 },
      { id: 'curse-a', kind: 'curse', tier: 1, power: 100 }
    ],
    objectiveIntentBySeat: {
      bottom: { speed: 1, value: 0, safety: 0, commit: 0, pressure: 0, confidence: 1 }
    },
    candidateLocalValues: {
      m1: { speed: 1 },
      p1: { speed: -1 },
      s1: { speed: 0 }
    },
    auditLimit: 10
  });
  const { audit } = runPolicyDraw(policy, ['m1', 'p1', 'm1', 'p1', 's1', 's1']);
  const high = findCandidate(audit, 'm1');
  const low = findCandidate(audit, 'p1');

  assert(audit.resolvedForces && audit.resolvedForces.dominantKind === 'curse', `expected equal-tier curse to dominate, got ${JSON.stringify(audit.resolvedForces)}`);
  assert(low.finalWeight > low.baseWeight, `expected contested curse to raise low-score p1, got ${JSON.stringify(low)}`);
  assert(high.finalWeight <= high.baseWeight + 1e-12, `expected contested curse not to raise high-score m1, got ${JSON.stringify(high)}`);
  pass('luck-draw-policy equal-tier-curse-dominates-fortune');
}

function validateVoidDamping() {
  const commonOptions = {
    objectiveIntentBySeat: {
      bottom: { speed: 1, value: 0, safety: 0, commit: 0, pressure: 0, confidence: 1 }
    },
    candidateLocalValues: {
      m1: { speed: 1 },
      p1: { speed: -1 }
    },
    auditLimit: 10
  };
  const fortunePolicy = createLuckDrawPolicy({
    ...commonOptions,
    id: 'luck-fortune-only-smoke',
    seed: 'luck-void-compare',
    activeForces: [{ id: 'fortune-a', kind: 'fortune', power: 100 }]
  });
  const voidPolicy = createLuckDrawPolicy({
    ...commonOptions,
    id: 'luck-fortune-void-smoke',
    seed: 'luck-void-compare',
    activeForces: [
      { id: 'fortune-a', kind: 'fortune', power: 100 },
      { id: 'void-a', kind: 'void', power: 50 }
    ]
  });
  const fortuneAudit = runPolicyDraw(fortunePolicy, ['m1', 'p1', 'm1', 'p1']).audit;
  const voidAudit = runPolicyDraw(voidPolicy, ['m1', 'p1', 'm1', 'p1']).audit;
  const fortuneHigh = findCandidate(fortuneAudit, 'm1');
  const voidHigh = findCandidate(voidAudit, 'm1');

  assert(voidHigh.finalWeight < fortuneHigh.finalWeight, `expected void to dampen fortune weight, got ${JSON.stringify({ fortuneHigh, voidHigh })}`);
  assert(voidHigh.finalWeight > voidHigh.baseWeight, `expected dampened fortune to remain active, got ${JSON.stringify(voidHigh)}`);
  pass('luck-draw-policy void-damping');
}

function validateSeedReplay() {
  function drawOnce() {
    const policy = createLuckDrawPolicy({
      id: 'luck-replay-smoke',
      seed: 'luck-replay',
      activeForces: [{ id: 'fortune-a', kind: 'fortune', power: 100 }],
      objectiveIntentBySeat: {
        bottom: { speed: 1, value: 0, safety: 0, commit: 0, pressure: 0, confidence: 1 }
      },
      candidateLocalValues: {
        m1: { speed: 1 },
        p1: { speed: -1 },
        s1: { speed: 0.25 }
      },
      auditLimit: 10
    });
    return runPolicyDraw(policy, ['m1', 'p1', 's1', 'm1', 'p1', 's1']);
  }

  const first = drawOnce();
  const second = drawOnce();
  assert.strictEqual(first.payload.tileCode, second.payload.tileCode, `expected same selected tile, got ${JSON.stringify({ first: first.payload, second: second.payload })}`);
  assert.strictEqual(first.audit.seed, second.audit.seed, `expected same audit seed, got ${JSON.stringify({ first: first.audit.seed, second: second.audit.seed })}`);
  assert.strictEqual(first.audit.randomRoll, second.audit.randomRoll, `expected same roll, got ${JSON.stringify({ first: first.audit.randomRoll, second: second.audit.randomRoll })}`);
  pass('luck-draw-policy seed-replay');
}

function validateScriptedPolicyCompatibility() {
  const policy = createScriptedDrawPolicy({
    id: 'scripted-string-compat',
    draws: ['p9']
  });
  const { payload } = runPolicyDraw(policy, ['m1', 'p9', 's1']);
  assert.strictEqual(payload.tileCode, 'p9', `expected scripted string policy to draw p9, got ${JSON.stringify(payload)}`);
  assert(/^policy:/.test(payload.source), `expected policy source, got ${JSON.stringify(payload)}`);
  assert(payload.meta && payload.meta.hook === 'chooseDraw', `expected scripted policy metadata, got ${JSON.stringify(payload)}`);
  pass('luck-draw-policy scripted-string-compat');
}

function main() {
  validatePassThroughWithoutForce();
  validateFortuneBackendDraw();
  validateCurseBackendWeights();
  validateRuntimeForceStateTargeting();
  validateRuntimeForceStateMultiTargeting();
  validateEqualTierCurseDominatesFortune();
  validateVoidDamping();
  validateSeedReplay();
  validateScriptedPolicyCompatibility();
}

main();
