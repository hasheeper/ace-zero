#!/usr/bin/env node

const {
  assert,
  assertEqual,
  loadTavernSandbox,
  createTavernRuntime,
  createHero
} = require('./smoke-utils');

function makeWorld(act, floorKey = 'message:host-asset') {
  return {
    floorKey,
    assetDeck: {
      slots: { general: 4, void: 2 },
      bag: { general: [], void: [] },
      offer: null
    },
    act: {
      ...act.getDefaultActState(),
      nodeIndex: 1,
      route_history: ['node1-entry'],
      stage: 'executing',
      reserve: { combat: 0, rest: 0, asset: 0, vision: 0 },
      resourceSpent: { combat: 0, rest: 0, asset: 0, vision: 0 }
    }
  };
}

function testHostSettlesCompactAssetEvent() {
  const { sandbox, act, tavernFactory } = loadTavernSandbox();
  const eraVars = { hero: createHero(), world: makeWorld(act) };
  const { runtime } = createTavernRuntime(tavernFactory, sandbox, { eraVars });
  const event = {
    id: 'host-asset-event',
    type: 'asset_offer',
    amount: 3,
    pool: 'high',
    floorKey: eraVars.world.floorKey,
    seed: 'host-asset-event-seed'
  };

  const settled = runtime.settleActAssetDeckEventsForHost(eraVars.world, eraVars.world.act, [event]);
  assertEqual(settled.changed, true, 'Host should settle asset event');
  assert(settled.world.assetDeck.offer, 'Host should create compact offer');
  assertEqual(settled.world.assetDeck.offer.pool, 'high', 'Host should open high pool');
  assertEqual(settled.world.assetDeck.offer.floor, eraVars.world.floorKey, 'Host should bind offer to floor');
  assertEqual(settled.actState.reserve.asset, 0, 'Host should spend the granted asset token on the offer');
  assert(!Object.prototype.hasOwnProperty.call(settled.actState, 'pendingAssetDeckCommands'), 'Host should not persist AssetDeck commands');
  assert(!Object.prototype.hasOwnProperty.call(settled.world.assetDeck, 'history'), 'Host should not store AssetDeck history');
}

testHostSettlesCompactAssetEvent();

console.log('[act-asset-host-smoke] all checks passed');
