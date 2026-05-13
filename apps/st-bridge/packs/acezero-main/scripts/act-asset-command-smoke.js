#!/usr/bin/env node

const {
  assert,
  assertEqual,
  loadActSandbox,
  loadAssetSandbox,
  getChapterConfig,
  createHero
} = require('./smoke-utils');

function testActAssetTokenCreatesAssetDeckCommand() {
  const { act } = loadActSandbox();
  const config = getChapterConfig(act);
  const actState = {
    ...act.getDefaultActState(),
    nodeIndex: 1,
    route_history: ['node1-entry'],
    stage: 'executing',
    phase_index: 1,
    phase_slots: [
      null,
      { key: 'asset', amount: 2, source: 'limited', sources: ['limited', 'reserve'] },
      null,
      null
    ],
    pendingResolutions: [],
    pendingAssetDeckCommands: [],
    resourceSpent: { combat: 0, rest: 0, asset: 0, vision: 0 }
  };
  const hero = createHero();

  act.consumeSingleActPhase(actState, hero, config, {});

  assertEqual(actState.resourceSpent.asset, 2, 'Asset token should still count as ACT resource spent');
  assertEqual(actState.pendingResolutions.length, 0, 'Asset token should not create external pending resolution');
  assertEqual(actState.pendingAssetDeckCommands.length, 2, 'Asset token should create grant + offer AssetDeck commands');

  const pending = actState.pendingAssetDeckCommands[0];
  assertEqual(pending.protocol, 'ace0.assetDeckCommand.v1', 'Asset command should use formal protocol');
  assertEqual(pending.command.kind, 'grant_asset', 'Asset phase should grant points before opening a pool');
  assertEqual(pending.command.payload.amount, 2, 'Asset command should carry token level as amount');
  assertEqual(pending.command.payload.source.type, 'act_asset_token', 'Asset command should preserve ACT source');
  assertEqual(pending.command.payload.source.nodeId, 'node1-entry', 'Asset command should record node id');
  assertEqual(actState.pendingAssetDeckCommands[1].command.kind, 'open_offer', 'Asset phase should open a pool after grant');
  assertEqual(actState.pendingAssetDeckCommands[1].command.payload.pool, 'mid', 'Asset II should open mid pool');

  const apiPending = act.getPendingAssetDeckCommands(actState);
  assertEqual(apiPending.length, 2, 'ACT API should expose pending AssetDeck commands');
  assertEqual(apiPending[0].id, pending.id, 'ACT API should return the same command id');
}

function testHighAssetTokenOpensOfferCommand() {
  const { act } = loadActSandbox();
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
    resourceSpent: { combat: 0, rest: 0, asset: 0, vision: 0 }
  };

  act.consumeSingleActPhase(actState, createHero(), config, {});

  assertEqual(actState.pendingResolutions.length, 0, 'High asset token should not use external resolutions');
  assertEqual(actState.pendingAssetDeckCommands.length, 2, 'High asset token should create grant + offer commands');
  assertEqual(actState.pendingAssetDeckCommands[0].command.kind, 'grant_asset', 'Grant should be queued before offer');
  assertEqual(actState.pendingAssetDeckCommands[1].command.kind, 'open_offer', 'High asset token should open an offer');
  assertEqual(actState.pendingAssetDeckCommands[1].command.payload.pool, 'high', 'High asset token should open high pool');
}

function testLowAssetTokenOpensLowOfferCommand() {
  const { act } = loadActSandbox();
  const config = getChapterConfig(act);
  const actState = {
    ...act.getDefaultActState(),
    nodeIndex: 1,
    route_history: ['node1-entry'],
    stage: 'executing',
    phase_index: 0,
    phase_slots: [
      { key: 'asset', amount: 1, source: 'limited', sources: ['limited'] },
      null,
      null,
      null
    ],
    pendingResolutions: [],
    pendingAssetDeckCommands: [],
    resourceSpent: { combat: 0, rest: 0, asset: 0, vision: 0 }
  };

  act.consumeSingleActPhase(actState, createHero(), config, {});

  assertEqual(actState.pendingAssetDeckCommands.length, 2, 'Low asset token should create grant + offer commands');
  assertEqual(actState.pendingAssetDeckCommands[1].command.kind, 'open_offer', 'Low asset token should open an offer');
  assertEqual(actState.pendingAssetDeckCommands[1].command.payload.pool, 'low', 'Asset I should open low pool');
}

