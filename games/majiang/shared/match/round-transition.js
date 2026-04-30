(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./match-state'),
      require('../core/session-adapter')
    );
    return;
  }
  root.AceMahjongCreateRoundTransitionHelpers = factory(
    root.AceMahjongCreateMatchStateHelpers,
    root.AceMahjongCreateCoreSessionAdapter
  );
})(typeof globalThis !== 'undefined' ? globalThis : this, function(createMatchStateHelpersFactory, createCoreSessionAdapterFactory) {
  'use strict';

  const matchStateHelpers = typeof createMatchStateHelpersFactory === 'function'
    ? createMatchStateHelpersFactory()
    : null;
  const coreSessionAdapter = typeof createCoreSessionAdapterFactory === 'function'
    ? createCoreSessionAdapterFactory()
    : null;

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function getSeatKeys(matchState, options = {}) {
    if (coreSessionAdapter && typeof coreSessionAdapter.normalizeSeatKeys === 'function') {
      return coreSessionAdapter.normalizeSeatKeys({
        seatKeys: matchState && Array.isArray(matchState.seatKeys) ? matchState.seatKeys : options.seatKeys
      });
    }
    if (matchStateHelpers && typeof matchStateHelpers.normalizeSeatKeys === 'function') {
      return matchStateHelpers.normalizeSeatKeys(options);
    }
    return ['bottom', 'right', 'top', 'left'];
  }

  function normalizeScoreMap(matchState, roundResult, seatKeys) {
    const scoresAfterSource = roundResult && roundResult.scores && typeof roundResult.scores === 'object'
      ? roundResult.scores
      : {};
    const scoresBeforeSource = matchState && matchState.scores && typeof matchState.scores === 'object'
      ? matchState.scores
      : {};

    const scoresBefore = {};
    const scoresAfter = {};
    seatKeys.forEach((seatKey) => {
      scoresBefore[seatKey] = Number(scoresBeforeSource[seatKey] || 0);
      scoresAfter[seatKey] = Number(scoresAfterSource[seatKey] || scoresBefore[seatKey] || 0);
    });
    return {
      scoresBefore,
      scoresAfter
    };
  }

  function resolveRoundTransition(matchState, roundResult, options = {}) {
    if (!coreSessionAdapter || typeof coreSessionAdapter.resolveTransitionContext !== 'function') {
      throw new Error('AceMahjongCreateCoreSessionAdapter is required before match/round-transition.js');
    }

    const seatKeys = getSeatKeys(matchState, options);
    const roundType = roundResult && roundResult.type ? roundResult.type : null;
    const { scoresBefore, scoresAfter } = normalizeScoreMap(matchState, roundResult, seatKeys);
    const ruleConfig = typeof coreSessionAdapter.resolveRuleConfig === 'function'
      ? coreSessionAdapter.resolveRuleConfig(matchState, options)
      : clone((matchState && matchState.ruleConfig) || options.ruleConfig || {});
    const transitionContext = coreSessionAdapter.resolveTransitionContext(matchState, roundResult, { seatKeys, ruleConfig });
    const carryState = coreSessionAdapter.resolveCarryState(matchState, roundResult, transitionContext);
    const gameEnd = coreSessionAdapter.resolveGameEnd(matchState, scoresAfter, transitionContext);

    return {
      roundEnded: true,
      roundType,
      drawKind: transitionContext.drawKind,
      transitionCase: transitionContext.transitionCase,
      noGame: Boolean(transitionContext.noGame),
      roundLabelBefore: matchStateHelpers && typeof matchStateHelpers.getRoundLabel === 'function'
        ? matchStateHelpers.getRoundLabel(matchState && matchState.zhuangfeng, matchState && matchState.jushu)
        : `${Number(matchState && matchState.zhuangfeng || 0)}-${Number(matchState && matchState.jushu || 0)}`,
      dealerSeatBefore: transitionContext.currentDealerSeat,
      dealerContinues: Boolean(transitionContext.dealerContinues),
      roundAdvances: Boolean(transitionContext.roundAdvances),
      changbangBefore: carryState.changbangBefore,
      changbangAfter: carryState.changbangAfter,
      lizhibangBefore: carryState.lizhibangBefore,
      lizhibangAfter: carryState.lizhibangAfter,
      scoresBefore,
      scoresAfter,
      nextDealerSeat: transitionContext.nextDealerSeat,
      nextZhuangfeng: transitionContext.nextZhuangfeng,
      nextJushu: transitionContext.nextJushu,
      nextRoundIndex: Number(matchState && matchState.roundIndex || 0) + 1,
      gameFinished: Boolean(gameEnd.gameFinished),
      finishReason: gameEnd.finishReason || null,
      maxJushuBefore: gameEnd.maxJushuBefore,
      maxJushuAfter: gameEnd.maxJushuAfter,
      leaderSeatAfter: gameEnd.leaderSeatAfter || null
    };
  }

  function applyTransitionToMatchState(matchState, transitionDecision) {
    const nextState = clone(matchState);
    nextState.zhuangfeng = Number(transitionDecision.nextZhuangfeng || 0);
    nextState.jushu = Number(transitionDecision.nextJushu || 0);
    nextState.dealerSeat = transitionDecision.nextDealerSeat || nextState.dealerSeat;
    nextState.ruleConfig = typeof coreSessionAdapter.resolveRuleConfig === 'function'
      ? coreSessionAdapter.resolveRuleConfig(matchState, {})
      : clone(nextState.ruleConfig || {});
    nextState.roundIndex = Number(transitionDecision.nextRoundIndex || nextState.roundIndex || 0);
    nextState.maxJushu = Number.isInteger(transitionDecision.maxJushuAfter)
      ? transitionDecision.maxJushuAfter
      : nextState.maxJushu;
    nextState.changbang = Number(transitionDecision.changbangAfter || 0);
    nextState.lizhibang = Number(transitionDecision.lizhibangAfter || 0);
    nextState.scores = clone(transitionDecision.scoresAfter || nextState.scores || {});
    nextState.finished = Boolean(transitionDecision.gameFinished);
    nextState.finishReason = transitionDecision.finishReason || null;
    nextState.winnerSeat = transitionDecision.leaderSeatAfter || null;
    return nextState;
  }

  function buildNextRoundConfig(matchState, transitionDecision) {
    const source = transitionDecision || {};
    const state = matchState || {};
    return {
      zhuangfeng: Number(source.nextZhuangfeng != null ? source.nextZhuangfeng : state.zhuangfeng || 0),
      jushu: Number(source.nextJushu != null ? source.nextJushu : state.jushu || 0),
      changbang: Number(source.changbangAfter != null ? source.changbangAfter : state.changbang || 0),
      lizhibang: Number(source.lizhibangAfter != null ? source.lizhibangAfter : state.lizhibang || 0),
      defen: Array.isArray(state.seatKeys) && state.seatKeys.length
        ? state.seatKeys.map((seatKey) => Number(
          source.scoresAfter && source.scoresAfter[seatKey] != null
            ? source.scoresAfter[seatKey]
            : (state.scores && state.scores[seatKey] != null ? state.scores[seatKey] : 0)
        ))
        : []
    };
  }

  function createRoundTransitionHelpers() {
    return {
      clone,
      resolveRoundTransition,
      applyTransitionToMatchState,
      buildNextRoundConfig
    };
  }

  createRoundTransitionHelpers.resolveRoundTransition = resolveRoundTransition;
  createRoundTransitionHelpers.applyTransitionToMatchState = applyTransitionToMatchState;
  createRoundTransitionHelpers.buildNextRoundConfig = buildNextRoundConfig;

  return createRoundTransitionHelpers;
});
