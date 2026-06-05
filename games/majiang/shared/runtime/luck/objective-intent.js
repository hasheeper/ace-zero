(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./constants'), require('./schemas'));
    return;
  }
  root.AceMahjongLuckObjectiveIntent = factory(
    root.AceMahjongLuckConstants,
    root.AceMahjongLuckSchemas
  );
})(typeof globalThis !== 'undefined' ? globalThis : this, function(constants, schemas) {
  'use strict';

  const { DEFAULT_INTENT } = constants;
  const { normalizeIntent } = schemas;

  function buildObjectiveIntent(context = {}) {
    const source = context && typeof context === 'object' && context.objectiveIntent
      ? context.objectiveIntent
      : DEFAULT_INTENT;
    return normalizeIntent(source);
  }

  return {
    buildObjectiveIntent
  };
});
