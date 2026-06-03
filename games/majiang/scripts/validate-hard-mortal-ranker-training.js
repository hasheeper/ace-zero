'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const rankerApi = require('./lib/hard-mortal-ranker-dataset');
const trainingApi = require('./lib/hard-mortal-ranker-training');
const trainApi = require('./train-hard-mortal-ranker');
const experimentApi = require('./run-hard-mortal-ranker-experiment');
const ablationApi = require('./run-hard-mortal-ranker-ablation');
const nativeExperimentApi = require('./run-hard-mortal-ranker-native-experiment');
const {
  makeHardCandidate,
  makeReportRow
} = require('./validate-hard-mortal-ranker-dataset');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function writeFixtureDataset(filePath, variant = 'train') {
  const report = {
    rows: [
      makeReportRow(`${variant}-best-cleanup`, {
        localTile: 'm9',
        bestTile: 's9',
        qDelta: 0.25
      }),
      makeReportRow(`${variant}-current-exact`, {
        localTile: 's9',
        bestTile: 's9',
        severityLevel: 'exact',
        qDelta: 0
      }),
      makeReportRow(`${variant}-ev-target`, {
        localTile: 'm9',
        bestTile: 's9',
        qDelta: 0.25,
        hardCandidateDiagnostics: [
          makeHardCandidate('m9', {
            tileIndex: 0,
            selectedFinal: true,
            hardEvScore: 90,
            shapeScore: 0,
            shapeRole: 'isolated-terminal'
          }),
          makeHardCandidate('s9', {
            tileIndex: 1,
            hardEvScore: 180,
            shapeScore: 10,
            shapeRole: 'weak-floating'
          }),
          makeHardCandidate('m5', {
            tileIndex: 2,
            hardEvScore: 70,
            shapeScore: -8,
            shapeRole: 'central-five'
          })
        ]
      })
    ]
  };
  const dataset = rankerApi.buildRankerDatasetFromReports([{
    path: `/tmp/${variant}-fixture-report.json`,
    report
  }]);
  rankerApi.writeJsonl(filePath, dataset.candidateRows);
  return dataset;
}

function writeFixtureReport(filePath, variant = 'train') {
  const report = {
    summary: {
      total: 3,
      exact: 1,
      large: 2
    },
    rows: [
      makeReportRow(`${variant}-best-cleanup`, {
        localTile: 'm9',
        bestTile: 's9',
        qDelta: 0.25
      }),
      makeReportRow(`${variant}-current-exact`, {
        localTile: 's9',
        bestTile: 's9',
        severityLevel: 'exact',
        qDelta: 0
      }),
      makeReportRow(`${variant}-ev-target`, {
        localTile: 'm9',
        bestTile: 's9',
        qDelta: 0.25,
        hardCandidateDiagnostics: [
          makeHardCandidate('m9', {
            tileIndex: 0,
            selectedFinal: true,
            hardEvScore: 90,
            shapeScore: 0,
            shapeRole: 'isolated-terminal'
          }),
          makeHardCandidate('s9', {
            tileIndex: 1,
            hardEvScore: 180,
            shapeScore: 10,
            shapeRole: 'weak-floating'
          }),
          makeHardCandidate('m5', {
            tileIndex: 2,
            hardEvScore: 70,
            shapeScore: -8,
            shapeRole: 'central-five'
          })
        ]
      })
    ]
  };
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2).concat('\n'), 'utf8');
  return report;
}

function parseJsonOutput(stdout) {
  const text = String(stdout || '').trim();
  assert(text, 'expected JSON stdout');
  return JSON.parse(text);
}

