(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.AceMahjongCreateRuntimeRoundStateSupportHelpers = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  function getSeatKeys(options = {}) {
    return Array.isArray(options.seatKeys) && options.seatKeys.length
      ? options.seatKeys.slice()
      : ['bottom', 'right', 'top', 'left'];
  }

  function createRuntimeRoundStateSupportHelpers(options = {}) {
    const seatKeys = getSeatKeys(options);

    function createInitialRiichiState() {
      return seatKeys.reduce((result, seatKey) => {
        result[seatKey] = {
          declared: false,
          doubleRiichi: false,
          ippatsuEligible: false,
          declarationTurn: null
        };
        return result;
      }, {});
    }

    function createInitialTurnState() {
      return seatKeys.reduce((result, seatKey) => {
        result[seatKey] = {
          discardTurns: 0,
          ippatsuExpiryPending: false
        };
        return result;
      }, {});
    }

    function createInitialFuritenState() {
      return seatKeys.reduce((result, seatKey) => {
        result[seatKey] = {
          discardFuriten: false,
          sameTurnFuriten: false,
          skipRonFuriten: false,
          nengRong: true,
          waitingTileCodes: []
        };
        return result;
      }, {});
    }

    function getSeatRiichiState(runtime, seatKey) {
      if (!runtime.riichiState || !runtime.riichiState[seatKey]) {
        runtime.riichiState = createInitialRiichiState();
      }
      return runtime.riichiState[seatKey];
    }

    function getSeatTurnState(runtime, seatKey) {
      if (!runtime.turnState || !runtime.turnState[seatKey]) {
        runtime.turnState = createInitialTurnState();
      }
      return runtime.turnState[seatKey];
    }

    function getSeatFuritenState(runtime, seatKey) {
      if (!runtime.furitenState || !runtime.furitenState[seatKey]) {
        runtime.furitenState = createInitialFuritenState();
      }
      return runtime.furitenState[seatKey];
    }

    function resetRuntimeRiichiTracking(runtime) {
      runtime.riichiState = createInitialRiichiState();
      runtime.turnState = createInitialTurnState();
      runtime.furitenState = createInitialFuritenState();
      runtime.turnCounter = 0;
      runtime.doubleRiichiWindowOpen = true;
    }

    return {
      createInitialRiichiState,
      createInitialTurnState,
      createInitialFuritenState,
      getSeatRiichiState,
      getSeatTurnState,
      getSeatFuritenState,
      resetRuntimeRiichiTracking
    };
  }

  createRuntimeRoundStateSupportHelpers.getSeatKeys = getSeatKeys;

  return createRuntimeRoundStateSupportHelpers;
});
