'use strict';

const fs = require('fs');
const path = require('path');

const REPORT_VERSION = 'luck-regression-report-v0.3';

function numberOr(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function safeDivide(numerator, denominator, fallback = 0) {
  const left = numberOr(numerator, 0);
  const right = numberOr(denominator, 0);
  if (!Number.isFinite(right) || Math.abs(right) < 1e-12) return fallback;
  return left / right;
}

function roundMetric(value, digits = 6) {
  const number = numberOr(value, 0);
  return Number(number.toFixed(digits));
}

function findCandidate(audit, tileCode) {
  if (!audit || !Array.isArray(audit.candidates)) return null;
  return audit.candidates.find((candidate) => candidate.tileCode === tileCode) || null;
}

function sumFinalWeight(audit) {
  if (!audit || !Array.isArray(audit.candidates)) return 0;
  return audit.candidates.reduce((sum, candidate) => sum + Math.max(0, numberOr(candidate.finalWeight, 0)), 0);
}

function probabilityOf(audit, tileCode) {
  const candidate = findCandidate(audit, tileCode);
  const total = sumFinalWeight(audit);
  if (!candidate || total <= 0) return 0;
  return Math.max(0, numberOr(candidate.finalWeight, 0)) / total;
}

function weightFactorOf(audit, tileCode) {
  const candidate = findCandidate(audit, tileCode);
  if (!candidate) return 0;
  const baseWeight = numberOr(candidate.baseWeight, 0);
  if (baseWeight <= 0) return 0;
  return Math.max(0, numberOr(candidate.finalWeight, 0)) / baseWeight;
}

function countNonFiniteWeights(audits = []) {
  return audits.reduce((count, audit) => {
    if (!audit || !Array.isArray(audit.candidates)) return count + 1;
    return count + audit.candidates.reduce((innerCount, candidate) => {
      const baseWeight = numberOr(candidate.baseWeight, NaN);
      const finalWeight = numberOr(candidate.finalWeight, NaN);
      return innerCount + (
        !Number.isFinite(baseWeight)
        || baseWeight < 0
        || !Number.isFinite(finalWeight)
        || finalWeight < 0
          ? 1
          : 0
      );
    }, 0);
  }, 0);
}

function countAuditMismatches(row) {
  const audits = Array.isArray(row.audits) ? row.audits : [];
  const tiles = Array.isArray(row.tiles) ? row.tiles : [];
  const rolls = Array.isArray(row.rolls) ? row.rolls : [];
  return audits.reduce((count, audit, index) => {
    const tileMismatch = audit && audit.selectedTileCode !== tiles[index];
    const rollMismatch = audit && rolls[index] !== undefined && audit.randomRoll !== rolls[index];
    return count + (tileMismatch || rollMismatch ? 1 : 0);
  }, 0);
}

function addHistogramTile(histogram, scenario, tileCode) {
  if (!tileCode) return;
  if (!histogram[scenario]) histogram[scenario] = {};
  histogram[scenario][tileCode] = (histogram[scenario][tileCode] || 0) + 1;
}

function buildScenarioMetric(rows, scenario, highTile, lowTile) {
  const scenarioRows = rows.filter((row) => row.scenario === scenario);
  const tiles = scenarioRows.flatMap((row) => Array.isArray(row.tiles) ? row.tiles : []);
  const audits = scenarioRows.flatMap((row) => Array.isArray(row.audits) ? row.audits : []);
  const totalSelections = tiles.length;
  const highSelectionCount = tiles.filter((tileCode) => tileCode === highTile).length;
  const lowSelectionCount = tiles.filter((tileCode) => tileCode === lowTile).length;

  const probabilityTotals = audits.reduce((result, audit) => {
    result.high += probabilityOf(audit, highTile);
    result.low += probabilityOf(audit, lowTile);
    result.highWeightFactor += weightFactorOf(audit, highTile);
    result.lowWeightFactor += weightFactorOf(audit, lowTile);
    return result;
  }, {
    high: 0,
    low: 0,
    highWeightFactor: 0,
    lowWeightFactor: 0
  });

  const auditedDraws = audits.length;
  const avgHighProbability = safeDivide(probabilityTotals.high, auditedDraws, 0);
  const avgLowProbability = safeDivide(probabilityTotals.low, auditedDraws, 0);
  const avgHighWeightFactor = safeDivide(probabilityTotals.highWeightFactor, auditedDraws, 0);
  const avgLowWeightFactor = safeDivide(probabilityTotals.lowWeightFactor, auditedDraws, 0);

  return {
    scenario,
    runCount: scenarioRows.length,
    totalSelections,
    auditedDraws,
    highTile,
    lowTile,
    highSelectionCount,
    lowSelectionCount,
    highSelectionRate: roundMetric(safeDivide(highSelectionCount, totalSelections, 0)),
    lowSelectionRate: roundMetric(safeDivide(lowSelectionCount, totalSelections, 0)),
    avgHighProbability: roundMetric(avgHighProbability),
    avgLowProbability: roundMetric(avgLowProbability),
    probabilityGap: roundMetric(avgHighProbability - avgLowProbability),
    avgHighWeightFactor: roundMetric(avgHighWeightFactor),
    avgLowWeightFactor: roundMetric(avgLowWeightFactor),
    highOverLowWeightFactorRatio: roundMetric(safeDivide(avgHighWeightFactor, avgLowWeightFactor, 0)),
    lowOverHighWeightFactorRatio: roundMetric(safeDivide(avgLowWeightFactor, avgHighWeightFactor, 0))
  };
}

function buildLuckRegressionReport(rows = [], options = {}) {
  const normalizedRows = Array.isArray(rows) ? rows : [];
  const highTile = options.highTile || 'm1';
  const lowTile = options.lowTile || 'p1';
  const selectionHistogram = {};
  const totalDraws = normalizedRows.reduce((sum, row) => {
    const tiles = Array.isArray(row.tiles) ? row.tiles : [];
    tiles.forEach((tileCode) => addHistogramTile(selectionHistogram, row.scenario || 'unknown', tileCode));
    return sum + tiles.length;
  }, 0);
  const auditedDraws = normalizedRows.reduce((sum, row) => (
    sum + (Array.isArray(row.audits) ? row.audits.length : 0)
  ), 0);
  const invalidDrawCount = normalizedRows.reduce((sum, row) => sum + numberOr(row.invalidDrawCount, 0), 0);
  const nonFiniteWeightCount = normalizedRows.reduce((sum, row) => (
    sum + numberOr(row.nonFiniteWeightCount, countNonFiniteWeights(row.audits || []))
  ), 0);
  const auditMismatchCount = normalizedRows.reduce((sum, row) => (
    sum + numberOr(row.auditMismatchCount, countAuditMismatches(row))
  ), 0);
  const replayMismatchCount = normalizedRows.reduce((sum, row) => (
    sum + (row.replayMatched === false ? 1 : 0)
  ), 0);

  const scenarios = {
    fortune: buildScenarioMetric(normalizedRows, 'fortune', highTile, lowTile),
    curse: buildScenarioMetric(normalizedRows, 'curse', highTile, lowTile),
    void: buildScenarioMetric(normalizedRows, 'void', highTile, lowTile),
    replay: buildScenarioMetric(normalizedRows, 'fortune-replay', highTile, lowTile)
  };
  const fortuneGap = scenarios.fortune.probabilityGap;
  const voidGap = scenarios.void.probabilityGap;

  const summary = {
    totalRuns: normalizedRows.length,
    seedCount: numberOr(options.seedCount, 0),
    drawCount: numberOr(options.drawCount, 0),
    totalDraws,
    invalidDrawCount,
    nonFiniteWeightCount,
    auditMismatchCount,
    replayMismatchCount,
    auditCoverageRate: roundMetric(safeDivide(auditedDraws, totalDraws, 0)),
    fortuneHighRate: scenarios.fortune.highSelectionRate,
    fortuneLowRate: scenarios.fortune.lowSelectionRate,
    curseHighRate: scenarios.curse.highSelectionRate,
    curseLowRate: scenarios.curse.lowSelectionRate,
    fortuneUpliftRatio: scenarios.fortune.highOverLowWeightFactorRatio,
    cursePenaltyRatio: scenarios.curse.lowOverHighWeightFactorRatio,
    voidDampingRatio: roundMetric(safeDivide(voidGap, fortuneGap, 0)),
    probabilityGap: {
      fortune: scenarios.fortune.probabilityGap,
      curse: scenarios.curse.probabilityGap,
      void: scenarios.void.probabilityGap
    }
  };

  return {
    version: REPORT_VERSION,
    source: options.source || 'luck-regression',
    generatedAt: new Date().toISOString(),
    highTile,
    lowTile,
    summary,
    scenarios,
    selectionHistogram,
    sampleRows: normalizedRows.slice(0, 6).map((row) => ({
      scenario: row.scenario,
      seed: row.seed,
      tiles: Array.isArray(row.tiles) ? row.tiles.slice() : [],
      rolls: Array.isArray(row.rolls) ? row.rolls.slice() : [],
      replayMatched: row.replayMatched
    }))
  };
}

function writeLuckRegressionReport(report, reportPath) {
  if (!reportPath) return null;
  const resolvedPath = path.resolve(reportPath);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  fs.writeFileSync(resolvedPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return resolvedPath;
}

module.exports = {
  REPORT_VERSION,
  buildLuckRegressionReport,
  countAuditMismatches,
  countNonFiniteWeights,
  probabilityOf,
  weightFactorOf,
  writeLuckRegressionReport
};
