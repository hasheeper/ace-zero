(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./discard-evaluator'),
      require('./evaluators/call-evaluator'),
      require('./evaluators/kan-evaluator'),
      require('./difficulty/hard-variants')
    );
    return;
  }

  root.AceMahjongBaseAI = factory(
    root.AceMahjongDiscardEvaluator || null,
    root.AceMahjongCallEvaluator || null,
    root.AceMahjongKanEvaluator || null,
    root.AceMahjongHardVariantPolicies || null
  );
})(typeof globalThis !== 'undefined' ? globalThis : this, function(discardEvaluatorApi, callEvaluatorApi, kanEvaluatorApi, hardVariantApi) {
  'use strict';

  const DIFFICULTY_TIERS = Object.freeze(['easy', 'normal', 'hard', 'hell']);
  const IMPLEMENTED_DIFFICULTIES = Object.freeze(['easy', 'normal', 'hard']);

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function normalizeDifficulty(value) {
    const difficulty = typeof value === 'string' && value ? value.toLowerCase() : 'normal';
    if (difficulty === 'rookie') return 'easy';
    if (difficulty === 'beta') return 'normal';
    if (difficulty === 'master') return 'hard';
    if (hardVariantApi && typeof hardVariantApi.isHardVariantId === 'function' && hardVariantApi.isHardVariantId(difficulty)) {
      return 'hard';
    }
    if (DIFFICULTY_TIERS.includes(difficulty)) return difficulty;
    return 'normal';
  }

  function normalizeVariant(value) {
    const variant = typeof value === 'string' && value ? value.toLowerCase() : '';
    if (!variant || !hardVariantApi || typeof hardVariantApi.isHardVariantId !== 'function') return null;
    if (!hardVariantApi.isHardVariantId(variant)) return null;
    return typeof hardVariantApi.normalizeHardVariantId === 'function'
      ? hardVariantApi.normalizeHardVariantId(variant)
      : variant;
  }

  function resolveAiPolicy(difficulty, variant) {
    if (difficulty === 'hard' && variant && hardVariantApi && typeof hardVariantApi.createHardVariantPolicy === 'function') {
      return hardVariantApi.createHardVariantPolicy(variant) || null;
    }
    return null;
  }

  function normalizeAiConfig(player = {}, sharedAiConfig = {}) {
    const source = player && typeof player === 'object' ? player : {};
    const aiSource = source.ai && typeof source.ai === 'object' ? source.ai : {};
    const defaultDifficulty = typeof sharedAiConfig.defaultDifficulty === 'string'
      ? sharedAiConfig.defaultDifficulty
      : 'normal';
    const rawDifficulty = aiSource.difficulty || source.difficulty || defaultDifficulty;
    const variant = normalizeVariant(
      aiSource.variant
      || aiSource.policyId
      || source.variant
      || source.policyId
      || rawDifficulty
      || aiSource.profile
    );
    const difficulty = variant ? 'hard' : normalizeDifficulty(rawDifficulty);
    const policy = resolveAiPolicy(difficulty, variant);

    return {
      enabled: aiSource.enabled !== false && source.human !== true,
      difficulty,
      variant,
      profile: typeof aiSource.profile === 'string' && aiSource.profile ? aiSource.profile : 'default',
      policy,
      policyId: policy && policy.id ? policy.id : (variant || difficulty),
      implemented: IMPLEMENTED_DIFFICULTIES.includes(difficulty)
    };
  }

  function createDiscardEvaluator(options = {}) {
    return discardEvaluatorApi && typeof discardEvaluatorApi.createDiscardEvaluator === 'function'
      ? discardEvaluatorApi.createDiscardEvaluator(options)
      : null;
  }

  function createCallEvaluator(options = {}) {
    return callEvaluatorApi && typeof callEvaluatorApi.createCallEvaluator === 'function'
      ? callEvaluatorApi.createCallEvaluator(options)
      : null;
  }

  function createKanEvaluator(options = {}) {
    return kanEvaluatorApi && typeof kanEvaluatorApi.createKanEvaluator === 'function'
      ? kanEvaluatorApi.createKanEvaluator(options)
      : null;
  }

  function resolveDecisionPolicy(config = {}, decisionContext = {}) {
    if (decisionContext && decisionContext.policy && typeof decisionContext.policy === 'object') {
      return decisionContext.policy;
    }
    return config && config.policy ? config.policy : null;
  }

  function selectHuleReaction(actions = []) {
    const huleActions = (Array.isArray(actions) ? actions : []).filter((action) => action && action.type === 'hule');
    if (!huleActions.length) return null;
    return huleActions.sort((left, right) => Number(right.priority || 0) - Number(left.priority || 0))[0];
  }

  function createAiController(runtime, options = {}) {
    const sharedAiConfig = options.ai && typeof options.ai === 'object'
      ? clone(options.ai)
      : {};
    const players = runtime && runtime.config && Array.isArray(runtime.config.players)
      ? runtime.config.players.slice()
      : Array.isArray(options.players) ? options.players.slice() : [];
    const seatKeys = runtime && Array.isArray(runtime.activeSeats) && runtime.activeSeats.length
      ? runtime.activeSeats.slice()
      : ['bottom', 'right', 'top', 'left'];
    const playersBySeat = new Map(
      players
        .filter((player) => player && typeof player === 'object' && typeof player.seat === 'string')
        .map((player) => [player.seat, player])
    );
    const seatConfigs = new Map();
    const discardEvaluator = createDiscardEvaluator(options);
    const callEvaluator = createCallEvaluator(options);
    const kanEvaluator = createKanEvaluator(options);

    seatKeys.forEach((seatKey, index) => {
      const player = playersBySeat.get(seatKey) || players[index] || {};
      seatConfigs.set(seatKey, normalizeAiConfig(player, sharedAiConfig));
    });

    return {
      difficultyTiers: DIFFICULTY_TIERS.slice(),
      implementedDifficulties: IMPLEMENTED_DIFFICULTIES.slice(),
      getSeatConfig(seatKey) {
        return clone(seatConfigs.get(seatKey) || normalizeAiConfig({}, sharedAiConfig));
      },
      isAiSeat(seatKey) {
        const config = seatConfigs.get(seatKey);
        return Boolean(config && config.enabled);
      },
      chooseDiscard(seatKey, decisionContext = {}) {
        const config = seatConfigs.get(seatKey);
        if (!config || !config.enabled || !config.implemented) return null;
        if (!runtime || !runtime.rulesetProfile || runtime.rulesetProfile.id !== 'riichi-4p') return null;
        if (!discardEvaluator || typeof discardEvaluator.evaluateRuntimeDiscard !== 'function') return null;
        return discardEvaluator.evaluateRuntimeDiscard(runtime, seatKey, {
          ...decisionContext,
          difficulty: config.difficulty,
          profile: config.profile,
          policy: resolveDecisionPolicy(config, decisionContext)
        });
      },
      chooseTurnAction(seatKey, availableActions = [], decisionContext = {}) {
        const config = seatConfigs.get(seatKey);
        if (!config || !config.enabled || !config.implemented) return null;
        if (!runtime || !runtime.rulesetProfile || runtime.rulesetProfile.id !== 'riichi-4p') return null;
        if (!kanEvaluator || typeof kanEvaluator.evaluateKan !== 'function') return null;
        const kanDecision = kanEvaluator.evaluateKan(runtime, seatKey, availableActions, {
          ...decisionContext,
          difficulty: config.difficulty,
          profile: config.profile,
          policy: resolveDecisionPolicy(config, decisionContext),
          isReactionKan: false
        });
        if (!kanDecision || !kanDecision.action || !kanDecision.hardKanMetrics || kanDecision.hardKanMetrics.accepted !== true) {
          return null;
        }
        const aiDecision = {
          difficulty: config.difficulty,
          variant: config.variant || null,
          policyId: kanDecision.policy && kanDecision.policy.id ? kanDecision.policy.id : config.policyId,
          reasons: Array.isArray(kanDecision.reasons) ? kanDecision.reasons.slice() : [],
          metrics: kanDecision.metrics ? clone(kanDecision.metrics) : null,
          hardKanMetrics: clone(kanDecision.hardKanMetrics)
        };
        return {
          ...kanDecision.action,
          aiDecision
        };
      },
      chooseReaction(seatKey, availableActions = [], decisionContext = {}) {
        const config = seatConfigs.get(seatKey);
        if (!config || !config.enabled || !config.implemented) return null;
        if (!runtime || !runtime.rulesetProfile || runtime.rulesetProfile.id !== 'riichi-4p') return null;
        const huleAction = selectHuleReaction(availableActions);
        if (huleAction) return huleAction;
        if (kanEvaluator && typeof kanEvaluator.evaluateKan === 'function') {
          const kanDecision = kanEvaluator.evaluateKan(runtime, seatKey, availableActions, {
            ...decisionContext,
            difficulty: config.difficulty,
            profile: config.profile,
            policy: resolveDecisionPolicy(config, decisionContext),
            isReactionKan: true
          });
          if (kanDecision && kanDecision.action && kanDecision.hardKanMetrics && kanDecision.hardKanMetrics.accepted === true) {
            const aiDecision = {
              difficulty: config.difficulty,
              variant: config.variant || null,
              policyId: kanDecision.policy && kanDecision.policy.id ? kanDecision.policy.id : config.policyId,
              reasons: Array.isArray(kanDecision.reasons) ? kanDecision.reasons.slice() : [],
              metrics: kanDecision.metrics ? clone(kanDecision.metrics) : null,
              hardKanMetrics: clone(kanDecision.hardKanMetrics)
            };
            return {
              ...kanDecision.action,
              aiDecision
            };
          }
        }
        if (!callEvaluator || typeof callEvaluator.evaluateCalls !== 'function') return null;
        const callDecision = callEvaluator.evaluateCalls(runtime, seatKey, availableActions, {
          ...decisionContext,
          difficulty: config.difficulty,
          profile: config.profile,
          policy: resolveDecisionPolicy(config, decisionContext)
        });
        if (!callDecision || !callDecision.action) return null;
        const aiDecision = {
          difficulty: config.difficulty,
          variant: config.variant || null,
          policyId: callDecision.policy && callDecision.policy.id ? callDecision.policy.id : config.policyId,
          reasons: Array.isArray(callDecision.reasons) ? callDecision.reasons.slice() : [],
          metrics: callDecision.metrics ? clone(callDecision.metrics) : null
        };
        if (callDecision.hardCallMetrics) {
          aiDecision.hardCallMetrics = clone(callDecision.hardCallMetrics);
        }
        return {
          ...callDecision.action,
          aiDecision
        };
      }
    };
  }

  return {
    DIFFICULTY_TIERS,
    IMPLEMENTED_DIFFICULTIES,
    normalizeAiConfig,
    createAiController
  };
});
