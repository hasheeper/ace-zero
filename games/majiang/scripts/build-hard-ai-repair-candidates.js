'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_STAGE1_PATH = '/tmp/h14-p0-stage1-summary.json';
const DEFAULT_ADJUDICATED_PATH = '/tmp/h13h-hard-disagreement-adjudication-labeled.json';
const DEFAULT_P0_REVIEW_PATH = '/tmp/h13h-p0-likely-bad-review.json';
const DEFAULT_FIXTURE_FIRST_PATH = '/tmp/h13h-p0-fixture-first-corpus.json';
const DEFAULT_TILE_CHOICE_PATH = '/tmp/h12-p5-hard-tile-choice-corpus.json';
const DEFAULT_TUNED_MORTAL_PATH = '/tmp/h14-p0-hard-tuned-vs-mortal-s1000.json';
const DEFAULT_PURE_MORTAL_PATH = '/tmp/h14-p0-hard-pure-vs-mortal-s1000.json';
const DEFAULT_OUT_PATH = '/tmp/h14-p1-hard-ai-repair-candidates.json';
const FORBIDDEN_COMPACT_KEYS = new Set([
  'runtime',
  'board',
  'eventLog',
  'stdout',
  'stderr',
  'mortalRoot',
  'hardContext',
  'waits'
]);

const CATEGORY_ORDER = [
  'defense',
  'riichi',
  'same-xiangting tile-choice',
  'backstep',
  'route-dora-five',
  'action-type',
  'other'
];

const PRIORITY_ORDER = ['P0', 'P1', 'P2', 'P3'];

function clone(value) {
  if (value == null) return value;
  return sanitizeForCompactReport(JSON.parse(JSON.stringify(value)));
}

function sanitizeForCompactReport(value) {
  if (Array.isArray(value)) return value.map(sanitizeForCompactReport);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !FORBIDDEN_COMPACT_KEYS.has(key))
    .map(([key, entry]) => [key, sanitizeForCompactReport(entry)]));
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeTileCode(tileCode) {
  if (typeof tileCode !== 'string' || !tileCode) return null;
  return String(tileCode)
    .replace(/[\*_\+\=\-]+$/g, '')
    .replace(/^([mps])0$/, (_, suit) => `${suit}5`);
}

