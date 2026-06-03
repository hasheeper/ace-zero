'use strict';

const benchmarkApi = require('./benchmark-hard-vs-mortal');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function normalizeTileCodeForDiagnostics(tileCode) {
  if (typeof tileCode !== 'string' || !tileCode) return null;
  const normalized = String(tileCode).replace(/[\*_\+\=\-]+$/g, '');
  const redMatch = normalized.match(/^([mps])0$/);
  if (redMatch) return `${redMatch[1]}5`;
  return normalized;
}

function findHardCandidateDiagnostic(row, tileCode) {
  const normalizedTileCode = normalizeTileCodeForDiagnostics(tileCode);
  if (!normalizedTileCode || !row || !Array.isArray(row.hardCandidateDiagnostics)) return null;
  return row.hardCandidateDiagnostics.find((candidate) => (
    candidate
    && normalizeTileCodeForDiagnostics(candidate.tileCode) === normalizedTileCode
  )) || null;
}

function assertCompactHardCandidateDiagnostic(candidate, rowId) {
  assert(candidate && typeof candidate === 'object', `expected compact hard candidate diagnostic for ${rowId}, got ${JSON.stringify(candidate)}`);
  assert(typeof candidate.tileCode === 'string' && candidate.tileCode, `expected diagnostic tile code for ${rowId}, got ${JSON.stringify(candidate)}`);
  assert(Number.isFinite(Number(candidate.tileIndex)), `expected diagnostic tile index for ${rowId}, got ${JSON.stringify(candidate)}`);
  assert(typeof candidate.isDrawDiscard === 'boolean', `expected diagnostic draw flag for ${rowId}, got ${JSON.stringify(candidate)}`);
  assert(typeof candidate.selectedInitial === 'boolean', `expected diagnostic selectedInitial for ${rowId}, got ${JSON.stringify(candidate)}`);
  assert(typeof candidate.selectedFinal === 'boolean', `expected diagnostic selectedFinal for ${rowId}, got ${JSON.stringify(candidate)}`);
  assert(candidate.metrics && Number.isFinite(Number(candidate.metrics.xiangting)), `expected diagnostic metrics for ${rowId}, got ${JSON.stringify(candidate)}`);
  assert(candidate.danger && Number.isFinite(Number(candidate.danger.dangerScore)), `expected diagnostic danger for ${rowId}, got ${JSON.stringify(candidate)}`);
  assert(Number.isFinite(Number(candidate.danger.safetyRank)), `expected diagnostic safety rank for ${rowId}, got ${JSON.stringify(candidate.danger)}`);
  assert(Number.isFinite(Number(candidate.danger.defenseTileRank)), `expected diagnostic defense tile rank for ${rowId}, got ${JSON.stringify(candidate.danger)}`);
  assert(Array.isArray(candidate.danger.categories), `expected diagnostic danger categories for ${rowId}, got ${JSON.stringify(candidate.danger)}`);
  assert(Array.isArray(candidate.danger.reasons), `expected diagnostic danger reasons for ${rowId}, got ${JSON.stringify(candidate.danger)}`);
  assert(Array.isArray(candidate.danger.safetyReasons), `expected diagnostic safety reasons for ${rowId}, got ${JSON.stringify(candidate.danger)}`);
  assert(candidate.hardMetrics && Number.isFinite(Number(candidate.hardMetrics.hardEvScore)), `expected diagnostic hard metrics for ${rowId}, got ${JSON.stringify(candidate)}`);
  assert(!Object.prototype.hasOwnProperty.call(candidate.hardMetrics, 'waits'), `diagnostic hardMetrics should omit waits for ${rowId}, got ${JSON.stringify(candidate.hardMetrics)}`);
  assert(!Object.prototype.hasOwnProperty.call(candidate.hardMetrics, 'hardContext'), `diagnostic hardMetrics should omit hardContext for ${rowId}, got ${JSON.stringify(candidate.hardMetrics)}`);
  assert(Object.prototype.hasOwnProperty.call(candidate, 'shape'), `expected diagnostic shape field for ${rowId}, got ${JSON.stringify(candidate)}`);
  if (candidate.shape != null) {
    assert(Number.isFinite(Number(candidate.shape.discardShapeScore)), `expected diagnostic shape score for ${rowId}, got ${JSON.stringify(candidate.shape)}`);
    assert(typeof candidate.shape.discardTileRole === 'string', `expected diagnostic shape role for ${rowId}, got ${JSON.stringify(candidate.shape)}`);
    assert(Array.isArray(candidate.shape.reasons), `expected diagnostic shape reasons for ${rowId}, got ${JSON.stringify(candidate.shape)}`);
    ['waits', 'hardContext', 'hand', 'runtime', 'beforeShoupai', 'afterShoupai'].forEach((key) => {
      assert(!Object.prototype.hasOwnProperty.call(candidate.shape, key), `diagnostic shape should omit ${key} for ${rowId}, got ${JSON.stringify(candidate.shape)}`);
    });
  }
}

