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
      turnSeat: 'right',
      zhuangfeng: 0,
      jushu: 0,
      dealerSeat: 'bottom'
    },
    seats: {
      bottom: { riverTiles: [], handTiles: [] },
      right: {
        riverTiles: [],
        handTiles: [
          { code: 'm1' }, { code: 'm2' }, { code: 'm3' }, { code: 'p1' },
          { code: 'p2' }, { code: 'p3' }, { code: 's1' }, { code: 's2' },
          { code: 's3' }, { code: 'z1' }, { code: 'z2' }, { code: 'z3' },
          { code: 'z4' }, { code: 'm4' }
        ]
      },
      top: { riverTiles: [], handTiles: [] },
      left: { riverTiles: [], handTiles: [] }
    }
  };

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
      if (action && action.type === 'discard') {
        const seat = action.payload && action.payload.seat ? action.payload.seat : 'right';
        const tileCode = action.payload && action.payload.tileCode ? action.payload.tileCode : 's3';
        const riichi = Boolean(action.payload && action.payload.riichi);
        snapshot.seats[seat].riverTiles.push({ code: tileCode });
        snapshot.seats[seat].handTiles = (snapshot.seats[seat].handTiles || []).filter((tile, index) => {
          if (!tile || tile.code !== tileCode) return true;
          return index !== (snapshot.seats[seat].handTiles || []).findIndex((entry) => entry && entry.code === tileCode);
        });
        const event = {
          type: 'tile:discard',
          payload: {
            seat,
            tileCode,
            riichi
          },
          snapshot: JSON.parse(JSON.stringify(snapshot)),
          meta: {
            source: 'fake-runtime'
          }
        };
        listeners.forEach((listener) => listener(event));
      }
      return snapshot;
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

  const idleAnalysisState = bridge.getCoachAnalysisState();
  assert(idleAnalysisState && idleAnalysisState.report, `expected idle analysis state report after bootstrap, got ${JSON.stringify(idleAnalysisState)}`);
  assert(Array.isArray(idleAnalysisState.report.subjects) && idleAnalysisState.report.subjects.length === 2, `expected subject catalog after bootstrap, got ${JSON.stringify(idleAnalysisState.report)}`);
  assert(Array.isArray(idleAnalysisState.report.rounds) && idleAnalysisState.report.rounds.length === 1, `expected round catalog after bootstrap, got ${JSON.stringify(idleAnalysisState.report)}`);
  assert(typeof bridge.getCoachContext === 'function', 'expected runtime bridge to expose getCoachContext');

  bridge.setCoachSuggestion({
    source: 'mortal',
    perspectiveSeat: 'right',
    summary: '建议切 s3',
    recommended: {
      type: 'discard',
      seat: 'right',
      tileCode: 's3',
      riichi: false
    }
  });

  bridge.dispatch({
    type: 'discard',
    payload: {
      seat: 'right',
      tileCode: 's3',
      riichi: false
    }
  });

  const analysisState = bridge.getCoachAnalysisState();
  const coachContext = bridge.getCoachContext();
  assert(analysisState && analysisState.status === 'ready', `expected ready live analysis state, got ${JSON.stringify(analysisState)}`);
  assert(analysisState.report && analysisState.report.totals && analysisState.report.totals.rows === 1, `expected one analysis row, got ${JSON.stringify(analysisState && analysisState.report)}`);
  assert(Array.isArray(analysisState.report.subjects) && analysisState.report.subjects.length === 2, 'expected subject catalog to be retained');
  assert(coachContext && Array.isArray(coachContext.runtimeEvents) && coachContext.runtimeEvents.length === 1, `expected coach context to capture one runtime event, got ${JSON.stringify(coachContext)}`);
  assert(coachContext.runtimeEvents[0].type === 'tile:discard', `expected coach context event type tile:discard, got ${JSON.stringify(coachContext)}`);
  const targetSubject = analysisState.report.subjects.find((subject) => subject && subject.summary && /隐僧/.test(subject.summary.label));
  assert(targetSubject, `expected target subject to include player name, got ${JSON.stringify(analysisState.report.subjects)}`);
  assert(targetSubject.summary.goodCount === 1, `expected exact match to count as good, got ${JSON.stringify(targetSubject.summary)}`);

  console.log('[PASS] runtime-bridge-live-analysis-smoke');
  console.log(`  snapshot=${JSON.stringify({
    idleSubjects: idleAnalysisState.report.subjects.map((subject) => subject.summary.label),
    summary: analysisState.summary,
    subject: targetSubject.summary,
    round: analysisState.report.rounds[0].summary
  })}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
