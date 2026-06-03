'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_LEDGER_PATH = '/tmp/h14-p5-hard-ai-experimental-ledger.json';
const DEFAULT_POOL_PATH = '/tmp/h14-p1-hard-ai-repair-candidates.json';
const DEFAULT_TILE_CHOICE_REPLAY_PATH = '/tmp/h14-p4-tile-choice-replay.json';
const DEFAULT_JSON_OUT_PATH = '/tmp/h14-p6-route-review-pack.json';
const DEFAULT_MD_OUT_PATH = '/tmp/h14-p6-route-review-pack.md';

const SEATS = Object.freeze(['bottom', 'right', 'top', 'left']);
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

function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !FORBIDDEN_COMPACT_KEYS.has(key))
    .map(([key, entry]) => [key, sanitize(entry)]));
}

function clone(value) {
  return value == null ? value : sanitize(JSON.parse(JSON.stringify(value)));
}

function readJsonIfExists(filePath) {
  if (!filePath || !fs.existsSync(path.resolve(filePath))) return null;
  return JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
}

function writeText(filePath, text) {
  fs.writeFileSync(path.resolve(filePath), text, 'utf8');
}

function writeJson(filePath, value) {
  writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
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
  const stripped = String(tileCode).replace(/[\*_\+\=\-\^]+$/g, '');
  if (stripped.length < 2) return null;
  const suit = stripped[0];
  const rankText = stripped[1] === '0' ? '5' : stripped[1];
  const rank = Number(rankText);
  if (!['m', 'p', 's', 'z'].includes(suit) || !Number.isInteger(rank)) return null;
  if (suit === 'z' && (rank < 1 || rank > 7)) return null;
  if (suit !== 'z' && (rank < 1 || rank > 9)) return null;
  return `${suit}${rank}`;
}

function isRedFive(tileCode) {
  return typeof tileCode === 'string' && /^[mps]0/.test(tileCode);
}

function tileParts(tileCode) {
  const normalized = normalizeTileCode(tileCode);
  if (!normalized) return null;
  return {
    normalized,
    suit: normalized[0],
    rank: Number(normalized[1])
  };
}

function getTileClass(tileCode) {
  const parts = tileParts(tileCode);
  if (!parts) return 'unknown';
  if (parts.suit === 'z') return 'honor';
  if (parts.rank === 1 || parts.rank === 9) return 'terminal';
  if (parts.rank === 2 || parts.rank === 8) return 'edge';
  if (parts.rank === 5) return isRedFive(tileCode) ? 'red-five' : 'five';
  return 'middle';
}

function countTiles(tileCodes = []) {
  const counts = Object.create(null);
  (Array.isArray(tileCodes) ? tileCodes : []).forEach((tileCode) => {
    const normalized = normalizeTileCode(tileCode);
    if (!normalized) return;
    counts[normalized] = Number(counts[normalized] || 0) + 1;
  });
  return counts;
}

function countOf(counts, tileCode) {
  const normalized = normalizeTileCode(tileCode);
  return normalized ? Number(counts[normalized] || 0) || 0 : 0;
}

function getDoraTileFromIndicator(indicatorCode) {
  const parts = tileParts(indicatorCode);
  if (!parts) return null;
  if (parts.suit !== 'z') return `${parts.suit}${parts.rank === 9 ? 1 : parts.rank + 1}`;
  if (parts.rank >= 1 && parts.rank <= 4) return `z${parts.rank === 4 ? 1 : parts.rank + 1}`;
  if (parts.rank >= 5 && parts.rank <= 7) return `z${parts.rank === 7 ? 5 : parts.rank + 1}`;
  return null;
}

function getDoraTiles(fixedState = {}) {
  return (Array.isArray(fixedState.doraIndicators) ? fixedState.doraIndicators : [])
    .map((indicatorCode) => getDoraTileFromIndicator(indicatorCode))
    .filter(Boolean);
}

