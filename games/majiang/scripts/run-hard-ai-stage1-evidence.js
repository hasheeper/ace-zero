'use strict';

const fs = require('fs');
const path = require('path');

const mortalBenchmarkApi = require('./benchmark-hard-vs-mortal');
const arenaApi = require('./benchmark-ai-hanchan-arena');

const DEFAULT_MORTAL_SAMPLES_PER_SEAT = 250;
const DEFAULT_ARENA_MATCHES = 1000;
const DEFAULT_CHECKPOINT_INTERVAL = 25;
const DEFAULT_SEED = 20260603;
const DEFAULT_TUNED_MORTAL_OUT = '/tmp/h14-p0-hard-tuned-vs-mortal-s1000.json';
const DEFAULT_PURE_MORTAL_OUT = '/tmp/h14-p0-hard-pure-vs-mortal-s1000.json';
const DEFAULT_ARENA_OUT = '/tmp/h14-p0-arena-mixed-1000.json';
const DEFAULT_SUMMARY_OUT = '/tmp/h14-p0-stage1-summary.json';

function parsePositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function parseArgs(argv = []) {
  const args = {
    help: false,
    smoke: false,
    progress: false,
    skipMortal: false,
    skipArena: false,
    mortalSamplesPerSeat: DEFAULT_MORTAL_SAMPLES_PER_SEAT,
    arenaMatches: DEFAULT_ARENA_MATCHES,
    seed: DEFAULT_SEED,
    mortalConfig: 'real',
    checkpointInterval: DEFAULT_CHECKPOINT_INTERVAL,
    tunedMortalOut: DEFAULT_TUNED_MORTAL_OUT,
    pureMortalOut: DEFAULT_PURE_MORTAL_OUT,
    arenaOut: DEFAULT_ARENA_OUT,
    out: DEFAULT_SUMMARY_OUT
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }
    if (token === '--smoke') {
      args.smoke = true;
      args.mortalSamplesPerSeat = 1;
      args.arenaMatches = 1;
      args.mortalConfig = 'smoke';
      continue;
    }
    if (token === '--progress') {
      args.progress = true;
      continue;
    }
    if (token === '--skip-mortal') {
      args.skipMortal = true;
      continue;
    }
    if (token === '--skip-arena') {
      args.skipArena = true;
      continue;
    }
    if (token === '--mortal-samples-per-seat') {
      args.mortalSamplesPerSeat = parsePositiveInteger(argv[index + 1], args.mortalSamplesPerSeat);
      index += 1;
      continue;
    }
    if (token === '--arena-matches') {
      args.arenaMatches = parsePositiveInteger(argv[index + 1], args.arenaMatches);
      index += 1;
      continue;
    }
    if (token === '--seed') {
      args.seed = parsePositiveInteger(argv[index + 1], args.seed);
      index += 1;
      continue;
    }
    if (token === '--mortal-config') {
      args.mortalConfig = String(argv[index + 1] || '').trim() || args.mortalConfig;
      index += 1;
      continue;
    }
    if (token === '--checkpoint-interval') {
      const parsed = Number(argv[index + 1]);
      args.checkpointInterval = Number.isFinite(parsed) && parsed >= 0
        ? Math.floor(parsed)
        : args.checkpointInterval;
      index += 1;
      continue;
    }
    if (token === '--tuned-mortal-out') {
      args.tunedMortalOut = String(argv[index + 1] || '').trim() || args.tunedMortalOut;
      index += 1;
      continue;
    }
    if (token === '--pure-mortal-out') {
      args.pureMortalOut = String(argv[index + 1] || '').trim() || args.pureMortalOut;
      index += 1;
      continue;
    }
    if (token === '--arena-out') {
      args.arenaOut = String(argv[index + 1] || '').trim() || args.arenaOut;
      index += 1;
      continue;
    }
    if (token === '--out') {
      args.out = String(argv[index + 1] || '').trim() || args.out;
      index += 1;
      continue;
    }
  }

  return args;
}

