'use strict';

const WIND_TILES = Object.freeze(['z1', 'z2', 'z3', 'z4']);
const DRAGON_TILES = Object.freeze(['z5', 'z6', 'z7']);
const SEAT_ORDER = Object.freeze(['bottom', 'right', 'top', 'left']);

function normalizeTileCode(tileCode) {
  if (typeof tileCode !== 'string' || !tileCode) return null;
  const normalized = String(tileCode).replace(/[\*_\+\=\-]+$/g, '');
  const redMatch = normalized.match(/^([mps])0$/);
  if (redMatch) return `${redMatch[1]}5`;
  return normalized;
}

function tileParts(tileCode) {
  const normalized = normalizeTileCode(tileCode);
  const match = normalized ? normalized.match(/^([mpsz])(\d)$/) : null;
  if (!match) return null;
  return {
    normalized,
    suit: match[1],
    rank: Number(match[2]),
    isHonor: match[1] === 'z'
  };
}

function isRedFive(tileCode) {
  return /^[mps]0/.test(String(tileCode || ''));
}

function makeCounts(tileCodes = []) {
  const counts = new Map();
  tileCodes.forEach((tileCode) => {
    const normalized = normalizeTileCode(tileCode);
    if (!normalized) return;
    counts.set(normalized, (counts.get(normalized) || 0) + 1);
  });
  return counts;
}

function countOf(counts, tileCode) {
  return counts.get(normalizeTileCode(tileCode)) || 0;
}

function cloneCounts(counts) {
  return new Map(counts);
}

function removeTile(counts, tileCode) {
  const normalized = normalizeTileCode(tileCode);
  if (!normalized) return counts;
  const next = cloneCounts(counts);
  const value = Math.max(0, (next.get(normalized) || 0) - 1);
  if (value) next.set(normalized, value);
  else next.delete(normalized);
  return next;
}

function doraFromIndicator(indicator) {
  const parts = tileParts(indicator);
  if (!parts) return null;
  if (parts.suit === 'm' || parts.suit === 'p' || parts.suit === 's') {
    const nextRank = parts.rank === 9 ? 1 : parts.rank + 1;
    return `${parts.suit}${nextRank}`;
  }
  if (parts.rank >= 1 && parts.rank <= 4) {
    return WIND_TILES[parts.rank % 4];
  }
  if (parts.rank >= 5 && parts.rank <= 7) {
    return DRAGON_TILES[(parts.rank - 4) % 3];
  }
  return null;
}

function resolveSeatWind(context = {}, seatKey = null) {
  const round = context.round || {};
  const dealerSeat = round.dealerSeat || null;
  const dealerIndex = SEAT_ORDER.indexOf(dealerSeat);
  const seatIndex = SEAT_ORDER.indexOf(seatKey);
  if (dealerIndex < 0 || seatIndex < 0) return null;
  return WIND_TILES[(seatIndex - dealerIndex + SEAT_ORDER.length) % SEAT_ORDER.length];
}

function resolveRoundWind(context = {}) {
  const round = context.round || {};
  const index = Number(round.zhuangfeng);
  return Number.isFinite(index) && index >= 0 && index <= 3 ? WIND_TILES[index] : null;
}

function isValueHonor(tileCode, context = {}, seatKey = null) {
  const normalized = normalizeTileCode(tileCode);
  if (!normalized || !normalized.startsWith('z')) return false;
  if (DRAGON_TILES.includes(normalized)) return true;
  return normalized === resolveRoundWind(context) || normalized === resolveSeatWind(context, seatKey);
}

function isDoraAdjacent(tileCode, doraTiles = []) {
  const parts = tileParts(tileCode);
  if (!parts || parts.isHonor) return false;
  return doraTiles.some((dora) => {
    const doraParts = tileParts(dora);
    return doraParts
      && !doraParts.isHonor
      && doraParts.suit === parts.suit
      && Math.abs(doraParts.rank - parts.rank) === 1;
  });
}

