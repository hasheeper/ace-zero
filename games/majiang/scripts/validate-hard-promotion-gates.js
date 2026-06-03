'use strict';

const path = require('path');

const baseAiApi = require('../engine/ai/base-ai');
const gameConfig = require('../game-config.json');
const sanmaConfig = require('../game-config.sanma.json');
const benchmarkApi = require('./benchmark-hard-headless');
const hardStatsApi = require('./validate-hard-headless-stats');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function hasGate(gates, groupName, gateId) {
  return Boolean(
    gates
    && Array.isArray(gates[groupName])
    && gates[groupName].some((entry) => entry && entry.id === gateId)
  );
}

function buildSummary(overrides = {}) {
  return {
    rounds: 2,
    completedRounds: 2,
    huleRate: 0.5,
    drawRate: 0.5,
    dealInRate: 0.5,
    riichiRate: 0.02,
    callRate: 0.08,
    rightAverageScore: 25000,
    dealInRateBySeat: {
      bottom: 0,
      right: 0.25,
      top: 0,
      left: 0.25
    },
    errorCount: 0,
    errors: [],
    ...overrides
  };
}

function runPromotionReportShapeSmoke(cwd) {
  const deterministicStats = hardStatsApi.buildStats(cwd);
  const args = benchmarkApi.parseArgs([
    '--promotion-report',
    '--seeds',
    '20260531',
    '--rounds',
    '1'
  ]);
  const report = benchmarkApi.buildBenchmarkReport(args, {
    deterministicStats
  });

  assert(report && report.source === 'benchmark-hard-headless', `expected benchmark source, got ${JSON.stringify(report)}`);
  assert(report.promotionReport === true, `expected promotion report, got ${JSON.stringify(report)}`);
  assert(Array.isArray(report.seeds) && report.seeds.length === 1, `expected one fixed smoke seed, got ${JSON.stringify(report.seeds)}`);
  assert(report.summaries && report.summaries.normal && report.summaries.hard, `expected normal/hard summaries, got ${JSON.stringify(report.summaries)}`);
  assert(report.softGates && report.softGates.runtimeErrors, `expected soft gates, got ${JSON.stringify(report.softGates)}`);
  assert(report.deterministicCorpus && report.deterministicCorpus.regressions === 0, `expected deterministic corpus summary, got ${JSON.stringify(report.deterministicCorpus)}`);
  assert(report.promotionGates && (report.promotionGates.status === 'ready' || report.promotionGates.status === 'not-ready'), `expected promotion gates status, got ${JSON.stringify(report.promotionGates)}`);

  return {
    name: 'hard-promotion-report-shape-smoke',
    snapshot: {
      seeds: report.seeds,
      roundsPerDifficulty: report.roundsPerDifficulty,
      status: report.promotionGates.status,
      failed: report.promotionGates.failed.map((entry) => entry.id)
    }
  };
}

function runPromotionFormalBoundarySmoke() {
  assert(
    Array.isArray(baseAiApi.IMPLEMENTED_DIFFICULTIES)
      && baseAiApi.IMPLEMENTED_DIFFICULTIES.includes('hard'),
    `expected BaseAI hard to be formally implemented, got ${JSON.stringify(baseAiApi.IMPLEMENTED_DIFFICULTIES)}`
  );
  assert(
    gameConfig
      && gameConfig.ai
      && Array.isArray(gameConfig.ai.implementedDifficulties)
      && gameConfig.ai.implementedDifficulties.includes('hard'),
    `expected four-player game-config hard to be exposed, got ${JSON.stringify(gameConfig && gameConfig.ai)}`
  );
  assert(
    gameConfig.ai.defaultDifficulty === 'easy',
    `expected four-player default difficulty to stay easy, got ${JSON.stringify(gameConfig && gameConfig.ai)}`
  );
  assert(
    sanmaConfig
      && sanmaConfig.ai
      && Array.isArray(sanmaConfig.ai.implementedDifficulties)
      && !sanmaConfig.ai.implementedDifficulties.includes('hard'),
    `expected sanma config hard to remain unopened, got ${JSON.stringify(sanmaConfig && sanmaConfig.ai)}`
  );

  return {
    name: 'hard-promotion-formal-boundary-smoke',
    snapshot: {
      baseAiImplementedDifficulties: baseAiApi.IMPLEMENTED_DIFFICULTIES,
      configImplementedDifficulties: gameConfig.ai.implementedDifficulties,
      defaultDifficulty: gameConfig.ai.defaultDifficulty,
      sanmaImplementedDifficulties: sanmaConfig.ai.implementedDifficulties
    }
  };
}

