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
      bottom: { riverTiles: [], handTiles: [{ code: 'm1' }] },
      right: { riverTiles: [], handTiles: [] },
      top: { riverTiles: [], handTiles: [] },
      left: { riverTiles: [], handTiles: [] }
    },
    availableActions: [
      { type: 'pass', payload: { seat: 'bottom' } },
      { type: 'call', payload: { seat: 'bottom', callType: 'peng', meldString: 'p888=' } }
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
    dispatch(action) {
      if (action && action.type === 'pass') {
        snapshot.phase = 'await_draw';
        snapshot.availableActions = [];
        emit({
          type: 'reaction-window:closed',
          payload: {
            fromSeat: 'right',
            tileCode: 'p8',
            nextSeat: 'top',
            reason: 'all-pass'
          },
          snapshot: JSON.parse(JSON.stringify(snapshot)),
          timestamp: Date.now()
        });
      }
      return JSON.parse(JSON.stringify(snapshot));
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
    AceMahjongWallService: { createWallService() {} },
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
  const { bridge } = loadBridgeIntoSandbox();
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
    setTimeout(() => {
      resolve({
        source: 'test-pass-provider',
        perspectiveSeat: 'bottom',
        summary: '反应建议：碰八筒',
        recommended: {
          type: 'call',
          seat: 'bottom',
          callType: 'peng',
          meldString: 'p888='
        },
        contextSignature: options && options.contextSignature ? options.contextSignature : null
      });
    }, 60);
  }));

  bridge.setAutoCoachEnabled(true);
  bridge.getRuntime().emitReactionWindowOpen();
  await wait(120);

  const liveCoachState = bridge.getCoachState();
  assert(liveCoachState && liveCoachState.status === 'ready', `expected visible reaction suggestion before pass, got ${JSON.stringify(liveCoachState)}`);
  assert(liveCoachState.recommended && liveCoachState.recommended.type === 'call', `expected live reaction recommendation to be call, got ${JSON.stringify(liveCoachState)}`);

  bridge.dispatch({
    type: 'ui-action',
    key: 'pass:bottom',
    payload: {
      seat: 'bottom'
    }
  });

  await wait(180);

  const coachState = bridge.getCoachState();
  assert(coachState && coachState.status === 'ready', `expected pass review popup, got ${JSON.stringify(coachState)}`);
  assert(coachState.recommended && coachState.recommended.type === 'call', `expected reaction recommendation after pass, got ${JSON.stringify(coachState)}`);
  assert(/pass 选择是 过/.test(coachState.summary || ''), `expected human-readable pass summary, got ${JSON.stringify(coachState)}`);

  console.log('[PASS] runtime-bridge-auto-coach-pass-smoke');
  console.log(`  snapshot=${JSON.stringify({
    summary: coachState.summary,
    recommended: coachState.recommended
  })}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
