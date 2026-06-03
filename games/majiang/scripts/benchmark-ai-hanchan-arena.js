'use strict';

const fs = require('fs');
const path = require('path');

const coreAdapter = require('../engine/base/majiang-core-adapter');
const { SingleRoundRuntime, ROUND_PHASES } = require('../engine/runtime/single-round-runtime');
const baseAiApi = require('../engine/ai/base-ai');
const hardPolicyApi = require('../engine/ai/difficulty/hard-policy');
const createMatchStateHelpers = require('../shared/match/match-state');
const createRoundTransitionHelpers = require('../shared/match/round-transition');
const { getActionPriority } = require('../shared/runtime/reaction/reaction-priority');

const SEATS = Object.freeze(['bottom', 'right', 'top', 'left']);
const DEFAULT_SEED = 20260603;
const DEFAULT_MATCHES = 1000;
const SMOKE_MATCHES = 2;
const DEFAULT_MAX_STEPS_PER_ROUND = 700;
const DEFAULT_MAX_ROUNDS_PER_MATCH = 64;
const DEFAULT_CHECKPOINT_INTERVAL = 25;
const DEFAULT_STDOUT_FORMAT = 'json';
const EXPERIMENTAL_OVERLAYS = Object.freeze({
  DEFENSE_EQUAL_SAFE_BACKSTEP_V1: 'defense-equal-safe-backstep-v1',
  NO_PRESSURE_SAME_XIANGTING_RERANK_V1: 'no-pressure-same-xiangting-rerank-v1',
  CLOSED_ROUTE_VALUE_REBALANCE_V1: 'closed-route-value-rebalance-v1'
});

const matchStateHelpers = createMatchStateHelpers();
const roundTransitionHelpers = createRoundTransitionHelpers();

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
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

function createPureHardPolicy() {
  const policy = hardPolicyApi && typeof hardPolicyApi.createHardPolicy === 'function'
    ? hardPolicyApi.createHardPolicy()
    : { id: 'hard-pure' };
  policy.id = 'hard-pure';
  if (policy.discard && typeof policy.discard === 'object') {
    policy.discard.enableNoPressureShapeReview = false;
    policy.discard.shapeStrongOverrideEnabled = false;
    policy.discard.enableNoPressureCleanupGuard = false;
  }
  if (policy.defense && typeof policy.defense === 'object') {
    policy.defense.enableLowDangerTiebreak = false;
  }
  if (policy.riichi && typeof policy.riichi === 'object') {
    policy.riichi.allowNoPressureThinRiichi = false;
  }
  return policy;
}

function createAggressiveHardPolicy() {
  const policy = createPureHardPolicy();
  policy.id = 'hard-aggressive';
  policy.personality = 'aggressive';
  return policy;
}

function createTunedHardPolicy() {
  const policy = hardPolicyApi && typeof hardPolicyApi.createHardPolicy === 'function'
    ? hardPolicyApi.createHardPolicy()
    : { id: 'hard-tuned' };
  policy.id = 'hard-tuned';
  return policy;
}

function createDefensiveHardPolicy() {
  const policy = createTunedHardPolicy();
  policy.id = 'hard-defensive';
  policy.personality = 'defensive';
  return policy;
}

function normalizeExperimentalOverlays(value = []) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || '').trim()).filter(Boolean);
  }
  if (value && typeof value === 'object' && Array.isArray(value.experimentalOverlays)) {
    return normalizeExperimentalOverlays(value.experimentalOverlays);
  }
  if (value && typeof value === 'object') {
    return [];
  }
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function applyExperimentalOverlay(policy, overlayName) {
  if (overlayName === EXPERIMENTAL_OVERLAYS.DEFENSE_EQUAL_SAFE_BACKSTEP_V1) {
    policy.defense = policy.defense && typeof policy.defense === 'object' ? policy.defense : {};
    policy.defense.enableEqualSafeBackstep = true;
    policy.defense.equalSafeBackstepMinPressure = 8;
    policy.defense.equalSafeBackstepDangerMax = 0;
    policy.defense.equalSafeBackstepSafetyRankMax = 0;
    policy.defense.equalSafeBackstepMinDefenseTileRankGain = 2;
    policy.defense.equalSafeBackstepMaxXiangtingLoss = 1;
    return;
  }
  if (overlayName === EXPERIMENTAL_OVERLAYS.NO_PRESSURE_SAME_XIANGTING_RERANK_V1) {
    policy.discard = policy.discard && typeof policy.discard === 'object' ? policy.discard : {};
    policy.discard.enableNoPressureSameXiangtingRerank = true;
    policy.discard.sameXiangtingRerankMinShapeDelta = 14;
    policy.discard.sameXiangtingRerankMaxHardEvLoss = 60;
    policy.discard.sameXiangtingRerankMinXiangting = 1;
    policy.discard.sameXiangtingRerankMaxXiangting = 4;
    return;
  }
  if (overlayName === EXPERIMENTAL_OVERLAYS.CLOSED_ROUTE_VALUE_REBALANCE_V1) {
    policy.route = policy.route && typeof policy.route === 'object' ? policy.route : {};
    policy.route.enableClosedRouteValueRebalance = true;
    policy.route.closedRouteMaxXiangting = 2;
    policy.route.closedRouteMinRemainingTiles = 24;
    policy.route.closedRouteOverrideMinMargin = 35;
    policy.route.directTenpaiCallAlwaysAllow = true;
    policy.route.pressureDisablesClosedRouteOverride = true;
    policy.route.weights = {
      ...((policy.route && policy.route.weights) || {})
    };
    return;
  }
  throw new Error(`Unknown hard experimental overlay: ${overlayName}`);
}

function createExperimentalHardPolicy(options = {}) {
  const overlays = normalizeExperimentalOverlays(options);
  const policy = createTunedHardPolicy();
  policy.id = 'hard-experimental';
  overlays.forEach((overlayName) => applyExperimentalOverlay(policy, overlayName));
  policy.experimentalOverlay = {
    enabled: overlays.length > 0,
    overlays,
    note: 'Benchmark-only variant. Defaults to hard-tuned until explicit experimental overlays are enabled.'
  };
  return policy;
}

function createBalancedHardPolicy() {
  const policy = createTunedHardPolicy();
  policy.id = 'hard-balanced';
  policy.personality = 'balanced';
  policy.route = policy.route && typeof policy.route === 'object' ? policy.route : {};
  policy.route.enableClosedRouteValueRebalance = true;
  policy.route.closedRouteMaxXiangting = 1;
  policy.route.closedRouteMinRemainingTiles = 24;
  policy.route.closedRouteOverrideMinMargin = 90;
  policy.route.directTenpaiCallAlwaysAllow = true;
  policy.route.pressureDisablesClosedRouteOverride = true;
  policy.route.weights = {
    ...((policy.route && policy.route.weights) || {})
  };
  return policy;
}

function createHeavyHardPolicy() {
  const policy = createTunedHardPolicy();
  policy.id = 'hard-heavy';
  policy.personality = 'heavy';
  applyExperimentalOverlay(policy, EXPERIMENTAL_OVERLAYS.CLOSED_ROUTE_VALUE_REBALANCE_V1);
  return policy;
}

function createAggressiveDevHardPolicy() {
  const policy = createAggressiveHardPolicy();
  policy.id = 'hard-aggressive-dev';
  policy.personality = 'aggressive-dev';
  policy.devVariant = {
    parent: 'hard-aggressive',
    note: 'H16 dev variant. Initially inherits hard-aggressive until explicit dev tuning lands.'
  };
  return policy;
}

function createDefensiveDevHardPolicy() {
  const policy = createDefensiveHardPolicy();
  policy.id = 'hard-defensive-dev';
  policy.personality = 'defensive-dev';
  policy.devVariant = {
    parent: 'hard-defensive',
    note: 'H16 dev variant. Initially inherits hard-defensive until explicit dev tuning lands.'
  };
  return policy;
}

function createBalancedDevHardPolicy() {
  const policy = createBalancedHardPolicy();
  policy.id = 'hard-balanced-dev';
  policy.personality = 'balanced-dev';
  policy.devVariant = {
    parent: 'hard-balanced',
    note: 'H16 dev variant. Uses balanced state routing while keeping the shared route scorer.'
  };
  policy.route = policy.route && typeof policy.route === 'object' ? policy.route : {};
  policy.route.enableBalancedRouteState = true;
  policy.route.closedRouteMaxXiangting = 2;
  policy.route.closedRouteOverrideMinMargin = 150;
  policy.route.balancedValueOverrideMinMargin = 150;
  policy.route.balancedNeutralOverrideMinMargin = 230;
  policy.route.balancedLowValueMax = 36;
  policy.route.balancedStrongCallHardEvDelta = 120;
  policy.route.balancedStrongCallLiveUkeireDelta = 12;
  policy.route.balancedShantenCallHardEvDelta = 40;
  policy.route.balancedShantenCallLiveUkeireDelta = 6;
  policy.route.balancedValueMinRiichiPotential = 65;
  policy.route.balancedValueMinContextualHandValue = 40;
  policy.route.balancedTwoShantenValueMinRiichiPotential = 80;
  policy.route.balancedTwoShantenValueMinContextualHandValue = 60;
  return policy;
}

function createHeavyDevHardPolicy() {
  const policy = createHeavyHardPolicy();
  policy.id = 'hard-heavy-dev';
  policy.personality = 'heavy-dev';
  policy.devVariant = {
    parent: 'hard-heavy',
    note: 'H16 dev variant. Initially inherits hard-heavy until explicit dev tuning lands.'
  };
  return policy;
}

