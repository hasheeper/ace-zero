(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.AceMahjongCreateRuntimeKanHelpers = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  function createRuntimeKanHelpers(options = {}) {
    const normalizeMeld = typeof options.normalizeMeld === 'function'
      ? options.normalizeMeld
      : ((meld) => meld);

    function detectKanType(meldString, isReactionKan) {
      const normalized = normalizeMeld(meldString);
      if (!normalized) return isReactionKan ? 'kan-open' : 'kan-concealed';
      if (normalized.match(/\d{3}[\+\=\-]\d$/)) return 'kan-added';
      if (isReactionKan || normalized.match(/[\+\=\-]/)) return 'kan-open';
      return 'kan-concealed';
    }

    function countRuntimeKanMelds(runtime) {
      if (!runtime || !runtime.board || !Array.isArray(runtime.board.shoupai)) return 0;
      return runtime.board.shoupai.reduce((count, shoupai) => {
        const melds = shoupai && Array.isArray(shoupai._fulou) ? shoupai._fulou : [];
        return count + melds.filter((meld) => {
          const normalized = normalizeMeld(meld);
          return Boolean(normalized && (normalized.match(/\d/g) || []).length === 4);
        }).length;
      }, 0);
    }

    function getKanClaimTileCode(meldString) {
      const normalized = normalizeMeld(meldString);
      if (!normalized) return null;
      const digits = normalized.match(/\d/g) || [];
      if (digits.length !== 4) return null;
      return `${normalized[0]}${digits[digits.length - 1]}`;
    }

    return {
      detectKanType,
      countRuntimeKanMelds,
      getKanClaimTileCode
    };
  }

  return createRuntimeKanHelpers;
});