function readJsonIfExists(filePath) {
  if (!filePath || !fs.existsSync(path.resolve(filePath))) return null;
  return JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(path.resolve(filePath), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function increment(map, key, amount = 1) {
  const resolved = key || 'unknown';
  map[resolved] = Number(map[resolved] || 0) + amount;
}

function compactCandidate(candidate = null) {
  if (!candidate || typeof candidate !== 'object') return null;
  return {
    tileCode: candidate.tileCode || null,
    normalizedTileCode: candidate.normalizedTileCode || normalizeTileCode(candidate.tileCode),
    selectedFinal: Boolean(candidate.selectedFinal),
    metrics: clone(candidate.metrics || null),
    danger: clone(candidate.danger || null),
    hardMetrics: clone(candidate.hardMetrics || null),
    shape: clone(candidate.shape || null),
    mortal: candidate.mortal ? {
      qValue: numberOrNull(candidate.mortal.qValue),
      qDeltaFromBest: numberOrNull(candidate.mortal.qDeltaFromBest),
      isBest: Boolean(candidate.mortal.isBest),
      actionIndex: numberOrNull(candidate.mortal.actionIndex)
    } : null
  };
}

function compactFixedState(fixedState = null) {
  if (!fixedState || typeof fixedState !== 'object') return null;
  return {
    seat: fixedState.seat || null,
    phase: fixedState.phase || null,
    turnSeat: fixedState.turnSeat || null,
    remaining: numberOrNull(fixedState.remaining),
    doraIndicators: Array.isArray(fixedState.doraIndicators) ? fixedState.doraIndicators.slice() : [],
    scores: clone(fixedState.scores || null),
    round: clone(fixedState.round || null),
    seats: clone(fixedState.seats || null),
    localDiscard: clone(fixedState.localDiscard || null),
    discardCandidates: Array.isArray(fixedState.discardCandidates)
      ? fixedState.discardCandidates.map((candidate) => ({
          tileCode: candidate.tileCode || null,
          tileIndex: numberOrNull(candidate.tileIndex),
          isDrawDiscard: Boolean(candidate.isDrawDiscard),
          selectedFinal: Boolean(candidate.selectedFinal),
          xiangting: numberOrNull(candidate.xiangting),
          hardEvScore: numberOrNull(candidate.hardEvScore),
          dangerScore: numberOrNull(candidate.dangerScore),
          shapeScore: numberOrNull(candidate.shapeScore),
          shapeRole: candidate.shapeRole || null
        }))
      : []
  };
}

function categoryFromBucket(bucket, fallback = 'other') {
  if (bucket === 'tile-defense') return 'defense';
  if (bucket === 'riichi-missed' || bucket === 'riichi-overpush') return 'riichi';
  if (bucket === 'action-type') return 'action-type';
  return fallback;
}

function categoryFromRow(row = {}) {
  const bucketCategory = categoryFromBucket(row.bucket, null);
  if (bucketCategory) return bucketCategory;
  const relation = row.relation || (row.classification && row.classification.relation) || {};
  const primary = row.primaryCategory || row.category || '';
  if (String(primary).includes('backstep') || relation.xiangtingRelation === 'mortal-worse') return 'backstep';
  if (String(primary).includes('route-dora') || String(primary).includes('five')) return 'route-dora-five';
  if (row.bucket === 'tile-choice' || String(primary).includes('same-xiangting')) return 'same-xiangting tile-choice';
  return 'other';
}

function priorityForCandidate(candidate = {}) {
  const label = candidate.autoAdjudication && candidate.autoAdjudication.label;
  const reviewPriority = candidate.autoAdjudication && candidate.autoAdjudication.reviewPriority;
  const hasFixedState = Boolean(candidate.fixedState);
  const modelSupport = candidate.modelSignal && candidate.modelSignal.supportLevel;
  const qDelta = numberOrNull(candidate.qDelta) || 0;

  if (
    candidate.sourceTypes.includes('fixture-first')
    || (
      hasFixedState
      && label === 'hard-likely-bad-move'
      && (modelSupport === 'both-native-support-mortal' || qDelta > 2 || reviewPriority === 'P0')
    )
  ) {
    return 'P0';
  }
  if (
    candidate.category === 'defense'
    || candidate.category === 'riichi'
    || reviewPriority === 'P1'
    || candidate.qBand === 'serious-suspect'
  ) {
    return 'P1';
  }
  if (
    candidate.category === 'same-xiangting tile-choice'
    || label === 'hard-suspect-mistake'
    || reviewPriority === 'P2'
  ) {
    return 'P2';
  }
  return 'P3';
}

function sortCandidates(left, right) {
  const priorityDiff = PRIORITY_ORDER.indexOf(left.priority) - PRIORITY_ORDER.indexOf(right.priority);
  if (priorityDiff !== 0) return priorityDiff;
  return Number(right.qDelta || 0) - Number(left.qDelta || 0);
}

function makeCandidate(base) {
  const sourceTypes = Array.from(new Set((base.sourceTypes || [base.sourceType]).filter(Boolean)));
  const category = base.category || categoryFromRow(base);
  const candidate = {
    id: base.id || `${sourceTypes[0] || 'candidate'}:${base.sourceId || base.sourceIds && base.sourceIds[0] || 'unknown'}`,
    sourceIds: Array.from(new Set((base.sourceIds || [base.sourceId]).filter(Boolean))),
    sourceTypes,
    category,
    bucket: base.bucket || null,
    qDelta: numberOrNull(base.qDelta),
    qBand: base.qBand || null,
    pressureScore: numberOrNull(base.pressureScore) || 0,
    seed: numberOrNull(base.seed),
    targetSeat: base.targetSeat || null,
    remaining: numberOrNull(base.remaining),
    currentHard: clone(base.currentHard || base.local || null),
    teacher: clone(base.teacher || base.mortalBest || null),
    localDecision: clone(base.localDecision || null),
    mortalDecision: clone(base.mortalDecision || null),
    localCandidate: compactCandidate(base.localCandidate || (base.currentHard && base.currentHard.candidate)),
    mortalCandidate: compactCandidate(base.mortalCandidate || (base.teacher && base.teacher.candidate)),
    candidateTable: Array.isArray(base.candidateTable) ? base.candidateTable.map(compactCandidate).filter(Boolean) : [],
    relation: clone(base.relation || null),
    fixedState: compactFixedState(base.fixedState || null),
    autoAdjudication: clone(base.autoAdjudication || null),
    adjudication: clone(base.adjudication || null),
    modelSignal: clone(base.modelSignal || null),
    classification: clone(base.classification || null),
    arenaRisk: clone(base.arenaRisk || null),
    review: {
      status: 'unreviewed',
      manualReviewRequired: true,
      allowedVerdicts: [
        'hard-bad-fixture',
        'mortal-preference-acceptable',
        'needs-more-context',
        'teacher-questionable',
        'arena-risk-too-high'
      ],
      notes: []
    }
  };
  candidate.priority = priorityForCandidate(candidate);
  return candidate;
}

function candidatesFromStage1(stage1 = null) {
  const rows = stage1 && stage1.candidatePool && Array.isArray(stage1.candidatePool.rows)
    ? stage1.candidatePool.rows
    : [];
  return rows.map((row) => makeCandidate({
    id: `stage1:${row.id}`,
    sourceType: 'stage1',
    sourceId: row.id,
    category: row.category || categoryFromRow(row),
    bucket: row.bucket,
    qDelta: row.qDelta,
    seed: row.seed,
    targetSeat: row.targetSeat,
    currentHard: row.local,
    teacher: row.mortalBest,
    fixedState: row.decisionContextAvailable ? { seat: row.targetSeat } : null,
    arenaRisk: stage1.arena && stage1.arena.hardTunedVsPure ? {
      hardTunedVsPure: clone(stage1.arena.hardTunedVsPure)
    } : null
  }));
}

function candidatesFromAdjudicated(adjudicated = null) {
  const rows = adjudicated && Array.isArray(adjudicated.rows) ? adjudicated.rows : [];
  return rows.map((row) => makeCandidate({
    id: `adjudicated:${row.id}`,
    sourceType: 'adjudicated',
    sourceId: row.id,
    category: categoryFromRow(row),
    bucket: row.bucket,
    qDelta: row.qDelta,
    qBand: row.qBand,
    pressureScore: row.pressureScore,
    seed: row.seed,
    targetSeat: row.targetSeat,
    remaining: row.remaining,
    localDecision: row.localDecision,
    mortalDecision: row.mortalDecision,
    currentHard: row.localDecision,
    teacher: row.bestMortalCandidate,
    localCandidate: row.localCandidate,
    mortalCandidate: row.mortalCandidate,
    candidateTable: row.candidateTable,
    relation: row.relation,
    fixedState: row.fixedState,
    autoAdjudication: row.autoAdjudication,
    adjudication: row.adjudication,
    modelSignal: row.autoAdjudication && row.autoAdjudication.modelSignal
  }));
}

function candidatesFromP0Review(review = null) {
  const rows = review && Array.isArray(review.rows) ? review.rows : [];
  return rows.map((row) => makeCandidate({
    id: `p0-review:${row.id}`,
    sourceType: 'p0-review',
    sourceId: row.id,
    category: 'same-xiangting tile-choice',
    bucket: row.bucket || 'tile-choice',
    qDelta: row.qDelta,
    pressureScore: row.pressureScore,
    seed: row.seed,
    targetSeat: row.targetSeat,
    remaining: row.remaining,
    currentHard: { tileCode: row.localTile, candidate: row.localCandidate },
    teacher: { source: 'mortal', tileCode: row.mortalTile, candidate: row.mortalCandidate },
    localCandidate: row.localCandidate,
    mortalCandidate: row.mortalCandidate,
    candidateTable: row.candidateTable,
    relation: row.relation,
    fixedState: row.fixedState,
    classification: row.classification,
    modelSignal: row.classification && row.classification.modelSignal,
    autoAdjudication: {
      label: 'hard-likely-bad-move',
      reviewPriority: 'P0',
      manualReviewRequired: true
    }
  }));
}

function candidatesFromFixtureFirst(corpus = null) {
  const fixtures = corpus && Array.isArray(corpus.fixtures) ? corpus.fixtures : [];
  return fixtures.map((fixture) => makeCandidate({
    id: `fixture-first:${fixture.sourceId || fixture.fixtureId}`,
    sourceType: 'fixture-first',
    sourceId: fixture.sourceId || fixture.fixtureId,
    category: 'same-xiangting tile-choice',
    bucket: fixture.bucket || 'tile-choice',
    qDelta: fixture.qDelta,
    pressureScore: fixture.pressureScore,
    seed: fixture.seed,
    targetSeat: fixture.targetSeat,
    remaining: fixture.remaining,
    currentHard: fixture.currentHard,
    teacher: fixture.teacher,
    localCandidate: fixture.currentHard && fixture.currentHard.candidate,
    mortalCandidate: fixture.teacher && fixture.teacher.candidate,
    candidateTable: fixture.candidateTable,
    relation: fixture.relation,
    fixedState: fixture.fixedState,
    classification: fixture.classification,
    modelSignal: fixture.classification && fixture.classification.modelSignal,
    autoAdjudication: {
      label: 'hard-likely-bad-move',
      reviewPriority: 'P0',
      manualReviewRequired: true
    }
  }));
}

function candidatesFromTileChoiceCorpus(corpus = null) {
  const rows = corpus && Array.isArray(corpus.rows) ? corpus.rows : [];
  return rows.map((row) => makeCandidate({
    id: `tile-choice:${row.id}`,
    sourceType: 'tile-choice-corpus',
    sourceId: row.id,
    category: categoryFromRow({
      bucket: 'tile-choice',
      primaryCategory: row.primaryCategory,
      relation: row.classification && row.classification.relation
    }),
    bucket: 'tile-choice',
    qDelta: row.qDelta,
    seed: row.seed,
    targetSeat: row.targetSeat,
    localDecision: row.localDecision,
    mortalDecision: row.mortalDecision,
    currentHard: { tileCode: row.localTile, candidate: row.localCandidate },
    teacher: { source: 'mortal', tileCode: row.mortalTile, candidate: row.mortalCandidate },
    localCandidate: row.localCandidate,
    mortalCandidate: row.mortalCandidate,
    relation: row.classification && row.classification.relation,
    fixedState: row.fixedState,
    classification: row.classification
  }));
}

function candidatesFromMortalReport(report = null, sourceType = 'mortal-report') {
  const rows = report && Array.isArray(report.rows) ? report.rows : [];
  return rows
    .filter((row) => row && row.mortalSeverity && row.mortalSeverity.level === 'large')
    .map((row) => makeCandidate({
      id: `${sourceType}:${row.id}`,
      sourceType,
      sourceId: row.id,
      category: categoryFromRow({
        bucket: row.judgment && row.judgment.bucket,
        relation: null
      }),
      bucket: row.judgment && row.judgment.bucket,
      qDelta: row.mortalSeverity && row.mortalSeverity.qDelta,
      seed: row.seed,
      targetSeat: row.targetSeat,
      localDecision: row.localDecision,
      mortalDecision: row.coachDecision,
      currentHard: row.localDecision,
      teacher: row.bestMortalCandidate,
      fixedState: row.decisionContext,
      relation: null
    }));
}

function mergeCandidates(candidates = []) {
  const byKey = new Map();
  candidates.forEach((candidate) => {
    const key = candidate.sourceIds[0] || candidate.id;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, candidate);
      return;
    }
    existing.sourceTypes = Array.from(new Set([...existing.sourceTypes, ...candidate.sourceTypes]));
    existing.sourceIds = Array.from(new Set([...existing.sourceIds, ...candidate.sourceIds]));
    if (!existing.fixedState && candidate.fixedState) existing.fixedState = candidate.fixedState;
    if (!existing.localCandidate && candidate.localCandidate) existing.localCandidate = candidate.localCandidate;
    if (!existing.mortalCandidate && candidate.mortalCandidate) existing.mortalCandidate = candidate.mortalCandidate;
    if (!existing.candidateTable.length && candidate.candidateTable.length) existing.candidateTable = candidate.candidateTable;
    if (!existing.modelSignal && candidate.modelSignal) existing.modelSignal = candidate.modelSignal;
    if (!existing.classification && candidate.classification) existing.classification = candidate.classification;
    if (!existing.autoAdjudication && candidate.autoAdjudication) existing.autoAdjudication = candidate.autoAdjudication;
    existing.priority = PRIORITY_ORDER[Math.min(
      PRIORITY_ORDER.indexOf(existing.priority),
      PRIORITY_ORDER.indexOf(candidate.priority)
    )];
  });
  return Array.from(byKey.values()).sort(sortCandidates);
}

