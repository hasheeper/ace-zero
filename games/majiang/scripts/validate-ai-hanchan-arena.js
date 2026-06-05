'use strict';

const arenaApi = require('./benchmark-ai-hanchan-arena');
const arenaAnalyzer = require('./analyze-ai-hanchan-arena-report');
const hardVariantApi = require('../engine/ai/difficulty/hard-variants');

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

  const expectedVariants = ['easy', 'normal', 'hard-pure-v1', 'hard-tuned-v2'];
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
    assert(Number.isFinite(stats.chiCallPerRound), `expected chi call rate for ${variantId}`);
    assert(Number.isFinite(stats.pengCallPerRound), `expected peng call rate for ${variantId}`);
    assert(Number.isFinite(stats.closedCallPerRound), `expected closed call rate for ${variantId}`);
    assert(Number.isFinite(stats.flatCallPerRound), `expected flat call rate for ${variantId}`);
    assert(Number.isFinite(stats.shantenImproveCallPerRound), `expected shanten-improve call rate for ${variantId}`);
    assert(Number.isFinite(stats.yakuhaiPengCallPerRound), `expected yakuhai peng call rate for ${variantId}`);
    assert(Number.isFinite(stats.riichiOpportunityPerRound), `expected riichi opportunity rate for ${variantId}`);
    assert(Number.isFinite(stats.riichiOpportunityTakeRate), `expected riichi opportunity take rate for ${variantId}`);
    assert(Number.isFinite(stats.closedRouteReviewPerRound), `expected closed route review rate for ${variantId}`);
    assert(Number.isFinite(stats.closedRouteOverridePerRound), `expected closed route override rate for ${variantId}`);
    assert(Number.isFinite(stats.averageCallOpenRouteScore), `expected average call route score for ${variantId}`);
    assert(Number.isFinite(stats.averagePassClosedRouteScore), `expected average pass route score for ${variantId}`);
    assert(Number.isFinite(stats.closedRouteMarginAverage), `expected closed route margin average for ${variantId}`);
    assert(Number.isFinite(stats.dealInPaymentRatePerRound), `expected deal-in payment rate for ${variantId}`);
    assert(stats.recordPanel && typeof stats.recordPanel === 'object', `expected record panel for ${variantId}`);
    assert(Object.prototype.hasOwnProperty.call(stats.recordPanel, 'chiCallsPerRound'), `expected call diagnostics panel for ${variantId}`);
    assert(Object.prototype.hasOwnProperty.call(stats.recordPanel, 'riichiOpportunityPerRound'), `expected riichi opportunity panel for ${variantId}`);
    assert(Object.prototype.hasOwnProperty.call(stats.recordPanel, 'closedRouteReviewPerRound'), `expected closed route review panel for ${variantId}`);
    assert(Object.prototype.hasOwnProperty.call(stats.recordPanel, 'averageCallOpenRouteScore'), `expected closed route score panel for ${variantId}`);
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
  assert(row.seatVariants.top === 'hard-pure-v1', `expected rotated top variant hard-pure-v1, got ${row.seatVariants.top}`);
  assert(row.seatVariants.left === 'hard-tuned-v2', `expected rotated left variant hard-tuned-v2, got ${row.seatVariants.left}`);

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
  assert(text.includes('chi/R='), 'expected analyzer text to include call diagnostics');
  assert(text.includes('riichiOpp/R='), 'expected analyzer text to include riichi opportunity diagnostics');
  assert(text.includes('closedRouteReview/R='), 'expected analyzer text to include closed route diagnostics');

  const json = arenaAnalyzer.analyzeReport(report, { section: 'mixed', json: true });
  assert(json && json.variants && json.variants.easy, 'expected analyzer JSON for easy variant');
  assert(Object.prototype.hasOwnProperty.call(json.variants.easy, 'tsumoRate'), 'expected tsumo rate in analyzer JSON');
  assert(Object.prototype.hasOwnProperty.call(json.variants.easy, 'chiCallsPerRound'), 'expected chi call rate in analyzer JSON');
  assert(Object.prototype.hasOwnProperty.call(json.variants.easy, 'closedRouteReviewPerRound'), 'expected closed route review rate in analyzer JSON');

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

