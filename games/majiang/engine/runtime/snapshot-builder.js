'use strict';

const { clone } = require('../base/majiang-core-adapter');
const { buildViewBundle } = require('../base/view-builder');

function buildRuntimeSnapshot(runtime) {
  const currentActionWindow = runtime.actionWindow ? clone(runtime.actionWindow) : null;
  const lastEvent = runtime.lastEvent ? clone({
    type: runtime.lastEvent.type,
    payload: runtime.lastEvent.payload,
    timestamp: runtime.lastEvent.timestamp,
    meta: runtime.lastEvent.meta
  }) : null;
  const views = buildViewBundle(runtime, {
    playerSeat: runtime.playerSeat || 'bottom'
  });

  return {
    mode: runtime.mode,
    phase: runtime.stateMachine.getPhase(),
    turnSeat: typeof runtime.getCurrentTurnSeat === 'function' ? runtime.getCurrentTurnSeat() : null,
    info: clone(views.playerView.info),
    seats: clone(views.playerView.seats),
    view: clone(runtime.presentation.view),
    views,
    actionWindow: currentActionWindow,
    availableActions: currentActionWindow && Array.isArray(currentActionWindow.actions)
      ? currentActionWindow.actions.map((action) => clone(action))
      : [],
    wallState: runtime && typeof runtime.getWallState === 'function'
      ? clone(runtime.getWallState())
      : null,
    interaction: runtime && typeof runtime.getInteractionState === 'function'
      ? clone(runtime.getInteractionState())
      : null,
    roundResult: runtime && runtime.roundResult ? clone(runtime.roundResult) : null,
    eventLog: Array.isArray(runtime && runtime.eventLog)
      ? runtime.eventLog.map((event) => clone(event))
      : [],
    lastEvent
  };
}

module.exports = {
  buildRuntimeSnapshot
};