function isDoraAdjacent(tileCode, doraTileCode) {
  const tile = tileParts(tileCode);
  const dora = tileParts(doraTileCode);
  if (!tile || !dora || tile.suit === 'z' || dora.suit === 'z' || tile.suit !== dora.suit) return false;
  return Math.abs(tile.rank - dora.rank) === 1;
}

function getDealerSeat(fixedState = {}) {
  const dealer = fixedState.round && fixedState.round.dealerSeat;
  if (SEATS.includes(dealer)) return dealer;
  const jushu = fixedState.round && Number.isFinite(Number(fixedState.round.jushu))
    ? Number(fixedState.round.jushu)
    : 0;
  return SEATS[jushu % SEATS.length] || 'bottom';
}

function getRoundWind(fixedState = {}) {
  const zhuangfeng = fixedState.round && Number.isFinite(Number(fixedState.round.zhuangfeng))
    ? Number(fixedState.round.zhuangfeng)
    : 0;
  return `z${zhuangfeng + 1}`;
}

function getSeatWind(fixedState = {}, seatKey) {
  const seatIndex = SEATS.indexOf(seatKey);
  const dealerIndex = SEATS.indexOf(getDealerSeat(fixedState));
  if (seatIndex < 0 || dealerIndex < 0) return null;
  return `z${((seatIndex - dealerIndex + SEATS.length) % SEATS.length) + 1}`;
}

function isValueHonor(fixedState, seatKey, tileCode) {
  const normalized = normalizeTileCode(tileCode);
  if (!normalized || normalized[0] !== 'z') return false;
  if (['z5', 'z6', 'z7'].includes(normalized)) return true;
  return normalized === getRoundWind(fixedState) || normalized === getSeatWind(fixedState, seatKey);
}

function breaksRyanmenBlock(counts, tileCode) {
  const parts = tileParts(tileCode);
  if (!parts || parts.suit === 'z' || parts.rank < 3 || parts.rank > 7) return false;
  return countOf(counts, `${parts.suit}${parts.rank - 1}`) > 0
    || countOf(counts, `${parts.suit}${parts.rank + 1}`) > 0;
}

function handCodesForSeat(fixedState = {}, seatKey) {
  const seat = fixedState.seats && fixedState.seats[seatKey];
  return seat && Array.isArray(seat.handCodes) ? seat.handCodes : [];
}

function meldsForSeat(fixedState = {}, seatKey) {
  const seat = fixedState.seats && fixedState.seats[seatKey];
  return seat && Array.isArray(seat.melds) ? seat.melds : [];
}

