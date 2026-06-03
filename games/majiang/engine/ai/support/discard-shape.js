(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.AceMahjongAiDiscardShape = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const SUITS = Object.freeze(['m', 'p', 's', 'z']);
  const SIMPLE_SUITS = Object.freeze(['m', 'p', 's']);

  function normalizeTileCode(tileCode) {
    if (typeof tileCode !== 'string' || tileCode.length < 2) return null;
    const stripped = String(tileCode).replace(/[\*_\+\=\-\^]+$/g, '');
    if (stripped === '_' || stripped.length < 2) return null;
    const suit = stripped[0];
    const rankText = stripped[1] === '0' ? '5' : stripped[1];
    const rank = Number(rankText);
    if (!SUITS.includes(suit) || !Number.isInteger(rank)) return null;
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
    SUITS.forEach((suit) => {
      const tiles = shoupai._bingpai[suit] || [];
      const maxRank = suit === 'z' ? 7 : 9;
      for (let rank = 1; rank <= maxRank; rank += 1) {
        const count = Number(tiles[rank] || 0) || 0;
        if (count > 0) counts[`${suit}${rank}`] = count;
      }
    });
    return counts;
  }

  function countOf(counts, tileCode) {
    const normalizedTileCode = normalizeTileCode(tileCode);
    return normalizedTileCode ? Number(counts[normalizedTileCode] || 0) || 0 : 0;
  }

  function hasTile(counts, tileCode) {
    return countOf(counts, tileCode) > 0;
  }

  function getDoraIndicatorCodes(runtime) {
    const wallState = runtime && typeof runtime.getWallState === 'function'
      ? runtime.getWallState()
      : null;
    if (wallState && Array.isArray(wallState.doraIndicators)) {
      return wallState.doraIndicators.filter(Boolean);
    }
    if (wallState && Array.isArray(wallState.baopai)) {
      return wallState.baopai.filter(Boolean);
    }
    return runtime && runtime.board && runtime.board.shan && Array.isArray(runtime.board.shan.baopai)
      ? runtime.board.shan.baopai.filter(Boolean)
      : [];
  }

  function getDoraTileFromIndicator(indicatorCode) {
    const normalizedIndicator = normalizeTileCode(indicatorCode);
    if (!normalizedIndicator) return null;
    const suit = normalizedIndicator[0];
    const rank = Number(normalizedIndicator[1]);
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
    const normalizedTileCode = normalizeTileCode(tileCode);
    if (!normalizedTileCode || normalizedTileCode[0] !== 'z') return false;
    if (['z5', 'z6', 'z7'].includes(normalizedTileCode)) return true;
    return normalizedTileCode === getRoundWind(runtime) || normalizedTileCode === getSeatWind(runtime, seatKey);
  }

  function getSuitSupport(counts, suit, rank) {
    return {
      adjacentLeft: rank > 1 && hasTile(counts, `${suit}${rank - 1}`),
      adjacentRight: rank < 9 && hasTile(counts, `${suit}${rank + 1}`),
      skipLeft: rank > 2 && hasTile(counts, `${suit}${rank - 2}`),
      skipRight: rank < 8 && hasTile(counts, `${suit}${rank + 2}`)
    };
  }

  function countKeptUsefulMiddle(counts) {
    return SIMPLE_SUITS.reduce((total, suit) => {
      let suitTotal = 0;
      for (let rank = 3; rank <= 7; rank += 1) {
        if (!hasTile(counts, `${suit}${rank}`)) continue;
        const support = getSuitSupport(counts, suit, rank);
        if (support.adjacentLeft || support.adjacentRight || support.skipLeft || support.skipRight) {
          suitTotal += 1;
        }
      }
      return total + suitTotal;
    }, 0);
  }

  function classifySuitDiscard(beforeCounts, afterCounts, tileCode) {
    const suit = tileCode[0];
    const rank = Number(tileCode[1]);
    const afterSupport = getSuitSupport(afterCounts, suit, rank);
    const beforeSupport = getSuitSupport(beforeCounts, suit, rank);
    const hasAfterSupport = afterSupport.adjacentLeft || afterSupport.adjacentRight || afterSupport.skipLeft || afterSupport.skipRight;
    const hasBeforeAdjacent = beforeSupport.adjacentLeft || beforeSupport.adjacentRight;
    const hasBeforeSkip = beforeSupport.skipLeft || beforeSupport.skipRight;

    if (rank === 1 || rank === 9) {
      return hasAfterSupport ? 'terminal-block' : 'isolated-terminal';
    }
    if (rank === 2 || rank === 8) {
      return hasAfterSupport ? 'edge-block' : 'weak-floating';
    }
    if (rank === 5) {
      return hasBeforeAdjacent || hasBeforeSkip ? 'useful-five' : 'floating-five';
    }
    return hasBeforeAdjacent || hasBeforeSkip ? 'useful-middle' : 'floating-middle';
  }

  function evaluateHardDiscardShape(adapter, runtime, seatKey, beforeShoupai, afterShoupai, discardTileCode, options = {}) {
    const normalizedTileCode = normalizeTileCode(discardTileCode);
    const beforeCounts = getTileCounts(beforeShoupai);
    const afterCounts = getTileCounts(afterShoupai);
    const reasons = [];
    const empty = {
      discardShapeScore: 0,
      discardTileRole: 'unknown',
      keptUsefulMiddleCount: countKeptUsefulMiddle(afterCounts),
      weakTerminalCleanupBonus: 0,
      isolatedHonorCleanupBonus: 0,
      middleTileCutPenalty: 0,
      fiveOrRedFiveCutPenalty: 0,
      doraRetentionPenalty: 0,
      pairOrBlockBreakPenalty: 0,
      reasons
    };
    if (!normalizedTileCode) return empty;

    const suit = normalizedTileCode[0];
    const rank = Number(normalizedTileCode[1]);
    const beforeCount = countOf(beforeCounts, normalizedTileCode);
    const afterCount = countOf(afterCounts, normalizedTileCode);
    const doraTiles = getDoraTiles(runtime);
    const isDora = doraTiles.includes(normalizedTileCode);
    const isAdjacentToDora = !isDora && doraTiles.some((doraTileCode) => isDoraAdjacent(normalizedTileCode, doraTileCode));
    let discardTileRole = 'unknown';
    let weakTerminalCleanupBonus = 0;
    let isolatedHonorCleanupBonus = 0;
    let middleTileCutPenalty = 0;
    let fiveOrRedFiveCutPenalty = 0;
    let doraRetentionPenalty = 0;
    let pairOrBlockBreakPenalty = 0;

    if (suit === 'z') {
      const valueHonor = isValueHonor(runtime, seatKey, normalizedTileCode);
      discardTileRole = valueHonor ? 'value-honor' : 'isolated-honor';
      if (beforeCount === 1 && afterCount === 0 && !valueHonor) {
        isolatedHonorCleanupBonus += 8;
        reasons.push('shape-isolated-honor-cleanup');
      }
      if (valueHonor && beforeCount > afterCount) {
        pairOrBlockBreakPenalty += beforeCount >= 2 ? 12 : 4;
        reasons.push('shape-value-honor-retention');
      }
    } else {
      discardTileRole = classifySuitDiscard(beforeCounts, afterCounts, normalizedTileCode);
      const beforeSupport = getSuitSupport(beforeCounts, suit, rank);
      const hasBeforeAdjacent = beforeSupport.adjacentLeft || beforeSupport.adjacentRight;
      const hasBeforeSkip = beforeSupport.skipLeft || beforeSupport.skipRight;
      const supportDiscount = afterCount > 0 ? 0.5 : 1;

      if (discardTileRole === 'isolated-terminal') {
        weakTerminalCleanupBonus += 12;
        reasons.push('shape-isolated-terminal-cleanup');
      } else if (discardTileRole === 'weak-floating') {
        weakTerminalCleanupBonus += 4;
        reasons.push('shape-weak-floating-cleanup');
      }

      if (rank >= 3 && rank <= 7) {
        middleTileCutPenalty += hasBeforeAdjacent || hasBeforeSkip ? 8 : 5;
        reasons.push('shape-middle-tile-cut');
      } else if (rank === 2 || rank === 8) {
        middleTileCutPenalty += hasBeforeAdjacent || hasBeforeSkip ? 3 : 1;
      }

      if (rank === 5) {
        fiveOrRedFiveCutPenalty += isRedFive(discardTileCode) ? 16 : 10;
        reasons.push(isRedFive(discardTileCode) ? 'shape-red-five-cut' : 'shape-five-cut');
      }

      if (hasBeforeAdjacent) {
        pairOrBlockBreakPenalty += Math.round(8 * supportDiscount);
        reasons.push('shape-adjacent-block-break');
      }
      if (hasBeforeSkip) {
        pairOrBlockBreakPenalty += Math.round(4 * supportDiscount);
        reasons.push('shape-skip-block-break');
      }
    }

    if (beforeCount === 2 && afterCount === 1) {
      pairOrBlockBreakPenalty += 10;
      reasons.push('shape-pair-break');
    } else if (beforeCount >= 3 && afterCount < beforeCount) {
      pairOrBlockBreakPenalty += 6;
      reasons.push('shape-triplet-or-duplicate-break');
    }

    if (isDora) {
      doraRetentionPenalty += 14;
      reasons.push('shape-dora-cut');
    } else if (isAdjacentToDora) {
      doraRetentionPenalty += 4;
      reasons.push('shape-dora-adjacent-cut');
    }

    const keptUsefulMiddleCount = countKeptUsefulMiddle(afterCounts);
    const shapeScoreWeight = options && Number.isFinite(Number(options.shapeScoreWeight))
      ? Number(options.shapeScoreWeight)
      : 1;
    const discardShapeScore = Math.round((
      keptUsefulMiddleCount
      + weakTerminalCleanupBonus
      + isolatedHonorCleanupBonus
      - middleTileCutPenalty
      - fiveOrRedFiveCutPenalty
      - doraRetentionPenalty
      - pairOrBlockBreakPenalty
    ) * shapeScoreWeight);

    return {
      discardShapeScore,
      discardTileRole,
      keptUsefulMiddleCount,
      weakTerminalCleanupBonus,
      isolatedHonorCleanupBonus,
      middleTileCutPenalty,
      fiveOrRedFiveCutPenalty,
      doraRetentionPenalty,
      pairOrBlockBreakPenalty,
      reasons
    };
  }

  return {
    normalizeTileCode,
    getDoraTileFromIndicator,
    evaluateHardDiscardShape
  };
});
