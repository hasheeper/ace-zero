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

      function formatSignedNumber(value) {
        const numeric = roundThree(value);
        return `${numeric > 0 ? '+' : ''}${numeric}`;
      }

      function formatPercent(value) {
        const numeric = Math.round(roundThree(value) * 100);
        return `${numeric > 0 ? '+' : ''}${numeric}%`;
      }

      function romanLevel(level) {
        return ['0', 'I', 'II', 'III', 'IV'][Math.max(0, Math.min(4, Math.round(normalizeNumber(level, 0))))] || String(level || '');
      }

      function normalizeAssetDeck(assetDeckInput) {
        if (assetDeckModule && typeof assetDeckModule.normalizeAssetDeckState === 'function') {
          return assetDeckModule.normalizeAssetDeckState(assetDeckInput);
        }
        const source = assetDeckInput && typeof assetDeckInput === 'object' && !Array.isArray(assetDeckInput)
          ? assetDeckInput
          : {};
        return {
          slots: {
            general: Math.max(0, Math.round(normalizeNumber(source.slots && source.slots.general, 4))),
            void: Math.max(0, Math.round(normalizeNumber(source.slots && source.slots.void, 2)))
          },
          bag: {
            general: normalizeList(source.bag && source.bag.general).map(card => clone(card, {})),
            void: normalizeList(source.bag && source.bag.void).map(card => clone(card, {}))
          },
          offer: source.offer || null
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

      function buildEffectText(card, meta, modifiers) {
        const explicit = normalizeId((card && card.effectText) || meta.effectText);
        if (explicit) return explicit;
        const kind = normalizeKey((card && card.kind) || meta.kind, 'numeric');
        const skillKey = normalizeKey((card && card.skillKey) || meta.skillKey);
        const level = Math.max(0, Math.round(normalizeNumber((card && (card.level ?? card.lv)) ?? meta.level, 0)));
        if (kind === 'skill' && skillKey) return `${skillKey.replace(/_/g, ' ')} ${romanLevel(level)}`;
        if (kind === 'upgrade') {
          const target = normalizeKey((card && card.upgradeTargetSkillKey) || (card && card.upgradeTarget) || meta.upgradeTargetSkillKey);
          return target ? `${target.replace(/_/g, ' ')} 升级 +1` : '已装配技能升级 +1';
        }
        const parts = [];
        normalizeList(modifiers).forEach(modifier => {
          const type = normalizeKey(modifier && (modifier.type || modifier.kind));
          const value = normalizeNumber(modifier && modifier.value, 0);
          const key = normalizeKey(modifier && (modifier.key || modifier.skillKey));
          if (type === 'mana_max_flat') parts.push(`Mana Max ${formatSignedNumber(value)}`);
          else if (type === 'skill_cost_flat') parts.push(`Mana 消耗 ${formatSignedNumber(value)}`);
          else if (type === 'skill_cost_pct') parts.push(`Mana 消耗 ${formatPercent(value)}`);
          else if (type === 'force_power_flat') parts.push(`${key ? `${key.replace(/_/g, ' ')} ` : ''}效果 ${formatSignedNumber(value)}`);
          else if (type === 'force_power_pct' || type === 'all_force_power_bonus') parts.push(`${key ? `${key.replace(/_/g, ' ')} ` : ''}效果 ${formatPercent(value)}`);
          else if (type === 'reward_pct') parts.push(`小游戏效果 ${formatPercent(value)}`);
          else if (type === 'risk_reward_roll') parts.push('技能释放时随机 Mana / 效果浮动');
          else if (type === 'street_force_chance_flat') {
            const chance = formatPercent(modifier.chance || 0);
            const forceType = normalizeKey(modifier.forceType || modifier.system, 'force').replace(/_/g, ' ');
            parts.push(`每街 ${chance} 触发 ${forceType} ${formatSignedNumber(value)}`);
          } else if (type === 'skill_level_bonus') {
            parts.push(`Texas 技能等级 ${formatSignedNumber(value)}`);
          }
        });
        return parts.slice(0, 2).join(' / ') || kind.replace(/_/g, ' ') || 'Asset effect';
      }

      function buildStatusTags(card, meta, effective) {
        const tags = [];
        const kind = normalizeKey((card && card.kind) || meta.kind);
        const gameTags = getCardTags(card, 'gameTags');
        const slotTags = getCardTags(card, 'slotTags');
        const unique = Boolean((card && card.unique) ?? meta.unique);
        const consumable = Boolean((card && card.consumable) ?? meta.consumable) || kind === 'upgrade';
        if (unique) tags.push('唯一');
        else if (kind === 'skill') tags.push('技能唯一');
        else tags.push('可叠加');
        if (consumable) tags.push('消耗');
        if (slotTags.includes('void')) tags.push('VOID槽');
        if (gameTags.includes('texas-holdem') || gameTags.includes('texas')) tags.push('Texas');
        if (gameTags.some(tag => tag === 'blackjack' || tag === 'dice' || tag === 'dragon-tiger')) tags.push('小游戏');
        const target = normalizeKey((card && card.upgradeTargetSkillKey) || (card && card.upgradeTarget) || meta.upgradeTargetSkillKey);
        if (target) tags.push(`目标:${target.replace(/_/g, ' ')}`);
        if (!effective) tags.push('未生效');
        return tags.slice(0, 5);
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
        const effective = isCardEffectiveForGame(card, gameId);
        return {
          cardId,
          name: normalizeId((card && card.name) || meta.name, cardId || 'Asset Card'),
          rarity: normalizeKey((card && card.rarity) || meta.rarity, 'bronze'),
          kind: normalizeKey((card && card.kind) || meta.kind, 'numeric'),
          system: normalizeKey((card && card.system) || meta.system),
          skillKey: normalizeKey((card && card.skillKey) || meta.skillKey),
          level: Math.max(0, Math.round(normalizeNumber((card && (card.level ?? card.lv)) ?? meta.level, 0))),
          targetTags: normalizeList((card && card.targetTags) || meta.targetTags).map(tag => normalizeId(tag)).filter(Boolean),
          gameTags: getCardTags(card, 'gameTags'),
          slotTags: getCardTags(card, 'slotTags'),
          slotType,
          slotIndex: index,
          effective,
          unique: Boolean((card && card.unique) ?? meta.unique),
          consumable: Boolean((card && card.consumable) ?? meta.consumable),
          upgradeTargetSkillKey: normalizeKey((card && card.upgradeTargetSkillKey) || (card && card.upgradeTarget) || meta.upgradeTargetSkillKey),
          effectText: buildEffectText(card, meta, modifiers),
          statusTags: buildStatusTags(card, meta, effective),
          modifiers
        };
      }

      function summarizePendingOffer(offer, gameId) {
        if (!offer || typeof offer !== 'object' || Array.isArray(offer)) return null;
        return {
          id: normalizeId(offer.id),
          floor: normalizeId(offer.floor),
          pool: normalizeKey(offer.pool, 'low'),
          settled: offer.settled === true,
          choices: normalizeList(offer.choices).map((card, index) => summarizeCard(card, 'offer', index, gameId)),
          reroll: normalizeList(offer.reroll).map((card, index) => summarizeCard(card, 'offer', index, gameId))
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
        const generalCards = normalizeList(normalizedDeck.bag && normalizedDeck.bag.general)
          .map((card, index) => summarizeCard(card, 'general', index, gameId));
        const voidCards = normalizeList(normalizedDeck.bag && normalizedDeck.bag.void)
          .map((card, index) => summarizeCard(card, 'void', index, gameId));
        const allCards = generalCards.concat(voidCards);
        const effectiveCards = allCards.filter(card => card.effective);
        const compiled = buildOptions.compiledModifiers || compileForGame(normalizedDeck, gameId, buildOptions.adapter);
        const gameplay = summarizeCompiledModifiers(compiled);

        const summary = {
          gameId,
          mode,
          points: Math.max(0, Math.round(normalizeNumber(buildOptions.assetPoints ?? buildOptions.points, 0))),
          slots: {
            generalUsed: generalCards.length,
            generalMax: Math.max(0, Math.round(normalizeNumber(normalizedDeck.slots && normalizedDeck.slots.general, 0))),
            voidUsed: voidCards.length,
            voidMax: Math.max(0, Math.round(normalizeNumber(normalizedDeck.slots && normalizedDeck.slots.void, 0)))
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
            offer: summarizePendingOffer(normalizedDeck.offer, gameId)
          },
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