function summarizeCandidates(candidates = []) {
  const summary = {
    total: candidates.length,
    byCategory: {},
    byPriority: {},
    bySourceType: {},
    fixedStateCount: 0,
    manualReviewRequired: candidates.length,
    topRows: []
  };
  candidates.forEach((candidate) => {
    increment(summary.byCategory, candidate.category);
    increment(summary.byPriority, candidate.priority);
    candidate.sourceTypes.forEach((sourceType) => increment(summary.bySourceType, sourceType));
    if (candidate.fixedState) summary.fixedStateCount += 1;
  });
  summary.topRows = candidates.slice(0, 20).map((candidate) => ({
    id: candidate.id,
    sourceIds: candidate.sourceIds,
    priority: candidate.priority,
    category: candidate.category,
    bucket: candidate.bucket,
    qDelta: candidate.qDelta,
    currentTile: candidate.currentHard && candidate.currentHard.tileCode,
    teacherTile: candidate.teacher && candidate.teacher.tileCode,
    sourceTypes: candidate.sourceTypes
  }));
  return summary;
}

function groupCandidates(candidates = []) {
  const byCategory = CATEGORY_ORDER.reduce((result, category) => {
    result[category] = [];
    return result;
  }, {});
  const byPriority = PRIORITY_ORDER.reduce((result, priority) => {
    result[priority] = [];
    return result;
  }, {});
  candidates.forEach((candidate) => {
    const category = byCategory[candidate.category] ? candidate.category : 'other';
    byCategory[category].push(candidate.id);
    byPriority[candidate.priority].push(candidate.id);
  });
  return { byCategory, byPriority };
}

