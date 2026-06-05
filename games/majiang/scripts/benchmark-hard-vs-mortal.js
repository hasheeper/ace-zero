'use strict';

const fs = require('fs');
const path = require('path');

const coreAdapter = require('../engine/base/majiang-core-adapter');
const { SingleRoundRuntime, ROUND_PHASES } = require('../engine/runtime/single-round-runtime');
const baseAiApi = require('../engine/ai/base-ai');
const { createCoachController } = require('../engine/coach/review/coach-controller');
const {
  buildBenchmarkAnalysisReport,
  classifyBenchmarkRow
} = require('../engine/coach/review/benchmark-analysis');
const {
  resolveMortalConfigPath,
  resolveMortalCondaEnvPath,
  resolveMortalRoot
} = require('../engine/coach/mortal/mortal-adapter');
const { getActionPriority } = require('../shared/runtime/reaction/reaction-priority');
const alphaJongAdapterApi = require('./lib/alphajong-adapter');
const {
  compareDecisions,
  normalizeActionDecision,
  summarizeBenchmarkResults
} = require('./lib/ai-benchmark-helpers');
const { DEFAULT_PROMOTION_SEEDS } = require('./benchmark-hard-headless');
const arenaApi = require('./benchmark-ai-hanchan-arena');

const SEATS = Object.freeze(['bottom', 'right', 'top', 'left']);
const DEFAULT_LAYOUT = 'rotate-target';
const DEFAULT_TARGET_VARIANT = null;
const DEFAULT_TARGET_DIFFICULTY = 'hard';
const DEFAULT_OPPONENT_DIFFICULTY = 'normal';
const DEFAULT_SAMPLES_PER_SEAT = 40;
const DEFAULT_SEEDS = DEFAULT_PROMOTION_SEEDS.slice();
const DEFAULT_TOP_DISAGREEMENTS = 20;
const MORTAL_ACTION_SPACE = 46;
const MORTAL_Q_NEAR_THRESHOLD = 0.05;
const MORTAL_Q_MEDIUM_THRESHOLD = 0.2;
const MORTAL_TILE_ACTIONS = Object.freeze([
  'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9',
  'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9',
  's1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9',
  'z1', 'z2', 'z3', 'z4', 'z5', 'z6', 'z7',
  'm0', 'p0', 's0'
]);
const MORTAL_ACTION_LABELS = Object.freeze({
  37: 'riichi',
  38: 'chi-low',
  39: 'chi-mid',
  40: 'chi-high',
  41: 'peng',
  42: 'kan',
  43: 'hule',
  44: 'ryukyoku',
  45: 'pass'
});
const MORTAL_SEVERITY_ORDER = Object.freeze({
  large: 0,
  medium: 1,
  stale: 2,
  unknown: 3,
  near: 4,
  exact: 5
});

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function parseNumber(value, fallback, min = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.floor(number));
}

function parseSeedList(value) {
  return String(value || '')
    .split(',')
    .map((entry) => Number(entry.trim()))
    .filter((entry) => Number.isFinite(entry))
    .map((entry) => Math.floor(entry));
}

function parseArgs(argv = []) {
  const args = {
    help: false,
    smoke: false,
    out: null,
    targetVariant: DEFAULT_TARGET_VARIANT,
    targetVariantProvided: false,
    targetDifficulty: DEFAULT_TARGET_DIFFICULTY,
    targetExternalAdapter: null,
    opponentDifficulty: DEFAULT_OPPONENT_DIFFICULTY,
    layout: DEFAULT_LAYOUT,
    targetSeat: null,
    samplesPerSeat: DEFAULT_SAMPLES_PER_SEAT,
    seeds: DEFAULT_SEEDS.slice(),
    mortalConfig: 'real',
    mortalConfigProvided: false,
    maxRoundsPerSeat: null,
    topDisagreements: DEFAULT_TOP_DISAGREEMENTS,
    progress: false,
    experimentalOverlays: []
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
    if (token === '--out') {
      args.out = String(argv[index + 1] || '').trim() || null;
      index += 1;
      continue;
    }
    if (token === '--target-difficulty') {
      args.targetDifficulty = String(argv[index + 1] || DEFAULT_TARGET_DIFFICULTY).trim() || DEFAULT_TARGET_DIFFICULTY;
      index += 1;
      continue;
    }
    if (token === '--target-variant') {
      args.targetVariant = String(argv[index + 1] || '').trim() || DEFAULT_TARGET_VARIANT;
      args.targetVariantProvided = true;
      index += 1;
      continue;
    }
    if (token === '--experimental-overlays') {
      args.experimentalOverlays = arenaApi.normalizeExperimentalOverlays(argv[index + 1]);
      index += 1;
      continue;
    }
    if (token === '--opponent-difficulty') {
      args.opponentDifficulty = String(argv[index + 1] || DEFAULT_OPPONENT_DIFFICULTY).trim() || DEFAULT_OPPONENT_DIFFICULTY;
      index += 1;
      continue;
    }
    if (token === '--layout') {
      args.layout = String(argv[index + 1] || DEFAULT_LAYOUT).trim() || DEFAULT_LAYOUT;
      index += 1;
      continue;
    }
    if (token === '--target-seat') {
      args.targetSeat = String(argv[index + 1] || '').trim() || null;
      index += 1;
      continue;
    }
    if (token === '--samples-per-seat') {
      args.samplesPerSeat = parseNumber(argv[index + 1], DEFAULT_SAMPLES_PER_SEAT, 1);
      index += 1;
      continue;
    }
    if (token === '--seeds') {
      const parsed = parseSeedList(argv[index + 1]);
      if (parsed.length) args.seeds = parsed;
      index += 1;
      continue;
    }
    if (token === '--seed') {
      const seed = Number(argv[index + 1]);
      if (Number.isFinite(seed)) args.seeds = [Math.floor(seed)];
      index += 1;
      continue;
    }
    if (token === '--mortal-config') {
      args.mortalConfig = String(argv[index + 1] || '').trim() || args.mortalConfig;
      args.mortalConfigProvided = true;
      index += 1;
      continue;
    }
    if (token === '--max-rounds-per-seat') {
      args.maxRoundsPerSeat = parseNumber(argv[index + 1], 0, 1);
      index += 1;
      continue;
    }
    if (token === '--top') {
      args.topDisagreements = parseNumber(argv[index + 1], DEFAULT_TOP_DISAGREEMENTS, 0);
      index += 1;
      continue;
    }
    if (token === '--progress') {
      args.progress = true;
    }
  }

  if (args.smoke) {
    args.samplesPerSeat = Math.min(args.samplesPerSeat, 1);
    if (!args.mortalConfigProvided) args.mortalConfig = 'smoke';
    if (!args.seeds.length || args.seeds.length > 4) args.seeds = DEFAULT_SEEDS.slice(0, 4);
    args.topDisagreements = Math.min(args.topDisagreements, 8);
  }

  if (!args.seeds.length) args.seeds = DEFAULT_SEEDS.slice();
  if (!SEATS.includes(args.targetSeat)) args.targetSeat = null;
  if (args.layout !== DEFAULT_LAYOUT && args.layout !== 'fixed-target') args.layout = DEFAULT_LAYOUT;
  const targetVariant = resolveTargetVariant(args);
  args.targetVariant = targetVariant.id;
  args.targetDifficulty = targetVariant.difficulty;
  args.targetPolicy = targetVariant.policy ? clone(targetVariant.policy) : null;
  args.targetExternalAdapter = targetVariant.externalAdapter || null;
  if (!args.maxRoundsPerSeat) {
    args.maxRoundsPerSeat = Math.max(args.seeds.length, args.samplesPerSeat * 3);
  }

  return args;
}

function printHelp() {
  console.log('Usage: node games/majiang/scripts/benchmark-hard-vs-mortal.js [options]');
  console.log('');
  console.log('Options:');
  console.log('  --smoke                         Use smoke Mortal config and one sample per target seat.');
  console.log('  --out <path>                    Write the JSON report to a file instead of only stdout.');
  console.log('  --target-variant <name>         easy|normal|alphajong[-discard-only|-core]|hard|hard-standard|hard-closed-defense|hard-value-classic|hard-pure-v1|hard-tuned-v2|hard-experimental. Legacy hard-balanced/hard-defensive-dev/hard-heavy names still work.');
  console.log('  --experimental-overlays <a,b>   Overlays for hard-experimental only.');
  console.log('  --target-difficulty <name>      Difficulty for the evaluated seat. Default: hard.');
  console.log('  --opponent-difficulty <name>    Difficulty for the other three seats. Default: normal.');
  console.log('  --layout rotate-target          Rotate bottom/right/top/left target seats. Default.');
  console.log('  --layout fixed-target --target-seat <seat>');
  console.log('  --samples-per-seat <n>          Target discard samples per evaluated seat. Default: 40.');
  console.log('  --seeds <a,b,c>                 Fixed seed list. Default: hard promotion seed set.');
  console.log('  --mortal-config real|smoke|path Default: real, smoke when --smoke is set.');
  console.log('  --top <n>                       Include the top N Mortal q-value disagreements. Default: 20.');
  console.log('  --progress                      Print progress updates to stderr.');
}

