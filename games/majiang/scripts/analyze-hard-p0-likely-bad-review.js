'use strict';

const fs = require('fs');
const path = require('path');
const corpusApi = require('./analyze-hard-disagreement-corpus');

const DEFAULT_ADJUDICATED_PATH = '/tmp/h13h-hard-disagreement-adjudication-labeled.json';
const DEFAULT_OUT_PATH = '/tmp/h13h-p0-likely-bad-review.json';

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

function normalizeTileCode(tileCode) {
  return corpusApi.normalizeTileCode(tileCode);
}

function tileClass(tileCode) {
  const normalized = normalizeTileCode(tileCode);
  const match = normalized ? normalized.match(/^([mpsz])(\d)$/) : null;
  if (!match) return 'unknown';
  const suit = match[1];
  const rank = Number(match[2]);
  if (suit === 'z') return 'honor';
  if (rank === 1 || rank === 9) return 'terminal';
  if (rank === 2 || rank === 8) return 'edge';
  if (rank === 5) return 'five';
  return 'middle';
}

function getCandidateXiangting(candidate = null) {
  return numberOrNull(candidate && candidate.metrics && candidate.metrics.xiangting);
}

function getCandidateHardEv(candidate = null) {
  return numberOrNull(candidate && candidate.hardMetrics && candidate.hardMetrics.hardEvScore);
}

function getCandidateShape(candidate = null) {
  return numberOrNull(candidate && candidate.shape && candidate.shape.discardShapeScore);
}

function getCandidateMortalDelta(candidate = null) {
  return numberOrNull(candidate && candidate.mortal && candidate.mortal.qDeltaFromBest);
}

function modelSignalSummary(row = null) {
  const signals = row && row.modelSignals && typeof row.modelSignals === 'object' ? row.modelSignals : {};
  const names = Object.keys(signals);
  const exactImprovementNames = names.filter((name) => signals[name] && signals[name].exactImprovement);
  const changedNames = names.filter((name) => signals[name] && signals[name].changed);
  const modelPickNames = names
    .filter((name) => signals[name] && signals[name].model && signals[name].model.tileCode)
    .map((name) => ({
      name,
      tileCode: signals[name].model.tileCode,
      normalizedTileCode: normalizeTileCode(signals[name].model.tileCode),
      exactImprovement: Boolean(signals[name].exactImprovement),
      changed: Boolean(signals[name].changed),
      predictionMargin: numberOrNull(signals[name].predictionMargin)
    }));
  const mortalTile = row && row.bestMortalCandidate && row.bestMortalCandidate.tileCode;
  const normalizedMortal = normalizeTileCode(mortalTile);
  const modelMortalPickCount = modelPickNames.filter((pick) => pick.normalizedTileCode === normalizedMortal).length;

  return {
    totalModels: names.length,
    changedCount: changedNames.length,
    exactImprovementCount: exactImprovementNames.length,
    exactImprovementNames,
    changedNames,
    modelMortalPickCount,
    supportLevel: exactImprovementNames.length >= 2
      ? 'both-native-support-mortal'
      : exactImprovementNames.length === 1
      ? 'one-native-supports-mortal'
      : modelMortalPickCount > 0
      ? 'model-picks-mortal-without-exact-improvement'
      : 'no-native-support',
    modelPicks: modelPickNames
  };
}

function bandForHardEvDelta(delta) {
  const value = numberOrNull(delta);
  if (value == null) return 'unknown';
  if (value >= 100) return 'hard-ev-strongly-prefers-local';
  if (value >= 20) return 'hard-ev-mildly-prefers-local';
  if (value > -20) return 'hard-ev-near-tie';
  if (value > -100) return 'hard-ev-mildly-prefers-mortal';
  return 'hard-ev-strongly-prefers-mortal';
}

function bandForShapeDelta(delta) {
  const value = numberOrNull(delta);
  if (value == null) return 'unknown';
  if (value >= 10) return 'shape-prefers-local';
  if (value > -10) return 'shape-near-tie';
  return 'shape-prefers-mortal';
}

function compactReviewCandidate(candidate = null) {
  if (!candidate || typeof candidate !== 'object') return null;
  return {
    tileCode: candidate.tileCode || null,
    normalizedTileCode: candidate.normalizedTileCode || normalizeTileCode(candidate.tileCode),
    tileClass: candidate.tileClass || tileClass(candidate.tileCode),
    selectedFinal: Boolean(candidate.selectedFinal),
    metrics: clone(candidate.metrics || null),
    danger: clone(candidate.danger || null),
    hardMetrics: clone(candidate.hardMetrics || null),
    shape: clone(candidate.shape || null),
    mortal: candidate.mortal ? {
      qValue: numberOrNull(candidate.mortal.qValue),
      qDeltaFromBest: numberOrNull(candidate.mortal.qDeltaFromBest),
      isBest: Boolean(candidate.mortal.isBest),
      actionIndex: numberOrNull(candidate.mortal.actionIndex)
    } : null
  };
}

