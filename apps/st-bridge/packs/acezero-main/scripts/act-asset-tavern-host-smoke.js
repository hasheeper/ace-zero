#!/usr/bin/env node

const {
  assert,
  assertEqual,
  loadTavernSandbox,
  createTavernRuntime,
  createActStateAt,
  createHero
} = require('./smoke-utils');

const { sandbox, act, tavernFactory } = loadTavernSandbox();
const assetDeck = sandbox.ACE0Modules && sandbox.ACE0Modules.assetDeck;

async function testTavernHostSettlesAssetTokenDuringPhaseAdvance() {
  const eraVars = {
    hero: createHero({ funds: 21.98 }),
    world: {
      current_time: { day: 1, phase: 'MORNING' },
      location: { layer: 'THE_EXCHANGE', site: 'casino_floor', tags: ['casino'] },
      tags: ['casino'],
      flags: [],
      storyFlags: {},
      clockPressure: 0,
      assetDeck: assetDeck.makeDefaultAssetDeckState(),
      act: createActStateAt(act, 1, ['node1-entry'], {
        stage: 'executing',
        phase_index: 0,
        phase_advance: 1,
        phasePlanLock: { nodeId: 'node1-entry', nodeIndex: 1, locked: true, confirmedPhaseIndex: 0 },
        phase_slots: [
          { key: 'asset', amount: 1, source: 'limited', sources: ['limited'] },
          null,
          null,
          null
        ],
        resourceSpent: { combat: 0, rest: 0, asset: 0, vision: 0 },
        pendingAssetDeckCommands: [],
        resolutionHistory: []
      })
    }
  };
  const { runtime, patches } = createTavernRuntime(tavernFactory, sandbox, { eraVars });

  const resolved = await runtime.resolvePendingActAdvance(eraVars);
  const nextWorld = resolved.eraVars.world;
  const nextAct = nextWorld.act;

  assert(resolved.changed, 'asset phase advance should be committed');
  assertEqual(nextAct.pendingAssetDeckCommands.length, 0, 'tavern host should consume pending AssetDeck commands during commit');
  assertEqual(nextAct.resolutionHistory.length, 2, 'tavern host should record grant + offer resolution history');
  assert(nextWorld.assetDeck.pending_offer, 'tavern host should open an AssetDeck offer immediately');
  assertEqual(nextWorld.assetDeck.pending_offer.pool, 'low', 'Asset I should open the low pool');
  assertEqual(nextAct.reserve.asset, 0, 'grant + low offer should net to zero reserve asset');
  assert(!Object.prototype.hasOwnProperty.call(nextWorld.assetDeck, 'asset_count'), 'tavern host should not write asset_count');
  assert(patches.some((patch) => patch.world && patch.world.assetDeck), 'host writeback should include world.assetDeck');
}

testTavernHostSettlesAssetTokenDuringPhaseAdvance()
  .then(() => {
    console.log('[act-asset-tavern-host-smoke] all checks passed');
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
