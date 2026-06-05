'use strict';

const assert = require('assert');

const { runLuckRegressionMatrix } = require('./validate-luck-regression-matrix');

function getEnvInteger(name, fallback) {
  const requested = Number(process.env[name] || fallback);
  return Math.max(1, Math.floor(Number.isFinite(requested) ? requested : fallback));
}

function main() {
  const seedCount = getEnvInteger('LUCK_REGRESSION_SEEDS', 40);
  const drawCount = getEnvInteger('LUCK_REGRESSION_DRAWS', 3);
  const report = runLuckRegressionMatrix({
    source: 'validate-luck-regression-report',
    seedCount,
    drawCount,
    silent: true
  });
  const summary = report.summary || {};

  assert(summary.invalidDrawCount === 0, `expected no invalid draws, got ${JSON.stringify(summary)}`);
  assert(summary.nonFiniteWeightCount === 0, `expected no non-finite weights, got ${JSON.stringify(summary)}`);
  assert(summary.auditMismatchCount === 0, `expected audit selected tile and roll to match payload, got ${JSON.stringify(summary)}`);
  assert(summary.replayMismatchCount === 0, `expected deterministic replay, got ${JSON.stringify(summary)}`);
  assert(summary.auditCoverageRate === 1, `expected full audit coverage, got ${JSON.stringify(summary)}`);
  assert(summary.fortuneUpliftRatio > 1, `expected fortune uplift ratio > 1, got ${JSON.stringify(summary)}`);
  assert(summary.cursePenaltyRatio > 1, `expected curse penalty ratio > 1, got ${JSON.stringify(summary)}`);
  assert(summary.curseLowRate > summary.curseHighRate, `expected curse low group selected more often than high group, got ${JSON.stringify(summary)}`);
  assert(
    summary.voidDampingRatio > 0 && summary.voidDampingRatio < 1,
    `expected void damping ratio to stay between 0 and 1, got ${JSON.stringify(summary)}`
  );

  console.log('[PASS] luck-regression-report');
  console.log(`  snapshot=${JSON.stringify({
    summary,
    scenarios: {
      fortune: report.scenarios.fortune,
      curse: report.scenarios.curse,
      void: report.scenarios.void
    },
    selectionHistogram: report.selectionHistogram
  })}`);
}

main();