function getSuitCounts(tileCodes = []) {
  const counts = { m: 0, p: 0, s: 0, z: 0 };
  tileCodes.forEach((tileCode) => {
    const parts = tileParts(tileCode);
    if (parts && Object.prototype.hasOwnProperty.call(counts, parts.suit)) counts[parts.suit] += 1;
  });
  return counts;
}

function summarizeTiles(tileCodes = [], context = {}, seatKey = null) {
  const doraTiles = (context.doraIndicators || []).map(doraFromIndicator).filter(Boolean);
  const suitCounts = getSuitCounts(tileCodes);
  let terminalCount = 0;
  let honorCount = 0;
  let middleCount = 0;
  let fiveCount = 0;
  let redFiveCount = 0;
  let doraCount = 0;
  let doraAdjacentCount = 0;
  let valueHonorCount = 0;
  tileCodes.forEach((tileCode) => {
    const parts = tileParts(tileCode);
    if (!parts) return;
    if (parts.isHonor) honorCount += 1;
    else if (parts.rank === 1 || parts.rank === 9) terminalCount += 1;
    else if (parts.rank >= 3 && parts.rank <= 7) middleCount += 1;
    if (!parts.isHonor && parts.rank === 5) fiveCount += 1;
    if (isRedFive(tileCode)) redFiveCount += 1;
    if (doraTiles.includes(parts.normalized)) doraCount += 1;
    if (isDoraAdjacent(parts.normalized, doraTiles)) doraAdjacentCount += 1;
    if (isValueHonor(parts.normalized, context, seatKey)) valueHonorCount += 1;
  });
  const numberTileCount = suitCounts.m + suitCounts.p + suitCounts.s;
  const dominantSuitCount = Math.max(suitCounts.m, suitCounts.p, suitCounts.s);
  const suitedNonDominantCount = numberTileCount - dominantSuitCount;
  return {
    tileCount: tileCodes.length,
    suitMCount: suitCounts.m,
    suitPCount: suitCounts.p,
    suitSCount: suitCounts.s,
    honorCount,
    terminalCount,
    middleCount,
    fiveCount,
    redFiveCount,
    doraCount,
    doraAdjacentCount,
    valueHonorCount,
    dominantSuitCount,
    suitedNonDominantCount,
    tanyaoTileCount: middleCount,
    terminalHonorCount: terminalCount + honorCount
  };
}

function countGroups(counts) {
  let pairCount = 0;
  let tripletCount = 0;
  counts.forEach((value) => {
    if (value >= 2) pairCount += 1;
    if (value >= 3) tripletCount += 1;
  });
  return { pairCount, tripletCount };
}

function countSequenceWindows(counts) {
  let sequenceWindowCount = 0;
  let ryanmenWindowCount = 0;
  let kanchanWindowCount = 0;
  ['m', 'p', 's'].forEach((suit) => {
    for (let rank = 1; rank <= 7; rank += 1) {
      if (countOf(counts, `${suit}${rank}`) && countOf(counts, `${suit}${rank + 1}`) && countOf(counts, `${suit}${rank + 2}`)) {
        sequenceWindowCount += 1;
      }
    }
    for (let rank = 1; rank <= 8; rank += 1) {
      if (countOf(counts, `${suit}${rank}`) && countOf(counts, `${suit}${rank + 1}`)) {
        if (rank >= 2 && rank <= 7) ryanmenWindowCount += 1;
      }
    }
    for (let rank = 1; rank <= 7; rank += 1) {
      if (countOf(counts, `${suit}${rank}`) && countOf(counts, `${suit}${rank + 2}`)) {
        kanchanWindowCount += 1;
      }
    }
  });
  return { sequenceWindowCount, ryanmenWindowCount, kanchanWindowCount };
}

