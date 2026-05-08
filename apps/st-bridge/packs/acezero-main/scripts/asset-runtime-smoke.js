#!/usr/bin/env node

const {
  assert,
  assertEqual,
  loadAssetSandbox
} = require('./smoke-utils');

const { sandbox, assetDeck } = loadAssetSandbox();

function testDefaultState() {
  const state = assetDeck.makeDefaultAssetDeckState();
  assertEqual(state.asset_count, 0, 'AssetDeck should default to 0 asset points');
  assertEqual(state.general_slots_unlocked, 4, 'AssetDeck should default to 4 general slots');
  assertEqual(state.void_slots_unlocked, 2, 'AssetDeck should default to 2 void slots');
  assert(Array.isArray(state.active_general_cards), 'General cards should be an array');
  assert(Array.isArray(state.active_void_cards), 'Void cards should be an array');
}

function testNormalizeClampsUnsafeState() {
  const normalized = assetDeck.normalizeAssetDeckState({
    asset_count: -99,
    general_slots_unlocked: 99,
    void_slots_unlocked: 99,
    active_general_cards: [
      { cardId: 'missing_card', instanceId: 'bad' },
      { cardId: 'asset_void_anchor', instanceId: 'void-in-general', slotTags: ['void'] }
    ],
    active_void_cards: [
      { cardId: 'asset_bootstrap_credit', instanceId: 'general-in-void', slotTags: ['general'] },
      { cardId: 'asset_void_anchor', instanceId: 'valid-void', slotTags: ['general', 'void'] }
    ]
  });

  assertEqual(normalized.asset_count, 0, 'Asset points should clamp to non-negative');
  assertEqual(normalized.general_slots_unlocked, 8, 'General slots should clamp to max');
  assertEqual(normalized.void_slots_unlocked, 2, 'Void slots should clamp to max');
  assertEqual(normalized.active_general_cards.length, 0, 'Invalid general cards should be removed');
  assertEqual(normalized.active_void_cards.length, 1, 'Only void-compatible cards should remain in void slots');
  assertEqual(normalized.active_void_cards[0].cardId, 'asset_void_anchor', 'Valid void card should remain');
}

function testUnlockSlotCostsAsset() {
  let state = assetDeck.makeDefaultAssetDeckState();
  state = assetDeck.applyAssetDeckCommand(state, { kind: 'grant_asset', payload: { amount: 2 } }).assetDeck;
  const unlocked = assetDeck.applyAssetDeckCommand(state, { kind: 'unlock_slot' });

  assertEqual(unlocked.ok, true, 'Unlock should succeed with enough asset');
  assertEqual(unlocked.assetDeck.asset_count, 1, 'First unlock should cost 1 asset');
  assertEqual(unlocked.assetDeck.general_slots_unlocked, 5, 'First unlock should open fifth general slot');
}

