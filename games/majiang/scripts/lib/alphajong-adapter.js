'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const coreAdapter = require('../../engine/base/majiang-core-adapter');

const DEFAULT_ALPHAJONG_ROOT = path.join(process.env.HOME || '/Users/liuhang', 'Documents', 'AlphaJong');
const SOURCE_FILES = Object.freeze([
  'src/parameters.js',
  'src/logging.js',
  'src/utils.js',
  'src/yaku.js',
  'src/ai_defense.js',
  'src/ai_offense.js'
]);
const SEATS = Object.freeze(['bottom', 'right', 'top', 'left']);
const SUIT_TO_ALPHA_TYPE = Object.freeze({ p: 0, m: 1, s: 2, z: 3 });
const ALPHA_TYPE_TO_SUIT = Object.freeze({ 0: 'p', 1: 'm', 2: 's', 3: 'z' });
const ALPHA_OPERATIONS = Object.freeze({
  liqi: 'liqi',
  eat: 'eat',
  peng: 'peng',
  mingGang: 'ming_gang',
  anGang: 'an_gang',
  addGang: 'add_gang'
});

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function normalizeTileCode(code) {
  return typeof code === 'string' ? code.replace(/[\*_\+\=\-]+$/g, '') : null;
}

function canonicalTileCode(code) {
  const normalized = normalizeTileCode(code);
  if (!normalized || normalized.length < 2) return null;
  const suit = normalized[0];
  const rank = normalized[1] === '0' ? '5' : normalized[1];
  return `${suit}${rank}`;
}

function resolveCandidateTileCode(tileCode, candidates = []) {
  const normalized = normalizeTileCode(tileCode);
  if (!normalized) return null;
  const list = Array.isArray(candidates) ? candidates : Array.from(candidates || []);
  if (list.includes(normalized)) return normalized;
  const target = canonicalTileCode(normalized);
  return list.find((candidate) => canonicalTileCode(candidate) === target) || normalized;
}

function toAlphaTile(code, options = {}) {
  const normalized = normalizeTileCode(code);
  if (!normalized || normalized.length < 2) return null;
  const suit = normalized[0];
  const rawRank = normalized[1];
  const type = SUIT_TO_ALPHA_TYPE[suit];
  const rank = Number(rawRank === '0' ? 5 : rawRank);
  if (!Number.isInteger(type) || !Number.isInteger(rank)) return null;
  return {
    index: rank,
    type,
    dora: rawRank === '0',
    doraValue: 0,
    valid: options.valid !== false,
    from: Number.isInteger(options.from) ? options.from : 0,
    tsumogiri: options.tsumogiri === true,
    code: `${suit}${rawRank === '0' ? '5' : rawRank}`
  };
}

function fromAlphaTile(tile) {
  if (!tile || typeof tile !== 'object') return null;
  const suit = ALPHA_TYPE_TO_SUIT[tile.type];
  const rank = Number(tile.index);
  if (!suit || !Number.isInteger(rank)) return null;
  return `${suit}${rank}`;
}

function localToAlphaTileName(code) {
  const normalized = normalizeTileCode(code);
  if (!normalized || normalized.length < 2) return null;
  const suit = normalized[0];
  const rank = normalized[1];
  if (!SUIT_TO_ALPHA_TYPE.hasOwnProperty(suit) || !/\d/.test(rank)) return null;
  return `${rank}${suit}`;
}

function alphaNameToLocalTileCode(name) {
  const text = String(name || '');
  if (text.length < 2) return null;
  const rank = text[0];
  const suit = text[1];
  if (!SUIT_TO_ALPHA_TYPE.hasOwnProperty(suit) || !/\d/.test(rank)) return null;
  return `${suit}${rank}`;
}

function parseMeldTiles(meld, from = 0) {
  const text = String(meld || '');
  const suit = text[0];
  if (!SUIT_TO_ALPHA_TYPE.hasOwnProperty(suit)) return [];
  return (text.match(/\d/g) || [])
    .map((digit) => toAlphaTile(`${suit}${digit}`, { from }))
    .filter(Boolean);
}

function getSeatIndex(runtime, seatKey) {
  return runtime && typeof runtime.getSeatIndex === 'function' ? runtime.getSeatIndex(seatKey) : -1;
}

function getRelativeSeatKey(seatKey, relativeIndex) {
  const seatIndex = SEATS.indexOf(seatKey);
  if (seatIndex < 0) return SEATS[relativeIndex] || 'bottom';
  return SEATS[(seatIndex + relativeIndex) % SEATS.length];
}

function getRelativeSeatIndex(seatKey, relativeIndex) {
  const key = getRelativeSeatKey(seatKey, relativeIndex);
  return SEATS.indexOf(key);
}

function getRoundConfigValue(runtime, key, fallback = 0) {
  if (runtime && runtime.roundConfig && runtime.roundConfig[key] != null) {
    return Number(runtime.roundConfig[key]) || 0;
  }
  if (runtime && runtime.board && runtime.board[key] != null) {
    return Number(runtime.board[key]) || 0;
  }
  return fallback;
}

function getSeatWindForRelative(runtime, seatKey, relativeIndex) {
  const absoluteSeat = getRelativeSeatIndex(seatKey, relativeIndex);
  const jushu = getRoundConfigValue(runtime, 'jushu', 0);
  if (absoluteSeat < 0) return 1;
  return ((4 + absoluteSeat - jushu) % 4) + 1;
}

function getSeatScore(runtime, seatKey) {
  const index = getSeatIndex(runtime, seatKey);
  return index >= 0 && runtime && runtime.board && Array.isArray(runtime.board.defen)
    ? Number(runtime.board.defen[index] || 0)
    : 25000;
}

function getMeldsForSeat(runtime, absoluteSeatIndex, perspectiveSeatKey) {
  const shoupai = runtime && runtime.board && Array.isArray(runtime.board.shoupai)
    ? runtime.board.shoupai[absoluteSeatIndex]
    : null;
  const melds = shoupai && Array.isArray(shoupai._fulou) ? shoupai._fulou : [];
  return melds.flatMap((meld) => parseMeldTiles(meld, getSeatIndex(runtime, perspectiveSeatKey)));
}

function getDiscardsForSeat(runtime, absoluteSeatIndex) {
  const he = runtime && runtime.board && Array.isArray(runtime.board.he)
    ? runtime.board.he[absoluteSeatIndex]
    : null;
  const river = he && Array.isArray(he._pai) ? he._pai : [];
  return river
    .filter((code) => typeof code === 'string' && !/[\+\=\-]$/.test(code))
    .map((code) => toAlphaTile(code, { tsumogiri: /_$/.test(code) }))
    .filter(Boolean);
}

