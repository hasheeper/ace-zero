(function (global) {
  'use strict';

  var modules = global.AceSkillSystemModules = global.AceSkillSystemModules || {};
  var SkillSystem = modules.SkillSystem;
  if (!SkillSystem) throw new Error('AceSkillSystemModules.SkillSystem is not loaded');

  Object.assign(SkillSystem.prototype, {
    _getStreetScopedSkillKey(skill) {
      if (!skill) return null;
      return skill.uniqueId
        ? String(skill.uniqueId)
        : [skill.ownerId, skill.manaPoolId || skill.casterSlot || 'default', skill.skillKey].map(String).join('_');
    },

    _getStreetScopedUseCount(skill) {
      const key = this._getStreetScopedSkillKey(skill);
      if (!key) return 0;
      return Math.max(0, Number(this.streetScopedUses.get(key) || 0));
    },

    _consumeStreetScopedUse(skill) {
      const key = this._getStreetScopedSkillKey(skill);
      if (!key) return;
      this.streetScopedUses.set(key, this._getStreetScopedUseCount(skill) + 1);
    },

    _clearStreetScopedUses() {
      this.streetScopedUses.clear();
    },

    getMana(ownerId) {
      var poolId = this._resolveManaPoolId(ownerId);
      return poolId ? this.manaPools.get(poolId) : { current: 0, max: 0, regen: 0 };
    },

    getManaPool(poolId) {
      var resolved = this._resolveManaPoolId(poolId);
      return resolved ? this.manaPools.get(resolved) : { current: 0, max: 0, regen: 0 };
    },

    getManaPoolsForOwner(ownerId) {
      var list = this.ownerManaPools.get(String(ownerId)) || [];
      return list.map((poolId) => this.manaPools.get(poolId)).filter(Boolean);
    },

    _getBacklashState(poolId) {
      const state = this.backlashStates.get(poolId);
      return state
        ? { active: !!state.active, counter: Math.max(0, Number(state.counter || 0)) }
        : { active: false, counter: 0 };
    },

    _syncHeroBacklashState() {
      const heroId = this._heroId != null ? this._heroId : 0;
      var pools = this.getManaPoolsForOwner(heroId);
      var active = pools.map((pool) => this._getBacklashState(pool.id)).filter(function(state) { return state.active; });
      this.backlash = active.length
        ? { active: true, counter: Math.max.apply(Math, active.map(function(state) { return state.counter; })) }
        : { active: false, counter: 0 };
    },

    _syncBacklashMark(poolId) {
      const pool = this.manaPools.get(poolId);
      const ownerId = pool && pool.ownerId != null ? pool.ownerId : poolId;
      const markKey = 'backlash_state:' + String(poolId);
      const state = this._getBacklashState(poolId);
      if (!state.active || state.counter <= 0) {
        this.clearStatusMark(ownerId, markKey);
        return;
      }
      this.setStatusMark(ownerId, markKey, {
        icon: '../../../assets/svg/burning-skull.svg',
        iconMode: 'mask',
        tone: 'backlash',
        count: state.counter,
        title: '魔运反噬' + (pool && pool.casterName ? ' · ' + pool.casterName : ''),
        detail: '持续 ' + state.counter + ' 街'
      });
    },

    _triggerBacklash(poolId, reason) {
      poolId = this._resolveManaPoolId(poolId) || poolId;
      if (poolId == null) return;
      const pool = this.manaPools.get(poolId) || {};
      const heroId = this._heroId != null ? this._heroId : 0;
      const wasHeroActive = pool.ownerId === heroId ? !!this.backlash.active : false;
      this.backlashStates.set(poolId, { active: true, counter: 3 });
      this._syncBacklashMark(poolId);
      this._syncHeroBacklashState();
      this._log('BACKLASH_TRIGGERED', {
        ownerId: pool.ownerId,
        manaPoolId: poolId,
        casterRoleId: pool.casterRoleId || null,
        casterSlot: pool.casterSlot || null,
        duration: 3,
        reason: reason || 'mana_zero'
      });
      if (pool.ownerId === heroId) {
        this.emit('backlash:start', {
          ownerId: pool.ownerId,
          manaPoolId: poolId,
          counter: 3,
          reason: reason || 'mana_zero',
          refreshed: wasHeroActive
        });
      }
    },

    _maybeTriggerBacklash(poolId, previous, current, reason) {
      const prev = Math.max(0, Number(previous || 0));
      const next = Math.max(0, Number(current || 0));
      if (prev <= 0 || next > 0) return;
      this._triggerBacklash(poolId, reason);
    },

    _advanceBacklashStreet(phase) {
      for (const [poolId, state] of Array.from(this.backlashStates.entries())) {
        const pool = this.manaPools.get(poolId) || {};
        if (!state || !state.active || state.counter <= 0) {
          this.backlashStates.delete(poolId);
          this._syncBacklashMark(poolId);
          continue;
        }
        state.counter--;
        if (state.counter <= 0) {
          state.active = false;
          this.backlashStates.delete(poolId);
          this._syncBacklashMark(poolId);
          const heroId = this._heroId != null ? this._heroId : 0;
          if (pool.ownerId === heroId) {
            this._syncHeroBacklashState();
            this.emit('backlash:end', { ownerId: pool.ownerId, manaPoolId: poolId, phase: phase || null });
          }
        } else {
          this.backlashStates.set(poolId, state);
          this._syncBacklashMark(poolId);
        }
        this._log('BACKLASH_TICK', {
          ownerId: pool.ownerId,
          manaPoolId: poolId,
          phase: phase || null,
          remaining: Math.max(0, state.counter)
        });
      }
      this._syncHeroBacklashState();
    },

    spendMana(poolId, amount) {
      const resolvedPoolId = this._resolveManaPoolId(poolId);
      const pool = resolvedPoolId ? this.manaPools.get(resolvedPoolId) : null;
      if (!pool || pool.current < amount) return false;
      const before = pool.current;
      pool.current -= amount;
      this._log('MANA_SPENT', {
        ownerId: pool.ownerId,
        manaPoolId: resolvedPoolId,
        casterRoleId: pool.casterRoleId || null,
        casterSlot: pool.casterSlot || null,
        amount,
        remaining: pool.current
      });
      this.emit('mana:changed', {
        ownerId: pool.ownerId,
        manaPoolId: resolvedPoolId,
        casterRoleId: pool.casterRoleId || null,
        casterSlot: pool.casterSlot || null,
        previous: before,
        current: pool.current,
        max: pool.max,
        reason: 'skill_cost'
      });
      return true;
    },

    regenMana(poolId, amount, reason) {
      const resolvedPoolId = this._resolveManaPoolId(poolId);
      const pool = resolvedPoolId ? this.manaPools.get(resolvedPoolId) : null;
      if (!pool) return;
      const before = pool.current;
      let add = (amount != null) ? amount : pool.regen;
      if (amount == null && this.traitRegenFn) {
        add = this.traitRegenFn(pool.ownerId, add, pool);
      }
      pool.current = Math.max(0, Math.min(pool.max, pool.current + add));
      const finalReason = reason || (amount != null ? 'runtime_regen' : 'street_regen');
      if (pool.current !== before) {
        this._log('MANA_GAINED', {
          ownerId: pool.ownerId,
          manaPoolId: resolvedPoolId,
          casterRoleId: pool.casterRoleId || null,
          casterSlot: pool.casterSlot || null,
          amount: pool.current - before,
          current: pool.current,
          reason: finalReason
        });
      }
      this.emit('mana:changed', {
        ownerId: pool.ownerId,
        manaPoolId: resolvedPoolId,
        casterRoleId: pool.casterRoleId || null,
        casterSlot: pool.casterSlot || null,
        previous: before,
        current: pool.current,
        max: pool.max,
        reason: finalReason
      });
    },

    loseMana(poolId, amount, reason) {
      const resolvedPoolId = this._resolveManaPoolId(poolId);
      const pool = resolvedPoolId ? this.manaPools.get(resolvedPoolId) : null;
      if (!pool) return 0;
      const loss = Math.max(0, Math.round(Number(amount || 0)));
      const before = pool.current;
      pool.current = Math.max(0, before - loss);
      this.emit('mana:changed', {
        ownerId: pool.ownerId,
        manaPoolId: resolvedPoolId,
        casterRoleId: pool.casterRoleId || null,
        casterSlot: pool.casterSlot || null,
        previous: before,
        current: pool.current,
        max: pool.max,
        reason: reason || 'runtime_penalty'
      });
      this._log('MANA_LOST', {
        ownerId: pool.ownerId,
        manaPoolId: resolvedPoolId,
        casterRoleId: pool.casterRoleId || null,
        casterSlot: pool.casterSlot || null,
        amount: before - pool.current,
        current: pool.current,
        reason: reason || 'runtime_penalty'
      });
      return before - pool.current;
    },

    regenAllMana() {
      for (const [id] of this.manaPools) {
        this.regenMana(id);
      }
    }
  });
})(typeof window !== 'undefined' ? window : global);
