(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.AceMahjongCreateRuntimeReactionFlowHelpers = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  function createPendingReactionContext(options = {}) {
    return {
      kind: options.kind || 'discard',
      fromSeat: options.fromSeat || null,
      tileCode: options.tileCode || null,
      nextSeat: options.nextSeat || null,
      actions: Array.isArray(options.actions) ? options.actions : [],
      passedSeats: Array.isArray(options.passedSeats) ? options.passedSeats.slice() : [],
      furitenSeatKeys: Array.isArray(options.furitenSeatKeys) ? options.furitenSeatKeys.slice() : [],
      selectedHuleActions: Array.isArray(options.selectedHuleActions) ? options.selectedHuleActions.slice() : []
    };
  }

  function hasReactionActions(actions = []) {
    return actions.some((action) => action && action.type !== 'pass');
  }

  function queueSelectedHuleAction(runtime, seatKey, options = {}, hooks = {}) {
    const pendingReaction = runtime ? runtime.pendingReaction : null;
    if (!pendingReaction || !seatKey) {
      return hooks.getSnapshot(runtime);
    }

    if (!Array.isArray(pendingReaction.selectedHuleActions)) {
      pendingReaction.selectedHuleActions = [];
    }

    const existingSelection = pendingReaction.selectedHuleActions.find((entry) => entry && entry.seatKey === seatKey);
    if (!existingSelection) {
      const selectedAction = hooks.getPendingReactionHuleActions(pendingReaction)
        .find((action) => action.payload && action.payload.seat === seatKey);
      pendingReaction.selectedHuleActions.push({
        seatKey,
        reactionOrder: selectedAction ? selectedAction.reactionOrder : 0,
        options: {
          ...options,
          selfDraw: false
        }
      });
    }

    if (!pendingReaction.passedSeats.includes(seatKey)) {
      pendingReaction.passedSeats.push(seatKey);
    }

    hooks.emitReactionHuleSelect(runtime, {
      seat: seatKey,
      fromSeat: pendingReaction.fromSeat,
      tileCode: pendingReaction.tileCode,
      rongpai: options.rongpai || null
    });
    return hooks.rebuildReactionWindow(runtime);
  }

  function openPendingReaction(runtime, options = {}, hooks = {}) {
    const actions = Array.isArray(options.actions) ? options.actions : [];
    const context = createPendingReactionContext(options);

    if (!hasReactionActions(actions)) {
      hooks.onEmpty(runtime, context);
      return hooks.emitReactionWindowEmpty(runtime, {
        kind: context.kind,
        fromSeat: context.fromSeat,
        tileCode: context.tileCode,
        nextSeat: context.nextSeat
      }, context);
    }

    runtime.pendingReaction = context;
    hooks.onOpen(runtime, context);
    return hooks.emitReactionWindowOpen(runtime, {
      kind: context.kind,
      fromSeat: context.fromSeat,
      tileCode: context.tileCode,
      actions: hooks.cloneActions(context.actions)
    }, context);
  }

  function rebuildPendingReaction(runtime, hooks = {}) {
    if (!runtime || !runtime.pendingReaction) {
      hooks.clearActionWindow(runtime);
      return hooks.getSnapshot(runtime);
    }

    const hasSelectedHule = Array.isArray(runtime.pendingReaction.selectedHuleActions)
      && runtime.pendingReaction.selectedHuleActions.length > 0;
    const seatsWithPendingHule = hasSelectedHule
      ? new Set(
          runtime.pendingReaction.actions
            .filter((action) => (
              action
              && action.type === 'hule'
              && action.payload
              && !runtime.pendingReaction.passedSeats.includes(action.payload.seat)
            ))
            .map((action) => action.payload.seat)
        )
      : null;

    const remainingActions = runtime.pendingReaction.actions.filter((action) => {
      const seat = action && action.payload ? action.payload.seat : null;
      if (seat && runtime.pendingReaction.passedSeats.includes(seat)) return false;
      if (!hasSelectedHule) return true;
      if (!action || !seat) return false;
      if (action.type === 'hule') return true;
      if (action.type === 'pass') return seatsWithPendingHule.has(seat);
      return false;
    });

    if (!hasReactionActions(remainingActions)) {
      const context = hooks.cloneContext(runtime.pendingReaction);
      hooks.applyPendingReactionFuriten(runtime, context);
      runtime.pendingReaction = null;
      hooks.clearActionWindow(runtime);
      hooks.emitReactionWindowClosed(runtime, {
        fromSeat: context.fromSeat,
        tileCode: context.tileCode,
        nextSeat: context.nextSeat,
        reason: Array.isArray(context.selectedHuleActions) && context.selectedHuleActions.length
          ? 'resolved-hule'
          : 'all-pass'
      }, context);
      return hooks.resolvePostReactionState(runtime, context);
    }

    runtime.pendingReaction.actions = remainingActions;
    hooks.setReactionActionWindow(runtime, remainingActions);
    return hooks.getSnapshot(runtime);
  }

  function createRuntimeReactionFlowHelpers() {
    return {
      createPendingReactionContext,
      queueSelectedHuleAction,
      openPendingReaction,
      rebuildPendingReaction
    };
  }

  createRuntimeReactionFlowHelpers.createPendingReactionContext = createPendingReactionContext;
  createRuntimeReactionFlowHelpers.queueSelectedHuleAction = queueSelectedHuleAction;
  createRuntimeReactionFlowHelpers.openPendingReaction = openPendingReaction;
  createRuntimeReactionFlowHelpers.rebuildPendingReaction = rebuildPendingReaction;

  return createRuntimeReactionFlowHelpers;
});
