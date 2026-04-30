(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.AceMahjongDefaultAiProfile = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const DEFAULT_PROFILE = Object.freeze({
    id: 'default',
    speedWeight: 1,
    valueWeight: 1,
    safetyWeight: 1,
    riichiAggression: 1,
    meldAggression: 1,
    pushThreshold: 0,
    foldThreshold: 0,
    skillUsageBias: 0,
    antiSkillReserve: 0,
    randomness: 0
  });

  function createDefaultProfile() {
    return { ...DEFAULT_PROFILE };
  }

  return {
    DEFAULT_PROFILE,
    createDefaultProfile
  };
});