function runPromotionGateStatusSmoke() {
  const summaries = {
    normal: buildSummary({
      rightAverageScore: 26000,
      huleRate: 0.55,
      dealInRateBySeat: {
        bottom: 0,
        right: 0.2,
        top: 0.1,
        left: 0.2
      }
    }),
    hard: buildSummary({
      rightAverageScore: 25000,
      huleRate: 0.52,
      dealInRateBySeat: {
        bottom: 0,
        right: 0.3,
        top: 0.1,
        left: 0.2
      }
    })
  };
  const gates = benchmarkApi.buildPromotionGates(summaries, {
    deterministicStats: {
      regressions: 0
    },
    roundsPerDifficulty: 2
  });

  assert(gates.status === 'not-ready', `expected not-ready gate, got ${JSON.stringify(gates)}`);
  assert(hasGate(gates, 'failed', 'right-average-score-not-lower'), `expected score gate failure, got ${JSON.stringify(gates)}`);
  assert(hasGate(gates, 'failed', 'right-deal-in-not-higher'), `expected deal-in gate failure, got ${JSON.stringify(gates)}`);
  assert(hasGate(gates, 'passed', 'deterministic-regressions'), `expected deterministic regression gate pass, got ${JSON.stringify(gates)}`);

  return {
    name: 'hard-promotion-gate-status-smoke',
    snapshot: {
      status: gates.status,
      failed: gates.failed.map((entry) => entry.id),
      passed: gates.passed.map((entry) => entry.id)
    }
  };
}

function runPromotionGateReadyFixtureSmoke() {
  const summaries = {
    normal: buildSummary({
      rightAverageScore: 25000,
      huleRate: 0.5,
      dealInRateBySeat: {
        bottom: 0,
        right: 0.25,
        top: 0.1,
        left: 0.1
      }
    }),
    hard: buildSummary({
      rightAverageScore: 25200,
      huleRate: 0.48,
      dealInRateBySeat: {
        bottom: 0,
        right: 0.2,
        top: 0.1,
        left: 0.1
      }
    })
  };
  const gates = benchmarkApi.buildPromotionGates(summaries, {
    deterministicStats: {
      regressions: 0
    },
    roundsPerDifficulty: 2
  });

  assert(gates.status === 'ready', `expected ready gate, got ${JSON.stringify(gates)}`);
  assert(gates.failed.length === 0, `expected no gate failures, got ${JSON.stringify(gates)}`);
  assert(hasGate(gates, 'passed', 'hard-hule-rate-floor'), `expected hule-rate floor pass, got ${JSON.stringify(gates)}`);
  assert(hasGate(gates, 'passed', 'right-average-score-not-lower'), `expected score gate pass, got ${JSON.stringify(gates)}`);

  return {
    name: 'hard-promotion-gate-ready-fixture-smoke',
    snapshot: {
      status: gates.status,
      failed: gates.failed.map((entry) => entry.id),
      passed: gates.passed.map((entry) => entry.id)
    }
  };
}

function main() {
  const cwd = path.resolve(__dirname, '..');
  const results = [
    runPromotionReportShapeSmoke(cwd),
    runPromotionFormalBoundarySmoke(),
    runPromotionGateStatusSmoke(),
    runPromotionGateReadyFixtureSmoke()
  ];

  results.forEach((result) => {
    console.log(`[PASS] ${result.name}`);
    console.log(`  snapshot=${JSON.stringify(result.snapshot)}`);
  });
}

main();