function validateFeatureSchema() {
  const schema = trainingApi.getFeatureSchema();
  const names = trainingApi.buildFeatureNames(schema);
  const leakageCheck = trainingApi.validateFeatureSchemaNoLeakage(schema);
  assert(schema.version === 'h13d-ranker-runtime-safe-feature-schema-v1', `unexpected schema version ${schema.version}`);
  assert(leakageCheck.ok, `expected clean runtime-safe schema, got ${JSON.stringify(leakageCheck)}`);
  assert(schema.numericFeaturePaths.includes('features.hardEvScore'), `expected hard EV feature, got ${JSON.stringify(schema)}`);
  assert(names.includes('features.tile.tileSuit=m'), `expected tile suit one-hot, got ${JSON.stringify(names)}`);
  assert(names.includes('features.bestWaitType=ryanmen'), `expected wait type one-hot, got ${JSON.stringify(names)}`);
  assert(names.includes('features.discardTileRole=isolated-terminal'), `expected shape role one-hot, got ${JSON.stringify(names)}`);
  assert(!names.includes('state.bucket=tile-choice'), `runtime-safe schema should omit bucket one-hot, got ${JSON.stringify(names)}`);
  assert(names.includes('features.tile.isRedFive=true'), `expected red five one-hot, got ${JSON.stringify(names)}`);

  const noShape = trainingApi.getFeatureSchema(trainingApi.FEATURE_SCHEMA_MODE_RUNTIME_SAFE_NO_SHAPE);
  const noShapeNames = trainingApi.buildFeatureNames(noShape);
  assert(noShape.version === 'h13f-ranker-runtime-safe-no-shape-feature-schema-v1', `unexpected no-shape schema ${noShape.version}`);
  assert(!noShape.numericFeaturePaths.includes('features.discardShapeScore'), `no-shape schema should omit shape score, got ${JSON.stringify(noShape)}`);
  assert(!noShapeNames.some((name) => name.startsWith('features.discardTileRole=')), `no-shape schema should omit discard role, got ${JSON.stringify(noShapeNames)}`);
  assert(trainingApi.validateFeatureSchemaNoLeakage(noShape).ok, `expected clean no-shape schema`);

  const coreOnly = trainingApi.getFeatureSchema(trainingApi.FEATURE_SCHEMA_MODE_RUNTIME_SAFE_CORE_ONLY);
  const coreNames = trainingApi.buildFeatureNames(coreOnly);
  assert(coreOnly.version === 'h13f-ranker-runtime-safe-core-only-feature-schema-v1', `unexpected core schema ${coreOnly.version}`);
  assert(coreOnly.numericFeaturePaths.includes('features.hardEvScore'), `core schema should keep hardEvScore`);
  assert(!coreOnly.numericFeaturePaths.includes('features.waitQualityScore'), `core schema should omit wait quality`);
  assert(!coreNames.some((name) => name.startsWith('features.bestWaitType=')), `core schema should omit wait type one-hot`);
  assert(trainingApi.validateFeatureSchemaNoLeakage(coreOnly).ok, `expected clean core schema`);

  const noHardEv = trainingApi.getFeatureSchema(trainingApi.FEATURE_SCHEMA_MODE_RUNTIME_SAFE_NO_HARD_EV);
  const noHardEvNames = trainingApi.buildFeatureNames(noHardEv);
  assert(noHardEv.version === 'h13f-ranker-runtime-safe-no-hard-ev-feature-schema-v1', `unexpected no-hard-ev schema ${noHardEv.version}`);
  assert(!noHardEv.numericFeaturePaths.includes('features.hardEvScore'), `no-hard-ev schema should omit hardEvScore`);
  assert(!noHardEv.numericFeaturePaths.includes('features.liveUkeireCount'), `no-hard-ev schema should omit live ukeire`);
  assert(!noHardEvNames.some((name) => name.startsWith('features.bestWaitType=')), `no-hard-ev schema should omit wait type one-hot`);
  assert(trainingApi.validateFeatureSchemaNoLeakage(noHardEv).ok, `expected clean no-hard-ev schema`);

  const native = trainingApi.getFeatureSchema(trainingApi.FEATURE_SCHEMA_MODE_RUNTIME_SAFE_NATIVE);
  const nativeNames = trainingApi.buildFeatureNames(native);
  assert(native.version === 'h13g-ranker-runtime-safe-native-feature-schema-v1', `unexpected native schema ${native.version}`);
  assert(native.numericFeaturePaths.includes('features.native.handTileCount'), `native schema missing handTileCount`);
  assert(native.numericFeaturePaths.includes('features.native.breaksRyanmenWindow'), `native schema missing route structure feature`);
  assert(nativeNames.includes('features.discardTileRole=isolated-terminal'), `native full schema should keep old shape role`);
  assert(trainingApi.validateFeatureSchemaNoLeakage(native).ok, `expected clean native schema`);

  const nativeNoShape = trainingApi.getFeatureSchema(trainingApi.FEATURE_SCHEMA_MODE_RUNTIME_SAFE_NATIVE_NO_SHAPE);
  const nativeNoShapeNames = trainingApi.buildFeatureNames(nativeNoShape);
  assert(nativeNoShape.version === 'h13g-ranker-runtime-safe-native-no-shape-feature-schema-v1', `unexpected native no-shape schema ${nativeNoShape.version}`);
  assert(nativeNoShape.numericFeaturePaths.includes('features.native.handTileCount'), `native no-shape schema missing handTileCount`);
  assert(!nativeNoShape.numericFeaturePaths.includes('features.discardShapeScore'), `native no-shape should omit shape score`);
  assert(!nativeNoShapeNames.some((name) => name.startsWith('features.discardTileRole=')), `native no-shape should omit old discard role`);
  assert(trainingApi.validateFeatureSchemaNoLeakage(nativeNoShape).ok, `expected clean native no-shape schema`);

  const legacy = trainingApi.getFeatureSchema(trainingApi.FEATURE_SCHEMA_MODE_LEGACY);
  const legacyNames = trainingApi.buildFeatureNames(legacy);
  const legacyLeakage = trainingApi.validateFeatureSchemaNoLeakage(legacy);
  assert(legacy.version === 'h13b-ranker-feature-schema-v1', `unexpected legacy schema version ${legacy.version}`);
  assert(legacyNames.includes('state.bucket=tile-choice'), `expected legacy bucket one-hot, got ${JSON.stringify(legacyNames)}`);
  assert(!legacyLeakage.ok, `expected legacy schema leakage, got ${JSON.stringify(legacyLeakage)}`);

  assert(trainingApi.relevanceFromQDelta(0) === 4, 'expected best relevance 4');
  assert(trainingApi.relevanceFromQDelta(0.03) === 3, 'expected near relevance 3');
  assert(trainingApi.relevanceFromQDelta(0.12) === 2, 'expected medium relevance 2');
  assert(trainingApi.relevanceFromQDelta(0.4) === 1, 'expected small-large relevance 1');
  assert(trainingApi.relevanceFromQDelta(0.8) === 0, 'expected bad relevance 0');
}

