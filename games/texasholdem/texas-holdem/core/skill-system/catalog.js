(function (global) {
  'use strict';

  var modules = global.AceSkillSystemModules = global.AceSkillSystemModules || {};

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
      PSYCHE:      'psyche',        // Psyche: 生成 Psyche值，按矩阵分配信息/防守/转化
      VOID:        'void',          // Void: KAZU 专属现实干涉
      // --- 角色专属 ---
      ROYAL_DECREE:'royal_decree',   // Rino:   超强天命（fortune power=70）
      HEART_READ:  'heart_read',     // Rino Psyche: 读心（信息+少量防守 Psyche）
      COOLER:      'cooler',         // SIA:    冤家牌标记（做局）
      SKILL_SEAL:  'skill_seal',     // SIA:    冻结令
      CLAIRVOYANCE:'clairvoyance',   // VV:     估价建仓（目标/档位/方向）
      BUBBLE_LIQUIDATION:'bubble_liquidation', // VV: 偏离清算（指定目标投资轮）
      MIRACLE:     'miracle',        // POPPY:  命大（绝境被动触发）
      LUCKY_FIND:  'lucky_find',     // POPPY:  捡到了（街末被动判定）
      // --- Trixie (鬼牌) ---
      RULE_REWRITE:'rule_rewrite',    // Trixie: 规则篡改（消耗鬼牌改写为 fortune / curse，后续由 Runtime 面板实现）
      BLIND_BOX:   'blind_box',       // Trixie: 盲盒派对（消耗整张鬼牌发动账户篡位，后续由 Runtime 实现）
      // --- Cota (可塔) ---
      DEAL_CARD:   'deal_card',       // Cota:  发牌（Runtime 牌列系统）
      GATHER_OR_SPREAD: 'gather_or_spread', // Cota: 收牌/铺牌（Runtime 牌槽调度）
      // --- Eulalia (尤拉莉亚) ---
      ABSOLUTION:  'absolution',      // Eulalia: 赦免（三街承灾合同，第三街末平分爆出）
      BENEDICTION: 'benediction',     // Eulalia: 祝福（对非自身目标施加 fortune，并吸取相关 curse 记为承灾）
      // --- Kako (司伽子) ---
      RECLASSIFICATION:'reclassification', // Kako: 改判（发牌前单目标裁定）
      GENERAL_RULING:'general_ruling',     // Kako: 总务裁定（发牌前全场统一裁定）
      // --- Kuzuha (久世九叶) ---
      HOUSE_EDGE:  'house_edge',      // Kuzuha: 抽水（单体 curse + debt rot）
      DEBT_CALL:   'debt_call',       // Kuzuha: 催收（立即结算 debt rot）
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
      psyche: 1,
      heart_read: 1,
      clairvoyance: 1
    };
    const VV_CLAIRVOYANCE_ENTRY_SIZE_EXTRA_COST = {
      1: 20,
      2: 36,
      3: 50
    };

    const SKILL_SYSTEM = {
      MOIRAI: 'moirai',
      CHAOS: 'chaos',
      PSYCHE: 'psyche',
      VOID: 'void'
    };

    const SKILL_KIND = {
      FORTUNE: 'fortune',
      CURSE: 'curse',
      PSYCHE: 'psyche',
      VOID: 'void'
    };

    const UNIVERSAL_SKILL_LEVELS = {
      minor_wish: {
        system: SKILL_SYSTEM.MOIRAI,
        kind: SKILL_KIND.FORTUNE,
        targetMode: 'self',
        icon: 'round-star.svg',
        name: '小愿望',
        description: '低费补运技，用于频繁修正局势。',
        levels: {
          1: { manaCost: 15, power: 15, cooldown: 1 },
          2: { manaCost: 10, power: 15, cooldown: 1 },
          3: { manaCost: 10, power: 20, cooldown: 1 },
          4: { manaCost: 10, power: 20, cooldown: 0, special: { firstUseFreePerHand: true } }
        }
      },
      grand_wish: {
        system: SKILL_SYSTEM.MOIRAI,
        kind: SKILL_KIND.FORTUNE,
        targetMode: 'self',
        icon: 'stars-stack.svg',
        name: '大愿望',
        description: '主力强运技，提供更高强度的 fortune。',
        levels: {
          1: { manaCost: 25, power: 30, cooldown: 2 },
          2: { manaCost: 25, power: 40, cooldown: 2 },
          3: { manaCost: 20, power: 40, cooldown: 1 },
          4: { manaCost: 20, power: 40, cooldown: 1, special: { critChance: 0.25, critMultiplier: 1.5 } }
        }
      },
      divine_order: {
        system: SKILL_SYSTEM.MOIRAI,
        kind: SKILL_KIND.FORTUNE,
        targetMode: 'self',
        icon: 'star-formation.svg',
        name: '神谕',
        description: '高阶天命技，用于关键街强行锁定命运。',
        levels: {
          1: { manaCost: 40, power: 50, cooldown: 3, lockChance: 0.22 },
          2: { manaCost: 40, power: 53, cooldown: 3, lockChance: 0.44 },
          3: { manaCost: 40, power: 56, cooldown: 3, lockChance: 0.66 },
          4: { manaCost: 45, power: 60, cooldown: 3, lockChance: 0.99 }
        }
      },
      hex: {
        system: SKILL_SYSTEM.CHAOS,
        kind: SKILL_KIND.CURSE,
        targetMode: 'enemy',
        icon: 'bleeding-eye.svg',
        name: '咒蚀',
        description: '低费骚扰技，用于频繁施加小额 curse。',
        levels: {
          1: { manaCost: 12, power: 15, cooldown: 1 },
          2: { manaCost: 10, power: 16, cooldown: 1 },
          3: { manaCost: 8, power: 18, cooldown: 0 },
          4: { manaCost: 8, power: 20, cooldown: 0, special: { refundChance: 0.25 } }
        }
      },
      havoc: {
        system: SKILL_SYSTEM.CHAOS,
        kind: SKILL_KIND.CURSE,
        targetMode: 'enemy',
        icon: 'skull-crack.svg',
        name: '灾乱',
        description: '主力厄运技，用于制造中等强度的持续压迫。',
        levels: {
          1: { manaCost: 20, power: 30, cooldown: 2 },
          2: { manaCost: 18, power: 35, cooldown: 2 },
          3: { manaCost: 18, power: 40, cooldown: 1 },
          4: { manaCost: 16, power: 40, cooldown: 1, special: { splashChance: 0.33 } }
        }
      },
      catastrophe: {
        system: SKILL_SYSTEM.CHAOS,
        kind: SKILL_KIND.CURSE,
        targetMode: 'enemy',
        icon: 'reaper-scythe.svg',
        name: '灾厄',
        description: '高阶厄运技，用于把目标强行拖入最差分支。',
        levels: {
          1: { manaCost: 40, power: 50, cooldown: 3, lockChance: 0.22 },
          2: { manaCost: 35, power: 53, cooldown: 3, lockChance: 0.44 },
          3: { manaCost: 35, power: 56, cooldown: 2, lockChance: 0.66 },
          4: { manaCost: 35, power: 60, cooldown: 2, lockChance: 0.99 }
        }
      },
      analysis: {
        system: SKILL_SYSTEM.PSYCHE,
        kind: SKILL_KIND.PSYCHE,
        targetMode: 'enemy',
        icon: 'magnifying-glass.svg',
        name: '解析',
        description: '读取侧技能，主要用于获得牌局、胜率倾向、下注意图与风险来源信息。',
        levels: {
          1: { manaCost: 20, power: 30, cooldown: 2, matrix: [0.65, 0.35, 0] },
          2: { manaCost: 20, power: 35, cooldown: 2, matrix: [0.75, 0.25, 0] },
          3: { manaCost: 20, power: 40, cooldown: 2, matrix: [0.85, 0.15, 0] },
          4: { manaCost: 15, power: 43, cooldown: 2, matrix: [0.95, 0.05, 0] }
        }
      },
      premonition: {
        system: SKILL_SYSTEM.PSYCHE,
        kind: SKILL_KIND.PSYCHE,
        targetMode: 'self',
        icon: 'octogonal-eye.svg',
        name: '预兆',
        description: '防守侧技能，提前感知厄运落点，并以 Psyche值抵消敌方 curse。',
        levels: {
          1: { manaCost: 20, power: 30, cooldown: 2, matrix: [0.35, 0.65, 0] },
          2: { manaCost: 15, power: 35, cooldown: 2, matrix: [0.25, 0.75, 0] },
          3: { manaCost: 15, power: 35, cooldown: 1, matrix: [0.15, 0.85, 0] },
          4: { manaCost: 15, power: 40, cooldown: 1, matrix: [0.05, 0.95, 0] }
        }
      },
      refraction: {
        system: SKILL_SYSTEM.PSYCHE,
        kind: SKILL_KIND.PSYCHE,
        targetMode: 'self',
        icon: 'octogonal-eye.svg',
        name: '折射',
        description: '转化侧大招，用于指定厄运来源与打击方向，将其折射为己方 fortune。',
        levels: {
          1: { manaCost: 40, power: 60, cooldown: 4, matrix: [0.33, 0.33, 0.34] },
          2: { manaCost: 40, power: 65, cooldown: 4, matrix: [0.25, 0.35, 0.4] },
          3: { manaCost: 35, power: 70, cooldown: 4, matrix: [0.15, 0.45, 0.4] },
          4: { manaCost: 30, power: 75, cooldown: 4, matrix: [0, 0.5, 0.5] }
        }
      },
      insulation: {
        system: SKILL_SYSTEM.VOID,
        kind: SKILL_KIND.VOID,
        targetMode: 'self',
        icon: 'dice-shield.svg',
        name: '绝缘',
        description: 'KAZU 主动防守技，当前街内降低魔运干涉。',
        levels: {
          1: { manaCost: 0, power: 0, cooldown: 4, special: { enemyCurse: -0.3, enemyFortune: -0.2, allyFortune: -0.15 } },
          2: { manaCost: 0, power: 0, cooldown: 3, special: { enemyCurse: -0.4, enemyFortune: -0.25, allyFortune: -0.12 } },
          3: { manaCost: 0, power: 0, cooldown: 2, special: { enemyCurse: -0.5, enemyFortune: -0.3, allyFortune: -0.1 } },
          4: { manaCost: 0, power: 0, cooldown: 2, special: { enemyCurse: -0.6, enemyFortune: -0.35, allyFortune: -0.08 } }
        }
      },
      reality: {
        system: SKILL_SYSTEM.VOID,
        kind: SKILL_KIND.VOID,
        targetMode: 'none',
        icon: 'ace.svg',
        name: '现实还原',
        description: 'KAZU / Void 系大招。Reality I 清力，Reality II 清力并清临时角色标记。',
        levels: {
          1: { manaCost: 0, power: 0, cooldown: 0, usesPerGame: 1, special: { clearForces: true, clearTemporaryMarks: false } },
          2: { manaCost: 0, power: 0, cooldown: 0, usesPerGame: 1, special: { clearForces: true, clearTemporaryMarks: true } }
        }
      }
    };

    const ROLE_SKILLS = {
      royal_decree: { system: 'moirai', kind: 'fortune', effect: 'royal_decree', activation: 'active', manaCost: 25, cooldown: 0, power: 70, level: 0, usesPerGame: 1, icon: 'barbed-star.svg', description: '敕令 — 绝对天命，超强概率偏斜(P70)（每手限1次）' },
      heart_read: { system: 'psyche', kind: 'psyche', effect: 'heart_read', activation: 'active', manaCost: 15, cooldown: 1, power: 20, level: 2, matrix: [0.8, 0.2, 0], icon: 'chained-heart.svg', description: '命运感知 — 读取对手意图，并生成少量防守 Psyche值。' },
      cooler: { system: 'chaos', kind: 'marker', effect: 'cooler', activation: 'active', manaCost: 18, cooldown: 2, power: 0, level: 2, icon: 'spade-skull.svg', description: '冤家牌 — 为目标附加冤家牌标记。' },
      skill_seal: { system: 'chaos', kind: 'control', effect: 'skill_seal', activation: 'active', manaCost: 20, cooldown: 3, power: 0, level: 2, icon: 'crossed-chains.svg', description: '冻结令 — 冻结目标主动技能。' },
      clairvoyance: { system: 'psyche', kind: 'runtime', effect: 'clairvoyance', activation: 'active', manaCost: 12, cooldown: 0, usesPerStreet: 1, power: 0, level: 2, icon: 'star-pupil.svg', description: '估价眼 — 选择目标、建仓档位与隐藏清算方向，记录投资轮基准并注入泡沫头寸（每街1次）' },
      bubble_liquidation: { system: 'psyche', kind: 'runtime', effect: 'bubble_liquidation', activation: 'active', manaCost: 16, cooldown: 0, power: 0, level: 0, usesPerGame: 1, icon: 'shiny-purse.svg', description: '泡沫清算 — 对指定目标当前投资轮执行偏离清算（整局1次）' },
      miracle: { system: 'moirai', kind: 'fortune', effect: 'miracle', activation: 'trigger', manaCost: 0, cooldown: 0, power: 0, level: 0, usesPerGame: 1, trigger: { condition: 'runtime_only', value: 0 }, triggerThreshold: 0.25, convertRate: 1.5, durationStreets: 3, handCard: false, showAsPassiveCard: true, icon: 'poppy1.svg', description: '命大 — 全场仅1次；首次进入25%血线后，于下一手开始时抽空全部 mana，按 1.5x 转为持续3街的 fortune' },
      lucky_find: { system: 'moirai', kind: 'fortune', effect: 'lucky_find', activation: 'trigger', manaCost: 0, cooldown: 0, power: 20, level: 2, trigger: { condition: 'runtime_only', value: 0 }, handCard: false, showAsPassiveCard: true, icon: 'poppy2.svg', description: '捡到了！— 每街结算时按当前 mana 概率判定，成功则获得 fortune(P20) 并消耗 5 mana' },
      rule_rewrite: { system: 'chaos', kind: 'runtime', effect: 'rule_rewrite', activation: 'active', manaCost: 10, cooldown: 1, power: 0, level: 2, icon: 'jester-hat.svg', description: '规则篡改 — 消耗当前鬼牌，将其改写为自身 fortune 或指定敌方 curse。' },
      blind_box: { system: 'chaos', kind: 'runtime', effect: 'blind_box', activation: 'active', manaCost: 50, cooldown: 0, power: 0, level: 0, usesPerGame: 1, icon: 'party-popper.svg', description: '盲盒派对 — 消耗整张鬼牌发动账户篡位，持续3街后换回原主（整局1次）' },
      deal_card: { system: 'psyche', kind: 'runtime', effect: 'deal_card', activation: 'active', manaCost: 8, cooldown: 0, power: 0, level: 2, usesPerStreet: 1, icon: '', description: '发牌 — 向空牌槽发入吉牌、厄牌或杂牌；牌列由 Runtime 接管。' },
      gather_or_spread: { system: 'psyche', kind: 'runtime', effect: 'gather_or_spread', activation: 'active', manaCost: 10, cooldown: 0, power: 0, level: 2, usesPerStreet: 1, icon: '', description: '收牌 / 铺牌 — 调整整列牌槽与全牌列数值。' },
      absolution: { system: 'moirai', kind: 'runtime', effect: 'absolution', activation: 'active', manaCost: 35, cooldown: 0, power: 0, level: 0, usesPerGame: 1, icon: '', description: '赦免 — 启动三街承灾合同。' },
      benediction: { system: 'moirai', kind: 'fortune', effect: 'benediction', activation: 'active', manaCost: 15, cooldown: 1, power: 35, level: 2, icon: '', description: '祝福 — 对非自身目标施加 fortune，并吸取相关 curse 记为本街承灾。' },
      reclassification: { system: 'psyche', kind: 'runtime', effect: 'reclassification', activation: 'active', manaCost: 16, cooldown: 1, power: 0, level: 2, icon: 'fountain-pen.svg', description: '改判 — 在发牌前对目标本街新增值作出单次通过/不通过裁定。' },
      general_ruling: { system: 'psyche', kind: 'runtime', effect: 'general_ruling', activation: 'active', manaCost: 36, cooldown: 0, power: 0, level: 3, usesPerGame: 1, icon: 'stamper.svg', description: '总务裁定 — 在发牌前对全场红章目标执行统一裁定。' },
      house_edge: { system: 'chaos', kind: 'curse', effect: 'house_edge', activation: 'active', manaCost: 18, cooldown: 1, power: 18, level: 2, icon: 'fox-head.svg', description: '抽水 — 对指定敌方施加 curse(P18) 并附加 debt rot。' },
      debt_call: { system: 'chaos', kind: 'runtime', effect: 'debt_call', activation: 'active', manaCost: 34, cooldown: 3, power: 0, level: 3, icon: 'card-burn.svg', description: '催收 — 立即结算目标 debt rot。' },
      presence: { system: 'moirai', kind: 'mental', effect: 'psych_pressure', activation: 'active', manaCost: 15, cooldown: 2, level: 1, basePower: 18, equityBias: -15, pressureType: 'presence', icon: '', description: '压场 — 让对方退缩、保守' },
      taunt: { system: 'chaos', kind: 'mental', effect: 'psych_pressure', activation: 'active', manaCost: 15, cooldown: 2, level: 1, basePower: 18, equityBias: 15, pressureType: 'taunt', icon: '', description: '挑衅 — 让对方上头、冒进' },
      probe: { system: 'psyche', kind: 'mental', effect: 'psych_probe', activation: 'active', manaCost: 12, cooldown: 1, level: 1, basePower: 15, confidenceDelta: -30, pressureType: 'probe', icon: '', description: '试探 — 让对方失准，读取心理状态' },
      center_self: { system: 'void', kind: 'mental', effect: 'psych_recover', activation: 'active', manaCost: 0, cooldown: 4, level: 1, baseRecover: 20, confidenceDelta: 20, clearBias: true, icon: '', description: '定神 — 稳住自己，恢复定力' }
    };

    function clampSkillLevel(rawLevel, maxLevel) {
      const fallback = maxLevel || 1;
      const level = Math.round(Number(rawLevel != null ? rawLevel : fallback) || fallback);
      return Math.max(1, Math.min(Math.max(1, fallback), level));
    }

    function buildLeveledSkillDefinition(skillKey, rawLevel) {
      const key = String(skillKey || '').trim();
      const base = UNIVERSAL_SKILL_LEVELS[key];
      if (!base) return null;
      const maxLevel = Math.max.apply(null, Object.keys(base.levels).map(function(level) { return Number(level); }));
      const level = clampSkillLevel(rawLevel, maxLevel);
      const levelDef = base.levels[level] || base.levels[maxLevel] || {};
      const system = base.system;
      const kind = base.kind;
      return Object.assign({}, base, levelDef, {
        key: key,
        skillKey: key,
        system: system,
        kind: kind,
        effect: kind,
        level: level,
        maxLevel: maxLevel,
        activation: base.activation || levelDef.activation || ACTIVATION.ACTIVE,
        manaCost: Math.max(0, Number(levelDef.manaCost || 0)),
        power: Math.max(0, Number(levelDef.power || 0)),
        cooldown: Math.max(0, Number(levelDef.cooldown || 0)),
        usesPerGame: Math.max(0, Number(levelDef.usesPerGame != null ? levelDef.usesPerGame : base.usesPerGame || 0)),
        usesPerStreet: Math.max(0, Number(levelDef.usesPerStreet != null ? levelDef.usesPerStreet : base.usesPerStreet || 0)),
        lockChance: Math.max(0, Math.min(1, Number(levelDef.lockChance || 0))),
        matrix: Array.isArray(levelDef.matrix) ? levelDef.matrix.slice(0, 3) : null,
        special: Object.assign({}, base.special || {}, levelDef.special || {})
      });
    }

    function normalizeRoleSkillDefinition(skillKey, source, rawLevel) {
      if (!source) return null;
      const system = source.system || null;
      const level = rawLevel != null
        ? Math.max(0, Math.round(Number(rawLevel) || 0))
        : Math.max(0, Math.round(Number(source.level || 0)));
      return Object.assign({}, source, {
        key: skillKey,
        skillKey: skillKey,
        system: system,
        kind: source.kind || source.effect,
        level: level,
        maxLevel: source.maxLevel || level || null,
        manaCost: Math.max(0, Number(source.manaCost || 0)),
        power: Math.max(0, Number(source.power || 0)),
        cooldown: Math.max(0, Number(source.cooldown || 0)),
        lockChance: Math.max(0, Math.min(1, Number(source.lockChance || 0))),
        matrix: Array.isArray(source.matrix) ? source.matrix.slice(0, 3) : null,
        special: Object.assign({}, source.special || {})
      });
    }

    /**
     * 查找技能定义。通用技能使用 `{ key, level }`；角色专属技能使用 ROLE_SKILLS。
     * @param {string} skillKey
     * @param {number} [level]
     * @returns {object|null}
     */
    function lookupSkill(skillKey, level) {
      const key = String(skillKey || '').trim();
      if (!key) return null;
      const leveled = buildLeveledSkillDefinition(key, level);
      if (leveled) return leveled;
      return normalizeRoleSkillDefinition(key, ROLE_SKILLS[key], level);
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
     * @param {object} skillDef - 技能定义
     * @param {object} attrs - 角色属性面板
     * @returns {boolean}
     */
    function canLearnSkill(skillDef, attrs) {
      if (!skillDef.system) return true;
      const system = skillDef.system;
      const minValue = Number(skillDef.requiredValue || skillDef.minValue || 0);
      if (!minValue) return true;
      return (attrs[system] || 0) >= minValue;
    }

    /**
     * 从属性面板自动推导可用技能列表
     * @param {object} attrs - { moirai, chaos, psyche, void }
     * @param {number} maxSlots - 最大槽位数
     * @returns {Array<{key, ...skillDef}>} 按优先级排序的技能列表
     */
    function deriveSkillsFromAttrs(attrs, maxSlots) {
      const available = [];
      for (const key in UNIVERSAL_SKILL_LEVELS) {
        const base = UNIVERSAL_SKILL_LEVELS[key];
        const attrValue = attrs && base.system ? Math.max(0, Number(attrs[base.system] || 0)) : 0;
        const maxLevel = Math.max.apply(null, Object.keys(base.levels).map(function(level) { return Number(level); }));
        const level = Math.max(1, Math.min(maxLevel, Math.ceil(attrValue / 20) || 1));
        const def = lookupSkill(key, level);
        if (def) available.push({ key: key, ...def });
      }
      // 同体系内等级高优先，跨体系按属性值高的优先。
      available.sort(function (a, b) {
        if (a.level !== b.level) return b.level - a.level;
        const aVal = attrs[a.system] || 0;
        const bVal = attrs[b.system] || 0;
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

  modules.ACTIVATION = ACTIVATION;
  modules.EFFECT = EFFECT;
  modules.PHASE_INDEX = PHASE_INDEX;
  modules.RIVER_INFO_EFFECTS = RIVER_INFO_EFFECTS;
  modules.VV_CLAIRVOYANCE_ENTRY_SIZE_EXTRA_COST = VV_CLAIRVOYANCE_ENTRY_SIZE_EXTRA_COST;
  modules.SKILL_SYSTEM = SKILL_SYSTEM;
  modules.SKILL_KIND = SKILL_KIND;
  modules.UNIVERSAL_SKILL_LEVELS = UNIVERSAL_SKILL_LEVELS;
  modules.UNIVERSAL_SKILLS = UNIVERSAL_SKILL_LEVELS;
  modules.ROLE_SKILLS = ROLE_SKILLS;
  modules.MANA_BY_LEVEL = MANA_BY_LEVEL;
  modules.lookupSkill = lookupSkill;
  modules.calculateSlots = calculateSlots;
  modules.canLearnSkill = canLearnSkill;
  modules.deriveSkillsFromAttrs = deriveSkillsFromAttrs;
})(typeof window !== 'undefined' ? window : global);