function getRiichiTileForSeat(runtime, absoluteSeatIndex) {
  const he = runtime && runtime.board && Array.isArray(runtime.board.he)
    ? runtime.board.he[absoluteSeatIndex]
    : null;
  const river = he && Array.isArray(he._pai) ? he._pai : [];
  const riichiDiscard = river.find((code) => typeof code === 'string' && /\*$/.test(code));
  return riichiDiscard ? toAlphaTile(riichiDiscard) : null;
}

function isRiichiSeat(runtime, seatKey) {
  const state = runtime && runtime.riichiState && runtime.riichiState[seatKey]
    ? runtime.riichiState[seatKey]
    : null;
  if (state && state.declared === true) return true;
  const seatIndex = getSeatIndex(runtime, seatKey);
  const he = runtime && runtime.board && Array.isArray(runtime.board.he)
    ? runtime.board.he[seatIndex]
    : null;
  const river = he && Array.isArray(he._pai) ? he._pai : [];
  return river.some((code) => typeof code === 'string' && /\*$/.test(code));
}

function buildAlphaState(runtime, seatKey) {
  const seatIndex = getSeatIndex(runtime, seatKey);
  if (seatIndex < 0) return null;
  const shoupai = runtime && runtime.board && Array.isArray(runtime.board.shoupai)
    ? runtime.board.shoupai[seatIndex]
    : null;
  const handCodes = runtime && typeof runtime.getSeatHandCodes === 'function'
    ? runtime.getSeatHandCodes(seatKey)
    : [];
  if (!shoupai || !Array.isArray(handCodes) || !handCodes.length) return null;

  const candidates = new Set(
    (coreAdapter.getDiscardCandidates(runtime.rule, shoupai.clone ? shoupai.clone() : shoupai) || [])
      .map((candidate) => normalizeTileCode(candidate && candidate.tileCode ? candidate.tileCode : candidate))
      .filter(Boolean)
  );
  const ownHand = handCodes
    .map((code) => {
      const normalized = normalizeTileCode(code);
      return toAlphaTile(normalized, {
        valid: candidates.size <= 0 || candidates.has(normalized)
      });
    })
    .filter(Boolean);
  const wallState = runtime && typeof runtime.getWallState === 'function' ? runtime.getWallState() : {};
  const dora = (Array.isArray(wallState.baopai) ? wallState.baopai : [])
    .map((code) => toAlphaTile(code))
    .filter(Boolean);

  const discards = SEATS.map((_, relativeIndex) => {
    const absoluteSeatIndex = getRelativeSeatIndex(seatKey, relativeIndex);
    return getDiscardsForSeat(runtime, absoluteSeatIndex);
  });
  const calls = SEATS.map((_, relativeIndex) => {
    const absoluteSeatIndex = getRelativeSeatIndex(seatKey, relativeIndex);
    return getMeldsForSeat(runtime, absoluteSeatIndex, seatKey);
  });
  const riichi = SEATS.map((_, relativeIndex) => isRiichiSeat(runtime, getRelativeSeatKey(seatKey, relativeIndex)));
  const riichiTiles = SEATS.map((_, relativeIndex) => {
    const absoluteSeatIndex = getRelativeSeatIndex(seatKey, relativeIndex);
    return getRiichiTileForSeat(runtime, absoluteSeatIndex);
  });
  const scores = SEATS.map((_, relativeIndex) => getSeatScore(runtime, getRelativeSeatKey(seatKey, relativeIndex)));
  const handSizes = SEATS.map((_, relativeIndex) => {
    if (relativeIndex === 0) return ownHand.length;
    const callCount = Math.floor((calls[relativeIndex] || []).length / 3);
    return Math.max(1, 13 - (callCount * 3));
  });

  return {
    seatKey,
    ownHand,
    dora,
    discards,
    calls,
    riichi,
    riichiTiles,
    scores,
    handSizes,
    candidates,
    isClosed: Array.isArray(shoupai._fulou) ? shoupai._fulou.length === 0 : true,
    seatWind: getSeatWindForRelative(runtime, seatKey, 0),
    roundWind: getRoundConfigValue(runtime, 'zhuangfeng', 0) + 1,
    round: getRoundConfigValue(runtime, 'jushu', 0) + 1,
    tilesLeft: Number(wallState && wallState.remaining != null ? wallState.remaining : 0) || 0
  };
}

function getLegalRiichiChoices(runtime, seatKey, seatIndex) {
  const shoupai = runtime && runtime.board && Array.isArray(runtime.board.shoupai)
    ? runtime.board.shoupai[seatIndex]
    : null;
  if (!runtime || !shoupai || typeof coreAdapter.getRiichiChoices !== 'function') return [];
  const wallState = typeof runtime.getWallState === 'function' ? runtime.getWallState() : {};
  const playerIndex = typeof runtime.getPlayerIdentityIndex === 'function'
    ? runtime.getPlayerIdentityIndex(seatKey)
    : seatIndex;
  const score = runtime.board && Array.isArray(runtime.board.defen)
    ? Number(runtime.board.defen[playerIndex] || 0)
    : 25000;
  try {
    return (coreAdapter.getRiichiChoices(
      runtime.rule,
      shoupai.clone ? shoupai.clone() : shoupai,
      Number(wallState && wallState.remaining || 0),
      score
    ) || [])
      .map((choice) => normalizeTileCode(choice))
      .filter(Boolean);
  } catch {
    return [];
  }
}

function compactPriority(priority) {
  if (!priority || typeof priority !== 'object') return null;
  return {
    tileCode: fromAlphaTile(priority.tile),
    priority: Number.isFinite(Number(priority.priority)) ? Number(priority.priority) : null,
    shanten: Number.isFinite(Number(priority.shanten)) ? Number(priority.shanten) : null,
    efficiency: Number.isFinite(Number(priority.efficiency)) ? Number(priority.efficiency) : null,
    danger: Number.isFinite(Number(priority.danger)) ? Number(priority.danger) : null,
    waits: Number.isFinite(Number(priority.waits)) ? Number(priority.waits) : null,
    yakuOpen: priority.yaku && Number.isFinite(Number(priority.yaku.open)) ? Number(priority.yaku.open) : null,
    yakuClosed: priority.yaku && Number.isFinite(Number(priority.yaku.closed)) ? Number(priority.yaku.closed) : null,
    scoreOpen: priority.score && Number.isFinite(Number(priority.score.open)) ? Number(priority.score.open) : null,
    scoreClosed: priority.score && Number.isFinite(Number(priority.score.closed)) ? Number(priority.score.closed) : null,
    scoreRiichi: priority.score && Number.isFinite(Number(priority.score.riichi)) ? Number(priority.score.riichi) : null,
    riichiPriority: Number.isFinite(Number(priority.riichiPriority)) ? Number(priority.riichiPriority) : null,
    safe: Number.isFinite(Number(priority.safe)) ? Number(priority.safe) : null
  };
}

