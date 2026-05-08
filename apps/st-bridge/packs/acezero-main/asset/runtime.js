/**
 * ACEZERO ASSET DECK RUNTIME
 *
 * Pure long-term AssetDeck rules. No UI, no Texas table runtime, no ACT node
 * mutation. Commands return normalized state plus a small result envelope.
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
        refreshCosts: { low: 0, mid: 0, high: 1 },
        freeRefreshByPool: { low: 1, mid: 1, high: 0 },
        maxRefreshByPool: { low: 1, mid: 1, high: 1 },
        poolRarityWeights: {
          low: { bronze: 65, silver: 25, gold: 10, rainbow: 0 },
          mid: { bronze: 35, silver: 35, gold: 25, rainbow: 5 },
          high: { bronze: 0, silver: 35, gold: 40, rainbow: 25 }
        },
        ...(data.ASSET_DECK_CONFIG || {})
      };
      const catalog = Array.isArray(data.ASSET_CARD_CATALOG) ? data.ASSET_CARD_CATALOG : [];
      const deps = options.deps || {};
      const {
        deepClone = (value) => (value == null ? value : JSON.parse(JSON.stringify(value))),
        now = () => Date.now()
      } = deps;

      const CARD_ID_SET = new Set(catalog.map(card => normalizeId(card.id)).filter(Boolean));
      const RARITY_VALUES = ['bronze', 'silver', 'gold', 'rainbow'];
      const KIND_VALUES = ['numeric', 'passive', 'skill', 'god'];
      const SLOT_TYPES = ['general', 'void'];
      const POOL_VALUES = ['low', 'mid', 'high'];
      const HISTORY_LIMIT = 24;

      function normalizeId(value, fallback = '') {
        const normalized = typeof value === 'string' ? value.trim() : '';
        return normalized || fallback;
      }

      function normalizePositiveInt(value, fallback = 0) {
        if (value == null || value === '') return fallback;
        const numeric = Math.round(Number(value) || 0);
        return numeric > 0 ? numeric : fallback;
      }

      function normalizeNonNegativeInt(value, fallback = 0) {
        if (value == null || value === '') return fallback;
        const numeric = Math.round(Number(value) || 0);
        return numeric >= 0 ? numeric : fallback;
      }

      function normalizeEnum(value, allowed, fallback) {
        const normalized = normalizeId(value, fallback).toLowerCase();
        return allowed.includes(normalized) ? normalized : fallback;
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

      function compactHistorySource(source) {
        const raw = source && typeof source === 'object' && !Array.isArray(source) ? source : null;
        if (!raw) return null;
        const out = {};
        const type = normalizeId(raw.type, '');
        const actId = normalizeId(raw.actId, '');
        const nodeId = normalizeId(raw.nodeId, '');
        const pool = normalizeId(raw.pool, '');
        const nodeIndex = Math.max(0, Math.round(Number(raw.nodeIndex) || 0));
        const phaseIndex = Math.max(0, Math.round(Number(raw.phaseIndex) || 0));
        const level = Math.max(0, Math.round(Number(raw.level) || 0));
        if (type) out.type = type;
        if (actId) out.actId = actId;
        if (nodeId) out.nodeId = nodeId;
        if (nodeIndex) out.nodeIndex = nodeIndex;
        if (phaseIndex) out.phaseIndex = phaseIndex;
        if (level) out.level = level;
        if (pool) out.pool = pool;
        return Object.keys(out).length ? out : null;
      }

      function compactHistoryEvent(event) {
        const raw = event && typeof event === 'object' && !Array.isArray(event) ? event : {};
        const out = {};
        const kind = normalizeId(raw.kind || raw.type, '');
        const status = normalizeId(raw.status, '');
        const cardId = normalizeId(raw.cardId, '');
        const removedCardId = normalizeId(raw.removedCardId, '');
        const requestId = normalizeId(raw.requestId, '');
        const pool = normalizeId(raw.pool, '');
        const slotType = normalizeId(raw.slotType, '');
        const source = compactHistorySource(raw.source);
        if (kind) out.kind = kind;
        if (status) out.status = status;
        if (cardId) out.cardId = cardId;
        if (removedCardId) out.removedCardId = removedCardId;
        if (requestId) out.requestId = requestId;
        if (pool) out.pool = pool;
        if (slotType) out.slotType = slotType;
        if (source) out.source = source;
        ['amount', 'cost', 'free', 'general_slots_unlocked', 'fromLevel', 'toLevel'].forEach(key => {
          if (raw[key] != null && raw[key] !== '') out[key] = raw[key];
        });
        if (raw.at != null && raw.at !== '') out.at = normalizeNonNegativeInt(raw.at, 0);
        return out;
      }

      function getCatalogCard(cardId) {
        const normalized = normalizeId(cardId, '');
        return catalog.find(card => normalizeId(card.id, '') === normalized) || null;
      }

      function normalizeSkillKey(value) {
        return normalizeId(value, '').toLowerCase();
      }

      function inferSkillKeyFromModifiers(modifiers) {
        const list = Array.isArray(modifiers) ? modifiers : [];
        const skillModifier = list.find(item => item && typeof item === 'object' && /^skill_/.test(normalizeId(item.type, '')));
        return normalizeSkillKey(skillModifier?.key);
      }

      function getCardSkillKey(card) {
        if (!card || normalizeId(card.kind, '').toLowerCase() !== 'skill') return '';
        return normalizeSkillKey(card.skillKey || inferSkillKeyFromModifiers(card.modifiers));
      }

      function createCardInstance(card, source = 'runtime') {
        const base = card && typeof card === 'object' ? card : {};
        const cardId = normalizeId(base.id || base.cardId, '');
        const nowValue = normalizeNonNegativeInt(now(), 0);
        return normalizeAssetCardInstance({
          instanceId: `${cardId || 'asset_card'}:${source}:${nowValue}`,
          cardId,
          rarity: base.rarity,
          kind: base.kind,
          system: base.system,
          skillKey: base.skillKey,
          level: base.level,
          targetTags: base.targetTags,
          gameTags: base.gameTags,
          slotTags: base.slotTags,
          modifiers: base.modifiers,
          source,
          addedAt: nowValue
        });
      }

      function normalizeAssetCardInstance(value) {
        const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
        const cardId = normalizeId(source.cardId || source.id, '');
        const catalogCard = getCatalogCard(cardId);
        const slotTags = normalizeStringList(source.slotTags || catalogCard?.slotTags, { lower: true })
          .filter(tag => SLOT_TYPES.includes(tag));
        const normalized = {
          instanceId: normalizeId(source.instanceId, ''),
          cardId,
          rarity: normalizeEnum(source.rarity || catalogCard?.rarity, RARITY_VALUES, 'bronze'),
          kind: normalizeEnum(source.kind || catalogCard?.kind, KIND_VALUES, 'numeric'),
          system: normalizeId(source.system || catalogCard?.system, '').toLowerCase(),
          skillKey: normalizeSkillKey(source.skillKey || catalogCard?.skillKey || inferSkillKeyFromModifiers(source.modifiers || catalogCard?.modifiers)),
          level: Math.max(0, Math.min(4, normalizeNonNegativeInt(source.level ?? catalogCard?.level, 0))),
          targetTags: normalizeStringList(source.targetTags || catalogCard?.targetTags, { upper: false }),
          gameTags: normalizeStringList(source.gameTags || catalogCard?.gameTags, { lower: true }),
          slotTags: slotTags.length ? slotTags : ['general'],
          unique: Boolean(source.unique ?? catalogCard?.unique),
          modifiers: Array.isArray(source.modifiers || catalogCard?.modifiers)
            ? deepClone(source.modifiers || catalogCard.modifiers)
            : [],
          source: normalizeId(source.source, 'runtime'),
          addedAt: normalizeNonNegativeInt(source.addedAt, 0)
        };
        if (!normalized.instanceId) {
          normalized.instanceId = `${normalized.cardId || 'asset_card'}:${normalized.addedAt || 0}`;
        }
        return normalized;
      }

      function normalizePendingOffer(value) {
        const source = value && typeof value === 'object' && !Array.isArray(value) ? value : null;
        if (!source) return null;
        const pool = normalizeEnum(source.pool, POOL_VALUES, 'low');
        const choices = Array.isArray(source.choices)
          ? source.choices.map(normalizeAssetCardInstance).filter(card => isKnownCard(card.cardId))
          : [];
        if (!choices.length) return null;
        return {
          id: normalizeId(source.id, `offer:${pool}`),
          pool,
          cost: normalizeNonNegativeInt(source.cost, config.poolCosts[pool] || 0),
          refreshCount: normalizeNonNegativeInt(source.refreshCount, 0),
          freeRefreshUsed: normalizeNonNegativeInt(source.freeRefreshUsed, 0),
          choices: choices.slice(0, config.offerSize),
          createdAt: normalizeNonNegativeInt(source.createdAt, 0)
        };
      }

      function normalizePendingOfferQueue(value) {
        const source = Array.isArray(value) ? value : [];
        return source
          .map(normalizePendingOffer)
          .filter(Boolean)
          .slice(0, 12);
      }

      function normalizePendingReplace(value) {
        const source = value && typeof value === 'object' && !Array.isArray(value) ? value : null;
        if (!source) return null;
        const card = normalizeAssetCardInstance(source.card || source.candidate);
        if (!isKnownCard(card.cardId)) return null;
        const allowedSlots = normalizeStringList(source.allowedSlots, { lower: true })
          .filter(slot => SLOT_TYPES.includes(slot) && canCardUseSlot(card, slot));
        return {
          card,
          allowedSlots: allowedSlots.length ? allowedSlots : getAllowedSlotsForCard(card),
          reason: normalizeId(source.reason, 'slot_full'),
          confirm_destroy: source.confirm_destroy === true,
          confirm_target: source.confirm_target && typeof source.confirm_target === 'object' && !Array.isArray(source.confirm_target)
            ? deepClone(source.confirm_target)
            : null
        };
      }

      function makeDefaultAssetDeckState() {
        return {
          version: 1,
          asset_count: 0,
          general_slots_unlocked: config.initialGeneralSlots,
          void_slots_unlocked: config.voidSlots,
          active_general_cards: [],
          active_void_cards: [],
          pending_offer: null,
          pending_offer_queue: [],
          pending_replace: null,
          history: [],
          debug: {}
        };
      }

      function isKnownCard(cardId) {
        return CARD_ID_SET.has(normalizeId(cardId, ''));
      }

      function canCardUseSlot(card, slotType) {
        const normalizedSlot = normalizeEnum(slotType, SLOT_TYPES, 'general');
        const slotTags = normalizeStringList(card?.slotTags, { lower: true });
        return normalizedSlot === 'general'
          ? slotTags.includes('general')
          : slotTags.includes('void');
      }

      function getAllowedSlotsForCard(card) {
        return SLOT_TYPES.filter(slotType => canCardUseSlot(card, slotType));
      }

      function isProtectedCard(card) {
        const rarity = normalizeEnum(card?.rarity, RARITY_VALUES, 'bronze');
        const kind = normalizeEnum(card?.kind, KIND_VALUES, 'numeric');
        return rarity === 'rainbow' || kind === 'god' || card?.unique === true;
      }

      function getUniqueCardKey(card) {
        if (!card || !isProtectedCard(card)) return '';
        return normalizeId(card.cardId || card.id, '');
      }

      function normalizeCardList(list, slotType, limit) {
        const seenInstances = new Set();
        return (Array.isArray(list) ? list : [])
          .map(normalizeAssetCardInstance)
          .filter(card => isKnownCard(card.cardId) && canCardUseSlot(card, slotType))
          .filter(card => {
            if (seenInstances.has(card.instanceId)) return false;
            seenInstances.add(card.instanceId);
            return true;
          })
          .slice(0, limit);
      }

      function removeDuplicateUniqueCards(generalCards, voidCards) {
        const seenUniqueKeys = new Set();
        function filterList(list) {
          return list.filter(card => {
            const uniqueKey = getUniqueCardKey(card);
            if (!uniqueKey) return true;
            if (seenUniqueKeys.has(uniqueKey)) return false;
            seenUniqueKeys.add(uniqueKey);
            return true;
          });
        }
        return {
          general: filterList(generalCards),
          void: filterList(voidCards)
        };
      }

      function normalizeAssetDeckState(value) {
        const base = makeDefaultAssetDeckState();
        const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
        const generalSlotsUnlocked = Math.max(
          config.initialGeneralSlots,
          Math.min(config.maxGeneralSlots, normalizePositiveInt(source.general_slots_unlocked, base.general_slots_unlocked))
        );
        const rawVoidSlots = source.void_slots_unlocked ?? source.voidSlotsUnlocked;
        const voidSlotsUnlocked = rawVoidSlots == null
          ? base.void_slots_unlocked
          : Math.max(0, Math.min(config.voidSlots, normalizeNonNegativeInt(rawVoidSlots, base.void_slots_unlocked)));
        const normalizedGeneralCards = normalizeCardList(source.active_general_cards || source.activeGeneralCards, 'general', generalSlotsUnlocked);
        const normalizedVoidCards = normalizeCardList(source.active_void_cards || source.activeVoidCards, 'void', voidSlotsUnlocked);
        const uniqueFilteredCards = removeDuplicateUniqueCards(normalizedGeneralCards, normalizedVoidCards);
        return {
          version: Math.max(1, normalizePositiveInt(source.version, base.version)),
          asset_count: normalizeNonNegativeInt(source.asset_count ?? source.assetCount, base.asset_count),
          general_slots_unlocked: generalSlotsUnlocked,
          void_slots_unlocked: voidSlotsUnlocked,
          active_general_cards: uniqueFilteredCards.general,
          active_void_cards: uniqueFilteredCards.void,
          pending_offer: normalizePendingOffer(source.pending_offer || source.pendingOffer),
          pending_offer_queue: normalizePendingOfferQueue(source.pending_offer_queue || source.pendingOfferQueue),
          pending_replace: normalizePendingReplace(source.pending_replace || source.pendingReplace),
          history: Array.isArray(source.history) ? source.history.slice(-HISTORY_LIMIT).map(compactHistoryEvent) : [],
          debug: source.debug && typeof source.debug === 'object' && !Array.isArray(source.debug) ? deepClone(source.debug) : {}
        };
      }

      function promoteNextPendingOffer(assetDeck) {
        const queue = normalizePendingOfferQueue(assetDeck.pending_offer_queue);
        assetDeck.pending_offer = queue.shift() || null;
        assetDeck.pending_offer_queue = queue;
        return assetDeck.pending_offer;
      }

      function clearCurrentPendingOffer(assetDeck) {
        assetDeck.pending_offer = null;
        promoteNextPendingOffer(assetDeck);
      }

      function enqueueOrActivatePendingOffer(assetDeck, offer) {
        const normalizedOffer = normalizePendingOffer(offer);
        if (!normalizedOffer) return null;
        if (assetDeck.pending_offer) {
          assetDeck.pending_offer_queue = [
            ...normalizePendingOfferQueue(assetDeck.pending_offer_queue),
            normalizedOffer
          ].slice(0, 12);
        } else {
          assetDeck.pending_offer = normalizedOffer;
        }
        return normalizedOffer;
      }

      function getUnlockCost(assetDeck) {
        const unlocked = normalizeAssetDeckState(assetDeck).general_slots_unlocked;
        if (unlocked >= config.maxGeneralSlots) return null;
        const index = Math.max(0, unlocked - config.initialGeneralSlots);
        return normalizeNonNegativeInt(config.unlockCosts[index], 1);
      }

      function getActiveCardRefs(assetDeck) {
        return [
          ...assetDeck.active_general_cards.map((card, index) => ({ card, slotType: 'general', index, listKey: 'active_general_cards' })),
          ...assetDeck.active_void_cards.map((card, index) => ({ card, slotType: 'void', index, listKey: 'active_void_cards' }))
        ];
      }

      function findActiveSkillRef(assetDeck, skillKey) {
        const normalizedSkillKey = normalizeSkillKey(skillKey);
        if (!normalizedSkillKey) return null;
        return getActiveCardRefs(assetDeck)
          .find(ref => getCardSkillKey(ref.card) === normalizedSkillKey) || null;
      }

      function findActiveUniqueRef(assetDeck, card) {
        const uniqueKey = getUniqueCardKey(card);
        if (!uniqueKey) return null;
        return getActiveCardRefs(assetDeck)
          .find(ref => getUniqueCardKey(ref.card) === uniqueKey) || null;
      }

      function isSkillCardOfferEligible(assetDeck, card) {
        const skillKey = getCardSkillKey(card);
        if (!skillKey) return true;
        const active = findActiveSkillRef(assetDeck, skillKey);
        if (!active) return true;
        const activeLevel = Math.max(0, normalizeNonNegativeInt(active.card.level, 0));
        const candidateLevel = Math.max(0, normalizeNonNegativeInt(card.level, 0));
        if (activeLevel >= 4) return false;
        return candidateLevel >= activeLevel;
      }

      function getEligibleCatalogCards(assetDeck, pool, avoidCardIds = []) {
        const avoided = new Set(avoidCardIds.map(id => normalizeId(id, '')).filter(Boolean));
        return catalog
          .filter(card => Array.isArray(card.pools) && card.pools.includes(pool))
          .filter(card => !avoided.has(normalizeId(card.id, '')))
          .filter(card => !findActiveUniqueRef(assetDeck, createCardInstance(card, 'eligibility')))
          .filter(card => isSkillCardOfferEligible(assetDeck, card));
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

      function createOfferChoices(pool, seed, avoidCardIds = [], assetDeckInput = null) {
        const assetDeck = normalizeAssetDeckState(assetDeckInput);
        const candidates = getEligibleCatalogCards(assetDeck, pool, avoidCardIds);
        const random = mulberry32(hashStringToSeed(seed));
        const selected = [];
        const selectedIds = new Set();

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
          selected.push(picked);
          selectedIds.add(normalizeId(picked.id, ''));
        }

        return selected.map(card => createCardInstance(card, `offer:${pool}`));
      }

      function findSkillCatalogCard(skillKey, level) {
        const normalizedSkillKey = normalizeSkillKey(skillKey);
        const normalizedLevel = Math.max(1, Math.min(4, normalizeNonNegativeInt(level, 1)));
        return catalog.find(card => (
          normalizeId(card.kind, '').toLowerCase() === 'skill'
          && normalizeSkillKey(card.skillKey || inferSkillKeyFromModifiers(card.modifiers)) === normalizedSkillKey
          && Math.max(0, normalizeNonNegativeInt(card.level, 0)) === normalizedLevel
        )) || null;
      }

      function createUpgradedSkillCard(existingCard, candidateCard, nextLevel, source = 'skill_upgrade') {
        const skillKey = getCardSkillKey(candidateCard) || getCardSkillKey(existingCard);
        const catalogCard = findSkillCatalogCard(skillKey, nextLevel);
        const base = catalogCard || {
          ...candidateCard,
          level: nextLevel,
          modifiers: Array.isArray(candidateCard.modifiers)
            ? candidateCard.modifiers.map(modifier => {
                if (!modifier || typeof modifier !== 'object' || !/^skill_/.test(normalizeId(modifier.type, ''))) return modifier;
                return { ...modifier, value: nextLevel };
              })
            : []
        };
        return {
          ...createCardInstance(base, source),
          instanceId: existingCard.instanceId,
          addedAt: existingCard.addedAt || candidateCard.addedAt || normalizeNonNegativeInt(now(), 0)
        };
      }

      function resolveSkillCardSelection(assetDeck, card) {
        const skillKey = getCardSkillKey(card);
        if (!skillKey) return null;
        const active = findActiveSkillRef(assetDeck, skillKey);
        if (!active) return null;

        const activeLevel = Math.max(0, normalizeNonNegativeInt(active.card.level, 0));
        const candidateLevel = Math.max(0, normalizeNonNegativeInt(card.level, 0));
        if (activeLevel >= 4) {
          clearCurrentPendingOffer(assetDeck);
          assetDeck.pending_replace = null;
          pushHistory(assetDeck, { kind: 'choose_card', cardId: card.cardId, skillKey, status: 'skill_max_ignored' });
          return result(assetDeck, true, 'skill_max_ignored', { card: active.card, consumed: card });
        }
        if (candidateLevel < activeLevel) {
          clearCurrentPendingOffer(assetDeck);
          assetDeck.pending_replace = null;
          pushHistory(assetDeck, { kind: 'choose_card', cardId: card.cardId, skillKey, status: 'skill_lower_ignored' });
          return result(assetDeck, true, 'skill_lower_ignored', { card: active.card, consumed: card });
        }

        const nextLevel = candidateLevel === activeLevel
          ? Math.min(4, activeLevel + 1)
          : Math.min(4, candidateLevel);
        const upgraded = createUpgradedSkillCard(active.card, card, nextLevel, candidateLevel === activeLevel ? 'skill_merge' : 'skill_replace');
        assetDeck[active.listKey][active.index] = upgraded;
        clearCurrentPendingOffer(assetDeck);
        assetDeck.pending_replace = null;
        pushHistory(assetDeck, {
          kind: 'choose_card',
          cardId: card.cardId,
          skillKey,
          fromLevel: activeLevel,
          toLevel: nextLevel,
          status: candidateLevel === activeLevel ? 'skill_merged' : 'skill_upgraded'
        });
        return result(assetDeck, true, candidateLevel === activeLevel ? 'skill_merged' : 'skill_upgraded', {
          card: upgraded,
          consumed: card,
          fromLevel: activeLevel,
          toLevel: nextLevel
        });
      }

      function pushHistory(assetDeck, event) {
        assetDeck.history = [
          ...assetDeck.history,
          {
            at: normalizeNonNegativeInt(now(), 0),
            ...compactHistoryEvent(event)
          }
        ].slice(-HISTORY_LIMIT);
      }

      function result(assetDeck, ok, code, extra = {}) {
        return {
          ok,
          code,
          assetDeck: normalizeAssetDeckState(assetDeck),
          ...extra
        };
      }

      function chooseOfferCard(assetDeck, payload) {
        const offer = assetDeck.pending_offer;
        if (!offer) return result(assetDeck, false, 'no_pending_offer');
        const requestedId = normalizeId(payload.choiceId || payload.cardId, '');
        const requestedIndex = Number.isFinite(Number(payload.choiceIndex)) ? Math.round(Number(payload.choiceIndex)) : -1;
        const card = offer.choices.find(choice => choice.instanceId === requestedId || choice.cardId === requestedId)
          || offer.choices[requestedIndex]
          || null;
        if (!card) return result(assetDeck, false, 'invalid_choice');

        const activeUnique = findActiveUniqueRef(assetDeck, card);
        if (activeUnique) {
          clearCurrentPendingOffer(assetDeck);
          assetDeck.pending_replace = null;
          pushHistory(assetDeck, {
            kind: 'choose_card',
            cardId: card.cardId,
            status: 'unique_already_active'
          });
          return result(assetDeck, true, 'unique_already_active', { card: activeUnique.card, consumed: card });
        }

        const skillResult = resolveSkillCardSelection(assetDeck, card);
        if (skillResult) return skillResult;

        const allowedSlots = getAllowedSlotsForCard(card);
        const preferredSlot = normalizeEnum(payload.slotType, SLOT_TYPES, allowedSlots[0] || 'general');
        const slotType = allowedSlots.includes(preferredSlot) ? preferredSlot : allowedSlots[0];
        if (!slotType) return result(assetDeck, false, 'invalid_slot');

        const targetListKey = slotType === 'void' ? 'active_void_cards' : 'active_general_cards';
        const targetLimit = slotType === 'void' ? assetDeck.void_slots_unlocked : assetDeck.general_slots_unlocked;
        if (assetDeck[targetListKey].length >= targetLimit) {
          assetDeck.pending_replace = {
            card,
            allowedSlots,
            reason: 'slot_full',
            confirm_destroy: false
          };
          clearCurrentPendingOffer(assetDeck);
          pushHistory(assetDeck, { kind: 'choose_card', cardId: card.cardId, status: 'pending_replace' });
          return result(assetDeck, true, 'pending_replace', { card });
        }

        assetDeck[targetListKey] = [...assetDeck[targetListKey], card];
        clearCurrentPendingOffer(assetDeck);
        assetDeck.pending_replace = null;
        pushHistory(assetDeck, { kind: 'choose_card', cardId: card.cardId, slotType, status: 'equipped' });
        return result(assetDeck, true, 'equipped', { card, slotType });
      }

      function replaceCard(assetDeck, payload) {
        const pending = assetDeck.pending_replace;
        if (!pending) return result(assetDeck, false, 'no_pending_replace');
        const slotType = normalizeEnum(payload.slotType, SLOT_TYPES, pending.allowedSlots[0] || 'general');
        if (!pending.allowedSlots.includes(slotType)) return result(assetDeck, false, 'invalid_slot');
        const targetListKey = slotType === 'void' ? 'active_void_cards' : 'active_general_cards';
        const targetIndex = Math.max(0, Math.round(Number(payload.targetIndex) || 0));
        if (!assetDeck[targetListKey][targetIndex]) return result(assetDeck, false, 'invalid_target');
        const removed = assetDeck[targetListKey][targetIndex];
        if (isProtectedCard(removed) && payload.confirmDestroy !== true && payload.confirm_destroy !== true) {
          assetDeck.pending_replace = {
            ...pending,
            confirm_destroy: true,
            confirm_target: {
              slotType,
              targetIndex,
              removedCardId: removed.cardId
            }
          };
          pushHistory(assetDeck, {
            kind: 'replace_card',
            cardId: pending.card.cardId,
            removedCardId: removed.cardId,
            slotType,
            status: 'requires_destroy_confirm'
          });
          return result(assetDeck, false, 'requires_destroy_confirm', {
            card: pending.card,
            removed,
            slotType,
            targetIndex
          });
        }
        assetDeck[targetListKey][targetIndex] = pending.card;
        assetDeck.pending_replace = null;
        if (!assetDeck.pending_offer) promoteNextPendingOffer(assetDeck);
        pushHistory(assetDeck, {
          kind: 'replace_card',
          cardId: pending.card.cardId,
          removedCardId: removed.cardId,
          slotType
        });
        return result(assetDeck, true, 'replaced', { card: pending.card, removed, slotType, targetIndex });
      }

      function applyAssetDeckCommand(assetDeckInput, commandInput, options = {}) {
        const assetDeck = normalizeAssetDeckState(assetDeckInput);
        const command = commandInput && typeof commandInput === 'object' ? commandInput : {};
        const payload = command.payload && typeof command.payload === 'object' ? command.payload : {};
        const kind = normalizeId(command.kind || command.type, '').toLowerCase();
        if (!kind) return result(assetDeck, false, 'missing_command');

        if (kind === 'grant_asset') {
          const amount = normalizeNonNegativeInt(payload.amount, 0);
          assetDeck.asset_count += amount;
          const source = payload.source && typeof payload.source === 'object' && !Array.isArray(payload.source)
            ? compactHistorySource(payload.source)
            : null;
          const requestId = normalizeId(payload.requestId || command.requestId, '');
          pushHistory(assetDeck, {
            kind,
            amount,
            ...(requestId ? { requestId } : {}),
            ...(source ? { source } : {})
          });
          return result(assetDeck, true, 'asset_granted', { amount });
        }

        if (kind === 'unlock_slot') {
          const cost = getUnlockCost(assetDeck);
          if (cost == null) return result(assetDeck, false, 'slot_cap_reached');
          if (assetDeck.asset_count < cost) return result(assetDeck, false, 'not_enough_asset', { cost });
          assetDeck.asset_count -= cost;
          assetDeck.general_slots_unlocked += 1;
          pushHistory(assetDeck, { kind, cost, general_slots_unlocked: assetDeck.general_slots_unlocked });
          return result(assetDeck, true, 'slot_unlocked', { cost });
        }

        if (kind === 'open_offer') {
          const pool = normalizeEnum(payload.pool, POOL_VALUES, 'low');
          const cost = normalizeNonNegativeInt(payload.cost, config.poolCosts[pool] || 0);
          if (assetDeck.asset_count < cost) return result(assetDeck, false, 'not_enough_asset', { cost });
          const seed = normalizeId(payload.seed || options.seed, `asset:${pool}:${assetDeck.history.length}`);
          const choices = createOfferChoices(pool, seed, [], assetDeck);
          if (!choices.length) return result(assetDeck, false, 'empty_pool', { pool });
          assetDeck.asset_count -= cost;
          const offer = {
            id: `offer:${pool}:${hashStringToSeed(seed)}`,
            pool,
            cost,
            refreshCount: 0,
            freeRefreshUsed: 0,
            choices,
            createdAt: normalizeNonNegativeInt(now(), 0)
          };
          enqueueOrActivatePendingOffer(assetDeck, offer);
          assetDeck.pending_replace = null;
          const source = payload.source && typeof payload.source === 'object' && !Array.isArray(payload.source)
            ? compactHistorySource(payload.source)
            : null;
          const requestId = normalizeId(payload.requestId || command.requestId, '');
          pushHistory(assetDeck, {
            kind,
            pool,
            cost,
            ...(requestId ? { requestId } : {}),
            ...(source ? { source } : {})
          });
          return result(assetDeck, true, 'offer_opened', { offer });
        }

        if (kind === 'refresh_offer') {
          const offer = assetDeck.pending_offer;
          if (!offer) return result(assetDeck, false, 'no_pending_offer');
          const maxRefresh = normalizeNonNegativeInt(config.maxRefreshByPool[offer.pool], 1);
          if (offer.refreshCount >= maxRefresh) return result(assetDeck, false, 'refresh_cap_reached', { maxRefresh });
          const freeLimit = normalizeNonNegativeInt(config.freeRefreshByPool[offer.pool], 0);
          const free = offer.freeRefreshUsed < freeLimit;
          const cost = free ? 0 : normalizeNonNegativeInt(config.refreshCosts[offer.pool], 0);
          if (assetDeck.asset_count < cost) return result(assetDeck, false, 'not_enough_asset', { cost });
          const seed = normalizeId(payload.seed || options.seed, `${offer.id}:refresh:${offer.refreshCount + 1}`);
          const choices = createOfferChoices(offer.pool, seed, offer.choices.map(card => card.cardId), assetDeck);
          if (!choices.length) return result(assetDeck, false, 'empty_pool', { pool: offer.pool });
          assetDeck.asset_count -= cost;
          assetDeck.pending_offer = {
            ...offer,
            refreshCount: offer.refreshCount + 1,
            freeRefreshUsed: offer.freeRefreshUsed + (free ? 1 : 0),
            choices
          };
          pushHistory(assetDeck, { kind, pool: offer.pool, cost, free });
          return result(assetDeck, true, 'offer_refreshed', { offer: assetDeck.pending_offer, cost, free });
        }

        if (kind === 'choose_card') return chooseOfferCard(assetDeck, payload);
        if (kind === 'replace_card') return replaceCard(assetDeck, payload);

        if (kind === 'debug_reset') {
          return result(makeDefaultAssetDeckState(), true, 'debug_reset');
        }

        return result(assetDeck, false, 'unknown_command');
      }

      return {
        getConfig: () => deepClone(config),
        getCatalog: () => deepClone(catalog),
        makeDefaultAssetDeckState,
        normalizeAssetDeckState,
        normalizeAssetCardInstance,
        normalizePendingOffer,
        normalizePendingReplace,
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