function createVariantPresets() {
  return {
    easy: {
      id: 'easy',
      label: '简单 AI',
      difficulty: 'easy',
      description: 'Formal easy scripted AI.'
    },
    normal: {
      id: 'normal',
      label: '普通 AI',
      difficulty: 'normal',
      description: 'Formal normal scripted AI.'
    },
    'hard-pure': {
      id: 'hard-pure',
      label: '困难 AI（纯启发）',
      difficulty: 'hard',
      description: 'Legacy alias for hard-aggressive. Hard core heuristic policy with post-Mortal-tuning shape/defense/cleanup gates disabled.',
      createPolicy: createPureHardPolicy
    },
    'hard-aggressive': {
      id: 'hard-aggressive',
      label: '困难 AI（速攻）',
      difficulty: 'hard',
      description: 'Speed-oriented hard personality. Uses the pure hard core with later defensive/shape tuning gates disabled.',
      createPolicy: createAggressiveHardPolicy
    },
    'hard-aggressive-dev': {
      id: 'hard-aggressive-dev',
      label: '困难 AI（速攻 dev）',
      difficulty: 'hard',
      description: 'Development variant for hard-aggressive. Inherits stable aggressive behavior until H16 speed tuning is enabled.',
      createPolicy: createAggressiveDevHardPolicy
    },
    'hard-tuned': {
      id: 'hard-tuned',
      label: '困难 AI（后微调）',
      difficulty: 'hard',
      description: 'Legacy alias for hard-defensive. Current formal hard policy, including later hard-only tuning gates.',
      createPolicy: createTunedHardPolicy
    },
    'hard-defensive': {
      id: 'hard-defensive',
      label: '困难 AI（防御）',
      difficulty: 'hard',
      description: 'Defense-oriented hard personality. Current tuned/formal hard baseline with retained hard-only safety gates.',
      createPolicy: createDefensiveHardPolicy
    },
    'hard-defensive-dev': {
      id: 'hard-defensive-dev',
      label: '困难 AI（防御 dev）',
      difficulty: 'hard',
      description: 'Development variant for hard-defensive. Inherits stable defensive behavior until H16 counterattack tuning is enabled.',
      createPolicy: createDefensiveDevHardPolicy
    },
    'hard-balanced': {
      id: 'hard-balanced',
      label: '困难 AI（平衡）',
      difficulty: 'hard',
      description: 'Balanced hard personality. Keeps tuned hard base and applies a milder closed-riichi route value rebalance.',
      createPolicy: createBalancedHardPolicy
    },
    'hard-balanced-dev': {
      id: 'hard-balanced-dev',
      label: '困难 AI（平衡 dev）',
      difficulty: 'hard',
      description: 'Development variant for hard-balanced. Adds H16 balanced state routing on top of the shared route scorer.',
      createPolicy: createBalancedDevHardPolicy
    },
    'hard-heavy': {
      id: 'hard-heavy',
      label: '困难 AI（打点）',
      difficulty: 'hard',
      description: 'Value-oriented hard personality. Keeps tuned hard base and adds closed-riichi route value rebalance.',
      createPolicy: createHeavyHardPolicy
    },
    'hard-heavy-dev': {
      id: 'hard-heavy-dev',
      label: '困难 AI（打点 dev）',
      difficulty: 'hard',
      description: 'Development variant for hard-heavy. Inherits stable heavy behavior until H16 turn-decay tuning is enabled.',
      createPolicy: createHeavyDevHardPolicy
    },
    'hard-experimental': {
      id: 'hard-experimental',
      label: '困难 AI（实验门禁）',
      difficulty: 'hard',
      description: 'Benchmark-only hard experiment variant. Defaults to hard-tuned with experimental overlays disabled.',
      createPolicy: createExperimentalHardPolicy
    }
  };
}

function resolveVariants(ids = null, options = {}) {
  const presets = createVariantPresets();
  const requested = Array.isArray(ids) && ids.length ? ids : ['easy', 'normal', 'hard-pure', 'hard-tuned'];
  return requested.map((id) => {
    const preset = presets[id];
    if (!preset) throw new Error(`Unknown arena AI variant: ${id}`);
    const variant = {
      id: preset.id,
      label: preset.label,
      difficulty: preset.difficulty,
      description: preset.description
    };
    if (typeof preset.createPolicy === 'function') {
      variant.policy = preset.createPolicy({
        experimentalOverlays: id === 'hard-experimental'
          ? normalizeExperimentalOverlays(options.experimentalOverlays || [])
          : []
      });
    }
    return variant;
  });
}

function summarizeVariantConfig(variant) {
  const policy = variant && variant.policy ? variant.policy : null;
  return {
    id: variant.id,
    label: variant.label,
    difficulty: variant.difficulty,
    description: variant.description,
    policyId: policy && policy.id ? policy.id : variant.difficulty,
    personality: policy && policy.personality ? policy.personality : null,
    hardPolicyPatch: policy && variant.difficulty === 'hard'
      ? {
          discard: policy.discard ? {
            enableNoPressureShapeReview: Boolean(policy.discard.enableNoPressureShapeReview),
            shapeStrongOverrideEnabled: Boolean(policy.discard.shapeStrongOverrideEnabled),
            enableNoPressureCleanupGuard: Boolean(policy.discard.enableNoPressureCleanupGuard),
            enableNoPressureSameXiangtingRerank: Boolean(policy.discard.enableNoPressureSameXiangtingRerank)
          } : null,
          defense: policy.defense ? {
            enableLowDangerTiebreak: Boolean(policy.defense.enableLowDangerTiebreak),
            enableEqualSafeBackstep: Boolean(policy.defense.enableEqualSafeBackstep)
          } : null,
          riichi: policy.riichi ? {
            allowNoPressureThinRiichi: Boolean(policy.riichi.allowNoPressureThinRiichi)
          } : null,
          call: policy.call ? {
            enableHardCallReview: Boolean(policy.call.enableHardCallReview),
            allowYakuhaiPeng: Boolean(policy.call.allowYakuhaiPeng),
            allowShantenImprovement: Boolean(policy.call.allowShantenImprovement),
            allowFlatSpeedUp: Boolean(policy.call.allowFlatSpeedUp)
          } : null,
          route: policy.route ? {
            enableClosedRouteValueRebalance: Boolean(policy.route.enableClosedRouteValueRebalance),
            enableBalancedRouteState: Boolean(policy.route.enableBalancedRouteState),
            closedRouteMaxXiangting: policy.route.closedRouteMaxXiangting,
            closedRouteMinRemainingTiles: policy.route.closedRouteMinRemainingTiles,
            closedRouteOverrideMinMargin: policy.route.closedRouteOverrideMinMargin,
            balancedValueOverrideMinMargin: policy.route.balancedValueOverrideMinMargin,
            balancedNeutralOverrideMinMargin: policy.route.balancedNeutralOverrideMinMargin
          } : null,
          devVariant: policy.devVariant ? clone(policy.devVariant) : null,
          experimentalOverlay: policy.experimentalOverlay ? {
            enabled: Boolean(policy.experimentalOverlay.enabled),
            overlays: Array.isArray(policy.experimentalOverlay.overlays) ? policy.experimentalOverlay.overlays.slice() : []
          } : null
        }
      : null
  };
}

