/**
 * Runtime Module: BuiltinRoleModules / COTA runtime system
 * Split from the legacy builtin-role-modules.js without behavior changes.
 */
(function(global) {
  'use strict';

  var Builtin = global.AceBuiltinRuntime = global.AceBuiltinRuntime || {};

  function getTraitEffect() { return Builtin.getTraitEffect.apply(null, arguments); }
  function getGamePlayers() { return Builtin.getGamePlayers.apply(null, arguments); }
  function getPlayerById() { return Builtin.getPlayerById.apply(null, arguments); }
  function getActiveOpponents() { return Builtin.getActiveOpponents.apply(null, arguments); }
  function getLedger() { return Builtin.getLedger.apply(null, arguments); }
  function getSkillSystem() { return Builtin.getSkillSystem.apply(null, arguments); }
  function getPlayerManaPool() { return Builtin.getPlayerManaPool.apply(null, arguments); }
  function isRolePlayer() { return Builtin.isRolePlayer.apply(null, arguments); }
  function isRuntimePlayerLive() { return Builtin.isRuntimePlayerLive.apply(null, arguments); }
  function getRolePlayers() { return Builtin.getRolePlayers.apply(null, arguments); }
  function guardConfiguredRole() { return Builtin.guardConfiguredRole.apply(null, arguments); }
  function clearStatusMarkSafe() { return Builtin.clearStatusMarkSafe.apply(null, arguments); }
  function resolveRuntimePhase() { return Builtin.resolveRuntimePhase.apply(null, arguments); }
  function setManaCurrent() { return Builtin.setManaCurrent.apply(null, arguments); }
  function queueKuzuhaCurse() { return Builtin.queueKuzuhaCurse.apply(null, arguments); }
  function queueKuzuhaFortune() { return Builtin.queueKuzuhaFortune.apply(null, arguments); }

  var COTA_SLOT_COUNT_KEY = Builtin.COTA_SLOT_COUNT_KEY;
  var COTA_CARDS_KEY = Builtin.COTA_CARDS_KEY;
  var COTA_FAULT_STATE_KEY = Builtin.COTA_FAULT_STATE_KEY;
  var COTA_BUST_RATE_KEY = Builtin.COTA_BUST_RATE_KEY;
  var COTA_SELF_CURSE_PRESSURE_KEY = Builtin.COTA_SELF_CURSE_PRESSURE_KEY;
  var COTA_FIRST_BUST_BONUS_KEY = Builtin.COTA_FIRST_BUST_BONUS_KEY;
  var COTA_NEW_CARD_COST_DELTA_KEY = Builtin.COTA_NEW_CARD_COST_DELTA_KEY;
  var COTA_DEFAULT_SLOT_COUNT = Builtin.COTA_DEFAULT_SLOT_COUNT;
  var COTA_GATHER_VALUE_DELTA = Builtin.COTA_GATHER_VALUE_DELTA;
  var COTA_GATHER_COST_DELTA = Builtin.COTA_GATHER_COST_DELTA;
  var COTA_SPREAD_VALUE_DELTA = Builtin.COTA_SPREAD_VALUE_DELTA;
  var COTA_SPREAD_COST_DELTA = Builtin.COTA_SPREAD_COST_DELTA;
  var COTA_MISC_GATHER_VALUE_DELTA = Builtin.COTA_MISC_GATHER_VALUE_DELTA;
  var COTA_MISC_SPREAD_VALUE_DELTA = Builtin.COTA_MISC_SPREAD_VALUE_DELTA;
  var COTA_MISC_BASE_GAIN_RATE = Builtin.COTA_MISC_BASE_GAIN_RATE;
  var COTA_MISC_RATE_PER_POWER = Builtin.COTA_MISC_RATE_PER_POWER;
  var COTA_MISC_MANA_MULTIPLIER = Builtin.COTA_MISC_MANA_MULTIPLIER;
  var COTA_CARD_DEFAULTS = Builtin.COTA_CARD_DEFAULTS;
  var COTA_BASE_VALUE_KEYS = Builtin.COTA_BASE_VALUE_KEYS;
  var COTA_MARK_ICON = Builtin.COTA_MARK_ICON;
  var COTA_FAULT_ICON = Builtin.COTA_FAULT_ICON;

  var cotaCardSerial = 0;

  function getCotaPlayers(runtimeApi) {
    return getRolePlayers(runtimeApi, 'COTA');
  }

  function isCotaAssetKey(key) {
    return key === COTA_SLOT_COUNT_KEY ||
      key === COTA_CARDS_KEY ||
      key === COTA_FAULT_STATE_KEY ||
      key === COTA_BUST_RATE_KEY ||
      key === COTA_SELF_CURSE_PRESSURE_KEY ||
      key === COTA_FIRST_BUST_BONUS_KEY ||
      key === COTA_NEW_CARD_COST_DELTA_KEY;
  }

  function normalizeCotaCardType(raw) {
    var key = String(raw || '').toLowerCase();
    if (key === 'good' || key === 'fortune' || key === 'good_card' || key === 'goodcard') return 'good';
    if (key === 'bad' || key === 'curse' || key === 'bad_card' || key === 'badcard') return 'bad';
    if (key === 'misc' || key === 'mixed' || key === 'utility' || key === 'misc_card' || key === 'misccard') return 'misc';
    return null;
  }

  function cloneCotaCards(cards) {
    return Array.isArray(cards) ? cards.map(function(card) {
      return Object.assign({}, card);
    }) : [];
  }

  function getCotaAsset(runtimeApi, ownerId, key) {
    var ledger = getLedger(runtimeApi);
    if (!ledger || ownerId == null || !key || typeof ledger.getAsset !== 'function') return null;
    return ledger.getAsset(ownerId, key);
  }

  function getCotaAssetValue(runtimeApi, ownerId, key, fallbackValue) {
    var asset = getCotaAsset(runtimeApi, ownerId, key);
    if (!asset) return fallbackValue != null ? fallbackValue : 0;
    return Math.max(0, Number(asset.value || 0));
  }

  function getCotaDefaultBaseValue(cardType) {
    var type = normalizeCotaCardType(cardType);
    var defaults = type ? COTA_CARD_DEFAULTS[type] : null;
    return Math.max(0, Number(defaults && defaults.baseValue || 0));
  }

  function setCotaAsset(runtimeApi, ownerId, key, value, meta) {
    var ledger = getLedger(runtimeApi);
    if (!ledger || ownerId == null || !key || typeof ledger.setAsset !== 'function') return null;
    return ledger.setAsset(ownerId, key, value, Object.assign({
      syncedAt: Date.now()
    }, meta || {}));
  }

  function clearCotaAsset(runtimeApi, ownerId, key) {
    var ledger = getLedger(runtimeApi);
    if (!ledger || ownerId == null || !key || typeof ledger.clearAsset !== 'function') return;
    ledger.clearAsset(ownerId, key);
  }

  function getCotaSlotCount(runtimeApi, ownerId) {
    return getCotaAssetValue(runtimeApi, ownerId, COTA_SLOT_COUNT_KEY, COTA_DEFAULT_SLOT_COUNT);
  }

  function setCotaSlotCount(runtimeApi, ownerId, value, meta) {
    var asset = setCotaAsset(runtimeApi, ownerId, COTA_SLOT_COUNT_KEY, Math.max(0, Number(value || 0)), meta);
    syncCotaSeatMarks(runtimeApi, ownerId);
    return asset;
  }

  function getCotaCards(runtimeApi, ownerId) {
    var asset = getCotaAsset(runtimeApi, ownerId, COTA_CARDS_KEY);
    if (!asset || !Array.isArray(asset.cards)) return [];
    return cloneCotaCards(asset.cards);
  }

  function getCotaBaseValueKey(cardType) {
    var type = normalizeCotaCardType(cardType);
    return type ? COTA_BASE_VALUE_KEYS[type] : null;
  }

  function deriveCotaFamilyBaseValueFromCards(cards, cardType) {
    var type = normalizeCotaCardType(cardType);
    var fallback = getCotaDefaultBaseValue(type);
    if (!type || !Array.isArray(cards)) return fallback;
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      if (normalizeCotaCardType(card && card.cardType) !== type) continue;
      return Math.max(0, Number(card && card.baseValue || 0));
    }
    return fallback;
  }

  function getCotaFamilyBaseValue(runtimeApi, ownerId, cardType) {
    var type = normalizeCotaCardType(cardType);
    var key = getCotaBaseValueKey(type);
    if (!type || !key) return 0;
    var asset = getCotaAsset(runtimeApi, ownerId, key);
    if (asset) return Math.max(0, Number(asset.value || 0));
    return deriveCotaFamilyBaseValueFromCards(getCotaCards(runtimeApi, ownerId), type);
  }

  function setCotaFamilyBaseValue(runtimeApi, ownerId, cardType, value, meta) {
    var type = normalizeCotaCardType(cardType);
    var key = getCotaBaseValueKey(type);
    if (!type || !key) return null;
    return setCotaAsset(runtimeApi, ownerId, key, Math.max(0, Number(value || 0)), meta);
  }

  function primeCotaFamilyBaseValues(runtimeApi, ownerId, meta) {
    var cards = getCotaCards(runtimeApi, ownerId);
    var families = ['good', 'bad', 'misc'];
    for (var i = 0; i < families.length; i++) {
      var type = families[i];
      var key = getCotaBaseValueKey(type);
      if (getCotaAsset(runtimeApi, ownerId, key)) continue;
      setCotaFamilyBaseValue(runtimeApi, ownerId, type, deriveCotaFamilyBaseValueFromCards(cards, type), Object.assign({
        source: 'cota_prime_base_value',
        cardType: type
      }, meta || {}));
    }
  }

  function setCotaCards(runtimeApi, ownerId, cards, meta) {
    var nextCards = cloneCotaCards(cards).sort(function(a, b) {
      return Number(a.slotIndex || 0) - Number(b.slotIndex || 0);
    });
    var asset = setCotaAsset(runtimeApi, ownerId, COTA_CARDS_KEY, nextCards.length, Object.assign({
      cards: nextCards
    }, meta || {}));
    syncCotaSeatMarks(runtimeApi, ownerId);
    return asset;
  }

  function isCotaFaultState(runtimeApi, ownerId) {
    return getCotaAssetValue(runtimeApi, ownerId, COTA_FAULT_STATE_KEY, 0) > 0;
  }

  function getCotaBustRate(runtimeApi, ownerId) {
    var asset = getCotaAsset(runtimeApi, ownerId, COTA_BUST_RATE_KEY);
    return asset ? Math.max(0, Number(asset.value || 0)) : 0;
  }

  function setCotaFaultState(runtimeApi, ownerId, enabled, meta) {
    var asset = setCotaAsset(runtimeApi, ownerId, COTA_FAULT_STATE_KEY, enabled ? 1 : 0, meta);
    syncCotaSeatMarks(runtimeApi, ownerId);
    return asset;
  }

  function setCotaBustRate(runtimeApi, ownerId, value, meta) {
    var asset = setCotaAsset(runtimeApi, ownerId, COTA_BUST_RATE_KEY, Math.max(0, Number(value || 0)), meta);
    syncCotaSeatMarks(runtimeApi, ownerId);
    return asset;
  }

  function setOrClearCotaSeatMark(skillSystem, ownerId, key, enabled, payload) {
    if (!skillSystem || ownerId == null || !key) return;
    if (enabled) {
      skillSystem.setStatusMark(ownerId, key, payload || {});
      return;
    }
    if (typeof skillSystem.clearStatusMark === 'function') {
      skillSystem.clearStatusMark(ownerId, key);
    }
  }

  function syncCotaSeatMarks(runtimeApi, ownerId) {
    var skillSystem = getSkillSystem(runtimeApi);
    if (!skillSystem || ownerId == null) return;
    if (!guardConfiguredRole(runtimeApi, 'COTA', function(api) {
      var players = getGamePlayers(api);
      for (var pi = 0; pi < players.length; pi++) {
        var player = players[pi];
        if (!player) continue;
        clearStatusMarkSafe(skillSystem, player.id, 'cota_empty_slots');
        clearStatusMarkSafe(skillSystem, player.id, 'cota_good_cards');
        clearStatusMarkSafe(skillSystem, player.id, 'cota_bad_cards');
        clearStatusMarkSafe(skillSystem, player.id, 'cota_misc_cards');
        clearStatusMarkSafe(skillSystem, player.id, 'cota_fault_state');
      }
    })) return;
    var owner = getPlayerById(runtimeApi, ownerId);
    if (!owner || !isRolePlayer(owner, 'COTA')) return;
    if (!isRuntimePlayerLive(owner)) {
      clearStatusMarkSafe(skillSystem, ownerId, 'cota_empty_slots');
      clearStatusMarkSafe(skillSystem, ownerId, 'cota_good_cards');
      clearStatusMarkSafe(skillSystem, ownerId, 'cota_bad_cards');
      clearStatusMarkSafe(skillSystem, ownerId, 'cota_misc_cards');
      clearStatusMarkSafe(skillSystem, ownerId, 'cota_fault_state');
      return;
    }

    var slotCount = getCotaSlotCount(runtimeApi, ownerId);
    var cards = getCotaCards(runtimeApi, ownerId);
    var counts = { good: 0, bad: 0, misc: 0 };
    for (var i = 0; i < cards.length; i++) {
      var type = normalizeCotaCardType(cards[i] && cards[i].cardType);
      if (type && counts[type] != null) counts[type] += 1;
    }

    var totalCards = cards.length;
    var emptySlots = Math.max(0, slotCount - totalCards);
    var faultState = isCotaFaultState(runtimeApi, ownerId);
    var bustPercent = Math.round(getCotaBustRate(runtimeApi, ownerId) * 100);
    var sharedDetail = '槽位: ' + slotCount +
      '\n在场牌: ' + totalCards +
      '\n状态: ' + (faultState ? '故障态' : '标准态') +
      '\n爆牌率: ' + bustPercent + '%';

    setOrClearCotaSeatMark(skillSystem, ownerId, 'cota_empty_slots', emptySlots > 0, {
      icon: COTA_MARK_ICON,
      iconMode: 'mask',
      tone: 'cota-empty',
      count: emptySlots,
      title: '空槽位',
      detail: sharedDetail + '\n空槽位: ' + emptySlots
    });
    setOrClearCotaSeatMark(skillSystem, ownerId, 'cota_good_cards', counts.good > 0, {
      icon: COTA_MARK_ICON,
      iconMode: 'mask',
      tone: 'cota-good',
      count: counts.good,
      title: '吉牌',
      detail: sharedDetail + '\n吉牌: ' + counts.good
    });
    setOrClearCotaSeatMark(skillSystem, ownerId, 'cota_bad_cards', counts.bad > 0, {
      icon: COTA_MARK_ICON,
      iconMode: 'mask',
      tone: 'cota-bad',
      count: counts.bad,
      title: '厄牌',
      detail: sharedDetail + '\n厄牌: ' + counts.bad
    });
    setOrClearCotaSeatMark(skillSystem, ownerId, 'cota_misc_cards', counts.misc > 0, {
      icon: COTA_MARK_ICON,
      iconMode: 'mask',
      tone: 'cota-misc',
      count: counts.misc,
      title: '杂牌',
      detail: sharedDetail + '\n杂牌: ' + counts.misc
    });
    setOrClearCotaSeatMark(skillSystem, ownerId, 'cota_fault_state', faultState, {
      icon: COTA_FAULT_ICON,
      iconMode: 'mask',
      tone: 'cota-fault',
      count: 0,
      title: '故障态',
      detail: sharedDetail + '\n故障触发: 场上存在杂牌'
    });
  }

  function getCotaSelfCursePressure(runtimeApi, ownerId) {
    return getCotaAssetValue(runtimeApi, ownerId, COTA_SELF_CURSE_PRESSURE_KEY, 0);
  }

  function setCotaSelfCursePressure(runtimeApi, ownerId, value, meta) {
    return setCotaAsset(runtimeApi, ownerId, COTA_SELF_CURSE_PRESSURE_KEY, Math.max(0, Number(value || 0)), meta);
  }

  function getCotaNewCardCostDelta(runtimeApi, ownerId) {
    var asset = getCotaAsset(runtimeApi, ownerId, COTA_NEW_CARD_COST_DELTA_KEY);
    if (!asset) return 0;
    if (asset.delta != null) return Number(asset.delta || 0);
    return Number(asset.value || 0);
  }

  function setCotaNewCardCostDelta(runtimeApi, ownerId, value, meta) {
    var nextValue = Number(value || 0);
    if (nextValue === 0) {
      clearCotaAsset(runtimeApi, ownerId, COTA_NEW_CARD_COST_DELTA_KEY);
      return null;
    }
    return setCotaAsset(runtimeApi, ownerId, COTA_NEW_CARD_COST_DELTA_KEY, Math.abs(nextValue), Object.assign({
      delta: nextValue
    }, meta || {}));
  }

  function getCotaFirstBustBonusState(runtimeApi, ownerId) {
    var asset = getCotaAsset(runtimeApi, ownerId, COTA_FIRST_BUST_BONUS_KEY);
    if (!asset) return { armed: false, used: false };
    return {
      armed: asset.armed === true,
      used: Math.max(0, Number(asset.value || 0)) > 0
    };
  }

  function setCotaFirstBustBonusState(runtimeApi, ownerId, armed, used, meta) {
    if (!armed && !used) {
      clearCotaAsset(runtimeApi, ownerId, COTA_FIRST_BUST_BONUS_KEY);
      return null;
    }
    return setCotaAsset(runtimeApi, ownerId, COTA_FIRST_BUST_BONUS_KEY, used ? 1 : 0, Object.assign({
      armed: armed === true
    }, meta || {}));
  }

  function getCotaFaultEffect(runtimeApi, ownerId) {
    var effect = getTraitEffect(runtimeApi, ownerId, 'cota_dealer_hands_fault') || {};
    return {
      baseBustRate: Math.max(0, Number(effect.baseBustRate != null ? effect.baseBustRate : 0.1)),
      bustRatePerAction: Math.max(0, Number(effect.bustRatePerAction != null ? effect.bustRatePerAction : 0.1)),
      bustRefundMana: Math.max(0, Number(effect.bustRefundMana != null ? effect.bustRefundMana : 3)),
      miscBustMultiplier: Math.max(0, Number(effect.miscBustMultiplier != null ? effect.miscBustMultiplier : 1)),
      firstBustFortune: Math.max(0, Number(effect.firstBustFortune != null ? effect.firstBustFortune : 15))
    };
  }

  function getCotaContractTemplate(runtimeApi, ownerId) {
    var effect = getTraitEffect(runtimeApi, ownerId, 'cota_contract_template') || {};
    return {
      gatherBaseBonus: Math.max(0, Number(effect.gatherBaseBonus != null ? effect.gatherBaseBonus : 1)),
      spreadBaseBonus: Math.max(0, Number(effect.spreadBaseBonus != null ? effect.spreadBaseBonus : 1)),
      spreadNewCardCostDelta: Number(effect.spreadNewCardCostDelta != null ? effect.spreadNewCardCostDelta : 0),
      pairBonusRate: Math.max(0, Number(effect.pairBonusRate != null ? effect.pairBonusRate : 0.15))
    };
  }

  function getCotaFamilyCounts(cards) {
    var counts = { good: 0, bad: 0, misc: 0 };
    for (var i = 0; i < cards.length; i++) {
      var type = normalizeCotaCardType(cards[i] && cards[i].cardType);
      if (type && counts[type] != null) counts[type] += 1;
    }
    return counts;
  }

  function getCotaCardPower(runtimeApi, ownerId, card, familyCounts, options) {
    options = options || {};
    var type = normalizeCotaCardType(card && card.cardType);
    var power = Math.max(0, Number(card && card.baseValue || 0));
    var counts = familyCounts || getCotaFamilyCounts(card ? [card] : []);
    var pairBonusRate = Math.max(0, Number(options.pairBonusRate != null ? options.pairBonusRate : getCotaContractTemplate(runtimeApi, ownerId).pairBonusRate));
    if (type && counts[type] >= 2 && pairBonusRate > 0) {
      power = Math.ceil(power * (1 + pairBonusRate));
    }
    if (options.multiplier != null) {
      power = Math.ceil(power * Math.max(0, Number(options.multiplier || 0)));
    }
    return Math.max(0, power);
  }

  function findFirstEmptyCotaSlot(cards, slotCount) {
    var occupied = Object.create(null);
    for (var i = 0; i < cards.length; i++) {
      occupied[String(Math.max(0, Number(cards[i] && cards[i].slotIndex || 0)))] = true;
    }
    for (var index = 0; index < slotCount; index++) {
      if (!occupied[String(index)]) return index;
    }
    return null;
  }

  function buildCotaCard(runtimeApi, ownerId, cardType, slotIndex, phase) {
    var type = normalizeCotaCardType(cardType);
    var defaults = type ? COTA_CARD_DEFAULTS[type] : null;
    if (!type || !defaults) return null;
    cotaCardSerial += 1;
    return {
      id: 'cota_card_' + cotaCardSerial,
      ownerId: ownerId,
      slotIndex: slotIndex,
      cardType: type,
      baseValue: getCotaFamilyBaseValue(runtimeApi, ownerId, type),
      settleManaCost: Math.max(0, Number(defaults.settleManaCost || 0) + getCotaNewCardCostDelta(runtimeApi, ownerId)),
      createdPhase: phase || resolveRuntimePhase(runtimeApi, null),
      createdBySkill: 'deal_card'
    };
  }

  function mapAllCotaCards(cards, valueDelta, miscValueDelta, costDelta, extraValueDelta) {
    return cloneCotaCards(cards).map(function(card) {
      var next = Object.assign({}, card);
      var type = normalizeCotaCardType(next.cardType);
      var appliedValueDelta = type === 'misc' ? Number(miscValueDelta || 0) : Number(valueDelta || 0);
      if (type !== 'misc' && extraValueDelta) {
        appliedValueDelta += Number(extraValueDelta || 0);
      }
      next.baseValue = Math.max(0, Number(next.baseValue || 0) + appliedValueDelta);
      next.settleManaCost = Math.max(0, Number(next.settleManaCost || 0) + Number(costDelta || 0));
      return next;
    });
  }

  function ensureCotaFaultState(runtimeApi, ownerId, sourceKey, phase) {
    var effect = getCotaFaultEffect(runtimeApi, ownerId);
    var wasFault = isCotaFaultState(runtimeApi, ownerId);
    setCotaFaultState(runtimeApi, ownerId, true, {
      source: sourceKey,
      phase: phase
    });
    var currentRate = getCotaBustRate(runtimeApi, ownerId);
    if (currentRate < effect.baseBustRate) {
      setCotaBustRate(runtimeApi, ownerId, effect.baseBustRate, {
        source: sourceKey,
        phase: phase
      });
    }
    if (!wasFault) {
      setCotaFirstBustBonusState(runtimeApi, ownerId, true, false, {
        source: sourceKey,
        phase: phase
      });
    }
  }

  function clearCotaFaultState(runtimeApi, ownerId, sourceKey, phase) {
    setCotaFaultState(runtimeApi, ownerId, false, {
      source: sourceKey,
      phase: phase
    });
    setCotaBustRate(runtimeApi, ownerId, 0, {
      source: sourceKey,
      phase: phase
    });
    clearCotaAsset(runtimeApi, ownerId, COTA_FIRST_BUST_BONUS_KEY);
  }

  function applyCotaFaultActionBump(runtimeApi, ownerId, sourceKey, phase) {
    if (!isCotaFaultState(runtimeApi, ownerId)) return;
    var effect = getCotaFaultEffect(runtimeApi, ownerId);
    setCotaBustRate(runtimeApi, ownerId, getCotaBustRate(runtimeApi, ownerId) + effect.bustRatePerAction, {
      source: sourceKey,
      phase: phase
    });
  }

  function chooseRandomCotaOpponent(runtimeApi, ownerId) {
    var opponents = getActiveOpponents(runtimeApi, ownerId);
    if (!opponents.length) return null;
    return opponents[Math.floor(Math.random() * opponents.length)] || null;
  }

  function syncCotaFaultStateFromCards(runtimeApi, ownerId, sourceKey, phase) {
    var cards = getCotaCards(runtimeApi, ownerId);
    var counts = getCotaFamilyCounts(cards);
    if (counts.misc >= 1) {
      ensureCotaFaultState(runtimeApi, ownerId, sourceKey || 'cota_misc_fault', phase);
      return true;
    }
    clearCotaFaultState(runtimeApi, ownerId, sourceKey || 'cota_misc_clear', phase);
    return false;
  }

  function resolveCotaMiscMana(runtimeApi, ownerId, power, sourceKey, extraMeta) {
    var pool = getPlayerManaPool(runtimeApi, ownerId);
    if (!pool) return 0;
    var cardPower = Math.max(0, Number(power || 0));
    var gainRate = Math.max(0, Math.min(1, COTA_MISC_BASE_GAIN_RATE + (cardPower * COTA_MISC_RATE_PER_POWER)));
    var lossRate = Math.max(0, Math.min(1, 1 - gainRate));
    var gainRoll = Math.random() < gainRate;
    var amount = Math.max(1, Math.ceil(cardPower * COTA_MISC_MANA_MULTIPLIER));
    var signedAmount = gainRoll ? amount : -amount;
    setManaCurrent(runtimeApi, ownerId, pool.current + signedAmount, sourceKey);
    var skillSystem = getSkillSystem(runtimeApi);
    if (skillSystem && typeof skillSystem.emit === 'function') {
      skillSystem.emit('cota:misc_mana', Object.assign({
        ownerId: ownerId,
        delta: signedAmount,
        power: cardPower,
        source: sourceKey,
        gainRate: gainRate,
        lossRate: lossRate
      }, extraMeta || {}));
    }
    return signedAmount;
  }

  function resolveCotaCardEffect(runtimeApi, ownerId, card, phase, familyCounts, options) {
    options = options || {};
    var type = normalizeCotaCardType(card && card.cardType);
    var owner = getPlayerById(runtimeApi, ownerId);
    if (!type || !owner) return options.state || { selfCursePressure: getCotaSelfCursePressure(runtimeApi, ownerId) };

    var state = options.state || {
      selfCursePressure: getCotaSelfCursePressure(runtimeApi, ownerId)
    };
    var power = getCotaCardPower(runtimeApi, ownerId, card, familyCounts, {
      pairBonusRate: options.pairBonusRate,
      multiplier: options.multiplier
    });
    if (power <= 0) return state;

    if (type === 'good') {
      queueKuzuhaFortune(runtimeApi, ownerId, power, options.sourceKey || 'cota_good_card', {
        phase: phase,
        cardId: card.id,
        cardType: type
      });
    } else if (type === 'bad') {
      var badEffectPower = Math.max(0, Math.ceil(power * 1.5));
      if (state.selfCursePressure > 0) {
        state.selfCursePressure = Math.max(0, state.selfCursePressure - badEffectPower);
        queueKuzuhaFortune(runtimeApi, ownerId, badEffectPower, options.sourceKey || 'cota_bad_guard', {
          phase: phase,
          cardId: card.id,
          cardType: type,
          guardMode: true
        });
      } else {
        var target = chooseRandomCotaOpponent(runtimeApi, ownerId);
        if (target) {
          queueKuzuhaCurse(runtimeApi, ownerId, target.id, badEffectPower, options.sourceKey || 'cota_bad_card', {
            phase: phase,
            cardId: card.id,
            cardType: type
          });
        }
      }
    } else if (type === 'misc') {
      resolveCotaMiscMana(runtimeApi, ownerId, power, options.sourceKey || 'cota_misc_card', {
        phase: phase,
        cardId: card.id,
        cardType: type
      });
    }

    var skillSystem = getSkillSystem(runtimeApi);
    if (skillSystem && typeof skillSystem.emit === 'function') {
      skillSystem.emit('cota:card_resolved', {
        ownerId: ownerId,
        ownerName: owner.name,
        phase: phase,
        card: Object.assign({}, card),
        cardType: type,
        power: type === 'bad' ? Math.max(0, Math.ceil(power * 1.5)) : power,
        source: options.sourceKey || 'cota_card'
      });
    }
    return state;
  }

  function consumeCotaFirstBustBonus(runtimeApi, ownerId, phase, state, sourceKey) {
    var bonusState = getCotaFirstBustBonusState(runtimeApi, ownerId);
    if (!bonusState.armed || bonusState.used) return;
    var effect = getCotaFaultEffect(runtimeApi, ownerId);
    if (effect.firstBustFortune > 0) {
      queueKuzuhaFortune(runtimeApi, ownerId, effect.firstBustFortune, sourceKey || 'cota_first_bust_bonus', {
        phase: phase,
        burstBonus: true
      });
    }
    setCotaFirstBustBonusState(runtimeApi, ownerId, false, true, {
      source: sourceKey || 'cota_first_bust_bonus',
      phase: phase
    });
    if (state) state.firstBustConsumed = true;
  }

  function resolveCotaBurst(runtimeApi, ownerId, cards, meta) {
    meta = meta || {};
    var phase = meta.phase || resolveRuntimePhase(runtimeApi, null);
    var owner = getPlayerById(runtimeApi, ownerId);
    var burstCards = cloneCotaCards(cards);
    if (!owner || !burstCards.length) {
      return meta.state || { selfCursePressure: getCotaSelfCursePressure(runtimeApi, ownerId) };
    }

    var state = meta.state || {
      selfCursePressure: getCotaSelfCursePressure(runtimeApi, ownerId)
    };
    var familyCounts = meta.familyCounts || getCotaFamilyCounts(meta.currentCards || burstCards);
    var faultEffect = getCotaFaultEffect(runtimeApi, ownerId);

    for (var i = 0; i < burstCards.length; i++) {
      var card = burstCards[i];
      var type = normalizeCotaCardType(card && card.cardType);
      if (!type) continue;
      if (type === 'misc') {
        var pool = getPlayerManaPool(runtimeApi, ownerId);
        var miscRefundMana = Math.max(0, Math.ceil(getCotaCardPower(runtimeApi, ownerId, card, familyCounts) * faultEffect.miscBustMultiplier));
        if (pool && miscRefundMana > 0) {
          setManaCurrent(runtimeApi, ownerId, pool.current + miscRefundMana, 'cota_burst_misc');
        }
        var skillSystem = getSkillSystem(runtimeApi);
        if (skillSystem && typeof skillSystem.emit === 'function') {
          skillSystem.emit('cota:card_resolved', {
            ownerId: ownerId,
            ownerName: owner.name,
            phase: phase,
            card: Object.assign({}, card),
            cardType: type,
            power: miscRefundMana,
            source: 'cota_burst_misc'
          });
        }
        continue;
      }
      state = resolveCotaCardEffect(runtimeApi, ownerId, card, phase, familyCounts, {
        multiplier: 3,
        sourceKey: type === 'good' ? 'cota_burst_good' : 'cota_burst_bad',
        state: state
      });
    }

    var flatBurstRefund = Math.max(0, Number(faultEffect.bustRefundMana || 0)) * burstCards.length;
    if (flatBurstRefund > 0) {
      var manaPool = getPlayerManaPool(runtimeApi, ownerId);
      if (manaPool) {
        setManaCurrent(runtimeApi, ownerId, manaPool.current + flatBurstRefund, 'cota_burst_refund');
      }
    }
    consumeCotaFirstBustBonus(runtimeApi, ownerId, phase, state, 'cota_first_bust_bonus');
    setCotaSelfCursePressure(runtimeApi, ownerId, state.selfCursePressure, {
      source: meta.reason || 'cota_burst',
      phase: phase
    });

    var eventSystem = getSkillSystem(runtimeApi);
    if (eventSystem && typeof eventSystem.emit === 'function') {
      eventSystem.emit('cota:bust', {
        ownerId: ownerId,
        ownerName: owner.name,
        phase: phase,
        reason: meta.reason || 'cota_burst',
        cardCount: burstCards.length,
        flatManaRecovered: flatBurstRefund
      });
    }
    return state;
  }

  function pickCotaOverflowCards(cards, overflowCount, preferredFamily) {
    var preferredType = normalizeCotaCardType(preferredFamily);
    var ranked = cloneCotaCards(cards).sort(function(a, b) {
      var aPreferred = normalizeCotaCardType(a && a.cardType) === preferredType ? 1 : 0;
      var bPreferred = normalizeCotaCardType(b && b.cardType) === preferredType ? 1 : 0;
      if (aPreferred !== bPreferred) return bPreferred - aPreferred;
      return Number(b && b.slotIndex || 0) - Number(a && a.slotIndex || 0);
    });
    return ranked.slice(0, Math.max(0, overflowCount));
  }

  function clearCotaTransientStreetState(runtimeApi, ownerId) {
    clearCotaAsset(runtimeApi, ownerId, COTA_SELF_CURSE_PRESSURE_KEY);
  }

  function clearCotaBurstState(runtimeApi, ownerId) {
    setCotaCards(runtimeApi, ownerId, [], {
      source: 'cota_burst_reset'
    });
    setCotaFaultState(runtimeApi, ownerId, false, {
      source: 'cota_burst_reset'
    });
    setCotaBustRate(runtimeApi, ownerId, 0, {
      source: 'cota_burst_reset'
    });
    clearCotaAsset(runtimeApi, ownerId, COTA_FIRST_BUST_BONUS_KEY);
    clearCotaAsset(runtimeApi, ownerId, COTA_SELF_CURSE_PRESSURE_KEY);
  }

  function resetAllCotaPersistentState(runtimeApi, ownerId, meta) {
    setCotaSlotCount(runtimeApi, ownerId, COTA_DEFAULT_SLOT_COUNT, Object.assign({
      source: 'cota_full_reset'
    }, meta || {}));
    setCotaCards(runtimeApi, ownerId, [], Object.assign({
      source: 'cota_full_reset'
    }, meta || {}));
    setCotaFamilyBaseValue(runtimeApi, ownerId, 'good', getCotaDefaultBaseValue('good'), Object.assign({
      source: 'cota_full_reset',
      cardType: 'good'
    }, meta || {}));
    setCotaFamilyBaseValue(runtimeApi, ownerId, 'bad', getCotaDefaultBaseValue('bad'), Object.assign({
      source: 'cota_full_reset',
      cardType: 'bad'
    }, meta || {}));
    setCotaFamilyBaseValue(runtimeApi, ownerId, 'misc', getCotaDefaultBaseValue('misc'), Object.assign({
      source: 'cota_full_reset',
      cardType: 'misc'
    }, meta || {}));
    setCotaFaultState(runtimeApi, ownerId, false, meta || {});
    setCotaBustRate(runtimeApi, ownerId, 0, meta || {});
    clearCotaAsset(runtimeApi, ownerId, COTA_SELF_CURSE_PRESSURE_KEY);
    clearCotaAsset(runtimeApi, ownerId, COTA_NEW_CARD_COST_DELTA_KEY);
    clearCotaAsset(runtimeApi, ownerId, COTA_FIRST_BUST_BONUS_KEY);
  }

  function primeCotaPersistentState(runtimeApi, ownerId, meta) {
    var owner = getPlayerById(runtimeApi, ownerId);
    if (!owner || !isRolePlayer(owner, 'COTA')) return;
    var slotAsset = getCotaAsset(runtimeApi, ownerId, COTA_SLOT_COUNT_KEY);
    if (!slotAsset) {
      setCotaSlotCount(runtimeApi, ownerId, COTA_DEFAULT_SLOT_COUNT, Object.assign({
        source: 'cota_prime'
      }, meta || {}));
    }
    var cardsAsset = getCotaAsset(runtimeApi, ownerId, COTA_CARDS_KEY);
    if (!cardsAsset) {
      setCotaCards(runtimeApi, ownerId, [], Object.assign({
        source: 'cota_prime'
      }, meta || {}));
    }
    primeCotaFamilyBaseValues(runtimeApi, ownerId, meta);
    if (!getCotaAsset(runtimeApi, ownerId, COTA_FAULT_STATE_KEY)) {
      setCotaFaultState(runtimeApi, ownerId, false, Object.assign({
        source: 'cota_prime'
      }, meta || {}));
    }
    if (!getCotaAsset(runtimeApi, ownerId, COTA_BUST_RATE_KEY)) {
      setCotaBustRate(runtimeApi, ownerId, 0, Object.assign({
        source: 'cota_prime'
      }, meta || {}));
    }
    clearCotaTransientStreetState(runtimeApi, ownerId);
    syncCotaFaultStateFromCards(runtimeApi, ownerId, 'cota_prime_sync', meta && meta.phase);
  }

  function handleCotaDealCard(payload, runtimeApi) {
    var skill = payload && payload.skill;
    var ownerId = skill && skill.ownerId;
    var phase = resolveRuntimePhase(runtimeApi, payload);
    if (ownerId == null) return;
    var owner = getPlayerById(runtimeApi, ownerId);
    if (!owner || !isRolePlayer(owner, 'COTA')) return;

    var options = payload && payload.options ? payload.options : {};
    var type = normalizeCotaCardType(payload && payload.cardType || options.cardType);
    if (!type) return;

    var slotCount = getCotaSlotCount(runtimeApi, ownerId);
    var cards = getCotaCards(runtimeApi, ownerId);
    var slotIndex = payload && payload.slotIndex != null ? Number(payload.slotIndex) : null;
    if (!Number.isFinite(slotIndex) || slotIndex < 0 || slotIndex >= slotCount) {
      slotIndex = findFirstEmptyCotaSlot(cards, slotCount);
    }
    if (slotIndex == null) return;
    if (cards.some(function(card) { return Number(card.slotIndex) === slotIndex; })) return;

    var card = buildCotaCard(runtimeApi, ownerId, type, slotIndex, phase);
    if (!card) return;
    cards.push(card);
    setCotaCards(runtimeApi, ownerId, cards, {
      source: 'deal_card',
      phase: phase
    });
    var wasFault = isCotaFaultState(runtimeApi, ownerId);
    var isFault = syncCotaFaultStateFromCards(runtimeApi, ownerId, 'deal_card', phase);
    if (wasFault && isFault) {
      applyCotaFaultActionBump(runtimeApi, ownerId, 'deal_card', phase);
    }
  }

  function handleCotaGatherOrSpread(payload, runtimeApi) {
    var skill = payload && payload.skill;
    var ownerId = skill && skill.ownerId;
    var phase = resolveRuntimePhase(runtimeApi, payload);
    if (ownerId == null) return;
    var owner = getPlayerById(runtimeApi, ownerId);
    if (!owner || !isRolePlayer(owner, 'COTA')) return;

    var options = payload && payload.options ? payload.options : {};
    var mode = String(payload && payload.mode || options.mode || '').toLowerCase();
    if (mode !== 'gather' && mode !== 'spread') return;

    var cards = getCotaCards(runtimeApi, ownerId);
    var nextSlotCount = getCotaSlotCount(runtimeApi, ownerId);
    var contractTemplate = getCotaContractTemplate(runtimeApi, ownerId);

    if (mode === 'gather') {
      nextSlotCount = Math.max(0, nextSlotCount - 1);
      setCotaFamilyBaseValue(runtimeApi, ownerId, 'good', getCotaFamilyBaseValue(runtimeApi, ownerId, 'good') + COTA_GATHER_VALUE_DELTA + contractTemplate.gatherBaseBonus, {
        source: 'gather_or_spread',
        mode: mode,
        phase: phase,
        cardType: 'good'
      });
      setCotaFamilyBaseValue(runtimeApi, ownerId, 'bad', getCotaFamilyBaseValue(runtimeApi, ownerId, 'bad') + COTA_GATHER_VALUE_DELTA + contractTemplate.gatherBaseBonus, {
        source: 'gather_or_spread',
        mode: mode,
        phase: phase,
        cardType: 'bad'
      });
      setCotaFamilyBaseValue(runtimeApi, ownerId, 'misc', getCotaFamilyBaseValue(runtimeApi, ownerId, 'misc') + COTA_MISC_GATHER_VALUE_DELTA, {
        source: 'gather_or_spread',
        mode: mode,
        phase: phase,
        cardType: 'misc'
      });
      cards = mapAllCotaCards(
        cards,
        COTA_GATHER_VALUE_DELTA,
        COTA_MISC_GATHER_VALUE_DELTA,
        COTA_GATHER_COST_DELTA,
        contractTemplate.gatherBaseBonus
      );
      setCotaSlotCount(runtimeApi, ownerId, nextSlotCount, {
        source: 'gather_or_spread',
        mode: mode,
        phase: phase
      });
      setCotaCards(runtimeApi, ownerId, cards, {
        source: 'gather_or_spread',
        mode: mode,
        phase: phase
      });
      var overflowCount = Math.max(0, cards.length - nextSlotCount);
      if (overflowCount > 0) {
        var overflowCards = pickCotaOverflowCards(cards, overflowCount);
        var overflowIds = Object.create(null);
        for (var oi = 0; oi < overflowCards.length; oi++) {
          overflowIds[String(overflowCards[oi].id)] = true;
        }
        resolveCotaBurst(runtimeApi, ownerId, overflowCards, {
          phase: phase,
          reason: 'cota_gather_overflow',
          currentCards: cards
        });
        cards = cards.filter(function(card) {
          return !overflowIds[String(card.id)];
        });
        setCotaCards(runtimeApi, ownerId, cards, {
          source: 'gather_or_spread_overflow',
          mode: mode,
          phase: phase
        });
      }
    } else {
      nextSlotCount += 1;
      setCotaFamilyBaseValue(runtimeApi, ownerId, 'good', getCotaFamilyBaseValue(runtimeApi, ownerId, 'good') + COTA_SPREAD_VALUE_DELTA + contractTemplate.spreadBaseBonus, {
        source: 'gather_or_spread',
        mode: mode,
        phase: phase,
        cardType: 'good'
      });
      setCotaFamilyBaseValue(runtimeApi, ownerId, 'bad', getCotaFamilyBaseValue(runtimeApi, ownerId, 'bad') + COTA_SPREAD_VALUE_DELTA + contractTemplate.spreadBaseBonus, {
        source: 'gather_or_spread',
        mode: mode,
        phase: phase,
        cardType: 'bad'
      });
      setCotaFamilyBaseValue(runtimeApi, ownerId, 'misc', getCotaFamilyBaseValue(runtimeApi, ownerId, 'misc') + COTA_MISC_SPREAD_VALUE_DELTA, {
        source: 'gather_or_spread',
        mode: mode,
        phase: phase,
        cardType: 'misc'
      });
      cards = mapAllCotaCards(cards, COTA_SPREAD_VALUE_DELTA, COTA_MISC_SPREAD_VALUE_DELTA, COTA_SPREAD_COST_DELTA, contractTemplate.spreadBaseBonus);
      setCotaSlotCount(runtimeApi, ownerId, nextSlotCount, {
        source: 'gather_or_spread',
        mode: mode,
        phase: phase
      });
      setCotaCards(runtimeApi, ownerId, cards, {
        source: 'gather_or_spread',
        mode: mode,
        phase: phase
      });
      if (contractTemplate.spreadNewCardCostDelta !== 0) {
        setCotaNewCardCostDelta(runtimeApi, ownerId, getCotaNewCardCostDelta(runtimeApi, ownerId) + contractTemplate.spreadNewCardCostDelta, {
          source: 'gather_or_spread',
          mode: mode,
          phase: phase
        });
      }
    }

    var wasFault = isCotaFaultState(runtimeApi, ownerId);
    var isFault = syncCotaFaultStateFromCards(runtimeApi, ownerId, 'gather_or_spread', phase);
    if (wasFault && isFault) {
      applyCotaFaultActionBump(runtimeApi, ownerId, 'gather_or_spread', phase);
    }
  }

  function handleCotaRealityFaultLink(payload, runtimeApi) {
    var skill = payload && payload.skill;
    if (!skill || skill.ownerId == null || skill.skillKey !== 'reality') return;
    var owner = getPlayerById(runtimeApi, skill.ownerId);
    if (!owner || (owner.role !== 'KAZU' && owner.subRole !== 'KAZU')) return;
    var players = getCotaPlayers(runtimeApi);
    var phase = resolveRuntimePhase(runtimeApi, payload);
    for (var i = 0; i < players.length; i++) {
      var player = players[i];
      if (!player || player.isActive === false || player.folded) continue;
      ensureCotaFaultState(runtimeApi, player.id, 'cota_reality_fault', phase);
    }
  }

  function handleCotaSkillActivationEvent(payload, runtimeApi) {
    if (!payload || !payload.skill || payload.skill.ownerId == null) return;
    handleCotaRealityFaultLink(payload, runtimeApi);
    var effect = payload.type || payload.skill.effect;
    if (effect !== 'deal_card' && effect !== 'gather_or_spread') return;
    if (payload.__cotaRuntimeHandled) return;
    payload.__cotaRuntimeHandled = true;
    if (effect === 'deal_card') {
      handleCotaDealCard(payload, runtimeApi);
      return;
    }
    if (effect === 'gather_or_spread') {
      handleCotaGatherOrSpread(payload, runtimeApi);
    }
  }

  function captureCotaStreetCursePressure(payload, runtimeApi) {
    var snapshot = payload && Array.isArray(payload.snapshot) ? payload.snapshot : [];
    var players = getCotaPlayers(runtimeApi);
    for (var i = 0; i < players.length; i++) {
      var owner = players[i];
      var totalCurse = 0;
      for (var si = 0; si < snapshot.length; si++) {
        var force = snapshot[si];
        if (!force || force.type !== 'curse') continue;
        if (force.ownerId === owner.id) continue;
        if (force.targetId !== owner.id) continue;
        totalCurse += Math.max(0, Number(force.effectivePower != null ? force.effectivePower : force.power || 0));
      }
      setCotaSelfCursePressure(runtimeApi, owner.id, totalCurse, {
        source: 'forces:resolved',
        phase: payload && payload.phase != null ? payload.phase : null
      });
    }
  }

  function shouldCotaBurstAtRoundStart(runtimeApi, ownerId, cards) {
    if (!isCotaFaultState(runtimeApi, ownerId)) return false;
    if (!cards || !cards.length) return false;
    var rate = getCotaBustRate(runtimeApi, ownerId);
    if (rate <= 0) return false;
    if (rate >= 1) return true;
    return Math.random() < rate;
  }

  function settleCotaRound(runtimeApi, ownerId, phase, reason) {
    var owner = getPlayerById(runtimeApi, ownerId);
    if (!owner || !isRolePlayer(owner, 'COTA')) return;

    var cards = getCotaCards(runtimeApi, ownerId);
    if (!cards.length) {
      clearCotaTransientStreetState(runtimeApi, ownerId);
      return;
    }
    if (owner.isActive === false || owner.folded) {
      return;
    }

    var state = {
      selfCursePressure: getCotaSelfCursePressure(runtimeApi, ownerId)
    };
    var familyCounts = getCotaFamilyCounts(cards);

    if (shouldCotaBurstAtRoundStart(runtimeApi, ownerId, cards)) {
      resolveCotaBurst(runtimeApi, ownerId, cards, {
        phase: phase,
        reason: reason || 'cota_round_start_bust',
        currentCards: cards,
        familyCounts: familyCounts,
        state: state
      });
      clearCotaBurstState(runtimeApi, ownerId);
      return;
    }

    var orderedCards = cloneCotaCards(cards).sort(function(a, b) {
      return Number(a.slotIndex || 0) - Number(b.slotIndex || 0);
    });

    for (var i = 0; i < orderedCards.length; i++) {
      var card = orderedCards[i];
      var pool = getPlayerManaPool(runtimeApi, ownerId);
      var currentMana = pool ? Math.max(0, Number(pool.current || 0)) : 0;
      var settleManaCost = Math.max(0, Number(card.settleManaCost || 0));
      if (settleManaCost > currentMana) {
        resolveCotaBurst(runtimeApi, ownerId, orderedCards.slice(i), {
          phase: phase,
          reason: reason || 'cota_mana_shortage',
          currentCards: orderedCards.slice(i),
          familyCounts: familyCounts,
          state: state
        });
        clearCotaBurstState(runtimeApi, ownerId);
        return;
      }
      if (settleManaCost > 0) {
        setManaCurrent(runtimeApi, ownerId, currentMana - settleManaCost, 'cota_settle_cost');
      }
      state = resolveCotaCardEffect(runtimeApi, ownerId, card, phase, familyCounts, {
        sourceKey: 'cota_normal_settle',
        state: state
      });
    }
    setCotaSelfCursePressure(runtimeApi, ownerId, 0, {
      source: reason || 'cota_round_settled',
      phase: phase
    });
  }

  function processCotaStreetStart(runtimeApi, payload, phaseOverride, reason) {
    var phase = phaseOverride || resolveRuntimePhase(runtimeApi, payload);
    var players = getCotaPlayers(runtimeApi);
    for (var i = 0; i < players.length; i++) {
      settleCotaRound(runtimeApi, players[i].id, phase, reason || 'cota_street_start');
    }
  }

  Object.assign(Builtin, {
    "cotaCardSerial": cotaCardSerial,
    "getCotaPlayers": getCotaPlayers,
    "isCotaAssetKey": isCotaAssetKey,
    "normalizeCotaCardType": normalizeCotaCardType,
    "cloneCotaCards": cloneCotaCards,
    "getCotaAsset": getCotaAsset,
    "getCotaAssetValue": getCotaAssetValue,
    "getCotaDefaultBaseValue": getCotaDefaultBaseValue,
    "setCotaAsset": setCotaAsset,
    "clearCotaAsset": clearCotaAsset,
    "getCotaSlotCount": getCotaSlotCount,
    "setCotaSlotCount": setCotaSlotCount,
    "getCotaCards": getCotaCards,
    "getCotaBaseValueKey": getCotaBaseValueKey,
    "deriveCotaFamilyBaseValueFromCards": deriveCotaFamilyBaseValueFromCards,
    "getCotaFamilyBaseValue": getCotaFamilyBaseValue,
    "setCotaFamilyBaseValue": setCotaFamilyBaseValue,
    "primeCotaFamilyBaseValues": primeCotaFamilyBaseValues,
    "setCotaCards": setCotaCards,
    "isCotaFaultState": isCotaFaultState,
    "getCotaBustRate": getCotaBustRate,
    "setCotaFaultState": setCotaFaultState,
    "setCotaBustRate": setCotaBustRate,
    "setOrClearCotaSeatMark": setOrClearCotaSeatMark,
    "syncCotaSeatMarks": syncCotaSeatMarks,
    "getCotaSelfCursePressure": getCotaSelfCursePressure,
    "setCotaSelfCursePressure": setCotaSelfCursePressure,
    "getCotaNewCardCostDelta": getCotaNewCardCostDelta,
    "setCotaNewCardCostDelta": setCotaNewCardCostDelta,
    "getCotaFirstBustBonusState": getCotaFirstBustBonusState,
    "setCotaFirstBustBonusState": setCotaFirstBustBonusState,
    "getCotaFaultEffect": getCotaFaultEffect,
    "getCotaContractTemplate": getCotaContractTemplate,
    "getCotaFamilyCounts": getCotaFamilyCounts,
    "getCotaCardPower": getCotaCardPower,
    "findFirstEmptyCotaSlot": findFirstEmptyCotaSlot,
    "buildCotaCard": buildCotaCard,
    "mapAllCotaCards": mapAllCotaCards,
    "ensureCotaFaultState": ensureCotaFaultState,
    "clearCotaFaultState": clearCotaFaultState,
    "applyCotaFaultActionBump": applyCotaFaultActionBump,
    "chooseRandomCotaOpponent": chooseRandomCotaOpponent,
    "syncCotaFaultStateFromCards": syncCotaFaultStateFromCards,
    "resolveCotaMiscMana": resolveCotaMiscMana,
    "resolveCotaCardEffect": resolveCotaCardEffect,
    "consumeCotaFirstBustBonus": consumeCotaFirstBustBonus,
    "resolveCotaBurst": resolveCotaBurst,
    "pickCotaOverflowCards": pickCotaOverflowCards,
    "clearCotaTransientStreetState": clearCotaTransientStreetState,
    "clearCotaBurstState": clearCotaBurstState,
    "resetAllCotaPersistentState": resetAllCotaPersistentState,
    "primeCotaPersistentState": primeCotaPersistentState,
    "handleCotaDealCard": handleCotaDealCard,
    "handleCotaGatherOrSpread": handleCotaGatherOrSpread,
    "handleCotaRealityFaultLink": handleCotaRealityFaultLink,
    "handleCotaSkillActivationEvent": handleCotaSkillActivationEvent,
    "captureCotaStreetCursePressure": captureCotaStreetCursePressure,
    "shouldCotaBurstAtRoundStart": shouldCotaBurstAtRoundStart,
    "settleCotaRound": settleCotaRound,
    "processCotaStreetStart": processCotaStreetStart
  });
})(window);