function inferRoute(candidate = {}, fixedState = {}, seatKey = null) {
  if (candidate.route && typeof candidate.route === 'object') return clone(candidate.route);
  const tileCode = candidate.tileCode || candidate.normalizedTileCode;
  const normalized = normalizeTileCode(tileCode);
  const handCounts = countTiles(handCodesForSeat(fixedState, seatKey));
  const beforeCount = countOf(handCounts, normalized);
  const afterCount = Math.max(0, beforeCount - 1);
  const doraTiles = getDoraTiles(fixedState);
  const discardIsDora = Boolean(normalized && doraTiles.includes(normalized));
  const discardAdjacentToDora = Boolean(normalized && !discardIsDora && doraTiles.some((doraTile) => isDoraAdjacent(normalized, doraTile)));
  const cutsFive = Boolean(normalized && /^[mps]5$/.test(normalized));
  const cutsRedFive = isRedFive(tileCode);
  const cutsYakuhai = Boolean(isValueHonor(fixedState, seatKey, normalized));
  const breaksPair = beforeCount === 2 && afterCount === 1;
  const breaksTriplet = beforeCount >= 3 && afterCount < beforeCount;
  const breaksYakuhaiPair = Boolean(cutsYakuhai && breaksPair);
  const breaksRyanmen = breaksRyanmenBlock(handCounts, normalized);
  const xiangting = numberOr(candidate.metrics && candidate.metrics.xiangting, numberOr(candidate.xiangting, null));
  const closedHand = meldsForSeat(fixedState, seatKey).length === 0;
  const reasons = [];
  if (discardIsDora) reasons.push('route-cuts-dora');
  if (discardAdjacentToDora) reasons.push('route-cuts-dora-adjacent');
  if (cutsRedFive) reasons.push('route-cuts-red-five');
  else if (cutsFive) reasons.push('route-cuts-five');
  if (cutsYakuhai) reasons.push('route-cuts-yakuhai');
  if (breaksYakuhaiPair) reasons.push('route-breaks-yakuhai-pair');
  if (breaksRyanmen) reasons.push('route-breaks-ryanmen-block');
  if (breaksPair) reasons.push('route-breaks-pair');
  if (breaksTriplet) reasons.push('route-breaks-triplet');
  const breaksValueRoute = Boolean(discardIsDora || cutsRedFive || breaksYakuhaiPair);
  const closedRiichiRouteRisk = Boolean(
    closedHand
    && xiangting != null
    && xiangting <= 1
    && (breaksRyanmen || discardIsDora || cutsRedFive || cutsFive || breaksValueRoute)
  );
  if (breaksValueRoute) reasons.push('route-breaks-value-route');
  if (closedRiichiRouteRisk) reasons.push('route-closed-riichi-route-risk');
  return {
    tileClass: getTileClass(tileCode),
    beforeCount,
    discardIsDora,
    discardAdjacentToDora,
    cutsFive,
    cutsRedFive,
    cutsYakuhai,
    breaksYakuhaiPair,
    breaksRyanmenBlock: breaksRyanmen,
    breaksValueRoute,
    closedRiichiRouteRisk,
    reasons
  };
}

function compactMetrics(candidate = {}) {
  const metrics = candidate.metrics || {};
  return {
    xiangting: numberOrNull(metrics.xiangting ?? candidate.xiangting),
    tingpaiCount: numberOrNull(metrics.tingpaiCount ?? candidate.tingpaiCount),
    ukeireCount: numberOrNull(metrics.ukeireCount ?? candidate.ukeireCount),
    handValueEstimate: numberOrNull(metrics.handValueEstimate ?? candidate.handValueEstimate)
  };
}

function compactDanger(candidate = {}) {
  const danger = candidate.danger || {};
  return {
    dangerScore: numberOrNull(danger.dangerScore ?? candidate.dangerScore),
    safetyRank: numberOrNull(danger.safetyRank ?? candidate.safetyRank),
    defenseTileRank: numberOrNull(danger.defenseTileRank ?? candidate.defenseTileRank),
    categories: Array.isArray(danger.categories) ? danger.categories.slice() : [],
    safetyReasons: Array.isArray(danger.safetyReasons) ? danger.safetyReasons.slice() : []
  };
}

function compactHardMetrics(candidate = {}) {
  const hardMetrics = candidate.hardMetrics || {};
  return {
    hardEvScore: numberOrNull(hardMetrics.hardEvScore ?? candidate.hardEvScore),
    liveUkeireCount: numberOrNull(hardMetrics.liveUkeireCount ?? candidate.liveUkeireCount),
    liveTingpaiCount: numberOrNull(hardMetrics.liveTingpaiCount ?? candidate.liveTingpaiCount),
    waitQualityScore: numberOrNull(hardMetrics.waitQualityScore ?? candidate.waitQualityScore),
    bestWaitType: hardMetrics.bestWaitType || candidate.bestWaitType || null,
    contextualHandValueEstimate: numberOrNull(hardMetrics.contextualHandValueEstimate ?? candidate.contextualHandValueEstimate)
  };
}

function compactShape(candidate = {}) {
  const shape = candidate.shape || {};
  return {
    discardShapeScore: numberOrNull(shape.discardShapeScore ?? candidate.shapeScore),
    discardTileRole: shape.discardTileRole || candidate.shapeRole || null,
    reasons: Array.isArray(shape.reasons) ? shape.reasons.slice() : []
  };
}

