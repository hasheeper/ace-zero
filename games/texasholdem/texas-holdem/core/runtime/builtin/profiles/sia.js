/**
 * Runtime Module: BuiltinRoleModules / SIA profile AI
 * Split from the legacy builtin-role-modules.js without behavior changes.
 */
(function(global) {
  'use strict';

  var Builtin = global.AceBuiltinRuntime = global.AceBuiltinRuntime || {};

  function hasReadyOwnerSkill() { return Builtin.hasReadyOwnerSkill.apply(null, arguments); }
  function hasOwnerPendingEffect() { return Builtin.hasOwnerPendingEffect.apply(null, arguments); }
  function scriptedChance() { return Builtin.scriptedChance.apply(null, arguments); }
  function hasStatusMark() { return Builtin.hasStatusMark.apply(null, arguments); }
  function pickRoleTarget() { return Builtin.pickRoleTarget.apply(null, arguments); }

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

  Object.assign(Builtin, {
    "siaProfileHandler": siaProfileHandler,
    "selectSiaSkillTarget": selectSiaSkillTarget,
    "augmentSiaSkillOptions": augmentSiaSkillOptions,
    "decideSiaSkill": decideSiaSkill
  });
})(window);
