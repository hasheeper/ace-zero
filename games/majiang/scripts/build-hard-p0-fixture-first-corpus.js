'use strict';

const fs = require('fs');
const path = require('path');
const p0ReviewApi = require('./analyze-hard-p0-likely-bad-review');

const DEFAULT_REVIEW_PATH = '/tmp/h13h-p0-likely-bad-review.json';
const DEFAULT_OUT_PATH = '/tmp/h13h-p0-fixture-first-corpus.json';

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
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

function increment(map, key, amount = 1) {
  const resolved = key || 'unknown';
  map[resolved] = (map[resolved] || 0) + amount;
}

function isFixtureFirstRow(row = null) {
  return Boolean(
    row
    && row.classification
    && row.classification.recommendedNextAction === 'promote-to-deterministic-fixture-before-strategy-change'
  );
}

function compactCandidate(candidate = null) {
  if (!candidate || typeof candidate !== 'object') return null;
  return {
    tileCode: candidate.tileCode || null,
    normalizedTileCode: candidate.normalizedTileCode || normalizeTileCode(candidate.tileCode),
    tileClass: candidate.tileClass || p0ReviewApi.tileClass(candidate.tileCode),
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

function compactCandidateTable(row = null) {
  const localTile = normalizeTileCode(row && row.localTile);
  const mortalTile = normalizeTileCode(row && row.mortalTile);
  const candidates = Array.isArray(row && row.candidateTable) ? row.candidateTable : [];
  return candidates.map((candidate) => {
    const compact = compactCandidate(candidate);
    if (!compact) return null;
    const normalized = normalizeTileCode(compact.normalizedTileCode || compact.tileCode);
    return {
      ...compact,
      isCurrentHardTile: normalized === localTile,
      isTeacherTile: normalized === mortalTile
    };
  }).filter(Boolean);
}

function buildFixture(row = null, index = 0) {
  const classification = row && row.classification ? row.classification : {};
  const fixtureId = `h13h-p0-${String(index + 1).padStart(2, '0')}-${row.id || 'unknown'}`;
  return {
    fixtureId,
    sourceId: row.id || null,
    seed: numberOrNull(row.seed),
    targetSeat: row.targetSeat || null,
    roundIndex: numberOrNull(row.roundIndex),
    qDelta: numberOrNull(row.qDelta),
    bucket: row.bucket || null,
    pressureScore: numberOrNull(row.pressureScore) || 0,
    remaining: numberOrNull(row.remaining),
    currentHard: {
      tileCode: row.localTile || null,
      normalizedTileCode: normalizeTileCode(row.localTile),
      candidate: compactCandidate(row.localCandidate)
    },
    teacher: {
      source: 'mortal',
      tileCode: row.mortalTile || null,
      normalizedTileCode: normalizeTileCode(row.mortalTile),
      candidate: compactCandidate(row.mortalCandidate)
    },
    relation: clone(row.relation || null),
    classification: {
      primaryPattern: classification.primaryPattern || null,
      recommendedNextAction: classification.recommendedNextAction || null,
      modes: Array.isArray(classification.modes) ? classification.modes.slice() : [],
      modelSignal: clone(classification.modelSignal || null),
      tilePair: clone(classification.tilePair || null),
      metricBands: clone(classification.metricBands || null)
    },
    fixedState: clone(row.fixedState || null),
    candidateTable: compactCandidateTable(row),
    review: {
      status: 'unreviewed',
      manualReviewRequired: true,
      reviewer: null,
      reviewedAt: null,
      humanVerdict: null,
      notes: [],
      allowedVerdicts: [
        'hard-bad-fixture',
        'mortal-preference-acceptable',
        'needs-more-context',
        'teacher-questionable'
      ]
    }
  };
}

function summarizeFixtures(fixtures = []) {
  const summary = {
    total: fixtures.length,
    byPrimaryPattern: {},
    byTilePairTheme: {},
    byHardEvDeltaBand: {},
    byShapeDeltaBand: {},
    byModelSupport: {},
    byPressure: {},
    sourceIds: fixtures.map((fixture) => fixture.sourceId).filter(Boolean)
  };
  fixtures.forEach((fixture) => {
    const classification = fixture.classification || {};
    increment(summary.byPrimaryPattern, classification.primaryPattern);
    increment(summary.byTilePairTheme, classification.tilePair && classification.tilePair.theme);
    increment(summary.byHardEvDeltaBand, classification.metricBands && classification.metricBands.hardEvDeltaBand);
    increment(summary.byShapeDeltaBand, classification.metricBands && classification.metricBands.shapeDeltaBand);
    increment(summary.byModelSupport, classification.modelSignal && classification.modelSignal.supportLevel);
    increment(summary.byPressure, fixture.pressureScore > 0 ? 'pressure' : 'no-pressure');
  });
  return summary;
}

function buildP0FixtureFirstCorpus(review = null, options = {}) {
  const rows = review && Array.isArray(review.rows) ? review.rows : [];
  const fixtures = rows
    .filter(isFixtureFirstRow)
    .sort((left, right) => Number(right.qDelta || 0) - Number(left.qDelta || 0))
    .map(buildFixture);
  return {
    source: 'hard-p0-fixture-first-corpus',
    generatedAt: Date.now(),
    inputPath: options.inputPath || null,
    sourceReview: review ? {
      source: review.source || null,
      inputPath: review.inputPath || null,
      filters: clone(review.filters || null),
      summary: clone(review.summary || null)
    } : null,
    filters: {
      recommendedNextAction: 'promote-to-deterministic-fixture-before-strategy-change',
      note: 'Static fixed-position fixtures for human review and future deterministic guards. This corpus does not alter runtime AI behavior.'
    },
    summary: summarizeFixtures(fixtures),
    fixtures
  };
}

function parseArgs(argv = []) {
  const args = {
    help: false,
    review: DEFAULT_REVIEW_PATH,
    out: DEFAULT_OUT_PATH,
    stdout: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }
    if (token === '--review' || token === '--input') {
      args.review = String(argv[index + 1] || '').trim() || args.review;
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
  console.log('Usage: node games/majiang/scripts/build-hard-p0-fixture-first-corpus.js [options]');
  console.log('');
  console.log('Options:');
  console.log('  --review <path>  Input P0 review JSON. Default: /tmp/h13h-p0-likely-bad-review.json');
  console.log('  --input <path>   Alias for --review.');
  console.log('  --out <path>     Output fixture corpus. Default: /tmp/h13h-p0-fixture-first-corpus.json');
  console.log('  --stdout         Also print full JSON.');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  const review = readJson(args.review);
  const corpus = buildP0FixtureFirstCorpus(review, {
    inputPath: path.resolve(args.review)
  });
  const output = JSON.stringify(corpus, null, 2);
  if (args.out) fs.writeFileSync(path.resolve(args.out), output.concat('\n'), 'utf8');
  if (args.stdout || !args.out) {
    console.log(output);
  } else {
    console.log(JSON.stringify({
      out: path.resolve(args.out),
      summary: corpus.summary
    }, null, 2));
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  DEFAULT_REVIEW_PATH,
  DEFAULT_OUT_PATH,
  isFixtureFirstRow,
  compactCandidate,
  compactCandidateTable,
  buildFixture,
  summarizeFixtures,
  buildP0FixtureFirstCorpus,
  parseArgs
};
