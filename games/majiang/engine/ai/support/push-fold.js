(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.AceMahjongAiPushFold = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  function getActiveSeats(runtime) {
    if (runtime && runtime.topology && Array.isArray(runtime.topology.activeSeats) && runtime.topology.activeSeats.length) {
      return runtime.topology.activeSeats.slice();
    }
    if (runtime && Array.isArray(runtime.activeSeats) && runtime.activeSeats.length) {
      return runtime.activeSeats.slice();
    }
    return ['bottom', 'right', 'top', 'left'];
  }

  function countRiichiOpponents(runtime, seatKey) {
    if (!runtime || !runtime.riichiState) return 0;
    return getActiveSeats(runtime).filter((otherSeatKey) => (
      otherSeatKey
      && otherSeatKey !== seatKey
      && runtime.riichiState[otherSeatKey]
      && runtime.riichiState[otherSeatKey].declared === true
    )).length;
  }

  function evaluateRuntimePushFoldState(runtime, seatKey, input = {}) {
    const riichiOpponentCount = countRiichiOpponents(runtime, seatKey);
    const xiangting = Number.isFinite(Number(input.xiangting)) ? Number(input.xiangting) : null;
    const remaining = runtime && typeof runtime.getWallState === 'function'
      ? Number((runtime.getWallState() || {}).remaining || 0)
      : 0;

    if (!riichiOpponentCount) {
      return evaluatePushFoldState({
        state: 'neutral',
        pressureScore: 0,
        reasons: []
      });
    }

    if (xiangting === 0) {
      return evaluatePushFoldState({
        state: 'balanced',
        pressureScore: 4 * riichiOpponentCount,
        reasons: ['riichi-opponent', remaining <= 18 ? 'late-round' : 'tenpai-keep-push']
      });
    }

    return evaluatePushFoldState({
      state: 'careful',
      pressureScore: (remaining <= 18 ? 12 : 8) * riichiOpponentCount,
      reasons: ['riichi-opponent', remaining <= 18 ? 'late-round' : 'early-round']
    });
  }

  function evaluatePushFoldState(input = {}) {
    return {
      state: typeof input.state === 'string' && input.state ? input.state : 'neutral',
      pressureScore: Number.isFinite(Number(input.pressureScore)) ? Number(input.pressureScore) : 0,
      reasons: Array.isArray(input.reasons) ? input.reasons.slice() : []
    };
  }

  return {
    evaluatePushFoldState,
    evaluateRuntimePushFoldState
  };
});
