'use strict';

const ledgerApi = require('./build-hard-ai-experimental-ledger');
const diagnosticsApi = require('../engine/ai/support/hard-candidate-diagnostics');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function makeCandidate(id, category, overrides = {}) {
  return {
    id,
    priority: overrides.priority || 'P1',
    category,
    bucket: overrides.bucket || (category === 'defense' ? 'tile-defense' : 'tile-choice'),
    qDelta: overrides.qDelta ?? 1.5,
    pressureScore: overrides.pressureScore ?? 0,
    sourceTypes: ['fixture'],
    sourceIds: [id],
    currentHard: { tileCode: overrides.currentTile || 'm5' },
    teacher: { tileCode: overrides.teacherTile || 'm9' },
    fixedState: overrides.fixedState === false ? null : {
      seat: 'bottom',
      phase: 'await_discard',
      discardCandidates: []
    },
    relation: overrides.relation || null,
    runtime: { shouldNotLeak: true },
    board: { shouldNotLeak: true }
  };
}

function makeDefenseExperimentRejected() {
  return {
    source: 'hard-ai-repair-experiment',
    options: {
      experimentalOverlays: ['defense-equal-safe-backstep-v1']
    },
    gate: {
      status: 'ready-for-specific-patch-review',
      failed: []
    },
    mortal: {
      status: 'complete',
      largeDelta: 0,
      exactRateDelta: 0
    },
    arena: {
      variants: {
        'hard-tuned': {
          averageRank: 2.47,
          fourthRate: 0.2375,
          dealInRate: 0.146,
          averageScore: 25366
        },
        'hard-experimental': {
          averageRank: 2.53,
          fourthRate: 0.2625,
          dealInRate: 0.147,
          averageScore: 24626
        }
      }
    }
  };
}

function makeTileChoiceExperimentReplayRejected() {
  return {
    source: 'hard-ai-repair-experiment',
    options: {
      experimentalOverlays: ['no-pressure-same-xiangting-rerank-v1'],
      comparisonsSkippedReason: 'tile-choice-replay-no-patch-eligible'
    },
    gate: {
      status: 'not-ready-for-formal-hard',
      failed: [
        'tile-choice-replay-no-patch-eligible',
        'mortal-comparison-skipped',
        'arena-comparison-skipped'
      ]
    },
    mortal: {
      status: 'skipped',
      largeDelta: null,
      exactRateDelta: null
    },
    arena: null
  };
}

function assertNoLargeObjects(report) {
  const serialized = JSON.stringify(report);
  ['"runtime"', '"board"', '"eventLog"', '"stdout"', '"stderr"', '"mortalRoot"', '"hardContext"', '"waits"'].forEach((forbidden) => {
    assert(!serialized.includes(forbidden), `experimental ledger should omit ${forbidden}`);
  });
}

