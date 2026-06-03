(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./discard-candidates')
    );
    return;
  }

  root.AceMahjongAiDiscardRanking = factory(
    root.AceMahjongAiDiscardCandidates || null
  );
})(typeof globalThis !== 'undefined' ? globalThis : this, function(discardCandidatesApi) {
  'use strict';

  function normalizeDifficulty(value) {
    const difficulty = typeof value === 'string' ? value.toLowerCase() : 'normal';
    if (difficulty === 'easy') return 'easy';
    if (difficulty === 'hard') return 'hard';
    if (difficulty === 'hell') return 'hell';
    return 'normal';
  }

  function getHardShapeMetrics(decision) {
    if (discardCandidatesApi && typeof discardCandidatesApi.getHardShapeMetrics === 'function') {
      return discardCandidatesApi.getHardShapeMetrics(decision);
    }
    return decision && decision.__hardShapeMetrics ? decision.__hardShapeMetrics : null;
  }

  function compareHardShape(next, best, hardDiscardPolicy = {}) {
    if (!next || !best) return null;
    const nextMetrics = next.hardMetrics || null;
    const bestMetrics = best.hardMetrics || null;
    if (!nextMetrics || !bestMetrics) return null;
    const maxHardEvDelta = Number.isFinite(Number(hardDiscardPolicy.shapeTieBreakMaxHardEvDelta))
      ? Number(hardDiscardPolicy.shapeTieBreakMaxHardEvDelta)
      : 0;
    const hardEvDelta = Math.abs(Number(nextMetrics.hardEvScore || 0) - Number(bestMetrics.hardEvScore || 0));
    if (hardEvDelta > maxHardEvDelta) return null;

    const nextShape = getHardShapeMetrics(next);
    const bestShape = getHardShapeMetrics(best);
    if (!nextShape || !bestShape) return null;
    const nextScore = Number(nextShape.discardShapeScore || 0) || 0;
    const bestScore = Number(bestShape.discardShapeScore || 0) || 0;
    const minShapeDelta = Number.isFinite(Number(hardDiscardPolicy.shapeTieBreakMinShapeDelta))
      ? Math.max(0, Number(hardDiscardPolicy.shapeTieBreakMinShapeDelta))
      : 0;
    const shapeDelta = nextScore - bestScore;
    if (minShapeDelta <= 0) {
      if (shapeDelta > 0) return true;
      if (shapeDelta < 0) return false;
      return null;
    }
    if (shapeDelta >= minShapeDelta) return true;
    if (shapeDelta <= -minShapeDelta) return false;
    return null;
  }

  function numberFromPolicy(source, key, fallback) {
    const value = Number(source && source[key]);
    return Number.isFinite(value) ? value : fallback;
  }

  function getXiangting(decision) {
    return Number.isFinite(Number(decision && decision.metrics && decision.metrics.xiangting))
      ? Number(decision.metrics.xiangting)
      : 99;
  }

  function compareHardStrongShape(next, best, hardDiscardPolicy = {}) {
    if (!next || !best || hardDiscardPolicy.shapeStrongOverrideEnabled !== true) return null;
    const nextXiangting = getXiangting(next);
    const bestXiangting = getXiangting(best);
    const minXiangting = numberFromPolicy(hardDiscardPolicy, 'shapeStrongOverrideMinXiangting', 1);
    const maxXiangting = numberFromPolicy(hardDiscardPolicy, 'shapeStrongOverrideMaxXiangting', 3);
    if (
      nextXiangting !== bestXiangting
      || nextXiangting < minXiangting
      || nextXiangting > maxXiangting
    ) {
      return null;
    }

    const nextMetrics = next.hardMetrics || null;
    const bestMetrics = best.hardMetrics || null;
    const nextShape = getHardShapeMetrics(next);
    const bestShape = getHardShapeMetrics(best);
    if (!nextMetrics || !bestMetrics || !nextShape || !bestShape) return null;

    const minShapeDelta = Math.max(
      0,
      numberFromPolicy(hardDiscardPolicy, 'shapeStrongOverrideMinShapeDelta', Infinity)
    );
    const maxHardEvLoss = Math.max(
      0,
      numberFromPolicy(hardDiscardPolicy, 'shapeStrongOverrideMaxHardEvLoss', 0)
    );
    const nextScore = Number(nextShape.discardShapeScore || 0) || 0;
    const bestScore = Number(bestShape.discardShapeScore || 0) || 0;
    const nextHardEv = Number(nextMetrics.hardEvScore || 0) || 0;
    const bestHardEv = Number(bestMetrics.hardEvScore || 0) || 0;
    const shapeDelta = nextScore - bestScore;

    if (shapeDelta >= minShapeDelta && bestHardEv - nextHardEv <= maxHardEvLoss) return true;
    if (shapeDelta <= -minShapeDelta && nextHardEv - bestHardEv <= maxHardEvLoss) return false;
    return null;
  }

  function isCleanupRole(shapeMetrics) {
    const role = shapeMetrics && typeof shapeMetrics.discardTileRole === 'string'
      ? shapeMetrics.discardTileRole
      : '';
    return role === 'isolated-terminal'
      || role === 'isolated-honor'
      || role === 'weak-floating';
  }

  function isProtectedCutRole(shapeMetrics) {
    const role = shapeMetrics && typeof shapeMetrics.discardTileRole === 'string'
      ? shapeMetrics.discardTileRole
      : '';
    return role === 'value-honor'
      || role === 'useful-middle'
      || role === 'useful-five'
      || role === 'floating-middle'
      || role === 'floating-five'
      || role === 'edge-block';
  }

  function isExperimentalRerankCleanupRole(shapeMetrics) {
    const role = shapeMetrics && typeof shapeMetrics.discardTileRole === 'string'
      ? shapeMetrics.discardTileRole
      : '';
    return role === 'isolated-terminal'
      || role === 'isolated-honor'
      || role === 'weak-floating';
  }

  function isExperimentalRerankProtectedCutRole(shapeMetrics) {
    const role = shapeMetrics && typeof shapeMetrics.discardTileRole === 'string'
      ? shapeMetrics.discardTileRole
      : '';
    return role === 'floating-middle'
      || role === 'useful-middle'
      || role === 'useful-five'
      || role === 'floating-five'
      || role === 'edge-block';
  }

  function experimentalSameXiangtingRerankResult(cleanup, protectedCut, hardDiscardPolicy = {}) {
    const cleanupMetrics = cleanup && cleanup.hardMetrics ? cleanup.hardMetrics : null;
    const protectedMetrics = protectedCut && protectedCut.hardMetrics ? protectedCut.hardMetrics : null;
    const cleanupShape = getHardShapeMetrics(cleanup);
    const protectedShape = getHardShapeMetrics(protectedCut);
    if (!cleanupMetrics || !protectedMetrics || !cleanupShape || !protectedShape) return false;
    if (!isExperimentalRerankCleanupRole(cleanupShape) || !isExperimentalRerankProtectedCutRole(protectedShape)) return false;

    const cleanupXiangting = getXiangting(cleanup);
    const protectedXiangting = getXiangting(protectedCut);
    const minXiangting = numberFromPolicy(hardDiscardPolicy, 'sameXiangtingRerankMinXiangting', 1);
    const maxXiangting = numberFromPolicy(hardDiscardPolicy, 'sameXiangtingRerankMaxXiangting', 4);
    if (
      cleanupXiangting !== protectedXiangting
      || cleanupXiangting < minXiangting
      || cleanupXiangting > maxXiangting
    ) {
      return false;
    }

    const minShapeDelta = Math.max(0, numberFromPolicy(hardDiscardPolicy, 'sameXiangtingRerankMinShapeDelta', 14));
    const maxHardEvLoss = Math.max(0, numberFromPolicy(hardDiscardPolicy, 'sameXiangtingRerankMaxHardEvLoss', 60));
    const cleanupScore = Number(cleanupShape.discardShapeScore || 0) || 0;
    const protectedScore = Number(protectedShape.discardShapeScore || 0) || 0;
    const cleanupHardEv = Number(cleanupMetrics.hardEvScore || 0) || 0;
    const protectedHardEv = Number(protectedMetrics.hardEvScore || 0) || 0;
    return cleanupScore - protectedScore >= minShapeDelta
      && protectedHardEv - cleanupHardEv <= maxHardEvLoss;
  }

  function compareHardExperimentalSameXiangtingRerank(next, best, hardDiscardPolicy = {}) {
    if (!next || !best || hardDiscardPolicy.enableNoPressureSameXiangtingRerank !== true) return null;
    if (experimentalSameXiangtingRerankResult(next, best, hardDiscardPolicy)) return true;
    if (experimentalSameXiangtingRerankResult(best, next, hardDiscardPolicy)) return false;
    return null;
  }

  function cleanupGuardResult(cleanup, protectedCut, hardDiscardPolicy = {}) {
    const cleanupMetrics = cleanup && cleanup.hardMetrics ? cleanup.hardMetrics : null;
    const protectedMetrics = protectedCut && protectedCut.hardMetrics ? protectedCut.hardMetrics : null;
    const cleanupShape = getHardShapeMetrics(cleanup);
    const protectedShape = getHardShapeMetrics(protectedCut);
    if (!cleanupMetrics || !protectedMetrics || !cleanupShape || !protectedShape) return false;
    if (!isCleanupRole(cleanupShape) || !isProtectedCutRole(protectedShape)) return false;

    const minShapeDelta = Math.max(0, numberFromPolicy(hardDiscardPolicy, 'cleanupGuardMinShapeDelta', 12));
    const maxHardEvLoss = Math.max(0, numberFromPolicy(hardDiscardPolicy, 'cleanupGuardMaxHardEvLoss', 100));
    const cleanupScore = Number(cleanupShape.discardShapeScore || 0) || 0;
    const protectedScore = Number(protectedShape.discardShapeScore || 0) || 0;
    const cleanupHardEv = Number(cleanupMetrics.hardEvScore || 0) || 0;
    const protectedHardEv = Number(protectedMetrics.hardEvScore || 0) || 0;
    const shapeDelta = cleanupScore - protectedScore;
    const hardEvLoss = protectedHardEv - cleanupHardEv;
    return shapeDelta >= minShapeDelta && hardEvLoss <= maxHardEvLoss;
  }

  function compareHardNoPressureCleanupGuard(next, best, hardDiscardPolicy = {}) {
    if (!next || !best || hardDiscardPolicy.enableNoPressureCleanupGuard !== true) return null;
    const nextXiangting = getXiangting(next);
    const bestXiangting = getXiangting(best);
    const minXiangting = numberFromPolicy(hardDiscardPolicy, 'cleanupGuardMinXiangting', 1);
    const maxXiangting = numberFromPolicy(hardDiscardPolicy, 'cleanupGuardMaxXiangting', 4);
    if (
      nextXiangting !== bestXiangting
      || nextXiangting < minXiangting
      || nextXiangting > maxXiangting
    ) {
      return null;
    }

    if (cleanupGuardResult(next, best, hardDiscardPolicy)) return true;
    if (cleanupGuardResult(best, next, hardDiscardPolicy)) return false;
    return null;
  }

  function compareHardMetrics(next, best, options = {}) {
    const nextMetrics = next && next.hardMetrics ? next.hardMetrics : null;
    const bestMetrics = best && best.hardMetrics ? best.hardMetrics : null;
    if (!nextMetrics || !bestMetrics) return null;

    if (
      options
      && options.enableShapeTieBreak
      && options.pushFoldState
      && Number(options.pushFoldState.pressureScore || 0) === 0
    ) {
      const shapeResult = compareHardShape(next, best, options.hardDiscardPolicy || {});
      if (shapeResult === true) return true;
      if (shapeResult === false) return false;

      const experimentalRerankResult = compareHardExperimentalSameXiangtingRerank(next, best, options.hardDiscardPolicy || {});
      if (experimentalRerankResult === true) return true;
      if (experimentalRerankResult === false) return false;

      const strongShapeResult = compareHardStrongShape(next, best, options.hardDiscardPolicy || {});
      if (strongShapeResult === true) return true;
      if (strongShapeResult === false) return false;

      const cleanupGuardComparison = compareHardNoPressureCleanupGuard(next, best, options.hardDiscardPolicy || {});
      if (cleanupGuardComparison === true) return true;
      if (cleanupGuardComparison === false) return false;
    }

    const fields = ['hardEvScore', 'liveUkeireCount', 'liveTingpaiCount', 'waitQualityScore'];
    for (const field of fields) {
      const nextValue = Number(nextMetrics[field] || 0) || 0;
      const bestValue = Number(bestMetrics[field] || 0) || 0;
      if (nextValue > bestValue) return true;
      if (nextValue < bestValue) return false;
    }
    return null;
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

  function compareDiscardDecisionWithContext(next, best, pushFoldState, options = {}) {
    if (!best) return true;
    const difficulty = normalizeDifficulty(options.difficulty);
    const hardDiscardPolicy = difficulty === 'hard' && options.hardDiscardPolicy && typeof options.hardDiscardPolicy === 'object'
      ? options.hardDiscardPolicy
      : {};
    if (next.metrics.xiangting < best.metrics.xiangting) return true;
    if (next.metrics.xiangting > best.metrics.xiangting) return false;

    const isSafetyFirstCarefulDefense = (
      difficulty === 'normal'
      || (difficulty === 'hard' && hardDiscardPolicy.pressureSafetyFirst !== false)
    )
      && pushFoldState
      && pushFoldState.state === 'careful'
      && pushFoldState.pressureScore > 0
      && next.metrics.xiangting === best.metrics.xiangting;

    if (isSafetyFirstCarefulDefense) {
      const nextDanger = Number(next.danger && next.danger.dangerScore) || 0;
      const bestDanger = Number(best.danger && best.danger.dangerScore) || 0;
      if (nextDanger < bestDanger) return true;
      if (nextDanger > bestDanger) return false;
    }

    if (difficulty === 'hard' && hardDiscardPolicy.enableHardEv !== false) {
      const hardResult = compareHardMetrics(next, best, {
        enableShapeTieBreak: hardDiscardPolicy.enableNoPressureShapeReview === true,
        hardDiscardPolicy,
        pushFoldState
      });
      if (hardResult === true) return true;
      if (hardResult === false) return false;
    }

    const coreResult = compareDiscardDecisionCore(next, best);
    if (coreResult === true) return true;
    if (coreResult === false) return false;

    if (!isSafetyFirstCarefulDefense && pushFoldState && pushFoldState.pressureScore > 0) {
      const nextDanger = Number(next.danger && next.danger.dangerScore) || 0;
      const bestDanger = Number(best.danger && best.danger.dangerScore) || 0;
      if (nextDanger < bestDanger) return true;
      if (nextDanger > bestDanger) return false;
    }

    if (best.isDrawDiscard && !next.isDrawDiscard) return true;
    if (!best.isDrawDiscard && next.isDrawDiscard) return false;

    return next.tileIndex < best.tileIndex;
  }

  function selectBestDiscardDecision(candidateDecisions, input = {}) {
    let bestDecision = null;
    (Array.isArray(candidateDecisions) ? candidateDecisions : []).forEach((candidate) => {
      if (compareDiscardDecisionWithContext(candidate, bestDecision, input.pushFoldState, input)) {
        bestDecision = candidate;
      }
    });
    return bestDecision;
  }

  return {
    compareDiscardDecisionWithContext,
    selectBestDiscardDecision
  };
});