function getActionHandTileCodes(action) {
  const payload = action && action.payload && typeof action.payload === 'object'
    ? action.payload
    : {};
  if (payload.preview && Array.isArray(payload.preview.handTileCodes)) {
    return payload.preview.handTileCodes.map(normalizeTileCode).filter(Boolean);
  }
  const meldString = String(payload.meldString || payload.meld || '');
  const suit = meldString[0];
  const digits = meldString.match(/\d/g) || [];
  const claimed = canonicalTileCode(payload.tileCode);
  let removedClaim = false;
  return digits
    .map((digit) => `${suit}${digit}`)
    .filter((code) => {
      if (!removedClaim && claimed && canonicalTileCode(code) === claimed) {
        removedClaim = true;
        return false;
      }
      return true;
    });
}

function actionToAlphaCombination(action) {
  const handTileCodes = getActionHandTileCodes(action);
  if (!handTileCodes.length) return null;
  const alphaTiles = handTileCodes.map(localToAlphaTileName).filter(Boolean);
  return alphaTiles.length === handTileCodes.length ? alphaTiles.join('|') : null;
}

function inferKanType(meldString, isReactionKan = false) {
  const normalized = String(meldString || '');
  if (!normalized) return isReactionKan ? 'kan-open' : 'kan-concealed';
  if (/\d{3}[\+\=\-]\d$/.test(normalized)) return 'kan-added';
  if (isReactionKan || /[\+\=\-]/.test(normalized)) return 'kan-open';
  return 'kan-concealed';
}

function getKanTypeForAction(action, isReactionKan = false) {
  const payload = action && action.payload && typeof action.payload === 'object'
    ? action.payload
    : {};
  if (typeof payload.kanType === 'string' && payload.kanType) return payload.kanType;
  return inferKanType(payload.meldString || payload.meld, isReactionKan || Boolean(payload.fromSeat));
}

function getKanTileCodeFromAction(action) {
  const payload = action && action.payload && typeof action.payload === 'object'
    ? action.payload
    : {};
  const explicit = normalizeTileCode(payload.tileCode);
  if (explicit) return explicit;
  const meldString = String(payload.meldString || payload.meld || '');
  const suit = meldString[0];
  const digits = meldString.match(/\d/g) || [];
  if (!SUIT_TO_ALPHA_TYPE.hasOwnProperty(suit) || !digits.length) return null;
  return `${suit}${digits[digits.length - 1]}`;
}

function actionToAlphaKanCombination(action) {
  const tileCode = getKanTileCodeFromAction(action);
  const alphaName = localToAlphaTileName(tileCode);
  return alphaName ? [alphaName] : [];
}

function getAlphaKanOperationForAction(action, isReactionKan = false) {
  const kanType = getKanTypeForAction(action, isReactionKan);
  if (kanType === 'kan-added') return ALPHA_OPERATIONS.addGang;
  if (kanType === 'kan-concealed') return ALPHA_OPERATIONS.anGang;
  return ALPHA_OPERATIONS.mingGang;
}

function getSeatShoupai(runtime, seatKey) {
  const seatIndex = getSeatIndex(runtime, seatKey);
  return seatIndex >= 0 && runtime && runtime.board && Array.isArray(runtime.board.shoupai)
    ? runtime.board.shoupai[seatIndex]
    : null;
}

function calculateSafeXiangting(shoupai) {
  if (!shoupai || typeof shoupai.clone !== 'function') return null;
  try {
    const xiangting = coreAdapter.calculateXiangting(shoupai.clone());
    return Number.isFinite(Number(xiangting)) ? Number(xiangting) : null;
  } catch {
    return null;
  }
}

function calculateSafeTingpaiCount(shoupai) {
  if (!shoupai || typeof shoupai.clone !== 'function' || typeof coreAdapter.getTingpai !== 'function') return 0;
  try {
    return (coreAdapter.getTingpai(shoupai.clone()) || []).length;
  } catch {
    return 0;
  }
}

function isYakuhaiPengAction(action, state) {
  const payload = action && action.payload && typeof action.payload === 'object'
    ? action.payload
    : {};
  if (payload.callType !== 'peng') return false;
  const tileCode = canonicalTileCode(payload.tileCode);
  if (!tileCode || tileCode[0] !== 'z') return false;
  const rank = Number(tileCode[1]);
  if (!Number.isInteger(rank)) return false;
  return rank >= 5 || rank === Number(state && state.seatWind) || rank === Number(state && state.roundWind);
}

function buildAlphaJongCallMetrics(runtime, seatKey, action, state) {
  const shoupai = getSeatShoupai(runtime, seatKey);
  const payload = action && action.payload && typeof action.payload === 'object'
    ? action.payload
    : {};
  const meldString = typeof payload.meldString === 'string'
    ? payload.meldString
    : (typeof payload.meld === 'string' ? payload.meld : null);
  const callType = typeof payload.callType === 'string' ? payload.callType : null;
  const currentXiangting = calculateSafeXiangting(shoupai);
  const currentTingpaiCount = calculateSafeTingpaiCount(shoupai);
  let nextXiangting = null;
  let nextTingpaiCount = 0;
  let simulationOk = false;
  let simulationError = null;

  if (shoupai && typeof shoupai.clone === 'function' && meldString) {
    try {
      const simulated = shoupai.clone();
      simulated.fulou(meldString);
      nextXiangting = calculateSafeXiangting(simulated);
      nextTingpaiCount = calculateSafeTingpaiCount(simulated);
      simulationOk = Number.isFinite(Number(nextXiangting));
      if (!simulationOk) simulationError = 'xiangting-unavailable-after-fulou';
    } catch (error) {
      nextXiangting = null;
      nextTingpaiCount = 0;
      simulationError = error && error.message ? String(error.message).slice(0, 120) : 'fulou-simulation-failed';
    }
  } else if (!meldString) {
    simulationError = 'missing-meld-string';
  } else {
    simulationError = 'missing-shoupai-clone';
  }

  const closedHandBefore = Boolean(shoupai && Array.isArray(shoupai._fulou) && shoupai._fulou.length === 0);
  const xiangtingDelta = Number.isFinite(currentXiangting) && Number.isFinite(nextXiangting)
    ? nextXiangting - currentXiangting
    : null;

  return {
    adapter: 'alphajong-core',
    callType,
    actionKey: action && typeof action.key === 'string' ? action.key : null,
    meldString,
    combination: actionToAlphaCombination(action),
    claimedTile: normalizeTileCode(payload.tileCode),
    simulationOk,
    simulationError,
    currentXiangting,
    nextXiangting,
    xiangtingDelta,
    currentTingpaiCount,
    nextTingpaiCount,
    closedHandBefore,
    isYakuhaiPeng: isYakuhaiPengAction(action, state)
  };
}

