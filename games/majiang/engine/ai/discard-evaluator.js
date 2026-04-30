(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('../base/majiang-core-adapter'),
      require('./support/hand-metrics'),
      require('./evaluators/riichi-evaluator'),
      require('./evaluators/defense-evaluator')
    );
    return;
  }

  root.AceMahjongDiscardEvaluator = factory(
    root.AceMahjongBrowserCoreAdapter || null,
    root.AceMahjongAiHandMetrics || null,
    root.AceMahjongRiichiEvaluator || null,
    root.AceMahjongDefenseEvaluator || null
  );
})(typeof globalThis !== 'undefined' ? globalThis : this, function(coreAdapter, handMetricsApi, riichiEvaluatorApi, defenseEvaluatorApi) {
  'use strict';

  function getCoreAdapter() {
    if (coreAdapter) return coreAdapter;
    if (typeof globalThis !== 'undefined' && globalThis.AceMahjongBrowserCoreAdapter) {
      return globalThis.AceMahjongBrowserCoreAdapter;
    }
    throw new Error('AceMahjongDiscardEvaluator requires a majiang core adapter.');
  }

  function buildHandMetrics(input = {}) {
    if (handMetricsApi && typeof handMetricsApi.buildHandMetrics === 'function') {
      return handMetricsApi.buildHandMetrics(input);
    }
    return {
      xiangting: Number.isFinite(Number(input.xiangting)) ? Number(input.xiangting) : null,
      tingpaiCount: Number.isFinite(Number(input.tingpaiCount)) ? Number(input.tingpaiCount) : 0,
      ukeireCount: 0,
      handValueEstimate: 0
    };
  }

  function normalizeCandidate(code) {
    return String(code || '').replace(/\*$/, '');
  }

  function findTileIndex(handCodes, tileCode, preferNonDrawn) {
    if (!Array.isArray(handCodes) || !handCodes.length) return -1;
    if (preferNonDrawn) {
      const index = handCodes.findIndex((code, handIndex) => code === tileCode && handIndex !== handCodes.length - 1);
      if (index >= 0) return index;
    }
    return handCodes.findIndex((code) => code === tileCode);
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

  function compareDiscardDecisionCore(next, best) {
    if (!best) return true;
    if (next.metrics.xiangting < best.metrics.xiangting) return true;
    if (next.metrics.xiangting > best.metrics.xiangting) return false;
    if (next.metrics.tingpaiCount > best.metrics.tingpaiCount) return true;
    if (next.metrics.tingpaiCount < best.metrics.tingpaiCount) return false;
    if (next.metrics.ukeireCount > best.metrics.ukeireCount) return true;
    if (next.metrics.ukeireCount < best.metrics.ukeireCount) return false;
    if (next.metrics.handValueEstimate > best.metrics.handValueEstimate) return true;
    if (next.metrics.handValueEstimate < best.metrics.handValueEstimate) return false;
    return null;
  }

  function compareDiscardDecisionWithContext(next, best, pushFoldState) {
    const coreResult = compareDiscardDecisionCore(next, best);
    if (coreResult === true) return true;
    if (coreResult === false) return false;

    if (pushFoldState && pushFoldState.pressureScore > 0) {
      const nextDanger = Number(next.danger && next.danger.dangerScore) || 0;
      const bestDanger = Number(best.danger && best.danger.dangerScore) || 0;
      if (nextDanger < bestDanger) return true;
      if (nextDanger > bestDanger) return false;
    }

    if (best.isDrawDiscard && !next.isDrawDiscard) return true;
    if (!best.isDrawDiscard && next.isDrawDiscard) return false;

    return next.tileIndex < best.tileIndex;
  }

  function evaluateDefense(runtime, seatKey, tileCode, handMetrics, options = {}) {
    if (defenseEvaluatorApi && typeof defenseEvaluatorApi.evaluateRuntimeDefense === 'function') {
      return defenseEvaluatorApi.evaluateRuntimeDefense(runtime, seatKey, tileCode, handMetrics, options);
    }
    return {
      tileCode,
      danger: {
        tileCode,
        dangerScore: 0,
        visibleCount: 0,
        reasons: []
      },
      pushFoldState: {
        state: 'neutral',
        pressureScore: 0,
        reasons: []
      },
      dangerScore: 0,
      pressureScore: 0,
      reasons: ['discard-no-defense-evaluator']
    };
  }

  function evaluateRiichi(runtime, seatKey, shoupai, decision, options = {}) {
    if (riichiEvaluatorApi && typeof riichiEvaluatorApi.evaluateRuntimeRiichi === 'function') {
      return riichiEvaluatorApi.evaluateRuntimeRiichi(runtime, seatKey, shoupai, decision, options);
    }
    return {
      shouldRiichi: false,
      score: 0,
      reasons: ['discard-no-riichi-evaluator']
    };
  }

  function evaluateRuntimeDiscard(runtime, seatKey, options = {}) {
    const adapter = getCoreAdapter();
    if (!runtime || typeof runtime.getSeatIndex !== 'function') return null;

    const seatIndex = runtime.getSeatIndex(seatKey);
    if (seatIndex < 0 || !runtime.board || !runtime.board.shoupai || !runtime.board.shoupai[seatIndex]) return null;

    const shoupai = runtime.board.shoupai[seatIndex];
    const handCodes = typeof runtime.getSeatHandCodes === 'function' ? runtime.getSeatHandCodes(seatKey) : [];
    if (!Array.isArray(handCodes) || !handCodes.length) return null;

    const drawnCode = shoupai && shoupai._zimo && shoupai._zimo.length <= 2
      ? String(shoupai._zimo)
      : null;
    const currentXiangting = adapter.calculateXiangting(shoupai.clone());
    const rootDefense = evaluateDefense(runtime, seatKey, null, {
      xiangting: currentXiangting
    }, options);
    const pushFoldState = rootDefense.pushFoldState || {
      state: 'neutral',
      pressureScore: 0,
      reasons: []
    };
    const discardCandidates = adapter.getDiscardCandidates(runtime.rule, shoupai.clone())
      .filter(Boolean);

    if (!discardCandidates.length) {
      const tileCode = handCodes[handCodes.length - 1];
      return {
        type: 'discard',
        seatKey,
        tileCode,
        tileIndex: handCodes.length - 1,
        shouldRiichi: false,
        metrics: buildHandMetrics({
          xiangting: null,
          tingpaiCount: 0
        }),
        reasons: ['no-discard-candidates']
      };
    }

    let bestDecision = null;
    discardCandidates.forEach((candidate) => {
      const normalizedCandidate = normalizeCandidate(candidate);
      const simulated = shoupai.clone().dapai(normalizedCandidate);
      const xiangting = adapter.calculateXiangting(simulated);
      const tingpaiCount = adapter.getTingpai(simulated).length;
      const ukeireCount = estimateUkeireCount(adapter, simulated);
      const handValueEstimate = estimateHandShapeValue(simulated);
      const isDrawDiscard = normalizedCandidate === drawnCode;
      const tileIndex = findTileIndex(handCodes, normalizedCandidate, !isDrawDiscard);
      const defense = evaluateDefense(runtime, seatKey, normalizedCandidate, {
        xiangting,
        tingpaiCount,
        ukeireCount,
        handValueEstimate
      }, options);
      const nextDecision = {
        type: 'discard',
        seatKey,
        tileCode: normalizedCandidate,
        tileIndex: tileIndex >= 0 ? tileIndex : handCodes.length - 1,
        shouldRiichi: false,
        isDrawDiscard,
        danger: defense.danger,
        pushFoldState: defense.pushFoldState,
        metrics: buildHandMetrics({
          xiangting,
          tingpaiCount,
          ukeireCount,
          handValueEstimate
        }),
        reasons: ['simple-4p-discard']
      };
      if (compareDiscardDecisionWithContext(nextDecision, bestDecision, pushFoldState)) {
        bestDecision = nextDecision;
      }
    });

    if (bestDecision) {
      const riichiDecision = evaluateRiichi(runtime, seatKey, shoupai, bestDecision, options);
      bestDecision.shouldRiichi = Boolean(riichiDecision && riichiDecision.shouldRiichi);
      bestDecision.riichiDecision = riichiDecision;
      if (bestDecision.shouldRiichi) {
        bestDecision.reasons = ['simple-4p-discard', 'simple-4p-riichi'].concat(
          Array.isArray(riichiDecision && riichiDecision.reasons) ? riichiDecision.reasons : []
        );
      }
    }

    return bestDecision || null;
  }

  function createDiscardEvaluator() {
    return {
      evaluateRuntimeDiscard
    };
  }

  return {
    evaluateRuntimeDiscard,
    createDiscardEvaluator
  };
});