function testOfferChooseAndReplace() {
  let state = assetDeck.makeDefaultAssetDeckState();
  state = assetDeck.applyAssetDeckCommand(state, { kind: 'grant_asset', payload: { amount: 10 } }).assetDeck;

  const opened = assetDeck.applyAssetDeckCommand(state, {
    kind: 'open_offer',
    payload: { pool: 'low', seed: 'phase1-offer' }
  });
  assertEqual(opened.ok, true, 'Open offer should succeed');
  assertEqual(opened.assetDeck.pending_offer.choices.length, 3, 'Low pool should expose three choices');

  const chosen = assetDeck.applyAssetDeckCommand(opened.assetDeck, {
    kind: 'choose_card',
    payload: { choiceIndex: 0, slotType: 'general' }
  });
  assertEqual(chosen.ok, true, 'Choosing a card should succeed');
  assertEqual(chosen.code, 'equipped', 'Card should auto-equip when a slot is free');
  assertEqual(chosen.assetDeck.active_general_cards.length, 1, 'Chosen card should enter active general deck');
  assertEqual(chosen.offerId, opened.assetDeck.pending_offer.id, 'Choose result should preserve offer id');
  assertEqual(chosen.choiceIndex, 0, 'Choose result should preserve choice index');
  assertEqual(chosen.selectedInstanceId, opened.assetDeck.pending_offer.choices[0].instanceId, 'Choose result should preserve selected instance id');
  const chooseHistory = chosen.assetDeck.history[chosen.assetDeck.history.length - 1];
  assertEqual(chooseHistory.kind, 'choose_card', 'Choose history should be recorded');
  assertEqual(chooseHistory.offerId, opened.assetDeck.pending_offer.id, 'Choose history should preserve offer id');
  assertEqual(chooseHistory.instanceId, opened.assetDeck.pending_offer.choices[0].instanceId, 'Choose history should preserve selected instance id');
  assertEqual(chooseHistory.choiceIndex, 0, 'Choose history should preserve choice index');

  const fullState = assetDeck.normalizeAssetDeckState({
    ...chosen.assetDeck,
    pending_offer: {
      id: 'offer:high:test',
      pool: 'high',
      choices: [{ cardId: 'asset_void_anchor', instanceId: 'candidate-void', slotTags: ['general', 'void'], rarity: 'gold', kind: 'passive' }]
    },
    active_general_cards: Array.from({ length: 4 }, (_, index) => ({
      cardId: 'asset_bootstrap_credit',
      instanceId: `filled-general-${index}`,
      slotTags: ['general'],
      rarity: 'bronze',
      kind: 'numeric'
    }))
  });

  const pending = assetDeck.applyAssetDeckCommand(fullState, {
    kind: 'choose_card',
    payload: { choiceIndex: 0, slotType: 'general' }
  });
  assertEqual(pending.ok, true, 'Choosing into a full deck should still resolve');
  assertEqual(pending.code, 'pending_replace', 'Full deck should enter replacement mode');
  assertEqual(pending.offerId, 'offer:high:test', 'Pending replace result should preserve offer id');
  assertEqual(pending.selectedInstanceId, 'candidate-void', 'Pending replace result should preserve selected instance id');
  const pendingHistory = pending.assetDeck.history[pending.assetDeck.history.length - 1];
  assertEqual(pendingHistory.offerId, 'offer:high:test', 'Pending replace history should preserve offer id');
  assertEqual(pendingHistory.instanceId, 'candidate-void', 'Pending replace history should preserve selected instance id');

  const replaced = assetDeck.applyAssetDeckCommand(pending.assetDeck, {
    kind: 'replace_card',
    payload: { slotType: 'general', targetIndex: 0 }
  });
  assertEqual(replaced.ok, true, 'Replacement should succeed');
  assertEqual(replaced.assetDeck.active_general_cards[0].cardId, 'asset_void_anchor', 'Replacement should install candidate card');
}

function testPoolCostsAndRefreshLimits() {
  let state = assetDeck.makeDefaultAssetDeckState();
  state = assetDeck.applyAssetDeckCommand(state, { kind: 'grant_asset', payload: { amount: 10 } }).assetDeck;

  const low = assetDeck.applyAssetDeckCommand(state, {
    kind: 'open_offer',
    payload: { pool: 'low', seed: 'cost-low' }
  });
  assertEqual(low.ok, true, 'Low pool should open');
  assertEqual(low.assetDeck.asset_count, 9, 'Low pool should cost 1 Asset');
  const lowRefresh = assetDeck.applyAssetDeckCommand(low.assetDeck, {
    kind: 'refresh_offer',
    payload: { seed: 'cost-low-refresh' }
  });
  assertEqual(lowRefresh.ok, true, 'Low pool free refresh should succeed');
  assertEqual(lowRefresh.cost, 0, 'Low pool first refresh should be free');
  assertEqual(lowRefresh.assetDeck.asset_count, 9, 'Low pool free refresh should not spend Asset');
  const lowRefreshAgain = assetDeck.applyAssetDeckCommand(lowRefresh.assetDeck, {
    kind: 'refresh_offer',
    payload: { seed: 'cost-low-refresh-again' }
  });
  assertEqual(lowRefreshAgain.ok, false, 'Low pool should only refresh once');
  assertEqual(lowRefreshAgain.code, 'refresh_cap_reached', 'Low pool should report refresh cap');

  state = assetDeck.applyAssetDeckCommand(assetDeck.makeDefaultAssetDeckState(), { kind: 'grant_asset', payload: { amount: 10 } }).assetDeck;
  const mid = assetDeck.applyAssetDeckCommand(state, {
    kind: 'open_offer',
    payload: { pool: 'mid', seed: 'cost-mid' }
  });
  assertEqual(mid.ok, true, 'Mid pool should open');
  assertEqual(mid.assetDeck.asset_count, 8, 'Mid pool should cost 2 Asset');

  state = assetDeck.applyAssetDeckCommand(assetDeck.makeDefaultAssetDeckState(), { kind: 'grant_asset', payload: { amount: 10 } }).assetDeck;
  const high = assetDeck.applyAssetDeckCommand(state, {
    kind: 'open_offer',
    payload: { pool: 'high', seed: 'cost-high' }
  });
  assertEqual(high.ok, true, 'High pool should open');
  assertEqual(high.assetDeck.asset_count, 7, 'High pool should cost 3 Asset');
  const highRefresh = assetDeck.applyAssetDeckCommand(high.assetDeck, {
    kind: 'refresh_offer',
    payload: { seed: 'cost-high-refresh' }
  });
  assertEqual(highRefresh.ok, true, 'High pool paid refresh should succeed');
  assertEqual(highRefresh.cost, 1, 'High pool refresh should cost 1 Asset');
  assertEqual(highRefresh.assetDeck.asset_count, 6, 'High pool refresh should spend Asset');
}

