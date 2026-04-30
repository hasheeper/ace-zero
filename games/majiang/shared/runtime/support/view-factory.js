(function(root, factory) {
  'use strict';

  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }

  root.AceMahjongCreateRuntimeViewBuilder = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  function createRuntimeViewBuilder(deps = {}) {
    const seatKeys = Array.isArray(deps.seatKeys) && deps.seatKeys.length
      ? deps.seatKeys.slice()
      : ['bottom', 'right', 'top', 'left'];
    const clone = typeof deps.clone === 'function'
      ? deps.clone
      : (value) => JSON.parse(JSON.stringify(value));

    if (typeof deps.buildInfo !== 'function') {
      throw new TypeError('createRuntimeViewBuilder requires buildInfo(runtime).');
    }

    if (typeof deps.buildSeatSnapshot !== 'function') {
      throw new TypeError('createRuntimeViewBuilder requires buildSeatSnapshot(runtime, seatKey, hiddenHand).');
    }

    const modifyPlayerView = typeof deps.modifyPlayerView === 'function'
      ? deps.modifyPlayerView
      : null;

    function buildSeatView(runtime, hiddenSeatSet = new Set()) {
      return seatKeys.reduce((result, seatKey) => {
        result[seatKey] = deps.buildSeatSnapshot(runtime, seatKey, hiddenSeatSet.has(seatKey));
        return result;
      }, {});
    }

    function createTruthView(runtime) {
      return {
        type: 'truth',
        info: clone(deps.buildInfo(runtime)),
        seats: buildSeatView(runtime, new Set())
      };
    }

    function createPlayerView(runtime, seatKey = 'bottom') {
      const hiddenSeats = new Set(seatKeys.filter((key) => key !== seatKey));
      const baseView = {
        type: 'player',
        seat: seatKey,
        info: clone(deps.buildInfo(runtime)),
        seats: buildSeatView(runtime, hiddenSeats)
      };
      return modifyPlayerView ? modifyPlayerView(runtime, clone(baseView), {
        type: 'player',
        seatKey
      }) : baseView;
    }

    function createAiView(runtime, seatKey) {
      const baseView = {
        type: 'ai',
        seat: seatKey,
        info: clone(deps.buildInfo(runtime)),
        seats: createPlayerView(runtime, seatKey).seats
      };
      return modifyPlayerView ? modifyPlayerView(runtime, clone(baseView), {
        type: 'ai',
        seatKey
      }) : baseView;
    }

    function buildViewBundle(runtime, options = {}) {
      const playerSeat = options.playerSeat || 'bottom';
      return {
        truthView: createTruthView(runtime),
        playerView: createPlayerView(runtime, playerSeat),
        aiViews: seatKeys.reduce((result, seatKey) => {
          result[seatKey] = createAiView(runtime, seatKey);
          return result;
        }, {})
      };
    }

    return {
      createTruthView,
      createPlayerView,
      createAiView,
      buildViewBundle
    };
  }

  return createRuntimeViewBuilder;
});
