/**
 * Runtime Module: BuiltinRoleModules
 * 角色：内置角色 AI 修正注册器。
 *
 * 职责：
 * - 通过 `registerRuntimeModule()` 注册当前内置角色的专属 AI 行为
 * - 作为运行时模块写法的第一份模板
 * - 收纳“仍值得内置”的角色行为，而不是把逻辑写回主引擎
 *
 * 暴露：
 * - `window.AceBuiltinModules.registerBuiltinRoleModules(runtimeApi)`
 * - `window.AceBuiltinModules.registerSiaRoleModule(runtimeApi)`（兼容旧入口）
 *
 * 边界：
 * - 这里只放角色行为修正
 * - 不放技能定义、trait 公式、UI 逻辑
 */
(function(global) {
  'use strict';

  var siaProfileHandler = {
    shouldUseSkill: function(roleCtx, fallback) {
      return decideSiaSkill(roleCtx, fallback);
    },
    selectSkillTarget: function(roleCtx, fallback) {
      return selectSiaSkillTarget(roleCtx, fallback);
    },
    augmentSkillOptions: function(roleCtx, fallback) {
      return augmentSiaSkillOptions(roleCtx, fallback);
    }
  };

  var rinoRoleHandler = {
    shouldUseSkill: function(roleCtx, fallback) {
      var base = fallback(roleCtx);
      var skill = roleCtx.skill || {};
      var phase = roleCtx.ctx && roleCtx.ctx.phase;
      var owner = roleCtx.owner || {};
      var mana = roleCtx.mana || {};
      var chips = Math.max(1, owner.chips || 1);
      var commit = Math.min(1, (owner.totalBet || 0) / chips);
      var infoPressure = getInfoPressure(roleCtx);
      var recentScout = hasRecentScout(roleCtx);
      var anyScout = !!(owner.ai && Array.isArray(owner.ai.scoutMemory) && owner.ai.scoutMemory.length);
      var enemyFortune = hasEnemyFortunePressure(roleCtx);
      var manaCurrent = Math.max(0, Number(mana.current || 0));
      var manaMax = Math.max(1, Number(mana.max || 0));
      var preserveDecree = hasReadyOwnerSkill(roleCtx, 'royal_decree') && manaCurrent <= 40;
      var preserveGrandWish = hasReadyOwnerSkill(roleCtx, 'grand_wish') && manaCurrent <= 28;

      if (skill.effect === 'heart_read') {
        if (manaCurrent < 15) return false;
        if (recentScout) return false;
        if (preserveDecree || preserveGrandWish) return false;

        if (phase === 'preflop') {
          if (!enemyFortune && !infoPressure && anyScout) return false;
          if (enemyFortune) return manaCurrent >= 30 && (base || Math.random() < 0.18);
          if (infoPressure) return manaCurrent >= 24 && (base || Math.random() < 0.14);
          return !anyScout && manaCurrent / manaMax >= 0.60 && (base || Math.random() < 0.06);
        }

        if (phase === 'flop') {
          if (!enemyFortune && !infoPressure && anyScout) return false;
          return manaCurrent >= 24 && (base || Math.random() < (infoPressure ? 0.24 : enemyFortune ? 0.18 : 0.08));
        }

        if (phase === 'turn') {
          if (!enemyFortune && !infoPressure) return false;
          return manaCurrent >= 20 && (base || Math.random() < (infoPressure ? 0.20 : 0.12));
        }

        if (phase === 'river') {
          if (!enemyFortune || manaCurrent < 18) return false;
          return base || Math.random() < 0.08;
        }

        return false;
      }

      if (skill.effect === 'royal_decree') {
        if (phase === 'preflop' || phase === 'river') return false;
        if (recentScout && commit < 0.22) return false;
        if (phase === 'turn') {
          return base || Math.random() < (0.40 + commit * 0.30 + (enemyFortune ? 0.12 : 0));
        }
        if (phase === 'flop') {
          if (commit < 0.16 && !enemyFortune) return false;
          return base || Math.random() < (0.20 + commit * 0.24 + (enemyFortune ? 0.10 : 0));
        }
      }

      return base;
    },
    augmentSkillOptions: function(roleCtx, fallback) {
      return augmentRinoSkillOptions(roleCtx, fallback);
    }
  };

  function getStreetIndex(phase) {
    var key = String(phase || '').toLowerCase();
    if (key === 'preflop') return 0;
    if (key === 'flop') return 1;
    if (key === 'turn') return 2;
    if (key === 'river') return 3;
    return 99;
  }

  function getNextStreetPhase(phase) {
    var key = String(phase || '').toLowerCase();
    if (key === 'preflop') return 'flop';
    if (key === 'flop') return 'turn';
    if (key === 'turn') return 'river';
    return null;
  }

  function createKuzuhaRoleHandler(runtimeApi) {
    function getHouseEdgeDebtGain(currentDebt) {
      return currentDebt > 0 ? 23 : 20;
    }

    function getBestDebtTarget(ownerId, opponents, effect, phase) {
      var ranked = (opponents || []).slice().sort(function(a, b) {
        return scoreDebtTarget(ownerId, b, effect, phase) - scoreDebtTarget(ownerId, a, effect, phase);
      });
      return ranked[0] || null;
    }

    function scoreDebtTarget(ownerId, target, effect, phase) {
      if (!target) return -9999;
      var debt = getKuzuhaDebtRotValue(runtimeApi, ownerId, target.id);
      var threat = scoreThreatTarget(target);
      var pressure = Math.max(0, Number(target.totalBet || 0) + Number(target.currentBet || 0));
      var score = threat * 0.6 + pressure * 0.08;

      if (effect === 'debt_call') {
        if (debt <= 0) return -9999;
        score += debt * 4;
        if (debt >= 40) score += (phase === 'river' ? 90 : 18);
        else if (debt >= 30) score += (phase === 'turn' || phase === 'river') ? 70 : 26;
        else if (debt >= 20) score += (phase === 'river' ? 32 : 10);
        return score;
      }

      if (debt >= 40) score -= (phase === 'river' ? 8 : 40);
      else if (debt >= 30) score += 46;
      else if (debt >= 20) score += 72;
      else if (debt > 0) score += 38;
      else score += 28;

      var projected = Math.min(60, debt + getHouseEdgeDebtGain(debt));
      if (projected >= 40) score += 34;
      else if (projected >= 30) score += 16;
      return score;
    }

    function buildKuzuhaPlan(roleCtx) {
      var owner = roleCtx.owner || {};
      var mana = roleCtx.mana || {};
      var manaCurrent = Math.max(0, Number(mana.current || 0));
      var phase = roleCtx.ctx && roleCtx.ctx.phase;
      var opponents = roleCtx.opponents || [];
      var debtTarget = getBestDebtTarget(owner.id, opponents, 'debt_call', phase);
      var edgeTarget = getBestDebtTarget(owner.id, opponents, 'house_edge', phase);
      var debtTargetId = debtTarget ? debtTarget.id : null;
      var edgeTargetId = edgeTarget ? edgeTarget.id : null;
      var debtValue = debtTargetId != null ? getKuzuhaDebtRotValue(runtimeApi, owner.id, debtTargetId) : 0;
      var edgeDebt = edgeTargetId != null ? getKuzuhaDebtRotValue(runtimeApi, owner.id, edgeTargetId) : 0;
      var canCollect = debtValue >= 30 && manaCurrent >= 34;
      var shouldAgeFortyDebt = debtValue >= 40 && phase !== 'river';
      var reserveMana = canCollect ? 34 : (manaCurrent >= 18 ? 18 : 0);

      return {
        phase: phase,
        manaCurrent: manaCurrent,
        debtTargetId: debtTargetId,
        debtValue: debtValue,
        edgeTargetId: edgeTargetId,
        edgeDebt: edgeDebt,
        canCollect: canCollect,
        shouldAgeFortyDebt: shouldAgeFortyDebt,
        reserveMana: reserveMana
      };
    }

    function selectTarget(roleCtx) {
      var effect = roleCtx.skill && roleCtx.skill.effect;
      var plan = buildKuzuhaPlan(roleCtx);
      if (effect === 'debt_call') return plan.debtTargetId;
      if (effect === 'house_edge') return plan.edgeTargetId;
      return null;
    }

    function isKuzuhaBoss(roleCtx) {
      var difficulty = String(roleCtx && roleCtx.difficulty || '').toLowerCase();
      var owner = roleCtx && roleCtx.owner ? roleCtx.owner : {};
      var profile = String(owner.difficultyProfile || owner.difficulty || '').toLowerCase();
      return difficulty === 'kuzuha' || difficulty === 'boss' || profile === 'kuzuha' || profile === 'boss';
    }

    return {
      shouldUseSkill: function(roleCtx, fallback) {
        var base = fallback(roleCtx);
        var skill = roleCtx.skill || {};
        var phase = roleCtx.ctx && roleCtx.ctx.phase;
        var plan = buildKuzuhaPlan(roleCtx);
        var targetId = skill.effect === 'debt_call' ? plan.debtTargetId : plan.edgeTargetId;
        var debt = skill.effect === 'debt_call' ? plan.debtValue : plan.edgeDebt;
        var manaCurrent = plan.manaCurrent;
        var bossMode = isKuzuhaBoss(roleCtx);
        var seedChance = bossMode
          ? (phase === 'preflop' ? 0.38 : phase === 'flop' ? 0.72 : phase === 'turn' ? 0.58 : 0.34)
          : (phase === 'preflop' ? 0.14 : phase === 'flop' ? 0.34 : 0.24);
        var rollChance = bossMode
          ? (phase === 'flop' ? 0.82 : phase === 'turn' ? 0.68 : 0.50)
          : (phase === 'flop' ? 0.48 : 0.36);

        if (skill.effect === 'debt_call') {
          if (targetId == null || debt <= 0 || manaCurrent < 34) return false;
          if (debt >= 40 && phase !== 'river' && !bossMode) return false;
          if (bossMode && debt >= 40 && phase === 'turn') return base || Math.random() < 0.28;
          if (debt >= 30) return true;
          if (phase === 'river' && debt >= 20) return base || Math.random() < 0.52;
          if (phase === 'turn' && debt >= 24) return base || Math.random() < 0.38;
          return false;
        }

        if (skill.effect === 'house_edge') {
          if (targetId == null || manaCurrent < 18) return false;
          if (debt >= 40) return bossMode && phase === 'river' && manaCurrent >= 52 ? (base || Math.random() < 0.18) : false;
          if (debt >= 20) return true;
          if (debt > 0) return base || Math.random() < rollChance;
          return base || Math.random() < seedChance;
        }

        if (skill.effect === 'fortune') {
          var manaCost = Math.max(0, Number(skill.manaCost || 0));
          if (skill.skillKey === 'grand_wish' || skill.skillKey === 'minor_wish') {
            if (plan.shouldAgeFortyDebt) return false;
            if (plan.canCollect && (manaCurrent - manaCost) < 34) return false;
            if (plan.edgeTargetId != null && plan.edgeDebt < 30 && (manaCurrent - manaCost) < 18) return false;
            if (phase === 'preflop' && plan.edgeTargetId != null && plan.edgeDebt <= 0) return false;
            if (phase === 'flop' && plan.edgeDebt >= 20 && plan.edgeDebt < 40) return false;
            if (bossMode && plan.edgeTargetId != null && plan.edgeDebt < 20 && (manaCurrent - manaCost) < 36) return false;
            if (bossMode && phase !== 'river' && plan.edgeTargetId != null && plan.edgeDebt <= 0) return false;
          }
        }

        return base;
      },
      selectSkillTarget: function(roleCtx, fallback) {
        var targetId = selectTarget(roleCtx);
        return targetId != null ? targetId : fallback(roleCtx);
      },
      augmentSkillOptions: function(roleCtx, fallback) {
        var options = fallback(roleCtx) || {};
        var owner = roleCtx.owner || {};
        var plan = buildKuzuhaPlan(roleCtx);
        var targetId = roleCtx.targetId != null ? roleCtx.targetId : selectTarget(roleCtx);
        var targetDebt = targetId != null ? getKuzuhaDebtRotValue(runtimeApi, owner.id, targetId) : 0;
        return Object.assign({}, options, {
          targetId: targetId,
          targetDebt: targetDebt,
          debtBand: targetDebt >= 40 ? 'high' : targetDebt >= 30 ? 'collect' : targetDebt >= 20 ? 'prime' : targetDebt > 0 ? 'seeded' : 'fresh',
          reserveMana: plan.reserveMana,
          rolePlan: roleCtx.skill && roleCtx.skill.effect === 'debt_call'
            ? 'kuzuha_collect'
            : (targetDebt >= 20 ? 'kuzuha_roll_forward' : 'kuzuha_seed_debt')
        });
      }
    };
  }

  function createTrixieRoleHandler(runtimeApi) {
    function isTrixieBoss(roleCtx) {
      var difficulty = String(roleCtx && roleCtx.difficulty || '').toLowerCase();
      var owner = roleCtx && roleCtx.owner ? roleCtx.owner : {};
      var profile = String(owner.difficultyProfile || owner.difficulty || '').toLowerCase();
      return difficulty === 'trixie' || difficulty === 'boss' || profile === 'trixie' || profile === 'boss';
    }

    function buildPlan(roleCtx) {
      var owner = roleCtx.owner || {};
      var phase = roleCtx.ctx && roleCtx.ctx.phase;
      var opponents = getActiveOpponents(runtimeApi, owner.id);
      var wildCard = getTrixieAssetValue(runtimeApi, owner.id, TRIXIE_WILD_CARD_KEY);
      var chipRatio = getPlayerChipRatio(owner);
      var primaryTarget = pickRoleTarget({ opponents: opponents });
      var manaCurrent = Math.max(0, Number(roleCtx.mana && roleCtx.mana.current || 0));
      var bossMode = isTrixieBoss(roleCtx);
      var pressure = Math.max(0, Number(owner.currentBet || 0) + Number(owner.totalBet || 0));
      var targetChipRatio = getPlayerChipRatio(primaryTarget || {});
      return {
        phase: phase,
        wildCard: wildCard,
        chipRatio: chipRatio,
        lowChip: chipRatio <= 0.55,
        dangerChip: chipRatio <= 0.35,
        trailing: chipRatio < 0.85,
        manaCurrent: manaCurrent,
        pressure: pressure,
        bossMode: bossMode,
        opponents: opponents,
        primaryTargetId: primaryTarget ? primaryTarget.id : null,
        targetChipRatio: targetChipRatio,
        pressureTarget: targetChipRatio >= 1.15
      };
    }

    function pickRuleRewritePreset(plan) {
      if (!plan || plan.wildCard < 20) return null;
      if (plan.dangerChip && plan.wildCard >= 24) {
        return {
          key: 'self_patch',
          rewriteMode: 'fortune_self',
          rewriteModifier: 'none',
          rewriteGlobal: false,
          targetId: null,
          rolePlan: 'trixie_self_patch'
        };
      }
      if (plan.lowChip && plan.wildCard >= 36 && plan.phase !== 'river') {
        return {
          key: 'self_buffer',
          rewriteMode: 'fortune_self',
          rewriteModifier: 'delay',
          rewriteGlobal: false,
          targetId: null,
          rolePlan: 'trixie_self_buffer'
        };
      }
      if (plan.primaryTargetId != null && plan.wildCard >= 48 && (plan.phase === 'flop' || plan.phase === 'turn')) {
        return {
          key: 'double_press',
          rewriteMode: 'curse_target',
          rewriteModifier: 'extend',
          rewriteGlobal: false,
          targetId: plan.primaryTargetId,
          rolePlan: 'trixie_double_press'
        };
      }
      if (plan.primaryTargetId != null && plan.wildCard >= 28 && (plan.pressureTarget || plan.phase === 'river' || plan.trailing)) {
        return {
          key: 'finisher',
          rewriteMode: 'curse_target',
          rewriteModifier: 'none',
          rewriteGlobal: false,
          targetId: plan.primaryTargetId,
          rolePlan: 'trixie_finisher'
        };
      }
      if (plan.bossMode && plan.primaryTargetId != null && plan.wildCard >= 34 && plan.phase === 'preflop') {
        return {
          key: 'double_press',
          rewriteMode: 'curse_target',
          rewriteModifier: 'extend',
          rewriteGlobal: false,
          targetId: plan.primaryTargetId,
          rolePlan: 'trixie_double_press'
        };
      }
      return null;
    }

    function pickBlindBoxPreset(plan, ownerId) {
      if (!plan || plan.phase === 'preflop' || plan.phase === 'river' || plan.wildCard < 50 || plan.primaryTargetId == null) return null;
      if (plan.dangerChip || (plan.trailing && plan.chipRatio <= 0.70)) {
        return {
          key: 'self_rescue',
          participantIds: [ownerId, plan.primaryTargetId],
          blindBoxMode: 'self_target',
          rolePlan: 'trixie_self_rescue'
        };
      }
      if (plan.bossMode && plan.opponents.length >= 2 && plan.wildCard >= 100) {
        return {
          key: 'enemy_shuffle',
          participantIds: [plan.opponents[0].id, plan.opponents[1].id],
          blindBoxMode: 'others',
          rolePlan: 'trixie_enemy_shuffle'
        };
      }
      return null;
    }

    return {
      shouldUseSkill: function(roleCtx, fallback) {
        var skill = roleCtx.skill || {};
        var plan = buildPlan(roleCtx);
        var owner = roleCtx.owner || {};

        if (skill.effect === 'rule_rewrite') {
          return !!pickRuleRewritePreset(plan);
        }

        if (skill.effect === 'blind_box') {
          if (isMatchScopedSkillUsed(runtimeApi, owner && owner.id, 'blind_box')) return false;
          return !!pickBlindBoxPreset(plan, owner && owner.id);
        }

        return fallback(roleCtx);
      },
      selectSkillTarget: function(roleCtx, fallback) {
        var skill = roleCtx.skill || {};
        var plan = buildPlan(roleCtx);
        var owner = roleCtx.owner || {};
        if (skill.effect === 'rule_rewrite') {
          var rewritePreset = pickRuleRewritePreset(plan);
          if (rewritePreset && rewritePreset.targetId != null) return rewritePreset.targetId;
        }
        if (skill.effect === 'blind_box') {
          var blindPreset = pickBlindBoxPreset(plan, owner && owner.id);
          if (blindPreset && Array.isArray(blindPreset.participantIds)) {
            if (blindPreset.blindBoxMode === 'self_target') return blindPreset.participantIds[1];
            return blindPreset.participantIds[0] != null ? blindPreset.participantIds[0] : null;
          }
        }
        return typeof fallback === 'function' ? fallback(roleCtx) : null;
      },
      augmentSkillOptions: function(roleCtx, fallback) {
        var options = fallback(roleCtx) || {};
        var owner = roleCtx.owner || {};
        var plan = buildPlan(roleCtx);

        if (roleCtx.skill && roleCtx.skill.effect === 'rule_rewrite') {
          var rewritePreset = pickRuleRewritePreset(plan);
          if (!rewritePreset) return options;
          return Object.assign({}, options, {
            targetId: rewritePreset.targetId,
            rewriteMode: rewritePreset.rewriteMode,
            rewriteModifier: rewritePreset.rewriteModifier,
            rewriteGlobal: rewritePreset.rewriteGlobal,
            rewritePreset: rewritePreset.key,
            reserveMana: plan.bossMode ? 10 : 0,
            rolePlan: rewritePreset.rolePlan
          });
        }

        if (roleCtx.skill && roleCtx.skill.effect === 'blind_box') {
          var blindPreset = pickBlindBoxPreset(plan, owner.id);
          if (!blindPreset) return options;
          return Object.assign({}, options, {
            participantIds: blindPreset.participantIds.slice(),
            blindBoxMode: blindPreset.blindBoxMode,
            blindBoxPreset: blindPreset.key,
            rolePlan: blindPreset.rolePlan
          });
        }

        return options;
      }
    };
  }

  function createEulaliaProfileHandler(runtimeApi) {
    function getForcePower(force) {
      if (!force) return 0;
      if (force.effectivePower != null) return Math.max(0, Number(force.effectivePower || 0));
      return Math.max(0, Number(force.power || 0));
    }

    function buildEulaliaCurseMap(roleCtx) {
      var pending = Array.isArray(roleCtx.pendingForces) ? roleCtx.pendingForces : [];
      var owner = roleCtx.owner || {};
      var outgoingByOwner = Object.create(null);
      var incomingByTarget = Object.create(null);
      var enemyCurseTotal = 0;
      var selfIncomingTotal = 0;
      var selfIncomingCount = 0;

      for (var i = 0; i < pending.length; i++) {
        var force = pending[i];
        if (!force || force.type !== 'curse') continue;
        var power = getForcePower(force);
        if (power <= 0) continue;
        var sourceOwnerId = force.ownerId;
        var targetId = force.targetId;

        if (sourceOwnerId != null && sourceOwnerId !== owner.id) {
          outgoingByOwner[sourceOwnerId] = (outgoingByOwner[sourceOwnerId] || 0) + power;
          enemyCurseTotal += power;
        }
        if (targetId != null) {
          incomingByTarget[targetId] = (incomingByTarget[targetId] || 0) + power;
        }
        if (targetId === owner.id && sourceOwnerId !== owner.id) {
          selfIncomingTotal += power;
          selfIncomingCount += 1;
        }
      }

      return {
        outgoingByOwner: outgoingByOwner,
        incomingByTarget: incomingByTarget,
        enemyCurseTotal: enemyCurseTotal,
        selfIncomingTotal: selfIncomingTotal,
        selfIncomingCount: selfIncomingCount
      };
    }

    function resolveEulaliaBlessTarget(roleCtx, plan) {
      var opponents = roleCtx.opponents || [];
      var best = null;
      var bestScore = -9999;
      var curseMap = plan && plan.curseMap ? plan.curseMap : buildEulaliaCurseMap(roleCtx);

      for (var i = 0; i < opponents.length; i++) {
        var target = opponents[i];
        if (!target) continue;
        var outgoing = Math.max(0, Number(curseMap.outgoingByOwner[target.id] || 0));
        var incoming = Math.max(0, Number(curseMap.incomingByTarget[target.id] || 0));
        var threat = scoreThreatTarget(target);
        var score = outgoing * 3.2 + incoming * 0.9 + threat * 0.08;
        if (plan && plan.layers >= 4 && outgoing > 0) score += 14;
        if (plan && plan.absolutionActive && outgoing > 0) score += 12;
        if (score > bestScore) {
          bestScore = score;
          best = target;
        }
      }

      if (best && best.id != null) return best.id;
      var fallback = pickRoleTarget(roleCtx);
      return fallback && fallback.id != null ? fallback.id : null;
    }

    function buildEulaliaPlan(roleCtx) {
      var owner = roleCtx.owner || {};
      var mana = roleCtx.mana || {};
      var phase = roleCtx.ctx && roleCtx.ctx.phase;
      var manaCurrent = Math.max(0, Number(mana.current || 0));
      var chipRatio = getPlayerChipRatio(owner);
      var nominalBurden = getEulaliaAssetValue(runtimeApi, owner.id, EULALIA_NOMINAL_BURDEN_KEY);
      var layers = getEulaliaAssetValue(runtimeApi, owner.id, EULALIA_BURDEN_LAYERS_KEY);
      var absolutionTotal = getEulaliaAssetValue(runtimeApi, owner.id, EULALIA_ABSOLUTION_TOTAL_KEY);
      var burstCountdown = getEulaliaAssetValue(runtimeApi, owner.id, EULALIA_BURST_COUNTDOWN_KEY);
      var absolutionActive = isEulaliaAbsorbWindowOpen(runtimeApi, owner.id, phase);
      var curseMap = buildEulaliaCurseMap(roleCtx);
      var targetId = resolveEulaliaBlessTarget(roleCtx, {
        curseMap: curseMap,
        layers: layers,
        absolutionActive: absolutionActive
      });
      var targetCursePower = Math.max(0, Number(curseMap.outgoingByOwner[targetId] || 0));

      return {
        phase: phase,
        manaCurrent: manaCurrent,
        chipRatio: chipRatio,
        nominalBurden: nominalBurden,
        layers: layers,
        absolutionTotal: absolutionTotal,
        burstCountdown: burstCountdown,
        absolutionActive: absolutionActive,
        curseMap: curseMap,
        targetId: targetId,
        targetCursePower: targetCursePower,
        selfIncomingTotal: curseMap.selfIncomingTotal,
        selfIncomingCount: curseMap.selfIncomingCount,
        enemyCurseTotal: curseMap.enemyCurseTotal,
        lowChip: chipRatio <= 0.55,
        preserveBlessMana: targetId != null ? 15 : 0,
        highLayerBurst: layers >= 5
      };
    }

    function shouldUseEulaliaAbsolution(roleCtx) {
      var owner = roleCtx.owner || {};
      var skill = roleCtx.skill || {};
      var phase = roleCtx.ctx && roleCtx.ctx.phase;
      var manaCurrent = Math.max(0, Number(roleCtx.mana && roleCtx.mana.current || 0));
      if (manaCurrent < Math.max(0, Number(skill.manaCost || 0))) return false;
      if (isMatchScopedSkillUsed(runtimeApi, owner.id, 'absolution')) return false;
      if (phase === 'preflop') return true;

      var plan = buildEulaliaPlan(roleCtx);
      if (phase === 'flop') {
        if (plan.selfIncomingCount >= 1 || plan.enemyCurseTotal >= 20) return Math.random() < 0.92;
        return false;
      }
      if (phase === 'turn') {
        if (plan.selfIncomingCount >= 1 || plan.enemyCurseTotal >= 16 || plan.nominalBurden >= 20) return Math.random() < 0.78;
      }
      return false;
    }

    function shouldUseEulaliaBenediction(roleCtx) {
      var skill = roleCtx.skill || {};
      var manaCurrent = Math.max(0, Number(roleCtx.mana && roleCtx.mana.current || 0));
      if (manaCurrent < Math.max(0, Number(skill.manaCost || 0))) return false;
      if (String(roleCtx.ctx && roleCtx.ctx.phase || '').toLowerCase() === 'river') return false;

      var plan = buildEulaliaPlan(roleCtx);
      if (plan.targetId == null) return false;

      var pressure = plan.targetCursePower + plan.selfIncomingTotal * 0.4 + plan.enemyCurseTotal * 0.15;
      if (plan.highLayerBurst && pressure >= 8) return Math.random() < 0.94;
      if (plan.layers >= 3 && pressure >= 12) return Math.random() < 0.78;
      if (plan.absolutionActive && pressure >= 10) return Math.random() < 0.74;
      if (plan.lowChip && pressure >= 10) return Math.random() < 0.62;
      if (pressure >= 18) return Math.random() < 0.52;
      return false;
    }

    function shouldUseEulaliaFortune(roleCtx, fallback) {
      var base = fallback(roleCtx);
      var skill = roleCtx.skill || {};
      var phase = String(roleCtx.ctx && roleCtx.ctx.phase || '').toLowerCase();
      var manaCurrent = Math.max(0, Number(roleCtx.mana && roleCtx.mana.current || 0));
      var manaCost = Math.max(0, Number(skill.manaCost || 0));
      var plan = buildEulaliaPlan(roleCtx);
      var reserve = plan.preserveBlessMana;
      var postCastMana = manaCurrent - manaCost;

      if (phase === 'preflop' && hasReadyOwnerSkill(roleCtx, 'absolution') &&
          !isMatchScopedSkillUsed(runtimeApi, roleCtx.owner && roleCtx.owner.id, 'absolution')) {
        return false;
      }
      if (plan.targetId != null && postCastMana < reserve && plan.targetCursePower > 0) {
        return false;
      }

      if (skill.skillKey === 'grand_wish') {
        if (plan.layers >= 6) return base || Math.random() < 0.82;
        if (plan.layers >= 4 && plan.targetCursePower <= 0) return base || Math.random() < 0.56;
        if (plan.lowChip && plan.layers >= 2) return base || Math.random() < 0.50;
        return base && plan.layers >= 2;
      }

      if (skill.skillKey === 'minor_wish') {
        if (plan.layers >= 5) return base || Math.random() < 0.66;
        if (plan.layers >= 3 && plan.targetCursePower <= 0) return base || Math.random() < 0.42;
        if (plan.absolutionActive && plan.layers >= 2 && postCastMana >= reserve) return base || Math.random() < 0.36;
        return false;
      }

      return base;
    }

    return {
      shouldUseSkill: function(roleCtx, fallback) {
        var skill = roleCtx.skill || {};
        if (skill.effect === 'absolution') {
          return shouldUseEulaliaAbsolution(roleCtx);
        }
        if (skill.effect === 'benediction') {
          return shouldUseEulaliaBenediction(roleCtx);
        }
        if (skill.effect === 'fortune' &&
            (skill.skillKey === 'grand_wish' || skill.skillKey === 'minor_wish')) {
          return shouldUseEulaliaFortune(roleCtx, fallback);
        }
        return fallback(roleCtx);
      },
      selectSkillTarget: function(roleCtx, fallback) {
        var skill = roleCtx.skill || {};
        if (skill.effect === 'benediction') {
          var plan = buildEulaliaPlan(roleCtx);
          if (plan.targetId != null) return plan.targetId;
        }
        return typeof fallback === 'function' ? fallback(roleCtx) : null;
      },
      augmentSkillOptions: function(roleCtx, fallback) {
        var options = fallback(roleCtx) || {};
        var skill = roleCtx.skill || {};
        if (skill.effect !== 'benediction') return options;
        var plan = buildEulaliaPlan(roleCtx);
        return Object.assign({}, options, {
          targetId: plan.targetId,
          cursePressure: plan.targetCursePower,
          burdenLayers: plan.layers,
          rolePlan: plan.layers >= 5 ? 'eulalia_berserk_benediction' : 'eulalia_curse_siphon'
        });
      }
    };
  }

  var VV_MARK_ICON = '../../../assets/svg/star-pupil.svg';
  var VV_BUBBLE_KEYS = ['bubble_fortune', 'bubble_chaos', 'bubble_mana'];
  var VV_POSITION_KEY = 'vv_positions';
  var VV_POSITION_UNIT = 12;
  var VV_DEVIATION_THRESHOLDS = [0.2, 0.4, 0.6];
  var POPPY_MIRACLE_FLAG_KEY = 'poppy_miracle_flag';
  var POPPY_MIRACLE_PENDING_KEY = 'poppy_miracle_pending';
  var POPPY_MIRACLE_PACKS_KEY = 'poppy_miracle_packs';
  var POPPY_STREET_TOTAL_MANA_SPENT_KEY = 'poppy_street_total_mana_spent';
  var POPPY_STREET_PSYCHE_CHAOS_KEY = 'poppy_street_psyche_chaos';
  var POPPY_LAST_MANA_KEY = 'poppy_last_mana';
  var POPPY_MANA_TRACK_KEY = 'poppy_mana_track';
  var POPPY_LUCKY_FIND_PHASE_KEY = 'poppy_lucky_find_phase';
  var POPPY_MIRACLE_MARK_KEY = 'poppy_miracle_mark';
  var POPPY_MIRACLE_ICON = '../../../assets/svg/poppy1.svg';
  var EULALIA_BURDEN_ICON = '../../../assets/svg/boomerang-cross.svg';
  var EULALIA_BURST_ICON = '../../../assets/svg/fast-forward-button.svg';
  var EULALIA_NOMINAL_BURDEN_KEY = 'eulalia_nominal_burden';
  var EULALIA_BURDEN_LAYERS_KEY = 'eulalia_burden_layers';
  var EULALIA_QUEUED_BURDEN_KEY = 'eulalia_queued_burden';
  var EULALIA_CARRYOVER_BURDEN_KEY = 'eulalia_carryover_burden';
  var EULALIA_ABSOLUTION_TOTAL_KEY = 'eulalia_absolution_total';
  var EULALIA_BURST_COUNTDOWN_KEY = 'eulalia_burst_countdown';
  var EULALIA_ABSOLUTION_CONTRACT_KEY = 'eulalia_absolution_contract';
  var EULALIA_ABSORB_WINDOW_CONTRACT_KEY = 'eulalia_absorb_window_contract';
  var EULALIA_STREET_BURDEN_KEY = 'eulalia_street_burden';
  var EULALIA_ABSORB_ACTIVE_KEY = 'eulalia_absorb_active';
  var EULALIA_BURST_PENDING_KEY = 'eulalia_burst_pending';
  var EULALIA_SANCTUARY_PHASE_KEY = 'eulalia_sanctuary_phase';
  var KAKO_EULALIA_BURDEN_TRACK_PREFIX = 'asset:eulalia_burden:';
  var KUZUHA_DEBT_ICON = '../../../assets/svg/fox-head.svg';
  var KUZUHA_DEBT_PREFIX = 'kuzuha_debt_rot:';
  var KUZUHA_CALLED_PREFIX = 'kuzuha_debt_called:';
  var KUZUHA_SETTLED_TOTAL_KEY = 'kuzuha_debt_settled_total';
  var KUZUHA_HIGHWATER_KEY = 'kuzuha_debt_highwater';
  var TRIXIE_WILD_ICON = '../../../assets/svg/card-joker.svg';
  var TRIXIE_BLIND_BOX_ICON = '../../../assets/svg/party-popper.svg';
  var TRIXIE_REWRITE_DELAY_ICON = '../../../assets/svg/fast-forward-button.svg';
  var TRIXIE_REWRITE_EXTEND_ICON = '../../../assets/svg/health-increase.svg';
  var TRIXIE_WILD_CARD_KEY = 'trixie_wild_card';
  var TRIXIE_STREET_FORTUNE_KEY = 'trixie_street_taken_fortune';
  var TRIXIE_STREET_CURSE_KEY = 'trixie_street_taken_curse';
  var TRIXIE_STREET_RAW_FORTUNE_KEY = 'trixie_street_taken_fortune_raw';
  var TRIXIE_STREET_RAW_CURSE_KEY = 'trixie_street_taken_curse_raw';
  var TRIXIE_STREET_BONUS_KEY = 'trixie_street_bonus';
  var TRIXIE_REWRITE_QUEUE_KEY = 'trixie_rewrite_queue';
  var TRIXIE_BLIND_BOX_KEY = 'trixie_blind_box_contract';
  var COTA_SLOT_COUNT_KEY = 'cota_slot_count';
  var COTA_CARDS_KEY = 'cota_cards';
  var COTA_FAULT_STATE_KEY = 'cota_fault_state';
  var COTA_BUST_RATE_KEY = 'cota_bust_rate';
  var COTA_SELF_CURSE_PRESSURE_KEY = 'cota_self_curse_pressure';
  var COTA_FIRST_BUST_BONUS_KEY = 'cota_first_bust_bonus_used';
  var COTA_NEW_CARD_COST_DELTA_KEY = 'cota_new_card_cost_delta';
  var COTA_GOOD_BASE_VALUE_KEY = 'cota_good_base_value';
  var COTA_BAD_BASE_VALUE_KEY = 'cota_bad_base_value';
  var COTA_MISC_BASE_VALUE_KEY = 'cota_misc_base_value';
  var vvManaChangeSnapshot = Object.create(null);
  var COTA_DEFAULT_SLOT_COUNT = 3;
  var COTA_GATHER_VALUE_DELTA = 6;
  var COTA_GATHER_COST_DELTA = 2;
  var COTA_SPREAD_VALUE_DELTA = -3;
  var COTA_SPREAD_COST_DELTA = -1;
  var COTA_MISC_GATHER_VALUE_DELTA = 6;
  var COTA_MISC_SPREAD_VALUE_DELTA = -3;
  var COTA_MISC_BASE_GAIN_RATE = 0.6;
  var COTA_MISC_RATE_PER_POWER = 0.01;
  var COTA_MISC_MANA_MULTIPLIER = 0.5;
  var COTA_CARD_DEFAULTS = {
    good: { baseValue: 8, settleManaCost: 2 },
    bad: { baseValue: 8, settleManaCost: 2 },
    misc: { baseValue: 8, settleManaCost: 2 }
  };
  var COTA_BASE_VALUE_KEYS = {
    good: COTA_GOOD_BASE_VALUE_KEY,
    bad: COTA_BAD_BASE_VALUE_KEY,
    misc: COTA_MISC_BASE_VALUE_KEY
  };
  var COTA_MARK_ICON = '../../../assets/svg/ace.svg';
  var COTA_FAULT_ICON = '../../../assets/svg/hazard-sign.svg';
  var KAKO_RED_SEAL_ICON = '../../../assets/svg/stamper.svg';
  var KAKO_RULING_ICON = '../../../assets/svg/fountain-pen.svg';
  var KAKO_RED_SEAL_KEY = 'kako_red_seal';
  var KAKO_REDLINE_RATE_KEY = 'kako_redline_rate';
  var KAKO_STREET_FORTUNE_KEY = 'kako_street_added_fortune';
  var KAKO_STREET_CURSE_KEY = 'kako_street_added_curse';
  var KAKO_LAST_MANA_DELTA_KEY = 'kako_last_mana_delta';
  var KAKO_USED_T0_KEY = 'kako_used_t0_this_street';
  var KAKO_RULING_CONTRACT_KEY = 'kako_ruling_contract';
  var KAKO_RULING_PENDING_MARK_KEY = 'kako_ruling_pending';
  var cotaCardSerial = 0;
  var kakoStreetOutgoing = Object.create(null);
  var kakoManaAnchors = Object.create(null);

  function hasRecentScout(roleCtx) {
    var owner = roleCtx.owner || {};
    return !!(owner.ai && owner.ai.scoutMemory && owner.ai.scoutMemory.some(function(entry) {
      return entry && entry.phaseSeen === roleCtx.ctx.phase;
    }));
  }

  function getInfoPressure(roleCtx) {
    var ctx = roleCtx.ctx || {};
    var owner = roleCtx.owner || {};
    var toCall = ctx.toCall || 0;
    var pot = ctx.pot || 0;
    return toCall > 0 && (toCall >= pot * 0.18 || toCall >= Math.max(40, (owner.chips || 0) * 0.12));
  }

  function hasEnemyFortunePressure(roleCtx) {
    var pending = roleCtx.pendingForces || [];
    var primary = roleCtx.primaryTarget;
    if (!primary) return false;
    return pending.some(function(force) {
      if (!force) return false;
      if (force.ownerId !== primary.id) return false;
      return force.type === 'fortune' || force.effect === 'royal_decree';
    });
  }

  function hasReadyOwnerSkill(roleCtx, effect) {
    var ctx = roleCtx.ctx || {};
    var owner = roleCtx.owner || {};
    var mana = roleCtx.mana || {};
    var skillSystem = ctx.skillSystem;
    if (!skillSystem || !skillSystem.skills) return false;

    var found = false;
    skillSystem.skills.forEach(function(candidate) {
      if (found || !candidate) return;
      if (candidate.ownerId !== owner.id) return;
      if (candidate.effect !== effect) return;
      if (candidate.activation !== 'active') return;
      if (candidate.currentCooldown > 0) return;
      if (candidate._sealed > 0) return;
      if (candidate.usesPerGame > 0 && candidate.gameUsesRemaining <= 0) return;
      if (typeof mana.current === 'number' && mana.current < (candidate.manaCost || 0)) return;
      found = true;
    });

    return found;
  }

  function hasOwnerPendingEffect(roleCtx, effect) {
    var owner = roleCtx.owner || {};
    var pending = roleCtx.pendingForces || [];
    return pending.some(function(force) {
      if (!force || force.ownerId !== owner.id) return false;
      if (force.effect === effect || force.type === effect) return true;
      if (effect === 'curse' && force.type === 'curse') return true;
      if (effect === 'cooler' && force.effect === 'cooler') return true;
      return false;
    });
  }

  function hasOwnerPendingSkillKey(roleCtx, skillKey) {
    var owner = roleCtx.owner || {};
    var pending = roleCtx.pendingForces || [];
    return pending.some(function(force) {
      if (!force || force.ownerId !== owner.id) return false;
      return force.skillKey === skillKey ||
        force.effect === skillKey ||
        force.source === skillKey;
    });
  }

  function scriptedChance(phase, values) {
    if (phase === 'preflop') return values.preflop;
    if (phase === 'flop') return values.flop;
    if (phase === 'turn') return values.turn;
    return values.river;
  }

  function getTraitSystem(runtimeApi) {
    return runtimeApi &&
      runtimeApi.moz &&
      runtimeApi.moz.combatFormula &&
      runtimeApi.moz.combatFormula.traitSystem
      ? runtimeApi.moz.combatFormula.traitSystem
      : null;
  }

  function hasTraitEffect(runtimeApi, ownerId, effectType) {
    var traitSystem = getTraitSystem(runtimeApi);
    if (!traitSystem || typeof traitSystem.hasEffect !== 'function') return false;
    var result = traitSystem.hasEffect(ownerId, effectType);
    return !!(result && result.has);
  }

  function getTraitEffect(runtimeApi, ownerId, effectType) {
    var traitSystem = getTraitSystem(runtimeApi);
    if (!traitSystem || typeof traitSystem.hasEffect !== 'function') return null;
    var result = traitSystem.hasEffect(ownerId, effectType);
    return result && result.has ? (result.value || null) : null;
  }

  function getGamePlayers(runtimeApi) {
    var gameState = runtimeApi && typeof runtimeApi.getGameState === 'function'
      ? runtimeApi.getGameState()
      : null;
    return gameState && Array.isArray(gameState.players) ? gameState.players : [];
  }

  function getPlayerById(runtimeApi, ownerId) {
    var players = getGamePlayers(runtimeApi);
    for (var i = 0; i < players.length; i++) {
      if (players[i] && players[i].id === ownerId) return players[i];
    }
    return null;
  }

  function getActiveOpponents(runtimeApi, ownerId) {
    return getGamePlayers(runtimeApi).filter(function(player) {
      return player &&
        player.id !== ownerId &&
        !player.folded &&
        player.isActive !== false;
    });
  }

  function hasStatusMark(roleCtx, targetId, key) {
    var skillSystem = roleCtx && roleCtx.ctx ? roleCtx.ctx.skillSystem : null;
    if (!skillSystem || typeof skillSystem.hasStatusMark !== 'function' || targetId == null) return false;
    return !!skillSystem.hasStatusMark(targetId, key);
  }

  function scoreThreatTarget(player) {
    if (!player) return -1;
    var chips = Math.max(1, Number(player.chips || 0));
    var commit = Number(player.totalBet || 0);
    return commit * 1.5 + chips * 0.1;
  }

  function pickRoleTarget(roleCtx, predicate) {
    var candidates = (roleCtx.opponents || []).filter(function(player) {
      return player && (!predicate || predicate(player));
    });
    if (!candidates.length) return null;
    candidates.sort(function(a, b) {
      return scoreThreatTarget(b) - scoreThreatTarget(a);
    });
    return candidates[0] || null;
  }

  function getLedger(runtimeApi) {
    return runtimeApi && typeof runtimeApi.getAssetLedger === 'function'
      ? runtimeApi.getAssetLedger()
      : null;
  }

  function getSkillSystem(runtimeApi) {
    return runtimeApi ? runtimeApi.skillSystem : null;
  }

  function buildMatchScopedSkillKey(ownerId, skillKey) {
    return 'skill:' + String(ownerId) + ':' + String(skillKey) + ':match_once';
  }

  function isMatchScopedSkillUsed(runtimeApi, ownerId, skillKey) {
    var scopeKey = buildMatchScopedSkillKey(ownerId, skillKey);
    if (runtimeApi && typeof runtimeApi.isMatchScopedUsed === 'function') {
      return !!runtimeApi.isMatchScopedUsed(scopeKey);
    }
    var skillSystem = getSkillSystem(runtimeApi);
    return !!(skillSystem && typeof skillSystem.isMatchScopedUsed === 'function' && skillSystem.isMatchScopedUsed(scopeKey));
  }

  function consumeMatchScopedSkillUse(runtimeApi, ownerId, skillKey, payload) {
    var scopeKey = buildMatchScopedSkillKey(ownerId, skillKey);
    if (runtimeApi && typeof runtimeApi.consumeMatchScopedUse === 'function') {
      return !!runtimeApi.consumeMatchScopedUse(scopeKey, Object.assign({
        ownerId: ownerId,
        skillKey: skillKey
      }, payload || {}));
    }
    var skillSystem = getSkillSystem(runtimeApi);
    return !!(skillSystem && typeof skillSystem.consumeMatchScopedUse === 'function' &&
      skillSystem.consumeMatchScopedUse(scopeKey, Object.assign({
        ownerId: ownerId,
        skillKey: skillKey
      }, payload || {})));
  }

  function getPlayerManaPool(runtimeApi, ownerId) {
    var skillSystem = getSkillSystem(runtimeApi);
    if (!skillSystem || !skillSystem.manaPools || typeof skillSystem.manaPools.get !== 'function') return null;
    return skillSystem.manaPools.get(ownerId) || null;
  }

  function getPlayerSkills(runtimeApi, ownerId) {
    var skillSystem = getSkillSystem(runtimeApi);
    if (!skillSystem || typeof skillSystem.getPlayerSkills !== 'function') return [];
    return skillSystem.getPlayerSkills(ownerId) || [];
  }

  function getForceRuntime(runtimeApi) {
    return runtimeApi && typeof runtimeApi.getForceRuntime === 'function'
      ? runtimeApi.getForceRuntime()
      : (global.ForceRuntime || null);
  }

  function emitRuntimeFlow(runtimeApi, event, payload) {
    if (!runtimeApi || !runtimeApi.runtimeFlow || typeof runtimeApi.runtimeFlow.emit !== 'function') return;
    runtimeApi.runtimeFlow.emit(event, payload);
  }

  function queueRuntimeForce(runtimeApi, force, meta) {
    var skillSystem = getSkillSystem(runtimeApi);
    if (!skillSystem || !force || !Array.isArray(skillSystem.pendingForces)) return null;
    if (!force._runtimeId && typeof skillSystem._forceSerial === 'number') {
      skillSystem._forceSerial += 1;
      force._runtimeId = 'force_' + skillSystem._forceSerial;
    }
    skillSystem.pendingForces.push(force);
    emitRuntimeFlow(runtimeApi, 'force:queued', {
      force: Object.assign({}, force),
      meta: meta || null
    });
    return force;
  }

  function removeRuntimeForces(runtimeApi, predicate, meta) {
    var skillSystem = getSkillSystem(runtimeApi);
    if (!skillSystem || !Array.isArray(skillSystem.pendingForces)) return [];

    var kept = [];
    var removed = [];
    for (var i = 0; i < skillSystem.pendingForces.length; i++) {
      var force = skillSystem.pendingForces[i];
      if (predicate(force, i)) {
        removed.push(force);
      } else {
        kept.push(force);
      }
    }

    skillSystem.pendingForces = kept;
    for (var j = 0; j < removed.length; j++) {
      emitRuntimeFlow(runtimeApi, 'force:removed', {
        force: Object.assign({}, removed[j]),
        meta: meta || null
      });
    }
    return removed;
  }

  function emitRuntimeSkillActivated(runtimeApi, skill, payload, options) {
    var skillSystem = getSkillSystem(runtimeApi);
    if (!skillSystem || typeof skillSystem.emit !== 'function' || !skill) return;
    var next = Object.assign({
      skill: Object.assign({}, skill),
      type: skill.effect || null
    }, payload || {});
    if (options) next.options = Object.assign({}, options);
    emitRuntimeFlow(runtimeApi, 'skill:activated', next);
    skillSystem.emit('skill:activated', next);
  }

  function findPlayerSkill(runtimeApi, ownerId, effect) {
    var skills = getPlayerSkills(runtimeApi, ownerId);
    for (var i = 0; i < skills.length; i++) {
      if (skills[i] && skills[i].effect === effect) return skills[i];
    }
    return null;
  }

  function isRolePlayer(player, roleId) {
    return !!(player && String(player.roleId || '').toUpperCase() === String(roleId || '').toUpperCase());
  }

  function isRuntimePlayerLive(player) {
    return !!(player &&
      player.isActive !== false &&
      !player.folded &&
      Number(player.chips || 0) > 0);
  }

  function getRolePlayers(runtimeApi, roleId, options) {
    var liveOnly = !!(options && options.liveOnly);
    return getGamePlayers(runtimeApi).filter(function(player) {
      if (!isRolePlayer(player, roleId)) return false;
      if (!liveOnly) return true;
      return isRuntimePlayerLive(player);
    });
  }

  function getLiveRolePlayers(runtimeApi, roleId) {
    return getRolePlayers(runtimeApi, roleId, { liveOnly: true });
  }

  function collectConfiguredRoleIdsFromEntry(entry, sink) {
    if (!entry || !sink) return;
    function addRole(value) {
      if (!value) return;
      var key = String(value).trim().toUpperCase();
      if (!key) return;
      sink[key] = true;
    }
    addRole(entry.roleId);
    addRole(entry.name);
    if (entry.vanguard) {
      addRole(entry.vanguard.roleId);
      addRole(entry.vanguard.name);
    }
    if (entry.rearguard) {
      addRole(entry.rearguard.roleId);
      addRole(entry.rearguard.name);
    }
  }

  function getConfiguredRoleMap(runtimeApi) {
    var map = Object.create(null);
    var config = runtimeApi && typeof runtimeApi.getGameConfig === 'function'
      ? runtimeApi.getGameConfig()
      : null;
    if (!config) return map;
    collectConfiguredRoleIdsFromEntry(config.hero, map);
    var seats = config.seats || {};
    var seatKeys = Object.keys(seats);
    for (var i = 0; i < seatKeys.length; i++) {
      collectConfiguredRoleIdsFromEntry(seats[seatKeys[i]], map);
    }
    return map;
  }

  function hasConfiguredRole(runtimeApi, roleId) {
    if (!roleId) return false;
    var configured = getConfiguredRoleMap(runtimeApi);
    return !!configured[String(roleId).trim().toUpperCase()];
  }

  function guardConfiguredRole(runtimeApi, roleId) {
    return hasConfiguredRole(runtimeApi, roleId);
  }

  function clearStatusMarkSafe(skillSystem, ownerId, key) {
    if (!skillSystem || ownerId == null || !key) return;
    if (typeof skillSystem.clearStatusMark === 'function') {
      skillSystem.clearStatusMark(ownerId, key);
    }
  }

  function getPlayerChipBaseline(player) {
    if (!player) return 0;
    var baseline = Number(
      player.initialChips != null ? player.initialChips :
      player.startingChips != null ? player.startingChips :
      player.baseChips != null ? player.baseChips :
      ((player.chips || 0) + (player.totalBet || 0))
    );
    return Math.max(0, baseline);
  }

  function getPlayerChipRatio(player) {
    var baseline = getPlayerChipBaseline(player);
    if (baseline <= 0) return 0;
    return Math.max(0, Number(player && player.chips || 0)) / baseline;
  }

  function getBubbleValue(runtimeApi, ownerId, key) {
    var ledger = getLedger(runtimeApi);
    if (!ledger || typeof ledger.getValue !== 'function') return 0;
    return ledger.getValue(ownerId, key) || 0;
  }

  function getBubbleLayerCount(runtimeApi, ownerId) {
    return getVvPositionPacks(runtimeApi, ownerId).length;
  }

  function getBubbleLayerAsset(runtimeApi, ownerId) {
    return getVvPositionAsset(runtimeApi, ownerId);
  }

  function getBubbleTotal(runtimeApi, ownerId) {
    return getBubbleValue(runtimeApi, ownerId, 'bubble_fortune') +
      getBubbleValue(runtimeApi, ownerId, 'bubble_chaos') +
      getBubbleValue(runtimeApi, ownerId, 'bubble_mana');
  }

  function getVvPositionAsset(runtimeApi, ownerId) {
    var ledger = getLedger(runtimeApi);
    if (!ledger || typeof ledger.getAsset !== 'function') return null;
    return ledger.getAsset(ownerId, VV_POSITION_KEY);
  }

  function getVvPositionPacks(runtimeApi, ownerId) {
    var asset = getVvPositionAsset(runtimeApi, ownerId);
    return asset && Array.isArray(asset.positions) ? asset.positions.slice() : [];
  }

  function getActiveTableChipTotal(runtimeApi) {
    var players = getGamePlayers(runtimeApi);
    var total = 0;
    for (var i = 0; i < players.length; i++) {
      var player = players[i];
      if (!player || player.isActive === false) continue;
      total += Math.max(0, Number(player.chips || 0));
    }
    return Math.max(1, total);
  }

  function summarizeVvTargetPositions(runtimeApi, ownerId, filterOwnerId) {
    var packs = getVvPositionPacks(runtimeApi, ownerId).filter(function(pack) {
      if (!pack) return false;
      if (filterOwnerId == null) return true;
      return pack.ownerId === filterOwnerId;
    });
    var summary = {
      packs: packs,
      count: packs.length,
      entrySize: 0,
      fortune: 0,
      chaos: 0,
      mana: 0,
      bullishSize: 0,
      bearishSize: 0
    };
    for (var i = 0; i < packs.length; i++) {
      var pack = packs[i] || {};
      var size = Math.max(1, Number(pack.entrySize != null ? pack.entrySize : (pack.tier != null ? pack.tier : 1)) || 1);
      summary.entrySize += size;
      summary.fortune += Math.max(0, Number(pack.bubble_fortune || 0));
      summary.chaos += Math.max(0, Number(pack.bubble_chaos || 0));
      summary.mana += Math.max(0, Number(pack.bubble_mana || 0));
      if (pack.direction === 'bearish') summary.bearishSize += size;
      else summary.bullishSize += size;
    }
    return summary;
  }

  function syncVvTargetAssets(runtimeApi, ownerId) {
    var ledger = getLedger(runtimeApi);
    if (!ledger) return;
    var summary = summarizeVvTargetPositions(runtimeApi, ownerId);
    var meta = getVvPositionAsset(runtimeApi, ownerId) || {};

    if (summary.count > 0) {
      ledger.setAsset(ownerId, VV_POSITION_KEY, summary.count, {
        positions: summary.packs,
        entrySize: summary.entrySize,
        bullishSize: summary.bullishSize,
        bearishSize: summary.bearishSize,
        icon: VV_MARK_ICON
      });
      ledger.setAsset(ownerId, 'bubble_fortune', summary.fortune, {
        icon: VV_MARK_ICON
      });
      ledger.setAsset(ownerId, 'bubble_chaos', summary.chaos, {
        icon: VV_MARK_ICON
      });
      ledger.setAsset(ownerId, 'bubble_mana', summary.mana, {
        icon: VV_MARK_ICON
      });
    } else {
      ledger.clearAsset(ownerId, VV_POSITION_KEY);
      ledger.clearAsset(ownerId, 'bubble_fortune');
      ledger.clearAsset(ownerId, 'bubble_chaos');
      ledger.clearAsset(ownerId, 'bubble_mana');
    }
  }

  function getVvDeviationState(runtimeApi, pack, targetId) {
    var baselineTarget = Math.max(0, Number(pack && pack.baselineTargetChips || 0));
    var baselineTable = Math.max(1, Number(pack && pack.baselineTableChips || 1));
    var currentTargetPlayer = getPlayerById(runtimeApi, targetId);
    var currentTarget = Math.max(0, Number(currentTargetPlayer && currentTargetPlayer.chips || 0));
    var currentTable = getActiveTableChipTotal(runtimeApi);
    var baselineShare = baselineTarget > 0 ? (baselineTarget / baselineTable) : 0;
    var currentShare = currentTarget / currentTable;
    if (baselineShare <= 0) {
      return {
        direction: 'flat',
        level: 0,
        deltaRatio: 0,
        baselineShare: baselineShare,
        currentShare: currentShare
      };
    }
    var deltaRatio = (currentShare - baselineShare) / baselineShare;
    var absRatio = Math.abs(deltaRatio);
    var level = absRatio >= VV_DEVIATION_THRESHOLDS[2] ? 3
      : absRatio >= VV_DEVIATION_THRESHOLDS[1] ? 2
      : absRatio >= VV_DEVIATION_THRESHOLDS[0] ? 1
      : 0;
    return {
      direction: deltaRatio > 0.0001 ? 'bullish' : deltaRatio < -0.0001 ? 'bearish' : 'flat',
      level: level,
      deltaRatio: deltaRatio,
      baselineShare: baselineShare,
      currentShare: currentShare
    };
  }

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
      power: power,
      effectivePower: power,
      tier: 0,
      attr: 'moirai',
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
        power: share,
        effectivePower: share,
        tier: 0,
        attr: 'moirai',
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
        power: selfPower,
        effectivePower: selfPower,
        tier: skill && skill.tier != null ? skill.tier : 2,
        attr: skill && skill.attr ? skill.attr : 'moirai',
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
        power: targetPower,
        effectivePower: targetPower,
        tier: skill && skill.tier != null ? skill.tier : 2,
        attr: skill && skill.attr ? skill.attr : 'moirai',
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

  function getVvTargetState(runtimeApi, targetId, casterId) {
    var mana = getPlayerManaPool(runtimeApi, targetId);
    var manaRatio = mana && mana.max > 0 ? (mana.current / mana.max) : 0;
    var summary = summarizeVvTargetPositions(runtimeApi, targetId, casterId);
    var deviationLevel = 0;
    var dominantDirection = 'flat';
    for (var i = 0; i < summary.packs.length; i++) {
      var state = getVvDeviationState(runtimeApi, summary.packs[i], targetId);
      if (state.level > deviationLevel) {
        deviationLevel = state.level;
        dominantDirection = state.direction;
      }
    }
    return {
      positionCount: summary.count,
      bubbleTotal: getBubbleTotal(runtimeApi, targetId),
      chaosTotal: getChaosPressure(runtimeApi, targetId),
      manaRatio: manaRatio,
      deviationLevel: deviationLevel,
      entrySize: summary.entrySize,
      dominantDirection: dominantDirection
    };
  }

  function buildVvResolvedForceSnapshot(runtimeApi) {
    var forceRuntime = getForceRuntime(runtimeApi);
    if (!forceRuntime || typeof forceRuntime.resolveSnapshot !== 'function') return [];
    return forceRuntime.resolveSnapshot(runtimeApi, {
      useCollectActiveForces: true
    }) || [];
  }

  function getFortunePressure(runtimeApi, ownerId) {
    var pending = buildVvResolvedForceSnapshot(runtimeApi);
    var total = getBubbleValue(runtimeApi, ownerId, 'bubble_fortune');
    for (var i = 0; i < pending.length; i++) {
      var force = pending[i];
      if (!force || force.type !== 'fortune') continue;
      if (force.ownerId !== ownerId) continue;
      total += Math.max(0, Number(force.effectivePower != null ? force.effectivePower : force.power || 0));
    }
    return total;
  }

  function getChaosPressure(runtimeApi, ownerId) {
    var pending = buildVvResolvedForceSnapshot(runtimeApi);
    var total = getBubbleValue(runtimeApi, ownerId, 'bubble_chaos');
    for (var i = 0; i < pending.length; i++) {
      var force = pending[i];
      if (!force || force.type !== 'curse') continue;
      if (force.targetId !== ownerId) continue;
      if (force.ownerId === ownerId) continue;
      total += Math.max(0, Number(force.effectivePower != null ? force.effectivePower : force.power || 0));
    }
    return total;
  }

  function hasChaosProfile(runtimeApi, ownerId) {
    var skills = getPlayerSkills(runtimeApi, ownerId);
    for (var i = 0; i < skills.length; i++) {
      if (!skills[i]) continue;
      if (skills[i].attr === 'chaos') return true;
    }
    return false;
  }

  function isLowManaTarget(runtimeApi, ownerId) {
    var player = getPlayerById(runtimeApi, ownerId);
    if (player && (player.roleId === 'KAZU' || player.roleId === 'POPPY')) return true;
    var mana = getPlayerManaPool(runtimeApi, ownerId);
    return !!(mana && mana.max > 0 && mana.max <= 60);
  }

  function getVvTargetDeviationLevel(runtimeApi, ownerId, casterId) {
    var summary = summarizeVvTargetPositions(runtimeApi, ownerId, casterId);
    var level = 0;
    for (var i = 0; i < summary.packs.length; i++) {
      level = Math.max(level, getVvDeviationState(runtimeApi, summary.packs[i], ownerId).level);
    }
    return level;
  }

  function getVvTargetForecastState(runtimeApi, player, casterId) {
    if (!player) return null;
    var chips = Math.max(0, Number(player.chips || 0));
    var tableTotal = Math.max(1, getActiveTableChipTotal(runtimeApi));
    var tableShare = chips / tableTotal;
    var mana = getPlayerManaPool(runtimeApi, player.id);
    var manaRatio = mana && mana.max > 0 ? (mana.current / mana.max) : 0;
    var fortunePressure = getFortunePressure(runtimeApi, player.id);
    var chaosPressure = getChaosPressure(runtimeApi, player.id);
    var positionSummary = summarizeVvTargetPositions(runtimeApi, player.id, casterId);
    var deviationLevel = getVvTargetDeviationLevel(runtimeApi, player.id, casterId);
    var commitment = Math.max(0, Number(player.totalBet || 0));
    var commitmentRatio = chips > 0 ? Math.min(1.25, commitment / Math.max(1, chips + commitment)) : 0;
    return {
      chips: chips,
      tableShare: tableShare,
      manaRatio: manaRatio,
      fortunePressure: fortunePressure,
      chaosPressure: chaosPressure,
      positionCount: positionSummary.count,
      entrySize: positionSummary.entrySize,
      deviationLevel: deviationLevel,
      commitment: commitment,
      commitmentRatio: commitmentRatio
    };
  }

  function scoreVvRisePotential(roleCtx, target, runtimeApi) {
    if (!target) return -999;
    var state = getVvTargetForecastState(runtimeApi, target, roleCtx.owner && roleCtx.owner.id);
    if (!state) return -999;
    var phase = String(roleCtx.ctx && roleCtx.ctx.phase || '').toLowerCase();
    var score = 0;
    score += state.tableShare * 42;
    score += state.manaRatio * 18;
    score += Math.max(0, state.fortunePressure) * 0.78;
    score += Math.max(0, state.chaosPressure) * 0.18;
    score += state.commitmentRatio * 14;
    score += Math.max(0, state.deviationLevel - 1) * 6;
    if (phase === 'preflop') score += state.tableShare * 10;
    if (phase === 'turn' || phase === 'river') score += state.commitmentRatio * 6;
    return score;
  }

  function scoreVvFallPotential(roleCtx, target, runtimeApi) {
    if (!target) return -999;
    var state = getVvTargetForecastState(runtimeApi, target, roleCtx.owner && roleCtx.owner.id);
    if (!state) return -999;
    var phase = String(roleCtx.ctx && roleCtx.ctx.phase || '').toLowerCase();
    var score = 0;
    score += (1 - state.manaRatio) * 20;
    score += Math.max(0, state.chaosPressure) * 0.82;
    score += Math.max(0, state.fortunePressure) * 0.14;
    score += state.commitmentRatio * 16;
    score += Math.max(0, 0.34 - state.tableShare) * 26;
    score += Math.max(0, state.deviationLevel - 1) * 8;
    if (phase === 'turn' || phase === 'river') score += state.commitmentRatio * 8;
    return score;
  }

  function scoreVvTargetDelta(roleCtx, target, runtimeApi) {
    var rise = scoreVvRisePotential(roleCtx, target, runtimeApi);
    var fall = scoreVvFallPotential(roleCtx, target, runtimeApi);
    return {
      riseScore: rise,
      fallScore: fall,
      edge: rise - fall,
      direction: rise >= fall ? 'bullish' : 'bearish',
      strength: Math.abs(rise - fall),
      state: getVvTargetForecastState(runtimeApi, target, roleCtx.owner && roleCtx.owner.id)
    };
  }

  function chooseVvClairvoyancePlan(roleCtx, runtimeApi) {
    var owner = roleCtx.owner || {};
    var ownerMana = roleCtx.mana || getPlayerManaPool(runtimeApi, owner.id) || {};
    var manaCurrent = Math.max(0, Number(ownerMana.current || 0));
    var manaMax = Math.max(1, Number(ownerMana.max || 0));
    var manaRatio = manaCurrent / manaMax;
    var phase = String(roleCtx.ctx && roleCtx.ctx.phase || '').toLowerCase();
    var opponents = getActiveOpponents(runtimeApi, owner.id);
    var best = null;

    for (var i = 0; i < opponents.length; i++) {
      var target = opponents[i];
      if (!target) continue;
      var forecast = scoreVvTargetDelta(roleCtx, target, runtimeApi);
      var targetState = getVvTargetState(runtimeApi, target.id, owner.id);
      var alreadyHolding = targetState.positionCount > 0;
      var tier = 1;
      if (phase !== 'preflop' && forecast.strength >= 24 && manaCurrent >= 78) tier = 3;
      else if (forecast.strength >= 14 && manaCurrent >= 62) tier = 2;
      var shouldUse = false;
      if (phase !== 'river' && !hasOwnerPendingSkillKey(roleCtx, 'bubble_liquidation') && manaCurrent >= 42 && manaRatio >= 0.28) {
        if (!alreadyHolding && phase === 'preflop') shouldUse = forecast.strength >= 16;
        else if (phase === 'flop') shouldUse = forecast.strength >= (alreadyHolding ? 13 : 10);
        else if (phase === 'turn') shouldUse = !alreadyHolding && forecast.strength >= 14;
      }
      var score = forecast.strength + tier * 4 - (alreadyHolding ? 6 : 0);
      if (!best || score > best.score) {
        best = {
          shouldUse: shouldUse,
          targetId: target.id,
          targetName: target.name || null,
          direction: forecast.direction,
          tier: tier,
          riseScore: forecast.riseScore,
          fallScore: forecast.fallScore,
          strength: forecast.strength,
          edge: forecast.edge,
          targetState: targetState,
          score: score
        };
      }
    }

    return best || {
      shouldUse: false,
      targetId: null,
      targetName: null,
      direction: 'bullish',
      tier: 1,
      riseScore: 0,
      fallScore: 0,
      strength: 0,
      edge: 0,
      targetState: null,
      score: -999
    };
  }

  function scoreVvLiquidationValue(roleCtx, position, targetState) {
    var phase = String(roleCtx.ctx && roleCtx.ctx.phase || '').toLowerCase();
    var mana = roleCtx.mana || {};
    var manaCurrent = Math.max(0, Number(mana.current || 0));
    var manaMax = Math.max(1, Number(mana.max || 0));
    var manaRatio = manaCurrent / manaMax;
    var deviationLevel = Math.max(0, Number(targetState && targetState.deviationLevel || 0));
    var bubbleTotal = Math.max(0, Number(targetState && targetState.bubbleTotal || 0));
    var value = deviationLevel * 20 + bubbleTotal * 0.65;
    if (phase === 'river') value += 18;
    if (phase === 'turn') value += 8;
    if (manaRatio <= 0.22) value += 16;
    else if (manaRatio <= 0.52) value += 8;
    if (position && position.direction === 'bearish') value += 2;
    return value;
  }

  function previewVvLiquidationOutcome(position, targetState) {
    var pack = position || {};
    var state = targetState || {};
    var bubbleFortune = Math.max(0, Number(pack.bubble_fortune || 0));
    var bubbleChaos = Math.max(0, Number(pack.bubble_chaos || 0));
    var bubbleMana = Math.max(0, Number(pack.bubble_mana || 0));
    var level = Math.max(0, Number(state.deviationLevel != null ? state.deviationLevel : state.level || 0));
    var stateDirection = state.direction || state.stateDirection || 'flat';
    var packDirection = pack.direction === 'bearish' ? 'bearish' : 'bullish';
    var recoveredMana = 0;
    var drainedMana = 0;
    var targetFortuneBurst = 0;
    var targetChaosBurst = 0;
    var selfFortune = 0;

    if (level <= 0 || stateDirection === 'flat') {
      recoveredMana += Math.ceil(bubbleMana * 0.85);
      targetFortuneBurst += bubbleFortune;
      targetChaosBurst += bubbleChaos;
    } else if (stateDirection === packDirection) {
      if (stateDirection === 'bullish') {
        targetChaosBurst += bubbleChaos + Math.ceil(bubbleFortune * (level === 1 ? 1 : (level === 2 ? 1.33 : 1.66)));
        recoveredMana += Math.ceil(bubbleMana * (level === 1 ? 1.25 : (level === 2 ? 1.5 : 1.75)));
        drainedMana += Math.ceil(bubbleMana * (level === 1 ? 0.25 : (level === 2 ? 0.5 : 0.75)));
      } else {
        selfFortune += Math.ceil(bubbleFortune * (level === 1 ? 1 : (level === 2 ? 1.25 : 1.5)));
        targetChaosBurst += Math.ceil(bubbleChaos * (level === 1 ? 0.5 : (level === 2 ? 0.75 : 1)));
        recoveredMana += Math.ceil(bubbleMana * (level === 1 ? 1.25 : (level === 2 ? 1.5 : 1.75)));
      }
    } else {
      recoveredMana += Math.ceil(bubbleMana * 0.6);
      targetFortuneBurst += Math.ceil(bubbleFortune * 0.5);
      targetChaosBurst += Math.ceil(bubbleChaos * 0.5);
    }

    return {
      recoveredMana: recoveredMana,
      drainedMana: drainedMana,
      targetFortuneBurst: targetFortuneBurst,
      targetChaosBurst: targetChaosBurst,
      selfFortune: selfFortune
    };
  }

  function chooseVvLiquidationTarget(roleCtx, runtimeApi) {
    var owner = roleCtx.owner || {};
    var phase = String(roleCtx.ctx && roleCtx.ctx.phase || '').toLowerCase();
    var ownerMana = roleCtx.mana || getPlayerManaPool(runtimeApi, owner.id) || {};
    var manaCurrent = Math.max(0, Number(ownerMana.current || 0));
    var manaMax = Math.max(1, Number(ownerMana.max || 0));
    var manaRatio = manaCurrent / manaMax;
    var opponents = getActiveOpponents(runtimeApi, owner.id);
    var best = null;

    for (var i = 0; i < opponents.length; i++) {
      var target = opponents[i];
      if (!target) continue;
      var summary = summarizeVvTargetPositions(runtimeApi, target.id, owner.id);
      if (!summary.count) continue;
      var targetState = getVvTargetState(runtimeApi, target.id, owner.id);
      var deviationLevel = Math.max(0, Number(targetState.deviationLevel || 0));
      var bubbleTotal = Math.max(0, Number(targetState.bubbleTotal || 0));
      var leadPack = summary.packs[0] || {};
      var preview = previewVvLiquidationOutcome(leadPack, targetState);
      var score = scoreVvLiquidationValue(roleCtx, leadPack, targetState);
      var shouldUse = false;
      if (phase !== 'preflop') {
        if (deviationLevel >= 3) shouldUse = true;
        else if (deviationLevel >= 2 && (phase === 'river' || manaRatio <= 0.52 || bubbleTotal >= 36)) shouldUse = true;
        else if (deviationLevel >= 1 && phase === 'river' && bubbleTotal >= 24) shouldUse = true;
        else if (manaRatio <= 0.22 && deviationLevel >= 1 && bubbleTotal >= 18) shouldUse = true;
      }
      var wouldSelfBacklash = manaCurrent > 0 && manaCurrent <= 16;
      var weakLiquidation = preview.drainedMana <= 0 &&
        preview.recoveredMana < 12 &&
        (preview.targetFortuneBurst + preview.targetChaosBurst + preview.selfFortune) < 24;
      if (wouldSelfBacklash && weakLiquidation) {
        shouldUse = false;
        score -= 24;
      }
      if (!best || score > best.score) {
        best = {
          shouldUse: shouldUse,
          targetId: target.id,
          targetName: target.name || null,
          direction: leadPack.direction === 'bearish' ? 'bearish' : 'bullish',
          tier: Math.max(1, Number(leadPack.tier != null ? leadPack.tier : leadPack.entrySize || 1) || 1),
          deviationLevel: deviationLevel,
          bubbleTotal: bubbleTotal,
          score: score,
          targetState: targetState,
          preview: preview,
          wouldSelfBacklash: wouldSelfBacklash
        };
      }
    }

    return best || {
      shouldUse: false,
      targetId: null,
      targetName: null,
      direction: 'bullish',
      tier: 1,
      deviationLevel: 0,
      bubbleTotal: 0,
      score: -999,
      targetState: null,
      preview: null,
      wouldSelfBacklash: false
    };
  }

  function logVvAiPlan(runtimeApi, eventName, roleCtx, payload) {
    var skillSystem = getSkillSystem(runtimeApi);
    if (!skillSystem || typeof skillSystem._log !== 'function') return;
    skillSystem._log(eventName, Object.assign({
      ownerId: roleCtx.owner && roleCtx.owner.id,
      ownerName: roleCtx.owner && roleCtx.owner.name,
      phase: roleCtx.ctx && roleCtx.ctx.phase || null
    }, payload || {}));
  }

  function resolveVvPrimaryTarget(runtimeApi, ownerId, roleCtx) {
    var opponents = getActiveOpponents(runtimeApi, ownerId);
    if (opponents.length === 0) return null;
    var syntheticRoleCtx = roleCtx || {
      owner: getPlayerById(runtimeApi, ownerId) || { id: ownerId },
      ctx: { phase: resolveRuntimePhase(runtimeApi, null) }
    };
    opponents.sort(function(a, b) {
      var aScore = scoreVvTargetDelta(syntheticRoleCtx, a, runtimeApi);
      var bScore = scoreVvTargetDelta(syntheticRoleCtx, b, runtimeApi);
      return bScore.strength - aScore.strength;
    });
    return opponents[0] || null;
  }

  function setManaCurrent(runtimeApi, ownerId, nextValue, reason) {
    var skillSystem = getSkillSystem(runtimeApi);
    var pool = getPlayerManaPool(runtimeApi, ownerId);
    if (!skillSystem || !pool) return;
    var previous = Math.max(0, Number(pool.current || 0));
    pool.current = Math.max(0, Math.min(pool.max, Math.round(nextValue)));
    skillSystem.emit('mana:changed', {
      ownerId: ownerId,
      previous: previous,
      current: pool.current,
      max: pool.max,
      reason: reason || 'runtime'
    });
  }

  function setPlayerChips(runtimeApi, ownerId, nextValue, reason) {
    var player = getPlayerById(runtimeApi, ownerId);
    var skillSystem = getSkillSystem(runtimeApi);
    if (!player) return 0;
    player.chips = Math.max(0, Math.round(nextValue || 0));
    if (skillSystem && typeof skillSystem.emit === 'function') {
      skillSystem.emit('chips:changed', {
        ownerId: ownerId,
        current: player.chips,
        reason: reason || 'runtime'
      });
    }
    if (runtimeApi && runtimeApi.skillUI && typeof runtimeApi.skillUI.updateDisplay === 'function') {
      runtimeApi.skillUI.updateDisplay();
      if (typeof runtimeApi.skillUI.updateButtons === 'function') runtimeApi.skillUI.updateButtons();
    }
    return player.chips;
  }

  function getVvServiceFeeCollectors(runtimeApi) {
    var players = getGamePlayers(runtimeApi);
    var collectors = [];
    for (var i = 0; i < players.length; i++) {
      var player = players[i];
      if (!player || player.isActive === false || player.folded) continue;
      var fee = getTraitEffect(runtimeApi, player.id, 'vv_service_fee');
      if (!fee) continue;
      collectors.push({ player: player, fee: fee });
    }
    return collectors;
  }

  function grantVvServiceFee(runtimeApi, collectorId, sourceOwnerId, amount, resourceType, sourceSkillKey, extra) {
    var skillSystem = getSkillSystem(runtimeApi);
    var collector = getPlayerById(runtimeApi, collectorId);
    var fee = getTraitEffect(runtimeApi, collectorId, 'vv_service_fee');
    if (!collector || !fee || !skillSystem) return;

    var gross = Math.max(0, Number(amount || 0));
    if (gross <= 0) return;

    var rate = Number(fee.siphonRate || 0.06);
    var manaCap = fee.maxManaFee != null ? Number(fee.maxManaFee) : Number(fee.maxRefund || 10);
    var fortuneCap = fee.maxFortuneFee != null ? Number(fee.maxFortuneFee) : gross;
    var manaFee = Math.min(manaCap, Math.max(1, Math.ceil(gross * rate)));
    var fortuneFee = Math.min(fortuneCap, Math.max(1, Math.ceil(gross * rate)));

    if (resourceType === 'mana' && manaFee > 0 && typeof skillSystem.regenMana === 'function') {
      skillSystem.regenMana(collectorId, manaFee);
    }

    if (resourceType !== 'mana' && fortuneFee > 0 && Array.isArray(skillSystem.pendingForces)) {
      skillSystem.pendingForces.push({
        ownerId: collectorId,
        ownerName: collector.name,
        type: 'fortune',
        power: fortuneFee,
        effectivePower: fortuneFee,
        tier: 99,
        attr: 'moirai',
        activation: 'passive',
        source: 'vv_service_fee',
        skillKey: 'service_fee',
        _vvServiceFee: true
      });
    }

    skillSystem.emit('vv:service_fee', {
      collectorId: collectorId,
      collectorName: collector.name,
      sourceOwnerId: sourceOwnerId,
      resourceType: resourceType,
      amount: gross,
      manaFee: manaFee,
      fortuneFee: fortuneFee,
      sourceSkillKey: sourceSkillKey,
      extra: extra || null
    });
  }

  function applyVvServiceFeeForGain(runtimeApi, sourceOwnerId, beneficiaryId, amount, resourceType, sourceSkillKey, extra) {
    var collectors = getVvServiceFeeCollectors(runtimeApi);
    for (var i = 0; i < collectors.length; i++) {
      grantVvServiceFee(
        runtimeApi,
        collectors[i].player.id,
        sourceOwnerId,
        amount,
        resourceType,
        sourceSkillKey,
        Object.assign({ beneficiaryId: beneficiaryId }, extra || {})
      );
    }
  }

  function handleVvServiceFeeActivation(payload, runtimeApi) {
    if (!payload || !payload.skill || payload.skill.activation !== 'active') return;
    var skill = payload.skill;
    var effect = payload.type || skill.effect;
    if (effect !== 'clairvoyance') return;

    var targetId = payload.targetId != null ? payload.targetId : payload.protectId;
    if (targetId == null) return;
    var requestedTier = Math.max(1, Math.min(3,
      Number(
        payload.tier != null ? payload.tier :
        payload.positionTier != null ? payload.positionTier :
        payload.entrySize != null ? payload.entrySize :
        payload.options && payload.options.tier != null ? payload.options.tier :
        1
      ) || 1
    ));
    var packPower = VV_POSITION_UNIT * requestedTier;
    applyVvServiceFeeForGain(runtimeApi, skill.ownerId, targetId, packPower, 'fortune', skill.skillKey, {
      targetId: targetId,
      direction: payload.direction || (payload.options && payload.options.direction) || 'bullish',
      tier: requestedTier
    });
    applyVvServiceFeeForGain(runtimeApi, skill.ownerId, targetId, packPower, 'mana', skill.skillKey, {
      targetId: targetId,
      direction: payload.direction || (payload.options && payload.options.direction) || 'bullish',
      tier: requestedTier
    });
  }

  function isVvServiceFeeExcludedSkillKey(skillKey) {
    var key = String(skillKey || '').toLowerCase();
    return key === 'service_fee' || key === 'bubble_liquidation';
  }

  function handleVvServiceFeeForceQueued(payload, runtimeApi) {
    var force = payload && payload.force ? payload.force : null;
    var meta = payload && payload.meta ? payload.meta : null;
    if (!force) return;
    if (force.type !== 'fortune') return;
    if (force.activation !== 'active') return;
    if (force._vvServiceFee) return;
    if (isVvServiceFeeExcludedSkillKey(force.skillKey)) return;

    var sourceOwnerId = meta && meta.ownerId != null ? meta.ownerId : force.ownerId;
    var beneficiaryId = force.ownerId != null ? force.ownerId : null;
    var amount = Math.max(0, Number(force.effectivePower != null ? force.effectivePower : force.power || 0));
    if (beneficiaryId == null || amount <= 0) return;

    applyVvServiceFeeForGain(runtimeApi, sourceOwnerId, beneficiaryId, amount, 'fortune', force.skillKey, {
      source: force.source || null,
      targetId: meta && meta.targetId != null ? meta.targetId : null
    });
  }

  function syncVvManaSnapshots(runtimeApi) {
    var players = getGamePlayers(runtimeApi);
    for (var i = 0; i < players.length; i++) {
      var player = players[i];
      if (!player) continue;
      var pool = getPlayerManaPool(runtimeApi, player.id);
      vvManaChangeSnapshot[player.id] = pool ? Math.max(0, Number(pool.current || 0)) : 0;
    }
  }

  function isVvServiceFeeExcludedManaReason(reason) {
    var key = String(reason || '').toLowerCase();
    return !key ||
      key === 'runtime' ||
      key === 'runtime_regen' ||
      key === 'street_regen' ||
      key === 'vv_liquidation_reclaim' ||
      key === 'eulalia_sanctuary_core' ||
      key === 'poppy_cockroach' ||
      key === 'kuzuha_grace_period' ||
      key === 'kako_signoff_flow' ||
      key === 'cota_burst_misc' ||
      key === 'cota_burst_refund' ||
      key === 'trixie_blind_box_revert' ||
      key === 'vv_clairvoyance_position';
  }

  function inferVvManaFeeSkillKey(reason) {
    var key = String(reason || '').toLowerCase();
    if (key === 'trixie_blind_box') return 'blind_box';
    return key || 'runtime_mana_gain';
  }

  function handleVvServiceFeeManaChanged(payload, runtimeApi) {
    if (!payload || payload.ownerId == null) return;
    var ownerId = Number(payload.ownerId);
    var current = Math.max(0, Number(payload.current || 0));
    var previous = vvManaChangeSnapshot[ownerId];
    vvManaChangeSnapshot[ownerId] = current;
    if (previous == null) return;

    var delta = current - previous;
    if (delta <= 0) return;
    if (isVvServiceFeeExcludedManaReason(payload.reason)) return;

    applyVvServiceFeeForGain(runtimeApi, ownerId, ownerId, delta, 'mana', inferVvManaFeeSkillKey(payload.reason), {
      reason: payload.reason || null
    });
  }

  function handleVvServiceFeePsyche(payload, runtimeApi) {
    var meta = payload && payload.meta ? payload.meta : null;
    var events = meta && Array.isArray(meta.psycheEvents) ? meta.psycheEvents : [];
    if (!events.length) return;

    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      if (!ev || ev.action !== 'convert') continue;
      var beneficiary = findPlayerByName(runtimeApi, ev.beneficiary);
      if (!beneficiary) continue;
      applyVvServiceFeeForGain(
        runtimeApi,
        beneficiary.id,
        beneficiary.id,
        ev.convertedPower || 0,
        'convert',
        ev.arbiterType || 'psyche_convert',
        { arbiterOwner: ev.arbiterOwner || null }
      );
    }
  }

  function findPlayerByName(runtimeApi, name) {
    var players = getGamePlayers(runtimeApi);
    for (var i = 0; i < players.length; i++) {
      if (players[i] && players[i].name === name) return players[i];
    }
    return null;
  }

  function getPoppyPlayers(runtimeApi) {
    return getRolePlayers(runtimeApi, 'POPPY');
  }

  function getPoppyAsset(runtimeApi, ownerId, key) {
    var ledger = getLedger(runtimeApi);
    if (!ledger || typeof ledger.getAsset !== 'function') return null;
    return ledger.getAsset(ownerId, key);
  }

  function getPoppyAssetValue(runtimeApi, ownerId, key) {
    var ledger = getLedger(runtimeApi);
    if (!ledger || typeof ledger.getValue !== 'function') return 0;
    return ledger.getValue(ownerId, key) || 0;
  }

  function setPoppyAsset(runtimeApi, ownerId, key, value, meta) {
    var ledger = getLedger(runtimeApi);
    if (!ledger || typeof ledger.setAsset !== 'function') return null;
    return ledger.setAsset(ownerId, key, value, meta || null);
  }

  function clearPoppyAsset(runtimeApi, ownerId, key) {
    var ledger = getLedger(runtimeApi);
    if (!ledger || typeof ledger.clearAsset !== 'function') return;
    ledger.clearAsset(ownerId, key);
  }

  function syncPoppyManaAnchor(runtimeApi, ownerId) {
    var mana = getPlayerManaPool(runtimeApi, ownerId);
    if (!mana) return;
    setPoppyAsset(runtimeApi, ownerId, POPPY_LAST_MANA_KEY, mana.current, {
      syncedAt: Date.now()
    });
  }

  function syncPoppyManaTrackMap(runtimeApi, ownerId) {
    var players = getGamePlayers(runtimeApi);
    var anchors = {};
    for (var i = 0; i < players.length; i++) {
      var player = players[i];
      var pool = player ? getPlayerManaPool(runtimeApi, player.id) : null;
      if (!player || !pool) continue;
      anchors[player.id] = Math.max(0, Number(pool.current || 0));
    }
    setPoppyAsset(runtimeApi, ownerId, POPPY_MANA_TRACK_KEY, 0, {
      anchors: anchors,
      syncedAt: Date.now()
    });
  }

  function clearPoppyMiracleInjectedForces(runtimeApi) {
    removeRuntimeForces(runtimeApi, function(force) {
      return !!(force && force._poppyMiracleAsset);
    }, {
      reason: 'poppy_miracle_injected_clear'
    });
  }

  function clearPoppyMiracleHandAssets(runtimeApi, ownerId) {
    clearPoppyAsset(runtimeApi, ownerId, POPPY_STREET_TOTAL_MANA_SPENT_KEY);
    clearPoppyAsset(runtimeApi, ownerId, POPPY_STREET_PSYCHE_CHAOS_KEY);
    clearPoppyAsset(runtimeApi, ownerId, POPPY_LAST_MANA_KEY);
    clearPoppyAsset(runtimeApi, ownerId, POPPY_MANA_TRACK_KEY);
    clearPoppyAsset(runtimeApi, ownerId, POPPY_LUCKY_FIND_PHASE_KEY);
  }

  function clearPoppyMiracleRuntimeAssets(runtimeApi, ownerId) {
    clearPoppyAsset(runtimeApi, ownerId, POPPY_MIRACLE_PACKS_KEY);
    clearPoppyAsset(runtimeApi, ownerId, POPPY_MIRACLE_PENDING_KEY);
    clearPoppyMiracleStatusMark(runtimeApi, ownerId);
  }

  function clearAllPoppyAssets(runtimeApi) {
    var players = getPoppyPlayers(runtimeApi);
    for (var i = 0; i < players.length; i++) {
      clearPoppyMiracleHandAssets(runtimeApi, players[i].id);
      clearPoppyMiracleRuntimeAssets(runtimeApi, players[i].id);
      clearPoppyAsset(runtimeApi, players[i].id, POPPY_MIRACLE_FLAG_KEY);
    }
    clearPoppyMiracleInjectedForces(runtimeApi);
  }

  function getPoppyMiracleConfig(runtimeApi, ownerId) {
    var skill = findPlayerSkill(runtimeApi, ownerId, 'miracle');
    return {
      skill: skill,
      triggerThreshold: skill && skill.triggerThreshold != null ? Number(skill.triggerThreshold) : 0.25,
      convertRate: skill && skill.convertRate != null ? Number(skill.convertRate) : 1.5,
      durationStreets: skill && skill.durationStreets != null ? Math.max(1, Number(skill.durationStreets)) : 3
    };
  }

  function setPoppyMiracleStatusMark(runtimeApi, player, remaining, packPower) {
    var skillSystem = getSkillSystem(runtimeApi);
    if (!skillSystem || !player) return;
    if (!isRuntimePlayerLive(player)) {
      clearStatusMarkSafe(skillSystem, player.id, POPPY_MIRACLE_MARK_KEY);
      return;
    }
    if (remaining > 0) {
      skillSystem.setStatusMark(player.id, POPPY_MIRACLE_MARK_KEY, {
        sourceName: player.name,
        icon: POPPY_MIRACLE_ICON,
        title: '命大局',
        tone: 'poppy',
        duration: 'streets',
        count: remaining,
        badgeText: String(remaining),
        detail: '命大局\n剩余街数: ' + remaining + '\n当前包强度: ' + Math.max(0, Number(packPower || 0))
      });
    } else if (typeof skillSystem.clearStatusMark === 'function') {
      skillSystem.clearStatusMark(player.id, POPPY_MIRACLE_MARK_KEY);
    }
  }

  function clearPoppyMiracleStatusMark(runtimeApi, ownerId) {
    var skillSystem = getSkillSystem(runtimeApi);
    if (!skillSystem || typeof skillSystem.clearStatusMark !== 'function' || ownerId == null) return;
    skillSystem.clearStatusMark(ownerId, POPPY_MIRACLE_MARK_KEY);
  }

  function capturePoppyManaSpend(payload, runtimeApi) {
    if (!payload || payload.ownerId == null) return;
    var current = Math.max(0, Number(payload.current || 0));
    var poppyPlayers = getPoppyPlayers(runtimeApi);
    for (var i = 0; i < poppyPlayers.length; i++) {
      var poppy = poppyPlayers[i];
      if (!poppy) continue;
      var trackAsset = getPoppyAsset(runtimeApi, poppy.id, POPPY_MANA_TRACK_KEY);
      var anchors = trackAsset && trackAsset.anchors ? Object.assign({}, trackAsset.anchors) : {};
      var previous = anchors[payload.ownerId];
      if (typeof previous !== 'number') previous = current;
      if (previous > current) {
        setPoppyAsset(
          runtimeApi,
          poppy.id,
          POPPY_STREET_TOTAL_MANA_SPENT_KEY,
          getPoppyAssetValue(runtimeApi, poppy.id, POPPY_STREET_TOTAL_MANA_SPENT_KEY) + (previous - current),
          {
            reason: payload.reason || 'mana_spent',
            sourceOwnerId: payload.ownerId
          }
        );
      }
      anchors[payload.ownerId] = current;
      setPoppyAsset(runtimeApi, poppy.id, POPPY_MANA_TRACK_KEY, 0, {
        anchors: anchors,
        reason: payload.reason || 'mana_sync'
      });
      if (payload.ownerId === poppy.id) {
        setPoppyAsset(runtimeApi, poppy.id, POPPY_LAST_MANA_KEY, current, {
          reason: payload.reason || 'mana_sync'
        });
      }
    }
  }

  function collectPoppyPsycheChaos(payload, runtimeApi, ownerId) {
    var events = payload && Array.isArray(payload.psycheEvents) ? payload.psycheEvents : [];
    var player = getPlayerById(runtimeApi, ownerId);
    if (!player || !events.length) return 0;

    var total = 0;
    for (var i = 0; i < events.length; i++) {
      var event = events[i];
      if (!event || event.action !== 'convert') continue;
      if (event.targetOwner !== player.name) continue;
      total += Math.max(0, Number(event.originalPower || 0));
    }
    return total;
  }

  function buildPoppyMiracleOptions(player, skill, drainedMana, packPower) {
    return {
      rolePlan: 'poppy_miracle',
      ownerId: player.id,
      drainedMana: drainedMana,
      packPower: packPower,
      totalPacks: skill && skill.durationStreets != null ? Math.max(1, Number(skill.durationStreets)) : 3
    };
  }

  function queuePoppyMiracle(runtimeApi, player) {
    var ownerId = player && player.id;
    var config = ownerId != null ? getPoppyMiracleConfig(runtimeApi, ownerId) : null;
    if (!player) return false;
    if (isMatchScopedSkillUsed(runtimeApi, ownerId, 'miracle')) return false;
    if (getPoppyAssetValue(runtimeApi, ownerId, POPPY_MIRACLE_FLAG_KEY) > 0) return false;
    if (getPoppyAssetValue(runtimeApi, ownerId, POPPY_MIRACLE_PENDING_KEY) > 0) return false;
    if (!config || getPlayerChipRatio(player) > config.triggerThreshold) return false;

    var skill = config.skill;
    if (!consumeMatchScopedSkillUse(runtimeApi, ownerId, 'miracle', {
      ownerName: player.name,
      phase: 'table:hand_end',
      chipRatio: getPlayerChipRatio(player),
      triggerThreshold: config.triggerThreshold
    })) {
      return false;
    }
    setPoppyAsset(runtimeApi, ownerId, POPPY_MIRACLE_PENDING_KEY, config.durationStreets, {
      durationStreets: config.durationStreets,
      convertRate: config.convertRate,
      triggerThreshold: config.triggerThreshold,
      queuedAt: Date.now()
    });
    if (skill) {
      skill.gameUsesRemaining = 0;
      skill.active = false;
    }

    var skillSystem = getSkillSystem(runtimeApi);
    if (skillSystem) {
      skillSystem.emit('poppy:miracle_ready', {
        ownerId: ownerId,
        ownerName: player.name,
        chipRatio: getPlayerChipRatio(player),
        triggerThreshold: config.triggerThreshold,
        packs: config.durationStreets,
        matchScopeKey: buildMatchScopedSkillKey(ownerId, 'miracle')
      });
    }

    return true;
  }

  function activatePoppyMiracle(runtimeApi, player) {
    var ownerId = player && player.id;
    var pendingAsset = ownerId != null ? getPoppyAsset(runtimeApi, ownerId, POPPY_MIRACLE_PENDING_KEY) : null;
    var mana = ownerId != null ? getPlayerManaPool(runtimeApi, ownerId) : null;
    if (!player || !mana || !pendingAsset) return false;

    var skill = findPlayerSkill(runtimeApi, ownerId, 'miracle');
    var durationStreets = Math.max(1, Number(pendingAsset.durationStreets || pendingAsset.value || 3));
    var convertRate = pendingAsset.convertRate != null ? Number(pendingAsset.convertRate) : 1.5;
    var drainedMana = Math.max(0, Number(mana.current || 0));
    var packPower = Math.max(0, Math.ceil(drainedMana * convertRate));
    var packs = [];
    for (var i = 0; i < durationStreets; i++) {
      packs.push({
        power: packPower,
        sourceId: ownerId,
        sourceName: player.name
      });
    }

    setPoppyAsset(runtimeApi, ownerId, POPPY_MIRACLE_FLAG_KEY, 1, {
      triggered: true,
      triggeredAt: Date.now()
    });
    setPoppyAsset(runtimeApi, ownerId, POPPY_MIRACLE_PACKS_KEY, packs.length, {
      packs: packs,
      power: packPower,
      triggeredAt: Date.now()
    });
    clearPoppyAsset(runtimeApi, ownerId, POPPY_MIRACLE_PENDING_KEY);
    setPoppyMiracleStatusMark(runtimeApi, player, packs.length, packPower);
    setManaCurrent(runtimeApi, ownerId, 0, 'poppy_miracle');

    emitRuntimeSkillActivated(runtimeApi, skill || {
      ownerId: ownerId,
      ownerName: player.name,
      skillKey: 'miracle',
      effect: 'miracle',
      activation: 'trigger'
    }, {
      ownerId: ownerId,
      ownerName: player.name,
      type: 'miracle',
      packs: packs.length,
      packPower: packPower,
      drainedMana: drainedMana
    }, buildPoppyMiracleOptions(player, skill, drainedMana, packPower));

    return true;
  }

  function recoverPoppyCockroachMana(runtimeApi, player, convertedChaos) {
    var ownerId = player && player.id;
    var mana = ownerId != null ? getPlayerManaPool(runtimeApi, ownerId) : null;
    var effect = ownerId != null ? getTraitEffect(runtimeApi, ownerId, 'desperation_reclaim') : null;
    var skillSystem = getSkillSystem(runtimeApi);
    if (!player || !mana) return 0;
    if (!effect) {
      if (skillSystem) {
        skillSystem.emit('poppy:cockroach_check', {
          ownerId: ownerId,
          ownerName: player.name,
          success: false,
          reason: 'missing_trait'
        });
      }
      return 0;
    }
    var reclaimThreshold = effect.reclaimThreshold != null ? Number(effect.reclaimThreshold) : 0.5;
    var totalManaRecoverRate = effect.totalManaRecoverRate != null ? Number(effect.totalManaRecoverRate) : 0.15;
    var manaRecoverCap = effect.manaRecoverCap != null ? Number(effect.manaRecoverCap) : 8;
    var convertedChaosRecoverRate = effect.convertedChaosRecoverRate != null ? Number(effect.convertedChaosRecoverRate) : 0.5;
    var chipRatio = getPlayerChipRatio(player);
    if (chipRatio > reclaimThreshold) {
      if (skillSystem) {
        skillSystem.emit('poppy:cockroach_check', {
          ownerId: ownerId,
          ownerName: player.name,
          success: false,
          reason: 'threshold_not_met',
          chipRatio: chipRatio,
          reclaimThreshold: reclaimThreshold
        });
      }
      return 0;
    }
    if (getPoppyAssetValue(runtimeApi, ownerId, POPPY_MIRACLE_FLAG_KEY) > 0) {
      if (skillSystem) {
        skillSystem.emit('poppy:cockroach_check', {
          ownerId: ownerId,
          ownerName: player.name,
          success: false,
          reason: 'miracle_locked',
          chipRatio: chipRatio,
          reclaimThreshold: reclaimThreshold
        });
      }
      return 0;
    }

    var streetTotalManaSpent = getPoppyAssetValue(runtimeApi, ownerId, POPPY_STREET_TOTAL_MANA_SPENT_KEY);
    var recoveredMana = Math.min(manaRecoverCap, Math.ceil(streetTotalManaSpent * totalManaRecoverRate));
    var recoveredFortune = Math.ceil(Math.max(0, Number(convertedChaos || 0)) * convertedChaosRecoverRate);
    if (recoveredMana <= 0 && recoveredFortune <= 0) {
      if (skillSystem) {
        skillSystem.emit('poppy:cockroach_check', {
          ownerId: ownerId,
          ownerName: player.name,
          success: false,
          reason: 'no_residual',
          chipRatio: chipRatio,
          reclaimThreshold: reclaimThreshold,
          streetTotalManaSpent: streetTotalManaSpent,
          convertedChaos: Math.max(0, Number(convertedChaos || 0))
        });
      }
      return 0;
    }

    var nextMana = Math.min(mana.max, mana.current + recoveredMana);
    var actualMana = Math.max(0, nextMana - mana.current);
    if (actualMana <= 0 && recoveredFortune <= 0) {
      if (skillSystem) {
        skillSystem.emit('poppy:cockroach_check', {
          ownerId: ownerId,
          ownerName: player.name,
          success: false,
          reason: 'mana_full',
          chipRatio: chipRatio,
          reclaimThreshold: reclaimThreshold,
          streetTotalManaSpent: streetTotalManaSpent,
          convertedChaos: Math.max(0, Number(convertedChaos || 0)),
          fortuneRecovered: recoveredFortune
        });
      }
      return 0;
    }

    var beforeMana = mana.current;
    if (actualMana > 0) {
      setManaCurrent(runtimeApi, ownerId, nextMana, 'poppy_cockroach');
    }
    if (recoveredFortune > 0) {
      queueRuntimeForce(runtimeApi, {
        ownerId: ownerId,
        ownerName: player.name,
        type: 'fortune',
        power: recoveredFortune,
        effectivePower: recoveredFortune,
        tier: 99,
        attr: 'moirai',
        activation: 'passive',
        source: 'poppy_cockroach_fortune',
        skillKey: 'cockroach',
        _poppyCockroachFortune: true
      }, {
        reason: 'poppy_cockroach_fortune',
        ownerId: ownerId
      });
    }
    var chaosAsset = getPoppyAsset(runtimeApi, ownerId, POPPY_STREET_PSYCHE_CHAOS_KEY);
    if (skillSystem) {
      skillSystem.emit('poppy:cockroach_check', {
        ownerId: ownerId,
        ownerName: player.name,
        success: true,
        reason: 'recovered',
        chipRatio: chipRatio,
        reclaimThreshold: reclaimThreshold,
        streetTotalManaSpent: streetTotalManaSpent,
        convertedChaos: Math.max(0, Number(convertedChaos || 0)),
        manaRecovered: actualMana,
        fortuneRecovered: recoveredFortune
      });
      skillSystem.emit('poppy:cockroach_recover', {
        ownerId: ownerId,
        ownerName: player.name,
        phase: chaosAsset && chaosAsset.phase != null ? chaosAsset.phase : null,
        chipRatio: chipRatio,
        reclaimThreshold: reclaimThreshold,
        streetTotalManaSpent: streetTotalManaSpent,
        convertedChaos: Math.max(0, Number(convertedChaos || 0)),
        recovered: actualMana,
        manaRecovered: actualMana,
        fortuneRecovered: recoveredFortune,
        manaBefore: beforeMana,
        manaAfter: nextMana
      });
    }
    return actualMana;
  }

  function tryTriggerPoppyLuckyFind(runtimeApi, payload, player) {
    var ownerId = player && player.id;
    var mana = ownerId != null ? getPlayerManaPool(runtimeApi, ownerId) : null;
    var skillSystem = getSkillSystem(runtimeApi);
    var phase = payload && payload.phase != null ? String(payload.phase) : '';
    if (!player || !mana || mana.max <= 0) return false;

    var lastPhaseAsset = getPoppyAsset(runtimeApi, ownerId, POPPY_LUCKY_FIND_PHASE_KEY);
    if (lastPhaseAsset && lastPhaseAsset.phase === phase) return false;

    var chance = Math.min(0.6, Math.max(0, mana.current / mana.max));
    setPoppyAsset(runtimeApi, ownerId, POPPY_LUCKY_FIND_PHASE_KEY, 1, {
      phase: phase,
      chance: chance
    });

    var manaBefore = mana.current;
    if (mana.current < 5) {
      if (skillSystem) {
        skillSystem.emit('poppy:lucky_find_roll', {
          ownerId: ownerId,
          ownerName: player.name,
          phase: phase,
          chance: chance,
          success: false,
          blocked: true,
          reason: 'insufficient_mana',
          manaBefore: manaBefore,
          manaAfter: manaBefore,
          spentMana: 0
        });
      }
      return false;
    }

    var success = Math.random() < chance;
    if (skillSystem) {
      skillSystem.emit('poppy:lucky_find_roll', {
        ownerId: ownerId,
        ownerName: player.name,
        phase: phase,
        chance: chance,
        success: success,
        blocked: false,
        reason: success ? 'triggered' : 'roll_failed',
        manaBefore: manaBefore,
        manaAfter: success ? Math.max(0, manaBefore - 5) : manaBefore,
        spentMana: success ? 5 : 0
      });
    }
    if (!success) return false;

    var skill = findPlayerSkill(runtimeApi, ownerId, 'lucky_find');
    setManaCurrent(runtimeApi, ownerId, manaBefore - 5, 'poppy_lucky_find');
    queueRuntimeForce(runtimeApi, {
      ownerId: ownerId,
      ownerName: player.name,
      type: 'fortune',
      power: 20,
      effectivePower: 20,
      tier: skill && skill.tier != null ? skill.tier : 2,
      attr: 'moirai',
      activation: 'passive',
      source: 'poppy_lucky_find',
      skillKey: 'lucky_find',
      _poppyLuckyFind: true
    }, {
      reason: 'poppy_lucky_find',
      ownerId: ownerId,
      phase: phase
    });
    emitRuntimeSkillActivated(runtimeApi, skill || {
      ownerId: ownerId,
      ownerName: player.name,
      skillKey: 'lucky_find',
      effect: 'lucky_find',
      activation: 'trigger'
    }, {
      ownerId: ownerId,
      ownerName: player.name,
      type: 'lucky_find',
      phase: phase
    }, {
      rolePlan: 'poppy_lucky_find',
      ownerId: ownerId,
      phase: phase,
      triggerChance: chance,
      manaBefore: manaBefore,
      manaAfter: Math.max(0, manaBefore - 5),
      spentMana: 5
    });
    return true;
  }

  function injectPoppyMiracleForces(runtimeApi) {
    clearPoppyMiracleInjectedForces(runtimeApi);

    var players = getPoppyPlayers(runtimeApi);
    for (var i = 0; i < players.length; i++) {
      var player = players[i];
      if (!player || player.folded || player.isActive === false) continue;

      var miracleAsset = getPoppyAsset(runtimeApi, player.id, POPPY_MIRACLE_PACKS_KEY);
      var packs = miracleAsset && Array.isArray(miracleAsset.packs) ? miracleAsset.packs.slice() : [];
      if (!packs.length) continue;

      var currentPack = packs[0];
      var packPower = Math.max(0, Number(currentPack && currentPack.power || 0));
      if (packPower <= 0) continue;

      queueRuntimeForce(runtimeApi, {
        ownerId: player.id,
        ownerName: player.name,
        type: 'fortune',
        power: packPower,
        effectivePower: packPower,
        tier: 0,
        attr: 'moirai',
        activation: 'passive',
        source: 'poppy_miracle',
        skillKey: 'miracle',
        suppressTiers: [1, 2, 3],
        _poppyMiracleAsset: true
      }, {
        reason: 'poppy_miracle_inject',
        ownerId: player.id,
        remainingPacks: packs.length
      });
      setPoppyMiracleStatusMark(runtimeApi, player, packs.length, packPower);
    }
  }

  function decayPoppyMiraclePacks(runtimeApi) {
    clearPoppyMiracleInjectedForces(runtimeApi);

    var players = getPoppyPlayers(runtimeApi);
    for (var i = 0; i < players.length; i++) {
      var player = players[i];
      var miracleAsset = getPoppyAsset(runtimeApi, player.id, POPPY_MIRACLE_PACKS_KEY);
      var packs = miracleAsset && Array.isArray(miracleAsset.packs) ? miracleAsset.packs.slice() : [];
      if (!packs.length) {
        clearPoppyAsset(runtimeApi, player.id, POPPY_MIRACLE_PACKS_KEY);
        continue;
      }

      packs.shift();
      if (packs.length > 0) {
        setPoppyAsset(runtimeApi, player.id, POPPY_MIRACLE_PACKS_KEY, packs.length, {
          packs: packs,
          power: miracleAsset && miracleAsset.power != null ? miracleAsset.power : 0
        });
        setPoppyMiracleStatusMark(runtimeApi, player, packs.length, miracleAsset && miracleAsset.power != null ? miracleAsset.power : 0);
      } else {
        clearPoppyAsset(runtimeApi, player.id, POPPY_MIRACLE_PACKS_KEY);
        clearPoppyMiracleStatusMark(runtimeApi, player.id);
      }
    }
  }

  function handlePoppyStreetResolved(payload, runtimeApi) {
    var players = getPoppyPlayers(runtimeApi);
    for (var i = 0; i < players.length; i++) {
      var player = players[i];
      var convertedChaos = collectPoppyPsycheChaos(payload, runtimeApi, player.id);
      setPoppyAsset(runtimeApi, player.id, POPPY_STREET_PSYCHE_CHAOS_KEY, convertedChaos, {
        phase: payload && payload.phase != null ? payload.phase : null
      });

      var recovered = recoverPoppyCockroachMana(runtimeApi, player, convertedChaos);
      tryTriggerPoppyLuckyFind(runtimeApi, payload, player);

      // 结算完成后重置街内统计，但保留最新 mana 锚点给下一街继续记账。
      setPoppyAsset(runtimeApi, player.id, POPPY_STREET_TOTAL_MANA_SPENT_KEY, 0, {
        phase: payload && payload.phase != null ? payload.phase : null,
        recovered: recovered
      });
      setPoppyAsset(runtimeApi, player.id, POPPY_STREET_PSYCHE_CHAOS_KEY, 0, {
        phase: payload && payload.phase != null ? payload.phase : null
      });
      syncPoppyManaAnchor(runtimeApi, player.id);
    }
  }

  function getKuzuhaPlayers(runtimeApi) {
    return getRolePlayers(runtimeApi, 'KUZUHA');
  }

  function buildKuzuhaDebtKey(targetId) {
    return KUZUHA_DEBT_PREFIX + String(targetId);
  }

  function buildKuzuhaCalledKey(targetId) {
    return KUZUHA_CALLED_PREFIX + String(targetId);
  }

  function getKuzuhaDebtRotValue(runtimeApi, ownerId, targetId) {
    var ledger = getLedger(runtimeApi);
    if (!ledger || ownerId == null || targetId == null) return 0;
    return Math.max(0, Number(ledger.getValue(ownerId, buildKuzuhaDebtKey(targetId)) || 0));
  }

  function setKuzuhaDebtRot(runtimeApi, ownerId, targetId, value, meta) {
    var ledger = getLedger(runtimeApi);
    if (!ledger || ownerId == null || targetId == null) return null;
    return ledger.setAsset(ownerId, buildKuzuhaDebtKey(targetId), Math.max(0, Number(value || 0)), meta || null);
  }

  function wasKuzuhaDebtCalled(runtimeApi, ownerId, targetId) {
    var ledger = getLedger(runtimeApi);
    if (!ledger || ownerId == null || targetId == null) return false;
    return (ledger.getValue(ownerId, buildKuzuhaCalledKey(targetId)) || 0) > 0;
  }

  function setKuzuhaDebtCalled(runtimeApi, ownerId, targetId, value, meta) {
    var ledger = getLedger(runtimeApi);
    if (!ledger || ownerId == null || targetId == null) return null;
    return ledger.setAsset(ownerId, buildKuzuhaCalledKey(targetId), value ? 1 : 0, meta || null);
  }

  function clearAllKuzuhaCalled(runtimeApi, ownerId) {
    var ledger = getLedger(runtimeApi);
    if (!ledger || ownerId == null) return;
    var snapshot = ledger.snapshot();
    var bucket = snapshot && snapshot[ownerId] ? snapshot[ownerId] : null;
    if (!bucket) return;
    Object.keys(bucket).forEach(function(key) {
      if (key.indexOf(KUZUHA_CALLED_PREFIX) === 0) ledger.clearAsset(ownerId, key);
    });
  }

  function getKuzuhaTargetRotTotal(runtimeApi, targetId) {
    var ledger = getLedger(runtimeApi);
    if (!ledger || targetId == null) return 0;
    var snapshot = ledger.snapshot();
    var total = 0;
    var debtKey = buildKuzuhaDebtKey(targetId);
    Object.keys(snapshot || {}).forEach(function(ownerId) {
      var bucket = snapshot[ownerId] || {};
      var asset = bucket[debtKey];
      if (!asset) return;
      total += Math.max(0, Number(asset.value || 0));
    });
    return total;
  }

  function syncKuzuhaDebtMarks(runtimeApi) {
    var skillSystem = getSkillSystem(runtimeApi);
    var players = getGamePlayers(runtimeApi);
    if (!skillSystem || !players.length) return;

    for (var i = 0; i < players.length; i++) {
      var player = players[i];
      if (!player) continue;
      if (!isRuntimePlayerLive(player)) {
        clearStatusMarkSafe(skillSystem, player.id, 'kuzuha_debt_rot');
        continue;
      }
      var total = getKuzuhaTargetRotTotal(runtimeApi, player.id);
      var tier = Math.max(0, Math.min(6, Math.floor(total / 10)));
      if (tier > 0) {
        skillSystem.setStatusMark(player.id, 'kuzuha_debt_rot', {
          sourceName: 'KUZUHA',
          icon: KUZUHA_DEBT_ICON,
          title: '债蚀',
          tone: 'kuzuha',
          duration: 'persistent',
          value: total,
          count: tier,
          badgeText: String(tier),
          detail: '债蚀: ' + total + '/60'
        });
      } else if (typeof skillSystem.clearStatusMark === 'function') {
        skillSystem.clearStatusMark(player.id, 'kuzuha_debt_rot');
      }
      if (typeof skillSystem.emit === 'function') {
        skillSystem.emit('kuzuha:debt_sync', {
          ownerId: player.id,
          ownerName: player.name,
          totalDebt: total,
          tier: tier,
          hasMark: tier > 0
        });
      }
    }
  }

  function queueKuzuhaCurse(runtimeApi, ownerId, targetId, power, sourceKey, extraMeta) {
    var owner = getPlayerById(runtimeApi, ownerId);
    var target = getPlayerById(runtimeApi, targetId);
    if (!owner || !target || power <= 0) return 0;
    var phase = (extraMeta && extraMeta.phase != null) ? extraMeta.phase : resolveRuntimePhase(runtimeApi, null);
    var eulaliaPlayers = getEulaliaPlayers(runtimeApi);
    for (var ei = 0; ei < eulaliaPlayers.length; ei++) {
      var absorberId = eulaliaPlayers[ei] && eulaliaPlayers[ei].id;
      if (absorberId == null) continue;
      if (!isEulaliaCombatActive(runtimeApi, absorberId)) continue;
      if (!isEulaliaAbsorbWindowOpen(runtimeApi, absorberId, phase)) continue;
      recordEulaliaBurden(runtimeApi, absorberId, phase, power, {
        reason: 'eulalia_absorb_kuzuha_curse',
        includeAbsolutionTotal: true
      });
      return power;
    }
    queueRuntimeForce(runtimeApi, {
      ownerId: ownerId,
      ownerName: owner.name,
      type: 'curse',
      targetId: targetId,
      targetName: target.name,
      power: power,
      effectivePower: power,
      tier: 99,
      attr: 'chaos',
      activation: 'active',
      source: sourceKey,
      skillKey: sourceKey
    }, Object.assign({
      reason: sourceKey,
      ownerId: ownerId,
      targetId: targetId
    }, extraMeta || {}));
    triggerEulaliaRealtimeAbsorb(runtimeApi, phase, 'eulalia_absorb_kuzuha_curse');
    return power;
  }

  function queueKuzuhaFortune(runtimeApi, ownerId, power, sourceKey, extraMeta) {
    var owner = getPlayerById(runtimeApi, ownerId);
    if (!owner || power <= 0) return 0;
    queueRuntimeForce(runtimeApi, {
      ownerId: ownerId,
      ownerName: owner.name,
      type: 'fortune',
      power: power,
      effectivePower: power,
      tier: 99,
      attr: 'moirai',
      activation: 'active',
      source: sourceKey,
      skillKey: sourceKey
    }, Object.assign({
      reason: sourceKey,
      ownerId: ownerId
    }, extraMeta || {}));
    return power;
  }

  function addKuzuhaDebtRot(runtimeApi, ownerId, targetId, amount, meta) {
    var owner = getPlayerById(runtimeApi, ownerId);
    var target = getPlayerById(runtimeApi, targetId);
    var delta = Math.max(0, Math.ceil(Number(amount || 0)));
    var current = getKuzuhaDebtRotValue(runtimeApi, ownerId, targetId);
    var next = current + delta;
    var overflow = Math.max(0, next - 60);
    var clamped = Math.min(60, next);
    setKuzuhaDebtRot(runtimeApi, ownerId, targetId, clamped, Object.assign({
      sourceName: owner ? owner.name : 'KUZUHA',
      targetName: target ? target.name : ('ID:' + targetId),
      delta: delta
    }, meta || {}));
    if (overflow > 0) {
      queueKuzuhaCurse(runtimeApi, ownerId, targetId, Math.ceil(overflow * 0.5), 'kuzuha_debt_overflow', {
        overflow: overflow
      });
    }
    syncKuzuhaDebtMarks(runtimeApi);
    return {
      before: current,
      after: clamped,
      delta: delta,
      overflow: overflow
    };
  }

  function applyKuzuhaHouseTab(runtimeApi, ownerId, targetId, appliedPower, targetRotBefore, sourceKey) {
    var effect = getTraitEffect(runtimeApi, ownerId, 'kuzuha_house_tab');
    if (!effect || targetId == null) return null;
    var bonus = targetRotBefore > 0
      ? Math.max(1, Math.ceil(Math.max(0, Number(appliedPower || 0)) * Number(effect.convertRate || 0.25)))
      : Math.max(0, Number(effect.initialDebt || 8));
    if (bonus <= 0) return null;
    return addKuzuhaDebtRot(runtimeApi, ownerId, targetId, bonus, {
      source: sourceKey || 'house_tab',
      trait: 'house_tab'
    });
  }

  function handleKuzuhaHouseEdge(payload, runtimeApi) {
    var skill = payload && payload.skill;
    var ownerId = skill && skill.ownerId;
    var targetId = payload && payload.targetId != null
      ? payload.targetId
      : payload && payload.options && payload.options.targetId != null
        ? payload.options.targetId
        : null;
    if (ownerId == null || targetId == null) return;

    var before = getKuzuhaDebtRotValue(runtimeApi, ownerId, targetId);
    var debtGain = before > 0 ? 18 : 12;
    queueKuzuhaCurse(runtimeApi, ownerId, targetId, 18, 'house_edge');
    addKuzuhaDebtRot(runtimeApi, ownerId, targetId, debtGain, {
      source: 'house_edge',
      skillKey: 'house_edge'
    });
    var traitResult = applyKuzuhaHouseTab(runtimeApi, ownerId, targetId, 18, before, 'house_edge');
    var skillSystem = getSkillSystem(runtimeApi);
    if (skillSystem && typeof skillSystem.emit === 'function') {
      skillSystem.emit('kuzuha:house_edge_applied', {
        ownerId: ownerId,
        targetId: targetId,
        debtBefore: before,
        baseDebtGain: debtGain,
        traitDebtGain: traitResult && traitResult.delta != null ? traitResult.delta : 0,
        debtAfter: getKuzuhaDebtRotValue(runtimeApi, ownerId, targetId)
      });
    }
  }

  function handleKuzuhaDebtCall(payload, runtimeApi) {
    var skill = payload && payload.skill;
    var ownerId = skill && skill.ownerId;
    var targetId = payload && payload.targetId != null
      ? payload.targetId
      : payload && payload.options && payload.options.targetId != null
        ? payload.options.targetId
        : null;
    if (ownerId == null || targetId == null) return;

    var current = getKuzuhaDebtRotValue(runtimeApi, ownerId, targetId);
    if (current <= 0) return;

    var cursePower = Math.ceil(current * 0.66);
    var fortunePower = Math.ceil(current * 0.66);
    var remain = Math.max(0, Math.floor(current * 0.34));
    var extraCurse = current >= 30 ? 15 : 0;

    queueKuzuhaCurse(runtimeApi, ownerId, targetId, cursePower, 'debt_call');
    if (extraCurse > 0) queueKuzuhaCurse(runtimeApi, ownerId, targetId, extraCurse, 'debt_call_bonus');
    queueKuzuhaFortune(runtimeApi, ownerId, fortunePower, 'debt_call');
    setKuzuhaDebtRot(runtimeApi, ownerId, targetId, remain, {
      source: 'debt_call',
      retained: remain,
      settled: current
    });
    setKuzuhaDebtCalled(runtimeApi, ownerId, targetId, 1, {
      source: 'debt_call',
      phase: payload && payload.phase != null ? payload.phase : null
    });
    applyKuzuhaHouseTab(runtimeApi, ownerId, targetId, cursePower + extraCurse, current, 'debt_call');
    syncKuzuhaDebtMarks(runtimeApi);
  }

  function handleKuzuhaSkillActivationEvent(payload, runtimeApi) {
    if (!payload || !payload.skill || payload.skill.ownerId == null) return;
    if (payload.__kuzuhaRuntimeHandled) return;
    payload.__kuzuhaRuntimeHandled = true;
    if (payload.type === 'house_edge' || payload.skill.effect === 'house_edge') {
      handleKuzuhaHouseEdge(payload, runtimeApi);
      return;
    }
    if (payload.type === 'debt_call' || payload.skill.effect === 'debt_call') {
      handleKuzuhaDebtCall(payload, runtimeApi);
    }
  }

  function settleKuzuhaDebtStreet(runtimeApi, payload, owner) {
    var opponents = getGamePlayers(runtimeApi).filter(function(player) {
      return player && player.id !== owner.id;
    });
    var settledTotal = 0;
    var highDebt = false;

    for (var i = 0; i < opponents.length; i++) {
      var target = opponents[i];
      var current = getKuzuhaDebtRotValue(runtimeApi, owner.id, target.id);
      if (current <= 0) {
        setKuzuhaDebtCalled(runtimeApi, owner.id, target.id, 0, {
          phase: payload && payload.phase != null ? payload.phase : null
        });
        continue;
      }

      var settledDebt = Math.floor(current / 10) * 10;
      var cursePower = Math.floor(current / 10) * 6;
      if (cursePower > 0) {
        queueKuzuhaCurse(runtimeApi, owner.id, target.id, cursePower, 'kuzuha_debt_rot_settle', {
          phase: payload && payload.phase != null ? payload.phase : null,
          debtValue: current
        });
      }

      settledTotal += settledDebt;
      var called = wasKuzuhaDebtCalled(runtimeApi, owner.id, target.id);
      var nextDebt = current;
      if (!called) nextDebt += 5;
      if (nextDebt > 60) {
        queueKuzuhaCurse(runtimeApi, owner.id, target.id, Math.ceil((nextDebt - 60) * 0.5), 'kuzuha_debt_cap', {
          phase: payload && payload.phase != null ? payload.phase : null,
          debtValue: nextDebt
        });
        nextDebt = 60;
      }

      setKuzuhaDebtRot(runtimeApi, owner.id, target.id, nextDebt, {
        source: 'street_resolved',
        phase: payload && payload.phase != null ? payload.phase : null,
        called: called,
        settledDebt: settledDebt
      });
      setKuzuhaDebtCalled(runtimeApi, owner.id, target.id, 0, {
        phase: payload && payload.phase != null ? payload.phase : null
      });
      if (nextDebt >= 40) highDebt = true;
    }

    var ledger = getLedger(runtimeApi);
    if (ledger) {
      ledger.setAsset(owner.id, KUZUHA_SETTLED_TOTAL_KEY, settledTotal, {
        phase: payload && payload.phase != null ? payload.phase : null
      });
      ledger.setAsset(owner.id, KUZUHA_HIGHWATER_KEY, highDebt ? 1 : 0, {
        phase: payload && payload.phase != null ? payload.phase : null
      });
    }

    var grace = getTraitEffect(runtimeApi, owner.id, 'kuzuha_grace_period');
    var mana = getPlayerManaPool(runtimeApi, owner.id);
    if (grace && mana) {
      var manaRecover = Math.ceil(settledTotal * Number(grace.manaRecoverRate || 0.12));
      if (manaRecover > 0) setManaCurrent(runtimeApi, owner.id, mana.current + manaRecover, 'kuzuha_grace_period');
      if (highDebt) {
        queueKuzuhaFortune(runtimeApi, owner.id, Math.max(0, Number(grace.highDebtFortune || 8)), 'kuzuha_grace_period');
      }
      var skillSystem = getSkillSystem(runtimeApi);
      if (skillSystem) {
        skillSystem.emit('kuzuha:grace_period', {
          ownerId: owner.id,
          ownerName: owner.name,
          phase: payload && payload.phase != null ? payload.phase : null,
          settledTotal: settledTotal,
          manaRecovered: manaRecover,
          gainedFortune: highDebt ? Math.max(0, Number(grace.highDebtFortune || 8)) : 0,
          highDebt: highDebt
        });
      }
    }
  }

  function clearAllKuzuhaAssets(runtimeApi) {
    var ledger = getLedger(runtimeApi);
    var skillSystem = getSkillSystem(runtimeApi);
    if (!ledger) return;
    var snapshot = ledger.snapshot();
    Object.keys(snapshot || {}).forEach(function(ownerId) {
      var bucket = snapshot[ownerId] || {};
      Object.keys(bucket).forEach(function(key) {
        if (key.indexOf(KUZUHA_DEBT_PREFIX) === 0 ||
            key.indexOf(KUZUHA_CALLED_PREFIX) === 0 ||
            key === KUZUHA_SETTLED_TOTAL_KEY ||
            key === KUZUHA_HIGHWATER_KEY) {
          ledger.clearAsset(ownerId, key);
        }
      });
    });
    if (skillSystem && typeof skillSystem.clearStatusMark === 'function') {
      var players = getGamePlayers(runtimeApi);
      for (var i = 0; i < players.length; i++) {
        if (players[i]) skillSystem.clearStatusMark(players[i].id, 'kuzuha_debt_rot');
      }
    }
  }

  function getTrixiePlayers(runtimeApi) {
    return getRolePlayers(runtimeApi, 'TRIXIE');
  }

  function getTrixieAssetValue(runtimeApi, ownerId, key) {
    var ledger = getLedger(runtimeApi);
    if (!ledger || ownerId == null || !key) return 0;
    return Math.max(0, Number(ledger.getValue(ownerId, key) || 0));
  }

  function setTrixieAsset(runtimeApi, ownerId, key, value, meta) {
    var ledger = getLedger(runtimeApi);
    if (!ledger || ownerId == null || !key) return null;
    return ledger.setAsset(ownerId, key, Math.max(0, Number(value || 0)), meta || null);
  }

  function clearTrixieStreetAssets(runtimeApi, ownerId) {
    var ledger = getLedger(runtimeApi);
    if (!ledger || ownerId == null) return;
    ledger.clearAsset(ownerId, TRIXIE_STREET_FORTUNE_KEY);
    ledger.clearAsset(ownerId, TRIXIE_STREET_CURSE_KEY);
    ledger.clearAsset(ownerId, TRIXIE_STREET_RAW_FORTUNE_KEY);
    ledger.clearAsset(ownerId, TRIXIE_STREET_RAW_CURSE_KEY);
    ledger.clearAsset(ownerId, TRIXIE_STREET_BONUS_KEY);
  }

  function clearAllTrixieAssets(runtimeApi) {
    var ledger = getLedger(runtimeApi);
    var skillSystem = getSkillSystem(runtimeApi);
    if (!ledger) return;
    var players = getGamePlayers(runtimeApi);
    for (var i = 0; i < players.length; i++) {
      var player = players[i];
      if (!player) continue;
      ledger.clearAsset(player.id, TRIXIE_WILD_CARD_KEY);
      ledger.clearAsset(player.id, TRIXIE_REWRITE_QUEUE_KEY);
      ledger.clearAsset(player.id, TRIXIE_BLIND_BOX_KEY);
      clearTrixieStreetAssets(runtimeApi, player.id);
      if (skillSystem && typeof skillSystem.clearStatusMark === 'function') {
        skillSystem.clearStatusMark(player.id, 'trixie_wild_card');
        skillSystem.clearStatusMark(player.id, 'trixie_rewrite_delay');
        skillSystem.clearStatusMark(player.id, 'trixie_rewrite_extend');
        skillSystem.clearStatusMark(player.id, 'trixie_blind_box');
      }
    }
  }

  function getTrixieRecipientId(force) {
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

  function getTrixieTakenRate(runtimeApi, ownerId, type) {
    var effect = getTraitEffect(runtimeApi, ownerId, 'trixie_paradox_frame');
    if (!effect) return 1;
    if (type === 'fortune') return Math.max(1, Number(effect.fortuneTakenRate || 1));
    if (type === 'curse') return Math.max(1, Number(effect.curseTakenRate || 1));
    return 1;
  }

  function getTrixieStageBonus(runtimeApi, ownerId, rawFortune, rawCurse) {
    var effect = getTraitEffect(runtimeApi, ownerId, 'trixie_improvised_stage');
    if (!effect) return 0;
    if (rawFortune > Number(effect.highThreshold || 80) && rawCurse > Number(effect.highThreshold || 80)) {
      return Math.max(0, Number(effect.highBonus || 50));
    }
    if (rawFortune > Number(effect.midThreshold || 40) && rawCurse > Number(effect.midThreshold || 40)) {
      return Math.max(0, Number(effect.midBonus || 25));
    }
    return 0;
  }

  function syncTrixieWildMarks(runtimeApi) {
    var skillSystem = getSkillSystem(runtimeApi);
    var players = getGamePlayers(runtimeApi);
    if (!skillSystem || !players.length) return;

    for (var i = 0; i < players.length; i++) {
      var player = players[i];
      if (!player) continue;
      if (!isRuntimePlayerLive(player)) {
        clearStatusMarkSafe(skillSystem, player.id, 'trixie_wild_card');
        continue;
      }
      var total = getTrixieAssetValue(runtimeApi, player.id, TRIXIE_WILD_CARD_KEY);
      var tier = Math.max(0, Math.min(12, Math.floor(total / 10)));
      if (tier > 0) {
        skillSystem.setStatusMark(player.id, 'trixie_wild_card', {
          sourceName: player.name,
          icon: TRIXIE_WILD_ICON,
          title: '鬼牌',
          tone: 'trixie',
          duration: 'persistent',
          value: total,
          count: tier,
          badgeText: String(tier),
          detail: '鬼牌: ' + total + '/120'
        });
      } else if (typeof skillSystem.clearStatusMark === 'function') {
        skillSystem.clearStatusMark(player.id, 'trixie_wild_card');
      }
      if (typeof skillSystem.emit === 'function') {
        skillSystem.emit('trixie:wild_card_sync', {
          ownerId: player.id,
          ownerName: player.name,
          wildCard: total,
          tier: tier,
          hasMark: tier > 0
        });
      }
    }
  }

  function queueTrixieOverflowCurse(runtimeApi, ownerId, power) {
    var owner = getPlayerById(runtimeApi, ownerId);
    if (!owner || power <= 0) return 0;
    var opponents = getGamePlayers(runtimeApi).filter(function(player) {
      return player && player.id !== ownerId;
    });
    var target = opponents.length ? opponents[Math.floor(Math.random() * opponents.length)] : owner;
    if (!target) return 0;
    queueRuntimeForce(runtimeApi, {
      ownerId: ownerId,
      ownerName: owner.name,
      type: 'curse',
      targetId: target.id,
      targetName: target.name,
      power: power,
      effectivePower: power,
      tier: 99,
      attr: 'chaos',
      activation: 'active',
      source: 'trixie_wild_overflow',
      skillKey: 'wild_card_core',
      _trixieWildOverflow: true
    }, {
      reason: 'trixie_wild_overflow',
      ownerId: ownerId,
      targetId: target.id
    });
    return power;
  }

  function forgeTrixieWildCard(runtimeApi, payload, owner) {
    if (!owner) return;
    var core = getTraitEffect(runtimeApi, owner.id, 'trixie_wild_card_core');
    if (!core) return;
    var forceRuntime = getForceRuntime(runtimeApi);
    var summary = payload && payload.summary ? payload.summary : null;
    if (!summary && forceRuntime && typeof forceRuntime.getLastStreetReceivedTotals === 'function') {
      summary = forceRuntime.getLastStreetReceivedTotals({
        excludeSources: ['trixie_rule_rewrite'],
        excludeFlags: ['_trixieWildOverflow']
      });
    }
    var recipients = summary && summary.recipients ? summary.recipients : null;
    var entry = recipients ? recipients[String(owner.id)] : null;
    if (!entry) {
      setTrixieAsset(runtimeApi, owner.id, TRIXIE_STREET_RAW_FORTUNE_KEY, 0, {
        phase: payload && payload.phase != null ? payload.phase : null
      });
      setTrixieAsset(runtimeApi, owner.id, TRIXIE_STREET_RAW_CURSE_KEY, 0, {
        phase: payload && payload.phase != null ? payload.phase : null
      });
      setTrixieAsset(runtimeApi, owner.id, TRIXIE_STREET_FORTUNE_KEY, 0, {
        phase: payload && payload.phase != null ? payload.phase : null
      });
      setTrixieAsset(runtimeApi, owner.id, TRIXIE_STREET_CURSE_KEY, 0, {
        phase: payload && payload.phase != null ? payload.phase : null
      });
      setTrixieAsset(runtimeApi, owner.id, TRIXIE_STREET_BONUS_KEY, 0, {
        phase: payload && payload.phase != null ? payload.phase : null
      });
      syncTrixieWildMarks(runtimeApi);
      return;
    }

    var rawFortune = Math.max(0, Number(entry.rawFortune || 0));
    var rawCurse = Math.max(0, Number(entry.rawCurse || 0));
    var adjustedFortune = Math.max(0, Math.ceil(Number(entry.effectiveFortune || 0)));
    var adjustedCurse = Math.max(0, Math.ceil(Number(entry.effectiveCurse || 0)));
    var bonus = getTrixieStageBonus(runtimeApi, owner.id, rawFortune, rawCurse);
    var forged = Math.ceil((adjustedFortune + adjustedCurse) * Math.max(0, Number(core.convertRate || 0.5)));
    var before = getTrixieAssetValue(runtimeApi, owner.id, TRIXIE_WILD_CARD_KEY);
    var cap = Math.max(0, Number(core.cap || 120));
    var totalGain = forged + bonus;
    var overflow = Math.max(0, before + totalGain - cap);
    var after = Math.min(cap, before + totalGain);

    setTrixieAsset(runtimeApi, owner.id, TRIXIE_STREET_RAW_FORTUNE_KEY, rawFortune, {
      phase: payload.phase || null
    });
    setTrixieAsset(runtimeApi, owner.id, TRIXIE_STREET_RAW_CURSE_KEY, rawCurse, {
      phase: payload.phase || null
    });
    setTrixieAsset(runtimeApi, owner.id, TRIXIE_STREET_FORTUNE_KEY, adjustedFortune, {
      phase: payload.phase || null
    });
    setTrixieAsset(runtimeApi, owner.id, TRIXIE_STREET_CURSE_KEY, adjustedCurse, {
      phase: payload.phase || null
    });
    setTrixieAsset(runtimeApi, owner.id, TRIXIE_STREET_BONUS_KEY, bonus, {
      phase: payload.phase || null
    });
    setTrixieAsset(runtimeApi, owner.id, TRIXIE_WILD_CARD_KEY, after, {
      phase: payload.phase || null,
      forged: forged,
      bonus: bonus,
      overflow: overflow
    });

    if (overflow > 0) {
      queueTrixieOverflowCurse(runtimeApi, owner.id, Math.ceil(overflow * 0.5));
    }
    syncTrixieWildMarks(runtimeApi);

    var skillSystem = getSkillSystem(runtimeApi);
    if (skillSystem && typeof skillSystem.emit === 'function') {
      skillSystem.emit('trixie:wild_card_forged', {
        ownerId: owner.id,
        ownerName: owner.name,
        phase: payload.phase || null,
        rawFortune: rawFortune,
        rawCurse: rawCurse,
        adjustedFortune: adjustedFortune,
        adjustedCurse: adjustedCurse,
        forged: forged,
        bonus: bonus,
        before: before,
        after: after,
        overflow: overflow
      });
    }
  }

  function getTrixieAsset(runtimeApi, ownerId, key) {
    var ledger = getLedger(runtimeApi);
    if (!ledger || ownerId == null || !key) return null;
    return ledger.getAsset(ownerId, key);
  }

  function getTrixieRewriteContracts(runtimeApi, ownerId) {
    var forceRuntime = getForceRuntime(runtimeApi);
    if (forceRuntime && typeof forceRuntime.getScheduledStreetContracts === 'function') {
      return forceRuntime.getScheduledStreetContracts(runtimeApi, ownerId, TRIXIE_REWRITE_QUEUE_KEY);
    }
    var asset = getTrixieAsset(runtimeApi, ownerId, TRIXIE_REWRITE_QUEUE_KEY);
    return asset && Array.isArray(asset.contracts) ? asset.contracts.slice() : [];
  }

  function setTrixieRewriteContracts(runtimeApi, ownerId, contracts, meta) {
    var forceRuntime = getForceRuntime(runtimeApi);
    if (forceRuntime && typeof forceRuntime.setScheduledStreetContracts === 'function') {
      return forceRuntime.setScheduledStreetContracts(runtimeApi, ownerId, TRIXIE_REWRITE_QUEUE_KEY, contracts, meta);
    }
    var ledger = getLedger(runtimeApi);
    if (!ledger || ownerId == null) return null;
    var nextContracts = Array.isArray(contracts) ? contracts.slice() : [];
    if (!nextContracts.length) {
      ledger.clearAsset(ownerId, TRIXIE_REWRITE_QUEUE_KEY);
      return null;
    }
    return ledger.setAsset(ownerId, TRIXIE_REWRITE_QUEUE_KEY, nextContracts.length, Object.assign({
      contracts: nextContracts
    }, meta || {}));
  }

  function getTrixieBlindBoxContract(runtimeApi, ownerId) {
    var asset = getTrixieAsset(runtimeApi, ownerId, TRIXIE_BLIND_BOX_KEY);
    return asset && asset.contract ? Object.assign({}, asset.contract) : null;
  }

  function setTrixieBlindBoxContract(runtimeApi, ownerId, contract, meta) {
    var ledger = getLedger(runtimeApi);
    if (!ledger || ownerId == null) return null;
    if (!contract) {
      ledger.clearAsset(ownerId, TRIXIE_BLIND_BOX_KEY);
      return null;
    }
    return ledger.setAsset(ownerId, TRIXIE_BLIND_BOX_KEY, Math.max(0, Number(contract.remainingStreets || 0)), Object.assign({
      contract: Object.assign({}, contract)
    }, meta || {}));
  }

  function clearTrixieRuntimeMarks(runtimeApi, ownerId) {
    var skillSystem = getSkillSystem(runtimeApi);
    if (!skillSystem || typeof skillSystem.clearStatusMark !== 'function' || ownerId == null) return;
    skillSystem.clearStatusMark(ownerId, 'trixie_rewrite_delay');
    skillSystem.clearStatusMark(ownerId, 'trixie_rewrite_extend');
    skillSystem.clearStatusMark(ownerId, 'trixie_blind_box');
  }

  function getNextPhase(phase) {
    var key = String(phase || '').toLowerCase();
    if (key === 'preflop') return 'flop';
    if (key === 'flop') return 'turn';
    if (key === 'turn') return 'river';
    return 'river';
  }

  function syncTrixieRewriteMarks(runtimeApi, ownerId, phaseOverride) {
    var skillSystem = getSkillSystem(runtimeApi);
    if (!skillSystem || ownerId == null) return;
    var owner = getPlayerById(runtimeApi, ownerId);
    if (!owner || !isRuntimePlayerLive(owner)) {
      clearStatusMarkSafe(skillSystem, ownerId, 'trixie_rewrite_delay');
      clearStatusMarkSafe(skillSystem, ownerId, 'trixie_rewrite_extend');
      return;
    }
    var contracts = getTrixieRewriteContracts(runtimeApi, ownerId);
    var forceRuntime = getForceRuntime(runtimeApi);
    var currentPhase = phaseOverride || resolveRuntimePhase(runtimeApi, null);
    var delayCount = 0;
    var extendCount = 0;

    for (var i = 0; i < contracts.length; i++) {
      var contract = contracts[i];
      if (!contract) continue;
      var stageCount = forceRuntime && typeof forceRuntime.countScheduledStreetStages === 'function'
        ? forceRuntime.countScheduledStreetStages(contract, currentPhase)
        : 0;
      if (contract.modifier === 'delay') {
        if (Number(contract.waitStreets || 0) > 0) {
          stageCount = Math.max(stageCount, 2);
        } else if (
          (Number(contract.stagesRemaining || 0) > 0) ||
          (Number(contract.displayStagesRemaining || 0) > 0)
        ) {
          stageCount = Math.max(stageCount, 1);
        }
      }
      if (contract.modifier === 'extend') {
        if (
          contract.consumeCurrentStreetOnResolve === true ||
          Number(contract.createdStreetIndex || -1) === getStreetIndex(currentPhase)
        ) {
          stageCount = Math.max(stageCount, 2);
        } else if (
          (Number(contract.stagesRemaining || 0) > 0) ||
          (Number(contract.displayStagesRemaining || 0) > 0)
        ) {
          stageCount = Math.max(stageCount, 1);
        }
      }
      if (contract.modifier === 'delay') delayCount += stageCount;
      if (contract.modifier === 'extend') extendCount += stageCount;
    }

    if (delayCount > 0) {
      skillSystem.setStatusMark(ownerId, 'trixie_rewrite_delay', {
        sourceName: owner ? owner.name : 'TRIXIE',
        icon: TRIXIE_REWRITE_DELAY_ICON,
        title: '延后一街',
        tone: 'trixie',
        duration: 'persistent',
        count: delayCount,
        badgeText: String(delayCount),
        detail: '规则篡改将在下一街生效'
      });
    } else if (typeof skillSystem.clearStatusMark === 'function') {
      skillSystem.clearStatusMark(ownerId, 'trixie_rewrite_delay');
    }

    if (extendCount > 0) {
      skillSystem.setStatusMark(ownerId, 'trixie_rewrite_extend', {
        sourceName: owner ? owner.name : 'TRIXIE',
        icon: TRIXIE_REWRITE_EXTEND_ICON,
        title: '增加一街',
        tone: 'trixie',
        duration: 'persistent',
        count: extendCount,
        badgeText: String(extendCount),
        detail: '规则篡改将覆盖本街并追加下一街'
      });
    } else if (typeof skillSystem.clearStatusMark === 'function') {
      skillSystem.clearStatusMark(ownerId, 'trixie_rewrite_extend');
    }
  }

  function syncTrixieBlindBoxMark(runtimeApi, ownerId) {
    var skillSystem = getSkillSystem(runtimeApi);
    if (!skillSystem || ownerId == null) return;
    var owner = getPlayerById(runtimeApi, ownerId);
    if (!owner || !isRuntimePlayerLive(owner)) {
      clearStatusMarkSafe(skillSystem, ownerId, 'trixie_blind_box');
      return;
    }
    var contract = getTrixieBlindBoxContract(runtimeApi, ownerId);
    if (contract) {
      skillSystem.setStatusMark(ownerId, 'trixie_blind_box', {
        sourceName: owner ? owner.name : 'TRIXIE',
        icon: TRIXIE_BLIND_BOX_ICON,
        title: '盲盒派对',
        tone: 'trixie',
        duration: 'persistent',
        count: Math.max(0, Number(contract.remainingStreets || 0)),
        badgeText: String(Math.max(0, Number(contract.remainingStreets || 0))),
        detail: '账户篡位剩余街数: ' + Math.max(0, Number(contract.remainingStreets || 0))
      });
    } else if (typeof skillSystem.clearStatusMark === 'function') {
      skillSystem.clearStatusMark(ownerId, 'trixie_blind_box');
    }
  }

  function syncAllTrixieRuntimeMarks(runtimeApi, phaseOverride) {
    var players = getTrixiePlayers(runtimeApi);
    for (var i = 0; i < players.length; i++) {
      syncTrixieRewriteMarks(runtimeApi, players[i].id, phaseOverride);
      syncTrixieBlindBoxMark(runtimeApi, players[i].id);
    }
  }

  function resolveTrixieRewriteTargets(runtimeApi, ownerId, contract) {
    var players = getGamePlayers(runtimeApi);
    if (!players.length || !contract) return [];
    if (contract.mode === 'fortune_self') {
      if (contract.global) {
        return players.filter(function(player) {
          return player && player.isActive !== false && !player.folded;
        }).map(function(player) { return player.id; });
      }
      return [ownerId];
    }
    if (contract.global) {
      return players.filter(function(player) {
        return player && player.id !== ownerId && player.isActive !== false && !player.folded;
      }).map(function(player) { return player.id; });
    }
    if (contract.targetId == null) return [];
    var target = getPlayerById(runtimeApi, contract.targetId);
    if (!target || target.isActive === false || target.folded) return [];
    return [target.id];
  }

  function queueTrixieRewriteForces(runtimeApi, ownerId, contract, meta) {
    var owner = getPlayerById(runtimeApi, ownerId);
    if (!owner || !contract) return 0;
    var targets = resolveTrixieRewriteTargets(runtimeApi, ownerId, contract);
    var totalQueued = 0;

    for (var i = 0; i < targets.length; i++) {
      var targetId = targets[i];
      var target = getPlayerById(runtimeApi, targetId);
      if (!target) continue;
      var force = {
        ownerId: ownerId,
        ownerName: owner.name,
        type: contract.mode === 'fortune_self' ? 'fortune' : 'curse',
        power: Math.max(0, Number(contract.power || 0)),
        effectivePower: Math.max(0, Number(contract.power || 0)),
        tier: 2,
        attr: 'chaos',
        activation: 'active',
        source: 'trixie_rule_rewrite',
        skillKey: 'rule_rewrite'
      };
      if (force.type === 'fortune') {
        force.targetId = targetId;
        force.targetName = target.name;
      } else {
        force.targetId = targetId;
        force.targetName = target.name;
      }
      queueRuntimeForce(runtimeApi, force, Object.assign({
        reason: 'trixie_rule_rewrite',
        ownerId: ownerId,
        targetId: targetId
      }, meta || {}));
      totalQueued += Math.max(0, Number(contract.power || 0));
    }
    return totalQueued;
  }

  function resolveRuntimePhase(runtimeApi, payload) {
    if (payload && payload.phase != null) return String(payload.phase);
    if (runtimeApi && typeof runtimeApi.getGameState === 'function') {
      var gameState = runtimeApi.getGameState();
      if (gameState && gameState.phase != null) return String(gameState.phase);
    }
    return null;
  }

  function consumeTrixieWildCard(runtimeApi, ownerId) {
    var current = getTrixieAssetValue(runtimeApi, ownerId, TRIXIE_WILD_CARD_KEY);
    setTrixieAsset(runtimeApi, ownerId, TRIXIE_WILD_CARD_KEY, 0, {
      source: 'trixie_skill_consume'
    });
    syncTrixieWildMarks(runtimeApi);
    return current;
  }

  function handleTrixieRuleRewrite(payload, runtimeApi) {
    var skill = payload && payload.skill;
    var ownerId = skill && skill.ownerId;
    var options = payload && payload.options ? payload.options : {};
    if (ownerId == null) return;

    var owner = getPlayerById(runtimeApi, ownerId);
    if (!owner) return;

    var mode = String(options.rewriteMode || 'fortune_self');
    var modifier = String(options.rewriteModifier || 'none');
    var isGlobal = options.rewriteGlobal === true;
    var targetId = options.targetId != null ? Number(options.targetId) : null;
    if (mode === 'curse_target' && !isGlobal && targetId == null) return;
    var wildCard = consumeTrixieWildCard(runtimeApi, ownerId);
    if (wildCard <= 0) return;
    var modeMultiplier = mode === 'curse_target' ? 1.33 : 1;
    var modifierMultiplier = modifier === 'delay' ? 0.9 : modifier === 'extend' ? 0.75 : 1;
    var rangeMultiplier = isGlobal ? 0.5 : 1;
    var totalPower = Math.max(1, Math.ceil(wildCard * modeMultiplier * modifierMultiplier * rangeMultiplier));
    var contracts = getTrixieRewriteContracts(runtimeApi, ownerId);
    var phase = resolveRuntimePhase(runtimeApi, payload);
    var forceRuntime = getForceRuntime(runtimeApi);
    var scheduledShots = modifier === 'extend' ? 2 : 1;
    var scheduleDelay = modifier === 'delay' ? 1 : 0;
    var rewriteContract = forceRuntime && typeof forceRuntime.createStreetEffectContract === 'function'
      ? forceRuntime.createStreetEffectContract(phase, {
          delayStreets: scheduleDelay,
          futureStageCount: scheduledShots,
          includeCurrentStreet: false,
          crossHand: true,
          payload: {
            modifier: modifier,
            mode: mode,
            global: isGlobal,
            targetId: targetId,
            power: totalPower
          }
        })
      : null;

    if (rewriteContract) contracts.push(rewriteContract);

    setTrixieRewriteContracts(runtimeApi, ownerId, contracts, {
      source: 'rule_rewrite',
      modifier: modifier
    });
    syncTrixieRewriteMarks(runtimeApi, ownerId);

    var skillSystem = getSkillSystem(runtimeApi);
    if (skillSystem && typeof skillSystem.emit === 'function') {
      if (typeof skillSystem._log === 'function') {
        skillSystem._log('TRIXIE_RULE_REWRITE_CAST', {
          ownerId: ownerId,
          ownerName: owner.name,
          mode: mode,
          modifier: modifier,
          global: isGlobal,
          targetId: targetId,
          wildConsumed: wildCard,
          totalPower: totalPower,
          scheduledShots: scheduledShots,
          scheduleDelay: scheduleDelay,
          phase: phase
        });
      }
      skillSystem.emit('trixie:rule_rewrite_cast', {
        ownerId: ownerId,
        ownerName: owner.name,
        mode: mode,
        modifier: modifier,
        global: isGlobal,
        targetId: targetId,
        wildConsumed: wildCard,
        totalPower: totalPower,
        scheduledShots: scheduledShots,
        scheduleDelay: scheduleDelay,
        phase: phase
      });
    }
  }

  function injectTrixieRewriteContracts(runtimeApi, payload) {
    var phase = resolveRuntimePhase(runtimeApi, payload);
    var players = getTrixiePlayers(runtimeApi);
    var skillSystem = getSkillSystem(runtimeApi);
    var forceRuntime = getForceRuntime(runtimeApi);
    for (var i = 0; i < players.length; i++) {
      var owner = players[i];
      var contracts = forceRuntime && typeof forceRuntime.collectDueStreetContracts === 'function'
        ? forceRuntime.collectDueStreetContracts(runtimeApi, owner.id, TRIXIE_REWRITE_QUEUE_KEY, phase)
        : [];
      for (var j = 0; j < contracts.length; j++) {
        var contract = contracts[j];
        if (!contract) continue;
        queueTrixieRewriteForces(runtimeApi, owner.id, contract, {
          modifier: contract.modifier,
          contractId: contract.id,
          phase: phase
        });
      if (skillSystem && typeof skillSystem.emit === 'function') {
        if (typeof skillSystem._log === 'function') {
          skillSystem._log('TRIXIE_RULE_REWRITE_CONTRACT', {
            ownerId: owner.id,
            ownerName: owner.name,
            contractId: contract.id,
            modifier: contract.modifier,
            startPhase: contract.createdStreetIndex,
            currentPhase: phase,
            remainingShots: forceRuntime && typeof forceRuntime.countScheduledStreetStages === 'function'
              ? forceRuntime.countScheduledStreetStages(contract, phase)
              : Math.max(0, Number(contract.displayStagesRemaining || 0)),
            power: contract.power
          });
        }
        skillSystem.emit('trixie:rule_rewrite_contract', {
          ownerId: owner.id,
          ownerName: owner.name,
            contractId: contract.id,
            modifier: contract.modifier,
            startPhase: contract.createdStreetIndex,
            currentPhase: phase,
            remainingShots: forceRuntime && typeof forceRuntime.countScheduledStreetStages === 'function'
              ? forceRuntime.countScheduledStreetStages(contract, phase)
              : Math.max(0, Number(contract.displayStagesRemaining || 0)),
            power: contract.power
          });
        }
      }
    }
  }

  function advanceTrixieRewriteContracts(runtimeApi, payload) {
    var phase = resolveRuntimePhase(runtimeApi, payload);
    var nextPhase = getNextPhase(phase);
    var forceRuntime = getForceRuntime(runtimeApi);
    var skillSystem = getSkillSystem(runtimeApi);
    var players = getTrixiePlayers(runtimeApi);
    for (var i = 0; i < players.length; i++) {
      var owner = players[i];
      if (forceRuntime && typeof forceRuntime.pruneStreetContracts === 'function') {
        forceRuntime.pruneStreetContracts(runtimeApi, owner.id, TRIXIE_REWRITE_QUEUE_KEY, phase);
      } else {
        setTrixieRewriteContracts(runtimeApi, owner.id, [], {
          phase: phase
        });
      }
      syncTrixieRewriteMarks(runtimeApi, owner.id, nextPhase);
      if (skillSystem && typeof skillSystem.emit === 'function') {
        if (typeof skillSystem._log === 'function') {
          skillSystem._log('TRIXIE_RULE_REWRITE_TICK', {
            ownerId: owner.id,
            ownerName: owner.name,
            phase: phase,
            nextPhase: nextPhase,
            remainingStages: getTrixieRewriteContracts(runtimeApi, owner.id).reduce(function(sum, contract) {
              var forceRt = getForceRuntime(runtimeApi);
              if (!forceRt || typeof forceRt.countScheduledStreetStages !== 'function') return sum;
              return sum + forceRt.countScheduledStreetStages(contract, nextPhase);
            }, 0)
          });
        }
        skillSystem.emit('trixie:rule_rewrite_tick', {
          ownerId: owner.id,
          ownerName: owner.name,
          phase: phase,
          nextPhase: nextPhase,
          remainingStages: getTrixieRewriteContracts(runtimeApi, owner.id).reduce(function(sum, contract) {
            var forceRt = getForceRuntime(runtimeApi);
            if (!forceRt || typeof forceRt.countScheduledStreetStages !== 'function') return sum;
            return sum + forceRt.countScheduledStreetStages(contract, nextPhase);
          }, 0)
        });
      }
    }
  }

  function getBlindBoxParticipantShare(runtimeApi, participantId) {
    var player = getPlayerById(runtimeApi, participantId);
    var mana = getPlayerManaPool(runtimeApi, participantId);
    return {
      chips: Math.max(0, Math.floor(Number(player && player.chips || 0) * 0.5)),
      mana: Math.max(0, Math.floor(Number(mana && mana.current || 0) * 0.5))
    };
  }

  function splitBlindBoxTotals(total) {
    var safeTotal = Math.max(0, Number(total || 0));
    var first = Math.ceil(safeTotal / 2);
    return [first, safeTotal - first];
  }

  function applyBlindBoxSwap(runtimeApi, contract) {
    if (!contract || !Array.isArray(contract.participantIds) || contract.participantIds.length !== 2) return;
    var aId = Number(contract.participantIds[0]);
    var bId = Number(contract.participantIds[1]);
    var aPlayer = getPlayerById(runtimeApi, aId);
    var bPlayer = getPlayerById(runtimeApi, bId);
    var aMana = getPlayerManaPool(runtimeApi, aId);
    var bMana = getPlayerManaPool(runtimeApi, bId);
    if (!aPlayer || !bPlayer || !aMana || !bMana) return;

    var chipSplit = splitBlindBoxTotals(Number(aPlayer.chips || 0) + Number(bPlayer.chips || 0));
    var manaSplit = splitBlindBoxTotals(Number(aMana.current || 0) + Number(bMana.current || 0));

    setPlayerChips(runtimeApi, aId, chipSplit[0], 'trixie_blind_box');
    setPlayerChips(runtimeApi, bId, chipSplit[1], 'trixie_blind_box');
    setManaCurrent(runtimeApi, aId, manaSplit[0], 'trixie_blind_box');
    setManaCurrent(runtimeApi, bId, manaSplit[1], 'trixie_blind_box');
  }

  function revertBlindBoxSwap(runtimeApi, contract) {
    if (!contract || !Array.isArray(contract.participantIds) || contract.participantIds.length !== 2) return;
    var aId = Number(contract.participantIds[0]);
    var bId = Number(contract.participantIds[1]);
    var aPlayer = getPlayerById(runtimeApi, aId);
    var bPlayer = getPlayerById(runtimeApi, bId);
    var aMana = getPlayerManaPool(runtimeApi, aId);
    var bMana = getPlayerManaPool(runtimeApi, bId);
    if (!aPlayer || !bPlayer || !aMana || !bMana) return;

    var chipSplit = splitBlindBoxTotals(Number(aPlayer.chips || 0) + Number(bPlayer.chips || 0));
    var manaSplit = splitBlindBoxTotals(Number(aMana.current || 0) + Number(bMana.current || 0));

    setPlayerChips(runtimeApi, aId, chipSplit[0], 'trixie_blind_box_revert');
    setPlayerChips(runtimeApi, bId, chipSplit[1], 'trixie_blind_box_revert');
    setManaCurrent(runtimeApi, aId, manaSplit[0], 'trixie_blind_box_revert');
    setManaCurrent(runtimeApi, bId, manaSplit[1], 'trixie_blind_box_revert');
  }

  function handleTrixieBlindBox(payload, runtimeApi) {
    var skill = payload && payload.skill;
    var ownerId = skill && skill.ownerId;
    var options = payload && payload.options ? payload.options : {};
    if (ownerId == null) return;
    var owner = getPlayerById(runtimeApi, ownerId);
    if (!owner) return;

    var participantIds = Array.isArray(options.participantIds)
      ? options.participantIds.map(function(id) { return Number(id); }).filter(function(id) { return Number.isFinite(id); })
      : [];
    if (participantIds.length !== 2 || participantIds[0] === participantIds[1]) return;
    var wildCard = consumeTrixieWildCard(runtimeApi, ownerId);
    if (wildCard <= 0) return;

    var contract = {
      ownerId: ownerId,
      participantIds: participantIds.slice(0, 2),
      remainingStreets: 3,
      wildConsumed: wildCard,
      aShare: getBlindBoxParticipantShare(runtimeApi, participantIds[0]),
      bShare: getBlindBoxParticipantShare(runtimeApi, participantIds[1])
    };

    applyBlindBoxSwap(runtimeApi, contract);
    setTrixieBlindBoxContract(runtimeApi, ownerId, contract, {
      source: 'blind_box'
    });
    syncTrixieBlindBoxMark(runtimeApi, ownerId);

    var skillSystem = getSkillSystem(runtimeApi);
    if (skillSystem && typeof skillSystem.emit === 'function') {
      skillSystem.emit('trixie:blind_box_cast', {
        ownerId: ownerId,
        ownerName: owner.name,
        participantIds: contract.participantIds.slice(),
        remainingStreets: contract.remainingStreets,
        wildConsumed: wildCard,
        aShare: Object.assign({}, contract.aShare),
        bShare: Object.assign({}, contract.bShare)
      });
    }
  }

  function advanceTrixieBlindBoxContracts(runtimeApi, payload) {
    var phase = resolveRuntimePhase(runtimeApi, payload);
    var players = getTrixiePlayers(runtimeApi);
    var skillSystem = getSkillSystem(runtimeApi);
    for (var i = 0; i < players.length; i++) {
      var owner = players[i];
      var contract = getTrixieBlindBoxContract(runtimeApi, owner.id);
      if (!contract) continue;
      contract.remainingStreets = Math.max(0, Number(contract.remainingStreets || 0) - 1);
      if (contract.remainingStreets <= 0) {
        revertBlindBoxSwap(runtimeApi, contract);
        setTrixieBlindBoxContract(runtimeApi, owner.id, null);
        syncTrixieBlindBoxMark(runtimeApi, owner.id);
        if (skillSystem && typeof skillSystem.emit === 'function') {
          skillSystem.emit('trixie:blind_box_revert', {
            ownerId: owner.id,
            ownerName: owner.name,
            participantIds: contract.participantIds.slice(),
            phase: phase
          });
        }
      } else {
        setTrixieBlindBoxContract(runtimeApi, owner.id, contract, {
          phase: phase
        });
        syncTrixieBlindBoxMark(runtimeApi, owner.id);
        if (skillSystem && typeof skillSystem.emit === 'function') {
          skillSystem.emit('trixie:blind_box_tick', {
            ownerId: owner.id,
            ownerName: owner.name,
            remainingStreets: contract.remainingStreets,
            phase: phase
          });
        }
      }
    }
  }

  function clearTrixieContractsOnHandEnd(runtimeApi, payload) {
    var forceRuntime = getForceRuntime(runtimeApi);
    var players = getTrixiePlayers(runtimeApi);
    for (var i = 0; i < players.length; i++) {
      var owner = players[i];
      var contract = getTrixieBlindBoxContract(runtimeApi, owner.id);
      if (contract) {
        revertBlindBoxSwap(runtimeApi, contract);
        setTrixieBlindBoxContract(runtimeApi, owner.id, null);
      }
      if (forceRuntime && typeof forceRuntime.clearScheduledStreetContracts === 'function') {
        forceRuntime.clearScheduledStreetContracts(runtimeApi, owner.id, TRIXIE_REWRITE_QUEUE_KEY, {
          keepCrossHand: true,
          meta: {
            phase: payload && payload.phase != null ? payload.phase : null
          }
        });
      } else {
        var keptContracts = getTrixieRewriteContracts(runtimeApi, owner.id).filter(function(rewriteContract) {
          return rewriteContract && rewriteContract.crossHand === true;
        });
        setTrixieRewriteContracts(runtimeApi, owner.id, keptContracts, {
          phase: payload && payload.phase != null ? payload.phase : null
        });
      }
      syncTrixieRewriteMarks(runtimeApi, owner.id);
      syncTrixieBlindBoxMark(runtimeApi, owner.id);
    }
  }

  function handleTrixieSkillActivationEvent(payload, runtimeApi) {
    if (!payload || !payload.skill || payload.skill.ownerId == null) return;
    if (payload.__trixieRuntimeHandled) return;
    payload.__trixieRuntimeHandled = true;
    if (payload.type === 'rule_rewrite' || payload.skill.effect === 'rule_rewrite') {
      handleTrixieRuleRewrite(payload, runtimeApi);
      return;
    }
    if (payload.type === 'blind_box' || payload.skill.effect === 'blind_box') {
      handleTrixieBlindBox(payload, runtimeApi);
    }
  }

  function getCotaPlayers(runtimeApi) {
    return getRolePlayers(runtimeApi, 'COTA');
  }

  function isCotaAssetKey(key) {
    return key === COTA_SLOT_COUNT_KEY ||
      key === COTA_CARDS_KEY ||
      key === COTA_FAULT_STATE_KEY ||
      key === COTA_BUST_RATE_KEY ||
      key === COTA_SELF_CURSE_PRESSURE_KEY ||
      key === COTA_FIRST_BUST_BONUS_KEY ||
      key === COTA_NEW_CARD_COST_DELTA_KEY;
  }

  function normalizeCotaCardType(raw) {
    var key = String(raw || '').toLowerCase();
    if (key === 'good' || key === 'fortune' || key === 'good_card' || key === 'goodcard') return 'good';
    if (key === 'bad' || key === 'curse' || key === 'bad_card' || key === 'badcard') return 'bad';
    if (key === 'misc' || key === 'mixed' || key === 'utility' || key === 'misc_card' || key === 'misccard') return 'misc';
    return null;
  }

  function cloneCotaCards(cards) {
    return Array.isArray(cards) ? cards.map(function(card) {
      return Object.assign({}, card);
    }) : [];
  }

  function getCotaAsset(runtimeApi, ownerId, key) {
    var ledger = getLedger(runtimeApi);
    if (!ledger || ownerId == null || !key || typeof ledger.getAsset !== 'function') return null;
    return ledger.getAsset(ownerId, key);
  }

  function getCotaAssetValue(runtimeApi, ownerId, key, fallbackValue) {
    var asset = getCotaAsset(runtimeApi, ownerId, key);
    if (!asset) return fallbackValue != null ? fallbackValue : 0;
    return Math.max(0, Number(asset.value || 0));
  }

  function getCotaDefaultBaseValue(cardType) {
    var type = normalizeCotaCardType(cardType);
    var defaults = type ? COTA_CARD_DEFAULTS[type] : null;
    return Math.max(0, Number(defaults && defaults.baseValue || 0));
  }

  function setCotaAsset(runtimeApi, ownerId, key, value, meta) {
    var ledger = getLedger(runtimeApi);
    if (!ledger || ownerId == null || !key || typeof ledger.setAsset !== 'function') return null;
    return ledger.setAsset(ownerId, key, value, Object.assign({
      syncedAt: Date.now()
    }, meta || {}));
  }

  function clearCotaAsset(runtimeApi, ownerId, key) {
    var ledger = getLedger(runtimeApi);
    if (!ledger || ownerId == null || !key || typeof ledger.clearAsset !== 'function') return;
    ledger.clearAsset(ownerId, key);
  }

  function getCotaSlotCount(runtimeApi, ownerId) {
    return getCotaAssetValue(runtimeApi, ownerId, COTA_SLOT_COUNT_KEY, COTA_DEFAULT_SLOT_COUNT);
  }

  function setCotaSlotCount(runtimeApi, ownerId, value, meta) {
    var asset = setCotaAsset(runtimeApi, ownerId, COTA_SLOT_COUNT_KEY, Math.max(0, Number(value || 0)), meta);
    syncCotaSeatMarks(runtimeApi, ownerId);
    return asset;
  }

  function getCotaCards(runtimeApi, ownerId) {
    var asset = getCotaAsset(runtimeApi, ownerId, COTA_CARDS_KEY);
    if (!asset || !Array.isArray(asset.cards)) return [];
    return cloneCotaCards(asset.cards);
  }

  function getCotaBaseValueKey(cardType) {
    var type = normalizeCotaCardType(cardType);
    return type ? COTA_BASE_VALUE_KEYS[type] : null;
  }

  function deriveCotaFamilyBaseValueFromCards(cards, cardType) {
    var type = normalizeCotaCardType(cardType);
    var fallback = getCotaDefaultBaseValue(type);
    if (!type || !Array.isArray(cards)) return fallback;
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      if (normalizeCotaCardType(card && card.cardType) !== type) continue;
      return Math.max(0, Number(card && card.baseValue || 0));
    }
    return fallback;
  }

  function getCotaFamilyBaseValue(runtimeApi, ownerId, cardType) {
    var type = normalizeCotaCardType(cardType);
    var key = getCotaBaseValueKey(type);
    if (!type || !key) return 0;
    var asset = getCotaAsset(runtimeApi, ownerId, key);
    if (asset) return Math.max(0, Number(asset.value || 0));
    return deriveCotaFamilyBaseValueFromCards(getCotaCards(runtimeApi, ownerId), type);
  }

  function setCotaFamilyBaseValue(runtimeApi, ownerId, cardType, value, meta) {
    var type = normalizeCotaCardType(cardType);
    var key = getCotaBaseValueKey(type);
    if (!type || !key) return null;
    return setCotaAsset(runtimeApi, ownerId, key, Math.max(0, Number(value || 0)), meta);
  }

  function primeCotaFamilyBaseValues(runtimeApi, ownerId, meta) {
    var cards = getCotaCards(runtimeApi, ownerId);
    var families = ['good', 'bad', 'misc'];
    for (var i = 0; i < families.length; i++) {
      var type = families[i];
      var key = getCotaBaseValueKey(type);
      if (getCotaAsset(runtimeApi, ownerId, key)) continue;
      setCotaFamilyBaseValue(runtimeApi, ownerId, type, deriveCotaFamilyBaseValueFromCards(cards, type), Object.assign({
        source: 'cota_prime_base_value',
        cardType: type
      }, meta || {}));
    }
  }

  function setCotaCards(runtimeApi, ownerId, cards, meta) {
    var nextCards = cloneCotaCards(cards).sort(function(a, b) {
      return Number(a.slotIndex || 0) - Number(b.slotIndex || 0);
    });
    var asset = setCotaAsset(runtimeApi, ownerId, COTA_CARDS_KEY, nextCards.length, Object.assign({
      cards: nextCards
    }, meta || {}));
    syncCotaSeatMarks(runtimeApi, ownerId);
    return asset;
  }

  function isCotaFaultState(runtimeApi, ownerId) {
    return getCotaAssetValue(runtimeApi, ownerId, COTA_FAULT_STATE_KEY, 0) > 0;
  }

  function getCotaBustRate(runtimeApi, ownerId) {
    var asset = getCotaAsset(runtimeApi, ownerId, COTA_BUST_RATE_KEY);
    return asset ? Math.max(0, Number(asset.value || 0)) : 0;
  }

  function setCotaFaultState(runtimeApi, ownerId, enabled, meta) {
    var asset = setCotaAsset(runtimeApi, ownerId, COTA_FAULT_STATE_KEY, enabled ? 1 : 0, meta);
    syncCotaSeatMarks(runtimeApi, ownerId);
    return asset;
  }

  function setCotaBustRate(runtimeApi, ownerId, value, meta) {
    var asset = setCotaAsset(runtimeApi, ownerId, COTA_BUST_RATE_KEY, Math.max(0, Number(value || 0)), meta);
    syncCotaSeatMarks(runtimeApi, ownerId);
    return asset;
  }

  function setOrClearCotaSeatMark(skillSystem, ownerId, key, enabled, payload) {
    if (!skillSystem || ownerId == null || !key) return;
    if (enabled) {
      skillSystem.setStatusMark(ownerId, key, payload || {});
      return;
    }
    if (typeof skillSystem.clearStatusMark === 'function') {
      skillSystem.clearStatusMark(ownerId, key);
    }
  }

  function syncCotaSeatMarks(runtimeApi, ownerId) {
    var skillSystem = getSkillSystem(runtimeApi);
    if (!skillSystem || ownerId == null) return;
    if (!guardConfiguredRole(runtimeApi, 'COTA', function(api) {
      var players = getGamePlayers(api);
      for (var pi = 0; pi < players.length; pi++) {
        var player = players[pi];
        if (!player) continue;
        clearStatusMarkSafe(skillSystem, player.id, 'cota_empty_slots');
        clearStatusMarkSafe(skillSystem, player.id, 'cota_good_cards');
        clearStatusMarkSafe(skillSystem, player.id, 'cota_bad_cards');
        clearStatusMarkSafe(skillSystem, player.id, 'cota_misc_cards');
        clearStatusMarkSafe(skillSystem, player.id, 'cota_fault_state');
      }
    })) return;
    var owner = getPlayerById(runtimeApi, ownerId);
    if (!owner || !isRolePlayer(owner, 'COTA')) return;
    if (!isRuntimePlayerLive(owner)) {
      clearStatusMarkSafe(skillSystem, ownerId, 'cota_empty_slots');
      clearStatusMarkSafe(skillSystem, ownerId, 'cota_good_cards');
      clearStatusMarkSafe(skillSystem, ownerId, 'cota_bad_cards');
      clearStatusMarkSafe(skillSystem, ownerId, 'cota_misc_cards');
      clearStatusMarkSafe(skillSystem, ownerId, 'cota_fault_state');
      return;
    }

    var slotCount = getCotaSlotCount(runtimeApi, ownerId);
    var cards = getCotaCards(runtimeApi, ownerId);
    var counts = { good: 0, bad: 0, misc: 0 };
    for (var i = 0; i < cards.length; i++) {
      var type = normalizeCotaCardType(cards[i] && cards[i].cardType);
      if (type && counts[type] != null) counts[type] += 1;
    }

    var totalCards = cards.length;
    var emptySlots = Math.max(0, slotCount - totalCards);
    var faultState = isCotaFaultState(runtimeApi, ownerId);
    var bustPercent = Math.round(getCotaBustRate(runtimeApi, ownerId) * 100);
    var sharedDetail = '槽位: ' + slotCount +
      '\n在场牌: ' + totalCards +
      '\n状态: ' + (faultState ? '故障态' : '标准态') +
      '\n爆牌率: ' + bustPercent + '%';

    setOrClearCotaSeatMark(skillSystem, ownerId, 'cota_empty_slots', emptySlots > 0, {
      icon: COTA_MARK_ICON,
      iconMode: 'mask',
      tone: 'cota-empty',
      count: emptySlots,
      title: '空槽位',
      detail: sharedDetail + '\n空槽位: ' + emptySlots
    });
    setOrClearCotaSeatMark(skillSystem, ownerId, 'cota_good_cards', counts.good > 0, {
      icon: COTA_MARK_ICON,
      iconMode: 'mask',
      tone: 'cota-good',
      count: counts.good,
      title: '吉牌',
      detail: sharedDetail + '\n吉牌: ' + counts.good
    });
    setOrClearCotaSeatMark(skillSystem, ownerId, 'cota_bad_cards', counts.bad > 0, {
      icon: COTA_MARK_ICON,
      iconMode: 'mask',
      tone: 'cota-bad',
      count: counts.bad,
      title: '厄牌',
      detail: sharedDetail + '\n厄牌: ' + counts.bad
    });
    setOrClearCotaSeatMark(skillSystem, ownerId, 'cota_misc_cards', counts.misc > 0, {
      icon: COTA_MARK_ICON,
      iconMode: 'mask',
      tone: 'cota-misc',
      count: counts.misc,
      title: '杂牌',
      detail: sharedDetail + '\n杂牌: ' + counts.misc
    });
    setOrClearCotaSeatMark(skillSystem, ownerId, 'cota_fault_state', faultState, {
      icon: COTA_FAULT_ICON,
      iconMode: 'mask',
      tone: 'cota-fault',
      count: 0,
      title: '故障态',
      detail: sharedDetail + '\n故障触发: 场上存在杂牌'
    });
  }

  function getCotaSelfCursePressure(runtimeApi, ownerId) {
    return getCotaAssetValue(runtimeApi, ownerId, COTA_SELF_CURSE_PRESSURE_KEY, 0);
  }

  function setCotaSelfCursePressure(runtimeApi, ownerId, value, meta) {
    return setCotaAsset(runtimeApi, ownerId, COTA_SELF_CURSE_PRESSURE_KEY, Math.max(0, Number(value || 0)), meta);
  }

  function getCotaNewCardCostDelta(runtimeApi, ownerId) {
    var asset = getCotaAsset(runtimeApi, ownerId, COTA_NEW_CARD_COST_DELTA_KEY);
    if (!asset) return 0;
    if (asset.delta != null) return Number(asset.delta || 0);
    return Number(asset.value || 0);
  }

  function setCotaNewCardCostDelta(runtimeApi, ownerId, value, meta) {
    var nextValue = Number(value || 0);
    if (nextValue === 0) {
      clearCotaAsset(runtimeApi, ownerId, COTA_NEW_CARD_COST_DELTA_KEY);
      return null;
    }
    return setCotaAsset(runtimeApi, ownerId, COTA_NEW_CARD_COST_DELTA_KEY, Math.abs(nextValue), Object.assign({
      delta: nextValue
    }, meta || {}));
  }

  function getCotaFirstBustBonusState(runtimeApi, ownerId) {
    var asset = getCotaAsset(runtimeApi, ownerId, COTA_FIRST_BUST_BONUS_KEY);
    if (!asset) return { armed: false, used: false };
    return {
      armed: asset.armed === true,
      used: Math.max(0, Number(asset.value || 0)) > 0
    };
  }

  function setCotaFirstBustBonusState(runtimeApi, ownerId, armed, used, meta) {
    if (!armed && !used) {
      clearCotaAsset(runtimeApi, ownerId, COTA_FIRST_BUST_BONUS_KEY);
      return null;
    }
    return setCotaAsset(runtimeApi, ownerId, COTA_FIRST_BUST_BONUS_KEY, used ? 1 : 0, Object.assign({
      armed: armed === true
    }, meta || {}));
  }

  function getCotaFaultEffect(runtimeApi, ownerId) {
    var effect = getTraitEffect(runtimeApi, ownerId, 'cota_dealer_hands_fault') || {};
    return {
      baseBustRate: Math.max(0, Number(effect.baseBustRate != null ? effect.baseBustRate : 0.1)),
      bustRatePerAction: Math.max(0, Number(effect.bustRatePerAction != null ? effect.bustRatePerAction : 0.1)),
      bustRefundMana: Math.max(0, Number(effect.bustRefundMana != null ? effect.bustRefundMana : 3)),
      miscBustMultiplier: Math.max(0, Number(effect.miscBustMultiplier != null ? effect.miscBustMultiplier : 1)),
      firstBustFortune: Math.max(0, Number(effect.firstBustFortune != null ? effect.firstBustFortune : 15))
    };
  }

  function getCotaContractTemplate(runtimeApi, ownerId) {
    var effect = getTraitEffect(runtimeApi, ownerId, 'cota_contract_template') || {};
    return {
      gatherBaseBonus: Math.max(0, Number(effect.gatherBaseBonus != null ? effect.gatherBaseBonus : 1)),
      spreadBaseBonus: Math.max(0, Number(effect.spreadBaseBonus != null ? effect.spreadBaseBonus : 1)),
      spreadNewCardCostDelta: Number(effect.spreadNewCardCostDelta != null ? effect.spreadNewCardCostDelta : 0),
      pairBonusRate: Math.max(0, Number(effect.pairBonusRate != null ? effect.pairBonusRate : 0.15))
    };
  }

  function getCotaFamilyCounts(cards) {
    var counts = { good: 0, bad: 0, misc: 0 };
    for (var i = 0; i < cards.length; i++) {
      var type = normalizeCotaCardType(cards[i] && cards[i].cardType);
      if (type && counts[type] != null) counts[type] += 1;
    }
    return counts;
  }

  function getCotaCardPower(runtimeApi, ownerId, card, familyCounts, options) {
    options = options || {};
    var type = normalizeCotaCardType(card && card.cardType);
    var power = Math.max(0, Number(card && card.baseValue || 0));
    var counts = familyCounts || getCotaFamilyCounts(card ? [card] : []);
    var pairBonusRate = Math.max(0, Number(options.pairBonusRate != null ? options.pairBonusRate : getCotaContractTemplate(runtimeApi, ownerId).pairBonusRate));
    if (type && counts[type] >= 2 && pairBonusRate > 0) {
      power = Math.ceil(power * (1 + pairBonusRate));
    }
    if (options.multiplier != null) {
      power = Math.ceil(power * Math.max(0, Number(options.multiplier || 0)));
    }
    return Math.max(0, power);
  }

  function findFirstEmptyCotaSlot(cards, slotCount) {
    var occupied = Object.create(null);
    for (var i = 0; i < cards.length; i++) {
      occupied[String(Math.max(0, Number(cards[i] && cards[i].slotIndex || 0)))] = true;
    }
    for (var index = 0; index < slotCount; index++) {
      if (!occupied[String(index)]) return index;
    }
    return null;
  }

  function buildCotaCard(runtimeApi, ownerId, cardType, slotIndex, phase) {
    var type = normalizeCotaCardType(cardType);
    var defaults = type ? COTA_CARD_DEFAULTS[type] : null;
    if (!type || !defaults) return null;
    cotaCardSerial += 1;
    return {
      id: 'cota_card_' + cotaCardSerial,
      ownerId: ownerId,
      slotIndex: slotIndex,
      cardType: type,
      baseValue: getCotaFamilyBaseValue(runtimeApi, ownerId, type),
      settleManaCost: Math.max(0, Number(defaults.settleManaCost || 0) + getCotaNewCardCostDelta(runtimeApi, ownerId)),
      createdPhase: phase || resolveRuntimePhase(runtimeApi, null),
      createdBySkill: 'deal_card'
    };
  }

  function mapAllCotaCards(cards, valueDelta, miscValueDelta, costDelta, extraValueDelta) {
    return cloneCotaCards(cards).map(function(card) {
      var next = Object.assign({}, card);
      var type = normalizeCotaCardType(next.cardType);
      var appliedValueDelta = type === 'misc' ? Number(miscValueDelta || 0) : Number(valueDelta || 0);
      if (type !== 'misc' && extraValueDelta) {
        appliedValueDelta += Number(extraValueDelta || 0);
      }
      next.baseValue = Math.max(0, Number(next.baseValue || 0) + appliedValueDelta);
      next.settleManaCost = Math.max(0, Number(next.settleManaCost || 0) + Number(costDelta || 0));
      return next;
    });
  }

  function ensureCotaFaultState(runtimeApi, ownerId, sourceKey, phase) {
    var effect = getCotaFaultEffect(runtimeApi, ownerId);
    var wasFault = isCotaFaultState(runtimeApi, ownerId);
    setCotaFaultState(runtimeApi, ownerId, true, {
      source: sourceKey,
      phase: phase
    });
    var currentRate = getCotaBustRate(runtimeApi, ownerId);
    if (currentRate < effect.baseBustRate) {
      setCotaBustRate(runtimeApi, ownerId, effect.baseBustRate, {
        source: sourceKey,
        phase: phase
      });
    }
    if (!wasFault) {
      setCotaFirstBustBonusState(runtimeApi, ownerId, true, false, {
        source: sourceKey,
        phase: phase
      });
    }
  }

  function clearCotaFaultState(runtimeApi, ownerId, sourceKey, phase) {
    setCotaFaultState(runtimeApi, ownerId, false, {
      source: sourceKey,
      phase: phase
    });
    setCotaBustRate(runtimeApi, ownerId, 0, {
      source: sourceKey,
      phase: phase
    });
    clearCotaAsset(runtimeApi, ownerId, COTA_FIRST_BUST_BONUS_KEY);
  }

  function applyCotaFaultActionBump(runtimeApi, ownerId, sourceKey, phase) {
    if (!isCotaFaultState(runtimeApi, ownerId)) return;
    var effect = getCotaFaultEffect(runtimeApi, ownerId);
    setCotaBustRate(runtimeApi, ownerId, getCotaBustRate(runtimeApi, ownerId) + effect.bustRatePerAction, {
      source: sourceKey,
      phase: phase
    });
  }

  function chooseRandomCotaOpponent(runtimeApi, ownerId) {
    var opponents = getActiveOpponents(runtimeApi, ownerId);
    if (!opponents.length) return null;
    return opponents[Math.floor(Math.random() * opponents.length)] || null;
  }

  function syncCotaFaultStateFromCards(runtimeApi, ownerId, sourceKey, phase) {
    var cards = getCotaCards(runtimeApi, ownerId);
    var counts = getCotaFamilyCounts(cards);
    if (counts.misc >= 1) {
      ensureCotaFaultState(runtimeApi, ownerId, sourceKey || 'cota_misc_fault', phase);
      return true;
    }
    clearCotaFaultState(runtimeApi, ownerId, sourceKey || 'cota_misc_clear', phase);
    return false;
  }

  function resolveCotaMiscMana(runtimeApi, ownerId, power, sourceKey, extraMeta) {
    var pool = getPlayerManaPool(runtimeApi, ownerId);
    if (!pool) return 0;
    var cardPower = Math.max(0, Number(power || 0));
    var gainRate = Math.max(0, Math.min(1, COTA_MISC_BASE_GAIN_RATE + (cardPower * COTA_MISC_RATE_PER_POWER)));
    var lossRate = Math.max(0, Math.min(1, 1 - gainRate));
    var gainRoll = Math.random() < gainRate;
    var amount = Math.max(1, Math.ceil(cardPower * COTA_MISC_MANA_MULTIPLIER));
    var signedAmount = gainRoll ? amount : -amount;
    setManaCurrent(runtimeApi, ownerId, pool.current + signedAmount, sourceKey);
    var skillSystem = getSkillSystem(runtimeApi);
    if (skillSystem && typeof skillSystem.emit === 'function') {
      skillSystem.emit('cota:misc_mana', Object.assign({
        ownerId: ownerId,
        delta: signedAmount,
        power: cardPower,
        source: sourceKey,
        gainRate: gainRate,
        lossRate: lossRate
      }, extraMeta || {}));
    }
    return signedAmount;
  }

  function resolveCotaCardEffect(runtimeApi, ownerId, card, phase, familyCounts, options) {
    options = options || {};
    var type = normalizeCotaCardType(card && card.cardType);
    var owner = getPlayerById(runtimeApi, ownerId);
    if (!type || !owner) return options.state || { selfCursePressure: getCotaSelfCursePressure(runtimeApi, ownerId) };

    var state = options.state || {
      selfCursePressure: getCotaSelfCursePressure(runtimeApi, ownerId)
    };
    var power = getCotaCardPower(runtimeApi, ownerId, card, familyCounts, {
      pairBonusRate: options.pairBonusRate,
      multiplier: options.multiplier
    });
    if (power <= 0) return state;

    if (type === 'good') {
      queueKuzuhaFortune(runtimeApi, ownerId, power, options.sourceKey || 'cota_good_card', {
        phase: phase,
        cardId: card.id,
        cardType: type
      });
    } else if (type === 'bad') {
      var badEffectPower = Math.max(0, Math.ceil(power * 1.5));
      if (state.selfCursePressure > 0) {
        state.selfCursePressure = Math.max(0, state.selfCursePressure - badEffectPower);
        queueKuzuhaFortune(runtimeApi, ownerId, badEffectPower, options.sourceKey || 'cota_bad_guard', {
          phase: phase,
          cardId: card.id,
          cardType: type,
          guardMode: true
        });
      } else {
        var target = chooseRandomCotaOpponent(runtimeApi, ownerId);
        if (target) {
          queueKuzuhaCurse(runtimeApi, ownerId, target.id, badEffectPower, options.sourceKey || 'cota_bad_card', {
            phase: phase,
            cardId: card.id,
            cardType: type
          });
        }
      }
    } else if (type === 'misc') {
      resolveCotaMiscMana(runtimeApi, ownerId, power, options.sourceKey || 'cota_misc_card', {
        phase: phase,
        cardId: card.id,
        cardType: type
      });
    }

    var skillSystem = getSkillSystem(runtimeApi);
    if (skillSystem && typeof skillSystem.emit === 'function') {
      skillSystem.emit('cota:card_resolved', {
        ownerId: ownerId,
        ownerName: owner.name,
        phase: phase,
        card: Object.assign({}, card),
        cardType: type,
        power: type === 'bad' ? Math.max(0, Math.ceil(power * 1.5)) : power,
        source: options.sourceKey || 'cota_card'
      });
    }
    return state;
  }

  function consumeCotaFirstBustBonus(runtimeApi, ownerId, phase, state, sourceKey) {
    var bonusState = getCotaFirstBustBonusState(runtimeApi, ownerId);
    if (!bonusState.armed || bonusState.used) return;
    var effect = getCotaFaultEffect(runtimeApi, ownerId);
    if (effect.firstBustFortune > 0) {
      queueKuzuhaFortune(runtimeApi, ownerId, effect.firstBustFortune, sourceKey || 'cota_first_bust_bonus', {
        phase: phase,
        burstBonus: true
      });
    }
    setCotaFirstBustBonusState(runtimeApi, ownerId, false, true, {
      source: sourceKey || 'cota_first_bust_bonus',
      phase: phase
    });
    if (state) state.firstBustConsumed = true;
  }

  function resolveCotaBurst(runtimeApi, ownerId, cards, meta) {
    meta = meta || {};
    var phase = meta.phase || resolveRuntimePhase(runtimeApi, null);
    var owner = getPlayerById(runtimeApi, ownerId);
    var burstCards = cloneCotaCards(cards);
    if (!owner || !burstCards.length) {
      return meta.state || { selfCursePressure: getCotaSelfCursePressure(runtimeApi, ownerId) };
    }

    var state = meta.state || {
      selfCursePressure: getCotaSelfCursePressure(runtimeApi, ownerId)
    };
    var familyCounts = meta.familyCounts || getCotaFamilyCounts(meta.currentCards || burstCards);
    var faultEffect = getCotaFaultEffect(runtimeApi, ownerId);

    for (var i = 0; i < burstCards.length; i++) {
      var card = burstCards[i];
      var type = normalizeCotaCardType(card && card.cardType);
      if (!type) continue;
      if (type === 'misc') {
        var pool = getPlayerManaPool(runtimeApi, ownerId);
        var miscRefundMana = Math.max(0, Math.ceil(getCotaCardPower(runtimeApi, ownerId, card, familyCounts) * faultEffect.miscBustMultiplier));
        if (pool && miscRefundMana > 0) {
          setManaCurrent(runtimeApi, ownerId, pool.current + miscRefundMana, 'cota_burst_misc');
        }
        var skillSystem = getSkillSystem(runtimeApi);
        if (skillSystem && typeof skillSystem.emit === 'function') {
          skillSystem.emit('cota:card_resolved', {
            ownerId: ownerId,
            ownerName: owner.name,
            phase: phase,
            card: Object.assign({}, card),
            cardType: type,
            power: miscRefundMana,
            source: 'cota_burst_misc'
          });
        }
        continue;
      }
      state = resolveCotaCardEffect(runtimeApi, ownerId, card, phase, familyCounts, {
        multiplier: 3,
        sourceKey: type === 'good' ? 'cota_burst_good' : 'cota_burst_bad',
        state: state
      });
    }

    var flatBurstRefund = Math.max(0, Number(faultEffect.bustRefundMana || 0)) * burstCards.length;
    if (flatBurstRefund > 0) {
      var manaPool = getPlayerManaPool(runtimeApi, ownerId);
      if (manaPool) {
        setManaCurrent(runtimeApi, ownerId, manaPool.current + flatBurstRefund, 'cota_burst_refund');
      }
    }
    consumeCotaFirstBustBonus(runtimeApi, ownerId, phase, state, 'cota_first_bust_bonus');
    setCotaSelfCursePressure(runtimeApi, ownerId, state.selfCursePressure, {
      source: meta.reason || 'cota_burst',
      phase: phase
    });

    var eventSystem = getSkillSystem(runtimeApi);
    if (eventSystem && typeof eventSystem.emit === 'function') {
      eventSystem.emit('cota:bust', {
        ownerId: ownerId,
        ownerName: owner.name,
        phase: phase,
        reason: meta.reason || 'cota_burst',
        cardCount: burstCards.length,
        flatManaRecovered: flatBurstRefund
      });
    }
    return state;
  }

  function pickCotaOverflowCards(cards, overflowCount, preferredFamily) {
    var preferredType = normalizeCotaCardType(preferredFamily);
    var ranked = cloneCotaCards(cards).sort(function(a, b) {
      var aPreferred = normalizeCotaCardType(a && a.cardType) === preferredType ? 1 : 0;
      var bPreferred = normalizeCotaCardType(b && b.cardType) === preferredType ? 1 : 0;
      if (aPreferred !== bPreferred) return bPreferred - aPreferred;
      return Number(b && b.slotIndex || 0) - Number(a && a.slotIndex || 0);
    });
    return ranked.slice(0, Math.max(0, overflowCount));
  }

  function clearCotaTransientStreetState(runtimeApi, ownerId) {
    clearCotaAsset(runtimeApi, ownerId, COTA_SELF_CURSE_PRESSURE_KEY);
  }

  function clearCotaBurstState(runtimeApi, ownerId) {
    setCotaCards(runtimeApi, ownerId, [], {
      source: 'cota_burst_reset'
    });
    setCotaFaultState(runtimeApi, ownerId, false, {
      source: 'cota_burst_reset'
    });
    setCotaBustRate(runtimeApi, ownerId, 0, {
      source: 'cota_burst_reset'
    });
    clearCotaAsset(runtimeApi, ownerId, COTA_FIRST_BUST_BONUS_KEY);
    clearCotaAsset(runtimeApi, ownerId, COTA_SELF_CURSE_PRESSURE_KEY);
  }

  function resetAllCotaPersistentState(runtimeApi, ownerId, meta) {
    setCotaSlotCount(runtimeApi, ownerId, COTA_DEFAULT_SLOT_COUNT, Object.assign({
      source: 'cota_full_reset'
    }, meta || {}));
    setCotaCards(runtimeApi, ownerId, [], Object.assign({
      source: 'cota_full_reset'
    }, meta || {}));
    setCotaFamilyBaseValue(runtimeApi, ownerId, 'good', getCotaDefaultBaseValue('good'), Object.assign({
      source: 'cota_full_reset',
      cardType: 'good'
    }, meta || {}));
    setCotaFamilyBaseValue(runtimeApi, ownerId, 'bad', getCotaDefaultBaseValue('bad'), Object.assign({
      source: 'cota_full_reset',
      cardType: 'bad'
    }, meta || {}));
    setCotaFamilyBaseValue(runtimeApi, ownerId, 'misc', getCotaDefaultBaseValue('misc'), Object.assign({
      source: 'cota_full_reset',
      cardType: 'misc'
    }, meta || {}));
    setCotaFaultState(runtimeApi, ownerId, false, meta || {});
    setCotaBustRate(runtimeApi, ownerId, 0, meta || {});
    clearCotaAsset(runtimeApi, ownerId, COTA_SELF_CURSE_PRESSURE_KEY);
    clearCotaAsset(runtimeApi, ownerId, COTA_NEW_CARD_COST_DELTA_KEY);
    clearCotaAsset(runtimeApi, ownerId, COTA_FIRST_BUST_BONUS_KEY);
  }

  function primeCotaPersistentState(runtimeApi, ownerId, meta) {
    var owner = getPlayerById(runtimeApi, ownerId);
    if (!owner || !isRolePlayer(owner, 'COTA')) return;
    var slotAsset = getCotaAsset(runtimeApi, ownerId, COTA_SLOT_COUNT_KEY);
    if (!slotAsset) {
      setCotaSlotCount(runtimeApi, ownerId, COTA_DEFAULT_SLOT_COUNT, Object.assign({
        source: 'cota_prime'
      }, meta || {}));
    }
    var cardsAsset = getCotaAsset(runtimeApi, ownerId, COTA_CARDS_KEY);
    if (!cardsAsset) {
      setCotaCards(runtimeApi, ownerId, [], Object.assign({
        source: 'cota_prime'
      }, meta || {}));
    }
    primeCotaFamilyBaseValues(runtimeApi, ownerId, meta);
    if (!getCotaAsset(runtimeApi, ownerId, COTA_FAULT_STATE_KEY)) {
      setCotaFaultState(runtimeApi, ownerId, false, Object.assign({
        source: 'cota_prime'
      }, meta || {}));
    }
    if (!getCotaAsset(runtimeApi, ownerId, COTA_BUST_RATE_KEY)) {
      setCotaBustRate(runtimeApi, ownerId, 0, Object.assign({
        source: 'cota_prime'
      }, meta || {}));
    }
    clearCotaTransientStreetState(runtimeApi, ownerId);
    syncCotaFaultStateFromCards(runtimeApi, ownerId, 'cota_prime_sync', meta && meta.phase);
  }

  function handleCotaDealCard(payload, runtimeApi) {
    var skill = payload && payload.skill;
    var ownerId = skill && skill.ownerId;
    var phase = resolveRuntimePhase(runtimeApi, payload);
    if (ownerId == null) return;
    var owner = getPlayerById(runtimeApi, ownerId);
    if (!owner || !isRolePlayer(owner, 'COTA')) return;

    var options = payload && payload.options ? payload.options : {};
    var type = normalizeCotaCardType(payload && payload.cardType || options.cardType);
    if (!type) return;

    var slotCount = getCotaSlotCount(runtimeApi, ownerId);
    var cards = getCotaCards(runtimeApi, ownerId);
    var slotIndex = payload && payload.slotIndex != null ? Number(payload.slotIndex) : null;
    if (!Number.isFinite(slotIndex) || slotIndex < 0 || slotIndex >= slotCount) {
      slotIndex = findFirstEmptyCotaSlot(cards, slotCount);
    }
    if (slotIndex == null) return;
    if (cards.some(function(card) { return Number(card.slotIndex) === slotIndex; })) return;

    var card = buildCotaCard(runtimeApi, ownerId, type, slotIndex, phase);
    if (!card) return;
    cards.push(card);
    setCotaCards(runtimeApi, ownerId, cards, {
      source: 'deal_card',
      phase: phase
    });
    var wasFault = isCotaFaultState(runtimeApi, ownerId);
    var isFault = syncCotaFaultStateFromCards(runtimeApi, ownerId, 'deal_card', phase);
    if (wasFault && isFault) {
      applyCotaFaultActionBump(runtimeApi, ownerId, 'deal_card', phase);
    }
  }

  function handleCotaGatherOrSpread(payload, runtimeApi) {
    var skill = payload && payload.skill;
    var ownerId = skill && skill.ownerId;
    var phase = resolveRuntimePhase(runtimeApi, payload);
    if (ownerId == null) return;
    var owner = getPlayerById(runtimeApi, ownerId);
    if (!owner || !isRolePlayer(owner, 'COTA')) return;

    var options = payload && payload.options ? payload.options : {};
    var mode = String(payload && payload.mode || options.mode || '').toLowerCase();
    if (mode !== 'gather' && mode !== 'spread') return;

    var cards = getCotaCards(runtimeApi, ownerId);
    var nextSlotCount = getCotaSlotCount(runtimeApi, ownerId);
    var contractTemplate = getCotaContractTemplate(runtimeApi, ownerId);

    if (mode === 'gather') {
      nextSlotCount = Math.max(0, nextSlotCount - 1);
      setCotaFamilyBaseValue(runtimeApi, ownerId, 'good', getCotaFamilyBaseValue(runtimeApi, ownerId, 'good') + COTA_GATHER_VALUE_DELTA + contractTemplate.gatherBaseBonus, {
        source: 'gather_or_spread',
        mode: mode,
        phase: phase,
        cardType: 'good'
      });
      setCotaFamilyBaseValue(runtimeApi, ownerId, 'bad', getCotaFamilyBaseValue(runtimeApi, ownerId, 'bad') + COTA_GATHER_VALUE_DELTA + contractTemplate.gatherBaseBonus, {
        source: 'gather_or_spread',
        mode: mode,
        phase: phase,
        cardType: 'bad'
      });
      setCotaFamilyBaseValue(runtimeApi, ownerId, 'misc', getCotaFamilyBaseValue(runtimeApi, ownerId, 'misc') + COTA_MISC_GATHER_VALUE_DELTA, {
        source: 'gather_or_spread',
        mode: mode,
        phase: phase,
        cardType: 'misc'
      });
      cards = mapAllCotaCards(
        cards,
        COTA_GATHER_VALUE_DELTA,
        COTA_MISC_GATHER_VALUE_DELTA,
        COTA_GATHER_COST_DELTA,
        contractTemplate.gatherBaseBonus
      );
      setCotaSlotCount(runtimeApi, ownerId, nextSlotCount, {
        source: 'gather_or_spread',
        mode: mode,
        phase: phase
      });
      setCotaCards(runtimeApi, ownerId, cards, {
        source: 'gather_or_spread',
        mode: mode,
        phase: phase
      });
      var overflowCount = Math.max(0, cards.length - nextSlotCount);
      if (overflowCount > 0) {
        var overflowCards = pickCotaOverflowCards(cards, overflowCount);
        var overflowIds = Object.create(null);
        for (var oi = 0; oi < overflowCards.length; oi++) {
          overflowIds[String(overflowCards[oi].id)] = true;
        }
        resolveCotaBurst(runtimeApi, ownerId, overflowCards, {
          phase: phase,
          reason: 'cota_gather_overflow',
          currentCards: cards
        });
        cards = cards.filter(function(card) {
          return !overflowIds[String(card.id)];
        });
        setCotaCards(runtimeApi, ownerId, cards, {
          source: 'gather_or_spread_overflow',
          mode: mode,
          phase: phase
        });
      }
    } else {
      nextSlotCount += 1;
      setCotaFamilyBaseValue(runtimeApi, ownerId, 'good', getCotaFamilyBaseValue(runtimeApi, ownerId, 'good') + COTA_SPREAD_VALUE_DELTA + contractTemplate.spreadBaseBonus, {
        source: 'gather_or_spread',
        mode: mode,
        phase: phase,
        cardType: 'good'
      });
      setCotaFamilyBaseValue(runtimeApi, ownerId, 'bad', getCotaFamilyBaseValue(runtimeApi, ownerId, 'bad') + COTA_SPREAD_VALUE_DELTA + contractTemplate.spreadBaseBonus, {
        source: 'gather_or_spread',
        mode: mode,
        phase: phase,
        cardType: 'bad'
      });
      setCotaFamilyBaseValue(runtimeApi, ownerId, 'misc', getCotaFamilyBaseValue(runtimeApi, ownerId, 'misc') + COTA_MISC_SPREAD_VALUE_DELTA, {
        source: 'gather_or_spread',
        mode: mode,
        phase: phase,
        cardType: 'misc'
      });
      cards = mapAllCotaCards(cards, COTA_SPREAD_VALUE_DELTA, COTA_MISC_SPREAD_VALUE_DELTA, COTA_SPREAD_COST_DELTA, contractTemplate.spreadBaseBonus);
      setCotaSlotCount(runtimeApi, ownerId, nextSlotCount, {
        source: 'gather_or_spread',
        mode: mode,
        phase: phase
      });
      setCotaCards(runtimeApi, ownerId, cards, {
        source: 'gather_or_spread',
        mode: mode,
        phase: phase
      });
      if (contractTemplate.spreadNewCardCostDelta !== 0) {
        setCotaNewCardCostDelta(runtimeApi, ownerId, getCotaNewCardCostDelta(runtimeApi, ownerId) + contractTemplate.spreadNewCardCostDelta, {
          source: 'gather_or_spread',
          mode: mode,
          phase: phase
        });
      }
    }

    var wasFault = isCotaFaultState(runtimeApi, ownerId);
    var isFault = syncCotaFaultStateFromCards(runtimeApi, ownerId, 'gather_or_spread', phase);
    if (wasFault && isFault) {
      applyCotaFaultActionBump(runtimeApi, ownerId, 'gather_or_spread', phase);
    }
  }

  function handleCotaRealityFaultLink(payload, runtimeApi) {
    var skill = payload && payload.skill;
    if (!skill || skill.ownerId == null || skill.id !== 'reality') return;
    var owner = getPlayerById(runtimeApi, skill.ownerId);
    if (!owner || (owner.role !== 'KAZU' && owner.subRole !== 'KAZU')) return;
    var players = getCotaPlayers(runtimeApi);
    var phase = resolveRuntimePhase(runtimeApi, payload);
    for (var i = 0; i < players.length; i++) {
      var player = players[i];
      if (!player || player.isActive === false || player.folded) continue;
      ensureCotaFaultState(runtimeApi, player.id, 'cota_reality_fault', phase);
    }
  }

  function handleCotaSkillActivationEvent(payload, runtimeApi) {
    if (!payload || !payload.skill || payload.skill.ownerId == null) return;
    handleCotaRealityFaultLink(payload, runtimeApi);
    var effect = payload.type || payload.skill.effect;
    if (effect !== 'deal_card' && effect !== 'gather_or_spread') return;
    if (payload.__cotaRuntimeHandled) return;
    payload.__cotaRuntimeHandled = true;
    if (effect === 'deal_card') {
      handleCotaDealCard(payload, runtimeApi);
      return;
    }
    if (effect === 'gather_or_spread') {
      handleCotaGatherOrSpread(payload, runtimeApi);
    }
  }

  function captureCotaStreetCursePressure(payload, runtimeApi) {
    var snapshot = payload && Array.isArray(payload.snapshot) ? payload.snapshot : [];
    var players = getCotaPlayers(runtimeApi);
    for (var i = 0; i < players.length; i++) {
      var owner = players[i];
      var totalCurse = 0;
      for (var si = 0; si < snapshot.length; si++) {
        var force = snapshot[si];
        if (!force || force.type !== 'curse') continue;
        if (force.ownerId === owner.id) continue;
        if (force.targetId !== owner.id) continue;
        totalCurse += Math.max(0, Number(force.effectivePower != null ? force.effectivePower : force.power || 0));
      }
      setCotaSelfCursePressure(runtimeApi, owner.id, totalCurse, {
        source: 'forces:resolved',
        phase: payload && payload.phase != null ? payload.phase : null
      });
    }
  }

  function shouldCotaBurstAtRoundStart(runtimeApi, ownerId, cards) {
    if (!isCotaFaultState(runtimeApi, ownerId)) return false;
    if (!cards || !cards.length) return false;
    var rate = getCotaBustRate(runtimeApi, ownerId);
    if (rate <= 0) return false;
    if (rate >= 1) return true;
    return Math.random() < rate;
  }

  function settleCotaRound(runtimeApi, ownerId, phase, reason) {
    var owner = getPlayerById(runtimeApi, ownerId);
    if (!owner || !isRolePlayer(owner, 'COTA')) return;

    var cards = getCotaCards(runtimeApi, ownerId);
    if (!cards.length) {
      clearCotaTransientStreetState(runtimeApi, ownerId);
      return;
    }
    if (owner.isActive === false || owner.folded) {
      return;
    }

    var state = {
      selfCursePressure: getCotaSelfCursePressure(runtimeApi, ownerId)
    };
    var familyCounts = getCotaFamilyCounts(cards);

    if (shouldCotaBurstAtRoundStart(runtimeApi, ownerId, cards)) {
      resolveCotaBurst(runtimeApi, ownerId, cards, {
        phase: phase,
        reason: reason || 'cota_round_start_bust',
        currentCards: cards,
        familyCounts: familyCounts,
        state: state
      });
      clearCotaBurstState(runtimeApi, ownerId);
      return;
    }

    var orderedCards = cloneCotaCards(cards).sort(function(a, b) {
      return Number(a.slotIndex || 0) - Number(b.slotIndex || 0);
    });

    for (var i = 0; i < orderedCards.length; i++) {
      var card = orderedCards[i];
      var pool = getPlayerManaPool(runtimeApi, ownerId);
      var currentMana = pool ? Math.max(0, Number(pool.current || 0)) : 0;
      var settleManaCost = Math.max(0, Number(card.settleManaCost || 0));
      if (settleManaCost > currentMana) {
        resolveCotaBurst(runtimeApi, ownerId, orderedCards.slice(i), {
          phase: phase,
          reason: reason || 'cota_mana_shortage',
          currentCards: orderedCards.slice(i),
          familyCounts: familyCounts,
          state: state
        });
        clearCotaBurstState(runtimeApi, ownerId);
        return;
      }
      if (settleManaCost > 0) {
        setManaCurrent(runtimeApi, ownerId, currentMana - settleManaCost, 'cota_settle_cost');
      }
      state = resolveCotaCardEffect(runtimeApi, ownerId, card, phase, familyCounts, {
        sourceKey: 'cota_normal_settle',
        state: state
      });
    }
    setCotaSelfCursePressure(runtimeApi, ownerId, 0, {
      source: reason || 'cota_round_settled',
      phase: phase
    });
  }

  function processCotaStreetStart(runtimeApi, payload, phaseOverride, reason) {
    var phase = phaseOverride || resolveRuntimePhase(runtimeApi, payload);
    var players = getCotaPlayers(runtimeApi);
    for (var i = 0; i < players.length; i++) {
      settleCotaRound(runtimeApi, players[i].id, phase, reason || 'cota_street_start');
    }
  }

  function getKakoPlayers(runtimeApi) {
    return getRolePlayers(runtimeApi, 'KAKO');
  }

  function emitKakoEvent(runtimeApi, eventName, payload) {
    var skillSystem = getSkillSystem(runtimeApi);
    if (!skillSystem || typeof skillSystem.emit !== 'function') return;
    var eventPayload = Object.assign({
      phase: resolveRuntimePhase(runtimeApi, payload || {})
    }, payload || {});
    if (typeof skillSystem._log === 'function') {
      var logName = String(eventName || 'kako:event')
        .replace(/^kako:/, 'KAKO_')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .toUpperCase();
      skillSystem._log(logName, eventPayload);
    }
    skillSystem.emit(eventName, eventPayload);
  }

  function getKakoAsset(runtimeApi, ownerId, key) {
    var ledger = getLedger(runtimeApi);
    if (!ledger || ownerId == null || !key) return null;
    return ledger.getAsset(ownerId, key);
  }

  function getKakoAssetValue(runtimeApi, ownerId, key) {
    var asset = getKakoAsset(runtimeApi, ownerId, key);
    return asset ? Math.max(0, Number(asset.value || 0)) : 0;
  }

  function setKakoAsset(runtimeApi, ownerId, key, value, meta) {
    var ledger = getLedger(runtimeApi);
    if (!ledger || ownerId == null || !key) return null;
    return ledger.setAsset(ownerId, key, value, Object.assign({
      syncedAt: Date.now()
    }, meta || {}));
  }

  function clearKakoAsset(runtimeApi, ownerId, key) {
    var ledger = getLedger(runtimeApi);
    if (!ledger || ownerId == null || !key) return;
    ledger.clearAsset(ownerId, key);
  }

  function getKakoContracts(runtimeApi, ownerId) {
    var asset = getKakoAsset(runtimeApi, ownerId, KAKO_RULING_CONTRACT_KEY);
    return asset && Array.isArray(asset.contracts) ? asset.contracts.slice() : [];
  }

  function setKakoContracts(runtimeApi, ownerId, contracts, meta) {
    var next = Array.isArray(contracts) ? contracts.filter(Boolean) : [];
    if (!next.length) {
      clearKakoAsset(runtimeApi, ownerId, KAKO_RULING_CONTRACT_KEY);
      return null;
    }
    return setKakoAsset(runtimeApi, ownerId, KAKO_RULING_CONTRACT_KEY, next.length, Object.assign({
      contracts: next
    }, meta || {}));
  }

  function createKakoContractId(prefix) {
    return String(prefix || 'kako_contract') + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  }

  function getKakoForceRecipientId(force) {
    if (!force) return null;
    if (force.type === 'curse') return force.targetId != null ? force.targetId : null;
    if (force.type === 'fortune') {
      if (force.targetId != null) return force.targetId;
      if (force.protectId != null) return force.protectId;
      return force.ownerId != null ? force.ownerId : null;
    }
    return null;
  }

  function isKakoTrackedForcePayload(payload) {
    var force = payload && payload.force;
    return !!(force && (force.type === 'fortune' || force.type === 'curse'));
  }

  function getKakoStatState(runtimeApi, ownerId, key) {
    var asset = getKakoAsset(runtimeApi, ownerId, key);
    return {
      value: asset ? Math.max(0, Number(asset.value || 0)) : 0,
      forceMap: asset && asset.forceMap ? Object.assign({}, asset.forceMap) : {},
      forceIds: asset && Array.isArray(asset.forceIds) ? asset.forceIds.slice() : []
    };
  }

  function createKakoEulaliaBurdenTrackId(ownerId) {
    return KAKO_EULALIA_BURDEN_TRACK_PREFIX + String(ownerId);
  }

  function parseKakoEulaliaBurdenTrackId(trackId) {
    var raw = String(trackId || '');
    if (raw.indexOf(KAKO_EULALIA_BURDEN_TRACK_PREFIX) !== 0) return null;
    var ownerId = Number(raw.slice(KAKO_EULALIA_BURDEN_TRACK_PREFIX.length));
    return Number.isFinite(ownerId) ? ownerId : null;
  }

  function getKakoEulaliaBurdenState(runtimeApi, ownerId, phase) {
    var streetBurden = getEulaliaAssetValue(runtimeApi, ownerId, EULALIA_STREET_BURDEN_KEY);
    var phaseActive = isEulaliaPhaseActive(runtimeApi, ownerId, EULALIA_ABSORB_ACTIVE_KEY, phase) ||
      isEulaliaPhaseActive(runtimeApi, ownerId, EULALIA_BURST_PENDING_KEY, phase);
    if (streetBurden <= 0 && !phaseActive) {
      streetBurden = getEulaliaProjectedBurden(runtimeApi, ownerId);
    }
    if (streetBurden <= 0) {
      return {
        value: 0,
        forceMap: {},
        forceIds: []
      };
    }
    var syntheticId = createKakoEulaliaBurdenTrackId(ownerId);
    return {
      value: streetBurden,
      forceMap: {
        [syntheticId]: {
          power: streetBurden,
          ownerId: ownerId,
          targetId: ownerId,
          source: 'eulalia_nominal_burden',
          skillKey: 'absolution',
          type: 'curse'
        }
      },
      forceIds: [syntheticId]
    };
  }

  function getKakoCurseJudgeState(runtimeApi, target) {
    if (target && isRolePlayer(target, 'EULALIA')) {
      var eulaliaState = getKakoEulaliaBurdenState(runtimeApi, target.id, resolveRuntimePhase(runtimeApi, null));
      if (eulaliaState.value > 0) return eulaliaState;
    }
    return getKakoStatState(runtimeApi, target && target.id, KAKO_STREET_CURSE_KEY);
  }

  function setKakoStatState(runtimeApi, ownerId, key, state, meta) {
    state = state || {};
    var value = Math.max(0, Number(state.value || 0));
    if (value <= 0 && (!state.forceIds || !state.forceIds.length)) {
      clearKakoAsset(runtimeApi, ownerId, key);
      return null;
    }
    return setKakoAsset(runtimeApi, ownerId, key, value, Object.assign({
      forceMap: state.forceMap || {},
      forceIds: state.forceIds || []
    }, meta || {}));
  }

  function addKakoForceStat(runtimeApi, ownerId, key, force, power) {
    if (ownerId == null || !key || !force || !force._runtimeId) return;
    var state = getKakoStatState(runtimeApi, ownerId, key);
    var forceId = String(force._runtimeId);
    var nextPower = Math.max(0, Number(power != null ? power : force.power || 0));
    var current = state.forceMap[forceId] ? Math.max(0, Number(state.forceMap[forceId].power || 0)) : 0;
    state.value = Math.max(0, state.value - current + nextPower);
    state.forceMap[forceId] = {
      power: nextPower,
      ownerId: force.ownerId,
      targetId: force.targetId,
      source: force.source,
      skillKey: force.skillKey,
      activationId: force.activationId || null,
      type: force.type
    };
    if (state.forceIds.indexOf(forceId) < 0) state.forceIds.push(forceId);
    setKakoStatState(runtimeApi, ownerId, key, state, {
      source: 'kako_street_stats'
    });
  }

  function removeKakoForceStat(runtimeApi, ownerId, key, forceId) {
    if (ownerId == null || !key || !forceId) return;
    var state = getKakoStatState(runtimeApi, ownerId, key);
    var known = state.forceMap[String(forceId)];
    if (!known) return;
    state.value = Math.max(0, state.value - Math.max(0, Number(known.power || 0)));
    delete state.forceMap[String(forceId)];
    state.forceIds = state.forceIds.filter(function(id) {
      return id !== String(forceId);
    });
    setKakoStatState(runtimeApi, ownerId, key, state, {
      source: 'kako_street_stats'
    });
  }

  function ensureKakoOutgoingEntry(ownerId) {
    var key = String(ownerId);
    if (!kakoStreetOutgoing[key]) {
      kakoStreetOutgoing[key] = { fortune: 0, curse: 0, activations: Object.create(null) };
    }
    return kakoStreetOutgoing[key];
  }

  function getKakoOutgoingBucketKey(meta) {
    if (meta && meta.activationId) return 'act:' + String(meta.activationId);
    if (meta && meta.skillKey) return 'skill:' + String(meta.skillKey);
    if (meta && meta.source) return 'source:' + String(meta.source);
    if (meta && meta.forceId) return 'force:' + String(meta.forceId);
    return 'unknown';
  }

  function adjustKakoOutgoingActivation(ownerId, forceType, delta, meta) {
    if (ownerId == null || (forceType !== 'fortune' && forceType !== 'curse')) return;
    var entry = ensureKakoOutgoingEntry(ownerId);
    var bucketKey = getKakoOutgoingBucketKey(meta || {});
    if (!entry.activations[bucketKey]) {
      entry.activations[bucketKey] = { fortune: 0, curse: 0 };
    }
    entry.activations[bucketKey][forceType] = Math.max(
      0,
      Number(entry.activations[bucketKey][forceType] || 0) + Number(delta || 0)
    );
    if (entry.activations[bucketKey].fortune <= 0 && entry.activations[bucketKey].curse <= 0) {
      delete entry.activations[bucketKey];
    }
  }

  function adjustKakoOutgoing(ownerId, forceType, delta) {
    if (ownerId == null || (forceType !== 'fortune' && forceType !== 'curse')) return;
    var entry = ensureKakoOutgoingEntry(ownerId);
    entry[forceType] = Math.max(0, Number(entry[forceType] || 0) + Number(delta || 0));
  }

  function clearKakoStreetBookkeeping() {
    kakoStreetOutgoing = Object.create(null);
  }

  function snapshotKakoManaAnchors(runtimeApi) {
    kakoManaAnchors = Object.create(null);
    var players = getGamePlayers(runtimeApi);
    for (var i = 0; i < players.length; i++) {
      var player = players[i];
      var mana = getPlayerManaPool(runtimeApi, player && player.id);
      if (!player || !mana) continue;
      kakoManaAnchors[String(player.id)] = Math.max(0, Number(mana.current || 0));
    }
  }

  function getKakoTargetStats(runtimeApi, targetId) {
    var target = getPlayerById(runtimeApi, targetId);
    var curseState = getKakoCurseJudgeState(runtimeApi, target);
    return {
      fortune: getKakoAssetValue(runtimeApi, targetId, KAKO_STREET_FORTUNE_KEY),
      curse: Math.max(0, Number(curseState.value || 0)),
      lastManaDelta: getKakoAssetValue(runtimeApi, targetId, KAKO_LAST_MANA_DELTA_KEY),
      usedT0: getKakoAssetValue(runtimeApi, targetId, KAKO_USED_T0_KEY),
      redSeal: getKakoAssetValue(runtimeApi, targetId, KAKO_RED_SEAL_KEY) > 0
    };
  }

  function getKakoAttributedTypeState(runtimeApi, ownerId, forceType) {
    var key = forceType === 'fortune' ? KAKO_STREET_FORTUNE_KEY : KAKO_STREET_CURSE_KEY;
    var players = getGamePlayers(runtimeApi);
    var total = 0;
    var forceIds = [];
    var seen = Object.create(null);
    for (var i = 0; i < players.length; i++) {
      var player = players[i];
      if (!player) continue;
      var state = getKakoStatState(runtimeApi, player.id, key);
      var map = state && state.forceMap ? state.forceMap : null;
      if (!map) continue;
      var ids = Object.keys(map);
      for (var fi = 0; fi < ids.length; fi++) {
        var forceId = ids[fi];
        var entry = map[forceId];
        if (!entry || entry.ownerId !== ownerId || entry.type !== forceType) continue;
        if (seen[forceId]) continue;
        seen[forceId] = true;
        total += Math.max(0, Number(entry.power || 0));
        forceIds.push(String(forceId));
      }
    }
    return {
      value: total,
      forceIds: forceIds
    };
  }

  function isKakoEligibleRedlineTarget(player) {
    return !!(player &&
      player.isActive !== false &&
      !player.folded &&
      !isRolePlayer(player, 'KAKO'));
  }

  function computeKakoRedlineRate(runtimeApi) {
    var players = getGamePlayers(runtimeApi).filter(isKakoEligibleRedlineTarget);
    if (!players.length) return 0;
    var marked = players.filter(function(player) {
      return getKakoAssetValue(runtimeApi, player.id, KAKO_RED_SEAL_KEY) > 0;
    }).length;
    return marked / players.length;
  }

  function getKakoMaxStateForcePower(state) {
    if (!state || !state.forceMap) return 0;
    var forceIds = Object.keys(state.forceMap);
    var maxPower = 0;
    for (var i = 0; i < forceIds.length; i++) {
      var entry = state.forceMap[forceIds[i]];
      var power = Math.max(0, Number(entry && entry.power || 0));
      if (power > maxPower) maxPower = power;
    }
    return maxPower;
  }

  function getKakoMaxOutgoingForcePower(runtimeApi, ownerId, forceType) {
    if (ownerId == null || (forceType !== 'fortune' && forceType !== 'curse')) return 0;
    var entry = ensureKakoOutgoingEntry(ownerId);
    var buckets = Object.keys(entry.activations || {});
    var maxPower = 0;
    for (var i = 0; i < buckets.length; i++) {
      var bucket = entry.activations[buckets[i]];
      var power = Math.max(0, Number(bucket && bucket[forceType] || 0));
      if (power > maxPower) maxPower = power;
    }
    return maxPower;
  }

  function computeKakoEffectiveRedlineRate(runtimeApi, ownerId, includeSelfMarked) {
    var players = getGamePlayers(runtimeApi).filter(isKakoEligibleRedlineTarget);
    var marked = players.filter(function(player) {
      return getKakoAssetValue(runtimeApi, player.id, KAKO_RED_SEAL_KEY) > 0;
    }).length;
    var total = players.length;
    if (includeSelfMarked && ownerId != null) {
      total += 1;
      marked += 1;
    }
    if (total <= 0) return 0;
    return marked / total;
  }

  function syncKakoRedlineRate(runtimeApi) {
    var players = getKakoPlayers(runtimeApi);
    var rate = computeKakoRedlineRate(runtimeApi);
    for (var i = 0; i < players.length; i++) {
      setKakoAsset(runtimeApi, players[i].id, KAKO_REDLINE_RATE_KEY, rate, {
        source: 'kako_redline_rate'
      });
    }
    return rate;
  }

  function shouldKakoApplyRedSeal(runtimeApi, ownerId) {
    var incomingFortune = getKakoMaxStateForcePower(getKakoStatState(runtimeApi, ownerId, KAKO_STREET_FORTUNE_KEY));
    var owner = getPlayerById(runtimeApi, ownerId);
    var incomingCurse = getKakoMaxStateForcePower(getKakoCurseJudgeState(runtimeApi, owner));
    var outgoingFortune = getKakoMaxOutgoingForcePower(runtimeApi, ownerId, 'fortune');
    var outgoingCurse = getKakoMaxOutgoingForcePower(runtimeApi, ownerId, 'curse');
    var lastManaDelta = getKakoAssetValue(runtimeApi, ownerId, KAKO_LAST_MANA_DELTA_KEY);
    var usedT0 = getKakoAssetValue(runtimeApi, ownerId, KAKO_USED_T0_KEY);
    return incomingFortune >= 40 ||
      incomingCurse >= 40 ||
      outgoingFortune >= 40 ||
      outgoingCurse >= 40 ||
      lastManaDelta >= 40 ||
      usedT0 > 0;
  }

  function syncKakoRedSealState(runtimeApi, ownerId) {
    if (ownerId == null) return;
    var skillSystem = getSkillSystem(runtimeApi);
    if (!skillSystem) return;
    if (!guardConfiguredRole(runtimeApi, 'KAKO', function(api) {
      clearKakoStreetAssets(api, false, false);
    })) return;
    var player = getPlayerById(runtimeApi, ownerId);
    if (!player) return;
    if (!isRuntimePlayerLive(player)) {
      clearKakoAsset(runtimeApi, ownerId, KAKO_RED_SEAL_KEY);
      clearStatusMarkSafe(skillSystem, ownerId, KAKO_RED_SEAL_KEY);
      emitKakoEvent(runtimeApi, 'kako:red_seal_changed', {
        ownerId: player.id,
        ownerName: player.name,
        active: false,
        stats: getKakoTargetStats(runtimeApi, ownerId)
      });
      syncKakoRedlineRate(runtimeApi);
      syncKakoPendingMarks(runtimeApi);
      return;
    }
    var wasSealed = getKakoAssetValue(runtimeApi, ownerId, KAKO_RED_SEAL_KEY) > 0;
    var sealed = shouldKakoApplyRedSeal(runtimeApi, ownerId);
    if (sealed) {
      setKakoAsset(runtimeApi, ownerId, KAKO_RED_SEAL_KEY, 1, {
        source: 'kako_red_seal'
      });
      skillSystem.setStatusMark(ownerId, KAKO_RED_SEAL_KEY, {
        sourceName: 'KAKO',
        icon: KAKO_RED_SEAL_ICON,
        title: '红章',
        tone: 'kako',
        duration: 'persistent',
        badgeText: '!',
        detail: '已进入红章状态'
      });
      if (!wasSealed) {
        emitKakoEvent(runtimeApi, 'kako:red_seal_changed', {
          ownerId: player.id,
          ownerName: player.name,
          active: true,
          stats: getKakoTargetStats(runtimeApi, ownerId)
        });
      }
    }
    syncKakoRedlineRate(runtimeApi);
    syncKakoPendingMarks(runtimeApi);
  }

  function syncAllKakoRedSealMarks(runtimeApi) {
    var skillSystem = getSkillSystem(runtimeApi);
    var players = getGamePlayers(runtimeApi);
    if (!skillSystem || !players || !players.length) return;
    if (!guardConfiguredRole(runtimeApi, 'KAKO', function(api) {
      clearKakoStreetAssets(api, false, false);
    })) return;
    for (var i = 0; i < players.length; i++) {
      var player = players[i];
      if (!player) continue;
      if (!isRuntimePlayerLive(player)) {
        clearKakoAsset(runtimeApi, player.id, KAKO_RED_SEAL_KEY);
        clearStatusMarkSafe(skillSystem, player.id, KAKO_RED_SEAL_KEY);
        continue;
      }
      if (getKakoAssetValue(runtimeApi, player.id, KAKO_RED_SEAL_KEY) <= 0) continue;
      skillSystem.setStatusMark(player.id, KAKO_RED_SEAL_KEY, {
        sourceName: 'KAKO',
        icon: KAKO_RED_SEAL_ICON,
        title: '红章',
        tone: 'kako',
        duration: 'persistent',
        badgeText: '!',
        detail: '已进入红章状态'
      });
    }
  }

  function clearKakoStreetAssets(runtimeApi, keepContracts, preserveRedSeal) {
    var players = getGamePlayers(runtimeApi);
    var skillSystem = getSkillSystem(runtimeApi);
    for (var i = 0; i < players.length; i++) {
      var player = players[i];
      if (!player) continue;
      clearKakoAsset(runtimeApi, player.id, KAKO_STREET_FORTUNE_KEY);
      clearKakoAsset(runtimeApi, player.id, KAKO_STREET_CURSE_KEY);
      clearKakoAsset(runtimeApi, player.id, KAKO_LAST_MANA_DELTA_KEY);
      clearKakoAsset(runtimeApi, player.id, KAKO_USED_T0_KEY);
      if (skillSystem && typeof skillSystem.clearStatusMark === 'function') {
        skillSystem.clearStatusMark(player.id, KAKO_RULING_PENDING_MARK_KEY);
      }
      if (!preserveRedSeal) {
        clearKakoAsset(runtimeApi, player.id, KAKO_RED_SEAL_KEY);
        if (skillSystem && typeof skillSystem.clearStatusMark === 'function') {
          skillSystem.clearStatusMark(player.id, KAKO_RED_SEAL_KEY);
        }
      }
    }
    if (!keepContracts) {
      var owners = getKakoPlayers(runtimeApi);
      for (var j = 0; j < owners.length; j++) {
        clearKakoAsset(runtimeApi, owners[j].id, KAKO_RULING_CONTRACT_KEY);
        clearKakoAsset(runtimeApi, owners[j].id, KAKO_REDLINE_RATE_KEY);
      }
    }
    clearKakoStreetBookkeeping();
    syncKakoRedlineRate(runtimeApi);
  }

  function syncKakoPendingMarks(runtimeApi) {
    var skillSystem = getSkillSystem(runtimeApi);
    if (!skillSystem) return;
    if (!guardConfiguredRole(runtimeApi, 'KAKO', function(api) {
      clearKakoStreetAssets(api, false, false);
    })) return;
    var players = getGamePlayers(runtimeApi);
    for (var i = 0; i < players.length; i++) {
      if (players[i]) skillSystem.clearStatusMark(players[i].id, KAKO_RULING_PENDING_MARK_KEY);
    }

    var owners = getKakoPlayers(runtimeApi);
    for (var oi = 0; oi < owners.length; oi++) {
      var owner = owners[oi];
      var contracts = getKakoContracts(runtimeApi, owner.id);
      for (var ci = 0; ci < contracts.length; ci++) {
        var contract = contracts[ci];
        if (!contract) continue;
        if (contract.kind === 'reclassification') {
          var target = getPlayerById(runtimeApi, contract.targetId);
          if (!isKakoReclassificationTarget(runtimeApi, owner, target)) continue;
          skillSystem.setStatusMark(target.id, KAKO_RULING_PENDING_MARK_KEY, {
            sourceName: owner.name,
            icon: KAKO_RULING_ICON,
            title: '改判待裁定',
            tone: 'kako',
            duration: 'street',
            detail: '发牌前将进入审判时刻'
          });
        } else if (contract.kind === 'general_ruling') {
          var targets = getGamePlayers(runtimeApi).filter(isKakoEligibleRedlineTarget).filter(function(player) {
            return getKakoAssetValue(runtimeApi, player.id, KAKO_RED_SEAL_KEY) > 0;
          });
          for (var ti = 0; ti < targets.length; ti++) {
            skillSystem.setStatusMark(targets[ti].id, KAKO_RULING_PENDING_MARK_KEY, {
              sourceName: owner.name,
              icon: KAKO_RULING_ICON,
              title: '总务裁定',
              tone: 'kako',
              duration: 'street',
              detail: '本街将被纳入总务裁定'
            });
          }
        }
      }
    }
  }

  function applyKakoStreetStatForce(runtimeApi, force, sign) {
    if (!force || !force._runtimeId) return;
    var recipientId = getKakoForceRecipientId(force);
    if (recipientId == null) return;
    var key = force.type === 'fortune' ? KAKO_STREET_FORTUNE_KEY : KAKO_STREET_CURSE_KEY;
    if (sign >= 0) {
      addKakoForceStat(runtimeApi, recipientId, key, force, Math.max(0, Number(force.power || 0)));
      adjustKakoOutgoing(force.ownerId, force.type, Math.max(0, Number(force.power || 0)));
      adjustKakoOutgoingActivation(force.ownerId, force.type, Math.max(0, Number(force.power || 0)), {
        activationId: force.activationId || null,
        skillKey: force.skillKey || null,
        source: force.source || null,
        forceId: force._runtimeId
      });
    } else {
      removeKakoForceStat(runtimeApi, recipientId, key, force._runtimeId);
      adjustKakoOutgoing(force.ownerId, force.type, -Math.max(0, Number(force.power || 0)));
      adjustKakoOutgoingActivation(force.ownerId, force.type, -Math.max(0, Number(force.power || 0)), {
        activationId: force.activationId || null,
        skillKey: force.skillKey || null,
        source: force.source || null,
        forceId: force._runtimeId
      });
    }
    syncKakoRedSealState(runtimeApi, recipientId);
    if (force.ownerId != null && force.ownerId !== recipientId) {
      syncKakoRedSealState(runtimeApi, force.ownerId);
    }
    syncKakoPendingMarks(runtimeApi);
  }

  function handleKakoForceQueued(payload, runtimeApi) {
    if (!isKakoTrackedForcePayload(payload)) return;
    applyKakoStreetStatForce(runtimeApi, payload.force, 1);
  }

  function handleKakoForceRemoved(payload, runtimeApi) {
    if (!isKakoTrackedForcePayload(payload)) return;
    applyKakoStreetStatForce(runtimeApi, payload.force, -1);
  }

  function handleKakoForceMutated(payload, runtimeApi) {
    if (payload && payload.before) {
      handleKakoForceRemoved({
        force: payload.before,
        meta: payload.meta
      }, runtimeApi);
    }
    if (payload && payload.after) {
      handleKakoForceQueued({
        force: payload.after,
        meta: payload.meta
      }, runtimeApi);
    }
  }

  function captureKakoManaDelta(payload, runtimeApi) {
    if (!payload || payload.ownerId == null) return;
    var ownerId = Number(payload.ownerId);
    var current = Math.max(0, Number(payload.current || 0));
    var previous = kakoManaAnchors[String(ownerId)];
    kakoManaAnchors[String(ownerId)] = current;
    if (previous == null) return;
    var delta = Math.abs(current - previous);
    setKakoAsset(runtimeApi, ownerId, KAKO_LAST_MANA_DELTA_KEY, delta, {
      source: payload.reason || 'mana_changed'
    });
    syncKakoRedSealState(runtimeApi, ownerId);
  }

  function captureKakoTierZeroUsage(payload, runtimeApi) {
    if (!payload || !payload.skill || payload.skill.ownerId == null) return;
    var skill = payload.skill;
    if (Number(skill.tier) !== 0) return;
    setKakoAsset(runtimeApi, skill.ownerId, KAKO_USED_T0_KEY, 1, {
      source: skill.skillKey || skill.effect || 'tier_zero'
    });
    syncKakoRedSealState(runtimeApi, skill.ownerId);
  }

  function pickKakoRulingType(stats, explicitChoice) {
    if (explicitChoice === 'fortune' && stats.fortune > 0) return 'fortune';
    if (explicitChoice === 'curse' && stats.curse > 0) return 'curse';
    if (stats.fortune > stats.curse) return 'fortune';
    if (stats.curse > 0) return 'curse';
    if (stats.fortune > 0) return 'fortune';
    return 'curse';
  }

  function getKakoGeneralTargets(runtimeApi, ownerId) {
    return getGamePlayers(runtimeApi).filter(function(player) {
      return player &&
        player.id !== ownerId &&
        isKakoEligibleRedlineTarget(player) &&
        getKakoAssetValue(runtimeApi, player.id, KAKO_RED_SEAL_KEY) > 0;
    });
  }

  function hasKakoJudgeableStats(runtimeApi, targetId) {
    if (targetId == null) return false;
    var target = getPlayerById(runtimeApi, targetId);
    return getKakoAssetValue(runtimeApi, targetId, KAKO_STREET_FORTUNE_KEY) > 0 ||
      getKakoCurseJudgeState(runtimeApi, target).value > 0;
  }

  function isKakoReclassificationTarget(runtimeApi, owner, target) {
    if (!owner || !target) return false;
    if (target.id === owner.id) return true;
    if (hasKakoJudgeableStats(runtimeApi, target.id)) return true;
    return isKakoEligibleRedlineTarget(target);
  }

  function buildKakoEntryForContract(runtimeApi, owner, contract, target) {
    if (!owner || !contract || !target) return null;
    var fortuneState = getKakoStatState(runtimeApi, target.id, KAKO_STREET_FORTUNE_KEY);
    var curseState = getKakoCurseJudgeState(runtimeApi, target);
    var total = Math.max(0, Number(fortuneState.value || 0) + Number(curseState.value || 0));
    if (total <= 0) return null;
    var selfRuling = owner.id === target.id;
    var entry = {
      contractId: contract.id,
      kind: contract.kind,
      sourceSkill: contract.sourceSkill,
      targetId: target.id,
      targetName: target.name,
      hasRedSeal: getKakoAssetValue(runtimeApi, target.id, KAKO_RED_SEAL_KEY) > 0 || selfRuling,
      streetAddedFortune: Math.max(0, Number(fortuneState.value || 0)),
      streetAddedCurse: Math.max(0, Number(curseState.value || 0)),
      trackedForceIds: {
        fortune: Array.isArray(fortuneState.forceIds) ? fortuneState.forceIds.slice() : [],
        curse: Array.isArray(curseState.forceIds) ? curseState.forceIds.slice() : []
      },
      rulingType: chooseKakoAiRulingType(runtimeApi, owner.id, {
        fortune: Math.max(0, Number(fortuneState.value || 0)),
        curse: Math.max(0, Number(curseState.value || 0))
      }, contract.choice || null),
      decision: null
    };
    entry.previewRates = null;
    return entry;
  }

  function getKakoRedlineBonusRate(runtimeApi, ownerId, hasRedSeal, entry) {
    if (!hasRedSeal) return 0;
    var effect = getTraitEffect(runtimeApi, ownerId, 'kako_redline_file');
    if (!effect) return 0;
    var selfMarked = !!(entry && entry.targetId === ownerId);
    var rate = selfMarked
      ? computeKakoEffectiveRedlineRate(runtimeApi, ownerId, true)
      : Math.max(0, getKakoAssetValue(runtimeApi, ownerId, KAKO_REDLINE_RATE_KEY));
    return Math.max(0, Number(effect.bonusPerRedlineRate || 0)) * rate;
  }

  function getKakoDecisionProfile(runtimeApi, ownerId, entry, decision) {
    var kind = entry.kind || entry.sourceSkill;
    var approve = decision === 'approve';
    var bonusRate = entry && entry.hasRedSeal
      ? getKakoRedlineBonusRate(runtimeApi, ownerId, true, entry)
      : 0;
    var primaryRate = 0;
    var secondaryRate = 0;
    if (kind === 'general_ruling') {
      primaryRate = 0.33;
      secondaryRate = 0.14;
    } else if (entry.hasRedSeal) {
      primaryRate = 0.30;
      secondaryRate = 0.12;
    } else {
      primaryRate = 0.15;
      secondaryRate = 0.08;
    }
    primaryRate += bonusRate;
    secondaryRate += bonusRate;
    return {
      primaryFactor: approve ? (1 + primaryRate) : Math.max(0, 1 - primaryRate),
      secondaryFactor: Math.max(0, 1 - secondaryRate),
      primaryRate: primaryRate,
      secondaryRate: secondaryRate
    };
  }

  function buildKakoEntryPreviewRates(runtimeApi, ownerId, entry) {
    var profile = getKakoDecisionProfile(runtimeApi, ownerId, entry, 'approve');
    return {
      primaryRate: Math.max(0, Number(profile && profile.primaryRate || 0)),
      secondaryRate: Math.max(0, Number(profile && profile.secondaryRate || 0))
    };
  }

  function applyKakoMultiplierToEulaliaBurden(runtimeApi, ownerId, factor, meta) {
    if (ownerId == null) return;
    var beforeStreetBurden = meta && meta.baseAmount != null
      ? Math.max(0, Number(meta.baseAmount || 0))
      : getEulaliaAssetValue(runtimeApi, ownerId, EULALIA_STREET_BURDEN_KEY);
    if (beforeStreetBurden <= 0) {
      beforeStreetBurden = getEulaliaProjectedBurden(runtimeApi, ownerId);
    }
    var nextStreetBurden = Math.max(0, Math.ceil(Math.max(0, Number(beforeStreetBurden || 0)) * Number(factor || 0)));
    var delta = nextStreetBurden - beforeStreetBurden;
    var phase = resolveRuntimePhase(runtimeApi, meta || {});
    var beforeTotal = getEulaliaAssetValue(runtimeApi, ownerId, EULALIA_ABSOLUTION_TOTAL_KEY);
    var nextTotal = Math.max(0, beforeTotal + delta);
    setEulaliaAsset(runtimeApi, ownerId, EULALIA_STREET_BURDEN_KEY, nextStreetBurden, {
      reason: meta && meta.reason ? meta.reason : 'kako_ruling_eulalia_burden',
      phase: phase
    });
    setEulaliaAsset(runtimeApi, ownerId, EULALIA_QUEUED_BURDEN_KEY, nextStreetBurden, {
      reason: meta && meta.reason ? meta.reason : 'kako_ruling_eulalia_burden',
      phase: phase
    });
    setEulaliaAsset(runtimeApi, ownerId, EULALIA_ABSOLUTION_TOTAL_KEY, nextTotal, {
      reason: meta && meta.reason ? meta.reason : 'kako_ruling_eulalia_burden',
      phase: phase
    });
    updateEulaliaNominalBurden(runtimeApi, ownerId, nextStreetBurden, phase);
    syncEulaliaStatusMarks(runtimeApi, ownerId);
    syncKakoRedSealState(runtimeApi, ownerId);
    var skillSystem = getSkillSystem(runtimeApi);
    if (skillSystem && typeof skillSystem._log === 'function') {
      skillSystem._log('KAKO_FORCE_MUTATION', {
        forceId: createKakoEulaliaBurdenTrackId(ownerId),
        ownerId: ownerId,
        ownerName: getPlayerById(runtimeApi, ownerId) ? getPlayerById(runtimeApi, ownerId).name : null,
        targetId: ownerId,
        targetName: getPlayerById(runtimeApi, ownerId) ? getPlayerById(runtimeApi, ownerId).name : null,
        type: 'curse',
        beforePower: beforeStreetBurden,
        afterPower: nextStreetBurden,
        factor: Number(factor || 0),
        reason: meta && meta.reason ? meta.reason : null,
        contractId: meta && meta.contractId ? meta.contractId : null,
        decision: meta && meta.decision ? meta.decision : null,
        rulingType: meta && meta.rulingType ? meta.rulingType : null
      });
    }
  }

  function applyKakoMultiplierToForces(runtimeApi, forceIds, factor, meta) {
    var skillSystem = getSkillSystem(runtimeApi);
    if (!Array.isArray(forceIds) || !forceIds.length) return;
    for (var ai = 0; ai < forceIds.length; ai++) {
      var eulaliaBurdenOwnerId = parseKakoEulaliaBurdenTrackId(forceIds[ai]);
      if (eulaliaBurdenOwnerId != null) {
        applyKakoMultiplierToEulaliaBurden(runtimeApi, eulaliaBurdenOwnerId, factor, meta);
      }
    }
    if (!skillSystem || !Array.isArray(skillSystem.pendingForces)) return;
    for (var i = 0; i < skillSystem.pendingForces.length; i++) {
      var force = skillSystem.pendingForces[i];
      if (!force || force._runtimeId == null) continue;
      if (forceIds.indexOf(String(force._runtimeId)) < 0) continue;
      var before = Object.assign({}, force);
      var nextPower = Math.max(0, Math.ceil(Math.max(0, Number(force.power || 0)) * Number(factor || 0)));
      force.power = nextPower;
      if (force.effectivePower != null) force.effectivePower = nextPower;
      if (typeof skillSystem._log === 'function') {
        skillSystem._log('KAKO_FORCE_MUTATION', {
          forceId: force._runtimeId,
          ownerId: force.ownerId,
          ownerName: force.ownerName || null,
          targetId: getKakoForceRecipientId(force),
          targetName: force.targetName || null,
          type: force.type,
          beforePower: before.power != null ? Number(before.power) : 0,
          afterPower: nextPower,
          factor: Number(factor || 0),
          reason: meta && meta.reason ? meta.reason : null,
          contractId: meta && meta.contractId ? meta.contractId : null,
          decision: meta && meta.decision ? meta.decision : null,
          rulingType: meta && meta.rulingType ? meta.rulingType : null
        });
      }
      if (typeof skillSystem._mutatePendingForce === 'function') {
        skillSystem._mutatePendingForce(force, before, meta || null);
      }
    }
  }

  function resolveKakoDecisions(runtimeApi, ownerId, result) {
    var selectedEntries = Array.isArray(result && result.entries) ? result.entries : [];
    var owner = getPlayerById(runtimeApi, ownerId);
    var resolvedEntries = [];
    for (var i = 0; i < selectedEntries.length; i++) {
      var selected = selectedEntries[i];
      var decision = selected && selected.decision ? String(selected.decision) : null;
      if (decision !== 'approve' && decision !== 'reject') continue;
      var primaryType = selected && selected.selectedType === 'fortune'
        ? 'fortune'
        : selected && selected.selectedType === 'curse'
          ? 'curse'
          : selected.rulingType === 'fortune'
            ? 'fortune'
            : 'curse';
      var secondaryType = primaryType === 'fortune' ? 'curse' : 'fortune';
      var profile = getKakoDecisionProfile(runtimeApi, ownerId, selected, decision);
      var tracked = selected && selected.trackedForceIds ? selected.trackedForceIds : {};
      var primaryForceIds = Array.isArray(tracked[primaryType]) ? tracked[primaryType] : [];
      var secondaryForceIds = Array.isArray(tracked[secondaryType]) ? tracked[secondaryType] : [];
      applyKakoMultiplierToForces(runtimeApi, primaryForceIds, profile.primaryFactor, {
        reason: 'kako_ruling_primary',
        ownerId: ownerId,
        contractId: selected.contractId,
        decision: decision,
        rulingType: primaryType,
        baseAmount: primaryType === 'fortune'
          ? Math.max(0, Number(selected && selected.streetAddedFortune || 0))
          : Math.max(0, Number(selected && selected.streetAddedCurse || 0))
      });
      applyKakoMultiplierToForces(runtimeApi, secondaryForceIds, profile.secondaryFactor, {
        reason: 'kako_ruling_secondary',
        ownerId: ownerId,
        contractId: selected.contractId,
        decision: decision,
        rulingType: secondaryType,
        baseAmount: secondaryType === 'fortune'
          ? Math.max(0, Number(selected && selected.streetAddedFortune || 0))
          : Math.max(0, Number(selected && selected.streetAddedCurse || 0))
      });
      resolvedEntries.push({
        contractId: selected.contractId || null,
        kind: selected.kind || selected.sourceSkill || null,
        targetId: selected.targetId,
        targetName: selected.targetName || null,
        hasRedSeal: !!selected.hasRedSeal,
        decision: decision,
        selectedType: primaryType,
        rulingType: primaryType,
        primaryFactor: profile.primaryFactor,
        secondaryFactor: profile.secondaryFactor,
        streetAddedFortune: Math.max(0, Number(selected.streetAddedFortune || 0)),
        streetAddedCurse: Math.max(0, Number(selected.streetAddedCurse || 0))
      });
    }
    if (resolvedEntries.length) {
      emitKakoEvent(runtimeApi, 'kako:ruling_resolved', {
        ownerId: ownerId,
        ownerName: owner ? owner.name : 'KAKO',
        resultMode: result && result.mode ? result.mode : null,
        sourceSkill: result && result.sourceSkill ? result.sourceSkill : null,
        entries: resolvedEntries
      });
    }
  }

  function buildKakoPreDealWindow(runtimeApi, owner) {
    if (!owner) return null;
    var contracts = getKakoContracts(runtimeApi, owner.id);
    if (!contracts.length) return null;
    var entries = [];
    for (var i = 0; i < contracts.length; i++) {
      var contract = contracts[i];
      if (!contract) continue;
        if (contract.kind === 'reclassification') {
          var target = getPlayerById(runtimeApi, contract.targetId);
          if (!isKakoReclassificationTarget(runtimeApi, owner, target)) continue;
          var singleEntry = buildKakoEntryForContract(runtimeApi, owner, contract, target);
          if (singleEntry) {
            singleEntry.previewRates = buildKakoEntryPreviewRates(runtimeApi, owner.id, singleEntry);
            if (owner.type === 'ai') {
              singleEntry.rulingType = chooseKakoAiRulingType(runtimeApi, owner.id, {
                fortune: Math.max(0, Number(singleEntry.streetAddedFortune || 0)),
                curse: Math.max(0, Number(singleEntry.streetAddedCurse || 0))
              }, singleEntry.rulingType || null);
              singleEntry.decision = chooseKakoAiDecision(runtimeApi, owner.id, singleEntry);
            }
            entries.push(singleEntry);
          }
        } else if (contract.kind === 'general_ruling') {
          var targets = getKakoGeneralTargets(runtimeApi, owner.id);
          for (var ti = 0; ti < targets.length; ti++) {
            var groupEntry = buildKakoEntryForContract(runtimeApi, owner, contract, targets[ti]);
            if (groupEntry) {
              groupEntry.previewRates = buildKakoEntryPreviewRates(runtimeApi, owner.id, groupEntry);
              if (owner.type === 'ai') {
                groupEntry.rulingType = chooseKakoAiRulingType(runtimeApi, owner.id, {
                  fortune: Math.max(0, Number(groupEntry.streetAddedFortune || 0)),
                  curse: Math.max(0, Number(groupEntry.streetAddedCurse || 0))
                }, groupEntry.rulingType || null);
                groupEntry.decision = chooseKakoAiDecision(runtimeApi, owner.id, groupEntry);
              }
              entries.push(groupEntry);
            }
          }
        }
    }
    if (!entries.length) {
      emitKakoEvent(runtimeApi, 'kako:window_skipped', {
        ownerId: owner.id,
        ownerName: owner.name,
        contractCount: contracts.length,
        sourceSkill: contracts.some(function(contract) { return contract && contract.kind === 'general_ruling'; })
          ? 'general_ruling'
          : 'reclassification',
        reason: 'no_effective_entries'
      });
      setKakoContracts(runtimeApi, owner.id, [], {
        source: 'kako_predeal_empty'
      });
      syncKakoPendingMarks(runtimeApi);
      return null;
    }
    emitKakoEvent(runtimeApi, 'kako:window_opened', {
      ownerId: owner.id,
      ownerName: owner.name,
      mode: owner.type === 'ai' ? 'ai' : 'human',
      entryCount: entries.length,
      sourceSkill: entries.some(function(entry) { return entry.kind === 'general_ruling'; })
        ? 'general_ruling'
        : 'reclassification',
      entries: entries.map(function(entry) {
        return {
          contractId: entry.contractId || null,
          kind: entry.kind || entry.sourceSkill || null,
          targetId: entry.targetId,
          targetName: entry.targetName || null,
          hasRedSeal: !!entry.hasRedSeal,
          rulingType: entry.rulingType || null,
          streetAddedFortune: Math.max(0, Number(entry.streetAddedFortune || 0)),
          streetAddedCurse: Math.max(0, Number(entry.streetAddedCurse || 0))
        };
      })
    });
    return {
      ownerId: owner.id,
      ownerName: owner.name,
      mode: owner.type === 'ai' ? 'ai' : 'human',
      sourceSkill: entries.some(function(entry) { return entry.kind === 'general_ruling'; }) ? 'general_ruling' : 'reclassification',
      entries: entries,
      confirmLabel: '判决 / 确定',
      autoDelayMs: owner.type === 'ai' ? 900 : 0,
      applyDecisions: function(result) {
        resolveKakoDecisions(runtimeApi, owner.id, result || {});
        setKakoContracts(runtimeApi, owner.id, [], {
          source: 'kako_predeal_resolved'
        });
        syncKakoPendingMarks(runtimeApi);
      }
    };
  }

  function handleKakoSkillActivationEvent(payload, runtimeApi) {
    if (!payload || !payload.skill || payload.skill.ownerId == null) return;
    if (payload.__kakoRuntimeHandled) return;
    payload.__kakoRuntimeHandled = true;
    captureKakoTierZeroUsage(payload, runtimeApi);

    var ownerId = payload.skill.ownerId;
    var owner = getPlayerById(runtimeApi, ownerId);
    if (!owner || !isRolePlayer(owner, 'KAKO')) return;

    if (payload.type !== 'reclassification' &&
        payload.type !== 'general_ruling' &&
        payload.skill.effect !== 'reclassification' &&
        payload.skill.effect !== 'general_ruling') {
      return;
    }

    var contracts = getKakoContracts(runtimeApi, ownerId);
    if (payload.type === 'reclassification' || payload.skill.effect === 'reclassification') {
      var targetId = payload.targetId != null
        ? Number(payload.targetId)
        : payload.options && payload.options.targetId != null
          ? Number(payload.options.targetId)
          : null;
      if (targetId == null) return;
      contracts.push({
        id: createKakoContractId('kako_reclassification'),
        kind: 'reclassification',
        ownerId: ownerId,
        ownerName: owner.name,
        sourceSkill: 'reclassification',
        targetId: targetId,
        choice: payload.options && payload.options.rulingChoice ? String(payload.options.rulingChoice) : null,
        phase: payload.phase != null ? payload.phase : resolveRuntimePhase(runtimeApi, payload)
      });
    } else {
      contracts.push({
        id: createKakoContractId('kako_general_ruling'),
        kind: 'general_ruling',
        ownerId: ownerId,
        ownerName: owner.name,
        sourceSkill: 'general_ruling',
        phase: payload.phase != null ? payload.phase : resolveRuntimePhase(runtimeApi, payload)
      });
    }
    setKakoContracts(runtimeApi, ownerId, contracts, {
      source: 'kako_skill_activation'
    });
    emitKakoEvent(runtimeApi, 'kako:contract_queued', {
      ownerId: ownerId,
      ownerName: owner.name,
      contractId: contracts.length ? contracts[contracts.length - 1].id : null,
      kind: payload.type === 'general_ruling' || payload.skill.effect === 'general_ruling'
        ? 'general_ruling'
        : 'reclassification',
      targetId: payload.targetId != null ? Number(payload.targetId) : null,
      targetName: payload.targetId != null && getPlayerById(runtimeApi, payload.targetId)
        ? getPlayerById(runtimeApi, payload.targetId).name
        : null,
      contractCount: contracts.length
    });
    syncKakoPendingMarks(runtimeApi);
  }

  function processKakoSignoffFlow(runtimeApi) {
    var players = getKakoPlayers(runtimeApi);
    var rate = syncKakoRedlineRate(runtimeApi);
    for (var i = 0; i < players.length; i++) {
      var owner = players[i];
      var effect = getTraitEffect(runtimeApi, owner.id, 'kako_signoff_flow');
      if (!effect) continue;
      var manaGain = Math.max(0, Math.ceil(rate * Math.max(0, Number(effect.manaPerStreetCap || 0))));
      if (manaGain <= 0) continue;
      var mana = getPlayerManaPool(runtimeApi, owner.id);
      if (!mana) continue;
      var before = mana.current;
      setManaCurrent(runtimeApi, owner.id, mana.current + manaGain, 'kako_signoff_flow');
      emitKakoEvent(runtimeApi, 'kako:signoff_flow', {
        ownerId: owner.id,
        ownerName: owner.name,
        redlineRate: rate,
        manaGain: manaGain,
        manaBefore: before,
        manaAfter: Math.min(Number(mana.max != null ? mana.max : before + manaGain), before + manaGain)
      });
    }
  }

  function scoreKakoTarget(runtimeApi, ownerId, player) {
    if (!player || player.id === ownerId) return -9999;
    var stats = getKakoTargetStats(runtimeApi, player.id);
    var total = Math.max(0, stats.fortune + stats.curse);
    if (total <= 0) return -9999;
    var selfStats = getKakoTargetStats(runtimeApi, ownerId);
    var selfTilt = Math.max(0, Number(selfStats.curse || 0)) - Math.max(0, Number(selfStats.fortune || 0));
    var offensiveBias = selfTilt < 0;
    var score = total;
    score += stats.redSeal ? 42 : 0;
    score += Math.max(stats.fortune, stats.curse) * 0.7;
    score += offensiveBias
      ? Math.max(0, Number(stats.curse || 0)) * 0.9 + Math.max(0, Number(stats.fortune || 0)) * 0.2
      : Math.max(0, Number(stats.fortune || 0)) * 0.9 + Math.max(0, Number(stats.curse || 0)) * 0.2;
    score += Math.max(0, Number(player.totalBet || 0)) * 0.05;
    return score;
  }

  function getKakoSelfMood(runtimeApi, ownerId) {
    var selfStats = getKakoTargetStats(runtimeApi, ownerId);
    return {
      fortune: Math.max(0, Number(selfStats.fortune || 0)),
      curse: Math.max(0, Number(selfStats.curse || 0)),
      momentum: Math.max(0, Number(selfStats.fortune || 0)) - Math.max(0, Number(selfStats.curse || 0))
    };
  }

  function chooseKakoAiRulingType(runtimeApi, ownerId, stats, explicitChoice) {
    if (!stats) return pickKakoRulingType({ fortune: 0, curse: 0 }, explicitChoice);
    if (explicitChoice === 'fortune' && stats.fortune > 0) return 'fortune';
    if (explicitChoice === 'curse' && stats.curse > 0) return 'curse';
    var selfMood = getKakoSelfMood(runtimeApi, ownerId);
    if (stats.fortune > stats.curse) return 'fortune';
    if (stats.curse > stats.fortune) return 'curse';
    if (selfMood.momentum >= 0 && stats.curse > 0) return 'curse';
    if (selfMood.momentum < 0 && stats.fortune > 0) return 'fortune';
    return pickKakoRulingType(stats, explicitChoice);
  }

  function chooseKakoAiDecision(runtimeApi, ownerId, entry) {
    if (!entry) return 'approve';
    var selfMood = getKakoSelfMood(runtimeApi, ownerId);
    var rulingType = chooseKakoAiRulingType(runtimeApi, ownerId, {
      fortune: Math.max(0, Number(entry.streetAddedFortune || 0)),
      curse: Math.max(0, Number(entry.streetAddedCurse || 0))
    }, entry.rulingType || null);
    var targetFortune = Math.max(0, Number(entry.streetAddedFortune || 0));
    var targetCurse = Math.max(0, Number(entry.streetAddedCurse || 0));
    var score = selfMood.momentum * 0.85;
    score += entry.hasRedSeal ? 8 : 0;
    if (rulingType === 'fortune') {
      score += targetCurse * 0.2;
      score -= targetFortune * 1.1;
    } else {
      score += targetCurse * 1.1;
      score -= targetFortune * 0.2;
    }
    return score >= 0 ? 'approve' : 'reject';
  }

  function getKakoBoardPressure(runtimeApi, ownerId) {
    var players = getGamePlayers(runtimeApi).filter(function(player) {
      return player &&
        player.id !== ownerId &&
        player.isActive !== false &&
        !player.folded;
    });
    var affectedTargets = 0;
    var redTargets = 0;
    var total = 0;
    for (var i = 0; i < players.length; i++) {
      var stats = getKakoTargetStats(runtimeApi, players[i].id);
      var subtotal = Math.max(0, Number(stats.fortune || 0)) + Math.max(0, Number(stats.curse || 0));
      if (subtotal > 0) affectedTargets += 1;
      if (stats.redSeal) redTargets += 1;
      total += subtotal;
    }
    return {
      affectedTargets: affectedTargets,
      redTargets: redTargets,
      total: total
    };
  }

  function shouldKakoUseReclassification(runtimeApi, ownerId, base) {
    var target = resolveKakoPrimaryTarget(runtimeApi, ownerId);
    if (!target) return false;
    var stats = getKakoTargetStats(runtimeApi, target.id);
    var total = Math.max(0, stats.fortune + stats.curse);
    if (stats.redSeal) return total >= 16 || base;
    return total >= 24 || (base && total >= 12);
  }

  function shouldKakoUseGeneralRuling(runtimeApi, ownerId, base) {
    var pressure = getKakoBoardPressure(runtimeApi, ownerId);
    if (pressure.redTargets <= 0) return false;
    if (pressure.affectedTargets >= 3 && pressure.total >= 72) return true;
    if (pressure.redTargets >= 2 && pressure.total >= 54) return true;
    if (pressure.redTargets >= 3) return true;
    return !!(base && pressure.redTargets >= 2 && pressure.total >= 36);
  }

  function resolveKakoPrimaryTarget(runtimeApi, ownerId) {
    var targets = getGamePlayers(runtimeApi).filter(function(player) {
      return player &&
        player.id !== ownerId &&
        player.isActive !== false &&
        !player.folded;
    }).sort(function(a, b) {
      return scoreKakoTarget(runtimeApi, ownerId, b) - scoreKakoTarget(runtimeApi, ownerId, a);
    });
    return targets[0] || null;
  }

  function createKakoRoleHandler(runtimeApi) {
    return {
      shouldUseSkill: function(roleCtx, fallback) {
        var base = fallback(roleCtx);
        var skill = roleCtx.skill || {};
        var owner = roleCtx.owner || {};
        var phase = String(roleCtx.ctx && roleCtx.ctx.phase || '').toLowerCase();
        if (phase === 'river') return false;

        if (skill.effect === 'reclassification') {
          return shouldKakoUseReclassification(runtimeApi, owner.id, base);
        }

        if (skill.effect === 'general_ruling') {
          return shouldKakoUseGeneralRuling(runtimeApi, owner.id, base);
        }

        return base;
      },
      selectSkillTarget: function(roleCtx, fallback) {
        var skill = roleCtx.skill || {};
        if (skill.effect === 'reclassification') {
          var target = resolveKakoPrimaryTarget(runtimeApi, roleCtx.owner && roleCtx.owner.id);
          if (target && target.id != null) return target.id;
        }
        return typeof fallback === 'function' ? fallback(roleCtx) : null;
      },
      augmentSkillOptions: function(roleCtx, fallback) {
        var next = typeof fallback === 'function' ? fallback(roleCtx) : {};
        var options = next && typeof next === 'object' ? Object.assign({}, next) : {};
        var skill = roleCtx.skill || {};
        if (skill.effect === 'reclassification') {
          var target = resolveKakoPrimaryTarget(runtimeApi, roleCtx.owner && roleCtx.owner.id);
          var stats = target ? getKakoTargetStats(runtimeApi, target.id) : null;
          options.targetId = target && target.id != null ? target.id : options.targetId;
          options.rulingChoice = stats
            ? chooseKakoAiRulingType(runtimeApi, roleCtx.owner && roleCtx.owner.id, stats, null)
            : null;
          options.rolePlan = 'kako_single_target_ruling';
        } else if (skill.effect === 'general_ruling') {
          options.rolePlan = 'kako_general_ruling';
        }
        return options;
      }
    };
  }

  function syncVvBubbleMarks(runtimeApi) {
    var skillSystem = getSkillSystem(runtimeApi);
    if (!skillSystem) return;
    if (!guardConfiguredRole(runtimeApi, 'VV', function(api) {
      var players = getGamePlayers(api);
      for (var pi = 0; pi < players.length; pi++) {
        if (players[pi]) clearStatusMarkSafe(skillSystem, players[pi].id, 'vv_bubble_mark');
      }
    })) return;

    var players = getGamePlayers(runtimeApi);
    for (var i = 0; i < players.length; i++) {
      var player = players[i];
      if (!player) continue;
      if (!isRuntimePlayerLive(player)) {
        clearStatusMarkSafe(skillSystem, player.id, 'vv_bubble_mark');
        continue;
      }
      var total = getBubbleTotal(runtimeApi, player.id);
      var summary = summarizeVvTargetPositions(runtimeApi, player.id);
      var count = summary.count;
      var badgeCount = summary.entrySize > 0 ? summary.entrySize : count;
      if (count > 0 || total > 0) {
        skillSystem.setStatusMark(player.id, 'vv_bubble_mark', {
          sourceName: 'VV',
          icon: VV_MARK_ICON,
          title: '泡沫头寸',
          tone: 'vv',
          duration: 'persistent',
          value: total,
          count: badgeCount,
          badgeText: badgeCount > 0 ? (badgeCount > 9 ? '9+' : String(badgeCount)) : '',
          detail: '入仓数量: ' + badgeCount +
            '\n头寸笔数: ' + count +
            '\n看涨仓位: ' + summary.bullishSize +
            '\n看跌仓位: ' + summary.bearishSize +
            '\n泡沫 fortune: ' + getBubbleValue(runtimeApi, player.id, 'bubble_fortune') +
            '\n泡沫 chaos: ' + getBubbleValue(runtimeApi, player.id, 'bubble_chaos') +
            '\n泡沫 mana: ' + getBubbleValue(runtimeApi, player.id, 'bubble_mana')
        });
      } else {
        skillSystem.clearStatusMark(player.id, 'vv_bubble_mark');
      }
    }
  }

  function clearVvInjectedForces(runtimeApi) {
    var skillSystem = getSkillSystem(runtimeApi);
    if (!skillSystem || !Array.isArray(skillSystem.pendingForces)) return;
    skillSystem.pendingForces = skillSystem.pendingForces.filter(function(force) {
      return !(force && force._vvBubbleAsset);
    });
  }

  function injectVvBubbleForces(runtimeApi) {
    var skillSystem = getSkillSystem(runtimeApi);
    if (!skillSystem || !Array.isArray(skillSystem.pendingForces)) return;

    clearVvInjectedForces(runtimeApi);
    var phase = resolveRuntimePhase(runtimeApi, null);

    var players = getGamePlayers(runtimeApi);
    for (var i = 0; i < players.length; i++) {
      var player = players[i];
      if (!player || player.folded || player.isActive === false) continue;

      var summary = summarizeVvTargetPositions(runtimeApi, player.id);
      var fortuneByOwner = Object.create(null);
      for (var fp = 0; fp < summary.packs.length; fp++) {
        var fortunePack = summary.packs[fp] || {};
        var fortuneOwnerId = fortunePack.ownerId != null ? fortunePack.ownerId : player.id;
        fortuneByOwner[fortuneOwnerId] = (fortuneByOwner[fortuneOwnerId] || 0) + Math.max(0, Number(fortunePack.bubble_fortune || 0));
      }

      var fortuneOwnerIds = Object.keys(fortuneByOwner);
      for (var fi = 0; fi < fortuneOwnerIds.length; fi++) {
        var sourceFortuneId = Number(fortuneOwnerIds[fi]);
        var fortuneTotal = Math.max(0, Number(fortuneByOwner[fortuneOwnerIds[fi]] || 0));
        if (fortuneTotal <= 0) continue;
        var fortuneSource = getPlayerById(runtimeApi, sourceFortuneId);
        skillSystem.pendingForces.push({
          ownerId: sourceFortuneId,
          ownerName: fortuneSource ? fortuneSource.name : 'VV',
          targetId: player.id,
          targetName: player.name,
          type: 'fortune',
          power: fortuneTotal,
          effectivePower: fortuneTotal,
          tier: 99,
          attr: 'moirai',
          activation: 'passive',
          source: 'vv_bubble',
          skillKey: 'clairvoyance',
          _vvBubbleAsset: true
        });
      }

      var chaosByOwner = Object.create(null);
      for (var p = 0; p < summary.packs.length; p++) {
        var pack = summary.packs[p] || {};
        var ownerId = pack.ownerId != null ? pack.ownerId : player.id;
        chaosByOwner[ownerId] = (chaosByOwner[ownerId] || 0) + Math.max(0, Number(pack.bubble_chaos || 0));
      }

      var ownerIds = Object.keys(chaosByOwner);
      for (var c = 0; c < ownerIds.length; c++) {
        var sourceId = Number(ownerIds[c]);
        var chaosTotal = Math.max(0, Number(chaosByOwner[ownerIds[c]] || 0));
        if (chaosTotal <= 0) continue;
        var source = getPlayerById(runtimeApi, sourceId);
        skillSystem.pendingForces.push({
          ownerId: sourceId,
          ownerName: source ? source.name : 'VV',
          type: 'curse',
          targetId: player.id,
          power: chaosTotal,
          effectivePower: chaosTotal,
          tier: 99,
          attr: 'chaos',
          activation: 'passive',
          source: 'vv_bubble',
          skillKey: 'clairvoyance',
          _vvBubbleAsset: true
        });
      }
    }

    triggerEulaliaRealtimeAbsorb(runtimeApi, phase, 'eulalia_absorb_vv_bubble');
  }

  function refreshVvPositionAssets(runtimeApi) {
    syncVvBubbleMarks(runtimeApi);
  }

  function handleVvClairvoyance(payload, runtimeApi) {
    if (!payload || !payload.skill) return;
    var skill = payload.skill;
    var ledger = getLedger(runtimeApi);
    if (!ledger) return;

    var targetId = payload.targetId != null ? Number(payload.targetId)
      : payload.protectId != null ? Number(payload.protectId)
      : null;
    if (targetId === skill.ownerId) {
      targetId = null;
    }
    if (targetId == null) {
      var target = resolveVvPrimaryTarget(runtimeApi, skill.ownerId);
      targetId = target ? target.id : null;
    }
    if (targetId == null) return;

    var manaPool = getPlayerManaPool(runtimeApi, targetId);
    var requestedTier = Math.max(1, Math.min(3,
      Number(
        payload.tier != null ? payload.tier :
        payload.positionTier != null ? payload.positionTier :
        payload.entrySize != null ? payload.entrySize :
        payload.options && payload.options.tier != null ? payload.options.tier :
        1
      ) || 1
    ));
    var requestedDirection = payload.direction != null ? payload.direction
      : payload.positionDirection != null ? payload.positionDirection
      : payload.options && payload.options.direction != null ? payload.options.direction
      : 'bullish';
    requestedDirection = requestedDirection === 'bearish' ? 'bearish' : 'bullish';
    var packPower = VV_POSITION_UNIT * requestedTier;
    var targetPlayer = getPlayerById(runtimeApi, targetId);
    var nextPacks = getVvPositionPacks(runtimeApi, targetId).filter(function(pack) {
      return !(pack && pack.ownerId === skill.ownerId);
    });

    nextPacks.push({
      targetId: targetId,
      ownerId: skill.ownerId,
      ownerName: skill.ownerName,
      baselineTargetChips: Math.max(0, Number(targetPlayer && targetPlayer.chips || 0)),
      baselineTableChips: getActiveTableChipTotal(runtimeApi),
      bubble_fortune: packPower,
      bubble_chaos: packPower,
      bubble_mana: packPower,
      entrySize: requestedTier,
      tier: requestedTier,
      direction: requestedDirection,
      createdPhase: payload.phase || null,
      icon: VV_MARK_ICON
    });
    var nextEntrySize = 0;
    for (var pi = 0; pi < nextPacks.length; pi++) {
      var nextPack = nextPacks[pi] || {};
      nextEntrySize += Math.max(1, Number(nextPack.entrySize != null ? nextPack.entrySize : (nextPack.tier != null ? nextPack.tier : 1)) || 1);
    }
    ledger.setAsset(targetId, VV_POSITION_KEY, nextPacks.length, {
      positions: nextPacks,
      entrySize: nextEntrySize,
      icon: VV_MARK_ICON
    });
    if (manaPool) {
      setManaCurrent(runtimeApi, targetId, manaPool.current + packPower, 'vv_clairvoyance_position');
    }
    syncVvTargetAssets(runtimeApi, targetId);
    syncVvBubbleMarks(runtimeApi);
  }

  function liquidateVvTarget(runtimeApi, casterId, casterName, target) {
    var ledger = getLedger(runtimeApi);
    if (!ledger || !target) return null;
    var skillSystem = getSkillSystem(runtimeApi);

    var packs = getVvPositionPacks(runtimeApi, target.id).filter(function(pack) {
      return pack && pack.ownerId === casterId;
    });
    if (!packs.length) {
      return {
        targetId: target.id,
        targetName: target.name || null,
        packCount: 0,
        gross: 0,
        recoveredMana: 0,
        drainedMana: 0,
        selfFortune: 0,
        targetFortuneBurst: 0,
        targetChaosBurst: 0,
        baselineShare: 0,
        currentShare: 0
      };
    }

    var total = 0;
    var recoveredMana = 0;
    var drainMana = 0;
    var selfFortune = 0;
    var targetFortuneBurst = 0;
    var targetChaosBurst = 0;
    var baselineShare = 0;
    var currentShare = 0;
    var packDetails = [];
    var casterManaBefore = null;
    var casterManaAfter = null;
    var targetManaBefore = null;
    var targetManaAfter = null;

    for (var i = 0; i < packs.length; i++) {
      var pack = packs[i];
      var state = getVvDeviationState(runtimeApi, pack, target.id);
      var bubbleFortune = Math.max(0, Number(pack.bubble_fortune || 0));
      var bubbleChaos = Math.max(0, Number(pack.bubble_chaos || 0));
      var bubbleMana = Math.max(0, Number(pack.bubble_mana || 0));
      var fortuneBurst = 0;
      var chaosBurst = 0;
      var recoveredManaPart = 0;
      var drainManaPart = 0;
      baselineShare += Math.max(0, Number(state.baselineShare || 0));
      currentShare += Math.max(0, Number(state.currentShare || 0));

      if (state.level <= 0 || state.direction === 'flat') {
        recoveredManaPart += Math.ceil(bubbleMana * 0.85);
        fortuneBurst += bubbleFortune;
        chaosBurst += bubbleChaos;
      } else if (state.direction === pack.direction) {
        if (state.direction === 'bullish') {
          chaosBurst += bubbleChaos + Math.ceil(bubbleFortune * (state.level === 1 ? 1 : (state.level === 2 ? 1.33 : 1.66)));
          recoveredManaPart += Math.ceil(bubbleMana * (state.level === 1 ? 1.25 : (state.level === 2 ? 1.5 : 1.75)));
          drainManaPart += Math.ceil(bubbleMana * (state.level === 1 ? 0.25 : (state.level === 2 ? 0.5 : 0.75)));
        } else {
          var fortuneRecover = Math.ceil(bubbleFortune * (state.level === 1 ? 1 : (state.level === 2 ? 1.25 : 1.5)));
          queueRuntimeForce(runtimeApi, {
            ownerId: casterId,
            ownerName: casterName,
            type: 'fortune',
            power: fortuneRecover,
            effectivePower: fortuneRecover,
            tier: 0,
            attr: 'moirai',
            activation: 'active',
            source: 'bubble_liquidation',
            skillKey: 'bubble_liquidation',
            _persistAcrossHandStart: true
          }, {
            reason: 'bubble_liquidation',
            ownerId: casterId,
            targetId: target.id
          });
          selfFortune += fortuneRecover;
          total += fortuneRecover;
          chaosBurst += Math.ceil(bubbleChaos * (state.level === 1 ? 0.5 : (state.level === 2 ? 0.75 : 1)));
          recoveredManaPart += Math.ceil(bubbleMana * (state.level === 1 ? 1.25 : (state.level === 2 ? 1.5 : 1.75)));
        }
      } else {
        recoveredManaPart += Math.ceil(bubbleMana * 0.6);
        fortuneBurst += Math.ceil(bubbleFortune * 0.5);
        chaosBurst += Math.ceil(bubbleChaos * 0.5);
      }

      recoveredMana += recoveredManaPart;
      drainMana += drainManaPart;

      if (fortuneBurst > 0) {
        queueRuntimeForce(runtimeApi, {
          ownerId: target.id,
          ownerName: target.name,
          type: 'fortune',
          power: fortuneBurst,
          effectivePower: fortuneBurst,
          tier: 0,
          attr: 'moirai',
          activation: 'active',
          source: 'bubble_liquidation',
          skillKey: 'bubble_liquidation',
          _persistAcrossHandStart: true
        }, {
          reason: 'bubble_liquidation',
          ownerId: casterId,
          targetId: target.id
        });
        targetFortuneBurst += fortuneBurst;
        total += fortuneBurst;
      }

      if (chaosBurst > 0) {
        queueRuntimeForce(runtimeApi, {
          ownerId: casterId,
          ownerName: casterName,
          type: 'curse',
          targetId: target.id,
          power: chaosBurst,
          effectivePower: chaosBurst,
          tier: 0,
          attr: 'chaos',
          activation: 'active',
          source: 'bubble_liquidation',
          skillKey: 'bubble_liquidation',
          _persistAcrossHandStart: true
        }, {
          reason: 'bubble_liquidation',
          ownerId: casterId,
          targetId: target.id
        });
        targetChaosBurst += chaosBurst;
        total += chaosBurst;
      }

      packDetails.push({
        tier: Math.max(1, Number(pack.tier != null ? pack.tier : pack.entrySize || 1) || 1),
        direction: pack.direction === 'bearish' ? 'bearish' : 'bullish',
        level: Math.max(0, Number(state.level || 0)),
        stateDirection: state.direction || 'flat',
        bubbleFortune: bubbleFortune,
        bubbleChaos: bubbleChaos,
        bubbleMana: bubbleMana,
        fortuneBurst: fortuneBurst,
        chaosBurst: chaosBurst,
        baselineShare: Math.max(0, Number(state.baselineShare || 0)),
        currentShare: Math.max(0, Number(state.currentShare || 0))
      });
    }

    if (recoveredMana > 0) {
      var casterMana = getPlayerManaPool(runtimeApi, casterId);
      if (casterMana) {
        casterManaBefore = Math.max(0, Number(casterMana.current || 0));
        if (skillSystem && typeof skillSystem.regenMana === 'function') {
          skillSystem.regenMana(casterId, recoveredMana, 'vv_liquidation_reclaim');
        } else {
          setManaCurrent(runtimeApi, casterId, casterMana.current + recoveredMana, 'vv_liquidation_reclaim');
        }
        casterManaAfter = Math.max(0, Number(casterMana.current || 0));
        recoveredMana = Math.max(0, casterManaAfter - casterManaBefore);
      }
      total += recoveredMana;
    }
    if (drainMana > 0) {
      var targetMana = getPlayerManaPool(runtimeApi, target.id);
      if (targetMana) {
        targetManaBefore = Math.max(0, Number(targetMana.current || 0));
        if (skillSystem && typeof skillSystem.loseMana === 'function') {
          drainMana = Math.max(0, Number(skillSystem.loseMana(target.id, drainMana, 'vv_liquidation_drain') || 0));
        } else {
          setManaCurrent(runtimeApi, target.id, targetMana.current - drainMana, 'vv_liquidation_drain');
          drainMana = Math.max(0, targetManaBefore - Math.max(0, Number(targetMana.current || 0)));
        }
        targetManaAfter = Math.max(0, Number(targetMana.current || 0));
      }
    }

    var remainingPacks = getVvPositionPacks(runtimeApi, target.id).filter(function(pack) {
      return !(pack && pack.ownerId === casterId);
    });
    if (remainingPacks.length > 0) {
      ledger.setAsset(target.id, VV_POSITION_KEY, remainingPacks.length, {
        positions: remainingPacks,
        icon: VV_MARK_ICON
      });
    } else {
      ledger.clearAsset(target.id, VV_POSITION_KEY);
    }
    syncVvTargetAssets(runtimeApi, target.id);
    return {
      targetId: target.id,
      targetName: target.name || null,
      packCount: packs.length,
      gross: total,
      recoveredMana: recoveredMana,
      drainedMana: drainMana,
      selfFortune: selfFortune,
      targetFortuneBurst: targetFortuneBurst,
      targetChaosBurst: targetChaosBurst,
      baselineShare: baselineShare,
      currentShare: currentShare,
      casterManaBefore: casterManaBefore,
      casterManaAfter: casterManaAfter,
      targetManaBefore: targetManaBefore,
      targetManaAfter: targetManaAfter,
      packDetails: packDetails
    };
  }

  function handleVvLiquidation(payload, runtimeApi) {
    if (!payload || !payload.skill) return;
    var casterId = payload.skill.ownerId;
    var casterName = payload.skill.ownerName;
    var skillSystem = getSkillSystem(runtimeApi);
    var targetId = payload.targetId != null ? Number(payload.targetId)
      : payload.options && payload.options.targetId != null ? Number(payload.options.targetId)
      : null;
    var targets = targetId != null
      ? [getPlayerById(runtimeApi, targetId)].filter(Boolean)
      : getActiveOpponents(runtimeApi, casterId);
    var gross = 0;

    if (!targets.length && skillSystem && typeof skillSystem.emit === 'function') {
      skillSystem.emit('vv:liquidation_resolved', {
        ownerId: casterId,
        ownerName: casterName,
        targetId: targetId,
        targetName: null,
        packCount: 0,
        gross: 0,
        recoveredMana: 0,
        drainedMana: 0,
        selfFortune: 0,
        targetFortuneBurst: 0,
        targetChaosBurst: 0,
        baselineShare: 0,
        currentShare: 0
      });
      return;
    }

    for (var i = 0; i < targets.length; i++) {
      var result = liquidateVvTarget(runtimeApi, casterId, casterName, targets[i]);
      if (!result) continue;
      gross += Math.max(0, Number(result.gross || 0));
      if (skillSystem && typeof skillSystem.emit === 'function') {
        if (typeof skillSystem._log === 'function') {
          skillSystem._log('VV_LIQUIDATION_DEBUG', {
            ownerId: casterId,
            ownerName: casterName,
            targetId: result.targetId,
            targetName: result.targetName,
            packCount: result.packCount,
            gross: result.gross,
            recoveredMana: result.recoveredMana,
            drainedMana: result.drainedMana,
            selfFortune: result.selfFortune,
            targetFortuneBurst: result.targetFortuneBurst,
            targetChaosBurst: result.targetChaosBurst,
            baselineShare: result.baselineShare,
            currentShare: result.currentShare,
            casterManaBefore: result.casterManaBefore,
            casterManaAfter: result.casterManaAfter,
            targetManaBefore: result.targetManaBefore,
            targetManaAfter: result.targetManaAfter,
            packDetails: result.packDetails
          });
        }
        skillSystem.emit('vv:liquidation_resolved', {
          ownerId: casterId,
          ownerName: casterName,
          targetId: result.targetId,
          targetName: result.targetName,
          packCount: result.packCount,
          gross: result.gross,
          recoveredMana: result.recoveredMana,
          drainedMana: result.drainedMana,
          selfFortune: result.selfFortune,
          targetFortuneBurst: result.targetFortuneBurst,
          targetChaosBurst: result.targetChaosBurst,
          baselineShare: result.baselineShare,
          currentShare: result.currentShare,
          casterManaBefore: result.casterManaBefore,
          casterManaAfter: result.casterManaAfter,
          targetManaBefore: result.targetManaBefore,
          targetManaAfter: result.targetManaAfter,
          packDetails: result.packDetails
        });
      }
    }

    syncVvBubbleMarks(runtimeApi);
  }

  function selectSiaSkillTarget(roleCtx, fallback) {
    var skill = roleCtx.skill || {};
    var target = null;

    if (skill.effect === 'cooler') {
      target = pickRoleTarget(roleCtx, function(player) {
        return !hasStatusMark(roleCtx, player.id, 'cooler_mark');
      }) || pickRoleTarget(roleCtx);
    } else if (skill.effect === 'skill_seal') {
      target = pickRoleTarget(roleCtx, function(player) {
        return hasStatusMark(roleCtx, player.id, 'cooler_mark') &&
          !hasStatusMark(roleCtx, player.id, 'sealed');
      }) || pickRoleTarget(roleCtx, function(player) {
        return !hasStatusMark(roleCtx, player.id, 'sealed');
      });
    } else if (skill.effect === 'curse') {
      target = pickRoleTarget(roleCtx, function(player) {
        return hasStatusMark(roleCtx, player.id, 'cooler_mark');
      }) || pickRoleTarget(roleCtx);
    }

    if (target && target.id != null) return target.id;
    return typeof fallback === 'function' ? fallback(roleCtx) : null;
  }

  function augmentSiaSkillOptions(roleCtx, fallback) {
    var skill = roleCtx.skill || {};
    var next = typeof fallback === 'function' ? fallback(roleCtx) : {};
    var options = next && typeof next === 'object' ? Object.assign({}, next) : {};
    var comboStage = 'neutral';

    if (skill.effect === 'cooler') {
      comboStage = 'mark';
    } else if (skill.effect === 'skill_seal') {
      comboStage = roleCtx.primaryTargetMarked ? 'lock_marked' : 'lock_raw';
    } else if (skill.effect === 'curse') {
      comboStage = roleCtx.primaryTargetMarked
        ? (roleCtx.primaryTargetSealed ? 'execute_marked_sealed' : 'execute_marked')
        : 'raw_curse';
    }

    options.comboStage = comboStage;
    options.rolePlan = 'sia_execution_chain';
    return options;
  }

  function augmentRinoSkillOptions(roleCtx, fallback) {
    var skill = roleCtx.skill || {};
    var next = typeof fallback === 'function' ? fallback(roleCtx) : {};
    var options = next && typeof next === 'object' ? Object.assign({}, next) : {};
    var owner = roleCtx.owner || {};
    var chips = Math.max(1, Number(owner.chips || 0));
    var commit = Math.min(1, Number(owner.totalBet || 0) / chips);

    if (skill.effect === 'heart_read') {
      options.scoutPressure = getInfoPressure(roleCtx);
      options.scoutPass = hasRecentScout(roleCtx) ? 'refresh' : 'first_look';
    } else if (skill.effect === 'royal_decree') {
      options.commitRatio = commit;
      options.window = roleCtx.ctx && roleCtx.ctx.phase;
      options.rolePlan = 'rino_burst_window';
    }

    return options;
  }

  function augmentVvSkillOptions(roleCtx, fallback, runtimeApi) {
    var skill = roleCtx.skill || {};
    var next = typeof fallback === 'function' ? fallback(roleCtx) : {};
    var options = next && typeof next === 'object' ? Object.assign({}, next) : {};

    if (skill.effect === 'clairvoyance') {
      var buildPlan = chooseVvClairvoyancePlan(roleCtx, runtimeApi);
      if (buildPlan.targetId != null) {
        options.targetId = buildPlan.targetId;
        options.targetForecast = {
          riseScore: buildPlan.riseScore,
          fallScore: buildPlan.fallScore,
          edge: buildPlan.edge,
          direction: buildPlan.direction,
          strength: buildPlan.strength
        };
        options.targetState = buildPlan.targetState;
      }
      options.tier = buildPlan.tier;
      options.direction = buildPlan.direction;
      options.rolePlan = 'vv_open_position_forecast';
    } else if (skill.effect === 'bubble_liquidation') {
      var liquidationPlan = chooseVvLiquidationTarget(roleCtx, runtimeApi);
      if (liquidationPlan.targetId != null) {
        options.targetId = liquidationPlan.targetId;
        options.targetState = liquidationPlan.targetState;
      }
      options.rolePlan = 'vv_liquidate_forecast';
    }

    return options;
  }

  function decideVvSkill(roleCtx, fallback, runtimeApi) {
    var base = fallback(roleCtx);
    var skill = roleCtx.skill || {};
    var phase = String(roleCtx.ctx && roleCtx.ctx.phase || '').toLowerCase();

    if (skill.effect === 'clairvoyance') {
      var buildPlan = chooseVvClairvoyancePlan(roleCtx, runtimeApi);
      logVvAiPlan(runtimeApi, 'VV_AI_CLAIRVOYANCE_PLAN', roleCtx, buildPlan);
      if (phase === 'river') return false;
      return !!buildPlan.shouldUse;
    }

    if (skill.effect === 'bubble_liquidation') {
      var liquidationPlan = chooseVvLiquidationTarget(roleCtx, runtimeApi);
      logVvAiPlan(runtimeApi, 'VV_AI_LIQUIDATION_PLAN', roleCtx, liquidationPlan);
      if (phase === 'preflop') return false;
      return !!(liquidationPlan.shouldUse || (base && liquidationPlan.deviationLevel >= 2));
    }

    return base;
  }

  function createVvProfileHandler(runtimeApi) {
    return {
      shouldUseSkill: function(roleCtx, fallback) {
        return decideVvSkill(roleCtx, fallback, runtimeApi);
      },
      selectSkillTarget: function(roleCtx, fallback) {
        var skill = roleCtx.skill || {};
        if (skill.effect === 'clairvoyance' || skill.effect === 'bubble_liquidation') {
          var plan = skill.effect === 'clairvoyance'
            ? chooseVvClairvoyancePlan(roleCtx, runtimeApi)
            : chooseVvLiquidationTarget(roleCtx, runtimeApi);
          if (plan && plan.targetId != null) return plan.targetId;
        }
        return typeof fallback === 'function' ? fallback(roleCtx) : null;
      },
      augmentSkillOptions: function(roleCtx, fallback) {
        return augmentVvSkillOptions(roleCtx, fallback, runtimeApi);
      }
    };
  }

  function getCotaAiState(runtimeApi, ownerId) {
    var cards = getCotaCards(runtimeApi, ownerId);
    var counts = getCotaFamilyCounts(cards);
    var pointTotals = { good: 0, bad: 0, misc: 0 };
    var manaTotals = { good: 0, bad: 0, misc: 0 };

    for (var i = 0; i < cards.length; i++) {
      var card = cards[i] || {};
      var type = normalizeCotaCardType(card.cardType);
      if (!type || pointTotals[type] == null) continue;
      pointTotals[type] += Math.max(0, Number(card.baseValue || 0));
      manaTotals[type] += Math.max(0, Number(card.settleManaCost || 0));
    }

    var manaPool = getPlayerManaPool(runtimeApi, ownerId);
    var manaCurrent = manaPool ? Math.max(0, Number(manaPool.current || 0)) : 0;
    var manaMax = manaPool ? Math.max(1, Number(manaPool.max || manaCurrent || 1)) : Math.max(1, manaCurrent || 1);
    var slotCount = getCotaSlotCount(runtimeApi, ownerId);

    return {
      cards: cards,
      counts: counts,
      pointTotals: pointTotals,
      manaTotals: manaTotals,
      totalCards: cards.length,
      slotCount: slotCount,
      emptySlots: Math.max(0, slotCount - cards.length),
      totalPointValue: pointTotals.good + pointTotals.bad + pointTotals.misc,
      totalManaCost: manaTotals.good + manaTotals.bad + manaTotals.misc,
      faultState: isCotaFaultState(runtimeApi, ownerId),
      bustRate: getCotaBustRate(runtimeApi, ownerId),
      selfCursePressure: getCotaSelfCursePressure(runtimeApi, ownerId),
      manaCurrent: manaCurrent,
      manaMax: manaMax,
      manaRatio: manaCurrent / Math.max(1, manaMax),
      familyBaseValues: {
        good: getCotaFamilyBaseValue(runtimeApi, ownerId, 'good'),
        bad: getCotaFamilyBaseValue(runtimeApi, ownerId, 'bad'),
        misc: getCotaFamilyBaseValue(runtimeApi, ownerId, 'misc')
      }
    };
  }

  function chooseCotaDealCardType(state) {
    if (!state || state.emptySlots <= 0) return null;
    if (state.counts.misc <= 0) return 'misc';
    if (state.counts.good <= 0) return 'good';
    if (state.counts.bad <= 0) return 'bad';

    if (state.selfCursePressure >= 10 && state.counts.bad < 2) return 'bad';
    if (state.manaRatio < 0.42 || state.totalManaCost >= Math.max(8, state.manaCurrent * 0.55)) {
      return state.counts.misc < 2 ? 'misc' : (state.counts.good <= state.counts.bad ? 'good' : 'bad');
    }
    if (state.pointTotals.good <= state.pointTotals.bad && state.counts.good <= 2) return 'good';
    if (state.counts.bad <= 1 || state.familyBaseValues.bad < state.familyBaseValues.good) return 'bad';
    if (!state.faultState && state.counts.misc < 2) return 'misc';
    return state.counts.good <= state.counts.bad ? 'good' : 'bad';
  }

  function isCotaAiLineOnline(state) {
    if (!state) return false;
    return state.counts.good > 0 && state.counts.bad > 0 && state.counts.misc > 0;
  }

  function shouldUseCotaDealCard(roleCtx, runtimeApi) {
    var phase = String(roleCtx.ctx && roleCtx.ctx.phase || '').toLowerCase();
    if (phase === 'river') return false;
    var owner = roleCtx.owner || {};
    var state = getCotaAiState(runtimeApi, owner.id);
    if (state.emptySlots <= 0) return false;

    var cardType = chooseCotaDealCardType(state);
    if (!cardType) return false;
    var lineOnline = isCotaAiLineOnline(state);
    var effectiveFullCount = Math.min(Math.max(1, state.slotCount), 3);
    var arrangeMode = chooseCotaArrangeMode(state);
    if (lineOnline && state.totalCards >= effectiveFullCount && arrangeMode === 'gather') return false;
    if (lineOnline && state.totalCards >= 3 && state.totalManaCost >= Math.max(8, state.manaCurrent * 0.42)) return false;
    if (lineOnline && state.totalCards >= 4) return false;
    if (state.totalCards <= 0) return true;
    if (state.counts.misc <= 0) return true;
    if (state.totalCards < 2) return true;
    if (phase === 'preflop' || phase === 'flop') {
      if (state.manaRatio >= 0.32) return true;
      return cardType === 'misc' && state.manaRatio >= 0.24;
    }
    if (state.totalManaCost >= Math.max(10, state.manaCurrent * 0.65)) {
      return cardType === 'misc' && state.manaRatio >= 0.36;
    }
    return state.manaRatio >= 0.45;
  }

  function chooseCotaArrangeMode(state) {
    if (!state || state.totalCards <= 0) return null;

    var lineOnline = isCotaAiLineOnline(state);
    var effectiveFullCount = Math.min(Math.max(1, state.slotCount), 3);
    var lineReadyToRoll = lineOnline && state.totalCards >= effectiveFullCount;
    var canGatherWithoutOverflow = state.totalCards <= Math.max(0, state.slotCount - 1);
    var gatherOverflowCount = Math.max(0, state.totalCards - Math.max(0, state.slotCount - 1));
    if (state.totalManaCost >= Math.max(8, state.manaCurrent * 0.52)) return 'spread';
    if (state.manaRatio < 0.42) return 'spread';
    if (state.faultState && state.bustRate >= 0.25 && state.totalManaCost >= Math.max(6, state.manaCurrent * 0.34)) return 'spread';
    if (lineReadyToRoll &&
        state.manaRatio >= 0.48 &&
        state.totalManaCost <= Math.max(10, state.manaCurrent * 0.38)) {
      return 'gather';
    }
    if (lineOnline &&
        state.totalCards >= 3 &&
        state.manaRatio >= 0.56 &&
        state.totalPointValue < 48) {
      return 'gather';
    }
    if (canGatherWithoutOverflow &&
        state.manaRatio >= 0.46 &&
        state.totalManaCost <= Math.max(8, state.manaCurrent * 0.42) &&
        (state.totalPointValue < 40 || state.totalCards <= 1 || lineOnline)) {
      return 'gather';
    }
    if (gatherOverflowCount === 1 &&
        state.slotCount >= 3 &&
        state.manaRatio >= 0.62 &&
        state.bustRate <= 0.15 &&
        state.totalPointValue <= 42) {
      return 'gather';
    }
    if (state.emptySlots === 0 && state.totalCards >= state.slotCount &&
        (state.manaRatio < 0.62 || state.counts.misc > 0 || state.totalManaCost >= Math.max(6, state.manaCurrent * 0.38))) {
      return 'spread';
    }
    if (canGatherWithoutOverflow && state.manaRatio >= 0.65 && state.totalCards < 3) return 'gather';
    if (state.emptySlots >= 2 && state.totalCards <= 1 && state.manaRatio >= 0.45) return 'gather';
    if (state.slotCount > 3 && lineOnline && state.totalManaCost >= Math.max(8, state.manaCurrent * 0.34)) return 'spread';
    if (state.emptySlots === 0 && state.totalCards >= state.slotCount && state.slotCount < 4 && state.manaRatio < 0.55) return 'spread';
    return null;
  }

  function createCotaProfileHandler(runtimeApi) {
    function decideCotaSkill(roleCtx, fallback) {
      var skill = roleCtx.skill || {};
      if (skill.effect === 'deal_card') {
        return shouldUseCotaDealCard(roleCtx, runtimeApi);
      }
      if (skill.effect === 'gather_or_spread') {
        var owner = roleCtx.owner || {};
        return chooseCotaArrangeMode(getCotaAiState(runtimeApi, owner.id)) != null;
      }
      return fallback(roleCtx);
    }

    return {
      shouldUseSkill: function(roleCtx, fallback) {
        return decideCotaSkill(roleCtx, fallback);
      },
      augmentSkillOptions: function(roleCtx, fallback) {
        var next = typeof fallback === 'function' ? fallback(roleCtx) : {};
        var options = next && typeof next === 'object' ? Object.assign({}, next) : {};
        var owner = roleCtx.owner || {};
        var state = getCotaAiState(runtimeApi, owner.id);
        var skill = roleCtx.skill || {};

        if (skill.effect === 'deal_card') {
          options.cardType = chooseCotaDealCardType(state);
          options.rolePlan = 'cota_balance_deal';
        } else if (skill.effect === 'gather_or_spread') {
          options.mode = chooseCotaArrangeMode(state);
          options.rolePlan = options.mode === 'spread'
            ? 'cota_pressure_release'
            : options.mode === 'gather'
              ? 'cota_power_roll'
              : 'cota_hold';
        }

        return options;
      }
    };
  }

  function decideSiaSkill(roleCtx, fallback) {
    var base = fallback(roleCtx);
    var diff = roleCtx.difficulty;
    var difficultyProfile = String(roleCtx.difficultyProfile || '').toLowerCase();
    var phase = roleCtx.ctx.phase;
    var owner = roleCtx.owner || {};
    var chips = Math.max(1, owner.chips || 1);
    var commit = Math.min(1, (owner.totalBet || 0) / chips);
    var skill = roleCtx.skill;
    var bossMode = difficultyProfile === 'sia' || roleCtx.roleVariant === 'boss' || diff === 'boss';
    var coolerReady = hasReadyOwnerSkill(roleCtx, 'cooler');
    var sealReady = hasReadyOwnerSkill(roleCtx, 'skill_seal');
    var scriptedStage = phase === 'preflop' || phase === 'flop' || phase === 'turn';
    var ownerAlreadyCursed = hasOwnerPendingEffect(roleCtx, 'curse');
    var decision = base;

    if (skill.effect === 'cooler') {
      if (roleCtx.primaryTargetMarked) {
        decision = false;
      } else if (scriptedStage) {
        if (bossMode) {
          decision = base || Math.random() < scriptedChance(phase, {
            preflop: 0.58,
            flop: 0.72,
            turn: 0.60,
            river: 0.12
          });
        } else if (diff === 'pro') {
          decision = base || Math.random() < (0.18 + commit * 0.14);
        }
      }
    } else if (skill.effect === 'skill_seal') {
      if (roleCtx.primaryTargetSealed) {
        decision = false;
      } else if (!roleCtx.primaryTargetMarked) {
        if (scriptedStage && coolerReady) {
          decision = false;
        } else if (bossMode) {
          decision = phase === 'river' ? Math.random() < 0.12 : false;
        } else if (diff === 'pro') {
          decision = false;
        } else {
          decision = false;
        }
      } else if (roleCtx.primaryTargetMarked) {
        if (bossMode) {
          decision = base || Math.random() < scriptedChance(phase, {
            preflop: 0.46,
            flop: 0.72,
            turn: 0.62,
            river: 0.18
          });
        } else if (diff === 'pro') {
          decision = Math.random() < (phase === 'turn' ? 0.58 : 0.42);
        } else {
          decision = base;
        }
      }
    } else if (skill.effect === 'curse') {
      if (ownerAlreadyCursed) {
        decision = false;
      } else if (!roleCtx.primaryTargetMarked && coolerReady && scriptedStage && bossMode) {
        decision = false;
      } else if (roleCtx.primaryTargetMarked && !roleCtx.primaryTargetSealed && sealReady && scriptedStage && bossMode) {
        decision = false;
      } else if (roleCtx.primaryTargetMarked) {
        var sealedUp = !!roleCtx.primaryTargetSealed;
        if (skill.skillKey === 'havoc') {
          if (bossMode) {
            decision = base || Math.random() < scriptedChance(phase, {
              preflop: 0.00,
              flop: sealedUp ? 0.48 : 0.22,
              turn: sealedUp ? 0.62 : 0.28,
              river: 0.30
            });
          } else if (diff === 'pro') {
            decision = base || Math.random() < 0.38;
          }
        } else if (skill.skillKey === 'hex') {
          if (bossMode) {
            decision = base || Math.random() < scriptedChance(phase, {
              preflop: 0.00,
              flop: sealedUp ? 0.18 : 0.10,
              turn: sealedUp ? 0.24 : 0.14,
              river: 0.16
            });
          } else if (diff === 'pro') {
            decision = base || Math.random() < 0.18;
          }
        }
      }
    }

    if (bossMode && (skill.effect === 'cooler' || skill.effect === 'skill_seal' || skill.effect === 'curse')) {
      console.log('[SIA_ROLE_AI]', {
        roleId: roleCtx.roleId,
        roleVariant: roleCtx.roleVariant,
        difficultyProfile: difficultyProfile,
        phase: phase,
        key: skill.skillKey,
        effect: skill.effect,
        marked: !!roleCtx.primaryTargetMarked,
        sealed: !!roleCtx.primaryTargetSealed,
        base: !!base,
        decision: !!decision
      });
    }

    return decision;
  }

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
})(window);
