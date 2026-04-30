'use strict';

const path = require('path');
const {
  ROOT,
  buildEasyBenchmarkCases,
  evaluateCase,
  summarizeBenchmarkResults
} = require('./lib/ai-benchmark-helpers');

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
  const summary = summarizeBenchmarkResults(rows);

  assert(rows.length >= 5, `expected at least 5 benchmark rows, got ${rows.length}`);
  assert(summary.total === rows.length, `expected summary total ${rows.length}, got ${summary.total}`);
  assert(rows.every((row) => row.localDecision && row.localDecision.type === 'discard'), 'expected all current benchmark rows to be discard decisions');
  assert(rows.every((row) => row.mortalOk === true), 'expected all benchmark rows to complete Mortal inference');
  assert(rows.every((row) => typeof row.suggestionStatus === 'string'), 'expected all benchmark rows to include suggestion status');
  assert(rows.every((row) => typeof row.comparison.mismatchKind === 'string'), 'expected all rows to include mismatch kind');

  console.log('[PASS] ai-benchmark-smoke');
  console.log(`  snapshot=${JSON.stringify({
    summary,
    caseIds: rows.map((row) => row.id),
    mismatchKinds: rows.map((row) => row.comparison.mismatchKind),
    suggestionStatuses: rows.map((row) => row.suggestionStatus)
  })}`);
}

main();
