(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.AceMahjongMode4pSpecialAi = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  function createMode4pAdapter() {
    return {
      id: 'mode-4p',
      adjustDiscardDecision(decision) {
        return decision;
      },
      adjustReactionDecision(decision) {
        return decision;
      }
    };
  }

  return {
    createMode4pAdapter
  };
});
