(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('../../base/majiang-core-adapter'),
      require('../support/hand-metrics'),
      require('../difficulty/easy-policy'),
      require('../difficulty/normal-policy'),
      require('../difficulty/hard-policy')
    );
    return;
  }
  root.AceMahjongCallEvaluator = factory(
    root.AceMahjongBrowserCoreAdapter || null,
    root.AceMahjongAiHandMetrics || null,
    root.AceMahjongEasyDifficultyPolicy || null,
    root.AceMahjongNormalDifficultyPolicy || null,
    root.AceMahjongHardDifficultyPolicy || null
  );
})(typeof globalThis !== 'undefined' ? globalThis : this, function(
  coreAdapter,
  handMetricsApi,
  easyPolicyApi,
  normalPolicyApi,
  hardPolicyApi
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

  function buildSimpleCallRules(runtime, seatKey, currentMetrics, nextMetrics, action, policy = {}) {
    const reasons = [];
    const callPolicy = policy && policy.call && typeof policy.call === 'object'
      ? policy.call
      : {};
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

    if (allowShantenImprovement && nextXiangting < currentXiangting) {
      reasons.push('easy-call-improves-xiangting');
    }

    if (allowYakuhaiPeng && isYakuhaiPeng(runtime, seatKey, action) && nextXiangting <= currentXiangting) {
      reasons.push('easy-call-yakuhai-peng');
    }

    if (
      allowFlatSpeedUp
      && (!riichiPressure || !suppressFlatCallsUnderRiichi)
      && nextXiangting === currentXiangting
      && (
        nextUkeire >= currentUkeire + flatUkeireBoost
        || nextTingpaiCount >= currentTingpaiCount + flatTingpaiBoost
        || nextHandValue >= currentHandValue + flatHandShapeBoost
      )
    ) {
      reasons.push('easy-call-flat-speed-up');
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
      const reasons = buildSimpleCallRules(runtime, seatKey, currentMetrics, metrics, action, policy);
      if (!reasons.length) return;

      const evaluation = {
        action,
        callType,
        metrics,
        reasons,
        policy
      };

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
