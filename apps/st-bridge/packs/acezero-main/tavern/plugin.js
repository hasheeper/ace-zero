/**
 * =============================================================
 * ACEZERO TAVERN PLUGIN — 酒馆助手中间件
 * =============================================================
 *
 * 流程:
 *
 *   1. GENERATION_AFTER_COMMANDS
 *      读取 MVU 变量 → 构建 hero 状态 XML 摘要 → injectPrompts 注入 AI 上下文
 *
 *   2. AI 回复
 *      AI 在正文中输出 <ACE0_BATTLE> { ...战局JSON... } </ACE0_BATTLE>
 *      同时 AI 可能输出 <UpdateVariable> 标签（MVU-zod 框架自动处理）
 *
 *   3. mag_before_message_update (优选) / character_message_rendered (兜底)
 *      检测消息中的 <ACE0_BATTLE> 标签 → 解析 AI 的战局 JSON
 *      → 读取 MVU hero 数据 → 按等级展开技能/特质/属性
 *      → 合并为完整 game-config
 *      → 追加 <ACE0_FRONTEND>\n{完整JSON}\n</ACE0_FRONTEND> 到消息
 *      → SillyTavern 正则匹配 ACE0_FRONTEND → 替换为 STver.html（$1 = JSON）
 *      → STver.html 解析 JSON → postMessage 到游戏 iframe
 *
 *      资金结算 (funds_up/funds_down) 与 cast/roster 状态补全由
 *      acezero-schema.js 的 zod transform 自动处理，无需插件介入。
 *
 * MVU 变量结构（message 变量 → stat_data）:
 * {
 *   "hero": {
 *     "funds": 5,
 *     "cast": { "RINO": { "introduced": true, "present": true, "inParty": true } },
 *     "roster": { "KAZU": { "level": 3, "mana": 0, "maxMana": 0 }, "RINO": { "level": 5, "mana": 100, "maxMana": 100 } }
 *   },
 * }
 *
 * 依赖: MVU-zod 变量框架 + JS-Slash-Runner (酒馆助手) API
 *       schema/acezero-schema.js (变量结构定义 + 自动结算)
 */

