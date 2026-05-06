/**
 * ===========================================
 * MINI-GAME-FORCE.JS — 小游戏 Force 对抗引擎
 * ===========================================
 *
 * 替代原 mana-dice.js 的猜拳(RPS)机制。
 *
 * 核心设计：
 *   - 玩家点技能 → 扣 Mana → 注入 Force
 *   - 庄家 AI 同时暗选技能（或不出招）
 *   - 技能属性天然决定克制关系（不需要额外选属性）
 *   - 力量对抗结算 → 输出 bias 值供游戏使用
 *
 * 克制环（与德州四属性一致）：
 *   Moirai(♥) > Psyche(♦) > Chaos(♠) > Moirai(♥)
 *
 * 克制效果：
 *   - 被克制方 power × 0.5（半效）
 *   - 克制方 power × 1.0（全效）
 *   - 同属性对抗：互相抵消（净值 = 差值）
 *   - 无对抗：全效
 *
 * Psyche 特殊机制：
 *   - 信息效果：必定触发（不受克制影响）
 *   - 拦截效果：消除庄家的 force，部分转化为己方 fortune
 *   - 被 Moirai 克制时：信息效果仍触发，拦截部分空放
 *
 * 用法：
 *   var engine = MiniGameForce.createEngine({ dealerStrategy, ... });
 *   engine.defineSkills({ ... });
 *   var result = engine.playerUseSkill('lucky_hit');
 *   // result = { bias, info, log }
 */