function validateLeakageGuard() {
  const result = spawnSync(process.execPath, [
    path.resolve(__dirname, 'train-hard-mortal-ranker.js'),
    '--dataset',
    '/tmp/h13b-training-fixture-missing.jsonl',
    '--feature-schema-mode',
    'legacy'
  ], {
    encoding: 'utf8'
  });
  assert(result.status !== 0, `expected legacy training to fail leakage guard, got ${JSON.stringify(result)}`);
  const output = parseJsonOutput(result.stderr);
  assert(output.reason === 'feature-schema-leakage', `expected feature-schema-leakage, got ${JSON.stringify(output)}`);
  assert(output.leakageCheck && output.leakageCheck.status === 'feature-schema-leakage', `expected leakage check, got ${JSON.stringify(output)}`);
}

function validateGate() {
  const baseline = {
    strategies: {
      'current-hard': {
        states: 100,
        exactRate: 0.67,
        large: 45,
        bucketCounts: {
          'riichi-missed': 1
        },
        bucketLargeCounts: {
          'tile-defense': 6
        }
      }
    }
  };
  const readyModel = {
    status: 'evaluated',
    states: 100,
    exactRate: 0.73,
    large: 39,
    bucketCounts: {
      'riichi-missed': 1
    },
    bucketLargeCounts: {
      'tile-defense': 6
    }
  };
  const readyGate = trainingApi.summarizeModelGate(baseline, readyModel);
  assert(readyGate.modelReadyForShadow === true, `expected ready gate, got ${JSON.stringify(readyGate)}`);

  const regressedModel = {
    status: 'evaluated',
    states: 100,
    exactRate: 0.68,
    large: 44,
    bucketCounts: {
      'riichi-missed': 2
    },
    bucketLargeCounts: {
      'tile-defense': 7
    }
  };
  const notReadyGate = trainingApi.summarizeModelGate(baseline, regressedModel);
  assert(notReadyGate.modelReadyForShadow === false, `expected not-ready gate, got ${JSON.stringify(notReadyGate)}`);
  assert(notReadyGate.failed.includes('model-did-not-beat-current-hard'), `expected beat failure, got ${JSON.stringify(notReadyGate)}`);
  assert(notReadyGate.failed.includes('tile-defense-large-regressed'), `expected defense failure, got ${JSON.stringify(notReadyGate)}`);
  assert(notReadyGate.failed.includes('riichi-missed-regressed'), `expected riichi failure, got ${JSON.stringify(notReadyGate)}`);
}

