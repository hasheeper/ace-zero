'use strict';

const assert = require('assert');

const luck = require('../shared/runtime/luck');

function assertAlmostEqual(actual, expected, message, epsilon = 1e-12) {
  assert(
    Math.abs(actual - expected) <= epsilon,
    `${message}: expected ${expected}, got ${actual}`
  );
}

function findCandidate(candidates, tileCode) {
  return candidates.find((candidate) => candidate.tileCode === tileCode);
}

function sumWeights(candidates) {
  return candidates.reduce((sum, candidate) => sum + candidate.finalWeight, 0);
}

function pass(name) {
  console.log(`[PASS] ${name}`);
}

function runTileCountsSmoke() {
  const counts = luck.buildTileCountsFromWall(['m1', 'm1*', 'm0', 'm5+', 'p9-', 'x9', null]);
  assert.strictEqual(counts.m1, 2, `expected m1 count to normalize suffixes, got ${JSON.stringify(counts)}`);
  assert.strictEqual(counts.m5, 2, `expected red five m0 to normalize to m5, got ${JSON.stringify(counts)}`);
  assert.strictEqual(counts.p9, 1, `expected p9 suffix to normalize, got ${JSON.stringify(counts)}`);
  assert.strictEqual(counts.x9, undefined, `expected invalid tile to be ignored, got ${JSON.stringify(counts)}`);

  const liveWallCounts = luck.buildTileCountsFromWall({ liveWall: ['s1', 's1', 'z7'] });
  assert.strictEqual(liveWallCounts.s1, 2, `expected liveWall s1 count, got ${JSON.stringify(liveWallCounts)}`);
  assert.strictEqual(liveWallCounts.z7, 1, `expected liveWall z7 count, got ${JSON.stringify(liveWallCounts)}`);

  const candidates = luck.buildCandidateDraws({ tileCounts: counts });
  assert(findCandidate(candidates, 'm1'), 'expected m1 to enter candidates');
  assert(!findCandidate(candidates, 's9'), 'expected zero-count s9 to stay out of candidates');
  pass('luck-runtime tile-counts');
}

function runSamplerSeedSmoke() {
  const candidates = [
    { tileCode: 'm1', remainingCount: 1, baseWeight: 1, finalWeight: 1 },
    { tileCode: 'p1', remainingCount: 1, baseWeight: 1, finalWeight: 3 },
    { tileCode: 's1', remainingCount: 1, baseWeight: 1, finalWeight: 5 }
  ];
  const first = luck.sampleWeightedDraw(candidates, luck.createSeededRng('sampler-seed'));
  const second = luck.sampleWeightedDraw(candidates, luck.createSeededRng('sampler-seed'));
  assert.strictEqual(first.selectedTileCode, second.selectedTileCode, 'expected seeded sampler to select same tile');
  assertAlmostEqual(first.randomRoll, second.randomRoll, 'expected seeded sampler to reuse same roll');
  pass('luck-runtime seeded-sampler');
}

function buildScoredCandidates({ activeForces = [], policy = {}, candidateLocalValues = {}, windState = null } = {}) {
  const context = {
    seat: 'bottom',
    drawKind: luck.DRAW_KINDS.NORMAL,
    objectiveIntent: {
      speed: 1,
      value: 0,
      safety: 0,
      commit: 0,
      pressure: 0,
      confidence: 1
    },
    windState: windState || { mode: luck.WIND_MODES.AUTO, intensity: luck.WIND_INTENSITIES.LIGHT },
    activeForces,
    policy,
    candidateLocalValues
  };
  const tileCounts = luck.buildTileCountsFromWall(['m1', 'm1', 'p1', 'p1', 's1', 's1']);
  const candidates = luck.buildCandidateDraws({ tileCounts, context });
  const objectiveIntent = luck.buildObjectiveIntent(context);
  const compositeIntent = luck.applyWindAdjustment(objectiveIntent, context.windState, context);
  const resolvedForces = luck.resolveForces(activeForces, context);
  return {
    context,
    objectiveIntent,
    compositeIntent,
    resolvedForces,
    candidates: luck.scoreCandidateDraws(candidates, compositeIntent, resolvedForces, context.policy)
  };
}

