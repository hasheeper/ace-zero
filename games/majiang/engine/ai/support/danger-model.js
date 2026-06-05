(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./visible-tiles')
    );
    return;
  }
  root.AceMahjongAiDangerModel = factory(
    root.AceMahjongAiVisibleTiles || null
  );
})(typeof globalThis !== 'undefined' ? globalThis : this, function(visibleTilesApi) {
  'use strict';

  function getVisibleTilesApi() {
    if (visibleTilesApi) return visibleTilesApi;
    if (typeof globalThis !== 'undefined' && globalThis.AceMahjongAiVisibleTiles) {
      return globalThis.AceMahjongAiVisibleTiles;
    }
    throw new Error('AceMahjongAiDangerModel requires visible tile accounting.');
  }

  function normalizeTileCode(tileCode) {
    const api = getVisibleTilesApi();
    return api && typeof api.normalizeTileCode === 'function'
      ? api.normalizeTileCode(tileCode)
      : null;
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

  function isSeatRiichi(runtime, seatKey) {
    return Boolean(
      runtime
      && runtime.riichiState
      && runtime.riichiState[seatKey]
      && runtime.riichiState[seatKey].declared === true
    );
  }

  function getRiichiOpponents(runtime, seatKey) {
    return getActiveSeats(runtime).filter((otherSeatKey) => (
      otherSeatKey
      && otherSeatKey !== seatKey
      && isSeatRiichi(runtime, otherSeatKey)
    ));
  }

  function getTileBaseDanger(tileCode) {
    const normalizedTileCode = normalizeTileCode(tileCode);
    if (!normalizedTileCode) return 0;
    const suit = normalizedTileCode[0];
    const rank = Number(normalizedTileCode[1]);
    if (suit === 'z') return 5;
    if (rank === 1 || rank === 9) return 3;
    if (rank === 2 || rank === 8) return 4;
    if (rank === 3 || rank === 7) return 5;
    return 7;
  }

  function numberOr(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function getTileClass(tileCode) {
    const normalizedTileCode = normalizeTileCode(tileCode);
    if (!normalizedTileCode) {
      return {
        key: 'unknown',
        defenseRank: 9,
        safetyRank: 9
      };
    }
    const suit = normalizedTileCode[0];
    const rank = Number(normalizedTileCode[1]);
    if (suit === 'z') {
      return {
        key: 'honor',
        defenseRank: 1,
        safetyRank: 7
      };
    }
    if (rank === 1 || rank === 9) {
      return {
        key: 'terminal',
        defenseRank: 1,
        safetyRank: 6
      };
    }
    if (rank === 2 || rank === 8) {
      return {
        key: 'edge',
        defenseRank: 2,
        safetyRank: 7
      };
    }
    if (rank === 3 || rank === 7) {
      return {
        key: 'outer-middle',
        defenseRank: 3,
        safetyRank: 8
      };
    }
    return {
      key: 'middle',
      defenseRank: 4,
      safetyRank: 9
    };
  }

  function buildSafetyProfile(tileCode, categories = [], visibleCount = 0, dangerScore = 0) {
    const normalizedTileCode = normalizeTileCode(tileCode);
    const categorySet = new Set(Array.isArray(categories) ? categories : []);
    const tileClass = getTileClass(normalizedTileCode);
    const reasons = [];
    let safetyRank = tileClass.safetyRank;

    if (categorySet.has('genbutsu') && dangerScore <= 0) {
      safetyRank = 0;
      reasons.push('safety-genbutsu');
    } else if (categorySet.has('honor-three-visible')) {
      safetyRank = 1;
      reasons.push('safety-honor-three-visible');
    } else if (categorySet.has('no-chance')) {
      safetyRank = 1;
      reasons.push('safety-no-chance');
    } else if (categorySet.has('suji') && categorySet.has('one-chance')) {
      safetyRank = 2;
      reasons.push('safety-suji-one-chance');
    } else if (categorySet.has('suji')) {
      safetyRank = 3;
      reasons.push('safety-suji');
    } else if (categorySet.has('one-chance')) {
      safetyRank = 4;
      reasons.push('safety-one-chance');
    } else if (categorySet.has('honor-two-visible')) {
      safetyRank = 5;
      reasons.push('safety-honor-two-visible');
    } else if (tileClass.key === 'honor' && visibleCount > 0) {
      safetyRank = 6;
      reasons.push('safety-visible-honor');
    } else {
      reasons.push(`safety-${tileClass.key}`);
    }

    if (categorySet.has('dora')) {
      safetyRank += 6;
      reasons.push('safety-dora-penalty');
    } else if (categorySet.has('dora-adjacent')) {
      safetyRank += 2;
      reasons.push('safety-dora-adjacent-penalty');
    }

    const defenseTileRank = safetyRank * 10
      + tileClass.defenseRank
      + Math.max(0, Math.min(4, Math.floor(numberOr(dangerScore, 0))));

    return {
      safetyRank,
      defenseTileRank,
      safetyReasons: reasons
    };
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

  function isSuji(tileCode, riverCodes) {
    const normalizedTileCode = normalizeTileCode(tileCode);
    if (!normalizedTileCode || normalizedTileCode[0] === 'z') return false;
    const suit = normalizedTileCode[0];
    const rank = Number(normalizedTileCode[1]);
    return riverCodes.includes(`${suit}${rank - 3}`) || riverCodes.includes(`${suit}${rank + 3}`);
  }

  function getSequenceSupportPairs(tileCode) {
    const normalizedTileCode = normalizeTileCode(tileCode);
    if (!normalizedTileCode || normalizedTileCode[0] === 'z') return [];
    const suit = normalizedTileCode[0];
    const rank = Number(normalizedTileCode[1]);
    return [
      [rank - 2, rank - 1],
      [rank - 1, rank + 1],
      [rank + 1, rank + 2]
    ]
      .filter((pair) => pair.every((value) => value >= 1 && value <= 9))
      .map((pair) => pair.map((value) => `${suit}${value}`));
  }

  function getWallCategory(tileCode, visibleTiles) {
    const pairs = getSequenceSupportPairs(tileCode);
    if (!pairs.length || !visibleTiles || typeof visibleTiles.countKnown !== 'function') return null;

    const pairBlocked = (pair, threshold) => pair.some((supportTileCode) => visibleTiles.countKnown(supportTileCode) >= threshold);
    if (pairs.every((pair) => pairBlocked(pair, 4))) return 'no-chance';
    if (pairs.some((pair) => pairBlocked(pair, 3))) return 'one-chance';
    return null;
  }

  function evaluateOpponentDanger(runtime, seatKey, opponentSeatKey, tileCode, visibleTiles, doraTiles) {
    const normalizedTileCode = normalizeTileCode(tileCode);
    const riverCodes = getSeatRiverCodes(runtime, opponentSeatKey);
    const categories = [];
    const reasons = [];

    if (!normalizedTileCode) {
      return { score: 0, categories, reasons };
    }

    if (riverCodes.includes(normalizedTileCode)) {
      categories.push('genbutsu');
      reasons.push(`${opponentSeatKey}:genbutsu`);
      return { score: 0, categories, reasons };
    }

    const suit = normalizedTileCode[0];
    const visibleCount = visibleTiles && typeof visibleTiles.countKnown === 'function'
      ? visibleTiles.countKnown(normalizedTileCode)
      : 0;
    let score = getTileBaseDanger(normalizedTileCode);

    categories.push('riichi-unknown');
    reasons.push(`${opponentSeatKey}:riichi-pressure`);

    if (suit === 'z') {
      if (visibleCount >= 3) {
        score -= 3;
        categories.push('honor-three-visible');
        reasons.push(`${opponentSeatKey}:honor-three-visible`);
      } else if (visibleCount >= 2) {
        score -= 1;
        categories.push('honor-two-visible');
        reasons.push(`${opponentSeatKey}:honor-two-visible`);
      }
    } else {
      if (isSuji(normalizedTileCode, riverCodes)) {
        score -= 2;
        categories.push('suji');
        reasons.push(`${opponentSeatKey}:suji`);
      }

      const wallCategory = getWallCategory(normalizedTileCode, visibleTiles);
      if (wallCategory === 'no-chance') {
        score -= 4;
        categories.push('no-chance');
        reasons.push(`${opponentSeatKey}:no-chance`);
      } else if (wallCategory === 'one-chance') {
        score -= 2;
        categories.push('one-chance');
        reasons.push(`${opponentSeatKey}:one-chance`);
      }
    }

    if (doraTiles.includes(normalizedTileCode)) {
      score += 4;
      categories.push('dora');
      reasons.push(`${opponentSeatKey}:dora`);
    } else if (doraTiles.some((doraTileCode) => isDoraAdjacent(normalizedTileCode, doraTileCode))) {
      score += 1;
      categories.push('dora-adjacent');
      reasons.push(`${opponentSeatKey}:dora-adjacent`);
    }

    score -= Math.min(visibleCount, 2);
    return {
      score: Math.max(1, score),
      categories,
      reasons
    };
  }

  function evaluateRuntimeHardTileDanger(runtime, seatKey, tileCode) {
    const api = getVisibleTilesApi();
    const normalizedTileCode = normalizeTileCode(tileCode);
    const visibleTiles = api && typeof api.buildRuntimeVisibleTiles === 'function'
      ? api.buildRuntimeVisibleTiles(runtime, seatKey)
      : null;
    const visibleCount = visibleTiles && normalizedTileCode
      ? visibleTiles.countKnown(normalizedTileCode)
      : 0;
    const remainingCount = visibleTiles && normalizedTileCode
      ? visibleTiles.countRemaining(normalizedTileCode)
      : 0;

    if (!runtime || !seatKey || !normalizedTileCode) {
      const safety = buildSafetyProfile(normalizedTileCode, [], visibleCount, 0);
      return {
        tileCode: normalizedTileCode,
        dangerScore: 0,
        visibleCount,
        remainingCount,
        categories: [],
        reasons: [],
        safetyRank: safety.safetyRank,
        defenseTileRank: safety.defenseTileRank,
        safetyReasons: safety.safetyReasons
      };
    }

    const riichiOpponents = getRiichiOpponents(runtime, seatKey);
    if (!riichiOpponents.length) {
      const safety = buildSafetyProfile(normalizedTileCode, [], visibleCount, 0);
      return {
        tileCode: normalizedTileCode,
        dangerScore: 0,
        visibleCount,
        remainingCount,
        categories: [],
        reasons: [],
        safetyRank: safety.safetyRank,
        defenseTileRank: safety.defenseTileRank,
        safetyReasons: ['safety-no-riichi-pressure'].concat(safety.safetyReasons)
      };
    }

    const doraTiles = getDoraTiles(runtime);
    const aggregate = riichiOpponents.reduce((result, opponentSeatKey) => {
      const opponentDanger = evaluateOpponentDanger(
        runtime,
        seatKey,
        opponentSeatKey,
        normalizedTileCode,
        visibleTiles,
        doraTiles
      );
      result.dangerScore += opponentDanger.score;
      result.categories.push(...opponentDanger.categories);
      result.reasons.push(...opponentDanger.reasons);
      return result;
    }, {
      dangerScore: 0,
      categories: [],
      reasons: []
    });

    const categories = Array.from(new Set(aggregate.categories));
    const safety = buildSafetyProfile(normalizedTileCode, categories, visibleCount, aggregate.dangerScore);

    return {
      tileCode: normalizedTileCode,
      dangerScore: aggregate.dangerScore,
      visibleCount,
      remainingCount,
      categories,
      reasons: aggregate.reasons,
      safetyRank: safety.safetyRank,
      defenseTileRank: safety.defenseTileRank,
      safetyReasons: safety.safetyReasons
    };
  }

  return {
    normalizeTileCode,
    getDoraTileFromIndicator,
    buildSafetyProfile,
    evaluateRuntimeHardTileDanger
  };
});