function countIsolated(counts) {
  let isolatedHonorCount = 0;
  let isolatedTerminalCount = 0;
  let isolatedMiddleCount = 0;
  counts.forEach((value, tileCode) => {
    if (value !== 1) return;
    const parts = tileParts(tileCode);
    if (!parts) return;
    if (parts.isHonor) {
      isolatedHonorCount += 1;
      return;
    }
    const neighbors = [-2, -1, 1, 2].reduce((total, offset) => {
      const rank = parts.rank + offset;
      if (rank < 1 || rank > 9) return total;
      return total + countOf(counts, `${parts.suit}${rank}`);
    }, 0);
    if (neighbors > 0) return;
    if (parts.rank === 1 || parts.rank === 9) isolatedTerminalCount += 1;
    else isolatedMiddleCount += 1;
  });
  return { isolatedHonorCount, isolatedTerminalCount, isolatedMiddleCount };
}

function countConnectivity(counts, tileCode) {
  const parts = tileParts(tileCode);
  if (!parts || parts.isHonor) return 0;
  return [-2, -1, 1, 2].reduce((total, offset) => {
    const rank = parts.rank + offset;
    if (rank < 1 || rank > 9) return total;
    return total + countOf(counts, `${parts.suit}${rank}`);
  }, 0);
}

function makeHandCodes(context = {}, seatKey = null) {
  const seats = context.seats || {};
  const seat = seats[seatKey] || seats[context.seat] || {};
  return Array.isArray(seat.handCodes) ? seat.handCodes.slice() : [];
}