(async function () {
  'use strict';

  const PLUGIN_NAME = '[ACE0]';
  const BATTLE_TAG = 'ACE0_BATTLE';
  const FRONTEND_TAG = 'ACE0_FRONTEND';
  const ACT_RESULT_TAG = 'ACE0_ACT_RESULT';
  const HERO_INJECT_ID = 'ace0_hero_state';
  const REL_STATE_INJECT_ID = 'ace0_relationship_state';
  const PRIMARY_CONTEXT_INJECT_ID = 'ace0_primary_context';
  const ACT_STATE_INJECT_ID = 'ace0_act_state';
  const ACT_CHARTER_INJECT_ID = 'ace0_act_charter';
  const ACT_NARRATIVE_INJECT_ID = 'ace0_act_narrative';
  const ACT_TRANSITION_INJECT_ID = 'ace0_act_transition';
  const ACT_PACING_INJECT_ID = 'ace0_narrative_pacing';
  const ACT_FIRST_MEET_INJECT_ID = 'ace0_first_meet';
  const WORLD_CONTEXT_INJECT_ID = 'ace0_world_context';
  const LOCATION_DOC_INJECT_ID = 'ace0_location_doc';
  const HERO_INTERNAL_KEY = 'KAZU';
  const HERO_MACRO_NAME = '{{user}}';
  const HERO_MACRO_ALT = '<user>';
  const TAVERN_PLUGIN_DATA = (typeof window !== 'undefined' ? window : globalThis).ACE0TavernPluginData || {};
  const WORLD_LAYERS = TAVERN_PLUGIN_DATA.WORLD_LAYERS || ['THE_COURT', 'THE_EXCHANGE', 'THE_STREET', 'THE_RUST'];
  const DEFAULT_WORLD_LOCATION = TAVERN_PLUGIN_DATA.DEFAULT_WORLD_LOCATION || { layer: 'THE_STREET', site: '' };
  const LOCATION_LAYER_META = TAVERN_PLUGIN_DATA.LOCATION_LAYER_META || {};
  const ACT_RESOURCE_KEYS = ['combat', 'rest', 'asset', 'vision'];
  const ACT_RESOURCE_ALIASES = {
    contract: 'asset',
    event: 'vision'
  };
  const ACT_STAGE_VALUES = ['planning', 'executing', 'route', 'complete'];
  // 节点内四段，与 world.clock 晨昼暮夜解耦
  const ACT_PHASE_LABELS = ['一段', '二段', '三段', '四段'];
  // 独立世界时钟：world.current_time 由它推进，与 ACT 节点无关。
  const WORLD_CLOCK_SLOTS = ['MORNING', 'NOON', 'AFTERNOON', 'NIGHT'];
  const DEFAULT_WORLD_CLOCK = { day: 1, phase: 'MORNING' };
  const DEFAULT_WORLD_CLOCK_PRESSURE = 0;
  const DEBT_INTEREST_RATE_PER_PHASE = 0.005;
  const MAJOR_DEBT_INTEREST_RATE_PER_PHASE = 0.01;

  const DEFAULT_WORLD_ACT = {
    id: 'chapter0_exchange',
    seed: 'AUTO',
    // 节点序列索引（1..totalNodes），与世界日无关
    nodeIndex: 1,
    route_history: [],
    limited: { combat: 0, rest: 0, asset: 0, vision: 0 },
    reserve: { combat: 0, rest: 0, asset: 0, vision: 0 },
    reserve_progress: { combat: 0, rest: 0, asset: 0, vision: 0 },
    income_rate: { combat: 0.2, rest: 0.2, asset: 0.2, vision: 0.2 },
    income_progress: { combat: 0, rest: 0, asset: 0, vision: 0 },
    phase_slots: [null, null, null, null],
    phase_index: 0,
    // 本章已去掉 planning（编排相）——玩家通过 Dashboard 在 executing 过程中随时排/改未来相位的 slot。
    stage: 'executing',
    phase_advance: 0,
    // 随机池消耗记录 { [nodeId]: { [phaseIndex]: candidateId } }
    pickedPacks: {},
    controlledNodes: {},
    crisis: 0,
    crisisSignals: [],
    vision: { baseSight: 1, bonusSight: 0, jumpReady: false, pendingReplace: null },
    resourceSpent: { combat: 0, rest: 0, asset: 0, vision: 0 },
    characterEncounter: {},
    pendingResolutions: [],
    resolutionHistory: [],
    // 情节张力 0-100
    narrativeTension: 0,
    // 首见帧持久化缓冲：{ [charKey]: hintText }
    // 生命周期 = 当前节点/段位内（由 phase_advance 清空）。
    // 绑到 MVU→绑楼层，玩家编辑 / swipe / 重生成都不会掉。
    pendingFirstMeet: {},
    pendingTransitionTarget: '',
    transitionRequestTarget: '',
    pendingTransitionPrompt: ''
  };
  // ACT 章节真相已迁入 `act/plugin.js`。

  let isProcessing = false;
  let pendingActBaselineSnapshot = null;
  let lastObservedWorldClock = null;
  // 首见帧楼层哨兵：记录上次注入 <ace0_first_meet> 时的 chat.length。
  // prompt 构造前比较当前 chat.length：若更大 → 玩家已发下一条 → 清空 pendingFirstMeet。
  // 相同或更小 → swipe / edit / regen 同一楼层 → 保留 pending 复用。
  // -1 表示尚未注入或已在 CHAT_CHANGED 时重置。
  let lastFirstMeetInjectChatLen = -1;

  function getAce0HostRoot() {
    try {
      if (window.parent && window.parent !== window) return window.parent;
    } catch (_) {}

    try {
      if (window.top && window.top !== window) return window.top;
    } catch (_) {}

    return window;
  }

  function isSameWorldClock(a, b) {
    if (!a || !b) return false;
    return Number(a.day) === Number(b.day) && String(a.phase || '') === String(b.phase || '');
  }

  console.log(`${PLUGIN_NAME} 插件加载中...`);

  const BATTLE_RUNTIME = (typeof window !== 'undefined' ? window : globalThis).ACE0TavernBattleRuntime?.create({
    pluginName: PLUGIN_NAME,
    data: TAVERN_PLUGIN_DATA
  }) || {};
  const {
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
  } = BATTLE_RUNTIME;


  // ==========================================================
  //  工具函数
  // ==========================================================

  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function _normalizeTrimmedString(value, fallback = '') {
    return typeof value === 'string' ? value.trim() : fallback;
  }

  function normalizeActResourceKey(value, fallback = 'vision') {
    const normalized = _normalizeTrimmedString(value, fallback).toLowerCase();
    const migrated = ACT_RESOURCE_ALIASES[normalized] || normalized;
    return ACT_RESOURCE_KEYS.includes(migrated) ? migrated : fallback;
  }

  const CHARACTER_RUNTIME = (typeof window !== 'undefined' ? window : globalThis).ACE0TavernCharacterRuntime?.create({
    pluginName: PLUGIN_NAME,
    data: TAVERN_PLUGIN_DATA,
    constants: {
      HERO_INTERNAL_KEY,
      HERO_MACRO_NAME,
      HERO_MACRO_ALT
    },
    deps: {
      normalizeTrimmedString: _normalizeTrimmedString,
      getWorldbook: typeof getWorldbook === 'function' ? getWorldbook : undefined
    }
  }) || {};
  const {
    CHAR_DOC_INJECT_IDS = {},
    NON_PLAYER_CHARACTER_KEYS = [],
    ALL_CHARACTER_KEYS = [],
    DEFAULT_CAST_NODE = {},
    DEFAULT_ROSTER_NODE = {},
    CHARACTER_PROMPT_DOCS = {}
  } = CHARACTER_RUNTIME;

  function isHeroMacroToken(value) { return CHARACTER_RUNTIME.isHeroMacroToken(value); }
  function resolveCurrentUserDisplayName(fallback = HERO_INTERNAL_KEY) { return CHARACTER_RUNTIME.resolveCurrentUserDisplayName(fallback); }
  function resolveHeroDisplayName(fallback = HERO_INTERNAL_KEY) { return CHARACTER_RUNTIME.resolveHeroDisplayName(fallback); }
  function resolveHeroAliasDisplayName(hero, fallback = HERO_INTERNAL_KEY) { return CHARACTER_RUNTIME.resolveHeroAliasDisplayName(hero, fallback); }
  function normalizeHeroCharacterKey(rawName, hero) { return CHARACTER_RUNTIME.normalizeHeroCharacterKey(rawName, hero); }
  function replaceHeroPromptMacro(text) { return CHARACTER_RUNTIME.replaceHeroPromptMacro(text); }
  function resolveDisplayCharacterName(charKey) { return CHARACTER_RUNTIME.resolveDisplayCharacterName(charKey); }
  function resolveFrontendCharacterName(charKey, hero) { return CHARACTER_RUNTIME.resolveFrontendCharacterName(charKey, hero); }
  function getRelationshipTierIndex(score) { return CHARACTER_RUNTIME.getRelationshipTierIndex(score); }
  async function getFullCharacterDoc(charKey, fallbackDoc = null) { return await CHARACTER_RUNTIME.getFullCharacterDoc(charKey, fallbackDoc); }
  async function getCharacterPromptDoc(charKey, state = {}, options = {}) { return await CHARACTER_RUNTIME.getCharacterPromptDoc(charKey, state, options); }
  async function buildCharacterPromptInjections(eraVars, firstMeetKeys = null) { return await CHARACTER_RUNTIME.buildCharacterPromptInjections(eraVars, firstMeetKeys); }
  function getHeroCast(hero) { return CHARACTER_RUNTIME.getHeroCast(hero); }
  function getHeroRoster(hero) { return CHARACTER_RUNTIME.getHeroRoster(hero); }
  function getCastNode(hero, charKey) { return CHARACTER_RUNTIME.getCastNode(hero, charKey); }
  function getRosterNode(hero, charKey) { return CHARACTER_RUNTIME.getRosterNode(hero, charKey); }
  function _getHeroCharNames(hero) { return CHARACTER_RUNTIME.getHeroCharNames(hero); }
  function _getPartyRoster(hero) { return CHARACTER_RUNTIME.getPartyRoster(hero); }

  // ==========================================================
  //  MVU 变量读写（通过酒馆助手 variable API）
  //  变量存储: message 变量 → stat_data
  // ==========================================================

  async function getEraVars() {
    try {
      const vars = await getVariables({ type: 'message' });
      return vars?.stat_data || null;
    } catch (e) {
      console.warn(`${PLUGIN_NAME} MVU 变量读取失败:`, e);
      return null;
    }
  }

  async function updateEraVars(data) {
    try {
      await insertOrAssignVariables({ stat_data: data }, { type: 'message' });
    } catch (e) {
      console.error(`${PLUGIN_NAME} MVU 变量写入失败:`, e);
    }
  }

  function getExpansionRegistry() {
    const hostRoot = getAce0HostRoot();
    return hostRoot.ACE0ExpansionRegistry && typeof hostRoot.ACE0ExpansionRegistry === 'object'
      ? hostRoot.ACE0ExpansionRegistry
      : null;
  }

  function getExpansionPromptStateStore() {
    const hostRoot = getAce0HostRoot();
    if (!hostRoot.__ACE0_EXPANSION_PROMPT_STATE__) {
      hostRoot.__ACE0_EXPANSION_PROMPT_STATE__ = {
        ids: []
      };
    }
    return hostRoot.__ACE0_EXPANSION_PROMPT_STATE__;
  }

  function normalizeExpansionPrompt(prompt, index) {
    if (!prompt || typeof prompt !== 'object') return null;

    const content = typeof prompt.content === 'string' ? prompt.content : '';
    if (!content.trim()) return null;

    return {
      id: typeof prompt.id === 'string' && prompt.id.trim()
        ? prompt.id.trim()
        : `ace0_expansion_prompt_${index + 1}`,
      position: prompt.position || 'in_chat',
      depth: Number.isFinite(prompt.depth) ? prompt.depth : 1,
      role: prompt.role || 'system',
      content,
      should_scan: prompt.should_scan === true
    };
  }

  function buildExpansionPromptInjections(eraVars) {
    const registry = getExpansionRegistry();
    if (!registry || typeof registry.collectPromptInjections !== 'function') {
      return [];
    }

    const rawPrompts = registry.collectPromptInjections({
      eraVars
    });

    return rawPrompts
      .map((prompt, index) => normalizeExpansionPrompt(prompt, index))
      .filter(Boolean);
  }

  // ==========================================================
  //  MVU 变量 → 完整 game-config 构建
  // ==========================================================

  /**
   * 从 MVU 变量中提取 hero 数据，按等级展开技能/特质/属性，
   * 与 AI 提供的战局 JSON 合并，输出完整 game-config
   *
   * MVU 结构: stat_data.hero = { funds, KAZU: {level,mana,maxMana}, RINO: {...} }
   * funds 单位 = 金弗（可带 2 位小数）
   * 德州引擎内部仍使用银弗整数，因此在此处做单位换算
   * 战局 JSON 中 hero 字段指定本局的 vanguard/rearguard:
   *   { "hero": { "vanguard": "KAZU", "rearguard": "RINO" }, "seats": {...} }
   *   rearguard 可省略（无副手模式）
   *
   * @param {object} eraVars - MVU 变量 (stat_data)
   * @param {object} aiBattleData - AI 输出的战局 JSON
   * @returns {object} - 完整 game-config
   */
  function buildCompleteGameConfig(eraVars, aiBattleData) {
    const hero = (eraVars && eraVars.hero) || {};
    const battle = aiBattleData || {};
    const battleHero = battle.hero || {};

    // 从战局数据获取本局的主手/副手名称，回退到 MVU 中第一个在队角色
    const charNames = _getHeroCharNames(hero);
    const vName = normalizeHeroCharacterKey(battleHero.vanguard, hero) || charNames[0] || HERO_INTERNAL_KEY;
    const rName = normalizeHeroCharacterKey(battleHero.rearguard, hero) || null; // 副手可选

    const vData = getRosterNode(hero, vName);
    const rData = rName ? getRosterNode(hero, rName) : getRosterNode(hero, null);

    const vLv = Math.min(5, Math.max(0, vData.level || 0));
    const rLv = rName ? Math.min(5, Math.max(0, rData.level || 0)) : 0;
    const maxLv = Math.max(vLv, rLv);

    // 各角色独立属性面板（按角色名 + 等级查表，支持专属角色）
    const vAttrs = getCharAttrs(vName, vLv, 'vanguard');
    const rAttrs = rName ? getCharAttrs(rName, rLv, 'rearguard') : { moirai: 0, chaos: 0, psyche: 0, void: 0 };

    // 合并属性（取各维度最大值，用于战斗/防御）
    const eraAttrs = hero.attrs || null;
    const attrs = eraAttrs || mergeAttrs(vAttrs, rAttrs);

    // 技能：各角色独立推导（传入角色名以解锁专属技能）
    const vanguardSkills = deriveSkillsFromAttrs(vAttrs, vName);
    const rearguardSkills = rName ? deriveSkillsFromAttrs(rAttrs, rName) : [];

    // 特质（按角色名 + 等级 + 位置查表，支持专属角色）
    const vTrait = getCharTrait(vName, vLv, 'vanguard');
    const rTrait = rName ? getCharTrait(rName, rLv, 'rearguard') : null;

    // 魔运值：选择主手/副手中 maxMana 最高的那个
    const vMaxMana = (vData.maxMana != null) ? vData.maxMana : (MANA_BY_LEVEL[vLv] || { max: 0 }).max;
    const rMaxMana = rName ? ((rData.maxMana != null) ? rData.maxMana : (MANA_BY_LEVEL[rLv] || { max: 0 }).max) : 0;

    const manaSource = (rMaxMana > vMaxMana) ? rData : vData;
    const manaLevel = (rMaxMana > vMaxMana) ? rLv : vLv;
    const maxMana = Math.max(vMaxMana, rMaxMana);
    const mana = (manaSource.mana != null) ? manaSource.mana : maxMana;

    // 赌局筹码：NPC 使用 table chips，hero 使用 MVU funds（上限为 table chips）
    const tableChips = _goldFundsToSilverUnits(battle.chips != null ? battle.chips : 10);
    const heroFunds = _goldFundsToSilverUnits(hero.funds);
    const heroChips = heroFunds > 0 ? Math.min(heroFunds, tableChips) : tableChips;

    // 构建 hero 配置（game-config v5 格式：区分主手/副手技能）
    const heroConfig = {
      vanguard: {
        name: resolveFrontendCharacterName(vName, hero),
        level: vLv,
        displayName: resolveFrontendCharacterName(vName, hero),
        roleId: vName
      },
      attrs: { ...attrs },
      vanguardSkills: vanguardSkills,
      rearguardSkills: rearguardSkills,
      mana: mana,
      maxMana: maxMana,
      heroDisplayName: resolveHeroAliasDisplayName(hero, HERO_INTERNAL_KEY)
    };
    if (vTrait) heroConfig.vanguard.trait = vTrait;

    // 副手：仅当指定时才写入
    if (rName) {
      heroConfig.rearguard = { name: rName, level: rLv, displayName: resolveDisplayCharacterName(rName), roleId: rName };
      if (rTrait) heroConfig.rearguard.trait = rTrait;
    }

    const result = {
      blinds: _normalizeBattleBlinds(battle.blinds),
      chips: tableChips,
      heroChips: heroChips,
      heroDisplayName: resolveHeroAliasDisplayName(hero, HERO_INTERNAL_KEY),
      hero: heroConfig,
      seats: battle.seats || {}
    };

    // hero 的座位位置（BTN/SB/BB/UTG/HJ/CO）
    // 必须是 seats 中未被 NPC 占用的位置
    if (battle.heroSeat) {
      result.heroSeat = battle.heroSeat;
    } else {
      // 自动分配：找到 SEAT_ORDER 中第一个未被 NPC 占用的位置
      const SEAT_ORDER = ['BB', 'CO', 'UTG', 'HJ', 'SB', 'BTN'];
      const usedSeats = new Set(Object.keys(battle.seats || {}));
      const freeSeat = SEAT_ORDER.find(s => !usedSeats.has(s));
      result.heroSeat = freeSeat || 'BB';
    }

    // 心理战数据：从 battle.mentalPressure 传递
    if (battle.mentalPressure) {
      result.mentalPressure = battle.mentalPressure;
    }

    // 小游戏模式支持
    const gameMode = battle.gameMode || (Object.keys(battle.seats || {}).length > 0 ? 'texas-holdem' : null);
    if (gameMode) result.gameMode = gameMode;

    // 小游戏配置：根据主手/副手属性映射
    if (gameMode === 'blackjack' || gameMode === 'dice' || gameMode === 'dragon-tiger' || gameMode === 'dragon_tiger') {
      const miniGameAttrs = rName
        ? { moirai: rAttrs.moirai || 0, chaos: rAttrs.chaos || 0, psyche: rAttrs.psyche || 0 }
        : { moirai: vAttrs.moirai || 0, chaos: vAttrs.chaos || 0, psyche: vAttrs.psyche || 0 };

      const miniGameSkills = deriveMiniGameSkills(miniGameAttrs, gameMode);

      result.hero.attrs = miniGameAttrs;
      result.hero.miniGameSkills = miniGameSkills;

      const gameKey = gameMode === 'dragon-tiger' ? 'dragon_tiger' : gameMode;
      result[gameKey] = _normalizeMiniGameConfig(
        battle[gameKey],
        {
          startingChips: heroChips,
          minBet: 10,
          maxBet: Math.floor(heroChips / 2),
          defaultBet: 50,
          mana: { enabled: true, pool: maxMana },
          dealer: { rpsStrategy: 'random' }
        }
      );
    }

    return result;
  }

  // ==========================================================
  //  A. AI 上下文注入（GENERATION_AFTER_COMMANDS）
  // ==========================================================

  function _normalizeFundsAmount(funds) {
    const numeric = Number(funds);
    if (!Number.isFinite(numeric)) return 0;
    return Math.max(0, Math.round(numeric * 100) / 100);
  }

  const SILVER_PER_GOLD = 100;

  function _formatFundsNumber(funds) {
    const value = _normalizeFundsAmount(funds);
    const units = [
      { threshold: 1_000_000_000, suffix: 'b' },
      { threshold: 1_000_000, suffix: 'm' },
      { threshold: 1_000, suffix: 'k' }
    ];

    for (const unit of units) {
      if (value >= unit.threshold) {
        const scaled = value / unit.threshold;
        const precision = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
        return `${scaled.toFixed(precision).replace(/\.?0+$/, '')}${unit.suffix}`;
      }
    }

    return value.toFixed(2).replace(/\.?0+$/, '');
  }

  function _goldFundsToSilverUnits(funds) {
    return Math.max(0, Math.round(_normalizeFundsAmount(funds) * SILVER_PER_GOLD));
  }

  function _silverUnitsToGoldFunds(silver) {
    const numeric = Number(silver);
    if (!Number.isFinite(numeric)) return 0;
    return _normalizeFundsAmount(numeric / SILVER_PER_GOLD);
  }

  function _normalizeBattleBlinds(blinds) {
    const normalized = Array.isArray(blinds) ? blinds : [0.1, 0.2];
    const sb = _goldFundsToSilverUnits(normalized[0] != null ? normalized[0] : 0.1);
    const bb = _goldFundsToSilverUnits(normalized[1] != null ? normalized[1] : 0.2);
    return [sb, bb];
  }

  function _normalizeMiniGameConfig(config, defaults) {
    if (!config || typeof config !== 'object') return { ...defaults };
    const normalized = {
      ...defaults,
      ...config
    };
    for (const key of ['startingChips', 'minBet', 'maxBet', 'defaultBet']) {
      if (config[key] != null) {
        normalized[key] = _goldFundsToSilverUnits(config[key]);
      }
    }
    return normalized;
  }

  function _formatFunds(funds) {
    return `${_formatFundsNumber(funds)} 金弗`;
  }

  // 魔运低于 30% 时视为低魔运
  const MANA_LOW_RATIO = TAVERN_PLUGIN_DATA.MANA_LOW_RATIO || 0.3;
  const REL_STAGE_ENT = TAVERN_PLUGIN_DATA.REL_STAGE_ENT || [];
  const REL_STAGE_EX_BY_CHAR = TAVERN_PLUGIN_DATA.REL_STAGE_EX_BY_CHAR || {};
  const REL_META = TAVERN_PLUGIN_DATA.REL_META || {};
  const REL_DELTA_META = TAVERN_PLUGIN_DATA.REL_DELTA_META || {};
  const CONTEXT_RUNTIME = (typeof window !== 'undefined' ? window : globalThis).ACE0TavernContextRuntime?.create({
    pluginName: PLUGIN_NAME,
    data: TAVERN_PLUGIN_DATA,
    constants: {
      HERO_INTERNAL_KEY,
      WORLD_LAYERS,
      DEFAULT_WORLD_LOCATION,
      LOCATION_LAYER_META,
      DEFAULT_WORLD_CLOCK,
      WORLD_CLOCK_SLOTS,
      MANA_LOW_RATIO,
      REL_STAGE_ENT,
      REL_STAGE_EX_BY_CHAR,
      REL_META,
      REL_DELTA_META
    },
    deps: {
      getCastNode,
      getWorldState,
      getWorldClock,
      getPartyRoster: _getPartyRoster,
      normalizeFundsAmount: _normalizeFundsAmount,
      formatFunds: _formatFunds,
      formatFundsNumber: _formatFundsNumber
    }
  }) || {};

  function getRelStageName(score, table) {
    return CONTEXT_RUNTIME.getRelStageName(score, table);
  }

  function getRelStage(score, table) {
    return CONTEXT_RUNTIME.getRelStage(score, table);
  }

  function buildRelationshipStateSummary(eraVars) {
    return CONTEXT_RUNTIME.buildRelationshipStateSummary(eraVars);
  }
  /**
   * 构建注入给 AI 的 hero 状态 XML 摘要
   * - 资金显示统一为金弗（可带小数）
   * - 在队角色显示等级 + 魔运（低魔运时警告）
   * - 未入队角色不显示等级
   */
  function buildHeroSummary(eraVars) {
    return CONTEXT_RUNTIME.buildHeroSummary(eraVars);
  }

  function getWorldState(eraVars) {
    return eraVars && eraVars.world && typeof eraVars.world === 'object'
      ? eraVars.world
      : {};
  }

  function getHeroState(eraVars) {
    return eraVars && eraVars.hero && typeof eraVars.hero === 'object'
      ? eraVars.hero
      : {};
  }

  function getWorldLocation(eraVars) {
    return CONTEXT_RUNTIME.getWorldLocation(eraVars);
  }

  function buildWorldContextSummary(eraVars) {
    return CONTEXT_RUNTIME.buildWorldContextSummary(eraVars);
  }

  function buildLocationDocSummary(eraVars) {
    return CONTEXT_RUNTIME.buildLocationDocSummary(eraVars);
  }

  const ACT_RUNTIME = (typeof window !== 'undefined' ? window : globalThis).ACE0TavernActRuntime?.create({
    constants: {
      ACT_RESOURCE_KEYS,
      ACT_STAGE_VALUES,
      ACT_PHASE_LABELS,
      WORLD_CLOCK_SLOTS,
      DEFAULT_WORLD_CLOCK,
      DEFAULT_WORLD_CLOCK_PRESSURE,
      DEFAULT_WORLD_ACT,
      DEBT_INTEREST_RATE_PER_PHASE,
      MAJOR_DEBT_INTEREST_RATE_PER_PHASE,
      LOCATION_LAYER_META,
      HERO_INTERNAL_KEY,
      ACT_STATE_INJECT_ID,
      ACT_CHARTER_INJECT_ID,
      ACT_NARRATIVE_INJECT_ID,
      ACT_TRANSITION_INJECT_ID,
      ACT_PACING_INJECT_ID,
      ACT_FIRST_MEET_INJECT_ID
    },
    deps: {
      getAce0HostRoot,
      normalizeTrimmedString: _normalizeTrimmedString,
      normalizeActResourceKey,
      normalizeFundsAmount: _normalizeFundsAmount,
      getEraVars,
      updateEraVars,
      getWorldState,
      getHeroState,
      getHeroCast,
      getCastNode,
      getRosterNode,
      getWorldLocation
    }
  }) || {};
  const {
    TENSION_DELTA = {},
    CLOCK_PRESSURE_DELTA = {},
    FLOOR_PROGRESS_DELTA = {},
    CLOCK_ADVANCE_SUGGESTION_TIERS = []
  } = ACT_RUNTIME;

  function normalizeWorldClock(raw) { return ACT_RUNTIME.normalizeWorldClock(raw); }
  function getWorldClock(eraVars) { return ACT_RUNTIME.getWorldClock(eraVars); }
  function advanceWorldClockState(clock, steps) { return ACT_RUNTIME.advanceWorldClockState(clock, steps); }
  function getWorldClockAbsoluteIndex(clock) { return ACT_RUNTIME.getWorldClockAbsoluteIndex(clock); }
  function getForwardWorldClockPhaseSteps(fromClock, toClock) { return ACT_RUNTIME.getForwardWorldClockPhaseSteps(fromClock, toClock); }
  function applyDebtInterest(principalAmount, phaseSteps, ratePerPhase) { return ACT_RUNTIME.applyDebtInterest(principalAmount, phaseSteps, ratePerPhase); }
  function normalizeActStage(value) { return ACT_RUNTIME.normalizeActStage(value); }
  function getActModuleApi() { return ACT_RUNTIME.getActModuleApi(); }
  function installActModuleHostBridge() { return ACT_RUNTIME.installActModuleHostBridge(); }
  function getActDefaultStateFromModule(actId) { return ACT_RUNTIME.getActDefaultStateFromModule(actId); }
  function getActChapterConfigFromModule(actId) { return ACT_RUNTIME.getActChapterConfigFromModule(actId); }
  function runActModuleMethod(methodName, ...args) { return ACT_RUNTIME.runActModuleMethod(methodName, ...args); }
  function normalizeActResourceCounts(raw) { return ACT_RUNTIME.normalizeActResourceCounts(raw); }
  function normalizeActIncomeRateCounts(raw) { return ACT_RUNTIME.normalizeActIncomeRateCounts(raw); }
  function normalizeActVisionState(raw) { return ACT_RUNTIME.normalizeActVisionState(raw); }
  function getWorldActState(eraVars) { return ACT_RUNTIME.getWorldActState(eraVars); }
  function getActRuntimeConfig(actId) { return ACT_RUNTIME.getActRuntimeConfig(actId); }
  function maybeResolveActCompletionTransition(actState, heroState, worldState) { return ACT_RUNTIME.maybeResolveActCompletionTransition(actState, heroState, worldState); }
  function getActNodeRuntime(config, nodeId) { return ACT_RUNTIME.getActNodeRuntime(config, nodeId); }
  function createEmptyActCounts(defaultValue = 0) { return ACT_RUNTIME.createEmptyActCounts(defaultValue); }
  function createActRewardsForNode(nodeRuntime) { return ACT_RUNTIME.createActRewardsForNode(nodeRuntime); }
  function normalizeActEffectList(list) { return ACT_RUNTIME.normalizeActEffectList(list); }
  function getNormalizedActNodeEffects(config, nodeId) { return ACT_RUNTIME.getNormalizedActNodeEffects(config, nodeId); }
  function getNormalizedActPhaseEffects(config, nodeId, phaseIndex) { return ACT_RUNTIME.getNormalizedActPhaseEffects(config, nodeId, phaseIndex); }
  function deriveActCharacterStates(eraVars) { return ACT_RUNTIME.deriveActCharacterStates(eraVars); }
  function getAllActManagedCharacterKeys() { return ACT_RUNTIME.getAllActManagedCharacterKeys(); }
  async function synchronizeActCharacterState(eraVars) { return await ACT_RUNTIME.synchronizeActCharacterState(eraVars); }
  function buildActStateSummary(eraVars, derivedActState = null) { return ACT_RUNTIME.buildActStateSummary(eraVars, derivedActState); }
  function buildActNarrativePrompts(eraVars, derivedActState = null, firstMeetHints = null) { return ACT_RUNTIME.buildActNarrativePrompts(eraVars, derivedActState, firstMeetHints); }
  function normalizeActSnapshotCounts(raw) { return ACT_RUNTIME.normalizeActSnapshotCounts(raw); }
  function getHeroResourceSnapshot(eraVars) { return ACT_RUNTIME.getHeroResourceSnapshot(eraVars); }
  function getHeroCastStateSnapshot(eraVars, managedCharacters, states) { return ACT_RUNTIME.getHeroCastStateSnapshot(eraVars, managedCharacters, states); }
  function createActRuntimeSnapshot(eraVars, derivedActState = null) { return ACT_RUNTIME.createActRuntimeSnapshot(eraVars, derivedActState); }
  function applyReserveGrowthToAct(actState, config, nodeIndex) { return ACT_RUNTIME.applyReserveGrowthToAct(actState, config, nodeIndex); }
  function clearLimitedActTokens(actState) { return ACT_RUNTIME.clearLimitedActTokens(actState); }
  function resetActPhaseSlots(actState, phaseIndex = 0) { return ACT_RUNTIME.resetActPhaseSlots(actState, phaseIndex); }
  function applyNodeRewardsToAct(actState, config, nodeId) { return ACT_RUNTIME.applyNodeRewardsToAct(actState, config, nodeId); }
  function advanceActToNextNode(actState, config) { return ACT_RUNTIME.advanceActToNextNode(actState, config); }
  function resolveActNodeTransition(actState, config) { return ACT_RUNTIME.resolveActNodeTransition(actState, config); }
  function consumeSingleActPhase(actState, heroState, config) { return ACT_RUNTIME.consumeSingleActPhase(actState, heroState, config); }
  function adjustNarrativeTensionInternal(delta) { return ACT_RUNTIME.adjustNarrativeTensionInternal(delta); }
  function setNarrativeTensionInternal(value) { return ACT_RUNTIME.setNarrativeTensionInternal(value); }
  function resetNarrativeTensionInternal() { return ACT_RUNTIME.resetNarrativeTensionInternal(); }
  function getWorldClockPressure(eraVars) { return ACT_RUNTIME.getWorldClockPressure(eraVars); }
  function pickWorldClockAdvanceTier(pressure) { return ACT_RUNTIME.pickWorldClockAdvanceTier(pressure); }
  function buildWorldClockAdvanceSuggestion(pressure) { return ACT_RUNTIME.buildWorldClockAdvanceSuggestion(pressure); }
  function adjustClockPressureInternal(delta) { return ACT_RUNTIME.adjustClockPressureInternal(delta); }
  function setClockPressureInternal(value) { return ACT_RUNTIME.setClockPressureInternal(value); }
  function resetClockPressureInternal() { return ACT_RUNTIME.resetClockPressureInternal(); }
  function commitCurrentPhasePackUsage(actState, config) { return ACT_RUNTIME.commitCurrentPhasePackUsage(actState, config); }
  function deriveWorldTimeFromAct(actState) { return ACT_RUNTIME.deriveWorldTimeFromAct(actState); }
  async function resolvePendingActAdvance(eraVars) { return await ACT_RUNTIME.resolvePendingActAdvance(eraVars); }
  async function applyFloorProgressDelta(messageId, message) { return await ACT_RUNTIME.applyFloorProgressDelta(messageId, message); }
  async function advanceWorldClock(steps) { return await ACT_RUNTIME.advanceWorldClock(steps); }
  async function setWorldClock(input) { return await ACT_RUNTIME.setWorldClock(input); }

  function areActSnapshotsEqual(before, after) {
    if (!before || !after) return false;
    return JSON.stringify(before) === JSON.stringify(after);
  }

  function getArrayDiff(nextValues, prevValues) {
    const previous = new Set(Array.isArray(prevValues) ? prevValues : []);
    return (Array.isArray(nextValues) ? nextValues : []).filter(value => !previous.has(value));
  }

  function getActResultType(before, after) {
    if (!before || !after) return '';
    if (after.nodeIndex > before.nodeIndex) return 'node_advance';
    if (after.phaseIndex > before.phaseIndex || after.stage !== before.stage) return 'phase_advance';
    return '';
  }

  function diffNumberMap(beforeMap, afterMap) {
    const before = (beforeMap && typeof beforeMap === 'object') ? beforeMap : {};
    const after = (afterMap && typeof afterMap === 'object') ? afterMap : {};
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    const delta = {};
    for (const key of keys) {
      const diff = (Number(after[key]) || 0) - (Number(before[key]) || 0);
      if (diff !== 0) delta[key] = diff;
    }
    return delta;
  }

  function diffManaByRoster(beforeMap, afterMap) {
    return diffNumberMap(beforeMap, afterMap);
  }

  function diffStringArray(beforeValues, afterValues) {
    const previous = new Set(Array.isArray(beforeValues) ? beforeValues : []);
    return (Array.isArray(afterValues) ? afterValues : []).filter(value => !previous.has(value));
  }

  function parseUpdateVariableJsonPatch(content) {
    const text = typeof content === 'string' ? content : '';
    if (!text.includes('<UpdateVariable>') || !text.includes('<JSONPatch>')) return [];
    const match = text.match(/<JSONPatch>\s*([\s\S]*?)\s*<\/JSONPatch>/i);
    if (!match) return [];
    try {
      const parsed = JSON.parse(match[1].trim());
      return Array.isArray(parsed) ? parsed.filter(item => item && typeof item === 'object') : [];
    } catch (_) {
      return [];
    }
  }

  function extractTransitionRequestTargetFromPatches(patches) {
    const items = Array.isArray(patches) ? patches : [];
    for (const patch of items) {
      if (!patch || typeof patch !== 'object') continue;
      if (String(patch.path || '').trim() !== '/world/act/transitionRequestTarget') continue;
      return typeof patch.value === 'string' ? patch.value.trim() : '';
    }
    return null;
  }

  function isRelationshipPatchPath(path) {
    const normalizedPath = typeof path === 'string' ? path.trim() : '';
    return normalizedPath.startsWith('/hero/relationship/');
  }

  function getNonRelationshipPatchesFromContent(content) {
    return parseUpdateVariableJsonPatch(content).filter(patch => !isRelationshipPatchPath(patch.path));
  }

  function hasNonRelationshipVariableUpdate(content) {
    return getNonRelationshipPatchesFromContent(content).length > 0;
  }

  const RESULT_RUNTIME = (typeof window !== 'undefined' ? window : globalThis).ACE0TavernResultRuntime?.create({
    pluginName: PLUGIN_NAME,
    tags: { BATTLE_TAG, FRONTEND_TAG, ACT_RESULT_TAG },
    constants: { ACT_RESOURCE_KEYS, ACT_PHASE_LABELS },
    deps: {
      getActRuntimeConfig,
      getActNodeRuntime,
      diffManaByRoster,
      diffNumberMap,
      diffStringArray,
      getArrayDiff,
      getActResultType,
      getEraVars,
      resolvePendingActAdvance,
      synchronizeActCharacterState,
      createActRuntimeSnapshot,
      getNonRelationshipPatchesFromContent,
      areActSnapshotsEqual,
      getPendingActBaselineSnapshot: () => pendingActBaselineSnapshot,
      setPendingActBaselineSnapshot: (snapshot) => { pendingActBaselineSnapshot = snapshot; },
      resolveBattleData,
      buildCompleteGameConfig
    }
  }) || {};

  function buildStateUpdateSummary(before, after, changedPaths = []) {
    return RESULT_RUNTIME.buildStateUpdateSummary(before, after, changedPaths);
  }

  function buildActResultSummary(resultType, before, after, changedPaths = []) {
    return RESULT_RUNTIME.buildActResultSummary(resultType, before, after, changedPaths);
  }

  function buildActResultPayload(before, after, options = {}) {
    return RESULT_RUNTIME.buildActResultPayload(before, after, options);
  }

  function buildActResultTag(resultPayload) {
    return RESULT_RUNTIME.buildActResultTag(resultPayload);
  }

  async function buildPendingActResult(content = '', eraVars = null) {
    return await RESULT_RUNTIME.buildPendingActResult(content, eraVars);
  }

  async function appendActResultIfNeeded(content, options = {}) {
    return await RESULT_RUNTIME.appendActResultIfNeeded(content, options);
  }

  function parseAiBattleOutput(content) {
    return RESULT_RUNTIME.parseAiBattleOutput(content);
  }

  async function processBattleContent(content) {
    return await RESULT_RUNTIME.processBattleContent(content);
  }

  /**
   * 生成前：读取 MVU 变量 → 注入 hero 状态摘要到 AI 上下文
   */
  async function handleGenerationBefore() {
    try {
      const expansionPromptState = getExpansionPromptStateStore();

      try {
        uninjectPrompts([
          PRIMARY_CONTEXT_INJECT_ID,
          HERO_INJECT_ID,
          REL_STATE_INJECT_ID,
          ACT_STATE_INJECT_ID,
          ACT_CHARTER_INJECT_ID,
          ACT_NARRATIVE_INJECT_ID,
          ACT_TRANSITION_INJECT_ID,
          ACT_PACING_INJECT_ID,
          // 首见帧注入 id 必须每轮清理：本轮若 pending 空（楼层已前进/被闸门清掉），
          // 不会再 push 新 first_meet prompt；若这里不 uninject 旧注入，
          // 酒馆会保留上轮的 first_meet 记录形成幽灵残留。
          ACT_FIRST_MEET_INJECT_ID,
          WORLD_CONTEXT_INJECT_ID,
          LOCATION_DOC_INJECT_ID,
          ...Object.values(CHAR_DOC_INJECT_IDS),
          ...expansionPromptState.ids
        ]);
      } catch (_) { /* ignore */ }

      const syncedState = await synchronizeActCharacterState(await getEraVars());
      const eraVars = syncedState.eraVars;
      const currentWorldClock = getWorldClock(eraVars);
      if (lastObservedWorldClock && !isSameWorldClock(lastObservedWorldClock, currentWorldClock)) {
        if (getWorldClockPressure(eraVars) !== 0) {
          await updateEraVars({ world: { clockPressure: 0 } });
          if (eraVars.world && typeof eraVars.world === 'object') {
            eraVars.world.clockPressure = 0;
          }
        }
      }
      lastObservedWorldClock = { day: currentWorldClock.day, phase: currentWorldClock.phase };
      pendingActBaselineSnapshot = createActRuntimeSnapshot(eraVars, syncedState.derived);
      const heroSummary = buildHeroSummary(eraVars);
      const relationState = buildRelationshipStateSummary(eraVars);
      const worldContext = buildWorldContextSummary(eraVars);
      const locationDoc = buildLocationDocSummary(eraVars);
      // 首见帧楼层闸门：通过 chat.length 判断楼层是否前进。
      // - 当前 chat.length > 上次注入时的值 → 玩家已发新人物消息 → 清空 pending
      // - 相同或更小 → 同一楼层的 swipe / edit / regen → 保留 pending 复用
      // 这让首见帧的生命 = "一次 AI 楼层的完整畁股期"，而不是整个段位。
      try {
        const ctx = (typeof getContext === 'function') ? getContext() : null;
        const currentChatLen = Array.isArray(ctx?.chat) ? ctx.chat.length : -1;
        if (
          currentChatLen >= 0 &&
          lastFirstMeetInjectChatLen >= 0 &&
          currentChatLen > lastFirstMeetInjectChatLen &&
          eraVars?.world?.act?.pendingFirstMeet &&
          Object.keys(eraVars.world.act.pendingFirstMeet).length > 0
        ) {
          await updateEraVars({ world: { act: { pendingFirstMeet: {} } } });
          if (eraVars.world && eraVars.world.act) {
            eraVars.world.act.pendingFirstMeet = {};
          }
        }
      } catch (_) { /* chat 不可取时降级：保留 pending */ }

      const firstMeetHintsForTurn = (eraVars?.world?.act?.pendingFirstMeet && typeof eraVars.world.act.pendingFirstMeet === 'object')
        ? eraVars.world.act.pendingFirstMeet
        : {};
      const firstMeetKeysForTurn = Object.keys(firstMeetHintsForTurn);

      // 记录本次注入时的 chat.length，供下一次 prompt 构造比对。
      if (firstMeetKeysForTurn.length > 0) {
        try {
          const ctx = (typeof getContext === 'function') ? getContext() : null;
          const currentChatLen = Array.isArray(ctx?.chat) ? ctx.chat.length : -1;
          if (currentChatLen >= 0) lastFirstMeetInjectChatLen = currentChatLen;
        } catch (_) {}
      }
      const charDocPrompts = await buildCharacterPromptInjections(eraVars, firstMeetKeysForTurn);
      const actNarrativePrompts = buildActNarrativePrompts(eraVars, syncedState.derived, firstMeetHintsForTurn);
      const expansionPrompts = buildExpansionPromptInjections(eraVars);
      const prompts = [];
      const primaryContextContent = [
        worldContext,
        heroSummary,
        relationState
      ].filter(content => typeof content === 'string' && content.trim()).join('\n\n');

      if (primaryContextContent) {
        prompts.push({
          id: PRIMARY_CONTEXT_INJECT_ID,
          position: 'in_chat',
          depth: 1,
          role: 'system',
          content: primaryContextContent,
          should_scan: false
        });
      }

      if (locationDoc) {
        prompts.push({
          id: LOCATION_DOC_INJECT_ID,
          position: 'in_chat',
          depth: 2,
          role: 'system',
          content: locationDoc,
          should_scan: false
        });
      }

      prompts.push(...actNarrativePrompts);
      prompts.push(...charDocPrompts);
      prompts.push(...expansionPrompts);

      if (prompts.length <= 0) {
        console.warn(`${PLUGIN_NAME} 没有可注入 prompt，跳过`);
        return;
      }

      const normalizedPrompts = prompts.map(prompt => ({
        ...prompt,
        content: replaceHeroPromptMacro(prompt.content)
      }));

      expansionPromptState.ids = expansionPrompts.map(prompt => prompt.id);

      injectPrompts(normalizedPrompts);
      const hasPendingTransitionPrompt = normalizedPrompts.some((prompt) => prompt.id === ACT_TRANSITION_INJECT_ID);
      if (hasPendingTransitionPrompt) {
        await updateEraVars({ world: { act: { pendingTransitionPrompt: '' } } });
        if (eraVars?.world?.act && typeof eraVars.world.act === 'object') {
          eraVars.world.act.pendingTransitionPrompt = '';
        }
      }
      console.log(`${PLUGIN_NAME} world/location/hero/relationship/character docs 已注入 AI 上下文`);
    } catch (e) {
      console.error(`${PLUGIN_NAME} 注入失败:`, e);
    }
  }

  // ==========================================================
  //  B. 解析 AI 输出中的 <ACE0_BATTLE> 标签
  // ==========================================================

  /**
   * 从消息文本中提取 <ACE0_BATTLE> JSON
   * @param {string} content - 消息正文
   * @returns {object|null} - 解析后的战局 JSON
   */
  // ==========================================================
  //  D-1. 优选路径：mag_before_message_update
  //       AI 输出了 <UpdateVariable> 时触发，修改 event.message_content
  // ==========================================================

  async function handleBeforeMessageUpdate(event) {
    let content = event?.message_content || '';
    let changed = false;
    const transitionRequestTarget = extractTransitionRequestTargetFromPatches(parseUpdateVariableJsonPatch(content));
    if (transitionRequestTarget !== null) {
      ACT_RUNTIME.setLatchedTransitionRequestTarget(transitionRequestTarget);
    }

    // Battle 处理（原就逻辑）
    if (content.includes(`<${BATTLE_TAG}>`) && !content.includes(`<${FRONTEND_TAG}>`)) {
      try {
        console.log(`${PLUGIN_NAME} [before_message_update] 检测到 ${BATTLE_TAG}，处理中...`);
        const result = await processBattleContent(content);
        if (result) {
          content = result.content;
          changed = true;
          // 阶段 4：每次 Battle 成功结算 +15 tension
          try { await adjustNarrativeTensionInternal(TENSION_DELTA.BATTLE_RESULT); } catch (_) {}
          console.log(`${PLUGIN_NAME} [before_message_update] 游戏前端已注入 (+${TENSION_DELTA.BATTLE_RESULT} tension)`);
        }
      } catch (e) {
        console.error(`${PLUGIN_NAME} [before_message_update] 处理失败:`, e);
      }
    }

    if (changed) {
      event.message_content = content;
    }
  }

  // ==========================================================
  //  D-2. 兆底路径：CHARACTER_MESSAGE_RENDERED
  //       MVU 完成所有写入后触发，检查并补注入
  // ==========================================================

  async function handleMessageRendered(messageId, options = {}) {
    if (isProcessing) return;

    try {
      const messages = getChatMessages(messageId);
      if (!messages || messages.length === 0) return;

      const msg = messages[0];
      if (options.applyFloorProgress === true) {
        await applyFloorProgressDelta(messageId, msg);
      }
      const content = msg.message || '';
      let nextContent = content;
      let changed = false;

      isProcessing = true;

      if (nextContent.includes(`<${BATTLE_TAG}>`) && !nextContent.includes(`<${FRONTEND_TAG}>`)) {
        console.log(`${PLUGIN_NAME} [rendered_fallback] 检测到未处理的 ${BATTLE_TAG}，补注入...`);
        const battleResult = await processBattleContent(nextContent);
        if (battleResult) {
          nextContent = battleResult.content;
          changed = true;
          try { await adjustNarrativeTensionInternal(TENSION_DELTA.BATTLE_RESULT); } catch (_) {}
        }
      }

      const actResult = await appendActResultIfNeeded(nextContent);
      if (actResult.changed) {
        nextContent = actResult.content;
        changed = true;
        console.log(`${PLUGIN_NAME} [rendered_fallback] ACT 结算回执已注入到消息 #${messageId}`);
      }

      if (changed) {
        await setChatMessages([{
          message_id: messageId,
          message: nextContent
        }], { refresh: 'affected' });
      }

      isProcessing = false;
    } catch (e) {
      console.error(`${PLUGIN_NAME} [rendered_fallback] 处理失败:`, e);
      isProcessing = false;
    }
  }

  // ==========================================================
  //  E+F. 资金结算 + 入队补全 → 已迁移到 acezero-schema.js
  //  由 MVU-zod schema 的 .transform() 自动处理
  //  reconcileFunds: funds_up/funds_down → hero.funds（归零）
  //  cast/roster 补全：在 schema transform 中自动处理
  // ==========================================================

  // ==========================================================
  //  事件绑定
  // ==========================================================

  function resetState(reason) {
    console.log(`${PLUGIN_NAME} ${reason} -> 重置状态`);
    isProcessing = false;
    pendingActBaselineSnapshot = null;
    lastFirstMeetInjectChatLen = -1;
    if (ACT_RUNTIME && typeof ACT_RUNTIME.resetState === 'function') ACT_RUNTIME.resetState();
  }

  eventOn('CHAT_CHANGED', () => resetState('切换对话'));
  eventOn('message_swiped', async (messageId) => {
    resetState('消息重骰');
    setTimeout(() => handleMessageRendered(messageId, { applyFloorProgress: false }), 1500);
  });
  eventOn('message_edited', async (messageId) => {
    resetState('消息编辑');
    setTimeout(() => handleMessageRendered(messageId, { applyFloorProgress: false }), 1500);
  });
  // message_updated 不监听 — 太频繁（MVU 每次 setChatMessages 都触发）
  // 手动编辑后的重注入已由 message_edited 覆盖

  // 生成前：注入 hero 状态摘要
  eventOn('GENERATION_AFTER_COMMANDS', async () => {
    await handleGenerationBefore();
  });

  // 优选路径：MVU 消息更新前拦截（AI 同时输出 UpdateVariable 时）
  //   修改 event.message_content，由 MVU 统一写入
  eventOn('mag_before_message_update', async (event) => {
    await handleBeforeMessageUpdate(event);
  });

  // 兜底路径 A：消息渲染完成后检查
  eventOn('character_message_rendered', async (messageId) => {
    await handleMessageRendered(messageId, { applyFloorProgress: true });
  });

  // 兜底路径 B：消息接收后延迟检查（等 MVU 处理完）
  eventOn('message_received', async (messageId) => {
    setTimeout(() => handleMessageRendered(messageId, { applyFloorProgress: false }), 1500);
  });

  // ==========================================================
  //  扫描并注入：遍历所有消息，为有 ACE0_BATTLE 但无 ACE0_FRONTEND 的消息补注入
  // ==========================================================

  async function scanAndInject() {
    const lastId = getLastMessageId();
    let injected = 0;
    for (let i = lastId; i >= 0; i--) {
      try {
        const messages = getChatMessages(i);
        if (!messages || messages.length === 0) continue;
        const msg = messages[0];
        const content = msg.message || '';
        if (!content.includes(`<${BATTLE_TAG}>`)) continue;
        if (content.includes(`<${FRONTEND_TAG}>`)) continue;

        console.log(`${PLUGIN_NAME} [scan] 消息 #${i} 需要注入`);
        const result = await processBattleContent(content);
        if (result) {
          await setChatMessages([{
            message_id: i,
            message: result.content
          }], { refresh: 'affected' });
          injected++;
          console.log(`${PLUGIN_NAME} [scan] 消息 #${i} 注入完成`);
        }
      } catch (e) {
        console.error(`${PLUGIN_NAME} [scan] 消息 #${i} 处理失败:`, e);
      }
    }
    console.log(`${PLUGIN_NAME} [scan] 扫描完成，共注入 ${injected} 条消息`);
    return injected;
  }

  // ==========================================================
  //  全局 API
  // ==========================================================

  const hostRoot = getAce0HostRoot();
  installActModuleHostBridge();

  hostRoot.ACE0Plugin = {
    getEraVars,

    getDefaultActState(actId) {
      return getActDefaultStateFromModule(actId);
    },

    normalizeActState(rawActState) {
      const actModule = getActModuleApi();
      if (!actModule || typeof actModule.normalizeActState !== 'function') return null;
      try {
        return actModule.normalizeActState(rawActState);
      } catch (error) {
        console.warn('[ACE0 ACT] ACE0Plugin.normalizeActState failed:', error);
        return null;
      }
    },

    createFrontendSnapshot(options) {
      const actModule = getActModuleApi();
      if (!actModule || typeof actModule.createFrontendSnapshot !== 'function') return null;
      try {
        return actModule.createFrontendSnapshot(options);
      } catch (error) {
        console.warn('[ACE0 ACT] ACE0Plugin.createFrontendSnapshot failed:', error);
        return null;
      }
    },

    async syncActState() {
      const result = await synchronizeActCharacterState(await getEraVars());
      return {
        changed: result.changed,
        derived: result.derived
      };
    },

    // 路线选择 API：由结算卡 / Dashboard / 外部 UI 调用。
    // 只在 stage=route 且 nodeId 为合法下一节点时生效，避免误触。
    // 返回 { ok, reason?, nextNodeIndex?, nextNodeId? }。
    async chooseActRoute(nodeId) {
      const targetNodeId = typeof nodeId === 'string' ? nodeId.trim() : '';
      if (!targetNodeId) return { ok: false, reason: 'invalid_node_id' };

      const eraVars = await getEraVars();
      const act = getWorldActState(eraVars);
      if (act.stage !== 'route') return { ok: false, reason: 'not_in_route_stage' };

      const config = getActRuntimeConfig(act.id);
      if (!config) return { ok: false, reason: 'no_chapter_config' };

      const currentNodeId = act.route_history[act.nodeIndex - 1];
      const currentNodeRuntime = getActNodeRuntime(config, currentNodeId);
      const transition = currentNodeRuntime?.next || { mode: 'none' };
      const jumpOptionsResult = act.vision?.jumpReady === true
        ? runActModuleMethod('getJumpRouteOptions', config, act)
        : { ok: false, value: [] };
      const jumpOptions = jumpOptionsResult.ok && Array.isArray(jumpOptionsResult.value)
        ? jumpOptionsResult.value
        : [];
      const isJumpRoute = jumpOptions.includes(targetNodeId);
      const allowed = isJumpRoute
        ? jumpOptions
        : transition.mode === 'choice' && Array.isArray(transition.options)
        ? transition.options
        : (transition.mode === 'forced' && typeof transition.nodeId === 'string' ? [transition.nodeId] : []);
      if (!allowed.includes(targetNodeId)) {
        return { ok: false, reason: 'node_not_allowed' };
      }

      // 等价于 act-plugin 里 forced 分支的两步：先 push 再 advance。
      // 幂等：已经 push 过就不再 push，防抖（比如双击）。
      const actState = JSON.parse(JSON.stringify(act));
      if (actState.route_history.length < actState.nodeIndex + 1) {
        actState.route_history.push(targetNodeId);
      }
      const advanced = advanceActToNextNode(actState, config);
      if (!advanced) {
        // advanceActToNextNode 在 route_history 长度不够时会返回 false —— 上面已补，理论上不该到
        return { ok: false, reason: 'advance_failed' };
      }
      if (isJumpRoute) {
        actState.vision = normalizeActVisionState(actState.vision);
        actState.vision.jumpReady = false;
        actState.vision.bonusSight = 0;
        actState.vision.pendingReplace = null;
      }
      // 节点切换 = 坐标变化，上一节点遗留的首见帧进入历史。清空避免污染下一节点 prompt。
      actState.pendingFirstMeet = {};

      await updateEraVars({ world: { act: actState } });
      return {
        ok: true,
        nextNodeIndex: actState.nodeIndex,
        nextNodeId: actState.route_history[actState.nodeIndex - 1] || null
      };
    },

    async getActStateSummary() {
      const result = await synchronizeActCharacterState(await getEraVars());
      return buildActStateSummary(result.eraVars, result.derived);
    },

    async getGameConfig() {
      const vars = await getEraVars();
      return buildCompleteGameConfig(vars, {});
    },

    getExpansionRegistry,

    async getExpansionSummary() {
      const vars = await getEraVars();
      const registry = getExpansionRegistry();
      const installed = registry && typeof registry.getInstalled === 'function'
        ? registry.getInstalled()
        : [];
      const active = registry && typeof registry.getActive === 'function'
        ? registry.getActive(vars)
        : [];

      return {
        installed: installed.map(expansion => expansion.id),
        active: active.map(expansion => expansion.id),
        state: vars?.world?.expansion_state || { activeMajor: '', activeLight: [] }
      };
    },

    async inspectActiveExpansionModules() {
      const vars = await getEraVars();
      const registry = getExpansionRegistry();
      if (!registry || typeof registry.collectHookEntries !== 'function') {
        return {
          state: vars?.world?.expansion_state || { activeMajor: '', activeLight: [] },
          prompts: [],
          dashboard: [],
          schema: [],
          characters: [],
          battle: []
        };
      }

      return {
        state: vars?.world?.expansion_state || { activeMajor: '', activeLight: [] },
        prompts: registry.collectPromptInjections({ eraVars: vars }),
        dashboard: registry.collectHookEntries('dashboard', { eraVars: vars }),
        schema: registry.collectHookEntries('schema', { eraVars: vars }),
        characters: registry.collectHookEntries('characters', { eraVars: vars }),
        battle: registry.collectHookEntries('battle', { eraVars: vars })
      };
    },

    async setActiveMajorExpansion(expansionId) {
      const normalizedId = typeof expansionId === 'string' ? expansionId.trim() : '';
      await updateEraVars({
        world: {
          expansion_state: {
            activeMajor: normalizedId
          }
        }
      });
      return true;
    },

    // 扫描所有消息，为有 ACE0_BATTLE 但无 ACE0_FRONTEND 的消息补注入
    scanAndInject,

    // 手动触发战局（支持 character/runner/kernel/直写四种格式）
    async triggerBattle(rawBattleData) {
      const eraVars = await getEraVars();
      const resolved = resolveBattleData(rawBattleData);
      const completeConfig = buildCompleteGameConfig(eraVars, resolved);

      const frontendPayload = `<${FRONTEND_TAG}>\n${JSON.stringify(completeConfig)}\n</${FRONTEND_TAG}>`;
      await createChatMessages([{
        role: 'assistant',
        message: frontendPayload
      }]);

      return completeConfig;
    },

    // 获取主角在队角色列表（从 MVU 变量，按 cast.inParty 过滤）
    async getHeroCharacters() {
      const vars = await getEraVars();
      if (!vars || !vars.hero) return [];
      return _getHeroCharNames(vars.hero).map(name => ({
        name,
        ...getCastNode(vars.hero, name),
        ...getRosterNode(vars.hero, name)
      }));
    },

    // 获取完整队伍花名册（含未入队角色）
    async getPartyRoster() {
      const vars = await getEraVars();
      if (!vars || !vars.hero) return [];
      return _getPartyRoster(vars.hero);
    },

    async setCharacterState(charKey, patch) {
      const key = String(charKey || '').toUpperCase();
      if (!NON_PLAYER_CHARACTER_KEYS.includes(key)) {
        console.warn(`${PLUGIN_NAME} 未知角色: ${charKey}`);
        return false;
      }

      const normalizedPatch = { ...(patch || {}) };
      if (normalizedPatch.present === true) {
        normalizedPatch.activated = true;
        normalizedPatch.introduced = true;
      }
      if (normalizedPatch.inParty === true) {
        normalizedPatch.activated = true;
        normalizedPatch.introduced = true;
      }
      if (normalizedPatch.miniKnown === true) {
        normalizedPatch.activated = true;
      }

      await updateEraVars({
        hero: {
          cast: {
            [key]: normalizedPatch
          }
        }
      });

      return true;
    },

    async introduceCharacter(charKey, options = {}) {
      return this.setCharacterState(charKey, {
        activated: true,
        introduced: true,
        present: options.present ?? true
      });
    },

    async setCharacterPresent(charKey, present) {
      if (present) {
        return this.setCharacterState(charKey, {
          activated: true,
          introduced: true,
          present: true
        });
      }
      return this.setCharacterState(charKey, { present: false });
    },

    async setCharacterActivated(charKey, activated) {
      return this.setCharacterState(charKey, {
        activated: !!activated
      });
    },

    async setCharacterMiniKnown(charKey, miniKnown = true) {
      return this.setCharacterState(charKey, {
        activated: !!miniKnown,
        miniKnown: !!miniKnown
      });
    },

    async addCharacterToParty(charKey, options = {}) {
      const key = String(charKey || '').toUpperCase();
      if (!NON_PLAYER_CHARACTER_KEYS.includes(key)) {
        console.warn(`${PLUGIN_NAME} 未知角色: ${charKey}`);
        return false;
      }

      const vars = await getEraVars();
      const hero = vars?.hero || {};
      const roster = getHeroRoster(hero);
      const patch = {
        activated: true,
        introduced: true,
        inParty: true
      };

      if (typeof options.present === 'boolean') patch.present = options.present;

      const heroPatch = {
        cast: {
          [key]: patch
        }
      };

      if (!roster[key]) {
        heroPatch.roster = {
          [key]: {
            level: 1,
            mana: 40,
            maxMana: 40
          }
        };
      }

      await updateEraVars({ hero: heroPatch });
      return true;
    },

    async removeCharacterFromParty(charKey) {
      return this.setCharacterState(charKey, {
        inParty: false
      });
    },

    CHARACTER_PROMPT_DOCS,
    getCharacterPromptDoc,

    clearFullDocCache() {
      return CHARACTER_RUNTIME.clearFullDocCache();
    },

    async debugCharacterPrompt(charKey) {
      const vars = await getEraVars();
      const hero = vars?.hero || {};
      const key = String(charKey || '').toUpperCase();
      return await getCharacterPromptDoc(key, getCastNode(hero, key));
    },

    // NPC 组装
    assembleNPC,
    assembleFromRunner,
    assembleNamedNPC,
    resolveBattleData,

    // 三维度配置表
    NPC: {
      AI_KERNELS,
      RPG_TEMPLATES,
      MOOD_MODIFIERS,
      RUNNER_PRESETS,
      NAMED_NPC_PRESETS
    },

    // 角色档案
    CHARACTERS: NAMED_CHARACTERS,

    // 原有表
    TABLES: {
      UNIVERSAL_SKILLS,
      VANGUARD_TRAIT: VANGUARD_TRAIT_UNLOCK,
      REARGUARD_TRAIT: REARGUARD_TRAIT_UNLOCK,
      VANGUARD_ATTRS: VANGUARD_ATTRS_BY_LEVEL,
      REARGUARD_ATTRS: REARGUARD_ATTRS_BY_LEVEL,
      MANA: MANA_BY_LEVEL
    },

    deriveSkillsFromAttrs,
    getCharAttrs,
    getCharTrait,

    // 阶段 4：情节张力 API
    adjustNarrativeTension(delta) { return adjustNarrativeTensionInternal(delta); },
    setNarrativeTension(v) { return setNarrativeTensionInternal(v); },
    resetNarrativeTension() { return resetNarrativeTensionInternal(); },
    async getNarrativeTension() {
      const eraVars = (typeof getEraVars === 'function' ? await getEraVars() : null) || {};
      const act = getWorldActState(eraVars);
      return Math.max(0, Math.min(100, Math.round(Number(act.narrativeTension) || 0)));
    },
    TENSION_DELTA: Object.assign({}, TENSION_DELTA),
    adjustClockPressure(delta) { return adjustClockPressureInternal(delta); },
    setClockPressure(v) { return setClockPressureInternal(v); },
    resetClockPressure() { return resetClockPressureInternal(); },
    async getClockPressure() {
      const eraVars = (typeof getEraVars === 'function' ? await getEraVars() : null) || {};
      return getWorldClockPressure(eraVars);
    },
    async getWorldClockAdvanceSuggestion() {
      const eraVars = (typeof getEraVars === 'function' ? await getEraVars() : null) || {};
      return buildWorldClockAdvanceSuggestion(getWorldClockPressure(eraVars));
    },
    CLOCK_PRESSURE_DELTA: Object.assign({}, CLOCK_PRESSURE_DELTA),
    CLOCK_ADVANCE_SUGGESTION_TIERS: JSON.parse(JSON.stringify(CLOCK_ADVANCE_SUGGESTION_TIERS)),
    DEBT_INTEREST_RATE_PER_PHASE,
    MAJOR_DEBT_INTEREST_RATE_PER_PHASE,

    // 独立世界时钟（与 ACT 节点完全解耦）
    WORLD_CLOCK_SLOTS,
    getWorldClock() {
      return (async () => {
        const eraVars = (typeof getEraVars === 'function' ? await getEraVars() : null) || {};
        return getWorldClock(eraVars);
      })();
    },
    advanceWorldClock,
    setWorldClock,

    version: '0.9.5'
  };

  window.ACE0Plugin = hostRoot.ACE0Plugin;

  // ==========================================================
  //  初始化完成
  // ==========================================================

  console.log(`${PLUGIN_NAME} 插件加载完成 (v0.9.2 MVU-zod)`);
  console.log(`${PLUGIN_NAME} NPC 组装: kernel=${Object.keys(AI_KERNELS).join('/')} | archetype=${Object.keys(RPG_TEMPLATES).join('/')} | mood=${Object.keys(MOOD_MODIFIERS).join('/')}`);
  console.log(`${PLUGIN_NAME} 专属角色: ${Object.keys(NAMED_CHARACTERS).join(', ')} | NPC预设: ${Object.keys(NAMED_NPC_PRESETS).join(', ')}`);
  console.log(`${PLUGIN_NAME} 跑龙套: ${Object.keys(RUNNER_PRESETS).join(', ')}`);
  console.log(`${PLUGIN_NAME} 流程: AI 输出 <${BATTLE_TAG}> → NPC组装 → 合并 MVU hero → 注入 <${FRONTEND_TAG}> → ST 正则 → STver.html`);
  console.log(`${PLUGIN_NAME} 事件: mag_before_message_update(优选) + character_message_rendered/message_received(兜底)`);
  console.log(`${PLUGIN_NAME} 调试: ACE0Plugin.scanAndInject() — 扫描全部消息补注入`);

})();