function compactCandidateTable(row = null) {
  const candidates = Array.isArray(row && row.candidateTable) ? row.candidateTable : [];
  return candidates
    .map((candidate) => {
      const compact = compactReviewCandidate(candidate);
      if (!compact) return null;
      const normalized = compact.normalizedTileCode;
      compact.isLocalTile = normalized === normalizeTileCode(row && row.localDecision && row.localDecision.tileCode);
      compact.isMortalBestTile = normalized === normalizeTileCode(row && row.bestMortalCandidate && row.bestMortalCandidate.tileCode);
      return compact;
    })
    .filter(Boolean)
    .sort((left, right) => {
      const leftQ = getCandidateMortalDelta(left);
      const rightQ = getCandidateMortalDelta(right);
      if (leftQ == null && rightQ == null) return 0;
      if (leftQ == null) return 1;
      if (rightQ == null) return -1;
      return leftQ - rightQ;
    });
}

function classifyTilePair(localTile, mortalTile) {
  const localClass = tileClass(localTile);
  const mortalClass = tileClass(mortalTile);
  const pair = `${localClass}->${mortalClass}`;
  if (localClass === 'honor' && mortalClass === 'honor') return { pair, theme: 'honor-ordering' };
  if (localClass === 'honor' && mortalClass === 'terminal') return { pair, theme: 'honor-retention-vs-terminal-cleanup' };
  if ((localClass === 'middle' || localClass === 'five' || localClass === 'edge') && mortalClass === 'terminal') {
    return { pair, theme: 'middle-or-edge-vs-terminal-cleanup' };
  }
  if (localClass === 'terminal' && mortalClass === 'honor') return { pair, theme: 'terminal-vs-honor-retention' };
  if (localClass === 'terminal' && (mortalClass === 'middle' || mortalClass === 'five' || mortalClass === 'edge')) {
    return { pair, theme: 'terminal-vs-middle-route' };
  }
  return { pair, theme: 'tile-route-choice' };
}

