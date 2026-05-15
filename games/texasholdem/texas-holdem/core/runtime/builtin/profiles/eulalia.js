/**
 * Runtime Module: BuiltinRoleModules / EULALIA profile AI
 * Split from the legacy builtin-role-modules.js without behavior changes.
 */
(function(global) {
  'use strict';

  var Builtin = global.AceBuiltinRuntime = global.AceBuiltinRuntime || {};

  function hasReadyOwnerSkill() { return Builtin.hasReadyOwnerSkill.apply(null, arguments); }
  function scoreThreatTarget() { return Builtin.scoreThreatTarget.apply(null, arguments); }
  function pickRoleTarget() { return Builtin.pickRoleTarget.apply(null, arguments); }
  function isMatchScopedSkillUsed() { return Builtin.isMatchScopedSkillUsed.apply(null, arguments); }
  function getPlayerChipRatio() { return Builtin.getPlayerChipRatio.apply(null, arguments); }
  function getEulaliaAssetValue() { return Builtin.getEulaliaAssetValue.apply(null, arguments); }
  function isEulaliaAbsorbWindowOpen() { return Builtin.isEulaliaAbsorbWindowOpen.apply(null, arguments); }

  var EULALIA_NOMINAL_BURDEN_KEY = Builtin.EULALIA_NOMINAL_BURDEN_KEY;
  var EULALIA_BURDEN_LAYERS_KEY = Builtin.EULALIA_BURDEN_LAYERS_KEY;
  var EULALIA_ABSOLUTION_TOTAL_KEY = Builtin.EULALIA_ABSOLUTION_TOTAL_KEY;
  var EULALIA_BURST_COUNTDOWN_KEY = Builtin.EULALIA_BURST_COUNTDOWN_KEY;

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

  Object.assign(Builtin, {
    "createEulaliaProfileHandler": createEulaliaProfileHandler
  });
})(window);
