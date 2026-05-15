(function (global) {
  'use strict';

  var modules = global.AceSkillSystemModules = global.AceSkillSystemModules || {};
  var SkillSystem = modules.SkillSystem;
  var ACTIVATION = modules.ACTIVATION;
  var EFFECT = modules.EFFECT;
  var SKILL_SYSTEM = modules.SKILL_SYSTEM;
  var PHASE_INDEX = modules.PHASE_INDEX;
  if (!SkillSystem) throw new Error('AceSkillSystemModules.SkillSystem is not loaded');

  Object.assign(SkillSystem.prototype, {
    checkTriggers(gameContext) {
      for (const [, skill] of this.skills) {
        if (skill.activation !== ACTIVATION.TRIGGERED) continue;
        if (!skill.trigger) continue;
        const availability = this.getSkillAvailability(skill, gameContext, {
          allowTriggered: true,
          allowOutOfTurn: true,
          resolveOptions: false,
          skipOptionValidation: true
        });
        if (!availability.ok) continue;
        // 已弃牌不触发
        const owner = gameContext.players ? gameContext.players.find(p => p.id === skill.ownerId) : null;
        if (owner && !this._isPlayerAvailable(owner)) continue;

        let shouldActivate = false;

        switch (skill.trigger.condition) {
          case 'runtime_only': {
            // 由 Runtime 模块独占触发；主流程不再兜底。
            shouldActivate = false;
            break;
          }
          case 'chips_below': {
            if (owner && owner.chips < (skill.trigger.value || 200)) shouldActivate = true;
            break;
          }
          case 'chips_percent_below': {
            // 筹码低于起始筹码的 X%（如 0.10 = 10%）
            if (owner) {
              const baselineChips = owner.initialChips || owner.startingChips || owner.baseChips || ((owner.chips || 0) + (owner.totalBet || 0));
              const threshold = baselineChips > 0 ? skill.trigger.value || 0.10 : 0;
              if (baselineChips > 0 && owner.chips <= baselineChips * threshold) shouldActivate = true;
            }
            break;
          }
          case 'chips_above': {
            if (owner && owner.chips > (skill.trigger.value || 2000)) shouldActivate = true;
            break;
          }
          case 'pot_above': {
            if (gameContext.pot > (skill.trigger.value || 500)) shouldActivate = true;
            break;
          }
          case 'phase': {
            if (gameContext.phase === skill.trigger.value) shouldActivate = true;
            break;
          }
          case 'random_chance': {
            // 每轮随机触发（如 0.25 = 25%）
            shouldActivate = Math.random() < (skill.trigger.value || 0.25);
            break;
          }
        }

        if (shouldActivate && !skill.active) {
          skill.active = true;
          // 触发技能产生 force
          this._queuePendingForce(this._skillToForce(skill, gameContext), {
            reason: 'skill_triggered',
            effect: skill.effect
          });
          // 设置冷却和次数
          skill.currentCooldown = skill.cooldown;
          if (skill.usesPerGame > 0) skill.gameUsesRemaining--;
          this._log('SKILL_TRIGGERED', {
            owner: skill.ownerName, key: skill.skillKey,
            condition: skill.trigger.condition, power: skill.power
          });
          this.emit('skill:triggered', { skill });
        } else if (!shouldActivate && skill.active) {
          skill.active = false;
        }
      }
    },

    collectActiveForces(gameContext) {
      const forces = [];
      // 构建弃牌玩家 id 集合
      const foldedIds = new Set();
      if (gameContext && gameContext.players) {
        for (const p of gameContext.players) {
          if (!this._isPlayerAvailable(p)) foldedIds.add(p.id);
        }
      }

      // 1. 反噬
      for (const [ownerId, state] of Array.from(this.backlashStates.entries())) {
        if (!state || !state.active || state.counter <= 0) continue;
        forces.push({
          ownerId: -1,
          ownerName: 'SYSTEM',
          type: 'backlash',
          level: 5,
          power: 50,
          targetId: ownerId,
          source: 'backlash'
        });
      }

      // 2. 被动技能（passive, active=true）— 弃牌者不生效
      for (const [, skill] of this.skills) {
        if (!skill.active) continue;
        if (skill.activation !== ACTIVATION.PASSIVE && skill.activation !== ACTIVATION.TOGGLE) continue;
        if (foldedIds.has(skill.ownerId)) continue;

        forces.push(this._skillToForce(skill, gameContext));
      }

      // 3. 本回合 pending forces（主动技能 + NPC 技能 + triggered）
      // 弃牌者的 pending forces 也应失效
      for (const f of this.pendingForces) {
        if (foldedIds.has(f.ownerId) && !f._persistAfterOwnerFold) continue;
        forces.push(f);
      }

      return forces;
    },

    _skillToForce(skill, gameContext) {
      // fortune 类专属技能 → fortune type (MoZ 只认 fortune/curse)
      const FORTUNE_EFFECTS = ['royal_decree', 'miracle', 'lucky_find', 'absolution', 'benediction'];
      const forceType = skill.kind || (FORTUNE_EFFECTS.indexOf(skill.effect) >= 0 ? 'fortune' : skill.effect);
      const force = {
        ownerId: skill.ownerId,
        ownerName: skill.ownerName,
        type: forceType,
        system: skill.system || null,
        kind: skill.kind || forceType,
        power: skill.power || 0,
        effectivePower: skill.power || 0,
        level: skill.level || null,
        maxLevel: skill.maxLevel || null,
        matrix: Array.isArray(skill.matrix) ? skill.matrix.slice(0, 3) : null,
        lockChance: skill.lockChance || 0,
        special: Object.assign({}, skill.special || {}),
        activationId: skill._activationId || null,
        activation: skill.activation,
        source: skill.activation,
        skillKey: skill.skillKey
      };
      if (Array.isArray(skill._assetRiskRolls) && skill._assetRiskRolls.length) {
        force._assetRiskRolls = skill._assetRiskRolls.slice();
      }

      // Curse 单体指向：委托外部 AI 选目标
      if (skill.effect === 'curse' && this.curseTargetFn) {
        const players = gameContext ? gameContext.players : null;
        force.targetId = this.curseTargetFn(skill.ownerId, players);
      }

      return force;
    },

    _isVoidForce(force) {
      return !!(force && (force.type === EFFECT.VOID || force.system === SKILL_SYSTEM.VOID));
    },

    _isRealityTemporaryAssetKey(key) {
      const value = String(key || '');
      if (!value) return false;
      const exactKeys = {
        vv_positions: true,
        bubble_fortune: true,
        bubble_chaos: true,
        bubble_mana: true,
        vv_bubble_mark: true,
        trixie_wild_card: true,
        trixie_rewrite_queue: true,
        trixie_rewrite_delay: true,
        trixie_rewrite_extend: true,
        trixie_blind_box: true,
        trixie_street_fortune: true,
        trixie_street_curse: true,
        trixie_street_raw_fortune: true,
        trixie_street_raw_curse: true,
        trixie_street_bonus: true,
        cota_cards: true,
        cota_slot_count: true,
        cota_empty_slots: true,
        cota_good_cards: true,
        cota_bad_cards: true,
        cota_misc_cards: true,
        cota_fault_state: true,
        cota_self_curse_pressure: true,
        cota_new_card_cost_delta: true,
        cota_first_bust_bonus: true,
        kako_red_seal: true,
        kako_ruling_pending: true,
        kako_street_fortune: true,
        kako_street_curse: true,
        kako_last_mana_delta: true,
        kako_used_t0: true,
        kako_ruling_contract: true,
        kako_redline_rate: true,
        poppy_miracle_mark: true,
        poppy_miracle_pending: true,
        poppy_miracle_packs: true,
        poppy_miracle_flag: true,
        poppy_street_total_mana_spent: true,
        poppy_street_psyche_chaos: true,
        poppy_last_mana: true,
        poppy_mana_track: true,
        poppy_lucky_find_phase: true,
        trixie_street_taken_fortune: true,
        trixie_street_taken_curse: true,
        trixie_street_taken_fortune_raw: true,
        trixie_street_taken_curse_raw: true,
        trixie_blind_box_contract: true,
        cota_bust_rate: true,
        cota_good_base_value: true,
        cota_bad_base_value: true,
        cota_misc_base_value: true,
        cota_first_bust_bonus_used: true,
        kako_street_added_fortune: true,
        kako_street_added_curse: true,
        kako_used_t0_this_street: true
      };
      if (exactKeys[value]) return true;
      return value.indexOf('kuzuha_debt_rot') === 0 ||
        value.indexOf('kuzuha_called') === 0 ||
        value.indexOf('eulalia_') === 0 ||
        value.indexOf('poppy_miracle') === 0;
    },

    _clearRealityTemporaryMarks() {
      const cleared = [];
      const ownerIds = Array.from(this.statusMarks.keys());
      for (let i = 0; i < ownerIds.length; i++) {
        const ownerId = ownerIds[i];
        const marks = this.statusMarks.get(ownerId) || {};
        const keys = Object.keys(marks);
        for (let j = 0; j < keys.length; j++) {
          const key = keys[j];
          if (key === 'backlash_state') continue;
          this.clearStatusMark(ownerId, key);
          cleared.push({ ownerId: ownerId, key: key });
        }
      }
      return cleared;
    },

    _clearRealityTemporaryAssets() {
      const ledger = this.assetLedger;
      if (!ledger || typeof ledger.snapshot !== 'function' || typeof ledger.clearAsset !== 'function') return [];
      const snapshot = ledger.snapshot() || {};
      const cleared = [];
      const ownerIds = Object.keys(snapshot);
      for (let i = 0; i < ownerIds.length; i++) {
        const ownerKey = ownerIds[i];
        const assets = snapshot[ownerKey] || {};
        const keys = Object.keys(assets);
        for (let j = 0; j < keys.length; j++) {
          const key = keys[j];
          if (!this._isRealityTemporaryAssetKey(key)) continue;
          ledger.clearAsset(ownerKey, key);
          const numericOwnerId = Number(ownerKey);
          if (Number.isFinite(numericOwnerId)) ledger.clearAsset(numericOwnerId, key);
          cleared.push({ ownerId: ownerKey, key: key });
        }
      }
      return cleared;
    },

    _applyReality(skill, finalOptions) {
      const level = Math.max(1, Number(skill && skill.level || 1));
      const clearTemporaryMarks = !!(skill && skill.special && skill.special.clearTemporaryMarks) || level >= 2;
      const removed = this._removePendingForces(function(force) {
        return force && !this._isVoidForce(force);
      }.bind(this), {
        reason: 'void_reality',
        skillKey: skill.skillKey,
        level: level
      });
      const result = {
        ownerId: skill.ownerId,
        ownerName: skill.ownerName,
        skillKey: skill.skillKey,
        level: level,
        clearForces: true,
        clearTemporaryMarks: clearTemporaryMarks,
        removedForces: removed.map(this._snapshotForce.bind(this)),
        clearedMarks: clearTemporaryMarks ? this._clearRealityTemporaryMarks() : [],
        clearedAssets: clearTemporaryMarks ? this._clearRealityTemporaryAssets() : [],
        phase: finalOptions && finalOptions.gameContext ? finalOptions.gameContext.phase : null
      };
      this.emit('void:reality', result);
      this._log('VOID_REALITY', result);
      return result;
    },

    _applyCoolerMark(skill, gameContext, targetOverride) {
      let targetId = targetOverride != null ? targetOverride : null;
      if (targetId == null && this.curseTargetFn) {
        const players = gameContext ? gameContext.players : null;
        targetId = this.curseTargetFn(skill.ownerId, players);
      }
      if (targetId == null) return null;

      const targetName = this._findOwnerName(targetId);
      this.setStatusMark(targetId, 'cooler_mark', {
        sourceId: skill.ownerId,
        sourceName: skill.ownerName,
        icon: '../../../assets/svg/spade-skull.svg',
        title: '冤家牌',
        tone: 'chaos',
        duration: 'hand',
        skillKey: skill.skillKey
      });

      this._log('COOLER_MARK_APPLIED', {
        caster: skill.ownerName,
        target: targetName,
        targetId: targetId
      });

      return { targetId: targetId, targetName: targetName };
    },

    _applySeal(skill, gameContext, targetOverride) {
      // 选目标：优先使用 UI 传入的 targetOverride
      let targetId = null;
      if (targetOverride != null) {
        targetId = targetOverride;
      } else if (this.curseTargetFn) {
        const players = gameContext ? gameContext.players : null;
        targetId = this.curseTargetFn(skill.ownerId, players);
      }
      if (targetId == null) return;

      const extraDuration = this.hasStatusMark(targetId, 'cooler_mark') ? 1 : 0;
      const SEAL_DURATION = 2 + extraDuration;
      const currentPhase = gameContext && gameContext.phase ? gameContext.phase : 'preflop';
      const currentPhaseIndex = this._getPhaseIndex(currentPhase);
      const startPhaseIndex = currentPhaseIndex + 1;
      const endPhaseIndex = currentPhaseIndex + SEAL_DURATION;
      let sealCount = 0;

      for (const [, s] of this.skills) {
        if (s.ownerId !== targetId) continue;
        if (s.activation === ACTIVATION.PASSIVE) continue;
        // 封印：独立于技能自身 CD，避免两套计时互相污染
        s._sealed = SEAL_DURATION;
        sealCount++;
      }

      const targetName = this._findOwnerName(targetId);
      this._log('SEAL_APPLIED', {
        caster: skill.ownerName, target: targetName,
        targetId: targetId, skillsSealed: sealCount, duration: SEAL_DURATION
      });
      this.emit('skill_seal:applied', {
        casterId: skill.ownerId, casterName: skill.ownerName,
        targetId: targetId, targetName: targetName,
        skillsSealed: sealCount, duration: SEAL_DURATION,
        boostedByCooler: extraDuration > 0
      });
      this.setStatusMark(targetId, 'sealed', {
        sourceId: skill.ownerId,
        sourceName: skill.ownerName,
        icon: '../../../assets/svg/crossed-chains.svg',
        title: '封印',
        tone: 'chaos',
        duration: 'rounds',
        remaining: SEAL_DURATION,
        startPhaseIndex: startPhaseIndex,
        endPhaseIndex: endPhaseIndex,
        skillKey: skill.skillKey
      });
      this.syncSealStates(currentPhase);
    },

    _applyRuleRewrite(skill) {
      // 筛选可篡改的 force（排除 void/meta 类型和自己的 force）
      const candidates = this.pendingForces.filter(f =>
        f.ownerId !== skill.ownerId &&
        f.type !== 'backlash' && f.system !== 'void' && f.type !== 'void'
      );

      if (candidates.length === 0) {
        this._log('RULE_REWRITE_MISS', { caster: skill.ownerName, reason: 'no_candidates' });
        return { action: 'miss', reason: 'no_candidates' };
      }

      // 随机选一个 force
      const target = candidates[Math.floor(Math.random() * candidates.length)];
      const before = { type: target.type, ownerId: target.ownerId, ownerName: target.ownerName, power: target.power };

      // 随机篡改方式: 0=翻转类型, 1=改变归属, 2=两者都改
      const action = Math.floor(Math.random() * 3);
      var actionName = '';

      if (action === 0 || action === 2) {
        // 翻转 fortune↔curse
        if (target.type === 'fortune') {
          target.type = 'curse';
          actionName = 'type_flip';
        } else if (target.type === 'curse') {
          target.type = 'fortune';
          // curse 变 fortune 时清除 targetId（不再指向某人）
          target.targetId = null;
          actionName = 'type_flip';
        } else {
          // 非 fortune/curse 类型：随机变成 fortune 或 curse
          target.type = Math.random() < 0.5 ? 'fortune' : 'curse';
          actionName = 'type_mutate';
        }
      }

      if (action === 1 || action === 2) {
        // 改变归属：在所有已知 owner 中随机选一个不同的
        var allOwnerIds = [];
        for (var i = 0; i < this.pendingForces.length; i++) {
          if (allOwnerIds.indexOf(this.pendingForces[i].ownerId) < 0) {
            allOwnerIds.push(this.pendingForces[i].ownerId);
          }
        }
        // 加入施法者自己作为候选
        if (allOwnerIds.indexOf(skill.ownerId) < 0) allOwnerIds.push(skill.ownerId);
        var otherOwners = allOwnerIds.filter(function(id) { return id !== target.ownerId; });
        if (otherOwners.length > 0) {
          var newOwner = otherOwners[Math.floor(Math.random() * otherOwners.length)];
          target.ownerId = newOwner;
          target.ownerName = this._findOwnerName(newOwner);
          actionName = action === 2 ? 'both' : 'owner_swap';
        }
      }

      // 功率随机波动 ±30%
      var powerMult = 0.7 + Math.random() * 0.6; // 0.7 ~ 1.3
      target.power = Math.round(target.power * powerMult);
      target._rewritten = true;
      target._rewrittenBy = skill.ownerName;

      var result = {
        action: actionName || 'power_only',
        before: before,
        after: { type: target.type, ownerId: target.ownerId, ownerName: target.ownerName, power: target.power }
      };

      this._mutatePendingForce(target, before, {
        reason: 'rule_rewrite',
        skillKey: skill.skillKey,
        action: result.action
      });

      this._log('RULE_REWRITE', {
        caster: skill.ownerName, action: result.action,
        before: result.before, after: result.after
      });
      this.emit('trixie:rule_rewrite', result);
      return result;
    },

    _applyBlindBox(skill, gameContext) {
      // 分离：Void 类 force 不受影响
      var preserved = [];
      var shuffleable = [];
      for (var i = 0; i < this.pendingForces.length; i++) {
        var f = this.pendingForces[i];
        if (f.system === 'void' || f.type === 'void') {
          preserved.push(f);
        } else {
          shuffleable.push(f);
        }
      }

      if (shuffleable.length === 0) {
        this._log('BLIND_BOX_MISS', { caster: skill.ownerName, reason: 'no_forces' });
        return { shuffled: 0, preserved: preserved.length };
      }

      // 收集所有活跃玩家 ID
      var playerIds = [];
      if (gameContext && gameContext.players) {
        for (var j = 0; j < gameContext.players.length; j++) {
          if (this._isPlayerAvailable(gameContext.players[j])) playerIds.push(gameContext.players[j].id);
        }
      }
      if (playerIds.length === 0) {
        // 降级：从现有 force 中提取 owner
        for (var k = 0; k < shuffleable.length; k++) {
          if (playerIds.indexOf(shuffleable[k].ownerId) < 0) playerIds.push(shuffleable[k].ownerId);
        }
        if (playerIds.indexOf(skill.ownerId) < 0) playerIds.push(skill.ownerId);
      }

      // 随机重新分配所有 force 的归属
      for (var m = 0; m < shuffleable.length; m++) {
        var sf = shuffleable[m];
        var before = this._snapshotForce(sf);
        var newOwnerId = playerIds[Math.floor(Math.random() * playerIds.length)];
        sf.ownerId = newOwnerId;
        sf.ownerName = this._findOwnerName(newOwnerId);
        // curse 的 targetId 也随机重分配（指向非自己的某人）
        if (sf.type === 'curse' && sf.targetId != null) {
          var otherIds = playerIds.filter(function(id) { return id !== newOwnerId; });
          sf.targetId = otherIds.length > 0 ? otherIds[Math.floor(Math.random() * otherIds.length)] : null;
        }
        // 功率随机波动 ±20%
        sf.power = Math.round(sf.power * (0.8 + Math.random() * 0.4));
        sf._blindBoxed = true;
        sf._blindBoxedBy = skill.ownerName;
        this._mutatePendingForce(sf, before, {
          reason: 'blind_box',
          skillKey: skill.skillKey
        });
      }

      // 重组 pendingForces
      this._replacePendingForces(preserved.concat(shuffleable), {
        reason: 'blind_box',
        skillKey: skill.skillKey
      });

      var result = { shuffled: shuffleable.length, preserved: preserved.length };
      this._log('BLIND_BOX', { caster: skill.ownerName, shuffled: result.shuffled, preserved: result.preserved });
      this.emit('trixie:blind_box', result);
      return result;
    },

    _findOwnerName(ownerId) {
      for (const [, s] of this.skills) {
        if (s.ownerId === ownerId) return s.ownerName;
      }
      return 'ID:' + ownerId;
    },

    _getPhaseIndex(phase) {
      return PHASE_INDEX[phase] != null ? PHASE_INDEX[phase] : -1;
    },

    syncSealStates(currentPhase) {
      const currentIndex = this._getPhaseIndex(currentPhase);

      for (const ownerId of Array.from(this.statusMarks.keys())) {
        const marks = this.statusMarks.get(ownerId);
        const sealMark = marks && marks.sealed;
        if (!sealMark) continue;

        const startPhaseIndex = sealMark.startPhaseIndex != null ? sealMark.startPhaseIndex : currentIndex;
        const endPhaseIndex = sealMark.endPhaseIndex != null ? sealMark.endPhaseIndex : currentIndex;
        let remaining = 0;

        if (currentIndex < 0 || currentIndex > endPhaseIndex) {
          remaining = 0;
        } else if (currentIndex < startPhaseIndex) {
          remaining = Math.max(0, endPhaseIndex - startPhaseIndex + 1);
        } else {
          remaining = Math.max(0, endPhaseIndex - currentIndex + 1);
        }

        for (const [, skill] of this.skills) {
          if (skill.ownerId !== ownerId) continue;
          skill._sealed = remaining;
        }

        if (remaining > 0) {
          this.setStatusMark(ownerId, 'sealed', Object.assign({}, sealMark, {
            remaining: remaining
          }));
        } else {
          this.clearStatusMark(ownerId, 'sealed');
        }
      }
    }
  });
})(typeof window !== 'undefined' ? window : global);
