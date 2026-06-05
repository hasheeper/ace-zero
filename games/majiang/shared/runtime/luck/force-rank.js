(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./schemas'));
    return;
  }
  root.AceMahjongLuckForceRank = factory(root.AceMahjongLuckSchemas);
})(typeof globalThis !== 'undefined' ? globalThis : this, function(schemas) {
  'use strict';

  const { numberOr, normalizeLuckForce } = schemas;

  const NUMERIC_COMPARE_FIELDS = Object.freeze([
    'tier',
    'timing',
    'counterRelation',
    'power',
    'scope',
    'precisionPenalty',
    'cost'
  ]);

  function buildForceCompareKey(force = {}) {
    const normalized = normalizeLuckForce(force);
    const metadata = normalized.metadata || {};
    return {
      tier: normalized.tier,
      timing: normalized.timing,
      counterRelation: numberOr(metadata.counterRelation, 0),
      power: normalized.power,
      scope: normalized.scope,
      precisionPenalty: -normalized.precision,
      cost: normalized.cost,
      id: String(normalized.id || '')
    };
  }

  function compareForceRank(left, right) {
    const leftKey = left && left.tier != null ? left : buildForceCompareKey(left);
    const rightKey = right && right.tier != null ? right : buildForceCompareKey(right);

    for (let index = 0; index < NUMERIC_COMPARE_FIELDS.length; index += 1) {
      const field = NUMERIC_COMPARE_FIELDS[index];
      const leftValue = numberOr(leftKey[field], 0);
      const rightValue = numberOr(rightKey[field], 0);
      if (leftValue > rightValue) return 1;
      if (leftValue < rightValue) return -1;
    }

    const leftId = String(leftKey.id || '');
    const rightId = String(rightKey.id || '');
    if (leftId < rightId) return 1;
    if (leftId > rightId) return -1;
    return 0;
  }

  return {
    buildForceCompareKey,
    compareForceRank
  };
});
