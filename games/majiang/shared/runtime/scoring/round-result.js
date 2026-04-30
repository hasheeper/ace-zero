(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.AceMahjongCreateRuntimeRoundResultHelpers = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  function identityClone(value) {
    return value;
  }

  function defaultGetSeatRiichiResult(runtime, seatKey) {
    const state = runtime && runtime.riichiState && runtime.riichiState[seatKey]
      ? runtime.riichiState[seatKey]
      : null;
    return {
      riichi: Boolean(state && state.declared),
      doubleRiichi: Boolean(state && state.doubleRiichi),
      ippatsu: Boolean(state && state.ippatsuEligible),
      declarationTurn: state && Number.isInteger(state.declarationTurn) ? state.declarationTurn : null
    };
  }

  function defaultGetSeatKitaResult(runtime, seatKey) {
    const state = runtime && runtime.seatMeta && runtime.seatMeta[seatKey]
      ? runtime.seatMeta[seatKey]
      : null;
    const kitaTiles = state && Array.isArray(state.kitaTiles)
      ? state.kitaTiles.map((tile) => ({ ...tile }))
      : [];
    return {
      kitaCount: kitaTiles.length,
      kitaTiles
    };
  }

  function createRuntimeRoundResultHelpers(options = {}) {
    const cloneValue = typeof options.clone === 'function' ? options.clone : identityClone;
    const getPhase = typeof options.getPhase === 'function'
      ? options.getPhase
      : (runtime) => (
        runtime && runtime.stateMachine && typeof runtime.stateMachine.getPhase === 'function'
          ? runtime.stateMachine.getPhase()
          : (runtime && runtime.phase ? runtime.phase : null)
      );
    const getScoreMap = typeof options.getScoreMap === 'function'
      ? options.getScoreMap
      : (runtime) => (
        runtime && typeof runtime.getScoreMap === 'function'
          ? runtime.getScoreMap()
          : {}
      );
    const getSeatRiichiResult = typeof options.getSeatRiichiResult === 'function'
      ? options.getSeatRiichiResult
      : defaultGetSeatRiichiResult;
    const getSeatKitaResult = typeof options.getSeatKitaResult === 'function'
      ? options.getSeatKitaResult
      : defaultGetSeatKitaResult;
    const extractBaojiaSummary = typeof options.extractBaojiaSummary === 'function'
      ? options.extractBaojiaSummary
      : (() => ({
        baojiaSeat: null,
        baojiaYaku: null,
        baojiaDirection: null
      }));

    function safeClone(value) {
      return value == null ? value : cloneValue(value);
    }

    function buildBaseRoundResult(runtime, type, payload = {}) {
      return {
        type,
        phase: getPhase(runtime),
        zhuangfeng: runtime && runtime.board ? runtime.board.zhuangfeng : null,
        jushu: runtime && runtime.board ? runtime.board.jushu : null,
        changbang: runtime && runtime.board ? runtime.board.changbang : 0,
        lizhibang: runtime && runtime.board ? runtime.board.lizhibang : 0,
        scores: getScoreMap(runtime),
        ...safeClone(payload)
      };
    }

    function buildHuleRoundResult(runtime, seatKey, result, options = {}) {
      const riichiResult = getSeatRiichiResult(runtime, seatKey);
      const kitaResult = getSeatKitaResult(runtime, seatKey);
      const baojiaSummary = extractBaojiaSummary(seatKey, result);
      return buildBaseRoundResult(runtime, 'hule', {
        winnerSeat: seatKey,
        fromSeat: options.fromSeat || null,
        tileCode: options.tileCode || null,
        rongpai: options.rongpai || null,
        qianggang: Boolean(options.qianggang),
        lingshang: Boolean(options.lingshang),
        haidi: Number(options.haidi || 0),
        tianhu: Number(options.tianhu || 0),
        riichi: riichiResult.riichi,
        doubleRiichi: riichiResult.doubleRiichi,
        ippatsu: riichiResult.ippatsu,
        declarationTurn: riichiResult.declarationTurn,
        kitaCount: Number(options.kitaCount != null ? options.kitaCount : kitaResult.kitaCount || 0),
        kitaTiles: options.kitaTiles ? safeClone(options.kitaTiles) : safeClone(kitaResult.kitaTiles),
        baojiaSeat: baojiaSummary.baojiaSeat,
        baojiaYaku: baojiaSummary.baojiaYaku,
        baojiaDirection: baojiaSummary.baojiaDirection,
        result: safeClone(result)
      });
    }

    function buildMultiHuleRoundResult(runtime, settlements = [], options = {}) {
      const normalizedSettlements = Array.isArray(settlements) ? settlements.map((entry) => safeClone(entry)) : [];
      const primary = normalizedSettlements[0] || null;
      const primaryWinnerSeat = primary && primary.winnerSeat ? primary.winnerSeat : null;
      const riichiResult = primaryWinnerSeat
        ? getSeatRiichiResult(runtime, primaryWinnerSeat)
        : {
            riichi: false,
            doubleRiichi: false,
            ippatsu: false,
            declarationTurn: null
          };
      const primaryKitaResult = primaryWinnerSeat
        ? getSeatKitaResult(runtime, primaryWinnerSeat)
        : { kitaCount: 0, kitaTiles: [] };
      const baojiaSummary = extractBaojiaSummary(primaryWinnerSeat, primary && primary.result ? primary.result : null);

      return buildBaseRoundResult(runtime, 'hule', {
        winnerSeat: primaryWinnerSeat,
        fromSeat: primary && primary.fromSeat ? primary.fromSeat : null,
        tileCode: primary && primary.tileCode ? primary.tileCode : null,
        rongpai: primary && primary.rongpai ? primary.rongpai : null,
        riichi: riichiResult.riichi,
        doubleRiichi: riichiResult.doubleRiichi,
        ippatsu: riichiResult.ippatsu,
        declarationTurn: riichiResult.declarationTurn,
        kitaCount: Number(primary && primary.kitaCount != null ? primary.kitaCount : primaryKitaResult.kitaCount || 0),
        kitaTiles: primary && primary.kitaTiles ? safeClone(primary.kitaTiles) : safeClone(primaryKitaResult.kitaTiles),
        baojiaSeat: baojiaSummary.baojiaSeat,
        baojiaYaku: baojiaSummary.baojiaYaku,
        baojiaDirection: baojiaSummary.baojiaDirection,
        winners: normalizedSettlements.map((entry) => ({
          ...entry,
          ...extractBaojiaSummary(entry && entry.winnerSeat ? entry.winnerSeat : null, entry && entry.result ? entry.result : null)
        })),
        result: primary && primary.result ? primary.result : null,
        results: normalizedSettlements.map((entry) => entry && entry.result ? entry.result : null),
        multiHule: true,
        winnerCount: normalizedSettlements.length,
        qianggang: Boolean(options.qianggang),
        lingshang: Boolean(options.lingshang)
      });
    }

    function buildDrawRoundResult(runtime, reason, options = {}) {
      return buildBaseRoundResult(runtime, 'draw', {
        reason: reason || 'exhaustive-draw',
        tenpaiSeats: Array.isArray(options.tenpaiSeats) ? options.tenpaiSeats.slice() : [],
        notenSeats: Array.isArray(options.notenSeats) ? options.notenSeats.slice() : [],
        revealedHands: options.revealedHands ? safeClone(options.revealedHands) : null,
        fenpei: Array.isArray(options.fenpei) ? options.fenpei.slice() : [0, 0, 0, 0],
        dealerContinues: Boolean(options.dealerContinues),
        nagashiManganSeats: Array.isArray(options.nagashiManganSeats) ? options.nagashiManganSeats.slice() : []
      });
    }

    return {
      buildHuleRoundResult,
      buildMultiHuleRoundResult,
      buildDrawRoundResult
    };
  }

  return createRuntimeRoundResultHelpers;
});
