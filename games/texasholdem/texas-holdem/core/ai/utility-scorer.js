/**
 * Poker AI split module: UtilityScorer.
 */
(function(global) {
  'use strict';

  var modules = global.PokerAIModules || (global.PokerAIModules = {});
  var register = modules.register || function(moduleName, value) {
    modules[moduleName] = value;
    return value;
  };

  const ACTIONS = {
    FOLD: 'fold',
    CHECK: 'check',
    CALL: 'call',
    RAISE: 'raise',
    ALL_IN: 'allin'
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
    psyche: 1,
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


  register('UtilityScorer', {
    ACTIONS: ACTIONS,
    ACTION_CANDIDATES: ACTION_CANDIDATES,
    UTILITY_WEIGHTS: UTILITY_WEIGHTS,
    TEMPERATURE: TEMPERATURE,
    SCOUT_INFO_RANK: SCOUT_INFO_RANK,
    RISK_AGGRO_DELTA: RISK_AGGRO_DELTA,
    EMOTION_TEMP_DELTA: EMOTION_TEMP_DELTA,
    INFO_SKILL_EFFECTS: INFO_SKILL_EFFECTS,
    scoreHand: scoreHand,
    scorePotOdds: scorePotOdds,
    scorePosition: scorePosition,
    scoreOpponent: scoreOpponent,
    scoreMagic: scoreMagic,
    scoreAggro: scoreAggro,
    scoreFoldResourcePenalty: scoreFoldResourcePenalty,
    softmaxSelect: softmaxSelect,
    calculateBetSize: calculateBetSize
  });
})(typeof window !== 'undefined' ? window : global);
