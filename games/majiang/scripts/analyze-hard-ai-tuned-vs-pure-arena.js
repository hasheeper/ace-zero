'use strict';

const fs = require('fs');
const path = require('path');

const arenaApi = require('./benchmark-ai-hanchan-arena');

const DEFAULT_REPORT_PATH = '/tmp/ace-zero-arena/h14-hard-pure-vs-3-hard-tuned-1000.json';
const DEFAULT_OUT_PATH = '/tmp/h14-p6-tuned-vs-pure-arena-analysis.json';
const DEFAULT_MIN_PURE_RECORDS = 800;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(path.resolve(filePath), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function numberOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function round(value, digits = 4) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
}

function resolveSummary(report = {}) {
  if (report.mixed && report.mixed.summary) return report.mixed.summary;
  if (report.summary && report.summary.variantStats) return report.summary;
  throw new Error('Arena report must contain mixed.summary.variantStats.');
}

function panelForVariant(summary, variantId) {
  const stats = summary && summary.variantStats ? summary.variantStats[variantId] : null;
  if (!stats) return null;
  if (stats.recordPanel) return stats.recordPanel;
  return arenaApi.buildVariantRecordPanel(stats);
}

function metricDelta(tuned, pure, key) {
  const tunedValue = numberOrNull(tuned && tuned[key]);
  const pureValue = numberOrNull(pure && pure[key]);
  if (tunedValue == null || pureValue == null) return null;
  return round(tunedValue - pureValue, 6);
}

function buildDeltas(tuned, pure) {
  return {
    averageRank: metricDelta(tuned, pure, 'averageRank'),
    averageScore: metricDelta(tuned, pure, 'averageScore'),
    firstRate: metricDelta(tuned, pure, 'firstRate'),
    fourthRate: metricDelta(tuned, pure, 'fourthRate'),
    huleRate: metricDelta(tuned, pure, 'huleRate'),
    dealInRate: metricDelta(tuned, pure, 'dealInRate'),
    drawTenpaiRate: metricDelta(tuned, pure, 'drawTenpaiRate'),
    tsumoRatePerRound: metricDelta(tuned, pure, 'tsumoRatePerRound'),
    riichiRate: metricDelta(tuned, pure, 'riichiRate'),
    callRate: metricDelta(tuned, pure, 'callRate'),
    averageWinPoints: metricDelta(tuned, pure, 'averageWinPoints'),
    averageDealInPoints: metricDelta(tuned, pure, 'averageDealInPoints')
  };
}

function classifyArena(deltas = {}) {
  const avgRankDelta = numberOr(deltas.averageRank, 0);
  const scoreDelta = numberOr(deltas.averageScore, 0);
  const huleDelta = numberOr(deltas.huleRate, 0);
  const dealInDelta = numberOr(deltas.dealInRate, 0);
  const drawTenpaiDelta = numberOr(deltas.drawTenpaiRate, 0);
  const fourthDelta = numberOr(deltas.fourthRate, 0);

  const avgRankBetter = avgRankDelta <= -0.025;
  const avgRankWorse = avgRankDelta >= 0.015;
  const scoreWorse = scoreDelta <= -500;
  const huleLoss = huleDelta <= -0.01;
  const drawTenpaiLoss = drawTenpaiDelta <= -0.04;
  const dealInGain = dealInDelta <= -0.005;
  const fourthWorse = fourthDelta >= 0.015;

  if (avgRankBetter && !fourthWorse && (!huleLoss || dealInGain)) {
    return {
      conclusion: 'tuned-better',
      reasons: ['avg-rank-better', fourthWorse ? 'fourth-rate-worse' : 'fourth-rate-ok']
    };
  }
  if ((avgRankWorse || scoreWorse) && huleLoss && drawTenpaiLoss) {
    return {
      conclusion: 'tuned-speed-loss-suspect',
      reasons: ['avg-rank-or-score-worse', 'hule-loss', 'draw-tenpai-loss']
    };
  }
  if (dealInGain && avgRankDelta > -0.01 && (huleLoss || drawTenpaiLoss)) {
    return {
      conclusion: 'tuned-defense-gain-not-monetized',
      reasons: ['deal-in-lower', 'rank-not-better', huleLoss ? 'hule-loss' : 'draw-tenpai-loss']
    };
  }
  return {
    conclusion: 'inconclusive',
    reasons: ['thresholds-not-crossed']
  };
}

function branchForConclusion(conclusion, formalReady) {
  if (!formalReady) return 'continue-arena-to-formal-sample';
  if (conclusion === 'tuned-better') return 'P7B-route-fixture';
  if (conclusion === 'tuned-speed-loss-suspect' || conclusion === 'tuned-defense-gain-not-monetized') return 'P7A-tuning-ablation';
  return 'extend-or-rerun-arena-before-policy-change';
}

