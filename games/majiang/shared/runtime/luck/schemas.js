(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./constants'));
    return;
  }
  root.AceMahjongLuckSchemas = factory(root.AceMahjongLuckConstants);
})(typeof globalThis !== 'undefined' ? globalThis : this, function(constants) {
  'use strict';

  const {
    DEFAULT_INTENT,
    DEFAULT_LOCAL_VALUE,
    DEFAULT_WEIGHT_POLICY,
    DRAW_KINDS,
    FORCE_KINDS,
    LUCK_MODEL_VERSION,
    SCORE_LIMITS,
    WIND_INTENSITIES,
    WIND_MODES
  } = constants;

  /**
   * @typedef {Object} LuckContext
   * @property {string|null} seat
   * @property {string} drawKind
   * @property {Object|null} wallState
   * @property {Object} windState
   * @property {Object} objectiveIntent
   * @property {Array<Object>} activeForces
   * @property {Object} policy
   * @property {string|number|null} seed
   */

  /**
   * @typedef {Object} CandidateDraw
   * @property {string} tileCode
   * @property {number} remainingCount
   * @property {Object} localValue
   * @property {number} intentScore
   * @property {number} baseWeight
   * @property {number} finalWeight
   * @property {Array<string>} tags
   */

  /**
   * @typedef {Object} LuckForce
   * @property {string} id
   * @property {string} kind
   * @property {number} tier
   * @property {number} timing
   * @property {number} scope
   * @property {number} power
   * @property {number} precision
   * @property {number} cost
   * @property {string|null} sourceSeat
   * @property {string|null} targetSeat
   * @property {Array<string>} tags
   * @property {Object} metadata
   */

  /**
   * @typedef {Object} LuckAudit
   * @property {string} version
   * @property {string|null} seat
   * @property {string} drawKind
   * @property {string|number|null} seed
   * @property {Object} objectiveIntent
   * @property {Object} windState
   * @property {Object} compositeIntent
   * @property {Array<LuckForce>} activeForces
   * @property {Object|null} resolvedForces
   * @property {Array<CandidateDraw>} candidates
   * @property {string|null} selectedTileCode
   * @property {number|null} randomRoll
   * @property {Object|null} fallback
   */

  function numberOr(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, min, max) {
    const number = numberOr(value, min);
    return Math.max(min, Math.min(max, number));
  }

  function normalizeScore(value, fallback = 0) {
    return clamp(numberOr(value, fallback), SCORE_LIMITS.min, SCORE_LIMITS.max);
  }

  function normalizeCoreIntent(source = {}) {
    const speed = Math.max(0, numberOr(source.speed, DEFAULT_INTENT.speed));
    const value = Math.max(0, numberOr(source.value, DEFAULT_INTENT.value));
    const safety = Math.max(0, numberOr(source.safety, DEFAULT_INTENT.safety));
    const commit = Math.max(0, numberOr(source.commit, DEFAULT_INTENT.commit));
    const total = speed + value + safety + commit;
    if (total <= 0) {
      return {
        speed: DEFAULT_INTENT.speed,
        value: DEFAULT_INTENT.value,
        safety: DEFAULT_INTENT.safety,
        commit: DEFAULT_INTENT.commit
      };
    }
    return {
      speed: speed / total,
      value: value / total,
      safety: safety / total,
      commit: commit / total
    };
  }

  function normalizeIntent(source = {}) {
    const core = normalizeCoreIntent(source);
    return {
      ...core,
      pressure: clamp(numberOr(source.pressure, DEFAULT_INTENT.pressure), 0, 1),
      confidence: clamp(numberOr(source.confidence, DEFAULT_INTENT.confidence), 0, 1)
    };
  }

  function normalizeLocalValue(source = {}) {
    const value = source && typeof source === 'object' ? source : {};
    return {
      speed: normalizeScore(value.speed, DEFAULT_LOCAL_VALUE.speed),
      value: normalizeScore(value.value, DEFAULT_LOCAL_VALUE.value),
      shape: normalizeScore(value.shape, DEFAULT_LOCAL_VALUE.shape),
      safety: normalizeScore(value.safety, DEFAULT_LOCAL_VALUE.safety),
      commit: normalizeScore(value.commit, DEFAULT_LOCAL_VALUE.commit),
      volatility: clamp(numberOr(value.volatility, DEFAULT_LOCAL_VALUE.volatility), 0, 1)
    };
  }

  function normalizeWindState(source = {}) {
    const wind = source && typeof source === 'object' ? source : {};
    const mode = Object.values(WIND_MODES).includes(wind.mode) ? wind.mode : WIND_MODES.AUTO;
    const intensity = Object.values(WIND_INTENSITIES).includes(wind.intensity)
      ? wind.intensity
      : WIND_INTENSITIES.LIGHT;
    return {
      mode,
      intensity,
      commitRouteId: wind.commitRouteId || null,
      routeConfidence: clamp(numberOr(wind.routeConfidence, wind.confidence), 0, 1)
    };
  }

  function normalizePolicy(source = {}) {
    const policy = source && typeof source === 'object' ? source : {};
    return {
      temperature: Math.max(0, numberOr(policy.temperature, DEFAULT_WEIGHT_POLICY.temperature)),
      minFactor: Math.max(0, numberOr(policy.minFactor, DEFAULT_WEIGHT_POLICY.minFactor)),
      maxFactor: Math.max(0, numberOr(policy.maxFactor, DEFAULT_WEIGHT_POLICY.maxFactor)),
      shapeWeight: Math.max(0, numberOr(policy.shapeWeight, DEFAULT_WEIGHT_POLICY.shapeWeight)),
      volatilityWeight: Math.max(0, numberOr(policy.volatilityWeight, DEFAULT_WEIGHT_POLICY.volatilityWeight)),
      forcePowerScale: Math.max(1, numberOr(policy.forcePowerScale, DEFAULT_WEIGHT_POLICY.forcePowerScale)),
      maxVoidDamping: clamp(numberOr(policy.maxVoidDamping, DEFAULT_WEIGHT_POLICY.maxVoidDamping), 0, 1),
      forceStackSecondFactor: clamp(
        numberOr(policy.forceStackSecondFactor, DEFAULT_WEIGHT_POLICY.forceStackSecondFactor),
        0,
        1
      ),
      forceStackThirdFactor: clamp(
        numberOr(policy.forceStackThirdFactor, DEFAULT_WEIGHT_POLICY.forceStackThirdFactor),
        0,
        1
      ),
      forceStackRestFactor: clamp(
        numberOr(policy.forceStackRestFactor, DEFAULT_WEIGHT_POLICY.forceStackRestFactor),
        0,
        1
      ),
      fortuneMitigationAgainstCurse: clamp(
        numberOr(policy.fortuneMitigationAgainstCurse, DEFAULT_WEIGHT_POLICY.fortuneMitigationAgainstCurse),
        0,
        1
      ),
      cursePressureAgainstFortune: Math.max(
        0,
        numberOr(policy.cursePressureAgainstFortune, DEFAULT_WEIGHT_POLICY.cursePressureAgainstFortune)
      ),
      tierCounterStep: Math.max(0, numberOr(policy.tierCounterStep, DEFAULT_WEIGHT_POLICY.tierCounterStep)),
      tierPressureStep: Math.max(0, numberOr(policy.tierPressureStep, DEFAULT_WEIGHT_POLICY.tierPressureStep))
    };
  }

  function normalizeLuckForce(source = {}) {
    const force = source && typeof source === 'object' ? source : {};
    const kind = Object.values(FORCE_KINDS).includes(force.kind)
      ? force.kind
      : Object.values(FORCE_KINDS).includes(force.type)
        ? force.type
        : FORCE_KINDS.FORTUNE;
    return {
      id: force.id || `force:${kind}`,
      kind,
      type: kind,
      tier: Math.max(0, numberOr(force.tier, 1)),
      timing: Math.max(0, numberOr(force.timing, 0)),
      scope: Math.max(0, numberOr(force.scope, 1)),
      power: Math.max(0, numberOr(force.power, 0)),
      precision: Math.max(0, numberOr(force.precision, 0)),
      cost: Math.max(0, numberOr(force.cost, 0)),
      sourceSeat: force.sourceSeat || null,
      targetSeat: force.targetSeat || null,
      tags: Array.isArray(force.tags) ? force.tags.slice() : [],
      metadata: force.metadata && typeof force.metadata === 'object' ? { ...force.metadata } : {}
    };
  }

  function normalizeCandidateDraw(source = {}) {
    const candidate = source && typeof source === 'object' ? source : {};
    const remainingCount = Math.max(0, Math.floor(numberOr(candidate.remainingCount, 0)));
    const baseWeight = Math.max(0, numberOr(candidate.baseWeight, remainingCount));
    return {
      tileCode: String(candidate.tileCode || ''),
      remainingCount,
      localValue: normalizeLocalValue(candidate.localValue),
      intentScore: normalizeScore(candidate.intentScore, 0),
      baseWeight,
      finalWeight: Math.max(0, numberOr(candidate.finalWeight, baseWeight)),
      tags: Array.isArray(candidate.tags) ? candidate.tags.slice() : []
    };
  }

  function normalizeLuckContext(source = {}) {
    const context = source && typeof source === 'object' ? source : {};
    const drawKind = Object.values(DRAW_KINDS).includes(context.drawKind)
      ? context.drawKind
      : DRAW_KINDS.NORMAL;
    return {
      seat: context.seat || null,
      drawKind,
      wallState: context.wallState && typeof context.wallState === 'object' ? context.wallState : null,
      windState: normalizeWindState(context.windState),
      objectiveIntent: normalizeIntent(context.objectiveIntent || {}),
      activeForces: Array.isArray(context.activeForces) ? context.activeForces.map(normalizeLuckForce) : [],
      policy: normalizePolicy(context.policy || {}),
      seed: context.seed == null ? null : context.seed
    };
  }

  function normalizeLuckAudit(source = {}) {
    const audit = source && typeof source === 'object' ? source : {};
    const context = normalizeLuckContext(audit);
    return {
      version: audit.version || LUCK_MODEL_VERSION,
      seat: context.seat,
      drawKind: context.drawKind,
      seed: audit.seed == null ? context.seed : audit.seed,
      objectiveIntent: normalizeIntent(audit.objectiveIntent || context.objectiveIntent || {}),
      windState: normalizeWindState(audit.windState || context.windState || {}),
      compositeIntent: normalizeIntent(audit.compositeIntent || audit.objectiveIntent || {}),
      activeForces: Array.isArray(audit.activeForces) ? audit.activeForces.map(normalizeLuckForce) : [],
      resolvedForces: audit.resolvedForces && typeof audit.resolvedForces === 'object' ? { ...audit.resolvedForces } : null,
      candidates: Array.isArray(audit.candidates) ? audit.candidates.map(normalizeCandidateDraw) : [],
      selectedTileCode: audit.selectedTileCode || null,
      randomRoll: audit.randomRoll == null ? null : numberOr(audit.randomRoll, null),
      fallback: audit.fallback && typeof audit.fallback === 'object' ? { ...audit.fallback } : null
    };
  }

  return {
    numberOr,
    clamp,
    normalizeScore,
    normalizeCoreIntent,
    normalizeIntent,
    normalizeLocalValue,
    normalizeWindState,
    normalizePolicy,
    normalizeLuckForce,
    normalizeCandidateDraw,
    normalizeLuckContext,
    normalizeLuckAudit
  };
});