function compactMortal(candidate = {}) {
  const mortal = candidate.mortal || {};
  return {
    qValue: numberOrNull(mortal.qValue ?? candidate.qValue),
    qDeltaFromBest: numberOrNull(mortal.qDeltaFromBest ?? candidate.qDeltaFromBest),
    isBest: Boolean(mortal.isBest || candidate.isBest)
  };
}

function normalizeCandidateEntry(entry = {}, fixedState = {}, seatKey = null) {
  const tileCode = entry.tileCode || entry.normalizedTileCode;
  const normalized = normalizeTileCode(tileCode);
  if (!normalized) return null;
  return {
    tileCode: tileCode || normalized,
    normalizedTileCode: normalized,
    tileIndex: numberOrNull(entry.tileIndex),
    isDrawDiscard: Boolean(entry.isDrawDiscard),
    selectedFinal: Boolean(entry.selectedFinal),
    metrics: compactMetrics(entry),
    danger: compactDanger(entry),
    hardMetrics: compactHardMetrics(entry),
    shape: compactShape(entry),
    route: inferRoute(entry, fixedState, seatKey),
    mortal: compactMortal(entry)
  };
}

function uniqueCandidateTable(candidate = {}, replay = null, fixedState = {}, seatKey = null) {
  const rows = [];
  const seen = new Set();
  const push = (entry) => {
    const normalized = normalizeCandidateEntry(entry, fixedState, seatKey);
    if (!normalized || seen.has(normalized.normalizedTileCode)) return;
    seen.add(normalized.normalizedTileCode);
    rows.push(normalized);
  };
  (Array.isArray(candidate.candidateTable) ? candidate.candidateTable : []).forEach(push);
  (fixedState && Array.isArray(fixedState.discardCandidates) ? fixedState.discardCandidates : []).forEach(push);
  [candidate.localCandidate, candidate.mortalCandidate].forEach(push);
  if (replay) [replay.local, replay.currentHard, replay.teacher, replay.experimental].forEach(push);
  return rows;
}

function findByTile(candidates = [], tileCode) {
  const normalized = normalizeTileCode(tileCode);
  if (!normalized) return null;
  return candidates.find((candidate) => candidate.normalizedTileCode === normalized) || null;
}

function getTileFrom(...values) {
  for (const value of values) {
    if (!value) continue;
    if (typeof value === 'string') return value;
    if (value.tileCode) return value.tileCode;
    if (value.normalizedTileCode) return value.normalizedTileCode;
  }
  return null;
}

function compactFixedState(fixedState = {}, seatKey = null) {
  const seat = fixedState.seats && fixedState.seats[seatKey] ? fixedState.seats[seatKey] : {};
  return {
    seat: seatKey || fixedState.seat || null,
    phase: fixedState.phase || null,
    turnSeat: fixedState.turnSeat || null,
    remaining: numberOrNull(fixedState.remaining),
    doraIndicators: Array.isArray(fixedState.doraIndicators) ? fixedState.doraIndicators.slice() : [],
    doraTiles: getDoraTiles(fixedState),
    round: fixedState.round ? {
      zhuangfeng: numberOrNull(fixedState.round.zhuangfeng),
      jushu: numberOrNull(fixedState.round.jushu ?? fixedState.round.ju),
      changbang: numberOrNull(fixedState.round.changbang),
      lizhibang: numberOrNull(fixedState.round.lizhibang),
      dealerSeat: getDealerSeat(fixedState),
      roundWind: getRoundWind(fixedState),
      seatWind: getSeatWind(fixedState, seatKey)
    } : null,
    scores: clone(fixedState.scores || null),
    handCodes: Array.isArray(seat.handCodes) ? seat.handCodes.slice() : [],
    melds: Array.isArray(seat.melds) ? seat.melds.slice() : [],
    riichi: clone(seat.riichi || null),
    localDiscard: clone(fixedState.localDiscard || null)
  };
}

