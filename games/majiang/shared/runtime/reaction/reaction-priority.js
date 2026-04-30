(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.AceMahjongReactionPriority = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const REACTION_PRIORITY = Object.freeze({
    HULE: 400,
    KAN: 300,
    PENG: 200,
    CHI: 100,
    PASS: 0
  });

  function normalizeReactionType(type) {
    if (type === 'gang') return 'kan';
    if (type === 'pon') return 'peng';
    return type || null;
  }

  function normalizeRuntimeActionType(type) {
    const normalized = normalizeReactionType(type);
    if (normalized === 'peng' || normalized === 'chi') return 'call';
    return normalized;
  }

  function getReactionPriority(type) {
    const normalized = normalizeReactionType(type);
    if (normalized === 'hule') return REACTION_PRIORITY.HULE;
    if (normalized === 'kan') return REACTION_PRIORITY.KAN;
    if (normalized === 'peng') return REACTION_PRIORITY.PENG;
    if (normalized === 'chi') return REACTION_PRIORITY.CHI;
    return REACTION_PRIORITY.PASS;
  }

  function getActionPriority(action) {
    if (action && Number.isFinite(action.priority)) return Number(action.priority);
    if (action && action.payload && typeof action.payload.callType === 'string') {
      return getReactionPriority(action.payload.callType);
    }
    return getReactionPriority(action && action.type);
  }

  function getClaimDirectionSuffix(discarderIndex, reactorIndex) {
    return '_+=-'[(4 + discarderIndex - reactorIndex) % 4] || '_';
  }

  function getClaimTileCode(tileCode, discarderIndex, reactorIndex) {
    return `${tileCode}${getClaimDirectionSuffix(discarderIndex, reactorIndex)}`;
  }

  function sortReactionActions(actions = []) {
    return actions.slice().sort((left, right) => {
      const priorityDiff = getActionPriority(right) - getActionPriority(left);
      if (priorityDiff !== 0) return priorityDiff;

      const seatDiff = (left.reactionOrder || 0) - (right.reactionOrder || 0);
      if (seatDiff !== 0) return seatDiff;

      return String(left.key || '').localeCompare(String(right.key || ''));
    });
  }

  function matchesReactionAction(action, type, seatKey) {
    if (!action || action.type === 'pass' || !action.payload) return false;
    if (seatKey && action.payload.seat !== seatKey) return false;

    const requestedType = normalizeRuntimeActionType(type);
    const actionType = normalizeRuntimeActionType(action.type);
    if (actionType !== requestedType) return false;

    if (requestedType !== 'call') return true;
    const requestedCallType = normalizeReactionType(type);
    if (requestedCallType === 'call') return true;
    return normalizeReactionType(action.payload.callType) === requestedCallType;
  }

  function findBlockingReactionAction(pendingReaction, type, seatKey) {
    if (!pendingReaction || !Array.isArray(pendingReaction.actions)) return null;

    const activeActions = sortReactionActions(
      pendingReaction.actions.filter((action) => (
        action
        && action.type !== 'pass'
        && action.payload
        && !pendingReaction.passedSeats.includes(action.payload.seat)
      ))
    );

    const targetAction = activeActions.find((action) => matchesReactionAction(action, type, seatKey));
    if (!targetAction) return { reason: 'missing-action' };

    if (normalizeRuntimeActionType(type) === 'hule' && normalizeRuntimeActionType(targetAction.type) === 'hule') {
      return null;
    }

    const targetIndex = activeActions.indexOf(targetAction);
    if (targetIndex <= 0) return null;

    const blockingAction = activeActions
      .slice(0, targetIndex)
      .find((action) => action && action.payload && action.payload.seat !== targetAction.payload.seat);

    return blockingAction || null;
  }

  return {
    REACTION_PRIORITY,
    normalizeReactionType,
    normalizeRuntimeActionType,
    getReactionPriority,
    getActionPriority,
    getClaimDirectionSuffix,
    getClaimTileCode,
    sortReactionActions,
    matchesReactionAction,
    findBlockingReactionAction
  };
});