function makeNativeFeatures(context = {}, candidate = {}, options = {}) {
  const seatKey = options.seatKey || context.seat || null;
  const handCodes = makeHandCodes(context, seatKey);
  const discardTileCode = candidate.tileCode || null;
  const normalizedDiscard = normalizeTileCode(discardTileCode);
  const beforeCounts = makeCounts(handCodes);
  const afterCounts = removeTile(beforeCounts, normalizedDiscard);
  const afterHandCodes = handCodes.slice();
  const removeIndex = afterHandCodes.findIndex((tileCode) => normalizeTileCode(tileCode) === normalizedDiscard);
  if (removeIndex >= 0) afterHandCodes.splice(removeIndex, 1);
  const beforeTileSummary = summarizeTiles(handCodes, context, seatKey);
  const afterTileSummary = summarizeTiles(afterHandCodes, context, seatKey);
  const beforeGroups = countGroups(beforeCounts);
  const afterGroups = countGroups(afterCounts);
  const beforeWindows = countSequenceWindows(beforeCounts);
  const afterWindows = countSequenceWindows(afterCounts);
  const afterIsolated = countIsolated(afterCounts);
  const doraTiles = (context.doraIndicators || []).map(doraFromIndicator).filter(Boolean);
  const discardParts = tileParts(discardTileCode);
  const discardCountBefore = countOf(beforeCounts, normalizedDiscard);
  const connectivityBefore = countConnectivity(beforeCounts, normalizedDiscard);
  const connectivityAfter = countConnectivity(afterCounts, normalizedDiscard);
  const discardDoraCount = doraTiles.includes(normalizedDiscard) ? 1 : 0;
  const discardRedFiveCount = isRedFive(discardTileCode) ? 1 : 0;
  const discardValueHonorCount = isValueHonor(normalizedDiscard, context, seatKey) ? 1 : 0;
  const breaksPair = discardCountBefore >= 2 ? 1 : 0;
  const breaksTriplet = discardCountBefore >= 3 ? 1 : 0;
  const breaksSequenceWindow = beforeWindows.sequenceWindowCount > afterWindows.sequenceWindowCount ? 1 : 0;
  const breaksRyanmenWindow = beforeWindows.ryanmenWindowCount > afterWindows.ryanmenWindowCount ? 1 : 0;
  const breaksKanchanWindow = beforeWindows.kanchanWindowCount > afterWindows.kanchanWindowCount ? 1 : 0;
  const usefulConnectorBreak = connectivityBefore > connectivityAfter ? Math.max(0, connectivityBefore - connectivityAfter) : 0;

  return {
    handTileCount: beforeTileSummary.tileCount,
    meldCount: Array.isArray(((context.seats || {})[seatKey] || {}).melds) ? ((context.seats || {})[seatKey] || {}).melds.length : 0,
    isOpen: Array.isArray(((context.seats || {})[seatKey] || {}).melds) && ((context.seats || {})[seatKey] || {}).melds.length > 0 ? 1 : 0,
    beforeHonorCount: beforeTileSummary.honorCount,
    beforeTerminalCount: beforeTileSummary.terminalCount,
    beforeMiddleCount: beforeTileSummary.middleCount,
    beforeDoraCount: beforeTileSummary.doraCount,
    beforeValueHonorCount: beforeTileSummary.valueHonorCount,
    beforeDominantSuitCount: beforeTileSummary.dominantSuitCount,
    beforeSuitedNonDominantCount: beforeTileSummary.suitedNonDominantCount,
    afterHonorCount: afterTileSummary.honorCount,
    afterTerminalCount: afterTileSummary.terminalCount,
    afterMiddleCount: afterTileSummary.middleCount,
    afterDoraCount: afterTileSummary.doraCount,
    afterDoraAdjacentCount: afterTileSummary.doraAdjacentCount,
    afterValueHonorCount: afterTileSummary.valueHonorCount,
    afterDominantSuitCount: afterTileSummary.dominantSuitCount,
    afterSuitedNonDominantCount: afterTileSummary.suitedNonDominantCount,
    afterTanyaoTileCount: afterTileSummary.tanyaoTileCount,
    afterTerminalHonorCount: afterTileSummary.terminalHonorCount,
    pairCountBefore: beforeGroups.pairCount,
    pairCountAfter: afterGroups.pairCount,
    tripletCountBefore: beforeGroups.tripletCount,
    tripletCountAfter: afterGroups.tripletCount,
    sequenceWindowCountBefore: beforeWindows.sequenceWindowCount,
    sequenceWindowCountAfter: afterWindows.sequenceWindowCount,
    ryanmenWindowCountBefore: beforeWindows.ryanmenWindowCount,
    ryanmenWindowCountAfter: afterWindows.ryanmenWindowCount,
    kanchanWindowCountBefore: beforeWindows.kanchanWindowCount,
    kanchanWindowCountAfter: afterWindows.kanchanWindowCount,
    isolatedHonorCountAfter: afterIsolated.isolatedHonorCount,
    isolatedTerminalCountAfter: afterIsolated.isolatedTerminalCount,
    isolatedMiddleCountAfter: afterIsolated.isolatedMiddleCount,
    discardCountBefore,
    discardConnectivityBefore: connectivityBefore,
    discardConnectivityAfter: connectivityAfter,
    discardIsHonor: discardParts && discardParts.isHonor ? 1 : 0,
    discardIsTerminal: discardParts && !discardParts.isHonor && (discardParts.rank === 1 || discardParts.rank === 9) ? 1 : 0,
    discardIsMiddle: discardParts && !discardParts.isHonor && discardParts.rank >= 3 && discardParts.rank <= 7 ? 1 : 0,
    discardIsFive: discardParts && !discardParts.isHonor && discardParts.rank === 5 ? 1 : 0,
    discardRedFiveCount,
    discardDoraCount,
    discardDoraAdjacentCount: isDoraAdjacent(normalizedDiscard, doraTiles) ? 1 : 0,
    discardValueHonorCount,
    breaksPair,
    breaksTriplet,
    breaksSequenceWindow,
    breaksRyanmenWindow,
    breaksKanchanWindow,
    usefulConnectorBreak
  };
}

module.exports = {
  normalizeTileCode,
  doraFromIndicator,
  resolveSeatWind,
  resolveRoundWind,
  isValueHonor,
  makeNativeFeatures
};
