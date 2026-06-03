'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_REPORT_PATH = '/tmp/h12-p4-hard-vs-mortal-real.json';
const DEFAULT_BASELINE_PATH = '/tmp/h12-p3-hard-vs-mortal-real.json';
const DEFAULT_OUT_PATH = '/tmp/h12-p5-hard-tile-choice-corpus.json';
const EV_NEAR_DELTA = 12;
const EV_MEDIUM_DELTA = 80;
const SHAPE_NEAR_DELTA = 3;

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function roundMetric(value, digits = 6) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Number(number.toFixed(digits));
}

function normalizeTileCode(tileCode) {
  if (typeof tileCode !== 'string' || !tileCode) return null;
  const normalized = String(tileCode).replace(/[\*_\+\=\-]+$/g, '');
  const redMatch = normalized.match(/^([mps])0$/);
  if (redMatch) return `${redMatch[1]}5`;
  return normalized;
}

function getBucket(row = null) {
  const tags = row && Array.isArray(row.tags) ? row.tags : [];
  return tags.find((tag) => (
    tag === 'tile-choice'
    || tag === 'tile-defense'
    || tag === 'riichi-missed'
    || tag === 'riichi-overpush'
    || tag === 'missing-mortal'
    || tag === 'exact-match'
    || tag === 'action-type'
  )) || (row && row.judgment && row.judgment.bucket) || 'unknown';
}

function isTileChoiceLargeRow(row = null) {
  return Boolean(
    row
    && getBucket(row) === 'tile-choice'
    && row.mortalSeverity
    && row.mortalSeverity.level === 'large'
  );
}

function findHardCandidate(row = null, tileCode = null) {
  const normalized = normalizeTileCode(tileCode);
  if (!normalized || !row || !Array.isArray(row.hardCandidateDiagnostics)) return null;
  return row.hardCandidateDiagnostics.find((candidate) => (
    candidate
    && normalizeTileCode(candidate.tileCode) === normalized
  )) || null;
}

function findSelectedHardCandidate(row = null) {
  if (!row || !Array.isArray(row.hardCandidateDiagnostics)) return null;
  return row.hardCandidateDiagnostics.find((candidate) => candidate && candidate.selectedFinal) || null;
}

