'use strict';

const fs = require('fs');
const path = require('path');
const corpusApi = require('./analyze-hard-disagreement-corpus');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function makeCandidate(tileCode, overrides = {}) {
  return {
    tileCode,
    tileIndex: overrides.tileIndex ?? 0,
    isDrawDiscard: false,
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
      discardTileRole: overrides.shapeRole || 'weak-floating',
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

function makeMortalCandidate(tileCode, qValue, qDeltaFromBest, isBest = false, actionIndex = 0) {
  return {
    actionIndex,
    actionType: 'discard',
    tileCode,
    normalizedTileCode: corpusApi.normalizeTileCode(tileCode),
    qValue,
    qDeltaFromBest,
    isBest
  };
}

function makeRow(id, overrides = {}) {
  const localTile = overrides.localTile || 'm1';
  const bestTile = overrides.bestTile || 's9';
  const qDelta = overrides.qDelta ?? 0.4;
  const bucket = overrides.bucket || 'tile-choice';
  const pressureScore = overrides.pressureScore ?? 0;
  const localXiangting = overrides.localXiangting ?? 2;
  const mortalXiangting = overrides.mortalXiangting ?? localXiangting;
  const localCandidate = makeCandidate(localTile, {
    selectedFinal: true,
    tileIndex: 0,
    xiangting: localXiangting,
    hardEvScore: overrides.localEv ?? 140,
    shapeScore: overrides.localShape ?? 8,
    dangerScore: overrides.localDanger ?? 0,
    safetyRank: overrides.localSafety ?? 20
  });
  const mortalCandidate = makeCandidate(bestTile, {
    selectedFinal: false,
    tileIndex: 1,
    xiangting: mortalXiangting,
    hardEvScore: overrides.mortalEv ?? 120,
    shapeScore: overrides.mortalShape ?? 16,
    dangerScore: overrides.mortalDanger ?? 0,
    safetyRank: overrides.mortalSafety ?? 18
  });
  return {
    id,
    seed: 20260602,
    targetSeat: 'bottom',
    kind: 'discard',
    tags: ['discard', 'h10', 'mortal-alignment', bucket],
    round: {
      roundIndex: overrides.roundIndex ?? 0
    },
    mortalOk: true,
    localDecision: {
      type: 'discard',
      seat: 'bottom',
      tileCode: localTile,
      riichi: false
    },
    coachDecision: {
      type: 'discard',
      seat: 'bottom',
      tileCode: bestTile,
      riichi: false
    },
    bestMortalCandidate: makeMortalCandidate(bestTile, 0.5, 0, true, 1),
    localMortalCandidate: makeMortalCandidate(localTile, 0.5 - qDelta, qDelta, false, 0),
    mortalCandidates: [
      makeMortalCandidate(bestTile, 0.5, 0, true, 1),
      makeMortalCandidate(localTile, 0.5 - qDelta, qDelta, false, 0)
    ],
    mortalSeverity: {
      level: qDelta <= 0.05 ? 'near' : qDelta <= 0.2 ? 'medium' : 'large',
      qDelta
    },
    metrics: {
      xiangting: localXiangting
    },
    pushFoldState: {
      state: pressureScore > 0 ? 'careful' : 'neutral',
      pressureScore
    },
    hardCandidateDiagnostics: [localCandidate, mortalCandidate],
    decisionContext: {
      seat: 'bottom',
      phase: 'await_discard',
      turnSeat: 'bottom',
      remaining: overrides.remaining ?? 48,
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
          handCodes: ['m1', 'm2', 'm3', 'p4', 'p5', 'p6', 's7', 's8', 's9', 'z1', 'z2', 'z3', 'z4', 'z5'],
          riverCodes: [],
          melds: [],
          riichi: {
            declared: false
          }
        },
        right: {
          handCodes: [],
          riverCodes: ['m9'],
          melds: [],
          riichi: {
            declared: false
          }
        },
        top: {
          handCodes: [],
          riverCodes: [],
          melds: [],
          riichi: {
            declared: false
          }
        },
        left: {
          handCodes: [],
          riverCodes: [],
          melds: [],
          riichi: {
            declared: false
          }
        }
      },
      discardCandidates: [
        {
          tileCode: localTile,
          tileIndex: 0,
          selectedFinal: true,
          xiangting: localXiangting,
          hardEvScore: overrides.localEv ?? 140,
          dangerScore: overrides.localDanger ?? 0,
          shapeScore: overrides.localShape ?? 8,
          shapeRole: 'fixture-local'
        },
        {
          tileCode: bestTile,
          tileIndex: 1,
          selectedFinal: false,
          xiangting: mortalXiangting,
          hardEvScore: overrides.mortalEv ?? 120,
          dangerScore: overrides.mortalDanger ?? 0,
          shapeScore: overrides.mortalShape ?? 16,
          shapeRole: 'fixture-mortal'
        }
      ],
      localDiscard: {
        tileCode: localTile,
        tileIndex: 0,
        shouldRiichi: false
      }
    }
  };
}

