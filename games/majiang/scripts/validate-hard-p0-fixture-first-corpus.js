'use strict';

const corpusFixture = require('./validate-hard-disagreement-corpus');
const corpusApi = require('./analyze-hard-disagreement-corpus');
const adjudicationApi = require('./adjudicate-hard-disagreement-corpus');
const p0ReviewApi = require('./analyze-hard-p0-likely-bad-review');
const fixtureApi = require('./build-hard-p0-fixture-first-corpus');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function buildFixtureReview() {
  const report = {
    rows: [
      corpusFixture.makeRow('fixture-first-a', {
        qDelta: 3.6,
        localTile: 'p6',
        bestTile: 'p9',
        localXiangting: 2,
        mortalXiangting: 2,
        localEv: 134,
        mortalEv: 120,
        localShape: -8,
        mortalShape: 12
      }),
      corpusFixture.makeRow('fixture-first-b', {
        qDelta: 2.8,
        localTile: 'z7',
        bestTile: 'm9',
        localXiangting: 2,
        mortalXiangting: 2,
        localEv: 144,
        mortalEv: 130,
        localShape: -6,
        mortalShape: 12
      }),
      corpusFixture.makeRow('shape-overprotect-not-fixture-first', {
        qDelta: 3.2,
        localTile: 'p8',
        bestTile: 'p5',
        localXiangting: 2,
        mortalXiangting: 2,
        localEv: 118,
        mortalEv: 120,
        localShape: 18,
        mortalShape: 3
      }),
      corpusFixture.makeRow('metrics-tie-not-fixture-first', {
        qDelta: 2.6,
        localTile: 'm8',
        bestTile: 's8',
        localXiangting: 2,
        mortalXiangting: 2,
        localEv: 120,
        mortalEv: 120,
        localShape: 5,
        mortalShape: 5
      })
    ]
  };
  const predictionMaps = {
    nativeFull: {
      path: '/tmp/h13h-p0-fixture-native-full.json',
      rows: new Map([
        ['fixture-first-a', corpusFixture.makePredictionRow('fixture-first-a', {
          currentExact: false,
          modelExact: true,
          currentTile: 'p6',
          modelTile: 'p9',
          mortalTile: 'p9'
        })],
        ['fixture-first-b', corpusFixture.makePredictionRow('fixture-first-b', {
          currentExact: false,
          modelExact: true,
          currentTile: 'z7',
          modelTile: 'm9',
          mortalTile: 'm9'
        })],
        ['shape-overprotect-not-fixture-first', corpusFixture.makePredictionRow('shape-overprotect-not-fixture-first', {
          currentExact: false,
          modelExact: true,
          currentTile: 'p8',
          modelTile: 'p5',
          mortalTile: 'p5'
        })]
      ])
    },
    nativeNoShape: {
      path: '/tmp/h13h-p0-fixture-native-no-shape.json',
      rows: new Map([
        ['fixture-first-a', corpusFixture.makePredictionRow('fixture-first-a', {
          currentExact: false,
          modelExact: true,
          currentTile: 'p6',
          modelTile: 'p9',
          mortalTile: 'p9'
        })],
        ['fixture-first-b', corpusFixture.makePredictionRow('fixture-first-b', {
          currentExact: false,
          modelExact: true,
          currentTile: 'z7',
          modelTile: 'm9',
          mortalTile: 'm9'
        })],
        ['shape-overprotect-not-fixture-first', corpusFixture.makePredictionRow('shape-overprotect-not-fixture-first', {
          currentExact: false,
          modelExact: true,
          currentTile: 'p8',
          modelTile: 'p5',
          mortalTile: 'p5'
        })]
      ])
    }
  };
  const corpus = corpusApi.buildDisagreementCorpus(report, {
    predictionMaps,
    includeNormal: false
  });
  const adjudicated = adjudicationApi.adjudicateCorpus(corpus, {
    inputPath: '/tmp/h13h-p0-fixture-corpus.json'
  });
  return p0ReviewApi.buildP0LikelyBadReview(adjudicated, {
    inputPath: '/tmp/h13h-p0-fixture-labeled.json'
  });
}

function assertCompact(corpus) {
  const serialized = JSON.stringify(corpus);
  ['"runtime"', '"stdout"', '"stderr"', '"hardContext"', '"waits"', '"mortalRoot"'].forEach((forbidden) => {
    assert(!serialized.includes(forbidden), `fixture corpus should omit ${forbidden}`);
  });
  corpus.fixtures.forEach((fixture) => {
    assert(fixture.fixtureId && fixture.fixtureId.startsWith('h13h-p0-'), `expected fixture id for ${fixture.sourceId}`);
    assert(fixture.currentHard && fixture.currentHard.tileCode, `expected current hard tile for ${fixture.sourceId}`);
    assert(fixture.teacher && fixture.teacher.tileCode, `expected teacher tile for ${fixture.sourceId}`);
    assert(fixture.fixedState && fixture.fixedState.phase === 'await_discard', `expected fixed state for ${fixture.sourceId}`);
    assert(Array.isArray(fixture.candidateTable) && fixture.candidateTable.length >= 2, `expected candidate table for ${fixture.sourceId}`);
    assert(fixture.candidateTable.some((candidate) => candidate.isCurrentHardTile), `candidate table should include current hard tile for ${fixture.sourceId}`);
    assert(fixture.candidateTable.some((candidate) => candidate.isTeacherTile), `candidate table should include teacher tile for ${fixture.sourceId}`);
    assert(fixture.review && fixture.review.manualReviewRequired, `expected manual review slot for ${fixture.sourceId}`);
  });
}

function main() {
  const review = buildFixtureReview();
  const corpus = fixtureApi.buildP0FixtureFirstCorpus(review, {
    inputPath: '/tmp/h13h-p0-fixture-review.json'
  });
  const sourceIds = corpus.fixtures.map((fixture) => fixture.sourceId);

  assert(corpus.source === 'hard-p0-fixture-first-corpus', `unexpected source ${corpus.source}`);
  assert(corpus.summary.total === 2, `expected two fixture-first rows, got ${corpus.summary.total}`);
  assert(sourceIds.includes('fixture-first-a'), `expected fixture-first-a, got ${JSON.stringify(sourceIds)}`);
  assert(sourceIds.includes('fixture-first-b'), `expected fixture-first-b, got ${JSON.stringify(sourceIds)}`);
  assert(!sourceIds.includes('shape-overprotect-not-fixture-first'), 'shape overprotect row should stay out of fixture-first corpus');
  assert(!sourceIds.includes('metrics-tie-not-fixture-first'), 'metrics tie row should stay out of fixture-first corpus');
  assert(corpus.summary.byPrimaryPattern['shape-and-model-consensus-support-mortal'] === 2, `unexpected primary pattern counts ${JSON.stringify(corpus.summary.byPrimaryPattern)}`);
  assert(corpus.summary.byModelSupport['both-native-support-mortal'] === 2, `unexpected model support counts ${JSON.stringify(corpus.summary.byModelSupport)}`);
  assert(corpus.filters.recommendedNextAction === 'promote-to-deterministic-fixture-before-strategy-change', 'expected fixture-first filter metadata');
  assertCompact(corpus);

  console.log('[PASS] hard-p0-fixture-first-corpus-smoke');
  console.log(`  snapshot=${JSON.stringify({
    total: corpus.summary.total,
    sourceIds: corpus.summary.sourceIds,
    byPrimaryPattern: corpus.summary.byPrimaryPattern,
    byModelSupport: corpus.summary.byModelSupport
  })}`);
}

if (require.main === module) {
  main();
}
