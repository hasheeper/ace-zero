/**
 * Runtime Module: BuiltinRoleModules / VV profile AI
 * Split from the legacy builtin-role-modules.js without behavior changes.
 */
(function(global) {
  'use strict';

  var Builtin = global.AceBuiltinRuntime = global.AceBuiltinRuntime || {};

  function chooseVvClairvoyancePlan() { return Builtin.chooseVvClairvoyancePlan.apply(null, arguments); }
  function chooseVvLiquidationTarget() { return Builtin.chooseVvLiquidationTarget.apply(null, arguments); }
  function logVvAiPlan() { return Builtin.logVvAiPlan.apply(null, arguments); }

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
      options.entrySize = buildPlan.entrySize || 1;
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

  Object.assign(Builtin, {
    "augmentVvSkillOptions": augmentVvSkillOptions,
    "decideVvSkill": decideVvSkill,
    "createVvProfileHandler": createVvProfileHandler
  });
})(window);
