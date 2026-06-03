'use strict';

const repairApi = require('./build-hard-ai-repair-candidates');
const repairCandidateValidator = require('./validate-hard-ai-repair-candidates');
const experimentApi = require('./run-hard-ai-repair-experiment');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function makeMortalReport(targetVariant, rows = []) {
  return {
    source: 'benchmark-hard-vs-mortal',
    targetVariant,
    targetDifficulty: 'hard',
    rows: rows.map((row, index) => ({
      id: `${targetVariant}-row-${index + 1}`,
      seed: 20260603 + index,
      targetSeat: row.targetSeat || 'bottom',
      subject: {
        variant: targetVariant
      },
      judgment: {
        bucket: row.bucket || 'tile-choice'
      },
      mortalSeverity: {
        level: row.level || 'exact',
        qDelta: row.qDelta ?? 0
      }
    }))
  };
}

function makeArenaStats(overrides = {}) {
  return {
    appearances: overrides.appearances ?? 4,
    averageRank: overrides.averageRank ?? 2.45,
    averageScore: overrides.averageScore ?? 25600,
    averageFinalScoreDelta: overrides.averageFinalScoreDelta ?? 600,
    firstRate: overrides.firstRate ?? 0.28,
    secondRate: overrides.secondRate ?? 0.24,
    thirdRate: overrides.thirdRate ?? 0.25,
    fourthRate: overrides.fourthRate ?? 0.23,
    flownRate: overrides.flownRate ?? 0.05,
    winRatePerRound: overrides.winRatePerRound ?? 0.22,
    dealInRatePerRound: overrides.dealInRatePerRound ?? 0.15,
    dealInPaymentRatePerRound: overrides.dealInPaymentRatePerRound ?? 0.09,
    nonRiichiWinRate: overrides.nonRiichiWinRate ?? 0.32,
    drawRatePerRound: overrides.drawRatePerRound ?? 0.12,
    tsumoShareOfWins: overrides.tsumoShareOfWins ?? 0.38,
    tsumoRatePerRound: overrides.tsumoRatePerRound ?? 0.08,
    ronRatePerRound: overrides.ronRatePerRound ?? 0.14,
    riichiRoundRate: overrides.riichiRoundRate ?? 0.2,
    riichiPerDiscard: overrides.riichiPerDiscard ?? 0.025,
    callRoundRate: overrides.callRoundRate ?? 0.28,
    callPerRound: overrides.callPerRound ?? 0.45,
    callRatePerDiscard: overrides.callRatePerDiscard ?? 0.06,
    drawTenpaiRate: overrides.drawTenpaiRate ?? 0.5,
    averageWinTurn: overrides.averageWinTurn ?? 11.2,
    averageWinPoints: overrides.averageWinPoints ?? 6800,
    averageDealInPoints: overrides.averageDealInPoints ?? 6200,
    huleWins: overrides.huleWins ?? 14,
    tsumoWins: overrides.tsumoWins ?? 5,
    ronWins: overrides.ronWins ?? 9,
    dealIns: overrides.dealIns ?? 8,
    dealInRounds: overrides.dealInRounds ?? 8,
    drawRounds: overrides.drawRounds ?? 7,
    drawTenpai: overrides.drawTenpai ?? 3,
    riichi: overrides.riichi ?? 12,
    calls: overrides.calls ?? 20,
    callRounds: overrides.callRounds ?? 15,
    roundsSeen: overrides.roundsSeen ?? 56,
    uncertainty: {
      averageRankStandardError: overrides.averageRankStandardError ?? 0.04
    }
  };
}

function makeArenaReport() {
  return {
    source: 'benchmark-ai-hanchan-arena',
    scope: 'scripted-ai-headless-hanchan',
    status: 'complete',
    experimentalOverlays: [],
    variantOrder: ['hard-tuned', 'hard-experimental'],
    mixed: {
      summary: {
        totals: {
          matches: 2,
          completedMatches: 2,
          rounds: 24,
          errorCount: 0
        },
        variantStats: {
          'hard-tuned': makeArenaStats({
            averageRank: 2.44,
            fourthRate: 0.22,
            dealInRatePerRound: 0.15
          }),
          'hard-experimental': makeArenaStats({
            averageRank: 2.44,
            fourthRate: 0.22,
            dealInRatePerRound: 0.15
          })
        }
      }
    }
  };
}

function buildFixturePool() {
  return repairApi.buildRepairCandidates(repairCandidateValidator.buildFixtureInputs(), {
    out: '/tmp/h14-p2-validator-pool.json',
    inputs: {
      fixture: true
    }
  });
}

