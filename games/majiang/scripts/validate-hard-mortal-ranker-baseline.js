'use strict';

const rankerApi = require('./lib/hard-mortal-ranker-dataset');
const {
  makeHardCandidate,
  makeReportRow
} = require('./validate-hard-mortal-ranker-dataset');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function buildFixtureDatasetRows() {
  const report = {
    rows: [
      makeReportRow('baseline-current-large'),
      makeReportRow('baseline-current-exact', {
        localTile: 's9',
        bestTile: 's9',
        severityLevel: 'exact',
        qDelta: 0
      }),
      makeReportRow('baseline-ev-best', {
        localTile: 'm9',
        bestTile: 's9',
        severityLevel: 'large',
        qDelta: 0.25,
        hardCandidateDiagnostics: [
          makeHardCandidate('m9', {
            tileIndex: 0,
            selectedFinal: true,
            hardEvScore: 90,
            shapeScore: 0
          }),
          makeHardCandidate('s9', {
            tileIndex: 1,
            hardEvScore: 180,
            shapeScore: 2
          }),
          makeHardCandidate('m5', {
            tileIndex: 2,
            hardEvScore: 80,
            shapeScore: -8,
            shapeRole: 'central-five'
          })
        ]
      })
    ]
  };
  return rankerApi.buildRankerDatasetFromReports([{
    path: '/tmp/fixture-hard-ranker-baseline.json',
    report
  }]).candidateRows;
}

function assertStrategy(summary, name) {
  const strategy = summary.strategies[name];
  assert(strategy, `expected ${name} strategy, got ${JSON.stringify(summary.strategies)}`);
  assert(strategy.states === 3, `expected ${name} to evaluate 3 states, got ${JSON.stringify(strategy)}`);
  assert(Number.isFinite(Number(strategy.exactRate)), `expected ${name} exactRate, got ${JSON.stringify(strategy)}`);
  assert(Number.isFinite(Number(strategy.nearOrExactRate)), `expected ${name} nearOrExactRate, got ${JSON.stringify(strategy)}`);
  assert(Number.isFinite(Number(strategy.mediumOrBetterRate)), `expected ${name} mediumOrBetterRate, got ${JSON.stringify(strategy)}`);
  assert(Number.isFinite(Number(strategy.largeRate)), `expected ${name} largeRate, got ${JSON.stringify(strategy)}`);
  assert(strategy.bucketCounts['tile-choice'] >= 1, `expected ${name} tile-choice bucket count, got ${JSON.stringify(strategy.bucketCounts)}`);
}

function main() {
  const rows = buildFixtureDatasetRows();
  const grouped = rankerApi.groupRowsByState(rows);
  assert(grouped.size === 3, `expected 3 grouped states, got ${grouped.size}`);
  grouped.forEach((stateRows, stateId) => {
    assert(stateRows.length >= 2, `expected multiple candidates for ${stateId}, got ${stateRows.length}`);
    assert(stateRows.some((row) => row.label.isLocalSelected), `expected current hard selected candidate for ${stateId}`);
    assert(stateRows.some((row) => row.label.isMortalBest), `expected Mortal best candidate for ${stateId}`);
  });

  const summary = rankerApi.evaluateRankerDatasetRows(rows, {
    includeStateDetails: true
  });

  assert(summary.source === 'hard-mortal-ranker-baseline', `unexpected summary source ${summary.source}`);
  assert(summary.totalCandidateRows === rows.length, `expected candidate total ${rows.length}, got ${summary.totalCandidateRows}`);
  assert(summary.states === 3, `expected 3 states, got ${summary.states}`);
  ['current-hard', 'hard-ev', 'hard-ev-shape', 'danger-first'].forEach((name) => assertStrategy(summary, name));
  assert(summary.strategies['current-hard'].exact >= 1, `expected current-hard exact baseline, got ${JSON.stringify(summary.strategies['current-hard'])}`);
  assert(summary.strategies['current-hard'].large >= 1, `expected current-hard large baseline, got ${JSON.stringify(summary.strategies['current-hard'])}`);
  assert(summary.strategies['hard-ev'].exact >= 1, `expected hard-ev exact baseline, got ${JSON.stringify(summary.strategies['hard-ev'])}`);
  assert(Array.isArray(summary.stateDetails) && summary.stateDetails.length === 3, `expected state details, got ${JSON.stringify(summary.stateDetails)}`);
  summary.stateDetails.forEach((detail) => {
    assert(detail.picks && detail.picks['current-hard'], `expected current-hard pick for ${detail.stateId}`);
    assert(detail.picks['current-hard'].tileCode, `expected picked tile for ${detail.stateId}`);
    assert(typeof detail.picks['current-hard'].severity === 'string', `expected pick severity for ${detail.stateId}`);
  });

  console.log('[PASS] hard-mortal-ranker-baseline-smoke');
  console.log(`  snapshot=${JSON.stringify({
    states: summary.states,
    currentHard: summary.strategies['current-hard'],
    hardEv: summary.strategies['hard-ev']
  })}`);
}

if (require.main === module) {
  main();
}
