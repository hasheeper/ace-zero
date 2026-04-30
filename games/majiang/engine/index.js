'use strict';

const base = require('./base/majiang-core-adapter');
const drawPolicy = require('./base/draw-policy');
const seatTopology = require('./base/seat-topology');
const wallService = require('./base/wall-service');
const rulesetProfile = require('./base/ruleset-profile');
const actionBuilder = require('./base/action-builder');
const viewBuilder = require('./base/view-builder');
const aiBase = require('./ai/base-ai');
const aiDiscardEvaluator = require('./ai/discard-evaluator');
const runtime = require('./runtime/single-round-runtime');
const reactionPriority = require('./runtime/reaction-priority');
const roundResultBuilder = require('./runtime/round-result-builder');

module.exports = {
  ...base,
  ...drawPolicy,
  ...seatTopology,
  ...wallService,
  ...rulesetProfile,
  ...actionBuilder,
  ...viewBuilder,
  ...aiBase,
  ...aiDiscardEvaluator,
  ...reactionPriority,
  ...roundResultBuilder,
  ...runtime
};
