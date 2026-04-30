(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.AceMahjongEasyDifficultyPolicy = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  function deepFreeze(value) {
    if (!value || typeof value !== 'object') return value;
    Object.getOwnPropertyNames(value).forEach((key) => {
      deepFreeze(value[key]);
    });
    return Object.freeze(value);
  }

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  const EASY_POLICY = deepFreeze({
    id: 'easy',
    enableDefense: false,
    enableAdvancedCallReview: false,
    searchDepth: 0,
    rolloutCount: 0,
    randomness: 0.18,
    riichi: {
      minTingpaiCount: 2,
      minRemainingTiles: 18,
      minHandValueEstimate: 0,
      requireLegalChoice: true,
      allowBadWait: false
    },
    call: {
      allowYakuhaiPeng: true,
      allowShantenImprovement: true,
      allowFlatSpeedUp: true,
      flatUkeireBoost: 8,
      flatTingpaiBoost: 2,
      flatHandShapeBoost: 4,
      suppressFlatCallsUnderRiichi: true
    },
    defense: {
      enableTileDanger: true,
      usePushFoldState: true,
      preferSafetyOnlyUnderPressure: true
    },
    humanStyle: {
      preferVisibleProgress: true,
      preferYakuhai: true,
      avoidOverthinking: true
    }
  });

  function createEasyPolicy() {
    return clone(EASY_POLICY);
  }

  return {
    EASY_POLICY,
    createEasyPolicy
  };
});