function runClampSmoke() {
  const scored = buildScoredCandidates({
    activeForces: [{ id: 'huge-fortune', kind: luck.FORCE_KINDS.FORTUNE, power: 10000 }],
    policy: {
      temperature: 100,
      minFactor: 0.2,
      maxFactor: 2,
      forcePowerScale: 1
    },
    candidateLocalValues: {
      m1: { speed: 1, shape: 1 },
      p1: { speed: -1, volatility: 1 },
      s1: { speed: 0 }
    }
  });

  scored.candidates.forEach((candidate) => {
    assert(Number.isFinite(candidate.finalWeight), `expected finite finalWeight, got ${JSON.stringify(candidate)}`);
    assert(candidate.finalWeight >= 0, `expected nonnegative finalWeight, got ${JSON.stringify(candidate)}`);
    assert(candidate.finalWeight <= candidate.baseWeight * 2 + 1e-12, `expected max clamp, got ${JSON.stringify(candidate)}`);
  });
  pass('luck-runtime weight-clamp');
}

function runNoForceSmoke() {
  const scored = buildScoredCandidates({
    candidateLocalValues: {
      m1: { speed: 1 },
      p1: { speed: -1 },
      s1: { speed: 0.5 }
    }
  });
  scored.candidates.forEach((candidate) => {
    assertAlmostEqual(candidate.finalWeight, candidate.remainingCount, `expected no-force weight to equal remaining count for ${candidate.tileCode}`);
  });
  pass('luck-runtime no-force-base-distribution');
}

function runFortuneSmoke() {
  const scored = buildScoredCandidates({
    activeForces: [{ id: 'fortune-a', kind: luck.FORCE_KINDS.FORTUNE, power: 100 }],
    candidateLocalValues: {
      m1: { speed: 1 },
      p1: { speed: -1 },
      s1: { speed: 0 }
    }
  });
  const high = findCandidate(scored.candidates, 'm1');
  const low = findCandidate(scored.candidates, 'p1');
  const neutral = findCandidate(scored.candidates, 's1');
  assert(high.finalWeight > high.baseWeight, `expected fortune to raise high-score candidate, got ${JSON.stringify(high)}`);
  assertAlmostEqual(low.finalWeight, low.baseWeight, 'expected fortune not to raise negative-score candidate');
  assertAlmostEqual(neutral.finalWeight, neutral.baseWeight, 'expected fortune not to raise neutral candidate');
  pass('luck-runtime fortune-bias');
}

function runCurseSmoke() {
  const scored = buildScoredCandidates({
    activeForces: [{ id: 'curse-a', kind: luck.FORCE_KINDS.CURSE, power: 100 }],
    candidateLocalValues: {
      m1: { speed: 1 },
      p1: { speed: -1 },
      s1: { speed: 0 }
    }
  });
  const high = findCandidate(scored.candidates, 'm1');
  const low = findCandidate(scored.candidates, 'p1');
  assert(low.finalWeight > low.baseWeight, `expected curse to raise low-score candidate, got ${JSON.stringify(low)}`);
  assertAlmostEqual(high.finalWeight, high.baseWeight, 'expected curse not to raise positive-score candidate');
  pass('luck-runtime curse-bias');
}

function runCurseDominatesEqualFortuneSmoke() {
  const scored = buildScoredCandidates({
    activeForces: [
      { id: 'fortune-a', kind: luck.FORCE_KINDS.FORTUNE, tier: 1, power: 100 },
      { id: 'curse-a', kind: luck.FORCE_KINDS.CURSE, tier: 1, power: 100 }
    ],
    candidateLocalValues: {
      m1: { speed: 1 },
      p1: { speed: -1 },
      s1: { speed: 0 }
    }
  });
  const high = findCandidate(scored.candidates, 'm1');
  const low = findCandidate(scored.candidates, 'p1');
  assert.strictEqual(scored.resolvedForces.dominantKind, luck.FORCE_KINDS.CURSE, `expected equal-tier curse to dominate, got ${JSON.stringify(scored.resolvedForces)}`);
  assertAlmostEqual(scored.resolvedForces.fortuneBias, 0, 'expected equal-tier fortune to be suppressed by curse');
  assertAlmostEqual(scored.resolvedForces.curseBias, 0.55, 'expected equal-tier curse to keep default residual bias');
  assert(low.finalWeight > low.baseWeight, `expected contested curse to raise low-score candidate, got ${JSON.stringify(low)}`);
  assertAlmostEqual(high.finalWeight, high.baseWeight, 'expected contested curse not to raise positive-score candidate');
  pass('luck-runtime equal-tier-curse-dominates-fortune');
}

