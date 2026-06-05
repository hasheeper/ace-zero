(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./hard-push-fold'),
      require('./hard-defense-tiebreak')
    );
    return;
  }

  root.AceMahjongAiHardDiscardReview = factory(
    root.AceMahjongAiHardPushFold || null,
    root.AceMahjongAiHardDefenseTiebreak || null
  );
})(typeof globalThis !== 'undefined' ? globalThis : this, function(
  hardPushFoldApi,
  hardDefenseTiebreakApi
) {
  'use strict';

  function evaluateHardPushFold(candidates, attackDecision, input = {}) {
    if (hardPushFoldApi && typeof hardPushFoldApi.evaluateHardPushFoldCandidates === 'function') {
      return hardPushFoldApi.evaluateHardPushFoldCandidates(candidates, attackDecision, input);
    }
    return null;
  }

  function evaluateHardDefensiveUtilityShadow(candidates, currentDecision, input = {}) {
    if (hardPushFoldApi && typeof hardPushFoldApi.evaluateDefensiveUtilityShadow === 'function') {
      return hardPushFoldApi.evaluateDefensiveUtilityShadow(candidates, currentDecision, input);
    }
    return null;
  }

  function evaluateHardSafetyGateRerank(candidates, currentDecision, input = {}) {
    if (hardPushFoldApi && typeof hardPushFoldApi.evaluateSafetyGateRerank === 'function') {
      return hardPushFoldApi.evaluateSafetyGateRerank(candidates, currentDecision, input);
    }
    return null;
  }

  function evaluateHardDefenseTiebreak(candidates, currentDecision, input = {}) {
    if (hardDefenseTiebreakApi && typeof hardDefenseTiebreakApi.evaluateHardDefenseTiebreakCandidates === 'function') {
      return hardDefenseTiebreakApi.evaluateHardDefenseTiebreakCandidates(candidates, currentDecision, input);
    }
    return null;
  }

  function findSelectedDecision(candidateDecisions, tileCode) {
    return (Array.isArray(candidateDecisions) ? candidateDecisions : []).find((candidate) => (
      candidate && candidate.tileCode === tileCode
    )) || null;
  }

  function attachDefensiveUtilityShadow(candidateDecisions, currentDecision, input = {}, hardPushFold = null) {
    if (!currentDecision) return null;
    const shadow = evaluateHardDefensiveUtilityShadow(candidateDecisions, currentDecision, {
      runtime: input.runtime || null,
      seatKey: input.seatKey || null,
      defensiveProfilePolicy: input.hardDefensePolicy || {},
      defensiveProfile: hardPushFold && hardPushFold.defensiveProfile ? hardPushFold.defensiveProfile : null
    });
    if (!shadow) return null;
    currentDecision.defensiveUtilityShadow = shadow;
    if (hardPushFold && typeof hardPushFold === 'object') {
      hardPushFold.defensiveUtilityShadow = shadow;
    }
    return shadow;
  }

  function attachSafetyGate(candidateDecisions, currentDecision, input = {}, hardPushFold = null) {
    if (!currentDecision) return null;
    const review = evaluateHardSafetyGateRerank(candidateDecisions, currentDecision, {
      runtime: input.runtime || null,
      seatKey: input.seatKey || null,
      defensiveProfilePolicy: input.hardDefensePolicy || {},
      defensiveProfile: hardPushFold && hardPushFold.defensiveProfile ? hardPushFold.defensiveProfile : null
    });
    if (!review) return null;
    currentDecision.hardSafetyGate = review;
    if (hardPushFold && typeof hardPushFold === 'object') {
      hardPushFold.hardSafetyGate = review;
    }
    return review;
  }

  function applyHardDiscardReview(candidateDecisions, attackDecision, input = {}) {
    const difficulty = input.difficulty === 'hard' ? 'hard' : input.difficulty;
    const hardPushFoldPolicy = input.hardPushFoldPolicy && typeof input.hardPushFoldPolicy === 'object'
      ? input.hardPushFoldPolicy
      : {};
    const hardDefensePolicy = input.hardDefensePolicy && typeof input.hardDefensePolicy === 'object'
      ? input.hardDefensePolicy
      : {};
    let bestDecision = attackDecision || null;

    if (!bestDecision || difficulty !== 'hard' || hardPushFoldPolicy.enableHardPushFold === false) {
      return {
        selectedDecision: bestDecision,
        hardPushFold: null,
        hardSafetyGate: null,
        hardDefenseTiebreak: null
      };
    }

    const hardPushFold = evaluateHardPushFold(candidateDecisions, bestDecision, {
      policy: hardPushFoldPolicy,
      pushFoldState: input.pushFoldState,
      runtime: input.runtime || null,
      seatKey: input.seatKey || null,
      defensiveProfilePolicy: hardDefensePolicy
    });
    if (!hardPushFold) {
      return {
        selectedDecision: bestDecision,
        hardPushFold: null,
        hardSafetyGate: null,
        hardDefenseTiebreak: null
      };
    }

    const selectedDecision = findSelectedDecision(candidateDecisions, hardPushFold.selectedTileCode);
    if (selectedDecision) {
      bestDecision = selectedDecision;
    }
    bestDecision.hardPushFold = hardPushFold;
    if (hardPushFold.mode === 'cross-xiangting-fold') {
      attachSafetyGate(candidateDecisions, attackDecision, input, hardPushFold);
      if (hardPushFold.hardSafetyGate) {
        bestDecision.hardSafetyGate = hardPushFold.hardSafetyGate;
      }
      attachDefensiveUtilityShadow(candidateDecisions, bestDecision, input, hardPushFold);
      bestDecision.reasons = bestDecision.reasons.concat('hard-push-fold-cross-xiangting-fold');
      return {
        selectedDecision: bestDecision,
        hardPushFold,
        hardSafetyGate: hardPushFold.hardSafetyGate || null,
        hardDefenseTiebreak: null
      };
    }

    const hardSafetyGate = attachSafetyGate(candidateDecisions, bestDecision, input, hardPushFold);
    if (hardSafetyGate && hardSafetyGate.override === true) {
      const safetySelectedDecision = findSelectedDecision(candidateDecisions, hardSafetyGate.selectedTileCode);
      if (safetySelectedDecision) {
        bestDecision = safetySelectedDecision;
      }
      bestDecision.hardPushFold = hardPushFold;
      bestDecision.hardSafetyGate = hardSafetyGate;
      bestDecision.reasons = bestDecision.reasons.concat('hard-safety-gate-rerank');
      attachDefensiveUtilityShadow(candidateDecisions, bestDecision, input, hardPushFold);
      return {
        selectedDecision: bestDecision,
        hardPushFold,
        hardSafetyGate,
        hardDefenseTiebreak: null
      };
    }

    const hardDefenseTiebreak = evaluateHardDefenseTiebreak(candidateDecisions, bestDecision, {
      policy: hardDefensePolicy,
      pushPolicy: hardPushFoldPolicy,
      pushFoldState: input.pushFoldState,
      hardPushFold
    });
    if (hardDefenseTiebreak) {
      const defenseSelectedDecision = findSelectedDecision(candidateDecisions, hardDefenseTiebreak.selectedTileCode);
      if (defenseSelectedDecision) {
        bestDecision = defenseSelectedDecision;
      }
      bestDecision.hardPushFold = hardPushFold;
      if (hardSafetyGate) bestDecision.hardSafetyGate = hardSafetyGate;
      bestDecision.hardDefenseTiebreak = hardDefenseTiebreak;
      if (hardDefenseTiebreak.mode === 'same-xiangting-low-danger') {
        bestDecision.reasons = bestDecision.reasons.concat('hard-defense-tiebreak-same-xiangting-low-danger');
      } else if (hardDefenseTiebreak.mode === 'low-pressure-soft-fold') {
        bestDecision.reasons = bestDecision.reasons.concat('hard-defense-tiebreak-low-pressure-soft-fold');
      } else if (hardDefenseTiebreak.mode === 'equal-safe-backstep') {
        bestDecision.reasons = bestDecision.reasons.concat('hard-defense-tiebreak-equal-safe-backstep');
      }
    }

    attachDefensiveUtilityShadow(candidateDecisions, bestDecision, input, hardPushFold);

    return {
      selectedDecision: bestDecision,
      hardPushFold,
      hardSafetyGate,
      hardDefenseTiebreak
    };
  }

  return {
    applyHardDiscardReview
  };
});