function getMortalBestTile(row = null) {
  if (row && row.bestMortalCandidate && row.bestMortalCandidate.actionType === 'discard') {
    return row.bestMortalCandidate.tileCode || null;
  }
  if (row && row.coachDecision && row.coachDecision.type === 'discard') {
    return row.coachDecision.tileCode || null;
  }
  return null;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function compactCandidate(candidate = null) {
  if (!candidate || typeof candidate !== 'object') return null;
  return {
    tileCode: candidate.tileCode || null,
    tileIndex: numberOrNull(candidate.tileIndex),
    isDrawDiscard: Boolean(candidate.isDrawDiscard),
    selectedFinal: Boolean(candidate.selectedFinal),
    metrics: candidate.metrics ? {
      xiangting: numberOrNull(candidate.metrics.xiangting),
      tingpaiCount: numberOrNull(candidate.metrics.tingpaiCount),
      ukeireCount: numberOrNull(candidate.metrics.ukeireCount),
      handValueEstimate: numberOrNull(candidate.metrics.handValueEstimate)
    } : null,
    danger: candidate.danger ? {
      dangerScore: numberOrNull(candidate.danger.dangerScore),
      safetyRank: numberOrNull(candidate.danger.safetyRank),
      defenseTileRank: numberOrNull(candidate.danger.defenseTileRank),
      categories: Array.isArray(candidate.danger.categories) ? candidate.danger.categories.slice() : [],
      safetyReasons: Array.isArray(candidate.danger.safetyReasons) ? candidate.danger.safetyReasons.slice() : []
    } : null,
    hardMetrics: candidate.hardMetrics ? {
      hardEvScore: numberOrNull(candidate.hardMetrics.hardEvScore),
      liveUkeireCount: numberOrNull(candidate.hardMetrics.liveUkeireCount),
      liveTingpaiCount: numberOrNull(candidate.hardMetrics.liveTingpaiCount),
      waitQualityScore: numberOrNull(candidate.hardMetrics.waitQualityScore),
      bestWaitType: candidate.hardMetrics.bestWaitType || null,
      contextualHandValueEstimate: numberOrNull(candidate.hardMetrics.contextualHandValueEstimate)
    } : null,
    shape: candidate.shape ? {
      discardShapeScore: numberOrNull(candidate.shape.discardShapeScore),
      discardTileRole: candidate.shape.discardTileRole || null,
      keptUsefulMiddleCount: numberOrNull(candidate.shape.keptUsefulMiddleCount),
      weakTerminalCleanupBonus: numberOrNull(candidate.shape.weakTerminalCleanupBonus),
      isolatedHonorCleanupBonus: numberOrNull(candidate.shape.isolatedHonorCleanupBonus),
      middleTileCutPenalty: numberOrNull(candidate.shape.middleTileCutPenalty),
      fiveOrRedFiveCutPenalty: numberOrNull(candidate.shape.fiveOrRedFiveCutPenalty),
      doraRetentionPenalty: numberOrNull(candidate.shape.doraRetentionPenalty),
      pairOrBlockBreakPenalty: numberOrNull(candidate.shape.pairOrBlockBreakPenalty),
      reasons: Array.isArray(candidate.shape.reasons) ? candidate.shape.reasons.slice() : []
    } : null
  };
}

function hasRouteDoraOrFive(candidate = null) {
  if (!candidate || typeof candidate !== 'object') return false;
  const tileCode = String(candidate.tileCode || '');
  if (/^[mps][05]/.test(tileCode)) return true;
  const shape = candidate.shape && typeof candidate.shape === 'object' ? candidate.shape : {};
  const role = String(shape.discardTileRole || '');
  if (role.includes('five') || role.includes('value-honor')) return true;
  const reasons = Array.isArray(shape.reasons) ? shape.reasons : [];
  return reasons.some((reason) => (
    String(reason).includes('dora')
    || String(reason).includes('five')
    || String(reason).includes('value-honor')
  ));
}

function classifyTileChoiceRow(row = null, baselineLargeIds = new Set()) {
  const localTile = row && row.localDecision ? row.localDecision.tileCode : null;
  const mortalTile = getMortalBestTile(row);
  const localCandidate = findSelectedHardCandidate(row) || findHardCandidate(row, localTile);
  const mortalCandidate = findHardCandidate(row, mortalTile);
  const categories = [];
  const relation = {
    xiangtingRelation: 'unknown',
    hardEvDelta: null,
    shapeDelta: null,
    hardEvDeltaBucket: 'unknown',
    shapeDeltaBucket: 'unknown'
  };

  if (!localCandidate || !mortalCandidate) {
    categories.push('missing-candidate-diagnostics');
  } else {
    const localXiangting = numberOrNull(localCandidate.metrics && localCandidate.metrics.xiangting);
    const mortalXiangting = numberOrNull(mortalCandidate.metrics && mortalCandidate.metrics.xiangting);
    if (localXiangting != null && mortalXiangting != null) {
      if (mortalXiangting === localXiangting) {
        relation.xiangtingRelation = 'same';
        categories.push('same-xiangting');
      } else if (mortalXiangting > localXiangting) {
        relation.xiangtingRelation = 'mortal-worse';
        categories.push('mortal-backstep-shape');
      } else {
        relation.xiangtingRelation = 'mortal-better';
        categories.push('mortal-lower-xiangting');
      }
    }

    const localEv = numberOrNull(localCandidate.hardMetrics && localCandidate.hardMetrics.hardEvScore);
    const mortalEv = numberOrNull(mortalCandidate.hardMetrics && mortalCandidate.hardMetrics.hardEvScore);
    if (localEv != null && mortalEv != null) {
      relation.hardEvDelta = roundMetric(localEv - mortalEv);
      const absDelta = Math.abs(relation.hardEvDelta);
      relation.hardEvDeltaBucket = absDelta <= EV_NEAR_DELTA ? '<=12' : absDelta <= EV_MEDIUM_DELTA ? '13-80' : '>80';
      if (relation.xiangtingRelation === 'same' && relation.hardEvDelta > EV_NEAR_DELTA) {
        categories.push('ev-prefers-local-against-mortal');
      }
      if (relation.xiangtingRelation === 'same' && relation.hardEvDelta < -EV_NEAR_DELTA) {
        categories.push('ranking-overrode-hard-ev');
      }
    }

    const localShape = numberOrNull(localCandidate.shape && localCandidate.shape.discardShapeScore);
    const mortalShape = numberOrNull(mortalCandidate.shape && mortalCandidate.shape.discardShapeScore);
    if (localShape != null && mortalShape != null) {
      relation.shapeDelta = roundMetric(localShape - mortalShape);
      const absDelta = Math.abs(relation.shapeDelta);
      relation.shapeDeltaBucket = absDelta <= SHAPE_NEAR_DELTA
        ? 'near'
        : relation.shapeDelta > 0
        ? 'shape-favors-local'
        : 'shape-favors-mortal';
      if (
        relation.xiangtingRelation === 'same'
        && Math.abs(Number(relation.hardEvDelta || 0)) <= EV_NEAR_DELTA
        && relation.shapeDelta >= -SHAPE_NEAR_DELTA
      ) {
        categories.push('shape-score-suspect');
      }
    }

    if (hasRouteDoraOrFive(localCandidate) || hasRouteDoraOrFive(mortalCandidate)) {
      categories.push('route-dora-or-five');
    }
  }

  if (baselineLargeIds.size) {
    categories.push(baselineLargeIds.has(row.id) ? 'stable-disagreement' : 'trajectory-introduced');
  }

  const primaryCategory = choosePrimaryCategory(categories, relation);
  return {
    primaryCategory,
    categories: Array.from(new Set(categories)),
    relation
  };
}

function choosePrimaryCategory(categories = [], relation = {}) {
  const set = new Set(categories);
  if (set.has('missing-candidate-diagnostics')) return 'missing-candidate-diagnostics';
  if (set.has('mortal-backstep-shape')) return 'mortal-backstep-shape';
  if (set.has('ranking-overrode-hard-ev')) return 'ranking-overrode-hard-ev';
  if (set.has('ev-prefers-local-against-mortal')) return 'ev-prefers-local-against-mortal';
  if (set.has('route-dora-or-five') && relation.hardEvDeltaBucket === '<=12') return 'route-dora-or-five';
  if (set.has('shape-score-suspect')) return 'shape-score-suspect';
  if (set.has('route-dora-or-five')) return 'route-dora-or-five';
  if (set.has('same-xiangting')) return 'same-xiangting-unclassified';
  return 'unclassified';
}

function buildBaselineLargeIds(baselineReport = null) {
  const rows = baselineReport && Array.isArray(baselineReport.rows) ? baselineReport.rows : [];
  return new Set(rows.filter(isTileChoiceLargeRow).map((row) => row.id).filter(Boolean));
}

function increment(map, key) {
  map[key] = (map[key] || 0) + 1;
}

function buildNextStepRecommendation(summary) {
  const primary = summary.primaryCategoryCounts || {};
  const backstep = Number(primary['mortal-backstep-shape'] || 0);
  const evLocal = Number(primary['ev-prefers-local-against-mortal'] || 0);
  const ranking = Number(primary['ranking-overrode-hard-ev'] || 0);
  const shape = Number(primary['shape-score-suspect'] || 0);
  if (evLocal + ranking >= Math.max(backstep, shape)) {
    return 'prioritize-hard-ev-and-shape-recalibration';
  }
  if (backstep >= Math.max(evLocal + ranking, shape)) {
    return 'prioritize-narrow-no-pressure-backstep-gate';
  }
  return 'prioritize-fixed-state-fixtures-before-policy-change';
}

function summarizeCorpusRows(rows = []) {
  const summary = {
    total: rows.length,
    sameXiangting: 0,
    mortalBackstep: 0,
    fixedStateRows: 0,
    missingDecisionContext: 0,
    primaryCategoryCounts: {},
    categoryCounts: {},
    hardEvDeltaBuckets: {},
    shapeDeltaBuckets: {},
    trajectoryCounts: {},
    topQDeltaRows: []
  };

  rows.forEach((row) => {
    if (row.classification && row.classification.relation.xiangtingRelation === 'same') summary.sameXiangting += 1;
    if (row.classification && row.classification.relation.xiangtingRelation === 'mortal-worse') summary.mortalBackstep += 1;
    if (row.fixedState) {
      summary.fixedStateRows += 1;
    } else {
      summary.missingDecisionContext += 1;
    }
    increment(summary.primaryCategoryCounts, row.primaryCategory || 'unknown');
    (row.categories || []).forEach((category) => increment(summary.categoryCounts, category));
    increment(summary.hardEvDeltaBuckets, row.classification && row.classification.relation.hardEvDeltaBucket || 'unknown');
    increment(summary.shapeDeltaBuckets, row.classification && row.classification.relation.shapeDeltaBucket || 'unknown');
    if ((row.categories || []).includes('trajectory-introduced')) increment(summary.trajectoryCounts, 'trajectory-introduced');
    if ((row.categories || []).includes('stable-disagreement')) increment(summary.trajectoryCounts, 'stable-disagreement');
  });

  summary.topQDeltaRows = rows
    .slice()
    .sort((left, right) => Number(right.qDelta || 0) - Number(left.qDelta || 0))
    .slice(0, 12)
    .map((row) => ({
      id: row.id,
      qDelta: row.qDelta,
      localTile: row.localTile,
      mortalTile: row.mortalTile,
      primaryCategory: row.primaryCategory,
      categories: row.categories,
      relation: row.classification ? row.classification.relation : null
    }));
  summary.nextStepRecommendation = buildNextStepRecommendation(summary);
  return summary;
}

function buildTileChoiceCorpus(report, baselineReport = null, options = {}) {
  const baselineLargeIds = buildBaselineLargeIds(baselineReport);
  const sourceRows = report && Array.isArray(report.rows) ? report.rows : [];
  const rows = sourceRows.filter(isTileChoiceLargeRow).map((row) => {
    const mortalTile = getMortalBestTile(row);
    const localTile = row && row.localDecision ? row.localDecision.tileCode : null;
    const localCandidate = findSelectedHardCandidate(row) || findHardCandidate(row, localTile);
    const mortalCandidate = findHardCandidate(row, mortalTile);
    const classification = classifyTileChoiceRow(row, baselineLargeIds);
    return {
      id: row.id,
      seed: row.seed,
      targetSeat: row.targetSeat,
      roundIndex: row.round && Number.isFinite(Number(row.round.roundIndex)) ? Number(row.round.roundIndex) : null,
      qDelta: row.mortalSeverity ? numberOrNull(row.mortalSeverity.qDelta) : null,
      localTile,
      mortalTile,
      localDecision: clone(row.localDecision || null),
      mortalDecision: clone(row.coachDecision || null),
      mortalBestCandidate: clone(row.bestMortalCandidate || null),
      localMortalCandidate: clone(row.localMortalCandidate || null),
      localCandidate: compactCandidate(localCandidate),
      mortalCandidate: compactCandidate(mortalCandidate),
      fixedState: clone(row.decisionContext || null),
      primaryCategory: classification.primaryCategory,
      categories: classification.categories,
      classification,
      notes: []
    };
  });

  return {
    source: 'hard-tile-choice-corpus',
    generatedAt: Date.now(),
    reportPath: options.reportPath || null,
    baselinePath: options.baselinePath || null,
    sourceReport: {
      totalRows: sourceRows.length,
      severityCounts: clone(report && (report.severityCounts || (report.severity && report.severity.counts)) || null)
    },
    filters: {
      bucket: 'tile-choice',
      severity: 'large'
    },
    summary: summarizeCorpusRows(rows),
    rows
  };
}

function parseArgs(argv = []) {
  const args = {
    help: false,
    report: DEFAULT_REPORT_PATH,
    baseline: DEFAULT_BASELINE_PATH,
    out: DEFAULT_OUT_PATH,
    stdout: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }
    if (token === '--report') {
      args.report = String(argv[index + 1] || '').trim() || args.report;
      index += 1;
      continue;
    }
    if (token === '--baseline') {
      args.baseline = String(argv[index + 1] || '').trim() || '';
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
  console.log('Usage: node games/majiang/scripts/analyze-hard-tile-choice-corpus.js [options]');
  console.log('');
  console.log('Options:');
  console.log('  --report <path>    Input Hard vs Mortal report. Default: /tmp/h12-p4-hard-vs-mortal-real.json');
  console.log('  --baseline <path>  Optional previous report for stable/trajectory labels. Default: /tmp/h12-p3-hard-vs-mortal-real.json');
  console.log('  --out <path>       Output corpus JSON. Default: /tmp/h12-p5-hard-tile-choice-corpus.json');
  console.log('  --stdout           Also print the full corpus JSON to stdout.');
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
  const report = readJson(args.report);
  const baseline = args.baseline && fs.existsSync(path.resolve(args.baseline))
    ? readJson(args.baseline)
    : null;
  const corpus = buildTileChoiceCorpus(report, baseline, {
    reportPath: args.report,
    baselinePath: baseline ? args.baseline : null
  });
  const output = JSON.stringify(corpus, null, 2);
  if (args.out) {
    fs.writeFileSync(path.resolve(args.out), output.concat('\n'), 'utf8');
  }
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
  DEFAULT_REPORT_PATH,
  DEFAULT_BASELINE_PATH,
  DEFAULT_OUT_PATH,
  normalizeTileCode,
  getBucket,
  isTileChoiceLargeRow,
  findHardCandidate,
  classifyTileChoiceRow,
  buildTileChoiceCorpus,
  summarizeCorpusRows,
  parseArgs
};
