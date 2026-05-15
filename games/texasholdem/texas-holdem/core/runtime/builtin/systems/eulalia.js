/**
 * Runtime Module: BuiltinRoleModules / EULALIA runtime system
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
  function getForceRuntime() { return Builtin.getForceRuntime.apply(null, arguments); }
  function emitRuntimeFlow() { return Builtin.emitRuntimeFlow.apply(null, arguments); }
  function queueRuntimeForce() { return Builtin.queueRuntimeForce.apply(null, arguments); }
  function removeRuntimeForces() { return Builtin.removeRuntimeForces.apply(null, arguments); }
  function isRolePlayer() { return Builtin.isRolePlayer.apply(null, arguments); }
  function isRuntimePlayerLive() { return Builtin.isRuntimePlayerLive.apply(null, arguments); }
  function getRolePlayers() { return Builtin.getRolePlayers.apply(null, arguments); }
  function getLiveRolePlayers() { return Builtin.getLiveRolePlayers.apply(null, arguments); }
  function guardConfiguredRole() { return Builtin.guardConfiguredRole.apply(null, arguments); }
  function resolveRuntimePhase() { return Builtin.resolveRuntimePhase.apply(null, arguments); }
  function setManaCurrent() { return Builtin.setManaCurrent.apply(null, arguments); }
  function setPlayerChips() { return Builtin.setPlayerChips.apply(null, arguments); }

  var EULALIA_BURDEN_ICON = Builtin.EULALIA_BURDEN_ICON;
  var EULALIA_BURST_ICON = Builtin.EULALIA_BURST_ICON;
  var EULALIA_NOMINAL_BURDEN_KEY = Builtin.EULALIA_NOMINAL_BURDEN_KEY;
  var EULALIA_BURDEN_LAYERS_KEY = Builtin.EULALIA_BURDEN_LAYERS_KEY;
  var EULALIA_QUEUED_BURDEN_KEY = Builtin.EULALIA_QUEUED_BURDEN_KEY;
  var EULALIA_CARRYOVER_BURDEN_KEY = Builtin.EULALIA_CARRYOVER_BURDEN_KEY;
  var EULALIA_ABSOLUTION_TOTAL_KEY = Builtin.EULALIA_ABSOLUTION_TOTAL_KEY;
  var EULALIA_BURST_COUNTDOWN_KEY = Builtin.EULALIA_BURST_COUNTDOWN_KEY;
  var EULALIA_ABSOLUTION_CONTRACT_KEY = Builtin.EULALIA_ABSOLUTION_CONTRACT_KEY;
  var EULALIA_ABSORB_WINDOW_CONTRACT_KEY = Builtin.EULALIA_ABSORB_WINDOW_CONTRACT_KEY;
  var EULALIA_STREET_BURDEN_KEY = Builtin.EULALIA_STREET_BURDEN_KEY;
  var EULALIA_ABSORB_ACTIVE_KEY = Builtin.EULALIA_ABSORB_ACTIVE_KEY;
  var EULALIA_BURST_PENDING_KEY = Builtin.EULALIA_BURST_PENDING_KEY;
  var EULALIA_SANCTUARY_PHASE_KEY = Builtin.EULALIA_SANCTUARY_PHASE_KEY;

  function getEulaliaPlayers(runtimeApi) {
    return getRolePlayers(runtimeApi, 'EULALIA');
  }

  function isEulaliaCombatActive(runtimeApi, ownerId) {
    var owner = getPlayerById(runtimeApi, ownerId);
    return !!(owner &&
      isRolePlayer(owner, 'EULALIA') &&
      owner.isActive !== false &&
      !owner.folded);
  }

  function isEulaliaAssetKey(key) {
    return key === EULALIA_NOMINAL_BURDEN_KEY ||
      key === EULALIA_BURDEN_LAYERS_KEY ||
      key === EULALIA_QUEUED_BURDEN_KEY ||
      key === EULALIA_CARRYOVER_BURDEN_KEY ||
      key === EULALIA_ABSOLUTION_TOTAL_KEY ||
      key === EULALIA_BURST_COUNTDOWN_KEY ||
      key === EULALIA_ABSOLUTION_CONTRACT_KEY ||
      key === EULALIA_ABSORB_WINDOW_CONTRACT_KEY ||
      key === EULALIA_STREET_BURDEN_KEY ||
      key === EULALIA_ABSORB_ACTIVE_KEY ||
      key === EULALIA_BURST_PENDING_KEY ||
      key === EULALIA_SANCTUARY_PHASE_KEY;
  }

  function getEulaliaAsset(runtimeApi, ownerId, key) {
    var ledger = getLedger(runtimeApi);
    if (!ledger || ownerId == null || !key) return null;
    return ledger.getAsset(ownerId, key);
  }

  function getEulaliaAssetValue(runtimeApi, ownerId, key) {
    var asset = getEulaliaAsset(runtimeApi, ownerId, key);
    return asset ? Math.max(0, Number(asset.value || 0)) : 0;
  }

  function setEulaliaAsset(runtimeApi, ownerId, key, value, meta) {
    var ledger = getLedger(runtimeApi);
    if (!ledger || ownerId == null || !key) return null;
    return ledger.setAsset(ownerId, key, value, Object.assign({
      syncedAt: Date.now()
    }, meta || {}));
  }

  function clearEulaliaAsset(runtimeApi, ownerId, key) {
    var ledger = getLedger(runtimeApi);
    if (!ledger || ownerId == null || !key) return;
    ledger.clearAsset(ownerId, key);
  }

  function clearEulaliaRuntimeMarks(runtimeApi, ownerId) {
    var skillSystem = getSkillSystem(runtimeApi);
    if (!skillSystem || typeof skillSystem.clearStatusMark !== 'function' || ownerId == null) return;
    skillSystem.clearStatusMark(ownerId, 'eulalia_nominal_burden');
    skillSystem.clearStatusMark(ownerId, 'eulalia_burst_countdown');
  }

  function syncEulaliaStatusMarks(runtimeApi, ownerId) {
    var skillSystem = getSkillSystem(runtimeApi);
    if (!skillSystem || ownerId == null) return;
    var owner = getPlayerById(runtimeApi, ownerId);
    if (!owner || !isRolePlayer(owner, 'EULALIA')) return;
    if (!isRuntimePlayerLive(owner)) {
      clearEulaliaRuntimeMarks(runtimeApi, ownerId);
      return;
    }

    var nominalBurden = getEulaliaAssetValue(runtimeApi, ownerId, EULALIA_NOMINAL_BURDEN_KEY);
    var burdenLayers = getEulaliaAssetValue(runtimeApi, ownerId, EULALIA_BURDEN_LAYERS_KEY);
    if (burdenLayers <= 0 && nominalBurden > 0) {
      burdenLayers = Math.max(0, Math.floor(nominalBurden / 10));
    }
    if (burdenLayers > 0) {
      skillSystem.setStatusMark(ownerId, 'eulalia_nominal_burden', {
        sourceName: owner.name,
        icon: EULALIA_BURDEN_ICON,
        title: '名义厄运',
        tone: 'eulalia',
        duration: 'persistent',
        value: nominalBurden,
        count: burdenLayers,
        badgeText: String(burdenLayers),
        detail: '本街名义厄运: ' + nominalBurden + '\n本街层数: ' + burdenLayers
      });
    } else if (typeof skillSystem.clearStatusMark === 'function') {
      skillSystem.clearStatusMark(ownerId, 'eulalia_nominal_burden');
    }

    var burstCountdown = getEulaliaAssetValue(runtimeApi, ownerId, EULALIA_BURST_COUNTDOWN_KEY);
    if (burstCountdown > 0) {
      skillSystem.setStatusMark(ownerId, 'eulalia_burst_countdown', {
        sourceName: owner.name,
        icon: EULALIA_BURST_ICON,
        title: '赦免倒计时',
        tone: 'eulalia',
        duration: 'persistent',
        count: burstCountdown,
        badgeText: String(burstCountdown),
        detail: '距离承灾平分爆出还剩街数: ' + burstCountdown
      });
    } else if (typeof skillSystem.clearStatusMark === 'function') {
      skillSystem.clearStatusMark(ownerId, 'eulalia_burst_countdown');
    }

    if (typeof skillSystem.emit === 'function') {
      skillSystem.emit('eulalia:burden_sync', {
        ownerId: ownerId,
        ownerName: owner.name,
        nominalBurden: nominalBurden,
        burdenLayers: burdenLayers,
        burstCountdown: burstCountdown
      });
    }
  }

  function syncAllEulaliaStatusMarks(runtimeApi) {
    if (!guardConfiguredRole(runtimeApi, 'EULALIA', clearAllEulaliaRuntimeAssets)) return;
    var players = getLiveRolePlayers(runtimeApi, 'EULALIA');
    for (var i = 0; i < players.length; i++) {
      syncEulaliaStatusMarks(runtimeApi, players[i].id);
    }
  }

  function primeEulaliaRuntimeAssets(runtimeApi, ownerId) {
    if (ownerId == null) return;
    setEulaliaAsset(runtimeApi, ownerId, EULALIA_NOMINAL_BURDEN_KEY, getEulaliaAssetValue(runtimeApi, ownerId, EULALIA_NOMINAL_BURDEN_KEY), {
      reason: 'runtime_prime'
    });
    setEulaliaAsset(runtimeApi, ownerId, EULALIA_BURDEN_LAYERS_KEY, getEulaliaAssetValue(runtimeApi, ownerId, EULALIA_BURDEN_LAYERS_KEY), {
      reason: 'runtime_prime'
    });
    setEulaliaAsset(runtimeApi, ownerId, EULALIA_QUEUED_BURDEN_KEY, getEulaliaAssetValue(runtimeApi, ownerId, EULALIA_QUEUED_BURDEN_KEY), {
      reason: 'runtime_prime'
    });
    setEulaliaAsset(runtimeApi, ownerId, EULALIA_CARRYOVER_BURDEN_KEY, getEulaliaAssetValue(runtimeApi, ownerId, EULALIA_CARRYOVER_BURDEN_KEY), {
      reason: 'runtime_prime'
    });
    setEulaliaAsset(runtimeApi, ownerId, EULALIA_ABSOLUTION_TOTAL_KEY, getEulaliaAssetValue(runtimeApi, ownerId, EULALIA_ABSOLUTION_TOTAL_KEY), {
      reason: 'runtime_prime'
    });
    setEulaliaAsset(runtimeApi, ownerId, EULALIA_BURST_COUNTDOWN_KEY, getEulaliaAssetValue(runtimeApi, ownerId, EULALIA_BURST_COUNTDOWN_KEY), {
      reason: 'runtime_prime'
    });
  }

  function clearEulaliaRuntimeAssets(runtimeApi, ownerId) {
    clearEulaliaAsset(runtimeApi, ownerId, EULALIA_NOMINAL_BURDEN_KEY);
    clearEulaliaAsset(runtimeApi, ownerId, EULALIA_BURDEN_LAYERS_KEY);
    clearEulaliaAsset(runtimeApi, ownerId, EULALIA_QUEUED_BURDEN_KEY);
    clearEulaliaAsset(runtimeApi, ownerId, EULALIA_ABSOLUTION_TOTAL_KEY);
    clearEulaliaAsset(runtimeApi, ownerId, EULALIA_BURST_COUNTDOWN_KEY);
    clearEulaliaAsset(runtimeApi, ownerId, EULALIA_ABSOLUTION_CONTRACT_KEY);
    clearEulaliaAsset(runtimeApi, ownerId, EULALIA_ABSORB_WINDOW_CONTRACT_KEY);
    clearEulaliaAsset(runtimeApi, ownerId, EULALIA_STREET_BURDEN_KEY);
    clearEulaliaAsset(runtimeApi, ownerId, EULALIA_ABSORB_ACTIVE_KEY);
    clearEulaliaAsset(runtimeApi, ownerId, EULALIA_BURST_PENDING_KEY);
    clearEulaliaAsset(runtimeApi, ownerId, EULALIA_SANCTUARY_PHASE_KEY);
    clearEulaliaRuntimeMarks(runtimeApi, ownerId);
  }

  function clearAllEulaliaRuntimeAssets(runtimeApi) {
    var players = getEulaliaPlayers(runtimeApi);
    for (var i = 0; i < players.length; i++) {
      clearEulaliaRuntimeAssets(runtimeApi, players[i].id);
      clearEulaliaAsset(runtimeApi, players[i].id, EULALIA_CARRYOVER_BURDEN_KEY);
    }
  }

  function disableEulaliaRuntime(runtimeApi, ownerId, phase, reason) {
    if (ownerId == null) return;
    clearEulaliaRuntimeForces(runtimeApi, ownerId, phase, 'all', { includePersistent: true });
    clearEulaliaRuntimeAssets(runtimeApi, ownerId);
    var skillSystem = getSkillSystem(runtimeApi);
    if (skillSystem && typeof skillSystem._log === 'function') {
      skillSystem._log('EULALIA_RUNTIME_DISABLED', {
        ownerId: ownerId,
        phase: phase,
        reason: reason || 'inactive'
      });
    }
  }

  function getEulaliaContracts(runtimeApi, ownerId, key) {
    var forceRuntime = getForceRuntime(runtimeApi);
    if (forceRuntime && typeof forceRuntime.getScheduledStreetContracts === 'function') {
      return forceRuntime.getScheduledStreetContracts(runtimeApi, ownerId, key);
    }
    var asset = getEulaliaAsset(runtimeApi, ownerId, key);
    return asset && Array.isArray(asset.contracts) ? asset.contracts.slice() : [];
  }

  function setEulaliaContracts(runtimeApi, ownerId, key, contracts, meta) {
    var forceRuntime = getForceRuntime(runtimeApi);
    if (forceRuntime && typeof forceRuntime.setScheduledStreetContracts === 'function') {
      return forceRuntime.setScheduledStreetContracts(runtimeApi, ownerId, key, contracts, meta);
    }
    var ledger = getLedger(runtimeApi);
    if (!ledger || ownerId == null || !key) return null;
    var nextContracts = Array.isArray(contracts) ? contracts.slice() : [];
    if (!nextContracts.length) {
      ledger.clearAsset(ownerId, key);
      return null;
    }
    return ledger.setAsset(ownerId, key, nextContracts.length, Object.assign({
      contracts: nextContracts
    }, meta || {}));
  }

  function getEulaliaPhaseFlag(runtimeApi, ownerId, key) {
    var asset = getEulaliaAsset(runtimeApi, ownerId, key);
    return asset && Number(asset.value || 0) > 0 ? asset : null;
  }

  function setEulaliaPhaseFlag(runtimeApi, ownerId, key, phase, meta) {
    return setEulaliaAsset(runtimeApi, ownerId, key, 1, Object.assign({
      phase: phase
    }, meta || {}));
  }

  function isEulaliaPhaseActive(runtimeApi, ownerId, key, phase) {
    var asset = getEulaliaPhaseFlag(runtimeApi, ownerId, key);
    return !!(asset && String(asset.phase || '') === String(phase || ''));
  }

  function isEulaliaAbsorbWindowOpen(runtimeApi, ownerId, phase) {
    if (!isEulaliaCombatActive(runtimeApi, ownerId)) return false;
    if (isEulaliaPhaseActive(runtimeApi, ownerId, EULALIA_ABSORB_ACTIVE_KEY, phase)) return true;
    if (isEulaliaPhaseActive(runtimeApi, ownerId, EULALIA_BURST_PENDING_KEY, phase)) return false;
    if (String(phase || '') === 'river') return false;
    return getEulaliaAssetValue(runtimeApi, ownerId, EULALIA_BURST_COUNTDOWN_KEY) > 0;
  }

  function countEulaliaContractStages(runtimeApi, ownerId, key, phase) {
    var forceRuntime = getForceRuntime(runtimeApi);
    var contracts = getEulaliaContracts(runtimeApi, ownerId, key);
    var total = 0;
    for (var i = 0; i < contracts.length; i++) {
      var contract = contracts[i];
      if (!contract) continue;
      if (forceRuntime && typeof forceRuntime.countScheduledStreetStages === 'function') {
        total += Math.max(0, Number(forceRuntime.countScheduledStreetStages(contract, phase) || 0));
      } else {
        total += Math.max(0, Number(contract.displayStagesRemaining || 0));
      }
    }
    return total;
  }

  function updateEulaliaNominalBurden(runtimeApi, ownerId, total, phase) {
    var burden = Math.max(0, Number(total || 0));
    var layers = Math.max(0, Math.floor(burden / 10));
    setEulaliaAsset(runtimeApi, ownerId, EULALIA_NOMINAL_BURDEN_KEY, burden, {
      reason: 'nominal_burden',
      phase: phase
    });
    setEulaliaAsset(runtimeApi, ownerId, EULALIA_BURDEN_LAYERS_KEY, layers, {
      reason: 'nominal_burden',
      phase: phase
    });
  }

  function queueEulaliaNominalBurden(runtimeApi, ownerId, total, phase, reason) {
    setEulaliaAsset(runtimeApi, ownerId, EULALIA_QUEUED_BURDEN_KEY, Math.max(0, Number(total || 0)), {
      reason: reason || 'queued_nominal_burden',
      phase: phase
    });
  }

  function promoteQueuedEulaliaNominalBurden(runtimeApi, ownerId, phase) {
    var queued = getEulaliaAssetValue(runtimeApi, ownerId, EULALIA_QUEUED_BURDEN_KEY);
    updateEulaliaNominalBurden(runtimeApi, ownerId, queued, phase);
    clearEulaliaAsset(runtimeApi, ownerId, EULALIA_QUEUED_BURDEN_KEY);
    return queued;
  }

  function stashEulaliaCarryoverBurden(runtimeApi, ownerId, phase) {
    var queued = getEulaliaAssetValue(runtimeApi, ownerId, EULALIA_QUEUED_BURDEN_KEY);
    if (queued <= 0) return 0;
    setEulaliaAsset(runtimeApi, ownerId, EULALIA_CARRYOVER_BURDEN_KEY, queued, {
      reason: 'eulalia_carryover_stash',
      phase: phase
    });
    clearEulaliaAsset(runtimeApi, ownerId, EULALIA_QUEUED_BURDEN_KEY);
    return queued;
  }

  function restoreEulaliaCarryoverBurden(runtimeApi, ownerId, phase) {
    var carryover = getEulaliaAssetValue(runtimeApi, ownerId, EULALIA_CARRYOVER_BURDEN_KEY);
    if (carryover <= 0) return 0;
    var queued = getEulaliaAssetValue(runtimeApi, ownerId, EULALIA_QUEUED_BURDEN_KEY);
    setEulaliaAsset(runtimeApi, ownerId, EULALIA_QUEUED_BURDEN_KEY, Math.max(queued, carryover), {
      reason: 'eulalia_carryover_restore',
      phase: phase
    });
    clearEulaliaAsset(runtimeApi, ownerId, EULALIA_CARRYOVER_BURDEN_KEY);
    return carryover;
  }

  function syncEulaliaStartOfStreetNominalBurden(runtimeApi, ownerId, phase) {
    var currentNominal = getEulaliaAssetValue(runtimeApi, ownerId, EULALIA_NOMINAL_BURDEN_KEY);
    var streetBurden = getEulaliaAssetValue(runtimeApi, ownerId, EULALIA_STREET_BURDEN_KEY);
    if (streetBurden <= currentNominal) return currentNominal;
    updateEulaliaNominalBurden(runtimeApi, ownerId, streetBurden, phase);
    return streetBurden;
  }

  function getEulaliaProjectedBurden(runtimeApi, ownerId) {
    return Math.max(
      getEulaliaAssetValue(runtimeApi, ownerId, EULALIA_NOMINAL_BURDEN_KEY),
      getEulaliaAssetValue(runtimeApi, ownerId, EULALIA_QUEUED_BURDEN_KEY),
      getEulaliaAssetValue(runtimeApi, ownerId, EULALIA_STREET_BURDEN_KEY)
    );
  }

  function getEulaliaFortuneMultiplier(runtimeApi, ownerId) {
    var martyrFrame = getTraitEffect(runtimeApi, ownerId, 'eulalia_martyr_frame');
    if (!martyrFrame) return 1;
    var burdenPerLayer = Math.max(1, Number(martyrFrame.burdenPerLayer || 10));
    var nominalBurden = getEulaliaAssetValue(runtimeApi, ownerId, EULALIA_NOMINAL_BURDEN_KEY);
    var storedLayers = getEulaliaAssetValue(runtimeApi, ownerId, EULALIA_BURDEN_LAYERS_KEY);
    var layers = storedLayers > 0 ? storedLayers : Math.floor(nominalBurden / burdenPerLayer);
    return 1 + Math.max(0, layers) * Math.max(0, Number(martyrFrame.fortuneBonusPerLayer || 0));
  }

  function stampEulaliaFortuneSnapshot(force, multiplier) {
    if (!force) return force;
    var safeMultiplier = Math.max(0, Number(multiplier || 1));
    force.power = Math.round(Math.max(0, Number(force.power || 0)) * safeMultiplier * 10) / 10;
    force.effectivePower = force.power;
    force._eulaliaMartyrSnapshot = true;
    force._eulaliaMartyrMultiplier = safeMultiplier;
    return force;
  }

  function applyEulaliaFortuneSnapshotToPendingForce(runtimeApi, payload) {
    if (!payload || !payload.skill) return;
    var skill = payload.skill;
    if (skill.ownerId == null || !isRolePlayer(getPlayerById(runtimeApi, skill.ownerId), 'EULALIA')) return;
    if (skill.effect !== 'fortune' && skill.effect !== 'royal_decree') return;

    var skillSystem = getSkillSystem(runtimeApi);
    if (!skillSystem || !Array.isArray(skillSystem.pendingForces)) return;
    var multiplier = getEulaliaFortuneMultiplier(runtimeApi, skill.ownerId);
    if (multiplier === 1) return;

    for (var i = skillSystem.pendingForces.length - 1; i >= 0; i--) {
      var force = skillSystem.pendingForces[i];
      if (!force) continue;
      if (force.ownerId !== skill.ownerId) continue;
      if (force.type !== 'fortune') continue;
      if (force.skillKey !== skill.skillKey) continue;
      if (force._eulaliaMartyrSnapshot) continue;
      stampEulaliaFortuneSnapshot(force, multiplier);
      emitRuntimeFlow(runtimeApi, 'force:mutated', {
        before: Object.assign({}, force, {
          power: Math.round(force.power / multiplier * 10) / 10,
          effectivePower: Math.round(force.power / multiplier * 10) / 10,
          _eulaliaMartyrSnapshot: false
        }),
        after: Object.assign({}, force),
        meta: {
          reason: 'eulalia_martyr_snapshot',
          ownerId: skill.ownerId,
          skillKey: skill.skillKey,
          multiplier: multiplier
        }
      });
      break;
    }
  }

  function applyEulaliaSanctuaryCore(runtimeApi, ownerId, phase) {
    if (!isEulaliaCombatActive(runtimeApi, ownerId)) return 0;
    var owner = getPlayerById(runtimeApi, ownerId);
    var core = getTraitEffect(runtimeApi, ownerId, 'eulalia_sanctuary_core');
    var mana = getPlayerManaPool(runtimeApi, ownerId);
    if (!owner || !core || !mana) return 0;

    var phaseAsset = getEulaliaAsset(runtimeApi, ownerId, EULALIA_SANCTUARY_PHASE_KEY);
    if (phaseAsset && String(phaseAsset.phase || '') === String(phase || '')) {
      return 0;
    }

    var burdenPerLayer = Math.max(1, Number(core.burdenPerLayer || 10));
    var nominalBurden = getEulaliaAssetValue(runtimeApi, ownerId, EULALIA_NOMINAL_BURDEN_KEY);
    var storedLayers = getEulaliaAssetValue(runtimeApi, ownerId, EULALIA_BURDEN_LAYERS_KEY);
    var layers = storedLayers > 0 ? storedLayers : Math.floor(nominalBurden / burdenPerLayer);
    var manaGain = Math.max(0, layers) * Math.max(0, Number(core.manaPerLayer || 0));

    setEulaliaAsset(runtimeApi, ownerId, EULALIA_SANCTUARY_PHASE_KEY, Math.max(0, layers), {
      reason: 'sanctuary_core',
      phase: phase,
      manaGain: manaGain
    });

    if (manaGain > 0) {
      setManaCurrent(runtimeApi, ownerId, mana.current + manaGain, 'eulalia_sanctuary_core');
    }

    var skillSystem = getSkillSystem(runtimeApi);
    if (skillSystem && typeof skillSystem.emit === 'function') {
      if (typeof skillSystem._log === 'function') {
        skillSystem._log('EULALIA_SANCTUARY_CORE', {
          ownerId: ownerId,
          ownerName: owner.name,
          phase: phase,
          nominalBurden: nominalBurden,
          layers: layers,
          manaGain: manaGain,
          manaAfter: getPlayerManaPool(runtimeApi, ownerId) ? getPlayerManaPool(runtimeApi, ownerId).current : null
        });
      }
      skillSystem.emit('eulalia:sanctuary_core', {
        ownerId: ownerId,
        ownerName: owner.name,
        phase: phase,
        nominalBurden: nominalBurden,
        layers: layers,
        manaGain: manaGain
      });
    }

    return manaGain;
  }

  function recordEulaliaBurden(runtimeApi, ownerId, phase, power, options) {
    if (!isEulaliaCombatActive(runtimeApi, ownerId)) {
      disableEulaliaRuntime(runtimeApi, ownerId, phase, 'inactive_record');
      return {
        streetTotal: 0,
        absolutionTotal: 0,
        gainedPower: 0
      };
    }
    var gainedPower = Math.max(0, Number(power || 0));
    var nextStreetTotal = getEulaliaAssetValue(runtimeApi, ownerId, EULALIA_STREET_BURDEN_KEY);
    var nextRunningTotal = getEulaliaAssetValue(runtimeApi, ownerId, EULALIA_ABSOLUTION_TOTAL_KEY);
    var meta = options || {};
    if (gainedPower <= 0) {
      return {
        streetTotal: nextStreetTotal,
        absolutionTotal: nextRunningTotal,
        gainedPower: 0
      };
    }
    nextStreetTotal += gainedPower;
    setEulaliaAsset(runtimeApi, ownerId, EULALIA_STREET_BURDEN_KEY, nextStreetTotal, {
      reason: meta.reason || 'eulalia_burden_record',
      phase: phase
    });
    if (meta.includeAbsolutionTotal) {
      nextRunningTotal += gainedPower;
      setEulaliaAsset(runtimeApi, ownerId, EULALIA_ABSOLUTION_TOTAL_KEY, nextRunningTotal, {
        reason: meta.reason || 'eulalia_burden_record',
        phase: phase
      });
    }
    return {
      streetTotal: nextStreetTotal,
      absolutionTotal: nextRunningTotal,
      gainedPower: gainedPower
    };
  }

  function isAbsorbableEulaliaCurse(runtimeApi, force) {
    if (!force || force.type !== 'curse') return false;
    if (force._eulaliaRuntimeForce) return false;
    return true;
  }

  function absorbEulaliaPendingCurses(runtimeApi, ownerId, phase, reason) {
    if (!isEulaliaCombatActive(runtimeApi, ownerId)) {
      disableEulaliaRuntime(runtimeApi, ownerId, phase, 'inactive_absorb_pending');
      return {
        removedCount: 0,
        absorbedPower: 0
      };
    }
    var removed = removeRuntimeForces(runtimeApi, function(force) {
      return isAbsorbableEulaliaCurse(runtimeApi, force);
    }, {
      reason: reason || 'eulalia_absorb',
      ownerId: ownerId,
      phase: phase
    });
    var absorbedPower = 0;
    var vvBubblePower = 0;
    var vvBubbleCount = 0;
    for (var i = 0; i < removed.length; i++) {
      var removedForce = removed[i];
      var removedPower = Math.max(0, Number(removedForce && removedForce.power || 0));
      absorbedPower += removedPower;
      if (removedForce && removedForce.source === 'vv_bubble') {
        vvBubblePower += removedPower;
        vvBubbleCount += 1;
      }
    }
    var burdenState = recordEulaliaBurden(runtimeApi, ownerId, phase, absorbedPower, {
      reason: reason || 'eulalia_absorb',
      includeAbsolutionTotal: true
    });
    queueEulaliaStreetBurdenForce(runtimeApi, ownerId, phase);
    syncEulaliaStatusMarks(runtimeApi, ownerId);
    var skillSystem = getSkillSystem(runtimeApi);
    var owner = getPlayerById(runtimeApi, ownerId);
    if (skillSystem && typeof skillSystem.emit === 'function' && absorbedPower > 0) {
      skillSystem.emit('eulalia:burden_absorbed', {
        ownerId: ownerId,
        ownerName: owner && owner.name ? owner.name : 'EULALIA',
        phase: phase || null,
        reason: reason || 'eulalia_absorb',
        removedCount: removed.length,
        absorbedPower: absorbedPower,
        vvBubblePower: vvBubblePower,
        vvBubbleCount: vvBubbleCount,
        streetTotal: burdenState && burdenState.streetTotal != null ? burdenState.streetTotal : 0,
        absolutionTotal: burdenState && burdenState.absolutionTotal != null ? burdenState.absolutionTotal : 0
      });
    }
    return {
      removedCount: removed.length,
      absorbedPower: absorbedPower,
      vvBubblePower: vvBubblePower,
      vvBubbleCount: vvBubbleCount
    };
  }

  function absorbEulaliaBenedictionCurses(runtimeApi, ownerId, targetId, phase, includeAbsolutionTotal) {
    if (!isEulaliaCombatActive(runtimeApi, ownerId)) {
      disableEulaliaRuntime(runtimeApi, ownerId, phase, 'inactive_absorb_benediction');
      return {
        removedCount: 0,
        absorbedPower: 0
      };
    }
    var removed = removeRuntimeForces(runtimeApi, function(force) {
      if (!force || force.type !== 'curse') return false;
      if (force._eulaliaRuntimeForce) return false;
      return force.ownerId === targetId || force.targetId === targetId;
    }, {
      reason: 'eulalia_benediction_absorb',
      ownerId: ownerId,
      targetId: targetId,
      phase: phase
    });
    var absorbedPower = 0;
    for (var i = 0; i < removed.length; i++) {
      absorbedPower += Math.max(0, Number(removed[i] && removed[i].power || 0));
    }
    recordEulaliaBurden(runtimeApi, ownerId, phase, absorbedPower, {
      reason: 'eulalia_benediction_absorb',
      includeAbsolutionTotal: includeAbsolutionTotal === true
    });
    return {
      removedCount: removed.length,
      absorbedPower: absorbedPower
    };
  }

  function queueEulaliaStreetBurdenForce(runtimeApi, ownerId, phase) {
    if (!isEulaliaCombatActive(runtimeApi, ownerId)) return 0;
    var owner = getPlayerById(runtimeApi, ownerId);
    if (!owner) return 0;
    var burden = getEulaliaProjectedBurden(runtimeApi, ownerId);
    var power = Math.max(0, Math.ceil(burden * 0.5));
    var skillSystem = getSkillSystem(runtimeApi);
    if (skillSystem && Array.isArray(skillSystem.pendingForces)) {
      for (var i = 0; i < skillSystem.pendingForces.length; i++) {
        var existing = skillSystem.pendingForces[i];
        if (!existing) continue;
        if (existing.ownerId !== ownerId) continue;
        if (existing._eulaliaRuntimeForce !== 'street_burden') continue;
        if (String(existing._eulaliaPhase || '') !== String(phase || '')) continue;
        return Math.max(0, Number(existing.power || 0));
      }
    }
    removeRuntimeForces(runtimeApi, function(force) {
      return !!(force &&
        force._eulaliaRuntimeForce === 'street_burden' &&
        force.ownerId === ownerId &&
        String(force._eulaliaPhase || '') === String(phase || ''));
    }, {
      reason: 'eulalia_street_burden_replace',
      ownerId: ownerId,
      phase: phase
    });
    if (power <= 0) return 0;
    queueRuntimeForce(runtimeApi, {
      ownerId: ownerId,
      ownerName: owner.name,
      targetId: ownerId,
      targetName: owner.name,
      type: 'curse',
      kind: 'curse',
      power: power,
      effectivePower: power,
      level: 0,
      system: 'moirai',
      activation: 'active',
      source: 'eulalia_absolution_burden',
      skillKey: 'absolution',
      _eulaliaRuntimeForce: 'street_burden',
      _eulaliaPhase: phase,
      _persistAfterOwnerFold: true
    }, {
      reason: 'eulalia_street_burden',
      ownerId: ownerId,
      phase: phase
    });
    return power;
  }

  function triggerEulaliaRealtimeAbsorb(runtimeApi, phase, reason) {
    var players = getEulaliaPlayers(runtimeApi);
    for (var i = 0; i < players.length; i++) {
      var ownerId = players[i] && players[i].id;
      if (ownerId == null) continue;
      if (!isEulaliaCombatActive(runtimeApi, ownerId)) {
        disableEulaliaRuntime(runtimeApi, ownerId, phase, 'inactive_realtime_absorb');
        continue;
      }
      if (!isEulaliaPhaseActive(runtimeApi, ownerId, EULALIA_ABSORB_ACTIVE_KEY, phase)) continue;
      absorbEulaliaPendingCurses(runtimeApi, ownerId, phase, reason || 'eulalia_absorb_runtime');
    }
  }

  function shouldCleanupEulaliaRuntimeForce(force, includePersistent) {
    if (!force || !force._eulaliaRuntimeForce) return false;
    if (includePersistent === true) return true;
    return force._eulaliaRuntimeForce === 'street_burden' || force._eulaliaRuntimeForce === 'burst';
  }

  function clearEulaliaRuntimeForces(runtimeApi, ownerId, phase, mode, options) {
    var normalizedMode = String(mode || 'all');
    var currentPhase = String(phase || '');
    var includePersistent = !!(options && options.includePersistent);
    var removed = removeRuntimeForces(runtimeApi, function(force) {
      if (!force || force.ownerId !== ownerId || !shouldCleanupEulaliaRuntimeForce(force, includePersistent)) return false;
      var forcePhase = String(force._eulaliaPhase || '');
      if (normalizedMode === 'stale') {
        return forcePhase !== currentPhase;
      }
      if (normalizedMode === 'current') {
        return forcePhase === currentPhase;
      }
      return true;
    }, {
      reason: 'eulalia_runtime_force_cleanup',
      ownerId: ownerId,
      phase: phase,
      mode: normalizedMode,
      includePersistent: includePersistent
    });
    return Array.isArray(removed) ? removed.length : 0;
  }

  function splitEulaliaBurstPower(total, targetCount) {
    var safeTotal = Math.max(0, Number(total || 0));
    var count = Math.max(0, Number(targetCount || 0));
    if (safeTotal <= 0 || count <= 0) return [];
    var base = Math.floor(safeTotal / count);
    var remainder = safeTotal % count;
    var out = [];
    for (var i = 0; i < count; i++) {
      out.push(base + (i < remainder ? 1 : 0));
    }
    return out;
  }

  function queueEulaliaBurstForces(runtimeApi, ownerId, phase) {
    if (!isEulaliaCombatActive(runtimeApi, ownerId)) {
      disableEulaliaRuntime(runtimeApi, ownerId, phase, 'inactive_burst_queue');
      return 0;
    }
    var owner = getPlayerById(runtimeApi, ownerId);
    if (!owner) return 0;
    var skillSystem = getSkillSystem(runtimeApi);
    if (skillSystem && Array.isArray(skillSystem.pendingForces)) {
      for (var pi = 0; pi < skillSystem.pendingForces.length; pi++) {
        var pendingForce = skillSystem.pendingForces[pi];
        if (!pendingForce) continue;
        if (pendingForce.ownerId !== ownerId) continue;
        if (pendingForce._eulaliaRuntimeForce !== 'burst') continue;
        if (String(pendingForce._eulaliaPhase || '') !== String(phase || '')) continue;
        return Math.max(0, Number(pendingForce.power || 0));
      }
    }
    var targets = getActiveOpponents(runtimeApi, ownerId);
    var burstTotal = Math.max(0, Math.ceil(getEulaliaAssetValue(runtimeApi, ownerId, EULALIA_ABSOLUTION_TOTAL_KEY) * 0.5));
    if (!targets.length || burstTotal <= 0) return 0;

    removeRuntimeForces(runtimeApi, function(force) {
      return !!(force &&
        force._eulaliaRuntimeForce === 'burst' &&
        force.ownerId === ownerId &&
        String(force._eulaliaPhase || '') === String(phase || ''));
    }, {
      reason: 'eulalia_burst_replace',
      ownerId: ownerId,
      phase: phase
    });

    var shares = splitEulaliaBurstPower(burstTotal, targets.length);
    var queuedTotal = 0;
    for (var i = 0; i < targets.length; i++) {
      var target = targets[i];
      var share = Math.max(0, Number(shares[i] || 0));
      if (!target || share <= 0) continue;
      queueRuntimeForce(runtimeApi, {
        ownerId: ownerId,
        ownerName: owner.name,
        targetId: target.id,
        targetName: target.name,
        type: 'curse',
        kind: 'curse',
        power: share,
        effectivePower: share,
        level: 0,
        system: 'moirai',
        activation: 'active',
        source: 'eulalia_absolution_burst',
        skillKey: 'absolution',
        _eulaliaRuntimeForce: 'burst',
        _eulaliaPhase: phase,
        _persistAfterOwnerFold: true
      }, {
        reason: 'eulalia_burst',
        ownerId: ownerId,
        targetId: target.id,
        phase: phase
      });
      queuedTotal += share;
    }
    if (queuedTotal > 0 && skillSystem && typeof skillSystem.emit === 'function') {
      var targetShares = [];
      for (var ti = 0; ti < targets.length; ti++) {
        if (!targets[ti]) continue;
        targetShares.push({
          targetId: targets[ti].id,
          targetName: targets[ti].name,
          share: Math.max(0, Number(shares[ti] || 0))
        });
      }
      if (typeof skillSystem._log === 'function') {
        skillSystem._log('EULALIA_BURST_TRIGGERED', {
          ownerId: ownerId,
          ownerName: owner.name,
          phase: phase,
          burstTotal: burstTotal,
          queuedTotal: queuedTotal,
          targetShares: targetShares
        });
      }
      skillSystem.emit('eulalia:burst_triggered', {
        ownerId: ownerId,
        ownerName: owner.name,
        phase: phase,
        burstTotal: burstTotal,
        queuedTotal: queuedTotal,
        targetShares: targetShares
      });
      skillSystem.emit('eulalia:burst_queued', {
        ownerId: ownerId,
        ownerName: owner.name,
        phase: phase,
        burstTotal: burstTotal,
        queuedTotal: queuedTotal,
        targetShares: targetShares
      });
    }
    if (queuedTotal > 0) {
      setEulaliaAsset(runtimeApi, ownerId, EULALIA_NOMINAL_BURDEN_KEY, 0, {
        reason: 'eulalia_burst_triggered',
        phase: phase
      });
      setEulaliaAsset(runtimeApi, ownerId, EULALIA_BURDEN_LAYERS_KEY, 0, {
        reason: 'eulalia_burst_triggered',
        phase: phase
      });
      setEulaliaAsset(runtimeApi, ownerId, EULALIA_BURST_COUNTDOWN_KEY, 0, {
        reason: 'eulalia_burst_triggered',
        phase: phase
      });
      clearEulaliaAsset(runtimeApi, ownerId, EULALIA_QUEUED_BURDEN_KEY);
      syncEulaliaStatusMarks(runtimeApi, ownerId);
    }
    return queuedTotal;
  }

  function activateEulaliaDueContracts(runtimeApi, ownerId, phase) {
    if (!isEulaliaCombatActive(runtimeApi, ownerId)) {
      disableEulaliaRuntime(runtimeApi, ownerId, phase, 'inactive_activate_contracts');
      return;
    }
    var forceRuntime = getForceRuntime(runtimeApi);
    if (!forceRuntime || ownerId == null) return;
    var absorbContracts = typeof forceRuntime.collectDueStreetContracts === 'function'
      ? forceRuntime.collectDueStreetContracts(runtimeApi, ownerId, EULALIA_ABSORB_WINDOW_CONTRACT_KEY, phase)
      : [];
    if (absorbContracts.length) {
      setEulaliaPhaseFlag(runtimeApi, ownerId, EULALIA_ABSORB_ACTIVE_KEY, phase, {
        contractIds: absorbContracts.map(function(contract) { return contract.id; })
      });
    }
    var burstContracts = typeof forceRuntime.collectDueStreetContracts === 'function'
      ? forceRuntime.collectDueStreetContracts(runtimeApi, ownerId, EULALIA_ABSOLUTION_CONTRACT_KEY, phase)
      : [];
    if (burstContracts.length) {
      setEulaliaPhaseFlag(runtimeApi, ownerId, EULALIA_BURST_PENDING_KEY, phase, {
        contractIds: burstContracts.map(function(contract) { return contract.id; })
      });
    }
  }

  function armEulaliaRiverBurst(runtimeApi, ownerId, phase) {
    if (!isEulaliaCombatActive(runtimeApi, ownerId)) {
      disableEulaliaRuntime(runtimeApi, ownerId, phase, 'inactive_arm_burst');
      return false;
    }
    if (String(phase || '') !== 'river') return false;
    if (ownerId == null) return false;
    if (isEulaliaPhaseActive(runtimeApi, ownerId, EULALIA_BURST_PENDING_KEY, phase)) return true;
    var total = getEulaliaAssetValue(runtimeApi, ownerId, EULALIA_ABSOLUTION_TOTAL_KEY);
    var countdown = getEulaliaAssetValue(runtimeApi, ownerId, EULALIA_BURST_COUNTDOWN_KEY);
    if (total <= 0) return false;
    if (countdown > 1) return false;
    setEulaliaPhaseFlag(runtimeApi, ownerId, EULALIA_BURST_PENDING_KEY, phase, {
      reason: 'eulalia_river_burst_arm'
    });
    return true;
  }

  function normalizeEulaliaSkillPhaseContract(contract) {
    return contract;
  }

  function handleEulaliaAbsolution(payload, runtimeApi) {
    var skill = payload && payload.skill;
    var ownerId = skill && skill.ownerId;
    if (ownerId == null) return;
    var phase = resolveRuntimePhase(runtimeApi, payload);
    if (!isEulaliaCombatActive(runtimeApi, ownerId)) {
      disableEulaliaRuntime(runtimeApi, ownerId, phase, 'inactive_absolution_cast');
      return;
    }
    var owner = getPlayerById(runtimeApi, ownerId);
    if (!owner) return;
    var forceRuntime = getForceRuntime(runtimeApi);
    if (!forceRuntime || typeof forceRuntime.createStreetEffectContract !== 'function') return;

    setEulaliaContracts(runtimeApi, ownerId, EULALIA_ABSORB_WINDOW_CONTRACT_KEY, [
      normalizeEulaliaSkillPhaseContract(forceRuntime.createStreetEffectContract(phase, {
        delayStreets: 0,
        futureStageCount: 2,
        includeCurrentStreet: false,
        crossHand: false,
        payload: {
          kind: 'eulalia_absorb_window'
        }
      }))
    ], {
      source: 'absolution'
    });

    setEulaliaContracts(runtimeApi, ownerId, EULALIA_ABSOLUTION_CONTRACT_KEY, [
      normalizeEulaliaSkillPhaseContract(forceRuntime.createStreetEffectContract(phase, {
        delayStreets: 2,
        futureStageCount: 1,
        includeCurrentStreet: false,
        crossHand: false,
        payload: {
          kind: 'eulalia_burst'
        }
      }))
    ], {
      source: 'absolution'
    });

    setEulaliaAsset(runtimeApi, ownerId, EULALIA_ABSOLUTION_TOTAL_KEY, 0, {
      reason: 'absolution_cast',
      phase: phase
    });
    setEulaliaAsset(runtimeApi, ownerId, EULALIA_STREET_BURDEN_KEY, 0, {
      reason: 'absolution_cast',
      phase: phase
    });
    setEulaliaPhaseFlag(runtimeApi, ownerId, EULALIA_ABSORB_ACTIVE_KEY, phase, {
      reason: 'absolution_cast'
    });
    setEulaliaAsset(runtimeApi, ownerId, EULALIA_BURST_COUNTDOWN_KEY, 3, {
      reason: 'absolution_cast',
      phase: phase
    });

    absorbEulaliaPendingCurses(runtimeApi, ownerId, phase, 'eulalia_absolution_cast');

    var skillSystem = getSkillSystem(runtimeApi);
    if (skillSystem && typeof skillSystem.emit === 'function') {
      if (typeof skillSystem._log === 'function') {
        skillSystem._log('EULALIA_ABSOLUTION_CAST', {
          ownerId: ownerId,
          ownerName: owner.name,
          phase: phase,
          currentStreetBurden: getEulaliaAssetValue(runtimeApi, ownerId, EULALIA_STREET_BURDEN_KEY),
          totalBurden: getEulaliaAssetValue(runtimeApi, ownerId, EULALIA_ABSOLUTION_TOTAL_KEY)
        });
      }
      skillSystem.emit('eulalia:absolution_cast', {
        ownerId: ownerId,
        ownerName: owner.name,
        phase: phase,
        currentStreetBurden: getEulaliaAssetValue(runtimeApi, ownerId, EULALIA_STREET_BURDEN_KEY),
        totalBurden: getEulaliaAssetValue(runtimeApi, ownerId, EULALIA_ABSOLUTION_TOTAL_KEY)
      });
    }
  }

  function resolveEulaliaBenedictionTargetId(payload) {
    if (!payload) return null;
    if (payload.targetId != null) return payload.targetId;
    if (payload.options && payload.options.targetId != null) return payload.options.targetId;
    return null;
  }

  function queueEulaliaBenedictionFortunes(runtimeApi, skill, ownerId, targetId, totalPower, phase) {
    var owner = getPlayerById(runtimeApi, ownerId);
    var target = getPlayerById(runtimeApi, targetId);
    if (!owner || !target) {
      return { selfPower: 0, targetPower: 0 };
    }
    var multiplier = getEulaliaFortuneMultiplier(runtimeApi, ownerId);
    var selfPower = Math.max(0, Math.round(Math.max(0, Number(totalPower || 0)) * multiplier * 10) / 10);
    var targetPower = selfPower > 0 ? Math.max(1, Math.round(selfPower * 0.25 * 10) / 10) : 0;

    if (selfPower > 0) {
      queueRuntimeForce(runtimeApi, {
        ownerId: ownerId,
        ownerName: owner.name,
        type: 'fortune',
        kind: 'fortune',
        power: selfPower,
        effectivePower: selfPower,
        level: skill && skill.level != null ? skill.level : 2,
        system: 'moirai',
        activation: 'active',
        source: 'eulalia_benediction_self',
        skillKey: 'benediction',
        _eulaliaRuntimeForce: 'benediction_self',
        _eulaliaPhase: phase,
        _eulaliaMartyrSnapshot: true,
        _eulaliaMartyrMultiplier: multiplier
      }, {
        reason: 'eulalia_benediction_self',
        ownerId: ownerId,
        targetId: targetId,
        phase: phase
      });
    }

    if (targetPower > 0) {
      queueRuntimeForce(runtimeApi, {
        ownerId: ownerId,
        ownerName: owner.name,
        targetId: targetId,
        targetName: target.name,
        type: 'fortune',
        kind: 'fortune',
        power: targetPower,
        effectivePower: targetPower,
        level: skill && skill.level != null ? skill.level : 2,
        system: 'moirai',
        activation: 'active',
        source: 'eulalia_benediction_target',
        skillKey: 'benediction',
        _eulaliaRuntimeForce: 'benediction_target',
        _eulaliaPhase: phase,
        _eulaliaMartyrSnapshot: true,
        _eulaliaMartyrMultiplier: multiplier
      }, {
        reason: 'eulalia_benediction_target',
        ownerId: ownerId,
        targetId: targetId,
        phase: phase
      });
    }

    return {
      selfPower: selfPower,
      targetPower: targetPower
    };
  }

  function handleEulaliaBenediction(payload, runtimeApi) {
    var skill = payload && payload.skill;
    var ownerId = skill && skill.ownerId;
    var targetId = resolveEulaliaBenedictionTargetId(payload);
    if (ownerId == null || targetId == null || targetId === ownerId) return;
    var phase = resolveRuntimePhase(runtimeApi, payload);
    if (!isEulaliaCombatActive(runtimeApi, ownerId)) {
      disableEulaliaRuntime(runtimeApi, ownerId, phase, 'inactive_benediction_cast');
      return;
    }

    var owner = getPlayerById(runtimeApi, ownerId);
    var target = getPlayerById(runtimeApi, targetId);
    if (!owner || !target || target.folded || target.isActive === false) return;
    var multiplier = getEulaliaFortuneMultiplier(runtimeApi, ownerId);
    var basePower = Math.max(0, Number(skill.power || 0));
    var scaledPower = Math.max(0, Math.round(basePower * multiplier));
    var absorbActive = isEulaliaAbsorbWindowOpen(runtimeApi, ownerId, phase);
    var absorbed = absorbEulaliaBenedictionCurses(runtimeApi, ownerId, targetId, phase, absorbActive);
    var fortuneGain = queueEulaliaBenedictionFortunes(runtimeApi, skill, ownerId, targetId, basePower, phase);
    var skillSystem = getSkillSystem(runtimeApi);

    if (skillSystem && typeof skillSystem.emit === 'function') {
      if (typeof skillSystem._log === 'function') {
        skillSystem._log('EULALIA_BENEDICTION_CAST', {
          ownerId: ownerId,
          ownerName: owner.name,
          targetId: targetId,
          targetName: target.name,
          phase: phase,
          multiplier: multiplier,
          basePower: basePower,
          scaledPower: scaledPower,
          selfFortunePower: fortuneGain.selfPower,
          targetFortunePower: fortuneGain.targetPower,
          absorbedCount: absorbed.removedCount,
          absorbedPower: absorbed.absorbedPower,
          absorbActive: absorbActive
        });
      }
      skillSystem.emit('eulalia:benediction_cast', {
        ownerId: ownerId,
        ownerName: owner.name,
        targetId: targetId,
        targetName: target.name,
        phase: phase,
        basePower: basePower,
        multiplier: multiplier,
        scaledPower: scaledPower,
        selfFortunePower: fortuneGain.selfPower,
        targetFortunePower: fortuneGain.targetPower,
        absorbedCount: absorbed.removedCount,
        absorbedPower: absorbed.absorbedPower,
        absorbActive: absorbActive
      });
    }
  }

  function handleEulaliaSkillActivationEvent(payload, runtimeApi) {
    if (!payload || !payload.skill) return;
    var phase = resolveRuntimePhase(runtimeApi, payload);

    if (payload.type === 'curse' || payload.skill.effect === 'curse') {
      var players = getEulaliaPlayers(runtimeApi);
      for (var i = 0; i < players.length; i++) {
        var ownerId = players[i] && players[i].id;
        if (ownerId == null) continue;
        if (!isEulaliaCombatActive(runtimeApi, ownerId)) {
          disableEulaliaRuntime(runtimeApi, ownerId, phase, 'inactive_skill_event');
          continue;
        }
        if (!isEulaliaAbsorbWindowOpen(runtimeApi, ownerId, phase)) continue;
        absorbEulaliaPendingCurses(runtimeApi, ownerId, phase, 'eulalia_absorb_realtime');
      }
    }

    if (payload.type === 'absolution' || payload.skill.effect === 'absolution') {
      handleEulaliaAbsolution(payload, runtimeApi);
      return;
    }
    if (payload.type === 'benediction' || payload.skill.effect === 'benediction') {
      handleEulaliaBenediction(payload, runtimeApi);
      return;
    }
    applyEulaliaFortuneSnapshotToPendingForce(runtimeApi, payload);
  }

  function processEulaliaStreet(runtimeApi, ownerId, phase) {
    if (!isEulaliaCombatActive(runtimeApi, ownerId)) {
      disableEulaliaRuntime(runtimeApi, ownerId, phase, 'inactive_process_street');
      return;
    }
    if (!isEulaliaAbsorbWindowOpen(runtimeApi, ownerId, phase) &&
        !isEulaliaPhaseActive(runtimeApi, ownerId, EULALIA_BURST_PENDING_KEY, phase)) {
      return;
    }
    if (isEulaliaAbsorbWindowOpen(runtimeApi, ownerId, phase)) {
      absorbEulaliaPendingCurses(runtimeApi, ownerId, phase, 'eulalia_absorb_tick');
    }
    if (isEulaliaPhaseActive(runtimeApi, ownerId, EULALIA_BURST_PENDING_KEY, phase)) {
      queueEulaliaBurstForces(runtimeApi, ownerId, phase);
    }
  }

  function recordEulaliaStreetSummary(runtimeApi, payload, ownerId) {
    var summary = payload && payload.summary ? payload.summary : null;
    var recipients = summary && summary.recipients ? summary.recipients : null;
    var phase = payload && payload.phase != null ? payload.phase : null;
    if (!recipients || ownerId == null) return;
    if (!isEulaliaCombatActive(runtimeApi, ownerId)) return;
    if (isEulaliaPhaseActive(runtimeApi, ownerId, EULALIA_ABSORB_ACTIVE_KEY, phase) ||
        isEulaliaPhaseActive(runtimeApi, ownerId, EULALIA_BURST_PENDING_KEY, phase)) {
      return;
    }

    var entry = recipients[String(ownerId)];
    if (!entry) return;
    var receivedCurse = Math.max(0, Math.ceil(Number(entry.effectiveCurse || 0)));
    if (receivedCurse <= 0) return;

    queueEulaliaNominalBurden(runtimeApi, ownerId, receivedCurse, phase, 'eulalia_received_curse');
  }

  function finalizeEulaliaStreet(runtimeApi, ownerId, phase) {
    if (!isEulaliaCombatActive(runtimeApi, ownerId)) {
      disableEulaliaRuntime(runtimeApi, ownerId, phase, 'inactive_finalize_street');
      return;
    }
    var streetBurden = getEulaliaAssetValue(runtimeApi, ownerId, EULALIA_STREET_BURDEN_KEY);
    var burstThisStreet = isEulaliaPhaseActive(runtimeApi, ownerId, EULALIA_BURST_PENDING_KEY, phase);
    var absorbThisStreet = isEulaliaPhaseActive(runtimeApi, ownerId, EULALIA_ABSORB_ACTIVE_KEY, phase);
    var forceRuntime = getForceRuntime(runtimeApi);

    if (forceRuntime && typeof forceRuntime.pruneStreetContracts === 'function') {
      forceRuntime.pruneStreetContracts(runtimeApi, ownerId, EULALIA_ABSORB_WINDOW_CONTRACT_KEY, phase);
      forceRuntime.pruneStreetContracts(runtimeApi, ownerId, EULALIA_ABSOLUTION_CONTRACT_KEY, phase);
    }

    if (burstThisStreet) {
      var burstResolvedTotal = Math.max(0, Math.ceil(getEulaliaAssetValue(runtimeApi, ownerId, EULALIA_ABSOLUTION_TOTAL_KEY) * 0.5));
      var burstResolvedTargets = getActiveOpponents(runtimeApi, ownerId);
      var burstResolvedShares = splitEulaliaBurstPower(burstResolvedTotal, burstResolvedTargets.length);
      var skillSystem = getSkillSystem(runtimeApi);
      if (burstResolvedTotal > 0 && skillSystem && typeof skillSystem.emit === 'function') {
        var targetShares = [];
        for (var bi = 0; bi < burstResolvedTargets.length; bi++) {
          if (!burstResolvedTargets[bi]) continue;
          targetShares.push({
            targetId: burstResolvedTargets[bi].id,
            targetName: burstResolvedTargets[bi].name,
            share: Math.max(0, Number(burstResolvedShares[bi] || 0))
          });
        }
        if (typeof skillSystem._log === 'function') {
          skillSystem._log('EULALIA_BURST_RESOLVED', {
            ownerId: ownerId,
            ownerName: getPlayerById(runtimeApi, ownerId) ? getPlayerById(runtimeApi, ownerId).name : 'EULALIA',
            phase: phase,
            burstTotal: burstResolvedTotal,
            targetShares: targetShares
          });
        }
        skillSystem.emit('eulalia:burst_resolved', {
          ownerId: ownerId,
          ownerName: getPlayerById(runtimeApi, ownerId) ? getPlayerById(runtimeApi, ownerId).name : 'EULALIA',
          phase: phase,
          burstTotal: burstResolvedTotal,
          targetShares: targetShares
        });
      }
      queueEulaliaNominalBurden(runtimeApi, ownerId, 0, phase, 'absolution_burst_resolved');
      setEulaliaAsset(runtimeApi, ownerId, EULALIA_ABSOLUTION_TOTAL_KEY, 0, {
        reason: 'absolution_burst_resolved',
        phase: phase
      });
      setEulaliaAsset(runtimeApi, ownerId, EULALIA_BURST_COUNTDOWN_KEY, 0, {
        reason: 'absolution_burst_resolved',
        phase: phase
      });
    }

    if (absorbThisStreet && !burstThisStreet) {
      queueEulaliaNominalBurden(runtimeApi, ownerId, streetBurden, phase, 'absolution_street_resolved');
    }

    clearEulaliaAsset(runtimeApi, ownerId, EULALIA_STREET_BURDEN_KEY);
    clearEulaliaAsset(runtimeApi, ownerId, EULALIA_ABSORB_ACTIVE_KEY);
    clearEulaliaAsset(runtimeApi, ownerId, EULALIA_BURST_PENDING_KEY);
    clearEulaliaRuntimeForces(runtimeApi, ownerId, phase, 'current');
  }

  function advanceEulaliaBurstCountdownAfterDeal(runtimeApi, ownerId, phase) {
    if (!isEulaliaCombatActive(runtimeApi, ownerId)) {
      disableEulaliaRuntime(runtimeApi, ownerId, phase, 'inactive_countdown');
      return;
    }
    if (!runtimeApi || ownerId == null) return;
    if (isEulaliaPhaseActive(runtimeApi, ownerId, EULALIA_BURST_PENDING_KEY, phase)) return;
    var currentCountdown = getEulaliaAssetValue(runtimeApi, ownerId, EULALIA_BURST_COUNTDOWN_KEY);
    if (currentCountdown <= 0) return;
    setEulaliaAsset(runtimeApi, ownerId, EULALIA_BURST_COUNTDOWN_KEY, Math.max(0, currentCountdown - 1), {
      reason: 'absolution_countdown_after_deal',
      phase: phase
    });
  }

  function resolveEulaliaBurstOnHandEnd(runtimeApi, ownerId) {
    if (!isEulaliaCombatActive(runtimeApi, ownerId)) {
      disableEulaliaRuntime(runtimeApi, ownerId, 'hand_end', 'inactive_hand_end');
      return 0;
    }
    var total = getEulaliaAssetValue(runtimeApi, ownerId, EULALIA_ABSOLUTION_TOTAL_KEY);
    if (total <= 0) return 0;
    var targets = getGamePlayers(runtimeApi).filter(function(player) {
      return player &&
        player.id !== ownerId &&
        player.isActive !== false &&
        !player.folded;
    });
    if (!targets.length) return 0;

    var burstTotal = Math.max(0, Math.ceil(total * 0.5));
    var shares = splitEulaliaBurstPower(burstTotal, targets.length);
    var applied = 0;
    for (var i = 0; i < targets.length; i++) {
      var target = targets[i];
      var share = Math.max(0, Number(shares[i] || 0));
      if (!target || share <= 0) continue;
      setPlayerChips(runtimeApi, target.id, Number(target.chips || 0) - share, 'eulalia_absolution_hand_end');
      applied += share;
    }
    return applied;
  }

  Object.assign(Builtin, {
    "getEulaliaPlayers": getEulaliaPlayers,
    "isEulaliaCombatActive": isEulaliaCombatActive,
    "isEulaliaAssetKey": isEulaliaAssetKey,
    "getEulaliaAsset": getEulaliaAsset,
    "getEulaliaAssetValue": getEulaliaAssetValue,
    "setEulaliaAsset": setEulaliaAsset,
    "clearEulaliaAsset": clearEulaliaAsset,
    "clearEulaliaRuntimeMarks": clearEulaliaRuntimeMarks,
    "syncEulaliaStatusMarks": syncEulaliaStatusMarks,
    "syncAllEulaliaStatusMarks": syncAllEulaliaStatusMarks,
    "primeEulaliaRuntimeAssets": primeEulaliaRuntimeAssets,
    "clearEulaliaRuntimeAssets": clearEulaliaRuntimeAssets,
    "clearAllEulaliaRuntimeAssets": clearAllEulaliaRuntimeAssets,
    "disableEulaliaRuntime": disableEulaliaRuntime,
    "getEulaliaContracts": getEulaliaContracts,
    "setEulaliaContracts": setEulaliaContracts,
    "getEulaliaPhaseFlag": getEulaliaPhaseFlag,
    "setEulaliaPhaseFlag": setEulaliaPhaseFlag,
    "isEulaliaPhaseActive": isEulaliaPhaseActive,
    "isEulaliaAbsorbWindowOpen": isEulaliaAbsorbWindowOpen,
    "countEulaliaContractStages": countEulaliaContractStages,
    "updateEulaliaNominalBurden": updateEulaliaNominalBurden,
    "queueEulaliaNominalBurden": queueEulaliaNominalBurden,
    "promoteQueuedEulaliaNominalBurden": promoteQueuedEulaliaNominalBurden,
    "stashEulaliaCarryoverBurden": stashEulaliaCarryoverBurden,
    "restoreEulaliaCarryoverBurden": restoreEulaliaCarryoverBurden,
    "syncEulaliaStartOfStreetNominalBurden": syncEulaliaStartOfStreetNominalBurden,
    "getEulaliaProjectedBurden": getEulaliaProjectedBurden,
    "getEulaliaFortuneMultiplier": getEulaliaFortuneMultiplier,
    "stampEulaliaFortuneSnapshot": stampEulaliaFortuneSnapshot,
    "applyEulaliaFortuneSnapshotToPendingForce": applyEulaliaFortuneSnapshotToPendingForce,
    "applyEulaliaSanctuaryCore": applyEulaliaSanctuaryCore,
    "recordEulaliaBurden": recordEulaliaBurden,
    "isAbsorbableEulaliaCurse": isAbsorbableEulaliaCurse,
    "absorbEulaliaPendingCurses": absorbEulaliaPendingCurses,
    "absorbEulaliaBenedictionCurses": absorbEulaliaBenedictionCurses,
    "queueEulaliaStreetBurdenForce": queueEulaliaStreetBurdenForce,
    "triggerEulaliaRealtimeAbsorb": triggerEulaliaRealtimeAbsorb,
    "shouldCleanupEulaliaRuntimeForce": shouldCleanupEulaliaRuntimeForce,
    "clearEulaliaRuntimeForces": clearEulaliaRuntimeForces,
    "splitEulaliaBurstPower": splitEulaliaBurstPower,
    "queueEulaliaBurstForces": queueEulaliaBurstForces,
    "activateEulaliaDueContracts": activateEulaliaDueContracts,
    "armEulaliaRiverBurst": armEulaliaRiverBurst,
    "normalizeEulaliaSkillPhaseContract": normalizeEulaliaSkillPhaseContract,
    "handleEulaliaAbsolution": handleEulaliaAbsolution,
    "resolveEulaliaBenedictionTargetId": resolveEulaliaBenedictionTargetId,
    "queueEulaliaBenedictionFortunes": queueEulaliaBenedictionFortunes,
    "handleEulaliaBenediction": handleEulaliaBenediction,
    "handleEulaliaSkillActivationEvent": handleEulaliaSkillActivationEvent,
    "processEulaliaStreet": processEulaliaStreet,
    "recordEulaliaStreetSummary": recordEulaliaStreetSummary,
    "finalizeEulaliaStreet": finalizeEulaliaStreet,
    "advanceEulaliaBurstCountdownAfterDeal": advanceEulaliaBurstCountdownAfterDeal,
    "resolveEulaliaBurstOnHandEnd": resolveEulaliaBurstOnHandEnd
  });
})(window);
