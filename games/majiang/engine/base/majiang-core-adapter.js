'use strict';

const Majiang = require('../../majiang-core/lib');
const createCoreAdapter = require('../../shared/core/adapter-factory');

const SEAT_KEYS = ['bottom', 'right', 'top', 'left'];
const FRONTEND_SEAT_INDEX = {
  bottom: 0,
  right: 1,
  top: 2,
  left: 3
};
const SEAT_INDEX_TO_KEY = ['bottom', 'right', 'top', 'left'];
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

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const coreAdapter = createCoreAdapter(() => Majiang);
const {
  createRule,
  createBoard,
  createShoupaiFromString,
  validateMeldString,
  getRiichiChoices,
  getDiscardCandidates,
  calculateXiangting,
  getTingpai,
  createHuleParam,
  calculateHule,
  allowNoDaopai
} = coreAdapter;

function getTileAsset(code) {
  if (!code || code === '_') return null;
  return TILE_ASSET_MAP[code[0]] ? TILE_ASSET_MAP[code[0]][code[1]] || null : null;
}

function getTileLabel(code) {
  if (!code || code === '_') return '暗牌';
  return TILE_LABEL_MAP[code[0]] ? TILE_LABEL_MAP[code[0]][code[1]] || code : code;
}

function toFrontendTile(code, options = {}) {
  const asset = getTileAsset(code);
  return {
    asset,
    label: options.label || getTileLabel(code),
    kind: options.kind || 'flat',
    hidden: Boolean(options.hidden)
  };
}

function parsePaistrTiles(paistr = '') {
  const parts = String(paistr || '').split(',');
  const bingpai = parts.shift() || '';
  const tiles = [];
  let currentSuit = null;

  for (const char of bingpai.replace(/\*/g, '')) {
    if (/[mpsz]/.test(char)) {
      currentSuit = char;
      continue;
    }
    if (char === '_') {
      tiles.push({ code: '_', hidden: true });
      continue;
    }
    if (/\d/.test(char) && currentSuit) {
      tiles.push({ code: `${currentSuit}${char}`, hidden: false });
    }
  }

  return {
    tiles,
    melds: parts.filter(Boolean)
  };
}

function shoupaiToFrontendTiles(shoupai, options = {}) {
  if (!shoupai || typeof shoupai.toString !== 'function') {
    return [];
  }
  const parsed = parsePaistrTiles(shoupai.toString());
  return parsed.tiles.map((tile, index) => toFrontendTile(tile.code, {
    hidden: tile.hidden,
    kind: options.hidden ? 'stand' : (options.kind || 'stand'),
    label: getTileLabel(tile.code),
    extraClass: index === parsed.tiles.length - 1 && options.withGap ? 'hand-gap' : ''
  }));
}

function extractMelds(shoupai) {
  if (!shoupai || !Array.isArray(shoupai._fulou)) return [];
  return shoupai._fulou.map((meld) => frontendMeldFromString(meld));
}

function frontendMeldFromString(meld) {
  const normalized = validateMeldString(meld);
  if (!normalized) return { type: 'chi', source: 'right', tiles: [] };

  const suit = normalized[0];
  const sourceChar = (normalized.match(/[\+\=\-]/) || [''])[0];
  const sourceMap = { '+': 'left', '=': 'across', '-': 'right' };
  const source = sourceMap[sourceChar] || 'right';
  const digits = normalized.match(/\d/g) || [];
  const tileCodes = digits.map((digit) => `${suit}${digit}`);

  let type = 'chi';
  const normalizedDigits = normalized.replace(/0/g, '5').match(/\d/g) || [];
  if (tileCodes.length === 4) {
    if (normalized.match(/\d{3}[\+\=\-]\d$/)) type = 'kan-added';
    else type = sourceChar ? 'kan-open' : 'kan-concealed';
  } else if (new Set(normalizedDigits).size === 1) {
    type = 'pon';
  }

  return {
    type,
    source,
    tiles: tileCodes.map((code) => toFrontendTile(code, { kind: 'flat' }))
  };
}

function getSeatKeyByIndex(index) {
  return SEAT_INDEX_TO_KEY[index] || 'bottom';
}

function getSeatIndexByKey(seatKey) {
  return FRONTEND_SEAT_INDEX[seatKey];
}

