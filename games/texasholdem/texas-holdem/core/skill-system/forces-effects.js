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