function runStrongFortuneOvertakesEqualCurseSmoke() {
  const scored = buildScoredCandidates({
    activeForces: [
      { id: 'fortune-a', kind: luck.FORCE_KINDS.FORTUNE, tier: 1, power: 200 },
      { id: 'curse-a', kind: luck.FORCE_KINDS.CURSE, tier: 1, power: 100 }
    ],
    candidateLocalValues: {
      m1: { speed: 1 },
      p1: { speed: -1 },
      s1: { speed: 0 }
    }
  });
  const high = findCandidate(scored.candidates, 'm1');
  const low = findCandidate(scored.candidates, 'p1');
  assert.strictEqual(scored.resolvedForces.dominantKind, luck.FORCE_KINDS.FORTUNE, `expected much stronger fortune to overtake equal-tier curse, got ${JSON.stringify(scored.resolvedForces)}`);
  assert(scored.resolvedForces.fortuneBias > 0, `expected residual fortune bias, got ${JSON.stringify(scored.resolvedForces)}`);
  assertAlmostEqual(scored.resolvedForces.curseBias, 0, 'expected overtaken curse bias to be suppressed');
  assert(high.finalWeight > high.baseWeight, `expected stronger fortune to raise high-score candidate, got ${JSON.stringify(high)}`);
  assertAlmostEqual(low.finalWeight, low.baseWeight, 'expected stronger fortune not to raise negative-score candidate');
  pass('luck-runtime stronger-fortune-can-overtake-curse');
}

function runForceTargetingSmoke() {
  const scored = buildScoredCandidates({
    activeForces: [
      { id: 'curse-left-only', kind: luck.FORCE_KINDS.CURSE, targetSeat: 'left', power: 100 }
    ],
    candidateLocalValues: {
      m1: { speed: 1 },
      p1: { speed: -1 }
    }
  });
  const low = findCandidate(scored.candidates, 'p1');

  assert.strictEqual(scored.resolvedForces.sourceCount, 0, `expected off-target force to be ignored, got ${JSON.stringify(scored.resolvedForces)}`);
  assert.strictEqual(scored.resolvedForces.ignoredForces.length, 1, `expected ignored force record, got ${JSON.stringify(scored.resolvedForces)}`);
  assertAlmostEqual(low.finalWeight, low.baseWeight, 'expected off-target curse not to change weights');
  pass('luck-runtime force-targeting');
}

function runSameKindStackingSmoke() {
  const scored = buildScoredCandidates({
    activeForces: [
      { id: 'curse-a', kind: luck.FORCE_KINDS.CURSE, sourceSeat: 'left', targetSeat: 'bottom', power: 100 },
      { id: 'curse-b', kind: luck.FORCE_KINDS.CURSE, sourceSeat: 'right', targetSeat: 'bottom', power: 100 }
    ],
    candidateLocalValues: {
      m1: { speed: 1 },
      p1: { speed: -1 }
    }
  });
  const low = findCandidate(scored.candidates, 'p1');

  assertAlmostEqual(scored.resolvedForces.curseBias, 1.55, 'expected second same-kind curse to stack with diminishing factor');
  assert(low.finalWeight > low.baseWeight, `expected stacked curse to raise low-score candidate, got ${JSON.stringify(low)}`);
  pass('luck-runtime same-kind-force-stacking');
}

function runVoidSmoke() {
  const fortuneOnly = buildScoredCandidates({
    activeForces: [{ id: 'fortune-a', kind: luck.FORCE_KINDS.FORTUNE, power: 100 }],
    candidateLocalValues: {
      m1: { speed: 1 },
      p1: { speed: -1 }
    }
  });
  const withVoid = buildScoredCandidates({
    activeForces: [
      { id: 'fortune-a', kind: luck.FORCE_KINDS.FORTUNE, power: 100 },
      { id: 'void-a', kind: luck.FORCE_KINDS.VOID, power: 50 }
    ],
    candidateLocalValues: {
      m1: { speed: 1 },
      p1: { speed: -1 }
    }
  });
  const fortuneHigh = findCandidate(fortuneOnly.candidates, 'm1');
  const voidHigh = findCandidate(withVoid.candidates, 'm1');
  assert(withVoid.resolvedForces.voidDamping > 0, `expected void damping, got ${JSON.stringify(withVoid.resolvedForces)}`);
  assert(voidHigh.finalWeight < fortuneHigh.finalWeight, `expected void to dampen fortune influence, got ${voidHigh.finalWeight} vs ${fortuneHigh.finalWeight}`);
  assert(voidHigh.finalWeight > voidHigh.baseWeight, `expected dampened fortune to still be active, got ${JSON.stringify(voidHigh)}`);
  pass('luck-runtime void-damping');
}