function testOfferQueuePreservesMultiplePhaseOffers() {
  let state = assetDeck.makeDefaultAssetDeckState();
  state = assetDeck.applyAssetDeckCommand(state, { kind: 'grant_asset', payload: { amount: 3 } }).assetDeck;

  const low = assetDeck.applyAssetDeckCommand(state, {
    kind: 'open_offer',
    payload: { pool: 'low', seed: 'queue-low' }
  });
  assertEqual(low.ok, true, 'First queued-offer test pool should open');

  const mid = assetDeck.applyAssetDeckCommand(low.assetDeck, {
    kind: 'open_offer',
    payload: { pool: 'mid', seed: 'queue-mid' }
  });
  assertEqual(mid.ok, true, 'Second pool should be accepted while first offer is active');
  assertEqual(mid.assetDeck.pending_offer.pool, 'low', 'First offer should remain visible');
  assertEqual(mid.assetDeck.pending_offer_queue.length, 1, 'Second offer should wait in queue');
  assertEqual(mid.assetDeck.pending_offer_queue[0].pool, 'mid', 'Queued offer should preserve its pool');

  const chosen = assetDeck.applyAssetDeckCommand(mid.assetDeck, {
    kind: 'choose_card',
    payload: { choiceIndex: 0, slotType: 'general' }
  });
  assertEqual(chosen.ok, true, 'Choosing current offer should resolve');
  assert(chosen.assetDeck.pending_offer, 'Queued offer should be promoted after choosing current offer');
  assertEqual(chosen.assetDeck.pending_offer.pool, 'mid', 'Queued mid offer should become active');
  assertEqual(chosen.assetDeck.pending_offer_queue.length, 0, 'Offer queue should drain after promotion');
}

function testSkillMergeUpgradeAndOfferFilter() {
  const baseSkill = {
    cardId: 'asset_skill_hex_l1',
    instanceId: 'hex-active',
    rarity: 'bronze',
    kind: 'skill',
    system: 'chaos',
    skillKey: 'hex',
    level: 1,
    slotTags: ['general'],
    modifiers: [{ type: 'skill_level', key: 'hex', value: 1 }]
  };
  let state = assetDeck.normalizeAssetDeckState({
    asset_count: 10,
    active_general_cards: [baseSkill],
    pending_offer: {
      id: 'offer:low:hex-merge',
      pool: 'low',
      choices: [{ ...baseSkill, instanceId: 'hex-candidate' }]
    }
  });

  const merged = assetDeck.applyAssetDeckCommand(state, {
    kind: 'choose_card',
    payload: { choiceIndex: 0, slotType: 'general' }
  });
  assertEqual(merged.ok, true, 'Choosing same-level skill should resolve');
  assertEqual(merged.code, 'skill_merged', 'Same-level skill should merge');
  assertEqual(merged.assetDeck.active_general_cards.length, 1, 'Skill merge should not add another card');
  assertEqual(merged.assetDeck.active_general_cards[0].level, 2, 'Same-level skill should upgrade by one level');

  state = assetDeck.normalizeAssetDeckState({
    asset_count: 10,
    active_general_cards: [merged.assetDeck.active_general_cards[0]],
    pending_offer: {
      id: 'offer:high:hex-low',
      pool: 'high',
      choices: [{ ...baseSkill, instanceId: 'hex-low-candidate' }]
    }
  });
  const lower = assetDeck.applyAssetDeckCommand(state, {
    kind: 'choose_card',
    payload: { choiceIndex: 0, slotType: 'general' }
  });
  assertEqual(lower.code, 'skill_lower_ignored', 'Lower-level duplicate skill should be consumed without changing deck');
  assertEqual(lower.assetDeck.active_general_cards[0].level, 2, 'Lower-level duplicate should not downgrade skill');

  state = assetDeck.normalizeAssetDeckState({
    asset_count: 10,
    active_general_cards: [{
      ...baseSkill,
      instanceId: 'hex-max',
      cardId: 'asset_skill_hex_l2',
      rarity: 'rainbow',
      level: 4,
      modifiers: [{ type: 'skill_level', key: 'hex', value: 4 }]
    }]
  });
  const choices = assetDeck.createOfferChoices('mid', 'filter-max-hex', [], state);
  assert(!choices.some(card => card.skillKey === 'hex'), 'Max-level skill should be filtered out of offers');
}

