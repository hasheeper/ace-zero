'use strict';

const path = require('path');

const DEFAULT_TRAIN_REPORT_PATH = '/tmp/h13b-train-hard-vs-mortal-report.json';
const DEFAULT_HELDOUT_REPORT_PATH = '/tmp/h13b-heldout-hard-vs-mortal-report.json';
const DEFAULT_TRAIN_DATASET_PATH = '/tmp/h13b-train-dataset.jsonl';
const DEFAULT_HELDOUT_DATASET_PATH = '/tmp/h13b-heldout-dataset.jsonl';
const DEFAULT_MODEL_DIR = '/tmp/h13b-ranker-model';
const DEFAULT_HELDOUT_EVAL_PATH = '/tmp/h13b-heldout-eval.json';
const DEFAULT_PREDICTION_DIAGNOSTICS_PATH = '/tmp/h13b-heldout-predictions.json';
const DEFAULT_EXPERIMENT_REPORT_PATH = '/tmp/h13b-ranker-experiment-report.json';
const DEFAULT_TRAIN_SEEDS = Object.freeze([20260531, 20260607, 20260614, 20260621]);
const DEFAULT_HELDOUT_SEEDS = Object.freeze([20260712, 20260719, 20260726, 20260802]);
const DEFAULT_SMOKE_TRAIN_SEEDS = Object.freeze([20260531, 20260607]);
const DEFAULT_SMOKE_HELDOUT_SEEDS = Object.freeze([20260712, 20260719]);
const FEATURE_SCHEMA_MODE_RUNTIME_SAFE = 'runtime-safe';
const FEATURE_SCHEMA_MODE_RUNTIME_SAFE_NO_SHAPE = 'runtime-safe-no-shape';
const FEATURE_SCHEMA_MODE_RUNTIME_SAFE_CORE_ONLY = 'runtime-safe-core-only';
const FEATURE_SCHEMA_MODE_RUNTIME_SAFE_NO_HARD_EV = 'runtime-safe-no-hard-ev';
const FEATURE_SCHEMA_MODE_RUNTIME_SAFE_NATIVE = 'runtime-safe-native-v1';
const FEATURE_SCHEMA_MODE_RUNTIME_SAFE_NATIVE_NO_SHAPE = 'runtime-safe-native-no-shape';
const FEATURE_SCHEMA_MODE_LEGACY = 'legacy';
const DEFAULT_FEATURE_SCHEMA_MODE = FEATURE_SCHEMA_MODE_RUNTIME_SAFE;
const DEFAULT_OVERRIDE_MARGINS = Object.freeze([0, 0.05, 0.1, 0.15, 0.2, 0.3, 0.5]);
const DEFAULT_MAX_HARD_EXACT_REGRESSED = 2;
const DEFAULT_ABLATION_FEATURE_SCHEMA_MODES = Object.freeze([
  FEATURE_SCHEMA_MODE_RUNTIME_SAFE,
  FEATURE_SCHEMA_MODE_RUNTIME_SAFE_NO_SHAPE,
  FEATURE_SCHEMA_MODE_RUNTIME_SAFE_CORE_ONLY,
  FEATURE_SCHEMA_MODE_RUNTIME_SAFE_NO_HARD_EV
]);

const DEFAULT_NATIVE_FEATURE_SCHEMA_MODES = Object.freeze([
  FEATURE_SCHEMA_MODE_RUNTIME_SAFE_NATIVE,
  FEATURE_SCHEMA_MODE_RUNTIME_SAFE_NATIVE_NO_SHAPE
]);

const NUMERIC_FEATURE_PATHS = Object.freeze([
  'state.remaining',
  'state.pressureScore',
  'state.localXiangting',
  'features.tile.tileRank',
  'features.tile.isHonor',
  'features.tile.isTerminal',
  'features.tile.isMiddle',
  'features.tile.isFive',
  'features.tile.isRedFive',
  'features.xiangting',
  'features.tingpaiCount',
  'features.ukeireCount',
  'features.handValueEstimate',
  'features.hardEvScore',
  'features.liveUkeireCount',
  'features.liveTingpaiCount',
  'features.waitQualityScore',
  'features.contextualHandValueEstimate',
  'features.dangerScore',
  'features.safetyRank',
  'features.defenseTileRank',
  'features.discardShapeScore',
  'features.keptUsefulMiddleCount',
  'features.weakTerminalCleanupBonus',
  'features.isolatedHonorCleanupBonus',
  'features.middleTileCutPenalty',
  'features.fiveOrRedFiveCutPenalty',
  'features.doraRetentionPenalty',
  'features.pairOrBlockBreakPenalty'
]);

