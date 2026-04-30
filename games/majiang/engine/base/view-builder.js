'use strict';

const {
  SEAT_KEYS,
  getVisibleSeatState,
  toFrontendTile,
  clone
} = require('./majiang-core-adapter');
const createRuntimeViewBuilder = require('../../shared/runtime/support/view-factory');

function buildScoreMap(runtime) {
  return SEAT_KEYS.reduce((result, seatKey) => {
    const isActiveSeat = runtime && runtime.topology && typeof runtime.topology.isActiveSeat === 'function'
      ? runtime.topology.isActiveSeat(seatKey)
      : true;
    if (!isActiveSeat) {
      result[seatKey] = 0;
      return result;
    }
    const playerIndex = typeof runtime.getPlayerIdentityIndex === 'function'
      ? runtime.getPlayerIdentityIndex(seatKey)
      : SEAT_KEYS.indexOf(seatKey);
    result[seatKey] = playerIndex >= 0 && runtime.board && Array.isArray(runtime.board.defen)
      ? (runtime.board.defen[playerIndex] || 0)
      : 0;
    return result;
  }, {});
}

function buildDoraTiles(board) {
  return ((board.shan && board.shan.baopai) || []).slice(0, 5).map((code) => ({
    asset: code ? toFrontendTile(code).asset : null,
    label: code || '',
    open: Boolean(code)
  }));
}

function getRuntimeWallState(runtime) {
  return runtime && typeof runtime.getWallState === 'function'
    ? runtime.getWallState()
    : {
        remaining: runtime && runtime.board && runtime.board.shan ? runtime.board.shan.paishu : 0,
        baopai: runtime && runtime.board && runtime.board.shan && Array.isArray(runtime.board.shan.baopai)
          ? runtime.board.shan.baopai.slice()
          : []
      };
}

function buildInactiveSeatView(runtime, seatKey) {
  return {
    ...(runtime && runtime.seatMeta && runtime.seatMeta[seatKey] ? runtime.seatMeta[seatKey] : {}),
    seat: seatKey,
    handTiles: [],
    melds: [],
    riverTiles: [],
    riichi: {
      active: false,
      tileIndex: -1
    },
    riichiState: null,
    furitenState: null,
    status: null
  };
}

function buildSharedInfo(runtime) {
  const seatWinds = typeof runtime.getSeatWindMap === 'function' ? runtime.getSeatWindMap() : {};
  const wallState = getRuntimeWallState(runtime);
  return {
    tableSize: runtime.presentation.tableSize,
    activeSeats: runtime.presentation.activeSeats.slice(),
    hiddenSeats: runtime.presentation.hiddenSeats.slice(),
    ruleset: runtime.presentation.ruleset,
    uiMode: runtime.presentation.uiMode,
    tableLayout: runtime.presentation.tableLayout,
    advancedMode: runtime.presentation.advancedMode,
    roundText: `${['東', '南', '西', '北'][runtime.board.zhuangfeng] || '東'}${runtime.board.jushu + 1}`,
    honba: runtime.board.changbang,
    riichiSticks: runtime.board.lizhibang,
    centerRiichiVisible: runtime.presentation.centerRiichiVisible,
    centerDoraVisible: runtime.presentation.centerDoraVisible,
    remaining: Number(wallState.remaining || 0) || 0,
    turnSeat: typeof runtime.getCurrentTurnSeat === 'function' ? runtime.getCurrentTurnSeat() : (SEAT_KEYS[runtime.board.lunban] || 'bottom'),
    dealerSeat: typeof runtime.getDealerSeat === 'function' ? runtime.getDealerSeat() : 'bottom',
    seatWinds: clone(seatWinds),
    scores: buildScoreMap(runtime),
    doraTiles: (Array.isArray(wallState.baopai) ? wallState.baopai : []).slice(0, 5).map((code) => ({
      asset: code ? toFrontendTile(code).asset : null,
      label: code || '',
      open: Boolean(code)
    }))
  };
}