function classifyP0ReviewRow(row = null) {
  const relation = row && row.relation ? row.relation : {};
  const qDelta = numberOrNull(row && row.qDelta);
  const localTile = row && row.localDecision && row.localDecision.tileCode;
  const mortalTile = row && row.bestMortalCandidate && row.bestMortalCandidate.tileCode;
  const localCandidate = row && row.localCandidate;
  const mortalCandidate = row && row.mortalCandidate;
  const modelSignal = modelSignalSummary(row);
  const localClass = tileClass(localTile);
  const mortalClass = tileClass(mortalTile);
  const tilePair = classifyTilePair(localTile, mortalTile);
  const hardEvDelta = numberOrNull(relation.hardEvDelta);
  const shapeDelta = numberOrNull(relation.shapeDelta);
  const dangerDelta = numberOrNull(relation.dangerDelta);
  const pressureScore = numberOrNull(row && row.pressureScore) || 0;
  const remaining = numberOrNull(row && row.remaining);
  const localXiangting = getCandidateXiangting(localCandidate);
  const modes = [];

  if (qDelta != null && qDelta >= 4) modes.push('very-high-qdelta');
  else if (qDelta != null && qDelta >= 3) modes.push('high-qdelta');
  else modes.push('p0-qdelta');
  modes.push(pressureScore > 0 ? 'pressure-row-unexpected-for-p0' : 'no-pressure');
  if (relation.xiangtingRelation) modes.push(`${relation.xiangtingRelation}-xiangting`);
  modes.push(bandForHardEvDelta(hardEvDelta));
  modes.push(bandForShapeDelta(shapeDelta));
  modes.push(tilePair.theme);
  modes.push(modelSignal.supportLevel);
  if (localXiangting === 0) modes.push('tenpai-choice');
  if (remaining != null && remaining <= 24) modes.push('late-turn');
  if (dangerDelta !== 0 && dangerDelta != null) modes.push('danger-nonzero-difference');

  const metricsTie = Math.abs(Number(hardEvDelta || 0)) <= 5
    && Math.abs(Number(shapeDelta || 0)) <= 3
    && Math.abs(Number(dangerDelta || 0)) <= 0;
  if (metricsTie && qDelta != null && qDelta > 2) modes.push('hard-metrics-near-tie-but-mortal-large');

  let primaryPattern = 'manual-route-review';
  let recommendedNextAction = 'manual-fixed-position-review';
  if (modelSignal.exactImprovementCount >= 2 && shapeDelta != null && shapeDelta <= -10) {
    primaryPattern = 'shape-and-model-consensus-support-mortal';
    recommendedNextAction = 'promote-to-deterministic-fixture-before-strategy-change';
  } else if (modelSignal.exactImprovementCount >= 2 && shapeDelta != null && shapeDelta >= 10) {
    primaryPattern = 'shape-overprotects-local-against-model-consensus';
    recommendedNextAction = 'inspect-shape-derived-features-before-any-retuning';
  } else if (hardEvDelta != null && hardEvDelta >= 100 && modelSignal.exactImprovementCount >= 1) {
    primaryPattern = 'hard-ev-local-bias-against-teacher';
    recommendedNextAction = 'inspect-hard-ev-feature-gap-and-add-fixture';
  } else if (metricsTie) {
    primaryPattern = 'missing-runtime-feature-or-route-signal';
    recommendedNextAction = 'inspect-fixed-state-for-route-features-not-in-candidates';
  } else if (modelSignal.exactImprovementCount === 1) {
    primaryPattern = 'single-model-support-high-q-review';
    recommendedNextAction = 'manual-review-before-fixture';
  } else if (localClass === 'honor' || mortalClass === 'honor') {
    primaryPattern = 'honor-route-ordering-review';
    recommendedNextAction = 'inspect-yakuhai-round-wind-seat-wind-and-visible-counts';
  }

  return {
    primaryPattern,
    recommendedNextAction,
    modes: Array.from(new Set(modes.filter(Boolean))),
    modelSignal,
    tilePair: {
      localClass,
      mortalClass,
      pair: tilePair.pair,
      theme: tilePair.theme
    },
    metricBands: {
      hardEvDeltaBand: bandForHardEvDelta(hardEvDelta),
      shapeDeltaBand: bandForShapeDelta(shapeDelta),
      hardEvDelta: roundMetric(hardEvDelta),
      shapeDelta: roundMetric(shapeDelta),
      dangerDelta: roundMetric(dangerDelta),
      safetyRankDelta: roundMetric(relation.safetyRankDelta)
    }
  };
}

function isP0LikelyBad(row = null) {
  return row
    && row.autoAdjudication
    && row.autoAdjudication.reviewPriority === 'P0'
    && row.autoAdjudication.label === 'hard-likely-bad-move';
}

function buildReviewRow(row = null) {
  const classification = classifyP0ReviewRow(row);
  return {
    id: row.id || null,
    seed: numberOrNull(row.seed),
    targetSeat: row.targetSeat || null,
    roundIndex: numberOrNull(row.roundIndex),
    bucket: row.bucket || null,
    qDelta: numberOrNull(row.qDelta),
    qBand: row.qBand || null,
    pressureScore: numberOrNull(row.pressureScore) || 0,
    remaining: numberOrNull(row.remaining),
    localTile: row.localDecision && row.localDecision.tileCode || null,
    mortalTile: row.bestMortalCandidate && row.bestMortalCandidate.tileCode || null,
    relation: clone(row.relation || null),
    autoAdjudication: clone(row.autoAdjudication || null),
    classification,
    localCandidate: compactReviewCandidate(row.localCandidate),
    mortalCandidate: compactReviewCandidate(row.mortalCandidate),
    candidateTable: compactCandidateTable(row),
    fixedState: clone(row.fixedState || null),
    adjudication: {
      status: 'unreviewed',
      manualReviewRequired: true,
      suggestedPrimaryPattern: classification.primaryPattern,
      suggestedNextAction: classification.recommendedNextAction,
      humanLabel: null,
      notes: []
    }
  };
}

