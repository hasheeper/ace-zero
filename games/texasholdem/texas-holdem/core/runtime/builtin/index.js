/**
 * Runtime Module: BuiltinRoleModules / Builtin role module registry
 * Split from the legacy builtin-role-modules.js without behavior changes.
 */
(function(global) {
  'use strict';

  var Builtin = global.AceBuiltinRuntime = global.AceBuiltinRuntime || {};

  function getNextStreetPhase() { return Builtin.getNextStreetPhase.apply(null, arguments); }
  function getSkillSystem() { return Builtin.getSkillSystem.apply(null, arguments); }
  function hasConfiguredRole() { return Builtin.hasConfiguredRole.apply(null, arguments); }
  function resolveRuntimePhase() { return Builtin.resolveRuntimePhase.apply(null, arguments); }
  function getEulaliaPlayers() { return Builtin.getEulaliaPlayers.apply(null, arguments); }
  function isEulaliaCombatActive() { return Builtin.isEulaliaCombatActive.apply(null, arguments); }
  function isEulaliaAssetKey() { return Builtin.isEulaliaAssetKey.apply(null, arguments); }
  function syncEulaliaStatusMarks() { return Builtin.syncEulaliaStatusMarks.apply(null, arguments); }
  function syncAllEulaliaStatusMarks() { return Builtin.syncAllEulaliaStatusMarks.apply(null, arguments); }
  function primeEulaliaRuntimeAssets() { return Builtin.primeEulaliaRuntimeAssets.apply(null, arguments); }
  function clearEulaliaRuntimeAssets() { return Builtin.clearEulaliaRuntimeAssets.apply(null, arguments); }
  function clearAllEulaliaRuntimeAssets() { return Builtin.clearAllEulaliaRuntimeAssets.apply(null, arguments); }
  function disableEulaliaRuntime() { return Builtin.disableEulaliaRuntime.apply(null, arguments); }
  function promoteQueuedEulaliaNominalBurden() { return Builtin.promoteQueuedEulaliaNominalBurden.apply(null, arguments); }
  function stashEulaliaCarryoverBurden() { return Builtin.stashEulaliaCarryoverBurden.apply(null, arguments); }
  function restoreEulaliaCarryoverBurden() { return Builtin.restoreEulaliaCarryoverBurden.apply(null, arguments); }
  function syncEulaliaStartOfStreetNominalBurden() { return Builtin.syncEulaliaStartOfStreetNominalBurden.apply(null, arguments); }
  function applyEulaliaSanctuaryCore() { return Builtin.applyEulaliaSanctuaryCore.apply(null, arguments); }
  function queueEulaliaStreetBurdenForce() { return Builtin.queueEulaliaStreetBurdenForce.apply(null, arguments); }
  function clearEulaliaRuntimeForces() { return Builtin.clearEulaliaRuntimeForces.apply(null, arguments); }
  function activateEulaliaDueContracts() { return Builtin.activateEulaliaDueContracts.apply(null, arguments); }
  function armEulaliaRiverBurst() { return Builtin.armEulaliaRiverBurst.apply(null, arguments); }
  function handleEulaliaSkillActivationEvent() { return Builtin.handleEulaliaSkillActivationEvent.apply(null, arguments); }
  function processEulaliaStreet() { return Builtin.processEulaliaStreet.apply(null, arguments); }
  function recordEulaliaStreetSummary() { return Builtin.recordEulaliaStreetSummary.apply(null, arguments); }
  function finalizeEulaliaStreet() { return Builtin.finalizeEulaliaStreet.apply(null, arguments); }
  function advanceEulaliaBurstCountdownAfterDeal() { return Builtin.advanceEulaliaBurstCountdownAfterDeal.apply(null, arguments); }
  function resolveEulaliaBurstOnHandEnd() { return Builtin.resolveEulaliaBurstOnHandEnd.apply(null, arguments); }
  function handleVvServiceFeeActivation() { return Builtin.handleVvServiceFeeActivation.apply(null, arguments); }
  function handleVvServiceFeeForceQueued() { return Builtin.handleVvServiceFeeForceQueued.apply(null, arguments); }
  function syncVvManaSnapshots() { return Builtin.syncVvManaSnapshots.apply(null, arguments); }
  function handleVvServiceFeeManaChanged() { return Builtin.handleVvServiceFeeManaChanged.apply(null, arguments); }
  function handleVvServiceFeePsyche() { return Builtin.handleVvServiceFeePsyche.apply(null, arguments); }
  function syncVvBubbleMarks() { return Builtin.syncVvBubbleMarks.apply(null, arguments); }
  function clearVvInjectedForces() { return Builtin.clearVvInjectedForces.apply(null, arguments); }
  function injectVvBubbleForces() { return Builtin.injectVvBubbleForces.apply(null, arguments); }
  function refreshVvPositionAssets() { return Builtin.refreshVvPositionAssets.apply(null, arguments); }
  function handleVvClairvoyance() { return Builtin.handleVvClairvoyance.apply(null, arguments); }
  function handleVvLiquidation() { return Builtin.handleVvLiquidation.apply(null, arguments); }
  function getPoppyPlayers() { return Builtin.getPoppyPlayers.apply(null, arguments); }
  function clearPoppyAsset() { return Builtin.clearPoppyAsset.apply(null, arguments); }
  function syncPoppyManaAnchor() { return Builtin.syncPoppyManaAnchor.apply(null, arguments); }
  function syncPoppyManaTrackMap() { return Builtin.syncPoppyManaTrackMap.apply(null, arguments); }
  function clearPoppyMiracleInjectedForces() { return Builtin.clearPoppyMiracleInjectedForces.apply(null, arguments); }
  function clearPoppyMiracleHandAssets() { return Builtin.clearPoppyMiracleHandAssets.apply(null, arguments); }
  function clearAllPoppyAssets() { return Builtin.clearAllPoppyAssets.apply(null, arguments); }
  function clearPoppyMiracleStatusMark() { return Builtin.clearPoppyMiracleStatusMark.apply(null, arguments); }
  function capturePoppyManaSpend() { return Builtin.capturePoppyManaSpend.apply(null, arguments); }
  function queuePoppyMiracle() { return Builtin.queuePoppyMiracle.apply(null, arguments); }
  function activatePoppyMiracle() { return Builtin.activatePoppyMiracle.apply(null, arguments); }
  function injectPoppyMiracleForces() { return Builtin.injectPoppyMiracleForces.apply(null, arguments); }
  function decayPoppyMiraclePacks() { return Builtin.decayPoppyMiraclePacks.apply(null, arguments); }
  function handlePoppyStreetResolved() { return Builtin.handlePoppyStreetResolved.apply(null, arguments); }
  function getKuzuhaPlayers() { return Builtin.getKuzuhaPlayers.apply(null, arguments); }
  function clearAllKuzuhaCalled() { return Builtin.clearAllKuzuhaCalled.apply(null, arguments); }
  function syncKuzuhaDebtMarks() { return Builtin.syncKuzuhaDebtMarks.apply(null, arguments); }
  function handleKuzuhaSkillActivationEvent() { return Builtin.handleKuzuhaSkillActivationEvent.apply(null, arguments); }
  function settleKuzuhaDebtStreet() { return Builtin.settleKuzuhaDebtStreet.apply(null, arguments); }
  function clearAllKuzuhaAssets() { return Builtin.clearAllKuzuhaAssets.apply(null, arguments); }
  function getTrixiePlayers() { return Builtin.getTrixiePlayers.apply(null, arguments); }
  function clearTrixieStreetAssets() { return Builtin.clearTrixieStreetAssets.apply(null, arguments); }
  function clearAllTrixieAssets() { return Builtin.clearAllTrixieAssets.apply(null, arguments); }
  function syncTrixieWildMarks() { return Builtin.syncTrixieWildMarks.apply(null, arguments); }
  function forgeTrixieWildCard() { return Builtin.forgeTrixieWildCard.apply(null, arguments); }
  function syncAllTrixieRuntimeMarks() { return Builtin.syncAllTrixieRuntimeMarks.apply(null, arguments); }
  function injectTrixieRewriteContracts() { return Builtin.injectTrixieRewriteContracts.apply(null, arguments); }
  function advanceTrixieRewriteContracts() { return Builtin.advanceTrixieRewriteContracts.apply(null, arguments); }
  function advanceTrixieBlindBoxContracts() { return Builtin.advanceTrixieBlindBoxContracts.apply(null, arguments); }
  function clearTrixieContractsOnHandEnd() { return Builtin.clearTrixieContractsOnHandEnd.apply(null, arguments); }
  function handleTrixieSkillActivationEvent() { return Builtin.handleTrixieSkillActivationEvent.apply(null, arguments); }
  function getCotaPlayers() { return Builtin.getCotaPlayers.apply(null, arguments); }
  function clearCotaTransientStreetState() { return Builtin.clearCotaTransientStreetState.apply(null, arguments); }
  function resetAllCotaPersistentState() { return Builtin.resetAllCotaPersistentState.apply(null, arguments); }
  function primeCotaPersistentState() { return Builtin.primeCotaPersistentState.apply(null, arguments); }
  function handleCotaSkillActivationEvent() { return Builtin.handleCotaSkillActivationEvent.apply(null, arguments); }
  function captureCotaStreetCursePressure() { return Builtin.captureCotaStreetCursePressure.apply(null, arguments); }
  function processCotaStreetStart() { return Builtin.processCotaStreetStart.apply(null, arguments); }
  function getKakoPlayers() { return Builtin.getKakoPlayers.apply(null, arguments); }
  function snapshotKakoManaAnchors() { return Builtin.snapshotKakoManaAnchors.apply(null, arguments); }
  function syncKakoRedlineRate() { return Builtin.syncKakoRedlineRate.apply(null, arguments); }
  function syncAllKakoRedSealMarks() { return Builtin.syncAllKakoRedSealMarks.apply(null, arguments); }
  function clearKakoStreetAssets() { return Builtin.clearKakoStreetAssets.apply(null, arguments); }
  function syncKakoPendingMarks() { return Builtin.syncKakoPendingMarks.apply(null, arguments); }
  function handleKakoForceQueued() { return Builtin.handleKakoForceQueued.apply(null, arguments); }
  function handleKakoForceRemoved() { return Builtin.handleKakoForceRemoved.apply(null, arguments); }
  function handleKakoForceMutated() { return Builtin.handleKakoForceMutated.apply(null, arguments); }
  function captureKakoManaDelta() { return Builtin.captureKakoManaDelta.apply(null, arguments); }
  function buildKakoPreDealWindow() { return Builtin.buildKakoPreDealWindow.apply(null, arguments); }
  function handleKakoSkillActivationEvent() { return Builtin.handleKakoSkillActivationEvent.apply(null, arguments); }
  function processKakoSignoffFlow() { return Builtin.processKakoSignoffFlow.apply(null, arguments); }
  function createKuzuhaRoleHandler() { return Builtin.createKuzuhaRoleHandler.apply(null, arguments); }
  function createTrixieRoleHandler() { return Builtin.createTrixieRoleHandler.apply(null, arguments); }
  function createKakoRoleHandler() { return Builtin.createKakoRoleHandler.apply(null, arguments); }
  function createEulaliaProfileHandler() { return Builtin.createEulaliaProfileHandler.apply(null, arguments); }
  function createVvProfileHandler() { return Builtin.createVvProfileHandler.apply(null, arguments); }
  function createCotaProfileHandler() { return Builtin.createCotaProfileHandler.apply(null, arguments); }

  var POPPY_MIRACLE_PACKS_KEY = Builtin.POPPY_MIRACLE_PACKS_KEY;
  var siaProfileHandler = Builtin.siaProfileHandler;
  var rinoRoleHandler = Builtin.rinoRoleHandler;

  function registerBuiltinRoleModules(runtimeApi) {
    if (!runtimeApi || typeof runtimeApi.registerRuntimeModule !== 'function') return null;

    var builtinModuleIds = [
      'builtin:sia-role-ai',
      'builtin:rino-role-ai',
      'builtin:vv-profile-ai',
      'builtin:cota-profile-ai',
      'builtin:eulalia-profile-ai',
      'builtin:kuzuha-profile-ai',
      'builtin:trixie-role-ai',
      'builtin:kako-role-ai',
      'builtin:vv-runtime',
      'builtin:poppy-runtime',
      'builtin:eulalia-runtime',
      'builtin:kuzuha-runtime',
      'builtin:trixie-runtime',
      'builtin:cota-runtime',
      'builtin:kako-runtime'
    ];
    if (typeof runtimeApi.unregisterRuntimeModule === 'function') {
      for (var builtinIdx = 0; builtinIdx < builtinModuleIds.length; builtinIdx++) {
        runtimeApi.unregisterRuntimeModule(builtinModuleIds[builtinIdx]);
      }
    }

    var vvProfileHandler = createVvProfileHandler(runtimeApi);
    var cotaProfileHandler = createCotaProfileHandler(runtimeApi);
    var eulaliaProfileHandler = createEulaliaProfileHandler(runtimeApi);
    var kuzuhaRoleHandler = createKuzuhaRoleHandler(runtimeApi);
    var trixieRoleHandler = createTrixieRoleHandler(runtimeApi);
    var kakoRoleHandler = createKakoRoleHandler(runtimeApi);
    var rinoProfileHandler = rinoRoleHandler;
    var kuzuhaProfileHandler = kuzuhaRoleHandler;
    var trixieProfileHandler = trixieRoleHandler;
    var kakoProfileHandler = kakoRoleHandler;
    var kuzuhaSkillHookOff = null;

    function registerModuleIfConfigured(roleId, module, logLabel) {
      if (!module || !module.id) return;
      if (!hasConfiguredRole(runtimeApi, roleId)) return;
      runtimeApi.registerRuntimeModule(module);
      if (logLabel) console.log(logLabel);
    }

    registerModuleIfConfigured('SIA', {
      id: 'builtin:sia-role-ai',
      profiles: {
        sia: siaProfileHandler
      }
    }, '[BuiltinRoleModules] registered profile=sia');

    registerModuleIfConfigured('RINO', {
      id: 'builtin:rino-role-ai',
      profiles: {
        rino: rinoProfileHandler
      },
      ai: {
        RINO: rinoRoleHandler
      }
    }, '[BuiltinRoleModules] registered profile=rino role=RINO');

    registerModuleIfConfigured('VV', {
      id: 'builtin:vv-profile-ai',
      profiles: {
        vv: vvProfileHandler
      }
    }, '[BuiltinRoleModules] registered profile=vv');

    registerModuleIfConfigured('COTA', {
      id: 'builtin:cota-profile-ai',
      profiles: {
        cota: cotaProfileHandler
      }
    }, '[BuiltinRoleModules] registered profile=cota');

    registerModuleIfConfigured('EULALIA', {
      id: 'builtin:eulalia-profile-ai',
      profiles: {
        eulalia: eulaliaProfileHandler
      }
    }, '[BuiltinRoleModules] registered profile=eulalia');

    registerModuleIfConfigured('KUZUHA', {
      id: 'builtin:kuzuha-profile-ai',
      profiles: {
        kuzuha: kuzuhaProfileHandler
      },
      ai: {
        KUZUHA: kuzuhaRoleHandler
      }
    }, '[BuiltinRoleModules] registered profile=kuzuha role=KUZUHA');

    registerModuleIfConfigured('TRIXIE', {
      id: 'builtin:trixie-role-ai',
      profiles: {
        trixie: trixieProfileHandler
      },
      ai: {
        TRIXIE: trixieRoleHandler
      }
    }, '[BuiltinRoleModules] registered profile=trixie role=TRIXIE');

    registerModuleIfConfigured('KAKO', {
      id: 'builtin:kako-role-ai',
      profiles: {
        kako: kakoProfileHandler
      },
      ai: {
        KAKO: kakoRoleHandler
      }
    }, '[BuiltinRoleModules] registered profile=kako role=KAKO');

    registerModuleIfConfigured('VV', {
      id: 'builtin:vv-runtime',
      hooks: {
        'players:initialized': function(payload, api) {
          syncVvManaSnapshots(api);
          syncVvBubbleMarks(api);
        },
        'system:reset': function(payload, api) {
          syncVvManaSnapshots(api);
          syncVvBubbleMarks(api);
        },
        'skill:activated': function(payload, api) {
          if (!payload || !payload.skill) return;
      if (payload.type === 'clairvoyance' || payload.skill.effect === 'clairvoyance') {
            if (payload.__vvRuntimeHandled) return;
            payload.__vvRuntimeHandled = true;
            handleVvClairvoyance(payload, api);
          } else if (payload.type === 'bubble_liquidation' || payload.skill.effect === 'bubble_liquidation') {
            if (payload.__vvRuntimeHandled) return;
            payload.__vvRuntimeHandled = true;
            handleVvLiquidation(payload, api);
          }
          handleVvServiceFeeActivation(payload, api);
        },
        'force:queued': function(payload, api) {
          handleVvServiceFeeForceQueued(payload, api);
        },
        'mana:changed': function(payload, api) {
          handleVvServiceFeeManaChanged(payload, api);
        },
        'moz:after_select': function(payload, api) {
          handleVvServiceFeePsyche(payload, api);
        },
        'moz:before_select': function(payload, api) {
          injectVvBubbleForces(api);
          syncVvBubbleMarks(api);
        },
        'hand:start': function(payload, api) {
          syncVvManaSnapshots(api);
          clearVvInjectedForces(api);
          syncVvBubbleMarks(api);
        },
        'table:hand_end': function(payload, api) {
          syncVvManaSnapshots(api);
          clearVvInjectedForces(api);
          refreshVvPositionAssets(api);
          syncVvBubbleMarks(api);
        }
      }
    }, '[BuiltinRoleModules] registered runtime=vv');

    registerModuleIfConfigured('POPPY', {
      id: 'builtin:poppy-runtime',
      hooks: {
        'mana:changed': function(payload, api) {
          capturePoppyManaSpend(payload, api);
        },
        'forces:resolved': function(payload, api) {
          handlePoppyStreetResolved(payload, api);
        },
        'moz:before_select': function(payload, api) {
          injectPoppyMiracleForces(api);
        },
        'moz:after_select': function(payload, api) {
          decayPoppyMiraclePacks(api);
        },
        'hand:start': function(payload, api) {
          clearPoppyMiracleInjectedForces(api);
          var players = getPoppyPlayers(api);
          for (var i = 0; i < players.length; i++) {
            clearPoppyMiracleHandAssets(api, players[i].id);
            activatePoppyMiracle(api, players[i]);
            syncPoppyManaAnchor(api, players[i].id);
            syncPoppyManaTrackMap(api, players[i].id);
          }
        },
        'table:hand_end': function(payload, api) {
          clearPoppyMiracleInjectedForces(api);
          var players = getPoppyPlayers(api);
          for (var i = 0; i < players.length; i++) {
            clearPoppyMiracleHandAssets(api, players[i].id);
            clearPoppyAsset(api, players[i].id, POPPY_MIRACLE_PACKS_KEY);
            clearPoppyMiracleStatusMark(api, players[i].id);
            queuePoppyMiracle(api, players[i]);
          }
        },
        'system:reset': function(payload, api) {
          clearAllPoppyAssets(api);
        }
      }
    }, '[BuiltinRoleModules] registered runtime=poppy');

    registerModuleIfConfigured('EULALIA', {
      id: 'builtin:eulalia-runtime',
      hooks: {
        'hand:start': function(payload, api) {
          var players = getEulaliaPlayers(api);
          for (var i = 0; i < players.length; i++) {
            clearEulaliaRuntimeAssets(api, players[i].id);
            restoreEulaliaCarryoverBurden(api, players[i].id, 'preflop');
            primeEulaliaRuntimeAssets(api, players[i].id);
          }
          syncAllEulaliaStatusMarks(api);
        },
        'skill:activated': function(payload, api) {
          handleEulaliaSkillActivationEvent(payload, api);
        },
        'table:pre_deal_window': function(payload, api) {
          var nextPhase = getNextStreetPhase(resolveRuntimePhase(api, payload));
          if (!nextPhase) return;
          var players = getEulaliaPlayers(api);
          for (var i = 0; i < players.length; i++) {
            if (!isEulaliaCombatActive(api, players[i].id)) continue;
            syncEulaliaStartOfStreetNominalBurden(api, players[i].id, nextPhase);
          }
          syncAllEulaliaStatusMarks(api);
        },
        'table:street_start': function(payload, api) {
          var phase = resolveRuntimePhase(api, payload);
          var players = getEulaliaPlayers(api);
          for (var i = 0; i < players.length; i++) {
            if (!isEulaliaCombatActive(api, players[i].id)) {
              disableEulaliaRuntime(api, players[i].id, phase, 'inactive_street_start');
              continue;
            }
            clearEulaliaRuntimeForces(api, players[i].id, phase, 'stale');
            promoteQueuedEulaliaNominalBurden(api, players[i].id, phase);
            activateEulaliaDueContracts(api, players[i].id, phase);
            armEulaliaRiverBurst(api, players[i].id, phase);
            processEulaliaStreet(api, players[i].id, phase);
            syncEulaliaStartOfStreetNominalBurden(api, players[i].id, phase);
            queueEulaliaStreetBurdenForce(api, players[i].id, phase);
            applyEulaliaSanctuaryCore(api, players[i].id, phase);
          }
          syncAllEulaliaStatusMarks(api);
        },
        'moz:before_select': function(payload, api) {
          var phase = resolveRuntimePhase(api, payload);
          var players = getEulaliaPlayers(api);
          for (var i = 0; i < players.length; i++) {
            if (!isEulaliaCombatActive(api, players[i].id)) {
              disableEulaliaRuntime(api, players[i].id, phase, 'inactive_before_select');
              continue;
            }
            processEulaliaStreet(api, players[i].id, phase);
          }
        },
        'table:street_dealt': function(payload, api) {
          var phase = resolveRuntimePhase(api, payload);
          var players = getEulaliaPlayers(api);
          for (var i = 0; i < players.length; i++) {
            if (!isEulaliaCombatActive(api, players[i].id)) {
              disableEulaliaRuntime(api, players[i].id, phase, 'inactive_street_dealt');
              continue;
            }
            advanceEulaliaBurstCountdownAfterDeal(api, players[i].id, phase);
          }
          syncAllEulaliaStatusMarks(api);
        },
        'street:force_summary': function(payload, api) {
          var players = getEulaliaPlayers(api);
          for (var i = 0; i < players.length; i++) {
            if (!isEulaliaCombatActive(api, players[i].id)) {
              disableEulaliaRuntime(api, players[i].id, payload && payload.phase, 'inactive_force_summary');
              continue;
            }
            recordEulaliaStreetSummary(api, payload, players[i].id);
          }
        },
        'street:resolved': function(payload, api) {
          var phase = resolveRuntimePhase(api, payload);
          var players = getEulaliaPlayers(api);
          for (var i = 0; i < players.length; i++) {
            if (!isEulaliaCombatActive(api, players[i].id)) {
              disableEulaliaRuntime(api, players[i].id, phase, 'inactive_street_resolved');
              continue;
            }
            finalizeEulaliaStreet(api, players[i].id, phase);
          }
          syncAllEulaliaStatusMarks(api);
        },
        'table:hand_end': function(payload, api) {
          var players = getEulaliaPlayers(api);
          for (var i = 0; i < players.length; i++) {
            stashEulaliaCarryoverBurden(api, players[i].id, 'hand_end');
            if (!isEulaliaCombatActive(api, players[i].id)) {
              disableEulaliaRuntime(api, players[i].id, 'hand_end', 'inactive_table_hand_end');
              continue;
            }
            resolveEulaliaBurstOnHandEnd(api, players[i].id);
            clearEulaliaRuntimeForces(api, players[i].id, null, 'all', { includePersistent: true });
            clearEulaliaRuntimeAssets(api, players[i].id);
          }
        },
        'asset:set': function(payload, api) {
          if (!payload || payload.ownerId == null || !isEulaliaAssetKey(payload.key)) return;
          syncEulaliaStatusMarks(api, payload.ownerId);
        },
        'asset:clear': function(payload, api) {
          if (!payload || payload.ownerId == null || !isEulaliaAssetKey(payload.key)) return;
          syncEulaliaStatusMarks(api, payload.ownerId);
        },
        'asset:clear_all': function(payload, api) {
          syncAllEulaliaStatusMarks(api);
        },
        'system:reset': function(payload, api) {
          clearAllEulaliaRuntimeAssets(api);
        }
      }
    }, '[BuiltinRoleModules] registered runtime=eulalia');

    registerModuleIfConfigured('KUZUHA', {
      id: 'builtin:kuzuha-runtime',
      ai: {
        KUZUHA: kuzuhaRoleHandler
      },
      init: function(api) {
        var skillSystem = getSkillSystem(api);
        if (!skillSystem || typeof skillSystem.on !== 'function') return;
        kuzuhaSkillHookOff = skillSystem.on('skill:activated', function(payload) {
          handleKuzuhaSkillActivationEvent(payload, api);
        });
      },
      cleanup: function() {
        if (typeof kuzuhaSkillHookOff === 'function') kuzuhaSkillHookOff();
        kuzuhaSkillHookOff = null;
      },
      hooks: {
        'skill:activated': function(payload, api) {
          handleKuzuhaSkillActivationEvent(payload, api);
        },
        'forces:resolved': function(payload, api) {
          var players = getKuzuhaPlayers(api);
          for (var i = 0; i < players.length; i++) {
            settleKuzuhaDebtStreet(api, payload, players[i]);
          }
          syncKuzuhaDebtMarks(api);
        },
        'hand:start': function(payload, api) {
          var players = getKuzuhaPlayers(api);
          for (var i = 0; i < players.length; i++) {
            clearAllKuzuhaCalled(api, players[i].id);
          }
          syncKuzuhaDebtMarks(api);
        },
        'system:reset': function(payload, api) {
          clearAllKuzuhaAssets(api);
        }
      }
    }, '[BuiltinRoleModules] registered runtime=kuzuha');

    registerModuleIfConfigured('TRIXIE', {
      id: 'builtin:trixie-runtime',
      hooks: {
        'skill:activated': function(payload, api) {
          handleTrixieSkillActivationEvent(payload, api);
        },
        'moz:before_select': function(payload, api) {
          injectTrixieRewriteContracts(api, payload);
        },
        'table:street_dealt': function(payload, api) {
          advanceTrixieRewriteContracts(api, payload);
          advanceTrixieBlindBoxContracts(api, payload);
          syncAllTrixieRuntimeMarks(api);
        },
        'street:force_summary': function(payload, api) {
          var players = getTrixiePlayers(api);
          for (var i = 0; i < players.length; i++) {
            forgeTrixieWildCard(api, payload, players[i]);
          }
          syncTrixieWildMarks(api);
        },
        'street:resolved': function(payload, api) {
          syncAllTrixieRuntimeMarks(api);
        },
        'hand:start': function(payload, api) {
          var players = getTrixiePlayers(api);
          for (var i = 0; i < players.length; i++) {
            clearTrixieStreetAssets(api, players[i].id);
          }
          syncTrixieWildMarks(api);
          syncAllTrixieRuntimeMarks(api);
        },
        'table:hand_end': function(payload, api) {
          clearTrixieContractsOnHandEnd(api, payload);
          syncTrixieWildMarks(api);
          syncAllTrixieRuntimeMarks(api);
        },
        'system:reset': function(payload, api) {
          clearAllTrixieAssets(api);
        }
      }
    }, '[BuiltinRoleModules] registered runtime=trixie');

    registerModuleIfConfigured('COTA', {
      id: 'builtin:cota-runtime',
      hooks: {
        'hand:start': function(payload, api) {
          var players = getCotaPlayers(api);
          for (var i = 0; i < players.length; i++) {
            primeCotaPersistentState(api, players[i].id, {
              source: 'hand:start',
              phase: payload && payload.phase != null ? payload.phase : null
            });
          }
        },
        'skill:activated': function(payload, api) {
          handleCotaSkillActivationEvent(payload, api);
        },
        'forces:resolved': function(payload, api) {
          captureCotaStreetCursePressure(payload, api);
        },
        'table:street_start': function(payload, api) {
          processCotaStreetStart(api, payload, null, 'table:street_start');
        },
        'table:hand_end': function(payload, api) {
          var players = getCotaPlayers(api);
          for (var i = 0; i < players.length; i++) {
            clearCotaTransientStreetState(api, players[i].id);
          }
        },
        'players:initialized': function(payload, api) {
          var players = getCotaPlayers(api);
          for (var i = 0; i < players.length; i++) {
            primeCotaPersistentState(api, players[i].id, {
              source: 'players:initialized',
              phase: payload && payload.phase != null ? payload.phase : null
            });
          }
        },
        'system:reset': function(payload, api) {
          var players = getCotaPlayers(api);
          for (var i = 0; i < players.length; i++) {
            resetAllCotaPersistentState(api, players[i].id, {
              source: 'system:reset',
              phase: payload && payload.phase != null ? payload.phase : null
            });
          }
        }
      }
    }, '[BuiltinRoleModules] registered runtime=cota');

    registerModuleIfConfigured('KAKO', {
      id: 'builtin:kako-runtime',
      hooks: {
        'hand:start': function(payload, api) {
          clearKakoStreetAssets(api, false, true);
          snapshotKakoManaAnchors(api);
          syncAllKakoRedSealMarks(api);
          syncKakoPendingMarks(api);
        },
        'table:street_start': function(payload, api) {
          clearKakoStreetAssets(api, false, true);
          snapshotKakoManaAnchors(api);
          syncAllKakoRedSealMarks(api);
          syncKakoPendingMarks(api);
        },
        'players:initialized': function(payload, api) {
          syncAllKakoRedSealMarks(api);
          syncKakoPendingMarks(api);
        },
        'skill:activated': function(payload, api) {
          handleKakoSkillActivationEvent(payload, api);
        },
        'force:queued': function(payload, api) {
          handleKakoForceQueued(payload, api);
        },
        'force:removed': function(payload, api) {
          handleKakoForceRemoved(payload, api);
        },
        'force:mutated': function(payload, api) {
          handleKakoForceMutated(payload, api);
        },
        'mana:changed': function(payload, api) {
          captureKakoManaDelta(payload, api);
        },
        'table:pre_deal_window': function(payload, api) {
          syncKakoRedlineRate(api);
          var owners = getKakoPlayers(api);
          for (var i = 0; i < owners.length; i++) {
            var windowData = buildKakoPreDealWindow(api, owners[i]);
            if (windowData) {
              payload.kakoWindow = windowData;
              return;
            }
          }
        },
        'table:pre_deal_window_resolved': function(payload, api) {
          processKakoSignoffFlow(api);
        },
        'table:hand_end': function(payload, api) {
          clearKakoStreetAssets(api, false, true);
          snapshotKakoManaAnchors(api);
          syncAllKakoRedSealMarks(api);
        },
        'system:reset': function(payload, api) {
          clearKakoStreetAssets(api, false, true);
          snapshotKakoManaAnchors(api);
          syncAllKakoRedSealMarks(api);
        }
      }
    }, '[BuiltinRoleModules] registered runtime=kako');

    var director = global.NpcRoleDirector;
    if (director) {
      if (typeof director.getProfileHandler === 'function' &&
          !director.getProfileHandler('sia') &&
          typeof director.registerProfile === 'function' &&
          hasConfiguredRole(runtimeApi, 'SIA')) {
        director.registerProfile('sia', siaProfileHandler);
        console.warn('[BuiltinRoleModules] direct-bound profile=sia fallback');
      }
      if (typeof director.getProfileHandler === 'function' &&
          !director.getProfileHandler('vv') &&
          typeof director.registerProfile === 'function' &&
          hasConfiguredRole(runtimeApi, 'VV')) {
        director.registerProfile('vv', vvProfileHandler);
        console.warn('[BuiltinRoleModules] direct-bound profile=vv fallback');
      }
      if (typeof director.getProfileHandler === 'function' &&
          !director.getProfileHandler('rino') &&
          typeof director.registerProfile === 'function' &&
          hasConfiguredRole(runtimeApi, 'RINO')) {
        director.registerProfile('rino', rinoProfileHandler);
        console.warn('[BuiltinRoleModules] direct-bound profile=rino fallback');
      }
      if (typeof director.getProfileHandler === 'function' &&
          !director.getProfileHandler('cota') &&
          typeof director.registerProfile === 'function' &&
          hasConfiguredRole(runtimeApi, 'COTA')) {
        director.registerProfile('cota', cotaProfileHandler);
        console.warn('[BuiltinRoleModules] direct-bound profile=cota fallback');
      }
      if (typeof director.getProfileHandler === 'function' &&
          !director.getProfileHandler('eulalia') &&
          typeof director.registerProfile === 'function' &&
          hasConfiguredRole(runtimeApi, 'EULALIA')) {
        director.registerProfile('eulalia', eulaliaProfileHandler);
        console.warn('[BuiltinRoleModules] direct-bound profile=eulalia fallback');
      }
      if (typeof director.getProfileHandler === 'function' &&
          !director.getProfileHandler('kuzuha') &&
          typeof director.registerProfile === 'function' &&
          hasConfiguredRole(runtimeApi, 'KUZUHA')) {
        director.registerProfile('kuzuha', kuzuhaProfileHandler);
        console.warn('[BuiltinRoleModules] direct-bound profile=kuzuha fallback');
      }
      if (typeof director.getProfileHandler === 'function' &&
          !director.getProfileHandler('trixie') &&
          typeof director.registerProfile === 'function' &&
          hasConfiguredRole(runtimeApi, 'TRIXIE')) {
        director.registerProfile('trixie', trixieProfileHandler);
        console.warn('[BuiltinRoleModules] direct-bound profile=trixie fallback');
      }
      if (typeof director.getProfileHandler === 'function' &&
          !director.getProfileHandler('kako') &&
          typeof director.registerProfile === 'function' &&
          hasConfiguredRole(runtimeApi, 'KAKO')) {
        director.registerProfile('kako', kakoProfileHandler);
        console.warn('[BuiltinRoleModules] direct-bound profile=kako fallback');
      }
      if (typeof director.getRoleHandler === 'function' &&
          !director.getRoleHandler('RINO') &&
          typeof director.registerRole === 'function' &&
          hasConfiguredRole(runtimeApi, 'RINO')) {
        director.registerRole('RINO', rinoRoleHandler);
        console.warn('[BuiltinRoleModules] direct-bound role=RINO fallback');
      }
      if (typeof director.getRoleHandler === 'function' &&
          !director.getRoleHandler('KUZUHA') &&
          typeof director.registerRole === 'function' &&
          hasConfiguredRole(runtimeApi, 'KUZUHA')) {
        director.registerRole('KUZUHA', kuzuhaRoleHandler);
        console.warn('[BuiltinRoleModules] direct-bound role=KUZUHA fallback');
      }
      if (typeof director.getRoleHandler === 'function' &&
          !director.getRoleHandler('TRIXIE') &&
          typeof director.registerRole === 'function' &&
          hasConfiguredRole(runtimeApi, 'TRIXIE')) {
        director.registerRole('TRIXIE', trixieRoleHandler);
        console.warn('[BuiltinRoleModules] direct-bound role=TRIXIE fallback');
      }
      if (typeof director.getRoleHandler === 'function' &&
          !director.getRoleHandler('KAKO') &&
          typeof director.registerRole === 'function' &&
          hasConfiguredRole(runtimeApi, 'KAKO')) {
        director.registerRole('KAKO', kakoRoleHandler);
        console.warn('[BuiltinRoleModules] direct-bound role=KAKO fallback');
      }
    }

    return true;
  }

  function registerSiaRoleModule(runtimeApi) {
    return registerBuiltinRoleModules(runtimeApi);
  }

  global.AceBuiltinModules = Object.assign({}, global.AceBuiltinModules || {}, {
    registerSiaRoleModule: registerSiaRoleModule,
    registerBuiltinRoleModules: registerBuiltinRoleModules
  });

  Object.assign(Builtin, {
    "registerBuiltinRoleModules": registerBuiltinRoleModules,
    "registerSiaRoleModule": registerSiaRoleModule
  });
})(window);
