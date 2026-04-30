/**
 * ===========================================
 * 乾坤骰 (Dice / 大小) — 游戏逻辑
 * ===========================================
 *
 * 规则：
 *   - 3颗骰子 (1-6)，总和 3-18
 *   - 大 (11-17) / 小 (4-10) → 1:1
 *   - 单 / 双 → 1:1
 *   - 豹子 (三同) → 1:30（大小/单双均输）
 *
 * Force 技能：
 *   - 天命骰 (♥, 15 mana): 偏向所选结果
 *   - 厄运骰 (♠, 20 mana): 偏向极端值/豹子
 *   - 预知   (♦, 10 mana): 提前显示一颗骰子 + 拦截庄家 force
 *
 * 依赖: shared/mini-game-force.js, shared/mini-game-base.js
 */
(function () {
  'use strict';

  // ---- Force 引擎实例 ----
  var forceEngine = null;
  if (window.MiniGameForce) {
    forceEngine = MiniGameForce.createEngine({ dealerStrategy: 'random' });
    forceEngine.defineSkills({
      fortune_die: {
        key: 'fortune_die', name: '天命骰', attr: 'moirai', icon: '♥',
        manaCost: 15, power: 18, type: 'fortune',
        desc: '骰子结果偏向你所选的大/小'
      },
      jinx_die: {
        key: 'jinx_die', name: '厄运骰', attr: 'chaos', icon: '♠',
        manaCost: 20, power: 22, type: 'curse',
        desc: '骰子结果偏向极端值或豹子'
      },
      foresight: {
        key: 'foresight', name: '预知', attr: 'psyche', icon: '♦',
        manaCost: 10, power: 12, type: 'psyche',
        desc: '提前揭示一颗骰子的点数 + 拦截庄家 force'
      }
    });
    forceEngine.autoDealerSkills();
  }

  // ---- 默认配置 ----
  var DEFAULT_CONFIG = {
    dice: {
      startingChips: 1000,
      minBet: 10,
      maxBet: 500,
      defaultBet: 50,
      mana: { enabled: true, pool: 60 },
      dealer: { rpsStrategy: 'random' }
    },
    hero: { vanguard: { name: 'PLAYER' }, mana: 60, maxMana: 60 }
  };

  // ---- 对局日志 ----
  var gameLogger = new MiniGameLogger({
    gameName: '乾坤骰',
    gameKey: 'dice',
    onNewRound: function () { onNewRound(); },
    onRestart: function () {
      state.roundCount = 0;
      initFromConfig(configLoader.cfg());
    }
  });

  // ---- 状态 ----
  var state = {
    chips: 0,
    currentBet: 0,
    selectedBet: null,   // 'big' | 'small' | 'odd' | 'even' | 'triple'
    roundCount: 0,
    busy: false,
    phase: 'idle',       // idle | betting | rolling | settled
    dice: [0, 0, 0],
    // 技能缓冲
    fortuneActive: 0,
    jinxActive: 0,
    foresightUsed: false,
    previewDie: null
  };

  // ---- DOM ----
  var UI = {
    chips:      document.getElementById('chips'),
    roundCount: document.getElementById('round-count'),
    message:    document.getElementById('message'),
    btnNewRound: document.getElementById('btn-new-round'),
    btnRoll:    document.getElementById('btn-roll'),
    diceCup:    document.getElementById('dice-cup'),
    diceTotal:  document.getElementById('dice-total'),
    diceEls:    [
      document.getElementById('die-1'),
      document.getElementById('die-2'),
      document.getElementById('die-3')
    ],
    betOptions: document.querySelectorAll('.bet-option'),
    manaBar:    document.getElementById('mana-bar'),
    manaText:   document.getElementById('mana-text'),
    manaBox:    document.getElementById('mana-box'),
    skillBar:   document.getElementById('skill-bar'),
    btnFortune: document.getElementById('btn-skill-fortune'),
    btnJinx:    document.getElementById('btn-skill-jinx'),
    btnForesight: document.getElementById('btn-skill-foresight')
  };

  // ---- 基础模块 ----
  var configLoader = null;
  var manaManager = null;
  var betSelector = null;

  function msg(text, cls) {
    MiniGameBase.updateMessage(UI.message, text, cls);
  }

  // ---- 3D 骰子旋转映射 ----
  // 每个点数朝向屏幕时的基础旋转角度 (x, y)
  var FACE_ROTATIONS = {
    1: { x: 0,   y: 0 },
    2: { x: 0,   y: -90 },
    3: { x: -90, y: 0 },
    4: { x: 90,  y: 0 },
    5: { x: 0,   y: 90 },
    6: { x: 0,   y: 180 }
  };

  // 记录每颗骰子的当前累计旋转角度
  var diceState = [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 }
  ];

  /**
   * 将骰子旋转到指定面 (1-6)，带有累加旋转效果。
   * @param {number} index - 骰子索引 (0/1/2)
   * @param {number} face  - 目标面 (1-6)，0 表示重置
   * @param {boolean} instant - 是否跳过动画直接到位
   */
  function setDieFace(index, face) {
    var dieEl = UI.diceEls[index];
    var n = Number(face);
    if (n < 1 || n > 6) {
      // 重置到正朝向（面 1 朝前）
      diceState[index] = { x: 0, y: 0 };
      dieEl.style.transform = 'rotateX(0deg) rotateY(0deg)';
      return;
    }

    var target = FACE_ROTATIONS[n];
    var cur = diceState[index];

    // 加 4-8 圈随机旋转，保证顺着惯性转不会倒退
    var extraRounds = 4 + Math.floor(Math.random() * 4);
    var nextX = cur.x + (360 * extraRounds);
    var nextY = cur.y + (360 * extraRounds);

    // 补正到目标面的精确角度
    nextX += target.x - (nextX % 360);
    nextY += target.y - (nextY % 360);

    dieEl.style.transform = 'rotateX(' + nextX + 'deg) rotateY(' + nextY + 'deg)';
    diceState[index] = { x: nextX, y: nextY };
  }

  /**
   * 下注后骰子从正视角转到三视角度的预备动作。
   */
  function tiltDiceReady() {
    for (var i = 0; i < 3; i++) {
      var cur = diceState[i];
      var nx = cur.x + 360 - 25 - (cur.x % 360);
      var ny = cur.y + 360 - 45 - (cur.y % 360);
      diceState[i] = { x: nx, y: ny };
      UI.diceEls[i].style.transform = 'rotateX(' + nx + 'deg) rotateY(' + ny + 'deg)';
    }
  }

  // ---- 初始化 ----
  function initFromConfig(cfg) {
    var gc = configLoader.gameCfg();
    var hc = configLoader.heroCfg();
    var def = DEFAULT_CONFIG.dice;

    state.chips = Number(gc.startingChips) || Number(cfg.chips) || def.startingChips;

    var manaEnabled = gc.mana && gc.mana.enabled !== false;
    var maxMana = Number(hc.maxMana) || Number(gc.mana && gc.mana.pool) || 60;
    var curMana = Number(hc.mana) || maxMana;

    manaManager.state.enabled = manaEnabled;
    manaManager.set(curMana, maxMana);

    betSelector.configure(
      Number(gc.minBet) || def.minBet,
      Number(gc.maxBet) || def.maxBet,
      Number(gc.defaultBet) || def.defaultBet
    );

    // 技能按钮显示/隐藏
    var availableSkills = hc.miniGameSkills || ['fortune_die', 'jinx_die', 'foresight'];
    UI.btnFortune.style.display = availableSkills.indexOf('fortune_die') >= 0 ? '' : 'none';
    UI.btnJinx.style.display = availableSkills.indexOf('jinx_die') >= 0 ? '' : 'none';
    UI.btnForesight.style.display = availableSkills.indexOf('foresight') >= 0 ? '' : 'none';

    state.phase = 'idle';
    state.roundCount = 0;
    updateHUD();
    msg('选择下注区域，开始乾坤骰。');

    if (window.MiniGameBase && typeof MiniGameBase.createStartSplash === 'function') {
      MiniGameBase.createStartSplash({
        id: 'mg-start-splash-dice',
        subText: '/// DICE TERMINAL V.3.2',
        buttonText: 'NEW ROUND',
        onStart: onNewRound
      });
    }
  }

  function updateHUD() {
    UI.chips.innerHTML = window.Currency ? Currency.html(state.chips) : String(state.chips);
    UI.roundCount.textContent = String(state.roundCount);
    manaManager.updateUI();
    updateSkillButtons();
  }

  function updateSkillButtons() {
    var inPlay = state.phase === 'betting';
    var skills = forceEngine ? forceEngine.getSkills() : {};
    UI.btnFortune.disabled = !inPlay || !manaManager.canSpend((skills.fortune_die || {}).manaCost || 99);
    UI.btnJinx.disabled    = !inPlay || !manaManager.canSpend((skills.jinx_die || {}).manaCost || 99);
    UI.btnForesight.disabled = !inPlay || state.foresightUsed || !manaManager.canSpend((skills.foresight || {}).manaCost || 99);
  }

  function betTypeLabel(betType) {
    switch (betType) {
      case 'big': return '大';
      case 'small': return '小';
      case 'odd': return '单';
      case 'even': return '双';
      case 'triple': return '豹子';
      default: return String(betType || '?');
    }
  }

  // ---- 下注区域选择 ----
  function selectBetOption(betType) {
    if (state.phase !== 'betting') return;
    state.selectedBet = betType;
    UI.betOptions.forEach(function (btn) {
      btn.classList.toggle('selected', btn.getAttribute('data-bet') === betType);
    });
    UI.btnRoll.disabled = false;
    msg('已选择 [' + betTypeLabel(betType) + ']，点击 ROLL 掷骰。');
  }

  // ---- 骰子逻辑 ----
  function rollDice() {
    var d = [];
    for (var i = 0; i < 3; i++) {
      d.push(Math.floor(Math.random() * 6) + 1);
    }
    return d;
  }

  function rollDiceWithPreview() {
    var d = rollDice();
    if (state.previewDie != null) d[0] = state.previewDie;
    return d;
  }

  function isTriple(d) {
    return d[0] === d[1] && d[1] === d[2];
  }

  function diceSum(d) {
    return d[0] + d[1] + d[2];
  }

  function settleResult(d, betType) {
    var sum = diceSum(d);
    var triple = isTriple(d);

    if (triple) {
      return betType === 'triple'
        ? { win: true, payout: 30, label: '豹子！' }
        : { win: false, payout: 0, label: '豹子通吃！' };
    }

    var isBig = sum >= 11;
    var isOdd = sum % 2 === 1;

    switch (betType) {
      case 'big':    return isBig  ? { win: true, payout: 1, label: '大！' } : { win: false, payout: 0, label: '小。' };
      case 'small':  return !isBig ? { win: true, payout: 1, label: '小！' } : { win: false, payout: 0, label: '大。' };
      case 'odd':    return isOdd  ? { win: true, payout: 1, label: '单！' } : { win: false, payout: 0, label: '双。' };
      case 'even':   return !isOdd ? { win: true, payout: 1, label: '双！' } : { win: false, payout: 0, label: '单。' };
      case 'triple': return { win: false, payout: 0, label: '非豹子。' };
      default:       return { win: false, payout: 0, label: '?' };
    }
  }

  function buildBetFavorScore(d, betType) {
    var sum = diceSum(d);
    var triple = isTriple(d);
    var result = settleResult(d, betType);
    var score = result.win ? 1000 + result.payout * 120 : -220;

    switch (betType) {
      case 'big':
        score += sum >= 11 ? (sum - 10) * 36 : -(11 - sum) * 42;
        if (triple) score -= 260;
        break;
      case 'small':
        score += sum <= 10 ? (11 - sum) * 36 : -(sum - 10) * 42;
        if (triple) score -= 260;
        break;
      case 'odd':
        score += sum % 2 === 1 ? 180 : -180;
        if (triple) score -= 120;
        break;
      case 'even':
        score += sum % 2 === 0 ? 180 : -180;
        if (triple) score -= 120;
        break;
      case 'triple':
        score += triple ? 2400 : -420;
        break;
    }

    return score;
  }

  function buildChaosScore(d) {
    if (isTriple(d)) return 1500;
    return Math.round(Math.abs(diceSum(d) - 10.5) * 65);
  }

  function pickRollByForce() {
    var fortuneWeight = state.fortuneActive || 0;
    var jinxWeight = state.jinxActive || 0;
    var sampleCount = Math.max(1, 1 + Math.ceil((fortuneWeight + jinxWeight) * 14));
    var bestRoll = rollDiceWithPreview();
    var bestScore = -Infinity;

    for (var i = 0; i < sampleCount; i++) {
      var candidate = rollDiceWithPreview();
      var score = 0;

      if (fortuneWeight > 0 && state.selectedBet) {
        score += buildBetFavorScore(candidate, state.selectedBet) * (1 + fortuneWeight);
      }
      if (jinxWeight > 0) {
        score += buildChaosScore(candidate) * (0.45 + jinxWeight);
        if (state.selectedBet) score += buildBetFavorScore(candidate, state.selectedBet) * 0.4;
      }
      if (fortuneWeight === 0 && jinxWeight === 0 && state.selectedBet) {
        score += buildBetFavorScore(candidate, state.selectedBet) * 0.05;
      }

      if (score > bestScore) {
        bestScore = score;
        bestRoll = candidate;
      }
    }

    state.fortuneActive = 0;
    state.jinxActive = 0;
    state.previewDie = null;
    return bestRoll;
  }

  // ---- 掷骰动画 ----
  async function animateRoll() {
    state.busy = true;
    UI.btnRoll.disabled = true;

    // 生成最终结果
    var dice = pickRollByForce();
    state.dice = dice;

    // 直接设置目标面，CSS transition 1.5s 会自动带出满圈滚动动画
    for (var i = 0; i < 3; i++) {
      setDieFace(i, dice[i]);
    }

    // 等待 CSS transition 结束 (1.5s) + 小缓冲
    await MiniGameBase.wait(1800);

    UI.diceTotal.textContent = '总和: ' + diceSum(dice) + (isTriple(dice) ? ' (豹子)' : '');

    // 结算
    var result = settleResult(dice, state.selectedBet);
    var resultText, isWin = false, isLose = false;
    if (result.win) {
      var winAmount = state.currentBet * result.payout;
      state.chips += state.currentBet + winAmount;
      resultText = result.label + ' 赢得 ' + (window.Currency ? Currency.amount(winAmount) : winAmount);
      msg(resultText, 'win');
      isWin = true;
    } else {
      resultText = result.label;
      msg(resultText, 'lose');
      isLose = true;
    }

    gameLogger.log('REVEAL', { desc: '骰子: ' + dice.join(', ') + ' = ' + diceSum(dice) + (isTriple(dice) ? ' (豹子)' : '') });
    gameLogger.log('RESULT', { desc: resultText });
    gameLogger.showEndRound({
      resultText: resultText,
      isWin: isWin, isLose: isLose,
      playerName: configLoader.heroName(),
      round: state.roundCount,
      startingChips: state._startChips,
      endingChips: state.chips,
      betAmount: state.currentBet,
      mana: manaManager.state.enabled ? { current: manaManager.state.current, max: manaManager.state.max } : null
    });

    state.currentBet = 0;
    state.phase = 'settled';
    state.busy = false;
    UI.btnNewRound.disabled = false;
    UI.betOptions.forEach(function (btn) { btn.disabled = true; });
    updateHUD();
  }

  // ---- 流程 ----
  function onNewRound() {
    if (state.busy) return;
    if (state.chips < (betSelector.state.min || 10)) {
      msg('筹码不足。', 'lose');
      return;
    }

    state.phase = 'betting';
    state.selectedBet = null;
    state.fortuneActive = 0;
    state.jinxActive = 0;
    state.foresightUsed = false;
    state.previewDie = null;
    if (forceEngine) forceEngine.newRound();
    UI.btnNewRound.disabled = true;
    UI.btnRoll.disabled = true;

    // 重置骰面
    for (var ri = 0; ri < 3; ri++) { setDieFace(ri, 0); }
    UI.diceTotal.textContent = '请下注';
    UI.betOptions.forEach(function (btn) {
      btn.disabled = false;
      btn.classList.remove('selected');
    });

    betSelector.show();
    updateHUD();
  }

  function onBetConfirm(amount) {
    state.currentBet = amount;
    state.chips -= amount;
    state.roundCount += 1;
    state._startChips = state.chips + amount;
    gameLogger.log('BET', {
      amount: amount,
      side: state.selectedBet ? betTypeLabel(state.selectedBet) : '未选门'
    });
    tiltDiceReady();
    updateHUD();
    msg('下注 ' + (window.Currency ? Currency.amount(amount) : amount) + '。选择大/小/单/双/豹子。');
  }

  function onRoll() {
    if (state.phase !== 'betting' || !state.selectedBet || state.busy) return;
    state.phase = 'rolling';
    gameLogger.log('ACTION', { action: 'ROLL', desc: '押 ' + betTypeLabel(state.selectedBet) });
    UI.betOptions.forEach(function (btn) { btn.disabled = true; });
    animateRoll();
  }

  // ---- 技能（Force 对抗引擎） ----
  function useSkill(skillKey) {
    if (!forceEngine || state.busy) return;
    var skill = forceEngine.getSkill(skillKey);
    if (!skill || !manaManager.canSpend(skill.manaCost)) return;

    manaManager.spend(skill.manaCost);
    updateHUD();

    // Force 对抗：玩家出招 + 庄家 AI 同时暗选 → 立即结算
    var outcome = forceEngine.playerUseSkill(skillKey);
    var r = outcome.resolved;

    gameLogger.log('SKILL', {
      skill: skill.name, attr: skill.attr, cost: skill.manaCost,
      result: r.log
    });

    switch (skillKey) {
      case 'fortune_die':
        state.fortuneActive = r.playerBias;
        if (r.playerBias > 0) {
          msg(r.log, 'win');
        } else {
          msg(r.log, 'lose');
        }
        break;
      case 'jinx_die':
        state.jinxActive = r.dealerBias > 0 ? r.dealerBias : r.playerBias;
        if (r.playerBias > 0 || r.dealerBias > 0) {
          msg(r.log, 'win');
        } else {
          msg(r.log, 'lose');
        }
        break;
      case 'foresight':
        state.foresightUsed = true;
        // Psyche 信息效果：必定触发
        state.previewDie = Math.floor(Math.random() * 6) + 1;
        setDieFace(0, state.previewDie);
        msg(r.log + ' 第一颗骰子: ' + state.previewDie, 'win');
        // Psyche 拦截转化
        if (r.psycheIntercept > 0) {
          state.fortuneActive = Math.max(state.fortuneActive,
            MiniGameForce.resolveForces(
              { attr: 'moirai', power: r.psycheIntercept, type: 'fortune', skillKey: 'foresight', skillName: '拦截转化' }, null
            ).playerBias);
        }
        updateSkillButtons();
        break;
    }
  }

  // ---- 事件绑定 ----
  UI.betOptions.forEach(function (btn) {
    btn.addEventListener('click', function () {
      selectBetOption(btn.getAttribute('data-bet'));
    });
  });

  UI.btnNewRound.addEventListener('click', onNewRound);
  UI.btnRoll.addEventListener('click', onRoll);
  UI.btnFortune.addEventListener('click', function () { useSkill('fortune_die'); });
  UI.btnJinx.addEventListener('click', function () { useSkill('jinx_die'); });
  UI.btnForesight.addEventListener('click', function () { useSkill('foresight'); });

  // ---- 启动 ----
  configLoader = MiniGameBase.createConfigLoader({
    gameKey: 'dice',
    defaults: DEFAULT_CONFIG,
    onReady: initFromConfig
  });

  manaManager = MiniGameBase.createManaManager({
    barEl: UI.manaBar,
    textEl: UI.manaText,
    boxEl: UI.manaBox,
    skillBarEl: UI.skillBar
  });

  betSelector = MiniGameBase.createBetSelector({
    selectorEl: document.getElementById('bet-selector'),
    amountEl:   document.getElementById('bet-amount'),
    currencyEl: document.getElementById('bet-currency'),
    minEl:      document.getElementById('bet-min'),
    maxEl:      document.getElementById('bet-max'),
    balanceEl:  document.getElementById('bet-balance'),
    confirmBtn: document.getElementById('btn-deal'),
    min: 10, max: 500, defaultBet: 50,
    getBalance: function () { return state.chips; },
    onConfirm: onBetConfirm
  });

  (async function () {
    await configLoader.load();
    configLoader.requestFromEngine();
  })();
})();
