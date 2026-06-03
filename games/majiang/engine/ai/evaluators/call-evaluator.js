(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('../../base/majiang-core-adapter'),
      require('../support/hand-metrics'),
      require('../difficulty/easy-policy'),
      require('../difficulty/normal-policy'),
      require('../difficulty/hard-policy'),
      require('../support/hard-ev'),
      require('../support/round-context')
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
    root.AceMahjongAiRoundContext || null
  );
})(typeof globalThis !== 'undefined' ? globalThis : this, function(
  coreAdapter,
  handMetricsApi,
  easyPolicyApi,
  normalPolicyApi,
  hardPolicyApi,
  hardEvApi,
  roundContextApi
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
      hardContext,
      currentLiveUkeireCount: currentLiveUkeire,
      nextLiveUkeireCount: nextLiveUkeire,
      liveUkeireDelta: nextLiveUkeire - currentLiveUkeire,
      currentLiveTingpaiCount: currentLiveTingpai,
      nextLiveTingpaiCount: nextLiveTingpai,
      liveTingpaiDelta: nextLiveTingpai - currentLiveTingpai,
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
    if (policyId === 'hard' && callPolicy.enableHardCallReview !== false) {
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
      const hardCallMetrics = policy && policy.id === 'hard'
        ? evaluateHardCallMetrics(adapter, runtime, seatKey, shoupai, simulated, currentMetrics, metrics, action, policy)
        : null;
      const reasons = buildSimpleCallRules(runtime, seatKey, currentMetrics, metrics, action, policy, hardCallMetrics);
      if (!reasons.length) return;

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

    return best;
  }

  function createCallEvaluator() {
    return {
      evaluateCalls
    };
  }

  return {
    evaluateCalls,
    createCallEvaluator
  };
});
