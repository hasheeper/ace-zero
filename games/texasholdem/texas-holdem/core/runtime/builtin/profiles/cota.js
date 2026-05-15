/**
 * Runtime Module: BuiltinRoleModules / COTA profile AI
 * Split from the legacy builtin-role-modules.js without behavior changes.
 */
(function(global) {
  'use strict';

  var Builtin = global.AceBuiltinRuntime = global.AceBuiltinRuntime || {};

  function getPlayerManaPool() { return Builtin.getPlayerManaPool.apply(null, arguments); }
  function normalizeCotaCardType() { return Builtin.normalizeCotaCardType.apply(null, arguments); }
  function getCotaSlotCount() { return Builtin.getCotaSlotCount.apply(null, arguments); }
  function getCotaCards() { return Builtin.getCotaCards.apply(null, arguments); }
  function getCotaFamilyBaseValue() { return Builtin.getCotaFamilyBaseValue.apply(null, arguments); }
  function isCotaFaultState() { return Builtin.isCotaFaultState.apply(null, arguments); }
  function getCotaBustRate() { return Builtin.getCotaBustRate.apply(null, arguments); }
  function getCotaSelfCursePressure() { return Builtin.getCotaSelfCursePressure.apply(null, arguments); }
  function getCotaFamilyCounts() { return Builtin.getCotaFamilyCounts.apply(null, arguments); }

  function getCotaAiState(runtimeApi, ownerId) {
    var cards = getCotaCards(runtimeApi, ownerId);
    var counts = getCotaFamilyCounts(cards);
    var pointTotals = { good: 0, bad: 0, misc: 0 };
    var manaTotals = { good: 0, bad: 0, misc: 0 };

    for (var i = 0; i < cards.length; i++) {
      var card = cards[i] || {};
      var type = normalizeCotaCardType(card.cardType);
      if (!type || pointTotals[type] == null) continue;
      pointTotals[type] += Math.max(0, Number(card.baseValue || 0));
      manaTotals[type] += Math.max(0, Number(card.settleManaCost || 0));
    }

    var manaPool = getPlayerManaPool(runtimeApi, ownerId);
    var manaCurrent = manaPool ? Math.max(0, Number(manaPool.current || 0)) : 0;
    var manaMax = manaPool ? Math.max(1, Number(manaPool.max || manaCurrent || 1)) : Math.max(1, manaCurrent || 1);
    var slotCount = getCotaSlotCount(runtimeApi, ownerId);

    return {
      cards: cards,
      counts: counts,
      pointTotals: pointTotals,
      manaTotals: manaTotals,
      totalCards: cards.length,
      slotCount: slotCount,
      emptySlots: Math.max(0, slotCount - cards.length),
      totalPointValue: pointTotals.good + pointTotals.bad + pointTotals.misc,
      totalManaCost: manaTotals.good + manaTotals.bad + manaTotals.misc,
      faultState: isCotaFaultState(runtimeApi, ownerId),
      bustRate: getCotaBustRate(runtimeApi, ownerId),
      selfCursePressure: getCotaSelfCursePressure(runtimeApi, ownerId),
      manaCurrent: manaCurrent,
      manaMax: manaMax,
      manaRatio: manaCurrent / Math.max(1, manaMax),
      familyBaseValues: {
        good: getCotaFamilyBaseValue(runtimeApi, ownerId, 'good'),
        bad: getCotaFamilyBaseValue(runtimeApi, ownerId, 'bad'),
        misc: getCotaFamilyBaseValue(runtimeApi, ownerId, 'misc')
      }
    };
  }

  function chooseCotaDealCardType(state) {
    if (!state || state.emptySlots <= 0) return null;
    if (state.counts.misc <= 0) return 'misc';
    if (state.counts.good <= 0) return 'good';
    if (state.counts.bad <= 0) return 'bad';

    if (state.selfCursePressure >= 10 && state.counts.bad < 2) return 'bad';
    if (state.manaRatio < 0.42 || state.totalManaCost >= Math.max(8, state.manaCurrent * 0.55)) {
      return state.counts.misc < 2 ? 'misc' : (state.counts.good <= state.counts.bad ? 'good' : 'bad');
    }
    if (state.pointTotals.good <= state.pointTotals.bad && state.counts.good <= 2) return 'good';
    if (state.counts.bad <= 1 || state.familyBaseValues.bad < state.familyBaseValues.good) return 'bad';
    if (!state.faultState && state.counts.misc < 2) return 'misc';
    return state.counts.good <= state.counts.bad ? 'good' : 'bad';
  }

  function isCotaAiLineOnline(state) {
    if (!state) return false;
    return state.counts.good > 0 && state.counts.bad > 0 && state.counts.misc > 0;
  }

  function shouldUseCotaDealCard(roleCtx, runtimeApi) {
    var phase = String(roleCtx.ctx && roleCtx.ctx.phase || '').toLowerCase();
    if (phase === 'river') return false;
    var owner = roleCtx.owner || {};
    var state = getCotaAiState(runtimeApi, owner.id);
    if (state.emptySlots <= 0) return false;

    var cardType = chooseCotaDealCardType(state);
    if (!cardType) return false;
    var lineOnline = isCotaAiLineOnline(state);
    var effectiveFullCount = Math.min(Math.max(1, state.slotCount), 3);
    var arrangeMode = chooseCotaArrangeMode(state);
    if (lineOnline && state.totalCards >= effectiveFullCount && arrangeMode === 'gather') return false;
    if (lineOnline && state.totalCards >= 3 && state.totalManaCost >= Math.max(8, state.manaCurrent * 0.42)) return false;
    if (lineOnline && state.totalCards >= 4) return false;
    if (state.totalCards <= 0) return true;
    if (state.counts.misc <= 0) return true;
    if (state.totalCards < 2) return true;
    if (phase === 'preflop' || phase === 'flop') {
      if (state.manaRatio >= 0.32) return true;
      return cardType === 'misc' && state.manaRatio >= 0.24;
    }
    if (state.totalManaCost >= Math.max(10, state.manaCurrent * 0.65)) {
      return cardType === 'misc' && state.manaRatio >= 0.36;
    }
    return state.manaRatio >= 0.45;
  }

  function chooseCotaArrangeMode(state) {
    if (!state || state.totalCards <= 0) return null;

    var lineOnline = isCotaAiLineOnline(state);
    var effectiveFullCount = Math.min(Math.max(1, state.slotCount), 3);
    var lineReadyToRoll = lineOnline && state.totalCards >= effectiveFullCount;
    var canGatherWithoutOverflow = state.totalCards <= Math.max(0, state.slotCount - 1);
    var gatherOverflowCount = Math.max(0, state.totalCards - Math.max(0, state.slotCount - 1));
    if (state.totalManaCost >= Math.max(8, state.manaCurrent * 0.52)) return 'spread';
    if (state.manaRatio < 0.42) return 'spread';
    if (state.faultState && state.bustRate >= 0.25 && state.totalManaCost >= Math.max(6, state.manaCurrent * 0.34)) return 'spread';
    if (lineReadyToRoll &&
        state.manaRatio >= 0.48 &&
        state.totalManaCost <= Math.max(10, state.manaCurrent * 0.38)) {
      return 'gather';
    }
    if (lineOnline &&
        state.totalCards >= 3 &&
        state.manaRatio >= 0.56 &&
        state.totalPointValue < 48) {
      return 'gather';
    }
    if (canGatherWithoutOverflow &&
        state.manaRatio >= 0.46 &&
        state.totalManaCost <= Math.max(8, state.manaCurrent * 0.42) &&
        (state.totalPointValue < 40 || state.totalCards <= 1 || lineOnline)) {
      return 'gather';
    }
    if (gatherOverflowCount === 1 &&
        state.slotCount >= 3 &&
        state.manaRatio >= 0.62 &&
        state.bustRate <= 0.15 &&
        state.totalPointValue <= 42) {
      return 'gather';
    }
    if (state.emptySlots === 0 && state.totalCards >= state.slotCount &&
        (state.manaRatio < 0.62 || state.counts.misc > 0 || state.totalManaCost >= Math.max(6, state.manaCurrent * 0.38))) {
      return 'spread';
    }
    if (canGatherWithoutOverflow && state.manaRatio >= 0.65 && state.totalCards < 3) return 'gather';
    if (state.emptySlots >= 2 && state.totalCards <= 1 && state.manaRatio >= 0.45) return 'gather';
    if (state.slotCount > 3 && lineOnline && state.totalManaCost >= Math.max(8, state.manaCurrent * 0.34)) return 'spread';
    if (state.emptySlots === 0 && state.totalCards >= state.slotCount && state.slotCount < 4 && state.manaRatio < 0.55) return 'spread';
    return null;
  }

  function createCotaProfileHandler(runtimeApi) {
    function decideCotaSkill(roleCtx, fallback) {
      var skill = roleCtx.skill || {};
      if (skill.effect === 'deal_card') {
        return shouldUseCotaDealCard(roleCtx, runtimeApi);
      }
      if (skill.effect === 'gather_or_spread') {
        var owner = roleCtx.owner || {};
        return chooseCotaArrangeMode(getCotaAiState(runtimeApi, owner.id)) != null;
      }
      return fallback(roleCtx);
    }

    return {
      shouldUseSkill: function(roleCtx, fallback) {
        return decideCotaSkill(roleCtx, fallback);
      },
      augmentSkillOptions: function(roleCtx, fallback) {
        var next = typeof fallback === 'function' ? fallback(roleCtx) : {};
        var options = next && typeof next === 'object' ? Object.assign({}, next) : {};
        var owner = roleCtx.owner || {};
        var state = getCotaAiState(runtimeApi, owner.id);
        var skill = roleCtx.skill || {};

        if (skill.effect === 'deal_card') {
          options.cardType = chooseCotaDealCardType(state);
          options.rolePlan = 'cota_balance_deal';
        } else if (skill.effect === 'gather_or_spread') {
          options.mode = chooseCotaArrangeMode(state);
          options.rolePlan = options.mode === 'spread'
            ? 'cota_pressure_release'
            : options.mode === 'gather'
              ? 'cota_power_roll'
              : 'cota_hold';
        }

        return options;
      }
    };
  }

  Object.assign(Builtin, {
    "getCotaAiState": getCotaAiState,
    "chooseCotaDealCardType": chooseCotaDealCardType,
    "isCotaAiLineOnline": isCotaAiLineOnline,
    "shouldUseCotaDealCard": shouldUseCotaDealCard,
    "chooseCotaArrangeMode": chooseCotaArrangeMode,
    "createCotaProfileHandler": createCotaProfileHandler
  });
})(window);
