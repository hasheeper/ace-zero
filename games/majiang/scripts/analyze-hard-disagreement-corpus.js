'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_REPORT_PATH = '/tmp/h13e-scale80-heldout-hard-vs-mortal-report.json';
const DEFAULT_OUT_PATH = '/tmp/h13h-hard-disagreement-adjudication-corpus.json';
const DEFAULT_MORTAL_CONFIG_PATH = '/Users/liuhang/Documents/Mortal/mortal/config.real.toml';
const DEFAULT_PREDICTION_PATHS = [
  '/tmp/h13g-native-ranker-predictions/runtime-safe-native-v1-predictions.json',
  '/tmp/h13g-native-ranker-predictions/runtime-safe-native-no-shape-predictions.json'
];

const NORMAL_Q_MAX = 0.15;
const REVIEW_Q_MAX = 1.0;

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

function normalizeTileCode(tileCode) {
  if (typeof tileCode !== 'string' || !tileCode) return null;
  const normalized = String(tileCode).replace(/[\*_\+\=\-]+$/g, '');
  const redMatch = normalized.match(/^([mps])0$/);
  if (redMatch) return `${redMatch[1]}5`;
  return normalized;
}

function getTileClass(tileCode) {
  const normalized = normalizeTileCode(tileCode);
  const match = normalized ? normalized.match(/^([mpsz])(\d)$/) : null;
  if (!match) return 'unknown';
  const suit = match[1];
  const rank = Number(match[2]);
  if (suit === 'z') return 'honor';
  if (rank === 1 || rank === 9) return 'terminal';
  if (rank === 2 || rank === 8) return 'edge-2/8';
  if (rank === 5) return 'five';
  return 'middle-3/7';
}

function getBucket(row = null) {
  const tags = row && Array.isArray(row.tags) ? row.tags : [];
  return tags.find((tag) => (
    tag === 'tile-choice'
    || tag === 'tile-defense'
    || tag === 'riichi-missed'
    || tag === 'riichi-overpush'
    || tag === 'missing-mortal'
    || tag === 'exact-match'
    || tag === 'action-type'
  )) || (row && row.judgment && row.judgment.bucket) || 'unknown';
}

function increment(map, key, amount = 1) {
  const resolved = key || 'unknown';
  map[resolved] = (map[resolved] || 0) + amount;
}

function qDeltaOf(row = null) {
  const local = row && row.localMortalCandidate ? numberOrNull(row.localMortalCandidate.qDeltaFromBest) : null;
  if (local != null) return local;
  return row && row.mortalSeverity ? numberOrNull(row.mortalSeverity.qDelta) : null;
}

function bandForQDelta(qDelta) {
  const value = numberOrNull(qDelta);
  if (value == null) return 'unknown';
  if (value <= NORMAL_Q_MAX) return 'normal';
  if (value <= REVIEW_Q_MAX) return 'review';
  return 'serious-suspect';
}

function isEligibleDisagreementRow(row = null, options = {}) {
  if (!row || row.kind !== 'discard') return false;
  if (!row.localDecision || row.localDecision.type !== 'discard') return false;
  if (!row.bestMortalCandidate || row.bestMortalCandidate.actionType !== 'discard') return false;
  if (!row.localMortalCandidate) return false;
  if (normalizeTileCode(row.localDecision.tileCode) === normalizeTileCode(row.bestMortalCandidate.tileCode)) return false;
  const band = bandForQDelta(qDeltaOf(row));
  return options.includeNormal ? band !== 'unknown' : band === 'review' || band === 'serious-suspect';
}

function findHardCandidate(row = null, tileCode = null) {
  const normalized = normalizeTileCode(tileCode);
  if (!normalized || !row || !Array.isArray(row.hardCandidateDiagnostics)) return null;
  return row.hardCandidateDiagnostics.find((candidate) => (
    candidate && normalizeTileCode(candidate.tileCode) === normalized
  )) || null;
}

function findSelectedHardCandidate(row = null) {
  if (!row || !Array.isArray(row.hardCandidateDiagnostics)) return null;
  return row.hardCandidateDiagnostics.find((candidate) => candidate && candidate.selectedFinal) || null;
}

