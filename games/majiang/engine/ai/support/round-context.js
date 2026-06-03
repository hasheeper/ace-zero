(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.AceMahjongAiRoundContext = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const DEFAULT_CONTEXT_POLICY = Object.freeze({
    enableHardRoundContext: true,
    lateRemainingTiles: 18,
    dealerAttackBonus: 6,
    honbaAttackBonus: 2,
    maxHonbaAttackBonus: 6,
    riichiStickAttackBonus: 2,
    maxRiichiStickAttackBonus: 4,
    trailingAttackBonus: 4,
    trailingScoreThreshold: 8000,
    leaderLateDefensePenalty: 10,
    leaderScoreThreshold: 8000
  });

  function numberOr(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
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

  function getScoreMap(runtime, activeSeats) {
    if (runtime && typeof runtime.getScoreMap === 'function') {
      const scoreMap = runtime.getScoreMap();
      if (scoreMap && typeof scoreMap === 'object') {
        return activeSeats.reduce((result, seatKey) => {
          result[seatKey] = numberOr(scoreMap[seatKey], 0);
          return result;
        }, {});
      }
    }

    return activeSeats.reduce((result, seatKey, seatIndex) => {
      const playerIndex = runtime && typeof runtime.getPlayerIdentityIndex === 'function'
        ? runtime.getPlayerIdentityIndex(seatKey)
        : seatIndex;
      result[seatKey] = runtime && runtime.board && Array.isArray(runtime.board.defen)
        ? numberOr(runtime.board.defen[playerIndex], 0)
        : 0;
      return result;
    }, {});
  }

  function getRemainingTiles(runtime) {
    const wallState = runtime && typeof runtime.getWallState === 'function'
      ? runtime.getWallState()
      : null;
    return wallState ? numberOr(wallState.remaining, 0) : 0;
  }

  function getBoardCount(runtime, key) {
    if (runtime && runtime.board && Number.isFinite(Number(runtime.board[key]))) {
      return Number(runtime.board[key]);
    }
    if (runtime && runtime.roundConfig && Number.isFinite(Number(runtime.roundConfig[key]))) {
      return Number(runtime.roundConfig[key]);
    }
    return 0;
  }

  function isDealerSeat(runtime, seatKey) {
    if (!runtime || !seatKey) return false;
    if (typeof runtime.getDealerSeat === 'function') {
      return runtime.getDealerSeat() === seatKey;
    }
    return typeof runtime.getSeatWindIndex === 'function'
      ? runtime.getSeatWindIndex(seatKey) === 0
      : false;
  }

  function resolvePolicy(policy = {}) {
    const source = policy && typeof policy === 'object' ? policy : {};
    return {
      enableHardRoundContext: source.enableHardRoundContext !== false,
      lateRemainingTiles: numberOr(source.lateRemainingTiles, DEFAULT_CONTEXT_POLICY.lateRemainingTiles),
      dealerAttackBonus: numberOr(source.dealerAttackBonus, DEFAULT_CONTEXT_POLICY.dealerAttackBonus),
      honbaAttackBonus: numberOr(source.honbaAttackBonus, DEFAULT_CONTEXT_POLICY.honbaAttackBonus),
      maxHonbaAttackBonus: numberOr(source.maxHonbaAttackBonus, DEFAULT_CONTEXT_POLICY.maxHonbaAttackBonus),
      riichiStickAttackBonus: numberOr(source.riichiStickAttackBonus, DEFAULT_CONTEXT_POLICY.riichiStickAttackBonus),
      maxRiichiStickAttackBonus: numberOr(source.maxRiichiStickAttackBonus, DEFAULT_CONTEXT_POLICY.maxRiichiStickAttackBonus),
      trailingAttackBonus: numberOr(source.trailingAttackBonus, DEFAULT_CONTEXT_POLICY.trailingAttackBonus),
      trailingScoreThreshold: numberOr(source.trailingScoreThreshold, DEFAULT_CONTEXT_POLICY.trailingScoreThreshold),
      leaderLateDefensePenalty: numberOr(source.leaderLateDefensePenalty, DEFAULT_CONTEXT_POLICY.leaderLateDefensePenalty),
      leaderScoreThreshold: numberOr(source.leaderScoreThreshold, DEFAULT_CONTEXT_POLICY.leaderScoreThreshold)
    };
  }

  function buildRuntimeHardRoundContext(runtime, seatKey, options = {}) {
    const contextPolicy = resolvePolicy(options.contextPolicy || options.policy || {});
    const activeSeats = getActiveSeats(runtime);
    const scoresBySeat = getScoreMap(runtime, activeSeats);
    const seatScore = numberOr(scoresBySeat[seatKey], 0);
    const sortedScores = activeSeats
      .map((activeSeatKey) => numberOr(scoresBySeat[activeSeatKey], 0))
      .sort((left, right) => right - left);
    const leaderScore = sortedScores.length ? sortedScores[0] : seatScore;
    const secondScore = sortedScores.length > 1 ? sortedScores[1] : seatScore;
    const lastScore = sortedScores.length ? sortedScores[sortedScores.length - 1] : seatScore;
    const scoreRank = sortedScores.filter((score) => score > seatScore).length + 1;
    const remainingTiles = getRemainingTiles(runtime);
    const changbang = getBoardCount(runtime, 'changbang');
    const lizhibang = getBoardCount(runtime, 'lizhibang');
    const isDealer = isDealerSeat(runtime, seatKey);
    const isLateRound = remainingTiles > 0 && remainingTiles <= contextPolicy.lateRemainingTiles;
    const leadOverSecond = scoreRank === 1 ? Math.max(0, seatScore - secondScore) : 0;
    const trailingByLeader = Math.max(0, leaderScore - seatScore);

    if (!contextPolicy.enableHardRoundContext) {
      return Object.freeze({
        seatKey,
        isDealer,
        remainingTiles,
        isLateRound,
        changbang,
        lizhibang,
        score: seatScore,
        scoreRank,
        leaderScore,
        lastScore,
        scoreDeltaFromLeader: seatScore - leaderScore,
        leadOverSecond,
        trailingByLeader,
        attackValueBonus: 0,
        defenseValuePenalty: 0
      });
    }

    const honbaBonus = Math.min(contextPolicy.maxHonbaAttackBonus, Math.max(0, changbang) * contextPolicy.honbaAttackBonus);
    const riichiStickBonus = Math.min(contextPolicy.maxRiichiStickAttackBonus, Math.max(0, lizhibang) * contextPolicy.riichiStickAttackBonus);
    const trailingBonus = trailingByLeader >= contextPolicy.trailingScoreThreshold
      ? contextPolicy.trailingAttackBonus
      : 0;
    const attackValueBonus = (isDealer ? contextPolicy.dealerAttackBonus : 0)
      + honbaBonus
      + riichiStickBonus
      + trailingBonus;
    const defenseValuePenalty = isLateRound && scoreRank === 1 && leadOverSecond >= contextPolicy.leaderScoreThreshold
      ? contextPolicy.leaderLateDefensePenalty
      : 0;

    return Object.freeze({
      seatKey,
      isDealer,
      remainingTiles,
      isLateRound,
      changbang,
      lizhibang,
      score: seatScore,
      scoreRank,
      leaderScore,
      lastScore,
      scoreDeltaFromLeader: seatScore - leaderScore,
      leadOverSecond,
      trailingByLeader,
      attackValueBonus,
      defenseValuePenalty
    });
  }

  function applyHardContextToHandValue(handValueEstimate, hardContext = null) {
    return (numberOr(handValueEstimate, 0)
      + numberOr(hardContext && hardContext.attackValueBonus, 0)
      - numberOr(hardContext && hardContext.defenseValuePenalty, 0));
  }

  return {
    DEFAULT_CONTEXT_POLICY,
    buildRuntimeHardRoundContext,
    applyHardContextToHandValue
  };
});
