(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./constants'),
      require('./schemas'),
      require('./rng'),
      require('./tile-counts'),
      require('./candidate-draw'),
      require('./objective-intent'),
      require('./wind-adjustment'),
      require('./force-rank'),
      require('./force-resolution'),
      require('./weight-model'),
      require('./weighted-sampler'),
      require('./luck-audit'),
      require('./mana-ledger'),
      require('./debug-format')
    );
    return;
  }
  root.AceMahjongLuck = factory(
    root.AceMahjongLuckConstants,
    root.AceMahjongLuckSchemas,
    root.AceMahjongLuckRng,
    root.AceMahjongLuckTileCounts,
    root.AceMahjongLuckCandidateDraw,
    root.AceMahjongLuckObjectiveIntent,
    root.AceMahjongLuckWindAdjustment,
    root.AceMahjongLuckForceRank,
    root.AceMahjongLuckForceResolution,
    root.AceMahjongLuckWeightModel,
    root.AceMahjongLuckWeightedSampler,
    root.AceMahjongLuckAudit,
    root.AceMahjongLuckManaLedger,
    root.AceMahjongLuckDebugFormat
  );
})(typeof globalThis !== 'undefined' ? globalThis : this, function(
  constants,
  schemas,
  rng,
  tileCounts,
  candidateDraw,
  objectiveIntent,
  windAdjustment,
  forceRank,
  forceResolution,
  weightModel,
  weightedSampler,
  luckAudit,
  manaLedger,
  debugFormat
) {
  'use strict';

  return {
    ...constants,
    ...schemas,
    ...rng,
    ...tileCounts,
    ...candidateDraw,
    ...objectiveIntent,
    ...windAdjustment,
    ...forceRank,
    ...forceResolution,
    ...weightModel,
    ...weightedSampler,
    ...luckAudit,
    ...manaLedger,
    ...debugFormat
  };
});
