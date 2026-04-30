'use strict';

const DEFAULT_SEAT_KEYS = Object.freeze(['bottom', 'right', 'top', 'left']);

function createSeatMapper(runtime, options = {}) {
  const seatKeys = Array.isArray(options.seatKeys) && options.seatKeys.length
    ? options.seatKeys.slice()
    : (runtime && Array.isArray(runtime.activeSeats) && runtime.activeSeats.length
      ? runtime.activeSeats.slice()
      : DEFAULT_SEAT_KEYS.slice());

  function seatKeyToPlayerId(seatKey) {
    if (!runtime || typeof runtime.getPlayerIdentityIndex !== 'function') {
      return seatKeys.indexOf(seatKey);
    }
    return runtime.getPlayerIdentityIndex(seatKey);
  }

  function playerIdToSeatKey(playerId) {
    if (!runtime || typeof runtime.getSeatKeyByPlayerIdentity !== 'function') {
      return seatKeys[playerId] || null;
    }
    return runtime.getSeatKeyByPlayerIdentity(playerId);
  }

  function getDealerPlayerId() {
    if (!runtime || typeof runtime.getDealerSeat !== 'function') return 0;
    return seatKeyToPlayerId(runtime.getDealerSeat());
  }

  function getScoresByPlayerId() {
    if (!runtime || !runtime.board || !Array.isArray(runtime.board.defen)) return [25000, 25000, 25000, 25000];
    return runtime.board.defen.slice();
  }

  function getScoresByPlayerIdFromScoreMap(scoreMap) {
    if (!scoreMap || typeof scoreMap !== 'object') return getScoresByPlayerId();
    return seatKeys.map((seatKey) => Number(scoreMap[seatKey] || 0));
  }

  return {
    seatKeys,
    seatKeyToPlayerId,
    playerIdToSeatKey,
    getDealerPlayerId,
    getScoresByPlayerId,
    getScoresByPlayerIdFromScoreMap
  };
}

module.exports = {
  DEFAULT_SEAT_KEYS,
  createSeatMapper
};
