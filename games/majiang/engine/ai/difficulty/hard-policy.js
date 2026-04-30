(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.AceMahjongHardDifficultyPolicy = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const HARD_POLICY = Object.freeze({
    id: 'hard',
    enableDefense: true,
    enableAdvancedCallReview: true,
    searchDepth: 1,
    rolloutCount: 0,
    randomness: 0.02
  });

  function createHardPolicy() {
    return { ...HARD_POLICY };
  }

  return {
    HARD_POLICY,
    createHardPolicy
  };
});