const SHAPE_NUMERIC_FEATURE_PATHS = Object.freeze([
  'features.discardShapeScore',
  'features.keptUsefulMiddleCount',
  'features.weakTerminalCleanupBonus',
  'features.isolatedHonorCleanupBonus',
  'features.middleTileCutPenalty',
  'features.fiveOrRedFiveCutPenalty',
  'features.doraRetentionPenalty',
  'features.pairOrBlockBreakPenalty'
]);

const HARD_EV_NUMERIC_FEATURE_PATHS = Object.freeze([
  'features.hardEvScore',
  'features.liveUkeireCount',
  'features.liveTingpaiCount',
  'features.waitQualityScore',
  'features.contextualHandValueEstimate'
]);

const CORE_ONLY_NUMERIC_FEATURE_PATHS = Object.freeze([
  'state.remaining',
  'state.pressureScore',
  'state.localXiangting',
  'features.tile.tileRank',
  'features.tile.isHonor',
  'features.tile.isTerminal',
  'features.tile.isMiddle',
  'features.tile.isFive',
  'features.tile.isRedFive',
  'features.xiangting',
  'features.tingpaiCount',
  'features.ukeireCount',
  'features.handValueEstimate',
  'features.hardEvScore',
  'features.dangerScore',
  'features.safetyRank',
  'features.defenseTileRank'
]);

const NATIVE_NUMERIC_FEATURE_PATHS = Object.freeze([
  'features.native.handTileCount',
  'features.native.meldCount',
  'features.native.isOpen',
  'features.native.beforeHonorCount',
  'features.native.beforeTerminalCount',
  'features.native.beforeMiddleCount',
  'features.native.beforeDoraCount',
  'features.native.beforeValueHonorCount',
  'features.native.beforeDominantSuitCount',
  'features.native.beforeSuitedNonDominantCount',
  'features.native.afterHonorCount',
  'features.native.afterTerminalCount',
  'features.native.afterMiddleCount',
  'features.native.afterDoraCount',
  'features.native.afterDoraAdjacentCount',
  'features.native.afterValueHonorCount',
  'features.native.afterDominantSuitCount',
  'features.native.afterSuitedNonDominantCount',
  'features.native.afterTanyaoTileCount',
  'features.native.afterTerminalHonorCount',
  'features.native.pairCountBefore',
  'features.native.pairCountAfter',
  'features.native.tripletCountBefore',
  'features.native.tripletCountAfter',
  'features.native.sequenceWindowCountBefore',
  'features.native.sequenceWindowCountAfter',
  'features.native.ryanmenWindowCountBefore',
  'features.native.ryanmenWindowCountAfter',
  'features.native.kanchanWindowCountBefore',
  'features.native.kanchanWindowCountAfter',
  'features.native.isolatedHonorCountAfter',
  'features.native.isolatedTerminalCountAfter',
  'features.native.isolatedMiddleCountAfter',
  'features.native.discardCountBefore',
  'features.native.discardConnectivityBefore',
  'features.native.discardConnectivityAfter',
  'features.native.discardIsHonor',
  'features.native.discardIsTerminal',
  'features.native.discardIsMiddle',
  'features.native.discardIsFive',
  'features.native.discardRedFiveCount',
  'features.native.discardDoraCount',
  'features.native.discardDoraAdjacentCount',
  'features.native.discardValueHonorCount',
  'features.native.breaksPair',
  'features.native.breaksTriplet',
  'features.native.breaksSequenceWindow',
  'features.native.breaksRyanmenWindow',
  'features.native.breaksKanchanWindow',
  'features.native.usefulConnectorBreak'
]);