function testVoidSlotRestriction() {
  const state = assetDeck.normalizeAssetDeckState({
    active_void_cards: [
      { cardId: 'asset_bootstrap_credit', instanceId: 'bad-void', slotTags: ['general'] },
      { cardId: 'asset_void_anchor', instanceId: 'good-void', slotTags: ['general', 'void'] }
    ]
  });

  assertEqual(state.active_void_cards.length, 1, 'Non-void cards should not survive in void slots');
  assertEqual(state.active_void_cards[0].cardId, 'asset_void_anchor', 'Void-compatible card should survive');

  const chosen = assetDeck.applyAssetDeckCommand(assetDeck.normalizeAssetDeckState({
    pending_offer: {
      id: 'offer:void:test',
      pool: 'low',
      choices: [{
        cardId: 'asset_skill_insulation_l1',
        instanceId: 'candidate-void-skill',
        rarity: 'bronze',
        kind: 'skill',
        system: 'void',
        skillKey: 'insulation',
        level: 1,
        slotTags: ['general', 'void'],
        modifiers: [{ type: 'skill_level', key: 'insulation', value: 1 }]
      }]
    }
  }), {
    kind: 'choose_card',
    payload: { choiceIndex: 0, slotType: 'void' }
  });
  assertEqual(chosen.ok, true, 'Void skill should be selectable into a void slot');
  assertEqual(chosen.code, 'equipped', 'Void skill should equip when a void slot is free');
  assertEqual(chosen.assetDeck.active_void_cards.length, 1, 'Void skill should enter active void deck');
}

