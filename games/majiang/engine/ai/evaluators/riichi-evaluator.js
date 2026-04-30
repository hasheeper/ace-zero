(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('../../base/majiang-core-adapter'),
      require('../difficulty/easy-policy'),
      require('../difficulty/normal-policy'),
      require('../difficulty/hard-policy')
    );
    return;
  }
  root.AceMahjongRiichiEvaluator = factory(
    root.AceMahjongBrowserCoreAdapter || null,
    root.AceMahjongEasyDifficultyPolicy || null,
    root.AceMahjongNormalDifficultyPolicy || null,
    root.AceMahjongHardDifficultyPolicy || null
  );
})(typeof globalThis !== 'undefined' ? globalThis : this, function(coreAdapter, easyPolicyApi, normalPolicyApi, hardPolicyApi) {
  'use strict';

  function getCoreAdapter() {
    if (coreAdapter) return coreAdapter;
    if (typeof globalThis !== 'undefined' && globalThis.AceMahjongBrowserCoreAdapter) {
      return globalThis.AceMahjongBrowserCoreAdapter;
    }
    throw new Error('AceMahjongRiichiEvaluator requires a majiang core adapter.');
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

  function normalizeCandidate(code) {
    return String(code || '').replace(/\*$/, '');
  }

  function getSeatScore(runtime, seatKey, seatIndex) {
    if (!runtime || !runtime.board || !Array.isArray(runtime.board.defen)) return 0;
    const playerIndex = typeof runtime.getPlayerIdentityIndex === 'function'
      ? runtime.getPlayerIdentityIndex(seatKey)
      : seatIndex;
    return Number(runtime.board.defen[playerIndex] || 0) || 0;
  }

  function resolvePolicy(options = {}) {
    if (options.policy && typeof options.policy === 'object') {
      return clone(options.policy);
    }
    return createPolicyByDifficulty(normalizeDifficulty(options.difficulty));
  }

  function evaluateRuntimeRiichi(runtime, seatKey, shoupai, discardDecision, options = {}) {
    const adapter = getCoreAdapter();
    const policy = resolvePolicy(options);
    const riichiPolicy = policy && policy.riichi && typeof policy.riichi === 'object'
      ? policy.riichi
      : {};
    const metrics = discardDecision && discardDecision.metrics && typeof discardDecision.metrics === 'object'
      ? discardDecision.metrics
      : {};
    const reasons = [];

    if (!runtime || !seatKey || !shoupai || !discardDecision) {
      return {
        shouldRiichi: false,
        score: 0,
        reasons: ['riichi-missing-context'],
        policy
      };
    }

    if (metrics.xiangting !== 0) {
      return {
        shouldRiichi: false,
        score: 0,
        reasons: ['riichi-not-tenpai'],
        policy
      };
    }

    if (!runtime.rulesetProfile || runtime.rulesetProfile.enableRiichi === false) {
      return {
        shouldRiichi: false,
        score: 0,
        reasons: ['riichi-disabled-by-ruleset'],
        policy
      };
    }

    const seatIndex = typeof runtime.getSeatIndex === 'function' ? runtime.getSeatIndex(seatKey) : -1;
    if (seatIndex < 0) {
      return {
        shouldRiichi: false,
        score: 0,
        reasons: ['riichi-invalid-seat'],
        policy
      };
    }

    const wallState = typeof runtime.getWallState === 'function' ? runtime.getWallState() : null;
    const remaining = wallState ? Number(wallState.remaining || 0) : 0;
    const seatScore = getSeatScore(runtime, seatKey, seatIndex);
    const riichiChoices = adapter.getRiichiChoices(runtime.rule, shoupai.clone(), remaining, seatScore);
    const normalizedChoices = Array.isArray(riichiChoices)
      ? riichiChoices.map((choice) => normalizeCandidate(choice)).filter(Boolean)
      : [];
    const tingpaiCount = Number(metrics.tingpaiCount || 0) || 0;
    const handValueEstimate = Number(metrics.handValueEstimate || 0) || 0;
    const minTingpaiCount = Number(riichiPolicy.minTingpaiCount || 0) || 0;
    const minRemainingTiles = Number(riichiPolicy.minRemainingTiles || 0) || 0;
    const minHandValueEstimate = Number(riichiPolicy.minHandValueEstimate || 0) || 0;

    if (riichiPolicy.requireLegalChoice !== false && !normalizedChoices.includes(discardDecision.tileCode)) {
      return {
        shouldRiichi: false,
        score: 0,
        reasons: ['riichi-illegal-discard-choice'],
        policy
      };
    }
    if (tingpaiCount < minTingpaiCount) {
      return {
        shouldRiichi: false,
        score: 0,
        reasons: ['riichi-wait-count-too-low'],
        policy
      };
    }
    if (remaining < minRemainingTiles) {
      return {
        shouldRiichi: false,
        score: 0,
        reasons: ['riichi-too-late'],
        policy
      };
    }
    if (handValueEstimate < minHandValueEstimate) {
      return {
        shouldRiichi: false,
        score: 0,
        reasons: ['riichi-hand-value-too-low'],
        policy
      };
    }

    reasons.push('riichi-legal-choice');
    reasons.push('riichi-thresholds-cleared');

    return {
      shouldRiichi: true,
      score: tingpaiCount + handValueEstimate,
      reasons,
      policy,
      thresholds: {
        minTingpaiCount,
        minRemainingTiles,
        minHandValueEstimate
      }
    };
  }

  function createRiichiEvaluator() {
    return {
      evaluateRiichi: evaluateRuntimeRiichi,
      evaluateRuntimeRiichi
    };
  }

  return {
    evaluateRuntimeRiichi,
    createRiichiEvaluator
  };
});
