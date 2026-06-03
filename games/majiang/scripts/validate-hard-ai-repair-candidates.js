'use strict';

const repairApi = require('./build-hard-ai-repair-candidates');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function makeDiagnosticCandidate(tileCode, overrides = {}) {
  return {
    tileCode,
    normalizedTileCode: repairApi.normalizeTileCode(tileCode),
    selectedFinal: Boolean(overrides.selectedFinal),
    metrics: {
      xiangting: overrides.xiangting ?? 1,
      tingpaiCount: overrides.tingpaiCount ?? 4,
      ukeireCount: overrides.ukeireCount ?? 12,
      handValueEstimate: overrides.handValueEstimate ?? 20
    },
    danger: {
      dangerScore: overrides.dangerScore ?? 0,
      safetyRank: overrides.safetyRank ?? 20,
      defenseTileRank: overrides.defenseTileRank ?? 20,
      categories: overrides.categories || [],
      reasons: overrides.dangerReasons || [],
      safetyReasons: overrides.safetyReasons || []
    },
    hardMetrics: {
      hardEvScore: overrides.hardEvScore ?? 100,
      liveUkeireCount: overrides.liveUkeireCount ?? 8,
      liveTingpaiCount: overrides.liveTingpaiCount ?? 0,
      waitQualityScore: overrides.waitQualityScore ?? 0,
      bestWaitType: overrides.bestWaitType || 'none',
      contextualHandValueEstimate: overrides.contextualHandValueEstimate ?? 20,
      waits: ['should-be-stripped'],
      hardContext: { shouldBeStripped: true }
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
      reasons: overrides.shapeReasons || [],
      hardContext: { shouldBeStripped: true }
    },
    mortal: {
      qValue: overrides.qValue ?? 0.5,
      qDeltaFromBest: overrides.qDeltaFromBest ?? 0.2,
      isBest: Boolean(overrides.isBest),
      actionIndex: overrides.actionIndex ?? 12
    },
    runtime: { shouldBeStripped: true }
  };
}

function makeFixedState(overrides = {}) {
  const seat = overrides.seat || 'bottom';
  return {
    seat,
    phase: 'await_discard',
    turnSeat: seat,
    remaining: overrides.remaining ?? 48,
    doraIndicators: ['m4'],
    scores: {
      bottom: 25000,
      right: 25000,
      top: 25000,
      left: 25000
    },
    round: {
      ju: 0,
      changbang: 0,
      lizhibang: 0
    },
    seats: {
      [seat]: {
        handCodes: ['m1', 'm2', 'm3', 'p4', 'p5', 'p6', 's7', 's8', 's9', 'z1', 'z1', 'z2', 'z3', 'z4'],
        riverCodes: [],
        melds: [],
        riichi: { declared: false }
      }
    },
    localDiscard: {
      tileCode: overrides.localTile || 'm9',
      tileIndex: 0,
      shouldRiichi: false
    },
    discardCandidates: [
      {
        tileCode: overrides.localTile || 'm9',
        tileIndex: 0,
        isDrawDiscard: false,
        selectedFinal: true,
        xiangting: 1,
        hardEvScore: 100,
        dangerScore: 0,
        shapeScore: 4,
        shapeRole: 'isolated-terminal'
      },
      {
        tileCode: overrides.teacherTile || 's9',
        tileIndex: 1,
        isDrawDiscard: false,
        selectedFinal: false,
        xiangting: overrides.teacherXiangting ?? 1,
        hardEvScore: 96,
        dangerScore: 0,
        shapeScore: 16,
        shapeRole: 'isolated-terminal'
      }
    ],
    runtime: { shouldBeStripped: true },
    board: { shouldBeStripped: true },
    stdout: 'should-be-stripped',
    stderr: 'should-be-stripped'
  };
}

