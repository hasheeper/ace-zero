/**
 * ===========================================
 * 龙凤决 (Dragon Tiger) — 游戏逻辑
 * ===========================================
 *
 * 规则：
 *   - 龙/虎各发一张牌，比大小
 *   - 押龙 / 押虎 → 1:1
 *   - 押和 (Tie) → 1:8
 *   - 牌面大小: A<2<...<K (花色不影响)
 *
 * Force 技能：
 *   - 龙虎增幅 (♥, 15 mana): 所押一方偏向大牌
 *   - 乾坤逆转 (♠, 20 mana): 对方偏向小牌
 *   - 先知     (♦, 10 mana): 提前窥视一方的牌 + 拦截庄家 force
 *
 * 依赖: shared/mini-game-force.js, shared/mini-game-base.js, deck.js
 */
(function () {
  'use strict';

  // ---- Force 引擎实例 ----
  var forceEngine = null;
  if (window.MiniGameForce) {
    forceEngine = MiniGameForce.createEngine({ dealerStrategy: 'random' });
    forceEngine.defineSkills({
      dt_boost: {
        key: 'dt_boost', name: '龙虎增幅', attr: 'moirai', icon: '♥',
        manaCost: 15, power: 18, type: 'fortune',
        desc: '你押的一方偏向大牌'
      },
      dt_swap: {
        key: 'dt_swap', name: '乾坤逆转', attr: 'chaos', icon: '♠',
        manaCost: 20, power: 22, type: 'curse',
        desc: '对方偏向小牌'
      },
      dt_peek: {
        key: 'dt_peek', name: '先知', attr: 'psyche', icon: '♦',
        manaCost: 10, power: 12, type: 'psyche',
        desc: '提前窥视龙或虎的牌 + 拦截庄家 force'
      }
    });
    forceEngine.autoDealerSkills();
  }

  // ---- 默认配置 ----
  var DEFAULT_CONFIG = {
    dragon_tiger: {
      startingChips: 1000,
      minBet: 10,
      maxBet: 500,
      defaultBet: 50,
      tiePayout: 8,
      mana: { enabled: true, pool: 60 },
      dealer: { rpsStrategy: 'random' }
    },
    hero: { vanguard: { name: 'PLAYER' }, mana: 60, maxMana: 60 }
  };

  // ---- 对局日志 ----
  var gameLogger = new MiniGameLogger({
    gameName: '龙凤决',
    gameKey: 'dragon_tiger',
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
    selectedSide: null,   // 'dragon' | 'tiger' | 'tie'
    roundCount: 0,
    busy: false,
    phase: 'idle',        // idle | betting | dealing | settled
    dragonCard: null,
    tigerCard: null,
    tiePayout: 8,
    // 技能
    boostActive: 0,
    swapActive: 0,
    peekUsed: false,
    peekPreview: null
  };

  var deckLib = null;

  // ---- DOM ----
  var UI = {
    chips:       document.getElementById('chips'),
    roundCount:  document.getElementById('round-count'),
    message:     document.getElementById('message'),
    btnNewRound: document.getElementById('btn-new-round'),
    btnDragon:   document.getElementById('btn-dragon'),
    btnTiger:    document.getElementById('btn-tiger'),
    btnTie:      document.getElementById('btn-tie'),
    dragonCard:  document.getElementById('dragon-card'),
    tigerCard:   document.getElementById('tiger-card'),
    dragonScore: document.getElementById('dragon-score'),
    tigerScore:  document.getElementById('tiger-score'),
    potAmount:   document.getElementById('pot-amount'),
    potClusters: document.getElementById('pot-clusters'),
    deckMount:   document.getElementById('deck-mount'),
    deckWrapper: document.getElementById('deck-wrapper'),
    manaBar:     document.getElementById('mana-bar'),
    manaText:    document.getElementById('mana-text'),
    manaBox:     document.getElementById('mana-box'),
    skillBar:    document.getElementById('skill-bar'),
    btnBoost:    document.getElementById('btn-skill-boost'),
    btnSwap:     document.getElementById('btn-skill-swap'),
    btnPeek:     document.getElementById('btn-skill-peek')
  };

  // ---- 基础模块 ----
  var configLoader, manaManager, betSelector;

  function msg(text, cls) { MiniGameBase.updateMessage(UI.message, text, cls); }

  // ---- 牌面值 ----
  function cardStrength(rank) {
    if (rank === 1) return 1;   // A = 最小
    return rank;                // 2-13, K=13 最大
  }

  function rankLabel(rank) {
    if (rank === 1)  return 'A';
    if (rank === 11) return 'J';
    if (rank === 12) return 'Q';
    if (rank === 13) return 'K';
    return String(rank);
  }

  // ---- 牌堆 ----
  function initDeck() {
    if (deckLib) { deckLib.unmount(); deckLib = null; }
    deckLib = Deck();
    deckLib.mount(UI.deckMount);
    deckLib.shuffle();
  }

  function dealCardTo(slotEl, faceUp) {
    return new Promise(function (resolve) {
      if (!deckLib || !deckLib.cards || !deckLib.cards.length) {
        initDeck();
      }
      var card = deckLib.cards.pop();
      if (!card) { resolve(null); return; }

      var wrapperRect = UI.deckWrapper.getBoundingClientRect();
      var slotRect = slotEl.getBoundingClientRect();

      var deckCenterX = wrapperRect.left + wrapperRect.width / 2;
      var deckCenterY = wrapperRect.top + wrapperRect.height / 2;
      var slotCenterX = slotRect.left + slotRect.width / 2;
      var slotCenterY = slotRect.top + slotRect.height / 2;

      card.setSide('back');

      card.animateTo({
        delay: 0, duration: 350,
        x: slotCenterX - deckCenterX,
        y: slotCenterY - deckCenterY,
        rot: 0,
        onStart: function () { card.$el.style.zIndex = '9999'; },
        onComplete: function () {
          if (faceUp) card.setSide('front');
          slotEl.innerHTML = '';
          slotEl.appendChild(card.$el);
          card.$el.style.transform = 'none';
          card.$el.style.position = 'relative';
          card.$el.style.width = '106px';
          card.$el.style.height = '148px';
          card.x = 0; card.y = 0;
          resolve(card);
        }
      });
    });
  }

  function moveDeckIndexToTop(index) {
    if (!deckLib || !deckLib.cards || index == null || index < 0 || index >= deckLib.cards.length) return;
    var topIndex = deckLib.cards.length - 1;
    if (index === topIndex) return;
    var tmp = deckLib.cards[topIndex];
    deckLib.cards[topIndex] = deckLib.cards[index];
    deckLib.cards[index] = tmp;
  }

  function moveDeckCardToTop(cardRef) {
    if (!deckLib || !deckLib.cards || !cardRef) return false;
    for (var i = deckLib.cards.length - 1; i >= 0; i--) {
      if (deckLib.cards[i] === cardRef) {
        moveDeckIndexToTop(i);
        return true;
      }
    }
    return false;
  }

  function getBiasScanCount(bias) {
    var cards = deckLib && deckLib.cards ? deckLib.cards.length : 0;
    if (!cards) return 0;
    return Math.max(14, Math.min(cards, 10 + Math.ceil((bias || 0) * 28)));
  }

  function moveScoredCardToTop(scoreFn, bias) {
    if (!deckLib || !deckLib.cards || deckLib.cards.length < 2) return false;
    var scanCount = getBiasScanCount(bias);
    var bestIdx = findBestDeckIndex(scoreFn, scanCount);
    moveDeckIndexToTop(bestIdx);
    return true;
  }

  function findBestDeckIndex(scoreFn, scanCount) {
    if (!deckLib || !deckLib.cards || !deckLib.cards.length) return -1;
    var bestIdx = deckLib.cards.length - 1;
    var bestScore = -Infinity;

    for (var i = deckLib.cards.length - 1; i >= Math.max(0, deckLib.cards.length - scanCount); i--) {
      var score = scoreFn(deckLib.cards[i], i);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    return bestIdx;
  }

  function prepareCardForSide(side) {
    if (!deckLib || !deckLib.cards || !deckLib.cards.length) return;

    if (state.peekPreview && state.peekPreview.side === side && moveDeckCardToTop(state.peekPreview.card)) {
      state.peekPreview = null;
      return;
    }

    if (state.selectedSide === 'tie') {
      if (side === 'tiger' && state.dragonCard && (state.boostActive > 0 || state.swapActive > 0)) {
        moveScoredCardToTop(function (card) {
          var rank = cardStrength(card.rank);
          var diff = Math.abs(rank - cardStrength(state.dragonCard.rank));
          return 100 - diff;
        }, Math.max(state.boostActive, state.swapActive));
      }
      return;
    }

    if (side === state.selectedSide && state.boostActive > 0) {
      moveScoredCardToTop(function (card) {
        return cardStrength(card.rank);
      }, state.boostActive);
      state.boostActive = 0;
      return;
    }

    if (side !== state.selectedSide && state.swapActive > 0) {
      moveScoredCardToTop(function (card) {
        return 20 - cardStrength(card.rank);
      }, state.swapActive);
      state.swapActive = 0;
    }
  }

  function flipCard(card) {
    return new Promise(function (resolve) {
      if (!card) { resolve(); return; }
      card.$el.style.transition = 'transform 0.4s ease';
      card.$el.style.transform = 'rotateY(90deg)';
      setTimeout(function () {
        card.setSide('front');
        card.$el.style.transform = 'rotateY(0deg)';
        setTimeout(function () {
          card.$el.style.transition = '';
          card.$el.style.transform = 'none';
          resolve();
        }, 400);
      }, 400);
    });
  }

  // ---- 初始化 ----
  function initFromConfig(cfg) {
    var gc = configLoader.gameCfg();
    var hc = configLoader.heroCfg();
    var def = DEFAULT_CONFIG.dragon_tiger;

    state.chips = Number(gc.startingChips) || Number(cfg.chips) || def.startingChips;
    state.tiePayout = Number(gc.tiePayout) || def.tiePayout;

    var manaEnabled = gc.mana && gc.mana.enabled !== false;
    var maxMana = Number(hc.maxMana) || Number(gc.mana && gc.mana.pool) || 60;
    manaManager.state.enabled = manaEnabled;
    manaManager.set(Number(hc.mana) || maxMana, maxMana);

    betSelector.configure(
      Number(gc.minBet) || def.minBet,
      Number(gc.maxBet) || def.maxBet,
      Number(gc.defaultBet) || def.defaultBet
    );

    // 技能按钮显示/隐藏
    var availableSkills = hc.miniGameSkills || ['dt_boost', 'dt_swap', 'dt_peek'];
    UI.btnBoost.style.display = availableSkills.indexOf('dt_boost') >= 0 ? '' : 'none';
    UI.btnSwap.style.display = availableSkills.indexOf('dt_swap') >= 0 ? '' : 'none';
    UI.btnPeek.style.display = availableSkills.indexOf('dt_peek') >= 0 ? '' : 'none';

    initDeck();
    state.phase = 'idle';
    updateHUD();
    msg('点击 NEW ROUND 开始龙凤决。');

    if (window.MiniGameBase && typeof MiniGameBase.createStartSplash === 'function') {
      MiniGameBase.createStartSplash({
        id: 'mg-start-splash-dragon-tiger',
        subText: '/// DRAGON TIGER TERMINAL V.3.2',
        buttonText: 'NEW ROUND',
        onStart: onNewRound
      });
    }
  }

  function updateHUD() {
    UI.chips.innerHTML = window.Currency ? Currency.html(state.chips) : String(state.chips);
    UI.roundCount.textContent = String(state.roundCount);
    updatePotVisuals();
    manaManager.updateUI();
    updateSkillButtons();
  }

  function updatePotVisuals() {
    var pot = state.currentBet || 0;
    if (UI.potAmount) {
      UI.potAmount.innerHTML = window.Currency ? Currency.html(pot) : String(pot);
    }
    if (window.AceZeroChips && UI.potClusters && window.Currency) {
      window.AceZeroChips.renderPotClusters(UI.potClusters, pot, Currency);
    }
  }

  function updateSkillButtons() {
    var inPlay = state.phase === 'betting';
    var skills = forceEngine ? forceEngine.getSkills() : {};
    UI.btnBoost.disabled = !inPlay || !manaManager.canSpend((skills.dt_boost || {}).manaCost || 99);
    UI.btnSwap.disabled  = !inPlay || !manaManager.canSpend((skills.dt_swap || {}).manaCost || 99);
    UI.btnPeek.disabled  = !inPlay || state.peekUsed || !manaManager.canSpend((skills.dt_peek || {}).manaCost || 99);
  }

  function setSideButtons(enabled) {
    UI.btnDragon.disabled = !enabled;
    UI.btnTiger.disabled = !enabled;
    UI.btnTie.disabled = !enabled;
    [UI.btnDragon, UI.btnTiger, UI.btnTie].forEach(function (b) { b.classList.remove('selected'); });
  }

  function sideLabel(side) {
    if (side === 'dragon') return '龙';
    if (side === 'tiger') return '虎';
    if (side === 'tie') return '和';
    return String(side || '?');
  }

  // ---- 流程 ----
  function onNewRound() {
    if (state.busy) return;
    if (state.chips < (betSelector.state.min || 10)) {
      msg('筹码不足。', 'lose');
      return;
    }

    state.phase = 'betting';
    state.selectedSide = null;
    state.boostActive = 0;
    state.swapActive = 0;
    state.peekUsed = false;
    state.peekPreview = null;
    state.dragonCard = null;
    state.tigerCard = null;
    if (forceEngine) forceEngine.newRound();

    UI.dragonCard.innerHTML = '';
    UI.tigerCard.innerHTML = '';
    UI.dragonScore.textContent = '—';
    UI.tigerScore.textContent = '—';
    UI.dragonCard.className = 'card-slot';
    UI.tigerCard.className = 'card-slot';
    UI.btnNewRound.disabled = true;
    initDeck();

    betSelector.show();
    updateHUD();
  }

  function onBetConfirm(amount) {
    state.currentBet = amount;
    state.chips -= amount;
    state.roundCount += 1;
    state._startChips = state.chips + amount;
    gameLogger.log('BET', { amount: amount, side: '待选门' });
    setSideButtons(true);
    updateHUD();
    msg('选择押龙、押虎或押和。');
  }

  function selectSide(side) {
    if (state.phase !== 'betting' || state.busy) return;
    state.selectedSide = side;
    [UI.btnDragon, UI.btnTiger, UI.btnTie].forEach(function (b) { b.classList.remove('selected'); });
    var btn = side === 'dragon' ? UI.btnDragon : side === 'tiger' ? UI.btnTiger : UI.btnTie;
    btn.classList.add('selected');
    gameLogger.log('ACTION', { action: 'SELECT', desc: '押 ' + sideLabel(side) });

    // 自动发牌
    doDeal();
  }

  async function doDeal() {
    state.phase = 'dealing';
    state.busy = true;
    setSideButtons(false);
    msg('发牌中…');

    // 1) 龙方发牌（面朝下）
    prepareCardForSide('dragon');
    var dc = await dealCardTo(UI.dragonCard, false);
    state.dragonCard = dc;
    await MiniGameBase.wait(500);

    // 2) 虎方发牌（面朝下）
    prepareCardForSide('tiger');
    var tc = await dealCardTo(UI.tigerCard, false);
    state.tigerCard = tc;
    await MiniGameBase.wait(600);

    // 3) 揭牌：先揭龙
    msg('揭牌 — 龙…');
    await flipCard(dc);
    UI.dragonScore.textContent = dc ? rankLabel(dc.rank) : '?';
    gameLogger.log('REVEAL', { desc: '龙: ' + (dc ? rankLabel(dc.rank) : '?') });
    await MiniGameBase.wait(800);

    // 4) 揭牌：再揭虎
    msg('揭牌 — 虎…');
    await flipCard(tc);
    UI.tigerScore.textContent = tc ? rankLabel(tc.rank) : '?';
    gameLogger.log('REVEAL', { desc: '虎: ' + (tc ? rankLabel(tc.rank) : '?') });
    await MiniGameBase.wait(600);

    // 5) 结算
    settle();
  }

  function settle() {
    var ds = state.dragonCard ? cardStrength(state.dragonCard.rank) : 0;
    var ts = state.tigerCard ? cardStrength(state.tigerCard.rank) : 0;
    var winner;

    if (ds > ts) { winner = 'dragon'; UI.dragonCard.classList.add('dragon-win'); }
    else if (ts > ds) { winner = 'tiger'; UI.tigerCard.classList.add('tiger-win'); }
    else { winner = 'tie'; }

    var bet = state.selectedSide;
    var winnings = 0;

    var resultText, isWin = false, isLose = false;
    if (winner === bet) {
      if (bet === 'tie') {
        winnings = state.currentBet * state.tiePayout;
      } else {
        winnings = state.currentBet;
      }
      state.chips += state.currentBet + winnings;
      resultText = (winner === 'tie' ? '和局！' : (winner === 'dragon' ? '龙胜！' : '虎胜！')) +
          ' 赢得 ' + (window.Currency ? Currency.amount(winnings) : winnings);
      msg(resultText, 'win');
      isWin = true;
    } else if (winner === 'tie' && bet !== 'tie') {
      var halfBack = Math.floor(state.currentBet / 2);
      state.chips += halfBack;
      resultText = '和局，返还一半下注。';
      msg(resultText);
    } else {
      resultText = (winner === 'dragon' ? '龙胜。' : winner === 'tiger' ? '虎胜。' : '和局。') + ' 你押了 ' + bet + '。';
      msg(resultText, 'lose');
      isLose = true;
    }

    gameLogger.log('RESULT', { desc: resultText + ' | 龙[' + (state.dragonCard ? rankLabel(state.dragonCard.rank) : '?') + '] 虎[' + (state.tigerCard ? rankLabel(state.tigerCard.rank) : '?') + ']' });
    var modalContext = {
      resultText: resultText,
      isWin: isWin, isLose: isLose,
      playerName: configLoader.heroName(),
      round: state.roundCount,
      startingChips: state._startChips,
      endingChips: state.chips,
      betAmount: state.currentBet,
      mana: manaManager.state.enabled ? { current: manaManager.state.current, max: manaManager.state.max } : null
    };

    setTimeout(function () {
      gameLogger.showEndRound(modalContext);
    }, 1200);

    state.currentBet = 0;
    state.phase = 'settled';
    state.busy = false;
    UI.btnNewRound.disabled = false;
    updateHUD();
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
      case 'dt_boost':
        state.boostActive = r.playerBias;
        if (r.playerBias > 0) {
          msg(r.log, 'win');
        } else {
          msg(r.log, 'lose');
        }
        break;
      case 'dt_swap':
        state.swapActive = r.dealerBias > 0 ? r.dealerBias : r.playerBias;
        if (r.playerBias > 0 || r.dealerBias > 0) {
          msg(r.log, 'win');
        } else {
          msg(r.log, 'lose');
        }
        break;
      case 'dt_peek':
        state.peekUsed = true;
        if (!deckLib || !deckLib.cards || !deckLib.cards.length) initDeck();
        var previewSide = Math.random() < 0.5 ? 'dragon' : 'tiger';
        var previewIndex = findBestDeckIndex(function (card) {
          return cardStrength(card.rank);
        }, getBiasScanCount(0.65));
        var previewCard = (previewIndex >= 0 && deckLib && deckLib.cards) ? deckLib.cards[previewIndex] : null;
        state.peekPreview = previewCard ? { side: previewSide, card: previewCard } : null;
        // Psyche 信息效果：必定触发
        msg(r.log + ' 你窥见 ' + sideLabel(previewSide) + ' 位将出现 ' + (previewCard ? rankLabel(previewCard.rank) : '?') + '。', 'win');
        // Psyche 拦截转化
        if (r.psycheIntercept > 0) {
          state.boostActive = Math.max(state.boostActive,
            MiniGameForce.resolveForces(
              { attr: 'moirai', power: r.psycheIntercept, type: 'fortune', skillKey: 'dt_peek', skillName: '拦截转化' }, null
            ).playerBias);
        }
        updateSkillButtons();
        break;
    }
  }

  // ---- 事件绑定 ----
  UI.btnNewRound.addEventListener('click', onNewRound);
  UI.btnDragon.addEventListener('click', function () { selectSide('dragon'); });
  UI.btnTiger.addEventListener('click', function () { selectSide('tiger'); });
  UI.btnTie.addEventListener('click', function () { selectSide('tie'); });
  UI.btnBoost.addEventListener('click', function () { useSkill('dt_boost'); });
  UI.btnSwap.addEventListener('click', function () { useSkill('dt_swap'); });
  UI.btnPeek.addEventListener('click', function () { useSkill('dt_peek'); });

  // ---- 启动 ----
  configLoader = MiniGameBase.createConfigLoader({
    gameKey: 'dragon_tiger',
    defaults: DEFAULT_CONFIG,
    onReady: initFromConfig
  });

  manaManager = MiniGameBase.createManaManager({
    barEl: UI.manaBar, textEl: UI.manaText,
    boxEl: UI.manaBox, skillBarEl: UI.skillBar
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
