(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.AceMahjongMode2pSpecialAi = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  function createMode2pAdapter() {
    return {
      id: 'mode-2p',
      adjustDiscardDecision(decision) {
        return decision;
      },
      adjustReactionDecision(decision) {
        return decision;
      }
    };
  }

  return {
    createMode2pAdapter
  };
});
