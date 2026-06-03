'use strict';

const corpusFixture = require('./validate-hard-disagreement-corpus');
const corpusApi = require('./analyze-hard-disagreement-corpus');
const adjudicationApi = require('./adjudicate-hard-disagreement-corpus');
const p0Api = require('./analyze-hard-p0-likely-bad-review');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function buildFixtureAdjudication() {
  const report = {
    rows: [
      corpusFixture.makeRow('shape-consensus-p0', {
        qDelta: 3.4,
        localTile: 'p6',
        bestTile: 'p9',
        localXiangting: 2,
        mortalXiangting: 2,
        localEv: 134,
        mortalEv: 120,
        localShape: -8,
        mortalShape: 12
      }),
      corpusFixture.makeRow('shape-local-p0', {
        qDelta: 3.1,
        localTile: 'p8',
        bestTile: 'p5',
        localXiangting: 2,
        mortalXiangting: 2,
        localEv: 118,
        mortalEv: 120,
        localShape: 18,
        mortalShape: 3
      }),
      corpusFixture.makeRow('tie-missing-feature-p0', {
        qDelta: 2.7,
        localTile: 'm8',
        bestTile: 's8',
        localXiangting: 2,
        mortalXiangting: 2,
        localEv: 120,
        mortalEv: 120,
        localShape: 5,
        mortalShape: 5
      }),
      corpusFixture.makeRow('non-p0-suspect', {
        qDelta: 1.2,
        localTile: 'm1',
        bestTile: 's9',
        localXiangting: 2,
        mortalXiangting: 2,
        localEv: 180,
        mortalEv: 170,
        localShape: 6,
        mortalShape: 8
      })
    ]
  };
  const predictionMaps = {
    nativeFull: {
      path: '/tmp/h13h-native-full-fixture-predictions.json',
      rows: new Map([
        ['shape-consensus-p0', corpusFixture.makePredictionRow('shape-consensus-p0', {
          currentExact: false,
          modelExact: true,
          currentTile: 'p6',
          modelTile: 'p9',
          mortalTile: 'p9'
        })],
        ['shape-local-p0', corpusFixture.makePredictionRow('shape-local-p0', {
          currentExact: false,
          modelExact: true,
          currentTile: 'p8',
          modelTile: 'p5',
          mortalTile: 'p5'
        })],
        ['non-p0-suspect', corpusFixture.makePredictionRow('non-p0-suspect', {
          currentExact: false,
          modelExact: true,
          currentTile: 'm1',
          modelTile: 's9',
          mortalTile: 's9'
        })]
      ])
    },
    nativeNoShape: {
      path: '/tmp/h13h-native-no-shape-fixture-predictions.json',
      rows: new Map([
        ['shape-consensus-p0', corpusFixture.makePredictionRow('shape-consensus-p0', {
          currentExact: false,
          modelExact: true,
          currentTile: 'p6',
          modelTile: 'p9',
          mortalTile: 'p9'
        })],
        ['shape-local-p0', corpusFixture.makePredictionRow('shape-local-p0', {
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
  return adjudicationApi.adjudicateCorpus(corpus, {
    inputPath: '/tmp/h13h-fixture-adjudication-corpus.json'
  });
}

function main() {
  const adjudicated = buildFixtureAdjudication();
  const review = p0Api.buildP0LikelyBadReview(adjudicated, {
    inputPath: '/tmp/h13h-fixture-adjudication-labeled.json'
  });
  const byId = new Map(review.rows.map((row) => [row.id, row]));

  assert(review.source === 'hard-p0-likely-bad-review', `unexpected source ${review.source}`);
  assert(review.summary.total === 3, `expected three P0 rows, got ${review.summary.total}`);
  assert(!byId.has('non-p0-suspect'), 'non-P0 suspect row should not enter P0 review');
  assert(byId.get('shape-consensus-p0').classification.primaryPattern === 'shape-and-model-consensus-support-mortal', `unexpected shape consensus pattern ${byId.get('shape-consensus-p0').classification.primaryPattern}`);
  assert(byId.get('shape-local-p0').classification.primaryPattern === 'shape-overprotects-local-against-model-consensus', `unexpected shape local pattern ${byId.get('shape-local-p0').classification.primaryPattern}`);
  assert(byId.get('tie-missing-feature-p0').classification.primaryPattern === 'missing-runtime-feature-or-route-signal', `unexpected tie pattern ${byId.get('tie-missing-feature-p0').classification.primaryPattern}`);
  assert(review.summary.byPrimaryPattern['shape-and-model-consensus-support-mortal'] === 1, `expected shape consensus count, got ${JSON.stringify(review.summary.byPrimaryPattern)}`);
  assert(review.summary.byModelSupport['both-native-support-mortal'] === 2, `expected model support count, got ${JSON.stringify(review.summary.byModelSupport)}`);
  assert(Array.isArray(review.summary.fixtureFirstRows) && review.summary.fixtureFirstRows.length === 1, 'expected fixture-first summary row');

  review.rows.forEach((row) => {
    assert(row.adjudication && row.adjudication.manualReviewRequired, `expected manual review for ${row.id}`);
    assert(row.localCandidate && row.localCandidate.tileCode, `expected local candidate for ${row.id}`);
    assert(row.mortalCandidate && row.mortalCandidate.tileCode, `expected Mortal candidate for ${row.id}`);
    assert(Array.isArray(row.candidateTable) && row.candidateTable.length >= 2, `expected candidate table for ${row.id}`);
    assert(row.fixedState && row.fixedState.phase === 'await_discard', `expected fixed state for ${row.id}`);
  });

  const serialized = JSON.stringify(review);
  ['"runtime"', '"stdout"', '"stderr"', '"hardContext"', '"waits"'].forEach((forbidden) => {
    assert(!serialized.includes(forbidden), `P0 review should omit ${forbidden}`);
  });

  console.log('[PASS] hard-p0-likely-bad-review-smoke');
  console.log(`  snapshot=${JSON.stringify({
    total: review.summary.total,
    byPrimaryPattern: review.summary.byPrimaryPattern,
    byModelSupport: review.summary.byModelSupport,
    byTilePairTheme: review.summary.byTilePairTheme
  })}`);
}

if (require.main === module) {
  main();
}
