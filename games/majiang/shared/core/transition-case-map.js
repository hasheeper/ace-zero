(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.AceMahjongCreateCoreRoundTransitionMatrix = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const DRAW_REASON_CASE_MAP = {
    '九種九牌': 'draw:abortive:nine-kinds',
    '四家立直': 'draw:abortive:four-riichi',
    '四風連打': 'draw:abortive:four-winds',
    '四開槓': 'draw:abortive:four-kan',
    '三家和': 'draw:abortive:triple-ron',
    '荒牌平局': 'draw:exhaustive:ryukyoku',
    '流し満貫': 'draw:exhaustive:nagashi-mangan',
    'exhaustive-draw': 'draw:exhaustive:ryukyoku'
  };

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function normalizeDrawKind(reason) {
    const value = String(reason || '').trim();
    if (!value || value === '荒牌平局' || value === '流し満貫' || value === 'exhaustive-draw') {
      return 'exhaustive';
    }
    return 'abortive';
  }

  function resolveTransitionCase(roundResult, context = {}) {
    if (!roundResult || !roundResult.type) return null;
    if (roundResult.type === 'hule') {
      const currentDealerSeat = context.currentDealerSeat || null;
      const isDealerWin = currentDealerSeat && (
        roundResult.winnerSeat === currentDealerSeat
        || (Array.isArray(roundResult.winners) && roundResult.winners.some((entry) => entry && entry.winnerSeat === currentDealerSeat))
      );
      return isDealerWin ? 'hule:dealer-win' : 'hule:nondealer-win';
    }
    if (roundResult.type === 'draw') {
      return DRAW_REASON_CASE_MAP[String(roundResult.reason || '').trim()] || 'draw:abortive:unknown';
    }
    return null;
  }

  function createCoreRoundTransitionMatrix() {
    return {
      clone,
      resolveTransitionCase,
      normalizeDrawKind
    };
  }

  createCoreRoundTransitionMatrix.resolveTransitionCase = resolveTransitionCase;
  createCoreRoundTransitionMatrix.normalizeDrawKind = normalizeDrawKind;

  return createCoreRoundTransitionMatrix;
});