function routeRiskScore(route = {}) {
  let score = 0;
  if (route.discardIsDora) score += 4;
  if (route.cutsRedFive) score += 4;
  if (route.breaksYakuhaiPair) score += 3;
  if (route.breaksValueRoute) score += 3;
  if (route.closedRiichiRouteRisk) score += 2;
  if (route.breaksRyanmenBlock) score += 2;
  if (route.cutsFive) score += 1;
  if (route.discardAdjacentToDora) score += 1;
  return score;
}

function routeReasonText(route = {}) {
  const reasons = Array.isArray(route.reasons) ? route.reasons : [];
  return reasons.length ? reasons.join(',') : 'none';
}

function autoAssessRoute(row) {
  const reasons = [];
  const qDelta = numberOr(row.qDelta, 0);
  const current = row.currentHardCandidate;
  const teacher = row.teacherCandidate;
  const replayClass = row.replayClassification || '';
  if (!row.fixedState || !row.candidates.length || !current || !teacher) {
    return {
      label: 'insufficient-context',
      reasons: ['missing-fixed-state-or-candidate-table']
    };
  }
  if (current.normalizedTileCode === teacher.normalizedTileCode || replayClass === 'already-fixed-by-current-hard') {
    return {
      label: 'already-fixed-or-no-clear-gain',
      reasons: ['current-hard-already-matches-teacher']
    };
  }
  const currentRisk = routeRiskScore(current.route);
  const teacherRisk = routeRiskScore(teacher.route);
  if (currentRisk >= teacherRisk + 3) reasons.push('hard-cuts-more-route-value');
  if (qDelta >= 2) reasons.push('large-qdelta');
  const support = row.modelSignal && row.modelSignal.supportLevel
    || (row.modelSignal && row.modelSignal.bothNativeExactImprovement ? 'both-native-support-mortal' : null);
  if (support === 'both-native-support-mortal') reasons.push('both-native-models-support-teacher');
  if (support === 'one-native-supports-mortal') reasons.push('one-native-model-supports-teacher');
  if (replayClass === 'tenpai-route-manual-review') reasons.push('tenpai-route-choice');
  if (replayClass === 'route-feature-missing' || row.category === 'route-dora-five') reasons.push('route-feature-gap');
  if (reasons.includes('large-qdelta') && currentRisk >= teacherRisk + 3) {
    return { label: 'likely-bad-route', reasons };
  }
  if (qDelta < 0.8 && currentRisk <= teacherRisk + 1) {
    return {
      label: 'likely-style-disagreement',
      reasons: ['low-qdelta', 'no-clear-route-risk-gap']
    };
  }
  if (reasons.length) return { label: 'needs-human-review', reasons };
  return {
    label: 'likely-style-disagreement',
    reasons: ['no-strong-route-signal']
  };
}

