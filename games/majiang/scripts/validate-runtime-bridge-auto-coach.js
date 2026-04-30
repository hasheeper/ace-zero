'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
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
          : (Number.isInteger(action.payload && action.payload.tileIndex)
            ? (snapshot.seats[seat].handTiles[action.payload.tileIndex] && snapshot.seats[seat].handTiles[action.payload.tileIndex].code) || 'm4'
            : 'm4');
        snapshot.seats[seat].riverTiles.push({ code: tileCode });
        const index = snapshot.seats[seat].handTiles.findIndex((tile) => tile && tile.code === tileCode);
        if (index >= 0) snapshot.seats[seat].handTiles.splice(index, 1);
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
          meta: { source: 'fake-runtime' },
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
        meta: { source: 'fake-runtime' },
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
  const coachStatuses = [];
  const autoStatuses = [];

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
    },
    AceMahjongDebugPanel: {
      setCoachStatus(text) {
        coachStatuses.push(text);
      },
      setCoachDetail() {},
      setCoachAutoStatus(text) {
        autoStatuses.push(text);
      },
      setCoachAutoEnabled() {},
      setCoachRequestEnabled() {}
    }
  };

  sandbox.window = sandbox;
  vm.runInNewContext(source, sandbox, { filename: bridgePath });

  return {
    bridge: sandbox.AceMahjongRuntimeBridge,
    fakeRuntime,
    coachStatuses,
    autoStatuses
  };
}

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const { bridge, fakeRuntime, coachStatuses, autoStatuses } = loadBridgeIntoSandbox();
  await bridge.bootstrap({
    mode: 'single-round',
    session: { enabled: false },
    players: [
      { seat: 'bottom', name: '南宫', title: '自家', human: true, ai: { enabled: false } },
      { seat: 'right', name: '隐僧', title: '下家', human: false, ai: { enabled: true, difficulty: 'easy' } }
    ]
  });

  let providerCalls = 0;
  bridge.setCoachSuggestionProvider(({ runtime, options }) => {
    providerCalls += 1;
    const response = {
      source: 'test-auto-provider',
      perspectiveSeat: 'bottom',
      summary: '自动建议：打出 四万',
      recommended: {
        type: 'discard',
        seat: 'bottom',
        tileCode: 'm4',
        riichi: false
      },
      contextSignature: options && typeof options.contextSignature === 'string'
        ? options.contextSignature
        : `test-auto-signature::${providerCalls}`
    };
    if (options && options.background) {
      return new Promise((resolve) => {
        setTimeout(() => resolve(response), 260);
      });
    }
    return response;
  });

  assert(bridge.getAutoCoachEnabled() === false, 'expected auto coach disabled by default');
  bridge.setAutoCoachEnabled(true);
  assert(bridge.getAutoCoachEnabled() === true, 'expected auto coach enabled');

  fakeRuntime.emitDrawForBottom('m4');
  await wait(320);

  const preActionCoachState = bridge.getCoachState();
  assert(preActionCoachState && preActionCoachState.status === 'ready', `expected visible coach suggestion before player acts, got ${JSON.stringify(preActionCoachState)}`);
  assert(preActionCoachState.recommended && preActionCoachState.recommended.tileCode === 'm4', `expected pre-action suggested tile m4, got ${JSON.stringify(preActionCoachState)}`);
  assert(preActionCoachState.reviewMode === false, `expected pre-action coach state to be actionable suggestion, got ${JSON.stringify(preActionCoachState)}`);

  bridge.dispatch({
    type: 'discard-index',
    payload: {
      seat: 'bottom',
      tileIndex: 14,
      riichi: false
    }
  });

  await wait(360);

  const coachState = bridge.getCoachState();
  assert(coachState && coachState.status === 'ready', `expected post-action review popup after discard, got ${JSON.stringify(coachState)}`);
  assert(coachState.recommended && coachState.recommended.tileCode === 'm4', `expected post-action recommended tile m4, got ${JSON.stringify(coachState)}`);
  assert(coachState.source === 'auto-review', `expected auto-review source, got ${JSON.stringify(coachState)}`);
  assert(/本手判定：善手/.test(coachState.summary || ''), `expected coach summary to contain post-action verdict, got ${JSON.stringify(coachState)}`);

  const analysisState = bridge.getCoachAnalysisState();
  assert(analysisState && analysisState.status === 'ready', `expected ready analysis state, got ${JSON.stringify(analysisState)}`);
  assert(/本手判定：善手/.test(analysisState.summary), `expected latest-row summary to mark good move, got ${JSON.stringify(analysisState)}`);
  assert(providerCalls >= 1, `expected auto provider to be called, got ${providerCalls}`);
  assert(autoStatuses.some((text) => /review auto: on/.test(text)), `expected debug panel auto status update, got ${JSON.stringify(autoStatuses)}`);
  assert(coachStatuses.some((text) => /coach: ready/.test(text)), `expected debug panel coach ready status, got ${JSON.stringify(coachStatuses)}`);

  console.log('[PASS] runtime-bridge-auto-coach-smoke');
  console.log(`  snapshot=${JSON.stringify({
    providerCalls,
    coachState,
    analysisSummary: analysisState.summary,
    autoStatuses,
    coachStatuses
  })}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
