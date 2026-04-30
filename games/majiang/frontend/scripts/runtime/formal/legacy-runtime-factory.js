(function(global) {
  'use strict';

  const browserCore = global.AceMahjongBrowserCoreAdapter;
  const rulesetProfileApi = global.AceMahjongRulesetProfile || null;
  const actionBuilderApi = global.AceMahjongActionBuilder || null;
  const createRuntimeViewBuilder = global.AceMahjongCreateRuntimeViewBuilder || null;

  if (!browserCore) {
    throw new Error('AceMahjongBrowserCoreAdapter is required before browser-legacy-runtime-factory.js');
  }
  if (typeof createRuntimeViewBuilder !== 'function') {
    throw new Error('AceMahjongCreateRuntimeViewBuilder is required before browser-legacy-runtime-factory.js');
  }

  const CANONICAL_SEAT_KEYS = ['bottom', 'right', 'top', 'left'];
  const seatTopologyApi = global.AceMahjongSeatTopology && typeof global.AceMahjongSeatTopology.createSeatTopology === 'function'
    ? global.AceMahjongSeatTopology
    : {
        createSeatTopology(options = {}) {
          const tableSize = Number(options.tableSize) === 2 || Number(options.tableSize) === 3 || Number(options.tableSize) === 4
            ? Number(options.tableSize)
            : 4;
          const activeSeats = tableSize === 2
            ? ['bottom', 'top']
            : tableSize === 3
              ? ['bottom', 'right', 'left']
              : CANONICAL_SEAT_KEYS.slice();
          return {
            tableSize,
            activeSeats,
            hiddenSeats: CANONICAL_SEAT_KEYS.filter((seatKey) => !activeSeats.includes(seatKey)),
            canonicalSeats: CANONICAL_SEAT_KEYS.slice(),
            isActiveSeat(seatKey) {
              return activeSeats.includes(seatKey);
            },
            getNextSeat(seatKey) {
              const currentIndex = activeSeats.indexOf(seatKey);
              if (currentIndex < 0) return activeSeats[0] || 'bottom';
              return activeSeats[(currentIndex + 1) % activeSeats.length] || activeSeats[0] || 'bottom';
            }
          };
        }
      };
  const TILE_ASSET_MAP = {
    m: { '0': 'Man5-Dora', '1': 'Man1', '2': 'Man2', '3': 'Man3', '4': 'Man4', '5': 'Man5', '6': 'Man6', '7': 'Man7', '8': 'Man8', '9': 'Man9' },
    p: { '0': 'Pin5-Dora', '1': 'Pin1', '2': 'Pin2', '3': 'Pin3', '4': 'Pin4', '5': 'Pin5', '6': 'Pin6', '7': 'Pin7', '8': 'Pin8', '9': 'Pin9' },
    s: { '0': 'Sou5-Dora', '1': 'Sou1', '2': 'Sou2', '3': 'Sou3', '4': 'Sou4', '5': 'Sou5', '6': 'Sou6', '7': 'Sou7', '8': 'Sou8', '9': 'Sou9' },
    z: { '1': 'Ton', '2': 'Nan', '3': 'Shaa', '4': 'Pei', '5': 'Haku', '6': 'Hatsu', '7': 'Chun' }
  };
  const TILE_LABEL_MAP = {
    m: { '0': '赤五万', '1': '一万', '2': '二万', '3': '三万', '4': '四万', '5': '五万', '6': '六万', '7': '七万', '8': '八万', '9': '九万' },
    p: { '0': '赤五筒', '1': '一筒', '2': '二筒', '3': '三筒', '4': '四筒', '5': '五筒', '6': '六筒', '7': '七筒', '8': '八筒', '9': '九筒' },
    s: { '0': '赤五索', '1': '一索', '2': '二索', '3': '三索', '4': '四索', '5': '五索', '6': '六索', '7': '七索', '8': '八索', '9': '九索' },
    z: { '1': '东', '2': '南', '3': '西', '4': '北', '5': '白', '6': '发', '7': '中' }
  };
  const BROWSER_RUNTIME_PHASES = Object.freeze({
    AWAIT_DRAW: 'await_draw',
    AWAIT_DISCARD: 'await_discard',
    AWAIT_REACTION: 'await_reaction',
    AWAIT_RESOLUTION: 'await_resolution',
    ROUND_END: 'round_end'
  });

  function getTileAsset(code) {
    if (!code || code === '_') return null;
    return TILE_ASSET_MAP[code[0]] ? TILE_ASSET_MAP[code[0]][code[1]] || null : null;
  }

  function getTileLabel(code) {
    if (!code || code === '_') return '暗牌';
    return TILE_LABEL_MAP[code[0]] ? TILE_LABEL_MAP[code[0]][code[1]] || code : code;
  }

  function toFrontendTile(code, options) {
    const opts = options || {};
    return {
      code: code || null,
      asset: getTileAsset(code),
      label: opts.label || getTileLabel(code),
      kind: opts.kind || 'flat',
      hidden: Boolean(opts.hidden),
      extraClass: opts.extraClass || ''
    };
  }

  function getRulesetProfile(input = {}) {
    if (rulesetProfileApi && typeof rulesetProfileApi.getRulesetProfile === 'function') {
      return rulesetProfileApi.getRulesetProfile(input);
    }
    const tableSize = Number(input.tableSize || 4) || 4;
    return {
      id: typeof input.id === 'string' && input.id ? input.id : `riichi-${tableSize}p`,
      seatCount: tableSize,
      tableSize,
      handSize: 13,
      deadWallSize: 14,
      enableChi: true,
      enablePeng: true,
      enableGang: true,
      enableRiichi: true,
      startingScore: 25000,
      targetScore: 30000,
      tableLayout: tableSize === 3 ? '3p-rounded-triangle' : '4p-octagon',
      uiMode: tableSize === 3 ? 'sanma' : 'standard'
    };
  }

  function createNormalizedActionWindow(actionWindow) {
    if (actionBuilderApi && typeof actionBuilderApi.createActionWindow === 'function') {
      return actionBuilderApi.createActionWindow(actionWindow);
    }
    return actionWindow ? clone(actionWindow) : null;
  }

  function getShoupaiTiles(shoupai) {
    if (!shoupai || !shoupai._bingpai) return [];

    const tiles = [];
    const suits = ['m', 'p', 's', 'z'];

    suits.forEach((suit) => {
      const bingpai = shoupai._bingpai[suit];
      if (!bingpai) return;
      let redCount = suit === 'z' ? 0 : bingpai[0];

      for (let value = 1; value < bingpai.length; value += 1) {
        let tileCount = bingpai[value];
        if (shoupai._zimo) {
          if (`${suit}${value}` === shoupai._zimo) tileCount -= 1;
          if (value === 5 && `${suit}0` === shoupai._zimo) {
            tileCount -= 1;
            redCount -= 1;
          }
        }

        for (let index = 0; index < tileCount; index += 1) {
          if (value === 5 && redCount > 0) {
            tiles.push({ code: `${suit}0`, hidden: false });
            redCount -= 1;
          } else {
            tiles.push({ code: `${suit}${value}`, hidden: false });
          }
        }
      }
    });

    const hiddenCount = (shoupai._bingpai._ || 0) + (shoupai._zimo === '_' ? -1 : 0);
    for (let index = 0; index < hiddenCount; index += 1) {
      tiles.push({ code: '_', hidden: true });
    }

    if (shoupai._zimo && shoupai._zimo.length <= 2) {
      tiles.push({
        code: shoupai._zimo,
        hidden: shoupai._zimo === '_'
      });
    }

    return tiles;
  }

  function extractMelds(shoupai) {
    return (shoupai._fulou || []).map((meld) => {
      const normalized = browserCore.validateMeldString(meld);
      if (!normalized) return { type: 'chi', source: 'right', tiles: [] };
      const suit = normalized[0];
      const sourceChar = (normalized.match(/[\+\=\-]/) || [''])[0];
      const sourceMap = { '+': 'left', '=': 'across', '-': 'right' };
      const source = sourceMap[sourceChar] || 'right';
      const digits = normalized.match(/\d/g) || [];
      const normalizedDigits = normalized.replace(/0/g, '5').match(/\d/g) || [];
      let type = 'chi';
      if (digits.length === 4) type = sourceChar ? 'kan-open' : 'kan-concealed';
      else if (new Set(normalizedDigits).size === 1) type = 'pon';
      return {
        type,
        source,
        tiles: digits.map((digit) => toFrontendTile(`${suit}${digit}`, { kind: 'flat' }))
      };
    });
  }

  function getSeatSnapshot(board, seatIndex, meta, hiddenHand, options) {
    const snapshotOptions = options || {};
    const shoupai = board.shoupai[seatIndex];
    const he = board.he[seatIndex];
    const seatKey = snapshotOptions.seatKey || CANONICAL_SEAT_KEYS[seatIndex] || 'bottom';
    if (!shoupai || !he) {
      return {
        seat: seatKey,
        title: meta && meta.title ? meta.title : '',
        name: meta && meta.name ? meta.name : '',
        handTiles: [],
        melds: [],
        riverTiles: [],
        inactive: true,
        riichi: {
          active: false,
          tileIndex: -1,
          displayMode: snapshotOptions.riichiDisplayMode === 'upright' ? 'upright' : 'flat',
          stickVisible: snapshotOptions.riichiStickVisible !== false
        }
      };
    }

    const parsedTiles = getShoupaiTiles(shoupai);
    const hasDrawnTile = Boolean(shoupai && shoupai._zimo);
    const visibleRiverCodes = (he._pai || []).filter((code) => !/[\+\=\-]$/.test(code));
    const riverTiles = visibleRiverCodes.map((code) => toFrontendTile(code.replace(/\*$/, ''), { kind: 'flat' }));
    const riichiTileIndex = (he._pai || []).findIndex((code) => /\*$/.test(code));
    const visibleRiichiTileIndex = riichiTileIndex >= 0
      ? (he._pai || []).slice(0, riichiTileIndex + 1).filter((code) => !/[\+\=\-]$/.test(code)).length - 1
      : -1;

    return {
      seat: seatKey,
      title: meta.title,
      name: meta.name,
      handTiles: hiddenHand
        ? Array.from({ length: parsedTiles.length || 13 }, (_, index) => ({
            kind: 'stand',
            hidden: true,
            code: parsedTiles[index] ? parsedTiles[index].code : null,
            extraClass: hasDrawnTile && index === (parsedTiles.length || 13) - 1 ? 'hand-gap' : ''
          }))
        : parsedTiles.map((tile, index) => toFrontendTile(tile.code, {
            kind: 'stand',
            hidden: tile.hidden,
            extraClass: hasDrawnTile && index === parsedTiles.length - 1 ? 'hand-gap' : ''
          })),
      melds: extractMelds(shoupai),
      riverTiles,
      riichi: {
        active: visibleRiichiTileIndex >= 0,
        tileIndex: visibleRiichiTileIndex,
        displayMode: snapshotOptions.riichiDisplayMode === 'upright' ? 'upright' : 'flat',
        stickVisible: snapshotOptions.riichiStickVisible !== false
      }
    };
  }

  function getHandCodesFromPaistr(paistr) {
    const shoupai = browserCore.createShoupaiFromString(paistr || '');
    return getShoupaiTiles(shoupai)
      .filter((tile) => !tile.hidden)
      .map((tile) => tile.code);
  }

  function buildPresetRoundData(round, activeSeats = CANONICAL_SEAT_KEYS) {
    const sourceHands = round && round.shoupai;
    const shoupai = activeSeats.map((seatKey, seatIndex) => {
      if (Array.isArray(sourceHands)) return sourceHands[seatIndex] || '';
      if (sourceHands && typeof sourceHands === 'object') return sourceHands[seatKey] || '';
      return '';
    });
    const baopai = Array.isArray(round.baopai) ? round.baopai.slice(0, 5) : ['m5'];

    return {
      source: 'preset',
      shoupai,
      baopai,
      haipai: shoupai.map((paistr) => getHandCodesFromPaistr(paistr)),
      remaining: Math.max(0, 122 - activeSeats.length * 13)
    };
  }

  function createDefaultSeatMeta() {
    return {
      bottom: { title: '自家', name: '南宫', human: true, active: true },
      right: { title: '大师', name: '隐僧', human: false, active: true },
      top: { title: '对家', name: '幽兰', human: false, active: true },
      left: { title: '雀豪', name: '剑客', human: false, active: true }
    };
  }

  function createDefaultRound(rulesetProfile, topology = {}) {
    const profile = rulesetProfile || getRulesetProfile({
      tableSize: topology.tableSize || 4
    });
    const tableSize = Number(topology.tableSize || profile.tableSize || profile.seatCount || 4) || 4;
    const activeSeats = Array.isArray(topology.activeSeats) && topology.activeSeats.length
      ? topology.activeSeats.slice()
      : CANONICAL_SEAT_KEYS.slice();
    const hiddenSeats = Array.isArray(topology.hiddenSeats)
      ? topology.hiddenSeats.slice()
      : CANONICAL_SEAT_KEYS.filter((seatKey) => !activeSeats.includes(seatKey));

    const player = tableSize === 2
      ? ['自家', '对家']
      : ['玩家', '下家', '对家', '上家'];

    return {
      title: 'AceZero Mahjong Single Round',
      player,
      qijia: 0,
      zhuangfeng: 0,
      jushu: 0,
      changbang: 0,
      lizhibang: 0,
      advancedMode: false,
      ruleset: profile.id,
      uiMode: profile.uiMode,
      tableLayout: profile.tableLayout,
      tableSize,
      activeSeats,
      hiddenSeats,
      defen: Array.from({ length: profile.seatCount || tableSize }, () => profile.startingScore),
      seatMeta: createDefaultSeatMeta()
    };
  }

  function normalizeGameConfig(options = {}) {
    const config = options || {};
    const roundInput = config.round && typeof config.round === 'object' ? config.round : {};
    const rulesetProfile = getRulesetProfile({
      id: config.ruleset || roundInput.ruleset,
      tableSize: config.tableSize || roundInput.tableSize || 4
    });
    const normalizedRuleConfig = rulesetProfileApi && typeof rulesetProfileApi.normalizeFriendlyRuleConfig === 'function'
      ? rulesetProfileApi.normalizeFriendlyRuleConfig(config, rulesetProfile)
      : {
          ruleOverrides: config.ruleOverrides && typeof config.ruleOverrides === 'object' ? { ...config.ruleOverrides } : {},
          customRuleConfig: { shibariMinYakuHan: 1 }
        };
    const topology = seatTopologyApi.createSeatTopology({
      tableSize: config.tableSize || roundInput.tableSize || rulesetProfile.tableSize,
      threePlayerLayout: config.threePlayerLayout || (config.ui && config.ui.threePlayerLayout) || null
    });
    const defaults = createDefaultSeatMeta();
    const players = Array.isArray(config.players) ? config.players.slice() : [];
    const playersBySeat = new Map(
      players
        .filter((player) => player && typeof player === 'object' && typeof player.seat === 'string')
        .map((player) => [player.seat, player])
    );
    const seatMeta = {};
    const orderedPlayers = topology.activeSeats.map((seatKey, seatIndex) => (
      playersBySeat.get(seatKey) || players[seatIndex] || {}
    ));

    CANONICAL_SEAT_KEYS.forEach((seatKey) => {
      seatMeta[seatKey] = {
        ...defaults[seatKey],
        active: topology.isActiveSeat(seatKey)
      };
    });

    orderedPlayers.forEach((player, seatIndex) => {
      const seatKey = topology.activeSeats[seatIndex];
      if (!seatKey) return;
      seatMeta[seatKey] = {
        ...seatMeta[seatKey],
        title: typeof player.title === 'string' && player.title ? player.title : seatMeta[seatKey].title,
        name: typeof player.name === 'string' && player.name ? player.name : seatMeta[seatKey].name,
        human: typeof player.human === 'boolean' ? player.human : seatKey === 'bottom',
        active: true
      };
    });

    return {
      mode: config.mode || 'single-round',
      ruleset: config.ruleset || rulesetProfile.id,
      rulesetProfile,
      customRuleConfig: normalizedRuleConfig.customRuleConfig || { shibariMinYakuHan: 1 },
      topology,
      ui: config.ui && typeof config.ui === 'object' ? { ...config.ui } : {},
      ruleOverrides: normalizedRuleConfig.ruleOverrides || {},
      engine: config.engine && typeof config.engine === 'object' ? { ...config.engine } : {},
      players: orderedPlayers,
      round: {
        ...createDefaultRound(rulesetProfile, topology),
        ...roundInput,
        title: roundInput.title || config.title || 'AceZero Mahjong Single Round',
        ruleset: config.ruleset || rulesetProfile.id,
        uiMode: roundInput.uiMode || rulesetProfile.uiMode,
        tableLayout: (config.ui && typeof config.ui.tableLayout === 'string' && config.ui.tableLayout)
          ? config.ui.tableLayout
          : (roundInput.tableLayout || rulesetProfile.tableLayout),
        advancedMode: typeof config.advancedMode === 'boolean'
          ? config.advancedMode
          : typeof roundInput.advancedMode === 'boolean'
            ? roundInput.advancedMode
            : false,
        tableSize: topology.tableSize,
        activeSeats: topology.activeSeats.slice(),
        hiddenSeats: topology.hiddenSeats.slice(),
        seatMeta
      }
    };
  }

  function createRule(overrides) {
    return browserCore.createRule(overrides || {});
  }

  function getAdvancedMode(round) {
    return Boolean(round && round.advancedMode);
  }

  function getRiichiDisplayMode(round) {
    if (round && typeof round.riichiDisplayMode === 'string') {
      return round.riichiDisplayMode === 'upright' ? 'upright' : 'flat';
    }
    return getAdvancedMode(round) ? 'upright' : 'flat';
  }

  function isRiichiStickVisible(round) {
    if (round && typeof round.riichiStickVisible === 'boolean') {
      return round.riichiStickVisible;
    }
    return getAdvancedMode(round);
  }

  function isCenterRiichiVisible(round) {
    if (round && typeof round.centerRiichiVisible === 'boolean') {
      return round.centerRiichiVisible;
    }
    return getAdvancedMode(round);
  }

  function isCenterDoraVisible(round) {
    if (round && typeof round.centerDoraVisible === 'boolean') {
      return round.centerDoraVisible;
    }
    return getAdvancedMode(round);
  }

  function getSeatDisplayName(runtime, seatKey) {
    const meta = runtime && runtime.seatMeta ? runtime.seatMeta[seatKey] : null;
    if (meta && meta.name && meta.title) return `${meta.title} ${meta.name}`;
    if (meta && meta.name) return meta.name;
    return seatKey;
  }

  function summarizeActionWindow(actionWindow) {
    if (!actionWindow || actionWindow.visible === false) {
      return {
        visible: false,
        layout: actionWindow && actionWindow.layout ? actionWindow.layout : 'single',
        actions: []
      };
    }

    return {
      visible: true,
      layout: actionWindow.layout || 'single',
      actions: Array.isArray(actionWindow.actions)
        ? actionWindow.actions.map((action) => action.key || action.label || 'unknown')
        : []
    };
  }

  function buildRuntimeEventLog(runtime, type, payload, snapshot) {
    const eventPayload = payload || {};
    const seatKey = eventPayload.seat || null;
    const seatName = seatKey ? getSeatDisplayName(runtime, seatKey) : null;
    const tileCode = eventPayload.tileCode || null;
    const tileLabel = tileCode ? getTileLabel(tileCode) : null;

    switch (type) {
      case 'round:start':
        return {
          level: 'info',
          message: '单局运行时已开始',
          detail: {
            roundText: snapshot && snapshot.info ? snapshot.info.roundText : null,
            turnSeat: snapshot && snapshot.info ? snapshot.info.turnSeat : null,
            remaining: snapshot && snapshot.info ? snapshot.info.remaining : null
          }
        };
      case 'tile:draw':
        return {
          level: 'info',
          message: `${seatName || seatKey || '未知玩家'} 摸牌 ${tileLabel || tileCode || '未知牌'}`,
          detail: {
            seat: seatKey,
            tileCode,
            tileLabel,
            remaining: snapshot && snapshot.info ? snapshot.info.remaining : null,
            turnSeat: snapshot && snapshot.info ? snapshot.info.turnSeat : null
          }
        };
      case 'tile:discard':
        return {
          level: 'info',
          message: `${seatName || seatKey || '未知玩家'} 打出 ${tileLabel || tileCode || '未知牌'}`,
          detail: {
            seat: seatKey,
            tileCode,
            tileLabel,
            riichi: Boolean(eventPayload.riichi),
            remaining: snapshot && snapshot.info ? snapshot.info.remaining : null
          }
        };
      case 'meld:call':
        return {
          level: 'info',
          message: `${seatName || seatKey || '未知玩家'} 副露 ${eventPayload.meld || ''}`.trim(),
          detail: {
            seat: seatKey,
            meld: eventPayload.meld || null
          }
        };
      case 'meld:kan':
        return {
          level: 'info',
          message: `${seatName || seatKey || '未知玩家'} 杠牌 ${eventPayload.meld || ''}`.trim(),
          detail: {
            seat: seatKey,
            meld: eventPayload.meld || null
          }
        };
      case 'dora:flip':
        return {
          level: 'info',
          message: `翻开宝牌 ${getTileLabel(eventPayload.tileCode) || eventPayload.tileCode || ''}`.trim(),
          detail: {
            tileCode: eventPayload.tileCode || null
          }
        };
      case 'round:hule':
        return {
          level: 'info',
          message: `${seatName || seatKey || '未知玩家'} 和牌`,
          detail: {
            seat: seatKey,
            result: eventPayload.result || null
          }
        };
      case 'scores:update':
        return {
          level: 'debug',
          message: '分数已更新',
          detail: {
            scores: eventPayload.scores || null
          }
        };
      case 'action-window:update':
        return {
          level: 'debug',
          message: '动作窗口已更新',
          detail: summarizeActionWindow(eventPayload.actionWindow || null)
        };
      default:
        return {
          level: 'debug',
          message: `运行时事件 ${type}`,
          detail: eventPayload
        };
    }
  }

  function createRuntime(config = {}, deps = {}) {
    const {
      clone,
      inferBrowserActionType,
      normalizeBrowserActionPayload,
      logRuntime
    } = deps;

    function logRuntimeEvent(runtime, type, payload, snapshot) {
      const summary = buildRuntimeEventLog(runtime, type, payload, snapshot);
      if (!summary || typeof logRuntime !== 'function') return null;
      return logRuntime(summary.level || 'debug', summary.message, summary.detail);
    }

  function getRuntimeTurnSeat(runtime) {
    return runtime.turnSeat || runtime.getSeatKeyByIndex(runtime.board.lunban) || 'bottom';
  }

  function buildLegacySharedInfo(runtime) {
    const wallState = runtime && typeof runtime.getWallState === 'function'
      ? runtime.getWallState()
      : {
          remaining: runtime.board.shan ? runtime.board.shan.paishu : 0,
          baopai: (runtime.board.shan && runtime.board.shan.baopai) || []
        };
    const scores = CANONICAL_SEAT_KEYS.reduce((result, seatKey) => {
      const seatIndex = runtime.getSeatIndex(seatKey);
      result[seatKey] = seatIndex >= 0
        ? (runtime.board.defen[runtime.board.player_id[seatIndex]] || 0)
        : 0;
      return result;
    }, {});

    return {
      tableSize: runtime.topology.tableSize,
      activeSeats: runtime.activeSeats.slice(),
      hiddenSeats: runtime.topology.hiddenSeats.slice(),
      ruleset: runtime.round.ruleset || runtime.config.ruleset || runtime.rulesetProfile.id,
      uiMode: runtime.round.uiMode || runtime.rulesetProfile.uiMode,
      tableLayout: runtime.round.tableLayout || runtime.rulesetProfile.tableLayout,
      advancedMode: getAdvancedMode(runtime.round),
      roundText: `${['東', '南', '西', '北'][runtime.board.zhuangfeng] || '東'}${runtime.board.jushu + 1}`,
      honba: runtime.board.changbang,
      riichiSticks: runtime.board.lizhibang,
      centerRiichiVisible: isCenterRiichiVisible(runtime.round),
      centerDoraVisible: isCenterDoraVisible(runtime.round),
      remaining: Number(wallState.remaining || 0) || 0,
      turnSeat: getRuntimeTurnSeat(runtime),
      scores,
      doraTiles: (Array.isArray(wallState.baopai) ? wallState.baopai : []).slice(0, 5).map((code) => ({
        asset: getTileAsset(code),
        label: getTileLabel(code),
        open: Boolean(code)
      }))
    };
  }

  const legacyBrowserViewBuilder = createRuntimeViewBuilder({
    seatKeys: CANONICAL_SEAT_KEYS,
    clone,
    buildInfo: buildLegacySharedInfo,
    buildSeatSnapshot(runtime, seatKey, hiddenHand) {
      const seatIndex = runtime.getSeatIndex(seatKey);
      if (seatIndex < 0) {
        return {
          seat: seatKey,
          title: runtime.seatMeta[seatKey]?.title || '',
          name: runtime.seatMeta[seatKey]?.name || '',
          handTiles: [],
          melds: [],
          riverTiles: [],
          inactive: true,
          riichi: {
            active: false,
            tileIndex: -1,
            displayMode: getRiichiDisplayMode(runtime.round),
            stickVisible: isRiichiStickVisible(runtime.round)
          }
        };
      }

      return getSeatSnapshot(runtime.board, seatIndex, runtime.seatMeta[seatKey], hiddenHand, {
        seatKey,
        riichiDisplayMode: getRiichiDisplayMode(runtime.round),
        riichiStickVisible: isRiichiStickVisible(runtime.round)
      });
    }
  });

    const legacyBrowserRuntimeHelpers = Object.freeze({
      buildScores(runtime) {
        return CANONICAL_SEAT_KEYS.reduce((result, seatKey) => {
          const seatIndex = runtime.getSeatIndex(seatKey);
          result[seatKey] = seatIndex >= 0
            ? (runtime.board.defen[runtime.board.player_id[seatIndex]] || 0)
            : 0;
          return result;
        }, {});
      },

      buildSeatSnapshot(runtime, seatKey) {
        const seatIndex = runtime.getSeatIndex(seatKey);
        if (seatIndex < 0) {
          return {
            seat: seatKey,
            title: runtime.seatMeta[seatKey]?.title || '',
            name: runtime.seatMeta[seatKey]?.name || '',
            handTiles: [],
            melds: [],
            riverTiles: [],
            inactive: true,
            riichi: {
              active: false,
              tileIndex: -1,
              displayMode: getRiichiDisplayMode(runtime.round),
              stickVisible: isRiichiStickVisible(runtime.round)
            }
          };
        }

        return getSeatSnapshot(runtime.board, seatIndex, runtime.seatMeta[seatKey], seatKey !== 'bottom', {
          seatKey,
          riichiDisplayMode: getRiichiDisplayMode(runtime.round),
          riichiStickVisible: isRiichiStickVisible(runtime.round)
        });
      },

      buildInfo(runtime, scores) {
        return buildLegacySharedInfo(runtime, scores);
      },

      buildSnapshot(runtime) {
        const views = legacyBrowserViewBuilder.buildViewBundle(runtime, {
          playerSeat: 'bottom'
        });

        return {
          mode: 'single-round',
          phase: runtime.phase,
          info: clone(views.playerView.info),
          seats: clone(views.playerView.seats),
          view: {
            is25d: true,
            hideZones: true
          },
          views,
          actionWindow: runtime.actionWindow ? clone(runtime.actionWindow) : null,
          availableActions: runtime.actionWindow && Array.isArray(runtime.actionWindow.actions)
            ? runtime.actionWindow.actions.map((action) => clone(action))
            : [],
          lastEvent: runtime.lastEvent ? clone(runtime.lastEvent) : null
        };
      },

      getRiichiChoices(runtime, seatIndex) {
        if (seatIndex < 0) return [];
        const wallState = runtime && typeof runtime.getWallState === 'function'
          ? runtime.getWallState()
          : null;
        return browserCore.getRiichiChoices(
          runtime.rule,
          runtime.board.shoupai[seatIndex].clone(),
          wallState ? Number(wallState.remaining || 0) : 0,
          runtime.board.defen[runtime.board.player_id[seatIndex]] || 0
        );
      },

      createRiichiAction() {
        const baseAction = actionBuilderApi && typeof actionBuilderApi.createRiichiAction === 'function'
          ? actionBuilderApi.createRiichiAction({
              label: '立直',
              group: 'special',
              priority: 10
            })
          : {
              type: 'ui-action',
              key: 'riichi',
              label: '立直',
              group: 'special',
              priority: 10,
              payload: {
                actionKey: 'riichi'
              }
            };

        return {
          ...baseAction,
          bgChar: '立',
          textLayout: 'len-2',
          variant: 'riichi',
          row: 0
        };
      },

      chooseAutoDiscardDecision(runtime, seatKey) {
        const seatIndex = runtime.getSeatIndex(seatKey);
        if (seatIndex < 0) return null;

        const shoupai = runtime.board.shoupai[seatIndex];
        if (!shoupai) return null;

        const handCodes = runtime.getSeatHandCodes(seatKey);
        if (!handCodes.length) return null;

        const drawnCode = shoupai._zimo && shoupai._zimo.length <= 2 ? shoupai._zimo : null;
        const candidates = browserCore.getDiscardCandidates(runtime.rule, shoupai.clone())
          .map((code) => String(code || '').replace(/\*$/, ''))
          .filter(Boolean);

        if (!candidates.length) {
          return {
            tileCode: handCodes[handCodes.length - 1],
            tileIndex: handCodes[handCodes.length - 1] ? handCodes.length - 1 : 0
          };
        }

        let best = null;

        candidates.forEach((candidate) => {
          const simulated = shoupai.clone().dapai(candidate);
          const xiangting = browserCore.calculateXiangting(simulated);
          const tingpaiCount = browserCore.getTingpai(simulated).length;
          const isDrawDiscard = candidate === drawnCode;
          const preferredIndex = (() => {
            if (!isDrawDiscard) {
              const nonDrawnIndex = handCodes.findIndex((code, index) => code === candidate && index !== handCodes.length - 1);
              if (nonDrawnIndex >= 0) return nonDrawnIndex;
            }
            return handCodes.findIndex((code) => code === candidate);
          })();

          const next = {
            tileCode: candidate,
            tileIndex: preferredIndex >= 0 ? preferredIndex : handCodes.length - 1,
            xiangting,
            tingpaiCount,
            isDrawDiscard
          };

          if (!best) {
            best = next;
            return;
          }

          if (next.xiangting < best.xiangting) {
            best = next;
            return;
          }
          if (next.xiangting > best.xiangting) return;
          if (next.tingpaiCount > best.tingpaiCount) {
            best = next;
            return;
          }
          if (next.tingpaiCount < best.tingpaiCount) return;
          if (best.isDrawDiscard && !next.isDrawDiscard) {
            best = next;
            return;
          }
          if (next.tileIndex < best.tileIndex) {
            best = next;
          }
        });

        return best;
      }
    });

    function BrowserSingleRoundRuntime(options) {
      const normalizedConfig = normalizeGameConfig(options || {});
      const opts = options || {};
      this.kind = 'legacy-browser-runtime';
      this.source = 'legacy-browser-runtime';
      this.mode = normalizedConfig.mode || 'single-round';
      this.config = normalizedConfig;
      this.topology = normalizedConfig.topology;
      this.rulesetProfile = normalizedConfig.rulesetProfile;
      this.customRuleConfig = normalizedConfig.customRuleConfig || { shibariMinYakuHan: 1 };
      this.activeSeats = this.topology.activeSeats.slice();
      this.rule = createRule(normalizedConfig.ruleOverrides);
      this.round = Object.assign(createDefaultRound(normalizedConfig.rulesetProfile, normalizedConfig.topology), normalizedConfig.round || {});
      this.seatMeta = Object.assign({}, createDefaultSeatMeta(), this.round.seatMeta || {});
      this.listeners = new Set();
      this.lastEvent = null;
      this.actionWindow = null;
      this.phase = BROWSER_RUNTIME_PHASES.AWAIT_DRAW;
      this.pendingRiichi = false;
      this.turnSeat = this.activeSeats[0] || 'bottom';
      this.autoTurnTimer = 0;
      this.drawPolicy = opts.drawPolicy
        || (global.AceMahjongDrawPolicy && typeof global.AceMahjongDrawPolicy.createNoOpDrawPolicy === 'function'
          ? global.AceMahjongDrawPolicy.createNoOpDrawPolicy()
          : null);
      this.wallService = opts.wallService || global.AceMahjongWallService.createWallService({
        rule: this.rule,
        ruleset: this.config.ruleset,
        tableSize: this.topology.tableSize,
        topology: this.topology,
        drawPolicy: this.drawPolicy,
        logger(level, message, detail) {
          if (typeof logRuntime === 'function') {
            logRuntime(level, message, detail);
          }
        }
      });

      const initialRoundData = opts.round && opts.round.usePresetDeal
        ? buildPresetRoundData(this.round, this.activeSeats)
        : this.wallService.dealInitialHands({
            seatCount: this.activeSeats.length,
            context: {
              round: {
                title: this.round.title,
                qijia: this.round.qijia,
                zhuangfeng: this.round.zhuangfeng,
                jushu: this.round.jushu
              }
            }
          });

      const expandedShoupai = Array.from({ length: 4 }, (_, index) => initialRoundData.shoupai[index] || '');
      const expandedDefen = Array.from({ length: 4 }, (_, index) => {
        const seatKey = this.activeSeats[index];
        if (!seatKey) return 0;
        const playerConfig = this.config.players[index] || {};
        if (Number.isFinite(Number(playerConfig.score))) return Number(playerConfig.score);
        const roundScore = Array.isArray(this.round.defen) ? this.round.defen[index] : null;
        return Number.isFinite(Number(roundScore)) ? Number(roundScore) : this.rulesetProfile.startingScore;
      });

      this.round.player = this.activeSeats.map((seatKey) => this.seatMeta[seatKey]?.name || seatKey);
      this.round.shoupai = expandedShoupai;
      this.round.baopai = initialRoundData.baopai;
      this.round.defen = expandedDefen;
      this.initialRoundData = initialRoundData;

      this.board = browserCore.createBoard({
        title: this.round.title,
        player: this.round.player,
        qijia: this.round.qijia
      });

      this.board.qipai({
        zhuangfeng: this.round.zhuangfeng,
        jushu: this.round.jushu,
        changbang: this.round.changbang,
        lizhibang: this.round.lizhibang,
        defen: expandedDefen,
        baopai: this.round.baopai,
        shoupai: expandedShoupai
      });

      if (typeof logRuntime === 'function') {
        logRuntime('info', initialRoundData.source === 'preset' ? '使用预置配牌初始化单局' : '已从真实牌山完成起手发牌', {
          source: initialRoundData.source,
          policy: this.wallService && typeof this.wallService.getState === 'function' ? this.wallService.getState().policy : null,
          baopai: initialRoundData.baopai,
          baopaiLabels: initialRoundData.baopai.map((tileCode) => getTileLabel(tileCode)),
          remaining: initialRoundData.remaining,
          hands: this.activeSeats.reduce((result, seatKey, seatIndex) => {
            result[seatKey] = {
              player: getSeatDisplayName(this, seatKey),
              codes: (initialRoundData.haipai[seatIndex] || []).slice(),
              labels: (initialRoundData.haipai[seatIndex] || []).map((tileCode) => getTileLabel(tileCode))
            };
            return result;
          }, {})
        });
      }
    }

    BrowserSingleRoundRuntime.prototype.getSeatIndex = function(seatKey) {
      return this.activeSeats.indexOf(seatKey);
    };

    BrowserSingleRoundRuntime.prototype.getSeatKeyByIndex = function(seatIndex) {
      return this.activeSeats[seatIndex] || null;
    };

    BrowserSingleRoundRuntime.prototype.getNextSeatKey = function(seatKey) {
      return this.topology.getNextSeat(seatKey);
    };

    BrowserSingleRoundRuntime.prototype.subscribe = function(listener) {
      if (typeof listener !== 'function') return function() {};
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    };

    BrowserSingleRoundRuntime.prototype.setPhase = function(phase) {
      this.phase = Object.values(BROWSER_RUNTIME_PHASES).includes(phase)
        ? phase
        : BROWSER_RUNTIME_PHASES.AWAIT_DRAW;
      return this.phase;
    };

    BrowserSingleRoundRuntime.prototype.emit = function(type, payload, meta) {
      const event = {
        type,
        payload: payload || {},
        timestamp: Date.now(),
        meta: Object.assign({
          phase: this.phase
        }, meta || {})
      };
      this.lastEvent = event;
      const snapshot = this.getSnapshot();
      if (typeof logRuntimeEvent === 'function') {
        logRuntimeEvent(this, type, payload || {}, snapshot);
      }
      event.snapshot = snapshot;
      this.listeners.forEach((listener) => listener(event));
      return snapshot;
    };

    BrowserSingleRoundRuntime.prototype.setActionWindow = function(actionWindow) {
      this.actionWindow = createNormalizedActionWindow(actionWindow);
      return this.emit('action-window:update', {
        actionWindow: this.actionWindow,
        availableActions: this.actionWindow && Array.isArray(this.actionWindow.actions)
          ? this.actionWindow.actions
          : []
      });
    };

    BrowserSingleRoundRuntime.prototype.nextDrawTile = function() {
      if (!this.wallService || typeof this.wallService.drawTile !== 'function') {
        throw new Error('Wall service is not available.');
      }
      const currentSeat = this.board.lunban >= 0 ? this.getSeatKeyByIndex(this.board.lunban) : null;
      return this.wallService.drawTile({
        round: {
          zhuangfeng: this.board.zhuangfeng,
          jushu: this.board.jushu
        },
        turnSeat: currentSeat ? this.getNextSeatKey(currentSeat) : (this.activeSeats[0] || 'bottom')
      });
    };

    BrowserSingleRoundRuntime.prototype.getSeatHandCodes = function(seatKey) {
      const seatIndex = this.getSeatIndex(seatKey);
      if (seatIndex < 0) return [];
      return getShoupaiTiles(this.board.shoupai[seatIndex])
        .filter((tile) => !tile.hidden)
        .map((tile) => tile.code);
    };

    BrowserSingleRoundRuntime.prototype.refreshActionWindow = function() {
      const bottomIndex = this.getSeatIndex('bottom');
      const isBottomTurn = bottomIndex >= 0
        && this.board.lunban === bottomIndex
        && this.board.shoupai[bottomIndex]
        && this.board.shoupai[bottomIndex]._zimo;
      if (!isBottomTurn) {
        this.pendingRiichi = false;
        return this.setActionWindow({
          visible: false,
          layout: 'single',
          actions: [],
          activeActionKey: null
        });
      }

      const riichiChoices = legacyBrowserRuntimeHelpers.getRiichiChoices(this, bottomIndex);
      const actions = [];
      if (Array.isArray(riichiChoices) && riichiChoices.length) {
        actions.push(legacyBrowserRuntimeHelpers.createRiichiAction());
      }

      return this.setActionWindow({
        visible: actions.length > 0,
        layout: 'single',
        actions,
        activeActionKey: this.pendingRiichi ? 'riichi' : null
      });
    };

    BrowserSingleRoundRuntime.prototype.start = function() {
      this.setPhase(BROWSER_RUNTIME_PHASES.AWAIT_DRAW);
      return this.emit('round:start', {
        zhuangfeng: this.board.zhuangfeng,
        jushu: this.board.jushu
      });
    };

    BrowserSingleRoundRuntime.prototype.drawTile = function(seatKey, tileCode) {
      const seatIndex = this.getSeatIndex(seatKey);
      this.board.zimo({ l: seatIndex, p: tileCode });
      this.turnSeat = seatKey;
      this.setPhase(BROWSER_RUNTIME_PHASES.AWAIT_DISCARD);
      return this.emit('tile:draw', { seat: seatKey, tileCode });
    };

    BrowserSingleRoundRuntime.prototype.discardTile = function(seatKey, tileCode, options) {
      const opts = options || {};
      const seatIndex = this.getSeatIndex(seatKey);
      this.board.dapai({ l: seatIndex, p: opts.riichi ? `${tileCode}*` : tileCode });
      this.turnSeat = this.getNextSeatKey(seatKey);
      this.setPhase(BROWSER_RUNTIME_PHASES.AWAIT_REACTION);
      return this.emit('tile:discard', { seat: seatKey, tileCode, riichi: Boolean(opts.riichi) });
    };

    BrowserSingleRoundRuntime.prototype.drawForSeat = function(seatKey) {
      const drawResult = this.nextDrawTile();
      const tileCode = drawResult && drawResult.tileCode ? drawResult.tileCode : drawResult;
      this.drawTile(seatKey, tileCode);
      if (typeof logRuntime === 'function') {
        logRuntime('debug', '牌墙服务完成摸牌', {
          seat: seatKey,
          tileCode,
          tileLabel: getTileLabel(tileCode),
          source: drawResult && drawResult.source ? drawResult.source : 'unknown',
          meta: drawResult && drawResult.meta ? drawResult.meta : null,
          remaining: drawResult && typeof drawResult.remaining === 'number' ? drawResult.remaining : null
        });
      }
      return drawResult;
    };

    BrowserSingleRoundRuntime.prototype.chooseAutoDiscard = function(seatKey) {
      return legacyBrowserRuntimeHelpers.chooseAutoDiscardDecision(this, seatKey);
    };

    BrowserSingleRoundRuntime.prototype.discardHandTileAtIndex = function(seatKey, tileIndex) {
      const seatIndex = this.getSeatIndex(seatKey);
      if (seatIndex < 0) return null;

      const handCodes = this.getSeatHandCodes(seatKey);
      if (!Number.isInteger(tileIndex) || tileIndex < 0 || tileIndex >= handCodes.length) {
        return null;
      }

      const tileCode = handCodes[tileIndex];
      const riichiChoices = legacyBrowserRuntimeHelpers.getRiichiChoices(this, seatIndex);
      const shouldRiichi = this.pendingRiichi && Array.isArray(riichiChoices) && riichiChoices.includes(tileCode);

      this.pendingRiichi = false;
      this.discardTile(seatKey, tileCode, { riichi: shouldRiichi });
      this.refreshActionWindow();
      this.scheduleAutoRound();
      return this.getSnapshot();
    };

    BrowserSingleRoundRuntime.prototype.clearAutoTurnTimer = function() {
      if (!this.autoTurnTimer) return;
      window.clearTimeout(this.autoTurnTimer);
      this.autoTurnTimer = 0;
    };

    BrowserSingleRoundRuntime.prototype.beginBottomTurn = function() {
      if (this.getSeatIndex('bottom') < 0) {
        if (typeof logRuntime === 'function') {
          logRuntime('warn', '当前配置未包含 bottom 座位，已跳过玩家摸牌启动', {
            activeSeats: this.activeSeats.slice()
          });
        }
        return null;
      }

      this.drawForSeat('bottom');
      this.refreshActionWindow();
      return this.getSnapshot();
    };

    BrowserSingleRoundRuntime.prototype.startSession = function() {
      const startSnapshot = this.start();
      const currentTurnSeat = this.turnSeat || this.getSeatKeyByIndex(this.board.lunban) || 'bottom';
      if (currentTurnSeat === 'bottom') {
        return this.beginBottomTurn();
      }
      this.scheduleAutoRound();
      return startSnapshot || this.getSnapshot();
    };

    BrowserSingleRoundRuntime.prototype.scheduleAutoRound = function() {
      this.clearAutoTurnTimer();
      const seats = this.activeSeats.filter((seatKey) => seatKey !== 'bottom');
      const stepDelay = 1220;
      const drawToDiscardDelay = 980;

      const runStep = (index) => {
        if (index >= seats.length) {
          this.beginBottomTurn();
          return;
        }

        const seatKey = seats[index];
        this.drawForSeat(seatKey);
        this.autoTurnTimer = window.setTimeout(() => {
          const discardDecision = this.chooseAutoDiscard(seatKey);
          if (!discardDecision || typeof discardDecision.tileCode !== 'string') {
            if (typeof logRuntime === 'function') {
              logRuntime('info', `${getSeatDisplayName(this, seatKey)} 处于 AI 接口模式，未提供弃牌决策，自动流程暂停`, {
                seat: seatKey,
                decision: discardDecision || null
              });
            }
            this.clearAutoTurnTimer();
            return;
          }
          const discardIndex = Number.isInteger(discardDecision.tileIndex) ? discardDecision.tileIndex : 0;
          const discardCode = discardDecision.tileCode;
          const table = global.AceZeroMahjongUI && global.AceZeroMahjongUI.table;
          if (typeof logRuntime === 'function') {
            logRuntime('debug', `${getSeatDisplayName(this, seatKey)} 自动出牌决策`, {
              seat: seatKey,
              discardIndex,
              discardCode,
              discardLabel: getTileLabel(discardCode)
            });
          }

          const proceedDiscard = () => {
            this.discardTile(seatKey, discardCode, { riichi: false });
            this.autoTurnTimer = window.setTimeout(() => {
              runStep(index + 1);
            }, stepDelay);
          };

          if (table && typeof table.animateSeatHandDiscard === 'function') {
            table.animateSeatHandDiscard(seatKey, discardIndex, proceedDiscard);
            return;
          }

          proceedDiscard();
        }, drawToDiscardDelay);
      };

      this.autoTurnTimer = window.setTimeout(() => runStep(0), stepDelay);
    };

    BrowserSingleRoundRuntime.prototype.dispatch = function(action) {
      if (typeof action === 'string') {
        return this.dispatch({
          key: action
        });
      }

      const nextAction = action && typeof action === 'object' ? action : null;
      const type = inferBrowserActionType(nextAction) || 'ui-action';
      const payload = normalizeBrowserActionPayload(nextAction);
      const actionKey = payload.actionKey || nextAction?.key || null;

      if (type === 'ui-action') {
        if (typeof logRuntime === 'function') {
          logRuntime('info', '收到动作按钮输入', {
            actionKey,
            pendingRiichi: this.pendingRiichi
          });
        }

        if (actionKey === 'riichi') {
          this.pendingRiichi = !this.pendingRiichi;
          if (typeof logRuntime === 'function') {
            logRuntime('info', '立直准备状态切换', {
              pendingRiichi: this.pendingRiichi
            });
          }
          this.refreshActionWindow();
          return this.getSnapshot();
        }

        if (typeof logRuntime === 'function') {
          logRuntime('warn', '动作暂未实现', { actionKey });
        }
        return null;
      }

      if (type === 'discard-index') return this.discardHandTileAtIndex(payload.seat || 'bottom', payload.tileIndex);
      if (type === 'draw') return this.drawTile(payload.seat, payload.tileCode);
      if (type === 'draw-seat') {
        this.drawForSeat(payload.seat || 'bottom');
        return this.getSnapshot();
      }
      if (type === 'discard') {
        return this.discardTile(payload.seat, payload.tileCode, payload.options || {
          riichi: Boolean(payload.riichi)
        });
      }
      if (type === 'meld' || type === 'call') return this.callMeld(payload.seat, payload.meld || payload.meldString);
      if (type === 'kan' || type === 'gang') return this.declareKan(payload.seat, payload.meld || payload.meldString);
      if (type === 'dora' || type === 'flip-dora') return this.flipDora(payload.tileCode);
      if (type === 'hule') return this.resolveHule(payload.seat, payload);
      if (type === 'scores' || type === 'scores-update') return this.setScores(payload.scores || payload);
      if (type === 'action-window' || type === 'action-window-update') return this.setActionWindow(payload.actionWindow || payload);

      if (typeof logRuntime === 'function') {
        logRuntime('warn', '浏览器桥层收到未支持的 dispatch 动作', {
          type,
          payload
        });
      }
      return null;
    };

    BrowserSingleRoundRuntime.prototype.callMeld = function(seatKey, meldString) {
      const seatIndex = this.getSeatIndex(seatKey);
      this.setActionWindow(null);
      this.board.fulou({ l: seatIndex, m: meldString });
      this.turnSeat = seatKey;
      this.setPhase(BROWSER_RUNTIME_PHASES.AWAIT_RESOLUTION);
      return this.emit('meld:call', { seat: seatKey, meld: meldString });
    };

    BrowserSingleRoundRuntime.prototype.declareKan = function(seatKey, meldString) {
      const seatIndex = this.getSeatIndex(seatKey);
      this.setActionWindow(null);
      this.board.gang({ l: seatIndex, m: meldString });
      this.turnSeat = seatKey;
      this.setPhase(BROWSER_RUNTIME_PHASES.AWAIT_RESOLUTION);
      return this.emit('meld:kan', { seat: seatKey, meld: meldString });
    };

    BrowserSingleRoundRuntime.prototype.flipDora = function(tileCode) {
      if (!tileCode && this.wallService && typeof this.wallService.revealDora === 'function') {
        this.wallService.revealDora({ reason: 'legacy-runtime-flip-dora' });
      } else {
        this.board.kaigang({ baopai: tileCode });
      }
      this.setPhase(BROWSER_RUNTIME_PHASES.AWAIT_DRAW);
      const wallState = typeof this.getWallState === 'function' ? this.getWallState() : null;
      return this.emit('dora:flip', {
        tileCode: Array.isArray(wallState && wallState.baopai)
          ? wallState.baopai.slice(-1)[0] || tileCode || null
          : (tileCode || null)
      });
    };

    BrowserSingleRoundRuntime.prototype.resolveHule = function(seatKey, options = {}) {
      const seatIndex = this.getSeatIndex(seatKey);
      const shoupai = this.board.shoupai[seatIndex].clone();
      const result = browserCore.calculateHule(shoupai, options.rongpai || null, {
        zhuangfeng: this.board.zhuangfeng,
        menfeng: seatIndex,
        hupai: options.hupai || null,
        baopai: (this.getWallState && this.getWallState().baopai) || [],
        fubaopai: options.fubaopai || []
      });

      this.setPhase(BROWSER_RUNTIME_PHASES.ROUND_END);
      this.emit('round:hule', {
        seat: seatKey,
        result
      });

      return result;
    };

    BrowserSingleRoundRuntime.prototype.setScores = function(scores = {}) {
      CANONICAL_SEAT_KEYS.forEach((seatKey) => {
        const value = scores[seatKey];
        const seatIndex = this.getSeatIndex(seatKey);
        if (seatIndex < 0 || typeof value !== 'number') return;
        this.board.defen[this.board.player_id[seatIndex]] = value;
      });
      return this.emit('scores:update', { scores });
    };

    BrowserSingleRoundRuntime.prototype.getSnapshot = function() {
      return legacyBrowserRuntimeHelpers.buildSnapshot(this);
    };

    return new BrowserSingleRoundRuntime(config);
  }

  global.AceMahjongLegacyBrowserRuntimeFactory = {
    kind: 'legacy-browser-runtime-factory',
    source: 'legacy-browser-runtime-factory',
    createRuntime
  };
})(window);