function validateTrainingScript() {
  const trainDatasetPath = '/tmp/h13b-training-fixture-train.jsonl';
  const heldoutDatasetPath = '/tmp/h13b-training-fixture-heldout.jsonl';
  const modelDir = '/tmp/h13b-training-fixture-model';
  const evalPath = '/tmp/h13b-training-fixture-eval.json';
  const predictionPath = '/tmp/h13b-training-fixture-predictions.json';
  writeFixtureDataset(trainDatasetPath, 'train');
  writeFixtureDataset(heldoutDatasetPath, 'heldout');

  const result = spawnSync(process.execPath, [
    path.resolve(__dirname, 'train-hard-mortal-ranker.js'),
    '--dataset',
    trainDatasetPath,
    '--heldout-dataset',
    heldoutDatasetPath,
    '--out-dir',
    modelDir,
    '--eval-out',
    evalPath,
    '--prediction-out',
    predictionPath,
    '--rounds',
    '2'
  ], {
    encoding: 'utf8'
  });
  assert(result.status === 0, `expected train script exit 0, got ${JSON.stringify({ status: result.status, stdout: result.stdout, stderr: result.stderr })}`);
  const output = parseJsonOutput(result.stdout);
  if (!trainApi.checkLightgbm(process.env.PYTHON || 'python3')) {
    assert(output.status === 'skipped', `expected skipped without LightGBM, got ${JSON.stringify(output)}`);
    assert(output.reason === 'missing-lightgbm', `expected missing-lightgbm, got ${JSON.stringify(output)}`);
    return {
      status: 'skipped',
      reason: output.reason
    };
  }

  assert(output.status === 'trained', `expected trained output, got ${JSON.stringify(output)}`);
  assert(output.featureSchema && output.featureSchema.version === 'h13d-ranker-runtime-safe-feature-schema-v1', `expected runtime-safe schema in output, got ${JSON.stringify(output)}`);
  assert(output.heldoutEvaluation && output.heldoutEvaluation.status !== 'skipped', `expected heldout eval, got ${JSON.stringify(output)}`);
  assert(output.heldoutEvaluation.modelAlwaysPick, `expected modelAlwaysPick, got ${JSON.stringify(output.heldoutEvaluation)}`);
  assert(Array.isArray(output.heldoutEvaluation.confidenceOverrideSweep), `expected confidenceOverrideSweep, got ${JSON.stringify(output.heldoutEvaluation)}`);
  assert(output.heldoutEvaluation.recommendedOverrideGate, `expected recommendedOverrideGate, got ${JSON.stringify(output.heldoutEvaluation)}`);
  assert(output.heldoutEvaluation.predictionDiagnostics, `expected predictionDiagnostics, got ${JSON.stringify(output.heldoutEvaluation)}`);
  assert(output.heldoutEvaluation.predictionDiagnostics.changed >= 0, `expected changed count, got ${JSON.stringify(output.heldoutEvaluation.predictionDiagnostics)}`);
  assert(fs.existsSync(path.join(modelDir, 'metadata.json')), `expected metadata at ${modelDir}`);
  assert(fs.existsSync(evalPath), `expected heldout eval at ${evalPath}`);
  assert(fs.existsSync(predictionPath), `expected prediction diagnostics at ${predictionPath}`);
  const predictionOutput = JSON.parse(fs.readFileSync(predictionPath, 'utf8'));
  assert(predictionOutput.summary && typeof predictionOutput.summary.hardExactRegressed === 'number', `expected prediction summary, got ${JSON.stringify(predictionOutput)}`);
  assert(Array.isArray(predictionOutput.rows) && predictionOutput.rows.length, `expected prediction rows, got ${JSON.stringify(predictionOutput)}`);
  return {
    status: 'trained',
    heldoutStates: output.heldoutEvaluation.states
  };
}

