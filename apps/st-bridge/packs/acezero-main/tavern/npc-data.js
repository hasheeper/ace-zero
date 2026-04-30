/**
 * AceZero Tavern plugin NPC and character stat data.
 *
 * Loaded before tavern/plugin.js by st-bridge manifest. These tables
 * are static inputs for NPC assembly, role stats, skills, and runner presets.
 */
(function installAceZeroTavernNpcData(global) {
  'use strict';

const UNIVERSAL_SKILLS = {
    minor_wish:   { attr: 'moirai', tier: 3, threshold: 20 },
    grand_wish:   { attr: 'moirai', tier: 2, threshold: 40 },
    divine_order: { attr: 'moirai', tier: 1, threshold: 60 },
    hex:          { attr: 'chaos',  tier: 3, threshold: 20 },
    havoc:        { attr: 'chaos',  tier: 2, threshold: 40 },
    catastrophe:  { attr: 'chaos',  tier: 1, threshold: 60 },
    clarity:      { attr: 'psyche', tier: 3, threshold: 20 },
    refraction:   { attr: 'psyche', tier: 2, threshold: 40 },
    axiom:        { attr: 'psyche', tier: 1, threshold: 60 },
    static_field: { attr: 'void',   tier: 3, threshold: 20 },
    insulation:   { attr: 'void',   tier: 2, threshold: 40 },
    reality:      { attr: 'void',   tier: 1, threshold: 60 },
    // 角色专属技能
    royal_decree: { attr: 'moirai', tier: 0, threshold: 80, exclusive: 'RINO' },
    heart_read:   { attr: 'psyche', tier: 2, threshold: 20, exclusive: 'RINO' },
    cooler:       { attr: 'chaos',  tier: 2, threshold: 40, exclusive: 'SIA' },
    skill_seal:   { attr: 'chaos',  tier: 2, threshold: 40, exclusive: 'SIA' },
    clairvoyance: { attr: 'psyche', tier: 2, threshold: 40, exclusive: 'VV' },
    bubble_liquidation: { attr: 'psyche', tier: 0, threshold: 80, exclusive: 'VV' },
    miracle:      { attr: 'moirai', tier: 0, threshold: 0,  exclusive: 'POPPY' },
    lucky_find:   { attr: 'moirai', tier: 0, threshold: 0,  exclusive: 'POPPY' },
    rule_rewrite: { attr: 'chaos',  tier: 2, threshold: 40, exclusive: 'TRIXIE' },
    blind_box:    { attr: 'chaos',  tier: 0, threshold: 80, exclusive: 'TRIXIE' },
    deal_card:        { attr: 'psyche', tier: 2, threshold: 20, exclusive: 'COTA' },
    gather_or_spread: { attr: 'psyche', tier: 2, threshold: 40, exclusive: 'COTA' },
    absolution:      { attr: 'moirai', tier: 0, threshold: 70, exclusive: 'EULALIA' },
    benediction:     { attr: 'moirai', tier: 2, threshold: 30, exclusive: 'EULALIA' },
    reclassification:{ attr: 'psyche', tier: 2, threshold: 40, exclusive: 'KAKO' },
    general_ruling:  { attr: 'psyche', tier: 1, threshold: 60, exclusive: 'KAKO' },
    house_edge:      { attr: 'chaos',  tier: 2, threshold: 40, exclusive: 'KUZUHA' },
    debt_call:       { attr: 'chaos',  tier: 1, threshold: 70, exclusive: 'KUZUHA' }
  };


const VANGUARD_TRAIT_UNLOCK = {
    0: null, 1: null, 2: null, 3: null, 4: null, 5: null
  };


const REARGUARD_TRAIT_UNLOCK = {
    0: null, 1: null, 2: null, 3: null, 4: null, 5: null
  };


const MANA_BY_LEVEL = {
    0: { max: 0,   regen: 0 },
    1: { max: 40,  regen: 3 },
    2: { max: 60,  regen: 4 },
    3: { max: 80,  regen: 4 },
    4: { max: 90,  regen: 5 },
    5: { max: 100, regen: 5 }
  };


const MINI_GAME_SKILLS = {
    blackjack: {
      moirai: { key: 'lucky_hit', threshold: 20 },
      chaos: { key: 'curse_transfer', threshold: 20 },
      psyche: { key: 'peek', threshold: 20 }
    },
    dice: {
      moirai: { key: 'fortune_die', threshold: 20 },
      chaos: { key: 'jinx_die', threshold: 20 },
      psyche: { key: 'foresight', threshold: 20 }
    },
    dragon_tiger: {
      moirai: { key: 'dt_boost', threshold: 20 },
      chaos: { key: 'dt_swap', threshold: 20 },
      psyche: { key: 'dt_peek', threshold: 20 }
    }
  };


const NAMED_CHARACTERS = {
    // KAZU — 主角默认主手，Void 特化
    KAZU: {
      displayName: 'KAZU',
      preferredSlot: 'vanguard',
      attrsByLevel: {
        0: { moirai: 0,  chaos: 0,  psyche: 0,  void: 0 },
        1: { moirai: 0,  chaos: 0,  psyche: 10, void: 20 },
        2: { moirai: 0,  chaos: 0,  psyche: 20, void: 40 },
        3: { moirai: 0,  chaos: 0,  psyche: 30, void: 60 },
        4: { moirai: 0,  chaos: 0,  psyche: 35, void: 80 },
        5: { moirai: 0,  chaos: 0,  psyche: 40, void: 100 }
      },
      traitByLevel: {
        vanguard: { 0: null, 1: null, 2: 'null_armor', 3: 'null_armor', 4: 'null_armor', 5: 'null_armor' },
        rearguard: { 0: null, 1: null, 2: null, 3: 'steady_hand', 4: 'steady_hand', 5: 'steady_hand' }
      },
      exclusiveSkills: []  // KAZU 无专属技能
    },

    // RINO (♥ 天宫理乃) — 主角默认副手，Moirai + Psyche 特化
    RINO: {
      displayName: 'RINO',
      preferredSlot: 'rearguard',
      attrsByLevel: {
        0: { moirai: 0,  chaos: 0,  psyche: 0,  void: 0 },
        1: { moirai: 20, chaos: 10, psyche: 10, void: 0 },
        2: { moirai: 40, chaos: 15, psyche: 15, void: 0 },
        3: { moirai: 60, chaos: 20, psyche: 20, void: 0 },
        4: { moirai: 70, chaos: 20, psyche: 25, void: 0 },
        5: { moirai: 80, chaos: 20, psyche: 30, void: 0 }
      },
      traitByLevel: {
        vanguard: { 0: null, 1: null, 2: 'crimson_crown', 3: 'crimson_crown', 4: 'crimson_crown', 5: 'crimson_crown' },
        rearguard: { 0: null, 1: null, 2: null, 3: 'obsessive_love', 4: 'obsessive_love', 5: 'obsessive_love' }
      },
      exclusiveSkills: ['royal_decree', 'heart_read', 'minor_wish']
    },

    // SIA (♠ 夜伽希亚) — Chaos + Moirai 特化，Cooler 风格
    SIA: {
      displayName: 'SIA',
      preferredSlot: 'vanguard',
      attrsByLevel: {
        0: { moirai: 0,  chaos: 0,  psyche: 0,  void: 0 },
        1: { moirai: 10, chaos: 20, psyche: 5,  void: 0 },
        2: { moirai: 15, chaos: 40, psyche: 5,  void: 0 },
        3: { moirai: 20, chaos: 60, psyche: 10, void: 0 },
        4: { moirai: 25, chaos: 70, psyche: 10, void: 0 },
        5: { moirai: 30, chaos: 80, psyche: 10, void: 0 }
      },
      traitByLevel: {
        vanguard: { 0: null, 1: null, 2: 'death_ledger', 3: 'death_ledger', 4: 'death_ledger', 5: 'death_ledger' },
        rearguard: { 0: null, 1: null, 2: null, 3: 'binding_protocol', 4: 'binding_protocol', 5: 'binding_protocol' }
      },
      exclusiveSkills: ['cooler', 'skill_seal']
    },

    // VV (♦ 薇布伦·凡恩 / Veblen Vane) — 商会执行董事，洞察+泡沫+做空
    // 世界观第四主角（千里眼/偷天换日）
    VV: {
      displayName: 'V.V.',
      preferredSlot: 'vanguard',
      attrsByLevel: {
        0: { moirai: 0,  chaos: 0,  psyche: 0,  void: 0 },
        1: { moirai: 5,  chaos: 10, psyche: 20, void: 0 },
        2: { moirai: 5,  chaos: 15, psyche: 40, void: 0 },
        3: { moirai: 10, chaos: 20, psyche: 60, void: 0 },
        4: { moirai: 10, chaos: 25, psyche: 70, void: 0 },
        5: { moirai: 10, chaos: 30, psyche: 80, void: 0 }
      },
      traitByLevel: {
        vanguard: { 0: null, 1: null, 2: 'laser_eye', 3: 'laser_eye', 4: 'laser_eye', 5: 'laser_eye' },
        rearguard: { 0: null, 1: null, 2: null, 3: 'service_fee', 4: 'service_fee', 5: 'service_fee' }
      },
      exclusiveSkills: ['clairvoyance', 'bubble_liquidation']
    },

    // POPPY (♣ 波比·希德) — 被动触发型，绝境强运
    POPPY: {
      displayName: 'POPPY',
      preferredSlot: 'rearguard',
      attrsByLevel: {
        0: { moirai: 0,  chaos: 0,  psyche: 0,  void: 0 },
        1: { moirai: 10, chaos: 0,  psyche: 5,  void: 0 },
        2: { moirai: 20, chaos: 0,  psyche: 10, void: 0 },
        3: { moirai: 30, chaos: 0,  psyche: 15, void: 0 },
        4: { moirai: 40, chaos: 0,  psyche: 20, void: 0 },
        5: { moirai: 50, chaos: 0,  psyche: 25, void: 0 }
      },
      traitByLevel: {
        vanguard: { 0: null, 1: null, 2: 'four_leaf_clover', 3: 'four_leaf_clover', 4: 'four_leaf_clover', 5: 'four_leaf_clover' },
        rearguard: { 0: null, 1: null, 2: null, 3: 'cockroach', 4: 'cockroach', 5: 'cockroach' }
      },
      exclusiveSkills: ['miracle', 'lucky_find']
    },

    // TRIXIE (🃏 缇克希·怀尔德 / 鬼牌) — 纯混沌型，规则破坏者
    TRIXIE: {
      displayName: 'TRIXIE',
      preferredSlot: 'vanguard',
      attrsByLevel: {
        0: { moirai: 0,  chaos: 0,  psyche: 0,  void: 0 },
        1: { moirai: 0,  chaos: 20, psyche: 10, void: 0 },
        2: { moirai: 0,  chaos: 40, psyche: 15, void: 0 },
        3: { moirai: 0,  chaos: 60, psyche: 20, void: 0 },
        4: { moirai: 0,  chaos: 70, psyche: 25, void: 0 },
        5: { moirai: 0,  chaos: 80, psyche: 30, void: 0 }
      },
      traitByLevel: {
        vanguard: { 0: null, 1: null, 2: 'paradox_frame', 3: 'paradox_frame', 4: 'paradox_frame', 5: 'paradox_frame' },
        rearguard: { 0: null, 1: null, 2: null, 3: 'improvised_stage', 4: 'improvised_stage', 5: 'improvised_stage' }
      },
      exclusiveSkills: ['rule_rewrite', 'blind_box']
    },

    // COTA (可塔·林特 / Cota Lint #247) — Psyche 特化，契约处理型
    COTA: {
      displayName: 'COTA',
      preferredSlot: 'vanguard',
      attrsByLevel: {
        0: { moirai: 0,  chaos: 0,  psyche: 0,  void: 0 },
        1: { moirai: 10, chaos: 0,  psyche: 15, void: 0 },
        2: { moirai: 15, chaos: 2,  psyche: 28, void: 0 },
        3: { moirai: 20, chaos: 5,  psyche: 40, void: 0 },
        4: { moirai: 25, chaos: 5,  psyche: 50, void: 0 },
        5: { moirai: 30, chaos: 5,  psyche: 60, void: 0 }
      },
      traitByLevel: {
        vanguard: { 0: null, 1: null, 2: 'contract_template', 3: 'contract_template', 4: 'contract_template', 5: 'contract_template' },
        rearguard: { 0: null, 1: null, 2: null, 3: 'dealer_hands_fault', 4: 'dealer_hands_fault', 5: 'dealer_hands_fault' }
      },
      exclusiveSkills: ['deal_card', 'gather_or_spread']
    },

    // EULALIA (尤拉莉亚·帕瑞蒂) — Moirai + Void 特化，殉道支援型
    EULALIA: {
      displayName: 'EULALIA',
      preferredSlot: 'rearguard',
      attrsByLevel: {
        0: { moirai: 0,  chaos: 0,  psyche: 0,  void: 0 },
        1: { moirai: 25, chaos: 0,  psyche: 10, void: 0 },
        2: { moirai: 45, chaos: 0,  psyche: 15, void: 0 },
        3: { moirai: 65, chaos: 0,  psyche: 20, void: 0 },
        4: { moirai: 80, chaos: 0,  psyche: 25, void: 0 },
        5: { moirai: 95, chaos: 0,  psyche: 30, void: 0 }
      },
      traitByLevel: {
        vanguard: { 0: null, 1: null, 2: 'martyr_frame', 3: 'martyr_frame', 4: 'martyr_frame', 5: 'martyr_frame' },
        rearguard: { 0: null, 1: null, 2: null, 3: 'sanctuary_core', 4: 'sanctuary_core', 5: 'sanctuary_core' }
      },
      exclusiveSkills: ['absolution', 'benediction']
    },

    // KAKO (司伽子) — Psyche + Chaos 特化，审判裁定型
    KAKO: {
      displayName: 'KAKO',
      preferredSlot: 'vanguard',
      attrsByLevel: {
        0: { moirai: 0,  chaos: 0,  psyche: 0,  void: 0 },
        1: { moirai: 5,  chaos: 15, psyche: 20, void: 0 },
        2: { moirai: 8,  chaos: 22, psyche: 35, void: 0 },
        3: { moirai: 10, chaos: 30, psyche: 50, void: 0 },
        4: { moirai: 12, chaos: 35, psyche: 60, void: 0 },
        5: { moirai: 15, chaos: 40, psyche: 70, void: 0 }
      },
      traitByLevel: {
        vanguard: { 0: null, 1: null, 2: 'redline_file', 3: 'redline_file', 4: 'redline_file', 5: 'redline_file' },
        rearguard: { 0: null, 1: null, 2: null, 3: 'signoff_flow', 4: 'signoff_flow', 5: 'signoff_flow' }
      },
      exclusiveSkills: ['reclassification', 'general_ruling']
    },

    // KUZUHA (久世九叶) — Chaos + Moirai 特化，庄家型
    KUZUHA: {
      displayName: 'KUZUHA',
      preferredSlot: 'vanguard',
      attrsByLevel: {
        0: { moirai: 0,  chaos: 0,  psyche: 0,  void: 0 },
        1: { moirai: 15, chaos: 20, psyche: 5,  void: 0 },
        2: { moirai: 22, chaos: 35, psyche: 8,  void: 0 },
        3: { moirai: 30, chaos: 50, psyche: 10, void: 0 },
        4: { moirai: 35, chaos: 60, psyche: 12, void: 0 },
        5: { moirai: 40, chaos: 70, psyche: 15, void: 0 }
      },
      traitByLevel: {
        vanguard: { 0: null, 1: null, 2: 'house_tab', 3: 'house_tab', 4: 'house_tab', 5: 'house_tab' },
        rearguard: { 0: null, 1: null, 2: null, 3: 'grace_period', 4: 'grace_period', 5: 'grace_period' }
      },
      exclusiveSkills: ['house_edge', 'debt_call']
    }
  };


const NAMED_NPC_PRESETS = {
    KAZU: {
      level: 5,
      ai: 'balanced',
      difficulty: 'kazu',
      emotion: 'calm',
      attrs: { moirai: 10, chaos: 30, psyche: 30, void: 80 },
      skills: ['reality', 'insulation', 'refraction', 'static_field'],
      vanguardTrait: 'null_armor',
      rearguardTrait: 'steady_hand',
      mental: { discipline: 50, composureMax: 100, resistPresence: 10, resistTaunt: 10, resistProbe: 15 },
      desc: 'KAZU'
    },
    RINO: {
      level: 5,
      ai: 'aggressive',
      difficulty: 'rino',
      emotion: 'confident',
      attrs: { moirai: 80, chaos: 20, psyche: 30, void: 0 },
      skills: ['royal_decree', 'grand_wish', 'minor_wish', 'heart_read'],
      vanguardTrait: 'crimson_crown',
      rearguardTrait: 'obsessive_love',
      mental: { discipline: 90, composureMax: 120, resistPresence: 25, resistTaunt: 20, resistProbe: 30 },
      desc: 'RINO'
    },
    SIA: {
      level: 5,
      ai: 'aggressive',
      difficulty: 'sia',
      emotion: 'calm',
      attrs: { moirai: 30, chaos: 80, psyche: 10, void: 0 },
      skills: ['cooler', 'havoc', 'hex', 'skill_seal'],
      vanguardTrait: 'death_ledger',
      rearguardTrait: 'binding_protocol',
      mental: { discipline: 95, composureMax: 120, resistPresence: 15, resistTaunt: 40, resistProbe: 20 },
      desc: 'SIA'
    },
    POPPY: {
      level: 5,
      ai: 'passive',
      difficulty: 'poppy',
      emotion: 'relaxed',
      attrs: { moirai: 50, chaos: 0, psyche: 25, void: 0 },
      skills: ['miracle', 'lucky_find'],
      vanguardTrait: 'four_leaf_clover',
      rearguardTrait: 'cockroach',
      mental: { discipline: 60, composureMax: 100, resistPresence: 30, resistTaunt: 15, resistProbe: 15 },
      desc: 'POPPY'
    },
    VV: {
      level: 5,
      ai: 'balanced',
      difficulty: 'vv',
      emotion: 'calm',
      attrs: { moirai: 10, chaos: 30, psyche: 80, void: 0 },
      skills: ['clairvoyance', 'bubble_liquidation', 'refraction', 'clarity'],
      vanguardTrait: 'laser_eye',
      rearguardTrait: 'service_fee',
      mental: { discipline: 100, composureMax: 120, resistPresence: 20, resistTaunt: 15, resistProbe: 40 },
      desc: 'VV'
    },
    TRIXIE: {
      level: 5,
      ai: 'maniac',
      difficulty: 'trixie',
      emotion: 'euphoric',
      attrs: { moirai: 0, chaos: 80, psyche: 30, void: 0 },
      skills: ['rule_rewrite', 'blind_box', 'havoc', 'hex'],
      vanguardTrait: 'paradox_frame',
      rearguardTrait: 'improvised_stage',
      mental: { discipline: 85, composureMax: 120, resistPresence: 10, resistTaunt: 20, resistProbe: 45 },
      desc: 'TRIXIE'
    },
    COTA: {
      level: 5,
      ai: 'balanced',
      difficulty: 'cota',
      emotion: 'calm',
      attrs: { moirai: 30, chaos: 5, psyche: 60, void: 0 },
      skills: ['deal_card', 'gather_or_spread', 'refraction', 'clarity'],
      vanguardTrait: 'contract_template',
      rearguardTrait: 'dealer_hands_fault',
      mental: { discipline: 60, composureMax: 100, resistPresence: 20, resistTaunt: 15, resistProbe: 25 },
      desc: 'COTA'
    },
    EULALIA: {
      level: 5,
      ai: 'passive',
      difficulty: 'eulalia',
      emotion: 'calm',
      attrs: { moirai: 95, chaos: 0, psyche: 30, void: 0 },
      skills: ['absolution', 'benediction', 'divine_order', 'grand_wish'],
      vanguardTrait: 'martyr_frame',
      rearguardTrait: 'sanctuary_core',
      mental: { discipline: 95, composureMax: 120, resistPresence: 40, resistTaunt: 25, resistProbe: 20 },
      desc: 'EULALIA'
    },
    KAKO: {
      level: 5,
      ai: 'balanced',
      difficulty: 'kako',
      emotion: 'confident',
      attrs: { moirai: 15, chaos: 40, psyche: 70, void: 0 },
      skills: ['reclassification', 'general_ruling', 'axiom', 'havoc'],
      vanguardTrait: 'redline_file',
      rearguardTrait: 'signoff_flow',
      mental: { discipline: 90, composureMax: 120, resistPresence: 15, resistTaunt: 20, resistProbe: 40 },
      desc: 'KAKO'
    },
    KUZUHA: {
      level: 5,
      ai: 'aggressive',
      difficulty: 'kuzuha',
      emotion: 'confident',
      attrs: { moirai: 40, chaos: 70, psyche: 15, void: 0 },
      skills: ['house_edge', 'debt_call', 'catastrophe', 'grand_wish'],
      vanguardTrait: 'house_tab',
      rearguardTrait: 'grace_period',
      mental: { discipline: 110, composureMax: 140, resistPresence: 30, resistTaunt: 35, resistProbe: 25 },
      desc: 'KUZUHA'
    }
  };


const AI_KERNELS = {
    mob:      {
      ai: 'passive', difficulty: 'noob',
      mental: { discipline: 25, composureMax: 80, resistPresence: 0, resistTaunt: 0, resistProbe: 0 },
      desc: '杂鱼 — 盲目跟注，容易弃牌'
    },
    gambler:  {
      ai: 'maniac', difficulty: 'noob',
      mental: { discipline: 20, composureMax: 70, resistPresence: 5, resistTaunt: 0, resistProbe: 5 },
      desc: '赌徒 — 疯狂乱推，毫无章法'
    },
    rock:     {
      ai: 'rock', difficulty: 'regular',
      mental: { discipline: 40, composureMax: 100, resistPresence: 10, resistTaunt: 5, resistProbe: 5 },
      desc: '老苟 — 不见兔子不撒鹰'
    },
    shark:    {
      ai: 'aggressive', difficulty: 'pro',
      mental: { discipline: 60, composureMax: 110, resistPresence: 15, resistTaunt: 20, resistProbe: 15 },
      desc: '鲨鱼 — 剥削型打法，极其难缠'
    },
    boss:     {
      ai: 'balanced', difficulty: 'node5-boss',
      mental: { discipline: 100, composureMax: 130, resistPresence: 20, resistTaunt: 20, resistProbe: 20 },
      desc: '魔王 — 滴水不漏，连运气都会算'
    }
  };


const DIFFICULTY_MENTAL_PRESETS = {
    noob:    { discipline: 25, composureMax: 80,  resistPresence: 0,  resistTaunt: 0,  resistProbe: 0 },
    regular: { discipline: 45, composureMax: 100, resistPresence: 10, resistTaunt: 10, resistProbe: 10 },
    pro:     { discipline: 70, composureMax: 115, resistPresence: 15, resistTaunt: 15, resistProbe: 15 },
    boss:    { discipline: 100, composureMax: 130, resistPresence: 20, resistTaunt: 20, resistProbe: 20 }
  };


const AI_STYLE_PRESETS = {
    passive: true,
    maniac: true,
    rock: true,
    aggressive: true,
    balanced: true
  };


const RPG_TEMPLATES = {
    muggle: {
      desc: '麻瓜/常人 — 无异能',
      level: 0,
      attrs: { moirai: 0, chaos: 0, psyche: 0, void: 0 }
    },
    lucky: {
      desc: '幸运儿/龙套精英 — 命运偏向',
      level: 2,
      attrs: { moirai: 40, chaos: 0, psyche: 0, void: 0 }
    },
    cursed: {
      desc: '厄运散播者/小Boss — 混沌诅咒',
      level: 3,
      attrs: { moirai: 0, chaos: 50, psyche: 0, void: 0 }
    },
    esper: {
      desc: '裁定者 — 解析混乱，逆转诅咒',
      level: 4,
      attrs: { moirai: 0, chaos: 0, psyche: 80, void: 0 }
    }
  };


const MOOD_MODIFIERS = {
    calm:       { emotion: 'calm',       composureMod: 0,   desc: '冷静 — 无修正（默认）' },
    confident:  { emotion: 'confident',  composureMod: 20,  desc: '自信 — 敢打敢冲，定力上限+20' },
    focused:    { emotion: 'focused',    composureMod: 15,  desc: '专注 — 注意力集中，定力上限+15' },
    relaxed:    { emotion: 'relaxed',    composureMod: 10,  desc: '放松 — 压力小，定力上限+10' },
    tilt:       { emotion: 'tilt',       composureMod: -30, desc: '上头 — 情绪失控，定力上限-30' },
    fearful:    { emotion: 'fearful',    composureMod: -15, desc: '恐惧 — 畏手畏脚，定力上限-15' },
    desperate:  { emotion: 'desperate',  composureMod: -25, desc: '绝望 — 孤注一掷，定力上限-25' },
    euphoric:   { emotion: 'euphoric',   composureMod: -10, desc: '狂喜 — 飘飘然，容易轻敌，定力上限-10' }
  };


const RUNNER_PRESETS = {
    // 杂兵类
    street_thug:    { kernel: 'mob',     archetype: 'muggle',    mood: 'calm',      desc: '街头小混混' },
    drunk:          { kernel: 'gambler', archetype: 'muggle',    mood: 'euphoric',  desc: '醉汉赌徒' },
    rookie:         { kernel: 'mob',     archetype: 'muggle',    mood: 'fearful',   desc: '紧张的新手' },
    // 常规对手
    tavern_regular: { kernel: 'rock',    archetype: 'muggle',    mood: 'calm',      desc: '酒馆常客' },
    pro_gambler:    { kernel: 'shark',   archetype: 'muggle',    mood: 'confident', desc: '职业赌徒' },
    lucky_bastard:  { kernel: 'gambler', archetype: 'lucky',     mood: 'euphoric',  desc: '运气极好的家伙' },
    // 精英/小Boss
    casino_shark:   { kernel: 'shark',   archetype: 'muggle',    mood: 'calm',      desc: '赌场鲨鱼' },
    curse_dealer:   { kernel: 'shark',   archetype: 'cursed',    mood: 'confident', desc: '厄运荷官' },
    mind_reader:    { kernel: 'node5-boss',    archetype: 'esper',     mood: 'calm',      desc: '读心者' },
    // Boss
    chaos_lord:     { kernel: 'shark',   archetype: 'cursed',    mood: 'tilt',      desc: '混沌领主' },
    joker_wild:     { kernel: 'gambler', archetype: 'cursed',    mood: 'euphoric',  desc: '鬼牌——疯狂的混沌搅局者' }
  };



const MANA_LOW_RATIO = 0.3;

const REL_STAGE_ENT = [
    { min: 0, max: 19, name: '接触', desc: '刚建立基础接触。对方知道你是谁，但你仍是外部变量。' },
    { min: 20, max: 39, name: '熟络', desc: '接触开始重复。对方记得你的习惯与轮廓，但尚未纳入私人节奏。' },
    { min: 40, max: 59, name: '惯性', desc: '你的存在进入对方的日常惯性。她会默认你可能在场，并出现微小的顺手照看与行为调整。' },
    { min: 60, max: 79, name: '卷入', desc: '你的状态、去向与风险开始影响她的判断。你不再只是熟人，而是现实中的一个变量。' },
    { min: 80, max: 100, name: '嵌合', desc: '你的存在已深度嵌入她的日常与判断。缺席、失联、受损或流向改变，都会明显扰动她的现实结构。' }
  ];

const REL_STAGE_EX_BY_CHAR = {
    RINO: [
      { min: 0, max: 19, name: '占用', desc: '她主要仍把 Kazu 视作契约对象、避雷针与可支配资源。依赖已发生，但还完全被解释为主家使用下位者。' },
      { min: 20, max: 39, name: '固着', desc: '她意识到 Kazu 不是可替换的耗材，而是必须拴在身边的重要配置。依赖被包装成你归我管。' },
      { min: 40, max: 59, name: '偏移', desc: '她的情绪稳定、安全边界与行动策略开始明显围着 Kazu 偏移。嘴上仍端着，行为已开始让出重心。' },
      { min: 60, max: 79, name: '倒悬', desc: '名义主位仍在，现实主位已明显失真。她的命令越来越像请求的包装。' },
      { min: 80, max: 100, name: '覆位', desc: '关系实质已翻面。她仍可能傲慢、毒舌、主位不放，但自己的活法与命门已经压在 Kazu 身上。' }
    ],
    VV: [
      { min: 0, max: 19, name: '估值', desc: '识别异常价值，进行试探性观察。仍把 Kazu 当待评估标的。' },
      { min: 20, max: 39, name: '布局', desc: '开始埋优先权、接触权与软性控制通道。重在先手，不在占有显性化。' },
      { min: 40, max: 59, name: '增持', desc: '资源投入和维护意愿明显上升。你已成为重点配置对象。' },
      { min: 60, max: 79, name: '控盘', desc: '她要求你的流向、合作与收益开始进入她的掌控范围。排他性和主导权显著增强。' },
      { min: 80, max: 100, name: '锁仓', desc: '你成为不可共享、不可脱手的核心头寸。活着要在她账上，坏掉也要算她的。' }
    ],
    POPPY: [
      { min: 0, max: 19, name: '试附', desc: '将你视作潜在安全宿主，开始试探性挂靠。此时更像先蹭蹭看。' },
      { min: 20, max: 39, name: '贴靠', desc: '开始自然取用基础资源与安全。把贴着你走视作稳定生存方式。' },
      { min: 40, max: 59, name: '栖入', desc: '不只是蹭，而是开始嵌进你的日常分配、路线和口袋。宿主关系进入巢点形成。' },
      { min: 60, max: 79, name: '护食', desc: '开始对你及你提供的资源表现明显护食性。她不只挂着活，还开始守位置。' },
      { min: 80, max: 100, name: '共巢', desc: '你已成为她长期赖以存活的核心退路与活体巢穴。即使仍保留底层自保本能，她也已把活下去和挂在你这里绑定起来。' }
    ],
    KUZUHA: [
      { min: 0, max: 19, name: '容留', desc: '给你地方待，给你规矩管。债尚未成形，只是暂时收着。' },
      { min: 20, max: 39, name: '蓄养', desc: '开始给你稳定、安全和舒适感。不是单纯活下去，而是开始活得下来。' },
      { min: 40, max: 59, name: '累账', desc: '她让你逐渐意识到：住的、吃的、挡的、摆平的，都不是凭空来的。账感开始形成。' },
      { min: 60, max: 79, name: '留缚', desc: '庇护开始转化为留人结构。离开她，不再只是换地方，而是主动切断托底网络。' },
      { min: 80, max: 100, name: '圈留', desc: '她已不必明着说别走。债深到足以自成边界，缚也深到不需要锁。' }
    ],
    SIA: [
      { min: 0, max: 19, name: '看管', desc: '你仍主要是高危对象。她在职责范围内盯住、保全、控制风险。' },
      { min: 20, max: 39, name: '接手', desc: '她开始顺手接过与你有关的更多事务。仍可解释为执务延伸。' },
      { min: 40, max: 59, name: '收拢', desc: '她开始把与你有关的事情优先过自己这一关。别人来处理，在她看来逐渐不够稳。' },
      { min: 60, max: 79, name: '截留', desc: '她开始排斥别人接手你。流程开始被她个人判断压缩和截走。' },
      { min: 80, max: 100, name: '归管', desc: '你已成为她结构上不可轻易转交的私人责任对象。她未必承认那叫在意，但她已很难允许别人处理你。' }
    ],
    EULALIA: [
      { min: 0, max: 19, name: '留意', desc: '她记住你的特殊，但尚未真正把自己放过去。你像一道裂缝，而不是承载者。' },
      { min: 20, max: 39, name: '依凭', desc: '她开始局部地把你视作可短暂依凭的人。仍克制、仍圣职优先。' },
      { min: 40, max: 59, name: '安放', desc: '她开始把部分痛楚、疲惫与沉默放在你可触及的范围内。寄托真正成形。' },
      { min: 60, max: 79, name: '倚寄', desc: '她越来越自然地将安宁、减轻和无法对外言说的部分倚寄在你这里。你成为难以替代的承接点。' },
      { min: 80, max: 100, name: '系心', desc: '她并非坠入私欲，而是第一次真正把某些只属于自己的重量系在了另一个人身上。你不再只是偶然恩惠，而成为深层寄托之所。' }
    ],
    COTA: [
      { min: 0, max: 19, name: '路过', desc: '她会正常接待你，但和接待其他客人没有明显区别。你还只是她一天里经过的一位客人。'},
      { min: 20, max: 39, name: '认脸', desc: '她开始对你有一点印象。下次再见时，可能会先一步认出你，或多看一眼你是不是又坐回了原来的位置。'},
      { min: 40, max: 59, name: '记住', desc: '她会把和你有关的一些细节单独记住，比如座位、来过的时间、说过的话，接待时也会比平时多核对一步。'},
      { min: 60, max: 79, name: '单独对待', desc: '你已经和普通客人分开了。她面对你时会自然带出只针对你的区别，招待、判断和记忆都会更具体一些。'},
      { min: 80, max: 100, name: '留在她那里', desc: '你在她这里已经很难再被当成普通客人带过。她会稳定地把你和与你有关的细节单独留下，并在下一次见面时自然接上。'}
    ],
    KAKO: [
      { min: 0, max: 19, name: '备案', desc: '她先把你列为特管对象，而不是直接报死。此时保护仍是理性和系统安全导向。' },
      { min: 20, max: 39, name: '压件', desc: '她开始拖延、压住可能波及你的常规流程和清算箭头。你得到一点制度内的喘息空间。' },
      { min: 40, max: 59, name: '篡栏', desc: '她开始主动替你擦痕、修报表、改简报、伪造闭环。已明显触及渎职。' },
      { min: 60, max: 79, name: '斡旋', desc: '她开始顶住高层和外部压力，动用更多资源替你斡旋。她的偏袒逐渐在体制内形成明牌。' },
      { min: 80, max: 100, name: '共罪', desc: '她的职业底线与你的生死绑定。最懂规矩的事务长，成了你最绝对的同谋。' }
    ],
    TRIXIE: [
      { min: 0, max: 19, name: '猎奇', desc: '你是她弄不坏的新鲜玩具。她只是想戳一戳，看你会不会碎。' },
      { min: 20, max: 39, name: '逗弄', desc: '你成为她最大的乐子来源。她开始频繁乱入，把你的局面搅得更糟，只为了看戏。' },
      { min: 40, max: 59, name: '死锁', desc: '她的视线和兴趣开始彻底锚定你。接近你的人都会被她当作不配碰她的怪物。' },
      { min: 60, max: 79, name: '溃边', desc: '只要你想走向正常生活，她就会主动破坏你的安稳边界。恶性护食与自毁倾向开始显著。' },
      { min: 80, max: 100, name: '同殉', desc: '她已把你的存在与自己的毁灭绑死。在她的妄执里，拉你一起下地狱，就是最盛大的浪漫。' }
    ]
  };

const REL_META = {
    RINO: {
      cn: '反转度',
      intent: '牵连度高代表她习惯你在身边；反转度高代表她的现实主位已经在你面前悄悄塌了。',
      definition: '反转度衡量的是，在名义主仆关系维持不变的前提下，Rino 与 Kazu 之间的实际支配结构、依赖方向与情感支点向 Kazu 一侧倒置的程度。该数值不代表 Rino 是否变得服从、柔顺或坦率，而反映她是否越来越难以维持原本的上位者位置——包括生存依附的加深、主位幻觉的失真，以及将命门、安全感与现实判断逐步压到 Kazu 身上的趋势。'
    },
    VV: {
      cn: '控股度',
      intent: '牵连度高代表她和你接触多；控股度高代表她已经从结构上把你握在手里。',
      definition: '控股度衡量的是，V.V. 将 Kazu 视为专属核心资产，并试图垄断其使用权、收益权、流向控制权与风险处置权的程度。该数值不等同于花钱多少，也不等同于单纯占有欲，而反映她是否已开始通过资金、合同、资源配置、风险对冲与排他性安排，将 Kazu 纳入自身可控的资产结构。'
    },
    POPPY: {
      cn: '寄生度',
      intent: '牵连度高代表她和你很熟、很常一起行动；寄生度高代表她已经把你当宿主、当窝、当活路。',
      definition: '寄生度衡量的是，Poppy 是否将 Kazu 视为可附着、可取暖、可索取资源、可提供安全退路的稳定宿主，并逐步把自己嵌入其生活、物资与行动结构中的程度。该数值不等同于单纯依赖或撒娇，而反映她是否正在以底层生存逻辑将 Kazu 作为挂上去就能活得更稳的大型活体巢穴来使用，并在附着中形成护食性、排他性与生活嵌入。'
    },
    KUZUHA: {
      cn: '债缚度',
      intent: '牵连度高代表你习惯待在她那；债缚度高代表你已经欠到不方便走了。',
      definition: '债缚度衡量的是，Kuzuha 通过庇护、供养、规矩与恩义，将 Kazu 从暂时被容留在自己地盘的人，逐步变成被人情、资源与生存路径柔性束在自己身边的人的程度。该数值不等同于单纯照顾、宠爱或宽容，而反映她是否正在把自己给予的安全、退路与便利转化为一种难以结清、也越来越不方便摆脱的关系债。'
    },
    SIA: {
      cn: '接管度',
      intent: '牵连度高代表她习惯你在身边；接管度高代表她不愿再让别人的手碰到你的处理权。',
      definition: '接管度衡量的是，Sia 是否开始将 Kazu 从职责上必须监控与保全的高危对象，逐步转变为只能由自己处理、判断、收尾与保全的私人责任范围的程度。该数值不等同于单纯保护欲，而反映 Sia 是否越来越倾向于将 Kazu 的风险、行动与处置权纳入自身可控范围，并在必要时以个人判断替代标准流程。'
    },
    EULALIA: {
      cn: '寄托度',
      intent: '牵连度高代表你们接触稳定、关系近；寄托度高代表她已经把某些不能说的东西放在你这里。',
      definition: '寄托度衡量的是，Eulalia 是否开始将原本只能独自承担、只能向外施予、或从不允许留给自己的安宁、痛楚、祈愿与存在感，逐步安放在 Kazu 身上的程度。该数值不等同于单纯依赖、慰藉或私欲增长，而反映 Eulalia 是否已将 Kazu 视为一个能够反向承接自己的人——不仅承接她的灾厄与疼痛，也承接她作为并非只应服务众生的圣女而存在的那部分隐秘可能。'
    },
    COTA: {
      cn: '留存度',
      intent: '牵连度高代表你和她接触多；留存度高代表她开始把你从普通客人里单独记住。',
      definition: '留存度衡量的是，Cota 是否开始把原本会在日常接待中顺手带过的区别留下来，并让 Kazu 成为一个不会再被和其他客人等同处理的对象。该数值反映的不是故障、报错或单纯记忆增强，而是她是否会对 Kazu 多记一步、多核对一句，并在下一次见面时自然接上前一次的区别。'
    },
    KAKO: {
      cn: '包庇度',
      intent: '牵连度高代表她和你熟，互动稳定；包庇度高代表她已经开始为了你违法做账。',
      definition: '包庇度衡量的是，Kako 作为最懂系统致命性的人，主动利用公权、审计盲区与程序漏洞，将 Kazu 强行隐匿、偏袒并保护在清算红线之外的程度。该数值不等同于单纯好感或保护欲，而反映她是否越来越难以克制地公权私用——从最初仅仅为了系统安全而压下异常，逐步演变为为了保住你这个人，愿意在最严密的体制账本里不断制造合法的破绽，甚至把自己的职业生涯与命格也押上去。'
    },
    TRIXIE: {
      cn: '妄执度',
      intent: '牵连度高代表你们经常遇见、交集多；妄执度高代表即使不见面，她的精神也已经锁死在你身上。',
      definition: '妄执度衡量的是，Trixie 在确认 Kazu 是世上唯一无法被她轻易弄坏的特异点后，对其产生的极端锁定、破坏测试欲与同类拉扯感的程度。该数值绝不代表常人的爱意或温柔，而反映她是否开始将 Kazu 视为自己发狂世界中唯一的坐标，并拒绝他走向任何正常秩序、安稳日常与像个人一样活着的可能。'
    }
  };


const REL_DELTA_META = {
    RINO: {
      increaseMeaning: '反转度增加，代表 Rino 更难维持名义主位，现实判断、情绪稳定与生存支点更多压向 Kazu 一侧。',
      decreaseMeaning: '反转度减少，代表她重新收拢主位幻觉，把依赖重新包装并压回“我在支配你”的结构中，或主动拉开情感与现实支点。'
    },
    VV: {
      increaseMeaning: '控股度增加，代表 V.V. 不再只是看好 Kazu 的价值，而是进一步将其纳入自己的资产结构，强化独占、优先权、流向控制权与风险处置权。',
      decreaseMeaning: '控股度减少，代表她对 Kazu 的专属资产定位有所松动，开始降低投入、放松排他安排，或将其降级为高价值但非核心的标的。'
    },
    POPPY: {
      increaseMeaning: '寄生度增加，代表 Poppy 更明确地把 Kazu 当作宿主、窝、食物来源、保暖点与撤退线，并把自己的生存结构一点点挂进他的日常里。',
      decreaseMeaning: '寄生度减少，代表她重新把自保和撤退放回第一位，减少对 Kazu 的默认附着，不再把他视作唯一或主要的活体巢穴。'
    },
    KUZUHA: {
      increaseMeaning: '债缚度增加，代表 Kuzuha 给予 Kazu 的庇护、供养、便利与善后，越来越被组织成一种难还、难切、难离开的关系债。',
      decreaseMeaning: '债缚度减少，代表她暂时放松留人结构，让恩义不再持续累账，或允许 Kazu 在不额外背债的情况下保持更多独立性。'
    },
    SIA: {
      increaseMeaning: '接管度增加，代表 Sia 越来越不满足于“按职责看管”，而是把 Kazu 的风险、行动、日常与处置权逐步收进自己手里，形成私人责任范围。',
      decreaseMeaning: '接管度减少，代表她把 Kazu 重新放回标准监管流程，不再主动截留处理权，也不再默认“这件事归我”。'
    },
    EULALIA: {
      increaseMeaning: '寄托度增加，代表 Eulalia 开始把一些原本只会独自承受、独自压下或只会向外施予的东西，安静地放到 Kazu 这里，让他成为承接点。',
      decreaseMeaning: '寄托度减少，代表她重新把自己收回圣职结构里，把痛楚、愿望、疲惫和安宁重新封存为“我自己来承受”的部分。'
    },
    COTA: {
      increaseMeaning: '留存度增加，代表 Cota 开始把 Kazu 从普通客人里单独分出来。她会更容易记住和他有关的细节，在接待时多核对一步，并把这种区别带到下一次见面里。',
      decreaseMeaning: '留存度减少，代表 Cota 对 Kazu 的区别正在变淡。她仍会正常接待他，但那些只针对他的额外记忆和细节处理会慢慢回落，重新接近对普通客人的标准做法。'
    },
    KAKO: {
      increaseMeaning: '包庇度增加，代表 Kako 不只是因为系统安全而暂压异常，而是越来越主动地为了保住 Kazu 这个人，动用权限、流程漏洞和审计技巧进行制度性偏袒。',
      decreaseMeaning: '包庇度减少，代表她把自己从共犯位置往回收，减少人为遮掩和程序干预，让 Kazu 更接近被体制按标准方式处理。'
    },
    TRIXIE: {
      increaseMeaning: '妄执度增加，代表 Trixie 对 Kazu 的精神锁定更深，已不满足于逗弄和试坏，而开始把他视为自己世界里唯一不能失手、不能放走、不能正常活下去的核心坐标。',
      decreaseMeaning: '妄执度减少，代表她对 Kazu 的锁定暂时松动、被别的灾难或刺激分流，或短期内没有继续把全部视线钉死在他身上；这不等于恢复正常，只是死锁减弱。'
    }
  };

  global.ACE0TavernPluginData = Object.assign({}, global.ACE0TavernPluginData || {}, {
    REL_DELTA_META,
    REL_META,
    REL_STAGE_EX_BY_CHAR,
    REL_STAGE_ENT,
    MANA_LOW_RATIO,
    UNIVERSAL_SKILLS,
    VANGUARD_TRAIT_UNLOCK,
    REARGUARD_TRAIT_UNLOCK,
    MANA_BY_LEVEL,
    MINI_GAME_SKILLS,
    NAMED_CHARACTERS,
    NAMED_NPC_PRESETS,
    AI_KERNELS,
    DIFFICULTY_MENTAL_PRESETS,
    AI_STYLE_PRESETS,
    RPG_TEMPLATES,
    MOOD_MODIFIERS,
    RUNNER_PRESETS
  });
})(typeof window !== 'undefined' ? window : globalThis);
