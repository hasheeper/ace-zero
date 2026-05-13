#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {
  PACK_ROOT,
  assert,
  assertEqual,
  createHero
} = require('./smoke-utils');

const RUNTIME_FILES = [
  'asset/data.js',
  'asset/runtime.js',
  'act/data.js',
  'act/generated-data.js',
  'act/generated-runtime.js',
  'act/frontend-snapshot.js',
  'act/encounter-runtime.js',
  'act/narrative-runtime.js',
  'act/plugin.js',
  'dashboard/loader.js'
];

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function runPackFile(sandbox, relativeFile) {
  const filename = path.join(PACK_ROOT, relativeFile);
  const source = fs.readFileSync(filename, 'utf8');
  vm.runInContext(source, sandbox, { filename: relativeFile });
}

function loadHostSandbox() {
  const sandbox = {
    console,
    globalThis: null,
    unsafeWindow: null,
    window: null,
    __ACE0_DASHBOARD_LOADER_TEST_HOOKS__: true
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  sandbox.unsafeWindow = sandbox;
  sandbox.parent = sandbox;
  sandbox.top = sandbox;
  vm.createContext(sandbox);
  RUNTIME_FILES.forEach((relativeFile) => runPackFile(sandbox, relativeFile));
  assert(sandbox.ACE0Modules?.act, 'ACT module should load in host smoke');
  assert(sandbox.ACE0Modules?.assetDeck, 'AssetDeck module should load in host smoke');
  assert(sandbox.ACE0DashboardLoaderTestHooks?.applyPendingActAssetDeckCommands, 'Dashboard loader test hooks should expose host settlement');
  return {
    sandbox,
    act: sandbox.ACE0Modules.act,
    assetDeck: sandbox.ACE0Modules.assetDeck,
    hooks: sandbox.ACE0DashboardLoaderTestHooks
  };
}

function createAssetActState(act, amount) {
  const config = act.getChapter(act.getDefaultActState().id);
  const actState = {
    ...act.getDefaultActState(),
    nodeIndex: 1,
    route_history: ['node1-entry'],
    stage: 'executing',
    phase_index: 0,
    phase_slots: [
      {
        key: 'asset',
        amount,
        source: 'limited',
        sources: Array.from({ length: amount }, (_, index) => index === amount - 1 ? 'reserve' : 'limited')
      },
      null,
      null,
      null
    ],
    pendingResolutions: [],
    pendingAssetDeckCommands: [],
    resolutionHistory: [],
    resourceSpent: { combat: 0, rest: 0, asset: 0, vision: 0 }
  };
  act.consumeSingleActPhase(actState, createHero(), config, {});
  return actState;
}

function testHostLoaderSettlesAssetThree() {
  const { act, assetDeck, hooks } = loadHostSandbox();
  const nextState = {
    world: {
      assetDeck: assetDeck.makeDefaultAssetDeckState()
    }
  };
  const nextActState = createAssetActState(act, 3);

  assertEqual(nextActState.pendingAssetDeckCommands.length, 2, 'asset III should enter host commit with two pending commands');

  const settledAct = hooks.applyPendingActAssetDeckCommands(nextState, clone(nextActState));

  assertEqual(settledAct.pendingAssetDeckCommands.length, 0, 'host loader should consume pending AssetDeck commands');
  assertEqual(settledAct.resolutionHistory.length, 2, 'host loader should append ACT resolution history entries');
  assertEqual(settledAct.resolutionHistory[0].outcome, 'asset_granted', 'first host result should be grant');
  assertEqual(settledAct.resolutionHistory[1].outcome, 'offer_opened', 'second host result should be offer');
  assertEqual(settledAct.reserve.asset, 0, 'grant + high offer should net to zero reserve asset');
  assert(!Object.prototype.hasOwnProperty.call(nextState.world.assetDeck, 'asset_count'), 'host loader should not write asset_count');
  assert(nextState.world.assetDeck.pending_offer, 'host loader should leave a pending high offer');
  assertEqual(nextState.world.assetDeck.pending_offer.pool, 'high', 'host loader should open high offer');
  assertEqual(nextState.world.assetDeck.history.length, 2, 'AssetDeck history should record both host-applied commands');
  assert(!('source' in nextState.world.assetDeck.history[0]), 'AssetDeck history should not retain source payload');
  assert(!('source' in nextState.world.assetDeck.history[1]), 'AssetDeck history should not retain source payload');
}

function testHostLoaderPreservesNonPendingCommands() {
  const { assetDeck, hooks } = loadHostSandbox();
  const nextState = {
    world: {
      assetDeck: assetDeck.makeDefaultAssetDeckState()
    }
  };
  const nextActState = {
    id: 'chapter0_exchange',
    pendingAssetDeckCommands: [
      {
        id: 'already-resolved',
        status: 'resolved',
        command: { kind: 'grant_asset', payload: { amount: 2 } }
      }
    ],
    resolutionHistory: []
  };

  const settledAct = hooks.applyPendingActAssetDeckCommands(nextState, clone(nextActState));

  assertEqual(settledAct.pendingAssetDeckCommands.length, 1, 'host loader should preserve non-pending commands');
  assert(!Object.prototype.hasOwnProperty.call(nextState.world.assetDeck, 'asset_count'), 'non-pending commands should not write asset_count');
  assertEqual(settledAct.resolutionHistory.length, 0, 'non-pending commands should not append history');
}

testHostLoaderSettlesAssetThree();
testHostLoaderPreservesNonPendingCommands();

console.log('[act-asset-host-smoke] all checks passed');
