/**
 * ACEZERO ASSET DECK RUNTIME
 *
 * Canonical MVU state is intentionally small:
 * { slots, bag, offer } where cards are only { id, lv }.
 * All display/effect data is hydrated from the static catalog at runtime.
 */
(function initAceZeroAssetDeckRuntime(global) {
  'use strict';

  global.ACE0AssetDeckRuntime = {
    create(options = {}) {
      const data = options.data || global.ACE0AssetDeckData || {};
      const config = {
        initialGeneralSlots: 4,
        maxGeneralSlots: 8,
        voidSlots: 2,
        unlockCosts: [1, 1, 2, 2],
        offerSize: 3,
        poolCosts: { low: 1, mid: 2, high: 3 },
        poolRarityWeights: {
          low: { bronze: 65, silver: 25, gold: 10, rainbow: 0 },
          mid: { bronze: 35, silver: 35, gold: 25, rainbow: 5 },
          high: { bronze: 0, silver: 35, gold: 40, rainbow: 25 }
        },
        ...(data.ASSET_DECK_CONFIG || {})
      };
      const catalog = Array.isArray(data.ASSET_CARD_CATALOG) ? data.ASSET_CARD_CATALOG : [];
      const deps = options.deps || {};
      const { deepClone = (value) => (value == null ? value : JSON.parse(JSON.stringify(value))) } = deps;

      const CARD_BY_ID = new Map(catalog.map(card => [normalizeId(card.id), card]).filter(([id]) => id));
      const RARITY_VALUES = ['bronze', 'silver', 'gold', 'rainbow'];
      const KIND_VALUES = ['numeric', 'passive', 'skill', 'upgrade', 'god'];
      const SLOT_TYPES = ['general', 'void'];
      const POOL_VALUES = ['low', 'mid', 'high'];

      function normalizeId(value, fallback = '') {
        const normalized = value == null ? '' : String(value).trim();
        return normalized || fallback;
      }

      function normalizeKey(value, fallback = '') {
        return normalizeId(value, fallback).toLowerCase();
      }

      function normalizeNonNegativeInt(value, fallback = 0) {
        if (value == null || value === '') return fallback;
        const numeric = Math.round(Number(value) || 0);
        return numeric >= 0 ? numeric : fallback;
      }

      function normalizePositiveInt(value, fallback = 1) {
        const numeric = normalizeNonNegativeInt(value, fallback);
        return numeric > 0 ? numeric : fallback;
      }

      function normalizeEnum(value, allowed, fallback) {
        const normalized = normalizeKey(value, fallback);
        return allowed.includes(normalized) ? normalized : fallback;
      }

      function normalizeCardLevel(value, fallback = 1) {
        return Math.max(1, Math.min(4, normalizePositiveInt(value, fallback)));
      }

      function normalizeStringList(value, { lower = false, upper = false } = {}) {
        const source = Array.isArray(value) ? value : [];
        const out = [];
        source.forEach(item => {
          let normalized = normalizeId(item, '');
          if (!normalized) return;
          if (lower) normalized = normalized.toLowerCase();
          if (upper) normalized = normalized.toUpperCase();
          if (!out.includes(normalized)) out.push(normalized);
        });
        return out;
      }

      function getCatalogCard(cardId) {
        return CARD_BY_ID.get(normalizeId(cardId, '')) || null;
      }

      function inferSkillKeyFromModifiers(modifiers) {
        const list = Array.isArray(modifiers) ? modifiers : [];
        const skillModifier = list.find(item => item && typeof item === 'object' && /^skill_/.test(normalizeId(item.type, '')));
        return normalizeKey(skillModifier?.key, '');
      }

      function getCardSkillKey(card) {
        if (!card || normalizeKey(card.kind) !== 'skill') return '';
        return normalizeKey(card.skillKey || inferSkillKeyFromModifiers(card.modifiers), '');
      }

      function findSkillCatalogCard(skillKey, level) {
        const normalizedSkillKey = normalizeKey(skillKey, '');
        const normalizedLevel = normalizeCardLevel(level, 1);
        return catalog.find(card => (
          normalizeKey(card.kind) === 'skill'
          && getCardSkillKey(card) === normalizedSkillKey
          && normalizeCardLevel(card.level, 1) === normalizedLevel
        )) || null;
      }

      function canonicalizeCardRef(refInput) {
        const source = refInput && typeof refInput === 'object' && !Array.isArray(refInput) ? refInput : {};
        const rawId = normalizeId(source.id || source.cardId, '');
        const catalogCard = getCatalogCard(rawId);
        if (!catalogCard) return null;
        const level = normalizeCardLevel(source.lv ?? source.level ?? catalogCard.level, catalogCard.level || 1);
        if (normalizeKey(catalogCard.kind) === 'skill') {
          const skillCard = findSkillCatalogCard(getCardSkillKey(catalogCard), level);
          if (skillCard) return { id: normalizeId(skillCard.id), lv: normalizeCardLevel(skillCard.level, level) };
        }
        return { id: rawId, lv: level };
      }

      function hydrateCardRef(refInput) {
        const ref = canonicalizeCardRef(refInput);
        if (!ref) return null;
        const catalogCard = getCatalogCard(ref.id);
        if (!catalogCard) return null;
        return {
          ...deepClone(catalogCard),
          id: ref.id,
          cardId: ref.id,
          lv: ref.lv,
          level: ref.lv
        };
      }

      function compactCardRef(cardInput) {
        const source = cardInput && typeof cardInput === 'object' && !Array.isArray(cardInput) ? cardInput : {};
        return canonicalizeCardRef({
          id: source.id || source.cardId,
          lv: source.lv ?? source.level
        });
      }

      function canCardUseSlot(cardInput, slotType) {
        const card = hydrateCardRef(cardInput) || cardInput || {};
        const normalizedSlot = normalizeEnum(slotType, SLOT_TYPES, 'general');
        const slotTags = normalizeStringList(card.slotTags, { lower: true });
        return slotTags.includes(normalizedSlot);
      }

      function getAllowedSlotsForCard(cardInput) {
        return SLOT_TYPES.filter(slotType => canCardUseSlot(cardInput, slotType));
      }

      function normalizeSlots(value) {
        const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
        return {
          general: Math.max(
            config.initialGeneralSlots,
            Math.min(config.maxGeneralSlots, normalizePositiveInt(source.general, config.initialGeneralSlots))
          ),
          void: Math.max(0, Math.min(config.voidSlots, normalizeNonNegativeInt(source.void, config.voidSlots)))
        };
      }

      function isProtectedCard(cardInput) {
        const card = hydrateCardRef(cardInput) || cardInput || {};
        const rarity = normalizeEnum(card.rarity, RARITY_VALUES, 'bronze');
        const kind = normalizeEnum(card.kind, KIND_VALUES, 'numeric');
        return rarity === 'rainbow' || kind === 'god' || card.unique === true;
      }

      function getUniqueCardKey(cardInput) {
        const card = hydrateCardRef(cardInput) || cardInput || {};
        if (!isProtectedCard(card)) return '';
        return normalizeId(card.id || card.cardId, '');
      }

      function normalizeBagList(list, slotType, limit) {
        const seenUnique = new Set();
        const out = [];
        (Array.isArray(list) ? list : []).forEach((item) => {
          const ref = canonicalizeCardRef(item);
          if (!ref) return;
          const card = hydrateCardRef(ref);
          if (!card || !canCardUseSlot(card, slotType)) return;
          const uniqueKey = getUniqueCardKey(card);
          if (uniqueKey && seenUnique.has(uniqueKey)) return;
          if (uniqueKey) seenUnique.add(uniqueKey);
          out.push(ref);
        });
        return out.slice(0, limit);
      }

      function normalizeBag(value, slots) {
        const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
        const general = normalizeBagList(source.general, 'general', slots.general);
        const voidCards = normalizeBagList(source.void, 'void', slots.void);
        const seenProtected = new Set();
        function filterProtected(list) {
          return list.filter((ref) => {
            const key = getUniqueCardKey(ref);
            if (!key) return true;
            if (seenProtected.has(key)) return false;
            seenProtected.add(key);
            return true;
          });
        }
        return {
          general: filterProtected(general),
          void: filterProtected(voidCards)
        };
      }

      function normalizeOffer(value) {
        const source = value && typeof value === 'object' && !Array.isArray(value) ? value : null;
        if (!source) return null;
        const pool = normalizeEnum(source.pool, POOL_VALUES, 'low');
        const choices = (Array.isArray(source.choices) ? source.choices : [])
          .map(canonicalizeCardRef)
          .filter(Boolean)
          .slice(0, config.offerSize);
        if (!choices.length) return null;
        const out = {
          floor: normalizeId(source.floor || source.floorKey, ''),
          id: normalizeId(source.id, `offer:${pool}`),
          pool,
          settled: source.settled === true,
          choices
        };
        const reroll = (Array.isArray(source.reroll) ? source.reroll : [])
          .map(canonicalizeCardRef)
          .filter(Boolean)
          .slice(0, config.offerSize);
        if (!out.settled && reroll.length) out.reroll = reroll;
        return out;
      }

      function makeDefaultAssetDeckState() {
        return {
          slots: {
            general: config.initialGeneralSlots,
            void: config.voidSlots
          },
          bag: {
            general: [],
            void: []
          },
          offer: null
        };
      }

      function normalizeAssetDeckState(value) {
        const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
        const base = makeDefaultAssetDeckState();
        const slots = normalizeSlots(source.slots || {});
        const bag = normalizeBag(source.bag || {}, slots);
        return {
          slots: slots || base.slots,
          bag: bag || base.bag,
          offer: normalizeOffer(source.offer)
        };
      }

      function compactAssetDeckState(value) {
        return normalizeAssetDeckState(value);
      }

      function getActiveCardRefs(assetDeckInput) {
        const assetDeck = normalizeAssetDeckState(assetDeckInput);
        return [
          ...assetDeck.bag.general.map((ref, index) => ({ ref, card: hydrateCardRef(ref), slotType: 'general', index })),
          ...assetDeck.bag.void.map((ref, index) => ({ ref, card: hydrateCardRef(ref), slotType: 'void', index }))
        ].filter(item => item.card);
      }

      function findActiveSkillRef(assetDeck, skillKey) {
        const normalizedSkillKey = normalizeKey(skillKey, '');
        if (!normalizedSkillKey) return null;
        return getActiveCardRefs(assetDeck).find(ref => getCardSkillKey(ref.card) === normalizedSkillKey) || null;
      }

      function getUpgradeModifier(card) {
        const list = Array.isArray(card?.modifiers) ? card.modifiers : [];
        return list.find(item => item && typeof item === 'object' && normalizeKey(item.type || item.kind) === 'skill_upgrade') || null;
      }

      function isUpgradeCard(card) {
        return normalizeKey(card?.kind) === 'upgrade' || !!getUpgradeModifier(card);
      }

      function getUpgradeMaxFromLevel(card) {
        const modifier = getUpgradeModifier(card);
        return modifier ? Math.max(0, Math.min(3, normalizeNonNegativeInt(modifier.maxFromLevel ?? modifier.maxLevel, 0))) : 0;
      }

      function getUpgradeableSkillRefs(assetDeck, upgradeCard) {
        const maxFromLevel = getUpgradeMaxFromLevel(upgradeCard);
        if (!maxFromLevel) return [];
        return getActiveCardRefs(assetDeck).filter(ref => {
          const skillKey = getCardSkillKey(ref.card);
          const level = normalizeCardLevel(ref.card.level, 1);
          return skillKey && level >= 1 && level <= maxFromLevel && level < 4;
        });
      }

      function findActiveUniqueRef(assetDeck, card) {
        const uniqueKey = getUniqueCardKey(card);
        if (!uniqueKey) return null;
        return getActiveCardRefs(assetDeck).find(ref => getUniqueCardKey(ref.card) === uniqueKey) || null;
      }

      function isSkillCardOfferEligible(assetDeck, catalogCard) {
        const skillKey = getCardSkillKey(catalogCard);
        if (!skillKey) return true;
        const active = findActiveSkillRef(assetDeck, skillKey);
        if (!active) return true;
        const activeLevel = normalizeCardLevel(active.card.level, 1);
        const candidateLevel = normalizeCardLevel(catalogCard.level, 1);
        if (activeLevel >= 4) return false;
        return candidateLevel >= activeLevel;
      }

      function isUpgradeCardOfferEligible(assetDeck, catalogCard) {
        if (!isUpgradeCard(catalogCard)) return true;
        return getUpgradeableSkillRefs(assetDeck, catalogCard).length > 0;
      }

      function getEligibleCatalogCards(assetDeckInput, pool, avoidCardIds = []) {
        const assetDeck = normalizeAssetDeckState(assetDeckInput);
        const avoided = new Set(avoidCardIds.map(id => normalizeId(id, '')).filter(Boolean));
        return catalog
          .filter(card => Array.isArray(card.pools) && card.pools.includes(pool))
          .filter(card => !avoided.has(normalizeId(card.id, '')))
          .filter(card => !findActiveUniqueRef(assetDeck, card))
          .filter(card => isSkillCardOfferEligible(assetDeck, card))
          .filter(card => isUpgradeCardOfferEligible(assetDeck, card));
      }

      function hashStringToSeed(input) {
        const str = String(input || 'ACE0-ASSET-DECK');
        let hash = 2166136261;
        for (let index = 0; index < str.length; index += 1) {
          hash ^= str.charCodeAt(index);
          hash = Math.imul(hash, 16777619);
        }
        return hash >>> 0;
      }

      function mulberry32(seed) {
        let value = seed >>> 0;
        return function random() {
          value += 0x6D2B79F5;
          let t = value;
          t = Math.imul(t ^ (t >>> 15), t | 1);
          t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
      }

      function pickWeightedRarity(pool, random) {
        const weights = config.poolRarityWeights?.[pool] || {};
        const entries = RARITY_VALUES
          .map(rarity => ({ rarity, weight: Math.max(0, Number(weights[rarity]) || 0) }))
          .filter(entry => entry.weight > 0);
        if (!entries.length) return '';
        const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
        let roll = random() * total;
        for (const entry of entries) {
          roll -= entry.weight;
          if (roll <= 0) return entry.rarity;
        }
        return entries[entries.length - 1].rarity;
      }

      function createOfferChoices(poolInput, seedInput, avoidCardIds = [], assetDeckInput = null) {
        const pool = normalizeEnum(poolInput, POOL_VALUES, 'low');
        const assetDeck = normalizeAssetDeckState(assetDeckInput);
        const candidates = getEligibleCatalogCards(assetDeck, pool, avoidCardIds);
        const random = mulberry32(hashStringToSeed(seedInput));
        const selected = [];
        const selectedIds = new Set(avoidCardIds.map(id => normalizeId(id, '')).filter(Boolean));

        for (let index = 0; index < config.offerSize; index += 1) {
          const rarity = pickWeightedRarity(pool, random);
          const rarityCandidates = candidates
            .filter(card => normalizeEnum(card.rarity, RARITY_VALUES, 'bronze') === rarity)
            .filter(card => !selectedIds.has(normalizeId(card.id, '')));
          const fallbackCandidates = candidates
            .filter(card => !selectedIds.has(normalizeId(card.id, '')));
          const bucket = rarityCandidates.length ? rarityCandidates : fallbackCandidates;
          if (!bucket.length) break;
          const picked = bucket[Math.floor(random() * bucket.length)] || bucket[0];
          const ref = compactCardRef({ id: picked.id, lv: picked.level });
          if (!ref) continue;
          selected.push(ref);
          selectedIds.add(ref.id);
        }

        return selected;
      }

      function getUnlockCost(assetDeckInput) {
        const assetDeck = normalizeAssetDeckState(assetDeckInput);
        if (assetDeck.slots.general >= config.maxGeneralSlots) return null;
        const index = Math.max(0, assetDeck.slots.general - config.initialGeneralSlots);
        return normalizeNonNegativeInt(config.unlockCosts[index], 1);
      }

      function createAssetPointContext(options = {}) {
        const initial = normalizeNonNegativeInt(options.assetPoints ?? options.points, 0);
        let current = initial;
        return {
          get value() { return current; },
          spend(cost) {
            const normalizedCost = normalizeNonNegativeInt(cost, 0);
            if (current < normalizedCost) return false;
            current -= normalizedCost;
            return true;
          },
          resultFields() {
            return {
              assetPoints: current,
              assetDelta: current - initial
            };
          }
        };
      }

      function result(assetDeck, ok, code, extra = {}, assetPointContext = null) {
        return {
          ok,
          code,
          assetDeck: compactAssetDeckState(assetDeck),
          ...(assetPointContext ? assetPointContext.resultFields() : {}),
          ...extra
        };
      }

      function settleOffer(assetDeck) {
        if (assetDeck.offer) {
          assetDeck.offer = normalizeOffer({
            ...assetDeck.offer,
            settled: true,
            reroll: []
          });
        }
      }

      function replaceRefInBag(assetDeck, refInfo, nextRef) {
        const list = assetDeck.bag[refInfo.slotType] || [];
        list[refInfo.index] = nextRef;
        assetDeck.bag[refInfo.slotType] = list;
      }

      function resolveSkillCardSelection(assetDeck, cardRef, card) {
        const skillKey = getCardSkillKey(card);
        if (!skillKey) return null;
        const active = findActiveSkillRef(assetDeck, skillKey);
        if (!active) return null;

        const activeLevel = normalizeCardLevel(active.card.level, 1);
        const candidateLevel = normalizeCardLevel(card.level, 1);
        if (activeLevel >= 4 || candidateLevel < activeLevel) {
          settleOffer(assetDeck);
          return result(assetDeck, true, activeLevel >= 4 ? 'skill_max_ignored' : 'skill_lower_ignored', {
            card: active.ref,
            consumed: cardRef
          });
        }

        const nextLevel = candidateLevel === activeLevel ? Math.min(4, activeLevel + 1) : Math.min(4, candidateLevel);
        const nextCard = findSkillCatalogCard(skillKey, nextLevel) || card;
        const nextRef = compactCardRef({ id: nextCard.id || card.id, lv: nextLevel });
        replaceRefInBag(assetDeck, active, nextRef);
        settleOffer(assetDeck);
        return result(assetDeck, true, candidateLevel === activeLevel ? 'skill_merged' : 'skill_upgraded', {
          card: nextRef,
          consumed: cardRef,
          fromLevel: activeLevel,
          toLevel: nextLevel
        });
      }

      function resolveUpgradeCardSelection(assetDeck, cardRef, card) {
        if (!isUpgradeCard(card)) return null;
        const target = getUpgradeableSkillRefs(assetDeck, card)[0] || null;
        if (!target) {
          settleOffer(assetDeck);
          return result(assetDeck, true, 'skill_upgrade_invalid', { consumed: cardRef });
        }
        const activeLevel = normalizeCardLevel(target.card.level, 1);
        const nextLevel = Math.min(4, activeLevel + 1);
        const nextCard = findSkillCatalogCard(getCardSkillKey(target.card), nextLevel) || target.card;
        const nextRef = compactCardRef({ id: nextCard.id || target.ref.id, lv: nextLevel });
        replaceRefInBag(assetDeck, target, nextRef);
        settleOffer(assetDeck);
        return result(assetDeck, true, 'skill_upgrade_consumed', {
          card: nextRef,
          consumed: cardRef,
          fromLevel: activeLevel,
          toLevel: nextLevel
        });
      }

      function chooseOfferCard(assetDeckInput, payloadInput) {
        const assetDeck = normalizeAssetDeckState(assetDeckInput);
        const payload = payloadInput && typeof payloadInput === 'object' && !Array.isArray(payloadInput) ? payloadInput : {};
        const offer = assetDeck.offer;
        if (!offer) return result(assetDeck, false, 'no_offer');
        if (offer.settled) return result(assetDeck, false, 'offer_settled');

        const requestedId = normalizeId(payload.choiceId || payload.cardId || payload.id, '');
        const requestedIndex = Number.isFinite(Number(payload.choiceIndex)) ? Math.round(Number(payload.choiceIndex)) : -1;
        const cardById = requestedId ? offer.choices.find(choice => choice.id === requestedId) : null;
        if (requestedId && !cardById) {
          return result(assetDeck, false, 'choice_id_mismatch', { requestedId, requestedIndex });
        }
        const cardRef = cardById || offer.choices[requestedIndex] || null;
        const card = hydrateCardRef(cardRef);
        if (!cardRef || !card) return result(assetDeck, false, 'invalid_choice');

        const activeUnique = findActiveUniqueRef(assetDeck, card);
        if (activeUnique) {
          settleOffer(assetDeck);
          return result(assetDeck, true, 'unique_already_active', { card: activeUnique.ref, consumed: cardRef });
        }

        const upgradeResult = resolveUpgradeCardSelection(assetDeck, cardRef, card);
        if (upgradeResult) return upgradeResult;

        const skillResult = resolveSkillCardSelection(assetDeck, cardRef, card);
        if (skillResult) return skillResult;

        const allowedSlots = getAllowedSlotsForCard(card);
        const preferredSlot = normalizeEnum(payload.slotType, SLOT_TYPES, allowedSlots[0] || 'general');
        let slotType = allowedSlots.includes(preferredSlot) ? preferredSlot : allowedSlots[0];
        if (slotType === 'void' && allowedSlots.includes('general') && assetDeck.bag.void.length >= assetDeck.slots.void) {
          slotType = 'general';
        }
        if (!slotType) return result(assetDeck, false, 'invalid_slot');

        const list = assetDeck.bag[slotType] || [];
        const limit = assetDeck.slots[slotType] || 0;
        const hasRoom = list.length < limit;
        const targetIndex = Number.isFinite(Number(payload.targetIndex ?? payload.replaceIndex))
          ? Math.max(0, Math.round(Number(payload.targetIndex ?? payload.replaceIndex)))
          : -1;

        if (!hasRoom && targetIndex < 0) {
          return result(assetDeck, false, 'needs_replace', { card: cardRef, allowedSlots });
        }
        if (!hasRoom && !list[targetIndex]) {
          return result(assetDeck, false, 'invalid_target', { card: cardRef, allowedSlots });
        }
        if (!hasRoom) {
          const removed = hydrateCardRef(list[targetIndex]);
          if (isProtectedCard(removed) && payload.confirmDestroy !== true && payload.confirm_destroy !== true) {
            return result(assetDeck, false, 'requires_destroy_confirm', {
              card: cardRef,
              removed: list[targetIndex],
              slotType,
              targetIndex
            });
          }
          list[targetIndex] = cardRef;
          assetDeck.bag[slotType] = list;
          settleOffer(assetDeck);
          return result(assetDeck, true, 'replaced', { card: cardRef, removed, slotType, targetIndex });
        }

        assetDeck.bag[slotType] = [...list, cardRef];
        settleOffer(assetDeck);
        return result(assetDeck, true, 'equipped', { card: cardRef, slotType });
      }

      function openOffer(assetDeckInput, payloadInput, assetPointContext, options = {}) {
        const assetDeck = normalizeAssetDeckState(assetDeckInput);
        const payload = payloadInput && typeof payloadInput === 'object' && !Array.isArray(payloadInput) ? payloadInput : {};
        const pool = normalizeEnum(payload.pool, POOL_VALUES, 'low');
        const floor = normalizeId(payload.floor || payload.floorKey || options.floorKey, '');
        if (assetDeck.offer && assetDeck.offer.floor === floor && assetDeck.offer.pool === pool) {
          return result(assetDeck, true, assetDeck.offer.settled ? 'offer_already_settled' : 'offer_already_open', { offer: assetDeck.offer }, assetPointContext);
        }

        const cost = normalizeNonNegativeInt(payload.cost, config.poolCosts[pool] || 0);
        if (!assetPointContext.spend(cost)) return result(assetDeck, false, 'not_enough_asset', { cost }, assetPointContext);
        const seed = normalizeId(payload.seed || options.seed, `asset:${floor || 'current'}:${pool}`);
        const choices = createOfferChoices(pool, seed, [], assetDeck);
        if (!choices.length) return result(assetDeck, false, 'empty_pool', { pool }, assetPointContext);
        const reroll = createOfferChoices(pool, `${seed}:reroll`, choices.map(choice => choice.id), assetDeck);
        assetDeck.offer = normalizeOffer({
          floor,
          id: normalizeId(payload.id, `offer:${pool}:${hashStringToSeed(seed)}`),
          pool,
          settled: false,
          choices,
          reroll
        });
        return result(assetDeck, true, 'offer_opened', { offer: assetDeck.offer }, assetPointContext);
      }

      function rerollOffer(assetDeckInput) {
        const assetDeck = normalizeAssetDeckState(assetDeckInput);
        if (!assetDeck.offer) return result(assetDeck, false, 'no_offer');
        if (assetDeck.offer.settled) return result(assetDeck, false, 'offer_settled');
        if (!Array.isArray(assetDeck.offer.reroll) || !assetDeck.offer.reroll.length) {
          return result(assetDeck, false, 'no_reroll');
        }
        assetDeck.offer = normalizeOffer({
          ...assetDeck.offer,
          choices: assetDeck.offer.reroll,
          reroll: []
        });
        return result(assetDeck, true, 'offer_rerolled', { offer: assetDeck.offer });
      }

      function clearOffer(assetDeckInput, payloadInput) {
        const assetDeck = normalizeAssetDeckState(assetDeckInput);
        const payload = payloadInput && typeof payloadInput === 'object' && !Array.isArray(payloadInput) ? payloadInput : {};
        const floor = normalizeId(payload.floor || payload.floorKey, '');
        if (!floor || !assetDeck.offer || assetDeck.offer.floor === floor) {
          assetDeck.offer = null;
        }
        return result(assetDeck, true, 'offer_cleared');
      }

      function applyAssetDeckCommand(assetDeckInput, commandInput, options = {}) {
        const assetDeck = normalizeAssetDeckState(assetDeckInput);
        const command = commandInput && typeof commandInput === 'object' && !Array.isArray(commandInput) ? commandInput : {};
        const payload = command.payload && typeof command.payload === 'object' && !Array.isArray(command.payload)
          ? command.payload
          : command;
        const kind = normalizeKey(command.kind || command.type, '');
        const assetPointContext = createAssetPointContext(options);
        if (!kind) return result(assetDeck, false, 'missing_command', {}, assetPointContext);

        if (kind === 'open_offer') return openOffer(assetDeck, payload, assetPointContext, options);
        if (kind === 'choose_card') return chooseOfferCard(assetDeck, payload);
        if (kind === 'reroll_offer' || kind === 'refresh_offer') return rerollOffer(assetDeck);
        if (kind === 'clear_offer') return clearOffer(assetDeck, payload);

        if (kind === 'unlock_slot') {
          const cost = getUnlockCost(assetDeck);
          if (cost == null) return result(assetDeck, false, 'slot_cap_reached', {}, assetPointContext);
          if (!assetPointContext.spend(cost)) return result(assetDeck, false, 'not_enough_asset', { cost }, assetPointContext);
          assetDeck.slots.general = Math.min(config.maxGeneralSlots, assetDeck.slots.general + 1);
          return result(assetDeck, true, 'slot_unlocked', { cost }, assetPointContext);
        }

        if (kind === 'debug_reset') return result(makeDefaultAssetDeckState(), true, 'debug_reset', {}, assetPointContext);
        return result(assetDeck, false, 'unknown_command', {}, assetPointContext);
      }

      return {
        getConfig: () => deepClone(config),
        getCatalog: () => deepClone(catalog),
        makeDefaultAssetDeckState,
        normalizeAssetDeckState,
        compactAssetDeckState,
        normalizeAssetCardInstance: hydrateCardRef,
        hydrateCardRef,
        compactCardRef,
        canCardUseSlot,
        getAllowedSlotsForCard,
        getUnlockCost,
        createOfferChoices,
        applyAssetDeckCommand
      };
    }
  };

  const data = global.ACE0AssetDeckData || {};
  const runtime = global.ACE0AssetDeckRuntime.create({ data });
  global.ACE0Modules = global.ACE0Modules || {};
  global.ACE0Modules.assetDeck = runtime;
})(typeof window !== 'undefined' ? window : globalThis);