const RUNTIME_SAFE_ONE_HOT_FEATURES = Object.freeze([
  Object.freeze({
    path: 'features.tile.tileSuit',
    categories: Object.freeze(['m', 'p', 's', 'z', 'unknown'])
  }),
  Object.freeze({
    path: 'features.bestWaitType',
    categories: Object.freeze(['none', 'ryanmen', 'shanpon', 'kanchan', 'penchan', 'tanki', 'honor', 'unknown'])
  }),
  Object.freeze({
    path: 'features.discardTileRole',
    categories: Object.freeze([
      'isolated-terminal',
      'isolated-honor',
      'value-honor',
      'weak-floating',
      'floating-middle',
      'terminal-block',
      'edge-block',
      'central-five',
      'useful-five',
      'unknown'
    ])
  }),
  Object.freeze({
    path: 'state.pressureState',
    categories: Object.freeze(['neutral', 'careful', 'push', 'unknown'])
  }),
  Object.freeze({
    path: 'features.tile.isHonor',
    categories: Object.freeze(['true', 'false'])
  }),
  Object.freeze({
    path: 'features.tile.isTerminal',
    categories: Object.freeze(['true', 'false'])
  }),
  Object.freeze({
    path: 'features.tile.isMiddle',
    categories: Object.freeze(['true', 'false'])
  }),
  Object.freeze({
    path: 'features.tile.isFive',
    categories: Object.freeze(['true', 'false'])
  }),
  Object.freeze({
    path: 'features.tile.isRedFive',
    categories: Object.freeze(['true', 'false'])
  })
]);

const CORE_ONLY_ONE_HOT_FEATURES = Object.freeze([
  RUNTIME_SAFE_ONE_HOT_FEATURES[0],
  RUNTIME_SAFE_ONE_HOT_FEATURES[3],
  ...RUNTIME_SAFE_ONE_HOT_FEATURES.slice(4)
]);

const LEGACY_ONE_HOT_FEATURES = Object.freeze([
  ...RUNTIME_SAFE_ONE_HOT_FEATURES.slice(0, 4),
  Object.freeze({
    path: 'state.bucket',
    categories: Object.freeze([
      'exact-match',
      'tile-choice',
      'tile-defense',
      'riichi-missed',
      'riichi-overpush',
      'missing-mortal',
      'action-type',
      'unknown'
    ])
  }),
  ...RUNTIME_SAFE_ONE_HOT_FEATURES.slice(4)
]);

const ONE_HOT_FEATURES = RUNTIME_SAFE_ONE_HOT_FEATURES;

const FORBIDDEN_FEATURE_PATTERNS = Object.freeze([
  /(^|\.)bucket$/i,
  /severity/i,
  /qdelta/i,
  /(^|\.)label($|\.)/i,
  /ismortalbest/i,
  /islocalselected/i,
  /comparison/i,
  /judgment/i,
  /result/i,
  /alignment/i,
  /localmortalcandidate/i,
  /bestmortalcandidate/i
]);

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function roundMetric(value, digits = 6) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Number(number.toFixed(digits));
}

function normalizeFeatureSchemaMode(mode = DEFAULT_FEATURE_SCHEMA_MODE) {
  const normalized = String(mode || '').trim().toLowerCase();
  if (normalized === FEATURE_SCHEMA_MODE_LEGACY || normalized === 'v1' || normalized === 'h13b') {
    return FEATURE_SCHEMA_MODE_LEGACY;
  }
  if (normalized === FEATURE_SCHEMA_MODE_RUNTIME_SAFE_NO_SHAPE || normalized === 'no-shape') {
    return FEATURE_SCHEMA_MODE_RUNTIME_SAFE_NO_SHAPE;
  }
  if (normalized === FEATURE_SCHEMA_MODE_RUNTIME_SAFE_CORE_ONLY || normalized === 'core-only') {
    return FEATURE_SCHEMA_MODE_RUNTIME_SAFE_CORE_ONLY;
  }
  if (normalized === FEATURE_SCHEMA_MODE_RUNTIME_SAFE_NO_HARD_EV || normalized === 'no-hard-ev') {
    return FEATURE_SCHEMA_MODE_RUNTIME_SAFE_NO_HARD_EV;
  }
  if (normalized === FEATURE_SCHEMA_MODE_RUNTIME_SAFE_NATIVE || normalized === 'native' || normalized === 'h13g') {
    return FEATURE_SCHEMA_MODE_RUNTIME_SAFE_NATIVE;
  }
  if (normalized === FEATURE_SCHEMA_MODE_RUNTIME_SAFE_NATIVE_NO_SHAPE || normalized === 'native-no-shape') {
    return FEATURE_SCHEMA_MODE_RUNTIME_SAFE_NATIVE_NO_SHAPE;
  }
  return FEATURE_SCHEMA_MODE_RUNTIME_SAFE;
}

