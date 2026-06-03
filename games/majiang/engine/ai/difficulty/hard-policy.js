(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.AceMahjongHardDifficultyPolicy = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  function deepFreeze(value) {
    if (!value || typeof value !== 'object') return value;
    Object.getOwnPropertyNames(value).forEach((key) => {
      deepFreeze(value[key]);
    });
    return Object.freeze(value);
  }

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  const HARD_POLICY = deepFreeze({
    id: 'hard',
    enableDefense: true,
    enableAdvancedCallReview: true,
    searchDepth: 1,
    rolloutCount: 0,
    randomness: 0.02,
    context: {
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
    },
    riichi: {
      minTingpaiCount: 1,
      minRemainingTiles: 12,
      minHandValueEstimate: 4,
      requireLegalChoice: true,
      allowBadWait: false,
      minLiveTingpaiCount: 3,
      minWaitQualityScore: 8,
      goodWaitTypes: ['ryanmen', 'shanpon'],
      badWaitMinHandValue: 40,
      badWaitMinRemainingTiles: 18,
      allowNoPressureThinRiichi: true,
      thinRiichiAllowedWaitTypes: ['tanki'],
      thinRiichiMinRemainingTiles: 30,
      thinRiichiMinLiveTingpai: 3,
      thinRiichiMinHandValue: 23,
      thinRiichiMaxDiscardDanger: 0,
      pressureMinHandValue: 42,
      maxPressureDiscardDanger: 3
    },
    call: {
      enableHardCallReview: true,
      allowYakuhaiPeng: true,
      allowShantenImprovement: true,
      allowFlatSpeedUp: true,
      flatUkeireBoost: 5,
      flatTingpaiBoost: 1,
      flatHandShapeBoost: 3,
      minFlatHandValueDelta: 0,
      suppressFlatCallsUnderRiichi: true,
      minLiveUkeireBoost: 4,
      minLiveTingpaiBoost: 1,
      minHardEvBoost: 20,
      minPressureHandValue: 28,
      rejectFlatCallsUnderPressure: true
    },
    route: {
      enableClosedRouteValueRebalance: false,
      closedRouteMaxXiangting: 2,
      closedRouteMinRemainingTiles: 24,
      closedRouteOverrideMinMargin: 35,
      directTenpaiCallAlwaysAllow: true,
      pressureDisablesClosedRouteOverride: true,
      weights: {
        callShantenImprove: 45,
        callDirectTenpai: 90,
        callLiveUkeireDelta: 2,
        callLiveTingpaiDelta: 5,
        callHardEvDelta: 0.12,
        callContextualHandValue: 1,
        callYakuhai: 18,
        passClosedBase: 18,
        passRemainingTile: 0.5,
        passLiveUkeire: 0.7,
        passLiveTingpai: 1.8,
        passWaitQuality: 1.4,
        passContextualHandValue: 1,
        passRiichiPotential: 1,
        lostClosedRouteBase: 18
      }
    },
    discard: {
      enableHardEv: true,
      enableNoPressureShapeReview: true,
      shapeTieBreakMaxHardEvDelta: 12,
      shapeTieBreakMinShapeDelta: 3,
      shapeReviewMinXiangting: 0,
      shapeStrongOverrideEnabled: true,
      shapeStrongOverrideMinShapeDelta: 18,
      shapeStrongOverrideMaxHardEvLoss: 80,
      shapeStrongOverrideMinXiangting: 1,
      shapeStrongOverrideMaxXiangting: 3,
      enableNoPressureCleanupGuard: true,
      cleanupGuardMinShapeDelta: 12,
      cleanupGuardMaxHardEvLoss: 100,
      cleanupGuardMinXiangting: 1,
      cleanupGuardMaxXiangting: 4,
      shapeScoreWeight: 1,
      preserveXiangtingPriority: true,
      pressureSafetyFirst: true,
      weights: {
        liveUkeire: 3,
        liveTingpai: 8,
        waitQuality: 4,
        handValue: 1
      }
    },
    pushFold: {
      enableHardPushFold: true,
      allowCrossXiangtingFold: true,
      minPressureScore: 8,
      safeDangerMax: 1,
      dangerousDangerMin: 6,
      multiThreatPressureScore: 16,
      foldNetPushMax: 35,
      tenpaiPushMinLiveTingpai: 3,
      tenpaiPushMinWaitQuality: 8,
      tenpaiPushMinHandValue: 42,
      highValuePushMinHandValue: 60,
      xiangtingLossPenalty: 28
    },
    defense: {
      enableTileDanger: true,
      usePushFoldState: true,
      preferSafetyOnlyUnderPressure: false,
      dangerModel: 'hard-v1',
      prioritizeSafetyAtSameShanten: true,
      enableLowDangerTiebreak: true,
      lowDangerTiebreakMinPressure: 4,
      lowDangerMaxDanger: 1,
      sameXiangtingMinSafetyRankDelta: 3,
      sameXiangtingMaxHardEvLoss: 180,
      softFoldMaxPressureScore: 4,
      softFoldSafeDangerMax: 0,
      softFoldCurrentDangerMin: 1,
      softFoldCurrentSafetyRankMin: 2,
      softFoldMaxXiangtingLoss: 1,
      softFoldMaxHardEvLoss: 180
    }
  });

  function createHardPolicy() {
    return clone(HARD_POLICY);
  }

  return {
    HARD_POLICY,
    createHardPolicy
  };
});
