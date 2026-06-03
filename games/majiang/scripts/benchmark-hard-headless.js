'use strict';

const fs = require('fs');
const path = require('path');

const coreAdapter = require('../engine/base/majiang-core-adapter');
const { SingleRoundRuntime, ROUND_PHASES } = require('../engine/runtime/single-round-runtime');
const discardEvaluatorApi = require('../engine/ai/discard-evaluator');
const callEvaluatorApi = require('../engine/ai/evaluators/call-evaluator');
const { getActionPriority } = require('../shared/runtime/reaction/reaction-priority');

const SEATS = ['bottom', 'right', 'top', 'left'];
const DEFAULT_PROMOTION_SEEDS = Object.freeze([
  20260531,
  20260607,
  20260614,
  20260621,
  20260628,
  20260705,
  20260712,
  20260719,
  20260726,
  20260802,
  20260809,
  20260816
]);
const PROMOTION_THRESHOLDS = Object.freeze({
  maxHardRuntimeErrors: 0,
  maxDeterministicRegressions: 0,
  minHardHuleRateDelta: -0.05
});

function parseArgs(argv) {
  const args = {
    seed: 20260531,
    rounds: 8,
    promotionReport: false,
    seeds: null,
    roundsProvided: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }
    if (token === '--seed') {
      args.seed = Number(argv[index + 1]);
      index += 1;
      continue;
    }
    if (token === '--seeds') {
      args.seeds = String(argv[index + 1] || '')
        .split(',')
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isFinite(value))
        .map((value) => Math.floor(value));
      index += 1;
      continue;
    }
    if (token === '--rounds') {
      args.rounds = Number(argv[index + 1]);
      args.roundsProvided = true;
      index += 1;
      continue;
    }
    if (token === '--promotion-report') {
      args.promotionReport = true;
    }
  }

  args.seed = Number.isFinite(args.seed) ? Math.floor(args.seed) : 20260531;
  args.rounds = Number.isFinite(args.rounds) ? Math.max(1, Math.floor(args.rounds)) : 8;
  if (args.promotionReport && !args.roundsProvided) {
    args.rounds = 1;
  }
  if (!Array.isArray(args.seeds) || !args.seeds.length) {
    args.seeds = args.promotionReport ? DEFAULT_PROMOTION_SEEDS.slice() : [args.seed];
  }
  return args;
}

function createSeededRandom(seed) {
  let state = seed >>> 0;
  return function nextRandom() {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function buildTileWall(seed) {
  const tiles = [];
  ['m', 'p', 's'].forEach((suit) => {
    for (let rank = 1; rank <= 9; rank += 1) {
      for (let copy = 0; copy < 4; copy += 1) {
        tiles.push(`${suit}${rank}`);
      }
    }
  });
  for (let rank = 1; rank <= 7; rank += 1) {
    for (let copy = 0; copy < 4; copy += 1) {
      tiles.push(`z${rank}`);
    }
  }

  const random = createSeededRandom(seed);
  for (let index = tiles.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const current = tiles[index];
    tiles[index] = tiles[swapIndex];
    tiles[swapIndex] = current;
  }
  return tiles;
}

function loadBaseConfig() {
  return JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'game-config.json'), 'utf8'));
}

function createSeededRuntime(config, seed) {
  const rule = coreAdapter.createRule(config.ruleOverrides || {});
  const shan = new coreAdapter.Majiang.Shan(rule);
  shan._pai = buildTileWall(seed);
  return new SingleRoundRuntime({
    ...config,
    shan,
    logger: () => {}
  });
}

function getPhase(runtime) {
  return runtime && runtime.stateMachine && typeof runtime.stateMachine.getPhase === 'function'
    ? runtime.stateMachine.getPhase()
    : null;
}

function chooseDiscard(runtime, seatKey, difficulty) {
  return discardEvaluatorApi.evaluateRuntimeDiscard(runtime, seatKey, {
    difficulty,
    profile: 'default'
  });
}

function getReactionSeats(runtime) {
  const actions = runtime && runtime.pendingReaction && Array.isArray(runtime.pendingReaction.actions)
    ? runtime.pendingReaction.actions
    : [];
  return Array.from(new Set(actions.map((action) => (
    action && action.payload && action.payload.seat
      ? action.payload.seat
      : null
  )).filter(Boolean)));
}

function passSeat(runtime, seatKey) {
  if (runtime && runtime.pendingReaction && seatKey) {
    runtime.passReaction(seatKey, { reason: 'hard-headless-benchmark-pass' });
  }
}

