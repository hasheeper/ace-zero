'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { SingleRoundRuntime } = require('../engine/runtime/single-round-runtime');
const {
  createCompositeDrawPolicy,
  createScriptedDrawPolicy
} = require('../engine/base/draw-policy');
const { createLuckDrawPolicy } = require('../engine/base/luck-draw-policy');
const {
  buildLuckRegressionReport,
  countAuditMismatches,
  countNonFiniteWeights,
  probabilityOf,
  writeLuckRegressionReport
} = require('./lib/luck-regression-metrics');

const PROJECT_DIR = path.resolve(__dirname, '..');
const BASE_CONFIG = JSON.parse(fs.readFileSync(path.join(PROJECT_DIR, 'game-config.json'), 'utf8'));
const DEFAULT_SEED_COUNT = 40;
const DEFAULT_DRAW_COUNT = 3;
const LIVE_WALL = ['m1', 'p1', 'm1', 'p1', 'm1', 'p1', 's1', 's1', 'm2', 'p2', 's2', 's3'];
const INITIAL_HANDS = [
  ['m4', 'm5', 'm6', 'm7', 'm8', 'm9', 'p4', 'p5', 'p6', 's4', 's5', 'z1', 'z1'],
  ['m3', 'm4', 'm5', 'p3', 'p4', 'p5', 's4', 's5', 's6', 'z2', 'z2', 'z3', 'z3'],
  ['m6', 'm7', 'm8', 'p6', 'p7', 'p8', 's6', 's7', 's8', 'z4', 'z4', 'z5', 'z5'],
  ['m9', 'p7', 'p8', 'p9', 's7', 's8', 's9', 'z6', 'z6', 'z7', 'z7', 'm3', 'p3']
];

function pass(name, options = {}) {
  if (!options.silent) console.log(`[PASS] ${name}`);
}

function getEnvInteger(name, fallback) {
  const requested = Number(process.env[name] || fallback);
  return Math.max(1, Math.floor(Number.isFinite(requested) ? requested : fallback));
}

function getSeedCount() {
  return getEnvInteger('LUCK_REGRESSION_SEEDS', DEFAULT_SEED_COUNT);
}

function getDrawCount() {
  return Math.min(getEnvInteger('LUCK_REGRESSION_DRAWS', DEFAULT_DRAW_COUNT), LIVE_WALL.length);
}

function createRuntime(drawPolicy) {
  const compositePolicy = createCompositeDrawPolicy([
    createScriptedDrawPolicy({ initialHands: INITIAL_HANDS }),
    drawPolicy
  ]);
  return new SingleRoundRuntime({
    ...BASE_CONFIG,
    drawPolicy: compositePolicy,
    testing: {
      runtimeSetup: {
        liveWallTiles: LIVE_WALL.slice()
      }
    }
  });
}

function getLastPayload(runtime, type = 'tile:draw') {
  const event = runtime.eventLog.slice().reverse().find((entry) => entry.type === type);
  return event ? event.payload : null;
}

function passAllPendingReactions(runtime) {
  const seatOrder = ['right', 'top', 'left', 'bottom'];
  seatOrder.forEach((seatKey) => {
    if (!runtime.pendingReaction || !Array.isArray(runtime.pendingReaction.actions)) return;
    const hasSeatAction = runtime.pendingReaction.actions.some((action) => (
      action
      && action.payload
      && action.payload.seat === seatKey
    ));
    if (hasSeatAction) {
      runtime.passReaction(seatKey, { reason: 'validate-luck-regression-matrix-pass' });
    }
  });
}

function decrementCount(counts, tileCode) {
  assert(counts[tileCode] > 0, `drawn tile did not exist in expected live wall: ${tileCode}`);
  counts[tileCode] -= 1;
}

function buildCounts(tiles) {
  return tiles.reduce((result, tileCode) => {
    result[tileCode] = (result[tileCode] || 0) + 1;
    return result;
  }, {});
}

