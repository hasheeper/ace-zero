'use strict';

const fs = require('fs');
const path = require('path');

const hardDefenseTiebreakApi = require('../engine/ai/support/hard-defense-tiebreak');
const arenaApi = require('./benchmark-ai-hanchan-arena');

const DEFAULT_POOL_PATH = '/tmp/h14-p1-hard-ai-repair-candidates.json';
const DEFAULT_OUT_PATH = '/tmp/h14-p3-defense-replay.json';
const DEFENSE_OVERLAY = 'defense-equal-safe-backstep-v1';

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
  console.log('Usage: node games/majiang/scripts/replay-hard-ai-defense-candidates.js [options]');
  console.log('');
  console.log('Options:');
  console.log('  --pool <path>   H14 P1 repair candidate pool. Default: /tmp/h14-p1-hard-ai-repair-candidates.json');
  console.log('  --out <path>    Output path. Default: /tmp/h14-p3-defense-replay.json');
  console.log('  --stdout        Also print full JSON.');
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
    } : null
  };
}

function getDangerScore(decision) {
  return numberOr(decision && decision.danger && decision.danger.dangerScore, 0);
}

function getSafetyRank(decision) {
  const raw = decision && decision.danger ? decision.danger.safetyRank : null;
  if (raw != null && Number.isFinite(Number(raw))) {
    return Number(raw);
  }
  return getDangerScore(decision) <= 0 ? 0 : getDangerScore(decision) * 10;
}

function getDefenseTileRank(decision) {
  const raw = decision && decision.danger ? decision.danger.defenseTileRank : null;
  if (raw != null && Number.isFinite(Number(raw))) {
    return Number(raw);
  }
  return getSafetyRank(decision) * 10 + getDangerScore(decision);
}

function getXiangting(decision) {
  return numberOr(decision && decision.metrics && decision.metrics.xiangting, 99);
}

function getHardEvScore(decision) {
  return numberOr(decision && decision.hardMetrics && decision.hardMetrics.hardEvScore, 0);
}

function isSameTile(left, right) {
  return normalizeTileCode(left) === normalizeTileCode(right);
}

function findCandidateByTile(candidates, tileCode) {
  const normalized = normalizeTileCode(tileCode);
  if (!normalized) return null;
  return (Array.isArray(candidates) ? candidates : []).find((candidate) => (
    candidate && normalizeTileCode(candidate.tileCode || candidate.normalizedTileCode) === normalized
  )) || null;
}

