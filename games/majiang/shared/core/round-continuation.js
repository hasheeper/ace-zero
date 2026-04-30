(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.AceMahjongCreateRoundContinuationPolicy = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const ABORTIVE_DRAW_REASONS = ['九種九牌', '四家立直', '四風連打', '四開槓', '三家和'];
  const EXHAUSTIVE_DRAW_REASONS = ['荒牌平局', '流し満貫', 'exhaustive-draw'];

  function normalizeDrawReason(reason) {
    return String(reason || '').trim();
  }

  function isAbortiveDrawReason(reason) {
    return ABORTIVE_DRAW_REASONS.includes(normalizeDrawReason(reason));
  }

  function isExhaustiveDrawReason(reason) {
    const value = normalizeDrawReason(reason);
    return !value || EXHAUSTIVE_DRAW_REASONS.includes(value);
  }

  function normalizeDrawKind(reason) {
    if (isExhaustiveDrawReason(reason)) return 'exhaustive';
    if (isAbortiveDrawReason(reason)) return 'abortive';
    return 'abortive';
  }

  function isNamedDrawReason(reason) {
    const value = normalizeDrawReason(reason);
    return Boolean(value && value !== '荒牌平局' && value !== 'exhaustive-draw');
  }

  function shouldDealerContinueOnHule(ruleConfig = {}, winnerIsDealer = false) {
    return Number(ruleConfig['場数']) !== 0
      && Number(ruleConfig['連荘方式']) > 0
      && Boolean(winnerIsDealer);
  }

  function shouldDealerContinueOnDraw(ruleConfig = {}, context = {}) {
    if (Number(ruleConfig['場数']) === 0) return true;
    if (isNamedDrawReason(context.reason)) return true;

    const renchanMode = Number(ruleConfig['連荘方式']);
    if (renchanMode === 3) return true;
    if (renchanMode === 2) return Boolean(context.dealerTenpai);
    return false;
  }

  function createRoundContinuationPolicy() {
    return {
      ABORTIVE_DRAW_REASONS: ABORTIVE_DRAW_REASONS.slice(),
      EXHAUSTIVE_DRAW_REASONS: EXHAUSTIVE_DRAW_REASONS.slice(),
      normalizeDrawReason,
      isAbortiveDrawReason,
      isExhaustiveDrawReason,
      normalizeDrawKind,
      isNamedDrawReason,
      shouldDealerContinueOnHule,
      shouldDealerContinueOnDraw
    };
  }

  createRoundContinuationPolicy.ABORTIVE_DRAW_REASONS = ABORTIVE_DRAW_REASONS.slice();
  createRoundContinuationPolicy.EXHAUSTIVE_DRAW_REASONS = EXHAUSTIVE_DRAW_REASONS.slice();
  createRoundContinuationPolicy.normalizeDrawReason = normalizeDrawReason;
  createRoundContinuationPolicy.isAbortiveDrawReason = isAbortiveDrawReason;
  createRoundContinuationPolicy.isExhaustiveDrawReason = isExhaustiveDrawReason;
  createRoundContinuationPolicy.normalizeDrawKind = normalizeDrawKind;
  createRoundContinuationPolicy.isNamedDrawReason = isNamedDrawReason;
  createRoundContinuationPolicy.shouldDealerContinueOnHule = shouldDealerContinueOnHule;
  createRoundContinuationPolicy.shouldDealerContinueOnDraw = shouldDealerContinueOnDraw;

  return createRoundContinuationPolicy;
});
