(function (global) {
  'use strict';

  var GAME_ALIASES = {
    'texas-holdem': ['texas', 'poker', 'holdem'],
    blackjack: ['blackjack', 'black_jack', 'bj'],
    dice: ['dice', 'dice-game', 'dice_game', 'sicbo', 'sic_bo'],
    'dragon-tiger': ['dragon-tiger', 'dragon_tiger', 'dt'],
    mahjong: ['mahjong', 'majiang', 'riichi'],
    sanma: ['sanma', 'riichi-3p-sanma', 'riichi_3p_sanma']
  };

  function cloneJson(value, fallback) {
    if (value == null) return fallback;
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (error) {
      return fallback;
    }
  }

  function normalizeKey(value) {
    return String(value == null ? '' : value).trim().toLowerCase().replace(/\s+/g, '_');
  }

  function normalizeTags(value) {
    if (!Array.isArray(value)) return [];
    return value.map(normalizeKey).filter(Boolean);
  }

  function normalizeOwnerIds(value) {
    if (value == null) return [];
    var list = Array.isArray(value) ? value : [value];
    return list
      .map(function(item) { return normalizeKey(item); })
      .filter(function(item) { return item !== ''; });
  }

  function toNumber(value, fallback) {
    var n = Number(value);
    return Number.isFinite(n) ? n : (fallback || 0);
  }

  function roundOne(value) {
    return Math.round(Number(value || 0) * 10) / 10;
  }

  function roundThree(value) {
    return Math.round(Number(value || 0) * 1000) / 1000;
  }

  function roundCost(value) {
    var n = Number(value || 0);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.max(1, Math.round(n));
  }

  function randomBetween(min, max, randomFn) {
    var low = toNumber(min, 0);
    var high = toNumber(max, low);
    if (high < low) {
      var swap = low;
      low = high;
      high = swap;
    }
    var roll = typeof randomFn === 'function' ? randomFn() : Math.random();
    return low + (high - low) * Math.max(0, Math.min(1, roll));
  }

  function makeSource(card, modifier, type, value) {
    return {
      cardId: (card && (card.cardId || card.id || card.skillKey)) || null,
      cardName: (card && card.name) || null,
      type: type || normalizeKey(modifier && (modifier.type || modifier.kind)),
      key: (modifier && (modifier.key || modifier.skillKey)) || (card && card.skillKey) || null,
      value: value != null ? value : toNumber(modifier && modifier.value, 0)
    };
  }

  function addSource(target, source) {
    if (!target || !source) return;
    if (!Array.isArray(target.sources)) target.sources = [];
    target.sources.push(source);
  }

  function addBucketValue(root, bucketName, key, flat, pct, source) {
    var normalizedKey = normalizeKey(key);
    if (!normalizedKey) return;
    if (!root[bucketName]) root[bucketName] = {};
    if (!root[bucketName][normalizedKey]) root[bucketName][normalizedKey] = { flat: 0, pct: 0, sources: [] };
    root[bucketName][normalizedKey].flat += flat || 0;
    root[bucketName][normalizedKey].pct += pct || 0;
    addSource(root[bucketName][normalizedKey], source);
  }

  function getBucketValue(root, bucketName, key) {
    var bucket = root && root[bucketName];
    var entry = bucket && bucket[normalizeKey(key)];
    return entry || { flat: 0, pct: 0, sources: [] };
  }

  function getActiveCards(assetDeck) {
    if (!assetDeck || typeof assetDeck !== 'object') return [];
    return []
      .concat(Array.isArray(assetDeck.active_general_cards) ? assetDeck.active_general_cards : [])
      .concat(Array.isArray(assetDeck.active_void_cards) ? assetDeck.active_void_cards : []);
  }

  function normalizeGameId(value) {
    var key = normalizeKey(value || 'texas-holdem').replace(/_/g, '-');
    if (key === 'dragon-tiger') return 'dragon-tiger';
    if (key === 'dice-game') return 'dice';
    if (key === 'black-jack') return 'blackjack';
    if (key === 'texas' || key === 'holdem' || key === 'poker') return 'texas-holdem';
    return key;
  }

  function getGameAliases(gameId) {
    var normalizedGameId = normalizeGameId(gameId);
    var aliases = GAME_ALIASES[normalizedGameId] || [];
    return [normalizedGameId].concat(aliases).map(normalizeKey);
  }

  function isGameCard(card, gameId) {
    var tags = normalizeTags(card && card.gameTags);
    if (!tags.length) return true;
    if (tags.indexOf('any') >= 0 || tags.indexOf('general') >= 0) return true;
    var aliases = getGameAliases(gameId || 'texas-holdem');
    return tags.some(function(tag) { return aliases.indexOf(tag) >= 0; });
  }

  function makeModifierState() {
    return {
      manaMax: { globalFlat: 0, byOwner: {}, sources: [] },
      skillCost: { globalFlat: 0, globalPct: 0, bySkill: {}, bySystem: {}, byOwner: {}, sources: [] },
      forcePower: { globalFlat: 0, globalPct: 0, bySkill: {}, bySystem: {}, byOwner: {}, sources: [] },
      miniGame: {
        reward: { globalFlat: 0, globalPct: 0, byKey: {}, sources: [] },
        payout: { globalFlat: 0, globalPct: 0, byKey: {}, sources: [] },
        risk: { globalFlat: 0, globalPct: 0, byKey: {}, sources: [] },
        odds: { globalFlat: 0, globalPct: 0, byKey: {}, sources: [] }
      },
      passiveTriggers: [],
      riskRewards: [],
      skillLevelBySkill: {},
      skillLevelEntries: [],
      skillLevelBonus: { global: 0, sources: [] },
      debug: { cards: [], ignored: [], applied: [] }
    };
  }

  function resolveScopeKey(modifier, card) {
    return normalizeKey(
      modifier.ownerId != null ? modifier.ownerId :
      modifier.owner || modifier.target || modifier.scopeKey ||
      (card && card.ownerId != null ? card.ownerId : '')
    );
  }

  function resolveOwnerScope(modifier, card) {
    return normalizeOwnerIds(
      modifier.ownerIds || modifier.ownerId || modifier.owner ||
      modifier.targetOwnerIds || modifier.targetOwnerId ||
      (card && (card.ownerIds || card.ownerId || card.owner))
    );
  }

  function resolveTeamScope(modifier, card) {
    return normalizeTags(
      modifier.teamTags || modifier.targetTeamTags ||
      (card && (card.teamTags || card.targetTeamTags))
    );
  }

  function resolveCardScope(modifier, card) {
    var scope = normalizeKey(
      modifier.scope || modifier.assetScope || modifier.targetScope ||
      (card && (card.scope || card.assetScope || card.targetScope))
    );
    if (scope === 'table' || scope === 'global' || scope === 'all') return 'table';
    if (scope === 'owner' || scope === 'team' || scope === 'player') return scope;
    return '';
  }

  function createScopedBucket(flat, pct, source, modifier, card) {
    return {
      flat: flat || 0,
      pct: pct || 0,
      sources: source ? [source] : [],
      ownerIds: resolveOwnerScope(modifier, card),
      teamTags: resolveTeamScope(modifier, card),
      scope: resolveCardScope(modifier, card)
    };
  }

  function addScopedBucketValue(target, flat, pct, source, modifier, card) {
    if (!target.scoped) target.scoped = [];
    target.scoped.push(createScopedBucket(flat, pct, source, modifier, card));
  }

  function applyCostOrPowerModifier(root, modifier, card, flat, pct) {
    var skillKey = modifier.key || modifier.skillKey || (card && card.skillKey);
    var system = modifier.system || (card && card.system);
    var ownerKey = resolveScopeKey(modifier, card);
    var source = makeSource(card, modifier, modifier.type || modifier.kind, flat || pct || 0);
    if (skillKey) addBucketValue(root, 'bySkill', skillKey, flat, pct, source);
    else if (system) addBucketValue(root, 'bySystem', system, flat, pct, source);
    else if (ownerKey) addBucketValue(root, 'byOwner', ownerKey, flat, pct, source);
    else {
      root.globalFlat += flat || 0;
      root.globalPct += pct || 0;
      addSource(root, source);
    }
  }

  function applyMiniGameModifier(compiled, bucketName, modifier, card, flat, pct) {
    var mini = compiled && compiled.miniGame && compiled.miniGame[bucketName];
    if (!mini) return;
    var source = makeSource(card, modifier, modifier.type || modifier.kind, flat || pct || 0);
    var key = normalizeKey(modifier.key || modifier.outcome || modifier.betType || modifier.side || modifier.scopeKey);
    if (key) {
      if (!mini.byKey[key]) mini.byKey[key] = { flat: 0, pct: 0, sources: [] };
      mini.byKey[key].flat += flat || 0;
      mini.byKey[key].pct += pct || 0;
      addSource(mini.byKey[key], source);
      return;
    }
    mini.globalFlat += flat || 0;
    mini.globalPct += pct || 0;
    addSource(mini, source);
  }

  function makePassiveEntry(card, modifier, cardId, type, value) {
    var entry = {
      cardId: cardId,
      cardName: (card && card.name) || null,
      type: type,
      trigger: type,
      key: normalizeKey(modifier.key || modifier.skillKey || (card && card.skillKey)),
      system: normalizeKey(modifier.system || (card && card.system)),
      ownerId: modifier.ownerId != null ? modifier.ownerId : (card && card.ownerId != null ? card.ownerId : null),
      targetTags: normalizeTags(card && card.targetTags),
      value: value,
      source: makeSource(card, modifier, type, value)
    };
    if (modifier.chance != null) entry.chance = Math.max(0, Math.min(1, toNumber(modifier.chance, 0)));
    if (modifier.forceType != null) entry.forceType = normalizeKey(modifier.forceType);
    if (modifier.randomTarget != null) entry.randomTarget = modifier.randomTarget === true;
    if (modifier.shield != null) entry.shield = modifier.shield === true;
    if (modifier.scope != null) entry.scope = normalizeKey(modifier.scope);
    return entry;
  }

  function passiveRuntimeKey(entry, ownerId) {
    return [
      entry && entry.cardId || 'asset_card',
      entry && entry.type || 'passive',
      ownerId != null ? ownerId : 'global'
    ].join(':');
  }

  function isPassiveUsed(passiveState, key) {
    return !!(passiveState && passiveState.used && passiveState.used[key]);
  }

  function markPassiveUsed(passiveState, key, payload) {
    if (!passiveState || !key) return;
    if (!passiveState.used) passiveState.used = {};
    passiveState.used[key] = Object.assign({ used: true }, payload || {});
  }

  function passiveMatchesSkill(entry, skill) {
    if (!entry || !skill) return false;
    if (entry.key && entry.key !== normalizeKey(skill.skillKey || skill.key)) return false;
    if (entry.system && entry.system !== normalizeKey(skill.system)) return false;
    if (entry.ownerId != null && normalizeKey(entry.ownerId) !== normalizeKey(skill.ownerId)) return false;
    return true;
  }

  function getDefaultOwnerIds(context) {
    if (!context || typeof context !== 'object') return ['0'];
    var ownerIds = normalizeOwnerIds(context.assetOwnerIds || context.ownerIds || context.teamOwnerIds);
    if (ownerIds.length) return ownerIds;
    if (context.heroId != null) return normalizeOwnerIds(context.heroId);
    return ['0'];
  }

  function getDefaultTeamTags(context) {
    if (!context || typeof context !== 'object') return ['hero', 'player', 'ally'];
    var tags = normalizeTags(context.assetTeamTags || context.teamTags);
    return tags.length ? tags : ['hero', 'player', 'ally'];
  }

  function ownerMatchesScope(ownerId, scope) {
    var ownerKey = normalizeKey(ownerId);
    return ownerKey !== '' && Array.isArray(scope.ownerIds) && scope.ownerIds.indexOf(ownerKey) >= 0;
  }

  function forceMatchesTeam(force, scope) {
    var tags = []
      .concat(normalizeTags(force && force.teamTags))
      .concat(normalizeTags(force && force.tags));
    var ownerType = normalizeKey(force && (force.ownerType || force.typeTag));
    var side = normalizeKey(force && force.side);
    if (ownerType) tags.push(ownerType);
    if (side) tags.push(side);
    if (!tags.length || !Array.isArray(scope.teamTags) || !scope.teamTags.length) return false;
    return tags.some(function(tag) { return scope.teamTags.indexOf(tag) >= 0; });
  }

  function scopeMatchesActor(scope, actor, context) {
    var finalScope = scope || {};
    if (finalScope.scope === 'table') return true;
    if (ownerMatchesScope(actor && actor.ownerId, finalScope)) return true;
    if (forceMatchesTeam(actor, finalScope)) return true;

    var defaultOwnerIds = getDefaultOwnerIds(context);
    if (actor && actor.ownerId == null) return true;
    if (defaultOwnerIds.indexOf(normalizeKey(actor && actor.ownerId)) >= 0) return true;

    var defaultTeamTags = getDefaultTeamTags(context);
    return forceMatchesTeam(actor, { teamTags: defaultTeamTags });
  }

  function collectScopedValues(entries, actor, context) {
    return (Array.isArray(entries) ? entries : []).reduce(function(acc, entry) {
      if (!scopeMatchesActor(entry, actor, context)) return acc;
      acc.flat += toNumber(entry.flat, 0);
      acc.pct += toNumber(entry.pct, 0);
      acc.sources = acc.sources.concat(Array.isArray(entry.sources) ? entry.sources : []);
      return acc;
    }, { flat: 0, pct: 0, sources: [] });
  }

  function collectPctSourceValues(sourceLists, fallbackValue) {
    var values = [];
    (Array.isArray(sourceLists) ? sourceLists : []).forEach(function(list) {
      (Array.isArray(list) ? list : []).forEach(function(source) {
        if (!source || normalizeKey(source.type) !== 'skill_cost_pct') return;
        values.push(toNumber(source.value, 0));
      });
    });
    if (!values.length && fallbackValue) values.push(toNumber(fallbackValue, 0));
    return values;
  }

  function compile(input) {
    var source = input || {};
    var gameId = normalizeGameId(source.gameId || 'texas-holdem');
    var assetDeck = source.assetDeck || (source.world && source.world.assetDeck) || (source.config && source.config.assetDeck) || (source.config && source.config.world && source.config.world.assetDeck);
    var compiled = makeModifierState();
    var cards = getActiveCards(assetDeck);

    cards.forEach(function(card) {
      if (!card || typeof card !== 'object') return;
      if (!isGameCard(card, gameId)) {
        compiled.debug.ignored.push({ cardId: card.cardId || card.id || null, reason: 'game_tag_mismatch' });
        return;
      }

      var cardId = card.cardId || card.id || card.skillKey || 'asset_card';
      compiled.debug.cards.push({ cardId: cardId, skillKey: card.skillKey || null, level: card.level || null });
      var modifiers = Array.isArray(card.modifiers) ? card.modifiers : [];

      modifiers.forEach(function(modifier) {
        if (!modifier || typeof modifier !== 'object') return;
        var type = normalizeKey(modifier.type || modifier.kind);
        var value = toNumber(modifier.value, 0);
        var record = { cardId: cardId, type: type, key: modifier.key || modifier.skillKey || card.skillKey || null, value: value };

        if (type === 'skill_level') {
          var skillKey = normalizeKey(modifier.key || modifier.skillKey || card.skillKey);
          var level = Math.max(0, Math.floor(value || card.level || 0));
          if (skillKey && level > 0) {
            compiled.skillLevelBySkill[skillKey] = Math.max(compiled.skillLevelBySkill[skillKey] || 0, level);
            compiled.skillLevelEntries.push({
              skillKey: skillKey,
              level: level,
              system: normalizeKey(card.system || modifier.system),
              targetTags: normalizeTags(card.targetTags),
              cardId: cardId
            });
            compiled.debug.applied.push(record);
          }
          return;
        }

        if (type === 'skill_level_bonus') {
          var bonus = Math.max(0, Math.floor(value || 0));
          if (bonus > 0) {
            compiled.skillLevelBonus.global = Math.min(1, Math.max(compiled.skillLevelBonus.global || 0, bonus));
            compiled.skillLevelBonus.sources.push(makeSource(card, modifier, type, bonus));
            compiled.debug.applied.push(record);
          }
          return;
        }

        if (type === 'mana_max_flat') {
          var ownerKey = resolveScopeKey(modifier, card);
          var manaSource = makeSource(card, modifier, type, value);
          if (ownerKey) compiled.manaMax.byOwner[ownerKey] = (compiled.manaMax.byOwner[ownerKey] || 0) + value;
          else addScopedBucketValue(compiled.manaMax, value, 0, manaSource, modifier, card);
          compiled.debug.applied.push(record);
          return;
        }

        if (type === 'skill_cost_flat') {
          applyCostOrPowerModifier(compiled.skillCost, modifier, card, value, 0);
          compiled.debug.applied.push(record);
          return;
        }

        if (type === 'skill_cost_pct') {
          applyCostOrPowerModifier(compiled.skillCost, modifier, card, 0, value);
          compiled.debug.applied.push(record);
          return;
        }

        if (type === 'force_power_flat') {
          if (modifier.key || modifier.skillKey || modifier.system || modifier.owner || modifier.ownerId || card.owner || card.ownerId || card.scope) {
            applyCostOrPowerModifier(compiled.forcePower, modifier, card, value, 0);
          } else {
            addScopedBucketValue(compiled.forcePower, value, 0, makeSource(card, modifier, type, value), modifier, card);
          }
          compiled.debug.applied.push(record);
          return;
        }

        if (type === 'force_power_pct' || type === 'all_force_power_bonus') {
          if (type === 'all_force_power_bonus' && !(modifier.key || modifier.skillKey || modifier.system || modifier.owner || modifier.ownerId)) {
            addScopedBucketValue(compiled.forcePower, 0, value, makeSource(card, modifier, type, value), modifier, card);
          } else if (type === 'force_power_pct' && !(modifier.key || modifier.skillKey || modifier.system || modifier.owner || modifier.ownerId || card.owner || card.ownerId || card.scope)) {
            addScopedBucketValue(compiled.forcePower, 0, value, makeSource(card, modifier, type, value), modifier, card);
          } else {
            applyCostOrPowerModifier(compiled.forcePower, modifier, card, 0, value);
          }
          compiled.debug.applied.push(record);
          return;
        }

        if (type === 'reward_flat') {
          applyMiniGameModifier(compiled, 'reward', modifier, card, value, 0);
          compiled.debug.applied.push(record);
          return;
        }

        if (type === 'reward_pct') {
          applyMiniGameModifier(compiled, 'reward', modifier, card, 0, value);
          compiled.debug.applied.push(record);
          return;
        }

        if (type === 'payout_flat') {
          applyMiniGameModifier(compiled, 'payout', modifier, card, value, 0);
          compiled.debug.applied.push(record);
          return;
        }

        if (type === 'payout_pct') {
          applyMiniGameModifier(compiled, 'payout', modifier, card, 0, value);
          compiled.debug.applied.push(record);
          return;
        }

        if (type === 'risk_flat') {
          applyMiniGameModifier(compiled, 'risk', modifier, card, value, 0);
          compiled.debug.applied.push(record);
          return;
        }

        if (type === 'risk_pct') {
          applyMiniGameModifier(compiled, 'risk', modifier, card, 0, value);
          compiled.debug.applied.push(record);
          return;
        }

        if (type === 'odds_flat') {
          applyMiniGameModifier(compiled, 'odds', modifier, card, value, 0);
          compiled.debug.applied.push(record);
          return;
        }

        if (type === 'odds_pct') {
          applyMiniGameModifier(compiled, 'odds', modifier, card, 0, value);
          compiled.debug.applied.push(record);
          return;
        }

        if (
          type === 'street_start_mana_gain' ||
          type === 'street_force_chance_flat' ||
          type === 'first_skill_cost_flat' ||
          type === 'first_force_power_pct' ||
          type === 'once_per_hand_fortune_flat'
        ) {
          compiled.passiveTriggers.push(makePassiveEntry(card, modifier, cardId, type, value));
          compiled.debug.applied.push(record);
          return;
        }

        if (type === 'risk_reward_roll') {
          compiled.riskRewards.push({
            cardId: cardId,
            cardName: card && card.name || null,
            type: type,
            costPctMin: toNumber(modifier.costPctMin, 0),
            costPctMax: toNumber(modifier.costPctMax, 0),
            effectPctMin: toNumber(modifier.effectPctMin, 0),
            effectPctMax: toNumber(modifier.effectPctMax, 0),
            source: makeSource(card, modifier, type, 0)
          });
          compiled.debug.applied.push(record);
          return;
        }

        compiled.debug.ignored.push({ cardId: cardId, type: type, reason: 'unsupported_modifier' });
      });
    });

    var bonusLevel = Math.max(0, Math.floor(compiled.skillLevelBonus && compiled.skillLevelBonus.global || 0));
    if (bonusLevel > 0) {
      Object.keys(compiled.skillLevelBySkill).forEach(function(skillKey) {
        compiled.skillLevelBySkill[skillKey] = Math.min(4, Math.max(0, compiled.skillLevelBySkill[skillKey]) + bonusLevel);
      });
      compiled.skillLevelEntries = compiled.skillLevelEntries.map(function(entry) {
        var next = cloneJson(entry, entry) || entry;
        next.level = Math.min(4, Math.max(0, Number(next.level || 0)) + bonusLevel);
        next.skillLevelBonus = bonusLevel;
        return next;
      });
    }

    return compiled;
  }

  function resolveManaMax(compiled, ownerId, baseMax) {
    var mods = compiled && compiled.manaMax;
    var base = Math.max(0, Number(baseMax || 0));
    if (!mods) return { max: base, baseMax: base, flatDelta: 0 };
    var ownerKey = normalizeKey(ownerId);
    var scoped = collectScopedValues(mods.scoped, { ownerId: ownerId }, null);
    var flatDelta = toNumber(mods.globalFlat, 0) + toNumber(mods.byOwner && mods.byOwner[ownerKey], 0) + scoped.flat;
    var sources = [];
    if (Array.isArray(mods.sources)) sources = sources.concat(mods.sources);
    if (Array.isArray(scoped.sources)) sources = sources.concat(scoped.sources);
    return {
      max: Math.max(0, Math.round(base + flatDelta)),
      baseMax: base,
      flatDelta: flatDelta,
      sources: sources
    };
  }

  function resolveSkillCost(compiled, skill, baseCost, context) {
    var mods = compiled && compiled.skillCost;
    var base = Math.max(0, Number(baseCost || 0));
    if (!mods || !skill) return { finalCost: roundCost(base), baseCost: base, flatDelta: 0, pctDelta: 0 };

    var bySkill = getBucketValue(mods, 'bySkill', skill.skillKey || skill.key);
    var bySystem = getBucketValue(mods, 'bySystem', skill.system);
    var byOwner = getBucketValue(mods, 'byOwner', skill.ownerId);
    var flatDelta = toNumber(mods.globalFlat, 0) + bySkill.flat + bySystem.flat + byOwner.flat;
    var aggregatePct = toNumber(mods.globalPct, 0) + bySkill.pct + bySystem.pct + byOwner.pct;
    var pctSources = collectPctSourceValues([
      mods.sources,
      bySkill.sources,
      bySystem.sources,
      byOwner.sources
    ], aggregatePct);
    var sources = []
      .concat(Array.isArray(mods.sources) ? mods.sources : [])
      .concat(Array.isArray(bySkill.sources) ? bySkill.sources : [])
      .concat(Array.isArray(bySystem.sources) ? bySystem.sources : [])
      .concat(Array.isArray(byOwner.sources) ? byOwner.sources : []);
    var passiveTriggers = [];
    var passiveState = context && context.passiveState;
    var passives = Array.isArray(compiled && compiled.passiveTriggers) ? compiled.passiveTriggers : [];
    passives.forEach(function(entry) {
      if (!entry || entry.type !== 'first_skill_cost_flat' || !passiveMatchesSkill(entry, skill)) return;
      var runtimeKey = passiveRuntimeKey(entry, skill.ownerId);
      if (isPassiveUsed(passiveState, runtimeKey)) return;
      flatDelta += toNumber(entry.value, 0);
      sources.push(entry.source);
      passiveTriggers.push({
        cardId: entry.cardId,
        trigger: entry.type,
        value: entry.value,
        ownerId: skill.ownerId,
        runtimeKey: runtimeKey
      });
    });

    var afterFlat = Math.max(0, base + flatDelta);
    var riskRolls = [];
    if (context && context.consumeAssetRisk === true) {
      var risks = Array.isArray(compiled && compiled.riskRewards) ? compiled.riskRewards : [];
      risks.forEach(function(entry) {
        if (!entry) return;
        var costPct = randomBetween(entry.costPctMin, entry.costPctMax, context.random);
        var effectPct = randomBetween(entry.effectPctMin, entry.effectPctMax, context.random);
        pctSources.push(costPct);
        sources.push(entry.source);
        riskRolls.push({
          cardId: entry.cardId,
          cardName: entry.cardName,
          costPct: roundThree(costPct),
          effectPct: roundThree(effectPct)
        });
      });
    }

    var pctIncrease = 0;
    var pctReduction = 0;
    pctSources.forEach(function(value) {
      var pct = toNumber(value, 0);
      if (pct >= 0) pctIncrease += pct;
      else pctReduction += Math.abs(pct);
    });
    var cappedReduction = Math.min(0.66, pctReduction);
    var finalPct = pctIncrease - cappedReduction;

    return {
      finalCost: afterFlat <= 0 ? 0 : roundCost(afterFlat * Math.max(0, 1 + finalPct)),
      baseCost: base,
      flatDelta: flatDelta,
      pctDelta: roundThree(finalPct),
      pctIncrease: roundThree(pctIncrease),
      pctReduction: roundThree(cappedReduction),
      sources: sources,
      passiveTriggers: passiveTriggers,
      riskRolls: riskRolls
    };
  }

  function enhanceForcePower(compiled, force, context) {
    var mods = compiled && compiled.forcePower;
    if (!mods || !force) return force;

    var bySkill = getBucketValue(mods, 'bySkill', force.skillKey);
    var bySystem = getBucketValue(mods, 'bySystem', force.system);
    var byOwner = getBucketValue(mods, 'byOwner', force.ownerId);
    var scoped = collectScopedValues(mods.scoped, force, context);
    var flatDelta = toNumber(mods.globalFlat, 0) + bySkill.flat + bySystem.flat + byOwner.flat + scoped.flat;
    var pctDelta = toNumber(mods.globalPct, 0) + bySkill.pct + bySystem.pct + byOwner.pct + scoped.pct;
    var basePower = Math.max(0, Number(force.power || 0));
    var sources = []
      .concat(Array.isArray(mods.sources) ? mods.sources : [])
      .concat(Array.isArray(bySkill.sources) ? bySkill.sources : [])
      .concat(Array.isArray(bySystem.sources) ? bySystem.sources : [])
      .concat(Array.isArray(byOwner.sources) ? byOwner.sources : [])
      .concat(Array.isArray(scoped.sources) ? scoped.sources : []);
    var passiveTriggers = [];
    var riskRolls = Array.isArray(force._assetRiskRolls) ? force._assetRiskRolls : [];
    riskRolls.forEach(function(roll) {
      var effectPct = toNumber(roll && roll.effectPct, 0);
      if (!effectPct) return;
      pctDelta += effectPct;
      sources.push({
        cardId: roll.cardId || null,
        cardName: roll.cardName || null,
        type: 'risk_reward_roll',
        key: force.skillKey || null,
        value: effectPct
      });
    });
    var passiveState = context && context.passiveState;
    var passives = Array.isArray(compiled && compiled.passiveTriggers) ? compiled.passiveTriggers : [];
    passives.forEach(function(entry) {
      if (!entry || entry.type !== 'first_force_power_pct' || !passiveMatchesSkill(entry, force)) return;
      if (!scopeMatchesActor(entry, force, context)) return;
      var ownerId = force.ownerId;
      var runtimeKey = passiveRuntimeKey(entry, ownerId);
      if (isPassiveUsed(passiveState, runtimeKey)) return;
      pctDelta += toNumber(entry.value, 0);
      sources.push(entry.source);
      passiveTriggers.push({
        cardId: entry.cardId,
        trigger: entry.type,
        value: entry.value,
        ownerId: ownerId,
        runtimeKey: runtimeKey
      });
      if (context && context.consumePassive !== false) {
        markPassiveUsed(passiveState, runtimeKey, {
          cardId: entry.cardId,
          trigger: entry.type,
          value: entry.value,
          ownerId: ownerId
        });
      }
    });
    var finalPower = roundOne(Math.max(0, basePower + flatDelta) * Math.max(0, 1 + pctDelta));

    if (finalPower !== basePower || flatDelta !== 0 || pctDelta !== 0) {
      force.power = finalPower;
      force._assetBonus = {
        basePower: basePower,
        flatDelta: roundOne(flatDelta),
        pctDelta: roundThree(pctDelta),
        finalPower: finalPower,
        sources: sources,
        passiveTriggers: passiveTriggers
      };
    }
    return force;
  }

  function resolveMiniGameValue(compiled, bucketName, key, baseValue) {
    var base = Number(baseValue || 0);
    if (!Number.isFinite(base)) base = 0;
    var mini = compiled && compiled.miniGame && compiled.miniGame[normalizeKey(bucketName)];
    if (!mini) {
      return { value: base, baseValue: base, flatDelta: 0, pctDelta: 0, sources: [] };
    }
    var keyEntry = mini.byKey && mini.byKey[normalizeKey(key)];
    var flatDelta = toNumber(mini.globalFlat, 0) + toNumber(keyEntry && keyEntry.flat, 0);
    var pctDelta = toNumber(mini.globalPct, 0) + toNumber(keyEntry && keyEntry.pct, 0);
    var value = Math.max(0, (base + flatDelta) * Math.max(0, 1 + pctDelta));
    var sources = []
      .concat(Array.isArray(mini.sources) ? mini.sources : [])
      .concat(Array.isArray(keyEntry && keyEntry.sources) ? keyEntry.sources : []);
    return {
      value: roundThree(value),
      baseValue: base,
      flatDelta: roundThree(flatDelta),
      pctDelta: roundThree(pctDelta),
      sources: sources
    };
  }

  function compileMiniGameConfig(config, options) {
    var gameId = normalizeGameId((options && options.gameId) || (config && (config.gameMode || config.gameId)) || 'blackjack');
    var compiled = compile({
      assetDeck: (config && config.assetDeck) || (config && config.world && config.world.assetDeck),
      config: config,
      gameId: gameId
    });
    var next = cloneJson(config, config) || {};
    next.assetModifiers = compiled;
    return next;
  }

  function resolvePassiveTriggers(compiled, trigger, context) {
    var triggerKey = normalizeKey(trigger);
    var passiveState = context && context.passiveState;
    var ownerId = context && context.ownerId != null
      ? context.ownerId
      : (context && context.heroId != null ? context.heroId : 0);
    var passives = Array.isArray(compiled && compiled.passiveTriggers) ? compiled.passiveTriggers : [];
    return passives.reduce(function(events, entry) {
      if (!entry) return events;
      if (entry.type === 'street_start_mana_gain' && triggerKey !== 'street_start') return events;
      if (entry.type === 'street_force_chance_flat' && triggerKey !== 'street_start') return events;
      if (entry.type === 'once_per_hand_fortune_flat' && triggerKey !== 'hand_start') return events;
      if (
        entry.type !== 'street_start_mana_gain' &&
        entry.type !== 'street_force_chance_flat' &&
        entry.type !== 'once_per_hand_fortune_flat'
      ) return events;

      var targetOwnerId = entry.ownerId != null ? entry.ownerId : ownerId;
      var runtimeKey = passiveRuntimeKey(entry, targetOwnerId);
      if (entry.type === 'once_per_hand_fortune_flat' && isPassiveUsed(passiveState, runtimeKey)) return events;
      if (entry.type === 'street_force_chance_flat') {
        var chance = entry.chance != null ? entry.chance : 1;
        var randomFn = context && context.random;
        var roll = typeof randomFn === 'function' ? randomFn() : Math.random();
        if (roll > chance) return events;
      }
      events.push({
        cardId: entry.cardId,
        cardName: entry.cardName,
        trigger: entry.type,
        value: entry.value,
        ownerId: targetOwnerId,
        system: entry.system,
        forceType: entry.forceType,
        randomTarget: entry.randomTarget,
        shield: entry.shield,
        runtimeKey: runtimeKey,
        source: entry.source
      });
      return events;
    }, []);
  }

  function mergeSkillLevel(skillList, skillKey, level) {
    if (!skillKey || !level) return skillList || {};
    var list = skillList || {};
    var existing = list[skillKey];
    if (existing && typeof existing === 'object') {
      list[skillKey] = Object.assign({}, existing, {
        level: Math.max(Number(existing.level || existing.rank || 0), level)
      });
      return list;
    }
    list[skillKey] = Math.max(Number(existing || 0), level);
    return list;
  }

  function skillListToMap(skillList) {
    if (Array.isArray(skillList)) {
      return skillList.reduce(function(acc, entry) {
        if (entry && typeof entry === 'object') {
          var key = normalizeKey(entry.key || entry.skillKey);
          if (key) acc[key] = Math.max(Number(entry.level || entry.rank || 0), 0);
          return acc;
        }
        var rawKey = normalizeKey(entry);
        if (rawKey) acc[rawKey] = Math.max(Number(acc[rawKey] || 1), 1);
        return acc;
      }, {});
    }
    return Object.assign({}, skillList || {});
  }

  function hasSkillLevel(skillMap, skillKey) {
    if (!skillMap || !skillKey) return false;
    var value = skillMap[skillKey];
    return value != null && value !== false;
  }

  function getSkillLookup(options) {
    if (options && typeof options.lookupSkill === 'function') return options.lookupSkill;
    if (global.SkillSystem && typeof global.SkillSystem.lookupSkill === 'function') return global.SkillSystem.lookupSkill;
    return null;
  }

  function isKnownSkill(skillKey, level, options) {
    var lookupSkill = getSkillLookup(options);
    if (!lookupSkill) return true;
    return !!lookupSkill(skillKey, level);
  }

  function resolveHeroSkillSlot(hero, entry, vanguardSkills, rearguardSkills) {
    var skillKey = normalizeKey(entry && entry.skillKey);
    if (hasSkillLevel(vanguardSkills, skillKey)) return 'vanguard';
    if (hasSkillLevel(rearguardSkills, skillKey)) return 'rearguard';

    var tags = normalizeTags(entry && entry.targetTags);
    var vName = normalizeKey(hero && hero.vanguard && hero.vanguard.name);
    var rName = normalizeKey(hero && hero.rearguard && hero.rearguard.name);
    if (vName && tags.indexOf(vName) >= 0) return 'vanguard';
    if (rName && tags.indexOf(rName) >= 0) return 'rearguard';
    if (tags.indexOf('kazu') >= 0) return vName === 'kazu' || !rName ? 'vanguard' : (rName === 'kazu' ? 'rearguard' : 'vanguard');
    if (tags.indexOf('rino') >= 0) return vName === 'rino' ? 'vanguard' : (rName === 'rino' ? 'rearguard' : 'rearguard');
    if (normalizeKey(entry && entry.system) === 'void') return 'vanguard';
    return 'vanguard';
  }

  function applySkillLevelsToConfig(config, compiled, options) {
    var skillLevels = compiled && compiled.skillLevelBySkill;
    if (!skillLevels || !Object.keys(skillLevels).length) return config;

    var next = cloneJson(config, config);
    if (!next || !next.hero) return config;
    var nextCompiled = cloneJson(compiled, compiled) || compiled;
    nextCompiled.skillLevelBySkill = {};
    nextCompiled.skillLevelEntries = [];
    if (!nextCompiled.debug) nextCompiled.debug = { cards: [], ignored: [], applied: [] };
    if (!Array.isArray(nextCompiled.debug.ignored)) nextCompiled.debug.ignored = [];
    next.hero.vanguardSkills = skillListToMap(next.hero.vanguardSkills || {});
    next.hero.rearguardSkills = skillListToMap(next.hero.rearguardSkills || {});

    var entries = Array.isArray(compiled.skillLevelEntries) && compiled.skillLevelEntries.length
      ? compiled.skillLevelEntries
      : Object.keys(skillLevels).map(function(skillKey) {
        return { skillKey: skillKey, level: skillLevels[skillKey], targetTags: [], system: '' };
      });

    entries.forEach(function(entry) {
      var skillKey = normalizeKey(entry && entry.skillKey);
      var level = Math.max(0, Number(entry && entry.level || 0));
      if (!level) return;
      if (!isKnownSkill(skillKey, level, options)) {
        nextCompiled.debug.ignored.push({
          cardId: entry && entry.cardId || null,
          type: 'skill_level',
          key: skillKey,
          level: level,
          reason: 'unknown_skill'
        });
        return;
      }
      nextCompiled.skillLevelBySkill[skillKey] = Math.max(nextCompiled.skillLevelBySkill[skillKey] || 0, level);
      nextCompiled.skillLevelEntries.push(cloneJson(entry, entry));
      var slot = resolveHeroSkillSlot(next.hero, entry, next.hero.vanguardSkills, next.hero.rearguardSkills);
      if (slot === 'vanguard') {
        next.hero.vanguardSkills = mergeSkillLevel(next.hero.vanguardSkills, skillKey, level);
      } else {
        next.hero.rearguardSkills = mergeSkillLevel(next.hero.rearguardSkills, skillKey, level);
      }
    });

    next.assetModifiers = nextCompiled;
    return next;
  }

  global.AssetDeckAdapter = {
    compile: compile,
    compileMiniGameConfig: compileMiniGameConfig,
    resolveManaMax: resolveManaMax,
    resolveSkillCost: resolveSkillCost,
    enhanceForcePower: enhanceForcePower,
    resolveMiniGameValue: resolveMiniGameValue,
    resolvePassiveTriggers: resolvePassiveTriggers,
    applySkillLevelsToConfig: applySkillLevelsToConfig
  };
})(typeof window !== 'undefined' ? window : global);
