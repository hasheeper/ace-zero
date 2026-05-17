#!/usr/bin/env node

const {
  assert,
  assertEqual,
  loadAssetSandbox
} = require('./smoke-utils');

const { assetDeck } = loadAssetSandbox();

function assertCardRef(card, message) {
  assert(card && typeof card === 'object', message || 'Card ref should be an object');
  assert(typeof card.id === 'string' && card.id, 'Card ref should store id');
  assertEqual(typeof card.lv, 'number', 'Card ref should store numeric lv');
  assert(!Object.prototype.hasOwnProperty.call(card, 'cardId'), 'Card ref should not store cardId mirror');
  assert(!Object.prototype.hasOwnProperty.call(card, 'instanceId'), 'Card ref should not store instanceId');
  assert(!Object.prototype.hasOwnProperty.call(card, 'addedAt'), 'Card ref should not store addedAt');
}

function assertCompactDeck(deck) {
  assert(deck && typeof deck === 'object', 'AssetDeck should be an object');
  assert(deck.slots && typeof deck.slots === 'object', 'AssetDeck should store slots');
  assert(deck.bag && typeof deck.bag === 'object', 'AssetDeck should store bag');
  assert(Array.isArray(deck.bag.general), 'AssetDeck bag.general should be an array');
  assert(Array.isArray(deck.bag.void), 'AssetDeck bag.void should be an array');
  [
    'v',
    'version',
    'active_general_cards',
    'active_void_cards',
    'pending_offer',
    'pending_offer_queue',
    'pending_replace',
    'history'
  ].forEach((key) => {
    assert(!Object.prototype.hasOwnProperty.call(deck, key), `AssetDeck should not store ${key}`);
  });
}

function makeOffer(choiceId, extra = {}) {
  return {
    floor: 'message:asset-smoke',
    id: 'offer:low:asset-smoke',
    pool: 'low',
    settled: false,
    choices: [{ id: choiceId, lv: 1 }],
    ...extra
  };
}

function testDefaultState() {
  const state = assetDeck.makeDefaultAssetDeckState();
  assertCompactDeck(state);
  assertEqual(state.slots.general, 4, 'AssetDeck should default to 4 general slots');
  assertEqual(state.slots.void, 2, 'AssetDeck should default to 2 void slots');
  assertEqual(state.offer, null, 'AssetDeck should start without an offer');
}

function testNormalizeOnlyKeepsCompactState() {
  const normalized = assetDeck.normalizeAssetDeckState({
    slots: { general: 99, void: 99 },
    bag: {
      general: [
        { id: 'missing_card', lv: 1 },
        { id: 'asset_void_anchor', lv: 1 }
      ],
      void: [
        { id: 'asset_mana_max_bronze', lv: 1 },
        { id: 'asset_void_anchor', lv: 1 }
      ]
    },
    active_general_cards: [{ cardId: 'asset_mana_max_bronze', instanceId: 'old' }],
    pending_offer: { id: 'old-offer' },
    history: [{ kind: 'old-history' }]
  });

  assertCompactDeck(normalized);
  assertEqual(normalized.slots.general, 8, 'General slots should clamp to max');
  assertEqual(normalized.slots.void, 2, 'Void slots should clamp to max');
  assertEqual(normalized.bag.general.length, 1, 'Only valid compact general refs should remain');
  assertEqual(normalized.bag.void.length, 1, 'Only void-compatible refs should remain in void slots');
  assertCardRef(normalized.bag.general[0], 'General card should stay compact');
  assertCardRef(normalized.bag.void[0], 'Void card should stay compact');
  assertEqual(normalized.offer, null, 'Legacy offer field should not migrate');
}

function testOpenOfferIsCompactAndIdempotent() {
  const opened = assetDeck.applyAssetDeckCommand(assetDeck.makeDefaultAssetDeckState(), {
    kind: 'open_offer',
    payload: { floor: 'message:12', pool: 'low', seed: 'compact-offer' }
  }, { assetPoints: 3 });

  assertEqual(opened.ok, true, 'Open offer should succeed');
  assertEqual(opened.assetPoints, 2, 'Low offer should spend one asset point');
  assertCompactDeck(opened.assetDeck);
  assert(opened.assetDeck.offer, 'Open offer should create compact offer');
  assertEqual(opened.assetDeck.offer.floor, 'message:12', 'Offer should keep floor marker');
  assertEqual(opened.assetDeck.offer.pool, 'low', 'Offer should keep pool');
  assert(!Object.prototype.hasOwnProperty.call(opened.assetDeck.offer, 'lv'), 'Offer should not store lv');
  assertEqual(opened.assetDeck.offer.choices.length, 3, 'Offer should roll three choices');
  assertEqual(opened.assetDeck.offer.reroll.length, 3, 'Offer should pre-roll reroll choices');
  opened.assetDeck.offer.choices.forEach(assertCardRef);

  const again = assetDeck.applyAssetDeckCommand(opened.assetDeck, {
    kind: 'open_offer',
    payload: { floor: 'message:12', pool: 'low', seed: 'compact-offer-again' }
  }, { assetPoints: opened.assetPoints });
  assertEqual(again.code, 'offer_already_open', 'Same-floor offer should be idempotent');
  assertEqual(again.assetPoints, opened.assetPoints, 'Idempotent offer should not spend again');
}