function getFeatureSchema(mode = DEFAULT_FEATURE_SCHEMA_MODE) {
  const schemaMode = normalizeFeatureSchemaMode(mode);
  let numericFeaturePaths = NUMERIC_FEATURE_PATHS.slice();
  let oneHotFeatures = RUNTIME_SAFE_ONE_HOT_FEATURES;
  let version = 'h13d-ranker-runtime-safe-feature-schema-v1';

  if (schemaMode === FEATURE_SCHEMA_MODE_LEGACY) {
    oneHotFeatures = LEGACY_ONE_HOT_FEATURES;
    version = 'h13b-ranker-feature-schema-v1';
  } else if (schemaMode === FEATURE_SCHEMA_MODE_RUNTIME_SAFE_NO_SHAPE) {
    numericFeaturePaths = numericFeaturePaths.filter((featurePath) => !SHAPE_NUMERIC_FEATURE_PATHS.includes(featurePath));
    oneHotFeatures = RUNTIME_SAFE_ONE_HOT_FEATURES.filter((feature) => feature.path !== 'features.discardTileRole');
    version = 'h13f-ranker-runtime-safe-no-shape-feature-schema-v1';
  } else if (schemaMode === FEATURE_SCHEMA_MODE_RUNTIME_SAFE_CORE_ONLY) {
    numericFeaturePaths = CORE_ONLY_NUMERIC_FEATURE_PATHS.slice();
    oneHotFeatures = CORE_ONLY_ONE_HOT_FEATURES;
    version = 'h13f-ranker-runtime-safe-core-only-feature-schema-v1';
  } else if (schemaMode === FEATURE_SCHEMA_MODE_RUNTIME_SAFE_NO_HARD_EV) {
    numericFeaturePaths = numericFeaturePaths.filter((featurePath) => !HARD_EV_NUMERIC_FEATURE_PATHS.includes(featurePath));
    oneHotFeatures = RUNTIME_SAFE_ONE_HOT_FEATURES.filter((feature) => feature.path !== 'features.bestWaitType');
    version = 'h13f-ranker-runtime-safe-no-hard-ev-feature-schema-v1';
  } else if (schemaMode === FEATURE_SCHEMA_MODE_RUNTIME_SAFE_NATIVE) {
    numericFeaturePaths = NUMERIC_FEATURE_PATHS.concat(NATIVE_NUMERIC_FEATURE_PATHS);
    version = 'h13g-ranker-runtime-safe-native-feature-schema-v1';
  } else if (schemaMode === FEATURE_SCHEMA_MODE_RUNTIME_SAFE_NATIVE_NO_SHAPE) {
    numericFeaturePaths = NUMERIC_FEATURE_PATHS
      .filter((featurePath) => !SHAPE_NUMERIC_FEATURE_PATHS.includes(featurePath))
      .concat(NATIVE_NUMERIC_FEATURE_PATHS);
    oneHotFeatures = RUNTIME_SAFE_ONE_HOT_FEATURES.filter((feature) => feature.path !== 'features.discardTileRole');
    version = 'h13g-ranker-runtime-safe-native-no-shape-feature-schema-v1';
  }

  return {
    version,
    mode: schemaMode,
    numericFeaturePaths,
    oneHotFeatures: oneHotFeatures.map((feature) => ({
      path: feature.path,
      categories: feature.categories.slice()
    }))
  };
}

function buildFeatureNames(schema = getFeatureSchema()) {
  const names = [];
  (schema.numericFeaturePaths || []).forEach((featurePath) => names.push(featurePath));
  (schema.oneHotFeatures || []).forEach((feature) => {
    (feature.categories || []).forEach((category) => {
      names.push(`${feature.path}=${category}`);
    });
  });
  return names;
}

function findFeatureSchemaLeakage(schema = getFeatureSchema()) {
  const violations = [];
  const addViolation = (kind, value, pattern) => {
    violations.push({
      kind,
      value,
      pattern: String(pattern)
    });
  };
  (schema.numericFeaturePaths || []).forEach((featurePath) => {
    FORBIDDEN_FEATURE_PATTERNS.forEach((pattern) => {
      if (pattern.test(String(featurePath || ''))) addViolation('numericFeaturePath', featurePath, pattern);
    });
  });
  (schema.oneHotFeatures || []).forEach((feature) => {
    FORBIDDEN_FEATURE_PATTERNS.forEach((pattern) => {
      if (pattern.test(String(feature.path || ''))) addViolation('oneHotFeaturePath', feature.path, pattern);
    });
  });
  return violations;
}