function validateHardPersonalityPresets() {
  const variants = arenaApi.resolveVariants([
    'hard-pure-v1',
    'hard-pure-v1-dev',
    'hard-tuned-v2',
    'hard-closed-defense',
    'hard-standard',
    'hard-standard-dev',
    'hard-value-classic',
    'hard-aggressive',
    'hard-defensive-dev',
    'hard-balanced',
    'hard-heavy'
  ]);
  const byId = variants.reduce((result, variant) => {
    result[variant.id] = variant;
    return result;
  }, {});
  assert(byId['hard-pure-v1'] && byId['hard-pure-v1'].policy, `expected hard-pure-v1 policy, got ${JSON.stringify(byId)}`);
  assert(byId['hard-pure-v1-dev'] && byId['hard-pure-v1-dev'].policy, `expected hard-pure-v1-dev policy, got ${JSON.stringify(byId)}`);
  assert(byId['hard-tuned-v2'] && byId['hard-tuned-v2'].policy, `expected hard-tuned-v2 policy, got ${JSON.stringify(byId)}`);
  assert(byId['hard-closed-defense'] && byId['hard-closed-defense'].policy, `expected hard-closed-defense policy, got ${JSON.stringify(byId)}`);
  assert(byId['hard-standard'] && byId['hard-standard'].policy, `expected hard-standard policy, got ${JSON.stringify(byId)}`);
  assert(byId['hard-standard-dev'] && byId['hard-standard-dev'].policy, `expected hard-standard-dev policy, got ${JSON.stringify(byId)}`);
  assert(byId['hard-value-classic'] && byId['hard-value-classic'].policy, `expected hard-value-classic policy, got ${JSON.stringify(byId)}`);
  assert(byId['hard-aggressive'].policy.id === 'hard-pure-v1', `expected legacy aggressive to canonicalize, got ${byId['hard-aggressive'].policy.id}`);
  assert(byId['hard-defensive-dev'].policy.id === 'hard-closed-defense', `expected legacy defensive-dev to canonicalize, got ${byId['hard-defensive-dev'].policy.id}`);
  assert(byId['hard-balanced'].policy.id === 'hard-standard', `expected legacy balanced to canonicalize, got ${byId['hard-balanced'].policy.id}`);
  assert(byId['hard-heavy'].policy.id === 'hard-value-classic', `expected legacy heavy to canonicalize, got ${byId['hard-heavy'].policy.id}`);
  assert(byId['hard-pure-v1'].policy.id === 'hard-pure-v1', `expected pure-v1 policy id, got ${byId['hard-pure-v1'].policy.id}`);
  assert(byId['hard-pure-v1-dev'].policy.id === 'hard-pure-v1-dev', `expected pure-v1-dev policy id, got ${byId['hard-pure-v1-dev'].policy.id}`);
  assert(byId['hard-tuned-v2'].policy.id === 'hard-tuned-v2', `expected tuned-v2 policy id, got ${byId['hard-tuned-v2'].policy.id}`);
  assert(byId['hard-closed-defense'].policy.id === 'hard-closed-defense', `expected closed-defense policy id, got ${byId['hard-closed-defense'].policy.id}`);
  assert(byId['hard-standard'].policy.id === 'hard-standard', `expected standard policy id, got ${byId['hard-standard'].policy.id}`);
  assert(byId['hard-standard-dev'].policy.id === 'hard-standard-dev', `expected standard-dev policy id, got ${byId['hard-standard-dev'].policy.id}`);
  assert(byId['hard-value-classic'].policy.id === 'hard-value-classic', `expected value-classic policy id, got ${byId['hard-value-classic'].policy.id}`);
  assert(byId['hard-pure-v1'].policy.personality === 'pure-v1', `expected pure-v1 personality, got ${JSON.stringify(byId['hard-pure-v1'].policy)}`);
  assert(byId['hard-pure-v1-dev'].policy.personality === 'pure-v1-dev', `expected pure-v1-dev personality, got ${JSON.stringify(byId['hard-pure-v1-dev'].policy)}`);
  assert(byId['hard-tuned-v2'].policy.personality === 'tuned-v2', `expected tuned-v2 personality, got ${JSON.stringify(byId['hard-tuned-v2'].policy)}`);
  assert(byId['hard-closed-defense'].policy.personality === 'closed-defense', `expected closed-defense personality, got ${JSON.stringify(byId['hard-closed-defense'].policy)}`);
  assert(byId['hard-standard'].policy.personality === 'standard', `expected standard personality, got ${JSON.stringify(byId['hard-standard'].policy)}`);
  assert(byId['hard-standard-dev'].policy.personality === 'standard-dev', `expected standard-dev personality, got ${JSON.stringify(byId['hard-standard-dev'].policy)}`);
  assert(byId['hard-value-classic'].policy.personality === 'value-classic', `expected value-classic personality, got ${JSON.stringify(byId['hard-value-classic'].policy)}`);
  assert(byId['hard-pure-v1'].policy.discard.enableNoPressureShapeReview === false, 'expected pure-v1 shape gate off');
  assert(byId['hard-pure-v1-dev'].policy.devVariant.parent === 'hard-pure-v1', `expected pure-v1-dev parent, got ${JSON.stringify(byId['hard-pure-v1-dev'].policy.devVariant)}`);
  assert(byId['hard-tuned-v2'].policy.defense.enableLowDangerTiebreak === true, 'expected tuned-v2 to keep tuned defense gate');
  assert(byId['hard-tuned-v2'].policy.defense.enableThreatScoreReview !== true, 'stable tuned-v2 must keep H17 threat review off');
  assert(byId['hard-tuned-v2'].policy.defense.enableRankAwarePushFold !== true, 'stable tuned-v2 must keep H17 rank-aware push/fold off');
  assert(byId['hard-closed-defense'].policy.devVariant.parent === 'hard-tuned-v2', `expected closed-defense parent, got ${JSON.stringify(byId['hard-closed-defense'].policy.devVariant)}`);
  assert(byId['hard-closed-defense'].policy.defense.enableThreatScoreReview === true, 'expected closed-defense threat review enabled');
  assert(byId['hard-closed-defense'].policy.defense.enableRankAwarePushFold === true, 'expected closed-defense rank-aware push/fold enabled');
  assert(byId['hard-closed-defense'].policy.defense.enableDealInAttribution === true, 'expected closed-defense deal-in attribution enabled');
  assert(byId['hard-closed-defense'].policy.defense.enableDefensiveUtilityShadow === true, 'expected closed-defense utility shadow enabled');
  assert(byId['hard-closed-defense'].policy.defense.enableDefensiveCallGate === true, 'expected closed-defense defensive call gate enabled');
  assert(byId['hard-tuned-v2'].policy.defense.enableDefensiveUtilityShadow !== true, 'stable tuned-v2 must keep H17c utility shadow off');
  assert(byId['hard-tuned-v2'].policy.defense.enableDefensiveCallGate !== true, 'stable tuned-v2 must keep H17e call gate off');
  assert(byId['hard-closed-defense'].policy.route.enableClosedRouteValueRebalance !== true, 'closed-defense must keep route personality tuning off');
  assert(byId['hard-closed-defense'].policy.riichi.minWaitQualityScore < byId['hard-tuned-v2'].policy.riichi.minWaitQualityScore, 'closed-defense should use lower no-pressure riichi quality gate');
  assert(byId['hard-closed-defense'].policy.riichi.pressureMinHandValue > byId['hard-tuned-v2'].policy.riichi.pressureMinHandValue, 'closed-defense should keep pressure riichi stricter');
  assert(byId['hard-standard'].policy.route.enableClosedRouteValueRebalance === true, 'expected standard to enable closed route value scoring');
  assert(byId['hard-standard'].policy.route.enableBalancedRouteState === true, 'expected standard to enable balanced route state');
  assert(byId['hard-standard'].policy.route.closedRouteMaxXiangting === 2, `expected standard route range, got ${JSON.stringify(byId['hard-standard'].policy.route)}`);
  assert(byId['hard-standard'].policy.route.closedRouteOverrideMinMargin === 95, `expected standard route margin, got ${JSON.stringify(byId['hard-standard'].policy.route)}`);
  assert(byId['hard-standard'].policy.route.balancedValueOverrideMinMargin === 85, `expected standard value margin, got ${JSON.stringify(byId['hard-standard'].policy.route)}`);
  assert(byId['hard-standard'].policy.route.closedRouteOverrideMinMargin > byId['hard-value-classic'].policy.route.closedRouteOverrideMinMargin, 'expected standard to use stricter override margin than value-classic');
  assert(byId['hard-standard'].policy.riichi.minLiveTingpaiCount === 2, `expected standard riichi live gate, got ${JSON.stringify(byId['hard-standard'].policy.riichi)}`);
  assert(byId['hard-standard'].policy.riichi.minWaitQualityScore === 6, `expected standard riichi quality gate, got ${JSON.stringify(byId['hard-standard'].policy.riichi)}`);
  assert(byId['hard-standard-dev'].policy.devVariant.parent === 'hard-standard', `expected standard-dev parent, got ${JSON.stringify(byId['hard-standard-dev'].policy.devVariant)}`);
  assert(byId['hard-standard-dev'].policy.route.enableBalancedRouteState === byId['hard-standard'].policy.route.enableBalancedRouteState, 'expected standard-dev to inherit route state');
  assert(byId['hard-standard-dev'].policy.route.closedRouteMaxXiangting === byId['hard-standard'].policy.route.closedRouteMaxXiangting, 'expected standard-dev to inherit route range');
  assert(byId['hard-standard-dev'].policy.route.closedRouteOverrideMinMargin === byId['hard-standard'].policy.route.closedRouteOverrideMinMargin, 'expected standard-dev to inherit route margin');
  assert(byId['hard-standard-dev'].policy.riichi.minWaitQualityScore === byId['hard-standard'].policy.riichi.minWaitQualityScore, 'expected standard-dev to inherit riichi gate');
  assert(byId['hard-value-classic'].policy.route.enableClosedRouteValueRebalance === true, 'expected value-classic to enable closed route value scoring');
  assert(hardVariantApi.normalizeHardPolicyId('hard-balanced') === 'hard-standard', 'expected hard-balanced alias to normalize to hard-standard');
  assert(hardVariantApi.isHardFamilyPolicyId('hard-defensive-dev') === true, 'expected legacy defensive-dev alias to remain in hard family');
  assert(hardVariantApi.isClosedDefensePolicyId('hard-defensive-dev') === true, 'expected legacy defensive-dev alias to use closed-defense gates');
  assert(hardVariantApi.isClosedRouteValuePolicyId('hard-balanced') === true, 'expected legacy balanced alias to keep route value review');
  assert(hardVariantApi.isBalancedRoutePolicyId('hard-balanced-dev') === true, 'expected legacy balanced-dev alias to keep balanced route state');
  assert(hardVariantApi.isClosedRouteValuePolicyId('hard-heavy') === true, 'expected legacy heavy alias to keep route value review');
  assert(hardVariantApi.isHardFamilyPolicyId('hard-balanced-candidate') === false, 'retired balanced candidate must not resolve as a hard family policy');
  assert(hardVariantApi.isHardFamilyPolicyId('hard-heavy-dev') === false, 'retired heavy-dev must not resolve as a hard family policy');

  console.log('[PASS] ai-hanchan-arena-hard-personality-presets-smoke');
  console.log(`  snapshot=${JSON.stringify({
    variants: variants.map((variant) => variant.id),
    policies: variants.map((variant) => variant.policy.id),
    closedDefenseRouteEnabled: Boolean(byId['hard-closed-defense'].policy.route.enableClosedRouteValueRebalance),
    closedDefenseUtilityShadowEnabled: Boolean(byId['hard-closed-defense'].policy.defense.enableDefensiveUtilityShadow),
    closedDefenseCallGateEnabled: Boolean(byId['hard-closed-defense'].policy.defense.enableDefensiveCallGate),
    closedDefenseRiichiWaitQuality: byId['hard-closed-defense'].policy.riichi.minWaitQualityScore,
    standardRouteMargin: byId['hard-standard'].policy.route.closedRouteOverrideMinMargin,
    standardDevRouteMargin: byId['hard-standard-dev'].policy.route.closedRouteOverrideMinMargin,
    valueClassicRouteMargin: byId['hard-value-classic'].policy.route.closedRouteOverrideMinMargin
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

function validateBalancedStateSummarySmoke() {
  const variants = arenaApi.resolveVariants(['hard-standard']);
  const summary = arenaApi.summarizeMatchRows([
    {
      completed: true,
      rounds: 10,
      seatResults: [
        {
          seat: 'bottom',
          variant: 'hard-standard',
          rank: 1,
          score: 32000
        }
      ],
      counters: {
        drawRounds: 0,
        balancedRouteStateCounts: {
          bottom: {
            value: 3,
            speed: 2
          }
        },
        balancedRouteStateReasonCounts: {
          bottom: {
            'balanced-state-riichi-potential': 3,
            'balanced-state-strong-call-gain': 2
          }
        },
        closedRouteValueReviewedCalls: { bottom: 5 },
        closedRouteValueOverrideCalls: { bottom: 3 },
        closedRouteCallOpenScoreSum: { bottom: 500 },
        closedRoutePassScoreSum: { bottom: 1200 },
        closedRouteMarginSum: { bottom: 700 },
        closedRouteScoreSamples: { bottom: 5 }
      }
    }
  ], variants);
  const stats = summary.variantStats['hard-standard'];
  assert(stats.balancedRouteStateCounts.value === 3, `expected value state count, got ${JSON.stringify(stats.balancedRouteStateCounts)}`);
  assert(stats.balancedRouteStateCounts.speed === 2, `expected speed state count, got ${JSON.stringify(stats.balancedRouteStateCounts)}`);
  assert(stats.balancedRouteStateReasonCounts['balanced-state-riichi-potential'] === 3, `expected balanced reason count, got ${JSON.stringify(stats.balancedRouteStateReasonCounts)}`);
  const text = arenaApi.formatArenaSummary('balanced-state fixture', summary, variants);
  assert(text.includes('balancedState=value:3,speed:2'), `expected balanced state summary line, got ${text}`);
  assert(text.includes('balancedStateReason=balanced-state-riichi-potential:3,balanced-state-strong-call-gain:2'), `expected balanced state reason summary line, got ${text}`);

  console.log('[PASS] ai-hanchan-arena-balanced-state-summary-smoke');
  console.log(`  snapshot=${JSON.stringify({
    variant: variants[0].id,
    balancedStateCounts: stats.balancedRouteStateCounts,
    balancedStateReasonCounts: stats.balancedRouteStateReasonCounts,
    closedRouteOverridePerRound: stats.closedRouteOverridePerRound
  })}`);
}

function validateDefensiveDiagnosticsSummarySmoke() {
  const variants = arenaApi.resolveVariants(['hard-closed-defense']);
  const summary = arenaApi.summarizeMatchRows([
    {
      completed: true,
      rounds: 10,
      seatResults: [
        {
          seat: 'bottom',
          variant: 'hard-closed-defense',
          rank: 2,
          score: 28000
        }
      ],
      counters: {
        drawRounds: 0,
        defensiveStateCounts: {
          bottom: {
            'protect-lead': 2,
            'neutral-defense': 1
          }
        },
        threatProfileReasonCounts: {
          bottom: {
            'threat-riichi': 2,
            'threat-dealer-riichi': 1
          }
        },
        dealInAttributionCounts: {
          bottom: {
            'riichi-push': 1,
            'open-hand-no-safe': 1
          }
        },
        defensiveShadowReviewedDiscards: { bottom: 4 },
        defensiveShadowDiffDiscards: { bottom: 2 },
        defensiveShadowSaferAltDiscards: { bottom: 1 },
        defensiveShadowBackstepDiscards: { bottom: 1 },
        defensiveShadowActionableDiscards: { bottom: 1 },
        defensiveShadowWouldAvoidDealIns: { bottom: 1 },
        defensiveShadowReasonCounts: {
          bottom: {
            'def-shadow-review': 4,
            'def-shadow-safer-alt': 1
          }
        },
        defensiveShadowActionableReasonCounts: {
          bottom: {
            'def-shadow-actionable-pressure': 1,
            'def-shadow-actionable-safer': 1
          }
        },
        defensiveSafetyGateReviewedDiscards: { bottom: 5 },
        defensiveSafetyGateOverrideDiscards: { bottom: 2 },
        defensiveSafetyGateSameShantenDiscards: { bottom: 1 },
        defensiveSafetyGateBackstepDiscards: { bottom: 1 },
        defensiveSafetyGateProtectedPushDiscards: { bottom: 1 },
        defensiveSafetyGateWouldAvoidDealIns: { bottom: 1 },
        defensiveSafetyGateReasonCounts: {
          bottom: {
            'def-safety-gate-review': 5,
            'def-safety-gate-override': 2
          }
        },
        defensiveCallGateReviewedCalls: { bottom: 6 },
        defensiveCallGateBlockedCalls: { bottom: 3 },
        defensiveCallGateFirstOpenBlockedCalls: { bottom: 2 },
        defensiveCallGateClosedRouteBlockedCalls: { bottom: 2 },
        defensiveCallGatePressureBlockedCalls: { bottom: 1 },
        defensiveCallGateAllowedDirectTenpaiCalls: { bottom: 1 },
        defensiveCallGateReasonCounts: {
          bottom: {
            'def-call-gate-review': 6,
            'def-call-gate-block': 3,
            'def-call-gate-allowed-direct-tenpai': 1
          }
        }
      }
    }
  ], variants);
  const stats = summary.variantStats['hard-closed-defense'];
  assert(stats.defensiveStateCounts['protect-lead'] === 2, `expected defensive state count, got ${JSON.stringify(stats.defensiveStateCounts)}`);
  assert(stats.threatProfileReasonCounts['threat-riichi'] === 2, `expected threat reason count, got ${JSON.stringify(stats.threatProfileReasonCounts)}`);
  assert(stats.dealInAttributionCounts['riichi-push'] === 1, `expected deal-in attribution count, got ${JSON.stringify(stats.dealInAttributionCounts)}`);
  assert(stats.defensiveShadowReviewedDiscards === 4, `expected shadow review count, got ${JSON.stringify(stats)}`);
  assert(stats.defensiveShadowDiffDiscards === 2, `expected shadow diff count, got ${JSON.stringify(stats)}`);
  assert(stats.defensiveShadowSaferAltDiscards === 1, `expected shadow safer alt count, got ${JSON.stringify(stats)}`);
  assert(stats.defensiveShadowBackstepDiscards === 1, `expected shadow backstep count, got ${JSON.stringify(stats)}`);
  assert(stats.defensiveShadowActionableDiscards === 1, `expected shadow actionable count, got ${JSON.stringify(stats)}`);
  assert(stats.defensiveShadowWouldAvoidDealIns === 1, `expected shadow would-avoid deal-in count, got ${JSON.stringify(stats)}`);
  assert(stats.defensiveShadowReasonCounts['def-shadow-review'] === 4, `expected shadow reason count, got ${JSON.stringify(stats.defensiveShadowReasonCounts)}`);
  assert(stats.defensiveShadowActionableReasonCounts['def-shadow-actionable-pressure'] === 1, `expected shadow actionable reason count, got ${JSON.stringify(stats.defensiveShadowActionableReasonCounts)}`);
  assert(stats.defensiveSafetyGateReviewedDiscards === 5, `expected safety gate review count, got ${JSON.stringify(stats)}`);
  assert(stats.defensiveSafetyGateOverrideDiscards === 2, `expected safety gate override count, got ${JSON.stringify(stats)}`);
  assert(stats.defensiveSafetyGateSameShantenDiscards === 1, `expected safety gate same-shanten count, got ${JSON.stringify(stats)}`);
  assert(stats.defensiveSafetyGateBackstepDiscards === 1, `expected safety gate backstep count, got ${JSON.stringify(stats)}`);
  assert(stats.defensiveSafetyGateProtectedPushDiscards === 1, `expected safety gate protected-push count, got ${JSON.stringify(stats)}`);
  assert(stats.defensiveSafetyGateWouldAvoidDealIns === 1, `expected safety gate would-avoid deal-in count, got ${JSON.stringify(stats)}`);
  assert(stats.defensiveSafetyGateReasonCounts['def-safety-gate-review'] === 5, `expected safety gate reason count, got ${JSON.stringify(stats.defensiveSafetyGateReasonCounts)}`);
  assert(stats.defensiveCallGateReviewedCalls === 6, `expected defensive call gate review count, got ${JSON.stringify(stats)}`);
  assert(stats.defensiveCallGateBlockedCalls === 3, `expected defensive call gate block count, got ${JSON.stringify(stats)}`);
  assert(stats.defensiveCallGateFirstOpenBlockedCalls === 2, `expected defensive call gate first-open count, got ${JSON.stringify(stats)}`);
  assert(stats.defensiveCallGateClosedRouteBlockedCalls === 2, `expected defensive call gate closed-route count, got ${JSON.stringify(stats)}`);
  assert(stats.defensiveCallGatePressureBlockedCalls === 1, `expected defensive call gate pressure count, got ${JSON.stringify(stats)}`);
  assert(stats.defensiveCallGateAllowedDirectTenpaiCalls === 1, `expected defensive call gate direct-tenpai count, got ${JSON.stringify(stats)}`);
  assert(stats.defensiveCallGateReasonCounts['def-call-gate-review'] === 6, `expected defensive call gate reason count, got ${JSON.stringify(stats.defensiveCallGateReasonCounts)}`);

  const text = arenaApi.formatArenaSummary('defensive fixture', summary, variants);
  assert(text.includes('defensiveState=protect-lead:2,neutral-defense:1'), `expected defensive state summary line, got ${text}`);
  assert(text.includes('threatReason=threat-riichi:2,threat-dealer-riichi:1'), `expected threat reason summary line, got ${text}`);
  assert(text.includes('dealInAttribution=open-hand-no-safe:1,riichi-push:1'), `expected deal-in attribution summary line, got ${text}`);
  assert(text.includes('defShadowReview/R=0.4 defShadowDiff/R=0.2 defShadowSaferAlt/R=0.1 defShadowBackstep/R=0.1 defShadowActionable/R=0.1 defShadowWouldAvoidDealIn=0.1'), `expected defensive shadow summary line, got ${text}`);
  assert(text.includes('defShadowReason=def-shadow-review:4,def-shadow-safer-alt:1'), `expected shadow reason summary line, got ${text}`);
  assert(text.includes('defShadowActionableReason=def-shadow-actionable-pressure:1,def-shadow-actionable-safer:1'), `expected shadow actionable reason summary line, got ${text}`);
  assert(text.includes('defSafetyGateReview/R=0.5 defSafetyGateOverride/R=0.2 defSafetyGateSameShanten/R=0.1 defSafetyGateBackstep/R=0.1 defSafetyGateProtectedPush/R=0.1 defSafetyGateWouldAvoidDealIn=0.1'), `expected safety gate summary line, got ${text}`);
  assert(text.includes('defSafetyGateReason=def-safety-gate-review:5,def-safety-gate-override:2'), `expected safety gate reason summary line, got ${text}`);
  assert(text.includes('defCallGateReview/R=0.6 defCallGateBlock/R=0.3 defCallGateFirstOpenBlock/R=0.2 defCallGateClosedRouteBlock/R=0.2 defCallGatePressureBlock/R=0.1 defCallGateAllowedDirectTenpai/R=0.1'), `expected defensive call gate summary line, got ${text}`);
  assert(text.includes('defCallGateReason=def-call-gate-review:6,def-call-gate-block:3,def-call-gate-allowed-direct-tenpai:1'), `expected defensive call gate reason summary line, got ${text}`);

  console.log('[PASS] ai-hanchan-arena-defensive-diagnostics-summary-smoke');
  console.log(`  snapshot=${JSON.stringify({
    variant: variants[0].id,
    defensiveStateCounts: stats.defensiveStateCounts,
    threatProfileReasonCounts: stats.threatProfileReasonCounts,
    dealInAttributionCounts: stats.dealInAttributionCounts,
    defensiveShadowReasonCounts: stats.defensiveShadowReasonCounts,
    defensiveShadowActionableReasonCounts: stats.defensiveShadowActionableReasonCounts,
    defensiveSafetyGateReasonCounts: stats.defensiveSafetyGateReasonCounts
  })}`);
}

function main() {
  validateMixedSmoke();
  validateAnalyzerSmoke();
  validateRepeatedVariantLineup();
  validateHardPersonalityPresets();
  validateBalancedStateSummarySmoke();
  validateDefensiveDiagnosticsSummarySmoke();
  validateMirrorStructure();
}

if (require.main === module) {
  main();
}

module.exports = {
  validateMixedSmoke,
  validateRepeatedVariantLineup,
  validateHardPersonalityPresets,
  validateBalancedStateSummarySmoke,
  validateDefensiveDiagnosticsSummarySmoke,
  validateMirrorStructure
};