function buildReviewRow(ledgerRow = null, candidate = null, replay = null) {
  const source = candidate || {};
  const fixedState = clone(source.fixedState || null);
  const seatKey = source.targetSeat || fixedState && (fixedState.seat || fixedState.turnSeat) || ledgerRow && ledgerRow.candidate && ledgerRow.candidate.targetSeat || null;
  const candidates = uniqueCandidateTable(source, replay, fixedState || {}, seatKey);
  const currentHardTile = getTileFrom(
    replay && replay.currentHard,
    source.currentHard,
    source.localDecision,
    ledgerRow && ledgerRow.candidate && ledgerRow.candidate.currentTile
  );
  const teacherTile = getTileFrom(
    replay && replay.teacher,
    source.teacher,
    source.mortalDecision,
    ledgerRow && ledgerRow.candidate && ledgerRow.candidate.teacherTile
  );
  const currentHardCandidate = findByTile(candidates, currentHardTile);
  const teacherCandidate = findByTile(candidates, teacherTile);
  const row = {
    id: source.id || ledgerRow && ledgerRow.id || null,
    priority: source.priority || ledgerRow && ledgerRow.priority || null,
    category: source.category || ledgerRow && ledgerRow.category || null,
    bucket: source.bucket || ledgerRow && ledgerRow.bucket || null,
    qDelta: numberOrNull(source.qDelta ?? (ledgerRow && ledgerRow.qDelta)),
    seed: numberOrNull(source.seed),
    targetSeat: seatKey,
    remaining: numberOrNull(source.remaining ?? (fixedState && fixedState.remaining)),
    finalStatus: ledgerRow && ledgerRow.finalStatus || null,
    replayClassification: replay && replay.classification || ledgerRow && ledgerRow.replayClassification || null,
    currentHardTile: normalizeTileCode(currentHardTile) || currentHardTile || null,
    teacherTile: normalizeTileCode(teacherTile) || teacherTile || null,
    fixedState: fixedState ? compactFixedState(fixedState, seatKey) : null,
    relation: clone(source.relation || ledgerRow && ledgerRow.candidate && ledgerRow.candidate.relation || null),
    classification: clone(source.classification || null),
    modelSignal: clone(source.modelSignal || source.classification && source.classification.modelSignal || null),
    autoAdjudication: clone(source.autoAdjudication || null),
    currentHardCandidate,
    teacherCandidate,
    candidates
  };
  row.routeDelta = currentHardCandidate && teacherCandidate
    ? {
        hardRouteRisk: routeRiskScore(currentHardCandidate.route),
        teacherRouteRisk: routeRiskScore(teacherCandidate.route),
        riskDelta: routeRiskScore(currentHardCandidate.route) - routeRiskScore(teacherCandidate.route),
        hardReasons: currentHardCandidate.route.reasons,
        teacherReasons: teacherCandidate.route.reasons
      }
    : null;
  row.autoAssessment = autoAssessRoute(row);
  return row;
}

function shouldIncludeLedgerRow(row = {}) {
  return row.finalStatus === 'manual-route-review'
    || row.replayClassification === 'route-feature-missing'
    || row.replayClassification === 'tenpai-route-manual-review';
}

function shouldIncludeCandidate(candidate = {}) {
  return candidate.category === 'route-dora-five';
}

function countBy(rows, selector) {
  return rows.reduce((counts, row) => {
    const key = selector(row) || 'unknown';
    counts[key] = Number(counts[key] || 0) + 1;
    return counts;
  }, {});
}

function summarizeRows(rows = []) {
  return {
    total: rows.length,
    byAssessment: countBy(rows, (row) => row.autoAssessment && row.autoAssessment.label),
    byCategory: countBy(rows, (row) => row.category),
    byReplayClassification: countBy(rows, (row) => row.replayClassification || 'none'),
    likelyBadCount: rows.filter((row) => row.autoAssessment && row.autoAssessment.label === 'likely-bad-route').length,
    needsHumanReviewCount: rows.filter((row) => row.autoAssessment && row.autoAssessment.label === 'needs-human-review').length,
    topLikelyBad: rows
      .filter((row) => row.autoAssessment && row.autoAssessment.label === 'likely-bad-route')
      .sort((left, right) => numberOr(right.qDelta, 0) - numberOr(left.qDelta, 0))
      .slice(0, 12)
      .map((row) => ({
        id: row.id,
        qDelta: row.qDelta,
        currentHardTile: row.currentHardTile,
        teacherTile: row.teacherTile,
        routeDelta: row.routeDelta
      }))
  };
}

