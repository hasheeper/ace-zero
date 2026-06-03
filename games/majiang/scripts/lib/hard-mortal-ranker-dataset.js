'use strict';

const fs = require('fs');
const path = require('path');
const nativeFeatures = require('./hard-mortal-ranker-native-features');

const DEFAULT_REPORT_PATH = '/tmp/h12-clean-hard-vs-mortal-real.json';
const DEFAULT_DATASET_PATH = '/tmp/h13-mortal-ranker-dataset.jsonl';
const DATASET_VERSION = 'h13-mortal-ranker-candidate-v1';
const NEAR_Q_DELTA = 0.05;
const MEDIUM_Q_DELTA = 0.2;

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

function getTileFeatures(tileCode) {
  const raw = typeof tileCode === 'string' ? tileCode : '';
  const normalized = normalizeTileCode(raw);
  const match = normalized ? normalized.match(/^([mpsz])(\d)$/) : null;
  const suit = match ? match[1] : null;
  const rank = match ? Number(match[2]) : null;
  const isHonor = suit === 'z';
  return {
    normalizedTileCode: normalized,
    tileSuit: suit,
    tileRank: Number.isFinite(rank) ? rank : null,
    isHonor,
    isTerminal: !isHonor && (rank === 1 || rank === 9),
    isMiddle: !isHonor && rank >= 3 && rank <= 7,
    isFive: !isHonor && rank === 5,
    isRedFive: /^[mps]0/.test(raw)
  };
}

function getRowBucket(row = null) {
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
  const resolvedKey = key || 'unknown';
  map[resolvedKey] = (map[resolvedKey] || 0) + amount;
}

function findMortalDiscardCandidate(mortalCandidates = [], tileCode = null) {
  const normalized = normalizeTileCode(tileCode);
  if (!normalized) return null;
  return mortalCandidates
    .filter((candidate) => (
      candidate
      && candidate.actionType === 'discard'
      && normalizeTileCode(candidate.normalizedTileCode || candidate.tileCode) === normalized
      && Number.isFinite(Number(candidate.qValue))
    ))
    .sort((left, right) => (
      Number(right.qValue) - Number(left.qValue)
      || Number(left.actionIndex || 0) - Number(right.actionIndex || 0)
    ))[0] || null;
}

function rankMortalCandidates(candidates = []) {
  const ranks = new Map();
  candidates.forEach((candidate, index) => {
    if (!candidate || !candidate.actionType) return;
    const key = candidate.actionType === 'discard'
      ? `discard:${normalizeTileCode(candidate.normalizedTileCode || candidate.tileCode)}`
      : `${candidate.actionType}:`;
    if (!ranks.has(key)) ranks.set(key, index + 1);
  });
  return ranks;
}

function compactStateContext(row = null) {
  const context = row && row.decisionContext ? row.decisionContext : {};
  const round = context.round || {};
  const local = row && row.localDecision ? row.localDecision : {};
  const metrics = row && row.metrics ? row.metrics : {};
  const hardContext = row && row.hardMetrics && row.hardMetrics.hardContext
    ? row.hardMetrics.hardContext
    : {};
  const pushFoldState = row && row.pushFoldState ? row.pushFoldState : {};
  return {
    targetSeat: row && row.targetSeat ? row.targetSeat : null,
    subjectDifficulty: row && row.subject && row.subject.difficulty ? row.subject.difficulty : null,
    phase: context.phase || null,
    remaining: numberOrNull(context.remaining),
    doraIndicators: Array.isArray(context.doraIndicators) ? context.doraIndicators.slice() : [],
    dealerSeat: round.dealerSeat || hardContext.dealerSeat || null,
    zhuangfeng: numberOrNull(round.zhuangfeng),
    jushu: numberOrNull(round.jushu),
    changbang: numberOrNull(round.changbang),
    lizhibang: numberOrNull(round.lizhibang),
    scores: context.scores && typeof context.scores === 'object' ? clone(context.scores) : null,
    localShouldRiichi: Boolean(local.riichi),
    pressureState: pushFoldState.state || null,
    pressureScore: numberOrNull(pushFoldState.pressureScore) || 0,
    localXiangting: numberOrNull(metrics.xiangting),
    bucket: getRowBucket(row),
    severityLevel: row && row.mortalSeverity ? row.mortalSeverity.level || null : null,
    severityQDelta: row && row.mortalSeverity ? numberOrNull(row.mortalSeverity.qDelta) : null
  };
}

