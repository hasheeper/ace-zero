/**
 * AceZero Tavern battle/NPC runtime.
 *
 * Loaded after tavern/npc-data.js and before tavern/plugin.js.
 * Owns role stat helpers and battle seat assembly while the main Tavern plugin
 * stays focused on middleware flow and prompt injection.
 */
(function installAceZeroTavernBattleRuntime(global) {
  'use strict';

  function createAceZeroTavernBattleRuntime(options = {}) {
    const PLUGIN_NAME = options.pluginName || '[ACE0]';
    const TAVERN_PLUGIN_DATA = options.data || global.ACE0TavernPluginData || {};

  // ==========================================================
  //  通用技能目录（与 skill-system.js UNIVERSAL_SKILLS 同步）
  // ==========================================================

  const UNIVERSAL_SKILLS = TAVERN_PLUGIN_DATA.UNIVERSAL_SKILLS || {};

  // 特质解锁（通用，按等级）
  const VANGUARD_TRAIT_UNLOCK = TAVERN_PLUGIN_DATA.VANGUARD_TRAIT_UNLOCK || {};

  const REARGUARD_TRAIT_UNLOCK = TAVERN_PLUGIN_DATA.REARGUARD_TRAIT_UNLOCK || {};

  const MANA_BY_LEVEL = TAVERN_PLUGIN_DATA.MANA_BY_LEVEL || {};

  // ==========================================================
  //  小游戏技能配置表
  // ==========================================================

  const MINI_GAME_SKILLS = TAVERN_PLUGIN_DATA.MINI_GAME_SKILLS || {};

  function deriveMiniGameSkills(attrs, gameMode) {
    const gameKey = gameMode === 'dragon-tiger' ? 'dragon_tiger' : gameMode;
    const skillDefs = MINI_GAME_SKILLS[gameKey];
    if (!skillDefs) return [];
    const available = [];
    if ((attrs.moirai || 0) >= skillDefs.moirai.threshold) available.push(skillDefs.moirai.key);
    if ((attrs.chaos || 0) >= skillDefs.chaos.threshold) available.push(skillDefs.chaos.key);
    if ((attrs.psyche || 0) >= skillDefs.psyche.threshold) available.push(skillDefs.psyche.key);
    return available;
  }

  // ==========================================================
  //  专属角色档案 (NAMED_CHARACTERS)
  //  专属角色有固定的属性成长、特质、专属技能
  //  当作为 hero 主手/副手时，按等级查表展开
  //  当作为 NPC 敌人时，使用 difficulty = "角色名" 的独立角色配置
  // ==========================================================

  const NAMED_CHARACTERS = TAVERN_PLUGIN_DATA.NAMED_CHARACTERS || {};

  /**
   * 专属角色作为 NPC 敌人时的默认配置
   * 当 AI 在 seats 中写入 { "character": "RINO" } 时，
   * 自动展开为完整的独立角色配置，并将 difficulty 设为对应角色名
   */
  const NAMED_NPC_PRESETS = TAVERN_PLUGIN_DATA.NAMED_NPC_PRESETS || {};

  // 向后兼容：旧的位置表（通用角色用）
  const VANGUARD_ATTRS_BY_LEVEL = NAMED_CHARACTERS.KAZU.attrsByLevel;
  const REARGUARD_ATTRS_BY_LEVEL = NAMED_CHARACTERS.RINO.attrsByLevel;

  // 合并属性面板（取两者各维度最大值，用于战斗/防御）
  function mergeAttrs(vAttrs, rAttrs) {
    return {
      moirai: Math.max(vAttrs.moirai || 0, rAttrs.moirai || 0),
      chaos:  Math.max(vAttrs.chaos  || 0, rAttrs.chaos  || 0),
      psyche: Math.max(vAttrs.psyche || 0, rAttrs.psyche || 0),
      void:   Math.max(vAttrs.void   || 0, rAttrs.void   || 0)
    };
  }

  /**
   * 从属性面板推导可用技能（与 skill-system.js deriveSkillsFromAttrs 同构）
   * @param {object} attrs - { moirai, chaos, psyche, void }
   * @param {string} [charName] - 角色名，用于过滤专属技能
   * @returns {string[]} - 技能ID列表
   */
  function deriveSkillsFromAttrs(attrs, charName) {
    const total = (attrs.moirai || 0) + (attrs.chaos || 0) +
                  (attrs.psyche || 0) + (attrs.void || 0);
    let maxSlots = total >= 120 ? 4 : total >= 80 ? 3 : total >= 40 ? 2 : 1;
    if (charName === 'RINO') maxSlots = 5;

    const available = [];
    for (const key in UNIVERSAL_SKILLS) {
      const def = UNIVERSAL_SKILLS[key];
      if (!def.attr) continue;
      if (def.exclusive && def.exclusive !== charName) continue;
      if ((attrs[def.attr] || 0) >= def.threshold) {
        available.push({ key, ...def });
      }
    }
    available.sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier;
      return (attrs[b.attr] || 0) - (attrs[a.attr] || 0);
    });

    return available.slice(0, maxSlots).map(s => s.key);
  }

  /**
   * 获取角色在指定位置和等级下的属性面板
   * 专属角色使用 NAMED_CHARACTERS 表，通用角色使用位置表
   */
  function getCharAttrs(charName, level, slot) {
    const nc = NAMED_CHARACTERS[charName];
    if (nc && nc.attrsByLevel) {
      return nc.attrsByLevel[level] || nc.attrsByLevel[0] || { moirai: 0, chaos: 0, psyche: 0, void: 0 };
    }
    // 通用角色：按位置查表
    if (slot === 'vanguard') {
      return VANGUARD_ATTRS_BY_LEVEL[level] || VANGUARD_ATTRS_BY_LEVEL[0];
    }
    return REARGUARD_ATTRS_BY_LEVEL[level] || REARGUARD_ATTRS_BY_LEVEL[0];
  }

  /**
   * 获取角色在指定位置和等级下的特质
   * 专属角色使用 NAMED_CHARACTERS 表，通用角色使用位置表
   */
  function getCharTrait(charName, level, slot) {
    const nc = NAMED_CHARACTERS[charName];
    if (nc && nc.traitByLevel && nc.traitByLevel[slot]) {
      return nc.traitByLevel[slot][level] || null;
    }
    // 通用角色：按位置查表
    if (slot === 'vanguard') {
      return VANGUARD_TRAIT_UNLOCK[level] || null;
    }
    return REARGUARD_TRAIT_UNLOCK[level] || null;
  }

  /**
   * 获取角色的专属技能列表
   */
  function getCharExclusiveSkills(charName) {
    const nc = NAMED_CHARACTERS[charName];
    return (nc && nc.exclusiveSkills) ? nc.exclusiveSkills : [];
  }

  // ==========================================================
  //  NPC 组装流水线 — 三维度模块化系统
  //
  //  一个 NPC = kernel + archetype + mood
  //  三个维度完全解耦，只在 assembleNPC() 时缝合为 seat config
  //  筹码/盲注由战局 JSON 的 blinds/chips 直接指定
  // ==========================================================

  // ----------------------------------------------------------
  //  维度 1: AI 核心 (AI_KERNELS) — 性格 + 水平 + 心理战属性
  // ----------------------------------------------------------
  const AI_KERNELS = TAVERN_PLUGIN_DATA.AI_KERNELS || {};

  const DIFFICULTY_MENTAL_PRESETS = TAVERN_PLUGIN_DATA.DIFFICULTY_MENTAL_PRESETS || {};

  const AI_STYLE_PRESETS = TAVERN_PLUGIN_DATA.AI_STYLE_PRESETS || {};

  // ----------------------------------------------------------
  //  维度 2: 异能模版 (RPG_TEMPLATES) — 属性 + 技能快速入口
  //  attrs 由模版定义，skills 由 deriveSkillsFromAttrs 自动推导
  // ----------------------------------------------------------
  const RPG_TEMPLATES = TAVERN_PLUGIN_DATA.RPG_TEMPLATES || {};

  // ----------------------------------------------------------
  //  维度 3: 情绪修正 (MOOD_MODIFIERS) — 运行时覆写层 + composureMax修正
  //  与 poker-ai.js EMOTION_PROFILES 同步，此处仅做枚举 + 描述
  // ----------------------------------------------------------
  const MOOD_MODIFIERS = TAVERN_PLUGIN_DATA.MOOD_MODIFIERS || {};

  // ----------------------------------------------------------
  //  跑龙套预设 (RUNNER_PRESETS) — 常见 NPC 一键生成
  //  每个 = kernel + archetype + mood 的固定组合
  // ----------------------------------------------------------
  const RUNNER_PRESETS = TAVERN_PLUGIN_DATA.RUNNER_PRESETS || {};

  // ----------------------------------------------------------
  //  组装函数：三维度 → 完整 NPC seat config
  // ----------------------------------------------------------

  /**
   * 从三个维度组装一个完整的 NPC 座位配置
   *
   * @param {string} name - NPC 显示名称（必填）
   * @param {object} dims - 三维度参数
   * @param {string} dims.kernel    - AI_KERNELS 键名（默认 'mob'）
   * @param {string} dims.archetype - RPG_TEMPLATES 键名（默认 'muggle'）
   * @param {string} dims.mood      - MOOD_MODIFIERS 键名（默认 'calm'）
   * @returns {object} - 完整的 NPC seat config（可直接放入 seats.XX）
   */
  function assembleNPC(name, dims) {
    const d = dims || {};
    const kernelKey = typeof d.kernel === 'string' ? d.kernel : '';
    const kernel    = AI_KERNELS[kernelKey] || null;
    const archetype = RPG_TEMPLATES[d.archetype]  || RPG_TEMPLATES.muggle;
    const mood      = MOOD_MODIFIERS[d.mood]      || MOOD_MODIFIERS.calm;
    const explicitAi = typeof d.ai === 'string' && AI_STYLE_PRESETS[d.ai] ? d.ai : '';
    const explicitDifficulty = typeof d.difficulty === 'string' && DIFFICULTY_MENTAL_PRESETS[d.difficulty] ? d.difficulty : '';
    const ai = explicitAi || kernel?.ai || 'balanced';
    const difficulty = explicitDifficulty || kernel?.difficulty || 'regular';
    const baseMental = explicitDifficulty
      ? DIFFICULTY_MENTAL_PRESETS[difficulty]
      : (kernel?.mental || DIFFICULTY_MENTAL_PRESETS[difficulty] || DIFFICULTY_MENTAL_PRESETS.regular);
    const mental = {
      discipline: baseMental.discipline ?? 25,
      composureMax: Math.max(1, (baseMental.composureMax ?? 80) + (mood.composureMod || 0)),
      resistPresence: baseMental.resistPresence ?? 0,
      resistTaunt: baseMental.resistTaunt ?? 0,
      resistProbe: baseMental.resistProbe ?? 0
    };

    const result = {
      vanguard: { name: name || '???', level: archetype.level || 0 },
      ai,
      difficulty,
      emotion: mood.emotion,
      mental
    };

    // 异能模版：有属性才写入
    const hasAttrs = archetype.attrs &&
      (archetype.attrs.moirai || archetype.attrs.chaos ||
       archetype.attrs.psyche || archetype.attrs.void);
    if (hasAttrs) {
      result.attrs = { ...archetype.attrs };
      result.skills = deriveSkillsFromAttrs(archetype.attrs);
    }

    return result;
  }

  /**
   * 从跑龙套预设名 + 自定义名称 → 完整 NPC seat config
   */
  function assembleFromRunner(runnerKey, name) {
    const preset = RUNNER_PRESETS[runnerKey];
    if (!preset) {
      console.warn(`${PLUGIN_NAME} 未知跑龙套预设: ${runnerKey}`);
      return assembleNPC(name || '???', {});
    }
    return assembleNPC(name || preset.desc, {
      kernel: preset.kernel,
      archetype: preset.archetype,
      mood: preset.mood
    });
  }

  /**
   * 从专属角色预设组装完整 NPC 座位配置
   * @param {string} charKey - NAMED_NPC_PRESETS 键名（如 'RINO', 'SIA'）
   * @param {object} [overrides] - 可选覆写（mood, difficulty 等）
   * @returns {object} - 完整 NPC seat config
   */
  function assembleNamedNPC(charKey, overrides) {
    const preset = NAMED_NPC_PRESETS[charKey];
    if (!preset) return null;

    const ov = overrides || {};
    const result = {
      roleId: charKey,
      roleVariant: 'base',
      vanguard: { name: preset.desc || charKey, level: ov.level || preset.level, trait: preset.vanguardTrait, roleId: charKey },
      ai: ov.ai || preset.ai,
      difficulty: ov.difficulty || preset.difficulty,
      emotion: ov.mood || ov.emotion || preset.emotion,
      attrs: { ...preset.attrs },
      skills: [...preset.skills],
      mental: { ...preset.mental }
    };
    if (preset.rearguardTrait) {
      result.rearguard = { name: charKey + '_REAR', level: ov.level || preset.level, trait: preset.rearguardTrait, roleId: charKey, roleVariant: 'rear' };
    }
    // 覆写名称
    if (ov.name) result.vanguard.name = ov.name;
    return result;
  }

  /**
   * 解析 AI 输出的座位配置：支持四种格式
   *   1. 专属角色速记: { "character": "RINO" } 或 { "character": "SIA", "mood": "tilt" }
   *   2. 跑龙套速记:   { "runner": "street_thug", "name": "阿猫" }
   *   3. 模块化组装:    { "name": "X", "kernel": "shark", "archetype": "cursed", "mood": "tilt" }
   *   4. 显式覆写:      { "name": "X", "ai": "aggressive", "difficulty": "pro", "archetype": "cursed", "mood": "tilt" }
   *   5. 原始直写:      { "vanguard": {...}, "ai": "balanced", ... }（透传，不处理）
   */
  function resolveNpcSeat(seatData) {
    if (!seatData) return null;

    // 模式 0: 原始直写（已有完整 vanguard）
    if (seatData.vanguard) {
      return seatData;
    }

    // 模式 1: 专属角色速记
    if (seatData.character) {
      const key = seatData.character.toUpperCase();
      const npc = assembleNamedNPC(key, seatData);
      if (npc) return npc;
      console.warn(`${PLUGIN_NAME} 未知专属角色: ${seatData.character}，降级为三维组装`);
    }

    // 模式 2: 跑龙套速记
    if (seatData.runner) {
      return assembleFromRunner(seatData.runner, seatData.name);
    }

    // 模式 3/4: 模块化组装或显式覆写
    if (seatData.kernel || seatData.ai || seatData.difficulty || seatData.archetype || seatData.mood) {
      return assembleNPC(seatData.name || '???', {
        kernel:    seatData.kernel,
        ai:        seatData.ai,
        difficulty: seatData.difficulty,
        archetype: seatData.archetype,
        mood:      seatData.mood
      });
    }

    // 模式 5: 原始直写（透传）
    return seatData;
  }

  /**
   * 解析整个战局数据：遍历 seats，对每个座位调用 resolveNpcSeat
   * blinds/chips 由战局 JSON 直接指定
   */
  function resolveBattleData(battleData) {
    if (!battleData || !battleData.seats) return battleData;

    const resolved = { ...battleData };

    // 解析每个座位
    const resolvedSeats = {};
    for (const seatId in battleData.seats) {
      resolvedSeats[seatId] = resolveNpcSeat(battleData.seats[seatId]);
    }
    resolved.seats = resolvedSeats;

    return resolved;
  }

    return {
      UNIVERSAL_SKILLS,
      VANGUARD_TRAIT_UNLOCK,
      REARGUARD_TRAIT_UNLOCK,
      MANA_BY_LEVEL,
      MINI_GAME_SKILLS,
      NAMED_CHARACTERS,
      NAMED_NPC_PRESETS,
      VANGUARD_ATTRS_BY_LEVEL,
      REARGUARD_ATTRS_BY_LEVEL,
      AI_KERNELS,
      DIFFICULTY_MENTAL_PRESETS,
      AI_STYLE_PRESETS,
      RPG_TEMPLATES,
      MOOD_MODIFIERS,
      RUNNER_PRESETS,
      deriveMiniGameSkills,
      mergeAttrs,
      deriveSkillsFromAttrs,
      getCharAttrs,
      getCharTrait,
      getCharExclusiveSkills,
      assembleNPC,
      assembleFromRunner,
      assembleNamedNPC,
      resolveNpcSeat,
      resolveBattleData
    };
  }

  global.ACE0TavernBattleRuntime = Object.assign({}, global.ACE0TavernBattleRuntime || {}, {
    create: createAceZeroTavernBattleRuntime
  });
})(typeof window !== 'undefined' ? window : globalThis);
