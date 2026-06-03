(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./visible-tiles'),
      require('./wait-quality'),
      require('./round-context')
    );
    return;
  }
  root.AceMahjongAiHardEv = factory(
    root.AceMahjongAiVisibleTiles || null,
    root.AceMahjongAiWaitQuality || null,
    root.AceMahjongAiRoundContext || null
  );
})(typeof globalThis !== 'undefined' ? globalThis : this, function(visibleTilesApi, waitQualityApi, roundContextApi) {
  'use strict';

  const DEFAULT_WEIGHTS = Object.freeze({
    liveUkeire: 3,
    liveTingpai: 8,
    waitQuality: 4,
    handValue: 1
  });

  function getVisibleTilesApi() {
    if (visibleTilesApi) return visibleTilesApi;
    if (typeof globalThis !== 'undefined' && globalThis.AceMahjongAiVisibleTiles) {
      return globalThis.AceMahjongAiVisibleTiles;
    }
    throw new Error('AceMahjongAiHardEv requires visible tile accounting.');
  }

  function getWaitQualityApi() {
    if (waitQualityApi) return waitQualityApi;
    if (typeof globalThis !== 'undefined' && globalThis.AceMahjongAiWaitQuality) {
      return globalThis.AceMahjongAiWaitQuality;
    }
    throw new Error('AceMahjongAiHardEv requires wait quality support.');
  }

  function getRoundContextApi() {
    if (roundContextApi) return roundContextApi;
    if (typeof globalThis !== 'undefined' && globalThis.AceMahjongAiRoundContext) {
      return globalThis.AceMahjongAiRoundContext;
    }
    return null;
  }

  function resolveWeights(policy = {}) {
    const source = policy && policy.weights && typeof policy.weights === 'object'
      ? policy.weights
      : {};
    return {
      liveUkeire: Number.isFinite(Number(source.liveUkeire)) ? Number(source.liveUkeire) : DEFAULT_WEIGHTS.liveUkeire,
      liveTingpai: Number.isFinite(Number(source.liveTingpai)) ? Number(source.liveTingpai) : DEFAULT_WEIGHTS.liveTingpai,
      waitQuality: Number.isFinite(Number(source.waitQuality)) ? Number(source.waitQuality) : DEFAULT_WEIGHTS.waitQuality,
      handValue: Number.isFinite(Number(source.handValue)) ? Number(source.handValue) : DEFAULT_WEIGHTS.handValue
    };
  }

  function countLiveUkeire(adapter, shoupai, visibleTiles) {
    const api = getVisibleTilesApi();
    if (!adapter || typeof adapter.calculateXiangting !== 'function' || !shoupai || typeof shoupai.clone !== 'function') {
      return 0;
    }

    const baseXiangting = adapter.calculateXiangting(shoupai.clone());
    if (!Number.isFinite(baseXiangting)) return 0;

    return api.TILE_TYPES.reduce((count, tileCode) => {
      const remainingCount = visibleTiles && typeof visibleTiles.countRemaining === 'function'
        ? visibleTiles.countRemaining(tileCode)
        : 0;
      if (remainingCount <= 0) return count;

      const simulated = shoupai.clone();
      try {
        simulated.zimo(tileCode, false);
      } catch (error) {
        return count;
      }

      const nextXiangting = adapter.calculateXiangting(simulated);
      return nextXiangting < baseXiangting ? count + remainingCount : count;
    }, 0);
  }

  function evaluateHardDiscardMetrics(adapter, runtime, seatKey, shoupai, input = {}) {
    const api = getVisibleTilesApi();
    const waitApi = getWaitQualityApi();
    const visibleTiles = input.visibleTiles || api.buildRuntimeVisibleTiles(runtime, seatKey);
    const policy = input.policy && typeof input.policy === 'object' ? input.policy : {};
    const weights = resolveWeights(policy);
    const contextApi = getRoundContextApi();
    const hardContext = input.hardContext || (
      contextApi && typeof contextApi.buildRuntimeHardRoundContext === 'function'
        ? contextApi.buildRuntimeHardRoundContext(runtime, seatKey, {
            contextPolicy: input.contextPolicy || policy.context || {}
          })
        : null
    );
    const tingpai = adapter && typeof adapter.getTingpai === 'function'
      ? adapter.getTingpai(shoupai.clone())
      : [];
    const liveUkeireCount = countLiveUkeire(adapter, shoupai, visibleTiles);
    const waitQuality = waitApi.evaluateWaitQuality(shoupai, tingpai, visibleTiles);
    const handValueEstimate = Number(input.handValueEstimate || 0) || 0;
    const contextualHandValueEstimate = contextApi && typeof contextApi.applyHardContextToHandValue === 'function'
      ? contextApi.applyHardContextToHandValue(handValueEstimate, hardContext)
      : handValueEstimate;
    const hardEvScore = (
      liveUkeireCount * weights.liveUkeire
      + waitQuality.liveTingpaiCount * weights.liveTingpai
      + waitQuality.waitQualityScore * weights.waitQuality
      + contextualHandValueEstimate * weights.handValue
    );

    return {
      liveUkeireCount,
      liveTingpaiCount: waitQuality.liveTingpaiCount,
      waitQualityScore: waitQuality.waitQualityScore,
      bestWaitType: waitQuality.bestWaitType,
      handValueEstimate,
      contextualHandValueEstimate,
      hardEvScore,
      waits: waitQuality.waits,
      weights,
      hardContext
    };
  }

  return {
    DEFAULT_WEIGHTS,
    countLiveUkeire,
    evaluateHardDiscardMetrics
  };
});
