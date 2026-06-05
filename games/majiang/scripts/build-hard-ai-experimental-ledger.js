'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_POOL_PATH = '/tmp/h14-p1-hard-ai-repair-candidates.json';
const DEFAULT_DEFENSE_REPLAY_PATH = '/tmp/h14-p3-defense-replay.json';
const DEFAULT_TILE_CHOICE_REPLAY_PATH = '/tmp/h14-p4-tile-choice-replay.json';
const DEFAULT_DEFENSE_EXPERIMENT_PATH = '/tmp/h14-p3-defense-experiment-scout.json';
const DEFAULT_TILE_CHOICE_EXPERIMENT_PATH = '/tmp/h14-p4-tile-choice-experiment-scout.json';
const DEFAULT_OUT_PATH = '/tmp/h14-p5-hard-ai-experimental-ledger.json';

const FORBIDDEN_COMPACT_KEYS = new Set([
  'runtime',
  'board',
  'eventLog',
  'stdout',
  'stderr',
  'mortalRoot',
  'hardContext',
  'waits'
]);

function clone(value) {
  if (value == null) return value;
  return sanitize(JSON.parse(JSON.stringify(value)));
}

function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !FORBIDDEN_COMPACT_KEYS.has(key))
    .map(([key, entry]) => [key, sanitize(entry)]));
}

