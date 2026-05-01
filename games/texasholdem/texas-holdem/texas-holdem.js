/* global Deck, Hand, PokerAI, MonteOfZero, MentalPressureSystem, MentalUI */

(function () {
  'use strict';

  const SUIT_TRANSLATE = {0: 's', 1: 'h', 2: 'c', 3: 'd'};
  const RANK_TRANSLATE = {1: 'A', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: 'T', 11: 'J', 12: 'Q', 13: 'K'};
  const runtimeFlow = window.__ACE_RUNTIME_FLOW__ || (window.RuntimeFlow ? new window.RuntimeFlow() : null);
  window.__ACE_RUNTIME_FLOW__ = runtimeFlow;

  // ========== 游戏配置（从JSON加载或使用默认值） ==========
  let gameConfig = null;
  let _externalConfigApplied = false;
  let _configSource = null; // 'injected' | 'static'
  let tutorialController = null;

  // 默认配置（新格式）
  const DEFAULT_CONFIG = {
    blinds: [10, 20],
    chips: 1000,
    heroSeat: 'CO',
    hero: {
      vanguard: { name: 'KAZU', level: 3 },
      rearguard: { name: 'RINO', level: 5 },
      vanguardSkills: [],
      rearguardSkills: []
    },
    seats: {
      BTN: { vanguard: { name: 'ALPHA', level: 0 }, ai: 'balanced' },
      SB:  { vanguard: { name: 'BETA',  level: 0 }, ai: 'rock' },
      BB:  { vanguard: { name: 'GAMMA', level: 3 }, ai: 'aggressive' },
      UTG: { vanguard: { name: 'DELTA', level: 0 }, ai: 'passive' },
      CO:  { vanguard: { name: 'EPSILON', level: 1 }, ai: 'maniac' }
    }
  };

  // 座位顺序（德州规则：BTN 先发牌，UTG 先行动）
  const SEAT_ORDER = ['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO'];

  // AI 性格→难度映射
  const AI_DIFF_MAP = {
    passive: 'noob', rock: 'regular', balanced: 'regular',
    aggressive: 'pro', maniac: 'noob'
  };
  const MAJOR_ROLE_IDS = new Set(['KAZU', 'RINO', 'SIA', 'POPPY', 'VV', 'TRIXIE', 'EULALIA', 'KAKO', 'COTA', 'KUZUHA']);

  function _cfg() { return gameConfig || DEFAULT_CONFIG; }
  function getInitialChips() { return _cfg().chips || 1000; }
  function getSmallBlind() { var b = _cfg().blinds; return b ? b[0] : 10; }
  function getBigBlind() { var b = _cfg().blinds; return b ? b[1] : 20; }
  function getTutorialConfig() {
    return (_cfg() && _cfg().tutorial) || null;
  }
  function getTutorialHands() {
    var tutorial = getTutorialConfig();
    return tutorial && Array.isArray(tutorial.hands) ? tutorial.hands : [];
  }
  function getCurrentTutorialHandIndex() {
    var tutorial = getTutorialConfig();
    var hands = getTutorialHands();
    if (!hands.length) return 0;
    var rawIndex = tutorial && tutorial.currentHandIndex != null ? Number(tutorial.currentHandIndex) : 0;
    if (!Number.isFinite(rawIndex)) rawIndex = 0;
    return Math.max(0, Math.min(hands.length - 1, rawIndex));
  }
  function getCurrentTutorialHand() {
    var hands = getTutorialHands();
    return hands.length ? hands[getCurrentTutorialHandIndex()] : null;
  }
  function getTutorialScript() {
    var currentHand = getCurrentTutorialHand();
    if (currentHand && currentHand.script) return currentHand.script;
    var tutorial = getTutorialConfig();
    return tutorial && tutorial.script ? tutorial.script : null;
  }
  function getEffectiveHeroConfig() {
    var currentHand = getCurrentTutorialHand();
    if (currentHand && currentHand.heroOverride) {
      return Object.assign({}, _cfg().hero || {}, currentHand.heroOverride);
    }
    return (_cfg() && _cfg().hero) || null;
  }
  function getEffectiveSeatsConfig() {
    var baseSeats = Object.assign({}, (_cfg() && _cfg().seats) || {});
    var currentHand = getCurrentTutorialHand();
    var overrides = currentHand && currentHand.seatOverrides;
    if (!overrides) return baseSeats;

    Object.keys(overrides).forEach(function(seatId) {
      baseSeats[seatId] = Object.assign({}, baseSeats[seatId] || {}, overrides[seatId] || {});
    });
    return baseSeats;
  }
  function getEffectiveGameConfig() {
    var base = _cfg();
    var effective = Object.assign({}, base);
    effective.hero = getEffectiveHeroConfig();
    effective.seats = getEffectiveSeatsConfig();
    return effective;
  }
  function hasTutorialScript() {
    return !!getTutorialScript();
  }
  function shouldDisableTutorialMoz() {
    var script = getTutorialScript();
    return !!(script && script.disableMoz);
  }
  function shouldDisableTutorialAISkills() {
    var script = getTutorialScript();
    return !!(script && script.disableAISkills);
  }
  function shouldDisableTutorialHandFloor() {
    var script = getTutorialScript();
    return !!(script && script.disableHandFloor);
  }
  function isTutorialSystemEnabled(systemKey) {
    var tutorial = getTutorialConfig();
    var systems = tutorial && tutorial.systems;
    if (!systems || systems[systemKey] == null) return true;
    return systems[systemKey] !== false;
  }
  function shouldSkipTutorialSkillPhase() {
    var tutorial = getTutorialConfig();
    var currentHand = getCurrentTutorialHand();
    return !!(
      tutorial &&
      tutorial.enabled === true &&
      (
        !isTutorialSystemEnabled('magic') ||
        (currentHand && (
          currentHand.id === 'mental-basics' ||
          currentHand.id === 'kazu-rino-contrast'
        ))
      )
    );
  }

  function pickTutorialIndexProfile(indexConfig, preferredId) {
    var profiles = Array.isArray(indexConfig && indexConfig.profiles) ? indexConfig.profiles : [];
    if (!profiles.length) return null;

    var rememberedId = null;
    try {
      rememberedId = globalThis.localStorage
        ? localStorage.getItem('acezero:tutorial-profile:texas-holdem')
        : null;
    } catch (e) { /* ignore */ }

    var targetId = preferredId || rememberedId || null;
    if (targetId) {
      var exact = profiles.find(function (profile) {
        return profile && profile.id === targetId;
      });
      if (exact) return exact;
    }

    var novice = profiles.find(function (profile) {
      return profile && /novice|newbie|intro/i.test(String(profile.id || ''));
    });
    return novice || profiles[0] || null;
  }

  function pickTutorialIndexCourse(profile, preferredId) {
    var courses = Array.isArray(profile && profile.courses) ? profile.courses : [];
    if (!courses.length) {
      if (profile && profile.configPath) {
        return {
          id: profile.id || 'default-course',
          configPath: profile.configPath
        };
      }
      return null;
    }

    var rememberedId = null;
    try {
      if (globalThis.localStorage && profile && profile.id) {
        rememberedId = localStorage.getItem('acezero:tutorial-course:texas-holdem:' + profile.id);
      }
    } catch (e) { /* ignore */ }

    var targetId = preferredId || rememberedId || null;
    if (targetId) {
      var exact = courses.find(function (course) {
        return course && course.id === targetId;
      });
      if (exact) return exact;
    }

    return courses[0] || null;
  }

  async function maybeResolveTutorialConfig(config) {
    if (!config || !config.tutorialConfigPath || config._tutorialResolved) return config;

    var tutorialPath = String(config.tutorialConfigPath || '').trim();
    if (!tutorialPath) return config;

    var candidates = [tutorialPath];
    if (tutorialPath.charAt(0) !== '/' &&
        tutorialPath.indexOf('./') !== 0 &&
        tutorialPath.indexOf('../') !== 0) {
      candidates.push('../../' + tutorialPath);
      candidates.push('../../../' + tutorialPath);
    }

    for (var i = 0; i < candidates.length; i++) {
      try {
        var resp = await fetch(candidates[i]);
        if (!resp.ok) continue;
        var tutorialConfig = await resp.json();
        if (tutorialConfig && tutorialConfig.sessionMode === 'tutorial-index' && Array.isArray(tutorialConfig.profiles)) {
          var selectedProfile = pickTutorialIndexProfile(tutorialConfig, config.tutorialProfile || null);
          var selectedCourse = pickTutorialIndexCourse(selectedProfile, config.tutorialCourse || null);
          var selectedPath = selectedCourse && selectedCourse.configPath;
          if (!selectedProfile || !selectedPath) {
            return Object.assign({}, config, {
              _tutorialResolved: true
            });
          }
          return maybeResolveTutorialConfig(Object.assign({}, config, {
            sessionMode: 'tutorial',
            tutorialProfile: selectedProfile.id || null,
            tutorialCourse: selectedCourse && selectedCourse.id || null,
            tutorialConfigPath: selectedPath,
            tutorialLauncherPath: tutorialPath
          }));
        }
        return Object.assign({}, config, tutorialConfig, {
          tutorialLauncher: {
            profile: config.tutorialProfile || null,
            course: config.tutorialCourse || null,
            path: config.tutorialLauncherPath || tutorialPath
          },
          _tutorialResolved: true
        });
      } catch (e) { /* try next */ }
    }

    return config;
  }

  /**
   * 从角色配置提取显示名（vanguard.name 优先）
   */
  var _roleRuntime = window.RoleRuntime || {};
  var _charName = _roleRuntime.charName || function(char) {
    if (char && char.vanguard && char.vanguard.name) return char.vanguard.name;
    return (char && char.name) || '???';
  };
  var _charRoleMeta = _roleRuntime.charRoleMeta || function(char) {
    var raw = _charName(char);
    return { roleId: raw, roleVariant: 'base' };
  };

  function collectMajorCharacterNames(config) {
    var cfg = config || _cfg();
    var lines = [];
    var seen = Object.create(null);

    function addSlot(slot) {
      if (!slot) return;
      var slotMeta = _charRoleMeta(slot);
      var roleId = String(slotMeta && slotMeta.roleId || '').trim().toUpperCase();
      if (!roleId || !MAJOR_ROLE_IDS.has(roleId) || seen[roleId]) return;
      seen[roleId] = true;
      lines.push(roleId);
    }

    if (cfg.hero) {
      addSlot(cfg.hero.vanguard);
      addSlot(cfg.hero.rearguard);
    }

    var seats = cfg.seats || {};
    Object.keys(seats).forEach(function(seatId) {
      var seat = seats[seatId];
      addSlot(seat && seat.vanguard);
      addSlot(seat && seat.rearguard);
    });

    return lines;
  }

  /**
   * 从 seats + heroSeat 构建玩家配置列表
   * 所有玩家（hero + NPC）按 SEAT_ORDER 排列，hero 在 heroSeat 位置
   * dealerIndex 自动指向 BTN 座位的玩家
   */
  function getPlayerConfigs() {
    var cfg = getEffectiveGameConfig();
    var result = [];
    var tableChips = cfg.chips || 1000;
    var heroChips = cfg.heroChips || tableChips;
    var heroSeat = cfg.heroSeat || 'BB';
    var seats = cfg.seats || {};

    // 收集所有有人的座位（hero + NPC），按 SEAT_ORDER 排列
    for (var i = 0; i < SEAT_ORDER.length; i++) {
      var seatId = SEAT_ORDER[i];

      if (seatId === heroSeat) {
        // hero 在这个位置
        var heroMeta = cfg.hero ? _charRoleMeta(cfg.hero) : _roleMetaFromName('RINO');
        result.push({
          id: result.length,
          name: cfg.hero ? _charName(cfg.hero) : 'RINO',
          type: 'human',
          chips: heroChips,
          personality: null,
          seat: seatId,
          roleId: heroMeta.roleId,
          roleVariant: heroMeta.roleVariant
        });
      } else if (seats[seatId]) {
        // NPC 在这个位置
        var s = seats[seatId];
        var aiStyle = s.ai || 'balanced';
        var aiEmotion = s.emotion || 'calm';
        var aiDifficulty = s.difficulty || AI_DIFF_MAP[aiStyle] || 'regular';
        var seatMeta = _charRoleMeta(s);
        result.push({
          id: result.length,
          name: _charName(s),
          type: 'ai',
          chips: tableChips,
          personality: {
            riskAppetite: aiStyle,
            difficulty: aiDifficulty,
            emotion: aiEmotion,
            roleId: seatMeta.roleId,
            roleVariant: seatMeta.roleVariant
          },
          seat: seatId,
          roleId: seatMeta.roleId,
          roleVariant: seatMeta.roleVariant
        });
      }
    }

    // 安全兜底：如果 heroSeat 不在任何已定义的座位中（配置错误），追加 hero
    if (!result.some(function(p) { return p.type === 'human'; })) {
      result.unshift({
        id: 0,
        name: cfg.hero ? _charName(cfg.hero) : 'RINO',
        type: 'human',
        chips: heroChips,
        personality: null,
        seat: heroSeat,
        roleId: cfg.hero ? _charRoleMeta(cfg.hero).roleId : 'RINO',
        roleVariant: cfg.hero ? _charRoleMeta(cfg.hero).roleVariant : 'base'
      });
    }

    // 重新编号 id
    for (var j = 0; j < result.length; j++) {
      result[j].id = j;
    }

    return result;
  }

  function getPlayerConfig(index) {
    var list = getPlayerConfigs();
    return list[index] || list[0];
  }

  function resolveTutorialSkillTargetRef(targetRef, owner, gameCtx) {
    if (targetRef == null) return null;
    if (typeof targetRef === 'number') return targetRef;
    var raw = String(targetRef).trim().toLowerCase();
    var players = gameCtx && Array.isArray(gameCtx.players) ? gameCtx.players : [];
    if (raw === 'hero' || raw === 'human' || raw === 'player') {
      var hero = players.find(function(player) { return player && player.type === 'human'; });
      return hero ? hero.id : null;
    }
    if (raw === 'self' || raw === 'owner') {
      return owner ? owner.id : null;
    }
    var matched = players.find(function(player) {
      if (!player) return false;
      return String(player.seat || '').toLowerCase() === raw ||
        String(player.name || '').toLowerCase() === raw ||
        String(player.id) === raw;
    });
    return matched ? matched.id : null;
  }

  function executeTutorialNpcSkills(gameCtx) {
    var script = getTutorialScript();
    var npcSkills = script && script.npcSkills;
    var phasePlan = npcSkills && npcSkills[gameState.phase];
    if (!Array.isArray(phasePlan) || phasePlan.length === 0) return null;

    var records = [];
    for (var i = 0; i < phasePlan.length; i++) {
      var entry = phasePlan[i];
      if (!entry || !entry.skillKey) continue;

      var ownerRef = String(entry.seat || entry.owner || entry.ownerSeat || '').trim().toLowerCase();
      var owner = (gameCtx.players || []).find(function(player) {
        if (!player || player.type === 'human') return false;
        return String(player.seat || '').toLowerCase() === ownerRef ||
          String(player.name || '').toLowerCase() === ownerRef ||
          String(player.id) === ownerRef;
      });
      if (!owner) continue;

      var selectedSkill = null;
      skillSystem.skills.forEach(function(skill) {
        if (selectedSkill) return;
        if (!skill || skill.ownerId !== owner.id) return;
        if (skill.skillKey === entry.skillKey) selectedSkill = skill;
      });
      if (!selectedSkill) continue;

      var options = {
        gameContext: gameCtx
      };
      var targetId = resolveTutorialSkillTargetRef(entry.targetId != null ? entry.targetId : entry.target, owner, gameCtx);
      var protectId = resolveTutorialSkillTargetRef(entry.protectId != null ? entry.protectId : entry.protect, owner, gameCtx);
      if (targetId != null) options.targetId = targetId;
      if (protectId != null) options.protectId = protectId;

      var finalOptions = skillSystem._resolveSkillExecutionOptions(selectedSkill, owner, gameCtx, options);
      var validation = skillSystem._validateSkillExecution(selectedSkill, gameCtx, finalOptions);
      if (!validation.ok) continue;

      var prepared = skillSystem._prepareNpcSkillUse(selectedSkill, finalOptions);
      if (!prepared) continue;

      var record = skillSystem._executeNpcSkill(selectedSkill, owner, gameCtx, finalOptions);
      if (prepared.actualCost != null) record.manaCost = prepared.actualCost;
      skillSystem._log('NPC_SKILL_USED', {
        owner: selectedSkill.ownerName,
        key: selectedSkill.skillKey,
        effect: selectedSkill.effect,
        tier: selectedSkill.tier,
        targetId: record.targetId,
        targetName: record.targetName,
        timing: 'tutorial_script'
      });
      skillSystem.emit('npc:skill_used', record);
      records.push(record);
    }

    return records;
  }

  function validateUniqueRoleConstraints(configs) {
    var roleCounts = Object.create(null);
    for (var i = 0; i < (configs || []).length; i++) {
      var roleId = String(configs[i] && configs[i].roleId || '').toUpperCase();
      if (!roleId) continue;
      roleCounts[roleId] = (roleCounts[roleId] || 0) + 1;
      if (roleId === 'KAKO' && roleCounts[roleId] > 1) {
        return {
          ok: false,
          message: '配置错误：牌桌上不能同时出现两个 KAKO'
        };
      }
    }
    return { ok: true };
  }

  // 座位位置映射 (顺时针排列，从玩家位置开始)
  // 玩家永远在 bottom 位置，AI 按顺时针分布
  const SEAT_POSITIONS = {
    2: ['bottom', 'top'],
    3: ['bottom-center', 'top-left', 'top-right'],
    4: ['bottom', 'left', 'top', 'right'],
    5: ['bottom', 'bottom-left', 'top-left', 'top-right', 'bottom-right'],
    6: ['bottom', 'bottom-left', 'top-left', 'top-center', 'top-right', 'bottom-right']
  };

  // ========== UI元素 ==========
  const UI = {
    seatsContainer: document.getElementById('seats-container'),
    deckMount: document.getElementById('deck-mount'),
    boardZone: document.getElementById('community-cards'),
    txtBoard: document.getElementById('game-message'),
    potAmount: document.getElementById('pot-amount'),
    potArea: document.getElementById('main-pot-area'),
    potClusters: document.getElementById('pot-clusters'),
    toCallAmount: document.getElementById('to-call-amount'),
    // 下注按钮
    btnFold: document.getElementById('btn-fold'),
    btnCheckCall: document.getElementById('btn-check-call'),
    btnRaise: document.getElementById('btn-raise'),
    raiseControls: document.getElementById('raise-controls'),
    raiseBackdrop: document.getElementById('raise-backdrop'),
    raiseSlider: document.getElementById('raise-slider'),
    raiseSliderShell: document.getElementById('raise-slider-shell'),
    btnRaiseMinus: document.getElementById('btn-raise-minus'),
    btnRaisePlus: document.getElementById('btn-raise-plus'),
    raiseAmountDisplay: document.getElementById('raise-amount-display'),
    raiseToCallDisplay: document.getElementById('raise-to-call-display'),
    raiseMinDisplay: document.getElementById('raise-min-display'),
    raiseMaxDisplay: document.getElementById('raise-max-display'),
    btnConfirmRaise: document.getElementById('btn-confirm-raise'),
    btnCancelRaise: document.getElementById('btn-cancel-raise'),
    // 游戏控制
    btnDeal: document.getElementById('btn-deal'),
    btnForceNext: document.getElementById('btn-force-next'),
    // 日志相关
    btnCopyLog: document.getElementById('btn-copy-log'),
    btnToggleLog: document.getElementById('btn-toggle-log'),
    gameLogPanel: document.getElementById('game-log-panel'),
    gameLogContent: document.getElementById('game-log-content'),
    // Grimoire 抽屉
    grimoirePlayer: document.getElementById('grimoire-player'),
    magicKey: document.getElementById('magic-key'),
    // (玩家数量由外部 JSON 配置决定)
  };

  const RAISE_PRESET_SELECTOR = '[data-raise-preset]';

  // Grimoire 抽屉开关
  if (UI.magicKey) {
    UI.magicKey.addEventListener('click', function () {
      if (UI.grimoirePlayer) UI.grimoirePlayer.classList.toggle('active');
      UI.magicKey.classList.toggle('engaged');
    });
  }

  // ========== Splash / End-hand Modal / Row Toggle ==========
  const splashOverlay  = document.getElementById('splash-overlay');
  const splashDeal     = document.getElementById('splash-deal');
  const endhandModal   = document.getElementById('endhand-modal');
  const endhandTitle   = document.getElementById('endhand-title');
  const endhandResult  = document.getElementById('endhand-result');
  const endhandRevealWrap = document.getElementById('endhand-reveal-wrap');
  const endhandRevealHint = document.getElementById('endhand-reveal-hint');
  const endhandRevealList = document.getElementById('endhand-reveal-list');
  const endhandContinue = document.getElementById('endhand-continue');
  const endhandRestart   = document.getElementById('endhand-restart');
  const endhandLog       = document.getElementById('endhand-log');

  function isVisibleTutorialTarget(el) {
    if (!el || typeof el.getBoundingClientRect !== 'function') return false;
    var rect = el.getBoundingClientRect();
    if (!rect.width && !rect.height) return false;
    var style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  }

  function getHeroCardsTutorialTarget() {
    var hero = getHeroPlayer();
    if (!hero || !hero.seatElement) return null;
    return hero.seatElement.querySelector('.seat-cards');
  }

  function getHeroDealerTutorialTarget() {
    var hero = getHeroPlayer();
    if (!hero || !hero.seatElement) return null;
    return hero.seatElement.querySelector('.nameplate-assembly');
  }

  function getPrimaryOpponentTutorialPlayer() {
    if (!gameState || !Array.isArray(gameState.players)) return null;
    return gameState.players.find(function (player) {
      return player && player.type === 'ai' && player.isActive && !player.folded;
    }) || null;
  }

  function getOpponentCardsTutorialTarget() {
    var player = getPrimaryOpponentTutorialPlayer();
    if (!player || !player.seatElement) return null;
    return player.seatElement.querySelector('.seat-cards');
  }

  function getBoardTutorialTarget() {
    return UI.boardZone || document.getElementById('community-cards');
  }

  function describeCards(cards) {
    if (!Array.isArray(cards) || cards.length === 0) return '暂无';
    return cards.map(function (card) {
      return cardToSolverString(card);
    }).join(' ');
  }

  function refreshTutorialController() {
    if (!window.TutorialUI || typeof window.AceTutorialController !== 'function') return;
    if (!tutorialController) {
      tutorialController = window.AceTutorialController({
        tutorialUI: window.TutorialUI,
        refs: {
          splashDeal: splashDeal,
          btnDeal: UI.btnDeal,
          btnCheckCall: UI.btnCheckCall,
          btnRaise: UI.btnRaise,
          btnConfirmRaise: UI.btnConfirmRaise,
          btnFold: UI.btnFold,
          magicKey: UI.magicKey,
          btnMentalToggle: document.getElementById('btn-mental-toggle'),
          btnPresence: document.getElementById('btn-presence'),
          btnTaunt: document.getElementById('btn-taunt'),
          btnProbe: document.getElementById('btn-probe'),
          btnCenterSelf: document.getElementById('btn-center-self'),
          endhandTitle: endhandTitle,
          endhandResult: endhandResult,
          endhandContinue: endhandContinue
        },
        callbacks: {
          startNewGame: startNewGame,
          endGame: endGame,
          openTutorialMenu: openTutorialMenu
        },
        getGameState: function () {
          return gameState;
        },
        getTutorialConfig: getTutorialConfig,
        getTutorialHands: getTutorialHands,
        getCurrentTutorialHandIndex: getCurrentTutorialHandIndex,
        getCurrentTutorialHand: getCurrentTutorialHand,
        isVisibleTutorialTarget: isVisibleTutorialTarget,
        getHeroPlayer: getHeroPlayer,
        getHeroCardsTarget: getHeroCardsTutorialTarget,
        getHeroDealerTarget: getHeroDealerTutorialTarget,
        getOpponentCardsTarget: getOpponentCardsTutorialTarget,
        getBoardTarget: getBoardTutorialTarget,
        describeCards: describeCards,
        describeCurrentHand: function (player) {
          if (!player || !player.cards || player.cards.length < 2 || !globalThis.Hand) return '';
          var boardStrings = (gameState.board || []).map(cardToSolverString);
          if (!boardStrings.length) return '';
          var playerStrings = player.cards.map(cardToSolverString);
          return Hand.solve(playerStrings.concat(boardStrings)).descr || '';
        },
        setRaiseSliderValue: setRaiseSliderValue
      });
    }
    tutorialController.loadFromConfig(_cfg());
  }

  function openTutorialMenu() {
    var launcher = (_cfg() && _cfg().tutorialLauncher) || {};
    var tutorial = getTutorialConfig() || {};
    var payload = {
      path: launcher.path || (_cfg() && _cfg().tutorialConfigPath) || 'content/tutorials/texas-holdem/tutorial-index.json',
      profile: launcher.profile || tutorial.profile || null,
      course: launcher.course || tutorial.course || null
    };

    try {
      if (payload.profile) {
        localStorage.setItem('acezero:tutorial-profile:texas-holdem', payload.profile);
      }
      if (payload.profile && payload.course) {
        localStorage.setItem('acezero:tutorial-course:texas-holdem:' + payload.profile, payload.course);
      }
    } catch (e) { /* ignore */ }

    if (window.parent && window.parent !== window) {
      window.parent.postMessage({
        type: 'acezero-open-tutorial-picker',
        payload: payload
      }, '*');
      return true;
    }

    if (payload.path) {
      window.location.href = '../../index.html';
      return true;
    }
    return false;
  }

  function isPlayerStoryRevealed(player) {
    if (!player) return false;
    return !!player.storyRevealed;
  }

  function getRevealablePlayers() {
    if (!gameState || !gameState.players) return [];
    return gameState.players.filter(function (player) {
      if (!player) return false;
      if (player.type === 'human') return false;
      if (!player.cards || player.cards.length < 2) return false;
      return !isPlayerStoryRevealed(player);
    });
  }

  function revealPlayerForStory(playerId) {
    var player = gameState.players.find(function (p) { return p.id === playerId; });
    if (!player || isPlayerStoryRevealed(player)) return;

    player.storyRevealed = true;
    player.cards.forEach(function (card) {
      if (card && typeof card.setSide === 'function') card.setSide('front');
    });

    logEvent('REVEAL', {
      playerId: player.id,
      playerName: player.name,
      cards: cardsToString(player.cards),
      source: '剧情亮牌'
    });

    if (endhandResult) {
      var appendText = '\n' + player.name + '亮出手牌：' + cardsToString(player.cards);
      endhandResult.textContent = (endhandResult.textContent || '') + appendText;
    }
    updateEndhandRevealUI();
  }

  function updateEndhandRevealUI() {
    if (!endhandRevealWrap || !endhandRevealList || !endhandRevealHint) return;

    var revealable = getRevealablePlayers();
    endhandRevealList.innerHTML = '';

    if (revealable.length === 0) {
      endhandRevealWrap.style.display = 'none';
      endhandRevealHint.textContent = '';
      return;
    }

    endhandRevealWrap.style.display = 'block';
    endhandRevealHint.textContent = '结算后可追看对手手牌；点选后会记入剧情日志。';

    revealable.forEach(function (player) {
      var btn = document.createElement('button');
      btn.className = 'btn-cmd';
      btn.textContent = '看 ' + player.name + ' 的牌';
      btn.addEventListener('click', function () {
        revealPlayerForStory(player.id);
      });
      endhandRevealList.appendChild(btn);
    });
  }

  function dismissSplash() {
    if (!splashOverlay) return;
    splashOverlay.classList.add('hidden');
    setTimeout(function () { splashOverlay.style.display = 'none'; }, 500);
  }

  function setGameActive(active) {
    if (active) {
      document.body.classList.add('game-active');
    } else {
      document.body.classList.remove('game-active');
    }
  }

  function hideRaiseControls() {
    if (UI.raiseControls) UI.raiseControls.style.display = 'none';
    if (UI.raiseBackdrop) UI.raiseBackdrop.style.display = 'none';
    document.body.classList.remove('raise-open');
  }

  function showRaiseControls() {
    if (!UI.raiseControls) return;
    UI.raiseControls.style.display = 'block';
    if (UI.raiseBackdrop) UI.raiseBackdrop.style.display = 'block';
    document.body.classList.add('raise-open');
  }

  function syncRaiseAmountDisplay(value) {
    if (!UI.raiseAmountDisplay) return;
    UI.raiseAmountDisplay.innerHTML = Currency.htmlAmount(parseInt(value || 0, 10));
  }

  function setRaiseSliderValue(value) {
    if (!UI.raiseSlider) return;
    var min = parseInt(UI.raiseSlider.min || '0', 10);
    var max = parseInt(UI.raiseSlider.max || '0', 10);
    var nextValue = Math.max(min, Math.min(max, parseInt(value || min, 10)));
    UI.raiseSlider.value = nextValue;
    syncRaiseAmountDisplay(nextValue);
  }

  function nudgeRaiseSlider(direction) {
    if (!UI.raiseSlider) return;
    var min = parseInt(UI.raiseSlider.min || '0', 10);
    var max = parseInt(UI.raiseSlider.max || '0', 10);
    var step = parseInt(UI.raiseSlider.step || '1', 10) || 1;
    var current = parseInt(UI.raiseSlider.value || String(min), 10);
    var range = Math.max(step, max - min);
    var onePercent = Math.max(step, Math.round(range * 0.01 / step) * step);
    setRaiseSliderValue(current + onePercent * direction);
  }

  function applyRaisePreset(preset) {
    var player = getHeroPlayer();
    if (!player || !UI.raiseSlider) return;
    var toCall = Math.max(0, gameState.currentBet - (player.currentBet || 0));
    var min = parseInt(UI.raiseSlider.min || '0', 10);
    var max = parseInt(UI.raiseSlider.max || '0', 10);
    var target = min;

    switch (preset) {
      case 'half':
        target = Math.max(min, Math.round(max * 0.5));
        break;
      case 'pot':
        target = Math.max(min, Math.min(max, Math.max(getBigBlind(), gameState.pot + toCall)));
        break;
      case 'max':
        target = max;
        break;
      case 'min':
      default:
        target = min;
        break;
    }

    setRaiseSliderValue(target);
  }

  function bindRaiseSliderGestures() {
    if (!UI.raiseSlider || !UI.raiseSliderShell) return;
    var isDragging = false;

    function sliderStep() {
      return parseInt(UI.raiseSlider.step || '1', 10) || 1;
    }

    function updateByClientX(clientX) {
      var rect = UI.raiseSliderShell.getBoundingClientRect();
      var ratio = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
      var clampedRatio = Math.max(0, Math.min(1, ratio));
      var min = parseInt(UI.raiseSlider.min || '0', 10);
      var max = parseInt(UI.raiseSlider.max || '0', 10);
      var step = sliderStep();
      var raw = min + (max - min) * clampedRatio;
      var snapped = Math.round(raw / step) * step;
      setRaiseSliderValue(snapped);
    }

    UI.raiseSliderShell.addEventListener('pointerdown', function(event) {
      if (
        event.target === UI.raiseSlider ||
        event.target.closest(RAISE_PRESET_SELECTOR) ||
        event.target.closest('.raise-adjust-btn') ||
        event.target === UI.btnConfirmRaise ||
        event.target === UI.btnCancelRaise
      ) return;
      isDragging = true;
      updateByClientX(event.clientX);
      if (UI.raiseSliderShell.setPointerCapture) UI.raiseSliderShell.setPointerCapture(event.pointerId);
      event.preventDefault();
    });

    UI.raiseSliderShell.addEventListener('pointermove', function(event) {
      if (!isDragging) return;
      updateByClientX(event.clientX);
    });

    function endDrag(event) {
      if (!isDragging) return;
      isDragging = false;
      if (event && UI.raiseSliderShell.releasePointerCapture) {
        try { UI.raiseSliderShell.releasePointerCapture(event.pointerId); } catch (e) {}
      }
    }

    UI.raiseSliderShell.addEventListener('pointerup', endDrag);
    UI.raiseSliderShell.addEventListener('pointercancel', endDrag);
    UI.raiseSliderShell.addEventListener('lostpointercapture', function() { isDragging = false; });
  }

  function showEndhandModal(title, resultText) {
    if (!endhandModal) return;
    if (endhandTitle) endhandTitle.textContent = title || 'HAND COMPLETE';
    if (endhandResult) endhandResult.textContent = resultText || '';
    updateEndhandRevealUI();

    // 检查玩家筹码，如果低于初始筹码 5% 则禁用继续按钮
    const hero = getHeroPlayer();
    const initialChips = _cfg().heroChips || _cfg().chips || 1000;
    const continueThreshold = initialChips * 0.05;
    if (endhandContinue && hero && hero.chips < continueThreshold) {
      endhandContinue.disabled = true;
      endhandContinue.style.opacity = '0.5';
    } else if (endhandContinue) {
      endhandContinue.disabled = false;
      endhandContinue.style.opacity = '1';
    }

    endhandModal.classList.remove('fade-out');
    endhandModal.style.display = 'flex';
  }

  function dismissEndhandModal() {
    if (!endhandModal) return;
    if (endhandRevealWrap) endhandRevealWrap.style.display = 'none';
    if (endhandRevealList) endhandRevealList.innerHTML = '';
    if (endhandRevealHint) endhandRevealHint.textContent = '';
    endhandModal.classList.add('fade-out');
    setTimeout(function () { endhandModal.style.display = 'none'; }, 300);
  }

  // Splash "NEW HAND" → start game + dismiss splash
  if (splashDeal) {
    splashDeal.addEventListener('click', function () {
      dismissSplash();
      startNewGame();
    });
  }

  // End-hand modal "CONTINUE" → archive round, keep chips/mana, start new hand
  if (endhandContinue) {
    endhandContinue.addEventListener('click', function () {
      dismissEndhandModal();
      // 归档当前局日志
      var ctx = buildLogContext();
      ctx._resultMsg = _lastResultMsg;
      if (gameState.players) {
        ctx.players = ctx.players.map(function(p) {
          var gp = gameState.players.find(function(g) { return g.name === p.name; });
          if (gp && gp.type === 'human') p.isHero = true;
          return p;
        });
      }
      gameLogger.archiveRound(ctx);
      if (tutorialController && typeof tutorialController.handleContinue === 'function' &&
          tutorialController.handleContinue()) {
        return;
      }
      startNewGame(false);  // continue: keep chips
    });
  }

  // End-hand modal "RESTART" → full reset + clear session
  if (endhandRestart) {
    endhandRestart.addEventListener('click', function () {
      dismissEndhandModal();
      // 归档当前局再清空 session
      var ctx = buildLogContext();
      ctx._resultMsg = _lastResultMsg;
      if (gameState.players) {
        ctx.players = ctx.players.map(function(p) {
          var gp = gameState.players.find(function(g) { return g.name === p.name; });
          if (gp && gp.type === 'human') p.isHero = true;
          return p;
        });
      }
      gameLogger.archiveRound(ctx);
      gameLogger.resetSession();
      if (tutorialController && typeof tutorialController.resetProgress === 'function') {
        tutorialController.resetProgress();
      }
      startNewGame(true);   // restart: full reset
    });
  }

  // End-hand modal "COPY LOG" → copy AI prompt with full context
  if (endhandLog) {
    endhandLog.addEventListener('click', function () {
      if (typeof gameLogger !== 'undefined' && gameLogger.copyAIPrompt) {
        gameLogger.copyAIPrompt(buildLogContext());
      } else if (UI.gameLogContent) {
        navigator.clipboard.writeText(UI.gameLogContent.textContent).catch(function () {});
      }
      endhandLog.textContent = 'COPIED!';
      setTimeout(function () { endhandLog.textContent = 'COPY LOG'; }, 1500);
    });
  }

  // ========== 技能系统 (通过 SkillUI 统一管理) ==========
  const moz = new MonteOfZero();
  const skillSystem = new SkillSystem();
  const skillUI = new SkillUI();
  const mentalSystem = new MentalPressureSystem();
  const mentalUI = new MentalUI(mentalSystem);
  let runtimeModuleRegistry = null;

  // 设置属性回调
  mentalSystem.setAttributeCallback((playerId, attr) => {
    const player = gameState.players.find(p => p.id === playerId);
    if (!player || !player.attributes) return 0;
    return player.attributes[attr] || 0;
  });

  skillUI.init(skillSystem, moz, {
    skillPanel: document.getElementById('skill-panel'),
    manaBar: document.getElementById('mana-bar'),
    manaText: document.getElementById('mana-text'),
    backlashIndicator: document.getElementById('backlash-indicator'),
    mozStatus: document.getElementById('moz-status'),
    forceBalance: document.getElementById('force-balance'),
    foresightPanel: document.getElementById('foresight-panel')
  });

  moz.onLog = function (type, data) { logEvent('MOZ_' + type, data); };
  skillSystem.onLog = function (type, data) { logEvent('SKILL_' + type, data); };
  skillUI.onLog = function (type, data) {
    logEvent(type, data);
    if (tutorialController && typeof tutorialController.onSkillLog === 'function') {
      tutorialController.onSkillLog(type, data);
    }
  };
  skillUI.onMessage = function (msg) {
    updateMsg(msg);
    if (tutorialController && typeof tutorialController.onSkillMessage === 'function') {
      tutorialController.onSkillMessage(msg);
    }
  };

  function setupRuntimeAPI() {
    if (typeof skillSystem.setRuntimeFlow === 'function') {
      skillSystem.setRuntimeFlow(runtimeFlow);
    }

    window.AceRuntimeAPI = Object.assign({}, window.AceRuntimeAPI || {}, {
      runtimeFlow: runtimeFlow,
      skillSystem: skillSystem,
      skillUI: skillUI,
      moz: moz,
      mentalSystem: mentalSystem,
      getForceRuntime: function() {
        return window.ForceRuntime || null;
      },
      getAssetLedger: function() {
        return skillSystem && skillSystem.assetLedger ? skillSystem.assetLedger : null;
      },
      isMatchScopedUsed: function(scopeKey) {
        return !!(skillSystem && typeof skillSystem.isMatchScopedUsed === 'function' && skillSystem.isMatchScopedUsed(scopeKey));
      },
      getMatchScopedUse: function(scopeKey) {
        return skillSystem && typeof skillSystem.getMatchScopedUse === 'function'
          ? skillSystem.getMatchScopedUse(scopeKey)
          : null;
      },
      consumeMatchScopedUse: function(scopeKey, payload) {
        return !!(skillSystem && typeof skillSystem.consumeMatchScopedUse === 'function' &&
          skillSystem.consumeMatchScopedUse(scopeKey, payload));
      },
      clearMatchScopedUses: function() {
        if (skillSystem && typeof skillSystem.clearMatchScopedUses === 'function') {
          skillSystem.clearMatchScopedUses();
        }
      },
      getGameState: function() {
        return gameState;
      },
      getGameConfig: function() {
        return _cfg();
      },
      getRuntimeDirector: function() {
        return window.NpcRoleDirector || null;
      }
    });

    if (window.ForceRuntime && typeof window.ForceRuntime.setRuntimeAPI === 'function') {
      window.ForceRuntime.setRuntimeAPI(window.AceRuntimeAPI);
    }

    runtimeModuleRegistry = window.__ACE_RUNTIME_MODULES__ || (window.RuntimeModuleRegistry ? new window.RuntimeModuleRegistry(window.AceRuntimeAPI) : null);
    window.__ACE_RUNTIME_MODULES__ = runtimeModuleRegistry;
    if (runtimeModuleRegistry && typeof runtimeModuleRegistry.setRuntimeAPI === 'function') {
      runtimeModuleRegistry.setRuntimeAPI(window.AceRuntimeAPI);
    }
    if (runtimeModuleRegistry) {
      window.AceRuntimeAPI.runtimeModules = runtimeModuleRegistry;
      window.AceRuntimeAPI.registerRuntimeModule = runtimeModuleRegistry.registerRuntimeModule.bind(runtimeModuleRegistry);
      window.AceRuntimeAPI.unregisterRuntimeModule = runtimeModuleRegistry.unregisterRuntimeModule.bind(runtimeModuleRegistry);
      window.AceRuntimeAPI.listRuntimeModules = runtimeModuleRegistry.listModules.bind(runtimeModuleRegistry);
      window.registerRuntimeModule = window.AceRuntimeAPI.registerRuntimeModule;
      window.unregisterRuntimeModule = window.AceRuntimeAPI.unregisterRuntimeModule;
    }

    if (window.AceRuntimeAPI.registerRuntimeModule &&
        window.AceBuiltinModules &&
        typeof window.AceBuiltinModules.registerBuiltinRoleModules === 'function') {
      window.AceBuiltinModules.registerBuiltinRoleModules(window.AceRuntimeAPI);
    } else if (window.AceRuntimeAPI.registerRuntimeModule &&
        window.AceBuiltinModules &&
        typeof window.AceBuiltinModules.registerSiaRoleModule === 'function') {
      window.AceBuiltinModules.registerSiaRoleModule(window.AceRuntimeAPI);
    }

    if (window.NpcRoleDirector) {
      window.AceRuntimeAPI.listRuntimeProfiles = window.NpcRoleDirector.listProfiles.bind(window.NpcRoleDirector);
      window.AceRuntimeAPI.listRuntimeRoles = window.NpcRoleDirector.listRoles.bind(window.NpcRoleDirector);
      console.log('[Runtime] director profiles=', window.AceRuntimeAPI.listRuntimeProfiles());
      console.log('[Runtime] director roles=', window.AceRuntimeAPI.listRuntimeRoles());
    }
  }

  setupRuntimeAPI();

  // 心理战技能事件监听
  skillSystem.on('skill:activated', function(data) {
    if (data.type === 'mental_pressure' && data.targetId != null) {
      var result = mentalSystem.applyPressure(
        data.skill.ownerId,
        data.targetId,
        data.pressureType,
        data.basePower,
        data.equityBias,
        data.confidenceDelta
      );
      if (result) {
        updateMsg('定力 -' + result.finalPressure + ' → ' + result.newComposure);
      }
    } else if (data.type === 'mental_recover') {
      var result = mentalSystem.applyRecover(
        data.skill.ownerId,
        data.baseRecover,
        data.confidenceDelta,
        data.clearBias
      );
      if (result) {
        updateMsg('定力 +' + result.recover + ' → ' + result.newComposure);
      }
    } else if (data.type === 'lucky_find') {
      var luckOwner = data.ownerName || (data.skill && data.skill.ownerName) || 'POPPY';
      var beforeMana = data.manaBefore != null ? data.manaBefore : null;
      var afterMana = data.manaAfter != null ? data.manaAfter : null;
      var manaText = beforeMana != null && afterMana != null
        ? 'MP ' + beforeMana + '→' + afterMana
        : 'MP -' + (data.spentMana != null ? data.spentMana : 5);
      updateMsg('[' + luckOwner + '] 捡到了！ fortune +20，' + manaText);
      logEvent('POPPY_LUCKY_FIND', {
        owner: luckOwner,
        ownerId: data.ownerId != null ? data.ownerId : (data.skill && data.skill.ownerId),
        phase: data.phase || null,
        chance: data.triggerChance != null ? data.triggerChance : null,
        manaBefore: beforeMana,
        manaAfter: afterMana
      });
    } else if (data.type === 'miracle') {
      var miracleOwner = data.ownerName || (data.skill && data.skill.ownerName) || 'POPPY';
      updateMsg('[' + miracleOwner + '] 命大启动，抽空 ' + (data.drainedMana || 0) + ' MP');
      logEvent('POPPY_MIRACLE', {
        owner: miracleOwner,
        ownerId: data.ownerId != null ? data.ownerId : (data.skill && data.skill.ownerId),
        drainedMana: data.drainedMana || 0,
        packPower: data.packPower || 0,
        packs: data.packs || 0
      });
    }
  });

  skillSystem.on('poppy:lucky_find_roll', function(data) {
    if (!data) return;
    var ownerName = data.ownerName || 'POPPY';
    var chancePercent = Math.round((Number(data.chance || 0)) * 100);
    console.log('[POPPY] lucky_find_roll', data);
    logEvent('POPPY_LUCKY_FIND_ROLL', {
      owner: ownerName,
      ownerId: data.ownerId,
      phase: data.phase || null,
      chance: chancePercent + '%',
      success: !!data.success,
      blocked: !!data.blocked,
      reason: data.reason || null,
      manaBefore: data.manaBefore,
      manaAfter: data.manaAfter,
      spentMana: data.spentMana || 0
    });
  });

  skillSystem.on('poppy:cockroach_recover', function(data) {
    if (!data || (!data.manaRecovered && !data.fortuneRecovered)) return;
    var ownerName = data.ownerName || 'POPPY';
    console.log('[POPPY] cockroach_recover', data);
    var parts = [];
    if (data.manaRecovered) parts.push('+' + data.manaRecovered + ' MP');
    if (data.fortuneRecovered) parts.push('fortune +' + data.fortuneRecovered);
    updateMsg('[' + ownerName + '] 不死身回收 ' + parts.join(' / '));
    logEvent('POPPY_COCKROACH_RECOVER', {
      owner: ownerName,
      ownerId: data.ownerId,
      phase: data.phase || null,
      streetTotalManaSpent: data.streetTotalManaSpent || 0,
      convertedChaos: data.convertedChaos || 0,
      recovered: data.recovered || 0,
      manaRecovered: data.manaRecovered || 0,
      fortuneRecovered: data.fortuneRecovered || 0,
      manaBefore: data.manaBefore,
      manaAfter: data.manaAfter
    });
  });

  skillSystem.on('poppy:cockroach_check', function(data) {
    if (!data) return;
    console.log('[POPPY] cockroach_check', data);
    logEvent('POPPY_COCKROACH_CHECK', {
      owner: data.ownerName || 'POPPY',
      ownerId: data.ownerId,
      success: !!data.success,
      reason: data.reason || null,
      chipRatio: data.chipRatio != null ? data.chipRatio : null,
      reclaimThreshold: data.reclaimThreshold != null ? data.reclaimThreshold : null,
      streetTotalManaSpent: data.streetTotalManaSpent || 0,
      convertedChaos: data.convertedChaos || 0,
      manaRecovered: data.manaRecovered || 0,
      fortuneRecovered: data.fortuneRecovered || 0
    });
  });

  skillSystem.on('poppy:miracle_ready', function(data) {
    if (!data) return;
    var ownerName = data.ownerName || 'POPPY';
    console.log('[POPPY] miracle_ready', data);
    updateMsg('[' + ownerName + '] 进入命大局（' + (data.packs || 0) + '街）');
    logEvent('POPPY_MIRACLE_READY', {
      owner: ownerName,
      ownerId: data.ownerId,
      chipRatio: data.chipRatio != null ? data.chipRatio : null,
      triggerThreshold: data.triggerThreshold != null ? data.triggerThreshold : null,
      drainedMana: data.drainedMana || 0,
      packPower: data.packPower || 0,
      packs: data.packs || 0
    });
  });

  skillSystem.on('kuzuha:house_edge_applied', function(data) {
    if (!data) return;
    console.log('[KUZUHA] house_edge_applied', data);
    logEvent('KUZUHA_HOUSE_EDGE_APPLIED', {
      ownerId: data.ownerId,
      targetId: data.targetId,
      debtBefore: data.debtBefore || 0,
      baseDebtGain: data.baseDebtGain || 0,
      traitDebtGain: data.traitDebtGain || 0,
      debtAfter: data.debtAfter || 0
    });
  });

  skillSystem.on('kuzuha:debt_sync', function(data) {
    if (!data) return;
    console.log('[KUZUHA] debt_sync', data);
    logEvent('KUZUHA_DEBT_SYNC', {
      ownerId: data.ownerId,
      ownerName: data.ownerName || null,
      totalDebt: data.totalDebt || 0,
      tier: data.tier || 0,
      hasMark: !!data.hasMark
    });
  });

  skillSystem.on('eulalia:burst_triggered', function(data) {
    if (!data) return;
    console.log('[EULALIA] burst_triggered', data);
    var shares = Array.isArray(data.targetShares) ? data.targetShares : [];
    var summary = shares
      .filter(function(entry) { return entry && Number(entry.share || 0) > 0; })
      .map(function(entry) { return (entry.targetName || ('ID:' + entry.targetId)) + ' -' + Number(entry.share || 0); })
      .join(' / ');
    updateMsg('[EULALIA] 赦令爆发 ' + (summary || ('总计 -' + (data.burstTotal || 0))));
    logEvent('EULALIA_BURST_TRIGGERED', {
      ownerId: data.ownerId,
      ownerName: data.ownerName || 'EULALIA',
      phase: data.phase || null,
      burstTotal: data.burstTotal || 0,
      targetShares: shares
    });
  });

  skillSystem.on('eulalia:burst_resolved', function(data) {
    if (!data) return;
    console.log('[EULALIA] burst_resolved', data);
    var shares = Array.isArray(data.targetShares) ? data.targetShares : [];
    logEvent('EULALIA_BURST_RESOLVED', {
      ownerId: data.ownerId,
      ownerName: data.ownerName || 'EULALIA',
      phase: data.phase || null,
      burstTotal: data.burstTotal || 0,
      targetShares: shares
    });
  });

  skillSystem.on('eulalia:burden_absorbed', function(data) {
    if (!data) return;
    var ownerName = data.ownerName || 'EULALIA';
    logEvent('EULALIA_BURDEN_ABSORBED', {
      ownerId: data.ownerId,
      ownerName: ownerName,
      phase: data.phase || null,
      reason: data.reason || null,
      removedCount: data.removedCount || 0,
      absorbedPower: data.absorbedPower || 0,
      vvBubblePower: data.vvBubblePower || 0,
      vvBubbleCount: data.vvBubbleCount || 0,
      streetTotal: data.streetTotal || 0,
      absolutionTotal: data.absolutionTotal || 0
    });
  });

  skillSystem.on('trixie:wild_card_forged', function(data) {
    if (!data) return;
    console.log('[TRIXIE] wild_card_forged', data);
    logEvent('TRIXIE_WILD_CARD_FORGED', {
      ownerId: data.ownerId,
      ownerName: data.ownerName || 'TRIXIE',
      phase: data.phase || null,
      rawFortune: data.rawFortune || 0,
      rawCurse: data.rawCurse || 0,
      adjustedFortune: data.adjustedFortune || 0,
      adjustedCurse: data.adjustedCurse || 0,
      forged: data.forged || 0,
      bonus: data.bonus || 0,
      before: data.before || 0,
      after: data.after || 0,
      overflow: data.overflow || 0
    });
  });

  skillSystem.on('trixie:wild_card_sync', function(data) {
    if (!data) return;
    console.log('[TRIXIE] wild_card_sync', data);
    logEvent('TRIXIE_WILD_CARD_SYNC', {
      ownerId: data.ownerId,
      ownerName: data.ownerName || 'TRIXIE',
      wildCard: data.wildCard || 0,
      tier: data.tier || 0,
      hasMark: !!data.hasMark
    });
  });

  skillSystem.on('trixie:rule_rewrite_cast', function(data) {
    if (!data) return;
    console.log('[TRIXIE] rule_rewrite_cast', data);
    logEvent('TRIXIE_RULE_REWRITE_CAST', data);
  });

  skillSystem.on('trixie:rule_rewrite_contract', function(data) {
    if (!data) return;
    console.log('[TRIXIE] rule_rewrite_contract', data);
    logEvent('TRIXIE_RULE_REWRITE_CONTRACT', data);
  });

  skillSystem.on('trixie:rule_rewrite_tick', function(data) {
    if (!data) return;
    console.log('[TRIXIE] rule_rewrite_tick', data);
    logEvent('TRIXIE_RULE_REWRITE_TICK', data);
  });

  skillSystem.on('trixie:blind_box_cast', function(data) {
    if (!data) return;
    console.log('[TRIXIE] blind_box_cast', data);
    logEvent('TRIXIE_BLIND_BOX_CAST', data);
  });

  skillSystem.on('trixie:blind_box_tick', function(data) {
    if (!data) return;
    console.log('[TRIXIE] blind_box_tick', data);
    logEvent('TRIXIE_BLIND_BOX_TICK', data);
  });

  skillSystem.on('trixie:blind_box_revert', function(data) {
    if (!data) return;
    console.log('[TRIXIE] blind_box_revert', data);
    logEvent('TRIXIE_BLIND_BOX_REVERT', data);
  });

  skillSystem.on('vv:service_fee', function(data) {
    if (!data) return;
    updateMsg('VV 手续费：回收 ' + Math.max(0, Number(data.manaFee || 0)) + ' mana / 获得 ' + Math.max(0, Number(data.fortuneFee || 0)) + ' fortune');
    logEvent('VV_SERVICE_FEE', {
      collector: data.collectorName,
      sourceOwnerId: data.sourceOwnerId,
      resourceType: data.resourceType,
      gross: data.amount,
      manaFee: data.manaFee,
      fortuneFee: data.fortuneFee,
      sourceSkillKey: data.sourceSkillKey
    });
  });

  skillSystem.on('vv:liquidation_resolved', function(data) {
    if (!data) return;
    gameState._vvLiquidationPanelEntries = Array.isArray(gameState._vvLiquidationPanelEntries)
      ? gameState._vvLiquidationPanelEntries.filter(function(entry) {
          return entry && entry.targetId !== data.targetId;
        })
      : [];
    gameState._vvLiquidationPanelEntries.push({
      ownerId: data.ownerId,
      ownerName: data.ownerName,
      targetId: data.targetId,
      targetName: data.targetName,
      packCount: data.packCount,
      targetFortuneBurst: Math.max(0, Number(data.targetFortuneBurst || 0)),
      targetChaosBurst: Math.max(0, Number(data.targetChaosBurst || 0)),
      recoveredMana: Math.max(0, Number(data.recoveredMana || 0)),
      drainedMana: Math.max(0, Number(data.drainedMana || 0)),
      targetManaBefore: data.targetManaBefore != null ? Math.max(0, Number(data.targetManaBefore || 0)) : null,
      targetManaAfter: data.targetManaAfter != null ? Math.max(0, Number(data.targetManaAfter || 0)) : null,
      casterManaBefore: data.casterManaBefore != null ? Math.max(0, Number(data.casterManaBefore || 0)) : null,
      casterManaAfter: data.casterManaAfter != null ? Math.max(0, Number(data.casterManaAfter || 0)) : null,
      baselineShare: Math.max(0, Number(data.baselineShare || 0)),
      currentShare: Math.max(0, Number(data.currentShare || 0)),
      packDetails: Array.isArray(data.packDetails) ? data.packDetails.slice() : []
    });
    console.log('[VV] liquidation_resolved', data);
    var targetName = data.targetName || ('ID:' + data.targetId);
    if (Number(data.packCount || 0) <= 0) {
      updateMsg('VV 清算落空：' + targetName + ' 没有可清算的当前投资轮');
      logEvent('VV_LIQUIDATION_RESOLVED', data);
      return;
    }
    var pack = Array.isArray(data.packDetails) && data.packDetails.length ? data.packDetails[0] : null;
    var packText = pack
      ? (' T' + Math.max(1, Number(pack.tier || 1)) +
        ' / ' + (pack.direction === 'bearish' ? '看跌' : '看涨') +
        ' / 偏离L' + Math.max(0, Number(pack.level || 0)))
      : '';
    updateMsg(
      'VV 清算 ' + targetName +
      packText +
      '：份额 ' + Math.round(Number(data.baselineShare || 0) * 100) + '% → ' + Math.round(Number(data.currentShare || 0) * 100) + '%' +
      '，爆开 fortune ' + Math.max(0, Number(data.targetFortuneBurst || 0)) +
      ' / chaos ' + Math.max(0, Number(data.targetChaosBurst || 0)) +
      '，回收 ' + Math.max(0, Number(data.recoveredMana || 0)) + ' mana' +
      '，抽干 ' + Math.max(0, Number(data.drainedMana || 0)) + ' mana' +
      (data.targetManaBefore != null && data.targetManaAfter != null
        ? '（' + Math.max(0, Number(data.targetManaBefore || 0)) + ' → ' + Math.max(0, Number(data.targetManaAfter || 0)) + '）'
        : '')
    );
    logEvent('VV_LIQUIDATION_RESOLVED', data);
  });

  skillSystem.on('hand:new', function() {
    gameState._vvLiquidationPanelEntries = [];
  });

  skillSystem.on('mana:changed', function(data) {
    if (!data || data.ownerId == null) return;
    var player = gameState.players.find(function(p) { return p.id === data.ownerId; });
    if (player) updateSeatDisplay(player);
    if (skillUI && typeof skillUI.updateDisplay === 'function') {
      skillUI.updateDisplay();
    }
  });

  skillSystem.on('kako:red_seal_changed', function(data) {
    if (!data) return;
    if (data.active) {
      updateMsg('[KAKO] ' + (data.ownerName || ('ID:' + data.ownerId)) + ' 盖上红章');
      logEvent('KAKO_RED_SEAL', {
        ownerId: data.ownerId,
        ownerName: data.ownerName || null,
        active: true,
        phase: data.phase || null,
        stats: data.stats || null
      });
    } else {
      logEvent('KAKO_RED_SEAL', {
        ownerId: data.ownerId,
        ownerName: data.ownerName || null,
        active: false,
        phase: data.phase || null,
        stats: data.stats || null
      });
    }
  });

  skillSystem.on('kako:contract_queued', function(data) {
    if (!data) return;
    var ownerName = data.ownerName || 'KAKO';
    if (data.kind === 'general_ruling') {
      updateMsg('[' + ownerName + '] 登记总务裁定');
    } else if (data.targetName) {
      updateMsg('[' + ownerName + '] 登记改判 → ' + data.targetName);
    }
    logEvent('KAKO_CONTRACT_QUEUED', {
      ownerId: data.ownerId,
      ownerName: ownerName,
      contractId: data.contractId || null,
      kind: data.kind || null,
      targetId: data.targetId != null ? data.targetId : null,
      targetName: data.targetName || null,
      contractCount: data.contractCount || 0,
      phase: data.phase || null
    });
  });

  skillSystem.on('kako:window_opened', function(data) {
    if (!data) return;
    logEvent('KAKO_WINDOW_OPENED', {
      ownerId: data.ownerId,
      ownerName: data.ownerName || 'KAKO',
      mode: data.mode || 'human',
      entryCount: data.entryCount || 0,
      sourceSkill: data.sourceSkill || null,
      entries: Array.isArray(data.entries) ? data.entries : [],
      phase: data.phase || null
    });
  });

  skillSystem.on('kako:window_skipped', function(data) {
    if (!data) return;
    updateMsg('[' + (data.ownerName || 'KAKO') + '] 本次改判未形成有效裁定项');
    logEvent('KAKO_WINDOW_SKIPPED', {
      ownerId: data.ownerId,
      ownerName: data.ownerName || 'KAKO',
      contractCount: data.contractCount || 0,
      sourceSkill: data.sourceSkill || null,
      reason: data.reason || null,
      phase: data.phase || null
    });
  });

  skillSystem.on('kako:ruling_resolved', function(data) {
    if (!data) return;
    var entries = Array.isArray(data.entries) ? data.entries : [];
    if (entries.length) {
      var summary = entries.map(function(entry) {
        var typeLabel = entry.selectedType === 'fortune' ? '幸运' : '厄运';
        return (entry.targetName || ('ID:' + entry.targetId)) + ' ' +
          typeLabel + (entry.decision === 'approve' ? '通过' : '拦截');
      }).join(' / ');
      updateMsg('[' + (data.ownerName || 'KAKO') + '] 判决完成：' + summary);
    }
    logEvent('KAKO_RULING_RESOLVED', {
      ownerId: data.ownerId,
      ownerName: data.ownerName || 'KAKO',
      resultMode: data.resultMode || null,
      sourceSkill: data.sourceSkill || null,
      entries: entries,
      phase: data.phase || null
    });
  });

  skillSystem.on('kako:signoff_flow', function(data) {
    if (!data) return;
    updateMsg('[' + (data.ownerName || 'KAKO') + '] 签批流程 +' + (data.manaGain || 0) + ' MP');
    logEvent('KAKO_SIGNOFF_FLOW', {
      ownerId: data.ownerId,
      ownerName: data.ownerName || 'KAKO',
      redlineRate: data.redlineRate != null ? data.redlineRate : null,
      manaGain: data.manaGain || 0,
      manaBefore: data.manaBefore,
      manaAfter: data.manaAfter,
      phase: data.phase || null
    });
  });

  skillSystem.on('status:mark', function(data) {
    if (!data || data.ownerId == null || !data.payload) return;
    var player = gameState.players.find(function(p) { return p.id === data.ownerId; });
    if (!player) return;
    var current = Array.isArray(player._statusMarks) ? player._statusMarks.slice() : [];
    var nextMark = {
      key: data.key,
      icon: data.payload.icon || '',
      iconMode: data.payload.iconMode || '',
      title: data.payload.title || '',
      tone: data.payload.tone || '',
      count: data.payload.count != null ? Number(data.payload.count || 0) : 0,
      badgeText: data.payload.badgeText || '',
      detail: data.payload.detail || ''
    };
    var existingIndex = current.findIndex(function(mark) { return mark.key === data.key; });
    if (existingIndex >= 0) current[existingIndex] = nextMark;
    else current.push(nextMark);
    player._statusMarks = current;
    updateSeatDisplay(player);
  });

  skillSystem.on('status:clear', function(data) {
    if (!data || data.ownerId == null || !data.key) return;
    var player = gameState.players.find(function(p) { return p.id === data.ownerId; });
    if (!player) return;
    var current = Array.isArray(player._statusMarks) ? player._statusMarks : [];
    player._statusMarks = current.filter(function(mark) { return mark.key !== data.key; });
    updateSeatDisplay(player);
  });

  skillSystem.on('status:clear_all', function(data) {
    var ownerIds = data && Array.isArray(data.ownerIds) ? data.ownerIds : [];
    ownerIds.forEach(function(ownerId) {
      var player = gameState.players.find(function(p) { return p.id === ownerId; });
      if (!player) return;
      player._statusMarks = [];
      updateSeatDisplay(player);
    });
  });

  // 暴露全局引用，供调试控制台使用
  window._debug = { skillUI, moz, skillSystem };
  window.skillUI = skillUI;
  window.moz = moz;
  window.skillSystem = skillSystem;
  // 快捷调试开关
  window.debugMode = function (on) {
    moz.debugMode = on !== false;
    console.log('[DEBUG] debugMode =', moz.debugMode);
    return moz.debugMode;
  };

  // ========== 游戏状态 ==========
  let deckLib = null;
  // 玩家数量由 gameConfig.players.length 决定

  let gameState = {
    players: [],           // 玩家数组
    board: [],            // 公共牌
    phase: 'idle',        // idle, preflop, flop, turn, river, showdown
    pot: 0,
    currentBet: 0,        // 当前轮最高下注
    dealerIndex: 0,       // 庄家位置
    turnIndex: 0,         // 当前行动玩家
    lastRaiserIndex: -1,  // 最后加注者
    actionCount: 0,       // 本轮行动计数
    raiseCount: 0,        // 本轮加注次数（用于 3-bet cap）
    tutorialAiCursor: {}  // 教程脚本：AI动作游标
  };

  // 保存最近一手的结果文字（供 endGame modal 使用）
  let _lastResultMsg = '';

  // 记录 hero 每手开始时的筹码，用于计算 funds_delta
  let _heroStartChips = 0;

  // ========== 工具函数 ==========
  /**
   * 构建 playerIdMap：座位→gameState玩家ID映射
   * 供 skill-system 使用，确保 ownerId 与 gameState.players[].id 一致
   */
  function buildPlayerIdMap() {
    var heroPlayer = gameState.players.find(function(p) { return p.type === 'human'; });
    var map = {
      heroId: heroPlayer ? heroPlayer.id : 0,
      seats: {}
    };
    gameState.players.forEach(function(p) {
      if (p.seat) map.seats[p.seat] = p.id;
    });
    return map;
  }

  function getHeroPlayer() {
    return gameState.players.find(function(p) { return p.type === 'human'; }) || gameState.players[0];
  }

  function getHeroIndex() {
    var idx = gameState.players.findIndex(function(p) { return p.type === 'human'; });
    return idx >= 0 ? idx : 0;
  }

  function cardToSolverString(card) {
    if (!card) return '';
    return RANK_TRANSLATE[card.rank] + SUIT_TRANSLATE[card.suit];
  }

  function parseCardCode(code) {
    if (!code) return null;
    var raw = String(code).trim();
    if (raw.length < 2) return null;
    var rankToken = raw.slice(0, raw.length - 1).toUpperCase();
    var suitToken = raw.slice(-1).toLowerCase();
    var rankMap = { A: 1, K: 13, Q: 12, J: 11, T: 10 };
    var suitMap = { s: 0, h: 1, c: 2, d: 3 };
    var rank = rankMap[rankToken] != null ? rankMap[rankToken] : parseInt(rankToken, 10);
    var suit = suitMap[suitToken];
    if (!Number.isFinite(rank) || suit == null) return null;
    return { rank: rank, suit: suit };
  }

  function getScriptedHoleCardCode(player, cardIndex) {
    var script = getTutorialScript();
    var holeCards = script && script.holeCards;
    if (!holeCards || !player) return null;
    var codes = holeCards[player.seat] || holeCards[player.name] || holeCards[player.type];
    if (!Array.isArray(codes) || !codes[cardIndex]) return null;
    return codes[cardIndex];
  }

  function getScriptedBoardCardCode(phase, cardIndex) {
    var script = getTutorialScript();
    var board = script && script.board;
    if (!board) return null;
    if (phase === 'flop' && Array.isArray(board.flop)) return board.flop[cardIndex] || null;
    if (phase === 'turn') return board.turn || null;
    if (phase === 'river') return board.river || null;
    return null;
  }

  function getScriptedMozCardCode(phase) {
    var script = getTutorialScript();
    var mozSelected = script && script.mozSelected;
    if (!mozSelected) return null;
    if (phase === 'flop') return mozSelected.flop || null;
    if (phase === 'turn') return mozSelected.turn || null;
    if (phase === 'river') return mozSelected.river || null;
    return null;
  }

  function applyScriptedMozSelection(meta, cardCode) {
    if (!meta || !cardCode) return;
    var target = String(cardCode).trim().toLowerCase();
    var candidates = Array.isArray(meta.topCandidates) ? meta.topCandidates : [];
    var selected = null;

    candidates.forEach(function(candidate) {
      if (!candidate) return;
      candidate.selected = false;
      if (String(candidate.card || '').trim().toLowerCase() === target) {
        selected = candidate;
      }
    });

    if (!selected) {
      selected = {
        card: cardCode,
        score: Number(meta.destinyScore || 0),
        prob: 0,
        rank: meta.selectedRank || '?',
        selected: true,
        rinoWins: true
      };
      candidates.push(selected);
      meta.topCandidates = candidates;
    }

    selected.selected = true;
    if (selected.rank != null) meta.selectedRank = selected.rank;
    if (selected.score != null) meta.destinyScore = selected.score;
  }

  function getScriptedAIDecision(player) {
    var script = getTutorialScript();
    var aiActions = script && script.aiActions;
    if (!aiActions || !player) return null;

    var phase = gameState.phase;
    var phaseMap = aiActions[phase];
    if (!phaseMap) return null;

    var entries = phaseMap[player.seat] || phaseMap[player.name] || phaseMap[String(player.id)];
    if (!Array.isArray(entries) || entries.length === 0) return null;

    var cursorKey = phase + ':' + (player.seat || player.name || player.id);
    var cursor = gameState.tutorialAiCursor[cursorKey] || 0;
    var entry = entries[cursor];
    if (!entry) return null;
    gameState.tutorialAiCursor[cursorKey] = cursor + 1;

    var toCall = Math.max(0, gameState.currentBet - player.currentBet);
    var action = String(entry.action || '').toLowerCase();
    var amount = Number(entry.amount || 0);

    if (action === 'check' && toCall > 0) action = 'call';
    if (action === 'call' && toCall <= 0) action = 'check';
    if (action === 'raise' && amount <= 0) amount = Math.max(getBigBlind(), Math.min(player.chips, getBigBlind()));

    return {
      action: action,
      amount: amount,
      note: entry.note || ''
    };
  }

  function cardsToString(cards) {
    return cards.map(cardToSolverString).join(' ');
  }

  function updateMsg(text) {
    UI.txtBoard.innerHTML = text;
  }

  var _SKILL_CN = {
    fortune: '幸运', curse: '凶咒', clarity: '澄澈', refraction: '折射',
    reversal: '真理', null_field: '屏蔽', void_shield: '绝缘', purge_all: '现实',
    royal_decree: '敕令', heart_read: '命运感知', cooler: '冤家牌', skill_seal: '冻结令',
    clairvoyance: '估价眼', bubble_liquidation: '泡沫清算', miracle: '命大', lucky_find: '捡到了',
    deal_card: '发牌', gather_or_spread: '理牌', factory_malfunction: '故障切换', absolution: '赦免', benediction: '祝福',
    reclassification: '改判', general_ruling: '总务裁定', house_edge: '抽水', debt_call: '催收'
  };
  function _skillEffectCN(effect) { return _SKILL_CN[effect] || effect; }
  function _escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function updatePotDisplay() {
    const activeBets = gameState.players.reduce((sum, p) => sum + p.currentBet, 0);
    const totalPot = gameState.pot + activeBets;
    if (UI.potAmount) {
      UI.potAmount.innerHTML = Currency.html(totalPot);
    }
    updateCenterChipsVisual(gameState.pot);
  }

  function updateCenterChipsVisual(amount) {
    const container = UI.potClusters;
    if (!container || !window.AceZeroChips) return;
    window.AceZeroChips.renderPotClusters(container, amount, Currency);
  }

  // ========== 角色主题映射 ==========
  const CHARACTER_THEMES = {
    'RINO': 'theme-rino', 'RINO_REAR': 'theme-rino',
    'SIA': 'theme-sia', 'SIA_REAR': 'theme-sia',
    'POPPY': 'theme-poppy', 'POPPY_REAR': 'theme-poppy',
    'VV': 'theme-vv', 'VV_BOSS': 'theme-vv', 'VV_REAR': 'theme-vv', 'VV_BOSS_REAR': 'theme-vv',
    'TRIXIE': 'theme-trixie', 'TRIXIE_REAR': 'theme-trixie',
    'EULALIA': 'theme-eulalia', 'EULALIA_REAR': 'theme-eulalia',
    'KAKO': 'theme-kako', 'KAKO_REAR': 'theme-kako',
    'COTA': 'theme-cota', 'COTA_REAR': 'theme-cota',
    'KUZUHA': 'theme-kuzuha', 'KUZUHA_REAR': 'theme-kuzuha'
  };

  const CHARACTER_AVATARS = {
    'RINO': 'https://files.catbox.moe/2a05ay.png', 'RINO_REAR': 'https://files.catbox.moe/2a05ay.png',
    'SIA': 'https://files.catbox.moe/sdngxk.png', 'SIA_REAR': 'https://files.catbox.moe/sdngxk.png',
    'POPPY': 'https://files.catbox.moe/vd3x9r.png', 'POPPY_REAR': 'https://files.catbox.moe/vd3x9r.png',
    'VV': 'https://files.catbox.moe/2klui2.png', 'VV_BOSS': 'https://files.catbox.moe/2klui2.png',
    'VV_REAR': 'https://files.catbox.moe/2klui2.png', 'VV_BOSS_REAR': 'https://files.catbox.moe/2klui2.png',
    'TRIXIE': 'https://files.catbox.moe/h1jb3g.png', 'TRIXIE_REAR': 'https://files.catbox.moe/h1jb3g.png',
    'EULALIA': 'https://files.catbox.moe/3ctoga.png', 'EULALIA_REAR': 'https://files.catbox.moe/3ctoga.png',
    'KAKO': 'https://files.catbox.moe/m8en9u.png', 'KAKO_REAR': 'https://files.catbox.moe/m8en9u.png',
    'COTA': 'https://files.catbox.moe/i2zzui.png', 'COTA_REAR': 'https://files.catbox.moe/i2zzui.png',
    'KUZUHA': 'https://files.catbox.moe/hwptuk.png', 'KUZUHA_REAR': 'https://files.catbox.moe/hwptuk.png'
  };

  // ========== 座位UI生成 ==========
  function createSeatElement(player, position) {
    const seat = document.createElement('div');
    seat.className = 'seat';
    seat.id = `seat-${player.id}`;
    seat.dataset.position = position;

    if (player.type === 'human') {
      seat.classList.add('human-player');
    }

    // 应用角色主题
    const charName = player.name ? player.name.toUpperCase() : '';
    const themeClass = CHARACTER_THEMES[charName];
    if (themeClass) {
      seat.classList.add(themeClass);
    }
    const avatarUrl = CHARACTER_AVATARS[charName] || '';

    seat.innerHTML = `
      <!-- 顶部分体式悬浮组 -->
      <div class="nameplate-assembly">
        <div class="dealer-module" style="display:none;">D</div>
        <div class="player-name-float">
          <span class="position-badge" style="display:none;"></span>
          ${avatarUrl ? `<div class="player-avatar"><img src="${avatarUrl}" alt=""></div>` : ''}
          <span class="player-name">${player.name}</span>
          <span class="composure-text" style="display:none;"></span>
        </div>
      </div>

      <!-- HUD 角标 -->
      <div class="hud-corner hud-tl"></div>
      <div class="hud-corner hud-tr"></div>
      <div class="hud-corner hud-bl"></div>
      <div class="hud-corner hud-br"></div>

      <!-- 右侧Buff栏 -->
      <div class="right-buff-column"></div>

      <!-- 座位信息（仅筹码） -->
      <div class="seat-header">
        <div class="chip-count">${Currency.html(player.chips)}</div>
      </div>

      <!-- 卡牌区域 -->
      <div class="seat-cards"></div>

      <!-- 下注筹码 -->
      <div class="bet-chips" style="display:none;">
        <div class="chip-stack">
          <div class="chip-ring"></div>
          <div class="chip-inlay"></div>
        </div>
        <div class="chip-amount"></div>
      </div>

      <!-- 状态文字 -->
      <div class="seat-status"></div>
    `;

    return seat;
  }

  function renderSeats() {
    UI.seatsContainer.innerHTML = '';
    const n = gameState.players.length;
    const positions = SEAT_POSITIONS[n] || SEAT_POSITIONS[2];
    
    // hero 永远在 bottom（视觉位置0），其余按顺时针排列
    var heroIdx = gameState.players.findIndex(function(p) { return p.type === 'human'; });
    if (heroIdx < 0) heroIdx = 0;

    for (var step = 0; step < n; step++) {
      var playerIdx = (heroIdx + step) % n;
      var player = gameState.players[playerIdx];
      var position = positions[step] || 'bottom';
      var seatElement = createSeatElement(player, position);
      UI.seatsContainer.appendChild(seatElement);
      player.seatElement = seatElement;
      updateSeatDisplay(player);
    }
  }

  function updateSeatDisplay(player) {
    if (!player.seatElement) return;

    const chipCount = player.seatElement.querySelector('.chip-count');
    chipCount.innerHTML = Currency.html(player.chips);

    const betChips = player.seatElement.querySelector('.bet-chips');
    if (betChips && window.AceZeroChips) {
      const activeBet = player.currentBet > 0 && player.isActive ? player.currentBet : 0;
      window.AceZeroChips.updateSeatBetChips(betChips, activeBet, Currency);
    }

    // 更新状态：弃牌和淘汰都走同一套灰态
    if (player.folded || player.isActive === false) {
      player.seatElement.classList.add('folded');
    } else {
      player.seatElement.classList.remove('folded');
    }

    // 更新定力状态
    const composureText = player.seatElement.querySelector('.composure-text');
    if (composureText) {
      const mental = mentalSystem.getPlayerMental(player.id);
      if (mental) {
        const state = mentalSystem.getComposureState(player.id);
        const stateNames = { stable: 'STABLE', shaken: 'SHAKEN', unsteady: 'UNSTEADY', broken: 'BROKEN' };
        composureText.textContent = stateNames[state] || '';
        composureText.className = 'composure-text composure-' + state;
        composureText.style.display = state !== 'stable' ? 'inline' : 'none';
      }
    }

    // 更新胜率显示
    if (player.type === 'human' && player.cards.length === 2) {
      const equityContainer = player.seatElement.querySelector('.equity-container');
      if (equityContainer) {
        const trueEquity = 0.5;
        mentalUI.updateEquityDisplay(player.id, trueEquity, equityContainer);
      }
    }

    renderSeatMarks(player);
  }

  function renderSeatMarks(player) {
    if (!player || !player.seatElement) return;
    const buffColumn = player.seatElement.querySelector('.right-buff-column');
    if (!buffColumn) return;

    const marks = Array.isArray(player._statusMarks) ? player._statusMarks : [];
    if (!marks.length) {
      buffColumn.innerHTML = '';
      return;
    }

    buffColumn.innerHTML = marks.map(function(mark) {
      var icon = mark.icon || '';
      var iconMode = mark.iconMode || '';
      var title = mark.detail || mark.title || '';
      var safeTitle = title
        ? String(title).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/\n/g, '&#10;')
        : '';
      var tone = mark.tone ? ' seat-mark-' + mark.tone : '';
      var count = Number(mark.count || 0);
      var badgeText = mark.badgeText || (count > 0 ? (count > 9 ? '9+' : String(count)) : '');
      var iconHtml = '';
      if (icon) {
        if (iconMode === 'mask') {
          iconHtml = '<span class="seat-mark-icon seat-mark-icon-mask" style="--seat-mark-mask:url(\'' + icon + '\')"></span>';
        } else {
          iconHtml = '<img class="seat-mark-icon" src="' + icon + '" alt="">';
        }
      }
      return '<span class="seat-mark-chip' + tone + '"' + (safeTitle ? ' title="' + safeTitle + '"' : '') + '>' +
        iconHtml +
        (badgeText ? '<span class="seat-mark-count">' + badgeText + '</span>' : '') +
        '</span>';
    }).join('');
  }

  function setTurnIndicator(playerIndex) {
    // 移除所有turn-active类
    gameState.players.forEach(p => {
      if (p.seatElement) {
        p.seatElement.classList.remove('turn-active', 'ai-turn');
      }
    });
    
    // 添加当前玩家的指示器
    if (playerIndex >= 0 && playerIndex < gameState.players.length) {
      const player = gameState.players[playerIndex];
      if (player.seatElement && player.isActive && !player.folded) {
        player.seatElement.classList.add('turn-active');
        if (player.type === 'ai') {
          player.seatElement.classList.add('ai-turn');
        }
      }
    }
  }

  function updateDealerButton() {
    gameState.players.forEach((player, index) => {
      const dealerModule = player.seatElement?.querySelector('.dealer-module');
      if (dealerModule) {
        dealerModule.style.display = index === gameState.dealerIndex ? 'flex' : 'none';
      }
    });
  }

  // 位置标签：直接使用配置中的 seat 字段（BTN/SB/BB/UTG/HJ/CO）
  // seat 字段在 getPlayerConfigs() 中已从 heroSeat + NPC 座位键正确赋值
  function assignPositions() {
    var players = gameState.players;
    for (var i = 0; i < players.length; i++) {
      players[i].position = players[i].seat || '';
    }
  }

  function updatePositionBadges() {
    gameState.players.forEach(function(player) {
      if (!player.seatElement) return;
      var badge = player.seatElement.querySelector('.position-badge');
      if (!badge) return;
      var pos = player.position || '';
      badge.textContent = pos;
      badge.style.display = pos ? 'inline-block' : 'none';
      // 颜色区分
      badge.className = 'position-badge';
      if (pos === 'BTN') badge.classList.add('pos-btn');
      else if (pos === 'SB') badge.classList.add('pos-sb');
      else if (pos === 'BB') badge.classList.add('pos-bb');
      else badge.classList.add('pos-other');
    });
  }

  function animateChipsToCenter() {
    gameState.players.forEach(player => {
      if (player.currentBet > 0 && player.seatElement) {
        const betChips = player.seatElement.querySelector('.bet-chips');
        betChips.classList.add('flying');
      }
    });
    
    UI.potArea?.classList.add('collecting');
    
    setTimeout(() => {
      gameState.players.forEach(player => {
        if (player.seatElement) {
          const betChips = player.seatElement.querySelector('.bet-chips');
          betChips.classList.remove('flying');
        }
      });
      UI.potArea?.classList.remove('collecting');
    }, 800);
  }

  function waitMs(delayMs) {
    return new Promise(function(resolve) {
      setTimeout(resolve, Math.max(0, Number(delayMs || 0)));
    });
  }

  function buildPreDealWindowPayload(gameCtx, npcRecords) {
    return {
      phase: gameCtx && gameCtx.phase || gameState.phase,
      pot: gameCtx && gameCtx.pot != null ? gameCtx.pot : gameState.pot,
      board: (gameCtx && gameCtx.board ? gameCtx.board : gameState.board || []).slice(),
      players: Array.isArray(gameCtx && gameCtx.players) ? gameCtx.players.slice() : gameState.players.slice(),
      npcRecords: Array.isArray(npcRecords) ? npcRecords.slice() : [],
      kakoWindow: null
    };
  }

  async function runPreDealWindow(gameCtx, options) {
    options = options || {};
    var npcRecords = Array.isArray(options.npcRecords) ? options.npcRecords : [];
    var summaryDelayMs = Number(options.summaryDelayMs || 0);

    if (npcRecords.length > 0) {
      var summary = npcRecords.map(function(record) {
        return record.ownerName + ' → ' + _skillEffectCN(record.effect) +
          (record.targetName ? '(' + record.targetName + ')' : '');
      }).join(' | ');
      updateMsg('⚡ ' + summary);
    }

    var payload = buildPreDealWindowPayload(gameCtx, npcRecords);
    if (runtimeFlow) {
      runtimeFlow.emit('table:pre_deal_window', payload);
    }

    var kakoWindow = payload && payload.kakoWindow;
    var result = null;
    if (kakoWindow && skillUI && typeof skillUI.resolveKakoPreDealWindow === 'function') {
      result = await skillUI.resolveKakoPreDealWindow(kakoWindow, {
        gameContext: gameCtx,
        npcRecords: npcRecords
      });
      if (typeof kakoWindow.applyDecisions === 'function') {
        try {
          kakoWindow.applyDecisions(result || {}, {
            gameContext: gameCtx,
            npcRecords: npcRecords,
            payload: payload
          });
        } catch (err) {
          console.error('[KAKO] applyDecisions failed:', err);
        }
      }
    } else if (summaryDelayMs > 0 && npcRecords.length > 0) {
      await waitMs(summaryDelayMs);
    }

    if (runtimeFlow) {
      runtimeFlow.emit('table:pre_deal_window_resolved', {
        phase: payload.phase,
        pot: payload.pot,
        board: payload.board,
        players: payload.players,
        npcRecords: payload.npcRecords,
        kakoWindow: kakoWindow || null,
        result: result
      });
    }
  }

  async function continueToDealAfterPreDeal(gameCtx, options) {
    await runPreDealWindow(gameCtx, options);
    _proceedToDeal();
  }

  // ========== 玩家初始化 ==========
  function initializePlayers(count) {
    const players = [];
    
    for (let i = 0; i < count; i++) {
      const config = getPlayerConfig(i);
      const isHuman = config.type === 'human';
      
      const player = {
        id: i,
        type: isHuman ? 'human' : 'ai',
        name: config.name || (isHuman ? 'RINO [ADMIN]' : `TARGET_${i}`),
        chips: config.chips || getInitialChips(),
        initialChips: config.chips || getInitialChips(),
        cards: [],
        currentBet: 0,
        totalBet: 0,
        isActive: true,
        folded: false,
        hasActedThisRound: false,
        ai: null,
        personality: config.personality || null,
        difficulty: (config.personality && config.personality.difficulty) || 'regular',
        difficultyProfile: (config.personality && config.personality.difficulty) || 'regular',
        seat: config.seat || '',
        roleId: config.roleId || 'UNKNOWN',
        roleVariant: config.roleVariant || 'base'
      };
      
      // 为 AI 玩家创建个性化 AI 实例
      if (!isHuman) {
        player.ai = new PokerAI(config.personality || { riskAppetite: 'balanced', difficulty: 'regular' });
        player.ai.roleId = player.roleId;
        player.ai.roleVariant = player.roleVariant;
        player.difficulty = player.ai.difficultyType;
        player.difficultyProfile = player.ai.difficultyProfile;
        // FSM 初始筹码（用于 CORNERED 判定）
        player.ai.fsm.initialChips = player.chips;
      }

      if (runtimeFlow) {
        runtimeFlow.emit('player:initialized', {
          playerId: player.id,
          seat: player.seat,
          type: player.type,
          roleId: player.roleId,
          roleVariant: player.roleVariant
        });
      }

      players.push(player);
    }

    if (runtimeFlow) {
      runtimeFlow.emit('players:initialized', {
        count: players.length,
        players: players.map(function(p) {
          return {
            id: p.id,
            seat: p.seat,
            type: p.type,
            roleId: p.roleId,
            roleVariant: p.roleVariant
          };
        })
      });
    }

    return players;
  }

  // ========== 轮次控制 ==========
  function getNextActivePlayer(startIndex) {
    let index = startIndex;
    let count = 0;
    const maxPlayers = gameState.players.length;
    
    do {
      index = (index + 1) % maxPlayers;
      count++;
      if (count > maxPlayers) return -1; // 防止无限循环
    } while (gameState.players[index].folded || !gameState.players[index].isActive);
    
    return index;
  }

  // 🛡️ 从指定位置开始找第一个未弃牌的活跃玩家
  function findFirstActivePlayer(startIndex) {
    let index = startIndex;
    let count = 0;
    const maxPlayers = gameState.players.length;
    
    while (gameState.players[index].folded || !gameState.players[index].isActive) {
      index = (index + 1) % maxPlayers;
      count++;
      if (count >= maxPlayers) return -1; // 所有人都弃牌了
    }
    
    return index;
  }

  function getActivePlayers() {
    return gameState.players.filter(p => p.isActive && !p.folded);
  }

  // 🎯 检查是否所有玩家都 All-in（或只剩一人有筹码）
  function isEveryoneAllIn() {
    const activePlayers = getActivePlayers();
    if (activePlayers.length <= 1) return false;
    
    // 统计还有筹码的玩家数量
    const playersWithChips = activePlayers.filter(p => p.chips > 0);
    
    // 如果只有 0 或 1 个人还有筹码，说明其他人都 All-in 了
    return playersWithChips.length <= 1;
  }

  // 🎯 All-in 后暂停：让玩家有时间用技能，点击"继续"后 NPC 同时出招 → 发下一街
  let _allinAdvanceFn = null;
  function waitForPlayerThenAdvance(nextFn, label) {
    var gameCtx = {
      players: gameState.players, pot: gameState.pot,
      phase: gameState.phase, board: gameState.board, blinds: getBigBlind(),
      allIn: true
    };

    // 1. 基础处理（mana/CD/triggers），不含 NPC 出招
    skillUI.onRoundEndBase(gameCtx);

    // 2. 启用玩家技能面板
    skillUI.update({
      phase: gameState.phase, isPlayerTurn: true,
      deckCards: deckLib ? deckLib.cards : [],
      board: gameState.board, players: gameState.players
    });

    // 3. 显示"继续"按钮（临时按钮，避免 btnCheckCall 事件冲突）
    updateMsg('⚡ 技能阶段');
    document.body.classList.add('game-active');
    UI.btnFold.style.display = 'none';
    UI.btnCheckCall.style.display = 'none';
    UI.btnRaise.style.display = 'none';
    hideRaiseControls();

    var proceedBtn = document.createElement('button');
    proceedBtn.className = 'btn-cmd';
    proceedBtn.textContent = '继续 → ' + label;
    proceedBtn.id = 'btn-allin-proceed';
    var actionRow = document.getElementById('action-row');
    actionRow.appendChild(proceedBtn);
    actionRow.style.display = 'flex';

    // 4. 点击时 NPC 同时出招 → 发牌
    _allinAdvanceFn = null;
    proceedBtn.addEventListener('click', function () {
      var npcRecords = skillUI.fireNpcSkills(gameCtx);
      if (proceedBtn.parentNode) proceedBtn.parentNode.removeChild(proceedBtn);
      UI.btnFold.style.display = '';
      UI.btnCheckCall.style.display = '';
      UI.btnRaise.style.display = '';
      actionRow.style.display = '';
      enablePlayerControls(false);

      if (npcRecords && npcRecords.length > 0) {
        var summary = npcRecords.map(function(r) {
          return r.ownerName + ' → ' + _skillEffectCN(r.effect) + (r.targetName ? '(' + r.targetName + ')' : '');
        }).join(' | ');
        updateMsg('⚡ ' + summary);
        setTimeout(nextFn, 1500);
      } else {
        setTimeout(nextFn, 300);
      }
    });
  }

  function isRoundComplete() {
    const activePlayers = getActivePlayers();
    if (activePlayers.length <= 1) return true;
    
    // 检查是否所有活跃玩家都已行动且下注相同
    // 🛡️ All-in 玩家（chips===0）无法继续下注，不参与 bet-matching 检查
    const maxBet = Math.max(...activePlayers.map(p => p.currentBet));
    const allMatched = activePlayers.every(p => p.currentBet === maxBet || p.chips === 0);
    
    // 确保每个有筹码的玩家至少行动过一次（all-in 玩家跳过）
    const allActed = activePlayers.every(p => p.hasActedThisRound || p.chips === 0);
    
    // Preflop 特殊处理：BB 必须有机会行动（Option权）
    // 即使所有人下注相同，如果 BB 还没主动行动过，不能结束
    if (gameState.phase === 'preflop' && allMatched && maxBet === getBigBlind()) {
      // 找到 BB 玩家
      let bbIndex;
      if (gameState.players.length === 2) {
        bbIndex = (gameState.dealerIndex + 1) % gameState.players.length;
      } else {
        bbIndex = (gameState.dealerIndex + 2) % gameState.players.length;
      }
      const bbPlayer = gameState.players[bbIndex];
      
      // 如果 BB 还没主动行动过，不能结束
      if (!bbPlayer.folded && bbPlayer.isActive && !bbPlayer.hasActedThisRound) {
        return false;
      }
    }
    
    return allMatched && allActed;
  }

  function nextTurn() {
    hideRaiseControls();
    if (isRoundComplete()) {
      endBettingRound();
      return;
    }
    
    // 如果是本轮第一次行动（actionCount === 0），使用预设的 turnIndex
    // 否则找下一个活跃玩家
    if (gameState.actionCount > 0) {
      gameState.turnIndex = getNextActivePlayer(gameState.turnIndex);
    }
    
    if (gameState.turnIndex === -1) {
      endBettingRound();
      return;
    }
    
    const currentPlayer = gameState.players[gameState.turnIndex];
    
    // 🛡️ 跳过 All-in 玩家（chips===0，无法行动）
    if (currentPlayer.chips === 0) {
      currentPlayer.hasActedThisRound = true;
      gameState.actionCount++;
      setTimeout(nextTurn, 100);
      return;
    }
    
    setTurnIndicator(gameState.turnIndex);
    
    // 更新toCall显示
    const toCall = gameState.currentBet - currentPlayer.currentBet;
    UI.toCallAmount.innerHTML = Currency.htmlAmount(toCall);
    
    if (currentPlayer.type === 'human') {
      updateMsg(`Your turn - ${gameState.phase.toUpperCase()}`);
      enablePlayerControls(true);
      skillUI.update({ phase: gameState.phase, isPlayerTurn: true, deckCards: deckLib ? deckLib.cards : [], board: gameState.board, players: gameState.players }); // 玩家回合：启用技能按钮
    } else {
      updateMsg(`${currentPlayer.name}'s turn...`);
      enablePlayerControls(false);
      skillUI.update({ phase: gameState.phase, isPlayerTurn: false }); // AI回合：禁用技能按钮
      setTimeout(() => aiTurn(currentPlayer), 1000);
    }
  }

  // ========== 玩家操作 ==========
  function enablePlayerControls(enabled) {
    const player = getHeroPlayer();

    // 玩家筹码为0时禁用所有按钮
    if (player && player.chips <= 0) {
      UI.btnFold.disabled = true;
      UI.btnCheckCall.disabled = true;
      UI.btnRaise.disabled = true;
      return;
    }

    UI.btnFold.disabled = !enabled;
    UI.btnCheckCall.disabled = !enabled;
    UI.btnRaise.disabled = !enabled;

    if (!player) return;

    const toCall = gameState.currentBet - (player.currentBet || 0);
    
    if (toCall === 0) {
      UI.btnCheckCall.textContent = 'CHECK';
    } else {
      UI.btnCheckCall.innerHTML = `CALL ${Currency.htmlAmount(toCall)}`;
    }
    
    // 更新加注滑块
    // 最小加注额 = 大盲注（或上一次加注的增量，简化为大盲注）
    // 滑块值 = 加注增量（在跟注之上额外加的部分）
    const maxRaise = Math.max(0, player.chips - toCall); // 扣除跟注后剩余可加注的量
    const minRaise = Math.min(getBigBlind(), maxRaise > 0 ? maxRaise : player.chips);
    UI.raiseSlider.min = minRaise;
    UI.raiseSlider.max = Math.max(minRaise, maxRaise);
    UI.raiseSlider.value = minRaise;
    syncRaiseAmountDisplay(minRaise);
    if (UI.raiseToCallDisplay) UI.raiseToCallDisplay.innerHTML = Currency.htmlAmount(Math.max(0, toCall));
    if (UI.raiseMinDisplay) UI.raiseMinDisplay.innerHTML = 'MIN ' + Currency.htmlAmount(minRaise);
    if (UI.raiseMaxDisplay) UI.raiseMaxDisplay.innerHTML = 'MAX ' + Currency.htmlAmount(Math.max(minRaise, maxRaise));

    if (tutorialController && typeof tutorialController.onPlayerControls === 'function') {
      tutorialController.onPlayerControls(enabled);
    }
  }

  function getFoldManaPenalty(phase) {
    if (phase === 'preflop') return 18;
    if (phase === 'flop') return 12;
    if (phase === 'turn') return 6;
    return 0;
  }

  function playerFold() {
    const player = getHeroPlayer();
    hideRaiseControls();
    player.folded = true;
    player.hasActedThisRound = true;
    if (skillUI && skillUI.skillSystem && typeof skillUI.skillSystem.loseMana === 'function') {
      skillUI.skillSystem.loseMana(player.id, getFoldManaPenalty(gameState.phase), 'fold_penalty');
    }
    updateSeatDisplay(player);
    
    broadcastActionToModels(player.id, 'fold', { phase: gameState.phase, toCall: gameState.currentBet - player.currentBet });
    logEvent('PLAYER_FOLD', { playerId: player.id, playerName: player.name });
    updateMsg('You folded.');
    
    gameState.actionCount++;
    setTurnIndicator(-1);
    
    setTimeout(() => {
      if (getActivePlayers().length === 1) {
        endHandEarly();
      } else {
        nextTurn();
      }
    }, 500);
  }

  function playerCheckCall() {
    // All-in 暂停：点击"继续"按钮时触发下一街
    if (_allinAdvanceFn) {
      _allinAdvanceFn();
      return;
    }

    hideRaiseControls();
    const player = getHeroPlayer();
    const toCall = gameState.currentBet - player.currentBet;
    
    if (toCall > 0) {
      const callAmount = Math.min(toCall, player.chips);
      player.chips -= callAmount;
      player.currentBet += callAmount;
      player.totalBet += callAmount;
      broadcastActionToModels(player.id, 'call', { phase: gameState.phase, toCall: toCall, amount: callAmount });
      logEvent('PLAYER_CALL', { playerId: player.id, playerName: player.name, amount: callAmount });
      updateMsg(`You call ${Currency.htmlAmount(callAmount)}`);
    } else {
      broadcastActionToModels(player.id, 'check', { phase: gameState.phase, toCall: 0 });
      logEvent('PLAYER_CHECK', { playerId: player.id, playerName: player.name });
      updateMsg('You check');
    }
    
    player.hasActedThisRound = true;
    updateSeatDisplay(player);
    updatePotDisplay();
    gameState.actionCount++;
    setTurnIndicator(-1);
    
    setTimeout(nextTurn, 500);
  }

  function playerRaise() {
    if (UI.raiseControls && UI.raiseControls.style.display !== 'none' && UI.raiseControls.style.display !== '') {
      hideRaiseControls();
      return;
    }
    enablePlayerControls(true);
    showRaiseControls();
  }

  function confirmRaise() {
    const player = getHeroPlayer();
    const raiseAmount = parseInt(UI.raiseSlider.value);
    const toCall = gameState.currentBet - player.currentBet;
    
    // 先跟注
    if (toCall > 0) {
      player.chips -= toCall;
      player.currentBet += toCall;
      player.totalBet += toCall;
    }
    
    // 再加注
    const actualRaise = Math.min(raiseAmount, player.chips);
    player.chips -= actualRaise;
    player.currentBet += actualRaise;
    player.totalBet += actualRaise;
    gameState.currentBet = player.currentBet;
    gameState.lastRaiserIndex = getHeroIndex();
    gameState.raiseCount = (gameState.raiseCount || 0) + 1;
    
    // 区分 BET 和 RAISE：当前轮无人下注时是 BET，否则是 RAISE
    // 注意：此时 gameState.currentBet 已更新，需要用 toCall 判断之前状态
    const isBet = toCall === 0;
    broadcastActionToModels(player.id, 'raise', { phase: gameState.phase, toCall: toCall, amount: actualRaise, pot: gameState.pot });
    logEvent(isBet ? 'PLAYER_BET' : 'PLAYER_RAISE', { 
      playerId: player.id, 
      playerName: player.name, 
      amount: actualRaise, 
      totalBet: player.currentBet 
    });
    
    player.hasActedThisRound = true;
    hideRaiseControls();
    updateMsg(isBet ? `You bet ${Currency.htmlAmount(actualRaise)}` : `You raise ${Currency.htmlAmount(actualRaise)}`);
    updateSeatDisplay(player);
    updatePotDisplay();
    gameState.actionCount++;
    setTurnIndicator(-1);
    
    setTimeout(nextTurn, 500);
  }

  // ========== AI操作 ==========
  function aiTurn(player) {
    // 🛡️ 防止弃牌玩家复活行动
    if (player.folded || !player.isActive) {
      gameState.actionCount++;
      setTimeout(nextTurn, 100);
      return;
    }

    // AI考虑使用心理战技能
    if (!shouldDisableTutorialAISkills()) {
      aiConsiderMentalSkill(player);
    }

    const toCall = gameState.currentBet - player.currentBet;
    
    // 计算该 AI 的最高魔运等级（影响弃牌倾向）
    const playerSkills = skillSystem.getPlayerSkills(player.id);
    const maxMagicLevel = playerSkills.reduce((max, s) => Math.max(max, s.tier != null ? (4 - s.tier) : 0, 0), 0);

    // 计算净魔运力量（己方 fortune - 敌方 curse）用于 pro/boss 魔运感知
    // 合并 passive forces + pendingForces（不调用 collectActiveForces 以避免 backlash 副作用）
    let netForce = 0;
    let opponentManaRatio = 0.5;
    if (typeof skillSystem !== 'undefined') {
      try {
        const foldedSet = new Set(gameState.players.filter(p => p.folded).map(p => p.id));
        // passive/toggle forces
        const passiveForces = [];
        for (const [, sk] of skillSystem.skills) {
          if (!sk.active) continue;
          if (sk.activation !== 'passive' && sk.activation !== 'toggle') continue;
          if (foldedSet.has(sk.ownerId)) continue;
          passiveForces.push({
            ownerId: sk.ownerId,
            type: sk.effect === 'royal_decree' ? 'fortune' : sk.effect,
            power: sk.power || 0,
            targetId: sk.targetId
          });
        }
        const allForces = passiveForces.concat(skillSystem.pendingForces.filter(f => !foldedSet.has(f.ownerId)));
        const myFortune = allForces.filter(f => f.ownerId === player.id && f.type === 'fortune')
          .reduce((s, f) => s + (f.power || 0), 0);
        const enemyCurse = allForces.filter(f => f.ownerId !== player.id && f.type === 'curse' &&
          (f.targetId == null || f.targetId === player.id))
          .reduce((s, f) => s + (f.power || 0), 0);
        netForce = myFortune - enemyCurse;
      } catch (e) { /* ignore */ }
      // 对手平均 mana 百分比（pro/boss 用于对手建模）
      try {
        const opps = getActivePlayers().filter(p => p.id !== player.id);
        if (opps.length > 0) {
          const totalRatio = opps.reduce((sum, opp) => {
            const mana = skillSystem.getMana(opp.id);
            return sum + (mana ? mana.current / Math.max(1, mana.max) : 0.5);
          }, 0);
          opponentManaRatio = totalRatio / opps.length;
        }
      } catch (e) { /* ignore */ }
    }

    // 收集对手难度档案（pro/boss 用于读牌）
    const opponentProfiles = [];
    for (const opp of getActivePlayers()) {
      if (opp.id === player.id) continue;
      opponentProfiles.push({
        id: opp.id,
        name: opp.name,
        difficulty: opp.ai ? opp.ai.difficultyType : 'regular',
        risk: opp.ai ? opp.ai.riskType : 'balanced',
        currentBet: opp.currentBet || 0,
        totalBet: opp.totalBet || 0,
        chips: opp.chips || 0,
        isHuman: !opp.ai
      });
    }

    const context = {
      playerName: player.name,
      holeCards: player.cards,
      boardCards: gameState.board,
      pot: gameState.pot + gameState.players.reduce((sum, p) => sum + p.currentBet, 0),
      toCall: toCall,
      aiStack: player.chips,
      playerStack: getHeroPlayer().chips,
      phase: gameState.phase,
      minRaise: getBigBlind(),
      activeOpponentCount: getActivePlayers().length - 1,
      magicLevel: maxMagicLevel,
      netForce: netForce,
      opponentManaRatio: opponentManaRatio,
      heroId: getHeroPlayer().id,
      raiseCount: gameState.raiseCount || 0,
      opponentProfiles: opponentProfiles,
      bigBlind: getBigBlind(),
      currentMana: (function() {
        const mana = skillSystem.getMana(player.id);
        return mana ? mana.current : 0;
      })(),
      maxMana: (function() {
        const mana = skillSystem.getMana(player.id);
        return mana ? mana.max : 0;
      })(),
      manaRegen: (function() {
        const mana = skillSystem.getMana(player.id);
        return mana ? mana.regen : 0;
      })(),
      mentalModifiers: (function() {
        const mental = mentalSystem.getPlayerMental(player.id);
        if (!mental) return null;
        return {
          composureRatio: mental.composure / mental.composureMax,
          state: mentalSystem.getComposureState(player.id),
          pressureType: mental.lastPressureType,
          pressureStack: mental.pressureStack,
          equityBias: mental.equityBias,
          confidenceLevel: mental.confidenceLevel
        };
      })()
    };
    
    // ── Phase 1: 灵视类技能（betting 前，影响决策）──
    var scriptedDecision = getScriptedAIDecision(player);
    var preSkills = [];
    var turnGameCtx = null;
    if (!shouldDisableTutorialAISkills() &&
        typeof skillSystem !== 'undefined' && skillSystem.npcDecideSkillsForPlayer) {
      turnGameCtx = {
        players: gameState.players, pot: gameState.pot + gameState.players.reduce(function(s,p){return s+p.currentBet},0),
        phase: gameState.phase, board: gameState.board, blinds: getBigBlind()
      };
      preSkills = skillSystem.npcDecideSkillsForPlayer(player.id, turnGameCtx, 'pre-bet');
      if (preSkills.length > 0) {
        skillUI.updateDisplay();
        skillUI.updateButtons();
        _showTurnSkillMsg(player, preSkills);
      }
    }

    // 如果用了灵视技能，延迟后再 betting
    if (preSkills.length > 0) {
      setTimeout(function() { _aiDoBetThenPostSkill(player, context, turnGameCtx, scriptedDecision); }, 1200);
      return;
    }
    _aiDoBetThenPostSkill(player, context, turnGameCtx, scriptedDecision);
  }

  function _showTurnSkillMsg(player, skills) {
    var skillMsg = skills.map(function(r) {
      return _skillEffectCN(r.effect) + (r.targetName ? ' → ' + r.targetName : '');
    }).join(', ');
    updateMsg('⚡ ' + player.name + ' 使用了 ' + skillMsg);
  }

  function _aiDoBetThenPostSkill(player, context, turnGameCtx, scriptedDecision) {
    // ── Phase 2: Betting 决策 ──
    var decision = scriptedDecision ? {
      action: scriptedDecision.action,
      amount: scriptedDecision.amount,
      reason: scriptedDecision.note || 'tutorial_script'
    } : player.ai.decide(context);

    // ── Phase 3: 攻击/增益类技能（betting 后，不弃牌才用）──
    var postSkills = [];
    if (!shouldDisableTutorialAISkills() &&
        decision.action !== PokerAI.ACTIONS.FOLD && turnGameCtx &&
        typeof skillSystem !== 'undefined' && skillSystem.npcDecideSkillsForPlayer) {
      postSkills = skillSystem.npcDecideSkillsForPlayer(player.id, turnGameCtx, 'post-bet');
      if (postSkills.length > 0) {
        skillUI.updateDisplay();
        skillUI.updateButtons();
        _showTurnSkillMsg(player, postSkills);
      }
    }

    // 执行 betting 动作（如果有 post-bet 技能，延迟显示后再执行）
    if (postSkills.length > 0) {
      setTimeout(function() { _execBetAction(player, decision); }, 1200);
    } else {
      _execBetAction(player, decision);
    }
  }

  function _execBetAction(player, decision) {
    switch (decision.action) {
      case PokerAI.ACTIONS.FOLD:
        aiFold(player);
        break;
      case PokerAI.ACTIONS.CHECK:
        aiCheck(player);
        break;
      case PokerAI.ACTIONS.CALL:
        aiCall(player, decision.amount);
        break;
      case PokerAI.ACTIONS.RAISE:
      case PokerAI.ACTIONS.ALL_IN:
        aiRaise(player, decision.amount);
        break;
    }
  }

  function aiFold(player) {
    player.folded = true;
    player.hasActedThisRound = true;
    if (skillUI && skillUI.skillSystem && typeof skillUI.skillSystem.loseMana === 'function') {
      skillUI.skillSystem.loseMana(player.id, getFoldManaPenalty(gameState.phase), 'fold_penalty');
    }
    updateSeatDisplay(player);
    broadcastActionToModels(player.id, 'fold', { phase: gameState.phase, toCall: gameState.currentBet - player.currentBet });
    
    logEvent('AI_FOLD', { playerId: player.id, playerName: player.name });

    const status = player.seatElement.querySelector('.seat-status');
    status.innerHTML = '<span class="state-fold">FOLD</span>';

    gameState.actionCount++;
    setTurnIndicator(-1);
    
    setTimeout(() => {
      if (getActivePlayers().length === 1) {
        endHandEarly();
      } else {
        nextTurn();
      }
    }, 800);
  }

  function aiCheck(player) {
    player.hasActedThisRound = true;
    broadcastActionToModels(player.id, 'check', { phase: gameState.phase, toCall: 0 });
    logEvent('AI_CHECK', { playerId: player.id, playerName: player.name });

    const status = player.seatElement.querySelector('.seat-status');
    status.innerHTML = '<span class="state-action">CHECK</span>';

    gameState.actionCount++;
    setTurnIndicator(-1);
    setTimeout(nextTurn, 800);
  }

  function aiCall(player, amount) {
    const toCall = gameState.currentBet - player.currentBet;
    const callAmount = Math.min(toCall, player.chips);
    
    player.chips -= callAmount;
    player.currentBet += callAmount;
    player.totalBet += callAmount;
    
    player.hasActedThisRound = true;
    broadcastActionToModels(player.id, 'call', { phase: gameState.phase, toCall: toCall, amount: callAmount });
    logEvent('AI_CALL', { playerId: player.id, playerName: player.name, amount: callAmount });
    
    const status = player.seatElement.querySelector('.seat-status');
    status.innerHTML = `<span class="state-action">CALL<span class="status-amount">${Currency.htmlAmount(callAmount)}</span></span>`;
    
    updateSeatDisplay(player);
    updatePotDisplay();
    gameState.actionCount++;
    setTurnIndicator(-1);
    
    setTimeout(nextTurn, 800);
  }

  var MAX_RAISES_PER_ROUND = 4;

  function aiRaise(player, amount) {
    const toCall = gameState.currentBet - player.currentBet;

    // 硬性加注上限：每轮最多 4 次 raise，超过则降级为 call
    if ((gameState.raiseCount || 0) >= MAX_RAISES_PER_ROUND) {
      aiCall(player);
      return;
    }
    
    // 先跟注
    if (toCall > 0) {
      const callAmount = Math.min(toCall, player.chips);
      player.chips -= callAmount;
      player.currentBet += callAmount;
      player.totalBet += callAmount;
    }
    
    // 再加注
    const raiseAmount = Math.min(amount, player.chips);
    
    // 🛡️ 修复 RAISE 0 问题：如果加注金额 <= 0，说明是 All-in 跟注
    if (raiseAmount <= 0) {
      // 这其实是一个 CALL (All-in)，不是 RAISE
      player.hasActedThisRound = true;
      const actualCallAmount = player.currentBet - (gameState.currentBet - toCall); // 实际跟注金额
      logEvent('AI_CALL', { 
        playerId: player.id, 
        playerName: player.name, 
        amount: actualCallAmount,
        isAllIn: true
      });
      
      const status = player.seatElement.querySelector('.seat-status');
      status.innerHTML = `<span class="state-alert">CALL<span class="status-amount">${Currency.htmlAmount(actualCallAmount)}</span> (All-in)</span>`;
      
      updateSeatDisplay(player);
      updatePotDisplay();
      gameState.actionCount++;
      setTurnIndicator(-1);
      
      setTimeout(nextTurn, 800);
      return;
    }
    
    player.chips -= raiseAmount;
    player.currentBet += raiseAmount;
    player.totalBet += raiseAmount;
    gameState.currentBet = player.currentBet;
    gameState.lastRaiserIndex = player.id;
    gameState.raiseCount = (gameState.raiseCount || 0) + 1;
    
    // 区分 BET 和 RAISE：当前轮无人下注时是 BET，否则是 RAISE
    const isBet = toCall === 0;
    player.hasActedThisRound = true;
    broadcastActionToModels(player.id, 'raise', { phase: gameState.phase, toCall: toCall, amount: raiseAmount, pot: gameState.pot });
    
    // 检查是否 All-in
    const isAllIn = player.chips === 0;
    logEvent(isBet ? 'AI_BET' : 'AI_RAISE', { 
      playerId: player.id, 
      playerName: player.name, 
      amount: raiseAmount, 
      totalBet: player.currentBet,
      isAllIn: isAllIn
    });
    
    const status = player.seatElement.querySelector('.seat-status');
    const allInSuffix = isAllIn ? ' (All-in)' : '';
    const actionText = isBet ? 'BET' : 'RAISE';
    const stateClass = isAllIn ? 'state-alert' : 'state-action';
    status.innerHTML = `<span class="${stateClass}">${actionText}<span class="status-amount">${Currency.htmlAmount(raiseAmount)}</span>${allInSuffix}</span>`;
    
    updateSeatDisplay(player);
    updatePotDisplay();
    gameState.actionCount++;
    setTurnIndicator(-1);
    
    setTimeout(nextTurn, 800);
  }

  // ========== 发牌动画 ==========
  function distributeCard(player, faceUp, delay) {
    return new Promise((resolve) => {
      if (!deckLib || !deckLib.cards.length) {
        resolve();
        return;
      }

      var scriptedCode = getScriptedHoleCardCode(player, player.cards.length);
      var scriptedCard = scriptedCode ? pickSpecificCard(parseCardCode(scriptedCode)) : null;
      const card = scriptedCard || deckLib.cards.pop();
      player.cards.push(card);

      const deckWrapper = document.getElementById('deck-wrapper');
      const targetElement = player.seatElement.querySelector('.seat-cards');
      
      const wrapperRect = deckWrapper.getBoundingClientRect();
      const targetRect = targetElement.getBoundingClientRect();
      
      const cardWidth = 70;
      const gap = 8;
      const cardIndex = player.cards.length - 1;
      const totalCards = player.cards.length;
      const totalWidth = totalCards * cardWidth + (totalCards - 1) * gap;
      const startX = targetRect.left + (targetRect.width - totalWidth) / 2;
      const cardFinalX = startX + cardIndex * (cardWidth + gap) + cardWidth / 2;
      const cardFinalY = targetRect.top + targetRect.height / 2;
      
      const deckCenterX = wrapperRect.left + wrapperRect.width / 2;
      const deckCenterY = wrapperRect.top + wrapperRect.height / 2;
      
      const deltaX = cardFinalX - deckCenterX + 15;
      const deltaY = cardFinalY - deckCenterY;

      card.animateTo({
        delay: delay,
        duration: 250,
        x: deltaX,
        y: deltaY,
        rot: 0,
        onStart: function() {
          card.$el.style.zIndex = 9999;
        },
        onComplete: function() {
          card.setSide(faceUp ? 'front' : 'back');
          targetElement.appendChild(card.$el);
          card.$el.classList.add('aligned-card');
          card.$el.style.transform = 'none';
          card.$el.style.position = 'relative';
          card.x = 0;
          card.y = 0;
          resolve();
        }
      });
    });
  }

  // ========== 蒸特卡洛零模型 - 精确抽牌 ==========
  /**
   * 从牌堆中找到指定牌并将其移到末尾，然后 pop
   * 这样可以复用 deck-of-cards 库的动画系统
   */
  function pickSpecificCard(targetCard) {
    if (!deckLib || !deckLib.cards.length) return null;
    
    const index = deckLib.cards.findIndex(c =>
      c.rank === targetCard.rank && c.suit === targetCard.suit
    );
    
    if (index === -1) {
      // 找不到目标牌，fallback 到普通 pop
      console.warn('[MonteOfZero] Target card not found in deck, falling back to random');
      return deckLib.cards.pop();
    }
    
    // 将目标牌移到末尾
    const [card] = deckLib.cards.splice(index, 1);
    deckLib.cards.push(card);
    return deckLib.cards.pop();
  }

  /**
   * 用命运引擎筛选一张公共牌（委托给 skillUI）
   * @returns {object} deck-of-cards 的 card 对象
   */
  function mozSelectAndPick() {
    if (!deckLib || !deckLib.cards.length) {
      return deckLib.cards.pop();
    }

    var boardIndex = gameState.board ? gameState.board.length : 0;
    var scriptedCode = getScriptedBoardCardCode(gameState.phase, gameState.phase === 'flop' ? boardIndex : 0);
    var scriptedMozCode = getScriptedMozCardCode(gameState.phase);
    if (scriptedCode && !scriptedMozCode) {
      return pickSpecificCard(parseCardCode(scriptedCode));
    }
    if (shouldDisableTutorialMoz()) {
      return deckLib.cards.pop();
    }

    if (runtimeFlow) {
      runtimeFlow.emit('moz:before_select', {
        phase: gameState.phase,
        pot: gameState.pot,
        board: (gameState.board || []).slice()
      });
    }
    
    const result = skillUI.selectCard(deckLib.cards, gameState.board, gameState.players);
    
    if (result && result.card) {
      var forcedCode = scriptedMozCode || null;
      if (forcedCode && result.meta) {
        applyScriptedMozSelection(result.meta, forcedCode);
      }
      const picked = forcedCode
        ? pickSpecificCard(parseCardCode(forcedCode))
        : pickSpecificCard(result.card);
      // 展示力量对抗面板
      if (result.meta) {
        showForcePK(result.meta);
        // Psyche 拦截反馈：让玩家看到技能生效了
        _showPsycheMessages(result.meta.psycheEvents);
      }
      skillUI.updateDisplay();
      if (runtimeFlow) {
        runtimeFlow.emit('moz:after_select', {
          phase: gameState.phase,
          pot: gameState.pot,
          board: (gameState.board || []).slice(),
          picked: result.card || null,
          meta: result.meta || null
        });
      }
      return picked;
    }
    
    return deckLib.cards.pop();
  }

  // ========== SVG 图标（替代 emoji） ==========
  const _svgIcons = {
    fortune:  '<svg class="fpk-icon" viewBox="0 0 16 16"><path d="M8 1l2.2 4.5L15 6.3l-3.5 3.4.8 4.8L8 12.3 3.7 14.5l.8-4.8L1 6.3l4.8-.8z" fill="#9B59B6"/></svg>',
    curse:    '<svg class="fpk-icon" viewBox="0 0 16 16"><path d="M8 1C5.2 1 3 3.7 3 7c0 2.2 1 4 2.5 5h5C12 11 13 9.2 13 7c0-3.3-2.2-6-5-6zM6 12v1c0 .6.9 1 2 1s2-.4 2-1v-1H6z" fill="#e74c3c"/></svg>',
    backlash: '<svg class="fpk-icon" viewBox="0 0 16 16"><path d="M9 1L4 8h3l-2 7 7-8H9l2-6z" fill="#f39c12"/></svg>',
    clarity:  '<svg class="fpk-icon" viewBox="0 0 16 16"><circle cx="8" cy="8" r="5" fill="none" stroke="#74b9ff" stroke-width="1.5"/><circle cx="8" cy="8" r="2" fill="#74b9ff"/></svg>',
    refraction:'<svg class="fpk-icon" viewBox="0 0 16 16"><path d="M3 13L8 3l5 10" fill="none" stroke="#a29bfe" stroke-width="1.5"/><line x1="5" y1="9" x2="11" y2="9" stroke="#a29bfe" stroke-width="1.2"/></svg>',
    reversal: '<svg class="fpk-icon" viewBox="0 0 16 16"><path d="M2 5h9l-3-3h2l4 4-4 4h-2l3-3H2V5zm12 6H5l3 3H6l-4-4 4-4h2L5 9h9v2z" fill="#1abc9c"/></svg>',
    null_field:'<svg class="fpk-icon" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="none" stroke="#95a5a6" stroke-width="1.5"/><line x1="4" y1="12" x2="12" y2="4" stroke="#95a5a6" stroke-width="1.5"/></svg>',
    void_shield:'<svg class="fpk-icon" viewBox="0 0 16 16"><path d="M8 1L2 4v4c0 3.3 2.6 6.4 6 7 3.4-.6 6-3.7 6-7V4L8 1z" fill="none" stroke="#7f8c8d" stroke-width="1.5"/></svg>',
    purge_all:'<svg class="fpk-icon" viewBox="0 0 16 16"><path d="M8 2L3 8l5 6 5-6-5-6z" fill="none" stroke="#bdc3c7" stroke-width="1.5"/></svg>',
    bolt:     '<svg class="fpk-icon fpk-icon-title" viewBox="0 0 16 16"><path d="M9 1L4 8h3l-2 7 7-8H9l2-6z" fill="currentColor"/></svg>',
    arrow:    '<svg class="fpk-icon fpk-icon-arrow" viewBox="0 0 16 16"><path d="M2 8h10l-3-3 1.4-1.4L15 8l-4.6 4.4L9 11l3-3H2V8z" fill="currentColor"/></svg>',
    debug:    '<svg class="fpk-icon fpk-icon-title" viewBox="0 0 16 16"><path d="M11 1l-1 2H6L5 1H3l1.3 2.6C3 4.5 2 6.1 2 8h2v2H2c.2 1.2.7 2.3 1.4 3.1L2 14.5 3.5 16l1.2-1.2c.8.5 1.7.7 2.6.8V9h1.4v6.6c.9-.1 1.8-.3 2.6-.8L12.5 16 14 14.5l-1.4-1.4C13.3 12.3 13.8 11.2 14 10h-2V8h2c0-1.9-1-3.5-2.3-4.4L13 1h-2z" fill="currentColor"/></svg>',
    eye:      '<svg class="fpk-icon" viewBox="0 0 16 16"><path d="M8 3C4.4 3 1.4 5.4 0 8c1.4 2.6 4.4 5 8 5s6.6-2.4 8-5c-1.4-2.6-4.4-5-8-5zm0 8.3c-1.8 0-3.3-1.5-3.3-3.3S6.2 4.7 8 4.7s3.3 1.5 3.3 3.3S9.8 11.3 8 11.3zM8 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" fill="currentColor"/></svg>'
  };

  // ========== 命运裁决展示 ==========
  let _fpkTimer = null;

  function showForcePK(meta) {
    const overlay = document.getElementById('force-pk-overlay');
    if (!overlay || !meta) return;

    const forces = meta.activeForces || [];
    const candidates = meta.topCandidates || [];
    const timeline = meta.debugTimeline || [];
    const isDebug = moz.debugMode;
    const _s = _svgIcons;

    // 没有力量也没有候选牌时不弹出
    if (forces.length === 0 && candidates.length === 0) return;

    const TYPE_CN = {
      fortune: '幸运', curse: '凶', backlash: '反噬',
      clarity: '澄澈', refraction: '折射', reversal: '真理',
      null_field: '屏蔽', void_shield: '绝缘', purge_all: '现实'
    };
    const SKILL_CN = {
      minor_wish: '小吉',
      grand_wish: '大吉',
      divine_order: '天命',
      hex: '小凶',
      havoc: '大凶',
      catastrophe: '灾变',
      clarity: '澄澈',
      refraction: '折射',
      reversal: '真理',
      null_field: '屏蔽',
      void_shield: '绝缘',
      purge_all: '现实',
      royal_decree: '敕令',
      heart_read: '命运感知',
      cooler: '冤家牌',
      skill_seal: '冻结令',
      clairvoyance: '估价眼',
      bubble_liquidation: '泡沫清算',
      miracle: '命大',
      lucky_find: '捡到了',
      rule_rewrite: '规则篡改',
      blind_box: '盲盒派对',
      deal_card: '发牌',
      gather_or_spread: '理牌',
      factory_malfunction: '故障切换',
      absolution: '赦免',
      benediction: '祝福',
      reclassification: '改判',
      general_ruling: '总务裁定',
      house_edge: '抽水',
      debt_call: '催收'
    };

    // 力量三分类：favorable(对玩家有利) / hostile(对玩家不利) / neutral(中立)
    var HERO_ID = skillUI.humanPlayerId != null ? skillUI.humanPlayerId : 0;
    var BENEFICIAL_TYPES = { fortune: 1, clarity: 1, refraction: 1, reversal: 1, null_field: 1, void_shield: 1, purge_all: 1 };
    var HARMFUL_TYPES = { curse: 1, backlash: 1 };

    function _classifyForce(f) {
      if (f && f._displayCategory) return f._displayCategory;
      // 一切力量都按“实际影响到谁”来分区，而不是按施法者硬塞。
      if (HARMFUL_TYPES[f.type]) {
        if (f.targetId != null) return f.targetId === HERO_ID ? 'hostile' : 'neutral';
        return f.ownerId === HERO_ID ? 'neutral' : 'hostile';
      }
      if (BENEFICIAL_TYPES[f.type]) {
        if (f.targetId != null) return f.targetId === HERO_ID ? 'favorable' : 'neutral';
        if (f.beneficiaryId != null) return f.beneficiaryId === HERO_ID ? 'favorable' : 'neutral';
        if (f.ownerId === HERO_ID) return 'favorable';
      }
      // 其余都是中立（别人的幸运、别人的psyche、诅咒别人的等）
      return 'neutral';
    }

    // ---- 构建 HTML ----
    let html = '';
    var runtimeApi = window.AceRuntimeAPI || null;
    var ledger = runtimeApi && typeof runtimeApi.getAssetLedger === 'function' ? runtimeApi.getAssetLedger() : null;
    var game = runtimeApi && typeof runtimeApi.getGameState === 'function' ? runtimeApi.getGameState() : null;
    var gamePlayers = game && Array.isArray(game.players) ? game.players : [];

    if (ledger && typeof ledger.getValue === 'function' && Array.isArray(gamePlayers)) {
      for (var gi = 0; gi < gamePlayers.length; gi++) {
        var gp = gamePlayers[gi];
        if (!gp || gp.isActive === false || gp.folded) continue;
        if (gp.role !== 'EULALIA' && gp.subRole !== 'EULALIA') continue;
        var streetBurden = Math.max(0, Number(ledger.getValue(gp.id, 'eulalia_street_burden') || 0));
        if (streetBurden <= 0) continue;
        forces.push({
          ownerId: gp.id,
          ownerName: gp.name || 'EULALIA',
          targetId: gp.id,
          targetName: gp.name || 'EULALIA',
          type: 'fortune',
          power: streetBurden,
          effectivePower: streetBurden,
          skillKey: 'absolution',
          source: 'eulalia_absolution_burden',
          _displayCategory: 'neutral',
          _displayTypeLabel: '承灾',
          _displaySkillLabel: '赦免承灾'
        });
      }
    }

    var vvPanelEntries = Array.isArray(gameState._vvLiquidationPanelEntries)
      ? gameState._vvLiquidationPanelEntries
      : [];
    for (var vli = 0; vli < vvPanelEntries.length; vli++) {
      var vvEntry = vvPanelEntries[vli];
      if (!vvEntry || Number(vvEntry.packCount || 0) <= 0) continue;
      var vvOwner = gameState.players.find(function(p) { return p && p.id === vvEntry.ownerId; });
      var vvTarget = gameState.players.find(function(p) { return p && p.id === vvEntry.targetId; });
      if (!vvOwner || vvOwner.isActive === false || vvOwner.folded) continue;
      if (!vvTarget || vvTarget.isActive === false || vvTarget.folded || Number(vvTarget.chips || 0) <= 0) continue;
      var primaryPack = Array.isArray(vvEntry.packDetails) && vvEntry.packDetails.length
        ? vvEntry.packDetails[0]
        : null;
      var packTag = primaryPack
        ? ('T' + Math.max(1, Number(primaryPack.tier || 1)) +
          '·' + (primaryPack.direction === 'bearish' ? '看跌' : '看涨') +
          '·L' + Math.max(0, Number(primaryPack.level || 0)))
        : 'T?·L?';
      var detail = Array.isArray(vvEntry.packDetails) && vvEntry.packDetails.length
        ? vvEntry.packDetails.map(function(pack, idx) {
            var directionLabel = pack.direction === 'bearish' ? '看跌' : '看涨';
            return '#' + (idx + 1) +
              ' T' + Math.max(1, Number(pack.tier || 1)) +
              ' / ' + directionLabel +
              ' / 偏离L' + Math.max(0, Number(pack.level || 0)) +
              ' / 份额 ' + Math.round(Math.max(0, Number(pack.baselineShare || 0)) * 100) + '%→' + Math.round(Math.max(0, Number(pack.currentShare || 0)) * 100) + '%' +
              ' / chaosBurst ' + Math.max(0, Number(pack.chaosBurst || 0)) +
              ' / fortuneBurst ' + Math.max(0, Number(pack.fortuneBurst || 0));
          }).join('\n')
        : '份额 ' + Math.round(Math.max(0, Number(vvEntry.baselineShare || 0)) * 100) + '%→' + Math.round(Math.max(0, Number(vvEntry.currentShare || 0)) * 100) + '%';
      if (Math.max(0, Number(vvEntry.targetFortuneBurst || 0)) > 0) {
        forces.push({
          ownerId: vvEntry.targetId,
          ownerName: vvEntry.targetName || 'TARGET',
          targetId: vvEntry.targetId,
          targetName: vvEntry.targetName || 'TARGET',
          type: 'fortune',
          power: Math.max(0, Number(vvEntry.targetFortuneBurst || 0)),
          effectivePower: Math.max(0, Number(vvEntry.targetFortuneBurst || 0)),
          skillKey: 'bubble_liquidation',
          source: 'bubble_liquidation',
          _displayCategory: 'neutral',
          _displayTypeLabel: '幸运爆账',
          _displaySkillLabel: '泡沫清算 ' + packTag + ' FROM ' + (vvEntry.ownerName || 'VV'),
          detail: detail,
          _vvLiquidationReceipt: true
        });
      }
      if (Math.max(0, Number(vvEntry.targetChaosBurst || 0)) > 0) {
        forces.push({
          ownerId: vvEntry.ownerId,
          ownerName: vvEntry.ownerName || 'VV',
          targetId: vvEntry.targetId,
          targetName: vvEntry.targetName || 'TARGET',
          type: 'curse',
          power: Math.max(0, Number(vvEntry.targetChaosBurst || 0)),
          effectivePower: Math.max(0, Number(vvEntry.targetChaosBurst || 0)),
          skillKey: 'bubble_liquidation',
          source: 'bubble_liquidation',
          _displayCategory: 'neutral',
          _displayTypeLabel: '厄运爆账',
          _displaySkillLabel: '泡沫清算 ' + packTag + ' FROM ' + (vvEntry.ownerName || 'VV'),
          detail: detail,
          _vvLiquidationReceipt: true
        });
      }
    }

    // === Header ===
    html += '<div class="fpk-header">';
    html += '<div class="fpk-title-group">';
    html += '<div class="fpk-title">DESTINY RECALIBRATION</div>';
    html += '<div class="fpk-subtitle">/// TERMINAL V.3.2 // MOZ_ENGINE</div>';
    html += '</div>';
    html += '<div class="fpk-sys-status">';
    html += '<svg class="fpk-spin" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/></svg>';
    html += '<span>ADJUSTING</span>';
    html += '</div>';
    html += '</div>';

    var visibleForces = [];
    for (var vi = 0; vi < forces.length; vi++) {
      var visibleForce = forces[vi];
      var forcePower = Math.max(0, Number(visibleForce.power || 0));
      if (forcePower > 0) visibleForces.push(visibleForce);
    }

    var totalFortune = 0;
    var totalCurse = 0;
    for (var si = 0; si < visibleForces.length; si++) {
      var totalForce = visibleForces[si];
      var totalEffective = Math.max(0, Number(totalForce.effectivePower != null ? totalForce.effectivePower : totalForce.power || 0));
      if (totalForce.type === 'fortune') totalFortune += totalEffective;
      if (totalForce.type === 'curse') totalCurse += totalEffective;
    }
    if (visibleForces.length > 0) {
      html = html.replace(
        '<span>ADJUSTING</span>',
        '<span>ADJUSTING</span><span class="fpk-status-total fpk-status-fortune">幸 ' + totalFortune.toFixed(1) + '</span><span class="fpk-status-total fpk-status-curse">凶 ' + totalCurse.toFixed(1) + '</span>'
      );
    }

    // === Conflict Matrix (Grid 三区布局：ambient 上方，favorable左 vs hostile右) ===
    if (visibleForces.length > 0) {
      var favorableForces = [];
      var hostileForces = [];
      var neutralForces = [];
      for (var ci = 0; ci < visibleForces.length; ci++) {
        var cat = _classifyForce(visibleForces[ci]);
        if (cat === 'favorable') favorableForces.push(visibleForces[ci]);
        else if (cat === 'hostile') hostileForces.push(visibleForces[ci]);
        else neutralForces.push(visibleForces[ci]);
      }

      // 中立区（全宽横排，在 matrix 上方）
      if (neutralForces.length > 0) {
        html += '<div class="fpk-ambient-row">';
        html += '<span class="fpk-zone-label fpk-z-env">AMBIENT FIELD</span>';
        for (var ni = 0; ni < neutralForces.length; ni++) {
          html += _buildChip(neutralForces[ni]);
        }
        html += '</div>';
      }

      // 有利(左) vs 不利(右) Grid
      if (favorableForces.length > 0 || hostileForces.length > 0) {
        html += '<div class="fpk-conflict-matrix">';

        // 左列：有利
        html += '<div class="fpk-matrix-col fpk-col-favorable">';
        html += '<div class="fpk-zone-label fpk-z-good">ACTIVE PROTOCOLS</div>';
        for (var fi = 0; fi < favorableForces.length; fi++) {
          html += _buildChip(favorableForces[fi]);
        }
        if (favorableForces.length === 0) {
          html += '<div class="fpk-none-hint">NONE</div>';
        }
        html += '</div>';

        // 中间分隔线
        html += '<div class="fpk-matrix-divider"></div>';

        // 右列：不利
        html += '<div class="fpk-matrix-col fpk-col-hostile">';
        html += '<div class="fpk-zone-label fpk-z-bad">HOSTILE INTENT</div>';
        for (var hi = 0; hi < hostileForces.length; hi++) {
          html += _buildChip(hostileForces[hi]);
        }
        if (hostileForces.length === 0) {
          html += '<div class="fpk-none-hint">NONE</div>';
        }
        html += '</div>';

        html += '</div>'; // fpk-conflict-matrix
      }
    }

    // === Console Log (Psyche events) ===
    const psycheEvents = meta.psycheEvents || [];
    if (psycheEvents.length > 0) {
      html += '<div class="fpk-console">';
      for (const ev of psycheEvents) {
        const arbiterCn = TYPE_CN[ev.arbiterType] || ev.arbiterType;
        if (ev.action === 'convert') {
          var beneficiary = ev.beneficiary || ev.arbiterOwner;
          html += '<div class="fpk-console-line">';
          html += '<span class="fpk-log-icon">&gt;</span>';
          html += '<span class="fpk-log-txt"><span class="fpk-log-skill">[' + arbiterCn + ']</span> INTERCEPTED</span>';
          html += '<span class="fpk-log-bad">' + (TYPE_CN[ev.targetType] || '凶') + '(P' + ev.originalPower + ')</span>';
          html += '</div>';
          html += '<div class="fpk-console-line" style="padding-left:12px;">';
          html += '<span class="fpk-log-txt">&xrarr; RECONSTRUCTED TO</span>';
          html += '<span class="fpk-log-res">' + beneficiary + '::LUCK(P' + ev.convertedPower + ')</span>';
          html += '</div>';
        } else if (ev.action === 'nullify') {
          html += '<div class="fpk-console-line">';
          html += '<span class="fpk-log-icon">&gt;</span>';
          html += '<span class="fpk-log-txt"><span class="fpk-log-skill">[' + arbiterCn + ']</span> NULLIFIED</span>';
          html += '<span class="fpk-log-bad">' + (TYPE_CN[ev.targetType] || '凶') + '(P' + ev.originalPower + ')</span>';
          html += '</div>';
        } else if (ev.action === 'whiff') {
          html += '<div class="fpk-console-line">';
          html += '<span class="fpk-log-icon">&gt;</span>';
          html += '<span class="fpk-log-whiff">[' + arbiterCn + '] WHIFF — NO HOSTILE FORCES</span>';
          html += '</div>';
        }
      }
      html += '</div>';
    }

    // === Candidate Grid ===
    if (candidates.length > 0) {
      // 显示前5个 + 如果选中的不在前5，显示为第6行（带实际排名）
      var top5 = candidates.slice(0, 5);
      var selectedInTop5 = top5.some(function(c) { return c.selected; });
      var extraSelected = null;
      if (!selectedInTop5) {
        for (var k = 5; k < candidates.length; k++) {
          if (candidates[k].selected) { extraSelected = candidates[k]; break; }
        }
      }

      var maxProb = Math.max.apply(null, candidates.map(function(c) { return c.prob; }).concat([1]));

      html += '<div class="fpk-list">';
      html += '<div class="fpk-table-header">';
      html += '<span>#</span><span>CARD</span><span style="text-align:right">SCR</span><span>PROBABILITY</span><span>%</span>';
      html += '</div>';

      // Top 5 rows
      for (var ri = 0; ri < top5.length; ri++) {
        html += _buildCandidateRow(top5[ri], ri + 1, maxProb);
      }

      // Extra selected row (if outside top 5)
      if (extraSelected) {
        html += _buildCandidateRow(extraSelected, extraSelected.rank || '?', maxProb);
      }

      html += '</div>';
    }

    // === Debug 面板（仅 debugMode） ===
    if (isDebug && timeline.length > 0) {
      html += '<div class="fpk-debug">';
      html += '<div class="fpk-debug-title">' + _s.debug + ' DEBUG</div>';
      html += '<div class="fpk-debug-step">rank=#' + (meta.selectedRank || '?') + '/' + (meta.totalUniverses || '?') + ' score=' + (meta.destinyScore || 0).toFixed(1) + '</div>';
      if (forces.length > 0) {
        html += '<div class="fpk-debug-step"><span class="fpk-debug-stage">FORCES</span> ';
        for (const f of forces) {
          html += f.owner + '.' + (TYPE_CN[f.type] || f.type) + ' P' + f.power + ' ';
        }
        html += '</div>';
      }
      for (const step of timeline) {
        html += '<div class="fpk-debug-step">';
        html += '<span class="fpk-debug-stage">' + step.stage + '</span> ';
        switch (step.stage) {
          case 'ROUND_START':
            html += 'deck=' + step.data.deckRemaining + ' forces=' + (step.data.inputForces || []).length;
            break;
          case 'TIER_SUPPRESSION':
            for (const s of (step.data.suppressed || [])) {
              html += s.owner + '.' + s.type + ' X ' + s.suppressedBy + ' ';
            }
            break;
          case 'REVERSAL_CONVERT':
            html += step.data.intercepted.owner + '.' + step.data.intercepted.type + '(P' + step.data.intercepted.originalPower + ')>fortune(P' + step.data.converted.power + ')';
            break;
          case 'PSYCHE_CONVERT':
            html += step.data.intercepted.owner + '.' + step.data.intercepted.type + '(P' + step.data.intercepted.originalPower + ')>' + step.data.converted.owner + '.fortune(P' + step.data.converted.power + ')';
            break;
          case 'PSYCHE_NULLIFY':
            html += step.data.nullified.owner + '.' + step.data.nullified.type + '(P' + step.data.nullified.originalPower + ') NULLIFIED';
            break;
          case 'PSYCHE_WHIFF':
            html += step.data.owner + '.' + step.data.arbiterType + ' WHIFF (no curse)';
            break;
          case 'ATTR_COUNTER':
            for (const c of (step.data.countered || [])) {
              html += c.owner + '.' + c.type + ' EP=' + c.effectivePower;
              if (c.counterBonus) html += ' [C>M+10%]';
              if (c.clarityReduced) html += ' [P>C-clarity]';
              html += ' ';
            }
            break;
          case 'OPPOSITION_RESULT':
            for (const r of (step.data.resolved || [])) {
              const status = r.suppressed ? '[X]' : r.converted ? '[R]' : r.voidReduced ? '[V]' : '';
              html += '<br>' + r.owner + ' ' + r.type + ' P' + r.power + '>' + r.effectivePower + status;
            }
            break;
          case 'CARD_SELECTED':
            if (step.data.top3) {
              html += 'top: ' + step.data.top3.map(function(u) { return u.card + '=' + u.score.toFixed(1); }).join(', ');
            }
            break;
          default: break;
        }
        html += '</div>';
      }
      html += '</div>';
    }

    // === Click hint ===
    html += '<div class="fpk-click-hint">Click Anywhere to Dismiss</div>';

    overlay.innerHTML = html;
    overlay.classList.remove('fpk-fade-out');
    overlay.style.display = 'block';
    if (tutorialController && typeof tutorialController.onForcePanelShown === 'function') {
      tutorialController.onForcePanelShown(meta);
    }

    // 仅点击关闭，不自动隐藏
    if (_fpkTimer) { clearTimeout(_fpkTimer); _fpkTimer = null; }
    overlay.style.pointerEvents = 'auto';
    overlay.onclick = function () {
      overlay.classList.add('fpk-fade-out');
      setTimeout(function() {
        overlay.style.display = 'none';
        overlay.style.pointerEvents = 'none';
        if (tutorialController && typeof tutorialController.onForcePanelDismissed === 'function') {
          tutorialController.onForcePanelDismissed();
        }
      }, 400);
      overlay.onclick = null;
    };
  }

  // 构建力量 Chip HTML (线框风格)
  function _buildChip(f) {
    function _escapeChipHtml(value) {
      return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }
    var TYPE_CN = {
      fortune: '幸运', curse: '凶', backlash: '反噬',
      clarity: '澄澈', refraction: '折射', reversal: '真理',
      null_field: '屏蔽', void_shield: '绝缘', purge_all: '现实',
      clairvoyance: '估价眼', heart_read: '命运感知',
      deal_card: '发牌', gather_or_spread: '理牌', factory_malfunction: '故障切换'
    };
    var SKILL_CN = {
      cooler: '冤家牌', bubble_liquidation: '泡沫清算', royal_decree: '敕令',
      miracle: '命大', lucky_find: '捡到了', skill_seal: '冻结令',
      deal_card: '发牌', gather_or_spread: '理牌', factory_malfunction: '故障切换', absolution: '赦免', benediction: '祝福',
      reclassification: '改判', general_ruling: '总务裁定', house_edge: '抽水', debt_call: '催收',
      eulalia_absolution_burden: '承灾',
      eulalia_absolution_burst: '爆账'
    };
    // attr → CSS class 映射
    var ATTR_CLS = {
      fortune: 'fpk-attr-moirai', curse: 'fpk-attr-chaos', backlash: 'fpk-attr-chaos',
      clarity: 'fpk-attr-psyche', refraction: 'fpk-attr-psyche', reversal: 'fpk-attr-psyche',
      clairvoyance: 'fpk-attr-psyche', heart_read: 'fpk-attr-psyche',
      deal_card: 'fpk-attr-psyche', gather_or_spread: 'fpk-attr-psyche', factory_malfunction: 'fpk-attr-psyche',
      null_field: 'fpk-attr-void', void_shield: 'fpk-attr-void', purge_all: 'fpk-attr-void'
    };
    var isHarmful = f && (f.type === 'curse' || f.type === 'backlash');
    var isBeneficial = f && f.type === 'fortune';
    var sourceCn = f.owner || f.ownerName || (f.ownerId != null ? ('ID:' + f.ownerId) : 'SYSTEM');
    var ownerCn = sourceCn;
    var eulaliaRuntimeForce = f._eulaliaRuntimeForce || f.eulaliaRuntimeForce || null;
    if ((eulaliaRuntimeForce === 'burst' || isHarmful || isBeneficial) && f.targetName) {
      ownerCn = f.targetName;
    }
    var skillCn = ((eulaliaRuntimeForce && f.source && SKILL_CN[f.source]) ? SKILL_CN[f.source] : null)
      || f._displaySkillLabel
      || (f.skillKey && SKILL_CN[f.skillKey]) || f.skillKey
      || (f.source && SKILL_CN[f.source]) || f.source
      || TYPE_CN[f.type]
      || f.type;
    if ((eulaliaRuntimeForce === 'burst' || isHarmful || isBeneficial) && sourceCn && ownerCn !== sourceCn) {
      skillCn += ' FROM ' + sourceCn;
    } else if (eulaliaRuntimeForce !== 'burst' && isHarmful && f.targetName && f.targetName !== ownerCn) {
      skillCn += '→' + f.targetName;
    }
    var typeCn = f._displayTypeLabel || TYPE_CN[f.type] || f.type;
    var power = Math.max(0, Number(f.power || 0));
    var effectivePower = Math.max(0, Number(f.effectivePower != null ? f.effectivePower : power));
    var attrCls = ATTR_CLS[f.type] || 'fpk-attr-void';
    var suppCls = f.suppressed ? ' fpk-chip-suppressed' : '';
    var h = '<div class="fpk-chip ' + attrCls + suppCls + '">';
    h += '<span class="fpk-chip-owner">' + _escapeChipHtml(ownerCn) + '</span>';
    h += '<span class="fpk-chip-sep">·</span>';
    h += '<span class="fpk-chip-skill">' + _escapeChipHtml(skillCn) + '</span>';
    if (String(skillCn) !== String(typeCn)) {
      h += '<span class="fpk-chip-type">' + _escapeChipHtml(typeCn) + '</span>';
    }
    h += '<span class="fpk-chip-metric">P' + power.toFixed(1) + '</span>';
    h += '<span class="fpk-chip-metric">EP' + effectivePower.toFixed(1) + '</span>';
    h += '</div>';
    return h;
  }

  // 构建候选行 HTML
  function _buildCandidateRow(c, rank, maxProb) {
    var barWidth = Math.max(2, Math.round((c.prob / maxProb) * 100));
    var isWin = c.rinoWins;
    var selCls = '';
    if (c.selected) selCls = isWin ? ' is-selected' : ' is-selected-lose';
    var barCls = isWin ? 'fpk-bar-fill-win' : 'fpk-bar-fill-lose';

    var h = '<div class="fpk-row' + selCls + '">';
    h += '<span class="fpk-cell-rank">' + (typeof rank === 'number' ? ('0' + rank).slice(-2) : '#' + rank) + '</span>';
    h += '<span class="fpk-cell-card">' + _cardToDisplay(c.card) + '</span>';
    h += '<span class="fpk-cell-score">' + c.score.toFixed(1) + '</span>';
    h += '<div class="fpk-cell-bar-wrap"><div class="fpk-bar-bg"><div class="fpk-bar-fill ' + barCls + '" style="width:' + barWidth + '%"></div></div></div>';
    h += '<span class="fpk-cell-prob">' + c.prob.toFixed(1) + '%';
    if (c.selected) h += ' <span class="fpk-pick-arrow">◄</span>';
    h += '</span>';
    h += '</div>';
    return h;
  }

  // Tier 标签
  function _tierLabel(tier) {
    var labels = { 1: 'I', 2: 'II', 3: 'III' };
    return labels[tier] || '';
  }

  // 牌面字符串 → 可视化显示
  function _cardToDisplay(cardStr) {
    if (!cardStr || cardStr.length < 2) return cardStr || '?';
    var rank = cardStr[0];
    var suitChar = cardStr[1];
    var SUIT_SYMBOLS = { h: '♥', d: '♦', c: '♣', s: '♠' };
    var SUIT_CLASS = { h: 'fpk-suit-h', d: 'fpk-suit-d', c: 'fpk-suit-c', s: 'fpk-suit-s' };
    var suit = SUIT_SYMBOLS[suitChar] || suitChar;
    var cls = SUIT_CLASS[suitChar] || '';
    return '<span class="' + cls + '">' + rank + suit + '</span>';
  }

  // Psyche 拦截事件 → 游戏消息（让玩家看到技能生效）
  function _showPsycheMessages(events) {
    if (!events || events.length === 0) return;
    const TYPE_CN = { clarity: '澄澈', refraction: '折射', reversal: '真理', curse: '凶' };
    for (const ev of events) {
      const arbiterCn = TYPE_CN[ev.arbiterType] || ev.arbiterType;
      if (ev.action === 'convert') {
        updateMsg('[' + arbiterCn + '] 转化 ' + ev.targetOwner + ' 的诅咒');
        logEvent('PSYCHE_INTERCEPT', { arbiter: arbiterCn, target: ev.targetOwner, action: 'convert', power: ev.convertedPower });
      } else if (ev.action === 'nullify') {
        updateMsg('[' + arbiterCn + '] 消除 ' + ev.targetOwner + ' 的诅咒');
        logEvent('PSYCHE_INTERCEPT', { arbiter: arbiterCn, target: ev.targetOwner, action: 'nullify' });
      } else if (ev.action === 'whiff') {
        updateMsg('[' + arbiterCn + '] 落空');
        logEvent('PSYCHE_INTERCEPT', { arbiter: arbiterCn, action: 'whiff' });
      }
    }
  }

  function hideForcePK() {
    const overlay = document.getElementById('force-pk-overlay');
    if (overlay) overlay.style.display = 'none';
    if (_fpkTimer) { clearTimeout(_fpkTimer); _fpkTimer = null; }
    if (tutorialController && typeof tutorialController.onForcePanelDismissed === 'function') {
      tutorialController.onForcePanelDismissed();
    }
  }

  function distributeCommunityCard(delay, cardIndex, specificCard) {
    return new Promise((resolve) => {
      // 如果有指定牌，跳过牌堆检查（牌已被 pickSpecificCard 移除）
      if (!specificCard && (!deckLib || !deckLib.cards.length)) {
        resolve();
        return;
      }
      
      // 如果提供了指定牌，使用它；否则普通 pop
      const card = specificCard || deckLib.cards.pop();
      const slotIndex = typeof cardIndex === 'number' ? cardIndex : gameState.board.length;
      gameState.board.push(card);

      const deckWrapper = document.getElementById('deck-wrapper');
      const deckMount = document.getElementById('deck-mount');
      const deckStack = deckMount ? (deckMount.querySelector('.deck') || deckMount) : null;
      const wrapperRect = deckWrapper.getBoundingClientRect();

      // 使用固定槽位，避免依赖剩余 ghost-card 的动态索引
      const targetSlot = UI.boardZone.children[slotIndex];

      if (!targetSlot) {
        resolve();
        return;
      }

      if (card.$el && deckStack && card.$el.parentNode !== deckStack) {
        deckStack.appendChild(card.$el);
      }
      if (card.$el) {
        card.$el.classList.remove('aligned-card');
      }
      card.setSide('back');

      const slotRect = targetSlot.getBoundingClientRect();
      const cardFinalX = slotRect.left + slotRect.width / 2;
      const cardFinalY = slotRect.top + slotRect.height / 2;
      
      const deckCenterX = wrapperRect.left + wrapperRect.width / 2;
      const deckCenterY = wrapperRect.top + wrapperRect.height / 2;
      
      const deltaX = cardFinalX - deckCenterX;
      const deltaY = cardFinalY - deckCenterY;

      card.animateTo({
        delay: delay,
        duration: 250,
        x: deltaX,
        y: deltaY,
        rot: 0,
        onStart: function() {
          card.$el.style.zIndex = 9999;
        },
        onComplete: function() {
          card.setSide('front');
          targetSlot.replaceWith(card.$el);
          card.$el.classList.add('aligned-card');
          card.$el.style.transform = 'none';
          card.$el.style.position = 'relative';
          card.x = 0;
          card.y = 0;
          resolve();
        }
      });
    });
  }

  // ========== 游戏流程 ==========
  function initTable() {
    if (deckLib) deckLib.unmount();
    deckLib = Deck();
    deckLib.mount(UI.deckMount);
    deckLib.shuffle();

    // 重新添加幽灵卡槽
    UI.boardZone.innerHTML = `
      <div class="ghost-card"></div>
      <div class="ghost-card"></div>
      <div class="ghost-card"></div>
      <div class="ghost-card"></div>
      <div class="ghost-card"></div>
    `;

    hideRaiseControls();
    updateMsg('');
  }

  function startNewGame(forceReset) {
    refreshTutorialController();
    if (tutorialController && typeof tutorialController.onGameStarted === 'function') {
      tutorialController.onGameStarted();
    }
    initTable();
    
    // 清空当前局日志条目（历史局已由 archiveRound 保存）
    gameLogger.clear();
    
    // 判断是否需要全新初始化
    // forceReset=true  → RESTART（全重置）
    // forceReset=false → CONTINUE（保留筹码）
    // forceReset=undefined → 自动检测（首局 / 筹码归零）
    var needFullReset;
    if (forceReset === true) {
      needFullReset = true;
    } else if (forceReset === false) {
      // CONTINUE: 但如果活着的玩家不足，仍需重置
      var alivePlayers = gameState.players.filter(function(p) { return p.chips > 0; });
      needFullReset = gameState.players.length === 0 || alivePlayers.length <= 1;
    } else {
      var alivePlayers = gameState.players.filter(function(p) { return p.chips > 0; });
      needFullReset = gameState.players.length === 0 || alivePlayers.length <= 1;
    }
    
    if (needFullReset) {
      // 全新一局：从配置初始化所有玩家
      const configs = getPlayerConfigs();
      var roleValidation = validateUniqueRoleConstraints(configs);
      if (!roleValidation.ok) {
        console.error('[GAME] Invalid role composition:', roleValidation.message);
        updateMsg(roleValidation.message);
        return;
      }
      const playerCount = Math.min(Math.max(configs.length, 2), 6);
      gameState.players = initializePlayers(playerCount);
      gameState._vvLiquidationPanelEntries = [];
      // dealerIndex = BTN 座位的玩家索引
      var btnIdx = gameState.players.findIndex(function(p) { return p.seat === 'BTN'; });
      gameState.dealerIndex = btnIdx >= 0 ? btnIdx : 0;
      skillSystem.reset();
      // 从配置注册所有技能 + 生成UI（传入玩家ID映射）
      skillUI.registerFromConfig(getEffectiveGameConfig(), buildPlayerIdMap());
      // 初始化心理系统
      gameState.players.forEach(function(p) {
        p.storyRevealed = false;
        var cfg = getPlayerConfig(p.id);
        var effectiveSeats = getEffectiveSeatsConfig();
        var seatCfg = cfg.seat && effectiveSeats[cfg.seat] ? effectiveSeats[cfg.seat] : {};
        var mentalCfg = (cfg.type === 'human' ? (getEffectiveHeroConfig() && getEffectiveHeroConfig().mental) : null) ||
                        seatCfg.mental ||
                        { discipline: 50, composureMax: 100 };
        mentalCfg = Object.assign({}, mentalCfg, {
          emotion: seatCfg.emotion || 'calm'
        });
        mentalSystem.initPlayer(p.id, mentalCfg);
      });
      if (runtimeFlow) {
        runtimeFlow.emit('game:started', {
          reset: true,
          playerCount: gameState.players.length,
          dealerIndex: gameState.dealerIndex
        });
      }
    } else {
      // 连续对局：保留筹码，重置手牌状态
      gameState.players.forEach(p => {
        p.cards = [];
        p.currentBet = 0;
        p.totalBet = 0;
        p.storyRevealed = false;
        p.folded = false;
        p.hasActedThisRound = false;
        const playerInitialChips = Number.isFinite(p.initialChips) && p.initialChips > 0
          ? p.initialChips
          : (p.type === 'human'
            ? (_cfg().heroChips || _cfg().chips || 1000)
            : (_cfg().chips || 1000));
        const eliminationThreshold = playerInitialChips * (p.type === 'human' ? 0.05 : 0.1);
        // 筹码过低自动淘汰
        if (p.chips > 0 && p.chips < eliminationThreshold) {
          p.isActive = false;
          p.folded = true;
        } else if (p.chips > 0) {
          p.isActive = true;
        } else {
          p.isActive = false;
          p.folded = true;
        }
      });
      // 不重置定力，让心理战效果跨局累积
      // mentalSystem.resetAll();
      if (runtimeFlow) {
        runtimeFlow.emit('game:started', {
          reset: false,
          playerCount: gameState.players.length,
          dealerIndex: gameState.dealerIndex
        });
      }
    }
    
    gameState.board = [];
    gameState.phase = 'preflop';
    gameState.pot = 0;
    gameState.currentBet = 0;
    gameState.lastRaiserIndex = -1;
    gameState.actionCount = 0;
    gameState.raiseCount = 0;

    // 重置回合内技能使用记录
    if (typeof skillSystem !== 'undefined' && skillSystem.resetTurnSkillTracking) skillSystem.resetTurnSkillTracking();

    // 重置所有 toggle 技能（每局开始时关闭）
    if (typeof skillSystem !== 'undefined' && skillSystem.resetToggleSkills) skillSystem.resetToggleSkills();

    // 重置心理战技能使用标记
    mentalSystem.resetRoundSkillUsage();

    // 技能系统：新一手牌开始
    skillUI.onNewHand();
    if (skillUI.skillSystem && typeof skillUI.skillSystem.syncSealStates === 'function') {
      skillUI.skillSystem.syncSealStates(gameState.phase);
    }
    if (runtimeFlow) {
      runtimeFlow.emit('table:hand_start', {
        phase: gameState.phase,
        pot: gameState.pot,
        board: [],
        dealerIndex: gameState.dealerIndex
      });
    }

    gameState.players.forEach(function(p) {
      if (p.ai && typeof p.ai.resetScoutMemory === 'function') {
        p.ai.resetScoutMemory();
      }
    });

    // 快照 hero 开始筹码（用于 funds_delta 计算）
    var heroPlayer = gameState.players.find(function(p) { return p.type === 'human'; });
    _heroStartChips = heroPlayer ? heroPlayer.chips : 0;

    // 诊断日志：玩家排列
    console.log('[GAME] 玩家列表:', gameState.players.map(function(p, i) {
      return '#' + i + ' ' + p.name + ' (' + p.type + ') seat=' + p.seat + ' chips=' + p.chips;
    }).join(' | '));
    console.log('[GAME] heroIndex=' + getHeroIndex() + ', dealerIndex=' + gameState.dealerIndex);
    
    // 渲染座位
    renderSeats();
    updateDealerButton();
    assignPositions();
    updatePositionBadges();
    skillUI.updateDisplay();
    
    // 收取盲注
    postBlinds();
    
    // 发牌
    setTimeout(() => {
      dealHoleCards();
    }, 300);
    
    UI.btnDeal.disabled = true;
    setGameActive(true);
    dismissSplash();
    dismissEndhandModal();
    updatePotDisplay();
    skillUI.update({ phase: gameState.phase, isPlayerTurn: false });

    var mentalToggle = document.getElementById('btn-mental-toggle');
    var mentalPanel = document.getElementById('mental-skills');
    if (mentalToggle) {
      mentalToggle.style.display = isTutorialSystemEnabled('mental') ? '' : 'none';
    }
    if (mentalPanel && !isTutorialSystemEnabled('mental')) {
      mentalPanel.style.display = 'none';
    }
  }

  function postBlinds() {
    // Heads-Up (2人活跃): 庄家 = SB，对手 = BB
    // 多人桌 (3+活跃): 庄家后一位活跃玩家 = SB，再下一位 = BB
    const activePlayers = gameState.players.filter(p => p.isActive);
    let sbIndex, bbIndex;
    if (activePlayers.length === 2) {
      sbIndex = gameState.dealerIndex; // 庄家是SB
      bbIndex = findFirstActivePlayer((gameState.dealerIndex + 1) % gameState.players.length);
    } else {
      sbIndex = findFirstActivePlayer((gameState.dealerIndex + 1) % gameState.players.length);
      bbIndex = findFirstActivePlayer((sbIndex + 1) % gameState.players.length);
    }
    
    const sbPlayer = gameState.players[sbIndex];
    const bbPlayer = gameState.players[bbIndex];
    
    const sb = Math.min(getSmallBlind(), sbPlayer.chips);
    const bb = Math.min(getBigBlind(), bbPlayer.chips);
    
    sbPlayer.chips -= sb;
    sbPlayer.currentBet = sb;
    sbPlayer.totalBet = sb;
    
    bbPlayer.chips -= bb;
    bbPlayer.currentBet = bb;
    bbPlayer.totalBet = bb;
    
    gameState.currentBet = bb;
    
    // 立即显示盲注筹码
    updateSeatDisplay(sbPlayer);
    updateSeatDisplay(bbPlayer);
    updatePotDisplay();
    
    logEvent('BLINDS', { sb: sbPlayer.name, bb: bbPlayer.name, sbAmount: getSmallBlind(), bbAmount: getBigBlind() });
    updateMsg(`Blinds: SB ${Currency.htmlAmount(getSmallBlind())} / BB ${Currency.htmlAmount(getBigBlind())}`);
  }

  // ========== 手牌保底 (Phase 5) ==========
  // pro/boss NPC 的手牌不能太差，否则重抽
  const HAND_FLOOR = { pro: 30, boss: 40 };
  const HAND_FLOOR_MAX_RETRIES = { pro: 5, boss: 15 };

  function enforceHandFloor() {
    if (shouldDisableTutorialHandFloor()) return;
    gameState.players.forEach(player => {
      if (player.type !== 'ai' || !player.personality) return;
      const diff = (player.ai && player.ai.difficultyType) || player.personality.difficulty;
      const floor = HAND_FLOOR[diff];
      if (!floor) return; // noob/regular 不保底

      // Boss 阶段脚本可动态调整保底阈值
      let dynamicFloor = floor;
      if (player.ai && player.ai.bossScript) {
        player.ai.bossScript.updatePhase(player.chips);
        dynamicFloor = player.ai.bossScript.getModifiers().handFloor || floor;
      }

      const maxRetries = HAND_FLOOR_MAX_RETRIES[diff] || 3;
      let strength = PokerAI.evaluatePreflopStrength(player.cards);

      for (let attempt = 0; attempt < maxRetries && strength < dynamicFloor; attempt++) {
        // 把当前手牌放回牌堆（同时移除 DOM 元素）
        const oldCards = player.cards.splice(0, 2);
        oldCards.forEach(c => {
          if (c.$el && c.$el.parentNode) {
            c.$el.parentNode.removeChild(c.$el);
          }
          deckLib.cards.push(c);
        });

        // 从牌堆中随机抽 2 张新牌
        // 先局部洗牌（只洗最后几张，避免影响已发的牌）
        const len = deckLib.cards.length;
        for (let i = len - 1; i > Math.max(0, len - 10); i--) {
          const j = Math.floor(Math.random() * (i + 1));
          const tmp = deckLib.cards[i];
          deckLib.cards[i] = deckLib.cards[j];
          deckLib.cards[j] = tmp;
        }

        const c1 = deckLib.cards.pop();
        const c2 = deckLib.cards.pop();
        player.cards.push(c1, c2);

        // 视觉：新牌保持背面朝上，移到玩家座位
        [c1, c2].forEach(c => {
          c.setSide('back');
          const target = player.seatElement.querySelector('.seat-cards');
          if (target) {
            target.appendChild(c.$el);
            c.$el.classList.add('aligned-card');
            c.$el.style.transform = 'none';
            c.$el.style.position = 'relative';
          }
        });

        strength = PokerAI.evaluatePreflopStrength(player.cards);
        console.log('[HandFloor] ' + player.name + ' (' + diff + ') retry ' +
          (attempt + 1) + ' floor=' + dynamicFloor +
          ' → strength=' + strength + (strength >= dynamicFloor ? ' ✓' : ' ✗'));
      }
    });
  }

  async function dealHoleCards() {
    const promises = [];
    
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < gameState.players.length; j++) {
        const player = gameState.players[j];
        if (!player.isActive) continue; // 跳过已淘汰的玩家
        const faceUp = player.type === 'human';
        const delay = (i * gameState.players.length + j) * 150;
        promises.push(distributeCard(player, faceUp, delay));
      }
    }
    
    await Promise.all(promises);

    // 手牌保底：pro/boss NPC 弱牌重抽
    enforceHandFloor();

    // 更新胜率显示
    updateEquityDisplay();

    const activeCount = gameState.players.filter(p => p.isActive).length;
    logEvent('DEAL', { playerCount: activeCount });
    
    // 开始第一轮下注
    // Heads-Up (2人活跃): SB（庄位）先行动
    // 多人桌 (3+活跃): BB后第一个活跃玩家先行动 (UTG)
    if (activeCount === 2) {
      gameState.turnIndex = gameState.dealerIndex;
    } else {
      // 找到BB位置，然后UTG是BB后第一个活跃玩家
      const sbIndex = findFirstActivePlayer((gameState.dealerIndex + 1) % gameState.players.length);
      const bbIndex = findFirstActivePlayer((sbIndex + 1) % gameState.players.length);
      gameState.turnIndex = findFirstActivePlayer((bbIndex + 1) % gameState.players.length);
    }
    gameState.actionCount = 0;

    // Preflop 发牌后：只检查仍由 SkillSystem 主流程负责的触发技。
    // Runtime 专属触发（如 POPPY）由 runtime 模块自行结算。
    // NPC 主动技能决策延迟到 endBettingRound，此时 commit > 0，pro/boss 才会用技能
    if (skillUI.skillSystem) {
      skillUI.skillSystem.checkTriggers({
        players: gameState.players, pot: gameState.pot,
        phase: gameState.phase, board: gameState.board, blinds: getBigBlind()
      });
    }
    
    setTimeout(() => {
      nextTurn();
    }, 500);
  }

  function collectBetsIntoPot() {
    if (gameState.players.some(p => p.currentBet > 0)) {
      animateChipsToCenter();
    }
    
    setTimeout(() => {
      gameState.players.forEach(player => {
        gameState.pot += player.currentBet;
        player.currentBet = 0;
        player.hasActedThisRound = false;  // 重置行动标志
        updateSeatDisplay(player);
      });
      
      gameState.currentBet = 0;
      gameState.lastRaiserIndex = -1;
      gameState.actionCount = 0;
    gameState.raiseCount = 0;
    gameState.tutorialAiCursor = {};
      updatePotDisplay();
    }, 600);
  }

  function endBettingRound() {
    hideRaiseControls();
    setTurnIndicator(-1);
    collectBetsIntoPot();

    // 检测是否所有非弃牌玩家都 all-in（chips=0）
    var activePlayers = gameState.players.filter(function(p) { return p.isActive && !p.folded; });
    var allAllIn = activePlayers.length > 0 && activePlayers.every(function(p) { return p.chips === 0; });

    var gameCtx = {
      players: gameState.players,
      pot: gameState.pot,
      phase: gameState.phase,
      board: gameState.board,
      blinds: getBigBlind(),
      allIn: allAllIn
    };

    if (runtimeFlow) {
      runtimeFlow.emit('table:street_end', {
        phase: gameState.phase,
        pot: gameState.pot,
        board: (gameState.board || []).slice(),
        allIn: allAllIn
      });
    }

    // 基础处理：mana恢复 + CD递减 + 触发检查（不含NPC出招）
    skillUI.onRoundEndBase(gameCtx);

    // River → 直接 NPC出招 + showdown
    if (gameState.phase === 'river') {
      skillUI.fireNpcSkills(gameCtx);
      setTimeout(showdown, 800);
      return;
    }

    // Hero 已弃牌 → 跳过技能阶段
    var hero = getHeroPlayer();
    if (!hero || hero.folded) {
      var skippedNpcRecords = skillUI.fireNpcSkills(gameCtx);
      void continueToDealAfterPreDeal(gameCtx, {
        npcRecords: skippedNpcRecords,
        summaryDelayMs: 800
      });
      return;
    }

    if (shouldSkipTutorialSkillPhase()) {
      void continueToDealAfterPreDeal(gameCtx, {
        npcRecords: [],
        summaryDelayMs: 0
      });
      return;
    }

    // ── 技能博弈阶段：暂停让玩家出招 ──
    _enterSkillPhase(gameCtx);
  }

  function _proceedToDeal() {
    // 重置回合内技能使用记录（新一街开始）
    if (typeof skillSystem !== 'undefined' && skillSystem.resetTurnSkillTracking) skillSystem.resetTurnSkillTracking();
    switch (gameState.phase) {
      case 'preflop': dealFlop(); break;
      case 'flop':    dealTurn(); break;
      case 'turn':    dealRiver(); break;
    }
  }

  /**
   * 技能博弈阶段：玩家可用 grimoire 出招
   * 点"继续发牌"→ NPC同时出招 → 发牌
   */
  function _enterSkillPhase(gameCtx) {
    // 启用技能面板（让 grimoire 按钮可用）
    skillUI.update({
      phase: gameState.phase, isPlayerTurn: true,
      deckCards: deckLib ? deckLib.cards : [],
      board: gameState.board, players: gameState.players
    });

    updateMsg('⚡ 技能阶段');
    document.body.classList.add('game-active');

    // 隐藏原始按钮（不能复用 btnCheckCall，它有永久的 playerCheckCall 监听器）
    UI.btnFold.style.display = 'none';
    UI.btnCheckCall.style.display = 'none';
    UI.btnRaise.style.display = 'none';
    hideRaiseControls();

    // 创建临时按钮
    var proceedBtn = document.createElement('button');
    proceedBtn.className = 'btn-cmd';
    proceedBtn.textContent = '继续发牌 ▶';
    proceedBtn.id = 'btn-skill-proceed';
    var actionRow = document.getElementById('action-row');
    actionRow.appendChild(proceedBtn);
    actionRow.style.display = 'flex';
    if (tutorialController && typeof tutorialController.onSkillPhaseEntered === 'function') {
      tutorialController.onSkillPhaseEntered(gameCtx);
    }

    proceedBtn.addEventListener('click', async function () {
      proceedBtn.disabled = true;
      if (tutorialController && typeof tutorialController.onSkillProceed === 'function') {
        tutorialController.onSkillProceed();
      }
      // NPC 同时出招
      var npcRecords = executeTutorialNpcSkills(gameCtx);
      if (npcRecords == null) {
        npcRecords = skillUI.fireNpcSkills(gameCtx);
      }
      // 移除临时按钮，恢复原始按钮
      if (proceedBtn.parentNode) proceedBtn.parentNode.removeChild(proceedBtn);
      UI.btnFold.style.display = '';
      UI.btnCheckCall.style.display = '';
      UI.btnRaise.style.display = '';
      actionRow.style.display = '';

      await continueToDealAfterPreDeal(gameCtx, {
        npcRecords: npcRecords,
        summaryDelayMs: 1500
      });
    });
  }

  async function dealFlop() {
    gameState.phase = 'flop';
    if (skillUI && typeof skillUI.onStreetStart === 'function') {
      skillUI.onStreetStart(gameState.phase, {
        phase: gameState.phase,
        players: gameState.players,
        pot: gameState.pot,
        board: (gameState.board || []).slice(),
        blinds: getBigBlind(),
        allIn: false
      });
    }
    if (runtimeFlow) {
      runtimeFlow.emit('table:street_start', {
        phase: gameState.phase,
        pot: gameState.pot,
        board: (gameState.board || []).slice()
      });
    }
    mentalSystem.resetRoundSkillUsage();
    if (skillUI.skillSystem && typeof skillUI.skillSystem.syncSealStates === 'function') {
      skillUI.skillSystem.syncSealStates(gameState.phase);
    }

    // 蒙特卡洛零模型：Flop 只筛选第3张牌
    // 前2张纯随机，防止雪崩效应（选K→选K→选K）
    // 第3张经过命运筛选，在已有2张随机牌的基础上微调命运
    var flopCard1 = getScriptedBoardCardCode('flop', 0);
    var flopCard2 = getScriptedBoardCardCode('flop', 1);
    await distributeCommunityCard(0, 0, flopCard1 ? pickSpecificCard(parseCardCode(flopCard1)) : null);
    await distributeCommunityCard(200, 1, flopCard2 ? pickSpecificCard(parseCardCode(flopCard2)) : null);
    
    const flopCard3 = mozSelectAndPick();   // 命运筛选
    await distributeCommunityCard(400, 2, flopCard3);
    
    logEvent('FLOP', { cards: cardsToString(gameState.board) });
    if (tutorialController && typeof tutorialController.onStreetDealt === 'function') {
      tutorialController.onStreetDealt('flop');
    }
    if (runtimeFlow) {
      runtimeFlow.emit('table:street_dealt', {
        phase: gameState.phase,
        pot: gameState.pot,
        board: (gameState.board || []).slice()
      });
    }
    
    // 🎯 检查是否所有人都 All-in → 暂停让玩家用技能
    if (isEveryoneAllIn()) {
      waitForPlayerThenAdvance(dealTurn, 'TURN');
      return;
    }
    
    // Post-flop从庄家后第一位开始（即SB位置，或Heads-Up中的BB）
    // 🛡️ 必须跳过已弃牌的玩家
    gameState.turnIndex = findFirstActivePlayer((gameState.dealerIndex + 1) % gameState.players.length);
    gameState.actionCount = 0;  // 重置行动计数
    
    setTimeout(nextTurn, 500);
  }

  async function dealTurn() {
    gameState.phase = 'turn';
    if (skillUI && typeof skillUI.onStreetStart === 'function') {
      skillUI.onStreetStart(gameState.phase, {
        phase: gameState.phase,
        players: gameState.players,
        pot: gameState.pot,
        board: (gameState.board || []).slice(),
        blinds: getBigBlind(),
        allIn: false
      });
    }
    if (runtimeFlow) {
      runtimeFlow.emit('table:street_start', {
        phase: gameState.phase,
        pot: gameState.pot,
        board: (gameState.board || []).slice()
      });
    }
    mentalSystem.resetRoundSkillUsage();
    if (skillUI.skillSystem && typeof skillUI.skillSystem.syncSealStates === 'function') {
      skillUI.skillSystem.syncSealStates(gameState.phase);
    }

    // 蒙特卡洛零模型：筛选 Turn 牌
    const turnSelected = mozSelectAndPick();
    await distributeCommunityCard(0, 3, turnSelected);
    
    const turnCard = gameState.board[3];
    logEvent('TURN', { card: cardToSolverString(turnCard), board: cardsToString(gameState.board) });
    if (tutorialController && typeof tutorialController.onStreetDealt === 'function') {
      tutorialController.onStreetDealt('turn');
    }
    if (runtimeFlow) {
      runtimeFlow.emit('table:street_dealt', {
        phase: gameState.phase,
        pot: gameState.pot,
        board: (gameState.board || []).slice()
      });
    }
    
    // 🎯 检查是否所有人都 All-in → 暂停让玩家用技能
    if (isEveryoneAllIn()) {
      waitForPlayerThenAdvance(dealRiver, 'RIVER');
      return;
    }
    
    // 🛡️ 必须跳过已弃牌的玩家
    gameState.turnIndex = findFirstActivePlayer((gameState.dealerIndex + 1) % gameState.players.length);
    gameState.actionCount = 0;  // 重置行动计数
    setTimeout(nextTurn, 500);
  }

  async function dealRiver() {
    gameState.phase = 'river';
    if (skillUI && typeof skillUI.onStreetStart === 'function') {
      skillUI.onStreetStart(gameState.phase, {
        phase: gameState.phase,
        players: gameState.players,
        pot: gameState.pot,
        board: (gameState.board || []).slice(),
        blinds: getBigBlind(),
        allIn: false
      });
    }
    if (runtimeFlow) {
      runtimeFlow.emit('table:street_start', {
        phase: gameState.phase,
        pot: gameState.pot,
        board: (gameState.board || []).slice()
      });
    }
    mentalSystem.resetRoundSkillUsage();
    if (skillUI.skillSystem && typeof skillUI.skillSystem.syncSealStates === 'function') {
      skillUI.skillSystem.syncSealStates(gameState.phase);
    }

    // 蒙特卡洛零模型：筛选 River 牌（最关键的一张）
    const riverSelected = mozSelectAndPick();
    await distributeCommunityCard(0, 4, riverSelected);
    
    const riverCard = gameState.board[4];
    logEvent('RIVER', { card: cardToSolverString(riverCard), board: cardsToString(gameState.board) });
    if (tutorialController && typeof tutorialController.onStreetDealt === 'function') {
      tutorialController.onStreetDealt('river');
    }
    if (runtimeFlow) {
      runtimeFlow.emit('table:street_dealt', {
        phase: gameState.phase,
        pot: gameState.pot,
        board: (gameState.board || []).slice()
      });
    }
    
    // 🎯 检查是否所有人都 All-in → 暂停让玩家用技能
    if (isEveryoneAllIn()) {
      waitForPlayerThenAdvance(showdown, 'SHOWDOWN');
      return;
    }
    
    // 🛡️ 必须跳过已弃牌的玩家
    gameState.turnIndex = findFirstActivePlayer((gameState.dealerIndex + 1) % gameState.players.length);
    gameState.actionCount = 0;  // 重置行动计数
    setTimeout(nextTurn, 500);
  }

  function showdown() {
    gameState.phase = 'showdown';
    if (runtimeFlow) {
      runtimeFlow.emit('table:showdown_start', {
        pot: gameState.pot,
        board: (gameState.board || []).slice()
      });
    }
    if (skillUI.skillSystem && typeof skillUI.skillSystem.syncSealStates === 'function') {
      skillUI.skillSystem.syncSealStates(gameState.phase);
    }
    setTurnIndicator(-1);
    enablePlayerControls(false);
    
    // 翻开所有AI的牌
    gameState.players.forEach(player => {
      if (player.type === 'ai' && player.isActive && !player.folded) {
        player.storyRevealed = true;
        player.cards.forEach(card => card.setSide('front'));
      }
    });
    
    setTimeout(determineWinner, 1000);
  }

  // ========== 对手建模广播 (Phase 7) ==========
  // 每次有玩家行动时，通知所有 pro/boss AI 的 OpponentModel
  function broadcastActionToModels(actorId, action, ctx) {
    gameState.players.forEach(p => {
      if (p.type !== 'ai' || !p.ai || !p.ai.opponentModel) return;
      if (p.id === actorId) return; // 不记录自己的动作
      p.ai.opponentModel.recordAction(actorId, action, ctx);
    });
  }

  // ========== FSM 事件触发 ==========
  // 每手结束后，根据结果向每个 AI 的 FSM 发送事件
  function fireFSMEvents(winnerIds, potWon) {
    const bb = getBigBlind();
    const isBigPot = potWon > bb * 10;

    gameState.players.forEach(p => {
      if (p.type !== 'ai' || !p.ai || !p.ai.fsm) return;

      const isWinner = winnerIds.indexOf(p.id) !== -1;

      if (isWinner) {
        p.ai.fsm.onEvent(isBigPot ? 'win_big' : 'win_normal', { pot: potWon, bb: bb });
      } else if (p.folded) {
        p.ai.fsm.onEvent('fold', {});
      } else {
        // 参与了摊牌但输了 — 检测 Bad Beat（翻前领先但输）
        // 简化判定：equity > 0.5 但输了 = bad beat
        let isBadBeat = false;
        if (p.cards && p.cards.length >= 2 && typeof EquityEstimator !== 'undefined') {
          try {
            const eq = EquityEstimator.estimate(p.cards, gameState.board || [], winnerIds.length, 100);
            isBadBeat = eq.equity > 0.55;
          } catch (e) { /* ignore */ }
        }
        p.ai.fsm.onEvent(isBadBeat ? 'bad_beat' : 'lose', {});
      }

      // 每手结束都检查筹码
      p.ai.fsm.onEvent('chip_check', { chips: p.chips });

      // 对手建模：记录每手结束
      if (p.ai.opponentModel) {
        gameState.players.forEach(other => {
          if (other.id !== p.id) {
            p.ai.opponentModel.recordHandEnd(other.id);
          }
        });
      }
    });
  }

  function endHandEarly() {
    const winner = getActivePlayers()[0];
    const potWon = gameState.pot + gameState.players.reduce((sum, p) => sum + p.currentBet, 0);

    winner.chips += potWon;
    gameState.pot = 0;
    gameState.players.forEach(p => p.currentBet = 0);
    
    // FSM 事件：所有弃牌者 + 赢家
    fireFSMEvents([winner.id], potWon);

    logEvent('RESULT', {
      winner: winner.name,
      potWon: potWon,
      reasonCode: 'all_folded',
      reason: 'All others folded'
    });
    
    _lastResultMsg = `${winner.name} wins ${Currency.compact(potWon)}`;
    updateMsg(`${winner.name} wins ${Currency.html(potWon)}!`);
    winner.seatElement.classList.add('winner');
    
    updateSeatDisplay(winner);
    updatePotDisplay();
    
    setTimeout(endGame, 2000);
  }

  function determineWinner() {
    const activePlayers = getActivePlayers();
    const boardStrings = gameState.board.map(cardToSolverString);
    
    const hands = activePlayers.map(player => {
      const playerStrings = player.cards.map(cardToSolverString);
      const hand = Hand.solve([...playerStrings, ...boardStrings]);
      return { player, hand };
    });
    
    // 记录showdown
    hands.forEach(({ player, hand }) => {
      logEvent('SHOWDOWN', {
        playerId: player.id,
        playerName: player.name,
        cards: cardsToString(player.cards),
        handDescr: hand.descr
      });
      
      const status = player.seatElement.querySelector('.seat-status');
      status.innerHTML = `<span class="state-action">${hand.descr}</span>`;
    });
    
    const allHands = hands.map(h => h.hand);
    const winners = Hand.winners(allHands);
    
    const winnerPlayers = hands.filter(h => winners.includes(h.hand)).map(h => h.player);
    if (runtimeFlow) {
      runtimeFlow.emit('table:showdown_resolved', {
        winners: winnerPlayers.map(function(p) { return p.id; }),
        board: (gameState.board || []).slice(),
        pot: gameState.pot
      });
    }
    const potWon = gameState.pot;
    const sharePerWinner = Math.floor(potWon / winnerPlayers.length);
    
    winnerPlayers.forEach(winner => {
      winner.chips += sharePerWinner;
      winner.seatElement.classList.add('winner');
      updateSeatDisplay(winner);
    });
    
    gameState.pot = 0;

    // FSM 事件：摊牌后所有 AI 收到结果
    fireFSMEvents(winnerPlayers.map(w => w.id), potWon);
    
    const winnerNames = winnerPlayers.map(w => w.name).join(', ');
    logEvent('RESULT', {
      winners: winnerNames,
      potWon: potWon,
      handDescr: winnerPlayers[0].seatElement.querySelector('.seat-status').textContent
    });
    
    const handDescr = winnerPlayers[0].seatElement.querySelector('.seat-status').textContent;
    if (winnerPlayers.length === 1) {
      _lastResultMsg = `${winnerNames} wins ${Currency.compact(potWon)}\n${handDescr}`;
      updateMsg(`${winnerNames} wins ${Currency.html(potWon)}!`);
    } else {
      _lastResultMsg = `Split pot: ${winnerNames}\n${Currency.compact(sharePerWinner)} each — ${handDescr}`;
      updateMsg(`Split pot: ${winnerNames} (${Currency.html(sharePerWinner)} each)`);
    }
    
    updatePotDisplay();
    if (tutorialController && typeof tutorialController.onShowdownResolved === 'function') {
      var intercepted = tutorialController.onShowdownResolved({
        hands: hands,
        winnerPlayers: winnerPlayers,
        board: (gameState.board || []).slice(),
        potWon: potWon,
        sharePerWinner: sharePerWinner
      });
      if (intercepted) return;
    }
    setTimeout(endGame, 3000);
  }

  function endGame() {
    gameState.phase = 'idle';
    if (runtimeFlow) {
      runtimeFlow.emit('table:showdown_end', {
        board: (gameState.board || []).slice(),
        pot: gameState.pot
      });
      runtimeFlow.emit('table:hand_end', {
        board: (gameState.board || []).slice(),
        pot: gameState.pot
      });
    }
    setTurnIndicator(-1);
    setGameActive(false);
    
    // 移除winner类
    gameState.players.forEach(p => {
      if (p.seatElement) {
        p.seatElement.classList.remove('winner');
      }
    });
    
    // 标记淘汰玩家（chips === 0）
    gameState.players.forEach(p => {
      if (p.chips <= 0 && p.isActive) {
        p.isActive = false;
        p.folded = true;
        gameLogger.log('ELIMINATED', { player: p.name });
        if (p.seatElement) {
          p.seatElement.classList.add('folded');
          const status = p.seatElement.querySelector('.seat-status');
          if (status) status.innerHTML = '<span class="state-alert">BUSTED</span>';
        }
      }
    });
    
    // 检查是否只剩一个有筹码的玩家（游戏结束）
    const alivePlayers = gameState.players.filter(p => p.chips > 0);
    if (alivePlayers.length <= 1) {
      const champion = alivePlayers[0];
      const champMsg = champion ? `${champion.name} wins the game!` : 'Game Over';
      if (champion) updateMsg(champMsg);
      showEndhandModal('GAME OVER', champMsg);
      if (tutorialController && typeof tutorialController.decorateEndhandModal === 'function') {
        tutorialController.decorateEndhandModal();
      }
      UI.btnDeal.disabled = false;
      return;
    }
    
    // 移动庄家按钮（跳过已淘汰的玩家）
    let nextDealer = (gameState.dealerIndex + 1) % gameState.players.length;
    let safety = 0;
    while (gameState.players[nextDealer].chips <= 0 && safety < gameState.players.length) {
      nextDealer = (nextDealer + 1) % gameState.players.length;
      safety++;
    }
    gameState.dealerIndex = nextDealer;
    
    UI.btnDeal.disabled = false;
    showEndhandModal('HAND COMPLETE', _lastResultMsg);
    if (tutorialController && typeof tutorialController.decorateEndhandModal === 'function') {
      tutorialController.decorateEndhandModal();
    }
  }

  // ========== 日志系统（委托给 GameLogger） ==========
  const gameLogger = new GameLogger();
  gameLogger.bindUI({
    panel: UI.gameLogPanel,
    content: UI.gameLogContent,
    btnCopy: UI.btnCopyLog,
    btnToggle: null  // 手动绑定 toggle，以便刷新内容
  });
  // LOG 按钮：打开时刷新内容 + context
  if (UI.btnToggleLog) {
    UI.btnToggleLog.addEventListener('click', function () {
      if (UI.gameLogPanel.style.display === 'none' || !UI.gameLogPanel.style.display) {
        showGameLog();
      } else {
        UI.gameLogPanel.style.display = 'none';
      }
    });
  }
  gameLogger.getGameSnapshot = function () {
    return {
      phase: gameState.phase,
      pot: gameState.pot,
      players: gameState.players.map(function (p) {
        return { name: p.name, chips: p.chips, currentBet: p.currentBet };
      })
    };
  };

  function logEvent(type, data) {
    gameLogger.log(type, data);
  }

  function buildLogContext() {
    var cfg = getEffectiveGameConfig();
    var maxPot = 0;
    gameLogger.entries.forEach(function (e) {
      if (e.pot > maxPot) maxPot = e.pot;
    });
    // 收集 mana 信息（使用真实 hero ID）
    var heroMana = skillSystem.getMana(getHeroIndex());

    // 计算 hero 资金变化
    var heroP = gameState.players.find(function(p) { return p.type === 'human'; });
    var heroEndChips = heroP ? heroP.chips : 0;
    var fundsDelta = heroEndChips - _heroStartChips;
    var heroConfig = cfg && cfg.hero ? cfg.hero : null;
    var heroVanguard = heroConfig && heroConfig.vanguard ? heroConfig.vanguard : null;

    return {
      playerCount: gameState.players.length,
      playerNames: gameState.players.map(function (p) { return p.name; }),
      majorRoles: collectMajorCharacterNames(),
      heroDisplayName: cfg && cfg.heroDisplayName ? cfg.heroDisplayName : '',
      heroVanguardName: heroVanguard && heroVanguard.name ? heroVanguard.name : '',
      heroVanguardDisplayName: heroVanguard && heroVanguard.displayName ? heroVanguard.displayName : '',
      heroVanguardRoleId: heroVanguard && heroVanguard.roleId ? heroVanguard.roleId : '',
      players: gameState.players.map(function (p) {
        return {
          name: p.name,
          chips: p.chips,
          isHero: p.type === 'human',
          cardsStr: p.cards && p.cards.length > 0 ? cardsToString(p.cards) : '[unknown]'
        };
      }),
      boardStr: cardsToString(gameState.board),
      initialChips: getInitialChips(),
      smallBlind: getSmallBlind(),
      bigBlind: getBigBlind(),
      maxPot: maxPot,
      heroMana: heroMana,
      fundsDelta: fundsDelta,
      fundsUp: fundsDelta > 0 ? fundsDelta : 0,
      fundsDown: fundsDelta < 0 ? -fundsDelta : 0
    };
  }

  function showGameLog() {
    gameLogger.show(buildLogContext());
  }

  function fitTableToScreen() {
    const stage = document.getElementById('game-stage');
    const table = document.getElementById('poker-table');
    if (!stage || !table) return;

    const stageW = 1100;
    const stageH = 850;
    const stageScale = Math.min(
      (window.innerWidth - 20) / stageW,
      (window.innerHeight - 20) / stageH,
      1
    );
    const safeStageScale = Number.isFinite(stageScale) ? stageScale : 1;
    document.documentElement.style.setProperty('--game-stage-scale', safeStageScale.toFixed(4));

    table.style.transform = 'translate(-50%, -50%)';
  }

  // ========== 技能系统 UI（已迁移到 skill-ui.js） ==========
  // 所有技能UI逻辑由 skillUI 实例管理，不再硬编码。

  // ========== 心理战技能激活 ==========
  let _mentalTargetHandlers = null;

  function activateMentalSkill(skillKey) {
    const heroPlayer = gameState.players.find(p => p.type === 'human');
    if (!heroPlayer) return;

    // 检查是否已使用
    if (!mentalSystem.canUseMentalSkill(heroPlayer.id)) {
      updateMsg('本轮已使用心理战技能');
      return;
    }

    const skillDef = {
      presence: { basePower: 18, equityBias: -15, type: 'presence' },
      taunt: { basePower: 18, equityBias: 15, type: 'taunt' },
      probe: { basePower: 15, confidenceDelta: -30, type: 'probe' },
      center_self: { baseRecover: 20, confidenceDelta: 20, clearBias: true }
    }[skillKey];

    if (!skillDef) return;

    // 定神：直接激活
    if (skillKey === 'center_self') {
      const result = mentalSystem.applyRecover(heroPlayer.id, skillDef.baseRecover, skillDef.confidenceDelta, skillDef.clearBias);
      if (result) {
        mentalSystem.markSkillUsed(heroPlayer.id);
        gameLogger.log('MENTAL_RECOVER', { playerName: heroPlayer.name, skill: '定神', recover: result.recover, newComposure: result.newComposure });
        updateMsg('定神 +' + result.recover + ' → ' + result.newComposure);
        updateSeatDisplay(heroPlayer);
        if (tutorialController && typeof tutorialController.onMentalApplied === 'function') {
          tutorialController.onMentalApplied({
            skillKey: skillKey,
            targetId: heroPlayer.id,
            result: result
          });
        }
      }
      return;
    }

    // 压场/挑衅/试探：选择目标
    if (_mentalTargetHandlers) {
      cleanupMentalTarget();
      updateMsg('已取消');
      return;
    }

    const targets = gameState.players.filter(p => p.type === 'ai' && p.isActive && !p.folded);
    if (targets.length === 0) {
      updateMsg('没有可选目标');
      return;
    }

    if (targets.length === 1) {
      applyMentalToTarget(heroPlayer.id, targets[0].id, skillKey, skillDef, 1.0);
      return;
    }

    updateMsg('选择目标');
    _mentalTargetHandlers = [];

    // 添加全场压制按钮
    const aoeBtn = document.createElement('button');
    aoeBtn.innerHTML = '▤ OVERRIDE: 全场压制 ▤';
    aoeBtn.className = 'btn-mental-aoe';
    document.body.appendChild(aoeBtn);
    const aoeHandler = () => {
      cleanupMentalTarget();
      applyMentalAOE(heroPlayer.id, targets, skillKey, skillDef);
    };
    aoeBtn.addEventListener('click', aoeHandler);
    _mentalTargetHandlers.push({ el: aoeBtn, handler: aoeHandler });

    targets.forEach(target => {
      const seatEl = document.getElementById('seat-' + target.id);
      if (!seatEl) return;
      seatEl.classList.add('peek-targetable');
      const handler = () => {
        cleanupMentalTarget();
        applyMentalToTarget(heroPlayer.id, target.id, skillKey, skillDef, 1.0);
      };
      seatEl.addEventListener('click', handler);
      _mentalTargetHandlers.push({ el: seatEl, handler });
    });
  }

  function applyMentalToTarget(userId, targetId, skillKey, skillDef, multiplier) {
    const basePower = skillDef.basePower * multiplier;
    const result = mentalSystem.applyPressure(userId, targetId, skillDef.type, basePower, skillDef.equityBias || 0, skillDef.confidenceDelta || 0);
    if (result) {
      mentalSystem.markSkillUsed(userId);
      const user = gameState.players.find(p => p.id === userId);
      const target = gameState.players.find(p => p.id === targetId);
      const targetName = target?.name || 'Target';
      const skillNames = { presence: '压场', taunt: '挑衅', probe: '试探' };
      const effectTexts = { none: '完全无效', weak: '效果微弱', effective: '起效了', excellent: '效果拔群' };
      const stateNames = { stable: '稳定', shaken: '动摇', unsteady: '失衡', broken: '崩拍' };
      const critText = result.isCrit ? ' 暴击!' : '';
      gameLogger.log('MENTAL_PRESSURE', { playerName: user?.name || 'Player', targetName: targetName, skill: skillNames[skillKey] || skillKey, effect: effectTexts[result.effectLevel], state: stateNames[result.state], prevState: stateNames[result.prevState], crit: result.isCrit });
      updateMsg((skillNames[skillKey] || skillKey) + ' → ' + targetName + ' ' + effectTexts[result.effectLevel] + critText);
      if (target) updateSeatDisplay(target);
      if (tutorialController && typeof tutorialController.onMentalApplied === 'function') {
        tutorialController.onMentalApplied({
          skillKey: skillKey,
          targetId: targetId,
          result: result
        });
      }
    }
  }

  function applyMentalAOE(userId, targets, skillKey, skillDef) {
    mentalSystem.markSkillUsed(userId);
    const results = [];
    targets.forEach(target => {
      const basePower = skillDef.basePower * 0.5;
      const result = mentalSystem.applyPressure(userId, target.id, skillDef.type, basePower, skillDef.equityBias || 0, skillDef.confidenceDelta || 0);
      if (result) results.push({ name: target.name, effect: result.effectLevel });
    });
    const user = gameState.players.find(p => p.id === userId);
    const skillNames = { presence: '压场', taunt: '挑衅', probe: '试探' };
    const effectTexts = { none: '无效', weak: '微弱', effective: '有效', excellent: '拔群' };
    const summary = results.map(r => r.name + ':' + effectTexts[r.effect]).join(', ');
    gameLogger.log('MENTAL_AOE', { playerName: user?.name || 'Player', skill: skillNames[skillKey] || skillKey, summary: summary });
    updateMsg((skillNames[skillKey] || skillKey) + ' 全场压制');
    targets.forEach(target => updateSeatDisplay(target));
  }

  function cleanupMentalTarget() {
    if (_mentalTargetHandlers) {
      _mentalTargetHandlers.forEach(h => {
        h.el.classList.remove('peek-targetable');
        h.el.removeEventListener('click', h.handler);
        if (h.el.classList.contains('btn-mental-aoe')) {
          h.el.remove();
        }
      });
      _mentalTargetHandlers = null;
    }
  }

  // 更新胜率显示
  function updateEquityDisplay() {
    const hero = gameState.players.find(p => p.type === 'human');
    const container = document.getElementById('mental-equity-display');
    if (hero && hero.cards.length === 2 && container) {
      const opponents = gameState.players.filter(p => p.id !== hero.id && p.isActive && !p.folded).length;
      const result = EquityEstimator.estimate(hero.cards, gameState.board, opponents, 100);
      const equityData = mentalSystem.calculateDisplayEquity(hero.id, result.equity);
      if (equityData.mode === 'truth') {
        container.textContent = (equityData.value * 100).toFixed(1) + '%';
      } else {
        const minPct = Math.round(equityData.min * 100);
        const maxPct = Math.round(equityData.max * 100);
        container.textContent = minPct + '~' + maxPct + '%';
      }
    }
  }

  // AI心理战技能决策
  function aiConsiderMentalSkill(player) {
    if (!mentalSystem.canUseMentalSkill(player.id)) return;

    const difficulty = player.difficulty || 'regular';
    if (difficulty === 'noob') return;

    const useChance = { regular: 0.25, pro: 0.6, boss: 0.75 }[difficulty] || 0.25;
    if (Math.random() > useChance) return;

    const mental = mentalSystem.getPlayerMental(player.id);
    const composureRatio = mental.composure / mental.composureMax;
    const pressureTotal = (mental.pressureStack.presence || 0)
      + (mental.pressureStack.taunt || 0)
      + (mental.pressureStack.probe || 0);
    const confidenceLow = (mental.confidenceLevel || 100) <= (difficulty === 'boss' ? 65 : 55);
    const hasBias = (mental.equityBias || 0) !== 0;
    let shouldRecover = false;

    if (difficulty === 'regular') {
      shouldRecover = composureRatio < 0.25 ||
        (composureRatio < 0.4 && hasBias && Math.random() < 0.4);
    } else if (difficulty === 'pro') {
      shouldRecover = composureRatio < 0.28 ||
        (composureRatio < 0.48 && (pressureTotal >= 18 || hasBias || confidenceLow) && Math.random() < 0.7);
    } else if (difficulty === 'boss') {
      shouldRecover = composureRatio < 0.32 ||
        (composureRatio < 0.58 && (pressureTotal >= 12 || hasBias || confidenceLow) && Math.random() < 0.8);
    }

    // 定神：pro/boss 更懂得在压力累积或感知偏移时主动稳心，但不会无脑每次都交
    if (shouldRecover) {
      const result = mentalSystem.applyRecover(player.id, 20, 20, true);
      mentalSystem.markSkillUsed(player.id);
      gameLogger.log('MENTAL_RECOVER', { playerName: player.name, skill: '定神', recover: result.recover, newComposure: result.newComposure });
      updateMsg(player.name + ' 使用 定神');
      updateSeatDisplay(player);
      return;
    }

    const targets = gameState.players.filter(p => p.id !== player.id && p.isActive && !p.folded);
    if (targets.length === 0) return;

    const target = targets[Math.floor(Math.random() * targets.length)];
    const aiType = player.ai ? player.ai.riskType : 'balanced';

    // 根据AI性格选择技能
    let skillType = 'probe';
    let skillName = '试探';
    if (aiType === 'aggressive') {
      skillType = Math.random() > 0.3 ? 'taunt' : 'probe';
      skillName = skillType === 'taunt' ? '挑衅' : '试探';
    } else if (aiType === 'passive') {
      skillType = Math.random() > 0.3 ? 'presence' : 'probe';
      skillName = skillType === 'presence' ? '压场' : '试探';
    }

    const skillDef = {
      presence: { type: 'presence', basePower: 18, equityBias: -15 },
      taunt: { type: 'taunt', basePower: 18, equityBias: 15 },
      probe: { type: 'probe', basePower: 15, confidenceDelta: -30 }
    }[skillType];

    const result = mentalSystem.applyPressure(player.id, target.id, skillDef.type, skillDef.basePower, skillDef.equityBias || 0, skillDef.confidenceDelta || 0);
    mentalSystem.markSkillUsed(player.id);
    const effectTexts = { none: '完全无效', weak: '效果微弱', effective: '起效了', excellent: '效果拔群' };
    const stateNames = { stable: '稳定', shaken: '动摇', unsteady: '失衡', broken: '崩拍' };
    const critText = result.isCrit ? ' 暴击!' : '';
    gameLogger.log('MENTAL_PRESSURE', { playerName: player.name, targetName: target.name, skill: skillName, effect: effectTexts[result.effectLevel], state: stateNames[result.state], prevState: stateNames[result.prevState], crit: result.isCrit });
    updateMsg(player.name + ' 对 ' + target.name + ' 使用 ' + skillName + ' → ' + effectTexts[result.effectLevel] + critText);
    updateSeatDisplay(target);
  }

  // ========== 事件绑定 ==========
  UI.btnDeal.addEventListener('click', startNewGame);
  UI.btnFold.addEventListener('click', playerFold);
  UI.btnCheckCall.addEventListener('click', playerCheckCall);
  UI.btnRaise.addEventListener('click', playerRaise);
  UI.btnConfirmRaise.addEventListener('click', confirmRaise);
  if (UI.btnCancelRaise) UI.btnCancelRaise.addEventListener('click', hideRaiseControls);
  if (UI.raiseBackdrop) UI.raiseBackdrop.addEventListener('click', hideRaiseControls);
  // copyGameLog / toggleLogPanel 已由 gameLogger.bindUI 绑定

  // 心理战技能按钮
  document.getElementById('btn-mental-toggle').addEventListener('click', function() {
    const skillsPanel = document.getElementById('mental-skills');
    skillsPanel.style.display = skillsPanel.style.display === 'none' ? 'flex' : 'none';
    if (tutorialController && typeof tutorialController.onMentalToggle === 'function') {
      tutorialController.onMentalToggle();
    }
  });

  ['presence', 'taunt', 'probe', 'center_self'].forEach(function(skillKey) {
    var btn = document.getElementById('btn-' + skillKey.replace('_', '-'));
    if (btn) {
      btn.addEventListener('click', function() {
        activateMentalSkill(skillKey);
        document.getElementById('mental-skills').style.display = 'none';
      });
    }
  });

  // 技能按钮由 skillUI._buildSkillButtons 自动生成和绑定
  
  UI.raiseSlider.addEventListener('input', function() {
    syncRaiseAmountDisplay(this.value);
  });
  if (UI.btnRaiseMinus) UI.btnRaiseMinus.addEventListener('click', function() { nudgeRaiseSlider(-1); });
  if (UI.btnRaisePlus) UI.btnRaisePlus.addEventListener('click', function() { nudgeRaiseSlider(1); });

  Array.prototype.forEach.call(document.querySelectorAll(RAISE_PRESET_SELECTOR), function(btn) {
    btn.addEventListener('click', function() {
      applyRaisePreset(btn.getAttribute('data-raise-preset'));
    });
  });

  bindRaiseSliderGestures();


  UI.btnForceNext.addEventListener('click', () => {
    if (gameState.phase !== 'idle') {
      endBettingRound();
    }
  });

  window.addEventListener('resize', fitTableToScreen);

  // ========== 配置加载 ==========
  async function loadConfig() {
    // 如果外部配置（postMessage）已经到达，跳过静态文件加载
    if (_externalConfigApplied) {
      console.log('[CONFIG] 外部配置已存在，跳过 game-config.json 加载');
      return;
    }

    // 在 iframe 中运行时，配置始终由主引擎通过 postMessage 提供
    // 不自己 fetch game-config.json，避免竞争
    if (window.parent && window.parent !== window) {
      console.log('[CONFIG] 在 iframe 中运行，等待主引擎 postMessage 配置');
      return;
    }

    // 独立运行时：加载同构的本地 game-config.json；正常 App/STver 模式由 apps/game 统一注入。
    const configPaths = ['../../../content/game-config.json', 'game-config.json'];
    
    for (const path of configPaths) {
      if (_externalConfigApplied) return;
      try {
        const response = await fetch(path);
        if (_externalConfigApplied) return;
        if (response.ok) {
          gameConfig = await response.json();
          gameConfig = await maybeResolveTutorialConfig(gameConfig);
          _configSource = 'static';
          console.log('[CONFIG] 从', path, '加载:', gameConfig);
          if (window.AceRuntimeAPI &&
              window.AceBuiltinModules &&
              typeof window.AceBuiltinModules.registerBuiltinRoleModules === 'function') {
            window.AceBuiltinModules.registerBuiltinRoleModules(window.AceRuntimeAPI);
          }
          return;
        }
      } catch (e) { /* try next */ }
    }
    
    console.log('[CONFIG] 使用默认内置配置');
  }

  /**
   * 应用外部注入的配置（从主引擎 postMessage 到达）
   * @param {Object} config - 注入的配置对象
   */
  async function applyExternalConfig(config, source) {
    if (!config) return;
    source = source || 'static';
    // 已有配置 → 如果已经是 injected，拒绝任何重复；
    // 如果之前是 static，允许 injected 覆盖
    if (_externalConfigApplied) {
      if (_configSource === 'injected' || source !== 'injected') {
        console.log('[CONFIG] 配置已应用，忽略重复 [' + source + ']');
        return;
      }
      console.log('[CONFIG] injected 配置覆盖之前的 static 配置');
    }
    gameConfig = await maybeResolveTutorialConfig(config);
    _externalConfigApplied = true;
    _configSource = source;
    console.log('[CONFIG] 外部配置已应用 [' + source + ']:', gameConfig);
    if (window.AceRuntimeAPI &&
        window.AceBuiltinModules &&
        typeof window.AceBuiltinModules.registerBuiltinRoleModules === 'function') {
      window.AceBuiltinModules.registerBuiltinRoleModules(window.AceRuntimeAPI);
    }
    refreshTutorialController();
  }

  // ========== postMessage 监听 ==========
  // 接收来自主引擎 (index.html) 的配置数据
  window.addEventListener('message', function (event) {
    const msg = event?.data;
    if (!msg || msg.type !== 'acezero-game-data') return;
    const source = msg.source || 'static';
    console.log('[CONFIG] 收到主引擎 postMessage 配置 [' + source + ']');
    void applyExternalConfig(msg.payload, source);
  });

  // 主动向父窗口请求配置
  function requestConfigFromEngine() {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'acezero-data-request' }, '*');
    }
  }

  // ========== 等待 RPG 模块就绪 ==========
  function waitForRPG() {
    if (window.__rpgReady) return Promise.resolve();
    return new Promise(function (resolve) {
      window.addEventListener('rpg:ready', resolve, { once: true });
      // 安全超时：2秒后即使 RPG 没加载也继续（降级运行）
      setTimeout(function () {
        if (!window.__rpgReady) {
          console.warn('[INIT] RPG 模块未在 2s 内加载，降级运行');
        }
        resolve();
      }, 2000);
    });
  }

  // ========== 初始化 ==========
  async function init() {
    await waitForRPG();
    await loadConfig();
    refreshTutorialController();
    initTable();
    enablePlayerControls(false);
    updatePotDisplay();
    fitTableToScreen();

    // 如果在 iframe 中，主动请求配置
    requestConfigFromEngine();
  }
  
  init();
})();
