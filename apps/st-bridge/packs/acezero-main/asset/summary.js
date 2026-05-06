/**
 * ACEZERO ASSET DECK SUMMARY
 *
 * Pure display projection for long-term AssetDeck state. This module must not
 * mutate MVU state or execute AssetDeck commands; UI surfaces can share this
 * output instead of parsing cards/modifiers independently.
 */
(function initAceZeroAssetDeckSummary(global) {
  'use strict';

  global.ACE0AssetDeckSummary = {
    create(options = {}) {
      const data = options.data || global.ACE0AssetDeckData || {};
      const assetDeckModule = options.assetDeck || global.ACE0Modules?.assetDeck || null;
      const catalog = Array.isArray(data.ASSET_CARD_CATALOG) ? data.ASSET_CARD_CATALOG : [];
      const catalogById = new Map(catalog.map(card => [normalizeId(card.id), card]).filter(([id]) => id));
      const adapter = options.adapter || global.AssetDeckAdapter || null;

      function normalizeId(value, fallback = '') {
        const normalized = value == null ? '' : String(value).trim();
        return normalized || fallback;
      }

      function normalizeKey(value, fallback = '') {
        return normalizeId(value, fallback).toLowerCase().replace(/\s+/g, '_');
      }

      function normalizeGameId(value) {
        const key = normalizeKey(value || 'texas-holdem').replace(/_/g, '-');
        if (key === 'texas' || key === 'holdem' || key === 'poker') return 'texas-holdem';
        if (key === 'black-jack') return 'blackjack';
        if (key === 'dice-game') return 'dice';
        if (key === 'dragon-tiger') return 'dragon-tiger';
        return key || 'texas-holdem';
      }

      function getGameAliases(gameId) {
        const normalized = normalizeGameId(gameId);
        const aliases = {
          'texas-holdem': ['texas', 'poker', 'holdem'],
          blackjack: ['blackjack', 'black_jack', 'bj'],
          dice: ['dice', 'dice-game', 'dice_game', 'sicbo', 'sic_bo'],
          'dragon-tiger': ['dragon-tiger', 'dragon_tiger', 'dt'],
          mahjong: ['mahjong', 'majiang', 'riichi'],
          sanma: ['sanma', 'riichi-3p-sanma', 'riichi_3p_sanma']
        }[normalized] || [];
        return [normalized].concat(aliases).map(normalizeKey);
      }

      function clone(value, fallback = null) {
        if (value == null) return fallback;
        try {
          return JSON.parse(JSON.stringify(value));
        } catch (_) {
          return fallback;
        }
      }

      function normalizeList(value) {
        return Array.isArray(value) ? value : [];
      }

      function normalizeNumber(value, fallback = 0) {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : fallback;
      }

      function roundThree(value) {
        return Math.round(normalizeNumber(value, 0) * 1000) / 1000;
      }

      function normalizeAssetDeck(assetDeckInput) {
        if (assetDeckModule && typeof assetDeckModule.normalizeAssetDeckState === 'function') {
          return assetDeckModule.normalizeAssetDeckState(assetDeckInput);
        }
        const source = assetDeckInput && typeof assetDeckInput === 'object' && !Array.isArray(assetDeckInput)
          ? assetDeckInput
          : {};
        return {
          version: Math.max(1, Math.round(normalizeNumber(source.version, 1))),
          asset_count: Math.max(0, Math.round(normalizeNumber(source.asset_count ?? source.assetCount, 0))),
          general_slots_unlocked: Math.max(0, Math.round(normalizeNumber(source.general_slots_unlocked, 4))),
          void_slots_unlocked: Math.max(0, Math.round(normalizeNumber(source.void_slots_unlocked, 2))),
          active_general_cards: normalizeList(source.active_general_cards || source.activeGeneralCards).map(card => clone(card, {})),
          active_void_cards: normalizeList(source.active_void_cards || source.activeVoidCards).map(card => clone(card, {})),
          pending_offer: source.pending_offer || source.pendingOffer || null,
          pending_offer_queue: normalizeList(source.pending_offer_queue || source.pendingOfferQueue).map(offer => clone(offer, {})),
          pending_replace: source.pending_replace || source.pendingReplace || null,
          history: normalizeList(source.history).map(item => clone(item, {})),
          debug: source.debug && typeof source.debug === 'object' && !Array.isArray(source.debug) ? clone(source.debug, {}) : {}
        };
      }

      function getCardMeta(card) {
        const cardId = normalizeId(card && (card.cardId || card.id));
        return catalogById.get(cardId) || {};
      }

      function getCardTags(card, key) {
        const meta = getCardMeta(card);
        return normalizeList((card && card[key]) || meta[key]).map(tag => normalizeKey(tag)).filter(Boolean);
      }

      function isCardEffectiveForGame(card, gameId) {
        const gameTags = getCardTags(card, 'gameTags');
        if (!gameTags.length) return true;
        if (gameTags.includes('any') || gameTags.includes('general')) return true;
        const aliases = getGameAliases(gameId);
        return gameTags.some(tag => aliases.includes(tag));
      }

      function summarizeCard(card, slotType, index, gameId) {
        const meta = getCardMeta(card);
        const cardId = normalizeId((card && (card.cardId || card.id)) || meta.id);
        const modifiers = normalizeList((card && card.modifiers) || meta.modifiers).map(modifier => clone(modifier, {}));
        return {
          instanceId: normalizeId(card && card.instanceId),
          cardId,
          name: normalizeId((card && card.name) || meta.name, cardId || 'Asset Card'),
          rarity: normalizeKey((card && card.rarity) || meta.rarity, 'bronze'),
          kind: normalizeKey((card && card.kind) || meta.kind, 'numeric'),
          system: normalizeKey((card && card.system) || meta.system),
          skillKey: normalizeKey((card && card.skillKey) || meta.skillKey),
          level: Math.max(0, Math.round(normalizeNumber((card && card.level) ?? meta.level, 0))),
          targetTags: normalizeList((card && card.targetTags) || meta.targetTags).map(tag => normalizeId(tag)).filter(Boolean),
          gameTags: getCardTags(card, 'gameTags'),
          slotTags: getCardTags(card, 'slotTags'),
          slotType,
          slotIndex: index,
          effective: isCardEffectiveForGame(card, gameId),
          modifiers
        };
      }

      function summarizePendingOffer(offer, gameId) {
        if (!offer || typeof offer !== 'object' || Array.isArray(offer)) return null;
        return {
          id: normalizeId(offer.id),
          pool: normalizeKey(offer.pool, 'low'),
          cost: Math.max(0, Math.round(normalizeNumber(offer.cost, 0))),
          refreshCount: Math.max(0, Math.round(normalizeNumber(offer.refreshCount, 0))),
          freeRefreshUsed: Math.max(0, Math.round(normalizeNumber(offer.freeRefreshUsed, 0))),
          choices: normalizeList(offer.choices).map((card, index) => summarizeCard(card, 'offer', index, gameId))
        };
      }

      function summarizePendingReplace(pendingReplace, gameId) {
        if (!pendingReplace || typeof pendingReplace !== 'object' || Array.isArray(pendingReplace)) return null;
        const card = pendingReplace.card || pendingReplace.candidate || null;
        return {
          card: card ? summarizeCard(card, 'replace', 0, gameId) : null,
          allowedSlots: normalizeList(pendingReplace.allowedSlots).map(slot => normalizeKey(slot)).filter(Boolean),
          reason: normalizeId(pendingReplace.reason, 'slot_full'),
          confirmDestroy: pendingReplace.confirm_destroy === true
        };
      }

      function addSourceIds(target, sources) {
        normalizeList(sources).forEach(source => {
          const cardId = normalizeId(source && source.cardId);
          if (cardId && !target.includes(cardId)) target.push(cardId);
        });
      }

      function summarizeFlatPctBucket(bucket) {
        const out = [];
        if (!bucket || typeof bucket !== 'object') return out;
        const globalFlat = roundThree(bucket.globalFlat);
        const globalPct = roundThree(bucket.globalPct);
        if (globalFlat || globalPct) {
          const sourceIds = [];
          addSourceIds(sourceIds, bucket.sources);
          out.push({ scope: 'global', flat: globalFlat, pct: globalPct, sourceIds });
        }
        ['bySkill', 'bySystem', 'byOwner', 'byKey'].forEach(scopeName => {
          const scoped = bucket[scopeName] && typeof bucket[scopeName] === 'object' ? bucket[scopeName] : {};
          Object.keys(scoped).sort().forEach(key => {
            const entry = scoped[key] || {};
            const flat = roundThree(entry.flat);
            const pct = roundThree(entry.pct);
            if (!flat && !pct) return;
            const sourceIds = [];
            addSourceIds(sourceIds, entry.sources);
            out.push({ scope: scopeName.replace(/^by/, '').toLowerCase(), key, flat, pct, sourceIds });
          });
        });
        normalizeList(bucket.scoped).forEach(entry => {
          const flat = roundThree(entry && entry.flat);
          const pct = roundThree(entry && entry.pct);
          if (!flat && !pct) return;
          const sourceIds = [];
          addSourceIds(sourceIds, entry && entry.sources);
          out.push({
            scope: normalizeKey(entry && entry.scope, 'team') || 'team',
            ownerIds: normalizeList(entry && entry.ownerIds).map(item => normalizeKey(item)).filter(Boolean),
            teamTags: normalizeList(entry && entry.teamTags).map(item => normalizeKey(item)).filter(Boolean),
            flat,
            pct,
            sourceIds
          });
        });
        return out;
      }

      function summarizeCompiledModifiers(compiled) {
        const modifierSummary = {
          skillLevels: [],
          mana: [],
          cost: [],
          forcePower: [],
          passive: [],
          miniGame: {}
        };
        if (!compiled || typeof compiled !== 'object') return modifierSummary;

        modifierSummary.skillLevels = normalizeList(compiled.skillLevelEntries).map(entry => ({
          skillKey: normalizeKey(entry && entry.skillKey),
          level: Math.max(0, Math.round(normalizeNumber(entry && entry.level, 0))),
          system: normalizeKey(entry && entry.system),
          targetTags: normalizeList(entry && entry.targetTags).map(tag => normalizeId(tag)).filter(Boolean),
          cardId: normalizeId(entry && entry.cardId)
        })).filter(entry => entry.skillKey && entry.level);

        if (!modifierSummary.skillLevels.length && compiled.skillLevelBySkill && typeof compiled.skillLevelBySkill === 'object') {
          modifierSummary.skillLevels = Object.keys(compiled.skillLevelBySkill).sort().map(skillKey => ({
            skillKey,
            level: Math.max(0, Math.round(normalizeNumber(compiled.skillLevelBySkill[skillKey], 0))),
            system: '',
            targetTags: [],
            cardId: ''
          })).filter(entry => entry.level);
        }

        const mana = compiled.manaMax && typeof compiled.manaMax === 'object' ? compiled.manaMax : null;
        if (mana) {
          const globalFlat = roundThree(mana.globalFlat);
          if (globalFlat) {
            const sourceIds = [];
            addSourceIds(sourceIds, mana.sources);
            modifierSummary.mana.push({ scope: 'global', flat: globalFlat, sourceIds });
          }
          const byOwner = mana.byOwner && typeof mana.byOwner === 'object' ? mana.byOwner : {};
          Object.keys(byOwner).sort().forEach(ownerId => {
            const flat = roundThree(byOwner[ownerId]);
            if (flat) modifierSummary.mana.push({ scope: 'owner', key: ownerId, flat, sourceIds: [] });
          });
          normalizeList(mana.scoped).forEach(entry => {
            const flat = roundThree(entry && entry.flat);
            if (!flat) return;
            const sourceIds = [];
            addSourceIds(sourceIds, entry && entry.sources);
            modifierSummary.mana.push({
              scope: normalizeKey(entry && entry.scope, 'team') || 'team',
              ownerIds: normalizeList(entry && entry.ownerIds).map(item => normalizeKey(item)).filter(Boolean),
              teamTags: normalizeList(entry && entry.teamTags).map(item => normalizeKey(item)).filter(Boolean),
              flat,
              sourceIds
            });
          });
        }

        modifierSummary.cost = summarizeFlatPctBucket(compiled.skillCost);
        modifierSummary.forcePower = summarizeFlatPctBucket(compiled.forcePower);
        modifierSummary.passive = normalizeList(compiled.passiveTriggers).map(entry => ({
          cardId: normalizeId(entry && entry.cardId),
          type: normalizeKey(entry && entry.type),
          trigger: normalizeKey(entry && entry.trigger),
          key: normalizeKey(entry && entry.key),
          system: normalizeKey(entry && entry.system),
          ownerId: entry && entry.ownerId != null ? String(entry.ownerId) : '',
          value: roundThree(entry && entry.value)
        })).filter(entry => entry.cardId || entry.type);

        const miniGame = compiled.miniGame && typeof compiled.miniGame === 'object' ? compiled.miniGame : {};
        ['reward', 'payout', 'risk', 'odds'].forEach(bucketName => {
          const entries = summarizeFlatPctBucket(miniGame[bucketName]);
          if (entries.length) modifierSummary.miniGame[bucketName] = entries;
        });

        return modifierSummary;
      }

      function compileForGame(assetDeck, gameId, providedAdapter) {
        const activeAdapter = providedAdapter || adapter || global.AssetDeckAdapter || null;
        if (!activeAdapter || typeof activeAdapter.compile !== 'function') return null;
        return activeAdapter.compile({ assetDeck, gameId });
      }

      function buildAssetDeckSummary(assetDeckInput, buildOptions = {}) {
        const gameId = normalizeGameId(buildOptions.gameId || 'texas-holdem');
        const mode = normalizeKey(buildOptions.mode, 'host') === 'debug' ? 'debug' : 'host';
        const normalizedDeck = normalizeAssetDeck(assetDeckInput);
        const generalCards = normalizeList(normalizedDeck.active_general_cards)
          .map((card, index) => summarizeCard(card, 'general', index, gameId));
        const voidCards = normalizeList(normalizedDeck.active_void_cards)
          .map((card, index) => summarizeCard(card, 'void', index, gameId));
        const allCards = generalCards.concat(voidCards);
        const effectiveCards = allCards.filter(card => card.effective);
        const compiled = buildOptions.compiledModifiers || compileForGame(normalizedDeck, gameId, buildOptions.adapter);
        const gameplay = summarizeCompiledModifiers(compiled);

        const summary = {
          version: 1,
          gameId,
          mode,
          points: Math.max(0, Math.round(normalizeNumber(normalizedDeck.asset_count, 0))),
          slots: {
            generalUsed: generalCards.length,
            generalMax: Math.max(0, Math.round(normalizeNumber(normalizedDeck.general_slots_unlocked, 0))),
            voidUsed: voidCards.length,
            voidMax: Math.max(0, Math.round(normalizeNumber(normalizedDeck.void_slots_unlocked, 0)))
          },
          activeCards: {
            general: generalCards,
            void: voidCards,
            all: allCards,
            effective: effectiveCards,
            inactive: allCards.filter(card => !card.effective)
          },
          counts: {
            active: allCards.length,
            effective: effectiveCards.length,
            inactive: allCards.length - effectiveCards.length
          },
          pending: {
            offer: summarizePendingOffer(normalizedDeck.pending_offer, gameId),
            offerQueue: normalizeList(normalizedDeck.pending_offer_queue).map(offer => summarizePendingOffer(offer, gameId)).filter(Boolean),
            replace: summarizePendingReplace(normalizedDeck.pending_replace, gameId)
          },
          recentHistory: normalizeList(normalizedDeck.history).slice(-5).map(item => clone(item, {})),
          gameplay
        };

        if (mode === 'debug') {
          summary.debug = {
            deckDebug: clone(normalizedDeck.debug, {}),
            compiledDebug: clone(compiled && compiled.debug, { cards: [], applied: [], ignored: [] }),
            rawCompiled: clone(compiled, null)
          };
        }

        return summary;
      }

      return {
        buildAssetDeckSummary,
        isCardEffectiveForGame
      };
    }
  };

  global.ACE0Modules = global.ACE0Modules || {};
  global.ACE0Modules.assetSummary = global.ACE0AssetDeckSummary.create({
    data: global.ACE0AssetDeckData || {},
    assetDeck: global.ACE0Modules.assetDeck || null,
    adapter: global.AssetDeckAdapter || null
  });
})(typeof window !== 'undefined' ? window : globalThis);