function readJsonIfExists(filePath) {
  if (!filePath || !fs.existsSync(path.resolve(filePath))) return null;
  return JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(path.resolve(filePath), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function increment(counts, key, amount = 1) {
  const resolved = key || 'unknown';
  counts[resolved] = Number(counts[resolved] || 0) + amount;
}

function byId(rows = []) {
  return new Map((Array.isArray(rows) ? rows : [])
    .filter((row) => row && row.id)
    .map((row) => [row.id, row]));
}

function compactCandidate(candidate = null) {
  if (!candidate || typeof candidate !== 'object') return null;
  return {
    id: candidate.id || null,
    priority: candidate.priority || null,
    category: candidate.category || null,
    bucket: candidate.bucket || null,
    qDelta: numberOrNull(candidate.qDelta),
    pressureScore: numberOrNull(candidate.pressureScore),
    currentTile: candidate.currentHard && candidate.currentHard.tileCode
      || candidate.localDecision && candidate.localDecision.tileCode
      || null,
    teacherTile: candidate.teacher && candidate.teacher.tileCode
      || candidate.mortalDecision && candidate.mortalDecision.tileCode
      || null,
    sourceTypes: Array.isArray(candidate.sourceTypes) ? candidate.sourceTypes.slice() : [],
    sourceIds: Array.isArray(candidate.sourceIds) ? candidate.sourceIds.slice() : [],
    fixedStateAvailable: Boolean(candidate.fixedState),
    relation: clone(candidate.relation || null),
    modelSignal: clone(candidate.modelSignal || null),
    autoAdjudication: clone(candidate.autoAdjudication || null)
  };
}

function compactReplay(row = null) {
  if (!row || typeof row !== 'object') return null;
  return {
    classification: row.classification || null,
    reasons: Array.isArray(row.reasons) ? row.reasons.slice() : [],
    currentTile: row.currentHard && row.currentHard.tileCode
      || row.local && row.local.tileCode
      || null,
    teacherTile: row.teacher && row.teacher.tileCode || null,
    experimentalTile: row.experimental && row.experimental.tileCode || null,
    deltas: clone(row.deltas || null),
    modelSupport: row.modelSupport || null,
    replay: clone(row.replay || null)
  };
}

function getVariantPanel(experiment = null, variantId) {
  return experiment
    && experiment.arena
    && experiment.arena.variants
    && experiment.arena.variants[variantId]
    ? experiment.arena.variants[variantId]
    : null;
}

function assessArenaScout(experiment = null) {
  const tuned = getVariantPanel(experiment, 'hard-tuned');
  const experimental = getVariantPanel(experiment, 'hard-experimental');
  if (!tuned || !experimental) {
    return {
      status: 'not-run',
      reason: experiment && experiment.options && experiment.options.comparisonsSkippedReason
        ? experiment.options.comparisonsSkippedReason
        : 'arena-not-present',
      deltas: null
    };
  }
  const deltas = {
    averageRank: numberOrNull(experimental.averageRank - tuned.averageRank),
    fourthRate: numberOrNull(experimental.fourthRate - tuned.fourthRate),
    dealInRate: numberOrNull(experimental.dealInRate - tuned.dealInRate),
    averageScore: numberOrNull(experimental.averageScore - tuned.averageScore)
  };
  const failed = [];
  if (deltas.averageRank != null && deltas.averageRank > 0.04) failed.push('avgRank-worse-than-0.04');
  if (deltas.fourthRate != null && deltas.fourthRate > 0.02) failed.push('fourthRate-worse-than-2pp');
  if (deltas.dealInRate != null && deltas.dealInRate > 0.005) failed.push('dealInRate-worse-than-0.5pp');
  return {
    status: failed.length ? 'rejected-by-arena-scout' : 'arena-scout-non-regression',
    reason: failed.length ? failed.join(',') : 'arena-non-regression-thresholds-cleared',
    deltas
  };
}

function assessExperiment(experiment = null) {
  const overlays = experiment && experiment.options && Array.isArray(experiment.options.experimentalOverlays)
    ? experiment.options.experimentalOverlays.slice()
    : [];
  const arenaScout = assessArenaScout(experiment);
  const skippedReason = experiment && experiment.options ? experiment.options.comparisonsSkippedReason || null : null;
  const gateFailed = experiment && experiment.gate && Array.isArray(experiment.gate.failed)
    ? experiment.gate.failed.slice()
    : [];
  let status = arenaScout.status;
  let reason = arenaScout.reason;
  if (skippedReason) {
    status = 'rejected-by-replay-gate';
    reason = skippedReason;
  } else if (!experiment) {
    status = 'not-run';
    reason = 'experiment-report-missing';
  } else if (gateFailed.length && arenaScout.status === 'not-run') {
    status = 'not-ready';
    reason = gateFailed.join(',');
  }
  return {
    overlays,
    status,
    reason,
    gateStatus: experiment && experiment.gate ? experiment.gate.status || null : null,
    gateFailed,
    mortal: experiment && experiment.mortal ? {
      status: experiment.mortal.status || null,
      largeDelta: numberOrNull(experiment.mortal.largeDelta),
      exactRateDelta: numberOrNull(experiment.mortal.exactRateDelta)
    } : null,
    arenaScout
  };
}

function replayStatusForClassification(classification) {
  if (!classification) return 'not-replayed';
  if (String(classification).startsWith('patch-eligible')) return 'patch-eligible';
  if (classification === 'already-fixed-by-current-hard') return 'already-fixed';
  if (classification === 'already-cross-xiangting-fold') return 'already-covered';
  if (classification === 'teacher-riskier') return 'teacher-riskier';
  if (classification === 'already-safe-no-clear-gain') return 'already-safe-no-clear-gain';
  if (classification === 'route-feature-missing') return 'route-feature-missing';
  if (classification === 'tenpai-route-manual-review') return 'tenpai-route-manual-review';
  if (classification === 'hard-ev-too-far') return 'hard-ev-too-far';
  if (classification === 'teacher-backstep-excluded') return 'backstep-excluded';
  return 'manual-review-only';
}

function finalStatusFor(candidate, replayStatus, experimentStatus) {
  if (experimentStatus === 'rejected-by-arena-scout' && replayStatus === 'patch-eligible') {
    return 'rejected-by-arena-scout';
  }
  if (replayStatus === 'route-feature-missing' || replayStatus === 'tenpai-route-manual-review') {
    return 'manual-route-review';
  }
  if (experimentStatus === 'rejected-by-replay-gate' && candidate.category === 'same-xiangting tile-choice') {
    return replayStatus === 'patch-eligible' ? 'blocked-by-replay-gate' : replayStatus;
  }
  if (replayStatus === 'patch-eligible') return 'eligible-for-scout';
  if (replayStatus === 'manual-review-only' || replayStatus === 'hard-ev-too-far') return 'manual-review-only';
  if (candidate.category === 'backstep') return 'queue-only-backstep';
  if (candidate.category === 'route-dora-five') return 'manual-route-review';
  if (candidate.category === 'riichi') return 'queue-only-riichi';
  if (candidate.category === 'action-type') return 'queue-only-action-type';
  return replayStatus;
}

function buildLedgerRow(candidate, context = {}) {
  const defenseReplay = context.defenseById.get(candidate.id) || null;
  const tileChoiceReplay = context.tileChoiceById.get(candidate.id) || null;
  const replay = candidate.category === 'defense'
    ? defenseReplay
    : candidate.category === 'same-xiangting tile-choice'
      ? tileChoiceReplay
      : null;
  const replayStatus = replayStatusForClassification(replay && replay.classification);
  const experiment = candidate.category === 'defense'
    ? context.defenseExperiment
    : candidate.category === 'same-xiangting tile-choice'
      ? context.tileChoiceExperiment
      : null;
  const experimentStatus = experiment ? experiment.status : 'not-run';
  const finalStatus = finalStatusFor(candidate, replayStatus, experimentStatus);
  return {
    id: candidate.id,
    priority: candidate.priority || null,
    category: candidate.category || null,
    bucket: candidate.bucket || null,
    qDelta: numberOrNull(candidate.qDelta),
    candidate: compactCandidate(candidate),
    replayStatus,
    replayClassification: replay && replay.classification || null,
    experimentStatus,
    finalStatus,
    needsHumanReview: [
      'manual-route-review',
      'manual-review-only',
      'eligible-for-scout',
      'queue-only-riichi',
      'queue-only-action-type',
      'queue-only-backstep'
    ].includes(finalStatus),
    replay: compactReplay(replay),
    experiment: experiment ? {
      overlays: experiment.overlays,
      status: experiment.status,
      reason: experiment.reason,
      arenaScout: clone(experiment.arenaScout || null),
      mortal: clone(experiment.mortal || null)
    } : null
  };
}

function summarizeRows(rows = []) {
  const summary = {
    total: rows.length,
    byCategory: {},
    byPriority: {},
    byReplayStatus: {},
    byReplayClassification: {},
    byExperimentStatus: {},
    byFinalStatus: {},
    routeReviewCount: 0,
    eligibleForScout: 0,
    rejectedByArenaScout: 0,
    queueOnlyCount: 0,
    topManualRouteReview: [],
    topEligible: []
  };
  rows.forEach((row) => {
    increment(summary.byCategory, row.category);
    increment(summary.byPriority, row.priority);
    increment(summary.byReplayStatus, row.replayStatus);
    increment(summary.byReplayClassification, row.replayClassification || 'none');
    increment(summary.byExperimentStatus, row.experimentStatus);
    increment(summary.byFinalStatus, row.finalStatus);
    if (row.finalStatus === 'manual-route-review') summary.routeReviewCount += 1;
    if (row.finalStatus === 'eligible-for-scout') summary.eligibleForScout += 1;
    if (row.finalStatus === 'rejected-by-arena-scout') summary.rejectedByArenaScout += 1;
    if (String(row.finalStatus).startsWith('queue-only')) summary.queueOnlyCount += 1;
  });
  summary.topManualRouteReview = rows
    .filter((row) => row.finalStatus === 'manual-route-review')
    .sort((left, right) => Number(right.qDelta || 0) - Number(left.qDelta || 0))
    .slice(0, 20)
    .map((row) => ({
      id: row.id,
      priority: row.priority,
      category: row.category,
      qDelta: row.qDelta,
      currentTile: row.candidate && row.candidate.currentTile,
      teacherTile: row.candidate && row.candidate.teacherTile,
      replayClassification: row.replayClassification
    }));
  summary.topEligible = rows
    .filter((row) => row.finalStatus === 'eligible-for-scout')
    .sort((left, right) => Number(right.qDelta || 0) - Number(left.qDelta || 0))
    .slice(0, 20)
    .map((row) => ({
      id: row.id,
      priority: row.priority,
      category: row.category,
      qDelta: row.qDelta,
      currentTile: row.candidate && row.candidate.currentTile,
      teacherTile: row.candidate && row.candidate.teacherTile,
      replayClassification: row.replayClassification
    }));
  return summary;
}

function buildExperimentalLedger(inputs = {}, options = {}) {
  const pool = inputs.pool || {};
  const candidates = Array.isArray(pool.candidates) ? pool.candidates : [];
  const context = {
    defenseById: byId(inputs.defenseReplay && inputs.defenseReplay.rows),
    tileChoiceById: byId(inputs.tileChoiceReplay && inputs.tileChoiceReplay.rows),
    defenseExperiment: assessExperiment(inputs.defenseExperiment),
    tileChoiceExperiment: assessExperiment(inputs.tileChoiceExperiment)
  };
  const rows = candidates.map((candidate) => buildLedgerRow(candidate, context));
  return {
    source: 'hard-ai-experimental-ledger',
    generatedAt: new Date().toISOString(),
    outputPath: options.out || DEFAULT_OUT_PATH,
    inputs: clone(options.inputs || {}),
    note: 'H14 P5 diagnostic ledger only. It does not change hard-tuned or hard-experimental policy.',
    experiments: {
      defense: context.defenseExperiment,
      tileChoice: context.tileChoiceExperiment
    },
    summary: summarizeRows(rows),
    nextDecision: {
      rule: 'Do not add another overlay until manual-route-review rows are reviewed as true bad moves and can be checked by arena.',
      suggestedOrder: [
        'review manual-route-review rows',
        'add route diagnostics fixtures',
        'only then consider a narrow route-retention experimental overlay'
      ]
    },
    rows
  };
}

function parseArgs(argv = []) {
  const args = {
    help: false,
    pool: DEFAULT_POOL_PATH,
    defenseReplay: DEFAULT_DEFENSE_REPLAY_PATH,
    tileChoiceReplay: DEFAULT_TILE_CHOICE_REPLAY_PATH,
    defenseExperiment: DEFAULT_DEFENSE_EXPERIMENT_PATH,
    tileChoiceExperiment: DEFAULT_TILE_CHOICE_EXPERIMENT_PATH,
    out: DEFAULT_OUT_PATH,
    stdout: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }
    if (token === '--pool') {
      args.pool = String(argv[index + 1] || '').trim() || '';
      index += 1;
      continue;
    }
    if (token === '--defense-replay') {
      args.defenseReplay = String(argv[index + 1] || '').trim() || '';
      index += 1;
      continue;
    }
    if (token === '--tile-choice-replay') {
      args.tileChoiceReplay = String(argv[index + 1] || '').trim() || '';
      index += 1;
      continue;
    }
    if (token === '--defense-experiment') {
      args.defenseExperiment = String(argv[index + 1] || '').trim() || '';
      index += 1;
      continue;
    }
    if (token === '--tile-choice-experiment') {
      args.tileChoiceExperiment = String(argv[index + 1] || '').trim() || '';
      index += 1;
      continue;
    }
    if (token === '--out') {
      args.out = String(argv[index + 1] || '').trim() || args.out;
      index += 1;
      continue;
    }
    if (token === '--stdout') {
      args.stdout = true;
    }
  }
  return args;
}

function printHelp() {
  console.log('Usage: node games/majiang/scripts/build-hard-ai-experimental-ledger.js [options]');
  console.log('');
  console.log('Options:');
  console.log('  --pool <path>                  H14 P1 repair candidate pool.');
  console.log('  --defense-replay <path>        H14 P3 defense replay report.');
  console.log('  --tile-choice-replay <path>    H14 P4 tile-choice replay report.');
  console.log('  --defense-experiment <path>    H14 P3 defense experiment scout.');
  console.log('  --tile-choice-experiment <path> H14 P4 tile-choice experiment scout.');
  console.log('  --out <path>                   Output path. Default: /tmp/h14-p5-hard-ai-experimental-ledger.json.');
  console.log('  --stdout                       Also print full JSON.');
}

function loadInputs(args) {
  const paths = {
    pool: args.pool,
    defenseReplay: args.defenseReplay,
    tileChoiceReplay: args.tileChoiceReplay,
    defenseExperiment: args.defenseExperiment,
    tileChoiceExperiment: args.tileChoiceExperiment
  };
  return {
    inputs: Object.fromEntries(Object.entries(paths).map(([key, value]) => [key, value ? path.resolve(value) : null])),
    data: {
      pool: readJsonIfExists(args.pool),
      defenseReplay: readJsonIfExists(args.defenseReplay),
      tileChoiceReplay: readJsonIfExists(args.tileChoiceReplay),
      defenseExperiment: readJsonIfExists(args.defenseExperiment),
      tileChoiceExperiment: readJsonIfExists(args.tileChoiceExperiment)
    }
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  const loaded = loadInputs(args);
  const report = buildExperimentalLedger(loaded.data, {
    out: args.out,
    inputs: loaded.inputs
  });
  writeJson(args.out, report);
  if (args.stdout) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(JSON.stringify({
      out: path.resolve(args.out),
      summary: report.summary
    }, null, 2));
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  DEFAULT_OUT_PATH,
  assessArenaScout,
  assessExperiment,
  replayStatusForClassification,
  finalStatusFor,
  buildExperimentalLedger,
  parseArgs
};
