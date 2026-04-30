/**
 * Core Module: MentalPressureSystem
 * 角色：心理战与定力系统。
 *
 * 职责：
 * - 管理定力、心理状态与抗性面板
 * - 结算压场 / 挑衅 / 试探 / 定神
 * - 维护 stable / shaken / unsteady / broken 等状态
 * - 向 AI 与 UI 暴露心理修正结果
 *
 * 暴露：
 * - `window.MentalPressureSystem`
 *
 * 边界：
 * - 只负责心理战资源与状态
 * - 不负责技能注册、选牌、角色模块注册
 */

(function (global) {
  'use strict';

  // ========== 常量 ==========

  const PRESSURE_TYPE = {
    PRESENCE: 'presence',  // 压场
    TAUNT: 'taunt',        // 挑衅
    PROBE: 'probe'         // 试探
  };

  const COMPOSURE_STATE = {
    STABLE: 'stable',      // >= 70%
    SHAKEN: 'shaken',      // 40-70%
    UNSTEADY: 'unsteady',  // 15-40%
    BROKEN: 'broken'       // < 15%
  };

  // 属性映射
  const ATTR_MAP = {
    [PRESSURE_TYPE.PRESENCE]: 'moirai',
    [PRESSURE_TYPE.TAUNT]: 'chaos',
    [PRESSURE_TYPE.PROBE]: 'psyche'
  };

  // 抗性映射
  const RESIST_MAP = {
    [PRESSURE_TYPE.PRESENCE]: 'resistPresence',
    [PRESSURE_TYPE.TAUNT]: 'resistTaunt',
    [PRESSURE_TYPE.PROBE]: 'resistProbe'
  };

  // ========== MentalPressureSystem 类 ==========

  class MentalPressureSystem {
    constructor() {
      this.players = {};  // playerId -> mental data
    }

    /**
     * 初始化玩家心理面板
     */
    initPlayer(playerId, config = {}) {
      // emotion影响composureMax
      const emotionMod = {
        calm: 0,
        confident: 20,
        focused: 15,
        relaxed: 10,
        tilt: -30,
        fearful: -15,
        desperate: -25
      }[config.emotion] || 0;
      const maxComposure = (config.composureMax || 100) + emotionMod;

      console.log('[Mental Init] Player ' + playerId + ' emotion=' + config.emotion + ' composureMax=' + maxComposure);

      this.players[playerId] = {
        discipline: config.discipline || 50,
        composureMax: maxComposure,
        composure: config.composure || maxComposure,
        resistPresence: config.resistPresence || 0,
        resistTaunt: config.resistTaunt || 0,
        resistProbe: config.resistProbe || 0,
        lastPressureType: null,
        pressureReduction: 1.0,
        traits: config.traits || {},
        equityBias: 0,
        confidenceLevel: 70,
        truthMode: false,
        mentalSkillUsedThisRound: false,
        pressureStack: { presence: 0, taunt: 0, probe: 0 }
      };
    }

    /**
     * 获取玩家属性值（从外部属性系统）
     */
    _getPlayerAttr(playerId, attr) {
      // 这里需要从外部获取，暂时返回0
      // 实际使用时需要注入属性系统引用
      if (this.getAttributeCallback) {
        return this.getAttributeCallback(playerId, attr);
      }
      return 0;
    }

    /**
     * 设置属性获取回调
     */
    setAttributeCallback(callback) {
      this.getAttributeCallback = callback;
    }

    /**
     * 压制技能结算
     */
    applyPressure(userId, targetId, skillType, basePower, equityBias = 0, confidenceDelta = 0) {
      const user = this.players[userId];
      const target = this.players[targetId];

      if (!user || !target) {
        console.error('[MentalPressure] Invalid player ID', userId, targetId);
        return null;
      }

      const composureBefore = target.composure;
      const stateBefore = this.getComposureState(targetId);

      // 获取使用者对应属性
      const attr = ATTR_MAP[skillType];
      const userAttr = this._getPlayerAttr(userId, attr);

      // 获取目标抗性
      const resistKey = RESIST_MAP[skillType];
      const resist = target[resistKey] || 0;

      // 特性修正
      const traitKey = `outgoing${skillType.charAt(0).toUpperCase() + skillType.slice(1)}Mod`;
      const userTraitMod = user.traits[traitKey] || 1.0;

      const vulnKey = `${skillType}Vulnerability`;
      const targetVulnMod = target.traits[vulnKey] || 1.0;

      // 暴击机制：15%概率造成1.5-2.0倍伤害
      const isCrit = Math.random() < 0.15;
      const critMultiplier = isCrit ? (1.5 + Math.random() * 0.5) : 1.0;

      // 随机浮动：±20%
      const randomFactor = 0.8 + Math.random() * 0.4;

      // 计算最终压制值
      const finalPressure = basePower
        * (1 + userAttr / 100)
        * userTraitMod
        * targetVulnMod
        * 100 / (100 + target.discipline + resist)
        * target.pressureReduction
        * randomFactor
        * critMultiplier;

      // 应用压制
      target.composure -= finalPressure;
      target.composure = Math.max(0, target.composure);
      target.lastPressureType = skillType;

      // 累积技能效果强度
      target.pressureStack[skillType] += finalPressure;

      // 应用胜率影响
      if (equityBias !== 0 && !target.truthMode) {
        target.equityBias += equityBias;
        target.equityBias = Math.max(-30, Math.min(30, target.equityBias));
      }

      if (confidenceDelta !== 0 && !target.truthMode) {
        target.confidenceLevel += confidenceDelta;
        target.confidenceLevel = Math.max(0, Math.min(100, target.confidenceLevel));
      }

      // 重置压制减免
      target.pressureReduction = 1.0;

      // 计算效果等级（基于定力上限）
      const effectRatio = target.composureMax > 0 ? finalPressure / target.composureMax : 0;
      let effectLevel = 'none';
      if (effectRatio >= 0.20) effectLevel = 'excellent';
      else if (effectRatio >= 0.10) effectLevel = 'effective';
      else if (effectRatio >= 0.03) effectLevel = 'weak';

      const result = {
        finalPressure: Math.round(finalPressure * 10) / 10,
        newComposure: Math.round(target.composure * 10) / 10,
        state: this.getComposureState(targetId),
        prevState: stateBefore,
        composureRatio: target.composure / target.composureMax,
        equityBias: target.equityBias,
        confidenceLevel: target.confidenceLevel,
        effectLevel: effectLevel,
        isCrit: isCrit
      };

      console.log(`[Mental] ${skillType} u${userId}→t${targetId} | dmg=${result.finalPressure} comp=${result.newComposure}/${target.composureMax} effect=${effectLevel}${isCrit ? ' CRIT!' : ''} ${stateBefore}→${result.state}`);

      return result;
    }

    /**
     * 定神技能结算
     */
    applyRecover(userId, baseRecover, confidenceDelta = 20, clearBias = true) {
      const user = this.players[userId];

      if (!user) {
        console.error('[MentalPressure] Invalid player ID');
        return null;
      }

      // 获取使用者 Void 属性
      const userVoid = this._getPlayerAttr(userId, 'void');

      // 特性修正
      const userTraitMod = user.traits.recoverMod || 1.0;

      // 计算恢复值
      const recover = baseRecover
        * (1 + userVoid / 100)
        * userTraitMod;

      // 应用恢复
      user.composure += recover;
      user.composure = Math.min(user.composure, user.composureMax);

      // 下次压制减轻30%
      user.pressureReduction = 0.7;

      // 提升置信度
      if (confidenceDelta !== 0) {
        user.confidenceLevel += confidenceDelta;
        user.confidenceLevel = Math.max(0, Math.min(100, user.confidenceLevel));
      }

      // 清除情绪偏移
      if (clearBias) {
        user.equityBias = 0;
      }

      return {
        recover: Math.round(recover * 10) / 10,
        newComposure: Math.round(user.composure * 10) / 10,
        state: this.getComposureState(userId),
        composureRatio: user.composure / user.composureMax,
        confidenceLevel: user.confidenceLevel,
        equityBias: user.equityBias
      };
    }

    /**
     * 获取定力状态
     */
    getComposureState(playerId) {
      const player = this.players[playerId];
      if (!player) return COMPOSURE_STATE.STABLE;

      const ratio = player.composure / player.composureMax;

      if (ratio >= 0.55) return COMPOSURE_STATE.STABLE;
      if (ratio >= 0.30) return COMPOSURE_STATE.SHAKEN;
      if (ratio >= 0.12) return COMPOSURE_STATE.UNSTEADY;
      return COMPOSURE_STATE.BROKEN;
    }

    /**
     * 获取心理修正（供AI使用）
     */
    getMentalModifiers(playerId) {
      const player = this.players[playerId];
      if (!player) {
        return {
          composureRatio: 1.0,
          state: COMPOSURE_STATE.STABLE,
          pressureType: null,
          isUnderPressure: false
        };
      }

      const ratio = player.composure / player.composureMax;
      const state = this.getComposureState(playerId);

      return {
        composureRatio: ratio,
        state: state,
        pressureType: player.lastPressureType,
        isUnderPressure: ratio < 0.70
      };
    }

    /**
     * 每回合自然恢复
     */
    tickRecover(playerId) {
      const player = this.players[playerId];
      if (!player) return;

      const recover = player.discipline * 0.05;
      player.composure += recover;
      player.composure = Math.min(player.composure, player.composureMax);

      return {
        recover: Math.round(recover * 10) / 10,
        newComposure: Math.round(player.composure * 10) / 10
      };
    }

    /**
     * 获取玩家心理数据
     */
    getPlayerMental(playerId) {
      return this.players[playerId] || null;
    }

    /**
     * 计算显示胜率（含心理影响）
     */
    calculateDisplayEquity(playerId, trueEquity) {
      const player = this.players[playerId];
      if (!player) return trueEquity;

      // 真理模式：返回精准值
      if (player.truthMode) {
        return {
          mode: 'truth',
          value: trueEquity,
          min: trueEquity,
          max: trueEquity,
          confidence: 100
        };
      }

      // 正常模式：应用偏移和波动
      const bias = player.equityBias / 100;
      const confidence = player.confidenceLevel;
      const variance = (100 - confidence) / 200;

      const center = trueEquity + bias;
      const min = Math.max(0.05, center - variance);
      const max = Math.min(0.95, center + variance);

      // 随机波动
      const display = center + (Math.random() - 0.5) * variance * 2;
      const clamped = Math.max(0.05, Math.min(0.95, display));

      return {
        mode: 'normal',
        value: clamped,
        min: min,
        max: max,
        confidence: confidence,
        icon: confidence > 80 ? '✓' : confidence > 40 ? '~' : '?'
      };
    }

    /**
     * 激活真理模式
     */
    activateTruthMode(playerId) {
      const player = this.players[playerId];
      if (!player) return;

      player.truthMode = true;
      player.confidenceLevel = 100;
      player.equityBias = 0;
    }

    /**
     * 清除真理模式
     */
    clearTruthMode(playerId) {
      const player = this.players[playerId];
      if (!player) return;

      player.truthMode = false;
    }

    /**
     * 重置玩家定力（新局开始）
     */
    resetComposure(playerId) {
      const player = this.players[playerId];
      if (!player) return;

      player.composure = player.composureMax;
      player.lastPressureType = null;
      player.pressureReduction = 1.0;
      player.equityBias = 0;
      player.confidenceLevel = 100;
      player.truthMode = false;
    }

    /**
     * 重置所有玩家
     */
    resetAll() {
      Object.keys(this.players).forEach(playerId => {
        this.resetComposure(playerId);
      });
    }

    /**
     * 重置所有玩家的每轮技能使用标记
     */
    resetRoundSkillUsage() {
      Object.values(this.players).forEach(p => {
        p.mentalSkillUsedThisRound = false;
      });
    }

    /**
     * 检查玩家本轮是否可以使用心理战技能
     */
    canUseMentalSkill(playerId) {
      const player = this.players[playerId];
      return player && !player.mentalSkillUsedThisRound;
    }

    /**
     * 标记玩家已使用心理战技能
     */
    markSkillUsed(playerId) {
      const player = this.players[playerId];
      if (player) {
        player.mentalSkillUsedThisRound = true;
      }
    }
  }

  // ========== 导出 ==========

  global.MentalPressureSystem = MentalPressureSystem;
  global.PRESSURE_TYPE = PRESSURE_TYPE;
  global.COMPOSURE_STATE = COMPOSURE_STATE;

})(typeof window !== 'undefined' ? window : global);
