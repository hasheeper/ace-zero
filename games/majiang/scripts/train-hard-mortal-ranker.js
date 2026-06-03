'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const rankerApi = require('./lib/hard-mortal-ranker-dataset');
const trainingApi = require('./lib/hard-mortal-ranker-training');

const DEFAULT_MODEL_DIR = trainingApi.DEFAULT_MODEL_DIR;
const NUMERIC_FEATURE_PATHS = trainingApi.NUMERIC_FEATURE_PATHS;
const FEATURE_SCHEMA = trainingApi.getFeatureSchema();

function parseArgs(argv = []) {
  const args = {
    help: false,
    dataset: rankerApi.DEFAULT_DATASET_PATH,
    heldoutDataset: null,
    outDir: DEFAULT_MODEL_DIR,
    evalOut: null,
    predictionOut: null,
    rounds: 80,
    python: process.env.PYTHON || 'python3',
    featureSchemaMode: trainingApi.DEFAULT_FEATURE_SCHEMA_MODE,
    allowLeakySchema: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }
    if (token === '--dataset') {
      args.dataset = String(argv[index + 1] || '').trim() || args.dataset;
      index += 1;
      continue;
    }
    if (token === '--heldout-dataset') {
      args.heldoutDataset = String(argv[index + 1] || '').trim() || null;
      index += 1;
      continue;
    }
    if (token === '--out-dir') {
      args.outDir = String(argv[index + 1] || '').trim() || args.outDir;
      index += 1;
      continue;
    }
    if (token === '--eval-out') {
      args.evalOut = String(argv[index + 1] || '').trim() || null;
      index += 1;
      continue;
    }
    if (token === '--prediction-out') {
      args.predictionOut = String(argv[index + 1] || '').trim() || null;
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
    if (token === '--feature-schema-mode') {
      args.featureSchemaMode = trainingApi.normalizeFeatureSchemaMode(argv[index + 1]);
      index += 1;
      continue;
    }
    if (token === '--allow-leaky-schema') {
      args.allowLeakySchema = true;
    }
  }
  return args;
}

function printHelp() {
  console.log('Usage: node games/majiang/scripts/train-hard-mortal-ranker.js [options]');
  console.log('');
  console.log('Options:');
  console.log('  --dataset <path>          Input train JSONL dataset. Default: /tmp/h13-mortal-ranker-dataset.jsonl');
  console.log('  --heldout-dataset <path>  Optional heldout JSONL dataset to evaluate after training.');
  console.log('  --out-dir <path>          Output model directory. Default: /tmp/h13b-ranker-model');
  console.log('  --eval-out <path>         Optional heldout evaluation JSON path.');
  console.log('  --prediction-out <path>   Optional heldout per-state prediction diagnostics JSON path.');
  console.log('  --rounds <n>              LightGBM boosting rounds. Default: 80.');
  console.log('  --python <cmd>            Python command. Default: $PYTHON or python3.');
  console.log('  --feature-schema-mode <runtime-safe|runtime-safe-native-v1|runtime-safe-native-no-shape|legacy>');
  console.log('                            Feature schema mode. Default: runtime-safe.');
  console.log('  --allow-leaky-schema      Allow legacy/leaky feature schema for historical experiments.');
}

function checkLightgbm(python) {
  const result = spawnSync(python, ['-c', 'import lightgbm'], {
    encoding: 'utf8'
  });
  return result.status === 0;
}

