(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./constants'), require('./schemas'));
    return;
  }
  root.AceMahjongLuckWindAdjustment = factory(
    root.AceMahjongLuckConstants,
    root.AceMahjongLuckSchemas
  );
})(typeof globalThis !== 'undefined' ? globalThis : this, function(constants, schemas) {
  'use strict';

  const { WIND_INTENSITY_DELTAS, WIND_MODES } = constants;
  const { clamp, normalizeIntent, normalizeWindState, numberOr } = schemas;

  function getContextPressure(context, objectiveIntent) {
    const source = context && typeof context === 'object' ? context : {};
    return clamp(numberOr(source.pressure, objectiveIntent.pressure), 0, 1);
  }

  function getCommitPermission(windState, objectiveIntent) {
    const routeConfidence = clamp(numberOr(windState.routeConfidence, 0), 0, 1);
    return routeConfidence;
  }

  function getWindPermission(mode, windState, objectiveIntent, context) {
    const pressure = getContextPressure(context, objectiveIntent);
    if (mode === WIND_MODES.SAFETY) return clamp(0.5 + pressure * 0.5, 0, 1);
    if (mode === WIND_MODES.COMMIT) return getCommitPermission(windState, objectiveIntent);
    if (mode === WIND_MODES.SPEED || mode === WIND_MODES.VALUE) {
      return clamp(1 - pressure * 0.75, 0, 1);
    }
    return 0;
  }

  function applyWindAdjustment(objectiveIntent, windState, context = {}) {
    const base = normalizeIntent(objectiveIntent || {});
    const wind = normalizeWindState(windState || (context && context.windState) || {});
    if (wind.mode === WIND_MODES.AUTO) return base;

    const delta = WIND_INTENSITY_DELTAS[wind.intensity] || WIND_INTENSITY_DELTAS.light;
    const permission = getWindPermission(wind.mode, wind, base, context);
    const adjusted = {
      ...base,
      [wind.mode]: Math.max(0, numberOr(base[wind.mode], 0) + delta * permission)
    };
    return normalizeIntent(adjusted);
  }

  return {
    applyWindAdjustment
  };
});