function resolveTargetVariant(args = {}) {
  const requested = args.targetVariantProvided && args.targetVariant
    ? String(args.targetVariant)
    : String(args.targetDifficulty || DEFAULT_TARGET_DIFFICULTY);
  if (requested === 'hard') {
    return {
      id: 'hard',
      label: 'hard',
      difficulty: 'hard',
      policy: null
    };
  }
  const presets = arenaApi.createVariantPresets();
  const preset = presets[requested];
  if (preset && preset.externalAdapter) {
    return {
      id: requested,
      label: preset && preset.label ? preset.label : requested,
      difficulty: preset.difficulty || 'normal',
      policy: null,
      externalAdapter: preset.externalAdapter
    };
  }
  if (preset && preset.difficulty === 'hard') {
    const policy = preset && typeof preset.createPolicy === 'function'
      ? preset.createPolicy({
          experimentalOverlays: requested === 'hard-experimental'
            ? arenaApi.normalizeExperimentalOverlays(args.experimentalOverlays || [])
            : []
        })
      : null;
    return {
      id: requested,
      label: preset && preset.label ? preset.label : requested,
      difficulty: 'hard',
      policy
    };
  }
  if (requested === 'easy' || requested === 'normal') {
    return {
      id: requested,
      label: requested,
      difficulty: requested,
      policy: null
    };
  }
  throw new Error(`Unsupported target variant: ${requested}`);
}

function buildAiDecisionContext(args, seatKey, targetSeat) {
  const context = {
    benchmark: 'hard-vs-mortal',
    targetVariant: args && args.targetVariant ? args.targetVariant : null
  };
  if (seatKey === targetSeat && args && args.targetPolicy) {
    context.policy = clone(args.targetPolicy);
  }
  return context;
}

function createExternalTargetAdapter(args = {}) {
  const externalAdapter = args && args.targetExternalAdapter ? args.targetExternalAdapter : null;
  if (externalAdapter === 'alphajong-core') {
    return alphaJongAdapterApi.createAlphaJongAdapter({ mode: 'core' });
  }
  if (externalAdapter === 'alphajong-discard-only') {
    return alphaJongAdapterApi.createAlphaJongAdapter({ mode: 'discard-only' });
  }
  return null;
}

function chooseBenchmarkDiscard(aiController, externalTargetAdapter, runtime, seatKey, targetSeat, args) {
  const context = {
    ...buildAiDecisionContext(args, seatKey, targetSeat),
    includeHardCandidateDiagnostics: true
  };
  if (seatKey === targetSeat && externalTargetAdapter) {
    return externalTargetAdapter.evaluateRuntimeDiscard(runtime, seatKey, context);
  }
  return aiController.chooseDiscard(seatKey, context);
}

function chooseBenchmarkReaction(aiController, externalTargetAdapter, runtime, seatKey, seatActions, targetSeat, args) {
  const context = buildAiDecisionContext(args, seatKey, targetSeat);
  if (seatKey === targetSeat && externalTargetAdapter && typeof externalTargetAdapter.evaluateRuntimeReaction === 'function') {
    return externalTargetAdapter.evaluateRuntimeReaction(runtime, seatKey, seatActions, context);
  }
  return aiController.chooseReaction(seatKey, seatActions, context);
}

function reportProgress(args, message, details = {}) {
  if (!args || !args.progress) return;
  const suffix = Object.keys(details).length ? ` ${JSON.stringify(details)}` : '';
  console.error(`[hard-vs-mortal] ${message}${suffix}`);
}

function loadBaseConfig() {
  return JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'game-config.json'), 'utf8'));
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

function buildAiConfig(baseConfig, targetSeat, args) {
  const config = clone(baseConfig);
  config.ai = {
    ...(config.ai || {}),
    implementedDifficulties: ['easy', 'normal', 'hard'],
    defaultDifficulty: args.opponentDifficulty
  };
  config.players = SEATS.map((seatKey) => {
    const source = Array.isArray(baseConfig.players)
      ? baseConfig.players.find((player) => player && player.seat === seatKey) || {}
      : {};
    const difficulty = seatKey === targetSeat ? args.targetDifficulty : args.opponentDifficulty;
    return {
      ...source,
      seat: seatKey,
      human: false,
      ai: {
        ...(source.ai || {}),
        enabled: true,
        difficulty,
        profile: 'default'
      }
    };
  });
  return config;
}

function getTargetSeats(args) {
  if (args.layout === 'fixed-target' && args.targetSeat) return [args.targetSeat];
  return SEATS.slice();
}

function getPhase(runtime) {
  return runtime && runtime.stateMachine && typeof runtime.stateMachine.getPhase === 'function'
    ? runtime.stateMachine.getPhase()
    : null;
}

