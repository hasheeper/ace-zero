(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./schemas'));
    return;
  }
  root.AceMahjongLuckWeightModel = factory(root.AceMahjongLuckSchemas);
})(typeof globalThis !== 'undefined' ? globalThis : this, function(schemas) {
  'use strict';

  const {
    clamp,
    normalizeCandidateDraw,
    normalizeIntent,
    normalizeLocalValue,
    normalizePolicy,
    normalizeScore,
    numberOr
  } = schemas;

  function computeIntentScore(candidate, compositeIntent, policy) {
    const localValue = normalizeLocalValue(candidate.localValue);
    const intent = normalizeIntent(compositeIntent || {});
    const score = intent.speed * localValue.speed
      + intent.value * localValue.value
      + intent.safety * localValue.safety
      + intent.commit * localValue.commit
      + policy.shapeWeight * localValue.shape
      - policy.volatilityWeight * localValue.volatility;
    return normalizeScore(score, 0);
  }

  function clampWeight(rawWeight, baseWeight, policy) {
    if (!Number.isFinite(rawWeight) || rawWeight < 0) return 0;
    if (baseWeight <= 0) return 0;
    const minFactor = Math.max(0, numberOr(policy.minFactor, 0));
    const maxFactor = Math.max(minFactor, numberOr(policy.maxFactor, minFactor));
    return clamp(rawWeight, baseWeight * minFactor, baseWeight * maxFactor);
  }

  function getResolvedBias(resolvedForces = {}) {
    return {
      fortuneBias: Math.max(0, numberOr(resolvedForces.fortuneBias, 0)),
      curseBias: Math.max(0, numberOr(resolvedForces.curseBias, 0))
    };
  }

  function scoreCandidateDraws(candidates, compositeIntent, resolvedForces, policy) {
    const normalizedPolicy = normalizePolicy(policy || {});
    const forceBias = getResolvedBias(resolvedForces || {});
    const hasEffectiveForce = forceBias.fortuneBias > 0 || forceBias.curseBias > 0;
    const sourceCandidates = Array.isArray(candidates) ? candidates : [];

    return sourceCandidates.map((source) => {
      const candidate = normalizeCandidateDraw(source);
      const baseWeight = Math.max(0, numberOr(candidate.baseWeight, candidate.remainingCount));
      const intentScore = computeIntentScore(candidate, compositeIntent, normalizedPolicy);

      if (!hasEffectiveForce) {
        return normalizeCandidateDraw({
          ...candidate,
          intentScore,
          baseWeight,
          finalWeight: baseWeight
        });
      }

      const fortunePart = forceBias.fortuneBias * Math.max(0, intentScore);
      const cursePart = forceBias.curseBias * Math.max(0, -intentScore);
      const forceAdjustedScore = fortunePart + cursePart;
      const bias = Math.exp(normalizedPolicy.temperature * forceAdjustedScore);
      const finalWeight = clampWeight(baseWeight * bias, baseWeight, normalizedPolicy);

      return normalizeCandidateDraw({
        ...candidate,
        intentScore,
        baseWeight,
        finalWeight
      });
    });
  }

  return {
    computeIntentScore,
    scoreCandidateDraws
  };
});
