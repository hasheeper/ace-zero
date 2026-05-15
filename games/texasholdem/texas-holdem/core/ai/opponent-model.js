/**
 * Poker AI split module: OpponentModel.
 */
(function(global) {
  'use strict';

  var modules = global.PokerAIModules || (global.PokerAIModules = {});
  var register = modules.register || function(moduleName, value) {
    modules[moduleName] = value;
    return value;
  };

  var UtilityScorer = modules.UtilityScorer || {};
  var ACTIONS = UtilityScorer.ACTIONS || { FOLD: 'fold', CHECK: 'check', CALL: 'call', RAISE: 'raise', ALL_IN: 'allin' };

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


  register('OpponentModel', {
    OpponentModel: OpponentModel
  });
})(typeof window !== 'undefined' ? window : global);
