'use strict';

const path = require('path');
const {
  ROOT,
  buildEasyBenchmarkCases,
  evaluateCase,
  summarizeBenchmarkResults
} = require('./lib/ai-benchmark-helpers');
const { buildBenchmarkAnalysisReport } = require('../engine/coach/review/benchmark-analysis');
const { resolveMortalConfigPath } = require('../engine/coach/mortal/mortal-adapter');

function printSection(title) {
  console.log(`\n[${title}]`);
}

function formatDecision(decision = null) {
  if (!decision) return 'null';
  const parts = [];
  if (decision.type) parts.push(decision.type);
  if (decision.seat) parts.push(`seat=${decision.seat}`);
  if (decision.tileCode) parts.push(`tile=${decision.tileCode}`);
  if (decision.callType) parts.push(`call=${decision.callType}`);
  if (decision.meldString) parts.push(`meld=${decision.meldString}`);
  if (decision.riichi) parts.push('riichi=true');
  return parts.join(' · ') || 'empty';
}

function main() {
  const scenarioIds = process.argv.slice(2);
  const configPath = resolveMortalConfigPath({
    mortalRoot: path.resolve(ROOT, '..', 'third_party', 'Mortal')
  });
  const cases = buildEasyBenchmarkCases(ROOT).filter((entry) => (
    scenarioIds.length ? scenarioIds.includes(entry.id) : true
  ));

  if (!cases.length) {
    throw new Error(`No benchmark cases matched input ids: ${scenarioIds.join(', ')}`);
  }

  const rows = cases.map((caseDef) => evaluateCase(caseDef, { configPath }));
  const summary = summarizeBenchmarkResults(rows);
  const report = buildBenchmarkAnalysisReport(rows, {
    source: 'benchmark-ai-vs-mortal',
    scope: 'single-decision'
  });
  const judgmentById = new Map(
    report.subjects.flatMap((subject) => (
      Array.isArray(subject.rows)
        ? subject.rows.map((row) => [row.id, row.judgment])
        : []
    ))
  );

  printSection('AI Benchmark Summary');
  console.log(JSON.stringify(summary, null, 2));

  printSection('Case Details');
  rows.forEach((row) => {
    const judgment = judgmentById.get(row.id) || null;
    console.log(`- ${row.id} (${row.label})`);
    console.log(`  mortal: ok=${row.mortalOk} status=${row.suggestionStatus || '-'}`);
    console.log(`  local : ${formatDecision(row.localDecision)}`);
    console.log(`  coach : ${formatDecision(row.coachDecision)}`);
    console.log(`  match : exact=${row.comparison.exactMatch} type=${row.comparison.typeMatch} tile=${row.comparison.tileMatch} kind=${row.comparison.mismatchKind}`);
    console.log(`  judge : verdict=${judgment ? judgment.verdict : '-'} bucket=${judgment ? judgment.bucket : '-'}`);
  });

  printSection('Subject Analysis');
  report.subjects.forEach((subject) => {
    console.log(`- ${subject.summary.label || subject.summary.id}`);
    console.log(`  mortalRate=${subject.summary.mortalRate} actionTypeRate=${subject.summary.actionTypeRate} riichiRate=${subject.summary.riichiRate}`);
    console.log(`  good=${subject.summary.goodCount} neutral=${subject.summary.neutralCount} bad=${subject.summary.badCount}`);
    console.log(`  buckets=${JSON.stringify(subject.summary.bucketCounts)}`);
  });
}

main();