function compactCandidateFeatures(candidate = null) {
  const metrics = candidate && candidate.metrics ? candidate.metrics : {};
  const hardMetrics = candidate && candidate.hardMetrics ? candidate.hardMetrics : {};
  const danger = candidate && candidate.danger ? candidate.danger : {};
  const shape = candidate && candidate.shape ? candidate.shape : {};
  const tileFeatures = getTileFeatures(candidate && candidate.tileCode);
  return {
    tile: tileFeatures,
    xiangting: numberOrNull(metrics.xiangting),
    tingpaiCount: numberOrNull(metrics.tingpaiCount),
    ukeireCount: numberOrNull(metrics.ukeireCount),
    handValueEstimate: numberOrNull(metrics.handValueEstimate),
    hardEvScore: numberOrNull(hardMetrics.hardEvScore),
    liveUkeireCount: numberOrNull(hardMetrics.liveUkeireCount),
    liveTingpaiCount: numberOrNull(hardMetrics.liveTingpaiCount),
    waitQualityScore: numberOrNull(hardMetrics.waitQualityScore),
    bestWaitType: hardMetrics.bestWaitType || null,
    contextualHandValueEstimate: numberOrNull(hardMetrics.contextualHandValueEstimate),
    dangerScore: numberOrNull(danger.dangerScore),
    safetyRank: numberOrNull(danger.safetyRank),
    defenseTileRank: numberOrNull(danger.defenseTileRank),
    dangerCategories: Array.isArray(danger.categories) ? danger.categories.slice() : [],
    safetyReasons: Array.isArray(danger.safetyReasons) ? danger.safetyReasons.slice() : [],
    discardShapeScore: numberOrNull(shape.discardShapeScore),
    discardTileRole: shape.discardTileRole || null,
    keptUsefulMiddleCount: numberOrNull(shape.keptUsefulMiddleCount),
    weakTerminalCleanupBonus: numberOrNull(shape.weakTerminalCleanupBonus),
    isolatedHonorCleanupBonus: numberOrNull(shape.isolatedHonorCleanupBonus),
    middleTileCutPenalty: numberOrNull(shape.middleTileCutPenalty),
    fiveOrRedFiveCutPenalty: numberOrNull(shape.fiveOrRedFiveCutPenalty),
    doraRetentionPenalty: numberOrNull(shape.doraRetentionPenalty),
    pairOrBlockBreakPenalty: numberOrNull(shape.pairOrBlockBreakPenalty),
    shapeReasons: Array.isArray(shape.reasons) ? shape.reasons.slice() : []
  };
}

function compactCandidateFeaturesWithNative(row = null, candidate = null) {
  const features = compactCandidateFeatures(candidate);
  features.native = nativeFeatures.makeNativeFeatures(
    row && row.decisionContext ? row.decisionContext : {},
    candidate || {},
    { seatKey: row && row.targetSeat ? row.targetSeat : null }
  );
  return features;
}

function candidateSortKey(candidate = null) {
  return [
    Number(candidate && candidate.tileIndex != null ? candidate.tileIndex : 999),
    String(candidate && candidate.tileCode || '')
  ];
}

function compareCandidateSortKey(left, right) {
  const leftKey = candidateSortKey(left);
  const rightKey = candidateSortKey(right);
  return leftKey[0] - rightKey[0] || leftKey[1].localeCompare(rightKey[1]);
}

