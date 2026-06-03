'use strict';

const fs = require('fs');
const path = require('path');

const discardRankingApi = require('../engine/ai/support/discard-ranking');
const arenaApi = require('./benchmark-ai-hanchan-arena');

const DEFAULT_POOL_PATH = '/tmp/h14-p1-hard-ai-repair-candidates.json';
const DEFAULT_OUT_PATH = '/tmp/h14-p4-tile-choice-replay.json';
const TILE_CHOICE_OVERLAY = 'no-pressure-same-xiangting-rerank-v1';

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function numberOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeTileCode(tileCode) {
  if (typeof tileCode !== 'string' || !tileCode) return null;
  return String(tileCode)
    .replace(/[\*_\+\=\-]+$/g, '')
    .replace(/^([mps])0$/, (_, suit) => `${suit}5`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(path.resolve(filePath), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function parseArgs(argv = []) {
  const args = {
    help: false,
    pool: DEFAULT_POOL_PATH,
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
      args.pool = String(argv[index + 1] || '').trim() || args.pool;
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
  console.log('Usage: node games/majiang/scripts/replay-hard-ai-tile-choice-candidates.js [options]');
  console.log('');
  console.log('Options:');
  console.log('  --pool <path>   H14 P1 repair candidate pool. Default: /tmp/h14-p1-hard-ai-repair-candidates.json');
  console.log('  --out <path>    Output path. Default: /tmp/h14-p4-tile-choice-replay.json');
  console.log('  --stdout        Also print full JSON.');
}

function attachShapeMetrics(decision) {
  if (!decision || !decision.shape) return decision;
  Object.defineProperty(decision, '__hardShapeMetrics', {
    value: decision.shape,
    enumerable: false,
    configurable: true
  });
  return decision;
}

function compactDecision(decision = null) {
  if (!decision || typeof decision !== 'object') return null;
  return {
    tileCode: decision.tileCode || null,
    normalizedTileCode: normalizeTileCode(decision.normalizedTileCode || decision.tileCode),
    tileIndex: numberOrNull(decision.tileIndex),
    selectedFinal: Boolean(decision.selectedFinal),
    metrics: decision.metrics ? {
      xiangting: numberOrNull(decision.metrics.xiangting),
      tingpaiCount: numberOrNull(decision.metrics.tingpaiCount),
      ukeireCount: numberOrNull(decision.metrics.ukeireCount),
      handValueEstimate: numberOrNull(decision.metrics.handValueEstimate)
    } : null,
    danger: decision.danger ? {
      dangerScore: numberOrNull(decision.danger.dangerScore),
      safetyRank: numberOrNull(decision.danger.safetyRank),
      defenseTileRank: numberOrNull(decision.danger.defenseTileRank),
      categories: Array.isArray(decision.danger.categories) ? decision.danger.categories.slice() : [],
      safetyReasons: Array.isArray(decision.danger.safetyReasons) ? decision.danger.safetyReasons.slice() : []
    } : null,
    hardMetrics: decision.hardMetrics ? {
      hardEvScore: numberOrNull(decision.hardMetrics.hardEvScore),
      liveUkeireCount: numberOrNull(decision.hardMetrics.liveUkeireCount),
      liveTingpaiCount: numberOrNull(decision.hardMetrics.liveTingpaiCount),
      waitQualityScore: numberOrNull(decision.hardMetrics.waitQualityScore),
      bestWaitType: decision.hardMetrics.bestWaitType || null,
      contextualHandValueEstimate: numberOrNull(decision.hardMetrics.contextualHandValueEstimate)
    } : null,
    shape: decision.shape ? {
      discardShapeScore: numberOrNull(decision.shape.discardShapeScore),
      discardTileRole: decision.shape.discardTileRole || null,
      reasons: Array.isArray(decision.shape.reasons) ? decision.shape.reasons.slice() : []
    } : null,
    mortal: decision.mortal ? {
      qValue: numberOrNull(decision.mortal.qValue),
      qDeltaFromBest: numberOrNull(decision.mortal.qDeltaFromBest),
      isBest: Boolean(decision.mortal.isBest)
    } : null
  };
}

function uniqueCandidateTable(candidate = {}) {
  const rows = [];
  const seen = new Set();
  const push = (entry) => {
    if (!entry || typeof entry !== 'object') return;
    const normalized = normalizeTileCode(entry.tileCode || entry.normalizedTileCode);
    if (!normalized) return;
    const key = normalized;
    if (seen.has(key)) return;
    seen.add(key);
    const row = clone(entry);
    row.tileCode = row.tileCode || row.normalizedTileCode;
    row.normalizedTileCode = normalized;
    row.tileIndex = numberOr(row.tileIndex, rows.length);
    row.isDrawDiscard = Boolean(row.isDrawDiscard);
    rows.push(attachShapeMetrics(row));
  };
  (Array.isArray(candidate.candidateTable) ? candidate.candidateTable : []).forEach(push);
  push(candidate.localCandidate);
  push(candidate.mortalCandidate);
  return rows.filter((row) => row && row.metrics && row.hardMetrics);
}

function findCandidateByTile(candidates, tileCode) {
  const normalized = normalizeTileCode(tileCode);
  if (!normalized) return null;
  return (Array.isArray(candidates) ? candidates : []).find((candidate) => (
    candidate && normalizeTileCode(candidate.tileCode || candidate.normalizedTileCode) === normalized
  )) || null;
}

function isSameTile(left, right) {
  return normalizeTileCode(left) === normalizeTileCode(right);
}

function getXiangting(decision) {
  return numberOr(decision && decision.metrics && decision.metrics.xiangting, 99);
}

function getHardEvScore(decision) {
  return numberOr(decision && decision.hardMetrics && decision.hardMetrics.hardEvScore, 0);
}

function getShapeScore(decision) {
  return numberOr(decision && decision.shape && decision.shape.discardShapeScore, 0);
}

function getShapeRole(decision) {
  return decision && decision.shape && typeof decision.shape.discardTileRole === 'string'
    ? decision.shape.discardTileRole
    : '';
}

function isCleanupRole(decision) {
  const role = getShapeRole(decision);
  return role === 'isolated-terminal'
    || role === 'isolated-honor'
    || role === 'weak-floating';
}

function isProtectedCutRole(decision) {
  const role = getShapeRole(decision);
  return role === 'floating-middle'
    || role === 'useful-middle'
    || role === 'useful-five'
    || role === 'floating-five'
    || role === 'edge-block';
}

function getModelSupport(candidate = {}) {
  const support = candidate.classification
    && candidate.classification.modelSignal
    && candidate.classification.modelSignal.supportLevel;
  if (support) return support;
  const count = Number(candidate.modelSignal && candidate.modelSignal.exactImprovementCount);
  if (count >= 2) return 'both-native-support-mortal';
  if (count === 1) return 'one-native-supports-mortal';
  return candidate.modelSignal && candidate.modelSignal.supportLevel || 'no-native-support';
}

function selectBestWithPolicy(table, policy, pressureScore) {
  const pushFoldState = {
    state: pressureScore > 0 ? 'careful' : 'neutral',
    pressureScore,
    reasons: pressureScore > 0 ? ['repair-candidate-pressure'] : []
  };
  return discardRankingApi.selectBestDiscardDecision(table, {
    difficulty: 'hard',
    hardDiscardPolicy: policy && policy.discard ? policy.discard : {},
    pushFoldState
  });
}

function createBasePolicy() {
  return arenaApi.createTunedHardPolicy();
}

function createOverlayPolicy() {
  return arenaApi.createExperimentalHardPolicy({
    experimentalOverlays: [TILE_CHOICE_OVERLAY]
  });
}

function classifyReplay(candidate, details) {
  const {
    pressureScore,
    localCandidate,
    teacherCandidate,
    tunedCandidate,
    experimentalCandidate,
    modelSupport,
    shapeDelta,
    hardEvLoss
  } = details;
  const relation = candidate.relation || {};
  const modes = candidate.classification && Array.isArray(candidate.classification.modes)
    ? candidate.classification.modes
    : [];
  const primaryPattern = candidate.classification && candidate.classification.primaryPattern || '';

  if (!localCandidate || !teacherCandidate || !tunedCandidate || !experimentalCandidate) return 'manual-review-only';
  if (relation.xiangtingRelation === 'mortal-worse' || getXiangting(teacherCandidate) > getXiangting(tunedCandidate)) {
    return 'teacher-backstep-excluded';
  }
  if (pressureScore !== 0) return 'manual-review-only';
  if (getXiangting(tunedCandidate) === 0 || getXiangting(teacherCandidate) === 0) return 'tenpai-route-manual-review';
  if (isSameTile(tunedCandidate.tileCode, teacherCandidate.tileCode)) return 'already-fixed-by-current-hard';
  if (hardEvLoss > 60) return 'hard-ev-too-far';
  if (
    isSameTile(experimentalCandidate.tileCode, teacherCandidate.tileCode)
    && (modelSupport === 'both-native-support-mortal' || modelSupport === 'one-native-supports-mortal')
  ) {
    return 'patch-eligible-model-consensus';
  }
  if (
    isSameTile(experimentalCandidate.tileCode, teacherCandidate.tileCode)
    && isCleanupRole(experimentalCandidate)
    && isProtectedCutRole(tunedCandidate)
    && shapeDelta >= 14
  ) {
    return 'patch-eligible-cleanup-vs-middle';
  }
  if (primaryPattern === 'missing-runtime-feature-or-route-signal' || modes.includes('tile-route-choice')) {
    return 'route-feature-missing';
  }
  return 'manual-review-only';
}

function replayTileChoiceCandidate(candidate = {}, options = {}) {
  const table = uniqueCandidateTable(candidate);
  const localTile = candidate.currentHard && candidate.currentHard.tileCode
    || candidate.localDecision && candidate.localDecision.tileCode;
  const teacherTile = candidate.teacher && candidate.teacher.tileCode
    || candidate.mortalDecision && candidate.mortalDecision.tileCode;
  const localCandidate = findCandidateByTile(table, localTile) || candidate.localCandidate || null;
  const teacherCandidate = findCandidateByTile(table, teacherTile) || candidate.mortalCandidate || null;
  const pressureScore = numberOr(candidate.pressureScore, 0);
  const basePolicy = options.basePolicy || createBasePolicy();
  const overlayPolicy = options.overlayPolicy || createOverlayPolicy();
  const tunedCandidate = selectBestWithPolicy(table, basePolicy, pressureScore);
  const experimentalCandidate = selectBestWithPolicy(table, overlayPolicy, pressureScore);
  const modelSupport = getModelSupport(candidate);
  const shapeDelta = teacherCandidate && tunedCandidate ? getShapeScore(teacherCandidate) - getShapeScore(tunedCandidate) : null;
  const hardEvLoss = teacherCandidate && tunedCandidate ? getHardEvScore(tunedCandidate) - getHardEvScore(teacherCandidate) : null;
  const classification = classifyReplay(candidate, {
    pressureScore,
    localCandidate,
    teacherCandidate,
    tunedCandidate,
    experimentalCandidate,
    modelSupport,
    shapeDelta: numberOr(shapeDelta, 0),
    hardEvLoss: numberOr(hardEvLoss, 0)
  });

  return {
    id: candidate.id,
    sourceIds: Array.isArray(candidate.sourceIds) ? candidate.sourceIds.slice() : [],
    priority: candidate.priority || null,
    category: candidate.category || null,
    bucket: candidate.bucket || null,
    qDelta: numberOrNull(candidate.qDelta),
    pressureScore,
    classification,
    reasons: [
      pressureScore === 0 ? 'no-pressure' : 'pressure-not-zero',
      getXiangting(tunedCandidate) === getXiangting(teacherCandidate) ? 'same-xiangting' : 'not-same-xiangting',
      isSameTile(tunedCandidate && tunedCandidate.tileCode, teacherCandidate && teacherCandidate.tileCode) ? 'current-hard-hits-teacher' : null,
      isSameTile(experimentalCandidate && experimentalCandidate.tileCode, teacherCandidate && teacherCandidate.tileCode) ? 'experimental-hit-teacher' : null,
      isCleanupRole(experimentalCandidate) ? 'experimental-cleanup-role' : null,
      isProtectedCutRole(tunedCandidate) ? 'current-hard-protected-cut-role' : null,
      modelSupport
    ].filter(Boolean),
    local: compactDecision(localCandidate),
    currentHard: compactDecision(tunedCandidate),
    teacher: compactDecision(teacherCandidate),
    experimental: compactDecision(experimentalCandidate || tunedCandidate),
    replay: {
      base: tunedCandidate ? {
        selectedTileCode: tunedCandidate.tileCode,
        policyId: basePolicy.id || 'hard-tuned'
      } : null,
      experimental: experimentalCandidate ? {
        selectedTileCode: experimentalCandidate.tileCode,
        policyId: overlayPolicy.id || 'hard-experimental',
        overlay: TILE_CHOICE_OVERLAY
      } : null
    },
    deltas: {
      teacherXiangtingMinusCurrentHard: teacherCandidate && tunedCandidate ? getXiangting(teacherCandidate) - getXiangting(tunedCandidate) : null,
      teacherHardEvMinusCurrentHard: teacherCandidate && tunedCandidate ? getHardEvScore(teacherCandidate) - getHardEvScore(tunedCandidate) : null,
      teacherShapeMinusCurrentHard: shapeDelta,
      currentHardEvLossToTeacher: hardEvLoss,
      experimentalHardEvMinusCurrentHard: experimentalCandidate && tunedCandidate ? getHardEvScore(experimentalCandidate) - getHardEvScore(tunedCandidate) : null,
      experimentalShapeMinusCurrentHard: experimentalCandidate && tunedCandidate ? getShapeScore(experimentalCandidate) - getShapeScore(tunedCandidate) : null
    },
    modelSupport
  };
}

function summarizeRows(rows = []) {
  const byClassification = rows.reduce((counts, row) => {
    counts[row.classification] = Number(counts[row.classification] || 0) + 1;
    return counts;
  }, {});
  const patchEligible = Number(byClassification['patch-eligible-cleanup-vs-middle'] || 0)
    + Number(byClassification['patch-eligible-model-consensus'] || 0);
  return {
    total: rows.length,
    byClassification,
    patchEligible,
    alreadyFixed: Number(byClassification['already-fixed-by-current-hard'] || 0),
    manualReview: Number(byClassification['manual-review-only'] || 0)
      + Number(byClassification['tenpai-route-manual-review'] || 0)
      + Number(byClassification['route-feature-missing'] || 0),
    topPatchEligible: rows
      .filter((row) => String(row.classification).startsWith('patch-eligible'))
      .slice(0, 12)
      .map((row) => ({
        id: row.id,
        classification: row.classification,
        qDelta: row.qDelta,
        currentHardTile: row.currentHard && row.currentHard.tileCode,
        teacherTile: row.teacher && row.teacher.tileCode,
        experimentalTile: row.experimental && row.experimental.tileCode
      }))
  };
}

function buildTileChoiceReplayReport(pool = {}, options = {}) {
  const priorityFilter = Array.isArray(options.priorities) && options.priorities.length
    ? new Set(options.priorities)
    : new Set(['P0', 'P1']);
  const rows = (Array.isArray(pool && pool.candidates) ? pool.candidates : [])
    .filter((candidate) => (
      candidate
      && candidate.category === 'same-xiangting tile-choice'
      && priorityFilter.has(candidate.priority)
    ))
    .map((candidate) => replayTileChoiceCandidate(candidate, options));
  return {
    source: 'hard-ai-tile-choice-candidate-replay',
    generatedAt: new Date().toISOString(),
    poolPath: options.poolPath || null,
    overlay: TILE_CHOICE_OVERLAY,
    note: 'Candidate-level replay only. This does not reconstruct full runtime state and does not change formal hard-tuned.',
    summary: summarizeRows(rows),
    rows
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  const pool = readJson(args.pool);
  const report = buildTileChoiceReplayReport(pool, {
    poolPath: path.resolve(args.pool)
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
  DEFAULT_POOL_PATH,
  DEFAULT_OUT_PATH,
  TILE_CHOICE_OVERLAY,
  normalizeTileCode,
  replayTileChoiceCandidate,
  buildTileChoiceReplayReport,
  parseArgs
};