function runAuditReplaySmoke() {
  function runPipeline(seed) {
    const context = {
      seat: 'bottom',
      drawKind: luck.DRAW_KINDS.NORMAL,
      seed,
      objectiveIntent: {
        speed: 1,
        value: 0,
        safety: 0,
        commit: 0,
        pressure: 0,
        confidence: 1
      },
      windState: { mode: luck.WIND_MODES.SPEED, intensity: luck.WIND_INTENSITIES.MEDIUM },
      activeForces: [{ id: 'fortune-a', kind: luck.FORCE_KINDS.FORTUNE, power: 100 }],
      candidateLocalValues: {
        m1: { speed: 1 },
        p1: { speed: -1 },
        s1: { speed: 0.25 }
      }
    };
    const tileCounts = luck.buildTileCountsFromWall(['m1', 'm1', 'p1', 'p1', 's1', 's1']);
    const candidates = luck.buildCandidateDraws({ tileCounts, context });
    const objectiveIntent = luck.buildObjectiveIntent(context);
    const compositeIntent = luck.applyWindAdjustment(objectiveIntent, context.windState, context);
    const resolvedForces = luck.resolveForces(context.activeForces, context);
    const weightedCandidates = luck.scoreCandidateDraws(candidates, compositeIntent, resolvedForces, context.policy);
    const sample = luck.sampleWeightedDraw(weightedCandidates, luck.createSeededRng(seed));
    const audit = luck.createLuckAudit({
      context,
      seed,
      objectiveIntent,
      windState: context.windState,
      compositeIntent,
      activeForces: resolvedForces.activeForces,
      candidates: weightedCandidates
    }, sample);
    return { audit, sample, weightedCandidates };
  }

  const first = runPipeline('audit-seed');
  const replay = runPipeline('audit-seed');

  assert.strictEqual(first.audit.seed, 'audit-seed', `expected audit seed, got ${JSON.stringify(first.audit)}`);
  assert.strictEqual(first.audit.selectedTileCode, first.sample.selectedTileCode, 'expected audit selected tile to match sample');
  assert(Number.isFinite(first.audit.randomRoll), `expected audit random roll, got ${JSON.stringify(first.audit)}`);
  assert(first.audit.candidates.length > 0, `expected audit candidates, got ${JSON.stringify(first.audit)}`);
  assert.strictEqual(first.audit.selectedTileCode, replay.audit.selectedTileCode, 'expected replay selected tile to match');
  assertAlmostEqual(first.audit.randomRoll, replay.audit.randomRoll, 'expected replay roll to match');

  const validation = luck.validateLuckReplayInput({
    seed: first.audit.seed,
    candidates: first.audit.candidates
  });
  assert(validation.ok, `expected replay input validation to pass, got ${JSON.stringify(validation)}`);

  const summary = luck.formatLuckDistributionSummary(first.audit);
  assert(summary.includes('selected='), `expected summary to include selected tile, got ${summary}`);
  assert(sumWeights(first.audit.candidates) > 0, 'expected audit candidate weights to be positive');
  pass('luck-runtime audit-replay');
}

function runForceRankSmoke() {
  const weak = luck.buildForceCompareKey({ id: 'weak', kind: luck.FORCE_KINDS.FORTUNE, tier: 1, power: 10 });
  const strong = luck.buildForceCompareKey({ id: 'strong', kind: luck.FORCE_KINDS.FORTUNE, tier: 2, power: 1 });
  assert(luck.compareForceRank(strong, weak) > 0, `expected higher tier to win, got ${JSON.stringify({ strong, weak })}`);
  pass('luck-runtime force-rank');
}

function main() {
  runTileCountsSmoke();
  runSamplerSeedSmoke();
  runClampSmoke();
  runNoForceSmoke();
  runFortuneSmoke();
  runCurseSmoke();
  runCurseDominatesEqualFortuneSmoke();
  runStrongFortuneOvertakesEqualCurseSmoke();
  runForceTargetingSmoke();
  runSameKindStackingSmoke();
  runVoidSmoke();
  runAuditReplaySmoke();
  runForceRankSmoke();
}

main();