function buildTrainingProgram() {
  return String.raw`
import json
import math
import os
import sys

import lightgbm as lgb
import numpy as np

dataset_path = sys.argv[1]
out_dir = sys.argv[2]
rounds = int(sys.argv[3])
feature_schema = json.loads(sys.argv[4])
heldout_dataset_path = sys.argv[5] or ''
eval_out_path = sys.argv[6] or ''
prediction_out_path = sys.argv[7] or ''

def get_path(row, path):
    current = row
    for part in path.split('.'):
        if not isinstance(current, dict) or part not in current:
            return None
        current = current[part]
    return current

def number_value(value):
    if isinstance(value, bool):
        return 1.0 if value else 0.0
    try:
        value = float(value)
    except (TypeError, ValueError):
        return 0.0
    if math.isfinite(value):
        return value
    return 0.0

def category_value(value):
    if isinstance(value, bool):
        return 'true' if value else 'false'
    if value is None:
        return 'unknown'
    text = str(value)
    return text if text else 'unknown'

def feature_names(schema):
    names = list(schema.get('numericFeaturePaths') or [])
    for feature in schema.get('oneHotFeatures') or []:
        path = feature.get('path')
        for category in feature.get('categories') or []:
            names.append(f'{path}={category}')
    return names

def make_features(row, schema):
    values = [number_value(get_path(row, path)) for path in schema.get('numericFeaturePaths') or []]
    for feature in schema.get('oneHotFeatures') or []:
        value = category_value(get_path(row, feature.get('path')))
        categories = list(feature.get('categories') or [])
        if value not in categories:
            value = 'unknown' if 'unknown' in categories else value
        values.extend([1.0 if value == category else 0.0 for category in categories])
    return values

def relevance_from_q_delta(q_delta):
    try:
        q_delta = float(q_delta)
    except (TypeError, ValueError):
        return 0
    if q_delta <= 0:
        return 4
    if q_delta <= 0.05:
        return 3
    if q_delta <= 0.2:
        return 2
    if q_delta <= 0.5:
        return 1
    return 0

def severity(q_delta):
    try:
        q_delta = float(q_delta)
    except (TypeError, ValueError):
        return 'unknown'
    if q_delta <= 0:
        return 'exact'
    if q_delta <= 0.05:
        return 'near'
    if q_delta <= 0.2:
        return 'medium'
    return 'large'

def inc(target, key):
    target[key] = target.get(key, 0) + 1

def read_rows(file_path):
    rows = []
    with open(file_path, 'r', encoding='utf8') as handle:
        for line in handle:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows

def make_training_matrix(rows, schema):
    rows = sorted(rows, key=lambda row: (str(row.get('stateId') or ''), int((row.get('candidate') or {}).get('tileIndex') or 999)))
    x = []
    y = []
    groups = []
    last_state = None
    current_group = 0
    for row in rows:
        state_id = row.get('stateId')
        if last_state is None:
            last_state = state_id
        if state_id != last_state:
            groups.append(current_group)
            current_group = 0
            last_state = state_id
        x.append(make_features(row, schema))
        y.append(relevance_from_q_delta((row.get('label') or {}).get('qDeltaFromBest')))
        current_group += 1
    if current_group:
        groups.append(current_group)
    return x, y, groups

def evaluate_model(model, rows, schema, dataset_path):
    groups = {}
    for row in rows:
        groups.setdefault(str(row.get('stateId')), []).append(row)

    def create_summary(name):
        return {
            'name': name,
            'states': 0,
            'candidateRows': len(rows),
            'exact': 0,
            'near': 0,
            'medium': 0,
            'large': 0,
            'unknown': 0,
            'exactRate': 0,
            'nearOrExactRate': 0,
            'mediumOrBetterRate': 0,
            'largeRate': 0,
            'bucketCounts': {},
            'bucketLargeCounts': {},
            'averageQDelta': None,
            '_qDeltaTotal': 0.0,
            '_qDeltaCount': 0,
        }

    def record_pick(summary, pick, bucket):
        q_delta = (pick.get('label') or {}).get('qDeltaFromBest')
        level = severity(q_delta)
        summary['states'] += 1
        inc(summary, level)
        inc(summary['bucketCounts'], bucket)
        if level == 'large':
            inc(summary['bucketLargeCounts'], bucket)
        try:
            summary['_qDeltaTotal'] += float(q_delta)
            summary['_qDeltaCount'] += 1
        except (TypeError, ValueError):
            pass
        return level

    def finalize_summary(summary):
        states = summary['states']
        if states:
            summary['exactRate'] = round(summary['exact'] / states, 4)
            summary['nearOrExactRate'] = round((summary['exact'] + summary['near']) / states, 4)
            summary['mediumOrBetterRate'] = round((summary['exact'] + summary['near'] + summary['medium']) / states, 4)
            summary['largeRate'] = round(summary['large'] / states, 4)
        if summary['_qDeltaCount']:
            summary['averageQDelta'] = round(summary['_qDeltaTotal'] / summary['_qDeltaCount'], 6)
        del summary['_qDeltaTotal']
        del summary['_qDeltaCount']
        return summary

    def q_delta(row):
        try:
            return float((row.get('label') or {}).get('qDeltaFromBest'))
        except (TypeError, ValueError):
            return None

    def candidate_key(row):
        return (int((row.get('candidate') or {}).get('tileIndex') or 999), str((row.get('candidate') or {}).get('tileCode') or ''))

    def local_index(state_rows):
        for index, row in enumerate(state_rows):
            if (row.get('label') or {}).get('isLocalSelected'):
                return index
        return 0

    def best_prediction_index(state_rows, predictions):
        return max(range(len(state_rows)), key=lambda index: (float(predictions[index]), -candidate_key(state_rows[index])[0], candidate_key(state_rows[index])[1]))

    def compact_pick(row, prediction=None):
        if not row:
            return None
        label = row.get('label') or {}
        candidate = row.get('candidate') or {}
        q_value = label.get('mortalQValue')
        q_delta_value = label.get('qDeltaFromBest')
        return {
            'tileCode': candidate.get('tileCode'),
            'normalizedTileCode': candidate.get('normalizedTileCode'),
            'tileIndex': candidate.get('tileIndex'),
            'prediction': round(float(prediction), 6) if prediction is not None else None,
            'mortalQValue': q_value,
            'qDeltaFromBest': q_delta_value,
            'severity': severity(q_delta_value),
            'mortalRank': label.get('mortalRank'),
            'isMortalBest': bool(label.get('isMortalBest')),
            'features': row.get('features') or {},
        }

    def increment_nested(target, group, key):
        key = str(key if key is not None else 'unknown')
        target.setdefault(group, {})
        target[group][key] = target[group].get(key, 0) + 1

    def summarize_prediction_rows(prediction_rows):
        summary = {
            'states': len(prediction_rows),
            'changed': 0,
            'improved': 0,
            'regressed': 0,
            'same': 0,
            'hardExactRegressed': 0,
            'byBucket': {'changed': {}, 'improved': {}, 'regressed': {}, 'hardExactRegressed': {}},
            'byPressure': {'changed': {}, 'improved': {}, 'regressed': {}, 'hardExactRegressed': {}},
            'byXiangting': {'changed': {}, 'improved': {}, 'regressed': {}, 'hardExactRegressed': {}},
            'topRegressions': [],
            'topImprovements': [],
        }
        regressions = []
        improvements = []
        for item in prediction_rows:
            if not item.get('changed'):
                summary['same'] += 1
                continue
            bucket = item.get('bucket') or 'unknown'
            pressure = item.get('pressureState') or 'unknown'
            xiangting = item.get('localXiangting')
            summary['changed'] += 1
            increment_nested(summary['byBucket'], 'changed', bucket)
            increment_nested(summary['byPressure'], 'changed', pressure)
            increment_nested(summary['byXiangting'], 'changed', xiangting)
            delta_change = item.get('qDeltaChange')
            if delta_change is not None and delta_change < 0:
                summary['improved'] += 1
                increment_nested(summary['byBucket'], 'improved', bucket)
                increment_nested(summary['byPressure'], 'improved', pressure)
                increment_nested(summary['byXiangting'], 'improved', xiangting)
                improvements.append(item)
            elif delta_change is not None and delta_change > 0:
                summary['regressed'] += 1
                increment_nested(summary['byBucket'], 'regressed', bucket)
                increment_nested(summary['byPressure'], 'regressed', pressure)
                increment_nested(summary['byXiangting'], 'regressed', xiangting)
                regressions.append(item)
            else:
                summary['same'] += 1
            if (
                (item.get('currentHard') or {}).get('severity') == 'exact'
                and (item.get('model') or {}).get('severity') != 'exact'
            ):
                summary['hardExactRegressed'] += 1
                increment_nested(summary['byBucket'], 'hardExactRegressed', bucket)
                increment_nested(summary['byPressure'], 'hardExactRegressed', pressure)
                increment_nested(summary['byXiangting'], 'hardExactRegressed', xiangting)
        summary['topRegressions'] = sorted(
            regressions,
            key=lambda item: float(item.get('qDeltaChange') or 0),
            reverse=True
        )[:10]
        summary['topImprovements'] = sorted(
            improvements,
            key=lambda item: float(item.get('qDeltaChange') or 0)
        )[:10]
        return summary

    current_hard = create_summary('current-hard')
    always_pick = create_summary('model-always-pick')
    prediction_rows = []
    margin_values = [0.0, 0.05, 0.1, 0.15, 0.2, 0.3, 0.5]
    sweep = []
    for margin in margin_values:
        item = create_summary('model-confidence-override-hard')
        item['margin'] = margin
        item['overrideCount'] = 0
        item['improved'] = 0
        item['regressed'] = 0
        item['same'] = 0
        item['hardExactRegressed'] = 0
        sweep.append(item)

    for state_id, state_rows in groups.items():
        x = np.asarray([make_features(row, schema) for row in state_rows], dtype=float)
        predictions = model.predict(x)
        model_index = best_prediction_index(state_rows, predictions)
        local_idx = local_index(state_rows)
        model_pick = state_rows[model_index]
        local_pick = state_rows[local_idx]
        mortal_best_pick = next((row for row in state_rows if (row.get('label') or {}).get('isMortalBest')), None)
        bucket = (state_rows[0].get('state') or {}).get('bucket') or 'unknown'

        local_level = record_pick(current_hard, local_pick, bucket)
        record_pick(always_pick, model_pick, bucket)

        local_q = q_delta(local_pick)
        model_q = q_delta(model_pick)
        margin = float(predictions[model_index]) - float(predictions[local_idx])
        state = state_rows[0].get('state') or {}
        prediction_rows.append({
            'stateId': state_id,
            'rowId': state_rows[0].get('rowId'),
            'seed': state_rows[0].get('seed'),
            'targetSeat': state_rows[0].get('targetSeat'),
            'roundIndex': state_rows[0].get('roundIndex'),
            'bucket': bucket,
            'pressureState': state.get('pressureState') or 'unknown',
            'pressureScore': state.get('pressureScore'),
            'localXiangting': state.get('localXiangting'),
            'remaining': state.get('remaining'),
            'changed': model_index != local_idx,
            'predictionMargin': round(margin, 6),
            'qDeltaChange': round(model_q - local_q, 6) if local_q is not None and model_q is not None else None,
            'currentHard': compact_pick(local_pick, predictions[local_idx]),
            'model': compact_pick(model_pick, predictions[model_index]),
            'mortalBest': compact_pick(mortal_best_pick, None),
        })
        for item in sweep:
            should_override = model_index != local_idx and margin >= item['margin']
            pick = model_pick if should_override else local_pick
            pick_level = record_pick(item, pick, bucket)
            if should_override:
                item['overrideCount'] += 1
            pick_q = q_delta(pick)
            if local_q is None or pick_q is None or abs(pick_q - local_q) < 1e-12:
                item['same'] += 1
            elif pick_q < local_q:
                item['improved'] += 1
            else:
                item['regressed'] += 1
            if local_level == 'exact' and pick_level != 'exact':
                item['hardExactRegressed'] += 1

    current_hard = finalize_summary(current_hard)
    always_pick = finalize_summary(always_pick)
    sweep = [finalize_summary(item) for item in sweep]
    prediction_diagnostics = summarize_prediction_rows(prediction_rows)

    eligible = [
        item for item in sweep
        if item.get('hardExactRegressed', 0) <= 2
        and (
            item.get('exact', 0) > current_hard.get('exact', 0)
            or item.get('large', 0) < current_hard.get('large', 0)
        )
    ]
    if eligible:
        recommended = sorted(
            eligible,
            key=lambda item: (
                -int(item.get('exact', 0)),
                int(item.get('large', 0)),
                int(item.get('hardExactRegressed', 0)),
                -int(item.get('overrideCount', 0)),
                float(item.get('margin', 0)),
            )
        )[0]
        recommended_gate = {
            'status': 'ready',
            'mode': 'model-confidence-override-hard',
            'margin': recommended.get('margin'),
            'summary': recommended,
            'reasons': ['protected-override-beats-current-hard']
        }
    else:
        recommended_gate = {
            'status': 'not-ready',
            'mode': 'no-override',
            'margin': None,
            'summary': current_hard,
            'reasons': ['no-margin-beats-current-hard-with-hard-exact-protection']
        }

    summary = {
        'status': 'evaluated',
        'source': 'hard-mortal-ranker-model-eval',
        'dataset': os.path.abspath(dataset_path),
        'states': always_pick['states'],
        'candidateRows': len(rows),
        'exact': 0,
        'near': 0,
        'medium': 0,
        'large': 0,
        'unknown': 0,
        'exactRate': 0,
        'nearOrExactRate': 0,
        'mediumOrBetterRate': 0,
        'largeRate': 0,
        'bucketCounts': {},
        'bucketLargeCounts': {},
        'averageQDelta': None,
        'currentHardBaseline': current_hard,
        'modelAlwaysPick': always_pick,
        'confidenceOverrideSweep': sweep,
        'recommendedOverrideGate': recommended_gate,
        'predictionDiagnostics': prediction_diagnostics,
    }
    for key in ['exact', 'near', 'medium', 'large', 'unknown', 'exactRate', 'nearOrExactRate', 'mediumOrBetterRate', 'largeRate', 'bucketCounts', 'bucketLargeCounts', 'averageQDelta']:
        summary[key] = always_pick[key]
    if prediction_out_path:
        with open(prediction_out_path, 'w', encoding='utf8') as handle:
            json.dump({
                'source': 'hard-mortal-ranker-prediction-diagnostics',
                'dataset': os.path.abspath(dataset_path),
                'states': len(prediction_rows),
                'summary': prediction_diagnostics,
                'rows': prediction_rows,
            }, handle, indent=2)
            handle.write('\n')
    return summary

rows = read_rows(dataset_path)
if not rows:
    raise SystemExit('empty train dataset')

x, y, groups = make_training_matrix(rows, feature_schema)
feature_name_list = feature_names(feature_schema)
train = lgb.Dataset(
    np.asarray(x, dtype=float),
    label=np.asarray(y, dtype=float),
    group=groups,
    feature_name=feature_name_list,
)
params = {
    'objective': 'lambdarank',
    'metric': 'ndcg',
    'verbosity': -1,
    'learning_rate': 0.05,
    'num_leaves': 15,
    'min_data_in_leaf': 5,
    'seed': 20260602,
}
model = lgb.train(params, train, num_boost_round=rounds)
os.makedirs(out_dir, exist_ok=True)
model_path = os.path.join(out_dir, 'model.txt')
model.save_model(model_path)
metadata = {
    'source': 'h13b-hard-mortal-ranker-lightgbm',
    'dataset': os.path.abspath(dataset_path),
    'heldoutDataset': os.path.abspath(heldout_dataset_path) if heldout_dataset_path else None,
    'modelPath': model_path,
    'candidateRows': len(rows),
    'states': len(groups),
    'featureSchema': feature_schema,
    'featureNames': feature_name_list,
    'label': 'q-delta-relevance: best=4 near=3 medium=2 small-large=1 bad=0',
    'rounds': rounds,
}
heldout_eval = None
if heldout_dataset_path:
    heldout_rows = read_rows(heldout_dataset_path)
    heldout_eval = evaluate_model(model, heldout_rows, feature_schema, heldout_dataset_path)
    heldout_eval['modelPath'] = model_path
    if eval_out_path:
        with open(eval_out_path, 'w', encoding='utf8') as handle:
            json.dump(heldout_eval, handle, indent=2)
            handle.write('\n')
with open(os.path.join(out_dir, 'metadata.json'), 'w', encoding='utf8') as handle:
    json.dump(metadata, handle, indent=2)
    handle.write('\n')
print(json.dumps({'status': 'trained', **metadata, 'heldoutEvaluation': heldout_eval}, indent=2))
`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const featureSchema = trainingApi.getFeatureSchema(args.featureSchemaMode);
  const leakageCheck = trainingApi.validateFeatureSchemaNoLeakage(featureSchema);
  if (!leakageCheck.ok && !args.allowLeakySchema) {
    console.error(JSON.stringify({
      status: 'failed',
      reason: 'feature-schema-leakage',
      featureSchemaMode: args.featureSchemaMode,
      leakageCheck
    }, null, 2));
    process.exit(1);
  }

  if (!checkLightgbm(args.python)) {
    console.log(JSON.stringify({
      status: 'skipped',
      reason: 'missing-lightgbm',
      message: 'Install lightgbm in an isolated ranker Python environment, e.g. /tmp/h13-ranker-venv.',
      python: args.python,
      recommendedVenv: '/tmp/h13-ranker-venv'
    }, null, 2));
    return;
  }

  fs.mkdirSync(args.outDir, { recursive: true });
  const programPath = path.join(os.tmpdir(), `h13b-train-ranker-${Date.now()}.py`);
  fs.writeFileSync(programPath, buildTrainingProgram(), 'utf8');
  const result = spawnSync(args.python, [
    programPath,
    path.resolve(args.dataset),
    path.resolve(args.outDir),
    String(args.rounds),
    JSON.stringify(featureSchema),
    args.heldoutDataset ? path.resolve(args.heldoutDataset) : '',
    args.evalOut ? path.resolve(args.evalOut) : '',
    args.predictionOut ? path.resolve(args.predictionOut) : ''
  ], {
    encoding: 'utf8'
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) process.exit(result.status || 1);
}

if (require.main === module) {
  main();
}

module.exports = {
  DEFAULT_MODEL_DIR,
  NUMERIC_FEATURE_PATHS,
  FEATURE_SCHEMA,
  parseArgs,
  checkLightgbm,
  buildTrainingProgram,
  main
};
