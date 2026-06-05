'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const benchmarkApi = require('./benchmark-hard-vs-mortal');
const rankerApi = require('./lib/hard-mortal-ranker-dataset');
const trainingApi = require('./lib/hard-mortal-ranker-training');

const DEFAULT_SAMPLES_PER_SEAT = 20;
const DEFAULT_HELDOUT_SAMPLES_PER_SEAT = 10;

function parseSeedList(value, fallback) {
  const parsed = String(value || '')
    .split(',')
    .map((entry) => Number(entry.trim()))
    .filter((entry) => Number.isFinite(entry))
    .map((entry) => Math.floor(entry));
  return parsed.length ? parsed : fallback.slice();
}

function parseNumber(value, fallback, min = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.floor(number));
}

function parseArgs(argv = []) {
  const args = {
    help: false,
    smoke: false,
    trainSeeds: trainingApi.DEFAULT_TRAIN_SEEDS.slice(),
    heldoutSeeds: trainingApi.DEFAULT_HELDOUT_SEEDS.slice(),
    samplesPerSeat: DEFAULT_SAMPLES_PER_SEAT,
    heldoutSamplesPerSeat: DEFAULT_HELDOUT_SAMPLES_PER_SEAT,
    mortalConfig: 'real',
    mortalConfigProvided: false,
    rounds: 80,
    python: process.env.PYTHON || 'python3',
    featureSchemaMode: trainingApi.DEFAULT_FEATURE_SCHEMA_MODE,
    allowLeakySchema: false,
    progress: false,
    trainReport: trainingApi.DEFAULT_TRAIN_REPORT_PATH,
    heldoutReport: trainingApi.DEFAULT_HELDOUT_REPORT_PATH,
    trainDataset: trainingApi.DEFAULT_TRAIN_DATASET_PATH,
    heldoutDataset: trainingApi.DEFAULT_HELDOUT_DATASET_PATH,
    modelDir: trainingApi.DEFAULT_MODEL_DIR,
    heldoutEval: trainingApi.DEFAULT_HELDOUT_EVAL_PATH,
    predictionOut: trainingApi.DEFAULT_PREDICTION_DIAGNOSTICS_PATH,
    out: trainingApi.DEFAULT_EXPERIMENT_REPORT_PATH
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }
    if (token === '--smoke') {
      args.smoke = true;
      continue;
    }
    if (token === '--train-seeds') {
      args.trainSeeds = parseSeedList(argv[index + 1], args.trainSeeds);
      index += 1;
      continue;
    }
    if (token === '--heldout-seeds') {
      args.heldoutSeeds = parseSeedList(argv[index + 1], args.heldoutSeeds);
      index += 1;
      continue;
    }
    if (token === '--samples-per-seat') {
      args.samplesPerSeat = parseNumber(argv[index + 1], args.samplesPerSeat);
      index += 1;
      continue;
    }
    if (token === '--heldout-samples-per-seat') {
      args.heldoutSamplesPerSeat = parseNumber(argv[index + 1], args.heldoutSamplesPerSeat);
      index += 1;
      continue;
    }
    if (token === '--mortal-config') {
      args.mortalConfig = String(argv[index + 1] || '').trim() || args.mortalConfig;
      args.mortalConfigProvided = true;
      index += 1;
      continue;
    }
    if (token === '--rounds') {
      args.rounds = parseNumber(argv[index + 1], args.rounds);
      index += 1;
      continue;
    }
    if (token === '--python') {
      args.python = String(argv[index + 1] || '').trim() || args.python;
      index += 1;
      continue;
    }
    if (token === '--feature-schema-mode') {
      args.featureSchemaMode = trainingApi.normalizeFeatureSchemaMode(argv[index + 1]);
      index += 1;
      continue;
    }
    if (token === '--allow-leaky-schema') {
      args.allowLeakySchema = true;
      continue;
    }
    if (token === '--progress') {
      args.progress = true;
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
    if (token === '--model-dir') {
      args.modelDir = String(argv[index + 1] || '').trim() || args.modelDir;
      index += 1;
      continue;
    }
    if (token === '--heldout-eval') {
      args.heldoutEval = String(argv[index + 1] || '').trim() || args.heldoutEval;
      index += 1;
      continue;
    }
    if (token === '--prediction-out') {
      args.predictionOut = String(argv[index + 1] || '').trim() || args.predictionOut;
      index += 1;
      continue;
    }
    if (token === '--out') {
      args.out = String(argv[index + 1] || '').trim() || args.out;
      index += 1;
    }
  }

  if (args.smoke) {
    args.trainSeeds = trainingApi.DEFAULT_SMOKE_TRAIN_SEEDS.slice();
    args.heldoutSeeds = trainingApi.DEFAULT_SMOKE_HELDOUT_SEEDS.slice();
    args.samplesPerSeat = 1;
    args.heldoutSamplesPerSeat = 1;
    args.rounds = Math.min(args.rounds, 5);
    if (!args.mortalConfigProvided) args.mortalConfig = 'smoke';
  }

  return args;
}