function makePredictionRow(stateId, overrides = {}) {
  const currentExact = Boolean(overrides.currentExact);
  const modelExact = Boolean(overrides.modelExact);
  return {
    stateId,
    changed: overrides.changed ?? true,
    predictionMargin: overrides.margin ?? 0.25,
    qDeltaChange: overrides.qDeltaChange ?? -0.4,
    currentHard: {
      tileCode: overrides.currentTile || 'm1',
      prediction: 0.1,
      qDeltaFromBest: currentExact ? 0 : 0.4,
      severity: currentExact ? 'exact' : 'large',
      mortalRank: currentExact ? 1 : 2,
      isMortalBest: currentExact
    },
    model: {
      tileCode: overrides.modelTile || 's9',
      prediction: 0.4,
      qDeltaFromBest: modelExact ? 0 : 0.25,
      severity: modelExact ? 'exact' : 'large',
      mortalRank: modelExact ? 1 : 2,
      isMortalBest: modelExact
    },
    mortalBest: {
      tileCode: overrides.mortalTile || 's9',
      prediction: null,
      qDeltaFromBest: 0,
      severity: 'exact',
      mortalRank: 1,
      isMortalBest: true
    }
  };
}

function assertCompact(corpus) {
  const serialized = JSON.stringify(corpus);
  ['"runtime"', '"stdout"', '"stderr"', '"hardContext"', '"waits"'].forEach((forbidden) => {
    assert(!serialized.includes(forbidden), `corpus should omit ${forbidden}`);
  });
  corpus.rows.forEach((row) => {
    assert(row.fixedState && row.fixedState.phase === 'await_discard', `expected fixedState for ${row.id}`);
    assert(row.localCandidate && row.localCandidate.tileCode, `expected local candidate for ${row.id}`);
    assert(row.mortalCandidate && row.mortalCandidate.tileCode, `expected Mortal candidate for ${row.id}`);
    assert(Array.isArray(row.candidateTable) && row.candidateTable.length >= 2, `expected candidate table for ${row.id}`);
    assert(row.adjudication && row.adjudication.status === 'unreviewed', `expected unreviewed adjudication for ${row.id}`);
    assert(Array.isArray(row.adjudication.labelOptions) && row.adjudication.labelOptions.includes('hard-suspect-mistake'), `expected label options for ${row.id}`);
  });
}