function findMortalCandidate(row = null, tileCode = null) {
  const normalized = normalizeTileCode(tileCode);
  if (!normalized || !row || !Array.isArray(row.mortalCandidates)) return null;
  return row.mortalCandidates.find((candidate) => (
    candidate
    && candidate.actionType === 'discard'
    && normalizeTileCode(candidate.normalizedTileCode || candidate.tileCode) === normalized
  )) || null;
}

function compactCandidate(candidate = null) {
  if (!candidate || typeof candidate !== 'object') return null;
  const metrics = candidate.metrics || {};
  const hardMetrics = candidate.hardMetrics || {};
  const danger = candidate.danger || {};
  const shape = candidate.shape || {};
  return {
    tileCode: candidate.tileCode || null,
    normalizedTileCode: normalizeTileCode(candidate.tileCode),
    tileIndex: numberOrNull(candidate.tileIndex),
    tileClass: getTileClass(candidate.tileCode),
    isDrawDiscard: Boolean(candidate.isDrawDiscard),
    selectedInitial: Boolean(candidate.selectedInitial),
    selectedFinal: Boolean(candidate.selectedFinal),
    metrics: {
      xiangting: numberOrNull(metrics.xiangting),
      tingpaiCount: numberOrNull(metrics.tingpaiCount),
      ukeireCount: numberOrNull(metrics.ukeireCount),
      handValueEstimate: numberOrNull(metrics.handValueEstimate)
    },
    danger: {
      dangerScore: numberOrNull(danger.dangerScore),
      safetyRank: numberOrNull(danger.safetyRank),
      defenseTileRank: numberOrNull(danger.defenseTileRank),
      categories: Array.isArray(danger.categories) ? danger.categories.slice() : [],
      safetyReasons: Array.isArray(danger.safetyReasons) ? danger.safetyReasons.slice() : []
    },
    hardMetrics: {
      hardEvScore: numberOrNull(hardMetrics.hardEvScore),
      liveUkeireCount: numberOrNull(hardMetrics.liveUkeireCount),
      liveTingpaiCount: numberOrNull(hardMetrics.liveTingpaiCount),
      waitQualityScore: numberOrNull(hardMetrics.waitQualityScore),
      bestWaitType: hardMetrics.bestWaitType || null,
      contextualHandValueEstimate: numberOrNull(hardMetrics.contextualHandValueEstimate)
    },
    shape: {
      discardShapeScore: numberOrNull(shape.discardShapeScore),
      discardTileRole: shape.discardTileRole || null,
      keptUsefulMiddleCount: numberOrNull(shape.keptUsefulMiddleCount),
      weakTerminalCleanupBonus: numberOrNull(shape.weakTerminalCleanupBonus),
      isolatedHonorCleanupBonus: numberOrNull(shape.isolatedHonorCleanupBonus),
      middleTileCutPenalty: numberOrNull(shape.middleTileCutPenalty),
      fiveOrRedFiveCutPenalty: numberOrNull(shape.fiveOrRedFiveCutPenalty),
      doraRetentionPenalty: numberOrNull(shape.doraRetentionPenalty),
      pairOrBlockBreakPenalty: numberOrNull(shape.pairOrBlockPenalty ?? shape.pairOrBlockBreakPenalty),
      reasons: Array.isArray(shape.reasons) ? shape.reasons.slice() : []
    }
  };
}

function compactCandidateWithMortal(row = null, candidate = null) {
  const compact = compactCandidate(candidate);
  if (!compact) return null;
  const mortal = findMortalCandidate(row, candidate.tileCode);
  compact.mortal = mortal ? {
    actionIndex: numberOrNull(mortal.actionIndex),
    qValue: numberOrNull(mortal.qValue),
    qDeltaFromBest: numberOrNull(mortal.qDeltaFromBest),
    isBest: Boolean(mortal.isBest)
  } : null;
  return compact;
}