function printHelp() {
  console.log('Usage: node games/majiang/scripts/run-hard-mortal-ranker-experiment.js [options]');
  console.log('');
  console.log('Options:');
  console.log('  --smoke                         Use smoke Mortal config and tiny train/heldout samples.');
  console.log('  --samples-per-seat <n>          Train samples per target seat. Default: 20.');
  console.log('  --heldout-samples-per-seat <n>  Heldout samples per target seat. Default: 10.');
  console.log('  --train-seeds <a,b,c>           Train seed set.');
  console.log('  --heldout-seeds <a,b,c>         Heldout seed set.');
  console.log('  --mortal-config real|smoke|path Default: real, smoke with --smoke.');
  console.log('  --rounds <n>                    LightGBM rounds. Default: 80, max 5 in smoke.');
  console.log('  --python <cmd>                  Python command. Default: $PYTHON or python3.');
  console.log('  --feature-schema-mode <runtime-safe|legacy>');
  console.log('                                  Feature schema mode. Default: runtime-safe.');
  console.log('  --allow-leaky-schema            Allow legacy/leaky schema for historical experiments.');
  console.log('  --progress                      Print progress updates to stderr.');
  console.log('  --out <path>                    Experiment report path. Default: /tmp/h13b-ranker-experiment-report.json');
  console.log('  --prediction-out <path>         Optional heldout per-state prediction diagnostics path.');
}

function reportProgress(args, message, details = {}) {
  if (!args || !args.progress) return;
  const suffix = Object.keys(details).length ? ` ${JSON.stringify(details)}` : '';
  console.error(`[h13-ranker-experiment] ${message}${suffix}`);
}

function writeJson(filePath, value) {
  fs.writeFileSync(path.resolve(filePath), JSON.stringify(value, null, 2).concat('\n'), 'utf8');
}

function buildBenchmarkArgs(args, split) {
  const seeds = split === 'train' ? args.trainSeeds : args.heldoutSeeds;
  const samplesPerSeat = split === 'train' ? args.samplesPerSeat : args.heldoutSamplesPerSeat;
  return benchmarkApi.parseArgs([
    ...(args.smoke ? ['--smoke'] : []),
    '--target-difficulty',
    'hard',
    '--opponent-difficulty',
    'normal',
    '--layout',
    'rotate-target',
    '--samples-per-seat',
    String(samplesPerSeat),
    '--seeds',
    seeds.join(','),
    '--mortal-config',
    args.mortalConfig,
    '--top',
    '0',
    ...(args.progress ? ['--progress'] : [])
  ]);
}

function buildReportAndDataset(args, split) {
  const reportPath = split === 'train' ? args.trainReport : args.heldoutReport;
  const datasetPath = split === 'train' ? args.trainDataset : args.heldoutDataset;
  reportProgress(args, 'benchmark-start', {
    split,
    reportPath: path.resolve(reportPath),
    datasetPath: path.resolve(datasetPath)
  });
  const report = benchmarkApi.buildBenchmarkReport(buildBenchmarkArgs(args, split));
  writeJson(reportPath, report);
  reportProgress(args, 'benchmark-report-written', {
    split,
    rows: report && report.summary ? report.summary.total : null
  });
  const dataset = rankerApi.buildRankerDatasetFromReports([{
    path: path.resolve(reportPath),
    report
  }]);
  rankerApi.assertCompactDatasetRows(dataset.candidateRows);
  rankerApi.writeJsonl(datasetPath, dataset.candidateRows);
  reportProgress(args, 'dataset-written', {
    split,
    states: dataset.summary && dataset.summary.includedStates,
    candidateRows: dataset.summary && dataset.summary.candidateRows
  });
  return {
    reportPath: path.resolve(reportPath),
    datasetPath: path.resolve(datasetPath),
    reportSummary: report.summary,
    reportSeverity: report.severity,
    datasetSummary: dataset.summary
  };
}

function parseJsonOutput(stdout) {
  const text = String(stdout || '').trim();
  if (!text) return null;
  return JSON.parse(text);
}