function testRainbowUniqueAndProtectedReplace() {
  const duplicated = assetDeck.normalizeAssetDeckState({
    active_general_cards: [
      { cardId: 'asset_rainbow_contract', instanceId: 'rainbow-a' },
      { cardId: 'asset_rainbow_contract', instanceId: 'rainbow-b' }
    ]
  });
  assertEqual(duplicated.active_general_cards.length, 1, 'Unique rainbow card should only survive once');

  const duplicateOffer = assetDeck.normalizeAssetDeckState({
    active_general_cards: [{ cardId: 'asset_rainbow_contract', instanceId: 'rainbow-active' }],
    pending_offer: {
      id: 'offer:high:rainbow-duplicate',
      pool: 'high',
      choices: [{ cardId: 'asset_rainbow_contract', instanceId: 'rainbow-choice' }]
    }
  });
  const duplicateChosen = assetDeck.applyAssetDeckCommand(duplicateOffer, {
    kind: 'choose_card',
    payload: { choiceIndex: 0, slotType: 'general' }
  });
  assertEqual(duplicateChosen.ok, true, 'Choosing duplicate rainbow should resolve cleanly');
  assertEqual(duplicateChosen.code, 'unique_already_active', 'Duplicate rainbow should not be equipped twice');
  assertEqual(duplicateChosen.assetDeck.active_general_cards.length, 1, 'Duplicate rainbow should not grow the active deck');

  const protectedReplaceState = assetDeck.normalizeAssetDeckState({
    active_general_cards: [
      { cardId: 'asset_rainbow_contract', instanceId: 'rainbow-active' },
      { cardId: 'asset_bootstrap_credit', instanceId: 'normal-active' },
      { cardId: 'asset_minor_guard', instanceId: 'normal-active-2' },
      { cardId: 'asset_texas_mana_cell', instanceId: 'normal-active-3' }
    ],
    pending_offer: {
      id: 'offer:high:replace-rainbow',
      pool: 'high',
      choices: [{ cardId: 'asset_texas_force_amplifier', instanceId: 'candidate-force' }]
    }
  });
  const pending = assetDeck.applyAssetDeckCommand(protectedReplaceState, {
    kind: 'choose_card',
    payload: { choiceIndex: 0, slotType: 'general' }
  });
  assertEqual(pending.code, 'pending_replace', 'Full deck should enter replacement for protected replace test');

  const blocked = assetDeck.applyAssetDeckCommand(pending.assetDeck, {
    kind: 'replace_card',
    payload: { slotType: 'general', targetIndex: 0 }
  });
  assertEqual(blocked.ok, false, 'Replacing a rainbow card should require confirmation');
  assertEqual(blocked.code, 'requires_destroy_confirm', 'Rainbow destroy should be protected by confirmation');
  assertEqual(blocked.assetDeck.pending_replace.confirm_destroy, true, 'Pending replace should enter confirm-destroy state');

  const confirmed = assetDeck.applyAssetDeckCommand(blocked.assetDeck, {
    kind: 'replace_card',
    payload: { slotType: 'general', targetIndex: 0, confirmDestroy: true }
  });
  assertEqual(confirmed.ok, true, 'Confirmed rainbow replacement should succeed');
  assertEqual(confirmed.code, 'replaced', 'Confirmed rainbow replacement should replace the card');
  assertEqual(confirmed.removed.cardId, 'asset_rainbow_contract', 'Confirmed replacement should destroy the old rainbow card');
}

function testTexasCatalogCoverage() {
  const catalog = sandbox.ACE0AssetDeckData.ASSET_CARD_CATALOG;
  const texasCards = catalog.filter(card => Array.isArray(card.gameTags) && card.gameTags.includes('texas-holdem'));
  const byPool = {
    low: texasCards.filter(card => Array.isArray(card.pools) && card.pools.includes('low')),
    mid: texasCards.filter(card => Array.isArray(card.pools) && card.pools.includes('mid')),
    high: texasCards.filter(card => Array.isArray(card.pools) && card.pools.includes('high'))
  };
  assert(byPool.low.length >= 8, 'Low pool should include a first batch of Texas cards');
  assert(byPool.mid.length >= 10, 'Mid pool should include a first batch of Texas cards');
  assert(byPool.high.length >= 10, 'High pool should include a first batch of Texas cards');

  const ids = catalog.map(card => card.id);
  assertEqual(new Set(ids).size, ids.length, 'Asset card ids should be unique');

  const modifierTypes = new Set(texasCards.flatMap(card => (card.modifiers || []).map(modifier => modifier.type)));
  assert(modifierTypes.has('skill_level'), 'Texas catalog should include skill cards');
  assert(modifierTypes.has('mana_max_flat'), 'Texas catalog should include mana max cards');
  assert(modifierTypes.has('skill_cost_flat'), 'Texas catalog should include flat cost cards');
  assert(modifierTypes.has('skill_cost_pct'), 'Texas catalog should include percent cost cards');
  assert(modifierTypes.has('force_power_pct'), 'Texas catalog should include force power cards');
  assert(modifierTypes.has('street_start_mana_gain'), 'Texas catalog should include street-start passive cards');
  assert(modifierTypes.has('first_skill_cost_flat'), 'Texas catalog should include first-skill passive cards');
  assert(modifierTypes.has('first_force_power_pct'), 'Texas catalog should include first-force passive cards');
  assert(modifierTypes.has('once_per_hand_fortune_flat'), 'Texas catalog should include once-per-hand passive cards');
}

testDefaultState();
testNormalizeClampsUnsafeState();
testUnlockSlotCostsAsset();
testOfferChooseAndReplace();
testPoolCostsAndRefreshLimits();
testOfferQueuePreservesMultiplePhaseOffers();
testSkillMergeUpgradeAndOfferFilter();
testVoidSlotRestriction();
testRainbowUniqueAndProtectedReplace();
testTexasCatalogCoverage();

console.log('asset-runtime-smoke ok');
