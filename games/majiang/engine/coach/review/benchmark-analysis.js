'use strict';

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function classifyBenchmarkRow(row = {}) {
  const comparison = row && row.comparison ? row.comparison : null;
  const tags = Array.isArray(row.tags) ? row.tags : [];
  const hasDefenseTag = tags.includes('defense') || tags.includes('riichi-pressure');
  if (!comparison) {
    return {
      verdict: 'unknown',
      bucket: 'unknown',
      reason: 'no-comparison'
    };
  }

  if (comparison.exactMatch) {
    return {
      verdict: 'good',
      bucket: 'exact-match',
      reason: 'matched-mortal'
    };
  }

  if (comparison.mismatchKind === 'missing') {
    return {
      verdict: 'bad',
      bucket: 'missing',
      reason: 'no-mortal-decision'
    };
  }

  if (comparison.mismatchKind === 'action-type') {
    return {
      verdict: 'bad',
      bucket: 'action-type',
      reason: 'different-action-family'
    };
  }

  if (comparison.mismatchKind === 'riichi') {
    return {
      verdict: 'bad',
      bucket: 'riichi-threshold',
      reason: 'riichi-disagreement'
    };
  }

  if (comparison.mismatchKind === 'tile') {
    if (hasDefenseTag) {
      return {
        verdict: 'bad',
        bucket: 'tile-defense',
        reason: 'defense-tile-disagreement'
      };
    }
    return {
      verdict: 'neutral',
      bucket: 'tile-choice',
      reason: 'same-action-different-tile'
    };
  }

  if (comparison.mismatchKind === 'call') {
    return {
      verdict: 'neutral',
      bucket: 'call-detail',
      reason: 'same-action-different-call'
    };
  }

  return {
    verdict: 'neutral',
    bucket: comparison.mismatchKind || 'other',
    reason: 'unclassified'
  };
}

function summarizeSubjectRows(rows = [], subject = {}) {
  const summary = {
    id: subject.id || null,
    label: subject.label || null,
    type: subject.type || null,
    total: rows.length,
    mortalComparable: 0,
    mortalRate: 0,
    actionTypeRate: 0,
    riichiRate: 0,
    goodCount: 0,
    neutralCount: 0,
    badCount: 0,
    bucketCounts: {}
  };

  rows.forEach((row) => {
    const comparison = row && row.comparison ? row.comparison : null;
    const judgment = row && row.judgment ? row.judgment : classifyBenchmarkRow(row);
    if (row && row.coachDecision) summary.mortalComparable += 1;
    if (comparison && comparison.exactMatch) summary.mortalRate += 1;
    if (comparison && comparison.typeMatch) summary.actionTypeRate += 1;
    if (comparison && comparison.riichiMatch) summary.riichiRate += 1;
    if (judgment.verdict === 'good') summary.goodCount += 1;
    else if (judgment.verdict === 'bad') summary.badCount += 1;
    else summary.neutralCount += 1;
    const bucket = judgment.bucket || 'unknown';
    summary.bucketCounts[bucket] = (summary.bucketCounts[bucket] || 0) + 1;
  });

  if (summary.total > 0) {
    summary.mortalRate = Number((summary.mortalRate / summary.total).toFixed(4));
    summary.actionTypeRate = Number((summary.actionTypeRate / summary.total).toFixed(4));
    summary.riichiRate = Number((summary.riichiRate / summary.total).toFixed(4));
  }

  return summary;
}

function summarizeRoundRows(rows = [], round = {}) {
  const summary = summarizeSubjectRows(rows, {
    id: round.id || null,
    label: round.label || null,
    type: 'round'
  });
  return {
    ...summary,
    wind: round.wind || null,
    hand: round.hand || null
  };
}

function sortRowsBySeverity(rows = []) {
  const verdictWeight = {
    bad: 0,
    neutral: 1,
    good: 2,
    unknown: 3
  };
  return rows.slice().sort((left, right) => {
    const leftJudge = left && left.judgment ? left.judgment : classifyBenchmarkRow(left);
    const rightJudge = right && right.judgment ? right.judgment : classifyBenchmarkRow(right);
    const leftWeight = verdictWeight[leftJudge.verdict] ?? 9;
    const rightWeight = verdictWeight[rightJudge.verdict] ?? 9;
    if (leftWeight !== rightWeight) return leftWeight - rightWeight;
    return String(left && left.id || '').localeCompare(String(right && right.id || ''));
  });
}

function buildBenchmarkAnalysisReport(rows = [], options = {}) {
  const enrichedRows = rows.map((row) => ({
    ...clone(row),
    judgment: classifyBenchmarkRow(row)
  }));

  const subjectGrouped = new Map();
  enrichedRows.forEach((row) => {
    const subjectId = row && row.subject && row.subject.id ? row.subject.id : 'unknown';
    if (!subjectGrouped.has(subjectId)) subjectGrouped.set(subjectId, []);
    subjectGrouped.get(subjectId).push(row);
  });

  const roundGrouped = new Map();
  enrichedRows.forEach((row) => {
    const roundId = row && row.round && row.round.id ? row.round.id : 'default-round';
    if (!roundGrouped.has(roundId)) roundGrouped.set(roundId, []);
    roundGrouped.get(roundId).push(row);
  });

  const subjects = Array.from(subjectGrouped.entries()).map(([subjectId, subjectRows]) => {
    const subject = subjectRows[0] && subjectRows[0].subject ? subjectRows[0].subject : { id: subjectId };
    const orderedRows = sortRowsBySeverity(subjectRows);
    return {
      summary: summarizeSubjectRows(orderedRows, subject),
      goodHands: orderedRows.filter((row) => row.judgment && row.judgment.verdict === 'good'),
      neutralHands: orderedRows.filter((row) => row.judgment && row.judgment.verdict === 'neutral'),
      badHands: orderedRows.filter((row) => row.judgment && row.judgment.verdict === 'bad'),
      rows: orderedRows
    };
  });

  const rounds = Array.from(roundGrouped.entries()).map(([roundId, roundRows]) => {
    const round = roundRows[0] && roundRows[0].round ? roundRows[0].round : { id: roundId };
    const orderedRows = sortRowsBySeverity(roundRows);
    return {
      summary: summarizeRoundRows(orderedRows, round),
      rows: orderedRows
    };
  });

  const overview = summarizeSubjectRows(enrichedRows, {
    id: 'overview',
    label: options.overviewLabel || '全部样本',
    type: 'overview'
  });

  return {
    source: options.source || 'benchmark',
    generatedAt: Date.now(),
    scope: options.scope || 'single-round',
    totals: {
      rows: enrichedRows.length,
      subjects: subjects.length,
      rounds: rounds.length
    },
    overview,
    rounds,
    subjects
  };
}

module.exports = {
  classifyBenchmarkRow,
  summarizeSubjectRows,
  buildBenchmarkAnalysisReport
};
