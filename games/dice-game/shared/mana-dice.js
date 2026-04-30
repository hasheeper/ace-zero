/**
 * ===========================================
 * [已废弃] MANA-DICE.JS — 魔运骰 RPS 对抗引擎
 * ===========================================
 *
 * ⚠️ 此文件已被 mini-game-force.js 替代。
 * 保留仅供参考，不再被任何 HTML 引用。
 *
 * 小游戏统一技能层。基于剪刀石头布（RPS）的即时对抗机制。
 *
 * 克制环（与德州四属性一致）:
 *   强运(moirai/♥) > 洞察(psyche/♦) > 厄运(chaos/♠) > 强运(moirai/♥)
 *
 * 结果:
 *   WIN  → 技能 100% 生效
 *   DRAW → 技能 50% 生效（减半版）
 *   LOSE → 技能无效，Mana 仍消耗
 *
 * 用法:
 *   各小游戏通过 ManaDice.defineSkills({...}) 注册自己的技能表，
 *   然后用 ManaDice.resolve() 判定 RPS 结果。
 */
(function (global) {
  'use strict';

  var CHOICES = ['moirai', 'chaos', 'psyche'];

  // 克制表: key 克制 value
  var BEATS = {
    moirai: 'psyche',  // 强运 > 洞察
    psyche: 'chaos',   // 洞察 > 厄运
    chaos:  'moirai'   // 厄运 > 强运
  };

  var CHOICE_CN = {
    moirai: '♥ 强运',
    chaos:  '♠ 厄运',
    psyche: '♦ 洞察'
  };

  var RESULT = {
    WIN:  'win',
    DRAW: 'draw',
    LOSE: 'lose'
  };

  var RESULT_CN = {
    win:  '胜利！技能全效发动',
    draw: '平局——技能减半生效',
    lose: '被反制！技能无效'
  };

  /**
   * 判定 RPS 结果
   * @param {string} player - 'moirai' | 'chaos' | 'psyche'
   * @param {string} dealer - 'moirai' | 'chaos' | 'psyche'
   * @returns {string} 'win' | 'draw' | 'lose'
   */
  function resolve(player, dealer) {
    if (player === dealer) return RESULT.DRAW;
    if (BEATS[player] === dealer) return RESULT.WIN;
    return RESULT.LOSE;
  }

  /**
   * 根据结果返回技能效力倍率
   * @param {string} result - 'win' | 'draw' | 'lose'
   * @returns {number} 1.0 | 0.5 | 0
   */
  function potency(result) {
    if (result === RESULT.WIN) return 1.0;
    if (result === RESULT.DRAW) return 0.5;
    return 0;
  }

  // ================================================================
  //  庄家 AI 策略
  // ================================================================

  /**
   * 庄家选择策略
   * @param {string} strategy - 'random' | 'adaptive' | 'smart'
   * @param {string[]} playerHistory - 玩家历史选择记录
   * @returns {string} 庄家的选择
   */
  function dealerPick(strategy, playerHistory) {
    strategy = strategy || 'random';

    switch (strategy) {
      case 'adaptive': {
        // 精英庄家: 70% 随机 + 30% 倾向克制玩家上一次选择
        if (Math.random() < 0.7 || !playerHistory || playerHistory.length === 0) {
          return _randomChoice();
        }
        var lastPick = playerHistory[playerHistory.length - 1];
        return _counterOf(lastPick);
      }

      case 'smart': {
        // Boss 庄家: 50% 随机 + 50% 基于频率分析预测
        if (Math.random() < 0.5 || !playerHistory || playerHistory.length < 2) {
          return _randomChoice();
        }
        var predicted = _predictFromHistory(playerHistory);
        return _counterOf(predicted);
      }

      default:
        return _randomChoice();
    }
  }

  function _randomChoice() {
    return CHOICES[Math.floor(Math.random() * CHOICES.length)];
  }

  function _counterOf(target) {
    for (var i = 0; i < CHOICES.length; i++) {
      if (BEATS[CHOICES[i]] === target) return CHOICES[i];
    }
    return _randomChoice();
  }

  function _predictFromHistory(history) {
    var freq = { moirai: 0, chaos: 0, psyche: 0 };
    for (var i = 0; i < history.length; i++) {
      if (freq[history[i]] !== undefined) freq[history[i]]++;
    }
    var best = 'moirai';
    var max = 0;
    for (var key in freq) {
      if (freq[key] > max) { max = freq[key]; best = key; }
    }
    return best;
  }

  // ================================================================
  //  技能注册 — 各小游戏用自己的技能表
  // ================================================================

  var _registeredSkills = {};

  /**
   * 注册/覆盖技能表（各小游戏调用）
   * @param {string} gameKey - 如 'blackjack', 'dice', 'dragon_tiger'
   * @param {Object} skills - { skillKey: { key, name, attr, icon, manaCost, ... } }
   */
  function defineSkills(gameKey, skills) {
    _registeredSkills[gameKey] = skills;
  }

  /**
   * 获取指定小游戏的技能表
   */
  function getSkills(gameKey) {
    return _registeredSkills[gameKey] || {};
  }

  /**
   * 获取指定技能
   */
  function getSkill(gameKey, skillKey) {
    var table = _registeredSkills[gameKey];
    return table ? table[skillKey] : null;
  }

  // ================================================================
  //  魔运骰 UI 控制器（供各小游戏共享）
  // ================================================================

  /**
   * 创建魔运骰 UI 控制器实例
   * 需要页面中存在 #mana-dice-overlay 等元素
   * @param {Object} opts
   * @param {string} opts.dealerStrategy - RPS 策略
   * @param {string[]} opts.rpsHistory - 引用，外部维护
   * @returns {Object} controller { show(skillName) → Promise<{result, potency}> }
   */
  function createDiceUI(opts) {
    opts = opts || {};
    var overlay    = document.getElementById('mana-dice-overlay');
    var prompt     = document.getElementById('dice-prompt');
    var resultEl   = document.getElementById('dice-result');
    var playerPick = document.getElementById('dice-player-pick');
    var dealerPickEl = document.getElementById('dice-dealer-pick');
    var outcomeEl  = document.getElementById('dice-outcome');
    var choiceBtns = overlay ? overlay.querySelectorAll('.dice-choice') : [];

    var _resolve = null;

    function onChoice(playerChoice) {
      if (!_resolve) return;

      var history = opts.rpsHistory || [];
      history.push(playerChoice);
      var dChoice = dealerPick(opts.dealerStrategy || 'random', history);
      var result = resolve(playerChoice, dChoice);
      var pot = potency(result);

      // 显示结果
      if (playerPick) {
        playerPick.textContent = CHOICE_CN[playerChoice];
        playerPick.className = 'dice-player-pick ' + playerChoice;
      }
      if (dealerPickEl) {
        dealerPickEl.textContent = CHOICE_CN[dChoice];
        dealerPickEl.className = 'dice-dealer-pick ' + dChoice;
      }
      if (outcomeEl) {
        outcomeEl.textContent = RESULT_CN[result];
        outcomeEl.className = 'dice-outcome ' + result;
      }
      if (resultEl) resultEl.classList.remove('hidden');

      var choicesContainer = overlay ? overlay.querySelector('.mana-dice-choices') : null;
      if (choicesContainer) choicesContainer.classList.add('hidden');

      var cb = _resolve;
      _resolve = null;

      setTimeout(function () {
        if (overlay) overlay.classList.add('hidden');
        if (choicesContainer) choicesContainer.classList.remove('hidden');
        cb({ result: result, potency: pot });
      }, 1500);
    }

    // 绑定按钮
    for (var i = 0; i < choiceBtns.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          onChoice(btn.getAttribute('data-choice'));
        });
      })(choiceBtns[i]);
    }

    return {
      /**
       * 显示魔运骰选择 UI
       * @param {string} skillName - 显示用的技能名
       * @returns {Promise<{result: string, potency: number}>}
       */
      show: function (skillName) {
        if (prompt) prompt.textContent = (skillName || '魔运骰') + ' — 选择你的属性：';
        if (resultEl) resultEl.classList.add('hidden');
        if (overlay) overlay.classList.remove('hidden');
        return new Promise(function (r) { _resolve = r; });
      }
    };
  }

  // ================================================================
  //  导出
  // ================================================================

  global.ManaDice = {
    CHOICES: CHOICES,
    BEATS: BEATS,
    CHOICE_CN: CHOICE_CN,
    RESULT: RESULT,
    RESULT_CN: RESULT_CN,
    resolve: resolve,
    potency: potency,
    dealerPick: dealerPick,
    defineSkills: defineSkills,
    getSkills: getSkills,
    getSkill: getSkill,
    createDiceUI: createDiceUI
  };

})(typeof window !== 'undefined' ? window : global);
