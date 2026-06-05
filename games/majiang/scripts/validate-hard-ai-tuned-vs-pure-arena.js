'use strict';

const arenaAnalysisApi = require('./analyze-hard-ai-tuned-vs-pure-arena');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function makePanel(overrides = {}) {
  return {
    records: overrides.records ?? 1000,
    averageRank: overrides.averageRank ?? 2.5,
    averageScore: overrides.averageScore ?? 25000,
    averageFinalScoreDelta: overrides.averageFinalScoreDelta ?? 0,
    firstRate: overrides.firstRate ?? 0.25,
    secondRate: overrides.secondRate ?? 0.25,
    thirdRate: overrides.thirdRate ?? 0.25,
    fourthRate: overrides.fourthRate ?? 0.25,
    flownRate: overrides.flownRate ?? 0.01,
    huleRate: overrides.huleRate ?? 0.22,
    dealInRate: overrides.dealInRate ?? 0.15,
    drawTenpaiRate: overrides.drawTenpaiRate ?? 0.86,
    tsumoRatePerRound: overrides.tsumoRatePerRound ?? 0.07,
    tsumoRate: overrides.tsumoRate ?? 0.32,
    riichiRate: overrides.riichiRate ?? 0.08,
    riichiPerDiscard: overrides.riichiPerDiscard ?? 0.007,
    callRate: overrides.callRate ?? 0.76,
    callRatePerDiscard: overrides.callRatePerDiscard ?? 0.3,
    averageWinTurn: overrides.averageWinTurn ?? 11.6,
    averageWinPoints: overrides.averageWinPoints ?? 3400,
    averageDealInPoints: overrides.averageDealInPoints ?? 2900,
    rawCounts: {
      roundsSeen: overrides.roundsSeen ?? 12000,
      huleWins: 2500,
      dealIns: 1700,
      drawRounds: 1500,
      drawTenpai: 1200
    }
  };
}

function makeReport(purePanel, tunedPanel) {
  return {
    source: 'fixture-arena',
    mixed: {
      summary: {
        totals: {
          matches: 1000,
          completedMatches: 1000,
          rounds: 12000,
          drawRounds: 1500,
          errorCount: 0
        },
        variantStats: {
          'hard-pure': {
            recordPanel: purePanel
          },
          'hard-tuned': {
            recordPanel: tunedPanel
          }
        }
      }
    }
  };
}

function validateCase(name, purePanel, tunedPanel, expectedConclusion, expectedBranch, expectedFormalReady) {
  const analysis = arenaAnalysisApi.analyzeTunedVsPureArena(makeReport(purePanel, tunedPanel), {
    out: `/tmp/h14-p6-validator-${name}.json`,
    reportPath: 'fixture',
    minPureRecords: 800
  });
  assert(analysis.conclusion === expectedConclusion, `${name}: expected ${expectedConclusion}, got ${analysis.conclusion} ${JSON.stringify(analysis.deltas)}`);
  assert(analysis.nextBranch === expectedBranch, `${name}: expected branch ${expectedBranch}, got ${analysis.nextBranch}`);
  assert(analysis.formalReady === expectedFormalReady, `${name}: expected formalReady ${expectedFormalReady}, got ${analysis.formalReady}`);
  return analysis;
}

function validateArenaAnalysis() {
  const pure = makePanel({ records: 1000, averageRank: 2.5, averageScore: 25000 });
  const tunedBetter = validateCase(
    'tuned-better',
    pure,
    makePanel({ records: 3000, averageRank: 2.46, averageScore: 25800, fourthRate: 0.235, huleRate: 0.222, dealInRate: 0.146 }),
    'tuned-better',
    'P7B-route-fixture',
    true
  );
  const speedLoss = validateCase(
    'speed-loss',
    pure,
    makePanel({ records: 3000, averageRank: 2.53, averageScore: 24400, huleRate: 0.205, drawTenpaiRate: 0.79, dealInRate: 0.144 }),
    'tuned-speed-loss-suspect',
    'P7A-tuning-ablation',
    true
  );
  const defenseNotMonetized = validateCase(
    'defense-not-monetized',
    pure,
    makePanel({ records: 3000, averageRank: 2.495, averageScore: 24850, huleRate: 0.208, drawTenpaiRate: 0.84, dealInRate: 0.142 }),
    'tuned-defense-gain-not-monetized',
    'P7A-tuning-ablation',
    true
  );
  const inconclusive = validateCase(
    'inconclusive',
    pure,
    makePanel({ records: 3000, averageRank: 2.49, averageScore: 25200, huleRate: 0.219, drawTenpaiRate: 0.855, dealInRate: 0.149 }),
    'inconclusive',
    'extend-or-rerun-arena-before-policy-change',
    true
  );
  const scout = validateCase(
    'scout',
    makePanel({ records: 225, averageRank: 2.48, averageScore: 25371, huleRate: 0.23, drawTenpaiRate: 0.914, dealInRate: 0.156 }),
    makePanel({ records: 675, averageRank: 2.51, averageScore: 24881, huleRate: 0.215, drawTenpaiRate: 0.835, dealInRate: 0.149 }),
    'tuned-speed-loss-suspect',
    'continue-arena-to-formal-sample',
    false
  );
  assert(scout.sampleStatus === 'scout', `expected scout sample status, got ${scout.sampleStatus}`);
  assert(tunedBetter.deltas.averageRank < 0, 'expected tuned better rank delta');
  assert(speedLoss.deltas.drawTenpaiRate < -0.04, 'expected speed loss draw tenpai delta');
  assert(defenseNotMonetized.deltas.dealInRate < 0, 'expected defense gain');
  assert(inconclusive.reasons.includes('thresholds-not-crossed'), 'expected inconclusive reason');
  console.log('[PASS] hard-ai-tuned-vs-pure-arena-smoke');
  console.log(`  snapshot=${JSON.stringify({
    tunedBetter: tunedBetter.conclusion,
    speedLoss: speedLoss.conclusion,
    defenseNotMonetized: defenseNotMonetized.conclusion,
    inconclusive: inconclusive.conclusion,
    scout: {
      sampleStatus: scout.sampleStatus,
      conclusion: scout.conclusion,
      nextBranch: scout.nextBranch
    }
  })}`);
}

function main() {
  validateArenaAnalysis();
}

if (require.main === module) {
  main();
}

module.exports = {
  validateArenaAnalysis
};
