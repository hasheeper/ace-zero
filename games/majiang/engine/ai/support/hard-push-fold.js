(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.AceMahjongAiHardPushFold = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const DEFAULT_POLICY = Object.freeze({
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
  });

  function numberOr(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function resolvePolicy(policy = {}) {
    const source = policy && typeof policy === 'object' ? policy : {};
    return {
      enableHardPushFold: source.enableHardPushFold !== false,
      allowCrossXiangtingFold: source.allowCrossXiangtingFold !== false,
      minPressureScore: numberOr(source.minPressureScore, DEFAULT_POLICY.minPressureScore),
      safeDangerMax: numberOr(source.safeDangerMax, DEFAULT_POLICY.safeDangerMax),
      dangerousDangerMin: numberOr(source.dangerousDangerMin, DEFAULT_POLICY.dangerousDangerMin),
      multiThreatPressureScore: numberOr(source.multiThreatPressureScore, DEFAULT_POLICY.multiThreatPressureScore),
      foldNetPushMax: numberOr(source.foldNetPushMax, DEFAULT_POLICY.foldNetPushMax),
      tenpaiPushMinLiveTingpai: numberOr(source.tenpaiPushMinLiveTingpai, DEFAULT_POLICY.tenpaiPushMinLiveTingpai),
      tenpaiPushMinWaitQuality: numberOr(source.tenpaiPushMinWaitQuality, DEFAULT_POLICY.tenpaiPushMinWaitQuality),
      tenpaiPushMinHandValue: numberOr(source.tenpaiPushMinHandValue, DEFAULT_POLICY.tenpaiPushMinHandValue),
      highValuePushMinHandValue: numberOr(source.highValuePushMinHandValue, DEFAULT_POLICY.highValuePushMinHandValue),
      xiangtingLossPenalty: numberOr(source.xiangtingLossPenalty, DEFAULT_POLICY.xiangtingLossPenalty)
    };
  }

  function getDangerScore(decision) {
    return numberOr(decision && decision.danger && decision.danger.dangerScore, 0);
  }

  function getXiangting(decision) {
    return numberOr(decision && decision.metrics && decision.metrics.xiangting, 99);
  }

  function getHardMetrics(decision) {
    return decision && decision.hardMetrics && typeof decision.hardMetrics === 'object'
      ? decision.hardMetrics
      : {};
  }

  function getContextualHandValue(decision) {
    const hardMetrics = getHardMetrics(decision);
    if (Number.isFinite(Number(hardMetrics.contextualHandValueEstimate))) {
      return Number(hardMetrics.contextualHandValueEstimate);
    }
    if (Number.isFinite(Number(hardMetrics.handValueEstimate))) {
      return Number(hardMetrics.handValueEstimate);
    }
    return numberOr(decision && decision.metrics && decision.metrics.handValueEstimate, 0);
  }

  function getPressureState(attackDecision, options = {}) {
    if (options.pushFoldState && typeof options.pushFoldState === 'object') {
      return options.pushFoldState;
    }
    if (attackDecision && attackDecision.pushFoldState && typeof attackDecision.pushFoldState === 'object') {
      return attackDecision.pushFoldState;
    }
    return {
      state: 'neutral',
      pressureScore: 0,
      reasons: []
    };
  }

  function isProtectedPush(decision, policy) {
    const xiangting = getXiangting(decision);
    const hardMetrics = getHardMetrics(decision);
    const liveTingpaiCount = numberOr(hardMetrics.liveTingpaiCount, 0);
    const waitQualityScore = numberOr(hardMetrics.waitQualityScore, 0);
    const handValue = getContextualHandValue(decision);

    if (handValue >= policy.highValuePushMinHandValue) return true;
    return xiangting === 0
      && liveTingpaiCount >= policy.tenpaiPushMinLiveTingpai
      && waitQualityScore >= policy.tenpaiPushMinWaitQuality
      && handValue >= policy.tenpaiPushMinHandValue;
  }

  function calculateAttackScore(decision, policy) {
    const xiangting = Math.max(0, getXiangting(decision));
    const hardMetrics = getHardMetrics(decision);
    const handValue = getContextualHandValue(decision);
    const liveTingpaiCount = numberOr(hardMetrics.liveTingpaiCount, 0);
    const waitQualityScore = numberOr(hardMetrics.waitQualityScore, 0);

    if (xiangting === 0) {
      return handValue + liveTingpaiCount * 4 + waitQualityScore;
    }
    if (xiangting === 1) {
      return handValue + liveTingpaiCount * 1.5 + waitQualityScore * 0.4 - policy.xiangtingLossPenalty;
    }
    return handValue + liveTingpaiCount * 0.6 + waitQualityScore * 0.25 - xiangting * policy.xiangtingLossPenalty;
  }

  function getHardContext(decision) {
    const hardMetrics = getHardMetrics(decision);
    return hardMetrics && hardMetrics.hardContext && typeof hardMetrics.hardContext === 'object'
      ? hardMetrics.hardContext
      : null;
  }

  function selectBestSafeCandidate(candidates, attackDecision, policy) {
    const attackXiangting = getXiangting(attackDecision);
    return (Array.isArray(candidates) ? candidates : [])
      .filter((candidate) => (
        candidate
        && candidate !== attackDecision
        && getXiangting(candidate) > attackXiangting
        && getDangerScore(candidate) <= policy.safeDangerMax
      ))
      .sort((left, right) => (
        getDangerScore(left) - getDangerScore(right)
        || getXiangting(left) - getXiangting(right)
        || numberOr(right && right.hardMetrics && right.hardMetrics.hardEvScore, 0) - numberOr(left && left.hardMetrics && left.hardMetrics.hardEvScore, 0)
        || numberOr(left && left.tileIndex, 99) - numberOr(right && right.tileIndex, 99)
      ))[0] || null;
  }

  function buildResult(mode, selectedDecision, attackDecision, safeDecision, summary) {
    return {
      mode,
      selectedTileCode: selectedDecision && selectedDecision.tileCode ? selectedDecision.tileCode : null,
      attackTileCode: attackDecision && attackDecision.tileCode ? attackDecision.tileCode : null,
      safeTileCode: safeDecision && safeDecision.tileCode ? safeDecision.tileCode : null,
      pressureScore: numberOr(summary.pressureScore, 0),
      attackScore: numberOr(summary.attackScore, 0),
      riskScore: numberOr(summary.riskScore, 0),
      netPushScore: numberOr(summary.netPushScore, 0),
      pushProtected: Boolean(summary.pushProtected),
      reasons: Array.isArray(summary.reasons) ? summary.reasons.slice() : []
    };
  }

  function evaluateHardPushFoldCandidates(candidates, attackDecision, options = {}) {
    const policy = resolvePolicy(options.policy || {});
    const pressureState = getPressureState(attackDecision, options);
    const pressureScore = numberOr(pressureState && pressureState.pressureScore, 0);
    const pressureStateName = pressureState && typeof pressureState.state === 'string'
      ? pressureState.state
      : 'neutral';
    const reasons = [];

    if (!attackDecision || !policy.enableHardPushFold || !policy.allowCrossXiangtingFold) {
      return buildResult('keep-attack', attackDecision, attackDecision, null, {
        pressureScore,
        reasons: ['hard-push-fold-disabled']
      });
    }

    if (pressureStateName !== 'careful' || pressureScore < policy.minPressureScore) {
      return buildResult('keep-attack', attackDecision, attackDecision, null, {
        pressureScore,
        reasons: ['hard-push-fold-pressure-too-low']
      });
    }

    const safeDecision = selectBestSafeCandidate(candidates, attackDecision, policy);
    const attackDanger = getDangerScore(attackDecision);
    const attackScore = calculateAttackScore(attackDecision, policy);
    const riskScore = attackDanger * pressureScore;
    const netPushScore = attackScore - riskScore;
    const pushProtected = isProtectedPush(attackDecision, policy);
    const attackXiangting = getXiangting(attackDecision);
    const attackHandValue = getContextualHandValue(attackDecision);
    const hardContext = getHardContext(attackDecision);
    const isMultiThreat = pressureScore >= policy.multiThreatPressureScore;
    const isLeaderLate = Boolean(
      hardContext
      && hardContext.isLateRound === true
      && numberOr(hardContext.defenseValuePenalty, 0) > 0
    );
    const isLowValue = attackHandValue < policy.tenpaiPushMinHandValue;
    const isFarFromTenpai = attackXiangting >= 2;
    const isDangerousEnough = attackDanger >= policy.dangerousDangerMin;
    const hasFoldTrigger = isLowValue || isFarFromTenpai || isMultiThreat || isLeaderLate;

    if (attackDanger <= policy.safeDangerMax) {
      return buildResult('keep-attack', attackDecision, attackDecision, safeDecision, {
        pressureScore,
        attackScore,
        riskScore,
        netPushScore,
        pushProtected,
        reasons: ['hard-push-fold-attack-already-safe']
      });
    }

    if (pushProtected) reasons.push('hard-push-fold-protected-push');
    if (isLowValue) reasons.push('hard-push-fold-low-value');
    if (isFarFromTenpai) reasons.push('hard-push-fold-far-from-tenpai');
    if (isMultiThreat) reasons.push('hard-push-fold-multi-threat');
    if (isLeaderLate) reasons.push('hard-push-fold-late-leader');
    if (isDangerousEnough) reasons.push('hard-push-fold-dangerous-attack');

    if (
      safeDecision
      && !pushProtected
      && hasFoldTrigger
      && (isDangerousEnough || isMultiThreat || isLeaderLate || netPushScore <= policy.foldNetPushMax)
      && netPushScore <= policy.foldNetPushMax
    ) {
      reasons.push('hard-push-fold-cross-xiangting-fold');
      return buildResult('cross-xiangting-fold', safeDecision, attackDecision, safeDecision, {
        pressureScore,
        attackScore,
        riskScore,
        netPushScore,
        pushProtected,
        reasons
      });
    }

    reasons.push(safeDecision ? 'hard-push-fold-keep-attack' : 'hard-push-fold-no-safe-cross-candidate');
    return buildResult('keep-attack', attackDecision, attackDecision, safeDecision, {
      pressureScore,
      attackScore,
      riskScore,
      netPushScore,
      pushProtected,
      reasons
    });
  }

  return {
    DEFAULT_POLICY,
    evaluateHardPushFoldCandidates
  };
});
