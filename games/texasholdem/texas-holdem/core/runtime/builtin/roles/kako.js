/**
 * Runtime Module: BuiltinRoleModules / KAKO role AI
 * Split from the legacy builtin-role-modules.js without behavior changes.
 */
(function(global) {
  'use strict';

  var Builtin = global.AceBuiltinRuntime = global.AceBuiltinRuntime || {};

  function getKakoTargetStats() { return Builtin.getKakoTargetStats.apply(null, arguments); }
  function chooseKakoAiRulingType() { return Builtin.chooseKakoAiRulingType.apply(null, arguments); }
  function shouldKakoUseReclassification() { return Builtin.shouldKakoUseReclassification.apply(null, arguments); }
  function shouldKakoUseGeneralRuling() { return Builtin.shouldKakoUseGeneralRuling.apply(null, arguments); }
  function resolveKakoPrimaryTarget() { return Builtin.resolveKakoPrimaryTarget.apply(null, arguments); }

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

  Object.assign(Builtin, {
    "createKakoRoleHandler": createKakoRoleHandler
  });
})(window);
