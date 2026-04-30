'use strict';

module.exports = {
  ...require('./base-ai'),
  ...require('./discard-evaluator'),
  ...require('./ai-controller'),
  ...require('./evaluators/call-evaluator'),
  ...require('./evaluators/riichi-evaluator'),
  ...require('./evaluators/defense-evaluator'),
  ...require('./difficulty/easy-policy'),
  ...require('./difficulty/normal-policy'),
  ...require('./difficulty/hard-policy'),
  ...require('./profiles/default'),
  ...require('./special/mode-2p'),
  ...require('./special/mode-3p'),
  ...require('./special/mode-4p'),
  ...require('./support/hand-metrics'),
  ...require('./support/tile-danger'),
  ...require('./support/push-fold'),
  ...require('./contracts/ai-input'),
  ...require('./contracts/ai-output')
};
