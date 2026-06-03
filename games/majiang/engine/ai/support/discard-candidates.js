(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./hand-metrics'),
      require('../evaluators/defense-evaluator'),
      require('./hard-ev'),
      require('./discard-shape')
    );
    return;
  }

  root.AceMahjongAiDiscardCandidates = factory(
    root.AceMahjongAiHandMetrics || null,
    root.AceMahjongDefenseEvaluator || null,
    root.AceMahjongAiHardEv || null,
    root.AceMahjongAiDiscardShape || null
  );
})(typeof globalThis !== 'undefined' ? globalThis : this, function(
  handMetricsApi,
  defenseEvaluatorApi,
  hardEvApi,
  discardShapeApi
) {
  'use strict';

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

  function normalizeTileIdentity(code) {
    const normalized = String(code || '').replace(/[\*_\+\=\-]+$/g, '');
    const redMatch = normalized.match(/^([mps])0$/);
    if (redMatch) return `${redMatch[1]}5`;
    return normalized;
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

  function evaluateHardMetrics(adapter, runtime, seatKey, shoupai, input = {}) {
    if (hardEvApi && typeof hardEvApi.evaluateHardDiscardMetrics === 'function') {
      return hardEvApi.evaluateHardDiscardMetrics(adapter, runtime, seatKey, shoupai, input);
    }
    return null;
  }

  function getDiscardShapeApi() {
    if (discardShapeApi) return discardShapeApi;
    if (typeof globalThis !== 'undefined' && globalThis.AceMahjongAiDiscardShape) {
      return globalThis.AceMahjongAiDiscardShape;
    }
    return null;
  }

  function evaluateHardShape(adapter, runtime, seatKey, beforeShoupai, afterShoupai, discardTileCode, input = {}) {
    const api = getDiscardShapeApi();
    if (api && typeof api.evaluateHardDiscardShape === 'function') {
      return api.evaluateHardDiscardShape(adapter, runtime, seatKey, beforeShoupai, afterShoupai, discardTileCode, input);
    }
    return null;
  }

  function setHardShapeMetrics(decision, shapeMetrics) {
    if (!decision || !shapeMetrics) return;
    Object.defineProperty(decision, '__hardShapeMetrics', {
      value: shapeMetrics,
      enumerable: false,
      configurable: true
    });
  }

  function getHardShapeMetrics(decision) {
    return decision && decision.__hardShapeMetrics ? decision.__hardShapeMetrics : null;
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

  function shouldEvaluateHardShape(difficulty, hardDiscardPolicy, pushFoldState, xiangting) {
    return difficulty === 'hard'
      && hardDiscardPolicy
      && hardDiscardPolicy.enableNoPressureShapeReview === true
      && pushFoldState
      && Number(pushFoldState.pressureScore || 0) === 0
      && xiangting >= (
        Number.isFinite(Number(hardDiscardPolicy.shapeReviewMinXiangting))
          ? Number(hardDiscardPolicy.shapeReviewMinXiangting)
          : 0
      );
  }

  function buildDiscardCandidateDecision(input = {}) {
    const {
      adapter,
      runtime,
      seatKey,
      shoupai,
      handCodes,
      drawnCode,
      candidate,
      difficulty,
      policyId,
      hardDiscardPolicy = {},
      hardContextPolicy = {},
      pushFoldState,
      options
    } = input;
    const normalizedCandidate = normalizeCandidate(candidate);
    if (!normalizedCandidate) return null;

    let simulated = null;
    try {
      simulated = shoupai.clone().dapai(normalizedCandidate);
    } catch (error) {
      return null;
    }

    const xiangting = adapter.calculateXiangting(simulated);
    const tingpaiCount = adapter.getTingpai(simulated).length;
    const ukeireCount = estimateUkeireCount(adapter, simulated);
    const handValueEstimate = estimateHandShapeValue(simulated);
    const hardMetrics = difficulty === 'hard' && hardDiscardPolicy.enableHardEv !== false
      ? evaluateHardMetrics(adapter, runtime, seatKey, simulated, {
          handValueEstimate,
          policy: hardDiscardPolicy,
          contextPolicy: hardContextPolicy
      })
      : null;
    const hardShapeMetrics = shouldEvaluateHardShape(difficulty, hardDiscardPolicy, pushFoldState, xiangting)
      ? evaluateHardShape(adapter, runtime, seatKey, shoupai, simulated, normalizedCandidate, {
          ...(hardDiscardPolicy.shape || {}),
          shapeScoreWeight: hardDiscardPolicy.shapeScoreWeight
        })
      : null;
    const isDrawDiscard = normalizedCandidate === drawnCode;
    const tileIndex = findTileIndex(handCodes, normalizedCandidate, !isDrawDiscard);
    const defense = evaluateDefense(runtime, seatKey, normalizedCandidate, {
      xiangting,
      tingpaiCount,
      ukeireCount,
      handValueEstimate
    }, options);
    const decision = {
      type: 'discard',
      seatKey,
      tileCode: normalizedCandidate,
      tileIndex: tileIndex >= 0 ? tileIndex : handCodes.length - 1,
      shouldRiichi: false,
      difficulty,
      policyId,
      isDrawDiscard,
      danger: defense.danger,
      pushFoldState: defense.pushFoldState,
      metrics: buildHandMetrics({
        xiangting,
        tingpaiCount,
        ukeireCount,
        handValueEstimate
      }),
      reasons: [`${difficulty}-4p-discard`]
    };
    if (hardMetrics) {
      decision.hardMetrics = hardMetrics;
    }
    setHardShapeMetrics(decision, hardShapeMetrics);
    return decision;
  }

  function buildDiagnosticCandidateDecisions(candidateDecisions, input = {}) {
    const decisions = Array.isArray(candidateDecisions) ? candidateDecisions.slice() : [];
    const seenTileIdentities = new Set(
      decisions
        .map((candidate) => normalizeTileIdentity(candidate && candidate.tileCode))
        .filter(Boolean)
    );
    const handCodes = Array.isArray(input.handCodes) ? input.handCodes : [];

    handCodes.forEach((handCode) => {
      const identity = normalizeTileIdentity(handCode);
      if (!identity || seenTileIdentities.has(identity)) return;
      const decision = buildDiscardCandidateDecision({
        ...input,
        candidate: handCode
      });
      if (!decision) return;
      decisions.push(decision);
      seenTileIdentities.add(identity);
    });

    return decisions;
  }

  function buildExpandedCandidateDecisions(candidateDecisions, input = {}) {
    return buildDiagnosticCandidateDecisions(candidateDecisions, input);
  }

  return {
    buildHandMetrics,
    normalizeCandidate,
    normalizeTileIdentity,
    evaluateDefense,
    getHardShapeMetrics,
    buildDiscardCandidateDecision,
    buildDiagnosticCandidateDecisions,
    buildExpandedCandidateDecisions
  };
});
