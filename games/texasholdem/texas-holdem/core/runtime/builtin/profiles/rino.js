/**
 * Runtime Module: BuiltinRoleModules / RINO profile and role AI
 * Split from the legacy builtin-role-modules.js without behavior changes.
 */
(function(global) {
  'use strict';

  var Builtin = global.AceBuiltinRuntime = global.AceBuiltinRuntime || {};

  function hasRecentScout() { return Builtin.hasRecentScout.apply(null, arguments); }
  function getInfoPressure() { return Builtin.getInfoPressure.apply(null, arguments); }
  function hasEnemyFortunePressure() { return Builtin.hasEnemyFortunePressure.apply(null, arguments); }
  function hasReadyOwnerSkill() { return Builtin.hasReadyOwnerSkill.apply(null, arguments); }

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

  Object.assign(Builtin, {
    "rinoRoleHandler": rinoRoleHandler,
    "augmentRinoSkillOptions": augmentRinoSkillOptions
  });
})(window);
