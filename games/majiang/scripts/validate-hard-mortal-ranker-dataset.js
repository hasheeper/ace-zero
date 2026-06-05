'use strict';

const rankerApi = require('./lib/hard-mortal-ranker-dataset');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function makeHardCandidate(tileCode, overrides = {}) {
  return {
    tileCode,
    tileIndex: overrides.tileIndex ?? 0,
    isDrawDiscard: Boolean(overrides.isDrawDiscard),
    selectedInitial: Boolean(overrides.selectedInitial),
    selectedFinal: Boolean(overrides.selectedFinal),
    metrics: {
      xiangting: overrides.xiangting ?? 2,
      tingpaiCount: overrides.tingpaiCount ?? 4,
      ukeireCount: overrides.ukeireCount ?? 10,
      handValueEstimate: overrides.handValueEstimate ?? 20
    },
    danger: {
      dangerScore: overrides.dangerScore ?? 0,
      safetyRank: overrides.safetyRank ?? 20,
      defenseTileRank: overrides.defenseTileRank ?? 20,
      categories: overrides.categories || [],
      reasons: overrides.reasons || [],
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

function makeMortalCandidate(actionIndex, tileCode, qValue, qDeltaFromBest, isBest = false) {
  return {
    actionIndex,
    actionType: 'discard',
    tileCode,
    normalizedTileCode: rankerApi.normalizeTileCode(tileCode),
    qValue,
    qDeltaFromBest,
    isBest
  };
}

function makeReportRow(id, overrides = {}) {
  const localTile = overrides.localTile || 'm9';
  const bestTile = overrides.bestTile || 's9';
  const candidates = [
    makeMortalCandidate(8, 'm9', 0.55, 0.25, false),
    makeMortalCandidate(26, 's9', 0.8, 0, true),
    makeMortalCandidate(4, 'm5', 0.62, 0.18, false)
  ].sort((left, right) => Number(right.qValue) - Number(left.qValue));
  return {
    id,
    seed: 20260602,
    targetSeat: 'bottom',
    kind: 'discard',
    tags: overrides.tags || ['discard', 'h10', 'mortal-alignment', 'tile-choice'],
    round: {
      roundIndex: overrides.roundIndex ?? 0
    },
    subject: {
      difficulty: 'hard'
    },
    mortalOk: overrides.mortalOk ?? true,
    mortalAlignment: {
      status: overrides.alignmentStatus || 'fresh',
      decodedCount: 1,
      previousMortalDecisionCount: 0,
      advancedBy: 1
    },
    localDecision: {
      type: 'discard',
      seat: 'bottom',
      tileCode: localTile,
      riichi: false
    },
    bestMortalCandidate: candidates.find((candidate) => candidate.tileCode === bestTile) || candidates[0],
    localMortalCandidate: candidates.find((candidate) => candidate.tileCode === localTile) || null,
    mortalCandidates: candidates,
    mortalSeverity: {
      level: overrides.severityLevel || 'large',
      qDelta: overrides.qDelta ?? 0.25
    },
    metrics: {
      xiangting: 2
    },
    pushFoldState: {
      state: 'neutral',
      pressureScore: 0
    },
    hardMetrics: {
      hardContext: {
        dealerSeat: 'bottom'
      }
    },
    hardCandidateDiagnostics: overrides.hardCandidateDiagnostics || [
      makeHardCandidate('m9', {
        tileIndex: 0,
        selectedInitial: true,
        selectedFinal: localTile === 'm9',
        hardEvScore: 140,
        shapeScore: 8
      }),
      makeHardCandidate('s9', {
        tileIndex: 1,
        selectedFinal: localTile === 's9',
        hardEvScore: 120,
        shapeScore: 18
      }),
      makeHardCandidate('m5', {
        tileIndex: 2,
        selectedFinal: localTile === 'm5',
        hardEvScore: 130,
        shapeScore: -6,
        shapeRole: 'central-five'
      })
    ],
    decisionContext: {
      seat: 'bottom',
      phase: 'await_discard',
      remaining: 52,
      doraIndicators: ['m4'],
      scores: {
        bottom: 25000,
        right: 25000,
        top: 25000,
        left: 25000
      },
      round: {
        zhuangfeng: 0,
        jushu: 0,
        changbang: 0,
        lizhibang: 0,
        dealerSeat: 'bottom'
      },
      seats: {
        bottom: {
          handCodes: ['m2', 'm3', 'm5', 'm9', 'p2', 'p3', 'p4', 's6', 's7', 's8', 's9', 'z1', 'z5', 'z5'],
          melds: [],
          riverCodes: [],
          riichi: false
        },
        right: {
          handCodes: [],
          melds: [],
          riverCodes: ['m1'],
          riichi: false
        },
        top: {
          handCodes: [],
          melds: [],
          riverCodes: [],
          riichi: false
        },
        left: {
          handCodes: [],
          melds: [],
          riverCodes: [],
          riichi: false
        }
      }
    }
  };
}

function assertDatasetRow(row) {
  assert(row.datasetVersion === rankerApi.DATASET_VERSION, `unexpected dataset version ${row.datasetVersion}`);
  assert(typeof row.stateId === 'string' && row.stateId, `expected stateId, got ${JSON.stringify(row)}`);
  assert(row.local && row.local.tileCode, `expected local tile, got ${JSON.stringify(row.local)}`);
  assert(row.mortalBest && row.mortalBest.tileCode, `expected Mortal best tile, got ${JSON.stringify(row.mortalBest)}`);
  assert(row.candidate && row.candidate.tileCode, `expected candidate tile, got ${JSON.stringify(row.candidate)}`);
  assert(row.label && Number.isFinite(Number(row.label.mortalQValue)), `expected q label, got ${JSON.stringify(row.label)}`);
  assert(Number.isFinite(Number(row.label.qDeltaFromBest)), `expected qDelta label, got ${JSON.stringify(row.label)}`);
  assert(Number.isFinite(Number(row.label.mortalRank)), `expected mortal rank, got ${JSON.stringify(row.label)}`);
  assert(typeof row.label.isMortalBest === 'boolean', `expected isMortalBest, got ${JSON.stringify(row.label)}`);
  assert(typeof row.label.isLocalSelected === 'boolean', `expected isLocalSelected, got ${JSON.stringify(row.label)}`);
  assert(row.features && Number.isFinite(Number(row.features.hardEvScore)), `expected hard EV feature, got ${JSON.stringify(row.features)}`);
  assert(row.features.tile && row.features.tile.normalizedTileCode, `expected tile features, got ${JSON.stringify(row.features)}`);
  assert(row.features.native && Number.isFinite(Number(row.features.native.handTileCount)), `expected native features, got ${JSON.stringify(row.features)}`);
  assert(row.features.native.handTileCount === 14, `expected native hand count 14, got ${JSON.stringify(row.features.native)}`);
  assert(Number.isFinite(Number(row.features.native.afterDominantSuitCount)), `expected native suit features, got ${JSON.stringify(row.features.native)}`);
  assert(Number.isFinite(Number(row.features.native.breaksSequenceWindow)), `expected native structure features, got ${JSON.stringify(row.features.native)}`);
  assert(!Object.prototype.hasOwnProperty.call(row.features, 'waits'), `features should omit waits, got ${JSON.stringify(row.features)}`);
  assert(!Object.prototype.hasOwnProperty.call(row.features, 'hardContext'), `features should omit hardContext, got ${JSON.stringify(row.features)}`);
}

function main() {
  const report = {
    rows: [
      makeReportRow('fixture-1'),
      makeReportRow('fixture-2', {
        localTile: 'm5',
        bestTile: 's9',
        roundIndex: 1,
        severityLevel: 'medium',
        qDelta: 0.18
      }),
      makeReportRow('stale-row', {
        alignmentStatus: 'stale'
      })
    ]
  };

  const dataset = rankerApi.buildRankerDatasetFromReports([{
    path: '/tmp/fixture-hard-vs-mortal.json',
    report
  }]);
  rankerApi.assertCompactDatasetRows(dataset.candidateRows);

  assert(dataset.summary.reports === 1, `expected one report, got ${JSON.stringify(dataset.summary)}`);
  assert(dataset.summary.totalRows === 3, `expected 3 total rows, got ${JSON.stringify(dataset.summary)}`);
  assert(dataset.summary.eligibleRows === 2, `expected 2 eligible rows, got ${JSON.stringify(dataset.summary)}`);
  assert(dataset.summary.includedStates === 2, `expected 2 included states, got ${JSON.stringify(dataset.summary)}`);
  assert(dataset.summary.candidateRows === 6, `expected 6 candidate rows, got ${JSON.stringify(dataset.summary)}`);
  assert(dataset.summary.candidateCoverageRate === 1, `expected full candidate coverage, got ${JSON.stringify(dataset.summary)}`);
  assert(dataset.summary.mortalBestCoverageRate === 1, `expected full Mortal best coverage, got ${JSON.stringify(dataset.summary)}`);
  assert(dataset.summary.localSelectedCoverageRate === 1, `expected full local selected coverage, got ${JSON.stringify(dataset.summary)}`);
  assert(dataset.summary.excludedRows['stale-mortal-state'] === 1, `expected stale exclusion, got ${JSON.stringify(dataset.summary.excludedRows)}`);

  const grouped = rankerApi.groupRowsByState(dataset.candidateRows);
  assert(grouped.size === 2, `expected two state groups, got ${grouped.size}`);
  grouped.forEach((rows, stateId) => {
    assert(rows.length === 3, `expected three candidates for ${stateId}, got ${rows.length}`);
    assert(rows.some((row) => row.label.isMortalBest), `expected Mortal best candidate in ${stateId}`);
    assert(rows.some((row) => row.label.isLocalSelected), `expected local selected candidate in ${stateId}`);
  });
  dataset.candidateRows.forEach(assertDatasetRow);

  const jsonl = rankerApi.serializeJsonl(dataset.candidateRows);
  const parsedRows = rankerApi.parseJsonl(jsonl);
  assert(parsedRows.length === dataset.candidateRows.length, `expected JSONL round trip, got ${parsedRows.length}`);

  console.log('[PASS] hard-mortal-ranker-dataset-smoke');
  console.log(`  snapshot=${JSON.stringify({
    states: dataset.summary.includedStates,
    candidateRows: dataset.summary.candidateRows,
    coverage: dataset.summary.candidateCoverageRate,
    excludedRows: dataset.summary.excludedRows
  })}`);
}

if (require.main === module) {
  main();
}

module.exports = {
  makeHardCandidate,
  makeMortalCandidate,
  makeReportRow
};