function isEligibleReportRow(row = null) {
  if (!row || row.kind !== 'discard') return { ok: false, reason: 'non-discard-row' };
  if (!row.localDecision || row.localDecision.type !== 'discard') return { ok: false, reason: 'non-discard-local' };
  if (!row.mortalOk) return { ok: false, reason: 'mortal-inference-failed' };
  if (!row.mortalAlignment || row.mortalAlignment.status !== 'fresh') return { ok: false, reason: 'stale-mortal-state' };
  if (!Array.isArray(row.mortalCandidates) || !row.mortalCandidates.length) return { ok: false, reason: 'missing-mortal-candidates' };
  if (!Array.isArray(row.hardCandidateDiagnostics) || row.hardCandidateDiagnostics.length < 2) {
    return { ok: false, reason: 'missing-hard-candidate-diagnostics' };
  }
  if (!row.bestMortalCandidate || row.bestMortalCandidate.actionType !== 'discard') {
    return { ok: false, reason: 'non-discard-mortal-best' };
  }
  return { ok: true, reason: null };
}

function buildStateRowsFromReportRow(row = null, options = {}) {
  const eligibility = isEligibleReportRow(row);
  if (!eligibility.ok) {
    return {
      stateId: row && row.id ? row.id : null,
      candidateRows: [],
      stats: {
        included: false,
        excludedReason: eligibility.reason,
        hardCandidateCount: Array.isArray(row && row.hardCandidateDiagnostics) ? row.hardCandidateDiagnostics.length : 0,
        matchedCandidateCount: 0,
        mortalBestCovered: false,
        localSelectedCovered: false
      }
    };
  }

  const sourceReport = options.sourceReport || null;
  const stateId = row.id;
  const state = compactStateContext(row);
  const mortalRanks = rankMortalCandidates(row.mortalCandidates);
  const mortalBestTile = normalizeTileCode(row.bestMortalCandidate.tileCode);
  let mortalBestCovered = false;
  let localSelectedCovered = false;

  const candidateRows = row.hardCandidateDiagnostics
    .slice()
    .sort(compareCandidateSortKey)
    .map((candidate) => {
      const mortalCandidate = findMortalDiscardCandidate(row.mortalCandidates, candidate.tileCode);
      if (!mortalCandidate) return null;
      const normalizedTileCode = normalizeTileCode(candidate.tileCode);
      const isLocalSelected = Boolean(candidate.selectedFinal)
        || normalizedTileCode === normalizeTileCode(row.localDecision && row.localDecision.tileCode);
      const isMortalBest = normalizedTileCode === mortalBestTile
        && Number(mortalCandidate.qDeltaFromBest || 0) === 0;
      if (isMortalBest) mortalBestCovered = true;
      if (isLocalSelected) localSelectedCovered = true;
      const rankKey = `discard:${normalizeTileCode(mortalCandidate.normalizedTileCode || mortalCandidate.tileCode)}`;
      return {
        datasetVersion: DATASET_VERSION,
        sourceReport,
        stateId,
        rowId: row.id,
        seed: numberOrNull(row.seed),
        targetSeat: row.targetSeat || null,
        roundIndex: row.round && numberOrNull(row.round.roundIndex),
        sampleId: `${row.id}:${candidate.tileIndex}:${candidate.tileCode}`,
        state,
        local: {
          tileCode: row.localDecision.tileCode || null,
          normalizedTileCode: normalizeTileCode(row.localDecision.tileCode),
          shouldRiichi: Boolean(row.localDecision.riichi),
          mortalQValue: row.localMortalCandidate ? numberOrNull(row.localMortalCandidate.qValue) : null,
          qDeltaFromBest: row.localMortalCandidate ? numberOrNull(row.localMortalCandidate.qDeltaFromBest) : null
        },
        mortalBest: {
          tileCode: row.bestMortalCandidate.tileCode || null,
          normalizedTileCode: mortalBestTile,
          qValue: numberOrNull(row.bestMortalCandidate.qValue)
        },
        candidate: {
          tileCode: candidate.tileCode || null,
          normalizedTileCode,
          tileIndex: numberOrNull(candidate.tileIndex),
          isDrawDiscard: Boolean(candidate.isDrawDiscard),
          selectedInitial: Boolean(candidate.selectedInitial),
          selectedFinal: Boolean(candidate.selectedFinal)
        },
        label: {
          mortalQValue: numberOrNull(mortalCandidate.qValue),
          qDeltaFromBest: numberOrNull(mortalCandidate.qDeltaFromBest),
          mortalRank: mortalRanks.get(rankKey) || null,
          isMortalBest,
          isLocalSelected
        },
        features: compactCandidateFeaturesWithNative(row, candidate)
      };
    })
    .filter(Boolean);

  return {
    stateId,
    candidateRows,
    stats: {
      included: candidateRows.length >= 2 && mortalBestCovered && localSelectedCovered,
      excludedReason: candidateRows.length < 2
        ? 'insufficient-matched-candidates'
        : !mortalBestCovered
        ? 'mortal-best-not-in-hard-candidates'
        : !localSelectedCovered
        ? 'local-selected-not-in-hard-candidates'
        : null,
      hardCandidateCount: row.hardCandidateDiagnostics.length,
      matchedCandidateCount: candidateRows.length,
      mortalBestCovered,
      localSelectedCovered
    }
  };
}

