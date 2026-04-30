(function(global) {
  'use strict';

  const SUPPORTED_SMOKE_ID = 'all-pass-bottom-draw';
  const CONTINUE_NEXT_ROUND_SMOKE_ID = 'continue-next-round';
  const SESSION_FINISHED_SMOKE_ID = 'session-finished';
  const EXHAUSTIVE_NO_DAOPAI_SMOKE_ID = 'exhaustive-no-daopai';
  const OVERLAY_ID = 'mahjong-browser-smoke-status';

  function getRequestedSmokeId() {
    try {
      const params = new URLSearchParams(global.location && global.location.search ? global.location.search : '');
      const value = params.get('smoke');
      return typeof value === 'string' && value ? value : null;
    } catch (error) {
      return null;
    }
  }

  function ensureOverlay() {
    if (!global.document || !global.document.body) return null;
    let node = global.document.getElementById(OVERLAY_ID);
    if (node) return node;

    node = global.document.createElement('div');
    node.id = OVERLAY_ID;
    node.style.position = 'fixed';
    node.style.right = '16px';
    node.style.bottom = '16px';
    node.style.zIndex = '99999';
    node.style.minWidth = '280px';
    node.style.maxWidth = '360px';
    node.style.padding = '12px 14px';
    node.style.borderRadius = '10px';
    node.style.font = '12px/1.5 Menlo, Monaco, Consolas, monospace';
    node.style.color = '#f3ead2';
    node.style.background = 'rgba(24, 19, 14, 0.92)';
    node.style.border = '1px solid rgba(227, 194, 126, 0.42)';
    node.style.boxShadow = '0 12px 28px rgba(0, 0, 0, 0.34)';
    node.style.whiteSpace = 'pre-wrap';
    node.style.pointerEvents = 'none';
    global.document.body.appendChild(node);
    return node;
  }

  function updateOverlay(status, lines) {
    const node = ensureOverlay();
    if (!node) return;
    const colors = {
      pending: 'rgba(24, 19, 14, 0.92)',
      pass: 'rgba(20, 49, 31, 0.94)',
      fail: 'rgba(67, 20, 20, 0.95)'
    };
    node.style.background = colors[status] || colors.pending;
    node.textContent = lines.join('\n');
  }

  function summarizeEvent(event) {
    if (!event || !event.type) return 'unknown';
    if (event.type === 'reaction-window:closed' || event.type === 'reaction-window:empty') {
      return `${event.type}:${event.payload && event.payload.reason ? event.payload.reason : 'none'}:${event.payload && event.payload.nextSeat ? event.payload.nextSeat : 'none'}`;
    }
    if (event.type === 'tile:draw' || event.type === 'tile:gang-draw') {
      return `${event.type}:${event.payload && event.payload.seat ? event.payload.seat : 'none'}:${event.payload && event.payload.tileCode ? event.payload.tileCode : 'none'}`;
    }
    return event.type;
  }

  function findBottomPassAction(snapshot) {
    const actions = snapshot && Array.isArray(snapshot.availableActions) ? snapshot.availableActions : [];
    return actions.find((action) => (
      action
      && action.type === 'pass'
      && action.payload
      && action.payload.seat === 'bottom'
    )) || null;
  }

  function findBottomNoDaopaiAction(snapshot) {
    const actions = snapshot && Array.isArray(snapshot.availableActions) ? snapshot.availableActions : [];
    return actions.find((action) => (
      action
      && action.type === 'no-daopai'
      && action.payload
      && action.payload.seat === 'bottom'
    )) || null;
  }

  function createSmokeState(smokeId) {
    return {
      id: smokeId,
      startedAt: Date.now(),
      dispatchedPass: false,
      sawAllPassClose: false,
      sawBottomDrawAfterClose: false,
      closedEventTimestamp: 0,
      eventTrail: []
    };
  }

  function pushEventTrail(state, event) {
    state.eventTrail.push(summarizeEvent(event));
    if (state.eventTrail.length > 10) {
      state.eventTrail = state.eventTrail.slice(-10);
    }
  }

  function finishSmoke(state, status, message, extraLines) {
    const lines = [
      `[browser smoke] ${state.id}`,
      `${status.toUpperCase()}: ${message}`
    ];
    if (Array.isArray(extraLines) && extraLines.length) {
      extraLines.forEach((line) => lines.push(line));
    }
    if (state.eventTrail.length) {
      lines.push(`trail: ${state.eventTrail.join(' -> ')}`);
    }
    updateOverlay(status, lines);

    const payload = {
      id: state.id,
      status,
      message,
      eventTrail: state.eventTrail.slice()
    };
    global.AceMahjongBrowserSmoke = payload;
    if (status === 'pass') {
      console.info('[Mahjong][browser-smoke] PASS', payload);
      return;
    }
    console.error('[Mahjong][browser-smoke] FAIL', payload);
  }

  function runAllPassBottomDrawSmoke(runtime) {
    const state = createSmokeState(SUPPORTED_SMOKE_ID);
    updateOverlay('pending', [
      `[browser smoke] ${state.id}`,
      'PENDING: waiting for bottom pass window'
    ]);

    const timeoutMs = 6000;
    let finished = false;
    let unsubscribe = function() {};
    let readyPollTimer = 0;
    let timeoutTimer = 0;

    function cleanup() {
      if (readyPollTimer) global.clearInterval(readyPollTimer);
      if (timeoutTimer) global.clearTimeout(timeoutTimer);
      if (typeof unsubscribe === 'function') unsubscribe();
    }

    function succeed(message) {
      if (finished) return;
      finished = true;
      cleanup();
      finishSmoke(state, 'pass', message, [
        `elapsedMs: ${Date.now() - state.startedAt}`
      ]);
    }

    function fail(message) {
      if (finished) return;
      finished = true;
      cleanup();
      finishSmoke(state, 'fail', message, [
        `elapsedMs: ${Date.now() - state.startedAt}`,
        `dispatchedPass: ${state.dispatchedPass}`,
        `sawAllPassClose: ${state.sawAllPassClose}`,
        `sawBottomDrawAfterClose: ${state.sawBottomDrawAfterClose}`
      ]);
    }

    function dispatchBottomPassIfReady() {
      if (finished || state.dispatchedPass) return false;
      if (!runtime || typeof runtime.getSnapshot !== 'function' || typeof runtime.dispatch !== 'function') {
        return false;
      }
      const snapshot = runtime.getSnapshot();
      const passAction = findBottomPassAction(snapshot);
      if (!passAction || snapshot.phase !== 'await_reaction') return false;
      state.dispatchedPass = true;
      updateOverlay('pending', [
        `[browser smoke] ${state.id}`,
        'PENDING: pass action dispatched'
      ]);
      runtime.dispatch({
        type: 'pass',
        payload: {
          seat: 'bottom',
          reason: 'browser-smoke-pass'
        }
      });
      return true;
    }

    unsubscribe = runtime.subscribe((event) => {
      pushEventTrail(state, event);

      if (!state.dispatchedPass) {
        dispatchBottomPassIfReady();
      }

      if (event && event.type === 'reaction-window:closed'
        && event.payload
        && event.payload.reason === 'all-pass'
        && event.payload.nextSeat === 'bottom') {
        state.sawAllPassClose = true;
        state.closedEventTimestamp = Date.now();
        updateOverlay('pending', [
          `[browser smoke] ${state.id}`,
          'PENDING: all-pass close observed, waiting for bottom draw'
        ]);
        return;
      }

      if (state.sawAllPassClose
        && event
        && event.type === 'tile:draw'
        && event.payload
        && event.payload.seat === 'bottom') {
        state.sawBottomDrawAfterClose = true;
        succeed(`observed bottom draw after all-pass close (${event.payload.tileCode || 'unknown'})`);
      }
    });

    readyPollTimer = global.setInterval(() => {
      dispatchBottomPassIfReady();
    }, 80);

    timeoutTimer = global.setTimeout(() => {
      if (!state.dispatchedPass) {
        fail('bottom pass window did not become available');
        return;
      }
      if (!state.sawAllPassClose) {
        fail('did not observe reaction-window:closed with reason=all-pass and nextSeat=bottom');
        return;
      }
      fail('did not observe bottom draw after all-pass close');
    }, timeoutMs);

    dispatchBottomPassIfReady();
  }

  function runContinueNextRoundSmoke(runtime) {
    const state = createSmokeState(CONTINUE_NEXT_ROUND_SMOKE_ID);
    state.sawSettlementOpen = false;
    state.clickedContinue = false;
    state.sawSessionTransition = false;
    state.sawSessionRoundStart = false;
    state.sawDealInitialAfterContinue = false;
    state.nextRoundLabel = null;
    state.nextChangbang = null;
    updateOverlay('pending', [
      `[browser smoke] ${state.id}`,
      'PENDING: waiting for settlement panel'
    ]);

    const timeoutMs = 9000;
    let finished = false;
    let unsubscribe = function() {};
    let readyPollTimer = 0;
    let timeoutTimer = 0;

    function cleanup() {
      if (readyPollTimer) global.clearInterval(readyPollTimer);
      if (timeoutTimer) global.clearTimeout(timeoutTimer);
      if (typeof unsubscribe === 'function') unsubscribe();
    }

    function succeed(message) {
      if (finished) return;
      finished = true;
      cleanup();
      finishSmoke(state, 'pass', message, [
        `elapsedMs: ${Date.now() - state.startedAt}`,
        `nextRoundLabel: ${state.nextRoundLabel || 'unknown'}`,
        `nextChangbang: ${state.nextChangbang == null ? 'unknown' : state.nextChangbang}`
      ]);
    }

    function fail(message) {
      if (finished) return;
      finished = true;
      cleanup();
      finishSmoke(state, 'fail', message, [
        `elapsedMs: ${Date.now() - state.startedAt}`,
        `sawSettlementOpen: ${state.sawSettlementOpen}`,
        `clickedContinue: ${state.clickedContinue}`,
        `sawSessionTransition: ${state.sawSessionTransition}`,
        `sawSessionRoundStart: ${state.sawSessionRoundStart}`,
        `sawDealInitialAfterContinue: ${state.sawDealInitialAfterContinue}`,
        `nextRoundLabel: ${state.nextRoundLabel || 'unknown'}`,
        `nextChangbang: ${state.nextChangbang == null ? 'unknown' : state.nextChangbang}`
      ]);
    }

    function tryClickContinue() {
      if (finished || state.clickedContinue) return false;
      const panel = global.document && global.document.querySelector
        ? global.document.querySelector('.settlement-overlay.is-open')
        : null;
      if (!panel) return false;
      const button = panel.querySelector('[data-settlement-continue]');
      if (!button || button.disabled) return false;
      state.sawSettlementOpen = true;
      state.clickedContinue = true;
      updateOverlay('pending', [
        `[browser smoke] ${state.id}`,
        'PENDING: continue clicked, waiting next round'
      ]);
      button.click();
      return true;
    }

    unsubscribe = runtime.subscribe((event) => {
      pushEventTrail(state, event);

      if (!state.clickedContinue) {
        tryClickContinue();
      }

      if (!state.clickedContinue) return;

      if (event && event.type === 'session:transition') {
        state.sawSessionTransition = true;
        return;
      }

      if (event && event.type === 'session:round-start') {
        state.sawSessionRoundStart = true;
        const matchState = event.payload && event.payload.matchState ? event.payload.matchState : null;
        state.nextRoundLabel = matchState
          ? `${['东', '南', '西', '北'][Number(matchState.zhuangfeng || 0)] || '东'}${Number(matchState.jushu || 0) + 1}局`
          : null;
        state.nextChangbang = matchState && matchState.changbang != null
          ? Number(matchState.changbang)
          : null;
        return;
      }

      if (event && event.type === 'deal:initial') {
        state.sawDealInitialAfterContinue = true;
        succeed('observed next-round deal after settlement continue');
      }
    });

    readyPollTimer = global.setInterval(() => {
      const panel = global.document && global.document.querySelector
        ? global.document.querySelector('.settlement-overlay.is-open')
        : null;
      if (panel) {
        state.sawSettlementOpen = true;
      }
      tryClickContinue();
    }, 80);

    timeoutTimer = global.setTimeout(() => {
      if (!state.sawSettlementOpen) {
        fail('settlement panel did not open');
        return;
      }
      if (!state.clickedContinue) {
        fail('continue button was not clickable');
        return;
      }
      if (!state.sawSessionTransition) {
        fail('did not observe session:transition after continue');
        return;
      }
      if (!state.sawSessionRoundStart) {
        fail('did not observe session:round-start after continue');
        return;
      }
      fail('did not observe deal:initial after continue');
    }, timeoutMs);

    tryClickContinue();
  }

  function runSessionFinishedSmoke(runtime) {
    const state = createSmokeState(SESSION_FINISHED_SMOKE_ID);
    state.sawSettlementOpen = false;
    state.clickedContinue = false;
    state.sawSessionTransition = false;
    state.sawSessionFinished = false;
    state.finishReason = null;
    state.sawUnexpectedRoundStart = false;
    updateOverlay('pending', [
      `[browser smoke] ${state.id}`,
      'PENDING: waiting for settlement panel'
    ]);

    const timeoutMs = 9000;
    let finished = false;
    let unsubscribe = function() {};
    let readyPollTimer = 0;
    let timeoutTimer = 0;

    function cleanup() {
      if (readyPollTimer) global.clearInterval(readyPollTimer);
      if (timeoutTimer) global.clearTimeout(timeoutTimer);
      if (typeof unsubscribe === 'function') unsubscribe();
    }

    function succeed(message) {
      if (finished) return;
      finished = true;
      cleanup();
      finishSmoke(state, 'pass', message, [
        `elapsedMs: ${Date.now() - state.startedAt}`,
        `finishReason: ${state.finishReason || 'unknown'}`
      ]);
    }

    function fail(message) {
      if (finished) return;
      finished = true;
      cleanup();
      finishSmoke(state, 'fail', message, [
        `elapsedMs: ${Date.now() - state.startedAt}`,
        `sawSettlementOpen: ${state.sawSettlementOpen}`,
        `clickedContinue: ${state.clickedContinue}`,
        `sawSessionTransition: ${state.sawSessionTransition}`,
        `sawSessionFinished: ${state.sawSessionFinished}`,
        `sawUnexpectedRoundStart: ${state.sawUnexpectedRoundStart}`,
        `finishReason: ${state.finishReason || 'unknown'}`
      ]);
    }

    function tryClickContinue() {
      if (finished || state.clickedContinue) return false;
      const panel = global.document && global.document.querySelector
        ? global.document.querySelector('.settlement-overlay.is-open')
        : null;
      if (!panel) return false;
      const button = panel.querySelector('[data-settlement-continue]');
      if (!button || button.disabled) return false;
      state.sawSettlementOpen = true;
      state.clickedContinue = true;
      updateOverlay('pending', [
        `[browser smoke] ${state.id}`,
        'PENDING: continue clicked, waiting session finish'
      ]);
      button.click();
      return true;
    }

    unsubscribe = runtime.subscribe((event) => {
      pushEventTrail(state, event);

      if (!state.clickedContinue) {
        tryClickContinue();
      }

      if (!state.clickedContinue) return;

      if (event && event.type === 'session:transition') {
        state.sawSessionTransition = true;
        return;
      }

      if (event && event.type === 'session:round-start') {
        state.sawUnexpectedRoundStart = true;
        fail('unexpected session:round-start after expected match finish');
        return;
      }

      if (event && event.type === 'session:finished') {
        state.sawSessionFinished = true;
        state.finishReason = event.payload && event.payload.finishReason
          ? event.payload.finishReason
          : null;
        succeed('observed session:finished after settlement continue');
      }
    });

    readyPollTimer = global.setInterval(() => {
      const panel = global.document && global.document.querySelector
        ? global.document.querySelector('.settlement-overlay.is-open')
        : null;
      if (panel) {
        state.sawSettlementOpen = true;
      }
      tryClickContinue();
    }, 80);

    timeoutTimer = global.setTimeout(() => {
      if (!state.sawSettlementOpen) {
        fail('settlement panel did not open');
        return;
      }
      if (!state.clickedContinue) {
        fail('continue button was not clickable');
        return;
      }
      if (!state.sawSessionTransition) {
        fail('did not observe session:transition before finish');
        return;
      }
      fail('did not observe session:finished after continue');
    }, timeoutMs);

    tryClickContinue();
  }

  function runExhaustiveNoDaopaiSmoke(runtime) {
    const state = createSmokeState(EXHAUSTIVE_NO_DAOPAI_SMOKE_ID);
    state.sawAwaitResolution = false;
    state.dispatchedNoDaopai = false;
    state.sawRoundDraw = false;
    state.roundResultReason = null;
    state.tenpaiSeats = [];
    state.dealerContinues = null;
    updateOverlay('pending', [
      `[browser smoke] ${state.id}`,
      'PENDING: waiting for bottom no-daopai window'
    ]);

    const timeoutMs = 7000;
    let finished = false;
    let unsubscribe = function() {};
    let readyPollTimer = 0;
    let timeoutTimer = 0;

    function cleanup() {
      if (readyPollTimer) global.clearInterval(readyPollTimer);
      if (timeoutTimer) global.clearTimeout(timeoutTimer);
      if (typeof unsubscribe === 'function') unsubscribe();
    }

    function succeed(message) {
      if (finished) return;
      finished = true;
      cleanup();
      finishSmoke(state, 'pass', message, [
        `elapsedMs: ${Date.now() - state.startedAt}`,
        `reason: ${state.roundResultReason || 'unknown'}`,
        `tenpaiSeats: ${state.tenpaiSeats.join(',') || 'none'}`,
        `dealerContinues: ${state.dealerContinues == null ? 'unknown' : state.dealerContinues}`
      ]);
    }

    function fail(message) {
      if (finished) return;
      finished = true;
      cleanup();
      finishSmoke(state, 'fail', message, [
        `elapsedMs: ${Date.now() - state.startedAt}`,
        `sawAwaitResolution: ${state.sawAwaitResolution}`,
        `dispatchedNoDaopai: ${state.dispatchedNoDaopai}`,
        `sawRoundDraw: ${state.sawRoundDraw}`,
        `reason: ${state.roundResultReason || 'unknown'}`,
        `tenpaiSeats: ${state.tenpaiSeats.join(',') || 'none'}`,
        `dealerContinues: ${state.dealerContinues == null ? 'unknown' : state.dealerContinues}`
      ]);
    }

    function dispatchNoDaopaiIfReady() {
      if (finished || state.dispatchedNoDaopai) return false;
      if (!runtime || typeof runtime.getSnapshot !== 'function' || typeof runtime.dispatch !== 'function') {
        return false;
      }
      const snapshot = runtime.getSnapshot();
      const action = findBottomNoDaopaiAction(snapshot);
      if (!action || snapshot.phase !== 'await_resolution') return false;
      state.sawAwaitResolution = true;
      state.dispatchedNoDaopai = true;
      updateOverlay('pending', [
        `[browser smoke] ${state.id}`,
        'PENDING: no-daopai dispatched, waiting for round:draw'
      ]);
      runtime.dispatch({
        type: 'no-daopai',
        payload: {
          seat: 'bottom'
        }
      });
      return true;
    }

    unsubscribe = runtime.subscribe((event) => {
      pushEventTrail(state, event);

      if (!state.dispatchedNoDaopai) {
        dispatchNoDaopaiIfReady();
      }

      if (event && event.type === 'round:draw' && event.payload && event.payload.roundResult) {
        state.sawRoundDraw = true;
        state.roundResultReason = event.payload.roundResult.reason || null;
        state.tenpaiSeats = Array.isArray(event.payload.roundResult.tenpaiSeats)
          ? event.payload.roundResult.tenpaiSeats.slice()
          : [];
        state.dealerContinues = Object.prototype.hasOwnProperty.call(event.payload.roundResult, 'dealerContinues')
          ? Boolean(event.payload.roundResult.dealerContinues)
          : null;

        if (state.roundResultReason !== '荒牌平局') {
          fail(`unexpected draw reason: ${state.roundResultReason || 'unknown'}`);
          return;
        }
        if (!state.tenpaiSeats.includes('bottom')) {
          fail('round:draw did not include bottom in tenpaiSeats after no-daopai');
          return;
        }
        if (state.dealerContinues !== true) {
          fail('round:draw did not preserve dealer continuation after bottom no-daopai');
          return;
        }
        succeed('observed exhaustive draw after bottom no-daopai declaration');
      }
    });

    readyPollTimer = global.setInterval(() => {
      const snapshot = runtime && typeof runtime.getSnapshot === 'function' ? runtime.getSnapshot() : null;
      if (snapshot && snapshot.phase === 'await_resolution') {
        state.sawAwaitResolution = true;
      }
      dispatchNoDaopaiIfReady();
    }, 80);

    timeoutTimer = global.setTimeout(() => {
      if (!state.sawAwaitResolution) {
        fail('bottom no-daopai window did not become available');
        return;
      }
      if (!state.dispatchedNoDaopai) {
        fail('bottom no-daopai action was not dispatched');
        return;
      }
      fail('did not observe round:draw after no-daopai declaration');
    }, timeoutMs);

    dispatchNoDaopaiIfReady();
  }

  function waitForRuntimeAndRun(smokeId) {
    const deadline = Date.now() + 10000;
    updateOverlay('pending', [
      `[browser smoke] ${smokeId}`,
      'PENDING: waiting for runtime mount'
    ]);

    const pollTimer = global.setInterval(() => {
      const runtime = global.AceMahjongGameRuntime;
      if (runtime && typeof runtime.subscribe === 'function' && typeof runtime.getSnapshot === 'function') {
        global.clearInterval(pollTimer);
        if (smokeId === SUPPORTED_SMOKE_ID) {
          runAllPassBottomDrawSmoke(runtime);
          return;
        }
        if (smokeId === CONTINUE_NEXT_ROUND_SMOKE_ID) {
          runContinueNextRoundSmoke(runtime);
          return;
        }
        if (smokeId === SESSION_FINISHED_SMOKE_ID) {
          runSessionFinishedSmoke(runtime);
          return;
        }
        if (smokeId === EXHAUSTIVE_NO_DAOPAI_SMOKE_ID) {
          runExhaustiveNoDaopaiSmoke(runtime);
          return;
        }
        finishSmoke(createSmokeState(smokeId), 'fail', `unsupported smoke id: ${smokeId}`);
        return;
      }

      if (Date.now() > deadline) {
        global.clearInterval(pollTimer);
        finishSmoke(createSmokeState(smokeId), 'fail', 'runtime mount timeout');
      }
    }, 80);
  }

  function bootSmokeRunner() {
    const smokeId = getRequestedSmokeId();
    if (!smokeId) return;
    waitForRuntimeAndRun(smokeId);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootSmokeRunner, { once: true });
  } else {
    bootSmokeRunner();
  }
})(window);
