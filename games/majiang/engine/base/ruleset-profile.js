(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }

  root.AceMahjongRulesetProfile = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const DEFAULT_RULESET_ID = 'riichi-4p';

  const RULESET_PROFILES = Object.freeze({
    'riichi-2p-pinzu-honor': Object.freeze({
      id: 'riichi-2p-pinzu-honor',
      seatCount: 2,
      tableSize: 2,
      tileSet: 'riichi-2p-pinzu-honor-only',
      tsumoPaymentModel: 'heads-up-2p',
      tsumoHonbaPerPayer: 100,
      handSize: 13,
      deadWallSize: 14,
      enableChi: true,
      enablePeng: true,
      enableGang: true,
      enableRiichi: true,
      startingScore: 25000,
      targetScore: 30000,
      tableLayout: '2p-opposed',
      uiMode: 'heads-up'
    }),
    'riichi-4p': Object.freeze({
      id: 'riichi-4p',
      seatCount: 4,
      tableSize: 4,
      tileSet: 'riichi-4p-standard',
      tsumoPaymentModel: 'standard-4p',
      tsumoHonbaPerPayer: 100,
      handSize: 13,
      deadWallSize: 14,
      enableChi: true,
      enablePeng: true,
      enableGang: true,
      enableRiichi: true,
      startingScore: 25000,
      targetScore: 30000,
      tableLayout: '4p-octagon',
      uiMode: 'standard'
    }),
    'riichi-3p-sanma': Object.freeze({
      id: 'riichi-3p-sanma',
      seatCount: 3,
      tableSize: 3,
      tileSet: 'riichi-3p-sanma-2to8m-removed',
      tsumoPaymentModel: 'tsumo-loss-3p',
      tsumoHonbaPerPayer: 100,
      handSize: 13,
      deadWallSize: 14,
      enableChi: false,
      enablePeng: true,
      enableGang: true,
      enableRiichi: true,
      startingScore: 35000,
      targetScore: 40000,
      tableLayout: '3p-rounded-triangle',
      uiMode: 'sanma'
    })
  });

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function getAkaDoraEligibleSuits(input = {}) {
    const profile = input && typeof input === 'object' && typeof input.tileSet === 'string'
      ? input
      : getRulesetProfile(input);
    if (!profile || typeof profile.tileSet !== 'string') {
      return ['m', 'p', 's'];
    }
    if (profile.tileSet === 'riichi-2p-pinzu-honor-only') return ['p'];
    if (profile.tileSet === 'riichi-3p-sanma-2to8m-removed') return ['p', 's'];
    return ['m', 'p', 's'];
  }

  function buildAkaDoraDistribution(count, eligibleSuits = []) {
    const distribution = { m: 0, p: 0, s: 0 };
    if (!Number.isInteger(count) || count <= 0 || !Array.isArray(eligibleSuits) || !eligibleSuits.length) {
      return distribution;
    }
    let remaining = count;
    while (remaining > 0) {
      let progressed = false;
      eligibleSuits.forEach((suit) => {
        if (remaining <= 0) return;
        if (!Object.prototype.hasOwnProperty.call(distribution, suit)) return;
        if (distribution[suit] >= 4) return;
        distribution[suit] += 1;
        remaining -= 1;
        progressed = true;
      });
      if (!progressed) break;
    }
    return distribution;
  }

  function normalizeFriendlyRuleConfig(config = {}, rulesetProfileInput = null) {
    const profile = rulesetProfileInput && typeof rulesetProfileInput === 'object'
      ? { ...rulesetProfileInput }
      : getRulesetProfile({
          id: config && config.ruleset,
          tableSize: config && config.tableSize
        });
    const baseRuleOverrides = config && config.ruleOverrides && typeof config.ruleOverrides === 'object'
      ? clone(config.ruleOverrides)
      : {};
    const rules = config && config.rules && typeof config.rules === 'object'
      ? config.rules
      : {};
    const normalized = {
      ruleOverrides: baseRuleOverrides,
      customRuleConfig: {
        shibariMinYakuHan: 1
      }
    };

    if (typeof rules.bankruptcyEndsGame === 'boolean') {
      normalized.ruleOverrides['トビ終了あり'] = rules.bankruptcyEndsGame;
    }

    if (rules.akaDora && typeof rules.akaDora === 'object') {
      const enabled = typeof rules.akaDora.enabled === 'boolean'
        ? rules.akaDora.enabled
        : Number.isFinite(Number(rules.akaDora.count));
      if (enabled === false) {
        normalized.ruleOverrides['赤牌'] = { m: 0, p: 0, s: 0 };
      } else {
        const eligibleSuits = getAkaDoraEligibleSuits(profile);
        const minCount = eligibleSuits.length;
        const maxCount = eligibleSuits.length * 4;
        const configuredCount = Number.isFinite(Number(rules.akaDora.count))
          ? Number(rules.akaDora.count)
          : minCount;
        if (!Number.isInteger(configuredCount) || configuredCount < minCount || configuredCount > maxCount) {
          throw new RangeError(`akaDora.count must be an integer between ${minCount} and ${maxCount} for ${profile.id}.`);
        }
        normalized.ruleOverrides['赤牌'] = buildAkaDoraDistribution(configuredCount, eligibleSuits);
      }
    }

    if (rules.shibari && typeof rules.shibari === 'object' && rules.shibari.minYakuHan != null) {
      const minYakuHan = Number(rules.shibari.minYakuHan);
      if (![1, 2, 4].includes(minYakuHan)) {
        throw new RangeError('shibari.minYakuHan must be one of: 1, 2, 4.');
      }
      normalized.customRuleConfig.shibariMinYakuHan = minYakuHan;
    }

    return normalized;
  }

  function normalizeRulesetInput(input = {}) {
    if (typeof input === 'string') {
      return { id: input };
    }
    if (!input || typeof input !== 'object') {
      return {};
    }
    return { ...input };
  }

  function resolveRulesetId(input = {}) {
    const normalized = normalizeRulesetInput(input);
    if (typeof normalized.id === 'string' && normalized.id) {
      return normalized.id;
    }

    const tableSize = Number(normalized.tableSize || normalized.seatCount);
    if (tableSize === 2) return 'riichi-2p-pinzu-honor';
    if (tableSize === 3) return 'riichi-3p-sanma';
    if (tableSize === 4) return 'riichi-4p';
    return DEFAULT_RULESET_ID;
  }

  function getRulesetProfile(input = {}) {
    const normalized = normalizeRulesetInput(input);
    const rulesetId = resolveRulesetId(normalized);
    const baseProfile = RULESET_PROFILES[rulesetId] || RULESET_PROFILES[DEFAULT_RULESET_ID];

    return {
      ...clone(baseProfile),
      ...normalized,
      id: rulesetId,
      seatCount: Number(normalized.seatCount || normalized.tableSize || baseProfile.seatCount) || baseProfile.seatCount,
      tableSize: Number(normalized.tableSize || normalized.seatCount || baseProfile.tableSize) || baseProfile.tableSize
    };
  }

  function listRulesetProfiles() {
    return Object.keys(RULESET_PROFILES).map((key) => clone(RULESET_PROFILES[key]));
  }

  return {
    DEFAULT_RULESET_ID,
    RULESET_PROFILES,
    getAkaDoraEligibleSuits,
    normalizeFriendlyRuleConfig,
    resolveRulesetId,
    getRulesetProfile,
    listRulesetProfiles
  };
});
