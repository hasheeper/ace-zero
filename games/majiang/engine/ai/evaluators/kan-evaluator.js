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
  root.AceMahjongKanEvaluator = factory(
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
    throw new Error('AceMahjongKanEvaluator requires a majiang core adapter.');
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

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function numberOr(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
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
    if ((difficulty === 'hard' || difficulty === 'hell') && hardPolicyApi && typeof hardPolicyApi.createHardPolicy === 'function') {
      const policy = hardPolicyApi.createHardPolicy();
      if (difficulty === 'hell') policy.id = 'hell';
      return policy;
    }
    if (normalPolicyApi && typeof normalPolicyApi.createNormalPolicy === 'function') {
      return normalPolicyApi.createNormalPolicy();
    }
    return { id: normalizeDifficulty(difficulty) };
  }

  function resolvePolicy(options = {}) {
    if (options.policy && typeof options.policy === 'object') return clone(options.policy);
    return createPolicyByDifficulty(normalizeDifficulty(options.difficulty));
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

  function getRemainingTiles(runtime) {
    const wallState = runtime && typeof runtime.getWallState === 'function'
      ? runtime.getWallState()
      : null;
    return numberOr(wallState && wallState.remaining, 0);
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

  function countRiichiOpponents(runtime, seatKey) {
    if (!runtime || !runtime.riichiState) return 0;
    return getActiveSeats(runtime).filter((otherSeatKey) => (
      otherSeatKey
      && otherSeatKey !== seatKey
      && runtime.riichiState[otherSeatKey]
      && runtime.riichiState[otherSeatKey].declared === true
    )).length;
  }

  function isClosedHand(shoupai) {
    return Boolean(shoupai && Array.isArray(shoupai._fulou) && shoupai._fulou.length === 0);
  }

  function inferKanType(meldString, isReactionKan) {
    const normalized = String(meldString || '');
    if (!normalized) return isReactionKan ? 'kan-open' : 'kan-concealed';
    if (/\d{3}[\+\=\-]\d$/.test(normalized)) return 'kan-added';
    if (isReactionKan || /[\+\=\-]/.test(normalized)) return 'kan-open';
    return 'kan-concealed';
  }

  function operationForKanType(kanType) {
    if (kanType === 'kan-open') return 'ming_gang';
    if (kanType === 'kan-added') return 'add_gang';
    return 'an_gang';
  }

  function buildHandMetrics(adapter, shoupai) {
    return {
      xiangting: adapter.calculateXiangting(shoupai.clone()),
      tingpaiCount: adapter.getTingpai(shoupai.clone()).length,
      ukeireCount: estimateUkeireCount(adapter, shoupai.clone()),
      handValueEstimate: estimateHandShapeValue(shoupai.clone())
    };
  }

  function buildHardContext(runtime, seatKey, policy = {}) {
    const api = getRoundContextApi();
    return api && typeof api.buildRuntimeHardRoundContext === 'function'
      ? api.buildRuntimeHardRoundContext(runtime, seatKey, {
          contextPolicy: policy && policy.context && typeof policy.context === 'object'
            ? policy.context
            : {}
        })
      : null;
  }

  function applyContextualHandValue(handValueEstimate, hardContext) {
    const api = getRoundContextApi();
    if (api && typeof api.applyHardContextToHandValue === 'function') {
      return api.applyHardContextToHandValue(handValueEstimate, hardContext);
    }
    return numberOr(handValueEstimate, 0);
  }

  function evaluateHardHand(adapter, runtime, seatKey, shoupai, metrics, policy = {}, hardContext = null) {
    const api = getHardEvApi();
    if (!api || typeof api.evaluateHardDiscardMetrics !== 'function') return null;
    try {
      return api.evaluateHardDiscardMetrics(adapter, runtime, seatKey, shoupai.clone(), {
        handValueEstimate: numberOr(metrics && metrics.handValueEstimate, 0),
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

  function buildThreatReview(runtime, seatKey, currentMetrics = {}, currentHard = {}, policy = {}, hardContext = null) {
    const api = getHardDefensiveProfileApi();
    if (!api || typeof api.buildThreatProfile !== 'function') {
      return {
        threatProfile: null,
        rankDefenseState: null,
        rankDefenseStateReasons: []
      };
    }
    const attackDecision = {
      metrics: currentMetrics,
      hardMetrics: {
        ...(currentHard || {}),
        hardContext
      },
      danger: {}
    };
    const defensePolicy = policy && policy.defense && typeof policy.defense === 'object'
      ? policy.defense
      : {};
    const threatProfile = api.buildThreatProfile(runtime, seatKey, attackDecision, {
      policy: defensePolicy,
      lateRemainingTiles: policy && policy.context ? policy.context.lateRemainingTiles : undefined
    });
    const rankReview = typeof api.resolveRankDefenseState === 'function'
      ? api.resolveRankDefenseState(attackDecision, threatProfile, { policy: defensePolicy })
      : null;
    return {
      threatProfile,
      rankDefenseState: rankReview && rankReview.state ? rankReview.state : null,
      rankDefenseStateReasons: rankReview && Array.isArray(rankReview.reasons) ? rankReview.reasons.slice() : []
    };
  }

  function simulateKan(shoupai, meldString, isReactionKan) {
    const next = shoupai.clone();
    if (isReactionKan) next.fulou(meldString);
    else next.gang(meldString);
    return next;
  }

  function roundMetric(value, digits = 1) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    const factor = 10 ** digits;
    return Math.round(number * factor) / factor;
  }

  const DEFAULT_KAN_POLICY = Object.freeze({
    enableKanReview: true,
    easyMaxRiichiPressure: 0,
    easyConcealedMinRemaining: 24,
    easyAddedMinRemaining: 24,
    normalConcealedMinRemaining: 18,
    normalAddedMinRemaining: 18,
    normalOpenMinRemaining: 18,
    normalTenpaiMaxWaitQualityLoss: 6,
    normalTenpaiMaxLiveTingpaiLoss: 2,
    hardMaxXiangtingLoss: 0,
    hardPressureMaxXiangtingLoss: 0,
    hardOpenRequiresDirectTenpai: true,
    hardScoreThreshold: 62,
    hardConcealedThreshold: 42,
    hardAddedThreshold: 72,
    hardOpenThreshold: 110,
    hardPressureThresholdBonus: 42,
    hardProtectThresholdBonus: 32,
    hardLateThresholdBonus: 12,
    weights: {
      typeConcealed: 36,
      typeAdded: 10,
      typeOpen: -30,
      shantenGain: 95,
      directTenpai: 85,
      liveUkeireDelta: 1.5,
      liveTingpaiDelta: 6,
      waitQualityDelta: 2,
      hardEvDelta: 0.08,
      contextualHandValue: 0.35,
      dealerAttack: 12,
      comebackAttack: 18,
      remainingEarly: 0.6,
      xiangtingLoss: 180,
      riichiPressure: 35,
      multiThreat: 28,
      dealerThreat: 24,
      latePressure: 18,
      protectLead: 34,
      protectSecond: 20,
      openDoraRisk: 28,
      addedKanRisk: 22
    }
  });

  function resolveKanPolicy(policy = {}) {
    const source = policy && policy.kan && typeof policy.kan === 'object' ? policy.kan : {};
    return {
      ...DEFAULT_KAN_POLICY,
      ...source,
      weights: {
        ...DEFAULT_KAN_POLICY.weights,
        ...((source.weights && typeof source.weights === 'object') ? source.weights : {})
      }
    };
  }

  function buildCandidateReview(adapter, runtime, seatKey, action, currentShoupai, currentMetrics, policy = {}, options = {}) {
    const payload = action && action.payload && typeof action.payload === 'object' ? action.payload : {};
    const meldString = typeof payload.meldString === 'string' && payload.meldString
      ? payload.meldString
      : (typeof payload.meld === 'string' ? payload.meld : '');
    if (!meldString) return null;
    const isReactionKan = options.isReactionKan === true || Boolean(payload.fromSeat);
    const kanType = typeof payload.kanType === 'string' && payload.kanType
      ? payload.kanType
      : inferKanType(meldString, isReactionKan);
    const reasons = ['kan-reviewed', `kan-${kanType}-reviewed`];
    let nextShoupai = null;
    let nextMetrics = null;
    let simulationOk = false;
    let simulationError = null;
    try {
      nextShoupai = simulateKan(currentShoupai, meldString, isReactionKan);
      nextMetrics = buildHandMetrics(adapter, nextShoupai);
      simulationOk = true;
    } catch (error) {
      simulationError = error && error.message ? error.message : String(error);
    }

    const hardContext = buildHardContext(runtime, seatKey, policy);
    const currentHard = evaluateHardHand(adapter, runtime, seatKey, currentShoupai, currentMetrics, policy, hardContext);
    const nextHard = simulationOk
      ? evaluateHardHand(adapter, runtime, seatKey, nextShoupai, nextMetrics, policy, hardContext)
      : null;
    const threatReview = buildThreatReview(runtime, seatKey, currentMetrics, currentHard || {}, policy, hardContext);
    const remainingTiles = getRemainingTiles(runtime);
    const riichiPressure = countRiichiOpponents(runtime, seatKey);
    const currentXiangting = numberOr(currentMetrics && currentMetrics.xiangting, 99);
    const nextXiangting = simulationOk ? numberOr(nextMetrics && nextMetrics.xiangting, 99) : 99;
    const xiangtingDelta = nextXiangting - currentXiangting;
    const currentLiveUkeire = numberOr(currentHard && currentHard.liveUkeireCount, numberOr(currentMetrics && currentMetrics.ukeireCount, 0));
    const nextLiveUkeire = numberOr(nextHard && nextHard.liveUkeireCount, simulationOk ? numberOr(nextMetrics && nextMetrics.ukeireCount, 0) : 0);
    const currentLiveTingpai = numberOr(currentHard && currentHard.liveTingpaiCount, numberOr(currentMetrics && currentMetrics.tingpaiCount, 0));
    const nextLiveTingpai = numberOr(nextHard && nextHard.liveTingpaiCount, simulationOk ? numberOr(nextMetrics && nextMetrics.tingpaiCount, 0) : 0);
    const currentWaitQuality = numberOr(currentHard && currentHard.waitQualityScore, 0);
    const nextWaitQuality = numberOr(nextHard && nextHard.waitQualityScore, 0);
    const currentHardEvScore = numberOr(currentHard && currentHard.hardEvScore, 0);
    const nextHardEvScore = numberOr(nextHard && nextHard.hardEvScore, 0);
    const currentContextualHandValue = numberOr(currentHard && currentHard.contextualHandValueEstimate,
      applyContextualHandValue(numberOr(currentMetrics && currentMetrics.handValueEstimate, 0), hardContext));
    const nextContextualHandValue = numberOr(nextHard && nextHard.contextualHandValueEstimate,
      applyContextualHandValue(simulationOk ? numberOr(nextMetrics && nextMetrics.handValueEstimate, 0) : 0, hardContext));

    return {
      action,
      policy,
      reasons,
      metrics: simulationOk ? nextMetrics : null,
      hardKanMetrics: {
        adapter: 'built-in',
        policyId: typeof policy.id === 'string' ? policy.id : null,
        kanType,
        operation: operationForKanType(kanType),
        isReactionKan,
        meldString,
        simulationOk,
        simulationError,
        remainingTiles,
        riichiPressure,
        closedHandBefore: isClosedHand(currentShoupai),
        currentXiangting,
        nextXiangting: simulationOk ? nextXiangting : null,
        xiangtingDelta: simulationOk ? xiangtingDelta : null,
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
        hardContext: hardContext ? clone(hardContext) : null,
        threatProfile: threatReview.threatProfile ? clone(threatReview.threatProfile) : null,
        rankDefenseState: threatReview.rankDefenseState,
        rankDefenseStateReasons: threatReview.rankDefenseStateReasons
      }
    };
  }

  function addAccept(review, reason) {
    review.reasons.push(reason, 'kan-accepted', `kan-${review.hardKanMetrics.kanType}-accepted`);
    review.hardKanMetrics.accepted = true;
    review.hardKanMetrics.rejectReason = null;
    return review;
  }

  function addReject(review, reason) {
    review.reasons.push(reason, 'kan-declined');
    review.hardKanMetrics.accepted = false;
    review.hardKanMetrics.rejectReason = reason;
    return review;
  }

  function evaluateEasyKan(review, kanPolicy) {
    const metrics = review.hardKanMetrics;
    if (metrics.simulationOk !== true) return addReject(review, 'kan-simulation-failed');
    if (metrics.kanType === 'kan-open') return addReject(review, 'easy-kan-open-declined');
    if (metrics.riichiPressure > numberOr(kanPolicy.easyMaxRiichiPressure, 0)) {
      return addReject(review, 'easy-kan-pressure-declined');
    }
    const minRemaining = metrics.kanType === 'kan-added'
      ? numberOr(kanPolicy.easyAddedMinRemaining, 24)
      : numberOr(kanPolicy.easyConcealedMinRemaining, 24);
    if (metrics.remainingTiles < minRemaining) return addReject(review, 'easy-kan-too-late');
    if (numberOr(metrics.xiangtingDelta, 99) > 0) return addReject(review, 'easy-kan-xiangting-loss');
    return addAccept(review, metrics.kanType === 'kan-added' ? 'easy-kan-added-safe' : 'easy-kan-concealed-safe');
  }

  function evaluateNormalKan(review, kanPolicy) {
    const metrics = review.hardKanMetrics;
    if (metrics.simulationOk !== true) return addReject(review, 'kan-simulation-failed');
    const xiangtingDelta = numberOr(metrics.xiangtingDelta, 99);
    const directTenpai = metrics.currentXiangting > 0 && metrics.nextXiangting === 0;
    const strongOpen = directTenpai
      || numberOr(metrics.nextContextualHandValueEstimate, 0) >= 44
      || numberOr(metrics.hardEvDelta, 0) >= 80;
    if (metrics.kanType === 'kan-open') {
      if (metrics.remainingTiles < numberOr(kanPolicy.normalOpenMinRemaining, 18)) {
        return addReject(review, 'normal-kan-open-too-late');
      }
      if (metrics.riichiPressure > 0) return addReject(review, 'normal-kan-open-pressure-declined');
      if (xiangtingDelta > 0) return addReject(review, 'normal-kan-open-xiangting-loss');
      return strongOpen
        ? addAccept(review, 'normal-kan-open-strong')
        : addReject(review, 'normal-kan-open-weak');
    }
    const minRemaining = metrics.kanType === 'kan-added'
      ? numberOr(kanPolicy.normalAddedMinRemaining, 18)
      : numberOr(kanPolicy.normalConcealedMinRemaining, 18);
    if (metrics.remainingTiles < minRemaining) return addReject(review, 'normal-kan-too-late');
    if (metrics.riichiPressure > 0 && metrics.kanType !== 'kan-concealed') {
      return addReject(review, 'normal-kan-pressure-declined');
    }
    if (xiangtingDelta > 0) return addReject(review, 'normal-kan-xiangting-loss');
    if (metrics.currentXiangting === 0) {
      const waitLoss = 0 - numberOr(metrics.waitQualityDelta, 0);
      const liveTingpaiLoss = 0 - numberOr(metrics.liveTingpaiDelta, 0);
      if (waitLoss > numberOr(kanPolicy.normalTenpaiMaxWaitQualityLoss, 6)) {
        return addReject(review, 'normal-kan-tenpai-wait-loss');
      }
      if (liveTingpaiLoss > numberOr(kanPolicy.normalTenpaiMaxLiveTingpaiLoss, 2)) {
        return addReject(review, 'normal-kan-tenpai-live-loss');
      }
    }
    return addAccept(review, metrics.kanType === 'kan-added' ? 'normal-kan-added-clean' : 'normal-kan-concealed-clean');
  }

  function scoreHardKan(review, kanPolicy) {
    const metrics = review.hardKanMetrics;
    const weights = kanPolicy.weights || DEFAULT_KAN_POLICY.weights;
    const threat = metrics.threatProfile || {};
    const hardContext = metrics.hardContext || {};
    const rankState = metrics.rankDefenseState || 'neutral-defense';
    const shantenGain = metrics.simulationOk ? Math.max(0, metrics.currentXiangting - metrics.nextXiangting) : 0;
    const xiangtingLoss = Math.max(0, numberOr(metrics.xiangtingDelta, 0));
    const directTenpai = metrics.currentXiangting > 0 && metrics.nextXiangting === 0;
    const typeScore = metrics.kanType === 'kan-concealed'
      ? numberOr(weights.typeConcealed, 0)
      : metrics.kanType === 'kan-added'
      ? numberOr(weights.typeAdded, 0)
      : numberOr(weights.typeOpen, 0);
    const pressurePenalty = (
      metrics.riichiPressure * numberOr(weights.riichiPressure, 0)
      + (threat.multiThreat === true ? numberOr(weights.multiThreat, 0) : 0)
      + (threat.dealerThreat === true ? numberOr(weights.dealerThreat, 0) : 0)
      + (threat.lateRound === true && metrics.riichiPressure > 0 ? numberOr(weights.latePressure, 0) : 0)
    );
    const rankPenalty = rankState === 'protect-lead'
      ? numberOr(weights.protectLead, 0)
      : rankState === 'protect-second'
      ? numberOr(weights.protectSecond, 0)
      : 0;
    const extraRiskPenalty = (
      (metrics.kanType === 'kan-open' ? numberOr(weights.openDoraRisk, 0) : 0)
      + (metrics.kanType === 'kan-added' ? numberOr(weights.addedKanRisk, 0) : 0)
    );
    const attackBonus = (
      (hardContext.isDealer === true ? numberOr(weights.dealerAttack, 0) : 0)
      + (rankState === 'comeback' ? numberOr(weights.comebackAttack, 0) : 0)
    );
    const earlyBonus = Math.max(0, numberOr(metrics.remainingTiles, 0) - 20) * numberOr(weights.remainingEarly, 0);
    const score = (
      typeScore
      + shantenGain * numberOr(weights.shantenGain, 0)
      + (directTenpai ? numberOr(weights.directTenpai, 0) : 0)
      + Math.max(-12, numberOr(metrics.liveUkeireDelta, 0)) * numberOr(weights.liveUkeireDelta, 0)
      + Math.max(-4, numberOr(metrics.liveTingpaiDelta, 0)) * numberOr(weights.liveTingpaiDelta, 0)
      + numberOr(metrics.waitQualityDelta, 0) * numberOr(weights.waitQualityDelta, 0)
      + numberOr(metrics.hardEvDelta, 0) * numberOr(weights.hardEvDelta, 0)
      + numberOr(metrics.nextContextualHandValueEstimate, 0) * numberOr(weights.contextualHandValue, 0)
      + attackBonus
      + earlyBonus
      - xiangtingLoss * numberOr(weights.xiangtingLoss, 0)
      - pressurePenalty
      - rankPenalty
      - extraRiskPenalty
    );
    let threshold = metrics.kanType === 'kan-concealed'
      ? numberOr(kanPolicy.hardConcealedThreshold, kanPolicy.hardScoreThreshold)
      : metrics.kanType === 'kan-added'
      ? numberOr(kanPolicy.hardAddedThreshold, kanPolicy.hardScoreThreshold)
      : numberOr(kanPolicy.hardOpenThreshold, kanPolicy.hardScoreThreshold);
    if (metrics.riichiPressure > 0 || threat.multiThreat === true || threat.dealerThreat === true) {
      threshold += numberOr(kanPolicy.hardPressureThresholdBonus, 0);
    }
    if (rankState === 'protect-lead' || rankState === 'protect-second') {
      threshold += numberOr(kanPolicy.hardProtectThresholdBonus, 0);
    }
    if (threat.lateRound === true) {
      threshold += numberOr(kanPolicy.hardLateThresholdBonus, 0);
    }
    return {
      score,
      threshold,
      directTenpai,
      shantenGain,
      xiangtingLoss
    };
  }

  function evaluateHardKan(review, kanPolicy) {
    const metrics = review.hardKanMetrics;
    if (metrics.simulationOk !== true) return addReject(review, 'kan-simulation-failed');
    const scoreReview = scoreHardKan(review, kanPolicy);
    metrics.utilityScore = roundMetric(scoreReview.score, 1);
    metrics.utilityThreshold = roundMetric(scoreReview.threshold, 1);
    metrics.directTenpai = scoreReview.directTenpai;
    metrics.shantenGain = scoreReview.shantenGain;
    const maxLoss = metrics.riichiPressure > 0
      ? numberOr(kanPolicy.hardPressureMaxXiangtingLoss, 0)
      : numberOr(kanPolicy.hardMaxXiangtingLoss, 0);
    if (scoreReview.xiangtingLoss > maxLoss) return addReject(review, 'hard-kan-xiangting-loss');
    if (
      metrics.kanType === 'kan-open'
      && kanPolicy.hardOpenRequiresDirectTenpai !== false
      && !scoreReview.directTenpai
      && numberOr(metrics.nextContextualHandValueEstimate, 0) < 58
    ) {
      return addReject(review, 'hard-kan-open-not-strong');
    }
    if (scoreReview.score >= scoreReview.threshold) {
      return addAccept(review, metrics.kanType === 'kan-concealed'
        ? 'hard-kan-concealed-utility'
        : metrics.kanType === 'kan-added'
        ? 'hard-kan-added-utility'
        : 'hard-kan-open-utility');
    }
    return addReject(review, 'hard-kan-utility-below-threshold');
  }

  function compareKanReview(left, right) {
    if (!right) return true;
    const leftScore = numberOr(left && left.hardKanMetrics && left.hardKanMetrics.utilityScore, -Infinity);
    const rightScore = numberOr(right && right.hardKanMetrics && right.hardKanMetrics.utilityScore, -Infinity);
    if (leftScore !== rightScore) return leftScore > rightScore;
    const leftXiangting = numberOr(left && left.hardKanMetrics && left.hardKanMetrics.nextXiangting, 99);
    const rightXiangting = numberOr(right && right.hardKanMetrics && right.hardKanMetrics.nextXiangting, 99);
    if (leftXiangting !== rightXiangting) return leftXiangting < rightXiangting;
    const leftType = left && left.hardKanMetrics && left.hardKanMetrics.kanType;
    const rightType = right && right.hardKanMetrics && right.hardKanMetrics.kanType;
    const typeOrder = { 'kan-concealed': 0, 'kan-added': 1, 'kan-open': 2 };
    const leftOrder = Number.isFinite(typeOrder[leftType]) ? typeOrder[leftType] : 9;
    const rightOrder = Number.isFinite(typeOrder[rightType]) ? typeOrder[rightType] : 9;
    if (leftOrder !== rightOrder) return leftOrder < rightOrder;
    return String(left && left.action && left.action.key || '') < String(right && right.action && right.action.key || '');
  }

  function evaluateReviewByPolicy(review, policy, kanPolicy) {
    const policyId = typeof policy.id === 'string' ? policy.id : normalizeDifficulty(policy.id);
    review.reasons.unshift(`${policyId}-kan-review`);
    if (policyId === 'easy') return evaluateEasyKan(review, kanPolicy);
    if (policyId === 'normal') return evaluateNormalKan(review, kanPolicy);
    return evaluateHardKan(review, kanPolicy);
  }

  function evaluateKan(runtime, seatKey, actions = [], options = {}) {
    const adapter = getCoreAdapter();
    if (!runtime || typeof runtime.getSeatIndex !== 'function') return null;
    const policy = resolvePolicy(options);
    const kanPolicy = resolveKanPolicy(policy);
    if (kanPolicy.enableKanReview === false) return null;
    const seatIndex = runtime.getSeatIndex(seatKey);
    const shoupai = seatIndex >= 0 && runtime.board && Array.isArray(runtime.board.shoupai)
      ? runtime.board.shoupai[seatIndex]
      : null;
    if (!shoupai || typeof shoupai.clone !== 'function') return null;

    const currentMetrics = buildHandMetrics(adapter, shoupai.clone());
    let bestAccepted = null;
    let bestReview = null;
    const kanActions = (Array.isArray(actions) ? actions : []).filter((action) => (
      action
      && (action.type === 'kan' || action.type === 'gang')
      && action.payload
      && (!action.payload.seat || action.payload.seat === seatKey)
    ));
    kanActions.forEach((action) => {
      const review = buildCandidateReview(
        adapter,
        runtime,
        seatKey,
        action,
        shoupai.clone(),
        currentMetrics,
        policy,
        {
          isReactionKan: options.isReactionKan === true
        }
      );
      if (!review) return;
      const evaluated = evaluateReviewByPolicy(review, policy, kanPolicy);
      if (compareKanReview(evaluated, bestReview)) bestReview = evaluated;
      if (evaluated.hardKanMetrics.accepted === true && compareKanReview(evaluated, bestAccepted)) {
        bestAccepted = evaluated;
      }
    });

    if (!bestAccepted) return bestReview || null;
    return bestAccepted;
  }

  function createKanEvaluator() {
    return {
      evaluateKan
    };
  }

  return {
    inferKanType,
    evaluateKan,
    createKanEvaluator
  };
});
