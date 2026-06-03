'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const rankerApi = require('./lib/hard-mortal-ranker-dataset');
const trainingApi = require('./lib/hard-mortal-ranker-training');

const DEFAULT_TRAIN_REPORT = '/tmp/h13e-scale160-train-hard-vs-mortal-report.json';
const DEFAULT_HELDOUT_REPORT = '/tmp/h13e-scale80-heldout-hard-vs-mortal-report.json';
const DEFAULT_TRAIN_DATASET = '/tmp/h13g-native-train-dataset.jsonl';
const DEFAULT_HELDOUT_DATASET = '/tmp/h13g-native-heldout-dataset.jsonl';
const DEFAULT_MODEL_ROOT = '/tmp/h13g-native-ranker-models';
const DEFAULT_PREDICTION_DIR = '/tmp/h13g-native-ranker-predictions';
const DEFAULT_OUT = '/tmp/h13g-native-ranker-experiment-report.json';

function parseModeList(value, fallback = trainingApi.DEFAULT_NATIVE_FEATURE_SCHEMA_MODES) {
  const modes = String(value || '')
    .split(',')
    .map((entry) => trainingApi.normalizeFeatureSchemaMode(entry.trim()))
    .filter(Boolean);
  return modes.length ? Array.from(new Set(modes)) : fallback.slice();
}

function parseArgs(argv = []) {
  const args = {
    help: false,
    trainReport: DEFAULT_TRAIN_REPORT,
    heldoutReport: DEFAULT_HELDOUT_REPORT,
    trainDataset: DEFAULT_TRAIN_DATASET,
    heldoutDataset: DEFAULT_HELDOUT_DATASET,
    modelRoot: DEFAULT_MODEL_ROOT,
    predictionDir: DEFAULT_PREDICTION_DIR,
    out: DEFAULT_OUT,
    rounds: 80,
    python: process.env.PYTHON || 'python3',
    featureSchemaModes: trainingApi.DEFAULT_NATIVE_FEATURE_SCHEMA_MODES.slice(),
    allowLeakySchema: false,
    progress: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }
    if (token === '--train-report') {
      args.trainReport = String(argv[index + 1] || '').trim() || args.trainReport;
      index += 1;
      continue;
    }
    if (token === '--heldout-report') {
      args.heldoutReport = String(argv[index + 1] || '').trim() || args.heldoutReport;
      index += 1;
      continue;
    }
    if (token === '--train-dataset') {
      args.trainDataset = String(argv[index + 1] || '').trim() || args.trainDataset;
      index += 1;
      continue;
    }
    if (token === '--heldout-dataset') {
      args.heldoutDataset = String(argv[index + 1] || '').trim() || args.heldoutDataset;
      index += 1;
      continue;
    }
    if (token === '--model-root') {
      args.modelRoot = String(argv[index + 1] || '').trim() || args.modelRoot;
      index += 1;
      continue;
    }
    if (token === '--prediction-dir') {
      args.predictionDir = String(argv[index + 1] || '').trim() || args.predictionDir;
      index += 1;
      continue;
    }
    if (token === '--out') {
      args.out = String(argv[index + 1] || '').trim() || args.out;
      index += 1;
      continue;
    }
    if (token === '--rounds') {
      const rounds = Number(argv[index + 1]);
      if (Number.isFinite(rounds)) args.rounds = Math.max(1, Math.floor(rounds));
      index += 1;
      continue;
    }
    if (token === '--python') {
      args.python = String(argv[index + 1] || '').trim() || args.python;
      index += 1;
      continue;
    }
    if (token === '--feature-schema-modes') {
      args.featureSchemaModes = parseModeList(argv[index + 1]);
      index += 1;
      continue;
    }
    if (token === '--allow-leaky-schema') {
      args.allowLeakySchema = true;
      continue;
    }
    if (token === '--progress') {
      args.progress = true;
    }
  }

  return args;
}