function validateLedger() {
  const pool = {
    source: 'fixture-pool',
    candidates: [
      makeCandidate('defense-eligible', 'defense', {
        priority: 'P1',
        currentTile: 'p5',
        teacherTile: 'm8',
        pressureScore: 8
      }),
      makeCandidate('defense-riskier', 'defense', {
        priority: 'P1',
        currentTile: 'm1',
        teacherTile: 'm2',
        pressureScore: 8
      }),
      makeCandidate('tile-route', 'same-xiangting tile-choice', {
        priority: 'P0',
        currentTile: 'p5',
        teacherTile: 'm9'
      }),
      makeCandidate('tile-already-fixed', 'same-xiangting tile-choice', {
        priority: 'P1',
        currentTile: 's8',
        teacherTile: 's8'
      }),
      makeCandidate('backstep-queue', 'backstep', {
        priority: 'P3',
        currentTile: 'm4',
        teacherTile: 'z7',
        relation: { xiangtingRelation: 'mortal-worse' }
      }),
      makeCandidate('riichi-queue', 'riichi', {
        priority: 'P1',
        currentTile: 'p3',
        teacherTile: 'p3'
      })
    ]
  };
  const defenseReplay = {
    source: 'hard-ai-defense-candidate-replay',
    rows: [
      {
        id: 'defense-eligible',
        classification: 'patch-eligible-equal-safe-backstep',
        reasons: ['experimental-equal-safe-backstep'],
        local: { tileCode: 'p5' },
        teacher: { tileCode: 'm8' },
        experimental: { tileCode: 'm8' },
        deltas: { teacherHardEvMinusLocal: 220 }
      },
      {
        id: 'defense-riskier',
        classification: 'teacher-riskier',
        reasons: ['teacher-candidate-riskier-than-local'],
        local: { tileCode: 'm1' },
        teacher: { tileCode: 'm2' },
        experimental: { tileCode: 'm1' },
        deltas: { teacherDangerMinusLocal: 1 }
      }
    ]
  };
  const tileChoiceReplay = {
    source: 'hard-ai-tile-choice-candidate-replay',
    rows: [
      {
        id: 'tile-route',
        classification: 'route-feature-missing',
        reasons: ['no-pressure', 'same-xiangting'],
        currentHard: { tileCode: 'p5' },
        teacher: { tileCode: 'm9' },
        experimental: { tileCode: 'p5' },
        deltas: { currentHardEvLossToTeacher: 12 }
      },
      {
        id: 'tile-already-fixed',
        classification: 'already-fixed-by-current-hard',
        reasons: ['current-hard-hits-teacher'],
        currentHard: { tileCode: 's8' },
        teacher: { tileCode: 's8' },
        experimental: { tileCode: 's8' },
        deltas: { currentHardEvLossToTeacher: 0 }
      }
    ]
  };

  const report = ledgerApi.buildExperimentalLedger({
    pool,
    defenseReplay,
    tileChoiceReplay,
    defenseExperiment: makeDefenseExperimentRejected(),
    tileChoiceExperiment: makeTileChoiceExperimentReplayRejected()
  }, {
    out: '/tmp/h14-p5-validator-ledger.json',
    inputs: { fixture: true }
  });

  assert(report.source === 'hard-ai-experimental-ledger', `unexpected source ${report.source}`);
  assert(report.experiments.defense.status === 'rejected-by-arena-scout', `expected defense arena rejection, got ${JSON.stringify(report.experiments.defense)}`);
  assert(report.experiments.tileChoice.status === 'rejected-by-replay-gate', `expected tile choice replay rejection, got ${JSON.stringify(report.experiments.tileChoice)}`);
  assert(report.summary.total === 6, `expected six rows, got ${JSON.stringify(report.summary)}`);
  assert(report.summary.byFinalStatus['rejected-by-arena-scout'] === 1, `expected one arena rejection, got ${JSON.stringify(report.summary.byFinalStatus)}`);
  assert(report.summary.byFinalStatus['teacher-riskier'] === 1, `expected one teacher-riskier, got ${JSON.stringify(report.summary.byFinalStatus)}`);
  assert(report.summary.byFinalStatus['manual-route-review'] === 1, `expected one route review, got ${JSON.stringify(report.summary.byFinalStatus)}`);
  assert(report.summary.byFinalStatus['already-fixed'] === 1, `expected one already-fixed, got ${JSON.stringify(report.summary.byFinalStatus)}`);
  assert(report.summary.byFinalStatus['queue-only-backstep'] === 1, `expected one backstep queue, got ${JSON.stringify(report.summary.byFinalStatus)}`);
  assert(report.summary.byFinalStatus['queue-only-riichi'] === 1, `expected one riichi queue, got ${JSON.stringify(report.summary.byFinalStatus)}`);
  assert(report.summary.topManualRouteReview[0].id === 'tile-route', `expected route top row, got ${JSON.stringify(report.summary.topManualRouteReview)}`);
  assertNoLargeObjects(report);

  console.log('[PASS] hard-ai-experimental-ledger-smoke');
  console.log(`  snapshot=${JSON.stringify({
    total: report.summary.total,
    byFinalStatus: report.summary.byFinalStatus,
    defenseExperiment: report.experiments.defense.status,
    tileChoiceExperiment: report.experiments.tileChoice.status
  })}`);
}