function makeTileChoiceRow(id, primaryCategory, localTile, teacherTile, overrides = {}) {
  const localCandidate = makeDiagnosticCandidate(localTile, {
    selectedFinal: true,
    hardEvScore: overrides.localHardEv ?? 100,
    shapeScore: overrides.localShape ?? 4,
    xiangting: overrides.localXiangting ?? 1
  });
  const mortalCandidate = makeDiagnosticCandidate(teacherTile, {
    hardEvScore: overrides.mortalHardEv ?? 96,
    shapeScore: overrides.mortalShape ?? 16,
    xiangting: overrides.mortalXiangting ?? 1,
    isBest: true,
    qValue: 0.8,
    qDeltaFromBest: 0
  });
  return {
    id,
    primaryCategory,
    qDelta: overrides.qDelta ?? 1.25,
    seed: 20260603,
    targetSeat: 'bottom',
    localTile,
    mortalTile: teacherTile,
    localDecision: { type: 'discard', seat: 'bottom', tileCode: localTile, riichi: false },
    mortalDecision: { type: 'discard', seat: 'bottom', tileCode: teacherTile, riichi: false },
    localCandidate,
    mortalCandidate,
    candidateTable: [localCandidate, mortalCandidate],
    fixedState: makeFixedState({
      localTile,
      teacherTile,
      teacherXiangting: overrides.mortalXiangting ?? 1
    }),
    classification: {
      relation: {
        xiangtingRelation: overrides.xiangtingRelation || 'same'
      },
      modelSignal: overrides.modelSignal || null
    }
  };
}

function buildFixtureInputs() {
  return {
    stage1: {
      arena: {
        hardTunedVsPure: {
          avgRankDelta: -0.08,
          fourthRateDelta: -0.02
        }
      },
      candidatePool: {
        rows: [
          {
            id: 'stage-defense',
            category: 'defense',
            bucket: 'tile-defense',
            qDelta: 2.1,
            seed: 11,
            targetSeat: 'bottom',
            local: { type: 'discard', tileCode: 'm8', riichi: false },
            mortalBest: { actionType: 'discard', tileCode: 'z1', qValue: 0.75 },
            decisionContextAvailable: true
          },
          {
            id: 'stage-riichi',
            category: 'riichi',
            bucket: 'riichi-missed',
            qDelta: 1.6,
            seed: 12,
            targetSeat: 'right',
            local: { type: 'discard', tileCode: 'p3', riichi: false },
            mortalBest: { actionType: 'riichi', tileCode: 'p3', qValue: 0.72 },
            decisionContextAvailable: true
          },
          {
            id: 'stage-action',
            category: 'action-type',
            bucket: 'action-type',
            qDelta: 1.1,
            seed: 13,
            targetSeat: 'top',
            local: { type: 'discard', tileCode: 's3', riichi: false },
            mortalBest: { actionType: 'pass', qValue: 0.68 },
            decisionContextAvailable: false
          }
        ]
      }
    },
    p0Review: {
      rows: [
        makeTileChoiceRow('p0-likely-bad', 'shape-score-suspect', 'm1', 's9', {
          qDelta: 2.8,
          modelSignal: { supportLevel: 'both-native-support-mortal' }
        })
      ]
    },
    fixtureFirst: {
      fixtures: [
        {
          fixtureId: 'fixture-first-001',
          sourceId: 'fixture-first-source',
          bucket: 'tile-choice',
          qDelta: 3.2,
          seed: 21,
          targetSeat: 'left',
          remaining: 40,
          currentHard: { tileCode: 'p5', candidate: makeDiagnosticCandidate('p5', { selectedFinal: true, shapeScore: -16 }) },
          teacher: { source: 'mortal', tileCode: 'm9', candidate: makeDiagnosticCandidate('m9', { isBest: true, shapeScore: 18 }) },
          candidateTable: [
            makeDiagnosticCandidate('p5', { selectedFinal: true, shapeScore: -16 }),
            makeDiagnosticCandidate('m9', { isBest: true, shapeScore: 18 })
          ],
          fixedState: makeFixedState({ seat: 'left', localTile: 'p5', teacherTile: 'm9' }),
          relation: { xiangtingRelation: 'same' },
          classification: {
            modelSignal: { supportLevel: 'both-native-support-mortal' }
          }
        }
      ]
    },
    tileChoice: {
      rows: [
        makeTileChoiceRow('same-shape', 'shape-score-suspect', 'm2', 's8'),
        makeTileChoiceRow('backstep-shape', 'mortal-backstep-shape', 'm4', 'z7', {
          mortalXiangting: 2,
          xiangtingRelation: 'mortal-worse'
        }),
        makeTileChoiceRow('route-five', 'route-dora-or-five', 'p5', 'm9', {
          localShape: -12,
          mortalShape: 18
        })
      ]
    },
    tunedMortal: {
      targetVariant: 'hard-tuned',
      rows: [
        {
          id: 'mortal-defense-large',
          seed: 31,
          targetSeat: 'bottom',
          judgment: { bucket: 'tile-defense' },
          mortalSeverity: { level: 'large', qDelta: 1.9 },
          localDecision: { type: 'discard', seat: 'bottom', tileCode: 'm7', riichi: false },
          coachDecision: { type: 'discard', seat: 'bottom', tileCode: 'z2', riichi: false },
          bestMortalCandidate: { actionType: 'discard', tileCode: 'z2', qValue: 0.8 },
          decisionContext: makeFixedState({ localTile: 'm7', teacherTile: 'z2' })
        }
      ]
    }
  };
}

