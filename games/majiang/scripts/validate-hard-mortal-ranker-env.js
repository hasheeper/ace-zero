'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const trainingApi = require('./lib/hard-mortal-ranker-training');
const setupApi = require('./setup-hard-mortal-ranker-env');
const trainApi = require('./train-hard-mortal-ranker');

function parseArgs(argv = []) {
  const args = {
    help: false,
    python: path.join(setupApi.DEFAULT_VENV_PATH, 'bin', 'python'),
    venv: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }
    if (token === '--python') {
      args.python = String(argv[index + 1] || '').trim() || args.python;
      index += 1;
      continue;
    }
    if (token === '--venv') {
      args.venv = String(argv[index + 1] || '').trim() || null;
      if (args.venv) args.python = path.join(path.resolve(args.venv), 'bin', 'python');
      index += 1;
    }
  }

  return args;
}

function printHelp() {
  console.log('Usage: node games/majiang/scripts/validate-hard-mortal-ranker-env.js [options]');
  console.log('');
  console.log('Options:');
  console.log('  --python <path>  Ranker venv Python. Default: /tmp/h13-ranker-venv/bin/python');
  console.log('  --venv <path>    Ranker venv path. Sets --python to <path>/bin/python.');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function run(command, args = [], options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    env: options.env || process.env
  });
  if (result.status !== 0) {
    const error = new Error(`Command failed: ${command} ${args.join(' ')}`);
    error.command = command;
    error.args = args;
    error.status = result.status;
    error.stdout = result.stdout || '';
    error.stderr = result.stderr || '';
    throw error;
  }
  return result;
}

function parseJson(stdout) {
  const text = String(stdout || '').trim();
  assert(text, 'expected JSON stdout');
  return JSON.parse(text);
}

function validatePython(python, env) {
  assert(fs.existsSync(python), `ranker Python does not exist: ${python}`);
  const result = run(python, ['-c', [
    'import json',
    'import sys',
    'import lightgbm',
    'print(json.dumps({"python": sys.executable, "pythonVersion": sys.version.split()[0], "lightgbmVersion": lightgbm.__version__}))'
  ].join('; ')], { env });
  return parseJson(result.stdout);
}

function validateFeatureSchema() {
  const schema = trainingApi.getFeatureSchema();
  const featureNames = trainingApi.buildFeatureNames(schema);
  const leakageCheck = trainingApi.validateFeatureSchemaNoLeakage(schema);
  assert(schema.version === 'h13d-ranker-runtime-safe-feature-schema-v1', `unexpected feature schema version: ${schema.version}`);
  assert(leakageCheck.ok, `expected runtime-safe schema, got ${JSON.stringify(leakageCheck)}`);
  assert(featureNames.includes('features.hardEvScore'), 'feature schema missing hardEvScore');
  assert(featureNames.includes('features.tile.tileSuit=m'), 'feature schema missing tile suit one-hot');
  assert(featureNames.includes('features.discardTileRole=isolated-terminal'), 'feature schema missing discard role one-hot');
  assert(!featureNames.some((name) => name.startsWith('state.bucket=')), `runtime-safe schema should omit state.bucket, got ${JSON.stringify(featureNames)}`);
  const nativeSchema = trainingApi.getFeatureSchema(trainingApi.FEATURE_SCHEMA_MODE_RUNTIME_SAFE_NATIVE);
  const nativeFeatureNames = trainingApi.buildFeatureNames(nativeSchema);
  assert(nativeFeatureNames.includes('features.native.handTileCount'), 'native feature schema missing handTileCount');
  assert(trainingApi.validateFeatureSchemaNoLeakage(nativeSchema).ok, 'native schema should pass leakage guard');
  return {
    version: schema.version,
    leakageCheck,
    numericFeatureCount: schema.numericFeaturePaths.length,
    oneHotFeatureCount: schema.oneHotFeatures.length,
    expandedFeatureCount: featureNames.length,
    nativeVersion: nativeSchema.version,
    nativeExpandedFeatureCount: nativeFeatureNames.length
  };
}

function validateHelp(scriptName) {
  const scriptPath = path.resolve(__dirname, scriptName);
  const result = run(process.execPath, [scriptPath, '--help']);
  const stdout = String(result.stdout || '');
  assert(stdout.includes('Usage:'), `${scriptName} --help did not print Usage`);
  return {
    script: scriptPath,
    ok: true
  };
}

function validateEnvironment(args) {
  const libomp = setupApi.resolveLibomp();
  const env = setupApi.buildPythonEnv(libomp);
  const pythonInfo = validatePython(path.resolve(args.python), env);
  assert(trainApi.checkLightgbm(path.resolve(args.python)), `train script cannot import LightGBM through ${args.python}`);

  return {
    status: 'ready',
    python: pythonInfo,
    libomp,
    featureSchema: validateFeatureSchema(),
    scripts: {
      trainHelp: validateHelp('train-hard-mortal-ranker.js'),
      evaluateHelp: validateHelp('evaluate-hard-mortal-ranker-model.js'),
      ablationHelp: validateHelp('run-hard-mortal-ranker-ablation.js'),
      nativeExperimentHelp: validateHelp('run-hard-mortal-ranker-native-experiment.js')
    },
    notes: [
      'This validates only the offline ranker training environment.',
      'It does not modify formal Mahjong AI behavior or Mortal conda environments.'
    ]
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  try {
    console.log(JSON.stringify(validateEnvironment(args), null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      status: 'failed',
      error: error.message,
      command: error.command || null,
      args: error.args || null,
      exitCode: error.status || null,
      stdout: error.stdout || '',
      stderr: error.stderr || ''
    }, null, 2));
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArgs,
  validateEnvironment,
  main
};
