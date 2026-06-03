'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_CORPUS_PATH = '/tmp/h13h-hard-disagreement-adjudication-corpus.json';
const DEFAULT_OUT_PATH = '/tmp/h13h-hard-disagreement-adjudication-labeled.json';

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function roundMetric(value, digits = 6) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Number(number.toFixed(digits));
}

function increment(map, key, amount = 1) {
  const resolved = key || 'unknown';
  map[resolved] = (map[resolved] || 0) + amount;
}

function modelSignalSummary(row = null) {
  const signals = row && row.modelSignals && typeof row.modelSignals === 'object' ? row.modelSignals : {};
  const names = Object.keys(signals);
  const exactImprovementNames = names.filter((name) => signals[name] && signals[name].exactImprovement);
  const changedNames = names.filter((name) => signals[name] && signals[name].changed);
  return {
    totalModels: names.length,
    changedCount: changedNames.length,
    exactImprovementCount: exactImprovementNames.length,
    exactImprovementNames,
    changedNames,
    bothNativeExactImprovement: exactImprovementNames.length >= 2
  };
}

function qDeltaOf(row = null) {
  return numberOrNull(row && row.qDelta);
}

function isPressureRow(row = null) {
  return Boolean(row && (row.bucket === 'tile-defense' || Number(row.pressureScore || 0) > 0));
}

function relationValue(row = null, key) {
  return numberOrNull(row && row.relation && row.relation[key]);
}

function hasMissingContext(row = null) {
  return !row
    || !row.fixedState
    || !row.localCandidate
    || !row.mortalCandidate
    || !Array.isArray(row.candidateTable)
    || row.candidateTable.length < 2;
}

function classifyAutoAdjudication(row = null) {
  const qDelta = qDeltaOf(row);
  const relation = row && row.relation ? row.relation : {};
  const xiangtingRelation = relation.xiangtingRelation || 'unknown';
  const hardEvDelta = relationValue(row, 'hardEvDelta');
  const shapeDelta = relationValue(row, 'shapeDelta');
  const signal = modelSignalSummary(row);
  const reasons = [];

  if (hasMissingContext(row)) {
    return {
      label: 'insufficient-context',
      confidence: 'high',
      reviewPriority: 'P0',
      manualReviewRequired: true,
      reasons: ['missing-fixed-state-or-candidate-context'],
      modelSignal: signal
    };
  }

  if (qDelta != null && qDelta <= 0.15) {
    return {
      label: 'normal-disagreement',
      confidence: 'medium',
      reviewPriority: 'P3',
      manualReviewRequired: false,
      reasons: ['qDelta<=0.15'],
      modelSignal: signal
    };
  }

  if (isPressureRow(row)) {
    reasons.push('pressure-or-defense-row');
    if (qDelta != null && qDelta > 1) reasons.push('large-defense-qDelta');
    if (xiangtingRelation === 'mortal-worse') reasons.push('mortal-defense-may-backstep');
    return {
      label: 'defense-tradeoff-review',
      confidence: 'medium',
      reviewPriority: qDelta != null && qDelta > 1 ? 'P1' : 'P2',
      manualReviewRequired: true,
      reasons,
      modelSignal: signal
    };
  }

  if (xiangtingRelation === 'mortal-worse') {
    reasons.push('mortal-chooses-worse-xiangting');
    if (qDelta != null && qDelta > 1) reasons.push('route-backstep-has-large-qDelta');
    if (signal.bothNativeExactImprovement) reasons.push('both-native-models-support-mortal-backstep');
    return {
      label: 'route-backstep-review',
      confidence: 'medium',
      reviewPriority: qDelta != null && qDelta > 1 ? 'P1' : 'P2',
      manualReviewRequired: true,
      reasons,
      modelSignal: signal
    };
  }

  if (xiangtingRelation === 'mortal-better') {
    reasons.push('mortal-improves-xiangting');
    if (qDelta != null && qDelta > 1) reasons.push('mortal-better-xiangting-large-qDelta');
    return {
      label: qDelta != null && qDelta > 1 ? 'hard-likely-bad-move' : 'hard-suspect-mistake',
      confidence: qDelta != null && qDelta > 1 ? 'medium' : 'low',
      reviewPriority: 'P1',
      manualReviewRequired: true,
      reasons,
      modelSignal: signal
    };
  }

  const hardEvPrefersMortal = hardEvDelta != null && hardEvDelta <= -100;
  const hardEvStronglyPrefersLocal = hardEvDelta != null && hardEvDelta >= 100;
  const shapePrefersMortal = shapeDelta != null && shapeDelta <= -10;
  const shapeStronglyPrefersLocal = shapeDelta != null && shapeDelta >= 10;

  if (hardEvPrefersMortal) reasons.push('hard-ev-prefers-mortal>=100');
  if (shapePrefersMortal) reasons.push('shape-prefers-mortal>=10');
  if (hardEvStronglyPrefersLocal) reasons.push('hard-ev-prefers-local>=100');
  if (shapeStronglyPrefersLocal) reasons.push('shape-prefers-local>=10');
  if (signal.bothNativeExactImprovement) reasons.push('both-native-models-exact-improvement');
  if (signal.exactImprovementCount === 1) reasons.push('one-native-model-exact-improvement');

  const veryLargeSameXiangting = qDelta != null && qDelta > 2 && xiangtingRelation === 'same';
  const strongObjectiveSupport = signal.bothNativeExactImprovement || hardEvPrefersMortal || (
    hardEvDelta != null
    && Math.abs(hardEvDelta) <= 20
    && !shapeStronglyPrefersLocal
  );

  if (veryLargeSameXiangting && strongObjectiveSupport) {
    return {
      label: 'hard-likely-bad-move',
      confidence: signal.bothNativeExactImprovement || hardEvPrefersMortal ? 'medium' : 'low',
      reviewPriority: 'P0',
      manualReviewRequired: true,
      reasons: ['same-xiangting-qDelta>2', ...reasons],
      modelSignal: signal
    };
  }

  if ((qDelta != null && qDelta > 1) || signal.exactImprovementCount > 0 || hardEvPrefersMortal || shapePrefersMortal) {
    return {
      label: 'hard-suspect-mistake',
      confidence: qDelta != null && qDelta > 1 ? 'medium' : 'low',
      reviewPriority: qDelta != null && qDelta > 1 ? 'P1' : 'P2',
      manualReviewRequired: true,
      reasons: reasons.length ? reasons : ['qDelta-or-model-signal-suggests-review'],
      modelSignal: signal
    };
  }

  return {
    label: 'mortal-preference-acceptable',
    confidence: 'low',
    reviewPriority: 'P3',
    manualReviewRequired: true,
    reasons: reasons.length ? reasons : ['review-band-without-strong-objective-support'],
    modelSignal: signal
  };
}

