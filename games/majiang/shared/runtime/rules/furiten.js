(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.AceMahjongCreateRuntimeFuritenHelpers = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  function createRuntimeFuritenHelpers(options = {}) {
    const calculateXiangting = typeof options.calculateXiangting === 'function'
      ? options.calculateXiangting
      : null;
    const getTingpai = typeof options.getTingpai === 'function'
      ? options.getTingpai
      : null;
    const getSeatFuritenState = typeof options.getSeatFuritenState === 'function'
      ? options.getSeatFuritenState
      : null;
    const getSeatRiichiState = typeof options.getSeatRiichiState === 'function'
      ? options.getSeatRiichiState
      : null;
    const getActiveSeats = typeof options.getActiveSeats === 'function'
      ? options.getActiveSeats
      : null;

    function getTileRankValue(code) {
      if (!code || typeof code !== 'string') return code;
      if (code.length < 2) return code;
      return `${code[0]}${code[1] === '0' ? '5' : code[1]}`;
    }

    function getSeatWinningTileCodes(runtime, seatKey, shoupai = null) {
      if (!runtime || typeof runtime.getSeatIndex !== 'function' || !calculateXiangting || !getTingpai) {
        return [];
      }
      const seatIndex = runtime.getSeatIndex(seatKey);
      if (seatIndex < 0) return [];
      const currentShoupai = shoupai || (runtime.board && runtime.board.shoupai ? runtime.board.shoupai[seatIndex] : null);
      if (!currentShoupai) return [];
      try {
        if (calculateXiangting(currentShoupai.clone ? currentShoupai.clone() : currentShoupai) !== 0) {
          return [];
        }
        const tingpai = getTingpai(currentShoupai.clone ? currentShoupai.clone() : currentShoupai);
        return Array.isArray(tingpai) ? tingpai.map((code) => String(code || '')) : [];
      } catch (error) {
        return [];
      }
    }

    function wouldCompleteHandWithTile(runtime, seatKey, tileCode) {
      if (!runtime || typeof runtime.getSeatIndex !== 'function') return false;
      const seatIndex = runtime.getSeatIndex(seatKey);
      if (seatIndex < 0 || !tileCode || !calculateXiangting) return false;
      const currentShoupai = runtime.board && runtime.board.shoupai ? runtime.board.shoupai[seatIndex] : null;
      if (!currentShoupai || typeof currentShoupai.clone !== 'function' || typeof currentShoupai.zimo !== 'function') {
        return false;
      }
      try {
        const simulatedShoupai = currentShoupai.clone();
        simulatedShoupai.zimo(tileCode);
        return calculateXiangting(simulatedShoupai) === -1;
      } catch (error) {
        return false;
      }
    }

    function refreshSeatFuritenState(runtime, seatKey, shoupai = null) {
      if (!runtime || typeof runtime.getSeatIndex !== 'function' || !getSeatFuritenState) return null;
      const seatIndex = runtime.getSeatIndex(seatKey);
      if (seatIndex < 0) return null;
      const state = getSeatFuritenState(runtime, seatKey);
      const waitingTileCodes = getSeatWinningTileCodes(runtime, seatKey, shoupai);
      const riverCodes = runtime.board && runtime.board.he && runtime.board.he[seatIndex] && Array.isArray(runtime.board.he[seatIndex]._pai)
        ? runtime.board.he[seatIndex]._pai
        : [];
      state.waitingTileCodes = waitingTileCodes.slice();
      state.discardFuriten = waitingTileCodes.some((waitCode) => (
        riverCodes.some((riverCode) => getTileRankValue(riverCode) === getTileRankValue(waitCode))
      ));
      state.nengRong = !(state.discardFuriten || state.sameTurnFuriten || state.skipRonFuriten);
      return state;
    }

    function refreshAllFuritenStates(runtime) {
      const activeSeats = getActiveSeats ? getActiveSeats(runtime) : [];
      activeSeats.forEach((seatKey) => {
        refreshSeatFuritenState(runtime, seatKey);
      });
    }

    function clearTemporaryFuriten(runtime, seatKey) {
      if (!getSeatRiichiState || !getSeatFuritenState) return null;
      const riichiState = getSeatRiichiState(runtime, seatKey);
      if (riichiState && riichiState.declared) {
        return refreshSeatFuritenState(runtime, seatKey);
      }
      const furitenState = getSeatFuritenState(runtime, seatKey);
      furitenState.sameTurnFuriten = false;
      furitenState.skipRonFuriten = false;
      return refreshSeatFuritenState(runtime, seatKey);
    }

    function observeOwnDiscard(runtime, seatKey) {
      return clearTemporaryFuriten(runtime, seatKey);
    }

    function prepareSeatForDiscard(runtime, seatKey) {
      return observeOwnDiscard(runtime, seatKey);
    }

    function markSameTurnFuriten(runtime, seatKey) {
      if (!getSeatFuritenState) return null;
      const state = getSeatFuritenState(runtime, seatKey);
      state.sameTurnFuriten = true;
      return refreshSeatFuritenState(runtime, seatKey);
    }

    function markSkipRonFuriten(runtime, seatKey) {
      if (!getSeatFuritenState) return null;
      const state = getSeatFuritenState(runtime, seatKey);
      state.skipRonFuriten = true;
      state.sameTurnFuriten = true;
      return refreshSeatFuritenState(runtime, seatKey);
    }

    function observeMissedWinningTile(runtime, seatKey, options = {}) {
      return options && options.skipRon
        ? markSkipRonFuriten(runtime, seatKey)
        : markSameTurnFuriten(runtime, seatKey);
    }

    function applyReactionPassFuriten(runtime, seatKey, pendingReaction) {
      if (!pendingReaction || !Array.isArray(pendingReaction.actions)) {
        return refreshSeatFuritenState(runtime, seatKey);
      }
      const hasHuleAction = pendingReaction.actions.some((action) => (
        action
        && action.type === 'hule'
        && action.payload
        && action.payload.seat === seatKey
      ));
      if (!hasHuleAction) {
        return refreshSeatFuritenState(runtime, seatKey);
      }
      return observeMissedWinningTile(runtime, seatKey, { skipRon: true });
    }

    function getReactionFuritenSeatKeys(runtime, fromSeat, tileCode) {
      const activeSeats = getActiveSeats ? getActiveSeats(runtime) : [];
      return activeSeats.filter((seatKey) => {
        if (seatKey === fromSeat) return false;
        return wouldCompleteHandWithTile(runtime, seatKey, tileCode);
      });
    }

    function applyPendingReactionFuriten(runtime, reactionContext) {
      if (!reactionContext || !Array.isArray(reactionContext.furitenSeatKeys)) return;
      const winnerSeatSet = new Set(
        Array.isArray(reactionContext.selectedHuleActions)
          ? reactionContext.selectedHuleActions
              .map((entry) => entry && entry.seatKey ? entry.seatKey : null)
              .filter(Boolean)
          : []
      );
      reactionContext.furitenSeatKeys.forEach((seatKey) => {
        if (winnerSeatSet.has(seatKey)) return;
        observeMissedWinningTile(runtime, seatKey, { skipRon: false });
      });
    }

    function getSeatNengRong(runtime, seatKey) {
      if (!getSeatFuritenState) return true;
      const state = getSeatFuritenState(runtime, seatKey);
      return state ? state.nengRong !== false : true;
    }

    return {
      getTileRankValue,
      getSeatWinningTileCodes,
      wouldCompleteHandWithTile,
      refreshSeatFuritenState,
      refreshAllFuritenStates,
      clearTemporaryFuriten,
      observeOwnDiscard,
      prepareSeatForDiscard,
      markSameTurnFuriten,
      markSkipRonFuriten,
      observeMissedWinningTile,
      applyReactionPassFuriten,
      getReactionFuritenSeatKeys,
      applyPendingReactionFuriten,
      getSeatNengRong
    };
  }

  return createRuntimeFuritenHelpers;
});
