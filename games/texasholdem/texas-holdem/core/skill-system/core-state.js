(function (global) {
  'use strict';

  var modules = global.AceSkillSystemModules = global.AceSkillSystemModules || {};
  var EFFECT = modules.EFFECT;

  class SkillSystem {
    constructor() {
      // 所有注册的技能实例
      // key: uniqueId (ownerId + '_' + skillKey)
      // value: { ownerId, ownerName, skillKey, effect, level, activation, manaCost,
      //          active, description, target?, trigger?, cooldown?, currentCooldown? }
      this.skills = new Map();

      // 每个角色的 mana 池。ownerId 仍表示牌桌玩家，manaPoolId 表示主/副手资源池。
      // key: manaPoolId, value: { ownerId, casterSlot, casterRoleId, current, max, regen }
      this.manaPools = new Map();
      this.ownerManaPools = new Map();

      // 反噬状态（按 manaPoolId 独立计数；backlash 保留给 hero 面板读取）
      this.backlash = { active: false, counter: 0 };
      this.backlashStates = new Map();

      // 当前回合已激活的技能队列（单次生效型，发牌后清除）
      this.pendingForces = [];

      // 通用状态标记（按 ownerId 存储）
      // 例：cooler_mark / future debuff / buff icon
      this.statusMarks = new Map();

      // Curse 目标选择回调（由外部注入，解耦 AI 逻辑）
      // 签名: (casterId, players) => targetId
      this.curseTargetFn = null;

      // NPC 技能使用决策回调（由外部注入，解耦 AI 逻辑）
      // 签名: (skill, owner, gameContext, pendingForces, mana) => boolean
      this.skillDecideFn = null;

      // 特质修正回调（由外部注入）
      this.traitCostFn = null;
      this.traitRegenFn = null;

      // AssetDeck is compiled outside of SkillSystem. This class only consumes
      // the resolved modifiers so long-term deck truth stays in MVU/runtime.
      this.assetDeckAdapter = global.AssetDeckAdapter || null;
      this.assetModifiers = null;
      this._assetPassiveState = { handId: 0, used: {} };

      // Hook 事件系统
      this._hooks = {};

      this.on('mana:changed', (payload) => {
        if (!payload || (payload.ownerId == null && payload.manaPoolId == null)) return;
        const current = Number(payload.current);
        if (!Number.isFinite(current)) return;
        const previous = Number.isFinite(Number(payload.previous))
          ? Number(payload.previous)
          : current;
        this._maybeTriggerBacklash(payload.manaPoolId != null ? payload.manaPoolId : payload.ownerId, previous, current, payload.reason || 'mana_changed');
      });

      // 统一运行时总线（由主引擎注入）
      this.runtimeFlow = null;
      this._forceSerial = 0;
      this._activationSerial = 0;

      // 持久资源账本（为复杂角色机制预留）
      this.assetLedger = global.AssetLedger ? new global.AssetLedger({
        emitter: this._emitRuntimeEvent.bind(this)
      }) : null;

      // 全场范围的一次性额度/闸门，不随 onNewHand() 重置。
      this.matchScopedUses = new Map();

      // 每街使用次数限制
      // key: ownerId + '_' + skillKey
      this.streetScopedUses = new Map();

      // 日志回调
      this.onLog = null;
    }
  }

  modules.SkillSystem = SkillSystem;
})(typeof window !== 'undefined' ? window : global);
