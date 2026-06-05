'use strict';

const fs = require('fs');
const path = require('path');

const mortalBenchmarkApi = require('./benchmark-hard-vs-mortal');
const arenaApi = require('./benchmark-ai-hanchan-arena');
const stage1Api = require('./run-hard-ai-stage1-evidence');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertMortalVariantSmoke(targetVariant) {
  const report = mortalBenchmarkApi.buildBenchmarkReport(mortalBenchmarkApi.parseArgs([
    '--smoke',
    '--target-variant',
    targetVariant
  ]));
  assert(report && report.source === 'benchmark-hard-vs-mortal', `expected Mortal benchmark report for ${targetVariant}`);
  assert(report.targetVariant === targetVariant, `expected targetVariant ${targetVariant}, got ${JSON.stringify(report.targetVariant)}`);
  assert(report.targetDifficulty === 'hard', `expected hard difficulty for ${targetVariant}, got ${JSON.stringify(report.targetDifficulty)}`);
  assert(Array.isArray(report.rows) && report.rows.length >= 4, `expected smoke rows for ${targetVariant}, got ${report.rows && report.rows.length}`);
  assert(Array.isArray(report.subjects) && report.subjects.length === 4, `expected subjects for ${targetVariant}, got ${JSON.stringify(report.subjects)}`);
  report.subjects.forEach((subject) => {
    const id = subject && subject.summary ? subject.summary.id : null;
    assert(id && id.endsWith(`:${targetVariant}`), `expected subject id to end with ${targetVariant}, got ${JSON.stringify(id)}`);
  });
  report.rows.forEach((row) => {
    assert(row.subject && row.subject.variant === targetVariant, `expected row subject variant ${targetVariant}, got ${JSON.stringify(row.subject)}`);
    assert(row.mortalOk === true, `expected Mortal inference ok for ${targetVariant}/${row.id}`);
  });
  return report;
}

function validateTargetVariants() {
  const tuned = assertMortalVariantSmoke('hard-tuned');
  const pure = assertMortalVariantSmoke('hard-pure');
  assert(tuned.targetPolicyPatch && tuned.targetPolicyPatch.discard.enableNoPressureShapeReview === true, 'expected tuned policy patch to keep shape review');
  assert(pure.targetPolicyPatch && pure.targetPolicyPatch.discard.enableNoPressureShapeReview === false, 'expected pure policy patch to disable shape review');
  assert(pure.targetPolicyPatch.defense.enableLowDangerTiebreak === false, 'expected pure policy patch to disable low-danger defense');

  console.log('[PASS] hard-ai-stage1-target-variant-smoke');
  console.log(`  snapshot=${JSON.stringify({
    tunedRows: tuned.rows.length,
    pureRows: pure.rows.length,
    tunedSubjects: tuned.subjects.map((subject) => subject.summary.id),
    pureSubjects: pure.subjects.map((subject) => subject.summary.id)
  })}`);
  return { tuned, pure };
}

function validateStage1SummarySmoke(reports) {
  const tuned = reports.tuned;
  const pure = reports.pure;
  const arena = arenaApi.buildArenaReport(arenaApi.parseArgs([
    '--mode',
    'mixed',
    '--matches',
    '1',
    '--seed',
    '20260603'
  ]));
  const summary = stage1Api.buildStage1Summary(stage1Api.parseArgs([
    '--smoke',
    '--out',
    '/tmp/h14-p0-stage1-validator-summary.json'
  ]), {
    tunedMortal: tuned,
    pureMortal: pure,
    arena
  });

  assert(summary && summary.source === 'run-hard-ai-stage1-evidence', `unexpected summary source: ${JSON.stringify(summary && summary.source)}`);
  assert(summary.mortal && summary.mortal.hardTuned && summary.mortal.hardPure, 'expected tuned and pure Mortal summaries');
  assert(summary.mortal.tunedVsPure && typeof summary.mortal.tunedVsPure.largeBucketDelta === 'object', 'expected Mortal tuned-vs-pure comparison');
  assert(summary.arena && summary.arena.variants && summary.arena.variants['hard-tuned'], 'expected arena variant panels');
  assert(summary.candidatePool && typeof summary.candidatePool.total === 'number', 'expected candidate pool');
  assert(Array.isArray(summary.nextRepairPriority) && summary.nextRepairPriority.length >= 4, 'expected repair priorities');
  assert(summary.decisionRule.includes('Mortal finds'), `expected decision rule text, got ${JSON.stringify(summary.decisionRule)}`);

  const serialized = JSON.stringify(summary);
  ['stdout', 'stderr', '"runtime"', '"eventLog"'].forEach((forbidden) => {
    assert(!serialized.includes(forbidden), `stage1 summary should omit ${forbidden}`);
  });

  console.log('[PASS] hard-ai-stage1-summary-smoke');
  console.log(`  snapshot=${JSON.stringify({
    tunedRows: summary.mortal.hardTuned.rows,
    pureRows: summary.mortal.hardPure.rows,
    arenaMatches: summary.arena.totals.matches,
    candidatePool: summary.candidatePool.total
  })}`);
}

function validateStage1EvidenceSmoke(reports) {
  const outDir = '/tmp';
  const tunedPath = path.join(outDir, 'h14-p0-validator-hard-tuned.json');
  const purePath = path.join(outDir, 'h14-p0-validator-hard-pure.json');
  fs.writeFileSync(tunedPath, `${JSON.stringify(reports.tuned, null, 2)}\n`, 'utf8');
  fs.writeFileSync(purePath, `${JSON.stringify(reports.pure, null, 2)}\n`, 'utf8');
  const args = stage1Api.parseArgs([
    '--smoke',
    '--skip-mortal',
    '--tuned-mortal-out',
    tunedPath,
    '--pure-mortal-out',
    purePath,
    '--arena-out',
    path.join(outDir, 'h14-p0-validator-arena.json'),
    '--out',
    path.join(outDir, 'h14-p0-validator-summary.json')
  ]);
  const summary = stage1Api.buildStage1Evidence(args);
  assert(summary.mortal.hardTuned.rows >= 4, `expected tuned rows, got ${summary.mortal.hardTuned.rows}`);
  assert(summary.mortal.hardPure.rows >= 4, `expected pure rows, got ${summary.mortal.hardPure.rows}`);
  assert(summary.arena && summary.arena.totals.matches === 1, `expected one arena match, got ${JSON.stringify(summary.arena && summary.arena.totals)}`);
  assert(fs.existsSync(args.tunedMortalOut), `expected tuned output at ${args.tunedMortalOut}`);
  assert(fs.existsSync(args.pureMortalOut), `expected pure output at ${args.pureMortalOut}`);
  assert(fs.existsSync(args.arenaOut), `expected arena output at ${args.arenaOut}`);
  assert(fs.existsSync(args.out), `expected summary output at ${args.out}`);

  console.log('[PASS] hard-ai-stage1-evidence-smoke');
  console.log(`  snapshot=${JSON.stringify({
    tunedRows: summary.mortal.hardTuned.rows,
    pureRows: summary.mortal.hardPure.rows,
    arenaMatches: summary.arena.totals.matches,
    out: args.out
  })}`);
}

function main() {
  const reports = validateTargetVariants();
  validateStage1SummarySmoke(reports);
  validateStage1EvidenceSmoke(reports);
}

if (require.main === module) {
  main();
}

module.exports = {
  validateTargetVariants,
  validateStage1SummarySmoke,
  validateStage1EvidenceSmoke
};