function assertFiniteAudit(audit) {
  assert(audit && Array.isArray(audit.candidates), `expected audit with candidates, got ${JSON.stringify(audit)}`);
  audit.candidates.forEach((candidate) => {
    assert(Number.isFinite(candidate.finalWeight), `expected finite finalWeight, got ${JSON.stringify(candidate)}`);
    assert(candidate.finalWeight >= 0, `expected nonnegative finalWeight, got ${JSON.stringify(candidate)}`);
    assert(Number.isFinite(candidate.baseWeight), `expected finite baseWeight, got ${JSON.stringify(candidate)}`);
    assert(candidate.baseWeight >= 0, `expected nonnegative baseWeight, got ${JSON.stringify(candidate)}`);
  });
}

function createPolicy(seed, activeForces) {
  return createLuckDrawPolicy({
    id: `luck-matrix-${seed}`,
    seed,
    activeForces,
    objectiveIntentBySeat: {
      bottom: { speed: 1, value: 0, safety: 0, commit: 0, pressure: 0, confidence: 1 }
    },
    windStateBySeat: {
      bottom: { mode: 'speed', intensity: 'medium' }
    },
    candidateLocalValues: {
      m1: { speed: 1 },
      p1: { speed: -1 },
      s1: { speed: 0 },
      m2: { speed: 0.4 },
      p2: { speed: -0.4 },
      s2: { speed: 0.1 },
      s3: { speed: 0.1 }
    },
    auditLimit: 100
  });
}

function runSequence(seed, activeForces, options = {}) {
  const drawCount = Math.max(1, Math.floor(Number(options.drawCount || DEFAULT_DRAW_COUNT)));
  const scenario = options.scenario || 'unknown';
  const policy = createPolicy(seed, activeForces);
  const runtime = createRuntime(policy);
  const expectedCounts = buildCounts(LIVE_WALL);
  const tiles = [];
  const rolls = [];
  let invalidDrawCount = 0;

  runtime.start();

  for (let index = 0; index < drawCount; index += 1) {
    runtime.drawTile('bottom');
    const payload = getLastPayload(runtime);
    assert(payload && payload.tileCode, `expected draw payload on draw ${index}, got ${JSON.stringify(payload)}`);
    assert(payload.remaining >= 0, `expected nonnegative remaining, got ${JSON.stringify(payload)}`);
    try {
      decrementCount(expectedCounts, payload.tileCode);
    } catch (error) {
      invalidDrawCount += 1;
      throw error;
    }

    const audit = policy.getAuditLog().slice(-1)[0];
    assertFiniteAudit(audit);
    assert.strictEqual(audit.selectedTileCode, payload.tileCode, `expected audit selected tile to match payload, got ${JSON.stringify({ audit, payload })}`);
    assert.strictEqual(audit.randomRoll, payload.meta.randomRoll, `expected payload roll to match audit, got ${JSON.stringify({ audit, payload })}`);

    tiles.push(payload.tileCode);
    rolls.push(audit.randomRoll);

    runtime.discardTile('bottom', payload.tileCode);
    passAllPendingReactions(runtime);
  }

  const audits = policy.getAuditLog();
  return {
    scenario,
    seed,
    tiles,
    rolls,
    audits,
    invalidDrawCount,
    nonFiniteWeightCount: countNonFiniteWeights(audits),
    auditMismatchCount: countAuditMismatches({ tiles, rolls, audits })
  };
}

function validateReplayAndSafety(seedCount, drawCount, options = {}) {
  const rows = [];
  for (let index = 0; index < seedCount; index += 1) {
    const seed = `matrix-seed-${index}`;
    const activeForces = [{ id: 'fortune-a', kind: 'fortune', power: 100 }];
    const first = runSequence(seed, activeForces, { scenario: 'fortune-replay', drawCount });
    const replay = runSequence(seed, activeForces, { scenario: 'fortune-replay', drawCount });
    const replayMatched = JSON.stringify(replay.tiles) === JSON.stringify(first.tiles)
      && JSON.stringify(replay.rolls) === JSON.stringify(first.rolls);
    first.replayMatched = replayMatched;
    first.replayTiles = replay.tiles;
    first.replayRolls = replay.rolls;
    assert.deepStrictEqual(replay.tiles, first.tiles, `expected same tile sequence for seed ${seed}`);
    assert.deepStrictEqual(replay.rolls, first.rolls, `expected same roll sequence for seed ${seed}`);
    rows.push(first);
  }
  pass(`luck-regression replay-and-safety seeds=${seedCount} draws=${drawCount}`, options);
  return rows;
}

