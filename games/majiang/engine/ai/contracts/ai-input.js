(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.AceMahjongAiInputContracts = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function createAiInput(input = {}) {
    return {
      seatKey: typeof input.seatKey === 'string' ? input.seatKey : 'bottom',
      runtime: input.runtime || null,
      availableActions: Array.isArray(input.availableActions) ? clone(input.availableActions) : [],
      view: input.view ? clone(input.view) : null,
      roundContext: input.roundContext ? clone(input.roundContext) : null,
      matchContext: input.matchContext ? clone(input.matchContext) : null,
      ruleset: typeof input.ruleset === 'string' ? input.ruleset : null,
      mode: typeof input.mode === 'string' ? input.mode : null,
      difficulty: typeof input.difficulty === 'string' ? input.difficulty : 'normal',
      profile: input.profile ? clone(input.profile) : null,
      exposureState: input.exposureState ? clone(input.exposureState) : null,
      mentalState: input.mentalState ? clone(input.mentalState) : null
    };
  }

  return {
    createAiInput
  };
});
