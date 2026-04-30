(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.AceMahjongCreateBrowserFormalRuntimeAssembly = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  function createBrowserFormalRuntimeAssembly() {
    function attachFoundationMethods(runtime, deps = {}) {
      runtime.getPlayerIdentityIndex = function(seatKey) {
        const seatOrder = Array.isArray(runtime.playerSeatOrder) && runtime.playerSeatOrder.length
          ? runtime.playerSeatOrder
          : runtime.activeSeats;
        return seatOrder.indexOf(seatKey);
      };

      runtime.getSeatKeyByPlayerIdentity = function(playerIndex) {
        const seatOrder = Array.isArray(runtime.playerSeatOrder) && runtime.playerSeatOrder.length
          ? runtime.playerSeatOrder
          : runtime.activeSeats;
        return seatOrder[playerIndex] || null;
      };

      runtime.getSeatIndex = function(seatKey) {
        const playerIndex = runtime.getPlayerIdentityIndex(seatKey);
        if (playerIndex < 0) return -1;
        const playerIds = runtime.board && Array.isArray(runtime.board.player_id) ? runtime.board.player_id : null;
        return playerIds ? playerIds.indexOf(playerIndex) : playerIndex;
      };

      runtime.getSeatKeyByIndex = function(seatIndex) {
        if (!Number.isInteger(seatIndex) || seatIndex < 0) return null;
        const playerIds = runtime.board && Array.isArray(runtime.board.player_id) ? runtime.board.player_id : null;
        const playerIndex = playerIds ? playerIds[seatIndex] : seatIndex;
        return runtime.getSeatKeyByPlayerIdentity(playerIndex);
      };

      runtime.getDealerSeat = function() {
        return runtime.getSeatKeyByIndex(0);
      };

      runtime.getSeatWindMap = function() {
        const windLabels = ['东', '南', '西', '北'];
        return deps.CANONICAL_SEAT_KEYS.reduce((result, seatKey) => {
          const windIndex = runtime.activeSeats.includes(seatKey) ? runtime.getSeatIndex(seatKey) : -1;
          result[seatKey] = {
            index: windIndex,
            label: windIndex >= 0 ? (windLabels[windIndex] || '') : ''
          };
          return result;
        }, {});
      };

      runtime.getNextSeatKey = function(seatKey) {
        return runtime.topology.getNextSeat(seatKey);
      };

      runtime.subscribe = function(listener) {
        if (typeof listener !== 'function') return function() {};
        runtime.listeners.add(listener);
        return () => runtime.listeners.delete(listener);
      };

      runtime.setPhase = function(phase) {
        runtime.phase = Object.values(deps.FORMAL_PHASES).includes(phase)
          ? phase
          : deps.FORMAL_PHASES.AWAIT_DRAW;
        return runtime.phase;
      };

      runtime.getSeatHandCodes = function(seatKey) {
        const seatIndex = runtime.getSeatIndex(seatKey);
        if (seatIndex < 0) return [];
        return deps.getShoupaiTiles(runtime.board.shoupai[seatIndex])
          .filter((tile) => !tile.hidden)
          .map((tile) => tile.code);
      };

      runtime.getRiichiChoices = function(seatOrIndex) {
        const seatIndex = typeof seatOrIndex === 'string'
          ? runtime.getSeatIndex(seatOrIndex)
          : Number(seatOrIndex);
        return deps.getRiichiChoices(runtime, seatIndex);
      };

      runtime.getSeatStatus = function(seatKey) {
        return deps.buildSeatStatusState(runtime, seatKey);
      };

      runtime.buildHupaiContext = function(seatKey, options = {}) {
        return deps.buildHupaiContext(runtime, seatKey, options);
      };

      runtime.canSeatHule = function(seatKey, options = {}) {
        if (typeof deps.canSeatHule !== 'function') return false;
        const seatIndex = runtime.getSeatIndex(seatKey);
        const shoupai = options.shoupai || (
          seatIndex >= 0 && runtime.board && Array.isArray(runtime.board.shoupai)
            ? runtime.board.shoupai[seatIndex]
            : null
        );
        return deps.canSeatHule(runtime, seatKey, shoupai, options);
      };

      runtime.canDeclareNineKindsDraw = function(seatKey) {
        return deps.canDeclareNineKindsDraw(runtime, seatKey);
      };

      runtime.canDeclareNoDaopai = function(seatKey) {
        return deps.canDeclareNoDaopai(runtime, seatKey);
      };

      runtime.canDeclareKita = function(seatKey) {
        if (typeof deps.canDeclareKita !== 'function') return false;
        return deps.canDeclareKita(runtime, seatKey);
      };

      runtime.clearNoDaopaiDeclarations = function() {
        runtime.declaredNoDaopaiSeats = [];
        return [];
      };

      runtime.declareNoDaopai = function(seatKey) {
        if (!seatKey || !runtime.canDeclareNoDaopai(seatKey)) return false;
        if (!Array.isArray(runtime.declaredNoDaopaiSeats)) {
          runtime.declaredNoDaopaiSeats = [];
        }
        if (!runtime.declaredNoDaopaiSeats.includes(seatKey)) {
          runtime.declaredNoDaopaiSeats.push(seatKey);
        }
        return true;
      };

      runtime.getScoreMap = function() {
        return deps.CANONICAL_SEAT_KEYS.reduce((result, seatKey) => {
          const playerIndex = runtime.getPlayerIdentityIndex(seatKey);
          result[seatKey] = playerIndex >= 0
            ? (runtime.board.defen[playerIndex] || 0)
            : 0;
          return result;
        }, {});
      };

      runtime.getInteractionState = function() {
        const bottomIndex = runtime.getSeatIndex('bottom');
        const legalTileCodes = runtime.pendingRiichi && bottomIndex >= 0
          ? deps.getRiichiChoices(runtime, bottomIndex)
          : [];
        const isBottomDiscardPhase = bottomIndex >= 0
          && runtime.phase === deps.FORMAL_PHASES.AWAIT_DISCARD
          && runtime.turnSeat === 'bottom'
          && runtime.board.lunban === bottomIndex;
        return {
          riichiSelection: {
            active: Boolean(runtime.pendingRiichi),
            legalTileCodes: Array.isArray(legalTileCodes) ? legalTileCodes.slice() : []
          },
          discardSelection: {
            active: Boolean(isBottomDiscardPhase),
            legalTileCodes: isBottomDiscardPhase ? deps.getSeatDiscardCandidateCodes(runtime, 'bottom') : []
          },
          specialActions: {
            active: Boolean(isBottomDiscardPhase),
            legalActionKeys: isBottomDiscardPhase && typeof runtime.canDeclareKita === 'function' && runtime.canDeclareKita('bottom')
              ? ['kita']
              : []
          },
          furiten: deps.clone(runtime.furitenState && runtime.furitenState.bottom ? runtime.furitenState.bottom : null)
        };
      };

      runtime.getWallState = function() {
        const serviceState = runtime.wallService && typeof runtime.wallService.getState === 'function'
          ? runtime.wallService.getState()
          : null;
        const baopai = serviceState && Array.isArray(serviceState.baopai)
          ? serviceState.baopai.slice()
          : (runtime.board && runtime.board.shan && Array.isArray(runtime.board.shan.baopai) ? runtime.board.shan.baopai.slice() : []);
        const fubaopai = serviceState && Array.isArray(serviceState.fubaopai)
          ? serviceState.fubaopai.slice()
          : (runtime.board && runtime.board.shan && Array.isArray(runtime.board.shan.fubaopai) ? runtime.board.shan.fubaopai.slice() : []);
        const deadWallSize = serviceState && Number.isFinite(Number(serviceState.deadWallSize))
          ? Number(serviceState.deadWallSize)
          : Number(runtime.rulesetProfile && runtime.rulesetProfile.deadWallSize || 14) || 14;
        return {
          remaining: serviceState && Number.isFinite(Number(serviceState.remaining))
            ? Number(serviceState.remaining)
            : (runtime.board && runtime.board.shan ? runtime.board.shan.paishu : 0),
          liveWallRemaining: serviceState && Number.isFinite(Number(serviceState.liveWallRemaining))
            ? Number(serviceState.liveWallRemaining)
            : (runtime.board && runtime.board.shan ? runtime.board.shan.paishu : 0),
          deadWallSize,
          baopai,
          fubaopai,
          doraIndicators: serviceState && Array.isArray(serviceState.doraIndicators)
            ? serviceState.doraIndicators.slice()
            : Array.from({ length: 5 }, (_, index) => baopai[index] || null),
          uraDoraIndicators: serviceState && Array.isArray(serviceState.uraDoraIndicators)
            ? serviceState.uraDoraIndicators.slice()
            : Array.from({ length: 5 }, (_, index) => fubaopai[index] || null),
          revealedDoraCount: serviceState && Number.isFinite(Number(serviceState.revealedDoraCount))
            ? Number(serviceState.revealedDoraCount)
            : baopai.length,
          revealedUraDoraCount: serviceState && Number.isFinite(Number(serviceState.revealedUraDoraCount))
            ? Number(serviceState.revealedUraDoraCount)
            : fubaopai.length,
          rinshanTotal: serviceState && Number.isFinite(Number(serviceState.rinshanTotal))
            ? Number(serviceState.rinshanTotal)
            : 4,
          rinshanRemaining: serviceState && Number.isFinite(Number(serviceState.rinshanRemaining))
            ? Number(serviceState.rinshanRemaining)
            : Math.max(0, 4 - Math.max(0, baopai.length - 1)),
          drawSource: runtime.initialRoundData ? runtime.initialRoundData.source : null
        };
      };

      runtime.getSnapshot = function() {
        const views = deps.browserViewBuilder.buildViewBundle(runtime, {
          playerSeat: 'bottom'
        });

        return {
          mode: runtime.mode,
          phase: runtime.phase,
          turnSeat: runtime.turnSeat || 'bottom',
          info: deps.clone(views.playerView.info),
          seats: deps.clone(views.playerView.seats),
          view: deps.clone(runtime.presentation.view),
          views,
          actionWindow: runtime.actionWindow ? deps.clone(runtime.actionWindow) : null,
          availableActions: runtime.actionWindow && Array.isArray(runtime.actionWindow.actions)
            ? runtime.actionWindow.actions.map((action) => deps.clone(action))
            : [],
          wallState: runtime.getWallState(),
          interaction: runtime.getInteractionState(),
          roundResult: runtime.roundResult ? deps.clone(runtime.roundResult) : null,
          eventLog: runtime.eventLog.map((event) => deps.clone(event)),
          lastEvent: runtime.lastEvent ? deps.clone({
            type: runtime.lastEvent.type,
            payload: runtime.lastEvent.payload,
            timestamp: runtime.lastEvent.timestamp,
            meta: runtime.lastEvent.meta
          }) : null
        };
      };

      runtime.emit = function(type, payload = {}, meta = {}) {
        const baseEvent = {
          type,
          payload,
          timestamp: Date.now(),
          meta: {
            phase: runtime.phase,
            engineSource: runtime.engineSource,
            ...meta
          }
        };
        runtime.lastEvent = baseEvent;
        const event = {
          ...baseEvent,
          snapshot: runtime.getSnapshot()
        };
        runtime.lastEvent = event;
        runtime.eventLog.push({
          type: event.type,
          payload: deps.clone(event.payload),
          timestamp: event.timestamp,
          meta: deps.clone(event.meta)
        });
        if (runtime.eventLog.length > 50) {
          runtime.eventLog = runtime.eventLog.slice(-50);
        }
        runtime.listeners.forEach((listener) => listener(event));
        return event.snapshot;
      };

      runtime.setActionWindow = function(actionWindow) {
        runtime.actionWindow = deps.createNormalizedActionWindow(actionWindow);
        return runtime.emit('action-window:update', {
          actionWindow: runtime.actionWindow,
          availableActions: runtime.actionWindow && Array.isArray(runtime.actionWindow.actions)
            ? runtime.actionWindow.actions
            : []
        });
      };

      runtime.nextDrawTile = function() {
        return {
          tileCode: null,
          source: 'majiang-core:shan'
        };
      };

      runtime.start = function() {
        runtime.roundResult = null;
        runtime.eventLog = [];
        deps.resetRuntimeRiichiTracking(runtime);
        runtime.declaredNoDaopaiSeats = [];
        runtime.pendingRiichi = false;
        runtime.pendingReaction = null;
        runtime.pendingKanResolution = null;
        runtime.actionWindow = null;
        if (runtime.testing && runtime.testing.runtimeSetup) {
          deps.applyTestingRuntimeSetup(runtime, runtime.testing.runtimeSetup);
        }
        deps.refreshAllFuritenStates(runtime);
        runtime.setPhase(deps.FORMAL_PHASES.AWAIT_DRAW);
        runtime.emit('round:start', {
          zhuangfeng: runtime.board.zhuangfeng,
          jushu: runtime.board.jushu
        });
        return runtime.emit('deal:initial', {
          source: runtime.initialRoundData ? runtime.initialRoundData.source : 'live-shan',
          remaining: runtime.getWallState().remaining,
          baopai: runtime.getWallState().baopai.slice(),
          haipai: runtime.initialRoundData ? deps.clone(runtime.initialRoundData.haipai || []) : []
        });
      };

      runtime.setScores = function(scores = {}) {
        deps.CANONICAL_SEAT_KEYS.forEach((seatKey) => {
          const value = scores[seatKey];
          const playerIndex = runtime.getPlayerIdentityIndex(seatKey);
          if (playerIndex < 0 || typeof value !== 'number') return;
          runtime.board.defen[playerIndex] = value;
        });
        return runtime.emit('scores:update', { scores });
      };

      return runtime;
    }

    return {
      attachFoundationMethods
    };
  }

  return createBrowserFormalRuntimeAssembly;
});
