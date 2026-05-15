(function (global) {
  'use strict';

  var modules = global.AceSkillSystemModules = global.AceSkillSystemModules || {};
  var SkillSystem = modules.SkillSystem;
  var EFFECT = modules.EFFECT;
  if (!SkillSystem) throw new Error('AceSkillSystemModules.SkillSystem is not loaded');

  Object.assign(SkillSystem.prototype, {
    _isPlayerAvailable(player) {
      return !!(player && !player.folded && player.isActive !== false);
    },

    _getStatusMap(ownerId) {
      if (!this.statusMarks.has(ownerId)) this.statusMarks.set(ownerId, {});
      return this.statusMarks.get(ownerId);
    },

    setStatusMark(ownerId, key, payload) {
      if (ownerId == null || !key) return;
      const marks = this._getStatusMap(ownerId);
      marks[key] = Object.assign({}, marks[key] || {}, payload || {}, { key: key });
      this.emit('status:mark', { ownerId: ownerId, key: key, payload: marks[key] });
    },

    clearStatusMark(ownerId, key) {
      const marks = this.statusMarks.get(ownerId);
      if (!marks || !marks[key]) return;
      delete marks[key];
      if (Object.keys(marks).length === 0) this.statusMarks.delete(ownerId);
      this.emit('status:clear', { ownerId: ownerId, key: key });
    },

    clearAllStatusMarks() {
      if (this.statusMarks.size === 0) return;
      const ownerIds = Array.from(this.statusMarks.keys());
      this.statusMarks.clear();
      this.emit('status:clear_all', { ownerIds: ownerIds });
    },

    setAssetModifiers(modifiers, adapter) {
      this.assetDeckAdapter = adapter || this.assetDeckAdapter || global.AssetDeckAdapter || null;
      this.assetModifiers = modifiers || null;
    },

    _resetAssetPassiveHandState() {
      this._assetPassiveState = {
        handId: (this._assetPassiveState && this._assetPassiveState.handId || 0) + 1,
        used: {}
      };
    },

    _markAssetPassiveUsed(runtimeKey, payload) {
      if (!runtimeKey) return;
      if (!this._assetPassiveState) this._resetAssetPassiveHandState();
      if (!this._assetPassiveState.used) this._assetPassiveState.used = {};
      this._assetPassiveState.used[runtimeKey] = Object.assign({ used: true }, payload || {});
    },

    _emitAssetPassiveTriggered(event) {
      if (!event) return;
      this._log('ASSET_PASSIVE_TRIGGERED', {
        cardId: event.cardId || null,
        trigger: event.trigger || null,
        value: event.value,
        ownerId: event.ownerId
      });
      this.emit('asset:passive', Object.assign({}, event));
    },

    _applyAssetPassiveTriggers(trigger, context) {
      if (!this.assetDeckAdapter || typeof this.assetDeckAdapter.resolvePassiveTriggers !== 'function') return [];
      var events = this.assetDeckAdapter.resolvePassiveTriggers(this.assetModifiers, trigger, Object.assign({
        heroId: this._heroId != null ? this._heroId : 0,
        passiveState: this._assetPassiveState
      }, context || {}));
      if (!Array.isArray(events) || !events.length) return [];

      for (var i = 0; i < events.length; i++) {
        var event = events[i];
        if (!event) continue;
        var eventPoolId = event.manaPoolId != null ? event.manaPoolId : event.ownerId;
        if (event.trigger === 'street_start_mana_gain') {
          var before = this.getMana(eventPoolId).current;
          this.regenMana(eventPoolId, Math.max(0, Number(event.value || 0)), 'asset_passive:street_start_mana_gain');
          var after = this.getMana(eventPoolId).current;
          event.actualValue = Math.max(0, after - before);
          this._emitAssetPassiveTriggered(event);
        } else if (event.trigger === 'once_per_hand_fortune_flat') {
          var force = this._queuePendingForce({
            ownerId: event.ownerId,
            manaPoolId: this._resolveManaPoolId(eventPoolId),
            type: 'fortune',
            system: 'moirai',
            skillKey: 'asset_passive',
            source: 'asset',
            power: Math.max(0, Number(event.value || 0)),
            _assetPassive: true,
            _assetSourceCardId: event.cardId
          }, { reason: 'asset_passive', cardId: event.cardId, trigger: event.trigger });
          event.forceId = force && force._runtimeId || null;
          this._markAssetPassiveUsed(event.runtimeKey, event);
          this._emitAssetPassiveTriggered(event);
        } else if (event.trigger === 'street_force_chance_flat') {
          var type = event.forceType || (event.system === 'chaos' ? 'curse' : (event.system === 'psyche' ? 'psyche' : 'fortune'));
          var passiveForce = this._queuePendingForce({
            ownerId: event.ownerId,
            type: type,
            system: event.system || (type === 'curse' ? 'chaos' : (type === 'psyche' ? 'psyche' : 'moirai')),
            skillKey: 'asset_passive',
            source: 'asset',
            power: Math.max(0, Number(event.value || 0)),
            shield: event.shield === true,
            randomTarget: event.randomTarget === true,
            _assetPassive: true,
            _assetSourceCardId: event.cardId
          }, { reason: 'asset_passive', cardId: event.cardId, trigger: event.trigger });
          event.forceId = passiveForce && passiveForce._runtimeId || null;
          this._emitAssetPassiveTriggered(event);
        }
      }
      return events;
    },

    _consumeAssetCostPassives(skill) {
      var triggers = skill && skill._assetCost && Array.isArray(skill._assetCost.passiveTriggers)
        ? skill._assetCost.passiveTriggers
        : [];
      for (var i = 0; i < triggers.length; i++) {
        var event = triggers[i];
        this._markAssetPassiveUsed(event.runtimeKey, event);
        this._emitAssetPassiveTriggered(event);
      }
    },

    _getAssetSkillLevelEntries(skillKey) {
      var normalizedKey = String(skillKey || '').trim().toLowerCase();
      var entries = this.assetModifiers && Array.isArray(this.assetModifiers.skillLevelEntries)
        ? this.assetModifiers.skillLevelEntries
        : [];
      return entries.filter(function(entry) {
        return String(entry && entry.skillKey || '').trim().toLowerCase() === normalizedKey;
      });
    },

    _makeManaPoolId(ownerId, slot, seat) {
      var cleanSlot = String(slot || 'default').trim().toLowerCase() || 'default';
      if (seat) return 'seat:' + String(seat) + ':' + cleanSlot;
      if (cleanSlot === 'vanguard' || cleanSlot === 'rearguard') return 'hero:' + cleanSlot;
      return 'owner:' + String(ownerId) + ':' + cleanSlot;
    },

    _addOwnerManaPool(ownerId, poolId, isDefault) {
      if (ownerId == null || !poolId) return;
      var key = String(ownerId);
      var list = this.ownerManaPools.get(key) || [];
      if (list.indexOf(poolId) < 0) list.push(poolId);
      if (isDefault && list[0] !== poolId) {
        list = [poolId].concat(list.filter(function(id) { return id !== poolId; }));
      }
      this.ownerManaPools.set(key, list);
    },

    _resolveManaPoolId(ownerOrPoolId) {
      if (ownerOrPoolId == null) return null;
      var direct = String(ownerOrPoolId);
      if (this.manaPools.has(direct)) return direct;
      if (this.manaPools.has(ownerOrPoolId)) return ownerOrPoolId;
      var list = this.ownerManaPools.get(String(ownerOrPoolId));
      return list && list.length ? list[0] : null;
    },

    _getSkillManaPoolId(skill) {
      if (!skill) return null;
      return this._resolveManaPoolId(skill.manaPoolId != null ? skill.manaPoolId : skill.ownerId);
    },

    _getSkillManaPool(skill) {
      var poolId = this._getSkillManaPoolId(skill);
      return poolId ? this.manaPools.get(poolId) : null;
    },

    hasStatusMark(ownerId, key) {
      const marks = this.statusMarks.get(ownerId);
      return !!(marks && marks[key]);
    },

    getStatusMarks(ownerId) {
      const marks = this.statusMarks.get(ownerId);
      return marks ? Object.assign({}, marks) : {};
    },

    isMatchScopedUsed(scopeKey) {
      return !!(scopeKey && this.matchScopedUses.has(String(scopeKey)));
    },

    getMatchScopedUse(scopeKey) {
      if (!scopeKey) return null;
      const payload = this.matchScopedUses.get(String(scopeKey));
      return payload ? Object.assign({}, payload) : null;
    },

    consumeMatchScopedUse(scopeKey, payload) {
      if (!scopeKey) return false;
      const key = String(scopeKey);
      if (this.matchScopedUses.has(key)) return false;
      const record = Object.assign({
        key: key,
        consumedAt: Date.now()
      }, payload || {});
      this.matchScopedUses.set(key, record);
      this.emit('match_scope:consumed', record);
      return true;
    },

    clearMatchScopedUses() {
      if (this.matchScopedUses.size === 0) return;
      const keys = Array.from(this.matchScopedUses.keys());
      this.matchScopedUses.clear();
      this.emit('match_scope:cleared', { keys: keys });
    },

    on(event, callback) {
      if (!this._hooks[event]) this._hooks[event] = [];
      this._hooks[event].push(callback);
      return () => {
        this._hooks[event] = this._hooks[event].filter(cb => cb !== callback);
      };
    },

    emit(event, data) {
      const handlers = this._hooks[event];
      if (handlers) {
        for (const h of handlers) {
          try { h(data); } catch (e) { console.error('[SkillSystem] Hook error:', event, e); }
        }
      }
      this._emitRuntimeEvent(event, data);
    },

    setRuntimeFlow(runtimeFlow) {
      this.runtimeFlow = runtimeFlow || null;
    },

    _emitRuntimeEvent(event, data) {
      if (!this.runtimeFlow || typeof this.runtimeFlow.emit !== 'function') return;
      this.runtimeFlow.emit(event, data);
    },

    _emitSkillActivated(payload, options) {
      var next = Object.assign({}, payload || {});
      if (next.skill && next.activationId == null) {
        next.activationId = next.skill._activationId || null;
      }
      if (options) {
        next.options = Object.assign({}, options);
        var gameContext = options.gameContext || null;
        if (next.phase == null && gameContext && gameContext.phase != null) {
          next.phase = gameContext.phase;
        }
        if (next.pot == null && gameContext && gameContext.pot != null) {
          next.pot = gameContext.pot;
        }
        if (!Array.isArray(next.board) && gameContext && Array.isArray(gameContext.board)) {
          next.board = gameContext.board.slice();
        }
      }
      this._emitRuntimeEvent('skill:activated', next);
      this.emit('skill:activated', next);
    },

    _snapshotForce(force) {
      return force ? Object.assign({}, force) : null;
    },

    _queuePendingForce(force, meta) {
      if (!force) return null;
      if (!force._runtimeId) {
        this._forceSerial += 1;
        force._runtimeId = 'force_' + this._forceSerial;
      }
      this.pendingForces.push(force);
      this.emit('force:queued', {
        force: this._snapshotForce(force),
        meta: meta || null
      });
      return force;
    },

    _removePendingForces(predicate, meta) {
      var removed = [];
      var kept = [];
      for (var i = 0; i < this.pendingForces.length; i++) {
        var force = this.pendingForces[i];
        if (predicate(force, i)) {
          removed.push(force);
        } else {
          kept.push(force);
        }
      }
      this.pendingForces = kept;
      for (var j = 0; j < removed.length; j++) {
        this.emit('force:removed', {
          force: this._snapshotForce(removed[j]),
          meta: meta || null
        });
      }
      return removed;
    },

    _mutatePendingForce(force, before, meta) {
      if (!force) return force;
      this.emit('force:mutated', {
        before: this._snapshotForce(before || force),
        after: this._snapshotForce(force),
        meta: meta || null
      });
      return force;
    },

    _replacePendingForces(nextForces, meta) {
      var previous = Array.isArray(this.pendingForces) ? this.pendingForces.slice() : [];
      this.pendingForces = Array.isArray(nextForces) ? nextForces : [];
      this.emit('forces:replaced', {
        before: previous.map(this._snapshotForce.bind(this)),
        after: this.pendingForces.map(this._snapshotForce.bind(this)),
        meta: meta || null
      });
      return this.pendingForces;
    },

    _isSelfProtectEffect(effect) {
      return effect === EFFECT.PSYCHE ||
        effect === EFFECT.VOID ||
        effect === EFFECT.HEART_READ ||
        effect === EFFECT.CLAIRVOYANCE;
    },

    _defaultSelectSkillTarget(input) {
      var options = input && input.options ? input.options : {};
      if (options.targetId != null) return options.targetId;
      var skill = input && input.skill ? input.skill : {};
      var gameContext = input && input.ctx ? input.ctx : null;
      if ((skill.effect === EFFECT.CURSE ||
          skill.effect === EFFECT.BENEDICTION ||
          skill.effect === EFFECT.COOLER ||
          skill.effect === EFFECT.SKILL_SEAL) &&
          this.curseTargetFn) {
        return this.curseTargetFn(skill.ownerId, gameContext && gameContext.players);
      }
      return null;
    },

    _defaultSelectProtectTarget(input) {
      var options = input && input.options ? input.options : {};
      if (options.protectId != null) return options.protectId;
      var skill = input && input.skill ? input.skill : {};
      return this._isSelfProtectEffect(skill.effect) ? skill.ownerId : null;
    },

    _defaultAugmentSkillOptions(input) {
      return Object.assign({}, (input && input.options) || {});
    }
  });
})(typeof window !== 'undefined' ? window : global);