function buildRepairCandidates(inputs = {}, options = {}) {
  const warnings = [];
  const allCandidates = [
    ...candidatesFromStage1(inputs.stage1),
    ...candidatesFromAdjudicated(inputs.adjudicated),
    ...candidatesFromP0Review(inputs.p0Review),
    ...candidatesFromFixtureFirst(inputs.fixtureFirst),
    ...candidatesFromTileChoiceCorpus(inputs.tileChoice),
    ...candidatesFromMortalReport(inputs.tunedMortal, 'hard-tuned-mortal'),
    ...candidatesFromMortalReport(inputs.pureMortal, 'hard-pure-mortal')
  ];
  if (!allCandidates.length) warnings.push('no-input-candidates');
  const candidates = mergeCandidates(allCandidates);
  return {
    source: 'hard-ai-repair-candidates',
    generatedAt: new Date().toISOString(),
    outputPath: options.out || DEFAULT_OUT_PATH,
    inputs: clone(options.inputs || {}),
    warnings,
    decisionRule: 'Candidates are review queues only. Do not change formal hard-tuned from this report alone.',
    allowedExperimentOrder: [
      'defense residual debt',
      'riichi residual debt',
      'same-xiangting tile-choice residual debt',
      'backstep queue only'
    ],
    summary: summarizeCandidates(candidates),
    groups: groupCandidates(candidates),
    candidates
  };
}