function assertNoLargeObjects(report) {
  const serialized = JSON.stringify(report);
  ['"runtime"', '"board"', '"eventLog"', '"stdout"', '"stderr"', '"mortalRoot"', '"hardContext"', '"waits"'].forEach((forbidden) => {
    assert(!serialized.includes(forbidden), `repair experiment report should omit ${forbidden}`);
  });
}

function validateHardExperimentalBaseline() {
  const policy = experimentApi.summarizePolicyEquivalence();
  assert(policy.tunedPolicyId === 'hard-tuned', `expected tuned policy id, got ${policy.tunedPolicyId}`);
  assert(policy.experimentalPolicyId === 'hard-experimental', `expected experimental policy id, got ${policy.experimentalPolicyId}`);
  assert(policy.experimentalOverlay && policy.experimentalOverlay.enabled === false, `expected disabled overlay, got ${JSON.stringify(policy.experimentalOverlay)}`);
  assert(policy.overlayEnabled === false, `expected overlayEnabled false, got ${policy.overlayEnabled}`);
  assert(policy.equivalentToHardTuned === true, `expected hard-experimental to match hard-tuned, got ${JSON.stringify(policy)}`);
  assert(Array.isArray(policy.differences) && policy.differences.length === 0, `expected no policy differences, got ${JSON.stringify(policy.differences)}`);

  console.log('[PASS] hard-ai-repair-experiment-policy-smoke');
  console.log(`  snapshot=${JSON.stringify({
    tunedPolicyId: policy.tunedPolicyId,
    experimentalPolicyId: policy.experimentalPolicyId,
    overlayEnabled: policy.overlayEnabled
  })}`);
}

function validateHardExperimentalOverlayPolicy() {
  const policy = experimentApi.summarizePolicyEquivalence({
    experimentalOverlays: ['defense-equal-safe-backstep-v1']
  });
  assert(policy.tunedPolicyId === 'hard-tuned', `expected tuned policy id, got ${policy.tunedPolicyId}`);
  assert(policy.experimentalPolicyId === 'hard-experimental', `expected experimental policy id, got ${policy.experimentalPolicyId}`);
  assert(policy.experimentalOverlay && policy.experimentalOverlay.enabled === true, `expected enabled overlay, got ${JSON.stringify(policy.experimentalOverlay)}`);
  assert(policy.overlayEnabled === true, `expected overlayEnabled true, got ${policy.overlayEnabled}`);
  assert(policy.equivalentToHardTuned === false, `expected overlay to differ from tuned, got ${JSON.stringify(policy)}`);
  assert(
    policy.differences.some((entry) => entry.path === 'defense.enableEqualSafeBackstep' && entry.experimental === true),
    `expected defense.enableEqualSafeBackstep diff, got ${JSON.stringify(policy.differences)}`
  );

  console.log('[PASS] hard-ai-repair-experiment-overlay-policy-smoke');
  console.log(`  snapshot=${JSON.stringify({
    overlays: policy.requestedOverlays,
    differences: policy.differences.map((entry) => entry.path)
  })}`);
}

function validateHardExperimentalTileChoiceOverlayPolicy() {
  const policy = experimentApi.summarizePolicyEquivalence({
    experimentalOverlays: ['no-pressure-same-xiangting-rerank-v1']
  });
  assert(policy.tunedPolicyId === 'hard-tuned', `expected tuned policy id, got ${policy.tunedPolicyId}`);
  assert(policy.experimentalPolicyId === 'hard-experimental', `expected experimental policy id, got ${policy.experimentalPolicyId}`);
  assert(policy.experimentalOverlay && policy.experimentalOverlay.enabled === true, `expected enabled overlay, got ${JSON.stringify(policy.experimentalOverlay)}`);
  assert(policy.overlayEnabled === true, `expected overlayEnabled true, got ${policy.overlayEnabled}`);
  assert(policy.equivalentToHardTuned === false, `expected overlay to differ from tuned, got ${JSON.stringify(policy)}`);
  assert(
    policy.differences.some((entry) => entry.path === 'discard.enableNoPressureSameXiangtingRerank' && entry.experimental === true),
    `expected discard.enableNoPressureSameXiangtingRerank diff, got ${JSON.stringify(policy.differences)}`
  );

  console.log('[PASS] hard-ai-repair-experiment-tile-choice-overlay-policy-smoke');
  console.log(`  snapshot=${JSON.stringify({
    overlays: policy.requestedOverlays,
    differences: policy.differences.map((entry) => entry.path)
  })}`);
}