function assertDecisionContext(row) {
  const context = row && row.decisionContext;
  assert(context && typeof context === 'object', `expected decisionContext for ${row && row.id}, got ${JSON.stringify(context)}`);
  assert(context.seat === row.targetSeat, `expected context seat ${row.targetSeat} for ${row.id}, got ${JSON.stringify(context.seat)}`);
  assert(typeof context.phase === 'string' && context.phase, `expected context phase for ${row.id}, got ${JSON.stringify(context)}`);
  assert(Number.isFinite(Number(context.remaining)), `expected context remaining for ${row.id}, got ${JSON.stringify(context)}`);
  assert(Array.isArray(context.doraIndicators), `expected context dora indicators for ${row.id}, got ${JSON.stringify(context)}`);
  assert(context.scores && typeof context.scores === 'object', `expected context scores for ${row.id}, got ${JSON.stringify(context)}`);
  assert(context.round && typeof context.round === 'object', `expected context round for ${row.id}, got ${JSON.stringify(context)}`);
  assert(context.seats && typeof context.seats === 'object', `expected context seats for ${row.id}, got ${JSON.stringify(context)}`);
  benchmarkApi.SEATS.forEach((seatKey) => {
    const seat = context.seats[seatKey];
    assert(seat && typeof seat === 'object', `expected context seat ${seatKey} for ${row.id}, got ${JSON.stringify(context.seats)}`);
    assert(Array.isArray(seat.handCodes), `expected ${seatKey} handCodes for ${row.id}, got ${JSON.stringify(seat)}`);
    assert(Array.isArray(seat.riverCodes), `expected ${seatKey} riverCodes for ${row.id}, got ${JSON.stringify(seat)}`);
    assert(Array.isArray(seat.melds), `expected ${seatKey} melds for ${row.id}, got ${JSON.stringify(seat)}`);
    assert(seat.riichi && typeof seat.riichi.declared === 'boolean', `expected ${seatKey} riichi state for ${row.id}, got ${JSON.stringify(seat)}`);
  });
  assert(context.seats[row.targetSeat].handCodes.length >= 1, `expected target hand snapshot for ${row.id}, got ${JSON.stringify(context.seats[row.targetSeat])}`);
  benchmarkApi.SEATS
    .filter((seatKey) => seatKey !== row.targetSeat)
    .forEach((seatKey) => {
      assert(context.seats[seatKey].handCodes.length === 0, `expected hidden opponent hand for ${row.id}/${seatKey}, got ${JSON.stringify(context.seats[seatKey])}`);
    });
  assert(Array.isArray(context.discardCandidates) && context.discardCandidates.length >= 1, `expected context discard candidates for ${row.id}, got ${JSON.stringify(context)}`);
  assert(context.localDiscard && context.localDiscard.tileCode === row.localDecision.tileCode, `expected context local discard for ${row.id}, got ${JSON.stringify(context.localDiscard)}`);
  assert(
    context.discardCandidates.some((candidate) => (
      candidate
      && candidate.selectedFinal
      && normalizeTileCodeForDiagnostics(candidate.tileCode) === normalizeTileCodeForDiagnostics(row.localDecision.tileCode)
    )),
    `expected context selected discard candidate for ${row.id}, got ${JSON.stringify(context.discardCandidates)}`
  );
  const serialized = JSON.stringify(context);
  ['runtime', 'board', 'eventLog', 'stdout', 'stderr'].forEach((forbidden) => {
    assert(!serialized.includes(`"${forbidden}"`), `decisionContext should omit ${forbidden} for ${row.id}`);
  });
}

