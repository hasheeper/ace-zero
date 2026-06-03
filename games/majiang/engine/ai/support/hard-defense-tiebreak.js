(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.AceMahjongAiHardDefenseTiebreak = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const DEFAULT_DEFENSE_POLICY = Object.freeze({
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
    softFoldMaxHardEvLoss: 180,
    enableEqualSafeBackstep: false,
    equalSafeBackstepMinPressure: 8,
    equalSafeBackstepDangerMax: 0,
    equalSafeBackstepSafetyRankMax: 0,
    equalSafeBackstepMinDefenseTileRankGain: 2,
    equalSafeBackstepMaxXiangtingLoss: 1
  });

  const DEFAULT_PUSH_POLICY = Object.freeze({
    tenpaiPushMinLiveTingpai: 3,
    tenpaiPushMinWaitQuality: 8,
    tenpaiPushMinHandValue: 42,
    highValuePushMinHandValue: 60
  });

  function numberOr(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function resolveDefensePolicy(policy = {}) {
    const source = policy && typeof policy === 'object' ? policy : {};
    return {
      enableLowDangerTiebreak: source.enableLowDangerTiebreak !== false,
      lowDangerTiebreakMinPressure: numberOr(source.lowDangerTiebreakMinPressure, DEFAULT_DEFENSE_POLICY.lowDangerTiebreakMinPressure),
      lowDangerMaxDanger: numberOr(source.lowDangerMaxDanger, DEFAULT_DEFENSE_POLICY.lowDangerMaxDanger),
      sameXiangtingMinSafetyRankDelta: numberOr(source.sameXiangtingMinSafetyRankDelta, DEFAULT_DEFENSE_POLICY.sameXiangtingMinSafetyRankDelta),
      sameXiangtingMaxHardEvLoss: numberOr(source.sameXiangtingMaxHardEvLoss, DEFAULT_DEFENSE_POLICY.sameXiangtingMaxHardEvLoss),
      softFoldMaxPressureScore: numberOr(source.softFoldMaxPressureScore, DEFAULT_DEFENSE_POLICY.softFoldMaxPressureScore),
      softFoldSafeDangerMax: numberOr(source.softFoldSafeDangerMax, DEFAULT_DEFENSE_POLICY.softFoldSafeDangerMax),
      softFoldCurrentDangerMin: numberOr(source.softFoldCurrentDangerMin, DEFAULT_DEFENSE_POLICY.softFoldCurrentDangerMin),
      softFoldCurrentSafetyRankMin: numberOr(source.softFoldCurrentSafetyRankMin, DEFAULT_DEFENSE_POLICY.softFoldCurrentSafetyRankMin),
      softFoldMaxXiangtingLoss: numberOr(source.softFoldMaxXiangtingLoss, DEFAULT_DEFENSE_POLICY.softFoldMaxXiangtingLoss),
      softFoldMaxHardEvLoss: numberOr(source.softFoldMaxHardEvLoss, DEFAULT_DEFENSE_POLICY.softFoldMaxHardEvLoss),
      enableEqualSafeBackstep: source.enableEqualSafeBackstep === true,
      equalSafeBackstepMinPressure: numberOr(source.equalSafeBackstepMinPressure, DEFAULT_DEFENSE_POLICY.equalSafeBackstepMinPressure),
      equalSafeBackstepDangerMax: numberOr(source.equalSafeBackstepDangerMax, DEFAULT_DEFENSE_POLICY.equalSafeBackstepDangerMax),
      equalSafeBackstepSafetyRankMax: numberOr(source.equalSafeBackstepSafetyRankMax, DEFAULT_DEFENSE_POLICY.equalSafeBackstepSafetyRankMax),
      equalSafeBackstepMinDefenseTileRankGain: numberOr(source.equalSafeBackstepMinDefenseTileRankGain, DEFAULT_DEFENSE_POLICY.equalSafeBackstepMinDefenseTileRankGain),
      equalSafeBackstepMaxXiangtingLoss: numberOr(source.equalSafeBackstepMaxXiangtingLoss, DEFAULT_DEFENSE_POLICY.equalSafeBackstepMaxXiangtingLoss)
    };
  }

  function resolvePushPolicy(policy = {}) {
    const source = policy && typeof policy === 'object' ? policy : {};
    return {
      tenpaiPushMinLiveTingpai: numberOr(source.tenpaiPushMinLiveTingpai, DEFAULT_PUSH_POLICY.tenpaiPushMinLiveTingpai),
      tenpaiPushMinWaitQuality: numberOr(source.tenpaiPushMinWaitQuality, DEFAULT_PUSH_POLICY.tenpaiPushMinWaitQuality),
      tenpaiPushMinHandValue: numberOr(source.tenpaiPushMinHandValue, DEFAULT_PUSH_POLICY.tenpaiPushMinHandValue),
      highValuePushMinHandValue: numberOr(source.highValuePushMinHandValue, DEFAULT_PUSH_POLICY.highValuePushMinHandValue)
    };
  }

  function getPressureState(currentDecision, options = {}) {
    if (options.pushFoldState && typeof options.pushFoldState === 'object') return options.pushFoldState;
    if (currentDecision && currentDecision.pushFoldState && typeof currentDecision.pushFoldState === 'object') {
      return currentDecision.pushFoldState;
    }
    return {
      state: 'neutral',
      pressureScore: 0,
      reasons: []
    };
  }

  function getDanger(decision) {
    return decision && decision.danger && typeof decision.danger === 'object'
      ? decision.danger
      : {};
  }

  function getDangerScore(decision) {
    return numberOr(getDanger(decision).dangerScore, 0);
  }

  function getSafetyRank(decision) {
    const danger = getDanger(decision);
    if (Number.isFinite(Number(danger.safetyRank))) return Number(danger.safetyRank);
    return getDangerScore(decision) <= 0 ? 0 : getDangerScore(decision) * 10;
  }

  function getDefenseTileRank(decision) {
    const danger = getDanger(decision);
    if (Number.isFinite(Number(danger.defenseTileRank))) return Number(danger.defenseTileRank);
    return getSafetyRank(decision) * 10 + getDangerScore(decision);
  }

  function getXiangting(decision) {
    return numberOr(decision && decision.metrics && decision.metrics.xiangting, 99);
  }

  function getHardMetrics(decision) {
    return decision && decision.hardMetrics && typeof decision.hardMetrics === 'object'
      ? decision.hardMetrics
      : {};
  }

  function getHardEvScore(decision) {
    return numberOr(getHardMetrics(decision).hardEvScore, 0);
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

  function isProtectedPush(decision, pushPolicy) {
    const xiangting = getXiangting(decision);
    const hardMetrics = getHardMetrics(decision);
    const liveTingpaiCount = numberOr(hardMetrics.liveTingpaiCount, 0);
    const waitQualityScore = numberOr(hardMetrics.waitQualityScore, 0);
    const handValue = getContextualHandValue(decision);

    if (handValue >= pushPolicy.highValuePushMinHandValue) return true;
    return xiangting === 0
      && liveTingpaiCount >= pushPolicy.tenpaiPushMinLiveTingpai
      && waitQualityScore >= pushPolicy.tenpaiPushMinWaitQuality
      && handValue >= pushPolicy.tenpaiPushMinHandValue;
  }

  function getHardEvLoss(currentDecision, candidate) {
    return Math.max(0, getHardEvScore(currentDecision) - getHardEvScore(candidate));
  }

  function isSaferThan(left, right) {
    const leftDanger = getDangerScore(left);
    const rightDanger = getDangerScore(right);
    if (leftDanger < rightDanger) return true;
    if (leftDanger > rightDanger) return false;

    const leftSafety = getSafetyRank(left);
    const rightSafety = getSafetyRank(right);
    if (leftSafety < rightSafety) return true;
    if (leftSafety > rightSafety) return false;

    const leftDefenseRank = getDefenseTileRank(left);
    const rightDefenseRank = getDefenseTileRank(right);
    if (leftDefenseRank < rightDefenseRank) return true;
    if (leftDefenseRank > rightDefenseRank) return false;

    return false;
  }

  function hasMeaningfulSameXiangtingSafetyGain(candidate, currentDecision, policy) {
    const candidateDanger = getDangerScore(candidate);
    const currentDanger = getDangerScore(currentDecision);
    if (candidateDanger < currentDanger) return true;
    if (candidateDanger > currentDanger) return false;
    return getSafetyRank(currentDecision) - getSafetyRank(candidate) >= policy.sameXiangtingMinSafetyRankDelta;
  }

  function compareDefenseCandidates(left, right) {
    return getDangerScore(left) - getDangerScore(right)
      || getSafetyRank(left) - getSafetyRank(right)
      || getDefenseTileRank(left) - getDefenseTileRank(right)
      || getHardEvScore(right) - getHardEvScore(left)
      || numberOr(left && left.tileIndex, 99) - numberOr(right && right.tileIndex, 99);
  }

  function selectSameXiangtingCandidate(candidates, currentDecision, policy) {
    const currentXiangting = getXiangting(currentDecision);
    return (Array.isArray(candidates) ? candidates : [])
      .filter((candidate) => (
        candidate
        && candidate !== currentDecision
        && getXiangting(candidate) === currentXiangting
        && getDangerScore(candidate) <= policy.lowDangerMaxDanger
        && getHardEvLoss(currentDecision, candidate) <= policy.sameXiangtingMaxHardEvLoss
        && hasMeaningfulSameXiangtingSafetyGain(candidate, currentDecision, policy)
        && isSaferThan(candidate, currentDecision)
      ))
      .sort(compareDefenseCandidates)[0] || null;
  }

  function selectSoftFoldCandidate(candidates, currentDecision, policy) {
    const currentXiangting = getXiangting(currentDecision);
    return (Array.isArray(candidates) ? candidates : [])
      .filter((candidate) => {
        const xiangtingLoss = getXiangting(candidate) - currentXiangting;
        return candidate
          && candidate !== currentDecision
          && getDangerScore(candidate) <= policy.softFoldSafeDangerMax
          && xiangtingLoss >= 0
          && xiangtingLoss <= policy.softFoldMaxXiangtingLoss
          && getHardEvLoss(currentDecision, candidate) <= policy.softFoldMaxHardEvLoss
          && isSaferThan(candidate, currentDecision);
      })
      .sort((left, right) => (
        compareDefenseCandidates(left, right)
        || getXiangting(left) - getXiangting(right)
      ))[0] || null;
  }

  function selectEqualSafeBackstepCandidate(candidates, currentDecision, policy) {
    const currentXiangting = getXiangting(currentDecision);
    const currentDefenseRank = getDefenseTileRank(currentDecision);
    return (Array.isArray(candidates) ? candidates : [])
      .filter((candidate) => {
        const xiangtingLoss = getXiangting(candidate) - currentXiangting;
        return candidate
          && candidate !== currentDecision
          && xiangtingLoss >= 0
          && xiangtingLoss <= policy.equalSafeBackstepMaxXiangtingLoss
          && getDangerScore(candidate) <= policy.equalSafeBackstepDangerMax
          && getSafetyRank(candidate) <= policy.equalSafeBackstepSafetyRankMax
          && getDangerScore(currentDecision) <= policy.equalSafeBackstepDangerMax
          && getSafetyRank(currentDecision) <= policy.equalSafeBackstepSafetyRankMax
          && currentDefenseRank - getDefenseTileRank(candidate) >= policy.equalSafeBackstepMinDefenseTileRankGain
          && getHardEvScore(candidate) > getHardEvScore(currentDecision);
      })
      .sort((left, right) => (
        getDefenseTileRank(left) - getDefenseTileRank(right)
        || getHardEvScore(right) - getHardEvScore(left)
        || getXiangting(left) - getXiangting(right)
        || numberOr(left && left.tileIndex, 99) - numberOr(right && right.tileIndex, 99)
      ))[0] || null;
  }

  function buildResult(mode, selectedDecision, currentDecision, safeDecision, summary = {}) {
    return {
      mode,
      selectedTileCode: selectedDecision && selectedDecision.tileCode ? selectedDecision.tileCode : null,
      currentTileCode: currentDecision && currentDecision.tileCode ? currentDecision.tileCode : null,
      safeTileCode: safeDecision && safeDecision.tileCode ? safeDecision.tileCode : null,
      pressureScore: numberOr(summary.pressureScore, 0),
      safetyRankDelta: numberOr(summary.safetyRankDelta, 0),
      xiangtingLoss: numberOr(summary.xiangtingLoss, 0),
      hardEvLoss: numberOr(summary.hardEvLoss, 0),
      reasons: Array.isArray(summary.reasons) ? summary.reasons.slice() : []
    };
  }

  function evaluateHardDefenseTiebreakCandidates(candidates, currentDecision, options = {}) {
    const policy = resolveDefensePolicy(options.policy || {});
    const pushPolicy = resolvePushPolicy(options.pushPolicy || {});
    const pressureState = getPressureState(currentDecision, options);
    const pressureScore = numberOr(pressureState && pressureState.pressureScore, 0);
    if (!currentDecision || !policy.enableLowDangerTiebreak) {
      return buildResult('keep-current', currentDecision, currentDecision, null, {
        pressureScore,
        reasons: ['hard-defense-tiebreak-disabled']
      });
    }
    if (options.hardPushFold && options.hardPushFold.mode === 'cross-xiangting-fold') {
      return buildResult('keep-current', currentDecision, currentDecision, null, {
        pressureScore,
        reasons: ['hard-defense-tiebreak-push-fold-already-folded']
      });
    }
    if (pressureScore < policy.lowDangerTiebreakMinPressure) {
      return buildResult('keep-current', currentDecision, currentDecision, null, {
        pressureScore,
        reasons: ['hard-defense-tiebreak-pressure-too-low']
      });
    }

    const sameXiangtingCandidate = selectSameXiangtingCandidate(candidates, currentDecision, policy);
    if (sameXiangtingCandidate) {
      return buildResult('same-xiangting-low-danger', sameXiangtingCandidate, currentDecision, sameXiangtingCandidate, {
        pressureScore,
        safetyRankDelta: getSafetyRank(currentDecision) - getSafetyRank(sameXiangtingCandidate),
        xiangtingLoss: 0,
        hardEvLoss: getHardEvLoss(currentDecision, sameXiangtingCandidate),
        reasons: ['hard-defense-tiebreak-same-xiangting-low-danger']
      });
    }

    if (
      policy.enableEqualSafeBackstep
      && pressureScore >= policy.equalSafeBackstepMinPressure
      && !isProtectedPush(currentDecision, pushPolicy)
    ) {
      const equalSafeBackstepCandidate = selectEqualSafeBackstepCandidate(candidates, currentDecision, policy);
      if (equalSafeBackstepCandidate) {
        return buildResult('equal-safe-backstep', equalSafeBackstepCandidate, currentDecision, equalSafeBackstepCandidate, {
          pressureScore,
          safetyRankDelta: getSafetyRank(currentDecision) - getSafetyRank(equalSafeBackstepCandidate),
          xiangtingLoss: getXiangting(equalSafeBackstepCandidate) - getXiangting(currentDecision),
          hardEvLoss: getHardEvLoss(currentDecision, equalSafeBackstepCandidate),
          reasons: ['hard-defense-tiebreak-equal-safe-backstep']
        });
      }
    }

    if (getDangerScore(currentDecision) < policy.softFoldCurrentDangerMin) {
      return buildResult('keep-current', currentDecision, currentDecision, null, {
        pressureScore,
        reasons: ['hard-defense-tiebreak-current-already-safe']
      });
    }
    if (getSafetyRank(currentDecision) < policy.softFoldCurrentSafetyRankMin) {
      return buildResult('keep-current', currentDecision, currentDecision, null, {
        pressureScore,
        reasons: ['hard-defense-tiebreak-current-safety-rank-low']
      });
    }
    if (isProtectedPush(currentDecision, pushPolicy)) {
      return buildResult('keep-current', currentDecision, currentDecision, null, {
        pressureScore,
        reasons: ['hard-defense-tiebreak-protected-push']
      });
    }
    if (pressureScore > policy.softFoldMaxPressureScore) {
      return buildResult('keep-current', currentDecision, currentDecision, null, {
        pressureScore,
        reasons: ['hard-defense-tiebreak-soft-fold-pressure-too-high']
      });
    }

    const softFoldCandidate = selectSoftFoldCandidate(candidates, currentDecision, policy);
    if (softFoldCandidate) {
      return buildResult('low-pressure-soft-fold', softFoldCandidate, currentDecision, softFoldCandidate, {
        pressureScore,
        safetyRankDelta: getSafetyRank(currentDecision) - getSafetyRank(softFoldCandidate),
        xiangtingLoss: getXiangting(softFoldCandidate) - getXiangting(currentDecision),
        hardEvLoss: getHardEvLoss(currentDecision, softFoldCandidate),
        reasons: ['hard-defense-tiebreak-low-pressure-soft-fold']
      });
    }

    return buildResult('keep-current', currentDecision, currentDecision, null, {
      pressureScore,
      reasons: ['hard-defense-tiebreak-no-better-low-danger-candidate']
    });
  }

  return {
    DEFAULT_DEFENSE_POLICY,
    evaluateHardDefenseTiebreakCandidates
  };
});
