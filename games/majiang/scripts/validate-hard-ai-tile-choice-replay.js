'use strict';

const tileChoiceReplayApi = require('./replay-hard-ai-tile-choice-candidates');
const arenaApi = require('./benchmark-ai-hanchan-arena');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function makeCandidate(tileCode, overrides = {}) {
  const role = overrides.role || 'floating-middle';
  const shapeScore = overrides.shapeScore ?? -4;
  return {
    tileCode,
    normalizedTileCode: tileChoiceReplayApi.normalizeTileCode(tileCode),
    selectedFinal: Boolean(overrides.selectedFinal),
    metrics: {
      xiangting: overrides.xiangting ?? 2,
      tingpaiCount: overrides.tingpaiCount ?? 5,
      ukeireCount: overrides.ukeireCount ?? 15,
      handValueEstimate: overrides.handValueEstimate ?? 20
    },
    danger: {
      dangerScore: 0,
      safetyRank: 9,
      defenseTileRank: 94,
      categories: [],
      safetyReasons: ['safety-no-riichi-pressure']
    },
    hardMetrics: {
      hardEvScore: overrides.hardEvScore ?? 200,
      liveUkeireCount: overrides.liveUkeireCount ?? 12,
      liveTingpaiCount: overrides.liveTingpaiCount ?? 12,
      waitQualityScore: overrides.waitQualityScore ?? 24,
      bestWaitType: overrides.bestWaitType || 'ryanmen',
      contextualHandValueEstimate: overrides.contextualHandValueEstimate ?? 20
    },
    shape: {
      discardShapeScore: shapeScore,
      discardTileRole: role,
      reasons: overrides.shapeReasons || [`shape-${role}`]
    },
    mortal: {
      qValue: overrides.qValue ?? 0,
      qDeltaFromBest: overrides.qDeltaFromBest ?? 0,
      isBest: Boolean(overrides.isBest)
    }
  };
}

function makePoolCandidate(id, overrides = {}) {
  const local = overrides.local || makeCandidate('p5', {
    selectedFinal: true,
    role: 'useful-middle',
    shapeScore: -6,
    hardEvScore: 200
  });
  const teacher = overrides.teacher || makeCandidate('p9', {
    role: 'isolated-terminal',
    shapeScore: 10,
    hardEvScore: 150,
    isBest: true
  });
  return {
    id,
    sourceIds: [id],
    priority: overrides.priority || 'P0',
    category: 'same-xiangting tile-choice',
    bucket: 'tile-choice',
    qDelta: overrides.qDelta ?? 2.5,
    pressureScore: overrides.pressureScore ?? 0,
    currentHard: { type: 'discard', tileCode: local.tileCode },
    teacher: { actionType: 'discard', tileCode: teacher.tileCode },
    localCandidate: local,
    mortalCandidate: teacher,
    candidateTable: overrides.candidateTable || [local, teacher],
    relation: overrides.relation || { xiangtingRelation: 'same' },
    classification: overrides.classification || {
      primaryPattern: 'shape-and-model-consensus-support-mortal',
      modes: ['no-pressure', 'same-xiangting']
    },
    modelSignal: overrides.modelSignal || { exactImprovementCount: 0 }
  };
}

function makeBasePolicy() {
  const policy = arenaApi.createTunedHardPolicy();
  policy.discard = {
    ...policy.discard,
    shapeStrongOverrideEnabled: false,
    enableNoPressureCleanupGuard: false,
    shapeTieBreakMaxHardEvDelta: 0
  };
  return policy;
}

function makeOverlayPolicy() {
  const policy = arenaApi.createExperimentalHardPolicy({
    experimentalOverlays: ['no-pressure-same-xiangting-rerank-v1']
  });
  policy.discard = {
    ...policy.discard,
    shapeStrongOverrideEnabled: false,
    enableNoPressureCleanupGuard: false,
    shapeTieBreakMaxHardEvDelta: 0
  };
  return policy;
}

function assertNoLargeObjects(report) {
  const serialized = JSON.stringify(report);
  ['"runtime"', '"board"', '"eventLog"', '"stdout"', '"stderr"', '"mortalRoot"', '"hardContext"', '"waits"'].forEach((forbidden) => {
    assert(!serialized.includes(forbidden), `tile-choice replay report should omit ${forbidden}`);
  });
}

