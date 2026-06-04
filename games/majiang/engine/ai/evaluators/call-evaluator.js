(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('../../base/majiang-core-adapter'),
      require('../support/hand-metrics'),
      require('../difficulty/easy-policy'),
      require('../difficulty/normal-policy'),
      require('../difficulty/hard-policy'),
      require('../support/hard-ev'),
      require('../support/round-context'),
      require('../support/hard-defensive-profile')
    );
    return;
  }
  root.AceMahjongCallEvaluator = factory(
    root.AceMahjongBrowserCoreAdapter || null,
    root.AceMahjongAiHandMetrics || null,
    root.AceMahjongEasyDifficultyPolicy || null,
    root.AceMahjongNormalDifficultyPolicy || null,
    root.AceMahjongHardDifficultyPolicy || null,
    root.AceMahjongAiHardEv || null,
    root.AceMahjongAiRoundContext || null,
    root.AceMahjongAiHardDefensiveProfile || null
  );
})(typeof globalThis !== 'undefined' ? globalThis : this, function(
  coreAdapter,
  handMetricsApi,
  easyPolicyApi,
  normalPolicyApi,
  hardPolicyApi,
  hardEvApi,
  roundContextApi,
  hardDefensiveProfileApi
) {
  'use strict';

  function getCoreAdapter() {
    if (coreAdapter) return coreAdapter;
    if (typeof globalThis !== 'undefined' && globalThis.AceMahjongBrowserCoreAdapter) {
      return globalThis.AceMahjongBrowserCoreAdapter;
    }
    throw new Error('AceMahjongCallEvaluator requires a majiang core adapter.');
  }

  function estimateUkeireCount(adapter, shoupai) {
    if (handMetricsApi && typeof handMetricsApi.estimateUkeireCount === 'function') {
      return handMetricsApi.estimateUkeireCount(adapter, shoupai);
    }
    return 0;
  }

  function estimateHandShapeValue(shoupai) {
    if (handMetricsApi && typeof handMetricsApi.estimateHandShapeValue === 'function') {
      return handMetricsApi.estimateHandShapeValue(shoupai);
    }
    return 0;
  }

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function normalizeDifficulty(value) {
    const difficulty = typeof value === 'string' ? value.toLowerCase() : 'normal';
    if (difficulty === 'easy') return 'easy';
    if (difficulty === 'hard') return 'hard';
    if (difficulty === 'hell') return 'hell';
    return 'normal';
  }

  function createPolicyByDifficulty(difficulty) {
    if (difficulty === 'easy' && easyPolicyApi && typeof easyPolicyApi.createEasyPolicy === 'function') {
      return easyPolicyApi.createEasyPolicy();
    }
    if (difficulty === 'hard' && hardPolicyApi && typeof hardPolicyApi.createHardPolicy === 'function') {
      return hardPolicyApi.createHardPolicy();
    }
    if (difficulty === 'hell' && hardPolicyApi && typeof hardPolicyApi.createHardPolicy === 'function') {
      return {
        ...hardPolicyApi.createHardPolicy(),
        id: 'hell'
      };
    }
    if (normalPolicyApi && typeof normalPolicyApi.createNormalPolicy === 'function') {
      return normalPolicyApi.createNormalPolicy();
    }
    return { id: normalizeDifficulty(difficulty) };
  }

  function resolvePolicy(options = {}) {
    if (options.policy && typeof options.policy === 'object') {
      return clone(options.policy);
    }
    return createPolicyByDifficulty(normalizeDifficulty(options.difficulty));
  }

  function countRiichiOpponents(runtime, seatKey) {
    if (!runtime || !runtime.riichiState) return 0;
    const activeSeats = runtime && runtime.topology && Array.isArray(runtime.topology.activeSeats) && runtime.topology.activeSeats.length
      ? runtime.topology.activeSeats.slice()
      : (Array.isArray(runtime && runtime.activeSeats) ? runtime.activeSeats.slice() : ['bottom', 'right', 'top', 'left']);
    return activeSeats.filter((otherSeatKey) => (
      otherSeatKey
      && otherSeatKey !== seatKey
      && runtime.riichiState[otherSeatKey]
      && runtime.riichiState[otherSeatKey].declared === true
    )).length;
  }

  function getHardEvApi() {
    if (hardEvApi) return hardEvApi;
    if (typeof globalThis !== 'undefined' && globalThis.AceMahjongAiHardEv) {
      return globalThis.AceMahjongAiHardEv;
    }
    return null;
  }

  function getRoundContextApi() {
    if (roundContextApi) return roundContextApi;
    if (typeof globalThis !== 'undefined' && globalThis.AceMahjongAiRoundContext) {
      return globalThis.AceMahjongAiRoundContext;
    }
    return null;
  }

  function getHardDefensiveProfileApi() {
    if (hardDefensiveProfileApi) return hardDefensiveProfileApi;
    if (typeof globalThis !== 'undefined' && globalThis.AceMahjongAiHardDefensiveProfile) {
      return globalThis.AceMahjongAiHardDefensiveProfile;
    }
    return null;
  }

  function compareCallEvaluation(next, best) {
    if (!best) return true;
    if (next.metrics.xiangting < best.metrics.xiangting) return true;
    if (next.metrics.xiangting > best.metrics.xiangting) return false;
    if (next.metrics.tingpaiCount > best.metrics.tingpaiCount) return true;
    if (next.metrics.tingpaiCount < best.metrics.tingpaiCount) return false;
    if (next.metrics.ukeireCount > best.metrics.ukeireCount) return true;
    if (next.metrics.ukeireCount < best.metrics.ukeireCount) return false;
    if (next.metrics.handValueEstimate > best.metrics.handValueEstimate) return true;
    if (next.metrics.handValueEstimate < best.metrics.handValueEstimate) return false;
    if (next.callType === 'peng' && best.callType !== 'peng') return true;
    if (next.callType !== 'peng' && best.callType === 'peng') return false;
    return String(next.action && next.action.key || '') < String(best.action && best.action.key || '');
  }

  function normalizeTileCode(tileCode) {
    if (typeof tileCode !== 'string' || tileCode.length < 2) return null;
    return String(tileCode).replace(/[\*_\+\=\-]+$/g, '').replace(/0/g, '5');
  }

  function getYakuhaiTileCodes(runtime, seatKey) {
    const codes = new Set(['z5', 'z6', 'z7']);
    if (!runtime || !seatKey) return Array.from(codes);

    const seatWindIndex = typeof runtime.getSeatWindIndex === 'function'
      ? runtime.getSeatWindIndex(seatKey)
      : -1;
    if (seatWindIndex >= 0 && seatWindIndex < 4) {
      codes.add(`z${seatWindIndex + 1}`);
    }

    const roundWindIndex = runtime && runtime.board && Number.isInteger(runtime.board.zhuangfeng)
      ? runtime.board.zhuangfeng
      : -1;
    if (roundWindIndex >= 0 && roundWindIndex < 4) {
      codes.add(`z${roundWindIndex + 1}`);
    }

    return Array.from(codes);
  }

  function isYakuhaiPeng(runtime, seatKey, action) {
    const payload = action && action.payload && typeof action.payload === 'object'
      ? action.payload
      : null;
    if (!payload || payload.callType !== 'peng') return false;
    const tileCode = normalizeTileCode(payload.tileCode);
    if (!tileCode) return false;
    return getYakuhaiTileCodes(runtime, seatKey).includes(tileCode);
  }

  function isClosedHand(shoupai) {
    return Boolean(shoupai && Array.isArray(shoupai._fulou) && shoupai._fulou.length === 0);
  }

  function getRemainingTiles(runtime) {
    const wallState = runtime && typeof runtime.getWallState === 'function'
      ? runtime.getWallState()
      : null;
    const remaining = Number(wallState && wallState.remaining);
    return Number.isFinite(remaining) ? remaining : 0;
  }

  function numberFromPolicy(source, key, fallback) {
    const value = Number(source && source[key]);
    return Number.isFinite(value) ? value : fallback;
  }

  function isHardFamilyPolicyId(policyId) {
    return policyId === 'hard'
      || policyId === 'hard-pure'
      || policyId === 'hard-aggressive'
      || policyId === 'hard-tuned'
      || policyId === 'hard-defensive'
      || policyId === 'hard-balanced'
      || policyId === 'hard-aggressive-dev'
      || policyId === 'hard-defensive-dev'
      || policyId === 'hard-balanced-dev'
      || policyId === 'hard-heavy'
      || policyId === 'hard-experimental'
      || policyId === 'hell';
  }

  function shouldUseHardCallRules(policy = {}, callPolicy = null) {
    const resolvedCallPolicy = callPolicy && typeof callPolicy === 'object'
      ? callPolicy
      : policy && policy.call && typeof policy.call === 'object'
      ? policy.call
      : {};
    const policyId = typeof policy.id === 'string' ? policy.id : '';
    return resolvedCallPolicy.enableHardCallReview !== false && isHardFamilyPolicyId(policyId);
  }

  function evaluateHardCallHand(adapter, runtime, seatKey, shoupai, handValueEstimate, policy = {}, hardContext = null) {
    const api = getHardEvApi();
    if (!api || typeof api.evaluateHardDiscardMetrics !== 'function') return null;
    try {
      return api.evaluateHardDiscardMetrics(adapter, runtime, seatKey, shoupai, {
        handValueEstimate,
        policy: policy && policy.discard && typeof policy.discard === 'object'
          ? policy.discard
          : {},
        contextPolicy: policy && policy.context && typeof policy.context === 'object'
          ? policy.context
          : {},
        hardContext
      });
    } catch (error) {
      return null;
    }
  }

  function evaluateHardCallMetrics(adapter, runtime, seatKey, currentShoupai, nextShoupai, currentMetrics, nextMetrics, action, policy = {}) {
    const contextApi = getRoundContextApi();
    const hardContext = contextApi && typeof contextApi.buildRuntimeHardRoundContext === 'function'
      ? contextApi.buildRuntimeHardRoundContext(runtime, seatKey, {
          contextPolicy: policy && policy.context && typeof policy.context === 'object'
            ? policy.context
            : {}
        })
      : null;
    const currentHard = evaluateHardCallHand(
      adapter,
      runtime,
      seatKey,
      currentShoupai.clone(),
      Number(currentMetrics && currentMetrics.handValueEstimate || 0) || 0,
      policy,
      hardContext
    );
    const nextHard = evaluateHardCallHand(
      adapter,
      runtime,
      seatKey,
      nextShoupai.clone(),
      Number(nextMetrics && nextMetrics.handValueEstimate || 0) || 0,
      policy,
      hardContext
    );
    const currentLiveUkeire = Number(currentHard && currentHard.liveUkeireCount || 0) || 0;
    const nextLiveUkeire = Number(nextHard && nextHard.liveUkeireCount || 0) || 0;
    const currentLiveTingpai = Number(currentHard && currentHard.liveTingpaiCount || 0) || 0;
    const nextLiveTingpai = Number(nextHard && nextHard.liveTingpaiCount || 0) || 0;
    const currentWaitQuality = Number(currentHard && currentHard.waitQualityScore || 0) || 0;
    const nextWaitQuality = Number(nextHard && nextHard.waitQualityScore || 0) || 0;
    const currentHardEvScore = Number(currentHard && currentHard.hardEvScore || 0) || 0;
    const nextHardEvScore = Number(nextHard && nextHard.hardEvScore || 0) || 0;
    const currentHandValue = Number(currentMetrics && currentMetrics.handValueEstimate || 0) || 0;
    const nextHandValue = Number(nextMetrics && nextMetrics.handValueEstimate || 0) || 0;
    const currentContextualHandValue = Number.isFinite(Number(currentHard && currentHard.contextualHandValueEstimate))
      ? Number(currentHard.contextualHandValueEstimate)
      : contextApi && typeof contextApi.applyHardContextToHandValue === 'function'
      ? contextApi.applyHardContextToHandValue(currentHandValue, hardContext)
      : currentHandValue;
    const nextContextualHandValue = Number.isFinite(Number(nextHard && nextHard.contextualHandValueEstimate))
      ? Number(nextHard.contextualHandValueEstimate)
      : contextApi && typeof contextApi.applyHardContextToHandValue === 'function'
      ? contextApi.applyHardContextToHandValue(nextHandValue, hardContext)
      : nextHandValue;

    return {
      riichiPressure: countRiichiOpponents(runtime, seatKey),
      isYakuhaiPeng: isYakuhaiPeng(runtime, seatKey, action),
      closedHandBefore: isClosedHand(currentShoupai),
      currentXiangting: Number(currentMetrics && currentMetrics.xiangting),
      nextXiangting: Number(nextMetrics && nextMetrics.xiangting),
      hardContext,
      currentLiveUkeireCount: currentLiveUkeire,
      nextLiveUkeireCount: nextLiveUkeire,
      liveUkeireDelta: nextLiveUkeire - currentLiveUkeire,
      currentLiveTingpaiCount: currentLiveTingpai,
      nextLiveTingpaiCount: nextLiveTingpai,
      liveTingpaiDelta: nextLiveTingpai - currentLiveTingpai,
      currentWaitQualityScore: currentWaitQuality,
      nextWaitQualityScore: nextWaitQuality,
      waitQualityDelta: nextWaitQuality - currentWaitQuality,
      currentHardEvScore,
      nextHardEvScore,
      hardEvDelta: nextHardEvScore - currentHardEvScore,
      currentContextualHandValueEstimate: currentContextualHandValue,
      nextContextualHandValueEstimate: nextContextualHandValue,
      handValueDelta: nextHandValue - currentHandValue,
      contextualHandValueDelta: nextContextualHandValue - currentContextualHandValue,
      currentBestWaitType: currentHard && currentHard.bestWaitType ? currentHard.bestWaitType : null,
      nextBestWaitType: nextHard && nextHard.bestWaitType ? nextHard.bestWaitType : null
    };
  }

  const DEFAULT_ROUTE_WEIGHTS = Object.freeze({
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
  });

  function resolveRouteWeights(routePolicy = {}) {
    const source = routePolicy && routePolicy.weights && typeof routePolicy.weights === 'object'
      ? routePolicy.weights
      : {};
    return Object.keys(DEFAULT_ROUTE_WEIGHTS).reduce((weights, key) => {
      weights[key] = numberFromPolicy(source, key, DEFAULT_ROUTE_WEIGHTS[key]);
      return weights;
    }, {});
  }

  function estimateClosedRiichiPotential(currentXiangting, hardCallMetrics = {}, weights = DEFAULT_ROUTE_WEIGHTS) {
    const liveTingpai = Number(hardCallMetrics.currentLiveTingpaiCount || 0) || 0;
    const waitQuality = Number(hardCallMetrics.currentWaitQualityScore || 0) || 0;
    const contextualHandValue = Number(hardCallMetrics.currentContextualHandValueEstimate || 0) || 0;
    const shanten = Number(currentXiangting);
    const shantenBase = shanten <= 0 ? 60 : shanten === 1 ? 42 : shanten === 2 ? 24 : 0;
    return (
      shantenBase
      + liveTingpai * 1.2
      + waitQuality * 0.8
      + contextualHandValue * 0.25
    ) * Number(weights.passRiichiPotential || 0);
  }

  function resolveBalancedRouteState(routePolicy = {}, context = {}) {
    const remainingTiles = Number(context.remainingTiles || 0) || 0;
    const riichiPressure = Number(context.riichiPressure || 0) || 0;
    const currentXiangting = Number(context.currentXiangting);
    const nextXiangting = Number(context.nextXiangting);
    const directTenpai = context.directTenpai === true;
    const shantenImprovesBy = Number(context.shantenImprovesBy || 0) || 0;
    const liveUkeireDelta = Number(context.liveUkeireDelta || 0) || 0;
    const hardEvDelta = Number(context.hardEvDelta || 0) || 0;
    const currentContextualHandValue = Number(context.currentContextualHandValue || 0) || 0;
    const nextContextualHandValue = Number(context.nextContextualHandValue || 0) || 0;
    const riichiPotential = Number(context.riichiPotential || 0) || 0;
    const minRemainingTiles = numberFromPolicy(routePolicy, 'closedRouteMinRemainingTiles', 24);
    const valueMargin = numberFromPolicy(routePolicy, 'balancedValueOverrideMinMargin', 95);
    const neutralMargin = numberFromPolicy(routePolicy, 'balancedNeutralOverrideMinMargin', 140);
    const lowValueMax = numberFromPolicy(routePolicy, 'balancedLowValueMax', 28);
    const strongHardEvDelta = numberFromPolicy(routePolicy, 'balancedStrongCallHardEvDelta', 120);
    const strongLiveUkeireDelta = numberFromPolicy(routePolicy, 'balancedStrongCallLiveUkeireDelta', 12);
    const shantenHardEvDelta = numberFromPolicy(routePolicy, 'balancedShantenCallHardEvDelta', 60);
    const shantenLiveUkeireDelta = numberFromPolicy(routePolicy, 'balancedShantenCallLiveUkeireDelta', 8);
    const valueMinRiichiPotential = numberFromPolicy(routePolicy, 'balancedValueMinRiichiPotential', 55);
    const valueMinContextualHandValue = numberFromPolicy(routePolicy, 'balancedValueMinContextualHandValue', 32);
    const twoShantenValueMinRiichiPotential = numberFromPolicy(routePolicy, 'balancedTwoShantenValueMinRiichiPotential', 80);
    const twoShantenValueMinContextualHandValue = numberFromPolicy(routePolicy, 'balancedTwoShantenValueMinContextualHandValue', 60);
    const reasons = [];

    if (riichiPressure > 0) {
      reasons.push('balanced-state-riichi-pressure');
      return {
        state: 'defense',
        reasons,
        overrideAllowed: false,
        effectiveMinMargin: null
      };
    }
    if (directTenpai) {
      reasons.push('balanced-state-direct-tenpai');
      return {
        state: 'tenpai-speed',
        reasons,
        overrideAllowed: false,
        effectiveMinMargin: null
      };
    }
    if (remainingTiles < minRemainingTiles) {
      reasons.push('balanced-state-late-round');
      return {
        state: 'tenpai-speed',
        reasons,
        overrideAllowed: false,
        effectiveMinMargin: null
      };
    }

    const lowValueRoute = Math.max(currentContextualHandValue, nextContextualHandValue) <= lowValueMax;
    const valueRoute = Number.isFinite(currentXiangting) && currentXiangting <= 2 && (
      currentXiangting >= 2
        ? (
            currentContextualHandValue >= twoShantenValueMinContextualHandValue
            || riichiPotential >= twoShantenValueMinRiichiPotential
          )
        : (
            currentContextualHandValue >= valueMinContextualHandValue
            || riichiPotential >= valueMinRiichiPotential
          )
    );
    const strongCallGain = hardEvDelta >= strongHardEvDelta || liveUkeireDelta >= strongLiveUkeireDelta;
    const twoShantenSpeedImprove = (
      shantenImprovesBy > 0
      && Number.isFinite(currentXiangting)
      && currentXiangting >= 2
      && !valueRoute
      && lowValueRoute
    );
    const shantenCallGain = shantenImprovesBy > 0 && (
      twoShantenSpeedImprove
      || hardEvDelta >= shantenHardEvDelta
      || liveUkeireDelta >= shantenLiveUkeireDelta
      || lowValueRoute
    );
    if (strongCallGain || shantenCallGain) {
      if (strongCallGain) reasons.push('balanced-state-strong-call-gain');
      if (shantenCallGain) reasons.push('balanced-state-shanten-speed');
      if (lowValueRoute) reasons.push('balanced-state-low-value-route');
      return {
        state: 'speed',
        reasons,
        overrideAllowed: false,
        effectiveMinMargin: null
      };
    }

    if (valueRoute) {
      if (
        currentXiangting >= 2
          ? currentContextualHandValue >= twoShantenValueMinContextualHandValue
          : currentContextualHandValue >= valueMinContextualHandValue
      ) reasons.push('balanced-state-closed-value');
      if (
        currentXiangting >= 2
          ? riichiPotential >= twoShantenValueMinRiichiPotential
          : riichiPotential >= valueMinRiichiPotential
      ) reasons.push('balanced-state-riichi-potential');
      return {
        state: 'value',
        reasons,
        overrideAllowed: true,
        effectiveMinMargin: valueMargin
      };
    }

    if (Number.isFinite(nextXiangting) && nextXiangting <= 1 && shantenImprovesBy > 0) {
      reasons.push('balanced-state-near-tenpai-speed');
      return {
        state: 'tenpai-speed',
        reasons,
        overrideAllowed: false,
        effectiveMinMargin: null
      };
    }

    reasons.push('balanced-state-neutral');
    return {
      state: 'neutral',
      reasons,
      overrideAllowed: true,
      effectiveMinMargin: neutralMargin
    };
  }

  function evaluateClosedRouteValueReview(runtime, seatKey, currentMetrics, nextMetrics, action, policy = {}, hardCallMetrics = null) {
    const routePolicy = policy && policy.route && typeof policy.route === 'object'
      ? policy.route
      : {};
    const policyId = typeof policy.id === 'string' ? policy.id : '';
    const enabled = routePolicy.enableClosedRouteValueRebalance === true
      && (
        policyId === 'hard-experimental'
        || policyId === 'hard-balanced'
        || policyId === 'hard-balanced-dev'
        || policyId === 'hard-heavy'
      );
    const currentXiangting = Number(currentMetrics && currentMetrics.xiangting);
    const nextXiangting = Number(nextMetrics && nextMetrics.xiangting);
    const remainingTiles = getRemainingTiles(runtime);
    const riichiPressure = hardCallMetrics
      ? Number(hardCallMetrics.riichiPressure || 0) || 0
      : countRiichiOpponents(runtime, seatKey);
    const closedHandBefore = hardCallMetrics && Object.prototype.hasOwnProperty.call(hardCallMetrics, 'closedHandBefore')
      ? Boolean(hardCallMetrics.closedHandBefore)
      : true;
    const isYakuhai = hardCallMetrics
      ? Boolean(hardCallMetrics.isYakuhaiPeng)
      : isYakuhaiPeng(runtime, seatKey, action);
    const minRemainingTiles = numberFromPolicy(routePolicy, 'closedRouteMinRemainingTiles', 24);
    const maxXiangting = numberFromPolicy(routePolicy, 'closedRouteMaxXiangting', 2);
    const minMargin = numberFromPolicy(routePolicy, 'closedRouteOverrideMinMargin', 35);
    const weights = resolveRouteWeights(routePolicy);
    const shantenImprovesBy = Number.isFinite(currentXiangting) && Number.isFinite(nextXiangting)
      ? Math.max(0, currentXiangting - nextXiangting)
      : 0;
    const directTenpai = Number.isFinite(nextXiangting) && nextXiangting === 0 && shantenImprovesBy > 0;
    const liveUkeireDelta = Number(hardCallMetrics && hardCallMetrics.liveUkeireDelta || 0) || 0;
    const liveTingpaiDelta = Number(hardCallMetrics && hardCallMetrics.liveTingpaiDelta || 0) || 0;
    const hardEvDelta = Number(hardCallMetrics && hardCallMetrics.hardEvDelta || 0) || 0;
    const currentLiveUkeire = Number(hardCallMetrics && hardCallMetrics.currentLiveUkeireCount || 0) || 0;
    const currentLiveTingpai = Number(hardCallMetrics && hardCallMetrics.currentLiveTingpaiCount || 0) || 0;
    const currentWaitQuality = Number(hardCallMetrics && hardCallMetrics.currentWaitQualityScore || 0) || 0;
    const nextContextualHandValue = Number(hardCallMetrics && hardCallMetrics.nextContextualHandValueEstimate || 0) || 0;
    const currentContextualHandValue = Number(hardCallMetrics && hardCallMetrics.currentContextualHandValueEstimate || 0) || 0;
    const callOpenRouteScore = (
      shantenImprovesBy * weights.callShantenImprove
      + (directTenpai ? weights.callDirectTenpai : 0)
      + Math.max(0, liveUkeireDelta) * weights.callLiveUkeireDelta
      + Math.max(0, liveTingpaiDelta) * weights.callLiveTingpaiDelta
      + Math.max(0, hardEvDelta) * weights.callHardEvDelta
      + nextContextualHandValue * weights.callContextualHandValue
      + (isYakuhai ? weights.callYakuhai : 0)
    );
    const riichiPotential = estimateClosedRiichiPotential(currentXiangting, hardCallMetrics || {}, weights);
    const lostClosedRouteCost = weights.lostClosedRouteBase + riichiPotential * 0.45;
    const passClosedRouteScore = (
      weights.passClosedBase
      + remainingTiles * weights.passRemainingTile
      + currentLiveUkeire * weights.passLiveUkeire
      + currentLiveTingpai * weights.passLiveTingpai
      + currentWaitQuality * weights.passWaitQuality
      + currentContextualHandValue * weights.passContextualHandValue
      + riichiPotential
      + lostClosedRouteCost
    );
    const margin = passClosedRouteScore - callOpenRouteScore;
    const usesBalancedRouteState = (
      (policyId === 'hard-balanced' || policyId === 'hard-balanced-dev')
      && routePolicy.enableBalancedRouteState === true
    );
    const balancedStateReview = usesBalancedRouteState
      ? resolveBalancedRouteState(routePolicy, {
          remainingTiles,
          riichiPressure,
          currentXiangting,
          nextXiangting,
          directTenpai,
          shantenImprovesBy,
          liveUkeireDelta,
          hardEvDelta,
          currentContextualHandValue,
          nextContextualHandValue,
          riichiPotential
        })
      : null;
    const effectiveMinMargin = balancedStateReview
      ? balancedStateReview.overrideAllowed
        ? balancedStateReview.effectiveMinMargin
        : null
      : minMargin;
    const base = {
      enabled,
      mode: 'closed-route-value-rebalance-v1',
      active: false,
      override: false,
      allowed: true,
      reason: enabled ? 'hard-call-closed-route-value-inactive' : 'hard-call-closed-route-value-disabled',
      currentXiangting: Number.isFinite(currentXiangting) ? currentXiangting : null,
      nextXiangting: Number.isFinite(nextXiangting) ? nextXiangting : null,
      remainingTiles,
      riichiPressure,
      closedHandBefore,
      isYakuhaiPeng: isYakuhai,
      directTenpai,
      callOpenRouteScore,
      passClosedRouteScore,
      lostClosedRouteCost,
      riichiPotential,
      margin,
      minMargin,
      effectiveMinMargin,
      balancedState: balancedStateReview ? balancedStateReview.state : null,
      balancedStateReasons: balancedStateReview ? balancedStateReview.reasons.slice() : []
    };

    if (!enabled) return base;
    if (!closedHandBefore) return { ...base, reason: 'hard-call-closed-route-open-hand' };
    if (routePolicy.pressureDisablesClosedRouteOverride !== false && riichiPressure > 0) {
      return { ...base, reason: 'hard-call-closed-route-pressure-present' };
    }
    if (!Number.isFinite(currentXiangting) || currentXiangting > maxXiangting) {
      return { ...base, reason: 'hard-call-closed-route-xiangting-out-of-range' };
    }
    if (remainingTiles < minRemainingTiles) {
      return { ...base, reason: 'hard-call-closed-route-too-late' };
    }
    if (directTenpai && routePolicy.directTenpaiCallAlwaysAllow !== false) {
      return {
        ...base,
        active: true,
        allowed: true,
        reason: 'hard-call-closed-route-direct-tenpai-allowed'
      };
    }

    if (balancedStateReview && balancedStateReview.overrideAllowed === false) {
      return {
        ...base,
        active: true,
        allowed: true,
        reason: `hard-call-balanced-${balancedStateReview.state}-call`
      };
    }
    if (margin >= effectiveMinMargin) {
      return {
        ...base,
        active: true,
        override: true,
        allowed: false,
        reason: 'hard-call-closed-route-value-pass'
      };
    }
    return {
      ...base,
      active: true,
      allowed: true,
      reason: 'hard-call-closed-route-value-call'
    };
  }

  function evaluateDefensiveCallGateReview(runtime, seatKey, currentMetrics, nextMetrics, action, policy = {}, hardCallMetrics = null) {
    const policyId = typeof policy.id === 'string' ? policy.id : '';
    const defensePolicy = policy && policy.defense && typeof policy.defense === 'object'
      ? policy.defense
      : {};
    if (policyId !== 'hard-defensive-dev' || defensePolicy.enableDefensiveCallGate !== true) return null;
    const api = getHardDefensiveProfileApi();
    if (!api || typeof api.evaluateDefensiveCallGate !== 'function') return null;
    try {
      return api.evaluateDefensiveCallGate(
        runtime,
        seatKey,
        currentMetrics,
        nextMetrics,
        action,
        hardCallMetrics || {},
        {
          policy: defensePolicy,
          lateRemainingTiles: policy && policy.context ? policy.context.lateRemainingTiles : undefined
        }
      );
    } catch (error) {
      return null;
    }
  }

  function buildHardCallRules(runtime, seatKey, currentMetrics, nextMetrics, action, policy = {}, hardCallMetrics = null) {
    const reasons = [];
    const callPolicy = policy && policy.call && typeof policy.call === 'object'
      ? policy.call
      : {};
    const currentXiangting = Number(currentMetrics && currentMetrics.xiangting);
    const nextXiangting = Number(nextMetrics && nextMetrics.xiangting);
    const currentUkeire = Number(currentMetrics && currentMetrics.ukeireCount || 0);
    const nextUkeire = Number(nextMetrics && nextMetrics.ukeireCount || 0);
    const currentTingpaiCount = Number(currentMetrics && currentMetrics.tingpaiCount || 0);
    const nextTingpaiCount = Number(nextMetrics && nextMetrics.tingpaiCount || 0);
    const currentHandValue = Number(currentMetrics && currentMetrics.handValueEstimate || 0);
    const nextHandValue = Number(nextMetrics && nextMetrics.handValueEstimate || 0);
    const currentContextualHandValue = Number.isFinite(Number(hardCallMetrics && hardCallMetrics.currentContextualHandValueEstimate))
      ? Number(hardCallMetrics.currentContextualHandValueEstimate)
      : currentHandValue;
    const nextContextualHandValue = Number.isFinite(Number(hardCallMetrics && hardCallMetrics.nextContextualHandValueEstimate))
      ? Number(hardCallMetrics.nextContextualHandValueEstimate)
      : nextHandValue;
    const riichiPressure = hardCallMetrics
      ? Number(hardCallMetrics.riichiPressure || 0) || 0
      : countRiichiOpponents(runtime, seatKey);
    const isYakuhai = hardCallMetrics
      ? Boolean(hardCallMetrics.isYakuhaiPeng)
      : isYakuhaiPeng(runtime, seatKey, action);
    const minPressureHandValue = Number(callPolicy.minPressureHandValue || 0) || 0;
    const minFlatHandValueDelta = Number.isFinite(Number(callPolicy.minFlatHandValueDelta))
      ? Number(callPolicy.minFlatHandValueDelta)
      : 0;
    const flatCallKeepsShape = nextContextualHandValue >= currentContextualHandValue + minFlatHandValueDelta;
    const shantenImproves = callPolicy.allowShantenImprovement !== false && nextXiangting < currentXiangting;
    const yakuhaiAccepted = callPolicy.allowYakuhaiPeng !== false && isYakuhai && nextXiangting <= currentXiangting;

    if (riichiPressure && (shantenImproves || yakuhaiAccepted) && nextContextualHandValue < minPressureHandValue) {
      return reasons;
    }

    if (shantenImproves) {
      reasons.push('hard-call-improves-xiangting');
    }

    if (yakuhaiAccepted) {
      reasons.push('hard-call-yakuhai-peng');
    }

    if (callPolicy.allowFlatSpeedUp === false || nextXiangting !== currentXiangting || !flatCallKeepsShape) {
      return reasons;
    }
    if (riichiPressure && callPolicy.rejectFlatCallsUnderPressure !== false) {
      return reasons;
    }

    const minLiveUkeireBoost = Number(callPolicy.minLiveUkeireBoost || 0) || 0;
    const minLiveTingpaiBoost = Number(callPolicy.minLiveTingpaiBoost || 0) || 0;
    const minHardEvBoost = Number(callPolicy.minHardEvBoost || 0) || 0;
    const flatUkeireBoost = Number(callPolicy.flatUkeireBoost || 0) || 0;
    const flatTingpaiBoost = Number(callPolicy.flatTingpaiBoost || 0) || 0;
    const flatHandShapeBoost = Number(callPolicy.flatHandShapeBoost || 0) || 0;
    const liveUkeireDelta = Number(hardCallMetrics && hardCallMetrics.liveUkeireDelta || 0) || 0;
    const liveTingpaiDelta = Number(hardCallMetrics && hardCallMetrics.liveTingpaiDelta || 0) || 0;
    const hardEvDelta = Number(hardCallMetrics && hardCallMetrics.hardEvDelta || 0) || 0;

    if (
      liveUkeireDelta >= minLiveUkeireBoost
      || liveTingpaiDelta >= minLiveTingpaiBoost
      || hardEvDelta >= minHardEvBoost
      || nextUkeire >= currentUkeire + flatUkeireBoost
      || nextTingpaiCount >= currentTingpaiCount + flatTingpaiBoost
      || nextHandValue >= currentHandValue + flatHandShapeBoost
    ) {
      reasons.push('hard-call-flat-speed-up');
    }

    return reasons;
  }

  function buildSimpleCallRules(runtime, seatKey, currentMetrics, nextMetrics, action, policy = {}, hardCallMetrics = null) {
    const reasons = [];
    const callPolicy = policy && policy.call && typeof policy.call === 'object'
      ? policy.call
      : {};
    const policyId = typeof policy.id === 'string' && policy.id ? policy.id : 'easy';
    if (shouldUseHardCallRules(policy, callPolicy)) {
      return buildHardCallRules(runtime, seatKey, currentMetrics, nextMetrics, action, policy, hardCallMetrics);
    }

    const riichiPressure = countRiichiOpponents(runtime, seatKey);
    const currentXiangting = Number(currentMetrics && currentMetrics.xiangting);
    const nextXiangting = Number(nextMetrics && nextMetrics.xiangting);
    const currentUkeire = Number(currentMetrics && currentMetrics.ukeireCount || 0);
    const nextUkeire = Number(nextMetrics && nextMetrics.ukeireCount || 0);
    const currentTingpaiCount = Number(currentMetrics && currentMetrics.tingpaiCount || 0);
    const nextTingpaiCount = Number(nextMetrics && nextMetrics.tingpaiCount || 0);
    const currentHandValue = Number(currentMetrics && currentMetrics.handValueEstimate || 0);
    const nextHandValue = Number(nextMetrics && nextMetrics.handValueEstimate || 0);
    const allowShantenImprovement = callPolicy.allowShantenImprovement !== false;
    const allowYakuhaiPeng = callPolicy.allowYakuhaiPeng !== false;
    const allowFlatSpeedUp = callPolicy.allowFlatSpeedUp !== false;
    const suppressFlatCallsUnderRiichi = callPolicy.suppressFlatCallsUnderRiichi !== false;
    const flatUkeireBoost = Number(callPolicy.flatUkeireBoost || 0) || 0;
    const flatTingpaiBoost = Number(callPolicy.flatTingpaiBoost || 0) || 0;
    const flatHandShapeBoost = Number(callPolicy.flatHandShapeBoost || 0) || 0;
    const minFlatHandValueDelta = Number.isFinite(Number(callPolicy.minFlatHandValueDelta))
      ? Number(callPolicy.minFlatHandValueDelta)
      : (policyId === 'normal' ? 0 : -Infinity);
    const flatCallKeepsShape = nextHandValue >= currentHandValue + minFlatHandValueDelta;

    if (allowShantenImprovement && nextXiangting < currentXiangting) {
      reasons.push(`${policyId}-call-improves-xiangting`);
    }

    if (allowYakuhaiPeng && isYakuhaiPeng(runtime, seatKey, action) && nextXiangting <= currentXiangting) {
      reasons.push(`${policyId}-call-yakuhai-peng`);
    }

    if (
      allowFlatSpeedUp
      && (!riichiPressure || !suppressFlatCallsUnderRiichi)
      && nextXiangting === currentXiangting
      && flatCallKeepsShape
      && (
        nextUkeire >= currentUkeire + flatUkeireBoost
        || nextTingpaiCount >= currentTingpaiCount + flatTingpaiBoost
        || nextHandValue >= currentHandValue + flatHandShapeBoost
      )
    ) {
      reasons.push(`${policyId}-call-flat-speed-up`);
    }

    return reasons;
  }

  function findPassAction(actions = [], seatKey, reason = 'hard-call-closed-route-value-pass') {
    const passAction = (Array.isArray(actions) ? actions : []).find((action) => (
      action
      && action.type === 'pass'
      && (!action.payload || !action.payload.seat || action.payload.seat === seatKey)
    ));
    if (passAction) return passAction;
    return {
      type: 'pass',
      payload: {
        seat: seatKey,
        reason
      }
    };
  }

  function evaluateCalls(runtime, seatKey, actions = [], options = {}) {
    const adapter = getCoreAdapter();
    if (!runtime || typeof runtime.getSeatIndex !== 'function') return null;
    const policy = resolvePolicy(options);

    const seatIndex = runtime.getSeatIndex(seatKey);
    if (seatIndex < 0 || !runtime.board || !runtime.board.shoupai || !runtime.board.shoupai[seatIndex]) return null;

    const shoupai = runtime.board.shoupai[seatIndex];
    const currentMetrics = {
      xiangting: adapter.calculateXiangting(shoupai.clone()),
      tingpaiCount: adapter.getTingpai(shoupai.clone()).length,
      ukeireCount: estimateUkeireCount(adapter, shoupai.clone()),
      handValueEstimate: estimateHandShapeValue(shoupai.clone())
    };
    let best = null;
    let bestRouteOverride = null;
    let bestDefensiveCallOverride = null;

    (Array.isArray(actions) ? actions : []).forEach((action) => {
      const payload = action && action.payload && typeof action.payload === 'object'
        ? action.payload
        : null;
      const callType = payload && typeof payload.callType === 'string' ? payload.callType : null;
      const meldString = payload && typeof payload.meldString === 'string' ? payload.meldString : null;
      if (action.type !== 'call' || !callType || !meldString) return;
      if (callType !== 'chi' && callType !== 'peng') return;

      const simulated = shoupai.clone();
      try {
        simulated.fulou(meldString);
      } catch (error) {
        return;
      }

      const metrics = {
        xiangting: adapter.calculateXiangting(simulated.clone()),
        tingpaiCount: adapter.getTingpai(simulated.clone()).length,
        ukeireCount: estimateUkeireCount(adapter, simulated),
        handValueEstimate: estimateHandShapeValue(simulated)
      };
      if (!Number.isFinite(metrics.xiangting)) return;
      const callPolicy = policy && policy.call && typeof policy.call === 'object'
        ? policy.call
        : {};
      const hardCallMetrics = shouldUseHardCallRules(policy, callPolicy)
        ? evaluateHardCallMetrics(adapter, runtime, seatKey, shoupai, simulated, currentMetrics, metrics, action, policy)
        : null;
      const reasons = buildSimpleCallRules(runtime, seatKey, currentMetrics, metrics, action, policy, hardCallMetrics);
      if (!reasons.length) return;

      if (hardCallMetrics) {
        const routeReview = evaluateClosedRouteValueReview(
          runtime,
          seatKey,
          currentMetrics,
          metrics,
          action,
          policy,
          hardCallMetrics
        );
        hardCallMetrics.closedRouteValueReview = routeReview;
        if (routeReview && routeReview.override === true) {
          const rejected = {
            action,
            callType,
            metrics,
            reasons: [routeReview.reason],
            policy,
            hardCallMetrics
          };
          if (compareCallEvaluation(rejected, bestRouteOverride)) {
            bestRouteOverride = rejected;
          }
          return;
        }
        const defensiveCallGateReview = evaluateDefensiveCallGateReview(
          runtime,
          seatKey,
          currentMetrics,
          metrics,
          action,
          policy,
          hardCallMetrics
        );
        hardCallMetrics.defensiveCallGateReview = defensiveCallGateReview;
        if (defensiveCallGateReview && defensiveCallGateReview.override === true) {
          const rejected = {
            action,
            callType,
            metrics,
            reasons: [defensiveCallGateReview.reason],
            policy,
            hardCallMetrics
          };
          if (compareCallEvaluation(rejected, bestDefensiveCallOverride)) {
            bestDefensiveCallOverride = rejected;
          }
          return;
        }
      }

      const evaluation = {
        action,
        callType,
        metrics,
        reasons,
        policy
      };
      if (hardCallMetrics) {
        evaluation.hardCallMetrics = hardCallMetrics;
      }

      if (compareCallEvaluation(evaluation, best)) {
        best = evaluation;
      }
    });

    if (best) return best;
    if (bestDefensiveCallOverride) {
      return {
        action: findPassAction(actions, seatKey, 'def-call-gate-pass'),
        policy,
        reasons: bestDefensiveCallOverride.reasons,
        metrics: bestDefensiveCallOverride.metrics,
        hardCallMetrics: bestDefensiveCallOverride.hardCallMetrics
      };
    }
    if (bestRouteOverride) {
      return {
        action: findPassAction(actions, seatKey),
        policy,
        reasons: bestRouteOverride.reasons,
        metrics: bestRouteOverride.metrics,
        hardCallMetrics: bestRouteOverride.hardCallMetrics
      };
    }
    return null;
  }

  function createCallEvaluator() {
    return {
      evaluateCalls
    };
  }

  return {
    evaluateCalls,
    evaluateClosedRouteValueReview,
    createCallEvaluator
  };
});
