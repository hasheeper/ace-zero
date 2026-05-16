(function(global) {
  'use strict';

  const BROWSER_RUNTIME_PHASES = Object.freeze({
    AWAIT_DRAW: 'await_draw',
    AWAIT_DISCARD: 'await_discard',
    AWAIT_REACTION: 'await_reaction',
    AWAIT_RESOLUTION: 'await_resolution',
    ROUND_END: 'round_end'
  });

  function createActionNormalizer(options = {}) {
    const resolvePrimaryHumanSeat = typeof options.resolvePrimaryHumanSeat === 'function'
      ? options.resolvePrimaryHumanSeat
      : function resolveDefaultPrimaryHumanSeat() { return 'bottom'; };

    function inferBrowserActionType(action) {
      if (!action) return null;
      if (typeof action.type === 'string' && action.type && action.type !== 'ui-action') return action.type;
      if (typeof action.key === 'string' && action.key) {
        return action.key.split(':')[0];
      }
      return null;
    }

    function normalizeBrowserActionPayload(action) {
      if (!action || typeof action !== 'object') return {};
      return action.payload && typeof action.payload === 'object'
        ? { ...action.payload }
        : {};
    }

    function normalizeBrowserActionType(type = null) {
      const normalized = String(type || '').trim().toLowerCase();
      if (!normalized) return null;
      if (['discard', 'discard-index', 'pass', 'hule'].includes(normalized)) return normalized;
      if (['call', 'chi', 'peng', 'pon'].includes(normalized)) return 'call';
      if (['kan', 'gang', 'daiminkan', 'ankan', 'kakan'].includes(normalized)) return 'kan';
      return normalized;
    }

    function getRuntimeSnapshotSafe(runtime) {
      if (!runtime || typeof runtime.getSnapshot !== 'function') return null;
      return runtime.getSnapshot();
    }

    function getSnapshotSeatHandCodes(snapshot, seatKey) {
      const seat = snapshot && snapshot.seats ? snapshot.seats[seatKey] : null;
      const handTiles = seat && Array.isArray(seat.handTiles) ? seat.handTiles : [];
      return handTiles
        .map((tile) => tile && tile.code ? tile.code : null)
        .filter(Boolean);
    }

    function getRuntimeSeatHandCodes(runtime, seatKey) {
      const snapshotCodes = getSnapshotSeatHandCodes(getRuntimeSnapshotSafe(runtime), seatKey);
      if (snapshotCodes.length) return snapshotCodes;
      if (runtime && typeof runtime.getSeatHandCodes === 'function') {
        return runtime.getSeatHandCodes(seatKey);
      }
      return [];
    }

    function getRuntimeSeatHandTileIndex(runtime, seatKey, tileCode) {
      const handCodes = getRuntimeSeatHandCodes(runtime, seatKey);
      const normalizedCode = typeof tileCode === 'string' ? tileCode.trim().toLowerCase() : '';
      if (!normalizedCode) return -1;
      for (let index = handCodes.length - 1; index >= 0; index -= 1) {
        const currentCode = String(handCodes[index] || '').replace(/[\*_\+\=\-]$/, '').toLowerCase();
        if (currentCode === normalizedCode) return index;
      }
      return -1;
    }

    function summarizeBrowserRuntimeAction(action = null, runtime = null) {
      const type = normalizeBrowserActionType(inferBrowserActionType(action));
      const payload = normalizeBrowserActionPayload(action);
      if (!type) return null;
      if (!['discard', 'discard-index', 'call', 'kan', 'pass', 'hule'].includes(type)) return null;
      const normalizedType = type === 'discard-index' ? 'discard' : type;
      let tileCode = typeof payload.tileCode === 'string' ? payload.tileCode : null;
      if (!tileCode && normalizedType === 'discard' && Number.isInteger(payload.tileIndex) && runtime) {
        const seatKey = typeof payload.seat === 'string' ? payload.seat : resolvePrimaryHumanSeat();
        const handCodes = getRuntimeSeatHandCodes(runtime, seatKey);
        if (payload.tileIndex >= 0 && payload.tileIndex < handCodes.length) {
          tileCode = handCodes[payload.tileIndex] || null;
        }
      }
      return {
        type: normalizedType,
        seat: typeof payload.seat === 'string' ? payload.seat : resolvePrimaryHumanSeat(),
        tileCode,
        fromSeat: typeof payload.fromSeat === 'string' ? payload.fromSeat : null,
        callType: typeof payload.callType === 'string' ? payload.callType : null,
        meldString: typeof payload.meldString === 'string'
          ? payload.meldString
          : (typeof payload.meld === 'string' ? payload.meld : null),
        riichi: Boolean(payload.riichi)
      };
    }

    function buildRuntimeDispatchAction(action = null, runtime = null) {
      if (!action || typeof action !== 'object') return action;
      if (action.type !== 'ui-action') return action;
      const normalized = summarizeBrowserRuntimeAction(action, runtime);
      if (!normalized || !normalized.type) return action;
      const payload = normalizeBrowserActionPayload(action);
      return {
        ...action,
        type: normalized.type,
        payload: {
          ...payload,
          seat: normalized.seat || payload.seat || null,
          tileCode: normalized.tileCode || payload.tileCode || null,
          fromSeat: normalized.fromSeat || payload.fromSeat || null,
          callType: normalized.callType || payload.callType || null,
          meldString: normalized.meldString || payload.meldString || payload.meld || null,
          meld: normalized.meldString || payload.meld || payload.meldString || null,
          riichi: normalized.riichi
        }
      };
    }

    function summarizeAction(action) {
      if (!action) return null;
      return {
        key: action.key || null,
        type: action.type || null,
        seat: action.payload && action.payload.seat ? action.payload.seat : null,
        label: action.label || null
      };
    }

    function isRuntimeAwaitingBottomDiscard(runtime) {
      const snapshot = getRuntimeSnapshotSafe(runtime);
      if (!snapshot) return false;
      const turnSeat = snapshot.turnSeat
        || (snapshot.info ? snapshot.info.turnSeat : null)
        || null;
      return snapshot.phase === BROWSER_RUNTIME_PHASES.AWAIT_DISCARD
        && turnSeat === 'bottom';
    }

    return {
      BROWSER_RUNTIME_PHASES,
      inferBrowserActionType,
      normalizeBrowserActionPayload,
      normalizeBrowserActionType,
      summarizeBrowserRuntimeAction,
      buildRuntimeDispatchAction,
      summarizeAction,
      getRuntimeSnapshotSafe,
      getSnapshotSeatHandCodes,
      getRuntimeSeatHandCodes,
      getRuntimeSeatHandTileIndex,
      isRuntimeAwaitingBottomDiscard
    };
  }

  global.AceMahjongBridgeActionNormalizer = {
    BROWSER_RUNTIME_PHASES,
    create: createActionNormalizer
  };
})(typeof window !== 'undefined' ? window : globalThis);