function validateFeatureSchemaNoLeakage(schema = getFeatureSchema()) {
  const violations = findFeatureSchemaLeakage(schema);
  return {
    ok: violations.length === 0,
    status: violations.length === 0 ? 'clean' : 'feature-schema-leakage',
    violations
  };
}

function assertFeatureSchemaNoLeakage(schema = getFeatureSchema()) {
  const check = validateFeatureSchemaNoLeakage(schema);
  if (!check.ok) {
    const error = new Error('feature-schema-leakage');
    error.code = 'feature-schema-leakage';
    error.leakageCheck = check;
    throw error;
  }
  return check;
}

function relevanceFromQDelta(qDelta) {
  const delta = Number(qDelta);
  if (!Number.isFinite(delta)) return 0;
  if (delta <= 0) return 4;
  if (delta <= 0.05) return 3;
  if (delta <= 0.2) return 2;
  if (delta <= 0.5) return 1;
  return 0;
}

function summarizeModelGate(baselineReport = null, modelReport = null, options = {}) {
  const baseline = baselineReport
    && baselineReport.strategies
    && baselineReport.strategies['current-hard']
      ? baselineReport.strategies['current-hard']
      : null;
  const model = modelReport && modelReport.status !== 'skipped' ? modelReport : null;
  const minExactRateLift = Number.isFinite(Number(options.minExactRateLift))
    ? Number(options.minExactRateLift)
    : 0.05;
  const minLargeReduction = Number.isFinite(Number(options.minLargeReduction))
    ? Number(options.minLargeReduction)
    : 8;
  const passed = [];
  const failed = [];
  const warnings = [];

  if (!baseline) {
    failed.push('missing-current-hard-baseline');
  }
  if (!model) {
    failed.push(modelReport && modelReport.reason ? `model-${modelReport.reason}` : 'missing-model-eval');
  }

  if (baseline && model) {
    const exactLift = roundMetric(Number(model.exactRate || 0) - Number(baseline.exactRate || 0), 4);
    const largeReduction = Number(baseline.large || 0) - Number(model.large || 0);
    const exactGate = exactLift >= minExactRateLift;
    const largeGate = largeReduction >= minLargeReduction;
    if (exactGate) passed.push('exact-rate-lift');
    if (largeGate) passed.push('large-reduction');
    if (!exactGate && !largeGate) failed.push('model-did-not-beat-current-hard');

    const baselineDefenseLarge = Number(baseline.bucketLargeCounts && baseline.bucketLargeCounts['tile-defense'] || 0);
    const modelDefenseLarge = Number(model.bucketLargeCounts && model.bucketLargeCounts['tile-defense'] || 0);
    const baselineRiichiMissed = Number(baseline.bucketCounts && baseline.bucketCounts['riichi-missed'] || 0);
    const modelRiichiMissed = Number(model.bucketCounts && model.bucketCounts['riichi-missed'] || 0);
    if (modelDefenseLarge <= baselineDefenseLarge) passed.push('tile-defense-not-worse');
    else failed.push('tile-defense-large-regressed');
    if (modelRiichiMissed <= baselineRiichiMissed) passed.push('riichi-missed-not-worse');
    else failed.push('riichi-missed-regressed');

    if (Number(model.states || 0) !== Number(baseline.states || 0)) {
      warnings.push('model-and-baseline-state-count-differ');
    }

    return {
      status: failed.length ? 'not-ready' : 'ready',
      modelReadyForShadow: failed.length === 0,
      passed,
      failed,
      warnings,
      deltas: {
        exactRateLift: exactLift,
        largeReduction,
        baselineExactRate: baseline.exactRate,
        modelExactRate: model.exactRate,
        baselineLarge: baseline.large,
        modelLarge: model.large,
        baselineTileDefenseLarge: baselineDefenseLarge,
        modelTileDefenseLarge: modelDefenseLarge,
        baselineRiichiMissed,
        modelRiichiMissed
      }
    };
  }

  return {
    status: 'not-ready',
    modelReadyForShadow: false,
    passed,
    failed,
    warnings,
    deltas: null
  };
}