function buildAlphaJongKanMetrics(runtime, seatKey, action, state) {
  const shoupai = getSeatShoupai(runtime, seatKey);
  const payload = action && action.payload && typeof action.payload === 'object'
    ? action.payload
    : {};
  const meldString = typeof payload.meldString === 'string'
    ? payload.meldString
    : (typeof payload.meld === 'string' ? payload.meld : null);
  const isReactionKan = Boolean(payload.fromSeat);
  const kanType = getKanTypeForAction(action, isReactionKan);
  const operation = getAlphaKanOperationForAction(action, isReactionKan);
  const claimedTile = getKanTileCodeFromAction(action);
  const currentXiangting = calculateSafeXiangting(shoupai);
  let nextXiangting = null;
  let simulationOk = false;
  let simulationError = null;

  if (shoupai && typeof shoupai.clone === 'function' && meldString) {
    try {
      const simulated = shoupai.clone();
      if (isReactionKan) simulated.fulou(meldString);
      else simulated.gang(meldString);
      nextXiangting = calculateSafeXiangting(simulated);
      simulationOk = Number.isFinite(Number(nextXiangting));
      if (!simulationOk) simulationError = 'xiangting-unavailable-after-kan';
    } catch (error) {
      nextXiangting = null;
      simulationError = error && error.message ? String(error.message).slice(0, 120) : 'kan-simulation-failed';
    }
  } else if (!meldString) {
    simulationError = 'missing-meld-string';
  } else {
    simulationError = 'missing-shoupai-clone';
  }

  const wallState = runtime && typeof runtime.getWallState === 'function' ? runtime.getWallState() : {};
  const closedHandBefore = Boolean(shoupai && Array.isArray(shoupai._fulou) && shoupai._fulou.length === 0);
  const xiangtingDelta = Number.isFinite(currentXiangting) && Number.isFinite(nextXiangting)
    ? nextXiangting - currentXiangting
    : null;

  return {
    adapter: 'alphajong-core',
    kanType,
    operation,
    actionKey: action && typeof action.key === 'string' ? action.key : null,
    meldString,
    claimedTile,
    simulationOk,
    simulationError,
    currentXiangting,
    nextXiangting,
    xiangtingDelta,
    closedHandBefore,
    doraIndicatorCountBefore: Array.isArray(wallState && wallState.baopai) ? wallState.baopai.length : 0
  };
}

function compactFiniteNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value) : undefined;
}

function buildAlphaJongCallReasons(id, callType, callMetrics) {
  const reasons = [id, `alphajong-${callType}-accepted`];
  if (callMetrics && callMetrics.simulationOk === true) {
    reasons.push('alphajong-call-simulation-ok');
  } else {
    reasons.push('alphajong-call-simulation-missing');
  }
  if (callMetrics && callMetrics.isYakuhaiPeng === true) {
    reasons.push('alphajong-yakuhai-peng');
  }
  if (
    callMetrics
    && Number.isFinite(Number(callMetrics.currentXiangting))
    && Number.isFinite(Number(callMetrics.nextXiangting))
  ) {
    if (Number(callMetrics.nextXiangting) < Number(callMetrics.currentXiangting)) {
      reasons.push('alphajong-call-improves-xiangting');
      if (Number(callMetrics.nextXiangting) === 0) reasons.push('alphajong-call-direct-tenpai');
    } else if (Number(callMetrics.nextXiangting) === Number(callMetrics.currentXiangting)) {
      reasons.push('alphajong-call-flat-xiangting');
    } else if (Number(callMetrics.nextXiangting) > Number(callMetrics.currentXiangting)) {
      reasons.push('alphajong-call-backstep-xiangting');
    }
  }
  return reasons;
}

function buildAlphaJongKanReasons(id, kanMetrics) {
  const kanType = kanMetrics && kanMetrics.kanType ? kanMetrics.kanType : 'kan-open';
  const reasons = [id, 'alphajong-kan-accepted', `alphajong-${kanType}-accepted`];
  if (kanMetrics && kanMetrics.operation) reasons.push(`alphajong-${kanMetrics.operation}-accepted`);
  if (kanMetrics && kanMetrics.simulationOk === true) {
    reasons.push('alphajong-kan-simulation-ok');
  } else {
    reasons.push('alphajong-kan-simulation-missing');
  }
  return reasons;
}

function compactAlphaRiichiPriority(priority = {}) {
  const tileCode = alphaNameToLocalTileCode(priority.tileName);
  return {
    tileCode,
    priority: compactFiniteNumber(priority.priority),
    shanten: compactFiniteNumber(priority.shanten),
    waits: compactFiniteNumber(priority.waits),
    danger: compactFiniteNumber(priority.danger),
    scoreRiichi: compactFiniteNumber(priority.scoreRiichi),
    yakuClosed: compactFiniteNumber(priority.yakuClosed),
    riichiPriority: compactFiniteNumber(priority.riichiPriority)
  };
}

function compactAlphaRiichiDiagnostics(rawInput = {}, finalTileCode = null) {
  const raw = rawInput && typeof rawInput === 'object' ? rawInput : {};
  const legalChoices = Array.isArray(raw.legalChoices)
    ? raw.legalChoices.map(alphaNameToLocalTileCode).filter(Boolean)
    : [];
  const legalChoiceKeys = new Set(legalChoices.map(canonicalTileCode).filter(Boolean));
  const selectedIsLegalRiichiChoice = Boolean(
    finalTileCode
    && legalChoiceKeys.size
    && legalChoiceKeys.has(canonicalTileCode(finalTileCode))
  );
  const bestLegalRiichiPriority = raw.bestLegalRiichiPriority
    ? compactAlphaRiichiPriority(raw.bestLegalRiichiPriority)
    : null;

  return {
    legalChoiceCount: Number.isFinite(Number(raw.legalChoiceCount)) ? Number(raw.legalChoiceCount) : legalChoices.length,
    legalChoices: legalChoices.slice(0, 8),
    canRiichi: raw.canRiichi === true,
    alphaJongRiichi: raw.alphaJongRiichi === true,
    fold: raw.fold === true,
    decisionType: typeof raw.decisionType === 'string' ? raw.decisionType : null,
    decisionTileCode: raw.decisionTile ? alphaNameToLocalTileCode(raw.decisionTile) : null,
    selectedTileCode: finalTileCode,
    selectedIsLegalRiichiChoice,
    bestLegalRiichiPriority,
    rejectReason: typeof raw.rejectReason === 'string' ? raw.rejectReason : null
  };
}

