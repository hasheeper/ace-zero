#!/usr/bin/env node

const {
  assert,
  assertEqual,
  loadTavernSandbox,
  createTavernRuntime,
  createHero
} = require('./smoke-utils');

(async () => {
  const { sandbox, act, tavernFactory } = loadTavernSandbox();
  const floorKey = 'message:tavern-host-asset';
  const eraVars = {
    hero: createHero(),
    world: {
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
        phase_index: 0,
        phase_advance: 1,
        phasePlanLock: {
          nodeId: 'node1-entry',
          nodeIndex: 1,
          locked: true,
          confirmedPhaseIndex: 0,
          floorKey
        },
        phase_slots: [
          { key: 'asset', amount: 1, source: 'limited', sources: ['limited'] },
          null,
          null,
          null
        ],
        reserve: { combat: 0, rest: 0, asset: 0, vision: 0 },
        resourceSpent: { combat: 0, rest: 0, asset: 0, vision: 0 }
      }
    }
  };
  const { runtime, patches } = createTavernRuntime(tavernFactory, sandbox, { eraVars });

  const resolved = await runtime.resolvePendingActAdvance(eraVars, { floorKey });
  assertEqual(resolved.changed, true, 'Tavern host should resolve asset phase');
  assertEqual(patches.length, 1, 'Tavern host should persist one compact patch');
  assert(resolved.eraVars.world.assetDeck.offer, 'Tavern host should open compact offer immediately');
  assertEqual(resolved.eraVars.world.assetDeck.offer.pool, 'low', 'Asset I should open low pool');
  assert(!Object.prototype.hasOwnProperty.call(resolved.eraVars.world.act, 'pendingAssetDeckCommands'), 'Tavern host should not persist AssetDeck command queue');
  assert(!Object.prototype.hasOwnProperty.call(resolved.eraVars.world.assetDeck.offer, 'lv'), 'Offer should not store lv');

  console.log('[act-asset-tavern-host-smoke] all checks passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