function validateExperimentReportShape(trainingStatus) {
  const heldoutRows = rankerApi.readJsonl('/tmp/h13b-training-fixture-heldout.jsonl');
  const heldoutBaseline = rankerApi.evaluateRankerDatasetRows(heldoutRows);
  const trainingResult = trainingStatus.status === 'trained'
    ? {
        status: 'trained',
        heldoutEvaluation: {
          status: 'evaluated',
          states: heldoutBaseline.states,
          exactRate: 1,
          large: 0,
          bucketCounts: {},
          bucketLargeCounts: {},
          modelAlwaysPick: {
            states: heldoutBaseline.states,
            exact: heldoutBaseline.states,
            large: 0
          },
          confidenceOverrideSweep: [],
          recommendedOverrideGate: {
            status: 'not-ready',
            mode: 'no-override'
          },
          predictionDiagnostics: {
            changed: 0,
            improved: 0,
            regressed: 0,
            hardExactRegressed: 0
          }
        }
      }
    : {
        status: 'skipped',
        reason: 'missing-lightgbm'
      };
  const report = experimentApi.buildExperimentReport(experimentApi.parseArgs(['--smoke']), {
    train: {
      datasetSummary: {
        includedStates: 3
      }
    },
    heldout: {
      datasetSummary: {
        includedStates: heldoutBaseline.states
      }
    },
    heldoutBaseline,
    trainingResult,
    modelEvaluation: trainingResult.heldoutEvaluation || null
  });
  assert(report.source === 'h13b-hard-mortal-ranker-experiment', `unexpected report source ${report.source}`);
  assert(report.config.featureSchema.version === 'h13d-ranker-runtime-safe-feature-schema-v1', `expected runtime-safe feature schema in report, got ${JSON.stringify(report.config)}`);
  assert(report.featureSchemaMode === 'runtime-safe', `expected runtime-safe mode, got ${JSON.stringify(report.config)}`);
  assert(report.leakageCheck && report.leakageCheck.ok, `expected clean leakage check, got ${JSON.stringify(report.leakageCheck)}`);
  assert(report.heldoutBaseline.strategies['current-hard'], `expected current-hard baseline, got ${JSON.stringify(report.heldoutBaseline)}`);
  if (trainingStatus.status === 'trained') {
    assert(report.modelAlwaysPick, `expected modelAlwaysPick in report, got ${JSON.stringify(report)}`);
    assert(Array.isArray(report.confidenceOverrideSweep), `expected confidenceOverrideSweep in report, got ${JSON.stringify(report)}`);
    assert(report.recommendedOverrideGate, `expected recommendedOverrideGate in report, got ${JSON.stringify(report)}`);
    assert(report.predictionDiagnostics, `expected predictionDiagnostics in report, got ${JSON.stringify(report)}`);
  } else {
    assert(Array.isArray(report.confidenceOverrideSweep), `expected empty confidenceOverrideSweep in skipped report, got ${JSON.stringify(report)}`);
  }
  assert(typeof report.gate.modelReadyForShadow === 'boolean', `expected gate boolean, got ${JSON.stringify(report.gate)}`);
}

