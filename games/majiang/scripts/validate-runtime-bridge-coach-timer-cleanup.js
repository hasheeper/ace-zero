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
      bottom: {
        riverTiles: [],
        handTiles: [
          { code: 'm1' }, { code: 'm2' }, { code: 'm3' }, { code: 'p1' },
          { code: 'p2' }, { code: 'p3' }, { code: 's1' }, { code: 's2' },
          { code: 's3' }, { code: 'z1' }, { code: 'z2' }, { code: 'z3' },
          { code: 'z4' }, { code: 'm4' }
        ]
      },
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
        const seat = action.payload && action.payload.seat ? action.payload.seat : 'bottom';
        const tileCode = action.payload && action.payload.tileCode
          ? action.payload.tileCode
          : 'm4';
        snapshot.seats[seat].riverTiles.push({ code: tileCode });
        snapshot.phase = 'await_draw';
        snapshot.info.turnSeat = 'right';
        emit({
          type: 'tile:discard',
          payload: {
            seat,
            tileCode,
            riichi: false
          },
          snapshot: JSON.parse(JSON.stringify(snapshot)),
          timestamp: Date.now()
        });
      }
      return JSON.parse(JSON.stringify(snapshot));
    },
    emitRoundStart() {
      snapshot.phase = 'await_discard';
      snapshot.info.turnSeat = 'bottom';
      snapshot.info.jushu = 1;
      emit({
        type: 'session:round-start',
        payload: {
          matchState: {
            zhuangfeng: 0,
            jushu: 1,
            dealerSeat: 'right',
            changbang: 0,
            lizhibang: 0
          }
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
  bridge.setCoachSuggestionProvider(() => new Promise(() => {}));

  bridge.dispatch({
    type: 'discard-index',
    payload: {
      seat: 'bottom',
      tileIndex: 13,
      riichi: false
    }
  });

  await wait(150);
  fakeRuntime.emitRoundStart();
  await wait(2300);

  const coachState = bridge.getCoachState();
  assert(coachState === null, `expected no delayed ghost coach popup after round transition, got ${JSON.stringify(coachState)}`);

  console.log('[PASS] runtime-bridge-coach-timer-cleanup-smoke');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