function patchAlphaJongSource(file, source) {
  if (!file.endsWith('src/ai_offense.js')) return source;
  return String(source || '')
    .replace(/async function callTriple/g, 'function callTriple')
    .replace(/async function getTilePriorities/g, 'function getTilePriorities')
    .replace(/async function discard/g, 'function discard')
    .replace(/await getTilePriorities\(/g, 'getTilePriorities(')
    .replace(/\s*await new Promise\(r => setTimeout\(r, 10\)\);\s*/g, '\n')
    .replace(/return Promise\.resolve\(tiles\);/g, 'return tiles;');
}

function createSandbox(rootDir) {
  const sourcePaths = SOURCE_FILES.map((file) => path.join(rootDir, file));
  sourcePaths.forEach((file) => {
    if (!fs.existsSync(file)) throw new Error(`AlphaJong source file missing: ${file}`);
  });

  const sandbox = {
    console: { log: () => {} },
    document: { body: { innerHTML: '' } },
    window: {
      localStorage: {
        getItem: () => null,
        setItem: () => {}
      }
    },
    setTimeout: (callback) => {
      if (typeof callback === 'function') callback();
      return 0;
    },
    clearTimeout: () => {}
  };
  sandbox.globalThis = sandbox;
  const context = vm.createContext(sandbox);
  sourcePaths.forEach((file) => {
    const source = patchAlphaJongSource(file, fs.readFileSync(file, 'utf8'));
    vm.runInContext(source, context, { filename: file });
  });
  vm.runInContext(`
    function doesPlayerExist(player) { return player >= 0 && player < 4; }
    function localPosition2Seat(player) { return player; }
    function getSeatWind(player) { return __aceSeatWinds[player] || 1; }
    function getRoundWind() { return __aceRoundWind || 1; }
    function getRound() { return __aceRound || 1; }
    function isEastRound() { return __aceRoundWind === 1; }
    function getPlayerScore(player) { return __aceScores[player] || 25000; }
    function getPlayerLinkState() { return 1; }
    function getNumberOfTilesInHand(player) { return __aceHandSizes[player] || 13; }
    function getNumberOfKitaOfPlayer() { return 0; }
    function isPlayerRiichi(player) { return Boolean(__aceRiichi[player]); }
    function getCurrentRoom() { return 0; }
    function getOperationList() { return __aceOperations || []; }
    function getOperations() { return { liqi: 'liqi', eat: 'eat', peng: 'peng', ming_gang: 'ming_gang', an_gang: 'an_gang', add_gang: 'add_gang' }; }
    function getTileForCall() { return __aceCallTile || { index: 0, type: 0, dora: false, doraValue: 0 }; }
    function callDiscard(tileNumber) { __aceDecision = { type: 'discard', tileNumber: tileNumber }; }
    function sendRiichiCall(tile, moqie) { __aceDecision = { type: 'riichi', tile: tile, moqie: Boolean(moqie) }; }
    function makeCallWithOption(type, option) { __aceDecision = { type: 'call', operation: type, option: option }; }
    function makeCall(type) { __aceDecision = { type: 'call', operation: type, option: 0 }; }
    function declineCall(operation) { __aceDecision = { type: 'pass', operation: operation }; }
    function showCrtStrategyMsg() {}
	    function __aceCompactTile(tile) {
	      if (!tile || typeof tile != 'object') return null;
	      return { index: tile.index, type: tile.type };
	    }
	    function __aceCompactPriority(priority) {
	      if (!priority || typeof priority != 'object') return null;
	      return {
	        tileName: priority.tile ? getTileName(priority.tile) : null,
	        priority: Number.isFinite(Number(priority.priority)) ? Number(priority.priority) : null,
	        shanten: Number.isFinite(Number(priority.shanten)) ? Number(priority.shanten) : null,
	        waits: Number.isFinite(Number(priority.waits)) ? Number(priority.waits) : null,
	        danger: Number.isFinite(Number(priority.danger)) ? Number(priority.danger) : null,
	        scoreRiichi: priority.score && Number.isFinite(Number(priority.score.riichi)) ? Number(priority.score.riichi) : null,
	        yakuClosed: priority.yaku && Number.isFinite(Number(priority.yaku.closed)) ? Number(priority.yaku.closed) : null,
	        riichiPriority: Number.isFinite(Number(priority.riichiPriority)) ? Number(priority.riichiPriority) : null
	      };
	    }
	    function __aceNormalizeRiichiName(name) {
	      if (!name || typeof name != 'string' || name.length < 2) return null;
	      return (name.charAt(0) == '0' ? '5' : name.charAt(0)) + name.charAt(1);
	    }
	    function __aceGetRiichiCombinations() {
	      var operations = getOperationList() || [];
	      for (var i = 0; i < operations.length; i++) {
	        if (operations[i] && operations[i].type == getOperations().liqi && Array.isArray(operations[i].combination)) {
	          return operations[i].combination.slice();
	        }
	      }
	      return [];
	    }
	    function __aceBuildRiichiDiagnostics(tiles, fold, riichi, decision) {
	      var legalChoices = __aceGetRiichiCombinations();
	      var legalKeys = legalChoices.map(__aceNormalizeRiichiName).filter(Boolean);
	      var bestLegal = null;
	      for (var i = 0; i < (tiles || []).length; i++) {
	        var tileName = tiles[i] && tiles[i].tile ? getTileName(tiles[i].tile) : null;
	        if (legalKeys.indexOf(__aceNormalizeRiichiName(tileName)) >= 0) {
	          bestLegal = tiles[i];
	          break;
	        }
	      }
	      var rejectReason = null;
	      if (legalChoices.length <= 0) {
	        rejectReason = 'alphajong-riichi-no-legal-choice';
	      }
	      else if (fold) {
	        rejectReason = 'alphajong-riichi-skip-fold';
	      }
	      else if (riichi) {
	        rejectReason = null;
	      }
	      else if (!bestLegal) {
	        rejectReason = 'alphajong-riichi-no-priority-match';
	      }
	      else {
	        rejectReason = 'alphajong-riichi-declined-by-policy';
	      }
	      return {
	        legalChoiceCount: legalChoices.length,
	        legalChoices: legalChoices.slice(0, 8),
	        canRiichi: canRiichi(),
	        alphaJongRiichi: Boolean(riichi),
	        fold: Boolean(fold),
	        decisionType: decision && decision.type ? decision.type : null,
	        decisionTile: decision && decision.tile ? decision.tile : null,
	        bestLegalRiichiPriority: __aceCompactPriority(bestLegal),
	        rejectReason: rejectReason
	      };
	    }
	    function __aceRebuildStateMemory() {
	      riichiTiles = (__aceRiichiTiles || [null, null, null, null]).map(function (tile) {
	        return tile ? Object.assign({}, tile) : null;
      });
      playerDiscardSafetyList = [[], [], [], []];
      try {
        updateAvailableTiles();
      } catch (error) {}
      for (var player = 0; player < 4; player++) {
        var river = discards[player] || [];
        for (var i = 0; i < river.length; i++) {
          var danger = -1;
          try {
            danger = getTileDanger(river[i], player);
          } catch (error) {
            danger = -1;
          }
          if (river[i] && river[i].tsumogiri && danger < 0.01) {
            danger = 0.05;
          }
          playerDiscardSafetyList[player].push(Number.isFinite(Number(danger)) ? Number(danger) : -1);
        }
      }
      __aceStateMemorySummary = {
        riichiTileCount: riichiTiles.filter(Boolean).length,
        riichiTiles: riichiTiles.map(__aceCompactTile),
        discardSafetyListLengths: playerDiscardSafetyList.map(function (list) { return list.length; }),
        lastDiscardSafety: playerDiscardSafetyList.map(function (list) {
          return list.slice(-3).map(function (value) {
            return Number.isFinite(Number(value)) ? Math.round(Number(value) * 1000) / 1000 : null;
          });
        })
      };
      return __aceStateMemorySummary;
    }

    function __aceEvaluateDiscard() {
      updateAvailableTiles();
      determineStrategy();
      __aceDecision = null;
      var tiles = [];
      if (strategy == STRATEGIES.CHIITOITSU) {
        tiles = chiitoitsuPriorities();
      }
      else if (strategy == STRATEGIES.THIRTEEN_ORPHANS) {
        tiles = thirteenOrphansPriorities();
      }
      else {
        for (var i = 0; i < ownHand.length; i++) {
          var hand = ownHand.slice();
          hand.splice(i, 1);
          if (tiles.filter(t => isSameTile(t.tile, ownHand[i], true)).length > 0) continue;
          tiles.push(getHandValues(hand, ownHand[i]));
        }
      }
      tiles.sort(function (p1, p2) { return p2.priority - p1.priority; });
      tiles = sortOutUnsafeTiles(tiles);
      if (KEEP_SAFETILE) tiles = keepSafetile(tiles);

      var selected = null;
      var fold = strategy == STRATEGIES.FOLD || tiles.filter(t => t.safe).length == 0;
      if (fold) {
        tiles.sort(function (p1, p2) {
          return p1.danger - p2.danger || p2.priority - p1.priority;
        });
        selected = tiles[0] || null;
      }
      else {
        var selectedTile = getDiscardTile(tiles);
        selected = tiles.find(t => isSameTile(t.tile, selectedTile, true)) || tiles[0] || null;
      }
      var riichi = false;
      if (!fold && canRiichi()) {
        tiles.sort(function (p1, p2) {
          return p2.riichiPriority - p1.riichiPriority;
        });
        riichi = callRiichi(tiles);
        if (riichi && __aceDecision && __aceDecision.type == 'riichi') {
          var riichiTileCode = __aceDecision.tile;
          selected = tiles.find(function (tile) { return getTileName(tile.tile) == riichiTileCode; }) || selected;
        }
      }
	      return {
	        selected: selected,
	        priorities: tiles.slice(0, 6),
	        strategy: strategy,
	        fold: fold,
	        riichi: Boolean(riichi),
	        decision: __aceDecision,
	        riichiDiagnostics: __aceBuildRiichiDiagnostics(tiles, fold, riichi, __aceDecision)
	      };
	    }

    function __aceEvaluateCall(combinations, operationType, callTile) {
      updateAvailableTiles();
      determineStrategy();
      __aceDecision = null;
      __aceCallTile = callTile;
      isConsideringCall = true;
      var accepted = callTriple(combinations || [], operationType);
      isConsideringCall = false;
      return {
        accepted: Boolean(accepted),
        decision: __aceDecision,
        strategy: strategy,
        strategyAllowsCalls: Boolean(strategyAllowsCalls)
      };
    }

    function __aceEvaluateKan(operationType, combination, callTile) {
      updateAvailableTiles();
      determineStrategy();
      __aceDecision = null;
      __aceCallTile = callTile;
      isConsideringCall = true;
      var normalizedCombination = Array.isArray(combination)
        ? combination
        : (typeof combination == 'string' ? combination.split('|').filter(Boolean) : []);
      if (operationType == getOperations().an_gang) {
        callAnkan(normalizedCombination);
      }
      else if (operationType == getOperations().add_gang) {
        callShouminkan();
      }
      else {
        callDaiminkan();
      }
      isConsideringCall = false;
      return {
        accepted: Boolean(__aceDecision && __aceDecision.type == 'call'),
        decision: __aceDecision,
        strategy: strategy,
        strategyAllowsCalls: Boolean(strategyAllowsCalls)
      };
    }
  `, context, { filename: 'ace-alphajong-stubs.js' });
  return context;
}

function setSandboxState(context, state, options = {}) {
  const seatWinds = SEATS.map((_, index) => state.seatWind && index === 0 ? state.seatWind : ((state.seatWind + index - 1) % 4) + 1);
  context.ownHand = clone(state.ownHand);
  context.dora = clone(state.dora);
  context.discards = clone(state.discards);
  context.calls = clone(state.calls);
  context.availableTiles = [];
  context.visibleTiles = [];
  context.tilesLeft = state.tilesLeft;
  context.tileLeft = state.tilesLeft;
  context.PERFORMANCE_MODE = 0;
  context.timeSave = 0;
  context.seatWind = state.seatWind;
  context.roundWind = state.roundWind;
  context.strategy = context.STRATEGIES ? context.STRATEGIES.GENERAL : 0;
  context.strategyAllowsCalls = true;
  context.isClosed = state.isClosed;
  context.isConsideringCall = false;
  context.totalPossibleWaits = {};
  context.__aceRiichi = clone(state.riichi);
  context.__aceRiichiTiles = clone(state.riichiTiles || [null, null, null, null]);
  context.__aceScores = clone(state.scores);
  context.__aceHandSizes = clone(state.handSizes);
  context.__aceSeatWinds = seatWinds;
  context.__aceRoundWind = state.roundWind;
  context.__aceRound = state.round;
  context.__aceOperations = Array.isArray(options.operations) ? clone(options.operations) : [];
  context.__aceCallTile = options.callTile ? clone(options.callTile) : null;
  context.__aceDecision = null;
  context.__aceStateMemorySummary = null;
  return typeof context.__aceRebuildStateMemory === 'function'
    ? clone(context.__aceRebuildStateMemory())
    : null;
}

function createAlphaJongAdapter(options = {}) {
  const rootDir = path.resolve(options.rootDir || process.env.ALPHAJONG_ROOT || DEFAULT_ALPHAJONG_ROOT);
  const mode = options.mode === 'core' || options.mode === 'alphajong-core'
    ? 'core'
    : 'discard-only';
  const id = mode === 'core' ? 'alphajong-core' : 'alphajong-discard-only';
  let context = null;
  let loadError = null;

  function getContext() {
    if (context) return context;
    try {
      context = createSandbox(rootDir);
    } catch (error) {
      loadError = error;
      throw error;
    }
    return context;
  }

  function evaluateRuntimeDiscard(runtime, seatKey) {
    const state = buildAlphaState(runtime, seatKey);
    if (!state) return null;
    const sandbox = getContext();
    const seatIndex = getSeatIndex(runtime, seatKey);
    const riichiChoices = mode === 'core'
      ? getLegalRiichiChoices(runtime, seatKey, seatIndex)
      : [];
    const operations = riichiChoices.length
      ? [{
          type: ALPHA_OPERATIONS.liqi,
          combination: riichiChoices.map(localToAlphaTileName).filter(Boolean)
        }]
      : [];
    const stateMemory = setSandboxState(sandbox, state, { operations });
    const result = sandbox.__aceEvaluateDiscard();
    const selected = result && result.selected ? result.selected : null;
    let tileCode = resolveCandidateTileCode(fromAlphaTile(selected && selected.tile), state.candidates);
    if (result && result.riichi && result.decision && result.decision.tile) {
      tileCode = resolveCandidateTileCode(alphaNameToLocalTileCode(result.decision.tile), state.candidates);
    }
    const candidates = Array.from(state.candidates);
    if (!tileCode || (state.candidates.size > 0 && !state.candidates.has(tileCode))) {
      tileCode = candidates[0] || (runtime.getSeatHandCodes(seatKey) || []).slice(-1)[0] || null;
    }
    if (!tileCode) return null;
	    const priority = selected ? compactPriority(selected) : null;
	    const top = Array.isArray(result && result.priorities)
	      ? result.priorities.map(compactPriority).filter(Boolean)
	      : [];
	    const handCodes = runtime.getSeatHandCodes(seatKey) || [];
	    const riichiDiagnostics = mode === 'core'
	      ? compactAlphaRiichiDiagnostics(result && result.riichiDiagnostics, tileCode)
	      : null;
	    return {
	      type: 'discard',
	      seatKey,
      tileCode,
      tileIndex: handCodes.findIndex((code) => normalizeTileCode(code) === tileCode || canonicalTileCode(code) === canonicalTileCode(tileCode)),
      shouldRiichi: mode === 'core' && Boolean(result && result.riichi),
      difficulty: 'external',
      policyId: id,
      metrics: {
        xiangting: priority && priority.shanten != null ? priority.shanten : null,
        tingpaiCount: priority && priority.waits != null ? priority.waits : 0,
        ukeireCount: 0,
        handValueEstimate: priority && priority.scoreClosed != null ? priority.scoreClosed : 0
      },
      reasons: [id, result && result.fold ? 'alphajong-fold' : 'alphajong-offense'].concat(
        mode === 'core' && result && result.riichi ? ['alphajong-riichi'] : []
      ),
      alphaJong: {
        sourceRoot: rootDir,
        mode,
        strategy: result && result.strategy != null ? result.strategy : null,
        fold: Boolean(result && result.fold),
	        riichi: mode === 'core' && Boolean(result && result.riichi),
	        riichiDiagnostics,
	        stateMemory,
	        selected: priority,
	        top
      }
    };
  }

  function evaluateRuntimeKanAction(runtime, seatKey, action, state, options = {}) {
    const review = evaluateRuntimeKanCandidate(runtime, seatKey, action, state, options);
    return review && review.action ? review.action : null;
  }

  function compactAlphaKanReview(review) {
    if (!review || typeof review !== 'object') return null;
    return {
      kanType: review.kanType || null,
      operation: review.operation || null,
      accepted: review.accepted === true,
      strategy: review.strategy || null,
      strategyAllowsCalls: review.strategyAllowsCalls === true,
      rejectReason: review.rejectReason || null
    };
  }

  function evaluateRuntimeKanCandidate(runtime, seatKey, action, state, options = {}) {
    if (!action || !action.payload || action.payload.seat !== seatKey) return null;
    const isReactionKan = Boolean(options.isReactionKan || action.payload.fromSeat);
    const sandbox = getContext();
    const kanType = getKanTypeForAction(action, isReactionKan);
    const operation = getAlphaKanOperationForAction(action, isReactionKan);
    const combination = actionToAlphaKanCombination(action);
    const callTile = toAlphaTile(getKanTileCodeFromAction(action));
    if (!callTile || (operation === ALPHA_OPERATIONS.anGang && !combination.length)) {
      return {
        accepted: false,
        action: null,
        stateMemory: null,
        kanType,
        operation,
        strategy: null,
        strategyAllowsCalls: false,
        rejectReason: 'alphajong-kan-invalid-action'
      };
    }
    const stateMemory = setSandboxState(sandbox, state, {
      operations: [{
        type: operation,
        combination
      }],
      callTile
    });
    const result = sandbox.__aceEvaluateKan(operation, combination, callTile);
    const decision = result && result.decision ? result.decision : null;
    const baseReview = {
      accepted: Boolean(result && result.accepted && decision && decision.type === 'call'),
      action: null,
      stateMemory,
      kanType,
      operation,
      strategy: result && result.strategy || null,
      strategyAllowsCalls: result && result.strategyAllowsCalls === true,
      rejectReason: null
    };
    if (!baseReview.accepted) {
      return {
        ...baseReview,
        rejectReason: decision && decision.type === 'pass'
          ? 'alphajong-kan-declined'
          : 'alphajong-kan-no-call-decision'
      };
    }

    const kanMetrics = buildAlphaJongKanMetrics(runtime, seatKey, action, state);
    const reasons = buildAlphaJongKanReasons(id, kanMetrics);
    return {
      ...baseReview,
      accepted: true,
      action: {
      ...action,
      aiDecision: {
        difficulty: 'external',
        policyId: id,
        reasons,
        metrics: {
          xiangting: compactFiniteNumber(kanMetrics.nextXiangting),
          tingpaiCount: 0,
          ukeireCount: 0,
          handValueEstimate: 0
        },
        hardKanMetrics: kanMetrics,
        alphaJong: {
          mode,
          kanType,
          operation,
          strategy: result.strategy || null,
          strategyAllowsCalls: result.strategyAllowsCalls === true,
          stateMemory,
          combination
        }
      }
      }
    };
  }

  function evaluateRuntimeTurnAction(runtime, seatKey, availableActions = []) {
    if (mode !== 'core') return null;
    const state = buildAlphaState(runtime, seatKey);
    if (!state) return null;
    const kanActions = (Array.isArray(availableActions) ? availableActions : [])
      .filter((action) => (
        action
        && action.type === 'kan'
        && action.payload
        && action.payload.seat === seatKey
      ));
    for (const action of kanActions) {
      const decision = evaluateRuntimeKanAction(runtime, seatKey, action, state, { isReactionKan: false });
      if (decision) return decision;
    }
    return null;
  }

  function evaluateRuntimeReaction(runtime, seatKey, availableActions = []) {
    if (mode !== 'core') return null;
    const state = buildAlphaState(runtime, seatKey);
    if (!state) return null;
    const kanActions = (Array.isArray(availableActions) ? availableActions : [])
      .filter((action) => (
        action
        && action.type === 'kan'
        && action.payload
        && action.payload.seat === seatKey
      ));
    let lastKanReview = null;
    for (const action of kanActions) {
      const kanReview = evaluateRuntimeKanCandidate(runtime, seatKey, action, state, { isReactionKan: true });
      if (kanReview) lastKanReview = kanReview;
      if (kanReview && kanReview.action) return kanReview.action;
    }

    const callActions = (Array.isArray(availableActions) ? availableActions : [])
      .filter((action) => (
        action
        && action.type === 'call'
        && action.payload
        && action.payload.seat === seatKey
        && (action.payload.callType === 'chi' || action.payload.callType === 'peng')
      ));
    if (!callActions.length) {
      if (!lastKanReview) return null;
      return {
        type: 'pass',
        seatKey,
        payload: { seat: seatKey },
        aiDecision: {
          difficulty: 'external',
          policyId: id,
          reasons: [id, 'alphajong-core-pass-reaction', lastKanReview.rejectReason || 'alphajong-kan-declined'],
          metrics: null,
          alphaJong: {
            mode,
            stateMemory: lastKanReview.stateMemory,
            kanReview: compactAlphaKanReview(lastKanReview)
          }
        }
      };
    }

    const sandbox = getContext();
    const grouped = ['peng', 'chi']
      .map((callType) => callActions.filter((action) => action.payload.callType === callType))
      .filter((actions) => actions.length);
    let lastStateMemory = null;

    for (const actions of grouped) {
      const callType = actions[0].payload.callType;
      const combinations = actions.map((action) => actionToAlphaCombination(action)).filter(Boolean);
      if (combinations.length !== actions.length) continue;
      const callTile = toAlphaTile(actions[0].payload.tileCode);
      const stateMemory = setSandboxState(sandbox, state, {
        operations: [{
          type: callType === 'chi' ? ALPHA_OPERATIONS.eat : ALPHA_OPERATIONS.peng,
          combination: combinations
        }],
        callTile
      });
      lastStateMemory = stateMemory;
      const result = sandbox.__aceEvaluateCall(
        combinations,
        callType === 'chi' ? ALPHA_OPERATIONS.eat : ALPHA_OPERATIONS.peng,
        callTile
      );
      const decision = result && result.decision ? result.decision : null;
      if (result && result.accepted && decision && decision.type === 'call') {
        const option = Number.isInteger(Number(decision.option)) ? Number(decision.option) : 0;
        const action = actions[option] || actions[0];
        const callMetrics = buildAlphaJongCallMetrics(runtime, seatKey, action, state);
        const reasons = buildAlphaJongCallReasons(id, callType, callMetrics);
        return {
          ...action,
          aiDecision: {
            difficulty: 'external',
            policyId: id,
            reasons,
            metrics: {
              xiangting: compactFiniteNumber(callMetrics.nextXiangting),
              tingpaiCount: callMetrics.nextTingpaiCount,
              ukeireCount: 0,
              handValueEstimate: 0
            },
            hardCallMetrics: callMetrics,
            alphaJong: {
              mode,
              callType,
              option,
              strategy: result.strategy || null,
              strategyAllowsCalls: result.strategyAllowsCalls === true,
              stateMemory,
              combinations
            }
          }
        };
      }
    }
    return {
      type: 'pass',
      seatKey,
      payload: { seat: seatKey },
      aiDecision: {
        difficulty: 'external',
        policyId: id,
        reasons: [id, 'alphajong-core-pass-reaction'],
        metrics: null,
        alphaJong: {
          mode,
          stateMemory: lastStateMemory,
          kanReview: compactAlphaKanReview(lastKanReview)
        }
      }
    };
  }

  return {
    id,
    rootDir,
    mode,
    isAvailable() {
      try {
        getContext();
        return true;
      } catch {
        return false;
      }
    },
    getLoadError() {
      return loadError ? (loadError.message || String(loadError)) : null;
    },
    evaluateRuntimeDiscard,
    evaluateRuntimeTurnAction,
    evaluateRuntimeReaction
  };
}

module.exports = {
  DEFAULT_ALPHAJONG_ROOT,
  createAlphaJongAdapter,
  normalizeTileCode,
  canonicalTileCode,
  resolveCandidateTileCode,
  localToAlphaTileName,
  alphaNameToLocalTileCode,
  actionToAlphaCombination,
  actionToAlphaKanCombination,
  inferKanType,
  toAlphaTile,
  fromAlphaTile,
  buildAlphaState,
  buildAlphaJongCallMetrics,
  buildAlphaJongKanMetrics
};
