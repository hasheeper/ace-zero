'use strict';

const { localTileToMjai, mjaiTileToLocal, normalizeLocalTileCode } = require('./tile-codec');
const { getClaimDirectionSuffix } = require('../../../shared/runtime/reaction/reaction-priority');

function parseLocalMeldString(meldString) {
  if (typeof meldString !== 'string' || meldString.length < 2) return null;
  const suit = meldString[0];
  const digits = (meldString.match(/\d/g) || []).map((digit) => Number(digit));
  const directionMatch = meldString.match(/[\+\=\-]/);
  const direction = directionMatch ? directionMatch[0] : null;
  if (!digits.length) return null;

  const uniqueCount = new Set(digits).size;
  let callType = 'chi';
  if (digits.length === 4) {
    callType = 'kan';
  } else if (uniqueCount < digits.length) {
    callType = 'peng';
  }

  return {
    suit,
    digits,
    direction,
    callType
  };
}

function buildConsumedTilesForMjai(meldString, claimedLocalTileCode) {
  const parsed = parseLocalMeldString(meldString);
  const claimed = normalizeLocalTileCode(claimedLocalTileCode);
  if (!parsed || !claimed) return [];

  const claimedRank = Number(claimed[1] === '0' ? '5' : claimed[1]);
  let consumedClaim = false;
  const localTiles = parsed.digits
    .map((digit) => `${parsed.suit}${digit}`)
    .filter((tileCode) => {
      const normalized = normalizeLocalTileCode(tileCode);
      const rank = Number(normalized[1] === '0' ? '5' : normalized[1]);
      if (!consumedClaim && normalized[0] === claimed[0] && rank === claimedRank) {
        consumedClaim = true;
        return false;
      }
      return true;
    });

  return localTiles.map((tileCode) => localTileToMjai(tileCode)).filter(Boolean);
}

function buildLocalMeldStringFromMjaiCall(callType, pai, consumed, actorPlayerId, targetPlayerId, seatMapper) {
  const claimedLocal = mjaiTileToLocal(pai);
  if (!claimedLocal || !Array.isArray(consumed)) return null;

  const actorSeat = seatMapper.playerIdToSeatKey(actorPlayerId);
  const targetSeat = seatMapper.playerIdToSeatKey(targetPlayerId);
  if (!actorSeat || !targetSeat) return null;

  const reactorIndex = seatMapper.seatKeys.indexOf(actorSeat);
  const discarderIndex = seatMapper.seatKeys.indexOf(targetSeat);
  const direction = getClaimDirectionSuffix(discarderIndex, reactorIndex);
  const localConsumed = consumed.map((tileCode) => mjaiTileToLocal(tileCode)).filter(Boolean);

  const allDigits = [claimedLocal, ...localConsumed]
    .map((tileCode) => Number(normalizeLocalTileCode(tileCode)[1] === '0' ? '5' : normalizeLocalTileCode(tileCode)[1]))
    .sort((left, right) => left - right);
  const meldDigits = `${allDigits.join('')}${direction}`;

  const suit = normalizeLocalTileCode(claimedLocal)[0];
  const normalizedType = callType === 'pon' ? 'peng' : callType;
  if (normalizedType === 'peng' || normalizedType === 'chi' || normalizedType === 'kan') {
    return `${suit}${meldDigits}`;
  }
  return null;
}

function buildLocalKanMeldStringFromMjaiKan(callType, payload, seatMapper) {
  if (!payload || typeof payload !== 'object') return null;
  const consumed = Array.isArray(payload.consumed) ? payload.consumed : [];

  if (callType === 'ankan') {
    if (consumed.length !== 4) return null;
    const localTiles = consumed.map((tileCode) => mjaiTileToLocal(tileCode)).filter(Boolean);
    if (localTiles.length !== 4) return null;
    const suit = normalizeLocalTileCode(localTiles[0])[0];
    const digits = localTiles
      .map((tileCode) => Number(normalizeLocalTileCode(tileCode)[1] === '0' ? '5' : normalizeLocalTileCode(tileCode)[1]))
      .sort((left, right) => left - right)
      .join('');
    return `${suit}${digits}`;
  }

  if (callType === 'kakan') {
    const claimedLocal = mjaiTileToLocal(payload.pai);
    if (!claimedLocal || consumed.length !== 3) return null;
    const claimedRank = Number(normalizeLocalTileCode(claimedLocal)[1] === '0' ? '5' : normalizeLocalTileCode(claimedLocal)[1]);
    const suit = normalizeLocalTileCode(claimedLocal)[0];
    return `${suit}${String(claimedRank).repeat(3)}-${claimedRank}`;
  }

  if (callType === 'daiminkan') {
    const claimedLocal = mjaiTileToLocal(payload.pai);
    const target = Number(payload.target);
    const actor = Number(payload.actor);
    if (!claimedLocal || consumed.length !== 3) return null;
    const actorSeat = seatMapper.playerIdToSeatKey(actor);
    const targetSeat = seatMapper.playerIdToSeatKey(target);
    if (!actorSeat || !targetSeat) return null;
    const reactorIndex = seatMapper.seatKeys.indexOf(actorSeat);
    const discarderIndex = seatMapper.seatKeys.indexOf(targetSeat);
    const direction = getClaimDirectionSuffix(discarderIndex, reactorIndex);
    const suit = normalizeLocalTileCode(claimedLocal)[0];
    const rank = Number(normalizeLocalTileCode(claimedLocal)[1] === '0' ? '5' : normalizeLocalTileCode(claimedLocal)[1]);
    return `${suit}${String(rank).repeat(4)}${direction}`;
  }

  return null;
}

module.exports = {
  parseLocalMeldString,
  buildConsumedTilesForMjai,
  buildLocalMeldStringFromMjaiCall,
  buildLocalKanMeldStringFromMjaiKan
};
