(function (global) {
  'use strict';

  var modules = global.AceSkillSystemModules = global.AceSkillSystemModules || {};
  var SkillSystem = modules.SkillSystem;
  var ACTIVATION = modules.ACTIVATION;
  if (!SkillSystem) throw new Error('AceSkillSystemModules.SkillSystem is not loaded');

  Object.assign(SkillSystem.prototype, {
    onRoundEnd(gameContext) {
      // 注意：pendingForces 不在这里清除！
      // 它们会在 mozSelectAndPick() 发牌后清除，
      // 确保玩家在下注阶段激活的技能能在下一次发牌时生效。
      // 先发街末结算事件，让 Runtime 角色以“本街结束时的真实状态”结算。
      // 例如 POPPY 的街末判定不应先吃到自然回蓝。
      this.emit('round:end', {});
      this.emit('street:resolved', {
        phase: gameContext && gameContext.phase ? gameContext.phase : null,
        pot: gameContext && gameContext.pot != null ? gameContext.pot : null,
        board: gameContext && Array.isArray(gameContext.board) ? gameContext.board.slice() : [],
        allIn: !!(gameContext && gameContext.allIn),
        pendingForces: this.pendingForces.map(this._snapshotForce.bind(this))
      });

      // 街末角色效果完成后，再恢复所有 mana。
      this.regenAllMana();

      // 注意：toggle 技能（如绝缘）不在回合结束时重置
      // 它们由玩家手动切换开/关，跨手牌保持状态

      // 冷却按「阶段」递减：一回合 = 一个德州阶段 (preflop/flop/turn/river)
      // cooldown=2 意味着 2 个阶段后可用，skill_seal duration=2 意味着 2 个阶段后解封
      for (const [, skill] of this.skills) {
        if (skill.currentCooldown > 0) {
          skill.currentCooldown--;
        }
      }
    },

    onNewHand() {
      this._resetAssetPassiveHandState();
      var preservedForces = Array.isArray(this.pendingForces)
        ? this.pendingForces.filter(function(force) {
            return !!(force && force._persistAcrossHandStart);
          })
        : [];
      this.pendingForces = preservedForces;
      this.clearAllStatusMarks();
      this._clearStreetScopedUses();

      // 重置所有非 passive/toggle 技能状态
      // Toggle 技能跨手牌保持状态，由玩家手动切换
      for (const [, skill] of this.skills) {
        if (skill.activation !== ACTIVATION.PASSIVE && skill.activation !== ACTIVATION.TOGGLE) {
          skill.active = false;
        }
        skill._sealed = 0;
        if (skill.usesPerGame > 0) {
          skill.gameUsesRemaining = skill.usesPerGame;
        }
        // 注意：冷却不在这里重置，跨手牌保留剩余CD
        // cooldown 在 onRoundEnd() 按阶段递减
      }

      this._advanceBacklashStreet('preflop');
      this.emit('hand:start', {});
      this._applyAssetPassiveTriggers('hand_start', { phase: 'preflop' });
      this._applyAssetPassiveTriggers('street_start', { phase: 'preflop' });
    },

    onStreetStart(phase) {
      this._advanceBacklashStreet(phase || null);
      this._clearStreetScopedUses();
      this.emit('street:start', {
        phase: phase || null
      });
      this._applyAssetPassiveTriggers('street_start', { phase: phase || null });
    },

    reset() {
      this.pendingForces = [];
      this.backlash = { active: false, counter: 0 };
      this.backlashStates.clear();
      if (this.assetLedger && typeof this.assetLedger.clearAll === 'function') {
        this.assetLedger.clearAll();
      }
      this.clearMatchScopedUses();
      this._clearStreetScopedUses();
      this._resetAssetPassiveHandState();

      for (const [, pool] of this.manaPools) {
        pool.current = pool.max;
      }

      for (const [, skill] of this.skills) {
        skill.active = (skill.activation === ACTIVATION.PASSIVE);
        skill.currentCooldown = 0;
        // 重置整局使用次数
        if (skill.usesPerGame > 0) {
          skill.gameUsesRemaining = skill.usesPerGame;
        }
      }

      this.emit('system:reset', {});
    },

    getState() {
      const heroId = this._heroId != null ? this._heroId : 0;
      const rinoMana = this.getMana(heroId);
      const manaPools = Array.from(this.manaPools.entries()).map(entry => ({
        id: entry[0],
        ownerId: entry[1].ownerId,
        ownerName: entry[1].ownerName,
        casterName: entry[1].casterName,
        casterSlot: entry[1].casterSlot,
        casterRoleId: entry[1].casterRoleId,
        current: entry[1].current,
        max: entry[1].max,
        regen: entry[1].regen,
        baseMax: entry[1].baseMax,
        assetMax: entry[1].assetMax || null
      }));
      return {
        backlash: { ...this.backlash },
        rinoMana: rinoMana.current,
        rinoManaMax: rinoMana.max,
        manaPools: manaPools,
        pendingForces: this.pendingForces.map(f => ({
          owner: f.ownerName, ownerId: f.ownerId, type: f.type, level: f.level, system: f.system, power: f.power
        })),
        skills: Array.from(this.skills.values()).map(s => ({
          uniqueId: s.uniqueId,
          owner: s.ownerName,
          ownerId: s.ownerId,
          caster: s.casterName,
          casterName: s.casterName,
          casterSlot: s.casterSlot || 'default',
          casterRoleId: s.casterRoleId || null,
          manaPoolId: s.manaPoolId || null,
          key: s.skillKey,
          effect: s.effect,
          level: s.level,
          system: s.system,
          kind: s.kind,
          activation: s.activation,
          active: s.active,
          manaCost: this._getSkillActualManaCost(s, {}),
          baseManaCost: s.baseManaCost != null ? s.baseManaCost : s.manaCost,
          assetCost: s._assetCost || null,
          assetCards: Array.isArray(s.assetCards) ? s.assetCards.slice() : [],
          cooldown: s.currentCooldown,
          sealed: Math.max(0, Number(s._sealed || 0)),
          _sealed: Math.max(0, Number(s._sealed || 0)),
          usesPerGame: s.usesPerGame || 0,
          gameUsesRemaining: s.gameUsesRemaining != null ? s.gameUsesRemaining : 0,
          usesPerStreet: s.usesPerStreet || 0,
          streetUses: this._getStreetScopedUseCount(s)
        })),
        matchScopedUses: Array.from(this.matchScopedUses.entries()).map(entry => ({
          key: entry[0],
          payload: Object.assign({}, entry[1])
        })),
      };
    },

    getForcesSummary() {
      const summary = { allies: [], enemies: [], total: { ally: 0, enemy: 0 } };

      // 被动力
      for (const [, skill] of this.skills) {
        if (!skill.active) continue;
        if (skill.activation !== ACTIVATION.PASSIVE) continue;

        const entry = { name: skill.ownerName, type: skill.effect, level: skill.level, power: skill.power };
        const hid4 = this._heroId != null ? this._heroId : 0;
        if (skill.ownerId === hid4) {
          summary.allies.push(entry);
          summary.total.ally += entry.power;
        } else {
          summary.enemies.push(entry);
          summary.total.enemy += entry.power;
        }
      }

      // pending forces
      for (const f of this.pendingForces) {
        if (f.type === 'void' && f.skillKey === 'reality') continue;
        const entry = { name: f.ownerName, type: f.type, level: f.level, power: f.power };
        const hid5 = this._heroId != null ? this._heroId : 0;
        if (f.ownerId === hid5) {
          summary.allies.push(entry);
          summary.total.ally += entry.power;
        } else {
          summary.enemies.push(entry);
          summary.total.enemy += entry.power;
        }
      }

      return summary;
    },

    getPlayerSkills(ownerId) {
      return Array.from(this.skills.values()).filter(s => s.ownerId === ownerId);
    },

    hasPurgeActive() {
      return false;
    },

    _log(type, data) {
      if (this.onLog) this.onLog(type, data);
      console.log(`[SkillSystem] ${type}`, data);
    }
  });
})(typeof window !== 'undefined' ? window : global);
