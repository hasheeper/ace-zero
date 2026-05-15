(function (global) {
  'use strict';

  var modules = global.AceSkillSystemModules = global.AceSkillSystemModules || {};
  var SkillSystem = modules.SkillSystem;
  var ACTIVATION = modules.ACTIVATION;
  var EFFECT = modules.EFFECT;
  var SKILL_SYSTEM = modules.SKILL_SYSTEM;
  var lookupSkill = modules.lookupSkill;
  if (!SkillSystem) throw new Error('AceSkillSystemModules.SkillSystem is not loaded');

  Object.assign(SkillSystem.prototype, {
    activatePlayerSkill(uniqueId, options) {
      const skill = this.skills.get(uniqueId);
      if (!skill) return { success: false, reason: 'SKILL_NOT_FOUND' };
      var finalOptions = this._resolveSkillExecutionOptions(
        skill,
        null,
        options && options.gameContext ? options.gameContext : null,
        options || {}
      );
      const targetOverride = finalOptions && finalOptions.targetId != null ? finalOptions.targetId : null;
      const protectOverride = finalOptions && finalOptions.protectId != null ? finalOptions.protectId : null;
      const activationContext = finalOptions && finalOptions.gameContext
        ? finalOptions.gameContext
        : (options && options.gameContext ? options.gameContext : null);

      // Toggle 类型：切换开/关状态
      if (skill.activation === ACTIVATION.TOGGLE) {
        return this._toggleSkill(skill);
      }

      var availability = this.getSkillAvailability(skill, finalOptions && finalOptions.gameContext ? finalOptions.gameContext : null, Object.assign({}, finalOptions, {
        _resolvedAvailabilityOptions: true,
        checkPendingForces: true,
        enforcePhaseRules: true
      }));
      if (!availability.ok) {
        return Object.assign({ success: false }, availability);
      }

      // Mana 检查（特质与 asset risk 可能修改最终消耗）
      var actualCost = this._getSkillActualManaCost(skill, Object.assign({}, finalOptions, { consumeAssetRisk: true }));

      var blindBoxScopeKey = null;
      if (skill.effect === EFFECT.BLIND_BOX) {
        blindBoxScopeKey = 'skill:' + String(skill.ownerId) + ':blind_box:match_once';
        if (typeof this.consumeMatchScopedUse === 'function') {
          var consumed = this.consumeMatchScopedUse(blindBoxScopeKey, {
            ownerId: skill.ownerId,
            ownerName: skill.ownerName,
            skillKey: skill.skillKey,
            effect: skill.effect
          });
          if (!consumed) {
            return { success: false, reason: 'MATCH_SCOPED_USED', scopeKey: blindBoxScopeKey };
          }
        }
      }
      var realityScopeKey = null;
      if (skill.effect === EFFECT.VOID && skill.skillKey === 'reality') {
        realityScopeKey = 'skill:' + String(skill.ownerId) + ':reality:match_once';
        if (typeof this.consumeMatchScopedUse === 'function') {
          var realityConsumed = this.consumeMatchScopedUse(realityScopeKey, {
            ownerId: skill.ownerId,
            ownerName: skill.ownerName,
            skillKey: skill.skillKey,
            effect: skill.effect
          });
          if (!realityConsumed) {
            return { success: false, reason: 'MATCH_SCOPED_USED', scopeKey: realityScopeKey };
          }
        }
      }

      if (actualCost > 0 && !this.spendMana(this._getSkillManaPoolId(skill), actualCost)) {
        return { success: false, reason: 'INSUFFICIENT_MANA', cost: actualCost };
      }
      this._consumeAssetCostPassives(skill);

      this._activationSerial += 1;
      skill._activationId = 'skill_act_' + this._activationSerial + '_' + Date.now();

      // 激活
      skill.currentCooldown = skill.cooldown;

      // 扣减整局使用次数
      if (skill.usesPerGame > 0) {
        skill.gameUsesRemaining--;
      }
      if (skill.usesPerStreet > 0) {
        this._consumeStreetScopedUse(skill);
      }

      // 根据 effect 类型处理
      var _activateExtra = {};
      switch (skill.effect) {
        case EFFECT.PSYCHE: {
          var typedForce = this._skillToForce(skill, activationContext);
          if (protectOverride != null) typedForce.protectId = protectOverride;
          if (targetOverride != null) typedForce.targetId = targetOverride;
          if (finalOptions.curseSourceId != null) typedForce.curseSourceId = finalOptions.curseSourceId;
          if (finalOptions.curseDirection != null) typedForce.curseDirection = finalOptions.curseDirection;
          this._queuePendingForce(typedForce, { reason: 'skill_activate', effect: skill.effect });
          this._emitSkillActivated({ skill: skill, type: skill.effect }, finalOptions);
          break;
        }
        case EFFECT.VOID: {
          if (skill.skillKey === 'reality') {
            var realityResult = this._applyReality(skill, finalOptions);
            _activateExtra = { reality: realityResult };
            this._emitSkillActivated({ skill: skill, type: 'void', reality: realityResult }, finalOptions);
            break;
          }
          var voidForce = this._skillToForce(skill, activationContext);
          if (protectOverride != null) voidForce.protectId = protectOverride;
          if (targetOverride != null) voidForce.targetId = targetOverride;
          this._queuePendingForce(voidForce, { reason: 'skill_activate', effect: skill.effect });
          this._emitSkillActivated({ skill: skill, type: skill.effect }, finalOptions);
          break;
        }
        case EFFECT.ROYAL_DECREE:
          // 敕令：超强 fortune，直接加入 pendingForces
          this._queuePendingForce(this._skillToForce(skill, activationContext), { reason: 'skill_activate', effect: skill.effect });
          this._emitSkillActivated({ skill: skill, type: 'royal_decree' }, finalOptions);
          break;
        case EFFECT.HEART_READ: {
          // 读心：信息技能，显示对手下注倾向
          var hForce = this._skillToForce(skill, activationContext);
          if (protectOverride != null) hForce.protectId = protectOverride;
          this._queuePendingForce(hForce, { reason: 'skill_activate', effect: skill.effect });
          this._emitSkillActivated({ skill: skill, type: 'heart_read' }, finalOptions);
          break;
        }
        case EFFECT.COOLER: {
          // 冤家牌：施加标记，本手后续选牌更偏向“看似能打、实际被压死”
          var coolerResult = this._applyCoolerMark(skill, finalOptions && finalOptions.gameContext, targetOverride);
          _activateExtra = {
            targetId: coolerResult ? coolerResult.targetId : null,
            targetName: coolerResult ? coolerResult.targetName : null,
            markKey: 'cooler_mark'
          };
          this._emitSkillActivated({
            skill,
            type: 'cooler',
            targetId: coolerResult ? coolerResult.targetId : null,
            targetName: coolerResult ? coolerResult.targetName : null
          }, finalOptions);
          break;
        }
        case EFFECT.CLAIRVOYANCE: {
          // 估价眼：信息效果由 UI/Runtime 接管，本体不再直接注入旧版 Psyche 清洗 force
          this._emitSkillActivated({
            skill,
            type: 'clairvoyance',
            targetId: targetOverride,
            protectId: protectOverride
          }, finalOptions);
          break;
        }
        case EFFECT.BUBBLE_LIQUIDATION: {
          this._emitSkillActivated({
            skill,
            type: 'bubble_liquidation',
            targetId: targetOverride
          }, finalOptions);
          break;
        }
        case EFFECT.SKILL_SEAL:
          // 封印：冻结目标技能2回合
          this._applySeal(skill, null, targetOverride);
          this._emitSkillActivated({ skill: skill, type: 'skill_seal' }, finalOptions);
          break;
        case EFFECT.RULE_REWRITE: {
          // 规则篡改：由 Runtime 面板与合同系统接管
          this._emitSkillActivated({ skill: skill, type: 'rule_rewrite' }, finalOptions);
          break;
        }
        case EFFECT.BLIND_BOX: {
          // 盲盒派对：由 Runtime 合同系统接管
          this._emitSkillActivated({ skill: skill, type: 'blind_box' }, finalOptions);
          break;
        }

        // ===== Cota 专属 =====
        case EFFECT.DEAL_CARD:
        case EFFECT.GATHER_OR_SPREAD: {
          // 新版 COTA 完全由 Runtime 牌列系统接管；主流程不再注入旧 Psyche/fortune force。
          this._emitSkillActivated({
            skill: skill,
            type: skill.effect,
            cardType: finalOptions && finalOptions.cardType,
            mode: finalOptions && finalOptions.mode,
            slotIndex: finalOptions && finalOptions.slotIndex
          }, finalOptions);
          break;
        }

        // ===== Eulalia 专属 =====
        case EFFECT.ABSOLUTION:
          this._emitSkillActivated({
            skill: skill,
            type: 'absolution'
          }, finalOptions);
          break;
        case EFFECT.BENEDICTION:
          this._emitSkillActivated({
            skill: skill,
            type: 'benediction',
            targetId: targetOverride
          }, finalOptions);
          break;

        // ===== Kako 专属 =====
        case EFFECT.RECLASSIFICATION:
          this._emitSkillActivated({
            skill: skill,
            type: 'reclassification',
            targetId: targetOverride
          }, finalOptions);
          break;
        case EFFECT.GENERAL_RULING:
          this._emitSkillActivated({
            skill: skill,
            type: 'general_ruling'
          }, finalOptions);
          break;

        // ===== Kuzuha 专属 =====
        case EFFECT.HOUSE_EDGE: {
          this._emitSkillActivated({ skill: skill, type: 'house_edge' }, finalOptions);
          break;
        }
        case EFFECT.DEBT_CALL: {
          this._emitSkillActivated({ skill: skill, type: 'debt_call' }, finalOptions);
          break;
        }

        // ===== 心理战技能 =====
        case EFFECT.PSYCH_PRESSURE:
        case EFFECT.PSYCH_PROBE: {
          // 压制类技能：压场/挑衅/试探
          var catalog = lookupSkill(skill.skillKey);
          var pressureType = catalog.pressureType;
          var basePower = catalog.basePower || 15;
          var equityBias = catalog.equityBias || 0;
          var confidenceDelta = catalog.confidenceDelta || 0;
          var targetId = targetOverride != null ? targetOverride : null;

          this._emitSkillActivated({
            skill,
            type: 'mental_pressure',
            pressureType: pressureType,
            basePower: basePower,
            equityBias: equityBias,
            confidenceDelta: confidenceDelta,
            targetId: targetId
          }, finalOptions);
          break;
        }
        case EFFECT.PSYCH_RECOVER: {
          // 定神：恢复自身定力
          var catalog2 = lookupSkill(skill.skillKey);
          var baseRecover = catalog2.baseRecover || 20;
          var confidenceDelta2 = catalog2.confidenceDelta || 20;
          var clearBias = catalog2.clearBias || false;

          this._emitSkillActivated({
            skill,
            type: 'mental_recover',
            baseRecover: baseRecover,
            confidenceDelta: confidenceDelta2,
            clearBias: clearBias
          }, finalOptions);
          break;
        }

        default: {
          // fortune / curse / psyche / void → 加入 pendingForces
          var force = this._skillToForce(skill, activationContext);
          if (targetOverride != null && force.type === 'curse') force.targetId = targetOverride;
          this._queuePendingForce(force, { reason: 'skill_activate', effect: skill.effect });
          this._emitSkillActivated({ skill: skill, type: 'force' }, finalOptions);
          break;
        }
      }

      var activationLog = {
        owner: skill.ownerName,
        caster: skill.casterName,
        key: skill.skillKey,
        effect: skill.effect,
        manaCost: actualCost,
        baseManaCost: skill.manaCost,
        manaPoolId: skill.manaPoolId || null,
        casterRoleId: skill.casterRoleId || null,
        casterSlot: skill.casterSlot || null
      };
      if (skill.effect === EFFECT.RULE_REWRITE) {
        activationLog.rewriteMode = finalOptions && finalOptions.rewriteMode != null
          ? finalOptions.rewriteMode
          : null;
        activationLog.rewriteModifier = finalOptions && finalOptions.rewriteModifier != null
          ? finalOptions.rewriteModifier
          : null;
        activationLog.rewriteGlobal = !!(finalOptions && finalOptions.rewriteGlobal === true);
        activationLog.targetId = finalOptions && finalOptions.targetId != null
          ? finalOptions.targetId
          : null;
      }
      if (skill.effect === EFFECT.BLIND_BOX) {
        activationLog.blindBoxMode = finalOptions && finalOptions.blindBoxMode != null
          ? finalOptions.blindBoxMode
          : null;
        activationLog.blindBoxA = finalOptions && finalOptions.blindBoxParticipantA != null
          ? finalOptions.blindBoxParticipantA
          : null;
        activationLog.blindBoxB = finalOptions && finalOptions.blindBoxParticipantB != null
          ? finalOptions.blindBoxParticipantB
          : null;
      }
      if (skill.effect === EFFECT.BUBBLE_LIQUIDATION || skill.effect === EFFECT.CLAIRVOYANCE) {
        activationLog.targetId = finalOptions && finalOptions.targetId != null
          ? finalOptions.targetId
          : null;
      }
      this._log('SKILL_ACTIVATED', activationLog);

      var ret = {
        success: true,
        skill: skill,
        options: Object.assign({}, finalOptions || {}),
        actualManaCost: actualCost
      };
      for (var ek in _activateExtra) ret[ek] = _activateExtra[ek];
      return ret;
    },

    _toggleSkill(skill) {
      // 切换状态
      skill.active = !skill.active;

      if (skill.active) {
        this._log('SKILL_TOGGLE_ON', {
          owner: skill.ownerName, key: skill.skillKey, effect: skill.effect
        });
        this.emit('skill:toggle_on', { skill });
      } else {
        this._log('SKILL_TOGGLE_OFF', {
          owner: skill.ownerName, key: skill.skillKey, effect: skill.effect
        });
        this.emit('skill:toggle_off', { skill });
      }

      return { success: true, skill, toggled: skill.active };
    },

    npcDecideSkills(gameContext) {
      const skillRecords = [];
      var players = gameContext && Array.isArray(gameContext.players) ? gameContext.players : [];
      var seen = Object.create(null);
      for (var i = 0; i < players.length; i++) {
        var player = players[i];
        if (!player || player.type === 'human' || seen[player.id]) continue;
        seen[player.id] = true;
        var records = this.npcDecideSkillsForPlayer(player.id, gameContext, 'post-bet');
        if (!records || !records.length) continue;
        for (var j = 0; j < records.length; j++) {
          skillRecords.push(records[j]);
        }
      }

      return skillRecords;
    },

    npcDecideSkillsForPlayer(playerId, gameContext, timing) {
      if (!this._turnSkillUsed) this._turnSkillUsed = {};
      var timingKey = timing || 'any';
      var usedKey = playerId + '_street_' + String((gameContext && gameContext.phase) || 'unknown') + '_' + timingKey;
      if (this._turnSkillUsed[usedKey]) return [];

      const MAX_TURN_SKILLS = 1; // 每阶段最多用1个技能
      const skillRecords = [];
      const owner = gameContext.players.find(p => p.id === playerId);
      if (!this._isPlayerAvailable(owner)) return [];

      // pre-bet: 灵视/防御类（影响 betting 决策）
      // post-bet: 攻击/增益类（根据投入筹码决定）
      // reactive-defense: 新 curse/chaos 进入 pending 后，目标 NPC 的即时防御窗口
      var PRE_BET = [
        EFFECT.PSYCHE, EFFECT.VOID, EFFECT.HEART_READ, EFFECT.CLAIRVOYANCE,
        EFFECT.DEAL_CARD, EFFECT.GATHER_OR_SPREAD
      ];
      var POST_BET = [
        EFFECT.FORTUNE, EFFECT.CURSE, EFFECT.COOLER, EFFECT.ROYAL_DECREE, EFFECT.BUBBLE_LIQUIDATION,
        EFFECT.VOID, EFFECT.SKILL_SEAL, EFFECT.RULE_REWRITE, EFFECT.BLIND_BOX,
        EFFECT.HOUSE_EDGE, EFFECT.DEBT_CALL, EFFECT.ABSOLUTION, EFFECT.BENEDICTION,
        EFFECT.RECLASSIFICATION, EFFECT.GENERAL_RULING,
        EFFECT.DEAL_CARD, EFFECT.GATHER_OR_SPREAD
      ];
      var REACTIVE_DEFENSE = [
        EFFECT.PSYCHE, EFFECT.VOID, EFFECT.HEART_READ
      ];

      var passes;
      if (timing === 'pre-bet') {
        passes = [PRE_BET];
      } else if (timing === 'post-bet') {
        passes = [POST_BET];
      } else if (timing === 'reactive-defense') {
        passes = [REACTIVE_DEFENSE];
      } else {
        passes = [POST_BET, PRE_BET]; // 兼容旧调用
      }

      for (var pass = 0; pass < passes.length; pass++) {
        var allowed = passes[pass];
        if (skillRecords.length >= MAX_TURN_SKILLS) break;
        var candidates = [];

        for (const [, skill] of this.skills) {
          if (skill.ownerId !== playerId) continue;
          if (skill.ownerType === 'human') continue;
          if (allowed.indexOf(skill.effect) < 0) continue;
          var baseAvailability = this.getSkillAvailability(skill, gameContext, {
            resolveOptions: false,
            skipOptionValidation: true,
            enforcePhaseRules: true,
            allowOutOfTurn: true
          });
          if (!baseAvailability.ok) continue;
          candidates.push(skill);
        }

        candidates.sort(this._compareNpcSkillPriority.bind(this, owner, gameContext, timing));

        for (var ci = 0; ci < candidates.length; ci++) {
          var skill = candidates[ci];
          if (skillRecords.length >= MAX_TURN_SKILLS) break;
          var shouldUse = this._npcShouldUseSkill(skill, owner, gameContext);
          this._log('NPC_SKILL_CONSIDER', {
            owner: skill.ownerName, key: skill.skillKey, effect: skill.effect,
            phase: gameContext.phase, shouldUse: shouldUse, pass: pass, timing: timingKey
          });
          if (!shouldUse) continue;

          var finalOptions = this._resolveSkillExecutionOptions(skill, owner, gameContext, {
            gameContext: gameContext
          });
          var availability = this.getSkillAvailability(skill, gameContext, Object.assign({}, finalOptions, {
            _resolvedAvailabilityOptions: true,
            enforcePhaseRules: true,
            allowOutOfTurn: true
          }));
          if (!availability.ok) continue;

          var preparedTurn = this._prepareNpcSkillUse(skill, finalOptions);
          if (!preparedTurn) continue;
          var record = this._executeNpcSkill(skill, owner, gameContext, finalOptions);
          if (preparedTurn.actualCost != null) {
            record.manaCost = preparedTurn.actualCost;
          }

          this._log('NPC_SKILL_USED', {
            owner: skill.ownerName, key: skill.skillKey,
            effect: skill.effect, level: skill.level, system: skill.system,
            targetId: record.targetId, targetName: record.targetName, timing: timingKey
          });

          this.emit('npc:skill_used', record);
          skillRecords.push(record);
        }
      }

	      if (skillRecords.length > 0) this._turnSkillUsed[usedKey] = true;
	      return skillRecords;
	    },

    _compareNpcSkillPriority(owner, gameContext, timing, a, b) {
      return this._getNpcSkillPriorityScore(b, owner, gameContext, timing) -
        this._getNpcSkillPriorityScore(a, owner, gameContext, timing);
    },

    _getNpcSkillPriorityScore(skill, owner, gameContext, timing) {
      if (!skill) return 0;
      var score = 0;
      var ownerId = owner && owner.id;
      var hasTargetedCurse = false;
      var threatPower = 0;
      var pending = Array.isArray(this.pendingForces) ? this.pendingForces : [];
      for (var i = 0; i < pending.length; i++) {
        var force = pending[i];
        if (!force || force.ownerId === ownerId) continue;
        var isChaos = force.system === SKILL_SYSTEM.CHAOS || force.type === EFFECT.CURSE;
        if (!isChaos) continue;
        var targetsOwner = force.targetId === ownerId;
        if (!targetsOwner) continue;
        hasTargetedCurse = true;
        threatPower += Math.max(0, Number(force.power || force.effectivePower || 0));
      }

      if (timing === 'reactive-defense') score += 100;
      if (hasTargetedCurse) score += 50 + Math.min(50, threatPower);

      if (skill.effect === EFFECT.PSYCHE || skill.effect === EFFECT.HEART_READ) {
        var matrix = Array.isArray(skill.matrix) ? skill.matrix : [0, 0, 0];
        var defending = hasTargetedCurse || timing === 'reactive-defense';
        if (defending) {
          score += 20 + Math.round((matrix[1] || 0) * 60) + Math.round((matrix[2] || 0) * 80);
          if (skill.skillKey === 'premonition') score += 35;
          if (skill.skillKey === 'refraction') score += 30;
          if (skill.skillKey === 'analysis') score -= 18;
        } else {
          score += 20 + Math.round((matrix[0] || 0) * 70);
          if (skill.skillKey === 'analysis') score += 25;
          if (skill.skillKey === 'premonition') score -= 10;
        }
      }
      if (skill.effect === EFFECT.VOID) {
        if (skill.skillKey === 'insulation') score += hasTargetedCurse ? 40 : 10;
        if (skill.skillKey === 'reality') score += threatPower >= 45 ? 35 : 0;
      }

      score += Math.max(0, Number(skill.level || 0));
      return score;
    },

    resetTurnSkillTracking() {
      this._turnSkillUsed = {};
    },

    resetToggleSkills() {
      for (const [, skill] of this.skills) {
        if (skill.activation === ACTIVATION.TOGGLE && skill.active) {
          skill.active = false;
          this._log('SKILL_TOGGLE_OFF', {
            owner: skill.ownerName, key: skill.skillKey, effect: skill.effect
          });
          this.emit('skill:toggle_off', { skill });
        }
      }
    },

    _npcShouldUseSkill(skill, owner, gameContext) {
      if (skill && skill.pendingImplementation) return false;
      // 委托给外部 AI 决策（SkillAI）
      if (this.skillDecideFn) {
        const mana = this._getSkillManaPool(skill);
        if (gameContext && !gameContext.skillSystem) gameContext.skillSystem = this;
        return this.skillDecideFn(skill, owner, gameContext, this.pendingForces, mana);
      }
      // 无回调时的简单 fallback
      const phaseProgression = { preflop: 0.15, flop: 0.35, turn: 0.55, river: 0.75 };
      return Math.random() < (phaseProgression[gameContext.phase] || 0.2);
    },

    _prepareNpcSkillUse(skill, finalOptions) {
      if (skill && skill.pendingImplementation) return null;
      var actualCost = this._getSkillActualManaCost(skill, Object.assign({}, finalOptions, { consumeAssetRisk: true }));
      if (actualCost > 0) {
        const pool = this._getSkillManaPool(skill);
        if (!pool || pool.current < actualCost) return null;
        this.spendMana(this._getSkillManaPoolId(skill), actualCost);
      }
      if (skill && skill.effect === EFFECT.BLIND_BOX) {
        var blindBoxScopeKey = 'skill:' + String(skill.ownerId) + ':blind_box:match_once';
        if (typeof this.consumeMatchScopedUse === 'function') {
          var consumed = this.consumeMatchScopedUse(blindBoxScopeKey, {
            ownerId: skill.ownerId,
            ownerName: skill.ownerName,
            skillKey: skill.skillKey,
            effect: skill.effect
          });
          if (!consumed) return null;
        }
      }

      skill.currentCooldown = skill.cooldown;
      if (skill.usesPerGame > 0) {
        skill.gameUsesRemaining--;
      }
      return { actualCost: actualCost };
    },

    _executeNpcSkill(skill, owner, gameContext, resolvedOptions) {
      var force = null;
      var targetName = null;
      var finalOptions = resolvedOptions || this._resolveSkillExecutionOptions(skill, owner, gameContext, {
        gameContext: gameContext
      });
      var targetOverride = finalOptions && finalOptions.targetId != null ? finalOptions.targetId : null;
      var protectOverride = finalOptions && finalOptions.protectId != null ? finalOptions.protectId : null;

      switch (skill.effect) {
        case EFFECT.COOLER:
          force = this._applyCoolerMark(skill, gameContext, targetOverride);
          break;
        case EFFECT.SKILL_SEAL:
          this._applySeal(skill, gameContext, targetOverride);
          force = { targetId: targetOverride };
          break;
        case EFFECT.CLAIRVOYANCE:
          force = { targetId: targetOverride, protectId: protectOverride };
          this._emitSkillActivated({
            skill: skill,
            type: 'clairvoyance',
            targetId: targetOverride,
            protectId: protectOverride
          }, finalOptions);
          break;
        case EFFECT.BUBBLE_LIQUIDATION:
          force = { targetId: targetOverride };
          this._emitSkillActivated({
            skill: skill,
            type: 'bubble_liquidation',
            targetId: targetOverride
          }, finalOptions);
          break;
        case EFFECT.RULE_REWRITE:
          this._emitSkillActivated({
            skill: skill,
            type: 'rule_rewrite'
          }, finalOptions);
          force = { targetId: targetOverride };
          break;
        case EFFECT.BLIND_BOX:
          this._emitSkillActivated({
            skill: skill,
            type: 'blind_box'
          }, finalOptions);
          force = { targetId: targetOverride };
          break;

        case EFFECT.DEAL_CARD:
          this._emitSkillActivated({
            skill: skill,
            type: 'deal_card',
            cardType: finalOptions && finalOptions.cardType,
            slotIndex: finalOptions && finalOptions.slotIndex
          }, finalOptions);
          force = {};
          break;

        case EFFECT.GATHER_OR_SPREAD:
          this._emitSkillActivated({
            skill: skill,
            type: 'gather_or_spread',
            mode: finalOptions && finalOptions.mode
          }, finalOptions);
          force = {};
          break;

        case EFFECT.PRE_DECOLOR:
        case EFFECT.NULL_READ:
          force = this._skillToForce(skill, gameContext);
          if (protectOverride != null) force.protectId = protectOverride;
          this._queuePendingForce(force, { reason: 'npc_skill', effect: skill.effect });
          break;

        case EFFECT.ABSOLUTION:
          this._emitSkillActivated({
            skill: skill,
            type: 'absolution'
          }, { gameContext: gameContext });
          break;
        case EFFECT.BENEDICTION:
          this._emitSkillActivated({
            skill: skill,
            type: 'benediction',
            targetId: targetOverride
          }, { gameContext: gameContext });
          break;

        case EFFECT.HOUSE_EDGE: {
          this._emitSkillActivated({ skill: skill, type: 'house_edge' }, finalOptions);
          force = { targetId: finalOptions && finalOptions.targetId != null ? finalOptions.targetId : null };
          break;
        }
        case EFFECT.DEBT_CALL: {
          this._emitSkillActivated({ skill: skill, type: 'debt_call' }, finalOptions);
          force = { targetId: finalOptions && finalOptions.targetId != null ? finalOptions.targetId : null };
          break;
        }
        case EFFECT.RECLASSIFICATION: {
          this._emitSkillActivated({
            skill: skill,
            type: 'reclassification',
            targetId: targetOverride
          }, finalOptions);
          force = { targetId: targetOverride };
          break;
        }
        case EFFECT.GENERAL_RULING: {
          this._emitSkillActivated({
            skill: skill,
            type: 'general_ruling'
          }, finalOptions);
          force = {};
          break;
        }

        default:
          force = this._skillToForce(skill, gameContext);
          var psycheEffects = ['psyche', 'heart_read', 'clairvoyance'];
          if (protectOverride != null) {
            force.protectId = protectOverride;
          } else if (psycheEffects.indexOf(skill.effect) >= 0 && force.protectId == null) {
            force.protectId = skill.ownerId;
          }
          if (targetOverride != null && force.type === 'curse') force.targetId = targetOverride;
          this._queuePendingForce(force, { reason: 'npc_skill', effect: skill.effect });
          break;
      }

      if (force && force.targetId != null) {
        targetName = (gameContext.players.find(function(p) { return p.id === force.targetId; }) || {}).name || ('ID:' + force.targetId);
      }
      this._captureNpcScoutIntel(skill, owner, gameContext);

      return {
        ownerName: skill.ownerName,
        ownerId: skill.ownerId,
        skillKey: skill.skillKey,
        effect: skill.effect,
        level: skill.level,
        system: skill.system,
        kind: skill.kind,
        targetId: force ? force.targetId : null,
        targetName: targetName,
        protectId: force ? force.protectId : null,
        options: Object.assign({}, finalOptions || {})
      };
    },

    _effectName(effect) {
      const names = {
        fortune:     '天命·幸运',
        curse:       '狂厄·凶',
        psyche:      '灵视·Psyche',
        void:        '虚无·Void',
        royal_decree:'天命·敕令',
        heart_read:  '灵视·读心',
        cooler:      '狂厄·冤家牌',
        skill_seal:  '狂厄·冻结令',
        clairvoyance:'灵视·估价眼',
        bubble_liquidation:'灵视·泡沫清算',
        miracle:     '天命·命大',
        lucky_find:  '天命·捡到了',
        deal_card:   '灵视·发牌',
        gather_or_spread: '灵视·收牌/铺牌',
        absolution:  '天命·赦免',
        benediction: '天命·祝福',
        reclassification:'灵视·改判',
        general_ruling:'灵视·总务裁定',
        house_edge:  '狂厄·抽水',
        debt_call:   '狂厄·催收'
      };
      return names[effect] || '未知魔力';
    }
  });
})(typeof window !== 'undefined' ? window : global);