function parseArgs(argv = []) {
  const args = {
    help: false,
    stage1: DEFAULT_STAGE1_PATH,
    adjudicated: DEFAULT_ADJUDICATED_PATH,
    p0Review: DEFAULT_P0_REVIEW_PATH,
    fixtureFirst: DEFAULT_FIXTURE_FIRST_PATH,
    tileChoice: DEFAULT_TILE_CHOICE_PATH,
    tunedMortal: DEFAULT_TUNED_MORTAL_PATH,
    pureMortal: DEFAULT_PURE_MORTAL_PATH,
    out: DEFAULT_OUT_PATH,
    stdout: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }
    if (token === '--stage1') {
      args.stage1 = String(argv[index + 1] || '').trim() || '';
      index += 1;
      continue;
    }
    if (token === '--adjudicated') {
      args.adjudicated = String(argv[index + 1] || '').trim() || '';
      index += 1;
      continue;
    }
    if (token === '--p0-review') {
      args.p0Review = String(argv[index + 1] || '').trim() || '';
      index += 1;
      continue;
    }
    if (token === '--fixture-first') {
      args.fixtureFirst = String(argv[index + 1] || '').trim() || '';
      index += 1;
      continue;
    }
    if (token === '--tile-choice') {
      args.tileChoice = String(argv[index + 1] || '').trim() || '';
      index += 1;
      continue;
    }
    if (token === '--tuned-mortal') {
      args.tunedMortal = String(argv[index + 1] || '').trim() || '';
      index += 1;
      continue;
    }
    if (token === '--pure-mortal') {
      args.pureMortal = String(argv[index + 1] || '').trim() || '';
      index += 1;
      continue;
    }
    if (token === '--out') {
      args.out = String(argv[index + 1] || '').trim() || args.out;
      index += 1;
      continue;
    }
    if (token === '--stdout') {
      args.stdout = true;
    }
  }
  return args;
}

