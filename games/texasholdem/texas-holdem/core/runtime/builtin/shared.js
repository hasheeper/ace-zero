/**
 * Runtime Module: BuiltinRoleModules / Shared helpers and constants
 * Split from the legacy builtin-role-modules.js without behavior changes.
 */
(function(global) {
  'use strict';

  var Builtin = global.AceBuiltinRuntime = global.AceBuiltinRuntime || {};

  function getStreetIndex(phase) {
    var key = String(phase || '').toLowerCase();
    if (key === 'preflop') return 0;
    if (key === 'flop') return 1;
    if (key === 'turn') return 2;
    if (key === 'river') return 3;
    return 99;
  }

  function getNextStreetPhase(phase) {
    var key = String(phase || '').toLowerCase();
    if (key === 'preflop') return 'flop';
    if (key === 'flop') return 'turn';
    if (key === 'turn') return 'river';
    return null;
  }

  var VV_MARK_ICON = '../../../assets/svg/star-pupil.svg';

  var VV_BUBBLE_KEYS = ['bubble_fortune', 'bubble_chaos', 'bubble_mana'];

  var VV_POSITION_KEY = 'vv_positions';

  var VV_POSITION_UNIT = 12;

  var VV_DEVIATION_THRESHOLDS = [0.2, 0.4, 0.6];

  var POPPY_MIRACLE_FLAG_KEY = 'poppy_miracle_flag';

  var POPPY_MIRACLE_PENDING_KEY = 'poppy_miracle_pending';

  var POPPY_MIRACLE_PACKS_KEY = 'poppy_miracle_packs';

  var POPPY_STREET_TOTAL_MANA_SPENT_KEY = 'poppy_street_total_mana_spent';

  var POPPY_STREET_PSYCHE_CHAOS_KEY = 'poppy_street_psyche_chaos';

  var POPPY_LAST_MANA_KEY = 'poppy_last_mana';

  var POPPY_MANA_TRACK_KEY = 'poppy_mana_track';

  var POPPY_LUCKY_FIND_PHASE_KEY = 'poppy_lucky_find_phase';

  var POPPY_MIRACLE_MARK_KEY = 'poppy_miracle_mark';

  var POPPY_MIRACLE_ICON = '../../../assets/svg/poppy1.svg';

  var EULALIA_BURDEN_ICON = '../../../assets/svg/boomerang-cross.svg';

  var EULALIA_BURST_ICON = '../../../assets/svg/fast-forward-button.svg';

  var EULALIA_NOMINAL_BURDEN_KEY = 'eulalia_nominal_burden';

  var EULALIA_BURDEN_LAYERS_KEY = 'eulalia_burden_layers';

  var EULALIA_QUEUED_BURDEN_KEY = 'eulalia_queued_burden';

  var EULALIA_CARRYOVER_BURDEN_KEY = 'eulalia_carryover_burden';

  var EULALIA_ABSOLUTION_TOTAL_KEY = 'eulalia_absolution_total';

  var EULALIA_BURST_COUNTDOWN_KEY = 'eulalia_burst_countdown';

  var EULALIA_ABSOLUTION_CONTRACT_KEY = 'eulalia_absolution_contract';

  var EULALIA_ABSORB_WINDOW_CONTRACT_KEY = 'eulalia_absorb_window_contract';

  var EULALIA_STREET_BURDEN_KEY = 'eulalia_street_burden';

  var EULALIA_ABSORB_ACTIVE_KEY = 'eulalia_absorb_active';

  var EULALIA_BURST_PENDING_KEY = 'eulalia_burst_pending';

  var EULALIA_SANCTUARY_PHASE_KEY = 'eulalia_sanctuary_phase';

  var KAKO_EULALIA_BURDEN_TRACK_PREFIX = 'asset:eulalia_burden:';

  var KUZUHA_DEBT_ICON = '../../../assets/svg/fox-head.svg';

  var KUZUHA_DEBT_PREFIX = 'kuzuha_debt_rot:';

  var KUZUHA_CALLED_PREFIX = 'kuzuha_debt_called:';

  var KUZUHA_SETTLED_TOTAL_KEY = 'kuzuha_debt_settled_total';

  var KUZUHA_HIGHWATER_KEY = 'kuzuha_debt_highwater';

  var TRIXIE_WILD_ICON = '../../../assets/svg/card-joker.svg';

  var TRIXIE_BLIND_BOX_ICON = '../../../assets/svg/party-popper.svg';

  var TRIXIE_REWRITE_DELAY_ICON = '../../../assets/svg/fast-forward-button.svg';

  var TRIXIE_REWRITE_EXTEND_ICON = '../../../assets/svg/health-increase.svg';

  var TRIXIE_WILD_CARD_KEY = 'trixie_wild_card';

  var TRIXIE_STREET_FORTUNE_KEY = 'trixie_street_taken_fortune';

  var TRIXIE_STREET_CURSE_KEY = 'trixie_street_taken_curse';

  var TRIXIE_STREET_RAW_FORTUNE_KEY = 'trixie_street_taken_fortune_raw';

  var TRIXIE_STREET_RAW_CURSE_KEY = 'trixie_street_taken_curse_raw';

  var TRIXIE_STREET_BONUS_KEY = 'trixie_street_bonus';

  var TRIXIE_REWRITE_QUEUE_KEY = 'trixie_rewrite_queue';

  var TRIXIE_BLIND_BOX_KEY = 'trixie_blind_box_contract';

  var COTA_SLOT_COUNT_KEY = 'cota_slot_count';

  var COTA_CARDS_KEY = 'cota_cards';

  var COTA_FAULT_STATE_KEY = 'cota_fault_state';

  var COTA_BUST_RATE_KEY = 'cota_bust_rate';

  var COTA_SELF_CURSE_PRESSURE_KEY = 'cota_self_curse_pressure';

  var COTA_FIRST_BUST_BONUS_KEY = 'cota_first_bust_bonus_used';

  var COTA_NEW_CARD_COST_DELTA_KEY = 'cota_new_card_cost_delta';

  var COTA_GOOD_BASE_VALUE_KEY = 'cota_good_base_value';

  var COTA_BAD_BASE_VALUE_KEY = 'cota_bad_base_value';

  var COTA_MISC_BASE_VALUE_KEY = 'cota_misc_base_value';

  var COTA_DEFAULT_SLOT_COUNT = 3;

  var COTA_GATHER_VALUE_DELTA = 6;

  var COTA_GATHER_COST_DELTA = 2;

  var COTA_SPREAD_VALUE_DELTA = -3;

  var COTA_SPREAD_COST_DELTA = -1;

  var COTA_MISC_GATHER_VALUE_DELTA = 6;

  var COTA_MISC_SPREAD_VALUE_DELTA = -3;

  var COTA_MISC_BASE_GAIN_RATE = 0.6;

  var COTA_MISC_RATE_PER_POWER = 0.01;

  var COTA_MISC_MANA_MULTIPLIER = 0.5;

  var COTA_CARD_DEFAULTS = {
    good: { baseValue: 8, settleManaCost: 2 },
    bad: { baseValue: 8, settleManaCost: 2 },
    misc: { baseValue: 8, settleManaCost: 2 }
  };

  var COTA_BASE_VALUE_KEYS = {
    good: COTA_GOOD_BASE_VALUE_KEY,
    bad: COTA_BAD_BASE_VALUE_KEY,
    misc: COTA_MISC_BASE_VALUE_KEY
  };

  var COTA_MARK_ICON = '../../../assets/svg/ace.svg';

  var COTA_FAULT_ICON = '../../../assets/svg/hazard-sign.svg';

  var KAKO_RED_SEAL_ICON = '../../../assets/svg/stamper.svg';

  var KAKO_RULING_ICON = '../../../assets/svg/fountain-pen.svg';

  var KAKO_RED_SEAL_KEY = 'kako_red_seal';

  var KAKO_REDLINE_RATE_KEY = 'kako_redline_rate';

  var KAKO_STREET_FORTUNE_KEY = 'kako_street_added_fortune';

  var KAKO_STREET_CURSE_KEY = 'kako_street_added_curse';

  var KAKO_LAST_MANA_DELTA_KEY = 'kako_last_mana_delta';

  var KAKO_USED_LIMITED_KEY = 'kako_used_limited_skill_this_street';

  var KAKO_RULING_CONTRACT_KEY = 'kako_ruling_contract';

  var KAKO_RULING_PENDING_MARK_KEY = 'kako_ruling_pending';

  function hasRecentScout(roleCtx) {
    var owner = roleCtx.owner || {};
    return !!(owner.ai && owner.ai.scoutMemory && owner.ai.scoutMemory.some(function(entry) {
      return entry && entry.phaseSeen === roleCtx.ctx.phase;
    }));
  }

  function getInfoPressure(roleCtx) {
    var ctx = roleCtx.ctx || {};
    var owner = roleCtx.owner || {};
    var toCall = ctx.toCall || 0;
    var pot = ctx.pot || 0;
    return toCall > 0 && (toCall >= pot * 0.18 || toCall >= Math.max(40, (owner.chips || 0) * 0.12));
  }

  function hasEnemyFortunePressure(roleCtx) {
    var pending = roleCtx.pendingForces || [];
    var primary = roleCtx.primaryTarget;
    if (!primary) return false;
    return pending.some(function(force) {
      if (!force) return false;
      if (force.ownerId !== primary.id) return false;
      return force.type === 'fortune' || force.effect === 'royal_decree';
    });
  }

  function hasReadyOwnerSkill(roleCtx, effect) {
    var ctx = roleCtx.ctx || {};
    var owner = roleCtx.owner || {};
    var skillSystem = ctx.skillSystem;
    if (!skillSystem || !skillSystem.skills) return false;

    var found = false;
    skillSystem.skills.forEach(function(candidate) {
      if (found || !candidate) return;
      if (candidate.ownerId !== owner.id) return;
      if (candidate.effect !== effect) return;
      if (candidate.activation !== 'active') return;
      if (typeof skillSystem.getSkillAvailability === 'function') {
        var availability = skillSystem.getSkillAvailability(candidate, ctx, {
          allowOutOfTurn: true,
          enforcePhaseRules: true,
          resolveOptions: false,
          skipOptionValidation: true
        });
        if (!availability.ok) return;
      }
      found = true;
    });

    return found;
  }

  function hasOwnerPendingEffect(roleCtx, effect) {
    var owner = roleCtx.owner || {};
    var pending = roleCtx.pendingForces || [];
    return pending.some(function(force) {
      if (!force || force.ownerId !== owner.id) return false;
      if (force.effect === effect || force.type === effect) return true;
      if (effect === 'curse' && force.type === 'curse') return true;
      if (effect === 'cooler' && force.effect === 'cooler') return true;
      return false;
    });
  }

  function hasOwnerPendingSkillKey(roleCtx, skillKey) {
    var owner = roleCtx.owner || {};
    var pending = roleCtx.pendingForces || [];
    return pending.some(function(force) {
      if (!force || force.ownerId !== owner.id) return false;
      return force.skillKey === skillKey ||
        force.effect === skillKey ||
        force.source === skillKey;
    });
  }

  function scriptedChance(phase, values) {
    if (phase === 'preflop') return values.preflop;
    if (phase === 'flop') return values.flop;
    if (phase === 'turn') return values.turn;
    return values.river;
  }

  function getTraitSystem(runtimeApi) {
    return runtimeApi &&
      runtimeApi.moz &&
      runtimeApi.moz.combatFormula &&
      runtimeApi.moz.combatFormula.traitSystem
      ? runtimeApi.moz.combatFormula.traitSystem
      : null;
  }

  function hasTraitEffect(runtimeApi, ownerId, effectType) {
    var traitSystem = getTraitSystem(runtimeApi);
    if (!traitSystem || typeof traitSystem.hasEffect !== 'function') return false;
    var result = traitSystem.hasEffect(ownerId, effectType);
    return !!(result && result.has);
  }

  function getTraitEffect(runtimeApi, ownerId, effectType) {
    var traitSystem = getTraitSystem(runtimeApi);
    if (!traitSystem || typeof traitSystem.hasEffect !== 'function') return null;
    var result = traitSystem.hasEffect(ownerId, effectType);
    return result && result.has ? (result.value || null) : null;
  }

  function getGamePlayers(runtimeApi) {
    var gameState = runtimeApi && typeof runtimeApi.getGameState === 'function'
      ? runtimeApi.getGameState()
      : null;
    return gameState && Array.isArray(gameState.players) ? gameState.players : [];
  }

  function getPlayerById(runtimeApi, ownerId) {
    var players = getGamePlayers(runtimeApi);
    for (var i = 0; i < players.length; i++) {
      if (players[i] && players[i].id === ownerId) return players[i];
    }
    return null;
  }

  function getActiveOpponents(runtimeApi, ownerId) {
    return getGamePlayers(runtimeApi).filter(function(player) {
      return player &&
        player.id !== ownerId &&
        !player.folded &&
        player.isActive !== false;
    });
  }

  function hasStatusMark(roleCtx, targetId, key) {
    var skillSystem = roleCtx && roleCtx.ctx ? roleCtx.ctx.skillSystem : null;
    if (!skillSystem || typeof skillSystem.hasStatusMark !== 'function' || targetId == null) return false;
    return !!skillSystem.hasStatusMark(targetId, key);
  }

  function scoreThreatTarget(player) {
    if (!player) return -1;
    var chips = Math.max(1, Number(player.chips || 0));
    var commit = Number(player.totalBet || 0);
    return commit * 1.5 + chips * 0.1;
  }

  function pickRoleTarget(roleCtx, predicate) {
    var candidates = (roleCtx.opponents || []).filter(function(player) {
      return player && (!predicate || predicate(player));
    });
    if (!candidates.length) return null;
    candidates.sort(function(a, b) {
      return scoreThreatTarget(b) - scoreThreatTarget(a);
    });
    return candidates[0] || null;
  }

  function getLedger(runtimeApi) {
    return runtimeApi && typeof runtimeApi.getAssetLedger === 'function'
      ? runtimeApi.getAssetLedger()
      : null;
  }

  function getSkillSystem(runtimeApi) {
    return runtimeApi ? runtimeApi.skillSystem : null;
  }

  function buildMatchScopedSkillKey(ownerId, skillKey) {
    return 'skill:' + String(ownerId) + ':' + String(skillKey) + ':match_once';
  }

  function isMatchScopedSkillUsed(runtimeApi, ownerId, skillKey) {
    var scopeKey = buildMatchScopedSkillKey(ownerId, skillKey);
    if (runtimeApi && typeof runtimeApi.isMatchScopedUsed === 'function') {
      return !!runtimeApi.isMatchScopedUsed(scopeKey);
    }
    var skillSystem = getSkillSystem(runtimeApi);
    return !!(skillSystem && typeof skillSystem.isMatchScopedUsed === 'function' && skillSystem.isMatchScopedUsed(scopeKey));
  }

  function consumeMatchScopedSkillUse(runtimeApi, ownerId, skillKey, payload) {
    var scopeKey = buildMatchScopedSkillKey(ownerId, skillKey);
    if (runtimeApi && typeof runtimeApi.consumeMatchScopedUse === 'function') {
      return !!runtimeApi.consumeMatchScopedUse(scopeKey, Object.assign({
        ownerId: ownerId,
        skillKey: skillKey
      }, payload || {}));
    }
    var skillSystem = getSkillSystem(runtimeApi);
    return !!(skillSystem && typeof skillSystem.consumeMatchScopedUse === 'function' &&
      skillSystem.consumeMatchScopedUse(scopeKey, Object.assign({
        ownerId: ownerId,
        skillKey: skillKey
      }, payload || {})));
  }

  function getPlayerManaPool(runtimeApi, ownerId) {
    var skillSystem = getSkillSystem(runtimeApi);
    if (!skillSystem) return null;
    if (typeof skillSystem.getManaPool === 'function') return skillSystem.getManaPool(ownerId) || null;
    if (typeof skillSystem.getMana === 'function') return skillSystem.getMana(ownerId) || null;
    return null;
  }

  function getPlayerSkills(runtimeApi, ownerId) {
    var skillSystem = getSkillSystem(runtimeApi);
    if (!skillSystem || typeof skillSystem.getPlayerSkills !== 'function') return [];
    return skillSystem.getPlayerSkills(ownerId) || [];
  }

  function getForceRuntime(runtimeApi) {
    return runtimeApi && typeof runtimeApi.getForceRuntime === 'function'
      ? runtimeApi.getForceRuntime()
      : (global.ForceRuntime || null);
  }

  function emitRuntimeFlow(runtimeApi, event, payload) {
    if (!runtimeApi || !runtimeApi.runtimeFlow || typeof runtimeApi.runtimeFlow.emit !== 'function') return;
    runtimeApi.runtimeFlow.emit(event, payload);
  }

  function queueRuntimeForce(runtimeApi, force, meta) {
    var skillSystem = getSkillSystem(runtimeApi);
    if (!skillSystem || !force || !Array.isArray(skillSystem.pendingForces)) return null;
    if (!force._runtimeId && typeof skillSystem._forceSerial === 'number') {
      skillSystem._forceSerial += 1;
      force._runtimeId = 'force_' + skillSystem._forceSerial;
    }
    skillSystem.pendingForces.push(force);
    emitRuntimeFlow(runtimeApi, 'force:queued', {
      force: Object.assign({}, force),
      meta: meta || null
    });
    return force;
  }

  function removeRuntimeForces(runtimeApi, predicate, meta) {
    var skillSystem = getSkillSystem(runtimeApi);
    if (!skillSystem || !Array.isArray(skillSystem.pendingForces)) return [];

    var kept = [];
    var removed = [];
    for (var i = 0; i < skillSystem.pendingForces.length; i++) {
      var force = skillSystem.pendingForces[i];
      if (predicate(force, i)) {
        removed.push(force);
      } else {
        kept.push(force);
      }
    }

    skillSystem.pendingForces = kept;
    for (var j = 0; j < removed.length; j++) {
      emitRuntimeFlow(runtimeApi, 'force:removed', {
        force: Object.assign({}, removed[j]),
        meta: meta || null
      });
    }
    return removed;
  }

  function emitRuntimeSkillActivated(runtimeApi, skill, payload, options) {
    var skillSystem = getSkillSystem(runtimeApi);
    if (!skillSystem || typeof skillSystem.emit !== 'function' || !skill) return;
    var next = Object.assign({
      skill: Object.assign({}, skill),
      type: skill.effect || null
    }, payload || {});
    if (options) next.options = Object.assign({}, options);
    emitRuntimeFlow(runtimeApi, 'skill:activated', next);
    skillSystem.emit('skill:activated', next);
  }

  function findPlayerSkill(runtimeApi, ownerId, effect) {
    var skills = getPlayerSkills(runtimeApi, ownerId);
    for (var i = 0; i < skills.length; i++) {
      if (skills[i] && skills[i].effect === effect) return skills[i];
    }
    return null;
  }

  function isRolePlayer(player, roleId) {
    return !!(player && String(player.roleId || '').toUpperCase() === String(roleId || '').toUpperCase());
  }

  function isRuntimePlayerLive(player) {
    return !!(player &&
      player.isActive !== false &&
      !player.folded &&
      Number(player.chips || 0) > 0);
  }

  function getRolePlayers(runtimeApi, roleId, options) {
    var liveOnly = !!(options && options.liveOnly);
    return getGamePlayers(runtimeApi).filter(function(player) {
      if (!isRolePlayer(player, roleId)) return false;
      if (!liveOnly) return true;
      return isRuntimePlayerLive(player);
    });
  }

  function getLiveRolePlayers(runtimeApi, roleId) {
    return getRolePlayers(runtimeApi, roleId, { liveOnly: true });
  }

  function collectConfiguredRoleIdsFromEntry(entry, sink) {
    if (!entry || !sink) return;
    function addRole(value) {
      if (!value) return;
      var key = String(value).trim().toUpperCase();
      if (!key) return;
      sink[key] = true;
    }
    addRole(entry.roleId);
    addRole(entry.name);
    if (entry.vanguard) {
      addRole(entry.vanguard.roleId);
      addRole(entry.vanguard.name);
    }
    if (entry.rearguard) {
      addRole(entry.rearguard.roleId);
      addRole(entry.rearguard.name);
    }
  }

  function getConfiguredRoleMap(runtimeApi) {
    var map = Object.create(null);
    var config = runtimeApi && typeof runtimeApi.getGameConfig === 'function'
      ? runtimeApi.getGameConfig()
      : null;
    if (!config) return map;
    collectConfiguredRoleIdsFromEntry(config.hero, map);
    var seats = config.seats || {};
    var seatKeys = Object.keys(seats);
    for (var i = 0; i < seatKeys.length; i++) {
      collectConfiguredRoleIdsFromEntry(seats[seatKeys[i]], map);
    }
    return map;
  }

  function hasConfiguredRole(runtimeApi, roleId) {
    if (!roleId) return false;
    var configured = getConfiguredRoleMap(runtimeApi);
    return !!configured[String(roleId).trim().toUpperCase()];
  }

  function guardConfiguredRole(runtimeApi, roleId) {
    return hasConfiguredRole(runtimeApi, roleId);
  }

  function clearStatusMarkSafe(skillSystem, ownerId, key) {
    if (!skillSystem || ownerId == null || !key) return;
    if (typeof skillSystem.clearStatusMark === 'function') {
      skillSystem.clearStatusMark(ownerId, key);
    }
  }

  function getPlayerChipBaseline(player) {
    if (!player) return 0;
    var baseline = Number(
      player.initialChips != null ? player.initialChips :
      player.startingChips != null ? player.startingChips :
      player.baseChips != null ? player.baseChips :
      ((player.chips || 0) + (player.totalBet || 0))
    );
    return Math.max(0, baseline);
  }

  function getPlayerChipRatio(player) {
    var baseline = getPlayerChipBaseline(player);
    if (baseline <= 0) return 0;
    return Math.max(0, Number(player && player.chips || 0)) / baseline;
  }

  function getBubbleValue(runtimeApi, ownerId, key) {
    var ledger = getLedger(runtimeApi);
    if (!ledger || typeof ledger.getValue !== 'function') return 0;
    return ledger.getValue(ownerId, key) || 0;
  }

  function getBubbleLayerCount(runtimeApi, ownerId) {
    return getVvPositionPacks(runtimeApi, ownerId).length;
  }

  function getBubbleLayerAsset(runtimeApi, ownerId) {
    return getVvPositionAsset(runtimeApi, ownerId);
  }

  function getBubbleTotal(runtimeApi, ownerId) {
    return getBubbleValue(runtimeApi, ownerId, 'bubble_fortune') +
      getBubbleValue(runtimeApi, ownerId, 'bubble_chaos') +
      getBubbleValue(runtimeApi, ownerId, 'bubble_mana');
  }

  function getVvPositionAsset(runtimeApi, ownerId) {
    var ledger = getLedger(runtimeApi);
    if (!ledger || typeof ledger.getAsset !== 'function') return null;
    return ledger.getAsset(ownerId, VV_POSITION_KEY);
  }

  function getVvPositionPacks(runtimeApi, ownerId) {
    var asset = getVvPositionAsset(runtimeApi, ownerId);
    return asset && Array.isArray(asset.positions) ? asset.positions.slice() : [];
  }

  function getActiveTableChipTotal(runtimeApi) {
    var players = getGamePlayers(runtimeApi);
    var total = 0;
    for (var i = 0; i < players.length; i++) {
      var player = players[i];
      if (!player || player.isActive === false) continue;
      total += Math.max(0, Number(player.chips || 0));
    }
    return Math.max(1, total);
  }

  function summarizeVvTargetPositions(runtimeApi, ownerId, filterOwnerId) {
    var packs = getVvPositionPacks(runtimeApi, ownerId).filter(function(pack) {
      if (!pack) return false;
      if (filterOwnerId == null) return true;
      return pack.ownerId === filterOwnerId;
    });
    var summary = {
      packs: packs,
      count: packs.length,
      entrySize: 0,
      fortune: 0,
      chaos: 0,
      mana: 0,
      bullishSize: 0,
      bearishSize: 0
    };
    for (var i = 0; i < packs.length; i++) {
      var pack = packs[i] || {};
      var size = Math.max(1, Number(pack.entrySize != null ? pack.entrySize : 1) || 1);
      summary.entrySize += size;
      summary.fortune += Math.max(0, Number(pack.bubble_fortune || 0));
      summary.chaos += Math.max(0, Number(pack.bubble_chaos || 0));
      summary.mana += Math.max(0, Number(pack.bubble_mana || 0));
      if (pack.direction === 'bearish') summary.bearishSize += size;
      else summary.bullishSize += size;
    }
    return summary;
  }

  function syncVvTargetAssets(runtimeApi, ownerId) {
    var ledger = getLedger(runtimeApi);
    if (!ledger) return;
    var summary = summarizeVvTargetPositions(runtimeApi, ownerId);
    var meta = getVvPositionAsset(runtimeApi, ownerId) || {};

    if (summary.count > 0) {
      ledger.setAsset(ownerId, VV_POSITION_KEY, summary.count, {
        positions: summary.packs,
        entrySize: summary.entrySize,
        bullishSize: summary.bullishSize,
        bearishSize: summary.bearishSize,
        icon: VV_MARK_ICON
      });
      ledger.setAsset(ownerId, 'bubble_fortune', summary.fortune, {
        icon: VV_MARK_ICON
      });
      ledger.setAsset(ownerId, 'bubble_chaos', summary.chaos, {
        icon: VV_MARK_ICON
      });
      ledger.setAsset(ownerId, 'bubble_mana', summary.mana, {
        icon: VV_MARK_ICON
      });
    } else {
      ledger.clearAsset(ownerId, VV_POSITION_KEY);
      ledger.clearAsset(ownerId, 'bubble_fortune');
      ledger.clearAsset(ownerId, 'bubble_chaos');
      ledger.clearAsset(ownerId, 'bubble_mana');
    }
  }

  function getVvDeviationState(runtimeApi, pack, targetId) {
    var baselineTarget = Math.max(0, Number(pack && pack.baselineTargetChips || 0));
    var baselineTable = Math.max(1, Number(pack && pack.baselineTableChips || 1));
    var currentTargetPlayer = getPlayerById(runtimeApi, targetId);
    var currentTarget = Math.max(0, Number(currentTargetPlayer && currentTargetPlayer.chips || 0));
    var currentTable = getActiveTableChipTotal(runtimeApi);
    var baselineShare = baselineTarget > 0 ? (baselineTarget / baselineTable) : 0;
    var currentShare = currentTarget / currentTable;
    if (baselineShare <= 0) {
      return {
        direction: 'flat',
        level: 0,
        deltaRatio: 0,
        baselineShare: baselineShare,
        currentShare: currentShare
      };
    }
    var deltaRatio = (currentShare - baselineShare) / baselineShare;
    var absRatio = Math.abs(deltaRatio);
    var level = absRatio >= VV_DEVIATION_THRESHOLDS[2] ? 3
      : absRatio >= VV_DEVIATION_THRESHOLDS[1] ? 2
      : absRatio >= VV_DEVIATION_THRESHOLDS[0] ? 1
      : 0;
    return {
      direction: deltaRatio > 0.0001 ? 'bullish' : deltaRatio < -0.0001 ? 'bearish' : 'flat',
      level: level,
      deltaRatio: deltaRatio,
      baselineShare: baselineShare,
      currentShare: currentShare
    };
  }

  function resolveRuntimePhase(runtimeApi, payload) {
    if (payload && payload.phase != null) return String(payload.phase);
    if (runtimeApi && typeof runtimeApi.getGameState === 'function') {
      var gameState = runtimeApi.getGameState();
      if (gameState && gameState.phase != null) return String(gameState.phase);
    }
    return null;
  }

  Object.assign(Builtin, {
    "getStreetIndex": getStreetIndex,
    "getNextStreetPhase": getNextStreetPhase,
    "VV_MARK_ICON": VV_MARK_ICON,
    "VV_BUBBLE_KEYS": VV_BUBBLE_KEYS,
    "VV_POSITION_KEY": VV_POSITION_KEY,
    "VV_POSITION_UNIT": VV_POSITION_UNIT,
    "VV_DEVIATION_THRESHOLDS": VV_DEVIATION_THRESHOLDS,
    "POPPY_MIRACLE_FLAG_KEY": POPPY_MIRACLE_FLAG_KEY,
    "POPPY_MIRACLE_PENDING_KEY": POPPY_MIRACLE_PENDING_KEY,
    "POPPY_MIRACLE_PACKS_KEY": POPPY_MIRACLE_PACKS_KEY,
    "POPPY_STREET_TOTAL_MANA_SPENT_KEY": POPPY_STREET_TOTAL_MANA_SPENT_KEY,
    "POPPY_STREET_PSYCHE_CHAOS_KEY": POPPY_STREET_PSYCHE_CHAOS_KEY,
    "POPPY_LAST_MANA_KEY": POPPY_LAST_MANA_KEY,
    "POPPY_MANA_TRACK_KEY": POPPY_MANA_TRACK_KEY,
    "POPPY_LUCKY_FIND_PHASE_KEY": POPPY_LUCKY_FIND_PHASE_KEY,
    "POPPY_MIRACLE_MARK_KEY": POPPY_MIRACLE_MARK_KEY,
    "POPPY_MIRACLE_ICON": POPPY_MIRACLE_ICON,
    "EULALIA_BURDEN_ICON": EULALIA_BURDEN_ICON,
    "EULALIA_BURST_ICON": EULALIA_BURST_ICON,
    "EULALIA_NOMINAL_BURDEN_KEY": EULALIA_NOMINAL_BURDEN_KEY,
    "EULALIA_BURDEN_LAYERS_KEY": EULALIA_BURDEN_LAYERS_KEY,
    "EULALIA_QUEUED_BURDEN_KEY": EULALIA_QUEUED_BURDEN_KEY,
    "EULALIA_CARRYOVER_BURDEN_KEY": EULALIA_CARRYOVER_BURDEN_KEY,
    "EULALIA_ABSOLUTION_TOTAL_KEY": EULALIA_ABSOLUTION_TOTAL_KEY,
    "EULALIA_BURST_COUNTDOWN_KEY": EULALIA_BURST_COUNTDOWN_KEY,
    "EULALIA_ABSOLUTION_CONTRACT_KEY": EULALIA_ABSOLUTION_CONTRACT_KEY,
    "EULALIA_ABSORB_WINDOW_CONTRACT_KEY": EULALIA_ABSORB_WINDOW_CONTRACT_KEY,
    "EULALIA_STREET_BURDEN_KEY": EULALIA_STREET_BURDEN_KEY,
    "EULALIA_ABSORB_ACTIVE_KEY": EULALIA_ABSORB_ACTIVE_KEY,
    "EULALIA_BURST_PENDING_KEY": EULALIA_BURST_PENDING_KEY,
    "EULALIA_SANCTUARY_PHASE_KEY": EULALIA_SANCTUARY_PHASE_KEY,
    "KAKO_EULALIA_BURDEN_TRACK_PREFIX": KAKO_EULALIA_BURDEN_TRACK_PREFIX,
    "KUZUHA_DEBT_ICON": KUZUHA_DEBT_ICON,
    "KUZUHA_DEBT_PREFIX": KUZUHA_DEBT_PREFIX,
    "KUZUHA_CALLED_PREFIX": KUZUHA_CALLED_PREFIX,
    "KUZUHA_SETTLED_TOTAL_KEY": KUZUHA_SETTLED_TOTAL_KEY,
    "KUZUHA_HIGHWATER_KEY": KUZUHA_HIGHWATER_KEY,
    "TRIXIE_WILD_ICON": TRIXIE_WILD_ICON,
    "TRIXIE_BLIND_BOX_ICON": TRIXIE_BLIND_BOX_ICON,
    "TRIXIE_REWRITE_DELAY_ICON": TRIXIE_REWRITE_DELAY_ICON,
    "TRIXIE_REWRITE_EXTEND_ICON": TRIXIE_REWRITE_EXTEND_ICON,
    "TRIXIE_WILD_CARD_KEY": TRIXIE_WILD_CARD_KEY,
    "TRIXIE_STREET_FORTUNE_KEY": TRIXIE_STREET_FORTUNE_KEY,
    "TRIXIE_STREET_CURSE_KEY": TRIXIE_STREET_CURSE_KEY,
    "TRIXIE_STREET_RAW_FORTUNE_KEY": TRIXIE_STREET_RAW_FORTUNE_KEY,
    "TRIXIE_STREET_RAW_CURSE_KEY": TRIXIE_STREET_RAW_CURSE_KEY,
    "TRIXIE_STREET_BONUS_KEY": TRIXIE_STREET_BONUS_KEY,
    "TRIXIE_REWRITE_QUEUE_KEY": TRIXIE_REWRITE_QUEUE_KEY,
    "TRIXIE_BLIND_BOX_KEY": TRIXIE_BLIND_BOX_KEY,
    "COTA_SLOT_COUNT_KEY": COTA_SLOT_COUNT_KEY,
    "COTA_CARDS_KEY": COTA_CARDS_KEY,
    "COTA_FAULT_STATE_KEY": COTA_FAULT_STATE_KEY,
    "COTA_BUST_RATE_KEY": COTA_BUST_RATE_KEY,
    "COTA_SELF_CURSE_PRESSURE_KEY": COTA_SELF_CURSE_PRESSURE_KEY,
    "COTA_FIRST_BUST_BONUS_KEY": COTA_FIRST_BUST_BONUS_KEY,
    "COTA_NEW_CARD_COST_DELTA_KEY": COTA_NEW_CARD_COST_DELTA_KEY,
    "COTA_GOOD_BASE_VALUE_KEY": COTA_GOOD_BASE_VALUE_KEY,
    "COTA_BAD_BASE_VALUE_KEY": COTA_BAD_BASE_VALUE_KEY,
    "COTA_MISC_BASE_VALUE_KEY": COTA_MISC_BASE_VALUE_KEY,
    "COTA_DEFAULT_SLOT_COUNT": COTA_DEFAULT_SLOT_COUNT,
    "COTA_GATHER_VALUE_DELTA": COTA_GATHER_VALUE_DELTA,
    "COTA_GATHER_COST_DELTA": COTA_GATHER_COST_DELTA,
    "COTA_SPREAD_VALUE_DELTA": COTA_SPREAD_VALUE_DELTA,
    "COTA_SPREAD_COST_DELTA": COTA_SPREAD_COST_DELTA,
    "COTA_MISC_GATHER_VALUE_DELTA": COTA_MISC_GATHER_VALUE_DELTA,
    "COTA_MISC_SPREAD_VALUE_DELTA": COTA_MISC_SPREAD_VALUE_DELTA,
    "COTA_MISC_BASE_GAIN_RATE": COTA_MISC_BASE_GAIN_RATE,
    "COTA_MISC_RATE_PER_POWER": COTA_MISC_RATE_PER_POWER,
    "COTA_MISC_MANA_MULTIPLIER": COTA_MISC_MANA_MULTIPLIER,
    "COTA_CARD_DEFAULTS": COTA_CARD_DEFAULTS,
    "COTA_BASE_VALUE_KEYS": COTA_BASE_VALUE_KEYS,
    "COTA_MARK_ICON": COTA_MARK_ICON,
    "COTA_FAULT_ICON": COTA_FAULT_ICON,
    "KAKO_RED_SEAL_ICON": KAKO_RED_SEAL_ICON,
    "KAKO_RULING_ICON": KAKO_RULING_ICON,
    "KAKO_RED_SEAL_KEY": KAKO_RED_SEAL_KEY,
    "KAKO_REDLINE_RATE_KEY": KAKO_REDLINE_RATE_KEY,
    "KAKO_STREET_FORTUNE_KEY": KAKO_STREET_FORTUNE_KEY,
    "KAKO_STREET_CURSE_KEY": KAKO_STREET_CURSE_KEY,
    "KAKO_LAST_MANA_DELTA_KEY": KAKO_LAST_MANA_DELTA_KEY,
    "KAKO_USED_LIMITED_KEY": KAKO_USED_LIMITED_KEY,
    "KAKO_RULING_CONTRACT_KEY": KAKO_RULING_CONTRACT_KEY,
    "KAKO_RULING_PENDING_MARK_KEY": KAKO_RULING_PENDING_MARK_KEY,
    "hasRecentScout": hasRecentScout,
    "getInfoPressure": getInfoPressure,
    "hasEnemyFortunePressure": hasEnemyFortunePressure,
    "hasReadyOwnerSkill": hasReadyOwnerSkill,
    "hasOwnerPendingEffect": hasOwnerPendingEffect,
    "hasOwnerPendingSkillKey": hasOwnerPendingSkillKey,
    "scriptedChance": scriptedChance,
    "getTraitSystem": getTraitSystem,
    "hasTraitEffect": hasTraitEffect,
    "getTraitEffect": getTraitEffect,
    "getGamePlayers": getGamePlayers,
    "getPlayerById": getPlayerById,
    "getActiveOpponents": getActiveOpponents,
    "hasStatusMark": hasStatusMark,
    "scoreThreatTarget": scoreThreatTarget,
    "pickRoleTarget": pickRoleTarget,
    "getLedger": getLedger,
    "getSkillSystem": getSkillSystem,
    "buildMatchScopedSkillKey": buildMatchScopedSkillKey,
    "isMatchScopedSkillUsed": isMatchScopedSkillUsed,
    "consumeMatchScopedSkillUse": consumeMatchScopedSkillUse,
    "getPlayerManaPool": getPlayerManaPool,
    "getPlayerSkills": getPlayerSkills,
    "getForceRuntime": getForceRuntime,
    "emitRuntimeFlow": emitRuntimeFlow,
    "queueRuntimeForce": queueRuntimeForce,
    "removeRuntimeForces": removeRuntimeForces,
    "emitRuntimeSkillActivated": emitRuntimeSkillActivated,
    "findPlayerSkill": findPlayerSkill,
    "isRolePlayer": isRolePlayer,
    "isRuntimePlayerLive": isRuntimePlayerLive,
    "getRolePlayers": getRolePlayers,
    "getLiveRolePlayers": getLiveRolePlayers,
    "collectConfiguredRoleIdsFromEntry": collectConfiguredRoleIdsFromEntry,
    "getConfiguredRoleMap": getConfiguredRoleMap,
    "hasConfiguredRole": hasConfiguredRole,
    "guardConfiguredRole": guardConfiguredRole,
    "clearStatusMarkSafe": clearStatusMarkSafe,
    "getPlayerChipBaseline": getPlayerChipBaseline,
    "getPlayerChipRatio": getPlayerChipRatio,
    "getBubbleValue": getBubbleValue,
    "getBubbleLayerCount": getBubbleLayerCount,
    "getBubbleLayerAsset": getBubbleLayerAsset,
    "getBubbleTotal": getBubbleTotal,
    "getVvPositionAsset": getVvPositionAsset,
    "getVvPositionPacks": getVvPositionPacks,
    "getActiveTableChipTotal": getActiveTableChipTotal,
    "summarizeVvTargetPositions": summarizeVvTargetPositions,
    "syncVvTargetAssets": syncVvTargetAssets,
    "getVvDeviationState": getVvDeviationState,
    "resolveRuntimePhase": resolveRuntimePhase
  });
})(window);