function runTraining(args) {
  const scriptPath = path.resolve(__dirname, 'train-hard-mortal-ranker.js');
  reportProgress(args, 'training-start', {
    trainDataset: path.resolve(args.trainDataset),
    heldoutDataset: path.resolve(args.heldoutDataset),
    modelDir: path.resolve(args.modelDir)
  });
  const result = spawnSync(process.execPath, [
    scriptPath,
    '--dataset',
    path.resolve(args.trainDataset),
    '--heldout-dataset',
    path.resolve(args.heldoutDataset),
    '--out-dir',
    path.resolve(args.modelDir),
    '--eval-out',
    path.resolve(args.heldoutEval),
    '--prediction-out',
    path.resolve(args.predictionOut),
    '--rounds',
    String(args.rounds),
    '--python',
    args.python,
    '--feature-schema-mode',
    args.featureSchemaMode,
    ...(args.allowLeakySchema ? ['--allow-leaky-schema'] : [])
  ], {
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    return {
      status: 'failed',
      exitCode: result.status,
      stdout: result.stdout || '',
      stderr: result.stderr || ''
    };
  }
  try {
    const parsed = parseJsonOutput(result.stdout) || {
      status: 'unknown',
      stdout: result.stdout || ''
    };
    reportProgress(args, 'training-done', {
      status: parsed && parsed.status
    });
    return parsed;
  } catch (error) {
    return {
      status: 'failed',
      reason: 'invalid-training-json',
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      error: error.message
    };
  }
}

function buildExperimentReport(args, parts) {
  const gate = trainingApi.summarizeModelGate(parts.heldoutBaseline, parts.modelEvaluation || parts.trainingResult);
  const featureSchema = trainingApi.getFeatureSchema(args.featureSchemaMode);
  const leakageCheck = trainingApi.validateFeatureSchemaNoLeakage(featureSchema);
  const modelEvaluation = parts.modelEvaluation || null;
  return {
    source: 'h13b-hard-mortal-ranker-experiment',
    generatedAt: Date.now(),
    smoke: Boolean(args.smoke),
    config: {
      trainSeeds: args.trainSeeds,
      heldoutSeeds: args.heldoutSeeds,
      samplesPerSeat: args.samplesPerSeat,
      heldoutSamplesPerSeat: args.heldoutSamplesPerSeat,
      mortalConfig: args.mortalConfig,
      rounds: args.rounds,
      python: args.python,
      featureSchemaMode: args.featureSchemaMode,
      allowLeakySchema: Boolean(args.allowLeakySchema),
      featureSchema
    },
    featureSchemaMode: args.featureSchemaMode,
    leakageCheck,
    paths: {
      trainReport: path.resolve(args.trainReport),
      heldoutReport: path.resolve(args.heldoutReport),
      trainDataset: path.resolve(args.trainDataset),
      heldoutDataset: path.resolve(args.heldoutDataset),
      modelDir: path.resolve(args.modelDir),
      heldoutEval: path.resolve(args.heldoutEval),
      predictionOut: path.resolve(args.predictionOut)
    },
    train: parts.train,
    heldout: parts.heldout,
    heldoutBaseline: parts.heldoutBaseline,
    trainingResult: parts.trainingResult,
    modelEvaluation,
    modelAlwaysPick: modelEvaluation && modelEvaluation.modelAlwaysPick ? modelEvaluation.modelAlwaysPick : modelEvaluation,
    confidenceOverrideSweep: modelEvaluation && Array.isArray(modelEvaluation.confidenceOverrideSweep)
      ? modelEvaluation.confidenceOverrideSweep
      : [],
    recommendedOverrideGate: modelEvaluation && modelEvaluation.recommendedOverrideGate
      ? modelEvaluation.recommendedOverrideGate
      : null,
    predictionDiagnostics: modelEvaluation && modelEvaluation.predictionDiagnostics
      ? modelEvaluation.predictionDiagnostics
      : null,
    gate
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  reportProgress(args, 'experiment-start', {
    samplesPerSeat: args.samplesPerSeat,
    heldoutSamplesPerSeat: args.heldoutSamplesPerSeat,
    mortalConfig: args.mortalConfig,
    featureSchemaMode: args.featureSchemaMode,
    out: path.resolve(args.out)
  });
  const train = buildReportAndDataset(args, 'train');
  const heldout = buildReportAndDataset(args, 'heldout');
  const heldoutRows = rankerApi.readJsonl(args.heldoutDataset);
  const heldoutBaseline = rankerApi.evaluateRankerDatasetRows(heldoutRows);
  const trainingResult = runTraining(args);
  let modelEvaluation = trainingResult && trainingResult.heldoutEvaluation ? trainingResult.heldoutEvaluation : null;
  if (!modelEvaluation && fs.existsSync(path.resolve(args.heldoutEval))) {
    modelEvaluation = JSON.parse(fs.readFileSync(path.resolve(args.heldoutEval), 'utf8'));
  }
  const report = buildExperimentReport(args, {
    train,
    heldout,
    heldoutBaseline,
    trainingResult,
    modelEvaluation
  });
  writeJson(args.out, report);
  reportProgress(args, 'experiment-report-written', {
    out: path.resolve(args.out),
    gate: report.gate && report.gate.status
  });
  console.log(JSON.stringify({
    out: path.resolve(args.out),
    gate: report.gate,
    trainStates: train.datasetSummary.includedStates,
    heldoutStates: heldout.datasetSummary.includedStates,
    trainingStatus: trainingResult && trainingResult.status
  }, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  DEFAULT_SAMPLES_PER_SEAT,
  DEFAULT_HELDOUT_SAMPLES_PER_SEAT,
  parseArgs,
  buildBenchmarkArgs,
  buildReportAndDataset,
  buildExperimentReport,
  main
};