function uniqueVariantsById(variants = []) {
  const seen = new Set();
  return (variants || []).filter((variant) => {
    const id = variant && variant.id ? variant.id : null;
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function parseArgs(argv) {
  const args = {
    mode: 'mixed',
    matches: DEFAULT_MATCHES,
    seed: DEFAULT_SEED,
    variants: null,
    out: null,
    smoke: false,
    progress: false,
    includeRows: false,
    stdout: DEFAULT_STDOUT_FORMAT,
    checkpointInterval: DEFAULT_CHECKPOINT_INTERVAL,
    maxStepsPerRound: DEFAULT_MAX_STEPS_PER_ROUND,
    maxRoundsPerMatch: DEFAULT_MAX_ROUNDS_PER_MATCH,
    experimentalOverlays: []
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }
    if (token === '--mode') {
      args.mode = String(argv[index + 1] || '').trim() || args.mode;
      index += 1;
      continue;
    }
    if (token === '--matches') {
      args.matches = parsePositiveInteger(argv[index + 1], args.matches);
      index += 1;
      continue;
    }
    if (token === '--seed') {
      args.seed = parsePositiveInteger(argv[index + 1], args.seed);
      index += 1;
      continue;
    }
    if (token === '--variants') {
      args.variants = String(argv[index + 1] || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
      index += 1;
      continue;
    }
    if (token === '--experimental-overlays') {
      args.experimentalOverlays = normalizeExperimentalOverlays(argv[index + 1]);
      index += 1;
      continue;
    }
    if (token === '--out') {
      args.out = String(argv[index + 1] || '').trim() || null;
      index += 1;
      continue;
    }
    if (token === '--stdout') {
      args.stdout = String(argv[index + 1] || '').trim() || args.stdout;
      index += 1;
      continue;
    }
    if (token === '--max-steps-per-round') {
      args.maxStepsPerRound = parsePositiveInteger(argv[index + 1], args.maxStepsPerRound);
      index += 1;
      continue;
    }
    if (token === '--max-rounds-per-match') {
      args.maxRoundsPerMatch = parsePositiveInteger(argv[index + 1], args.maxRoundsPerMatch);
      index += 1;
      continue;
    }
    if (token === '--checkpoint-interval') {
      const parsed = Number(argv[index + 1]);
      args.checkpointInterval = Number.isFinite(parsed) && parsed >= 0
        ? Math.floor(parsed)
        : args.checkpointInterval;
      index += 1;
      continue;
    }
    if (token === '--include-rows') {
      args.includeRows = true;
      continue;
    }
    if (token === '--progress') {
      args.progress = true;
      continue;
    }
    if (token === '--summary') {
      args.stdout = 'summary';
      continue;
    }
    if (token === '--smoke') {
      args.smoke = true;
      args.matches = SMOKE_MATCHES;
      args.mode = 'mixed';
    }
  }

  if (!['mirror', 'mixed', 'both'].includes(args.mode)) {
    throw new Error(`Unsupported arena mode: ${args.mode}`);
  }
  if (!['json', 'summary', 'both'].includes(args.stdout)) {
    throw new Error(`Unsupported stdout format: ${args.stdout}`);
  }
  if (args.variants && args.variants.length < 2 && args.mode !== 'mirror') {
    throw new Error('Mixed arena mode requires at least two variants.');
  }
  return args;
}

function printHelp() {
  console.log('Usage: node games/majiang/scripts/benchmark-ai-hanchan-arena.js [options]');
  console.log('');
  console.log('Options:');
  console.log('  --mode <mixed|mirror|both>       Default: mixed.');
  console.log('  --matches <n>                    Mixed: total hanchan. Mirror: hanchan per variant. Default: 1000.');
  console.log('  --variants <a,b,c,d>             Default: easy,normal,hard-pure,hard-tuned.');
  console.log('  --experimental-overlays <a,b>    Overlays for hard-experimental only.');
  console.log('  --seed <n>                       Deterministic base seed. Default: 20260603.');
  console.log('  --out <path>                     Write JSON report.');
  console.log('  --stdout <json|summary|both>     What to print to stdout. Default: json.');
  console.log('  --summary                        Shortcut for --stdout summary.');
  console.log('  --checkpoint-interval <n>        Update rolling summary every n hanchan. 0 disables. Default: 25.');
  console.log('  --include-rows                   Include compact match rows in the JSON report.');
  console.log('  --progress                       Print progress to stderr.');
  console.log('  --smoke                          Fast mixed-mode structure smoke.');
}

function createCountersBySeat() {
  return SEATS.reduce((result, seatKey) => {
    result[seatKey] = 0;
    return result;
  }, {});
}

function addSeatCounters(target, source) {
  SEATS.forEach((seatKey) => {
    target[seatKey] = Number(target[seatKey] || 0) + Number(source && source[seatKey] || 0);
  });
  return target;
}

function createReasonCountersBySeat() {
  return SEATS.reduce((result, seatKey) => {
    result[seatKey] = {};
    return result;
  }, {});
}

function incrementReasonCounter(container, seatKey, reason) {
  if (!container || !seatKey || !reason) return;
  if (!container[seatKey] || typeof container[seatKey] !== 'object') {
    container[seatKey] = {};
  }
  container[seatKey][reason] = Number(container[seatKey][reason] || 0) + 1;
}

function addReasonCounters(target, source) {
  Object.entries(source || {}).forEach(([reason, count]) => {
    target[reason] = Number(target[reason] || 0) + Number(count || 0);
  });
  return target;
}

function addReasonCountersBySeat(target, source) {
  SEATS.forEach((seatKey) => {
    if (!target[seatKey] || typeof target[seatKey] !== 'object') target[seatKey] = {};
    addReasonCounters(target[seatKey], source && source[seatKey]);
  });
  return target;
}

function createRoundCounters() {
  return {
    draws: createCountersBySeat(),
    discards: createCountersBySeat(),
    riichi: createCountersBySeat(),
    calls: createCountersBySeat(),
    chiCalls: createCountersBySeat(),
    pengCalls: createCountersBySeat(),
    yakuhaiPengCalls: createCountersBySeat(),
    shantenImproveCalls: createCountersBySeat(),
    flatCalls: createCountersBySeat(),
    closedCalls: createCountersBySeat(),
    closedRouteValueReviewedCalls: createCountersBySeat(),
    closedRouteValueOverrideCalls: createCountersBySeat(),
    closedRouteCallOpenScoreSum: createCountersBySeat(),
    closedRoutePassScoreSum: createCountersBySeat(),
    closedRouteMarginSum: createCountersBySeat(),
    closedRouteScoreSamples: createCountersBySeat(),
    balancedRouteStateCounts: createReasonCountersBySeat(),
    balancedRouteStateReasonCounts: createReasonCountersBySeat(),
    riichiOpportunities: createCountersBySeat(),
    reactions: createCountersBySeat(),
    callReasonCounts: createReasonCountersBySeat(),
    riichiRejectReasonCounts: createReasonCountersBySeat(),
    errors: []
  };
}

function createMatchCounters() {
  return {
    drawRounds: 0,
    draws: createCountersBySeat(),
    discards: createCountersBySeat(),
    riichi: createCountersBySeat(),
    calls: createCountersBySeat(),
    chiCalls: createCountersBySeat(),
    pengCalls: createCountersBySeat(),
    yakuhaiPengCalls: createCountersBySeat(),
    shantenImproveCalls: createCountersBySeat(),
    flatCalls: createCountersBySeat(),
    closedCalls: createCountersBySeat(),
    closedRouteValueReviewedCalls: createCountersBySeat(),
    closedRouteValueOverrideCalls: createCountersBySeat(),
    closedRouteCallOpenScoreSum: createCountersBySeat(),
    closedRoutePassScoreSum: createCountersBySeat(),
    closedRouteMarginSum: createCountersBySeat(),
    closedRouteScoreSamples: createCountersBySeat(),
    balancedRouteStateCounts: createReasonCountersBySeat(),
    balancedRouteStateReasonCounts: createReasonCountersBySeat(),
    riichiOpportunities: createCountersBySeat(),
    reactions: createCountersBySeat(),
    callReasonCounts: createReasonCountersBySeat(),
    riichiRejectReasonCounts: createReasonCountersBySeat(),
    wins: createCountersBySeat(),
    riichiWins: createCountersBySeat(),
    nonRiichiWins: createCountersBySeat(),
    tsumoWins: createCountersBySeat(),
    ronWins: createCountersBySeat(),
    dealIns: createCountersBySeat(),
    dealInRounds: createCountersBySeat(),
    drawTenpai: createCountersBySeat(),
    drawNoten: createCountersBySeat(),
    winTurnSum: createCountersBySeat(),
    winTurnSamples: createCountersBySeat(),
    winPointSum: createCountersBySeat(),
    winPointSamples: createCountersBySeat(),
    dealInPointSum: createCountersBySeat(),
    dealInPointSamples: createCountersBySeat(),
    callRounds: createCountersBySeat(),
    riichiRounds: createCountersBySeat(),
    errors: []
  };
}

function mergeRoundCounters(matchCounters, roundCounters) {
  [
    'draws',
    'discards',
    'riichi',
    'calls',
    'chiCalls',
    'pengCalls',
    'yakuhaiPengCalls',
    'shantenImproveCalls',
    'flatCalls',
    'closedCalls',
    'closedRouteValueReviewedCalls',
    'closedRouteValueOverrideCalls',
    'closedRouteCallOpenScoreSum',
    'closedRoutePassScoreSum',
    'closedRouteMarginSum',
    'closedRouteScoreSamples',
    'riichiOpportunities',
    'reactions'
  ].forEach((key) => {
    addSeatCounters(matchCounters[key], roundCounters[key]);
  });
  addReasonCountersBySeat(matchCounters.callReasonCounts, roundCounters.callReasonCounts);
  addReasonCountersBySeat(matchCounters.riichiRejectReasonCounts, roundCounters.riichiRejectReasonCounts);
  addReasonCountersBySeat(matchCounters.balancedRouteStateCounts, roundCounters.balancedRouteStateCounts);
  addReasonCountersBySeat(matchCounters.balancedRouteStateReasonCounts, roundCounters.balancedRouteStateReasonCounts);
  SEATS.forEach((seatKey) => {
    if (Number(roundCounters && roundCounters.calls && roundCounters.calls[seatKey] || 0) > 0) {
      matchCounters.callRounds[seatKey] += 1;
    }
    if (Number(roundCounters && roundCounters.riichi && roundCounters.riichi[seatKey] || 0) > 0) {
      matchCounters.riichiRounds[seatKey] += 1;
    }
  });
  if (Array.isArray(roundCounters.errors) && roundCounters.errors.length) {
    matchCounters.errors.push(...roundCounters.errors);
  }
  return matchCounters;
}

function deriveRoundSeed(baseSeed, matchIndex, roundIndex, salt = 0) {
  return (
    (Number(baseSeed) >>> 0)
    + Math.imul(Number(matchIndex + 1) >>> 0, 1000003)
    + Math.imul(Number(roundIndex + 1) >>> 0, 9176)
    + Math.imul(Number(salt + 1) >>> 0, 131)
  ) >>> 0;
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

function buildPlayers(assignments) {
  return SEATS.map((seatKey) => {
    const variant = assignments[seatKey];
    return {
      seat: seatKey,
      title: seatKey,
      name: variant ? variant.label : seatKey,
      human: false,
      ai: {
        enabled: true,
        difficulty: variant ? variant.difficulty : 'normal',
        profile: 'default'
      }
    };
  });
}

function buildRuntimeConfig(baseConfig, matchState, assignments) {
  const roundConfig = {
    ...(baseConfig.round || {}),
    zhuangfeng: Number(matchState.zhuangfeng || 0),
    jushu: Number(matchState.jushu || 0),
    changbang: Number(matchState.changbang || 0),
    lizhibang: Number(matchState.lizhibang || 0),
    ruleset: matchState.ruleset || baseConfig.ruleset || 'riichi-4p',
    defen: SEATS.map((seatKey) => Number(matchState.scores && matchState.scores[seatKey] != null
      ? matchState.scores[seatKey]
      : 25000))
  };
  return {
    ...baseConfig,
    mode: 'single-round',
    tableSize: 4,
    ruleset: 'riichi-4p',
    players: buildPlayers(assignments),
    ai: {
      ...(baseConfig.ai || {}),
      defaultDifficulty: 'normal'
    },
    ruleOverrides: clone(matchState.ruleConfig || baseConfig.ruleOverrides || {}),
    round: roundConfig,
    engine: {
      ...(baseConfig.engine || {}),
      wall: {
        ...((baseConfig.engine && baseConfig.engine.wall) || {}),
        preset: false
      }
    }
  };
}

function decisionContextForSeat(assignments, seatKey) {
  const variant = assignments[seatKey];
  const context = {
    benchmark: 'ai-hanchan-arena',
    arenaVariant: variant ? variant.id : null
  };
  if (variant && variant.policy) {
    context.policy = clone(variant.policy);
  }
  return context;
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

function passSeat(runtime, seatKey) {
  if (runtime && runtime.pendingReaction && seatKey) {
    runtime.passReaction(seatKey, { reason: 'ai-hanchan-arena-pass' });
  }
}

function handleHuleReactions(runtime, huleActions, roundCounters) {
  if (!Array.isArray(huleActions) || !huleActions.length) return false;
  if (huleActions.length === 1) {
    const action = huleActions[0];
    const seatKey = action && action.payload ? action.payload.seat : null;
    if (seatKey) roundCounters.reactions[seatKey] += 1;
    runtime.resolveHule(seatKey, {
      ...(action.payload || {}),
      finalizeImmediately: true
    });
    return true;
  }

  huleActions.forEach((action) => {
    const seatKey = action && action.payload ? action.payload.seat : null;
    if (!seatKey || !runtime.pendingReaction) return;
    roundCounters.reactions[seatKey] += 1;
    runtime.dispatch(action);
  });
  getReactionSeats(runtime).forEach((seatKey) => passSeat(runtime, seatKey));
  return true;
}

function isSeatClosed(runtime, seatKey) {
  const seatIndex = runtime && typeof runtime.getSeatIndex === 'function'
    ? runtime.getSeatIndex(seatKey)
    : -1;
  const shoupai = seatIndex >= 0 && runtime && runtime.board && Array.isArray(runtime.board.shoupai)
    ? runtime.board.shoupai[seatIndex]
    : null;
  return Boolean(shoupai && Array.isArray(shoupai._fulou) && shoupai._fulou.length === 0);
}

function recordClosedRouteValueDiagnostics(roundCounters, seatKey, decision, options = {}) {
  if (!roundCounters || !seatKey || !decision) return;
  const aiDecision = decision.aiDecision && typeof decision.aiDecision === 'object'
    ? decision.aiDecision
    : {};
  const hardCallMetrics = aiDecision.hardCallMetrics && typeof aiDecision.hardCallMetrics === 'object'
    ? aiDecision.hardCallMetrics
    : {};
  const review = hardCallMetrics.closedRouteValueReview && typeof hardCallMetrics.closedRouteValueReview === 'object'
    ? hardCallMetrics.closedRouteValueReview
    : null;
  if (!review || review.active !== true) return;

  roundCounters.closedRouteValueReviewedCalls[seatKey] += 1;
  if (review.override === true) {
    roundCounters.closedRouteValueOverrideCalls[seatKey] += 1;
  }

  const callOpenRouteScore = Number(review.callOpenRouteScore);
  const passClosedRouteScore = Number(review.passClosedRouteScore);
  const margin = Number(review.margin);
  if (
    Number.isFinite(callOpenRouteScore)
    && Number.isFinite(passClosedRouteScore)
    && Number.isFinite(margin)
  ) {
    roundCounters.closedRouteCallOpenScoreSum[seatKey] += callOpenRouteScore;
    roundCounters.closedRoutePassScoreSum[seatKey] += passClosedRouteScore;
    roundCounters.closedRouteMarginSum[seatKey] += margin;
    roundCounters.closedRouteScoreSamples[seatKey] += 1;
  }
  if (typeof review.balancedState === 'string' && review.balancedState) {
    incrementReasonCounter(roundCounters.balancedRouteStateCounts, seatKey, review.balancedState);
  }
  if (Array.isArray(review.balancedStateReasons)) {
    review.balancedStateReasons.forEach((reason) => (
      incrementReasonCounter(roundCounters.balancedRouteStateReasonCounts, seatKey, reason)
    ));
  }

  if (options.recordReasons === true) {
    const reasons = Array.isArray(aiDecision.reasons) ? aiDecision.reasons : [];
    reasons.forEach((reason) => incrementReasonCounter(roundCounters.callReasonCounts, seatKey, reason));
  }
}

function recordCallDiagnostics(runtime, roundCounters, seatKey, decision) {
  if (!roundCounters || !seatKey || !decision || !decision.payload) return;
  const callType = typeof decision.payload.callType === 'string' ? decision.payload.callType : null;
  const aiDecision = decision.aiDecision && typeof decision.aiDecision === 'object'
    ? decision.aiDecision
    : {};
  const reasons = Array.isArray(aiDecision.reasons) ? aiDecision.reasons : [];
  const metrics = aiDecision.metrics && typeof aiDecision.metrics === 'object' ? aiDecision.metrics : {};
  const hardCallMetrics = aiDecision.hardCallMetrics && typeof aiDecision.hardCallMetrics === 'object'
    ? aiDecision.hardCallMetrics
    : {};
  const currentXiangting = Number(hardCallMetrics.currentXiangting);
  const nextXiangting = Number.isFinite(Number(metrics.xiangting))
    ? Number(metrics.xiangting)
    : Number(hardCallMetrics.nextXiangting);
  const closedBefore = hardCallMetrics.closedHandBefore === true
    || (!Object.prototype.hasOwnProperty.call(hardCallMetrics, 'closedHandBefore') && isSeatClosed(runtime, seatKey));
  const reasonText = reasons.join(' ');

  if (callType === 'chi') roundCounters.chiCalls[seatKey] += 1;
  if (callType === 'peng') roundCounters.pengCalls[seatKey] += 1;
  if (callType === 'peng' && (hardCallMetrics.isYakuhaiPeng === true || reasonText.includes('yakuhai-peng'))) {
    roundCounters.yakuhaiPengCalls[seatKey] += 1;
  }
  if (closedBefore) {
    roundCounters.closedCalls[seatKey] += 1;
  }
  if (Number.isFinite(currentXiangting) && Number.isFinite(nextXiangting)) {
    if (nextXiangting < currentXiangting) roundCounters.shantenImproveCalls[seatKey] += 1;
    if (nextXiangting === currentXiangting) roundCounters.flatCalls[seatKey] += 1;
  } else {
    if (reasonText.includes('improves-xiangting')) roundCounters.shantenImproveCalls[seatKey] += 1;
    if (reasonText.includes('flat-speed-up')) roundCounters.flatCalls[seatKey] += 1;
  }
  recordClosedRouteValueDiagnostics(roundCounters, seatKey, decision);
  reasons.forEach((reason) => incrementReasonCounter(roundCounters.callReasonCounts, seatKey, reason));
}

function recordRiichiOpportunity(runtime, seatKey, decision, roundCounters) {
  if (!runtime || !seatKey || !decision || !roundCounters) return;
  if (!isSeatClosed(runtime, seatKey)) return;
  const metrics = decision.metrics && typeof decision.metrics === 'object' ? decision.metrics : {};
  if (Number(metrics.xiangting) !== 0) return;
  const riichiDecision = decision.riichiDecision && typeof decision.riichiDecision === 'object'
    ? decision.riichiDecision
    : null;
  const reasons = Array.isArray(riichiDecision && riichiDecision.reasons) ? riichiDecision.reasons : [];
  const illegalReasons = new Set([
    'riichi-not-tenpai',
    'riichi-illegal-discard-choice',
    'riichi-disabled-by-ruleset',
    'riichi-invalid-seat',
    'riichi-missing-context'
  ]);
  if (reasons.some((reason) => illegalReasons.has(reason))) return;
  roundCounters.riichiOpportunities[seatKey] += 1;
  if (!decision.shouldRiichi) {
    const reason = reasons[0] || 'riichi-rejected-unknown';
    incrementReasonCounter(roundCounters.riichiRejectReasonCounts, seatKey, reason);
  }
}

function handleReaction(runtime, aiController, assignments, roundCounters) {
  while (runtime && runtime.pendingReaction && getPhase(runtime) === ROUND_PHASES.AWAIT_REACTION) {
    const sortedActions = sortActiveReactionActions(runtime);
    if (!sortedActions.length) {
      getReactionSeats(runtime).forEach((seatKey) => passSeat(runtime, seatKey));
      return;
    }

    const huleActions = sortedActions.filter((action) => action && action.type === 'hule');
    if (huleActions.length) {
      handleHuleReactions(runtime, huleActions, roundCounters);
      return;
    }

    const topAction = sortedActions[0];
    const seatKey = topAction && topAction.payload ? topAction.payload.seat : null;
    if (!seatKey) return;
    const seatActions = sortedActions.filter((action) => (
      action && action.payload && action.payload.seat === seatKey
    ));
    const decision = aiController.chooseReaction(
      seatKey,
      seatActions,
      decisionContextForSeat(assignments, seatKey)
    );
    if (decision && decision.type !== 'pass') {
      roundCounters.calls[seatKey] += 1;
      recordCallDiagnostics(runtime, roundCounters, seatKey, decision);
      runtime.dispatch(decision);
      roundCounters.reactions[seatKey] += 1;
      return;
    }

    if (decision && decision.type === 'pass') {
      recordClosedRouteValueDiagnostics(roundCounters, seatKey, decision, { recordReasons: true });
    }
    passSeat(runtime, seatKey);
  }
}

function normalizeDiscardTile(decision, runtime, seatKey) {
  if (decision && typeof decision.tileCode === 'string' && decision.tileCode) {
    return decision.tileCode;
  }
  const handCodes = runtime.getSeatHandCodes(seatKey);
  return handCodes[handCodes.length - 1];
}

function runOneRound(baseConfig, matchState, assignments, options = {}) {
  const seed = Number(options.seed || DEFAULT_SEED);
  const runtimeConfig = buildRuntimeConfig(baseConfig, matchState, assignments);
  const runtime = createSeededRuntime(runtimeConfig, seed);
  const aiController = baseAiApi.createAiController(runtime, runtimeConfig);
  const counters = createRoundCounters();

  runtime.start();

  for (let step = 0; step < Number(options.maxStepsPerRound || DEFAULT_MAX_STEPS_PER_ROUND); step += 1) {
    const phase = getPhase(runtime);
    if (phase === ROUND_PHASES.ROUND_END) break;

    try {
      if (phase === ROUND_PHASES.AWAIT_DRAW) {
        const seatKey = runtime.getCurrentTurnSeat();
        if (runtime.getWallState().remaining <= 0) {
          runtime.resolveDraw('exhaustive-draw');
          break;
        }
        runtime.drawTile(seatKey);
        counters.draws[seatKey] += 1;
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

        const decision = aiController.chooseDiscard(seatKey, decisionContextForSeat(assignments, seatKey));
        const tileCode = normalizeDiscardTile(decision, runtime, seatKey);
        const shouldRiichi = Boolean(decision && decision.shouldRiichi);
        recordRiichiOpportunity(runtime, seatKey, decision, counters);
        runtime.discardTile(seatKey, tileCode, {
          riichi: shouldRiichi
        });
        counters.discards[seatKey] += 1;
        if (shouldRiichi) counters.riichi[seatKey] += 1;
        continue;
      }

      if (phase === ROUND_PHASES.AWAIT_REACTION) {
        handleReaction(runtime, aiController, assignments, counters);
        continue;
      }

      counters.errors.push(`unsupported phase: ${phase}`);
      break;
    } catch (error) {
      counters.errors.push(error && error.message ? error.message : String(error));
      break;
    }
  }

  if (getPhase(runtime) !== ROUND_PHASES.ROUND_END && !counters.errors.length) {
    counters.errors.push(`round-step-limit:${getPhase(runtime)}`);
  }

  return {
    seed,
    completed: getPhase(runtime) === ROUND_PHASES.ROUND_END,
    phase: getPhase(runtime),
    counters,
    scores: runtime.getScoreMap(),
    roundResult: runtime.roundResult || null
  };
}

function getRoundTurnEstimate(roundCounters) {
  const totalDiscards = SEATS.reduce((sum, seatKey) => (
    sum + Number(roundCounters && roundCounters.discards && roundCounters.discards[seatKey] || 0)
  ), 0);
  return totalDiscards > 0 ? Math.max(1, Math.ceil(totalDiscards / SEATS.length)) : 0;
}

function getScoreDelta(scoresBefore, scoresAfter, seatKey) {
  return Number(scoresAfter && scoresAfter[seatKey] || 0) - Number(scoresBefore && scoresBefore[seatKey] || 0);
}

function getSettlementResult(entry, roundResult) {
  if (entry && entry.result && typeof entry.result === 'object') return entry.result;
  if (roundResult && roundResult.result && typeof roundResult.result === 'object') return roundResult.result;
  return null;
}

function getWinPoint(entry, roundResult, scoresBefore, scoresAfter, winnerSeat) {
  const scoreDelta = getScoreDelta(scoresBefore, scoresAfter, winnerSeat);
  if (scoreDelta > 0) return scoreDelta;
  const result = getSettlementResult(entry, roundResult);
  const defen = Number(result && result.defen);
  return Number.isFinite(defen) && defen > 0 ? defen : 0;
}

function getDealInPoint(entry, roundResult, scoresBefore, scoresAfter, fromSeat) {
  const result = getSettlementResult(entry, roundResult);
  const defen = Number(result && result.defen);
  if (Number.isFinite(defen) && defen > 0) return defen;
  const scoreDelta = getScoreDelta(scoresBefore, scoresAfter, fromSeat);
  return scoreDelta < 0 ? Math.abs(scoreDelta) : 0;
}

function recordDrawOutcome(matchCounters, roundResult) {
  if (!roundResult || roundResult.type !== 'draw') return;
  matchCounters.drawRounds += 1;
  const tenpaiSeats = new Set(Array.isArray(roundResult.tenpaiSeats) ? roundResult.tenpaiSeats : []);
  const notenSeats = new Set(Array.isArray(roundResult.notenSeats) ? roundResult.notenSeats : []);
  SEATS.forEach((seatKey) => {
    if (tenpaiSeats.has(seatKey)) matchCounters.drawTenpai[seatKey] += 1;
    if (notenSeats.has(seatKey)) matchCounters.drawNoten[seatKey] += 1;
  });
}

function recordRoundOutcome(matchCounters, roundResult, scoresBefore, scoresAfter, roundCounters) {
  if (!roundResult) return;
  recordDrawOutcome(matchCounters, roundResult);
  if (roundResult.type !== 'hule') return;
  const winTurn = getRoundTurnEstimate(roundCounters);
  const dealInSeatsThisRound = new Set();
  const winners = Array.isArray(roundResult.winners) && roundResult.winners.length
    ? roundResult.winners
    : [{
        winnerSeat: roundResult.winnerSeat,
        fromSeat: roundResult.fromSeat || null,
        result: roundResult.result || null,
        riichi: Boolean(roundResult.riichi)
      }];
  winners.forEach((entry) => {
    const winnerSeat = entry && entry.winnerSeat ? entry.winnerSeat : null;
    const fromSeat = entry && entry.fromSeat ? entry.fromSeat : roundResult.fromSeat || null;
    if (winnerSeat && matchCounters.wins[winnerSeat] != null) {
      matchCounters.wins[winnerSeat] += 1;
      const winnerRiichi = Boolean(entry && entry.riichi != null ? entry.riichi : roundResult.riichi);
      if (winnerRiichi) matchCounters.riichiWins[winnerSeat] += 1;
      else matchCounters.nonRiichiWins[winnerSeat] += 1;
      if (fromSeat) matchCounters.ronWins[winnerSeat] += 1;
      else matchCounters.tsumoWins[winnerSeat] += 1;
      const winPoint = getWinPoint(entry, roundResult, scoresBefore, scoresAfter, winnerSeat);
      if (winPoint > 0) {
        matchCounters.winPointSum[winnerSeat] += winPoint;
        matchCounters.winPointSamples[winnerSeat] += 1;
      }
      if (winTurn > 0) {
        matchCounters.winTurnSum[winnerSeat] += winTurn;
        matchCounters.winTurnSamples[winnerSeat] += 1;
      }
    }
    if (fromSeat && matchCounters.dealIns[fromSeat] != null) {
      matchCounters.dealIns[fromSeat] += 1;
      dealInSeatsThisRound.add(fromSeat);
      const dealInPoint = getDealInPoint(entry, roundResult, scoresBefore, scoresAfter, fromSeat);
      if (dealInPoint > 0) {
        matchCounters.dealInPointSum[fromSeat] += dealInPoint;
        matchCounters.dealInPointSamples[fromSeat] += 1;
      }
    }
  });
  dealInSeatsThisRound.forEach((seatKey) => {
    if (matchCounters.dealInRounds[seatKey] != null) {
      matchCounters.dealInRounds[seatKey] += 1;
    }
  });
}

function computeRanks(scores) {
  const ordered = SEATS
    .map((seatKey) => ({
      seatKey,
      score: Number(scores && scores[seatKey] || 0)
    }))
    .sort((left, right) => (
      right.score - left.score
      || SEATS.indexOf(left.seatKey) - SEATS.indexOf(right.seatKey)
    ));
  return ordered.reduce((result, entry, index) => {
    result[entry.seatKey] = index + 1;
    return result;
  }, {});
}

function createInitialMatchState(baseConfig) {
  return matchStateHelpers.createInitialMatchState({
    ruleset: 'riichi-4p',
    seatKeys: SEATS.slice(),
    ruleConfig: baseConfig.ruleOverrides || {},
    gameLength: baseConfig.gameLength || 'east-south',
    startingScore: 25000,
    targetScore: Number(baseConfig.targetScore || 30000),
    qijia: 0,
    zhuangfeng: 0,
    jushu: 0
  });
}

function runOneMatch(baseConfig, assignments, options = {}) {
  let matchState = createInitialMatchState(baseConfig);
  const counters = createMatchCounters();
  const roundRows = [];
  const mode = options.mode || 'mixed';
  const matchIndex = Number(options.matchIndex || 0);

  for (let roundIndex = 0; roundIndex < Number(options.maxRoundsPerMatch || DEFAULT_MAX_ROUNDS_PER_MATCH); roundIndex += 1) {
    if (matchState.finished) break;
    const roundSeed = deriveRoundSeed(options.seed || DEFAULT_SEED, matchIndex, roundIndex, options.seedSalt || 0);
    const scoresBeforeRound = clone(matchState.scores || {});
    const row = runOneRound(baseConfig, matchState, assignments, {
      seed: roundSeed,
      maxStepsPerRound: options.maxStepsPerRound
    });
    roundRows.push({
      seed: row.seed,
      completed: row.completed,
      phase: row.phase,
      roundLabel: matchStateHelpers.getRoundLabel(matchState.zhuangfeng, matchState.jushu),
      resultType: row.roundResult ? row.roundResult.type : null,
      winnerSeat: row.roundResult ? row.roundResult.winnerSeat || null : null,
      winnerSeats: row.roundResult && Array.isArray(row.roundResult.winnerSeats)
        ? row.roundResult.winnerSeats.slice()
        : [],
      fromSeat: row.roundResult ? row.roundResult.fromSeat || null : null,
      scores: clone(row.scores),
      errorCount: row.counters.errors.length
    });
    mergeRoundCounters(counters, row.counters);
    recordRoundOutcome(counters, row.roundResult, scoresBeforeRound, row.scores, row.counters);

    if (!row.completed || !row.roundResult) {
      counters.errors.push(`match-round-incomplete:${roundIndex}:${row.phase}`);
      break;
    }

    const transitionDecision = roundTransitionHelpers.resolveRoundTransition(matchState, row.roundResult);
    matchState = roundTransitionHelpers.applyTransitionToMatchState(matchState, transitionDecision);
  }

  if (!matchState.finished && roundRows.length >= Number(options.maxRoundsPerMatch || DEFAULT_MAX_ROUNDS_PER_MATCH)) {
    counters.errors.push(`match-round-limit:${roundRows.length}`);
  }

  const finalScores = clone(matchState.scores || {});
  const ranks = computeRanks(finalScores);
  const seatResults = SEATS.map((seatKey) => ({
    seat: seatKey,
    variant: assignments[seatKey] ? assignments[seatKey].id : null,
    score: Number(finalScores[seatKey] || 0),
    rank: ranks[seatKey]
  }));

  return {
    mode,
    matchIndex,
    completed: Boolean(matchState.finished) && counters.errors.length === 0,
    finishReason: matchState.finishReason || (matchState.finished ? 'finished' : 'not-finished'),
    rounds: roundRows.length,
    finalScores,
    ranks,
    seatVariants: SEATS.reduce((result, seatKey) => {
      result[seatKey] = assignments[seatKey] ? assignments[seatKey].id : null;
      return result;
    }, {}),
    seatResults,
    counters,
    roundRows
  };
}

function buildMixedAssignments(variants, matchIndex) {
  return SEATS.reduce((result, seatKey, seatIndex) => {
    result[seatKey] = variants[(seatIndex + matchIndex) % variants.length];
    return result;
  }, {});
}

function buildMirrorAssignments(variant) {
  return SEATS.reduce((result, seatKey) => {
    result[seatKey] = variant;
    return result;
  }, {});
}

function createEmptyVariantStats() {
  return {
    appearances: 0,
    matchWins: 0,
    rankSum: 0,
    averageRank: 0,
    averageScore: 0,
    scoreSum: 0,
    finalScoreDeltaSum: 0,
    firstRate: 0,
    secondRate: 0,
    thirdRate: 0,
    fourthRate: 0,
    rankCounts: { 1: 0, 2: 0, 3: 0, 4: 0 },
    seatAppearances: createCountersBySeat(),
    roundsSeen: 0,
    drawRounds: 0,
    huleWins: 0,
    riichiWins: 0,
    nonRiichiWins: 0,
    tsumoWins: 0,
    ronWins: 0,
    dealIns: 0,
    dealInRounds: 0,
    drawTenpai: 0,
    drawNoten: 0,
    flownCount: 0,
    draws: 0,
    discards: 0,
    riichi: 0,
    riichiRounds: 0,
    calls: 0,
    callRounds: 0,
    chiCalls: 0,
    pengCalls: 0,
    yakuhaiPengCalls: 0,
    shantenImproveCalls: 0,
    flatCalls: 0,
    closedCalls: 0,
    closedRouteValueReviewedCalls: 0,
    closedRouteValueOverrideCalls: 0,
    closedRouteCallOpenScoreSum: 0,
    closedRoutePassScoreSum: 0,
    closedRouteMarginSum: 0,
    closedRouteScoreSamples: 0,
    balancedRouteStateCounts: {},
    balancedRouteStateReasonCounts: {},
    riichiOpportunities: 0,
    callReasonCounts: {},
    riichiRejectReasonCounts: {},
    winTurnSum: 0,
    winTurnSamples: 0,
    winPointSum: 0,
    winPointSamples: 0,
    dealInPointSum: 0,
    dealInPointSamples: 0,
    winRatePerRound: 0,
    dealInRatePerRound: 0,
    dealInPaymentRatePerRound: 0,
    tsumoRatePerRound: 0,
    tsumoShareOfWins: 0,
    ronRatePerRound: 0,
    ronShareOfWins: 0,
    drawRatePerRound: 0,
    drawTenpaiRate: 0,
    nonRiichiWinRate: 0,
    riichiWinRate: 0,
    riichiRatePerRound: 0,
    riichiRoundRate: 0,
    riichiPerDiscard: 0,
    riichiOpportunityPerRound: 0,
    riichiOpportunityTakeRate: 0,
    callRoundRate: 0,
    callRatePerDiscard: 0,
    callPerRound: 0,
    chiCallPerRound: 0,
    pengCallPerRound: 0,
    closedCallPerRound: 0,
    flatCallPerRound: 0,
    shantenImproveCallPerRound: 0,
    yakuhaiPengCallPerRound: 0,
    closedRouteReviewPerRound: 0,
    closedRouteOverridePerRound: 0,
    averageCallOpenRouteScore: 0,
    averagePassClosedRouteScore: 0,
    closedRouteMarginAverage: 0,
    averageWinTurn: 0,
    averageWinPoints: 0,
    averageDealInPoints: 0,
    flownRate: 0,
    uncertainty: {},
    recordPanel: {}
  };
}

function safeRate(count, total) {
  return total > 0 ? count / total : 0;
}

function binomialStandardError(rate, total) {
  const number = Number(rate);
  const denominator = Number(total);
  if (!Number.isFinite(number) || !Number.isFinite(denominator) || denominator <= 0) return 0;
  return Math.sqrt(Math.max(0, number * (1 - number)) / denominator);
}

function computeAverageRankStandardError(stats) {
  const appearances = Number(stats && stats.appearances || 0);
  if (appearances <= 0) return 0;
  const mean = Number(stats.averageRank || 0);
  const rankCounts = stats.rankCounts || {};
  const secondMoment = [1, 2, 3, 4].reduce((sum, rank) => (
    sum + (rank * rank * Number(rankCounts[rank] || 0))
  ), 0) / appearances;
  const variance = Math.max(0, secondMoment - mean * mean);
  return Math.sqrt(variance / appearances);
}

function addUncertainty(stats) {
  stats.uncertainty = {
    averageRankStandardError: computeAverageRankStandardError(stats),
    firstRateStandardError: binomialStandardError(stats.firstRate, stats.appearances),
    fourthRateStandardError: binomialStandardError(stats.fourthRate, stats.appearances),
    winRatePerRoundStandardError: binomialStandardError(stats.winRatePerRound, stats.roundsSeen),
    dealInRatePerRoundStandardError: binomialStandardError(stats.dealInRatePerRound, stats.roundsSeen)
  };
  return stats;
}

function finalizeVariantStats(stats) {
  stats.averageRank = safeRate(stats.rankSum, stats.appearances);
  stats.averageScore = safeRate(stats.scoreSum, stats.appearances);
  stats.averageFinalScoreDelta = safeRate(stats.finalScoreDeltaSum, stats.appearances);
  stats.firstRate = safeRate(stats.rankCounts[1], stats.appearances);
  stats.secondRate = safeRate(stats.rankCounts[2], stats.appearances);
  stats.thirdRate = safeRate(stats.rankCounts[3], stats.appearances);
  stats.fourthRate = safeRate(stats.rankCounts[4], stats.appearances);
  stats.winRatePerRound = safeRate(stats.huleWins, stats.roundsSeen);
  stats.dealInRatePerRound = safeRate(stats.dealInRounds || stats.dealIns, stats.roundsSeen);
  stats.dealInPaymentRatePerRound = safeRate(stats.dealIns, stats.roundsSeen);
  stats.tsumoRatePerRound = safeRate(stats.tsumoWins, stats.roundsSeen);
  stats.tsumoShareOfWins = safeRate(stats.tsumoWins, stats.huleWins);
  stats.ronRatePerRound = safeRate(stats.ronWins, stats.roundsSeen);
  stats.ronShareOfWins = safeRate(stats.ronWins, stats.huleWins);
  stats.drawRatePerRound = safeRate(stats.drawRounds, stats.roundsSeen);
  stats.drawTenpaiRate = safeRate(stats.drawTenpai, stats.drawRounds);
  stats.nonRiichiWinRate = safeRate(stats.nonRiichiWins, stats.huleWins);
  stats.riichiWinRate = safeRate(stats.riichiWins, stats.huleWins);
  stats.riichiRatePerRound = safeRate(stats.riichi, stats.roundsSeen);
  stats.riichiRoundRate = safeRate(stats.riichiRounds || stats.riichi, stats.roundsSeen);
  stats.riichiPerDiscard = safeRate(stats.riichi, stats.discards);
  stats.riichiOpportunityPerRound = safeRate(stats.riichiOpportunities, stats.roundsSeen);
  stats.riichiOpportunityTakeRate = safeRate(stats.riichi, stats.riichiOpportunities);
  stats.callRoundRate = safeRate(stats.callRounds, stats.roundsSeen);
  stats.callRatePerDiscard = safeRate(stats.calls, stats.discards + stats.calls);
  stats.callPerRound = safeRate(stats.calls, stats.roundsSeen);
  stats.chiCallPerRound = safeRate(stats.chiCalls, stats.roundsSeen);
  stats.pengCallPerRound = safeRate(stats.pengCalls, stats.roundsSeen);
  stats.closedCallPerRound = safeRate(stats.closedCalls, stats.roundsSeen);
  stats.flatCallPerRound = safeRate(stats.flatCalls, stats.roundsSeen);
  stats.shantenImproveCallPerRound = safeRate(stats.shantenImproveCalls, stats.roundsSeen);
  stats.yakuhaiPengCallPerRound = safeRate(stats.yakuhaiPengCalls, stats.roundsSeen);
  stats.closedRouteReviewPerRound = safeRate(stats.closedRouteValueReviewedCalls, stats.roundsSeen);
  stats.closedRouteOverridePerRound = safeRate(stats.closedRouteValueOverrideCalls, stats.roundsSeen);
  stats.averageCallOpenRouteScore = safeRate(stats.closedRouteCallOpenScoreSum, stats.closedRouteScoreSamples);
  stats.averagePassClosedRouteScore = safeRate(stats.closedRoutePassScoreSum, stats.closedRouteScoreSamples);
  stats.closedRouteMarginAverage = safeRate(stats.closedRouteMarginSum, stats.closedRouteScoreSamples);
  stats.averageWinTurn = safeRate(stats.winTurnSum, stats.winTurnSamples);
  stats.averageWinPoints = safeRate(stats.winPointSum, stats.winPointSamples);
  stats.averageDealInPoints = safeRate(stats.dealInPointSum, stats.dealInPointSamples);
  stats.flownRate = safeRate(stats.flownCount, stats.appearances);
  addUncertainty(stats);
  stats.recordPanel = buildVariantRecordPanel(stats);
  return stats;
}

function summarizeMatchRows(rows, variants) {
  const variantStats = variants.reduce((result, variant) => {
    result[variant.id] = createEmptyVariantStats();
    return result;
  }, {});
  const totals = {
    matches: rows.length,
    completedMatches: rows.filter((row) => row.completed).length,
    rounds: rows.reduce((sum, row) => sum + Number(row.rounds || 0), 0),
    drawRounds: rows.reduce((sum, row) => sum + Number(row.counters && row.counters.drawRounds || 0), 0),
    errorCount: rows.reduce((sum, row) => (
      sum + (row.counters && Array.isArray(row.counters.errors) ? row.counters.errors.length : 0)
    ), 0),
    finishReasons: {}
  };

  rows.forEach((row) => {
    const reason = row.finishReason || 'unknown';
    totals.finishReasons[reason] = (totals.finishReasons[reason] || 0) + 1;
    (row.seatResults || []).forEach((seatResult) => {
      const stats = variantStats[seatResult.variant];
      if (!stats) return;
      const seatKey = seatResult.seat;
      stats.appearances += 1;
      stats.rankSum += Number(seatResult.rank || 0);
      stats.scoreSum += Number(seatResult.score || 0);
      stats.finalScoreDeltaSum += Number(seatResult.score || 0) - 25000;
      if (seatResult.rank === 1) stats.matchWins += 1;
      if (stats.rankCounts[seatResult.rank] != null) stats.rankCounts[seatResult.rank] += 1;
      if (stats.seatAppearances[seatKey] != null) stats.seatAppearances[seatKey] += 1;
      if (Number(seatResult.score || 0) < 0) stats.flownCount += 1;
      stats.roundsSeen += Number(row.rounds || 0);
      const counters = row.counters || {};
      stats.drawRounds += Number(counters.drawRounds || 0);
      stats.huleWins += Number(counters.wins && counters.wins[seatKey] || 0);
      stats.riichiWins += Number(counters.riichiWins && counters.riichiWins[seatKey] || 0);
      stats.nonRiichiWins += Number(counters.nonRiichiWins && counters.nonRiichiWins[seatKey] || 0);
      stats.tsumoWins += Number(counters.tsumoWins && counters.tsumoWins[seatKey] || 0);
      stats.ronWins += Number(counters.ronWins && counters.ronWins[seatKey] || 0);
      stats.dealIns += Number(counters.dealIns && counters.dealIns[seatKey] || 0);
      stats.dealInRounds += Number(counters.dealInRounds && counters.dealInRounds[seatKey] || 0);
      stats.drawTenpai += Number(counters.drawTenpai && counters.drawTenpai[seatKey] || 0);
      stats.drawNoten += Number(counters.drawNoten && counters.drawNoten[seatKey] || 0);
      stats.draws += Number(counters.draws && counters.draws[seatKey] || 0);
      stats.discards += Number(counters.discards && counters.discards[seatKey] || 0);
      stats.riichi += Number(counters.riichi && counters.riichi[seatKey] || 0);
      stats.riichiRounds += Number(counters.riichiRounds && counters.riichiRounds[seatKey] || 0);
      stats.calls += Number(counters.calls && counters.calls[seatKey] || 0);
      stats.callRounds += Number(counters.callRounds && counters.callRounds[seatKey] || 0);
      stats.chiCalls += Number(counters.chiCalls && counters.chiCalls[seatKey] || 0);
      stats.pengCalls += Number(counters.pengCalls && counters.pengCalls[seatKey] || 0);
      stats.yakuhaiPengCalls += Number(counters.yakuhaiPengCalls && counters.yakuhaiPengCalls[seatKey] || 0);
      stats.shantenImproveCalls += Number(counters.shantenImproveCalls && counters.shantenImproveCalls[seatKey] || 0);
      stats.flatCalls += Number(counters.flatCalls && counters.flatCalls[seatKey] || 0);
      stats.closedCalls += Number(counters.closedCalls && counters.closedCalls[seatKey] || 0);
      stats.closedRouteValueReviewedCalls += Number(counters.closedRouteValueReviewedCalls && counters.closedRouteValueReviewedCalls[seatKey] || 0);
      stats.closedRouteValueOverrideCalls += Number(counters.closedRouteValueOverrideCalls && counters.closedRouteValueOverrideCalls[seatKey] || 0);
      stats.closedRouteCallOpenScoreSum += Number(counters.closedRouteCallOpenScoreSum && counters.closedRouteCallOpenScoreSum[seatKey] || 0);
      stats.closedRoutePassScoreSum += Number(counters.closedRoutePassScoreSum && counters.closedRoutePassScoreSum[seatKey] || 0);
      stats.closedRouteMarginSum += Number(counters.closedRouteMarginSum && counters.closedRouteMarginSum[seatKey] || 0);
      stats.closedRouteScoreSamples += Number(counters.closedRouteScoreSamples && counters.closedRouteScoreSamples[seatKey] || 0);
      stats.riichiOpportunities += Number(counters.riichiOpportunities && counters.riichiOpportunities[seatKey] || 0);
      addReasonCounters(stats.callReasonCounts, counters.callReasonCounts && counters.callReasonCounts[seatKey]);
      addReasonCounters(stats.riichiRejectReasonCounts, counters.riichiRejectReasonCounts && counters.riichiRejectReasonCounts[seatKey]);
      addReasonCounters(stats.balancedRouteStateCounts, counters.balancedRouteStateCounts && counters.balancedRouteStateCounts[seatKey]);
      addReasonCounters(stats.balancedRouteStateReasonCounts, counters.balancedRouteStateReasonCounts && counters.balancedRouteStateReasonCounts[seatKey]);
      stats.winTurnSum += Number(counters.winTurnSum && counters.winTurnSum[seatKey] || 0);
      stats.winTurnSamples += Number(counters.winTurnSamples && counters.winTurnSamples[seatKey] || 0);
      stats.winPointSum += Number(counters.winPointSum && counters.winPointSum[seatKey] || 0);
      stats.winPointSamples += Number(counters.winPointSamples && counters.winPointSamples[seatKey] || 0);
      stats.dealInPointSum += Number(counters.dealInPointSum && counters.dealInPointSum[seatKey] || 0);
      stats.dealInPointSamples += Number(counters.dealInPointSamples && counters.dealInPointSamples[seatKey] || 0);
    });
  });

  Object.values(variantStats).forEach(finalizeVariantStats);
  totals.completedRate = safeRate(totals.completedMatches, totals.matches);
  totals.averageRoundsPerMatch = safeRate(totals.rounds, totals.matches);
  totals.drawRate = safeRate(totals.drawRounds, totals.rounds);
  return {
    totals,
    variantStats
  };
}

function progressLog(args, message) {
  if (args && args.progress) {
    console.error(`[arena] ${message}`);
  }
}

function roundMetric(value, digits = 3) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
}

function formatPercent(value) {
  return `${roundMetric(Number(value || 0) * 100, 1)}%`;
}

function hasOwnMetric(stats, key) {
  return Boolean(stats && Object.prototype.hasOwnProperty.call(stats, key));
}

function metricValue(stats, key, fallbackKey = null) {
  if (hasOwnMetric(stats, key)) {
    const value = Number(stats[key]);
    return Number.isFinite(value) ? value : null;
  }
  if (fallbackKey && hasOwnMetric(stats, fallbackKey)) {
    const value = Number(stats[fallbackKey]);
    return Number.isFinite(value) ? value : null;
  }
  return null;
}

function metricRatio(stats, countKey, totalKey) {
  if (!hasOwnMetric(stats, countKey) || !hasOwnMetric(stats, totalKey)) return null;
  const count = Number(stats[countKey]);
  const total = Number(stats[totalKey]);
  if (!Number.isFinite(count) || !Number.isFinite(total) || total <= 0) return null;
  return count / total;
}

function formatMaybeNumber(value, digits = 2) {
  return value == null ? 'n/a' : String(roundMetric(value, digits));
}

function formatMaybeInteger(value) {
  return value == null ? 'n/a' : String(roundMetric(value, 0));
}

function formatMaybePercent(value) {
  return value == null ? 'n/a' : formatPercent(value);
}

function formatCompactReasonCounts(counts = {}) {
  const entries = Object.entries(counts || {})
    .filter(([, count]) => Number(count || 0) > 0)
    .sort((left, right) => Number(right[1] || 0) - Number(left[1] || 0) || String(left[0]).localeCompare(String(right[0])));
  if (!entries.length) return '';
  return entries.map(([key, count]) => `${key}:${Number(count || 0)}`).join(',');
}

function buildVariantRecordPanel(stats = {}) {
  const callRoundRate = metricValue(stats, 'callRoundRate');
  const callPerRound = metricValue(stats, 'callPerRound');
  const drawRate = metricValue(stats, 'drawRatePerRound');
  const nonRiichiWinRate = metricValue(stats, 'nonRiichiWinRate');
  const tsumoShareOfWins = metricValue(stats, 'tsumoShareOfWins') ?? metricRatio(stats, 'tsumoWins', 'huleWins');
  const dealInRate = metricValue(stats, 'dealInRatePerRound');
  return {
    records: metricValue(stats, 'appearances'),
    averageRank: metricValue(stats, 'averageRank'),
    averageScore: metricValue(stats, 'averageScore'),
    averageFinalScoreDelta: metricValue(stats, 'averageFinalScoreDelta'),
    firstRate: metricValue(stats, 'firstRate'),
    secondRate: metricValue(stats, 'secondRate'),
    thirdRate: metricValue(stats, 'thirdRate'),
    fourthRate: metricValue(stats, 'fourthRate'),
    flownRate: metricValue(stats, 'flownRate'),
    huleRate: metricValue(stats, 'winRatePerRound'),
    dealInRate,
    dealInPaymentRate: metricValue(stats, 'dealInPaymentRatePerRound'),
    nonRiichiWinRate,
    drawRate,
    tsumoRate: tsumoShareOfWins,
    tsumoRatePerRound: metricValue(stats, 'tsumoRatePerRound'),
    ronRatePerRound: metricValue(stats, 'ronRatePerRound'),
    riichiRate: metricValue(stats, 'riichiRoundRate', 'riichiRatePerRound'),
    riichiPerDiscard: metricValue(stats, 'riichiPerDiscard'),
    riichiOpportunityPerRound: metricValue(stats, 'riichiOpportunityPerRound'),
    riichiOpportunityTakeRate: metricValue(stats, 'riichiOpportunityTakeRate'),
    callRate: callRoundRate,
    callsPerRound: callPerRound,
    callRatePerDiscard: metricValue(stats, 'callRatePerDiscard'),
    chiCallsPerRound: metricValue(stats, 'chiCallPerRound'),
    pengCallsPerRound: metricValue(stats, 'pengCallPerRound'),
    closedCallsPerRound: metricValue(stats, 'closedCallPerRound'),
    flatCallsPerRound: metricValue(stats, 'flatCallPerRound'),
    shantenImproveCallsPerRound: metricValue(stats, 'shantenImproveCallPerRound'),
    yakuhaiPengCallsPerRound: metricValue(stats, 'yakuhaiPengCallPerRound'),
    closedRouteReviewPerRound: metricValue(stats, 'closedRouteReviewPerRound'),
    closedRouteOverridePerRound: metricValue(stats, 'closedRouteOverridePerRound'),
    averageCallOpenRouteScore: metricValue(stats, 'averageCallOpenRouteScore'),
    averagePassClosedRouteScore: metricValue(stats, 'averagePassClosedRouteScore'),
    closedRouteMarginAverage: metricValue(stats, 'closedRouteMarginAverage'),
    drawTenpaiRate: metricValue(stats, 'drawTenpaiRate'),
    averageWinTurn: metricValue(stats, 'averageWinTurn'),
    averageWinPoints: metricValue(stats, 'averageWinPoints'),
    averageDealInPoints: metricValue(stats, 'averageDealInPoints'),
    rawCounts: {
      huleWins: metricValue(stats, 'huleWins'),
      tsumoWins: metricValue(stats, 'tsumoWins'),
      ronWins: metricValue(stats, 'ronWins'),
      dealIns: metricValue(stats, 'dealIns'),
      dealInRounds: metricValue(stats, 'dealInRounds'),
      drawRounds: metricValue(stats, 'drawRounds'),
      drawTenpai: metricValue(stats, 'drawTenpai'),
      riichi: metricValue(stats, 'riichi'),
      riichiOpportunities: metricValue(stats, 'riichiOpportunities'),
      calls: metricValue(stats, 'calls'),
      callRounds: metricValue(stats, 'callRounds'),
      chiCalls: metricValue(stats, 'chiCalls'),
      pengCalls: metricValue(stats, 'pengCalls'),
      yakuhaiPengCalls: metricValue(stats, 'yakuhaiPengCalls'),
      shantenImproveCalls: metricValue(stats, 'shantenImproveCalls'),
      flatCalls: metricValue(stats, 'flatCalls'),
      closedCalls: metricValue(stats, 'closedCalls'),
      closedRouteValueReviewedCalls: metricValue(stats, 'closedRouteValueReviewedCalls'),
      closedRouteValueOverrideCalls: metricValue(stats, 'closedRouteValueOverrideCalls'),
      closedRouteScoreSamples: metricValue(stats, 'closedRouteScoreSamples'),
      roundsSeen: metricValue(stats, 'roundsSeen')
    },
    callReasonCounts: stats.callReasonCounts || {},
    riichiRejectReasonCounts: stats.riichiRejectReasonCounts || {},
    balancedRouteStateCounts: stats.balancedRouteStateCounts || {},
    balancedRouteStateReasonCounts: stats.balancedRouteStateReasonCounts || {},
    uncertainty: stats.uncertainty || null,
    availability: {
      drawStats: drawRate != null,
      nonRiichiWinStats: nonRiichiWinRate != null,
      tsumoShareStats: tsumoShareOfWins != null,
      callRoundStats: callRoundRate != null,
      dealInRoundStats: dealInRate != null
    }
  };
}

function formatVariantRecordPanel(variant, stats = {}) {
  const panel = stats.recordPanel || buildVariantRecordPanel(stats);
  const rankSe = stats.uncertainty && Number.isFinite(Number(stats.uncertainty.averageRankStandardError))
    ? `±${roundMetric(stats.uncertainty.averageRankStandardError, 3)}`
    : '';
  const title = variant && variant.id ? variant.id : 'unknown';
  const lines = [
    `[arena]   ${title}`
      + ` rec=${formatMaybeInteger(panel.records)}`
      + ` avgRank=${formatMaybeNumber(panel.averageRank, 2)}${rankSe}`
      + ` avgScore=${formatMaybeInteger(panel.averageScore)}`
      + ` delta=${formatMaybeInteger(panel.averageFinalScoreDelta)}`
      + ` 1st=${formatMaybePercent(panel.firstRate)}`
      + ` 2nd=${formatMaybePercent(panel.secondRate)}`
      + ` 3rd=${formatMaybePercent(panel.thirdRate)}`
      + ` 4th=${formatMaybePercent(panel.fourthRate)}`
      + ` flown=${formatMaybePercent(panel.flownRate)}`,
    `[arena]     hule=${formatMaybePercent(panel.huleRate)}`
      + ` dealIn=${formatMaybePercent(panel.dealInRate)}`
      + ` nonRiichiWin=${formatMaybePercent(panel.nonRiichiWinRate)}`
      + ` draw=${formatMaybePercent(panel.drawRate)}`
      + ` tsumoWin=${formatMaybePercent(panel.tsumoRate)}`
      + ` call=${formatMaybePercent(panel.callRate)}`
      + ` riichi=${formatMaybePercent(panel.riichiRate)}`
      + ` drawTenpai=${formatMaybePercent(panel.drawTenpaiRate)}`,
    `[arena]     winTurn=${formatMaybeNumber(panel.averageWinTurn, 2)}`
      + ` avgWin=${formatMaybeInteger(panel.averageWinPoints)}`
      + ` avgDealIn=${formatMaybeInteger(panel.averageDealInPoints)}`
      + ` ron/R=${formatMaybePercent(panel.ronRatePerRound)}`
      + ` tsumo/R=${formatMaybePercent(panel.tsumoRatePerRound)}`
      + ` calls/R=${formatMaybeNumber(panel.callsPerRound, 2)}`
      + ` riichi/discard=${formatMaybePercent(panel.riichiPerDiscard)}`,
    `[arena]     chi/R=${formatMaybeNumber(panel.chiCallsPerRound, 2)}`
      + ` peng/R=${formatMaybeNumber(panel.pengCallsPerRound, 2)}`
      + ` closedCall/R=${formatMaybeNumber(panel.closedCallsPerRound, 2)}`
      + ` flatCall/R=${formatMaybeNumber(panel.flatCallsPerRound, 2)}`
      + ` improveCall/R=${formatMaybeNumber(panel.shantenImproveCallsPerRound, 2)}`
      + ` yakuhai/R=${formatMaybeNumber(panel.yakuhaiPengCallsPerRound, 2)}`
      + ` riichiOpp/R=${formatMaybeNumber(panel.riichiOpportunityPerRound, 2)}`
      + ` riichiOppTake=${formatMaybePercent(panel.riichiOpportunityTakeRate)}`,
    `[arena]     closedRouteReview/R=${formatMaybeNumber(panel.closedRouteReviewPerRound, 2)}`
      + ` closedRouteOverride/R=${formatMaybeNumber(panel.closedRouteOverridePerRound, 2)}`
      + ` callRouteScore=${formatMaybeNumber(panel.averageCallOpenRouteScore, 1)}`
      + ` passRouteScore=${formatMaybeNumber(panel.averagePassClosedRouteScore, 1)}`
      + ` routeMargin=${formatMaybeNumber(panel.closedRouteMarginAverage, 1)}`
  ];
  const balancedStates = formatCompactReasonCounts(panel.balancedRouteStateCounts);
  if (balancedStates) {
    lines.push(`[arena]     balancedState=${balancedStates}`);
  }
  const balancedReasons = formatCompactReasonCounts(panel.balancedRouteStateReasonCounts);
  if (balancedReasons) {
    lines.push(`[arena]     balancedStateReason=${balancedReasons}`);
  }
  return lines;
}

function formatArenaSummary(label, summary, variants) {
  const totals = summary && summary.totals ? summary.totals : {};
  const lines = [
    `[arena] ${label} completed=${Number(totals.completedMatches || 0)}/${Number(totals.matches || 0)}`
      + ` rounds=${Number(totals.rounds || 0)}`
      + ` draw=${formatMaybePercent(metricValue(totals, 'drawRate'))}`
      + ` errors=${Number(totals.errorCount || 0)}`
  ];
  uniqueVariantsById(variants || []).forEach((variant) => {
    const stats = summary && summary.variantStats && summary.variantStats[variant.id]
      ? summary.variantStats[variant.id]
      : {};
    lines.push(...formatVariantRecordPanel(variant, stats));
  });
  return lines.join('\n');
}

function buildReportHeader(args, variants, status, completedMatches) {
  return {
    source: 'benchmark-ai-hanchan-arena',
    scope: 'scripted-ai-headless-hanchan',
    note: 'No Mortal inference is used. Mixed mode is the primary strength-gradient signal; mirror mode is mainly stability telemetry.',
    status,
    generatedAt: new Date().toISOString(),
    seed: args.seed,
    mode: args.mode,
    matches: args.matches,
    completedMatches: Number(completedMatches || 0),
    checkpointInterval: Number(args.checkpointInterval || 0),
    experimentalOverlays: normalizeExperimentalOverlays(args.experimentalOverlays || []),
    variantOrder: variants.map((variant) => variant.id),
    variants: uniqueVariantsById(variants).map(summarizeVariantConfig)
  };
}

function writeJsonReport(outPath, report) {
  if (!outPath) return;
  fs.writeFileSync(path.resolve(outPath), `${JSON.stringify(report, null, 2)}\n`);
}

function logRollingSummary(args, label, summary, variants) {
  if (!args || !args.progress || !summary) return;
  console.error(formatArenaSummary(label, summary, variants));
}

function shouldEmitCheckpoint(args, completedCount, totalCount) {
  const interval = Number(args && args.checkpointInterval || 0);
  if (!Number.isFinite(interval) || interval <= 0) return false;
  return completedCount === totalCount || completedCount % interval === 0;
}

function emitMixedCheckpoint(args, variants, rows, status = 'running') {
  const summary = summarizeMatchRows(rows, variants);
  const report = buildReportHeader(args, variants, status, rows.length);
  report.mixed = stripRows({ summary, rows }, args.includeRows);
  writeJsonReport(args.out, report);
  logRollingSummary(args, `mixed ${rows.length}/${args.matches}`, summary, variants);
}

function emitMirrorCheckpoint(args, variants, byVariant, status = 'running', label = 'mirror') {
  const completedMatches = Object.values(byVariant).reduce((sum, section) => (
    sum + (section && Array.isArray(section.rows) ? section.rows.length : 0)
  ), 0);
  const report = buildReportHeader(args, variants, status, completedMatches);
  report.mirror = stripRows(byVariant, args.includeRows);
  writeJsonReport(args.out, report);
  if (!args.progress) return;
  progressLog(args, `${label} checkpoint matches=${completedMatches}`);
  Object.keys(byVariant).forEach((variantId) => {
    const section = byVariant[variantId];
    const variant = variants.find((entry) => entry.id === variantId);
    if (section && section.summary && variant) {
      logRollingSummary(args, `mirror:${variantId} ${section.rows.length}/${args.matches}`, section.summary, [variant]);
    }
  });
}

function runMixedArena(baseConfig, variants, args) {
  const rows = [];
  for (let matchIndex = 0; matchIndex < args.matches; matchIndex += 1) {
    const assignments = buildMixedAssignments(variants, matchIndex);
    rows.push(runOneMatch(baseConfig, assignments, {
      mode: 'mixed',
      matchIndex,
      seed: args.seed,
      seedSalt: 17,
      maxStepsPerRound: args.maxStepsPerRound,
      maxRoundsPerMatch: args.maxRoundsPerMatch
    }));
    if (shouldEmitCheckpoint(args, matchIndex + 1, args.matches)) {
      emitMixedCheckpoint(args, variants, rows, matchIndex + 1 === args.matches ? 'complete' : 'running');
    }
  }
  const summary = summarizeMatchRows(rows, variants);
  return {
    summary,
    rows
  };
}

function runMirrorArena(baseConfig, variants, args) {
  const byVariant = {};
  variants.forEach((variant, variantIndex) => {
    const rows = [];
    byVariant[variant.id] = {
      summary: summarizeMatchRows(rows, [variant]),
      rows
    };
    for (let matchIndex = 0; matchIndex < args.matches; matchIndex += 1) {
      rows.push(runOneMatch(baseConfig, buildMirrorAssignments(variant), {
        mode: 'mirror',
        matchIndex,
        seed: args.seed,
        seedSalt: 101 + variantIndex,
        maxStepsPerRound: args.maxStepsPerRound,
        maxRoundsPerMatch: args.maxRoundsPerMatch
      }));
      byVariant[variant.id].summary = summarizeMatchRows(rows, [variant]);
      if (shouldEmitCheckpoint(args, matchIndex + 1, args.matches)) {
        const isComplete = variantIndex === variants.length - 1 && matchIndex + 1 === args.matches;
        emitMirrorCheckpoint(
          args,
          variants,
          byVariant,
          isComplete ? 'complete' : 'running',
          `mirror:${variant.id} ${matchIndex + 1}/${args.matches}`
        );
      }
    }
  });
  return byVariant;
}

function stripRows(section, includeRows) {
  if (!section) return section;
  if (Array.isArray(section.rows)) {
    return includeRows ? section : { summary: section.summary };
  }
  return Object.keys(section).reduce((result, key) => {
    const value = section[key];
    result[key] = value && Array.isArray(value.rows)
      ? (includeRows ? value : { summary: value.summary })
      : value;
    return result;
  }, {});
}

function buildArenaReport(argsInput = {}) {
  const args = {
    ...parseArgs([]),
    ...argsInput
  };
  const baseConfig = loadBaseConfig();
  const variants = resolveVariants(args.variants, args);
  const startedAt = Date.now();
  const report = buildReportHeader(args, variants, 'complete', 0);

  if (args.mode === 'mixed' || args.mode === 'both') {
    const mixed = runMixedArena(baseConfig, variants, args);
    report.mixed = stripRows(mixed, args.includeRows);
    report.completedMatches += Number(mixed.summary && mixed.summary.totals
      ? mixed.summary.totals.completedMatches || 0
      : 0);
  }
  if (args.mode === 'mirror' || args.mode === 'both') {
    const mirror = runMirrorArena(baseConfig, variants, args);
    report.mirror = stripRows(mirror, args.includeRows);
    report.completedMatches += Object.values(mirror).reduce((sum, section) => (
      sum + Number(section && section.summary && section.summary.totals
        ? section.summary.totals.completedMatches || 0
        : 0)
    ), 0);
  }
  report.elapsedMs = Date.now() - startedAt;

  return report;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const report = buildArenaReport(args);
  const json = JSON.stringify(report, null, 2);
  if (args.out) {
    fs.writeFileSync(path.resolve(args.out), `${json}\n`);
  }
  if (args.stdout === 'summary') {
    if (report.mixed && report.mixed.summary) {
      console.log(formatArenaSummary(`mixed ${report.completedMatches}/${args.matches}`, report.mixed.summary, resolveVariants(args.variants, args)));
    }
    if (report.mirror) {
      const variants = resolveVariants(args.variants, args);
      Object.keys(report.mirror).forEach((variantId) => {
        const variant = variants.find((entry) => entry.id === variantId) || { id: variantId };
        console.log(formatArenaSummary(`mirror:${variantId}`, report.mirror[variantId].summary, [variant]));
      });
    }
    return;
  }
  if (args.stdout === 'both') {
    if (report.mixed && report.mixed.summary) {
      console.log(formatArenaSummary(`mixed ${report.completedMatches}/${args.matches}`, report.mixed.summary, resolveVariants(args.variants, args)));
    }
    console.log(json);
    return;
  }
  console.log(json);
}

if (require.main === module) {
  main();
}

module.exports = {
  SEATS,
  DEFAULT_MATCHES,
  parseArgs,
  createVariantPresets,
  resolveVariants,
  normalizeExperimentalOverlays,
  applyExperimentalOverlay,
  uniqueVariantsById,
  buildMixedAssignments,
  buildMirrorAssignments,
  createPureHardPolicy,
  createTunedHardPolicy,
  createExperimentalHardPolicy,
  createBalancedHardPolicy,
  buildArenaReport,
  runOneRound,
  runOneMatch,
  summarizeMatchRows,
  buildVariantRecordPanel,
  formatVariantRecordPanel,
  formatArenaSummary,
  createAggressiveHardPolicy,
  createDefensiveHardPolicy,
  createHeavyHardPolicy,
  createAggressiveDevHardPolicy,
  createDefensiveDevHardPolicy,
  createBalancedDevHardPolicy,
  createHeavyDevHardPolicy
};
