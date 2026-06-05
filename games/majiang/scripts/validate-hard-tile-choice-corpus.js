'use strict';

const corpusApi = require('./analyze-hard-tile-choice-corpus');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function makeCandidate(tileCode, overrides = {}) {
  return {
    tileCode,
    tileIndex: overrides.tileIndex ?? 0,
    isDrawDiscard: false,
    selectedFinal: Boolean(overrides.selectedFinal),
    metrics: {
      xiangting: overrides.xiangting ?? 2,
      tingpaiCount: overrides.tingpaiCount ?? 4,
      ukeireCount: overrides.ukeireCount ?? 12,
      handValueEstimate: overrides.handValueEstimate ?? 20
    },
    danger: {
      dangerScore: overrides.dangerScore ?? 0,
      safetyRank: overrides.safetyRank ?? 20,
      defenseTileRank: overrides.defenseTileRank ?? 20,
      categories: overrides.categories || [],
      safetyReasons: overrides.safetyReasons || []
    },
    hardMetrics: {
      hardEvScore: overrides.hardEvScore ?? 100,
      liveUkeireCount: overrides.liveUkeireCount ?? 8,
      liveTingpaiCount: overrides.liveTingpaiCount ?? 0,
      waitQualityScore: overrides.waitQualityScore ?? 0,
      bestWaitType: overrides.bestWaitType || 'none',
      contextualHandValueEstimate: overrides.contextualHandValueEstimate ?? 20
    },
    shape: {
      discardShapeScore: overrides.shapeScore ?? 0,
      discardTileRole: overrides.shapeRole || 'isolated-terminal',
      keptUsefulMiddleCount: overrides.keptUsefulMiddleCount ?? 0,
      weakTerminalCleanupBonus: overrides.weakTerminalCleanupBonus ?? 0,
      isolatedHonorCleanupBonus: overrides.isolatedHonorCleanupBonus ?? 0,
      middleTileCutPenalty: overrides.middleTileCutPenalty ?? 0,
      fiveOrRedFiveCutPenalty: overrides.fiveOrRedFiveCutPenalty ?? 0,
      doraRetentionPenalty: overrides.doraRetentionPenalty ?? 0,
      pairOrBlockBreakPenalty: overrides.pairOrBlockBreakPenalty ?? 0,
      reasons: overrides.shapeReasons || []
    }
  };
}

function makeRow(id, localTile, mortalTile, localOverrides = {}, mortalOverrides = {}) {
  return {
    id,
    seed: 20260531,
    targetSeat: 'bottom',
    tags: ['tile-choice'],
    round: {
      roundIndex: 0
    },
    mortalSeverity: {
      level: 'large',
      qDelta: 0.25
    },
    localDecision: {
      type: 'discard',
      seat: 'bottom',
      tileCode: localTile,
      riichi: false
    },
    coachDecision: {
      type: 'discard',
      seat: 'bottom',
      tileCode: mortalTile,
      riichi: false
    },
    bestMortalCandidate: {
      actionType: 'discard',
      tileCode: mortalTile,
      qValue: 0.8,
      isBest: true
    },
    localMortalCandidate: {
      actionType: 'discard',
      tileCode: localTile,
      qValue: 0.55
    },
    hardCandidateDiagnostics: [
      makeCandidate(localTile, {
        selectedFinal: true,
        ...localOverrides
      }),
      makeCandidate(mortalTile, {
        selectedFinal: false,
        tileIndex: 1,
        ...mortalOverrides
      })
    ],
    decisionContext: {
      seat: 'bottom',
      phase: 'await_discard',
      remaining: 48,
      doraIndicators: ['m4'],
      scores: {
        bottom: 25000,
        right: 25000,
        top: 25000,
        left: 25000
      },
      seats: {
        bottom: {
          handCodes: ['m1', 'm2', 'm3', 'p4', 'p5', 'p6', 's7', 's8', 's9', 'z1', 'z1', 'z2', 'z3', 'z4'],
          riverCodes: [],
          melds: [],
          riichi: {
            declared: false
          }
        }
      },
      discardCandidates: [],
      localDiscard: {
        tileCode: localTile,
        tileIndex: 0,
        shouldRiichi: false,
        reasons: ['fixture']
      }
    }
  };
}

function assertCategory(row, category) {
  assert(
    row.categories.includes(category),
    `expected ${row.id} to include ${category}, got ${JSON.stringify(row.categories)}`
  );
}

function assertPrimary(row, primaryCategory) {
  assert(
    row.primaryCategory === primaryCategory,
    `expected ${row.id} primary ${primaryCategory}, got ${JSON.stringify(row.primaryCategory)}`
  );
}

function assertCompactSchema(corpus) {
  const serialized = JSON.stringify(corpus);
  ['runtime', 'stdout', 'stderr', 'board', 'eventLog', 'mortalRoot'].forEach((forbidden) => {
    assert(!serialized.includes(`"${forbidden}"`), `corpus should omit ${forbidden}`);
  });

  corpus.rows.forEach((row) => {
    assert(row.fixedState && row.fixedState.phase === 'await_discard', `expected fixedState for ${row.id}`);
    assert(row.localCandidate && row.localCandidate.tileCode, `expected compact local candidate for ${row.id}`);
    assert(row.mortalCandidate && row.mortalCandidate.tileCode, `expected compact Mortal candidate for ${row.id}`);
    assert(!Object.prototype.hasOwnProperty.call(row.localCandidate.hardMetrics || {}, 'waits'), `local candidate should omit waits for ${row.id}`);
    assert(!Object.prototype.hasOwnProperty.call(row.mortalCandidate.hardMetrics || {}, 'hardContext'), `Mortal candidate should omit hardContext for ${row.id}`);
  });
}