function compactFixedState(row = null) {
  const context = row && row.decisionContext ? row.decisionContext : null;
  if (!context || typeof context !== 'object') return null;
  return {
    seat: context.seat || null,
    phase: context.phase || null,
    turnSeat: context.turnSeat || null,
    remaining: numberOrNull(context.remaining),
    doraIndicators: Array.isArray(context.doraIndicators) ? context.doraIndicators.slice() : [],
    scores: context.scores && typeof context.scores === 'object' ? clone(context.scores) : null,
    round: context.round && typeof context.round === 'object' ? clone(context.round) : null,
    seats: context.seats && typeof context.seats === 'object' ? clone(context.seats) : null,
    discardCandidates: Array.isArray(context.discardCandidates) ? context.discardCandidates.map((candidate) => ({
      tileCode: candidate.tileCode || null,
      tileIndex: numberOrNull(candidate.tileIndex),
      isDrawDiscard: Boolean(candidate.isDrawDiscard),
      selectedFinal: Boolean(candidate.selectedFinal),
      xiangting: numberOrNull(candidate.xiangting),
      hardEvScore: numberOrNull(candidate.hardEvScore),
      dangerScore: numberOrNull(candidate.dangerScore),
      shapeScore: numberOrNull(candidate.shapeScore),
      shapeRole: candidate.shapeRole || null
    })) : [],
    localDiscard: context.localDiscard && typeof context.localDiscard === 'object' ? clone(context.localDiscard) : null
  };
}

function relationFor(localCandidate = null, mortalCandidate = null) {
  const relation = {
    xiangtingRelation: 'unknown',
    hardEvDelta: null,
    shapeDelta: null,
    dangerDelta: null,
    safetyRankDelta: null
  };
  if (!localCandidate || !mortalCandidate) return relation;

  const localX = numberOrNull(localCandidate.metrics && localCandidate.metrics.xiangting);
  const mortalX = numberOrNull(mortalCandidate.metrics && mortalCandidate.metrics.xiangting);
  if (localX != null && mortalX != null) {
    relation.xiangtingRelation = mortalX === localX
      ? 'same'
      : mortalX > localX
      ? 'mortal-worse'
      : 'mortal-better';
  }
  const localEv = numberOrNull(localCandidate.hardMetrics && localCandidate.hardMetrics.hardEvScore);
  const mortalEv = numberOrNull(mortalCandidate.hardMetrics && mortalCandidate.hardMetrics.hardEvScore);
  if (localEv != null && mortalEv != null) relation.hardEvDelta = roundMetric(localEv - mortalEv);
  const localShape = numberOrNull(localCandidate.shape && localCandidate.shape.discardShapeScore);
  const mortalShape = numberOrNull(mortalCandidate.shape && mortalCandidate.shape.discardShapeScore);
  if (localShape != null && mortalShape != null) relation.shapeDelta = roundMetric(localShape - mortalShape);
  const localDanger = numberOrNull(localCandidate.danger && localCandidate.danger.dangerScore);
  const mortalDanger = numberOrNull(mortalCandidate.danger && mortalCandidate.danger.dangerScore);
  if (localDanger != null && mortalDanger != null) relation.dangerDelta = roundMetric(localDanger - mortalDanger);
  const localSafety = numberOrNull(localCandidate.danger && localCandidate.danger.safetyRank);
  const mortalSafety = numberOrNull(mortalCandidate.danger && mortalCandidate.danger.safetyRank);
  if (localSafety != null && mortalSafety != null) relation.safetyRankDelta = roundMetric(localSafety - mortalSafety);
  return relation;
}

function buildTriageTags(row = null, relation = {}) {
  const tags = [];
  const qDelta = qDeltaOf(row);
  const band = bandForQDelta(qDelta);
  const bucket = getBucket(row);
  const pressureScore = numberOrNull(row && row.pushFoldState && row.pushFoldState.pressureScore) || 0;
  tags.push(band);
  tags.push(bucket);
  tags.push(pressureScore > 0 ? 'pressure' : 'no-pressure');
  if (Number(qDelta) > 2) tags.push('top-serious-qdelta');
  if (relation.xiangtingRelation !== 'unknown') tags.push(`${relation.xiangtingRelation}-xiangting`);
  if (relation.hardEvDelta != null && relation.hardEvDelta >= 100) tags.push('hard-ev-prefers-local>=100');
  if (relation.hardEvDelta != null && relation.hardEvDelta <= -100) tags.push('hard-ev-prefers-mortal>=100');
  if (relation.shapeDelta != null && relation.shapeDelta >= 10) tags.push('shape-prefers-local>=10');
  if (relation.shapeDelta != null && relation.shapeDelta <= -10) tags.push('shape-prefers-mortal>=10');
  if (bucket === 'tile-defense') tags.push('needs-defense-review');
  if (bucket === 'tile-choice' && pressureScore === 0) tags.push('no-pressure-tile-choice');
  return Array.from(new Set(tags.filter(Boolean)));
}