function assertNoLargeObjects(report) {
  const serialized = JSON.stringify(report);
  [
    '"runtime"',
    '"board"',
    '"eventLog"',
    '"stdout"',
    '"stderr"',
    '"mortalRoot"',
    '"hardContext"',
    '"waits"'
  ].forEach((forbidden) => {
    assert(!serialized.includes(forbidden), `repair candidate report should omit ${forbidden}`);
  });
}

function validateRepairCandidatePool() {
  const report = repairApi.buildRepairCandidates(buildFixtureInputs(), {
    out: '/tmp/h14-p1-validator-repair-candidates.json',
    inputs: {
      fixture: true
    }
  });

  assert(report && report.source === 'hard-ai-repair-candidates', `unexpected source: ${report && report.source}`);
  assert(report.decisionRule.includes('Do not change formal hard-tuned'), `expected decision rule, got ${report.decisionRule}`);
  assert(Array.isArray(report.candidates) && report.candidates.length >= 8, `expected candidates, got ${report.candidates && report.candidates.length}`);

  [
    'defense',
    'riichi',
    'same-xiangting tile-choice',
    'backstep',
    'route-dora-five',
    'action-type'
  ].forEach((category) => {
    assert(report.summary.byCategory[category] >= 1, `expected category ${category}, got ${JSON.stringify(report.summary.byCategory)}`);
    assert(Array.isArray(report.groups.byCategory[category]) && report.groups.byCategory[category].length >= 1, `expected group ${category}`);
  });

  ['P0', 'P1', 'P2', 'P3'].forEach((priority) => {
    assert(report.summary.byPriority[priority] >= 1, `expected priority ${priority}, got ${JSON.stringify(report.summary.byPriority)}`);
    assert(Array.isArray(report.groups.byPriority[priority]) && report.groups.byPriority[priority].length >= 1, `expected priority group ${priority}`);
  });

  const byId = new Map(report.candidates.map((candidate) => [candidate.id, candidate]));
  assert(byId.get('fixture-first:fixture-first-source').priority === 'P0', 'expected fixture-first source to be P0');
  assert(byId.get('stage1:stage-defense').priority === 'P1', 'expected defense source to be P1');
  assert(byId.get('stage1:stage-riichi').priority === 'P1', 'expected riichi source to be P1');
  assert(byId.get('tile-choice:same-shape').priority === 'P2', 'expected same-xiangting tile choice to be P2');
  assert(byId.get('tile-choice:backstep-shape').priority === 'P3', 'expected backstep to be P3');
  assert(byId.get('tile-choice:route-five').category === 'route-dora-five', 'expected route category');
  assert(byId.get('stage1:stage-action').category === 'action-type', 'expected action-type category');

  report.candidates.forEach((candidate) => {
    assert(candidate.review && candidate.review.manualReviewRequired === true, `expected manual review for ${candidate.id}`);
    assert(Array.isArray(candidate.sourceTypes) && candidate.sourceTypes.length >= 1, `expected source types for ${candidate.id}`);
    if (candidate.fixedState) {
      assert(candidate.fixedState.seat, `expected compact fixed state seat for ${candidate.id}`);
      assert(Array.isArray(candidate.fixedState.discardCandidates), `expected compact discard candidates for ${candidate.id}`);
    }
  });

  assertNoLargeObjects(report);

  console.log('[PASS] hard-ai-repair-candidates-smoke');
  console.log(`  snapshot=${JSON.stringify({
    total: report.summary.total,
    byCategory: report.summary.byCategory,
    byPriority: report.summary.byPriority,
    fixedStateCount: report.summary.fixedStateCount
  })}`);
}

function main() {
  validateRepairCandidatePool();
}

if (require.main === module) {
  main();
}

module.exports = {
  buildFixtureInputs,
  validateRepairCandidatePool
};
