(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.AceMahjongLuckConstants = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const LUCK_MODEL_VERSION = 'luck-runtime-core-v0.1';

  const WIND_MODES = Object.freeze({
    AUTO: 'auto',
    SPEED: 'speed',
    VALUE: 'value',
    SAFETY: 'safety',
    COMMIT: 'commit'
  });

  const WIND_INTENSITIES = Object.freeze({
    LIGHT: 'light',
    MEDIUM: 'medium',
    STRONG: 'strong'
  });

  const WIND_INTENSITY_DELTAS = Object.freeze({
    light: 0.08,
    medium: 0.16,
    strong: 0.24
  });

  const FORCE_KINDS = Object.freeze({
    FORTUNE: 'fortune',
    CURSE: 'curse',
    VOID: 'void',
    PSYCHE: 'psyche',
    LOCK: 'lock'
  });

  const DRAW_KINDS = Object.freeze({
    NORMAL: 'normal',
    INITIAL: 'initial',
    RINSHAN: 'rinshan',
    DORA: 'dora'
  });

  const DEFAULT_INTENT = Object.freeze({
    speed: 0.25,
    value: 0.25,
    safety: 0.25,
    commit: 0.25,
    pressure: 0,
    confidence: 0.5
  });

  const DEFAULT_LOCAL_VALUE = Object.freeze({
    speed: 0,
    value: 0,
    shape: 0,
    safety: 0,
    commit: 0,
    volatility: 0
  });

  const DEFAULT_WEIGHT_POLICY = Object.freeze({
    temperature: 0.75,
    minFactor: 0.25,
    maxFactor: 4,
    shapeWeight: 0.12,
    volatilityWeight: 0.12,
    forcePowerScale: 100,
    maxVoidDamping: 0.9,
    forceStackSecondFactor: 0.55,
    forceStackThirdFactor: 0.35,
    forceStackRestFactor: 0.2,
    fortuneMitigationAgainstCurse: 0.45,
    cursePressureAgainstFortune: 1.1,
    tierCounterStep: 0.4,
    tierPressureStep: 0.35
  });

  const SCORE_LIMITS = Object.freeze({
    min: -1,
    max: 1
  });

  const TILE_TYPES = Object.freeze((() => {
    const tiles = [];
    ['m', 'p', 's'].forEach((suit) => {
      for (let rank = 1; rank <= 9; rank += 1) tiles.push(`${suit}${rank}`);
    });
    for (let rank = 1; rank <= 7; rank += 1) tiles.push(`z${rank}`);
    return tiles;
  })());

  return {
    LUCK_MODEL_VERSION,
    WIND_MODES,
    WIND_INTENSITIES,
    WIND_INTENSITY_DELTAS,
    FORCE_KINDS,
    DRAW_KINDS,
    DEFAULT_INTENT,
    DEFAULT_LOCAL_VALUE,
    DEFAULT_WEIGHT_POLICY,
    SCORE_LIMITS,
    TILE_TYPES
  };
});
