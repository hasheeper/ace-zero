/**
 * Runtime Module: BuiltinRoleModules / TRIXIE role AI
 * Split from the legacy builtin-role-modules.js without behavior changes.
 */
(function(global) {
  'use strict';

  var Builtin = global.AceBuiltinRuntime = global.AceBuiltinRuntime || {};

  function getActiveOpponents() { return Builtin.getActiveOpponents.apply(null, arguments); }
  function pickRoleTarget() { return Builtin.pickRoleTarget.apply(null, arguments); }
  function isMatchScopedSkillUsed() { return Builtin.isMatchScopedSkillUsed.apply(null, arguments); }
  function getPlayerChipRatio() { return Builtin.getPlayerChipRatio.apply(null, arguments); }
  function getTrixieAssetValue() { return Builtin.getTrixieAssetValue.apply(null, arguments); }

  var TRIXIE_WILD_CARD_KEY = Builtin.TRIXIE_WILD_CARD_KEY;

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

  Object.assign(Builtin, {
    "createTrixieRoleHandler": createTrixieRoleHandler
  });
})(window);
