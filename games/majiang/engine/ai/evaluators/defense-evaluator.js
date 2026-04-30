(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('../support/tile-danger'),
      require('../support/push-fold'),
      require('../difficulty/easy-policy'),
      require('../difficulty/normal-policy'),
      require('../difficulty/hard-policy')
    );
    return;
  }
  root.AceMahjongDefenseEvaluator = factory(
    root.AceMahjongAiTileDanger || null,
    root.AceMahjongAiPushFold || null,
    root.AceMahjongEasyDifficultyPolicy || null,
    root.AceMahjongNormalDifficultyPolicy || null,
    root.AceMahjongHardDifficultyPolicy || null
  );
})(typeof globalThis !== 'undefined' ? globalThis : this, function(
  tileDangerApi,
  pushFoldApi,
  easyPolicyApi,
  normalPolicyApi,
  hardPolicyApi
) {
  'use strict';

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

  function evaluateRuntimeDefense(runtime, seatKey, tileCode, handMetrics = {}, options = {}) {
    const policy = resolvePolicy(options);
    const defensePolicy = policy && policy.defense && typeof policy.defense === 'object'
      ? policy.defense
      : {};
    const reasons = [];

    const danger = tileDangerApi && typeof tileDangerApi.evaluateRuntimeTileDanger === 'function'
      ? tileDangerApi.evaluateRuntimeTileDanger(runtime, seatKey, tileCode)
      : {
          tileCode,
          dangerScore: 0,
          visibleCount: 0,
          reasons: ['defense-no-danger-source']
        };

    const pushFoldState = pushFoldApi && typeof pushFoldApi.evaluateRuntimePushFoldState === 'function'
      ? pushFoldApi.evaluateRuntimePushFoldState(runtime, seatKey, handMetrics)
      : {
          state: 'neutral',
          pressureScore: 0,
          reasons: ['defense-no-push-fold-source']
        };

    if (defensePolicy.enableTileDanger !== false) {
      reasons.push('defense-tile-danger');
    }
    if (defensePolicy.usePushFoldState !== false) {
      reasons.push('defense-push-fold');
    }
    if (defensePolicy.preferSafetyOnlyUnderPressure !== false) {
      reasons.push('defense-pressure-gated-safety');
    }

    return {
      tileCode,
      policy,
      danger,
      pushFoldState,
      dangerScore: Number(danger && danger.dangerScore) || 0,
      pressureScore: Number(pushFoldState && pushFoldState.pressureScore) || 0,
      reasons
    };
  }

  function createDefenseEvaluator() {
    return {
      evaluateDefense: evaluateRuntimeDefense,
      evaluateRuntimeDefense
    };
  }

  return {
    evaluateRuntimeDefense,
    createDefenseEvaluator
  };
});