function printHelp() {
  console.log('Usage: node games/majiang/scripts/build-hard-ai-repair-candidates.js [options]');
  console.log('');
  console.log('Options:');
  console.log('  --stage1 <path>          H14 P0 stage summary.');
  console.log('  --adjudicated <path>     H13h auto-adjudicated corpus.');
  console.log('  --p0-review <path>       H13h likely-bad review.');
  console.log('  --fixture-first <path>   H13h fixture-first corpus.');
  console.log('  --tile-choice <path>     H12 P5 tile-choice corpus.');
  console.log('  --tuned-mortal <path>    Optional hard-tuned Mortal report.');
  console.log('  --pure-mortal <path>     Optional hard-pure Mortal report.');
  console.log('  --out <path>             Output path. Default: /tmp/h14-p1-hard-ai-repair-candidates.json.');
  console.log('  --stdout                 Also print full JSON.');
}

function loadInputs(args) {
  const paths = {
    stage1: args.stage1,
    adjudicated: args.adjudicated,
    p0Review: args.p0Review,
    fixtureFirst: args.fixtureFirst,
    tileChoice: args.tileChoice,
    tunedMortal: args.tunedMortal,
    pureMortal: args.pureMortal
  };
  return {
    inputs: Object.fromEntries(Object.entries(paths).map(([key, value]) => [key, value ? path.resolve(value) : null])),
    data: {
      stage1: readJsonIfExists(args.stage1),
      adjudicated: readJsonIfExists(args.adjudicated),
      p0Review: readJsonIfExists(args.p0Review),
      fixtureFirst: readJsonIfExists(args.fixtureFirst),
      tileChoice: readJsonIfExists(args.tileChoice),
      tunedMortal: readJsonIfExists(args.tunedMortal),
      pureMortal: readJsonIfExists(args.pureMortal)
    }
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  const loaded = loadInputs(args);
  const report = buildRepairCandidates(loaded.data, {
    out: args.out,
    inputs: loaded.inputs
  });
  writeJson(args.out, report);
  if (args.stdout) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(JSON.stringify({
      out: path.resolve(args.out),
      summary: report.summary,
      warnings: report.warnings
    }, null, 2));
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  DEFAULT_OUT_PATH,
  CATEGORY_ORDER,
  PRIORITY_ORDER,
  normalizeTileCode,
  compactCandidate,
  compactFixedState,
  categoryFromRow,
  priorityForCandidate,
  buildRepairCandidates,
  parseArgs
};
