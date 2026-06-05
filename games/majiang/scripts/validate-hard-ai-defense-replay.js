'use strict';

const replayApi = require('./replay-hard-ai-defense-candidates');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function makeCandidate(tileCode, overrides = {}) {
  return {
    tileCode,
    tileIndex: overrides.tileIndex ?? 0,
    selectedFinal: Boolean(overrides.selectedFinal),
    metrics: {
      xiangting: overrides.xiangting ?? 1,
      tingpaiCount: overrides.tingpaiCount ?? 3,
      ukeireCount: overrides.ukeireCount ?? 9,
      handValueEstimate: overrides.handValueEstimate ?? 20
    },
    danger: {
      dangerScore: overrides.dangerScore ?? 0,
      safetyRank: overrides.safetyRank ?? 0,
      defenseTileRank: overrides.defenseTileRank ?? 4,
      categories: overrides.categories || ['genbutsu'],
      safetyReasons: overrides.safetyReasons || ['safety-genbutsu']
    },
    hardMetrics: {
      hardEvScore: overrides.hardEvScore ?? 100,
      liveUkeireCount: overrides.liveUkeireCount ?? 4,
      liveTingpaiCount: overrides.liveTingpaiCount ?? 4,
      waitQualityScore: overrides.waitQualityScore ?? 8,
      bestWaitType: overrides.bestWaitType || 'shanpon',
      contextualHandValueEstimate: overrides.contextualHandValueEstimate ?? 24,
      waits: ['should-not-leak'],
      hardContext: { shouldNotLeak: true }
    },
    runtime: { shouldNotLeak: true }
  };
}

function makeDefenseCandidate(id, classificationFixture, local, teacher, overrides = {}) {
  return {
    id,
    sourceIds: [id],
    priority: overrides.priority || 'P1',
    category: 'defense',
    bucket: 'tile-defense',
    qDelta: overrides.qDelta ?? 1.5,
    pressureScore: overrides.pressureScore ?? 8,
    currentHard: {
      type: 'discard',
      tileCode: local.tileCode,
      reasons: overrides.currentReasons || ['hard-4p-discard']
    },
    teacher: {
      source: 'mortal',
      actionType: 'discard',
      tileCode: teacher.tileCode,
      qValue: 0.8
    },
    localCandidate: local,
    mortalCandidate: teacher,
    candidateTable: [local, teacher],
    fixedState: {
      seat: 'bottom',
      phase: 'await_discard',
      remaining: 32,
      localDiscard: {
        tileCode: local.tileCode,
        reasons: overrides.currentReasons || ['hard-4p-discard']
      },
      discardCandidates: []
    },
    expectedClassification: classificationFixture
  };
}

function buildFixturePool() {
  const equalSafeLocal = makeCandidate('p5', {
    selectedFinal: true,
    tileIndex: 5,
    xiangting: 1,
    dangerScore: 0,
    safetyRank: 0,
    defenseTileRank: 4,
    hardEvScore: 100
  });
  const equalSafeTeacher = makeCandidate('m8', {
    tileIndex: 0,
    xiangting: 2,
    dangerScore: 0,
    safetyRank: 0,
    defenseTileRank: 2,
    hardEvScore: 320
  });

  const softFoldLocal = makeCandidate('p1', {
    selectedFinal: true,
    xiangting: 1,
    dangerScore: 1,
    safetyRank: 4,
    defenseTileRank: 42,
    hardEvScore: 160
  });
  const softFoldTeacher = makeCandidate('s9', {
    xiangting: 2,
    dangerScore: 0,
    safetyRank: 0,
    defenseTileRank: 1,
    hardEvScore: 120
  });

  const riskierLocal = makeCandidate('m1', {
    selectedFinal: true,
    xiangting: 1,
    dangerScore: 0,
    safetyRank: 0,
    defenseTileRank: 1,
    hardEvScore: 120
  });
  const riskierTeacher = makeCandidate('m2', {
    xiangting: 1,
    dangerScore: 1,
    safetyRank: 4,
    defenseTileRank: 43,
    hardEvScore: 121
  });

  const crossLocal = makeCandidate('z1', {
    selectedFinal: true,
    xiangting: 2,
    dangerScore: 1,
    safetyRank: 6,
    defenseTileRank: 62,
    hardEvScore: 500
  });
  const crossTeacher = makeCandidate('m2', {
    xiangting: 2,
    dangerScore: 1,
    safetyRank: 4,
    defenseTileRank: 43,
    hardEvScore: 420
  });

  return {
    source: 'fixture-defense-pool',
    candidates: [
      makeDefenseCandidate('equal-safe-backstep', 'patch-eligible-equal-safe-backstep', equalSafeLocal, equalSafeTeacher),
      makeDefenseCandidate('safer-soft-fold', 'patch-eligible-safer-soft-fold', softFoldLocal, softFoldTeacher, {
        pressureScore: 4
      }),
      makeDefenseCandidate('teacher-riskier', 'teacher-riskier', riskierLocal, riskierTeacher),
      makeDefenseCandidate('already-cross-fold', 'already-cross-xiangting-fold', crossLocal, crossTeacher, {
        currentReasons: ['hard-4p-discard', 'hard-push-fold-cross-xiangting-fold']
      })
    ]
  };
}

