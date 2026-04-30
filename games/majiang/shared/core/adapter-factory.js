(function(root, factory) {
  'use strict';

  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }

  root.AceMahjongCreateCoreAdapter = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  function createCoreAdapter(getMajiang) {
    if (typeof getMajiang !== 'function') {
      throw new TypeError('createCoreAdapter requires a getMajiang function.');
    }

    function createRule(overrides = {}) {
      return getMajiang().rule({
        '場数': 0,
        ...overrides
      });
    }

    function createBoard(config = {}) {
      const Majiang = getMajiang();
      return new Majiang.Board(config);
    }

    function createShoupaiFromString(paistr = '') {
      return getMajiang().Shoupai.fromString(paistr || '');
    }

    function validateMeldString(meld) {
      return getMajiang().Shoupai.valid_mianzi(meld);
    }

    function getRiichiChoices(rule, shoupai, paishu, defen) {
      return getMajiang().Game.allow_lizhi(rule, shoupai, null, paishu, defen) || [];
    }

    function getDiscardCandidates(rule, shoupai) {
      return getMajiang().Game.get_dapai(rule, shoupai) || [];
    }

    function calculateXiangting(shoupai) {
      return getMajiang().Util.xiangting(shoupai);
    }

    function getTingpai(shoupai) {
      return getMajiang().Util.tingpai(shoupai) || [];
    }

    function createHuleParam(param = {}) {
      return getMajiang().Util.hule_param(param);
    }

    function calculateHule(shoupai, rongpai = null, param = {}) {
      return getMajiang().Util.hule(shoupai, rongpai, createHuleParam(param));
    }

    function allowNoDaopai(rule, shoupai, paishu) {
      return getMajiang().Game.allow_no_daopai(rule, shoupai, paishu);
    }

    return {
      createRule,
      createBoard,
      createShoupaiFromString,
      validateMeldString,
      getRiichiChoices,
      getDiscardCandidates,
      calculateXiangting,
      getTingpai,
      createHuleParam,
      calculateHule,
      allowNoDaopai
    };
  }

  return createCoreAdapter;
});