function buildMaskBits(indices) {
  return String(indices.reduce((bits, index) => bits | (1n << BigInt(index)), 0n));
}

function makeDecodedEntry(type, actionIndices, qValues, runtimeAction = null) {
  return {
    type,
    runtimeAction,
    raw: {
      type,
      meta: {
        mask_bits: buildMaskBits(actionIndices),
        q_values: qValues,
        shanten: type === 'reach' ? 0 : 1,
        at_furiten: false,
        is_greedy: true,
        batch_size: 1,
        eval_time_ns: 1
      }
    }
  };
}

function validateFreshMortalPrimarySelection() {
  const riichiLocal = {
    type: 'discard',
    seat: 'right',
    tileCode: 'm2',
    riichi: true
  };
  const riichiSuggestion = {
    decodedCount: 2,
    decoded: [
      makeDecodedEntry('none', [45], [0.1], {
        type: 'pass',
        seat: 'right'
      }),
      makeDecodedEntry('reach', [37, 45], [0.9, 0.1], null)
    ]
  };
  const riichiAlignment = {
    status: 'fresh',
    decodedCount: 2,
    previousMortalDecisionCount: 0,
    advancedBy: 2
  };
  const riichiContext = benchmarkApi.buildMortalRecordContext(riichiLocal, riichiSuggestion, riichiAlignment);
  assert(riichiContext.primaryRecord && riichiContext.primaryRecord.rawType === 'reach', `expected reach primary for riichi decision, got ${JSON.stringify(riichiContext.primaryRecord && riichiContext.primaryRecord.summary)}`);
  const riichiDiagnostics = benchmarkApi.buildMortalCandidateDiagnostics(
    riichiLocal,
    riichiContext.coachDecision,
    { exactMatch: true },
    riichiSuggestion,
    riichiAlignment,
    riichiContext
  );
  assert(riichiDiagnostics.localMortalCandidate && riichiDiagnostics.localMortalCandidate.actionType === 'riichi', `expected local riichi candidate, got ${JSON.stringify(riichiDiagnostics.localMortalCandidate)}`);
  assert(riichiDiagnostics.mortalSeverity.level !== 'unknown', `expected riichi severity to be known, got ${JSON.stringify(riichiDiagnostics.mortalSeverity)}`);

  const noRiichiLocal = {
    type: 'discard',
    seat: 'right',
    tileCode: 'm9',
    riichi: false
  };
  const noRiichiSuggestion = {
    decodedCount: 2,
    decoded: [
      makeDecodedEntry('dahai', [17, 31], [0.8, 0.2], {
        type: 'discard',
        seat: 'right',
        tileCode: 'p9',
        riichi: false
      }),
      makeDecodedEntry('reach', [8, 37], [0.25, 0.7], null)
    ]
  };
  const noRiichiAlignment = {
    status: 'fresh',
    decodedCount: 2,
    previousMortalDecisionCount: 1,
    advancedBy: 1
  };
  const noRiichiContext = benchmarkApi.buildMortalRecordContext(noRiichiLocal, noRiichiSuggestion, noRiichiAlignment);
  assert(noRiichiContext.primaryRecord && noRiichiContext.primaryRecord.decodedIndex === 1, `expected fresh reach record, got ${JSON.stringify(noRiichiContext.primaryRecord && noRiichiContext.primaryRecord.summary)}`);
  assert(noRiichiContext.coachDecision && noRiichiContext.coachDecision.riichi === true, `expected derived coach riichi decision, got ${JSON.stringify(noRiichiContext.coachDecision)}`);
  const noRiichiDiagnostics = benchmarkApi.buildMortalCandidateDiagnostics(
    noRiichiLocal,
    noRiichiContext.coachDecision,
    { exactMatch: false },
    noRiichiSuggestion,
    noRiichiAlignment,
    noRiichiContext
  );
  assert(noRiichiDiagnostics.selectedMortalMetaRecords.length === 1, `expected only fresh meta records selected, got ${JSON.stringify(noRiichiDiagnostics.selectedMortalMetaRecords)}`);
  assert(noRiichiDiagnostics.localMortalCandidate && noRiichiDiagnostics.localMortalCandidate.actionType === 'discard', `expected local no-riichi discard candidate, got ${JSON.stringify(noRiichiDiagnostics.localMortalCandidate)}`);
  assert(noRiichiDiagnostics.localMortalCandidate.normalizedTileCode === 'm9', `expected local no-riichi m9 candidate, got ${JSON.stringify(noRiichiDiagnostics.localMortalCandidate)}`);
  assert(noRiichiDiagnostics.mortalSeverity.level !== 'unknown', `expected no-riichi severity to be known, got ${JSON.stringify(noRiichiDiagnostics.mortalSeverity)}`);
}

