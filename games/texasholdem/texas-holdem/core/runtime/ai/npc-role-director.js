/**
 * Runtime Module: NpcRoleDirector
 * 角色：NPC 角色行为导演。
 *
 * 职责：
 * - 为通用 SkillAI 提供角色层的二次决策入口
 * - 统一构建 `roleCtx`，整理 roleId、目标、标记状态等上下文
 * - 将角色专属技能倾向与通用 AI 解耦
 *
 * 暴露：
 * - `window.NpcRoleDirector`
 *
 * 边界：
 * - 不直接决定通用技能逻辑
 * - 只在角色需要“额外偏好”时介入
 */
(function(global) {
  'use strict';

  var RoleRuntime = global.RoleRuntime || {};
  var deriveRoleMeta = RoleRuntime.deriveRoleMeta || function() {
    return { roleId: 'UNKNOWN', roleVariant: 'base' };
  };

  var NpcRoleDirector = {
    roles: Object.create(null),
    profiles: Object.create(null),

    registerRole: function(roleId, handler) {
      if (!roleId || !handler) return;
      this.roles[roleId] = handler;
    },

    registerProfile: function(profileId, handler) {
      if (!profileId || !handler) return;
      this.profiles[String(profileId).toLowerCase()] = handler;
    },

    _getHandlerChain: function(roleCtx) {
      var handlers = [];
      var profileKey = String(roleCtx.difficultyProfile || '').toLowerCase();
      var profileHandler = this.profiles[profileKey];
      var roleHandler = this.roles[roleCtx.roleId];

      if (profileHandler) handlers.push({ type: 'profile', key: profileKey, handler: profileHandler });
      if (roleHandler) handlers.push({ type: 'role', key: roleCtx.roleId, handler: roleHandler });
      return handlers;
    },

    buildContext: function(input) {
      var ownerMeta = deriveRoleMeta(input.owner);
      var skillMeta = deriveRoleMeta(input.skill);
      var roleId = ownerMeta.roleId !== 'UNKNOWN' ? ownerMeta.roleId : skillMeta.roleId;
      var roleVariant = ownerMeta.roleVariant !== 'base' ? ownerMeta.roleVariant : skillMeta.roleVariant;
      var ownerProfile = (input.owner && input.owner.difficultyProfile)
        || (input.owner && input.owner.ai && input.owner.ai.difficultyProfile)
        || (input.owner && input.owner.difficulty)
        || (input.owner && input.owner.personality && input.owner.personality.difficulty)
        || input.difficulty
        || 'regular';
      var players = input.ctx && input.ctx.players ? input.ctx.players : [];
      var opponents = players.filter(function(p) {
        return p && p.id !== (input.owner && input.owner.id) && !p.folded && p.isActive !== false;
      });
      var allies = players.filter(function(p) {
        return p && p.id === (input.owner && input.owner.id) && !p.folded && p.isActive !== false;
      });
      var primaryTarget = opponents.length ? opponents[0] : null;
      var skillSystem = input.ctx && input.ctx.skillSystem;
      var primaryMarked = !!(primaryTarget && skillSystem && typeof skillSystem.hasStatusMark === 'function' && skillSystem.hasStatusMark(primaryTarget.id, 'cooler_mark'));
      var primarySealed = !!(primaryTarget && skillSystem && typeof skillSystem.hasStatusMark === 'function' && skillSystem.hasStatusMark(primaryTarget.id, 'sealed'));

      return Object.assign({}, input, {
        roleId: roleId,
        roleVariant: roleVariant || 'base',
        difficultyProfile: ownerProfile,
        allies: allies,
        opponents: opponents,
        primaryTarget: primaryTarget,
        primaryTargetMarked: primaryMarked,
        primaryTargetSealed: primarySealed
      });
    },

    _resolveWithHandlers: function(method, input, fallback) {
      var roleCtx = this.buildContext(input);
      var chain = this._getHandlerChain(roleCtx);
      var resolver = typeof fallback === 'function'
        ? function(nextCtx) { return fallback(nextCtx); }
        : function() { return fallback; };
      var finalCtx = roleCtx;

      for (var i = chain.length - 1; i >= 0; i--) {
        (function(entry, previousResolver) {
          resolver = function(nextCtx) {
            finalCtx = nextCtx || finalCtx;
            if (!entry.handler || typeof entry.handler[method] !== 'function') {
              return previousResolver(finalCtx);
            }
            return entry.handler[method](finalCtx, previousResolver);
          };
        })(chain[i], resolver);
      }

      return {
        roleCtx: finalCtx,
        value: resolver(roleCtx)
      };
    },

    shouldUseSkill: function(input, fallback) {
      var resolved = this._resolveWithHandlers('shouldUseSkill', input, fallback);
      var roleCtx = resolved.roleCtx;
      var profileKey = String(roleCtx.difficultyProfile || '').toLowerCase();
      if (profileKey === 'sia' && !this.getProfileHandler(profileKey)) {
        console.warn('[NpcRoleDirector] profile handler missing for sia', {
          roleId: roleCtx.roleId,
          roleVariant: roleCtx.roleVariant,
          difficulty: roleCtx.difficulty,
          difficultyProfile: roleCtx.difficultyProfile,
          skill: roleCtx.skill && roleCtx.skill.skillKey
        });
      }
      return resolved.value;
    },

    selectSkillTarget: function(input, fallback) {
      return this._resolveWithHandlers('selectSkillTarget', input, fallback).value;
    },

    selectProtectTarget: function(input, fallback) {
      return this._resolveWithHandlers('selectProtectTarget', input, fallback).value;
    },

    augmentSkillOptions: function(input, fallback) {
      return this._resolveWithHandlers('augmentSkillOptions', input, fallback).value;
    },

    resolveSkillUseOptions: function(input, fallbacks) {
      fallbacks = fallbacks || {};
      var roleCtx = this.buildContext(input);
      var targetId = this.selectSkillTarget(roleCtx, fallbacks.selectSkillTarget);
      var protectId = this.selectProtectTarget(Object.assign({}, roleCtx, {
        targetId: targetId
      }), fallbacks.selectProtectTarget);
      var options = this.augmentSkillOptions(Object.assign({}, roleCtx, {
        targetId: targetId,
        protectId: protectId
      }), fallbacks.augmentSkillOptions);

      options = options && typeof options === 'object' ? Object.assign({}, options) : {};
      if (targetId != null && options.targetId == null) options.targetId = targetId;
      if (protectId != null && options.protectId == null) options.protectId = protectId;
      return options;
    }
  };

  NpcRoleDirector.getRoleHandler = function(roleId) {
    return this.roles[roleId] || null;
  };

  NpcRoleDirector.unregisterRole = function(roleId) {
    if (!roleId) return;
    delete this.roles[roleId];
  };

  NpcRoleDirector.getProfileHandler = function(profileId) {
    return this.profiles[String(profileId || '').toLowerCase()] || null;
  };

  NpcRoleDirector.unregisterProfile = function(profileId) {
    if (!profileId) return;
    delete this.profiles[String(profileId).toLowerCase()];
  };

  NpcRoleDirector.listRoles = function() {
    return Object.keys(this.roles || {});
  };

  NpcRoleDirector.listProfiles = function() {
    return Object.keys(this.profiles || {});
  };

  global.NpcRoleDirector = NpcRoleDirector;
})(window);
