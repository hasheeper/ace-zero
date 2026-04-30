(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./discard-evaluator'),
      require('./evaluators/call-evaluator')
    );
    return;
  }

  root.AceMahjongBaseAI = factory(
    root.AceMahjongDiscardEvaluator || null,
    root.AceMahjongCallEvaluator || null
  );
})(typeof globalThis !== 'undefined' ? globalThis : this, function(discardEvaluatorApi, callEvaluatorApi) {
  'use strict';

  const DIFFICULTY_TIERS = Object.freeze(['easy', 'normal', 'hard', 'hell']);
  const IMPLEMENTED_DIFFICULTIES = Object.freeze(['easy']);

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function normalizeDifficulty(value) {
    const difficulty = typeof value === 'string' && value ? value.toLowerCase() : 'normal';
    if (difficulty === 'rookie') return 'easy';
    if (difficulty === 'beta') return 'normal';
    if (difficulty === 'master') return 'hard';
    if (DIFFICULTY_TIERS.includes(difficulty)) return difficulty;
    return 'normal';
  }

  function normalizeAiConfig(player = {}, sharedAiConfig = {}) {
    const source = player && typeof player === 'object' ? player : {};
    const aiSource = source.ai && typeof source.ai === 'object' ? source.ai : {};
    const defaultDifficulty = typeof sharedAiConfig.defaultDifficulty === 'string'
      ? sharedAiConfig.defaultDifficulty
      : 'normal';
    const difficulty = normalizeDifficulty(aiSource.difficulty || source.difficulty || defaultDifficulty);

    return {
      enabled: aiSource.enabled !== false && source.human !== true,
      difficulty,
      profile: typeof aiSource.profile === 'string' && aiSource.profile ? aiSource.profile : 'default',
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
        if (!config || !config.enabled || config.difficulty !== 'easy') return null;
        if (!runtime || !runtime.rulesetProfile || runtime.rulesetProfile.id !== 'riichi-4p') return null;
        if (!discardEvaluator || typeof discardEvaluator.evaluateRuntimeDiscard !== 'function') return null;
        return discardEvaluator.evaluateRuntimeDiscard(runtime, seatKey, {
          ...decisionContext,
          difficulty: config.difficulty,
          profile: config.profile
        });
      },
      chooseReaction(seatKey, availableActions = [], decisionContext = {}) {
        const config = seatConfigs.get(seatKey);
        if (!config || !config.enabled || config.difficulty !== 'easy') return null;
        if (!runtime || !runtime.rulesetProfile || runtime.rulesetProfile.id !== 'riichi-4p') return null;
        const huleAction = selectHuleReaction(availableActions);
        if (huleAction) return huleAction;
        if (!callEvaluator || typeof callEvaluator.evaluateCalls !== 'function') return null;
        const callDecision = callEvaluator.evaluateCalls(runtime, seatKey, availableActions, {
          ...decisionContext,
          difficulty: config.difficulty,
          profile: config.profile
        });
        return callDecision && callDecision.action ? callDecision.action : null;
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
