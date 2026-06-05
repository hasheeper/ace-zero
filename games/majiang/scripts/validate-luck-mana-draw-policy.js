'use strict';

const assert = require('assert');
const luck = require('../shared/runtime/luck');
const { createLuckDrawPolicy } = require('../engine/base/luck-draw-policy');

function pass(name) {
  console.log(`[PASS] ${name}`);
}

function createPolicy(options = {}) {
  return createLuckDrawPolicy({
    id: 'luck-mana-policy-smoke',
    seed: 'luck-mana-policy',
    activeForces: [
      {
        id: 'self-fortune-medium',
        kind: 'fortune',
        sourceSeat: 'bottom',
        targetSeat: 'bottom',
        power: 100
      },
      {
        id: 'top-curse-light',
        kind: 'curse',
        sourceSeat: 'bottom',
        targetSeat: 'top',
        power: 60
      }
    ],
    objectiveIntentBySeat: {
      bottom: { speed: 1, value: 0, safety: 0, commit: 0, pressure: 0, confidence: 1 },
      top: { speed: 1, value: 0, safety: 0, commit: 0, pressure: 0, confidence: 1 }
    },
    candidateLocalValues: {
      m1: { speed: 1 },
      p1: { speed: -1 },
      s1: { speed: 0 }
    },
    auditLimit: 20,
    ...options
  });
}

function choose(policy, seat, liveWall = ['m1', 'p1', 's1', 'm1', 'p1', 's1']) {
  return policy.chooseDraw({
    seat,
    wallState: {
      liveWall: liveWall.slice()
    }
  });
}

function assertNoPublicDecimal(value, message) {
  const json = JSON.stringify(value);
  assert(!/-?\d+\.\d+/.test(json), `${message}: expected public summary without decimals, got ${json}`);
}

function getBottomMana(policy) {
  const state = policy.getLuckManaState();
  return state && state.seats && state.seats.bottom ? state.seats.bottom : null;
}

function validateSkillSpendOnSuccessfulDraw() {
  const policy = createPolicy();
  const fortuneResult = choose(policy, 'bottom');
  assert(fortuneResult && fortuneResult.tileCode, `expected fortune draw result, got ${JSON.stringify(fortuneResult)}`);
  assert(fortuneResult.meta && fortuneResult.meta.luckManaSummary, `expected fortune mana summary, got ${JSON.stringify(fortuneResult)}`);
  assert.strictEqual(fortuneResult.meta.luckManaSummary.manaDelta, -11, `expected medium fortune at 3 focus to cost 11, got ${JSON.stringify(fortuneResult.meta.luckManaSummary)}`);
  assert.strictEqual(getBottomMana(policy).mana, 989, `expected bottom mana 989, got ${JSON.stringify(getBottomMana(policy))}`);
  assertNoPublicDecimal(fortuneResult.meta.luckPublicSummary, 'fortune public summary');

  const curseResult = choose(policy, 'top');
  assert(curseResult && curseResult.tileCode, `expected curse draw result, got ${JSON.stringify(curseResult)}`);
  assert(curseResult.meta && curseResult.meta.luckManaSummary, `expected curse mana summary, got ${JSON.stringify(curseResult)}`);
  assert.strictEqual(curseResult.meta.luckManaSummary.manaDelta, -6, `expected light curse at 3 focus to cost 6, got ${JSON.stringify(curseResult.meta.luckManaSummary)}`);
  assert.strictEqual(getBottomMana(policy).mana, 983, `expected bottom mana 983, got ${JSON.stringify(getBottomMana(policy))}`);
  assert.strictEqual(curseResult.meta.luckPublicSummary.dominantKind, 'curse', `expected top draw curse dominance, got ${JSON.stringify(curseResult.meta.luckPublicSummary)}`);
  assertNoPublicDecimal(curseResult.meta.luckPublicSummary, 'curse public summary');
  pass('luck-mana-draw-policy skill-spend-on-successful-draw');
}

function validateSeedReplayManaDelta() {
  function runOnce() {
    const policy = createPolicy({
      id: 'luck-mana-replay-smoke',
      seed: 'luck-mana-replay'
    });
    const result = choose(policy, 'bottom');
    const audit = policy.getAuditLog().slice(-1)[0];
    return {
      tileCode: result && result.tileCode,
      roll: audit && audit.randomRoll,
      manaSummary: result && result.meta ? result.meta.luckManaSummary : null,
      manaState: policy.getLuckManaState()
    };
  }

  const first = runOnce();
  const second = runOnce();
  assert.strictEqual(first.tileCode, second.tileCode, `expected same tile under same seed, got ${JSON.stringify({ first, second })}`);
  assert.strictEqual(first.roll, second.roll, `expected same roll under same seed, got ${JSON.stringify({ first, second })}`);
  assert.strictEqual(first.manaSummary.manaDelta, second.manaSummary.manaDelta, `expected same mana delta under same seed, got ${JSON.stringify({ first, second })}`);
  assert.strictEqual(first.manaState.seats.bottom.mana, second.manaState.seats.bottom.mana, `expected same mana state under same seed, got ${JSON.stringify({ first, second })}`);
  pass('luck-mana-draw-policy seed-replay-mana');
}

function validateManaEmptyBlocksForces() {
  const policy = createPolicy({
    id: 'luck-mana-empty-smoke',
    seed: 'luck-mana-empty',
    manaState: luck.createInitialManaState({
      initialMana: 0,
      maxMana: 1000
    })
  });
  const result = choose(policy, 'bottom');
  assert.strictEqual(result, null, `expected mana-empty policy to pass through, got ${JSON.stringify(result)}`);
  const audit = policy.getAuditLog().slice(-1)[0];
  assert(audit && audit.fallback && audit.fallback.reason === 'no-effective-luck-force', `expected no-effective fallback, got ${JSON.stringify(audit)}`);
  assert(audit.resolvedForces && Array.isArray(audit.resolvedForces.manaIgnoredForces), `expected mana ignored forces, got ${JSON.stringify(audit)}`);
  assert(audit.resolvedForces.manaIgnoredForces.some((force) => force.manaIgnoredReason === 'source-mana-empty'), `expected source-mana-empty reason, got ${JSON.stringify(audit.resolvedForces.manaIgnoredForces)}`);
  assert.strictEqual(getBottomMana(policy).mana, 0, `expected bottom mana to stay 0, got ${JSON.stringify(getBottomMana(policy))}`);
  assert.strictEqual(getBottomMana(policy).manaLocked, true, `expected bottom mana locked, got ${JSON.stringify(getBottomMana(policy))}`);
  assert.strictEqual(getBottomMana(policy).manaBroken, false, `expected bottom mana not broken, got ${JSON.stringify(getBottomMana(policy))}`);
  pass('luck-mana-draw-policy mana-empty-blocks-forces');
}

function main() {
  validateSkillSpendOnSuccessfulDraw();
  validateSeedReplayManaDelta();
  validateManaEmptyBlocksForces();
}

main();