function createDatasetSummary() {
  return {
    version: DATASET_VERSION,
    reports: 0,
    totalRows: 0,
    eligibleRows: 0,
    includedStates: 0,
    candidateRows: 0,
    hardCandidateCount: 0,
    matchedCandidateCount: 0,
    candidateCoverageRate: 0,
    mortalBestCoveredStates: 0,
    mortalBestCoverageRate: 0,
    localSelectedCoveredStates: 0,
    localSelectedCoverageRate: 0,
    severityCounts: {},
    bucketCounts: {},
    excludedRows: {},
    qDelta: {
      count: 0,
      averageLocal: null,
      averageBest: null
    }
  };
}

function finalizeDatasetSummary(summary) {
  summary.candidateCoverageRate = summary.hardCandidateCount
    ? roundMetric(summary.matchedCandidateCount / summary.hardCandidateCount, 4)
    : 0;
  summary.mortalBestCoverageRate = summary.eligibleRows
    ? roundMetric(summary.mortalBestCoveredStates / summary.eligibleRows, 4)
    : 0;
  summary.localSelectedCoverageRate = summary.eligibleRows
    ? roundMetric(summary.localSelectedCoveredStates / summary.eligibleRows, 4)
    : 0;
  if (summary.qDelta.count) {
    summary.qDelta.averageLocal = roundMetric(summary.qDelta.averageLocal / summary.qDelta.count);
    summary.qDelta.averageBest = roundMetric(summary.qDelta.averageBest / summary.qDelta.count);
  }
  return summary;
}

function buildRankerDatasetFromReports(reportEntries = [], options = {}) {
  const candidateRows = [];
  const summary = createDatasetSummary();
  const stateSummaries = [];

  reportEntries.forEach((entry, reportIndex) => {
    const report = entry && entry.report ? entry.report : entry;
    const sourceReport = entry && entry.path ? entry.path : `report-${reportIndex + 1}`;
    const rows = report && Array.isArray(report.rows) ? report.rows : [];
    summary.reports += 1;
    summary.totalRows += rows.length;
    rows.forEach((row) => {
      increment(summary.severityCounts, row && row.mortalSeverity && row.mortalSeverity.level);
      increment(summary.bucketCounts, getRowBucket(row));
      const built = buildStateRowsFromReportRow(row, { ...options, sourceReport });
      if (isEligibleReportRow(row).ok) {
        summary.eligibleRows += 1;
        summary.hardCandidateCount += built.stats.hardCandidateCount;
        summary.matchedCandidateCount += built.stats.matchedCandidateCount;
        if (built.stats.mortalBestCovered) summary.mortalBestCoveredStates += 1;
        if (built.stats.localSelectedCovered) summary.localSelectedCoveredStates += 1;
        const localDelta = row && row.localMortalCandidate ? numberOrNull(row.localMortalCandidate.qDeltaFromBest) : null;
        const bestDelta = row && row.bestMortalCandidate ? numberOrNull(row.bestMortalCandidate.qDeltaFromBest) : null;
        if (localDelta != null) {
          summary.qDelta.count += 1;
          summary.qDelta.averageLocal = Number(summary.qDelta.averageLocal || 0) + localDelta;
          summary.qDelta.averageBest = Number(summary.qDelta.averageBest || 0) + Number(bestDelta || 0);
        }
      }
      if (!built.stats.included) {
        increment(summary.excludedRows, built.stats.excludedReason);
        return;
      }
      summary.includedStates += 1;
      summary.candidateRows += built.candidateRows.length;
      stateSummaries.push({
        stateId: built.stateId,
        candidateRows: built.candidateRows.length,
        sourceReport
      });
      candidateRows.push(...built.candidateRows);
    });
  });

  return {
    summary: finalizeDatasetSummary(summary),
    stateSummaries,
    candidateRows
  };
}

