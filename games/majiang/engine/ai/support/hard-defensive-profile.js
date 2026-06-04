(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.AceMahjongAiHardDefensiveProfile = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const DEFAULT_POLICY = Object.freeze({
    enableThreatScoreReview: false,
    enableRankAwarePushFold: false,
    enableDealInAttribution: false,
    enableDefensiveUtilityShadow: false,
    enableSafetyGateRerank: false,
    enableSafetyGateDiagnostics: false,
    threatWeights: {
      riichi: 8,
      dealerRiichi: 4,
      multiThreat: 4,
      lateRound: 3,
      openThreat: 2,
      openTwoMeld: 3,
      doraRisk: 3,
      doraAdjacentRisk: 1.5,
      honorOpenThreat: 1.5,
      flushOpenThreat: 2
    },
    expectedPointLoss: {
      base: 2600,
      riichi: 1700,
      dealer: 1800,
      multiThreat: 1200,
      openThreat: 800,
      lateRound: 500,
      doraRisk: 700
    },
    expectedDealInCostWeight: 0.12,
    stateRiskBias: {
      'protect-lead': 18,
      'protect-second': 10,
      'neutral-defense': 0,
      comeback: -14,
      'safe-tenpai': -22
    },
    stateAttackBias: {
      'protect-lead': -4,
      'protect-second': -2,
      'neutral-defense': 0,
      comeback: 14,
      'safe-tenpai': 18
    },
    stateFoldNetPushBias: {
      'protect-lead': 15,
      'protect-second': 8,
      'neutral-defense': 0,
      comeback: -18,
      'safe-tenpai': -22
    },
    protectLeadScore: 8000,
    comebackTrailingScore: 8000,
    highThreatScore: 14,
    safeTenpaiMinLiveTingpai: 3,
    safeTenpaiMinWaitQuality: 8,
    safeTenpaiMinHandValue: 42,
    defensiveUtilityShadowWeights: {
      hardEv: 0.08,
      handValue: 1,
      liveTingpai: 2,
      waitQuality: 0.8,
      expectedCost: 0.16,
      safetyRank: 3.5,
      defenseTileRank: 0.12,
      futureSafetyLoss: 1.2,
      xiangtingLoss: 36,
      safetyValue: 1,
      stateSafety: {
        'protect-lead': 1.25,
        'protect-second': 0.85,
        'neutral-defense': 0.25,
        comeback: -0.65,
        'safe-tenpai': -0.85
      }
    },
    defensiveUtilityActionableMinScoreDelta: 20,
    defensiveUtilityActionableMinDangerDelta: 2,
    defensiveUtilityActionableMinSafetyRankDelta: 2,
    safetyGateMinThreatScore: 11,
    safetyGateProtectScore: 8,
    safetyGateMaxXiangtingLoss: 1,
    safetyGateMinDangerDelta: 2,
    safetyGateMinSafetyRankDelta: 2,
    safetyGateMinExpectedCostDelta: 80,
    safetyGateBackstepMinThreatScore: 14,
    safetyGateBackstepMinExpectedCostDelta: 140,
    safetyGateProtectedTenpaiMinHandValue: 42,
    safetyGateProtectedTenpaiMinWaitQuality: 12
  });

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function numberOr(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function resolveSection(source, defaults) {
    return {
      ...defaults,
      ...((source && typeof source === 'object') ? source : {})
    };
  }

  function resolvePolicy(policy = {}) {
    const source = policy && typeof policy === 'object' ? policy : {};
    return {
      enableThreatScoreReview: source.enableThreatScoreReview === true,
      enableRankAwarePushFold: source.enableRankAwarePushFold === true,
      enableDealInAttribution: source.enableDealInAttribution === true,
      enableDefensiveUtilityShadow: source.enableDefensiveUtilityShadow === true,
      enableSafetyGateRerank: source.enableSafetyGateRerank === true,
      enableSafetyGateDiagnostics: source.enableSafetyGateDiagnostics === true,
      threatWeights: resolveSection(source.threatWeights, DEFAULT_POLICY.threatWeights),
      expectedPointLoss: resolveSection(source.expectedPointLoss, DEFAULT_POLICY.expectedPointLoss),
      expectedDealInCostWeight: numberOr(source.expectedDealInCostWeight, DEFAULT_POLICY.expectedDealInCostWeight),
      stateRiskBias: resolveSection(source.stateRiskBias, DEFAULT_POLICY.stateRiskBias),
      stateAttackBias: resolveSection(source.stateAttackBias, DEFAULT_POLICY.stateAttackBias),
      stateFoldNetPushBias: resolveSection(source.stateFoldNetPushBias, DEFAULT_POLICY.stateFoldNetPushBias),
      protectLeadScore: numberOr(source.protectLeadScore, DEFAULT_POLICY.protectLeadScore),
      comebackTrailingScore: numberOr(source.comebackTrailingScore, DEFAULT_POLICY.comebackTrailingScore),
      highThreatScore: numberOr(source.highThreatScore, DEFAULT_POLICY.highThreatScore),
      safeTenpaiMinLiveTingpai: numberOr(source.safeTenpaiMinLiveTingpai, DEFAULT_POLICY.safeTenpaiMinLiveTingpai),
      safeTenpaiMinWaitQuality: numberOr(source.safeTenpaiMinWaitQuality, DEFAULT_POLICY.safeTenpaiMinWaitQuality),
      safeTenpaiMinHandValue: numberOr(source.safeTenpaiMinHandValue, DEFAULT_POLICY.safeTenpaiMinHandValue),
      defensiveUtilityShadowWeights: {
        ...DEFAULT_POLICY.defensiveUtilityShadowWeights,
        ...((source.defensiveUtilityShadowWeights && typeof source.defensiveUtilityShadowWeights === 'object')
          ? source.defensiveUtilityShadowWeights
          : {}),
        stateSafety: resolveSection(
          source.defensiveUtilityShadowWeights && source.defensiveUtilityShadowWeights.stateSafety,
          DEFAULT_POLICY.defensiveUtilityShadowWeights.stateSafety
        )
      },
      defensiveUtilityActionableMinScoreDelta: numberOr(
        source.defensiveUtilityActionableMinScoreDelta,
        DEFAULT_POLICY.defensiveUtilityActionableMinScoreDelta
      ),
      defensiveUtilityActionableMinDangerDelta: numberOr(
        source.defensiveUtilityActionableMinDangerDelta,
        DEFAULT_POLICY.defensiveUtilityActionableMinDangerDelta
      ),
      defensiveUtilityActionableMinSafetyRankDelta: numberOr(
        source.defensiveUtilityActionableMinSafetyRankDelta,
        DEFAULT_POLICY.defensiveUtilityActionableMinSafetyRankDelta
      ),
      safetyGateMinThreatScore: numberOr(source.safetyGateMinThreatScore, DEFAULT_POLICY.safetyGateMinThreatScore),
      safetyGateProtectScore: numberOr(source.safetyGateProtectScore, DEFAULT_POLICY.safetyGateProtectScore),
      safetyGateMaxXiangtingLoss: numberOr(source.safetyGateMaxXiangtingLoss, DEFAULT_POLICY.safetyGateMaxXiangtingLoss),
      safetyGateMinDangerDelta: numberOr(source.safetyGateMinDangerDelta, DEFAULT_POLICY.safetyGateMinDangerDelta),
      safetyGateMinSafetyRankDelta: numberOr(source.safetyGateMinSafetyRankDelta, DEFAULT_POLICY.safetyGateMinSafetyRankDelta),
      safetyGateMinExpectedCostDelta: numberOr(source.safetyGateMinExpectedCostDelta, DEFAULT_POLICY.safetyGateMinExpectedCostDelta),
      safetyGateBackstepMinThreatScore: numberOr(source.safetyGateBackstepMinThreatScore, DEFAULT_POLICY.safetyGateBackstepMinThreatScore),
      safetyGateBackstepMinExpectedCostDelta: numberOr(source.safetyGateBackstepMinExpectedCostDelta, DEFAULT_POLICY.safetyGateBackstepMinExpectedCostDelta),
      safetyGateProtectedTenpaiMinHandValue: numberOr(source.safetyGateProtectedTenpaiMinHandValue, DEFAULT_POLICY.safetyGateProtectedTenpaiMinHandValue),
      safetyGateProtectedTenpaiMinWaitQuality: numberOr(source.safetyGateProtectedTenpaiMinWaitQuality, DEFAULT_POLICY.safetyGateProtectedTenpaiMinWaitQuality)
    };
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

  function getSeatIndex(runtime, seatKey) {
    return runtime && typeof runtime.getSeatIndex === 'function' ? runtime.getSeatIndex(seatKey) : -1;
  }

  function isDealerSeat(runtime, seatKey) {
    if (!runtime || !seatKey) return false;
    if (typeof runtime.getDealerSeat === 'function') return runtime.getDealerSeat() === seatKey;
    return typeof runtime.getSeatWindIndex === 'function' ? runtime.getSeatWindIndex(seatKey) === 0 : false;
  }

  function isSeatRiichi(runtime, seatKey) {
    return Boolean(
      runtime
      && runtime.riichiState
      && runtime.riichiState[seatKey]
      && runtime.riichiState[seatKey].declared === true
    );
  }

  function getRemainingTiles(runtime) {
    const wallState = runtime && typeof runtime.getWallState === 'function'
      ? runtime.getWallState()
      : null;
    return numberOr(wallState && wallState.remaining, 0);
  }

  function normalizeTileCode(tileCode) {
    if (typeof tileCode !== 'string' || tileCode.length < 2) return null;
    return String(tileCode).replace(/[\*_\+\=\-]+$/g, '').replace(/0/g, '5');
  }

  function extractMeldTiles(meldString) {
    return String(meldString || '').match(/[mpsz][0-9]/g) || [];
  }

  function getSeatMeldStrings(runtime, seatKey) {
    const seatIndex = getSeatIndex(runtime, seatKey);
    const shoupai = seatIndex >= 0 && runtime && runtime.board && Array.isArray(runtime.board.shoupai)
      ? runtime.board.shoupai[seatIndex]
      : null;
    return shoupai && Array.isArray(shoupai._fulou) ? shoupai._fulou.slice() : [];
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

  function getTileSuit(tileCode) {
    const normalized = normalizeTileCode(tileCode);
    return normalized ? normalized[0] : null;
  }

  function countBySuit(tileCodes) {
    return tileCodes.reduce((result, tileCode) => {
      const suit = getTileSuit(tileCode);
      if (suit) result[suit] = Number(result[suit] || 0) + 1;
      return result;
    }, {});
  }

  function analyzeOpenThreat(runtime, seatKey, doraTiles) {
    const melds = getSeatMeldStrings(runtime, seatKey);
    const meldTiles = melds.flatMap(extractMeldTiles).map(normalizeTileCode).filter(Boolean);
    const suits = countBySuit(meldTiles);
    const numberSuitCount = ['m', 'p', 's'].filter((suit) => Number(suits[suit] || 0) > 0).length;
    const honorCount = Number(suits.z || 0);
    const doraCount = meldTiles.filter((tileCode) => doraTiles.includes(tileCode)).length;
    const hasFlushShape = meldTiles.length >= 6 && numberSuitCount === 1;
    const hasHonorOpen = honorCount >= 3;
    return {
      meldCount: melds.length,
      doraCount,
      hasFlushShape,
      hasHonorOpen
    };
  }

  function getDangerCategories(decision) {
    return decision && decision.danger && Array.isArray(decision.danger.categories)
      ? decision.danger.categories.slice()
      : [];
  }

  function buildThreatProfile(runtime, seatKey, attackDecision = {}, options = {}) {
    const policy = resolvePolicy(options.policy || {});
    const activeSeats = getActiveSeats(runtime);
    const remainingTiles = getRemainingTiles(runtime);
    const lateRound = remainingTiles > 0 && remainingTiles <= numberOr(options.lateRemainingTiles, 18);
    const doraTiles = getDoraTiles(runtime);
    const categories = getDangerCategories(attackDecision);
    const riichiOpponents = activeSeats.filter((otherSeatKey) => (
      otherSeatKey && otherSeatKey !== seatKey && isSeatRiichi(runtime, otherSeatKey)
    ));
    const dealerRiichi = riichiOpponents.some((otherSeatKey) => isDealerSeat(runtime, otherSeatKey));
    const openThreats = activeSeats
      .filter((otherSeatKey) => otherSeatKey && otherSeatKey !== seatKey)
      .map((otherSeatKey) => ({
        seatKey: otherSeatKey,
        isDealer: isDealerSeat(runtime, otherSeatKey),
        ...analyzeOpenThreat(runtime, otherSeatKey, doraTiles)
      }))
      .filter((entry) => entry.meldCount >= 2 || entry.doraCount > 0 || entry.hasFlushShape || entry.hasHonorOpen);
    const multiThreat = riichiOpponents.length + openThreats.length >= 2;
    const doraRisk = categories.includes('dora');
    const doraAdjacentRisk = categories.includes('dora-adjacent');
    const weights = policy.threatWeights;
    const threatScore = Math.max(0,
      riichiOpponents.length * numberOr(weights.riichi, 0)
      + (dealerRiichi ? numberOr(weights.dealerRiichi, 0) : 0)
      + (multiThreat ? numberOr(weights.multiThreat, 0) : 0)
      + (lateRound && riichiOpponents.length ? numberOr(weights.lateRound, 0) : 0)
      + openThreats.length * numberOr(weights.openThreat, 0)
      + openThreats.filter((entry) => entry.meldCount >= 2).length * numberOr(weights.openTwoMeld, 0)
      + (doraRisk ? numberOr(weights.doraRisk, 0) : 0)
      + (doraAdjacentRisk ? numberOr(weights.doraAdjacentRisk, 0) : 0)
      + openThreats.filter((entry) => entry.hasHonorOpen).length * numberOr(weights.honorOpenThreat, 0)
      + openThreats.filter((entry) => entry.hasFlushShape).length * numberOr(weights.flushOpenThreat, 0)
    );
    const pointWeights = policy.expectedPointLoss;
    const expectedPointLoss = Math.max(0,
      numberOr(pointWeights.base, 0)
      + riichiOpponents.length * numberOr(pointWeights.riichi, 0)
      + (dealerRiichi ? numberOr(pointWeights.dealer, 0) : 0)
      + (multiThreat ? numberOr(pointWeights.multiThreat, 0) : 0)
      + openThreats.length * numberOr(pointWeights.openThreat, 0)
      + (lateRound ? numberOr(pointWeights.lateRound, 0) : 0)
      + (doraRisk || doraAdjacentRisk ? numberOr(pointWeights.doraRisk, 0) : 0)
    );
    const reasons = [];
    if (riichiOpponents.length) reasons.push('threat-riichi');
    if (dealerRiichi) reasons.push('threat-dealer-riichi');
    if (multiThreat) reasons.push('threat-multi');
    if (lateRound) reasons.push('threat-late-round');
    if (openThreats.length) reasons.push('threat-open-hand');
    if (openThreats.some((entry) => entry.hasFlushShape)) reasons.push('threat-flush-open');
    if (openThreats.some((entry) => entry.hasHonorOpen)) reasons.push('threat-honor-open');
    if (doraRisk) reasons.push('threat-dora-risk');
    if (doraAdjacentRisk) reasons.push('threat-dora-adjacent-risk');
    if (!reasons.length) reasons.push('threat-low');

    return {
      enabled: policy.enableThreatScoreReview,
      threatScore,
      expectedPointLoss,
      riichiCount: riichiOpponents.length,
      dealerThreat: dealerRiichi,
      multiThreat,
      lateRound,
      openThreatCount: openThreats.length,
      maxOpenMeldCount: openThreats.reduce((max, entry) => Math.max(max, entry.meldCount), 0),
      doraRisk,
      doraAdjacentRisk,
      reasons
    };
  }

  function getHardMetrics(decision) {
    return decision && decision.hardMetrics && typeof decision.hardMetrics === 'object' ? decision.hardMetrics : {};
  }

  function getHardContext(decision) {
    const hardMetrics = getHardMetrics(decision);
    return hardMetrics && hardMetrics.hardContext && typeof hardMetrics.hardContext === 'object'
      ? hardMetrics.hardContext
      : {};
  }

  function getXiangting(decision) {
    return numberOr(decision && decision.metrics && decision.metrics.xiangting, 99);
  }

  function getHandValue(decision) {
    const hardMetrics = getHardMetrics(decision);
    if (Number.isFinite(Number(hardMetrics.contextualHandValueEstimate))) return Number(hardMetrics.contextualHandValueEstimate);
    if (Number.isFinite(Number(hardMetrics.handValueEstimate))) return Number(hardMetrics.handValueEstimate);
    return numberOr(decision && decision.metrics && decision.metrics.handValueEstimate, 0);
  }

  function getLiveTingpai(decision) {
    return numberOr(getHardMetrics(decision).liveTingpaiCount, 0);
  }

  function getWaitQuality(decision) {
    return numberOr(getHardMetrics(decision).waitQualityScore, 0);
  }

  function resolveRankDefenseState(attackDecision = {}, threatProfile = {}, options = {}) {
    const policy = resolvePolicy(options.policy || {});
    const hardContext = getHardContext(attackDecision);
    const xiangting = getXiangting(attackDecision);
    const handValue = getHandValue(attackDecision);
    const liveTingpai = getLiveTingpai(attackDecision);
    const waitQuality = getWaitQuality(attackDecision);
    const scoreRank = numberOr(hardContext.scoreRank, 0);
    const leadOverSecond = numberOr(hardContext.leadOverSecond, 0);
    const trailingByLeader = numberOr(hardContext.trailingByLeader, 0);
    const isLateRound = hardContext.isLateRound === true || threatProfile.lateRound === true;
    const reasons = [];

    if (
      xiangting === 0
      && liveTingpai >= policy.safeTenpaiMinLiveTingpai
      && waitQuality >= policy.safeTenpaiMinWaitQuality
      && handValue >= policy.safeTenpaiMinHandValue
    ) {
      reasons.push('def-state-safe-tenpai');
      return { state: 'safe-tenpai', reasons };
    }
    if (scoreRank >= 3 && trailingByLeader >= policy.comebackTrailingScore) {
      reasons.push('def-state-comeback');
      return { state: 'comeback', reasons };
    }
    if (scoreRank === 1 && (leadOverSecond >= policy.protectLeadScore || isLateRound)) {
      reasons.push('def-state-protect-lead');
      return { state: 'protect-lead', reasons };
    }
    if (scoreRank === 2 && (isLateRound || numberOr(threatProfile.threatScore, 0) >= policy.highThreatScore)) {
      reasons.push('def-state-protect-second');
      return { state: 'protect-second', reasons };
    }
    reasons.push('def-state-neutral');
    return { state: 'neutral-defense', reasons };
  }

  function getDangerScore(decision) {
    return numberOr(decision && decision.danger && decision.danger.dangerScore, 0);
  }

  function buildRankAwareReview(runtime, seatKey, attackDecision = {}, options = {}) {
    const policy = resolvePolicy(options.policy || {});
    if (!policy.enableRankAwarePushFold && !policy.enableThreatScoreReview) return null;
    const threatProfile = buildThreatProfile(runtime, seatKey, attackDecision, {
      policy,
      lateRemainingTiles: options.lateRemainingTiles
    });
    const rankState = resolveRankDefenseState(attackDecision, threatProfile, { policy });
    const dangerScore = getDangerScore(attackDecision);
    const expectedDealInCost = (
      Math.max(0, dangerScore)
      * Math.max(0, numberOr(threatProfile.threatScore, 0))
      * Math.max(0, numberOr(threatProfile.expectedPointLoss, 0) / 1000)
      * policy.expectedDealInCostWeight
    );
    const state = rankState.state;
    const riskBias = numberOr(policy.stateRiskBias[state], 0);
    const attackBias = numberOr(policy.stateAttackBias[state], 0);
    const foldNetPushBias = numberOr(policy.stateFoldNetPushBias[state], 0);
    return {
      enabled: true,
      threatProfile,
      rankDefenseState: state,
      rankDefenseStateReasons: rankState.reasons.slice(),
      expectedDealInCost,
      riskBias,
      attackBias,
      foldNetPushBias,
      reasons: threatProfile.reasons.concat(rankState.reasons)
    };
  }

  function roundMetric(value, digits = 1) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    const factor = 10 ** digits;
    return Math.round(number * factor) / factor;
  }

  function getSafetyRank(decision) {
    return numberOr(decision && decision.danger && decision.danger.safetyRank, 9);
  }

  function getDefenseTileRank(decision) {
    return numberOr(decision && decision.danger && decision.danger.defenseTileRank, getSafetyRank(decision) * 10);
  }

  function getHardEvScore(decision) {
    return numberOr(getHardMetrics(decision).hardEvScore, 0);
  }

  function getShadowStateSafetyWeight(weights, state) {
    const stateSafety = weights && weights.stateSafety && typeof weights.stateSafety === 'object'
      ? weights.stateSafety
      : {};
    return numberOr(stateSafety[state], 0);
  }

  function buildDefensiveUtilityProfile(runtime, seatKey, currentDecision = {}, options = {}) {
    if (options.defensiveProfile && options.defensiveProfile.enabled === true) {
      return options.defensiveProfile;
    }
    return buildRankAwareReview(runtime, seatKey, currentDecision, {
      policy: options.policy || {},
      lateRemainingTiles: options.lateRemainingTiles
    });
  }

  function scoreDefensiveUtilityCandidate(candidate, currentDecision, defensiveProfile, policy) {
    const weights = policy.defensiveUtilityShadowWeights || DEFAULT_POLICY.defensiveUtilityShadowWeights;
    const threatProfile = defensiveProfile && defensiveProfile.threatProfile ? defensiveProfile.threatProfile : {};
    const rankState = defensiveProfile && defensiveProfile.rankDefenseState ? defensiveProfile.rankDefenseState : 'neutral-defense';
    const threatScore = numberOr(threatProfile.threatScore, 0);
    const expectedPointLoss = numberOr(threatProfile.expectedPointLoss, 0);
    const dangerScore = getDangerScore(candidate);
    const safetyRank = getSafetyRank(candidate);
    const defenseTileRank = getDefenseTileRank(candidate);
    const xiangting = getXiangting(candidate);
    const currentXiangting = getXiangting(currentDecision);
    const hardMetrics = getHardMetrics(candidate);
    const handValue = getHandValue(candidate);
    const liveTingpai = numberOr(hardMetrics.liveTingpaiCount, 0);
    const waitQuality = numberOr(hardMetrics.waitQualityScore, 0);
    const hardEvScore = getHardEvScore(candidate);
    const attackScore = (
      hardEvScore * numberOr(weights.hardEv, 0)
      + handValue * numberOr(weights.handValue, 0)
      + liveTingpai * numberOr(weights.liveTingpai, 0)
      + waitQuality * numberOr(weights.waitQuality, 0)
    );
    const expectedDealInCost = (
      dangerScore
      * Math.max(0, threatScore)
      * Math.max(0, expectedPointLoss / 1000)
      * numberOr(weights.expectedCost, 0)
      + safetyRank * numberOr(weights.safetyRank, 0)
      + defenseTileRank * numberOr(weights.defenseTileRank, 0)
    );
    const highThreatScore = Math.max(1, numberOr(policy.highThreatScore, DEFAULT_POLICY.highThreatScore));
    const lowThreatFactor = Math.max(0, 1 - Math.min(1, threatScore / highThreatScore));
    const futureSafetyLoss = Math.max(0, 6 - safetyRank)
      * lowThreatFactor
      * numberOr(weights.futureSafetyLoss, 0);
    const xiangtingLossPenalty = Math.max(0, xiangting - currentXiangting)
      * numberOr(weights.xiangtingLoss, 0);
    const safetyValue = (
      Math.max(0, 10 - safetyRank) * 4
      + Math.max(0, 90 - defenseTileRank) * 0.15
      - dangerScore
    ) * numberOr(weights.safetyValue, 0);
    const rankStateBias = safetyValue * getShadowStateSafetyWeight(weights, rankState);
    const utility = attackScore + rankStateBias - expectedDealInCost - futureSafetyLoss - xiangtingLossPenalty;
    return {
      tileCode: candidate && candidate.tileCode ? candidate.tileCode : null,
      tileIndex: numberOr(candidate && candidate.tileIndex, 99),
      xiangting,
      dangerScore,
      safetyRank,
      defenseTileRank,
      hardEvScore,
      attackScore,
      rankStateBias,
      expectedDealInCost,
      futureSafetyLoss,
      xiangtingLossPenalty,
      utility,
      safetyReasons: candidate && candidate.danger && Array.isArray(candidate.danger.safetyReasons)
        ? candidate.danger.safetyReasons.slice(0, 4)
        : []
    };
  }

  function compactShadowCandidate(score) {
    return {
      tileCode: score.tileCode,
      xiangting: score.xiangting,
      dangerScore: score.dangerScore,
      safetyRank: score.safetyRank,
      defenseTileRank: score.defenseTileRank,
      hardEvScore: roundMetric(score.hardEvScore, 1),
      utility: roundMetric(score.utility, 1),
      attackScore: roundMetric(score.attackScore, 1),
      expectedDealInCost: roundMetric(score.expectedDealInCost, 1),
      futureSafetyLoss: roundMetric(score.futureSafetyLoss, 1),
      xiangtingLossPenalty: roundMetric(score.xiangtingLossPenalty, 1),
      safetyReasons: score.safetyReasons
    };
  }

  function isSaferShadowChoice(recommended, current) {
    if (!recommended || !current || recommended.tileCode === current.tileCode) return false;
    return recommended.dangerScore < current.dangerScore
      || recommended.safetyRank < current.safetyRank
      || recommended.defenseTileRank < current.defenseTileRank;
  }

  function evaluateActionableShadow(recommended, current, defensiveProfile, policy) {
    if (!recommended || !current || recommended.tileCode === current.tileCode) {
      return { actionable: false, reasons: ['def-shadow-not-actionable-same-tile'] };
    }
    const threatProfile = defensiveProfile && defensiveProfile.threatProfile ? defensiveProfile.threatProfile : {};
    const rankState = defensiveProfile && defensiveProfile.rankDefenseState ? defensiveProfile.rankDefenseState : 'neutral-defense';
    const threatScore = numberOr(threatProfile.threatScore, 0);
    const pressureRelevant = threatScore >= numberOr(policy.highThreatScore, DEFAULT_POLICY.highThreatScore)
      || threatProfile.riichiCount > 0
      || threatProfile.multiThreat === true
      || threatProfile.dealerThreat === true
      || threatProfile.lateRound === true
      || ['protect-lead', 'protect-second'].includes(rankState);
    const dangerDelta = current.dangerScore - recommended.dangerScore;
    const safetyRankDelta = current.safetyRank - recommended.safetyRank;
    const scoreDelta = recommended.utility - current.utility;
    const saferAlternative = isSaferShadowChoice(recommended, current);
    const backstep = recommended.xiangting > current.xiangting;
    const positiveReasons = [];
    if (pressureRelevant) positiveReasons.push('def-shadow-actionable-pressure');
    if (saferAlternative) positiveReasons.push('def-shadow-actionable-safer');
    if (scoreDelta >= policy.defensiveUtilityActionableMinScoreDelta) positiveReasons.push('def-shadow-actionable-score');
    if (dangerDelta >= policy.defensiveUtilityActionableMinDangerDelta) positiveReasons.push('def-shadow-actionable-danger');
    if (safetyRankDelta >= policy.defensiveUtilityActionableMinSafetyRankDelta) positiveReasons.push('def-shadow-actionable-safety-rank');
    if (['comeback', 'safe-tenpai'].includes(rankState) && backstep) {
      return {
        actionable: false,
        reasons: ['def-shadow-not-actionable-attack-state-backstep'],
        pressureRelevant,
        dangerDelta,
        safetyRankDelta,
        scoreDelta
      };
    }
    const hasMeaningfulGain = scoreDelta >= policy.defensiveUtilityActionableMinScoreDelta
      || dangerDelta >= policy.defensiveUtilityActionableMinDangerDelta
      || safetyRankDelta >= policy.defensiveUtilityActionableMinSafetyRankDelta;
    const actionable = Boolean(pressureRelevant && saferAlternative && hasMeaningfulGain);
    if (!actionable) {
      const negativeReasons = [];
      if (!pressureRelevant) negativeReasons.push('def-shadow-not-actionable-low-pressure');
      if (!saferAlternative) negativeReasons.push('def-shadow-not-actionable-not-safer');
      if (!hasMeaningfulGain) negativeReasons.push('def-shadow-not-actionable-low-signal');
      return {
        actionable: false,
        reasons: negativeReasons.length ? negativeReasons : ['def-shadow-not-actionable-low-signal'],
        pressureRelevant,
        dangerDelta,
        safetyRankDelta,
        scoreDelta
      };
    }
    return {
      actionable: true,
      reasons: positiveReasons.length ? positiveReasons : ['def-shadow-actionable'],
      pressureRelevant,
      dangerDelta,
      safetyRankDelta,
      scoreDelta
    };
  }

  function evaluateDefensiveUtilityShadow(candidates, currentDecision, options = {}) {
    const policy = resolvePolicy(options.policy || {});
    if (policy.enableDefensiveUtilityShadow !== true || !currentDecision) return null;
    const decisions = Array.isArray(candidates) ? candidates.filter(Boolean) : [];
    if (!decisions.length) return null;
    const defensiveProfile = buildDefensiveUtilityProfile(
      options.runtime || null,
      options.seatKey || null,
      currentDecision,
      {
        policy,
        defensiveProfile: options.defensiveProfile || null,
        lateRemainingTiles: options.lateRemainingTiles
      }
    );
    if (!defensiveProfile || defensiveProfile.enabled !== true) return null;

    const scored = decisions
      .map((candidate) => scoreDefensiveUtilityCandidate(candidate, currentDecision, defensiveProfile, policy))
      .sort((left, right) => (
        right.utility - left.utility
        || left.dangerScore - right.dangerScore
        || left.safetyRank - right.safetyRank
        || left.defenseTileRank - right.defenseTileRank
        || left.tileIndex - right.tileIndex
      ));
    const recommended = scored[0] || null;
    const current = scored.find((entry) => entry.tileCode === currentDecision.tileCode) || scoreDefensiveUtilityCandidate(currentDecision, currentDecision, defensiveProfile, policy);
    if (!recommended || !current) return null;

    const differs = recommended.tileCode !== current.tileCode;
    const saferAlternative = isSaferShadowChoice(recommended, current);
    const backstep = differs && recommended.xiangting > current.xiangting;
    const actionableReview = evaluateActionableShadow(recommended, current, defensiveProfile, policy);
    const reasons = ['def-shadow-review'];
    reasons.push(differs ? 'def-shadow-diff' : 'def-shadow-agrees');
    if (saferAlternative) reasons.push('def-shadow-safer-alt');
    if (backstep) reasons.push('def-shadow-backstep');
    if (numberOr(defensiveProfile.threatProfile && defensiveProfile.threatProfile.threatScore, 0) >= policy.highThreatScore) {
      reasons.push('def-shadow-high-threat');
    }
    if (['comeback', 'safe-tenpai'].includes(defensiveProfile.rankDefenseState) && !backstep) {
      reasons.push('def-shadow-attack-protected');
    }
    if (actionableReview.actionable) reasons.push('def-shadow-actionable');

    return {
      enabled: true,
      mode: 'defensive-utility-shadow-v1',
      currentTileCode: current.tileCode,
      recommendedTileCode: recommended.tileCode,
      differs,
      saferAlternative,
      backstep,
      actionable: actionableReview.actionable,
      scoreDelta: roundMetric(recommended.utility - current.utility, 1),
      dangerDelta: roundMetric(actionableReview.dangerDelta || 0, 1),
      safetyRankDelta: roundMetric(actionableReview.safetyRankDelta || 0, 1),
      rankDefenseState: defensiveProfile.rankDefenseState || null,
      threatScore: roundMetric(defensiveProfile.threatProfile && defensiveProfile.threatProfile.threatScore, 1),
      current: compactShadowCandidate(current),
      recommended: compactShadowCandidate(recommended),
      top: scored.slice(0, 3).map(compactShadowCandidate),
      reasons,
      actionableReasons: actionableReview.reasons.slice(0, 8)
    };
  }

  function classifySafetyGateCandidate(score, current, policy) {
    if (!score || !current) return 'unsafe';
    const dangerDelta = current.dangerScore - score.dangerScore;
    const safetyRankDelta = current.safetyRank - score.safetyRank;
    const expectedCostDelta = current.expectedDealInCost - score.expectedDealInCost;
    const isClearlySafe = score.dangerScore <= 1
      || score.safetyRank <= 1
      || score.defenseTileRank <= 12
      || score.safetyReasons.includes('safety-genbutsu');
    if (isClearlySafe) return 'safe';
    if (
      dangerDelta >= policy.safetyGateMinDangerDelta
      || safetyRankDelta >= policy.safetyGateMinSafetyRankDelta
      || expectedCostDelta >= policy.safetyGateMinExpectedCostDelta
    ) return 'semi-safe';
    return 'unsafe';
  }

  function compactSafetyGateCandidate(score) {
    return {
      tileCode: score.tileCode,
      xiangting: score.xiangting,
      dangerScore: score.dangerScore,
      safetyRank: score.safetyRank,
      defenseTileRank: score.defenseTileRank,
      safetyClass: score.safetyClass,
      xiangtingLoss: roundMetric(score.xiangtingLoss, 1),
      attackScore: roundMetric(score.attackScore, 1),
      expectedDealInCost: roundMetric(score.expectedDealInCost, 1),
      gateUtility: roundMetric(score.gateUtility, 1),
      safetyReasons: score.safetyReasons
    };
  }

  function isSafetyGateProtectedPush(current, defensiveProfile, policy) {
    const rankState = defensiveProfile && defensiveProfile.rankDefenseState ? defensiveProfile.rankDefenseState : 'neutral-defense';
    if (rankState === 'comeback') return true;
    const handValue = getHandValue(current);
    const waitQuality = getWaitQuality(current);
    const xiangting = getXiangting(current);
    return rankState === 'safe-tenpai'
      && xiangting === 0
      && handValue >= policy.safetyGateProtectedTenpaiMinHandValue
      && waitQuality >= policy.safetyGateProtectedTenpaiMinWaitQuality;
  }

  function isSafetyGateBackstepAllowed(entry, current, defensiveProfile, policy) {
    if (!entry || !current || entry.xiangtingLoss <= 0) return true;
    const rankState = defensiveProfile && defensiveProfile.rankDefenseState ? defensiveProfile.rankDefenseState : 'neutral-defense';
    if (!['protect-lead', 'protect-second'].includes(rankState)) return false;
    if (entry.xiangtingLoss > policy.safetyGateMaxXiangtingLoss) return false;
    if (entry.safetyClass !== 'safe') return false;
    const threatProfile = defensiveProfile && defensiveProfile.threatProfile ? defensiveProfile.threatProfile : {};
    const threatScore = numberOr(threatProfile.threatScore, 0);
    const severeThreat = threatScore >= policy.safetyGateBackstepMinThreatScore
      || threatProfile.dealerThreat === true
      || threatProfile.multiThreat === true
      || (threatProfile.lateRound === true && numberOr(threatProfile.riichiCount, 0) > 0);
    if (!severeThreat) return false;
    const expectedCostDelta = current.expectedDealInCost - entry.expectedDealInCost;
    return expectedCostDelta >= policy.safetyGateBackstepMinExpectedCostDelta;
  }

  function evaluateSafetyGateRerank(candidates, currentDecision, options = {}) {
    const policy = resolvePolicy(options.policy || {});
    if (policy.enableSafetyGateRerank !== true || !currentDecision) return null;
    const decisions = Array.isArray(candidates) ? candidates.filter(Boolean) : [];
    if (!decisions.length) return null;
    const defensiveProfile = buildDefensiveUtilityProfile(
      options.runtime || null,
      options.seatKey || null,
      currentDecision,
      {
        policy,
        defensiveProfile: options.defensiveProfile || null,
        lateRemainingTiles: options.lateRemainingTiles
      }
    );
    if (!defensiveProfile || defensiveProfile.enabled !== true) return null;

    const threatProfile = defensiveProfile.threatProfile || {};
    const rankState = defensiveProfile.rankDefenseState || 'neutral-defense';
    const threatScore = numberOr(threatProfile.threatScore, 0);
    const pressureRelevant = threatScore >= policy.safetyGateMinThreatScore
      || threatProfile.dealerThreat === true
      || threatProfile.multiThreat === true
      || numberOr(threatProfile.riichiCount, 0) > 0;
    const protectRelevant = ['protect-lead', 'protect-second'].includes(rankState)
      && (
        threatScore >= policy.safetyGateProtectScore
        || threatProfile.lateRound === true
        || numberOr(threatProfile.riichiCount, 0) > 0
        || numberOr(threatProfile.openThreatCount, 0) > 0
      );
    const active = pressureRelevant || protectRelevant;
    const currentBase = scoreDefensiveUtilityCandidate(currentDecision, currentDecision, defensiveProfile, policy);
    const scored = decisions.map((candidate) => {
      const score = scoreDefensiveUtilityCandidate(candidate, currentDecision, defensiveProfile, policy);
      const xiangtingLoss = Math.max(0, score.xiangting - currentBase.xiangting);
      const safetyClass = classifySafetyGateCandidate(score, currentBase, policy);
      const safetyClassBonus = safetyClass === 'safe' ? 220 : safetyClass === 'semi-safe' ? 90 : -300;
      const gateUtility = (
        safetyClassBonus
        - score.expectedDealInCost
        - xiangtingLoss * 42
        + score.attackScore * 0.18
        - score.dangerScore * 8
        - score.safetyRank * 4
      );
      return {
        ...score,
        safetyClass,
        xiangtingLoss,
        gateUtility
      };
    }).sort((left, right) => (
      right.gateUtility - left.gateUtility
      || left.expectedDealInCost - right.expectedDealInCost
      || left.dangerScore - right.dangerScore
      || left.safetyRank - right.safetyRank
      || left.xiangtingLoss - right.xiangtingLoss
      || right.attackScore - left.attackScore
      || left.tileIndex - right.tileIndex
    ));
    const current = scored.find((entry) => entry.tileCode === currentDecision.tileCode) || {
      ...currentBase,
      safetyClass: classifySafetyGateCandidate(currentBase, currentBase, policy),
      xiangtingLoss: 0,
      gateUtility: currentBase.utility
    };
    const protectedPush = isSafetyGateProtectedPush(currentDecision, defensiveProfile, policy);
    const base = {
      enabled: true,
      mode: 'defensive-safety-gate-v1',
      active,
      override: false,
      currentTileCode: current.tileCode,
      recommendedTileCode: current.tileCode,
      selectedTileCode: current.tileCode,
      saferAlternative: false,
      sameShanten: false,
      backstep: false,
      protectedPush,
      rankDefenseState: rankState,
      threatScore: roundMetric(threatScore, 1),
      current: compactSafetyGateCandidate(current),
      recommended: compactSafetyGateCandidate(current),
      top: scored.slice(0, 3).map(compactSafetyGateCandidate),
      reasons: ['def-safety-gate-review']
    };
    if (!active) {
      return {
        ...base,
        reasons: base.reasons.concat('def-safety-gate-low-pressure')
      };
    }
    if (protectedPush) {
      return {
        ...base,
        reasons: base.reasons.concat('def-safety-gate-protected-push')
      };
    }
    if (current.safetyClass === 'safe') {
      return {
        ...base,
        reasons: base.reasons.concat('def-safety-gate-current-safe')
      };
    }

    const allowed = scored.filter((entry) => {
      if (!entry || entry.tileCode === current.tileCode) return false;
      if (!['safe', 'semi-safe'].includes(entry.safetyClass)) return false;
      if (entry.xiangtingLoss > policy.safetyGateMaxXiangtingLoss) return false;
      if (['comeback', 'safe-tenpai'].includes(rankState) && entry.xiangtingLoss > 0) return false;
      if (entry.xiangtingLoss > 0 && !isSafetyGateBackstepAllowed(entry, current, defensiveProfile, policy)) return false;
      const dangerDelta = current.dangerScore - entry.dangerScore;
      const safetyRankDelta = current.safetyRank - entry.safetyRank;
      const expectedCostDelta = current.expectedDealInCost - entry.expectedDealInCost;
      return dangerDelta >= policy.safetyGateMinDangerDelta
        || safetyRankDelta >= policy.safetyGateMinSafetyRankDelta
        || expectedCostDelta >= policy.safetyGateMinExpectedCostDelta
        || entry.safetyClass === 'safe';
    }).sort((left, right) => (
      left.xiangtingLoss - right.xiangtingLoss
      || (left.safetyClass === 'safe' ? 0 : 1) - (right.safetyClass === 'safe' ? 0 : 1)
      || right.gateUtility - left.gateUtility
      || left.expectedDealInCost - right.expectedDealInCost
      || right.attackScore - left.attackScore
      || left.tileIndex - right.tileIndex
    ));
    const recommended = allowed[0] || null;
    if (!recommended) {
      return {
        ...base,
        reasons: base.reasons.concat('def-safety-gate-no-candidate')
      };
    }
    const sameShanten = recommended.xiangting === current.xiangting;
    const backstep = recommended.xiangting > current.xiangting;
    const reasons = base.reasons.concat('def-safety-gate-override');
    if (sameShanten) reasons.push('def-safety-gate-same-shanten');
    if (backstep) reasons.push('def-safety-gate-backstep');
    if (recommended.safetyClass === 'safe') reasons.push('def-safety-gate-safe');
    if (recommended.safetyClass === 'semi-safe') reasons.push('def-safety-gate-semi-safe');
    if (pressureRelevant) reasons.push('def-safety-gate-pressure');
    if (protectRelevant) reasons.push('def-safety-gate-rank-protect');
    return {
      ...base,
      override: true,
      recommendedTileCode: recommended.tileCode,
      selectedTileCode: recommended.tileCode,
      saferAlternative: true,
      sameShanten,
      backstep,
      recommended: compactSafetyGateCandidate(recommended),
      reasons
    };
  }

  function isMiddleTile(tileCode) {
    const normalized = normalizeTileCode(tileCode);
    if (!normalized || normalized[0] === 'z') return false;
    const rank = Number(normalized[1]);
    return rank >= 4 && rank <= 6;
  }

  function classifyDealInAttribution(snapshot = {}) {
    const threat = snapshot.threatProfile || {};
    const state = snapshot.defensiveState || null;
    const xiangting = numberOr(snapshot.xiangting, 99);
    if (state === 'comeback') return 'comeback-push';
    if (threat.dealerThreat) return 'dealer-threat';
    if (threat.multiThreat) return 'multi-threat';
    if (xiangting === 0) return 'tenpai-push';
    if (numberOr(threat.riichiCount, 0) > 0) return 'riichi-push';
    if (snapshot.closedHandBefore === false && !snapshot.safeTileCode) return 'open-hand-no-safe';
    if (numberOr(threat.riichiCount, 0) === 0 && isMiddleTile(snapshot.tileCode)) return 'no-pressure-middle';
    return 'unknown';
  }

  return {
    DEFAULT_POLICY: clone(DEFAULT_POLICY),
    resolvePolicy,
    buildThreatProfile,
    resolveRankDefenseState,
    buildRankAwareReview,
    evaluateSafetyGateRerank,
    evaluateDefensiveUtilityShadow,
    classifyDealInAttribution
  };
});