function validateHardPersonalityTargetVariants() {
  const aggressive = benchmarkApi.resolveTargetVariant(benchmarkApi.parseArgs([
    '--target-variant',
    'hard-aggressive'
  ]));
  const defensive = benchmarkApi.resolveTargetVariant(benchmarkApi.parseArgs([
    '--target-variant',
    'hard-defensive'
  ]));
  const balanced = benchmarkApi.resolveTargetVariant(benchmarkApi.parseArgs([
    '--target-variant',
    'hard-balanced'
  ]));
  const heavy = benchmarkApi.resolveTargetVariant(benchmarkApi.parseArgs([
    '--target-variant',
    'hard-heavy'
  ]));

  assert(aggressive.id === 'hard-aggressive' && aggressive.policy && aggressive.policy.id === 'hard-aggressive', `expected aggressive target policy, got ${JSON.stringify(aggressive)}`);
  assert(defensive.id === 'hard-defensive' && defensive.policy && defensive.policy.id === 'hard-defensive', `expected defensive target policy, got ${JSON.stringify(defensive)}`);
  assert(balanced.id === 'hard-balanced' && balanced.policy && balanced.policy.id === 'hard-balanced', `expected balanced target policy, got ${JSON.stringify(balanced)}`);
  assert(heavy.id === 'hard-heavy' && heavy.policy && heavy.policy.id === 'hard-heavy', `expected heavy target policy, got ${JSON.stringify(heavy)}`);
  assert(aggressive.policy.discard.enableNoPressureShapeReview === false, `expected aggressive/pure shape gate off, got ${JSON.stringify(aggressive.policy.discard)}`);
  assert(defensive.policy.defense.enableLowDangerTiebreak === true, `expected defensive tuned defense gate, got ${JSON.stringify(defensive.policy.defense)}`);
  assert(balanced.policy.route.enableClosedRouteValueRebalance === true, `expected balanced route scoring, got ${JSON.stringify(balanced.policy.route)}`);
  assert(balanced.policy.route.closedRouteMaxXiangting < heavy.policy.route.closedRouteMaxXiangting, `expected balanced route range to be narrower than heavy, got ${JSON.stringify({ balanced: balanced.policy.route, heavy: heavy.policy.route })}`);
  assert(heavy.policy.route.enableClosedRouteValueRebalance === true, `expected heavy route scoring, got ${JSON.stringify(heavy.policy.route)}`);

  console.log('[PASS] hard-vs-mortal-personality-target-variant-smoke');
  console.log(`  snapshot=${JSON.stringify({
    variants: [aggressive.id, defensive.id, balanced.id, heavy.id],
    balancedRouteMargin: balanced.policy.route.closedRouteOverrideMinMargin,
    heavyRouteEnabled: heavy.policy.route.enableClosedRouteValueRebalance
  })}`);
}