function buildSeatView(runtime, hiddenSeatSet = new Set()) {
  return {
    bottom: runtime.topology && typeof runtime.topology.isActiveSeat === 'function' && !runtime.topology.isActiveSeat('bottom')
      ? buildInactiveSeatView(runtime, 'bottom')
      : {
          ...runtime.seatMeta.bottom,
          ...getVisibleSeatState(runtime.board, runtime.getSeatIndex('bottom'), { hiddenHand: hiddenSeatSet.has('bottom') }),
          riichiState: clone(runtime.riichiState && runtime.riichiState.bottom ? runtime.riichiState.bottom : null),
          furitenState: clone(runtime.furitenState && runtime.furitenState.bottom ? runtime.furitenState.bottom : null),
          status: typeof runtime.getSeatStatus === 'function' ? clone(runtime.getSeatStatus('bottom')) : null
        },
    right: runtime.topology && typeof runtime.topology.isActiveSeat === 'function' && !runtime.topology.isActiveSeat('right')
      ? buildInactiveSeatView(runtime, 'right')
      : {
          ...runtime.seatMeta.right,
          ...getVisibleSeatState(runtime.board, runtime.getSeatIndex('right'), { hiddenHand: hiddenSeatSet.has('right') }),
          riichiState: clone(runtime.riichiState && runtime.riichiState.right ? runtime.riichiState.right : null),
          furitenState: clone(runtime.furitenState && runtime.furitenState.right ? runtime.furitenState.right : null),
          status: typeof runtime.getSeatStatus === 'function' ? clone(runtime.getSeatStatus('right')) : null
        },
    top: runtime.topology && typeof runtime.topology.isActiveSeat === 'function' && !runtime.topology.isActiveSeat('top')
      ? buildInactiveSeatView(runtime, 'top')
      : {
          ...runtime.seatMeta.top,
          ...getVisibleSeatState(runtime.board, runtime.getSeatIndex('top'), { hiddenHand: hiddenSeatSet.has('top') }),
          riichiState: clone(runtime.riichiState && runtime.riichiState.top ? runtime.riichiState.top : null),
          furitenState: clone(runtime.furitenState && runtime.furitenState.top ? runtime.furitenState.top : null),
          status: typeof runtime.getSeatStatus === 'function' ? clone(runtime.getSeatStatus('top')) : null
        },
    left: runtime.topology && typeof runtime.topology.isActiveSeat === 'function' && !runtime.topology.isActiveSeat('left')
      ? buildInactiveSeatView(runtime, 'left')
      : {
          ...runtime.seatMeta.left,
          ...getVisibleSeatState(runtime.board, runtime.getSeatIndex('left'), { hiddenHand: hiddenSeatSet.has('left') }),
          riichiState: clone(runtime.riichiState && runtime.riichiState.left ? runtime.riichiState.left : null),
          furitenState: clone(runtime.furitenState && runtime.furitenState.left ? runtime.furitenState.left : null),
          status: typeof runtime.getSeatStatus === 'function' ? clone(runtime.getSeatStatus('left')) : null
        }
  };
}

function mergeViewPatch(baseView, patch) {
  if (!patch || typeof patch !== 'object') return baseView;
  return {
    ...baseView,
    ...(patch.viewPatch && typeof patch.viewPatch === 'object' ? patch.viewPatch : {}),
    info: {
      ...(baseView.info || {}),
      ...(patch.viewPatch && patch.viewPatch.info && typeof patch.viewPatch.info === 'object'
        ? patch.viewPatch.info
        : {})
    },
    seats: {
      ...(baseView.seats || {}),
      ...(patch.viewPatch && patch.viewPatch.seats && typeof patch.viewPatch.seats === 'object'
        ? patch.viewPatch.seats
        : {})
    },
    visibilityPatch: patch.visibilityPatch && typeof patch.visibilityPatch === 'object'
      ? clone(patch.visibilityPatch)
      : {},
    hints: Array.isArray(patch.hints) ? clone(patch.hints) : []
  };
}

const viewBuilder = createRuntimeViewBuilder({
  seatKeys: SEAT_KEYS,
  clone,
  buildInfo: buildSharedInfo,
  modifyPlayerView(runtime, baseView, options = {}) {
    if (!runtime || !runtime.extensionManager || typeof runtime.extensionManager.runHook !== 'function') {
      return baseView;
    }
    const execution = runtime.extensionManager.runHook('beforeBuildPlayerView', {
      view: baseView,
      type: options.type || 'player',
      seatKey: options.seatKey || 'bottom'
    }, {
      ruleset: runtime.rulesetProfile && runtime.rulesetProfile.id ? runtime.rulesetProfile.id : null,
      advancedMode: Boolean(runtime.presentation && runtime.presentation.advancedMode),
      actorSeat: options.seatKey || 'bottom',
      seatKeys: SEAT_KEYS,
      roundState: runtime.roundConfig || null,
      wallState: runtime.wallService && typeof runtime.wallService.getState === 'function'
        ? runtime.wallService.getState()
        : null,
      boardState: runtime.board || null,
      presentation: runtime.presentation || null,
      meta: {
        viewType: options.type || 'player'
      }
    });
    return execution && execution.result
      ? mergeViewPatch(baseView, execution.result)
      : baseView;
  },
  buildSeatSnapshot(runtime, seatKey, hiddenHand) {
    if (runtime && runtime.topology && typeof runtime.topology.isActiveSeat === 'function' && !runtime.topology.isActiveSeat(seatKey)) {
      return buildInactiveSeatView(runtime, seatKey);
    }
    const seatIndex = runtime.getSeatIndex(seatKey);
    return {
      ...runtime.seatMeta[seatKey],
      ...getVisibleSeatState(runtime.board, seatIndex, { hiddenHand }),
      riichiState: clone(runtime.riichiState && runtime.riichiState[seatKey] ? runtime.riichiState[seatKey] : null),
      furitenState: clone(runtime.furitenState && runtime.furitenState[seatKey] ? runtime.furitenState[seatKey] : null),
      status: typeof runtime.getSeatStatus === 'function' ? clone(runtime.getSeatStatus(seatKey)) : null
    };
  }
});

const {
  createTruthView,
  createPlayerView,
  createAiView,
  buildViewBundle
} = viewBuilder;

module.exports = {
  buildSharedInfo,
  buildSeatView,
  createTruthView,
  createPlayerView,
  createAiView,
  buildViewBundle,
  clone
};