function suggestedReviewClass(row = null, relation = {}) {
  const qDelta = qDeltaOf(row);
  const bucket = getBucket(row);
  const pressureScore = numberOrNull(row && row.pushFoldState && row.pushFoldState.pressureScore) || 0;
  if (bucket === 'tile-defense' || pressureScore > 0) return 'defense-risk-review';
  if (Number(qDelta) > 2 && relation.xiangtingRelation === 'same') return 'same-xiangting-serious-suspect';
  if (Number(qDelta) > 1) return 'serious-suspect-review';
  return 'fixed-position-review';
}

function compactPredictionPick(pick = null) {
  if (!pick || typeof pick !== 'object') return null;
  return {
    tileCode: pick.tileCode || null,
    normalizedTileCode: normalizeTileCode(pick.normalizedTileCode || pick.tileCode),
    prediction: numberOrNull(pick.prediction),
    mortalQValue: numberOrNull(pick.mortalQValue),
    qDeltaFromBest: numberOrNull(pick.qDeltaFromBest),
    severity: pick.severity || null,
    mortalRank: numberOrNull(pick.mortalRank),
    isMortalBest: Boolean(pick.isMortalBest)
  };
}

function compactPredictionRow(row = null) {
  if (!row || typeof row !== 'object') return null;
  return {
    stateId: row.stateId || null,
    changed: Boolean(row.changed),
    predictionMargin: numberOrNull(row.predictionMargin),
    qDeltaChange: numberOrNull(row.qDeltaChange),
    exactImprovement: Boolean(row.currentHard && row.currentHard.isMortalBest === false && row.model && row.model.isMortalBest === true),
    hardExactRegression: Boolean(row.currentHard && row.currentHard.isMortalBest === true && row.model && row.model.isMortalBest === false),
    currentHard: compactPredictionPick(row.currentHard),
    model: compactPredictionPick(row.model),
    mortalBest: compactPredictionPick(row.mortalBest)
  };
}

function loadPredictionMaps(predictionPaths = []) {
  const maps = {};
  predictionPaths.forEach((predictionPath) => {
    if (!predictionPath || !fs.existsSync(path.resolve(predictionPath))) return;
    const json = JSON.parse(fs.readFileSync(path.resolve(predictionPath), 'utf8'));
    const name = path.basename(predictionPath).replace(/-predictions\.json$/, '');
    const rows = Array.isArray(json.rows) ? json.rows : [];
    maps[name] = {
      path: path.resolve(predictionPath),
      rows: new Map(rows.map((row) => [row.stateId || row.rowId, row]))
    };
  });
  return maps;
}

function predictionSignalsFor(stateId, predictionMaps = {}) {
  const signals = {};
  Object.entries(predictionMaps).forEach(([name, entry]) => {
    signals[name] = compactPredictionRow(entry.rows.get(stateId) || null);
  });
  return signals;
}

function parseMortalConfig(configPath = DEFAULT_MORTAL_CONFIG_PATH) {
  if (!configPath || !fs.existsSync(path.resolve(configPath))) {
    return {
      configPath: configPath ? path.resolve(configPath) : null,
      stateFile: null,
      bestStateFile: null,
      exists: false
    };
  }
  const raw = fs.readFileSync(path.resolve(configPath), 'utf8');
  const stateMatch = raw.match(/^\s*state_file\s*=\s*['"]([^'"]+)['"]/m);
  const bestMatch = raw.match(/^\s*best_state_file\s*=\s*['"]([^'"]+)['"]/m);
  return {
    configPath: path.resolve(configPath),
    stateFile: stateMatch ? stateMatch[1] : null,
    bestStateFile: bestMatch ? bestMatch[1] : null,
    exists: true
  };
}