function createRoundConfig(overrides = {}) {
  return {
    title: overrides.title || 'AceZero Mahjong Single Round',
    player: overrides.player || ['玩家', '下家', '对家', '上家'],
    qijia: Number.isInteger(overrides.qijia) ? overrides.qijia : 0,
    zhuangfeng: Number.isInteger(overrides.zhuangfeng) ? overrides.zhuangfeng : 0,
    jushu: Number.isInteger(overrides.jushu) ? overrides.jushu : 0,
    changbang: Number.isInteger(overrides.changbang) ? overrides.changbang : 0,
    lizhibang: Number.isInteger(overrides.lizhibang) ? overrides.lizhibang : 0,
    defen: Array.isArray(overrides.defen) ? overrides.defen.slice(0, 4) : [25000, 25000, 25000, 25000],
    baopai: Array.isArray(overrides.baopai) ? overrides.baopai.slice(0, 5) : ['m5'],
    shoupai: Array.isArray(overrides.shoupai) ? overrides.shoupai.slice(0, 4) : ['', '', '', '']
  };
}

function buildInitialBoardState(config = {}, ruleOverrides = {}) {
  const roundConfig = createRoundConfig(config);
  const rule = createRule(ruleOverrides);
  const board = createBoard({
    title: roundConfig.title,
    player: roundConfig.player,
    qijia: roundConfig.qijia
  });

  board.qipai({
    zhuangfeng: roundConfig.zhuangfeng,
    jushu: roundConfig.jushu,
    changbang: roundConfig.changbang,
    lizhibang: roundConfig.lizhibang,
    defen: roundConfig.defen,
    baopai: roundConfig.baopai,
    shoupai: roundConfig.shoupai
  });

  return {
    rule,
    board
  };
}

function getVisibleSeatState(board, seatIndex, options = {}) {
  const shoupai = board && Array.isArray(board.shoupai) ? board.shoupai[seatIndex] : null;
  const he = board && Array.isArray(board.he) ? board.he[seatIndex] : null;
  const seatKey = getSeatKeyByIndex(seatIndex);
  const hiddenHand = options.hiddenHand === true;

  const handTiles = hiddenHand
    ? Array.from({ length: shoupai && typeof shoupai.toString === 'function' ? (parsePaistrTiles(shoupai.toString()).tiles.length || 13) : 13 }, (_, index) => ({
        kind: 'stand',
        hidden: true,
        extraClass: index === 13 ? 'hand-gap' : ''
      }))
    : shoupaiToFrontendTiles(shoupai, { kind: seatKey === 'bottom' ? 'stand' : 'stand', hidden: false });

  const melds = extractMelds(shoupai);
  const riverCodes = he && Array.isArray(he._pai) ? he._pai : [];
  const riverTiles = riverCodes
    .filter((code) => !/[\+\=\-]$/.test(code))
    .map((code) => {
      const cleanCode = code.replace(/\*$/, '');
      return toFrontendTile(cleanCode, { kind: 'flat' });
    });
  const riichiTileIndex = riverCodes.findIndex((code) => /\*$/.test(code));
  const visibleRiichiTileIndex = riichiTileIndex >= 0
    ? riverCodes.slice(0, riichiTileIndex + 1).filter((code) => !/[\+\=\-]$/.test(code)).length - 1
    : -1;

  return {
    seat: seatKey,
    handTiles,
    melds,
    riverTiles,
    riichi: {
      active: visibleRiichiTileIndex >= 0,
      tileIndex: visibleRiichiTileIndex
    }
  };
}

function getLegalActionSummary(board, seatIndex, tileCode = null, ruleOverrides = {}) {
  const shoupai = board.shoupai[seatIndex].clone();
  const rule = createRule(ruleOverrides);
  return {
    dapai: getDiscardCandidates(rule, shoupai),
    xiangting: calculateXiangting(shoupai),
    tingpai: getTingpai(shoupai),
    hule: tileCode ? Majiang.Game.allow_hule(rule, shoupai, tileCode, board.zhuangfeng, seatIndex, false, true) : false
  };
}

module.exports = {
  Majiang,
  createBoard,
  createShoupaiFromString,
  validateMeldString,
  getRiichiChoices,
  getDiscardCandidates,
  calculateXiangting,
  getTingpai,
  createHuleParam,
  SEAT_KEYS,
  createRule,
  createRoundConfig,
  buildInitialBoardState,
  getSeatKeyByIndex,
  getSeatIndexByKey,
  toFrontendTile,
  shoupaiToFrontendTiles,
  extractMelds,
  getVisibleSeatState,
  getLegalActionSummary,
  calculateHule,
  allowNoDaopai,
  clone
};
