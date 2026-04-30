(function () {
  'use strict';

  // ---- Force 引擎实例 ----
  var forceEngine = null;
  if (window.MiniGameForce) {
    forceEngine = MiniGameForce.createEngine({ dealerStrategy: 'random' });
    forceEngine.defineSkills({
      lucky_hit: {
        key: 'lucky_hit', name: '幸运一击', attr: 'moirai', icon: '♥',
        manaCost: 15, power: 18, type: 'fortune',
        desc: '下一张牌倾向有利（不爆且接近21）'
      },
      curse_transfer: {
        key: 'curse_transfer', name: '厄运转嫁', attr: 'chaos', icon: '♠',
        manaCost: 20, power: 22, type: 'curse',
        desc: '庄家下一张牌倾向坏牌（容易爆）'
      },
      peek: {
        key: 'peek', name: '底牌窥探', attr: 'psyche', icon: '♦',
        manaCost: 10, power: 12, type: 'psyche',
        desc: '揭示庄家暗牌 + 拦截庄家 force'
      }
    });
    forceEngine.autoDealerSkills();
  }

  // ============================================
  //  配置
  // ============================================

  var config = null;
  var externalConfigApplied = false;
  var deckLib = null;
  var betSelector = null;

  // ---- 对局日志 ----
  var gameLogger = new MiniGameLogger({
    gameName: '夺金廿一',
    gameKey: 'blackjack',
    onNewRound: function () { onNewRound(); },
    onRestart: function () {
      state.roundCount = 0;
      initStateFromConfig();
    }
  });

  var DEFAULT_CONFIG = {
    blackjack: {
      startingChips: 1000,
      minBet: 10,
      maxBet: 500,
      defaultBet: 50,
      dealerStandOnSoft17: true,
      allowDoubleDown: true,
      allowSplit: true,
      blackjackPayout: 1.5,
      mana: { enabled: true, pool: 60 },
      dealer: { name: '庄家', type: 'normal', rpsStrategy: 'random' }
    },
    hero: {
      vanguard: { name: 'PLAYER' },
      mana: 60,
      maxMana: 60
    }
  };

  // ============================================
  //  DOM 引用
  // ============================================

  var UI = {
    chips:          document.getElementById('chips'),
    potAmount:      document.getElementById('pot-amount'),
    potClusters:    document.getElementById('pot-clusters'),
    dealerScore:    document.getElementById('dealer-score'),
    playerScore:    document.getElementById('player-score'),
    splitScore:     document.getElementById('split-score'),
    dealerCards:    document.getElementById('dealer-cards'),
    playerCards:    document.getElementById('player-cards'),
    splitCards:     document.getElementById('split-cards'),
    splitWrapper:   document.getElementById('split-hand-wrapper'),
    deckMount:      document.getElementById('deck-mount'),
    deckWrapper:    document.getElementById('deck-wrapper'),
    message:        document.getElementById('message'),
    btnNewRound:    document.getElementById('btn-new-round'),
    btnHit:         document.getElementById('btn-hit'),
    btnStand:       document.getElementById('btn-stand'),
    metaPlayer:     document.getElementById('meta-player'),
    // 下注选择器
    betSelector:    document.getElementById('bet-selector'),
    betAmount:      document.getElementById('bet-amount'),
    betCurrency:    document.getElementById('bet-currency'),
    betMin:         document.getElementById('bet-min'),
    betMax:         document.getElementById('bet-max'),
    betBalance:     document.getElementById('bet-balance'),
    btnDeal:        document.getElementById('btn-deal'),
    // Mana
    manaBar:        document.getElementById('mana-bar'),
    manaText:       document.getElementById('mana-text'),
    manaBox:        document.getElementById('mana-box'),
    // 技能按钮
    btnSkillLucky:  document.getElementById('btn-skill-lucky'),
    btnSkillCurse:  document.getElementById('btn-skill-curse'),
    btnSkillPeek:   document.getElementById('btn-skill-peek'),
    skillBar:       document.getElementById('skill-bar')
  };

  // ============================================
  //  游戏状态
  // ============================================

  var state = {
    dealer: [],
    player: [],
    splitHand: null,        // 分牌时的第二手 (数组或null)
    dealerVisual: [],
    playerVisual: [],
    splitVisual: [],
    chips: 0,
    currentBet: 0,
    splitBet: 0,
    pendingBet: 50,         // 下注选择器中的临时值
    roundCount: 0,
    busy: false,
    phase: 'idle',          // idle | betting | player_turn | split_turn | dealer_turn | round_end
    mana: 0,
    maxMana: 0,
    manaEnabled: false,
    dealerStrategy: 'random',
    // 技能效果缓冲
    luckyHitActive: 0,      // >0 = 概率值，下一张 Hit 使用后归零
    curseActive: 0,         // >0 = 概率值，庄家下一张使用后归零
    peekUsed: false,
    dealerRespondedThisRound: false,  // 庄家本轮已响应（防止 peek + hit 双重诅咒）
    // 配置缓存
    minBet: 10,
    maxBet: 500,
    defaultBet: 50,
    allowDouble: true,
    allowSplit: true,
    bjPayout: 1.5,
    standOnSoft17: true
  };

  // ============================================
  //  工具函数
  // ============================================

  function cfg() { return config || DEFAULT_CONFIG; }

  function getBlackjackCfg() {
    return (cfg() && cfg().blackjack) || DEFAULT_CONFIG.blackjack;
  }

  function heroName() {
    var h = cfg().hero;
    if (h && h.vanguard && h.vanguard.name) return h.vanguard.name;
    return 'PLAYER';
  }

  function updateMessage(text, cls) {
    UI.message.textContent = text || '';
    UI.message.classList.remove('win', 'lose');
    if (cls) UI.message.classList.add(cls);
  }

  function cardValue(rank) {
    if (rank === 'A') return 11;
    if (rank === 'K' || rank === 'Q' || rank === 'J') return 10;
    return parseInt(rank, 10);
  }

  function scoreHand(cards) {
    var total = 0, aces = 0;
    for (var i = 0; i < cards.length; i++) {
      var v = cardValue(cards[i].rank);
      total += v;
      if (cards[i].rank === 'A') aces += 1;
    }
    while (total > 21 && aces > 0) { total -= 10; aces -= 1; }
    return total;
  }

  function isSoft17(cards) {
    var total = 0, aces = 0;
    for (var i = 0; i < cards.length; i++) {
      if (cards[i].rank === 'A') { total += 11; aces += 1; }
      else total += cardValue(cards[i].rank);
    }
    return total === 17 && aces > 0;
  }

  function rankFromDeckCard(card) {
    if (card.rank === 1) return 'A';
    if (card.rank === 11) return 'J';
    if (card.rank === 12) return 'Q';
    if (card.rank === 13) return 'K';
    return String(card.rank);
  }

  function canSplit() {
    if (!state.allowSplit) return false;
    if (state.player.length !== 2) return false;
    if (state.splitHand !== null) return false; // 已分过
    if (state.chips < state.currentBet) return false;
    return cardValue(state.player[0].rank) === cardValue(state.player[1].rank);
  }

  function canDouble() {
    if (!state.allowDouble) return false;
    if (state.player.length !== 2) return false;
    if (state.chips < state.currentBet) return false;
    return true;
  }

  // ============================================
  //  牌堆 & 动画
  // ============================================

  function resetVisualCards() {
    [state.dealerVisual, state.playerVisual, state.splitVisual].forEach(function (arr) {
      arr.forEach(function (card) {
        if (card && card.$el && card.$el.parentNode) card.$el.parentNode.removeChild(card.$el);
      });
      arr.length = 0;
    });
  }

  function initDeckTable() {
    if (deckLib) { deckLib.unmount(); deckLib = null; }
    deckLib = Deck();
    deckLib.mount(UI.deckMount);
    deckLib.shuffle();
  }

  function ensureDeckReady() {
    if (!deckLib || !deckLib.cards || deckLib.cards.length === 0) initDeckTable();
  }

  function animateDealTo(targetMount, orderIndex, faceUp, visualStore) {
    return new Promise(function (resolve) {
      ensureDeckReady();
      if (!deckLib || !deckLib.cards.length) { resolve(null); return; }

      var card = deckLib.cards.pop();
      var wrapperRect = UI.deckWrapper.getBoundingClientRect();
      var targetRect = targetMount.getBoundingClientRect();

      var cardWidth = 84, gap = 10;
      var totalCards = orderIndex + 1;
      var totalWidth = totalCards * cardWidth + (totalCards - 1) * gap;
      var startX = targetRect.left + (targetRect.width - totalWidth) / 2;
      var cardFinalX = startX + orderIndex * (cardWidth + gap) + cardWidth / 2;
      var cardFinalY = targetRect.top + targetRect.height / 2;

      var deckCenterX = wrapperRect.left + wrapperRect.width / 2;
      var deckCenterY = wrapperRect.top + wrapperRect.height / 2;

      card.animateTo({
        delay: 0, duration: 250,
        x: cardFinalX - deckCenterX,
        y: cardFinalY - deckCenterY,
        rot: 0,
        onStart: function () { card.$el.style.zIndex = String(9999); },
        onComplete: function () {
          card.setSide(faceUp ? 'front' : 'back');
          targetMount.appendChild(card.$el);
          card.$el.classList.add('bj-aligned-card');
          card.$el.style.transform = 'none';
          card.$el.style.position = 'relative';
          card.x = 0; card.y = 0;
          visualStore.push(card);
          resolve(card);
        }
      });
    });
  }

  function revealDealerHoleCard() {
    if (state.dealerVisual[1]) state.dealerVisual[1].setSide('front');
  }

  // ============================================
  //  Force 选牌（技能影响发牌）
  // ============================================

  /**
   * 玩家被庄家诅咒时：偏向让玩家爆牌的牌
   * 优先选会导致超过21的牌，其次选尽量差的牌
   */
  function _biasForPlayerBust(bias, currentScore) {
    if (!deckLib || !deckLib.cards || deckLib.cards.length < 2) return;
    if (Math.random() > bias) return;

    var cards = deckLib.cards;
    var bustThreshold = 21 - currentScore; // 超过这个值就爆
    var bestIdx = cards.length - 1;
    var bestScore = -Infinity;
    var scanCount = Math.min(cards.length, Math.max(14, 12 + Math.ceil(bias * 26)));

    for (var i = cards.length - 1; i >= cards.length - scanCount; i--) {
      var v = cardValue(rankFromDeckCard(cards[i]));
      var score;
      if (v > bustThreshold) {
        score = 1000 + v; // 能爆牌的牌最优先，越大越好
      } else {
        score = -v; // 不能爆牌就选尽量小的（让玩家拿到垃圾牌）
      }
      if (score > bestScore) { bestScore = score; bestIdx = i; }
    }

    if (bestIdx !== cards.length - 1) {
      var tmp = cards[cards.length - 1];
      cards[cards.length - 1] = cards[bestIdx];
      cards[bestIdx] = tmp;
    }
  }

  /**
   * 庄家被玩家诅咒时：偏向让庄家爆牌的牌
   * 优先选会导致庄家超过21的牌
   */
  function _biasForDealerBust(bias) {
    if (!deckLib || !deckLib.cards || deckLib.cards.length < 2) return;
    if (Math.random() > bias) return;

    var dealerScore = scoreHand(state.dealer);
    var bustThreshold = 21 - dealerScore;
    var cards = deckLib.cards;
    var bestIdx = cards.length - 1;
    var bestScore = -Infinity;
    var scanCount = Math.min(cards.length, Math.max(14, 12 + Math.ceil(bias * 26)));

    for (var i = cards.length - 1; i >= cards.length - scanCount; i--) {
      var v = cardValue(rankFromDeckCard(cards[i]));
      var score;
      if (v > bustThreshold) {
        score = 1000 + v; // 能爆牌的牌最优先
      } else {
        score = v; // 不能爆就选最大的（推向爆牌边缘）
      }
      if (score > bestScore) { bestScore = score; bestIdx = i; }
    }

    if (bestIdx !== cards.length - 1) {
      var tmp = cards[cards.length - 1];
      cards[cards.length - 1] = cards[bestIdx];
      cards[bestIdx] = tmp;
    }
  }

  /**
   * 带 Force 影响的发牌
   */
  async function dealWithBias(targetMount, orderIndex, faceUp, visualStore, biasType) {
    if (biasType === 'lucky') {
      // 玩家 Hit：先处理庄家诅咒（peek 失败穿透 / dealerCurseOnPlayerHit）
      if (state.curseActive > 0) {
        _biasForPlayerBust(state.curseActive, scoreHand(state.player));
        state.curseActive = 0;
      }
      // 再处理幸运一击
      if (state.luckyHitActive > 0) {
        var pScore = scoreHand(state.player);
        var need = 21 - pScore;
        _biasForPlayer(state.luckyHitActive, need);
        state.luckyHitActive = 0;
      }
    } else if (biasType === 'curse' && state.curseActive > 0) {
      // 庄家补牌：偏向让庄家爆牌
      _biasForDealerBust(state.curseActive);
      state.curseActive = 0;
    }
    return animateDealTo(targetMount, orderIndex, faceUp, visualStore);
  }

  function _biasForPlayer(bias, need) {
    if (!deckLib || !deckLib.cards || deckLib.cards.length < 2) return;
    if (Math.random() > Math.min(0.62, 0.28 + bias * 0.5)) return;

    var cards = deckLib.cards;
    var bestIdx = cards.length - 1;
    var safeCandidates = [];
    var scanCount = Math.min(cards.length, Math.max(12, 10 + Math.ceil(bias * 18)));

    for (var i = cards.length - 1; i >= cards.length - scanCount; i--) {
      var v = cardValue(rankFromDeckCard(cards[i]));
      if (v > need) continue;
      safeCandidates.push({
        idx: i,
        value: v,
        diff: need - v
      });
    }

    if (safeCandidates.length > 0) {
      safeCandidates.sort(function (a, b) {
        if (a.diff !== b.diff) return a.diff - b.diff;
        return b.value - a.value;
      });

      var shortlistSize = Math.min(safeCandidates.length, need <= 4 ? 3 : 4);
      var pickPool = safeCandidates.slice(0, shortlistSize);
      var weightTotal = 0;

      for (var k = 0; k < pickPool.length; k++) {
        var candidate = pickPool[k];
        var exactBonus = candidate.diff === 0 ? 1.15 : 0;
        candidate.weight = 1 / (candidate.diff + 1.35 + exactBonus);
        weightTotal += candidate.weight;
      }

      var roll = Math.random() * weightTotal;
      for (var m = 0; m < pickPool.length; m++) {
        roll -= pickPool[m].weight;
        if (roll <= 0) {
          bestIdx = pickPool[m].idx;
          break;
        }
      }
    } else {
      var fallbackValue = Infinity;
      for (var j = cards.length - 1; j >= cards.length - scanCount; j--) {
        var fv = cardValue(rankFromDeckCard(cards[j]));
        if (fv < fallbackValue) {
          fallbackValue = fv;
          bestIdx = j;
        }
      }
    }

    if (bestIdx !== cards.length - 1) {
      var tmp = cards[cards.length - 1];
      cards[cards.length - 1] = cards[bestIdx];
      cards[bestIdx] = tmp;
    }
  }

  // ============================================
  //  HUD 更新
  // ============================================

  function updateChipVisuals() {
    var pot = state.currentBet + state.splitBet;
    if (UI.potAmount) {
      UI.potAmount.innerHTML = window.Currency ? Currency.html(pot) : String(pot);
    }
    if (window.AceZeroChips && UI.potClusters && window.Currency) {
      window.AceZeroChips.renderPotClusters(UI.potClusters, pot, Currency);
    }
  }

  function _shouldHideDealerHole() {
    return state.phase === 'player_turn' || state.phase === 'split_turn' || state.phase === 'betting';
  }

  function updateHUD() {
    UI.chips.innerHTML = window.Currency ? Currency.html(state.chips) : String(state.chips);

    var pScore = scoreHand(state.player);
    UI.playerScore.textContent = String(pScore);

    if (state.splitHand) {
      UI.splitScore.textContent = String(scoreHand(state.splitHand));
    }

    var hideHole = _shouldHideDealerHole();
    var dScore = hideHole && state.dealer.length > 0
      ? cardValue(state.dealer[0].rank)
      : scoreHand(state.dealer);
    UI.dealerScore.textContent = String(dScore);

    updateChipVisuals();
    updateManaHUD();
  }

  function updateManaHUD() {
    if (!state.manaEnabled) {
      UI.manaBox.classList.add('hidden');
      UI.skillBar.classList.add('hidden');
      return;
    }
    UI.manaBox.classList.remove('hidden');
    UI.skillBar.classList.remove('hidden');

    UI.manaText.textContent = state.mana + '/' + state.maxMana;
    var pct = state.maxMana > 0 ? (state.mana / state.maxMana * 100) : 0;
    UI.manaBar.style.width = pct + '%';

    // 更新技能按钮状态
    // Fortune: 玩家回合可用（缓冲下一次 Hit）
    // Curse: 始终禁用（只能通过 QTE 在庄家补牌时释放）
    // Peek: 玩家回合可用
    var inPlay = state.phase === 'player_turn' || state.phase === 'split_turn';
    if (forceEngine) {
      var skills = forceEngine.getSkills();
      UI.btnSkillLucky.disabled = !inPlay || !skills.lucky_hit || state.mana < skills.lucky_hit.manaCost || state.luckyHitActive > 0;
      UI.btnSkillCurse.disabled = true; // 只能通过 QTE 使用
      UI.btnSkillPeek.disabled  = !inPlay || !skills.peek || state.mana < skills.peek.manaCost || state.peekUsed;
    }
  }

  function setActionEnabled(playerTurn) {
    UI.btnHit.disabled = !playerTurn;
    UI.btnStand.disabled = !playerTurn;
    updateManaHUD();
  }

  // ============================================
  //  下注选择器
  // ============================================

  function showBetSelector() {
    if (betSelector) betSelector.show();
  }

  function hideBetSelector() {
    if (betSelector) betSelector.hide();
  }

  function adjustBet(delta) {
    state.pendingBet += delta;
  }

  function updateBetDisplay() {
    if (betSelector && state.phase === 'betting') betSelector.show();
  }

  // ============================================
  //  技能使用（Force 对抗引擎）
  // ============================================

  /**
   * 通知（走消息栏）
   */
  function showForceNotify(text) {
    updateMessage(text, 'lose');
  }

  /**
   * 玩家主动使用技能（仅 lucky_hit 和 peek）
   * curse_transfer 只能通过 QTE 在庄家补牌时释放
   */
  function useSkill(skillKey) {
    if (!forceEngine || state.busy) return;
    if (skillKey === 'curse_transfer') return; // 只能通过 QTE

    var skill = forceEngine.getSkill(skillKey);
    if (!skill || state.mana < skill.manaCost) return;

    state.mana -= skill.manaCost;
    updateManaHUD();

    switch (skillKey) {
      case 'lucky_hit': {
        // Fortune: 缓冲到下一次 Hit，不做 force 对抗
        // 庄家可能在玩家 Hit 时释放诅咒来反制
        state.luckyHitActive = MiniGameForce.powerToBias(skill.power);
        updateMessage('♥ 幸运一击已准备！下一次 HIT 将偏向有利牌。', 'win');
        gameLogger.log('SKILL', { skill: skill.name, attr: skill.attr, cost: skill.manaCost, result: '缓冲激活' });
        break;
      }
      case 'peek': {
        state.peekUsed = true;

        // Psyche: 走 force 对抗（庄家可能用 fortune 反制）
        var outcome = forceEngine.playerUseSkill(skillKey);
        var r = outcome.resolved;

        // 标记庄家已响应，防止 dealerCurseOnPlayerHit 再次出招
        if (outcome.dealerSkill) {
          state.dealerRespondedThisRound = true;
        }

        gameLogger.log('SKILL', {
          skill: skill.name, attr: skill.attr, cost: skill.manaCost,
          result: r.log
        });

        // 信息效果：必定触发（不受克制影响）
        if (state.dealer.length > 1) {
          revealDealerHoleCard();
          updateMessage(r.log + ' 庄家暗牌: ' + state.dealer[1].rank, 'win');
          setTimeout(function () {
            if (state.dealerVisual[1] && state.phase !== 'dealer_turn' && state.phase !== 'round_end') {
              state.dealerVisual[1].setSide('back');
            }
          }, 3000);
        } else {
          updateMessage(r.log, 'win');
        }

        // Psyche 拦截转化的 fortune（psyche 克制 chaos 时触发）
        if (r.psycheIntercept > 0) {
          var converted = MiniGameForce.powerToBias(r.psycheIntercept);
          state.luckyHitActive = Math.max(state.luckyHitActive, converted);
          updateMessage(r.log + ' 拦截转化为幸运！', 'win');
        }

        // 庄家力量穿透（psyche 被克制时，庄家 curse/fortune 仍生效）
        if (r.dealerBias > 0) {
          // dealerBias > 0 = 对玩家不利（庄家 curse 穿透 or 庄家 fortune）
          state.curseActive = Math.max(state.curseActive, r.dealerBias);
          showForceNotify('庄家力量穿透！下一张牌偏向不利。');
        }
        updateManaHUD();
        break;
      }
    }
  }

  /**
   * 庄家 AI 在玩家 Hit 时可能释放诅咒
   * 返回: curse bias (>0 表示庄家诅咒生效，影响玩家抽牌)
   */
  function dealerCurseOnPlayerHit() {
    if (!forceEngine) return 0;
    // 庄家本轮已在 peek 对抗中出过招，不再重复
    if (state.dealerRespondedThisRound) return 0;

    // 庄家 AI 决定是否出招（使用 force 引擎的 dealerAI）
    var dealerSkill = forceEngine.dealerPickSkill();
    if (!dealerSkill || dealerSkill.type !== 'curse') return 0;

    // 庄家释放诅咒！(dealer as second arg → "only dealer" branch)
    var r = MiniGameForce.resolveForces(null, dealerSkill);
    var cursePower = r.playerBias; // dealer curse → playerBias = bias applied to player
    showForceNotify('庄家释放了 ' + dealerSkill.skillName + '！你的下一张牌可能偏向坏牌。');
    gameLogger.log('SKILL', {
      skill: '庄家·' + dealerSkill.skillName, attr: dealerSkill.attr,
      result: '庄家诅咒 bias=' + cursePower.toFixed(2)
    });

    // 如果玩家有 luckyHitActive，fortune 可以部分抵消 curse
    if (state.luckyHitActive > 0) {
      var netCurse = Math.max(0, cursePower - state.luckyHitActive * 0.6);
      showForceNotify('幸运一击部分抵消了庄家诅咒！');
      state.luckyHitActive = Math.max(0, state.luckyHitActive - cursePower * 0.5);
      return netCurse;
    }

    return cursePower;
  }

  /**
   * QTE: 庄家补牌前，消息栏提示 + 诅咒按钮亮起
   * 玩家在窗口期内点击 ♠ 按钮即可释放诅咒
   * @param {number} dealerScore - 庄家当前点数
   * @returns {Promise<number>} curse bias (>0 表示诅咒生效)
   */
  var QTE_DURATION = 2500;
  var _qteCleanup = null; // 保留引用以便外部取消

  function showQTE(dealerScore) {
    return new Promise(function (resolve) {
      if (!forceEngine || !state.manaEnabled) { resolve(0); return; }

      var curseSkill = forceEngine.getSkill('curse_transfer');
      if (!curseSkill || state.mana < curseSkill.manaCost) { resolve(0); return; }

      var done = false;
      var timer = null;

      // 消息栏提示
      updateMessage('庄家补牌中 (点数' + dealerScore + ')  — 点击 ♠ 诅咒截断！');

      // 亮起诅咒按钮
      UI.btnSkillCurse.disabled = false;
      UI.btnSkillCurse.classList.add('qte-active');

      function cleanup() {
        if (done) return;
        done = true;
        clearTimeout(timer);
        UI.btnSkillCurse.disabled = true;
        UI.btnSkillCurse.classList.remove('qte-active');
        UI.btnSkillCurse.removeEventListener('click', onCast);
        _qteCleanup = null;
      }

      function onCast() {
        if (done) return;

        state.mana -= curseSkill.manaCost;
        updateManaHUD();

        var outcome = forceEngine.playerUseSkill('curse_transfer');
        var r = outcome.resolved;

        gameLogger.log('SKILL', {
          skill: curseSkill.name, attr: curseSkill.attr, cost: curseSkill.manaCost,
          result: r.log
        });

        var curseBias = r.playerBias > 0 ? r.playerBias : (r.dealerBias > 0 ? r.dealerBias : 0);
        updateMessage('♠ ' + r.log, curseBias > 0 ? 'win' : 'lose');

        cleanup();
        resolve(curseBias);
      }

      // 绑定按钮
      UI.btnSkillCurse.addEventListener('click', onCast);
      _qteCleanup = cleanup;

      // 超时自动跳过
      timer = setTimeout(function () {
        if (!done) {
          cleanup();
          resolve(0);
        }
      }, QTE_DURATION);
    });
  }

  // ============================================
  //  结算
  // ============================================

  function settleHand(hand, bet, label) {
    var p = scoreHand(hand);
    var d = scoreHand(state.dealer);
    var payout = 0;
    var msg = '';

    var isBlackjack = hand.length === 2 && p === 21;

    if (p > 21) {
      msg = label + '爆牌。';
    } else if (isBlackjack && (state.dealer.length !== 2 || d !== 21)) {
      payout = bet + Math.floor(bet * state.bjPayout);
      msg = label + 'Blackjack！';
    } else if (d > 21 || p > d) {
      payout = bet * 2;
      msg = label + '胜！';
    } else if (p === d) {
      payout = bet;
      msg = label + '平局。';
    } else {
      msg = label + '负。';
    }

    return { payout: payout, msg: msg, won: payout > bet };
  }

  function settleRound() {
    revealDealerHoleCard();

    var results = [];
    var totalPayout = 0;

    // 主手
    var r1 = settleHand(state.player, state.currentBet, '');
    results.push(r1);
    totalPayout += r1.payout;

    // 分牌手
    if (state.splitHand) {
      var r2 = settleHand(state.splitHand, state.splitBet, '[分牌] ');
      results.push(r2);
      totalPayout += r2.payout;
    }

    state.chips += totalPayout;

    var allMsgs = results.map(function (r) { return r.msg; }).join(' ');
    var net = totalPayout - state.currentBet - state.splitBet;
    var resultText, isWin = false, isLose = false;
    if (net > 0) {
      resultText = allMsgs + ' 净赢 ' + (window.Currency ? Currency.amount(net) : net);
      updateMessage(resultText, 'win');
      isWin = true;
    } else if (net < 0) {
      resultText = allMsgs + ' 净输 ' + (window.Currency ? Currency.amount(-net) : -net);
      updateMessage(resultText, 'lose');
      isLose = true;
    } else {
      resultText = allMsgs + ' 平局。';
      updateMessage(allMsgs);
    }

    // 日志 + 结算弹窗
    var pStr = state.player.map(function (c) { return c.rank; }).join(' ');
    var dStr = state.dealer.map(function (c) { return c.rank; }).join(' ');
    gameLogger.log('RESULT', { desc: resultText + ' | 玩家[' + pStr + '=' + scoreHand(state.player) + '] 庄家[' + dStr + '=' + scoreHand(state.dealer) + ']' });
    gameLogger.showEndRound({
      resultText: resultText,
      isWin: isWin, isLose: isLose,
      playerName: heroName(),
      round: state.roundCount,
      startingChips: state._startChips,
      endingChips: state.chips,
      betAmount: state.currentBet + state.splitBet,
      mana: state.manaEnabled ? { current: state.mana, max: state.maxMana } : null
    });

    if (state.chips <= 0) {
      updateMessage('筹码归零。', 'lose');
      UI.btnNewRound.disabled = true;
    }

    state.currentBet = 0;
    state.splitBet = 0;
    state.phase = 'round_end';
    setActionEnabled(false);
    updateHUD();
  }

  // ============================================
  //  庄家回合（含 QTE 诅咒释放窗口）
  // ============================================

  function _dealerShouldDraw() {
    var ds = scoreHand(state.dealer);
    if (ds > 21) return false;
    if (ds > 17) return false;
    if (ds === 17) {
      if (isSoft17(state.dealer) && !state.standOnSoft17) return true;
      return false;
    }
    return true; // ds < 17
  }

  async function dealerPlayAndSettle() {
    state.phase = 'dealer_turn';
    state.busy = true;
    revealDealerHoleCard();
    updateHUD();
    await _wait(400);

    while (_dealerShouldDraw()) {
      var ds = scoreHand(state.dealer);

      // QTE: 给玩家释放诅咒的机会
      var curseBias = await showQTE(ds);
      if (curseBias > 0) {
        state.curseActive = curseBias;
      }

      // 发牌（如果有 curseActive 则庄家这张牌偏向坏牌）
      var dealt = await dealWithBias(UI.dealerCards, state.dealerVisual.length, true, state.dealerVisual, 'curse');
      if (!dealt) break;
      state.dealer.push({ rank: rankFromDeckCard(dealt) });
      updateHUD();
      await _wait(400);
    }

    state.busy = false;
    settleRound();
  }

  function _wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // ============================================
  //  开始新一轮
  // ============================================

  function onNewRound() {
    if (state.busy || state.phase === 'player_turn' || state.phase === 'split_turn') return;
    if (state.chips < state.minBet) {
      updateMessage('筹码不足，无法开始新局。', 'lose');
      return;
    }
    state.phase = 'betting';
    showBetSelector();
    UI.btnNewRound.disabled = true;
    setActionEnabled(false);
  }

  async function confirmDeal(amount) {
    state.busy = true;
    setActionEnabled(false);
    initDeckTable();
    resetVisualCards();
    state.dealer = [];
    state.player = [];
    state.splitHand = null;
    state.splitBet = 0;
    state.luckyHitActive = 0;
    state.curseActive = 0;
    state.peekUsed = false;
    state.dealerRespondedThisRound = false;
    state.roundCount += 1;
    if (forceEngine) forceEngine.newRound();
    state._startChips = state.chips;

    // 扣除下注
    state.currentBet = Math.max(state.minBet, Math.min(Math.min(state.maxBet, state.chips), Number(amount) || state.defaultBet));
    state.pendingBet = state.currentBet;
    state.chips -= state.currentBet;

    // 日志
    gameLogger.log('BET', { amount: state.currentBet });

    // 隐藏分牌区
    UI.splitWrapper.classList.add('hidden');

    state.phase = 'player_turn';

    // 发牌: P1 D1 P2 D2(暗)
    var p1 = await animateDealTo(UI.playerCards, 0, true, state.playerVisual);
    if (p1) state.player.push({ rank: rankFromDeckCard(p1) });
    updateHUD();

    var d1 = await animateDealTo(UI.dealerCards, 0, true, state.dealerVisual);
    if (d1) state.dealer.push({ rank: rankFromDeckCard(d1) });
    updateHUD();

    var p2 = await animateDealTo(UI.playerCards, 1, true, state.playerVisual);
    if (p2) state.player.push({ rank: rankFromDeckCard(p2) });
    updateHUD();

    var d2 = await animateDealTo(UI.dealerCards, 1, false, state.dealerVisual);
    if (d2) state.dealer.push({ rank: rankFromDeckCard(d2) });
    updateHUD();

    // 日志: 发牌摘要
    gameLogger.log('DEAL', { desc: '玩家[' + state.player.map(function(c){return c.rank;}).join(' ') + '=' + scoreHand(state.player) + '] 庄家[' + state.dealer[0].rank + ' ?]' });

    // 玩家 Blackjack
    if (scoreHand(state.player) === 21) {
      updateMessage('Blackjack！', 'win');
      state.busy = false;
      await dealerPlayAndSettle();
      return;
    }

    state.busy = false;
    setActionEnabled(true);
    updateMessage('你的回合：HIT / STAND');
  }

  // ============================================
  //  玩家操作
  // ============================================

  async function hit() {
    if ((state.phase !== 'player_turn' && state.phase !== 'split_turn') || state.busy) return;
    state.busy = true;
    setActionEnabled(false);

    var isSplit = state.phase === 'split_turn';
    var hand = isSplit ? state.splitHand : state.player;
    var mount = isSplit ? UI.splitCards : UI.playerCards;
    var visual = isSplit ? state.splitVisual : state.playerVisual;

    // 庄家 AI 可能在玩家抽牌时释放诅咒（注入 state.curseActive）
    var dealerCurseBias = dealerCurseOnPlayerHit();
    if (dealerCurseBias > 0) {
      state.curseActive = Math.max(state.curseActive, dealerCurseBias);
    }

    var dealt = await dealWithBias(mount, visual.length, true, visual, 'lucky');
    if (dealt) hand.push({ rank: rankFromDeckCard(dealt) });
    updateHUD();
    gameLogger.log('ACTION', { action: 'HIT', desc: (isSplit ? '分牌手' : '主手') + ' 抽到 ' + (dealt ? rankFromDeckCard(dealt) : '?') + ' = ' + scoreHand(hand) });

    var p = scoreHand(hand);
    if (p > 21) {
      // 爆了
      if (isSplit) {
        // 分牌手爆了，回到庄家
        state.busy = false;
        updateMessage('分牌手爆牌。庄家行动中...');
        await dealerPlayAndSettle();
      } else if (state.splitHand !== null && state.phase === 'player_turn') {
        // 主手爆了，轮到分牌手
        state.phase = 'split_turn';
        state.busy = false;
        updateMessage('主手爆牌。轮到分牌手。');
        setActionEnabled(true);
      } else {
        state.busy = false;
        settleRound();
      }
      return;
    }

    if (p === 21) {
      // 自动 stand
      state.busy = false;
      await stand();
      return;
    }

    state.busy = false;
    setActionEnabled(true);
    updateMessage('继续选择：HIT / STAND');
  }

  async function stand() {
    if ((state.phase !== 'player_turn' && state.phase !== 'split_turn') || state.busy) return;
    gameLogger.log('ACTION', { action: 'STAND', desc: (state.phase === 'split_turn' ? '分牌手' : '主手') + ' 停牌 = ' + scoreHand(state.phase === 'split_turn' ? state.splitHand : state.player) });

    if (state.phase === 'player_turn' && state.splitHand !== null) {
      // 主手 stand，轮到分牌手
      state.phase = 'split_turn';
      setActionEnabled(true);
      updateMessage('轮到分牌手。HIT / STAND');
      return;
    }

    setActionEnabled(false);
    updateMessage('庄家行动中...');
    await dealerPlayAndSettle();
  }

  async function doubleDown() {
    if (state.phase !== 'player_turn' || state.busy) return;
    if (!canDouble()) return;

    state.busy = true;
    setActionEnabled(false);

    // 加倍下注
    state.chips -= state.currentBet;
    state.currentBet *= 2;
    updateHUD();
    gameLogger.log('ACTION', { action: 'DOUBLE', desc: '加倍下注至 ' + state.currentBet });

    // 庄家 AI 可能在玩家抽牌时释放诅咒
    var dealerCurseBias = dealerCurseOnPlayerHit();
    if (dealerCurseBias > 0) {
      _biasForPlayerBust(dealerCurseBias, scoreHand(state.player));
    }

    // 只发一张牌
    var dealt = await dealWithBias(UI.playerCards, state.playerVisual.length, true, state.playerVisual, 'lucky');
    if (dealt) state.player.push({ rank: rankFromDeckCard(dealt) });
    state.luckyHitActive = 0;
    updateHUD();

    var p = scoreHand(state.player);
    if (p > 21) {
      state.busy = false;
      if (state.splitHand !== null) {
        state.phase = 'split_turn';
        updateMessage('Double 爆牌。轮到分牌手。');
        setActionEnabled(true);
      } else {
        settleRound();
      }
      return;
    }

    // 自动 stand
    state.busy = false;
    if (state.splitHand !== null) {
      state.phase = 'split_turn';
      updateMessage('Double 完成。轮到分牌手。');
      setActionEnabled(true);
    } else {
      updateMessage('Double 完成。庄家行动中...');
      await dealerPlayAndSettle();
    }
  }

  async function split() {
    if (state.phase !== 'player_turn' || state.busy) return;
    if (!canSplit()) return;

    state.busy = true;
    setActionEnabled(false);

    // 追加下注
    state.splitBet = state.currentBet;
    state.chips -= state.splitBet;

    // 拆牌
    var secondCard = state.player.pop();
    state.splitHand = [secondCard];

    // 移动视觉牌到分牌区
    UI.splitWrapper.classList.remove('hidden');
    var movedVisual = state.playerVisual.pop();
    if (movedVisual && movedVisual.$el) {
      movedVisual.$el.parentNode && movedVisual.$el.parentNode.removeChild(movedVisual.$el);
      UI.splitCards.appendChild(movedVisual.$el);
      state.splitVisual.push(movedVisual);
    }

    // 各发一张
    var p1 = await animateDealTo(UI.playerCards, state.playerVisual.length, true, state.playerVisual);
    if (p1) state.player.push({ rank: rankFromDeckCard(p1) });
    updateHUD();

    var s1 = await animateDealTo(UI.splitCards, state.splitVisual.length, true, state.splitVisual);
    if (s1) state.splitHand.push({ rank: rankFromDeckCard(s1) });
    updateHUD();

    gameLogger.log('ACTION', { action: 'SPLIT', desc: '分牌' });
    state.busy = false;
    state.phase = 'player_turn'; // 先打主手
    setActionEnabled(true);
    updateMessage('分牌完成。先打主手，HIT / STAND');
  }

  // ============================================
  //  配置初始化
  // ============================================

  function applyExternalConfig(nextConfig) {
    if (!nextConfig || externalConfigApplied) return;
    config = nextConfig;
    externalConfigApplied = true;
    initStateFromConfig();
  }

  async function loadConfig() {
    if (externalConfigApplied) return;
    if (window.parent && window.parent !== window) return;

    var paths = ['../../content/game-config.json', './game-config.json'];
    for (var i = 0; i < paths.length; i++) {
      try {
        var resp = await fetch(paths[i]);
        if (resp.ok) {
          config = await resp.json();
          initStateFromConfig();
          return;
        }
      } catch (e) { /* try next */ }
    }
    config = DEFAULT_CONFIG;
    initStateFromConfig();
  }

  function requestConfigFromEngine() {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'acezero-data-request' }, '*');
    }
  }

  function initStateFromConfig() {
    var bcfg = getBlackjackCfg();
    var heroCfg = cfg().hero || {};
    var defBJ = DEFAULT_CONFIG.blackjack;

    state.minBet = Math.max(1, Number(bcfg.minBet) || defBJ.minBet);
    state.maxBet = Math.max(state.minBet, Number(bcfg.maxBet) || defBJ.maxBet);
    state.defaultBet = Math.max(state.minBet, Math.min(state.maxBet, Number(bcfg.defaultBet) || Number(bcfg.baseBet) || defBJ.defaultBet));
    state.chips = Math.max(0, Number(bcfg.startingChips) || Number(cfg().chips) || defBJ.startingChips);
    state.allowDouble = bcfg.allowDoubleDown !== false;
    state.allowSplit = bcfg.allowSplit !== false;
    state.bjPayout = Number(bcfg.blackjackPayout) || defBJ.blackjackPayout;
    state.standOnSoft17 = bcfg.dealerStandOnSoft17 !== false;

    // Mana
    var manaCfg = bcfg.mana || defBJ.mana;
    state.manaEnabled = manaCfg && manaCfg.enabled !== false;
    state.maxMana = Number(heroCfg.maxMana) || Number(manaCfg && manaCfg.pool) || 60;
    state.mana = Number(heroCfg.mana) || state.maxMana;

    // 庄家策略
    var dealerCfg = bcfg.dealer || defBJ.dealer;
    state.dealerStrategy = (dealerCfg && dealerCfg.strategy) || (dealerCfg && dealerCfg.rpsStrategy) || 'random';
    if (forceEngine) {
      forceEngine.setDealerStrategy(state.dealerStrategy);
    }

    // 技能按钮显示/隐藏
    var availableSkills = heroCfg.miniGameSkills || ['lucky_hit', 'curse_transfer', 'peek'];
    UI.btnSkillLucky.style.display = availableSkills.indexOf('lucky_hit') >= 0 ? '' : 'none';
    UI.btnSkillCurse.style.display = availableSkills.indexOf('curse_transfer') >= 0 ? '' : 'none';
    UI.btnSkillPeek.style.display = availableSkills.indexOf('peek') >= 0 ? '' : 'none';

    state.currentBet = 0;
    state.pendingBet = state.defaultBet;
    if (betSelector) {
      betSelector.configure(state.minBet, state.maxBet, state.defaultBet);
    }
    UI.metaPlayer.textContent = 'PLAYER: ' + heroName();
    UI.btnNewRound.disabled = false;
    setActionEnabled(false);
    initDeckTable();
    resetVisualCards();
    UI.splitWrapper.classList.add('hidden');
    updateHUD();
    updateMessage('点击 NEW ROUND 开始夺金廿一。');

    if (window.MiniGameBase && typeof MiniGameBase.createStartSplash === 'function') {
      MiniGameBase.createStartSplash({
        id: 'mg-start-splash-blackjack',
        subText: '/// BJ TERMINAL V.3.2',
        buttonText: 'NEW ROUND',
        onStart: onNewRound
      });
    }
  }

  // ============================================
  //  事件绑定
  // ============================================

  window.addEventListener('message', function (event) {
    var msg = event && event.data;
    if (!msg || msg.type !== 'acezero-game-data') return;
    applyExternalConfig(msg.payload);
  });

  UI.btnNewRound.addEventListener('click', onNewRound);
  UI.btnHit.addEventListener('click', hit);
  UI.btnStand.addEventListener('click', stand);

  UI.btnSkillLucky.addEventListener('click', function () { useSkill('lucky_hit'); });
  UI.btnSkillCurse.addEventListener('click', function () { useSkill('curse_transfer'); });
  UI.btnSkillPeek.addEventListener('click', function () { useSkill('peek'); });

  // ============================================
  //  启动
  // ============================================

  betSelector = MiniGameBase.createBetSelector({
    selectorEl: UI.betSelector,
    amountEl: UI.betAmount,
    currencyEl: UI.betCurrency,
    minEl: UI.betMin,
    maxEl: UI.betMax,
    balanceEl: UI.betBalance,
    confirmBtn: UI.btnDeal,
    min: state.minBet,
    max: state.maxBet,
    defaultBet: state.defaultBet,
    getBalance: function () { return state.chips; },
    onConfirm: confirmDeal
  });

  (async function init() {
    await loadConfig();
    requestConfigFromEngine();
    if (!config) {
      config = DEFAULT_CONFIG;
      initStateFromConfig();
    }
  })();
})();