function printHelp() {
  console.log('Usage: node games/majiang/scripts/run-hard-ai-stage1-evidence.js [options]');
  console.log('');
  console.log('Options:');
  console.log('  --smoke                         Use Mortal smoke config and tiny arena sample.');
  console.log('  --mortal-samples-per-seat <n>   Default: 250.');
  console.log('  --arena-matches <n>             Default: 1000.');
  console.log('  --mortal-config real|smoke|path Default: real.');
  console.log('  --skip-mortal                   Reuse existing Mortal report paths.');
  console.log('  --skip-arena                    Reuse existing arena report path.');
  console.log('  --progress                      Print progress updates.');
  console.log('  --out <path>                    Stage summary output path.');
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function writeJson(filePath, value) {
  fs.writeFileSync(path.resolve(filePath), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
}

function progress(args, message) {
  if (args && args.progress) console.error(`[h14-p0] ${message}`);
}

function emptyCounts() {
  return {
    exact: 0,
    near: 0,
    medium: 0,
    large: 0,
    stale: 0,
    unknown: 0
  };
}

function incrementCount(counts, key, amount = 1) {
  counts[key] = Number(counts[key] || 0) + amount;
  return counts;
}

function getRowBucket(row) {
  return row && row.judgment && typeof row.judgment.bucket === 'string'
    ? row.judgment.bucket
    : 'unknown';
}

function getSeverityLevel(row) {
  return row && row.mortalSeverity && typeof row.mortalSeverity.level === 'string'
    ? row.mortalSeverity.level
    : 'unknown';
}

function normalizeTileCode(tileCode) {
  if (typeof tileCode !== 'string' || !tileCode) return null;
  const normalized = String(tileCode).replace(/[\*_\+\=\-]+$/g, '');
  const redMatch = normalized.match(/^([mps])0$/);
  if (redMatch) return `${redMatch[1]}5`;
  return normalized;
}

function tileRank(tileCode) {
  const normalized = normalizeTileCode(tileCode);
  const match = normalized && normalized.match(/^[mps](\d)$/);
  return match ? Number(match[1]) : null;
}

function findCandidateDiagnostic(row, tileCode) {
  const normalizedTileCode = normalizeTileCode(tileCode);
  if (!normalizedTileCode || !row || !Array.isArray(row.hardCandidateDiagnostics)) return null;
  return row.hardCandidateDiagnostics.find((candidate) => (
    candidate && normalizeTileCode(candidate.tileCode) === normalizedTileCode
  )) || null;
}

function isRouteDoraOrFiveRow(row, localCandidate, mortalCandidate) {
  const candidates = [localCandidate, mortalCandidate].filter(Boolean);
  if ([row && row.localDecision && row.localDecision.tileCode, row && row.bestMortalCandidate && row.bestMortalCandidate.tileCode]
    .some((tileCode) => tileRank(tileCode) === 5)) {
    return true;
  }
  return candidates.some((candidate) => {
    const shape = candidate && candidate.shape ? candidate.shape : {};
    return Number(shape.fiveOrRedFiveCutPenalty || 0) > 0
      || Number(shape.doraRetentionPenalty || 0) > 0
      || String(shape.discardTileRole || '').includes('yakuhai')
      || (Array.isArray(shape.reasons) && shape.reasons.some((reason) => /dora|five|yakuhai|honor/i.test(String(reason))));
  });
}

function classifyCandidatePoolRow(row) {
  const bucket = getRowBucket(row);
  if (bucket === 'tile-defense') return 'defense';
  if (bucket === 'riichi-missed' || bucket === 'riichi-overpush') return 'riichi';
  if (bucket === 'action-type') return 'action-type';
  if (bucket !== 'tile-choice') return bucket || 'unknown';

  const localCandidate = findCandidateDiagnostic(row, row && row.localDecision && row.localDecision.tileCode);
  const mortalCandidate = row && row.bestMortalCandidate && row.bestMortalCandidate.actionType === 'discard'
    ? findCandidateDiagnostic(row, row.bestMortalCandidate.tileCode)
    : null;
  const localXiangting = localCandidate && localCandidate.metrics ? Number(localCandidate.metrics.xiangting) : null;
  const mortalXiangting = mortalCandidate && mortalCandidate.metrics ? Number(mortalCandidate.metrics.xiangting) : null;
  if (Number.isFinite(localXiangting) && Number.isFinite(mortalXiangting) && mortalXiangting > localXiangting) {
    return 'backstep';
  }
  if (isRouteDoraOrFiveRow(row, localCandidate, mortalCandidate)) return 'route-dora-five';
  return 'same-xiangting tile-choice';
}

function compactPoolRow(row) {
  const localCandidate = findCandidateDiagnostic(row, row && row.localDecision && row.localDecision.tileCode);
  const mortalCandidate = row && row.bestMortalCandidate && row.bestMortalCandidate.actionType === 'discard'
    ? findCandidateDiagnostic(row, row.bestMortalCandidate.tileCode)
    : null;
  return {
    id: row.id,
    seed: row.seed,
    targetSeat: row.targetSeat,
    bucket: getRowBucket(row),
    category: classifyCandidatePoolRow(row),
    severity: getSeverityLevel(row),
    qDelta: row.mortalSeverity && Number.isFinite(Number(row.mortalSeverity.qDelta))
      ? Number(row.mortalSeverity.qDelta)
      : null,
    local: {
      type: row.localDecision && row.localDecision.type,
      tileCode: row.localDecision && row.localDecision.tileCode,
      riichi: Boolean(row.localDecision && row.localDecision.riichi),
      xiangting: localCandidate && localCandidate.metrics ? localCandidate.metrics.xiangting : null,
      hardEvScore: localCandidate && localCandidate.hardMetrics ? localCandidate.hardMetrics.hardEvScore : null,
      shapeScore: localCandidate && localCandidate.shape ? localCandidate.shape.discardShapeScore : null,
      dangerScore: localCandidate && localCandidate.danger ? localCandidate.danger.dangerScore : null
    },
    mortalBest: {
      actionType: row.bestMortalCandidate && row.bestMortalCandidate.actionType,
      tileCode: row.bestMortalCandidate && row.bestMortalCandidate.tileCode,
      qValue: row.bestMortalCandidate && row.bestMortalCandidate.qValue,
      xiangting: mortalCandidate && mortalCandidate.metrics ? mortalCandidate.metrics.xiangting : null,
      hardEvScore: mortalCandidate && mortalCandidate.hardMetrics ? mortalCandidate.hardMetrics.hardEvScore : null,
      shapeScore: mortalCandidate && mortalCandidate.shape ? mortalCandidate.shape.discardShapeScore : null,
      dangerScore: mortalCandidate && mortalCandidate.danger ? mortalCandidate.danger.dangerScore : null
    },
    reviewStatus: 'needs-human-review',
    decisionContextAvailable: Boolean(row.decisionContext)
  };
}

function buildCandidatePool(report, limit = 80) {
  const rows = Array.isArray(report && report.rows) ? report.rows : [];
  const poolRows = rows
    .filter((row) => {
      const severity = getSeverityLevel(row);
      return severity === 'large' && severity !== 'stale' && severity !== 'unknown';
    })
    .map(compactPoolRow)
    .sort((left, right) => Number(right.qDelta || 0) - Number(left.qDelta || 0));
  const categoryCounts = poolRows.reduce((counts, row) => incrementCount(counts, row.category), {});
  return {
    total: poolRows.length,
    categoryCounts,
    rows: poolRows.slice(0, limit)
  };
}

function summarizeMortalReport(report) {
  const rows = Array.isArray(report && report.rows) ? report.rows : [];
  const severityCounts = rows.reduce((counts, row) => incrementCount(counts, getSeverityLevel(row)), emptyCounts());
  const bucketCounts = rows.reduce((counts, row) => incrementCount(counts, getRowBucket(row)), {});
  const largeBucketCounts = rows
    .filter((row) => getSeverityLevel(row) === 'large')
    .reduce((counts, row) => incrementCount(counts, getRowBucket(row)), {});
  const total = rows.length;
  return {
    targetVariant: report && report.targetVariant,
    targetDifficulty: report && report.targetDifficulty,
    rows: total,
    exact: severityCounts.exact,
    near: severityCounts.near,
    medium: severityCounts.medium,
    large: severityCounts.large,
    stale: severityCounts.stale,
    unknown: severityCounts.unknown,
    exactRate: total > 0 ? severityCounts.exact / total : 0,
    nearOrExactRate: total > 0 ? (severityCounts.exact + severityCounts.near) / total : 0,
    bucketCounts,
    largeBucketCounts,
    severityCounts,
    candidatePool: buildCandidatePool(report)
  };
}

function compareMortalSummaries(pureSummary, tunedSummary) {
  const buckets = Array.from(new Set([
    ...Object.keys(pureSummary && pureSummary.largeBucketCounts || {}),
    ...Object.keys(tunedSummary && tunedSummary.largeBucketCounts || {})
  ])).sort();
  const largeBucketDelta = buckets.reduce((result, bucket) => {
    result[bucket] = Number(tunedSummary.largeBucketCounts[bucket] || 0)
      - Number(pureSummary.largeBucketCounts[bucket] || 0);
    return result;
  }, {});
  return {
    exactRateDelta: Number(tunedSummary.exactRate || 0) - Number(pureSummary.exactRate || 0),
    nearOrExactRateDelta: Number(tunedSummary.nearOrExactRate || 0) - Number(pureSummary.nearOrExactRate || 0),
    largeDelta: Number(tunedSummary.large || 0) - Number(pureSummary.large || 0),
    largeBucketDelta,
    p1p4TileChoiceLargeDelta: Number(tunedSummary.largeBucketCounts['tile-choice'] || 0)
      - Number(pureSummary.largeBucketCounts['tile-choice'] || 0),
    p2DefenseLargeDelta: Number(tunedSummary.largeBucketCounts['tile-defense'] || 0)
      - Number(pureSummary.largeBucketCounts['tile-defense'] || 0),
    p3RiichiLargeDelta: (
      Number(tunedSummary.largeBucketCounts['riichi-missed'] || 0)
      + Number(tunedSummary.largeBucketCounts['riichi-overpush'] || 0)
    ) - (
      Number(pureSummary.largeBucketCounts['riichi-missed'] || 0)
      + Number(pureSummary.largeBucketCounts['riichi-overpush'] || 0)
    )
  };
}

function summarizeArenaReport(report) {
  const mixed = report && report.mixed && report.mixed.summary ? report.mixed.summary : null;
  if (!mixed) return null;
  const variants = arenaApi.resolveVariants(report.variantOrder || []);
  const variantPanels = variants.reduce((result, variant) => {
    const stats = mixed.variantStats && mixed.variantStats[variant.id] ? mixed.variantStats[variant.id] : null;
    if (stats) result[variant.id] = arenaApi.buildVariantRecordPanel(stats);
    return result;
  }, {});
  return {
    totals: clone(mixed.totals),
    variants: variantPanels,
    hardTunedVsPure: variantPanels['hard-tuned'] && variantPanels['hard-pure']
      ? {
          averageRankDelta: Number(variantPanels['hard-tuned'].averageRank || 0) - Number(variantPanels['hard-pure'].averageRank || 0),
          averageScoreDelta: Number(variantPanels['hard-tuned'].averageScore || 0) - Number(variantPanels['hard-pure'].averageScore || 0),
          firstRateDelta: Number(variantPanels['hard-tuned'].firstRate || 0) - Number(variantPanels['hard-pure'].firstRate || 0),
          fourthRateDelta: Number(variantPanels['hard-tuned'].fourthRate || 0) - Number(variantPanels['hard-pure'].fourthRate || 0),
          dealInRateDelta: Number(variantPanels['hard-tuned'].dealInRate || 0) - Number(variantPanels['hard-pure'].dealInRate || 0),
          huleRateDelta: Number(variantPanels['hard-tuned'].huleRate || 0) - Number(variantPanels['hard-pure'].huleRate || 0)
        }
      : null
  };
}

function buildMortalArgs(args, targetVariant) {
  return mortalBenchmarkApi.parseArgs([
    ...(args.smoke ? ['--smoke'] : []),
    '--target-variant',
    targetVariant,
    '--samples-per-seat',
    String(args.mortalSamplesPerSeat),
    '--mortal-config',
    args.mortalConfig,
    '--seed',
    String(args.seed),
    ...(args.progress ? ['--progress'] : [])
  ]);
}

function runMortalReport(args, targetVariant, outPath) {
  progress(args, `running Mortal report for ${targetVariant}`);
  const report = mortalBenchmarkApi.buildBenchmarkReport(buildMortalArgs(args, targetVariant));
  writeJson(outPath, report);
  return report;
}

function runArenaReport(args) {
  progress(args, `running arena mixed report (${args.arenaMatches} hanchan)`);
  const report = arenaApi.buildArenaReport(arenaApi.parseArgs([
    '--mode',
    'mixed',
    '--matches',
    String(args.arenaMatches),
    '--seed',
    String(args.seed),
    '--checkpoint-interval',
    String(args.checkpointInterval),
    '--stdout',
    'json',
    '--out',
    args.arenaOut,
    ...(args.progress ? ['--progress'] : [])
  ]));
  writeJson(args.arenaOut, report);
  return report;
}

function buildStage1Summary(args, reports) {
  const tunedMortal = reports.tunedMortal ? summarizeMortalReport(reports.tunedMortal) : null;
  const pureMortal = reports.pureMortal ? summarizeMortalReport(reports.pureMortal) : null;
  const arena = reports.arena ? summarizeArenaReport(reports.arena) : null;
  return {
    source: 'run-hard-ai-stage1-evidence',
    generatedAt: new Date().toISOString(),
    smoke: Boolean(args.smoke),
    decisionRule: 'Mortal finds candidate problems; arena decides strength impact. Do not tune on Mortal exact alone.',
    options: {
      mortalSamplesPerSeat: args.mortalSamplesPerSeat,
      arenaMatches: args.arenaMatches,
      seed: args.seed,
      mortalConfig: args.mortalConfig,
      skipMortal: Boolean(args.skipMortal),
      skipArena: Boolean(args.skipArena)
    },
    outputs: {
      hardTunedMortal: args.tunedMortalOut,
      hardPureMortal: args.pureMortalOut,
      arena: args.arenaOut,
      summary: args.out
    },
    mortal: {
      hardTuned: tunedMortal,
      hardPure: pureMortal,
      tunedVsPure: tunedMortal && pureMortal ? compareMortalSummaries(pureMortal, tunedMortal) : null
    },
    arena,
    nextRepairPriority: [
      'P2 defense residual debt',
      'P3 riichi residual debt',
      'P1/P4 same-xiangting tile-choice debt',
      'no-pressure backstep debt'
    ],
    candidatePool: tunedMortal ? tunedMortal.candidatePool : null
  };
}

function buildStage1Evidence(argsInput = {}) {
  const args = {
    ...parseArgs([]),
    ...(argsInput || {})
  };
  const reports = {};
  if (args.skipMortal) {
    reports.tunedMortal = fs.existsSync(args.tunedMortalOut) ? readJson(args.tunedMortalOut) : null;
    reports.pureMortal = fs.existsSync(args.pureMortalOut) ? readJson(args.pureMortalOut) : null;
  } else {
    reports.tunedMortal = runMortalReport(args, 'hard-tuned', args.tunedMortalOut);
    reports.pureMortal = runMortalReport(args, 'hard-pure', args.pureMortalOut);
  }
  reports.arena = args.skipArena
    ? (fs.existsSync(args.arenaOut) ? readJson(args.arenaOut) : null)
    : runArenaReport(args);

  const summary = buildStage1Summary(args, reports);
  writeJson(args.out, summary);
  return summary;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  const summary = buildStage1Evidence(args);
  console.log(JSON.stringify(summary, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArgs,
  summarizeMortalReport,
  compareMortalSummaries,
  summarizeArenaReport,
  buildCandidatePool,
  buildStage1Summary,
  buildStage1Evidence
};
