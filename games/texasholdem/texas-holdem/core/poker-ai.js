/* global Hand, EquityEstimator */

/**
 * Core Module: PokerAI
 * 角色：德州行动决策与 NPC 技能倾向系统。
 *
 * 职责：
 * - 根据牌力、胜率、底池、压力与情绪决定 check / call / raise / fold
 * - 为 noob / regular / pro / boss 提供不同层级的理性与戏剧性
 * - 承接心理战修正、魔运净差修正与运行时角色 AI 修正
 * - 通过 `NpcRoleDirector` 为特定角色追加专属技能行为
 *
 * 暴露：
 * - `window.PokerAI`
 * - `window.SkillAI`
 *
 * 边界：
 * - 不负责技能注册与执行
 * - 不负责持续状态与资产账本
 */

(function(global) {
  'use strict';

  var RoleRuntime = global.RoleRuntime || {};
  var deriveRoleMeta = RoleRuntime.deriveRoleMeta || function(entity) {
    if (!entity) return { roleId: 'UNKNOWN', roleVariant: 'base' };
    return {
      roleId: entity.roleId || entity.name || entity.ownerName || 'UNKNOWN',
      roleVariant: entity.roleVariant || 'base'
    };
  };
  var NpcRoleDirector = global.NpcRoleDirector || {
    shouldUseSkill: function(input, fallback) {
      return fallback(input);
    }
  };

  const SUIT_MAP = { 0: 's', 1: 'h', 2: 'c', 3: 'd' };
  const RANK_MAP = { 1: 'A', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: 'T', 11: 'J', 12: 'Q', 13: 'K' };
  const PHASE_INDEX = {
    idle: -1,
    preflop: 0,
    flop: 1,
    turn: 2,
    river: 3,
    showdown: 4
  };
  const RIVER_INFO_SKILL_EFFECTS = {
    clarity: 1,
    refraction: 1,
    reversal: 1,
    heart_read: 1,
    clairvoyance: 1
  };

  const SPECIAL_DIFFICULTY_BASE = {
    kazu: 'pro',
    rino: 'boss',
    sia: 'boss',
    vv: 'boss',
    cota: 'pro',
    poppy: 'pro',
    kuzuha: 'boss',
    trixie: 'boss',
    eulalia: 'boss',
    kako: 'boss'
  };

  function normalizeDifficultyType(type) {
    const raw = String(type || 'regular').trim().toLowerCase();
    return SPECIAL_DIFFICULTY_BASE[raw] || raw || 'regular';
  }

  function clampNumber(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  // ========== 风险喜好配置 ==========
  // 零号王牌特调：平衡的生态系统，有鱼有鲨鱼
  const RISK_PROFILES = {
    rock: {
      description: '极度保守，只玩超强牌',
      entryThreshold: 55,      // 紧凑但不至于全弃
      raiseThreshold: 80,      // 加注门槛极高
      valueBetThreshold: 65,   // 价值下注门槛
      bluffFrequency: 0.03,    // 几乎不诈唱
      betSizeMultiplier: 0.6,  // 下注尺度保守
      callDownThreshold: 55    // 跟注到底的门槛高
    },
    balanced: {
      description: '平衡型，标准打法',
      entryThreshold: 30,      // 标准入场，愿意看翻牌
      raiseThreshold: 60,
      valueBetThreshold: 55,
      bluffFrequency: 0.12,    // 适度诈唱
      betSizeMultiplier: 0.7,
      callDownThreshold: 35
    },
    aggressive: {
      description: '激进型，喜欢加注施压',
      entryThreshold: 30,      // 较松
      raiseThreshold: 50,
      valueBetThreshold: 45,
      bluffFrequency: 0.22,    // 经常诈唱
      betSizeMultiplier: 0.9,  // 不要每次都满池
      callDownThreshold: 30
    },
    maniac: {
      description: '疯子型，极度激进，频繁诈唱',
      entryThreshold: 15,      // 很松但不是什么都玩
      raiseThreshold: 45,      // 提高：让他多 Call 少 Raise
      valueBetThreshold: 35,
      bluffFrequency: 0.35,    // 高频诈唱但不是一半
      betSizeMultiplier: 1.2,  // 降低：不要每次都超池
      callDownThreshold: 20
    },
    passive: {
      description: '跟注站，喜欢跟注但很少加注',
      entryThreshold: 10,      // 极松，什么烂牌都想看
      raiseThreshold: 90,      // 几乎不加注
      valueBetThreshold: 75,   // 只有超强牌才下注
      bluffFrequency: 0.02,    // 几乎不诈唱
      betSizeMultiplier: 0.4,
      callDownThreshold: 5     // 几乎不弃牌，终极鱼
    }
  };

  // ========== 难度等级配置 ==========
  const DIFFICULTY_PROFILES = {
    noob: {
      description: '小白，决策充满随机性',
      noiseRange: 25,           // 降低：之前45太高，导致把0分牌看成100分
      potOddsAwareness: 0.1,    // 几乎不懂赔率
      positionAwareness: 0.1,   // 位置意识 (0-1)
      valueBetAwareness: 0.3,   // 价值下注意识 (0-1)
      optimism: 15              // 降低：之前30太高，稍微乐观即可
    },
    regular: {
      description: '老鸟，懂基本策略',
      noiseRange: 15,
      potOddsAwareness: 0.6,
      positionAwareness: 0.5,
      valueBetAwareness: 0.7,
      optimism: 10              // 适度乐观
    },
    pro: {
      description: '专家，精准计算',
      noiseRange: 5,
      potOddsAwareness: 1.0,
      positionAwareness: 1.0,
      valueBetAwareness: 1.0,
      optimism: 0               // 理性，不幻想
    },
    boss: {
      description: 'Boss级，碾压+剧本',
      noiseRange: 3,
      potOddsAwareness: 1.0,
      positionAwareness: 1.0,
      valueBetAwareness: 1.0,
      optimism: 0
    }
  };

  // ========== 情绪状态配置 ==========
  // 情绪是叠加在 risk + difficulty 之上的运行时修正层
  // 所有值都是 delta（加减），应用于基础 profile 之上
  const EMOTION_PROFILES = {
    calm: {
      description: '冷静 — 无修正，标准状态',
      noiseDelta: 0,
      entryDelta: 0,
      raiseDelta: 0,
      bluffDelta: 0,
      betSizeDelta: 0,
      foldResistDelta: 0,     // 负值 = 更不容易弃牌
      optimismDelta: 0
    },
    confident: {
      description: '自信 — 连赢后膨胀，敢打敢冲但不失理智',
      noiseDelta: -3,          // 略微更精准
      entryDelta: -5,          // 入场门槛降低
      raiseDelta: -8,          // 更愿意加注
      bluffDelta: 0.05,        // 略增诈唬
      betSizeDelta: 0.15,      // 下注尺度增大
      foldResistDelta: -0.10,  // 更不容易弃牌
      optimismDelta: 5
    },
    tilt: {
      description: '上头 — 被 Bad Beat 后情绪失控，决策混乱',
      noiseDelta: 15,          // 判断力大幅下降
      entryDelta: -20,         // 什么牌都想玩
      raiseDelta: -15,         // 疯狂加注
      bluffDelta: 0.20,        // 大量诈唬
      betSizeDelta: 0.4,       // 下注尺度暴涨
      foldResistDelta: -0.25,  // 极度不愿弃牌
      optimismDelta: 20
    },
    fearful: {
      description: '恐惧 — 被大额下注吓到，畏手畏脚',
      noiseDelta: 5,
      entryDelta: 15,          // 入场门槛大幅提高
      raiseDelta: 20,          // 几乎不加注
      bluffDelta: -0.08,       // 不敢诈唬
      betSizeDelta: -0.2,      // 下注尺度缩小
      foldResistDelta: 0.15,   // 更容易弃牌
      optimismDelta: -10
    },
    desperate: {
      description: '绝望 — 筹码见底，孤注一掷',
      noiseDelta: 10,
      entryDelta: -15,         // 什么都想搏
      raiseDelta: -20,         // 频繁 All-in
      bluffDelta: 0.25,        // 大量诈唬（背水一战）
      betSizeDelta: 0.6,       // 下注尺度极大
      foldResistDelta: -0.20,  // 不愿弃牌
      optimismDelta: 15
    },
    euphoric: {
      description: '狂喜 — 刚赢大锅，飘飘然，容易轻敌',
      noiseDelta: 8,           // 注意力分散
      entryDelta: -10,         // 觉得自己无敌
      raiseDelta: -5,
      bluffDelta: 0.10,
      betSizeDelta: 0.2,
      foldResistDelta: -0.15,  // 不愿放弃好运
      optimismDelta: 12
    }
  };

  // ========== 工具函数 ==========
  function cardToString(card) {
    if (!card) return '';
    return RANK_MAP[card.rank] + SUIT_MAP[card.suit];
  }

  function evaluateHandStrength(holeCards, boardCards) {
    const allCards = [...holeCards, ...boardCards].map(cardToString);
    if (allCards.length < 2) return { rank: 0, name: 'Invalid' };
    
    try {
      const hand = Hand.solve(allCards);
      return { rank: hand.rank || 0, name: hand.name || 'Unknown' };
    } catch (e) {
      return { rank: 0, name: 'Invalid' };
    }
  }

  function evaluatePreflopStrength(holeCards) {
    if (holeCards.length < 2) return 0;
    
    const c1 = holeCards[0];
    const c2 = holeCards[1];
    const r1 = c1.rank === 1 ? 14 : c1.rank;
    const r2 = c2.rank === 1 ? 14 : c2.rank;
    const suited = c1.suit === c2.suit;
    const paired = r1 === r2;
    
    let score = 0;
    
    if (paired) {
      score = 50 + r1 * 3; // AA = 92, KK = 89, ...
    } else {
      const high = Math.max(r1, r2);
      const low = Math.min(r1, r2);
      score = high * 2 + low;
      if (suited) score += 10;
      const gap = high - low;
      if (gap === 1) score += 8;
      else if (gap === 2) score += 5;
      else if (gap === 3) score += 2;
      // Broadway 高张加分：两张都是 T+ 的非对子牌应该更强
      // AKs=72, AKo=62, AQs=69, KQs=66 — 更接近真实排名
      if (high >= 14 && low >= 13) score += 20; // AK
      else if (high >= 14 && low >= 12) score += 15; // AQ
      else if (high >= 14 && low >= 11) score += 12; // AJ
      else if (high >= 13 && low >= 12) score += 12; // KQ
      else if (high >= 14 && low >= 10) score += 8;  // AT
      else if (high >= 13 && low >= 11) score += 8;  // KJ
    }
    
    return Math.min(100, score);
  }

  // ========== 常量 ==========
  const ACTIONS = {
    FOLD: 'fold',
    CHECK: 'check',
    CALL: 'call',
    RAISE: 'raise',
    ALL_IN: 'allin'
  };

  // 牌型强度映射 (pokersolver rank -> 0-100 strength)
  const HAND_STRENGTH_MAP = {
    0: 5,    // Invalid
    1: 15,   // High Card - 很弱
    2: 45,   // Pair - 中等
    3: 60,   // Two Pair - 较强
    4: 75,   // Trips/Three of a Kind - 强
    5: 82,   // Straight - 很强
    6: 85,   // Flush - 很强
    7: 92,   // Full House - 极强
    8: 97,   // Quads - 坚果级
    9: 100   // Straight Flush - 无敌
  };

  // ========== 效用函数系统 (Utility System) ==========
  // 替代 if-else 瀑布，所有因素同时参与打分

  // 候选动作模板
  const ACTION_CANDIDATES = [
    { action: ACTIONS.FOLD,  sizing: null },
    { action: ACTIONS.CHECK, sizing: null },
    { action: ACTIONS.CALL,  sizing: null },
    { action: ACTIONS.RAISE, sizing: 'small'  },  // ~33% pot
    { action: ACTIONS.RAISE, sizing: 'medium' },  // ~66% pot
    { action: ACTIONS.RAISE, sizing: 'large'  },  // ~100% pot
    { action: ACTIONS.RAISE, sizing: 'allin'  }   // all-in
  ];

  // 四档权重向量: [手牌, 赔率, 位置, 对手, 魔运, 攻击]
  const UTILITY_WEIGHTS = {
    noob:    { hand: 0.70, potOdds: 0.05, position: 0.00, opponent: 0.00, magic: 0.05, aggro: 0.20 },
    regular: { hand: 0.40, potOdds: 0.20, position: 0.10, opponent: 0.00, magic: 0.15, aggro: 0.15 },
    pro:     { hand: 0.20, potOdds: 0.15, position: 0.10, opponent: 0.15, magic: 0.30, aggro: 0.10 },
    boss:    { hand: 0.25, potOdds: 0.15, position: 0.05, opponent: 0.10, magic: 0.25, aggro: 0.20 }
  };

  // Softmax 温度：越低越理性（几乎总选最优），越高越随机
  const TEMPERATURE = {
    noob:    2.0,
    regular: 1.0,
    pro:     0.5,
    boss:    0.3
  };

  const SCOUT_INFO_RANK = {
    force: 1,
    intent: 2,
    vague: 2,
    analysis: 3,
    perfect: 4
  };

  // 风险喜好对攻击倾向的修正
  const RISK_AGGRO_DELTA = {
    rock:       -0.10,
    balanced:    0.00,
    aggressive:  0.10,
    maniac:      0.20,
    passive:    -0.15
  };

  // 情绪对温度的修正
  const EMOTION_TEMP_DELTA = {
    calm: 0, confident: -0.1, tilt: 0.8, fearful: 0.3, desperate: 0.3, euphoric: 0.2
  };

  const INFO_SKILL_EFFECTS = {
    clarity: 1,
    refraction: 1,
    heart_read: 1,
    clairvoyance: 1
  };

  // ---- 评分函数 ----

  /**
   * 手牌评分：equity 越高，raise/call 越好；equity 低时 fold 好
   * @param {number} equity - 0~1 胜率
   * @param {string} action - 动作类型
   * @returns {number} -1 ~ +1
   */
  function scoreHand(equity, action) {
    if (action === ACTIONS.FOLD) {
      // equity 低时 fold 得分高，equity 高时 fold 得分极低
      return (1 - equity) * 0.6 - 0.3; // equity=0 → +0.3, equity=0.5 → 0, equity=1 → -0.3
    }
    if (action === ACTIONS.CHECK) {
      // check 是中性选择，弱牌时略好
      return 0.1 - equity * 0.15; // equity=0 → +0.1, equity=1 → -0.05
    }
    // call / raise: equity 越高越好
    const base = equity * 1.5 - 0.4; // equity=0 → -0.4, equity=0.5 → +0.35, equity=1 → +1.1
    return Math.max(-1, Math.min(1, base));
  }

  /**
   * 底池赔率评分：call 时赔率好=正分，赔率差=负分
   * @param {number} equity   - 0~1
   * @param {number} potOdds  - toCall / (pot + toCall)
   * @param {string} action
   * @param {number} toCall
   * @param {number} pot
   * @returns {number}
   */
  function scorePotOdds(equity, potOdds, action, toCall, pot) {
    if (action === ACTIONS.FOLD || action === ACTIONS.CHECK) return 0;
    if (action === ACTIONS.CALL) {
      // 赔率好 = equity > potOdds → 正分
      const edge = equity - potOdds;
      return Math.max(-1, Math.min(1, edge * 3));
    }
    // raise: 只有 equity 足够时才奖励加注，否则惩罚
    // equity < 0.35 时加注是负分（别用垃圾牌加注）
    const raiseEdge = equity - 0.35;
    return Math.max(-0.5, Math.min(0.5, raiseEdge * 2));
  }

  /**
   * 位置评分：后位 raise 加分，前位 raise 减分
   * @param {string} action
   * @param {number} opponents - 剩余对手数
   * @param {string} phase
   * @returns {number}
   */
  function scorePosition(action, opponents, phase) {
    if (action === ACTIONS.FOLD || action === ACTIONS.CHECK) return 0;
    // 简化：对手越少 = 位置越好（接近按钮位）
    // 多人局 raise 风险大
    const posBonus = Math.max(-0.3, 0.3 - opponents * 0.15);
    if (action === ACTIONS.CALL) return posBonus * 0.3;
    return posBonus; // raise 受位置影响更大
  }

  /**
   * 对手建模评分（pro/boss 专用，其他档位权重=0 所以不影响）
   * @param {object} ctx - 决策上下文
   * @param {string} action
   * @returns {number}
   */
  function scoreOpponent(ctx, action) {
    // 对手 mana 低 → raise 加分（没魔运反制）
    const oppManaRatio = ctx.opponentManaRatio != null ? ctx.opponentManaRatio : 0.5;
    if (action === ACTIONS.FOLD || action === ACTIONS.CHECK) return 0;
    if (action === ACTIONS.CALL) return 0;
    // raise 时，对手 mana 越低越好
    return (1 - oppManaRatio) * 0.5;
  }

  /**
   * 魔运态势评分：己方魔运优势 → raise 加分，劣势 → fold 加分
   * @param {number} magicLevel - 己方最高魔运等级 0~5
   * @param {number} netForce   - 净魔运力量（可为负）
   * @param {string} action
   * @returns {number}
   */
  function scoreMagic(magicLevel, netForce, action) {
    // 归一化到 -1 ~ +1
    const advantage = Math.tanh((netForce || 0) * 0.02 + (magicLevel || 0) * 0.1);
    if (action === ACTIONS.FOLD) {
      return -advantage * 0.5; // 魔运优势时 fold 得分低
    }
    if (action === ACTIONS.CHECK) {
      return -advantage * 0.2;
    }
    // call/raise: 魔运优势越大越好
    return advantage * 0.6;
  }

  /**
   * 攻击倾向评分：raise/allin 固定加分
   * @param {string} action
   * @param {string} sizing
   * @returns {number}
   */
  function scoreAggro(action, sizing) {
    if (action === ACTIONS.FOLD) return -0.3;
    if (action === ACTIONS.CHECK) return -0.1;
    if (action === ACTIONS.CALL) return 0;
    // raise 越大分越高
    if (sizing === 'small') return 0.2;
    if (sizing === 'medium') return 0.35;
    if (sizing === 'large') return 0.45;
    if (sizing === 'allin') return 0.55;
    return 0.3;
  }

  function getFoldManaPenalty(phase) {
    if (phase === 'preflop') return 18;
    if (phase === 'flop') return 12;
    if (phase === 'turn') return 6;
    return 0;
  }

  function scoreFoldResourcePenalty(context, action) {
    if (action !== ACTIONS.FOLD) return 0;
    const maxMana = Math.max(1, Number(context.maxMana || 0));
    const currentMana = Math.max(0, Number(context.currentMana || 0));
    const foldManaLoss = getFoldManaPenalty(context.phase);
    const lossRatio = foldManaLoss / maxMana;
    const currentRatio = currentMana / maxMana;
    const scarcityPenalty = currentRatio < 0.35 ? (0.35 - currentRatio) * 0.8 : 0;
    return -Math.min(1.25, lossRatio * 1.6 + scarcityPenalty);
  }

  // ---- Softmax ----

  function softmaxSelect(utilities, temperature) {
    const t = Math.max(0.1, temperature);
    const maxU = Math.max(...utilities);
    const exps = utilities.map(u => Math.exp((u - maxU) / t));
    const sumExp = exps.reduce((s, e) => s + e, 0);
    const probs = exps.map(e => e / sumExp);

    const r = Math.random();
    let cumulative = 0;
    for (let i = 0; i < probs.length; i++) {
      cumulative += probs[i];
      if (r <= cumulative) return { index: i, probs };
    }
    return { index: probs.length - 1, probs };
  }

  // ---- 下注尺度分档 ----

  /**
   * 根据难度档位计算下注金额
   * noob:    二极化（min-raise 或 all-in）
   * regular: 线性泄露（强牌大注弱牌小注）
   * pro:     固定比例 60-75% pot
   * boss:    反向欺骗（20% 概率强牌小注、弱牌大注）
   */
  function calculateBetSize(difficulty, sizing, equity, pot, stack, minRaise) {
    let amount;

    if (difficulty === 'noob') {
      // 二极化：min-raise 或随机大注，但不会随机梭哈
      if (sizing === 'allin') {
        amount = stack;
      } else if (Math.random() < 0.35) {
        // 偶尔下大注（2-3x pot），但不是 all-in
        amount = Math.floor(pot * (1.5 + Math.random() * 1.5));
      } else {
        amount = minRaise;
      }
    } else if (difficulty === 'regular') {
      // 线性泄露：equity 直接映射到下注比例（可被读）
      // equity 0.3 → 30% pot, equity 0.8 → 80% pot
      const sizingMap = { small: 0.33, medium: 0.66, large: 1.0, allin: 999 };
      const targetRatio = sizingMap[sizing] || 0.5;
      // 牌力修正：强牌自然下大注（泄露线索）
      const leakRatio = 0.3 + equity * 0.7;
      const finalRatio = Math.min(targetRatio, leakRatio);
      amount = sizing === 'allin' ? stack : Math.floor(pot * finalRatio);
    } else if (difficulty === 'pro') {
      // 固定比例但区分尺度：small/medium/large 真正映射到不同下注档
      if (sizing === 'allin') {
        amount = stack;
      } else {
        const rangeMap = {
          small:  [0.28, 0.40],
          medium: [0.48, 0.64],
          large:  [0.72, 0.92]
        };
        const range = rangeMap[sizing] || rangeMap.medium;
        const ratio = range[0] + Math.random() * (range[1] - range[0]);
        amount = Math.floor(pot * ratio);
      }
    } else {
      // boss: 反向欺骗，但仍保留尺度边界
      const invert = Math.random() < 0.20;
      const base = invert ? (1 - equity) : equity;
      if (sizing === 'allin') {
        amount = stack;
      } else {
        const rangeMap = {
          small:  [0.20, 0.38],
          medium: [0.45, 0.68],
          large:  [0.78, 1.05]
        };
        const range = rangeMap[sizing] || rangeMap.medium;
        const mix = Math.max(0, Math.min(1, base));
        const ratio = range[0] + (range[1] - range[0]) * mix;
        amount = Math.floor(pot * ratio);
      }
    }

    amount = Math.max(amount, minRaise);
    amount = Math.min(amount, stack);
    return amount;
  }

  // ========== 行为状态机 (Behavior FSM) ==========
  // 驱动效用权重和温度的动态变化
  // 状态由局中事件自动触发转移，不同难度有不同的状态集和衰减速度

  const FSM_STATES = {
    CAUTIOUS: 'cautious',   // 谨慎：基准状态
    HUNTING:  'hunting',    // 狩猎：赢了大锅后激进
    TILTED:   'tilted',     // 上头：被 Bad Beat 后混乱
    CORNERED: 'cornered'    // 被逼：筹码见底，孤注一掷
  };

  // 状态对效用权重和温度的修正
  const FSM_MODIFIERS = {
    cautious: { aggroDelta: 0,     tempDelta: 0,    label: '谨慎' },
    hunting:  { aggroDelta: 0.15,  tempDelta: -0.1, label: '狩猎' },
    tilted:   { aggroDelta: 0.35,  tempDelta: 0.8,  label: '上头' },
    cornered: { aggroDelta: 0.25,  tempDelta: 0.3,  label: '被逼' }
  };

  // 上头持续手数（按难度）
  const TILT_DURATION = {
    noob:    5,
    regular: 3,
    pro:     1,
    boss:    0   // boss 不会上头（用阶段脚本替代）
  };

  // 各难度可用的状态集
  const DIFFICULTY_STATES = {
    noob:    [FSM_STATES.CAUTIOUS, FSM_STATES.TILTED],                                          // 只有 2 态
    regular: [FSM_STATES.CAUTIOUS, FSM_STATES.HUNTING, FSM_STATES.TILTED, FSM_STATES.CORNERED], // 完整 4 态
    pro:     [FSM_STATES.CAUTIOUS, FSM_STATES.HUNTING, FSM_STATES.TILTED, FSM_STATES.CORNERED], // 完整 4 态
    boss:    [FSM_STATES.CAUTIOUS, FSM_STATES.HUNTING, FSM_STATES.CORNERED]                     // 3 态，无 tilt
  };

  class BehaviorFSM {
    /**
     * @param {string} difficulty - noob/regular/pro/boss
     * @param {number} initialChips - 起始筹码（用于判断 CORNERED）
     */
    constructor(difficulty, initialChips) {
      this.difficulty = difficulty || 'regular';
      this.state = FSM_STATES.CAUTIOUS;
      this.initialChips = initialChips || 1000;
      this.tiltCounter = 0;       // 上头剩余手数
      this.foldStreak = 0;        // 连续弃牌计数
      this.availableStates = DIFFICULTY_STATES[this.difficulty] || DIFFICULTY_STATES.regular;
    }

    /**
     * 获取当前状态的修正值
     * @returns {{ aggroDelta: number, tempDelta: number, state: string, label: string }}
     */
    getModifiers() {
      const mod = FSM_MODIFIERS[this.state] || FSM_MODIFIERS.cautious;
      return {
        aggroDelta: mod.aggroDelta,
        tempDelta: mod.tempDelta,
        state: this.state,
        label: mod.label
      };
    }

    /**
     * 手牌结束后触发事件，驱动状态转移
     * @param {string} event - 事件类型
     * @param {object} data  - 事件数据
     *
     * 事件类型:
     *   'win_big'    — 赢了大锅 (pot > 10×BB)        data: { pot, bb }
     *   'bad_beat'   — 被 Bad Beat (翻前领先但输)     data: {}
     *   'win_normal' — 普通赢                         data: {}
     *   'lose'       — 输了                           data: {}
     *   'fold'       — 弃牌                           data: {}
     *   'chip_check' — 每手结束检查筹码               data: { chips }
     */
    onEvent(event, data) {
      const prev = this.state;
      data = data || {};

      // 1. 上头衰减（每手 -1）
      if (this.tiltCounter > 0) {
        this.tiltCounter--;
        if (this.tiltCounter <= 0 && this.state === FSM_STATES.TILTED) {
          this.state = FSM_STATES.CAUTIOUS;
        }
      }

      // 2. 事件驱动转移
      switch (event) {
        case 'win_big':
          if (this._canEnter(FSM_STATES.HUNTING)) {
            this.state = FSM_STATES.HUNTING;
            this.foldStreak = 0;
          }
          break;

        case 'bad_beat':
          if (this._canEnter(FSM_STATES.TILTED)) {
            this.state = FSM_STATES.TILTED;
            this.tiltCounter = TILT_DURATION[this.difficulty] || 3;
            this.foldStreak = 0;
          }
          break;

        case 'win_normal':
          this.foldStreak = 0;
          // 赢了就从 CORNERED 恢复
          if (this.state === FSM_STATES.CORNERED) {
            this.state = FSM_STATES.CAUTIOUS;
          }
          // 赢了就从 HUNTING 回到 CAUTIOUS（一次性）
          // 不做：让 HUNTING 持续到下次输
          break;

        case 'lose':
          this.foldStreak = 0;
          // 输了就从 HUNTING 回到 CAUTIOUS
          if (this.state === FSM_STATES.HUNTING) {
            this.state = FSM_STATES.CAUTIOUS;
          }
          break;

        case 'fold':
          this.foldStreak++;
          // 连续弃牌 3 手 → 从 CAUTIOUS 切到 HUNTING（不耐烦）
          if (this.foldStreak >= 3 && this.state === FSM_STATES.CAUTIOUS) {
            if (this._canEnter(FSM_STATES.HUNTING)) {
              this.state = FSM_STATES.HUNTING;
              this.foldStreak = 0;
            }
          }
          break;

        case 'chip_check':
          // 筹码 < 30% 起始值 → CORNERED
          if (data.chips != null && data.chips < this.initialChips * 0.3) {
            if (this._canEnter(FSM_STATES.CORNERED) && this.state !== FSM_STATES.TILTED) {
              this.state = FSM_STATES.CORNERED;
            }
          }
          // 筹码恢复 > 50% → 脱离 CORNERED
          if (data.chips != null && data.chips >= this.initialChips * 0.5) {
            if (this.state === FSM_STATES.CORNERED) {
              this.state = FSM_STATES.CAUTIOUS;
            }
          }
          break;
      }

      // 3. 日志
      if (this.state !== prev) {
        console.log('[FSM] ' + prev + ' → ' + this.state +
          ' (event=' + event + ' diff=' + this.difficulty + ')');
      }
    }

    /**
     * 检查该难度是否可以进入某状态
     */
    _canEnter(state) {
      return this.availableStates.indexOf(state) !== -1;
    }

    /**
     * 重置（新一局）
     */
    reset(initialChips) {
      this.state = FSM_STATES.CAUTIOUS;
      this.tiltCounter = 0;
      this.foldStreak = 0;
      if (initialChips != null) this.initialChips = initialChips;
    }
  }

  // ========== Boss 阶段脚本 (Phase 6) ==========
  // Boss 不用通用 FSM，而是按筹码阶段执行预设脚本
  // 三阶段：从容(>70%) → 认真(30-70%) → 狂暴(<30%)

  const BOSS_PHASES = {
    COMPOSED: 'composed',   // 从容：像 pro 一样精准
    SERIOUS:  'serious',    // 认真：加大魔运投入
    ENRAGED:  'enraged'     // 狂暴：全力输出
  };

  const BOSS_PHASE_MODIFIERS = {
    composed: { aggroDelta: 0,    tempDelta: 0,    magicDelta: 0,    handFloor: 45, label: '从容' },
    serious:  { aggroDelta: 0.15, tempDelta: -0.05, magicDelta: 0.10, handFloor: 50, label: '认真' },
    enraged:  { aggroDelta: 0.30, tempDelta: -0.15, magicDelta: 0.20, handFloor: 60, label: '狂暴' }
  };

  class BossScript {
    constructor(initialChips) {
      this.initialChips = initialChips || 1000;
      this.phase = BOSS_PHASES.COMPOSED;
      this.weaknessTiltCounter = 0; // 弱点触发后的 tilt 手数
    }

    /**
     * 根据当前筹码更新阶段
     * @param {number} chips - 当前筹码
     */
    updatePhase(chips) {
      const prev = this.phase;
      const ratio = chips / Math.max(1, this.initialChips);

      if (ratio > 0.70) {
        this.phase = BOSS_PHASES.COMPOSED;
      } else if (ratio > 0.30) {
        this.phase = BOSS_PHASES.SERIOUS;
      } else {
        this.phase = BOSS_PHASES.ENRAGED;
      }

      // 弱点 tilt 衰减
      if (this.weaknessTiltCounter > 0) {
        this.weaknessTiltCounter--;
      }

      if (this.phase !== prev) {
        console.log('[BossScript] ' + prev + ' → ' + this.phase +
          ' (chips=' + chips + ' ratio=' + (ratio * 100).toFixed(0) + '%)');
      }
    }

    /**
     * 弱点触发：Boss 被特定技能反制后陷入动摇
     * @param {number} duration - 动摇持续手数
     */
    triggerWeakness(duration) {
      this.weaknessTiltCounter = duration || 2;
      console.log('[BossScript] WEAKNESS TRIGGERED! tilt for ' + this.weaknessTiltCounter + ' hands');
    }

    /**
     * 获取当前阶段的修正值
     * 弱点触发时覆盖为 tilt 模式
     */
    getModifiers() {
      // 弱点 tilt 覆盖一切
      if (this.weaknessTiltCounter > 0) {
        return {
          aggroDelta: 0.30,
          tempDelta: 1.5,       // 温度暴涨 → 随机
          magicDelta: -0.20,    // 魔运权重暴跌
          handFloor: 30,        // 手牌保底降低
          phase: 'weakness',
          label: '动摇'
        };
      }

      const mod = BOSS_PHASE_MODIFIERS[this.phase] || BOSS_PHASE_MODIFIERS.composed;
      return {
        aggroDelta: mod.aggroDelta,
        tempDelta: mod.tempDelta,
        magicDelta: mod.magicDelta,
        handFloor: mod.handFloor,
        phase: this.phase,
        label: mod.label
      };
    }

    reset(initialChips) {
      this.phase = BOSS_PHASES.COMPOSED;
      this.weaknessTiltCounter = 0;
      if (initialChips != null) this.initialChips = initialChips;
    }
  }

  // ========== 对手建模 (Phase 7) ==========
  // pro/boss 专用：追踪对手行为模式，影响 scoreOpponent 评分
  // 注意：1-3 手对局中数据极少，权重本身就低 (pro:0.15, boss:0.10)
  // 更多是"感觉 AI 在观察你"的叙事工具

  class OpponentModel {
    constructor() {
      // 每个对手的统计数据，按 playerId 索引
      this.stats = {};
    }

    /**
     * 获取或初始化某对手的统计
     */
    _getStats(playerId) {
      if (!this.stats[playerId]) {
        this.stats[playerId] = {
          handsPlayed: 0,
          vpipCount: 0,       // 主动入池次数
          pfrCount: 0,        // 翻前加注次数
          aggActions: 0,      // 攻击性动作（raise/allin）
          totalActions: 0,    // 总动作数
          foldToBetCount: 0,  // 面对下注弃牌次数
          facedBetCount: 0,   // 面对下注次数
          lastAction: null,
          lastBetSize: 0
        };
      }
      return this.stats[playerId];
    }

    /**
     * 记录对手的一个动作
     * @param {number} playerId
     * @param {string} action - fold/check/call/raise/allin
     * @param {object} ctx - { phase, toCall, amount, pot }
     */
    recordAction(playerId, action, ctx) {
      const s = this._getStats(playerId);
      s.totalActions++;
      s.lastAction = action;

      if (ctx && ctx.phase === 'preflop') {
        if (action === 'call' || action === 'raise' || action === 'allin') {
          s.vpipCount++;
        }
        if (action === 'raise' || action === 'allin') {
          s.pfrCount++;
        }
      }

      if (action === 'raise' || action === 'allin') {
        s.aggActions++;
        s.lastBetSize = ctx ? ctx.amount || 0 : 0;
      }

      if (ctx && ctx.toCall > 0) {
        s.facedBetCount++;
        if (action === 'fold') {
          s.foldToBetCount++;
        }
      }
    }

    /**
     * 记录一手结束（增加 handsPlayed）
     */
    recordHandEnd(playerId) {
      const s = this._getStats(playerId);
      s.handsPlayed++;
    }

    /**
     * 获取对手的行为画像
     * @param {number} playerId
     * @returns {{ vpip, pfr, aggFreq, foldToBet, handsPlayed }}
     */
    getProfile(playerId) {
      const s = this._getStats(playerId);
      const hands = Math.max(1, s.handsPlayed);
      const actions = Math.max(1, s.totalActions);
      const faced = Math.max(1, s.facedBetCount);

      return {
        vpip:       s.vpipCount / hands,
        pfr:        s.pfrCount / hands,
        aggFreq:    s.aggActions / actions,
        foldToBet:  s.foldToBetCount / faced,
        handsPlayed: s.handsPlayed,
        lastAction: s.lastAction,
        lastBetSize: s.lastBetSize
      };
    }

    /**
     * 计算对手建模评分（替代原来的静态 scoreOpponent）
     * @param {number} playerId - 主要对手 ID（筹码最多的活跃对手）
     * @param {number} oppManaRatio - 对手平均 mana 百分比
     * @param {string} action - 候选动作
     * @returns {number} -1 ~ +1
     */
    score(playerId, oppManaRatio, action) {
      if (action === ACTIONS.FOLD || action === ACTIONS.CHECK) return 0;

      const profile = this.getProfile(playerId);
      let bonus = 0;

      // 对手容易弃牌 → raise 加分
      if (profile.foldToBet > 0.5 && profile.handsPlayed >= 2) {
        bonus += (profile.foldToBet - 0.3) * 0.6;
      }

      // 对手很激进 → call 加分（让他犯错），raise 减分
      if (profile.aggFreq > 0.5 && profile.handsPlayed >= 2) {
        if (action === ACTIONS.CALL) {
          bonus += (profile.aggFreq - 0.3) * 0.4;
        } else {
          bonus -= 0.1; // 对激进对手 raise 风险高
        }
      }

      // 对手 mana 低 → raise 加分（没魔运反制）
      if (oppManaRatio != null) {
        bonus += (1 - oppManaRatio) * 0.3;
      }

      return Math.max(-1, Math.min(1, bonus));
    }

    reset() {
      this.stats = {};
    }
  }

  // ========== PokerAI 类 ==========
  class PokerAI {
    /**
     * @param {Object} personality - 个性配置
     * @param {string} personality.riskAppetite - 风险喜好: rock/balanced/aggressive/maniac/passive
     * @param {string} personality.difficulty - 难度等级: noob/regular/pro/boss 或专属 profile（如 sia）
     * @param {string} personality.emotion - 情绪状态: calm/confident/tilt/fearful/desperate/euphoric
     */
    constructor(personality = {}) {
      const riskType = personality.riskAppetite || 'balanced';
      const difficultyProfile = personality.difficulty || 'regular';
      const difficultyType = normalizeDifficultyType(difficultyProfile);
      const emotionType = personality.emotion || 'calm';
      const roleMeta = deriveRoleMeta(personality);
      
      this.riskBase = RISK_PROFILES[riskType] || RISK_PROFILES.balanced;
      this.difficultyBase = DIFFICULTY_PROFILES[difficultyType] || DIFFICULTY_PROFILES.regular;
      this.emotion = EMOTION_PROFILES[emotionType] || EMOTION_PROFILES.calm;
      this.riskType = riskType;
      this.difficultyProfile = difficultyProfile;
      this.difficultyType = difficultyType;
      this.emotionType = emotionType;
      this.roleId = roleMeta.roleId;
      this.roleVariant = roleMeta.roleVariant;
      
      // 合并：基础 profile + 情绪 delta
      this.risk = this._applyEmotion(this.riskBase, this.emotion);
      this.difficulty = this._applyEmotionDifficulty(this.difficultyBase, this.emotion);

      // 行为状态机（Phase 4）
      this.fsm = new BehaviorFSM(difficultyType);

      // Boss 阶段脚本（Phase 6）— 仅 boss 难度
      this.bossScript = difficultyType === 'boss' ? new BossScript() : null;

      // 对手建模（Phase 7）— pro/boss 专用
      this.opponentModel = (difficultyType === 'pro' || difficultyType === 'boss')
        ? new OpponentModel() : null;
      this.scoutMemory = [];
    }

    /**
     * 运行时切换情绪（不重建实例）
     * @param {string} emotionType - 新情绪
     */
    setEmotion(emotionType) {
      this.emotionType = emotionType;
      this.emotion = EMOTION_PROFILES[emotionType] || EMOTION_PROFILES.calm;
      this.risk = this._applyEmotion(this.riskBase, this.emotion);
      this.difficulty = this._applyEmotionDifficulty(this.difficultyBase, this.emotion);
    }

    resetScoutMemory() {
      this.scoutMemory = [];
    }

    rememberScoutIntel(intel) {
      if (!intel || intel.targetId == null) return;
      if (!this.scoutMemory) this.scoutMemory = [];
      const rank = SCOUT_INFO_RANK[intel.infoLevel] || 0;
      const key = String(intel.targetId) + ':' + String(intel.sourceSkill || 'unknown');
      let replaced = false;
      for (let i = 0; i < this.scoutMemory.length; i++) {
        const entry = this.scoutMemory[i];
        const entryKey = String(entry.targetId) + ':' + String(entry.sourceSkill || 'unknown');
        if (entryKey !== key) continue;
        const prevRank = SCOUT_INFO_RANK[entry.infoLevel] || 0;
        if (rank > prevRank || ((intel.confidence || 0) >= (entry.confidence || 0))) {
          this.scoutMemory[i] = Object.assign({}, entry, intel);
        }
        replaced = true;
        break;
      }
      if (!replaced) this.scoutMemory.push(intel);
      if (this.scoutMemory.length > 16) this.scoutMemory = this.scoutMemory.slice(-16);
    }

    _buildSpecialDifficultyMods(context, phase, rawStrength, equity, toCall, aiStack, pot) {
      const profile = String(this.difficultyProfile || '').trim().toLowerCase();
      const mods = {
        label: '',
        entryDelta: 0,
        raiseDelta: 0,
        callDownDelta: 0,
        aggroDelta: 0,
        tempDelta: 0,
        foldBias: 0,
        checkBias: 0,
        callBias: 0,
        raiseBias: 0,
        magicWeightDelta: 0,
        raiseCap: null,
        desperationAllIn: false
      };
      if (profile !== 'poppy') return mods;

      const initialChips = Math.max(1, this.fsm && this.fsm.initialChips ? this.fsm.initialChips : (context && context.aiStack) || 1);
      const chipRatio = clampNumber((aiStack || 0) / initialChips, 0, 3);
      const pressureRatio = toCall > 0 ? toCall / Math.max(1, aiStack || 1) : 0;

      mods.label = chipRatio <= 0.20 ? '命悬一线' : (chipRatio <= 0.50 ? '低血舒适区' : '稳住别送');
      mods.magicWeightDelta = chipRatio <= 0.50 ? 0.08 : 0.03;

      if (chipRatio > 0.70) {
        mods.entryDelta = 8;
        mods.raiseDelta = 12;
        mods.callDownDelta = 6;
        mods.checkBias = 0.10;
        mods.foldBias = toCall > 0 ? 0.14 : 0;
        mods.raiseBias = -0.14;
        mods.tempDelta = -0.05;
        mods.raiseCap = 'medium';
        return mods;
      }

      if (chipRatio > 0.50) {
        mods.entryDelta = 3;
        mods.raiseDelta = 6;
        mods.callDownDelta = 2;
        mods.checkBias = 0.06;
        mods.raiseBias = -0.08;
        mods.raiseCap = 'medium';
        return mods;
      }

      if (chipRatio > 0.20) {
        mods.entryDelta = -10;
        mods.raiseDelta = -4;
        mods.callDownDelta = -14;
        mods.aggroDelta = -0.03;
        mods.tempDelta = -0.08;
        mods.foldBias = -0.22;
        mods.checkBias = 0.12;
        mods.callBias = 0.18;
        mods.raiseBias = phase === 'river' && rawStrength >= 55 ? 0.12 : -0.06;
        mods.raiseCap = 'medium';
        return mods;
      }

      mods.entryDelta = -16;
      mods.raiseDelta = -8;
      mods.callDownDelta = -22;
      mods.aggroDelta = -0.02;
      mods.tempDelta = -0.12;
      mods.foldBias = -0.42;
      mods.checkBias = pressureRatio > 0 ? -0.04 : 0.02;
      mods.callBias = 0.24;
      mods.raiseBias = (phase === 'turn' || phase === 'river' || pressureRatio >= 0.30) ? 0.10 : -0.05;
      mods.raiseCap = (phase === 'river' && (equity >= 0.62 || rawStrength >= 62)) ? 'large' : 'medium';
      mods.desperationAllIn = true;
      return mods;
    }

    _buildScoutModifiers(context, rawStrength, phase) {
      const mods = {
        equityDelta: 0,
        raiseBias: 0,
        callBias: 0,
        foldBias: 0,
        checkBias: 0,
        notes: []
      };
      if (!this.scoutMemory || this.scoutMemory.length === 0) return mods;

      const boardCards = context.boardCards || [];
      const toCall = context.toCall || 0;
      const relevant = this.scoutMemory.filter(entry => {
        return context.opponentProfiles && context.opponentProfiles.some(function(opp) { return opp.id === entry.targetId; });
      });
      if (relevant.length === 0) return mods;

      for (let i = 0; i < relevant.length; i++) {
        const entry = relevant[i];
        const confidence = Math.max(0.15, Math.min(1, entry.confidence || 0.5));
        const level = entry.infoLevel || 'intent';
        const targetName = entry.targetName || ('ID:' + entry.targetId);

        if (level === 'perfect' || level === 'analysis' || level === 'vague') {
          let oppStrength = entry.observedStrength;
          if (level === 'perfect' && entry.knownCards && entry.knownCards.length >= 2 && phase !== 'preflop') {
            oppStrength = this.calculateRawStrength(entry.knownCards, boardCards, phase);
          } else if (oppStrength == null) {
            oppStrength = entry.preflopStrength != null ? entry.preflopStrength : 35;
          }

          const diff = rawStrength - oppStrength;
          if (diff <= -25) {
            mods.equityDelta -= 0.12 * confidence;
            mods.raiseBias -= 0.90 * confidence;
            mods.callBias -= 0.35 * confidence;
            mods.foldBias += 0.45 * confidence;
            mods.checkBias += toCall === 0 ? 0.25 * confidence : 0;
            mods.notes.push('seen_strong:' + targetName);
          } else if (diff <= -10) {
            mods.equityDelta -= 0.06 * confidence;
            mods.raiseBias -= 0.45 * confidence;
            mods.callBias -= 0.15 * confidence;
            mods.foldBias += 0.20 * confidence;
            mods.notes.push('seen_ahead:' + targetName);
          } else if (diff >= 25) {
            mods.equityDelta += 0.10 * confidence;
            mods.raiseBias += 0.50 * confidence;
            mods.callBias += 0.18 * confidence;
            mods.notes.push('seen_weak:' + targetName);
          } else if (diff >= 10) {
            mods.equityDelta += 0.04 * confidence;
            mods.raiseBias += 0.20 * confidence;
            mods.notes.push('seen_edge:' + targetName);
          }
        } else if (level === 'intent') {
          const bluffScore = Math.max(-1, Math.min(1, entry.bluffScore || 0));
          const pressureScore = Math.max(0, Math.min(1, entry.pressureScore || 0));
          mods.equityDelta += bluffScore * 0.05 * confidence;
          mods.raiseBias += bluffScore > 0 ? 0.12 * confidence : -0.08 * confidence;
          mods.callBias += bluffScore * 0.08 * confidence;
          mods.foldBias += bluffScore < 0 ? 0.12 * confidence : 0;
          mods.checkBias += pressureScore > 0.6 && toCall === 0 ? 0.08 * confidence : 0;
          mods.notes.push('intent:' + targetName);
        } else if (level === 'force') {
          const danger = Math.max(0, Math.min(1, (entry.enemyThreatPower || 0) / 40));
          mods.raiseBias -= 0.15 * danger * confidence;
          mods.callBias -= 0.05 * danger * confidence;
          mods.checkBias += 0.10 * danger * confidence;
          mods.notes.push('force:' + targetName);
        }
      }

      mods.equityDelta = Math.max(-0.18, Math.min(0.18, mods.equityDelta));
      mods.raiseBias = Math.max(-1.4, Math.min(1.0, mods.raiseBias));
      mods.callBias = Math.max(-0.7, Math.min(0.7, mods.callBias));
      mods.foldBias = Math.max(-0.3, Math.min(0.9, mods.foldBias));
      mods.checkBias = Math.max(-0.3, Math.min(0.9, mods.checkBias));
      return mods;
    }

    _applyEmotion(base, emo) {
      return {
        description: base.description,
        entryThreshold:    Math.max(0, Math.min(100, base.entryThreshold + (emo.entryDelta || 0))),
        raiseThreshold:    Math.max(0, Math.min(100, base.raiseThreshold + (emo.raiseDelta || 0))),
        valueBetThreshold: Math.max(0, Math.min(100, base.valueBetThreshold + (emo.raiseDelta || 0) * 0.5)),
        bluffFrequency:    Math.max(0, Math.min(0.8, base.bluffFrequency + (emo.bluffDelta || 0))),
        betSizeMultiplier: Math.max(0.2, base.betSizeMultiplier + (emo.betSizeDelta || 0)),
        callDownThreshold: Math.max(0, Math.min(100, base.callDownThreshold + (emo.entryDelta || 0) * 0.5))
      };
    }

    _applyEmotionDifficulty(base, emo) {
      return {
        description: base.description,
        // 🔧 理性上限：noiseRange 最高 35（防止 noob+tilt=40 导致完全随机）
        noiseRange:        Math.min(35, Math.max(0, base.noiseRange + (emo.noiseDelta || 0))),
        potOddsAwareness:  Math.max(0, Math.min(1, base.potOddsAwareness - (emo.noiseDelta || 0) * 0.01)),
        positionAwareness: base.positionAwareness,
        valueBetAwareness: Math.max(0, Math.min(1, base.valueBetAwareness - (emo.noiseDelta || 0) * 0.02)),
        // 🔧 理性上限：optimism 最高 25（防止 noob+tilt=35 让垃圾牌看起来像中等牌）
        optimism:          Math.min(25, Math.max(0, base.optimism + (emo.optimismDelta || 0)))
      };
    }

    /**
     * 做出决策 — 效用函数版
     * @param {Object} context - 决策上下文
     */
    decide(context) {
      const { holeCards, boardCards, pot, toCall, aiStack, phase, minRaise, activeOpponentCount } = context;
      const playerName = context.playerName || '?';
      const magicLevel = context.magicLevel || 0;
      const netForce = context.netForce || 0;
      const opponents = activeOpponentCount || 1;
      const raiseCount = context.raiseCount || 0;

      // 0. 心理修正：累积技能池效果 × 定力放大系数
      const mods = context.mentalModifiers;
      const origRisk = this.risk;
      const origDiff = this.difficulty;
      if (mods) {
        this.risk = Object.assign({}, this.risk);
        this.difficulty = Object.assign({}, this.difficulty);
        const cr = mods.composureRatio;
        const stack = mods.pressureStack || { presence: 0, taunt: 0, probe: 0 };

        // 定力放大系数
        let multiplier = 1.0;
        if (cr < 0.12) multiplier = 5.0;
        else if (cr < 0.30) multiplier = 3.0;
        else if (cr < 0.55) multiplier = 1.8;
        else multiplier = 0.4;

        console.log('[Mental AI] ' + playerName + ' cr=' + cr.toFixed(2) + ' mult=' + multiplier + ' stack=' + JSON.stringify(stack));

        // 压场累积效果：更保守、更畏惧
        if (stack.presence > 0) {
          const intensity = Math.min(stack.presence / 30, 4);
          this.risk.entryThreshold *= (1 + 0.20 * intensity * multiplier);
          this.risk.callDownThreshold *= (1 + 0.25 * intensity * multiplier);
          this.risk.raiseThreshold *= (1 + 0.5 * intensity * multiplier);
          this.risk.bluffFrequency *= Math.max(0.2, 1 - 0.25 * intensity * multiplier);
          this.difficulty.optimism -= 15 * intensity * multiplier;
          console.log('[Mental AI] presence intensity=' + intensity.toFixed(2) +
            ' entry×' + (1 + 0.20 * intensity * multiplier).toFixed(2) +
            ' callDown×' + (1 + 0.25 * intensity * multiplier).toFixed(2));
        }

        // 挑衅累积效果：更激进、更冲动
        if (stack.taunt > 0) {
          const intensity = Math.min(stack.taunt / 30, 4);
          const tauntCallFactor = Math.max(0.55, 1 - 0.28 * intensity * multiplier);
          const tauntRaiseFactor = Math.max(0.70, 1 - 0.18 * intensity * multiplier);
          const tauntBluffFactor = Math.min(1.65, 1 + 0.35 * intensity * multiplier);
          this.risk.callDownThreshold *= tauntCallFactor;
          this.risk.raiseThreshold *= tauntRaiseFactor;
          this.risk.bluffFrequency *= tauntBluffFactor;
          this.difficulty.optimism += 20 * intensity * multiplier;
          console.log('[Mental AI] taunt intensity=' + intensity.toFixed(2) +
            ' callDown×' + tauntCallFactor.toFixed(2) +
            ' raise×' + tauntRaiseFactor.toFixed(2));
        }

        // 试探累积效果：判断力下降
        if (stack.probe > 0) {
          const intensity = Math.min(stack.probe / 30, 4);
          this.difficulty.noiseRange += 25 * intensity * multiplier;
          this.difficulty.potOddsAwareness *= (1 - 0.3 * intensity * multiplier);
          this.difficulty.optimism += 10 * intensity * multiplier;
          console.log('[Mental AI] probe intensity=' + intensity.toFixed(2) + ' noiseRange+' + (25 * intensity * multiplier).toFixed(0));
        }

        // 定力状态通用影响
        if (cr < 0.15) {
          this.risk.entryThreshold *= 1.35;
          this.risk.callDownThreshold *= 1.50;
          this.risk.raiseThreshold *= 1.30;
        }
        else if (cr < 0.40) {
          this.risk.entryThreshold *= 1.15;
          this.risk.callDownThreshold *= 1.20;
          this.risk.raiseThreshold *= 1.10;
        }
      }

      // 1. 胜率评估 — 分档
      let equity;
      const rawStrength = this.calculateRawStrength(holeCards, boardCards, phase);

      if (this.difficultyType === 'noob') {
        // noob: 查表（只看自己牌，不懂公共牌纹理的精确影响）
        equity = rawStrength / 100;
      } else if (typeof EquityEstimator !== 'undefined') {
        // regular+: 蒙特卡洛
        if (this.difficultyType === 'pro' || this.difficultyType === 'boss') {
          const mc = EquityEstimator.estimateWithMagic(holeCards, boardCards || [], opponents, netForce, 200);
          equity = mc.perceivedEquity;
        } else {
          const mc = EquityEstimator.estimate(holeCards, boardCards || [], opponents, 200);
          equity = mc.equity;
        }
      } else {
        // fallback: 查表
        equity = rawStrength / 100;
      }

      // 1.2 pro/boss 读牌加成：识别弱手对手的虚张声势
      let readBonus = 0;
      if ((this.difficultyType === 'pro' || this.difficultyType === 'boss') && toCall > 0) {
        readBonus = this._estimateReadBonus(context);
        if (phase !== 'preflop') {
          if (rawStrength < 18) readBonus = Math.min(readBonus, 0.02);
          else if (rawStrength < 25) readBonus = Math.min(readBonus, 0.04);
        }
        equity = Math.min(0.95, equity + readBonus);
      }

      // 1.3 心理战胜率偏移：equityBias影响感知胜率
      if (mods && mods.equityBias) {
        equity = Math.max(0.01, Math.min(0.99, equity + mods.equityBias / 100));
      }

      // 1.3 魔运勇气加成：己方净魔运力量越高，越有信心留在牌局
      let magicBonus = 0;
      if ((this.difficultyType === 'pro' || this.difficultyType === 'boss') && netForce > 0) {
        // netForce=10 → +3%, netForce=30 → +8%, netForce=50 → +12%
        magicBonus = Math.min(0.15, netForce * 0.0025);
        equity = Math.min(0.95, equity + magicBonus);
      }

      // 1.5 获取手牌名称（用于日志）
      let handName = phase === 'preflop' ? 'Preflop' : '?';
      let handRank = phase === 'preflop' ? 0 : 1;
      if (phase !== 'preflop' && boardCards && boardCards.length > 0) {
        try {
          const hr = evaluateHandStrength(holeCards, boardCards);
          handName = hr.name || '?';
          handRank = hr.rank || 1;
        } catch (e) { handName = '?'; }
      }

      const scoutMods = this._buildScoutModifiers(context, rawStrength, phase);
      if (scoutMods.equityDelta) {
        equity = Math.max(0.01, Math.min(0.99, equity + scoutMods.equityDelta));
      }

      // 2. 构建可用候选动作（equity 用于硬性门控 all-in）
      const candidates = this._buildCandidates(toCall, aiStack, minRaise, pot, equity, phase, rawStrength, magicLevel, netForce);

      // 3. 计算每个候选动作的效用分
      const potOdds = toCall > 0 ? toCall / (pot + toCall) : 0;
      const w = Object.assign({}, UTILITY_WEIGHTS[this.difficultyType] || UTILITY_WEIGHTS.regular);
      const riskAggroDelta = RISK_AGGRO_DELTA[this.riskType] || 0;

      // FSM 状态修正
      const fsmMod = this.fsm.getModifiers();
      let aggroDelta = riskAggroDelta + fsmMod.aggroDelta;
      let extraTempDelta = fsmMod.tempDelta;

      // Boss 阶段脚本修正（覆盖 FSM 的部分效果）
      let bossLabel = '';
      if (this.bossScript) {
        this.bossScript.updatePhase(aiStack);
        const bossMod = this.bossScript.getModifiers();
        aggroDelta += bossMod.aggroDelta;
        extraTempDelta += bossMod.tempDelta;
        // 魔运权重动态调整
        w.magic = Math.max(0, Math.min(1, w.magic + bossMod.magicDelta));
        bossLabel = bossMod.label;
      }

      const specialMod = this._buildSpecialDifficultyMods(context, phase, rawStrength, equity, toCall, aiStack, pot);
      aggroDelta += specialMod.aggroDelta;
      extraTempDelta += specialMod.tempDelta;
      w.magic = Math.max(0, Math.min(1, w.magic + specialMod.magicWeightDelta));

      const entryThreshold = this.risk.entryThreshold + specialMod.entryDelta;
      const raiseThreshold = this.risk.raiseThreshold + specialMod.raiseDelta;
      const callDownThreshold = this.risk.callDownThreshold + specialMod.callDownDelta;

      // 对手建模：pro/boss 用 OpponentModel 替代静态 scoreOpponent
      const heroId = context.heroId != null ? context.heroId : 0;
      const oppManaRatio = context.opponentManaRatio != null ? context.opponentManaRatio : 0.5;

      // 强牌保护：pro/boss 不弃强牌
      // preflop: raw>=65 (JJ+/AKs), postflop: raw>=50 或 equity>=70%
      // MC equity 在多人桌可能严重低估，所以用 raw + 筹码承受力兜底
      const potOddsRatio = toCall > 0 ? toCall / (pot + toCall) : 0;
      if (toCall > 0 && (this.difficultyType === 'pro' || this.difficultyType === 'boss') &&
          toCall <= aiStack * 0.5) {
        var rawThreshold = phase === 'preflop' ? 65 : 60;
        var madeHandProtect = phase === 'preflop'
          ? rawStrength >= rawThreshold
          : (rawStrength >= rawThreshold || handRank >= 3);
        var safeEquityProtect = phase === 'preflop'
          ? false
          : (phase !== 'river'
            ? (equity >= 0.82 && toCall <= pot * 0.45)
            : (equity >= 0.92 && toCall <= pot * 0.22 && handRank >= 2));
        if (madeHandProtect || safeEquityProtect) {
          console.log('[AI] ' + playerName + ' strong-hand-protect: raw=' + rawStrength +
            ' eq=' + (equity * 100).toFixed(0) + ' toCall=' + toCall + ' stack=' + aiStack +
            ' phase=' + phase + ' → auto CALL');
          if (mods && mods.pressureType) { this.risk = origRisk; this.difficulty = origDiff; }
          return { action: ACTIONS.CALL, amount: Math.min(toCall, aiStack) };
        }
      }

      // Pot-committed 快速通道：剩余筹码极少，toCall 几乎等于全部身家时直接 call
      // 条件：pot odds < 5% 且 toCall >= 80% 剩余筹码（真正的 pot-committed）
      // 例：投了 8.3金，只剩 42银，再跟 42银 看 30金底池 → 必须 call
      // 反例：20银 bet into 400 pot，手里还有 900 → 不触发，走正常决策（可能 raise）
      const stackCommit = toCall > 0 ? toCall / Math.max(1, aiStack) : 0;
      const minEquityForCommit = Math.max(0.005, potOddsRatio * 0.5);
      if (toCall > 0 && potOddsRatio < 0.05 && stackCommit >= 0.8 && equity > minEquityForCommit) {
        console.log('[AI] ' + playerName + ' pot-committed: toCall=' + toCall +
          ' pot=' + pot + ' odds=' + (potOddsRatio * 100).toFixed(1) + '% stack=' + (stackCommit * 100).toFixed(0) + '% eq=' + (equity * 100).toFixed(1) + '% → auto CALL');
        if (mods && mods.pressureType) { this.risk = origRisk; this.difficulty = origDiff; }
        return { action: ACTIONS.CALL, amount: toCall };
      }

      // 筹码承诺惩罚：toCall 占 stack 比例越高，call/raise 需要越高 equity 才值得
      // commitRatio: 0 = 免费, 0.5 = 半个筹码, 1.0 = 全押
      const commitRatio = toCall > 0 ? Math.min(1, toCall / Math.max(1, aiStack)) : 0;
      // 当 pot odds 很好时（toCall << pot），减轻惩罚
      const potOddsFactor = potOddsRatio < 0.15 ? potOddsRatio / 0.15 : 1.0;
      // 软惩罚：equity 足够高时不惩罚，低时才惩罚
      const commitPenalty = commitRatio > 0.15
        ? Math.max(-0.5, (equity - 0.35) - commitRatio * 0.4) * potOddsFactor
        : 0;
      const equityPct = equity * 100;

      const utilities = candidates.map(c => {
        const a = c.action;
        const s = c.sizing;
        const uHand     = scoreHand(equity, a);
        const uPotOdds  = scorePotOdds(equity, potOdds, a, toCall, pot);
        const uPosition = scorePosition(a, opponents, phase);
        const uOpponent = this.opponentModel
          ? this.opponentModel.score(heroId, oppManaRatio, a)
          : scoreOpponent(context, a);
        const uMagic    = scoreMagic(magicLevel, netForce, a);
        const uAggro    = scoreAggro(a, s) + aggroDelta;
        const uFoldCost = scoreFoldResourcePenalty(context, a);

        let u = w.hand * uHand
              + w.potOdds * uPotOdds
              + w.position * uPosition
              + w.opponent * uOpponent
              + w.magic * uMagic
              + w.aggro * uAggro
              + uFoldCost;

        // 风格阈值真正接入决策：让 risk profile 不只是打印日志
        if (a === ACTIONS.RAISE) {
          const raiseGap = (equityPct - raiseThreshold) / 24;
          u += Math.max(-1.6, Math.min(1.2, raiseGap));
          u += scoutMods.raiseBias;
          u += specialMod.raiseBias;
        } else if (a === ACTIONS.CALL) {
          const callGap = (equityPct - callDownThreshold) / 26;
          u += Math.max(-1.1, Math.min(0.9, callGap));
          u += scoutMods.callBias;
          u += specialMod.callBias;
        } else if (a === ACTIONS.CHECK) {
          const checkEdge = (entryThreshold - equityPct) / 30;
          u += Math.max(-0.4, Math.min(0.9, checkEdge));
          u += scoutMods.checkBias;
          u += specialMod.checkBias;
        } else if (a === ACTIONS.FOLD && toCall > 0) {
          const foldEdge = (callDownThreshold - equityPct) / 24;
          u += Math.max(-0.5, Math.min(1.1, foldEdge));
          u += scoutMods.foldBias;
          u += specialMod.foldBias;
        }

        // 筹码承诺惩罚：call/raise 在高承诺时被惩罚
        if (commitPenalty < 0 && (a === ACTIONS.CALL || a === ACTIONS.RAISE)) {
          u += commitPenalty;
          // raise 额外惩罚（比 call 更危险）
          if (a === ACTIONS.RAISE) u += commitPenalty * 0.5;
        }

        // 弱牌加注抑制：equity < 0.25 时 raise 大幅惩罚（垃圾牌别加注）
        // eq=0.02 → penalty = -1.38, eq=0.15 → -0.50, eq=0.24 → -0.05
        if (a === ACTIONS.RAISE && equity < 0.25) {
          u -= (0.25 - equity) * 6.0;
        }

        // 3-bet cap：本轮已有多次加注时，再加注需要更强的牌
        // raiseCount=0(首次下注) → 无惩罚
        // raiseCount=1(3-bet) → 轻微惩罚
        // raiseCount=2(4-bet) → 重惩罚
        // raiseCount>=3(5-bet+) → 极重惩罚
        if (a === ACTIONS.RAISE && raiseCount >= 1) {
          const reraiseThreshold = 0.30 + raiseCount * 0.10; // 1→0.40, 2→0.50, 3→0.60
          if (equity < reraiseThreshold) {
            u -= (reraiseThreshold - equity) * (2.0 + raiseCount);
          }
        }

        // All-in 惩罚：需要极强牌力才合理
        // eq=0.28 → penalty = -1.08, eq=0.50 → -0.20, eq=0.60 → 0
        if (a === ACTIONS.RAISE && s === 'allin' && equity < 0.60) {
          u -= (0.60 - equity) * 4.0;
        }

        if (a === ACTIONS.RAISE && specialMod.raiseCap) {
          if (specialMod.raiseCap === 'medium' && s === 'large') {
            u -= 0.55;
          }
          if (s === 'allin') {
            const shouldRestrainAllIn = !specialMod.desperationAllIn || (equity < 0.50 && rawStrength < 55);
            if (shouldRestrainAllIn) {
              u -= specialMod.raiseCap === 'medium' ? 1.10 : 0.55;
            } else {
              u += 0.35;
            }
          }
        }

        // 深筹码 river 终结线：不是坚果或接近坚果时，不该轻易 overjam
        if (a === ACTIONS.RAISE && s === 'allin' && phase === 'river') {
          const deepStack = aiStack > pot * 1.25;
          const notCloseToNuts = handRank < 7 && rawStrength < 88;
          if (deepStack && notCloseToNuts) {
            u -= handRank >= 5 ? 1.15 : 2.10;
          }
          if (deepStack && handRank < 5) {
            u -= 0.65;
          }
        }

        // Overbet 惩罚：非 all-in 的 raise 金额远超底池时惩罚
        if (a === ACTIONS.RAISE && s !== 'allin') {
          const sizingMap = { small: 0.33, medium: 0.66, large: 1.0 };
          const estBet = pot * (sizingMap[s] || 0.5);
          if (estBet > pot * 2) {
            u -= Math.min(0.5, (estBet / pot - 2) * 0.15);
          }
        }

        // pro/boss 的理性底线：弱牌会被心理战和读牌撬动，但不该轻易打成大底池失控局
        if ((this.difficultyType === 'pro' || this.difficultyType === 'boss') && phase !== 'preflop') {
          const weakFloor = this.difficultyType === 'boss' ? 24 : 28;
          const veryWeakFloor = this.difficultyType === 'boss' ? 18 : 20;
          const noRealMagicEdge = netForce < 25;
          const canCheck = toCall === 0;
          const hasScoutIntel = scoutMods.notes.length > 0;

          if (a === ACTIONS.RAISE && rawStrength < weakFloor && noRealMagicEdge) {
            if (s === 'large') u -= 1.35;
            else if (s === 'medium') u -= 0.70;
            else if (s === 'small') u -= 0.25;
          }

          if (a === ACTIONS.RAISE && rawStrength < veryWeakFloor && noRealMagicEdge) {
            if (s === 'allin') u -= 3.50;
            else if (s === 'large') u -= 1.20;
          }

          if (a === ACTIONS.CALL && rawStrength < veryWeakFloor && noRealMagicEdge && toCall > pot * 0.45 && equity < 0.58) {
            u -= 0.85;
          }

          // 没有侦查情报时，river 的弱一对/薄摊牌值别太爱当英雄跟注
          if (!canCheck && a === ACTIONS.CALL && phase === 'river' && !hasScoutIntel && noRealMagicEdge) {
            const marginalShowdown = handRank <= 2 && rawStrength < 32;
            const meaningfulPressure = toCall > pot * 0.20;
            const weakRead = readBonus < 0.05;
            if (marginalShowdown && meaningfulPressure && weakRead) {
              u -= toCall > pot * 0.35 ? 1.15 : 0.65;
            }
          }

          // 面对真实压力时，弱一对/高牌不能轻易升级成加注线
          if (!canCheck && a === ACTIONS.RAISE && noRealMagicEdge) {
            const heavyCall = toCall > pot * 0.30;
            const weakShowdownHand = rawStrength <= 35;
            if (weakShowdownHand && heavyCall) {
              if (s === 'small') u -= 1.30;
              else if (s === 'medium') u -= 2.10;
              else if (s === 'large') u -= 3.00;
              else if (s === 'allin') u -= 4.00;
            }
            if (phase === 'river' && rawStrength <= 40 && toCall > pot * 0.22) {
              if (s === 'small') u -= 1.10;
              else if (s === 'medium') u -= 1.80;
              else if (s === 'large') u -= 2.60;
              else if (s === 'allin') u -= 3.50;
            }
          }

          if (canCheck && rawStrength < weakFloor && noRealMagicEdge) {
            if (a === ACTIONS.CHECK) {
              u += phase === 'flop' ? 0.35 : 0.60;
            } else if (a === ACTIONS.RAISE) {
              if (rawStrength < veryWeakFloor) {
                if (s === 'small') u -= phase === 'flop' ? 0.65 : 1.10;
                else if (s === 'medium') u -= phase === 'flop' ? 1.20 : 1.80;
                else if (s === 'large') u -= phase === 'flop' ? 1.80 : 2.60;
              } else if (phase !== 'flop') {
                if (s === 'small') u -= 0.35;
                else if (s === 'medium') u -= 0.75;
              }
            }
          }
        }

        return u;
      });

      // 4. Softmax 选择（FSM + Boss脚本 + 情绪修正温度）
      const baseTemp = TEMPERATURE[this.difficultyType] || 1.0;
      const emotionTempDelta = EMOTION_TEMP_DELTA[this.emotionType] || 0;
      const temperature = Math.max(0.1, baseTemp + emotionTempDelta + extraTempDelta);

      const { index: chosenIdx, probs } = softmaxSelect(utilities, temperature);
      const chosen = candidates[chosenIdx];

      // 5. 计算下注金额
      let amount = 0;
      if (chosen.action === ACTIONS.CALL) {
        amount = Math.min(toCall, aiStack);
      } else if (chosen.action === ACTIONS.RAISE) {
        amount = calculateBetSize(this.difficultyType, chosen.sizing, equity, pot, aiStack, minRaise);
        // 如果 raise sizing 是 allin，标记为 allin
        if (amount >= aiStack) {
          amount = aiStack;
        }
      }

      // 6. 构建 reason
      const topUtils = candidates.map((c, i) => {
        const label = c.action === ACTIONS.RAISE ? c.action + '_' + c.sizing : c.action;
        return label + ':' + utilities[i].toFixed(2);
      });
      const fsmTag = fsmMod.state !== 'cautious' ? ' fsm=' + fsmMod.label : '';
      const bossTag = bossLabel ? ' boss=' + bossLabel : '';
      const specialTag = specialMod.label ? ' special=' + specialMod.label : '';
      const reason = 'eq=' + (equity * 100).toFixed(0) + ' T=' + temperature.toFixed(1) +
        fsmTag + bossTag + specialTag +
        ' [' + topUtils.join(' ') + ']' +
        ' p=' + (probs[chosenIdx] * 100).toFixed(0) + '%';

      const decision = { action: chosen.action, amount, reason };

      // 7. 详细日志
      const holeStr = holeCards.map(cardToString).join(' ');
      const tag = this.riskType + '/' + this.difficultyType + '/' + this.emotionType;
      const stateTag =
        (specialMod.label ? '/' + specialMod.label : '') +
        (bossLabel ? '/' + bossLabel : '') +
        (fsmMod.state !== 'cautious' ? '/' + fsmMod.label : '');
      console.log(
        '[AI] ' + playerName + ' (' + tag + stateTag + ') ' + phase +
        ' | 手牌: ' + holeStr + ' [' + handName + ']' +
        ' | eq=' + (equity * 100).toFixed(0) + ' raw=' + rawStrength +
        ' magic=' + magicLevel + ' net=' + netForce +
        (readBonus > 0 ? ' read=+' + (readBonus * 100).toFixed(0) : '') +
        (scoutMods.notes.length > 0 ? ' scout=' + scoutMods.notes.join('|') : '') +
        (magicBonus > 0 ? ' mcourage=+' + (magicBonus * 100).toFixed(0) : '') +
        ' | pot=' + pot + ' toCall=' + toCall + ' stack=' + aiStack +
        ' opp=' + opponents +
        ' T=' + temperature.toFixed(1) +
        ' → ' + decision.action.toUpperCase() +
        (decision.amount > 0 ? ' ' + decision.amount : '') +
        ' (p=' + (probs[chosenIdx] * 100).toFixed(0) + '%)'
      );

      // 恢复原始 profile
      if (mods && mods.pressureType) {
        this.risk = origRisk;
        this.difficulty = origDiff;
      }

      return decision;
    }

    /**
     * 构建当前局面下的合法候选动作
     */
    _buildCandidates(toCall, stack, minRaise, pot, equity, phase, rawStrength, magicLevel, netForce) {
      const candidates = [];

      // all-in 只在合理的终结场景里开放：短码、低 SPR、强成手、或已被重压承诺
      const eq = equity || 0;
      const raw = rawStrength || 0;
      const bb = Math.max(1, minRaise || 20);
      const stackBb = stack / bb;
      const spr = pot > 0 ? stack / pot : Infinity;
      const commitPressure = toCall > 0 ? toCall / Math.max(1, stack) : 0;
      const magicEdge = (netForce || 0) >= 25;
      const shortStack = stackBb <= (this.difficultyType === 'boss' ? 14 : this.difficultyType === 'pro' ? 12 : 10);
      const lowSpr = spr <= (this.difficultyType === 'boss' ? 1.8 : 1.5);
      const strongMadeHand = phase !== 'preflop' && raw >= 75;
      const premiumPreflop = phase === 'preflop' && raw >= (this.difficultyType === 'boss' ? 84 : 88);
      const underHeavyPressure = commitPressure >= 0.45;
      const weakPostflop = phase !== 'preflop' && raw < (this.difficultyType === 'boss' ? 24 : this.difficultyType === 'pro' ? 28 : 22);
      const veryWeakPostflop = phase !== 'preflop' && raw < (this.difficultyType === 'boss' ? 18 : this.difficultyType === 'pro' ? 20 : 16);
      const allowLargeRaise = !weakPostflop || lowSpr || underHeavyPressure || magicEdge;
      const allowMediumRaise = !veryWeakPostflop || underHeavyPressure || magicEdge;
      let allinThreshold;

      if (phase === 'preflop') {
        if (this.difficultyType === 'noob') allinThreshold = 0.40;
        else if (this.difficultyType === 'regular') allinThreshold = 0.55;
        else if (this.difficultyType === 'boss') allinThreshold = 0.68;
        else allinThreshold = 0.72;
      } else {
        if (this.difficultyType === 'noob') allinThreshold = 0.45;
        else if (this.difficultyType === 'regular') allinThreshold = 0.58;
        else if (this.difficultyType === 'boss') allinThreshold = 0.66;
        else allinThreshold = 0.70;
      }

      const allinContextOk = shortStack || lowSpr || underHeavyPressure || strongMadeHand || premiumPreflop ||
        (magicEdge && eq >= (phase === 'preflop' ? 0.66 : 0.62));
      const allowAllin = eq >= allinThreshold && allinContextOk;

      if (toCall > 0) {
        // 面对下注：可以 fold / call / raise
        candidates.push({ action: ACTIONS.FOLD, sizing: null });
        if (toCall < stack) {
          candidates.push({ action: ACTIONS.CALL, sizing: null });
        }
        // raise 选项（只有筹码够时）
        if (stack > toCall + minRaise) {
          candidates.push({ action: ACTIONS.RAISE, sizing: 'small' });
          if (allowMediumRaise) candidates.push({ action: ACTIONS.RAISE, sizing: 'medium' });
          if (pot > 0 && allowLargeRaise) candidates.push({ action: ACTIONS.RAISE, sizing: 'large' });
        }
        // all-in 需要足够牌力
        if (allowAllin) {
          candidates.push({ action: ACTIONS.RAISE, sizing: 'allin' });
        }
      } else {
        // 无人下注：可以 check / raise
        candidates.push({ action: ACTIONS.CHECK, sizing: null });
        if (stack > minRaise) {
          candidates.push({ action: ACTIONS.RAISE, sizing: 'small' });
          if (allowMediumRaise) candidates.push({ action: ACTIONS.RAISE, sizing: 'medium' });
          if (pot > 0 && allowLargeRaise) candidates.push({ action: ACTIONS.RAISE, sizing: 'large' });
        }
        if (allowAllin) {
          candidates.push({ action: ACTIONS.RAISE, sizing: 'allin' });
        }
      }

      return candidates;
    }

    /**
     * 读牌加成：pro/boss 根据对手难度和下注模式估算虚张声势概率
     * noob 大额加注 → 很可能是垃圾牌瞎打 → equity 加成高
     * regular 大额加注 → 可能有牌也可能诈唬 → 中等加成
     * pro/boss/human 大额加注 → 可能是真的 → 不加成
     *
     * @param {object} ctx - decide() 的 context
     * @returns {number} 0~0.20 的 equity 加成
     */
    _estimateReadBonus(ctx) {
      const profiles = ctx.opponentProfiles;
      if (!profiles || profiles.length === 0) return 0;
      const bb = ctx.bigBlind || 20;
      const toCall = ctx.toCall || 0;
      if (toCall <= 0) return 0;

      // 找到当前最大下注者（最可能是施压者）
      let maxBetOpp = null;
      let maxBet = 0;
      for (const opp of profiles) {
        if (opp.currentBet > maxBet) {
          maxBet = opp.currentBet;
          maxBetOpp = opp;
        }
      }
      if (!maxBetOpp) return 0;

      // 对手难度 → 基础虚张声势概率
      // noob: 经常用垃圾牌大额加注，bluff 概率高
      // regular: 有一定策略但会泄露，bluff 概率中等
      // pro/boss/human: 不好读，不给加成
      const BLUFF_BASE = {
        noob: 0.55,     // noob 55% 的大额加注是垃圾牌
        regular: 0.25,  // regular 25% 是诈唬
        pro: 0.05,      // pro 几乎不可读
        boss: 0.0       // boss 不可读
      };
      const baseBluff = BLUFF_BASE[maxBetOpp.difficulty] || 0;
      if (baseBluff <= 0) return 0;

      // 下注尺度修正：overbet 越大，noob 越可能是瞎打
      // betRatio = 下注额 / 大盲注，越大越可疑
      const betRatio = maxBet / bb;
      let sizingMod = 0;
      if (betRatio > 10) sizingMod = 0.15;       // 超过 10BB 的加注
      else if (betRatio > 5) sizingMod = 0.08;   // 5-10BB
      else if (betRatio > 3) sizingMod = 0.03;   // 3-5BB
      // 小额加注不加成（可能是正常下注）

      // 风险偏好修正：maniac 更可能诈唬
      const RISK_MOD = { maniac: 0.10, aggressive: 0.05, balanced: 0, rock: -0.10, passive: -0.05 };
      const riskMod = RISK_MOD[maxBetOpp.risk] || 0;

      // 最终虚张声势概率
      const bluffProb = Math.max(0, Math.min(0.8, baseBluff + sizingMod + riskMod));

      // 转换为 equity 加成：bluffProb 越高，我的实际胜率越被低估
      // bluffProb=0.55 → bonus ≈ 0.14, bluffProb=0.25 → bonus ≈ 0.06
      const bonus = bluffProb * 0.25;

      // boss 比 pro 读得更准
      const diffMult = this.difficultyType === 'boss' ? 1.0 : 0.6;

      return Math.min(0.20, bonus * diffMult);
    }

    calculateRawStrength(holeCards, boardCards, phase) {
      if (phase === 'preflop') {
        return evaluatePreflopStrength(holeCards);
      }
      
      const handResult = evaluateHandStrength(holeCards, boardCards);
      let strength = HAND_STRENGTH_MAP[handResult.rank] || 15;
      
      // ========== 关键修复：检测手牌是否真正参与了牌型 ==========
      const holeRanks = holeCards.map(c => c.rank === 1 ? 14 : c.rank);
      const boardRanks = boardCards.map(c => c.rank === 1 ? 14 : c.rank);
      
      // 检测公共牌是否有对子
      const boardPair = this.detectBoardPair(boardRanks);
      
      // 检测手牌是否与公共牌配对
      const holeConnectsToBoard = holeRanks.some(hr => boardRanks.includes(hr));
      
      // 检测手牌是否自带对子
      const holePocket = holeRanks[0] === holeRanks[1];
      
      // 统计公共牌对子数量
      const boardCounts = {};
      for (const r of boardRanks) boardCounts[r] = (boardCounts[r] || 0) + 1;
      const boardPairCount = Object.values(boardCounts).filter(c => c >= 2).length;
      const boardHasTrips = Object.values(boardCounts).some(c => c >= 3);
      
      if (handResult.rank === 2) { // Pair
        if (boardPair && !holeConnectsToBoard && !holePocket) {
          // 🚨 公共牌对子，手牌没贡献 = 实际上是高牌！
          strength = 18;
        } else if (holeConnectsToBoard) {
          const pairRank = Math.max(...holeRanks.filter(hr => boardRanks.includes(hr)));
          const boardHighCard = Math.max(...boardRanks);
          if (pairRank >= boardHighCard) {
            strength += 10; // 顶对加分
          } else if (pairRank < boardHighCard - 2) {
            strength -= 10; // 小对子减分
          }
        }
        // 口袋对子保持原分数
      }
      
      if (handResult.rank === 3) { // Two Pair
        if (boardPairCount >= 2 && !holeConnectsToBoard && !holePocket) {
          // 🚨 两对都在公共牌上！手牌只是踢脚
          strength = 22;
        } else if (boardPair && !holePocket) {
          const myPairRank = Math.max(...holeRanks.filter(hr => boardRanks.includes(hr)), 0);
          if (myPairRank === 0) {
            // 两对都是公共牌的（另一种检测路径）
            strength = 22;
          } else if (myPairRank < Math.max(...boardRanks)) {
            strength -= 10;
          }
        }
      }
      
      if (handResult.rank === 4) { // Three of a Kind
        if (boardHasTrips && !holeConnectsToBoard) {
          // 🚨 三条全在公共牌上，手牌没贡献
          strength = 30;
        } else if (boardPair && holeConnectsToBoard && !holePocket) {
          // 公共牌对子 + 手牌配对 = 真三条，但不如口袋对子强
          strength -= 5;
        }
        // 口袋对子 + 公共牌 = 暗三条，最强，保持原分
      }
      
      if (handResult.rank === 7) { // Full House
        if (boardHasTrips && !holePocket) {
          // 公共牌三条 + 手牌没配对 = 公共葫芦，大家都有
          const myContribution = holeRanks.some(hr => boardRanks.includes(hr));
          if (!myContribution) {
            strength = 40; // 大幅降低：公共葫芦谁都有
          }
        } else if (boardPairCount >= 2) {
          // 公共牌两对 + 手牌配了一张 = 弱葫芦
          if (!holeConnectsToBoard && !holePocket) {
            strength = 42; // 公共牌两对 + 踢脚 = 谁都有
          }
        }
      }
      
      // ========== 赌徒心态：听牌幻想加分 ==========
      // 只在 flop 和 turn 阶段生效（还有未来牌可以期待）
      if (phase !== 'river') {
        let potentialBonus = 0;
        
        // 1. 高张奖励：手里有 A 或 K，觉得自己能中顶对
        // 🔧 修复：如果已经有对子了，不再加分
        if (handResult.rank <= 1) { // 只有高牌时才加
          const hasAce = holeCards.some(c => c.rank === 1);
          const hasKing = holeCards.some(c => c.rank === 13);
          if (hasAce) potentialBonus += 12;
          else if (hasKing) potentialBonus += 8;
        }
        
        // 2. 同花听牌检测（简化版）
        const allCards = [...holeCards, ...boardCards];
        const suitCounts = [0, 0, 0, 0];
        allCards.forEach(c => suitCounts[c.suit]++);
        const maxSuitCount = Math.max(...suitCounts);
        
        // 🔧 修复：必须手牌参与听牌才加分
        const flushSuit = suitCounts.indexOf(maxSuitCount);
        const holeFlushCards = holeCards.filter(c => c.suit === flushSuit).length;
        
        if (maxSuitCount >= 4 && holeFlushCards >= 1) {
          potentialBonus += 15; // 四张同花，听花
        } else if (maxSuitCount === 3 && holeFlushCards >= 2) {
          potentialBonus += 5; // 后门花，但必须两张手牌都是
        }
        
        // 3. 顺子听牌检测 - 简化，减少误判
        // 只有当手牌参与顺子时才加分
        if (this.hasOpenEndedStraightDraw(holeRanks, boardRanks)) {
          potentialBonus += 12;
        }
        
        strength += potentialBonus;
      }
      
      // 归一化，防止超过100
      return Math.min(100, Math.max(5, strength));
    }
    
    // 检测公共牌是否有对子
    detectBoardPair(boardRanks) {
      const counts = {};
      for (const r of boardRanks) {
        counts[r] = (counts[r] || 0) + 1;
        if (counts[r] >= 2) return true;
      }
      return false;
    }
    
    // 检测是否有两头顺听牌（手牌必须参与）
    hasOpenEndedStraightDraw(holeRanks, boardRanks) {
      const allRanks = [...holeRanks, ...boardRanks];
      const uniqueRanks = [...new Set(allRanks)].sort((a, b) => a - b);
      
      // 检查是否有4张连续牌
      for (let i = 0; i <= uniqueRanks.length - 4; i++) {
        const span = uniqueRanks[i + 3] - uniqueRanks[i];
        if (span === 3) {
          // 有4张连续牌，检查手牌是否参与
          const straightRanks = uniqueRanks.slice(i, i + 4);
          const holeInStraight = holeRanks.some(hr => straightRanks.includes(hr));
          if (holeInStraight) return true;
        }
      }
      return false;
    }

    getBoardHighCard(boardCards) {
      if (!boardCards || boardCards.length === 0) return 0;
      return Math.max(...boardCards.map(c => c.rank === 1 ? 14 : c.rank));
    }

    getPairRank(holeCards, boardCards) {
      // 简化：返回手牌中最大的牌
      const ranks = holeCards.map(c => c.rank === 1 ? 14 : c.rank);
      return Math.max(...ranks);
    }

  }

  // ========== SkillAI — 技能决策模块 ==========
  // 纯函数，无状态。所有技能相关的 AI 决策集中在这里。
  // skill-system.js 通过回调委托到这里，不直接耦合。
  //
  // 两大职责：
  //   1. shouldUseSkill — NPC 是否使用某个主动技能（4属性 × 3难度）
  //   2. pickCurseTarget — Curse 选目标（3难度）

  const SkillAI = {

    // ================================================================
    //  shouldUseSkill — NPC 技能使用决策
    // ================================================================

    /**
     * NPC 是否应该使用某个主动技能
     *
     * @param {string} difficulty    - 'noob' | 'regular' | 'pro'
     * @param {object} skill         - skill 注册对象 (effect, attr, tier, manaCost, ...)
     * @param {object} owner         - gameContext.players 中的 owner 对象
     * @param {object} ctx           - gameContext { phase, pot, players, board }
     * @param {Array}  pendingForces - skillSystem.pendingForces
     * @param {object} mana          - { current, max }
     * @returns {boolean}
     */
    shouldUseSkill(difficulty, skill, owner, ctx, pendingForces, mana) {
      var director = global.NpcRoleDirector || NpcRoleDirector;
      return director.shouldUseSkill({
        difficulty: difficulty,
        skill: skill,
        owner: owner,
        ctx: ctx,
        pendingForces: pendingForces,
        mana: mana
      }, function(roleCtx) {
        return SkillAI._shouldUseSkillBase(
          roleCtx.difficulty,
          roleCtx.skill,
          roleCtx.owner,
          roleCtx.ctx,
          roleCtx.pendingForces,
          roleCtx.mana
        );
      });
    },

    _shouldUseSkillBase(difficulty, skill, owner, ctx, pendingForces, mana) {
      // Cota / Kuzuha 的这些技能当前不交给通用 AI 主动驱动
      if (skill.effect === 'deal_card')        return false;
      if (skill.effect === 'gather_or_spread') return false;
      if (skill.effect === 'house_edge')       return false;
      if (skill.effect === 'debt_call')        return false;

      // river 后不会再发牌，fortune/curse 等改牌收益都会白白浪费。
      // 这里只保留信息技能，供最终下注决策使用。
      if (ctx.phase === 'river') {
        if (!RIVER_INFO_SKILL_EFFECTS[skill.effect]) return false;
      }

      if (!SkillAI._passesSkillEconomyGate(difficulty, skill, owner, ctx, pendingForces, mana)) {
        return false;
      }

      // --- 专属技能特殊决策 ---
      if (skill.effect === 'cooler')       return SkillAI._decideCooler(difficulty, skill, owner, ctx, mana);
      if (skill.effect === 'royal_decree') return SkillAI._decideExclusive(difficulty, skill, owner, ctx, mana);
      if (skill.effect === 'clairvoyance') return SkillAI._decideClairvoyance(difficulty, skill, owner, ctx, mana);
      if (skill.effect === 'skill_seal')   return SkillAI._decideSeal(difficulty, skill, owner, ctx, mana);
      if (skill.effect === 'heart_read')   return SkillAI._decideHeartRead(difficulty, skill, owner, ctx, mana);
      if (skill.effect === 'rule_rewrite') return SkillAI._decideRuleRewrite(difficulty, skill, owner, ctx, pendingForces, mana);
      if (skill.effect === 'blind_box')    return SkillAI._decideBlindBox(difficulty, skill, owner, ctx, pendingForces, mana);
      // Eulalia
      if (skill.effect === 'absolution')     return SkillAI._decideAbsolution(difficulty, skill, owner, ctx, pendingForces, mana);
      if (skill.effect === 'benediction')    return SkillAI._decideBenediction(difficulty, skill, owner, ctx, pendingForces, mana);

      switch (skill.attr) {
        case 'moirai': return SkillAI._decideMoirai(difficulty, skill, owner, ctx, pendingForces, mana);
        case 'chaos':  return SkillAI._decideChaos(difficulty, skill, owner, ctx, pendingForces, mana);
        case 'psyche': return SkillAI._decidePsyche(difficulty, skill, owner, ctx, pendingForces, mana);
        case 'void':   return SkillAI._decideVoid(difficulty, skill, owner, ctx, pendingForces, mana);
        default:       return Math.random() < 0.2;
      }
    },

    // ---- Moirai (天命: fortune) ----
    // 核心逻辑：技能概率与筹码投入挂钩，投入越多越需要技能保护/提升
    _decideMoirai(difficulty, skill, owner, ctx, forces, mana) {
      const pi = PHASE_INDEX[ctx.phase] || 0;
      const pot = ctx.pot || 0;
      const commit = SkillAI._getCommitRatio(owner);

      switch (difficulty) {
        case 'noob': {
          // 本能型：有就用，不区分大小，投入多时更积极
          return Math.random() < (0.15 + commit * 0.3 + pi * 0.08);
        }
        case 'regular': {
          // 底池+投入感知：投入多或底池大时积极
          if (pi === 0) {
            if (skill.tier === 3) return Math.random() < 0.15;
            if (skill.tier === 2) return Math.random() < 0.08;
            return false;
          }
          if (mana && mana.current < mana.max * 0.3 && skill.tier !== 3) return false;
          var blinds = ctx.blinds || 20;
          var potFactor = Math.min(1, pot / (blinds * 15));
          // 投入占比是主要驱动力
          return Math.random() < (0.10 + commit * 0.45 + potFactor * 0.20 + pi * 0.05);
        }
        case 'boss':
        case 'pro': {
          if (mana && mana.current < skill.manaCost * 1.5 && skill.tier !== 1) return false;
          var strength = SkillAI._getHandStrength(owner, ctx);
          var strengthMod = strength >= 50 ? 0.15 : 0;
          if (pi === 0) {
            // preflop→flop 是最关键的选牌：基于手牌强度决定
            // T3(便宜) 更容易用，T1/T2 需要更强的手牌
            var tierMod = skill.tier >= 3 ? 0.10 : 0;
            var base = 0.12 + tierMod + commit * 0.40;
            return Math.random() < (base + strengthMod);
          }
          return Math.random() < (0.08 + commit * 0.50 + strengthMod + pi * 0.08);
        }
        default: return false;
      }
    },

    // ---- Chaos (狂厄: curse) ----
    // 核心逻辑：投入越多越需要诅咒对手来保护自己的投资
    _decideChaos(difficulty, skill, owner, ctx, forces, mana) {
      var pi = PHASE_INDEX[ctx.phase] || 0;
      var pot = ctx.pot || 0;
      var commit = SkillAI._getCommitRatio(owner);

      switch (difficulty) {
        case 'noob': {
          // 本能型：投入多时更积极
          return Math.random() < (0.15 + commit * 0.25 + pi * 0.08);
        }
        case 'regular': {
          if (pi === 0) return Math.random() < 0.08;
          if (mana && mana.current < mana.max * 0.3 && skill.tier !== 3) return false;
          var blinds2 = ctx.blinds || 20;
          var potFactor = Math.min(1, pot / (blinds2 * 15));
          return Math.random() < (0.10 + commit * 0.40 + potFactor * 0.20);
        }
        case 'boss':
        case 'pro': {
          if (mana && mana.current < skill.manaCost * 1.5 && skill.tier !== 1) return false;
          var strength = SkillAI._getHandStrength(owner, ctx);
          if (strength > 80) return false; // 碾压局不浪费 mana
          if (pi === 0) {
            // preflop→flop：基于手牌强度诅咒对手
            var tierMod2 = skill.tier >= 3 ? 0.08 : 0;
            return Math.random() < (0.10 + tierMod2 + commit * 0.35);
          }
          return Math.random() < (0.10 + commit * 0.45 + pi * 0.08);
        }
        default: return false;
      }
    },

    // ---- Psyche (灵视: clarity / refraction / reversal) ----
    // 核心问题：什么时候反制？预防性使用还是反应性使用？
    _decidePsyche(difficulty, skill, owner, ctx, forces, mana) {
      var pi = PHASE_INDEX[ctx.phase] || 0;
      // 检测敌方 Chaos forces
      var enemyChaos = forces.filter(function(f) {
        return f.attr === 'chaos' && f.ownerId !== owner.id;
      });
      var hasChaos = enemyChaos.length > 0;
      // 检测敌方 Chaos 总 power
      var chaosPower = enemyChaos.reduce(function(sum, f) { return sum + (f.power || 0); }, 0);
      var enemyFortunePower = 0;
      var enemyThreatPower = 0;
      if (forces) {
        for (var fi = 0; fi < forces.length; fi++) {
          var force = forces[fi];
          if (force.ownerId === owner.id) continue;
          enemyThreatPower += (force.power || 0);
          if (force.type === 'fortune' || force.attr === 'fortune') enemyFortunePower += (force.power || 0);
        }
      }
      var highThreat = Math.max(chaosPower, enemyFortunePower, enemyThreatPower * 0.75);
      var hasScoutingNeed = hasChaos || enemyFortunePower >= 18 || enemyThreatPower >= 28;
      var toCall = ctx.toCall || 0;
      var pot = ctx.pot || 0;
      var infoPressure = toCall > 0 && (toCall >= pot * 0.18 || toCall >= Math.max(40, owner.chips * 0.12));
      var hasRecentScout = !!(owner && owner.ai && owner.ai.scoutMemory && owner.ai.scoutMemory.some(function(entry) {
        return entry && entry.phaseSeen === ctx.phase;
      }));

      switch (difficulty) {
        case 'noob': {
          // 几乎不用：不懂反制价值，偶尔随机触发
          // 有敌方 Chaos 时稍微积极一点（本能反应）
          return Math.random() < (hasChaos ? 0.15 : 0.05);
        }
        case 'regular': {
          // 反应式：检测到敌方 Chaos 才用
          // 优先用低阶（澄澈省 mana），高阶留给大威胁
          if (!hasScoutingNeed) return Math.random() < 0.08; // 无明显威胁时仅偶尔做信息侦查
          // mana 紧张时只用 T3
          if (mana && mana.current < mana.max * 0.3 && skill.tier !== 3) return false;
          // 敌方待结算威胁越大越积极
          var urgency = Math.min(1, highThreat / 30);
          // T3 优先（省 mana），除非 Chaos 很强
          if (skill.tier === 3) return Math.random() < (0.5 + urgency * 0.3);
          if (skill.tier === 2) return Math.random() < (0.2 + urgency * 0.5);
          // T1 只在 Chaos power 很高时用
          return Math.random() < (highThreat >= 25 ? 0.55 : 0.15);
        }
        case 'boss':
        case 'pro': {
          // 预判式：即使没 Chaos 也会在关键轮次预防性使用
          // 优先高阶（折射/真理 > 澄澈，信息+反制双重价值）
          // mana 精细管理
          if (mana && mana.current < skill.manaCost * 1.2) return false;

          if (hasScoutingNeed) {
            // 有显著敌方威胁时：根据威胁等级选择对应技能
            var urgency2 = Math.min(1, highThreat / 40);
            // 高威胁 → 用高阶技能
            if (skill.tier === 1) return Math.random() < (highThreat >= 25 ? 0.7 : 0.2);
            if (skill.tier === 2) return Math.random() < (0.3 + urgency2 * 0.4);
            return Math.random() < (0.4 + urgency2 * 0.2); // T3 兜底
          }

          if (infoPressure && !hasRecentScout) {
            if (skill.tier === 1) return Math.random() < (difficulty === 'boss' ? 0.28 : 0.20);
            if (skill.tier === 2) return Math.random() < (difficulty === 'boss' ? 0.42 : 0.30);
            return Math.random() < (difficulty === 'boss' ? 0.20 : 0.14);
          }

          if (difficulty === 'pro') {
            // pro：无明显威胁时明显克制，只在关键街低概率做信息预判
            if (pi === 1 || pi === 2 || pi === 3) {
              if (skill.tier === 2) return Math.random() < 0.08;
              if (skill.tier === 1) return Math.random() < 0.05;
              return Math.random() < 0.04;
            }
            if (pi === 0) {
              if (skill.tier === 2) return Math.random() < 0.03;
              if (skill.tier === 1) return Math.random() < 0.02;
              return false;
            }
            return false;
          }

          // boss：保留更强的预判式打法
          if (pi >= 1 && pi <= 2) {
            if (skill.tier <= 2) return Math.random() < 0.2;
            return Math.random() < 0.12;
          }
          if (pi === 0) {
            if (skill.tier <= 1) return Math.random() < 0.15;
            if (skill.tier === 2) return Math.random() < 0.18;
            return Math.random() < 0.10;
          }
          return false;
        }
        default: return false;
      }
    },

    // ---- Void (虚无: null_field / void_shield / purge_all) ----
    // null_field 和 void_shield 是 passive，不需要决策
    // 只有 purge_all (现实) 是 active
    _decideVoid(difficulty, skill, owner, ctx, forces, mana) {
      // 只有 purge_all 需要决策（其他是 passive）
      if (skill.effect !== 'purge_all') return false;

      var totalForces = forces.length;

      switch (difficulty) {
        case 'noob': {
          // 不懂核弹级技能的价值，几乎不用
          return totalForces >= 4 && Math.random() < 0.15;
        }
        case 'regular': {
          // 场上 force ≥ 3 时才用（核弹不乱扔）
          return totalForces >= 3 && Math.random() < 0.35;
        }
        case 'boss':
        case 'pro': {
          // 精准时机：敌方刚释放 T1/T2 技能后立即清场
          // 或者场上敌方 forces 对自己不利时
          var enemyForces = forces.filter(function(f) { return f.ownerId !== owner.id; });
          var allyForces = forces.filter(function(f) { return f.ownerId === owner.id; });
          // 敌方力量远超己方时才用（净化对自己有利）
          var enemyPower = enemyForces.reduce(function(s, f) { return s + (f.power || 0); }, 0);
          var allyPower = allyForces.reduce(function(s, f) { return s + (f.power || 0); }, 0);
          if (enemyPower <= allyPower) return false; // 己方优势不清场
          // 敌方有 T1 技能时更积极
          var hasEnemyT1 = enemyForces.some(function(f) { return f.tier === 1; });
          return Math.random() < (hasEnemyT1 ? 0.6 : 0.3);
        }
        default: return false;
      }
    },

    // ---- 工具函数 ----

    /**
     * 筹码投入比：已投入筹码 / 初始筹码 (0~1)
     * commit=0: 还没投入, commit=0.5: 投了一半, commit=1.0: 全押
     * 注意：totalBet 已包含 currentBet，不要重复计算
     */
    // ---- 专属技能：royal_decree (T0, 1/game) ----
    // 核心逻辑：整局只有一次，必须在关键时刻使用
    // 条件：turn/river + 高投入 或 flop + 极高投入
    _decideExclusive(difficulty, skill, owner, ctx, mana) {
      var pi = PHASE_INDEX[ctx.phase] || 0;
      var commit = SkillAI._getCommitRatio(owner);

      // river 阶段不用（选牌已结束）
      if (ctx.phase === 'river') return false;
      // preflop 不用（太早浪费）
      if (pi === 0) return false;
      // mana 不足
      if (mana && mana.current < skill.manaCost) return false;

      switch (difficulty) {
        case 'noob':
          // noob 不会战略性使用终极技能
          return Math.random() < 0.08;
        case 'regular':
          // regular 在 turn 且投入较多时可能使用
          if (pi < 2) return false;
          return Math.random() < (commit * 0.4);
        case 'boss':
        case 'pro': {
          // pro/boss 在 flop 高投入或 turn 中投入时使用
          var strength = SkillAI._getHandStrength(owner, ctx);
          // 碾压局不浪费终极技能
          if (strength > 80) return false;
          // turn 是最佳时机（还有 river 牌可影响）
          if (pi === 2) return Math.random() < (0.25 + commit * 0.45);
          // flop 需要高投入才值得
          if (pi === 1) return Math.random() < (commit > 0.3 ? 0.15 + commit * 0.3 : 0);
          return false;
        }
        default: return false;
      }
    },

    _decideCooler(difficulty, skill, owner, ctx, mana) {
      var pi = PHASE_INDEX[ctx.phase] || 0;
      if (ctx.phase === 'preflop' || ctx.phase === 'river') return false;
      if (mana && mana.current < skill.manaCost) return false;

      var skillSystem = ctx && ctx.skillSystem;
      var targets = (ctx.players || []).filter(function(p) {
        return p && p.id !== owner.id && !p.folded && p.isActive !== false;
      });
      if (!targets.length) return false;

      var hasMarkedTarget = !!(skillSystem && typeof skillSystem.hasStatusMark === 'function' && targets.some(function(target) {
        return skillSystem.hasStatusMark(target.id, 'cooler_mark');
      }));
      if (hasMarkedTarget) return false;

      var commit = SkillAI._getCommitRatio(owner);
      var strength = SkillAI._getHandStrength(owner, ctx);
      var toCall = ctx.toCall || 0;
      var pressure = toCall > 0 ? Math.min(1, toCall / Math.max(40, owner.chips * 0.18)) : 0;

      switch (difficulty) {
        case 'noob':
          return Math.random() < 0.04;
        case 'regular':
          if (pi < 1) return false;
          return Math.random() < (0.08 + commit * 0.12 + pressure * 0.10);
        case 'boss':
          return Math.random() < (0.22 + commit * 0.18 + pressure * 0.20 + (strength < 55 ? 0.10 : 0));
        case 'pro':
          return Math.random() < (0.12 + commit * 0.12 + pressure * 0.14 + (strength < 50 ? 0.05 : 0));
        default:
          return false;
      }
    },

    // ---- skill_seal（冻结令）：控制技能，冻结对手技能 2 回合 ----
    // 核心逻辑：在对手刚用过强力技能后封印最有价值，或预防性封印
    _decideSeal(difficulty, skill, owner, ctx, mana) {
      var pi = PHASE_INDEX[ctx.phase] || 0;
      // mana 不足
      if (mana && mana.current < skill.manaCost) return false;

      switch (difficulty) {
        case 'noob':
          return Math.random() < 0.05;
        case 'regular':
          if (pi === 0) return false;
          return Math.random() < 0.15;
        case 'boss':
        case 'pro': {
          // preflop 不封印（对手还没用技能）
          if (pi === 0) return false;
          // flop/turn 是封印的好时机（封住 2 回合 = 封住 turn+river）
          if (pi === 1) return Math.random() < 0.25;
          if (pi === 2) return Math.random() < 0.20;
          // river 也可以封印（防止对手 river 反击）
          if (pi === 3) return Math.random() < 0.10;
          return false;
        }
        default: return false;
      }
    },

    // ---- heart_read（读心）：信息技能 ----
    _decideHeartRead(difficulty, skill, owner, ctx, mana) {
      var pi = PHASE_INDEX[ctx.phase] || 0;
      if (mana && mana.current < skill.manaCost) return false;
      var toCall = ctx.toCall || 0;
      var pot = ctx.pot || 0;
      var infoPressure = toCall > 0 && (toCall >= pot * 0.18 || toCall >= Math.max(40, owner.chips * 0.12));
      var hasRecentScout = !!(owner && owner.ai && owner.ai.scoutMemory && owner.ai.scoutMemory.some(function(entry) {
        return entry && entry.phaseSeen === ctx.phase;
      }));

      switch (difficulty) {
        case 'noob':    return false;
        case 'regular': return pi >= 1 && Math.random() < 0.2;
        case 'pro': {
          // preflop: 读心有信息价值 + 消除T3 curse
          if (pi === 0) return Math.random() < 0.15;
          return Math.random() < 0.3;
        }
        case 'boss': {
          if (infoPressure && !hasRecentScout) {
            if (pi === 0) return Math.random() < 0.32;
            if (pi === 3) return Math.random() < 0.42;
            return Math.random() < 0.50;
          }
          if (pi === 0) return Math.random() < 0.22;
          if (pi === 3) return Math.random() < 0.26;
          return Math.random() < 0.38;
        }
        default:        return false;
      }
    },

    // ---- clairvoyance（估价眼）：建立头寸，至少需要 1 档追加耗蓝 ----
    _decideClairvoyance(difficulty, skill, owner, ctx, mana) {
      var pi = PHASE_INDEX[ctx.phase] || 0;
      if (mana && mana.current < ((skill.manaCost || 0) + 20)) return false;
      var toCall = ctx.toCall || 0;
      var pot = ctx.pot || 0;
      var infoPressure = toCall > 0 && (toCall >= pot * 0.20 || toCall >= Math.max(60, owner.chips * 0.15));
      var hasRecentScout = !!(owner && owner.ai && owner.ai.scoutMemory && owner.ai.scoutMemory.some(function(entry) {
        return entry && entry.phaseSeen === ctx.phase;
      }));

      switch (difficulty) {
        case 'noob':    return Math.random() < 0.05;
        case 'regular': return pi >= 1 && Math.random() < 0.15;
        case 'pro': {
          // preflop: 高价值信息技能，影响翻牌选择
          if (pi === 0) return Math.random() < 0.20;
          // flop/turn: 更积极
          var commit = SkillAI._getCommitRatio(owner);
          return Math.random() < (0.20 + commit * 0.30 + pi * 0.05);
        }
        case 'boss': {
          var commit2 = SkillAI._getCommitRatio(owner);
          if (infoPressure && !hasRecentScout) {
            if (pi === 0) return Math.random() < 0.20;
            if (pi === 3) return Math.random() < 0.34;
            return Math.random() < (0.28 + commit2 * 0.35 + pi * 0.05);
          }
          if (pi === 0) return Math.random() < 0.12;
          if (pi === 3) return Math.random() < 0.16;
          return Math.random() < (0.22 + commit2 * 0.32 + pi * 0.05);
        }
        default: return false;
      }
    },

    // ---- rule_rewrite（规则篡改）：T0, 1/game — 纯混沌，越乱越想用 ----
    // Trixie 的性格：不图赢，图好玩。场上 force 越多越兴奋
    _decideRuleRewrite(difficulty, skill, owner, ctx, pendingForces, mana) {
      var pi = PHASE_INDEX[ctx.phase] || 0;
      if (ctx.phase === 'river') return false;
      if (mana && mana.current < skill.manaCost) return false;
      // 需要有可篡改的对象
      var forceCount = pendingForces ? pendingForces.filter(function(f) {
        return f.ownerId !== owner.id && f.type !== 'null_field' && f.type !== 'void_shield' && f.type !== 'purge_all';
      }).length : 0;
      if (forceCount === 0) return false;

      switch (difficulty) {
        case 'noob':
          // Trixie 是混沌本能——noob 模式下反而更冲动
          return Math.random() < (0.20 + forceCount * 0.10);
        case 'regular':
          if (pi === 0) return Math.random() < 0.10;
          return Math.random() < (0.15 + forceCount * 0.12 + pi * 0.05);
        case 'boss':
        case 'pro': {
          // pro/boss Trixie: 场上 force 越多越值得搅局（信息量大）
          // 但不在 preflop 浪费唯一机会
          if (pi === 0) return false;
          var strength = SkillAI._getHandStrength(owner, ctx);
          // 牌差时更想搅局（反正赢不了，不如搞事）
          var desperation = strength < 40 ? 0.15 : 0;
          return Math.random() < (0.15 + forceCount * 0.10 + desperation + pi * 0.05);
        }
        default: return false;
      }
    },

    // ---- blind_box（盲盒派对）：T1, CD3 — 全场 force 洗牌 ----
    // 核心逻辑：场上 force 对自己不利时（敌方 fortune 多 / 己方 curse 多），用来翻盘
    _decideBlindBox(difficulty, skill, owner, ctx, pendingForces, mana) {
      var pi = PHASE_INDEX[ctx.phase] || 0;
      if (ctx.phase === 'river') return false;
      if (mana && mana.current < skill.manaCost) return false;
      // 需要有足够的 force 才值得打碎重组
      var shuffleableCount = pendingForces ? pendingForces.filter(function(f) {
        return f.attr !== 'void' && f.type !== 'null_field' && f.type !== 'void_shield' && f.type !== 'purge_all';
      }).length : 0;
      if (shuffleableCount < 2) return false; // 少于2个没意义

      // 计算局势：敌方 fortune 和己方被 curse 的数量
      var enemyFortune = 0, myCurse = 0;
      if (pendingForces) {
        for (var i = 0; i < pendingForces.length; i++) {
          var f = pendingForces[i];
          if (f.ownerId !== owner.id && f.type === 'fortune') enemyFortune++;
          if (f.type === 'curse' && f.targetId === owner.id) myCurse++;
        }
      }
      var disadvantage = enemyFortune + myCurse;

      switch (difficulty) {
        case 'noob':
          // 混沌本能：force 多就想搅
          return Math.random() < (0.10 + shuffleableCount * 0.08);
        case 'regular':
          if (pi === 0) return false;
          return Math.random() < (0.08 + disadvantage * 0.12 + shuffleableCount * 0.05);
        case 'boss':
        case 'pro': {
          if (pi === 0) return Math.random() < 0.05;
          // 劣势越大越值得洗牌（反正现在的布局对自己不利）
          return Math.random() < (0.08 + disadvantage * 0.15 + shuffleableCount * 0.04 + pi * 0.03);
        }
        default: return false;
      }
    },

    // ---- absolution（赦免）：Eulalia T0, 整局限1 — 开启三街承灾合同 ----
    // 核心逻辑：场上 curse 压力越高，越值得尽早开出并把后续两街也纳入承灾窗口
    _decideAbsolution(difficulty, skill, owner, ctx, pendingForces, mana) {
      if (ctx.phase === 'river') return false;
      if (mana && mana.current < skill.manaCost) return false;
      var selfCurseCount = 0;
      if (pendingForces) {
        for (var i = 0; i < pendingForces.length; i++) {
          var f = pendingForces[i];
          if (f.type === 'curse' && (f.targetId === owner.id || f.targetId == null)) {
            selfCurseCount++;
          }
        }
      }
      switch (difficulty) {
        case 'noob': return selfCurseCount >= 1 && Math.random() < 0.25;
        case 'regular': return selfCurseCount >= 1 && Math.random() < (0.20 + selfCurseCount * 0.15);
        case 'boss':
        case 'pro':
          // 2+curse时几乎必用，1curse时概率使用
          if (selfCurseCount >= 2) return Math.random() < 0.85;
          if (selfCurseCount >= 1) return Math.random() < 0.45;
          return false; // 无curse不浪费整局限1
        default: return false;
      }
    },

    // ---- benediction（祝福）：Eulalia T2, CD1 — 对非自身目标施加 fortune，并吸取相关 curse 记为承灾 ----
    // 核心逻辑：后续需要按新版 Runtime 目标/吸取语义重做；当前保留 AI 骨架，避免继续扩散旧接口
    _decideBenediction(difficulty, skill, owner, ctx, pendingForces, mana) {
      var pi = PHASE_INDEX[ctx.phase] || 0;
      if (ctx.phase === 'river') return false;
      if (mana && mana.current < skill.manaCost) return false;
      var commit = SkillAI._getCommitRatio(owner);
      var hasCurseOnSelf = false;
      if (pendingForces) {
        for (var i = 0; i < pendingForces.length; i++) {
          var f = pendingForces[i];
          if (f.type === 'curse' && (f.targetId === owner.id || f.targetId == null)) {
            hasCurseOnSelf = true;
            break;
          }
        }
      }
      var curseBonus = hasCurseOnSelf ? 0.25 : 0;
      switch (difficulty) {
        case 'noob': return Math.random() < (0.12 + curseBonus);
        case 'regular':
          if (pi === 0) return false;
          return Math.random() < (0.10 + commit * 0.25 + curseBonus + pi * 0.04);
        case 'boss':
        case 'pro':
          if (pi === 0) return Math.random() < (0.06 + curseBonus);
          return Math.random() < (0.12 + commit * 0.30 + curseBonus + pi * 0.05);
        default: return false;
      }
    },

    // ---- house_edge（抽水）：Kuzuha T0, 整局限1 — fortune(P50)+群体curse(P15) ----
    // 核心逻辑：攻防一体的强技能，投入较大时或中后期使用
    _decideHouseEdge(difficulty, skill, owner, ctx, pendingForces, mana) {
      var pi = PHASE_INDEX[ctx.phase] || 0;
      if (ctx.phase === 'river') return false;
      if (mana && mana.current < skill.manaCost) return false;
      var commit = SkillAI._getCommitRatio(owner);
      switch (difficulty) {
        case 'noob': return Math.random() < 0.18;
        case 'regular':
          if (pi === 0) return false;
          return Math.random() < (0.12 + commit * 0.30 + pi * 0.08);
        case 'boss':
        case 'pro':
          // T0整局限1: flop/turn中高投入时使用
          if (pi === 0) return Math.random() < 0.06;
          return Math.random() < (0.15 + commit * 0.35 + pi * 0.08);
        default: return false;
      }
    },

    // ---- debt_call（催收）：Kuzuha T1, CD3 — debt rot 催收（Runtime 接入后实现） ----
    // 核心逻辑：敌方fortune多时最有价值（相当于反转局势），己方fortune少时才用
    _decideTableFlip(difficulty, skill, owner, ctx, pendingForces, mana) {
      var pi = PHASE_INDEX[ctx.phase] || 0;
      if (ctx.phase === 'river') return false;
      if (mana && mana.current < skill.manaCost) return false;
      var enemyFortune = 0, myFortune = 0;
      if (pendingForces) {
        for (var i = 0; i < pendingForces.length; i++) {
          var f = pendingForces[i];
          if (f.type === 'fortune' && f.ownerId !== owner.id) enemyFortune++;
          if (f.type === 'fortune' && f.ownerId === owner.id) myFortune++;
        }
      }
      // 只有敌方fortune > 己方fortune时才值得掀桌
      var advantage = enemyFortune - myFortune;
      switch (difficulty) {
        case 'noob':
          return enemyFortune >= 1 && Math.random() < (0.12 + enemyFortune * 0.10);
        case 'regular':
          if (pi === 0) return false;
          if (advantage <= 0) return false;
          return Math.random() < (0.10 + advantage * 0.18);
        case 'boss':
        case 'pro':
          if (pi === 0) return false;
          if (advantage <= 0 && enemyFortune < 2) return false;
          return Math.random() < (0.10 + advantage * 0.20 + enemyFortune * 0.08);
        default: return false;
      }
    },

    _getCommitRatio(owner) {
      var invested = Math.max(owner.totalBet || 0, owner.currentBet || 0);
      var startStack = invested + (owner.chips || 0);
      return startStack > 0 ? Math.min(1, invested / startStack) : 0;
    },

    _getSkillEconomyState(skill, owner, ctx, pendingForces, mana) {
      var bb = Math.max(1, Number(ctx && ctx.blinds || 20));
      var pot = Math.max(0, Number(ctx && ctx.pot || 0));
      var toCall = Math.max(0, Number(ctx && ctx.toCall || 0));
      var commit = SkillAI._getCommitRatio(owner);
      var ownerLiveStack = Math.max(1, Number((owner && owner.chips || 0) + (owner && owner.currentBet || 0)));
      var effectiveStack = ownerLiveStack;
      var players = ctx && Array.isArray(ctx.players) ? ctx.players : [];
      for (var i = 0; i < players.length; i++) {
        var player = players[i];
        if (!player || player.id === owner.id || player.folded || player.isActive === false) continue;
        var oppLiveStack = Math.max(1, Number((player.chips || 0) + (player.currentBet || 0)));
        effectiveStack = Math.min(effectiveStack, oppLiveStack);
      }
      effectiveStack = Math.max(1, effectiveStack);
      var potBb = pot / bb;
      var pressure = Math.max(
        commit,
        pot / effectiveStack,
        toCall / ownerLiveStack
      );
      var hostilePressure = 0;
      if (Array.isArray(pendingForces)) {
        for (var fi = 0; fi < pendingForces.length; fi++) {
          var force = pendingForces[fi];
          if (!force || force.ownerId === owner.id) continue;
          if (force.type === 'curse' && (force.targetId == null || force.targetId === owner.id)) {
            hostilePressure += Math.max(0, Number(force.power || 0));
          } else if ((force.type === 'fortune' || force.attr === 'fortune') && Number(force.power || 0) >= 20) {
            hostilePressure += Math.max(0, Number(force.power || 0)) * 0.5;
          }
        }
      }
      return {
        bb: bb,
        pot: pot,
        potBb: potBb,
        toCall: toCall,
        commit: commit,
        effectiveStack: effectiveStack,
        pressure: pressure,
        hostilePressure: hostilePressure,
        manaRatio: mana && mana.max ? Math.max(0, Number(mana.current || 0)) / Math.max(1, Number(mana.max || 1)) : 1
      };
    },

    _passesSkillEconomyGate(difficulty, skill, owner, ctx, pendingForces, mana) {
      if (!skill || !ctx || skill.activation !== 'active') return true;
      var state = SkillAI._getSkillEconomyState(skill, owner, ctx, pendingForces, mana);
      var isInfoSkill = !!INFO_SKILL_EFFECTS[skill.effect];
      var isUltimate = (skill.tier != null && skill.tier <= 1) || !!skill.usesPerGame || (skill.manaCost || 0) >= 25;
      var isMajor = !isUltimate && (((skill.manaCost || 0) >= 15) || skill.tier === 2);

      if (state.hostilePressure >= 30) return true;

      // 小锅且无人给压力时，不要在免费街面里白白砸高费技能。
      if (!isInfoSkill && state.toCall <= 0 && state.potBb < 10 && state.pressure < 0.12) {
        if (isUltimate || isMajor) return false;
      }

      if (isInfoSkill) {
        if (ctx.phase === 'preflop') {
          return state.potBb >= 5 || state.toCall >= state.bb * 2 || state.pressure >= 0.10;
        }
        return state.potBb >= 6 || state.toCall >= state.bb * 2 || state.pressure >= 0.12;
      }

      if (isUltimate) {
        if (ctx.phase === 'preflop') return (state.potBb >= 12 && state.pressure >= 0.12) || state.pressure >= 0.24;
        if (ctx.phase === 'flop') return (state.potBb >= 10 && state.pressure >= 0.12) || state.pressure >= 0.22;
        if (ctx.phase === 'turn') return (state.potBb >= 9 && state.pressure >= 0.10) || state.pressure >= 0.18;
        return (state.potBb >= 7 && state.pressure >= 0.08) || state.pressure >= 0.15;
      }

      if (isMajor) {
        if (ctx.phase === 'preflop') return (state.potBb >= 7 && state.pressure >= 0.08) || state.pressure >= 0.16;
        if (ctx.phase === 'flop') return (state.potBb >= 8 && state.pressure >= 0.08) || state.pressure >= 0.14;
        if (ctx.phase === 'turn') return (state.potBb >= 6 && state.pressure >= 0.06) || state.pressure >= 0.12;
        if (ctx.phase === 'river') return (state.potBb >= 5 && state.pressure >= 0.05) || state.pressure >= 0.10;
      }

      if ((skill.manaCost || 0) >= 10 && state.manaRatio < 0.45 && state.potBb < 4 && state.pressure < 0.08) {
        return false;
      }
      return true;
    },

    /**
     * 获取 NPC 当前手牌强度 (0-100)
     * preflop 用 preflopStrength，flop+ 用 pokersolver
     */
    _getHandStrength(owner, ctx) {
      if (!owner.cards || owner.cards.length < 2) return 30; // 默认中等
      var board = ctx.board || [];
      if (board.length === 0) {
        return evaluatePreflopStrength(owner.cards);
      }
      var result = evaluateHandStrength(owner.cards, board);
      return HAND_STRENGTH_MAP[result.rank] || 30;
    },

    // ================================================================
    //  pickCurseTarget — Curse 选目标
    // ================================================================

    /**
     * 为 Curse 选择最佳目标
     *
     * 策略由 difficulty 决定：
     *   noob    → Chip Leader:      筹码最多的对手 + 随机性
     *   regular → Pot Commitment:   诅咒投入底池最多的对手（沉没成本最大）
     *   pro     → Threat Assessment: 综合下注量+筹码量评估威胁度
     *
     * @param {string} difficulty - 'noob' | 'regular' | 'pro'
     * @param {number} casterId  - 施法者 ID
     * @param {Array}  players   - gameContext.players
     * @returns {number} targetId
     */
    pickCurseTarget(difficulty, casterId, players) {
      if (!players || !players.length) {
        return casterId === 0 ? 1 : 0;
      }

      // all-in 玩家仍是有效目标（chips===0 但未弃牌）
      var candidates = players.filter(function(p) {
        return p.id !== casterId && !p.folded && p.isActive !== false;
      });

      if (candidates.length === 0) {
        // 无有效目标时，选任意非施法者
        var fallback = players.filter(function(p) { return p.id !== casterId && p.isActive !== false; });
        return fallback.length > 0 ? fallback[0].id : (casterId === 0 ? 1 : 0);
      }

      switch (difficulty) {
        case 'boss':
        case 'pro':     return SkillAI._targetByThreat(candidates);
        case 'regular': return SkillAI._targetByPotCommitment(candidates);
        default:        return SkillAI._targetByChips(candidates);
      }
    },

    /**
     * Chip Leader + Random — 筹码最多的对手，但有 30% 随机
     * 适用：noob AI（直觉型，谁钱多打谁，但不精准）
     */
    _targetByChips(candidates) {
      // 30% 纯随机
      if (Math.random() < 0.3) {
        return candidates[Math.floor(Math.random() * candidates.length)].id;
      }
      // 70% 选筹码最多的
      candidates.sort(function(a, b) { return (b.chips || 0) - (a.chips || 0); });
      return candidates[0].id;
    },

    /**
     * Pot Commitment — 诅咒投入底池最多的对手（加权随机）
     * 适用：regular AI
     * 逻辑：投入越多权重越高，但不是100%确定性
     */
    _targetByPotCommitment(candidates) {
      var weights = candidates.map(function(p) {
        return Math.max(1, (p.totalBet || 0) + (p.currentBet || 0) + (p.chips || 0) * 0.1);
      });
      return SkillAI._weightedPick(candidates, weights);
    },

    /**
     * Threat Assessment — 综合威胁度评估（加权随机）
     * 适用：pro AI（"拥有魔力的高手能感知势头"）
     * 逻辑：威胁分 = 下注量×0.7 + 筹码量×0.3，按威胁分加权随机
     */
    _targetByThreat(candidates) {
      var maxInvested = Math.max(1, Math.max.apply(null, candidates.map(function(p) { return (p.totalBet || 0) + (p.currentBet || 0); })));
      var maxChips = Math.max(1, Math.max.apply(null, candidates.map(function(p) { return p.chips || 0; })));

      var weights = candidates.map(function(p) {
        var invested = (p.totalBet || 0) + (p.currentBet || 0);
        return Math.max(0.1, (invested / maxInvested) * 0.7 + ((p.chips || 0) / maxChips) * 0.3);
      });
      return SkillAI._weightedPick(candidates, weights);
    },

    /**
     * 加权随机选择 — 权重越高被选中概率越大，但不是100%确定
     */
    _weightedPick(candidates, weights) {
      var total = weights.reduce(function(s, w) { return s + w; }, 0);
      var r = Math.random() * total;
      var cumulative = 0;
      for (var i = 0; i < candidates.length; i++) {
        cumulative += weights[i];
        if (r <= cumulative) return candidates[i].id;
      }
      return candidates[candidates.length - 1].id;
    }
  };

  // ========== 导出 ==========
  global.PokerAI = PokerAI;
  global.PokerAI.ACTIONS = ACTIONS;
  global.PokerAI.RISK_PROFILES = RISK_PROFILES;
  global.PokerAI.DIFFICULTY_PROFILES = DIFFICULTY_PROFILES;
  global.PokerAI.EMOTION_PROFILES = EMOTION_PROFILES;
  global.PokerAI.evaluateHandStrength = evaluateHandStrength;
  global.PokerAI.evaluatePreflopStrength = evaluatePreflopStrength;
  global.PokerAI.cardToString = cardToString;
  global.PokerAI.SkillAI = SkillAI;
  global.PokerAI.NpcRoleDirector = NpcRoleDirector;
  global.PokerAI.BehaviorFSM = BehaviorFSM;
  global.PokerAI.FSM_STATES = FSM_STATES;
  global.PokerAI.BossScript = BossScript;
  global.PokerAI.BOSS_PHASES = BOSS_PHASES;
  global.PokerAI.OpponentModel = OpponentModel;

})(typeof window !== 'undefined' ? window : global);