function validateAblationRunner(trainingStatus) {
  const trainDatasetPath = '/tmp/h13f-ablation-fixture-train.jsonl';
  const heldoutDatasetPath = '/tmp/h13f-ablation-fixture-heldout.jsonl';
  const reportPath = '/tmp/h13f-ablation-fixture-report.json';
  const modelRoot = '/tmp/h13f-ablation-fixture-models';
  const predictionDir = '/tmp/h13f-ablation-fixture-predictions';
  writeFixtureDataset(trainDatasetPath, 'ablation-train');
  writeFixtureDataset(heldoutDatasetPath, 'ablation-heldout');

  const result = spawnSync(process.execPath, [
    path.resolve(__dirname, 'run-hard-mortal-ranker-ablation.js'),
    '--train-dataset',
    trainDatasetPath,
    '--heldout-dataset',
    heldoutDatasetPath,
    '--out',
    reportPath,
    '--model-root',
    modelRoot,
    '--prediction-dir',
    predictionDir,
    '--feature-schema-modes',
    'runtime-safe,runtime-safe-no-shape',
    '--rounds',
    '2'
  ], {
    encoding: 'utf8'
  });
  assert(result.status === 0, `expected ablation runner exit 0, got ${JSON.stringify({ status: result.status, stdout: result.stdout, stderr: result.stderr })}`);
  const output = parseJsonOutput(result.stdout);
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  assert(report.source === 'h13f-hard-mortal-ranker-ablation', `unexpected ablation report ${JSON.stringify(report)}`);
  assert(report.results.length === 2, `expected two ablation modes, got ${JSON.stringify(report.results)}`);
  assert(report.results.every((entry) => entry.leakageCheck && entry.leakageCheck.ok), `expected clean ablation schemas, got ${JSON.stringify(report.results)}`);
  assert(report.conclusion && report.conclusion.recommendation, `expected conclusion, got ${JSON.stringify(report)}`);
  assert(output.modes.length === 2, `expected output modes, got ${JSON.stringify(output)}`);
  if (trainingStatus.status === 'trained') {
    const trained = report.results.find((entry) => entry.status === 'trained');
    assert(trained, `expected trained ablation entry, got ${JSON.stringify(report.results)}`);
    assert(trained.predictionDiagnostics && typeof trained.predictionDiagnostics.hardExactRegressed === 'number', `expected ablation prediction diagnostics, got ${JSON.stringify(trained)}`);
  }
}

