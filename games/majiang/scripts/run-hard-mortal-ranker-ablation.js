'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const rankerApi = require('./lib/hard-mortal-ranker-dataset');
const trainingApi = require('./lib/hard-mortal-ranker-training');

const DEFAULT_TRAIN_DATASET = '/tmp/h13e-scale160-train-dataset.jsonl';
const DEFAULT_HELDOUT_DATASET = '/tmp/h13e-scale80-heldout-dataset.jsonl';
const DEFAULT_OUT = '/tmp/h13f-ranker-ablation-report.json';
const DEFAULT_MODEL_ROOT = '/tmp/h13f-ranker-ablation-models';
const DEFAULT_PREDICTION_DIR = '/tmp/h13f-ranker-ablation-predictions';

function parseModeList(value, fallback = trainingApi.DEFAULT_ABLATION_FEATURE_SCHEMA_MODES) {
  const modes = String(value || '')
    .split(',')
    .map((entry) => trainingApi.normalizeFeatureSchemaMode(entry.trim()))
    .filter(Boolean);
  return modes.length ? Array.from(new Set(modes)) : fallback.slice();
}

function parseArgs(argv = []) {
  const args = {
    help: false,
    trainDataset: DEFAULT_TRAIN_DATASET,
    heldoutDataset: DEFAULT_HELDOUT_DATASET,
    out: DEFAULT_OUT,
    modelRoot: DEFAULT_MODEL_ROOT,
    predictionDir: DEFAULT_PREDICTION_DIR,
    rounds: 80,
    python: process.env.PYTHON || 'python3',
    featureSchemaModes: trainingApi.DEFAULT_ABLATION_FEATURE_SCHEMA_MODES.slice(),
    allowLeakySchema: false,
    progress: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') {
      args.help = true;
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
    if (token === '--out') {
      args.out = String(argv[index + 1] || '').trim() || args.out;
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
  console.log('Usage: node games/majiang/scripts/run-hard-mortal-ranker-ablation.js [options]');
  console.log('');
  console.log('Options:');
  console.log('  --train-dataset <path>       Train JSONL dataset. Default: /tmp/h13e-scale160-train-dataset.jsonl');
  console.log('  --heldout-dataset <path>     Heldout JSONL dataset. Default: /tmp/h13e-scale80-heldout-dataset.jsonl');
  console.log('  --feature-schema-modes <csv> Schema modes. Default: runtime-safe,no-shape,core-only,no-hard-ev.');
  console.log('  --model-root <path>          Output model root. Default: /tmp/h13f-ranker-ablation-models');
  console.log('  --prediction-dir <path>      Prediction diagnostics directory.');
  console.log('  --rounds <n>                 LightGBM rounds. Default: 80.');
  console.log('  --python <cmd>               Python command. Default: $PYTHON or python3.');
  console.log('  --out <path>                 Ablation report path. Default: /tmp/h13f-ranker-ablation-report.json');
  console.log('  --progress                   Print progress updates to stderr.');
}

function reportProgress(args, message, details = {}) {
  if (!args.progress) return;
  const suffix = Object.keys(details).length ? ` ${JSON.stringify(details)}` : '';
  console.error(`[h13f-ranker-ablation] ${message}${suffix}`);
}

function safeName(mode) {
  return String(mode || 'unknown').replace(/[^a-z0-9_-]+/gi, '-');
}

function parseJsonOutput(stdout) {
  const text = String(stdout || '').trim();
  if (!text) return null;
  return JSON.parse(text);
}

function readJsonIfExists(filePath) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) return null;
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

function compactSchema(schema) {
  const featureNames = trainingApi.buildFeatureNames(schema);
  return {
    version: schema.version,
    mode: schema.mode,
    numericFeatureCount: schema.numericFeaturePaths.length,
    oneHotFeatureCount: schema.oneHotFeatures.length,
    expandedFeatureCount: featureNames.length,
    featureNames
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

function runAblationMode(args, mode, heldoutBaseline) {
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
  const predictionDiagnosticsFile = readJsonIfExists(predictionOut);
  const predictionDiagnostics = modelEvaluation && modelEvaluation.predictionDiagnostics
    ? modelEvaluation.predictionDiagnostics
    : predictionDiagnosticsFile && predictionDiagnosticsFile.summary
      ? predictionDiagnosticsFile.summary
      : null;
  const gate = trainingApi.summarizeModelGate(heldoutBaseline, modelEvaluation || trainingResult);
  reportProgress(args, 'mode-done', {
    mode,
    status: trainingResult.status,
    gate: gate.status
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
    currentHard: modelEvaluation && modelEvaluation.currentHardBaseline
      ? modelEvaluation.currentHardBaseline
      : heldoutBaseline.strategies['current-hard'],
    modelAlwaysPick: modelEvaluation && modelEvaluation.modelAlwaysPick
      ? modelEvaluation.modelAlwaysPick
      : compactEvaluation(modelEvaluation),
    confidenceOverrideSweep: modelEvaluation && Array.isArray(modelEvaluation.confidenceOverrideSweep)
      ? modelEvaluation.confidenceOverrideSweep
      : [],
    recommendedOverrideGate: modelEvaluation && modelEvaluation.recommendedOverrideGate
      ? modelEvaluation.recommendedOverrideGate
      : null,
    predictionDiagnostics,
    gate
  };
}

function buildRecommendation(results = []) {
  const trained = results.filter((result) => result && result.status === 'trained');
  if (!trained.length) {
    return {
      status: 'skipped',
      recommendation: 'prepare-lightgbm-environment',
      reasons: ['no-trained-ablation-results']
    };
  }
  const ready = trained.find((result) => result.recommendedOverrideGate && result.recommendedOverrideGate.status === 'ready');
  if (ready) {
    return {
      status: 'candidate',
      recommendation: 'plan-h13g-shadow-scorer-gate',
      preferredMode: ready.mode,
      reasons: ['protected-override-ready']
    };
  }

  const full = trained.find((result) => result.mode === trainingApi.FEATURE_SCHEMA_MODE_RUNTIME_SAFE);
  const noShape = trained.find((result) => result.mode === trainingApi.FEATURE_SCHEMA_MODE_RUNTIME_SAFE_NO_SHAPE);
  const fullRegressed = full && full.predictionDiagnostics
    ? Number(full.predictionDiagnostics.hardExactRegressed || 0)
    : null;
  const noShapeRegressed = noShape && noShape.predictionDiagnostics
    ? Number(noShape.predictionDiagnostics.hardExactRegressed || 0)
    : null;
  if (fullRegressed != null && noShapeRegressed != null && noShapeRegressed < fullRegressed) {
    return {
      status: 'not-ready',
      recommendation: 'replace-derived-shape-with-native-hand-structure-features',
      preferredMode: noShape.mode,
      reasons: ['no-shape-reduced-hard-exact-regressions']
    };
  }
  return {
    status: 'not-ready',
    recommendation: 'improve-runtime-safe-state-representation-before-scale-up',
    reasons: ['no-schema-produced-safe-protected-override']
  };
}

function buildReport(args, parts) {
  return {
    source: 'h13f-hard-mortal-ranker-ablation',
    generatedAt: Date.now(),
    config: {
      trainDataset: path.resolve(args.trainDataset),
      heldoutDataset: path.resolve(args.heldoutDataset),
      featureSchemaModes: args.featureSchemaModes,
      rounds: args.rounds,
      python: args.python,
      allowLeakySchema: Boolean(args.allowLeakySchema)
    },
    heldoutBaseline: parts.heldoutBaseline,
    results: parts.results,
    conclusion: buildRecommendation(parts.results)
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  reportProgress(args, 'start', {
    trainDataset: path.resolve(args.trainDataset),
    heldoutDataset: path.resolve(args.heldoutDataset),
    modes: args.featureSchemaModes
  });
  const heldoutRows = rankerApi.readJsonl(args.heldoutDataset);
  const heldoutBaseline = rankerApi.evaluateRankerDatasetRows(heldoutRows);
  const results = args.featureSchemaModes.map((mode) => runAblationMode(args, mode, heldoutBaseline));
  const report = buildReport(args, {
    heldoutBaseline,
    results
  });
  fs.writeFileSync(path.resolve(args.out), JSON.stringify(report, null, 2).concat('\n'), 'utf8');
  reportProgress(args, 'written', {
    out: path.resolve(args.out),
    recommendation: report.conclusion && report.conclusion.recommendation
  });
  console.log(JSON.stringify({
    out: path.resolve(args.out),
    conclusion: report.conclusion,
    modes: results.map((result) => ({
      mode: result.mode,
      status: result.status,
      exactRate: result.modelAlwaysPick && result.modelAlwaysPick.exactRate,
      large: result.modelAlwaysPick && result.modelAlwaysPick.large,
      hardExactRegressed: result.predictionDiagnostics && result.predictionDiagnostics.hardExactRegressed,
      gate: result.gate && result.gate.status
    }))
  }, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  DEFAULT_TRAIN_DATASET,
  DEFAULT_HELDOUT_DATASET,
  DEFAULT_OUT,
  DEFAULT_MODEL_ROOT,
  DEFAULT_PREDICTION_DIR,
  parseArgs,
  buildReport,
  buildRecommendation,
  runAblationMode,
  main
};