function main() {
  const fixtureReport = {
    rows: [
      makeRow('same', 'm9', 's9', { hardEvScore: 100, shapeScore: 20 }, { hardEvScore: 100, shapeScore: 18 }),
      makeRow('backstep', 'm4', 'z7', { xiangting: 1, hardEvScore: 120 }, { xiangting: 2, hardEvScore: 40 }),
      makeRow('ev-local', 'm2', 's8', { hardEvScore: 220, shapeScore: 4 }, { hardEvScore: 90, shapeScore: 18 }),
      makeRow('ranking-ev', 'p2', 's3', { hardEvScore: 60, shapeScore: 20 }, { hardEvScore: 130, shapeScore: 4 }),
      makeRow('shape-suspect', 'm1', 's1', { hardEvScore: 100, shapeScore: 10 }, { hardEvScore: 96, shapeScore: 12 }),
      makeRow('route-five', 'p5', 'm9', {
        hardEvScore: 100,
        shapeScore: 8,
        shapeRole: 'central-five',
        shapeReasons: ['five-retention-risk']
      }, {
        hardEvScore: 96,
        shapeScore: 9
      }),
      makeRow('trajectory-new', 's8', 'm8', { hardEvScore: 100 }, { hardEvScore: 98 }),
      makeRow('stable-old', 'p8', 'm8', { hardEvScore: 100 }, { hardEvScore: 98 })
    ]
  };
  const baselineReport = {
    rows: [
      makeRow('stable-old', 'p8', 'm8', { hardEvScore: 100 }, { hardEvScore: 98 })
    ]
  };

  const corpus = corpusApi.buildTileChoiceCorpus(fixtureReport, baselineReport, {
    reportPath: '/tmp/fixture-p4.json',
    baselinePath: '/tmp/fixture-p3.json'
  });

  assert(corpus.source === 'hard-tile-choice-corpus', `unexpected corpus source ${corpus.source}`);
  assert(corpus.rows.length === 8, `expected 8 fixture rows, got ${corpus.rows.length}`);
  assert(corpus.summary.total === 8, `expected summary total 8, got ${JSON.stringify(corpus.summary)}`);
  assert(corpus.summary.sameXiangting === 7, `expected 7 same-xiangting rows, got ${JSON.stringify(corpus.summary)}`);
  assert(corpus.summary.mortalBackstep === 1, `expected 1 Mortal backstep row, got ${JSON.stringify(corpus.summary)}`);
  assert(corpus.summary.fixedStateRows === 8, `expected all rows to carry fixed state, got ${JSON.stringify(corpus.summary)}`);
  assert(corpus.summary.missingDecisionContext === 0, `expected no missing decision context, got ${JSON.stringify(corpus.summary)}`);

  const byId = new Map(corpus.rows.map((row) => [row.id, row]));
  assertCategory(byId.get('same'), 'same-xiangting');
  assertPrimary(byId.get('backstep'), 'mortal-backstep-shape');
  assertPrimary(byId.get('ev-local'), 'ev-prefers-local-against-mortal');
  assertPrimary(byId.get('ranking-ev'), 'ranking-overrode-hard-ev');
  assertPrimary(byId.get('shape-suspect'), 'shape-score-suspect');
  assertPrimary(byId.get('route-five'), 'route-dora-or-five');
  assertCategory(byId.get('trajectory-new'), 'trajectory-introduced');
  assertCategory(byId.get('stable-old'), 'stable-disagreement');

  assert(corpus.summary.hardEvDeltaBuckets['<=12'] >= 1, `expected near EV bucket, got ${JSON.stringify(corpus.summary.hardEvDeltaBuckets)}`);
  assert(corpus.summary.hardEvDeltaBuckets['>80'] >= 1, `expected large EV bucket, got ${JSON.stringify(corpus.summary.hardEvDeltaBuckets)}`);
  assert(Array.isArray(corpus.summary.topQDeltaRows), `expected topQDeltaRows, got ${JSON.stringify(corpus.summary)}`);
  assert(typeof corpus.summary.nextStepRecommendation === 'string', `expected recommendation, got ${JSON.stringify(corpus.summary)}`);
  assertCompactSchema(corpus);

  console.log('[PASS] hard-tile-choice-corpus-smoke');
  console.log(`  snapshot=${JSON.stringify({
    total: corpus.summary.total,
    sameXiangting: corpus.summary.sameXiangting,
    mortalBackstep: corpus.summary.mortalBackstep,
    fixedStateRows: corpus.summary.fixedStateRows,
    primaryCategoryCounts: corpus.summary.primaryCategoryCounts,
    trajectoryCounts: corpus.summary.trajectoryCounts,
    recommendation: corpus.summary.nextStepRecommendation
  })}`);
}

main();