function printHelp() {
  console.log('Usage: node games/majiang/scripts/run-hard-mortal-ranker-native-experiment.js [options]');
  console.log('');
  console.log('Options:');
  console.log('  --train-report <path>       Existing train Mortal report. Default: /tmp/h13e-scale160-train-hard-vs-mortal-report.json');
  console.log('  --heldout-report <path>     Existing heldout Mortal report. Default: /tmp/h13e-scale80-heldout-hard-vs-mortal-report.json');
  console.log('  --train-dataset <path>      Rebuilt native train JSONL path.');
  console.log('  --heldout-dataset <path>    Rebuilt native heldout JSONL path.');
  console.log('  --feature-schema-modes <csv>');
  console.log('                              Default: runtime-safe-native-v1,runtime-safe-native-no-shape.');
  console.log('  --model-root <path>         Output model root. Default: /tmp/h13g-native-ranker-models');
  console.log('  --prediction-dir <path>     Prediction diagnostics directory.');
  console.log('  --rounds <n>                LightGBM rounds. Default: 80.');
  console.log('  --python <cmd>              Python command. Default: $PYTHON or python3.');
  console.log('  --out <path>                Experiment report path. Default: /tmp/h13g-native-ranker-experiment-report.json');
  console.log('  --progress                  Print progress updates to stderr.');
}

function reportProgress(args, message, details = {}) {
  if (!args.progress) return;
  const suffix = Object.keys(details).length ? ` ${JSON.stringify(details)}` : '';
  console.error(`[h13g-native-ranker] ${message}${suffix}`);
}

function safeName(mode) {
  return String(mode || 'unknown').replace(/[^a-z0-9_-]+/gi, '-');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(path.resolve(filePath), JSON.stringify(value, null, 2).concat('\n'), 'utf8');
}

function requireExistingFile(filePath, label) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    const error = new Error(`${label} does not exist: ${resolved}`);
    error.code = 'missing-input-report';
    error.path = resolved;
    throw error;
  }
  return resolved;
}

function compactSchema(schema) {
  const featureNames = trainingApi.buildFeatureNames(schema);
  return {
    version: schema.version,
    mode: schema.mode,
    numericFeatureCount: schema.numericFeaturePaths.length,
    oneHotFeatureCount: schema.oneHotFeatures.length,
    expandedFeatureCount: featureNames.length,
    nativeNumericFeatureCount: schema.numericFeaturePaths.filter((featurePath) => String(featurePath).startsWith('features.native.')).length,
    featureNames
  };
}

function buildDatasetFromReport(reportPath, datasetPath, args, split) {
  const resolvedReport = requireExistingFile(reportPath, `${split} report`);
  reportProgress(args, 'dataset-start', {
    split,
    report: resolvedReport,
    dataset: path.resolve(datasetPath)
  });
  const report = readJson(resolvedReport);
  const dataset = rankerApi.buildRankerDatasetFromReports([{
    path: resolvedReport,
    report
  }]);
  rankerApi.assertCompactDatasetRows(dataset.candidateRows);
  rankerApi.writeJsonl(datasetPath, dataset.candidateRows);
  reportProgress(args, 'dataset-written', {
    split,
    states: dataset.summary.includedStates,
    candidateRows: dataset.summary.candidateRows
  });
  return {
    reportPath: resolvedReport,
    datasetPath: path.resolve(datasetPath),
    reportSummary: report.summary || null,
    reportSeverity: report.severity || null,
    datasetSummary: dataset.summary
  };
}

function parseJsonOutput(stdout) {
  const text = String(stdout || '').trim();
  if (!text) return null;
  return JSON.parse(text);
}

function readJsonIfExists(filePath) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) return null;
  return readJson(resolved);
}

function roundMetric(value, digits = 6) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Number(number.toFixed(digits));
}

function severity(qDelta) {
  const delta = Number(qDelta);
  if (!Number.isFinite(delta)) return 'unknown';
  if (delta <= 0) return 'exact';
  if (delta <= rankerApi.NEAR_Q_DELTA) return 'near';
  if (delta <= rankerApi.MEDIUM_Q_DELTA) return 'medium';
  return 'large';
}

