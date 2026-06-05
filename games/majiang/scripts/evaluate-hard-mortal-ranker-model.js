'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const rankerApi = require('./lib/hard-mortal-ranker-dataset');
const trainingApi = require('./lib/hard-mortal-ranker-training');
const {
  DEFAULT_MODEL_DIR,
  checkLightgbm
} = require('./train-hard-mortal-ranker');

function parseArgs(argv = []) {
  const args = {
    help: false,
    dataset: rankerApi.DEFAULT_DATASET_PATH,
    modelDir: DEFAULT_MODEL_DIR,
    out: null,
    predictionOut: null,
    python: process.env.PYTHON || 'python3'
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
    if (token === '--model-dir') {
      args.modelDir = String(argv[index + 1] || '').trim() || args.modelDir;
      index += 1;
      continue;
    }
    if (token === '--out') {
      args.out = String(argv[index + 1] || '').trim() || null;
      index += 1;
      continue;
    }
    if (token === '--prediction-out') {
      args.predictionOut = String(argv[index + 1] || '').trim() || null;
      index += 1;
      continue;
    }
    if (token === '--python') {
      args.python = String(argv[index + 1] || '').trim() || args.python;
      index += 1;
    }
  }
  return args;
}

function printHelp() {
  console.log('Usage: node games/majiang/scripts/evaluate-hard-mortal-ranker-model.js [options]');
  console.log('');
  console.log('Options:');
  console.log('  --dataset <path>    Input JSONL dataset. Default: /tmp/h13-mortal-ranker-dataset.jsonl');
  console.log('  --model-dir <path>  Model directory from train-hard-mortal-ranker.js. Default: /tmp/h13b-ranker-model');
  console.log('  --out <path>        Optional output JSON path.');
  console.log('  --prediction-out <path>');
  console.log('                      Optional per-state prediction diagnostics JSON path.');
  console.log('  --python <cmd>      Python command. Default: $PYTHON or python3.');
}

function readFeatureSchema(modelDir) {
  const metadataPath = path.resolve(modelDir, 'metadata.json');
  if (!fs.existsSync(metadataPath)) return trainingApi.getFeatureSchema();
  try {
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    return metadata && metadata.featureSchema ? metadata.featureSchema : trainingApi.getFeatureSchema();
  } catch (error) {
    return trainingApi.getFeatureSchema();
  }
}

function buildEvaluationProgram() {
  return String.raw`
import json
import math
import os
import sys

import lightgbm as lgb
import numpy as np

dataset_path = sys.argv[1]
model_path = sys.argv[2]
feature_schema = json.loads(sys.argv[3])
prediction_out_path = sys.argv[4] or ''

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

def make_features(row, schema):
    values = [number_value(get_path(row, path)) for path in schema.get('numericFeaturePaths') or []]
    for feature in schema.get('oneHotFeatures') or []:
        value = category_value(get_path(row, feature.get('path')))
        categories = list(feature.get('categories') or [])
        if value not in categories:
            value = 'unknown' if 'unknown' in categories else value
        values.extend([1.0 if value == category else 0.0 for category in categories])
    return values

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

rows = []
with open(dataset_path, 'r', encoding='utf8') as handle:
    for line in handle:
        line = line.strip()
        if line:
            rows.append(json.loads(line))

if not rows:
    raise SystemExit('empty dataset')

model = lgb.Booster(model_file=model_path)
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
    x = np.asarray([make_features(row, feature_schema) for row in state_rows], dtype=float)
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
    'modelPath': os.path.abspath(model_path),
    'states': always_pick['states'],
    'candidateRows': len(rows),
    'exact': always_pick['exact'],
    'near': always_pick['near'],
    'medium': always_pick['medium'],
    'large': always_pick['large'],
    'unknown': always_pick['unknown'],
    'exactRate': always_pick['exactRate'],
    'nearOrExactRate': always_pick['nearOrExactRate'],
    'mediumOrBetterRate': always_pick['mediumOrBetterRate'],
    'largeRate': always_pick['largeRate'],
    'bucketCounts': always_pick['bucketCounts'],
    'bucketLargeCounts': always_pick['bucketLargeCounts'],
    'averageQDelta': always_pick['averageQDelta'],
    'currentHardBaseline': current_hard,
    'modelAlwaysPick': always_pick,
    'confidenceOverrideSweep': sweep,
    'recommendedOverrideGate': recommended_gate,
    'predictionDiagnostics': prediction_diagnostics,
}
if prediction_out_path:
    with open(prediction_out_path, 'w', encoding='utf8') as handle:
        json.dump({
            'source': 'hard-mortal-ranker-prediction-diagnostics',
            'dataset': os.path.abspath(dataset_path),
            'modelPath': os.path.abspath(model_path),
            'states': len(prediction_rows),
            'summary': prediction_diagnostics,
            'rows': prediction_rows,
        }, handle, indent=2)
        handle.write('\n')
print(json.dumps(summary, indent=2))
`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const modelPath = path.resolve(args.modelDir, 'model.txt');
  if (!fs.existsSync(modelPath)) {
    console.log(JSON.stringify({
      status: 'skipped',
      reason: 'missing-model',
      modelPath
    }, null, 2));
    return;
  }
  if (!checkLightgbm(args.python)) {
    console.log(JSON.stringify({
      status: 'skipped',
      reason: 'missing-lightgbm',
      python: args.python
    }, null, 2));
    return;
  }

  const featureSchema = readFeatureSchema(args.modelDir);
  const programPath = path.join(os.tmpdir(), `h13b-eval-ranker-${Date.now()}.py`);
  fs.writeFileSync(programPath, buildEvaluationProgram(), 'utf8');
  const result = spawnSync(args.python, [
    programPath,
    path.resolve(args.dataset),
    modelPath,
    JSON.stringify(featureSchema),
    args.predictionOut ? path.resolve(args.predictionOut) : ''
  ], {
    encoding: 'utf8'
  });
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) process.exit(result.status || 1);
  if (args.out) {
    fs.writeFileSync(path.resolve(args.out), result.stdout, 'utf8');
  }
  process.stdout.write(result.stdout);
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArgs,
  readFeatureSchema,
  buildEvaluationProgram,
  main
};
