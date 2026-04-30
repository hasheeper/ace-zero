(function(global) {
  'use strict';

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  var state = {
    runtimeApi: null,
    bound: false,
    lastQueued: null,
    lastRemoved: null,
    lastMutated: null,
    lastReplaced: null,
    lastStreetResolved: null,
    lastResolvedSnapshot: [],
    lastPsycheEvents: [],
    lastStreetReceivedTotals: null,
    streetResolvedSerial: 0
  };

  function getPlayers(runtimeApi) {
    var gameState = runtimeApi && typeof runtimeApi.getGameState === 'function'
      ? runtimeApi.getGameState()
      : null;
    return gameState && Array.isArray(gameState.players) ? gameState.players : [];
  }

  function getSkillSystem(runtimeApi) {
    return runtimeApi && runtimeApi.skillSystem ? runtimeApi.skillSystem : null;
  }

  function bindRuntimeFlow(runtimeApi) {
    if (state.bound || !runtimeApi || !runtimeApi.runtimeFlow || typeof runtimeApi.runtimeFlow.on !== 'function') return;
    state.bound = true;

    runtimeApi.runtimeFlow.on('force:queued', function(payload) {
      state.lastQueued = clone(payload);
    });
    runtimeApi.runtimeFlow.on('force:removed', function(payload) {
      state.lastRemoved = clone(payload);
    });
    runtimeApi.runtimeFlow.on('force:mutated', function(payload) {
      state.lastMutated = clone(payload);
    });
    runtimeApi.runtimeFlow.on('forces:replaced', function(payload) {
      state.lastReplaced = clone(payload);
    });
    runtimeApi.runtimeFlow.on('hand:start', function() {
      state.lastQueued = null;
      state.lastRemoved = null;
      state.lastMutated = null;
      state.lastReplaced = null;
      state.lastStreetResolved = null;
      state.lastResolvedSnapshot = [];
      state.lastPsycheEvents = [];
      state.lastStreetReceivedTotals = null;
    });
    runtimeApi.runtimeFlow.on('system:reset', function() {
      state.lastQueued = null;
      state.lastRemoved = null;
      state.lastMutated = null;
      state.lastReplaced = null;
      state.lastStreetResolved = null;
      state.lastResolvedSnapshot = [];
      state.lastPsycheEvents = [];
      state.lastStreetReceivedTotals = null;
      state.streetResolvedSerial = 0;
    });
    runtimeApi.runtimeFlow.on('street:resolved', function(payload) {
      state.streetResolvedSerial += 1;
      state.lastStreetResolved = clone(payload);
      state.lastResolvedSnapshot = resolveSnapshot(runtimeApi, {
        useCollectActiveForces: true
      });
      state.lastPsycheEvents = readLastPsycheEvents(runtimeApi);
      state.lastStreetReceivedTotals = buildStreetReceivedTotals(state.lastResolvedSnapshot);

      if (runtimeApi.runtimeFlow && typeof runtimeApi.runtimeFlow.emit === 'function') {
        runtimeApi.runtimeFlow.emit('street:force_summary', {
          phase: payload && payload.phase != null ? payload.phase : null,
          pot: payload && payload.pot != null ? payload.pot : null,
          board: payload && Array.isArray(payload.board) ? payload.board.slice() : [],
          allIn: !!(payload && payload.allIn),
          summary: clone(state.lastStreetReceivedTotals)
        });
        runtimeApi.runtimeFlow.emit('forces:resolved', {
          phase: payload && payload.phase != null ? payload.phase : null,
          pot: payload && payload.pot != null ? payload.pot : null,
          board: payload && Array.isArray(payload.board) ? payload.board.slice() : [],
          allIn: !!(payload && payload.allIn),
          snapshot: clone(state.lastResolvedSnapshot),
          psycheEvents: clone(state.lastPsycheEvents)
        });
      }
    });
  }

  function readLastPsycheEvents(runtimeApi) {
    var moz = runtimeApi && runtimeApi.moz ? runtimeApi.moz : null;
    return moz && Array.isArray(moz._lastPsycheEvents) ? clone(moz._lastPsycheEvents) : [];
  }

  function snapshotRawForces(runtimeApi, options) {
    options = options || {};
    if (Array.isArray(options.forces)) {
      return clone(options.forces);
    }

    var skillSystem = getSkillSystem(runtimeApi);
    if (!skillSystem) return [];

    var players = getPlayers(runtimeApi);
    var gameState = runtimeApi && typeof runtimeApi.getGameState === 'function'
      ? runtimeApi.getGameState()
      : null;
    var context = gameState || { players: players };

    if (options.useCollectActiveForces !== false &&
        typeof skillSystem.collectActiveForces === 'function') {
      return clone(skillSystem.collectActiveForces(context));
    }

    return clone(skillSystem.pendingForces || []);
  }

  function resolveSnapshot(runtimeApi, options) {
    options = options || {};
    var forces = snapshotRawForces(runtimeApi, options);
    if (!Array.isArray(forces) || forces.length === 0) return [];

    var moz = runtimeApi && runtimeApi.moz ? runtimeApi.moz : null;
    var combatFormula = moz && moz.combatFormula ? moz.combatFormula : null;
    if (!moz || !combatFormula || typeof moz._resolveForceOpposition !== 'function') {
      return forces.map(function(force) {
        return Object.assign({}, force, {
          effectivePower: force && force.effectivePower != null
            ? force.effectivePower
            : Number(force && force.power || 0)
        });
      });
    }

    var players = getPlayers(runtimeApi);
    var backup = {
      phaseStateKey: combatFormula._phaseStateKey,
      phaseTraitState: combatFormula._phaseTraitState ? clone(combatFormula._phaseTraitState) : {},
      martyrdomStacks: combatFormula._martyrdomStacks ? clone(combatFormula._martyrdomStacks) : {},
      debtCount: combatFormula._debtCount ? clone(combatFormula._debtCount) : {},
      onTraitManaGain: combatFormula.onTraitManaGain,
      lastResolvedForces: moz._lastResolvedForces ? clone(moz._lastResolvedForces) : null,
      lastPsycheEvents: moz._lastPsycheEvents ? clone(moz._lastPsycheEvents) : null
    };

    try {
      combatFormula.onTraitManaGain = null;
      var enhanced = combatFormula.enhanceForces(forces, { players: players });
      return clone(moz._resolveForceOpposition(enhanced));
    } catch (err) {
      return forces.map(function(force) {
        return Object.assign({}, force, {
          effectivePower: force && force.effectivePower != null
            ? force.effectivePower
            : Number(force && force.power || 0)
        });
      });
    } finally {
      combatFormula._phaseStateKey = backup.phaseStateKey;
      combatFormula._phaseTraitState = backup.phaseTraitState;
      combatFormula._martyrdomStacks = backup.martyrdomStacks;
      combatFormula._debtCount = backup.debtCount;
      combatFormula.onTraitManaGain = backup.onTraitManaGain;
      moz._lastResolvedForces = backup.lastResolvedForces;
      moz._lastPsycheEvents = backup.lastPsycheEvents;
    }
  }

  function getRecipientId(force) {
    if (!force) return null;
    if (force.type === 'curse') {
      return force.targetId != null ? force.targetId : null;
    }
    if (force.type === 'fortune') {
      if (force.targetId != null) return force.targetId;
      if (force.protectId != null) return force.protectId;
      return force.ownerId != null ? force.ownerId : null;
    }
    return null;
  }

  function shouldIncludeForce(force, options) {
    if (!force) return false;
    var includeTypes = Array.isArray(options && options.includeTypes) && options.includeTypes.length
      ? options.includeTypes
      : ['fortune', 'curse'];
    if (includeTypes.indexOf(force.type) === -1) return false;

    var excludeSources = Array.isArray(options && options.excludeSources) ? options.excludeSources : [];
    if (excludeSources.indexOf(force.source) !== -1) return false;

    var excludeSkillKeys = Array.isArray(options && options.excludeSkillKeys) ? options.excludeSkillKeys : [];
    if (excludeSkillKeys.indexOf(force.skillKey) !== -1) return false;

    var excludeFlags = Array.isArray(options && options.excludeFlags) ? options.excludeFlags : [];
    for (var i = 0; i < excludeFlags.length; i++) {
      var flag = excludeFlags[i];
      if (flag && force[flag]) return false;
    }
    return true;
  }

  function buildStreetReceivedTotals(snapshot, options) {
    var forces = Array.isArray(snapshot) ? snapshot : [];
    var totalsByRecipient = Object.create(null);

    for (var i = 0; i < forces.length; i++) {
      var force = forces[i];
      if (!shouldIncludeForce(force, options)) continue;
      var recipientId = getRecipientId(force);
      if (recipientId == null) continue;
      var key = String(recipientId);
      if (!totalsByRecipient[key]) {
        totalsByRecipient[key] = {
          ownerId: recipientId,
          rawFortune: 0,
          rawCurse: 0,
          effectiveFortune: 0,
          effectiveCurse: 0,
          totalRaw: 0,
          totalEffective: 0,
          forceCount: 0
        };
      }
      var entry = totalsByRecipient[key];
      var rawPower = Math.max(0, Number(force.power || 0));
      var effectivePower = Math.max(0, Number(force.effectivePower != null ? force.effectivePower : force.power || 0));
      if (force.type === 'fortune') {
        entry.rawFortune += rawPower;
        entry.effectiveFortune += effectivePower;
      } else if (force.type === 'curse') {
        entry.rawCurse += rawPower;
        entry.effectiveCurse += effectivePower;
      }
      entry.totalRaw += rawPower;
      entry.totalEffective += effectivePower;
      entry.forceCount += 1;
    }

    return {
      recipients: totalsByRecipient
    };
  }

  function getLedger(runtimeApi) {
    return runtimeApi && typeof runtimeApi.getAssetLedger === 'function'
      ? runtimeApi.getAssetLedger()
      : null;
  }

  function getStreetIndex(phase) {
    var key = String(phase || '').toLowerCase();
    if (key === 'preflop') return 0;
    if (key === 'flop') return 1;
    if (key === 'turn') return 2;
    if (key === 'river') return 3;
    return -1;
  }

  function normalizeStreetScheduleContract(contract) {
    if (!contract) return null;
    var next = Object.assign({}, contract);
    next.shotStreetIndices = Array.isArray(contract.shotStreetIndices)
      ? contract.shotStreetIndices.map(function(value) {
          return Number(value);
        }).filter(function(value) {
          return Number.isFinite(value) && value >= 0;
        }).sort(function(a, b) {
          return a - b;
        })
      : [];
    next.injectedStreetIndices = Array.isArray(contract.injectedStreetIndices)
      ? contract.injectedStreetIndices.map(function(value) {
          return Number(value);
        }).filter(function(value) {
          return Number.isFinite(value) && value >= 0;
        })
      : [];
    next.createdStreetIndex = Number.isFinite(Number(contract.createdStreetIndex))
      ? Number(contract.createdStreetIndex)
      : -1;
    next.includeCurrentStreet = contract.includeCurrentStreet === true;
    next.waitStreets = Math.max(0, Number(contract.waitStreets || 0));
    next.stagesRemaining = Math.max(0, Number(contract.stagesRemaining || 0));
    next.displayStagesRemaining = Math.max(0, Number(
      contract.displayStagesRemaining != null
        ? contract.displayStagesRemaining
        : next.stagesRemaining + (next.includeCurrentStreet ? 1 : 0)
    ));
    next.consumeCurrentStreetOnResolve = contract.consumeCurrentStreetOnResolve === true;
    next.lastInjectedStreetIndex = Number.isFinite(Number(contract.lastInjectedStreetIndex))
      ? Number(contract.lastInjectedStreetIndex)
      : null;
    next.firstInjectStreetIndex = Number.isFinite(Number(contract.firstInjectStreetIndex))
      ? Number(contract.firstInjectStreetIndex)
      : (next.createdStreetIndex >= 0 ? next.createdStreetIndex + 1 : 0);
    next.firstInjectResolveSerial = Number.isFinite(Number(contract.firstInjectResolveSerial))
      ? Number(contract.firstInjectResolveSerial)
      : 0;
    next.crossHand = contract.crossHand === true;
    if (!next.id) {
      next.id = 'street_contract_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    }
    return next;
  }

  function getScheduledStreetContracts(runtimeApi, ownerId, assetKey) {
    var ledger = getLedger(runtimeApi);
    if (!ledger || ownerId == null || !assetKey) return [];
    var asset = ledger.getAsset(ownerId, assetKey);
    if (!asset || !Array.isArray(asset.contracts)) return [];
    return asset.contracts.map(normalizeStreetScheduleContract).filter(Boolean);
  }

  function setScheduledStreetContracts(runtimeApi, ownerId, assetKey, contracts, meta) {
    var ledger = getLedger(runtimeApi);
    if (!ledger || ownerId == null || !assetKey) return null;
    var nextContracts = Array.isArray(contracts)
      ? contracts.map(normalizeStreetScheduleContract).filter(Boolean)
      : [];
    if (!nextContracts.length) {
      ledger.clearAsset(ownerId, assetKey);
      return null;
    }
    return ledger.setAsset(ownerId, assetKey, nextContracts.length, Object.assign({
      contracts: nextContracts
    }, meta || {}));
  }

  function buildStreetSchedule(phase, options) {
    options = options || {};
    var currentStreetIndex = getStreetIndex(phase);
    var startOffset = Math.max(0, Number(options.startOffset || 0));
    var shotCount = Math.max(0, Number(options.shotCount || 0));
    var shotStreetIndices = [];
    for (var i = 0; i < shotCount; i++) {
      shotStreetIndices.push(Math.max(0, currentStreetIndex + startOffset + i));
    }
    return {
      createdStreetIndex: currentStreetIndex,
      includeCurrentStreet: options.includeCurrentStreet === true,
      shotStreetIndices: shotStreetIndices
    };
  }

  function createStreetEffectContract(phase, options) {
    options = options || {};
    var delayStreets = Math.max(0, Number(options.delayStreets || 0));
    var futureStageCount = Math.max(0, Number(options.futureStageCount || 0));
    var includeCurrentStreet = options.includeCurrentStreet === true;
    var contract = Object.assign({}, options.payload || {}, {
      createdStreetIndex: getStreetIndex(phase),
      includeCurrentStreet: includeCurrentStreet,
      waitStreets: delayStreets,
      stagesRemaining: futureStageCount,
      displayStagesRemaining: futureStageCount + ((includeCurrentStreet || delayStreets > 0) ? 1 : 0),
      consumeCurrentStreetOnResolve: includeCurrentStreet,
      crossHand: options.crossHand === true,
      firstInjectStreetIndex: Math.max(
        0,
        getStreetIndex(phase) + Math.max(1, delayStreets)
      ),
      firstInjectResolveSerial: state.streetResolvedSerial + Math.max(1, delayStreets + 1),
      lastInjectedStreetIndex: null,
      shotStreetIndices: [],
      injectedStreetIndices: []
    });
    if (!contract.id) {
      contract.id = 'street_contract_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    }
    return contract;
  }

  function clearScheduledStreetContracts(runtimeApi, ownerId, assetKey, options) {
    options = options || {};
    var keepCrossHand = options.keepCrossHand === true;
    var contracts = getScheduledStreetContracts(runtimeApi, ownerId, assetKey);
    var nextContracts = keepCrossHand
      ? contracts.filter(function(contract) {
          return contract && contract.crossHand === true;
        })
      : [];
    setScheduledStreetContracts(runtimeApi, ownerId, assetKey, nextContracts, options.meta || {});
    return nextContracts;
  }

  function countScheduledStreetStages(contract, phase) {
    var normalized = normalizeStreetScheduleContract(contract);
    if (!normalized) return 0;
    if (normalized.displayStagesRemaining > 0) return normalized.displayStagesRemaining;
    var currentStreetIndex = getStreetIndex(phase);
    var total = 0;
    for (var i = 0; i < normalized.shotStreetIndices.length; i++) {
      if (normalized.shotStreetIndices[i] >= currentStreetIndex) total += 1;
    }
    if (normalized.includeCurrentStreet && currentStreetIndex >= 0 && currentStreetIndex <= normalized.createdStreetIndex) {
      total += 1;
    }
    return total;
  }

  function collectDueStreetContracts(runtimeApi, ownerId, assetKey, phase) {
    var currentStreetIndex = getStreetIndex(phase);
    var currentResolveSerial = Number(state.streetResolvedSerial || 0);
    var contracts = getScheduledStreetContracts(runtimeApi, ownerId, assetKey);
    var due = [];
    var changed = false;
    for (var i = 0; i < contracts.length; i++) {
      var contract = contracts[i];
      if (!contract) continue;
      if (currentStreetIndex < 0) continue;
      if (contract.stagesRemaining > 0) {
        if (contract.waitStreets > 0) continue;
        if (currentStreetIndex < Number(contract.firstInjectStreetIndex || 0)) continue;
        if (currentResolveSerial < Number(contract.firstInjectResolveSerial || 0)) continue;
        if (contract.lastInjectedStreetIndex === currentStreetIndex) continue;
        contract.lastInjectedStreetIndex = currentStreetIndex;
        due.push(clone(contract));
        changed = true;
        continue;
      }
      if (contract.shotStreetIndices.indexOf(currentStreetIndex) === -1) continue;
      if (contract.injectedStreetIndices.indexOf(currentStreetIndex) !== -1) continue;
      contract.injectedStreetIndices.push(currentStreetIndex);
      due.push(clone(contract));
      changed = true;
    }
    if (changed) {
      setScheduledStreetContracts(runtimeApi, ownerId, assetKey, contracts, {
        phase: phase
      });
    }
    return due;
  }

  function pruneStreetContracts(runtimeApi, ownerId, assetKey, phase) {
    var currentStreetIndex = getStreetIndex(phase);
    var contracts = getScheduledStreetContracts(runtimeApi, ownerId, assetKey);
    var nextContracts = [];
    for (var i = 0; i < contracts.length; i++) {
      var contract = contracts[i];
      if (!contract) continue;
      if (contract.displayStagesRemaining > 0 || contract.stagesRemaining > 0 || contract.waitStreets > 0) {
        if (contract.consumeCurrentStreetOnResolve && contract.createdStreetIndex === currentStreetIndex) {
          contract.displayStagesRemaining = Math.max(0, contract.displayStagesRemaining - 1);
          contract.consumeCurrentStreetOnResolve = false;
        } else if (contract.waitStreets > 0) {
          contract.waitStreets = Math.max(0, contract.waitStreets - 1);
          contract.displayStagesRemaining = Math.max(0, contract.displayStagesRemaining - 1);
        } else if (contract.lastInjectedStreetIndex === currentStreetIndex && contract.stagesRemaining > 0) {
          contract.stagesRemaining = Math.max(0, contract.stagesRemaining - 1);
          contract.displayStagesRemaining = Math.max(0, contract.displayStagesRemaining - 1);
          contract.lastInjectedStreetIndex = null;
        }
        if (contract.displayStagesRemaining > 0 || contract.stagesRemaining > 0 || contract.waitStreets > 0) {
          nextContracts.push(contract);
        }
        continue;
      }
      contract.shotStreetIndices = contract.shotStreetIndices.filter(function(streetIndex) {
        return streetIndex > currentStreetIndex;
      });
      contract.injectedStreetIndices = contract.injectedStreetIndices.filter(function(streetIndex) {
        return streetIndex > currentStreetIndex;
      });
      if (contract.shotStreetIndices.length > 0) {
        nextContracts.push(contract);
      }
    }
    setScheduledStreetContracts(runtimeApi, ownerId, assetKey, nextContracts, {
      phase: phase
    });
    return nextContracts;
  }

  var ForceRuntime = {
    setRuntimeAPI: function(runtimeApi) {
      state.runtimeApi = runtimeApi || null;
      bindRuntimeFlow(state.runtimeApi);
    },

    getRuntimeAPI: function() {
      return state.runtimeApi || global.AceRuntimeAPI || null;
    },

    collectActiveForces: function(runtimeApi, options) {
      return snapshotRawForces(runtimeApi || this.getRuntimeAPI(), options);
    },

    resolveSnapshot: function(runtimeApi, options) {
      return resolveSnapshot(runtimeApi || this.getRuntimeAPI(), options);
    },

    getLastResolvedSnapshot: function() {
      return clone(state.lastResolvedSnapshot);
    },

    buildStreetReceivedTotals: function(runtimeApi, options) {
      options = options || {};
      var snapshot = Array.isArray(options.snapshot)
        ? options.snapshot
        : (Array.isArray(state.lastResolvedSnapshot) ? state.lastResolvedSnapshot : []);
      return clone(buildStreetReceivedTotals(snapshot, options));
    },

    getLastStreetReceivedTotals: function(options) {
      if (options && (options.excludeSources || options.excludeSkillKeys || options.excludeFlags || options.includeTypes)) {
        return clone(buildStreetReceivedTotals(state.lastResolvedSnapshot, options));
      }
      return clone(state.lastStreetReceivedTotals);
    },

    getLastPsycheEvents: function() {
      return clone(state.lastPsycheEvents);
    },

    getStreetIndex: function(phase) {
      return getStreetIndex(phase);
    },

    buildStreetSchedule: function(phase, options) {
      return clone(buildStreetSchedule(phase, options));
    },

    createStreetEffectContract: function(phase, options) {
      return clone(createStreetEffectContract(phase, options));
    },

    getScheduledStreetContracts: function(runtimeApi, ownerId, assetKey) {
      return clone(getScheduledStreetContracts(runtimeApi || this.getRuntimeAPI(), ownerId, assetKey));
    },

    setScheduledStreetContracts: function(runtimeApi, ownerId, assetKey, contracts, meta) {
      return setScheduledStreetContracts(runtimeApi || this.getRuntimeAPI(), ownerId, assetKey, contracts, meta);
    },

    collectDueStreetContracts: function(runtimeApi, ownerId, assetKey, phase) {
      return clone(collectDueStreetContracts(runtimeApi || this.getRuntimeAPI(), ownerId, assetKey, phase));
    },

    pruneStreetContracts: function(runtimeApi, ownerId, assetKey, phase) {
      return clone(pruneStreetContracts(runtimeApi || this.getRuntimeAPI(), ownerId, assetKey, phase));
    },

    clearScheduledStreetContracts: function(runtimeApi, ownerId, assetKey, options) {
      return clone(clearScheduledStreetContracts(runtimeApi || this.getRuntimeAPI(), ownerId, assetKey, options));
    },

    countScheduledStreetStages: function(contract, phase) {
      return countScheduledStreetStages(contract, phase);
    },

    getLastEvents: function() {
      return {
        queued: clone(state.lastQueued),
        removed: clone(state.lastRemoved),
        mutated: clone(state.lastMutated),
        replaced: clone(state.lastReplaced),
        streetResolved: clone(state.lastStreetResolved)
      };
    },

    clear: function() {
      state.lastQueued = null;
      state.lastRemoved = null;
      state.lastMutated = null;
      state.lastReplaced = null;
      state.lastStreetResolved = null;
      state.lastResolvedSnapshot = [];
      state.lastPsycheEvents = [];
      state.lastStreetReceivedTotals = null;
    }
  };

  global.ForceRuntime = ForceRuntime;
})(window);
