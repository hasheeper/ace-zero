#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {
  PACK_ROOT,
  assert,
  assertEqual,
  loadTavernSandbox,
  createTavernRuntime,
  createActStateAt,
  createHero
} = require('./smoke-utils');

function runPackFile(sandbox, relativeFile) {
  const filename = path.join(PACK_ROOT, relativeFile);
  const source = fs.readFileSync(filename, 'utf8');
  vm.runInContext(source, sandbox, { filename: relativeFile });
}

function diffNumberMap(before = {}, after = {}) {
  const out = {};
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  keys.forEach((key) => {
    const delta = Math.round((Number(after[key]) || 0) - (Number(before[key]) || 0));
    if (delta !== 0) out[key] = delta;
  });
  return out;
}

function diffStringArray(beforeValues = [], afterValues = []) {
  const previous = new Set(Array.isArray(beforeValues) ? beforeValues : []);
  return (Array.isArray(afterValues) ? afterValues : []).filter(value => !previous.has(value));
}

async function main() {
  const { sandbox, act, tavernFactory } = loadTavernSandbox();
  runPackFile(sandbox, 'tavern/result.js');
  const assetDeck = sandbox.ACE0Modules.assetDeck;
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
        phase_index: 1,
        phase_advance: 1,
        phasePlanLock: { nodeId: 'node1-entry', nodeIndex: 1, locked: true, confirmedPhaseIndex: 1 },
        phase_slots: [
          null,
          { key: 'asset', amount: 1, source: 'limited', sources: ['limited'] },
          null,
          null
        ],
        resourceSpent: { combat: 0, rest: 0, asset: 0, vision: 0 },
        pendingAssetDeckCommands: [],
        resolutionHistory: []
      })
    }
  };

  const { runtime } = createTavernRuntime(tavernFactory, sandbox, { eraVars });
  const before = runtime.createActRuntimeSnapshot(eraVars);
  const resolved = await runtime.resolvePendingActAdvance(eraVars);
  const after = runtime.createActRuntimeSnapshot(resolved.eraVars);
  const resultRuntime = sandbox.ACE0TavernResultRuntime.create({
    constants: { ACT_RESOURCE_KEYS: ['combat', 'rest', 'asset', 'vision'], ACT_PHASE_LABELS: ['一段', '二段', '三段', '四段'] },
    deps: {
      getActResultType: () => 'phase_advance',
      diffManaByRoster: diffNumberMap,
      diffNumberMap,
      diffStringArray,
      getArrayDiff: (afterValues, beforeValues) => diffStringArray(beforeValues, afterValues),
      getAssetDeckModuleApi: () => assetDeck
    }
  });
  const payload = resultRuntime.buildActResultPayload(before, after);

  assert(payload.assetOffer, 'ACT_RESULT should include assetOffer when an AssetDeck offer is pending');
  assertEqual(payload.assetOffer.protocol, 'ace0.assetOffer.v1', 'asset offer protocol should be stable');
  assertEqual(payload.assetOffer.pool, 'low', 'asset I should expose low pool in ACT_RESULT');
  assertEqual(payload.assetOffer.choices.length, 3, 'ACT_RESULT should expose three card choices');
  assert(payload.assetOffer.choices.every(card => card.name && card.cardId), 'card choices should include display names and ids');
  console.log('[act-result-asset-offer-smoke] all checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
