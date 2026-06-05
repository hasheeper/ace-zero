(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./constants'));
    return;
  }
  root.AceMahjongLuckTileCounts = factory(root.AceMahjongLuckConstants);
})(typeof globalThis !== 'undefined' ? globalThis : this, function(constants) {
  'use strict';

  const { TILE_TYPES } = constants;
  const TILE_TYPE_SET = new Set(TILE_TYPES);

  function normalizeTileCode(tileCode) {
    const stripped = String(tileCode || '')
      .trim()
      .replace(/[\*_\+\=\-]+$/g, '');
    if (!stripped) return null;
    const redFive = stripped.match(/^([mps])0$/);
    const normalized = redFive ? `${redFive[1]}5` : stripped;
    return TILE_TYPE_SET.has(normalized) ? normalized : null;
  }

  function extractTileArray(wallStateOrTiles = null) {
    if (Array.isArray(wallStateOrTiles)) return wallStateOrTiles.slice();
    if (!wallStateOrTiles || typeof wallStateOrTiles !== 'object') return [];
    if (Array.isArray(wallStateOrTiles.liveWall)) return wallStateOrTiles.liveWall.slice();
    if (Array.isArray(wallStateOrTiles.tiles)) return wallStateOrTiles.tiles.slice();
    if (Array.isArray(wallStateOrTiles.peekDrawStack)) return wallStateOrTiles.peekDrawStack.slice();
    return [];
  }

  function buildTileCountsFromWall(wallStateOrTiles = null) {
    const counts = {};
    extractTileArray(wallStateOrTiles).forEach((tileCode) => {
      const normalized = normalizeTileCode(tileCode);
      if (!normalized) return;
      counts[normalized] = Number(counts[normalized] || 0) + 1;
    });
    return counts;
  }

  function tileCountsToCandidates(tileCounts = {}) {
    return TILE_TYPES
      .map((tileCode) => ({
        tileCode,
        remainingCount: Math.max(0, Math.floor(Number(tileCounts[tileCode] || 0) || 0))
      }))
      .filter((entry) => entry.remainingCount > 0);
  }

  return {
    TILE_TYPES,
    normalizeTileCode,
    extractTileArray,
    buildTileCountsFromWall,
    tileCountsToCandidates
  };
});
