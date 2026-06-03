(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./discard-candidates')
    );
    return;
  }

  root.AceMahjongAiHardCandidateDiagnostics = factory(
    root.AceMahjongAiDiscardCandidates || null
  );
})(typeof globalThis !== 'undefined' ? globalThis : this, function(discardCandidatesApi) {
  'use strict';

  function getHardShapeMetrics(candidate) {
    if (discardCandidatesApi && typeof discardCandidatesApi.getHardShapeMetrics === 'function') {
      return discardCandidatesApi.getHardShapeMetrics(candidate);
    }
    return candidate && candidate.__hardShapeMetrics ? candidate.__hardShapeMetrics : null;
  }

  function compactHardMetrics(metrics = null) {
    if (!metrics || typeof metrics !== 'object') return null;
    return {
      hardEvScore: Number(metrics.hardEvScore || 0) || 0,
      liveUkeireCount: Number(metrics.liveUkeireCount || 0) || 0,
      liveTingpaiCount: Number(metrics.liveTingpaiCount || 0) || 0,
      waitQualityScore: Number(metrics.waitQualityScore || 0) || 0,
      bestWaitType: typeof metrics.bestWaitType === 'string' ? metrics.bestWaitType : null,
      contextualHandValueEstimate: Number(metrics.contextualHandValueEstimate || 0) || 0
    };
  }

  function compactShapeMetrics(metrics = null) {
    if (!metrics || typeof metrics !== 'object') return null;
    return {
      discardShapeScore: Number(metrics.discardShapeScore || 0) || 0,
      discardTileRole: typeof metrics.discardTileRole === 'string' ? metrics.discardTileRole : 'unknown',
      keptUsefulMiddleCount: Number(metrics.keptUsefulMiddleCount || 0) || 0,
      weakTerminalCleanupBonus: Number(metrics.weakTerminalCleanupBonus || 0) || 0,
      isolatedHonorCleanupBonus: Number(metrics.isolatedHonorCleanupBonus || 0) || 0,
      middleTileCutPenalty: Number(metrics.middleTileCutPenalty || 0) || 0,
      fiveOrRedFiveCutPenalty: Number(metrics.fiveOrRedFiveCutPenalty || 0) || 0,
      doraRetentionPenalty: Number(metrics.doraRetentionPenalty || 0) || 0,
      pairOrBlockBreakPenalty: Number(metrics.pairOrBlockBreakPenalty || 0) || 0,
      reasons: Array.isArray(metrics.reasons) ? metrics.reasons.slice() : []
    };
  }

  function compactDanger(danger = null) {
    if (!danger || typeof danger !== 'object') {
      return {
        dangerScore: 0,
        safetyRank: null,
        defenseTileRank: null,
        categories: [],
        reasons: [],
        safetyReasons: []
      };
    }
    return {
      dangerScore: Number(danger.dangerScore || 0) || 0,
      safetyRank: Number.isFinite(Number(danger.safetyRank)) ? Number(danger.safetyRank) : null,
      defenseTileRank: Number.isFinite(Number(danger.defenseTileRank)) ? Number(danger.defenseTileRank) : null,
      categories: Array.isArray(danger.categories) ? danger.categories.slice() : [],
      reasons: Array.isArray(danger.reasons) ? danger.reasons.slice() : [],
      safetyReasons: Array.isArray(danger.safetyReasons) ? danger.safetyReasons.slice() : []
    };
  }

  function normalizeTileCode(tileCode) {
    if (typeof tileCode !== 'string' || tileCode.length < 2) return null;
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

  function getTileCounts(shoupai) {
    const counts = Object.create(null);
    if (!shoupai || !shoupai._bingpai) return counts;
    ['m', 'p', 's', 'z'].forEach((suit) => {
      const maxRank = suit === 'z' ? 7 : 9;
      const tiles = shoupai._bingpai[suit] || [];
      for (let rank = 1; rank <= maxRank; rank += 1) {
        const count = Number(tiles[rank] || 0) || 0;
        if (count > 0) counts[`${suit}${rank}`] = count;
      }
    });
    return counts;
  }

  function countOf(counts, tileCode) {
    const normalized = normalizeTileCode(tileCode);
    return normalized ? Number(counts[normalized] || 0) || 0 : 0;
  }

  function getDoraIndicatorCodes(runtime) {
    const wallState = runtime && typeof runtime.getWallState === 'function'
      ? runtime.getWallState()
      : null;
    if (wallState && Array.isArray(wallState.doraIndicators)) return wallState.doraIndicators.filter(Boolean);
    if (wallState && Array.isArray(wallState.baopai)) return wallState.baopai.filter(Boolean);
    return runtime && runtime.board && runtime.board.shan && Array.isArray(runtime.board.shan.baopai)
      ? runtime.board.shan.baopai.filter(Boolean)
      : [];
  }

  function getDoraTileFromIndicator(indicatorCode) {
    const normalized = normalizeTileCode(indicatorCode);
    if (!normalized) return null;
    const suit = normalized[0];
    const rank = Number(normalized[1]);
    if (suit !== 'z') return `${suit}${rank === 9 ? 1 : rank + 1}`;
    if (rank >= 1 && rank <= 4) return `z${rank === 4 ? 1 : rank + 1}`;
    if (rank >= 5 && rank <= 7) return `z${rank === 7 ? 5 : rank + 1}`;
    return null;
  }

  function getDoraTiles(runtime) {
    return getDoraIndicatorCodes(runtime)
      .map((indicatorCode) => getDoraTileFromIndicator(indicatorCode))
      .filter(Boolean);
  }

  function isDoraAdjacent(tileCode, doraTileCode) {
    const tile = normalizeTileCode(tileCode);
    const dora = normalizeTileCode(doraTileCode);
    if (!tile || !dora || tile[0] === 'z' || dora[0] === 'z' || tile[0] !== dora[0]) return false;
    return Math.abs(Number(tile[1]) - Number(dora[1])) === 1;
  }

  function getRoundWind(runtime) {
    const zhuangfeng = runtime && runtime.board && Number.isFinite(Number(runtime.board.zhuangfeng))
      ? Number(runtime.board.zhuangfeng)
      : 0;
    return `z${zhuangfeng + 1}`;
  }

  function getDealerSeat(runtime) {
    if (runtime && typeof runtime.getDealerSeat === 'function') return runtime.getDealerSeat();
    const activeSeats = runtime && Array.isArray(runtime.activeSeats) && runtime.activeSeats.length
      ? runtime.activeSeats
      : ['bottom', 'right', 'top', 'left'];
    const dealerIndex = runtime && runtime.board && Number.isFinite(Number(runtime.board.jushu))
      ? Number(runtime.board.jushu) % activeSeats.length
      : 0;
    return activeSeats[dealerIndex] || 'bottom';
  }

  function getSeatWind(runtime, seatKey) {
    const activeSeats = runtime && Array.isArray(runtime.activeSeats) && runtime.activeSeats.length
      ? runtime.activeSeats
      : ['bottom', 'right', 'top', 'left'];
    const seatIndex = activeSeats.indexOf(seatKey);
    const dealerIndex = activeSeats.indexOf(getDealerSeat(runtime));
    if (seatIndex < 0 || dealerIndex < 0) return null;
    return `z${((seatIndex - dealerIndex + activeSeats.length) % activeSeats.length) + 1}`;
  }

  function isValueHonor(runtime, seatKey, tileCode) {
    const normalized = normalizeTileCode(tileCode);
    if (!normalized || normalized[0] !== 'z') return false;
    if (['z5', 'z6', 'z7'].includes(normalized)) return true;
    return normalized === getRoundWind(runtime) || normalized === getSeatWind(runtime, seatKey);
  }

  function hasTile(counts, tileCode) {
    return countOf(counts, tileCode) > 0;
  }

  function breaksRyanmenBlock(beforeCounts, tileCode) {
    const normalized = normalizeTileCode(tileCode);
    if (!normalized || normalized[0] === 'z') return false;
    const suit = normalized[0];
    const rank = Number(normalized[1]);
    if (rank < 3 || rank > 7) return false;
    return hasTile(beforeCounts, `${suit}${rank - 1}`) || hasTile(beforeCounts, `${suit}${rank + 1}`);
  }

  function compactRoute(candidate, input = {}, shapeMetrics = null) {
    const runtime = input && input.runtime ? input.runtime : null;
    const seatKey = input && input.seatKey ? input.seatKey : null;
    const tileCode = candidate && candidate.tileCode ? candidate.tileCode : null;
    const normalized = normalizeTileCode(tileCode);
    const beforeCounts = getTileCounts(input && input.shoupai);
    const beforeCount = countOf(beforeCounts, normalized);
    const afterCount = Math.max(0, beforeCount - (normalized ? 1 : 0));
    const doraTiles = getDoraTiles(runtime);
    const discardIsDora = Boolean(normalized && doraTiles.includes(normalized));
    const discardAdjacentToDora = Boolean(
      normalized
      && !discardIsDora
      && doraTiles.some((doraTileCode) => isDoraAdjacent(normalized, doraTileCode))
    );
    const isFive = Boolean(normalized && /^[mps]5$/.test(normalized));
    const redFive = isRedFive(tileCode);
    const valueHonor = isValueHonor(runtime, seatKey, normalized);
    const breaksPair = beforeCount === 2 && afterCount === 1;
    const breaksTriplet = beforeCount >= 3 && afterCount < beforeCount;
    const ryanmenBreak = breaksRyanmenBlock(beforeCounts, normalized);
    const closedHand = Boolean(input && input.shoupai && Array.isArray(input.shoupai._fulou) && input.shoupai._fulou.length === 0);
    const xiangting = candidate && candidate.metrics && Number.isFinite(Number(candidate.metrics.xiangting))
      ? Number(candidate.metrics.xiangting)
      : null;
    const reasons = [];
    if (discardIsDora) reasons.push('route-cuts-dora');
    if (discardAdjacentToDora) reasons.push('route-cuts-dora-adjacent');
    if (redFive) reasons.push('route-cuts-red-five');
    else if (isFive) reasons.push('route-cuts-five');
    if (valueHonor) reasons.push('route-cuts-value-honor');
    if (valueHonor && breaksPair) reasons.push('route-breaks-yakuhai-pair');
    if (ryanmenBreak) reasons.push('route-breaks-ryanmen-block');
    if (breaksPair) reasons.push('route-breaks-pair');
    if (breaksTriplet) reasons.push('route-breaks-triplet');

    const keepsDoraCount = doraTiles.reduce((sum, doraTileCode) => (
      sum + (doraTileCode === normalized ? afterCount : countOf(beforeCounts, doraTileCode))
    ), 0);
    const keepsFiveCount = ['m5', 'p5', 's5'].reduce((sum, fiveTileCode) => (
      sum + (fiveTileCode === normalized ? afterCount : countOf(beforeCounts, fiveTileCode))
    ), 0);
    const yakuhaiTiles = ['z1', 'z2', 'z3', 'z4', 'z5', 'z6', 'z7']
      .filter((honorTileCode) => isValueHonor(runtime, seatKey, honorTileCode));
    const keepsYakuhaiCount = yakuhaiTiles.reduce((sum, honorTileCode) => (
      sum + (honorTileCode === normalized ? afterCount : countOf(beforeCounts, honorTileCode))
    ), 0);
    const breaksValueRoute = Boolean(discardIsDora || redFive || (valueHonor && breaksPair));
    const closedRiichiRouteRisk = Boolean(
      closedHand
      && xiangting != null
      && xiangting <= 1
      && (ryanmenBreak || discardIsDora || redFive || isFive || breaksValueRoute)
    );
    if (breaksValueRoute) reasons.push('route-breaks-value-route');
    if (closedRiichiRouteRisk) reasons.push('route-closed-riichi-route-risk');

    return {
      discardIsDora,
      discardAdjacentToDora,
      keepsDoraCount,
      cutsFive: isFive,
      cutsRedFive: redFive,
      keepsFiveCount,
      cutsYakuhai: valueHonor,
      keepsYakuhaiCount,
      breaksYakuhaiPair: Boolean(valueHonor && breaksPair),
      breaksRyanmenBlock: ryanmenBreak,
      breaksValueRoute,
      closedRiichiRouteRisk,
      discardTileRole: shapeMetrics && typeof shapeMetrics.discardTileRole === 'string'
        ? shapeMetrics.discardTileRole
        : null,
      reasons
    };
  }

  function compactCandidateDiagnostics(candidate, initialDecision, finalDecision, input = {}) {
    const metrics = candidate && candidate.metrics && typeof candidate.metrics === 'object'
      ? candidate.metrics
      : {};
    const shapeMetrics = getHardShapeMetrics(candidate);
    return {
      tileCode: candidate && candidate.tileCode ? candidate.tileCode : null,
      tileIndex: Number.isFinite(Number(candidate && candidate.tileIndex)) ? Number(candidate.tileIndex) : null,
      isDrawDiscard: Boolean(candidate && candidate.isDrawDiscard),
      selectedInitial: Boolean(candidate && candidate === initialDecision),
      selectedFinal: Boolean(candidate && candidate === finalDecision),
      metrics: {
        xiangting: Number.isFinite(Number(metrics.xiangting)) ? Number(metrics.xiangting) : null,
        tingpaiCount: Number(metrics.tingpaiCount || 0) || 0,
        ukeireCount: Number(metrics.ukeireCount || 0) || 0,
        handValueEstimate: Number(metrics.handValueEstimate || 0) || 0
      },
      danger: compactDanger(candidate && candidate.danger),
      hardMetrics: compactHardMetrics(candidate && candidate.hardMetrics),
      shape: compactShapeMetrics(shapeMetrics),
      route: compactRoute(candidate, input, shapeMetrics)
    };
  }

  function buildHardCandidateDiagnostics(candidateDecisions, initialDecision, finalDecision, input = {}) {
    const candidateApi = discardCandidatesApi || {};
    const diagnosticCandidateDecisions = typeof candidateApi.buildDiagnosticCandidateDecisions === 'function'
      ? candidateApi.buildDiagnosticCandidateDecisions(candidateDecisions, input)
      : (Array.isArray(candidateDecisions) ? candidateDecisions : []);
    return diagnosticCandidateDecisions
      .map((candidate) => compactCandidateDiagnostics(candidate, initialDecision, finalDecision, input));
  }

  return {
    compactCandidateDiagnostics,
    compactRoute,
    buildHardCandidateDiagnostics
  };
});
