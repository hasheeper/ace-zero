/**
 * Poker AI split module: Profiles.
 */
(function(global) {
  'use strict';

  var modules = global.PokerAIModules || (global.PokerAIModules = {});
  var register = modules.register || function(moduleName, value) {
    modules[moduleName] = value;
    return value;
  };

  const PHASE_INDEX = {
    idle: -1,
    preflop: 0,
    flop: 1,
    turn: 2,
    river: 3,
    showdown: 4
  };
  const RIVER_INFO_SKILL_EFFECTS = {
    psyche: 1,
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

  function normalizeSkillAiDifficulty(type) {
    const normalized = normalizeDifficultyType(type);
    return DIFFICULTY_PROFILES && DIFFICULTY_PROFILES[normalized] ? normalized : 'regular';
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


  register('Profiles', {
    PHASE_INDEX: PHASE_INDEX,
    RIVER_INFO_SKILL_EFFECTS: RIVER_INFO_SKILL_EFFECTS,
    SPECIAL_DIFFICULTY_BASE: SPECIAL_DIFFICULTY_BASE,
    RISK_PROFILES: RISK_PROFILES,
    DIFFICULTY_PROFILES: DIFFICULTY_PROFILES,
    EMOTION_PROFILES: EMOTION_PROFILES,
    normalizeDifficultyType: normalizeDifficultyType,
    normalizeSkillAiDifficulty: normalizeSkillAiDifficulty,
    clampNumber: clampNumber
  });
})(typeof window !== 'undefined' ? window : global);