function validateRepairExperimentSummary() {
  const pool = buildFixturePool();
  const summary = experimentApi.buildRepairExperimentSummary({
    smoke: true,
    pool: '/tmp/h14-p2-validator-pool.json',
    skipMortal: true,
    skipArena: true,
    mortalSamplesPerSeat: 1,
    arenaMatches: 1
  }, {
    pool,
    tunedMortal: makeMortalReport('hard-tuned', [
      { level: 'exact', bucket: 'tile-choice' },
      { level: 'large', bucket: 'tile-defense', qDelta: 1.8 }
    ]),
    experimentalMortal: makeMortalReport('hard-experimental', [
      { level: 'exact', bucket: 'tile-choice' },
      { level: 'large', bucket: 'tile-defense', qDelta: 1.8 }
    ]),
    arena: makeArenaReport()
  });

  assert(summary && summary.source === 'hard-ai-repair-experiment', `unexpected source: ${summary && summary.source}`);
  assert(summary.policy && summary.policy.equivalentToHardTuned === true, 'expected clean policy baseline');
  assert(summary.policy.experimentalOverlay && summary.policy.experimentalOverlay.enabled === false, 'expected overlay off');
  assert(summary.fixtureGate && summary.fixtureGate.fixtureCandidates > 0, `expected fixture gate candidates, got ${JSON.stringify(summary.fixtureGate)}`);
  assert(summary.fixtureGate.replayStatus === 'complete', `expected replay complete, got ${summary.fixtureGate.replayStatus}`);
  assert(summary.fixtureReplay && summary.fixtureReplay.summary, `expected fixture replay summary, got ${JSON.stringify(summary.fixtureReplay)}`);
  assert(summary.fixtureGate.tileChoiceReplay && summary.tileChoiceReplay && summary.tileChoiceReplay.summary, `expected tile-choice replay summary, got ${JSON.stringify(summary.fixtureGate)}`);
  assert(summary.mortal && summary.mortal.status === 'complete', `expected complete Mortal comparison, got ${JSON.stringify(summary.mortal)}`);
  assert(summary.mortal.hardTuned.rows === 2, `expected tuned Mortal rows, got ${JSON.stringify(summary.mortal.hardTuned)}`);
  assert(summary.mortal.hardExperimental.rows === 2, `expected experimental Mortal rows, got ${JSON.stringify(summary.mortal.hardExperimental)}`);
  assert(summary.mortal.largeDelta === 0, `expected no large delta for identical fixture reports, got ${summary.mortal.largeDelta}`);
  assert(summary.arena && summary.arena.variants['hard-tuned'], `expected tuned arena panel, got ${JSON.stringify(summary.arena)}`);
  assert(summary.arena.variants['hard-experimental'], `expected experimental arena panel, got ${JSON.stringify(summary.arena)}`);
  assert(summary.gate && summary.gate.status === 'ready-for-specific-patch-review', `expected ready-for-specific-patch-review, got ${JSON.stringify(summary.gate)}`);
  assert(summary.gate.passed.includes('experimental-policy-clean-baseline'), `expected policy gate pass, got ${JSON.stringify(summary.gate)}`);
  assert(summary.gate.passed.includes('fixture-replay-present'), `expected replay gate pass, got ${JSON.stringify(summary.gate)}`);
  assert(Array.isArray(summary.nextAllowedPatchOrder) && summary.nextAllowedPatchOrder[0].includes('defense'), `expected patch order, got ${JSON.stringify(summary.nextAllowedPatchOrder)}`);
  assertNoLargeObjects(summary);

  console.log('[PASS] hard-ai-repair-experiment-summary-smoke');
  console.log(`  snapshot=${JSON.stringify({
    fixtureCandidates: summary.fixtureGate.fixtureCandidates,
    mortalRows: summary.mortal.hardTuned.rows,
    arenaVariants: Object.keys(summary.arena.variants),
    gate: summary.gate.status
  })}`);
}

