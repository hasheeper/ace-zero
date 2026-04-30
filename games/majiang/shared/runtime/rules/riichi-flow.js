(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.AceMahjongCreateRuntimeRiichiFlowHelpers = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  function createRuntimeRiichiFlowHelpers(options = {}) {
    const getSeatRiichiState = typeof options.getSeatRiichiState === 'function'
      ? options.getSeatRiichiState
      : null;
    const getSeatTurnState = typeof options.getSeatTurnState === 'function'
      ? options.getSeatTurnState
      : null;
    const getSeatKeys = typeof options.getSeatKeys === 'function'
      ? options.getSeatKeys
      : (() => ['bottom', 'right', 'top', 'left']);
    const getLegalRiichiChoices = typeof options.getLegalRiichiChoices === 'function'
      ? options.getLegalRiichiChoices
      : (() => []);

    function normalizeTileCode(code) {
      return String(code || '').replace(/[\*_\+\=\-]$/, '');
    }

    function closeDoubleRiichiWindow(runtime) {
      runtime.doubleRiichiWindowOpen = false;
    }

    function validateRiichiDeclaration(runtime, seatKey, tileCode) {
      if (!getSeatRiichiState) return;
      const seatState = getSeatRiichiState(runtime, seatKey);
      if (seatState.declared) {
        throw new Error(`Seat ${seatKey} has already declared riichi.`);
      }
      const choices = Array.isArray(getLegalRiichiChoices(runtime, seatKey))
        ? getLegalRiichiChoices(runtime, seatKey).map((choice) => normalizeTileCode(choice))
        : [];
      if (!choices.includes(normalizeTileCode(tileCode))) {
        throw new Error(`Tile ${tileCode} is not a legal riichi discard for seat ${seatKey}.`);
      }
    }

    function markRiichiDeclaration(runtime, seatKey) {
      if (!getSeatRiichiState || !getSeatTurnState) return;
      const seatState = getSeatRiichiState(runtime, seatKey);
      const turnState = getSeatTurnState(runtime, seatKey);
      seatState.declared = true;
      seatState.doubleRiichi = runtime.doubleRiichiWindowOpen === true && turnState.discardTurns === 0;
      seatState.ippatsuEligible = true;
      seatState.declarationTurn = runtime.turnCounter;
      turnState.ippatsuExpiryPending = false;
    }

    function finalizeDiscardTurn(runtime, seatKey) {
      if (!getSeatTurnState) return;
      const turnState = getSeatTurnState(runtime, seatKey);
      turnState.discardTurns += 1;
      runtime.turnCounter += 1;
    }

    function clearSeatIppatsu(runtime, seatKey) {
      if (!getSeatRiichiState || !getSeatTurnState) return;
      const seatState = getSeatRiichiState(runtime, seatKey);
      const turnState = getSeatTurnState(runtime, seatKey);
      seatState.ippatsuEligible = false;
      turnState.ippatsuExpiryPending = false;
    }

    function clearAllIppatsu(runtime) {
      getSeatKeys(runtime).forEach((seatKey) => clearSeatIppatsu(runtime, seatKey));
    }

    function markIppatsuPendingExpiry(runtime, seatKey) {
      if (!getSeatRiichiState || !getSeatTurnState) return;
      const seatState = getSeatRiichiState(runtime, seatKey);
      const turnState = getSeatTurnState(runtime, seatKey);
      if (!seatState.declared || !seatState.ippatsuEligible) return;
      turnState.ippatsuExpiryPending = true;
    }

    function consumePendingIppatsuExpiry(runtime, seatKey) {
      if (!getSeatTurnState) return;
      const turnState = getSeatTurnState(runtime, seatKey);
      if (!turnState.ippatsuExpiryPending) return;
      clearSeatIppatsu(runtime, seatKey);
    }

    return {
      closeDoubleRiichiWindow,
      validateRiichiDeclaration,
      markRiichiDeclaration,
      finalizeDiscardTurn,
      clearSeatIppatsu,
      clearAllIppatsu,
      markIppatsuPendingExpiry,
      consumePendingIppatsuExpiry
    };
  }

  return createRuntimeRiichiFlowHelpers;
});
