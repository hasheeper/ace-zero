/**
 * ACEZERO ASSET DECK DATA
 *
 * Long-term team deck constants and card catalog. This is intentionally
 * separate from Texas Hold'em AssetLedger, which is table-run temporary state.
 */
(function initAceZeroAssetDeckData(global) {
  'use strict';

  const ASSET_DECK_CONFIG = {
    initialGeneralSlots: 4,
    maxGeneralSlots: 8,
    voidSlots: 2,
    unlockCosts: [1, 1, 2, 2],
    offerSize: 3,
    poolCosts: {
      low: 1,
      mid: 2,
      high: 3
    },
    refreshCosts: {
      low: 0,
      mid: 0,
      high: 1
    },
    freeRefreshByPool: {
      low: 1,
      mid: 1,
      high: 0
    },
    maxRefreshByPool: {
      low: 1,
      mid: 1,
      high: 1
    },
    poolRarityWeights: {
      low: { bronze: 65, silver: 25, gold: 10, rainbow: 0 },
      mid: { bronze: 35, silver: 35, gold: 25, rainbow: 5 },
      high: { bronze: 0, silver: 35, gold: 40, rainbow: 25 }
    }
  };

  const ASSET_CARD_CATALOG = [
    {
      id: 'asset_bootstrap_credit',
      name: '启动资金',
      rarity: 'bronze',
      kind: 'numeric',
      targetTags: ['team'],
      gameTags: ['any'],
      slotTags: ['general'],
      pools: ['low'],
      modifiers: [{ type: 'funds_start', value: 5 }]
    },
    {
      id: 'asset_minor_guard',
      name: '轻型护栏',
      rarity: 'bronze',
      kind: 'passive',
      targetTags: ['team'],
      gameTags: ['any'],
      slotTags: ['general'],
      pools: ['low'],
      modifiers: [{ type: 'damage_taken_mult', value: 0.97 }]
    },
    {
      id: 'asset_clear_signal',
      name: '清晰信号',
      rarity: 'bronze',
      kind: 'numeric',
      targetTags: ['team'],
      gameTags: ['act'],
      slotTags: ['general'],
      pools: ['low', 'mid'],
      modifiers: [{ type: 'vision_bonus', value: 1 }]
    },
    {
      id: 'asset_fast_recovery',
      name: '快速整备',
      rarity: 'bronze',
      kind: 'numeric',
      targetTags: ['team'],
      gameTags: ['act'],
      slotTags: ['general'],
      pools: ['low', 'mid'],
      modifiers: [{ type: 'reserve_bonus', key: 'rest', value: 1 }]
    },
    {
      id: 'asset_safe_route',
      name: '安全路线',
      rarity: 'silver',
      kind: 'passive',
      targetTags: ['team'],
      gameTags: ['act'],
      slotTags: ['general'],
      pools: ['mid'],
      modifiers: [{ type: 'reserve_bonus', key: 'vision', value: 1 }]
    },
    {
      id: 'asset_shared_reserve',
      name: '共享储备',
      rarity: 'silver',
      kind: 'numeric',
      targetTags: ['team'],
      gameTags: ['act'],
      slotTags: ['general'],
      pools: ['mid', 'high'],
      modifiers: [{ type: 'reserve_bonus', key: 'asset', value: 1 }]
    },
    {
      id: 'asset_skill_minor_wish_l1',
      name: '小吉 I',
      rarity: 'bronze',
      kind: 'skill',
      system: 'fortune',
      skillKey: 'minor_wish',
      level: 1,
      targetTags: ['RINO'],
      gameTags: ['texas-holdem'],
      slotTags: ['general'],
      pools: ['low', 'mid'],
      modifiers: [{ type: 'skill_level', key: 'minor_wish', value: 1 }]
    },
    {
      id: 'asset_skill_minor_wish_l2',
      name: '小吉 II',
      rarity: 'silver',
      kind: 'skill',
      system: 'fortune',
      skillKey: 'minor_wish',
      level: 2,
      targetTags: ['RINO'],
      gameTags: ['texas-holdem'],
      slotTags: ['general'],
      pools: ['mid', 'high'],
      modifiers: [{ type: 'skill_level', key: 'minor_wish', value: 2 }]
    },
    {
      id: 'asset_skill_minor_wish_l3',
      name: '小吉 III',
      rarity: 'gold',
      kind: 'skill',
      system: 'fortune',
      skillKey: 'minor_wish',
      level: 3,
      targetTags: ['RINO'],
      gameTags: ['texas-holdem'],
      slotTags: ['general'],
      pools: ['high'],
      modifiers: [{ type: 'skill_level', key: 'minor_wish', value: 3 }]
    },
    {
      id: 'asset_skill_minor_wish_l4',
      name: '小吉 IV',
      rarity: 'rainbow',
      kind: 'skill',
      system: 'fortune',
      skillKey: 'minor_wish',
      level: 4,
      targetTags: ['RINO'],
      gameTags: ['texas-holdem'],
      slotTags: ['general'],
      pools: ['high'],
      modifiers: [{ type: 'skill_level', key: 'minor_wish', value: 4 }]
    },
    {
      id: 'asset_skill_hex_l1',
      name: '诅咒 I',
      rarity: 'bronze',
      kind: 'skill',
      system: 'chaos',
      skillKey: 'hex',
      level: 1,
      targetTags: ['team'],
      gameTags: ['texas-holdem'],
      slotTags: ['general'],
      pools: ['low', 'mid'],
      modifiers: [{ type: 'skill_level', key: 'hex', value: 1 }]
    },
    {
      id: 'asset_skill_hex_l2',
      name: '诅咒 II',
      rarity: 'silver',
      kind: 'skill',
      system: 'chaos',
      skillKey: 'hex',
      level: 2,
      targetTags: ['team'],
      gameTags: ['texas-holdem'],
      slotTags: ['general'],
      pools: ['mid', 'high'],
      modifiers: [{ type: 'skill_level', key: 'hex', value: 2 }]
    },
    {
      id: 'asset_skill_hex_l3',
      name: '诅咒 III',
      rarity: 'gold',
      kind: 'skill',
      system: 'chaos',
      skillKey: 'hex',
      level: 3,
      targetTags: ['team'],
      gameTags: ['texas-holdem'],
      slotTags: ['general'],
      pools: ['high'],
      modifiers: [{ type: 'skill_level', key: 'hex', value: 3 }]
    },
    {
      id: 'asset_skill_analysis_l1',
      name: '解析 I',
      rarity: 'bronze',
      kind: 'skill',
      system: 'psyche',
      skillKey: 'analysis',
      level: 1,
      targetTags: ['team'],
      gameTags: ['texas-holdem'],
      slotTags: ['general'],
      pools: ['low', 'mid'],
      modifiers: [{ type: 'skill_level', key: 'analysis', value: 1 }]
    },
    {
      id: 'asset_skill_analysis_l2',
      name: '解析 II',
      rarity: 'silver',
      kind: 'skill',
      system: 'psyche',
      skillKey: 'analysis',
      level: 2,
      targetTags: ['team'],
      gameTags: ['texas-holdem'],
      slotTags: ['general'],
      pools: ['mid', 'high'],
      modifiers: [{ type: 'skill_level', key: 'analysis', value: 2 }]
    },
    {
      id: 'asset_skill_analysis_l3',
      name: '解析 III',
      rarity: 'gold',
      kind: 'skill',
      system: 'psyche',
      skillKey: 'analysis',
      level: 3,
      targetTags: ['team'],
      gameTags: ['texas-holdem'],
      slotTags: ['general'],
      pools: ['high'],
      modifiers: [{ type: 'skill_level', key: 'analysis', value: 3 }]
    },
    {
      id: 'asset_skill_premonition_l2',
      name: '预兆 II',
      rarity: 'silver',
      kind: 'skill',
      system: 'psyche',
      skillKey: 'premonition',
      level: 2,
      targetTags: ['team'],
      gameTags: ['texas-holdem'],
      slotTags: ['general'],
      pools: ['mid', 'high'],
      modifiers: [{ type: 'skill_level', key: 'premonition', value: 2 }]
    },
    {
      id: 'asset_psyche_refraction',
      name: '折射协议',
      rarity: 'gold',
      kind: 'skill',
      system: 'psyche',
      skillKey: 'refraction',
      level: 2,
      targetTags: ['team'],
      gameTags: ['texas-holdem'],
      slotTags: ['general'],
      pools: ['high'],
      modifiers: [{ type: 'skill_level', key: 'refraction', value: 2 }]
    },
    {
      id: 'asset_skill_insulation_l1',
      name: '绝缘 I',
      rarity: 'bronze',
      kind: 'skill',
      system: 'void',
      skillKey: 'insulation',
      level: 1,
      targetTags: ['KAZU'],
      gameTags: ['texas-holdem'],
      slotTags: ['general', 'void'],
      pools: ['low', 'mid'],
      modifiers: [{ type: 'skill_level', key: 'insulation', value: 1 }]
    },
    {
      id: 'asset_skill_insulation_l2',
      name: '绝缘 II',
      rarity: 'silver',
      kind: 'skill',
      system: 'void',
      skillKey: 'insulation',
      level: 2,
      targetTags: ['KAZU'],
      gameTags: ['texas-holdem'],
      slotTags: ['general', 'void'],
      pools: ['mid', 'high'],
      modifiers: [{ type: 'skill_level', key: 'insulation', value: 2 }]
    },
    {
      id: 'asset_skill_insulation_l3',
      name: '绝缘 III',
      rarity: 'gold',
      kind: 'skill',
      system: 'void',
      skillKey: 'insulation',
      level: 3,
      targetTags: ['KAZU'],
      gameTags: ['texas-holdem'],
      slotTags: ['general', 'void'],
      pools: ['high'],
      modifiers: [{ type: 'skill_level', key: 'insulation', value: 3 }]
    },
    {
      id: 'asset_skill_reality_l2',
      name: 'Reality II',
      rarity: 'gold',
      kind: 'skill',
      system: 'void',
      skillKey: 'reality',
      level: 2,
      targetTags: ['KAZU'],
      gameTags: ['texas-holdem'],
      slotTags: ['general', 'void'],
      pools: ['high'],
      modifiers: [{ type: 'skill_level', key: 'reality', value: 2 }]
    },
    {
      id: 'asset_texas_mana_cell',
      name: '魔力电池',
      rarity: 'bronze',
      kind: 'numeric',
      targetTags: ['team'],
      gameTags: ['texas-holdem'],
      slotTags: ['general'],
      pools: ['low', 'mid'],
      modifiers: [{ type: 'mana_max_flat', value: 8 }]
    },
    {
      id: 'asset_texas_mana_core',
      name: '魔力核心',
      rarity: 'silver',
      kind: 'numeric',
      targetTags: ['team'],
      gameTags: ['texas-holdem'],
      slotTags: ['general'],
      pools: ['mid', 'high'],
      modifiers: [{ type: 'mana_max_flat', value: 14 }]
    },
    {
      id: 'asset_texas_minor_discount',
      name: '低耗咒式',
      rarity: 'bronze',
      kind: 'numeric',
      targetTags: ['team'],
      gameTags: ['texas-holdem'],
      slotTags: ['general'],
      pools: ['low', 'mid'],
      modifiers: [{ type: 'skill_cost_flat', value: -2 }]
    },
    {
      id: 'asset_texas_general_discount',
      name: '通用节流',
      rarity: 'silver',
      kind: 'numeric',
      targetTags: ['team'],
      gameTags: ['texas-holdem'],
      slotTags: ['general'],
      pools: ['mid', 'high'],
      modifiers: [{ type: 'skill_cost_pct', value: -0.1 }]
    },
    {
      id: 'asset_texas_moirai_lens',
      name: '天命透镜',
      rarity: 'bronze',
      kind: 'numeric',
      system: 'fortune',
      targetTags: ['team'],
      gameTags: ['texas-holdem'],
      slotTags: ['general'],
      pools: ['low', 'mid'],
      modifiers: [{ type: 'force_power_pct', system: 'moirai', value: 0.08 }]
    },
    {
      id: 'asset_texas_chaos_lens',
      name: '狂厄透镜',
      rarity: 'bronze',
      kind: 'numeric',
      system: 'chaos',
      targetTags: ['team'],
      gameTags: ['texas-holdem'],
      slotTags: ['general'],
      pools: ['low', 'mid'],
      modifiers: [{ type: 'force_power_pct', system: 'chaos', value: 0.06 }]
    },
    {
      id: 'asset_texas_psyche_lens',
      name: '灵视透镜',
      rarity: 'bronze',
      kind: 'numeric',
      system: 'psyche',
      targetTags: ['team'],
      gameTags: ['texas-holdem'],
      slotTags: ['general'],
      pools: ['low', 'mid'],
      modifiers: [{ type: 'force_power_pct', system: 'psyche', value: 0.06 }]
    },
    {
      id: 'asset_texas_force_amplifier',
      name: '强运增幅器',
      rarity: 'gold',
      kind: 'numeric',
      targetTags: ['team'],
      gameTags: ['texas-holdem'],
      slotTags: ['general'],
      pools: ['high'],
      modifiers: [{ type: 'force_power_pct', value: 0.12 }]
    },
    {
      id: 'asset_texas_street_mana',
      name: '街头魔力',
      rarity: 'bronze',
      kind: 'passive',
      targetTags: ['team'],
      gameTags: ['texas-holdem'],
      slotTags: ['general'],
      pools: ['low', 'mid'],
      modifiers: [{ type: 'street_start_mana_gain', value: 1 }]
    },
    {
      id: 'asset_texas_first_cast_discount',
      name: '首发节流',
      rarity: 'silver',
      kind: 'passive',
      targetTags: ['team'],
      gameTags: ['texas-holdem'],
      slotTags: ['general'],
      pools: ['mid', 'high'],
      modifiers: [{ type: 'first_skill_cost_flat', value: -4 }]
    },
    {
      id: 'asset_texas_first_force_focus',
      name: '首力聚焦',
      rarity: 'silver',
      kind: 'passive',
      targetTags: ['team'],
      gameTags: ['texas-holdem'],
      slotTags: ['general'],
      pools: ['mid', 'high'],
      modifiers: [{ type: 'first_force_power_pct', value: 0.1 }]
    },
    {
      id: 'asset_texas_opening_glimmer',
      name: '开局微光',
      rarity: 'silver',
      kind: 'passive',
      targetTags: ['team'],
      gameTags: ['texas-holdem'],
      slotTags: ['general'],
      pools: ['mid'],
      modifiers: [{ type: 'once_per_hand_fortune_flat', value: 12 }]
    },
    {
      id: 'asset_texas_opening_blessing',
      name: '开局祝福',
      rarity: 'gold',
      kind: 'passive',
      targetTags: ['team'],
      gameTags: ['texas-holdem'],
      slotTags: ['general'],
      pools: ['high'],
      modifiers: [{ type: 'once_per_hand_fortune_flat', value: 14 }]
    },
    {
      id: 'asset_blackjack_dealer_coupon',
      name: '廿一折扣券',
      rarity: 'silver',
      kind: 'numeric',
      targetTags: ['team'],
      gameTags: ['blackjack'],
      slotTags: ['general'],
      pools: ['mid', 'high'],
      modifiers: [{ type: 'skill_cost_pct', value: -0.15 }]
    },
    {
      id: 'asset_blackjack_blackjack_bonus',
      name: '黑杰克溢价',
      rarity: 'gold',
      kind: 'numeric',
      targetTags: ['team'],
      gameTags: ['blackjack'],
      slotTags: ['general'],
      pools: ['high'],
      modifiers: [{ type: 'reward_pct', key: 'blackjack', value: 0.12 }]
    },
    {
      id: 'asset_dice_risk_anchor',
      name: '骰局锚点',
      rarity: 'silver',
      kind: 'numeric',
      targetTags: ['team'],
      gameTags: ['dice'],
      slotTags: ['general'],
      pools: ['mid', 'high'],
      modifiers: [{ type: 'risk_pct', value: -0.12 }]
    },
    {
      id: 'asset_dice_payout_spike',
      name: '豹子溢价',
      rarity: 'gold',
      kind: 'numeric',
      targetTags: ['team'],
      gameTags: ['dice'],
      slotTags: ['general'],
      pools: ['high'],
      modifiers: [{ type: 'payout_pct', key: 'triple', value: 0.1 }]
    },
    {
      id: 'asset_dragon_tiger_force_lens',
      name: '龙虎力场镜',
      rarity: 'silver',
      kind: 'numeric',
      targetTags: ['team'],
      gameTags: ['dragon-tiger'],
      slotTags: ['general'],
      pools: ['mid', 'high'],
      modifiers: [{ type: 'force_power_pct', value: 0.1 }]
    },
    {
      id: 'asset_dragon_tiger_tie_contract',
      name: '和局契约',
      rarity: 'gold',
      kind: 'numeric',
      targetTags: ['team'],
      gameTags: ['dragon-tiger'],
      slotTags: ['general'],
      pools: ['high'],
      modifiers: [{ type: 'odds_pct', key: 'tie', value: 0.08 }]
    },
    {
      id: 'asset_void_anchor',
      name: '虚空锚点',
      rarity: 'gold',
      kind: 'passive',
      targetTags: ['KAZU'],
      gameTags: ['any'],
      slotTags: ['general', 'void'],
      pools: ['high'],
      modifiers: [{ type: 'void_stability', value: 1 }]
    },
    {
      id: 'asset_rainbow_contract',
      name: '彩虹契约',
      rarity: 'rainbow',
      kind: 'god',
      unique: true,
      targetTags: ['team'],
      gameTags: ['any'],
      slotTags: ['general'],
      pools: ['high'],
      modifiers: [{ type: 'all_force_power_bonus', value: 0.08 }]
    }
  ];

  global.ACE0AssetDeckData = {
    ASSET_DECK_CONFIG,
    ASSET_CARD_CATALOG
  };
})(typeof window !== 'undefined' ? window : globalThis);