function validateNativeCoverageSweep() {
  const predictionRows = [
    {
      stateId: 'coverage-improve',
      bucket: 'tile-choice',
      changed: true,
      predictionMargin: 0.2,
      pressureScore: 0,
      currentHard: {
        tileCode: 'm5',
        qDeltaFromBest: 0.25,
        severity: 'large',
        features: {
          xiangting: 2,
          dangerScore: 0,
          native: {
            discardDoraCount: 0,
            discardRedFiveCount: 0,
            discardValueHonorCount: 0,
            discardIsFive: 1,
            breaksPair: 0,
            breaksTriplet: 0,
            breaksSequenceWindow: 0,
            breaksRyanmenWindow: 0,
            usefulConnectorBreak: 0
          }
        }
      },
      model: {
        tileCode: 's9',
        qDeltaFromBest: 0,
        severity: 'exact',
        features: {
          xiangting: 2,
          dangerScore: 0,
          native: {
            discardDoraCount: 0,
            discardRedFiveCount: 0,
            discardValueHonorCount: 0,
            discardIsFive: 0,
            breaksPair: 0,
            breaksTriplet: 0,
            breaksSequenceWindow: 0,
            breaksRyanmenWindow: 0,
            usefulConnectorBreak: 0
          }
        }
      }
    },
    {
      stateId: 'coverage-block-value',
      bucket: 'tile-choice',
      changed: true,
      predictionMargin: 0.2,
      pressureScore: 0,
      currentHard: {
        tileCode: 's9',
        qDeltaFromBest: 0,
        severity: 'exact',
        features: {
          xiangting: 2,
          dangerScore: 0,
          native: {
            discardDoraCount: 0,
            discardRedFiveCount: 0,
            discardValueHonorCount: 0,
            discardIsFive: 0,
            breaksPair: 0,
            breaksTriplet: 0,
            breaksSequenceWindow: 0,
            breaksRyanmenWindow: 0,
            usefulConnectorBreak: 0
          }
        }
      },
      model: {
        tileCode: 'm5',
        qDeltaFromBest: 0.25,
        severity: 'large',
        features: {
          xiangting: 2,
          dangerScore: 0,
          native: {
            discardDoraCount: 1,
            discardRedFiveCount: 0,
            discardValueHonorCount: 0,
            discardIsFive: 1,
            breaksPair: 0,
            breaksTriplet: 0,
            breaksSequenceWindow: 0,
            breaksRyanmenWindow: 0,
            usefulConnectorBreak: 0
          }
        }
      }
    }
  ];
  const coverage = nativeExperimentApi.computeNativeCoverageSweep(predictionRows, {
    exact: 1,
    large: 1
  });
  assert(Array.isArray(coverage.sweep) && coverage.sweep.length, `expected native coverage sweep, got ${JSON.stringify(coverage)}`);
  const margin01 = coverage.sweep.find((entry) => entry.margin === 0.1);
  assert(margin01.overrideCount === 1, `expected one safe override, got ${JSON.stringify(margin01)}`);
  assert(margin01.improved === 1, `expected improvement, got ${JSON.stringify(margin01)}`);
  assert(margin01.blockedReasons['cuts-higher-value:native.discardDoraCount'] === 1, `expected value block, got ${JSON.stringify(margin01.blockedReasons)}`);
}

