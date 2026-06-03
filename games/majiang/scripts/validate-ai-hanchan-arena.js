'use strict';

const arenaApi = require('./benchmark-ai-hanchan-arena');
const arenaAnalyzer = require('./analyze-ai-hanchan-arena-report');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function validateMixedSmoke() {
  const args = arenaApi.parseArgs([
    '--mode',
    'mixed',
    '--matches',
    '1',
    '--seed',
    '20260603',
    '--include-rows'
  ]);
  const report = arenaApi.buildArenaReport(args);

  assert(report && report.source === 'benchmark-ai-hanchan-arena', `unexpected report source: ${JSON.stringify(report && report.source)}`);
  assert(report.scope === 'scripted-ai-headless-hanchan', `unexpected scope: ${JSON.stringify(report.scope)}`);
  assert(report.mixed && report.mixed.summary, 'expected mixed summary');
  assert(Array.isArray(report.mixed.rows) && report.mixed.rows.length === 1, 'expected one included mixed row');
  assert(report.mixed.summary.totals.matches === 1, `expected one match, got ${report.mixed.summary.totals.matches}`);
  assert(report.mixed.summary.totals.completedMatches === 1, `expected completed match, got ${report.mixed.summary.totals.completedMatches}`);
  assert(report.mixed.summary.totals.errorCount === 0, `expected no arena errors, got ${report.mixed.summary.totals.errorCount}`);

  const expectedVariants = ['easy', 'normal', 'hard-pure', 'hard-tuned'];
  expectedVariants.forEach((variantId) => {
    const stats = report.mixed.summary.variantStats[variantId];
    assert(stats, `missing variant stats for ${variantId}`);
    assert(stats.appearances === 1, `expected one mixed appearance for ${variantId}, got ${stats.appearances}`);
    assert(Number.isFinite(stats.averageRank), `expected average rank for ${variantId}`);
    assert(Number.isFinite(stats.averageScore), `expected average score for ${variantId}`);
    assert(Number.isFinite(stats.ronRatePerRound), `expected ron rate for ${variantId}`);
    assert(Number.isFinite(stats.drawRatePerRound), `expected draw rate for ${variantId}`);
    assert(Number.isFinite(stats.drawTenpaiRate), `expected draw tenpai rate for ${variantId}`);
    assert(Number.isFinite(stats.nonRiichiWinRate), `expected non-riichi win rate for ${variantId}`);
    assert(Number.isFinite(stats.tsumoShareOfWins), `expected tsumo share for ${variantId}`);
    assert(Number.isFinite(stats.callRoundRate), `expected call round rate for ${variantId}`);
    assert(Number.isFinite(stats.dealInPaymentRatePerRound), `expected deal-in payment rate for ${variantId}`);
    assert(stats.recordPanel && typeof stats.recordPanel === 'object', `expected record panel for ${variantId}`);
    assert(stats.uncertainty && typeof stats.uncertainty === 'object', `expected uncertainty for ${variantId}`);
    assert(Number.isFinite(stats.averageWinTurn), `expected average win turn for ${variantId}`);
    assert(Number.isFinite(stats.averageWinPoints), `expected average win points for ${variantId}`);
    assert(Number.isFinite(stats.averageDealInPoints), `expected average deal-in points for ${variantId}`);
    assert(Number.isFinite(stats.flownRate), `expected flown rate for ${variantId}`);
  });

  const row = report.mixed.rows[0];
  assert(row.rounds >= 8, `expected hanchan to include at least 8 rounds, got ${row.rounds}`);
  assert(row.seatVariants.bottom === 'easy', `expected rotated bottom variant easy, got ${row.seatVariants.bottom}`);
  assert(row.seatVariants.right === 'normal', `expected rotated right variant normal, got ${row.seatVariants.right}`);
  assert(row.seatVariants.top === 'hard-pure', `expected rotated top variant hard-pure, got ${row.seatVariants.top}`);
  assert(row.seatVariants.left === 'hard-tuned', `expected rotated left variant hard-tuned, got ${row.seatVariants.left}`);

  console.log('[PASS] ai-hanchan-arena-mixed-smoke');
  console.log(`  snapshot=${JSON.stringify({
    matches: report.mixed.summary.totals.matches,
    rounds: row.rounds,
    variants: report.variantOrder,
    finishReason: row.finishReason
  })}`);
}

