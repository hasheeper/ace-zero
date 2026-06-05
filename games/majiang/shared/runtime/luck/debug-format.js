(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./schemas'));
    return;
  }
  root.AceMahjongLuckDebugFormat = factory(root.AceMahjongLuckSchemas);
})(typeof globalThis !== 'undefined' ? globalThis : this, function(schemas) {
  'use strict';

  const { normalizeCandidateDraw, numberOr } = schemas;

  function formatNumber(value, digits = 4) {
    const number = numberOr(value, 0);
    if (!Number.isFinite(number)) return '0';
    return Number(number.toFixed(digits)).toString();
  }

  function formatLuckDistributionSummary(audit = {}) {
    const candidates = Array.isArray(audit.candidates) ? audit.candidates.map(normalizeCandidateDraw) : [];
    const totalWeight = candidates.reduce((sum, candidate) => sum + Math.max(0, numberOr(candidate.finalWeight, 0)), 0);
    const topCandidates = candidates
      .slice()
      .sort((left, right) => right.finalWeight - left.finalWeight)
      .slice(0, 8)
      .map((candidate) => `${candidate.tileCode}:w=${formatNumber(candidate.finalWeight)} base=${formatNumber(candidate.baseWeight)} score=${formatNumber(candidate.intentScore)} count=${candidate.remainingCount}`);

    const lines = [
      `luck ${audit.version || 'unknown'} seat=${audit.seat || '-'} draw=${audit.drawKind || '-'} seed=${audit.seed == null ? '-' : audit.seed}`,
      `selected=${audit.selectedTileCode || '-'} roll=${audit.randomRoll == null ? '-' : formatNumber(audit.randomRoll, 6)} totalWeight=${formatNumber(totalWeight)}`
    ];

    if (audit.fallback) {
      lines.push(`fallback=${audit.fallback.reason || JSON.stringify(audit.fallback)}`);
    }
    lines.push(`top=${topCandidates.join(', ')}`);
    return lines.join('\n');
  }

  return {
    formatLuckDistributionSummary
  };
});