function sortActiveReactionActions(runtime) {
  const pending = runtime && runtime.pendingReaction ? runtime.pendingReaction : null;
  const passedSeats = pending && Array.isArray(pending.passedSeats) ? pending.passedSeats : [];
  const actions = pending && Array.isArray(pending.actions) ? pending.actions : [];
  return actions
    .filter((action) => (
      action
      && action.type !== 'pass'
      && action.payload
      && !passedSeats.includes(action.payload.seat)
    ))
    .sort((left, right) => (
      getActionPriority(right) - getActionPriority(left)
      || Number(left.reactionOrder || 0) - Number(right.reactionOrder || 0)
      || String(left.key || '').localeCompare(String(right.key || ''))
    ));
}

function handleReaction(runtime, difficulty, counters) {
  while (runtime && runtime.pendingReaction && getPhase(runtime) === ROUND_PHASES.AWAIT_REACTION) {
    const sortedActions = sortActiveReactionActions(runtime);
    if (!sortedActions.length) {
      getReactionSeats(runtime).forEach((seatKey) => passSeat(runtime, seatKey));
      return;
    }

    const topAction = sortedActions[0];
    const seatKey = topAction && topAction.payload ? topAction.payload.seat : null;
    if (!seatKey) return;

    if (topAction.type === 'hule') {
      runtime.resolveHule(seatKey, {
        ...topAction.payload,
        finalizeImmediately: true
      });
      return;
    }

    const seatActions = sortedActions.filter((action) => (
      action && action.payload && action.payload.seat === seatKey
    ));
    const callDecision = callEvaluatorApi.evaluateCalls(runtime, seatKey, seatActions, {
      difficulty,
      profile: 'default'
    });

    if (callDecision && callDecision.action) {
      runtime.dispatch(callDecision.action);
      counters.calls += 1;
      return;
    }

    passSeat(runtime, seatKey);
  }
}

function runOneRound(config, difficulty, seed) {
  const runtime = createSeededRuntime(config, seed);
  const counters = {
    draws: 0,
    discards: 0,
    riichi: 0,
    calls: 0,
    errors: []
  };

  runtime.start();

  for (let step = 0; step < 500; step += 1) {
    const phase = getPhase(runtime);
    if (phase === ROUND_PHASES.ROUND_END) break;

    try {
      if (phase === ROUND_PHASES.AWAIT_DRAW) {
        const seatKey = runtime.getCurrentTurnSeat();
        if (runtime.getWallState().remaining <= 0) {
          runtime.resolveDraw('benchmark-exhaustive-draw');
          break;
        }
        runtime.drawTile(seatKey);
        counters.draws += 1;
        if (runtime.canSeatHule(seatKey, {})) {
          runtime.resolveHule(seatKey, { finalizeImmediately: true });
          break;
        }
        continue;
      }

      if (phase === ROUND_PHASES.AWAIT_DISCARD) {
        const seatKey = runtime.getCurrentTurnSeat();
        if (runtime.canSeatHule(seatKey, {})) {
          runtime.resolveHule(seatKey, { finalizeImmediately: true });
          break;
        }

        const decision = chooseDiscard(runtime, seatKey, difficulty);
        const handCodes = runtime.getSeatHandCodes(seatKey);
        const tileCode = decision && decision.tileCode
          ? decision.tileCode
          : handCodes[handCodes.length - 1];
        const shouldRiichi = Boolean(decision && decision.shouldRiichi);
        runtime.discardTile(seatKey, tileCode, {
          riichi: shouldRiichi
        });
        counters.discards += 1;
        if (shouldRiichi) counters.riichi += 1;
        continue;
      }

      if (phase === ROUND_PHASES.AWAIT_REACTION) {
        handleReaction(runtime, difficulty, counters);
        continue;
      }

      counters.errors.push(`unsupported phase: ${phase}`);
      break;
    } catch (error) {
      counters.errors.push(error && error.message ? error.message : String(error));
      break;
    }
  }

  return {
    seed,
    difficulty,
    phase: getPhase(runtime),
    completed: getPhase(runtime) === ROUND_PHASES.ROUND_END,
    counters,
    scores: runtime.getScoreMap(),
    roundResult: runtime.roundResult || null
  };
}

