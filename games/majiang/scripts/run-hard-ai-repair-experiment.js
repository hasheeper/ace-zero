'use strict';

const fs = require('fs');
const path = require('path');

const arenaApi = require('./benchmark-ai-hanchan-arena');
const mortalBenchmarkApi = require('./benchmark-hard-vs-mortal');
const repairCandidateApi = require('./build-hard-ai-repair-candidates');
const defenseReplayApi = require('./replay-hard-ai-defense-candidates');
const tileChoiceReplayApi = require('./replay-hard-ai-tile-choice-candidates');

const DEFAULT_POOL_PATH = '/tmp/h14-p1-hard-ai-repair-candidates.json';
const DEFAULT_OUT_PATH = '/tmp/h14-p2-repair-experiment-summary.json';
const DEFAULT_MORTAL_SAMPLES_PER_SEAT = 40;
const DEFAULT_ARENA_MATCHES = 100;
const DEFAULT_SEED = 20260603;

function parsePositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function parseArgs(argv = []) {
  const args = {
    help: false,
    smoke: false,
    progress: false,
    pool: DEFAULT_POOL_PATH,
    out: DEFAULT_OUT_PATH,
    skipMortal: false,
    skipArena: false,
    mortalConfig: 'real',
    mortalSamplesPerSeat: DEFAULT_MORTAL_SAMPLES_PER_SEAT,
    arenaMatches: DEFAULT_ARENA_MATCHES,
    seed: DEFAULT_SEED,
    experimentalOverlays: [],
    mortalTunedOut: '/tmp/h14-p2-hard-tuned-vs-mortal.json',
    mortalExperimentalOut: '/tmp/h14-p2-hard-experimental-vs-mortal.json',
    arenaOut: '/tmp/h14-p2-arena-hard-experimental.json'
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }
    if (token === '--smoke') {
      args.smoke = true;
      args.mortalConfig = 'smoke';
      args.mortalSamplesPerSeat = 1;
      args.arenaMatches = 1;
      continue;
    }
    if (token === '--progress') {
      args.progress = true;
      continue;
    }
    if (token === '--pool') {
      args.pool = String(argv[index + 1] || '').trim() || args.pool;
      index += 1;
      continue;
    }
    if (token === '--experimental-overlays') {
      args.experimentalOverlays = arenaApi.normalizeExperimentalOverlays(argv[index + 1]);
      index += 1;
      continue;
    }
    if (token === '--out') {
      args.out = String(argv[index + 1] || '').trim() || args.out;
      index += 1;
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
    if (token === '--mortal-config') {
      args.mortalConfig = String(argv[index + 1] || '').trim() || args.mortalConfig;
      index += 1;
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
  }
  return args;
}

function printHelp() {
  console.log('Usage: node games/majiang/scripts/run-hard-ai-repair-experiment.js [options]');
  console.log('');
  console.log('Options:');
  console.log('  --smoke                         Tiny smoke defaults.');
  console.log('  --pool <path>                   P1 repair candidate pool.');
  console.log('  --experimental-overlays <a,b>   Overlays for hard-experimental only.');
  console.log('  --skip-mortal                   Do not run Mortal comparison.');
  console.log('  --skip-arena                    Do not run arena comparison.');
  console.log('  --mortal-samples-per-seat <n>   Default: 40.');
  console.log('  --arena-matches <n>             Default: 100.');
  console.log('  --out <path>                    Output path.');
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function writeJson(filePath, value) {
  fs.writeFileSync(path.resolve(filePath), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function readJsonIfExists(filePath) {
  if (!filePath || !fs.existsSync(path.resolve(filePath))) return null;
  return JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
}

function progress(args, message) {
  if (args && args.progress) console.error(`[h14-p2] ${message}`);
}

function summarizePolicyEquivalence(options = {}) {
  const experimentalOverlays = arenaApi.normalizeExperimentalOverlays(options.experimentalOverlays || []);
  const presets = arenaApi.createVariantPresets();
  const tuned = presets['hard-tuned'].createPolicy();
  const experimental = presets['hard-experimental'].createPolicy({
    experimentalOverlays
  });
  const keys = [
    ['discard', 'enableNoPressureShapeReview'],
    ['discard', 'shapeStrongOverrideEnabled'],
    ['discard', 'enableNoPressureCleanupGuard'],
    ['discard', 'enableNoPressureSameXiangtingRerank'],
    ['discard', 'sameXiangtingRerankMinShapeDelta'],
    ['discard', 'sameXiangtingRerankMaxHardEvLoss'],
    ['discard', 'sameXiangtingRerankMinXiangting'],
    ['discard', 'sameXiangtingRerankMaxXiangting'],
    ['defense', 'enableLowDangerTiebreak'],
    ['defense', 'enableEqualSafeBackstep'],
    ['defense', 'equalSafeBackstepMinPressure'],
    ['defense', 'equalSafeBackstepMaxXiangtingLoss'],
    ['riichi', 'allowNoPressureThinRiichi']
  ];
  const differences = keys
    .map(([section, key]) => ({
      path: `${section}.${key}`,
      tuned: tuned[section] && tuned[section][key],
      experimental: experimental[section] && experimental[section][key]
    }))
    .filter((entry) => entry.tuned !== entry.experimental);
  return {
    tunedPolicyId: tuned.id,
    experimentalPolicyId: experimental.id,
    requestedOverlays: experimentalOverlays,
    experimentalOverlay: clone(experimental.experimentalOverlay || null),
    overlayEnabled: Boolean(experimental.experimentalOverlay && experimental.experimentalOverlay.enabled),
    equivalentToHardTuned: differences.length === 0 && !(experimental.experimentalOverlay && experimental.experimentalOverlay.enabled),
    differences
  };
}

function summarizeFixtureGate(pool = null, fixtureReplay = null, tileChoiceReplay = null) {
  const candidates = pool && Array.isArray(pool.candidates) ? pool.candidates : [];
  const fixtureCandidates = candidates.filter((candidate) => candidate && candidate.fixedState);
  const priorityCounts = fixtureCandidates.reduce((counts, candidate) => {
    counts[candidate.priority] = Number(counts[candidate.priority] || 0) + 1;
    return counts;
  }, {});
  const hasReplay = Boolean(fixtureReplay || tileChoiceReplay);
  return {
    status: fixtureCandidates.length ? 'ready-for-human-review' : 'empty',
    replayStatus: hasReplay ? 'complete' : 'not-run',
    reason: hasReplay
      ? 'Candidate-level replay completed. Full runtime replay remains out of scope for H14 experimental gates.'
      : 'No candidate replay result was provided.',
    fixtureCandidates: fixtureCandidates.length,
    priorityCounts,
    defenseReplay: fixtureReplay && fixtureReplay.summary ? clone(fixtureReplay.summary) : null,
    tileChoiceReplay: tileChoiceReplay && tileChoiceReplay.summary ? clone(tileChoiceReplay.summary) : null,
    sampleIds: fixtureCandidates.slice(0, 12).map((candidate) => candidate.id)
  };
}

function summarizeMortalReport(report = null) {
  const rows = Array.isArray(report && report.rows) ? report.rows : [];
  const large = rows.filter((row) => row && row.mortalSeverity && row.mortalSeverity.level === 'large').length;
  const exact = rows.filter((row) => row && row.mortalSeverity && row.mortalSeverity.level === 'exact').length;
  const bucketLargeCounts = rows.reduce((counts, row) => {
    if (!row || !row.mortalSeverity || row.mortalSeverity.level !== 'large') return counts;
    const bucket = row.judgment && row.judgment.bucket || 'unknown';
    counts[bucket] = Number(counts[bucket] || 0) + 1;
    return counts;
  }, {});
  return {
    targetVariant: report && report.targetVariant,
    rows: rows.length,
    exact,
    large,
    exactRate: rows.length ? exact / rows.length : 0,
    bucketLargeCounts
  };
}

function summarizeMortalComparison(tunedReport = null, experimentalReport = null) {
  const tuned = summarizeMortalReport(tunedReport);
  const experimental = summarizeMortalReport(experimentalReport);
  return {
    status: tunedReport && experimentalReport ? 'complete' : 'skipped',
    hardTuned: tunedReport ? tuned : null,
    hardExperimental: experimentalReport ? experimental : null,
    largeDelta: tunedReport && experimentalReport ? experimental.large - tuned.large : null,
    exactRateDelta: tunedReport && experimentalReport ? experimental.exactRate - tuned.exactRate : null
  };
}

function summarizeArena(report = null) {
  const summary = report && report.mixed && report.mixed.summary ? report.mixed.summary : null;
  if (!summary) return null;
  const variants = arenaApi.resolveVariants(report.variantOrder || [], report);
  return {
    totals: clone(summary.totals),
    variants: variants.reduce((result, variant) => {
      const stats = summary.variantStats && summary.variantStats[variant.id];
      if (stats) result[variant.id] = arenaApi.buildVariantRecordPanel(stats);
      return result;
    }, {})
  };
}

function buildGateConclusion(policy, fixtureGate, mortalComparison, arenaSummary) {
  const failed = [];
  const passed = [];
  if (policy.overlayEnabled) passed.push('experimental-overlay-explicit');
  else if (!policy.equivalentToHardTuned) failed.push('experimental-policy-not-clean-baseline');
  else passed.push('experimental-policy-clean-baseline');
  if (!fixtureGate.fixtureCandidates) failed.push('no-fixture-candidates');
  else passed.push('fixture-candidates-present');
  if (fixtureGate.replayStatus === 'complete') passed.push('fixture-replay-present');
  else failed.push('fixture-replay-missing');
  if (
    policy.requestedOverlays
    && policy.requestedOverlays.includes(tileChoiceReplayApi.TILE_CHOICE_OVERLAY)
    && fixtureGate.tileChoiceReplay
    && Number(fixtureGate.tileChoiceReplay.patchEligible || 0) <= 0
  ) {
    failed.push('tile-choice-replay-no-patch-eligible');
  }
  if (mortalComparison.status === 'complete') passed.push('mortal-comparison-present');
  else failed.push('mortal-comparison-skipped');
  if (arenaSummary) passed.push('arena-comparison-present');
  else failed.push('arena-comparison-skipped');
  return {
    status: failed.length ? 'not-ready-for-formal-hard' : 'ready-for-specific-patch-review',
    passed,
    failed,
    rule: 'A real repair patch still needs fixture non-regression, Mortal bucket non-regression, and arena non-regression before formal hard adoption.'
  };
}

function runMortal(args, targetVariant, outPath) {
  progress(args, `running Mortal ${targetVariant}`);
  const report = mortalBenchmarkApi.buildBenchmarkReport(mortalBenchmarkApi.parseArgs([
    ...(args.smoke ? ['--smoke'] : []),
    '--target-variant',
    targetVariant,
    '--samples-per-seat',
    String(args.mortalSamplesPerSeat),
      '--mortal-config',
      args.mortalConfig,
      ...(targetVariant === 'hard-experimental' && args.experimentalOverlays.length
        ? ['--experimental-overlays', args.experimentalOverlays.join(',')]
        : []),
      '--seed',
    String(args.seed),
    ...(args.progress ? ['--progress'] : [])
  ]));
  writeJson(outPath, report);
  return report;
}

function runArena(args) {
  progress(args, 'running arena hard-tuned vs hard-experimental');
  const report = arenaApi.buildArenaReport(arenaApi.parseArgs([
    '--mode',
    'mixed',
    '--variants',
    'hard-tuned,hard-experimental',
    ...(args.experimentalOverlays.length
      ? ['--experimental-overlays', args.experimentalOverlays.join(',')]
      : []),
    '--matches',
    String(args.arenaMatches),
    '--seed',
    String(args.seed),
    '--checkpoint-interval',
    '25',
    '--stdout',
    'json',
    ...(args.progress ? ['--progress'] : [])
  ]));
  writeJson(args.arenaOut, report);
  return report;
}

function buildRepairExperimentSummary(argsInput = {}, provided = {}) {
  const args = {
    ...parseArgs([]),
    ...(argsInput || {})
  };
  const pool = provided.pool || readJsonIfExists(args.pool) || repairCandidateApi.buildRepairCandidates({}, {});
  const policy = summarizePolicyEquivalence({
    experimentalOverlays: args.experimentalOverlays
  });
  const fixtureReplay = provided.fixtureReplay || defenseReplayApi.buildDefenseReplayReport(pool, {
    poolPath: args.pool
  });
  const tileChoiceReplay = provided.tileChoiceReplay || tileChoiceReplayApi.buildTileChoiceReplayReport(pool, {
    poolPath: args.pool
  });
  const fixtureGate = summarizeFixtureGate(pool, fixtureReplay, tileChoiceReplay);
  const tileChoiceOverlayWithoutEligible = args.experimentalOverlays.includes(tileChoiceReplayApi.TILE_CHOICE_OVERLAY)
    && tileChoiceReplay
    && tileChoiceReplay.summary
    && Number(tileChoiceReplay.summary.patchEligible || 0) <= 0;
  const tunedMortal = provided.tunedMortal || (!args.skipMortal && !tileChoiceOverlayWithoutEligible ? runMortal(args, 'hard-tuned', args.mortalTunedOut) : null);
  const experimentalMortal = provided.experimentalMortal || (!args.skipMortal && !tileChoiceOverlayWithoutEligible ? runMortal(args, 'hard-experimental', args.mortalExperimentalOut) : null);
  const arenaReport = provided.arena || (!args.skipArena && !tileChoiceOverlayWithoutEligible ? runArena(args) : null);
  const mortalComparison = summarizeMortalComparison(tunedMortal, experimentalMortal);
  const arenaSummary = summarizeArena(arenaReport);
  const gate = buildGateConclusion(policy, fixtureGate, mortalComparison, arenaSummary);
  return {
    source: 'hard-ai-repair-experiment',
    generatedAt: new Date().toISOString(),
    options: {
      smoke: Boolean(args.smoke),
      pool: args.pool,
      mortalSamplesPerSeat: args.mortalSamplesPerSeat,
      arenaMatches: args.arenaMatches,
      skipMortal: Boolean(args.skipMortal),
      skipArena: Boolean(args.skipArena),
      experimentalOverlays: args.experimentalOverlays.slice(),
      comparisonsSkippedReason: tileChoiceOverlayWithoutEligible
        ? 'tile-choice-replay-no-patch-eligible'
        : null
    },
    policy,
    fixtureGate,
    fixtureReplay,
    tileChoiceReplay,
    mortal: mortalComparison,
    arena: arenaSummary,
    gate,
    nextAllowedPatchOrder: [
      'defense residual debt',
      'riichi residual debt',
      'same-xiangting tile-choice residual debt',
      'backstep queue only'
    ]
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  const summary = buildRepairExperimentSummary(args);
  writeJson(args.out, summary);
  console.log(JSON.stringify(summary, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  DEFAULT_POOL_PATH,
  DEFAULT_OUT_PATH,
  parseArgs,
  summarizePolicyEquivalence,
  summarizeFixtureGate,
  summarizeMortalComparison,
  summarizeArena,
  buildGateConclusion,
  buildRepairExperimentSummary
};