function assertNoLargeObjects(report) {
  const serialized = JSON.stringify(report);
  ['"runtime"', '"board"', '"eventLog"', '"stdout"', '"stderr"', '"mortalRoot"', '"hardContext"', '"waits"'].forEach((forbidden) => {
    assert(!serialized.includes(forbidden), `defense replay report should omit ${forbidden}`);
  });
}

function validateDefenseReplay() {
  const pool = buildFixturePool();
  const report = replayApi.buildDefenseReplayReport(pool, {
    poolPath: '/tmp/h14-p3-validator-pool.json'
  });
  assert(report && report.source === 'hard-ai-defense-candidate-replay', `unexpected source ${report && report.source}`);
  assert(report.overlay === 'defense-equal-safe-backstep-v1', `unexpected overlay ${report.overlay}`);
  assert(report.summary.total === 4, `expected 4 replay rows, got ${JSON.stringify(report.summary)}`);
  assert(report.summary.patchEligible === 2, `expected 2 patch eligible rows, got ${JSON.stringify(report.summary)}`);

  const byId = new Map(report.rows.map((row) => [row.id, row]));
  pool.candidates.forEach((candidate) => {
    const row = byId.get(candidate.id);
    assert(row, `missing replay row for ${candidate.id}`);
    assert(row.classification === candidate.expectedClassification, `expected ${candidate.id} classification ${candidate.expectedClassification}, got ${row.classification}`);
    assert(Array.isArray(row.reasons) && row.reasons.length >= 1, `expected reasons for ${candidate.id}`);
    assert(row.local && row.local.tileCode, `expected local candidate for ${candidate.id}`);
    assert(row.teacher && row.teacher.tileCode, `expected teacher candidate for ${candidate.id}`);
    assert(row.experimental && row.experimental.tileCode, `expected experimental candidate for ${candidate.id}`);
    assert(row.replay && row.replay.experimental && row.replay.experimental.mode, `expected experimental replay for ${candidate.id}`);
  });

  assert(byId.get('equal-safe-backstep').experimental.tileCode === 'm8', 'expected equal-safe overlay to choose teacher m8');
  assert(byId.get('safer-soft-fold').experimental.tileCode === 's9', 'expected soft fold to choose teacher s9');
  assert(byId.get('teacher-riskier').experimental.tileCode === 'm1', 'expected riskier teacher to keep local');
  assert(byId.get('already-cross-fold').experimental.tileCode === 'z1', 'expected cross-fold row to keep local');
  assertNoLargeObjects(report);

  console.log('[PASS] hard-ai-defense-replay-smoke');
  console.log(`  snapshot=${JSON.stringify({
    total: report.summary.total,
    byClassification: report.summary.byClassification,
    patchEligible: report.summary.patchEligible
  })}`);
}

function main() {
  validateDefenseReplay();
}

if (require.main === module) {
  main();
}

module.exports = {
  buildFixturePool,
  validateDefenseReplay
};
