#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const {
  assert,
  assertEqual,
  loadAssetSandbox,
  REPO_ROOT
} = require('./smoke-utils');

const { sandbox, assetDeck } = loadAssetSandbox();
sandbox.global = sandbox;

const adapterPath = path.join(REPO_ROOT, 'games/texasholdem/texas-holdem/core/runtime/assets/asset-deck-adapter.js');
vm.runInContext(fs.readFileSync(adapterPath, 'utf8'), sandbox, { filename: adapterPath });

const summary = sandbox.ACE0AssetDeckSummary.create({
  data: sandbox.ACE0AssetDeckData,
  assetDeck,
  adapter: sandbox.AssetDeckAdapter
});

function makeCard(cardId, index = 0) {
  const catalogCard = sandbox.ACE0AssetDeckData.ASSET_CARD_CATALOG.find(card => card.id === cardId);
  assert(catalogCard, `Catalog card should exist: ${cardId}`);
  return assetDeck.normalizeAssetCardInstance({
    ...catalogCard,
    cardId,
    instanceId: `${cardId}:summary:${index}`,
    source: 'summary-smoke',
    addedAt: index + 1
  });
}

function makeDeck() {
  return assetDeck.normalizeAssetDeckState({
    general_slots_unlocked: 4,
    void_slots_unlocked: 2,
    active_general_cards: [
      makeCard('asset_skill_minor_wish_l2', 1),
      makeCard('asset_mini_cost_silver', 2),
      makeCard('asset_mini_power_gold', 3),
      makeCard('asset_rainbow_contract', 4)
    ],
    active_void_cards: [
      makeCard('asset_void_anchor', 5)
    ],
    pending_offer: {
      id: 'offer:high:summary',
      pool: 'high',
      cost: 3,
      refreshCount: 0,
      freeRefreshUsed: 0,
      choices: [
        makeCard('asset_mini_power_bronze', 6),
        makeCard('asset_mana_max_silver', 7)
      ]
    },
    pending_offer_queue: [{
      id: 'offer:mid:summary-queue',
      pool: 'mid',
      cost: 2,
      refreshCount: 0,
      freeRefreshUsed: 0,
      choices: [
        makeCard('asset_skill_upgrade_bronze', 8),
        makeCard('asset_texas_force_amplifier', 9)
      ]
    }],
    history: [
      { kind: 'grant_asset', amount: 3, status: 'ok' },
      { kind: 'open_offer', pool: 'high', status: 'offer_opened' }
    ]
  });
}

function testTexasSummary() {
  const deck = makeDeck();
  const texas = summary.buildAssetDeckSummary(deck, { gameId: 'texas-holdem', mode: 'host', assetPoints: 5 });

  assertEqual(texas.points, 5, 'Summary should expose asset points');
  assertEqual(texas.slots.generalUsed, 4, 'Summary should expose general used slots');
  assertEqual(texas.slots.voidUsed, 1, 'Summary should expose void used slots');
  assertEqual(texas.activeCards.effective.some(card => card.cardId === 'asset_skill_minor_wish_l2'), true, 'Texas skill card should be effective in Texas');
  assertEqual(texas.activeCards.effective.some(card => card.cardId === 'asset_mini_cost_silver'), false, 'Mini-game card should not be effective in Texas');
  assertEqual(texas.activeCards.effective.some(card => card.cardId === 'asset_rainbow_contract'), true, 'Any/global card should be effective in Texas');
  assertEqual(texas.gameplay.skillLevels.some(entry => entry.skillKey === 'minor_wish' && entry.level === 2), true, 'Texas summary should expose skill level modifiers');
  assertEqual(texas.gameplay.forcePower.some(entry => entry.scope === 'team' && entry.pct === 0.08), true, 'Texas summary should expose team-scoped force power modifiers');
  assertEqual(Boolean(texas.debug), false, 'Host summary should not expose raw debug data');
  assertEqual(texas.pending.offer.choices.length, 2, 'Pending offer should be summarized');
  assertEqual(texas.pending.offerQueue.length, 1, 'Queued pending offers should be summarized');
  assertEqual(texas.recentHistory.length, 2, 'Recent history should be summarized');
}

function testMiniGameIsolation() {
  const deck = makeDeck();
  const blackjack = summary.buildAssetDeckSummary(deck, { gameId: 'blackjack', mode: 'host' });
  assertEqual(blackjack.activeCards.effective.some(card => card.cardId === 'asset_mini_cost_silver'), true, 'Mini-game cost card should be effective in blackjack');
  assertEqual(blackjack.activeCards.effective.some(card => card.cardId === 'asset_skill_minor_wish_l2'), false, 'Texas card should not be effective in blackjack');
  assertEqual(blackjack.gameplay.cost.some(entry => entry.scope === 'global' && entry.pct === -0.2), true, 'Blackjack summary should expose cost modifier');

  const dice = summary.buildAssetDeckSummary(deck, { gameId: 'dice-game', mode: 'host' });
  assertEqual(dice.activeCards.effective.some(card => card.cardId === 'asset_mini_power_gold'), true, 'Mini-game power card should be effective in dice');
  assertEqual(dice.gameplay.forcePower.some(entry => entry.scope === 'system' && entry.pct === 0.33), true, 'Dice summary should expose mini-game power modifier');

  const mahjong = summary.buildAssetDeckSummary(deck, { gameId: 'mahjong', mode: 'host' });
  assertEqual(mahjong.activeCards.effective.some(card => card.cardId === 'asset_rainbow_contract'), true, 'Mahjong should read any/global cards');
  assertEqual(mahjong.activeCards.effective.some(card => card.cardId === 'asset_mini_cost_silver'), false, 'Mahjong should ignore mini-game cards');
}

function testDebugSummary() {
  const deck = makeDeck();
  const debug = summary.buildAssetDeckSummary(deck, { gameId: 'dragon_tiger', mode: 'debug' });
  assert(debug.debug, 'Debug summary should expose debug block');
  assert(Array.isArray(debug.debug.compiledDebug.applied), 'Debug summary should expose compiled applied list');
  assert(debug.debug.compiledDebug.ignored.some(item => item.reason === 'game_tag_mismatch'), 'Debug summary should expose ignored game-tag mismatches');
}

testTexasSummary();
testMiniGameIsolation();
testDebugSummary();

console.log('asset-summary-smoke ok');
