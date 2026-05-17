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

function makeDeck() {
  return assetDeck.normalizeAssetDeckState({
    slots: { general: 4, void: 2 },
    bag: {
      general: [
        { id: 'asset_skill_minor_wish_l2', lv: 2 },
        { id: 'asset_mini_cost_silver', lv: 2 },
        { id: 'asset_mini_power_gold', lv: 3 },
        { id: 'asset_rainbow_contract', lv: 4 }
      ],
      void: [
        { id: 'asset_void_anchor', lv: 3 }
      ]
    },
    offer: {
      floor: 'message:summary',
      id: 'offer:high:summary',
      pool: 'high',
      settled: false,
      choices: [
        { id: 'asset_mini_power_bronze', lv: 1 },
        { id: 'asset_mana_max_silver', lv: 2 }
      ],
      reroll: [
        { id: 'asset_skill_upgrade_bronze', lv: 1 },
        { id: 'asset_texas_force_amplifier', lv: 3 }
      ]
    }
  });
}

function testTexasSummary() {
  const texas = summary.buildAssetDeckSummary(makeDeck(), { gameId: 'texas-holdem', mode: 'host', assetPoints: 5 });

  assertEqual(texas.points, 5, 'Summary should expose asset points');
  assertEqual(texas.slots.generalUsed, 4, 'Summary should expose general used slots');
  assertEqual(texas.slots.voidUsed, 1, 'Summary should expose void used slots');
  assertEqual(texas.activeCards.effective.some(card => card.cardId === 'asset_skill_minor_wish_l2'), true, 'Texas skill card should be effective in Texas');
  assertEqual(texas.activeCards.effective.some(card => card.cardId === 'asset_mini_cost_silver'), false, 'Mini-game card should not be effective in Texas');
  assertEqual(texas.activeCards.effective.some(card => card.cardId === 'asset_rainbow_contract'), true, 'Any/global card should be effective in Texas');
  assertEqual(texas.gameplay.skillLevels.some(entry => entry.skillKey === 'minor_wish' && entry.level === 2), true, 'Texas summary should expose skill level modifiers');
  assertEqual(texas.gameplay.forcePower.some(entry => entry.scope === 'team' && entry.pct === 0.08), true, 'Texas summary should expose global force power modifiers');
  assertEqual(Boolean(texas.debug), false, 'Host summary should not expose raw debug data');
  assertEqual(texas.pending.offer.floor, 'message:summary', 'Pending offer should expose floor marker');
  assertEqual(texas.pending.offer.pool, 'high', 'Pending offer should expose pool');
  assertEqual(texas.pending.offer.choices.length, 2, 'Pending offer should summarize choices');
  assertEqual(texas.pending.offer.reroll.length, 2, 'Pending offer should summarize pre-rolled reroll choices');
  assert(!Object.prototype.hasOwnProperty.call(texas.pending, 'offerQueue'), 'Summary should not expose an offer queue');
  assert(!Object.prototype.hasOwnProperty.call(texas, 'recentHistory'), 'Summary should not expose AssetDeck history');
  assert(!Object.prototype.hasOwnProperty.call(texas.pending.offer, 'lv'), 'Offer summary should not expose offer lv');
}

function testMiniGameIsolation() {
  const blackjack = summary.buildAssetDeckSummary(makeDeck(), { gameId: 'blackjack', mode: 'host' });
  assertEqual(blackjack.activeCards.effective.some(card => card.cardId === 'asset_mini_cost_silver'), true, 'Mini-game cost card should be effective in blackjack');
  assertEqual(blackjack.activeCards.effective.some(card => card.cardId === 'asset_skill_minor_wish_l2'), false, 'Texas card should not be effective in blackjack');
  assertEqual(blackjack.gameplay.cost.some(entry => entry.scope === 'global' && entry.pct === -0.2), true, 'Blackjack summary should expose cost modifier');

  const dice = summary.buildAssetDeckSummary(makeDeck(), { gameId: 'dice-game', mode: 'host' });
  assertEqual(dice.activeCards.effective.some(card => card.cardId === 'asset_mini_power_gold'), true, 'Mini-game power card should be effective in dice');
  assertEqual(dice.gameplay.forcePower.some(entry => entry.scope === 'system' && entry.pct === 0.33), true, 'Dice summary should expose mini-game power modifier');
}

function testDebugSummary() {
  const debug = summary.buildAssetDeckSummary(makeDeck(), { gameId: 'dragon_tiger', mode: 'debug' });
  assert(debug.debug, 'Debug summary should expose debug block');
  assert(Array.isArray(debug.debug.compiledDebug.applied), 'Debug summary should expose compiled applied list');
  assert(debug.debug.compiledDebug.ignored.some(item => item.reason === 'game_tag_mismatch'), 'Debug summary should expose ignored game-tag mismatches');
}

testTexasSummary();
testMiniGameIsolation();
testDebugSummary();

console.log('asset-summary-smoke ok');
