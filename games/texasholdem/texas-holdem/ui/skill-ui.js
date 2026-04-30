/**
 * Skill UI — 技能UI控制器
 * 《零之王牌》通用技能界面模块
 *
 * 三层架构：
 *   1. 静态数据层 (SKILL_DEFS) — 技能视觉定义（图标、名称、CSS类）
 *      从 SkillSystem 注册表自动读取，不硬编码。
 *   2. 动态函数层 — 通用技能激活、按钮状态管理、UI渲染
 *      根据技能 effect/activation 自动决定行为，无需逐个写 handler。
 *   3. 引擎层 — 桥接 SkillSystem + MonteOfZero + 游戏状态
 *      暴露通用接口给 texas-holdem.js，不暴露内部细节。
 *
 * 通用接口：
 *   skillUI.init(skillSystem, moz, containers)
 *   skillUI.update(gameContext)
 *   skillUI.selectCard(deckCards, board, players) → { card, meta }
 *   skillUI.onNewHand()
 *   skillUI.onRoundEnd(gameContext)
 *   skillUI.registerFromConfig(players)
 */

(function (global) {
  'use strict';

  // ========== 静态数据层：技能视觉映射 ==========
  // 按 effect 类型（与 UNIVERSAL_SKILLS 的 effect 字段对应）
  // SVG 图标工厂（16x16 viewBox，用 CSS 控制大小）
  var _svg = function (path, color) {
    return '<svg class="skill-svg-icon" viewBox="0 0 16 16" fill="' + color + '">' + path + '</svg>';
  };
  var _svgS = function (path, color) {
    return '<svg class="skill-svg-icon" viewBox="0 0 16 16" fill="none" stroke="' + color + '" stroke-width="1.5">' + path + '</svg>';
  };

  var SVG_PATHS = {
    fortune:    '<path d="M8 1l2.2 4.5L15 6.3l-3.5 3.4.8 4.8L8 12.3 3.7 14.5l.8-4.8L1 6.3l4.8-.8z"/>',
    curse:      '<path d="M8 1C5.2 1 3 3.7 3 7c0 2.2 1 4 2.5 5h5C12 11 13 9.2 13 7c0-3.3-2.2-6-5-6zM6 12v1c0 .6.9 1 2 1s2-.4 2-1v-1H6z"/>',
    clarity:    '<path d="M8 1.5l1.5 3 3.5.5-2.5 2.5.5 3.5L8 9.5 4.5 11l.5-3.5L2.5 5l3.5-.5z"/><line x1="3" y1="13" x2="13" y2="13" stroke-width="1.5"/>',
    refraction: '<path d="M4 3c2 3 6-1 8 2s-4 5-2 8"/><path d="M12 3c-2 3-6-1-8 2s4 5 2 8"/>',
    reversal:   '<path d="M2 5h9l-3-3h2l4 4-4 4h-2l3-3H2V5zm12 6H5l3 3H6l-4-4 4-4h2L5 9h9v2z"/>',
    null_field:  '<circle cx="8" cy="8" r="6"/><line x1="4" y1="12" x2="12" y2="4"/>',
    void_shield: '<path d="M8 1L2 4v4c0 3.3 2.6 6.4 6 7 3.4-.6 6-3.7 6-7V4L8 1z"/>',
    purge_all:   '<path d="M8 2L3 8l5 6 5-6-5-6z"/>'
  };

  // attr → hero-card skin class
  var ATTR_TO_SKIN = {
    moirai: 'skin-moirai',
    chaos:  'skin-chaos',
    psyche: 'skin-psyche',
    void:   'skin-void'
  };

  var EFFECT_TO_SKIN = {
    royal_decree: 'skin-signature-rino',
    heart_read: 'skin-signature-rino',
    cooler: 'skin-signature-sia',
    skill_seal: 'skin-signature-sia',
    clairvoyance: 'skin-signature-vv',
    bubble_liquidation: 'skin-signature-vv',
    miracle: 'skin-signature-poppy',
    lucky_find: 'skin-signature-poppy',
    rule_rewrite: 'skin-joker',
    blind_box: 'skin-joker',
    deal_card: 'skin-signature-cota',
    gather_or_spread: 'skin-signature-cota',
    factory_malfunction: 'skin-signature-cota',
    absolution: 'skin-signature-eulalia',
    benediction: 'skin-signature-eulalia',
    reclassification: 'skin-signature-kako',
    general_ruling: 'skin-signature-kako',
    house_edge: 'skin-signature-kuzuha',
    debt_call: 'skin-signature-kuzuha'
  };

  // SVG 文件基础路径（相对于 texas-holdem.html）
  var SVG_BASE_PATH = '../../../assets/svg/';
  var KAKO_RULING_ICON = SVG_BASE_PATH + 'fountain-pen.svg';
  var KAKO_RED_SEAL_ICON = SVG_BASE_PATH + 'stamper.svg';
  var COTA_ACE_ICON = SVG_BASE_PATH + 'ace.svg';
  var COTA_HAZARD_ICON = SVG_BASE_PATH + 'hazard-sign.svg';
  var VV_MARK_ICON = SVG_BASE_PATH + 'star-pupil.svg';
  var VV_LIQUIDATION_ICON = SVG_BASE_PATH + 'shiny-purse.svg';
  var VV_BULLISH_ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' fill='%23d96565' viewBox='0 0 256 256'%3E%3Cpath d='M236,208a12,12,0,0,1-12,12H32a12,12,0,0,1-12-12V48a12,12,0,0,1,24,0v99l43.51-43.52a12,12,0,0,1,17,0L128,127l43-43H160a12,12,0,0,1,0-24h40a12,12,0,0,1,12,12v40a12,12,0,0,1-24,0V101l-51.51,51.52a12,12,0,0,1-17,0L96,129,44,181v15H224A12,12,0,0,1,236,208Z'%3E%3C/path%3E%3C/svg%3E";
  var VV_BEARISH_ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' fill='%2361c58c' viewBox='0 0 256 256'%3E%3Cpath d='M236,208a12,12,0,0,1-12,12H32a12,12,0,0,1-12-12V48a12,12,0,0,1,24,0V59l52,52,23.51-23.52a12,12,0,0,1,17,0L188,139V128a12,12,0,0,1,24,0v40q0,.6-.06,1.2c0,.16-.05.33-.07.49s-.06.45-.1.67-.09.38-.14.56-.09.39-.15.58l-.19.54c-.07.19-.13.38-.21.56s-.15.34-.23.5-.17.38-.27.57-.18.3-.27.45-.21.38-.33.56-.24.32-.36.47-.22.32-.34.47-.46.53-.71.78l-.08.1-.1.08c-.25.25-.51.48-.78.71l-.46.34c-.16.12-.32.25-.48.36s-.37.22-.55.33-.3.19-.46.27-.37.18-.56.27-.33.16-.51.23l-.54.21-.57.19a4.92,4.92,0,0,1-.55.14l-.58.15-.64.09-.53.08A11.51,11.51,0,0,1,200,180H160a12,12,0,0,1,0-24h11l-43-43-23.51,23.52a12,12,0,0,1-17,0L44,93V196H224A12,12,0,0,1,236,208Z'%3E%3C/path%3E%3C/svg%3E";

  function normalizeKakoDecision(decision) {
    if (decision === true || decision === 'approve' || decision === 'approved' ||
        decision === 'pass' || decision === 'passed' || decision === 'through' ||
        decision === '通过') {
      return 'approve';
    }
    if (decision === false || decision === 'reject' || decision === 'rejected' ||
        decision === 'fail' || decision === 'failed' || decision === 'block' ||
        decision === '不通过' || decision === '拦截') {
      return 'reject';
    }
    return null;
  }

  function normalizeKakoRulingType(rulingType) {
    return rulingType === 'fortune' ? 'fortune'
      : rulingType === 'curse' ? 'curse'
      : null;
  }

  function normalizeKakoPreviewRates(previewRates) {
    return {
      primaryRate: Math.max(0, Number(previewRates && previewRates.primaryRate || 0)),
      secondaryRate: Math.max(0, Number(previewRates && previewRates.secondaryRate || 0))
    };
  }

  function projectKakoRawAmount(amount, factor) {
    return Math.max(0, Math.ceil(Math.max(0, Number(amount || 0)) * Math.max(0, Number(factor || 0))));
  }

  function getKakoRecipientId(force) {
    if (!force) return null;
    if (force.type === 'curse') return force.targetId != null ? force.targetId : null;
    if (force.type === 'fortune') {
      if (force.targetId != null) return force.targetId;
      if (force.protectId != null) return force.protectId;
      return force.ownerId != null ? force.ownerId : null;
    }
    return null;
  }

  function hasKakoJudgeablePendingForce(skillSystem, targetId) {
    if (!skillSystem || !Array.isArray(skillSystem.pendingForces) || targetId == null) return false;
    for (var i = 0; i < skillSystem.pendingForces.length; i++) {
      var force = skillSystem.pendingForces[i];
      if (!force || (force.type !== 'fortune' && force.type !== 'curse')) continue;
      if (getKakoRecipientId(force) === targetId) return true;
    }
    return false;
  }

  function formatKakoPercent(rate, sign) {
    var percent = Math.round(Math.max(0, Number(rate || 0)) * 100);
    return (sign || '') + percent + '%';
  }

  function formatKakoAmount(value) {
    var amount = Math.max(0, Number(value || 0));
    var rounded = Math.round(amount * 10) / 10;
    return (Math.abs(rounded - Math.round(rounded)) < 0.001 ? String(Math.round(rounded)) : rounded.toFixed(1));
  }

  // skillKey → SVG 文件名映射（从 skill-system.js 的 icon 字段读取，此处作为 fallback）
  var SKILL_ICON_MAP = {
    minor_wish:   'round-star.svg',
    grand_wish:   'stars-stack.svg',
    divine_order: 'star-formation.svg',
    hex:          'bleeding-eye.svg',
    havoc:        'skull-crack.svg',
    catastrophe:  'reaper-scythe.svg',
    clarity:      'magnifying-glass.svg',
    refraction:   'octogonal-eye.svg',
    axiom:        'cursed-star.svg',
    static_field: 'magic-palm.svg',
    insulation:   'dice-shield.svg',
    reality:      'ace.svg',
    royal_decree: 'barbed-star.svg',
    heart_read:   'chained-heart.svg',
    cooler:       'spade-skull.svg',
    skill_seal:   'crossed-chains.svg',
    clairvoyance: 'star-pupil.svg',
    bubble_liquidation: 'shiny-purse.svg',
    rule_rewrite: 'jester-hat.svg',
    blind_box:    'party-popper.svg',
    house_edge:      'fox-head.svg',
    debt_call:       'card-burn.svg',
    deal_card:       'ace.svg',
    gather_or_spread:'ace.svg',
    factory_malfunction:'ace.svg',
    absolution:      'boomerang-cross.svg',
    benediction:     'hand-of-god.svg',
    reclassification:'fountain-pen.svg',
    general_ruling:  'stamper.svg'
  };

  // Legacy inline SVG paths (fallback when no SVG file available)
  var BG_SVG_PATHS = {
    fortune:    '<path d="M12 2l2.4 7.2h7.6l-6 4.8 2.4 7.2-6-4.8-6 4.8 2.4-7.2-6-4.8h7.6z"/>',
    curse:      '<path d="M12 2C8.1 2 5 6 5 10.5c0 3 1.5 5.5 3.5 7h7c2-1.5 3.5-4 3.5-7C19 6 15.9 2 12 2zM9 19v1.5c0 .8 1.3 1.5 3 1.5s3-.7 3-1.5V19H9z"/>',
    clarity:    '<path d="M12 2l2 5 5.5 1-4 4 1 5.5L12 15l-4.5 2.5 1-5.5-4-4 5.5-1z"/><line x1="4" y1="21" x2="20" y2="21" stroke-width="2"/>',
    refraction: '<path d="M5 4c3 5 9-2 12 3s-6 8-3 13"/><path d="M19 4c-3 5-9-2-12 3s6 8 3 13"/>',
    reversal:   '<path d="M3 7h13l-4-4h3l5 5.5-5 5.5h-3l4-4H3V7zm18 10H8l4 4H9l-5-5.5L9 10h3l-4 4h13v3z"/>',
    purge_all:  '<path d="M12 2L2 12l10 10 10-10L12 2z"/>',
    null_field:  '<circle cx="12" cy="12" r="9"/><line x1="6" y1="18" x2="18" y2="6"/>',
    void_shield: '<path d="M12 1L3 5v6c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V5L12 1z"/>'
  };

  var EFFECT_VISUALS = {
    fortune:     { icon: _svg(SVG_PATHS.fortune, '#9B59B6'),   cssClass: 'moirai-skill', color: '#9B59B6', attr: 'moirai' },
    curse:       { icon: _svg(SVG_PATHS.curse, '#e74c3c'),     cssClass: 'chaos-skill',  color: '#e74c3c', attr: 'chaos' },
    clarity:     { icon: _svgS(SVG_PATHS.clarity, '#74b9ff'),  cssClass: 'psyche-skill', color: '#74b9ff', attr: 'psyche' },
    refraction:  { icon: _svgS(SVG_PATHS.refraction, '#a29bfe'), cssClass: 'psyche-skill', color: '#a29bfe', attr: 'psyche' },
    reversal:    { icon: _svg(SVG_PATHS.reversal, '#1abc9c'),  cssClass: 'psyche-skill', color: '#1abc9c', attr: 'psyche' },
    null_field:  { icon: _svgS(SVG_PATHS.null_field, '#95a5a6'), cssClass: 'void-skill', color: '#95a5a6', attr: 'void' },
    void_shield: { icon: _svgS(SVG_PATHS.void_shield, '#7f8c8d'), cssClass: 'void-skill', color: '#7f8c8d', attr: 'void' },
    purge_all:     { icon: _svgS(SVG_PATHS.purge_all, '#bdc3c7'), cssClass: 'void-skill',   color: '#bdc3c7', attr: 'void' },
    royal_decree:  { icon: _svg(SVG_PATHS.fortune, '#D4AF37'),    cssClass: 'moirai-skill', color: '#D4AF37', attr: 'moirai' },
    heart_read:    { icon: _svg(SVG_PATHS.clarity, '#FF69B4'),    cssClass: 'psyche-skill', color: '#FF69B4', attr: 'psyche' },
    cooler:        { icon: _svg(SVG_PATHS.curse, '#4A0E0E'),      cssClass: 'chaos-skill',  color: '#4A0E0E', attr: 'chaos' },
    skill_seal:    { icon: _svgS(SVG_PATHS.void_shield, '#8B0000'), cssClass: 'chaos-skill', color: '#8B0000', attr: 'chaos' },
    clairvoyance:  { icon: _svgS(SVG_PATHS.clairvoyance, '#E0B0FF'), cssClass: 'psyche-skill', color: '#E0B0FF', attr: 'psyche' },
    bubble_liquidation: { icon: _svg(SVG_PATHS.bubble_liquidation, '#F0B44C'), cssClass: 'psyche-skill', color: '#F0B44C', attr: 'psyche' },
    miracle:       { icon: _svg(SVG_PATHS.miracle, '#50C878'),       cssClass: 'moirai-skill', color: '#50C878', attr: 'moirai' },
    lucky_find:    { icon: _svg(SVG_PATHS.lucky_find, '#90EE90'),    cssClass: 'moirai-skill', color: '#90EE90', attr: 'moirai' },
    deal_card:       { icon: _svgS(SVG_PATHS.purge_all, '#FF9BC2'),      cssClass: 'psyche-skill', color: '#FF9BC2', attr: 'psyche' },
    gather_or_spread:{ icon: _svgS(SVG_PATHS.refraction, '#FF9BC2'),     cssClass: 'psyche-skill', color: '#FF9BC2', attr: 'psyche' },
    factory_malfunction:{ icon: _svgS(SVG_PATHS.void_shield, '#FF9BC2'), cssClass: 'psyche-skill', color: '#FF9BC2', attr: 'psyche' },
    absolution:      { icon: _svg(SVG_PATHS.fortune, '#E0FFFF'),       cssClass: 'moirai-skill', color: '#E0FFFF', attr: 'moirai' },
    benediction:     { icon: _svg(SVG_PATHS.fortune, '#E0FFFF'),       cssClass: 'moirai-skill', color: '#E0FFFF', attr: 'moirai' },
    reclassification:{ icon: _svgS(SVG_PATHS.refraction, '#DC143C'),   cssClass: 'psyche-skill', color: '#DC143C', attr: 'psyche' },
    general_ruling:  { icon: _svgS(SVG_PATHS.reversal, '#DC143C'),     cssClass: 'psyche-skill', color: '#DC143C', attr: 'psyche' },
    house_edge:      { icon: _svg(SVG_PATHS.curse, '#8B0000'),         cssClass: 'chaos-skill',  color: '#8B0000', attr: 'chaos' },
    debt_call:       { icon: _svg(SVG_PATHS.curse, '#8B0000'),         cssClass: 'chaos-skill',  color: '#8B0000', attr: 'chaos' }
  };

  // 技能显示名（skillKey → 中文名）
  const SKILL_NAMES = {
    minor_wish:   '小吉',
    grand_wish:   '大吉',
    divine_order: '天命',
    hex:          '小凶',
    havoc:        '大凶',
    catastrophe:  '灾变',
    clarity:      '澄澈',
    refraction:   '折射',
    axiom:        '真理',
    static_field: '屏蔽',
    insulation:   '绝缘',
    reality:      '现实',
    royal_decree: '敕令',
    heart_read:   '命运感知',
    cooler:       '冤家牌',
    skill_seal:   '冻结令',
    clairvoyance: '估价眼',
    bubble_liquidation: '泡沫清算',
    rule_rewrite: '规则篡改',
    blind_box:    '盲盒派对',
      miracle:      '命大',
    lucky_find:   '捡到了！',
    deal_card:      '发牌',
    gather_or_spread:'理牌',
    factory_malfunction:'故障切换',
    absolution:     '赦免',
    benediction:    '祝福',
    reclassification: '改判',
    general_ruling: '总务裁定',
    house_edge:     '抽水',
    debt_call:      '催收',
    presence:       '压场',
    taunt:          '挑衅',
    probe:          '试探',
    center_self:    '定神'
  };

  // 行为分类（决定按钮逻辑和 UI 交互方式）
  const BEHAVIOR = {
    FORCE:   'force',    // 影响发牌的力量型技能 (fortune, purge_all)
    CURSE:   'curse',    // 需要选目标的诅咒/冻结/标记技能 (curse, skill_seal, cooler)
    LOCK:    'lock',     // VV 锁定型技能 (clairvoyance — 选择建仓目标)
    PSYCHE:  'psyche',   // Psyche 双重效果技能 (clarity, refraction, reversal — 信息+反制)
    MENTAL:  'mental',   // 心理战技能 (presence, taunt, probe — 需选目标; center_self — 自己)
    TOGGLE:  'toggle',   // 开关型技能 (void_shield 绝缘 — 0 mana, 手动切换)
    PASSIVE: 'passive'   // 被动技能 (null_field — 不生成按钮)
  };

  // effect → behavior 映射
  function effectToBehavior(effect, activation) {
    if (activation === 'passive') return BEHAVIOR.PASSIVE;
    if (activation === 'toggle') return BEHAVIOR.TOGGLE;
    // 心理战技能
    if (effect === 'psych_pressure' || effect === 'psych_probe' || effect === 'psych_recover') return BEHAVIOR.MENTAL;
    // VV 选择建仓目标
    if (effect === 'clairvoyance') return BEHAVIOR.LOCK;
    // Psyche 技能: 双重效果 (信息必定触发 + 反制vs Chaos)
    if (effect === 'clarity' || effect === 'refraction' || effect === 'reversal' || effect === 'heart_read') return BEHAVIOR.PSYCHE;
    // 需要选目标的诅咒/封印/标记/债蚀/定向祝福技能
    if (effect === 'curse' || effect === 'skill_seal' || effect === 'cooler' || effect === 'house_edge' || effect === 'debt_call' || effect === 'benediction' || effect === 'reclassification') return BEHAVIOR.CURSE;
    // 改判 / 总务裁定 / 赦免 等阶段型技能先归入 FORCE 通道。
    return BEHAVIOR.FORCE;
  }

  // ========== SkillUI 类 ==========

  class SkillUI {
    constructor() {
      // 引擎引用
      this.skillSystem = null;
      this.moz = null;

      // UI 容器
      this.containers = {
        skillPanel: null,     // 技能按钮容器
        manaBar: null,        // mana 条填充元素
        manaText: null,       // mana 文字
        backlashIndicator: null,
        mozStatus: null,      // 状态文字
        forceBalance: null,   // 力量对比条
        foresightPanel: null  // 先知预览面板
      };

      // 生成的按钮映射 { uniqueId → buttonElement }
      this._buttons = new Map();

      // 玩家ID（人类玩家）
      this.humanPlayerId = 0;

      // 回调
      this.onLog = null;         // (type, data) → void
      this.onMessage = null;     // (msg) → void  — 显示消息到游戏UI

      // 游戏上下文快照（由 update() 刷新）
      this._gameCtx = {
        phase: 'idle',
        isPlayerTurn: false,
        deckCards: [],
        board: [],
        players: []
      };
    }

    // ========== 初始化 ==========

    /**
     * 初始化技能UI
     * @param {SkillSystem} skillSystem
     * @param {MonteOfZero} moz
     * @param {object} containers — DOM 元素引用
     */
    init(skillSystem, moz, containers) {
      this.skillSystem = skillSystem;
      this.moz = moz;

      // 绑定容器
      Object.keys(containers).forEach(key => {
        if (containers[key]) this.containers[key] = containers[key];
      });

      // 注入 curse 目标选择回调（委托给 PokerAI.SkillAI）
      var self = this;
      if (typeof PokerAI !== 'undefined' && PokerAI.SkillAI) {
        skillSystem.curseTargetFn = function(casterId, players) {
          // players 可能来自 _skillToForce 的 gameContext，也可能为 null
          var pList = (players || (self._gameCtx && self._gameCtx.players) || []).filter(function(p) {
            return p && p.isActive !== false;
          });
          // 查找施法者的 difficulty
          var caster = pList.find(function(p) { return p.id === casterId; });
          var difficulty = (caster && caster.difficultyProfile)
            || (caster && caster.ai && caster.ai.difficultyProfile)
            || (caster && caster.personality && caster.personality.difficulty)
            || (caster && caster.difficulty)
            || 'noob';
          return PokerAI.SkillAI.pickCurseTarget(difficulty, casterId, pList);
        };

        // 注入技能使用决策回调（委托给 PokerAI.SkillAI）
        skillSystem.skillDecideFn = function(skill, owner, gameContext, pendingForces, mana) {
          var pList = gameContext.players || (self._gameCtx && self._gameCtx.players) || [];
          var caster = pList.find(function(p) { return p.id === skill.ownerId; });
          var difficulty = (caster && caster.difficultyProfile)
            || (caster && caster.ai && caster.ai.difficultyProfile)
            || (caster && caster.personality && caster.personality.difficulty)
            || (caster && caster.difficulty)
            || 'noob';
          return PokerAI.SkillAI.shouldUseSkill(difficulty, skill, owner, gameContext, pendingForces, mana);
        };
      }

      // 监听 skillSystem 事件
      this._wireHooks();
    }

    /**
     * 从配置注册技能（委托给 skillSystem）+ 生成UI
     * @param {object} playerConfigs - 游戏配置
     * @param {object} [playerIdMap] - { heroId, seats: { BTN: id, ... } }
     */
    registerFromConfig(playerConfigs, playerIdMap) {
      if (!this.skillSystem) return;
      // 同步 humanPlayerId
      if (playerIdMap && playerIdMap.heroId != null) {
        this.humanPlayerId = playerIdMap.heroId;
      }
      this.skillSystem.registerFromConfig(playerConfigs, playerIdMap);

      // --- RPG 系统初始化（TraitSystem → CombatFormula → MonteOfZero） ---
      if (typeof TraitSystem !== 'undefined' && this.moz) {
        var heroId = this.humanPlayerId;
        var self = this;

        // TraitSystem：注册所有角色特质（使用真实游戏 ID）
        var traitSys = new TraitSystem();
        traitSys.registerFromConfig(playerConfigs, playerIdMap);

        // AttributeSystem + SwitchSystem（如果可用）
        var attrSys = null;
        var switchSys = null;
        if (typeof AttributeSystem !== 'undefined') {
          attrSys = new AttributeSystem();
          var attrPlayers = window.__rpgBuildAttrPlayers ? window.__rpgBuildAttrPlayers(playerConfigs, playerIdMap) : [];
          attrSys.registerFromConfig(attrPlayers);
        }
        if (typeof SwitchSystem !== 'undefined' && playerConfigs.hero) {
          switchSys = new SwitchSystem({ rinoId: heroId });
        }

        // CombatFormula：注入 traitSystem
        if (typeof CombatFormula !== 'undefined') {
          var cf = new CombatFormula({
            attributeSystem: attrSys,
            switchSystem: switchSys,
            traitSystem: traitSys,
            skillSystem: this.skillSystem,
            heroId: heroId,
            onTraitManaGain: function(ownerId, amount) {
              if (amount > 0) self.skillSystem.regenMana(ownerId, amount);
            }
          });
          this.moz.combatFormula = cf;
        }

        // 注入特质消耗修正回调到 skillSystem
        var _ts = traitSys;
        this.skillSystem.traitCostFn = function(ownerId, baseCost) {
          var eff = _ts.hasEffect(ownerId, 'mana_efficiency');
          if (eff.has && eff.value.costMult) {
            return Math.round(baseCost * eff.value.costMult);
          }
          return baseCost;
        };
        this.skillSystem.traitRegenFn = function(ownerId, baseRegen) {
          var regen = baseRegen;

          var manaBonus = _ts.hasEffect(ownerId, 'mana_regen_bonus');
          if (manaBonus.has && manaBonus.value.value) regen += manaBonus.value.value;

          var calm = _ts.hasEffect(ownerId, 'calm_support');
          if (calm.has && calm.value.manaRegen) regen += calm.value.manaRegen;

          var firstCast = _ts.hasEffect(ownerId, 'first_cast_discount');
          if (firstCast.has && firstCast.value.manaRegen) regen += firstCast.value.manaRegen;

          return Math.max(0, Math.round(regen));
        };

        // 存储引用供外部使用
        this._traitSystem = traitSys;
        console.log('[SkillUI] RPG 系统已初始化 — TraitSystem:', traitSys.getSummary());
      }

      this._buildSkillButtons();
    }

    // ========== 通用接口：游戏生命周期 ==========

    /**
     * 新一手牌
     */
    onNewHand() {
      if (this.skillSystem) this.skillSystem.onNewHand();
    }

    onStreetStart(phase, gameContext) {
      if (!this.skillSystem) return;
      if (gameContext) this._gameCtx = gameContext;
      this.skillSystem.onStreetStart(phase);
      this.updateDisplay();
      this.updateButtons();
    }

    /**
     * 每轮下注结束后调用 — 基础处理（mana恢复 + CD递减 + 触发检查）
     * 不包含 NPC 出招，NPC 出招在技能博弈阶段统一执行
     * @param {object} gameContext — { players, pot, phase, board }
     */
    onRoundEndBase(gameContext) {
      if (!this.skillSystem) return;
      this._gameCtx = gameContext;
      this.skillSystem.onRoundEnd(gameContext);
      this.skillSystem.checkTriggers(gameContext);
      this.updateDisplay();
      this.updateButtons();
    }

    /**
     * 技能博弈阶段：NPC 出招（在玩家确认后调用）
     * @param {object} [gameContext] — 可选，不传则用上次缓存的
     */
    fireNpcSkills(gameContext) {
      if (!this.skillSystem) return [];
      var ctx = gameContext || this._gameCtx;
      var records = ctx ? this.skillSystem.npcDecideSkills(ctx) : [];
      this.updateDisplay();
      this.updateButtons();
      return records || [];
    }

    /**
     * 兼容旧接口 — 直接完成基础处理 + NPC出招
     * @param {object} gameContext
     */
    onRoundEnd(gameContext) {
      this.onRoundEndBase(gameContext);
      this.fireNpcSkills(gameContext);
    }

    /**
     * 用命运引擎选一张牌（核心桥接）
     * @param {Array} deckCards
     * @param {Array} board
     * @param {Array} players
     * @returns {{ card, meta }}
     */
    selectCard(deckCards, board, players) {
      if (!this.moz || !this.moz.enabled || !deckCards || !deckCards.length) {
        return null; // 让调用方 fallback
      }

      // 注入 gameContext 到 CombatFormula（供特质判断筹码等动态条件）
      if (this.moz.combatFormula) {
        this.moz.combatFormula.gameContext = {
          players: players,
          phase: (this._gameCtx && this._gameCtx.phase) || null
        };
      }

      // 快照当前 pending forces 数量（之后添加的力量保留到下次 selectCard）
      const snapshotLen = this.skillSystem.pendingForces.length;
      const forces = this.skillSystem.collectActiveForces({ players: players });

      console.log('[SkillUI.selectCard]', {
        pendingCount: snapshotLen,
        totalForces: forces.length,
        forces: forces.map(f => f.ownerName + ' ' + f.type + ' P=' + f.power)
      });

      const result = this.moz.selectCard(
        deckCards, board, players, forces,
        {
          rinoPlayerId: this.humanPlayerId,
          phase: (this._gameCtx && this._gameCtx.phase) || null,
          skillSystem: this.skillSystem
        }
      );

      // 只清除 selectCard 时已存在的 pending forces，保留之后新增的
      if (this.skillSystem.pendingForces.length === snapshotLen) {
        this.skillSystem.pendingForces = [];
      } else {
        // 有新 forces 在 selectCard 期间加入（如触发型技能），保留它们
        this.skillSystem.pendingForces = this.skillSystem.pendingForces.slice(snapshotLen);
      }

      return result;
    }

    /**
     * 先知预览（不消耗，纯计算）
     */
    foresight(deckCards, board, players) {
      if (!this.moz) return [];
      const forces = this.skillSystem.collectActiveForces({ players: players });
      return this.moz.foresight(deckCards, board, players, forces, this.humanPlayerId);
    }

    // ========== 通用接口：UI 更新 ==========

    /**
     * 刷新游戏上下文（每次 nextTurn / phase change 时调用）
     */
    update(gameContext) {
      this._gameCtx = { ...this._gameCtx, ...gameContext };
      this.updateDisplay();
      this.updateButtons();
    }

    /**
     * 更新 mana 条 + 状态文字 + 力量对比
     */
    updateDisplay() {
      if (!this.skillSystem) return;
      const ss = this.skillSystem.getState();
      const mana = this.skillSystem.getMana(this.humanPlayerId);

      // Mana 条
      if (this.containers.manaBar) {
        const pct = mana.max > 0 ? (mana.current / mana.max) * 100 : 0;
        this.containers.manaBar.style.width = pct + '%';
        if (!this._manaBarBase) {
          this._manaBarBase = this.containers.manaBar.classList.contains('mp-fluid') ? 'mp-fluid mana-fill' : 'mana-fill';
        }
        var baseClass = this._manaBarBase;
        if (pct > 50) {
          this.containers.manaBar.className = baseClass + ' high';
        } else if (pct > 20) {
          this.containers.manaBar.className = baseClass + ' medium';
        } else {
          this.containers.manaBar.className = baseClass + ' low';
        }
      }

      if (this.containers.manaText) {
        this.containers.manaText.textContent = 'MP ' + mana.current + '/' + mana.max;
      }

      // 反噬指示器
      if (this.containers.backlashIndicator) {
        if (ss.backlash.active) {
          this.containers.backlashIndicator.style.display = 'block';
          this.containers.backlashIndicator.textContent = 'BACKLASH (' + ss.backlash.counter + ')';
        } else {
          this.containers.backlashIndicator.style.display = 'none';
        }
      }

      // 状态文字 + 力量对比
      if (this.containers.mozStatus) {
        const summary = this.skillSystem.getForcesSummary();
        const hasEnemyForces = summary.enemies.length > 0;

        if (ss.backlash.active) {
          this.containers.mozStatus.textContent = '魔运反噬中...';
          this.containers.mozStatus.className = 'moz-status backlash';
        } else if (mana.current < 20) {
          this.containers.mozStatus.textContent = '魔运虚弱';
          this.containers.mozStatus.className = 'moz-status weak';
        } else if (hasEnemyForces) {
          var enemyNames = summary.enemies.map(function (e) { return e.name.split(' ')[0]; }).join(', ');
          this.containers.mozStatus.textContent = '命运场: 友' + summary.total.ally + ' vs 敌' + summary.total.enemy + ' (' + enemyNames + ')';
          this.containers.mozStatus.className = summary.total.ally >= summary.total.enemy ? 'moz-status ready' : 'moz-status contested';
        } else {
          this.containers.mozStatus.textContent = '魔运就绪';
          this.containers.mozStatus.className = 'moz-status ready';
        }
      }

      // 力量对比条
      if (this.containers.forceBalance) {
        var summary2 = this.skillSystem.getForcesSummary();
        if (summary2.enemies.length > 0) {
          var total = summary2.total.ally + summary2.total.enemy;
          var allyPct = total > 0 ? (summary2.total.ally / total) * 100 : 50;
          this.containers.forceBalance.style.display = 'flex';
          var allyBar = this.containers.forceBalance.querySelector('.force-ally');
          var enemyBar = this.containers.forceBalance.querySelector('.force-enemy');
          if (allyBar) allyBar.style.width = allyPct + '%';
          if (enemyBar) enemyBar.style.width = (100 - allyPct) + '%';
        } else {
          this.containers.forceBalance.style.display = 'none';
        }
      }

      this._syncAllCotaSeatMarks();
    }

    /**
     * 更新所有技能按钮的可用状态（通用）
     */
    updateButtons() {
      if (!this.skillSystem) return;
      var ss = this.skillSystem.getState();
      var ctx = this._gameCtx;
      var isBettingPhase = ['preflop', 'flop', 'turn', 'river'].indexOf(ctx.phase) >= 0;
      var isPlayerTurn = isBettingPhase && ctx.isPlayerTurn;
      var mana = this.skillSystem.getMana(this.humanPlayerId);
      var canUse = isPlayerTurn && !ss.backlash.active;
      var isRiver = ctx.phase === 'river';

      // 检查是否已有同 effect 的 force pending（玩家方）
      var queuedEffects = {};
      var _hpid = this.humanPlayerId;
      var liveSkillMap = Object.create(null);
      (ss.skills || []).forEach(function(skillState) {
        if (skillState && skillState.uniqueId) liveSkillMap[String(skillState.uniqueId)] = skillState;
      });
      ss.pendingForces.forEach(function (f) {
        if (f.ownerId === _hpid) queuedEffects[f.type] = true;
      });

      for (var entry of this._buttons) {
        var btnInfo = entry[1];
        var btn = btnInfo.element;
        var skill = btnInfo.skill;
        var liveSkill = liveSkillMap[String(skill.uniqueId)] || skill;
        var behavior = btnInfo.behavior;
        if (!btn) continue;

        var cost = liveSkill.manaCost || 0;
        var disabled = true;

        // 整局使用次数限制
        var noUsesLeft = liveSkill.usesPerGame > 0 && liveSkill.gameUsesRemaining <= 0;
        var streetUseCapped = liveSkill.usesPerStreet > 0 && liveSkill.streetUses >= liveSkill.usesPerStreet;

        switch (behavior) {
          case BEHAVIOR.PASSIVE:
            disabled = true;
            btn.classList.add('skill-passive');
            btn.classList.remove('skill-active');
            break;
          case BEHAVIOR.FORCE:
            // 力量型：river 无意义，同 effect 不能重复激活，需要 mana
            disabled = !canUse || mana.current < cost || liveSkill.currentCooldown > 0 || noUsesLeft || streetUseCapped;
            if (isRiver) disabled = true;
            if (queuedEffects[liveSkill.effect]) disabled = true;
            btn.classList.toggle('skill-active', !!queuedEffects[liveSkill.effect]);
            // 整局已用完：特殊样式
            btn.classList.toggle('skill-exhausted', noUsesLeft || streetUseCapped);
            break;
          case BEHAVIOR.CURSE:
            // 诅咒/冻结型：需要选目标，river 无意义（不影响选牌），需要 mana
            disabled = !canUse || mana.current < cost || liveSkill.currentCooldown > 0 || noUsesLeft || streetUseCapped;
            if (isRiver && liveSkill.effect !== 'skill_seal') disabled = true; // 冻结令在 river 仍可用
            if (queuedEffects['curse'] && liveSkill.effect === 'curse') disabled = true;
            btn.classList.toggle('skill-active', !!queuedEffects[liveSkill.effect]);
            btn.classList.toggle('skill-exhausted', noUsesLeft || streetUseCapped);
            break;
          case BEHAVIOR.LOCK:
            // VV 估价眼：独立的锁定型技能，不再走旧 Psyche 守护壳子
            disabled = !canUse || mana.current < cost || liveSkill.currentCooldown > 0 || noUsesLeft || streetUseCapped;
            btn.classList.remove('skill-active');
            btn.classList.toggle('skill-exhausted', noUsesLeft || streetUseCapped);
            break;
          case BEHAVIOR.PSYCHE:
            // Psyche 双重效果: river 无意义(反制部分影响发牌)，同 effect 不能重复
            disabled = !canUse || mana.current < cost || liveSkill.currentCooldown > 0 || streetUseCapped;
            if (isRiver) disabled = true;
            if (queuedEffects[liveSkill.effect]) disabled = true;
            btn.classList.toggle('skill-active', !!queuedEffects[liveSkill.effect]);
            break;
          case BEHAVIOR.TOGGLE:
            // Toggle 型（绝缘）：无 mana 消耗，在下注阶段可随时切换
            disabled = !isBettingPhase;
            btn.classList.toggle('skill-active', !!skill.active);
            btn.classList.toggle('toggle-on', !!skill.active);
            break;
        }

        // 封印状态视觉提示
        var isSealed = liveSkill._sealed > 0;
        btn.classList.toggle('skill-sealed', isSealed);
        if (isSealed) {
          disabled = true;
          // 在 cost badge 显示封印剩余回合
          var costBadge = btn.querySelector('.cost-badge');
          if (costBadge && !liveSkill.showAsPassiveCard) costBadge.textContent = '🔒' + liveSkill._sealed;
        } else {
          var costBadge2 = btn.querySelector('.cost-badge');
          if (costBadge2 && !liveSkill.showAsPassiveCard && costBadge2.textContent.indexOf('🔒') === 0) {
            costBadge2.textContent = (liveSkill.manaCost || 0) + ' MP';
          }
        }

        if (disabled && behavior !== BEHAVIOR.TOGGLE) {
          btn.classList.remove('skill-active');
        }
        btn.disabled = disabled;
      }
    }

    // ========== 动态函数层：通用技能激活 ==========

    /**
     * 通用技能激活入口
     * @param {string} behavior — BEHAVIOR 常量
     * @param {object} skill — 技能对象
     */
    _activateSkill(behavior, skill) {
      if (!this.skillSystem) return;

      switch (behavior) {
        case BEHAVIOR.FORCE:
          this._activateForce(skill);
          break;
        case BEHAVIOR.CURSE:
          this._activateCurse(skill);
          break;
        case BEHAVIOR.LOCK:
          this._activateLock(skill);
          break;
        case BEHAVIOR.PSYCHE:
          this._activatePsyche(skill);
          break;
        case BEHAVIOR.MENTAL:
          this._activateMental(skill);
          break;
        case BEHAVIOR.TOGGLE:
          this._activateToggle(skill);
          break;
      }

      this.updateDisplay();
      this.updateButtons();
    }

    /**
     * Toggle 型技能切换（绝缘）
     * 零 Mana 消耗，手动切换开/关
     */
    _activateToggle(skill) {
      var result = this.skillSystem.activatePlayerSkill(skill.uniqueId);
      if (!result.success) {
        if (this.onMessage) this.onMessage('无法切换');
        return;
      }

      var name = SKILL_NAMES[skill.skillKey] || skill.skillKey;
      var state = skill.active ? '开启' : '关闭';
      if (this.onMessage) this.onMessage('[' + name + '] ' + state);
      if (this.onLog) this.onLog('SKILL_TOGGLE', {
        skill: name, skillKey: skill.skillKey, active: skill.active
      });
    }

    /**
     * 力量型技能激活（fortune, curse, reversal, purge_all）
     * 统一走 skillSystem.activatePlayerSkill()
     */
    _activateForce(skill) {
      if (skill && skill.skillKey === 'bubble_liquidation') {
        this._showVvLiquidationPanel(skill);
        return;
      }
      if (skill && skill.skillKey === 'rule_rewrite') {
        this._showRuleRewritePanel(skill);
        return;
      }
      if (skill && skill.skillKey === 'blind_box') {
        this._showBlindBoxPanel(skill);
        return;
      }
      if (skill && skill.skillKey === 'deal_card') {
        this._showCotaDealCardPanel(skill);
        return;
      }
      if (skill && skill.skillKey === 'gather_or_spread') {
        this._showCotaArrangePanel(skill);
        return;
      }
      var result = this.skillSystem.activatePlayerSkill(skill.uniqueId, { gameContext: this._gameCtx });
      if (!result.success) {
        var reasons = {
          SKILL_NOT_FOUND: '技能不存在',
          NOT_ACTIVE_TYPE: '被动技能无法手动激活',
          BACKLASH_ACTIVE: '魔运反噬中',
          ON_COOLDOWN: '冷却中 (' + (result.cooldown || 0) + '轮)',
          INSUFFICIENT_MANA: '魔运不足 (需要 ' + (result.cost || 0) + ')',
          PENDING_IMPLEMENTATION: '技能模块接入中',
          NO_USES_REMAINING: '本局已使用完毕',
          STREET_USE_LIMIT: '本街已使用',
          NO_BENEDICTION_TARGET: '需要指定一个非自身目标',
          NO_RULING_TARGET: '需要指定一个有效的改判目标',
          NO_VV_TARGET: '需要指定一个有效的建仓/清算目标',
          NO_VV_POSITION: '该目标没有可清算的当前投资轮',
          INVALID_VV_TIER: '需要选择 1 / 2 / 3 档建仓',
          INVALID_VV_DIRECTION: '需要选择看涨或看跌方向',
          NO_DEBT_TARGET: '目标没有债蚀',
          NO_WILD_CARD: '没有可用鬼牌',
          NO_REWRITE_TARGET: '需要指定诅咒目标',
          INVALID_BLIND_BOX_TARGETS: '盲盒派对需要两个有效目标',
          INSUFFICIENT_WILD_CARD: '鬼牌不足',
          NO_COTA_EMPTY_SLOT: '没有空槽位',
          INVALID_COTA_CARD_TYPE: '需要选择要发入的牌',
          INVALID_COTA_MODE: '需要选择收牌或铺牌',
          INVALID_COTA_CARD_FAMILY: '需要选择要整理的牌类',
          MATCH_SCOPED_USED: '本局已发动过'
        };
        if (this.onMessage) this.onMessage(reasons[result.reason] || '技能不可用');
        return;
      }

      var name = SKILL_NAMES[skill.skillKey] || skill.skillKey;
      var caster = skill.casterName || '';
      var casterPrefix = caster ? caster + ': ' : '';
      var msg = '发动';
      if (skill.effect === 'benediction' || skill.effect === 'absolution') {
        msg = '发动';
      } else if (skill.effect === 'debt_call') {
        msg = '催收';
      } else if (skill.effect === 'house_edge') {
        msg = '挂账';
      }
      if (this.onMessage) this.onMessage('[' + casterPrefix + name + '] ' + msg);
      if (this.onLog) this.onLog('SKILL_USE', {
        skill: name,
        skillKey: skill.skillKey,
        caster: caster,
        tier: skill.tier,
        manaRemaining: this.skillSystem.getMana(this.humanPlayerId).current
      });
    }

    /**
     * 诅咒/冻结型技能激活 — 需要选择目标
     * curse, skill_seal, cooler 都走这个通道
     * 点击技能 → 高亮对手座位 → 点击座位选目标 → 激活技能(带 targetId)
     */
    _activateCurse(skill) {
      var self = this;

      // 再次点击取消瞄准
      if (self._curseHandlers) {
        self._curseCleanup();
        if (self.onMessage) self.onMessage('已取消');
        return;
      }

      var ctx = this._gameCtx;
      var targets = (ctx.players || []).filter(function (p) {
        if (!p) return false;
        if (skill && skill.effect === 'reclassification') {
          if (p.isActive !== false && !p.folded) return true;
          return hasKakoJudgeablePendingForce(self.skillSystem, p.id);
        }
        if (p.isActive === false || p.folded) return false;
        return p.type === 'ai';
      });
      if (targets.length === 0) {
        if (this.onMessage) {
          if (skill && skill.effect === 'benediction') this.onMessage('没有可祝福的目标');
          else if (skill && skill.effect === 'reclassification') this.onMessage('没有可改判的目标');
          else this.onMessage('没有可诅咒的对手');
        }
        return;
      }

      // 只有1个对手时直接激活，不需要选择
      if (targets.length === 1) {
        self._doCurseActivate(skill, targets[0]);
        return;
      }

      self._curseCleanup();

      var name = SKILL_NAMES[skill.skillKey] || skill.skillKey;
      if (this.onMessage) {
        this.onMessage(skill && skill.effect === 'reclassification'
          ? '[' + name + '] 选择改判对象（可选自己）'
          : '[' + name + '] 选择目标');
      }

      self._curseHandlers = [];
      for (var t = 0; t < targets.length; t++) {
        (function (target) {
          var seatEl = document.getElementById('seat-' + target.id);
          if (!seatEl) return;

          seatEl.classList.add('peek-targetable');

          var handler = function () {
            self._curseCleanup();
            self._doCurseActivate(skill, target);
          };
          seatEl.addEventListener('click', handler);
          self._curseHandlers.push({ el: seatEl, handler: handler });
        })(targets[t]);
      }

      self._curseEscHandler = function (e) {
        if (e.key === 'Escape') {
          self._curseCleanup();
          if (self.onMessage) self.onMessage('已取消');
        }
      };
      document.addEventListener('keydown', self._curseEscHandler);
    }

    /**
     * 诅咒技能实际激活（选目标后调用）
     */
    _doCurseActivate(skill, target) {
      var result = this.skillSystem.activatePlayerSkill(skill.uniqueId, {
        targetId: target.id,
        gameContext: this._gameCtx
      });
      if (!result.success) {
        this._showSkillError(result);
        return;
      }

      var name = SKILL_NAMES[skill.skillKey] || skill.skillKey;
      var caster = skill.casterName || '';
      var casterPrefix = caster ? caster + ': ' : '';
      if (this.onMessage) this.onMessage('[' + casterPrefix + name + '] → ' + target.name);
      if (this.onLog) this.onLog('SKILL_USE', {
        skill: name,
        skillKey: skill.skillKey,
        caster: caster,
        tier: skill.tier,
        target: target.name,
        targetId: target.id,
        manaRemaining: this.skillSystem.getMana(this.humanPlayerId).current
      });

      this.updateDisplay();
      this.updateButtons();
    }

    /**
     * VV 估价眼：选择 1 名目标并立即展示观察面板。
     */
    _activateLock(skill) {
      var self = this;

      if (self._lockHandlers) {
        self._lockCleanup();
        if (self.onMessage) self.onMessage('已取消');
        return;
      }

      var ctx = this._gameCtx;
      var targets = (ctx.players || []).filter(function (p) {
        return p.type === 'ai' && p.isActive !== false && !p.folded && p.cards && p.cards.length >= 2;
      });
      if (targets.length === 0) {
        if (this.onMessage) this.onMessage('没有可锁定的目标');
        return;
      }

      if (targets.length === 1) {
        self._doLockActivate(skill, targets[0]);
        return;
      }

      self._lockCleanup();
      var name = SKILL_NAMES[skill.skillKey] || skill.skillKey;
      if (this.onMessage) this.onMessage('[' + name + '] 选择建仓目标');

      self._lockHandlers = [];
      for (var t = 0; t < targets.length; t++) {
        (function (target) {
          var seatEl = document.getElementById('seat-' + target.id);
          if (!seatEl) return;

          seatEl.classList.add('peek-targetable');
          var handler = function () {
            self._lockCleanup();
            self._doLockActivate(skill, target);
          };
          seatEl.addEventListener('click', handler);
          self._lockHandlers.push({ el: seatEl, handler: handler });
        })(targets[t]);
      }

      self._lockEscHandler = function (e) {
        if (e.key === 'Escape') {
          self._lockCleanup();
          if (self.onMessage) self.onMessage('已取消');
        }
      };
      document.addEventListener('keydown', self._lockEscHandler);
    }

    _doLockActivate(skill, target) {
      this._showVvClairvoyancePanel(skill, target);
    }

    _lockCleanup() {
      if (this._lockHandlers) {
        for (var i = 0; i < this._lockHandlers.length; i++) {
          var h = this._lockHandlers[i];
          h.el.classList.remove('peek-targetable');
          h.el.removeEventListener('click', h.handler);
        }
        this._lockHandlers = null;
      }
      if (this._lockEscHandler) {
        document.removeEventListener('keydown', this._lockEscHandler);
        this._lockEscHandler = null;
      }
    }

    _curseCleanup() {
      if (this._curseHandlers) {
        for (var i = 0; i < this._curseHandlers.length; i++) {
          var h = this._curseHandlers[i];
          h.el.classList.remove('peek-targetable');
          h.el.removeEventListener('click', h.handler);
        }
        this._curseHandlers = null;
      }
      if (this._curseEscHandler) {
        document.removeEventListener('keydown', this._curseEscHandler);
        this._curseEscHandler = null;
      }
    }

    /**
     * 心理战技能激活
     */
    _activateMental(skill) {
      var self = this;
      var effect = skill.effect;

      // center_self 定神：直接激活，不需要选目标
      if (effect === 'psych_recover') {
        var result = this.skillSystem.activatePlayerSkill(skill.uniqueId);
        if (!result.success) { this._showSkillError(result); return; }
        var name = SKILL_NAMES[skill.skillKey] || skill.skillKey;
        if (this.onMessage) this.onMessage('[' + name + '] 定力恢复');
        return;
      }

      // 压场/挑衅/试探：需要选择敌方目标
      if (self._mentalHandlers) {
        self._mentalCleanup();
        if (self.onMessage) self.onMessage('已取消');
        return;
      }

      var ctx = this._gameCtx;
      var targets = (ctx.players || []).filter(function (p) {
        return p.type === 'ai' && p.isActive !== false && !p.folded;
      });
      if (targets.length === 0) {
        if (this.onMessage) this.onMessage('没有可选目标');
        return;
      }

      if (targets.length === 1) {
        self._doMentalActivate(skill, targets[0]);
        return;
      }

      self._mentalCleanup();
      var name = SKILL_NAMES[skill.skillKey] || skill.skillKey;
      if (this.onMessage) this.onMessage('[' + name + '] 选择目标');

      self._mentalHandlers = [];
      for (var t = 0; t < targets.length; t++) {
        (function (target) {
          var seatEl = document.getElementById('seat-' + target.id);
          if (!seatEl) return;
          seatEl.classList.add('peek-targetable');
          var handler = function () {
            self._mentalCleanup();
            self._doMentalActivate(skill, target);
          };
          seatEl.addEventListener('click', handler);
          self._mentalHandlers.push({ el: seatEl, handler: handler });
        })(targets[t]);
      }

      self._mentalEscHandler = function (e) {
        if (e.key === 'Escape') {
          self._mentalCleanup();
          if (self.onMessage) self.onMessage('已取消');
        }
      };
      document.addEventListener('keydown', self._mentalEscHandler);
    }

    _doMentalActivate(skill, target) {
      var result = this.skillSystem.activatePlayerSkill(skill.uniqueId, { targetId: target.id });
      if (!result.success) { this._showSkillError(result); return; }
      var name = SKILL_NAMES[skill.skillKey] || skill.skillKey;
      if (this.onMessage) this.onMessage('[' + name + '] → ' + target.name);
    }

    _mentalCleanup() {
      if (this._mentalHandlers) {
        for (var i = 0; i < this._mentalHandlers.length; i++) {
          var h = this._mentalHandlers[i];
          h.el.classList.remove('peek-targetable');
          h.el.removeEventListener('click', h.handler);
        }
        this._mentalHandlers = null;
      }
      if (this._mentalEscHandler) {
        document.removeEventListener('keydown', this._mentalEscHandler);
        this._mentalEscHandler = null;
      }
    }

    /**
     * Psyche 双重效果技能激活
     * 每个 Psyche 技能都有: 信息效果(必定触发) + 反制效果(注入 pendingForces 供 MoZ 处理)
     *
     * T3 Clarity 澄澈: 信息=胜率显示, 反制=消除敌方 T3/T2 Curse
     * T2 Refraction 折射: 信息=透视手牌(需选目标), 反制=消除+50%转化
     * T1 Axiom 真理: 信息=胜率+透视(继承), 反制=湮灭所有Curse+100%转化
     */
    _activatePsyche(skill) {
      var self = this;

      // 再次点击取消瞄准
      if (self._protectHandlers) {
        self._protectCleanup();
        if (self.onMessage) self.onMessage('已取消');
        return;
      }

      // 所有 Psyche 技能先选保护目标（自己 + 所有未弃牌玩家）
      var ctx = this._gameCtx;
      var allPlayers = (ctx.players || []).filter(function (p) {
        return p.isActive !== false && !p.folded;
      });
      if (allPlayers.length === 0) {
        if (this.onMessage) this.onMessage('没有可保护的目标');
        return;
      }

      // 只有自己一人时直接保护自己
      if (allPlayers.length === 1) {
        self._doPsycheActivate(skill, allPlayers[0]);
        return;
      }

      self._protectCleanup();

      var name = SKILL_NAMES[skill.skillKey] || skill.skillKey;
      if (this.onMessage) this.onMessage('[' + name + '] 选择守护目标');

      self._protectHandlers = [];
      for (var t = 0; t < allPlayers.length; t++) {
        (function (target) {
          var seatEl = document.getElementById('seat-' + target.id);
          if (!seatEl) return;

          seatEl.classList.add('peek-targetable');

          var handler = function () {
            self._protectCleanup();
            self._doPsycheActivate(skill, target);
          };
          seatEl.addEventListener('click', handler);
          self._protectHandlers.push({ el: seatEl, handler: handler });
        })(allPlayers[t]);
      }

      self._protectEscHandler = function (e) {
        if (e.key === 'Escape') {
          self._protectCleanup();
          if (self.onMessage) self.onMessage('已取消');
        }
      };
      document.addEventListener('keydown', self._protectEscHandler);
    }

    /**
     * 保护目标选定后执行 Psyche 技能
     */
    _doPsycheActivate(skill, protectTarget) {
      var self = this;
      var effect = skill.effect;
      var protectId = protectTarget.id;
      var protectName = protectTarget.name || ('ID:' + protectId);

      if (effect === 'clarity') {
        var result = this.skillSystem.activatePlayerSkill(skill.uniqueId, { protectId: protectId });
        if (!result.success) { this._showSkillError(result); return; }
        this._showWinRate(skill);
        var sn = SKILL_NAMES[skill.skillKey] || skill.skillKey;
        if (this.onMessage) this.onMessage('[' + sn + '] 守护 ' + protectName);
      } else if (effect === 'heart_read') {
        var result2 = this.skillSystem.activatePlayerSkill(skill.uniqueId, { protectId: protectId });
        if (!result2.success) { this._showSkillError(result2); return; }
        this._showHeartRead();
        if (this.onMessage) this.onMessage('[命感] 看穿 ' + protectName);
      } else {
        // T2 折射 / T1 真理: 需要选透视目标 + 保护目标已选定
        this._activatePsychePeek(skill, protectId);
      }
    }

    /**
     * 清理保护目标选择 UI
     */
    _protectCleanup() {
      if (this._protectHandlers) {
        for (var i = 0; i < this._protectHandlers.length; i++) {
          var h = this._protectHandlers[i];
          h.el.classList.remove('peek-targetable');
          h.el.removeEventListener('click', h.handler);
        }
        this._protectHandlers = null;
      }
      if (this._protectEscHandler) {
        document.removeEventListener('keydown', this._protectEscHandler);
        this._protectEscHandler = null;
      }
    }

    /**
     * Psyche T2/T1 透视选目标流程
     * 选中目标后: 扣mana + 注入反制力 + 执行透视 + (T1额外显示胜率)
     */
    _activatePsychePeek(skill, protectId) {
      var self = this;

      // 再次点击取消瞄准
      if (self._peekHandlers) {
        self._peekCleanup();
        if (self.onMessage) self.onMessage('已取消');
        return;
      }

      var ctx = this._gameCtx;
      var targets = (ctx.players || []).filter(function (p) {
        return p.type === 'ai' && p.isActive !== false && !p.folded && p.cards && p.cards.length >= 2;
      });
      if (targets.length === 0) {
        if (this.onMessage) this.onMessage('没有可透视的对手');
        return;
      }

      var tier = skill.tier || 3;
      self._peekCleanup();

      var name = SKILL_NAMES[skill.skillKey] || skill.skillKey;
      if (this.onMessage) this.onMessage('[' + name + '] 选择透视目标');

      self._peekHandlers = [];
      for (var t = 0; t < targets.length; t++) {
        (function (target) {
          var seatEl = document.getElementById('seat-' + target.id);
          if (!seatEl) return;

          seatEl.classList.add('peek-targetable');

          var handler = function () {
            self._peekCleanup();
            // 通过 skillSystem 统一激活（扣 mana + 注入反制力到 pendingForces）
            // protectId 从保护目标选择步骤传入
            var opts = {};
            if (protectId != null) opts.protectId = protectId;
            var result = self.skillSystem.activatePlayerSkill(skill.uniqueId, opts);
            if (!result.success) {
              self._showSkillError(result);
              return;
            }
            // 信息效果: 执行透视
            self._executePeek(skill, target, tier);
            // T1 真理额外继承: 胜率显示
            if (skill.effect === 'reversal') {
              self._showWinRate(skill);
            }
            if (self.onMessage) self.onMessage('[' + name + '] 透视 ' + target.name);
          };
          seatEl.addEventListener('click', handler);
          self._peekHandlers.push({ el: seatEl, handler: handler });
        })(targets[t]);
      }

      self._peekEscHandler = function (e) {
        if (e.key === 'Escape') self._peekCleanup();
      };
      document.addEventListener('keydown', self._peekEscHandler);
    }

    /**
     * 显示技能激活失败原因
     */
    _showSkillError(result) {
      var reasons = {
        SKILL_NOT_FOUND: '技能不存在',
        NOT_ACTIVE_TYPE: '被动技能无法手动激活',
        BACKLASH_ACTIVE: '魔运反噬中',
        ON_COOLDOWN: '冷却中 (' + (result.cooldown || 0) + '轮)',
        INSUFFICIENT_MANA: '魔运不足 (需要 ' + (result.cost || 0) + ')',
        PENDING_IMPLEMENTATION: '技能模块接入中',
        STREET_USE_LIMIT: '本街已使用',
        NO_BENEDICTION_TARGET: '需要指定一个非自身目标',
        NO_RULING_TARGET: '需要指定一个有效的改判目标',
        NO_VV_TARGET: '需要指定一个有效的建仓/清算目标',
        NO_VV_POSITION: '该目标没有可清算的当前投资轮',
        INVALID_VV_TIER: '需要选择 1 / 2 / 3 档建仓',
        INVALID_VV_DIRECTION: '需要选择看涨或看跌方向',
        NO_DEBT_TARGET: '目标没有债蚀',
        NO_WILD_CARD: '没有可用鬼牌',
        NO_REWRITE_TARGET: '需要指定诅咒目标',
        INVALID_BLIND_BOX_TARGETS: '盲盒派对需要两个有效目标',
        INSUFFICIENT_WILD_CARD: '鬼牌不足',
        NO_COTA_EMPTY_SLOT: '没有空槽位',
        INVALID_COTA_CARD_TYPE: '需要选择要发入的牌',
        INVALID_COTA_MODE: '需要选择收牌或铺牌',
        INVALID_COTA_CARD_FAMILY: '需要选择要整理的牌类',
        MATCH_SCOPED_USED: '本局已发动过'
      };
      if (this.onMessage) this.onMessage(reasons[result.reason] || '技能不可用');
    }

    _getRuntimeLedger() {
      if (this.skillSystem && this.skillSystem.assetLedger) return this.skillSystem.assetLedger;
      var api = window.AceRuntimeAPI || null;
      return api && typeof api.getAssetLedger === 'function' ? api.getAssetLedger() : null;
    }

    _isCotaPlayer(player) {
      if (!player) return false;
      var raw = player.name || player.ownerName || '';
      var roleRuntime = window.RoleRuntime || null;
      if (roleRuntime && typeof roleRuntime.deriveRoleMeta === 'function') {
        return roleRuntime.deriveRoleMeta(raw).roleId === 'COTA';
      }
      return String(raw || '').toUpperCase().indexOf('COTA') === 0;
    }

    _normalizeCotaCardType(raw) {
      var key = String(raw || '').toLowerCase();
      if (key === 'good' || key === 'fortune' || key === 'good_card' || key === 'goodcard') return 'good';
      if (key === 'bad' || key === 'curse' || key === 'bad_card' || key === 'badcard') return 'bad';
      if (key === 'misc' || key === 'misc_card' || key === 'misccard' || key === 'mixed' || key === 'utility') return 'misc';
      return null;
    }

    _extractCotaCards(ownerId) {
      var ledger = this._getRuntimeLedger();
      if (!ledger || ownerId == null || typeof ledger.getAsset !== 'function') return [];
      var asset = ledger.getAsset(ownerId, 'cota_cards');
      if (!asset) return [];
      var list = null;
      if (Array.isArray(asset.cards)) list = asset.cards;
      else if (Array.isArray(asset.items)) list = asset.items;
      else if (Array.isArray(asset.list)) list = asset.list;
      else if (asset.payload && Array.isArray(asset.payload.cards)) list = asset.payload.cards;
      else if (Array.isArray(asset.value)) list = asset.value;
      if (!Array.isArray(list)) return [];
      return list.slice();
    }

    _getCotaRuntimeState(ownerId) {
      var ledger = this._getRuntimeLedger();
      var slotCount = 0;
      var faultState = false;
      var bustRate = 0;
      if (ledger && ownerId != null) {
        if (typeof ledger.getValue === 'function') {
          slotCount = Math.max(0, Number(ledger.getValue(ownerId, 'cota_slot_count') || 0));
          faultState = Number(ledger.getValue(ownerId, 'cota_fault_state') || 0) > 0;
          bustRate = Math.max(0, Number(ledger.getValue(ownerId, 'cota_bust_rate') || 0));
        }
      }
      var cards = this._extractCotaCards(ownerId);
      var counts = { good: 0, bad: 0, misc: 0 };
      var pointTotals = { good: 0, bad: 0, misc: 0 };
      var manaTotals = { good: 0, bad: 0, misc: 0 };
      for (var i = 0; i < cards.length; i++) {
        var card = cards[i] || {};
        var type = this._normalizeCotaCardType(card.cardType || card.type || card.kind);
        if (type && counts[type] != null) counts[type] += 1;
        if (type && pointTotals[type] != null) {
          pointTotals[type] += Math.max(0, Number(card.baseValue || 0));
          manaTotals[type] += Math.max(0, Number(card.settleManaCost || 0));
        }
      }
      var totalPointValue = pointTotals.good + pointTotals.bad + pointTotals.misc;
      var totalManaCost = manaTotals.good + manaTotals.bad + manaTotals.misc;
      return {
        slotCount: slotCount,
        cards: cards,
        totalCards: cards.length,
        emptySlots: Math.max(0, slotCount - cards.length),
        counts: counts,
        pointTotals: pointTotals,
        manaTotals: manaTotals,
        totalPointValue: totalPointValue,
        totalManaCost: totalManaCost,
        faultState: faultState,
        bustRate: bustRate
      };
    }

    _getCotaContractTemplatePreview(ownerId) {
      var traitSystem = this._traitSystem;
      if (!traitSystem || ownerId == null || typeof traitSystem.getTraits !== 'function' || typeof traitSystem.getTraitDef !== 'function') {
        return { gatherBaseBonus: 0, spreadBaseBonus: 0 };
      }
      var traits = traitSystem.getTraits(ownerId) || {};
      var traitKey = traits.vanguard;
      if (!traitKey) return { gatherBaseBonus: 0, spreadBaseBonus: 0 };
      var traitDef = traitSystem.getTraitDef(traitKey);
      var effect = traitDef && traitDef.effect;
      if (!effect || effect.type !== 'cota_contract_template') {
        return { gatherBaseBonus: 0, spreadBaseBonus: 0 };
      }
      return {
        gatherBaseBonus: Math.max(0, Number(effect.gatherBaseBonus || 0)),
        spreadBaseBonus: Math.max(0, Number(effect.spreadBaseBonus || 0))
      };
    }

    _syncCotaMark(ownerId, key, tone, count, title, detail) {
      if (!this.skillSystem || ownerId == null) return;
      if (count > 0) {
        this.skillSystem.setStatusMark(ownerId, key, {
          icon: COTA_ACE_ICON,
          iconMode: 'mask',
          tone: tone,
          count: count,
          title: title,
          detail: detail
        });
      } else {
        this.skillSystem.clearStatusMark(ownerId, key);
      }
    }

    _syncCotaFaultMark(ownerId, enabled, detail) {
      if (!this.skillSystem || ownerId == null) return;
      if (enabled) {
        this.skillSystem.setStatusMark(ownerId, 'cota_fault_state', {
          icon: COTA_HAZARD_ICON,
          iconMode: 'mask',
          tone: 'cota-fault',
          count: 0,
          title: '故障态',
          detail: detail
        });
      } else {
        this.skillSystem.clearStatusMark(ownerId, 'cota_fault_state');
      }
    }

    _syncAllCotaSeatMarks() {
      var players = this._gameCtx && Array.isArray(this._gameCtx.players) ? this._gameCtx.players : [];
      for (var i = 0; i < players.length; i++) {
        var player = players[i];
        if (!this._isCotaPlayer(player)) continue;
        var state = this._getCotaRuntimeState(player.id);
        var faultText = state.faultState ? '故障态' : '标准态';
        var bustPercent = Math.round(state.bustRate * 100);
        var sharedDetail = '槽位: ' + state.slotCount + '\n在场牌: ' + state.totalCards + '\n状态: ' + faultText + '\n爆牌率: ' + bustPercent + '%';
        this._syncCotaFaultMark(player.id, state.faultState, sharedDetail + '\n故障触发: 场上存在杂牌');
        this._syncCotaMark(player.id, 'cota_empty_slots', 'cota-empty', state.emptySlots, '空槽位', sharedDetail + '\n空槽位: ' + state.emptySlots);
        this._syncCotaMark(player.id, 'cota_good_cards', 'cota-good', state.counts.good, '吉牌', sharedDetail + '\n吉牌: ' + state.counts.good);
        this._syncCotaMark(player.id, 'cota_bad_cards', 'cota-bad', state.counts.bad, '厄牌', sharedDetail + '\n厄牌: ' + state.counts.bad);
        this._syncCotaMark(player.id, 'cota_misc_cards', 'cota-misc', state.counts.misc, '杂牌', sharedDetail + '\n杂牌: ' + state.counts.misc);
      }
    }

    _getTrixieWildCardValue() {
      var ledger = this._getRuntimeLedger();
      if (!ledger || this.humanPlayerId == null) return 0;
      return Math.max(0, Number(ledger.getValue(this.humanPlayerId, 'trixie_wild_card') || 0));
    }

    _getTrixieTargetPlayers(includeSelf) {
      var ctx = this._gameCtx || {};
      var players = Array.isArray(ctx.players) ? ctx.players.slice() : [];
      return players.filter(function(player) {
        if (!player || player.isActive === false || player.folded) return false;
        if (!includeSelf && player.type !== 'ai') return false;
        return true;
      });
    }

    _getTrixiePreviewPower(wildCard, mode, modifier, isGlobal) {
      var modeMult = mode === 'curse_target' ? 1.33 : 1;
      var modifierMult = modifier === 'delay' ? 0.9 : modifier === 'extend' ? 0.75 : 1;
      var rangeMult = isGlobal ? 0.5 : 1;
      return Math.max(0, Math.ceil(Math.max(0, Number(wildCard || 0)) * modeMult * modifierMult * rangeMult));
    }

    _closeTrixieOverlay(overlay) {
      if (!overlay) return;
      overlay.style.opacity = '0';
      overlay.style.transition = 'opacity 0.25s';
      setTimeout(function () {
        if (overlay.parentNode) overlay.remove();
      }, 250);
    }

    _closeKakoOverlay(overlay) {
      if (!overlay) return;
      overlay.style.opacity = '0';
      overlay.style.transition = 'opacity 0.22s';
      setTimeout(function () {
        if (overlay.parentNode) overlay.remove();
      }, 220);
    }

    _closeCotaOverlay(overlay) {
      if (!overlay) return;
      overlay.style.opacity = '0';
      overlay.style.transition = 'opacity 0.22s';
      setTimeout(function () {
        if (overlay.parentNode) overlay.remove();
      }, 220);
    }

    _closeVvOverlay(overlay) {
      if (!overlay) return;
      overlay.style.opacity = '0';
      overlay.style.transition = 'opacity 0.22s';
      setTimeout(function () {
        if (overlay.parentNode) overlay.remove();
      }, 220);
    }

    _getVvRuntimePositions() {
      var ledger = this._getRuntimeAssetLedger();
      var ctx = this._gameCtx || {};
      var players = Array.isArray(ctx.players) ? ctx.players : [];
      if (!ledger || typeof ledger.getAsset !== 'function') return [];

      return players.map(function(player) {
        if (!player) return null;
        var layerAsset = ledger.getAsset(player.id, 'vv_positions');
        var packs = layerAsset && Array.isArray(layerAsset.positions) ? layerAsset.positions.slice() : [];
        var bubbleFortune = Number(ledger.getValue(player.id, 'bubble_fortune') || 0);
        var bubbleChaos = Number(ledger.getValue(player.id, 'bubble_chaos') || 0);
        var bubbleMana = Number(ledger.getValue(player.id, 'bubble_mana') || 0);
        if (!packs.length && bubbleFortune <= 0 && bubbleChaos <= 0 && bubbleMana <= 0) return null;

        var bullishSize = 0;
        var bearishSize = 0;
        var hiddenSize = 0;
        var positionSize = 0;
        for (var i = 0; i < packs.length; i++) {
          var pack = packs[i] || {};
          var entrySize = Math.max(1, Number(pack.entrySize != null ? pack.entrySize : (pack.tier != null ? pack.tier : 1)) || 1);
          var direction = pack.direction === 'bearish' ? 'bearish'
            : pack.direction === 'bullish' ? 'bullish'
            : 'hidden';
          positionSize += entrySize;
          if (direction === 'bullish') bullishSize += entrySize;
          else if (direction === 'bearish') bearishSize += entrySize;
          else hiddenSize += entrySize;
        }

        return {
          player: player,
          packs: packs,
          bubbleFortune: bubbleFortune,
          bubbleChaos: bubbleChaos,
          bubbleMana: bubbleMana,
          positionSize: positionSize,
          bullishSize: bullishSize,
          bearishSize: bearishSize,
          hiddenSize: hiddenSize
        };
      }).filter(Boolean);
    }

    _getVvCurrentTableChipTotal() {
      var ctx = this._gameCtx || {};
      var players = Array.isArray(ctx.players) ? ctx.players : [];
      var total = 0;
      for (var i = 0; i < players.length; i++) {
        var player = players[i];
        if (!player || player.isActive === false) continue;
        total += Math.max(0, Number(player.chips || 0));
      }
      return Math.max(1, total);
    }

    _getVvDeviationState(pack, targetPlayer) {
      var baselineTarget = Math.max(0, Number(pack && pack.baselineTargetChips || 0));
      var baselineTable = Math.max(1, Number(pack && pack.baselineTableChips || 1));
      var currentTarget = Math.max(0, Number(targetPlayer && targetPlayer.chips || 0));
      var currentTable = this._getVvCurrentTableChipTotal();
      var baselineShare = baselineTarget > 0 ? (baselineTarget / baselineTable) : 0;
      var currentShare = currentTarget / currentTable;
      if (baselineShare <= 0) {
        return {
          direction: 'flat',
          level: 0,
          deltaRatio: 0,
          baselineShare: baselineShare,
          currentShare: currentShare
        };
      }
      var deltaRatio = (currentShare - baselineShare) / baselineShare;
      var absRatio = Math.abs(deltaRatio);
      var level = absRatio >= 0.6 ? 3 : absRatio >= 0.4 ? 2 : absRatio >= 0.2 ? 1 : 0;
      return {
        direction: deltaRatio > 0.0001 ? 'bullish' : deltaRatio < -0.0001 ? 'bearish' : 'flat',
        level: level,
        deltaRatio: deltaRatio,
        baselineShare: baselineShare,
        currentShare: currentShare
      };
    }

    _buildVvLiquidationPreview(entry) {
      var target = entry && entry.player ? entry.player : null;
      var packs = entry && Array.isArray(entry.packs) ? entry.packs : [];
      var preview = {
        dominantDirection: 'flat',
        dominantLevel: 0,
        dominantResolution: '0级偏离',
        baselineShare: 0,
        currentShare: 0,
        deltaRatio: 0,
        recoveredMana: 0,
        drainedTargetMana: 0,
        selfFortune: 0,
        targetFortuneBurst: 0,
        targetChaosBurst: 0,
        lines: []
      };
      if (!target || !packs.length) return preview;

      var resolutions = [];
      for (var i = 0; i < packs.length; i++) {
        var pack = packs[i] || {};
        var state = this._getVvDeviationState(pack, target);
        var shouldReplaceDominant = state.level > preview.dominantLevel;
        if (state.level > preview.dominantLevel) {
          preview.dominantLevel = state.level;
          preview.dominantDirection = state.direction;
          preview.baselineShare = state.baselineShare;
          preview.currentShare = state.currentShare;
          preview.deltaRatio = state.deltaRatio;
        }

        var bubbleFortune = Math.max(0, Number(pack.bubble_fortune || 0));
        var bubbleChaos = Math.max(0, Number(pack.bubble_chaos || 0));
        var bubbleMana = Math.max(0, Number(pack.bubble_mana || 0));
        var resolution = '';

        if (state.level <= 0 || state.direction === 'flat') {
          preview.recoveredMana += Math.ceil(bubbleMana * 0.85);
          preview.targetFortuneBurst += bubbleFortune;
          preview.targetChaosBurst += bubbleChaos;
          resolution = '0级偏离';
        } else if (state.direction === pack.direction) {
          if (state.direction === 'bullish') {
            preview.targetChaosBurst += bubbleChaos + Math.ceil(bubbleFortune * (state.level === 1 ? 1 : (state.level === 2 ? 1.33 : 1.66)));
            preview.recoveredMana += Math.ceil(bubbleMana * (state.level === 1 ? 1.25 : (state.level === 2 ? 1.5 : 1.75)));
            preview.drainedTargetMana += Math.ceil(bubbleMana * (state.level === 1 ? 0.25 : (state.level === 2 ? 0.5 : 0.75)));
            resolution = '看涨命中';
          } else {
            preview.selfFortune += Math.ceil(bubbleFortune * (state.level === 1 ? 1 : (state.level === 2 ? 1.25 : 1.5)));
            preview.targetChaosBurst += Math.ceil(bubbleChaos * (state.level === 1 ? 0.5 : (state.level === 2 ? 0.75 : 1)));
            preview.recoveredMana += Math.ceil(bubbleMana * (state.level === 1 ? 0.25 : (state.level === 2 ? 0.5 : 0.75)));
            resolution = '看跌命中';
          }
        } else {
          preview.recoveredMana += Math.ceil(bubbleMana * 0.6);
          preview.targetFortuneBurst += Math.ceil(bubbleFortune * 0.5);
          preview.targetChaosBurst += Math.ceil(bubbleChaos * 0.5);
          resolution = '错向清算';
        }

        resolutions.push('[' + (pack.direction === 'bullish' ? '看涨' : '看跌') + ' ' + (pack.tier || pack.entrySize || 1) + '档] ' + resolution);
        if (shouldReplaceDominant || (preview.dominantLevel <= 0 && preview.dominantResolution === '0级偏离')) {
          preview.dominantResolution = resolution;
          preview.baselineShare = state.baselineShare;
          preview.currentShare = state.currentShare;
          preview.deltaRatio = state.deltaRatio;
        }
      }

      preview.lines = resolutions;
      return preview;
    }

    _formatVvDeviationLabel(direction, level) {
      if (level <= 0 || direction === 'flat') return '0级偏离';
      return (direction === 'bullish' ? '增值' : '减值') + level + '级偏离';
    }

    _formatVvShareLabel(value) {
      return (Math.max(0, Number(value || 0)) * 100).toFixed(1) + '%';
    }

    _formatVvEffectSummary(preview) {
      if (!preview) return '暂无可结算效果';
      switch (preview.dominantResolution) {
        case '看涨命中':
          return '爆开目标 chaos，并回收较多魔运与部分目标魔运';
        case '看跌命中':
          return 'VV 获得额外 fortune，并回收魔运';
        case '错向清算':
          return '只能回收部分魔运，目标仅释放部分泡沫';
        default:
          return '偏离不足，只回收少量魔运并释放原始泡沫';
      }
    }

    _renderVvDirectionIcon(direction, count, publicOnly) {
      var safeDirection = direction === 'bearish' ? 'bearish'
        : direction === 'bullish' ? 'bullish'
        : 'public';
      var iconUrl = safeDirection === 'bullish' ? VV_BULLISH_ICON
        : safeDirection === 'bearish' ? VV_BEARISH_ICON
        : VV_MARK_ICON;
      var iconClass = publicOnly ? ' is-public' : '';
      var shouldShowCount = publicOnly ? count > 0 : true;
      var countHtml = shouldShowCount ? '<span class="vv-direction-count">' + Math.max(0, Number(count || 0)) + '</span>' : '';
      return '<span class="vv-direction-pill' + iconClass + '">' +
        '<img class="vv-direction-icon vv-direction-' + safeDirection + '" src="' + iconUrl + '" alt="">' +
        countHtml +
        '</span>';
    }

    _showVvPortfolioOverlay(focusTargetId) {
      var existing = document.querySelector('.vv-position-overlay');
      if (existing) existing.remove();

      var overlay = document.createElement('div');
      overlay.className = 'trixie-rewrite-overlay vv-position-overlay';
      var self = this;
      var positions = this._getVvRuntimePositions();

      function renderPositionCard(entry) {
        var player = entry.player;
        var isFocused = focusTargetId != null && focusTargetId === player.id;
        var preview = self._buildVvLiquidationPreview(entry);
        var html = '<div class="vv-position-card' + (isFocused ? ' is-focused' : '') + '">';
        html += '<div class="vv-position-card-head">';
        html += '<div class="vv-position-name">' + player.name + '</div>';
        html += '<div class="vv-position-public">' + self._renderVvDirectionIcon('public', entry.positionSize, true) + '</div>';
        html += '</div>';
        html += '<div class="vv-position-private-row">';
        html += '<div class="vv-position-private-cell">' + self._renderVvDirectionIcon('bullish', entry.bullishSize, false) + '<span class="vv-position-label">看涨</span></div>';
        html += '<div class="vv-position-private-cell">' + self._renderVvDirectionIcon('bearish', entry.bearishSize, false) + '<span class="vv-position-label">看跌</span></div>';
        html += '</div>';
        html += '<div class="vv-position-metrics">';
        html += '<span>fortune ' + (Math.round(entry.bubbleFortune * 10) / 10) + '</span>';
        html += '<span>chaos ' + (Math.round(entry.bubbleChaos * 10) / 10) + '</span>';
        html += '<span>mana ' + (Math.round(entry.bubbleMana * 10) / 10) + '</span>';
        html += '</div>';
        html += '<div class="vv-position-note">';
        html += '当前档位：' + self._formatVvDeviationLabel(preview.dominantDirection, preview.dominantLevel) + '<br>';
        html += '占额变化：' + self._formatVvShareLabel(preview.baselineShare) + ' → ' + self._formatVvShareLabel(preview.currentShare) + '<br>';
        html += '当前效果：' + self._formatVvEffectSummary(preview) + '<br>';
        html += '预计追回魔运：' + preview.recoveredMana + '（目标魔运 ' + preview.drainedTargetMana + ' / VV fortune ' + preview.selfFortune + '）<br>';
        html += '预计爆开：fortune ' + preview.targetFortuneBurst + ' / chaos ' + preview.targetChaosBurst;
        if (preview.lines.length) {
          html += '<br>' + preview.lines.join(' · ');
        }
        html += '</div>';
        html += '</div>';
        return html;
      }

      var html = '<div class="terminal-panel vv-position-panel">';
      html += '<div class="panel-header">';
      html += '<div class="vv-position-kicker"><img src="' + VV_MARK_ICON + '" alt=""> PRIVATE POSITION VIEW</div>';
      html += '<div class="panel-title">VV // 私有仓位面板</div>';
      html += '<div class="panel-sub">红色为看涨，绿色为看跌</div>';
      html += '</div>';
      html += '<div class="vv-position-body">';
      if (!positions.length) {
        html += '<div class="vv-position-empty">当前没有有效头寸。先使用【估价眼】建立建仓目标。</div>';
      } else {
        for (var i = 0; i < positions.length; i++) {
          html += renderPositionCard(positions[i]);
        }
      }
      html += '</div>';
      html += '<div class="vv-position-actions">';
      html += '<button class="action-btn small" type="button" data-action="close">关闭</button>';
      html += '</div>';
      html += '</div>';
      overlay.innerHTML = html;

      var closeBtn = overlay.querySelector('[data-action="close"]');
      if (closeBtn) closeBtn.addEventListener('click', function() { self._closeVvOverlay(overlay); });
      overlay.addEventListener('click', function(e) {
        if (e.target === overlay) self._closeVvOverlay(overlay);
      });
      document.body.appendChild(overlay);
    }

    _showVvClairvoyancePanel(skill, target) {
      var existing = document.querySelector('.vv-position-overlay');
      if (existing) existing.remove();

      var overlay = document.createElement('div');
      overlay.className = 'trixie-rewrite-overlay vv-position-overlay';
      var self = this;
      var state = {
        tier: 1,
        direction: 'bullish'
      };

      function render() {
        var peekResult = self._buildPeekData(skill, target, 2);
        var intelLines = self._buildVvTargetIntel(target);
        var html = '<div class="terminal-panel vv-position-panel">';
        html += '<div class="panel-header">';
        html += '<div class="vv-position-kicker"><img src="' + VV_MARK_ICON + '" alt=""> POSITION OPEN</div>';
        html += '<div class="panel-title">VV // 建立头寸</div>';
        html += '<div class="panel-sub">目标：' + target.name + '</div>';
        html += '</div>';
        html += '<div class="vv-position-body">';
        html += '<div class="intel-section">';
        html += '<div class="intel-section-title">PSYCHE.READ // OUTLINE</div>';
        html += self._renderPeekDataHtml(peekResult.cardData, 'intel');
        html += '</div>';
        html += '<div class="intel-section intel-section-terminal">';
        html += '<div class="intel-section-title">POSITION.SYS // TIER & DIRECTION</div>';
        html += '<div class="vv-tier-group">';
        html += '<button class="vv-tier-chip' + (state.tier === 1 ? ' is-selected' : '') + '" type="button" data-vv-tier="1">1档</button>';
        html += '<button class="vv-tier-chip' + (state.tier === 2 ? ' is-selected' : '') + '" type="button" data-vv-tier="2">2档</button>';
        html += '<button class="vv-tier-chip' + (state.tier === 3 ? ' is-selected' : '') + '" type="button" data-vv-tier="3">3档</button>';
        html += '</div>';
        html += '<div class="vv-direction-group">';
        html += '<button class="vv-direction-chip bullish' + (state.direction === 'bullish' ? ' is-selected' : '') + '" type="button" data-vv-direction="bullish">' + self._renderVvDirectionIcon('bullish', state.tier, false) + '<span>看涨</span></button>';
        html += '<button class="vv-direction-chip bearish' + (state.direction === 'bearish' ? ' is-selected' : '') + '" type="button" data-vv-direction="bearish">' + self._renderVvDirectionIcon('bearish', state.tier, false) + '<span>看跌</span></button>';
        html += '</div>';
        html += '</div>';
        if (intelLines && intelLines.length > 0) {
          html += '<div class="intel-section intel-section-terminal">';
          html += '<div class="intel-section-title">MARKET.SIGNAL // CURRENT</div>';
          html += '<div class="cli-list">';
          for (var i = 0; i < intelLines.length; i++) {
            html += '<div class="cli-row"><div class="cli-value">' + intelLines[i] + '</div><div class="cli-status">READY</div></div>';
          }
          html += '</div>';
          html += '</div>';
        }
        html += '</div>';
        html += '<div class="vv-position-actions">';
        html += '<button class="action-btn small" type="button" data-action="close">取消</button>';
        html += '<button class="action-btn primary small" type="button" data-action="confirm">建仓</button>';
        html += '</div>';
        html += '</div>';
        overlay.innerHTML = html;

        Array.prototype.forEach.call(overlay.querySelectorAll('[data-vv-tier]'), function(btn) {
          btn.addEventListener('click', function() {
            state.tier = Math.max(1, Math.min(3, Number(btn.getAttribute('data-vv-tier') || 1)));
            render();
          });
        });
        Array.prototype.forEach.call(overlay.querySelectorAll('[data-vv-direction]'), function(btn) {
          btn.addEventListener('click', function() {
            state.direction = btn.getAttribute('data-vv-direction') === 'bearish' ? 'bearish' : 'bullish';
            render();
          });
        });

        var closeBtn = overlay.querySelector('[data-action="close"]');
        if (closeBtn) closeBtn.addEventListener('click', function() { self._closeVvOverlay(overlay); });

        var confirmBtn = overlay.querySelector('[data-action="confirm"]');
        if (confirmBtn) {
          confirmBtn.addEventListener('click', function() {
            var result = self.skillSystem.activatePlayerSkill(skill.uniqueId, {
              targetId: target.id,
              tier: state.tier,
              direction: state.direction,
              gameContext: self._gameCtx
            });
            if (!result.success) {
              self._showSkillError(result);
              return;
            }
            self._closeVvOverlay(overlay);
            var name = SKILL_NAMES[skill.skillKey] || skill.skillKey;
            if (self.onMessage) self.onMessage('[' + name + '] 对 ' + target.name + ' 建立' + state.tier + '档' + (state.direction === 'bullish' ? '看涨' : '看跌') + '头寸');
            if (self.onLog) self.onLog('SKILL_USE', {
              skill: name,
              skillKey: skill.skillKey,
              target: target.name,
              targetId: target.id,
              tier: state.tier,
              direction: state.direction,
              manaRemaining: self.skillSystem.getMana(self.humanPlayerId).current
            });
            self.updateDisplay();
            self.updateButtons();
            self._showVvPortfolioOverlay(target.id);
          });
        }
      }

      overlay.addEventListener('click', function(e) {
        if (e.target === overlay) self._closeVvOverlay(overlay);
      });
      document.body.appendChild(overlay);
      render();
    }

    _showVvLiquidationPanel(skill) {
      var positions = this._getVvRuntimePositions();
      if (!positions.length) {
        if (this.onMessage) this.onMessage('[泡沫清算] 当前没有可清算头寸');
        return;
      }

      var existing = document.querySelector('.vv-position-overlay');
      if (existing) existing.remove();

      var overlay = document.createElement('div');
      overlay.className = 'trixie-rewrite-overlay vv-position-overlay';
      var self = this;
      var state = {
        targetId: positions[0].player.id
      };

      function renderTargetTabs(selectedId) {
        var html = '<div class="vv-target-grid">';
        for (var i = 0; i < positions.length; i++) {
          var entry = positions[i];
          html += '<button class="vv-target-chip' + (selectedId === entry.player.id ? ' is-selected' : '') + '" type="button" data-vv-target="' + entry.player.id + '">' +
            '<span>' + entry.player.name + '</span>' + self._renderVvDirectionIcon('public', entry.positionSize, true) + '</button>';
        }
        html += '</div>';
        return html;
      }

      function render() {
        var current = positions.find(function(entry) { return entry.player.id === state.targetId; }) || positions[0];
        var preview = self._buildVvLiquidationPreview(current);
        var html = '<div class="terminal-panel vv-position-panel">';
        html += '<div class="panel-header">';
        html += '<div class="vv-position-kicker"><img src="' + VV_LIQUIDATION_ICON + '" alt=""> LIQUIDATION WINDOW</div>';
        html += '<div class="panel-title">VV // 泡沫清算</div>';
        html += '<div class="panel-sub">选择 1 名目标清算当前投资轮</div>';
        html += '</div>';
        html += '<div class="vv-position-body">';
        html += renderTargetTabs(current.player.id);
        html += '<div class="vv-position-card is-focused">';
        html += '<div class="vv-position-card-head"><div class="vv-position-name">' + current.player.name + '</div><div class="vv-position-public">' + self._renderVvDirectionIcon('public', current.positionSize, true) + '</div></div>';
        html += '<div class="vv-position-private-row">';
        html += '<div class="vv-position-private-cell">' + self._renderVvDirectionIcon('bullish', current.bullishSize, false) + '<span class="vv-position-label">看涨</span></div>';
        html += '<div class="vv-position-private-cell">' + self._renderVvDirectionIcon('bearish', current.bearishSize, false) + '<span class="vv-position-label">看跌</span></div>';
        html += '</div>';
        html += '<div class="vv-position-metrics">';
        html += '<span>fortune ' + (Math.round(current.bubbleFortune * 10) / 10) + '</span>';
        html += '<span>chaos ' + (Math.round(current.bubbleChaos * 10) / 10) + '</span>';
        html += '<span>mana ' + (Math.round(current.bubbleMana * 10) / 10) + '</span>';
        html += '</div>';
        html += '<div class="vv-position-note">';
        html += '当前档位：' + self._formatVvDeviationLabel(preview.dominantDirection, preview.dominantLevel) + '<br>';
        html += '占额变化：' + self._formatVvShareLabel(preview.baselineShare) + ' → ' + self._formatVvShareLabel(preview.currentShare) + '<br>';
        html += '当前效果：' + self._formatVvEffectSummary(preview) + '<br>';
        html += '预计追回魔运：' + preview.recoveredMana + '<br>';
        html += '预计抽取目标魔运：' + preview.drainedTargetMana + '<br>';
        html += '预计 VV 获得 fortune：' + preview.selfFortune + '<br>';
        html += '预计目标爆开 fortune / chaos：' + preview.targetFortuneBurst + ' / ' + preview.targetChaosBurst;
        if (preview.lines.length) {
          html += '<br>' + preview.lines.join('<br>');
        }
        html += '<br>' + self._buildVvTargetIntel(current.player).join('<br>');
        html += '</div>';
        html += '</div>';
        html += '</div>';
        html += '<div class="vv-position-actions">';
        html += '<button class="action-btn small" type="button" data-action="close">取消</button>';
        html += '<button class="action-btn primary small" type="button" data-action="confirm">清算</button>';
        html += '</div>';
        html += '</div>';
        overlay.innerHTML = html;

        Array.prototype.forEach.call(overlay.querySelectorAll('[data-vv-target]'), function(btn) {
          btn.addEventListener('click', function() {
            state.targetId = Number(btn.getAttribute('data-vv-target'));
            render();
          });
        });

        var closeBtn = overlay.querySelector('[data-action="close"]');
        if (closeBtn) closeBtn.addEventListener('click', function() { self._closeVvOverlay(overlay); });

        var confirmBtn = overlay.querySelector('[data-action="confirm"]');
        if (confirmBtn) {
          confirmBtn.addEventListener('click', function() {
            var result = self.skillSystem.activatePlayerSkill(skill.uniqueId, {
              targetId: state.targetId,
              gameContext: self._gameCtx
            });
            if (!result.success) {
              self._showSkillError(result);
              return;
            }
            var currentEntry = positions.find(function(entry) { return entry.player.id === state.targetId; }) || positions[0];
            self._closeVvOverlay(overlay);
            if (self.onMessage) self.onMessage('[泡沫清算] 选择 ' + currentEntry.player.name + ' 进行清算');
            self.updateDisplay();
            self.updateButtons();
          });
        }
      }

      overlay.addEventListener('click', function(e) {
        if (e.target === overlay) self._closeVvOverlay(overlay);
      });
      document.body.appendChild(overlay);
      render();
    }

    _showCotaDealCardPanel(skill) {
      var existing = document.querySelector('.cota-overlay');
      if (existing) existing.remove();

      var overlay = document.createElement('div');
      overlay.className = 'trixie-rewrite-overlay cota-overlay';
      var self = this;
      var state = {
        cardType: 'good'
      };

      function render() {
        var cotaState = self._getCotaRuntimeState(skill.ownerId);
        var canConfirm = cotaState.emptySlots > 0;
        var typeLabel = state.cardType === 'good' ? '吉牌'
          : state.cardType === 'bad' ? '厄牌'
          : '杂牌';
        var html = '<div class="terminal-panel cota-panel">';
        html += '<div class="panel-header">';
        html += '<div class="panel-title">COTA // 发牌列</div>';
        html += '<div class="panel-sub">选择要发入的牌，并消耗 1 个空槽位</div>';
        html += '</div>';
        html += '<div class="cota-panel-body">';
        html += '<div class="cota-summary-grid">';
        html += '<div class="cota-summary-card"><span class="cota-summary-label">空槽位</span><span class="cota-summary-value">' + cotaState.emptySlots + '</span></div>';
        html += '<div class="cota-summary-card"><span class="cota-summary-label">总槽位</span><span class="cota-summary-value">' + cotaState.slotCount + '</span></div>';
        html += '<div class="cota-summary-card"><span class="cota-summary-label">在场牌</span><span class="cota-summary-value">' + cotaState.totalCards + '</span></div>';
        html += '</div>';
        html += '<div class="cota-chip-group">';
        html += '<button class="cota-choice-chip cota-good' + (state.cardType === 'good' ? ' is-selected' : '') + '" type="button" data-card-type="good">吉牌</button>';
        html += '<button class="cota-choice-chip cota-bad' + (state.cardType === 'bad' ? ' is-selected' : '') + '" type="button" data-card-type="bad">厄牌</button>';
        html += '<button class="cota-choice-chip cota-misc' + (state.cardType === 'misc' ? ' is-selected' : '') + '" type="button" data-card-type="misc">杂牌</button>';
        html += '</div>';
        html += '<div class="cota-preview-box">';
        html += '<div class="cota-preview-title">本次将发入：' + typeLabel + '</div>';
        html += '<div class="cota-preview-text">确认后消耗 1 个空槽位；若当前没有空槽位，则无法发牌。</div>';
        html += '</div>';
        html += '</div>';
        html += '<div class="cota-panel-actions">';
        html += '<button class="action-btn small" type="button" data-action="close">取消</button>';
        html += '<button class="action-btn primary small" type="button" data-action="confirm"' + (canConfirm ? '' : ' disabled') + '>发入</button>';
        html += '</div>';
        html += '</div>';
        overlay.innerHTML = html;

        Array.prototype.forEach.call(overlay.querySelectorAll('[data-card-type]'), function(btn) {
          btn.addEventListener('click', function() {
            state.cardType = btn.getAttribute('data-card-type') || 'good';
            render();
          });
        });

        var closeBtn = overlay.querySelector('[data-action="close"]');
        if (closeBtn) closeBtn.addEventListener('click', function() { self._closeCotaOverlay(overlay); });

        var confirmBtn = overlay.querySelector('[data-action="confirm"]');
        if (confirmBtn) {
          confirmBtn.addEventListener('click', function() {
            var result = self.skillSystem.activatePlayerSkill(skill.uniqueId, {
              cardType: state.cardType,
              gameContext: self._gameCtx
            });
            if (!result.success) {
              self._showSkillError(result);
              return;
            }
            self._closeCotaOverlay(overlay);
            if (self.onMessage) self.onMessage('[发牌] 加入 ' + (state.cardType === 'good' ? '吉牌' : state.cardType === 'bad' ? '厄牌' : '杂牌'));
            self.updateDisplay();
            self.updateButtons();
          });
        }
      }

      overlay.addEventListener('click', function(e) {
        if (e.target === overlay) self._closeCotaOverlay(overlay);
      });
      document.body.appendChild(overlay);
      render();
    }

    _showCotaArrangePanel(skill) {
      var existing = document.querySelector('.cota-overlay');
      if (existing) existing.remove();

      var overlay = document.createElement('div');
      overlay.className = 'trixie-rewrite-overlay cota-overlay';
      var self = this;
      var state = {
        mode: 'gather'
      };

      function projectCotaArrange(cotaState, mode) {
        var contractTemplate = self._getCotaContractTemplatePreview(skill.ownerId);
        var isGather = mode === 'gather';
        var nextSlots = isGather
          ? Math.max(0, cotaState.slotCount - 1)
          : (cotaState.slotCount + 1);
        var overflow = isGather
          ? Math.max(0, cotaState.totalCards - nextSlots)
          : 0;
        var pointDelta = {
          good: cotaState.counts.good * (isGather ? (6 + contractTemplate.gatherBaseBonus) : (-3 + contractTemplate.spreadBaseBonus)),
          bad: cotaState.counts.bad * (isGather ? (6 + contractTemplate.gatherBaseBonus) : (-3 + contractTemplate.spreadBaseBonus)),
          misc: cotaState.counts.misc * (isGather ? 6 : -3)
        };
        var manaDelta = {
          good: cotaState.counts.good * (isGather ? 2 : -1),
          bad: cotaState.counts.bad * (isGather ? 2 : -1),
          misc: cotaState.counts.misc * (isGather ? 2 : -1)
        };
        return {
          nextSlots: nextSlots,
          overflow: overflow,
          pointDelta: pointDelta,
          manaDelta: manaDelta,
          nextPointTotals: {
            good: Math.max(0, cotaState.pointTotals.good + pointDelta.good),
            bad: Math.max(0, cotaState.pointTotals.bad + pointDelta.bad),
            misc: Math.max(0, cotaState.pointTotals.misc + pointDelta.misc)
          },
          nextManaTotals: {
            good: Math.max(0, cotaState.manaTotals.good + manaDelta.good),
            bad: Math.max(0, cotaState.manaTotals.bad + manaDelta.bad),
            misc: Math.max(0, cotaState.manaTotals.misc + manaDelta.misc)
          }
        };
      }

      function formatSigned(value) {
        var amount = Number(value || 0);
        if (amount > 0) return '+' + amount;
        return String(amount);
      }

      function metricRow(label, current, delta, next, tone) {
        return '<div class="cota-metric-row">' +
          '<span class="cota-metric-label">' + label + '</span>' +
          '<span class="cota-metric-value">' + current + '</span>' +
          '<span class="cota-metric-delta ' + tone + '">' + formatSigned(delta) + '</span>' +
          '<span class="cota-metric-next">' + next + '</span>' +
          '</div>';
      }

      function render() {
        var cotaState = self._getCotaRuntimeState(skill.ownerId);
        var projection = projectCotaArrange(cotaState, state.mode);
        var nextSlots = projection.nextSlots;
        var overflow = projection.overflow;
        var canConfirm = state.mode === 'spread' || cotaState.slotCount > 0;
        var html = '<div class="terminal-panel cota-panel">';
        html += '<div class="panel-header">';
        html += '<div class="panel-title">COTA // 理牌</div>';
        html += '<div class="panel-sub">选择收牌或铺牌，并查看整列点数变化</div>';
        html += '</div>';
        html += '<div class="cota-panel-body">';
        html += '<div class="cota-summary-grid">';
        html += '<div class="cota-summary-card"><span class="cota-summary-label">当前槽位</span><span class="cota-summary-value">' + cotaState.slotCount + '</span></div>';
        html += '<div class="cota-summary-card"><span class="cota-summary-label">总点数</span><span class="cota-summary-value">' + cotaState.totalPointValue + '</span></div>';
        html += '<div class="cota-summary-card"><span class="cota-summary-label">总牌数</span><span class="cota-summary-value">' + cotaState.totalCards + '</span></div>';
        html += '</div>';
        html += '<div class="cota-chip-group">';
        html += '<button class="cota-choice-chip cota-mode-chip' + (state.mode === 'gather' ? ' is-selected' : '') + '" type="button" data-cota-mode="gather">收牌</button>';
        html += '<button class="cota-choice-chip cota-mode-chip' + (state.mode === 'spread' ? ' is-selected' : '') + '" type="button" data-cota-mode="spread">铺牌</button>';
        html += '</div>';
        html += '<div class="cota-preview-box">';
        html += '<div class="cota-preview-title">模式：' + (state.mode === 'gather' ? '收牌' : '铺牌') + '</div>';
        html += '<div class="cota-preview-text">执行后槽位数：' + cotaState.slotCount + ' -> ' + nextSlots + '</div>';
        html += '<div class="cota-metric-table">';
        html += '<div class="cota-metric-head"><span>牌类</span><span>当前</span><span>变化</span><span>结果</span></div>';
        html += metricRow('吉牌点数', cotaState.pointTotals.good, projection.pointDelta.good, projection.nextPointTotals.good, projection.pointDelta.good >= 0 ? 'is-up' : 'is-down');
        html += metricRow('厄牌点数', cotaState.pointTotals.bad, projection.pointDelta.bad, projection.nextPointTotals.bad, projection.pointDelta.bad >= 0 ? 'is-up' : 'is-down');
        html += metricRow('杂牌点数', cotaState.pointTotals.misc, projection.pointDelta.misc, projection.nextPointTotals.misc, projection.pointDelta.misc >= 0 ? 'is-up' : 'is-down');
        html += metricRow('总耗蓝', cotaState.totalManaCost, projection.manaDelta.good + projection.manaDelta.bad + projection.manaDelta.misc, projection.nextManaTotals.good + projection.nextManaTotals.bad + projection.nextManaTotals.misc, (projection.manaDelta.good + projection.manaDelta.bad + projection.manaDelta.misc) <= 0 ? 'is-down' : 'is-up');
        html += '</div>';
        if (state.mode === 'gather') {
          html += '<div class="cota-preview-text">收牌会减少 1 个槽位，并统一强化凶吉牌与杂牌。</div>';
          if (overflow > 0) {
            html += '<div class="cota-preview-text cota-warning-text">当前总牌数将超出槽位 ' + overflow + ' 张，超出的牌会直接爆掉。</div>';
          }
        } else {
          html += '<div class="cota-preview-text">铺牌会增加 1 个槽位，同时统一下调整列牌面的点数与耗蓝。</div>';
        }
        html += '</div>';
        html += '</div>';
        html += '<div class="cota-panel-actions">';
        html += '<button class="action-btn small" type="button" data-action="close">取消</button>';
        html += '<button class="action-btn primary small" type="button" data-action="confirm"' + (canConfirm ? '' : ' disabled') + '>确认</button>';
        html += '</div>';
        html += '</div>';
        overlay.innerHTML = html;

        Array.prototype.forEach.call(overlay.querySelectorAll('[data-cota-mode]'), function(btn) {
          btn.addEventListener('click', function() {
            state.mode = btn.getAttribute('data-cota-mode') || 'gather';
            render();
          });
        });

        var closeBtn = overlay.querySelector('[data-action="close"]');
        if (closeBtn) closeBtn.addEventListener('click', function() { self._closeCotaOverlay(overlay); });

        var confirmBtn = overlay.querySelector('[data-action="confirm"]');
        if (confirmBtn) {
          confirmBtn.addEventListener('click', function() {
            var result = self.skillSystem.activatePlayerSkill(skill.uniqueId, {
              mode: state.mode,
              gameContext: self._gameCtx
            });
            if (!result.success) {
              self._showSkillError(result);
              return;
            }
            self._closeCotaOverlay(overlay);
            if (self.onMessage) {
              self.onMessage('[理牌] ' + (state.mode === 'gather' ? '收牌' : '铺牌'));
            }
            self.updateDisplay();
            self.updateButtons();
          });
        }
      }

      overlay.addEventListener('click', function(e) {
        if (e.target === overlay) self._closeCotaOverlay(overlay);
      });
      document.body.appendChild(overlay);
      render();
    }

    _normalizeKakoPreDealWindow(windowData) {
      if (!windowData || !Array.isArray(windowData.entries) || windowData.entries.length === 0) return null;
      var ownerName = String(windowData.ownerName || 'KAKO');
      var mode = String(windowData.mode || 'human').toLowerCase() === 'ai' ? 'ai' : 'human';
      var sourceSkill = String(windowData.sourceSkill || 'reclassification');
      return {
        ownerId: windowData.ownerId,
        ownerName: ownerName,
        mode: mode,
        sourceSkill: sourceSkill,
        confirmLabel: windowData.confirmLabel || '判决 / 确定',
        autoDelayMs: Math.max(400, Number(windowData.autoDelayMs || 900)),
        entries: windowData.entries.map(function(entry, index) {
          return {
            index: index,
            contractId: entry && entry.contractId != null ? String(entry.contractId) : null,
            kind: entry && entry.kind ? String(entry.kind) : sourceSkill,
            sourceSkill: entry && entry.sourceSkill ? String(entry.sourceSkill) : sourceSkill,
            targetId: entry && entry.targetId,
            targetName: String(entry && entry.targetName || ('TARGET_' + (index + 1))),
            hasRedSeal: !!(entry && entry.hasRedSeal),
            streetAddedFortune: Math.max(0, Number(entry && entry.streetAddedFortune || 0)),
            streetAddedCurse: Math.max(0, Number(entry && entry.streetAddedCurse || 0)),
            trackedForceIds: {
              fortune: Array.isArray(entry && entry.trackedForceIds && entry.trackedForceIds.fortune)
                ? entry.trackedForceIds.fortune.slice()
                : [],
              curse: Array.isArray(entry && entry.trackedForceIds && entry.trackedForceIds.curse)
                ? entry.trackedForceIds.curse.slice()
                : []
            },
            previewRates: normalizeKakoPreviewRates(entry && entry.previewRates),
            rulingType: normalizeKakoRulingType(entry && entry.rulingType),
            decision: normalizeKakoDecision(entry && entry.decision)
          };
        })
      };
    }

    resolveKakoPreDealWindow(windowData, options) {
      var request = this._normalizeKakoPreDealWindow(windowData);
      if (!request) {
        return Promise.resolve({ handled: false, entries: [] });
      }

      var self = this;
      if (request.mode === 'ai') {
        if (this.onMessage) this.onMessage('⚖ ' + request.ownerName + ' 正在进行裁定...');
        return new Promise(function(resolve) {
          setTimeout(function() {
            var entries = request.entries.map(function(entry) {
              var selectedType = normalizeKakoRulingType(entry.rulingType) ||
                (entry.streetAddedFortune >= entry.streetAddedCurse ? 'fortune' : 'curse');
              return Object.assign({}, entry, {
                selectedType: selectedType,
                rulingType: selectedType,
                decision: normalizeKakoDecision(entry.decision) || 'approve'
              });
            });
            resolve({
              handled: true,
              mode: 'ai',
              ownerId: request.ownerId,
              ownerName: request.ownerName,
              sourceSkill: request.sourceSkill,
              entries: entries,
              gameContext: options && options.gameContext ? options.gameContext : null
            });
          }, request.autoDelayMs);
        });
      }

      if (this.onMessage) this.onMessage('⚖ 审判时刻');

      return new Promise(function(resolve) {
        var existing = document.querySelector('.kako-ruling-overlay');
        if (existing) existing.remove();

        var overlay = document.createElement('div');
        overlay.className = 'kako-ruling-overlay';
        document.body.appendChild(overlay);

        var state = request.entries.map(function(entry) {
          return {
            index: entry.index,
            selectedType: normalizeKakoRulingType(entry.rulingType),
            decision: entry.decision
          };
        });

        function getState(index) {
          for (var i = 0; i < state.length; i++) {
            if (state[i].index === index) return state[i];
          }
          return null;
        }

        function chooseDecision(index, selectedType, decision) {
          for (var i = 0; i < state.length; i++) {
            if (state[i].index === index) {
              state[i].selectedType = normalizeKakoRulingType(selectedType);
              state[i].decision = decision;
              return;
            }
          }
          state.push({
            index: index,
            selectedType: normalizeKakoRulingType(selectedType),
            decision: decision
          });
        }

        function buildDecisionLabel(type, decision) {
          var typeLabel = type === 'fortune' ? '幸运' : '厄运';
          return typeLabel + ' / ' + (decision === 'approve' ? '通过' : '拦截');
        }

        function buildDecisionPreview(entry, type, decision) {
          var preview = normalizeKakoPreviewRates(entry && entry.previewRates);
          var selectedType = normalizeKakoRulingType(type) || 'curse';
          var selectedAmount = selectedType === 'fortune'
            ? Math.max(0, Number(entry && entry.streetAddedFortune || 0))
            : Math.max(0, Number(entry && entry.streetAddedCurse || 0));
          var otherAmount = selectedType === 'fortune'
            ? Math.max(0, Number(entry && entry.streetAddedCurse || 0))
            : Math.max(0, Number(entry && entry.streetAddedFortune || 0));
          var primaryFactor = decision === 'approve'
            ? (1 + Math.max(0, Number(preview.primaryRate || 0)))
            : Math.max(0, 1 - Math.max(0, Number(preview.primaryRate || 0)));
          var secondaryFactor = Math.max(0, 1 - Math.max(0, Number(preview.secondaryRate || 0)));
          var selectedNext = projectKakoRawAmount(selectedAmount, primaryFactor);
          var otherNext = projectKakoRawAmount(otherAmount, secondaryFactor);
          var primaryText = decision === 'approve'
            ? formatKakoPercent(preview.primaryRate, '+')
            : formatKakoPercent(preview.primaryRate, '-');
          var secondaryText = formatKakoPercent(preview.secondaryRate, '-');
          return '本项 ' + primaryText + ' / 另一项 ' + secondaryText +
            ' | 裁后原始值 ' + formatKakoAmount(selectedNext) + ' / ' + formatKakoAmount(otherNext);
        }

        function renderChoiceButton(entry, type, decision) {
          var amount = type === 'fortune' ? entry.streetAddedFortune : entry.streetAddedCurse;
          var currentState = getState(entry.index);
          var selected = !!(currentState &&
            currentState.selectedType === type &&
            currentState.decision === decision);
          var disabled = amount <= 0;
          return '<button class="kako-ruling-option' + (selected ? ' is-selected' : '') +
            '" type="button" data-entry-index="' + entry.index +
            '" data-ruling-type="' + type +
            '" data-decision="' + decision + '"' +
            (disabled ? ' disabled' : '') + '><span class="kako-ruling-option-label">' +
            buildDecisionLabel(type, decision) + '</span><span class="kako-ruling-option-preview">' +
            buildDecisionPreview(entry, type, decision) + '</span></button>';
        }

        function render() {
          var allResolved = request.entries.every(function(entry) {
            var currentState = getState(entry.index);
            return !!(currentState && currentState.selectedType && currentState.decision);
          });
          var skillName = SKILL_NAMES[request.sourceSkill] || request.sourceSkill;
          var html = '<div class="terminal-panel kako-ruling-panel">';
          html += '<div class="panel-header">';
          html += '<div class="kako-ruling-kicker"><img src="' + KAKO_RULING_ICON + '" alt=""> PRE-DEAL JUDGMENT WINDOW</div>';
          html += '<div class="panel-title">审判时刻</div>';
          html += '<div class="panel-sub">' + request.ownerName + ' / ' + skillName + '</div>';
          html += '</div>';
          html += '<div class="kako-ruling-body">';
          for (var i = 0; i < request.entries.length; i++) {
            var entry = request.entries[i];
            var currentState = getState(entry.index);
            html += '<div class="kako-ruling-entry">';
            html += '<div class="kako-ruling-entry-head">';
            html += '<div class="kako-ruling-entry-title">';
            html += '<img class="kako-ruling-entry-icon" src="' + KAKO_RULING_ICON + '" alt="">';
            html += '<span>' + entry.targetName + '</span>';
            if (entry.hasRedSeal) {
              html += '<span class="kako-red-seal-badge"><img src="' + KAKO_RED_SEAL_ICON + '" alt="">红章</span>';
            }
            html += '</div>';
            html += '<div class="kako-ruling-entry-stats">';
            html += '<span>待裁定 fortune +' + formatKakoAmount(entry.streetAddedFortune) + '</span>';
            html += '<span>待裁定 curse +' + formatKakoAmount(entry.streetAddedCurse) + '</span>';
            html += '</div>';
            html += '</div>';
            html += '<div class="kako-ruling-split-grid">';
            html += '<div class="kako-ruling-split-card' + (currentState && currentState.selectedType === 'fortune' ? ' is-primary' : '') + '">';
            html += '<div class="kako-ruling-split-head"><span class="kako-ruling-split-label">幸运 / 原始值</span><span class="kako-ruling-split-value">+' + formatKakoAmount(entry.streetAddedFortune) + '</span></div>';
            html += '<div class="kako-ruling-options">';
            html += renderChoiceButton(entry, 'fortune', 'approve');
            html += renderChoiceButton(entry, 'fortune', 'reject');
            html += '</div>';
            html += '</div>';
            html += '<div class="kako-ruling-split-card' + (currentState && currentState.selectedType === 'curse' ? ' is-primary' : '') + '">';
            html += '<div class="kako-ruling-split-head"><span class="kako-ruling-split-label">厄运 / 原始值</span><span class="kako-ruling-split-value">+' + formatKakoAmount(entry.streetAddedCurse) + '</span></div>';
            html += '<div class="kako-ruling-options">';
            html += renderChoiceButton(entry, 'curse', 'approve');
            html += renderChoiceButton(entry, 'curse', 'reject');
            html += '</div>';
            html += '</div>';
            html += '</div>';
          }
          html += '</div>';
          html += '<div class="kako-ruling-actions">';
          html += '<button class="kako-ruling-confirm" type="button" data-action="confirm"' + (allResolved ? '' : ' disabled') + '>' + request.confirmLabel + '</button>';
          html += '</div>';
          html += '<div class="panel-footer">面板显示的是待裁定原始值；判决后仍会继续走角色自身效果与命运对抗结算。每名目标只主判一项，未选择的另一项自动走次级压低。</div>';
          html += '</div>';
          overlay.innerHTML = html;

          Array.prototype.forEach.call(overlay.querySelectorAll('[data-entry-index]'), function(btn) {
            btn.addEventListener('click', function() {
              chooseDecision(
                Number(btn.getAttribute('data-entry-index')),
                btn.getAttribute('data-ruling-type'),
                btn.getAttribute('data-decision')
              );
              render();
            });
          });

          var confirmBtn = overlay.querySelector('[data-action="confirm"]');
          if (confirmBtn) {
            confirmBtn.addEventListener('click', function() {
              var entries = request.entries.map(function(entry) {
                var currentState = getState(entry.index) || {};
                return Object.assign({}, entry, {
                  selectedType: normalizeKakoRulingType(currentState.selectedType),
                  rulingType: normalizeKakoRulingType(currentState.selectedType),
                  decision: currentState.decision
                });
              });
              self._closeKakoOverlay(overlay);
              resolve({
                handled: true,
                mode: 'human',
                ownerId: request.ownerId,
                ownerName: request.ownerName,
                sourceSkill: request.sourceSkill,
                entries: entries,
                gameContext: options && options.gameContext ? options.gameContext : null
              });
            });
          }
        }

        render();
      });
    }

    _showRuleRewritePanel(skill) {
      var existing = document.querySelector('.trixie-rewrite-overlay');
      if (existing) existing.remove();

      var overlay = document.createElement('div');
      overlay.className = 'trixie-rewrite-overlay';
      var self = this;
      var targets = this._getTrixieTargetPlayers(false);
      var state = {
        mode: 'fortune_self',
        modifier: 'none',
        global: false,
        targetId: targets.length ? targets[0].id : null
      };

      function render() {
        var wildCard = self._getTrixieWildCardValue();
        var totalPower = self._getTrixiePreviewPower(wildCard, state.mode, state.modifier, state.global);
        var immediatePower = state.modifier === 'delay' ? 0 : totalPower;
        var futurePower = state.modifier === 'extend' || state.modifier === 'delay'
          ? totalPower
          : 0;
        var canConfirm = wildCard > 0 && (state.mode !== 'curse_target' || state.global || state.targetId != null);
        var html = '<div class="terminal-panel trixie-rewrite-panel">';
        html += '<div class="panel-header">';
        html += '<div class="panel-title">RULE REWRITE</div>';
        html += '<div class="panel-sub">/// WILD CARD TRANSMUTATION MATRIX</div>';
        html += '</div>';
        html += '<div class="trixie-rewrite-body">';
        html += '<div class="trixie-wild-summary">';
        html += '<div class="trixie-wild-label">CURRENT WILD CARD</div>';
        html += '<div class="trixie-wild-value">' + wildCard + '<span>/120</span></div>';
        html += '</div>';
        html += '<div class="trixie-option-grid">';
        html += '<button class="trixie-option-chip' + (state.mode === 'fortune_self' ? ' is-selected' : '') + '" type="button" data-mode="fortune_self">fortune -> self x1</button>';
        html += '<button class="trixie-option-chip' + (state.mode === 'curse_target' ? ' is-selected' : '') + '" type="button" data-mode="curse_target">curse -> target x1.33</button>';
        html += '<button class="trixie-option-chip' + (state.modifier === 'none' ? ' is-selected' : '') + '" type="button" data-modifier="none">直接生效 x1</button>';
        html += '<button class="trixie-option-chip' + (state.modifier === 'delay' ? ' is-selected' : '') + '" type="button" data-modifier="delay">延后一街 x0.9</button>';
        html += '<button class="trixie-option-chip' + (state.modifier === 'extend' ? ' is-selected' : '') + '" type="button" data-modifier="extend">增加一街 x0.75</button>';
        html += '<button class="trixie-option-chip' + (state.global ? ' is-selected' : '') + '" type="button" data-toggle="global">场地 / 全场 x0.5</button>';
        html += '</div>';
        if (state.mode === 'curse_target' && !state.global) {
          html += '<div class="trixie-target-grid">';
          for (var i = 0; i < targets.length; i++) {
            var target = targets[i];
            html += '<button class="trixie-target-chip' + (state.targetId === target.id ? ' is-selected' : '') + '" type="button" data-target-id="' + target.id + '">' + target.name + '</button>';
          }
          html += '</div>';
        }
        html += '<div class="trixie-panel-note">';
        html += '即时力量: <strong>' + immediatePower + '</strong>';
        if (futurePower > 0) html += ' / 后续追加: <strong>' + futurePower + '</strong>';
        html += '<br>转化总值: <strong>' + totalPower + '</strong>';
        html += '</div>';
        html += '<div class="trixie-panel-actions">';
        html += '<button class="trixie-panel-btn trixie-panel-btn-muted" type="button" data-action="close">关闭</button>';
        html += '<button class="trixie-panel-btn trixie-panel-btn-main" type="button" data-action="confirm"' + (canConfirm ? '' : ' disabled') + '>发动</button>';
        html += '</div>';
        html += '</div>';
        html += '<div class="panel-footer">CLICK OUTSIDE TO DISMISS</div>';
        html += '</div>';
        overlay.innerHTML = html;

        Array.prototype.forEach.call(overlay.querySelectorAll('[data-mode]'), function(btn) {
          btn.addEventListener('click', function() {
            state.mode = btn.getAttribute('data-mode');
            render();
          });
        });
        Array.prototype.forEach.call(overlay.querySelectorAll('[data-modifier]'), function(btn) {
          btn.addEventListener('click', function() {
            state.modifier = btn.getAttribute('data-modifier');
            render();
          });
        });
        Array.prototype.forEach.call(overlay.querySelectorAll('[data-target-id]'), function(btn) {
          btn.addEventListener('click', function() {
            state.targetId = Number(btn.getAttribute('data-target-id'));
            render();
          });
        });
        var globalBtn = overlay.querySelector('[data-toggle="global"]');
        if (globalBtn) {
          globalBtn.addEventListener('click', function() {
            state.global = !state.global;
            render();
          });
        }
        var closeBtn = overlay.querySelector('[data-action="close"]');
        if (closeBtn) {
          closeBtn.addEventListener('click', function() {
            self._closeTrixieOverlay(overlay);
          });
        }
        var confirmBtn = overlay.querySelector('[data-action="confirm"]');
        if (confirmBtn) {
          confirmBtn.addEventListener('click', function() {
            var result = self.skillSystem.activatePlayerSkill(skill.uniqueId, {
              gameContext: self._gameCtx,
              rewriteMode: state.mode,
              rewriteModifier: state.modifier,
              rewriteGlobal: state.global,
              targetId: state.mode === 'curse_target' && !state.global ? state.targetId : null
            });
            if (!result.success) {
              self._showSkillError(result);
              return;
            }
            self._closeTrixieOverlay(overlay);
            if (self.onMessage) self.onMessage('[规则篡改] 已消耗鬼牌并重写命运');
            self.updateDisplay();
            self.updateButtons();
          });
        }
      }

      overlay.addEventListener('click', function(e) {
        if (e.target === overlay) self._closeTrixieOverlay(overlay);
      });
      render();
      document.body.appendChild(overlay);
      if (this.onMessage) this.onMessage('[规则篡改] 已展开鬼牌面板');
    }

    _showBlindBoxPanel(skill) {
      var existing = document.querySelector('.trixie-blind-box-overlay');
      if (existing) existing.remove();

      var overlay = document.createElement('div');
      overlay.className = 'trixie-rewrite-overlay trixie-blind-box-overlay';
      var self = this;
      var allTargets = this._getTrixieTargetPlayers(true);
      var opponents = allTargets.filter(function(player) { return player.id !== self.humanPlayerId; });
      var state = {
        mode: opponents.length >= 1 ? 'self_target' : 'others',
        primaryId: opponents.length ? opponents[0].id : null,
        selectedIds: opponents.slice(0, 2).map(function(player) { return player.id; })
      };

      function render() {
        var wildCard = self._getTrixieWildCardValue();
        var participantIds = state.mode === 'self_target'
          ? (state.primaryId != null ? [self.humanPlayerId, state.primaryId] : [])
          : state.selectedIds.slice(0, 2);
        var requiredWild = participantIds.indexOf(self.humanPlayerId) >= 0 ? 50 : 100;
        var disabledReason = '';
        if (participantIds.length !== 2 || participantIds[0] === participantIds[1]) {
          disabledReason = '需要先选定两名有效参与者';
        } else if (wildCard < requiredWild) {
          disabledReason = '鬼牌不足，当前需要至少 ' + requiredWild;
        }
        var previewPlayers = participantIds.map(function(id) {
          return (self._gameCtx.players || []).find(function(player) { return player && player.id === id; }) || null;
        }).filter(Boolean);

        var html = '<div class="terminal-panel trixie-rewrite-panel">';
        html += '<div class="panel-header">';
        html += '<div class="panel-title">BLIND BOX</div>';
        html += '<div class="panel-sub">/// SWAP CONTRACT MATRIX</div>';
        html += '</div>';
        html += '<div class="trixie-rewrite-body">';
        html += '<div class="trixie-wild-summary">';
        html += '<div class="trixie-wild-label">CURRENT WILD CARD</div>';
        html += '<div class="trixie-wild-value">' + wildCard + '<span>/120</span></div>';
        html += '</div>';
        html += '<div class="trixie-option-grid">';
        html += '<button class="trixie-option-chip' + (state.mode === 'self_target' ? ' is-selected' : '') + '" type="button" data-box-mode="self_target">TRIXIE + 另一人 (>=50)</button>';
        html += '<button class="trixie-option-chip' + (state.mode === 'others' ? ' is-selected' : '') + '" type="button" data-box-mode="others"' + (opponents.length >= 2 ? '' : ' disabled') + '>他人 + 他人 (>=100)</button>';
        html += '</div>';
        html += '<div class="trixie-target-grid">';
        if (state.mode === 'self_target') {
          for (var i = 0; i < opponents.length; i++) {
            var target = opponents[i];
            html += '<button class="trixie-target-chip' + (state.primaryId === target.id ? ' is-selected' : '') + '" type="button" data-box-target="' + target.id + '">' + target.name + '</button>';
          }
        } else {
          for (var j = 0; j < opponents.length; j++) {
            var other = opponents[j];
            html += '<button class="trixie-target-chip' + (state.selectedIds.indexOf(other.id) >= 0 ? ' is-selected' : '') + '" type="button" data-box-other="' + other.id + '">' + other.name + '</button>';
          }
        }
        html += '</div>';
        html += '<div class="trixie-panel-note">';
        html += '门槛鬼牌: <strong>' + requiredWild + '</strong><br>';
        var previewChipTotal = 0;
        var previewManaTotal = 0;
        for (var k = 0; k < previewPlayers.length; k++) {
          var player = previewPlayers[k];
          var mana = self.skillSystem.getMana(player.id) || { current: 0 };
          previewChipTotal += Number(player.chips || 0);
          previewManaTotal += Number(mana.current || 0);
          html += player.name + ' -> 交换筹码: <strong>' + Math.floor((player.chips || 0) * 0.5) + '</strong> / 交换 mana: <strong>' + Math.floor((mana.current || 0) * 0.5) + '</strong><br>';
        }
        if (previewPlayers.length === 2) {
          var avgChipsA = Math.ceil(previewChipTotal / 2);
          var avgChipsB = previewChipTotal - avgChipsA;
          var avgManaA = Math.ceil(previewManaTotal / 2);
          var avgManaB = previewManaTotal - avgManaA;
          html += '发动后筹码: <strong>' + avgChipsA + ' / ' + avgChipsB + '</strong><br>';
          html += '发动后 mana: <strong>' + avgManaA + ' / ' + avgManaB + '</strong><br>';
          html += '合同结束时也会按当时当前值重新平分一次<br>';
        }
        if (disabledReason) {
          html += '<strong>' + disabledReason + '</strong><br>';
        }
        html += '</div>';
        html += '<div class="trixie-panel-actions">';
        html += '<button class="trixie-panel-btn trixie-panel-btn-muted" type="button" data-action="close">关闭</button>';
        html += '<button class="trixie-panel-btn trixie-panel-btn-main" type="button" data-action="confirm">发动</button>';
        html += '</div>';
        html += '</div>';
        html += '<div class="panel-footer">CLICK OUTSIDE TO DISMISS</div>';
        html += '</div>';
        overlay.innerHTML = html;

        Array.prototype.forEach.call(overlay.querySelectorAll('[data-box-mode]'), function(btn) {
          btn.addEventListener('click', function() {
            if (btn.disabled) return;
            state.mode = btn.getAttribute('data-box-mode');
            render();
          });
        });
        Array.prototype.forEach.call(overlay.querySelectorAll('[data-box-target]'), function(btn) {
          btn.addEventListener('click', function() {
            state.primaryId = Number(btn.getAttribute('data-box-target'));
            render();
          });
        });
        Array.prototype.forEach.call(overlay.querySelectorAll('[data-box-other]'), function(btn) {
          btn.addEventListener('click', function() {
            var id = Number(btn.getAttribute('data-box-other'));
            var idx = state.selectedIds.indexOf(id);
            if (idx >= 0) state.selectedIds.splice(idx, 1);
            else if (state.selectedIds.length < 2) state.selectedIds.push(id);
            else state.selectedIds = [state.selectedIds[1], id];
            render();
          });
        });
        var closeBtn = overlay.querySelector('[data-action="close"]');
        if (closeBtn) closeBtn.addEventListener('click', function() { self._closeTrixieOverlay(overlay); });
        var confirmBtn = overlay.querySelector('[data-action="confirm"]');
        if (confirmBtn) {
          confirmBtn.addEventListener('click', function() {
            var participantIds = state.mode === 'self_target'
              ? [self.humanPlayerId, state.primaryId]
              : state.selectedIds.slice(0, 2);
            var result = self.skillSystem.activatePlayerSkill(skill.uniqueId, {
              gameContext: self._gameCtx,
              blindBoxMode: state.mode,
              participantIds: participantIds
            });
            if (!result.success) {
              self._showSkillError(result);
              return;
            }
            self._closeTrixieOverlay(overlay);
            if (self.onMessage) self.onMessage('[盲盒派对] 已建立 3 街交换合同');
            self.updateDisplay();
            self.updateButtons();
          });
        }
      }

      overlay.addEventListener('click', function(e) {
        if (e.target === overlay) self._closeTrixieOverlay(overlay);
      });
      render();
      document.body.appendChild(overlay);
      if (this.onMessage) this.onMessage('[盲盒派对] 已展开交换合同面板');
    }

    /**
     * 计算并显示当前裸牌胜率 (Psyche 信息效果核心)
     * 使用 PokerSolver 蒙特卡洛模拟计算真实胜率
     */
    _showWinRate(skill) {
      var ctx = this._gameCtx;
      var hero = (ctx.players || []).find(function (p) { return p.type === 'human'; });
      if (!hero || !hero.cards || hero.cards.length < 2) return;

      var board = ctx.board || [];
      var activePlayers = (ctx.players || []).filter(function (p) { return p.isActive !== false && !p.folded && p.cards && p.cards.length >= 2; });
      if (activePlayers.length < 2) return;

      // 使用蒙特卡洛模拟计算胜率
      var winPct = this._monteCarloEquity(hero.cards, board, activePlayers.length);

      // 在屏幕上方显示胜率
      this._displayWinRate(winPct, skill);
    }

    /**
     * 读心 — 显示对手当前线条、牌面底气与行动建议
     */
    _showHeartRead() {
      var ctx = this._gameCtx;
      var opponents = (ctx.players || []).filter(function (p) {
        return p.type === 'ai' && p.isActive !== false && !p.folded;
      });
      if (opponents.length === 0) return;

      // 同时显示己方胜率（继承 clarity 的信息效果）
      var heroWinRate = null;
      var heroPlayer = (ctx.players || []).find(function (p) { return p.type !== 'ai'; });
      if (heroPlayer && heroPlayer.cards && heroPlayer.cards.length >= 2) {
        heroWinRate = this._monteCarloEquity(heroPlayer.cards, ctx.board || [], opponents.length + 1);
      }

      // 构建读心信息
      var lines = [];
      for (var i = 0; i < opponents.length; i++) {
        var opp = opponents[i];
        var intel = this._buildHeartReadIntel(opp, ctx, heroWinRate);
        var line = '<div class="entry-block">';
        line += '<div class="entry-head"><div class="entry-target">' + opp.name + '</div><div class="entry-risk">PROFILE: ' + intel.riskText + '</div></div>';
        line += '<div class="entry-omen">"' + intel.omenText + '"</div>';
        line += '<div class="entry-advice">[!] ' + intel.adviceText + '</div>';
        line += '<div class="entry-tags">';
        line += '<div class="tag-item">[ INTENT: <span>' + intel.intentText + '</span> ]</div>';
        line += '<div class="tag-item">[ BOARD: <span>' + intel.handText + '</span> ]</div>';
        line += '<div class="tag-item">[ PRESS: <span>' + intel.pressureText + '</span> ]</div>';
        line += '</div>';
        line += '<div class="entry-meta">BET: ' + intel.betBB + ' BB | COMMIT: ' + intel.commitPct + '%</div>';
        line += '</div>';
        lines.push(line);
      }

      // 显示为浮层
      var existing = document.querySelector('.heart-read-overlay');
      if (existing) existing.remove();

      var overlay = document.createElement('div');
      overlay.className = 'heart-read-overlay';
      var html = '<div class="terminal-panel divination-panel">';
      html += '<div class="panel-header">';
      html += '<div class="panel-title">COURT DIVINATION</div>';
      html += '<div class="panel-sub">/// HEART READ INITIATED</div>';
      html += '</div>';
      if (heroWinRate != null) {
        html += '<div class="divination-hero"><span>HERO.EQUITY // CURRENT SCALES</span><b>' + heroWinRate + '%</b></div>';
      }
      html += '<div class="divination-body">';
      for (var j = 0; j < lines.length; j++) {
        html += lines[j];
      }
      html += '</div>';
      html += '<div class="panel-footer">CLICK TO DISMISS | T3/T2 CURSE DISRUPTED</div>';
      html += '</div>';
      overlay.innerHTML = html;
      overlay.addEventListener('click', function () {
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity 0.3s';
        setTimeout(function () { overlay.remove(); }, 300);
      });
      document.body.appendChild(overlay);
    }

    _buildHeartReadIntel(opp, ctx, heroWinRate) {
      var bb = ctx.bigBlind || ctx.blinds || 20;
      var pot = ctx.pot || 0;
      var currentBet = opp.currentBet || 0;
      var totalBet = Math.max(opp.totalBet || 0, currentBet);
      var startStack = Math.max(1, totalBet + (opp.chips || 0));
      var commitPct = Math.round(totalBet / startStack * 100);
      var betBB = bb > 0 ? Math.round(currentBet / bb * 10) / 10 : 0;
      var pressureRatio = pot > 0 ? currentBet / pot : 0;
      var risk = (opp.ai && opp.ai.riskType) || (opp.personality && (opp.personality.riskAppetite || opp.personality.risk)) || 'balanced';
      var riskLabel = { maniac: '激进', aggressive: '进攻', balanced: '均衡', passive: '保守', rock: '稳健' };
      var handState = this._getHeartReadHandState(opp, ctx.board || []);
      var pressureText = '轻';
      if (pressureRatio >= 0.85 || commitPct >= 40) pressureText = '重';
      else if (pressureRatio >= 0.45 || commitPct >= 20) pressureText = '中';

      var intentText = '观望';
      if (currentBet <= 0) {
        if (handState.madeRank >= 4) intentText = '慢打诱导';
        else if (handState.madeRank >= 2) intentText = '控池摊薄';
        else if (handState.drawType !== 'none') intentText = '追听观望';
        else intentText = '弃牌边缘';
      } else if (handState.madeRank >= 5) {
        intentText = pressureText === '重' ? '重价值压榨' : '价值下注';
      } else if (handState.madeRank >= 3) {
        intentText = pressureText === '重' ? '保护强成手' : '薄价值推进';
      } else if (handState.madeRank === 2) {
        intentText = handState.drawType !== 'none' ? '带听护牌' : (pressureText === '重' ? '护牌过猛' : '边缘护牌');
      } else if (handState.drawType !== 'none') {
        intentText = pressureText === '重' ? '半诈施压' : '追听试探';
      } else {
        intentText = pressureText === '重' ? '纯压迫诈唬' : '轻试探';
      }

      var handText = handState.bucketText;
      if (handState.drawText) handText += ' / ' + handState.drawText;

      var adviceText = '';
      var omenText = '';
      if (intentText === '重价值压榨' || intentText === '保护强成手') {
        adviceText = heroWinRate != null && heroWinRate < 35 ? '底气很足，弱成手别硬顶。' : '更像价值线，顶对以下要谨慎。';
        omenText = '她的筹码落得很稳，像在替已经成形的命运收费。';
      } else if (intentText === '价值下注' || intentText === '薄价值推进' || intentText === '边缘护牌') {
        adviceText = '像是在用成手收费，能跟但不适合乱反压。';
        omenText = '她在试着让你为一手已有分量的牌付费。';
      } else if (intentText === '半诈施压' || intentText === '追听试探') {
        adviceText = '更像听牌逼弃，可以收费或逼他弃掉权益。';
        omenText = '她的心念还没落地，更像在追逐尚未降临的牌。';
      } else if (intentText === '纯压迫诈唬' || intentText === '轻试探') {
        adviceText = '虚势成分偏高，顶对以上可考虑反压。';
        omenText = '她在借气势撬动你，真正的底牌并不沉。';
      } else if (intentText === '慢打诱导') {
        adviceText = '像在等你先动手，别把价值送进去。';
        omenText = '她收起锋芒，是在等你自己踏进更深的池子。';
      } else if (intentText === '追听观望') {
        adviceText = '他在看免费牌，主动施压通常有利。';
        omenText = '她把欲望藏了起来，只想白看下一页命运。';
      } else {
        adviceText = '底气不足，继续施压往往能逼退。';
        omenText = '她的念头发虚，这一步更像拖延与观望。';
      }

      return {
        riskText: riskLabel[risk] || risk,
        betBB: betBB,
        commitPct: commitPct,
        pressureText: pressureText,
        handText: handText,
        intentText: intentText,
        omenText: omenText,
        adviceText: adviceText
      };
    }

    _getHeartReadHandState(opp, board) {
      var strengthMap = { 0: 5, 1: 15, 2: 45, 3: 60, 4: 75, 5: 82, 6: 85, 7: 92, 8: 97, 9: 100 };
      var cards = opp.cards || [];
      var madeRank = 0;
      var strength = 35;
      var drawState = this._detectHeartReadDraw(cards, board);

      if (cards.length >= 2 && board.length > 0 && global.PokerAI && typeof global.PokerAI.evaluateHandStrength === 'function') {
        var hr = global.PokerAI.evaluateHandStrength(cards, board);
        madeRank = hr && hr.rank != null ? hr.rank : 1;
        strength = strengthMap[madeRank] != null ? strengthMap[madeRank] : 15;
      } else if (cards.length >= 2 && global.PokerAI && typeof global.PokerAI.evaluatePreflopStrength === 'function') {
        strength = global.PokerAI.evaluatePreflopStrength(cards);
      }

      var bucketText = '空气';
      if (madeRank >= 7) bucketText = '怪物成手';
      else if (madeRank >= 5) bucketText = '强成手';
      else if (madeRank >= 3) bucketText = '中强成手';
      else if (madeRank === 2) bucketText = strength >= 50 ? '一对成手' : '边缘一对';
      else if (board.length === 0) {
        if (strength >= 55) bucketText = '强起手';
        else if (strength >= 40) bucketText = '可打起手';
        else bucketText = '边缘起手';
      } else if (drawState.drawType !== 'none') {
        bucketText = '未成手';
      }

      return {
        madeRank: madeRank,
        strength: strength,
        bucketText: bucketText,
        drawType: drawState.drawType,
        drawText: drawState.drawText
      };
    }

    _detectHeartReadDraw(cards, board) {
      if (!cards || cards.length < 2 || !board || board.length < 3 || board.length >= 5) {
        return { drawType: 'none', drawText: '' };
      }

      var all = cards.concat(board);
      var suitCount = {};
      var maxSuit = 0;
      for (var i = 0; i < all.length; i++) {
        var suit = all[i].suit;
        suitCount[suit] = (suitCount[suit] || 0) + 1;
        if (suitCount[suit] > maxSuit) maxSuit = suitCount[suit];
      }

      var ranks = {};
      for (var j = 0; j < all.length; j++) {
        var rank = all[j].rank === 1 ? 14 : all[j].rank;
        ranks[rank] = true;
        if (rank === 14) ranks[1] = true;
      }

      var uniq = Object.keys(ranks).map(function (n) { return parseInt(n, 10); }).sort(function (a, b) { return a - b; });
      var bestRun = 1;
      var curRun = 1;
      for (var k = 1; k < uniq.length; k++) {
        if (uniq[k] === uniq[k - 1] + 1) {
          curRun++;
          if (curRun > bestRun) bestRun = curRun;
        } else if (uniq[k] !== uniq[k - 1]) {
          curRun = 1;
        }
      }

      var hasFlushDraw = maxSuit >= 4;
      var hasStraightDraw = bestRun >= 4;
      if (hasFlushDraw && hasStraightDraw) return { drawType: 'combo', drawText: '强听牌' };
      if (hasFlushDraw) return { drawType: 'flush', drawText: '同花听' };
      if (hasStraightDraw) return { drawType: 'straight', drawText: '顺子听' };
      return { drawType: 'none', drawText: '' };
    }

    /**
     * 蒙特卡洛胜率计算
     * @param {Array} holeCards - 玩家手牌 [{rank, suit}, ...]
     * @param {Array} board - 当前公共牌
     * @param {number} numPlayers - 活跃玩家数
     * @returns {number} 胜率百分比 (0-100)
     */
    _monteCarloEquity(holeCards, board, numPlayers) {
      var SUIT_MAP = { 0: 's', 1: 'h', 2: 'c', 3: 'd' };
      var RANK_MAP = { 1: 'A', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: 'T', 11: 'J', 12: 'Q', 13: 'K' };

      function cardStr(c) { return (RANK_MAP[c.rank] || '?') + (SUIT_MAP[c.suit] || 's'); }

      var heroStrs = holeCards.map(cardStr);
      var boardStrs = board.map(cardStr);

      // 构建剩余牌堆
      var usedSet = {};
      heroStrs.forEach(function (s) { usedSet[s] = true; });
      boardStrs.forEach(function (s) { usedSet[s] = true; });

      var remaining = [];
      for (var r = 1; r <= 13; r++) {
        for (var s = 0; s <= 3; s++) {
          var cs = (RANK_MAP[r] || '?') + (SUIT_MAP[s] || 's');
          if (!usedSet[cs]) remaining.push(cs);
        }
      }

      var SIMS = 200;
      var wins = 0;
      var ties = 0;
      var boardNeeded = 5 - boardStrs.length;
      var opponentCount = numPlayers - 1;
      var cardsNeeded = boardNeeded + opponentCount * 2;

      for (var sim = 0; sim < SIMS; sim++) {
        // Fisher-Yates 部分洗牌
        var deck = remaining.slice();
        for (var i = deck.length - 1; i > deck.length - 1 - cardsNeeded && i > 0; i--) {
          var j = Math.floor(Math.random() * (i + 1));
          var tmp = deck[i]; deck[i] = deck[j]; deck[j] = tmp;
        }

        var drawn = deck.slice(deck.length - cardsNeeded);
        var simBoard = boardStrs.concat(drawn.slice(0, boardNeeded));
        var heroAll = heroStrs.concat(simBoard);

        try {
          var heroHand = Hand.solve(heroAll);
          var heroWins = true;
          var heroTie = false;

          for (var opp = 0; opp < opponentCount; opp++) {
            var oppCards = drawn.slice(boardNeeded + opp * 2, boardNeeded + opp * 2 + 2);
            var oppAll = oppCards.concat(simBoard);
            var oppHand = Hand.solve(oppAll);
            var winners = Hand.winners([heroHand, oppHand]);
            if (winners.length === 2) {
              heroTie = true;
            } else if (!winners.includes(heroHand)) {
              heroWins = false;
              break;
            }
          }

          if (heroWins && !heroTie) wins++;
          else if (heroWins && heroTie) ties++;
        } catch (e) {
          // PokerSolver 错误，跳过此模拟
        }
      }

      return Math.round((wins + ties * 0.5) / SIMS * 100);
    }

    /**
     * 在屏幕上方显示胜率浮层
     */
    _displayWinRate(winPct, skill) {
      // 移除旧的
      var existing = document.querySelector('.psyche-winrate-overlay');
      if (existing) existing.remove();

      var overlay = document.createElement('div');
      overlay.className = 'psyche-winrate-overlay';

      var isTruthMode = skill && skill.effect === 'reversal';
      var label = isTruthMode ? 'TRUTH // NAKED EQUITY' : 'PSYCHE // NAKED EQUITY';

      overlay.innerHTML =
        '<div class="hud-winrate' + (isTruthMode ? ' truth-mode' : '') + '">' +
          '<div class="hud-label">' + label + '</div>' +
          '<div class="hud-value">' + winPct.toFixed(2) + '%</div>' +
        '</div>';

      overlay.addEventListener('click', function () {
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity 0.3s';
        setTimeout(function () { overlay.remove(); }, 300);
      });
      document.body.appendChild(overlay);

      // 自动消失
      setTimeout(function () {
        if (overlay.parentNode) {
          overlay.style.opacity = '0';
          overlay.style.transition = 'opacity 0.5s';
          setTimeout(function () { if (overlay.parentNode) overlay.remove(); }, 500);
        }
      }, 5000);
    }

    _peekCleanup() {
      // 移除所有座位高亮和点击事件
      if (this._peekHandlers) {
        for (var i = 0; i < this._peekHandlers.length; i++) {
          var h = this._peekHandlers[i];
          h.el.classList.remove('peek-targetable');
          h.el.removeEventListener('click', h.handler);
        }
        this._peekHandlers = null;
      }
      if (this._peekEscHandler) {
        document.removeEventListener('keydown', this._peekEscHandler);
        this._peekEscHandler = null;
      }
    }

    /**
     * 构建透视数据（不显示 overlay）
     * @returns {{ target, cardData, mode, tier }} 或 null（被屏蔽时）
     */
    _buildPeekData(skill, target, tier) {
      var RANK_NAMES = { 1: 'A', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: 'T', 11: 'J', 12: 'Q', 13: 'K' };

      // ---- Void T3 反侦察：null_field 阻断透视信息效果 ----
      if (this.skillSystem) {
        var targetSkills = this.skillSystem.getPlayerSkills(target.id);
        var hasNullField = targetSkills.some(function(s) {
          return s.effect === 'null_field' && s.active;
        });
        if (hasNullField) {
          if (this.onMessage) this.onMessage('[屏蔽] ' + target.name + ' 阻断透视');
          return null;
        }
      }

      // ---- Moirai > Psyche 克制：幸运迷雾降低透视精度 ----
      var effectiveTier = tier;
      if (this.skillSystem) {
        var targetFortunePower = (this.skillSystem.pendingForces || [])
          .filter(function (f) { return f.ownerId === target.id && f.type === 'fortune'; })
          .reduce(function (sum, f) { return sum + (f.power || 0); }, 0);
        if (targetFortunePower >= 30) {
          effectiveTier = Math.min(3, tier + 2);
          if (this.onMessage) this.onMessage('[幸运迷雾] ' + target.name + ' 干扰透视');
        } else if (targetFortunePower >= 15) {
          effectiveTier = Math.min(3, tier + 1);
          if (this.onMessage) this.onMessage('[幸运迷雾] ' + target.name + ' 干扰透视');
        }
      }
      tier = effectiveTier;

      var cardData, mode;
      if (tier <= 1) {
        // T1/T0: 完美透视 — 翻开座位上的牌
        target.cards.forEach(function (c) {
          if (c.$el && !c.$el.classList.contains('peek-revealed')) {
            c.setSide('front');
            c.$el.classList.add('peek-revealed');
          }
        });
        if (this.skillSystem) this.skillSystem.emit('peek:reveal', { targetId: target.id, targetName: target.name });
        cardData = target.cards;
        mode = 'perfect';
      } else if (tier <= 2) {
        // T2: 范围占卜，不直接给半明牌
        cardData = this._buildPeekRangeIntel(target, 'analysis');
        mode = 'analysis';
      } else {
        // T3: 模糊轮廓，只给大方向
        cardData = this._buildPeekRangeIntel(target, 'vague');
        mode = 'vague';
      }

      return { target: target, cardData: cardData, mode: mode, tier: tier };
    }

    _buildPeekRangeIntel(target, detailMode) {
      var board = (this._gameCtx && this._gameCtx.board) || [];
      var cards = target.cards || [];
      var labels = [];
      if (cards.length < 2) return labels;

      var r1 = cards[0].rank === 1 ? 14 : cards[0].rank;
      var r2 = cards[1].rank === 1 ? 14 : cards[1].rank;
      var high = Math.max(r1, r2);
      var low = Math.min(r1, r2);
      var suited = cards[0].suit === cards[1].suit;
      var pocket = r1 === r2;
      var connected = Math.abs(r1 - r2) <= 1 || (high === 14 && low === 13);
      var broadwayHeavy = high >= 11 && low >= 10;
      var boardInfo = null;

      if (board.length > 0 && global.PokerAI && typeof global.PokerAI.evaluateHandStrength === 'function') {
        try {
          boardInfo = global.PokerAI.evaluateHandStrength(cards, board);
        } catch (e) {
          boardInfo = null;
        }
      }

      var drawInfo = this._detectPeekDrawProfile(cards, board);
      if (detailMode === 'analysis') {
        var shapeText = '对手更像是宽范围入局。';
        if (pocket && high >= 10) shapeText = '对手大概率拿着高口袋对子。';
        else if (pocket) shapeText = '对手大概率拿着口袋对子。';
        else if (broadwayHeavy && suited) shapeText = '对手更像是高张同花。';
        else if (broadwayHeavy) shapeText = '对手更像是两张高张。';
        else if (connected && suited) shapeText = '对手更像是连张同花。';
        else if (connected) shapeText = '对手更像是连张结构。';
        else if (suited) shapeText = '对手更像是同花手。';
        else if (high >= 12) shapeText = '对手更像是高张带小踢脚。';

        var madeText = '现在更像没成手，靠气势在顶。';
        if (boardInfo) {
          if (boardInfo.rank >= 5) madeText = '他大概率已经做成强牌了。';
          else if (boardInfo.rank >= 3) madeText = '他大概率已经有成手。';
          else if (boardInfo.rank === 2) madeText = '他大概率至少有一对。';
        } else if (pocket) {
          madeText = '这手牌翻后通常自带摊牌值。';
        }
        if (drawInfo.combo) madeText = '他像是成手和强听一起拿着。';
        else if (drawInfo.drawText && (!boardInfo || boardInfo.rank <= 2)) {
          if (drawInfo.drawText === '强听牌迹象') madeText = '他更像在带强听牌施压。';
          else if (drawInfo.drawText === '同花听迹象') madeText = '他更像在追同花。';
          else if (drawInfo.drawText === '顺听迹象') madeText = '他更像在追顺子。';
        }

        var excludeText = '不像纯空气乱打。';
        if (pocket && high >= 11) excludeText = '这手不像在纯诈唬。';
        else if (broadwayHeavy) excludeText = '这手不像小杂张碰运气。';
        else if (connected && suited) excludeText = '这手不像大口袋对子。';
        else if (boardInfo && boardInfo.rank >= 5) excludeText = '这手不像虚张声势。';
        else if (drawInfo.drawText) excludeText = '这手不像纯坚果慢打。';

        labels.push({ value: shapeText, confidence: 'high' });
        labels.push({ value: madeText, confidence: boardInfo && boardInfo.rank >= 3 ? 'high' : 'mid' });
        labels.push({ value: excludeText, confidence: 'mid' });
      } else {
        var silhouette = '他像是宽范围在继续。';
        if (pocket) silhouette = high >= 10 ? '他像是拿着一手不小的对子。' : '他像是口袋对子。';
        else if (broadwayHeavy) silhouette = '他像是两张高张。';
        else if (connected && suited) silhouette = '他像是连张同花。';
        else if (suited) silhouette = '他像是带同花潜力的手。';
        else if (connected) silhouette = '他像是连张。';

        var tendency = '现在更像还在找翻牌。';
        if (boardInfo) {
          if (boardInfo.rank >= 5) tendency = '现在更像已经成了强牌。';
          else if (boardInfo.rank >= 2) tendency = '现在更像已经有摊牌值。';
        } else if (high >= 12) {
          tendency = '更像靠高张在撑。';
        }
        if (drawInfo.drawText && (!boardInfo || boardInfo.rank <= 2)) {
          if (drawInfo.drawText === '强听牌迹象') tendency = '现在更像强听牌还没落地。';
          else if (drawInfo.drawText === '同花听迹象') tendency = '现在更像在追同花。';
          else if (drawInfo.drawText === '顺听迹象') tendency = '现在更像在追顺子。';
        }

        labels.push({ value: silhouette, confidence: 'vague' });
        labels.push({ value: tendency, confidence: 'vague' });
      }

      return labels;
    }

    _detectPeekDrawProfile(cards, board) {
      if (!cards || cards.length < 2 || !board || board.length < 3 || board.length >= 5) {
        return { drawText: '', combo: false };
      }

      var all = cards.concat(board);
      var suitCount = {};
      var maxSuit = 0;
      for (var i = 0; i < all.length; i++) {
        var suit = all[i].suit;
        suitCount[suit] = (suitCount[suit] || 0) + 1;
        if (suitCount[suit] > maxSuit) maxSuit = suitCount[suit];
      }

      var ranks = {};
      for (var j = 0; j < all.length; j++) {
        var rank = all[j].rank === 1 ? 14 : all[j].rank;
        ranks[rank] = true;
        if (rank === 14) ranks[1] = true;
      }
      var uniq = Object.keys(ranks).map(function (n) { return parseInt(n, 10); }).sort(function (a, b) { return a - b; });
      var bestRun = 1;
      var run = 1;
      for (var k = 1; k < uniq.length; k++) {
        if (uniq[k] === uniq[k - 1] + 1) {
          run++;
          if (run > bestRun) bestRun = run;
        } else if (uniq[k] !== uniq[k - 1]) {
          run = 1;
        }
      }

      var flushDraw = maxSuit >= 4;
      var straightDraw = bestRun >= 4;
      if (flushDraw && straightDraw) return { drawText: '强听牌迹象', combo: true };
      if (flushDraw) return { drawText: '同花听迹象', combo: false };
      if (straightDraw) return { drawText: '顺听迹象', combo: false };
      return { drawText: '', combo: false };
    }

    /**
     * 执行单目标透视（refraction / axiom 用）
     * 构建数据 + 显示单人 overlay + 消息
     */
    _executePeek(skill, target, tier) {
      var result = this._buildPeekData(skill, target, tier);
      if (!result) return;

      this._showPeekCards(result.target, result.cardData, result.mode);

      if (result.mode === 'perfect') {
        if (this.onMessage) this.onMessage('[透视] ' + target.name);
      } else if (result.mode === 'analysis') {
        if (this.onMessage) this.onMessage('[透视] ' + target.name);
      } else {
        if (this.onMessage) this.onMessage('[透视] ' + target.name);
      }

      if (this.onLog) this.onLog('SKILL_USE', {
        skillKey: skill.skillKey,
        skill: SKILL_NAMES[skill.skillKey] || '透视',
        target: target.name,
        tier: result.tier,
        manaRemaining: this.skillSystem.getMana(this.humanPlayerId).current
      });
    }

    /**
     * 千里眼专用：多目标合并 overlay
     * @param {Array} results — _buildPeekData 返回值数组
     */
    _showPeekCardsMulti(results, titleOverride, modeOverride) {
      var existing = document.querySelector('.peek-result-overlay');
      if (existing) existing.remove();

      var overlay = document.createElement('div');
      overlay.className = 'peek-result-overlay';

      var dispTitle = titleOverride || '[千里眼] 全场透视';
      var dispMode = modeOverride || '完美透视';
      var html = '<div class="terminal-panel peek-result-panel">';
      html += '<div class="panel-header">';
      html += '<div class="panel-title">' + dispTitle + '</div>';
      html += '<div class="panel-sub">' + dispMode + '</div>';
      html += '</div>';
      html += '<div class="peek-result-body">';

      for (var r = 0; r < results.length; r++) {
        var res = results[r];
        html += '<div class="peek-target-section">';
        html += '<div class="peek-target-name">LOCKED TARGET: ' + res.target.name + '</div>';
        html += this._renderPeekDataHtml(res.cardData, res.mode);
        html += '</div>';
      }
      html += '</div>';
      html += '<div class="panel-footer">CLICK TO DISMISS</div>';
      html += '</div>';

      overlay.innerHTML = html;
      overlay.addEventListener('click', function () {
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity 0.3s';
        setTimeout(function () { overlay.remove(); }, 300);
      });
      document.body.appendChild(overlay);

    }

    _showPeekCards(target, cardData, mode) {
      // 移除旧的
      var existing = document.querySelector('.peek-result-overlay');
      if (existing) existing.remove();

      var overlay = document.createElement('div');
      overlay.className = 'peek-result-overlay';

      var html = '<div class="terminal-panel peek-result-panel">';
      html += '<div class="panel-header">';
      html += '<div class="panel-title">CLAIRVOYANCE LOCK</div>';
      if (mode === 'perfect') html += '<div class="panel-sub">LOCKED TARGET: ' + target.name + ' // PERFECT READ</div>';
      else if (mode === 'analysis') html += '<div class="panel-sub">LOCKED TARGET: ' + target.name + ' // RANGE READ</div>';
      else html += '<div class="panel-sub">LOCKED TARGET: ' + target.name + ' // VAGUE READ</div>';
      html += '</div>';
      html += '<div class="peek-result-body">';
      html += this._renderPeekDataHtml(cardData, mode);
      html += '</div>';
      html += '<div class="panel-footer">CLICK TO DISMISS</div>';
      html += '</div>';

      overlay.innerHTML = html;
      overlay.addEventListener('click', function () {
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity 0.3s';
        setTimeout(function () { overlay.remove(); }, 300);
      });
      document.body.appendChild(overlay);

    }

    _showVvLockOverlay(target, peekResult, intelLines) {
      this._showVvPortfolioOverlay(target && target.id != null ? target.id : null);
    }

    _buildVvTargetIntel(target) {
      var lines = [];
      var pending = this._buildVvResolvedForceSnapshot();
      var fortunePower = 0;
      var incomingCurse = 0;
      for (var i = 0; i < pending.length; i++) {
        var force = pending[i];
        if (!force) continue;
        var effectivePower = Math.max(0, Number(force.effectivePower != null ? force.effectivePower : force.power || 0));
        if (effectivePower <= 0) continue;
        if (force.ownerId === target.id && force.type === 'fortune') {
          fortunePower += effectivePower;
        }
        if (force.type === 'curse' && force.targetId === target.id && force.ownerId !== target.id) {
          incomingCurse += effectivePower;
        }
      }

      var ledger = this._getRuntimeAssetLedger();
      var positionAsset = ledger && typeof ledger.getAsset === 'function'
        ? ledger.getAsset(target.id, 'vv_positions')
        : null;
      var positionCount = positionAsset && Array.isArray(positionAsset.positions)
        ? positionAsset.positions.length
        : 0;
      var bubbleFortune = ledger && typeof ledger.getValue === 'function'
        ? Number(ledger.getValue(target.id, 'bubble_fortune') || 0)
        : 0;
      var bubbleChaos = ledger && typeof ledger.getValue === 'function'
        ? Number(ledger.getValue(target.id, 'bubble_chaos') || 0)
        : 0;
      var bubbleMana = ledger && typeof ledger.getValue === 'function'
        ? Number(ledger.getValue(target.id, 'bubble_mana') || 0)
        : 0;
      var layerAsset = positionAsset;
      var packs = layerAsset && Array.isArray(layerAsset.positions) ? layerAsset.positions.slice() : [];
      var bullishSize = 0;
      var bearishSize = 0;
      for (var p = 0; p < packs.length; p++) {
        var pack = packs[p] || {};
        var entrySize = Math.max(1, Number(pack.entrySize != null ? pack.entrySize : (pack.tier != null ? pack.tier : 1)) || 1);
        if (pack.direction === 'bearish') bearishSize += entrySize;
        else bullishSize += entrySize;
      }
      var visibleFortune = fortunePower + bubbleFortune;
      var visibleChaos = incomingCurse + bubbleChaos;

      var mana = this.skillSystem ? this.skillSystem.getMana(target.id) : null;
      var riskLabels = [];
      if (visibleFortune >= 25) riskLabels.push('幸运过厚');
      if (visibleChaos >= 25) riskLabels.push('chaos 偏高');
      if ((mana && mana.max > 0 && mana.current > mana.max * 0.5) || bubbleMana >= 20) {
        riskLabels.push(bubbleMana >= 20 ? '泡沫 mana 偏高' : 'mana 充足');
      }
      var valueLevel = '平稳';
      if (riskLabels.length >= 3) valueLevel = '过热';
      else if (riskLabels.length === 2) valueLevel = '偏热';
      else if (riskLabels.length === 1) valueLevel = '有波动';
      else if (visibleFortune >= 12 || positionCount > 0 || (mana && mana.max > 0 && mana.current > mana.max * 0.35)) valueLevel = '活跃';

      lines.push('价值观察: ' + valueLevel);
      lines.push(
        '压力摘要: fortune ' + (Math.round(visibleFortune * 10) / 10) +
        ' / chaos ' + (Math.round(visibleChaos * 10) / 10) +
        (mana ? ' / mana ' + mana.current + '/' + mana.max : '')
      );
      if (positionCount > 0 || bubbleFortune > 0 || bubbleChaos > 0 || bubbleMana > 0) {
        lines.push(
          '头寸摘要: ' + positionCount + '笔' +
          ' / fortune ' + (Math.round(bubbleFortune * 10) / 10) +
          ' / chaos ' + (Math.round(bubbleChaos * 10) / 10) +
          ' / mana ' + (Math.round(bubbleMana * 10) / 10)
        );
        lines.push('私有方向: 看涨 ' + bullishSize + ' / 看跌 ' + bearishSize);
      }
      lines.push('市场信号: ' + riskLabels.length + '/3' + (riskLabels.length ? '（' + riskLabels.join(' / ') + '）' : '（暂无强信号）'));
      return lines;
    }

    _getRuntimeAssetLedger() {
      if (this.skillSystem && this.skillSystem.assetLedger) return this.skillSystem.assetLedger;
      if (typeof window !== 'undefined' &&
          window.AceRuntimeAPI &&
          typeof window.AceRuntimeAPI.getAssetLedger === 'function') {
        return window.AceRuntimeAPI.getAssetLedger();
      }
      return null;
    }

    _buildVvResolvedForceSnapshot() {
      if (!this.skillSystem) return [];

      var forces = typeof this.skillSystem.collectActiveForces === 'function'
        ? this.skillSystem.collectActiveForces(this._gameCtx)
        : ((this.skillSystem.pendingForces || []).slice());
      if (!Array.isArray(forces) || forces.length === 0) return [];

      if (!this.moz || !this.moz.combatFormula || typeof this.moz._resolveForceOpposition !== 'function') {
        return forces.map(function(force) {
          return Object.assign({}, force, {
            effectivePower: force && force.effectivePower != null ? force.effectivePower : force.power || 0
          });
        });
      }

      var cf = this.moz.combatFormula;
      var backup = {
        phaseStateKey: cf._phaseStateKey,
        phaseTraitState: cf._phaseTraitState ? JSON.parse(JSON.stringify(cf._phaseTraitState)) : {},
          martyrdomStacks: cf._martyrdomStacks ? JSON.parse(JSON.stringify(cf._martyrdomStacks)) : {},
        debtCount: cf._debtCount ? JSON.parse(JSON.stringify(cf._debtCount)) : {},
        onTraitManaGain: cf.onTraitManaGain,
        lastResolvedForces: this.moz._lastResolvedForces ? this.moz._lastResolvedForces.slice() : null,
        lastPsycheEvents: this.moz._lastPsycheEvents ? this.moz._lastPsycheEvents.slice() : null
      };

      try {
        cf.onTraitManaGain = null;
        var enhanced = cf.enhanceForces(forces, { players: (this._gameCtx && this._gameCtx.players) || [] });
        return this.moz._resolveForceOpposition(enhanced);
      } catch (e) {
        return forces.map(function(force) {
          return Object.assign({}, force, {
            effectivePower: force && force.effectivePower != null ? force.effectivePower : force.power || 0
          });
        });
      } finally {
        cf._phaseStateKey = backup.phaseStateKey;
        cf._phaseTraitState = backup.phaseTraitState;
        cf._martyrdomStacks = backup.martyrdomStacks;
        cf._debtCount = backup.debtCount;
        cf.onTraitManaGain = backup.onTraitManaGain;
        this.moz._lastResolvedForces = backup.lastResolvedForces;
        this.moz._lastPsycheEvents = backup.lastPsycheEvents;
      }
    }

    _renderPeekDataHtml(cardData, mode) {
      var SUIT_CLASSES = { 0: 'spades', 1: 'hearts', 2: 'clubs', 3: 'diamonds' };
      var CONF_LABELS = { high: 'LOCKED', mid: 'LIKELY', low: 'UNSTABLE', vague: 'HAZY' };
      var CONF_CLASSES = { high: 'peek-conf-high', mid: 'peek-conf-mid', low: 'peek-conf-low', vague: 'peek-conf-vague' };
      var html = '';
      if (mode === 'analysis' || mode === 'vague' || mode === 'intel') {
        html += '<div class="cli-list">';
        for (var i = 0; i < cardData.length; i++) {
          var intel = cardData[i];
          var intelConf = intel.confidence || (mode === 'analysis' || mode === 'intel' ? 'mid' : 'vague');
          var intelLabel = mode === 'vague'
            ? '模糊'
            : ((intelConf === 'high') ? '大概率' : '可能');
          var rowClass = intelConf === 'high' ? ' alert' : '';
          html += '<div class="cli-row">';
          html += '<div class="cli-value' + rowClass + '">' + intel.value + '</div>';
          html += '<div class="cli-status' + (intelConf === 'vague' ? ' dim' : '') + '">' + intelLabel + '</div>';
          html += '</div>';
        }
        html += '</div>';
        return html;
      }

      html += '<div class="peek-cards-row">';
      for (var j = 0; j < cardData.length; j++) {
        var cd = cardData[j];
        var conf = cd.confidence || 'high';
        var confLabel = CONF_LABELS[conf] || '';
        var confClass = CONF_CLASSES[conf] || '';

        html += '<div class="peek-card-wrapper">';
        var suitCls = SUIT_CLASSES[cd.suit] || 'spades';
        var rankNum = cd.rank;
        if (typeof rankNum === 'string') {
          var rkMap = { A:1, '2':2, '3':3, '4':4, '5':5, '6':6, '7':7, '8':8, '9':9, T:10, J:11, Q:12, K:13 };
          rankNum = rkMap[rankNum] || 1;
        }
        html += '<div class="card peek-deck-card ' + suitCls + ' rank' + rankNum + '">';
        html += '<div class="face"></div>';
        html += '</div>';
        html += '<div class="peek-card-conf ' + confClass + '">' + confLabel + '</div>';
        html += '</div>';
      }
      html += '</div>';
      return html;
    }

    // ========== UI 生成（数据驱动） ==========

    /**
     * 从 skillSystem 注册表自动生成技能按钮
     */
    _buildSkillButtons() {
      if (!this.containers.skillPanel || !this.skillSystem) return;

      this.containers.skillPanel.innerHTML = '';
      this._buttons.clear();

      var humanSkills = this.skillSystem.getPlayerSkills(this.humanPlayerId);

      // 按属性分组排序：moirai → chaos → psyche → void，同属性内按 tier 升序 (T1 优先)
      var attrOrder = { moirai: 0, chaos: 1, psyche: 2, void: 3 };
      humanSkills.sort(function (a, b) {
        var ao = attrOrder[a.attr] != null ? attrOrder[a.attr] : 99;
        var bo = attrOrder[b.attr] != null ? attrOrder[b.attr] : 99;
        if (ao !== bo) return ao - bo;
        return a.tier - b.tier;
      });

      var lastAttr = null;

      for (var i = 0; i < humanSkills.length; i++) {
        var skill = humanSkills[i];
        var behavior = effectToBehavior(skill.effect, skill.activation);
        var showPassiveCard = skill.showAsPassiveCard === true;

        // 被动技能不生成按钮，除非明确要求显示为被动卡
        if (behavior === BEHAVIOR.PASSIVE && !showPassiveCard) continue;

        // handCard: false 的技能默认不进入手牌；showAsPassiveCard 可覆盖这个隐藏规则
        if (skill.handCard === false && !showPassiveCard) continue;

        if (showPassiveCard) behavior = BEHAVIOR.PASSIVE;

        // 属性分组分隔线
        if (lastAttr && skill.attr !== lastAttr) {
          var divider = document.createElement('div');
          divider.className = 'skill-divider';
          this.containers.skillPanel.appendChild(divider);
        }
        lastAttr = skill.attr;

        var visual = EFFECT_VISUALS[skill.effect] || EFFECT_VISUALS.fortune;
        var name = SKILL_NAMES[skill.skillKey] || skill.skillKey;

        this._createButton(skill, behavior, {
          icon: visual.icon, name: name, cost: skill.manaCost || null
        });
      }

      // 无技能时隐藏 Grimoire 入口，防止打开空抽屉
      this._updateGrimoireVisibility();
    }

    /**
     * 根据是否有可用技能按钮，显示/隐藏 Grimoire 入口
     */
    _updateGrimoireVisibility() {
      var magicKey = document.getElementById('magic-key');
      var grimoire = document.getElementById('grimoire-player');
      var hasSkills = this._buttons.size > 0;

      if (magicKey) magicKey.style.display = hasSkills ? '' : 'none';
      if (!hasSkills && grimoire) {
        grimoire.classList.remove('active');
      }
    }

    /**
     * 创建单个技能按钮 — hero-card Tilt Icon 风格
     */
    _createButton(skill, behavior, visual) {
      var btn = document.createElement('button');
      var ev = EFFECT_VISUALS[skill.effect] || EFFECT_VISUALS.fortune;
      var skinClass = EFFECT_TO_SKIN[skill.effect] || ATTR_TO_SKIN[ev.attr] || 'skin-moirai';
      btn.className = 'hero-card ' + skinClass;
      btn.disabled = true;

      var title = (visual.name || skill.skillKey);
      if (visual.cost) title += ' (' + visual.cost + ' Mana)';
      if (skill.description) title += '\n' + skill.description;
      btn.title = title;

      // Tier label
      var tierText = skill.tier ? 'Tier ' + skill.tier : '';
      if (skill.tier === 1) tierText = 'ULTIMATE';

      // Background icon — prefer SVG file, fallback to inline path
      var iconFile = skill.icon || SKILL_ICON_MAP[skill.skillKey];
      var bgSvg;
      if (iconFile) {
        var iconUrl = SVG_BASE_PATH + iconFile;
        bgSvg = '<span class="bg-icon-layer bg-icon-mask" style="-webkit-mask-image:url(\'' + iconUrl + '\');mask-image:url(\'' + iconUrl + '\');"></span>';
      } else {
        var bgPath = BG_SVG_PATHS[skill.effect] || BG_SVG_PATHS.fortune || '';
        var bgFillOrStroke = (skill.effect === 'null_field' || skill.effect === 'void_shield' || skill.effect === 'purge_all')
          ? 'fill="none" stroke="currentColor" stroke-width="1.5"'
          : 'fill="currentColor"';
        bgSvg = '<svg class="bg-icon-layer" viewBox="0 0 24 24" ' + bgFillOrStroke + '>' + bgPath + '</svg>';
      }

      // Cost badge
      var costHtml;
      if (skill.showAsPassiveCard) {
        costHtml = '<div class="cost-badge passive-badge">被动</div>';
      } else if (visual.cost) {
        costHtml = '<div class="cost-badge">' + visual.cost + ' MP</div>';
      } else if (skill.usesPerGame > 0) {
        costHtml = '<div class="cost-badge uses-badge">限' + skill.usesPerGame + '次</div>';
      } else if (skill.activation === 'toggle') {
        costHtml = '<div class="cost-badge toggle-badge">开关</div>';
      } else {
        costHtml = '<div class="cost-badge">--</div>';
      }

      var casterTag = skill.casterName ? '<span class="meta-caster">' + skill.casterName + '</span>' : '';

      btn.innerHTML =
        bgSvg +
        '<div class="card-top">' + costHtml + '</div>' +
        '<div class="card-bot">' +
          casterTag +
          '<span class="meta-tier">' + tierText + '</span>' +
          '<span class="meta-name">' + (visual.name || skill.skillKey) + '</span>' +
        '</div>';

      var self = this;
      btn.addEventListener('click', function () {
        self._activateSkill(behavior, skill);
      });

      this.containers.skillPanel.appendChild(btn);

      var buttonId = skill.uniqueId;
      this._buttons.set(buttonId, {
        element: btn,
        skill: skill,
        behavior: behavior
      });
    }

    // ========== Hook 监听 ==========

    _wireHooks() {
      if (!this.skillSystem) return;
      var self = this;

      // NPC 技能使用
      this.skillSystem.on('npc:skill_used', function (data) {
        if (self.onLog) {
          self.onLog('NPC_SKILL', {
            owner: data.ownerName, skill: data.skillKey,
            effect: data.effect, tier: data.tier,
            targetId: data.targetId, targetName: data.targetName
          });
        }
        // 如果是 curse，显示目标信息
        if (data.effect === 'curse' && data.targetName && self.onMessage) {
          self.onMessage('[' + data.ownerName + '] 诅咒 → ' + data.targetName);
        }
        self.updateDisplay();
        self.updateButtons();
      });

      // mana 变化
      this.skillSystem.on('mana:changed', function () {
        self.updateDisplay();
      });

      // 反噬
      this.skillSystem.on('backlash:start', function () {
        self.updateDisplay();
        self.updateButtons();
      });
      this.skillSystem.on('backlash:end', function () {
        self.updateDisplay();
        self.updateButtons();
      });
    }

    // ========== 状态查询 ==========

    getState() {
      if (!this.skillSystem) return {};
      return this.skillSystem.getState();
    }

    getForcesSummary() {
      if (!this.skillSystem) return { allies: [], enemies: [], total: { ally: 0, enemy: 0 } };
      return this.skillSystem.getForcesSummary();
    }
  }

  // ========== 导出 ==========
  global.SkillUI = SkillUI;
  global.SkillUI.BEHAVIOR = BEHAVIOR;
  global.SkillUI.EFFECT_VISUALS = EFFECT_VISUALS;
  global.SkillUI.SKILL_NAMES = SKILL_NAMES;

})(typeof window !== 'undefined' ? window : global);
