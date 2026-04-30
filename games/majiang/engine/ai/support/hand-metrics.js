(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.AceMahjongAiHandMetrics = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const TILE_TYPES = Object.freeze([
    'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9',
    'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9',
    's1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9',
    'z1', 'z2', 'z3', 'z4', 'z5', 'z6', 'z7'
  ]);

  function normalizeTileCode(tileCode) {
    if (typeof tileCode !== 'string' || tileCode.length < 2) return null;
    const suit = tileCode[0];
    const rank = tileCode[1] === '0' ? '5' : tileCode[1];
    return `${suit}${rank}`;
  }

  function countTileInHand(shoupai, tileCode) {
    if (!shoupai || !shoupai._bingpai || typeof tileCode !== 'string' || tileCode.length < 2) return 0;
    const suit = tileCode[0];
    const rank = Number(tileCode[1]);
    const suitTiles = shoupai._bingpai[suit];
    if (!suitTiles || !Number.isInteger(rank)) return 0;
    if (rank === 5 && suit !== 'z') {
      return Number(suitTiles[5] || 0) || 0;
    }
    return Number(suitTiles[rank] || 0) || 0;
  }

  function estimateUkeireCount(adapter, shoupai) {
    if (!adapter || typeof adapter.calculateXiangting !== 'function' || !shoupai || typeof shoupai.clone !== 'function') {
      return 0;
    }

    const baseXiangting = adapter.calculateXiangting(shoupai.clone());
    if (!Number.isFinite(baseXiangting)) return 0;

    return TILE_TYPES.reduce((count, tileCode) => {
      const availableCopies = Math.max(0, 4 - countTileInHand(shoupai, tileCode));
      if (!availableCopies) return count;

      const simulated = shoupai.clone();
      simulated.zimo(tileCode, false);
      const nextXiangting = adapter.calculateXiangting(simulated);
      return nextXiangting < baseXiangting ? count + availableCopies : count;
    }, 0);
  }

  function getTileCountMap(shoupai) {
    const counts = Object.create(null);
    if (!shoupai || !shoupai._bingpai) return counts;

    TILE_TYPES.forEach((tileCode) => {
      const count = countTileInHand(shoupai, tileCode);
      if (count > 0) {
        counts[tileCode] = count;
      }
    });
    return counts;
  }

  function hasTile(counts, tileCode) {
    return Number(counts[tileCode] || 0) > 0;
  }

  function estimateHandShapeValue(shoupai) {
    const counts = getTileCountMap(shoupai);
    let score = 0;

    TILE_TYPES.forEach((tileCode) => {
      const count = Number(counts[tileCode] || 0);
      if (!count) return;

      const suit = tileCode[0];
      const rank = Number(tileCode[1]);

      if (count >= 2) {
        score += count === 2 ? 4 : 7;
      }

      if (suit === 'z') {
        if (count === 1) score -= 2;
        return;
      }

      const hasLeft = rank > 1 && hasTile(counts, `${suit}${rank - 1}`);
      const hasRight = rank < 9 && hasTile(counts, `${suit}${rank + 1}`);
      const hasSkipLeft = rank > 2 && hasTile(counts, `${suit}${rank - 2}`);
      const hasSkipRight = rank < 8 && hasTile(counts, `${suit}${rank + 2}`);

      if (hasLeft) score += 2;
      if (hasRight) score += 2;
      if (!hasLeft && !hasRight && hasSkipLeft) score += 1;
      if (!hasLeft && !hasRight && hasSkipRight) score += 1;

      if (count === 1 && !hasLeft && !hasRight && !hasSkipLeft && !hasSkipRight) {
        if (rank === 1 || rank === 9) score -= 2;
        else score -= 1;
      }
    });

    return score;
  }

  function buildHandMetrics(input = {}) {
    return {
      xiangting: Number.isFinite(Number(input.xiangting)) ? Number(input.xiangting) : null,
      tingpaiCount: Number.isFinite(Number(input.tingpaiCount)) ? Number(input.tingpaiCount) : 0,
      ukeireCount: Number.isFinite(Number(input.ukeireCount)) ? Number(input.ukeireCount) : 0,
      handValueEstimate: Number.isFinite(Number(input.handValueEstimate)) ? Number(input.handValueEstimate) : 0
    };
  }

  return {
    TILE_TYPES,
    normalizeTileCode,
    countTileInHand,
    getTileCountMap,
    estimateUkeireCount,
    estimateHandShapeValue,
    buildHandMetrics
  };
});
