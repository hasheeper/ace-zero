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
  ['m1', 'm2', 'm4', 'm5', 'p7', 'p8', 's2', 's3', 'z1', 'z1', 'z5', 'z6', 'z7'],
  ['m6', 'm7', 'm8', 'p1', 'p2', 'p3', 's4', 's5', 's6', 'z2', 'z2', 'z3', 'z3'],
  ['m1', 'm2', 'm3', 'p4', 'p5', 'p6', 's7', 's8', 's9', 'z4', 'z4', 'z5', 'z6'],
  ['m7', 'm8', 'm9', 'p1', 'p2', 'p3', 's1', 's1', 's2', 's3', 'z7', 'z7', 'p9']
];

function pass(name) {
  console.log(`[PASS] ${name}`);
}

function createRuntime(luckPolicy, liveWallTiles) {
  const drawPolicy = createCompositeDrawPolicy([
    createScriptedDrawPolicy({ initialHands: INITIAL_HANDS }),
    luckPolicy
  ]);
  return new SingleRoundRuntime({
    ...BASE_CONFIG,
    drawPolicy,
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

function validateAutoSpeedIntent() {
  const luckPolicy = createLuckDrawPolicy({
    id: 'luck-auto-speed',
    seed: 'luck-auto-speed',
    activeForces: [{ id: 'fortune-a', kind: 'fortune', power: 100 }],
    auditLimit: 10
  });
  const runtime = createRuntime(luckPolicy, ['m3', 'z2', 'm3', 'z2', 'p9', 's9']);
  runtime.start();
  runtime.drawTile('bottom');

  const audit = luckPolicy.getAuditLog()[0];
  const m3 = findCandidate(audit, 'm3');
  const z2 = findCandidate(audit, 'z2');
  const lastEvent = runtime.eventLog[runtime.eventLog.length - 1];

  assert(audit && audit.objectiveIntent, `expected auto audit, got ${JSON.stringify(audit)}`);
  assert(m3 && z2, `expected m3 and z2 candidates, got ${JSON.stringify(audit && audit.candidates)}`);
  assert(m3.localValue.speed > z2.localValue.speed, `expected m3 speed value > z2, got ${JSON.stringify({ m3, z2 })}`);
  assert(m3.intentScore > z2.intentScore, `expected m3 intentScore > z2, got ${JSON.stringify({ m3, z2 })}`);
  assert(m3.finalWeight > z2.finalWeight, `expected fortune to weight auto speed candidate higher, got ${JSON.stringify({ m3, z2 })}`);
  assert(
    lastEvent
    && lastEvent.payload
    && lastEvent.payload.meta
    && lastEvent.payload.meta.autoEvaluation
    && lastEvent.payload.meta.autoEvaluation.candidateCount >= 2,
    `expected draw payload to include autoEvaluation diagnostics, got ${JSON.stringify(lastEvent)}`
  );
  pass('luck-auto-intent speed-evaluation');
}

function validateAutoSafetyIntent() {
  const luckPolicy = createLuckDrawPolicy({
    id: 'luck-auto-safety',
    seed: 'luck-auto-safety',
    activeForces: [{ id: 'fortune-a', kind: 'fortune', power: 100 }],
    windStateBySeat: {
      bottom: { mode: 'safety', intensity: 'strong' }
    },
    auditLimit: 10
  });
  const runtime = createRuntime(luckPolicy, ['z2', 'm5', 'z2', 'm5', 'p9', 's9']);
  runtime.start();

  const topIndex = runtime.getSeatIndex('top');
  runtime.riichiState.top.declared = true;
  runtime.board.he[topIndex]._pai = ['z2*'];
  runtime.drawTile('bottom');

  const audit = luckPolicy.getAuditLog()[0];
  const z2 = findCandidate(audit, 'z2');
  const m5 = findCandidate(audit, 'm5');

  assert(audit.objectiveIntent.safety > audit.objectiveIntent.speed, `expected pressure to raise safety intent, got ${JSON.stringify(audit.objectiveIntent)}`);
  assert(audit.compositeIntent.safety > audit.objectiveIntent.safety, `expected safety wind to further raise safety intent, got ${JSON.stringify({ objective: audit.objectiveIntent, composite: audit.compositeIntent })}`);
  assert(z2.localValue.safety > m5.localValue.safety, `expected genbutsu z2 safety > m5, got ${JSON.stringify({ z2, m5 })}`);
  assert(z2.finalWeight > m5.finalWeight, `expected safety fortune to weight z2 higher, got ${JSON.stringify({ z2, m5 })}`);
  pass('luck-auto-intent safety-evaluation');
}

function main() {
  validateAutoSpeedIntent();
  validateAutoSafetyIntent();
}

main();