function annotateRow(row = null) {
  const copy = clone(row || {});
  const autoAdjudication = classifyAutoAdjudication(copy);
  copy.autoAdjudication = autoAdjudication;
  copy.adjudication = {
    ...(copy.adjudication || {}),
    status: copy.adjudication && copy.adjudication.status ? copy.adjudication.status : 'unreviewed',
    suggestedLabel: autoAdjudication.label,
    suggestedConfidence: autoAdjudication.confidence,
    suggestedReviewPriority: autoAdjudication.reviewPriority
  };
  return copy;
}

function summarizeAnnotatedRows(rows = []) {
  const summary = {
    total: rows.length,
    labelCounts: {},
    confidenceCounts: {},
    reviewPriorityCounts: {},
    manualReviewRequired: 0,
    byBucket: {},
    byQBand: {},
    highPriorityRows: [],
    likelyBadRows: [],
    suspectRows: [],
    defenseRows: [],
    routeBackstepRows: []
  };
  rows.forEach((row) => {
    const auto = row.autoAdjudication || {};
    increment(summary.labelCounts, auto.label);
    increment(summary.confidenceCounts, auto.confidence);
    increment(summary.reviewPriorityCounts, auto.reviewPriority);
    increment(summary.byBucket, `${row.bucket || 'unknown'}:${auto.label || 'unknown'}`);
    increment(summary.byQBand, `${row.qBand || 'unknown'}:${auto.label || 'unknown'}`);
    if (auto.manualReviewRequired) summary.manualReviewRequired += 1;
  });

  const compact = (row) => ({
    id: row.id,
    bucket: row.bucket,
    qDelta: row.qDelta,
    qBand: row.qBand,
    localTile: row.localDecision && row.localDecision.tileCode,
    mortalTile: row.bestMortalCandidate && row.bestMortalCandidate.tileCode,
    relation: row.relation,
    label: row.autoAdjudication && row.autoAdjudication.label,
    confidence: row.autoAdjudication && row.autoAdjudication.confidence,
    priority: row.autoAdjudication && row.autoAdjudication.reviewPriority,
    reasons: row.autoAdjudication && row.autoAdjudication.reasons
  });

  const byQDesc = (left, right) => Number(right.qDelta || 0) - Number(left.qDelta || 0);
  summary.highPriorityRows = rows
    .filter((row) => row.autoAdjudication && row.autoAdjudication.reviewPriority === 'P0')
    .sort(byQDesc)
    .slice(0, 20)
    .map(compact);
  summary.likelyBadRows = rows
    .filter((row) => row.autoAdjudication && row.autoAdjudication.label === 'hard-likely-bad-move')
    .sort(byQDesc)
    .slice(0, 20)
    .map(compact);
  summary.suspectRows = rows
    .filter((row) => row.autoAdjudication && row.autoAdjudication.label === 'hard-suspect-mistake')
    .sort(byQDesc)
    .slice(0, 20)
    .map(compact);
  summary.defenseRows = rows
    .filter((row) => row.autoAdjudication && row.autoAdjudication.label === 'defense-tradeoff-review')
    .sort(byQDesc)
    .slice(0, 20)
    .map(compact);
  summary.routeBackstepRows = rows
    .filter((row) => row.autoAdjudication && row.autoAdjudication.label === 'route-backstep-review')
    .sort(byQDesc)
    .slice(0, 20)
    .map(compact);
  return summary;
}