function validateRepairExperimentOverlaySummary() {
  const pool = buildFixturePool();
  const summary = experimentApi.buildRepairExperimentSummary({
    smoke: true,
    pool: '/tmp/h14-p2-validator-pool.json',
    skipMortal: true,
    skipArena: true,
    mortalSamplesPerSeat: 1,
    arenaMatches: 1,
    experimentalOverlays: ['defense-equal-safe-backstep-v1']
  }, {
    pool,
    tunedMortal: makeMortalReport('hard-tuned', [
      { level: 'exact', bucket: 'tile-choice' }
    ]),
    experimentalMortal: makeMortalReport('hard-experimental', [
      { level: 'exact', bucket: 'tile-choice' }
    ]),
    arena: {
      ...makeArenaReport(),
      experimentalOverlays: ['defense-equal-safe-backstep-v1']
    }
  });

  assert(summary.policy && summary.policy.overlayEnabled === true, `expected overlay enabled, got ${JSON.stringify(summary.policy)}`);
  assert(summary.policy.differences.some((entry) => entry.path === 'defense.enableEqualSafeBackstep'), `expected equal safe backstep diff, got ${JSON.stringify(summary.policy.differences)}`);
  assert(summary.options.experimentalOverlays.includes('defense-equal-safe-backstep-v1'), `expected overlay option, got ${JSON.stringify(summary.options)}`);
  assert(summary.fixtureGate.replayStatus === 'complete', `expected replay complete, got ${JSON.stringify(summary.fixtureGate)}`);
  assert(summary.gate.passed.includes('experimental-overlay-explicit'), `expected explicit overlay gate pass, got ${JSON.stringify(summary.gate)}`);
  assert(summary.gate.status === 'ready-for-specific-patch-review', `expected ready gate with provided comparisons, got ${JSON.stringify(summary.gate)}`);
  assertNoLargeObjects(summary);

  console.log('[PASS] hard-ai-repair-experiment-overlay-summary-smoke');
  console.log(`  snapshot=${JSON.stringify({
    overlays: summary.options.experimentalOverlays,
    fixtureReplay: summary.fixtureGate.replayStatus,
    gate: summary.gate.status
  })}`);
}

function validateRepairExperimentTileChoiceOverlaySummary() {
  const pool = buildFixturePool();
  const summary = experimentApi.buildRepairExperimentSummary({
    smoke: true,
    pool: '/tmp/h14-p2-validator-pool.json',
    skipMortal: true,
    skipArena: true,
    mortalSamplesPerSeat: 1,
    arenaMatches: 1,
    experimentalOverlays: ['no-pressure-same-xiangting-rerank-v1']
  }, {
    pool,
    tunedMortal: makeMortalReport('hard-tuned', [
      { level: 'exact', bucket: 'tile-choice' }
    ]),
    experimentalMortal: makeMortalReport('hard-experimental', [
      { level: 'exact', bucket: 'tile-choice' }
    ]),
    arena: {
      ...makeArenaReport(),
      experimentalOverlays: ['no-pressure-same-xiangting-rerank-v1']
    }
  });

  assert(summary.policy && summary.policy.overlayEnabled === true, `expected overlay enabled, got ${JSON.stringify(summary.policy)}`);
  assert(summary.policy.differences.some((entry) => entry.path === 'discard.enableNoPressureSameXiangtingRerank'), `expected rerank diff, got ${JSON.stringify(summary.policy.differences)}`);
  assert(summary.options.experimentalOverlays.includes('no-pressure-same-xiangting-rerank-v1'), `expected tile-choice overlay option, got ${JSON.stringify(summary.options)}`);
  assert(summary.fixtureGate.replayStatus === 'complete', `expected replay complete, got ${JSON.stringify(summary.fixtureGate)}`);
  assert(summary.fixtureGate.tileChoiceReplay && summary.tileChoiceReplay, `expected tile-choice replay, got ${JSON.stringify(summary.fixtureGate)}`);
  assert(summary.gate.passed.includes('experimental-overlay-explicit'), `expected explicit overlay gate pass, got ${JSON.stringify(summary.gate)}`);
  assertNoLargeObjects(summary);

  console.log('[PASS] hard-ai-repair-experiment-tile-choice-overlay-summary-smoke');
  console.log(`  snapshot=${JSON.stringify({
    overlays: summary.options.experimentalOverlays,
    tileChoiceReplay: summary.fixtureGate.tileChoiceReplay && summary.fixtureGate.tileChoiceReplay.total,
    gate: summary.gate.status
  })}`);
}

function main() {
  validateHardExperimentalBaseline();
  validateHardExperimentalOverlayPolicy();
  validateHardExperimentalTileChoiceOverlayPolicy();
  validateRepairExperimentSummary();
  validateRepairExperimentOverlaySummary();
  validateRepairExperimentTileChoiceOverlaySummary();
}

if (require.main === module) {
  main();
}

module.exports = {
  validateHardExperimentalBaseline,
  validateHardExperimentalOverlayPolicy,
  validateHardExperimentalTileChoiceOverlayPolicy,
  validateRepairExperimentSummary,
  validateRepairExperimentOverlaySummary,
  validateRepairExperimentTileChoiceOverlaySummary
};