function validateBiasDirection(seedCount, drawCount, options = {}) {
  const rows = [];
  let fortuneHighProbability = 0;
  let fortuneLowProbability = 0;
  let curseHighProbability = 0;
  let curseLowProbability = 0;
  let fortuneGap = 0;
  let voidGap = 0;

  for (let index = 0; index < seedCount; index += 1) {
    const seed = `bias-seed-${index}`;
    const fortune = runSequence(seed, [{ id: 'fortune-a', kind: 'fortune', power: 100 }], {
      scenario: 'fortune',
      drawCount
    });
    const curse = runSequence(seed, [{ id: 'curse-a', kind: 'curse', power: 100 }], {
      scenario: 'curse',
      drawCount
    });
    const voided = runSequence(seed, [
      { id: 'fortune-a', kind: 'fortune', power: 100 },
      { id: 'void-a', kind: 'void', power: 50 }
    ], {
      scenario: 'void',
      drawCount
    });

    const fortuneAudit = fortune.audits[0];
    const curseAudit = curse.audits[0];
    const voidAudit = voided.audits[0];
    fortuneHighProbability += probabilityOf(fortuneAudit, 'm1');
    fortuneLowProbability += probabilityOf(fortuneAudit, 'p1');
    curseHighProbability += probabilityOf(curseAudit, 'm1');
    curseLowProbability += probabilityOf(curseAudit, 'p1');
    fortuneGap += probabilityOf(fortuneAudit, 'm1') - probabilityOf(fortuneAudit, 'p1');
    voidGap += probabilityOf(voidAudit, 'm1') - probabilityOf(voidAudit, 'p1');
    rows.push(fortune, curse, voided);
  }

  assert(
    fortuneHighProbability > fortuneLowProbability,
    `expected fortune to favor high-score group, got ${JSON.stringify({ fortuneHighProbability, fortuneLowProbability })}`
  );
  assert(
    curseLowProbability > curseHighProbability,
    `expected curse to favor low-score group, got ${JSON.stringify({ curseHighProbability, curseLowProbability })}`
  );
  assert(
    voidGap > 0 && voidGap < fortuneGap,
    `expected void to dampen fortune gap, got ${JSON.stringify({ fortuneGap, voidGap })}`
  );
  pass(`luck-regression bias-direction seeds=${seedCount} draws=${drawCount}`, options);
  return rows;
}

function runLuckRegressionMatrix(options = {}) {
  const seedCount = Math.max(1, Math.floor(Number(options.seedCount || getSeedCount())));
  const drawCount = Math.min(
    Math.max(1, Math.floor(Number(options.drawCount || getDrawCount()))),
    LIVE_WALL.length
  );
  const replayRows = validateReplayAndSafety(seedCount, drawCount, options);
  const biasRows = validateBiasDirection(seedCount, drawCount, options);
  const rows = replayRows.concat(biasRows);
  const report = buildLuckRegressionReport(rows, {
    source: options.source || 'validate-luck-regression-matrix',
    seedCount,
    drawCount,
    highTile: 'm1',
    lowTile: 'p1'
  });
  if (options.reportPath) {
    const writtenPath = writeLuckRegressionReport(report, options.reportPath);
    if (!options.silent) console.log(`  report=${writtenPath}`);
  }
  if (!options.silent) {
    console.log(`  snapshot=${JSON.stringify(report.summary)}`);
  }
  return report;
}

function main() {
  runLuckRegressionMatrix({
    seedCount: getSeedCount(),
    drawCount: getDrawCount(),
    reportPath: process.env.LUCK_REGRESSION_REPORT || null
  });
}

if (require.main === module) {
  main();
}

module.exports = {
  INITIAL_HANDS,
  LIVE_WALL,
  runLuckRegressionMatrix,
  runSequence,
  validateBiasDirection,
  validateReplayAndSafety
};
