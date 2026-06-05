(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./constants'),
      require('./schemas')
    );
    return;
  }
  root.AceMahjongLuckAudit = factory(
    root.AceMahjongLuckConstants,
    root.AceMahjongLuckSchemas
  );
})(typeof globalThis !== 'undefined' ? globalThis : this, function(constants, schemas) {
  'use strict';

  const { LUCK_MODEL_VERSION } = constants;
  const {
    normalizeCandidateDraw,
    normalizeIntent,
    normalizeLuckContext,
    normalizeLuckForce,
    normalizeWindState,
    numberOr
  } = schemas;

  function pickFirst(...values) {
    for (let index = 0; index < values.length; index += 1) {
      if (values[index] !== undefined && values[index] !== null) return values[index];
    }
    return null;
  }

  function validateLuckReplayInput(input = {}) {
    const errors = [];
    if (!input || typeof input !== 'object') errors.push('input must be an object');
    if (!Array.isArray(input.candidates)) errors.push('candidates must be an array');
    if (input.seed === undefined || input.seed === null) errors.push('seed is required for deterministic replay');
    return {
      ok: errors.length === 0,
      errors
    };
  }

  function clonePlainObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? JSON.parse(JSON.stringify(value))
      : null;
  }

  function createLuckAudit(input = {}, result = {}) {
    const context = normalizeLuckContext(input.context || input);
    const candidates = Array.isArray(input.candidates)
      ? input.candidates
      : Array.isArray(result.candidates)
        ? result.candidates
        : Array.isArray(result.weightedCandidates)
          ? result.weightedCandidates
          : [];
    const selectedTileCode = pickFirst(result.selectedTileCode, input.selectedTileCode);
    const randomRoll = pickFirst(result.randomRoll, input.randomRoll);
    const activeForces = Array.isArray(input.activeForces)
      ? input.activeForces
      : Array.isArray(context.activeForces)
        ? context.activeForces
        : [];

    return {
      version: LUCK_MODEL_VERSION,
      seat: context.seat,
      drawKind: context.drawKind,
      seed: pickFirst(input.seed, context.seed),
      objectiveIntent: normalizeIntent(input.objectiveIntent || context.objectiveIntent || {}),
      windState: normalizeWindState(input.windState || context.windState || {}),
      compositeIntent: normalizeIntent(input.compositeIntent || result.compositeIntent || input.objectiveIntent || {}),
      activeForces: activeForces.map(normalizeLuckForce),
      resolvedForces: clonePlainObject(input.resolvedForces || result.resolvedForces || null),
      candidates: candidates.map(normalizeCandidateDraw),
      selectedTileCode,
      randomRoll: randomRoll === null ? null : numberOr(randomRoll, null),
      fallback: result.fallback || input.fallback || null
    };
  }

  return {
    createLuckAudit,
    validateLuckReplayInput
  };
});
