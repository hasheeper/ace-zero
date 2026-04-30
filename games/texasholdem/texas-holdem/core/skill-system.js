/**
 * Core Module: SkillSystem
 * 角色：技能注册、施放、CD、mana 与状态调度中心。
 *
 * 职责：
 * - 注册所有通用技能与角色专属技能
 * - 管理共享 mana 池、技能冷却、整局使用次数
 * - 驱动玩家施法与 NPC 技能执行
 * - 维护 pending forces、状态标记，并向 RuntimeFlow 透传技能事件
 *
 * 暴露：
 * - `window.SkillSystem`
 *
 * 边界：
 * - 不直接做候选牌打分与命运选牌
 * - 不承载复杂角色模块逻辑，角色扩展应尽量挂到 runtime 层
 */

(function (global) {
  'use strict';

  var RoleRuntime = global.RoleRuntime || {};

  // ========== 常量 ==========

  const ACTIVATION = {
    PASSIVE: 'passive',
    ACTIVE: 'active',
    TOGGLE: 'toggle',
    TRIGGERED: 'triggered'
  };

  // 效果类型常量（从通用技能目录中提取的所有 effect 值）
  const EFFECT = {
    FORTUNE:     'fortune',       // Moirai: 概率偏斜，让自己赢
    CURSE:       'curse',         // Chaos:  概率污蚀，让目标输
    CLARITY:     'clarity',       // Psyche T3: 胜率感知 + 消除敌方 T3/T2 Curse
    REFRACTION:  'refraction',    // Psyche T2: 透视手牌 + 消除敌方 T3/T2 Curse + 50%转化
    REVERSAL:    'reversal',      // Psyche T1: 胜率+透视 + 湮灭所有 Curse(含T1) + 100%转化
    NULL_FIELD:  'null_field',    // Void T3:   阻断侦查
    VOID_SHIELD: 'void_shield',   // Void T2:   Moirai/Chaos 效果减半
    PURGE_ALL:   'purge_all',      // Void T1:   清除所有非 Void 技能
    // --- 角色专属 ---
    ROYAL_DECREE:'royal_decree',   // Rino T0:   超强天命（fortune power=70）
    HEART_READ:  'heart_read',     // Rino Psyche: 读心（信息+消除T3 curse）
    COOLER:      'cooler',         // SIA T2:    冤家牌标记（做局）
    SKILL_SEAL:  'skill_seal',     // SIA T2:    冻结令
    CLAIRVOYANCE:'clairvoyance',   // VV T2:     估价建仓（目标/档位/方向）
    BUBBLE_LIQUIDATION:'bubble_liquidation', // VV T0: 偏离清算（指定目标投资轮）
    MIRACLE:     'miracle',        // POPPY T0:  命大（绝境被动触发）
    LUCKY_FIND:  'lucky_find',     // POPPY T2:  捡到了（街末被动判定）
    // --- Trixie (鬼牌) ---
    RULE_REWRITE:'rule_rewrite',    // Trixie T2: 规则篡改（消耗鬼牌改写为 fortune / curse，后续由 Runtime 面板实现）
    BLIND_BOX:   'blind_box',       // Trixie T0: 盲盒派对（消耗整张鬼牌发动账户篡位，后续由 Runtime 实现）
    // --- Cota (可塔) ---
    DEAL_CARD:   'deal_card',       // Cota T2:  发牌（Runtime 牌列系统）
    GATHER_OR_SPREAD: 'gather_or_spread', // Cota T2: 收牌/铺牌（Runtime 牌槽调度）
    // --- Eulalia (尤拉莉亚) ---
    ABSOLUTION:  'absolution',      // Eulalia T0: 赦免（三街承灾合同，第三街末平分爆出）
    BENEDICTION: 'benediction',     // Eulalia T2: 祝福（对非自身目标施加 fortune，并吸取相关 curse 记为承灾）
    // --- Kako (司伽子) ---
    RECLASSIFICATION:'reclassification', // Kako T2: 改判（发牌前单目标裁定）
    GENERAL_RULING:'general_ruling',     // Kako T1: 总务裁定（发牌前全场统一裁定）
    // --- Kuzuha (久世九叶) ---
    HOUSE_EDGE:  'house_edge',      // Kuzuha T2: 抽水（单体 curse + debt rot）
    DEBT_CALL:   'debt_call',       // Kuzuha T1: 催收（立即结算 debt rot）
    // --- 心理战技能 ---
    PSYCH_PRESSURE: 'psych_pressure', // 心理压制（压场/挑衅/试探）
    PSYCH_PROBE:    'psych_probe',    // 心理试探（附带信息）
    PSYCH_RECOVER:  'psych_recover'   // 心理恢复（定神）
  };

  const PHASE_INDEX = {
    idle: -1,
    preflop: 0,
    flop: 1,
    turn: 2,
    river: 3,
    showdown: 4
  };
  const RIVER_INFO_EFFECTS = {
    clarity: 1,
    refraction: 1,
    reversal: 1,
    heart_read: 1,
    clairvoyance: 1
  };
  const VV_CLAIRVOYANCE_TIER_EXTRA_COST = {
    1: 20,
    2: 36,
    3: 50
  };

  // ========== 通用技能目录 ==========
  // 4属性 × 3等级 (T3=基础 T2=进阶 T1=终极)
  // threshold = 需要的单项属性值才能习得
  // power = 固定力量值（MoZ 引擎消费）
  // suppressTiers / suppressAttr / suppressAll = 阶级压制规则

  const UNIVERSAL_SKILLS = {
    // ===== Moirai (天命) =====
    minor_wish:   { attr: 'moirai', tier: 3, threshold: 20, effect: 'fortune',     activation: 'active',  manaCost: 10, cooldown: 0, power: 15, icon: 'round-star.svg', description: '小吉 — 概率偏斜' },
    grand_wish:   { attr: 'moirai', tier: 2, threshold: 40, effect: 'fortune',     activation: 'active',  manaCost: 20, cooldown: 0, power: 30, icon: 'stars-stack.svg', description: '大吉 — 疯狂强运' },
    divine_order: { attr: 'moirai', tier: 1, threshold: 60, effect: 'fortune',     activation: 'active',  manaCost: 40, cooldown: 3, power: 50, suppressTiers: [2, 3], icon: 'star-formation.svg', description: '天命 — 绝对既定' },

    // ===== Chaos (狂厄) =====
    hex:          { attr: 'chaos',  tier: 3, threshold: 20, effect: 'curse',       activation: 'active',  manaCost: 8,  cooldown: 0, power: 18, icon: 'bleeding-eye.svg', description: '小凶 — 概率污蚀' },
    havoc:        { attr: 'chaos',  tier: 2, threshold: 40, effect: 'curse',       activation: 'active',  manaCost: 15, cooldown: 0, power: 35, icon: 'skull-crack.svg', description: '大凶 — 恶意筛除' },
    catastrophe:  { attr: 'chaos',  tier: 1, threshold: 60, effect: 'curse',       activation: 'active',  manaCost: 30, cooldown: 3, power: 55, suppressTiers: [2, 3], icon: 'reaper-scythe.svg', description: '灾变 — 痛苦锁死' },

    // ===== Psyche (灵视) — 裁定者 The Arbiter =====
    // 每阶都有双重效果: 信息效果(必定触发) + 反制效果(仅对敌方Chaos生效)
    clarity:      { attr: 'psyche', tier: 3, threshold: 20, effect: 'clarity',     activation: 'active',  manaCost: 10, cooldown: 0, power: 0,  icon: 'magnifying-glass.svg', description: '澄澈 — 胜率感知 + 消除敌方T3/T2 Curse' },
    refraction:   { attr: 'psyche', tier: 2, threshold: 40, effect: 'refraction',  activation: 'active',  manaCost: 25, cooldown: 0, power: 0,  icon: 'octogonal-eye.svg', description: '折射 — 透视手牌 + 消除敌方T3/T2 Curse并50%转化' },
    axiom:        { attr: 'psyche', tier: 1, threshold: 60, effect: 'reversal',    activation: 'active',  manaCost: 50, cooldown: 3, power: 0,  suppressAttr: 'chaos', icon: 'cursed-star.svg', description: '真理 — 胜率+透视 + 湮灭所有Curse并100%转化' },

    // ===== Void (虚无) — 反魔法系，零 Mana 消耗，代价是策略成本 =====
    static_field: { attr: 'void',   tier: 3, threshold: 20, effect: 'null_field',  activation: 'passive', manaCost: 0,  cooldown: 0, power: 8,  icon: 'magic-palm.svg', description: '屏蔽 — 反侦察：敌方信息类技能对己方失效' },
    insulation:   { attr: 'void',   tier: 2, threshold: 40, effect: 'void_shield', activation: 'toggle',  manaCost: 0,  cooldown: 0, power: 15, icon: 'dice-shield.svg', description: '绝缘 — 不对称抑制：我方fortune-15%/curse-35%，敌方fortune-35%/curse-15%' },
    reality:      { attr: 'void',   tier: 1, threshold: 60, effect: 'purge_all',   activation: 'active',  manaCost: 0,  cooldown: 0, power: 0,  suppressAll: true, usesPerGame: 1, icon: 'ace.svg', description: '现实 — 物理回滚（每手限1次）' },

    // ===== 角色专属技能 =====
    // --- Rino (♥ 天宫理乃) ---
    royal_decree: { attr: 'moirai', tier: 0, threshold: 80, effect: 'royal_decree', activation: 'active', manaCost: 25, cooldown: 0, power: 70, suppressTiers: [1, 2, 3], usesPerGame: 1, icon: 'barbed-star.svg', description: '敕令 — 绝对天命，超强概率偏斜(P70)（每手限1次）' },
    heart_read:   { attr: 'psyche', tier: 2, threshold: 20, effect: 'heart_read',  activation: 'active', manaCost: 15, cooldown: 1, power: 0,  icon: 'chained-heart.svg', description: '命运感知 — 读取对手意图 + 消除敌方T3/T2 Curse' },

    // --- Sia (♠ 夜伽希亚) ---
    cooler:       { attr: 'chaos',  tier: 2, threshold: 40, effect: 'cooler',      activation: 'active', manaCost: 18, cooldown: 2, power: 0,  icon: 'spade-skull.svg', description: '冤家牌 — 为目标附加冤家牌标记，本手后续更偏向形成被更大成手压死的牌局' },
    skill_seal:   { attr: 'chaos',  tier: 2, threshold: 40, effect: 'skill_seal',  activation: 'active', manaCost: 20, cooldown: 3, power: 0,  icon: 'crossed-chains.svg', description: '冻结令 — 冻结目标主动技能2回合；若目标带有冤家牌标记，额外延长1回合' },

    // --- VV (♦ 薇布伦·凡恩) ---
    clairvoyance: { attr: 'psyche', tier: 2, threshold: 40, effect: 'clairvoyance', activation: 'active', manaCost: 12, cooldown: 0, usesPerStreet: 1, power: 0, icon: 'star-pupil.svg', description: '估价眼 — 选择目标、建仓档位与隐藏清算方向，记录投资轮基准并注入泡沫头寸（每街1次）' },
    bubble_liquidation: { attr: 'psyche', tier: 0, threshold: 80, effect: 'bubble_liquidation', activation: 'active', manaCost: 16, cooldown: 0, power: 0, suppressTiers: [1, 2, 3], usesPerGame: 1, icon: 'shiny-purse.svg', description: '泡沫清算 — 对指定目标当前投资轮执行偏离清算（整局1次）' },

    // --- POPPY (♣ 波比·希德) ---
    miracle:      { attr: 'moirai', tier: 0, threshold: 0,  effect: 'miracle',      activation: 'trigger', manaCost: 0, cooldown: 0, power: 0, suppressTiers: [1, 2, 3], usesPerGame: 1, trigger: { condition: 'runtime_only', value: 0 }, triggerThreshold: 0.25, convertRate: 1.5, durationStreets: 3, handCard: false, showAsPassiveCard: true, icon: 'poppy1.svg', description: '命大 — 全场仅1次；首次进入25%血线后，于下一手开始时抽空全部 mana，按 1.5x 转为持续3街的 fortune' },
    lucky_find:   { attr: 'moirai', tier: 2, threshold: 0,  effect: 'lucky_find',   activation: 'trigger', manaCost: 0, cooldown: 0, power: 20, trigger: { condition: 'runtime_only', value: 0 }, handCard: false, showAsPassiveCard: true, icon: 'poppy2.svg', description: '捡到了！— 每街结算时按当前 mana 概率判定，成功则获得 fortune(P20) 并消耗 5 mana' },

    // --- Trixie (🃏 鬼牌/缇克希) ---
    rule_rewrite: { attr: 'chaos',  tier: 2, threshold: 40, effect: 'rule_rewrite', activation: 'active', manaCost: 10, cooldown: 1, power: 0, icon: 'jester-hat.svg', description: '规则篡改 — 消耗当前鬼牌，将其改写为自身 fortune(x1) 或指定敌方 curse(x0.66)，可附加延后一街、增加一街或改为场地' },
    blind_box:    { attr: 'chaos',  tier: 0, threshold: 80, effect: 'blind_box',    activation: 'active', manaCost: 50, cooldown: 0, power: 0, suppressTiers: [1, 2, 3], usesPerGame: 1, icon: 'party-popper.svg', description: '盲盒派对 — 消耗整张鬼牌发动账户篡位，交换两名角色当前50%筹码与50% mana 的交换资源，持续3街后换回原主（整局1次）' },

    // --- Cota (♦ 可塔·林特) ---
    deal_card:    { attr: 'psyche', tier: 2, threshold: 20, effect: 'deal_card', activation: 'active', manaCost: 8, cooldown: 0, power: 0, usesPerStreet: 1, icon: '', description: '发牌 — 向空牌槽发入吉牌、厄牌或杂牌；牌列跨街跨手常驻，由 Runtime 接管' },
    gather_or_spread: { attr: 'psyche', tier: 2, threshold: 40, effect: 'gather_or_spread', activation: 'active', manaCost: 10, cooldown: 0, power: 0, usesPerStreet: 1, icon: '', description: '收牌 / 铺牌 — 调整整列牌槽与全牌列数值；每街限一次，具体牌列修正由 Runtime 接管' },

    // --- Eulalia (♥ 尤拉莉亚·帕瑞蒂) ---
    absolution:   { attr: 'moirai', tier: 0, threshold: 70, effect: 'absolution',   activation: 'active', manaCost: 35, cooldown: 0, power: 0, suppressTiers: [1, 2, 3], usesPerGame: 1, icon: '', description: '赦免 — 启动三街承灾合同：吸取当前 curse，后续两街继续承灾，并在第三街结束时统一平分爆出' },
    benediction:  { attr: 'moirai', tier: 2, threshold: 30, effect: 'benediction',  activation: 'active', manaCost: 15, cooldown: 1, power: 35, icon: '', description: '祝福 — 对非自身目标施加按名义厄运倍率放大的 fortune，并吸取目标相关 curse 记为本街承灾' },

    // --- Kako (♠ 司伽子) ---
    reclassification: { attr: 'psyche', tier: 2, threshold: 40, effect: 'reclassification', activation: 'active', manaCost: 16, cooldown: 1, power: 0, icon: 'fountain-pen.svg', description: '改判 — 在发牌前对目标本街新增值作出单次通过/不通过裁定' },
    general_ruling:   { attr: 'psyche', tier: 1, threshold: 60, effect: 'general_ruling',   activation: 'active', manaCost: 36, cooldown: 0, power: 0, suppressTiers: [2, 3], usesPerGame: 1, icon: 'stamper.svg', description: '总务裁定 — 在发牌前对全场红章目标执行统一裁定' },

    // --- Kuzuha (♣ 久世九叶) ---
    house_edge:   { attr: 'chaos',  tier: 2, threshold: 40, effect: 'house_edge',   activation: 'active', manaCost: 18, cooldown: 1, power: 18, icon: 'fox-head.svg', description: '抽水 — 对指定敌方施加 curse(P18) 并附加 debt rot' },
    debt_call:    { attr: 'chaos',  tier: 1, threshold: 70, effect: 'debt_call',    activation: 'active', manaCost: 34, cooldown: 3, power: 0,  icon: 'card-burn.svg', description: '催收 — 立即结算目标 debt rot，收一笔并留一尾' },

    // ===== 心理战技能 (Mental Pressure) =====
    presence:     { attr: 'moirai', tier: 1, threshold: 0, effect: 'psych_pressure', activation: 'active', manaCost: 15, cooldown: 2, basePower: 18, equityBias: -15, pressureType: 'presence', icon: '', description: '压场 — 让对方退缩、保守' },
    taunt:        { attr: 'chaos',  tier: 1, threshold: 0, effect: 'psych_pressure', activation: 'active', manaCost: 15, cooldown: 2, basePower: 18, equityBias: 15, pressureType: 'taunt', icon: '', description: '挑衅 — 让对方上头、冒进' },
    probe:        { attr: 'psyche', tier: 1, threshold: 0, effect: 'psych_probe',    activation: 'active', manaCost: 12, cooldown: 1, basePower: 15, confidenceDelta: -30, pressureType: 'probe', icon: '', description: '试探 — 让对方失准，读取心理状态' },
    center_self:  { attr: 'void',   tier: 1, threshold: 0, effect: 'psych_recover',  activation: 'active', manaCost: 10, cooldown: 3, baseRecover: 20, confidenceDelta: 20, clearBias: true, icon: '', description: '定神 — 稳住自己，恢复定力' }
  };

  /**
   * 查找技能定义
   * @param {string} skillKey - UNIVERSAL_SKILLS 中的 key
   * @returns {object|null}
   */
  function lookupSkill(skillKey) {
    return UNIVERSAL_SKILLS[skillKey] || null;
  }

  // ========== 技能槽位计算 ==========

  /**
   * 广度：四维总和决定技能槽数量
   * @param {object} attrs - { moirai, chaos, psyche, void }
   * @returns {number} 槽位数 (1-4)
   */
  function calculateSlots(attrs) {
    const total = (attrs.moirai || 0) + (attrs.chaos || 0) +
                  (attrs.psyche || 0) + (attrs.void || 0);
    if (total >= 120) return 4;
    if (total >= 80)  return 3;
    if (total >= 40)  return 2;
    return 1;
  }

  /**
   * 深度：单项属性值决定能否学会某技能
   * @param {object} skillDef - 技能定义（需要 attr + threshold）
   * @param {object} attrs - 角色属性面板
   * @returns {boolean}
   */
  function canLearnSkill(skillDef, attrs) {
    if (!skillDef.attr || !skillDef.threshold) return true; // 无门槛限制
    return (attrs[skillDef.attr] || 0) >= skillDef.threshold;
  }

  /**
   * 从属性面板自动推导可用技能列表
   * @param {object} attrs - { moirai, chaos, psyche, void }
   * @param {number} maxSlots - 最大槽位数
   * @returns {Array<{key, ...skillDef}>} 按优先级排序的技能列表
   */
  function deriveSkillsFromAttrs(attrs, maxSlots) {
    const available = [];
    for (const key in UNIVERSAL_SKILLS) {
      const def = UNIVERSAL_SKILLS[key];
      if (!def.attr) continue;
      if (canLearnSkill(def, attrs)) {
        available.push({ key: key, ...def });
      }
    }
    // 同属性内高阶优先（T1 > T2 > T3），跨属性按属性值高的优先
    available.sort(function (a, b) {
      if (a.tier !== b.tier) return a.tier - b.tier; // T1=1 最高优先
      const aVal = attrs[a.attr] || 0;
      const bVal = attrs[b.attr] || 0;
      return bVal - aVal; // 属性值高的优先
    });
    return available.slice(0, maxSlots);
  }

  // ========== Mana 池按等级推导（通用规则） ==========
  // 等级取 max(vanguard.level, rearguard.level)

  const MANA_BY_LEVEL = {
    0: { max: 0,   regen: 0 },
    1: { max: 40,  regen: 1 },
    2: { max: 60,  regen: 1 },
    3: { max: 80,  regen: 1 },
    4: { max: 90,  regen: 2 },
    5: { max: 100, regen: 2 }
  };

  // ========== SkillSystem 类 ==========

  class SkillSystem {
    constructor() {
      // 所有注册的技能实例
      // key: uniqueId (ownerId + '_' + skillKey)
      // value: { ownerId, ownerName, skillKey, effect, level, activation, manaCost,
      //          active, description, target?, trigger?, cooldown?, currentCooldown? }
      this.skills = new Map();

      // 每个实体的 mana 池
      // key: ownerId, value: { current, max, regen }
      this.manaPools = new Map();

      // 反噬状态（按玩家独立计数；backlash 保留给 hero 面板读取）
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

      // Hook 事件系统
      this._hooks = {};

      this.on('mana:changed', (payload) => {
        if (!payload || payload.ownerId == null) return;
        const current = Number(payload.current);
        if (!Number.isFinite(current)) return;
        const previous = Number.isFinite(Number(payload.previous))
          ? Number(payload.previous)
          : current;
        this._maybeTriggerBacklash(payload.ownerId, previous, current, payload.reason || 'mana_changed');
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

    _isPlayerAvailable(player) {
      return !!(player && !player.folded && player.isActive !== false);
    }

    _getStatusMap(ownerId) {
      if (!this.statusMarks.has(ownerId)) this.statusMarks.set(ownerId, {});
      return this.statusMarks.get(ownerId);
    }

    setStatusMark(ownerId, key, payload) {
      if (ownerId == null || !key) return;
      const marks = this._getStatusMap(ownerId);
      marks[key] = Object.assign({}, marks[key] || {}, payload || {}, { key: key });
      this.emit('status:mark', { ownerId: ownerId, key: key, payload: marks[key] });
    }

    clearStatusMark(ownerId, key) {
      const marks = this.statusMarks.get(ownerId);
      if (!marks || !marks[key]) return;
      delete marks[key];
      if (Object.keys(marks).length === 0) this.statusMarks.delete(ownerId);
      this.emit('status:clear', { ownerId: ownerId, key: key });
    }

    clearAllStatusMarks() {
      if (this.statusMarks.size === 0) return;
      const ownerIds = Array.from(this.statusMarks.keys());
      this.statusMarks.clear();
      this.emit('status:clear_all', { ownerIds: ownerIds });
    }

    hasStatusMark(ownerId, key) {
      const marks = this.statusMarks.get(ownerId);
      return !!(marks && marks[key]);
    }

    getStatusMarks(ownerId) {
      const marks = this.statusMarks.get(ownerId);
      return marks ? Object.assign({}, marks) : {};
    }

    isMatchScopedUsed(scopeKey) {
      return !!(scopeKey && this.matchScopedUses.has(String(scopeKey)));
    }

    getMatchScopedUse(scopeKey) {
      if (!scopeKey) return null;
      const payload = this.matchScopedUses.get(String(scopeKey));
      return payload ? Object.assign({}, payload) : null;
    }

    consumeMatchScopedUse(scopeKey, payload) {
      if (!scopeKey) return false;
      const key = String(scopeKey);
      if (this.matchScopedUses.has(key)) return false;
      const record = Object.assign({
        key: key,
        consumedAt: Date.now()
      }, payload || {});
      this.matchScopedUses.set(key, record);
      this.emit('match_scope:consumed', record);
      return true;
    }

    clearMatchScopedUses() {
      if (this.matchScopedUses.size === 0) return;
      const keys = Array.from(this.matchScopedUses.keys());
      this.matchScopedUses.clear();
      this.emit('match_scope:cleared', { keys: keys });
    }

    // ========== Hook 事件系统 ==========

    /**
     * 注册事件监听
     * @param {string} event - 事件名
     * @param {Function} callback - 回调
     * @returns {Function} 取消注册的函数
     */
    on(event, callback) {
      if (!this._hooks[event]) this._hooks[event] = [];
      this._hooks[event].push(callback);
      return () => {
        this._hooks[event] = this._hooks[event].filter(cb => cb !== callback);
      };
    }

    /**
     * 触发事件
     * @param {string} event - 事件名
     * @param {*} data - 事件数据
     */
    emit(event, data) {
      const handlers = this._hooks[event];
      if (handlers) {
        for (const h of handlers) {
          try { h(data); } catch (e) { console.error('[SkillSystem] Hook error:', event, e); }
        }
      }
      this._emitRuntimeEvent(event, data);
    }

    setRuntimeFlow(runtimeFlow) {
      this.runtimeFlow = runtimeFlow || null;
    }

    _emitRuntimeEvent(event, data) {
      if (!this.runtimeFlow || typeof this.runtimeFlow.emit !== 'function') return;
      this.runtimeFlow.emit(event, data);
    }

    _emitSkillActivated(payload, options) {
      var next = Object.assign({}, payload || {});
      if (next.skill && next.activationId == null) {
        next.activationId = next.skill._activationId || null;
      }
      if (options) {
        next.options = Object.assign({}, options);
        var gameContext = options.gameContext || null;
        if (next.phase == null && gameContext && gameContext.phase != null) {
          next.phase = gameContext.phase;
        }
        if (next.pot == null && gameContext && gameContext.pot != null) {
          next.pot = gameContext.pot;
        }
        if (!Array.isArray(next.board) && gameContext && Array.isArray(gameContext.board)) {
          next.board = gameContext.board.slice();
        }
      }
      this._emitRuntimeEvent('skill:activated', next);
      this.emit('skill:activated', next);
    }

    _snapshotForce(force) {
      return force ? Object.assign({}, force) : null;
    }

    _queuePendingForce(force, meta) {
      if (!force) return null;
      if (!force._runtimeId) {
        this._forceSerial += 1;
        force._runtimeId = 'force_' + this._forceSerial;
      }
      this.pendingForces.push(force);
      this.emit('force:queued', {
        force: this._snapshotForce(force),
        meta: meta || null
      });
      return force;
    }

    _removePendingForces(predicate, meta) {
      var removed = [];
      var kept = [];
      for (var i = 0; i < this.pendingForces.length; i++) {
        var force = this.pendingForces[i];
        if (predicate(force, i)) {
          removed.push(force);
        } else {
          kept.push(force);
        }
      }
      this.pendingForces = kept;
      for (var j = 0; j < removed.length; j++) {
        this.emit('force:removed', {
          force: this._snapshotForce(removed[j]),
          meta: meta || null
        });
      }
      return removed;
    }

    _mutatePendingForce(force, before, meta) {
      if (!force) return force;
      this.emit('force:mutated', {
        before: this._snapshotForce(before || force),
        after: this._snapshotForce(force),
        meta: meta || null
      });
      return force;
    }

    _replacePendingForces(nextForces, meta) {
      var previous = Array.isArray(this.pendingForces) ? this.pendingForces.slice() : [];
      this.pendingForces = Array.isArray(nextForces) ? nextForces : [];
      this.emit('forces:replaced', {
        before: previous.map(this._snapshotForce.bind(this)),
        after: this.pendingForces.map(this._snapshotForce.bind(this)),
        meta: meta || null
      });
      return this.pendingForces;
    }

    _isSelfProtectEffect(effect) {
      return effect === EFFECT.CLARITY ||
        effect === EFFECT.REFRACTION ||
        effect === EFFECT.REVERSAL ||
        effect === EFFECT.HEART_READ ||
        effect === EFFECT.CLAIRVOYANCE ||
        effect === EFFECT.PRE_DECOLOR ||
        effect === EFFECT.NULL_READ ||
        effect === EFFECT.AUDIT;
    }

    _defaultSelectSkillTarget(input) {
      var options = input && input.options ? input.options : {};
      if (options.targetId != null) return options.targetId;
      var skill = input && input.skill ? input.skill : {};
      var gameContext = input && input.ctx ? input.ctx : null;
      if ((skill.effect === EFFECT.CURSE ||
          skill.effect === EFFECT.BENEDICTION ||
          skill.effect === EFFECT.COOLER ||
          skill.effect === EFFECT.SKILL_SEAL) &&
          this.curseTargetFn) {
        return this.curseTargetFn(skill.ownerId, gameContext && gameContext.players);
      }
      return null;
    }

    _defaultSelectProtectTarget(input) {
      var options = input && input.options ? input.options : {};
      if (options.protectId != null) return options.protectId;
      var skill = input && input.skill ? input.skill : {};
      return this._isSelfProtectEffect(skill.effect) ? skill.ownerId : null;
    }

    _defaultAugmentSkillOptions(input) {
      return Object.assign({}, (input && input.options) || {});
    }

    _resolveSkillExecutionOptions(skill, owner, gameContext, baseOptions) {
      var options = Object.assign({}, baseOptions || {});
      if (!gameContext &&
          global.AceRuntimeAPI &&
          typeof global.AceRuntimeAPI.getGameState === 'function') {
        gameContext = global.AceRuntimeAPI.getGameState() || null;
      }
      var resolvedOwner = owner;
      if (!resolvedOwner && gameContext && Array.isArray(gameContext.players)) {
        resolvedOwner = gameContext.players.find(function(player) {
          return player && player.id === skill.ownerId;
        }) || null;
      }
      if (gameContext && !gameContext.skillSystem) gameContext.skillSystem = this;

      if (resolvedOwner && resolvedOwner.type === 'human') {
        if (options.targetId == null) options.targetId = this._defaultSelectSkillTarget({
          skill: skill,
          owner: resolvedOwner,
          ctx: gameContext,
          options: options
        });
        if (options.protectId == null) options.protectId = this._defaultSelectProtectTarget({
          skill: skill,
          owner: resolvedOwner,
          ctx: gameContext,
          options: options
        });
        return options;
      }

      var director = global.NpcRoleDirector;
      if (!director || typeof director.resolveSkillUseOptions !== 'function') {
        if (options.targetId == null) options.targetId = this._defaultSelectSkillTarget({
          skill: skill,
          owner: resolvedOwner,
          ctx: gameContext,
          options: options
        });
        if (options.protectId == null) options.protectId = this._defaultSelectProtectTarget({
          skill: skill,
          owner: resolvedOwner,
          ctx: gameContext,
          options: options
        });
        return options;
      }

      var difficulty = (resolvedOwner && resolvedOwner.difficultyProfile)
        || (resolvedOwner && resolvedOwner.ai && resolvedOwner.ai.difficultyProfile)
        || (resolvedOwner && resolvedOwner.personality && resolvedOwner.personality.difficulty)
        || (resolvedOwner && resolvedOwner.difficulty)
        || 'regular';

      return Object.assign({}, options, director.resolveSkillUseOptions({
        difficulty: difficulty,
        skill: skill,
        owner: resolvedOwner,
        ctx: gameContext,
        pendingForces: this.pendingForces,
        mana: this.getMana(skill.ownerId),
        options: options
      }, {
        selectSkillTarget: this._defaultSelectSkillTarget.bind(this),
        selectProtectTarget: this._defaultSelectProtectTarget.bind(this),
        augmentSkillOptions: this._defaultAugmentSkillOptions.bind(this)
      }) || {});
    }

    _validateSkillExecution(skill, gameContext, options) {
      if (!skill) return { ok: false, reason: 'SKILL_NOT_FOUND' };
      var finalOptions = options || {};
      if (skill.effect === EFFECT.RULE_REWRITE) {
        var rewriteLedger = this.assetLedger;
        var wildCard = 0;
        if (rewriteLedger && typeof rewriteLedger.getValue === 'function') {
          wildCard = Math.max(0, Number(rewriteLedger.getValue(skill.ownerId, 'trixie_wild_card') || 0));
        }
        if (wildCard <= 0) {
          return { ok: false, reason: 'NO_WILD_CARD', wildCard: wildCard };
        }
        var rewriteMode = String(finalOptions.rewriteMode || 'fortune_self');
        if (rewriteMode === 'curse_target' && !finalOptions.rewriteGlobal) {
          var rewriteTargetId = finalOptions.targetId != null ? finalOptions.targetId : null;
          if (rewriteTargetId == null || rewriteTargetId === skill.ownerId) {
            return { ok: false, reason: 'NO_REWRITE_TARGET', wildCard: wildCard };
          }
        }
      }
      if (skill.effect === EFFECT.BLIND_BOX) {
        var scopeKey = 'skill:' + String(skill.ownerId) + ':blind_box:match_once';
        if (typeof this.isMatchScopedUsed === 'function' && this.isMatchScopedUsed(scopeKey)) {
          return { ok: false, reason: 'MATCH_SCOPED_USED', scopeKey: scopeKey };
        }
        var boxLedger = this.assetLedger;
        var blindWildCard = 0;
        if (boxLedger && typeof boxLedger.getValue === 'function') {
          blindWildCard = Math.max(0, Number(boxLedger.getValue(skill.ownerId, 'trixie_wild_card') || 0));
        }
        if (blindWildCard <= 0) {
          return { ok: false, reason: 'NO_WILD_CARD', wildCard: blindWildCard };
        }
        var participantIds = Array.isArray(finalOptions.participantIds)
          ? finalOptions.participantIds.map(function(id) { return Number(id); }).filter(function(id) { return Number.isFinite(id); })
          : [];
        if (participantIds.length !== 2 || participantIds[0] === participantIds[1]) {
          return { ok: false, reason: 'INVALID_BLIND_BOX_TARGETS', wildCard: blindWildCard };
        }
        if (gameContext && Array.isArray(gameContext.players)) {
          var activeIds = gameContext.players
            .filter(function(player) { return player && player.isActive !== false && !player.folded; })
            .map(function(player) { return Number(player.id); });
          var allValid = participantIds.every(function(id) { return activeIds.indexOf(id) >= 0; });
          if (!allValid) {
            return { ok: false, reason: 'INVALID_BLIND_BOX_TARGETS', wildCard: blindWildCard };
          }
        }
        var requiredWildCard = participantIds.indexOf(skill.ownerId) >= 0 ? 50 : 100;
        if (blindWildCard < requiredWildCard) {
          return {
            ok: false,
            reason: 'INSUFFICIENT_WILD_CARD',
            wildCard: blindWildCard,
            requiredWildCard: requiredWildCard
          };
        }
      }
      if (skill.effect === EFFECT.DEBT_CALL) {
        var targetId = finalOptions.targetId != null ? finalOptions.targetId : null;
        if (targetId == null) {
          return { ok: false, reason: 'NO_DEBT_TARGET', targetId: null, debtValue: 0 };
        }
        var ledger = this.assetLedger;
        var debtValue = 0;
        if (ledger && typeof ledger.getValue === 'function') {
          debtValue = Math.max(0, Number(ledger.getValue(skill.ownerId, 'kuzuha_debt_rot:' + targetId) || 0));
        }
        if (debtValue <= 0) {
          return { ok: false, reason: 'NO_DEBT_TARGET', targetId: targetId, debtValue: debtValue };
        }
      }
      if (skill.effect === EFFECT.BENEDICTION) {
        var benedictionTargetId = finalOptions.targetId != null ? finalOptions.targetId : null;
        if (benedictionTargetId == null || benedictionTargetId === skill.ownerId) {
          return { ok: false, reason: 'NO_BENEDICTION_TARGET', targetId: benedictionTargetId };
        }
        if (gameContext && Array.isArray(gameContext.players)) {
          var benedictionTarget = gameContext.players.find(function(player) {
            return player && player.id === benedictionTargetId;
          }) || null;
          if (!benedictionTarget || benedictionTarget.isActive === false || benedictionTarget.folded) {
            return { ok: false, reason: 'NO_BENEDICTION_TARGET', targetId: benedictionTargetId };
          }
        }
      }
      if (skill.effect === EFFECT.RECLASSIFICATION) {
        var rulingTargetId = finalOptions.targetId != null ? finalOptions.targetId : null;
        if (rulingTargetId == null) {
          return { ok: false, reason: 'NO_RULING_TARGET', targetId: rulingTargetId };
        }
        if (gameContext && Array.isArray(gameContext.players)) {
          var rulingTarget = gameContext.players.find(function(player) {
            return player && player.id === rulingTargetId;
          }) || null;
          var hasJudgeablePendingForce = Array.isArray(this.pendingForces) && this.pendingForces.some(function(force) {
            if (!force || (force.type !== 'fortune' && force.type !== 'curse')) return false;
            var recipientId = null;
            if (force.type === 'curse') {
              recipientId = force.targetId != null ? force.targetId : null;
            } else if (force.targetId != null) {
              recipientId = force.targetId;
            } else if (force.protectId != null) {
              recipientId = force.protectId;
            } else {
              recipientId = force.ownerId != null ? force.ownerId : null;
            }
            return recipientId === rulingTargetId;
          });
          if (!rulingTarget || ((rulingTarget.isActive === false || rulingTarget.folded) && !hasJudgeablePendingForce)) {
            return { ok: false, reason: 'NO_RULING_TARGET', targetId: rulingTargetId };
          }
        }
      }
      if (skill.effect === EFFECT.CLAIRVOYANCE) {
        var vvTargetId = finalOptions.targetId != null ? finalOptions.targetId : null;
        if (vvTargetId == null) {
          return { ok: false, reason: 'NO_VV_TARGET' };
        }
        var vvTier = Math.max(0, Number(finalOptions.tier != null ? finalOptions.tier : 0) || 0);
        if (vvTier < 1 || vvTier > 3) {
          return { ok: false, reason: 'INVALID_VV_TIER', tier: finalOptions.tier };
        }
        var vvDirection = String(finalOptions.direction || '').toLowerCase();
        if (vvDirection !== 'bullish' && vvDirection !== 'bearish') {
          return { ok: false, reason: 'INVALID_VV_DIRECTION', direction: finalOptions.direction };
        }
      }
      if (skill.effect === EFFECT.BUBBLE_LIQUIDATION) {
        var vvLiquidationTargetId = finalOptions.targetId != null ? finalOptions.targetId : null;
        if (vvLiquidationTargetId == null) {
          return { ok: false, reason: 'NO_VV_TARGET' };
        }
        var vvLedger = this.assetLedger;
        var vvPositions = [];
        if (vvLedger && typeof vvLedger.getAsset === 'function') {
          var vvPositionAsset = vvLedger.getAsset(vvLiquidationTargetId, 'vv_positions');
          if (vvPositionAsset && Array.isArray(vvPositionAsset.positions)) vvPositions = vvPositionAsset.positions;
        }
        var hasOwnVvPosition = vvPositions.some(function(pack) {
          return pack && pack.ownerId === skill.ownerId;
        });
        if (!hasOwnVvPosition) {
          return { ok: false, reason: 'NO_VV_POSITION', targetId: vvLiquidationTargetId };
        }
      }
      if (skill.effect === EFFECT.DEAL_CARD) {
        var cotaCardType = String(finalOptions.cardType || '').toLowerCase();
        if (cotaCardType !== 'good' && cotaCardType !== 'bad' && cotaCardType !== 'misc') {
          return { ok: false, reason: 'INVALID_COTA_CARD_TYPE', cardType: finalOptions.cardType };
        }
        var cotaLedger = this.assetLedger;
        var cotaSlotCount = 3;
        var cotaCards = [];
        if (cotaLedger && typeof cotaLedger.getValue === 'function') {
          cotaSlotCount = Math.max(0, Number(cotaLedger.getValue(skill.ownerId, 'cota_slot_count') || 3));
        }
        if (cotaLedger && typeof cotaLedger.getAsset === 'function') {
          var cotaCardsAsset = cotaLedger.getAsset(skill.ownerId, 'cota_cards');
          if (cotaCardsAsset && Array.isArray(cotaCardsAsset.cards)) cotaCards = cotaCardsAsset.cards;
        }
        if (Math.max(0, cotaSlotCount - cotaCards.length) <= 0) {
          return {
            ok: false,
            reason: 'NO_COTA_EMPTY_SLOT',
            slotCount: cotaSlotCount,
            cardCount: cotaCards.length
          };
        }
      }
      if (skill.effect === EFFECT.GATHER_OR_SPREAD) {
        var cotaMode = String(finalOptions.mode || '').toLowerCase();
        if (cotaMode !== 'gather' && cotaMode !== 'spread') {
          return { ok: false, reason: 'INVALID_COTA_MODE', mode: finalOptions.mode };
        }
      }
      return { ok: true };
    }

    _getSkillDynamicManaCost(skill, finalOptions) {
      if (!skill) return 0;
      var cost = Math.max(0, Number(skill.manaCost || 0));
      if (skill.effect === EFFECT.CLAIRVOYANCE) {
        var vvTier = Math.max(1, Math.min(3, Number(finalOptions && finalOptions.tier != null ? finalOptions.tier : 1) || 1));
        cost += Number(VV_CLAIRVOYANCE_TIER_EXTRA_COST[vvTier] || 0);
      }
      return cost;
    }

    _getSkillActualManaCost(skill, finalOptions) {
      var actualCost = this._getSkillDynamicManaCost(skill, finalOptions);
      if (actualCost > 0 && this.traitCostFn) {
        actualCost = this.traitCostFn(skill.ownerId, actualCost);
      }
      return Math.max(0, Number(actualCost || 0));
    }

    // ========== 技能注册（从 config 加载） ==========

    /**
     * 从 game-config 注册所有技能
     * 统一接口：每个角色都有 vanguard/rearguard/skills/attrs
     * skills key 必须是 UNIVERSAL_SKILLS 中的 key
     * mana 由 max(vanguard.level, rearguard.level) 推导
     */
    /**
     * @param {object} config - 游戏配置
     * @param {object} [playerIdMap] - 座位→gameState玩家ID映射
     *   { heroId: number, seats: { BTN: number, SB: number, ... } }
     *   如果不传，hero=0, NPC从1开始（兼容旧调用）
     */
    registerFromConfig(config, playerIdMap) {
      this.skills.clear();
      this.manaPools.clear();

      // 解析玩家ID映射
      const idMap = playerIdMap || {};
      const heroId = idMap.heroId != null ? idMap.heroId : 0;
      const seatIds = idMap.seats || {};
      this._heroId = heroId; // 存储供 getState() 使用

      console.log('[SKILL-SYS] registerFromConfig heroId=' + heroId, 'seatIds=', seatIds);

      // --- Hero ---
      if (config.hero) {
        const h = config.hero;
        const level = this._getCharLevel(h);
        const name = this._getCharName(h);
        const manaConfig = this._buildManaConfig(h, level);

        // v5 格式：区分主手/副手技能
        const vName = (h.vanguard && h.vanguard.name) || 'KAZU';
        const rName = (h.rearguard && h.rearguard.name) || null;

        if (h.vanguardSkills || h.rearguardSkills) {
          // 注册 mana 池（共享一个池）
          this._registerManaPool(heroId, manaConfig);
          // 主手技能
          if (h.vanguardSkills) {
            this._registerSkillList(heroId, name, 'human', h.vanguardSkills, vName);
          }
          // 副手技能
          if (h.rearguardSkills && rName) {
            this._registerSkillList(heroId, name, 'human', h.rearguardSkills, rName);
          }
        } else {
          // 兼容旧格式：单一 skills 数组
          this._registerEntity(heroId, name, 'human', h.skills || {}, manaConfig);
        }
      }

      // --- Seats (NPC) ---
      if (config.seats) {
        const seatOrder = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
        let fallbackIndex = 1;
        for (const seat of seatOrder) {
          const s = config.seats[seat];
          if (!s) continue;
          // 使用 playerIdMap 中的真实 ID，否则 fallback 递增
          const npcId = seatIds[seat] != null ? seatIds[seat] : fallbackIndex;
          const level = this._getCharLevel(s);
          const name = this._getCharName(s) || seat;
          const manaConfig = this._buildManaConfig(s, level);
          this._registerEntity(npcId, name, 'ai', s.skills || {}, manaConfig);
          fallbackIndex++;
        }
      }

      this.emit('skills:loaded', { total: this.skills.size });
      this._log('SKILLS_LOADED', { total: this.skills.size });
    }

    /**
     * 角色等级 = max(vanguard.level, rearguard.level)
     * @private
     */
    _getCharLevel(char) {
      const vLv = (char.vanguard && char.vanguard.level) || 0;
      const rLv = (char.rearguard && char.rearguard.level) || 0;
      return Math.max(vLv, rLv);
    }

    /**
     * 角色显示名 = vanguard.name（主手名）
     * @private
     */
    _getCharName(char) {
      if (char.vanguard && char.vanguard.name) return char.vanguard.name;
      if (char.name) return char.name;
      return null;
    }

    _buildManaConfig(char, level) {
      const manaTemplate = MANA_BY_LEVEL[Math.min(5, level)] || MANA_BY_LEVEL[0];
      const manaConfig = {
        max: (char && char.maxMana != null) ? char.maxMana : manaTemplate.max,
        regen: (char && char.manaRegen != null) ? char.manaRegen : manaTemplate.regen
      };
      manaConfig.current = (char && char.mana != null)
        ? Math.min(char.mana, manaConfig.max)
        : manaConfig.max;
      return manaConfig;
    }

    _getRoleMetaFromName(name) {
      if (RoleRuntime && typeof RoleRuntime.deriveRoleMeta === 'function') {
        return RoleRuntime.deriveRoleMeta(name);
      }
      const raw = String(name || '').trim();
      if (!raw) return { roleId: 'UNKNOWN', roleVariant: 'base' };
      return { roleId: raw, roleVariant: 'base' };
    }

    /**
     * 注册 Mana 池（不注册技能）
     * @private
     */
    _registerManaPool(ownerId, manaConfig) {
      if (manaConfig) {
        this.manaPools.set(ownerId, {
          current: (manaConfig.current != null) ? manaConfig.current : manaConfig.max,
          max: manaConfig.max,
          regen: (manaConfig.regen != null) ? manaConfig.regen : 1
        });
      }
    }

    /**
     * 注册一组技能（带 casterName）
     * @private
     */
    _registerSkillList(ownerId, ownerName, ownerType, skillList, casterName) {
      const keys = Array.isArray(skillList)
        ? skillList
        : Object.keys(skillList || {});

      for (const skillKey of keys) {
        this._registerSingleSkill(ownerId, ownerName, ownerType, skillKey, casterName);
      }
    }

    /**
     * 注册单个实体的所有技能（兼容旧格式）
     * @private
     */
    _registerEntity(ownerId, ownerName, ownerType, skillList, manaConfig) {
      // Mana 池
      this._registerManaPool(ownerId, manaConfig);

      // 展开技能（skillList 是 key 数组，如 ["grand_wish", "refraction"]）
      // 兼容旧格式 { key: level } → 忽略 level 值，只取 key
      const keys = Array.isArray(skillList)
        ? skillList
        : Object.keys(skillList || {});

      for (const skillKey of keys) {
        this._registerSingleSkill(ownerId, ownerName, ownerType, skillKey, ownerName);
      }
    }

    /**
     * 注册单个技能
     * @private
     */
    _registerSingleSkill(ownerId, ownerName, ownerType, skillKey, casterName) {
      const catalog = lookupSkill(skillKey);
      if (!catalog) {
        console.warn('[SkillSystem] 未知技能 key:', skillKey, '(owner:', ownerName, ')');
        return;
      }

      const activation = catalog.activation || ACTIVATION.PASSIVE;
      const initialActive = (activation === ACTIVATION.PASSIVE);
      const ownerRole = this._getRoleMetaFromName(ownerName);
      const casterRole = this._getRoleMetaFromName(casterName || ownerName);

      const skill = {
        uniqueId: ownerId + '_' + skillKey,
        ownerId: ownerId,
        ownerName: ownerName,
        ownerType: ownerType,
        casterName: casterName || ownerName,
        roleId: ownerRole.roleId,
        roleVariant: ownerRole.roleVariant,
        casterRoleId: casterRole.roleId,
        casterRoleVariant: casterRole.roleVariant,
        skillKey: skillKey,
        icon: catalog.icon || null,
        effect: catalog.effect,
        activation: activation,
        manaCost: catalog.manaCost || 0,
        power: catalog.power || 0,
        active: initialActive,
        description: catalog.description || '',
        target: catalog.target || null,
        trigger: catalog.trigger || null,
        cooldown: catalog.cooldown || 0,
        currentCooldown: 0,
        // 阶级压制元数据
        tier: catalog.tier != null ? catalog.tier : 3,
        attr: catalog.attr || null,
        suppressTiers: catalog.suppressTiers || null,
        suppressAttr: catalog.suppressAttr || null,
        suppressAll: catalog.suppressAll || false,
        cannotAffect: catalog.cannotAffect || null,
        handCard: catalog.handCard !== false,
        showAsPassiveCard: catalog.showAsPassiveCard === true,
        pendingImplementation: catalog.pendingImplementation === true,
        // 整局使用次数限制
        usesPerGame: catalog.usesPerGame || 0,  // 0 = 无限制
        gameUsesRemaining: catalog.usesPerGame || 0,  // 剩余可用次数
        usesPerStreet: catalog.usesPerStreet || 0
      };

      this.skills.set(skill.uniqueId, skill);
      this._log('SKILL_REGISTERED', {
        owner: ownerName, caster: casterName, key: skillKey, effect: skill.effect,
        activation: activation, tier: skill.tier, power: skill.power
      });
    }

    // ========== Mana 管理 ==========

    _getStreetScopedSkillKey(skill) {
      if (!skill) return null;
      return String(skill.ownerId) + '_' + String(skill.skillKey);
    }

    _getStreetScopedUseCount(skill) {
      const key = this._getStreetScopedSkillKey(skill);
      if (!key) return 0;
      return Math.max(0, Number(this.streetScopedUses.get(key) || 0));
    }

    _consumeStreetScopedUse(skill) {
      const key = this._getStreetScopedSkillKey(skill);
      if (!key) return;
      this.streetScopedUses.set(key, this._getStreetScopedUseCount(skill) + 1);
    }

    _clearStreetScopedUses() {
      this.streetScopedUses.clear();
    }

    getMana(ownerId) {
      return this.manaPools.get(ownerId) || { current: 0, max: 0, regen: 0 };
    }

    _getBacklashState(ownerId) {
      const state = this.backlashStates.get(ownerId);
      return state
        ? { active: !!state.active, counter: Math.max(0, Number(state.counter || 0)) }
        : { active: false, counter: 0 };
    }

    _syncHeroBacklashState() {
      const heroId = this._heroId != null ? this._heroId : 0;
      this.backlash = this._getBacklashState(heroId);
    }

    _syncBacklashMark(ownerId) {
      const state = this._getBacklashState(ownerId);
      if (!state.active || state.counter <= 0) {
        this.clearStatusMark(ownerId, 'backlash_state');
        return;
      }
      this.setStatusMark(ownerId, 'backlash_state', {
        icon: '../../../assets/svg/burning-skull.svg',
        iconMode: 'mask',
        tone: 'backlash',
        count: state.counter,
        title: '魔运反噬',
        detail: '持续 ' + state.counter + ' 街'
      });
    }

    _triggerBacklash(ownerId, reason) {
      if (ownerId == null) return;
      const heroId = this._heroId != null ? this._heroId : 0;
      const wasHeroActive = ownerId === heroId ? !!this.backlash.active : false;
      this.backlashStates.set(ownerId, { active: true, counter: 3 });
      this._syncBacklashMark(ownerId);
      this._syncHeroBacklashState();
      this._log('BACKLASH_TRIGGERED', {
        ownerId,
        duration: 3,
        reason: reason || 'mana_zero'
      });
      if (ownerId === heroId) {
        this.emit('backlash:start', {
          ownerId,
          counter: 3,
          reason: reason || 'mana_zero',
          refreshed: wasHeroActive
        });
      }
    }

    _maybeTriggerBacklash(ownerId, previous, current, reason) {
      const prev = Math.max(0, Number(previous || 0));
      const next = Math.max(0, Number(current || 0));
      if (prev <= 0 || next > 0) return;
      this._triggerBacklash(ownerId, reason);
    }

    _advanceBacklashStreet(phase) {
      for (const [ownerId, state] of Array.from(this.backlashStates.entries())) {
        if (!state || !state.active || state.counter <= 0) {
          this.backlashStates.delete(ownerId);
          this._syncBacklashMark(ownerId);
          continue;
        }
        state.counter--;
        if (state.counter <= 0) {
          state.active = false;
          this.backlashStates.delete(ownerId);
          this._syncBacklashMark(ownerId);
          const heroId = this._heroId != null ? this._heroId : 0;
          if (ownerId === heroId) {
            this._syncHeroBacklashState();
            this.emit('backlash:end', { ownerId, phase: phase || null });
          }
        } else {
          this.backlashStates.set(ownerId, state);
          this._syncBacklashMark(ownerId);
        }
        this._log('BACKLASH_TICK', {
          ownerId,
          phase: phase || null,
          remaining: Math.max(0, state.counter)
        });
      }
      this._syncHeroBacklashState();
    }

    spendMana(ownerId, amount) {
      const pool = this.manaPools.get(ownerId);
      if (!pool || pool.current < amount) return false;
      const before = pool.current;
      pool.current -= amount;
      this._log('MANA_SPENT', { ownerId, amount, remaining: pool.current });
      this.emit('mana:changed', {
        ownerId,
        previous: before,
        current: pool.current,
        max: pool.max,
        reason: 'skill_cost'
      });
      return true;
    }

    regenMana(ownerId, amount, reason) {
      const pool = this.manaPools.get(ownerId);
      if (!pool) return;
      const before = pool.current;
      let add = (amount != null) ? amount : pool.regen;
      if (amount == null && this.traitRegenFn) {
        add = this.traitRegenFn(ownerId, add);
      }
      pool.current = Math.max(0, Math.min(pool.max, pool.current + add));
      const finalReason = reason || (amount != null ? 'runtime_regen' : 'street_regen');
      if (pool.current !== before) {
        this._log('MANA_GAINED', {
          ownerId,
          amount: pool.current - before,
          current: pool.current,
          reason: finalReason
        });
      }
      this.emit('mana:changed', {
        ownerId,
        previous: before,
        current: pool.current,
        max: pool.max,
        reason: finalReason
      });
    }

    loseMana(ownerId, amount, reason) {
      const pool = this.manaPools.get(ownerId);
      if (!pool) return 0;
      const loss = Math.max(0, Math.round(Number(amount || 0)));
      const before = pool.current;
      pool.current = Math.max(0, before - loss);
      this.emit('mana:changed', {
        ownerId,
        previous: before,
        current: pool.current,
        max: pool.max,
        reason: reason || 'runtime_penalty'
      });
      this._log('MANA_LOST', {
        ownerId: ownerId,
        amount: before - pool.current,
        current: pool.current,
        reason: reason || 'runtime_penalty'
      });
      return before - pool.current;
    }

    regenAllMana() {
      for (const [id] of this.manaPools) {
        this.regenMana(id);
      }
    }

    // ========== 玩家主动技能激活 ==========

    /**
     * 玩家手动激活技能
     * @param {string} uniqueId - 技能唯一ID (ownerId_skillKey)
     * @returns {{ success, reason?, skill? }}
     */
    activatePlayerSkill(uniqueId, options) {
      const skill = this.skills.get(uniqueId);
      if (!skill) return { success: false, reason: 'SKILL_NOT_FOUND' };
      var finalOptions = this._resolveSkillExecutionOptions(
        skill,
        null,
        options && options.gameContext ? options.gameContext : null,
        options || {}
      );
      const targetOverride = finalOptions && finalOptions.targetId != null ? finalOptions.targetId : null;
      const protectOverride = finalOptions && finalOptions.protectId != null ? finalOptions.protectId : null;

      // Toggle 类型：切换开/关状态
      if (skill.activation === ACTIVATION.TOGGLE) {
        return this._toggleSkill(skill);
      }

      if (skill.activation !== ACTIVATION.ACTIVE) return { success: false, reason: 'NOT_ACTIVE_TYPE' };
      if (skill.pendingImplementation) {
        return { success: false, reason: 'PENDING_IMPLEMENTATION', skill: skill.skillKey };
      }
      var validation = this._validateSkillExecution(
        skill,
        finalOptions && finalOptions.gameContext ? finalOptions.gameContext : null,
        finalOptions
      );
      if (!validation.ok) {
        return Object.assign({ success: false, skill: skill.skillKey }, validation);
      }

      const ownerBacklash = this._getBacklashState(skill.ownerId);
      if (ownerBacklash.active) {
        return { success: false, reason: 'BACKLASH_ACTIVE', counter: ownerBacklash.counter };
      }

      // 整局使用次数检查
      if (skill.usesPerGame > 0 && skill.gameUsesRemaining <= 0) {
        return { success: false, reason: 'NO_USES_REMAINING', usesPerGame: skill.usesPerGame };
      }

      // 每街使用次数检查
      if (skill.usesPerStreet > 0 && this._getStreetScopedUseCount(skill) >= skill.usesPerStreet) {
        return { success: false, reason: 'STREET_USE_LIMIT', usesPerStreet: skill.usesPerStreet };
      }

      // 冷却检查
      if (skill.currentCooldown > 0) {
        return { success: false, reason: 'ON_COOLDOWN', cooldown: skill.currentCooldown };
      }
      if (skill._sealed > 0) {
        return { success: false, reason: 'SEALED', sealed: skill._sealed };
      }

      // Mana 检查（特质可能修改消耗）
      var actualCost = this._getSkillActualManaCost(skill, finalOptions);
      if (actualCost > 0) {
        var manaPool = this.manaPools.get(skill.ownerId);
        if (!manaPool || manaPool.current < actualCost) {
          return { success: false, reason: 'INSUFFICIENT_MANA', cost: actualCost };
        }
      }

      var blindBoxScopeKey = null;
      if (skill.effect === EFFECT.BLIND_BOX) {
        blindBoxScopeKey = 'skill:' + String(skill.ownerId) + ':blind_box:match_once';
        if (typeof this.consumeMatchScopedUse === 'function') {
          var consumed = this.consumeMatchScopedUse(blindBoxScopeKey, {
            ownerId: skill.ownerId,
            ownerName: skill.ownerName,
            skillKey: skill.skillKey,
            effect: skill.effect
          });
          if (!consumed) {
            return { success: false, reason: 'MATCH_SCOPED_USED', scopeKey: blindBoxScopeKey };
          }
        }
      }

      if (actualCost > 0 && !this.spendMana(skill.ownerId, actualCost)) {
        return { success: false, reason: 'INSUFFICIENT_MANA', cost: actualCost };
      }

      this._activationSerial += 1;
      skill._activationId = 'skill_act_' + this._activationSerial + '_' + Date.now();

      // 激活
      skill.currentCooldown = skill.cooldown;

      // 扣减整局使用次数
      if (skill.usesPerGame > 0) {
        skill.gameUsesRemaining--;
      }
      if (skill.usesPerStreet > 0) {
        this._consumeStreetScopedUse(skill);
      }

      // 根据 effect 类型处理
      // Psyche 技能都是双重效果: 信息(必定) + 反制(vs Chaos)
      var _activateExtra = {};
      switch (skill.effect) {
        case EFFECT.CLARITY: {
          // 澄澈: 信息=胜率显示, 反制=消除敌方 T3/T2 Curse
          var cForce = this._skillToForce(skill);
          if (protectOverride != null) cForce.protectId = protectOverride;
          this._queuePendingForce(cForce, { reason: 'skill_activate', effect: skill.effect });
          this._emitSkillActivated({ skill: skill, type: 'clarity' }, finalOptions);
          break;
        }
        case EFFECT.REFRACTION: {
          // 折射: 信息=透视手牌, 反制=消除敌方 T3/T2 Curse + 50%转化
          var rForce = this._skillToForce(skill);
          if (protectOverride != null) rForce.protectId = protectOverride;
          this._queuePendingForce(rForce, { reason: 'skill_activate', effect: skill.effect });
          this._emitSkillActivated({ skill: skill, type: 'refraction' }, finalOptions);
          break;
        }
        case EFFECT.REVERSAL: {
          // 真理: 信息=胜率+透视(继承), 反制=湮灭所有 Curse + 100%转化
          var aForce = this._skillToForce(skill);
          if (protectOverride != null) aForce.protectId = protectOverride;
          this._queuePendingForce(aForce, { reason: 'skill_activate', effect: skill.effect });
          this._emitSkillActivated({ skill: skill, type: 'reversal' }, finalOptions);
          break;
        }
        case EFFECT.PURGE_ALL:
          // 现实：清除所有非 Void pendingForces，自身加入
          this._removePendingForces(function(f) { return f && f.attr !== 'void'; }, {
            reason: 'purge_all',
            skillKey: skill.skillKey
          });
          this._queuePendingForce(this._skillToForce(skill), { reason: 'skill_activate', effect: skill.effect });
          this._emitSkillActivated({ skill: skill, type: 'purge_all' }, finalOptions);
          break;
        case EFFECT.ROYAL_DECREE:
          // 敕令：超强 fortune，直接加入 pendingForces
          this._queuePendingForce(this._skillToForce(skill), { reason: 'skill_activate', effect: skill.effect });
          this._emitSkillActivated({ skill: skill, type: 'royal_decree' }, finalOptions);
          break;
        case EFFECT.HEART_READ: {
          // 读心：信息技能，显示对手下注倾向
          var hForce = this._skillToForce(skill);
          if (protectOverride != null) hForce.protectId = protectOverride;
          this._queuePendingForce(hForce, { reason: 'skill_activate', effect: skill.effect });
          this._emitSkillActivated({ skill: skill, type: 'heart_read' }, finalOptions);
          break;
        }
        case EFFECT.COOLER: {
          // 冤家牌：施加标记，本手后续选牌更偏向“看似能打、实际被压死”
          var coolerResult = this._applyCoolerMark(skill, finalOptions && finalOptions.gameContext, targetOverride);
          _activateExtra = {
            targetId: coolerResult ? coolerResult.targetId : null,
            targetName: coolerResult ? coolerResult.targetName : null,
            markKey: 'cooler_mark'
          };
          this._emitSkillActivated({
            skill,
            type: 'cooler',
            targetId: coolerResult ? coolerResult.targetId : null,
            targetName: coolerResult ? coolerResult.targetName : null
          }, finalOptions);
          break;
        }
        case EFFECT.CLAIRVOYANCE: {
          // 估价眼：信息效果由 UI/Runtime 接管，本体不再直接注入旧版 Psyche 清洗 force
          this._emitSkillActivated({
            skill,
            type: 'clairvoyance',
            targetId: targetOverride,
            protectId: protectOverride
          }, finalOptions);
          break;
        }
        case EFFECT.BUBBLE_LIQUIDATION: {
          this._emitSkillActivated({
            skill,
            type: 'bubble_liquidation',
            targetId: targetOverride
          }, finalOptions);
          break;
        }
        case EFFECT.SKILL_SEAL:
          // 封印：冻结目标技能2回合
          this._applySeal(skill, null, targetOverride);
          this._emitSkillActivated({ skill: skill, type: 'skill_seal' }, finalOptions);
          break;
        case EFFECT.RULE_REWRITE: {
          // 规则篡改：由 Runtime 面板与合同系统接管
          this._emitSkillActivated({ skill: skill, type: 'rule_rewrite' }, finalOptions);
          break;
        }
        case EFFECT.BLIND_BOX: {
          // 盲盒派对：由 Runtime 合同系统接管
          this._emitSkillActivated({ skill: skill, type: 'blind_box' }, finalOptions);
          break;
        }

        // ===== Cota 专属 =====
        case EFFECT.DEAL_CARD:
        case EFFECT.GATHER_OR_SPREAD: {
          // 新版 COTA 完全由 Runtime 牌列系统接管；主流程不再注入旧 Psyche/fortune force。
          this._emitSkillActivated({
            skill: skill,
            type: skill.effect,
            cardType: finalOptions && finalOptions.cardType,
            mode: finalOptions && finalOptions.mode,
            slotIndex: finalOptions && finalOptions.slotIndex
          }, finalOptions);
          break;
        }

        // ===== Eulalia 专属 =====
        case EFFECT.ABSOLUTION:
          this._emitSkillActivated({
            skill: skill,
            type: 'absolution'
          }, finalOptions);
          break;
        case EFFECT.BENEDICTION:
          this._emitSkillActivated({
            skill: skill,
            type: 'benediction',
            targetId: targetOverride
          }, finalOptions);
          break;

        // ===== Kako 专属 =====
        case EFFECT.RECLASSIFICATION:
          this._emitSkillActivated({
            skill: skill,
            type: 'reclassification',
            targetId: targetOverride
          }, finalOptions);
          break;
        case EFFECT.GENERAL_RULING:
          this._emitSkillActivated({
            skill: skill,
            type: 'general_ruling'
          }, finalOptions);
          break;

        // ===== Kuzuha 专属 =====
        case EFFECT.HOUSE_EDGE: {
          this._emitSkillActivated({ skill: skill, type: 'house_edge' }, finalOptions);
          break;
        }
        case EFFECT.DEBT_CALL: {
          this._emitSkillActivated({ skill: skill, type: 'debt_call' }, finalOptions);
          break;
        }

        // ===== 心理战技能 =====
        case EFFECT.PSYCH_PRESSURE:
        case EFFECT.PSYCH_PROBE: {
          // 压制类技能：压场/挑衅/试探
          var catalog = lookupSkill(skill.skillKey);
          var pressureType = catalog.pressureType;
          var basePower = catalog.basePower || 15;
          var equityBias = catalog.equityBias || 0;
          var confidenceDelta = catalog.confidenceDelta || 0;
          var targetId = targetOverride != null ? targetOverride : null;

          this._emitSkillActivated({
            skill,
            type: 'mental_pressure',
            pressureType: pressureType,
            basePower: basePower,
            equityBias: equityBias,
            confidenceDelta: confidenceDelta,
            targetId: targetId
          }, finalOptions);
          break;
        }
        case EFFECT.PSYCH_RECOVER: {
          // 定神：恢复自身定力
          var catalog2 = lookupSkill(skill.skillKey);
          var baseRecover = catalog2.baseRecover || 20;
          var confidenceDelta2 = catalog2.confidenceDelta || 20;
          var clearBias = catalog2.clearBias || false;

          this._emitSkillActivated({
            skill,
            type: 'mental_recover',
            baseRecover: baseRecover,
            confidenceDelta: confidenceDelta2,
            clearBias: clearBias
          }, finalOptions);
          break;
        }

        default: {
          // fortune / curse / null_field / void_shield → 加入 pendingForces
          var force = this._skillToForce(skill);
          if (targetOverride != null && force.type === 'curse') force.targetId = targetOverride;
          this._queuePendingForce(force, { reason: 'skill_activate', effect: skill.effect });
          this._emitSkillActivated({ skill: skill, type: 'force' }, finalOptions);
          break;
        }
      }

      var activationLog = {
        owner: skill.ownerName,
        key: skill.skillKey,
        effect: skill.effect,
        manaCost: actualCost,
        baseManaCost: skill.manaCost
      };
      if (skill.effect === EFFECT.RULE_REWRITE) {
        activationLog.rewriteMode = finalOptions && finalOptions.rewriteMode != null
          ? finalOptions.rewriteMode
          : null;
        activationLog.rewriteModifier = finalOptions && finalOptions.rewriteModifier != null
          ? finalOptions.rewriteModifier
          : null;
        activationLog.rewriteGlobal = !!(finalOptions && finalOptions.rewriteGlobal === true);
        activationLog.targetId = finalOptions && finalOptions.targetId != null
          ? finalOptions.targetId
          : null;
      }
      if (skill.effect === EFFECT.BLIND_BOX) {
        activationLog.blindBoxMode = finalOptions && finalOptions.blindBoxMode != null
          ? finalOptions.blindBoxMode
          : null;
        activationLog.blindBoxA = finalOptions && finalOptions.blindBoxParticipantA != null
          ? finalOptions.blindBoxParticipantA
          : null;
        activationLog.blindBoxB = finalOptions && finalOptions.blindBoxParticipantB != null
          ? finalOptions.blindBoxParticipantB
          : null;
      }
      if (skill.effect === EFFECT.BUBBLE_LIQUIDATION || skill.effect === EFFECT.CLAIRVOYANCE) {
        activationLog.targetId = finalOptions && finalOptions.targetId != null
          ? finalOptions.targetId
          : null;
      }
      this._log('SKILL_ACTIVATED', activationLog);

      var ret = {
        success: true,
        skill: skill,
        options: Object.assign({}, finalOptions || {}),
        actualManaCost: actualCost
      };
      for (var ek in _activateExtra) ret[ek] = _activateExtra[ek];
      return ret;
    }

    // ========== Toggle 技能切换 ==========

    /**
     * 切换 toggle 类型技能的开/关状态
     * Toggle 技能特性：
     *   - 不消耗 Mana
     *   - 开启后持续生效直到手动关闭
     *   - 效果对敌我双方都生效（如绝缘的全场减半）
     * @param {object} skill
     * @returns {{ success, reason?, skill? }}
     */
    _toggleSkill(skill) {
      // 切换状态
      skill.active = !skill.active;

      if (skill.active) {
        this._log('SKILL_TOGGLE_ON', {
          owner: skill.ownerName, key: skill.skillKey, effect: skill.effect
        });
        this.emit('skill:toggle_on', { skill });
      } else {
        this._log('SKILL_TOGGLE_OFF', {
          owner: skill.ownerName, key: skill.skillKey, effect: skill.effect
        });
        this.emit('skill:toggle_off', { skill });
      }

      return { success: true, skill, toggled: skill.active };
    }

    // ========== NPC AI 技能决策 ==========

    /**
     * 在每个下注轮开始前，让所有 NPC 决定是否使用主动技能
     * @param {object} gameContext - { players, pot, phase, board }
     */
    npcDecideSkills(gameContext) {
      const skillRecords = [];
      var players = gameContext && Array.isArray(gameContext.players) ? gameContext.players : [];
      var seen = Object.create(null);
      for (var i = 0; i < players.length; i++) {
        var player = players[i];
        if (!player || player.type === 'human' || seen[player.id]) continue;
        seen[player.id] = true;
        var records = this.npcDecideSkillsForPlayer(player.id, gameContext, 'post-bet');
        if (!records || !records.length) continue;
        for (var j = 0; j < records.length; j++) {
          skillRecords.push(records[j]);
        }
      }

      return skillRecords;
    }

    /**
     * 单个 NPC 在自己的 betting turn 决定是否使用技能（最多1个）
     * @param {number} playerId — NPC 的 ID
     * @param {object} gameContext — { players, pot, phase, board }
     * @returns {Array} skillRecords
     */
    /**
     * @param {string} [timing] — 'pre-bet': 灵视类(betting前), 'post-bet': 攻击/增益类(betting后)
     */
    npcDecideSkillsForPlayer(playerId, gameContext, timing) {
      if (!this._turnSkillUsed) this._turnSkillUsed = {};
      var usedKey = playerId + '_street_' + String((gameContext && gameContext.phase) || 'unknown');
      if (this._turnSkillUsed[usedKey]) return [];

      const MAX_TURN_SKILLS = 1; // 每阶段最多用1个技能
      const skillRecords = [];
      const owner = gameContext.players.find(p => p.id === playerId);
      if (!this._isPlayerAvailable(owner)) return [];

      // pre-bet: 灵视/防御类（影响 betting 决策）
      // post-bet: 攻击/增益类（根据投入筹码决定）
      var PRE_BET = [
        EFFECT.CLARITY, EFFECT.REFRACTION, EFFECT.REVERSAL, EFFECT.HEART_READ, EFFECT.CLAIRVOYANCE,
        EFFECT.DEAL_CARD, EFFECT.GATHER_OR_SPREAD,
        EFFECT.PRE_DECOLOR, EFFECT.NULL_READ
      ];
      var POST_BET = [
        EFFECT.FORTUNE, EFFECT.CURSE, EFFECT.COOLER, EFFECT.ROYAL_DECREE, EFFECT.BUBBLE_LIQUIDATION,
        EFFECT.PURGE_ALL, EFFECT.SKILL_SEAL, EFFECT.RULE_REWRITE, EFFECT.BLIND_BOX,
        EFFECT.HOUSE_EDGE, EFFECT.DEBT_CALL, EFFECT.TABLE_FLIP, EFFECT.ABSOLUTION, EFFECT.BENEDICTION,
        EFFECT.RECLASSIFICATION, EFFECT.GENERAL_RULING,
        EFFECT.DEAL_CARD, EFFECT.GATHER_OR_SPREAD
      ];

      var passes;
      if (timing === 'pre-bet') {
        passes = [PRE_BET];
      } else if (timing === 'post-bet') {
        passes = [POST_BET];
      } else {
        passes = [POST_BET, PRE_BET]; // 兼容旧调用
      }

      for (var pass = 0; pass < passes.length; pass++) {
        var allowed = passes[pass];
        if (skillRecords.length >= MAX_TURN_SKILLS) break;

        for (const [, skill] of this.skills) {
          if (skill.ownerId !== playerId) continue;
          if (skill.ownerType === 'human') continue;
          if (skill.activation !== ACTIVATION.ACTIVE) continue;
          if (skill.currentCooldown > 0) continue;
          if (skill._sealed > 0) continue;
          if (allowed.indexOf(skill.effect) < 0) continue;
          if (skill.usesPerGame > 0 && skill.gameUsesRemaining <= 0) continue;
          if (skill.usesPerStreet > 0 && this._getStreetScopedUseCount(skill) >= skill.usesPerStreet) continue;
          if (gameContext.phase === 'river' && !RIVER_INFO_EFFECTS[skill.effect]) continue;
          if (skillRecords.length >= MAX_TURN_SKILLS) break;

          var shouldUse = this._npcShouldUseSkill(skill, owner, gameContext);
          this._log('NPC_SKILL_CONSIDER', {
            owner: skill.ownerName, key: skill.skillKey, effect: skill.effect,
            phase: gameContext.phase, shouldUse: shouldUse, pass: pass, timing: 'turn'
          });
          if (!shouldUse) continue;

          var finalOptions = this._resolveSkillExecutionOptions(skill, owner, gameContext, {
            gameContext: gameContext
          });
          var validation = this._validateSkillExecution(skill, gameContext, finalOptions);
          if (!validation.ok) continue;

          var preparedTurn = this._prepareNpcSkillUse(skill, finalOptions);
          if (!preparedTurn) continue;
          var record = this._executeNpcSkill(skill, owner, gameContext, finalOptions);
          if (preparedTurn.actualCost != null) {
            record.manaCost = preparedTurn.actualCost;
          }

          this._log('NPC_SKILL_USED', {
            owner: skill.ownerName, key: skill.skillKey,
            effect: skill.effect, tier: skill.tier,
            targetId: record.targetId, targetName: record.targetName, timing: 'turn'
          });

          this.emit('npc:skill_used', record);
          skillRecords.push(record);
        }
      }

	      if (skillRecords.length > 0) this._turnSkillUsed[usedKey] = true;
	      return skillRecords;
	    }

	    _captureNpcScoutIntel(skill, owner, gameContext) {
	      if (!owner || !owner.ai || typeof owner.ai.rememberScoutIntel !== 'function') return;
	      const entries = this._buildNpcScoutIntelEntries(skill, owner, gameContext);
	      for (var i = 0; i < entries.length; i++) {
	        owner.ai.rememberScoutIntel(entries[i]);
	      }
	    }

	    _buildNpcScoutIntelEntries(skill, owner, gameContext) {
	      if (!skill || !owner || !gameContext || !gameContext.players) return [];
	      const effect = skill.effect;
	      const board = gameContext.board || [];
	      const opponents = gameContext.players.filter(p =>
	        p.id !== owner.id && this._isPlayerAvailable(p) && p.cards && p.cards.length >= 2
	      );
	      if (opponents.length === 0) return [];

	      const singleTargetEffects = { refraction: 1, reversal: 1 };
	      const allTargetEffects = { clairvoyance: 1, heart_read: 1 };
	      const targets = singleTargetEffects[effect]
	        ? [this._selectNpcScoutTarget(owner, opponents)]
	        : (allTargetEffects[effect] ? opponents : []);
	      if (targets.length === 0 || !targets[0]) return [];

	      const strengthMap = { 0: 5, 1: 15, 2: 45, 3: 60, 4: 75, 5: 82, 6: 85, 7: 92, 8: 97, 9: 100 };
	      const totalEnemyThreat = (this.pendingForces || []).reduce(function(sum, f) {
	        return f.ownerId !== owner.id ? sum + (f.power || 0) : sum;
	      }, 0);
	      const entries = [];

	      for (var ti = 0; ti < targets.length; ti++) {
	        var target = targets[ti];
	        if (!target) continue;
	        var base = {
	          targetId: target.id,
	          targetName: target.name,
	          sourceSkill: effect,
	          phaseSeen: gameContext.phase,
	          seenCurrentBet: target.currentBet || 0,
	          seenTotalBet: target.totalBet || 0,
	          seenChips: target.chips || 0
	        };

	        if (effect === 'heart_read') {
	          var bb = gameContext.blinds || 20;
	          var betBB = bb > 0 ? (target.currentBet || 0) / bb : 0;
	          var diff = (target.ai && target.ai.difficultyType) || (target.personality && target.personality.difficulty) || 'regular';
	          var risk = (target.ai && target.ai.riskType) || (target.personality && target.personality.riskAppetite) || 'balanced';
	          var startStack = Math.max(1, (target.totalBet || 0) + (target.currentBet || 0) + (target.chips || 0));
	          var pressureScore = Math.max(0, Math.min(1, ((target.totalBet || 0) + (target.currentBet || 0)) / startStack));
	          var bluffScore = 0;
	          if (diff === 'noob') bluffScore = betBB > 5 ? 0.7 : betBB > 2 ? 0.35 : 0.1;
	          else if (diff === 'regular') bluffScore = betBB > 6 ? 0.2 : betBB > 3 ? 0.05 : -0.05;
	          else bluffScore = betBB > 8 ? -0.05 : -0.12;
	          if (risk === 'maniac') bluffScore += 0.15;
	          else if (risk === 'aggressive') bluffScore += 0.08;
	          else if (risk === 'rock') bluffScore -= 0.12;
	          else if (risk === 'passive') bluffScore -= 0.08;
	          entries.push(Object.assign(base, {
	            infoLevel: 'intent',
	            confidence: 0.62,
	            bluffScore: Math.max(-1, Math.min(1, bluffScore)),
	            pressureScore: pressureScore
	          }));
	          continue;
	        }

	        var preflopStrength = null;
	        var observedStrength = null;
	        var handRank = 0;
	        var handName = 'Preflop';
	        if (board.length > 0 && global.PokerAI && typeof global.PokerAI.evaluateHandStrength === 'function') {
	          var hr = global.PokerAI.evaluateHandStrength(target.cards, board);
	          handRank = hr && hr.rank != null ? hr.rank : 1;
	          handName = hr && hr.name ? hr.name : '?';
	          observedStrength = strengthMap[handRank] != null ? strengthMap[handRank] : 15;
	        } else if (global.PokerAI && typeof global.PokerAI.evaluatePreflopStrength === 'function') {
	          preflopStrength = global.PokerAI.evaluatePreflopStrength(target.cards);
	        }

	        var level = 'analysis';
	        var confidence = 0.72;
	        if (effect === 'clairvoyance' || effect === 'reversal') {
	          level = 'perfect';
	          confidence = effect === 'clairvoyance' ? 0.98 : 0.92;
	        }

	        var intel = Object.assign(base, {
	          infoLevel: level,
	          confidence: confidence,
	          observedStrength: observedStrength,
	          preflopStrength: preflopStrength,
	          handRank: handRank,
	          handName: handName
	        });
	        if (level === 'perfect') {
	          intel.knownCards = target.cards.map(function(card) {
	            return { rank: card.rank, suit: card.suit };
	          });
	        }
	        entries.push(intel);
	      }

	      return entries;
	    }

	    _selectNpcScoutTarget(owner, opponents) {
	      if (!opponents || opponents.length === 0) return null;
	      var best = opponents[0];
	      var bestScore = -Infinity;
	      for (var i = 0; i < opponents.length; i++) {
	        var opp = opponents[i];
	        var score = (opp.currentBet || 0) * 2 + (opp.totalBet || 0) + (opp.type === 'human' ? 20 : 0);
	        if (score > bestScore) {
	          best = opp;
	          bestScore = score;
	        }
	      }
	      return best;
	    }

	    /**
	     * 重置回合内技能使用记录（每个 betting round 开始时调用）
     */
    resetTurnSkillTracking() {
      this._turnSkillUsed = {};
    }

    /**
     * 新局开始时重置所有 toggle 技能（关闭状态）
     */
    resetToggleSkills() {
      for (const [, skill] of this.skills) {
        if (skill.activation === ACTIVATION.TOGGLE && skill.active) {
          skill.active = false;
          this._log('SKILL_TOGGLE_OFF', {
            owner: skill.ownerName, key: skill.skillKey, effect: skill.effect
          });
          this.emit('skill:toggle_off', { skill });
        }
      }
    }

    /**
     * NPC AI 决定是否使用某个主动技能
     */
    _npcShouldUseSkill(skill, owner, gameContext) {
      if (skill && skill.pendingImplementation) return false;
      // 委托给外部 AI 决策（SkillAI）
      if (this.skillDecideFn) {
        const mana = this.getMana(skill.ownerId);
        if (gameContext && !gameContext.skillSystem) gameContext.skillSystem = this;
        return this.skillDecideFn(skill, owner, gameContext, this.pendingForces, mana);
      }
      // 无回调时的简单 fallback
      const phaseProgression = { preflop: 0.15, flop: 0.35, turn: 0.55, river: 0.75 };
      return Math.random() < (phaseProgression[gameContext.phase] || 0.2);
    }

    _prepareNpcSkillUse(skill, finalOptions) {
      if (skill && skill.pendingImplementation) return null;
      var actualCost = this._getSkillActualManaCost(skill, finalOptions);
      if (actualCost > 0) {
        const pool = this.manaPools.get(skill.ownerId);
        if (!pool || pool.current < actualCost) return null;
        this.spendMana(skill.ownerId, actualCost);
      }
      if (skill && skill.effect === EFFECT.BLIND_BOX) {
        var blindBoxScopeKey = 'skill:' + String(skill.ownerId) + ':blind_box:match_once';
        if (typeof this.consumeMatchScopedUse === 'function') {
          var consumed = this.consumeMatchScopedUse(blindBoxScopeKey, {
            ownerId: skill.ownerId,
            ownerName: skill.ownerName,
            skillKey: skill.skillKey,
            effect: skill.effect
          });
          if (!consumed) return null;
        }
      }

      skill.currentCooldown = skill.cooldown;
      if (skill.usesPerGame > 0) {
        skill.gameUsesRemaining--;
      }
      return { actualCost: actualCost };
    }

    _executeNpcSkill(skill, owner, gameContext, resolvedOptions) {
      var force = null;
      var targetName = null;
      var finalOptions = resolvedOptions || this._resolveSkillExecutionOptions(skill, owner, gameContext, {
        gameContext: gameContext
      });
      var targetOverride = finalOptions && finalOptions.targetId != null ? finalOptions.targetId : null;
      var protectOverride = finalOptions && finalOptions.protectId != null ? finalOptions.protectId : null;

      switch (skill.effect) {
        case EFFECT.COOLER:
          force = this._applyCoolerMark(skill, gameContext, targetOverride);
          break;
        case EFFECT.SKILL_SEAL:
          this._applySeal(skill, gameContext, targetOverride);
          force = { targetId: targetOverride };
          break;
        case EFFECT.CLAIRVOYANCE:
          force = { targetId: targetOverride, protectId: protectOverride };
          this._emitSkillActivated({
            skill: skill,
            type: 'clairvoyance',
            targetId: targetOverride,
            protectId: protectOverride
          }, finalOptions);
          break;
        case EFFECT.BUBBLE_LIQUIDATION:
          force = { targetId: targetOverride };
          this._emitSkillActivated({
            skill: skill,
            type: 'bubble_liquidation',
            targetId: targetOverride
          }, finalOptions);
          break;
        case EFFECT.RULE_REWRITE:
          this._emitSkillActivated({
            skill: skill,
            type: 'rule_rewrite'
          }, finalOptions);
          force = { targetId: targetOverride };
          break;
        case EFFECT.BLIND_BOX:
          this._emitSkillActivated({
            skill: skill,
            type: 'blind_box'
          }, finalOptions);
          force = { targetId: targetOverride };
          break;

        case EFFECT.DEAL_CARD:
          this._emitSkillActivated({
            skill: skill,
            type: 'deal_card',
            cardType: finalOptions && finalOptions.cardType,
            slotIndex: finalOptions && finalOptions.slotIndex
          }, finalOptions);
          force = {};
          break;

        case EFFECT.GATHER_OR_SPREAD:
          this._emitSkillActivated({
            skill: skill,
            type: 'gather_or_spread',
            mode: finalOptions && finalOptions.mode
          }, finalOptions);
          force = {};
          break;

        case EFFECT.PRE_DECOLOR:
        case EFFECT.NULL_READ:
          force = this._skillToForce(skill, gameContext);
          if (protectOverride != null) force.protectId = protectOverride;
          this._queuePendingForce(force, { reason: 'npc_skill', effect: skill.effect });
          break;

        case EFFECT.ABSOLUTION:
          this._emitSkillActivated({
            skill: skill,
            type: 'absolution'
          }, { gameContext: gameContext });
          break;
        case EFFECT.BENEDICTION:
          this._emitSkillActivated({
            skill: skill,
            type: 'benediction',
            targetId: targetOverride
          }, { gameContext: gameContext });
          break;

        case EFFECT.HOUSE_EDGE: {
          this._emitSkillActivated({ skill: skill, type: 'house_edge' }, finalOptions);
          force = { targetId: finalOptions && finalOptions.targetId != null ? finalOptions.targetId : null };
          break;
        }
        case EFFECT.DEBT_CALL: {
          this._emitSkillActivated({ skill: skill, type: 'debt_call' }, finalOptions);
          force = { targetId: finalOptions && finalOptions.targetId != null ? finalOptions.targetId : null };
          break;
        }
        case EFFECT.RECLASSIFICATION: {
          this._emitSkillActivated({
            skill: skill,
            type: 'reclassification',
            targetId: targetOverride
          }, finalOptions);
          force = { targetId: targetOverride };
          break;
        }
        case EFFECT.GENERAL_RULING: {
          this._emitSkillActivated({
            skill: skill,
            type: 'general_ruling'
          }, finalOptions);
          force = {};
          break;
        }

        default:
          force = this._skillToForce(skill, gameContext);
          var psycheEffects = ['clarity', 'refraction', 'reversal', 'heart_read', 'clairvoyance'];
          if (protectOverride != null) {
            force.protectId = protectOverride;
          } else if (psycheEffects.indexOf(skill.effect) >= 0 && force.protectId == null) {
            force.protectId = skill.ownerId;
          }
          if (targetOverride != null && force.type === 'curse') force.targetId = targetOverride;
          this._queuePendingForce(force, { reason: 'npc_skill', effect: skill.effect });
          break;
      }

      if (force && force.targetId != null) {
        targetName = (gameContext.players.find(function(p) { return p.id === force.targetId; }) || {}).name || ('ID:' + force.targetId);
      }
      this._captureNpcScoutIntel(skill, owner, gameContext);

      return {
        ownerName: skill.ownerName,
        ownerId: skill.ownerId,
        skillKey: skill.skillKey,
        effect: skill.effect,
        tier: skill.tier,
        targetId: force ? force.targetId : null,
        targetName: targetName,
        protectId: force ? force.protectId : null,
        options: Object.assign({}, finalOptions || {})
      };
    }

    _effectName(effect) {
      const names = {
        fortune:     '天命·幸运',
        curse:       '狂厄·凶',
        clarity:     '灵视·澄澈',
        refraction:  '灵视·折射',
        reversal:    '灵视·真理',
        null_field:  '虚无·屏蔽',
        void_shield: '虚无·绝缘',
        purge_all:   '虚无·现实',
        royal_decree:'天命·敕令',
        heart_read:  '灵视·读心',
        cooler:      '狂厄·冤家牌',
        skill_seal:  '狂厄·冻结令',
        clairvoyance:'灵视·估价眼',
        bubble_liquidation:'灵视·泡沫清算',
        miracle:     '天命·命大',
        lucky_find:  '天命·捡到了',
        deal_card:   '灵视·发牌',
        gather_or_spread: '灵视·收牌/铺牌',
        absolution:  '天命·赦免',
        benediction: '天命·祝福',
        reclassification:'灵视·改判',
        general_ruling:'灵视·总务裁定',
        house_edge:  '狂厄·抽水',
        debt_call:   '狂厄·催收'
      };
      return names[effect] || '未知魔力';
    }

    // ========== Triggered 技能检查 ==========

    /**
     * 检查所有 triggered 类型技能的触发条件
     */
    checkTriggers(gameContext) {
      for (const [, skill] of this.skills) {
        if (skill.activation !== ACTIVATION.TRIGGERED) continue;
        if (!skill.trigger) continue;
        // 冷却中不触发
        if (skill.currentCooldown > 0) continue;
        // 整局次数用尽不触发
        if (skill.usesPerGame > 0 && skill.gameUsesRemaining <= 0) continue;
        // 已弃牌不触发
        const owner = gameContext.players ? gameContext.players.find(p => p.id === skill.ownerId) : null;
        if (owner && !this._isPlayerAvailable(owner)) continue;

        let shouldActivate = false;

        switch (skill.trigger.condition) {
          case 'runtime_only': {
            // 由 Runtime 模块独占触发；主流程不再兜底。
            shouldActivate = false;
            break;
          }
          case 'chips_below': {
            if (owner && owner.chips < (skill.trigger.value || 200)) shouldActivate = true;
            break;
          }
          case 'chips_percent_below': {
            // 筹码低于起始筹码的 X%（如 0.10 = 10%）
            if (owner) {
              const baselineChips = owner.initialChips || owner.startingChips || owner.baseChips || ((owner.chips || 0) + (owner.totalBet || 0));
              const threshold = baselineChips > 0 ? skill.trigger.value || 0.10 : 0;
              if (baselineChips > 0 && owner.chips <= baselineChips * threshold) shouldActivate = true;
            }
            break;
          }
          case 'chips_above': {
            if (owner && owner.chips > (skill.trigger.value || 2000)) shouldActivate = true;
            break;
          }
          case 'pot_above': {
            if (gameContext.pot > (skill.trigger.value || 500)) shouldActivate = true;
            break;
          }
          case 'phase': {
            if (gameContext.phase === skill.trigger.value) shouldActivate = true;
            break;
          }
          case 'random_chance': {
            // 每轮随机触发（如 0.25 = 25%）
            shouldActivate = Math.random() < (skill.trigger.value || 0.25);
            break;
          }
        }

        if (shouldActivate && !skill.active) {
          skill.active = true;
          // 触发技能产生 force
          this._queuePendingForce(this._skillToForce(skill), {
            reason: 'skill_triggered',
            effect: skill.effect
          });
          // 设置冷却和次数
          skill.currentCooldown = skill.cooldown;
          if (skill.usesPerGame > 0) skill.gameUsesRemaining--;
          this._log('SKILL_TRIGGERED', {
            owner: skill.ownerName, key: skill.skillKey,
            condition: skill.trigger.condition, power: skill.power
          });
          this.emit('skill:triggered', { skill });
        } else if (!shouldActivate && skill.active) {
          skill.active = false;
        }
      }
    }

    // ========== 收集当前生效的 Forces ==========

    /**
     * 收集所有当前生效的力（供 MonteOfZero 使用）
     * @param {object} [gameContext] - { players } 用于检查弃牌状态
     * @returns {Array} forces 列表
     */
    collectActiveForces(gameContext) {
      const forces = [];
      // 构建弃牌玩家 id 集合
      const foldedIds = new Set();
      if (gameContext && gameContext.players) {
        for (const p of gameContext.players) {
          if (!this._isPlayerAvailable(p)) foldedIds.add(p.id);
        }
      }

      // 1. 反噬
      for (const [ownerId, state] of Array.from(this.backlashStates.entries())) {
        if (!state || !state.active || state.counter <= 0) continue;
        forces.push({
          ownerId: -1,
          ownerName: 'SYSTEM',
          type: 'backlash',
          level: 5,
          power: 50,
          targetId: ownerId,
          source: 'backlash'
        });
      }

      // 2. 被动技能（passive, active=true）— 弃牌者不生效
      for (const [, skill] of this.skills) {
        if (!skill.active) continue;
        if (skill.activation !== ACTIVATION.PASSIVE && skill.activation !== ACTIVATION.TOGGLE) continue;
        if (foldedIds.has(skill.ownerId)) continue;

        forces.push(this._skillToForce(skill));
      }

      // 3. 本回合 pending forces（主动技能 + NPC 技能 + triggered）
      // 弃牌者的 pending forces 也应失效
      for (const f of this.pendingForces) {
        if (foldedIds.has(f.ownerId) && !f._persistAfterOwnerFold) continue;
        forces.push(f);
      }

      return forces;
    }

    /**
     * 将技能转为 force 对象（供 MonteOfZero 消费）
     * @param {object} skill
     * @param {object} [gameContext] - 用于 curse 智能选目标
     */
    _skillToForce(skill, gameContext) {
      // fortune 类专属技能 → fortune type (MoZ 只认 fortune/curse)
      const FORTUNE_EFFECTS = ['royal_decree', 'miracle', 'lucky_find', 'absolution', 'benediction'];
      const forceType = FORTUNE_EFFECTS.indexOf(skill.effect) >= 0 ? 'fortune' : skill.effect;
      const force = {
        ownerId: skill.ownerId,
        ownerName: skill.ownerName,
        type: forceType,
        power: skill.power || 0,
        activationId: skill._activationId || null,
        activation: skill.activation,
        source: skill.activation,
        // 阶级压制元数据（供 MoZ 使用）
        tier: skill.tier != null ? skill.tier : 3,
        attr: skill.attr || null,
        skillKey: skill.skillKey,
        suppressTiers: skill.suppressTiers || null,
        suppressAttr: skill.suppressAttr || null,
        suppressAll: skill.suppressAll || false,
        cannotAffect: skill.cannotAffect || null
      };

      // Curse 单体指向：委托外部 AI 选目标
      if (skill.effect === 'curse' && this.curseTargetFn) {
        const players = gameContext ? gameContext.players : null;
        force.targetId = this.curseTargetFn(skill.ownerId, players);
      }

      return force;
    }

    /**
     * 冤家牌标记：不是直接 fortune+curse，而是给目标挂标记，
     * 供后续选牌算法、封印和特质联动读取。
     * @param {object} skill
     * @param {object} [gameContext]
     * @param {number|null} [targetOverride]
     * @returns {{ targetId:number|null, targetName:string|null }|null}
     */
    _applyCoolerMark(skill, gameContext, targetOverride) {
      let targetId = targetOverride != null ? targetOverride : null;
      if (targetId == null && this.curseTargetFn) {
        const players = gameContext ? gameContext.players : null;
        targetId = this.curseTargetFn(skill.ownerId, players);
      }
      if (targetId == null) return null;

      const targetName = this._findOwnerName(targetId);
      this.setStatusMark(targetId, 'cooler_mark', {
        sourceId: skill.ownerId,
        sourceName: skill.ownerName,
        icon: '../../../assets/svg/spade-skull.svg',
        title: '冤家牌',
        tone: 'chaos',
        duration: 'hand',
        skillKey: skill.skillKey
      });

      this._log('COOLER_MARK_APPLIED', {
        caster: skill.ownerName,
        target: targetName,
        targetId: targetId
      });

      return { targetId: targetId, targetName: targetName };
    }

    /**
     * 封印 — 冻结目标所有主动技能 2 回合
     * @param {object} skill
     */
    _applySeal(skill, gameContext, targetOverride) {
      // 选目标：优先使用 UI 传入的 targetOverride
      let targetId = null;
      if (targetOverride != null) {
        targetId = targetOverride;
      } else if (this.curseTargetFn) {
        const players = gameContext ? gameContext.players : null;
        targetId = this.curseTargetFn(skill.ownerId, players);
      }
      if (targetId == null) return;

      const extraDuration = this.hasStatusMark(targetId, 'cooler_mark') ? 1 : 0;
      const SEAL_DURATION = 2 + extraDuration;
      const currentPhase = gameContext && gameContext.phase ? gameContext.phase : 'preflop';
      const currentPhaseIndex = this._getPhaseIndex(currentPhase);
      const startPhaseIndex = currentPhaseIndex + 1;
      const endPhaseIndex = currentPhaseIndex + SEAL_DURATION;
      let sealCount = 0;

      for (const [, s] of this.skills) {
        if (s.ownerId !== targetId) continue;
        if (s.activation === ACTIVATION.PASSIVE) continue;
        // 封印：独立于技能自身 CD，避免两套计时互相污染
        s._sealed = SEAL_DURATION;
        sealCount++;
      }

      const targetName = this._findOwnerName(targetId);
      this._log('SEAL_APPLIED', {
        caster: skill.ownerName, target: targetName,
        targetId: targetId, skillsSealed: sealCount, duration: SEAL_DURATION
      });
      this.emit('skill_seal:applied', {
        casterId: skill.ownerId, casterName: skill.ownerName,
        targetId: targetId, targetName: targetName,
        skillsSealed: sealCount, duration: SEAL_DURATION,
        boostedByCooler: extraDuration > 0
      });
      this.setStatusMark(targetId, 'sealed', {
        sourceId: skill.ownerId,
        sourceName: skill.ownerName,
        icon: '../../../assets/svg/crossed-chains.svg',
        title: '封印',
        tone: 'chaos',
        duration: 'rounds',
        remaining: SEAL_DURATION,
        startPhaseIndex: startPhaseIndex,
        endPhaseIndex: endPhaseIndex,
        skillKey: skill.skillKey
      });
      this.syncSealStates(currentPhase);
    }

    /**
     * 规则篡改 — 随机篡改场上一个 pending force 的归属或类型
     * 效果不确定：可能翻转 fortune↔curse，可能改变归属（ownerId），可能两者都改
     * @param {object} skill
     * @returns {object} rewriteResult - { target, action, before, after }
     */
    _applyRuleRewrite(skill) {
      // 筛选可篡改的 force（排除 void/meta 类型和自己的 force）
      const candidates = this.pendingForces.filter(f =>
        f.ownerId !== skill.ownerId &&
        f.type !== 'null_field' && f.type !== 'void_shield' && f.type !== 'purge_all'
      );

      if (candidates.length === 0) {
        this._log('RULE_REWRITE_MISS', { caster: skill.ownerName, reason: 'no_candidates' });
        return { action: 'miss', reason: 'no_candidates' };
      }

      // 随机选一个 force
      const target = candidates[Math.floor(Math.random() * candidates.length)];
      const before = { type: target.type, ownerId: target.ownerId, ownerName: target.ownerName, power: target.power };

      // 随机篡改方式: 0=翻转类型, 1=改变归属, 2=两者都改
      const action = Math.floor(Math.random() * 3);
      var actionName = '';

      if (action === 0 || action === 2) {
        // 翻转 fortune↔curse
        if (target.type === 'fortune') {
          target.type = 'curse';
          actionName = 'type_flip';
        } else if (target.type === 'curse') {
          target.type = 'fortune';
          // curse 变 fortune 时清除 targetId（不再指向某人）
          target.targetId = null;
          actionName = 'type_flip';
        } else {
          // 非 fortune/curse 类型：随机变成 fortune 或 curse
          target.type = Math.random() < 0.5 ? 'fortune' : 'curse';
          actionName = 'type_mutate';
        }
      }

      if (action === 1 || action === 2) {
        // 改变归属：在所有已知 owner 中随机选一个不同的
        var allOwnerIds = [];
        for (var i = 0; i < this.pendingForces.length; i++) {
          if (allOwnerIds.indexOf(this.pendingForces[i].ownerId) < 0) {
            allOwnerIds.push(this.pendingForces[i].ownerId);
          }
        }
        // 加入施法者自己作为候选
        if (allOwnerIds.indexOf(skill.ownerId) < 0) allOwnerIds.push(skill.ownerId);
        var otherOwners = allOwnerIds.filter(function(id) { return id !== target.ownerId; });
        if (otherOwners.length > 0) {
          var newOwner = otherOwners[Math.floor(Math.random() * otherOwners.length)];
          target.ownerId = newOwner;
          target.ownerName = this._findOwnerName(newOwner);
          actionName = action === 2 ? 'both' : 'owner_swap';
        }
      }

      // 功率随机波动 ±30%
      var powerMult = 0.7 + Math.random() * 0.6; // 0.7 ~ 1.3
      target.power = Math.round(target.power * powerMult);
      target._rewritten = true;
      target._rewrittenBy = skill.ownerName;

      var result = {
        action: actionName || 'power_only',
        before: before,
        after: { type: target.type, ownerId: target.ownerId, ownerName: target.ownerName, power: target.power }
      };

      this._mutatePendingForce(target, before, {
        reason: 'rule_rewrite',
        skillKey: skill.skillKey,
        action: result.action
      });

      this._log('RULE_REWRITE', {
        caster: skill.ownerName, action: result.action,
        before: result.before, after: result.after
      });
      this.emit('trixie:rule_rewrite', result);
      return result;
    }

    /**
     * 盲盒派对 — 打碎所有 pending forces，随机重新分配给场上玩家
     * 总力量守恒，但归属完全随机。Void 类 force 不受影响。
     * @param {object} skill
     * @param {object} [gameContext]
     * @returns {object} boxResult - { shuffled, preserved }
     */
    _applyBlindBox(skill, gameContext) {
      // 分离：Void 类 force 不受影响
      var preserved = [];
      var shuffleable = [];
      for (var i = 0; i < this.pendingForces.length; i++) {
        var f = this.pendingForces[i];
        if (f.attr === 'void' || f.type === 'null_field' || f.type === 'void_shield' || f.type === 'purge_all') {
          preserved.push(f);
        } else {
          shuffleable.push(f);
        }
      }

      if (shuffleable.length === 0) {
        this._log('BLIND_BOX_MISS', { caster: skill.ownerName, reason: 'no_forces' });
        return { shuffled: 0, preserved: preserved.length };
      }

      // 收集所有活跃玩家 ID
      var playerIds = [];
      if (gameContext && gameContext.players) {
        for (var j = 0; j < gameContext.players.length; j++) {
          if (this._isPlayerAvailable(gameContext.players[j])) playerIds.push(gameContext.players[j].id);
        }
      }
      if (playerIds.length === 0) {
        // 降级：从现有 force 中提取 owner
        for (var k = 0; k < shuffleable.length; k++) {
          if (playerIds.indexOf(shuffleable[k].ownerId) < 0) playerIds.push(shuffleable[k].ownerId);
        }
        if (playerIds.indexOf(skill.ownerId) < 0) playerIds.push(skill.ownerId);
      }

      // 随机重新分配所有 force 的归属
      for (var m = 0; m < shuffleable.length; m++) {
        var sf = shuffleable[m];
        var before = this._snapshotForce(sf);
        var newOwnerId = playerIds[Math.floor(Math.random() * playerIds.length)];
        sf.ownerId = newOwnerId;
        sf.ownerName = this._findOwnerName(newOwnerId);
        // curse 的 targetId 也随机重分配（指向非自己的某人）
        if (sf.type === 'curse' && sf.targetId != null) {
          var otherIds = playerIds.filter(function(id) { return id !== newOwnerId; });
          sf.targetId = otherIds.length > 0 ? otherIds[Math.floor(Math.random() * otherIds.length)] : null;
        }
        // 功率随机波动 ±20%
        sf.power = Math.round(sf.power * (0.8 + Math.random() * 0.4));
        sf._blindBoxed = true;
        sf._blindBoxedBy = skill.ownerName;
        this._mutatePendingForce(sf, before, {
          reason: 'blind_box',
          skillKey: skill.skillKey
        });
      }

      // 重组 pendingForces
      this._replacePendingForces(preserved.concat(shuffleable), {
        reason: 'blind_box',
        skillKey: skill.skillKey
      });

      var result = { shuffled: shuffleable.length, preserved: preserved.length };
      this._log('BLIND_BOX', { caster: skill.ownerName, shuffled: result.shuffled, preserved: result.preserved });
      this.emit('trixie:blind_box', result);
      return result;
    }

    /**
     * 查找 ownerId 对应的名字
     * @private
     */
    _findOwnerName(ownerId) {
      for (const [, s] of this.skills) {
        if (s.ownerId === ownerId) return s.ownerName;
      }
      return 'ID:' + ownerId;
    }

    _getPhaseIndex(phase) {
      return PHASE_INDEX[phase] != null ? PHASE_INDEX[phase] : -1;
    }

    syncSealStates(currentPhase) {
      const currentIndex = this._getPhaseIndex(currentPhase);

      for (const ownerId of Array.from(this.statusMarks.keys())) {
        const marks = this.statusMarks.get(ownerId);
        const sealMark = marks && marks.sealed;
        if (!sealMark) continue;

        const startPhaseIndex = sealMark.startPhaseIndex != null ? sealMark.startPhaseIndex : currentIndex;
        const endPhaseIndex = sealMark.endPhaseIndex != null ? sealMark.endPhaseIndex : currentIndex;
        let remaining = 0;

        if (currentIndex < 0 || currentIndex > endPhaseIndex) {
          remaining = 0;
        } else if (currentIndex < startPhaseIndex) {
          remaining = Math.max(0, endPhaseIndex - startPhaseIndex + 1);
        } else {
          remaining = Math.max(0, endPhaseIndex - currentIndex + 1);
        }

        for (const [, skill] of this.skills) {
          if (skill.ownerId !== ownerId) continue;
          skill._sealed = remaining;
        }

        if (remaining > 0) {
          this.setStatusMark(ownerId, 'sealed', Object.assign({}, sealMark, {
            remaining: remaining
          }));
        } else {
          this.clearStatusMark(ownerId, 'sealed');
        }
      }
    }

    // ========== 回合生命周期 ==========

    /**
     * 每轮下注结束后调用
     */
    onRoundEnd(gameContext) {
      // 注意：pendingForces 不在这里清除！
      // 它们会在 mozSelectAndPick() 发牌后清除，
      // 确保玩家在下注阶段激活的技能能在下一次发牌时生效。
      // 先发街末结算事件，让 Runtime 角色以“本街结束时的真实状态”结算。
      // 例如 POPPY 的街末判定不应先吃到自然回蓝。
      this.emit('round:end', {});
      this.emit('street:resolved', {
        phase: gameContext && gameContext.phase ? gameContext.phase : null,
        pot: gameContext && gameContext.pot != null ? gameContext.pot : null,
        board: gameContext && Array.isArray(gameContext.board) ? gameContext.board.slice() : [],
        allIn: !!(gameContext && gameContext.allIn),
        pendingForces: this.pendingForces.map(this._snapshotForce.bind(this))
      });

      // 街末角色效果完成后，再恢复所有 mana。
      this.regenAllMana();

      // 注意：toggle 技能（如绝缘）不在回合结束时重置
      // 它们由玩家手动切换开/关，跨手牌保持状态

      // 冷却按「阶段」递减：一回合 = 一个德州阶段 (preflop/flop/turn/river)
      // cooldown=2 意味着 2 个阶段后可用，skill_seal duration=2 意味着 2 个阶段后解封
      for (const [, skill] of this.skills) {
        if (skill.currentCooldown > 0) {
          skill.currentCooldown--;
        }
      }
    }

    /**
     * 新一手牌开始
     */
    onNewHand() {
      var preservedForces = Array.isArray(this.pendingForces)
        ? this.pendingForces.filter(function(force) {
            return !!(force && force._persistAcrossHandStart);
          })
        : [];
      this.pendingForces = preservedForces;
      this.clearAllStatusMarks();
      this._clearStreetScopedUses();

      // 重置所有非 passive/toggle 技能状态
      // Toggle 技能跨手牌保持状态，由玩家手动切换
      for (const [, skill] of this.skills) {
        if (skill.activation !== ACTIVATION.PASSIVE && skill.activation !== ACTIVATION.TOGGLE) {
          skill.active = false;
        }
        skill._sealed = 0;
        if (skill.usesPerGame > 0) {
          skill.gameUsesRemaining = skill.usesPerGame;
        }
        // 注意：冷却不在这里重置，跨手牌保留剩余CD
        // cooldown 在 onRoundEnd() 按阶段递减
      }

      this._advanceBacklashStreet('preflop');
      this.emit('hand:start', {});
    }

    /**
     * 新一街真正开始（翻牌/转牌/河牌）
     * pre-deal 技能阶段仍算上一街，因此 streetUses 不在 onRoundEnd() 清空。
     * @param {string} phase
     */
    onStreetStart(phase) {
      this._advanceBacklashStreet(phase || null);
      this._clearStreetScopedUses();
      this.emit('street:start', {
        phase: phase || null
      });
    }

    /**
     * 完全重置
     */
    reset() {
      this.pendingForces = [];
      this.backlash = { active: false, counter: 0 };
      this.backlashStates.clear();
      if (this.assetLedger && typeof this.assetLedger.clearAll === 'function') {
        this.assetLedger.clearAll();
      }
      this.clearMatchScopedUses();
      this._clearStreetScopedUses();

      for (const [, pool] of this.manaPools) {
        pool.current = pool.max;
      }

      for (const [, skill] of this.skills) {
        skill.active = (skill.activation === ACTIVATION.PASSIVE);
        skill.currentCooldown = 0;
        // 重置整局使用次数
        if (skill.usesPerGame > 0) {
          skill.gameUsesRemaining = skill.usesPerGame;
        }
      }

      this.emit('system:reset', {});
    }

    // ========== 状态查询 ==========

    getState() {
      const heroId = this._heroId != null ? this._heroId : 0;
      const rinoMana = this.getMana(heroId);
      return {
        backlash: { ...this.backlash },
        rinoMana: rinoMana.current,
        rinoManaMax: rinoMana.max,
        pendingForces: this.pendingForces.map(f => ({
          owner: f.ownerName, type: f.type, tier: f.tier, power: f.power
        })),
        skills: Array.from(this.skills.values()).map(s => ({
          uniqueId: s.uniqueId,
          owner: s.ownerName,
          ownerId: s.ownerId,
          key: s.skillKey,
          effect: s.effect,
          tier: s.tier,
          activation: s.activation,
          active: s.active,
          manaCost: s.manaCost,
          cooldown: s.currentCooldown,
          usesPerGame: s.usesPerGame || 0,
          gameUsesRemaining: s.gameUsesRemaining != null ? s.gameUsesRemaining : 0,
          usesPerStreet: s.usesPerStreet || 0,
          streetUses: this._getStreetScopedUseCount(s)
        })),
        matchScopedUses: Array.from(this.matchScopedUses.entries()).map(entry => ({
          key: entry[0],
          payload: Object.assign({}, entry[1])
        })),
      };
    }

    /**
     * 获取力量对比摘要
     */
    getForcesSummary() {
      const summary = { allies: [], enemies: [], total: { ally: 0, enemy: 0 } };

      // 被动力
      for (const [, skill] of this.skills) {
        if (!skill.active) continue;
        if (skill.activation !== ACTIVATION.PASSIVE) continue;

        const entry = { name: skill.ownerName, type: skill.effect, tier: skill.tier, power: skill.power };
        const hid4 = this._heroId != null ? this._heroId : 0;
        if (skill.ownerId === hid4) {
          summary.allies.push(entry);
          summary.total.ally += entry.power;
        } else {
          summary.enemies.push(entry);
          summary.total.enemy += entry.power;
        }
      }

      // pending forces
      for (const f of this.pendingForces) {
        if (f.type === 'purge_all') continue;
        const entry = { name: f.ownerName, type: f.type, tier: f.tier, power: f.power };
        const hid5 = this._heroId != null ? this._heroId : 0;
        if (f.ownerId === hid5) {
          summary.allies.push(entry);
          summary.total.ally += entry.power;
        } else {
          summary.enemies.push(entry);
          summary.total.enemy += entry.power;
        }
      }

      return summary;
    }

    /**
     * 获取某个玩家的所有技能
     */
    getPlayerSkills(ownerId) {
      return Array.from(this.skills.values()).filter(s => s.ownerId === ownerId);
    }

    /**
     * 检查是否有清场技能 (purge_all / reversal) 在 pending
     */
    hasPurgeActive() {
      return this.pendingForces.some(f =>
        f.type === 'purge_all' || f.type === 'reversal' ||
        f.type === 'clarity' || f.type === 'refraction'
      );
    }

    // ========== 日志 ==========

    _log(type, data) {
      if (this.onLog) this.onLog(type, data);
      console.log(`[SkillSystem] ${type}`, data);
    }
  }

  // ========== 导出 ==========
  global.SkillSystem = SkillSystem;
  global.SkillSystem.ACTIVATION = ACTIVATION;
  global.SkillSystem.EFFECT = EFFECT;
  global.SkillSystem.UNIVERSAL_SKILLS = UNIVERSAL_SKILLS;
  global.SkillSystem.MANA_BY_LEVEL = MANA_BY_LEVEL;
  global.SkillSystem.lookupSkill = lookupSkill;
  global.SkillSystem.calculateSlots = calculateSlots;
  global.SkillSystem.canLearnSkill = canLearnSkill;
  global.SkillSystem.deriveSkillsFromAttrs = deriveSkillsFromAttrs;

})(typeof window !== 'undefined' ? window : global);
