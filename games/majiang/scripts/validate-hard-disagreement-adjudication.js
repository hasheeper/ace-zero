'use strict';

const corpusFixture = require('./validate-hard-disagreement-corpus');
const corpusApi = require('./analyze-hard-disagreement-corpus');
const adjudicationApi = require('./adjudicate-hard-disagreement-corpus');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function buildFixtureCorpus() {
  const report = {
    rows: [
      corpusFixture.makeRow('normal', { qDelta: 0.04 }),
      corpusFixture.makeRow('defense', {
        qDelta: 1.5,
        bucket: 'tile-defense',
        pressureScore: 6,
        localXiangting: 1,
        mortalXiangting: 2
      }),
      corpusFixture.makeRow('backstep', {
        qDelta: 1.8,
        localXiangting: 1,
        mortalXiangting: 2
      }),
      corpusFixture.makeRow('mortal-better', {
        qDelta: 1.2,
        localXiangting: 2,
        mortalXiangting: 1
      }),
      corpusFixture.makeRow('likely-both-models', {
        qDelta: 2.6,
        localXiangting: 2,
        mortalXiangting: 2,
        localEv: 180,
        mortalEv: 170,
        localShape: 4,
        mortalShape: 6
      }),
      corpusFixture.makeRow('suspect-one-model', {
        qDelta: 1.1,
        localXiangting: 2,
        mortalXiangting: 2,
        localEv: 180,
        mortalEv: 170
      }),
      corpusFixture.makeRow('acceptable-review', {
        qDelta: 0.4,
        localXiangting: 2,
        mortalXiangting: 2,
        localEv: 190,
        mortalEv: 170,
        localShape: 8,
        mortalShape: 4
      }),
      corpusFixture.makeRow('missing-context', {
        qDelta: 0.8
      })
    ]
  };
  delete report.rows[7].decisionContext;

  const predictionMaps = {
    nativeFull: {
      path: '/tmp/native-full.json',
      rows: new Map([
        ['likely-both-models', corpusFixture.makePredictionRow('likely-both-models', { currentExact: false, modelExact: true })],
        ['suspect-one-model', corpusFixture.makePredictionRow('suspect-one-model', { currentExact: false, modelExact: true })]
      ])
    },
    nativeNoShape: {
      path: '/tmp/native-no-shape.json',
      rows: new Map([
        ['likely-both-models', corpusFixture.makePredictionRow('likely-both-models', { currentExact: false, modelExact: true })],
        ['suspect-one-model', corpusFixture.makePredictionRow('suspect-one-model', { currentExact: false, modelExact: false })]
      ])
    }
  };

  return corpusApi.buildDisagreementCorpus(report, {
    predictionMaps,
    includeNormal: true
  });
}

function main() {
  const corpus = buildFixtureCorpus();
  const adjudicated = adjudicationApi.adjudicateCorpus(corpus, {
    inputPath: '/tmp/fixture-corpus.json'
  });
  const byId = new Map(adjudicated.rows.map((row) => [row.id, row]));
  const labelOf = (id) => byId.get(id).autoAdjudication.label;

  assert(labelOf('normal') === 'normal-disagreement', `expected normal-disagreement, got ${labelOf('normal')}`);
  assert(labelOf('defense') === 'defense-tradeoff-review', `expected defense review, got ${labelOf('defense')}`);
  assert(labelOf('backstep') === 'route-backstep-review', `expected route backstep, got ${labelOf('backstep')}`);
  assert(labelOf('mortal-better') === 'hard-likely-bad-move', `expected likely bad for better xiangting, got ${labelOf('mortal-better')}`);
  assert(labelOf('likely-both-models') === 'hard-likely-bad-move', `expected likely bad, got ${labelOf('likely-both-models')}`);
  assert(labelOf('suspect-one-model') === 'hard-suspect-mistake', `expected suspect, got ${labelOf('suspect-one-model')}`);
  assert(labelOf('acceptable-review') === 'mortal-preference-acceptable', `expected acceptable preference, got ${labelOf('acceptable-review')}`);
  assert(labelOf('missing-context') === 'insufficient-context', `expected insufficient context, got ${labelOf('missing-context')}`);

  assert(adjudicated.summary.total === 8, `expected 8 rows, got ${adjudicated.summary.total}`);
  assert(adjudicated.summary.labelCounts['hard-likely-bad-move'] === 2, `expected two likely bad rows, got ${JSON.stringify(adjudicated.summary.labelCounts)}`);
  assert(adjudicated.summary.labelCounts['route-backstep-review'] === 1, `expected one route row, got ${JSON.stringify(adjudicated.summary.labelCounts)}`);
  assert(adjudicated.summary.labelCounts['defense-tradeoff-review'] === 1, `expected one defense row, got ${JSON.stringify(adjudicated.summary.labelCounts)}`);
  assert(adjudicated.summary.labelCounts['insufficient-context'] === 1, `expected one missing context row, got ${JSON.stringify(adjudicated.summary.labelCounts)}`);
  assert(adjudicated.summary.reviewPriorityCounts.P0 >= 2, `expected P0 rows, got ${JSON.stringify(adjudicated.summary.reviewPriorityCounts)}`);
  assert(Array.isArray(adjudicated.summary.likelyBadRows) && adjudicated.summary.likelyBadRows.length === 2, 'expected likelyBadRows summary');
  assert(byId.get('likely-both-models').adjudication.suggestedLabel === 'hard-likely-bad-move', 'expected suggested label on row');
  assert(byId.get('likely-both-models').adjudication.status === 'unreviewed', 'auto pass should not mark human review complete');

  const serialized = JSON.stringify(adjudicated);
  ['"stdout"', '"stderr"', '"hardContext"', '"waits"'].forEach((forbidden) => {
    assert(!serialized.includes(forbidden), `adjudicated corpus should omit ${forbidden}`);
  });

  console.log('[PASS] hard-disagreement-adjudication-smoke');
  console.log(`  snapshot=${JSON.stringify({
    total: adjudicated.summary.total,
    labelCounts: adjudicated.summary.labelCounts,
    priorityCounts: adjudicated.summary.reviewPriorityCounts,
    manualReviewRequired: adjudicated.summary.manualReviewRequired
  })}`);
}

if (require.main === module) {
  main();
}
