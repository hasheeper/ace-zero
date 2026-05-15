/**
 * Runtime Module: RoleRuntime
 * 角色：角色身份与变体解析器。
 *
 * 职责：
 * - 统一提取角色显示名
 * - 统一推导 `roleId / roleVariant`
 * - 避免在不同文件重复解析 `_BOSS / _REAR` 等命名规则
 *
 * 暴露：
 * - `window.RoleRuntime`
 *
 * 边界：
 * - 只做身份解析
 * - 不做 AI、技能、事件或资产逻辑
 */
(function(global) {
  'use strict';

  function charName(char) {
    if (char && char.vanguard && char.vanguard.name) return char.vanguard.name;
    return (char && char.name) || '???';
  }

  function deriveRoleMeta(input) {
    if (!input) return { roleId: 'UNKNOWN', roleVariant: 'base' };
    if (input.roleId) {
      return {
        roleId: input.roleId,
        roleVariant: input.roleVariant || 'base'
      };
    }

    var raw = String(input.name || input.ownerName || input).trim();
    if (!raw) return { roleId: 'UNKNOWN', roleVariant: 'base' };
    if (/_BOSS_REAR$/i.test(raw)) return { roleId: raw.replace(/_BOSS_REAR$/i, ''), roleVariant: 'boss_rear' };
    if (/_BOSS$/i.test(raw)) return { roleId: raw.replace(/_BOSS$/i, ''), roleVariant: 'boss' };
    if (/_REAR$/i.test(raw)) return { roleId: raw.replace(/_REAR$/i, ''), roleVariant: 'rear' };
    return { roleId: raw, roleVariant: 'base' };
  }

  function charRoleMeta(char) {
    if (!char) return deriveRoleMeta(null);
    if (char.roleId) {
      return deriveRoleMeta({
        roleId: char.roleId,
        roleVariant: char.roleVariant || 'base'
      });
    }
    if (char.vanguard && char.vanguard.roleId) {
      return deriveRoleMeta({
        roleId: char.vanguard.roleId,
        roleVariant: char.vanguard.roleVariant || char.roleVariant || 'base'
      });
    }
    return deriveRoleMeta(charName(char));
  }

  global.RoleRuntime = Object.assign({}, global.RoleRuntime || {}, {
    charName: charName,
    deriveRoleMeta: deriveRoleMeta,
    charRoleMeta: charRoleMeta
  });
})(window);