function validateNativeRunner(trainingStatus) {
  const trainReportPath = '/tmp/h13g-native-fixture-train-report.json';
  const heldoutReportPath = '/tmp/h13g-native-fixture-heldout-report.json';
  const trainDatasetPath = '/tmp/h13g-native-fixture-train-dataset.jsonl';
  const heldoutDatasetPath = '/tmp/h13g-native-fixture-heldout-dataset.jsonl';
  const reportPath = '/tmp/h13g-native-fixture-report.json';
  const modelRoot = '/tmp/h13g-native-fixture-models';
  const predictionDir = '/tmp/h13g-native-fixture-predictions';
  writeFixtureReport(trainReportPath, 'native-train');
  writeFixtureReport(heldoutReportPath, 'native-heldout');

  const result = spawnSync(process.execPath, [
    path.resolve(__dirname, 'run-hard-mortal-ranker-native-experiment.js'),
    '--train-report',
    trainReportPath,
    '--heldout-report',
    heldoutReportPath,
    '--train-dataset',
    trainDatasetPath,
    '--heldout-dataset',
    heldoutDatasetPath,
    '--out',
    reportPath,
    '--model-root',
    modelRoot,
    '--prediction-dir',
    predictionDir,
    '--feature-schema-modes',
    'runtime-safe-native-v1,runtime-safe-native-no-shape',
    '--rounds',
    '2'
  ], {
    encoding: 'utf8'
  });
  assert(result.status === 0, `expected native runner exit 0, got ${JSON.stringify({ status: result.status, stdout: result.stdout, stderr: result.stderr })}`);
  const output = parseJsonOutput(result.stdout);
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  assert(report.source === 'h13g-hard-mortal-ranker-native-experiment', `unexpected native report ${JSON.stringify(report)}`);
  assert(report.train.datasetSummary.includedStates === 3, `expected native train states, got ${JSON.stringify(report.train.datasetSummary)}`);
  assert(report.heldout.datasetSummary.includedStates === 3, `expected native heldout states, got ${JSON.stringify(report.heldout.datasetSummary)}`);
  assert(report.results.length === 2, `expected two native modes, got ${JSON.stringify(report.results)}`);
  assert(report.results.every((entry) => entry.featureSchema.nativeNumericFeatureCount > 0), `expected native feature count, got ${JSON.stringify(report.results)}`);
  assert(report.results.every((entry) => entry.leakageCheck && entry.leakageCheck.ok), `expected clean native schemas, got ${JSON.stringify(report.results)}`);
  assert(report.conclusion && report.conclusion.recommendation, `expected native conclusion, got ${JSON.stringify(report)}`);
  assert(output.modes.length === 2, `expected native output modes, got ${JSON.stringify(output)}`);
  if (trainingStatus.status === 'trained') {
    const trained = report.results.find((entry) => entry.status === 'trained');
    assert(trained, `expected trained native entry, got ${JSON.stringify(report.results)}`);
    assert(Array.isArray(trained.nativeCoverageOverrideSweep), `expected native coverage sweep, got ${JSON.stringify(trained)}`);
    assert(trained.recommendedNativeCoverageGate, `expected native coverage gate, got ${JSON.stringify(trained)}`);
  }
}

function validateOverrideGateSelection() {
  const currentHard = {
    exact: 10,
    large: 5
  };
  const sweep = [
    {
      margin: 0,
      exact: 12,
      large: 4,
      overrideCount: 9,
      hardExactRegressed: 3
    },
    {
      margin: 0.1,
      exact: 11,
      large: 4,
      overrideCount: 5,
      hardExactRegressed: 2
    },
    {
      margin: 0.2,
      exact: 10,
      large: 5,
      overrideCount: 1,
      hardExactRegressed: 0
    }
  ];
  const ready = trainingApi.selectRecommendedOverrideGate(currentHard, sweep);
  assert(ready.status === 'ready', `expected ready override gate, got ${JSON.stringify(ready)}`);
  assert(ready.margin === 0.1, `expected protected margin 0.1, got ${JSON.stringify(ready)}`);

  const blocked = trainingApi.selectRecommendedOverrideGate(currentHard, [{
    margin: 0.05,
    exact: 12,
    large: 4,
    overrideCount: 9,
    hardExactRegressed: 3
  }]);
  assert(blocked.status === 'not-ready', `expected hard exact protection to block, got ${JSON.stringify(blocked)}`);
  assert(blocked.mode === 'no-override', `expected no-override, got ${JSON.stringify(blocked)}`);
}

function main() {
  validateFeatureSchema();
  validateLeakageGuard();
  validateGate();
  validateOverrideGateSelection();
  validateNativeCoverageSweep();
  const trainingStatus = validateTrainingScript();
  validateExperimentReportShape(trainingStatus);
  validateAblationRunner(trainingStatus);
  validateNativeRunner(trainingStatus);

  console.log('[PASS] hard-mortal-ranker-training-smoke');
  console.log(`  snapshot=${JSON.stringify({
    trainingStatus,
    featureCount: trainingApi.buildFeatureNames(trainingApi.getFeatureSchema()).length
  })}`);
}

if (require.main === module) {
  main();
}
