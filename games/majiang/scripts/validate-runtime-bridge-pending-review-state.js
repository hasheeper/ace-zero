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
    dispatch(action) {
      if (action && (action.type === 'discard' || action.type === 'discard-index')) {
        snapshot.phase = 'await_draw';
        snapshot.info.turnSeat = 'right';
        emit({
          type: 'tile:discard',
          payload: {
            seat: 'bottom',
            tileCode: 'm4',
            riichi: false
          },
          snapshot: JSON.parse(JSON.stringify(snapshot)),
          timestamp: Date.now()
        });
      }
      return JSON.parse(JSON.stringify(snapshot));
    },
    emitDrawForBottom(tileCode = 'm4') {
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
      source: 'test-auto-provider',
      perspectiveSeat: 'bottom',
      summary: '自动建议：打出 四万',
      recommended: {
        type: 'discard',
        seat: 'bottom',
        tileCode: 'm4',
        riichi: false
      },
      contextSignature: options.contextSignature
    }), 300);
  }));

  fakeRuntime.emitDrawForBottom('m4');
  await wait(50);

  bridge.dispatch({
    type: 'discard-index',
    payload: {
      seat: 'bottom',
      tileIndex: 4,
      riichi: false
    }
  });

  await wait(80);
  const pendingReview = bridge.getCoachState();
  assert(pendingReview && pendingReview.reviewMode === true, `expected pending review state immediately after action, got ${JSON.stringify(pendingReview)}`);
  assert(pendingReview.status === 'pending', `expected pending review status, got ${JSON.stringify(pendingReview)}`);
  assert(/正在生成这一步的复盘/.test(pendingReview.summary || ''), `expected pending review summary, got ${JSON.stringify(pendingReview)}`);

  await wait(320);
  const finalReview = bridge.getCoachState();
  assert(finalReview && finalReview.status === 'ready' && finalReview.reviewMode === true, `expected final ready review after provider returns, got ${JSON.stringify(finalReview)}`);
  assert(/本手判定：善手/.test(finalReview.summary || ''), `expected final review verdict, got ${JSON.stringify(finalReview)}`);

  console.log('[PASS] runtime-bridge-pending-review-state-smoke');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
