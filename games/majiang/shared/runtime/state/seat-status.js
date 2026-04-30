(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.AceMahjongCreateRuntimeSeatStatusHelpers = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  function createRuntimeSeatStatusHelpers(options = {}) {
    const getSeatIndex = typeof options.getSeatIndex === 'function'
      ? options.getSeatIndex
      : ((runtime, seatKey) => (runtime && typeof runtime.getSeatIndex === 'function' ? runtime.getSeatIndex(seatKey) : -1));
    const getShoupai = typeof options.getShoupai === 'function'
      ? options.getShoupai
      : ((runtime, seatIndex) => (runtime && runtime.board && runtime.board.shoupai ? runtime.board.shoupai[seatIndex] : null));
    const getDiscardCandidates = typeof options.getDiscardCandidates === 'function'
      ? options.getDiscardCandidates
      : null;
    const getCurrentTurnSeat = typeof options.getCurrentTurnSeat === 'function'
      ? options.getCurrentTurnSeat
      : (() => null);
    const getCurrentPhase = typeof options.getCurrentPhase === 'function'
      ? options.getCurrentPhase
      : (() => null);
    const awaitDiscardPhase = options.awaitDiscardPhase || 'await_discard';
    const getSeatFuritenState = typeof options.getSeatFuritenState === 'function'
      ? options.getSeatFuritenState
      : null;
    const getSeatWinningTileCodes = typeof options.getSeatWinningTileCodes === 'function'
      ? options.getSeatWinningTileCodes
      : (() => []);

    function parseHandTileCodes(paistr = '') {
      const handCodes = [];
      const bingpai = String(paistr || '').split(',')[0] || '';
      let suit = null;

      for (const char of bingpai.replace(/\*/g, '')) {
        if (/[mpsz]/.test(char)) {
          suit = char;
          continue;
        }
        if (/\d/.test(char) && suit) {
          handCodes.push(`${suit}${char}`);
        }
      }

      return handCodes;
    }

    function getSeatHandTileCodes(runtime, seatKey) {
      const seatIndex = getSeatIndex(runtime, seatKey);
      if (seatIndex < 0) return [];
      const shoupai = getShoupai(runtime, seatIndex);
      if (!shoupai || typeof shoupai.toString !== 'function') return [];
      return parseHandTileCodes(shoupai.toString());
    }

    function getSeatDiscardCandidateCodes(runtime, seatKey) {
      const seatIndex = getSeatIndex(runtime, seatKey);
      if (seatIndex < 0 || !getDiscardCandidates) return [];
      const shoupai = getShoupai(runtime, seatIndex);
      if (!shoupai) return [];
      try {
        return (getDiscardCandidates(runtime, seatKey, seatIndex, shoupai) || [])
          .map((code) => String(code || '').replace(/[\*_\+\=\-]$/, ''))
          .filter(Boolean);
      } catch (error) {
        return [];
      }
    }

    function getSeatBlockedDiscardCodes(runtime, seatKey) {
      if (!runtime) return [];
      if (getCurrentTurnSeat(runtime) !== seatKey) return [];
      if (getCurrentPhase(runtime) !== awaitDiscardPhase) return [];

      const handCodes = getSeatHandTileCodes(runtime, seatKey);
      const legalTileCodes = getSeatDiscardCandidateCodes(runtime, seatKey);
      if (!handCodes.length || !legalTileCodes.length) return [];

      return Array.from(new Set(handCodes.filter((code) => !legalTileCodes.includes(code))));
    }

    function buildSeatStatusState(runtime, seatKey, shoupai = null) {
      const furitenState = getSeatFuritenState ? getSeatFuritenState(runtime, seatKey) : null;
      const waitingTileCodes = Array.isArray(furitenState && furitenState.waitingTileCodes)
        ? furitenState.waitingTileCodes.slice()
        : getSeatWinningTileCodes(runtime, seatKey, shoupai);
      const isTenpai = waitingTileCodes.length > 0;
      const discardFuriten = Boolean(furitenState && furitenState.discardFuriten);
      const sameTurnFuriten = Boolean(furitenState && furitenState.sameTurnFuriten);
      const skipRonFuriten = Boolean(furitenState && furitenState.skipRonFuriten);
      const nengRong = furitenState ? furitenState.nengRong !== false : true;

      return {
        tenpai: {
          active: isTenpai,
          waitingTileCodes,
          waitingTileCount: waitingTileCodes.length
        },
        furiten: {
          active: Boolean(discardFuriten || sameTurnFuriten || skipRonFuriten || !nengRong),
          discardFuriten,
          sameTurnFuriten,
          skipRonFuriten,
          nengRong,
          waitingTileCodes
        },
        kuikaeBlockedCodes: getSeatBlockedDiscardCodes(runtime, seatKey)
      };
    }

    return {
      parseHandTileCodes,
      getSeatHandTileCodes,
      getSeatDiscardCandidateCodes,
      getSeatBlockedDiscardCodes,
      buildSeatStatusState
    };
  }

  return createRuntimeSeatStatusHelpers;
});
