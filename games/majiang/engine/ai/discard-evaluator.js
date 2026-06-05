(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('../base/majiang-core-adapter'),
      require('./evaluators/riichi-evaluator'),
      require('./support/discard-candidates'),
      require('./support/discard-ranking'),
      require('./support/hard-discard-review'),
      require('./support/hard-candidate-diagnostics'),
      require('./difficulty/hard-policy')
    );
    return;
  }

  root.AceMahjongDiscardEvaluator = factory(
    root.AceMahjongBrowserCoreAdapter || null,
    root.AceMahjongRiichiEvaluator || null,
    root.AceMahjongAiDiscardCandidates || null,
    root.AceMahjongAiDiscardRanking || null,
    root.AceMahjongAiHardDiscardReview || null,
    root.AceMahjongAiHardCandidateDiagnostics || null,
    root.AceMahjongHardDifficultyPolicy || null
  );
})(typeof globalThis !== 'undefined' ? globalThis : this, function(
  coreAdapter,
  riichiEvaluatorApi,
  discardCandidatesApi,
  discardRankingApi,
  hardDiscardReviewApi,
  hardCandidateDiagnosticsApi,
  hardPolicyApi
) {
  'use strict';

  function getCoreAdapter() {
    if (coreAdapter) return coreAdapter;
    if (typeof globalThis !== 'undefined' && globalThis.AceMahjongBrowserCoreAdapter) {
      return globalThis.AceMahjongBrowserCoreAdapter;
    }
    throw new Error('AceMahjongDiscardEvaluator requires a majiang core adapter.');
  }

  function buildHandMetrics(input = {}) {
    if (discardCandidatesApi && typeof discardCandidatesApi.buildHandMetrics === 'function') {
      return discardCandidatesApi.buildHandMetrics(input);
    }
    return {
      xiangting: Number.isFinite(Number(input.xiangting)) ? Number(input.xiangting) : null,
      tingpaiCount: Number.isFinite(Number(input.tingpaiCount)) ? Number(input.tingpaiCount) : 0,
      ukeireCount: 0,
      handValueEstimate: 0
    };
  }

  function normalizeDifficulty(value) {
    const difficulty = typeof value === 'string' ? value.toLowerCase() : 'normal';
    if (difficulty === 'easy') return 'easy';
    if (difficulty === 'hard') return 'hard';
    if (difficulty === 'hell') return 'hell';
    return 'normal';
  }

  function resolvePolicyId(options = {}) {
    if (options.policy && typeof options.policy.id === 'string' && options.policy.id) {
      return options.policy.id;
    }
    return normalizeDifficulty(options.difficulty);
  }

  function resolveHardPolicy(options = {}) {
    if (options.policy && typeof options.policy === 'object') {
      return options.policy;
    }
    if (hardPolicyApi && typeof hardPolicyApi.createHardPolicy === 'function') {
      return hardPolicyApi.createHardPolicy();
    }
    return {};
  }

  function resolveHardDiscardPolicy(options = {}) {
    if (options.policy && options.policy.discard && typeof options.policy.discard === 'object') {
      return options.policy.discard;
    }
    if (hardPolicyApi && typeof hardPolicyApi.createHardPolicy === 'function') {
      const policy = hardPolicyApi.createHardPolicy();
      return policy && policy.discard && typeof policy.discard === 'object'
        ? policy.discard
        : {};
    }
    return {};
  }

  function evaluateDefense(runtime, seatKey, tileCode, handMetrics, options = {}) {
    if (discardCandidatesApi && typeof discardCandidatesApi.evaluateDefense === 'function') {
      return discardCandidatesApi.evaluateDefense(runtime, seatKey, tileCode, handMetrics, options);
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

  function buildDiscardCandidateDecision(input = {}) {
    if (discardCandidatesApi && typeof discardCandidatesApi.buildDiscardCandidateDecision === 'function') {
      return discardCandidatesApi.buildDiscardCandidateDecision(input);
    }
    return null;
  }

  function buildExpandedCandidateDecisions(candidateDecisions, input = {}) {
    if (discardCandidatesApi && typeof discardCandidatesApi.buildExpandedCandidateDecisions === 'function') {
      return discardCandidatesApi.buildExpandedCandidateDecisions(candidateDecisions, input);
    }
    return Array.isArray(candidateDecisions) ? candidateDecisions : [];
  }

  function selectBestDiscardDecision(candidateDecisions, input = {}) {
    if (discardRankingApi && typeof discardRankingApi.selectBestDiscardDecision === 'function') {
      return discardRankingApi.selectBestDiscardDecision(candidateDecisions, input);
    }
    return Array.isArray(candidateDecisions) && candidateDecisions.length ? candidateDecisions[0] : null;
  }

  function applyHardDiscardReview(candidateDecisions, bestDecision, input = {}) {
    if (hardDiscardReviewApi && typeof hardDiscardReviewApi.applyHardDiscardReview === 'function') {
      return hardDiscardReviewApi.applyHardDiscardReview(candidateDecisions, bestDecision, input);
    }
    return {
      selectedDecision: bestDecision || null,
      hardPushFold: null
    };
  }

  function buildHardCandidateDiagnostics(candidateDecisions, initialDecision, finalDecision, input = {}) {
    if (hardCandidateDiagnosticsApi && typeof hardCandidateDiagnosticsApi.buildHardCandidateDiagnostics === 'function') {
      return hardCandidateDiagnosticsApi.buildHardCandidateDiagnostics(candidateDecisions, initialDecision, finalDecision, input);
    }
    return [];
  }

  function buildNoCandidateDecision(seatKey, handCodes, difficulty, policyId) {
    const tileCode = handCodes[handCodes.length - 1];
    return {
      type: 'discard',
      seatKey,
      tileCode,
      tileIndex: handCodes.length - 1,
      shouldRiichi: false,
      difficulty,
      policyId,
      metrics: buildHandMetrics({
        xiangting: null,
        tingpaiCount: 0
      }),
      reasons: ['no-discard-candidates']
    };
  }

  function evaluateRuntimeDiscard(runtime, seatKey, options = {}) {
    const adapter = getCoreAdapter();
    const difficulty = normalizeDifficulty(options.difficulty);
    const policyId = resolvePolicyId(options);
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
    const hardPolicy = difficulty === 'hard' ? resolveHardPolicy(options) : {};
    const hardDiscardPolicy = difficulty === 'hard'
      ? (hardPolicy && hardPolicy.discard && typeof hardPolicy.discard === 'object'
          ? hardPolicy.discard
          : resolveHardDiscardPolicy(options))
      : {};
    const hardPushFoldPolicy = difficulty === 'hard' && hardPolicy && hardPolicy.pushFold && typeof hardPolicy.pushFold === 'object'
      ? hardPolicy.pushFold
      : {};
    const hardDefensePolicy = difficulty === 'hard' && hardPolicy && hardPolicy.defense && typeof hardPolicy.defense === 'object'
      ? hardPolicy.defense
      : {};
    const hardContextPolicy = difficulty === 'hard' && hardPolicy && hardPolicy.context && typeof hardPolicy.context === 'object'
      ? hardPolicy.context
      : {};
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
      return buildNoCandidateDecision(seatKey, handCodes, difficulty, policyId);
    }

    const candidateInput = {
      adapter,
      runtime,
      seatKey,
      shoupai,
      handCodes,
      drawnCode,
      difficulty,
      policyId,
      hardDiscardPolicy,
      hardContextPolicy,
      pushFoldState,
      options
    };
    let candidateDecisions = discardCandidates
      .map((candidate) => buildDiscardCandidateDecision({
        ...candidateInput,
        candidate
      }))
      .filter(Boolean);
    if (difficulty === 'hard') {
      candidateDecisions = buildExpandedCandidateDecisions(candidateDecisions, candidateInput);
    }
    let bestDecision = selectBestDiscardDecision(candidateDecisions, {
      difficulty,
      hardDiscardPolicy,
      pushFoldState
    });

    if (!bestDecision) return null;

    const initialBestDecision = bestDecision;
    const hardReview = applyHardDiscardReview(candidateDecisions, bestDecision, {
      difficulty,
      hardPushFoldPolicy,
      hardDefensePolicy,
      pushFoldState,
      runtime,
      seatKey
    });
    bestDecision = hardReview && hardReview.selectedDecision ? hardReview.selectedDecision : bestDecision;

    if (difficulty === 'hard' && options.includeHardCandidateDiagnostics === true) {
      bestDecision.hardCandidateDiagnostics = buildHardCandidateDiagnostics(
        candidateDecisions,
        initialBestDecision,
        bestDecision,
        candidateInput
      );
    }

    const riichiDecision = evaluateRiichi(runtime, seatKey, shoupai, bestDecision, options);
    bestDecision.shouldRiichi = Boolean(riichiDecision && riichiDecision.shouldRiichi);
    bestDecision.riichiDecision = riichiDecision;
    bestDecision.policyId = riichiDecision && riichiDecision.policy && riichiDecision.policy.id
      ? riichiDecision.policy.id
      : bestDecision.policyId;
    if (bestDecision.shouldRiichi) {
      bestDecision.reasons = [`${difficulty}-4p-discard`, `${difficulty}-4p-riichi`].concat(
        Array.isArray(riichiDecision && riichiDecision.reasons) ? riichiDecision.reasons : []
      );
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
