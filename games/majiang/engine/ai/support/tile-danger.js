(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.AceMahjongAiTileDanger = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  function normalizeTileCode(tileCode) {
    if (typeof tileCode !== 'string' || tileCode.length < 2) return null;
    return String(tileCode).replace(/[\*_\+\=\-]+$/g, '').replace(/0/g, '5');
  }

  function getActiveSeats(runtime) {
    if (runtime && runtime.topology && Array.isArray(runtime.topology.activeSeats) && runtime.topology.activeSeats.length) {
      return runtime.topology.activeSeats.slice();
    }
    if (runtime && Array.isArray(runtime.activeSeats) && runtime.activeSeats.length) {
      return runtime.activeSeats.slice();
    }
    return ['bottom', 'right', 'top', 'left'];
  }

  function getSeatRiverCodes(runtime, seatKey) {
    if (!runtime || typeof runtime.getSeatIndex !== 'function') return [];
    const seatIndex = runtime.getSeatIndex(seatKey);
    if (seatIndex < 0 || !runtime.board || !runtime.board.he || !Array.isArray(runtime.board.he)) return [];
    const river = runtime.board.he[seatIndex];
    return river && Array.isArray(river._pai)
      ? river._pai.map((code) => normalizeTileCode(code)).filter(Boolean)
      : [];
  }

  function countVisibleTile(runtime, tileCode) {
    const normalizedTileCode = normalizeTileCode(tileCode);
    if (!normalizedTileCode) return 0;
    return getActiveSeats(runtime).reduce((count, seatKey) => (
      count + getSeatRiverCodes(runtime, seatKey).filter((code) => code === normalizedTileCode).length
    ), 0);
  }

  function isSeatRiichi(runtime, seatKey) {
    if (!runtime || !runtime.riichiState || !runtime.riichiState[seatKey]) return false;
    return runtime.riichiState[seatKey].declared === true;
  }

  function getTileBaseDanger(tileCode) {
    const normalizedTileCode = normalizeTileCode(tileCode);
    if (!normalizedTileCode) return 0;
    const suit = normalizedTileCode[0];
    const rank = Number(normalizedTileCode[1]);
    if (suit === 'z') return 6;
    if (rank === 1 || rank === 9) return 3;
    if (rank === 2 || rank === 8) return 4;
    return 6;
  }

  function evaluateRuntimeTileDanger(runtime, seatKey, tileCode) {
    const normalizedTileCode = normalizeTileCode(tileCode);
    if (!runtime || !seatKey || !normalizedTileCode) {
      return evaluateTileDanger({ tileCode: normalizedTileCode });
    }

    const riichiOpponents = getActiveSeats(runtime).filter((otherSeatKey) => (
      otherSeatKey
      && otherSeatKey !== seatKey
      && isSeatRiichi(runtime, otherSeatKey)
    ));
    const visibleCount = countVisibleTile(runtime, normalizedTileCode);

    if (!riichiOpponents.length) {
      return evaluateTileDanger({
        tileCode: normalizedTileCode,
        dangerScore: 0,
        visibleCount,
        reasons: []
      });
    }

    let dangerScore = 0;
    const reasons = [];

    riichiOpponents.forEach((otherSeatKey) => {
      const riverCodes = getSeatRiverCodes(runtime, otherSeatKey);
      if (riverCodes.includes(normalizedTileCode)) {
        reasons.push(`${otherSeatKey}:genbutsu`);
        return;
      }

      const baseDanger = getTileBaseDanger(normalizedTileCode);
      const adjustedDanger = Math.max(1, baseDanger - Math.min(visibleCount, 2));
      dangerScore += adjustedDanger;
      reasons.push(`${otherSeatKey}:riichi-pressure:${adjustedDanger}`);
    });

    return evaluateTileDanger({
      tileCode: normalizedTileCode,
      dangerScore,
      visibleCount,
      reasons
    });
  }

  function evaluateTileDanger(input = {}) {
    return {
      tileCode: input.tileCode || null,
      dangerScore: Number.isFinite(Number(input.dangerScore)) ? Number(input.dangerScore) : 0,
      visibleCount: Number.isFinite(Number(input.visibleCount)) ? Number(input.visibleCount) : 0,
      reasons: Array.isArray(input.reasons) ? input.reasons.slice() : []
    };
  }

  return {
    normalizeTileCode,
    evaluateTileDanger,
    evaluateRuntimeTileDanger
  };
});
