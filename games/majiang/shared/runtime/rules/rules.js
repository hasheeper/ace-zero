(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.AceMahjongCreateRuntimeRuleHelpers = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const DEFAULT_SEAT_KEYS = ['bottom', 'right', 'top', 'left'];

  function getSeatKeys(options = {}) {
    return Array.isArray(options.seatKeys) && options.seatKeys.length
      ? options.seatKeys.slice()
      : DEFAULT_SEAT_KEYS.slice();
  }

  function getActiveSeatKeys(runtime, seatKeys) {
    if (runtime && runtime.topology && Array.isArray(runtime.topology.activeSeats) && runtime.topology.activeSeats.length) {
      return runtime.topology.activeSeats.slice();
    }
    if (runtime && Array.isArray(runtime.activeSeats) && runtime.activeSeats.length) {
      return runtime.activeSeats.slice();
    }
    return seatKeys.slice();
  }

  function getRelativeSeatKey(baseSeatKey, direction, options = {}) {
    const seatKeys = getSeatKeys(options);
    const baseIndex = seatKeys.indexOf(baseSeatKey);
    if (baseIndex < 0) return null;
    const offsetMap = { '+': 1, '=': 2, '-': 3 };
    const offset = offsetMap[direction];
    if (!offset) return null;
    return seatKeys[(baseIndex + offset) % seatKeys.length] || null;
  }

  function extractBaojiaSummary(winnerSeat, result, options = {}) {
    const hupai = result && Array.isArray(result.hupai) ? result.hupai : [];
    const baojiaYaku = hupai.find((item) => item && item.baojia);
    if (!baojiaYaku || !winnerSeat) {
      return {
        baojiaSeat: null,
        baojiaYaku: null,
        baojiaDirection: null
      };
    }

    return {
      baojiaSeat: getRelativeSeatKey(winnerSeat, baojiaYaku.baojia, options),
      baojiaYaku: baojiaYaku.name || null,
      baojiaDirection: baojiaYaku.baojia || null
    };
  }

  function commitPendingRiichiStick(runtime) {
    if (!runtime || !runtime.board || typeof runtime.board.lizhi !== 'function') return;
    runtime.board.lizhi();
  }

  function getSeatVisibleRiverTileCodes(runtime, seatKey) {
    const seatIndex = runtime && typeof runtime.getSeatIndex === 'function'
      ? runtime.getSeatIndex(seatKey)
      : -1;
    if (seatIndex < 0) return [];
    const river = runtime && runtime.board && runtime.board.he && Array.isArray(runtime.board.he)
      ? runtime.board.he[seatIndex]
      : null;
    const riverCodes = river && Array.isArray(river._pai) ? river._pai : [];
    return riverCodes
      .filter((code) => !/[\+\=\-]$/.test(String(code || '')))
      .map((code) => String(code || '').replace(/\*$/, ''))
      .filter(Boolean);
  }

  function hasSeatRiichiMarker(runtime, seatKey) {
    const seatIndex = runtime && typeof runtime.getSeatIndex === 'function'
      ? runtime.getSeatIndex(seatKey)
      : -1;
    if (seatIndex < 0) return false;
    const river = runtime && runtime.board && runtime.board.he && Array.isArray(runtime.board.he)
      ? runtime.board.he[seatIndex]
      : null;
    const riverCodes = river && Array.isArray(river._pai) ? river._pai : [];
    return riverCodes.some((code) => /\*$/.test(String(code || '')));
  }

  function getSeatRiichiDeclarationState(runtime, seatKey) {
    if (!runtime || !runtime.riichiState || !runtime.riichiState[seatKey]) {
      return null;
    }
    return runtime.riichiState[seatKey];
  }

  function isSeatRiichiDeclared(runtime, seatKey) {
    const declarationState = getSeatRiichiDeclarationState(runtime, seatKey);
    if (declarationState && declarationState.declared) return true;
    return hasSeatRiichiMarker(runtime, seatKey);
  }

  function hasPendingRiichiStick(runtime) {
    return Boolean(runtime && runtime.board && runtime.board._lizhi);
  }

  function countRuntimeKanMeldsBySeat(runtime, options = {}) {
    const seatKeys = getSeatKeys(options);
    const targetSeats = getActiveSeatKeys(runtime, seatKeys);
    const normalizeMeld = typeof options.normalizeMeld === 'function'
      ? options.normalizeMeld
      : (value) => String(value || '');

    return targetSeats.reduce((result, seatKey) => {
      const seatIndex = runtime && typeof runtime.getSeatIndex === 'function'
        ? runtime.getSeatIndex(seatKey)
        : -1;
      const shoupai = seatIndex >= 0 && runtime && runtime.board && Array.isArray(runtime.board.shoupai)
        ? runtime.board.shoupai[seatIndex]
        : null;
      const melds = shoupai && Array.isArray(shoupai._fulou) ? shoupai._fulou : [];
      result[seatKey] = melds.filter((meld) => {
        const normalized = normalizeMeld(meld);
        return Boolean(normalized && (String(normalized).match(/\d/g) || []).length === 4);
      }).length;
      return result;
    }, {});
  }

  function buildAbortiveDrawRevealedHands(runtime, seats = null, options = {}) {
    const seatKeys = getSeatKeys(options);
    const targetSeats = Array.isArray(seats) && seats.length ? seats.slice() : getActiveSeatKeys(runtime, seatKeys);
    const revealedHands = ['', '', '', ''];

    targetSeats.forEach((seatKey) => {
      const seatIndex = runtime && typeof runtime.getSeatIndex === 'function'
        ? runtime.getSeatIndex(seatKey)
        : -1;
      if (seatIndex < 0) return;
      const shoupai = runtime && runtime.board && Array.isArray(runtime.board.shoupai)
        ? runtime.board.shoupai[seatIndex]
        : null;
      if (shoupai && typeof shoupai.toString === 'function') {
        revealedHands[seatIndex] = shoupai.toString();
      }
    });

    return revealedHands;
  }

  function isFourRiichiAbortiveDraw(runtime, options = {}) {
    if (!runtime || !runtime.rule || runtime.rule['途中流局あり'] === false) return false;
    const seatKeys = getSeatKeys(options);
    const activeSeats = getActiveSeatKeys(runtime, seatKeys);
    return activeSeats.length === 4 && activeSeats.every((seatKey) => isSeatRiichiDeclared(runtime, seatKey));
  }

  function isFourWindAbortiveDraw(runtime, options = {}) {
    if (!runtime || !runtime.rule || runtime.rule['途中流局あり'] === false) return false;
    const seatKeys = getSeatKeys(options);
    const activeSeats = getActiveSeatKeys(runtime, seatKeys);
    if (activeSeats.length !== 4) return false;

    const kanCounts = countRuntimeKanMeldsBySeat(runtime, options);
    if (activeSeats.some((seatKey) => Number(kanCounts[seatKey] || 0) > 0)) return false;
    if (activeSeats.some((seatKey) => {
      const seatIndex = typeof runtime.getSeatIndex === 'function' ? runtime.getSeatIndex(seatKey) : -1;
      const shoupai = seatIndex >= 0 && runtime.board && Array.isArray(runtime.board.shoupai)
        ? runtime.board.shoupai[seatIndex]
        : null;
      return Boolean(shoupai && Array.isArray(shoupai._fulou) && shoupai._fulou.length);
    })) return false;

    const riverGroups = activeSeats.map((seatKey) => getSeatVisibleRiverTileCodes(runtime, seatKey));
    const totalVisibleDiscards = riverGroups.reduce((sum, group) => sum + group.length, 0);
    if (totalVisibleDiscards !== 4) return false;
    if (riverGroups.some((group) => group.length !== 1)) return false;

    const firstCode = riverGroups[0][0];
    return /^[z][1234]$/.test(firstCode) && riverGroups.every((group) => group[0] === firstCode);
  }

  function isFourKanAbortiveDraw(runtime, options = {}) {
    if (!runtime || !runtime.rule || runtime.rule['途中流局あり'] === false) return false;
    const seatKeys = getSeatKeys(options);
    const activeSeats = getActiveSeatKeys(runtime, seatKeys);
    const kanCounts = countRuntimeKanMeldsBySeat(runtime, options);
    const counts = activeSeats.map((seatKey) => Number(kanCounts[seatKey] || 0));
    const total = counts.reduce((sum, value) => sum + value, 0);
    return total === 4 && Math.max.apply(null, counts) < 4;
  }

  function getAbortiveDrawReason(runtime, options = {}) {
    if (isFourRiichiAbortiveDraw(runtime, options)) return '四家立直';
    if (isFourWindAbortiveDraw(runtime, options)) return '四風連打';
    if (isFourKanAbortiveDraw(runtime, options)) return '四開槓';
    return null;
  }

  function getAbortiveDrawRevealSeats(runtime, reason, options = {}) {
    if (reason === '四家立直') {
      return getActiveSeatKeys(runtime, getSeatKeys(options));
    }
    return null;
  }

  function projectDiscardReplyState(runtime, options = {}) {
    const seatKeys = getSeatKeys(options);
    const activeSeats = getActiveSeatKeys(runtime, seatKeys);
    const kanCounts = countRuntimeKanMeldsBySeat(runtime, options);
    const visibleRiverGroups = activeSeats.map((seatKey) => getSeatVisibleRiverTileCodes(runtime, seatKey));
    const totalVisibleDiscards = visibleRiverGroups.reduce((sum, group) => sum + group.length, 0);
    const riichiSeats = activeSeats.filter((seatKey) => isSeatRiichiDeclared(runtime, seatKey));
    const abortiveDrawReason = getAbortiveDrawReason(runtime, options);

    return {
      activeSeats,
      riichiSeats,
      riichiSeatCount: riichiSeats.length,
      pendingRiichiStick: hasPendingRiichiStick(runtime),
      abortiveDrawEnabled: Boolean(runtime && runtime.rule && runtime.rule['途中流局あり'] !== false),
      visibleRiverGroups,
      totalVisibleDiscards,
      kanCounts,
      totalKanCount: activeSeats.reduce((sum, seatKey) => sum + Number(kanCounts[seatKey] || 0), 0),
      maxKanCount: activeSeats.reduce((max, seatKey) => Math.max(max, Number(kanCounts[seatKey] || 0)), 0),
      abortiveDrawReason
    };
  }

  function projectDiscardReplyResolution(runtime, context = {}, options = {}) {
    const projection = projectDiscardReplyState(runtime, options);
    const selectedHuleSeats = Array.isArray(options.selectedHuleSeats)
      ? options.selectedHuleSeats.filter(Boolean)
      : [];
    const maxSimultaneousHule = Number(runtime && runtime.rule ? runtime.rule['最大同時和了数'] || 0 : 0);

    if (selectedHuleSeats.length >= 3 && maxSimultaneousHule === 2) {
      return {
        kind: 'draw',
        reason: '三家和',
        commitPendingRiichi: false,
        revealedHands: buildAbortiveDrawRevealedHands(runtime, selectedHuleSeats, options),
        projection
      };
    }

    if (projection.abortiveDrawReason) {
      const revealedSeats = getAbortiveDrawRevealSeats(runtime, projection.abortiveDrawReason, options);
      return {
        kind: 'draw',
        reason: projection.abortiveDrawReason,
        commitPendingRiichi: projection.pendingRiichiStick,
        revealedHands: revealedSeats
          ? buildAbortiveDrawRevealedHands(runtime, revealedSeats, options)
          : null,
        projection
      };
    }

    return {
      kind: 'continue',
      reason: null,
      commitPendingRiichi: projection.pendingRiichiStick,
      revealedHands: null,
      projection
    };
  }

  function createRuntimeRuleHelpers(options = {}) {
    const normalizedOptions = {
      seatKeys: getSeatKeys(options),
      normalizeMeld: typeof options.normalizeMeld === 'function' ? options.normalizeMeld : null
    };

    return {
      getRelativeSeatKey(baseSeatKey, direction) {
        return getRelativeSeatKey(baseSeatKey, direction, normalizedOptions);
      },
      extractBaojiaSummary(winnerSeat, result) {
        return extractBaojiaSummary(winnerSeat, result, normalizedOptions);
      },
      commitPendingRiichiStick,
      getSeatVisibleRiverTileCodes,
      countRuntimeKanMeldsBySeat(runtime) {
        return countRuntimeKanMeldsBySeat(runtime, normalizedOptions);
      },
      buildAbortiveDrawRevealedHands(runtime, seats = null) {
        return buildAbortiveDrawRevealedHands(runtime, seats, normalizedOptions);
      },
      isSeatRiichiDeclared(runtime, seatKey) {
        return isSeatRiichiDeclared(runtime, seatKey);
      },
      hasPendingRiichiStick(runtime) {
        return hasPendingRiichiStick(runtime);
      },
      projectDiscardReplyState(runtime) {
        return projectDiscardReplyState(runtime, normalizedOptions);
      },
      projectDiscardReplyResolution(runtime, context = {}, projectionOptions = {}) {
        return projectDiscardReplyResolution(runtime, context, {
          ...normalizedOptions,
          ...projectionOptions
        });
      },
      hasSeatRiichiMarker,
      isFourRiichiAbortiveDraw(runtime) {
        return isFourRiichiAbortiveDraw(runtime, normalizedOptions);
      },
      isFourWindAbortiveDraw(runtime) {
        return isFourWindAbortiveDraw(runtime, normalizedOptions);
      },
      isFourKanAbortiveDraw(runtime) {
        return isFourKanAbortiveDraw(runtime, normalizedOptions);
      },
      getAbortiveDrawReason(runtime) {
        return getAbortiveDrawReason(runtime, normalizedOptions);
      }
    };
  }

  createRuntimeRuleHelpers.DEFAULT_SEAT_KEYS = DEFAULT_SEAT_KEYS.slice();
  createRuntimeRuleHelpers.getRelativeSeatKey = getRelativeSeatKey;
  createRuntimeRuleHelpers.extractBaojiaSummary = extractBaojiaSummary;
  createRuntimeRuleHelpers.isSeatRiichiDeclared = isSeatRiichiDeclared;
  createRuntimeRuleHelpers.hasSeatRiichiMarker = hasSeatRiichiMarker;
  createRuntimeRuleHelpers.hasPendingRiichiStick = hasPendingRiichiStick;
  createRuntimeRuleHelpers.projectDiscardReplyState = projectDiscardReplyState;
  createRuntimeRuleHelpers.projectDiscardReplyResolution = projectDiscardReplyResolution;
  createRuntimeRuleHelpers.getAbortiveDrawReason = getAbortiveDrawReason;

  return createRuntimeRuleHelpers;
});