function buildRouteReviewPack(inputs = {}, options = {}) {
  const ledgerRows = Array.isArray(inputs.ledger && inputs.ledger.rows) ? inputs.ledger.rows : [];
  const candidates = Array.isArray(inputs.pool && inputs.pool.candidates) ? inputs.pool.candidates : [];
  const replayRows = Array.isArray(inputs.tileChoiceReplay && inputs.tileChoiceReplay.rows) ? inputs.tileChoiceReplay.rows : [];
  const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const replayById = new Map(replayRows.map((row) => [row.id, row]));
  const ids = new Set();
  ledgerRows.filter(shouldIncludeLedgerRow).forEach((row) => ids.add(row.id));
  candidates.filter(shouldIncludeCandidate).forEach((candidate) => ids.add(candidate.id));
  const rows = Array.from(ids)
    .map((id) => buildReviewRow(
      ledgerRows.find((row) => row.id === id) || null,
      candidateById.get(id) || null,
      replayById.get(id) || null
    ))
    .filter((row) => row.id)
    .sort((left, right) => numberOr(right.qDelta, 0) - numberOr(left.qDelta, 0));
  return {
    source: 'hard-ai-route-review-pack',
    generatedAt: new Date().toISOString(),
    outputPath: options.jsonOut || DEFAULT_JSON_OUT_PATH,
    markdownPath: options.mdOut || DEFAULT_MD_OUT_PATH,
    inputs: clone(options.inputs || {}),
    note: 'H14 P6 route review pack only. It does not change formal hard-tuned or hard-experimental policy.',
    decisionRule: 'Only likely-bad-route rows with repeated human-confirmed patterns may become future hard-experimental overlays.',
    summary: summarizeRows(rows),
    rows
  };
}

function formatNumber(value, digits = 3) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 'n/a';
  return String(Math.round(number * (10 ** digits)) / (10 ** digits));
}

function renderCandidateTable(row) {
  const lines = [
    '| tile | mark | xt | hardEv | shape | role | danger | route | qDelta |',
    '| --- | --- | ---: | ---: | ---: | --- | ---: | --- | ---: |'
  ];
  row.candidates.forEach((candidate) => {
    const marks = [];
    if (candidate.normalizedTileCode === normalizeTileCode(row.currentHardTile)) marks.push('hard');
    if (candidate.normalizedTileCode === normalizeTileCode(row.teacherTile)) marks.push('teacher');
    lines.push([
      `| \`${candidate.tileCode}\``,
      marks.join('+') || '-',
      formatNumber(candidate.metrics && candidate.metrics.xiangting, 0),
      formatNumber(candidate.hardMetrics && candidate.hardMetrics.hardEvScore, 0),
      formatNumber(candidate.shape && candidate.shape.discardShapeScore, 0),
      candidate.shape && candidate.shape.discardTileRole || '-',
      formatNumber(candidate.danger && candidate.danger.dangerScore, 0),
      routeReasonText(candidate.route),
      formatNumber(candidate.mortal && candidate.mortal.qDeltaFromBest, 3)
    ].join(' | ') + ' |');
  });
  return lines.join('\n');
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# H14 P6 Route Review Pack');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- total: ${report.summary.total}`);
  lines.push(`- likely-bad-route: ${report.summary.likelyBadCount}`);
  lines.push(`- needs-human-review: ${report.summary.needsHumanReviewCount}`);
  lines.push(`- byAssessment: \`${JSON.stringify(report.summary.byAssessment)}\``);
  lines.push('');
  lines.push('## Rows');
  lines.push('');
  report.rows.forEach((row, index) => {
    const fixed = row.fixedState || {};
    lines.push(`### ${index + 1}. ${row.id}`);
    lines.push('');
    lines.push(`- assessment: \`${row.autoAssessment.label}\` (${row.autoAssessment.reasons.join(', ') || 'no-reason'})`);
    lines.push(`- category: \`${row.category}\`, replay: \`${row.replayClassification || 'none'}\`, qDelta: \`${formatNumber(row.qDelta, 3)}\``);
    lines.push(`- seat: \`${row.targetSeat || 'n/a'}\`, remaining: \`${formatNumber(row.remaining, 0)}\`, dora: \`${(fixed.doraIndicators || []).join(',') || '-'}\` -> \`${(fixed.doraTiles || []).join(',') || '-'}\``);
    lines.push(`- hand: \`${(fixed.handCodes || []).join(' ') || '-'}\`, melds: \`${(fixed.melds || []).join(' ') || '-'}\``);
    lines.push(`- hard: \`${row.currentHardTile || '-'}\`, teacher: \`${row.teacherTile || '-'}\``);
    if (row.routeDelta) {
      lines.push(`- routeDelta: hardRisk \`${row.routeDelta.hardRouteRisk}\`, teacherRisk \`${row.routeDelta.teacherRouteRisk}\`, delta \`${row.routeDelta.riskDelta}\``);
    }
    lines.push('');
    lines.push(renderCandidateTable(row));
    lines.push('');
  });
  return `${lines.join('\n')}\n`;
}