function buildDisagreementCorpus(report, options = {}) {
  const predictionMaps = options.predictionMaps || loadPredictionMaps(options.predictionPaths || []);
  const rows = (report && Array.isArray(report.rows) ? report.rows : [])
    .filter((row) => isEligibleDisagreementRow(row, { includeNormal: Boolean(options.includeNormal) }))
    .map((row) => {
      const localTile = row.localDecision && row.localDecision.tileCode;
      const mortalTile = row.bestMortalCandidate && row.bestMortalCandidate.tileCode;
      const localCandidate = findSelectedHardCandidate(row) || findHardCandidate(row, localTile);
      const mortalCandidate = findHardCandidate(row, mortalTile);
      const compactLocal = compactCandidateWithMortal(row, localCandidate);
      const compactMortal = compactCandidateWithMortal(row, mortalCandidate);
      const relation = relationFor(compactLocal, compactMortal);
      const qDelta = qDeltaOf(row);
      const band = bandForQDelta(qDelta);
      const triageTags = buildTriageTags(row, relation);
      return {
        id: row.id || null,
        seed: numberOrNull(row.seed),
        targetSeat: row.targetSeat || null,
        roundIndex: row.round && numberOrNull(row.round.roundIndex),
        bucket: getBucket(row),
        qDelta: numberOrNull(qDelta),
        qBand: band,
        mortalSeverity: clone(row.mortalSeverity || null),
        pressureState: row.pushFoldState && row.pushFoldState.state || null,
        pressureScore: numberOrNull(row.pushFoldState && row.pushFoldState.pressureScore) || 0,
        localXiangting: numberOrNull(row.metrics && row.metrics.xiangting),
        remaining: numberOrNull(row.decisionContext && row.decisionContext.remaining),
        localDecision: clone(row.localDecision || null),
        mortalDecision: clone(row.coachDecision || row.mortalCoachDecision || null),
        localMortalCandidate: clone(row.localMortalCandidate || null),
        bestMortalCandidate: clone(row.bestMortalCandidate || null),
        localCandidate: compactLocal,
        mortalCandidate: compactMortal,
        relation,
        triageTags,
        suggestedReviewClass: suggestedReviewClass(row, relation),
        fixedState: compactFixedState(row),
        candidateTable: Array.isArray(row.hardCandidateDiagnostics)
          ? row.hardCandidateDiagnostics.map((candidate) => compactCandidateWithMortal(row, candidate)).filter(Boolean)
          : [],
        modelSignals: predictionSignalsFor(row.id, predictionMaps),
        adjudication: {
          status: 'unreviewed',
          label: null,
          labelOptions: [
            'normal-disagreement',
            'mortal-preference-acceptable',
            'hard-suspect-mistake',
            'hard-likely-bad-move',
            'defense-tradeoff-review',
            'route-backstep-review',
            'insufficient-context'
          ],
          reviewer: null,
          reviewedAt: null,
          notes: []
        }
      };
    });

  const summary = summarizeDisagreementRows(rows, {
    sourceRows: report && Array.isArray(report.rows) ? report.rows : [],
    includeNormal: Boolean(options.includeNormal)
  });

  return {
    source: 'hard-disagreement-adjudication-corpus',
    generatedAt: Date.now(),
    reportPath: options.reportPath || null,
    predictionPaths: Object.values(predictionMaps).map((entry) => entry.path),
    mortalTeacher: parseMortalConfig(options.mortalConfigPath || DEFAULT_MORTAL_CONFIG_PATH),
    filters: {
      kind: 'discard',
      action: 'local-discard-vs-mortal-discard',
      includeNormal: Boolean(options.includeNormal),
      defaultQBands: options.includeNormal ? ['normal', 'review', 'serious-suspect'] : ['review', 'serious-suspect']
    },
    summary,
    rows
  };
}

function summarizeDisagreementRows(rows = [], options = {}) {
  const summary = {
    total: rows.length,
    sourceRows: Array.isArray(options.sourceRows) ? options.sourceRows.length : 0,
    includedNormal: Boolean(options.includeNormal),
    qBandCounts: {},
    bucketCounts: {},
    pressureCounts: {},
    xiangtingRelationCounts: {},
    suggestedReviewClassCounts: {},
    modelSignalCounts: {},
    topQDeltaRows: []
  };
  rows.forEach((row) => {
    increment(summary.qBandCounts, row.qBand);
    increment(summary.bucketCounts, row.bucket);
    increment(summary.pressureCounts, row.pressureScore > 0 ? 'pressure' : 'no-pressure');
    increment(summary.xiangtingRelationCounts, row.relation && row.relation.xiangtingRelation);
    increment(summary.suggestedReviewClassCounts, row.suggestedReviewClass);
    Object.entries(row.modelSignals || {}).forEach(([name, signal]) => {
      if (!summary.modelSignalCounts[name]) {
        summary.modelSignalCounts[name] = {
          exactImprovement: 0,
          hardExactRegression: 0,
          changed: 0,
          same: 0
        };
      }
      if (signal && signal.exactImprovement) summary.modelSignalCounts[name].exactImprovement += 1;
      if (signal && signal.hardExactRegression) summary.modelSignalCounts[name].hardExactRegression += 1;
      if (signal && signal.changed) summary.modelSignalCounts[name].changed += 1;
      if (signal && !signal.changed) summary.modelSignalCounts[name].same += 1;
    });
  });
  summary.topQDeltaRows = rows
    .slice()
    .sort((left, right) => Number(right.qDelta || 0) - Number(left.qDelta || 0))
    .slice(0, 20)
    .map((row) => ({
      id: row.id,
      bucket: row.bucket,
      qDelta: row.qDelta,
      qBand: row.qBand,
      localTile: row.localDecision && row.localDecision.tileCode,
      mortalTile: row.bestMortalCandidate && row.bestMortalCandidate.tileCode,
      relation: row.relation,
      suggestedReviewClass: row.suggestedReviewClass
    }));
  return summary;
}