function testAssetDeckGrantHistoryKeepsActSource() {
  const { assetDeck } = loadAssetSandbox();
  const result = assetDeck.applyAssetDeckCommand(assetDeck.makeDefaultAssetDeckState(), {
    kind: 'grant_asset',
    payload: {
      amount: 2,
      requestId: 'act-command-1',
      source: {
        type: 'act_asset_token',
        nodeId: 'node1-entry',
        phaseIndex: 1
      }
    }
  }, { assetPoints: 0 });

  assertEqual(result.ok, true, 'grant_asset should apply');
  assertEqual(result.assetPoints, 2, 'grant_asset should add reserve asset points');
  const lastHistory = result.assetDeck.history[result.assetDeck.history.length - 1];
  assert(lastHistory, 'grant_asset should append history');
  assertEqual(lastHistory.requestId, 'act-command-1', 'AssetDeck history should keep request id');
  assert(!('source' in lastHistory), 'AssetDeck history should not retain ACT source payload');
}

function testAssetDeckOpenOfferHistoryKeepsActSource() {
  const { assetDeck } = loadAssetSandbox();
  const granted = assetDeck.applyAssetDeckCommand(assetDeck.makeDefaultAssetDeckState(), {
    kind: 'grant_asset',
    payload: { amount: 3 }
  }, { assetPoints: 0 });
  let state = granted.assetDeck;
  const result = assetDeck.applyAssetDeckCommand(state, {
    kind: 'open_offer',
    payload: {
      pool: 'high',
      seed: 'act-offer-source',
      requestId: 'act-offer-1',
      source: {
        type: 'act_asset_token_offer',
        nodeId: 'node1-entry',
        phaseIndex: 0
      }
    }
  }, { assetPoints: granted.assetPoints });

  assertEqual(result.ok, true, 'open_offer should apply after grant');
  assertEqual(result.assetPoints, 0, 'High offer should consume the granted three asset points');
  assertEqual(result.assetDeck.pending_offer.pool, 'high', 'open_offer should create high pending offer');
  const lastHistory = result.assetDeck.history[result.assetDeck.history.length - 1];
  assertEqual(lastHistory.requestId, 'act-offer-1', 'open_offer history should keep request id');
  assert(!('source' in lastHistory), 'open_offer history should not retain ACT source payload');
}

function testActResolutionHistoryKeepsStableWindow() {
  const { act } = loadActSandbox();
  const history = Array.from({ length: 70 }, (_, index) => ({
    id: `history-${index}`,
    protocol: 'ace0.assetDeckCommand.v1',
    type: 'asset',
    level: 1,
    nodeId: 'node1-entry',
    nodeIndex: 1,
    phaseIndex: 0,
    status: 'resolved',
    outcome: 'asset_granted'
  }));
  const normalized = act.normalizeActState({
    ...act.getDefaultActState(),
    resolutionHistory: history
  });
  assertEqual(normalized.resolutionHistory.length, 64, 'ACT resolutionHistory should keep a stable 64-entry window');
  assertEqual(normalized.resolutionHistory[0].id, 'history-6', 'ACT resolutionHistory should keep the newest 64 entries');
  assertEqual(normalized.resolutionHistory[63].id, 'history-69', 'ACT resolutionHistory should keep the latest entry');
}

testActAssetTokenCreatesAssetDeckCommand();
testHighAssetTokenOpensOfferCommand();
testLowAssetTokenOpensLowOfferCommand();
{
  const { act } = loadActSandbox();
  const normalized = act.normalizeActState({
    ...act.getDefaultActState(),
    pendingResolutions: [{
      id: 'legacy-asset-1',
      type: 'asset',
      level: 3,
      nodeId: 'node4-mid',
      nodeIndex: 4,
      phaseIndex: 2,
      status: 'pending',
      sources: ['limited']
    }]
  });
  assertEqual(normalized.pendingResolutions.length, 0, 'Legacy asset pending should leave external resolutions');
  assertEqual(normalized.pendingAssetDeckCommands.length, 1, 'Legacy asset pending should migrate to AssetDeck command');
  assertEqual(normalized.pendingAssetDeckCommands[0].command.payload.amount, 3, 'Migrated command should keep asset level');
}
testAssetDeckGrantHistoryKeepsActSource();
testAssetDeckOpenOfferHistoryKeepsActSource();
testActResolutionHistoryKeepsStableWindow();

console.log('[act-asset-command-smoke] all checks passed');