(function (global) {
  'use strict';

  // ================================================================
  //  常量
  // ================================================================

  var ATTRS = ['moirai', 'chaos', 'psyche'];

  // 克制表: key 克制 value
  var BEATS = {
    moirai: 'psyche',
    psyche: 'chaos',
    chaos:  'moirai'
  };

  var ATTR_CN = {
    moirai: '♥ 强运',
    chaos:  '♠ 厄运',
    psyche: '♦ 洞察'
  };

  // 克制时的效果倍率
  var COUNTER_MULTIPLIER = 0.5;   // 被克制方 power 降为 50%
  var PSYCHE_CONVERT_RATE = 0.3;  // Psyche 拦截转化率（基础）

  // ================================================================
  //  庄家 AI 策略
  // ================================================================

  /**
   * 庄家决定本轮是否出技能以及出哪个
   * @param {string} strategy - 'random' | 'adaptive' | 'smart'
   * @param {Object} dealerSkills - 庄家可用技能表 { key: { attr, power, manaCost } }
   * @param {Object} dealerState - { mana, maxMana }
   * @param {Object|null} playerForce - 玩家本轮注入的 force（如果已知）
   * @param {string[]} history - 玩家历史使用的技能属性
   * @returns {Object|null} 选中的技能，或 null（不出招）
   */
  function dealerDecide(strategy, dealerSkills, dealerState, playerForce, history) {
    strategy = strategy || 'random';

    // 收集可用技能（mana 足够的）
    var available = [];
    for (var key in dealerSkills) {
      var sk = dealerSkills[key];
      if (dealerState.mana >= sk.manaCost) {
        available.push(sk);
      }
    }
    if (available.length === 0) return null;

    switch (strategy) {
      case 'adaptive': {
        // 60% 出招，40% 不出
        if (Math.random() < 0.4) return null;
        // 有玩家 force 信息时，30% 概率选克制属性
        if (playerForce && Math.random() < 0.3) {
          var counterAttr = _counterAttrOf(playerForce.attr);
          var counterSkill = _findSkillByAttr(available, counterAttr);
          if (counterSkill) return counterSkill;
        }
        return available[Math.floor(Math.random() * available.length)];
      }

      case 'smart': {
        // 70% 出招
        if (Math.random() < 0.3) return null;
        // 有玩家 force：50% 精准克制
        if (playerForce && Math.random() < 0.5) {
          var cAttr = _counterAttrOf(playerForce.attr);
          var cSkill = _findSkillByAttr(available, cAttr);
          if (cSkill) return cSkill;
        }
        // 否则频率分析
        if (history && history.length >= 2) {
          var predicted = _predictAttrFromHistory(history);
          var counter2 = _counterAttrOf(predicted);
          var s2 = _findSkillByAttr(available, counter2);
          if (s2) return s2;
        }
        return available[Math.floor(Math.random() * available.length)];
      }

      default: {
        // random: 50% 出招
        if (Math.random() < 0.5) return null;
        return available[Math.floor(Math.random() * available.length)];
      }
    }
  }

  function _counterAttrOf(attr) {
    // 返回克制 attr 的属性
    for (var k in BEATS) {
      if (BEATS[k] === attr) return k;
    }
    return ATTRS[Math.floor(Math.random() * ATTRS.length)];
  }

  function _findSkillByAttr(skills, attr) {
    for (var i = 0; i < skills.length; i++) {
      if (skills[i].attr === attr) return skills[i];
    }
    return null;
  }

  function _predictAttrFromHistory(history) {
    var freq = { moirai: 0, chaos: 0, psyche: 0 };
    for (var i = 0; i < history.length; i++) {
      if (freq[history[i]] !== undefined) freq[history[i]]++;
    }
    var best = 'moirai', max = 0;
    for (var key in freq) {
      if (freq[key] > max) { max = freq[key]; best = key; }
    }
    return best;
  }

  // ================================================================
  //  力量对抗结算
  // ================================================================

  /**
   * 结算玩家 force vs 庄家 force
   * @param {Object|null} playerForce - { attr, power, type, skillKey, skillName }
   *   type: 'fortune' | 'curse' | 'psyche'
   * @param {Object|null} dealerForce - 同上
   * @returns {Object} {
   *   playerBias: number (0~1, >0 = 偏向玩家有利),
   *   dealerBias: number (0~1, >0 = 偏向庄家有利),
   *   countered: 'player' | 'dealer' | 'same' | 'none',
   *   playerEffective: number,
   *   dealerEffective: number,
   *   psycheIntercept: number (Psyche 拦截转化的 fortune power),
   *   log: string
   * }
   */
  function resolveForces(playerForce, dealerForce) {
    // 无对抗
    if (!playerForce && !dealerForce) {
      return _result(0, 0, 'none', 0, 0, 0, '无魔法干预。');
    }

    // 只有玩家出招
    if (playerForce && !dealerForce) {
      var pp = playerForce.power;
      var bias = _powerToBias(pp);
      var logMsg = playerForce.skillName + '(' + ATTR_CN[playerForce.attr] + ' P' + pp + ') 全效发动！庄家未出招。';
      if (playerForce.type === 'psyche') {
        return _result(0, 0, 'none', pp, 0, 0,
          playerForce.skillName + ' 信息效果发动！庄家无 force，拦截空放。');
      }
      if (playerForce.type === 'fortune') {
        return _result(bias, 0, 'none', pp, 0, 0, logMsg);
      }
      // curse → 偏向让庄家拿烂牌
      return _result(0, bias, 'none', pp, 0, 0, logMsg);
    }

    // 只有庄家出招
    if (!playerForce && dealerForce) {
      var dp = dealerForce.power;
      var dBias = _powerToBias(dp);
      var dLog = '庄家发动 ' + dealerForce.skillName + '(' + ATTR_CN[dealerForce.attr] + ' P' + dp + ')。';
      if (dealerForce.type === 'fortune') {
        return _result(0, dBias, 'none', 0, dp, 0, dLog);
      }
      return _result(dBias, 0, 'none', 0, dp, 0, dLog);
    }

    // 双方都出招 — 核心对抗
    var pAttr = playerForce.attr;
    var dAttr = dealerForce.attr;
    var pPower = playerForce.power;
    var dPower = dealerForce.power;

    // Psyche 特殊处理
    if (playerForce.type === 'psyche') {
      return _resolvePsycheVsDealer(playerForce, dealerForce);
    }
    if (dealerForce.type === 'psyche') {
      return _resolveDealerPsycheVsPlayer(playerForce, dealerForce);
    }

    // 克制判定
    var countered = 'none';
    var pEffective = pPower;
    var dEffective = dPower;

    if (pAttr === dAttr) {
      // 同属性：互相抵消
      countered = 'same';
      var net = pPower - dPower;
      if (net > 0) {
        pEffective = net;
        dEffective = 0;
      } else if (net < 0) {
        pEffective = 0;
        dEffective = -net;
      } else {
        pEffective = 0;
        dEffective = 0;
      }
    } else if (BEATS[pAttr] === dAttr) {
      // 玩家克制庄家
      countered = 'dealer';
      dEffective = Math.round(dPower * COUNTER_MULTIPLIER);
    } else if (BEATS[dAttr] === pAttr) {
      // 庄家克制玩家
      countered = 'player';
      pEffective = Math.round(pPower * COUNTER_MULTIPLIER);
    }

    // 计算净偏向
    var pBias = 0, dBiasOut = 0;
    // fortune → 偏向好牌, curse → 偏向对方烂牌
    var playerNet = _forceDirection(playerForce.type, pEffective);
    var dealerNet = _forceDirection(dealerForce.type, dEffective);

    // 正值 = 偏向好牌（对施法方有利）
    var totalNet = playerNet - dealerNet;
    if (totalNet > 0) {
      pBias = _powerToBias(totalNet);
    } else if (totalNet < 0) {
      dBiasOut = _powerToBias(-totalNet);
    }

    // 生成日志
    var log = _buildContestLog(playerForce, dealerForce, pEffective, dEffective, countered);

    return _result(pBias, dBiasOut, countered, pEffective, dEffective, 0, log);
  }

  /**
   * 玩家 Psyche vs 庄家 force
   * 信息效果必定触发 + 拦截庄家 force
   */
  function _resolvePsycheVsDealer(psycheForce, dealerForce) {
    var pPower = psycheForce.power;
    var dPower = dealerForce.power;
    var dAttr = dealerForce.attr;
    var intercepted = 0;
    var converted = 0;
    var log = psycheForce.skillName + ' 信息效果发动！';

    // Psyche > Chaos：拦截生效
    if (dAttr === 'chaos') {
      intercepted = dPower;
      converted = Math.round(dPower * PSYCHE_CONVERT_RATE);
      log += ' 拦截庄家 ' + dealerForce.skillName + '(P' + dPower + ')';
      if (converted > 0) {
        log += ' → 转化为 fortune P' + converted + '！';
      } else {
        log += ' → 已消除。';
      }
      var cBias = converted > 0 ? _powerToBias(converted) : 0;
      return _result(cBias, 0, 'dealer', pPower, 0, converted, log);
    }

    // Psyche vs Moirai（被克制）：拦截空放
    if (dAttr === 'moirai') {
      log += ' 但庄家使用 ' + dealerForce.skillName + '(♥ Moirai)，拦截空放。';
      var dBias = _powerToBias(dPower);
      return _result(0, dBias, 'player', pPower, dPower, 0, log);
    }

    // Psyche vs Psyche：同属性，信息对冲
    log += ' 庄家也使用了洞察系，双方信息对冲。';
    return _result(0, 0, 'same', pPower, dPower, 0, log);
  }

  /**
   * 庄家 Psyche vs 玩家 force
   */
  function _resolveDealerPsycheVsPlayer(playerForce, dealerPsyche) {
    var pAttr = playerForce.attr;
    var pPower = playerForce.power;
    var dPower = dealerPsyche.power;

    // 庄家 Psyche > 玩家 Chaos：拦截玩家 curse
    if (pAttr === 'chaos') {
      var intercepted = pPower;
      var log = '庄家发动 ' + dealerPsyche.skillName + '，拦截了你的 ' +
        playerForce.skillName + '(P' + pPower + ')！';
      return _result(0, 0, 'player', 0, dPower, 0, log);
    }

    // 庄家 Psyche vs 玩家 Moirai：庄家被克制
    if (pAttr === 'moirai') {
      var pBias = _powerToBias(pPower);
      var log2 = playerForce.skillName + ' 全效发动！庄家洞察被强运压制。';
      return _result(pBias, 0, 'dealer', pPower, Math.round(dPower * COUNTER_MULTIPLIER), 0, log2);
    }

    // Psyche vs Psyche
    var log3 = '双方都使用了洞察系，互相对冲。';
    return _result(0, 0, 'same', pPower, dPower, 0, log3);
  }

  // ================================================================
  //  工具
  // ================================================================

  function _forceDirection(type, power) {
    // fortune = positive for caster, curse = positive for caster (negative for target)
    return power;
  }

  /**
   * power → bias (0~1)
   * power 20 ≈ 0.55 偏向，power 50 ≈ 0.75
   */
  function _powerToBias(power) {
    if (power <= 0) return 0;
    // sigmoid-ish: bias = power / (power + K)
    var K = 30;
    return Math.min(0.85, power / (power + K));
  }

  function _result(playerBias, dealerBias, countered, pEff, dEff, psycheConvert, log) {
    return {
      playerBias: playerBias,
      dealerBias: dealerBias,
      countered: countered,
      playerEffective: pEff,
      dealerEffective: dEff,
      psycheIntercept: psycheConvert,
      log: log
    };
  }

  function _buildContestLog(pForce, dForce, pEff, dEff, countered) {
    var parts = [];
    parts.push(pForce.skillName + '(' + ATTR_CN[pForce.attr] + ' P' + pForce.power + ')');
    parts.push(' vs ');
    parts.push('庄家 ' + dForce.skillName + '(' + ATTR_CN[dForce.attr] + ' P' + dForce.power + ')');

    if (countered === 'dealer') {
      parts.push(' → 克制庄家！你P' + pEff + ' vs 庄P' + dEff);
    } else if (countered === 'player') {
      parts.push(' → 被庄家克制！你P' + pEff + ' vs 庄P' + dEff);
    } else if (countered === 'same') {
      parts.push(' → 同属性对抗：你P' + pEff + ' vs 庄P' + dEff);
    } else {
      parts.push(' → 你P' + pEff + ' vs 庄P' + dEff);
    }

    return parts.join('');
  }

  // ================================================================
  //  Engine 工厂 — 各小游戏创建自己的实例
  // ================================================================

  /**
   * 创建 Force 对抗引擎实例
   * @param {Object} opts
   * @param {string} opts.dealerStrategy - 'random' | 'adaptive' | 'smart'
   * @param {number} opts.dealerMana - 庄家初始 Mana
   * @param {number} opts.dealerMaxMana - 庄家最大 Mana
   * @returns {Object} engine
   */
  function createEngine(opts) {
    opts = opts || {};
    var _skills = {};          // 玩家技能表
    var _dealerSkills = {};    // 庄家技能表
    var _history = [];         // 玩家技能属性历史
    var _dealerStrategy = opts.dealerStrategy || 'random';
    var _dealerState = {
      mana: opts.dealerMana || 40,
      maxMana: opts.dealerMaxMana || 40
    };

    // 当前回合的 forces
    var _roundPlayerForce = null;
    var _roundDealerForce = null;
    var _roundResolved = false;

    /**
     * 注册玩家技能表
     * @param {Object} skills - { skillKey: { key, name, attr, power, manaCost, type, ... } }
     *   type: 'fortune' | 'curse' | 'psyche'
     */
    function defineSkills(skills) {
      _skills = skills || {};
    }

    /**
     * 注册庄家技能表
     * @param {Object} skills - 同上
     */
    function defineDealerSkills(skills) {
      _dealerSkills = skills || {};
    }

    /**
     * 自动生成庄家技能（镜像玩家技能，power 稍低）
     */
    var DEALER_TYPE_NAME = {
      fortune: { type: 'curse',   name: '厄运（庄）', attr: 'chaos'  },
      curse:   { type: 'fortune', name: '强运（庄）', attr: 'moirai' },
      psyche:  { type: 'psyche',  name: '洞察（庄）', attr: 'psyche' }
    };

    function autoDealerSkills() {
      _dealerSkills = {};
      for (var key in _skills) {
        var sk = _skills[key];
        var mirror = DEALER_TYPE_NAME[sk.type] || { type: sk.type, name: sk.name + '（庄）', attr: sk.attr };
        _dealerSkills['d_' + key] = {
          key: 'd_' + key,
          name: mirror.name,
          attr: mirror.attr,
          power: Math.round(sk.power * 0.7),
          manaCost: Math.round(sk.manaCost * 0.6),
          type: mirror.type
        };
      }
    }

    /**
     * 新回合重置
     */
    function newRound() {
      _roundPlayerForce = null;
      _roundDealerForce = null;
      _roundResolved = false;
      // 庄家回蓝（每回合恢复一点）
      _dealerState.mana = Math.min(_dealerState.maxMana, _dealerState.mana + 3);
    }

    /**
     * 玩家使用技能
     * 同时庄家 AI 暗选技能 → 立即结算
     * @param {string} skillKey
     * @returns {Object|null} {
     *   resolved: resolveForces result,
     *   playerSkill: skill object,
     *   dealerSkill: skill object or null,
     *   info: boolean (是否有信息效果)
     * }
     */
    function playerUseSkill(skillKey) {
      var skill = _skills[skillKey];
      if (!skill) return null;

      // 记录玩家属性历史
      _history.push(skill.attr);

      // 构建玩家 force
      _roundPlayerForce = {
        attr: skill.attr,
        power: skill.power,
        type: skill.type || 'fortune',
        skillKey: skill.key,
        skillName: skill.name
      };

      // 庄家同时决定
      var dealerSkill = dealerDecide(
        _dealerStrategy, _dealerSkills, _dealerState,
        _roundPlayerForce, _history
      );

      if (dealerSkill) {
        _dealerState.mana -= dealerSkill.manaCost;
        _roundDealerForce = {
          attr: dealerSkill.attr,
          power: dealerSkill.power,
          type: dealerSkill.type || 'curse',
          skillKey: dealerSkill.key,
          skillName: dealerSkill.name
        };
      } else {
        _roundDealerForce = null;
      }

      // 结算
      var resolved = resolveForces(_roundPlayerForce, _roundDealerForce);
      _roundResolved = true;

      return {
        resolved: resolved,
        playerSkill: skill,
        dealerSkill: dealerSkill,
        info: skill.type === 'psyche'
      };
    }

    /**
     * 获取当前回合的净 bias
     * 如果本回合没有使用技能，返回 { playerBias: 0, dealerBias: 0 }
     */
    function getRoundBias() {
      if (!_roundResolved) return { playerBias: 0, dealerBias: 0 };
      var r = resolveForces(_roundPlayerForce, _roundDealerForce);
      return { playerBias: r.playerBias, dealerBias: r.dealerBias };
    }

    function getSkill(key) {
      return _skills[key] || null;
    }

    function getSkills() {
      return _skills;
    }

    function getDealerState() {
      return { mana: _dealerState.mana, maxMana: _dealerState.maxMana };
    }

    function setDealerStrategy(s) {
      _dealerStrategy = s;
    }

    function setDealerMana(cur, max) {
      if (cur !== undefined) _dealerState.mana = cur;
      if (max !== undefined) _dealerState.maxMana = max;
    }

    /**
     * 庄家 AI 独立出招（不需要玩家同时出招）
     * 用于庄家在玩家回合主动释放诅咒等场景
     * @returns {Object|null} 庄家选中的技能 force 对象，或 null
     */
    function dealerPickSkill() {
      var chosen = dealerDecide(_dealerStrategy, _dealerSkills, _dealerState, null, _history);
      if (!chosen) return null;
      _dealerState.mana -= chosen.manaCost;
      return {
        attr: chosen.attr,
        power: chosen.power,
        type: chosen.type || 'curse',
        skillKey: chosen.key,
        skillName: chosen.name
      };
    }

    return {
      defineSkills: defineSkills,
      defineDealerSkills: defineDealerSkills,
      autoDealerSkills: autoDealerSkills,
      newRound: newRound,
      playerUseSkill: playerUseSkill,
      dealerPickSkill: dealerPickSkill,
      getRoundBias: getRoundBias,
      getSkill: getSkill,
      getSkills: getSkills,
      getDealerState: getDealerState,
      setDealerStrategy: setDealerStrategy,
      setDealerMana: setDealerMana
    };
  }

  // ================================================================
  //  导出
  // ================================================================

  global.MiniGameForce = {
    ATTRS: ATTRS,
    BEATS: BEATS,
    ATTR_CN: ATTR_CN,
    COUNTER_MULTIPLIER: COUNTER_MULTIPLIER,
    PSYCHE_CONVERT_RATE: PSYCHE_CONVERT_RATE,
    resolveForces: resolveForces,
    dealerDecide: dealerDecide,
    createEngine: createEngine,
    powerToBias: _powerToBias
  };

})(typeof window !== 'undefined' ? window : global);
