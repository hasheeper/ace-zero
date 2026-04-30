(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.AceMahjongNormalDifficultyPolicy = factory();
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

  const NORMAL_POLICY = deepFreeze({
    id: 'normal',
    enableDefense: true,
    enableAdvancedCallReview: true,
    searchDepth: 0,
    rolloutCount: 0,
    randomness: 0.08,
    riichi: {
      minTingpaiCount: 2,
      minRemainingTiles: 15,
      minHandValueEstimate: 4,
      requireLegalChoice: true,
      allowBadWait: false
    },
    call: {
      allowYakuhaiPeng: true,
      allowShantenImprovement: true,
      allowFlatSpeedUp: true,
      flatUkeireBoost: 5,
      flatTingpaiBoost: 1,
      flatHandShapeBoost: 3,
      suppressFlatCallsUnderRiichi: true
    },
    defense: {
      enableTileDanger: true,
      usePushFoldState: true,
      preferSafetyOnlyUnderPressure: false
    },
    humanStyle: {
      preferVisibleProgress: true,
      preferYakuhai: true,
      avoidOverthinking: false
    }
  });

  function createNormalPolicy() {
    return clone(NORMAL_POLICY);
  }

  return {
    NORMAL_POLICY,
    createNormalPolicy
  };
});