function summarizeReviewRows(rows = []) {
  const summary = {
    total: rows.length,
    byPrimaryPattern: {},
    byModelSupport: {},
    byTilePairTheme: {},
    byHardEvDeltaBand: {},
    byShapeDeltaBand: {},
    byXiangtingRelation: {},
    veryHighQDeltaRows: [],
    modelConsensusRows: [],
    missingFeatureRows: [],
    fixtureFirstRows: []
  };

  rows.forEach((row) => {
    const classification = row.classification || {};
    increment(summary.byPrimaryPattern, classification.primaryPattern);
    increment(summary.byModelSupport, classification.modelSignal && classification.modelSignal.supportLevel);
    increment(summary.byTilePairTheme, classification.tilePair && classification.tilePair.theme);
    increment(summary.byHardEvDeltaBand, classification.metricBands && classification.metricBands.hardEvDeltaBand);
    increment(summary.byShapeDeltaBand, classification.metricBands && classification.metricBands.shapeDeltaBand);
    increment(summary.byXiangtingRelation, row.relation && row.relation.xiangtingRelation);
  });

  const compact = (row) => ({
    id: row.id,
    qDelta: row.qDelta,
    localTile: row.localTile,
    mortalTile: row.mortalTile,
    primaryPattern: row.classification && row.classification.primaryPattern,
    modelSupport: row.classification && row.classification.modelSignal && row.classification.modelSignal.supportLevel,
    metricBands: row.classification && row.classification.metricBands,
    tilePair: row.classification && row.classification.tilePair
  });
  const byQDesc = (left, right) => Number(right.qDelta || 0) - Number(left.qDelta || 0);
  summary.veryHighQDeltaRows = rows
    .filter((row) => Number(row.qDelta || 0) >= 4)
    .sort(byQDesc)
    .map(compact);
  summary.modelConsensusRows = rows
    .filter((row) => row.classification && row.classification.modelSignal && row.classification.modelSignal.exactImprovementCount >= 2)
    .sort(byQDesc)
    .map(compact);
  summary.missingFeatureRows = rows
    .filter((row) => row.classification && row.classification.primaryPattern === 'missing-runtime-feature-or-route-signal')
    .sort(byQDesc)
    .map(compact);
  summary.fixtureFirstRows = rows
    .filter((row) => row.classification && row.classification.recommendedNextAction === 'promote-to-deterministic-fixture-before-strategy-change')
    .sort(byQDesc)
    .map(compact);
  return summary;
}

function buildP0LikelyBadReview(adjudicated = null, options = {}) {
  const rows = (adjudicated && Array.isArray(adjudicated.rows) ? adjudicated.rows : [])
    .filter(isP0LikelyBad)
    .map(buildReviewRow)
    .sort((left, right) => Number(right.qDelta || 0) - Number(left.qDelta || 0));
  return {
    source: 'hard-p0-likely-bad-review',
    generatedAt: Date.now(),
    inputPath: options.inputPath || null,
    sourceAdjudication: adjudicated ? {
      source: adjudicated.source || null,
      inputPath: adjudicated.inputPath || null,
      policy: clone(adjudicated.policy || null),
      summary: clone(adjudicated.summary || null)
    } : null,
    filters: {
      autoLabel: 'hard-likely-bad-move',
      reviewPriority: 'P0',
      note: 'This is a fixed-position review queue. It does not prove a strategy change by itself.'
    },
    summary: summarizeReviewRows(rows),
    rows
  };
}

function parseArgs(argv = []) {
  const args = {
    help: false,
    input: DEFAULT_ADJUDICATED_PATH,
    out: DEFAULT_OUT_PATH,
    stdout: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }
    if (token === '--input' || token === '--adjudicated') {
      args.input = String(argv[index + 1] || '').trim() || args.input;
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
  console.log('Usage: node games/majiang/scripts/analyze-hard-p0-likely-bad-review.js [options]');
  console.log('');
  console.log('Options:');
  console.log('  --input <path>       Input auto-adjudicated corpus. Default: /tmp/h13h-hard-disagreement-adjudication-labeled.json');
  console.log('  --adjudicated <path> Alias for --input.');
  console.log('  --out <path>         Output P0 review JSON. Default: /tmp/h13h-p0-likely-bad-review.json');
  console.log('  --stdout             Also print full JSON.');
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
  const adjudicated = readJson(args.input);
  const review = buildP0LikelyBadReview(adjudicated, {
    inputPath: path.resolve(args.input)
  });
  const output = JSON.stringify(review, null, 2);
  if (args.out) fs.writeFileSync(path.resolve(args.out), output.concat('\n'), 'utf8');
  if (args.stdout || !args.out) {
    console.log(output);
  } else {
    console.log(JSON.stringify({
      out: path.resolve(args.out),
      summary: review.summary
    }, null, 2));
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  DEFAULT_ADJUDICATED_PATH,
  DEFAULT_OUT_PATH,
  tileClass,
  modelSignalSummary,
  classifyTilePair,
  classifyP0ReviewRow,
  isP0LikelyBad,
  buildReviewRow,
  summarizeReviewRows,
  buildP0LikelyBadReview,
  parseArgs
};
