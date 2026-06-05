(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.AceMahjongAiVisibleTiles = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const TILE_TYPES = Object.freeze([
    'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9',
    'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9',
    's1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9',
    'z1', 'z2', 'z3', 'z4', 'z5', 'z6', 'z7'
  ]);

  const SUITS = Object.freeze(['m', 'p', 's', 'z']);

  function normalizeTileCode(tileCode) {
    if (typeof tileCode !== 'string' || tileCode.length < 2) return null;
    const stripped = String(tileCode).replace(/[\*_\+\=\-\^]+$/g, '');
    if (stripped === '_' || stripped.length < 2) return null;

    const suit = stripped[0];
    const rankText = stripped[1] === '0' ? '5' : stripped[1];
    const rank = Number(rankText);
    if (!SUITS.includes(suit) || !Number.isInteger(rank)) return null;
    if (suit === 'z' && (rank < 1 || rank > 7)) return null;
    if (suit !== 'z' && (rank < 1 || rank > 9)) return null;
    return `${suit}${rank}`;
  }

  function createCountMap(initialValue = 0) {
    return TILE_TYPES.reduce((counts, tileCode) => {
      counts[tileCode] = initialValue;
      return counts;
    }, Object.create(null));
  }

  function freezeCountMap(counts) {
    return Object.freeze(TILE_TYPES.reduce((copy, tileCode) => {
      copy[tileCode] = Number(counts && counts[tileCode]) || 0;
      return copy;
    }, Object.create(null)));
  }

  function createSourceCounts() {
    return {
      hand: createCountMap(),
      river: createCountMap(),
      meld: createCountMap(),
      dora: createCountMap()
    };
  }

  function freezeSourceCounts(sourceCounts) {
    return Object.freeze({
      hand: freezeCountMap(sourceCounts.hand),
      river: freezeCountMap(sourceCounts.river),
      meld: freezeCountMap(sourceCounts.meld),
      dora: freezeCountMap(sourceCounts.dora)
    });
  }

  function incrementSource(sourceCounts, knownCounts, source, tileCode) {
    const normalizedTileCode = normalizeTileCode(tileCode);
    if (!normalizedTileCode || !sourceCounts[source]) return;
    sourceCounts[source][normalizedTileCode] = Math.min(4, (sourceCounts[source][normalizedTileCode] || 0) + 1);
    knownCounts[normalizedTileCode] = Math.min(4, (knownCounts[normalizedTileCode] || 0) + 1);
  }

  function getActiveSeats(runtime) {
    if (runtime && runtime.topology && Array.isArray(runtime.topology.activeSeats) && runtime.topology.activeSeats.length) {
      return runtime.topology.activeSeats.slice();
    }
    if (runtime && Array.isArray(runtime.activeSeats) && runtime.activeSeats.length) {
      return runtime.activeSeats.slice();
    }
    return ['bottom', 'right', 'top', 'left'];
  }

  function parseHandTileCodes(paistr = '') {
    const handCodes = [];
    const bingpai = String(paistr || '').split(',')[0] || '';
    let suit = null;

    for (const char of bingpai.replace(/\*/g, '')) {
      if (/[mpsz]/.test(char)) {
        suit = char;
        continue;
      }
      if (/\d/.test(char) && suit) {
        handCodes.push(`${suit}${char}`);
      }
    }

    return handCodes;
  }

  function getOwnHandCodes(runtime, seatKey) {
    if (runtime && typeof runtime.getSeatHandCodes === 'function') {
      const handCodes = runtime.getSeatHandCodes(seatKey);
      if (Array.isArray(handCodes)) return handCodes.slice();
    }

    const seatIndex = runtime && typeof runtime.getSeatIndex === 'function'
      ? runtime.getSeatIndex(seatKey)
      : -1;
    const shoupai = seatIndex >= 0 && runtime && runtime.board && Array.isArray(runtime.board.shoupai)
      ? runtime.board.shoupai[seatIndex]
      : null;
    return shoupai && typeof shoupai.toString === 'function'
      ? parseHandTileCodes(shoupai.toString())
      : [];
  }

  function getSeatRiverCodes(runtime, seatKey) {
    if (!runtime || typeof runtime.getSeatIndex !== 'function') return [];
    const seatIndex = runtime.getSeatIndex(seatKey);
    if (seatIndex < 0 || !runtime.board || !runtime.board.he || !Array.isArray(runtime.board.he)) return [];
    const river = runtime.board.he[seatIndex];
    return river && Array.isArray(river._pai)
      ? river._pai.slice()
      : [];
  }

  function getSeatMeldStrings(runtime, seatKey) {
    if (!runtime || typeof runtime.getSeatIndex !== 'function') return [];
    const seatIndex = runtime.getSeatIndex(seatKey);
    const shoupai = seatIndex >= 0 && runtime.board && Array.isArray(runtime.board.shoupai)
      ? runtime.board.shoupai[seatIndex]
      : null;
    return shoupai && Array.isArray(shoupai._fulou) ? shoupai._fulou.slice() : [];
  }

  function parseMeldTileCodes(meldString) {
    if (typeof meldString !== 'string' || meldString.length < 2) return [];
    const suit = meldString[0];
    if (!SUITS.includes(suit)) return [];
    return (meldString.match(/\d/g) || [])
      .map((rank) => normalizeTileCode(`${suit}${rank}`))
      .filter(Boolean);
  }

  function getDoraIndicatorCodes(runtime) {
    const wallState = runtime && typeof runtime.getWallState === 'function'
      ? runtime.getWallState()
      : null;
    if (wallState && Array.isArray(wallState.doraIndicators)) {
      return wallState.doraIndicators.filter(Boolean);
    }
    if (wallState && Array.isArray(wallState.baopai)) {
      return wallState.baopai.filter(Boolean);
    }
    return runtime && runtime.board && runtime.board.shan && Array.isArray(runtime.board.shan.baopai)
      ? runtime.board.shan.baopai.filter(Boolean)
      : [];
  }

  function buildRuntimeVisibleTiles(runtime, seatKey) {
    const sourceCounts = createSourceCounts();
    const knownCounts = createCountMap();

    getOwnHandCodes(runtime, seatKey).forEach((tileCode) => {
      incrementSource(sourceCounts, knownCounts, 'hand', tileCode);
    });

    getActiveSeats(runtime).forEach((activeSeatKey) => {
      getSeatRiverCodes(runtime, activeSeatKey).forEach((tileCode) => {
        if (/[\+\=\-]$/.test(String(tileCode || ''))) return;
        incrementSource(sourceCounts, knownCounts, 'river', tileCode);
      });
      getSeatMeldStrings(runtime, activeSeatKey).forEach((meldString) => {
        parseMeldTileCodes(meldString).forEach((tileCode) => {
          incrementSource(sourceCounts, knownCounts, 'meld', tileCode);
        });
      });
    });

    getDoraIndicatorCodes(runtime).forEach((tileCode) => {
      incrementSource(sourceCounts, knownCounts, 'dora', tileCode);
    });

    const remainingCounts = createCountMap();
    TILE_TYPES.forEach((tileCode) => {
      remainingCounts[tileCode] = Math.max(0, 4 - (knownCounts[tileCode] || 0));
    });

    const frozenKnownCounts = freezeCountMap(knownCounts);
    const frozenRemainingCounts = freezeCountMap(remainingCounts);

    return Object.freeze({
      knownCounts: frozenKnownCounts,
      remainingCounts: frozenRemainingCounts,
      sourceCounts: freezeSourceCounts(sourceCounts),
      countKnown(tileCode) {
        const normalizedTileCode = normalizeTileCode(tileCode);
        return normalizedTileCode ? Number(frozenKnownCounts[normalizedTileCode] || 0) : 0;
      },
      countRemaining(tileCode) {
        const normalizedTileCode = normalizeTileCode(tileCode);
        return normalizedTileCode ? Number(frozenRemainingCounts[normalizedTileCode] || 0) : 0;
      }
    });
  }

  return {
    TILE_TYPES,
    normalizeTileCode,
    parseMeldTileCodes,
    buildRuntimeVisibleTiles
  };
});
