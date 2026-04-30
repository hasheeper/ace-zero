(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('../../../../shared/match/match-state'),
      require('../../../../shared/match/round-transition'),
      require('../../../../engine/base/ruleset-profile')
    );
    return;
  }
  root.AceMahjongCreateBrowserGameSessionRuntime = factory(
    root.AceMahjongCreateMatchStateHelpers,
    root.AceMahjongCreateRoundTransitionHelpers,
    root.AceMahjongRulesetProfile
  );
})(typeof globalThis !== 'undefined' ? globalThis : this, function(createMatchStateHelpersFactory, createRoundTransitionHelpersFactory, rulesetProfileApi) {
  'use strict';

  const CANONICAL_SEAT_ORDER = ['bottom', 'right', 'top', 'left'];
  const matchStateHelpers = typeof createMatchStateHelpersFactory === 'function'
    ? createMatchStateHelpersFactory()
    : null;
  const roundTransitionHelpers = typeof createRoundTransitionHelpersFactory === 'function'
    ? createRoundTransitionHelpersFactory()
    : null;

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function getActiveSeatKeys(config = {}) {
    const players = Array.isArray(config.players) ? config.players : [];
    const configuredSeats = players
      .filter((player) => player && typeof player === 'object' && typeof player.seat === 'string')
      .map((player) => player.seat)
      .filter((seatKey, index, list) => CANONICAL_SEAT_ORDER.includes(seatKey) && list.indexOf(seatKey) === index);
    if (configuredSeats.length) {
      return CANONICAL_SEAT_ORDER.filter((seatKey) => configuredSeats.includes(seatKey));
    }

    const tableSize = Number(config.tableSize);
    if (tableSize === 2) return ['bottom', 'top'];
    if (tableSize === 3) return ['bottom', 'right', 'left'];
    return CANONICAL_SEAT_ORDER.slice();
  }

  function createDefaultScores(config = {}) {
    const players = Array.isArray(config.players) ? config.players : [];
    const roundDefen = config.round && Array.isArray(config.round.defen) ? config.round.defen : null;
    const seatOrder = getActiveSeatKeys(config);
    return seatOrder.reduce((result, seatKey, index) => {
      const player = players.find((entry) => entry && entry.seat === seatKey) || {};
      const roundSeatIndex = CANONICAL_SEAT_ORDER.indexOf(seatKey);
      const roundScore = roundDefen && roundSeatIndex >= 0 && roundDefen[roundSeatIndex] != null
        ? roundDefen[roundSeatIndex]
        : null;
      result[seatKey] = player.score != null && Number.isFinite(Number(player.score))
        ? Number(player.score)
        : (roundScore != null && Number.isFinite(Number(roundScore)))
          ? Number(roundScore)
          : 25000;
      return result;
    }, {});
  }

  function buildInitialMatchState(config = {}) {
    if (!matchStateHelpers || typeof matchStateHelpers.createInitialMatchState !== 'function') {
      throw new Error('AceMahjongCreateMatchStateHelpers is required before browser-game-session-runtime.js');
    }
    const seatKeys = getActiveSeatKeys(config);
    const rulesetProfile = rulesetProfileApi && typeof rulesetProfileApi.getRulesetProfile === 'function'
      ? rulesetProfileApi.getRulesetProfile({
          id: config.ruleset,
          tableSize: config.tableSize || seatKeys.length
        })
      : null;
    const normalizedRuleConfig = rulesetProfileApi && typeof rulesetProfileApi.normalizeFriendlyRuleConfig === 'function'
      ? rulesetProfileApi.normalizeFriendlyRuleConfig(config, rulesetProfile)
      : {
          ruleOverrides: config.ruleOverrides && typeof config.ruleOverrides === 'object' ? clone(config.ruleOverrides) : {},
          customRuleConfig: { shibariMinYakuHan: 1 }
        };
    return matchStateHelpers.createInitialMatchState({
      ruleset: config.ruleset || 'riichi-4p',
      seatKeys,
      gameLength: typeof config.gameLength === 'string' && config.gameLength
        ? config.gameLength
        : null,
      targetScore: Number.isFinite(Number(config.targetScore))
        ? Number(config.targetScore)
        : (rulesetProfile && Number.isFinite(Number(rulesetProfile.targetScore))
          ? Number(rulesetProfile.targetScore)
          : null),
      qijia: config.round && Number.isInteger(config.round.qijia) ? config.round.qijia : 0,
      zhuangfeng: config.round && Number.isInteger(config.round.zhuangfeng) ? config.round.zhuangfeng : 0,
      jushu: config.round && Number.isInteger(config.round.jushu) ? config.round.jushu : 0,
      changbang: config.round && Number.isInteger(config.round.changbang) ? config.round.changbang : 0,
      lizhibang: config.round && Number.isInteger(config.round.lizhibang) ? config.round.lizhibang : 0,
      scores: createDefaultScores(config),
      ruleConfig: normalizedRuleConfig.ruleOverrides || {}
    });
  }

  function buildHistoryEntry(matchState, decision, roundResult) {
    return {
      roundIndex: Number(matchState.roundIndex || 0),
      roundLabel: decision.roundLabelBefore,
      zhuangfeng: Number(matchState.zhuangfeng || 0),
      jushu: Number(matchState.jushu || 0),
      dealerSeat: matchState.dealerSeat || null,
      roundResult: clone(roundResult),
      scoresBefore: clone(decision.scoresBefore || {}),
      scoresAfter: clone(decision.scoresAfter || {}),
      changbangBefore: Number(decision.changbangBefore || 0),
      changbangAfter: Number(decision.changbangAfter || 0),
      lizhibangBefore: Number(decision.lizhibangBefore || 0),
      lizhibangAfter: Number(decision.lizhibangAfter || 0),
      dealerContinues: Boolean(decision.dealerContinues),
      nextDealerSeat: decision.nextDealerSeat || null,
      nextZhuangfeng: Number(decision.nextZhuangfeng || 0),
      nextJushu: Number(decision.nextJushu || 0),
      transitionCase: decision.transitionCase || null,
      finishReason: decision.finishReason || null
    };
  }

  function createBrowserGameSessionRuntime(options = {}) {
    if (!roundTransitionHelpers || typeof roundTransitionHelpers.resolveRoundTransition !== 'function') {
      throw new Error('AceMahjongCreateRoundTransitionHelpers is required before browser-game-session-runtime.js');
    }
    if (typeof options.createChildRuntime !== 'function') {
      throw new TypeError('createBrowserGameSessionRuntime requires createChildRuntime(config).');
    }

    const baseConfig = clone(options.config || {});
    const extensionManager = options.extensionManager && typeof options.extensionManager.runHook === 'function'
      ? options.extensionManager
      : null;
    let matchState = buildInitialMatchState(baseConfig);
    let currentRuntime = null;
    let unsubscribeCurrentRuntime = null;
    let pendingRoundResult = null;
    const listeners = new Set();
    const eventLog = [];
    let lastEvent = null;

    function emit(type, payload = {}, meta = {}, snapshot = null) {
      const event = {
        type,
        payload,
        snapshot,
        timestamp: Date.now(),
        meta: {
          source: 'browser-game-session-runtime',
          ...meta
        }
      };
      lastEvent = clone(event);
      eventLog.push(lastEvent);
      listeners.forEach((listener) => {
        try {
          listener(lastEvent);
        } catch (error) {
          console.error('[BrowserGameSessionRuntime] listener error', error);
        }
      });
      return lastEvent;
    }

    function subscribeToCurrentRuntime(runtime) {
      if (!runtime || typeof runtime.subscribe !== 'function') return () => {};
      return runtime.subscribe((event) => {
        if (event && event.payload && event.payload.roundResult) {
          pendingRoundResult = clone(event.payload.roundResult);
        }
        const forwardedSnapshot = event && event.snapshot
          ? clone(event.snapshot)
          : (runtime && typeof runtime.getSnapshot === 'function' ? runtime.getSnapshot() : null);
        emit(event && event.type ? event.type : 'runtime:event', {
          ...(event && event.payload ? clone(event.payload) : {}),
          matchState: clone(matchState)
        }, event && event.meta ? clone(event.meta) : {}, forwardedSnapshot);
      });
    }

    async function createAndBindChildRuntime(runtimeConfig) {
      if (typeof unsubscribeCurrentRuntime === 'function') {
        unsubscribeCurrentRuntime();
        unsubscribeCurrentRuntime = null;
      }
      if (currentRuntime && typeof currentRuntime.clearAutoTurnTimer === 'function') {
        currentRuntime.clearAutoTurnTimer();
      }
      currentRuntime = await Promise.resolve(options.createChildRuntime(runtimeConfig));
      unsubscribeCurrentRuntime = subscribeToCurrentRuntime(currentRuntime);
      return currentRuntime;
    }

    function buildRuntimeConfigFromMatchState(state) {
      const nextRoundConfig = roundTransitionHelpers.buildNextRoundConfig(state, {
        nextZhuangfeng: state.zhuangfeng,
        nextJushu: state.jushu,
        changbangAfter: state.changbang,
        lizhibangAfter: state.lizhibang,
        scoresAfter: state.scores
      });
      const extensionResult = extensionManager
        ? extensionManager.runHook('beforeNextRoundConfigBuild', {
            roundConfig: clone(nextRoundConfig),
            matchState: clone(state)
          }, {
            ruleset: baseConfig.ruleset || 'riichi-4p',
            advancedMode: Boolean(baseConfig.advancedMode),
            seatKeys: Array.isArray(state && state.seatKeys) ? state.seatKeys.slice() : null,
            matchState: state,
            roundState: nextRoundConfig,
            meta: {
              stage: 'next-round-config'
            }
          })
        : null;
      const patchedRoundConfig = extensionResult && extensionResult.result && extensionResult.result.roundConfigPatch
        ? {
            ...nextRoundConfig,
            ...clone(extensionResult.result.roundConfigPatch)
          }
        : nextRoundConfig;
      return {
        ...clone(baseConfig),
        extensionManager,
        mode: 'single-round',
        round: {
          ...(baseConfig.round || {}),
          qijia: Number.isInteger(state.qijia) ? state.qijia : 0,
          zhuangfeng: patchedRoundConfig.zhuangfeng,
          jushu: patchedRoundConfig.jushu,
          changbang: patchedRoundConfig.changbang,
          lizhibang: patchedRoundConfig.lizhibang,
          defen: patchedRoundConfig.defen
        }
      };
    }

    async function startSession() {
      const runtime = await createAndBindChildRuntime(buildRuntimeConfigFromMatchState(matchState));
      pendingRoundResult = null;
      emit('session:round-start', {
        matchState: clone(matchState),
        round: clone(runtime && runtime.round ? runtime.round : null)
      }, {}, runtime && typeof runtime.getSnapshot === 'function' ? runtime.getSnapshot() : null);
      if (runtime && typeof runtime.startSession === 'function') {
        return runtime.startSession();
      }
      if (runtime && typeof runtime.start === 'function') {
        return runtime.start();
      }
      return null;
    }

    async function continueToNextRound(options = {}) {
      if (!pendingRoundResult) return null;
      const decision = roundTransitionHelpers.resolveRoundTransition(matchState, pendingRoundResult);
      const historyEntry = buildHistoryEntry(matchState, decision, pendingRoundResult);
      if (matchStateHelpers && typeof matchStateHelpers.appendRoundHistory === 'function') {
        matchState = matchStateHelpers.appendRoundHistory(matchState, historyEntry);
      }
      matchState = roundTransitionHelpers.applyTransitionToMatchState(matchState, decision);
      emit('session:transition', {
        roundResult: clone(pendingRoundResult),
        transitionDecision: clone(decision),
        matchState: clone(matchState)
      }, {}, currentRuntime && typeof currentRuntime.getSnapshot === 'function' ? currentRuntime.getSnapshot() : null);
      pendingRoundResult = null;

      if (decision.gameFinished) {
      emit('session:finished', {
          finishReason: decision.finishReason || null,
          matchState: clone(matchState)
        }, {}, currentRuntime && typeof currentRuntime.getSnapshot === 'function' ? currentRuntime.getSnapshot() : null);
        return null;
      }

      const runtime = await createAndBindChildRuntime(buildRuntimeConfigFromMatchState(matchState));
      emit('session:round-start', {
        matchState: clone(matchState),
        round: clone(runtime && runtime.round ? runtime.round : null)
      }, {}, runtime && typeof runtime.getSnapshot === 'function' ? runtime.getSnapshot() : null);
      const startDelayMs = Number.isFinite(Number(options.startDelayMs))
        ? Math.max(0, Number(options.startDelayMs))
        : 0;
      if (startDelayMs > 0) {
        await new Promise((resolve) => {
          window.setTimeout(resolve, startDelayMs);
        });
      }
      const startResult = runtime && typeof runtime.startSession === 'function'
        ? runtime.startSession()
        : (runtime && typeof runtime.start === 'function' ? runtime.start() : null);
      return startResult;
    }

    return {
      kind: 'browser-game-session-runtime',
      source: 'browser-game-session-runtime',
      engineSource: 'majiang-core',
      mode: 'match',
      config: baseConfig,
      getMatchState() {
        return clone(matchState);
      },
      getRoundResult() {
        return clone(pendingRoundResult);
      },
      getRuntime() {
        return currentRuntime;
      },
      getEventLog() {
        return eventLog.slice();
      },
      getLastEvent() {
        return lastEvent ? clone(lastEvent) : null;
      },
      getSnapshot() {
        return currentRuntime && typeof currentRuntime.getSnapshot === 'function'
          ? currentRuntime.getSnapshot()
          : null;
      },
      subscribe(listener) {
        if (typeof listener !== 'function') return function() {};
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      dispatch(action) {
        return currentRuntime && typeof currentRuntime.dispatch === 'function'
          ? currentRuntime.dispatch(action)
          : null;
      },
      canDiscardHandTileAtIndex(seatKey, tileIndex) {
        return currentRuntime && typeof currentRuntime.canDiscardHandTileAtIndex === 'function'
          ? currentRuntime.canDiscardHandTileAtIndex(seatKey, tileIndex)
          : false;
      },
      clearAutoTurnTimer() {
        if (currentRuntime && typeof currentRuntime.clearAutoTurnTimer === 'function') {
          currentRuntime.clearAutoTurnTimer();
        }
      },
      startSession,
      start: startSession,
      continueToNextRound
    };
  }

  return createBrowserGameSessionRuntime;
});
