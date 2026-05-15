/**
 * Runtime Module: BuiltinRoleModules / POPPY runtime system
 * Split from the legacy builtin-role-modules.js without behavior changes.
 */
(function(global) {
  'use strict';

  var Builtin = global.AceBuiltinRuntime = global.AceBuiltinRuntime || {};

  function getTraitEffect() { return Builtin.getTraitEffect.apply(null, arguments); }
  function getGamePlayers() { return Builtin.getGamePlayers.apply(null, arguments); }
  function getPlayerById() { return Builtin.getPlayerById.apply(null, arguments); }
  function getLedger() { return Builtin.getLedger.apply(null, arguments); }
  function getSkillSystem() { return Builtin.getSkillSystem.apply(null, arguments); }
  function buildMatchScopedSkillKey() { return Builtin.buildMatchScopedSkillKey.apply(null, arguments); }
  function isMatchScopedSkillUsed() { return Builtin.isMatchScopedSkillUsed.apply(null, arguments); }
  function consumeMatchScopedSkillUse() { return Builtin.consumeMatchScopedSkillUse.apply(null, arguments); }
  function getPlayerManaPool() { return Builtin.getPlayerManaPool.apply(null, arguments); }
  function queueRuntimeForce() { return Builtin.queueRuntimeForce.apply(null, arguments); }
  function removeRuntimeForces() { return Builtin.removeRuntimeForces.apply(null, arguments); }
  function emitRuntimeSkillActivated() { return Builtin.emitRuntimeSkillActivated.apply(null, arguments); }
  function findPlayerSkill() { return Builtin.findPlayerSkill.apply(null, arguments); }
  function isRuntimePlayerLive() { return Builtin.isRuntimePlayerLive.apply(null, arguments); }
  function getRolePlayers() { return Builtin.getRolePlayers.apply(null, arguments); }
  function clearStatusMarkSafe() { return Builtin.clearStatusMarkSafe.apply(null, arguments); }
  function getPlayerChipRatio() { return Builtin.getPlayerChipRatio.apply(null, arguments); }
  function setManaCurrent() { return Builtin.setManaCurrent.apply(null, arguments); }

  var POPPY_MIRACLE_FLAG_KEY = Builtin.POPPY_MIRACLE_FLAG_KEY;
  var POPPY_MIRACLE_PENDING_KEY = Builtin.POPPY_MIRACLE_PENDING_KEY;
  var POPPY_MIRACLE_PACKS_KEY = Builtin.POPPY_MIRACLE_PACKS_KEY;
  var POPPY_STREET_TOTAL_MANA_SPENT_KEY = Builtin.POPPY_STREET_TOTAL_MANA_SPENT_KEY;
  var POPPY_STREET_PSYCHE_CHAOS_KEY = Builtin.POPPY_STREET_PSYCHE_CHAOS_KEY;
  var POPPY_LAST_MANA_KEY = Builtin.POPPY_LAST_MANA_KEY;
  var POPPY_MANA_TRACK_KEY = Builtin.POPPY_MANA_TRACK_KEY;
  var POPPY_LUCKY_FIND_PHASE_KEY = Builtin.POPPY_LUCKY_FIND_PHASE_KEY;
  var POPPY_MIRACLE_MARK_KEY = Builtin.POPPY_MIRACLE_MARK_KEY;
  var POPPY_MIRACLE_ICON = Builtin.POPPY_MIRACLE_ICON;

  function getPoppyPlayers(runtimeApi) {
    return getRolePlayers(runtimeApi, 'POPPY');
  }

  function getPoppyAsset(runtimeApi, ownerId, key) {
    var ledger = getLedger(runtimeApi);
    if (!ledger || typeof ledger.getAsset !== 'function') return null;
    return ledger.getAsset(ownerId, key);
  }

  function getPoppyAssetValue(runtimeApi, ownerId, key) {
    var ledger = getLedger(runtimeApi);
    if (!ledger || typeof ledger.getValue !== 'function') return 0;
    return ledger.getValue(ownerId, key) || 0;
  }

  function setPoppyAsset(runtimeApi, ownerId, key, value, meta) {
    var ledger = getLedger(runtimeApi);
    if (!ledger || typeof ledger.setAsset !== 'function') return null;
    return ledger.setAsset(ownerId, key, value, meta || null);
  }

  function clearPoppyAsset(runtimeApi, ownerId, key) {
    var ledger = getLedger(runtimeApi);
    if (!ledger || typeof ledger.clearAsset !== 'function') return;
    ledger.clearAsset(ownerId, key);
  }

  function syncPoppyManaAnchor(runtimeApi, ownerId) {
    var mana = getPlayerManaPool(runtimeApi, ownerId);
    if (!mana) return;
    setPoppyAsset(runtimeApi, ownerId, POPPY_LAST_MANA_KEY, mana.current, {
      syncedAt: Date.now()
    });
  }

  function syncPoppyManaTrackMap(runtimeApi, ownerId) {
    var players = getGamePlayers(runtimeApi);
    var anchors = {};
    for (var i = 0; i < players.length; i++) {
      var player = players[i];
      var pool = player ? getPlayerManaPool(runtimeApi, player.id) : null;
      if (!player || !pool) continue;
      anchors[player.id] = Math.max(0, Number(pool.current || 0));
    }
    setPoppyAsset(runtimeApi, ownerId, POPPY_MANA_TRACK_KEY, 0, {
      anchors: anchors,
      syncedAt: Date.now()
    });
  }

  function clearPoppyMiracleInjectedForces(runtimeApi) {
    removeRuntimeForces(runtimeApi, function(force) {
      return !!(force && force._poppyMiracleAsset);
    }, {
      reason: 'poppy_miracle_injected_clear'
    });
  }

  function clearPoppyMiracleHandAssets(runtimeApi, ownerId) {
    clearPoppyAsset(runtimeApi, ownerId, POPPY_STREET_TOTAL_MANA_SPENT_KEY);
    clearPoppyAsset(runtimeApi, ownerId, POPPY_STREET_PSYCHE_CHAOS_KEY);
    clearPoppyAsset(runtimeApi, ownerId, POPPY_LAST_MANA_KEY);
    clearPoppyAsset(runtimeApi, ownerId, POPPY_MANA_TRACK_KEY);
    clearPoppyAsset(runtimeApi, ownerId, POPPY_LUCKY_FIND_PHASE_KEY);
  }

  function clearPoppyMiracleRuntimeAssets(runtimeApi, ownerId) {
    clearPoppyAsset(runtimeApi, ownerId, POPPY_MIRACLE_PACKS_KEY);
    clearPoppyAsset(runtimeApi, ownerId, POPPY_MIRACLE_PENDING_KEY);
    clearPoppyMiracleStatusMark(runtimeApi, ownerId);
  }

  function clearAllPoppyAssets(runtimeApi) {
    var players = getPoppyPlayers(runtimeApi);
    for (var i = 0; i < players.length; i++) {
      clearPoppyMiracleHandAssets(runtimeApi, players[i].id);
      clearPoppyMiracleRuntimeAssets(runtimeApi, players[i].id);
      clearPoppyAsset(runtimeApi, players[i].id, POPPY_MIRACLE_FLAG_KEY);
    }
    clearPoppyMiracleInjectedForces(runtimeApi);
  }

  function getPoppyMiracleConfig(runtimeApi, ownerId) {
    var skill = findPlayerSkill(runtimeApi, ownerId, 'miracle');
    return {
      skill: skill,
      triggerThreshold: skill && skill.triggerThreshold != null ? Number(skill.triggerThreshold) : 0.25,
      convertRate: skill && skill.convertRate != null ? Number(skill.convertRate) : 1.5,
      durationStreets: skill && skill.durationStreets != null ? Math.max(1, Number(skill.durationStreets)) : 3
    };
  }

  function setPoppyMiracleStatusMark(runtimeApi, player, remaining, packPower) {
    var skillSystem = getSkillSystem(runtimeApi);
    if (!skillSystem || !player) return;
    if (!isRuntimePlayerLive(player)) {
      clearStatusMarkSafe(skillSystem, player.id, POPPY_MIRACLE_MARK_KEY);
      return;
    }
    if (remaining > 0) {
      skillSystem.setStatusMark(player.id, POPPY_MIRACLE_MARK_KEY, {
        sourceName: player.name,
        icon: POPPY_MIRACLE_ICON,
        title: '命大局',
        tone: 'poppy',
        duration: 'streets',
        count: remaining,
        badgeText: String(remaining),
        detail: '命大局\n剩余街数: ' + remaining + '\n当前包强度: ' + Math.max(0, Number(packPower || 0))
      });
    } else if (typeof skillSystem.clearStatusMark === 'function') {
      skillSystem.clearStatusMark(player.id, POPPY_MIRACLE_MARK_KEY);
    }
  }

  function clearPoppyMiracleStatusMark(runtimeApi, ownerId) {
    var skillSystem = getSkillSystem(runtimeApi);
    if (!skillSystem || typeof skillSystem.clearStatusMark !== 'function' || ownerId == null) return;
    skillSystem.clearStatusMark(ownerId, POPPY_MIRACLE_MARK_KEY);
  }

  function capturePoppyManaSpend(payload, runtimeApi) {
    if (!payload || payload.ownerId == null) return;
    var current = Math.max(0, Number(payload.current || 0));
    var poppyPlayers = getPoppyPlayers(runtimeApi);
    for (var i = 0; i < poppyPlayers.length; i++) {
      var poppy = poppyPlayers[i];
      if (!poppy) continue;
      var trackAsset = getPoppyAsset(runtimeApi, poppy.id, POPPY_MANA_TRACK_KEY);
      var anchors = trackAsset && trackAsset.anchors ? Object.assign({}, trackAsset.anchors) : {};
      var previous = anchors[payload.ownerId];
      if (typeof previous !== 'number') previous = current;
      if (previous > current) {
        setPoppyAsset(
          runtimeApi,
          poppy.id,
          POPPY_STREET_TOTAL_MANA_SPENT_KEY,
          getPoppyAssetValue(runtimeApi, poppy.id, POPPY_STREET_TOTAL_MANA_SPENT_KEY) + (previous - current),
          {
            reason: payload.reason || 'mana_spent',
            sourceOwnerId: payload.ownerId
          }
        );
      }
      anchors[payload.ownerId] = current;
      setPoppyAsset(runtimeApi, poppy.id, POPPY_MANA_TRACK_KEY, 0, {
        anchors: anchors,
        reason: payload.reason || 'mana_sync'
      });
      if (payload.ownerId === poppy.id) {
        setPoppyAsset(runtimeApi, poppy.id, POPPY_LAST_MANA_KEY, current, {
          reason: payload.reason || 'mana_sync'
        });
      }
    }
  }

  function collectPoppyPsycheChaos(payload, runtimeApi, ownerId) {
    var events = payload && Array.isArray(payload.psycheEvents) ? payload.psycheEvents : [];
    var player = getPlayerById(runtimeApi, ownerId);
    if (!player || !events.length) return 0;

    var total = 0;
    for (var i = 0; i < events.length; i++) {
      var event = events[i];
      if (!event || event.action !== 'convert') continue;
      if (event.targetOwner !== player.name) continue;
      total += Math.max(0, Number(event.originalPower || 0));
    }
    return total;
  }

  function buildPoppyMiracleOptions(player, skill, drainedMana, packPower) {
    return {
      rolePlan: 'poppy_miracle',
      ownerId: player.id,
      drainedMana: drainedMana,
      packPower: packPower,
      totalPacks: skill && skill.durationStreets != null ? Math.max(1, Number(skill.durationStreets)) : 3
    };
  }

  function queuePoppyMiracle(runtimeApi, player) {
    var ownerId = player && player.id;
    var config = ownerId != null ? getPoppyMiracleConfig(runtimeApi, ownerId) : null;
    if (!player) return false;
    if (isMatchScopedSkillUsed(runtimeApi, ownerId, 'miracle')) return false;
    if (getPoppyAssetValue(runtimeApi, ownerId, POPPY_MIRACLE_FLAG_KEY) > 0) return false;
    if (getPoppyAssetValue(runtimeApi, ownerId, POPPY_MIRACLE_PENDING_KEY) > 0) return false;
    if (!config || getPlayerChipRatio(player) > config.triggerThreshold) return false;

    var skill = config.skill;
    if (!consumeMatchScopedSkillUse(runtimeApi, ownerId, 'miracle', {
      ownerName: player.name,
      phase: 'table:hand_end',
      chipRatio: getPlayerChipRatio(player),
      triggerThreshold: config.triggerThreshold
    })) {
      return false;
    }
    setPoppyAsset(runtimeApi, ownerId, POPPY_MIRACLE_PENDING_KEY, config.durationStreets, {
      durationStreets: config.durationStreets,
      convertRate: config.convertRate,
      triggerThreshold: config.triggerThreshold,
      queuedAt: Date.now()
    });
    if (skill) {
      skill.gameUsesRemaining = 0;
      skill.active = false;
    }

    var skillSystem = getSkillSystem(runtimeApi);
    if (skillSystem) {
      skillSystem.emit('poppy:miracle_ready', {
        ownerId: ownerId,
        ownerName: player.name,
        chipRatio: getPlayerChipRatio(player),
        triggerThreshold: config.triggerThreshold,
        packs: config.durationStreets,
        matchScopeKey: buildMatchScopedSkillKey(ownerId, 'miracle')
      });
    }

    return true;
  }

  function activatePoppyMiracle(runtimeApi, player) {
    var ownerId = player && player.id;
    var pendingAsset = ownerId != null ? getPoppyAsset(runtimeApi, ownerId, POPPY_MIRACLE_PENDING_KEY) : null;
    var mana = ownerId != null ? getPlayerManaPool(runtimeApi, ownerId) : null;
    if (!player || !mana || !pendingAsset) return false;

    var skill = findPlayerSkill(runtimeApi, ownerId, 'miracle');
    var durationStreets = Math.max(1, Number(pendingAsset.durationStreets || pendingAsset.value || 3));
    var convertRate = pendingAsset.convertRate != null ? Number(pendingAsset.convertRate) : 1.5;
    var drainedMana = Math.max(0, Number(mana.current || 0));
    var packPower = Math.max(0, Math.ceil(drainedMana * convertRate));
    var packs = [];
    for (var i = 0; i < durationStreets; i++) {
      packs.push({
        power: packPower,
        sourceId: ownerId,
        sourceName: player.name
      });
    }

    setPoppyAsset(runtimeApi, ownerId, POPPY_MIRACLE_FLAG_KEY, 1, {
      triggered: true,
      triggeredAt: Date.now()
    });
    setPoppyAsset(runtimeApi, ownerId, POPPY_MIRACLE_PACKS_KEY, packs.length, {
      packs: packs,
      power: packPower,
      triggeredAt: Date.now()
    });
    clearPoppyAsset(runtimeApi, ownerId, POPPY_MIRACLE_PENDING_KEY);
    setPoppyMiracleStatusMark(runtimeApi, player, packs.length, packPower);
    setManaCurrent(runtimeApi, ownerId, 0, 'poppy_miracle');

    emitRuntimeSkillActivated(runtimeApi, skill || {
      ownerId: ownerId,
      ownerName: player.name,
      skillKey: 'miracle',
      effect: 'miracle',
      activation: 'trigger'
    }, {
      ownerId: ownerId,
      ownerName: player.name,
      type: 'miracle',
      packs: packs.length,
      packPower: packPower,
      drainedMana: drainedMana
    }, buildPoppyMiracleOptions(player, skill, drainedMana, packPower));

    return true;
  }

  function recoverPoppyCockroachMana(runtimeApi, player, convertedChaos) {
    var ownerId = player && player.id;
    var mana = ownerId != null ? getPlayerManaPool(runtimeApi, ownerId) : null;
    var effect = ownerId != null ? getTraitEffect(runtimeApi, ownerId, 'desperation_reclaim') : null;
    var skillSystem = getSkillSystem(runtimeApi);
    if (!player || !mana) return 0;
    if (!effect) {
      if (skillSystem) {
        skillSystem.emit('poppy:cockroach_check', {
          ownerId: ownerId,
          ownerName: player.name,
          success: false,
          reason: 'missing_trait'
        });
      }
      return 0;
    }
    var reclaimThreshold = effect.reclaimThreshold != null ? Number(effect.reclaimThreshold) : 0.5;
    var totalManaRecoverRate = effect.totalManaRecoverRate != null ? Number(effect.totalManaRecoverRate) : 0.15;
    var manaRecoverCap = effect.manaRecoverCap != null ? Number(effect.manaRecoverCap) : 8;
    var convertedChaosRecoverRate = effect.convertedChaosRecoverRate != null ? Number(effect.convertedChaosRecoverRate) : 0.5;
    var chipRatio = getPlayerChipRatio(player);
    if (chipRatio > reclaimThreshold) {
      if (skillSystem) {
        skillSystem.emit('poppy:cockroach_check', {
          ownerId: ownerId,
          ownerName: player.name,
          success: false,
          reason: 'threshold_not_met',
          chipRatio: chipRatio,
          reclaimThreshold: reclaimThreshold
        });
      }
      return 0;
    }
    if (getPoppyAssetValue(runtimeApi, ownerId, POPPY_MIRACLE_FLAG_KEY) > 0) {
      if (skillSystem) {
        skillSystem.emit('poppy:cockroach_check', {
          ownerId: ownerId,
          ownerName: player.name,
          success: false,
          reason: 'miracle_locked',
          chipRatio: chipRatio,
          reclaimThreshold: reclaimThreshold
        });
      }
      return 0;
    }

    var streetTotalManaSpent = getPoppyAssetValue(runtimeApi, ownerId, POPPY_STREET_TOTAL_MANA_SPENT_KEY);
    var recoveredMana = Math.min(manaRecoverCap, Math.ceil(streetTotalManaSpent * totalManaRecoverRate));
    var recoveredFortune = Math.ceil(Math.max(0, Number(convertedChaos || 0)) * convertedChaosRecoverRate);
    if (recoveredMana <= 0 && recoveredFortune <= 0) {
      if (skillSystem) {
        skillSystem.emit('poppy:cockroach_check', {
          ownerId: ownerId,
          ownerName: player.name,
          success: false,
          reason: 'no_residual',
          chipRatio: chipRatio,
          reclaimThreshold: reclaimThreshold,
          streetTotalManaSpent: streetTotalManaSpent,
          convertedChaos: Math.max(0, Number(convertedChaos || 0))
        });
      }
      return 0;
    }

    var nextMana = Math.min(mana.max, mana.current + recoveredMana);
    var actualMana = Math.max(0, nextMana - mana.current);
    if (actualMana <= 0 && recoveredFortune <= 0) {
      if (skillSystem) {
        skillSystem.emit('poppy:cockroach_check', {
          ownerId: ownerId,
          ownerName: player.name,
          success: false,
          reason: 'mana_full',
          chipRatio: chipRatio,
          reclaimThreshold: reclaimThreshold,
          streetTotalManaSpent: streetTotalManaSpent,
          convertedChaos: Math.max(0, Number(convertedChaos || 0)),
          fortuneRecovered: recoveredFortune
        });
      }
      return 0;
    }

    var beforeMana = mana.current;
    if (actualMana > 0) {
      setManaCurrent(runtimeApi, ownerId, nextMana, 'poppy_cockroach');
    }
    if (recoveredFortune > 0) {
      queueRuntimeForce(runtimeApi, {
        ownerId: ownerId,
        ownerName: player.name,
        type: 'fortune',
        kind: 'fortune',
        power: recoveredFortune,
        effectivePower: recoveredFortune,
        level: 0,
        system: 'moirai',
        activation: 'passive',
        source: 'poppy_cockroach_fortune',
        skillKey: 'cockroach',
        _poppyCockroachFortune: true
      }, {
        reason: 'poppy_cockroach_fortune',
        ownerId: ownerId
      });
    }
    var chaosAsset = getPoppyAsset(runtimeApi, ownerId, POPPY_STREET_PSYCHE_CHAOS_KEY);
    if (skillSystem) {
      skillSystem.emit('poppy:cockroach_check', {
        ownerId: ownerId,
        ownerName: player.name,
        success: true,
        reason: 'recovered',
        chipRatio: chipRatio,
        reclaimThreshold: reclaimThreshold,
        streetTotalManaSpent: streetTotalManaSpent,
        convertedChaos: Math.max(0, Number(convertedChaos || 0)),
        manaRecovered: actualMana,
        fortuneRecovered: recoveredFortune
      });
      skillSystem.emit('poppy:cockroach_recover', {
        ownerId: ownerId,
        ownerName: player.name,
        phase: chaosAsset && chaosAsset.phase != null ? chaosAsset.phase : null,
        chipRatio: chipRatio,
        reclaimThreshold: reclaimThreshold,
        streetTotalManaSpent: streetTotalManaSpent,
        convertedChaos: Math.max(0, Number(convertedChaos || 0)),
        recovered: actualMana,
        manaRecovered: actualMana,
        fortuneRecovered: recoveredFortune,
        manaBefore: beforeMana,
        manaAfter: nextMana
      });
    }
    return actualMana;
  }

  function tryTriggerPoppyLuckyFind(runtimeApi, payload, player) {
    var ownerId = player && player.id;
    var mana = ownerId != null ? getPlayerManaPool(runtimeApi, ownerId) : null;
    var skillSystem = getSkillSystem(runtimeApi);
    var phase = payload && payload.phase != null ? String(payload.phase) : '';
    if (!player || !mana || mana.max <= 0) return false;

    var lastPhaseAsset = getPoppyAsset(runtimeApi, ownerId, POPPY_LUCKY_FIND_PHASE_KEY);
    if (lastPhaseAsset && lastPhaseAsset.phase === phase) return false;

    var chance = Math.min(0.6, Math.max(0, mana.current / mana.max));
    setPoppyAsset(runtimeApi, ownerId, POPPY_LUCKY_FIND_PHASE_KEY, 1, {
      phase: phase,
      chance: chance
    });

    var manaBefore = mana.current;
    if (mana.current < 5) {
      if (skillSystem) {
        skillSystem.emit('poppy:lucky_find_roll', {
          ownerId: ownerId,
          ownerName: player.name,
          phase: phase,
          chance: chance,
          success: false,
          blocked: true,
          reason: 'insufficient_mana',
          manaBefore: manaBefore,
          manaAfter: manaBefore,
          spentMana: 0
        });
      }
      return false;
    }

    var success = Math.random() < chance;
    if (skillSystem) {
      skillSystem.emit('poppy:lucky_find_roll', {
        ownerId: ownerId,
        ownerName: player.name,
        phase: phase,
        chance: chance,
        success: success,
        blocked: false,
        reason: success ? 'triggered' : 'roll_failed',
        manaBefore: manaBefore,
        manaAfter: success ? Math.max(0, manaBefore - 5) : manaBefore,
        spentMana: success ? 5 : 0
      });
    }
    if (!success) return false;

    var skill = findPlayerSkill(runtimeApi, ownerId, 'lucky_find');
    setManaCurrent(runtimeApi, ownerId, manaBefore - 5, 'poppy_lucky_find');
    queueRuntimeForce(runtimeApi, {
      ownerId: ownerId,
      ownerName: player.name,
      type: 'fortune',
      kind: 'fortune',
      power: 20,
      effectivePower: 20,
      level: skill && skill.level != null ? skill.level : 2,
      system: 'moirai',
      activation: 'passive',
      source: 'poppy_lucky_find',
      skillKey: 'lucky_find',
      _poppyLuckyFind: true
    }, {
      reason: 'poppy_lucky_find',
      ownerId: ownerId,
      phase: phase
    });
    emitRuntimeSkillActivated(runtimeApi, skill || {
      ownerId: ownerId,
      ownerName: player.name,
      skillKey: 'lucky_find',
      effect: 'lucky_find',
      activation: 'trigger'
    }, {
      ownerId: ownerId,
      ownerName: player.name,
      type: 'lucky_find',
      phase: phase
    }, {
      rolePlan: 'poppy_lucky_find',
      ownerId: ownerId,
      phase: phase,
      triggerChance: chance,
      manaBefore: manaBefore,
      manaAfter: Math.max(0, manaBefore - 5),
      spentMana: 5
    });
    return true;
  }

  function injectPoppyMiracleForces(runtimeApi) {
    clearPoppyMiracleInjectedForces(runtimeApi);

    var players = getPoppyPlayers(runtimeApi);
    for (var i = 0; i < players.length; i++) {
      var player = players[i];
      if (!player || player.folded || player.isActive === false) continue;

      var miracleAsset = getPoppyAsset(runtimeApi, player.id, POPPY_MIRACLE_PACKS_KEY);
      var packs = miracleAsset && Array.isArray(miracleAsset.packs) ? miracleAsset.packs.slice() : [];
      if (!packs.length) continue;

      var currentPack = packs[0];
      var packPower = Math.max(0, Number(currentPack && currentPack.power || 0));
      if (packPower <= 0) continue;

      queueRuntimeForce(runtimeApi, {
        ownerId: player.id,
        ownerName: player.name,
      type: 'fortune',
      kind: 'fortune',
      power: packPower,
      effectivePower: packPower,
      level: 0,
      system: 'moirai',
        activation: 'passive',
        source: 'poppy_miracle',
        skillKey: 'miracle',
        _poppyMiracleAsset: true
      }, {
        reason: 'poppy_miracle_inject',
        ownerId: player.id,
        remainingPacks: packs.length
      });
      setPoppyMiracleStatusMark(runtimeApi, player, packs.length, packPower);
    }
  }

  function decayPoppyMiraclePacks(runtimeApi) {
    clearPoppyMiracleInjectedForces(runtimeApi);

    var players = getPoppyPlayers(runtimeApi);
    for (var i = 0; i < players.length; i++) {
      var player = players[i];
      var miracleAsset = getPoppyAsset(runtimeApi, player.id, POPPY_MIRACLE_PACKS_KEY);
      var packs = miracleAsset && Array.isArray(miracleAsset.packs) ? miracleAsset.packs.slice() : [];
      if (!packs.length) {
        clearPoppyAsset(runtimeApi, player.id, POPPY_MIRACLE_PACKS_KEY);
        continue;
      }

      packs.shift();
      if (packs.length > 0) {
        setPoppyAsset(runtimeApi, player.id, POPPY_MIRACLE_PACKS_KEY, packs.length, {
          packs: packs,
          power: miracleAsset && miracleAsset.power != null ? miracleAsset.power : 0
        });
        setPoppyMiracleStatusMark(runtimeApi, player, packs.length, miracleAsset && miracleAsset.power != null ? miracleAsset.power : 0);
      } else {
        clearPoppyAsset(runtimeApi, player.id, POPPY_MIRACLE_PACKS_KEY);
        clearPoppyMiracleStatusMark(runtimeApi, player.id);
      }
    }
  }

  function handlePoppyStreetResolved(payload, runtimeApi) {
    var players = getPoppyPlayers(runtimeApi);
    for (var i = 0; i < players.length; i++) {
      var player = players[i];
      var convertedChaos = collectPoppyPsycheChaos(payload, runtimeApi, player.id);
      setPoppyAsset(runtimeApi, player.id, POPPY_STREET_PSYCHE_CHAOS_KEY, convertedChaos, {
        phase: payload && payload.phase != null ? payload.phase : null
      });

      var recovered = recoverPoppyCockroachMana(runtimeApi, player, convertedChaos);
      tryTriggerPoppyLuckyFind(runtimeApi, payload, player);

      // 结算完成后重置街内统计，但保留最新 mana 锚点给下一街继续记账。
      setPoppyAsset(runtimeApi, player.id, POPPY_STREET_TOTAL_MANA_SPENT_KEY, 0, {
        phase: payload && payload.phase != null ? payload.phase : null,
        recovered: recovered
      });
      setPoppyAsset(runtimeApi, player.id, POPPY_STREET_PSYCHE_CHAOS_KEY, 0, {
        phase: payload && payload.phase != null ? payload.phase : null
      });
      syncPoppyManaAnchor(runtimeApi, player.id);
    }
  }

  Object.assign(Builtin, {
    "getPoppyPlayers": getPoppyPlayers,
    "getPoppyAsset": getPoppyAsset,
    "getPoppyAssetValue": getPoppyAssetValue,
    "setPoppyAsset": setPoppyAsset,
    "clearPoppyAsset": clearPoppyAsset,
    "syncPoppyManaAnchor": syncPoppyManaAnchor,
    "syncPoppyManaTrackMap": syncPoppyManaTrackMap,
    "clearPoppyMiracleInjectedForces": clearPoppyMiracleInjectedForces,
    "clearPoppyMiracleHandAssets": clearPoppyMiracleHandAssets,
    "clearPoppyMiracleRuntimeAssets": clearPoppyMiracleRuntimeAssets,
    "clearAllPoppyAssets": clearAllPoppyAssets,
    "getPoppyMiracleConfig": getPoppyMiracleConfig,
    "setPoppyMiracleStatusMark": setPoppyMiracleStatusMark,
    "clearPoppyMiracleStatusMark": clearPoppyMiracleStatusMark,
    "capturePoppyManaSpend": capturePoppyManaSpend,
    "collectPoppyPsycheChaos": collectPoppyPsycheChaos,
    "buildPoppyMiracleOptions": buildPoppyMiracleOptions,
    "queuePoppyMiracle": queuePoppyMiracle,
    "activatePoppyMiracle": activatePoppyMiracle,
    "recoverPoppyCockroachMana": recoverPoppyCockroachMana,
    "tryTriggerPoppyLuckyFind": tryTriggerPoppyLuckyFind,
    "injectPoppyMiracleForces": injectPoppyMiracleForces,
    "decayPoppyMiraclePacks": decayPoppyMiraclePacks,
    "handlePoppyStreetResolved": handlePoppyStreetResolved
  });
})(window);