function uniqueCandidateTable(candidate = {}) {
  const rows = [];
  const seen = new Set();
  const push = (entry) => {
    if (!entry || typeof entry !== 'object') return;
    const key = `${normalizeTileCode(entry.tileCode || entry.normalizedTileCode) || ''}:${numberOr(entry.tileIndex, -1)}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push(clone(entry));
  };
  (Array.isArray(candidate.candidateTable) ? candidate.candidateTable : []).forEach(push);
  push(candidate.localCandidate);
  push(candidate.mortalCandidate);
  return rows.filter(Boolean);
}

function hasCrossXiangtingFold(candidate = {}) {
  const reasonSources = [
    candidate.currentHard && candidate.currentHard.reasons,
    candidate.localDecision && candidate.localDecision.reasons,
    candidate.fixedState && candidate.fixedState.localDiscard && candidate.fixedState.localDiscard.reasons
  ];
  return reasonSources.some((reasons) => (
    Array.isArray(reasons) && reasons.some((reason) => String(reason).includes('cross-xiangting-fold'))
  ));
}

function createOverlayDefensePolicy() {
  const policy = arenaApi.createExperimentalHardPolicy({
    experimentalOverlays: [DEFENSE_OVERLAY]
  });
  return policy.defense || {};
}

function createBaseDefensePolicy() {
  const policy = arenaApi.createExperimentalHardPolicy();
  return policy.defense || {};
}

function replayDefenseCandidate(candidate = {}, options = {}) {
  const table = uniqueCandidateTable(candidate);
  const localTile = candidate.currentHard && candidate.currentHard.tileCode
    || candidate.localDecision && candidate.localDecision.tileCode
    || candidate.fixedState && candidate.fixedState.localDiscard && candidate.fixedState.localDiscard.tileCode;
  const teacherTile = candidate.teacher && candidate.teacher.tileCode
    || candidate.mortalDecision && candidate.mortalDecision.tileCode;
  const localCandidate = findCandidateByTile(table, localTile) || candidate.localCandidate || null;
  const teacherCandidate = findCandidateByTile(table, teacherTile) || candidate.mortalCandidate || null;
  const pressureScore = numberOr(candidate.pressureScore, 0);
  const crossFold = hasCrossXiangtingFold(candidate);
  const pushFoldState = {
    state: pressureScore > 0 ? 'careful' : 'neutral',
    pressureScore,
    reasons: pressureScore > 0 ? ['repair-candidate-pressure'] : []
  };
  const hardPushFold = crossFold ? { mode: 'cross-xiangting-fold' } : null;
  const baseResult = localCandidate
    ? hardDefenseTiebreakApi.evaluateHardDefenseTiebreakCandidates(table, localCandidate, {
        policy: options.baseDefensePolicy || createBaseDefensePolicy(),
        pushFoldState,
        hardPushFold
      })
    : null;
  const experimentalResult = localCandidate
    ? hardDefenseTiebreakApi.evaluateHardDefenseTiebreakCandidates(table, localCandidate, {
        policy: options.overlayDefensePolicy || createOverlayDefensePolicy(),
        pushFoldState,
        hardPushFold
      })
    : null;
  const experimentalTile = experimentalResult && experimentalResult.selectedTileCode
    ? experimentalResult.selectedTileCode
    : localTile;
  const experimentalCandidate = findCandidateByTile(table, experimentalTile);
  const localDanger = getDangerScore(localCandidate);
  const teacherDanger = getDangerScore(teacherCandidate);
  const localSafety = getSafetyRank(localCandidate);
  const teacherSafety = getSafetyRank(teacherCandidate);
  const currentAlreadySafe = localDanger === 0 && localSafety === 0;
  const teacherRiskier = Boolean(
    teacherCandidate
    && (
      teacherDanger > localDanger
      || teacherSafety > localSafety
    )
  );
  const experimentalHitsTeacher = isSameTile(experimentalTile, teacherTile);
  const classification = (() => {
    if (crossFold) return 'already-cross-xiangting-fold';
    if (teacherRiskier) return 'teacher-riskier';
    if (experimentalResult && experimentalResult.mode === 'equal-safe-backstep') {
      return 'patch-eligible-equal-safe-backstep';
    }
    if (
      experimentalResult
      && experimentalResult.mode === 'low-pressure-soft-fold'
    ) {
      return 'patch-eligible-safer-soft-fold';
    }
    if (currentAlreadySafe && !experimentalHitsTeacher) return 'already-safe-no-clear-gain';
    return 'manual-review-only';
  })();

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
      crossFold ? 'local-already-cross-xiangting-fold' : null,
      teacherRiskier ? 'teacher-candidate-riskier-than-local' : null,
      currentAlreadySafe ? 'local-danger-zero-safety-rank-zero' : null,
      experimentalResult && experimentalResult.mode !== 'keep-current'
        ? `experimental-${experimentalResult.mode}`
        : 'experimental-keep-current',
      experimentalHitsTeacher ? 'experimental-hit-teacher' : null
    ].filter(Boolean),
    local: compactDecision(localCandidate),
    teacher: compactDecision(teacherCandidate),
    experimental: compactDecision(experimentalCandidate || localCandidate),
    replay: {
      base: baseResult ? {
        mode: baseResult.mode,
        selectedTileCode: baseResult.selectedTileCode,
        reasons: Array.isArray(baseResult.reasons) ? baseResult.reasons.slice() : []
      } : null,
      experimental: experimentalResult ? {
        mode: experimentalResult.mode,
        selectedTileCode: experimentalResult.selectedTileCode,
        currentTileCode: experimentalResult.currentTileCode,
        safeTileCode: experimentalResult.safeTileCode,
        pressureScore: numberOrNull(experimentalResult.pressureScore),
        safetyRankDelta: numberOrNull(experimentalResult.safetyRankDelta),
        xiangtingLoss: numberOrNull(experimentalResult.xiangtingLoss),
        hardEvLoss: numberOrNull(experimentalResult.hardEvLoss),
        reasons: Array.isArray(experimentalResult.reasons) ? experimentalResult.reasons.slice() : []
      } : null
    },
    deltas: {
      teacherXiangtingMinusLocal: teacherCandidate ? getXiangting(teacherCandidate) - getXiangting(localCandidate) : null,
      teacherDangerMinusLocal: teacherCandidate ? teacherDanger - localDanger : null,
      teacherSafetyMinusLocal: teacherCandidate ? teacherSafety - localSafety : null,
      teacherDefenseRankMinusLocal: teacherCandidate ? getDefenseTileRank(teacherCandidate) - getDefenseTileRank(localCandidate) : null,
      teacherHardEvMinusLocal: teacherCandidate ? getHardEvScore(teacherCandidate) - getHardEvScore(localCandidate) : null
    }
  };
}

function summarizeRows(rows = []) {
  const byClassification = rows.reduce((counts, row) => {
    counts[row.classification] = Number(counts[row.classification] || 0) + 1;
    return counts;
  }, {});
  return {
    total: rows.length,
    byClassification,
    patchEligible: Number(byClassification['patch-eligible-equal-safe-backstep'] || 0)
      + Number(byClassification['patch-eligible-safer-soft-fold'] || 0),
    teacherRiskier: Number(byClassification['teacher-riskier'] || 0),
    alreadyCrossXiangtingFold: Number(byClassification['already-cross-xiangting-fold'] || 0),
    topPatchEligible: rows
      .filter((row) => String(row.classification).startsWith('patch-eligible'))
      .slice(0, 12)
      .map((row) => ({
        id: row.id,
        classification: row.classification,
        qDelta: row.qDelta,
        localTile: row.local && row.local.tileCode,
        teacherTile: row.teacher && row.teacher.tileCode,
        experimentalTile: row.experimental && row.experimental.tileCode
      }))
  };
}

function buildDefenseReplayReport(pool = {}, options = {}) {
  const rows = (Array.isArray(pool && pool.candidates) ? pool.candidates : [])
    .filter((candidate) => candidate && candidate.category === 'defense')
    .map((candidate) => replayDefenseCandidate(candidate, options));
  return {
    source: 'hard-ai-defense-candidate-replay',
    generatedAt: new Date().toISOString(),
    poolPath: options.poolPath || null,
    overlay: DEFENSE_OVERLAY,
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
  const report = buildDefenseReplayReport(pool, {
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
  DEFENSE_OVERLAY,
  normalizeTileCode,
  replayDefenseCandidate,
  buildDefenseReplayReport,
  parseArgs
};
