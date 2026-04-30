(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.AceMahjongCreateCoreMatchRuleHelpers = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const DEFAULT_CORE_RULE = {
    '場数': 2,
    '途中流局あり': true,
    '流し満貫あり': true,
    'ノーテン宣言あり': false,
    'ノーテン罰あり': true,
    '最大同時和了数': 2,
    '連荘方式': 2,
    'トビ終了あり': true,
    'オーラス止めあり': true,
    '延長戦方式': 1
  };

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function createCoreRuleConfig(overrides = {}) {
    return {
      ...clone(DEFAULT_CORE_RULE),
      ...(overrides && typeof overrides === 'object' ? clone(overrides) : {})
    };
  }

  function getRoundsPerWind(options = {}) {
    const explicitRoundsPerWind = Number(options.roundsPerWind);
    if (Number.isInteger(explicitRoundsPerWind) && explicitRoundsPerWind > 0) {
      return explicitRoundsPerWind;
    }
    const explicitSeatCount = Number(options.seatCount);
    if (explicitSeatCount === 2 || explicitSeatCount === 3 || explicitSeatCount === 4) {
      return explicitSeatCount;
    }
    const seatKeys = Array.isArray(options.seatKeys) ? options.seatKeys.filter(Boolean) : [];
    if (seatKeys.length === 2 || seatKeys.length === 3 || seatKeys.length === 4) {
      return seatKeys.length;
    }
    return 4;
  }

  function getGameLength(ruleConfig = {}) {
    const field = Number(ruleConfig['場数']);
    if (field === 0) return 'single-round';
    if (field === 1) return 'east-only';
    if (field === 2) return 'east-south';
    if (field === 4) return 'full-wind';
    return 'custom';
  }

  function getInitialMaxJushu(ruleConfig = {}, options = {}) {
    const field = Number(ruleConfig['場数']);
    const roundsPerWind = getRoundsPerWind(options);
    return field === 0 ? 0 : field * roundsPerWind - 1;
  }

  function getSumJushu(zhuangfeng, jushu, options = {}) {
    const roundsPerWind = getRoundsPerWind(options);
    return Number(zhuangfeng || 0) * roundsPerWind + Number(jushu || 0);
  }

  function createCoreMatchRuleHelpers() {
    return {
      clone,
      createCoreRuleConfig,
      getRoundsPerWind,
      getGameLength,
      getInitialMaxJushu,
      getSumJushu
    };
  }

  createCoreMatchRuleHelpers.DEFAULT_CORE_RULE = clone(DEFAULT_CORE_RULE);
  createCoreMatchRuleHelpers.createCoreRuleConfig = createCoreRuleConfig;
  createCoreMatchRuleHelpers.getRoundsPerWind = getRoundsPerWind;
  createCoreMatchRuleHelpers.getGameLength = getGameLength;
  createCoreMatchRuleHelpers.getInitialMaxJushu = getInitialMaxJushu;

  return createCoreMatchRuleHelpers;
});
