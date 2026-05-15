/* global EquityEstimator */

/**
 * Poker AI split module: ActionAI.
 */
(function(global) {
  'use strict';

  var modules = global.PokerAIModules || (global.PokerAIModules = {});
  var register = modules.register || function(moduleName, value) {
    modules[moduleName] = value;
    return value;
  };

  var RoleRuntime = global.RoleRuntime || {};
  var deriveRoleMeta = RoleRuntime.deriveRoleMeta || function(entity) {
    if (!entity) return { roleId: 'UNKNOWN', roleVariant: 'base' };
    return {
      roleId: entity.roleId || entity.name || entity.ownerName || 'UNKNOWN',
      roleVariant: entity.roleVariant || 'base'
    };
  };
  var Profiles = modules.Profiles || {};
  var CardUtils = modules.CardUtils || {};
  var UtilityScorer = modules.UtilityScorer || {};
  var StateModels = modules.StateModels || {};
  var OpponentModelModule = modules.OpponentModel || {};
  var DestinyAwareEquity = modules.DestinyAwareEquity || null;

  var normalizeDifficultyType = Profiles.normalizeDifficultyType || function(type) { return type || 'regular'; };
  var clampNumber = Profiles.clampNumber || function(value, min, max) { return Math.max(min, Math.min(max, value)); };
  var RISK_PROFILES = Profiles.RISK_PROFILES || {};
  var DIFFICULTY_PROFILES = Profiles.DIFFICULTY_PROFILES || {};
  var EMOTION_PROFILES = Profiles.EMOTION_PROFILES || {};

  var HAND_STRENGTH_MAP = CardUtils.HAND_STRENGTH_MAP || {};
  var evaluateHandStrength = CardUtils.evaluateHandStrength || function() { return { rank: 0, name: 'Invalid' }; };
  var evaluatePreflopStrength = CardUtils.evaluatePreflopStrength || function() { return 0; };
  var cardToString = CardUtils.cardToString || function() { return ''; };

  var ACTIONS = UtilityScorer.ACTIONS || { FOLD: 'fold', CHECK: 'check', CALL: 'call', RAISE: 'raise', ALL_IN: 'allin' };
  var UTILITY_WEIGHTS = UtilityScorer.UTILITY_WEIGHTS || {};
  var TEMPERATURE = UtilityScorer.TEMPERATURE || {};
  var SCOUT_INFO_RANK = UtilityScorer.SCOUT_INFO_RANK || {};
  var RISK_AGGRO_DELTA = UtilityScorer.RISK_AGGRO_DELTA || {};
  var EMOTION_TEMP_DELTA = UtilityScorer.EMOTION_TEMP_DELTA || {};
  var scoreHand = UtilityScorer.scoreHand;
  var scorePotOdds = UtilityScorer.scorePotOdds;
  var scorePosition = UtilityScorer.scorePosition;
  var scoreOpponent = UtilityScorer.scoreOpponent;
  var scoreMagic = UtilityScorer.scoreMagic;
  var scoreAggro = UtilityScorer.scoreAggro;
  var scoreFoldResourcePenalty = UtilityScorer.scoreFoldResourcePenalty;
  var softmaxSelect = UtilityScorer.softmaxSelect;
  var calculateBetSize = UtilityScorer.calculateBetSize;

  var BehaviorFSM = StateModels.BehaviorFSM;
  var BossScript = StateModels.BossScript;
  var OpponentModel = OpponentModelModule.OpponentModel;

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
      const aiPlayerId = context.playerId != null ? context.playerId : (context.aiPlayerId != null ? context.aiPlayerId : null);
      const magicLevel = context.magicLevel || 0;
      const netForce = context.netForce || 0;
      const opponents = activeOpponentCount || 1;
      const raiseCount = context.raiseCount || 0;

      // 0. 心理修正：累积技能池效果 × 定力放大系数
      const mods = context.mentalModifiers;
      const origRisk = this.risk;
      const origDiff = this.difficulty;
      const shouldRestoreRuntimeProfiles = !!mods;
      try {
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
      let physicalEquity = null;
      let destinyInfo = null;
      const rawStrength = this.calculateRawStrength(holeCards, boardCards, phase);

      if ((this.difficultyType === 'pro' || this.difficultyType === 'boss') &&
          DestinyAwareEquity &&
          aiPlayerId != null &&
          context.visibleForces &&
          context.visibleForces.length > 0 &&
          phase !== 'river') {
        try {
          destinyInfo = DestinyAwareEquity.estimate({
            heroId: aiPlayerId,
            playerId: aiPlayerId,
            playerName: playerName,
            holeCards: holeCards,
            boardCards: boardCards || [],
            phase: phase,
            players: context.visiblePlayers || [],
            visiblePlayers: context.visiblePlayers || [],
            visibleForces: context.visibleForces || [],
            scoutMemory: this.scoutMemory || [],
            samplesPerCandidate: this.difficultyType === 'boss' ? 5 : 4,
            maxMs: this.difficultyType === 'boss' ? 24 : 18
          });
        } catch (destinyErr) {
          destinyInfo = { applied: false, reason: 'error', notes: ['error'] };
          console.warn('[AI] destiny equity failed:', destinyErr);
        }
      }

      if (destinyInfo && destinyInfo.applied) {
        physicalEquity = destinyInfo.physicalEquity;
        equity = destinyInfo.destinyEquity;
      } else if (this.difficultyType === 'noob') {
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

      // 1.4 旧版魔运勇气加成：命运感知已接管时不再重复加成
      let magicBonus = 0;
      if ((this.difficultyType === 'pro' || this.difficultyType === 'boss') &&
          netForce > 0 &&
          !(destinyInfo && destinyInfo.applied)) {
        // 只作为缺少 force 快照时的兜底，避免与 DestinyAwareEquity 双重计算。
        magicBonus = Math.min(0.08, netForce * 0.0015);
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

      // Profile-level perception: weak AI may misread equity a little; pro/boss stay nearly exact.
      const profileNoiseRange = clampNumber(Number(this.difficulty.noiseRange || 0), 0, 35);
      const profileOptimism = clampNumber(Number(this.difficulty.optimism || 0), -40, 40);
      const perceptionNoise = profileNoiseRange > 0
        ? (Math.random() * 2 - 1) * (profileNoiseRange / 500)
        : 0;
      const optimismBias = clampNumber(profileOptimism / 500, -0.08, 0.08);
      const perceptionDelta = perceptionNoise + optimismBias;
      if (perceptionDelta !== 0) {
        equity = Math.max(0.01, Math.min(0.99, equity + perceptionDelta));
      }

      // 2. 构建可用候选动作（equity 用于硬性门控 all-in）
      const candidates = this._buildCandidates(toCall, aiStack, minRaise, pot, equity, phase, rawStrength, magicLevel, netForce);

      // 3. 计算每个候选动作的效用分
      const potOdds = toCall > 0 ? toCall / (pot + toCall) : 0;
      const w = Object.assign({}, UTILITY_WEIGHTS[this.difficultyType] || UTILITY_WEIGHTS.regular);
      const potOddsAwareness = clampNumber(Number(this.difficulty.potOddsAwareness || 0), 0, 1);
      const positionAwareness = clampNumber(Number(this.difficulty.positionAwareness || 0), 0, 1);
      const valueBetAwareness = clampNumber(Number(this.difficulty.valueBetAwareness || 0), 0, 1);
      w.potOdds *= potOddsAwareness;
      w.position *= positionAwareness;
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
      const primaryOpponentProfile = this._selectPrimaryOpponentProfile(context);
      const primaryOpponentId = primaryOpponentProfile && primaryOpponentProfile.id != null
        ? primaryOpponentProfile.id
        : heroId;
      const oppManaRatio = context.opponentManaRatio != null ? context.opponentManaRatio : 0.5;

      // 强牌保护：pro/boss 不弃强牌
      // preflop: raw>=65 (JJ+/AKs), postflop: raw>=50 或 equity>=70%
      // MC equity 在多人桌可能严重低估，所以用 raw + 筹码承受力兜底
      const potOddsRatio = toCall > 0 ? toCall / (pot + toCall) : 0;
      let strongHandProtect = false;
      let strongProtectReason = '';
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
          strongHandProtect = true;
          strongProtectReason = madeHandProtect ? 'made' : 'equity';
          console.log('[AI] ' + playerName + ' strong-hand-protect: raw=' + rawStrength +
            ' eq=' + (equity * 100).toFixed(0) + ' toCall=' + toCall + ' stack=' + aiStack +
            ' phase=' + phase + ' → utility guard');
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
            ? this.opponentModel.score(primaryOpponentId, oppManaRatio, a)
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
            const valueGap = (equityPct - this.risk.valueBetThreshold) / 30;
            if (valueGap > 0) {
              const valueSizeMod = s === 'small' ? 0.55
                : s === 'medium' ? 0.75
                  : s === 'large' ? 0.60
                    : s === 'allin' ? 0.20
                      : 0.50;
              u += Math.min(0.65, valueGap * valueBetAwareness * valueSizeMod);
            }
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

          if (strongHandProtect) {
            if (a === ACTIONS.FOLD) {
              u -= 8.0;
            } else if (a === ACTIONS.CALL) {
              u += 1.25;
            } else if (a === ACTIONS.RAISE) {
              const clearValueRaise = phase === 'preflop'
                ? rawStrength >= 73
                : (rawStrength >= 62 || handRank >= 3 || equity >= 0.66);
              if (clearValueRaise) {
                const protectSizeMod = s === 'small' ? 0.85
                  : s === 'medium' ? 0.70
                    : s === 'large' ? 0.35
                      : s === 'allin' ? 0.05
                        : 0.50;
                u += protectSizeMod + valueBetAwareness * 0.25;
              }
            }
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

      const selection = softmaxSelect(utilities, temperature);
      let chosenIdx = selection.index;
      const probs = selection.probs;
      let strongProtectForced = false;
      if (strongHandProtect && candidates[chosenIdx] && candidates[chosenIdx].action === ACTIONS.FOLD) {
        let bestIdx = chosenIdx;
        let bestUtility = -Infinity;
        for (let i = 0; i < candidates.length; i++) {
          if (candidates[i].action === ACTIONS.FOLD) continue;
          if (utilities[i] > bestUtility) {
            bestUtility = utilities[i];
            bestIdx = i;
          }
        }
        if (bestIdx !== chosenIdx) {
          chosenIdx = bestIdx;
          strongProtectForced = true;
        }
      }
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
      const perceptionTag = Math.abs(perceptionDelta) >= 0.005
        ? ' perceive=' + (perceptionDelta >= 0 ? '+' : '') + (perceptionDelta * 100).toFixed(1)
        : '';
      const protectTag = strongHandProtect
        ? ' protect=' + strongProtectReason + (strongProtectForced ? ':forced' : '')
        : '';
      const destinyTag = destinyInfo && destinyInfo.applied
        ? ' destiny=' + (destinyInfo.delta >= 0 ? '+' : '') + (destinyInfo.delta * 100).toFixed(0) +
          ' enemyF=' + Math.round(destinyInfo.enemyFortunePressure || 0) +
          (destinyInfo.mainBeneficiaryId != null ? ' benef=' + destinyInfo.mainBeneficiaryId : '')
        : '';
      const reason = 'eq=' + (equity * 100).toFixed(0) + ' T=' + temperature.toFixed(1) +
        fsmTag + bossTag + specialTag + perceptionTag + protectTag + destinyTag +
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
          (physicalEquity != null ? ' phys=' + (physicalEquity * 100).toFixed(0) : '') +
          ' magic=' + magicLevel + ' net=' + netForce +
          (Math.abs(perceptionDelta) >= 0.005 ? ' perceive=' + (perceptionDelta >= 0 ? '+' : '') + (perceptionDelta * 100).toFixed(1) : '') +
          (readBonus > 0 ? ' read=+' + (readBonus * 100).toFixed(0) : '') +
          (strongHandProtect ? ' protect=' + strongProtectReason + (strongProtectForced ? ':forced' : '') : '') +
          (scoutMods.notes.length > 0 ? ' scout=' + scoutMods.notes.join('|') : '') +
        (destinyInfo && destinyInfo.applied ? ' destiny=' + (destinyInfo.delta >= 0 ? '+' : '') + (destinyInfo.delta * 100).toFixed(0) +
          ' enemyF=' + Math.round(destinyInfo.enemyFortunePressure || 0) +
          (destinyInfo.mainBeneficiaryId != null ? ' benef=' + destinyInfo.mainBeneficiaryId : '') : '') +
        (magicBonus > 0 ? ' mcourage=+' + (magicBonus * 100).toFixed(0) : '') +
        ' | pot=' + pot + ' toCall=' + toCall + ' stack=' + aiStack +
        ' opp=' + opponents +
        ' T=' + temperature.toFixed(1) +
        ' → ' + decision.action.toUpperCase() +
        (decision.amount > 0 ? ' ' + decision.amount : '') +
        ' (p=' + (probs[chosenIdx] * 100).toFixed(0) + '%)'
      );

      return decision;
      } finally {
        if (shouldRestoreRuntimeProfiles) {
          this.risk = origRisk;
          this.difficulty = origDiff;
        }
      }
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

      _selectPrimaryOpponentProfile(ctx) {
        const profiles = Array.isArray(ctx && ctx.opponentProfiles) ? ctx.opponentProfiles : [];
        if (profiles.length === 0) return null;

        let bestAggressor = null;
        let bestAggressorBet = -1;
        for (const opp of profiles) {
          if (!opp) continue;
          const currentBet = Math.max(0, Number(opp.currentBet || 0));
          if (opp.isCurrentAggressor && currentBet >= bestAggressorBet) {
            bestAggressor = opp;
            bestAggressorBet = currentBet;
          }
        }
        if (bestAggressor) return bestAggressor;

        if (ctx && Number(ctx.toCall || 0) > 0) {
          let maxBetOpp = null;
          let maxBet = -1;
          for (const opp of profiles) {
            if (!opp) continue;
            const currentBet = Math.max(0, Number(opp.currentBet || 0));
            if (currentBet > maxBet) {
              maxBet = currentBet;
              maxBetOpp = opp;
            }
          }
          if (maxBetOpp && maxBet > 0) return maxBetOpp;
        }

        for (const opp of profiles) {
          if (opp && opp.isPrimaryThreat) return opp;
        }

        let richestOpp = null;
        let richestStack = -1;
        for (const opp of profiles) {
          if (!opp) continue;
          const liveStack = Math.max(0, Number(opp.chips || 0)) + Math.max(0, Number(opp.currentBet || 0));
          if (liveStack > richestStack) {
            richestStack = liveStack;
            richestOpp = opp;
          }
        }
        return richestOpp;
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

        // 找到当前最大下注者（最可能是施压者），优先使用调用方标记的当前施压者。
        let maxBetOpp = this._selectPrimaryOpponentProfile(ctx);
        let maxBet = maxBetOpp ? Math.max(0, Number(maxBetOpp.currentBet || 0)) : 0;
        if (!maxBetOpp || maxBet <= 0) {
          maxBetOpp = null;
          maxBet = 0;
          for (const opp of profiles) {
            const currentBet = Math.max(0, Number(opp && opp.currentBet || 0));
            if (currentBet > maxBet) {
              maxBet = currentBet;
              maxBetOpp = opp;
            }
          }
        }
        if (!maxBetOpp) return 0;
        if (maxBetOpp.isHuman || maxBetOpp.difficulty === 'human') return 0;

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
        const baseBluff = Object.prototype.hasOwnProperty.call(BLUFF_BASE, maxBetOpp.difficulty)
          ? BLUFF_BASE[maxBetOpp.difficulty]
          : 0;
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


  register('ActionAI', {
    PokerAI: PokerAI
  });
})(typeof window !== 'undefined' ? window : global);
