#!/usr/bin/env node

const {
  assert,
  assertEqual,
  loadTavernSandbox,
  getChapterConfig,
  createHero
} = require('./smoke-utils');

const { act, sandbox } = loadTavernSandbox();
const assetDeck = sandbox.ACE0Modules && sandbox.ACE0Modules.assetDeck;

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function settleActAssetDeckCommands(worldInput) {
  const world = clone(worldInput || {});
  world.assetDeck = assetDeck.normalizeAssetDeckState(world.assetDeck);
  world.act = act.normalizeActState(world.act);

  const pending = Array.isArray(world.act.pendingAssetDeckCommands)
    ? world.act.pendingAssetDeckCommands
    : [];
  const consumed = new Set();
  const history = Array.isArray(world.act.resolutionHistory) ? clone(world.act.resolutionHistory) : [];
  let deck = world.assetDeck;

  pending.forEach((request) => {
    if (!request || request.status !== 'pending' || !request.command) return;
    const command = clone(request.command);
    command.payload = {
      ...(command.payload || {}),
      requestId: command.payload?.requestId || request.id
    };

    const result = assetDeck.applyAssetDeckCommand(deck, command, {
      seed: `act-flow:${request.id}`
    });
    if (result.assetDeck) deck = result.assetDeck;
    consumed.add(request.id);
    history.push({
      ...clone(request),
      type: 'asset',
      status: result.ok ? 'resolved' : 'failed',
      outcome: result.code,
      summary: request.summary || 'ACT AssetDeck command settled',
      payload: {
        commandKind: command.kind || command.type || '',
        resultCode: result.code,
        asset_count: deck.asset_count,
        error: result.error || ''
      }
    });
  });

  world.assetDeck = deck;
  world.act.pendingAssetDeckCommands = pending.filter((request) => !consumed.has(request.id));
  world.act.resolutionHistory = history;
  return world;
}

function testActAssetThreeSettlesIntoHighOffer() {
  const config = getChapterConfig(act);
  const actState = {
    ...act.getDefaultActState(),
    nodeIndex: 1,
    route_history: ['node1-entry'],
    stage: 'executing',
    phase_index: 0,
    phase_slots: [
      { key: 'asset', amount: 3, source: 'limited', sources: ['limited', 'limited', 'reserve'] },
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

  assertEqual(actState.pendingAssetDeckCommands.length, 2, 'asset III should emit grant + offer commands before host settlement');
  assertEqual(actState.pendingResolutions.length, 0, 'asset III should not create external resolutions');

  const settled = settleActAssetDeckCommands({
    act: actState,
    assetDeck: assetDeck.makeDefaultAssetDeckState()
  });

  assertEqual(settled.act.pendingAssetDeckCommands.length, 0, 'host settlement should consume pending AssetDeck commands');
  assertEqual(settled.assetDeck.asset_count, 0, 'grant + high offer should net to zero asset points');
  assert(settled.assetDeck.pending_offer, 'high offer should be opened on AssetDeck');
  assertEqual(settled.assetDeck.pending_offer.pool, 'high', 'asset III should open high pool');
  assertEqual(settled.act.resolutionHistory.length, 2, 'ACT resolution history should record both asset commands');
  assertEqual(settled.act.resolutionHistory[0].outcome, 'asset_granted', 'first history entry should record grant result');
  assertEqual(settled.act.resolutionHistory[1].outcome, 'offer_opened', 'second history entry should record offer result');
  assertEqual(settled.assetDeck.history.length, 2, 'AssetDeck history should record grant and offer');
  assert(!('source' in settled.assetDeck.history[0]), 'AssetDeck history should not retain ACT source payload');
  assert(!('source' in settled.assetDeck.history[1]), 'AssetDeck history should not retain ACT source payload');
}

function testActAssetTwoSettlesIntoMidOffer() {
  const config = getChapterConfig(act);
  const actState = {
    ...act.getDefaultActState(),
    nodeIndex: 1,
    route_history: ['node1-entry'],
    stage: 'executing',
    phase_index: 0,
    phase_slots: [
      { key: 'asset', amount: 2, source: 'limited', sources: ['limited', 'reserve'] },
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

  const settled = settleActAssetDeckCommands({
    act: actState,
    assetDeck: assetDeck.makeDefaultAssetDeckState()
  });

  assertEqual(settled.act.pendingAssetDeckCommands.length, 0, 'asset II commands should settle');
  assertEqual(settled.assetDeck.asset_count, 0, 'grant + mid offer should net to zero asset points');
  assert(settled.assetDeck.pending_offer, 'asset II should open a pending offer');
  assertEqual(settled.assetDeck.pending_offer.pool, 'mid', 'asset II should open mid pool');
  assertEqual(settled.act.resolutionHistory.length, 2, 'asset II should record grant + offer entries');
  assertEqual(settled.act.resolutionHistory[0].outcome, 'asset_granted', 'asset II should record grant result');
  assertEqual(settled.act.resolutionHistory[1].outcome, 'offer_opened', 'asset II should record offer result');
}

function testMultipleAssetPhasesSettleIntoOfferQueue() {
  const config = getChapterConfig(act);
  const actState = {
    ...act.getDefaultActState(),
    nodeIndex: 1,
    route_history: ['node1-entry'],
    stage: 'executing',
    phase_index: 0,
    phase_slots: [
      { key: 'asset', amount: 1, source: 'limited', sources: ['limited'] },
      { key: 'asset', amount: 2, source: 'limited', sources: ['limited', 'reserve'] },
      null,
      null
    ],
    pendingResolutions: [],
    pendingAssetDeckCommands: [],
    resolutionHistory: [],
    resourceSpent: { combat: 0, rest: 0, asset: 0, vision: 0 }
  };

  act.consumeSingleActPhase(actState, createHero(), config, {});
  act.consumeSingleActPhase(actState, createHero(), config, {});

  assertEqual(actState.pendingAssetDeckCommands.length, 4, 'two asset phases should emit two grant/offer command pairs');

  const settled = settleActAssetDeckCommands({
    act: actState,
    assetDeck: assetDeck.makeDefaultAssetDeckState()
  });

  assertEqual(settled.act.pendingAssetDeckCommands.length, 0, 'host settlement should consume all multi-phase commands');
  assertEqual(settled.assetDeck.asset_count, 0, 'grant + matching offers should net to zero asset points');
  assert(settled.assetDeck.pending_offer, 'first phase offer should be active');
  assertEqual(settled.assetDeck.pending_offer.pool, 'low', 'asset I should stay as the current offer');
  assertEqual(settled.assetDeck.pending_offer_queue.length, 1, 'asset II offer should wait behind current offer');
  assertEqual(settled.assetDeck.pending_offer_queue[0].pool, 'mid', 'asset II should queue a mid offer');
  assertEqual(settled.act.resolutionHistory.length, 4, 'multi-phase settlement should record all command outcomes');
}

testActAssetThreeSettlesIntoHighOffer();
testActAssetTwoSettlesIntoMidOffer();
testMultipleAssetPhasesSettleIntoOfferQueue();

console.log('[act-asset-flow-smoke] all checks passed');