function validateAnalyzerSmoke() {
  const args = arenaApi.parseArgs([
    '--mode',
    'mixed',
    '--matches',
    '1',
    '--seed',
    '20260605'
  ]);
  const report = arenaApi.buildArenaReport(args);
  const text = arenaAnalyzer.analyzeReport(report, { section: 'mixed', json: false });
  assert(typeof text === 'string' && text.includes('nonRiichiWin='), 'expected analyzer text to include record panel fields');
  assert(text.includes('drawTenpai='), 'expected analyzer text to include draw tenpai');

  const json = arenaAnalyzer.analyzeReport(report, { section: 'mixed', json: true });
  assert(json && json.variants && json.variants.easy, 'expected analyzer JSON for easy variant');
  assert(Object.prototype.hasOwnProperty.call(json.variants.easy, 'tsumoRate'), 'expected tsumo rate in analyzer JSON');

  console.log('[PASS] ai-hanchan-arena-analyzer-smoke');
  console.log(`  snapshot=${JSON.stringify({
    textLines: text.split('\n').length,
    variants: Object.keys(json.variants)
  })}`);
}

function validateRepeatedVariantLineup() {
  const args = arenaApi.parseArgs([
    '--mode',
    'mixed',
    '--matches',
    '4',
    '--variants',
    'hard-pure,hard-tuned,hard-tuned,hard-tuned',
    '--seed',
    '20260603'
  ]);
  const report = arenaApi.buildArenaReport(args);
  const summary = report.mixed && report.mixed.summary;
  assert(summary, 'expected mixed summary for repeated variant lineup');
  assert(JSON.stringify(report.variantOrder) === JSON.stringify(['hard-pure', 'hard-tuned', 'hard-tuned', 'hard-tuned']), `unexpected variant order: ${JSON.stringify(report.variantOrder)}`);
  assert(Array.isArray(report.variants) && report.variants.length === 2, `expected two unique variant configs, got ${report.variants && report.variants.length}`);
  assert(summary.variantStats['hard-pure'].appearances === 4, `expected one hard-pure seat per match, got ${summary.variantStats['hard-pure'].appearances}`);
  assert(summary.variantStats['hard-tuned'].appearances === 12, `expected three hard-tuned seats per match, got ${summary.variantStats['hard-tuned'].appearances}`);

  const text = arenaApi.formatArenaSummary('mixed repeated', summary, arenaApi.resolveVariants(args.variants, args));
  const hardTunedLineCount = text.split('\n').filter((line) => line.includes('[arena]   hard-tuned ')).length;
  assert(hardTunedLineCount === 1, `expected hard-tuned to be printed once, got ${hardTunedLineCount}`);

  console.log('[PASS] ai-hanchan-arena-repeated-variant-lineup-smoke');
  console.log(`  snapshot=${JSON.stringify({
    variantOrder: report.variantOrder,
    uniqueVariants: report.variants.map((variant) => variant.id),
    hardPureAppearances: summary.variantStats['hard-pure'].appearances,
    hardTunedAppearances: summary.variantStats['hard-tuned'].appearances
  })}`);
}

function validateMirrorStructure() {
  const args = arenaApi.parseArgs([
    '--mode',
    'mirror',
    '--matches',
    '1',
    '--variants',
    'easy,hard-tuned',
    '--seed',
    '20260604'
  ]);
  const report = arenaApi.buildArenaReport(args);

  assert(report.mirror, 'expected mirror section');
  ['easy', 'hard-tuned'].forEach((variantId) => {
    const section = report.mirror[variantId];
    assert(section && section.summary, `missing mirror summary for ${variantId}`);
    assert(!section.rows, 'mirror rows should stay hidden without --include-rows');
    assert(section.summary.totals.matches === 1, `expected one mirror match for ${variantId}`);
    assert(section.summary.totals.completedMatches === 1, `expected completed mirror match for ${variantId}`);
    const stats = section.summary.variantStats[variantId];
    assert(stats && stats.appearances === 4, `expected four seat appearances for ${variantId}`);
  });

  console.log('[PASS] ai-hanchan-arena-mirror-structure-smoke');
  console.log(`  snapshot=${JSON.stringify({
    variants: report.variantOrder,
    easyMatches: report.mirror.easy.summary.totals.matches,
    hardTunedMatches: report.mirror['hard-tuned'].summary.totals.matches
  })}`);
}

function main() {
  validateMixedSmoke();
  validateAnalyzerSmoke();
  validateRepeatedVariantLineup();
  validateMirrorStructure();
}

if (require.main === module) {
  main();
}

module.exports = {
  validateMixedSmoke,
  validateRepeatedVariantLineup,
  validateMirrorStructure
};
