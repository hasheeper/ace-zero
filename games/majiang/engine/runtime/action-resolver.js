'use strict';

const { normalizeRuntimeActionType } = require('./reaction-priority');

function inferActionType(action) {
  if (!action) return null;
  if (typeof action.type === 'string' && action.type) {
    return normalizeRuntimeActionType(action.type);
  }
  if (typeof action.key === 'string' && action.key) {
    return normalizeRuntimeActionType(action.key.split(':')[0]);
  }
  return null;
}

function normalizeActionPayload(action) {
  if (!action || typeof action !== 'object') return {};
  return action.payload && typeof action.payload === 'object'
    ? { ...action.payload }
    : {};
}

function createActionResolver(runtime) {
  if (!runtime) {
    throw new Error('createActionResolver requires a runtime instance.');
  }

  return {
    resolve(action) {
      if (typeof action === 'string') {
        return this.resolve({ key: action });
      }
      if (!action || typeof action !== 'object') {
        throw new Error('Runtime action must be an object or string key.');
      }

      const type = inferActionType(action);
      const payload = normalizeActionPayload(action);

      switch (type) {
        case 'draw':
          return runtime.drawTile(payload.seat, payload.tileCode);
        case 'discard':
          return runtime.discardTile(payload.seat, payload.tileCode, payload.options || {
            riichi: Boolean(payload.riichi)
          });
        case 'meld':
        case 'call':
          return runtime.callMeld(payload.seat, payload.meld || payload.meldString);
        case 'kan':
        case 'gang':
          if (typeof runtime.resolveKanSequence === 'function') {
            return runtime.resolveKanSequence(payload.seat, payload.meld || payload.meldString, payload);
          }
          return runtime.declareKan(payload.seat, payload.meld || payload.meldString);
        case 'kita':
        case 'nuki':
        case 'bei':
          return runtime.declareKita(payload.seat, payload);
        case 'dora':
        case 'flip-dora':
          return runtime.flipDora(payload.tileCode);
        case 'hule':
          return runtime.resolveHule(payload.seat, payload);
        case 'draw-round':
        case 'pingju':
          return runtime.resolveDraw(payload.reason, payload);
        case 'daopai':
        case 'no-daopai':
          return runtime.declareNoDaopai(payload.seat);
        case 'pass':
        case 'reaction-pass':
          return runtime.passReaction(payload.seat, payload);
        case 'scores':
        case 'scores-update':
          return runtime.setScores(payload.scores || payload);
        case 'action-window':
        case 'action-window-update':
          return runtime.setActionWindow(payload.actionWindow || payload);
        default:
          throw new Error(`Unsupported runtime action type: ${type || 'unknown'}`);
      }
    }
  };
}

module.exports = {
  createActionResolver
};
