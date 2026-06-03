'use strict';

const routeReviewApi = require('./build-hard-ai-route-review-pack');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function makeCandidate(tileCode, overrides = {}) {
  return {
    tileCode,
    normalizedTileCode: routeReviewApi.normalizeTileCode(tileCode),
    selectedFinal: Boolean(overrides.selectedFinal),
    metrics: {
      xiangting: overrides.xiangting ?? 1,
      tingpaiCount: overrides.tingpaiCount ?? 2,
      ukeireCount: overrides.ukeireCount ?? 8,
      handValueEstimate: overrides.handValueEstimate ?? 20
    },
    danger: {
      dangerScore: overrides.dangerScore ?? 0,
      safetyRank: overrides.safetyRank ?? 6,
      defenseTileRank: overrides.defenseTileRank ?? 60,
      categories: [],
      safetyReasons: []
    },
    hardMetrics: {
      hardEvScore: overrides.hardEvScore ?? 100,
      liveUkeireCount: overrides.liveUkeireCount ?? 8,
      liveTingpaiCount: overrides.liveTingpaiCount ?? 2,
      waitQualityScore: overrides.waitQualityScore ?? 8,
      bestWaitType: overrides.bestWaitType || 'kanchan',
      contextualHandValueEstimate: overrides.contextualHandValueEstimate ?? 20,
      waits: ['should-be-stripped'],
      hardContext: { shouldBeStripped: true }
    },
    shape: {
      discardShapeScore: overrides.shapeScore ?? 0,
      discardTileRole: overrides.shapeRole || 'floating-middle',
      reasons: overrides.shapeReasons || [],
      hardContext: { shouldBeStripped: true }
    },
    mortal: {
      qValue: overrides.qValue ?? 0,
      qDeltaFromBest: overrides.qDeltaFromBest ?? 0,
      isBest: Boolean(overrides.isBest)
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
    remaining: overrides.remaining ?? 34,
    doraIndicators: overrides.doraIndicators || ['m4'],
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
      [seat]: {
        handCodes: overrides.handCodes || ['m4', 'm5', 'm5', 'm6', 'p2', 'p3', 'p4', 's7', 's8', 's9', 'z5', 'z5', 'z6', 'm5'],
        riverCodes: [],
        melds: overrides.melds || [],
        riichi: { declared: false }
      }
    },
    localDiscard: {
      tileCode: overrides.localTile || 'm5',
      tileIndex: 0,
      shouldRiichi: false
    },
    discardCandidates: [],
    runtime: { shouldBeStripped: true },
    board: { shouldBeStripped: true },
    stdout: 'should-strip',
    stderr: 'should-strip'
  };
}

function makeRepairCandidate(id, overrides = {}) {
  const localTile = overrides.localTile || 'm5';
  const teacherTile = overrides.teacherTile || 'z6';
  const localCandidate = makeCandidate(localTile, {
    selectedFinal: true,
    hardEvScore: overrides.localHardEv ?? 120,
    shapeScore: overrides.localShape ?? -8,
    qDeltaFromBest: overrides.qDelta ?? 2.5
  });
  const mortalCandidate = makeCandidate(teacherTile, {
    hardEvScore: overrides.teacherHardEv ?? 118,
    shapeScore: overrides.teacherShape ?? 12,
    isBest: true,
    qDeltaFromBest: 0,
    qValue: 0.4
  });
  return {
    id,
    sourceIds: [id],
    sourceTypes: ['fixture'],
    category: overrides.category || 'same-xiangting tile-choice',
    bucket: 'tile-choice',
    qDelta: overrides.qDelta ?? 2.5,
    qBand: 'serious-suspect',
    pressureScore: 0,
    seed: 20260603,
    targetSeat: overrides.seat || 'bottom',
    remaining: 34,
    currentHard: { type: 'discard', seat: overrides.seat || 'bottom', tileCode: localTile, riichi: false },
    teacher: { actionType: 'discard', tileCode: teacherTile, qValue: 0.4, qDeltaFromBest: 0, isBest: true },
    localDecision: { type: 'discard', seat: overrides.seat || 'bottom', tileCode: localTile, riichi: false },
    mortalDecision: { type: 'discard', seat: overrides.seat || 'bottom', tileCode: teacherTile, riichi: false },
    localCandidate,
    mortalCandidate,
    candidateTable: overrides.noCandidates ? [] : [localCandidate, mortalCandidate],
    fixedState: overrides.noFixedState ? null : makeFixedState({
      seat: overrides.seat || 'bottom',
      localTile,
      teacherTile,
      doraIndicators: overrides.doraIndicators,
      handCodes: overrides.handCodes,
      melds: overrides.melds
    }),
    relation: { xiangtingRelation: 'same' },
    classification: {
      primaryPattern: overrides.primaryPattern || 'missing-runtime-feature-or-route-signal',
      modes: overrides.modes || ['tile-route-choice'],
      modelSignal: overrides.modelSignal || null
    },
    modelSignal: overrides.modelSignal || null,
    runtime: { shouldBeStripped: true }
  };
}

