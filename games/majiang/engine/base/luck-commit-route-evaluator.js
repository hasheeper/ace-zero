(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('../../shared/runtime/luck'),
      require('../ai/support/danger-model')
    );
    return;
  }

  root.AceMahjongLuckCommitRouteEvaluator = factory(
    root.AceMahjongLuck,
    root.AceMahjongAiDangerModel || null
  );
})(typeof globalThis !== 'undefined' ? globalThis : this, function(luck, dangerModelApi) {
  'use strict';

  const SELECTABLE_CONFIDENCE = 0.35;
  const ROUTE_IDS = Object.freeze({
    AUTO: 'auto',
    SHAPE_SEQUENCE: 'shape-sequence',
    SHAPE_PAIR: 'shape-pair',
    SHAPE_TRIPLET: 'shape-triplet',
    SUIT_M: 'suit-m',
    SUIT_P: 'suit-p',
    SUIT_S: 'suit-s',
    HONOR: 'honor',
    SEAT_WIND: 'seat-wind',
    ROUND_WIND: 'round-wind',
    YAKUHAI: 'yakuhai',
    DORA: 'dora'
  });

  const ROUTE_LABELS = Object.freeze({
    [ROUTE_IDS.AUTO]: '自动',
    [ROUTE_IDS.SHAPE_SEQUENCE]: '顺子',
    [ROUTE_IDS.SHAPE_PAIR]: '对子',
    [ROUTE_IDS.SHAPE_TRIPLET]: '刻子',
    [ROUTE_IDS.SUIT_M]: '万染',
    [ROUTE_IDS.SUIT_P]: '筒染',
    [ROUTE_IDS.SUIT_S]: '索染',
    [ROUTE_IDS.HONOR]: '字牌',
    [ROUTE_IDS.SEAT_WIND]: '自风',
    [ROUTE_IDS.ROUND_WIND]: '场风',
    [ROUTE_IDS.YAKUHAI]: '役牌',
    [ROUTE_IDS.DORA]: '宝牌'
  });

  function numberOr(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, numberOr(value, min)));
  }

  function normalizeTileCode(tileCode) {
    if (luck && typeof luck.normalizeTileCode === 'function') return luck.normalizeTileCode(tileCode);
    const stripped = String(tileCode || '').trim().replace(/[\*_\+\=\-]+$/g, '');
    const redFive = stripped.match(/^([mps])0$/);
    const normalized = redFive ? `${redFive[1]}5` : stripped;
    return /^[mps][1-9]$/.test(normalized) || /^z[1-7]$/.test(normalized) ? normalized : null;
  }

  function isRedFive(tileCode) {
    return /^[mps]0$/.test(String(tileCode || '').trim().replace(/[\*_\+\=\-]+$/g, ''));
  }

  function countTiles(tileCodes = []) {
    return (Array.isArray(tileCodes) ? tileCodes : []).reduce((counts, tileCode) => {
      const normalized = normalizeTileCode(tileCode);
      if (!normalized) return counts;
      counts[normalized] = Number(counts[normalized] || 0) + 1;
      return counts;
    }, Object.create(null));
  }

  function hasTile(counts, tileCode) {
    return Number(counts[tileCode] || 0) > 0;
  }

  function getSuitCounts(counts) {
    return ['m', 'p', 's'].reduce((result, suit) => {
      result[suit] = Object.keys(counts).reduce((sum, tileCode) => (
        tileCode[0] === suit ? sum + Number(counts[tileCode] || 0) : sum
      ), 0);
      return result;
    }, {});
  }

  function getHonorCount(counts) {
    return Object.keys(counts).reduce((sum, tileCode) => (
      tileCode[0] === 'z' ? sum + Number(counts[tileCode] || 0) : sum
    ), 0);
  }

  function getPairCount(counts) {
    return Object.keys(counts).filter((tileCode) => Number(counts[tileCode] || 0) >= 2).length;
  }

  function getTripletCount(counts) {
    return Object.keys(counts).filter((tileCode) => Number(counts[tileCode] || 0) >= 3).length;
  }

  function countSequenceLinks(counts) {
    let adjacent = 0;
    let skip = 0;
    ['m', 'p', 's'].forEach((suit) => {
      for (let rank = 1; rank <= 8; rank += 1) {
        if (hasTile(counts, `${suit}${rank}`) && hasTile(counts, `${suit}${rank + 1}`)) adjacent += 1;
      }
      for (let rank = 1; rank <= 7; rank += 1) {
        if (hasTile(counts, `${suit}${rank}`) && hasTile(counts, `${suit}${rank + 2}`)) skip += 1;
      }
    });
    return { adjacent, skip };
  }

  function getRoundWindTile(roundConfig = {}) {
    const zhuangfeng = clamp(Math.floor(numberOr(roundConfig.zhuangfeng, 0)), 0, 3);
    return `z${zhuangfeng + 1}`;
  }

  function getSeatWindTile(input = {}) {
    if (input.seatWindTile) {
      const explicit = normalizeTileCode(input.seatWindTile);
      if (explicit && /^z[1-4]$/.test(explicit)) return explicit;
    }
    if (input.roundConfig && Number.isFinite(Number(input.roundConfig.menfeng))) {
      return `z${clamp(Math.floor(Number(input.roundConfig.menfeng)), 0, 3) + 1}`;
    }
    const activeSeats = Array.isArray(input.activeSeats) && input.activeSeats.length
      ? input.activeSeats
      : ['bottom', 'right', 'top', 'left'];
    const seat = input.seat || 'bottom';
    const dealerSeat = input.dealerSeat || activeSeats[0] || 'bottom';
    const seatIndex = Math.max(0, activeSeats.indexOf(seat));
    const dealerIndex = Math.max(0, activeSeats.indexOf(dealerSeat));
    const offset = (seatIndex - dealerIndex + activeSeats.length) % activeSeats.length;
    return `z${clamp(offset, 0, 3) + 1}`;
  }

  function getDoraTileFromIndicator(indicator) {
    if (!indicator) return null;
    if (dangerModelApi && typeof dangerModelApi.getDoraTileFromIndicator === 'function') {
      const fromApi = dangerModelApi.getDoraTileFromIndicator(indicator);
      if (fromApi) return normalizeTileCode(fromApi);
    }
    const normalized = normalizeTileCode(indicator);
    if (!normalized) return null;
    const suit = normalized[0];
    const rank = Number(normalized[1]);
    if (suit === 'z') {
      if (rank >= 1 && rank <= 4) return `z${rank === 4 ? 1 : rank + 1}`;
      if (rank >= 5 && rank <= 7) return `z${rank === 7 ? 5 : rank + 1}`;
      return null;
    }
    return `${suit}${rank === 9 ? 1 : rank + 1}`;
  }

  function getDoraTiles(input = {}) {
    const wallState = input.wallState && typeof input.wallState === 'object' ? input.wallState : {};
    const indicators = Array.isArray(wallState.doraIndicators)
      ? wallState.doraIndicators
      : Array.isArray(wallState.baopai)
        ? wallState.baopai
        : [];
    const revealed = Number.isFinite(Number(wallState.revealedDoraCount))
      ? Math.max(0, Math.floor(Number(wallState.revealedDoraCount)))
      : indicators.length;
    return indicators
      .slice(0, revealed)
      .map(getDoraTileFromIndicator)
      .filter(Boolean);
  }

  function createRoute(routeId, confidence, family, reason, extra = {}) {
    const clamped = clamp(confidence, 0, 1);
    return {
      routeId,
      label: ROUTE_LABELS[routeId] || routeId,
      family,
      confidence: clamped,
      selectable: routeId === ROUTE_IDS.AUTO || clamped >= SELECTABLE_CONFIDENCE,
      reason: reason || null,
      ...extra
    };
  }

  function publicRoute(route) {
    return {
      routeId: route.routeId,
      label: route.label,
      family: route.family,
      confidence: route.confidence,
      selectable: Boolean(route.selectable)
    };
  }

  function sortRoutes(routes) {
    return routes.slice().sort((left, right) => {
      if (left.selectable !== right.selectable) return left.selectable ? -1 : 1;
      if (right.confidence !== left.confidence) return right.confidence - left.confidence;
      return String(left.routeId).localeCompare(String(right.routeId));
    });
  }

  function detectCommitRoutes(input = {}) {
    const handCodes = Array.isArray(input.handCodes) ? input.handCodes : [];
    const counts = countTiles(handCodes);
    const suitCounts = getSuitCounts(counts);
    const honorCount = getHonorCount(counts);
    const pairCount = getPairCount(counts);
    const tripletCount = getTripletCount(counts);
    const links = countSequenceLinks(counts);
    const suitedCount = suitCounts.m + suitCounts.p + suitCounts.s;
    const seatWindTile = getSeatWindTile(input);
    const roundWindTile = getRoundWindTile(input.roundConfig || {});
    const doraTiles = getDoraTiles(input);
    const redFiveCount = handCodes.filter(isRedFive).length;
    const doraInHand = handCodes.reduce((sum, tileCode) => {
      const normalized = normalizeTileCode(tileCode);
      return normalized && doraTiles.includes(normalized) ? sum + 1 : sum;
    }, 0);
    const detected = [];

    detected.push(createRoute(
      ROUTE_IDS.SHAPE_SEQUENCE,
      (links.adjacent + links.skip * 0.55) / 6 + suitedCount / 30,
      'shape',
      'suited links'
    ));
    detected.push(createRoute(
      ROUTE_IDS.SHAPE_PAIR,
      (pairCount - 1) / 4 + tripletCount * 0.08,
      'shape',
      'pair count'
    ));
    detected.push(createRoute(
      ROUTE_IDS.SHAPE_TRIPLET,
      pairCount / 4 + tripletCount * 0.24,
      'shape',
      'pair/triplet count'
    ));

    ['m', 'p', 's'].forEach((suit) => {
      const same = suitCounts[suit] || 0;
      const offSuit = suitedCount - same;
      detected.push(createRoute(
        `suit-${suit}`,
        (same - 4) / 7 + Math.max(0, honorCount - 1) * 0.035 - offSuit * 0.035,
        'suit',
        `${suit} suit count`,
        { suit }
      ));
    });

    const honorPairCount = Object.keys(counts).filter((tileCode) => (
      tileCode[0] === 'z' && Number(counts[tileCode] || 0) >= 2
    )).length;
    detected.push(createRoute(
      ROUTE_IDS.HONOR,
      (honorCount - 2) / 5 + honorPairCount * 0.12,
      'honor',
      'honor count'
    ));

    const seatWindCount = Number(counts[seatWindTile] || 0);
    const roundWindCount = Number(counts[roundWindTile] || 0);
    detected.push(createRoute(
      ROUTE_IDS.SEAT_WIND,
      seatWindCount > 0 ? 0.2 + seatWindCount * 0.2 : 0,
      'honor',
      'seat wind',
      { tileCode: seatWindTile }
    ));
    detected.push(createRoute(
      ROUTE_IDS.ROUND_WIND,
      roundWindCount > 0 ? 0.2 + roundWindCount * 0.2 : 0,
      'honor',
      'round wind',
      { tileCode: roundWindTile }
    ));

    const yakuhaiTiles = Array.from(new Set(['z5', 'z6', 'z7', seatWindTile, roundWindTile].filter(Boolean)));
    const yakuhaiCount = yakuhaiTiles.reduce((sum, tileCode) => sum + Number(counts[tileCode] || 0), 0);
    const yakuhaiPairCount = yakuhaiTiles.filter((tileCode) => Number(counts[tileCode] || 0) >= 2).length;
    detected.push(createRoute(
      ROUTE_IDS.YAKUHAI,
      (yakuhaiCount - 1) / 4 + yakuhaiPairCount * 0.2,
      'honor',
      'yakuhai count',
      { tileCodes: yakuhaiTiles }
    ));

    detected.push(createRoute(
      ROUTE_IDS.DORA,
      (doraInHand + redFiveCount) * 0.22 + Math.max(0, doraInHand - 1) * 0.14,
      'value',
      'visible dora in hand',
      { tileCodes: doraTiles }
    ));

    const sorted = sortRoutes(detected);
    const best = sorted.find((route) => route.selectable) || sorted[0] || null;
    return [
      createRoute(
        ROUTE_IDS.AUTO,
        best ? best.confidence : 0,
        'auto',
        best ? `auto:${best.routeId}` : 'auto'
      ),
      ...sorted
    ];
  }

  function buildCommitRouteSelection(input = {}, requestedRouteId = null) {
    const routes = detectCommitRoutes(input);
    const normalizedRequest = requestedRouteId || ROUTE_IDS.AUTO;
    const selectableRoutes = routes.filter((route) => route.routeId !== ROUTE_IDS.AUTO && route.selectable);
    const bestRoute = selectableRoutes[0] || null;
    const requested = routes.find((route) => route.routeId === normalizedRequest) || null;
    let selectedRoute = null;
    let blockedReason = null;

    if (!normalizedRequest || normalizedRequest === ROUTE_IDS.AUTO) {
      selectedRoute = bestRoute || routes[0] || null;
    } else if (requested && requested.selectable) {
      selectedRoute = requested;
    } else if (requested) {
      selectedRoute = requested;
      blockedReason = 'route-confidence-too-low';
    } else {
      selectedRoute = null;
      blockedReason = 'route-not-detected';
    }

    const rawConfidence = selectedRoute ? selectedRoute.confidence : 0;
    const routeConfidence = blockedReason ? rawConfidence * 0.35 : rawConfidence;
    return {
      requestedRouteId: normalizedRequest,
      selectedRouteId: selectedRoute ? selectedRoute.routeId : ROUTE_IDS.AUTO,
      routeConfidence: clamp(routeConfidence, 0, 1),
      blockedReason,
      selectedRoute: selectedRoute ? publicRoute(selectedRoute) : publicRoute(routes[0]),
      routes: routes.map(publicRoute)
    };
  }

  function genericCommitScore(tileCode, counts) {
    const normalized = normalizeTileCode(tileCode);
    if (!normalized) return 0;
    const suit = normalized[0];
    const rank = Number(normalized[1]);
    const suitCounts = getSuitCounts(counts);
    const dominantSuit = Object.entries(suitCounts)
      .map(([entrySuit, count]) => ({ suit: entrySuit, count }))
      .sort((left, right) => right.count - left.count)[0];
    let score = 0;

    if (dominantSuit && dominantSuit.count >= 5) {
      if (suit === dominantSuit.suit) score += 0.38;
      else if (suit !== 'z') score -= 0.22;
      else score -= 0.08;
    }

    const sameCount = Number(counts[normalized] || 0);
    if (sameCount === 1) score += 0.2;
    if (sameCount >= 2) score += 0.35;

    if (suit !== 'z') {
      const neighbor = hasTile(counts, `${suit}${rank - 1}`) || hasTile(counts, `${suit}${rank + 1}`);
      const skip = hasTile(counts, `${suit}${rank - 2}`) || hasTile(counts, `${suit}${rank + 2}`);
      if (neighbor) score += 0.25;
      else if (skip) score += 0.1;
      else score -= 0.12;
    }

    return clamp(score, -1, 1);
  }

  function scoreRouteTile(tileCode, input = {}, selection = null) {
    const normalized = normalizeTileCode(tileCode);
    if (!normalized) return 0;
    const counts = countTiles(input.handCodes || []);
    const selected = selection || buildCommitRouteSelection(input, input.commitRouteId);
    const routeId = selected && selected.selectedRouteId ? selected.selectedRouteId : ROUTE_IDS.AUTO;
    const confidence = selected ? clamp(selected.routeConfidence, 0, 1) : 0;
    const suit = normalized[0];
    const rank = Number(normalized[1]);
    const sameCount = Number(counts[normalized] || 0);
    const seatWindTile = getSeatWindTile(input);
    const roundWindTile = getRoundWindTile(input.roundConfig || {});
    const doraTiles = getDoraTiles(input);
    let raw = 0;

    if (routeId === ROUTE_IDS.SHAPE_SEQUENCE || routeId === ROUTE_IDS.AUTO) {
      raw = genericCommitScore(normalized, counts);
      if (routeId === ROUTE_IDS.SHAPE_SEQUENCE) {
        if (suit === 'z') raw = -0.34;
        else {
          const neighbor = hasTile(counts, `${suit}${rank - 1}`) || hasTile(counts, `${suit}${rank + 1}`);
          const skip = hasTile(counts, `${suit}${rank - 2}`) || hasTile(counts, `${suit}${rank + 2}`);
          raw = neighbor ? 0.62 : skip ? 0.36 : -0.14;
        }
      }
    } else if (routeId === ROUTE_IDS.SHAPE_PAIR) {
      raw = sameCount >= 1 ? 0.68 : (suit === 'z' ? -0.08 : -0.2);
      if (sameCount >= 2) raw += 0.08;
    } else if (routeId === ROUTE_IDS.SHAPE_TRIPLET) {
      raw = sameCount >= 2 ? 0.86 : sameCount === 1 ? 0.28 : -0.22;
      if (suit === 'z' && sameCount >= 1) raw += 0.08;
    } else if (/^suit-[mps]$/.test(routeId)) {
      const targetSuit = routeId.slice(-1);
      raw = suit === targetSuit ? 0.78 : suit === 'z' ? 0.1 : -0.46;
    } else if (routeId === ROUTE_IDS.HONOR) {
      raw = suit === 'z' ? 0.66 : (rank === 1 || rank === 9 ? 0.03 : -0.28);
    } else if (routeId === ROUTE_IDS.SEAT_WIND) {
      raw = normalized === seatWindTile ? 0.92 : suit === 'z' ? 0.08 : -0.22;
    } else if (routeId === ROUTE_IDS.ROUND_WIND) {
      raw = normalized === roundWindTile ? 0.92 : suit === 'z' ? 0.08 : -0.22;
    } else if (routeId === ROUTE_IDS.YAKUHAI) {
      raw = ['z5', 'z6', 'z7', seatWindTile, roundWindTile].includes(normalized)
        ? 0.76
        : suit === 'z'
          ? 0.04
          : -0.2;
    } else if (routeId === ROUTE_IDS.DORA) {
      const doraHit = doraTiles.includes(normalized);
      const redFive = /^[mps]5$/.test(normalized) && (input.handCodes || []).some(isRedFive);
      if (doraHit) raw = 0.9;
      else if (redFive) raw = 0.46;
      else if (suit !== 'z' && doraTiles.some((doraTile) => (
        doraTile[0] === suit && Math.abs(Number(doraTile[1]) - rank) <= 1
      ))) raw = 0.12;
      else raw = -0.08;
    } else {
      raw = genericCommitScore(normalized, counts);
    }

    return clamp(raw * confidence, -1, 1);
  }

  return {
    ROUTE_IDS,
    ROUTE_LABELS,
    SELECTABLE_CONFIDENCE,
    detectCommitRoutes,
    buildCommitRouteSelection,
    scoreRouteTile
  };
});
