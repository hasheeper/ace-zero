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
        hardDefenseTiebreak: null
      };
    }

    const hardPushFold = evaluateHardPushFold(candidateDecisions, bestDecision, {
      policy: hardPushFoldPolicy,
      pushFoldState: input.pushFoldState
    });
    if (!hardPushFold) {
      return {
        selectedDecision: bestDecision,
        hardPushFold: null,
        hardDefenseTiebreak: null
      };
    }

    const selectedDecision = findSelectedDecision(candidateDecisions, hardPushFold.selectedTileCode);
    if (selectedDecision) {
      bestDecision = selectedDecision;
    }
    bestDecision.hardPushFold = hardPushFold;
    if (hardPushFold.mode === 'cross-xiangting-fold') {
      bestDecision.reasons = bestDecision.reasons.concat('hard-push-fold-cross-xiangting-fold');
      return {
        selectedDecision: bestDecision,
        hardPushFold,
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
      bestDecision.hardDefenseTiebreak = hardDefenseTiebreak;
      if (hardDefenseTiebreak.mode === 'same-xiangting-low-danger') {
        bestDecision.reasons = bestDecision.reasons.concat('hard-defense-tiebreak-same-xiangting-low-danger');
      } else if (hardDefenseTiebreak.mode === 'low-pressure-soft-fold') {
        bestDecision.reasons = bestDecision.reasons.concat('hard-defense-tiebreak-low-pressure-soft-fold');
      } else if (hardDefenseTiebreak.mode === 'equal-safe-backstep') {
        bestDecision.reasons = bestDecision.reasons.concat('hard-defense-tiebreak-equal-safe-backstep');
      }
    }

    return {
      selectedDecision: bestDecision,
      hardPushFold,
      hardDefenseTiebreak
    };
  }

  return {
    applyHardDiscardReview
  };
});
