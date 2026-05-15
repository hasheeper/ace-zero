/**
 * Runtime Module: BuiltinRoleModules / KUZUHA role AI
 * Split from the legacy builtin-role-modules.js without behavior changes.
 */
(function(global) {
  'use strict';

  var Builtin = global.AceBuiltinRuntime = global.AceBuiltinRuntime || {};

  function scoreThreatTarget() { return Builtin.scoreThreatTarget.apply(null, arguments); }
  function getKuzuhaDebtRotValue() { return Builtin.getKuzuhaDebtRotValue.apply(null, arguments); }

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

  Object.assign(Builtin, {
    "createKuzuhaRoleHandler": createKuzuhaRoleHandler
  });
})(window);