function main() {
  const report = {
    rows: [
      makeRow('normal', { qDelta: 0.04 }),
      makeRow('review', { qDelta: 0.4, localEv: 220, mortalEv: 120 }),
      makeRow('serious', { qDelta: 1.4, localEv: 120, mortalEv: 260 }),
      makeRow('defense-top', {
        qDelta: 2.4,
        bucket: 'tile-defense',
        pressureScore: 7,
        localXiangting: 1,
        mortalXiangting: 2,
        localDanger: 1,
        mortalDanger: 0
      }),
      makeRow('exact-excluded', {
        localTile: 's9',
        bestTile: 's9',
        qDelta: 0
      })
    ]
  };
  const predictionMaps = {
    fixtureNative: {
      path: '/tmp/fixture-native-predictions.json',
      rows: new Map([
        ['review', makePredictionRow('review', { currentExact: false, modelExact: true })],
        ['serious', makePredictionRow('serious', { currentExact: false, modelExact: false })],
        ['defense-top', makePredictionRow('defense-top', { currentExact: false, modelExact: true, qDeltaChange: -2.4 })]
      ])
    }
  };
  const configPath = '/tmp/h13h-fixture-mortal-config.toml';
  fs.writeFileSync(configPath, [
    '[control]',
    "state_file = '/tmp/mortal-a.pth'",
    "best_state_file = '/tmp/mortal-best.pth'",
    ''
  ].join('\n'), 'utf8');

  const corpus = corpusApi.buildDisagreementCorpus(report, {
    reportPath: '/tmp/fixture-report.json',
    predictionMaps,
    mortalConfigPath: configPath
  });

  assert(corpus.source === 'hard-disagreement-adjudication-corpus', `unexpected source ${corpus.source}`);
  assert(corpus.rows.length === 3, `expected review+serious rows only, got ${corpus.rows.length}`);
  assert(corpus.summary.qBandCounts.review === 1, `expected one review row, got ${JSON.stringify(corpus.summary.qBandCounts)}`);
  assert(corpus.summary.qBandCounts['serious-suspect'] === 2, `expected two serious rows, got ${JSON.stringify(corpus.summary.qBandCounts)}`);
  assert(corpus.summary.bucketCounts['tile-choice'] === 2, `expected two tile-choice rows, got ${JSON.stringify(corpus.summary.bucketCounts)}`);
  assert(corpus.summary.bucketCounts['tile-defense'] === 1, `expected one defense row, got ${JSON.stringify(corpus.summary.bucketCounts)}`);
  assert(corpus.summary.modelSignalCounts.fixtureNative.exactImprovement === 2, `expected model improvements, got ${JSON.stringify(corpus.summary.modelSignalCounts)}`);
  assert(corpus.mortalTeacher.stateFile === '/tmp/mortal-a.pth', `expected teacher state file, got ${JSON.stringify(corpus.mortalTeacher)}`);
  assert(corpus.mortalTeacher.bestStateFile === '/tmp/mortal-best.pth', `expected teacher best file, got ${JSON.stringify(corpus.mortalTeacher)}`);

  const byId = new Map(corpus.rows.map((row) => [row.id, row]));
  assert(byId.get('review').qBand === 'review', `expected review band, got ${JSON.stringify(byId.get('review'))}`);
  assert(byId.get('serious').triageTags.includes('hard-ev-prefers-mortal>=100'), `expected EV tag, got ${JSON.stringify(byId.get('serious').triageTags)}`);
  assert(byId.get('defense-top').triageTags.includes('needs-defense-review'), `expected defense tag, got ${JSON.stringify(byId.get('defense-top').triageTags)}`);
  assert(byId.get('defense-top').triageTags.includes('top-serious-qdelta'), `expected top q tag, got ${JSON.stringify(byId.get('defense-top').triageTags)}`);

  const withNormal = corpusApi.buildDisagreementCorpus(report, {
    predictionMaps,
    mortalConfigPath: configPath,
    includeNormal: true
  });
  assert(withNormal.rows.length === 4, `expected normal included corpus size 4, got ${withNormal.rows.length}`);
  assert(withNormal.summary.qBandCounts.normal === 1, `expected one normal row, got ${JSON.stringify(withNormal.summary.qBandCounts)}`);

  assertCompact(corpus);

  console.log('[PASS] hard-disagreement-corpus-smoke');
  console.log(`  snapshot=${JSON.stringify({
    total: corpus.summary.total,
    qBandCounts: corpus.summary.qBandCounts,
    bucketCounts: corpus.summary.bucketCounts,
    suggestedReviewClassCounts: corpus.summary.suggestedReviewClassCounts,
    modelSignals: corpus.summary.modelSignalCounts
  })}`);
}

if (require.main === module) {
  main();
}

module.exports = {
  makeCandidate,
  makeMortalCandidate,
  makeRow,
  makePredictionRow
};
