'use strict';

const { clone } = require('../base/majiang-core-adapter');
const createRuntimeRuleHelpers = require('../../shared/runtime/rules/rules');
const createRuntimeRoundResultHelpers = require('../../shared/runtime/scoring/round-result');
const runtimeRuleHelpers = createRuntimeRuleHelpers();
const runtimeRoundResultHelpers = createRuntimeRoundResultHelpers({
  clone,
  extractBaojiaSummary: (seatKey, result) => runtimeRuleHelpers.extractBaojiaSummary(seatKey, result)
});

const {
  buildHuleRoundResult,
  buildMultiHuleRoundResult,
  buildDrawRoundResult
} = runtimeRoundResultHelpers;

module.exports = {
  buildHuleRoundResult,
  buildMultiHuleRoundResult,
  buildDrawRoundResult
};
