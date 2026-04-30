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
  bridge.setCoachSuggestionProvider(({ options }) => new Promise((resolve) => {
    setTimeout(() => resolve({
      source: 'test-wrong-family-provider',
      perspectiveSeat: 'bottom',
      recommended: {
        type: 'discard',
        seat: 'bottom',
        tileCode: 'm4'
      },
      summary: '建议切四万',
      contextSignature: options.contextSignature
    }), 20);
  }));

  fakeRuntime.emitReactionWindowOpen();
  await wait(80);

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

  const coachState = bridge.getCoachState();
  assert(coachState && coachState.reviewMode === true, `expected review popup even when coach decision family differs, got ${JSON.stringify(coachState)}`);
  assert(/分歧类型 action-type/.test(coachState.summary || ''), `expected action-type mismatch summary, got ${JSON.stringify(coachState)}`);
  assert(coachState.source === 'auto-review', `expected auto-review source instead of unavailable, got ${JSON.stringify(coachState)}`);

  console.log('[PASS] runtime-bridge-action-type-fallback-smoke');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
