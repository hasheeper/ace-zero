#!/usr/bin/env node

const {
  assert,
  assertEqual,
  loadActSandbox,
  getChapterConfig,
  createHero
} = require('./smoke-utils');

function buildAssetPhaseState(act, amount, phaseIndex = 0) {
  return {
    ...act.getDefaultActState(),
    nodeIndex: 1,
    route_history: ['node1-entry'],
    stage: 'executing',
    phase_index: phaseIndex,
    phasePlanLock: {
      nodeId: 'node1-entry',
      nodeIndex: 1,
      locked: true,
      confirmedPhaseIndex: phaseIndex,
      floorKey: `message:asset-command:${phaseIndex}`
    },
    phase_slots: [null, null, null, null].map((slot, index) => (
      index === phaseIndex ? { key: 'asset', amount, source: 'limited', sources: Array.from({ length: amount }, () => 'limited') } : slot
    )),
    pendingResolutions: [],
    resourceSpent: { combat: 0, rest: 0, asset: 0, vision: 0 }
  };
}

function testAssetTokenCreatesTransientEvent() {
  const { act } = loadActSandbox();
  const config = getChapterConfig(act);
  const actState = buildAssetPhaseState(act, 2, 1);

  act.consumeSingleActPhase(actState, createHero(), config, {});

  assertEqual(actState.resourceSpent.asset, 2, 'Asset token should count as ACT resource spent');
  assertEqual(actState.pendingResolutions.length, 0, 'Asset token should not create external pending resolution');
  assert(!Object.prototype.hasOwnProperty.call(actState, 'pendingAssetDeckCommands'), 'Asset token should not persist AssetDeck commands');
  const events = act.getAssetDeckEvents(actState);
  assertEqual(events.length, 1, 'Asset token should emit one transient AssetDeck event');
  assertEqual(events[0].type, 'asset_offer', 'Transient event should be an asset offer');
  assertEqual(events[0].amount, 2, 'Transient event should carry token amount');
  assertEqual(events[0].pool, 'mid', 'Asset II should open mid pool');
  assert(events[0].seed.includes(':phase2:'), 'Offer seed should bind to one-based phase number');
}

function testPoolsAndSeedsByPhase() {
  const { act } = loadActSandbox();
  const config = getChapterConfig(act);
  const low = buildAssetPhaseState(act, 1, 0);
  const high = buildAssetPhaseState(act, 3, 2);

  act.consumeSingleActPhase(low, createHero(), config, {});
  act.consumeSingleActPhase(high, createHero(), config, {});

  const lowEvent = act.getAssetDeckEvents(low)[0];
  const highEvent = act.getAssetDeckEvents(high)[0];
  assertEqual(lowEvent.pool, 'low', 'Asset I should open low pool');
  assertEqual(highEvent.pool, 'high', 'Asset III should open high pool');
  assert(lowEvent.seed.includes(':phase1:'), 'Phase 1 offer should use phase1 seed');
  assert(highEvent.seed.includes(':phase3:'), 'Phase 3 offer should use phase3 seed');
  assert(lowEvent.seed !== highEvent.seed, 'Offers from different phases should not reuse seed');
}

function testResolvePendingAdvanceReturnsTransientEvents() {
  const { act } = loadActSandbox();
  const config = getChapterConfig(act);
  const actState = buildAssetPhaseState(act, 1, 0);
  actState.phase_advance = 1;

  const resolved = act.resolvePendingAdvanceState(actState, createHero(), config, {});
  assertEqual(resolved.changed, true, 'Phase advance should resolve');
  assertEqual(resolved.assetDeckEvents.length, 1, 'Phase advance should return transient AssetDeck event');
  assertEqual(resolved.assetDeckEvents[0].pool, 'low', 'Returned transient event should preserve pool');
  assert(!Object.prototype.hasOwnProperty.call(resolved.actState, 'pendingAssetDeckCommands'), 'Resolved ACT state should not persist AssetDeck commands');
}

function testAssetPendingDoesNotMigrateToCommands() {
  const { act } = loadActSandbox();
  const normalized = act.normalizeActState({
    ...act.getDefaultActState(),
    pendingResolutions: [{
      id: 'old-asset-pending',
      type: 'asset',
      level: 3,
      status: 'pending'
    }]
  });
  assertEqual(normalized.pendingResolutions.length, 0, 'Legacy asset pending should be discarded');
  assert(!Object.prototype.hasOwnProperty.call(normalized, 'pendingAssetDeckCommands'), 'Legacy asset pending should not migrate to command storage');
}

testAssetTokenCreatesTransientEvent();
testPoolsAndSeedsByPhase();
testResolvePendingAdvanceReturnsTransientEvents();
testAssetPendingDoesNotMigrateToCommands();

console.log('[act-asset-command-smoke] all checks passed');