function compactPanel(panel = {}) {
  return {
    records: numberOrNull(panel.records),
    averageRank: numberOrNull(panel.averageRank),
    averageScore: numberOrNull(panel.averageScore),
    averageFinalScoreDelta: numberOrNull(panel.averageFinalScoreDelta),
    firstRate: numberOrNull(panel.firstRate),
    secondRate: numberOrNull(panel.secondRate),
    thirdRate: numberOrNull(panel.thirdRate),
    fourthRate: numberOrNull(panel.fourthRate),
    flownRate: numberOrNull(panel.flownRate),
    huleRate: numberOrNull(panel.huleRate),
    dealInRate: numberOrNull(panel.dealInRate),
    drawTenpaiRate: numberOrNull(panel.drawTenpaiRate),
    tsumoRatePerRound: numberOrNull(panel.tsumoRatePerRound),
    tsumoRate: numberOrNull(panel.tsumoRate),
    riichiRate: numberOrNull(panel.riichiRate),
    riichiPerDiscard: numberOrNull(panel.riichiPerDiscard),
    callRate: numberOrNull(panel.callRate),
    callRatePerDiscard: numberOrNull(panel.callRatePerDiscard),
    averageWinTurn: numberOrNull(panel.averageWinTurn),
    averageWinPoints: numberOrNull(panel.averageWinPoints),
    averageDealInPoints: numberOrNull(panel.averageDealInPoints),
    rawCounts: panel.rawCounts || null,
    uncertainty: panel.uncertainty || null
  };
}

function analyzeTunedVsPureArena(report = {}, options = {}) {
  const minPureRecords = numberOr(options.minPureRecords, DEFAULT_MIN_PURE_RECORDS);
  const summary = resolveSummary(report);
  const purePanel = compactPanel(panelForVariant(summary, 'hard-pure'));
  const tunedPanel = compactPanel(panelForVariant(summary, 'hard-tuned'));
  if (!purePanel.records || !tunedPanel.records) {
    throw new Error('Arena report must contain hard-pure and hard-tuned variant panels.');
  }
  const deltas = buildDeltas(tunedPanel, purePanel);
  const classification = classifyArena(deltas);
  const formalReady = numberOr(purePanel.records, 0) >= minPureRecords;
  return {
    source: 'hard-ai-tuned-vs-pure-arena-analysis',
    generatedAt: new Date().toISOString(),
    outputPath: options.out || DEFAULT_OUT_PATH,
    reportPath: options.reportPath || null,
    sampleStatus: formalReady ? 'formal-ready' : 'scout',
    formalReady,
    minPureRecords,
    note: formalReady
      ? 'Formal sample threshold reached for hard-pure records.'
      : 'Scout only. Do not make a formal hard-tuned rollback or promotion decision from this sample.',
    totals: summary.totals || null,
    variants: {
      'hard-pure': purePanel,
      'hard-tuned': tunedPanel
    },
    deltas,
    conclusion: classification.conclusion,
    reasons: classification.reasons,
    nextBranch: branchForConclusion(classification.conclusion, formalReady),
    decisionRule: 'Use arena as the strength judge. Mortal and route review may nominate issues, but policy changes require arena non-regression.'
  };
}

function parseArgs(argv = []) {
  const args = {
    help: false,
    report: DEFAULT_REPORT_PATH,
    out: DEFAULT_OUT_PATH,
    minPureRecords: DEFAULT_MIN_PURE_RECORDS,
    stdout: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }
    if (token === '--report') {
      args.report = String(argv[index + 1] || '').trim() || args.report;
      index += 1;
      continue;
    }
    if (token === '--out') {
      args.out = String(argv[index + 1] || '').trim() || args.out;
      index += 1;
      continue;
    }
    if (token === '--min-pure-records') {
      args.minPureRecords = numberOr(argv[index + 1], args.minPureRecords);
      index += 1;
      continue;
    }
    if (token === '--stdout') args.stdout = true;
  }
  return args;
}

function printHelp() {
  console.log('Usage: node games/majiang/scripts/analyze-hard-ai-tuned-vs-pure-arena.js [options]');
  console.log('');
  console.log('Options:');
  console.log('  --report <path>             Arena JSON report. Default: /tmp/ace-zero-arena/h14-hard-pure-vs-3-hard-tuned-1000.json.');
  console.log('  --out <path>                Analysis JSON output path.');
  console.log('  --min-pure-records <n>      Formal threshold. Default: 800.');
  console.log('  --stdout                    Also print full JSON.');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  const report = readJson(args.report);
  const analysis = analyzeTunedVsPureArena(report, {
    reportPath: path.resolve(args.report),
    out: args.out,
    minPureRecords: args.minPureRecords
  });
  writeJson(args.out, analysis);
  if (args.stdout) {
    console.log(JSON.stringify(analysis, null, 2));
  } else {
    console.log(JSON.stringify({
      out: path.resolve(args.out),
      sampleStatus: analysis.sampleStatus,
      conclusion: analysis.conclusion,
      nextBranch: analysis.nextBranch,
      deltas: analysis.deltas
    }, null, 2));
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  DEFAULT_REPORT_PATH,
  DEFAULT_OUT_PATH,
  DEFAULT_MIN_PURE_RECORDS,
  compactPanel,
  classifyArena,
  analyzeTunedVsPureArena,
  parseArgs
};
