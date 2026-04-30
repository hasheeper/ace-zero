(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./base-ai'),
      require('./contracts/ai-input'),
      require('./contracts/ai-output'),
      require('./difficulty/easy-policy'),
      require('./difficulty/normal-policy'),
      require('./difficulty/hard-policy'),
      require('./profiles/default'),
      require('./special/mode-2p'),
      require('./special/mode-3p'),
      require('./special/mode-4p')
    );
    return;
  }

  root.AceMahjongAiController = factory(
    root.AceMahjongBaseAI || null,
    root.AceMahjongAiInputContracts || null,
    root.AceMahjongAiOutputContracts || null,
    root.AceMahjongEasyDifficultyPolicy || null,
    root.AceMahjongNormalDifficultyPolicy || null,
    root.AceMahjongHardDifficultyPolicy || null,
    root.AceMahjongDefaultAiProfile || null,
    root.AceMahjongMode2pSpecialAi || null,
    root.AceMahjongMode3pSpecialAi || null,
    root.AceMahjongMode4pSpecialAi || null
  );
})(typeof globalThis !== 'undefined' ? globalThis : this, function(
  legacyBaseAiApi,
  aiInputApi,
  aiOutputApi,
  easyPolicyApi,
  normalPolicyApi,
  hardPolicyApi,
  defaultProfileApi,
  mode2pApi,
  mode3pApi,
  mode4pApi
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

  function normalizeProfile(value) {
    if (value && typeof value === 'object') return clone(value);
    if (defaultProfileApi && typeof defaultProfileApi.createDefaultProfile === 'function') {
      return defaultProfileApi.createDefaultProfile();
    }
    return {
      id: 'default',
      speedWeight: 1,
      valueWeight: 1,
      safetyWeight: 1,
      riichiAggression: 1,
      meldAggression: 1,
      pushThreshold: 0,
      foldThreshold: 0,
      skillUsageBias: 0,
      antiSkillReserve: 0,
      randomness: 0
    };
  }

  function getDifficultyPolicy(difficulty) {
    if (difficulty === 'easy' && easyPolicyApi && typeof easyPolicyApi.createEasyPolicy === 'function') {
      return easyPolicyApi.createEasyPolicy();
    }
    if (difficulty === 'hard' && hardPolicyApi && typeof hardPolicyApi.createHardPolicy === 'function') {
      return hardPolicyApi.createHardPolicy();
    }
    if (difficulty === 'hell' && hardPolicyApi && typeof hardPolicyApi.createHardPolicy === 'function') {
      return {
        ...hardPolicyApi.createHardPolicy(),
        id: 'hell',
        enableHellAdapters: true
      };
    }
    if (normalPolicyApi && typeof normalPolicyApi.createNormalPolicy === 'function') {
      return normalPolicyApi.createNormalPolicy();
    }
    return { id: 'normal' };
  }

  function getModeAdapter(runtime) {
    const profile = runtime && runtime.rulesetProfile ? runtime.rulesetProfile : null;
    const tableSize = Number(profile && (profile.tableSize || profile.seatCount) || runtime && runtime.tableSize || 4);
    if (tableSize === 2 && mode2pApi && typeof mode2pApi.createMode2pAdapter === 'function') {
      return mode2pApi.createMode2pAdapter();
    }
    if (tableSize === 3 && mode3pApi && typeof mode3pApi.createMode3pAdapter === 'function') {
      return mode3pApi.createMode3pAdapter();
    }
    if (mode4pApi && typeof mode4pApi.createMode4pAdapter === 'function') {
      return mode4pApi.createMode4pAdapter();
    }
    return null;
  }

  function buildDecisionInput(runtime, seatKey, options = {}) {
    if (aiInputApi && typeof aiInputApi.createAiInput === 'function') {
      return aiInputApi.createAiInput({
        runtime,
        seatKey,
        ...options
      });
    }
    return {
      seatKey,
      availableActions: Array.isArray(options.availableActions) ? options.availableActions.slice() : [],
      view: options.view || null,
      difficulty: options.difficulty || 'normal',
      profile: clone(options.profile || null)
    };
  }

  function normalizeDecisionOutput(output) {
    if (aiOutputApi && typeof aiOutputApi.normalizeAiOutput === 'function') {
      return aiOutputApi.normalizeAiOutput(output);
    }
    return output || null;
  }

  function createAiController(runtime, options = {}) {
    if (legacyBaseAiApi && typeof legacyBaseAiApi.createAiController === 'function') {
      return legacyBaseAiApi.createAiController(runtime, options);
    }

    const modeAdapter = getModeAdapter(runtime);
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

    seatKeys.forEach((seatKey, index) => {
      const player = playersBySeat.get(seatKey) || players[index] || {};
      const aiSource = player && player.ai && typeof player.ai === 'object' ? player.ai : {};
      const defaultDifficulty = typeof sharedAiConfig.defaultDifficulty === 'string'
        ? sharedAiConfig.defaultDifficulty
        : 'normal';
      seatConfigs.set(seatKey, {
        enabled: aiSource.enabled !== false && player.human !== true,
        difficulty: normalizeDifficulty(aiSource.difficulty || player.difficulty || defaultDifficulty),
        profile: typeof aiSource.profile === 'string' && aiSource.profile ? aiSource.profile : 'default'
      });
    });

    function getSeatRuntimeConfig(seatKey) {
      return clone(seatConfigs.get(seatKey) || {
        enabled: false,
        difficulty: 'normal',
        profile: 'default'
      });
    }

    return {
      difficultyTiers: ['easy', 'normal', 'hard', 'hell'],
      implementedDifficulties: [],
      getSeatConfig(seatKey) {
        const seatConfig = getSeatRuntimeConfig(seatKey);
        const difficulty = normalizeDifficulty(seatConfig.difficulty);
        return {
          ...clone(seatConfig),
          difficulty,
          difficultyPolicy: getDifficultyPolicy(difficulty),
          profileConfig: normalizeProfile(seatConfig.profile)
        };
      },
      isAiSeat(seatKey) {
        const config = seatConfigs.get(seatKey);
        return Boolean(config && config.enabled);
      },
      chooseDiscard(seatKey, optionsForDecision = {}) {
        if (!this.isAiSeat(seatKey)) return null;
        const seatConfig = this.getSeatConfig(seatKey);
        const input = buildDecisionInput(runtime, seatKey, {
          ...optionsForDecision,
          difficulty: seatConfig.difficulty,
          profile: seatConfig.profileConfig
        });
        if (modeAdapter && typeof modeAdapter.adjustDiscardDecision === 'function') {
          modeAdapter.adjustDiscardDecision(null, input, seatConfig);
        }
        return null;
      },
      chooseReaction(seatKey, availableActions = [], optionsForDecision = {}) {
        if (!this.isAiSeat(seatKey)) return null;
        const seatConfig = this.getSeatConfig(seatKey);
        const input = buildDecisionInput(runtime, seatKey, {
          ...optionsForDecision,
          availableActions,
          difficulty: seatConfig.difficulty,
          profile: seatConfig.profileConfig
        });
        if (modeAdapter && typeof modeAdapter.adjustReactionDecision === 'function') {
          modeAdapter.adjustReactionDecision(null, input, seatConfig);
        }
        return null;
      }
    };
  }

  return {
    createAiController
  };
});
