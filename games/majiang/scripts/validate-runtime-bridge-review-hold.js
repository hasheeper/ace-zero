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
      bottom: { riverTiles: [], handTiles: [{ code: 'm1' }, { code: 'm2' }, { code: 'm3' }, { code: 'm4' }] },
      right: { riverTiles: [], handTiles: [] },
      top: { riverTiles: [], handTiles: [] },
      left: { riverTiles: [], handTiles: [] }
    },
    availableActions: [
      { type: 'call', payload: { seat: 'bottom', callType: 'peng', meldString: 'p888=' } },
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
        snapshot.seats.bottom.melds = [{ type: 'pon', tiles: [{ code: 'p8' }, { code: 'p8' }, { code: 'p8' }] }];
        emit({
          type: 'meld:call',
          payload: {
            seat: 'bottom',
            fromSeat: 'right',
            callType: 'peng',
            meldString: 'p888=',
            meld: 'p888=',
            tileCode: 'p8'
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
          tileCode: 'p8',
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

  bridge.setAutoCoachEnabled(true);
  bridge.setCoachSuggestionProvider(({ runtime, options }) => {
    const snapshot = runtime.getSnapshot();
    if (snapshot.phase === 'await_reaction') {
      return new Promise((resolve) => {
        setTimeout(() => resolve({
          source: 'test-live-provider',
          perspectiveSeat: 'bottom',
          recommended: {
            type: 'call',
            seat: 'bottom',
            callType: 'peng',
            meldString: 'p888='
          },
          summary: '建议碰八筒',
          contextSignature: options.contextSignature
        }), 20);
      });
    }
    return new Promise((resolve) => {
      setTimeout(() => resolve({
        source: 'test-next-provider',
        perspectiveSeat: 'bottom',
        recommended: {
          type: 'discard',
          seat: 'bottom',
          tileCode: 'm4'
        },
        summary: '建议切四万',
        contextSignature: options.contextSignature
      }), 20);
    });
  });

  fakeRuntime.emitReactionWindowOpen();
  await wait(120);

  bridge.dispatch({
    type: 'call',
    payload: {
      seat: 'bottom',
      fromSeat: 'right',
      callType: 'peng',
      meldString: 'p888=',
      meld: 'p888='
    }
  });

  await wait(120);
  const reviewState = bridge.getCoachState();
  assert(reviewState && reviewState.reviewMode === true, `expected immediate post-call coach state to stay in review mode, got ${JSON.stringify(reviewState)}`);

  await wait(1800);
  const nextSuggestionState = bridge.getCoachState();
  assert(nextSuggestionState && nextSuggestionState.reviewMode === true && /本手判定/.test(nextSuggestionState.summary || ''), `expected review popup to remain visible instead of being replaced by next suggestion, got ${JSON.stringify(nextSuggestionState)}`);

  console.log('[PASS] runtime-bridge-review-hold-smoke');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
