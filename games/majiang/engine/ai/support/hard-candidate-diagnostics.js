(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./discard-candidates')
    );
    return;
  }

  root.AceMahjongAiHardCandidateDiagnostics = factory(
    root.AceMahjongAiDiscardCandidates || null
  );
})(typeof globalThis !== 'undefined' ? globalThis : this, function(discardCandidatesApi) {
  'use strict';

  function getHardShapeMetrics(candidate) {
    if (discardCandidatesApi && typeof discardCandidatesApi.getHardShapeMetrics === 'function') {
      return discardCandidatesApi.getHardShapeMetrics(candidate);
    }
    return candidate && candidate.__hardShapeMetrics ? candidate.__hardShapeMetrics : null;
  }

  function compactHardMetrics(metrics = null) {
    if (!metrics || typeof metrics !== 'object') return null;
    return {
      hardEvScore: Number(metrics.hardEvScore || 0) || 0,
      liveUkeireCount: Number(metrics.liveUkeireCount || 0) || 0,
      liveTingpaiCount: Number(metrics.liveTingpaiCount || 0) || 0,
      waitQualityScore: Number(metrics.waitQualityScore || 0) || 0,
      bestWaitType: typeof metrics.bestWaitType === 'string' ? metrics.bestWaitType : null,
      contextualHandValueEstimate: Number(metrics.contextualHandValueEstimate || 0) || 0
    };
  }

  function compactShapeMetrics(metrics = null) {
    if (!metrics || typeof metrics !== 'object') return null;
    return {
      discardShapeScore: Number(metrics.discardShapeScore || 0) || 0,
      discardTileRole: typeof metrics.discardTileRole === 'string' ? metrics.discardTileRole : 'unknown',
      keptUsefulMiddleCount: Number(metrics.keptUsefulMiddleCount || 0) || 0,
      weakTerminalCleanupBonus: Number(metrics.weakTerminalCleanupBonus || 0) || 0,
      isolatedHonorCleanupBonus: Number(metrics.isolatedHonorCleanupBonus || 0) || 0,
      middleTileCutPenalty: Number(metrics.middleTileCutPenalty || 0) || 0,
      fiveOrRedFiveCutPenalty: Number(metrics.fiveOrRedFiveCutPenalty || 0) || 0,
      doraRetentionPenalty: Number(metrics.doraRetentionPenalty || 0) || 0,
      pairOrBlockBreakPenalty: Number(metrics.pairOrBlockBreakPenalty || 0) || 0,
      reasons: Array.isArray(metrics.reasons) ? metrics.reasons.slice() : []
    };
  }

  function compactDanger(danger = null) {
    if (!danger || typeof danger !== 'object') {
      return {
        dangerScore: 0,
        safetyRank: null,
        defenseTileRank: null,
        categories: [],
        reasons: [],
        safetyReasons: []
      };
    }
    return {
      dangerScore: Number(danger.dangerScore || 0) || 0,
      safetyRank: Number.isFinite(Number(danger.safetyRank)) ? Number(danger.safetyRank) : null,
      defenseTileRank: Number.isFinite(Number(danger.defenseTileRank)) ? Number(danger.defenseTileRank) : null,
      categories: Array.isArray(danger.categories) ? danger.categories.slice() : [],
      reasons: Array.isArray(danger.reasons) ? danger.reasons.slice() : [],
      safetyReasons: Array.isArray(danger.safetyReasons) ? danger.safetyReasons.slice() : []
    };
  }

  function compactCandidateDiagnostics(candidate, initialDecision, finalDecision, input = {}) {
    const metrics = candidate && candidate.metrics && typeof candidate.metrics === 'object'
      ? candidate.metrics
      : {};
    const shapeMetrics = getHardShapeMetrics(candidate);
    return {
      tileCode: candidate && candidate.tileCode ? candidate.tileCode : null,
      tileIndex: Number.isFinite(Number(candidate && candidate.tileIndex)) ? Number(candidate.tileIndex) : null,
      isDrawDiscard: Boolean(candidate && candidate.isDrawDiscard),
      selectedInitial: Boolean(candidate && candidate === initialDecision),
      selectedFinal: Boolean(candidate && candidate === finalDecision),
      metrics: {
        xiangting: Number.isFinite(Number(metrics.xiangting)) ? Number(metrics.xiangting) : null,
        tingpaiCount: Number(metrics.tingpaiCount || 0) || 0,
        ukeireCount: Number(metrics.ukeireCount || 0) || 0,
        handValueEstimate: Number(metrics.handValueEstimate || 0) || 0
      },
      danger: compactDanger(candidate && candidate.danger),
      hardMetrics: compactHardMetrics(candidate && candidate.hardMetrics),
      shape: compactShapeMetrics(shapeMetrics)
    };
  }

  function buildHardCandidateDiagnostics(candidateDecisions, initialDecision, finalDecision, input = {}) {
    const candidateApi = discardCandidatesApi || {};
    const diagnosticCandidateDecisions = typeof candidateApi.buildDiagnosticCandidateDecisions === 'function'
      ? candidateApi.buildDiagnosticCandidateDecisions(candidateDecisions, input)
      : (Array.isArray(candidateDecisions) ? candidateDecisions : []);
    return diagnosticCandidateDecisions
      .map((candidate) => compactCandidateDiagnostics(candidate, initialDecision, finalDecision, input));
  }

  return {
    compactCandidateDiagnostics,
    buildHardCandidateDiagnostics
  };
});
