/* global Hand */

/**
 * Poker AI split module: CardUtils.
 */
(function(global) {
  'use strict';

  var modules = global.PokerAIModules || (global.PokerAIModules = {});
  var register = modules.register || function(moduleName, value) {
    modules[moduleName] = value;
    return value;
  };

  const SUIT_MAP = { 0: 's', 1: 'h', 2: 'c', 3: 'd' };
  const RANK_MAP = { 1: 'A', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: 'T', 11: 'J', 12: 'Q', 13: 'K' };
  // ========== 工具函数 ==========
  function cardToString(card) {
    if (!card) return '';
    return RANK_MAP[card.rank] + SUIT_MAP[card.suit];
  }

  function evaluateHandStrength(holeCards, boardCards) {
    const allCards = [...holeCards, ...boardCards].map(cardToString);
    if (allCards.length < 2) return { rank: 0, name: 'Invalid' };
    
    try {
      const hand = Hand.solve(allCards);
      return { rank: hand.rank || 0, name: hand.name || 'Unknown' };
    } catch (e) {
      return { rank: 0, name: 'Invalid' };
    }
  }

  function evaluatePreflopStrength(holeCards) {
    if (holeCards.length < 2) return 0;
    
    const c1 = holeCards[0];
    const c2 = holeCards[1];
    const r1 = c1.rank === 1 ? 14 : c1.rank;
    const r2 = c2.rank === 1 ? 14 : c2.rank;
    const suited = c1.suit === c2.suit;
    const paired = r1 === r2;
    
    let score = 0;
    
    if (paired) {
      score = 50 + r1 * 3; // AA = 92, KK = 89, ...
    } else {
      const high = Math.max(r1, r2);
      const low = Math.min(r1, r2);
      score = high * 2 + low;
      if (suited) score += 10;
      const gap = high - low;
      if (gap === 1) score += 8;
      else if (gap === 2) score += 5;
      else if (gap === 3) score += 2;
      // Broadway 高张加分：两张都是 T+ 的非对子牌应该更强
      // AKs=72, AKo=62, AQs=69, KQs=66 — 更接近真实排名
      if (high >= 14 && low >= 13) score += 20; // AK
      else if (high >= 14 && low >= 12) score += 15; // AQ
      else if (high >= 14 && low >= 11) score += 12; // AJ
      else if (high >= 13 && low >= 12) score += 12; // KQ
      else if (high >= 14 && low >= 10) score += 8;  // AT
      else if (high >= 13 && low >= 11) score += 8;  // KJ
    }
    
    return Math.min(100, score);
  }

  // 牌型强度映射 (pokersolver rank -> 0-100 strength)
  const HAND_STRENGTH_MAP = {
    0: 5,    // Invalid
    1: 15,   // High Card - 很弱
    2: 45,   // Pair - 中等
    3: 60,   // Two Pair - 较强
    4: 75,   // Trips/Three of a Kind - 强
    5: 82,   // Straight - 很强
    6: 85,   // Flush - 很强
    7: 92,   // Full House - 极强
    8: 97,   // Quads - 坚果级
    9: 100   // Straight Flush - 无敌
  };


  register('CardUtils', {
    SUIT_MAP: SUIT_MAP,
    RANK_MAP: RANK_MAP,
    HAND_STRENGTH_MAP: HAND_STRENGTH_MAP,
    cardToString: cardToString,
    evaluateHandStrength: evaluateHandStrength,
    evaluatePreflopStrength: evaluatePreflopStrength
  });
})(typeof window !== 'undefined' ? window : global);
