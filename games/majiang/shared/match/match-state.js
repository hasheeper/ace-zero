(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../core/rule-config'));
    return;
  }
  root.AceMahjongCreateMatchStateHelpers = factory(root.AceMahjongCreateCoreMatchRuleHelpers);
})(typeof globalThis !== 'undefined' ? globalThis : this, function(createCoreMatchRuleHelpersFactory) {
  'use strict';

  const DEFAULT_SEAT_KEYS = ['bottom', 'right', 'top', 'left'];
  const DEFAULT_STARTING_SCORE = 25000;
  const DEFAULT_TARGET_SCORE = 30000;
  const DEFAULT_GAME_LENGTH = 'east-only';
  const DEFAULT_RULESET = 'riichi-4p';
  const coreMatchRuleHelpers = typeof createCoreMatchRuleHelpersFactory === 'function'
    ? createCoreMatchRuleHelpersFactory()
    : null;

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function normalizeSeatKeys(options = {}) {
    return Array.isArray(options.seatKeys) && options.seatKeys.length
      ? options.seatKeys.slice()
      : DEFAULT_SEAT_KEYS.slice();
  }

  function normalizeSeatKey(seatKey, seatKeys) {
    return seatKeys.includes(seatKey) ? seatKey : seatKeys[0];
  }

  function resolveDealerSeat(seatKeys, options = {}) {
    if (options.dealerSeat) {
      return normalizeSeatKey(options.dealerSeat, seatKeys);
    }
    const qijia = Number.isInteger(options.qijia) ? options.qijia : 0;
    const jushu = Number.isInteger(options.jushu) ? options.jushu : 0;
    return normalizeSeatKey(seatKeys[(qijia + jushu) % seatKeys.length] || seatKeys[0], seatKeys);
  }

  function createSeatScoreMap(seatKeys, startingScore) {
    return seatKeys.reduce((result, seatKey) => {
      result[seatKey] = Number(startingScore);
      return result;
    }, {});
  }

  function resolveDefaultTargetScore(ruleset) {
    if (ruleset === 'riichi-3p-sanma') return 40000;
    return DEFAULT_TARGET_SCORE;
  }

  function getWindLabel(zhuangfeng) {
    const labels = ['东', '南', '西', '北'];
    return labels[Number(zhuangfeng)] || '东';
  }

  function getRoundLabel(zhuangfeng, jushu) {
    return `${getWindLabel(zhuangfeng)}${Number(jushu || 0) + 1}局`;
  }

  function createInitialMatchState(options = {}) {
    const seatKeys = normalizeSeatKeys(options);
    const qijia = Number.isInteger(options.qijia) ? options.qijia : 0;
    const dealerSeat = resolveDealerSeat(seatKeys, options);
    const startingScore = Number.isFinite(Number(options.startingScore))
      ? Number(options.startingScore)
      : DEFAULT_STARTING_SCORE;
    const targetScore = Number.isFinite(Number(options.targetScore))
      ? Number(options.targetScore)
      : resolveDefaultTargetScore(options.ruleset || DEFAULT_RULESET);
    const ruleConfig = coreMatchRuleHelpers && typeof coreMatchRuleHelpers.createCoreRuleConfig === 'function'
      ? coreMatchRuleHelpers.createCoreRuleConfig(options.ruleConfig || {})
      : clone(options.ruleConfig || {});
    const gameLength = options.gameLength
      || (coreMatchRuleHelpers && typeof coreMatchRuleHelpers.getGameLength === 'function'
        ? coreMatchRuleHelpers.getGameLength(ruleConfig)
        : DEFAULT_GAME_LENGTH);
    const maxJushu = Number.isInteger(options.maxJushu)
      ? options.maxJushu
      : (coreMatchRuleHelpers && typeof coreMatchRuleHelpers.getInitialMaxJushu === 'function'
        ? coreMatchRuleHelpers.getInitialMaxJushu(ruleConfig, { seatKeys })
        : 3);

    return {
      version: 1,
      ruleset: options.ruleset || DEFAULT_RULESET,
      gameLength,
      seatKeys,
      ruleConfig,
      qijia,
      zhuangfeng: Number.isInteger(options.zhuangfeng) ? options.zhuangfeng : 0,
      jushu: Number.isInteger(options.jushu) ? options.jushu : 0,
      dealerSeat,
      maxJushu,
      targetScore,
      roundIndex: Number.isInteger(options.roundIndex) ? options.roundIndex : 0,
      changbang: Number.isInteger(options.changbang) ? options.changbang : 0,
      lizhibang: Number.isInteger(options.lizhibang) ? options.lizhibang : 0,
      scores: options.scores && typeof options.scores === 'object'
        ? seatKeys.reduce((result, seatKey) => {
            result[seatKey] = Number(options.scores[seatKey] || 0);
            return result;
          }, {})
        : createSeatScoreMap(seatKeys, startingScore),
      roundsPlayed: Array.isArray(options.roundsPlayed) ? clone(options.roundsPlayed) : [],
      finished: Boolean(options.finished),
      finishReason: options.finishReason || null,
      winnerSeat: options.winnerSeat || null
    };
  }

  function appendRoundHistory(matchState, historyEntry) {
    const nextState = clone(matchState);
    nextState.roundsPlayed = Array.isArray(nextState.roundsPlayed) ? nextState.roundsPlayed : [];
    nextState.roundsPlayed.push(clone(historyEntry));
    return nextState;
  }

  function createMatchStateHelpers() {
    return {
      clone,
      normalizeSeatKeys,
      getWindLabel,
      getRoundLabel,
      createInitialMatchState,
      appendRoundHistory
    };
  }

  createMatchStateHelpers.DEFAULT_SEAT_KEYS = DEFAULT_SEAT_KEYS.slice();
  createMatchStateHelpers.DEFAULT_TARGET_SCORE = DEFAULT_TARGET_SCORE;
  createMatchStateHelpers.createInitialMatchState = createInitialMatchState;
  createMatchStateHelpers.getRoundLabel = getRoundLabel;
  createMatchStateHelpers.getWindLabel = getWindLabel;
  createMatchStateHelpers.appendRoundHistory = appendRoundHistory;

  return createMatchStateHelpers;
});
