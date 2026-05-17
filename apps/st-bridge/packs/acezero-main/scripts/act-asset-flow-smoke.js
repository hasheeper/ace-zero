#!/usr/bin/env node

const {
  assert,
  assertEqual,
  loadTavernSandbox,
  createTavernRuntime,
  createHero
} = require('./smoke-utils');

function buildEraVars(act, amount, floorKey) {
  return {
    hero: createHero(),
    world: {
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
          { key: 'asset', amount, source: 'limited', sources: Array.from({ length: amount }, () => 'limited') },
          null,
          null,
          null
        ],
        reserve: { combat: 0, rest: 0, asset: 0, vision: 0 },
        resourceSpent: { combat: 0, rest: 0, asset: 0, vision: 0 }
      }
    }
  };
}

async function testAssetPhaseOpensCompactOffer() {
  const { sandbox, act, tavernFactory } = loadTavernSandbox();
  const floorKey = 'message:asset-flow';
  const eraVars = buildEraVars(act, 2, floorKey);
  const { runtime } = createTavernRuntime(tavernFactory, sandbox, { eraVars });

  const result = await runtime.resolvePendingActAdvance(eraVars, { floorKey, persist: false });
  assertEqual(result.changed, true, 'Asset phase advance should change state');
  const nextWorld = result.eraVars.world;
  assert(nextWorld.assetDeck.offer, 'Asset phase should open compact offer');
  assertEqual(nextWorld.assetDeck.offer.floor, floorKey, 'Offer should bind to current floor');
  assertEqual(nextWorld.assetDeck.offer.pool, 'mid', 'Asset II should open mid pool');
  assert(!Object.prototype.hasOwnProperty.call(nextWorld.assetDeck.offer, 'lv'), 'Offer should not store lv');
  assertEqual(nextWorld.assetDeck.offer.choices.length, 3, 'Offer should include three choices');
  assertEqual(nextWorld.assetDeck.offer.reroll.length, 3, 'Offer should include pre-rolled reroll choices');
  assertEqual(nextWorld.act.reserve.asset, 0, 'Grant and open cost should net to zero reserve asset for the triggering token');
  assert(!Object.prototype.hasOwnProperty.call(nextWorld.act, 'pendingAssetDeckCommands'), 'ACT should not persist AssetDeck commands');
  assertEqual(nextWorld.act.resolutionHistory.length, 0, 'Asset phase should not append ACT resolution history');
}

async function testSameFloorSettlementIsIdempotent() {
  const { sandbox, act, tavernFactory } = loadTavernSandbox();
  const floorKey = 'message:asset-idempotent';
  const eraVars = buildEraVars(act, 1, floorKey);
  eraVars.world.assetDeck.offer = {
    floor: floorKey,
    id: 'offer:low:existing',
    pool: 'low',
    settled: false,
    choices: [{ id: 'asset_mana_max_bronze', lv: 1 }]
  };
  eraVars.world.act.reserve.asset = 0;
  const { runtime } = createTavernRuntime(tavernFactory, sandbox, { eraVars });
  const events = [{ id: 'repeat', type: 'asset_offer', amount: 1, pool: 'low', floorKey }];

  const settled = runtime.settleActAssetDeckEventsForHost(eraVars.world, eraVars.world.act, events);
  assertEqual(settled.changed, false, 'Same-floor offer settlement should be idempotent');
  assertEqual(eraVars.world.act.reserve.asset, 0, 'Same-floor repeat should not grant extra asset points');
}

async function testStaleOfferClearsOnNextFloor() {
  const { sandbox, act, tavernFactory } = loadTavernSandbox();
  const oldFloorKey = 'message:asset-old';
  const nextFloorKey = 'message:asset-next';
  const eraVars = buildEraVars(act, 1, nextFloorKey);
  eraVars.world.assetDeck.offer = {
    floor: oldFloorKey,
    id: 'offer:low:old',
    pool: 'low',
    settled: true,
    choices: [{ id: 'asset_skill_hex_l1', lv: 1 }]
  };
  eraVars.world.act.phase_advance = 0;
  eraVars.world.act.phase_slots = [null, null, null, null];
  const { runtime } = createTavernRuntime(tavernFactory, sandbox, { eraVars });

  const settled = runtime.settleActAssetDeckEventsForHost(eraVars.world, eraVars.world.act, []);
  assertEqual(settled.changed, true, 'New floor without asset event should clear stale offer state');
  assertEqual(settled.world.assetDeck.offer, null, 'Stale settled offer should not persist onto a different floor');

  const resolved = await runtime.resolvePendingActAdvance(eraVars, { floorKey: nextFloorKey, persist: false });
  assertEqual(resolved.changed, true, 'Resolve advance should persist stale-offer cleanup even without phase advance');
  assertEqual(resolved.eraVars.world.assetDeck.offer, null, 'Resolved next-floor state should have no offer');
}

(async () => {
  await testAssetPhaseOpensCompactOffer();
  await testSameFloorSettlementIsIdempotent();
  await testStaleOfferClearsOnNextFloor();
  console.log('[act-asset-flow-smoke] all checks passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
