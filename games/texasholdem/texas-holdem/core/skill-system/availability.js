(function (global) {
  'use strict';

  var modules = global.AceSkillSystemModules = global.AceSkillSystemModules || {};
  var SkillSystem = modules.SkillSystem;
  var ACTIVATION = modules.ACTIVATION;
  var EFFECT = modules.EFFECT;
  var RIVER_INFO_EFFECTS = modules.RIVER_INFO_EFFECTS;
  var VV_CLAIRVOYANCE_ENTRY_SIZE_EXTRA_COST = modules.VV_CLAIRVOYANCE_ENTRY_SIZE_EXTRA_COST;
  if (!SkillSystem) throw new Error('AceSkillSystemModules.SkillSystem is not loaded');

  Object.assign(SkillSystem.prototype, {
    _resolveSkillExecutionOptions(skill, owner, gameContext, baseOptions) {
      var options = Object.assign({}, baseOptions || {});
      if (!gameContext &&
          global.AceRuntimeAPI &&
          typeof global.AceRuntimeAPI.getGameState === 'function') {
        gameContext = global.AceRuntimeAPI.getGameState() || null;
      }
      var resolvedOwner = owner;
      if (!resolvedOwner && gameContext && Array.isArray(gameContext.players)) {
        resolvedOwner = gameContext.players.find(function(player) {
          return player && player.id === skill.ownerId;
        }) || null;
      }
      if (gameContext && !gameContext.skillSystem) gameContext.skillSystem = this;

      if (resolvedOwner && resolvedOwner.type === 'human') {
        if (options.targetId == null) options.targetId = this._defaultSelectSkillTarget({
          skill: skill,
          owner: resolvedOwner,
          ctx: gameContext,
          options: options
        });
        if (options.protectId == null) options.protectId = this._defaultSelectProtectTarget({
          skill: skill,
          owner: resolvedOwner,
          ctx: gameContext,
          options: options
        });
        return options;
      }

      var director = global.NpcRoleDirector;
      if (!director || typeof director.resolveSkillUseOptions !== 'function') {
        if (options.targetId == null) options.targetId = this._defaultSelectSkillTarget({
          skill: skill,
          owner: resolvedOwner,
          ctx: gameContext,
          options: options
        });
        if (options.protectId == null) options.protectId = this._defaultSelectProtectTarget({
          skill: skill,
          owner: resolvedOwner,
          ctx: gameContext,
          options: options
        });
        return options;
      }

      var difficulty = (resolvedOwner && resolvedOwner.difficultyProfile)
        || (resolvedOwner && resolvedOwner.ai && resolvedOwner.ai.difficultyProfile)
        || (resolvedOwner && resolvedOwner.personality && resolvedOwner.personality.difficulty)
        || (resolvedOwner && resolvedOwner.difficulty)
        || 'regular';

      return Object.assign({}, options, director.resolveSkillUseOptions({
        difficulty: difficulty,
        skill: skill,
        owner: resolvedOwner,
        ctx: gameContext,
        pendingForces: this.pendingForces,
        mana: this._getSkillManaPool(skill),
        options: options
      }, {
        selectSkillTarget: this._defaultSelectSkillTarget.bind(this),
        selectProtectTarget: this._defaultSelectProtectTarget.bind(this),
        augmentSkillOptions: this._defaultAugmentSkillOptions.bind(this)
      }) || {});
    },

    _validateSkillExecution(skill, gameContext, options) {
      if (!skill) return { ok: false, reason: 'SKILL_NOT_FOUND' };
      var finalOptions = options || {};
      if (skill.effect === EFFECT.RULE_REWRITE) {
        var rewriteLedger = this.assetLedger;
        var wildCard = 0;
        if (rewriteLedger && typeof rewriteLedger.getValue === 'function') {
          wildCard = Math.max(0, Number(rewriteLedger.getValue(skill.ownerId, 'trixie_wild_card') || 0));
        }
        if (wildCard <= 0) {
          return { ok: false, reason: 'NO_WILD_CARD', wildCard: wildCard };
        }
        var rewriteMode = String(finalOptions.rewriteMode || 'fortune_self');
        if (rewriteMode === 'curse_target' && !finalOptions.rewriteGlobal) {
          var rewriteTargetId = finalOptions.targetId != null ? finalOptions.targetId : null;
          if (rewriteTargetId == null || rewriteTargetId === skill.ownerId) {
            return { ok: false, reason: 'NO_REWRITE_TARGET', wildCard: wildCard };
          }
        }
      }
      if (skill.effect === EFFECT.BLIND_BOX) {
        var scopeKey = 'skill:' + String(skill.ownerId) + ':blind_box:match_once';
        if (typeof this.isMatchScopedUsed === 'function' && this.isMatchScopedUsed(scopeKey)) {
          return { ok: false, reason: 'MATCH_SCOPED_USED', scopeKey: scopeKey };
        }
        var boxLedger = this.assetLedger;
        var blindWildCard = 0;
        if (boxLedger && typeof boxLedger.getValue === 'function') {
          blindWildCard = Math.max(0, Number(boxLedger.getValue(skill.ownerId, 'trixie_wild_card') || 0));
        }
        if (blindWildCard <= 0) {
          return { ok: false, reason: 'NO_WILD_CARD', wildCard: blindWildCard };
        }
        var participantIds = Array.isArray(finalOptions.participantIds)
          ? finalOptions.participantIds.map(function(id) { return Number(id); }).filter(function(id) { return Number.isFinite(id); })
          : [];
        if (participantIds.length !== 2 || participantIds[0] === participantIds[1]) {
          return { ok: false, reason: 'INVALID_BLIND_BOX_TARGETS', wildCard: blindWildCard };
        }
        if (gameContext && Array.isArray(gameContext.players)) {
          var activeIds = gameContext.players
            .filter(function(player) { return player && player.isActive !== false && !player.folded; })
            .map(function(player) { return Number(player.id); });
          var allValid = participantIds.every(function(id) { return activeIds.indexOf(id) >= 0; });
          if (!allValid) {
            return { ok: false, reason: 'INVALID_BLIND_BOX_TARGETS', wildCard: blindWildCard };
          }
        }
        var requiredWildCard = participantIds.indexOf(skill.ownerId) >= 0 ? 50 : 100;
        if (blindWildCard < requiredWildCard) {
          return {
            ok: false,
            reason: 'INSUFFICIENT_WILD_CARD',
            wildCard: blindWildCard,
            requiredWildCard: requiredWildCard
          };
        }
      }
      if (skill.effect === EFFECT.VOID && skill.skillKey === 'reality') {
        var realityScopeKey = 'skill:' + String(skill.ownerId) + ':reality:match_once';
        if (typeof this.isMatchScopedUsed === 'function' && this.isMatchScopedUsed(realityScopeKey)) {
          return { ok: false, reason: 'MATCH_SCOPED_USED', scopeKey: realityScopeKey };
        }
      }
      if (skill.effect === EFFECT.DEBT_CALL) {
        var targetId = finalOptions.targetId != null ? finalOptions.targetId : null;
        if (targetId == null) {
          return { ok: false, reason: 'NO_DEBT_TARGET', targetId: null, debtValue: 0 };
        }
        var ledger = this.assetLedger;
        var debtValue = 0;
        if (ledger && typeof ledger.getValue === 'function') {
          debtValue = Math.max(0, Number(ledger.getValue(skill.ownerId, 'kuzuha_debt_rot:' + targetId) || 0));
        }
        if (debtValue <= 0) {
          return { ok: false, reason: 'NO_DEBT_TARGET', targetId: targetId, debtValue: debtValue };
        }
      }
      if (skill.effect === EFFECT.BENEDICTION) {
        var benedictionTargetId = finalOptions.targetId != null ? finalOptions.targetId : null;
        if (benedictionTargetId == null || benedictionTargetId === skill.ownerId) {
          return { ok: false, reason: 'NO_BENEDICTION_TARGET', targetId: benedictionTargetId };
        }
        if (gameContext && Array.isArray(gameContext.players)) {
          var benedictionTarget = gameContext.players.find(function(player) {
            return player && player.id === benedictionTargetId;
          }) || null;
          if (!benedictionTarget || benedictionTarget.isActive === false || benedictionTarget.folded) {
            return { ok: false, reason: 'NO_BENEDICTION_TARGET', targetId: benedictionTargetId };
          }
        }
      }
      if (skill.effect === EFFECT.RECLASSIFICATION) {
        var rulingTargetId = finalOptions.targetId != null ? finalOptions.targetId : null;
        if (rulingTargetId == null) {
          return { ok: false, reason: 'NO_RULING_TARGET', targetId: rulingTargetId };
        }
        if (gameContext && Array.isArray(gameContext.players)) {
          var rulingTarget = gameContext.players.find(function(player) {
            return player && player.id === rulingTargetId;
          }) || null;
          var hasJudgeablePendingForce = Array.isArray(this.pendingForces) && this.pendingForces.some(function(force) {
            if (!force || (force.type !== 'fortune' && force.type !== 'curse')) return false;
            var recipientId = null;
            if (force.type === 'curse') {
              recipientId = force.targetId != null ? force.targetId : null;
            } else if (force.targetId != null) {
              recipientId = force.targetId;
            } else if (force.protectId != null) {
              recipientId = force.protectId;
            } else {
              recipientId = force.ownerId != null ? force.ownerId : null;
            }
            return recipientId === rulingTargetId;
          });
          if (!rulingTarget || ((rulingTarget.isActive === false || rulingTarget.folded) && !hasJudgeablePendingForce)) {
            return { ok: false, reason: 'NO_RULING_TARGET', targetId: rulingTargetId };
          }
        }
      }
      if (skill.effect === EFFECT.CLAIRVOYANCE) {
        var vvTargetId = finalOptions.targetId != null ? finalOptions.targetId : null;
        if (vvTargetId == null) {
          return { ok: false, reason: 'NO_VV_TARGET' };
        }
        var vvEntrySize = Math.max(0, Number(finalOptions.entrySize != null ? finalOptions.entrySize : 0) || 0);
        if (vvEntrySize < 1 || vvEntrySize > 3) {
          return { ok: false, reason: 'INVALID_VV_ENTRY_SIZE', entrySize: finalOptions.entrySize };
        }
        var vvDirection = String(finalOptions.direction || '').toLowerCase();
        if (vvDirection !== 'bullish' && vvDirection !== 'bearish') {
          return { ok: false, reason: 'INVALID_VV_DIRECTION', direction: finalOptions.direction };
        }
      }
      if (skill.effect === EFFECT.BUBBLE_LIQUIDATION) {
        var vvLiquidationTargetId = finalOptions.targetId != null ? finalOptions.targetId : null;
        if (vvLiquidationTargetId == null) {
          return { ok: false, reason: 'NO_VV_TARGET' };
        }
        var vvLedger = this.assetLedger;
        var vvPositions = [];
        if (vvLedger && typeof vvLedger.getAsset === 'function') {
          var vvPositionAsset = vvLedger.getAsset(vvLiquidationTargetId, 'vv_positions');
          if (vvPositionAsset && Array.isArray(vvPositionAsset.positions)) vvPositions = vvPositionAsset.positions;
        }
        var hasOwnVvPosition = vvPositions.some(function(pack) {
          return pack && pack.ownerId === skill.ownerId;
        });
        if (!hasOwnVvPosition) {
          return { ok: false, reason: 'NO_VV_POSITION', targetId: vvLiquidationTargetId };
        }
      }
      if (skill.effect === EFFECT.DEAL_CARD) {
        var cotaCardType = String(finalOptions.cardType || '').toLowerCase();
        if (cotaCardType !== 'good' && cotaCardType !== 'bad' && cotaCardType !== 'misc') {
          return { ok: false, reason: 'INVALID_COTA_CARD_TYPE', cardType: finalOptions.cardType };
        }
        var cotaLedger = this.assetLedger;
        var cotaSlotCount = 3;
        var cotaCards = [];
        if (cotaLedger && typeof cotaLedger.getValue === 'function') {
          cotaSlotCount = Math.max(0, Number(cotaLedger.getValue(skill.ownerId, 'cota_slot_count') || 3));
        }
        if (cotaLedger && typeof cotaLedger.getAsset === 'function') {
          var cotaCardsAsset = cotaLedger.getAsset(skill.ownerId, 'cota_cards');
          if (cotaCardsAsset && Array.isArray(cotaCardsAsset.cards)) cotaCards = cotaCardsAsset.cards;
        }
        if (Math.max(0, cotaSlotCount - cotaCards.length) <= 0) {
          return {
            ok: false,
            reason: 'NO_COTA_EMPTY_SLOT',
            slotCount: cotaSlotCount,
            cardCount: cotaCards.length
          };
        }
      }
      if (skill.effect === EFFECT.GATHER_OR_SPREAD) {
        var cotaMode = String(finalOptions.mode || '').toLowerCase();
        if (cotaMode !== 'gather' && cotaMode !== 'spread') {
          return { ok: false, reason: 'INVALID_COTA_MODE', mode: finalOptions.mode };
        }
      }
      return { ok: true };
    },

    _getSkillAvailabilityMessage(reason, meta) {
      const data = meta || {};
      const messages = {
        SKILL_NOT_FOUND: '技能不存在',
        NOT_ACTIVE_TYPE: '被动技能无法手动激活',
        PENDING_IMPLEMENTATION: '技能模块接入中',
        NOT_BETTING_PHASE: '当前阶段不可用',
        NOT_PLAYER_TURN: '未到行动回合',
        PHASE_DISABLED: '当前街不可用',
        PENDING_FORCE: '同类技能已待结算',
        BACKLASH_ACTIVE: '魔运反噬中',
        NO_USES_REMAINING: '本局已使用完毕',
        STREET_USE_LIMIT: '本街已使用',
        ON_COOLDOWN: '冷却中 (' + (data.cooldown || 0) + '轮)',
        SEALED: '封印中 (' + (data.sealed || 0) + '轮)',
        INSUFFICIENT_MANA: '魔运不足 (需要 ' + (data.cost || 0) + ')',
        MATCH_SCOPED_USED: '本局已发动过',
        NO_BENEDICTION_TARGET: '需要指定一个非自身目标',
        NO_RULING_TARGET: '需要指定一个有效的改判目标',
        NO_VV_TARGET: '需要指定一个有效的建仓/清算目标',
        NO_VV_POSITION: '该目标没有可清算的当前投资轮',
        INVALID_VV_ENTRY_SIZE: '需要选择 1 / 2 / 3 档建仓',
        INVALID_VV_DIRECTION: '需要选择看涨或看跌方向',
        NO_DEBT_TARGET: '目标没有债蚀',
        NO_WILD_CARD: '没有可用鬼牌',
        NO_REWRITE_TARGET: '需要指定诅咒目标',
        INVALID_BLIND_BOX_TARGETS: '盲盒派对需要两个有效目标',
        INSUFFICIENT_WILD_CARD: '鬼牌不足',
        NO_COTA_EMPTY_SLOT: '没有空槽位',
        INVALID_COTA_CARD_TYPE: '需要选择要发入的牌',
        INVALID_COTA_MODE: '需要选择收牌或铺牌'
      };
      return messages[reason] || '技能不可用';
    },

    _getSkillAvailabilityFailure(skill, reason, extra) {
      const payload = Object.assign({
        ok: false,
        disabled: true,
        reason: reason,
        message: this._getSkillAvailabilityMessage(reason, extra),
        skill: skill && skill.skillKey,
        manaPoolId: skill ? this._getSkillManaPoolId(skill) : null,
        cooldown: skill ? Math.max(0, Number(skill.currentCooldown || 0)) : 0,
        sealed: skill ? Math.max(0, Number(skill._sealed || 0)) : 0,
        cost: 0,
        flags: {}
      }, extra || {});
      payload.message = payload.message || this._getSkillAvailabilityMessage(reason, payload);
      return payload;
    },

    _isSkillQueuedForOwner(skill) {
      if (!skill || !Array.isArray(this.pendingForces)) return false;
      for (var i = 0; i < this.pendingForces.length; i++) {
        var force = this.pendingForces[i];
        if (!force || force.ownerId !== skill.ownerId) continue;
        if (force._assetPassive) continue;
        if (force.type === skill.effect) return true;
        if (skill.effect === EFFECT.CURSE && force.type === 'curse') return true;
      }
      return false;
    },

    _isSkillRiverAllowed(skill) {
      if (!skill) return false;
      if (RIVER_INFO_EFFECTS[skill.effect]) return true;
      return skill.effect === EFFECT.SKILL_SEAL;
    },

    getSkillAvailability(uniqueIdOrSkill, gameContext, options) {
      const rawOptions = options || {};
      const skill = typeof uniqueIdOrSkill === 'string'
        ? this.skills.get(uniqueIdOrSkill)
        : uniqueIdOrSkill;
      if (!skill) return this._getSkillAvailabilityFailure(null, 'SKILL_NOT_FOUND');

      var finalOptions = Object.assign({}, rawOptions);
      var ctx = finalOptions.gameContext || gameContext || null;
      if (finalOptions.resolveOptions !== false && finalOptions._resolvedAvailabilityOptions !== true) {
        finalOptions = this._resolveSkillExecutionOptions(skill, null, ctx, finalOptions);
        ctx = finalOptions.gameContext || ctx;
      }

      const isToggle = skill.activation === ACTIVATION.TOGGLE;
      const isActive = skill.activation === ACTIVATION.ACTIVE;
      const isTriggered = skill.activation === ACTIVATION.TRIGGERED;
      const allowTriggered = rawOptions.allowTriggered === true;
      const cost = this._getSkillActualManaCost(skill, Object.assign({}, finalOptions, { consumeAssetRisk: false }));
      const flags = {
        noUsesLeft: skill.usesPerGame > 0 && skill.gameUsesRemaining <= 0,
        streetUseCapped: skill.usesPerStreet > 0 && this._getStreetScopedUseCount(skill) >= skill.usesPerStreet,
        queued: rawOptions.checkPendingForces === true && this._isSkillQueuedForOwner(skill)
      };

      if (!isActive && !isToggle && !(allowTriggered && isTriggered)) {
        return this._getSkillAvailabilityFailure(skill, 'NOT_ACTIVE_TYPE', { cost: cost, flags: flags });
      }
      if (skill.pendingImplementation) {
        return this._getSkillAvailabilityFailure(skill, 'PENDING_IMPLEMENTATION', { cost: cost, flags: flags });
      }

      const phase = ctx && ctx.phase ? String(ctx.phase) : '';
      const bettingPhase = ['preflop', 'flop', 'turn', 'river'].indexOf(phase) >= 0;
      if ((rawOptions.requireBettingPhase === true || rawOptions.enforcePhaseRules === true) && phase && !bettingPhase) {
        return this._getSkillAvailabilityFailure(skill, 'NOT_BETTING_PHASE', { cost: cost, flags: flags });
      }
      const requirePlayerTurn = rawOptions.requirePlayerTurn === true ||
        (skill.ownerType === 'human' && ctx && Object.prototype.hasOwnProperty.call(ctx, 'isPlayerTurn') && rawOptions.allowOutOfTurn !== true);
      if (requirePlayerTurn && ctx && ctx.isPlayerTurn !== true) {
        return this._getSkillAvailabilityFailure(skill, 'NOT_PLAYER_TURN', { cost: cost, flags: flags });
      }
      if (rawOptions.enforcePhaseRules === true && phase === 'river' && !this._isSkillRiverAllowed(skill)) {
        return this._getSkillAvailabilityFailure(skill, 'PHASE_DISABLED', { cost: cost, flags: flags });
      }

      if (rawOptions.skipOptionValidation !== true) {
        var validation = this._validateSkillExecution(skill, ctx, finalOptions);
        if (!validation.ok) {
          return this._getSkillAvailabilityFailure(skill, validation.reason, Object.assign({ cost: cost, flags: flags }, validation));
        }
      }

      const ownerBacklash = this._getBacklashState(this._getSkillManaPoolId(skill));
      if (ownerBacklash.active) {
        return this._getSkillAvailabilityFailure(skill, 'BACKLASH_ACTIVE', { counter: ownerBacklash.counter, cost: cost, flags: flags });
      }
      if (flags.noUsesLeft) {
        return this._getSkillAvailabilityFailure(skill, 'NO_USES_REMAINING', { usesPerGame: skill.usesPerGame, cost: cost, flags: flags });
      }
      if (flags.streetUseCapped) {
        return this._getSkillAvailabilityFailure(skill, 'STREET_USE_LIMIT', { usesPerStreet: skill.usesPerStreet, cost: cost, flags: flags });
      }
      if (skill.currentCooldown > 0) {
        return this._getSkillAvailabilityFailure(skill, 'ON_COOLDOWN', { cooldown: skill.currentCooldown, cost: cost, flags: flags });
      }
      if (skill._sealed > 0) {
        return this._getSkillAvailabilityFailure(skill, 'SEALED', { sealed: skill._sealed, cost: cost, flags: flags });
      }
      if (flags.queued) {
        return this._getSkillAvailabilityFailure(skill, 'PENDING_FORCE', { cost: cost, flags: flags });
      }
      if (cost > 0) {
        var manaPool = this._getSkillManaPool(skill);
        if (!manaPool || manaPool.current < cost) {
          return this._getSkillAvailabilityFailure(skill, 'INSUFFICIENT_MANA', { cost: cost, flags: flags });
        }
      }

      return {
        ok: true,
        disabled: false,
        reason: null,
        message: '',
        skill: skill.skillKey,
        manaPoolId: this._getSkillManaPoolId(skill),
        cooldown: Math.max(0, Number(skill.currentCooldown || 0)),
        sealed: Math.max(0, Number(skill._sealed || 0)),
        cost: cost,
        flags: flags,
        options: finalOptions
      };
    },

    _getSkillDynamicManaCost(skill, finalOptions) {
      if (!skill) return 0;
      var cost = Math.max(0, Number(skill.manaCost || 0));
      if (skill.effect === EFFECT.CLAIRVOYANCE) {
        var vvEntrySize = Math.max(1, Math.min(3, Number(finalOptions && finalOptions.entrySize != null ? finalOptions.entrySize : 1) || 1));
        cost += Number(VV_CLAIRVOYANCE_ENTRY_SIZE_EXTRA_COST[vvEntrySize] || 0);
      }
      return cost;
    },

    _getSkillActualManaCost(skill, finalOptions) {
      var actualCost = this._getSkillDynamicManaCost(skill, finalOptions);
      if (actualCost > 0 && this.traitCostFn) {
        actualCost = this.traitCostFn(skill.ownerId, actualCost);
      }
      if (this.assetDeckAdapter && typeof this.assetDeckAdapter.resolveSkillCost === 'function') {
        var resolvedCost = this.assetDeckAdapter.resolveSkillCost(this.assetModifiers, skill, actualCost, {
          passiveState: this._assetPassiveState,
          consumeAssetRisk: finalOptions && finalOptions.consumeAssetRisk === true
        });
        if (resolvedCost && resolvedCost.finalCost != null) {
          actualCost = resolvedCost.finalCost;
          if (skill) skill._assetCost = resolvedCost;
          if (skill && Array.isArray(resolvedCost.riskRolls)) skill._assetRiskRolls = resolvedCost.riskRolls;
        }
      }
      return Math.max(0, Number(actualCost || 0));
    },

    getSkillActualManaCost(skill, finalOptions) {
      return this._getSkillActualManaCost(skill, finalOptions || {});
    }
  });
})(typeof window !== 'undefined' ? window : global);