function serializeJsonl(rows = []) {
  return rows.map((row) => JSON.stringify(row)).join('\n').concat(rows.length ? '\n' : '');
}

function parseJsonl(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function readJsonl(filePath) {
  return parseJsonl(fs.readFileSync(path.resolve(filePath), 'utf8'));
}

function writeJsonl(filePath, rows = []) {
  fs.writeFileSync(path.resolve(filePath), serializeJsonl(rows), 'utf8');
}

function groupRowsByState(rows = []) {
  const grouped = new Map();
  rows.forEach((row) => {
    const stateId = row && row.stateId ? row.stateId : 'unknown';
    if (!grouped.has(stateId)) grouped.set(stateId, []);
    grouped.get(stateId).push(row);
  });
  return grouped;
}

function compareNumericDesc(leftValue, rightValue) {
  return Number(rightValue == null ? -Infinity : rightValue) - Number(leftValue == null ? -Infinity : leftValue);
}

function compareNumericAsc(leftValue, rightValue) {
  return Number(leftValue == null ? Infinity : leftValue) - Number(rightValue == null ? Infinity : rightValue);
}

function tieBreakCandidate(left, right) {
  return Number(left && left.candidate && left.candidate.tileIndex != null ? left.candidate.tileIndex : 999)
    - Number(right && right.candidate && right.candidate.tileIndex != null ? right.candidate.tileIndex : 999)
    || String(left && left.candidate && left.candidate.tileCode || '').localeCompare(String(right && right.candidate && right.candidate.tileCode || ''));
}

function pickBestCandidate(rows = [], strategy) {
  const sorted = rows.slice().sort((left, right) => {
    if (strategy === 'current-hard') {
      return Number(Boolean(right.label && right.label.isLocalSelected)) - Number(Boolean(left.label && left.label.isLocalSelected))
        || tieBreakCandidate(left, right);
    }
    if (strategy === 'hard-ev') {
      return compareNumericDesc(left.features && left.features.hardEvScore, right.features && right.features.hardEvScore)
        || tieBreakCandidate(left, right);
    }
    if (strategy === 'hard-ev-shape') {
      const leftScore = Number(left.features && left.features.hardEvScore || 0)
        + Number(left.features && left.features.discardShapeScore || 0);
      const rightScore = Number(right.features && right.features.hardEvScore || 0)
        + Number(right.features && right.features.discardShapeScore || 0);
      return rightScore - leftScore || tieBreakCandidate(left, right);
    }
    if (strategy === 'danger-first') {
      return compareNumericAsc(left.features && left.features.dangerScore, right.features && right.features.dangerScore)
        || compareNumericAsc(left.features && left.features.safetyRank, right.features && right.features.safetyRank)
        || compareNumericDesc(left.features && left.features.hardEvScore, right.features && right.features.hardEvScore)
        || tieBreakCandidate(left, right);
    }
    return tieBreakCandidate(left, right);
  });
  return sorted[0] || null;
}

function severityFromQDelta(qDelta) {
  const delta = Number(qDelta);
  if (!Number.isFinite(delta)) return 'unknown';
  if (delta <= 0) return 'exact';
  if (delta <= NEAR_Q_DELTA) return 'near';
  if (delta <= MEDIUM_Q_DELTA) return 'medium';
  return 'large';
}

function createStrategySummary(name) {
  return {
    name,
    states: 0,
    exact: 0,
    near: 0,
    medium: 0,
    large: 0,
    unknown: 0,
    exactRate: 0,
    nearOrExactRate: 0,
    mediumOrBetterRate: 0,
    largeRate: 0,
    averageQDelta: null,
    bucketCounts: {},
    bucketLargeCounts: {}
  };
}

function finalizeStrategySummary(summary, qDeltaTotal, qDeltaCount) {
  summary.exactRate = summary.states ? roundMetric(summary.exact / summary.states, 4) : 0;
  summary.nearOrExactRate = summary.states ? roundMetric((summary.exact + summary.near) / summary.states, 4) : 0;
  summary.mediumOrBetterRate = summary.states ? roundMetric((summary.exact + summary.near + summary.medium) / summary.states, 4) : 0;
  summary.largeRate = summary.states ? roundMetric(summary.large / summary.states, 4) : 0;
  summary.averageQDelta = qDeltaCount ? roundMetric(qDeltaTotal / qDeltaCount) : null;
  return summary;
}

function evaluateRankerDatasetRows(rows = [], options = {}) {
  const strategies = options.strategies || ['current-hard', 'hard-ev', 'hard-ev-shape', 'danger-first'];
  const grouped = groupRowsByState(rows);
  const summaries = {};
  const stateDetails = [];
  strategies.forEach((strategy) => {
    summaries[strategy] = createStrategySummary(strategy);
  });

  grouped.forEach((stateRows, stateId) => {
    const stateDetail = {
      stateId,
      candidates: stateRows.length,
      bucket: stateRows[0] && stateRows[0].state ? stateRows[0].state.bucket : 'unknown',
      picks: {}
    };
    strategies.forEach((strategy) => {
      const pick = pickBestCandidate(stateRows, strategy);
      if (!pick) return;
      const qDelta = numberOrNull(pick.label && pick.label.qDeltaFromBest);
      const level = severityFromQDelta(qDelta);
      const summary = summaries[strategy];
      summary.states += 1;
      increment(summary.bucketCounts, stateDetail.bucket);
      if (level === 'large') increment(summary.bucketLargeCounts, stateDetail.bucket);
      if (Object.prototype.hasOwnProperty.call(summary, level)) summary[level] += 1;
      else summary.unknown += 1;
      if (qDelta != null) {
        summary._qDeltaTotal = Number(summary._qDeltaTotal || 0) + qDelta;
        summary._qDeltaCount = Number(summary._qDeltaCount || 0) + 1;
      }
      stateDetail.picks[strategy] = {
        tileCode: pick.candidate ? pick.candidate.tileCode : null,
        qDeltaFromBest: qDelta,
        severity: level,
        isMortalBest: Boolean(pick.label && pick.label.isMortalBest)
      };
    });
    stateDetails.push(stateDetail);
  });

  Object.keys(summaries).forEach((strategy) => {
    const summary = summaries[strategy];
    const qDeltaTotal = Number(summary._qDeltaTotal || 0);
    const qDeltaCount = Number(summary._qDeltaCount || 0);
    delete summary._qDeltaTotal;
    delete summary._qDeltaCount;
    finalizeStrategySummary(summary, qDeltaTotal, qDeltaCount);
  });

  return {
    source: 'hard-mortal-ranker-baseline',
    datasetVersion: rows[0] && rows[0].datasetVersion || DATASET_VERSION,
    totalCandidateRows: rows.length,
    states: grouped.size,
    strategies: summaries,
    stateDetails: options.includeStateDetails ? stateDetails : []
  };
}

function assertCompactDatasetRows(rows = []) {
  const serialized = JSON.stringify(rows);
  ['runtime', 'eventLog', 'stdout', 'stderr', 'mortalRoot', 'condaEnvPath'].forEach((forbidden) => {
    if (serialized.includes(`"${forbidden}"`)) {
      throw new Error(`ranker dataset rows should omit ${forbidden}`);
    }
  });
}

module.exports = {
  DEFAULT_REPORT_PATH,
  DEFAULT_DATASET_PATH,
  DATASET_VERSION,
  NEAR_Q_DELTA,
  MEDIUM_Q_DELTA,
  normalizeTileCode,
  getTileFeatures,
  findMortalDiscardCandidate,
  buildStateRowsFromReportRow,
  buildRankerDatasetFromReports,
  serializeJsonl,
  parseJsonl,
  readJsonl,
  writeJsonl,
  groupRowsByState,
  pickBestCandidate,
  severityFromQDelta,
  evaluateRankerDatasetRows,
  assertCompactDatasetRows
};
