(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./schemas'), require('./rng'));
    return;
  }
  root.AceMahjongLuckWeightedSampler = factory(
    root.AceMahjongLuckSchemas,
    root.AceMahjongLuckRng
  );
})(typeof globalThis !== 'undefined' ? globalThis : this, function(schemas, rngApi) {
  'use strict';

  const { clamp, normalizeCandidateDraw, numberOr } = schemas;
  const { normalizeRng } = rngApi;

  function getPositiveWeight(candidate) {
    const weight = numberOr(candidate.finalWeight, 0);
    return Number.isFinite(weight) && weight > 0 ? weight : 0;
  }

  function sampleWeightedDraw(weightedCandidates, rng) {
    const normalizedCandidates = Array.isArray(weightedCandidates)
      ? weightedCandidates.map(normalizeCandidateDraw)
      : [];
    const candidates = normalizedCandidates.filter((candidate) => getPositiveWeight(candidate) > 0);
    const totalWeight = candidates.reduce((sum, candidate) => sum + getPositiveWeight(candidate), 0);

    if (!candidates.length || !Number.isFinite(totalWeight) || totalWeight <= 0) {
      return {
        selectedTileCode: null,
        randomRoll: null,
        totalWeight: 0,
        selectedCandidate: null,
        fallback: { reason: 'no-positive-weight-candidates' }
      };
    }

    const rngFn = normalizeRng(rng);
    const randomRoll = clamp(numberOr(rngFn(), 0), 0, 0.999999999999);
    const threshold = randomRoll * totalWeight;
    let cursor = 0;
    let selectedCandidate = candidates[candidates.length - 1];

    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      cursor += getPositiveWeight(candidate);
      if (threshold < cursor) {
        selectedCandidate = candidate;
        break;
      }
    }

    return {
      selectedTileCode: selectedCandidate.tileCode,
      randomRoll,
      totalWeight,
      selectedCandidate,
      fallback: null
    };
  }

  return {
    sampleWeightedDraw
  };
});