function validateTileChoiceReplay() {
  const cleanup = makePoolCandidate('cleanup-vs-middle');
  const modelConsensus = makePoolCandidate('model-consensus', {
    modelSignal: { exactImprovementCount: 2 }
  });
  const tenpai = makePoolCandidate('tenpai-route', {
    local: makeCandidate('s6', { selectedFinal: true, xiangting: 0, role: 'floating-middle', shapeScore: -1, hardEvScore: 80 }),
    teacher: makeCandidate('m2', { xiangting: 0, role: 'edge-block', shapeScore: -5, hardEvScore: 60, isBest: true })
  });
  const route = makePoolCandidate('route-missing', {
    local: makeCandidate('z1', { selectedFinal: true, role: 'value-honor', shapeScore: 0, hardEvScore: 200 }),
    teacher: makeCandidate('m7', { role: 'floating-middle', shapeScore: -1, hardEvScore: 199, isBest: true }),
    classification: {
      primaryPattern: 'missing-runtime-feature-or-route-signal',
      modes: ['tile-route-choice']
    }
  });
  const hardEvTooFar = makePoolCandidate('hard-ev-too-far', {
    teacher: makeCandidate('p9', { role: 'isolated-terminal', shapeScore: 20, hardEvScore: 80, isBest: true })
  });
  const alreadyFixed = makePoolCandidate('already-fixed', {
    local: makeCandidate('p5', { selectedFinal: true, role: 'useful-middle', shapeScore: -6, hardEvScore: 120 }),
    teacher: makeCandidate('p9', { role: 'isolated-terminal', shapeScore: 18, hardEvScore: 121, isBest: true }),
    candidateTable: [
      makeCandidate('p5', { selectedFinal: true, role: 'useful-middle', shapeScore: -6, hardEvScore: 120 }),
      makeCandidate('p9', { role: 'isolated-terminal', shapeScore: 18, hardEvScore: 121, isBest: true })
    ]
  });

  const basePolicy = makeBasePolicy();
  const overlayPolicy = makeOverlayPolicy();
  const report = tileChoiceReplayApi.buildTileChoiceReplayReport({
    candidates: [cleanup, modelConsensus, tenpai, route, hardEvTooFar, alreadyFixed]
  }, {
    poolPath: '/tmp/h14-p4-validator-pool.json',
    basePolicy,
    overlayPolicy,
    priorities: ['P0']
  });
  const byId = new Map(report.rows.map((row) => [row.id, row]));
  assert(byId.get('cleanup-vs-middle').classification === 'patch-eligible-cleanup-vs-middle', `expected cleanup eligible, got ${JSON.stringify(byId.get('cleanup-vs-middle'))}`);
  assert(byId.get('model-consensus').classification === 'patch-eligible-model-consensus', `expected model consensus, got ${JSON.stringify(byId.get('model-consensus'))}`);
  assert(byId.get('tenpai-route').classification === 'tenpai-route-manual-review', `expected tenpai manual, got ${JSON.stringify(byId.get('tenpai-route'))}`);
  assert(byId.get('route-missing').classification === 'route-feature-missing', `expected route missing, got ${JSON.stringify(byId.get('route-missing'))}`);
  assert(byId.get('hard-ev-too-far').classification === 'hard-ev-too-far', `expected hard EV too far, got ${JSON.stringify(byId.get('hard-ev-too-far'))}`);
  assert(byId.get('already-fixed').classification === 'already-fixed-by-current-hard', `expected already fixed, got ${JSON.stringify(byId.get('already-fixed'))}`);
  assert(report.summary.patchEligible === 2, `expected two patch eligible rows, got ${JSON.stringify(report.summary)}`);
  assert(report.rows.every((row) => row.local && row.currentHard && row.teacher && row.experimental), 'expected local/currentHard/teacher/experimental panels');
  assertNoLargeObjects(report);

  console.log('[PASS] hard-ai-tile-choice-replay-smoke');
  console.log(`  snapshot=${JSON.stringify({
    total: report.summary.total,
    byClassification: report.summary.byClassification,
    patchEligible: report.summary.patchEligible
  })}`);
}

function main() {
  validateTileChoiceReplay();
}

if (require.main === module) {
  main();
}

module.exports = {
  validateTileChoiceReplay
};
