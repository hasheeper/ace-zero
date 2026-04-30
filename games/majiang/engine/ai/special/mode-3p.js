(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.AceMahjongMode3pSpecialAi = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  function createMode3pAdapter() {
    return {
      id: 'mode-3p',
      adjustDiscardDecision(decision) {
        return decision;
      },
      adjustReactionDecision(decision) {
        return decision;
      }
    };
  }

  return {
    createMode3pAdapter
  };
});
