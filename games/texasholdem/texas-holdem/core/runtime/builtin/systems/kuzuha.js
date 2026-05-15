/**
 * Runtime Module: BuiltinRoleModules / KUZUHA runtime system
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
  function getPlayerManaPool() { return Builtin.getPlayerManaPool.apply(null, arguments); }
  function queueRuntimeForce() { return Builtin.queueRuntimeForce.apply(null, arguments); }
  function isRuntimePlayerLive() { return Builtin.isRuntimePlayerLive.apply(null, arguments); }
  function getRolePlayers() { return Builtin.getRolePlayers.apply(null, arguments); }
  function clearStatusMarkSafe() { return Builtin.clearStatusMarkSafe.apply(null, arguments); }
  function resolveRuntimePhase() { return Builtin.resolveRuntimePhase.apply(null, arguments); }
  function getEulaliaPlayers() { return Builtin.getEulaliaPlayers.apply(null, arguments); }
  function isEulaliaCombatActive() { return Builtin.isEulaliaCombatActive.apply(null, arguments); }
  function isEulaliaAbsorbWindowOpen() { return Builtin.isEulaliaAbsorbWindowOpen.apply(null, arguments); }
  function recordEulaliaBurden() { return Builtin.recordEulaliaBurden.apply(null, arguments); }
  function triggerEulaliaRealtimeAbsorb() { return Builtin.triggerEulaliaRealtimeAbsorb.apply(null, arguments); }
  function setManaCurrent() { return Builtin.setManaCurrent.apply(null, arguments); }

  var KUZUHA_DEBT_ICON = Builtin.KUZUHA_DEBT_ICON;
  var KUZUHA_DEBT_PREFIX = Builtin.KUZUHA_DEBT_PREFIX;
  var KUZUHA_CALLED_PREFIX = Builtin.KUZUHA_CALLED_PREFIX;
  var KUZUHA_SETTLED_TOTAL_KEY = Builtin.KUZUHA_SETTLED_TOTAL_KEY;
  var KUZUHA_HIGHWATER_KEY = Builtin.KUZUHA_HIGHWATER_KEY;

  function getKuzuhaPlayers(runtimeApi) {
    return getRolePlayers(runtimeApi, 'KUZUHA');
  }

  function buildKuzuhaDebtKey(targetId) {
    return KUZUHA_DEBT_PREFIX + String(targetId);
  }

  function buildKuzuhaCalledKey(targetId) {
    return KUZUHA_CALLED_PREFIX + String(targetId);
  }

  function getKuzuhaDebtRotValue(runtimeApi, ownerId, targetId) {
    var ledger = getLedger(runtimeApi);
    if (!ledger || ownerId == null || targetId == null) return 0;
    return Math.max(0, Number(ledger.getValue(ownerId, buildKuzuhaDebtKey(targetId)) || 0));
  }

  function setKuzuhaDebtRot(runtimeApi, ownerId, targetId, value, meta) {
    var ledger = getLedger(runtimeApi);
    if (!ledger || ownerId == null || targetId == null) return null;
    return ledger.setAsset(ownerId, buildKuzuhaDebtKey(targetId), Math.max(0, Number(value || 0)), meta || null);
  }

  function wasKuzuhaDebtCalled(runtimeApi, ownerId, targetId) {
    var ledger = getLedger(runtimeApi);
    if (!ledger || ownerId == null || targetId == null) return false;
    return (ledger.getValue(ownerId, buildKuzuhaCalledKey(targetId)) || 0) > 0;
  }

  function setKuzuhaDebtCalled(runtimeApi, ownerId, targetId, value, meta) {
    var ledger = getLedger(runtimeApi);
    if (!ledger || ownerId == null || targetId == null) return null;
    return ledger.setAsset(ownerId, buildKuzuhaCalledKey(targetId), value ? 1 : 0, meta || null);
  }

  function clearAllKuzuhaCalled(runtimeApi, ownerId) {
    var ledger = getLedger(runtimeApi);
    if (!ledger || ownerId == null) return;
    var snapshot = ledger.snapshot();
    var bucket = snapshot && snapshot[ownerId] ? snapshot[ownerId] : null;
    if (!bucket) return;
    Object.keys(bucket).forEach(function(key) {
      if (key.indexOf(KUZUHA_CALLED_PREFIX) === 0) ledger.clearAsset(ownerId, key);
    });
  }

  function getKuzuhaTargetRotTotal(runtimeApi, targetId) {
    var ledger = getLedger(runtimeApi);
    if (!ledger || targetId == null) return 0;
    var snapshot = ledger.snapshot();
    var total = 0;
    var debtKey = buildKuzuhaDebtKey(targetId);
    Object.keys(snapshot || {}).forEach(function(ownerId) {
      var bucket = snapshot[ownerId] || {};
      var asset = bucket[debtKey];
      if (!asset) return;
      total += Math.max(0, Number(asset.value || 0));
    });
    return total;
  }

  function syncKuzuhaDebtMarks(runtimeApi) {
    var skillSystem = getSkillSystem(runtimeApi);
    var players = getGamePlayers(runtimeApi);
    if (!skillSystem || !players.length) return;

    for (var i = 0; i < players.length; i++) {
      var player = players[i];
      if (!player) continue;
      if (!isRuntimePlayerLive(player)) {
        clearStatusMarkSafe(skillSystem, player.id, 'kuzuha_debt_rot');
        continue;
      }
      var total = getKuzuhaTargetRotTotal(runtimeApi, player.id);
      var tier = Math.max(0, Math.min(6, Math.floor(total / 10)));
      if (tier > 0) {
        skillSystem.setStatusMark(player.id, 'kuzuha_debt_rot', {
          sourceName: 'KUZUHA',
          icon: KUZUHA_DEBT_ICON,
          title: '债蚀',
          tone: 'kuzuha',
          duration: 'persistent',
          value: total,
          count: tier,
          badgeText: String(tier),
          detail: '债蚀: ' + total + '/60'
        });
      } else if (typeof skillSystem.clearStatusMark === 'function') {
        skillSystem.clearStatusMark(player.id, 'kuzuha_debt_rot');
      }
      if (typeof skillSystem.emit === 'function') {
        skillSystem.emit('kuzuha:debt_sync', {
          ownerId: player.id,
          ownerName: player.name,
          totalDebt: total,
          tier: tier,
          hasMark: tier > 0
        });
      }
    }
  }

  function queueKuzuhaCurse(runtimeApi, ownerId, targetId, power, sourceKey, extraMeta) {
    var owner = getPlayerById(runtimeApi, ownerId);
    var target = getPlayerById(runtimeApi, targetId);
    if (!owner || !target || power <= 0) return 0;
    var phase = (extraMeta && extraMeta.phase != null) ? extraMeta.phase : resolveRuntimePhase(runtimeApi, null);
    var eulaliaPlayers = getEulaliaPlayers(runtimeApi);
    for (var ei = 0; ei < eulaliaPlayers.length; ei++) {
      var absorberId = eulaliaPlayers[ei] && eulaliaPlayers[ei].id;
      if (absorberId == null) continue;
      if (!isEulaliaCombatActive(runtimeApi, absorberId)) continue;
      if (!isEulaliaAbsorbWindowOpen(runtimeApi, absorberId, phase)) continue;
      recordEulaliaBurden(runtimeApi, absorberId, phase, power, {
        reason: 'eulalia_absorb_kuzuha_curse',
        includeAbsolutionTotal: true
      });
      return power;
    }
    queueRuntimeForce(runtimeApi, {
      ownerId: ownerId,
      ownerName: owner.name,
      type: 'curse',
      kind: 'curse',
      targetId: targetId,
      targetName: target.name,
      power: power,
      effectivePower: power,
      level: 0,
      system: 'chaos',
      activation: 'active',
      source: sourceKey,
      skillKey: sourceKey
    }, Object.assign({
      reason: sourceKey,
      ownerId: ownerId,
      targetId: targetId
    }, extraMeta || {}));
    triggerEulaliaRealtimeAbsorb(runtimeApi, phase, 'eulalia_absorb_kuzuha_curse');
    return power;
  }

  function queueKuzuhaFortune(runtimeApi, ownerId, power, sourceKey, extraMeta) {
    var owner = getPlayerById(runtimeApi, ownerId);
    if (!owner || power <= 0) return 0;
    queueRuntimeForce(runtimeApi, {
      ownerId: ownerId,
      ownerName: owner.name,
      type: 'fortune',
      kind: 'fortune',
      power: power,
      effectivePower: power,
      level: 0,
      system: 'moirai',
      activation: 'active',
      source: sourceKey,
      skillKey: sourceKey
    }, Object.assign({
      reason: sourceKey,
      ownerId: ownerId
    }, extraMeta || {}));
    return power;
  }

  function addKuzuhaDebtRot(runtimeApi, ownerId, targetId, amount, meta) {
    var owner = getPlayerById(runtimeApi, ownerId);
    var target = getPlayerById(runtimeApi, targetId);
    var delta = Math.max(0, Math.ceil(Number(amount || 0)));
    var current = getKuzuhaDebtRotValue(runtimeApi, ownerId, targetId);
    var next = current + delta;
    var overflow = Math.max(0, next - 60);
    var clamped = Math.min(60, next);
    setKuzuhaDebtRot(runtimeApi, ownerId, targetId, clamped, Object.assign({
      sourceName: owner ? owner.name : 'KUZUHA',
      targetName: target ? target.name : ('ID:' + targetId),
      delta: delta
    }, meta || {}));
    if (overflow > 0) {
      queueKuzuhaCurse(runtimeApi, ownerId, targetId, Math.ceil(overflow * 0.5), 'kuzuha_debt_overflow', {
        overflow: overflow
      });
    }
    syncKuzuhaDebtMarks(runtimeApi);
    return {
      before: current,
      after: clamped,
      delta: delta,
      overflow: overflow
    };
  }

  function applyKuzuhaHouseTab(runtimeApi, ownerId, targetId, appliedPower, targetRotBefore, sourceKey) {
    var effect = getTraitEffect(runtimeApi, ownerId, 'kuzuha_house_tab');
    if (!effect || targetId == null) return null;
    var bonus = targetRotBefore > 0
      ? Math.max(1, Math.ceil(Math.max(0, Number(appliedPower || 0)) * Number(effect.convertRate || 0.25)))
      : Math.max(0, Number(effect.initialDebt || 8));
    if (bonus <= 0) return null;
    return addKuzuhaDebtRot(runtimeApi, ownerId, targetId, bonus, {
      source: sourceKey || 'house_tab',
      trait: 'house_tab'
    });
  }

  function handleKuzuhaHouseEdge(payload, runtimeApi) {
    var skill = payload && payload.skill;
    var ownerId = skill && skill.ownerId;
    var targetId = payload && payload.targetId != null
      ? payload.targetId
      : payload && payload.options && payload.options.targetId != null
        ? payload.options.targetId
        : null;
    if (ownerId == null || targetId == null) return;

    var before = getKuzuhaDebtRotValue(runtimeApi, ownerId, targetId);
    var debtGain = before > 0 ? 18 : 12;
    queueKuzuhaCurse(runtimeApi, ownerId, targetId, 18, 'house_edge');
    addKuzuhaDebtRot(runtimeApi, ownerId, targetId, debtGain, {
      source: 'house_edge',
      skillKey: 'house_edge'
    });
    var traitResult = applyKuzuhaHouseTab(runtimeApi, ownerId, targetId, 18, before, 'house_edge');
    var skillSystem = getSkillSystem(runtimeApi);
    if (skillSystem && typeof skillSystem.emit === 'function') {
      skillSystem.emit('kuzuha:house_edge_applied', {
        ownerId: ownerId,
        targetId: targetId,
        debtBefore: before,
        baseDebtGain: debtGain,
        traitDebtGain: traitResult && traitResult.delta != null ? traitResult.delta : 0,
        debtAfter: getKuzuhaDebtRotValue(runtimeApi, ownerId, targetId)
      });
    }
  }

  function handleKuzuhaDebtCall(payload, runtimeApi) {
    var skill = payload && payload.skill;
    var ownerId = skill && skill.ownerId;
    var targetId = payload && payload.targetId != null
      ? payload.targetId
      : payload && payload.options && payload.options.targetId != null
        ? payload.options.targetId
        : null;
    if (ownerId == null || targetId == null) return;

    var current = getKuzuhaDebtRotValue(runtimeApi, ownerId, targetId);
    if (current <= 0) return;

    var cursePower = Math.ceil(current * 0.66);
    var fortunePower = Math.ceil(current * 0.66);
    var remain = Math.max(0, Math.floor(current * 0.34));
    var extraCurse = current >= 30 ? 15 : 0;

    queueKuzuhaCurse(runtimeApi, ownerId, targetId, cursePower, 'debt_call');
    if (extraCurse > 0) queueKuzuhaCurse(runtimeApi, ownerId, targetId, extraCurse, 'debt_call_bonus');
    queueKuzuhaFortune(runtimeApi, ownerId, fortunePower, 'debt_call');
    setKuzuhaDebtRot(runtimeApi, ownerId, targetId, remain, {
      source: 'debt_call',
      retained: remain,
      settled: current
    });
    setKuzuhaDebtCalled(runtimeApi, ownerId, targetId, 1, {
      source: 'debt_call',
      phase: payload && payload.phase != null ? payload.phase : null
    });
    applyKuzuhaHouseTab(runtimeApi, ownerId, targetId, cursePower + extraCurse, current, 'debt_call');
    syncKuzuhaDebtMarks(runtimeApi);
  }

  function handleKuzuhaSkillActivationEvent(payload, runtimeApi) {
    if (!payload || !payload.skill || payload.skill.ownerId == null) return;
    if (payload.__kuzuhaRuntimeHandled) return;
    payload.__kuzuhaRuntimeHandled = true;
    if (payload.type === 'house_edge' || payload.skill.effect === 'house_edge') {
      handleKuzuhaHouseEdge(payload, runtimeApi);
      return;
    }
    if (payload.type === 'debt_call' || payload.skill.effect === 'debt_call') {
      handleKuzuhaDebtCall(payload, runtimeApi);
    }
  }

  function settleKuzuhaDebtStreet(runtimeApi, payload, owner) {
    var opponents = getGamePlayers(runtimeApi).filter(function(player) {
      return player && player.id !== owner.id;
    });
    var settledTotal = 0;
    var highDebt = false;

    for (var i = 0; i < opponents.length; i++) {
      var target = opponents[i];
      var current = getKuzuhaDebtRotValue(runtimeApi, owner.id, target.id);
      if (current <= 0) {
        setKuzuhaDebtCalled(runtimeApi, owner.id, target.id, 0, {
          phase: payload && payload.phase != null ? payload.phase : null
        });
        continue;
      }

      var settledDebt = Math.floor(current / 10) * 10;
      var cursePower = Math.floor(current / 10) * 6;
      if (cursePower > 0) {
        queueKuzuhaCurse(runtimeApi, owner.id, target.id, cursePower, 'kuzuha_debt_rot_settle', {
          phase: payload && payload.phase != null ? payload.phase : null,
          debtValue: current
        });
      }

      settledTotal += settledDebt;
      var called = wasKuzuhaDebtCalled(runtimeApi, owner.id, target.id);
      var nextDebt = current;
      if (!called) nextDebt += 5;
      if (nextDebt > 60) {
        queueKuzuhaCurse(runtimeApi, owner.id, target.id, Math.ceil((nextDebt - 60) * 0.5), 'kuzuha_debt_cap', {
          phase: payload && payload.phase != null ? payload.phase : null,
          debtValue: nextDebt
        });
        nextDebt = 60;
      }

      setKuzuhaDebtRot(runtimeApi, owner.id, target.id, nextDebt, {
        source: 'street_resolved',
        phase: payload && payload.phase != null ? payload.phase : null,
        called: called,
        settledDebt: settledDebt
      });
      setKuzuhaDebtCalled(runtimeApi, owner.id, target.id, 0, {
        phase: payload && payload.phase != null ? payload.phase : null
      });
      if (nextDebt >= 40) highDebt = true;
    }

    var ledger = getLedger(runtimeApi);
    if (ledger) {
      ledger.setAsset(owner.id, KUZUHA_SETTLED_TOTAL_KEY, settledTotal, {
        phase: payload && payload.phase != null ? payload.phase : null
      });
      ledger.setAsset(owner.id, KUZUHA_HIGHWATER_KEY, highDebt ? 1 : 0, {
        phase: payload && payload.phase != null ? payload.phase : null
      });
    }

    var grace = getTraitEffect(runtimeApi, owner.id, 'kuzuha_grace_period');
    var mana = getPlayerManaPool(runtimeApi, owner.id);
    if (grace && mana) {
      var manaRecover = Math.ceil(settledTotal * Number(grace.manaRecoverRate || 0.12));
      if (manaRecover > 0) setManaCurrent(runtimeApi, owner.id, mana.current + manaRecover, 'kuzuha_grace_period');
      if (highDebt) {
        queueKuzuhaFortune(runtimeApi, owner.id, Math.max(0, Number(grace.highDebtFortune || 8)), 'kuzuha_grace_period');
      }
      var skillSystem = getSkillSystem(runtimeApi);
      if (skillSystem) {
        skillSystem.emit('kuzuha:grace_period', {
          ownerId: owner.id,
          ownerName: owner.name,
          phase: payload && payload.phase != null ? payload.phase : null,
          settledTotal: settledTotal,
          manaRecovered: manaRecover,
          gainedFortune: highDebt ? Math.max(0, Number(grace.highDebtFortune || 8)) : 0,
          highDebt: highDebt
        });
      }
    }
  }

  function clearAllKuzuhaAssets(runtimeApi) {
    var ledger = getLedger(runtimeApi);
    var skillSystem = getSkillSystem(runtimeApi);
    if (!ledger) return;
    var snapshot = ledger.snapshot();
    Object.keys(snapshot || {}).forEach(function(ownerId) {
      var bucket = snapshot[ownerId] || {};
      Object.keys(bucket).forEach(function(key) {
        if (key.indexOf(KUZUHA_DEBT_PREFIX) === 0 ||
            key.indexOf(KUZUHA_CALLED_PREFIX) === 0 ||
            key === KUZUHA_SETTLED_TOTAL_KEY ||
            key === KUZUHA_HIGHWATER_KEY) {
          ledger.clearAsset(ownerId, key);
        }
      });
    });
    if (skillSystem && typeof skillSystem.clearStatusMark === 'function') {
      var players = getGamePlayers(runtimeApi);
      for (var i = 0; i < players.length; i++) {
        if (players[i]) skillSystem.clearStatusMark(players[i].id, 'kuzuha_debt_rot');
      }
    }
  }

  Object.assign(Builtin, {
    "getKuzuhaPlayers": getKuzuhaPlayers,
    "buildKuzuhaDebtKey": buildKuzuhaDebtKey,
    "buildKuzuhaCalledKey": buildKuzuhaCalledKey,
    "getKuzuhaDebtRotValue": getKuzuhaDebtRotValue,
    "setKuzuhaDebtRot": setKuzuhaDebtRot,
    "wasKuzuhaDebtCalled": wasKuzuhaDebtCalled,
    "setKuzuhaDebtCalled": setKuzuhaDebtCalled,
    "clearAllKuzuhaCalled": clearAllKuzuhaCalled,
    "getKuzuhaTargetRotTotal": getKuzuhaTargetRotTotal,
    "syncKuzuhaDebtMarks": syncKuzuhaDebtMarks,
    "queueKuzuhaCurse": queueKuzuhaCurse,
    "queueKuzuhaFortune": queueKuzuhaFortune,
    "addKuzuhaDebtRot": addKuzuhaDebtRot,
    "applyKuzuhaHouseTab": applyKuzuhaHouseTab,
    "handleKuzuhaHouseEdge": handleKuzuhaHouseEdge,
    "handleKuzuhaDebtCall": handleKuzuhaDebtCall,
    "handleKuzuhaSkillActivationEvent": handleKuzuhaSkillActivationEvent,
    "settleKuzuhaDebtStreet": settleKuzuhaDebtStreet,
    "clearAllKuzuhaAssets": clearAllKuzuhaAssets
  });
})(window);
