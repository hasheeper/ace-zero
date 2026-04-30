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
  const coachStateCalls = [];
  const customEvents = [];
  const coachStatusTexts = [];
  const coachDetailTexts = [];

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
    AceMahjongFormalRuntimeFactory: {
      createRuntime() {
        return {
          kind: 'fake-runtime',
          source: 'test',
          mode: 'single-round',
          start() {},
          dispatch() {},
          getSnapshot() {
            return {
              phase: 'await_discard',
              info: {
                turnSeat: 'bottom'
              },
              seats: {
                bottom: {
                  handTiles: [
                    { code: 'm1' }, { code: 'm2' }, { code: 'm3' }, { code: 'p1' },
                    { code: 'p2' }, { code: 'p3' }, { code: 's1' }, { code: 's2' },
                    { code: 's3' }, { code: 'z1' }, { code: 'z2' }, { code: 'z3' },
                    { code: 'z4' }, { code: 'm4' }
                  ]
                }
              }
            };
          },
          subscribe() {
            return function() {};
          }
        };
      }
    },
    AceZeroMahjongUI: {
      table: {
        applySnapshot() {},
        setCoachState(state) {
          coachStateCalls.push(state);
        }
      }
    },
    AceMahjongDebugPanel: {
      setCoachStatus(text) {
        coachStatusTexts.push(text);
      },
      setCoachDetail(text) {
        coachDetailTexts.push(text);
      }
    }
  };

  sandbox.window = sandbox;
  vm.runInNewContext(source, sandbox, { filename: bridgePath });

  return {
    bridge: sandbox.AceMahjongRuntimeBridge,
    coachStateCalls,
    customEvents,
    coachStatusTexts,
    coachDetailTexts
  };
}

function main() {
  const { bridge, coachStateCalls, customEvents, coachStatusTexts, coachDetailTexts } = loadBridgeIntoSandbox();
  assert(bridge && typeof bridge.setCoachState === 'function', 'expected runtime bridge to expose setCoachState');
  assert(typeof bridge.setCoachSuggestion === 'function', 'expected runtime bridge to expose setCoachSuggestion');
  assert(typeof bridge.setCoachSuggestionProvider === 'function', 'expected runtime bridge to expose setCoachSuggestionProvider');
  assert(typeof bridge.requestCoachSuggestion === 'function', 'expected runtime bridge to expose requestCoachSuggestion');
  assert(typeof bridge.getCoachRequestAvailability === 'function', 'expected runtime bridge to expose getCoachRequestAvailability');
  assert(typeof bridge.getCoachState === 'function', 'expected runtime bridge to expose getCoachState');
  assert(typeof bridge.clearCoachState === 'function', 'expected runtime bridge to expose clearCoachState');
  assert(typeof bridge.subscribeCoachState === 'function', 'expected runtime bridge to expose subscribeCoachState');

  const observed = [];
  const unsubscribe = bridge.subscribeCoachState((state) => {
    observed.push(state);
  });

  const published = bridge.setCoachState({
    source: 'mortal',
    perspectiveSeat: 'right',
    recommended: {
      type: 'discard',
      seat: 'right',
      tileCode: 's3',
      riichi: false
    },
    summary: '建议切 s3'
  });

  assert(published && published.status === 'ready', `expected normalized coach state to be ready, got ${JSON.stringify(published)}`);
  assert(
    published.recommended && published.recommended.tileCode === 's3',
    `expected normalized recommended tileCode=s3, got ${JSON.stringify(published)}`
  );

  const fetched = bridge.getCoachState();
  assert(
    fetched && fetched.summary === '建议切 s3',
    `expected getCoachState to return published state, got ${JSON.stringify(fetched)}`
  );

  assert(coachStateCalls.length === 1, `expected table.setCoachState to be called once, got ${coachStateCalls.length}`);
  assert(observed.length === 1, `expected coach subscriber to observe one state, got ${observed.length}`);
  assert(customEvents.length === 1 && customEvents[0].type === 'ace-mahjong-coach-state', `expected one ace-mahjong-coach-state event, got ${JSON.stringify(customEvents)}`);
  assert(coachStatusTexts.length === 1 && /coach: ready/.test(coachStatusTexts[0]), `expected debug panel coach status to be updated, got ${JSON.stringify(coachStatusTexts)}`);
  assert(coachDetailTexts.length === 1 && /tile=s3/.test(coachDetailTexts[0]), `expected debug panel coach detail to describe tile=s3, got ${JSON.stringify(coachDetailTexts)}`);

  const publishedByAlias = bridge.setCoachSuggestion({
    source: 'mortal',
    perspectiveSeat: 'right',
    recommended: {
      type: 'pass',
      seat: 'right'
    }
  });
  assert(
    publishedByAlias && publishedByAlias.recommended && publishedByAlias.recommended.type === 'pass',
    `expected setCoachSuggestion alias to publish pass state, got ${JSON.stringify(publishedByAlias)}`
  );
  assert(observed.length === 2, `expected subscribed listener to observe set + alias publish, got ${observed.length}`);

  bridge.setCoachSuggestionProvider(() => ({
    source: 'test-provider',
    perspectiveSeat: 'bottom',
    summary: '建议切 m3',
    recommended: {
      type: 'discard',
      seat: 'bottom',
      tileCode: 'm3',
      riichi: false
    }
  }));
  return bridge.bootstrap({
    session: { enabled: false },
    players: [
      { seat: 'bottom', name: '南宫', title: '自家', human: true, ai: { enabled: false } }
    ]
  }).then(async () => {
    const availability = bridge.getCoachRequestAvailability();
    assert(availability && availability.ok === true && availability.reason === 'player-discard-turn', `expected coach request availability on player discard turn, got ${JSON.stringify(availability)}`);
    const requested = await bridge.requestCoachSuggestion({ source: 'test' });
    assert(requested && requested.recommended && requested.recommended.tileCode === 'm3', `expected manual coach request to publish provider result, got ${JSON.stringify(requested)}`);

    unsubscribe();
    bridge.clearCoachState();

    const cleared = bridge.getCoachState();
    assert(cleared === null, `expected clearCoachState to clear state, got ${JSON.stringify(cleared)}`);
    assert(coachStateCalls.length >= 4, `expected table.setCoachState to include manual request flow, got ${coachStateCalls.length}`);
    assert(observed.length >= 2, `expected unsubscribed listener not to receive clear event, got ${observed.length}`);

    console.log('[PASS] runtime-bridge-coach-state-smoke');
    console.log(`  snapshot=${JSON.stringify({
      published,
      publishedByAlias,
      requested,
      coachStateCalls,
      coachStatusTexts,
      coachDetailTexts,
      customEventTypes: customEvents.map((event) => event.type)
    })}`);
  });
}

Promise.resolve(main()).catch((error) => {
  console.error(error);
  process.exit(1);
});