function makeFixtureInputs() {
  const likelyBad = makeRepairCandidate('route-likely-bad', {
    localTile: 'm5',
    teacherTile: 'z6',
    qDelta: 3.2,
    modelSignal: { supportLevel: 'both-native-support-mortal' }
  });
  const style = makeRepairCandidate('route-style', {
    localTile: 'z2',
    teacherTile: 'z3',
    qDelta: 0.4,
    doraIndicators: ['m9'],
    handCodes: ['m1', 'm2', 'm3', 'p1', 'p2', 'p3', 's1', 's2', 's3', 's7', 's8', 's9', 'z2', 'z3']
  });
  const insufficient = makeRepairCandidate('route-insufficient', {
    localTile: 'p5',
    teacherTile: 'p9',
    qDelta: 1.6,
    noFixedState: true,
    noCandidates: true
  });
  const alreadyFixed = makeRepairCandidate('route-already-fixed', {
    localTile: 'm9',
    teacherTile: 'm9',
    qDelta: 1.1
  });
  const routeDoraFive = makeRepairCandidate('route-dora-five', {
    category: 'route-dora-five',
    localTile: 'z5',
    teacherTile: 'p2',
    qDelta: 0.7
  });
  return {
    ledger: {
      source: 'fixture-ledger',
      rows: [
        {
          id: likelyBad.id,
          finalStatus: 'manual-route-review',
          replayClassification: 'route-feature-missing',
          qDelta: likelyBad.qDelta,
          category: likelyBad.category
        },
        {
          id: style.id,
          finalStatus: 'manual-route-review',
          replayClassification: 'route-feature-missing',
          qDelta: style.qDelta,
          category: style.category
        },
        {
          id: insufficient.id,
          finalStatus: 'manual-route-review',
          replayClassification: 'tenpai-route-manual-review',
          qDelta: insufficient.qDelta,
          category: insufficient.category
        },
        {
          id: alreadyFixed.id,
          finalStatus: 'manual-route-review',
          replayClassification: 'route-feature-missing',
          qDelta: alreadyFixed.qDelta,
          category: alreadyFixed.category
        }
      ]
    },
    pool: {
      candidates: [likelyBad, style, insufficient, alreadyFixed, routeDoraFive]
    },
    tileChoiceReplay: {
      rows: [
        {
          id: alreadyFixed.id,
          classification: 'already-fixed-by-current-hard',
          currentHard: { tileCode: 'm9' },
          teacher: { tileCode: 'm9' }
        }
      ]
    }
  };
}

function assertNoLargeObjects(value) {
  const serialized = JSON.stringify(value);
  ['"runtime"', '"board"', '"eventLog"', '"stdout"', '"stderr"', '"mortalRoot"', '"hardContext"', '"waits"'].forEach((token) => {
    assert(!serialized.includes(token), `route review pack should omit ${token}`);
  });
}

function validateRouteReviewPack() {
  const report = routeReviewApi.buildRouteReviewPack(makeFixtureInputs(), {
    jsonOut: '/tmp/h14-p6-validator-route-review-pack.json',
    mdOut: '/tmp/h14-p6-validator-route-review-pack.md',
    inputs: { fixture: true }
  });
  const markdown = routeReviewApi.renderMarkdown(report);
  assert(report.source === 'hard-ai-route-review-pack', `unexpected source ${report.source}`);
  assert(report.summary.total === 5, `expected five review rows, got ${JSON.stringify(report.summary)}`);
  assert(report.summary.byAssessment['likely-bad-route'] === 1, `expected likely-bad route, got ${JSON.stringify(report.summary.byAssessment)}`);
  assert(report.summary.byAssessment['likely-style-disagreement'] >= 1, `expected style disagreement, got ${JSON.stringify(report.summary.byAssessment)}`);
  assert(report.summary.byAssessment['insufficient-context'] === 1, `expected insufficient context, got ${JSON.stringify(report.summary.byAssessment)}`);
  assert(report.summary.byAssessment['already-fixed-or-no-clear-gain'] === 1, `expected already fixed, got ${JSON.stringify(report.summary.byAssessment)}`);
  const likelyBad = report.rows.find((row) => row.id === 'route-likely-bad');
  assert(likelyBad.currentHardCandidate.route.discardIsDora === true, `expected route to infer dora cut, got ${JSON.stringify(likelyBad.currentHardCandidate.route)}`);
  assert(likelyBad.currentHardCandidate.route.cutsFive === true, `expected route to infer five cut`);
  assert(Array.isArray(likelyBad.candidates) && likelyBad.candidates.length >= 2, 'expected candidate comparison table');
  assert(markdown.includes('route-likely-bad'), 'expected markdown row id');
  assert(markdown.includes('| tile | mark | xt | hardEv | shape | role | danger | route | qDelta |'), 'expected markdown candidate table');
  assertNoLargeObjects(report);
  assertNoLargeObjects(markdown);
  console.log('[PASS] hard-ai-route-review-pack-smoke');
  console.log(`  snapshot=${JSON.stringify({
    total: report.summary.total,
    byAssessment: report.summary.byAssessment,
    topLikelyBad: report.summary.topLikelyBad
  })}`);
}

function main() {
  validateRouteReviewPack();
}

if (require.main === module) {
  main();
}

module.exports = {
  makeFixtureInputs,
  validateRouteReviewPack
};
