(function(global) {
  'use strict';

  const CANONICAL_SEAT_KEYS = ['bottom', 'right', 'top', 'left'];

  function resolvePerspectiveSeat(runtime, options = {}) {
    if (options && typeof options.perspectiveSeat === 'string') return options.perspectiveSeat;
    const snapshot = runtime && typeof runtime.getSnapshot === 'function' ? runtime.getSnapshot() : null;
    const turnSeat = snapshot && snapshot.info && typeof snapshot.info.turnSeat === 'string'
      ? snapshot.info.turnSeat
      : null;
    return turnSeat || 'bottom';
  }

  function resolveActiveRoundRuntime(runtime) {
    if (runtime && typeof runtime.getRuntime === 'function') {
      return runtime.getRuntime() || runtime;
    }
    return runtime;
  }

  function normalizeCoachRequestPayload(runtime, context = {}) {
    const activeRuntime = resolveActiveRoundRuntime(runtime);
    const bridge = global.AceMahjongRuntimeBridge || null;
    if (!activeRuntime || typeof activeRuntime.getSnapshot !== 'function') {
      throw new Error('当前 runtime 不支持建议请求。');
    }

    const snapshot = activeRuntime.getSnapshot();
    const storedCoachContext = context.coachContext || (bridge && typeof bridge.getCoachContext === 'function'
      ? bridge.getCoachContext()
      : null);
    const initialDeal = storedCoachContext && storedCoachContext.initialDeal
      ? storedCoachContext.initialDeal
      : (activeRuntime && activeRuntime.initialRoundData && typeof activeRuntime.initialRoundData === 'object'
        ? activeRuntime.initialRoundData
        : (activeRuntime && activeRuntime.roundStartData && typeof activeRuntime.roundStartData === 'object'
          ? activeRuntime.roundStartData
          : null));
    const runtimeEvents = storedCoachContext && Array.isArray(storedCoachContext.runtimeEvents)
      ? storedCoachContext.runtimeEvents.slice()
      : [];
    const round = snapshot && snapshot.info ? {
      id: `z${Number(snapshot.info.zhuangfeng || 0)}-j${Number(snapshot.info.jushu || 0)}`,
      label: `${['东', '南', '西', '北'][Number(snapshot.info.zhuangfeng || 0)] || '东'}${Number(snapshot.info.jushu || 0) + 1}局`,
      zhuangfeng: Number(snapshot.info.zhuangfeng || 0),
      jushu: Number(snapshot.info.jushu || 0)
    } : (storedCoachContext && storedCoachContext.round ? storedCoachContext.round : null);
    return {
      perspectiveSeat: resolvePerspectiveSeat(activeRuntime, context.options || {}),
      requestToken: context && context.options && typeof context.options.contextSignature === 'string'
        ? context.options.contextSignature
        : null,
      snapshot,
      initialDeal,
      coachContext: {
        round,
        initialDeal,
        runtimeEvents,
        createdAt: storedCoachContext && storedCoachContext.createdAt ? storedCoachContext.createdAt : Date.now(),
        updatedAt: Date.now(),
        phase: snapshot && snapshot.phase ? snapshot.phase : null,
        turnSeat: snapshot && snapshot.info && snapshot.info.turnSeat ? snapshot.info.turnSeat : null
      },
    };
  }

  function buildCoachSessionPayload(runtime, context = {}) {
    const payload = normalizeCoachRequestPayload(runtime, context);
    const snapshot = payload.snapshot && typeof payload.snapshot === 'object' ? payload.snapshot : {};
    const coachContext = payload.coachContext && typeof payload.coachContext === 'object' ? payload.coachContext : {};
    const round = coachContext.round && typeof coachContext.round === 'object'
      ? coachContext.round
      : {
          id: 'single-round',
          label: '单局',
          zhuangfeng: 0,
          jushu: 0
        };
    const seatKeys = CANONICAL_SEAT_KEYS.filter((seatKey) => snapshot.seats && snapshot.seats[seatKey]);
    const scoreMap = seatKeys.reduce((result, seatKey) => {
      const seat = snapshot.seats && snapshot.seats[seatKey] ? snapshot.seats[seatKey] : null;
      result[seatKey] = seat && Number.isFinite(Number(seat.score)) ? Number(seat.score) : 25000;
      return result;
    }, {});
    const perspectiveSeat = payload.perspectiveSeat || 'bottom';
    const createdAt = coachContext.createdAt || Date.now();
    return {
      sessionKey: `${round.id || 'single-round'}::${perspectiveSeat}::${createdAt}`,
      perspectiveSeat,
      round: {
        ...round,
        dealerSeat: snapshot.info && typeof snapshot.info.dealerSeat === 'string'
          ? snapshot.info.dealerSeat
          : 'bottom',
        changbang: snapshot.info && Number.isFinite(Number(snapshot.info.changbang))
          ? Number(snapshot.info.changbang)
          : 0,
        lizhibang: snapshot.info && Number.isFinite(Number(snapshot.info.lizhibang))
          ? Number(snapshot.info.lizhibang)
          : 0
      },
      seatKeys,
      scoreMap,
      baopai: snapshot.wallState && Array.isArray(snapshot.wallState.baopai)
        ? snapshot.wallState.baopai.slice()
        : (payload.initialDeal && Array.isArray(payload.initialDeal.baopai) ? payload.initialDeal.baopai.slice() : []),
      remaining: snapshot.wallState && Number.isFinite(Number(snapshot.wallState.remaining))
        ? Number(snapshot.wallState.remaining)
        : (payload.initialDeal && Number.isFinite(Number(payload.initialDeal.remaining)) ? Number(payload.initialDeal.remaining) : 0),
      initialDeal: payload.initialDeal,
      runtimeEvents: Array.isArray(coachContext.runtimeEvents) ? coachContext.runtimeEvents.slice() : []
    };
  }

  async function fetchCoachSuggestion(context = {}) {
    const bridge = global.AceMahjongRuntimeBridge || null;
    const runtime = context.runtime || (bridge && typeof bridge.getRuntime === 'function' ? bridge.getRuntime() : null);
    const endpoint = typeof global.AceMahjongCoachProviderUrl === 'string' && global.AceMahjongCoachProviderUrl
      ? global.AceMahjongCoachProviderUrl
      : 'http://127.0.0.1:14517';
    const payload = normalizeCoachRequestPayload(runtime, context);
    const coachSession = buildCoachSessionPayload(runtime, context);
    let response;
    try {
      response = await fetch(`${endpoint}/coach/session/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          coachSession
        })
      });
    } catch (error) {
      const message = error && error.message ? String(error.message) : String(error || '');
      if (/Failed to fetch|ERR_CONNECTION_REFUSED|fetch/i.test(message)) {
        throw new Error('本地 coach 服务未启动，请先启动 coach-provider-server。');
      }
      throw error;
    }

    const syncResult = await response.json();
    if (!response.ok || !syncResult || syncResult.ok === false) {
      const detailedMessage = [
        syncResult && syncResult.error ? String(syncResult.error).trim() : '',
        `coach session 同步失败: ${response.status}`
      ].find(Boolean);
      throw new Error(detailedMessage);
    }

    response = await fetch(`${endpoint}/coach/session/suggest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sessionKey: coachSession.sessionKey,
        requestToken: payload.requestToken || null
      })
    });

    const result = await response.json();
    if (!response.ok || !result || result.ok === false) {
      const detailedMessage = [
        result && result.error ? String(result.error).trim() : '',
        result && result.suggestion && result.suggestion.stderr ? String(result.suggestion.stderr).trim() : '',
        `coach provider 请求失败: ${response.status}`
      ].find(Boolean);
      throw new Error(detailedMessage);
    }
    return result && result.suggestion ? result.suggestion : null;
  }

  global.AceMahjongCoachSuggestionProvider = fetchCoachSuggestion;

  const bridge = global.AceMahjongRuntimeBridge || null;
  if (bridge && typeof bridge.setCoachSuggestionProvider === 'function') {
    bridge.setCoachSuggestionProvider(fetchCoachSuggestion);
  }
})(window);
