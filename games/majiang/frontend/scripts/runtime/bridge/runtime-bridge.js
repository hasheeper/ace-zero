(function(global) {
  'use strict';

  const devLog = global.AceMahjongDevLog || null;
  const runtimeLogger = devLog && typeof devLog.createScope === 'function'
    ? devLog.createScope('runtime')
    : null;

  function logRuntime(level, message, detail) {
    if (!runtimeLogger || typeof runtimeLogger[level] !== 'function') return null;
    return runtimeLogger[level](message, detail);
  }

  if (!global.AceMahjongBrowserCoreAdapter) {
    logRuntime('warn', 'AceMahjongBrowserCoreAdapter 未加载，跳过单局 runtime 初始化');
    console.warn('[MahjongRuntimeBridge] AceMahjongBrowserCoreAdapter 未加载，跳过单局 runtime 初始化。');
    return;
  }
  if (!global.AceMahjongWallService || typeof global.AceMahjongWallService.createWallService !== 'function') {
    logRuntime('error', 'AceMahjongWallService 未加载，跳过单局 runtime 初始化');
    console.error('[MahjongRuntimeBridge] AceMahjongWallService 未加载，跳过单局 runtime 初始化。');
    return;
  }

  const CANONICAL_SEAT_KEYS = ['bottom', 'right', 'top', 'left'];
  const createBrowserGameSessionRuntime = global.AceMahjongCreateBrowserGameSessionRuntime || null;
  let legacyRuntimeFactoryLoadPromise = null;
  const coachStateListeners = new Set();
  const coachAnalysisStateListeners = new Set();
  const AUTO_COACH_STORAGE_KEY = 'acezero.majiang.autoCoachEnabled';
  function createFallbackCoachContextStore() {
    let activeRoundContext = null;
    let eventSeq = 0;

    function cloneValue(value) {
      return value == null ? value : JSON.parse(JSON.stringify(value));
    }

    function buildRoundDescriptorFromSnapshot(snapshot = null) {
      const info = snapshot && snapshot.info && typeof snapshot.info === 'object' ? snapshot.info : null;
      const zhuangfeng = Number.isFinite(Number(info && info.zhuangfeng)) ? Number(info.zhuangfeng) : 0;
      const jushu = Number.isFinite(Number(info && info.jushu)) ? Number(info.jushu) : 0;
      return {
        id: `z${zhuangfeng}-j${jushu}`,
        label: `${['东', '南', '西', '北'][zhuangfeng] || '东'}${jushu + 1}局`,
        zhuangfeng,
        jushu
      };
    }

    function resetRoundContext(snapshot = null, initialDeal = null) {
      const round = buildRoundDescriptorFromSnapshot(snapshot);
      eventSeq = 0;
      activeRoundContext = {
        round,
        initialDeal: initialDeal ? cloneValue(initialDeal) : null,
        runtimeEvents: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        phase: snapshot && snapshot.phase ? snapshot.phase : null,
        turnSeat: snapshot && snapshot.info && snapshot.info.turnSeat ? snapshot.info.turnSeat : null
      };
      return cloneValue(activeRoundContext);
    }

    function appendRuntimeEvent(event = null) {
      if (!event || typeof event !== 'object') return cloneValue(activeRoundContext);
      const snapshot = event.snapshot && typeof event.snapshot === 'object' ? event.snapshot : null;
      if (!activeRoundContext) {
        resetRoundContext(snapshot, null);
      }
      eventSeq += 1;
      activeRoundContext.runtimeEvents.push({
        seq: eventSeq,
        type: event.type || 'unknown',
        payload: event.payload ? cloneValue(event.payload) : null,
        meta: event.meta ? cloneValue(event.meta) : null,
        timestamp: Number.isFinite(Number(event.timestamp)) ? Number(event.timestamp) : Date.now()
      });
      if (snapshot) {
        activeRoundContext.phase = snapshot.phase || activeRoundContext.phase;
        activeRoundContext.turnSeat = snapshot.info && snapshot.info.turnSeat
          ? snapshot.info.turnSeat
          : activeRoundContext.turnSeat;
        activeRoundContext.round = buildRoundDescriptorFromSnapshot(snapshot);
      }
      activeRoundContext.updatedAt = Date.now();
      return cloneValue(activeRoundContext);
    }

    function setInitialDeal(initialDeal = null, snapshot = null) {
      if (!activeRoundContext) {
        return resetRoundContext(snapshot, initialDeal);
      }
      activeRoundContext.initialDeal = initialDeal ? cloneValue(initialDeal) : null;
      if (snapshot) {
        activeRoundContext.phase = snapshot.phase || activeRoundContext.phase;
        activeRoundContext.turnSeat = snapshot.info && snapshot.info.turnSeat
          ? snapshot.info.turnSeat
          : activeRoundContext.turnSeat;
        activeRoundContext.round = buildRoundDescriptorFromSnapshot(snapshot);
      }
      activeRoundContext.updatedAt = Date.now();
      return cloneValue(activeRoundContext);
    }

    return {
      resetRoundContext,
      appendRuntimeEvent,
      setInitialDeal,
      getActiveRoundContext() {
        return cloneValue(activeRoundContext);
      },
      clear() {
        activeRoundContext = null;
        eventSeq = 0;
        return null;
      }
    };
  }
  let coachState = null;
  let coachLiveState = null;
  let coachReviewState = null;
  let coachAnalysisState = null;
  let activeRuntimeConfig = null;
  const coachContextStore = typeof global.AceMahjongCreateCoachContextStore === 'function'
    ? global.AceMahjongCreateCoachContextStore()
    : createFallbackCoachContextStore();
  let coachAnalysisRows = [];
  let coachAnalysisRowSeq = 0;
  const recordedCoachAnalysisKeys = new Set();
  const pendingCoachSuggestionsBySeat = new Map();
  const pendingCoachSuggestionsBySignature = new Map();
  const inFlightCoachRequestsBySignature = new Map();
  const latestActionableCoachSignatureBySeat = new Map();
  const deferredCoachReviewBySeat = new Map();
  let coachSuggestionProvider = null;
  let autoCoachEnabled = false;
  let autoCoachRequestQueued = false;
  let queuedAutoCoachRequest = null;
  const COACH_STATE_STORAGE_KEY = 'acezero.majiang.coachState';
  const COACH_ANALYSIS_STATE_STORAGE_KEY = 'acezero.majiang.coachAnalysisState';

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function cloneOrNull(value) {
    return value == null ? null : clone(value);
  }

  function readStoredBoolean(storageKey, fallback = false) {
    if (!global.localStorage || typeof global.localStorage.getItem !== 'function') return fallback;
    try {
      const raw = global.localStorage.getItem(storageKey);
      if (raw == null || raw === '') return fallback;
      if (raw === 'true') return true;
      if (raw === 'false') return false;
      return Boolean(JSON.parse(raw));
    } catch (error) {
      return fallback;
    }
  }

  function persistBridgeState(storageKey, value) {
    if (!global.localStorage || typeof global.localStorage.setItem !== 'function' || typeof global.localStorage.removeItem !== 'function') {
      return;
    }
    try {
      if (value == null) {
        global.localStorage.removeItem(storageKey);
        return;
      }
      global.localStorage.setItem(storageKey, JSON.stringify(value));
    } catch (error) {
      logRuntime('debug', 'bridge state 持久化失败', {
        storageKey,
        message: error && error.message ? error.message : String(error)
      });
    }
  }

  autoCoachEnabled = readStoredBoolean(AUTO_COACH_STORAGE_KEY, false);

  function normalizeNumber(value, fallback = 0) {
    return Number.isFinite(Number(value)) ? Number(value) : fallback;
  }

  function clearCoachAnalysisAccumulator() {
    coachAnalysisRows = [];
    coachAnalysisRowSeq = 0;
    recordedCoachAnalysisKeys.clear();
    pendingCoachSuggestionsBySeat.clear();
    pendingCoachSuggestionsBySignature.clear();
    inFlightCoachRequestsBySignature.clear();
    latestActionableCoachSignatureBySeat.clear();
    deferredCoachReviewBySeat.clear();
  }

  function normalizeInitialDeal(initialDeal = null) {
    if (!initialDeal || typeof initialDeal !== 'object') return null;
    return {
      source: typeof initialDeal.source === 'string' ? initialDeal.source : null,
      remaining: Number.isFinite(Number(initialDeal.remaining)) ? Number(initialDeal.remaining) : null,
      baopai: Array.isArray(initialDeal.baopai) ? clone(initialDeal.baopai) : [],
      haipai: Array.isArray(initialDeal.haipai) ? clone(initialDeal.haipai) : [],
      meta: initialDeal.meta && typeof initialDeal.meta === 'object' ? clone(initialDeal.meta) : {}
    };
  }

  function getActiveCoachContext() {
    return coachContextStore && typeof coachContextStore.getActiveRoundContext === 'function'
      ? cloneOrNull(coachContextStore.getActiveRoundContext())
      : null;
  }

  function buildCoachContextSignature(runtime = null, seatKey = null) {
    const snapshot = runtime && typeof runtime.getSnapshot === 'function' ? runtime.getSnapshot() : null;
    const round = buildRoundDescriptor(runtime, null);
    const liveEventCount = Array.isArray(snapshot && snapshot.eventLog)
      ? snapshot.eventLog.length
      : (Array.isArray(runtime && runtime.eventLog) ? runtime.eventLog.length : 0);
    const resolvedSeat = seatKey || resolvePrimaryHumanSeat();
    const handCodes = getRuntimeSeatHandCodes(runtime, resolvedSeat).map((code) => String(code || '').replace(/[\*_\+\=\-]$/g, ''));
    return [
      round && round.id ? round.id : 'single-round',
      snapshot && snapshot.phase ? snapshot.phase : 'unknown-phase',
      snapshot && snapshot.info && snapshot.info.turnSeat ? snapshot.info.turnSeat : 'unknown-turn',
      resolvedSeat,
      liveEventCount,
      handCodes.join(',')
    ].join('::');
  }

  function resolveCoachSuggestionProvider() {
    if (coachSuggestionProvider) return coachSuggestionProvider;
    if (typeof global.AceMahjongCoachSuggestionProvider === 'function') {
      return global.AceMahjongCoachSuggestionProvider;
    }
    if (global.AceMahjongCoachSuggestionProvider && typeof global.AceMahjongCoachSuggestionProvider.requestSuggestion === 'function') {
      return global.AceMahjongCoachSuggestionProvider.requestSuggestion.bind(global.AceMahjongCoachSuggestionProvider);
    }
    return null;
  }

  function resolvePrimaryHumanSeat() {
    const players = activeRuntimeConfig && Array.isArray(activeRuntimeConfig.players)
      ? activeRuntimeConfig.players
      : [];
    const humanPlayer = players.find((player) => player && player.human && typeof player.seat === 'string');
    return humanPlayer && humanPlayer.seat ? humanPlayer.seat : 'bottom';
  }

  function hasPlayerReactionOpportunity(snapshot = null, playerSeat = 'bottom') {
    const actions = snapshot && Array.isArray(snapshot.availableActions) ? snapshot.availableActions : [];
    return actions.some((action) => {
      if (!action || typeof action !== 'object') return false;
      if (typeof action.seat === 'string' && action.seat === playerSeat) return true;
      if (action.payload && typeof action.payload.seat === 'string' && action.payload.seat === playerSeat) return true;
      return false;
    });
  }

  function getCoachRequestAvailability(runtime = null) {
    const snapshot = runtime && typeof runtime.getSnapshot === 'function' ? runtime.getSnapshot() : null;
    const playerSeat = resolvePrimaryHumanSeat();
    const phase = snapshot && snapshot.phase ? snapshot.phase : null;
    const turnSeat = snapshot && snapshot.info && typeof snapshot.info.turnSeat === 'string'
      ? snapshot.info.turnSeat
      : (snapshot && typeof snapshot.turnSeat === 'string' ? snapshot.turnSeat : null);

    if (!snapshot) {
      return {
        ok: false,
        reason: 'no-snapshot',
        message: '当前没有可用局面，无法请求建议。',
        playerSeat
      };
    }

    if (phase === 'await_discard' && turnSeat === playerSeat) {
      return {
        ok: true,
        reason: 'player-discard-turn',
        message: null,
        playerSeat,
        phase,
        turnSeat
      };
    }

    if (phase === 'await_reaction' && hasPlayerReactionOpportunity(snapshot, playerSeat)) {
      return {
        ok: true,
        reason: 'player-reaction-turn',
        message: null,
        playerSeat,
        phase,
        turnSeat
      };
    }

    return {
      ok: false,
      reason: 'not-player-turn',
      message: `当前不是玩家可操作的时点。仅支持在 ${playerSeat} 的出牌/反应回合请求建议。`,
      playerSeat,
      phase,
      turnSeat
    };
  }

  function syncDebugPanelCoachAutomation() {
    const debugPanel = global.AceMahjongDebugPanel || null;
    if (!debugPanel) return;
    try {
      if (typeof debugPanel.setCoachAutoEnabled === 'function') {
        debugPanel.setCoachAutoEnabled(autoCoachEnabled, autoCoachEnabled ? '关闭自动复盘' : '开启自动复盘');
      }
      if (typeof debugPanel.setCoachAutoStatus === 'function') {
        debugPanel.setCoachAutoStatus(`review auto: ${autoCoachEnabled ? 'on' : 'off'}`);
      }
    } catch (error) {
      logRuntime('warn', 'coach auto 状态同步到 debug panel 失败', {
        message: error && error.message ? error.message : String(error)
      });
    }
  }

  function getAutoCoachEnabled() {
    return Boolean(autoCoachEnabled);
  }

  function clearDeferredCoachReviewState() {
    pendingCoachSuggestionsBySeat.clear();
    pendingCoachSuggestionsBySignature.clear();
    inFlightCoachRequestsBySignature.clear();
    deferredCoachReviewBySeat.clear();
    latestActionableCoachSignatureBySeat.clear();
  }

  function syncPublishedCoachState() {
    const visibleState = coachReviewState || coachLiveState || null;
    coachState = visibleState
      ? {
          ...cloneOrNull(visibleState),
          liveState: cloneOrNull(coachLiveState),
          reviewState: cloneOrNull(coachReviewState)
        }
      : null;
    global.AceMahjongCoachState = cloneOrNull(coachState);
    persistBridgeState(COACH_STATE_STORAGE_KEY, coachState);

    const table = global.AceZeroMahjongUI && global.AceZeroMahjongUI.table
      ? global.AceZeroMahjongUI.table
      : null;
    if (table && typeof table.setCoachState === 'function') {
      try {
        table.setCoachState(cloneOrNull(coachState));
      } catch (error) {
        logRuntime('warn', 'coach state 同步到 table 失败', {
          message: error && error.message ? error.message : String(error)
        });
      }
    }

    const debugPanel = global.AceMahjongDebugPanel || null;
    if (debugPanel && typeof debugPanel.setCoachStatus === 'function') {
      try {
        debugPanel.setCoachStatus(formatCoachStatusText(coachState));
        if (typeof debugPanel.setCoachDetail === 'function') {
          debugPanel.setCoachDetail(formatCoachDetailText(coachState));
        }
      } catch (error) {
        logRuntime('warn', 'coach state 同步到 debug panel 失败', {
          message: error && error.message ? error.message : String(error)
        });
      }
    }

    coachStateListeners.forEach((listener) => {
      try {
        listener(cloneOrNull(coachState));
      } catch (error) {
        logRuntime('warn', 'coach state listener 执行失败', {
          message: error && error.message ? error.message : String(error)
        });
      }
    });

    if (global.document && typeof global.CustomEvent === 'function' && typeof global.dispatchEvent === 'function') {
      try {
        global.dispatchEvent(new global.CustomEvent('ace-mahjong-coach-state', {
          detail: cloneOrNull(coachState)
        }));
      } catch (error) {
        logRuntime('warn', 'coach state CustomEvent 派发失败', {
          message: error && error.message ? error.message : String(error)
        });
      }
    }

    return cloneOrNull(coachState);
  }

  function reconcileCoachSuggestionForCurrentAvailability(runtime = null, trigger = 'snapshot-sync') {
    const targetRuntime = runtime || global.AceMahjongGameRuntime || null;
    const availability = getCoachRequestAvailability(targetRuntime);
    if (!availability.ok) return false;
    return scheduleAutoCoachSuggestion(targetRuntime, trigger);
  }

  function buildPendingCoachSuggestionKey(seatKey, signature = null) {
    if (!seatKey) return null;
    return `${seatKey}::${signature || '-'}`;
  }

  function getCoachRequestKey(seatKey, signature = null) {
    return buildPendingCoachSuggestionKey(seatKey, signature);
  }

  function getPendingCoachSuggestion(seatKey, signature = null) {
    if (!seatKey) return null;
    if (signature) {
      return pendingCoachSuggestionsBySignature.get(buildPendingCoachSuggestionKey(seatKey, signature)) || null;
    }
    return pendingCoachSuggestionsBySeat.get(seatKey) || null;
  }

  function setPendingCoachSuggestion(entry = null) {
    if (!entry || !entry.perspectiveSeat) return null;
    pendingCoachSuggestionsBySeat.set(entry.perspectiveSeat, entry);
    if (entry.signature) {
      pendingCoachSuggestionsBySignature.set(buildPendingCoachSuggestionKey(entry.perspectiveSeat, entry.signature), entry);
    }
    return entry;
  }

  function deletePendingCoachSuggestion(seatKey, signature = null) {
    if (!seatKey) return;
    if (signature) {
      pendingCoachSuggestionsBySignature.delete(buildPendingCoachSuggestionKey(seatKey, signature));
      const latest = pendingCoachSuggestionsBySeat.get(seatKey) || null;
      if (latest && latest.signature === signature) {
        pendingCoachSuggestionsBySeat.delete(seatKey);
      }
      return;
    }
    Array.from(pendingCoachSuggestionsBySignature.keys()).forEach((key) => {
      if (key.indexOf(`${seatKey}::`) === 0) {
        pendingCoachSuggestionsBySignature.delete(key);
      }
    });
    pendingCoachSuggestionsBySeat.delete(seatKey);
  }

  function trackCoachRequestStart(seatKey, signature = null) {
    const requestKey = getCoachRequestKey(seatKey, signature);
    if (!requestKey) return 0;
    const nextCount = Number(inFlightCoachRequestsBySignature.get(requestKey) || 0) + 1;
    inFlightCoachRequestsBySignature.set(requestKey, nextCount);
    return nextCount;
  }

  function trackCoachRequestFinish(seatKey, signature = null) {
    const requestKey = getCoachRequestKey(seatKey, signature);
    if (!requestKey) return 0;
    const currentCount = Number(inFlightCoachRequestsBySignature.get(requestKey) || 0);
    if (currentCount <= 1) {
      inFlightCoachRequestsBySignature.delete(requestKey);
      return 0;
    }
    const nextCount = currentCount - 1;
    inFlightCoachRequestsBySignature.set(requestKey, nextCount);
    return nextCount;
  }

  function hasInFlightCoachRequest(seatKey, signature = null) {
    const requestKey = getCoachRequestKey(seatKey, signature);
    if (!requestKey) return false;
    return Number(inFlightCoachRequestsBySignature.get(requestKey) || 0) > 0;
  }

  function setCoachLiveState(nextState = null) {
    coachLiveState = nextState ? normalizeCoachState(nextState) : null;
    if (coachLiveState) {
      updatePendingCoachSuggestion(coachLiveState);
    }
    return syncPublishedCoachState();
  }

  function setCoachReviewState(nextState = null) {
    coachReviewState = nextState ? normalizeCoachState(nextState) : null;
    return syncPublishedCoachState();
  }

  function clearDisplayedCoachReview() {
    coachReviewState = null;
    return syncPublishedCoachState();
  }

  function clearCoachReviewForUpcomingAction(signature = null, seatKey = null) {
    if (!coachReviewState) return false;
    const reviewSeat = coachReviewState.perspectiveSeat
      || (coachReviewState.recommended && coachReviewState.recommended.seat)
      || null;
    if (seatKey && reviewSeat && reviewSeat !== seatKey) return false;
    if (signature && coachReviewState.contextSignature === signature) return false;
    clearDisplayedCoachReview();
    return true;
  }

  function publishUnavailableDeferredCoachReview(seatKey, expectedSignature = null) {
    if (!seatKey) return null;
    const deferred = deferredCoachReviewBySeat.get(seatKey);
    if (!deferred) return null;
    if (expectedSignature && deferred.expectedSignature && deferred.expectedSignature !== expectedSignature) return null;
    deferred.unavailableShown = true;
    return setCoachReviewState({
      status: 'ready',
      source: 'auto-review-unavailable',
      perspectiveSeat: seatKey,
      summary: '本手动作已记录，但这一步没有拿到可用参考动作，暂时无法判断善恶手。',
      reasonSummary: '这一步没有取到可用参考。',
      reasons: [
        '这一步已经进入自动复盘流程。',
        '但当前没有拿到可用参考动作。',
        '因此这次暂时无法给出善手/恶手判断。'
      ],
      reviewMode: true,
      hidden: false,
      contextSignature: expectedSignature || deferred.expectedSignature || null
    });
  }

  function resolveDeferredCoachReviewWithoutTiming(seatKey, expectedSignature = null) {
    if (!seatKey) return null;
    const deferred = deferredCoachReviewBySeat.get(seatKey);
    if (!deferred) return null;
    if (expectedSignature && deferred.expectedSignature && deferred.expectedSignature !== expectedSignature) return null;
    const signature = expectedSignature || deferred.expectedSignature || null;
    if (signature && hasInFlightCoachRequest(seatKey, signature)) return null;
    const flushed = flushDeferredCoachReviewForSeat(seatKey);
    if (flushed) return flushed;
    if (deferred.unavailableShown) return null;
    return publishUnavailableDeferredCoachReview(seatKey, signature);
  }

  function publishPendingDeferredCoachReview(actualAction = null, seatKey = null, expectedSignature = null) {
    const normalizedActual = normalizeCoachActionForComparison(actualAction);
    const resolvedSeat = seatKey || (normalizedActual && normalizedActual.seat) || null;
    if (!resolvedSeat) return null;
    const actionType = normalizedActual && normalizedActual.type ? normalizedActual.type : 'action';
    const actionText = formatReviewActionText(normalizedActual);
    return setCoachReviewState({
      status: 'pending',
      source: 'auto-review-pending',
      perspectiveSeat: resolvedSeat,
      recommended: null,
      summary: `本手动作已记录，正在生成这一步的复盘。你刚才的 ${actionType} 选择是 ${actionText}。`,
      reasonSummary: '复盘生成中。',
      reasons: [
        '这一步已经进入自动复盘流程。',
        '正在等待模打建议返回，稍后会补全善恶手判断。'
      ],
      reviewMode: true,
      hidden: false,
      contextSignature: expectedSignature || null
    });
  }

  function clearActionableCoachStateIfStale(runtime = null) {
    const targetRuntime = runtime || global.AceMahjongGameRuntime || null;
    if (!coachLiveState) return false;
    const validation = validateCoachRecommendation(targetRuntime, coachLiveState);
    if (validation.ok) return false;
    setCoachLiveState(null);
    return true;
  }

  function setAutoCoachEnabled(enabled, options = {}) {
    autoCoachEnabled = Boolean(enabled);
    if (!autoCoachEnabled) {
      autoCoachRequestQueued = false;
      queuedAutoCoachRequest = null;
    }
    if (options.persist !== false) {
      persistBridgeState(AUTO_COACH_STORAGE_KEY, autoCoachEnabled);
    }
    syncDebugPanelCoachAutomation();
    return autoCoachEnabled;
  }

  function toggleAutoCoachEnabled() {
    return setAutoCoachEnabled(!autoCoachEnabled);
  }

  function isCoachStateReadyForSignature(signature, seatKey) {
    if (!coachLiveState || coachLiveState.status !== 'ready' || !coachLiveState.recommended) return false;
    if (coachLiveState.contextSignature !== signature) return false;
    const recommendedSeat = coachLiveState.recommended.seat || coachLiveState.perspectiveSeat || null;
    return !seatKey || recommendedSeat === seatKey;
  }

  function shouldPublishVisibleLiveCoachState(runtime = null, normalizedState = null) {
    const state = normalizedState ? normalizeCoachState(normalizedState) : null;
    if (!state || !state.recommended || !state.contextSignature) return false;
    const targetRuntime = runtime || global.AceMahjongGameRuntime || null;
    const availability = getCoachRequestAvailability(targetRuntime);
    if (!availability.ok) return false;
    const currentSignature = buildCoachContextSignature(targetRuntime, availability.playerSeat);
    const stateSeat = state.recommended.seat || state.perspectiveSeat || null;
    return state.contextSignature === currentSignature && stateSeat === availability.playerSeat;
  }

  function scheduleAutoCoachSuggestion(runtime = null, reason = 'auto') {
    if (!autoCoachEnabled) return false;
    if (typeof resolveCoachSuggestionProvider() !== 'function') return false;
    const targetRuntime = runtime || global.AceMahjongGameRuntime || null;
    const availability = getCoachRequestAvailability(targetRuntime);
    if (!availability.ok) return false;
    const signature = buildCoachContextSignature(targetRuntime, availability.playerSeat);
    latestActionableCoachSignatureBySeat.set(availability.playerSeat, signature);
    const existingPending = getPendingCoachSuggestion(availability.playerSeat, signature);
    if (!existingPending || existingPending.signature !== signature) {
      deletePendingCoachSuggestion(availability.playerSeat);
    }
    if (isCoachStateReadyForSignature(signature, availability.playerSeat)) return false;
    if (hasInFlightCoachRequest(availability.playerSeat, signature)) return false;
    queuedAutoCoachRequest = {
      runtime: targetRuntime,
      reason
    };
    if (autoCoachRequestQueued) return true;
    autoCoachRequestQueued = true;
    Promise.resolve().then(() => {
      autoCoachRequestQueued = false;
      const queued = queuedAutoCoachRequest;
      queuedAutoCoachRequest = null;
      if (!autoCoachEnabled) return;
      const liveRuntime = global.AceMahjongGameRuntime || (queued ? queued.runtime : targetRuntime);
      const liveAvailability = getCoachRequestAvailability(liveRuntime);
      if (!liveAvailability.ok) return;
      const liveSignature = buildCoachContextSignature(liveRuntime, liveAvailability.playerSeat);
      latestActionableCoachSignatureBySeat.set(liveAvailability.playerSeat, liveSignature);
      if (isCoachStateReadyForSignature(liveSignature, liveAvailability.playerSeat)) return;
      if (coachLiveState && coachLiveState.status === 'pending' && coachLiveState.contextSignature === liveSignature) return;
      if (hasInFlightCoachRequest(liveAvailability.playerSeat, liveSignature)) return;
      requestCoachSuggestion({
        source: 'auto-review-background',
        trigger: queued && queued.reason ? queued.reason : reason,
        background: true,
        hidden: false,
        publishVisible: true,
        stickyContextSignature: true
      });
    });
    return true;
  }

  async function requestCoachSuggestion(options = {}) {
    const runtime = global.AceMahjongGameRuntime || null;
    const provider = resolveCoachSuggestionProvider();
    if (!runtime) {
      return setCoachLiveState({
        status: 'error',
        source: 'manual-request',
        summary: '当前没有可用 runtime，无法请求建议。'
      });
    }
    if (typeof provider !== 'function') {
      return setCoachLiveState({
        status: 'error',
        source: 'manual-request',
        summary: '当前前端还没有接入真实 coach provider，暂时无法直接请求参考建议。'
      });
    }
    const availability = getCoachRequestAvailability(runtime);
    if (!availability.ok) {
      return setCoachLiveState({
        status: 'error',
        source: 'manual-request',
        summary: availability.message
      });
    }

    const background = Boolean(options && options.background);
    const requestSeat = availability.playerSeat;
    const requestToken = buildCoachContextSignature(runtime, requestSeat);
    try {
      if (background) {
        trackCoachRequestStart(requestSeat, requestToken);
      }
      if (!background) {
        setCoachLiveState({
          status: 'pending',
          source: 'manual-request',
          summary: '正在手动请求当前局面的建议...'
        });
      }
      const providerOptions = {
        ...cloneOrNull(options),
        contextSignature: requestToken,
        perspectiveSeat: requestSeat
      };
      let result = await Promise.resolve(provider({
        runtime,
        coachContext: getActiveCoachContext(),
        options: providerOptions
      }));
      const latestToken = buildCoachContextSignature(runtime, requestSeat);
      if (
        !providerOptions.stickyContextSignature
        && result
        && result.contextSignature
        && result.contextSignature !== latestToken
      ) {
        result = await Promise.resolve(provider({
          runtime,
          coachContext: getActiveCoachContext(),
          options: {
            ...providerOptions,
            contextSignature: latestToken
          }
        }));
      }
      const normalizedResult = result
        ? normalizeCoachState({
          ...result,
          hidden: Boolean(result.hidden) || (background && !options.publishVisible)
        })
        : null;
      if (background) {
        trackCoachRequestFinish(requestSeat, requestToken);
        if (normalizedResult) {
          updatePendingCoachSuggestion(normalizedResult);
          if (options.publishVisible && shouldPublishVisibleLiveCoachState(runtime, normalizedResult)) {
            setCoachLiveState(normalizedResult);
          }
          return cloneOrNull(normalizedResult);
        }
        resolveDeferredCoachReviewWithoutTiming(requestSeat, requestToken);
        return null;
      }
      return setCoachLiveState(normalizedResult || {
        status: 'error',
        source: 'manual-request',
        summary: 'coach provider 没有返回可用建议。'
      });
    } catch (error) {
      if (options && options.background) {
        trackCoachRequestFinish(requestSeat, requestToken);
        resolveDeferredCoachReviewWithoutTiming(requestSeat, requestToken);
        return null;
      }
      return setCoachLiveState({
        status: 'error',
        source: 'manual-request',
        summary: error && error.message ? error.message : '请求建议失败。'
      });
    }
  }

  function normalizeCoachRecommended(recommended = null) {
    if (!recommended || typeof recommended !== 'object') return null;
    return {
      type: typeof recommended.type === 'string' ? recommended.type : null,
      seat: typeof recommended.seat === 'string' ? recommended.seat : null,
      tileCode: typeof recommended.tileCode === 'string' ? recommended.tileCode : null,
      fromSeat: typeof recommended.fromSeat === 'string' ? recommended.fromSeat : null,
      callType: typeof recommended.callType === 'string' ? recommended.callType : null,
      meldString: typeof recommended.meldString === 'string' ? recommended.meldString : null,
      riichi: Boolean(recommended.riichi)
    };
  }

  function getAvailableActionsForSeat(snapshot = null, seatKey = null) {
    if (!snapshot || !seatKey || !Array.isArray(snapshot.availableActions)) return [];
    return snapshot.availableActions.filter((action) => {
      if (!action || typeof action !== 'object') return false;
      if (typeof action.seat === 'string') return action.seat === seatKey;
      if (action.payload && typeof action.payload.seat === 'string') return action.payload.seat === seatKey;
      return false;
    });
  }

  function getActionTypeKey(action = null) {
    if (!action || typeof action !== 'object') return null;
    if (typeof action.type === 'string' && action.type) return action.type;
    if (typeof action.key === 'string' && action.key) return action.key.split(':')[0];
    return null;
  }

  function doesCoachRecommendationMatchActions(recommended = null, availableActions = []) {
    const action = normalizeCoachActionForComparison(recommended);
    if (!action || !action.type || !Array.isArray(availableActions) || !availableActions.length) return true;
    return availableActions.some((candidate) => {
      const typeKey = getActionTypeKey(candidate);
      const payload = candidate && candidate.payload && typeof candidate.payload === 'object'
        ? candidate.payload
        : {};
      if (action.type === 'call') {
        const meld = payload.meldString || payload.meld || null;
        const callType = payload.callType || null;
        return (typeKey === 'call' || typeKey === 'chi' || typeKey === 'peng')
          && (!action.callType || action.callType === callType)
          && (!action.meldString || action.meldString === meld);
      }
      return typeKey === action.type;
    });
  }

  function validateCoachRecommendation(runtime, state = null) {
    const normalized = state ? normalizeCoachState(state) : null;
    if (!normalized || !normalized.recommended) {
      return { ok: true, reason: 'no-recommendation' };
    }
    const snapshot = runtime && typeof runtime.getSnapshot === 'function' ? runtime.getSnapshot() : null;
    if (!snapshot) {
      return { ok: false, reason: 'no-snapshot', message: '当前局面不可用，教练建议已失效。' };
    }
    const recommended = normalized.recommended;
    const seatKey = recommended.seat || normalized.perspectiveSeat || resolvePrimaryHumanSeat();
    const phase = snapshot.phase || null;
    const turnSeat = snapshot.info && snapshot.info.turnSeat ? snapshot.info.turnSeat : null;
    const actionType = recommended.type || null;

    if (actionType === 'discard') {
      const handCodes = getRuntimeSeatHandCodes(runtime, seatKey).map((code) => String(code || '').replace(/[\*_\+\=\-]$/g, ''));
      const normalizedTile = typeof recommended.tileCode === 'string'
        ? String(recommended.tileCode).replace(/[\*_\+\=\-]$/g, '')
        : null;
      if (phase !== 'await_discard' || turnSeat !== seatKey) {
        return { ok: false, reason: 'discard-turn-mismatch', message: '当前已不是这条出牌建议对应的回合。' };
      }
      if (!normalizedTile || !handCodes.includes(normalizedTile)) {
        return { ok: false, reason: 'discard-tile-missing', message: '推荐牌当前已不在手牌中，这条建议已经过时。' };
      }
      return { ok: true, reason: 'discard-valid' };
    }

    if (actionType === 'call' || actionType === 'pass' || actionType === 'hule' || actionType === 'kan') {
      const seatActions = getAvailableActionsForSeat(snapshot, seatKey);
      const matched = seatActions.some((action) => {
        const typeKey = getActionTypeKey(action);
        if (actionType === 'call') {
          const payload = action && action.payload && typeof action.payload === 'object' ? action.payload : {};
          const meld = payload.meldString || payload.meld || null;
          const callType = payload.callType || null;
          return (typeKey === 'call' || typeKey === 'chi' || typeKey === 'peng')
            && (!recommended.callType || recommended.callType === callType)
            && (!recommended.meldString || recommended.meldString === meld);
        }
        return typeKey === actionType;
      });
      if (!matched) {
        return { ok: false, reason: 'reaction-action-missing', message: '当前反应窗口里已经没有这条建议动作了。' };
      }
      return { ok: true, reason: 'reaction-valid' };
    }

    return { ok: true, reason: 'no-validation-needed' };
  }

  function normalizeCoachActionForComparison(action = null) {
    if (!action || typeof action !== 'object') return null;
    return {
      type: typeof action.type === 'string' ? action.type : null,
      seat: typeof action.seat === 'string' ? action.seat : null,
      tileCode: typeof action.tileCode === 'string'
        ? action.tileCode.replace(/[\*_\+\=\-]$/g, '')
        : null,
      fromSeat: typeof action.fromSeat === 'string' ? action.fromSeat : null,
      callType: typeof action.callType === 'string' ? action.callType : null,
      meldString: typeof action.meldString === 'string' ? action.meldString : null,
      riichi: Boolean(action.riichi)
    };
  }

  function compareCoachDecisions(localDecision, coachDecision) {
    const local = normalizeCoachActionForComparison(localDecision);
    const coach = normalizeCoachActionForComparison(coachDecision);
    const result = {
      exactMatch: false,
      typeMatch: false,
      tileMatch: false,
      callMatch: false,
      riichiMatch: false,
      mismatchKind: 'missing'
    };
    if (!local || !coach) {
      result.mismatchKind = !local && !coach ? 'both-missing' : 'missing';
      return result;
    }

    result.typeMatch = local.type === coach.type;
    const shouldIgnoreTileCode = ['call', 'kan', 'pass', 'hule'].includes(local.type || '');
    result.tileMatch = shouldIgnoreTileCode
      ? true
      : local.tileCode === coach.tileCode;
    result.callMatch = ['call', 'kan'].includes(local.type || '')
      ? local.callType === coach.callType && local.meldString === coach.meldString
      : true;
    result.riichiMatch = local.riichi === coach.riichi;
    result.exactMatch = result.typeMatch && result.tileMatch && result.callMatch && result.riichiMatch;

    if (result.exactMatch) result.mismatchKind = 'none';
    else if (!result.typeMatch) result.mismatchKind = 'action-type';
    else if (!result.tileMatch) result.mismatchKind = 'tile';
    else if (!result.callMatch) result.mismatchKind = 'call';
    else if (!result.riichiMatch) result.mismatchKind = 'riichi';
    else result.mismatchKind = 'other';
    return result;
  }

  function classifyCoachComparison(row = null) {
    const comparison = row && row.comparison ? row.comparison : null;
    const tags = Array.isArray(row && row.tags) ? row.tags : [];
    const hasDefenseTag = tags.includes('defense') || tags.includes('riichi-pressure');
    if (!comparison) return { verdict: 'unknown', bucket: 'unknown', reason: 'no-comparison' };
    if (comparison.exactMatch) return { verdict: 'good', bucket: 'exact-match', reason: 'matched-mortal' };
    if (comparison.mismatchKind === 'missing') return { verdict: 'bad', bucket: 'missing', reason: 'missing-coach-decision' };
    if (comparison.mismatchKind === 'action-type') return { verdict: 'bad', bucket: 'action-type', reason: 'different-action-family' };
    if (comparison.mismatchKind === 'riichi') return { verdict: 'bad', bucket: 'riichi-threshold', reason: 'riichi-disagreement' };
    if (comparison.mismatchKind === 'tile') {
      return hasDefenseTag
        ? { verdict: 'bad', bucket: 'tile-defense', reason: 'defense-tile-disagreement' }
        : { verdict: 'neutral', bucket: 'tile-choice', reason: 'same-action-different-tile' };
    }
    if (comparison.mismatchKind === 'call') return { verdict: 'neutral', bucket: 'call-detail', reason: 'same-action-different-call' };
    return { verdict: 'neutral', bucket: comparison.mismatchKind || 'other', reason: 'unclassified' };
  }

  function summarizeAnalysisRows(rows = [], summaryMeta = {}) {
    const summary = {
      id: summaryMeta.id || null,
      label: summaryMeta.label || null,
      type: summaryMeta.type || null,
      total: rows.length,
      mortalComparable: 0,
      mortalRate: 0,
      actionTypeRate: 0,
      riichiRate: 0,
      goodCount: 0,
      neutralCount: 0,
      badCount: 0,
      bucketCounts: {}
    };
    rows.forEach((row) => {
      if (row && row.coachDecision) summary.mortalComparable += 1;
      if (row && row.comparison && row.comparison.exactMatch) summary.mortalRate += 1;
      if (row && row.comparison && row.comparison.typeMatch) summary.actionTypeRate += 1;
      if (row && row.comparison && row.comparison.riichiMatch) summary.riichiRate += 1;
      const verdict = row && row.judgment ? row.judgment.verdict : 'unknown';
      if (verdict === 'good') summary.goodCount += 1;
      else if (verdict === 'bad') summary.badCount += 1;
      else summary.neutralCount += 1;
      const bucket = row && row.judgment && row.judgment.bucket ? row.judgment.bucket : 'unknown';
      summary.bucketCounts[bucket] = (summary.bucketCounts[bucket] || 0) + 1;
    });
    if (summary.total > 0) {
      summary.mortalRate = Number((summary.mortalRate / summary.total).toFixed(4));
      summary.actionTypeRate = Number((summary.actionTypeRate / summary.total).toFixed(4));
      summary.riichiRate = Number((summary.riichiRate / summary.total).toFixed(4));
    }
    return summary;
  }

  function buildAnalysisReportFromRows(rows = []) {
    const subjectMap = new Map();
    const roundMap = new Map();
    rows.forEach((row) => {
      const subjectId = row && row.subject && row.subject.id ? row.subject.id : 'unknown-subject';
      const roundId = row && row.round && row.round.id ? row.round.id : 'single-round';
      if (!subjectMap.has(subjectId)) subjectMap.set(subjectId, []);
      if (!roundMap.has(roundId)) roundMap.set(roundId, []);
      subjectMap.get(subjectId).push(row);
      roundMap.get(roundId).push(row);
    });

    const subjects = Array.from(subjectMap.entries()).map(([subjectId, subjectRows]) => {
      const subject = subjectRows[0] && subjectRows[0].subject ? subjectRows[0].subject : { id: subjectId, label: subjectId, type: 'unknown' };
      return {
        summary: summarizeAnalysisRows(subjectRows, subject),
        rows: subjectRows.slice(),
        goodHands: subjectRows.filter((row) => row && row.judgment && row.judgment.verdict === 'good'),
        neutralHands: subjectRows.filter((row) => row && row.judgment && row.judgment.verdict === 'neutral'),
        badHands: subjectRows.filter((row) => row && row.judgment && row.judgment.verdict === 'bad')
      };
    });

    const rounds = Array.from(roundMap.entries()).map(([roundId, roundRows]) => {
      const round = roundRows[0] && roundRows[0].round ? roundRows[0].round : { id: roundId, label: roundId };
      return {
        summary: summarizeAnalysisRows(roundRows, {
          id: round.id,
          label: round.label,
          type: 'round'
        }),
        rows: roundRows.slice()
      };
    });

    return {
      totals: {
        rows: rows.length,
        subjects: subjects.length,
        rounds: rounds.length
      },
      overview: summarizeAnalysisRows(rows, {
        id: 'overview',
        label: '全部样本',
        type: 'overview'
      }),
      rounds,
      subjects
    };
  }

  function buildConfiguredSubjectCatalog() {
    const players = activeRuntimeConfig && Array.isArray(activeRuntimeConfig.players)
      ? activeRuntimeConfig.players
      : [];
    return players
      .filter((player) => player && typeof player.seat === 'string')
      .map((player) => buildSubjectDescriptor(player.seat));
  }

  function buildConfiguredRoundCatalog(runtime = null) {
    const round = buildRoundDescriptor(runtime, null);
    return round ? [round] : [];
  }

  function ensureAnalysisCatalog(report = null, runtime = null) {
    const nextReport = report ? clone(report) : {
      totals: { rows: 0, subjects: 0, rounds: 0 },
      overview: summarizeAnalysisRows([], {
        id: 'overview',
        label: '全部样本',
        type: 'overview'
      }),
      rounds: [],
      subjects: []
    };

    const subjectCatalog = buildConfiguredSubjectCatalog();
    const knownSubjectIds = new Set((nextReport.subjects || []).map((subject) => subject && subject.summary ? subject.summary.id : null).filter(Boolean));
    subjectCatalog.forEach((subject) => {
      if (knownSubjectIds.has(subject.id)) return;
      nextReport.subjects.push({
        summary: summarizeAnalysisRows([], subject),
        rows: [],
        goodHands: [],
        neutralHands: [],
        badHands: []
      });
    });

    const roundCatalog = buildConfiguredRoundCatalog(runtime);
    const knownRoundIds = new Set((nextReport.rounds || []).map((round) => round && round.summary ? round.summary.id : null).filter(Boolean));
    roundCatalog.forEach((round) => {
      if (knownRoundIds.has(round.id)) return;
      nextReport.rounds.push({
        summary: summarizeAnalysisRows([], {
          id: round.id,
          label: round.label,
          type: 'round'
        }),
        rows: []
      });
    });

    nextReport.totals.subjects = nextReport.subjects.length;
    nextReport.totals.rounds = nextReport.rounds.length;
    nextReport.subjectCatalog = subjectCatalog;
    nextReport.roundCatalog = roundCatalog;
    return nextReport;
  }

  function buildAnalysisStateSummary(report = null) {
    if (!report || !report.overview) return '当前还没有对照分析样本。';
    const overview = report.overview;
    const bucketEntries = Object.entries(overview.bucketCounts || {}).sort((a, b) => Number(b[1]) - Number(a[1]));
    const primaryBucket = bucketEntries[0] ? bucketEntries[0][0] : '暂无';
    return `当前已累计 ${overview.total} 条样本，参考一致率 ${Math.round((overview.mortalRate || 0) * 100)}%，主要分歧集中在 ${primaryBucket}。`;
  }

  function formatJudgmentVerdict(verdict) {
    const map = {
      good: '善手',
      neutral: '中性手',
      bad: '恶手'
    };
    return map[String(verdict || '').toLowerCase()] || '未分类';
  }

  function formatReviewActionText(decision = null) {
    const action = normalizeCoachActionForComparison(decision);
    if (!action || !action.type) return '-';
    if (action.type === 'discard') return action.tileCode || '打牌';
    if (action.type === 'pass') return '过';
    if (action.type === 'hule') return '和牌';
    if (action.type === 'kan') {
      if (action.meldString) return `杠 ${action.meldString}`;
      return '杠';
    }
    if (action.type === 'call') {
      if (action.callType === 'chi') return action.meldString ? `吃 ${action.meldString}` : '吃';
      if (action.callType === 'peng') return action.meldString ? `碰 ${action.meldString}` : '碰';
      if (action.callType === 'pon') return action.meldString ? `碰 ${action.meldString}` : '碰';
      if (action.callType) return action.meldString ? `${action.callType} ${action.meldString}` : action.callType;
      return action.meldString || '副露';
    }
    return action.tileCode || action.meldString || action.type;
  }

  function isComparableReviewFamily(actualDecision, coachDecision) {
    const actual = normalizeCoachActionForComparison(actualDecision);
    const coach = normalizeCoachActionForComparison(coachDecision);
    return Boolean(actual && coach && actual.type && coach.type);
  }

  function buildLatestRowSummary(row = null) {
    if (!row || !row.judgment) return null;
    const verdict = formatJudgmentVerdict(row.judgment.verdict);
    const localAction = formatReviewActionText(row.localDecision);
    const coachAction = formatReviewActionText(row.coachDecision);
    const actionType = row.localDecision && row.localDecision.type ? row.localDecision.type : 'action';
    const bucket = row.judgment.bucket || 'unknown';
    return `本手判定：${verdict}。你的 ${actionType} 选择是 ${localAction}，参考建议是 ${coachAction}，分歧类型 ${bucket}。`;
  }

  function publishAccumulatedCoachAnalysisState(options = {}) {
    const report = ensureAnalysisCatalog(buildAnalysisReportFromRows(coachAnalysisRows), global.AceMahjongGameRuntime || null);
    const latestRowSummary = buildLatestRowSummary(options.latestRow);
    return publishCoachAnalysisState({
      source: 'runtime-live-analysis',
      status: coachAnalysisRows.length ? 'ready' : 'idle',
      summary: latestRowSummary || buildAnalysisStateSummary(report),
      report,
      raw: {
        rows: cloneOrNull(coachAnalysisRows),
        latestRow: cloneOrNull(options.latestRow || null)
      }
    });
  }

  function getPlayerConfigBySeat(seatKey) {
    const players = activeRuntimeConfig && Array.isArray(activeRuntimeConfig.players)
      ? activeRuntimeConfig.players
      : [];
    return players.find((player) => player && player.seat === seatKey) || null;
  }

  function buildSubjectDescriptor(seatKey) {
    const player = getPlayerConfigBySeat(seatKey);
    const aiConfig = player && player.ai && typeof player.ai === 'object' ? player.ai : null;
    const difficulty = aiConfig && typeof aiConfig.difficulty === 'string' ? aiConfig.difficulty : null;
    const isAi = Boolean(aiConfig && aiConfig.enabled);
    const baseLabel = player && (player.name || player.title)
      ? [player.name || null, player.title || null].filter(Boolean).join(' · ')
      : seatKey;
    return {
      id: isAi ? `ai:${seatKey}:${difficulty || 'unknown'}` : `player:${seatKey}`,
      label: isAi ? `${baseLabel} · ${difficulty || 'ai'}` : `${baseLabel} · 玩家`,
      type: isAi ? 'ai' : 'player',
      seat: seatKey
    };
  }

  function buildRoundDescriptor(runtime, event = null) {
    const matchState = runtime && typeof runtime.getMatchState === 'function'
      ? runtime.getMatchState()
      : (event && event.payload && event.payload.matchState ? event.payload.matchState : null);
    if (matchState) {
      return {
        id: `z${normalizeNumber(matchState.zhuangfeng)}-j${normalizeNumber(matchState.jushu)}`,
        label: formatRoundCutInLabel(matchState),
        zhuangfeng: normalizeNumber(matchState.zhuangfeng),
        jushu: normalizeNumber(matchState.jushu)
      };
    }
    const snapshot = event && event.snapshot ? event.snapshot : getRuntimeSnapshotSafe(runtime);
    const info = snapshot && snapshot.info ? snapshot.info : null;
    if (info && (Number.isFinite(Number(info.zhuangfeng)) || Number.isFinite(Number(info.jushu)))) {
      const zhuangfeng = normalizeNumber(info.zhuangfeng);
      const jushu = normalizeNumber(info.jushu);
      return {
        id: `z${zhuangfeng}-j${jushu}`,
        label: `${['东', '南', '西', '北'][zhuangfeng] || '东'}${jushu + 1}局`,
        zhuangfeng,
        jushu
      };
    }
    return {
      id: 'single-round',
      label: '单局样本',
      zhuangfeng: null,
      jushu: null
    };
  }

  function summarizeActualActionFromEvent(event = null) {
    if (!event || typeof event !== 'object') return null;
    const payload = event.payload && typeof event.payload === 'object' ? event.payload : {};
    if (event.type === 'tile:discard') {
      return {
        type: 'discard',
        seat: payload.seat || null,
        tileCode: payload.tileCode || null,
        riichi: Boolean(payload.riichi)
      };
    }
    if (event.type === 'meld:call') {
      return {
        type: 'call',
        seat: payload.seat || null,
        fromSeat: payload.fromSeat || null,
        callType: payload.callType || null,
        meldString: payload.meld || payload.meldString || null,
        tileCode: payload.tileCode || null,
        riichi: false
      };
    }
    if (event.type === 'meld:kan') {
      return {
        type: 'kan',
        seat: payload.seat || null,
        fromSeat: payload.fromSeat || null,
        callType: payload.callType || 'kan',
        meldString: payload.meld || payload.meldString || null,
        tileCode: payload.tileCode || null,
        riichi: false
      };
    }
    return null;
  }

  function inferRowTagsFromComparison(coachDecision, comparison) {
    const tags = [];
    if (coachDecision && coachDecision.riichi) tags.push('riichi');
    if (comparison && comparison.mismatchKind === 'tile' && coachDecision && coachDecision.type === 'discard' && coachDecision.riichi) {
      tags.push('riichi-pressure');
    }
    return tags;
  }

  function flushDeferredCoachReviewForSeat(seatKey) {
    if (!seatKey) return null;
    const deferred = deferredCoachReviewBySeat.get(seatKey);
    const pending = deferred && deferred.expectedSignature
      ? getPendingCoachSuggestion(seatKey, deferred.expectedSignature)
      : getPendingCoachSuggestion(seatKey, null);
    if (!deferred) return null;
    const comparisonBaseline = pending && pending.coachDecision
      ? pending
      : (deferred.coachDecision
        ? {
            coachDecision: cloneOrNull(deferred.coachDecision),
            signature: deferred.expectedSignature || null,
            label: deferred.label || null
          }
        : null);
    if (!comparisonBaseline || !comparisonBaseline.coachDecision) return null;
    if (deferred.expectedSignature && comparisonBaseline.signature && deferred.expectedSignature !== comparisonBaseline.signature) {
      return null;
    }
    deferredCoachReviewBySeat.delete(seatKey);
    if (!pending) {
      setPendingCoachSuggestion({
        coachDecision: cloneOrNull(comparisonBaseline.coachDecision),
        perspectiveSeat: seatKey,
        round: buildRoundDescriptor(deferred.runtime || global.AceMahjongGameRuntime || null, deferred.event || null),
        signature: comparisonBaseline.signature || deferred.expectedSignature || null,
        label: comparisonBaseline.label || null,
        updatedAt: Date.now()
      });
    }
    return recordCoachAnalysisObservation(
      deferred.runtime || global.AceMahjongGameRuntime || null,
      deferred.event || null,
      deferred.actualAction || null,
      {
        expectedSignature: deferred.expectedSignature || null
      }
    );
  }

  function recordCoachAnalysisObservation(runtime, event, actualAction, options = {}) {
    const normalizedActual = normalizeCoachActionForComparison(actualAction);
    if (!normalizedActual || !normalizedActual.seat) return null;
    const deferred = deferredCoachReviewBySeat.get(normalizedActual.seat) || null;
    const expectedSignature = options && options.expectedSignature
      ? options.expectedSignature
      : (deferred && deferred.expectedSignature
        ? deferred.expectedSignature
        : (latestActionableCoachSignatureBySeat.get(normalizedActual.seat) || null));
    const pending = expectedSignature
      ? getPendingCoachSuggestion(normalizedActual.seat, expectedSignature)
      : getPendingCoachSuggestion(normalizedActual.seat, null);
    const comparisonBaseline = pending && pending.coachDecision
      ? pending
      : (deferred && deferred.coachDecision
        ? {
            coachDecision: cloneOrNull(deferred.coachDecision),
            perspectiveSeat: normalizedActual.seat,
            round: buildRoundDescriptor(runtime, event),
            signature: deferred.expectedSignature || expectedSignature || null,
            label: deferred.label || null,
            updatedAt: deferred.recordedAt || Date.now()
          }
        : null);
    if (!comparisonBaseline || !comparisonBaseline.coachDecision) {
      const subject = buildSubjectDescriptor(normalizedActual.seat);
      if (autoCoachEnabled && subject && subject.type === 'player') {
        const latestExpectedSignature = latestActionableCoachSignatureBySeat.get(normalizedActual.seat) || null;
        deferredCoachReviewBySeat.set(normalizedActual.seat, {
          runtime,
          event: cloneOrNull(event),
          actualAction: cloneOrNull(actualAction),
          expectedSignature: latestExpectedSignature,
          recordedAt: Date.now()
        });
        if (!hasInFlightCoachRequest(normalizedActual.seat, latestExpectedSignature)) {
          return resolveDeferredCoachReviewWithoutTiming(
            normalizedActual.seat,
            latestExpectedSignature
          );
        }
        return publishPendingDeferredCoachReview(actualAction, normalizedActual.seat, latestExpectedSignature);
      }
      return null;
    }
    if (expectedSignature && comparisonBaseline.signature && expectedSignature !== comparisonBaseline.signature) {
      deletePendingCoachSuggestion(normalizedActual.seat, comparisonBaseline.signature);
      return null;
    }
    if (!isComparableReviewFamily(normalizedActual, comparisonBaseline.coachDecision)) {
      deletePendingCoachSuggestion(normalizedActual.seat, comparisonBaseline.signature || expectedSignature);
      return null;
    }
    const round = buildRoundDescriptor(runtime, event);
    if (comparisonBaseline.round && comparisonBaseline.round.id && round && round.id && comparisonBaseline.round.id !== round.id) {
      deletePendingCoachSuggestion(normalizedActual.seat, comparisonBaseline.signature || expectedSignature);
      return null;
    }

    const comparison = compareCoachDecisions(normalizedActual, comparisonBaseline.coachDecision);
    const eventTimestamp = Number.isFinite(Number(event && event.timestamp)) ? Number(event.timestamp) : 0;
    const dedupeKey = [
      round && round.id ? round.id : 'single-round',
      normalizedActual.seat || 'unknown-seat',
      event && event.type ? event.type : 'unknown-event',
      normalizedActual.type || 'unknown-action',
      normalizedActual.tileCode || normalizedActual.meldString || '-',
      eventTimestamp
    ].join('::');
    if (recordedCoachAnalysisKeys.has(dedupeKey)) {
      deletePendingCoachSuggestion(normalizedActual.seat, comparisonBaseline.signature || expectedSignature);
      return null;
    }
    recordedCoachAnalysisKeys.add(dedupeKey);
    const row = {
      id: `live-analysis-${coachAnalysisRowSeq += 1}`,
      label: comparisonBaseline.label || `${round.label} · ${normalizedActual.seat} · ${normalizedActual.type}`,
      kind: normalizedActual.type || 'action',
      recordedAt: Date.now(),
      tags: inferRowTagsFromComparison(comparisonBaseline.coachDecision, comparison),
      round,
      subject: buildSubjectDescriptor(normalizedActual.seat),
      localDecision: normalizedActual,
      coachDecision: comparisonBaseline.coachDecision,
      comparison
    };
    row.judgment = classifyCoachComparison(row);
    coachAnalysisRows.push(row);
    deletePendingCoachSuggestion(normalizedActual.seat, comparisonBaseline.signature || expectedSignature);
    deferredCoachReviewBySeat.delete(normalizedActual.seat);
    if (autoCoachEnabled && row.subject && row.subject.type === 'player') {
      setCoachReviewState({
        status: 'ready',
        source: 'auto-review',
        perspectiveSeat: normalizedActual.seat,
        recommended: comparisonBaseline.coachDecision,
        summary: buildLatestRowSummary(row) || '本手动作已经完成，已生成复盘结果。',
        reasonSummary: `本手判定：${formatJudgmentVerdict(row.judgment && row.judgment.verdict)}。`,
        reasons: [
          `本手判定：${formatJudgmentVerdict(row.judgment && row.judgment.verdict)}。`,
          '这是你刚才那一步的复盘，不是当前仍可执行的操作建议。',
          row.judgment && row.judgment.bucket ? `分歧类型：${row.judgment.bucket}。` : null,
          comparisonBaseline.coachDecision ? '上方推荐动作展示的是这一步更推荐的选择。' : null
        ].filter(Boolean),
        contextSignature: comparisonBaseline.signature || buildCoachContextSignature(runtime, normalizedActual.seat),
        hidden: false,
        reviewMode: true
      });
    } else if (coachLiveState && coachLiveState.recommended) {
      const activeSeat = coachLiveState.recommended.seat || coachLiveState.perspectiveSeat || null;
      if (activeSeat && activeSeat === normalizedActual.seat) {
        setCoachLiveState(null);
      }
    }
    return publishAccumulatedCoachAnalysisState({
      latestRow: autoCoachEnabled && row.subject && row.subject.type === 'player' ? row : null
    });
  }

  function updatePendingCoachSuggestion(nextState) {
    const normalized = nextState ? normalizeCoachState(nextState) : null;
    if (!normalized || !normalized.recommended) return;
    const seatKey = normalized.recommended.seat || normalized.perspectiveSeat;
    if (!seatKey) return;
    const deferred = normalized.contextSignature
      ? deferredCoachReviewBySeat.get(seatKey) || null
      : null;
    if (
      deferred
      && deferred.expectedSignature
      && deferred.expectedSignature === normalized.contextSignature
      && Array.isArray(deferred.availableActions)
      && deferred.availableActions.length
      && !doesCoachRecommendationMatchActions(normalized.recommended, deferred.availableActions)
    ) {
      return;
    }
    const runtime = global.AceMahjongGameRuntime || null;
    setPendingCoachSuggestion({
      coachDecision: normalizeCoachActionForComparison({
        ...normalized.recommended,
        seat: seatKey
      }),
      perspectiveSeat: normalized.perspectiveSeat,
      round: buildRoundDescriptor(runtime, null),
      signature: normalized.contextSignature || buildCoachContextSignature(runtime, seatKey),
      label: normalized.summary || null,
      updatedAt: normalized.updatedAt
    });
    flushDeferredCoachReviewForSeat(seatKey);
  }

  function normalizeCoachState(nextState = {}) {
    if (!nextState || typeof nextState !== 'object') {
      return {
        status: 'idle',
        source: null,
        perspectiveSeat: null,
        recommended: null,
        summary: null,
        raw: null,
        updatedAt: Date.now()
      };
    }

    return {
      status: typeof nextState.status === 'string' && nextState.status
        ? nextState.status
        : (nextState.ok === false ? 'error' : 'ready'),
      source: typeof nextState.source === 'string' ? nextState.source : null,
      perspectiveSeat: typeof nextState.perspectiveSeat === 'string'
        ? nextState.perspectiveSeat
        : (typeof nextState.perspectiveSeatKey === 'string' ? nextState.perspectiveSeatKey : null),
      recommended: normalizeCoachRecommended(nextState.recommended),
      humanRecommended: typeof nextState.humanRecommended === 'string' ? nextState.humanRecommended : null,
      reasons: Array.isArray(nextState.reasons)
        ? nextState.reasons.filter((item) => typeof item === 'string' && item.trim()).slice()
        : [],
      reasonSummary: typeof nextState.reasonSummary === 'string' ? nextState.reasonSummary : null,
      summary: typeof nextState.summary === 'string' ? nextState.summary : null,
      contextSignature: typeof nextState.contextSignature === 'string' ? nextState.contextSignature : null,
      hidden: Boolean(nextState.hidden),
      reviewMode: Boolean(nextState.reviewMode),
      raw: Object.prototype.hasOwnProperty.call(nextState, 'raw')
        ? cloneOrNull(nextState.raw)
        : cloneOrNull(nextState),
      updatedAt: Number.isFinite(Number(nextState.updatedAt))
        ? Number(nextState.updatedAt)
        : Date.now()
    };
  }

  function publishCoachState(nextState = null) {
    const runtime = global.AceMahjongGameRuntime || null;
    let normalized = nextState ? normalizeCoachState(nextState) : null;
    if (normalized && !normalized.reviewMode && normalized.recommended && runtime && typeof runtime.getSnapshot === 'function') {
      const seatKey = normalized.recommended.seat || normalized.perspectiveSeat || resolvePrimaryHumanSeat();
      normalized.contextSignature = normalized.contextSignature || buildCoachContextSignature(runtime, seatKey);
      const validation = validateCoachRecommendation(runtime, normalized);
      if (!validation.ok) {
        normalized = {
          ...normalized,
          status: 'stale',
          summary: validation.message || normalized.summary || '当前建议已经过时。',
          recommended: null,
          humanRecommended: null,
          reasons: [],
          reasonSummary: null
        };
      }
    }
    if (!normalized) {
      coachLiveState = null;
      coachReviewState = null;
      return syncPublishedCoachState();
    }
    if (normalized.reviewMode) {
      return setCoachReviewState(normalized);
    }
    return setCoachLiveState(normalized);
  }

  function clearCoachState() {
    pendingCoachSuggestionsBySeat.clear();
    pendingCoachSuggestionsBySignature.clear();
    return publishCoachState(null);
  }

  function normalizeCoachAnalysisState(nextState = {}) {
    if (!nextState || typeof nextState !== 'object') {
      return {
        status: 'idle',
        source: null,
        summary: null,
        report: null,
        raw: null,
        updatedAt: Date.now()
      };
    }

    return {
      status: typeof nextState.status === 'string' && nextState.status
        ? nextState.status
        : (nextState.ok === false ? 'error' : 'ready'),
      source: typeof nextState.source === 'string' ? nextState.source : null,
      summary: typeof nextState.summary === 'string' ? nextState.summary : null,
      report: nextState.report && typeof nextState.report === 'object' ? cloneOrNull(nextState.report) : null,
      raw: Object.prototype.hasOwnProperty.call(nextState, 'raw')
        ? cloneOrNull(nextState.raw)
        : cloneOrNull(nextState),
      updatedAt: Number.isFinite(Number(nextState.updatedAt))
        ? Number(nextState.updatedAt)
        : Date.now()
    };
  }

  function publishCoachAnalysisState(nextState = null) {
    coachAnalysisState = nextState ? normalizeCoachAnalysisState(nextState) : null;
    global.AceMahjongCoachAnalysisState = cloneOrNull(coachAnalysisState);
    persistBridgeState(COACH_ANALYSIS_STATE_STORAGE_KEY, coachAnalysisState);

    const table = global.AceZeroMahjongUI && global.AceZeroMahjongUI.table
      ? global.AceZeroMahjongUI.table
      : null;
    if (table && typeof table.setCoachAnalysisState === 'function') {
      try {
        table.setCoachAnalysisState(cloneOrNull(coachAnalysisState));
      } catch (error) {
        logRuntime('warn', 'coach analysis state 同步到 table 失败', {
          message: error && error.message ? error.message : String(error)
        });
      }
    }

    coachAnalysisStateListeners.forEach((listener) => {
      try {
        listener(cloneOrNull(coachAnalysisState));
      } catch (error) {
        logRuntime('warn', 'coach analysis listener 执行失败', {
          message: error && error.message ? error.message : String(error)
        });
      }
    });

    if (global.document && typeof global.CustomEvent === 'function' && typeof global.dispatchEvent === 'function') {
      try {
        global.dispatchEvent(new global.CustomEvent('ace-mahjong-coach-analysis-state', {
          detail: cloneOrNull(coachAnalysisState)
        }));
      } catch (error) {
        logRuntime('warn', 'coach analysis state CustomEvent 派发失败', {
          message: error && error.message ? error.message : String(error)
        });
      }
    }

    return cloneOrNull(coachAnalysisState);
  }

  function clearCoachAnalysisState() {
    return publishCoachAnalysisState(null);
  }

  function formatCoachStatusText(state = null) {
    if (!state) return 'coach: idle';
    const normalized = normalizeCoachState(state);
    const recommended = normalized.recommended;
    if (!recommended) return `coach: ${normalized.status}`;
    const actionType = recommended.type || 'unknown';
    const seat = recommended.seat || normalized.perspectiveSeat || 'unknown';
    const detail = recommended.tileCode || recommended.meldString || recommended.callType || '-';
    return `coach: ${normalized.status} · ${seat} · ${actionType} · ${detail}`;
  }

  function formatCoachDetailText(state = null) {
    if (!state) return 'coach detail: -';
    const normalized = normalizeCoachState(state);
    const recommended = normalized.recommended;
    if (!recommended) {
      return normalized.summary ? `coach detail: ${normalized.summary}` : 'coach detail: 暂无动作建议';
    }
    const parts = [];
    if (normalized.source) parts.push(`source=${normalized.source}`);
    if (normalized.perspectiveSeat) parts.push(`view=${normalized.perspectiveSeat}`);
    if (recommended.type) parts.push(`type=${recommended.type}`);
    if (recommended.seat) parts.push(`seat=${recommended.seat}`);
    if (recommended.tileCode) parts.push(`tile=${recommended.tileCode}`);
    if (recommended.callType) parts.push(`call=${recommended.callType}`);
    if (recommended.meldString) parts.push(`meld=${recommended.meldString}`);
    if (recommended.riichi) parts.push('riichi=true');
    if (normalized.reasonSummary) parts.push(`why=${normalized.reasonSummary}`);
    if (normalized.summary) parts.push(`summary=${normalized.summary}`);
    return `coach detail: ${parts.join(' · ') || '-'}`;
  }

  function inferBrowserActionType(action) {
    if (!action) return null;
    if (typeof action.type === 'string' && action.type && action.type !== 'ui-action') return action.type;
    if (typeof action.key === 'string' && action.key) {
      return action.key.split(':')[0];
    }
    return null;
  }

  function normalizeBrowserActionPayload(action) {
    if (!action || typeof action !== 'object') return {};
    return action.payload && typeof action.payload === 'object'
      ? { ...action.payload }
      : {};
  }

  function normalizeBrowserActionType(type = null) {
    const normalized = String(type || '').trim().toLowerCase();
    if (!normalized) return null;
    if (['discard', 'discard-index', 'pass', 'hule'].includes(normalized)) return normalized;
    if (['call', 'chi', 'peng', 'pon'].includes(normalized)) return 'call';
    if (['kan', 'gang', 'daiminkan', 'ankan', 'kakan'].includes(normalized)) return 'kan';
    return normalized;
  }

  function summarizeBrowserRuntimeAction(action = null, runtime = null) {
    const type = normalizeBrowserActionType(inferBrowserActionType(action));
    const payload = normalizeBrowserActionPayload(action);
    if (!type) return null;
    if (!['discard', 'discard-index', 'call', 'kan', 'pass', 'hule'].includes(type)) return null;
    const normalizedType = type === 'discard-index' ? 'discard' : type;
    let tileCode = typeof payload.tileCode === 'string' ? payload.tileCode : null;
    if (!tileCode && normalizedType === 'discard' && Number.isInteger(payload.tileIndex) && runtime) {
      const seatKey = typeof payload.seat === 'string' ? payload.seat : resolvePrimaryHumanSeat();
      const handCodes = getRuntimeSeatHandCodes(runtime, seatKey);
      if (payload.tileIndex >= 0 && payload.tileIndex < handCodes.length) {
        tileCode = handCodes[payload.tileIndex] || null;
      }
    }
    return {
      type: normalizedType,
      seat: typeof payload.seat === 'string' ? payload.seat : resolvePrimaryHumanSeat(),
      tileCode,
      fromSeat: typeof payload.fromSeat === 'string' ? payload.fromSeat : null,
      callType: typeof payload.callType === 'string' ? payload.callType : null,
      meldString: typeof payload.meldString === 'string'
        ? payload.meldString
        : (typeof payload.meld === 'string' ? payload.meld : null),
      riichi: Boolean(payload.riichi)
    };
  }

  function buildRuntimeDispatchAction(action = null, runtime = null) {
    if (!action || typeof action !== 'object') return action;
    if (action.type !== 'ui-action') return action;
    const normalized = summarizeBrowserRuntimeAction(action, runtime);
    if (!normalized || !normalized.type) return action;
    const payload = normalizeBrowserActionPayload(action);
    return {
      ...action,
      type: normalized.type,
      payload: {
        ...payload,
        seat: normalized.seat || payload.seat || null,
        tileCode: normalized.tileCode || payload.tileCode || null,
        fromSeat: normalized.fromSeat || payload.fromSeat || null,
        callType: normalized.callType || payload.callType || null,
        meldString: normalized.meldString || payload.meldString || payload.meld || null,
        meld: normalized.meldString || payload.meld || payload.meldString || null,
        riichi: normalized.riichi
      }
    };
  }

  function summarizeAction(action) {
    if (!action) return null;
    return {
      key: action.key || null,
      type: action.type || null,
      seat: action.payload && action.payload.seat ? action.payload.seat : null,
      label: action.label || null
    };
  }

  function getRuntimeSnapshotSafe(runtime) {
    if (!runtime || typeof runtime.getSnapshot !== 'function') return null;
    return runtime.getSnapshot();
  }

  function getSnapshotSeatHandCodes(snapshot, seatKey) {
    const seat = snapshot && snapshot.seats ? snapshot.seats[seatKey] : null;
    const handTiles = seat && Array.isArray(seat.handTiles) ? seat.handTiles : [];
    return handTiles
      .map((tile) => tile && tile.code ? tile.code : null)
      .filter(Boolean);
  }

  function getRuntimeSeatHandCodes(runtime, seatKey) {
    const snapshotCodes = getSnapshotSeatHandCodes(getRuntimeSnapshotSafe(runtime), seatKey);
    if (snapshotCodes.length) return snapshotCodes;
    if (runtime && typeof runtime.getSeatHandCodes === 'function') {
      return runtime.getSeatHandCodes(seatKey);
    }
    return [];
  }

  function getRuntimeSeatHandTileIndex(runtime, seatKey, tileCode) {
    const handCodes = getRuntimeSeatHandCodes(runtime, seatKey);
    const normalizedCode = typeof tileCode === 'string' ? tileCode.trim().toLowerCase() : '';
    if (!normalizedCode) return -1;
    for (let index = handCodes.length - 1; index >= 0; index -= 1) {
      const currentCode = String(handCodes[index] || '').replace(/[\*_\+\=\-]$/, '').toLowerCase();
      if (currentCode === normalizedCode) return index;
    }
    return -1;
  }

  function normalizeRoundResultTileCode(tileCode) {
    const value = String(tileCode || '').trim();
    const match = value.match(/^[mpsz][0-9]/i);
    return match ? match[0].toLowerCase() : null;
  }

  function extractHuleYakuNames(result = null) {
    return result && Array.isArray(result.hupai)
      ? result.hupai.map((item) => item && item.name).filter(Boolean)
      : [];
  }

  function buildHuleLogSummary(result = null) {
    if (!result || typeof result !== 'object') {
      return {
        番数: null,
        符数: null,
        役种名称: []
      };
    }
    return {
      番数: Number.isFinite(Number(result.fanshu)) ? Number(result.fanshu) : result.fanshu ?? null,
      符数: Number.isFinite(Number(result.fu)) ? Number(result.fu) : result.fu ?? null,
      役种名称: extractHuleYakuNames(result)
    };
  }

  function buildSeatWindLogDetail(snapshot = null) {
    const info = snapshot && snapshot.info ? snapshot.info : null;
    const seatWinds = info && info.seatWinds && typeof info.seatWinds === 'object'
      ? info.seatWinds
      : null;
    const seatWindMap = {};

    CANONICAL_SEAT_KEYS.forEach((seatKey) => {
      const windState = seatWinds && seatWinds[seatKey] ? seatWinds[seatKey] : null;
      seatWindMap[seatKey] = windState && typeof windState.label === 'string' && windState.label
        ? windState.label
        : null;
    });

    const dealerSeat = info && typeof info.dealerSeat === 'string' ? info.dealerSeat : null;
    const turnSeat = info && typeof info.turnSeat === 'string' ? info.turnSeat : null;

    return {
      风位映射: seatWindMap,
      dealerSeat,
      dealerWind: dealerSeat && seatWindMap[dealerSeat] ? seatWindMap[dealerSeat] : null,
      turnSeat,
      turnWind: turnSeat && seatWindMap[turnSeat] ? seatWindMap[turnSeat] : null
    };
  }

  function formatRoundCutInLabel(matchState = null) {
    if (!matchState || typeof matchState !== 'object') return '东一局';
    const windLabels = ['东', '南', '西', '北'];
    const zhuangfeng = Number.isInteger(matchState.zhuangfeng) ? matchState.zhuangfeng : 0;
    const jushu = Number.isInteger(matchState.jushu) ? matchState.jushu : 0;
    return `${windLabels[zhuangfeng] || '东'}${jushu + 1}局`;
  }

  function formatSpacedCutInLabel(label = '') {
    return String(label || '')
      .trim()
      .split('')
      .filter(Boolean)
      .join(' ');
  }

  function queueWinnerReveal(table, event, roundResult, options = {}) {
    if (!table || typeof table.playWinnerRevealForSeat !== 'function') return;
    if (!roundResult || roundResult.type !== 'hule') return;
    const winnerSeat = roundResult.winnerSeat || null;
    if (!winnerSeat) return;

    const snapshot = event && event.snapshot ? event.snapshot : null;
    const truthSeats = snapshot && snapshot.views && snapshot.views.truthView && snapshot.views.truthView.seats
      ? snapshot.views.truthView.seats
      : null;
    const seatSnapshot = truthSeats && truthSeats[winnerSeat]
      ? truthSeats[winnerSeat]
      : (snapshot && snapshot.seats ? snapshot.seats[winnerSeat] : null);
    const handTiles = seatSnapshot && Array.isArray(seatSnapshot.handTiles)
      ? seatSnapshot.handTiles.map((tile) => ({ ...tile }))
      : [];
    const winningTileCode = normalizeRoundResultTileCode(roundResult.rongpai || roundResult.tileCode || null);
    const delayMs = Number.isFinite(Number(options.delayMs)) ? Number(options.delayMs) : 420;

    window.setTimeout(() => {
      try {
        table.playWinnerRevealForSeat(winnerSeat, {
          handTiles,
          winningTileCode,
          autoClearMs: 0
        });
      } catch (error) {
        logRuntime('warn', '和牌后赢家推平动画播放失败', {
          winnerSeat,
          winningTileCode,
          message: error && error.message ? error.message : String(error)
        });
      }
    }, Math.max(0, delayMs));
  }

  function queueSettlementPanel(table, payload = {}, options = {}) {
    if (!table || typeof table.openSettlementPanel !== 'function') return;
    const delayMs = Number.isFinite(Number(options.delayMs)) ? Number(options.delayMs) : 720;
    window.setTimeout(() => {
      try {
        table.openSettlementPanel(payload);
      } catch (error) {
        logRuntime('warn', '结算面板打开失败', {
          message: error && error.message ? error.message : String(error),
          roundType: payload && payload.roundResult ? payload.roundResult.type : null
        });
      }
    }, Math.max(0, delayMs));
  }

  function isRuntimeAwaitingBottomDiscard(runtime) {
    const snapshot = getRuntimeSnapshotSafe(runtime);
    if (!snapshot) return false;
    const turnSeat = snapshot.turnSeat
      || (snapshot.info ? snapshot.info.turnSeat : null)
      || null;
    return snapshot.phase === BROWSER_RUNTIME_PHASES.AWAIT_DISCARD
      && turnSeat === 'bottom';
  }

  function dispatchRuntimeAction(runtime, action) {
    if (!runtime || typeof runtime.dispatch !== 'function') return null;
    const availabilityBeforeDispatch = getCoachRequestAvailability(runtime);
    const normalizedAction = summarizeBrowserRuntimeAction(action, runtime);
    const runtimeAction = buildRuntimeDispatchAction(action, runtime);
    let actionableSignature = null;
    let existingPendingForSeat = null;
    const shouldPrepareAutoReview = Boolean(
      autoCoachEnabled
      && availabilityBeforeDispatch
      && availabilityBeforeDispatch.ok
      && normalizedAction
      && normalizedAction.seat === availabilityBeforeDispatch.playerSeat
      && ['discard', 'call', 'kan', 'pass', 'hule'].includes(normalizedAction.type)
    );
    const shouldPrimeReactionReview = Boolean(
      autoCoachEnabled
      && availabilityBeforeDispatch
      && availabilityBeforeDispatch.ok
      && availabilityBeforeDispatch.phase === 'await_reaction'
      && normalizedAction
      && normalizedAction.seat === availabilityBeforeDispatch.playerSeat
      && ['pass', 'hule', 'call', 'kan'].includes(normalizedAction.type)
    );
    const shouldTrackImmediateReview = Boolean(
      autoCoachEnabled
      && availabilityBeforeDispatch
      && availabilityBeforeDispatch.ok
      && normalizedAction
      && normalizedAction.seat === availabilityBeforeDispatch.playerSeat
      && (normalizedAction.type === 'pass' || normalizedAction.type === 'hule')
    );
    if (shouldPrepareAutoReview) {
      actionableSignature = buildCoachContextSignature(runtime, availabilityBeforeDispatch.playerSeat);
      latestActionableCoachSignatureBySeat.set(availabilityBeforeDispatch.playerSeat, actionableSignature);
      existingPendingForSeat = getPendingCoachSuggestion(availabilityBeforeDispatch.playerSeat, actionableSignature);
      if (!existingPendingForSeat || existingPendingForSeat.signature !== actionableSignature) {
        deletePendingCoachSuggestion(availabilityBeforeDispatch.playerSeat);
      }
      const preDispatchSnapshot = typeof runtime.getSnapshot === 'function' ? runtime.getSnapshot() : null;
      deferredCoachReviewBySeat.set(availabilityBeforeDispatch.playerSeat, {
        runtime,
        event: {
          type: `player:${normalizedAction.type}`,
          payload: cloneOrNull(action && action.payload ? action.payload : {}),
          snapshot: getRuntimeSnapshotSafe(runtime),
          timestamp: Date.now()
        },
        actualAction: cloneOrNull(normalizedAction),
        expectedSignature: actionableSignature,
        availableActions: preDispatchSnapshot
          ? cloneOrNull(getAvailableActionsForSeat(preDispatchSnapshot, availabilityBeforeDispatch.playerSeat))
          : [],
        coachDecision: existingPendingForSeat && existingPendingForSeat.signature === actionableSignature
          ? cloneOrNull(existingPendingForSeat.coachDecision)
          : null,
        label: existingPendingForSeat && existingPendingForSeat.signature === actionableSignature
          ? existingPendingForSeat.label || null
          : null,
        recordedAt: Date.now(),
        unavailableShown: false
      });
      requestCoachSuggestion({
        source: 'auto-review-background',
        trigger: `pre-dispatch-${normalizedAction.type}`,
        background: true,
        hidden: true,
        stickyContextSignature: true
      }).catch(() => null);
    }
    if (shouldPrimeReactionReview) {
      const reactionSignature = buildCoachContextSignature(runtime, availabilityBeforeDispatch.playerSeat);
      latestActionableCoachSignatureBySeat.set(availabilityBeforeDispatch.playerSeat, reactionSignature);
      deletePendingCoachSuggestion(availabilityBeforeDispatch.playerSeat);
    }
    try {
      const result = runtime.dispatch(runtimeAction);
      if (shouldTrackImmediateReview) {
        recordCoachAnalysisObservation(runtime, {
          type: `player:${normalizedAction.type}`,
          payload: cloneOrNull(action && action.payload ? action.payload : {}),
          snapshot: getRuntimeSnapshotSafe(runtime),
          timestamp: Date.now()
        }, normalizedAction);
      }
      return result;
    } catch (error) {
      logRuntime('error', 'runtime action 执行失败，已阻止未处理异常', {
        actionKey: action && action.key ? action.key : null,
        actionType: action && action.type ? action.type : inferBrowserActionType(action),
        seat: action && action.payload && action.payload.seat ? action.payload.seat : null,
        message: error && error.message ? error.message : String(error)
      });
      if (typeof runtime.refreshActionWindow === 'function') {
        try {
          runtime.refreshActionWindow();
        } catch (refreshError) {
          logRuntime('warn', 'runtime action 失败后刷新 action window 失败', {
            message: refreshError && refreshError.message ? refreshError.message : String(refreshError)
          });
        }
      }
      return syncRuntimeToFrontend(runtime);
    }
  }

  function startRuntimeSession(runtime) {
    if (!runtime) return null;
    if (global.AceZeroMahjongUI
      && global.AceZeroMahjongUI.hand
      && typeof global.AceZeroMahjongUI.hand.prepareDealReveal === 'function') {
      global.AceZeroMahjongUI.hand.prepareDealReveal();
    }
    if (typeof runtime.startSession === 'function') {
      return runtime.startSession();
    }
    if (typeof runtime.start === 'function') {
      return runtime.start();
    }
    return null;
  }

  function syncRuntimeToFrontend(runtime) {
    const snapshot = getRuntimeSnapshotSafe(runtime);
    if (!snapshot) return null;
    if (!global.AceZeroMahjongUI || !global.AceZeroMahjongUI.table || typeof global.AceZeroMahjongUI.table.applySnapshot !== 'function') {
      reconcileCoachSuggestionForCurrentAvailability(runtime, 'snapshot-sync');
      return snapshot;
    }
    global.AceZeroMahjongUI.table.applySnapshot(snapshot);
    reconcileCoachSuggestionForCurrentAvailability(runtime, 'snapshot-sync');
    return snapshot;
  }

  function isRuntimeContractCompatible(runtime) {
    return Boolean(
      runtime
      && typeof runtime.start === 'function'
      && typeof runtime.dispatch === 'function'
      && typeof runtime.getSnapshot === 'function'
      && typeof runtime.subscribe === 'function'
    );
  }

  function findExternalRuntimeFactory() {
    const candidates = [
      global.AceMahjongFormalRuntimeFactory,
      global.AceMahjongEngineRuntimeFactory,
      global.AceMahjongRuntimeFactory,
      global.AceMahjongEngine
    ].filter(Boolean);

    for (const candidate of candidates) {
      if (candidate && typeof candidate.createRuntime === 'function') {
        return candidate;
      }
    }

    return null;
  }

  function resolveLegacyRuntimeScriptUrl() {
    if (typeof global.AceMahjongLegacyRuntimeScriptUrl === 'string' && global.AceMahjongLegacyRuntimeScriptUrl) {
      return global.AceMahjongLegacyRuntimeScriptUrl;
    }
    if (typeof document === 'undefined' || !document.querySelectorAll) return null;
    const script = Array.from(document.querySelectorAll('script[src]')).find((node) => (
      typeof node.src === 'string' && /runtime-bridge\.js(?:\?|$)/.test(node.src)
    ));
    if (!script || !script.src) return null;
    try {
      return new URL('../formal/legacy-runtime-factory.js', script.src).toString();
    } catch (error) {
      return null;
    }
  }

  function loadScriptOnce(url) {
    if (!url) {
      return Promise.reject(new Error('Legacy runtime script URL could not be resolved.'));
    }
    if (typeof document === 'undefined' || !document.createElement) {
      return Promise.reject(new Error('Dynamic legacy runtime loading requires document access.'));
    }

    const existingScript = Array.from(document.querySelectorAll('script[src]')).find((node) => node.src === url);
    if (existingScript && global.AceMahjongLegacyBrowserRuntimeFactory) {
      return Promise.resolve(global.AceMahjongLegacyBrowserRuntimeFactory);
    }
    if (existingScript && !global.AceMahjongLegacyBrowserRuntimeFactory) {
      return Promise.reject(new Error('Legacy runtime script tag already exists, but factory is not available.'));
    }

    if (legacyRuntimeFactoryLoadPromise) {
      return legacyRuntimeFactoryLoadPromise;
    }

    legacyRuntimeFactoryLoadPromise = new Promise((resolve, reject) => {
      const script = existingScript || document.createElement('script');
      if (!existingScript) {
        script.src = url;
        script.async = false;
      }

      const cleanup = () => {
        script.removeEventListener('load', handleLoad);
        script.removeEventListener('error', handleError);
      };
      const handleLoad = () => {
        cleanup();
        if (global.AceMahjongLegacyBrowserRuntimeFactory) {
          resolve(global.AceMahjongLegacyBrowserRuntimeFactory);
          return;
        }
        reject(new Error('Legacy runtime script loaded, but factory was not registered.'));
      };
      const handleError = () => {
        cleanup();
        reject(new Error(`Failed to load legacy runtime script: ${url}`));
      };

      script.addEventListener('load', handleLoad, { once: true });
      script.addEventListener('error', handleError, { once: true });

      if (!existingScript) {
        const parent = document.head || document.body || document.documentElement;
        parent.appendChild(script);
      }
    }).finally(() => {
      legacyRuntimeFactoryLoadPromise = null;
    });

    return legacyRuntimeFactoryLoadPromise;
  }

  async function ensureLegacyRuntimeFactory() {
    if (global.AceMahjongLegacyBrowserRuntimeFactory) {
      return global.AceMahjongLegacyBrowserRuntimeFactory;
    }

    const scriptUrl = resolveLegacyRuntimeScriptUrl();
    const factory = await loadScriptOnce(scriptUrl);
    if (!factory || typeof factory.createRuntime !== 'function') {
      throw new Error('AceMahjongLegacyBrowserRuntimeFactory is required for legacy fallback runtime.');
    }
    return factory;
  }

  async function createLegacyRuntime(config = {}) {
    const legacyFactory = await ensureLegacyRuntimeFactory();
    if (!legacyFactory || typeof legacyFactory.createRuntime !== 'function') {
      throw new Error('AceMahjongLegacyBrowserRuntimeFactory is required for legacy fallback runtime.');
    }
    return legacyFactory.createRuntime(config, getLegacyRuntimeDependencies());
  }

  function shouldAllowLegacyFallback(config = {}) {
    return Boolean(global.AceMahjongEnableLegacyRuntimeFallback)
      || Boolean(config && config.runtime && config.runtime.allowLegacyFallback)
      || Boolean(config && config.testing && config.testing.allowLegacyRuntimeFallback);
  }

  function describeRuntime(runtime) {
    if (!runtime) {
      return {
        kind: 'unknown-runtime',
        source: 'unknown',
        mode: null
      };
    }

    return {
      kind: runtime.kind || 'unknown-runtime',
      source: runtime.source || 'unknown',
      mode: runtime.mode || null
    };
  }

  function getLegacyRuntimeDependencies() {
    return {
      clone,
      inferBrowserActionType,
      normalizeBrowserActionPayload,
      logRuntime
    };
  }

  async function createPreferredRuntime(config = {}) {
    const externalFactory = findExternalRuntimeFactory();

    if (externalFactory && typeof externalFactory.createRuntime === 'function') {
      try {
        const runtime = await Promise.resolve(externalFactory.createRuntime(config));
        if (runtime) {
          return {
            runtime,
            externalFactory,
            source: 'external-factory'
          };
        }
      } catch (error) {
        if (!shouldAllowLegacyFallback(config)) {
          logRuntime('error', '外部 runtime 工厂创建失败，且 legacy fallback 未启用', {
            message: error && error.message ? error.message : String(error)
          });
          throw error;
        }
        logRuntime('warn', '外部 runtime 工厂创建失败，按显式配置回退到 legacy browser runtime', {
          message: error && error.message ? error.message : String(error)
        });
      }
    }

    if (!shouldAllowLegacyFallback(config)) {
      throw new Error('Formal runtime unavailable, and legacy fallback is disabled.');
    }

    return {
      runtime: await createLegacyRuntime(config),
      externalFactory: null,
      source: 'legacy-browser-runtime'
    };
  }

  const BROWSER_RUNTIME_PHASES = Object.freeze({
    AWAIT_DRAW: 'await_draw',
    AWAIT_DISCARD: 'await_discard',
    AWAIT_REACTION: 'await_reaction',
    AWAIT_RESOLUTION: 'await_resolution',
    ROUND_END: 'round_end'
  });

  function bindRuntimeToFrontend(runtime) {
    runtime.subscribe((event) => {
      syncRuntimeToFrontend(runtime);
      clearActionableCoachStateIfStale(runtime);
      logRuntime('debug', 'runtime 事件', {
        type: event && event.type ? event.type : 'unknown',
        phase: event && event.snapshot ? event.snapshot.phase : null,
        turnSeat: event && event.snapshot && event.snapshot.info ? event.snapshot.info.turnSeat : null,
        payload: event && event.payload ? clone(event.payload) : null
      });
      const table = global.AceZeroMahjongUI && global.AceZeroMahjongUI.table
        ? global.AceZeroMahjongUI.table
        : null;

      if (event.type === 'session:round-start') {
        if (coachContextStore && typeof coachContextStore.clear === 'function') {
          coachContextStore.clear();
        }
      }

      if (event.type === 'deal:initial') {
        const normalizedInitialDeal = normalizeInitialDeal(event.payload);
        if (coachContextStore) {
          if (typeof coachContextStore.resetRoundContext === 'function') {
            coachContextStore.resetRoundContext(event && event.snapshot ? event.snapshot : null, normalizedInitialDeal);
          }
          if (typeof coachContextStore.appendRuntimeEvent === 'function') {
            coachContextStore.appendRuntimeEvent(event);
          }
        }
        if (table && typeof table.clearWinnerReveal === 'function') {
          table.clearWinnerReveal();
        }
        if (global.AceZeroMahjongUI
          && global.AceZeroMahjongUI.hand
          && typeof global.AceZeroMahjongUI.hand.playDealReveal === 'function') {
          window.setTimeout(() => {
            global.AceZeroMahjongUI.hand.playDealReveal({
              durationMs: 420,
              staggerMs: 42
            });
          }, 30);
        }
        logRuntime('info', '发牌完成', {
          source: event.payload && event.payload.source ? event.payload.source : null,
          baopai: event.payload && Array.isArray(event.payload.baopai) ? event.payload.baopai.slice() : [],
          remaining: event.payload ? event.payload.remaining : null,
          haipai: event.payload && Array.isArray(event.payload.haipai) ? clone(event.payload.haipai) : [],
          ...buildSeatWindLogDetail(event && event.snapshot ? event.snapshot : null)
        });
      }
      if (event.type !== 'deal:initial' && coachContextStore && typeof coachContextStore.appendRuntimeEvent === 'function') {
        coachContextStore.appendRuntimeEvent(event);
      }

      if (event.type === 'tile:draw' || event.type === 'tile:gang-draw') {
        logRuntime('info', event.type === 'tile:gang-draw' ? '岭上摸牌' : '摸牌', {
          seat: event.payload && event.payload.seat ? event.payload.seat : null,
          tileCode: event.payload && event.payload.tileCode ? event.payload.tileCode : null,
          source: event.payload && event.payload.source ? event.payload.source : null,
          remaining: event.payload ? event.payload.remaining : null
        });
      }

      if (event.type === 'tile:kita') {
        const seatKey = event.payload && event.payload.seat ? event.payload.seat : 'bottom';
        const seatSnapshot = event.snapshot && event.snapshot.seats
          ? event.snapshot.seats[seatKey]
          : null;
        const kitaIndex = seatSnapshot && Array.isArray(seatSnapshot.kitaTiles)
          ? seatSnapshot.kitaTiles.length - 1
          : 0;
        logRuntime('info', '拔北', {
          seat: seatKey,
          tileCode: event.payload && event.payload.tileCode ? event.payload.tileCode : 'z4',
          replacementTileCode: event.payload && event.payload.replacementTileCode ? event.payload.replacementTileCode : null,
          kitaCount: event.payload && Number.isFinite(Number(event.payload.kitaCount))
            ? Number(event.payload.kitaCount)
            : null,
          remaining: event.payload ? event.payload.remaining : null
        });
        if (!table) return;
        try {
          if (typeof table.playCutIn === 'function') {
            table.playCutIn('kita', {
              label: '拔北'
            });
          }
          if (typeof table.playAnimation === 'function') {
            table.playAnimation('kita', {
              seat: seatKey,
              area: 'kita',
              tileIndex: Math.max(0, kitaIndex)
            });
          }
        } catch (animationError) {
          logRuntime('warn', '拔北演出失败，已跳过不阻塞主流程', {
            seat: seatKey,
            message: animationError && animationError.message ? animationError.message : String(animationError)
          });
        }
        return;
      }

      if (event.type === 'dora:flip') {
        const snapshotWallState = event && event.snapshot ? event.snapshot.wallState : null;
        logRuntime('info', '翻宝', {
          tileCode: event.payload && event.payload.tileCode ? event.payload.tileCode : null,
          source: event.payload && event.payload.source ? event.payload.source : null,
          baopai: event.payload && Array.isArray(event.payload.baopai)
            ? event.payload.baopai.slice()
            : [],
          revealedDoraCount: snapshotWallState && Number.isFinite(Number(snapshotWallState.revealedDoraCount))
            ? Number(snapshotWallState.revealedDoraCount)
            : null,
          remaining: event.payload ? event.payload.remaining : null
        });
      }

      if (event.type !== 'tile:discard' && event.type !== 'meld:call' && event.type !== 'meld:kan') {
        scheduleAutoCoachSuggestion(runtime, event && event.type ? event.type : 'runtime-event');
      }

      if (!table) return;

      if (event.type === 'tile:discard') {
        recordCoachAnalysisObservation(runtime, event, summarizeActualActionFromEvent(event));
        logRuntime('info', '打牌', {
          seat: event.payload && event.payload.seat ? event.payload.seat : null,
          tileCode: event.payload && event.payload.tileCode ? event.payload.tileCode : null,
          riichi: Boolean(event.payload && event.payload.riichi)
        });
        const seatSnapshot = event.snapshot.seats[event.payload.seat];
        const tileIndex = seatSnapshot && seatSnapshot.riverTiles ? seatSnapshot.riverTiles.length - 1 : 0;
        table.playAnimation('discard', { seat: event.payload.seat, area: 'river', tileIndex });
        if (event.payload.riichi) {
          if (typeof table.playCutIn === 'function') {
            table.playCutIn('riichi');
          }
          table.playAnimation('riichi-stick', { type: 'riichi-stick', seat: event.payload.seat });
        }
        scheduleAutoCoachSuggestion(runtime, event.type);
        return;
      }

      if (event.type === 'meld:call' || event.type === 'meld:kan') {
        recordCoachAnalysisObservation(runtime, event, summarizeActualActionFromEvent(event));
        const seatSnapshot = event.snapshot && event.snapshot.seats
          ? event.snapshot.seats[event.payload.seat]
          : null;
        const meldIndex = seatSnapshot && Array.isArray(seatSnapshot.melds)
          ? seatSnapshot.melds.length - 1
          : 0;
        const latestMeld = seatSnapshot && Array.isArray(seatSnapshot.melds)
          ? seatSnapshot.melds[meldIndex] || null
          : null;
        logRuntime('info', '副露/杠事件已同步到前端', {
          seat: event && event.payload ? event.payload.seat : null,
          type: event ? event.type : null,
          meld: event && event.payload ? (event.payload.meld || null) : null,
          meldIndex,
          latestMeld: latestMeld ? clone(latestMeld) : null
        });
        if (typeof table.playCutIn === 'function') {
          table.playCutIn(latestMeld ? latestMeld.type : (event.type === 'meld:kan' ? 'kan' : 'peng'));
        }
        table.playAnimation('meld', {
          seat: event.payload.seat,
          area: 'meld',
          tileIndex: meldIndex
        });
        scheduleAutoCoachSuggestion(runtime, event.type);
        return;
      }

      if (event.type === 'round:hule') {
        clearDeferredCoachReviewState();
        if (typeof table.clearRuntimeHandStatusOverlay === 'function') {
          table.clearRuntimeHandStatusOverlay();
        }
        const roundResult = event.payload && event.payload.roundResult ? event.payload.roundResult : null;
        const winners = roundResult && Array.isArray(roundResult.winners)
          ? roundResult.winners.map((entry) => ({
              winnerSeat: entry && entry.winnerSeat ? entry.winnerSeat : null,
              fromSeat: entry && entry.fromSeat ? entry.fromSeat : null,
              ...buildHuleLogSummary(entry && entry.result ? entry.result : null)
            }))
          : [];
        const huleSummary = buildHuleLogSummary(event.payload && event.payload.result ? event.payload.result : null);
        logRuntime('info', '和牌结束', {
          winnerSeat: roundResult ? roundResult.winnerSeat : null,
          fromSeat: roundResult ? roundResult.fromSeat : null,
          winnerCount: roundResult ? Number(roundResult.winnerCount || 0) : 0,
          multiHule: Boolean(roundResult && roundResult.multiHule),
          baojiaSeat: roundResult ? roundResult.baojiaSeat : null,
          baojiaYaku: roundResult ? roundResult.baojiaYaku : null,
          番数: huleSummary.番数,
          符数: huleSummary.符数,
          役种名称: huleSummary.役种名称,
          winners,
          yaku: huleSummary.役种名称,
          fanshu: huleSummary.番数,
          fu: huleSummary.符数,
          changbangBefore: roundResult ? roundResult.changbang : null,
          lizhibangBefore: roundResult ? roundResult.lizhibang : null,
          scores: roundResult ? clone(roundResult.scores || {}) : {}
        });
        queueWinnerReveal(table, event, roundResult, {
          delayMs: 0
        });
        if (typeof table.playCutIn === 'function') {
          const cutInType = roundResult && !roundResult.fromSeat ? 'tsumo' : 'hule';
          const cutInLabel = roundResult && roundResult.multiHule
            ? `${Math.max(2, Number(roundResult.winnerCount || 2))}家和了`
            : null;
          table.playCutIn(cutInType, cutInLabel ? { label: cutInLabel } : {});
        }
        queueSettlementPanel(table, {
          roundResult,
          snapshot: event && event.snapshot ? event.snapshot : null
        }, {
          delayMs: roundResult && roundResult.multiHule ? 820 : 900
        });
        return;
      }

      if (event.type === 'round:draw') {
        clearDeferredCoachReviewState();
        if (typeof table.clearRuntimeHandStatusOverlay === 'function') {
          table.clearRuntimeHandStatusOverlay();
        }
        const roundResult = event.payload && event.payload.roundResult ? event.payload.roundResult : null;
        logRuntime('info', '流局结束', {
          reason: roundResult ? roundResult.reason : null,
          changbangBefore: roundResult ? roundResult.changbang : null,
          lizhibangBefore: roundResult ? roundResult.lizhibang : null,
          tenpaiSeats: roundResult && Array.isArray(roundResult.tenpaiSeats)
            ? roundResult.tenpaiSeats.slice()
            : [],
          notenSeats: roundResult && Array.isArray(roundResult.notenSeats)
            ? roundResult.notenSeats.slice()
            : [],
          revealedHands: roundResult && Array.isArray(roundResult.revealedHands)
            ? roundResult.revealedHands.slice()
            : [],
          scores: roundResult ? clone(roundResult.scores || {}) : {}
        });
        if (typeof table.playCutIn === 'function') {
          table.playCutIn(roundResult && roundResult.reason ? roundResult.reason : 'draw', {
            label: formatSpacedCutInLabel('流局'),
            watermarkLabel: roundResult && roundResult.reason ? roundResult.reason : '流局',
            layout: 'round',
            styleType: 'normal',
            disableShake: true,
            duration: 2000,
            exitDuration: 500
          });
        }
        queueSettlementPanel(table, {
          roundResult,
          snapshot: event && event.snapshot ? event.snapshot : null
        }, {
          delayMs: 2220
        });
      }

      if (event.type === 'reaction-window:open') {
        const reactionSeat = resolvePrimaryHumanSeat();
        const reactionSignature = buildCoachContextSignature(runtime, reactionSeat);
        clearCoachReviewForUpcomingAction(reactionSignature, reactionSeat);
        logRuntime('info', '反应窗口打开', {
          fromSeat: event.payload && event.payload.fromSeat ? event.payload.fromSeat : null,
          tileCode: event.payload && event.payload.tileCode ? event.payload.tileCode : null,
          actions: event.payload && Array.isArray(event.payload.actions)
            ? event.payload.actions.map(summarizeAction)
            : []
        });
      }

      if (event.type === 'reaction-window:closed' || event.type === 'reaction-window:empty') {
        clearActionableCoachStateIfStale(runtime);
        logRuntime('info', event.type === 'reaction-window:closed' ? '反应窗口关闭' : '反应窗口为空', {
          fromSeat: event.payload && event.payload.fromSeat ? event.payload.fromSeat : null,
          tileCode: event.payload && event.payload.tileCode ? event.payload.tileCode : null,
          nextSeat: event.payload && event.payload.nextSeat ? event.payload.nextSeat : null,
          reason: event.payload && event.payload.reason ? event.payload.reason : null
        });
      }

      if (event.type === 'session:transition') {
        const decision = event.payload && event.payload.transitionDecision ? event.payload.transitionDecision : null;
        logRuntime('info', '多局转场完成', {
          transitionCase: decision ? decision.transitionCase : null,
          dealerContinues: decision ? Boolean(decision.dealerContinues) : null,
          nextDealerSeat: decision ? decision.nextDealerSeat : null,
          nextZhuangfeng: decision ? decision.nextZhuangfeng : null,
          nextJushu: decision ? decision.nextJushu : null,
          changbangBefore: decision ? decision.changbangBefore : null,
          changbangAfter: decision ? decision.changbangAfter : null,
          lizhibangBefore: decision ? decision.lizhibangBefore : null,
          lizhibangAfter: decision ? decision.lizhibangAfter : null,
          finishReason: decision ? decision.finishReason : null
        });
        return;
      }

      if (event.type === 'session:round-start') {
        clearDeferredCoachReviewState();
        publishCoachState(null);
        const matchState = event.payload && event.payload.matchState ? event.payload.matchState : null;
        if (global.AceZeroMahjongUI
          && global.AceZeroMahjongUI.hand
          && typeof global.AceZeroMahjongUI.hand.prepareDealReveal === 'function') {
          global.AceZeroMahjongUI.hand.prepareDealReveal();
        }
        if (typeof table.playCutIn === 'function') {
          const roundLabel = formatRoundCutInLabel(matchState);
          table.playCutIn('round-start', {
            label: formatSpacedCutInLabel(roundLabel),
            watermarkLabel: roundLabel,
            layout: 'round',
            styleType: 'normal',
            disableShake: true,
            duration: 2000,
            exitDuration: 500
          });
        }
        logRuntime('info', '下一局已开始', {
          zhuangfeng: matchState ? matchState.zhuangfeng : null,
          jushu: matchState ? matchState.jushu : null,
          dealerSeat: matchState ? matchState.dealerSeat : null,
          changbang: matchState ? matchState.changbang : null,
          lizhibang: matchState ? matchState.lizhibang : null,
          ...buildSeatWindLogDetail(event && event.snapshot ? event.snapshot : null)
        });
        return;
      }

      if (event.type === 'session:finished') {
        clearDeferredCoachReviewState();
        publishCoachState(null);
        const matchState = event.payload && event.payload.matchState ? event.payload.matchState : null;
        logRuntime('info', '整场结束', {
          finishReason: event.payload && event.payload.finishReason ? event.payload.finishReason : null,
          scores: matchState ? clone(matchState.scores || {}) : {},
          roundIndex: matchState ? matchState.roundIndex : null
        });
      }
    });
  }

  function bindRuntimeActionHandlers(runtime) {
    if (global.AceZeroMahjongUI.actions && typeof global.AceZeroMahjongUI.actions.setActionHandler === 'function') {
      global.AceZeroMahjongUI.actions.setActionHandler((actionOrKey) => {
        const action = actionOrKey && typeof actionOrKey === 'object'
          ? actionOrKey
          : {
              type: 'ui-action',
              key: actionOrKey,
              payload: { actionKey: actionOrKey }
            };
        logRuntime('debug', '动作按钮被点击', {
          actionKey: action && action.key ? action.key : null,
          type: action && action.type ? action.type : null
        });
        const actionType = inferBrowserActionType(action);
        const payload = normalizeBrowserActionPayload(action);
        const isReactionMeld = (actionType === 'call' || actionType === 'kan' || actionType === 'gang')
          && payload.preview
          && global.AceZeroMahjongUI
          && global.AceZeroMahjongUI.table
          && typeof global.AceZeroMahjongUI.table.animateReactionMeldCapture === 'function';

        if (isReactionMeld) {
          global.AceZeroMahjongUI.table.animateReactionMeldCapture(action, () => {
            dispatchRuntimeAction(runtime, action);
          });
          return;
        }

        if ((actionType === 'kita' || actionType === 'nuki' || actionType === 'bei')
          && payload.seat === 'bottom'
          && global.AceZeroMahjongUI
          && global.AceZeroMahjongUI.table
          && typeof global.AceZeroMahjongUI.table.animateBottomHandDiscard === 'function') {
          const kitaTileIndex = getRuntimeSeatHandTileIndex(runtime, 'bottom', 'z4');
          if (kitaTileIndex >= 0) {
            global.AceZeroMahjongUI.table.animateBottomHandDiscard(kitaTileIndex, () => {
              dispatchRuntimeAction(runtime, action);
            });
            return;
          }
        }

        dispatchRuntimeAction(runtime, action);
      });
    }
  }

  function bindBottomHandInteraction(runtime) {
    const handleBottomDiscardRequest = (detail, source) => {
      if (!isRuntimeAwaitingBottomDiscard(runtime)) return false;
      if (!detail || !Number.isInteger(detail.tileIndex)) return false;
      if (typeof runtime.canDiscardHandTileAtIndex === 'function' && !runtime.canDiscardHandTileAtIndex('bottom', detail.tileIndex)) {
        logRuntime('debug', '忽略非法立直打牌选择', {
          seat: 'bottom',
          source: source || 'unknown',
          tileIndex: detail.tileIndex,
          handCodes: getRuntimeSeatHandCodes(runtime, 'bottom')
        });
        return false;
      }
      logRuntime('debug', '底家点击手牌准备打牌', {
        seat: 'bottom',
        source: source || 'unknown',
        tileIndex: detail && detail.tileIndex,
        handCodes: getRuntimeSeatHandCodes(runtime, 'bottom')
      });
      if (typeof global.AceZeroMahjongUI.table.animateBottomHandDiscard === 'function') {
        global.AceZeroMahjongUI.table.animateBottomHandDiscard(detail.tileIndex, () => {
          dispatchRuntimeAction(runtime, {
            type: 'discard-index',
            payload: {
              seat: 'bottom',
              tileIndex: detail.tileIndex
            }
          });
        });
        return true;
      }
      dispatchRuntimeAction(runtime, {
        type: 'discard-index',
        payload: {
          seat: 'bottom',
          tileIndex: detail.tileIndex
        }
      });
      return true;
    };

    if (global.AceZeroMahjongUI.table && typeof global.AceZeroMahjongUI.table.setBottomHandInteractionHandler === 'function') {
      global.AceZeroMahjongUI.table.setBottomHandInteractionHandler((detail) => (
        handleBottomDiscardRequest(detail, 'table')
      ));
    }

    if (global.AceZeroMahjongUI.hand && typeof global.AceZeroMahjongUI.hand.setInteractionHandler === 'function') {
      global.AceZeroMahjongUI.hand.setInteractionHandler((detail) => (
        handleBottomDiscardRequest(detail, 'hand-layer')
      ));
    }
  }

  function bindSettlementContinue(runtime) {
    if (!runtime || typeof runtime.continueToNextRound !== 'function') return;
    if (!global.AceZeroMahjongUI || !global.AceZeroMahjongUI.table
      || typeof global.AceZeroMahjongUI.table.setSettlementActionHandler !== 'function') {
      return;
    }
    global.AceZeroMahjongUI.table.setSettlementActionHandler(async () => {
      try {
        if (typeof global.AceZeroMahjongUI.table.clearWinnerReveal === 'function') {
          global.AceZeroMahjongUI.table.clearWinnerReveal();
        }
        if (typeof global.AceZeroMahjongUI.table.closeSettlementPanel === 'function') {
          global.AceZeroMahjongUI.table.closeSettlementPanel();
        }
        await runtime.continueToNextRound({
          startDelayMs: 2500
        });
        if (typeof global.AceZeroMahjongUI.table.clearWinnerReveal === 'function') {
          global.AceZeroMahjongUI.table.clearWinnerReveal();
        }
        syncRuntimeToFrontend(runtime);
      } catch (error) {
        logRuntime('error', '结算继续进入下一局失败', {
          message: error && error.message ? error.message : String(error)
        });
      }
    });
  }

  function isFrontendRuntimeReady() {
    return Boolean(
      global.AceZeroMahjongUI
      && global.AceZeroMahjongUI.table
      && typeof global.AceZeroMahjongUI.table.applySnapshot === 'function'
    );
  }

  function stopActiveRuntime() {
    const activeRuntime = global.AceMahjongGameRuntime;
    if (!activeRuntime) return null;
    if (typeof activeRuntime.clearAutoTurnTimer === 'function') {
      activeRuntime.clearAutoTurnTimer();
    } else if (activeRuntime.autoTurnTimer) {
      window.clearTimeout(activeRuntime.autoTurnTimer);
    }
    clearCoachState();
    clearCoachAnalysisAccumulator();
    clearCoachAnalysisState();
    autoCoachRequestQueued = false;
    queuedAutoCoachRequest = null;
    if (coachContextStore && typeof coachContextStore.clear === 'function') {
      coachContextStore.clear();
    }
    activeRuntimeConfig = null;
    return activeRuntime;
  }

  function mountRuntime(runtime) {
    if (!isRuntimeContractCompatible(runtime)) {
      throw new Error('Runtime does not satisfy the Mahjong bridge contract.');
    }
    clearCoachState();
    clearCoachAnalysisAccumulator();
    clearCoachAnalysisState();
    autoCoachRequestQueued = false;
    queuedAutoCoachRequest = null;
    if (coachContextStore && typeof coachContextStore.clear === 'function') {
      coachContextStore.clear();
    }
    bindRuntimeToFrontend(runtime);
    bindRuntimeActionHandlers(runtime);
    bindBottomHandInteraction(runtime);
    bindSettlementContinue(runtime);
    global.AceMahjongGameRuntime = runtime;
    publishAccumulatedCoachAnalysisState();
    logRuntime('info', '浏览器单局 runtime 已挂载到 window.AceMahjongGameRuntime', describeRuntime(runtime));
    return runtime;
  }

  async function createSessionRuntime(config = {}) {
    if (typeof createBrowserGameSessionRuntime !== 'function') return null;
    return createBrowserGameSessionRuntime({
      config,
      createChildRuntime(childConfig = {}) {
        return createPreferredRuntime(childConfig).then((selection) => selection.runtime);
      }
    });
  }

  async function createMountedRuntime(config = {}) {
    activeRuntimeConfig = clone(config || {});
    if (!(config && config.session && config.session.enabled === false)) {
      const sessionRuntime = await createSessionRuntime(config);
      if (sessionRuntime) {
        logRuntime('info', '创建浏览器多局 session runtime', {
          runtime: describeRuntime(sessionRuntime),
          mode: sessionRuntime.mode || 'match'
        });
        return mountRuntime(sessionRuntime);
      }
    }

    const selection = await createPreferredRuntime(config);
    const runtime = selection.runtime;
    const snapshot = getRuntimeSnapshotSafe(runtime);
    logRuntime('info', selection.externalFactory ? '创建契约 runtime（外部工厂）' : '创建浏览器单局 runtime（显式 legacy fallback）', {
      source: selection.source,
      runtime: describeRuntime(runtime),
      tableSize: snapshot && snapshot.info ? snapshot.info.tableSize : (runtime.topology ? runtime.topology.tableSize : 4),
      activeSeats: snapshot && snapshot.info && Array.isArray(snapshot.info.activeSeats)
        ? snapshot.info.activeSeats.slice()
        : (runtime.activeSeats ? runtime.activeSeats.slice() : ['bottom', 'right', 'top', 'left']),
      phase: snapshot ? snapshot.phase : null
    });
    return mountRuntime(runtime);
  }

  async function bootstrapMahjongGame(config = {}) {
    if (!isFrontendRuntimeReady()) {
      logRuntime('warn', '前端 table.applySnapshot 尚未就绪，跳过启动');
      console.warn('[MahjongRuntimeBridge] 前端 table.applySnapshot 尚未就绪。');
      return null;
    }

    stopActiveRuntime();

    const runtime = await createMountedRuntime(config);
    startRuntimeSession(runtime);
    return runtime;
  }

  global.AceMahjongRuntimeBridge = {
    bootstrap(config) {
      return bootstrapMahjongGame(config || {});
    },
    async createRuntime(config) {
      return (await createPreferredRuntime(config || {})).runtime;
    },
    createLegacyRuntime(config) {
      return createLegacyRuntime(config || {});
    },
    getRuntimeInfo() {
      return describeRuntime(global.AceMahjongGameRuntime || null);
    },
    getRuntime() {
      return global.AceMahjongGameRuntime || null;
    },
    getSnapshot() {
      const runtime = global.AceMahjongGameRuntime;
      return runtime && typeof runtime.getSnapshot === 'function'
        ? runtime.getSnapshot()
        : null;
    },
    getCoachState() {
      return cloneOrNull(coachState);
    },
    getCoachContext() {
      return getActiveCoachContext();
    },
    getCoachRequestAvailability() {
      return cloneOrNull(getCoachRequestAvailability(global.AceMahjongGameRuntime || null));
    },
    setCoachSuggestionProvider(provider) {
      coachSuggestionProvider = provider || null;
      return Boolean(coachSuggestionProvider);
    },
    getAutoCoachEnabled() {
      return getAutoCoachEnabled();
    },
    setAutoCoachEnabled(enabled) {
      return setAutoCoachEnabled(enabled);
    },
    toggleAutoCoachEnabled() {
      return toggleAutoCoachEnabled();
    },
    async requestCoachSuggestion(options = {}) {
      return requestCoachSuggestion(options);
    },
    setCoachState(nextState) {
      return publishCoachState(nextState);
    },
    setCoachSuggestion(nextState) {
      return publishCoachState(nextState);
    },
    clearCoachState() {
      return clearCoachState();
    },
    subscribeCoachState(listener) {
      if (typeof listener !== 'function') return function() {};
      coachStateListeners.add(listener);
      return function unsubscribeCoachState() {
        coachStateListeners.delete(listener);
      };
    },
    getCoachAnalysisState() {
      return cloneOrNull(coachAnalysisState);
    },
    setCoachAnalysisState(nextState) {
      return publishCoachAnalysisState(nextState);
    },
    clearCoachAnalysisState() {
      return clearCoachAnalysisState();
    },
    subscribeCoachAnalysisState(listener) {
      if (typeof listener !== 'function') return function() {};
      coachAnalysisStateListeners.add(listener);
      return function unsubscribeCoachAnalysisState() {
        coachAnalysisStateListeners.delete(listener);
      };
    },
    dispatch(action) {
      const runtime = global.AceMahjongGameRuntime;
      return runtime
        ? dispatchRuntimeAction(runtime, action)
        : null;
    },
    subscribe(listener) {
      const runtime = global.AceMahjongGameRuntime;
      return runtime && typeof runtime.subscribe === 'function'
        ? runtime.subscribe(listener)
        : function() {};
    },
    refresh() {
      const runtime = global.AceMahjongGameRuntime;
      return syncRuntimeToFrontend(runtime);
    },
    stop() {
      const runtime = stopActiveRuntime();
      if (global.AceMahjongGameRuntime === runtime) {
        global.AceMahjongGameRuntime = null;
      }
      return runtime;
    }
  };

  if (global.AceMahjongRuntimeAutoStart !== false) {
    const autoConfig = global.AceMahjongGameConfig || {};
    const startAutoRuntime = () => {
      bootstrapMahjongGame(autoConfig).catch((error) => {
        logRuntime('error', '浏览器单局 runtime 自动启动失败', {
          message: error && error.message ? error.message : String(error)
        });
        console.error('[MahjongRuntimeBridge] 浏览器单局 runtime 自动启动失败。', error);
      });
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        startAutoRuntime();
      }, { once: true });
    } else {
      startAutoRuntime();
    }
  }
})(window);