function resolveMortalConfig(args, mortalRoot) {
  if (args.mortalConfig === 'smoke') {
    return resolveMortalConfigPath({
      mortalRoot,
      configPath: path.join(mortalRoot, 'mortal', 'config.smoke.toml')
    });
  }
  if (args.mortalConfig === 'real') {
    return resolveMortalConfigPath({
      mortalRoot,
      configPath: path.join(mortalRoot, 'mortal', 'config.real.toml')
    });
  }
  return resolveMortalConfigPath({
    mortalRoot,
    configPath: args.mortalConfig
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
    runtime.passReaction(seatKey, { reason: 'hard-vs-mortal-benchmark-pass' });
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

function handleReaction(runtime, aiController, externalTargetAdapter, counters, args, targetSeat) {
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
    const decision = chooseBenchmarkReaction(aiController, externalTargetAdapter, runtime, seatKey, seatActions, targetSeat, args);

    if (decision && decision.type === 'hule') {
      runtime.resolveHule(seatKey, {
        ...(decision.payload || {}),
        finalizeImmediately: true
      });
      return;
    }

    if (decision && decision.type === 'pass') {
      passSeat(runtime, seatKey);
      return;
    }

    if (decision) {
      runtime.dispatch(decision);
      if (decision.type === 'call' || decision.type === 'meld') counters.calls += 1;
      return;
    }

    passSeat(runtime, seatKey);
  }
}

function safeReasons(decision) {
  const riichiDecision = decision && decision.riichiDecision && typeof decision.riichiDecision === 'object'
    ? decision.riichiDecision
    : null;
  return riichiDecision && Array.isArray(riichiDecision.reasons)
    ? riichiDecision.reasons.slice()
    : [];
}

function roundMetric(value, digits = 6) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Number(number.toFixed(digits));
}

function normalizeTileCodeForMortal(tileCode) {
  if (typeof tileCode !== 'string' || !tileCode) return null;
  const normalized = String(tileCode).replace(/[\*_\+\=\-]+$/g, '');
  const redMatch = normalized.match(/^([mps])0$/);
  if (redMatch) return `${redMatch[1]}5`;
  return normalized;
}

function parseMortalMaskBits(maskBits) {
  if (maskBits == null) return 0n;
  if (typeof maskBits === 'bigint') return maskBits;
  if (typeof maskBits === 'number' && Number.isFinite(maskBits)) {
    return BigInt(Math.max(0, Math.floor(maskBits)));
  }
  const numeric = Number(maskBits);
  if (Number.isFinite(numeric)) {
    return BigInt(Math.max(0, Math.floor(numeric)));
  }
  try {
    return BigInt(String(maskBits));
  } catch (error) {
    return 0n;
  }
}

function listMortalActionIndices(maskBits) {
  const bits = parseMortalMaskBits(maskBits);
  const indices = [];
  for (let actionIndex = 0; actionIndex < MORTAL_ACTION_SPACE; actionIndex += 1) {
    if (((bits >> BigInt(actionIndex)) & 1n) === 1n) {
      indices.push(actionIndex);
    }
  }
  return indices;
}

function describeMortalActionIndex(actionIndex) {
  if (actionIndex >= 0 && actionIndex < MORTAL_TILE_ACTIONS.length) {
    const tileCode = MORTAL_TILE_ACTIONS[actionIndex];
    return {
      actionType: 'discard',
      tileCode,
      normalizedTileCode: normalizeTileCodeForMortal(tileCode)
    };
  }
  return {
    actionType: MORTAL_ACTION_LABELS[actionIndex] || 'unknown',
    tileCode: null,
    normalizedTileCode: null
  };
}

function decodeMortalCandidates(meta = null) {
  const qValues = meta && Array.isArray(meta.q_values) ? meta.q_values : [];
  const actionIndices = listMortalActionIndices(meta && meta.mask_bits);
  const warnings = [];
  if (!qValues.length || !actionIndices.length) return { candidates: [], warnings };
  if (qValues.length !== actionIndices.length) {
    warnings.push(`q_values/mask_bits length mismatch: q=${qValues.length}, mask=${actionIndices.length}`);
  }
  const count = Math.min(qValues.length, actionIndices.length);
  const rawCandidates = [];
  for (let index = 0; index < count; index += 1) {
    const actionIndex = actionIndices[index];
    const qValue = Number(qValues[index]);
    const action = describeMortalActionIndex(actionIndex);
    rawCandidates.push({
      actionIndex,
      actionType: action.actionType,
      tileCode: action.tileCode,
      normalizedTileCode: action.normalizedTileCode,
      qValue: roundMetric(qValue)
    });
  }

  const bestQ = rawCandidates.reduce((best, candidate) => (
    candidate.qValue != null ? Math.max(best, Number(candidate.qValue)) : best
  ), -Infinity);
  const candidates = rawCandidates
    .map((candidate) => ({
      ...candidate,
      qDeltaFromBest: Number.isFinite(bestQ) && candidate.qValue != null
        ? roundMetric(bestQ - Number(candidate.qValue))
        : null,
      isBest: Number.isFinite(bestQ) && candidate.qValue != null && Number(candidate.qValue) === bestQ
    }))
    .sort((left, right) => (
      Number(right.qValue == null ? -Infinity : right.qValue)
      - Number(left.qValue == null ? -Infinity : left.qValue)
      || Number(left.actionIndex || 0) - Number(right.actionIndex || 0)
    ));
  return { candidates, warnings };
}

function summarizeMortalMeta(raw = null, decodedIndex = null) {
  const meta = raw && raw.meta && typeof raw.meta === 'object' ? raw.meta : null;
  if (!meta) return null;
  return {
    sourceType: raw && raw.type ? raw.type : null,
    decodedIndex,
    maskBits: meta.mask_bits == null ? null : String(meta.mask_bits),
    legalActionCount: Array.isArray(meta.q_values) ? meta.q_values.length : 0,
    shanten: Number.isFinite(Number(meta.shanten)) ? Number(meta.shanten) : null,
    atFuriten: Boolean(meta.at_furiten),
    isGreedy: Boolean(meta.is_greedy),
    batchSize: Number.isFinite(Number(meta.batch_size)) ? Number(meta.batch_size) : null,
    evalTimeNs: Number.isFinite(Number(meta.eval_time_ns)) ? Number(meta.eval_time_ns) : null
  };
}

function extractMortalMetaRecords(suggestionState = null, options = {}) {
  const decoded = suggestionState && Array.isArray(suggestionState.decoded)
    ? suggestionState.decoded
    : [];
  const minDecodedIndex = Number.isFinite(Number(options.minDecodedIndex))
    ? Number(options.minDecodedIndex)
    : null;
  return decoded
    .map((entry, decodedIndex) => {
      if (minDecodedIndex != null && decodedIndex < minDecodedIndex) return null;
      const raw = entry && entry.raw && typeof entry.raw === 'object' ? entry.raw : null;
      const meta = raw && raw.meta && typeof raw.meta === 'object' ? raw.meta : null;
      if (!meta) return null;
      return {
        decodedIndex,
        decodedType: entry && entry.type ? entry.type : null,
        runtimeActionType: entry && entry.runtimeAction && entry.runtimeAction.type ? entry.runtimeAction.type : null,
        runtimeAction: entry && entry.runtimeAction && typeof entry.runtimeAction === 'object'
          ? clone(entry.runtimeAction)
          : null,
        rawType: raw.type || null,
        raw,
        meta,
        summary: summarizeMortalMeta(raw, decodedIndex)
      };
    })
    .filter(Boolean);
}

function getMortalFreshStartIndex(alignment = null) {
  if (!alignment || alignment.status !== 'fresh') return null;
  const startIndex = Number(alignment.previousMortalDecisionCount);
  return Number.isFinite(startIndex) ? Math.max(0, Math.floor(startIndex)) : null;
}

function getMortalRecordPriority(record = null, localDecision = null) {
  if (!record) return -1;
  const sourceType = record.rawType || record.decodedType || null;
  const runtimeType = record.runtimeActionType || null;
  const localType = localDecision && localDecision.type ? localDecision.type : null;

  if (localType === 'discard') {
    if (runtimeType === 'discard' || sourceType === 'dahai') return 100;
    if (sourceType === 'reach') return 90;
    if (sourceType === 'none') return 10;
    return 20;
  }

  if (localType === 'pass') {
    if (sourceType === 'none' || runtimeType === 'pass') return 100;
    return 20;
  }

  if (localType === 'hule') {
    if (sourceType === 'hora' || runtimeType === 'hule') return 100;
    return 20;
  }

  if (localType === 'call') {
    const callType = localDecision && localDecision.callType === 'peng' ? 'pon' : localDecision && localDecision.callType;
    if (sourceType === callType || runtimeType === 'call') return 100;
    return 20;
  }

  return runtimeType ? 50 : 10;
}

function pickPrimaryMortalMetaRecord(suggestionState = null, localDecision = null, alignment = null) {
  const freshStartIndex = getMortalFreshStartIndex(alignment);
  const freshRecords = freshStartIndex == null
    ? []
    : extractMortalMetaRecords(suggestionState, { minDecodedIndex: freshStartIndex });
  const records = freshRecords.length ? freshRecords : extractMortalMetaRecords(suggestionState);
  if (!records.length) return null;

  let bestRecord = null;
  let bestPriority = -1;
  records.forEach((record) => {
    const priority = getMortalRecordPriority(record, localDecision);
    if (
      !bestRecord
      || priority > bestPriority
      || (priority === bestPriority && Number(record.decodedIndex) > Number(bestRecord.decodedIndex))
    ) {
      bestRecord = record;
      bestPriority = priority;
    }
  });
  if (bestRecord) return bestRecord;

  for (let index = records.length - 1; index >= 0; index -= 1) {
    if (records[index].runtimeActionType) return records[index];
  }
  return records[records.length - 1];
}

function isMortalRecordCompatibleWithLocalDecision(record = null, localDecision = null) {
  if (!record || !localDecision) return false;
  if (localDecision.type === 'discard') {
    return record.rawType === 'dahai'
      || record.runtimeActionType === 'discard'
      || record.rawType === 'reach';
  }
  return getMortalRecordPriority(record, localDecision) >= 90;
}

function shouldRetryMortalSuggestionForLocalDecision(localDecisionRaw = null, suggestionState = null, previousMortalDecisionCount = 0) {
  const localDecision = normalizeActionDecision(localDecisionRaw);
  if (!localDecision || localDecision.type !== 'discard') return false;
  const decodedCount = suggestionState && Number.isFinite(Number(suggestionState.decodedCount))
    ? Number(suggestionState.decodedCount)
    : 0;
  const previousCount = Number.isFinite(Number(previousMortalDecisionCount))
    ? Number(previousMortalDecisionCount)
    : 0;
  const alignment = {
    status: decodedCount > previousCount ? 'fresh' : 'stale',
    decodedCount,
    previousMortalDecisionCount: previousCount,
    advancedBy: decodedCount - previousCount
  };
  const primaryRecord = pickPrimaryMortalMetaRecord(suggestionState, localDecision, alignment);
  return !isMortalRecordCompatibleWithLocalDecision(primaryRecord, localDecision);
}

function findBestCandidate(candidates = [], predicate = () => false) {
  return candidates
    .filter(predicate)
    .sort((left, right) => (
      Number(right.qValue == null ? -Infinity : right.qValue)
      - Number(left.qValue == null ? -Infinity : left.qValue)
      || Number(left.actionIndex || 0) - Number(right.actionIndex || 0)
    ))[0] || null;
}

function findLocalMortalCandidate(localDecision = null, candidates = [], primaryRecord = null) {
  if (!localDecision || !Array.isArray(candidates) || !candidates.length) return null;
  if (localDecision.type === 'discard') {
    if (primaryRecord && primaryRecord.rawType === 'reach') {
      if (localDecision.riichi) {
        return findBestCandidate(candidates, (candidate) => candidate.actionType === 'riichi');
      }
      const tileCode = normalizeTileCodeForMortal(localDecision.tileCode);
      const discardCandidate = findBestCandidate(candidates, (candidate) => (
        candidate.actionType === 'discard'
        && candidate.normalizedTileCode === tileCode
      ));
      if (discardCandidate) return discardCandidate;
      return findBestCandidate(candidates, (candidate) => candidate.actionType === 'pass');
    }
    if (localDecision.riichi) {
      const riichiCandidate = findBestCandidate(candidates, (candidate) => candidate.actionType === 'riichi');
      if (riichiCandidate) return riichiCandidate;
    }
    const tileCode = normalizeTileCodeForMortal(localDecision.tileCode);
    return findBestCandidate(candidates, (candidate) => (
      candidate.actionType === 'discard'
      && candidate.normalizedTileCode === tileCode
    ));
  }
  if (localDecision.type === 'pass') {
    return findBestCandidate(candidates, (candidate) => candidate.actionType === 'pass');
  }
  if (localDecision.type === 'hule') {
    return findBestCandidate(candidates, (candidate) => candidate.actionType === 'hule');
  }
  if (localDecision.type === 'call') {
    const callType = localDecision.callType === 'peng' ? 'peng' : localDecision.callType;
    return findBestCandidate(candidates, (candidate) => candidate.actionType === callType);
  }
  return null;
}

function buildMortalCoachDecisionFromCandidate(candidate = null, localDecision = null, primaryRecord = null) {
  if (!candidate) return null;
  const seat = localDecision && localDecision.seat ? localDecision.seat : null;

  if (primaryRecord && primaryRecord.rawType === 'reach') {
    if (candidate.actionType === 'discard') {
      return {
        type: 'discard',
        seat,
        tileCode: candidate.tileCode || null,
        riichi: false,
        mortalDecisionStage: 'reach'
      };
    }
    return {
      type: 'discard',
      seat,
      tileCode: localDecision && localDecision.tileCode ? localDecision.tileCode : null,
      riichi: candidate.actionType === 'riichi',
      mortalDecisionStage: 'reach'
    };
  }

  if (candidate.actionType === 'discard') {
    return {
      type: 'discard',
      seat,
      tileCode: candidate.tileCode || null,
      riichi: false
    };
  }

  if (candidate.actionType === 'pass') {
    return {
      type: 'pass',
      seat
    };
  }

  if (candidate.actionType === 'hule') {
    return {
      type: 'hule',
      seat
    };
  }

  if (candidate.actionType === 'peng' || String(candidate.actionType || '').startsWith('chi')) {
    return {
      type: 'call',
      seat,
      callType: candidate.actionType === 'peng' ? 'peng' : 'chi'
    };
  }

  return null;
}

function buildMortalRecordContext(localDecision, suggestionState, alignment = null) {
  const primaryRecord = pickPrimaryMortalMetaRecord(suggestionState, localDecision, alignment);
  const decoded = primaryRecord ? decodeMortalCandidates(primaryRecord.meta) : { candidates: [], warnings: [] };
  const candidates = decoded.candidates || [];
  const bestCandidate = candidates[0] || null;
  const coachDecision = primaryRecord && primaryRecord.runtimeAction
    ? clone(primaryRecord.runtimeAction)
    : buildMortalCoachDecisionFromCandidate(bestCandidate, localDecision, primaryRecord);
  return {
    primaryRecord,
    decoded,
    candidates,
    bestCandidate,
    coachDecision
  };
}

function classifyMortalSeverity(comparison = null, localCandidate = null, bestCandidate = null) {
  if (comparison && comparison.exactMatch) {
    return {
      level: 'exact',
      qDelta: localCandidate && localCandidate.qDeltaFromBest != null ? localCandidate.qDeltaFromBest : 0,
      reason: 'matched-mortal-top-action'
    };
  }
  if (!localCandidate || !bestCandidate) {
    return {
      level: 'unknown',
      qDelta: null,
      reason: 'local-action-not-found-in-mortal-candidates'
    };
  }

  const qDelta = roundMetric(Number(bestCandidate.qValue) - Number(localCandidate.qValue));
  if (qDelta == null) {
    return {
      level: 'unknown',
      qDelta: null,
      reason: 'missing-q-value'
    };
  }
  if (qDelta <= MORTAL_Q_NEAR_THRESHOLD) {
    return {
      level: 'near',
      qDelta,
      reason: 'within-near-q-threshold'
    };
  }
  if (qDelta <= MORTAL_Q_MEDIUM_THRESHOLD) {
    return {
      level: 'medium',
      qDelta,
      reason: 'within-medium-q-threshold'
    };
  }
  return {
    level: 'large',
    qDelta,
    reason: 'large-q-gap-from-mortal-top-action'
  };
}

function buildMortalCandidateDiagnostics(
  localDecision,
  coachDecision,
  comparison,
  suggestionState,
  alignment = null,
  recordContext = null
) {
  const context = recordContext || buildMortalRecordContext(localDecision, suggestionState, alignment);
  const primaryRecord = context.primaryRecord;
  const metaRecords = extractMortalMetaRecords(suggestionState).map((record) => record.summary);
  const freshStartIndex = getMortalFreshStartIndex(alignment);
  const selectedMetaRecords = freshStartIndex == null
    ? metaRecords
    : extractMortalMetaRecords(suggestionState, { minDecodedIndex: freshStartIndex }).map((record) => record.summary);
  if (alignment && alignment.status === 'stale') {
    const staleCandidates = context.decoded || { candidates: [], warnings: [] };
    return {
      mortalMeta: primaryRecord
        ? {
            ...(primaryRecord.summary || {}),
            decodeWarnings: staleCandidates.warnings
          }
        : null,
      mortalMetaRecords: metaRecords,
      selectedMortalMetaRecords: selectedMetaRecords,
      mortalCandidates: staleCandidates.candidates,
      localMortalCandidate: null,
      bestMortalCandidate: staleCandidates.candidates[0] || null,
      derivedCoachDecision: context.coachDecision || null,
      mortalSeverity: {
        level: 'stale',
        qDelta: null,
        reason: 'mortal-output-did-not-advance',
        thresholds: {
          near: MORTAL_Q_NEAR_THRESHOLD,
          medium: MORTAL_Q_MEDIUM_THRESHOLD
        },
        coachActionType: coachDecision && coachDecision.type ? coachDecision.type : null
      }
    };
  }

  if (!primaryRecord) {
    return {
      mortalMeta: null,
      mortalMetaRecords: metaRecords,
      selectedMortalMetaRecords: selectedMetaRecords,
      mortalCandidates: [],
      localMortalCandidate: null,
      bestMortalCandidate: null,
      derivedCoachDecision: null,
      mortalSeverity: {
        level: comparison && comparison.exactMatch ? 'exact' : 'unknown',
        qDelta: comparison && comparison.exactMatch ? 0 : null,
        reason: 'missing-mortal-q-meta'
      }
    };
  }

  const decoded = context.decoded;
  const candidates = context.candidates;
  const bestCandidate = context.bestCandidate;
  const localCandidate = findLocalMortalCandidate(localDecision, candidates, primaryRecord);
  const severity = classifyMortalSeverity(comparison, localCandidate, bestCandidate);
  return {
    mortalMeta: {
      ...(primaryRecord.summary || {}),
      decodeWarnings: decoded.warnings
    },
    mortalMetaRecords: metaRecords,
    selectedMortalMetaRecords: selectedMetaRecords,
    mortalCandidates: candidates,
    localMortalCandidate: localCandidate,
    bestMortalCandidate: bestCandidate,
    derivedCoachDecision: context.coachDecision || null,
    mortalSeverity: {
      ...severity,
      thresholds: {
        near: MORTAL_Q_NEAR_THRESHOLD,
        medium: MORTAL_Q_MEDIUM_THRESHOLD
      },
      coachActionType: coachDecision && coachDecision.type ? coachDecision.type : null
    }
  };
}

function buildH10Tags(localDecision, coachDecision, comparison, localDecisionRaw = null) {
  const tags = ['discard', 'h10', 'mortal-alignment'];
  if (!coachDecision) {
    tags.push('missing-mortal');
    return tags;
  }

  if (localDecision && coachDecision && localDecision.riichi !== coachDecision.riichi) {
    if (!localDecision.riichi && coachDecision.riichi) {
      tags.push('riichi-missed');
    } else {
      tags.push('riichi-overpush');
    }
  }

  if (comparison && comparison.mismatchKind === 'tile') {
    const pressureScore = Number(localDecisionRaw && localDecisionRaw.pushFoldState && localDecisionRaw.pushFoldState.pressureScore || 0);
    if (pressureScore > 0) tags.push('tile-defense', 'riichi-pressure');
    else tags.push('tile-choice');
  }

  return tags;
}

function getRuntimeSeatOrder(runtime = null) {
  return runtime && runtime.topology && Array.isArray(runtime.topology.activeSeats) && runtime.topology.activeSeats.length
    ? runtime.topology.activeSeats.slice()
    : SEATS.slice();
}

function getSeatRiverCodes(runtime = null, seatKey = null) {
  if (!runtime || !seatKey || typeof runtime.getSeatIndex !== 'function') return [];
  const seatIndex = runtime.getSeatIndex(seatKey);
  const river = seatIndex >= 0 && runtime.board && Array.isArray(runtime.board.he)
    ? runtime.board.he[seatIndex]
    : null;
  return river && Array.isArray(river._pai) ? river._pai.slice() : [];
}

function getSeatMeldStrings(runtime = null, seatKey = null) {
  if (!runtime || !seatKey || typeof runtime.getSeatIndex !== 'function') return [];
  const seatIndex = runtime.getSeatIndex(seatKey);
  const shoupai = seatIndex >= 0 && runtime.board && Array.isArray(runtime.board.shoupai)
    ? runtime.board.shoupai[seatIndex]
    : null;
  return shoupai && Array.isArray(shoupai._fulou) ? shoupai._fulou.slice() : [];
}

function getSeatRiichiContext(runtime = null, seatKey = null) {
  const state = runtime && runtime.riichiState && seatKey ? runtime.riichiState[seatKey] : null;
  if (!state || typeof state !== 'object') {
    return {
      declared: false,
      ippatsuPending: false,
      doubleRiichi: false
    };
  }
  return {
    declared: Boolean(state.declared),
    ippatsuPending: Boolean(state.ippatsuPending),
    doubleRiichi: Boolean(state.doubleRiichi)
  };
}

function compactDecisionCandidate(candidate = null) {
  if (!candidate || typeof candidate !== 'object') return null;
  const metrics = candidate.metrics && typeof candidate.metrics === 'object' ? candidate.metrics : null;
  const hardMetrics = candidate.hardMetrics && typeof candidate.hardMetrics === 'object' ? candidate.hardMetrics : null;
  const danger = candidate.danger && typeof candidate.danger === 'object' ? candidate.danger : null;
  const shape = candidate.shape && typeof candidate.shape === 'object' ? candidate.shape : null;
  return {
    tileCode: candidate.tileCode || null,
    tileIndex: Number.isFinite(Number(candidate.tileIndex)) ? Number(candidate.tileIndex) : null,
    isDrawDiscard: Boolean(candidate.isDrawDiscard),
    selectedFinal: Boolean(candidate.selectedFinal),
    xiangting: metrics && Number.isFinite(Number(metrics.xiangting))
      ? Number(metrics.xiangting)
      : null,
    hardEvScore: hardMetrics && Number.isFinite(Number(hardMetrics.hardEvScore))
      ? Number(hardMetrics.hardEvScore)
      : null,
    dangerScore: danger && Number.isFinite(Number(danger.dangerScore))
      ? Number(danger.dangerScore)
      : null,
    shapeScore: shape && Number.isFinite(Number(shape.discardShapeScore))
      ? Number(shape.discardShapeScore)
      : null,
    shapeRole: shape && typeof shape.discardTileRole === 'string'
      ? shape.discardTileRole
      : null
  };
}

function compactAlphaJongPriority(priority = null) {
  if (!priority || typeof priority !== 'object') return null;
  return {
    tileCode: priority.tileCode || null,
    priority: Number.isFinite(Number(priority.priority)) ? Number(priority.priority) : null,
    shanten: Number.isFinite(Number(priority.shanten)) ? Number(priority.shanten) : null,
    waits: Number.isFinite(Number(priority.waits)) ? Number(priority.waits) : null,
    danger: Number.isFinite(Number(priority.danger)) ? Number(priority.danger) : null,
    scoreOpen: Number.isFinite(Number(priority.scoreOpen)) ? Number(priority.scoreOpen) : null,
    scoreClosed: Number.isFinite(Number(priority.scoreClosed)) ? Number(priority.scoreClosed) : null
  };
}

function compactAlphaJongDecision(localDecisionRaw = null) {
  const alphaJong = localDecisionRaw && localDecisionRaw.alphaJong && typeof localDecisionRaw.alphaJong === 'object'
    ? localDecisionRaw.alphaJong
    : null;
  if (!alphaJong) return null;
  return {
    policyId: localDecisionRaw && localDecisionRaw.policyId ? localDecisionRaw.policyId : null,
    mode: alphaJong.mode || null,
    strategy: alphaJong.strategy || null,
    fold: Boolean(alphaJong.fold),
    riichi: Boolean(alphaJong.riichi),
    riichiDiagnostics: alphaJong.riichiDiagnostics ? clone(alphaJong.riichiDiagnostics) : null,
    stateMemory: alphaJong.stateMemory ? clone(alphaJong.stateMemory) : null,
    selected: compactAlphaJongPriority(alphaJong.selected),
    top: Array.isArray(alphaJong.top)
      ? alphaJong.top.slice(0, 5).map(compactAlphaJongPriority).filter(Boolean)
      : []
  };
}

function buildDecisionContext(runtime = null, seatKey = null, localDecisionRaw = null) {
  if (!runtime || !seatKey) return null;
  const wallState = typeof runtime.getWallState === 'function' ? runtime.getWallState() : null;
  const seatOrder = getRuntimeSeatOrder(runtime);
  const seatStates = seatOrder.reduce((result, currentSeatKey) => {
    result[currentSeatKey] = {
      handCodes: currentSeatKey === seatKey && typeof runtime.getSeatHandCodes === 'function'
        ? runtime.getSeatHandCodes(currentSeatKey)
        : [],
      riverCodes: getSeatRiverCodes(runtime, currentSeatKey),
      melds: getSeatMeldStrings(runtime, currentSeatKey),
      riichi: getSeatRiichiContext(runtime, currentSeatKey)
    };
    return result;
  }, {});
  const hardCandidates = Array.isArray(localDecisionRaw && localDecisionRaw.hardCandidateDiagnostics)
    ? localDecisionRaw.hardCandidateDiagnostics.map(compactDecisionCandidate).filter(Boolean)
    : [];

  return {
    seat: seatKey,
    phase: getPhase(runtime),
    turnSeat: typeof runtime.getCurrentTurnSeat === 'function' ? runtime.getCurrentTurnSeat() : null,
    remaining: wallState && Number.isFinite(Number(wallState.remaining)) ? Number(wallState.remaining) : null,
    doraIndicators: wallState && Array.isArray(wallState.doraIndicators)
      ? wallState.doraIndicators.filter(Boolean)
      : [],
    scores: typeof runtime.getScoreMap === 'function' ? runtime.getScoreMap() : null,
    round: runtime.board ? {
      zhuangfeng: Number.isFinite(Number(runtime.board.zhuangfeng)) ? Number(runtime.board.zhuangfeng) : null,
      jushu: Number.isFinite(Number(runtime.board.jushu)) ? Number(runtime.board.jushu) : null,
      changbang: Number.isFinite(Number(runtime.board.changbang)) ? Number(runtime.board.changbang) : null,
      lizhibang: Number.isFinite(Number(runtime.board.lizhibang)) ? Number(runtime.board.lizhibang) : null,
      dealerSeat: typeof runtime.getDealerSeat === 'function' ? runtime.getDealerSeat() : null
    } : null,
    seats: seatStates,
    discardCandidates: hardCandidates,
    localDiscard: localDecisionRaw ? {
      tileCode: localDecisionRaw.tileCode || null,
      tileIndex: Number.isFinite(Number(localDecisionRaw.tileIndex)) ? Number(localDecisionRaw.tileIndex) : null,
      shouldRiichi: Boolean(localDecisionRaw.shouldRiichi),
      reasons: Array.isArray(localDecisionRaw.reasons) ? localDecisionRaw.reasons.slice() : []
    } : null
  };
}

function buildDecisionRow(context) {
  const {
    seed,
    targetSeat,
    roundIndex,
    sampleIndex,
    localDecisionRaw,
    suggestionState,
    inference,
    args,
    runtime
  } = context;
  const localDecision = normalizeActionDecision(localDecisionRaw);
  const decodedCount = suggestionState && Number.isFinite(Number(suggestionState.decodedCount))
    ? Number(suggestionState.decodedCount)
    : 0;
  const previousMortalDecisionCount = Number.isFinite(Number(context.previousMortalDecisionCount))
    ? Number(context.previousMortalDecisionCount)
    : 0;
  const mortalAlignment = {
    status: decodedCount > previousMortalDecisionCount ? 'fresh' : 'stale',
    decodedCount,
    previousMortalDecisionCount,
    advancedBy: decodedCount - previousMortalDecisionCount
  };
  const recordContext = buildMortalRecordContext(localDecision, suggestionState, mortalAlignment);
  const coachDecisionRaw = recordContext.coachDecision
    || (suggestionState && suggestionState.recommended ? suggestionState.recommended : null);
  const coachDecision = normalizeActionDecision(coachDecisionRaw);
  const comparison = compareDecisions(localDecisionRaw, coachDecisionRaw);
  const tags = buildH10Tags(localDecision, coachDecision, comparison, localDecisionRaw);
  if (mortalAlignment.status === 'stale') tags.push('stale-mortal-state');
  const mortalDiagnostics = buildMortalCandidateDiagnostics(
    localDecision,
    coachDecision,
    comparison,
    suggestionState,
    mortalAlignment,
    recordContext
  );
  const row = {
    id: `h10-${targetSeat}-${seed}-${roundIndex}-${sampleIndex}`,
    seed,
    targetSeat,
    kind: 'discard',
    tags,
    round: {
      id: `seed-${seed}-target-${targetSeat}-round-${roundIndex}`,
      label: `seed ${seed} / ${targetSeat} / round ${roundIndex}`,
      seed,
      targetSeat,
      roundIndex
    },
    subject: {
      id: `ai:${targetSeat}:${args.targetVariant}`,
      label: `${args.targetVariant}(${targetSeat})`,
      type: 'ai',
      difficulty: args.targetDifficulty,
      variant: args.targetVariant,
      seat: targetSeat
    },
    mortalOk: Boolean(inference && inference.ok),
    suggestionStatus: suggestionState && suggestionState.status ? suggestionState.status : null,
    localDecision,
    coachDecision,
    mortalCoachDecision: mortalDiagnostics.derivedCoachDecision,
    comparison,
    riichiDecision: localDecisionRaw && localDecisionRaw.riichiDecision
      ? {
          shouldRiichi: Boolean(localDecisionRaw.riichiDecision.shouldRiichi),
          score: Number(localDecisionRaw.riichiDecision.score || 0),
          reasons: safeReasons(localDecisionRaw),
          hardRiichiMetrics: clone(localDecisionRaw.riichiDecision.hardRiichiMetrics || null)
        }
      : null,
    metrics: clone(localDecisionRaw && localDecisionRaw.metrics ? localDecisionRaw.metrics : null),
    alphaJongDecision: compactAlphaJongDecision(localDecisionRaw),
    hardMetrics: clone(localDecisionRaw && localDecisionRaw.hardMetrics ? localDecisionRaw.hardMetrics : null),
    hardPushFold: clone(localDecisionRaw && localDecisionRaw.hardPushFold ? localDecisionRaw.hardPushFold : null),
    hardSafetyGate: clone(localDecisionRaw && localDecisionRaw.hardSafetyGate ? localDecisionRaw.hardSafetyGate : null),
    hardDefenseTiebreak: clone(localDecisionRaw && localDecisionRaw.hardDefenseTiebreak ? localDecisionRaw.hardDefenseTiebreak : null),
    hardCandidateDiagnostics: Array.isArray(localDecisionRaw && localDecisionRaw.hardCandidateDiagnostics)
      ? clone(localDecisionRaw.hardCandidateDiagnostics)
      : [],
    decisionContext: buildDecisionContext(runtime, targetSeat, localDecisionRaw),
    danger: clone(localDecisionRaw && localDecisionRaw.danger ? localDecisionRaw.danger : null),
    pushFoldState: clone(localDecisionRaw && localDecisionRaw.pushFoldState ? localDecisionRaw.pushFoldState : null),
    mortalMeta: mortalDiagnostics.mortalMeta,
    mortalMetaRecords: mortalDiagnostics.mortalMetaRecords,
    selectedMortalMetaRecords: mortalDiagnostics.selectedMortalMetaRecords,
    mortalCandidates: mortalDiagnostics.mortalCandidates,
    localMortalCandidate: mortalDiagnostics.localMortalCandidate,
    bestMortalCandidate: mortalDiagnostics.bestMortalCandidate,
    mortalSeverity: mortalDiagnostics.mortalSeverity,
    mortalAlignment,
    mortal: {
      ok: Boolean(inference && inference.ok),
      decodedCount,
      stderr: inference && inference.stderr ? String(inference.stderr).slice(0, 1000) : ''
    }
  };
  row.judgment = classifyBenchmarkRow(row);
  return row;
}

function runOneRoundSamples(options) {
  const {
    baseConfig,
    targetSeat,
    seed,
    roundIndex,
    args,
    mortalOptions,
    remainingSamples
  } = options;
  const config = buildAiConfig(baseConfig, targetSeat, args);
  const runtime = createSeededRuntime(config, seed);
  const aiController = baseAiApi.createAiController(runtime, config);
  const externalTargetAdapter = createExternalTargetAdapter(args);
  const controller = createCoachController(runtime, {
    perspectiveSeatKey: targetSeat,
    mortalRoot: mortalOptions.mortalRoot,
    condaEnvPath: mortalOptions.condaEnvPath,
    configPath: mortalOptions.configPath
  });
  const rows = [];
  let previousMortalDecisionCount = 0;
  const counters = {
    draws: 0,
    discards: 0,
    calls: 0,
    riichi: 0,
    errors: []
  };

  runtime.start();
  controller.ensureBootstrap();

  for (let step = 0; step < 500 && rows.length < remainingSamples; step += 1) {
    const phase = getPhase(runtime);
    if (phase === ROUND_PHASES.ROUND_END) break;

    try {
      if (phase === ROUND_PHASES.AWAIT_DRAW) {
        const seatKey = runtime.getCurrentTurnSeat();
        if (runtime.getWallState().remaining <= 0) {
          runtime.resolveDraw('hard-vs-mortal-exhaustive-draw');
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

        const localDecisionRaw = chooseBenchmarkDiscard(aiController, externalTargetAdapter, runtime, seatKey, targetSeat, args);
        if (seatKey === targetSeat && rows.length < remainingSamples) {
          let inference = controller.requestSuggestion();
          let suggestionState = controller.getSuggestionState();
          for (let retryIndex = 0; retryIndex < 2 && shouldRetryMortalSuggestionForLocalDecision(localDecisionRaw, suggestionState, previousMortalDecisionCount); retryIndex += 1) {
            inference = controller.requestSuggestion();
            suggestionState = controller.getSuggestionState();
          }
          const incompatibleMortalRecord = shouldRetryMortalSuggestionForLocalDecision(localDecisionRaw, suggestionState, previousMortalDecisionCount);
          if (!incompatibleMortalRecord) {
            rows.push(buildDecisionRow({
              seed,
              targetSeat,
              roundIndex,
              sampleIndex: rows.length,
              localDecisionRaw,
              suggestionState,
              inference,
              args,
              runtime,
              previousMortalDecisionCount
            }));
          }
          previousMortalDecisionCount = Math.max(
            previousMortalDecisionCount,
            Number(suggestionState && suggestionState.decodedCount || 0)
          );
        }

        const handCodes = runtime.getSeatHandCodes(seatKey);
        const tileCode = localDecisionRaw && localDecisionRaw.tileCode
          ? localDecisionRaw.tileCode
          : handCodes[handCodes.length - 1];
        const shouldRiichi = Boolean(localDecisionRaw && localDecisionRaw.shouldRiichi);
        runtime.discardTile(seatKey, tileCode, {
          riichi: shouldRiichi
        });
        counters.discards += 1;
        if (shouldRiichi) counters.riichi += 1;
        continue;
      }

      if (phase === ROUND_PHASES.AWAIT_REACTION) {
        handleReaction(runtime, aiController, externalTargetAdapter, counters, args, targetSeat);
        continue;
      }

      counters.errors.push(`unsupported phase: ${phase}`);
      break;
    } catch (error) {
      counters.errors.push(
        process.env.ACE_MAHJONG_BENCHMARK_STACK && error && error.stack
          ? error.stack
          : (error && error.message ? error.message : String(error))
      );
      break;
    }
  }

  return {
    rows,
    runtimeSummary: {
      seed,
      targetSeat,
      roundIndex,
      completed: getPhase(runtime) === ROUND_PHASES.ROUND_END,
      phase: getPhase(runtime),
      counters,
      scores: typeof runtime.getScoreMap === 'function' ? runtime.getScoreMap() : null,
      roundResult: runtime.roundResult || null
    }
  };
}

function seedForRound(seeds, roundIndex) {
  const base = seeds[roundIndex % seeds.length];
  const cycle = Math.floor(roundIndex / seeds.length);
  return base + cycle * 1000003;
}

function runTargetSeatSamples(baseConfig, targetSeat, args, mortalOptions) {
  const rows = [];
  const runtimeRows = [];
  reportProgress(args, 'target-start', {
    targetSeat,
    samplesPerSeat: args.samplesPerSeat,
    maxRoundsPerSeat: args.maxRoundsPerSeat
  });
  for (let roundIndex = 0; roundIndex < args.maxRoundsPerSeat && rows.length < args.samplesPerSeat; roundIndex += 1) {
    const seed = seedForRound(args.seeds, roundIndex);
    const result = runOneRoundSamples({
      baseConfig,
      targetSeat,
      seed,
      roundIndex,
      args,
      mortalOptions,
      remainingSamples: args.samplesPerSeat - rows.length
    });
    rows.push(...result.rows);
    runtimeRows.push(result.runtimeSummary);
    reportProgress(args, 'target-round', {
      targetSeat,
      roundIndex,
      seed,
      rows: rows.length,
      expected: args.samplesPerSeat,
      phase: result.runtimeSummary && result.runtimeSummary.phase
    });
  }
  reportProgress(args, 'target-done', {
    targetSeat,
    rows: rows.length,
    expected: args.samplesPerSeat
  });
  return {
    targetSeat,
    rows,
    runtimeRows
  };
}

function compactAnalysisReport(analysis) {
  if (!analysis || typeof analysis !== 'object') return analysis;
  return {
    ...analysis,
    subjects: Array.isArray(analysis.subjects)
      ? analysis.subjects.map((subject) => ({
          summary: clone(subject.summary || null)
        }))
      : [],
    rounds: Array.isArray(analysis.rounds)
      ? analysis.rounds.map((round) => ({
          summary: clone(round.summary || null)
        }))
      : []
  };
}

function createEmptySeverityCounts() {
  return {
    exact: 0,
    near: 0,
    medium: 0,
    large: 0,
    stale: 0,
    unknown: 0
  };
}

function summarizeMortalSeverity(rows = []) {
  const counts = createEmptySeverityCounts();
  let comparable = 0;
  let qDeltaTotal = 0;
  let qDeltaCount = 0;
  let maxQDelta = null;

  rows.forEach((row) => {
    const severity = row && row.mortalSeverity ? row.mortalSeverity : null;
    const level = severity && counts[severity.level] != null ? severity.level : 'unknown';
    counts[level] += 1;
    if (level !== 'unknown' && level !== 'stale') comparable += 1;
    if (severity && Number.isFinite(Number(severity.qDelta))) {
      const qDelta = Number(severity.qDelta);
      qDeltaTotal += qDelta;
      qDeltaCount += 1;
      maxQDelta = maxQDelta == null ? qDelta : Math.max(maxQDelta, qDelta);
    }
  });

  const total = rows.length;
  return {
    total,
    comparable,
    counts,
    exactRate: total ? roundMetric(counts.exact / total, 4) : 0,
    nearOrExactRate: total ? roundMetric((counts.exact + counts.near) / total, 4) : 0,
    mediumOrBetterRate: total ? roundMetric((counts.exact + counts.near + counts.medium) / total, 4) : 0,
    largeRate: total ? roundMetric(counts.large / total, 4) : 0,
    staleRate: total ? roundMetric(counts.stale / total, 4) : 0,
    averageQDelta: qDeltaCount ? roundMetric(qDeltaTotal / qDeltaCount) : null,
    maxQDelta: maxQDelta == null ? null : roundMetric(maxQDelta)
  };
}

function summarizeSeverityBySubject(rows = []) {
  const grouped = new Map();
  rows.forEach((row) => {
    const subjectId = row && row.subject && row.subject.id ? row.subject.id : 'unknown';
    if (!grouped.has(subjectId)) grouped.set(subjectId, []);
    grouped.get(subjectId).push(row);
  });
  return Array.from(grouped.entries())
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([subjectId, subjectRows]) => ({
      subjectId,
      targetSeat: subjectRows[0] && subjectRows[0].targetSeat ? subjectRows[0].targetSeat : null,
      severity: summarizeMortalSeverity(subjectRows)
    }));
}

function compactDisagreementRow(row = null) {
  if (!row) return null;
  const hardCandidateDiagnostics = compactDisagreementCandidateDiagnostics(row);
  return {
    id: row.id,
    seed: row.seed,
    targetSeat: row.targetSeat,
    subject: row.subject ? clone(row.subject) : null,
    localDecision: row.localDecision ? clone(row.localDecision) : null,
    coachDecision: row.coachDecision ? clone(row.coachDecision) : null,
    comparison: row.comparison ? clone(row.comparison) : null,
    judgment: row.judgment ? clone(row.judgment) : null,
    mortalSeverity: row.mortalSeverity ? clone(row.mortalSeverity) : null,
    bestMortalCandidate: row.bestMortalCandidate ? clone(row.bestMortalCandidate) : null,
    localMortalCandidate: row.localMortalCandidate ? clone(row.localMortalCandidate) : null,
    metrics: row.metrics ? clone(row.metrics) : null,
    alphaJongDecision: row.alphaJongDecision ? clone(row.alphaJongDecision) : null,
    hardMetrics: row.hardMetrics
      ? {
          liveUkeireCount: row.hardMetrics.liveUkeireCount,
          liveTingpaiCount: row.hardMetrics.liveTingpaiCount,
          waitQualityScore: row.hardMetrics.waitQualityScore,
          bestWaitType: row.hardMetrics.bestWaitType,
          handValueEstimate: row.hardMetrics.handValueEstimate,
          contextualHandValueEstimate: row.hardMetrics.contextualHandValueEstimate,
          hardEvScore: row.hardMetrics.hardEvScore,
          hardContext: clone(row.hardMetrics.hardContext || null)
        }
      : null,
    riichiDecision: row.riichiDecision ? clone(row.riichiDecision) : null,
    danger: row.danger ? clone(row.danger) : null,
    pushFoldState: row.pushFoldState ? clone(row.pushFoldState) : null,
    hardPushFold: row.hardPushFold ? clone(row.hardPushFold) : null,
    hardSafetyGate: row.hardSafetyGate ? clone(row.hardSafetyGate) : null,
    hardDefenseTiebreak: row.hardDefenseTiebreak ? clone(row.hardDefenseTiebreak) : null,
    hardCandidateDiagnostics
  };
}

function compactDisagreementCandidateDiagnostics(row = null) {
  const diagnostics = row && Array.isArray(row.hardCandidateDiagnostics)
    ? row.hardCandidateDiagnostics
    : [];
  if (!diagnostics.length) return [];

  const targetTiles = new Set();
  const addTile = (tileCode) => {
    const normalizedTileCode = normalizeTileCodeForMortal(tileCode);
    if (normalizedTileCode) targetTiles.add(normalizedTileCode);
  };

  addTile(row && row.localDecision && row.localDecision.tileCode);
  addTile(row && row.coachDecision && row.coachDecision.tileCode);
  if (row && row.bestMortalCandidate && row.bestMortalCandidate.actionType === 'discard') {
    addTile(row.bestMortalCandidate.tileCode);
  }
  if (row && row.localMortalCandidate && row.localMortalCandidate.actionType === 'discard') {
    addTile(row.localMortalCandidate.tileCode);
  }

  return diagnostics
    .filter((candidate) => (
      candidate
      && (
        candidate.selectedInitial
        || candidate.selectedFinal
        || targetTiles.has(normalizeTileCodeForMortal(candidate.tileCode))
      )
    ))
    .map((candidate) => clone(candidate));
}

function buildTopDisagreements(rows = [], limit = DEFAULT_TOP_DISAGREEMENTS) {
  if (!limit) return [];
  return rows
    .filter((row) => row && row.comparison && !row.comparison.exactMatch)
    .sort((left, right) => {
      const leftLevel = left.mortalSeverity && left.mortalSeverity.level ? left.mortalSeverity.level : 'unknown';
      const rightLevel = right.mortalSeverity && right.mortalSeverity.level ? right.mortalSeverity.level : 'unknown';
      const levelDiff = (MORTAL_SEVERITY_ORDER[leftLevel] ?? MORTAL_SEVERITY_ORDER.unknown)
        - (MORTAL_SEVERITY_ORDER[rightLevel] ?? MORTAL_SEVERITY_ORDER.unknown);
      if (levelDiff !== 0) return levelDiff;
      return Number(right.mortalSeverity && right.mortalSeverity.qDelta || -1)
        - Number(left.mortalSeverity && left.mortalSeverity.qDelta || -1);
    })
    .slice(0, limit)
    .map(compactDisagreementRow)
    .filter(Boolean);
}

function buildBenchmarkReport(args, options = {}) {
  const resolvedArgs = {
    ...parseArgs([]),
    ...(args || {})
  };
  const targetVariant = resolveTargetVariant(resolvedArgs);
  resolvedArgs.targetVariant = targetVariant.id;
  resolvedArgs.targetDifficulty = targetVariant.difficulty;
  resolvedArgs.targetPolicy = targetVariant.policy ? clone(targetVariant.policy) : null;
  resolvedArgs.targetExternalAdapter = targetVariant.externalAdapter || null;
  const mortalRoot = options.mortalRoot || resolveMortalRoot();
  const mortalOptions = {
    mortalRoot,
    condaEnvPath: options.condaEnvPath || resolveMortalCondaEnvPath({ mortalRoot }),
    configPath: options.configPath || resolveMortalConfig(resolvedArgs, mortalRoot)
  };
  const baseConfig = options.baseConfig || loadBaseConfig();
  const targetSeats = getTargetSeats(resolvedArgs);
  const seatResults = targetSeats.map((targetSeat) => runTargetSeatSamples(
    baseConfig,
    targetSeat,
    resolvedArgs,
    mortalOptions
  ));
  const rows = seatResults.flatMap((entry) => entry.rows);
  const runtimeRows = seatResults.flatMap((entry) => entry.runtimeRows);
  const severity = summarizeMortalSeverity(rows);
  const analysis = compactAnalysisReport(buildBenchmarkAnalysisReport(rows, {
    source: 'benchmark-hard-vs-mortal',
    scope: 'ai-headless-discard-riichi',
    overviewLabel: 'Hard vs Mortal discard/riichi samples'
  }));
  const warnings = seatResults
    .filter((entry) => entry.rows.length < resolvedArgs.samplesPerSeat)
    .map((entry) => ({
      id: 'insufficient-samples',
      targetSeat: entry.targetSeat,
      expected: resolvedArgs.samplesPerSeat,
      actual: entry.rows.length
    }));

  return {
    source: 'benchmark-hard-vs-mortal',
    generatedAt: Date.now(),
    smoke: Boolean(resolvedArgs.smoke),
    layout: resolvedArgs.layout,
    decisionKinds: ['discard', 'riichi'],
    targetVariant: resolvedArgs.targetVariant,
    targetDifficulty: resolvedArgs.targetDifficulty,
    targetExternalAdapter: resolvedArgs.targetExternalAdapter || null,
    opponentDifficulty: resolvedArgs.opponentDifficulty,
    experimentalOverlays: arenaApi.normalizeExperimentalOverlays(resolvedArgs.experimentalOverlays || []),
    targetPolicyPatch: resolvedArgs.targetPolicy
      ? {
          id: resolvedArgs.targetPolicy.id || resolvedArgs.targetVariant,
          personality: resolvedArgs.targetPolicy.personality || null,
          discard: resolvedArgs.targetPolicy.discard ? {
            enableNoPressureShapeReview: Boolean(resolvedArgs.targetPolicy.discard.enableNoPressureShapeReview),
            shapeStrongOverrideEnabled: Boolean(resolvedArgs.targetPolicy.discard.shapeStrongOverrideEnabled),
            enableNoPressureCleanupGuard: Boolean(resolvedArgs.targetPolicy.discard.enableNoPressureCleanupGuard),
            enableNoPressureSameXiangtingRerank: Boolean(resolvedArgs.targetPolicy.discard.enableNoPressureSameXiangtingRerank)
          } : null,
          defense: resolvedArgs.targetPolicy.defense ? {
            enableLowDangerTiebreak: Boolean(resolvedArgs.targetPolicy.defense.enableLowDangerTiebreak),
            enableEqualSafeBackstep: Boolean(resolvedArgs.targetPolicy.defense.enableEqualSafeBackstep)
          } : null,
          riichi: resolvedArgs.targetPolicy.riichi ? {
            allowNoPressureThinRiichi: Boolean(resolvedArgs.targetPolicy.riichi.allowNoPressureThinRiichi)
          } : null,
          call: resolvedArgs.targetPolicy.call ? {
            enableHardCallReview: Boolean(resolvedArgs.targetPolicy.call.enableHardCallReview),
            allowYakuhaiPeng: Boolean(resolvedArgs.targetPolicy.call.allowYakuhaiPeng),
            allowShantenImprovement: Boolean(resolvedArgs.targetPolicy.call.allowShantenImprovement),
            allowFlatSpeedUp: Boolean(resolvedArgs.targetPolicy.call.allowFlatSpeedUp)
          } : null,
          route: resolvedArgs.targetPolicy.route ? {
            enableClosedRouteValueRebalance: Boolean(resolvedArgs.targetPolicy.route.enableClosedRouteValueRebalance),
            closedRouteMaxXiangting: resolvedArgs.targetPolicy.route.closedRouteMaxXiangting,
            closedRouteMinRemainingTiles: resolvedArgs.targetPolicy.route.closedRouteMinRemainingTiles,
            closedRouteOverrideMinMargin: resolvedArgs.targetPolicy.route.closedRouteOverrideMinMargin
          } : null,
          experimentalOverlay: resolvedArgs.targetPolicy.experimentalOverlay ? {
            enabled: Boolean(resolvedArgs.targetPolicy.experimentalOverlay.enabled),
            overlays: Array.isArray(resolvedArgs.targetPolicy.experimentalOverlay.overlays)
              ? resolvedArgs.targetPolicy.experimentalOverlay.overlays.slice()
              : []
          } : null
        }
      : null,
    targetSeats,
    samplesPerSeat: resolvedArgs.samplesPerSeat,
    seeds: resolvedArgs.seeds.slice(),
    maxRoundsPerSeat: resolvedArgs.maxRoundsPerSeat,
    topDisagreementsLimit: resolvedArgs.topDisagreements,
    mortalConfig: {
      mode: resolvedArgs.mortalConfig,
      path: mortalOptions.configPath,
      root: mortalOptions.mortalRoot
    },
    warnings,
    summary: summarizeBenchmarkResults(rows),
    severity,
    severityCounts: clone(severity.counts),
    severityBySubject: summarizeSeverityBySubject(rows),
    topDisagreements: buildTopDisagreements(rows, resolvedArgs.topDisagreements),
    analysis,
    overview: analysis.overview,
    subjects: analysis.subjects,
    rounds: analysis.rounds,
    rows,
    runtimeRows
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  const report = buildBenchmarkReport(args);
  const output = JSON.stringify(report, null, 2);
  if (args.out) {
    fs.writeFileSync(path.resolve(args.out), output.concat('\n'), 'utf8');
  }
  console.log(output);
}

if (require.main === module) {
  main();
}

module.exports = {
  SEATS,
  DEFAULT_SEEDS,
  parseArgs,
  resolveTargetVariant,
  buildH10Tags,
  decodeMortalCandidates,
  extractMortalMetaRecords,
  pickPrimaryMortalMetaRecord,
  buildMortalRecordContext,
  buildMortalCandidateDiagnostics,
  buildDecisionContext,
  summarizeMortalSeverity,
  buildTopDisagreements,
  buildAiDecisionContext,
  buildAiConfig,
  buildBenchmarkReport,
  runOneRoundSamples,
  runTargetSeatSamples
};
