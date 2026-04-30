'use strict';

const path = require('path');
const {
  ROOT,
  buildEasyBenchmarkCases,
  evaluateCase
} = require('./lib/ai-benchmark-helpers');
const { buildBenchmarkAnalysisReport } = require('../engine/coach/review/benchmark-analysis');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function main() {
  const smokeConfigPath = path.join(ROOT, '..', 'third_party', 'Mortal', 'mortal', 'config.smoke.toml');
  const rows = buildEasyBenchmarkCases(ROOT).map((caseDef) => evaluateCase(caseDef, {
    configPath: smokeConfigPath
  }));
  const report = buildBenchmarkAnalysisReport(rows, {
    source: 'validate-ai-benchmark-report',
    scope: 'single-decision'
  });

  assert(report && Array.isArray(report.subjects) && report.subjects.length === 1, `expected exactly one subject summary, got ${JSON.stringify(report)}`);
  assert(report && report.overview && report.overview.total === rows.length, `expected overview total ${rows.length}, got ${JSON.stringify(report && report.overview)}`);
  assert(Array.isArray(report.rounds) && report.rounds.length === 1, `expected exactly one round summary, got ${JSON.stringify(report && report.rounds)}`);
  const subject = report.subjects[0];
  const round = report.rounds[0];
  assert(subject.summary.total === rows.length, `expected subject total ${rows.length}, got ${JSON.stringify(subject.summary)}`);
  assert(round.summary.total === rows.length, `expected round total ${rows.length}, got ${JSON.stringify(round.summary)}`);
  assert(typeof subject.summary.mortalRate === 'number', `expected numeric mortalRate, got ${JSON.stringify(subject.summary)}`);
  assert(subject.summary.goodCount + subject.summary.neutralCount + subject.summary.badCount === rows.length, 'expected verdict counts to cover all rows');
  assert(Array.isArray(subject.goodHands) && Array.isArray(subject.badHands), 'expected good/bad hand buckets');

  console.log('[PASS] ai-benchmark-report-smoke');
  console.log(`  snapshot=${JSON.stringify({
    overview: report.overview,
    roundSummary: round.summary,
    summary: subject.summary,
    goodIds: subject.goodHands.map((row) => row.id),
    badIds: subject.badHands.map((row) => row.id),
    neutralIds: subject.neutralHands.map((row) => row.id)
  })}`);
}

main();
