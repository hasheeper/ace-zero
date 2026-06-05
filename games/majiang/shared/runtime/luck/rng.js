(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.AceMahjongLuckRng = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  function hashSeed(seed) {
    const text = String(seed == null ? 'ace-mahjong-luck' : seed);
    let hash = 2166136261 >>> 0;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    return hash >>> 0;
  }

  function createSeededRng(seed = 'ace-mahjong-luck') {
    let state = hashSeed(seed) || 0x6d2b79f5;
    return function rng() {
      state = (state + 0x6d2b79f5) >>> 0;
      let next = state;
      next = Math.imul(next ^ (next >>> 15), next | 1);
      next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
      return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
    };
  }

  function normalizeRng(rng = null, seed = null) {
    if (typeof rng === 'function') return rng;
    if (rng && typeof rng.next === 'function') {
      return () => rng.next();
    }
    return createSeededRng(seed);
  }

  return {
    hashSeed,
    createSeededRng,
    normalizeRng
  };
});