function selectRecommendedOverrideGate(currentHard = null, sweep = [], options = {}) {
  const maxHardExactRegressed = Number.isFinite(Number(options.maxHardExactRegressed))
    ? Number(options.maxHardExactRegressed)
    : DEFAULT_MAX_HARD_EXACT_REGRESSED;
  const baseline = currentHard && typeof currentHard === 'object' ? currentHard : null;
  const candidates = Array.isArray(sweep) ? sweep : [];
  const eligible = baseline
    ? candidates.filter((item) => (
        item
        && Number(item.hardExactRegressed || 0) <= maxHardExactRegressed
        && (
          Number(item.exact || 0) > Number(baseline.exact || 0)
          || Number(item.large || 0) < Number(baseline.large || 0)
        )
      ))
    : [];
  if (!eligible.length) {
    return {
      status: 'not-ready',
      mode: 'no-override',
      margin: null,
      summary: baseline,
      reasons: ['no-margin-beats-current-hard-with-hard-exact-protection']
    };
  }
  const recommended = eligible.slice().sort((left, right) => (
    Number(right.exact || 0) - Number(left.exact || 0)
    || Number(left.large || 0) - Number(right.large || 0)
    || Number(left.hardExactRegressed || 0) - Number(right.hardExactRegressed || 0)
    || Number(right.overrideCount || 0) - Number(left.overrideCount || 0)
    || Number(left.margin || 0) - Number(right.margin || 0)
  ))[0];
  return {
    status: 'ready',
    mode: 'model-confidence-override-hard',
    margin: recommended.margin,
    summary: recommended,
    reasons: ['protected-override-beats-current-hard']
  };
}

function resolveOutputPath(filePath) {
  return path.resolve(filePath);
}

module.exports = {
  DEFAULT_TRAIN_REPORT_PATH,
  DEFAULT_HELDOUT_REPORT_PATH,
  DEFAULT_TRAIN_DATASET_PATH,
  DEFAULT_HELDOUT_DATASET_PATH,
  DEFAULT_MODEL_DIR,
  DEFAULT_HELDOUT_EVAL_PATH,
  DEFAULT_PREDICTION_DIAGNOSTICS_PATH,
  DEFAULT_EXPERIMENT_REPORT_PATH,
  DEFAULT_TRAIN_SEEDS,
  DEFAULT_HELDOUT_SEEDS,
  DEFAULT_SMOKE_TRAIN_SEEDS,
  DEFAULT_SMOKE_HELDOUT_SEEDS,
  FEATURE_SCHEMA_MODE_RUNTIME_SAFE,
  FEATURE_SCHEMA_MODE_RUNTIME_SAFE_NO_SHAPE,
  FEATURE_SCHEMA_MODE_RUNTIME_SAFE_CORE_ONLY,
  FEATURE_SCHEMA_MODE_RUNTIME_SAFE_NO_HARD_EV,
  FEATURE_SCHEMA_MODE_RUNTIME_SAFE_NATIVE,
  FEATURE_SCHEMA_MODE_RUNTIME_SAFE_NATIVE_NO_SHAPE,
  FEATURE_SCHEMA_MODE_LEGACY,
  DEFAULT_FEATURE_SCHEMA_MODE,
  DEFAULT_OVERRIDE_MARGINS,
  DEFAULT_MAX_HARD_EXACT_REGRESSED,
  DEFAULT_ABLATION_FEATURE_SCHEMA_MODES,
  DEFAULT_NATIVE_FEATURE_SCHEMA_MODES,
  NUMERIC_FEATURE_PATHS,
  SHAPE_NUMERIC_FEATURE_PATHS,
  HARD_EV_NUMERIC_FEATURE_PATHS,
  CORE_ONLY_NUMERIC_FEATURE_PATHS,
  NATIVE_NUMERIC_FEATURE_PATHS,
  ONE_HOT_FEATURES,
  RUNTIME_SAFE_ONE_HOT_FEATURES,
  CORE_ONLY_ONE_HOT_FEATURES,
  LEGACY_ONE_HOT_FEATURES,
  FORBIDDEN_FEATURE_PATTERNS,
  normalizeFeatureSchemaMode,
  getFeatureSchema,
  buildFeatureNames,
  findFeatureSchemaLeakage,
  validateFeatureSchemaNoLeakage,
  assertFeatureSchemaNoLeakage,
  relevanceFromQDelta,
  summarizeModelGate,
  selectRecommendedOverrideGate,
  resolveOutputPath,
  clone
};
