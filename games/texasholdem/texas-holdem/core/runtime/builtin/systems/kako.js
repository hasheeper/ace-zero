/**
 * Runtime Module: BuiltinRoleModules / KAKO runtime system
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
  function isRolePlayer() { return Builtin.isRolePlayer.apply(null, arguments); }
  function isRuntimePlayerLive() { return Builtin.isRuntimePlayerLive.apply(null, arguments); }
  function getRolePlayers() { return Builtin.getRolePlayers.apply(null, arguments); }
  function guardConfiguredRole() { return Builtin.guardConfiguredRole.apply(null, arguments); }
  function clearStatusMarkSafe() { return Builtin.clearStatusMarkSafe.apply(null, arguments); }
  function resolveRuntimePhase() { return Builtin.resolveRuntimePhase.apply(null, arguments); }
  function getEulaliaAssetValue() { return Builtin.getEulaliaAssetValue.apply(null, arguments); }
  function setEulaliaAsset() { return Builtin.setEulaliaAsset.apply(null, arguments); }
  function syncEulaliaStatusMarks() { return Builtin.syncEulaliaStatusMarks.apply(null, arguments); }
  function isEulaliaPhaseActive() { return Builtin.isEulaliaPhaseActive.apply(null, arguments); }
  function updateEulaliaNominalBurden() { return Builtin.updateEulaliaNominalBurden.apply(null, arguments); }
  function getEulaliaProjectedBurden() { return Builtin.getEulaliaProjectedBurden.apply(null, arguments); }
  function setManaCurrent() { return Builtin.setManaCurrent.apply(null, arguments); }

  var EULALIA_QUEUED_BURDEN_KEY = Builtin.EULALIA_QUEUED_BURDEN_KEY;
  var EULALIA_ABSOLUTION_TOTAL_KEY = Builtin.EULALIA_ABSOLUTION_TOTAL_KEY;
  var EULALIA_STREET_BURDEN_KEY = Builtin.EULALIA_STREET_BURDEN_KEY;
  var EULALIA_ABSORB_ACTIVE_KEY = Builtin.EULALIA_ABSORB_ACTIVE_KEY;
  var EULALIA_BURST_PENDING_KEY = Builtin.EULALIA_BURST_PENDING_KEY;
  var KAKO_EULALIA_BURDEN_TRACK_PREFIX = Builtin.KAKO_EULALIA_BURDEN_TRACK_PREFIX;
  var KAKO_RED_SEAL_ICON = Builtin.KAKO_RED_SEAL_ICON;
  var KAKO_RULING_ICON = Builtin.KAKO_RULING_ICON;
  var KAKO_RED_SEAL_KEY = Builtin.KAKO_RED_SEAL_KEY;
  var KAKO_REDLINE_RATE_KEY = Builtin.KAKO_REDLINE_RATE_KEY;
  var KAKO_STREET_FORTUNE_KEY = Builtin.KAKO_STREET_FORTUNE_KEY;
  var KAKO_STREET_CURSE_KEY = Builtin.KAKO_STREET_CURSE_KEY;
  var KAKO_LAST_MANA_DELTA_KEY = Builtin.KAKO_LAST_MANA_DELTA_KEY;
  var KAKO_USED_LIMITED_KEY = Builtin.KAKO_USED_LIMITED_KEY;
  var KAKO_RULING_CONTRACT_KEY = Builtin.KAKO_RULING_CONTRACT_KEY;
  var KAKO_RULING_PENDING_MARK_KEY = Builtin.KAKO_RULING_PENDING_MARK_KEY;

  var kakoStreetOutgoing = Object.create(null);

  var kakoManaAnchors = Object.create(null);

  function getKakoPlayers(runtimeApi) {
    return getRolePlayers(runtimeApi, 'KAKO');
  }

  function emitKakoEvent(runtimeApi, eventName, payload) {
    var skillSystem = getSkillSystem(runtimeApi);
    if (!skillSystem || typeof skillSystem.emit !== 'function') return;
    var eventPayload = Object.assign({
      phase: resolveRuntimePhase(runtimeApi, payload || {})
    }, payload || {});
    if (typeof skillSystem._log === 'function') {
      var logName = String(eventName || 'kako:event')
        .replace(/^kako:/, 'KAKO_')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .toUpperCase();
      skillSystem._log(logName, eventPayload);
    }
    skillSystem.emit(eventName, eventPayload);
  }

  function getKakoAsset(runtimeApi, ownerId, key) {
    var ledger = getLedger(runtimeApi);
    if (!ledger || ownerId == null || !key) return null;
    return ledger.getAsset(ownerId, key);
  }

  function getKakoAssetValue(runtimeApi, ownerId, key) {
    var asset = getKakoAsset(runtimeApi, ownerId, key);
    return asset ? Math.max(0, Number(asset.value || 0)) : 0;
  }

  function setKakoAsset(runtimeApi, ownerId, key, value, meta) {
    var ledger = getLedger(runtimeApi);
    if (!ledger || ownerId == null || !key) return null;
    return ledger.setAsset(ownerId, key, value, Object.assign({
      syncedAt: Date.now()
    }, meta || {}));
  }

  function clearKakoAsset(runtimeApi, ownerId, key) {
    var ledger = getLedger(runtimeApi);
    if (!ledger || ownerId == null || !key) return;
    ledger.clearAsset(ownerId, key);
  }

  function getKakoContracts(runtimeApi, ownerId) {
    var asset = getKakoAsset(runtimeApi, ownerId, KAKO_RULING_CONTRACT_KEY);
    return asset && Array.isArray(asset.contracts) ? asset.contracts.slice() : [];
  }

  function setKakoContracts(runtimeApi, ownerId, contracts, meta) {
    var next = Array.isArray(contracts) ? contracts.filter(Boolean) : [];
    if (!next.length) {
      clearKakoAsset(runtimeApi, ownerId, KAKO_RULING_CONTRACT_KEY);
      return null;
    }
    return setKakoAsset(runtimeApi, ownerId, KAKO_RULING_CONTRACT_KEY, next.length, Object.assign({
      contracts: next
    }, meta || {}));
  }

  function createKakoContractId(prefix) {
    return String(prefix || 'kako_contract') + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  }

  function getKakoForceRecipientId(force) {
    if (!force) return null;
    if (force.type === 'curse') return force.targetId != null ? force.targetId : null;
    if (force.type === 'fortune') {
      if (force.targetId != null) return force.targetId;
      if (force.protectId != null) return force.protectId;
      return force.ownerId != null ? force.ownerId : null;
    }
    return null;
  }

  function isKakoTrackedForcePayload(payload) {
    var force = payload && payload.force;
    return !!(force && (force.type === 'fortune' || force.type === 'curse'));
  }

  function getKakoStatState(runtimeApi, ownerId, key) {
    var asset = getKakoAsset(runtimeApi, ownerId, key);
    return {
      value: asset ? Math.max(0, Number(asset.value || 0)) : 0,
      forceMap: asset && asset.forceMap ? Object.assign({}, asset.forceMap) : {},
      forceIds: asset && Array.isArray(asset.forceIds) ? asset.forceIds.slice() : []
    };
  }

  function createKakoEulaliaBurdenTrackId(ownerId) {
    return KAKO_EULALIA_BURDEN_TRACK_PREFIX + String(ownerId);
  }

  function parseKakoEulaliaBurdenTrackId(trackId) {
    var raw = String(trackId || '');
    if (raw.indexOf(KAKO_EULALIA_BURDEN_TRACK_PREFIX) !== 0) return null;
    var ownerId = Number(raw.slice(KAKO_EULALIA_BURDEN_TRACK_PREFIX.length));
    return Number.isFinite(ownerId) ? ownerId : null;
  }

  function getKakoEulaliaBurdenState(runtimeApi, ownerId, phase) {
    var streetBurden = getEulaliaAssetValue(runtimeApi, ownerId, EULALIA_STREET_BURDEN_KEY);
    var phaseActive = isEulaliaPhaseActive(runtimeApi, ownerId, EULALIA_ABSORB_ACTIVE_KEY, phase) ||
      isEulaliaPhaseActive(runtimeApi, ownerId, EULALIA_BURST_PENDING_KEY, phase);
    if (streetBurden <= 0 && !phaseActive) {
      streetBurden = getEulaliaProjectedBurden(runtimeApi, ownerId);
    }
    if (streetBurden <= 0) {
      return {
        value: 0,
        forceMap: {},
        forceIds: []
      };
    }
    var syntheticId = createKakoEulaliaBurdenTrackId(ownerId);
    return {
      value: streetBurden,
      forceMap: {
        [syntheticId]: {
          power: streetBurden,
          ownerId: ownerId,
          targetId: ownerId,
          source: 'eulalia_nominal_burden',
          skillKey: 'absolution',
          type: 'curse'
        }
      },
      forceIds: [syntheticId]
    };
  }

  function getKakoCurseJudgeState(runtimeApi, target) {
    if (target && isRolePlayer(target, 'EULALIA')) {
      var eulaliaState = getKakoEulaliaBurdenState(runtimeApi, target.id, resolveRuntimePhase(runtimeApi, null));
      if (eulaliaState.value > 0) return eulaliaState;
    }
    return getKakoStatState(runtimeApi, target && target.id, KAKO_STREET_CURSE_KEY);
  }

  function setKakoStatState(runtimeApi, ownerId, key, state, meta) {
    state = state || {};
    var value = Math.max(0, Number(state.value || 0));
    if (value <= 0 && (!state.forceIds || !state.forceIds.length)) {
      clearKakoAsset(runtimeApi, ownerId, key);
      return null;
    }
    return setKakoAsset(runtimeApi, ownerId, key, value, Object.assign({
      forceMap: state.forceMap || {},
      forceIds: state.forceIds || []
    }, meta || {}));
  }

  function addKakoForceStat(runtimeApi, ownerId, key, force, power) {
    if (ownerId == null || !key || !force || !force._runtimeId) return;
    var state = getKakoStatState(runtimeApi, ownerId, key);
    var forceId = String(force._runtimeId);
    var nextPower = Math.max(0, Number(power != null ? power : force.power || 0));
    var current = state.forceMap[forceId] ? Math.max(0, Number(state.forceMap[forceId].power || 0)) : 0;
    state.value = Math.max(0, state.value - current + nextPower);
    state.forceMap[forceId] = {
      power: nextPower,
      ownerId: force.ownerId,
      targetId: force.targetId,
      source: force.source,
      skillKey: force.skillKey,
      activationId: force.activationId || null,
      type: force.type
    };
    if (state.forceIds.indexOf(forceId) < 0) state.forceIds.push(forceId);
    setKakoStatState(runtimeApi, ownerId, key, state, {
      source: 'kako_street_stats'
    });
  }

  function removeKakoForceStat(runtimeApi, ownerId, key, forceId) {
    if (ownerId == null || !key || !forceId) return;
    var state = getKakoStatState(runtimeApi, ownerId, key);
    var known = state.forceMap[String(forceId)];
    if (!known) return;
    state.value = Math.max(0, state.value - Math.max(0, Number(known.power || 0)));
    delete state.forceMap[String(forceId)];
    state.forceIds = state.forceIds.filter(function(id) {
      return id !== String(forceId);
    });
    setKakoStatState(runtimeApi, ownerId, key, state, {
      source: 'kako_street_stats'
    });
  }

  function ensureKakoOutgoingEntry(ownerId) {
    var key = String(ownerId);
    if (!kakoStreetOutgoing[key]) {
      kakoStreetOutgoing[key] = { fortune: 0, curse: 0, activations: Object.create(null) };
    }
    return kakoStreetOutgoing[key];
  }

  function getKakoOutgoingBucketKey(meta) {
    if (meta && meta.activationId) return 'act:' + String(meta.activationId);
    if (meta && meta.skillKey) return 'skill:' + String(meta.skillKey);
    if (meta && meta.source) return 'source:' + String(meta.source);
    if (meta && meta.forceId) return 'force:' + String(meta.forceId);
    return 'unknown';
  }

  function adjustKakoOutgoingActivation(ownerId, forceType, delta, meta) {
    if (ownerId == null || (forceType !== 'fortune' && forceType !== 'curse')) return;
    var entry = ensureKakoOutgoingEntry(ownerId);
    var bucketKey = getKakoOutgoingBucketKey(meta || {});
    if (!entry.activations[bucketKey]) {
      entry.activations[bucketKey] = { fortune: 0, curse: 0 };
    }
    entry.activations[bucketKey][forceType] = Math.max(
      0,
      Number(entry.activations[bucketKey][forceType] || 0) + Number(delta || 0)
    );
    if (entry.activations[bucketKey].fortune <= 0 && entry.activations[bucketKey].curse <= 0) {
      delete entry.activations[bucketKey];
    }
  }

  function adjustKakoOutgoing(ownerId, forceType, delta) {
    if (ownerId == null || (forceType !== 'fortune' && forceType !== 'curse')) return;
    var entry = ensureKakoOutgoingEntry(ownerId);
    entry[forceType] = Math.max(0, Number(entry[forceType] || 0) + Number(delta || 0));
  }

  function clearKakoStreetBookkeeping() {
    kakoStreetOutgoing = Object.create(null);
  }

  function snapshotKakoManaAnchors(runtimeApi) {
    kakoManaAnchors = Object.create(null);
    var players = getGamePlayers(runtimeApi);
    for (var i = 0; i < players.length; i++) {
      var player = players[i];
      var mana = getPlayerManaPool(runtimeApi, player && player.id);
      if (!player || !mana) continue;
      kakoManaAnchors[String(player.id)] = Math.max(0, Number(mana.current || 0));
    }
  }

  function getKakoTargetStats(runtimeApi, targetId) {
    var target = getPlayerById(runtimeApi, targetId);
    var curseState = getKakoCurseJudgeState(runtimeApi, target);
    return {
      fortune: getKakoAssetValue(runtimeApi, targetId, KAKO_STREET_FORTUNE_KEY),
      curse: Math.max(0, Number(curseState.value || 0)),
      lastManaDelta: getKakoAssetValue(runtimeApi, targetId, KAKO_LAST_MANA_DELTA_KEY),
      usedLimitedSkill: getKakoAssetValue(runtimeApi, targetId, KAKO_USED_LIMITED_KEY),
      redSeal: getKakoAssetValue(runtimeApi, targetId, KAKO_RED_SEAL_KEY) > 0
    };
  }

  function getKakoAttributedTypeState(runtimeApi, ownerId, forceType) {
    var key = forceType === 'fortune' ? KAKO_STREET_FORTUNE_KEY : KAKO_STREET_CURSE_KEY;
    var players = getGamePlayers(runtimeApi);
    var total = 0;
    var forceIds = [];
    var seen = Object.create(null);
    for (var i = 0; i < players.length; i++) {
      var player = players[i];
      if (!player) continue;
      var state = getKakoStatState(runtimeApi, player.id, key);
      var map = state && state.forceMap ? state.forceMap : null;
      if (!map) continue;
      var ids = Object.keys(map);
      for (var fi = 0; fi < ids.length; fi++) {
        var forceId = ids[fi];
        var entry = map[forceId];
        if (!entry || entry.ownerId !== ownerId || entry.type !== forceType) continue;
        if (seen[forceId]) continue;
        seen[forceId] = true;
        total += Math.max(0, Number(entry.power || 0));
        forceIds.push(String(forceId));
      }
    }
    return {
      value: total,
      forceIds: forceIds
    };
  }

  function isKakoEligibleRedlineTarget(player) {
    return !!(player &&
      player.isActive !== false &&
      !player.folded &&
      !isRolePlayer(player, 'KAKO'));
  }

  function computeKakoRedlineRate(runtimeApi) {
    var players = getGamePlayers(runtimeApi).filter(isKakoEligibleRedlineTarget);
    if (!players.length) return 0;
    var marked = players.filter(function(player) {
      return getKakoAssetValue(runtimeApi, player.id, KAKO_RED_SEAL_KEY) > 0;
    }).length;
    return marked / players.length;
  }

  function getKakoMaxStateForcePower(state) {
    if (!state || !state.forceMap) return 0;
    var forceIds = Object.keys(state.forceMap);
    var maxPower = 0;
    for (var i = 0; i < forceIds.length; i++) {
      var entry = state.forceMap[forceIds[i]];
      var power = Math.max(0, Number(entry && entry.power || 0));
      if (power > maxPower) maxPower = power;
    }
    return maxPower;
  }

  function getKakoMaxOutgoingForcePower(runtimeApi, ownerId, forceType) {
    if (ownerId == null || (forceType !== 'fortune' && forceType !== 'curse')) return 0;
    var entry = ensureKakoOutgoingEntry(ownerId);
    var buckets = Object.keys(entry.activations || {});
    var maxPower = 0;
    for (var i = 0; i < buckets.length; i++) {
      var bucket = entry.activations[buckets[i]];
      var power = Math.max(0, Number(bucket && bucket[forceType] || 0));
      if (power > maxPower) maxPower = power;
    }
    return maxPower;
  }

  function computeKakoEffectiveRedlineRate(runtimeApi, ownerId, includeSelfMarked) {
    var players = getGamePlayers(runtimeApi).filter(isKakoEligibleRedlineTarget);
    var marked = players.filter(function(player) {
      return getKakoAssetValue(runtimeApi, player.id, KAKO_RED_SEAL_KEY) > 0;
    }).length;
    var total = players.length;
    if (includeSelfMarked && ownerId != null) {
      total += 1;
      marked += 1;
    }
    if (total <= 0) return 0;
    return marked / total;
  }

  function syncKakoRedlineRate(runtimeApi) {
    var players = getKakoPlayers(runtimeApi);
    var rate = computeKakoRedlineRate(runtimeApi);
    for (var i = 0; i < players.length; i++) {
      setKakoAsset(runtimeApi, players[i].id, KAKO_REDLINE_RATE_KEY, rate, {
        source: 'kako_redline_rate'
      });
    }
    return rate;
  }

  function shouldKakoApplyRedSeal(runtimeApi, ownerId) {
    var incomingFortune = getKakoMaxStateForcePower(getKakoStatState(runtimeApi, ownerId, KAKO_STREET_FORTUNE_KEY));
    var owner = getPlayerById(runtimeApi, ownerId);
    var incomingCurse = getKakoMaxStateForcePower(getKakoCurseJudgeState(runtimeApi, owner));
    var outgoingFortune = getKakoMaxOutgoingForcePower(runtimeApi, ownerId, 'fortune');
    var outgoingCurse = getKakoMaxOutgoingForcePower(runtimeApi, ownerId, 'curse');
    var lastManaDelta = getKakoAssetValue(runtimeApi, ownerId, KAKO_LAST_MANA_DELTA_KEY);
    var usedLimitedSkill = getKakoAssetValue(runtimeApi, ownerId, KAKO_USED_LIMITED_KEY);
    return incomingFortune >= 40 ||
      incomingCurse >= 40 ||
      outgoingFortune >= 40 ||
      outgoingCurse >= 40 ||
      lastManaDelta >= 40 ||
      usedLimitedSkill > 0;
  }

  function syncKakoRedSealState(runtimeApi, ownerId) {
    if (ownerId == null) return;
    var skillSystem = getSkillSystem(runtimeApi);
    if (!skillSystem) return;
    if (!guardConfiguredRole(runtimeApi, 'KAKO', function(api) {
      clearKakoStreetAssets(api, false, false);
    })) return;
    var player = getPlayerById(runtimeApi, ownerId);
    if (!player) return;
    if (!isRuntimePlayerLive(player)) {
      clearKakoAsset(runtimeApi, ownerId, KAKO_RED_SEAL_KEY);
      clearStatusMarkSafe(skillSystem, ownerId, KAKO_RED_SEAL_KEY);
      emitKakoEvent(runtimeApi, 'kako:red_seal_changed', {
        ownerId: player.id,
        ownerName: player.name,
        active: false,
        stats: getKakoTargetStats(runtimeApi, ownerId)
      });
      syncKakoRedlineRate(runtimeApi);
      syncKakoPendingMarks(runtimeApi);
      return;
    }
    var wasSealed = getKakoAssetValue(runtimeApi, ownerId, KAKO_RED_SEAL_KEY) > 0;
    var sealed = shouldKakoApplyRedSeal(runtimeApi, ownerId);
    if (sealed) {
      setKakoAsset(runtimeApi, ownerId, KAKO_RED_SEAL_KEY, 1, {
        source: 'kako_red_seal'
      });
      skillSystem.setStatusMark(ownerId, KAKO_RED_SEAL_KEY, {
        sourceName: 'KAKO',
        icon: KAKO_RED_SEAL_ICON,
        title: '红章',
        tone: 'kako',
        duration: 'persistent',
        badgeText: '!',
        detail: '已进入红章状态'
      });
      if (!wasSealed) {
        emitKakoEvent(runtimeApi, 'kako:red_seal_changed', {
          ownerId: player.id,
          ownerName: player.name,
          active: true,
          stats: getKakoTargetStats(runtimeApi, ownerId)
        });
      }
    }
    syncKakoRedlineRate(runtimeApi);
    syncKakoPendingMarks(runtimeApi);
  }

  function syncAllKakoRedSealMarks(runtimeApi) {
    var skillSystem = getSkillSystem(runtimeApi);
    var players = getGamePlayers(runtimeApi);
    if (!skillSystem || !players || !players.length) return;
    if (!guardConfiguredRole(runtimeApi, 'KAKO', function(api) {
      clearKakoStreetAssets(api, false, false);
    })) return;
    for (var i = 0; i < players.length; i++) {
      var player = players[i];
      if (!player) continue;
      if (!isRuntimePlayerLive(player)) {
        clearKakoAsset(runtimeApi, player.id, KAKO_RED_SEAL_KEY);
        clearStatusMarkSafe(skillSystem, player.id, KAKO_RED_SEAL_KEY);
        continue;
      }
      if (getKakoAssetValue(runtimeApi, player.id, KAKO_RED_SEAL_KEY) <= 0) continue;
      skillSystem.setStatusMark(player.id, KAKO_RED_SEAL_KEY, {
        sourceName: 'KAKO',
        icon: KAKO_RED_SEAL_ICON,
        title: '红章',
        tone: 'kako',
        duration: 'persistent',
        badgeText: '!',
        detail: '已进入红章状态'
      });
    }
  }

  function clearKakoStreetAssets(runtimeApi, keepContracts, preserveRedSeal) {
    var players = getGamePlayers(runtimeApi);
    var skillSystem = getSkillSystem(runtimeApi);
    for (var i = 0; i < players.length; i++) {
      var player = players[i];
      if (!player) continue;
      clearKakoAsset(runtimeApi, player.id, KAKO_STREET_FORTUNE_KEY);
      clearKakoAsset(runtimeApi, player.id, KAKO_STREET_CURSE_KEY);
      clearKakoAsset(runtimeApi, player.id, KAKO_LAST_MANA_DELTA_KEY);
      clearKakoAsset(runtimeApi, player.id, KAKO_USED_LIMITED_KEY);
      if (skillSystem && typeof skillSystem.clearStatusMark === 'function') {
        skillSystem.clearStatusMark(player.id, KAKO_RULING_PENDING_MARK_KEY);
      }
      if (!preserveRedSeal) {
        clearKakoAsset(runtimeApi, player.id, KAKO_RED_SEAL_KEY);
        if (skillSystem && typeof skillSystem.clearStatusMark === 'function') {
          skillSystem.clearStatusMark(player.id, KAKO_RED_SEAL_KEY);
        }
      }
    }
    if (!keepContracts) {
      var owners = getKakoPlayers(runtimeApi);
      for (var j = 0; j < owners.length; j++) {
        clearKakoAsset(runtimeApi, owners[j].id, KAKO_RULING_CONTRACT_KEY);
        clearKakoAsset(runtimeApi, owners[j].id, KAKO_REDLINE_RATE_KEY);
      }
    }
    clearKakoStreetBookkeeping();
    syncKakoRedlineRate(runtimeApi);
  }

  function syncKakoPendingMarks(runtimeApi) {
    var skillSystem = getSkillSystem(runtimeApi);
    if (!skillSystem) return;
    if (!guardConfiguredRole(runtimeApi, 'KAKO', function(api) {
      clearKakoStreetAssets(api, false, false);
    })) return;
    var players = getGamePlayers(runtimeApi);
    for (var i = 0; i < players.length; i++) {
      if (players[i]) skillSystem.clearStatusMark(players[i].id, KAKO_RULING_PENDING_MARK_KEY);
    }

    var owners = getKakoPlayers(runtimeApi);
    for (var oi = 0; oi < owners.length; oi++) {
      var owner = owners[oi];
      var contracts = getKakoContracts(runtimeApi, owner.id);
      for (var ci = 0; ci < contracts.length; ci++) {
        var contract = contracts[ci];
        if (!contract) continue;
        if (contract.kind === 'reclassification') {
          var target = getPlayerById(runtimeApi, contract.targetId);
          if (!isKakoReclassificationTarget(runtimeApi, owner, target)) continue;
          skillSystem.setStatusMark(target.id, KAKO_RULING_PENDING_MARK_KEY, {
            sourceName: owner.name,
            icon: KAKO_RULING_ICON,
            title: '改判待裁定',
            tone: 'kako',
            duration: 'street',
            detail: '发牌前将进入审判时刻'
          });
        } else if (contract.kind === 'general_ruling') {
          var targets = getGamePlayers(runtimeApi).filter(isKakoEligibleRedlineTarget).filter(function(player) {
            return getKakoAssetValue(runtimeApi, player.id, KAKO_RED_SEAL_KEY) > 0;
          });
          for (var ti = 0; ti < targets.length; ti++) {
            skillSystem.setStatusMark(targets[ti].id, KAKO_RULING_PENDING_MARK_KEY, {
              sourceName: owner.name,
              icon: KAKO_RULING_ICON,
              title: '总务裁定',
              tone: 'kako',
              duration: 'street',
              detail: '本街将被纳入总务裁定'
            });
          }
        }
      }
    }
  }

  function applyKakoStreetStatForce(runtimeApi, force, sign) {
    if (!force || !force._runtimeId) return;
    var recipientId = getKakoForceRecipientId(force);
    if (recipientId == null) return;
    var key = force.type === 'fortune' ? KAKO_STREET_FORTUNE_KEY : KAKO_STREET_CURSE_KEY;
    if (sign >= 0) {
      addKakoForceStat(runtimeApi, recipientId, key, force, Math.max(0, Number(force.power || 0)));
      adjustKakoOutgoing(force.ownerId, force.type, Math.max(0, Number(force.power || 0)));
      adjustKakoOutgoingActivation(force.ownerId, force.type, Math.max(0, Number(force.power || 0)), {
        activationId: force.activationId || null,
        skillKey: force.skillKey || null,
        source: force.source || null,
        forceId: force._runtimeId
      });
    } else {
      removeKakoForceStat(runtimeApi, recipientId, key, force._runtimeId);
      adjustKakoOutgoing(force.ownerId, force.type, -Math.max(0, Number(force.power || 0)));
      adjustKakoOutgoingActivation(force.ownerId, force.type, -Math.max(0, Number(force.power || 0)), {
        activationId: force.activationId || null,
        skillKey: force.skillKey || null,
        source: force.source || null,
        forceId: force._runtimeId
      });
    }
    syncKakoRedSealState(runtimeApi, recipientId);
    if (force.ownerId != null && force.ownerId !== recipientId) {
      syncKakoRedSealState(runtimeApi, force.ownerId);
    }
    syncKakoPendingMarks(runtimeApi);
  }

  function handleKakoForceQueued(payload, runtimeApi) {
    if (!isKakoTrackedForcePayload(payload)) return;
    applyKakoStreetStatForce(runtimeApi, payload.force, 1);
  }

  function handleKakoForceRemoved(payload, runtimeApi) {
    if (!isKakoTrackedForcePayload(payload)) return;
    applyKakoStreetStatForce(runtimeApi, payload.force, -1);
  }

  function handleKakoForceMutated(payload, runtimeApi) {
    if (payload && payload.before) {
      handleKakoForceRemoved({
        force: payload.before,
        meta: payload.meta
      }, runtimeApi);
    }
    if (payload && payload.after) {
      handleKakoForceQueued({
        force: payload.after,
        meta: payload.meta
      }, runtimeApi);
    }
  }

  function captureKakoManaDelta(payload, runtimeApi) {
    if (!payload || payload.ownerId == null) return;
    var ownerId = Number(payload.ownerId);
    var current = Math.max(0, Number(payload.current || 0));
    var previous = kakoManaAnchors[String(ownerId)];
    kakoManaAnchors[String(ownerId)] = current;
    if (previous == null) return;
    var delta = Math.abs(current - previous);
    setKakoAsset(runtimeApi, ownerId, KAKO_LAST_MANA_DELTA_KEY, delta, {
      source: payload.reason || 'mana_changed'
    });
    syncKakoRedSealState(runtimeApi, ownerId);
  }

  function captureKakoLimitedSkillUsage(payload, runtimeApi) {
    if (!payload || !payload.skill || payload.skill.ownerId == null) return;
    var skill = payload.skill;
    if (!(skill.usesPerGame > 0 || Number(skill.level || 0) === 0)) return;
    setKakoAsset(runtimeApi, skill.ownerId, KAKO_USED_LIMITED_KEY, 1, {
      source: skill.skillKey || skill.effect || 'limited_skill'
    });
    syncKakoRedSealState(runtimeApi, skill.ownerId);
  }

  function pickKakoRulingType(stats, explicitChoice) {
    if (explicitChoice === 'fortune' && stats.fortune > 0) return 'fortune';
    if (explicitChoice === 'curse' && stats.curse > 0) return 'curse';
    if (stats.fortune > stats.curse) return 'fortune';
    if (stats.curse > 0) return 'curse';
    if (stats.fortune > 0) return 'fortune';
    return 'curse';
  }

  function getKakoGeneralTargets(runtimeApi, ownerId) {
    return getGamePlayers(runtimeApi).filter(function(player) {
      return player &&
        player.id !== ownerId &&
        isKakoEligibleRedlineTarget(player) &&
        getKakoAssetValue(runtimeApi, player.id, KAKO_RED_SEAL_KEY) > 0;
    });
  }

  function hasKakoJudgeableStats(runtimeApi, targetId) {
    if (targetId == null) return false;
    var target = getPlayerById(runtimeApi, targetId);
    return getKakoAssetValue(runtimeApi, targetId, KAKO_STREET_FORTUNE_KEY) > 0 ||
      getKakoCurseJudgeState(runtimeApi, target).value > 0;
  }

  function isKakoReclassificationTarget(runtimeApi, owner, target) {
    if (!owner || !target) return false;
    if (target.id === owner.id) return true;
    if (hasKakoJudgeableStats(runtimeApi, target.id)) return true;
    return isKakoEligibleRedlineTarget(target);
  }

  function buildKakoEntryForContract(runtimeApi, owner, contract, target) {
    if (!owner || !contract || !target) return null;
    var fortuneState = getKakoStatState(runtimeApi, target.id, KAKO_STREET_FORTUNE_KEY);
    var curseState = getKakoCurseJudgeState(runtimeApi, target);
    var total = Math.max(0, Number(fortuneState.value || 0) + Number(curseState.value || 0));
    if (total <= 0) return null;
    var selfRuling = owner.id === target.id;
    var entry = {
      contractId: contract.id,
      kind: contract.kind,
      sourceSkill: contract.sourceSkill,
      targetId: target.id,
      targetName: target.name,
      hasRedSeal: getKakoAssetValue(runtimeApi, target.id, KAKO_RED_SEAL_KEY) > 0 || selfRuling,
      streetAddedFortune: Math.max(0, Number(fortuneState.value || 0)),
      streetAddedCurse: Math.max(0, Number(curseState.value || 0)),
      trackedForceIds: {
        fortune: Array.isArray(fortuneState.forceIds) ? fortuneState.forceIds.slice() : [],
        curse: Array.isArray(curseState.forceIds) ? curseState.forceIds.slice() : []
      },
      rulingType: chooseKakoAiRulingType(runtimeApi, owner.id, {
        fortune: Math.max(0, Number(fortuneState.value || 0)),
        curse: Math.max(0, Number(curseState.value || 0))
      }, contract.choice || null),
      decision: null
    };
    entry.previewRates = null;
    return entry;
  }

  function getKakoRedlineBonusRate(runtimeApi, ownerId, hasRedSeal, entry) {
    if (!hasRedSeal) return 0;
    var effect = getTraitEffect(runtimeApi, ownerId, 'kako_redline_file');
    if (!effect) return 0;
    var selfMarked = !!(entry && entry.targetId === ownerId);
    var rate = selfMarked
      ? computeKakoEffectiveRedlineRate(runtimeApi, ownerId, true)
      : Math.max(0, getKakoAssetValue(runtimeApi, ownerId, KAKO_REDLINE_RATE_KEY));
    return Math.max(0, Number(effect.bonusPerRedlineRate || 0)) * rate;
  }

  function getKakoDecisionProfile(runtimeApi, ownerId, entry, decision) {
    var kind = entry.kind || entry.sourceSkill;
    var approve = decision === 'approve';
    var bonusRate = entry && entry.hasRedSeal
      ? getKakoRedlineBonusRate(runtimeApi, ownerId, true, entry)
      : 0;
    var primaryRate = 0;
    var secondaryRate = 0;
    if (kind === 'general_ruling') {
      primaryRate = 0.33;
      secondaryRate = 0.14;
    } else if (entry.hasRedSeal) {
      primaryRate = 0.30;
      secondaryRate = 0.12;
    } else {
      primaryRate = 0.15;
      secondaryRate = 0.08;
    }
    primaryRate += bonusRate;
    secondaryRate += bonusRate;
    return {
      primaryFactor: approve ? (1 + primaryRate) : Math.max(0, 1 - primaryRate),
      secondaryFactor: Math.max(0, 1 - secondaryRate),
      primaryRate: primaryRate,
      secondaryRate: secondaryRate
    };
  }

  function buildKakoEntryPreviewRates(runtimeApi, ownerId, entry) {
    var profile = getKakoDecisionProfile(runtimeApi, ownerId, entry, 'approve');
    return {
      primaryRate: Math.max(0, Number(profile && profile.primaryRate || 0)),
      secondaryRate: Math.max(0, Number(profile && profile.secondaryRate || 0))
    };
  }

  function applyKakoMultiplierToEulaliaBurden(runtimeApi, ownerId, factor, meta) {
    if (ownerId == null) return;
    var beforeStreetBurden = meta && meta.baseAmount != null
      ? Math.max(0, Number(meta.baseAmount || 0))
      : getEulaliaAssetValue(runtimeApi, ownerId, EULALIA_STREET_BURDEN_KEY);
    if (beforeStreetBurden <= 0) {
      beforeStreetBurden = getEulaliaProjectedBurden(runtimeApi, ownerId);
    }
    var nextStreetBurden = Math.max(0, Math.ceil(Math.max(0, Number(beforeStreetBurden || 0)) * Number(factor || 0)));
    var delta = nextStreetBurden - beforeStreetBurden;
    var phase = resolveRuntimePhase(runtimeApi, meta || {});
    var beforeTotal = getEulaliaAssetValue(runtimeApi, ownerId, EULALIA_ABSOLUTION_TOTAL_KEY);
    var nextTotal = Math.max(0, beforeTotal + delta);
    setEulaliaAsset(runtimeApi, ownerId, EULALIA_STREET_BURDEN_KEY, nextStreetBurden, {
      reason: meta && meta.reason ? meta.reason : 'kako_ruling_eulalia_burden',
      phase: phase
    });
    setEulaliaAsset(runtimeApi, ownerId, EULALIA_QUEUED_BURDEN_KEY, nextStreetBurden, {
      reason: meta && meta.reason ? meta.reason : 'kako_ruling_eulalia_burden',
      phase: phase
    });
    setEulaliaAsset(runtimeApi, ownerId, EULALIA_ABSOLUTION_TOTAL_KEY, nextTotal, {
      reason: meta && meta.reason ? meta.reason : 'kako_ruling_eulalia_burden',
      phase: phase
    });
    updateEulaliaNominalBurden(runtimeApi, ownerId, nextStreetBurden, phase);
    syncEulaliaStatusMarks(runtimeApi, ownerId);
    syncKakoRedSealState(runtimeApi, ownerId);
    var skillSystem = getSkillSystem(runtimeApi);
    if (skillSystem && typeof skillSystem._log === 'function') {
      skillSystem._log('KAKO_FORCE_MUTATION', {
        forceId: createKakoEulaliaBurdenTrackId(ownerId),
        ownerId: ownerId,
        ownerName: getPlayerById(runtimeApi, ownerId) ? getPlayerById(runtimeApi, ownerId).name : null,
        targetId: ownerId,
        targetName: getPlayerById(runtimeApi, ownerId) ? getPlayerById(runtimeApi, ownerId).name : null,
        type: 'curse',
        beforePower: beforeStreetBurden,
        afterPower: nextStreetBurden,
        factor: Number(factor || 0),
        reason: meta && meta.reason ? meta.reason : null,
        contractId: meta && meta.contractId ? meta.contractId : null,
        decision: meta && meta.decision ? meta.decision : null,
        rulingType: meta && meta.rulingType ? meta.rulingType : null
      });
    }
  }

  function applyKakoMultiplierToForces(runtimeApi, forceIds, factor, meta) {
    var skillSystem = getSkillSystem(runtimeApi);
    if (!Array.isArray(forceIds) || !forceIds.length) return;
    for (var ai = 0; ai < forceIds.length; ai++) {
      var eulaliaBurdenOwnerId = parseKakoEulaliaBurdenTrackId(forceIds[ai]);
      if (eulaliaBurdenOwnerId != null) {
        applyKakoMultiplierToEulaliaBurden(runtimeApi, eulaliaBurdenOwnerId, factor, meta);
      }
    }
    if (!skillSystem || !Array.isArray(skillSystem.pendingForces)) return;
    for (var i = 0; i < skillSystem.pendingForces.length; i++) {
      var force = skillSystem.pendingForces[i];
      if (!force || force._runtimeId == null) continue;
      if (forceIds.indexOf(String(force._runtimeId)) < 0) continue;
      var before = Object.assign({}, force);
      var nextPower = Math.max(0, Math.ceil(Math.max(0, Number(force.power || 0)) * Number(factor || 0)));
      force.power = nextPower;
      if (force.effectivePower != null) force.effectivePower = nextPower;
      if (typeof skillSystem._log === 'function') {
        skillSystem._log('KAKO_FORCE_MUTATION', {
          forceId: force._runtimeId,
          ownerId: force.ownerId,
          ownerName: force.ownerName || null,
          targetId: getKakoForceRecipientId(force),
          targetName: force.targetName || null,
          type: force.type,
          beforePower: before.power != null ? Number(before.power) : 0,
          afterPower: nextPower,
          factor: Number(factor || 0),
          reason: meta && meta.reason ? meta.reason : null,
          contractId: meta && meta.contractId ? meta.contractId : null,
          decision: meta && meta.decision ? meta.decision : null,
          rulingType: meta && meta.rulingType ? meta.rulingType : null
        });
      }
      if (typeof skillSystem._mutatePendingForce === 'function') {
        skillSystem._mutatePendingForce(force, before, meta || null);
      }
    }
  }

  function resolveKakoDecisions(runtimeApi, ownerId, result) {
    var selectedEntries = Array.isArray(result && result.entries) ? result.entries : [];
    var owner = getPlayerById(runtimeApi, ownerId);
    var resolvedEntries = [];
    for (var i = 0; i < selectedEntries.length; i++) {
      var selected = selectedEntries[i];
      var decision = selected && selected.decision ? String(selected.decision) : null;
      if (decision !== 'approve' && decision !== 'reject') continue;
      var primaryType = selected && selected.selectedType === 'fortune'
        ? 'fortune'
        : selected && selected.selectedType === 'curse'
          ? 'curse'
          : selected.rulingType === 'fortune'
            ? 'fortune'
            : 'curse';
      var secondaryType = primaryType === 'fortune' ? 'curse' : 'fortune';
      var profile = getKakoDecisionProfile(runtimeApi, ownerId, selected, decision);
      var tracked = selected && selected.trackedForceIds ? selected.trackedForceIds : {};
      var primaryForceIds = Array.isArray(tracked[primaryType]) ? tracked[primaryType] : [];
      var secondaryForceIds = Array.isArray(tracked[secondaryType]) ? tracked[secondaryType] : [];
      applyKakoMultiplierToForces(runtimeApi, primaryForceIds, profile.primaryFactor, {
        reason: 'kako_ruling_primary',
        ownerId: ownerId,
        contractId: selected.contractId,
        decision: decision,
        rulingType: primaryType,
        baseAmount: primaryType === 'fortune'
          ? Math.max(0, Number(selected && selected.streetAddedFortune || 0))
          : Math.max(0, Number(selected && selected.streetAddedCurse || 0))
      });
      applyKakoMultiplierToForces(runtimeApi, secondaryForceIds, profile.secondaryFactor, {
        reason: 'kako_ruling_secondary',
        ownerId: ownerId,
        contractId: selected.contractId,
        decision: decision,
        rulingType: secondaryType,
        baseAmount: secondaryType === 'fortune'
          ? Math.max(0, Number(selected && selected.streetAddedFortune || 0))
          : Math.max(0, Number(selected && selected.streetAddedCurse || 0))
      });
      resolvedEntries.push({
        contractId: selected.contractId || null,
        kind: selected.kind || selected.sourceSkill || null,
        targetId: selected.targetId,
        targetName: selected.targetName || null,
        hasRedSeal: !!selected.hasRedSeal,
        decision: decision,
        selectedType: primaryType,
        rulingType: primaryType,
        primaryFactor: profile.primaryFactor,
        secondaryFactor: profile.secondaryFactor,
        streetAddedFortune: Math.max(0, Number(selected.streetAddedFortune || 0)),
        streetAddedCurse: Math.max(0, Number(selected.streetAddedCurse || 0))
      });
    }
    if (resolvedEntries.length) {
      emitKakoEvent(runtimeApi, 'kako:ruling_resolved', {
        ownerId: ownerId,
        ownerName: owner ? owner.name : 'KAKO',
        resultMode: result && result.mode ? result.mode : null,
        sourceSkill: result && result.sourceSkill ? result.sourceSkill : null,
        entries: resolvedEntries
      });
    }
  }

  function buildKakoPreDealWindow(runtimeApi, owner) {
    if (!owner) return null;
    var contracts = getKakoContracts(runtimeApi, owner.id);
    if (!contracts.length) return null;
    var entries = [];
    for (var i = 0; i < contracts.length; i++) {
      var contract = contracts[i];
      if (!contract) continue;
        if (contract.kind === 'reclassification') {
          var target = getPlayerById(runtimeApi, contract.targetId);
          if (!isKakoReclassificationTarget(runtimeApi, owner, target)) continue;
          var singleEntry = buildKakoEntryForContract(runtimeApi, owner, contract, target);
          if (singleEntry) {
            singleEntry.previewRates = buildKakoEntryPreviewRates(runtimeApi, owner.id, singleEntry);
            if (owner.type === 'ai') {
              singleEntry.rulingType = chooseKakoAiRulingType(runtimeApi, owner.id, {
                fortune: Math.max(0, Number(singleEntry.streetAddedFortune || 0)),
                curse: Math.max(0, Number(singleEntry.streetAddedCurse || 0))
              }, singleEntry.rulingType || null);
              singleEntry.decision = chooseKakoAiDecision(runtimeApi, owner.id, singleEntry);
            }
            entries.push(singleEntry);
          }
        } else if (contract.kind === 'general_ruling') {
          var targets = getKakoGeneralTargets(runtimeApi, owner.id);
          for (var ti = 0; ti < targets.length; ti++) {
            var groupEntry = buildKakoEntryForContract(runtimeApi, owner, contract, targets[ti]);
            if (groupEntry) {
              groupEntry.previewRates = buildKakoEntryPreviewRates(runtimeApi, owner.id, groupEntry);
              if (owner.type === 'ai') {
                groupEntry.rulingType = chooseKakoAiRulingType(runtimeApi, owner.id, {
                  fortune: Math.max(0, Number(groupEntry.streetAddedFortune || 0)),
                  curse: Math.max(0, Number(groupEntry.streetAddedCurse || 0))
                }, groupEntry.rulingType || null);
                groupEntry.decision = chooseKakoAiDecision(runtimeApi, owner.id, groupEntry);
              }
              entries.push(groupEntry);
            }
          }
        }
    }
    if (!entries.length) {
      emitKakoEvent(runtimeApi, 'kako:window_skipped', {
        ownerId: owner.id,
        ownerName: owner.name,
        contractCount: contracts.length,
        sourceSkill: contracts.some(function(contract) { return contract && contract.kind === 'general_ruling'; })
          ? 'general_ruling'
          : 'reclassification',
        reason: 'no_effective_entries'
      });
      setKakoContracts(runtimeApi, owner.id, [], {
        source: 'kako_predeal_empty'
      });
      syncKakoPendingMarks(runtimeApi);
      return null;
    }
    emitKakoEvent(runtimeApi, 'kako:window_opened', {
      ownerId: owner.id,
      ownerName: owner.name,
      mode: owner.type === 'ai' ? 'ai' : 'human',
      entryCount: entries.length,
      sourceSkill: entries.some(function(entry) { return entry.kind === 'general_ruling'; })
        ? 'general_ruling'
        : 'reclassification',
      entries: entries.map(function(entry) {
        return {
          contractId: entry.contractId || null,
          kind: entry.kind || entry.sourceSkill || null,
          targetId: entry.targetId,
          targetName: entry.targetName || null,
          hasRedSeal: !!entry.hasRedSeal,
          rulingType: entry.rulingType || null,
          streetAddedFortune: Math.max(0, Number(entry.streetAddedFortune || 0)),
          streetAddedCurse: Math.max(0, Number(entry.streetAddedCurse || 0))
        };
      })
    });
    return {
      ownerId: owner.id,
      ownerName: owner.name,
      mode: owner.type === 'ai' ? 'ai' : 'human',
      sourceSkill: entries.some(function(entry) { return entry.kind === 'general_ruling'; }) ? 'general_ruling' : 'reclassification',
      entries: entries,
      confirmLabel: '判决 / 确定',
      autoDelayMs: owner.type === 'ai' ? 900 : 0,
      applyDecisions: function(result) {
        resolveKakoDecisions(runtimeApi, owner.id, result || {});
        setKakoContracts(runtimeApi, owner.id, [], {
          source: 'kako_predeal_resolved'
        });
        syncKakoPendingMarks(runtimeApi);
      }
    };
  }

  function handleKakoSkillActivationEvent(payload, runtimeApi) {
    if (!payload || !payload.skill || payload.skill.ownerId == null) return;
    if (payload.__kakoRuntimeHandled) return;
    payload.__kakoRuntimeHandled = true;
    captureKakoLimitedSkillUsage(payload, runtimeApi);

    var ownerId = payload.skill.ownerId;
    var owner = getPlayerById(runtimeApi, ownerId);
    if (!owner || !isRolePlayer(owner, 'KAKO')) return;

    if (payload.type !== 'reclassification' &&
        payload.type !== 'general_ruling' &&
        payload.skill.effect !== 'reclassification' &&
        payload.skill.effect !== 'general_ruling') {
      return;
    }

    var contracts = getKakoContracts(runtimeApi, ownerId);
    if (payload.type === 'reclassification' || payload.skill.effect === 'reclassification') {
      var targetId = payload.targetId != null
        ? Number(payload.targetId)
        : payload.options && payload.options.targetId != null
          ? Number(payload.options.targetId)
          : null;
      if (targetId == null) return;
      contracts.push({
        id: createKakoContractId('kako_reclassification'),
        kind: 'reclassification',
        ownerId: ownerId,
        ownerName: owner.name,
        sourceSkill: 'reclassification',
        targetId: targetId,
        choice: payload.options && payload.options.rulingChoice ? String(payload.options.rulingChoice) : null,
        phase: payload.phase != null ? payload.phase : resolveRuntimePhase(runtimeApi, payload)
      });
    } else {
      contracts.push({
        id: createKakoContractId('kako_general_ruling'),
        kind: 'general_ruling',
        ownerId: ownerId,
        ownerName: owner.name,
        sourceSkill: 'general_ruling',
        phase: payload.phase != null ? payload.phase : resolveRuntimePhase(runtimeApi, payload)
      });
    }
    setKakoContracts(runtimeApi, ownerId, contracts, {
      source: 'kako_skill_activation'
    });
    emitKakoEvent(runtimeApi, 'kako:contract_queued', {
      ownerId: ownerId,
      ownerName: owner.name,
      contractId: contracts.length ? contracts[contracts.length - 1].id : null,
      kind: payload.type === 'general_ruling' || payload.skill.effect === 'general_ruling'
        ? 'general_ruling'
        : 'reclassification',
      targetId: payload.targetId != null ? Number(payload.targetId) : null,
      targetName: payload.targetId != null && getPlayerById(runtimeApi, payload.targetId)
        ? getPlayerById(runtimeApi, payload.targetId).name
        : null,
      contractCount: contracts.length
    });
    syncKakoPendingMarks(runtimeApi);
  }

  function processKakoSignoffFlow(runtimeApi) {
    var players = getKakoPlayers(runtimeApi);
    var rate = syncKakoRedlineRate(runtimeApi);
    for (var i = 0; i < players.length; i++) {
      var owner = players[i];
      var effect = getTraitEffect(runtimeApi, owner.id, 'kako_signoff_flow');
      if (!effect) continue;
      var manaGain = Math.max(0, Math.ceil(rate * Math.max(0, Number(effect.manaPerStreetCap || 0))));
      if (manaGain <= 0) continue;
      var mana = getPlayerManaPool(runtimeApi, owner.id);
      if (!mana) continue;
      var before = mana.current;
      setManaCurrent(runtimeApi, owner.id, mana.current + manaGain, 'kako_signoff_flow');
      emitKakoEvent(runtimeApi, 'kako:signoff_flow', {
        ownerId: owner.id,
        ownerName: owner.name,
        redlineRate: rate,
        manaGain: manaGain,
        manaBefore: before,
        manaAfter: Math.min(Number(mana.max != null ? mana.max : before + manaGain), before + manaGain)
      });
    }
  }

  function scoreKakoTarget(runtimeApi, ownerId, player) {
    if (!player || player.id === ownerId) return -9999;
    var stats = getKakoTargetStats(runtimeApi, player.id);
    var total = Math.max(0, stats.fortune + stats.curse);
    if (total <= 0) return -9999;
    var selfStats = getKakoTargetStats(runtimeApi, ownerId);
    var selfTilt = Math.max(0, Number(selfStats.curse || 0)) - Math.max(0, Number(selfStats.fortune || 0));
    var offensiveBias = selfTilt < 0;
    var score = total;
    score += stats.redSeal ? 42 : 0;
    score += Math.max(stats.fortune, stats.curse) * 0.7;
    score += offensiveBias
      ? Math.max(0, Number(stats.curse || 0)) * 0.9 + Math.max(0, Number(stats.fortune || 0)) * 0.2
      : Math.max(0, Number(stats.fortune || 0)) * 0.9 + Math.max(0, Number(stats.curse || 0)) * 0.2;
    score += Math.max(0, Number(player.totalBet || 0)) * 0.05;
    return score;
  }

  function getKakoSelfMood(runtimeApi, ownerId) {
    var selfStats = getKakoTargetStats(runtimeApi, ownerId);
    return {
      fortune: Math.max(0, Number(selfStats.fortune || 0)),
      curse: Math.max(0, Number(selfStats.curse || 0)),
      momentum: Math.max(0, Number(selfStats.fortune || 0)) - Math.max(0, Number(selfStats.curse || 0))
    };
  }

  function chooseKakoAiRulingType(runtimeApi, ownerId, stats, explicitChoice) {
    if (!stats) return pickKakoRulingType({ fortune: 0, curse: 0 }, explicitChoice);
    if (explicitChoice === 'fortune' && stats.fortune > 0) return 'fortune';
    if (explicitChoice === 'curse' && stats.curse > 0) return 'curse';
    var selfMood = getKakoSelfMood(runtimeApi, ownerId);
    if (stats.fortune > stats.curse) return 'fortune';
    if (stats.curse > stats.fortune) return 'curse';
    if (selfMood.momentum >= 0 && stats.curse > 0) return 'curse';
    if (selfMood.momentum < 0 && stats.fortune > 0) return 'fortune';
    return pickKakoRulingType(stats, explicitChoice);
  }

  function chooseKakoAiDecision(runtimeApi, ownerId, entry) {
    if (!entry) return 'approve';
    var selfMood = getKakoSelfMood(runtimeApi, ownerId);
    var rulingType = chooseKakoAiRulingType(runtimeApi, ownerId, {
      fortune: Math.max(0, Number(entry.streetAddedFortune || 0)),
      curse: Math.max(0, Number(entry.streetAddedCurse || 0))
    }, entry.rulingType || null);
    var targetFortune = Math.max(0, Number(entry.streetAddedFortune || 0));
    var targetCurse = Math.max(0, Number(entry.streetAddedCurse || 0));
    var score = selfMood.momentum * 0.85;
    score += entry.hasRedSeal ? 8 : 0;
    if (rulingType === 'fortune') {
      score += targetCurse * 0.2;
      score -= targetFortune * 1.1;
    } else {
      score += targetCurse * 1.1;
      score -= targetFortune * 0.2;
    }
    return score >= 0 ? 'approve' : 'reject';
  }

  function getKakoBoardPressure(runtimeApi, ownerId) {
    var players = getGamePlayers(runtimeApi).filter(function(player) {
      return player &&
        player.id !== ownerId &&
        player.isActive !== false &&
        !player.folded;
    });
    var affectedTargets = 0;
    var redTargets = 0;
    var total = 0;
    for (var i = 0; i < players.length; i++) {
      var stats = getKakoTargetStats(runtimeApi, players[i].id);
      var subtotal = Math.max(0, Number(stats.fortune || 0)) + Math.max(0, Number(stats.curse || 0));
      if (subtotal > 0) affectedTargets += 1;
      if (stats.redSeal) redTargets += 1;
      total += subtotal;
    }
    return {
      affectedTargets: affectedTargets,
      redTargets: redTargets,
      total: total
    };
  }

  function shouldKakoUseReclassification(runtimeApi, ownerId, base) {
    var target = resolveKakoPrimaryTarget(runtimeApi, ownerId);
    if (!target) return false;
    var stats = getKakoTargetStats(runtimeApi, target.id);
    var total = Math.max(0, stats.fortune + stats.curse);
    if (stats.redSeal) return total >= 16 || base;
    return total >= 24 || (base && total >= 12);
  }

  function shouldKakoUseGeneralRuling(runtimeApi, ownerId, base) {
    var pressure = getKakoBoardPressure(runtimeApi, ownerId);
    if (pressure.redTargets <= 0) return false;
    if (pressure.affectedTargets >= 3 && pressure.total >= 72) return true;
    if (pressure.redTargets >= 2 && pressure.total >= 54) return true;
    if (pressure.redTargets >= 3) return true;
    return !!(base && pressure.redTargets >= 2 && pressure.total >= 36);
  }

  function resolveKakoPrimaryTarget(runtimeApi, ownerId) {
    var targets = getGamePlayers(runtimeApi).filter(function(player) {
      return player &&
        player.id !== ownerId &&
        player.isActive !== false &&
        !player.folded;
    }).sort(function(a, b) {
      return scoreKakoTarget(runtimeApi, ownerId, b) - scoreKakoTarget(runtimeApi, ownerId, a);
    });
    return targets[0] || null;
  }

  Object.assign(Builtin, {
    "kakoStreetOutgoing": kakoStreetOutgoing,
    "kakoManaAnchors": kakoManaAnchors,
    "getKakoPlayers": getKakoPlayers,
    "emitKakoEvent": emitKakoEvent,
    "getKakoAsset": getKakoAsset,
    "getKakoAssetValue": getKakoAssetValue,
    "setKakoAsset": setKakoAsset,
    "clearKakoAsset": clearKakoAsset,
    "getKakoContracts": getKakoContracts,
    "setKakoContracts": setKakoContracts,
    "createKakoContractId": createKakoContractId,
    "getKakoForceRecipientId": getKakoForceRecipientId,
    "isKakoTrackedForcePayload": isKakoTrackedForcePayload,
    "getKakoStatState": getKakoStatState,
    "createKakoEulaliaBurdenTrackId": createKakoEulaliaBurdenTrackId,
    "parseKakoEulaliaBurdenTrackId": parseKakoEulaliaBurdenTrackId,
    "getKakoEulaliaBurdenState": getKakoEulaliaBurdenState,
    "getKakoCurseJudgeState": getKakoCurseJudgeState,
    "setKakoStatState": setKakoStatState,
    "addKakoForceStat": addKakoForceStat,
    "removeKakoForceStat": removeKakoForceStat,
    "ensureKakoOutgoingEntry": ensureKakoOutgoingEntry,
    "getKakoOutgoingBucketKey": getKakoOutgoingBucketKey,
    "adjustKakoOutgoingActivation": adjustKakoOutgoingActivation,
    "adjustKakoOutgoing": adjustKakoOutgoing,
    "clearKakoStreetBookkeeping": clearKakoStreetBookkeeping,
    "snapshotKakoManaAnchors": snapshotKakoManaAnchors,
    "getKakoTargetStats": getKakoTargetStats,
    "getKakoAttributedTypeState": getKakoAttributedTypeState,
    "isKakoEligibleRedlineTarget": isKakoEligibleRedlineTarget,
    "computeKakoRedlineRate": computeKakoRedlineRate,
    "getKakoMaxStateForcePower": getKakoMaxStateForcePower,
    "getKakoMaxOutgoingForcePower": getKakoMaxOutgoingForcePower,
    "computeKakoEffectiveRedlineRate": computeKakoEffectiveRedlineRate,
    "syncKakoRedlineRate": syncKakoRedlineRate,
    "shouldKakoApplyRedSeal": shouldKakoApplyRedSeal,
    "syncKakoRedSealState": syncKakoRedSealState,
    "syncAllKakoRedSealMarks": syncAllKakoRedSealMarks,
    "clearKakoStreetAssets": clearKakoStreetAssets,
    "syncKakoPendingMarks": syncKakoPendingMarks,
    "applyKakoStreetStatForce": applyKakoStreetStatForce,
    "handleKakoForceQueued": handleKakoForceQueued,
    "handleKakoForceRemoved": handleKakoForceRemoved,
    "handleKakoForceMutated": handleKakoForceMutated,
    "captureKakoManaDelta": captureKakoManaDelta,
    "captureKakoLimitedSkillUsage": captureKakoLimitedSkillUsage,
    "pickKakoRulingType": pickKakoRulingType,
    "getKakoGeneralTargets": getKakoGeneralTargets,
    "hasKakoJudgeableStats": hasKakoJudgeableStats,
    "isKakoReclassificationTarget": isKakoReclassificationTarget,
    "buildKakoEntryForContract": buildKakoEntryForContract,
    "getKakoRedlineBonusRate": getKakoRedlineBonusRate,
    "getKakoDecisionProfile": getKakoDecisionProfile,
    "buildKakoEntryPreviewRates": buildKakoEntryPreviewRates,
    "applyKakoMultiplierToEulaliaBurden": applyKakoMultiplierToEulaliaBurden,
    "applyKakoMultiplierToForces": applyKakoMultiplierToForces,
    "resolveKakoDecisions": resolveKakoDecisions,
    "buildKakoPreDealWindow": buildKakoPreDealWindow,
    "handleKakoSkillActivationEvent": handleKakoSkillActivationEvent,
    "processKakoSignoffFlow": processKakoSignoffFlow,
    "scoreKakoTarget": scoreKakoTarget,
    "getKakoSelfMood": getKakoSelfMood,
    "chooseKakoAiRulingType": chooseKakoAiRulingType,
    "chooseKakoAiDecision": chooseKakoAiDecision,
    "getKakoBoardPressure": getKakoBoardPressure,
    "shouldKakoUseReclassification": shouldKakoUseReclassification,
    "shouldKakoUseGeneralRuling": shouldKakoUseGeneralRuling,
    "resolveKakoPrimaryTarget": resolveKakoPrimaryTarget
  });
})(window);
