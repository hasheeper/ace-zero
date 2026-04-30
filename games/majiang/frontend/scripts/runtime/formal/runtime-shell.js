(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.AceMahjongCreateBrowserFormalRuntimeInitialization = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const CANONICAL_SEAT_KEYS = ['bottom', 'right', 'top', 'left'];

  function getBoardSeatOrder(runtime) {
    const activeSeats = runtime && Array.isArray(runtime.activeSeats) ? runtime.activeSeats.slice() : [];
    if (!activeSeats.length) return CANONICAL_SEAT_KEYS.slice();
    const rotation = Number(runtime && runtime.round ? runtime.round.qijia || 0 : 0)
      + Number(runtime && runtime.round ? runtime.round.jushu || 0 : 0);
    const offset = ((rotation % activeSeats.length) + activeSeats.length) % activeSeats.length;
    return activeSeats.slice(offset).concat(activeSeats.slice(0, offset));
  }

  function buildExpandedBoardValues(boardSeatOrder, seatValues = new Map(), fallbackValue = '') {
    const values = Array.from({ length: 4 }, () => (typeof fallbackValue === 'function' ? fallbackValue() : fallbackValue));
    boardSeatOrder.forEach((seatKey, boardIndex) => {
      values[boardIndex] = seatValues.has(seatKey)
        ? seatValues.get(seatKey)
        : (typeof fallbackValue === 'function' ? fallbackValue(seatKey, boardIndex) : fallbackValue);
    });
    return values;
  }

  function createBrowserFormalRuntimeInitialization() {
    function createRuntimeShell(normalizedConfig, deps = {}) {
      const runtime = {
        kind: 'formal-browser-runtime-adapter',
        source: 'browser-formal-runtime',
        engineSource: 'majiang-core',
        mode: normalizedConfig.mode || 'single-round',
        config: normalizedConfig,
        rulesetProfile: normalizedConfig.rulesetProfile,
        customRuleConfig: normalizedConfig.customRuleConfig || { shibariMinYakuHan: 1 },
        topology: normalizedConfig.topology,
        testing: normalizedConfig.testing || {},
        activeSeats: normalizedConfig.topology.activeSeats.slice(),
        playerSeatOrder: normalizedConfig.topology.activeSeats.slice(),
        rule: deps.createRule(normalizedConfig.ruleOverrides || {}),
        round: Object.assign(deps.createDefaultRound(normalizedConfig.rulesetProfile, normalizedConfig.topology), normalizedConfig.round || {}),
        seatMeta: Object.assign({}, deps.createDefaultSeatMeta(), normalizedConfig.round.seatMeta || {}),
        listeners: new Set(),
        lastEvent: null,
        eventLog: [],
        actionWindow: null,
        phase: deps.FORMAL_PHASES.AWAIT_DRAW,
        pendingRiichi: false,
        riichiState: deps.createInitialRiichiState(),
        turnState: deps.createInitialTurnState(),
        furitenState: deps.createInitialFuritenState(),
        declaredNoDaopaiSeats: [],
        turnCounter: 0,
        doubleRiichiWindowOpen: true,
        pendingReaction: null,
        pendingKanResolution: null,
        pendingSupplementDrawType: null,
        roundResult: null,
        autoTurnTimer: 0
      };

      runtime.turnSeat = runtime.activeSeats[0] || 'bottom';
      runtime.drawPolicy = deps.createConfiguredDrawPolicy(normalizedConfig);
      runtime.wallService = deps.createWallService({
        rule: runtime.rule,
        ruleset: normalizedConfig.ruleset,
        tableSize: normalizedConfig.topology.tableSize,
        topology: normalizedConfig.topology,
        drawPolicy: runtime.drawPolicy
      });

      return runtime;
    }

    function initializeRoundState(runtime, config = {}, deps = {}) {
      const initialRoundData = config.round && config.round.usePresetDeal
        ? deps.buildPresetRoundData(runtime.round, runtime.activeSeats)
        : runtime.wallService.dealInitialHands({
            seatCount: runtime.activeSeats.length,
            context: {
              round: {
                title: runtime.round.title,
                qijia: runtime.round.qijia,
                zhuangfeng: runtime.round.zhuangfeng,
                jushu: runtime.round.jushu
              }
            }
          });

      const scoreBySeat = new Map();
      runtime.activeSeats.forEach((seatKey, seatIndex) => {
        const playerConfig = Array.isArray(runtime.config.players)
          ? runtime.config.players.find((player) => player && player.seat === seatKey)
          : null;
        if (playerConfig && Number.isFinite(Number(playerConfig.score))) {
          scoreBySeat.set(seatKey, Number(playerConfig.score));
          return;
        }
        const roundScore = Array.isArray(runtime.round.defen) ? runtime.round.defen[seatIndex] : null;
        scoreBySeat.set(
          seatKey,
          Number.isFinite(Number(roundScore)) ? Number(roundScore) : runtime.rulesetProfile.startingScore
        );
      });
      const handBySeat = new Map();
      runtime.activeSeats.forEach((seatKey, seatIndex) => {
        handBySeat.set(seatKey, Array.isArray(initialRoundData.shoupai) ? initialRoundData.shoupai[seatIndex] || '' : '');
      });
      const boardSeatOrder = getBoardSeatOrder(runtime);
      const expandedShoupai = buildExpandedBoardValues(boardSeatOrder, handBySeat, '');
      const boardDefen = buildExpandedBoardValues(boardSeatOrder, scoreBySeat, 0);
      const identityScores = runtime.playerSeatOrder.map((seatKey) => scoreBySeat.get(seatKey) || runtime.rulesetProfile.startingScore);

      runtime.round.player = runtime.activeSeats.map((seatKey) => (
        runtime.seatMeta[seatKey] && runtime.seatMeta[seatKey].name ? runtime.seatMeta[seatKey].name : seatKey
      ));
      runtime.round.shoupai = expandedShoupai;
      runtime.round.baopai = initialRoundData.baopai;
      runtime.round.defen = runtime.activeSeats.map((seatKey) => scoreBySeat.get(seatKey) || runtime.rulesetProfile.startingScore);
      runtime.initialRoundData = initialRoundData;

      runtime.board = deps.createBoard({
        title: runtime.round.title,
        player: runtime.round.player,
        qijia: runtime.round.qijia
      });

      runtime.board.qipai({
        zhuangfeng: runtime.round.zhuangfeng,
        jushu: runtime.round.jushu,
        changbang: runtime.round.changbang,
        lizhibang: runtime.round.lizhibang,
        defen: boardDefen,
        baopai: runtime.round.baopai,
        shoupai: expandedShoupai
      });
      if (runtime.topology && runtime.topology.tableSize === 3) {
        runtime.board.player_id = boardSeatOrder
          .map((seatKey) => runtime.playerSeatOrder.indexOf(seatKey))
          .concat([3]);
        runtime.board.defen = identityScores.concat([0]);
      }
      runtime.board.shan = runtime.wallService.shan;
      runtime.turnSeat = boardSeatOrder[0] || runtime.turnSeat;

      runtime.presentation = {
        tableSize: runtime.topology.tableSize,
        activeSeats: runtime.activeSeats.slice(),
        hiddenSeats: runtime.topology.hiddenSeats.slice(),
        ruleset: runtime.round.ruleset || runtime.config.ruleset || runtime.rulesetProfile.id,
        uiMode: runtime.round.uiMode || runtime.rulesetProfile.uiMode,
        tableLayout: runtime.round.tableLayout || runtime.rulesetProfile.tableLayout,
        advancedMode: Boolean(runtime.round.advancedMode),
        centerRiichiVisible: typeof runtime.round.centerRiichiVisible === 'boolean'
          ? runtime.round.centerRiichiVisible
          : Boolean(runtime.round.advancedMode),
        centerDoraVisible: typeof runtime.round.centerDoraVisible === 'boolean'
          ? runtime.round.centerDoraVisible
          : Boolean(runtime.round.advancedMode),
        centerKitaVisible: typeof runtime.round.centerKitaVisible === 'boolean'
          ? runtime.round.centerKitaVisible
          : Boolean(runtime.round.uiMode === 'sanma' || runtime.topology.tableSize === 3),
        view: {
          is25d: true,
          hideZones: true
        }
      };

      return runtime;
    }

    return {
      createRuntimeShell,
      initializeRoundState
    };
  }

  return createBrowserFormalRuntimeInitialization;
});