function parseArgs(argv = []) {
  const args = {
    help: false,
    report: DEFAULT_REPORT_PATH,
    out: DEFAULT_OUT_PATH,
    predictions: DEFAULT_PREDICTION_PATHS.slice(),
    mortalConfig: DEFAULT_MORTAL_CONFIG_PATH,
    includeNormal: false,
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
    if (token === '--prediction') {
      args.predictions.push(String(argv[index + 1] || '').trim());
      index += 1;
      continue;
    }
    if (token === '--predictions') {
      args.predictions = String(argv[index + 1] || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      index += 1;
      continue;
    }
    if (token === '--no-default-predictions') {
      args.predictions = [];
      continue;
    }
    if (token === '--mortal-config') {
      args.mortalConfig = String(argv[index + 1] || '').trim() || args.mortalConfig;
      index += 1;
      continue;
    }
    if (token === '--include-normal') {
      args.includeNormal = true;
      continue;
    }
    if (token === '--stdout') {
      args.stdout = true;
    }
  }
  args.predictions = Array.from(new Set(args.predictions.filter(Boolean)));
  return args;
}

function printHelp() {
  console.log('Usage: node games/majiang/scripts/analyze-hard-disagreement-corpus.js [options]');
  console.log('');
  console.log('Options:');
  console.log('  --report <path>           Input Hard vs Mortal report. Default: /tmp/h13e-scale80-heldout-hard-vs-mortal-report.json');
  console.log('  --out <path>              Output corpus JSON. Default: /tmp/h13h-hard-disagreement-adjudication-corpus.json');
  console.log('  --predictions <a,b>       Comma-separated prediction JSON files.');
  console.log('  --prediction <path>       Add one prediction JSON file.');
  console.log('  --no-default-predictions  Do not load default H13g prediction files.');
  console.log('  --mortal-config <path>    Mortal TOML config for teacher provenance.');
  console.log('  --include-normal          Include qDelta <= 0.15 normal disagreements.');
  console.log('  --stdout                  Also print full corpus JSON.');
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
  const report = readJson(args.report);
  const corpus = buildDisagreementCorpus(report, {
    reportPath: path.resolve(args.report),
    predictionPaths: args.predictions,
    mortalConfigPath: args.mortalConfig,
    includeNormal: args.includeNormal
  });
  const output = JSON.stringify(corpus, null, 2);
  if (args.out) fs.writeFileSync(path.resolve(args.out), output.concat('\n'), 'utf8');
  if (args.stdout || !args.out) {
    console.log(output);
  } else {
    console.log(JSON.stringify({
      out: path.resolve(args.out),
      summary: corpus.summary,
      mortalTeacher: corpus.mortalTeacher
    }, null, 2));
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  DEFAULT_REPORT_PATH,
  DEFAULT_OUT_PATH,
  DEFAULT_MORTAL_CONFIG_PATH,
  DEFAULT_PREDICTION_PATHS,
  NORMAL_Q_MAX,
  REVIEW_Q_MAX,
  normalizeTileCode,
  getBucket,
  qDeltaOf,
  bandForQDelta,
  isEligibleDisagreementRow,
  compactCandidate,
  compactFixedState,
  relationFor,
  buildTriageTags,
  suggestedReviewClass,
  compactPredictionRow,
  loadPredictionMaps,
  parseMortalConfig,
  buildDisagreementCorpus,
  summarizeDisagreementRows,
  parseArgs
};