function increment(map, key) {
  const resolved = key || 'unknown';
  map[resolved] = (map[resolved] || 0) + 1;
}

function candidateValue(pick, pathName) {
  const features = pick && pick.features ? pick.features : {};
  const native = features.native || {};
  if (pathName.startsWith('native.')) return Number(native[pathName.slice('native.'.length)] || 0);
  return Number(features[pathName] || 0);
}

function qDeltaOf(pick) {
  const value = pick && pick.qDeltaFromBest;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function createSweepSummary(margin) {
  return {
    name: 'model-native-coverage-override-hard',
    margin,
    states: 0,
    exact: 0,
    near: 0,
    medium: 0,
    large: 0,
    unknown: 0,
    exactRate: 0,
    nearOrExactRate: 0,
    mediumOrBetterRate: 0,
    largeRate: 0,
    averageQDelta: null,
    bucketCounts: {},
    bucketLargeCounts: {},
    overrideCount: 0,
    improved: 0,
    regressed: 0,
    same: 0,
    hardExactRegressed: 0,
    blockedReasons: {},
    _qDeltaTotal: 0,
    _qDeltaCount: 0
  };
}

function recordPick(summary, pick, bucket) {
  const qDelta = qDeltaOf(pick);
  const level = severity(qDelta);
  summary.states += 1;
  if (Object.prototype.hasOwnProperty.call(summary, level)) summary[level] += 1;
  else summary.unknown += 1;
  increment(summary.bucketCounts, bucket);
  if (level === 'large') increment(summary.bucketLargeCounts, bucket);
  if (qDelta != null) {
    summary._qDeltaTotal += qDelta;
    summary._qDeltaCount += 1;
  }
  return level;
}

function finalizeSweepSummary(summary) {
  summary.exactRate = summary.states ? roundMetric(summary.exact / summary.states, 4) : 0;
  summary.nearOrExactRate = summary.states ? roundMetric((summary.exact + summary.near) / summary.states, 4) : 0;
  summary.mediumOrBetterRate = summary.states ? roundMetric((summary.exact + summary.near + summary.medium) / summary.states, 4) : 0;
  summary.largeRate = summary.states ? roundMetric(summary.large / summary.states, 4) : 0;
  summary.averageQDelta = summary._qDeltaCount ? roundMetric(summary._qDeltaTotal / summary._qDeltaCount) : null;
  delete summary._qDeltaTotal;
  delete summary._qDeltaCount;
  return summary;
}

function evaluateNativeCoverageOverride(row, margin) {
  const current = row && row.currentHard ? row.currentHard : null;
  const model = row && row.model ? row.model : null;
  const reasons = [];
  if (!current || !model) reasons.push('missing-pick');
  if (!row || !row.changed) reasons.push('model-same-as-current-hard');
  if (Number(row && row.predictionMargin || 0) < margin) reasons.push('margin-below-threshold');

  if (current && model) {
    const currentXiangting = Number(current.features && current.features.xiangting);
    const modelXiangting = Number(model.features && model.features.xiangting);
    if (Number.isFinite(currentXiangting) && Number.isFinite(modelXiangting) && modelXiangting > currentXiangting) {
      reasons.push('worse-xiangting');
    }

    const pressureScore = Number(row.pressureScore || 0);
    if (pressureScore > 0) {
      const currentDanger = Number(current.features && current.features.dangerScore);
      const modelDanger = Number(model.features && model.features.dangerScore);
      if (Number.isFinite(currentDanger) && Number.isFinite(modelDanger) && modelDanger > currentDanger) {
        reasons.push('higher-danger-under-pressure');
      }
    }

    [
      'native.discardDoraCount',
      'native.discardRedFiveCount',
      'native.discardValueHonorCount',
      'native.discardIsFive'
    ].forEach((featurePath) => {
      if (candidateValue(model, featurePath) > candidateValue(current, featurePath)) {
        reasons.push(`cuts-higher-value:${featurePath}`);
      }
    });

    [
      'native.breaksPair',
      'native.breaksTriplet',
      'native.breaksSequenceWindow',
      'native.breaksRyanmenWindow',
      'native.usefulConnectorBreak'
    ].forEach((featurePath) => {
      if (candidateValue(model, featurePath) > candidateValue(current, featurePath)) {
        reasons.push(`breaks-more-structure:${featurePath}`);
      }
    });
  }

  return {
    ok: reasons.length === 0,
    reasons
  };
}

function computeNativeCoverageSweep(predictionRows = [], currentHardBaseline = null) {
  const margins = trainingApi.DEFAULT_OVERRIDE_MARGINS.slice();
  const sweep = margins.map(createSweepSummary);
  predictionRows.forEach((row) => {
    const bucket = row.bucket || 'unknown';
    const current = row.currentHard;
    const model = row.model;
    const localQ = qDeltaOf(current);
    const modelQ = qDeltaOf(model);
    const localLevel = severity(localQ);
    sweep.forEach((summary) => {
      const gate = evaluateNativeCoverageOverride(row, summary.margin);
      const shouldOverride = gate.ok;
      const pick = shouldOverride ? model : current;
      const pickLevel = recordPick(summary, pick, bucket);
      if (shouldOverride) summary.overrideCount += 1;
      gate.reasons.forEach((reason) => increment(summary.blockedReasons, reason));
      const pickQ = qDeltaOf(pick);
      if (localQ == null || pickQ == null || Math.abs(pickQ - localQ) < 1e-12) {
        summary.same += 1;
      } else if (pickQ < localQ) {
        summary.improved += 1;
      } else {
        summary.regressed += 1;
      }
      if (localLevel === 'exact' && pickLevel !== 'exact') summary.hardExactRegressed += 1;
    });
  });
  const finalized = sweep.map(finalizeSweepSummary);
  return {
    sweep: finalized,
    recommendedGate: trainingApi.selectRecommendedOverrideGate(currentHardBaseline, finalized)
  };
}

function compactEvaluation(evaluation) {
  if (!evaluation) return null;
  return {
    status: evaluation.status || 'evaluated',
    states: evaluation.states,
    candidateRows: evaluation.candidateRows,
    exact: evaluation.exact,
    near: evaluation.near,
    medium: evaluation.medium,
    large: evaluation.large,
    unknown: evaluation.unknown,
    exactRate: evaluation.exactRate,
    nearOrExactRate: evaluation.nearOrExactRate,
    mediumOrBetterRate: evaluation.mediumOrBetterRate,
    largeRate: evaluation.largeRate,
    bucketCounts: evaluation.bucketCounts,
    bucketLargeCounts: evaluation.bucketLargeCounts,
    averageQDelta: evaluation.averageQDelta
  };
}

function runMode(args, mode, heldoutBaseline) {
  const schema = trainingApi.getFeatureSchema(mode);
  const leakageCheck = trainingApi.validateFeatureSchemaNoLeakage(schema);
  const modeName = safeName(mode);
  const modelDir = path.resolve(args.modelRoot, modeName);
  const evalOut = path.resolve(args.modelRoot, `${modeName}-heldout-eval.json`);
  const predictionOut = path.resolve(args.predictionDir, `${modeName}-predictions.json`);

  if (!leakageCheck.ok && !args.allowLeakySchema) {
    return {
      mode,
      status: 'failed',
      reason: 'feature-schema-leakage',
      featureSchema: compactSchema(schema),
      leakageCheck
    };
  }

  fs.mkdirSync(path.resolve(args.modelRoot), { recursive: true });
  fs.mkdirSync(path.resolve(args.predictionDir), { recursive: true });
  reportProgress(args, 'mode-start', { mode, modelDir });
  const result = spawnSync(process.execPath, [
    path.resolve(__dirname, 'train-hard-mortal-ranker.js'),
    '--dataset',
    path.resolve(args.trainDataset),
    '--heldout-dataset',
    path.resolve(args.heldoutDataset),
    '--out-dir',
    modelDir,
    '--eval-out',
    evalOut,
    '--prediction-out',
    predictionOut,
    '--rounds',
    String(args.rounds),
    '--python',
    args.python,
    '--feature-schema-mode',
    mode,
    ...(args.allowLeakySchema ? ['--allow-leaky-schema'] : [])
  ], {
    encoding: 'utf8'
  });

  if (result.status !== 0) {
    return {
      mode,
      status: 'failed',
      exitCode: result.status,
      featureSchema: compactSchema(schema),
      leakageCheck,
      stdout: result.stdout || '',
      stderr: result.stderr || ''
    };
  }

  const trainingResult = parseJsonOutput(result.stdout) || { status: 'unknown' };
  const modelEvaluation = trainingResult.heldoutEvaluation || readJsonIfExists(evalOut);
  const predictionOutput = readJsonIfExists(predictionOut);
  const predictionRows = predictionOutput && Array.isArray(predictionOutput.rows) ? predictionOutput.rows : [];
  const currentHard = modelEvaluation && modelEvaluation.currentHardBaseline
    ? modelEvaluation.currentHardBaseline
    : heldoutBaseline.strategies['current-hard'];
  const coverage = predictionRows.length
    ? computeNativeCoverageSweep(predictionRows, currentHard)
    : { sweep: [], recommendedGate: null };
  const gate = trainingApi.summarizeModelGate(heldoutBaseline, modelEvaluation || trainingResult);

  reportProgress(args, 'mode-done', {
    mode,
    status: trainingResult.status,
    nativeCoverage: coverage.recommendedGate && coverage.recommendedGate.status
  });

  return {
    mode,
    status: trainingResult.status || 'unknown',
    featureSchema: compactSchema(schema),
    leakageCheck,
    paths: {
      modelDir,
      evalOut,
      predictionOut
    },
    training: {
      status: trainingResult.status || 'unknown',
      reason: trainingResult.reason || null,
      candidateRows: trainingResult.candidateRows || null,
      states: trainingResult.states || null
    },
    currentHard,
    modelAlwaysPick: modelEvaluation && modelEvaluation.modelAlwaysPick
      ? modelEvaluation.modelAlwaysPick
      : compactEvaluation(modelEvaluation),
    confidenceOverrideSweep: modelEvaluation && Array.isArray(modelEvaluation.confidenceOverrideSweep)
      ? modelEvaluation.confidenceOverrideSweep
      : [],
    recommendedOverrideGate: modelEvaluation && modelEvaluation.recommendedOverrideGate
      ? modelEvaluation.recommendedOverrideGate
      : null,
    nativeCoverageOverrideSweep: coverage.sweep,
    recommendedNativeCoverageGate: coverage.recommendedGate,
    predictionDiagnostics: modelEvaluation && modelEvaluation.predictionDiagnostics
      ? modelEvaluation.predictionDiagnostics
      : predictionOutput && predictionOutput.summary
        ? predictionOutput.summary
        : null,
    gate
  };
}

function buildConclusion(results = []) {
  const trained = results.filter((result) => result && result.status === 'trained');
  if (!trained.length) {
    return {
      status: 'skipped',
      recommendation: 'prepare-lightgbm-environment',
      reasons: ['no-trained-native-results']
    };
  }
  const nativeReady = trained.find((result) => (
    result.recommendedNativeCoverageGate
    && result.recommendedNativeCoverageGate.status === 'ready'
  ));
  if (nativeReady) {
    return {
      status: 'candidate',
      recommendation: 'plan-h13h-shadow-scorer-with-native-coverage-gate',
      preferredMode: nativeReady.mode,
      preferredGate: nativeReady.recommendedNativeCoverageGate,
      reasons: ['native-coverage-override-ready']
    };
  }

  const bestAlways = trained.slice().sort((left, right) => (
    Number(right.modelAlwaysPick && right.modelAlwaysPick.exactRate || 0)
      - Number(left.modelAlwaysPick && left.modelAlwaysPick.exactRate || 0)
    || Number(left.modelAlwaysPick && left.modelAlwaysPick.large || Infinity)
      - Number(right.modelAlwaysPick && right.modelAlwaysPick.large || Infinity)
  ))[0];

  return {
    status: 'not-ready',
    recommendation: 'inspect-native-prediction-regressions-before-runtime-shadow',
    preferredMode: bestAlways ? bestAlways.mode : null,
    reasons: ['native-features-trained-but-no-safe-coverage-gate']
  };
}

function buildReport(args, parts) {
  return {
    source: 'h13g-hard-mortal-ranker-native-experiment',
    generatedAt: Date.now(),
    config: {
      trainReport: path.resolve(args.trainReport),
      heldoutReport: path.resolve(args.heldoutReport),
      trainDataset: path.resolve(args.trainDataset),
      heldoutDataset: path.resolve(args.heldoutDataset),
      modelRoot: path.resolve(args.modelRoot),
      predictionDir: path.resolve(args.predictionDir),
      featureSchemaModes: args.featureSchemaModes,
      rounds: args.rounds,
      python: args.python,
      allowLeakySchema: Boolean(args.allowLeakySchema)
    },
    train: parts.train,
    heldout: parts.heldout,
    heldoutBaseline: parts.heldoutBaseline,
    results: parts.results,
    conclusion: buildConclusion(parts.results)
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  try {
    reportProgress(args, 'start', {
      trainReport: path.resolve(args.trainReport),
      heldoutReport: path.resolve(args.heldoutReport),
      modes: args.featureSchemaModes
    });
    const train = buildDatasetFromReport(args.trainReport, args.trainDataset, args, 'train');
    const heldout = buildDatasetFromReport(args.heldoutReport, args.heldoutDataset, args, 'heldout');
    const heldoutRows = rankerApi.readJsonl(args.heldoutDataset);
    const heldoutBaseline = rankerApi.evaluateRankerDatasetRows(heldoutRows);
    const results = args.featureSchemaModes.map((mode) => runMode(args, mode, heldoutBaseline));
    const report = buildReport(args, {
      train,
      heldout,
      heldoutBaseline,
      results
    });
    writeJson(args.out, report);
    reportProgress(args, 'written', {
      out: path.resolve(args.out),
      recommendation: report.conclusion && report.conclusion.recommendation
    });
    console.log(JSON.stringify({
      out: path.resolve(args.out),
      conclusion: report.conclusion,
      trainStates: train.datasetSummary.includedStates,
      heldoutStates: heldout.datasetSummary.includedStates,
      modes: results.map((result) => ({
        mode: result.mode,
        status: result.status,
        exactRate: result.modelAlwaysPick && result.modelAlwaysPick.exactRate,
        large: result.modelAlwaysPick && result.modelAlwaysPick.large,
        hardExactRegressed: result.predictionDiagnostics && result.predictionDiagnostics.hardExactRegressed,
        nativeCoverageGate: result.recommendedNativeCoverageGate && result.recommendedNativeCoverageGate.status
      }))
    }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      status: 'failed',
      reason: error.code || 'native-experiment-failed',
      error: error.message,
      path: error.path || null
    }, null, 2));
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  DEFAULT_TRAIN_REPORT,
  DEFAULT_HELDOUT_REPORT,
  DEFAULT_TRAIN_DATASET,
  DEFAULT_HELDOUT_DATASET,
  DEFAULT_MODEL_ROOT,
  DEFAULT_PREDICTION_DIR,
  DEFAULT_OUT,
  parseArgs,
  buildDatasetFromReport,
  computeNativeCoverageSweep,
  evaluateNativeCoverageOverride,
  buildReport,
  buildConclusion,
  main
};