function testChooseEquipAndReplace() {
  const equipped = assetDeck.applyAssetDeckCommand(assetDeck.normalizeAssetDeckState({
    offer: makeOffer('asset_mana_max_bronze')
  }), {
    kind: 'choose_card',
    payload: { choiceIndex: 0, slotType: 'general' }
  });

  assertEqual(equipped.ok, true, 'Choosing with free slot should succeed');
  assertEqual(equipped.code, 'equipped', 'Choosing with free slot should equip');
  assertEqual(equipped.assetDeck.offer.settled, true, 'Choosing should mark offer settled');
  assertEqual(equipped.assetDeck.bag.general.length, 1, 'Chosen card should enter general bag');
  assertCardRef(equipped.assetDeck.bag.general[0], 'Chosen card should remain compact');

  const fullDeck = assetDeck.normalizeAssetDeckState({
    slots: { general: 4, void: 2 },
    bag: {
      general: [
        { id: 'asset_mana_max_bronze', lv: 1 },
        { id: 'asset_mana_reduce_bronze', lv: 1 },
        { id: 'asset_mana_amp_bronze', lv: 1 },
        { id: 'asset_texas_force_amplifier', lv: 3 }
      ]
    },
    offer: makeOffer('asset_void_anchor')
  });

  const needsReplace = assetDeck.applyAssetDeckCommand(fullDeck, {
    kind: 'choose_card',
    payload: { choiceIndex: 0, slotType: 'general' }
  });
  assertEqual(needsReplace.ok, false, 'Full slot without target should wait for explicit replacement target');
  assertEqual(needsReplace.code, 'needs_replace', 'Full slot should return needs_replace');
  assert(!Object.prototype.hasOwnProperty.call(needsReplace.assetDeck, 'pending_replace'), 'Replacement intent should not be stored in MVU');

  const replaced = assetDeck.applyAssetDeckCommand(fullDeck, {
    kind: 'choose_card',
    payload: { choiceIndex: 0, slotType: 'general', targetIndex: 0 }
  });
  assertEqual(replaced.ok, true, 'Replacement with target should succeed');
  assertEqual(replaced.code, 'replaced', 'Replacement should report replaced');
  assertEqual(replaced.assetDeck.bag.general[0].id, 'asset_void_anchor', 'Replacement should install selected card');
}

function testSkillMergeAndReroll() {
  const merged = assetDeck.applyAssetDeckCommand(assetDeck.normalizeAssetDeckState({
    bag: {
      general: [{ id: 'asset_skill_hex_l1', lv: 1 }]
    },
    offer: makeOffer('asset_skill_hex_l1')
  }), {
    kind: 'choose_card',
    payload: { choiceIndex: 0, slotType: 'general' }
  });
  assertEqual(merged.ok, true, 'Choosing duplicate skill should resolve');
  assertEqual(merged.code, 'skill_merged', 'Same-level skill should merge');
  assertEqual(merged.assetDeck.bag.general.length, 1, 'Skill merge should not add another card');
  assertEqual(merged.assetDeck.bag.general[0].id, 'asset_skill_hex_l2', 'Skill merge should promote card id');
  assertEqual(merged.assetDeck.bag.general[0].lv, 2, 'Skill merge should promote lv');

  const rerolled = assetDeck.applyAssetDeckCommand(assetDeck.normalizeAssetDeckState({
    offer: makeOffer('asset_mana_max_bronze', {
      reroll: [
        { id: 'asset_mana_reduce_bronze', lv: 1 },
        { id: 'asset_mana_amp_bronze', lv: 1 }
      ]
    })
  }), { kind: 'reroll_offer' });
  assertEqual(rerolled.ok, true, 'Reroll should succeed with pre-rolled choices');
  assertEqual(rerolled.assetDeck.offer.choices[0].id, 'asset_mana_reduce_bronze', 'Reroll should swap choices');
  assert(!Object.prototype.hasOwnProperty.call(rerolled.assetDeck.offer, 'reroll'), 'Used reroll should be removed');
}

function testUnlockSlotUsesAssetPoints() {
  const unlocked = assetDeck.applyAssetDeckCommand(assetDeck.makeDefaultAssetDeckState(), {
    kind: 'unlock_slot'
  }, { assetPoints: 2 });
  assertEqual(unlocked.ok, true, 'Unlock should succeed with enough asset points');
  assertEqual(unlocked.assetPoints, 1, 'First unlock should spend one point');
  assertEqual(unlocked.assetDeck.slots.general, 5, 'First unlock should open fifth general slot');
}

testDefaultState();
testNormalizeOnlyKeepsCompactState();
testOpenOfferIsCompactAndIdempotent();
testChooseEquipAndReplace();
testSkillMergeAndReroll();
testUnlockSlotUsesAssetPoints();

console.log('asset-runtime-smoke ok');