function main() {
  validateFreshMortalPrimarySelection();
  validateHardPersonalityTargetVariants();

  const args = benchmarkApi.parseArgs(['--smoke']);
  const report = benchmarkApi.buildBenchmarkReport(args);

  assert(report && report.source === 'benchmark-hard-vs-mortal', `expected report source, got ${JSON.stringify(report && report.source)}`);
  assert(report.smoke === true, `expected smoke report, got ${JSON.stringify(report && report.smoke)}`);
  assert(Array.isArray(report.targetSeats) && report.targetSeats.length === 4, `expected four target seats, got ${JSON.stringify(report && report.targetSeats)}`);
  assert(Array.isArray(report.rows) && report.rows.length >= 4, `expected at least four rows, got ${JSON.stringify(report && report.rows && report.rows.length)}`);
  assert(report.summary && report.summary.total === report.rows.length, `expected summary total to match rows, got ${JSON.stringify(report.summary)}`);
  assert(report.severity && report.severity.total === report.rows.length, `expected severity total to match rows, got ${JSON.stringify(report.severity)}`);
  assert(report.severityCounts && typeof report.severityCounts === 'object', `expected severityCounts, got ${JSON.stringify(report.severityCounts)}`);
  assert(Number.isFinite(Number(report.severity.nearOrExactRate)), `expected numeric nearOrExactRate, got ${JSON.stringify(report.severity)}`);
  assert(Array.isArray(report.severityBySubject) && report.severityBySubject.length === 4, `expected severity by subject, got ${JSON.stringify(report.severityBySubject)}`);
  assert(Array.isArray(report.topDisagreements), `expected topDisagreements array, got ${JSON.stringify(report.topDisagreements)}`);
  assert(report.analysis && report.analysis.totals && report.analysis.totals.rows === report.rows.length, `expected analysis row total to match rows, got ${JSON.stringify(report.analysis && report.analysis.totals)}`);
  assert(Array.isArray(report.subjects) && report.subjects.length === 4, `expected four AI subjects, got ${JSON.stringify(report.subjects && report.subjects.map((entry) => entry.summary && entry.summary.id))}`);

  const expectedSubjects = new Set(benchmarkApi.SEATS.map((seatKey) => `ai:${seatKey}:hard`));
  report.subjects.forEach((subject) => {
    const id = subject && subject.summary ? subject.summary.id : null;
    assert(expectedSubjects.has(id), `unexpected subject id ${id}`);
    assert(subject.summary.total >= 1, `expected subject ${id} to have samples, got ${JSON.stringify(subject.summary)}`);
    assert(typeof subject.summary.mortalRate === 'number', `expected numeric mortalRate for ${id}, got ${JSON.stringify(subject.summary)}`);
    assert(subject.summary.goodCount + subject.summary.neutralCount + subject.summary.badCount === subject.summary.total, `expected verdict counts to cover ${id}, got ${JSON.stringify(subject.summary)}`);
  });

  report.rows.forEach((row) => {
    assert(row.mortalOk === true, `expected Mortal inference to succeed for ${row.id}, got ${JSON.stringify(row.mortal)}`);
    assert(row.localDecision && row.localDecision.type === 'discard', `expected local discard for ${row.id}, got ${JSON.stringify(row.localDecision)}`);
    assert(row.coachDecision && row.coachDecision.type === 'discard', `expected Mortal discard for ${row.id}, got ${JSON.stringify(row.coachDecision)}`);
    assert(row.comparison && typeof row.comparison.exactMatch === 'boolean', `expected comparison object for ${row.id}, got ${JSON.stringify(row.comparison)}`);
    assert(row.judgment && typeof row.judgment.bucket === 'string', `expected judgment bucket for ${row.id}, got ${JSON.stringify(row.judgment)}`);
    assert(row.riichiDecision && Array.isArray(row.riichiDecision.reasons), `expected riichi reasons for ${row.id}, got ${JSON.stringify(row.riichiDecision)}`);
    assert(row.metrics && Number.isFinite(Number(row.metrics.xiangting)), `expected metrics for ${row.id}, got ${JSON.stringify(row.metrics)}`);
    assert(row.mortalMeta && Number.isFinite(Number(row.mortalMeta.legalActionCount)), `expected Mortal meta for ${row.id}, got ${JSON.stringify(row.mortalMeta)}`);
    assert(Array.isArray(row.mortalMetaRecords) && row.mortalMetaRecords.length >= 1, `expected Mortal meta records for ${row.id}, got ${JSON.stringify(row.mortalMetaRecords)}`);
    assert(Array.isArray(row.mortalCandidates) && row.mortalCandidates.length >= 1, `expected Mortal candidates for ${row.id}, got ${JSON.stringify(row.mortalCandidates)}`);
    assert(row.bestMortalCandidate && row.bestMortalCandidate.isBest === true, `expected best Mortal candidate for ${row.id}, got ${JSON.stringify(row.bestMortalCandidate)}`);
    assert(row.localMortalCandidate && Number.isFinite(Number(row.localMortalCandidate.qValue)), `expected local Mortal candidate for ${row.id}, got ${JSON.stringify(row.localMortalCandidate)}`);
    assert(row.mortalSeverity && typeof row.mortalSeverity.level === 'string', `expected Mortal severity for ${row.id}, got ${JSON.stringify(row.mortalSeverity)}`);
    assert(Array.isArray(row.hardCandidateDiagnostics) && row.hardCandidateDiagnostics.length >= 1, `expected hard candidate diagnostics for ${row.id}, got ${JSON.stringify(row.hardCandidateDiagnostics)}`);
    row.hardCandidateDiagnostics.forEach((candidate) => assertCompactHardCandidateDiagnostic(candidate, row.id));
    assertDecisionContext(row);
    const localDiagnostic = findHardCandidateDiagnostic(row, row.localDecision.tileCode);
    assert(localDiagnostic, `expected local tile diagnostic for ${row.id}, got ${JSON.stringify({ local: row.localDecision, diagnostics: row.hardCandidateDiagnostics })}`);
    assert(
      row.hardCandidateDiagnostics.some((candidate) => (
        candidate
        && candidate.selectedFinal
        && normalizeTileCodeForDiagnostics(candidate.tileCode) === normalizeTileCodeForDiagnostics(row.localDecision.tileCode)
      )),
      `expected final selected diagnostic for ${row.id}, got ${JSON.stringify(row.hardCandidateDiagnostics)}`
    );
    if (row.bestMortalCandidate.actionType === 'discard') {
      const bestDiagnostic = findHardCandidateDiagnostic(row, row.bestMortalCandidate.tileCode);
      assert(bestDiagnostic, `expected Mortal best discard diagnostic for ${row.id}, got ${JSON.stringify({ best: row.bestMortalCandidate, diagnostics: row.hardCandidateDiagnostics })}`);
    }
  });

  report.topDisagreements.forEach((row) => {
    assert(Array.isArray(row.hardCandidateDiagnostics), `expected compact disagreement diagnostics for ${row.id}, got ${JSON.stringify(row)}`);
    row.hardCandidateDiagnostics.forEach((candidate) => assertCompactHardCandidateDiagnostic(candidate, row.id));
  });

  console.log('[PASS] hard-vs-mortal-benchmark-smoke');
  console.log(`  snapshot=${JSON.stringify({
    rows: report.rows.length,
    subjects: report.subjects.map((subject) => subject.summary.id),
    overview: report.overview,
    buckets: report.overview.bucketCounts,
    severity: report.severity
  })}`);
}

main();
