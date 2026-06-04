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
    'hard-aggressive',
    'hard-aggressive-dev',
    'hard-defensive',
    'hard-defensive-dev',
    'hard-balanced',
    'hard-balanced-dev',
    'hard-heavy'
  ]);
  const byId = variants.reduce((result, variant) => {
    result[variant.id] = variant;
    return result;
  }, {});
  assert(byId['hard-aggressive'] && byId['hard-aggressive'].policy, `expected hard-aggressive policy, got ${JSON.stringify(byId)}`);
  assert(byId['hard-aggressive-dev'] && byId['hard-aggressive-dev'].policy, `expected hard-aggressive-dev policy, got ${JSON.stringify(byId)}`);
  assert(byId['hard-defensive'] && byId['hard-defensive'].policy, `expected hard-defensive policy, got ${JSON.stringify(byId)}`);
  assert(byId['hard-defensive-dev'] && byId['hard-defensive-dev'].policy, `expected hard-defensive-dev policy, got ${JSON.stringify(byId)}`);
  assert(byId['hard-balanced'] && byId['hard-balanced'].policy, `expected hard-balanced policy, got ${JSON.stringify(byId)}`);
  assert(byId['hard-balanced-dev'] && byId['hard-balanced-dev'].policy, `expected hard-balanced-dev policy, got ${JSON.stringify(byId)}`);
  assert(byId['hard-heavy'] && byId['hard-heavy'].policy, `expected hard-heavy policy, got ${JSON.stringify(byId)}`);
  assert(byId['hard-aggressive'].policy.id === 'hard-aggressive', `expected aggressive policy id, got ${byId['hard-aggressive'].policy.id}`);
  assert(byId['hard-aggressive-dev'].policy.id === 'hard-aggressive-dev', `expected aggressive-dev policy id, got ${byId['hard-aggressive-dev'].policy.id}`);
  assert(byId['hard-defensive'].policy.id === 'hard-defensive', `expected defensive policy id, got ${byId['hard-defensive'].policy.id}`);
  assert(byId['hard-defensive-dev'].policy.id === 'hard-defensive-dev', `expected defensive-dev policy id, got ${byId['hard-defensive-dev'].policy.id}`);
  assert(byId['hard-balanced'].policy.id === 'hard-balanced', `expected balanced policy id, got ${byId['hard-balanced'].policy.id}`);
  assert(byId['hard-balanced-dev'].policy.id === 'hard-balanced-dev', `expected balanced-dev policy id, got ${byId['hard-balanced-dev'].policy.id}`);
  assert(byId['hard-heavy'].policy.id === 'hard-heavy', `expected heavy policy id, got ${byId['hard-heavy'].policy.id}`);
  assert(byId['hard-aggressive'].policy.personality === 'aggressive', `expected aggressive personality, got ${JSON.stringify(byId['hard-aggressive'].policy)}`);
  assert(byId['hard-aggressive-dev'].policy.personality === 'aggressive-dev', `expected aggressive-dev personality, got ${JSON.stringify(byId['hard-aggressive-dev'].policy)}`);
  assert(byId['hard-defensive'].policy.personality === 'defensive', `expected defensive personality, got ${JSON.stringify(byId['hard-defensive'].policy)}`);
  assert(byId['hard-defensive-dev'].policy.personality === 'defensive-dev', `expected defensive-dev personality, got ${JSON.stringify(byId['hard-defensive-dev'].policy)}`);
  assert(byId['hard-balanced'].policy.personality === 'balanced', `expected balanced personality, got ${JSON.stringify(byId['hard-balanced'].policy)}`);
  assert(byId['hard-balanced-dev'].policy.personality === 'balanced-dev', `expected balanced-dev personality, got ${JSON.stringify(byId['hard-balanced-dev'].policy)}`);
  assert(byId['hard-heavy'].policy.personality === 'heavy', `expected heavy personality, got ${JSON.stringify(byId['hard-heavy'].policy)}`);
  assert(byId['hard-aggressive'].policy.discard.enableNoPressureShapeReview === false, 'expected aggressive to use pure speed policy shape gate off');
  assert(byId['hard-aggressive-dev'].policy.devVariant.parent === 'hard-aggressive', `expected aggressive-dev parent, got ${JSON.stringify(byId['hard-aggressive-dev'].policy.devVariant)}`);
  assert(byId['hard-defensive'].policy.defense.enableLowDangerTiebreak === true, 'expected defensive to keep tuned defense gate');
  assert(byId['hard-defensive'].policy.defense.enableThreatScoreReview !== true, 'stable defensive must keep H17 threat review off');
  assert(byId['hard-defensive'].policy.defense.enableRankAwarePushFold !== true, 'stable defensive must keep H17 rank-aware push/fold off');
  assert(byId['hard-defensive-dev'].policy.devVariant.parent === 'hard-defensive', `expected defensive-dev parent, got ${JSON.stringify(byId['hard-defensive-dev'].policy.devVariant)}`);
  assert(byId['hard-defensive-dev'].policy.defense.enableThreatScoreReview === true, 'expected defensive-dev threat review enabled');
  assert(byId['hard-defensive-dev'].policy.defense.enableRankAwarePushFold === true, 'expected defensive-dev rank-aware push/fold enabled');
  assert(byId['hard-defensive-dev'].policy.defense.enableDealInAttribution === true, 'expected defensive-dev deal-in attribution enabled');
  assert(byId['hard-defensive-dev'].policy.defense.enableDefensiveUtilityShadow === true, 'expected defensive-dev utility shadow enabled');
  assert(byId['hard-defensive'].policy.defense.enableDefensiveUtilityShadow !== true, 'stable defensive must keep H17c utility shadow off');
  assert(byId['hard-defensive-dev'].policy.route.enableClosedRouteValueRebalance !== true, 'defensive-dev must keep route personality tuning off after H17b cleanup');
  assert(byId['hard-defensive-dev'].policy.riichi.minWaitQualityScore === byId['hard-defensive'].policy.riichi.minWaitQualityScore, 'defensive-dev must keep stable defensive riichi gate after H17b cleanup');
  assert(byId['hard-balanced'].policy.route.enableClosedRouteValueRebalance === true, 'expected balanced to enable closed route value scoring');
  assert(byId['hard-balanced'].policy.route.enableBalancedRouteState === true, 'expected promoted balanced to enable balanced route state');
  assert(byId['hard-balanced'].policy.route.closedRouteMaxXiangting === 2, `expected promoted balanced route range, got ${JSON.stringify(byId['hard-balanced'].policy.route)}`);
  assert(byId['hard-balanced'].policy.route.closedRouteOverrideMinMargin === 95, `expected promoted balanced route margin, got ${JSON.stringify(byId['hard-balanced'].policy.route)}`);
  assert(byId['hard-balanced'].policy.route.balancedValueOverrideMinMargin === 85, `expected promoted balanced value margin, got ${JSON.stringify(byId['hard-balanced'].policy.route)}`);
  assert(byId['hard-balanced'].policy.route.closedRouteOverrideMinMargin > byId['hard-heavy'].policy.route.closedRouteOverrideMinMargin, 'expected balanced to use stricter override margin than heavy');
  assert(byId['hard-balanced'].policy.riichi.minLiveTingpaiCount === 2, `expected promoted balanced riichi live gate, got ${JSON.stringify(byId['hard-balanced'].policy.riichi)}`);
  assert(byId['hard-balanced'].policy.riichi.minWaitQualityScore === 6, `expected promoted balanced riichi quality gate, got ${JSON.stringify(byId['hard-balanced'].policy.riichi)}`);
  assert(byId['hard-balanced-dev'].policy.devVariant.parent === 'hard-balanced', `expected balanced-dev parent, got ${JSON.stringify(byId['hard-balanced-dev'].policy.devVariant)}`);
  assert(byId['hard-balanced-dev'].policy.route.enableBalancedRouteState === byId['hard-balanced'].policy.route.enableBalancedRouteState, 'expected balanced-dev to inherit promoted route state');
  assert(byId['hard-balanced-dev'].policy.route.closedRouteMaxXiangting === byId['hard-balanced'].policy.route.closedRouteMaxXiangting, 'expected balanced-dev to inherit promoted route range');
  assert(byId['hard-balanced-dev'].policy.route.closedRouteOverrideMinMargin === byId['hard-balanced'].policy.route.closedRouteOverrideMinMargin, 'expected balanced-dev to inherit promoted route margin');
  assert(byId['hard-balanced-dev'].policy.riichi.minWaitQualityScore === byId['hard-balanced'].policy.riichi.minWaitQualityScore, 'expected balanced-dev to inherit promoted riichi gate');
  assert(byId['hard-heavy'].policy.route.enableClosedRouteValueRebalance === true, 'expected heavy to enable closed route value scoring');

  console.log('[PASS] ai-hanchan-arena-hard-personality-presets-smoke');
  console.log(`  snapshot=${JSON.stringify({
    variants: variants.map((variant) => variant.id),
    policies: variants.map((variant) => variant.policy.id),
    defensiveDevRouteEnabled: Boolean(byId['hard-defensive-dev'].policy.route.enableClosedRouteValueRebalance),
    defensiveDevUtilityShadowEnabled: Boolean(byId['hard-defensive-dev'].policy.defense.enableDefensiveUtilityShadow),
    balancedRouteMargin: byId['hard-balanced'].policy.route.closedRouteOverrideMinMargin,
    balancedDevRouteMargin: byId['hard-balanced-dev'].policy.route.closedRouteOverrideMinMargin,
    heavyRouteMargin: byId['hard-heavy'].policy.route.closedRouteOverrideMinMargin
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
  const variants = arenaApi.resolveVariants(['hard-balanced']);
  const summary = arenaApi.summarizeMatchRows([
    {
      completed: true,
      rounds: 10,
      seatResults: [
        {
          seat: 'bottom',
          variant: 'hard-balanced',
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
  const stats = summary.variantStats['hard-balanced'];
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
  const variants = arenaApi.resolveVariants(['hard-defensive-dev']);
  const summary = arenaApi.summarizeMatchRows([
    {
      completed: true,
      rounds: 10,
      seatResults: [
        {
          seat: 'bottom',
          variant: 'hard-defensive-dev',
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
        defensiveShadowReviewedDiscards: {
          bottom: 4
        },
        defensiveShadowDiffDiscards: {
          bottom: 2
        },
        defensiveShadowSaferAltDiscards: {
          bottom: 1
        },
        defensiveShadowBackstepDiscards: {
          bottom: 1
        },
        defensiveShadowActionableDiscards: {
          bottom: 1
        },
        defensiveShadowWouldAvoidDealIns: {
          bottom: 1
        },
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
        defensiveSafetyGateReviewedDiscards: {
          bottom: 5
        },
        defensiveSafetyGateOverrideDiscards: {
          bottom: 2
        },
        defensiveSafetyGateSameShantenDiscards: {
          bottom: 1
        },
        defensiveSafetyGateBackstepDiscards: {
          bottom: 1
        },
        defensiveSafetyGateProtectedPushDiscards: {
          bottom: 1
        },
        defensiveSafetyGateWouldAvoidDealIns: {
          bottom: 1
        },
        defensiveSafetyGateReasonCounts: {
          bottom: {
            'def-safety-gate-review': 5,
            'def-safety-gate-override': 2
          }
        }
      }
    }
  ], variants);
  const stats = summary.variantStats['hard-defensive-dev'];
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
  const text = arenaApi.formatArenaSummary('defensive fixture', summary, variants);
  assert(text.includes('defensiveState=protect-lead:2,neutral-defense:1'), `expected defensive state summary line, got ${text}`);
  assert(text.includes('threatReason=threat-riichi:2,threat-dealer-riichi:1'), `expected threat reason summary line, got ${text}`);
  assert(text.includes('dealInAttribution=open-hand-no-safe:1,riichi-push:1'), `expected deal-in attribution summary line, got ${text}`);
  assert(text.includes('defShadowReview/R=0.4 defShadowDiff/R=0.2 defShadowSaferAlt/R=0.1 defShadowBackstep/R=0.1 defShadowActionable/R=0.1 defShadowWouldAvoidDealIn=0.1'), `expected defensive shadow summary line, got ${text}`);
  assert(text.includes('defShadowReason=def-shadow-review:4,def-shadow-safer-alt:1'), `expected shadow reason summary line, got ${text}`);
  assert(text.includes('defShadowActionableReason=def-shadow-actionable-pressure:1,def-shadow-actionable-safer:1'), `expected shadow actionable reason summary line, got ${text}`);
  assert(text.includes('defSafetyGateReview/R=0.5 defSafetyGateOverride/R=0.2 defSafetyGateSameShanten/R=0.1 defSafetyGateBackstep/R=0.1 defSafetyGateProtectedPush/R=0.1 defSafetyGateWouldAvoidDealIn=0.1'), `expected safety gate summary line, got ${text}`);
  assert(text.includes('defSafetyGateReason=def-safety-gate-review:5,def-safety-gate-override:2'), `expected safety gate reason summary line, got ${text}`);

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
