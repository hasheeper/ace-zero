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
    phase: 'await_discard',
    info: {
      turnSeat: 'bottom',
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
    availableActions: []
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
    dispatch() {
      return JSON.parse(JSON.stringify(snapshot));
    },
    setReactionWindow() {
      snapshot.phase = 'await_reaction';
      snapshot.info.turnSeat = 'right';
      snapshot.availableActions = [
        { type: 'call', payload: { seat: 'bottom', callType: 'peng', meldString: 'p888=' } },
        { type: 'pass', payload: { seat: 'bottom' } }
      ];
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
  bridge.setCoachState({
    status: 'ready',
    source: 'auto-review',
    perspectiveSeat: 'bottom',
    recommended: {
      type: 'discard',
      seat: 'bottom',
      tileCode: 'm4'
    },
    summary: '这是上一手的复盘',
    reviewMode: true,
    contextSignature: 'old-review-signature'
  });

  bridge.setCoachSuggestionProvider(({ options }) => Promise.resolve({
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
  }));

  fakeRuntime.setReactionWindow();
  fakeRuntime.emitReactionWindowOpen();

  await wait(120);

  const coachState = bridge.getCoachState();
  assert(coachState && coachState.reviewMode === false, `expected new actionable suggestion to replace old review, got ${JSON.stringify(coachState)}`);
  assert(coachState.recommended && coachState.recommended.type === 'call', `expected live reaction suggestion, got ${JSON.stringify(coachState)}`);
  assert(coachState.summary === '建议碰八筒', `expected live reaction summary, got ${JSON.stringify(coachState)}`);

  console.log('[PASS] runtime-bridge-review-to-live-switch-smoke');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
