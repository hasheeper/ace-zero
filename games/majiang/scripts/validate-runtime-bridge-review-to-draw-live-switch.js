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
    phase: 'await_draw',
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
    emitBottomDraw(tileCode = 'm4') {
      snapshot.phase = 'await_discard';
      snapshot.info.turnSeat = 'bottom';
      snapshot.seats.bottom.handTiles.push({ code: tileCode });
      emit({
        type: 'tile:draw',
        payload: {
          seat: 'bottom',
          tileCode
        },
        snapshot: JSON.parse(JSON.stringify(snapshot)),
        timestamp: Date.now()
      });
    },
    dispatch() {
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
      type: 'call',
      seat: 'bottom',
      callType: 'peng',
      meldString: 'p888='
    },
    summary: '这是上一手行动复盘',
    reviewMode: true,
    contextSignature: 'old-reaction-review'
  });

  bridge.setCoachSuggestionProvider(({ options }) => Promise.resolve({
    source: 'test-draw-provider',
    perspectiveSeat: 'bottom',
    recommended: {
      type: 'discard',
      seat: 'bottom',
      tileCode: 'm4'
    },
    summary: '建议切四万',
    contextSignature: options.contextSignature
  }));

  fakeRuntime.emitBottomDraw('m4');
  await wait(120);

  const coachState = bridge.getCoachState();
  assert(coachState && coachState.reviewMode === true, `expected old review to stay as top-level state, got ${JSON.stringify(coachState)}`);
  assert(coachState.liveState && coachState.liveState.reviewMode === false, `expected draw live suggestion to be exposed via liveState, got ${JSON.stringify(coachState)}`);
  assert(coachState.liveState.recommended && coachState.liveState.recommended.type === 'discard', `expected draw suggestion after own draw, got ${JSON.stringify(coachState)}`);
  assert(coachState.liveState.summary === '建议切四万', `expected draw suggestion summary, got ${JSON.stringify(coachState)}`);

  console.log('[PASS] runtime-bridge-review-to-draw-live-switch-smoke');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
