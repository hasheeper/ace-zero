(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.AceMahjongAiOutputContracts = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function createAiOutput(output = {}) {
    return {
      type: typeof output.type === 'string' ? output.type : null,
      action: output.action ? clone(output.action) : null,
      score: Number.isFinite(Number(output.score)) ? Number(output.score) : 0,
      reasons: Array.isArray(output.reasons) ? output.reasons.slice() : []
    };
  }

  function normalizeAiOutput(output) {
    if (!output || typeof output !== 'object') return output || null;
    if (output.type || output.action || output.reasons || output.score != null) {
      return createAiOutput(output);
    }
    return clone(output);
  }

  return {
    createAiOutput,
    normalizeAiOutput
  };
});