function parseArgs(argv = []) {
  const args = {
    help: false,
    ledger: DEFAULT_LEDGER_PATH,
    pool: DEFAULT_POOL_PATH,
    tileChoiceReplay: DEFAULT_TILE_CHOICE_REPLAY_PATH,
    jsonOut: DEFAULT_JSON_OUT_PATH,
    mdOut: DEFAULT_MD_OUT_PATH,
    stdout: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }
    if (token === '--ledger') {
      args.ledger = String(argv[index + 1] || '').trim() || args.ledger;
      index += 1;
      continue;
    }
    if (token === '--pool') {
      args.pool = String(argv[index + 1] || '').trim() || args.pool;
      index += 1;
      continue;
    }
    if (token === '--tile-choice-replay') {
      args.tileChoiceReplay = String(argv[index + 1] || '').trim() || args.tileChoiceReplay;
      index += 1;
      continue;
    }
    if (token === '--json-out' || token === '--out') {
      args.jsonOut = String(argv[index + 1] || '').trim() || args.jsonOut;
      index += 1;
      continue;
    }
    if (token === '--md-out') {
      args.mdOut = String(argv[index + 1] || '').trim() || args.mdOut;
      index += 1;
      continue;
    }
    if (token === '--stdout') args.stdout = true;
  }
  return args;
}

function printHelp() {
  console.log('Usage: node games/majiang/scripts/build-hard-ai-route-review-pack.js [options]');
  console.log('');
  console.log('Options:');
  console.log('  --ledger <path>              H14 P5 experimental ledger.');
  console.log('  --pool <path>                H14 P1 repair candidate pool.');
  console.log('  --tile-choice-replay <path>  H14 P4 tile-choice replay report.');
  console.log('  --json-out <path>            JSON output path.');
  console.log('  --md-out <path>              Markdown output path.');
  console.log('  --stdout                     Also print compact summary JSON.');
}

function loadInputs(args) {
  const paths = {
    ledger: args.ledger,
    pool: args.pool,
    tileChoiceReplay: args.tileChoiceReplay
  };
  return {
    inputs: Object.fromEntries(Object.entries(paths).map(([key, value]) => [key, value ? path.resolve(value) : null])),
    data: {
      ledger: readJsonIfExists(args.ledger),
      pool: readJsonIfExists(args.pool),
      tileChoiceReplay: readJsonIfExists(args.tileChoiceReplay)
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
  const report = buildRouteReviewPack(loaded.data, {
    jsonOut: args.jsonOut,
    mdOut: args.mdOut,
    inputs: loaded.inputs
  });
  writeJson(args.jsonOut, report);
  writeText(args.mdOut, renderMarkdown(report));
  const summary = {
    jsonOut: path.resolve(args.jsonOut),
    mdOut: path.resolve(args.mdOut),
    summary: report.summary
  };
  console.log(args.stdout ? JSON.stringify(report, null, 2) : JSON.stringify(summary, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  DEFAULT_LEDGER_PATH,
  DEFAULT_POOL_PATH,
  DEFAULT_TILE_CHOICE_REPLAY_PATH,
  DEFAULT_JSON_OUT_PATH,
  DEFAULT_MD_OUT_PATH,
  normalizeTileCode,
  inferRoute,
  routeRiskScore,
  autoAssessRoute,
  buildRouteReviewPack,
  renderMarkdown,
  parseArgs
};
