(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./visible-tiles')
    );
    return;
  }
  root.AceMahjongAiWaitQuality = factory(
    root.AceMahjongAiVisibleTiles || null
  );
})(typeof globalThis !== 'undefined' ? globalThis : this, function(visibleTilesApi) {
  'use strict';

  const WAIT_TYPE_WEIGHT = Object.freeze({
    ryanmen: 4,
    shanpon: 3,
    kanchan: 2,
    tanki: 1,
    penchan: 1,
    honor: 1,
    unknown: 0
  });

  function getVisibleTilesApi() {
    if (visibleTilesApi) return visibleTilesApi;
    if (typeof globalThis !== 'undefined' && globalThis.AceMahjongAiVisibleTiles) {
      return globalThis.AceMahjongAiVisibleTiles;
    }
    throw new Error('AceMahjongAiWaitQuality requires visible tile accounting.');
  }

  function normalizeTileCode(tileCode) {
    const api = getVisibleTilesApi();
    return api && typeof api.normalizeTileCode === 'function'
      ? api.normalizeTileCode(tileCode)
      : null;
  }

  function countTileInHand(shoupai, tileCode) {
    const normalizedTileCode = normalizeTileCode(tileCode);
    if (!shoupai || !shoupai._bingpai || !normalizedTileCode) return 0;
    const suit = normalizedTileCode[0];
    const rank = Number(normalizedTileCode[1]);
    const tiles = shoupai._bingpai[suit];
    return tiles && Number.isInteger(rank) ? Number(tiles[rank] || 0) || 0 : 0;
  }

  function hasTile(shoupai, suit, rank) {
    return rank >= 1 && rank <= 9 && countTileInHand(shoupai, `${suit}${rank}`) > 0;
  }

  function classifyNumberWait(shoupai, tileCode) {
    const suit = tileCode[0];
    const rank = Number(tileCode[1]);
    const types = [];

    if (hasTile(shoupai, suit, rank - 2) && hasTile(shoupai, suit, rank - 1)) {
      types.push(rank === 3 ? 'penchan' : 'ryanmen');
    }
    if (hasTile(shoupai, suit, rank + 1) && hasTile(shoupai, suit, rank + 2)) {
      types.push(rank === 7 ? 'penchan' : 'ryanmen');
    }
    if (hasTile(shoupai, suit, rank - 1) && hasTile(shoupai, suit, rank + 1)) {
      types.push('kanchan');
    }

    const sameTileCount = countTileInHand(shoupai, tileCode);
    if (sameTileCount >= 2) {
      types.push('shanpon');
    } else if (sameTileCount === 1) {
      types.push('tanki');
    }

    if (!types.length) return 'unknown';
    return types.sort((left, right) => (WAIT_TYPE_WEIGHT[right] || 0) - (WAIT_TYPE_WEIGHT[left] || 0))[0];
  }

  function classifyWait(shoupai, tileCode) {
    const normalizedTileCode = normalizeTileCode(tileCode);
    if (!normalizedTileCode) return 'unknown';
    if (normalizedTileCode[0] === 'z') {
      return countTileInHand(shoupai, normalizedTileCode) >= 2 ? 'shanpon' : 'honor';
    }
    return classifyNumberWait(shoupai, normalizedTileCode);
  }

  function evaluateWaitQuality(shoupai, tingpai = [], visibleTiles) {
    const waits = (Array.isArray(tingpai) ? tingpai : [])
      .map((tileCode) => normalizeTileCode(tileCode))
      .filter(Boolean)
      .filter((tileCode, index, all) => all.indexOf(tileCode) === index)
      .map((tileCode) => {
        const remainingCount = visibleTiles && typeof visibleTiles.countRemaining === 'function'
          ? visibleTiles.countRemaining(tileCode)
          : 0;
        const waitType = classifyWait(shoupai, tileCode);
        const waitTypeWeight = Number(WAIT_TYPE_WEIGHT[waitType] || 0);
        return {
          tileCode,
          remainingCount,
          waitType,
          waitTypeWeight,
          qualityScore: remainingCount * waitTypeWeight
        };
      });

    const liveTingpaiCount = waits.reduce((sum, wait) => sum + wait.remainingCount, 0);
    const waitQualityScore = waits.reduce((sum, wait) => sum + wait.qualityScore, 0);
    const bestWait = waits.slice().sort((left, right) => (
      right.waitTypeWeight - left.waitTypeWeight
      || right.remainingCount - left.remainingCount
      || String(left.tileCode).localeCompare(String(right.tileCode))
    ))[0] || null;

    return {
      liveTingpaiCount,
      waitQualityScore,
      bestWaitType: bestWait ? bestWait.waitType : null,
      waits
    };
  }

  return {
    WAIT_TYPE_WEIGHT,
    normalizeTileCode,
    classifyWait,
    evaluateWaitQuality
  };
});