function adjudicateCorpus(corpus = null, options = {}) {
  const rows = (corpus && Array.isArray(corpus.rows) ? corpus.rows : []).map(annotateRow);
  return {
    source: 'hard-disagreement-auto-adjudication',
    generatedAt: Date.now(),
    inputPath: options.inputPath || null,
    sourceCorpus: corpus ? {
      source: corpus.source || null,
      reportPath: corpus.reportPath || null,
      predictionPaths: Array.isArray(corpus.predictionPaths) ? corpus.predictionPaths.slice() : [],
      mortalTeacher: clone(corpus.mortalTeacher || null),
      filters: clone(corpus.filters || null),
      summary: clone(corpus.summary || null)
    } : null,
    policy: {
      mode: 'auto-first-pass',
      note: 'Machine labels are triage suggestions only. Human adjudication remains required before runtime changes.'
    },
    summary: summarizeAnnotatedRows(rows),
    rows
  };
}

function parseArgs(argv = []) {
  const args = {
    help: false,
    corpus: DEFAULT_CORPUS_PATH,
    out: DEFAULT_OUT_PATH,
    stdout: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }
    if (token === '--corpus') {
      args.corpus = String(argv[index + 1] || '').trim() || args.corpus;
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
  console.log('Usage: node games/majiang/scripts/adjudicate-hard-disagreement-corpus.js [options]');
  console.log('');
  console.log('Options:');
  console.log('  --corpus <path>  Input H13h corpus. Default: /tmp/h13h-hard-disagreement-adjudication-corpus.json');
  console.log('  --out <path>     Output auto-adjudicated corpus. Default: /tmp/h13h-hard-disagreement-adjudication-labeled.json');
  console.log('  --stdout         Also print full JSON.');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  const corpus = readJson(args.corpus);
  const adjudicated = adjudicateCorpus(corpus, {
    inputPath: path.resolve(args.corpus)
  });
  const output = JSON.stringify(adjudicated, null, 2);
  if (args.out) fs.writeFileSync(path.resolve(args.out), output.concat('\n'), 'utf8');
  if (args.stdout || !args.out) {
    console.log(output);
  } else {
    console.log(JSON.stringify({
      out: path.resolve(args.out),
      summary: adjudicated.summary
    }, null, 2));
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  DEFAULT_CORPUS_PATH,
  DEFAULT_OUT_PATH,
  modelSignalSummary,
  classifyAutoAdjudication,
  annotateRow,
  summarizeAnnotatedRows,
  adjudicateCorpus,
  parseArgs
};
