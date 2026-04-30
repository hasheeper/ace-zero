(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./round-continuation'),
      require('./rule-config'),
      require('./transition-case-map')
    );
    return;
  }
  root.AceMahjongCreateCoreSessionAdapter = factory(
    root.AceMahjongCreateRoundContinuationPolicy,
    root.AceMahjongCreateCoreMatchRuleHelpers,
    root.AceMahjongCreateCoreRoundTransitionMatrix
  );
})(typeof globalThis !== 'undefined' ? globalThis : this, function(createRoundContinuationPolicyFactory, createCoreMatchRuleHelpersFactory, createCoreRoundTransitionMatrixFactory) {
  'use strict';

  const DEFAULT_SEAT_KEYS = ['bottom', 'right', 'top', 'left'];
  const roundContinuationPolicy = typeof createRoundContinuationPolicyFactory === 'function'
    ? createRoundContinuationPolicyFactory()
    : null;
  const ABORTIVE_DRAW_REASONS = roundContinuationPolicy && Array.isArray(roundContinuationPolicy.ABORTIVE_DRAW_REASONS)
    ? roundContinuationPolicy.ABORTIVE_DRAW_REASONS.slice()
    : ['九種九牌', '四家立直', '四風連打', '四開槓', '三家和'];
  const EXHAUSTIVE_DRAW_REASONS = roundContinuationPolicy && Array.isArray(roundContinuationPolicy.EXHAUSTIVE_DRAW_REASONS)
    ? roundContinuationPolicy.EXHAUSTIVE_DRAW_REASONS.slice()
    : ['荒牌平局', '流し満貫', 'exhaustive-draw'];
  const coreMatchRuleHelpers = typeof createCoreMatchRuleHelpersFactory === 'function'
    ? createCoreMatchRuleHelpersFactory()
    : null;
  const coreRoundTransitionMatrix = typeof createCoreRoundTransitionMatrixFactory === 'function'
    ? createCoreRoundTransitionMatrixFactory()
    : null;

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function normalizeSeatKeys(options = {}) {
    return Array.isArray(options.seatKeys) && options.seatKeys.length
      ? options.seatKeys.slice()
      : DEFAULT_SEAT_KEYS.slice();
  }

  function getNextSeat(seatKey, seatKeys) {
    const index = seatKeys.indexOf(seatKey);
    if (index < 0) return seatKeys[0] || null;
    return seatKeys[(index + 1) % seatKeys.length] || null;
  }

  function getSeatByIndex(seatKeys, index) {
    return seatKeys[index] || seatKeys[0] || null;
  }

  function isAbortiveDrawReason(reason) {
    return roundContinuationPolicy && typeof roundContinuationPolicy.isAbortiveDrawReason === 'function'
      ? roundContinuationPolicy.isAbortiveDrawReason(reason)
      : ABORTIVE_DRAW_REASONS.includes(String(reason || '').trim());
  }

  function isExhaustiveDrawReason(reason) {
    return roundContinuationPolicy && typeof roundContinuationPolicy.isExhaustiveDrawReason === 'function'
      ? roundContinuationPolicy.isExhaustiveDrawReason(reason)
      : (() => {
          const value = String(reason || '').trim();
          return !value || EXHAUSTIVE_DRAW_REASONS.includes(value);
        })();
  }

  function normalizeDrawKind(reason) {
    return roundContinuationPolicy && typeof roundContinuationPolicy.normalizeDrawKind === 'function'
      ? roundContinuationPolicy.normalizeDrawKind(reason)
      : (isExhaustiveDrawReason(reason) ? 'exhaustive' : 'abortive');
  }

  function shouldDealerContinueOnHule(ruleConfig = {}, winnerIsDealer = false) {
    return roundContinuationPolicy && typeof roundContinuationPolicy.shouldDealerContinueOnHule === 'function'
      ? roundContinuationPolicy.shouldDealerContinueOnHule(ruleConfig, winnerIsDealer)
      : (
        Number(ruleConfig['場数']) !== 0
        && Number(ruleConfig['連荘方式']) > 0
        && Boolean(winnerIsDealer)
      );
  }

  function shouldDealerContinueOnDraw(ruleConfig = {}, context = {}) {
    return roundContinuationPolicy && typeof roundContinuationPolicy.shouldDealerContinueOnDraw === 'function'
      ? roundContinuationPolicy.shouldDealerContinueOnDraw(ruleConfig, context)
      : false;
  }

  function shouldFinishByBankruptcy(ruleConfig = {}, scores = {}) {
    if (ruleConfig['トビ終了あり'] !== true) return false;
    return Object.values(scores || {}).some((value) => Number(value) < 0);
  }

  function getLeadingSeat(scores = {}, options = {}) {
    const seatKeys = normalizeSeatKeys(options);
    const qijia = Number.isInteger(options.qijia) ? options.qijia : 0;
    const targetScore = Number.isFinite(Number(options.targetScore)) ? Number(options.targetScore) : 30000;
    let leadingSeat = null;

    for (let i = 0; i < seatKeys.length; i += 1) {
      const seatKey = getSeatByIndex(seatKeys, (qijia + i) % seatKeys.length);
      if (!seatKey) continue;
      if (Number(scores[seatKey] || 0) < targetScore) continue;
      if (leadingSeat == null || Number(scores[seatKey] || 0) > Number(scores[leadingSeat] || 0)) {
        leadingSeat = seatKey;
      }
    }

    return leadingSeat;
  }

  function getRoundsPerWind(seatKeys = [], ruleConfig = {}) {
    return coreMatchRuleHelpers && typeof coreMatchRuleHelpers.getRoundsPerWind === 'function'
      ? coreMatchRuleHelpers.getRoundsPerWind({
          seatKeys,
          seatCount: Array.isArray(seatKeys) ? seatKeys.length : undefined,
          ruleConfig
        })
      : (
        Array.isArray(seatKeys) && seatKeys.length >= 2 && seatKeys.length <= 4
          ? seatKeys.length
          : 4
      );
  }

  function advanceRoundCoordinate(zhuangfeng, jushu, options = {}) {
    const normalizedWind = Number.isInteger(zhuangfeng) ? zhuangfeng : 0;
    const normalizedJushu = Number.isInteger(jushu) ? jushu : 0;
    const roundsPerWind = getRoundsPerWind(options.seatKeys, options.ruleConfig);
    if (normalizedJushu < roundsPerWind - 1) {
      return {
        zhuangfeng: normalizedWind,
        jushu: normalizedJushu + 1
      };
    }
    return {
      zhuangfeng: normalizedWind + 1,
      jushu: 0
    };
  }

  function resolveRuleConfig(matchState, options = {}) {
    if (matchState && matchState.ruleConfig && typeof matchState.ruleConfig === 'object') {
      return coreMatchRuleHelpers && typeof coreMatchRuleHelpers.createCoreRuleConfig === 'function'
        ? coreMatchRuleHelpers.createCoreRuleConfig(matchState.ruleConfig)
        : clone(matchState.ruleConfig);
    }
    if (coreMatchRuleHelpers && typeof coreMatchRuleHelpers.createCoreRuleConfig === 'function') {
      return coreMatchRuleHelpers.createCoreRuleConfig(options.ruleConfig || {});
    }
    return clone(options.ruleConfig || {});
  }

  function getHuleWinnerSeats(roundResult) {
    if (!roundResult || roundResult.type !== 'hule') return [];
    if (Array.isArray(roundResult.winners) && roundResult.winners.length) {
      return roundResult.winners
        .map((entry) => entry && entry.winnerSeat ? entry.winnerSeat : null)
        .filter(Boolean);
    }
    return roundResult.winnerSeat ? [roundResult.winnerSeat] : [];
  }

  function resolveTransitionContext(matchState, roundResult, options = {}) {
    const seatKeys = normalizeSeatKeys({
      seatKeys: matchState && Array.isArray(matchState.seatKeys) ? matchState.seatKeys : options.seatKeys
    });
    const currentDealerSeat = matchState && matchState.dealerSeat ? matchState.dealerSeat : seatKeys[0];
    const roundType = roundResult && roundResult.type ? roundResult.type : null;
    const ruleConfig = resolveRuleConfig(matchState, options);
    const winnerSeats = getHuleWinnerSeats(roundResult);
    const transitionCase = coreRoundTransitionMatrix && typeof coreRoundTransitionMatrix.resolveTransitionCase === 'function'
      ? coreRoundTransitionMatrix.resolveTransitionCase(roundResult, { currentDealerSeat })
      : null;
    const drawKind = (
      roundType === 'draw'
        ? (
          coreRoundTransitionMatrix && typeof coreRoundTransitionMatrix.normalizeDrawKind === 'function'
            ? coreRoundTransitionMatrix.normalizeDrawKind(roundResult.reason)
            : normalizeDrawKind(roundResult.reason)
        )
        : null
    );

    let dealerContinues = false;
    if (roundType === 'hule') {
      dealerContinues = shouldDealerContinueOnHule(
        ruleConfig,
        winnerSeats.includes(currentDealerSeat)
      );
    } else if (roundType === 'draw') {
      const tenpaiSeats = Array.isArray(roundResult && roundResult.tenpaiSeats)
        ? roundResult.tenpaiSeats
        : [];
      dealerContinues = shouldDealerContinueOnDraw(ruleConfig, {
        reason: roundResult && roundResult.reason,
        dealerTenpai: tenpaiSeats.includes(currentDealerSeat)
      });
    }

    const roundAdvances = !dealerContinues;
    const advancedCoordinate = roundAdvances
      ? advanceRoundCoordinate(matchState && matchState.zhuangfeng, matchState && matchState.jushu, {
          seatKeys,
          ruleConfig
        })
      : {
          zhuangfeng: Number(matchState && matchState.zhuangfeng || 0),
          jushu: Number(matchState && matchState.jushu || 0)
        };

    return {
      seatKeys,
      currentDealerSeat,
      roundType,
      ruleConfig,
      winnerSeats,
      drawKind,
      dealerContinues,
      roundAdvances,
      nextDealerSeat: dealerContinues ? currentDealerSeat : getNextSeat(currentDealerSeat, seatKeys),
      nextZhuangfeng: advancedCoordinate.zhuangfeng,
      nextJushu: advancedCoordinate.jushu,
      noGame: Boolean(roundType === 'draw' && drawKind === 'abortive'),
      transitionCase
    };
  }

  function resolveCarryState(matchState, roundResult, transitionContext) {
    const changbangBefore = Number(matchState && matchState.changbang || 0);
    const lizhibangBefore = Number(matchState && matchState.lizhibang || 0);
    return {
      changbangBefore,
      changbangAfter: transitionContext.dealerContinues ? changbangBefore + 1 : 0,
      lizhibangBefore,
      lizhibangAfter: transitionContext.roundType === 'hule'
        ? 0
        : Number(
          roundResult && roundResult.lizhibang != null
            ? roundResult.lizhibang
            : lizhibangBefore
        )
    };
  }

  function resolveGameEnd(matchState, scoresAfter, transitionContext) {
    const seatKeys = transitionContext.seatKeys || DEFAULT_SEAT_KEYS;
    const maxJushuBefore = Number.isInteger(matchState && matchState.maxJushu)
      ? matchState.maxJushu
      : (coreMatchRuleHelpers && typeof coreMatchRuleHelpers.getInitialMaxJushu === 'function'
        ? coreMatchRuleHelpers.getInitialMaxJushu(transitionContext.ruleConfig, { seatKeys })
        : 3);
    const qijia = Number.isInteger(matchState && matchState.qijia) ? matchState.qijia : 0;
    const targetScore = Number.isFinite(Number(matchState && matchState.targetScore))
      ? Number(matchState.targetScore)
      : 30000;
    const roundsPerWind = getRoundsPerWind(seatKeys, transitionContext.ruleConfig);
    const sumJushu = coreMatchRuleHelpers && typeof coreMatchRuleHelpers.getSumJushu === 'function'
      ? coreMatchRuleHelpers.getSumJushu(transitionContext.nextZhuangfeng, transitionContext.nextJushu, { seatKeys })
      : Number(transitionContext.nextZhuangfeng || 0) * roundsPerWind + Number(transitionContext.nextJushu || 0);
    const currentDealerSeat = transitionContext.currentDealerSeat || getSeatByIndex(seatKeys, 0);
    const leadingSeat = getLeadingSeat(scoresAfter, { seatKeys, qijia, targetScore });
    let maxJushuAfter = maxJushuBefore;
    let gameFinished = false;
    let finishReason = null;

    if (shouldFinishByBankruptcy(transitionContext.ruleConfig, scoresAfter)) {
      return {
        gameFinished: true,
        finishReason: 'bankruptcy',
        maxJushuBefore,
        maxJushuAfter,
        leaderSeatAfter: leadingSeat
      };
    }

    if ((roundsPerWind * 4 - 1) < sumJushu) {
      gameFinished = true;
      finishReason = 'hard-limit';
    } else if (((Number(transitionContext.ruleConfig['場数']) + 1) * roundsPerWind - 1) < sumJushu) {
      gameFinished = true;
      finishReason = 'schedule-complete';
    } else if (maxJushuAfter < sumJushu) {
      if (Number(transitionContext.ruleConfig['延長戦方式']) === 0) {
        gameFinished = true;
        finishReason = 'extension-disabled';
      } else if (Number(transitionContext.ruleConfig['場数']) === 0) {
        gameFinished = true;
        finishReason = 'single-round-complete';
      } else if (leadingSeat) {
        gameFinished = true;
        finishReason = 'leader-over-target';
      } else {
        maxJushuAfter += Number(transitionContext.ruleConfig['延長戦方式']) === 3 ? roundsPerWind
          : Number(transitionContext.ruleConfig['延長戦方式']) === 2 ? 1
          : 0;
      }
    } else if (maxJushuAfter === sumJushu) {
      if (transitionContext.ruleConfig['オーラス止めあり'] && leadingSeat === currentDealerSeat
        && transitionContext.dealerContinues === true
        && transitionContext.noGame !== true) {
        gameFinished = true;
        finishReason = 'dealer-stop';
      }
    }

    return {
      gameFinished,
      finishReason,
      maxJushuBefore,
      maxJushuAfter,
      leaderSeatAfter: leadingSeat
    };
  }

  function createCoreSessionAdapter() {
    return {
      clone,
      normalizeSeatKeys,
      resolveRuleConfig,
      getHuleWinnerSeats,
      normalizeDrawKind,
      resolveTransitionContext,
      resolveCarryState,
      resolveGameEnd
    };
  }

  createCoreSessionAdapter.resolveTransitionContext = resolveTransitionContext;
  createCoreSessionAdapter.resolveCarryState = resolveCarryState;
  createCoreSessionAdapter.resolveGameEnd = resolveGameEnd;

  return createCoreSessionAdapter;
});