function average(numbers) {
  const values = numbers.filter((value) => Number.isFinite(Number(value))).map(Number);
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function rate(count, total) {
  return total > 0 ? count / total : 0;
}

function summarizeRows(rows) {
  const total = rows.length;
  const completed = rows.filter((row) => row.completed).length;
  const huleRows = rows.filter((row) => row.roundResult && row.roundResult.type === 'hule');
  const dealInRows = huleRows.filter((row) => row.roundResult && row.roundResult.fromSeat);
  const drawRows = rows.filter((row) => row.roundResult && row.roundResult.type === 'draw');
  const totalRiichi = rows.reduce((sum, row) => sum + Number(row.counters.riichi || 0), 0);
  const totalCalls = rows.reduce((sum, row) => sum + Number(row.counters.calls || 0), 0);
  const totalDiscards = rows.reduce((sum, row) => sum + Number(row.counters.discards || 0), 0);
  const errors = rows.flatMap((row) => row.counters && Array.isArray(row.counters.errors)
    ? row.counters.errors.map((message) => ({ seed: row.seed, message }))
    : []);
  const winCountBySeat = SEATS.reduce((result, seatKey) => {
    result[seatKey] = huleRows.reduce((count, row) => {
      const roundResult = row.roundResult || {};
      const winnerSeats = roundResult.multiHule && Array.isArray(roundResult.winners)
        ? roundResult.winners.map((entry) => entry && entry.winnerSeat).filter(Boolean)
        : [roundResult.winnerSeat].filter(Boolean);
      return count + (winnerSeats.includes(seatKey) ? 1 : 0);
    }, 0);
    return result;
  }, {});
  const dealInCountBySeat = SEATS.reduce((result, seatKey) => {
    result[seatKey] = dealInRows.filter((row) => row.roundResult.fromSeat === seatKey).length;
    return result;
  }, {});
  const averageScoreBySeat = SEATS.reduce((result, seatKey) => {
    result[seatKey] = average(rows.map((row) => row.scores ? row.scores[seatKey] : null));
    return result;
  }, {});

  return {
    rounds: total,
    completedRounds: completed,
    huleRate: rate(huleRows.length, total),
    drawRate: rate(drawRows.length, total),
    dealInRate: rate(dealInRows.length, total),
    riichiRate: rate(totalRiichi, totalDiscards),
    callRate: rate(totalCalls, totalDiscards + totalCalls),
    riichiPerRound: rate(totalRiichi, total),
    callPerRound: rate(totalCalls, total),
    averageDraws: average(rows.map((row) => row.counters.draws)),
    averageDiscards: average(rows.map((row) => row.counters.discards)),
    averageScoreBySeat,
    rightAverageScore: averageScoreBySeat.right,
    winRateBySeat: SEATS.reduce((result, seatKey) => {
      result[seatKey] = rate(winCountBySeat[seatKey], total);
      return result;
    }, {}),
    dealInRateBySeat: SEATS.reduce((result, seatKey) => {
      result[seatKey] = rate(dealInCountBySeat[seatKey], total);
      return result;
    }, {}),
    errorCount: errors.length,
    errors
  };
}

function buildRunSeeds(args) {
  if (!args.promotionReport) {
    return Array.from({ length: args.rounds }, (_, offset) => args.seed + offset);
  }

  const seeds = [];
  args.seeds.forEach((seed) => {
    for (let offset = 0; offset < args.rounds; offset += 1) {
      seeds.push(seed + offset);
    }
  });
  return Array.from(new Set(seeds));
}

function buildPromotionSoftGates(summaries) {
  const normal = summaries.normal || {};
  const hard = summaries.hard || {};
  const normalRightDealInRate = normal.dealInRateBySeat ? Number(normal.dealInRateBySeat.right || 0) : 0;
  const hardRightDealInRate = hard.dealInRateBySeat ? Number(hard.dealInRateBySeat.right || 0) : 0;

  return {
    runtimeErrors: {
      normal: Number(normal.errorCount || 0),
      hard: Number(hard.errorCount || 0)
    },
    completedRounds: {
      normal: Number(normal.completedRounds || 0),
      hard: Number(hard.completedRounds || 0)
    },
    rightAverageScore: {
      normal: Number(normal.rightAverageScore || 0),
      hard: Number(hard.rightAverageScore || 0),
      delta: Number(hard.rightAverageScore || 0) - Number(normal.rightAverageScore || 0)
    },
    rightDealInRate: {
      normal: normalRightDealInRate,
      hard: hardRightDealInRate,
      delta: hardRightDealInRate - normalRightDealInRate
    },
    huleRate: {
      normal: Number(normal.huleRate || 0),
      hard: Number(hard.huleRate || 0),
      delta: Number(hard.huleRate || 0) - Number(normal.huleRate || 0)
    },
    riichiRate: {
      normal: Number(normal.riichiRate || 0),
      hard: Number(hard.riichiRate || 0),
      delta: Number(hard.riichiRate || 0) - Number(normal.riichiRate || 0)
    },
    callRate: {
      normal: Number(normal.callRate || 0),
      hard: Number(hard.callRate || 0),
      delta: Number(hard.callRate || 0) - Number(normal.callRate || 0)
    },
    suggestedH8ReadinessSignals: {
      noRuntimeErrors: Number(normal.errorCount || 0) === 0 && Number(hard.errorCount || 0) === 0,
      hardCompletedAllRounds: Number(hard.completedRounds || 0) === Number(hard.rounds || 0),
      hardRightScoreNotLower: Number(hard.rightAverageScore || 0) >= Number(normal.rightAverageScore || 0),
      hardRightDealInNotHigher: hardRightDealInRate <= normalRightDealInRate
    }
  };
}

function addGate(result, passed, id, details = {}) {
  const entry = {
    id,
    passed: Boolean(passed),
    details
  };
  result[passed ? 'passed' : 'failed'].push(entry);
  return entry;
}

function addWarning(result, id, details = {}) {
  result.warnings.push({
    id,
    details
  });
}

function buildPromotionGates(summaries, options = {}) {
  const softGates = options.softGates || buildPromotionSoftGates(summaries);
  const deterministicStats = options.deterministicStats && typeof options.deterministicStats === 'object'
    ? options.deterministicStats
    : null;
  const thresholds = {
    ...PROMOTION_THRESHOLDS,
    ...(options.thresholds && typeof options.thresholds === 'object' ? options.thresholds : {})
  };
  const normal = summaries && summaries.normal ? summaries.normal : {};
  const hard = summaries && summaries.hard ? summaries.hard : {};
  const hardRuntimeErrors = Number(softGates.runtimeErrors && softGates.runtimeErrors.hard || 0);
  const hardCompletedRounds = Number(softGates.completedRounds && softGates.completedRounds.hard || 0);
  const roundsPerDifficulty = Number(options.roundsPerDifficulty || hard.rounds || 0);
  const deterministicRegressions = deterministicStats
    ? Number(deterministicStats.regressions || 0)
    : null;
  const rightDealInDelta = Number(softGates.rightDealInRate && softGates.rightDealInRate.delta || 0);
  const rightAverageScoreDelta = Number(softGates.rightAverageScore && softGates.rightAverageScore.delta || 0);
  const huleRateDelta = Number(softGates.huleRate && softGates.huleRate.delta || 0);
  const riichiRateDelta = Number(softGates.riichiRate && softGates.riichiRate.delta || 0);
  const callRateDelta = Number(softGates.callRate && softGates.callRate.delta || 0);
  const result = {
    status: 'not-ready',
    thresholds,
    passed: [],
    failed: [],
    warnings: []
  };

  addGate(result, hardRuntimeErrors === thresholds.maxHardRuntimeErrors, 'hard-runtime-errors', {
    expected: thresholds.maxHardRuntimeErrors,
    actual: hardRuntimeErrors
  });
  addGate(result, hardCompletedRounds === roundsPerDifficulty, 'hard-completed-rounds', {
    expected: roundsPerDifficulty,
    actual: hardCompletedRounds
  });
  addGate(result, deterministicRegressions === thresholds.maxDeterministicRegressions, 'deterministic-regressions', {
    expected: thresholds.maxDeterministicRegressions,
    actual: deterministicRegressions
  });
  addGate(result, rightDealInDelta <= 0, 'right-deal-in-not-higher', {
    normal: normal.dealInRateBySeat ? normal.dealInRateBySeat.right : null,
    hard: hard.dealInRateBySeat ? hard.dealInRateBySeat.right : null,
    delta: rightDealInDelta
  });
  addGate(result, rightAverageScoreDelta >= 0, 'right-average-score-not-lower', {
    normal: Number(normal.rightAverageScore || 0),
    hard: Number(hard.rightAverageScore || 0),
    delta: rightAverageScoreDelta
  });
  addGate(result, huleRateDelta >= thresholds.minHardHuleRateDelta, 'hard-hule-rate-floor', {
    normal: Number(normal.huleRate || 0),
    hard: Number(hard.huleRate || 0),
    delta: huleRateDelta,
    minDelta: thresholds.minHardHuleRateDelta
  });

  addWarning(result, 'riichi-rate-delta-observed', {
    normal: Number(normal.riichiRate || 0),
    hard: Number(hard.riichiRate || 0),
    delta: riichiRateDelta
  });
  addWarning(result, 'call-rate-delta-observed', {
    normal: Number(normal.callRate || 0),
    hard: Number(hard.callRate || 0),
    delta: callRateDelta
  });

  result.status = result.failed.length ? 'not-ready' : 'ready';
  return result;
}

function printHelp() {
  console.log('Usage: node games/majiang/scripts/benchmark-hard-headless.js [--seed 20260531] [--rounds 8]');
  console.log('       node games/majiang/scripts/benchmark-hard-headless.js --promotion-report [--seeds 20260531,20260607] [--rounds 1]');
  console.log('');
  console.log('Runs a local soft headless report for formal hard vs normal using direct evaluator calls. This is not a CI gate.');
}

function buildBenchmarkReport(args, options = {}) {
  const config = loadBaseConfig();
  const difficulties = ['normal', 'hard'];
  const runSeeds = buildRunSeeds(args);
  const deterministicStats = args.promotionReport
    ? (options.deterministicStats || null)
    : null;
  const report = {
    source: 'benchmark-hard-headless',
    softReport: true,
    promotionReport: args.promotionReport,
    seed: args.seed,
    seeds: runSeeds,
    roundsPerDifficulty: runSeeds.length,
    note: 'Hard is compared with normal by direct evaluator calls; formal BaseAI exposure is verified by dedicated smokes.',
    summaries: {},
    rows: []
  };

  difficulties.forEach((difficulty) => {
    const rows = runSeeds.map((seed) => runOneRound(config, difficulty, seed));
    report.summaries[difficulty] = summarizeRows(rows);
    report.rows.push(...rows.map((row) => ({
      seed: row.seed,
      difficulty: row.difficulty,
      completed: row.completed,
      resultType: row.roundResult ? row.roundResult.type : null,
      winnerSeat: row.roundResult ? row.roundResult.winnerSeat || null : null,
      fromSeat: row.roundResult ? row.roundResult.fromSeat || null : null,
      scores: row.scores,
      counters: row.counters
    })));
  });

  if (args.promotionReport) {
    report.softGates = buildPromotionSoftGates(report.summaries);
    report.deterministicCorpus = deterministicStats ? {
      samples: Number(deterministicStats.samples || 0),
      hardAdvantages: Number(deterministicStats.hardAdvantages || 0),
      regressions: Number(deterministicStats.regressions || 0),
      pressureSafetyWins: Number(deterministicStats.pressureSafetyWins || 0),
      noPressureEvWins: Number(deterministicStats.noPressureEvWins || 0),
      crossXiangtingFoldWins: Number(deterministicStats.crossXiangtingFoldWins || 0),
      protectedPushWins: Number(deterministicStats.protectedPushWins || 0),
      riichiAccepts: Number(deterministicStats.riichiAccepts || 0),
      riichiRejects: Number(deterministicStats.riichiRejects || 0),
      callAccepts: Number(deterministicStats.callAccepts || 0),
      callRejects: Number(deterministicStats.callRejects || 0)
    } : null;
    report.promotionGates = buildPromotionGates(report.summaries, {
      softGates: report.softGates,
      deterministicStats: report.deterministicCorpus,
      roundsPerDifficulty: report.roundsPerDifficulty
    });
  }

  return report;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  let deterministicStats = null;
  if (args.promotionReport) {
    try {
      const hardStatsApi = require('./validate-hard-headless-stats');
      if (hardStatsApi && typeof hardStatsApi.buildStats === 'function') {
        deterministicStats = hardStatsApi.buildStats(path.resolve(__dirname, '..'));
      }
    } catch (error) {
      deterministicStats = {
        samples: 0,
        hardAdvantages: 0,
        regressions: Number.POSITIVE_INFINITY,
        errors: [error && error.message ? error.message : String(error)]
      };
    }
  }

  console.log(JSON.stringify(buildBenchmarkReport(args, { deterministicStats }), null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  DEFAULT_PROMOTION_SEEDS,
  PROMOTION_THRESHOLDS,
  parseArgs,
  buildRunSeeds,
  buildPromotionSoftGates,
  buildPromotionGates,
  buildBenchmarkReport,
  summarizeRows
};
