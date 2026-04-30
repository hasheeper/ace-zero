'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function loadBridgeIntoSandbox() {
  const bridgePath = path.resolve(__dirname, '../frontend/scripts/runtime/bridge/runtime-bridge.js');
  const source = fs.readFileSync(bridgePath, 'utf8');
  const coachAnalysisCalls = [];
  const customEvents = [];

  function CustomEvent(type, options = {}) {
    this.type = type;
    this.detail = options.detail;
  }

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
    CustomEvent,
    dispatchEvent(event) {
      customEvents.push(event);
    },
    AceMahjongRuntimeAutoStart: false,
    AceMahjongBrowserCoreAdapter: {},
    AceMahjongWallService: {
      createWallService() {}
    },
    AceZeroMahjongUI: {
      table: {
        applySnapshot() {},
        setCoachAnalysisState(state) {
          coachAnalysisCalls.push(state);
        }
      }
    }
  };

  sandbox.window = sandbox;
  vm.runInNewContext(source, sandbox, { filename: bridgePath });

  return {
    bridge: sandbox.AceMahjongRuntimeBridge,
    coachAnalysisCalls,
    customEvents
  };
}

function main() {
  const { bridge, coachAnalysisCalls, customEvents } = loadBridgeIntoSandbox();
  assert(typeof bridge.getCoachAnalysisState === 'function', 'expected getCoachAnalysisState');
  assert(typeof bridge.setCoachAnalysisState === 'function', 'expected setCoachAnalysisState');
  assert(typeof bridge.clearCoachAnalysisState === 'function', 'expected clearCoachAnalysisState');
  assert(typeof bridge.subscribeCoachAnalysisState === 'function', 'expected subscribeCoachAnalysisState');

  const observed = [];
  const unsubscribe = bridge.subscribeCoachAnalysisState((state) => observed.push(state));

  const published = bridge.setCoachAnalysisState({
    source: 'benchmark',
    summary: 'easy(right) 当前主要分歧集中在防守弃牌。',
    report: {
      totals: { rows: 5, subjects: 1 },
      subjects: [
        {
          summary: {
            id: 'ai:right:easy',
            label: 'easy(right)',
            mortalRate: 0.2,
            actionTypeRate: 1,
            riichiRate: 0.8,
            goodCount: 1,
            neutralCount: 3,
            badCount: 1,
            bucketCounts: {
              'tile-defense': 1,
              'tile-choice': 3
            }
          }
        }
      ]
    }
  });

  assert(published && published.status === 'ready', `expected ready analysis state, got ${JSON.stringify(published)}`);
  assert(coachAnalysisCalls.length === 1, `expected table.setCoachAnalysisState once, got ${coachAnalysisCalls.length}`);
  assert(observed.length === 1, `expected one analysis listener event, got ${observed.length}`);
  assert(customEvents.some((event) => event.type === 'ace-mahjong-coach-analysis-state'), 'expected analysis custom event');

  unsubscribe();
  bridge.clearCoachAnalysisState();
  assert(bridge.getCoachAnalysisState() === null, 'expected cleared analysis state to be null');
  assert(coachAnalysisCalls.length === 2, `expected table.setCoachAnalysisState for set/clear, got ${coachAnalysisCalls.length}`);
  assert(observed.length === 1, 'expected unsubscribed listener not to receive clear');

  console.log('[PASS] runtime-bridge-analysis-state-smoke');
  console.log(`  snapshot=${JSON.stringify({
    published,
    customEventTypes: customEvents.map((event) => event.type)
  })}`);
}

main();
