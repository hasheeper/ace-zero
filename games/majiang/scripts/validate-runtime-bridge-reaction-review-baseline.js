'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function createFakeRuntime() {
  const listeners = new Set();
  const snapshot = {
    phase: 'await_reaction',
    info: {
      turnSeat: 'right',
      zhuangfeng: 0,
      jushu: 0,
      dealerSeat: 'bottom'
    },
    seats: {
      bottom: { riverTiles: [], handTiles: [{ code: 'p5' }, { code: 's1' }, { code: 's2' }, { code: 's3' }] },
      right: { riverTiles: [], handTiles: [] },
      top: { riverTiles: [], handTiles: [] },
      left: { riverTiles: [], handTiles: [] }
    },
    availableActions: [
      { type: 'call', payload: { seat: 'bottom', callType: 'peng', meldString: 'z444+' } },
      { type: 'pass', payload: { seat: 'bottom' } }
    ]
  };

  function emit(event) {
    listeners.forEach((listener) => listener(event));
  }

  return {
    kind: 'fake-runtime',
    source: 'test',
    mode: 'single-round',
    start() {
      return snapshot;
    },
    subscribe(listener) {
      listeners.add(listener);
      return function unsubscribe() {
        listeners.delete(listener);
      };
    },
    dispatch(action) {
      if (action && action.type === 'call') {
        snapshot.phase = 'await_discard';
        snapshot.info.turnSeat = 'bottom';
        snapshot.availableActions = [];
        emit({
          type: 'meld:call',
          payload: {
            seat: 'bottom',
            fromSeat: 'right',
            callType: 'peng',
            meldString: 'z444+',
            meld: 'z444+',
            tileCode: 'z4'
          },
          snapshot: JSON.parse(JSON.stringify(snapshot)),
          timestamp: Date.now()
        });
      }
      return JSON.parse(JSON.stringify(snapshot));
    },
    emitReactionWindowOpen() {
      emit({
        type: 'reaction-window:open',
        payload: {
          fromSeat: 'right',
          tileCode: 'z4',
          actions: JSON.parse(JSON.stringify(snapshot.availableActions))
        },
        snapshot: JSON.parse(JSON.stringify(snapshot)),
        timestamp: Date.now()
      });
    },
    getSnapshot() {
      return JSON.parse(JSON.stringify(snapshot));
    }
  };
}

function loadBridgeIntoSandbox() {
  const bridgePath = path.resolve(__dirname, '../frontend/scripts/runtime/bridge/runtime-bridge.js');
  const source = fs.readFileSync(bridgePath, 'utf8');
  const fakeRuntime = createFakeRuntime();

  const sandbox = {
    console,
    window: null,
    document: {
      readyState: 'complete',
      addEventListener() {},
      querySelectorAll() { return []; }
    },
    setTimeout,
    clearTimeout,
    CustomEvent: function(type, options = {}) {
      this.type = type;
      this.detail = options.detail;
    },
    dispatchEvent() {},
    AceMahjongRuntimeAutoStart: false,
    AceMahjongBrowserCoreAdapter: {},
    AceMahjongWallService: {
      createWallService() {}
    },
    AceMahjongFormalRuntimeFactory: {
      createRuntime() {
        return fakeRuntime;
      }
    },
    AceZeroMahjongUI: {
      table: {
        applySnapshot() {},
        setCoachState() {},
        setCoachAnalysisState() {},
        openSettlementPanel() {},
        playAnimation() {},
        playCutIn() {},
        clearRuntimeHandStatusOverlay() {},
        clearWinnerReveal() {}
      }
    }
  };

  sandbox.window = sandbox;
  vm.runInNewContext(source, sandbox, { filename: bridgePath });

  return {
    bridge: sandbox.AceMahjongRuntimeBridge,
    fakeRuntime
  };
}

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const { bridge, fakeRuntime } = loadBridgeIntoSandbox();
  await bridge.bootstrap({
    mode: 'single-round',
    session: { enabled: false },
    players: [
      { seat: 'bottom', name: '南宫', title: '自家', human: true, ai: { enabled: false } },
      { seat: 'right', name: '隐僧', title: '下家', human: false, ai: { enabled: true, difficulty: 'easy' } }
    ]
  });

  let requestCount = 0;
  bridge.setAutoCoachEnabled(true);
  bridge.setCoachSuggestionProvider(({ runtime, options }) => {
    requestCount += 1;
    const snapshot = runtime.getSnapshot();
    const isPreDispatchBackground = options && options.trigger === 'pre-dispatch-call';
    if (requestCount === 1) {
      return Promise.resolve({
        source: 'test-live-provider',
        perspectiveSeat: 'bottom',
        recommended: {
          type: 'call',
          seat: 'bottom',
          callType: 'peng',
          meldString: 'z444+'
        },
        summary: '建议碰白板',
        contextSignature: options.contextSignature
      });
    }
    if (isPreDispatchBackground) {
      return new Promise((resolve) => {
        setTimeout(() => resolve({
          source: 'test-stale-provider',
          perspectiveSeat: 'bottom',
          recommended: {
            type: 'discard',
            seat: 'bottom',
            tileCode: 'p5'
          },
          summary: '错误旧建议切五筒',
          contextSignature: options.contextSignature
        }), 80);
      });
    }
    if (snapshot.phase === 'await_discard') {
      return new Promise((resolve) => {
        setTimeout(() => resolve({
          source: 'test-next-provider',
          perspectiveSeat: 'bottom',
          recommended: {
            type: 'discard',
            seat: 'bottom',
            tileCode: 'p5'
          },
          summary: '建议切五筒',
          contextSignature: options.contextSignature
        }), 10);
      });
    }
    return Promise.resolve(null);
  });

  fakeRuntime.emitReactionWindowOpen();
  await wait(40);

  bridge.dispatch({
    type: 'call',
    payload: {
      seat: 'bottom',
      fromSeat: 'right',
      callType: 'peng',
      meldString: 'z444+',
      meld: 'z444+'
    }
  });

  await wait(180);

  const coachState = bridge.getCoachState();
  assert(coachState && coachState.reviewMode === true, `expected post-action review state, got ${JSON.stringify(coachState)}`);
  assert(coachState.source === 'auto-review', `expected auto-review source, got ${JSON.stringify(coachState)}`);
  assert(coachState.recommended && coachState.recommended.type === 'call', `expected review baseline to stay on reaction suggestion, got ${JSON.stringify(coachState)}`);
  assert(coachState.recommended && coachState.recommended.meldString === 'z444+', `expected review baseline meld z444+, got ${JSON.stringify(coachState)}`);
  assert(/本手判定：善手。/.test(coachState.summary || ''), `expected exact reaction match to be judged good, got ${JSON.stringify(coachState)}`);
  assert(!(coachState.recommended && coachState.recommended.tileCode === 'p5'), `expected stale discard suggestion to be ignored for review, got ${JSON.stringify(coachState)}`);
  assert(!/参考建议是 p5/.test(coachState.summary || ''), `expected stale discard summary to be ignored for review, got ${JSON.stringify(coachState)}`);

  console.log('[PASS] runtime-bridge-reaction-review-baseline-smoke');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