function validateRouteDiagnostics() {
  const runtime = {
    activeSeats: ['bottom', 'right', 'top', 'left'],
    board: {
      zhuangfeng: 0,
      jushu: 0
    },
    getDealerSeat() {
      return 'bottom';
    },
    getWallState() {
      return {
        doraIndicators: ['m4']
      };
    }
  };
  const shoupai = {
    _fulou: [],
    _bingpai: {
      m: Object.assign([], { 4: 1, 5: 2, 6: 1 }),
      p: Object.assign([], { 5: 1 }),
      s: Object.assign([], {}),
      z: Object.assign([], { 1: 2, 5: 2 })
    }
  };
  const doraRoute = diagnosticsApi.compactRoute({
    tileCode: 'm5',
    metrics: { xiangting: 1 }
  }, {
    runtime,
    seatKey: 'bottom',
    shoupai
  }, {
    discardTileRole: 'useful-five'
  });
  assert(doraRoute.discardIsDora === true, `expected m5 to be dora from m4 indicator, got ${JSON.stringify(doraRoute)}`);
  assert(doraRoute.cutsFive === true, `expected cuts five, got ${JSON.stringify(doraRoute)}`);
  assert(doraRoute.breaksRyanmenBlock === true, `expected ryanmen block break, got ${JSON.stringify(doraRoute)}`);
  assert(doraRoute.breaksValueRoute === true, `expected value route break, got ${JSON.stringify(doraRoute)}`);
  assert(doraRoute.closedRiichiRouteRisk === true, `expected closed riichi risk, got ${JSON.stringify(doraRoute)}`);
  assert(doraRoute.keepsDoraCount === 1, `expected one dora retained after cutting one m5, got ${JSON.stringify(doraRoute)}`);
  assert(doraRoute.discardTileRole === 'useful-five', `expected role passthrough, got ${JSON.stringify(doraRoute)}`);

  const yakuhaiRoute = diagnosticsApi.compactRoute({
    tileCode: 'z5',
    metrics: { xiangting: 2 }
  }, {
    runtime,
    seatKey: 'bottom',
    shoupai
  }, {
    discardTileRole: 'value-honor'
  });
  assert(yakuhaiRoute.cutsYakuhai === true, `expected cuts yakuhai, got ${JSON.stringify(yakuhaiRoute)}`);
  assert(yakuhaiRoute.breaksYakuhaiPair === true, `expected yakuhai pair break, got ${JSON.stringify(yakuhaiRoute)}`);
  assert(yakuhaiRoute.reasons.includes('route-breaks-yakuhai-pair'), `expected yakuhai reason, got ${JSON.stringify(yakuhaiRoute)}`);

  assertNoLargeObjects({ doraRoute, yakuhaiRoute });

  console.log('[PASS] hard-ai-route-diagnostics-smoke');
  console.log(`  snapshot=${JSON.stringify({
    doraRoute: {
      discardIsDora: doraRoute.discardIsDora,
      cutsFive: doraRoute.cutsFive,
      breaksValueRoute: doraRoute.breaksValueRoute,
      reasons: doraRoute.reasons
    },
    yakuhaiRoute: {
      cutsYakuhai: yakuhaiRoute.cutsYakuhai,
      breaksYakuhaiPair: yakuhaiRoute.breaksYakuhaiPair,
      reasons: yakuhaiRoute.reasons
    }
  })}`);
}

function main() {
  validateLedger();
  validateRouteDiagnostics();
}

if (require.main === module) {
  main();
}

module.exports = {
  validateLedger,
  validateRouteDiagnostics
};
