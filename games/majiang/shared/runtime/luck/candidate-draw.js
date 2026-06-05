(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./constants'),
      require('./schemas'),
      require('./tile-counts')
    );
    return;
  }
  root.AceMahjongLuckCandidateDraw = factory(
    root.AceMahjongLuckConstants,
    root.AceMahjongLuckSchemas,
    root.AceMahjongLuckTileCounts
  );
})(typeof globalThis !== 'undefined' ? globalThis : this, function(constants, schemas, tileCountsApi) {
  'use strict';

  const { DEFAULT_LOCAL_VALUE } = constants;
  const { normalizeCandidateDraw, normalizeLocalValue } = schemas;
  const { tileCountsToCandidates } = tileCountsApi;

  function getLocalValueForTile(tileCode, context = {}) {
    const source = context && context.candidateLocalValues && typeof context.candidateLocalValues === 'object'
      ? context.candidateLocalValues[tileCode]
      : null;
    return normalizeLocalValue(source || DEFAULT_LOCAL_VALUE);
  }

  function buildCandidateDraws(input = {}) {
    const tileCounts = input && input.tileCounts && typeof input.tileCounts === 'object'
      ? input.tileCounts
      : {};
    const context = input && input.context && typeof input.context === 'object'
      ? input.context
      : {};
    return tileCountsToCandidates(tileCounts).map((entry) => normalizeCandidateDraw({
      tileCode: entry.tileCode,
      remainingCount: entry.remainingCount,
      baseWeight: entry.remainingCount,
      finalWeight: entry.remainingCount,
      localValue: getLocalValueForTile(entry.tileCode, context),
      tags: ['candidate:remaining-wall']
    }));
  }

  return {
    buildCandidateDraws
  };
});
