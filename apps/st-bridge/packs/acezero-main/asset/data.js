/**
 * ACEZERO ASSET DECK DATA
 *
 * Long-term team deck constants and card catalog. This file keeps the design
 * table compact by generating repeated skill/rarity families from rules.
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

  const RARITY_META = {
    bronze: { level: 1, roman: 'I', pools: ['low', 'mid'] },
    silver: { level: 2, roman: 'II', pools: ['mid', 'high'] },
    gold: { level: 3, roman: 'III', pools: ['low', 'mid', 'high'] },
    rainbow: { level: 4, roman: 'IV', pools: ['mid', 'high'] }
  };

  const SKILL_NAME = {
    minor_wish: '小吉',
    grand_wish: '大吉',
    divine_order: '神谕',
    hex: '诅咒',
    havoc: '灾厄',
    catastrophe: '大灾变',
    analysis: '解析',
    premonition: '预兆',
    refraction: '折射',
    insulation: '绝缘',
    reality: 'Reality'
  };

  const SYSTEM_LABEL = {
    moirai: 'Moirai',
    chaos: 'Chaos',
    psyche: 'Psyche',
    void: 'Void'
  };

  function poolsForRarity(rarity) {
    return (RARITY_META[rarity] && RARITY_META[rarity].pools || ['low']).slice();
  }

  function romanForLevel(level) {
    return ['0', 'I', 'II', 'III', 'IV'][Math.max(0, Math.min(4, Number(level) || 0))] || String(level || 0);
  }

  function card(id, name, rarity, kind, extra) {
    const meta = extra || {};
    return {
      id,
      name,
      rarity,
      kind,
      ...(meta.system ? { system: meta.system } : {}),
      ...(meta.skillKey ? { skillKey: meta.skillKey } : {}),
      ...(meta.level != null ? { level: meta.level } : {}),
      ...(meta.unique ? { unique: true } : {}),
      ...(meta.consumable ? { consumable: true } : {}),
      targetTags: meta.targetTags || ['team'],
      gameTags: meta.gameTags || ['any'],
      slotTags: meta.slotTags || ['general'],
      pools: meta.pools || poolsForRarity(rarity),
      effectText: meta.effectText || '',
      statusTags: meta.statusTags || [],
      modifiers: meta.modifiers || []
    };
  }

  function skillCard(system, skillKey, rarity, targetTags, slotTags) {
    const level = RARITY_META[rarity].level;
    const roman = romanForLevel(level);
    const name = `${SKILL_NAME[skillKey] || skillKey} ${roman}`;
    return card(`asset_skill_${skillKey}_l${level}`, name, rarity, 'skill', {
      system,
      skillKey,
      level,
      targetTags: targetTags || ['team'],
      gameTags: ['texas-holdem'],
      slotTags: slotTags || ['general'],
      effectText: `${skillKey} 加入卡组，等级 ${roman}`,
      statusTags: ['唯一升级', 'Texas'],
      modifiers: [{ type: 'skill_level', key: skillKey, value: level }]
    });
  }

  function texasSkillFamily(system, skills, targetTags, slotTags) {
    const out = [];
    skills.forEach(skillKey => {
      ['bronze', 'silver', 'gold', 'rainbow'].forEach(rarity => {
        out.push(skillCard(system, skillKey, rarity, targetTags, slotTags));
      });
    });
    return out;
  }

  function manaMaxCards() {
    return [
      card('asset_mana_max_bronze', '魔运电池 I', 'bronze', 'numeric', {
        effectText: 'Mana Max +4',
        statusTags: ['可叠加', '常驻'],
        modifiers: [{ type: 'mana_max_flat', value: 4 }]
      }),
      card('asset_mana_max_silver', '魔运电池 II', 'silver', 'numeric', {
        effectText: 'Mana Max +8',
        statusTags: ['可叠加', '常驻'],
        modifiers: [{ type: 'mana_max_flat', value: 8 }]
      }),
      card('asset_mana_max_gold', '魔运电池 III', 'gold', 'numeric', {
        effectText: 'Mana Max +12',
        statusTags: ['可叠加', '常驻'],
        modifiers: [{ type: 'mana_max_flat', value: 12 }]
      })
    ];
  }

  function manaShiftCards() {
    return [
      card('asset_mana_amp_bronze', '增幅咒式 I', 'bronze', 'numeric', {
        effectText: 'Mana 消耗 +3，技能效果 +4',
        statusTags: ['可叠加'],
        modifiers: [{ type: 'skill_cost_flat', value: 3 }, { type: 'force_power_flat', value: 4 }]
      }),
      card('asset_mana_amp_silver', '增幅咒式 II', 'silver', 'numeric', {
        effectText: 'Mana 消耗 +2，技能效果 +6',
        statusTags: ['可叠加'],
        modifiers: [{ type: 'skill_cost_flat', value: 2 }, { type: 'force_power_flat', value: 6 }]
      }),
      card('asset_mana_amp_gold', '增幅咒式 III', 'gold', 'numeric', {
        effectText: 'Mana 消耗 +1，技能效果 +8',
        statusTags: ['可叠加'],
        modifiers: [{ type: 'skill_cost_flat', value: 1 }, { type: 'force_power_flat', value: 8 }]
      }),
      card('asset_mana_reduce_bronze', '减幅咒式 I', 'bronze', 'numeric', {
        effectText: 'Mana 消耗 -1，技能效果 -2',
        statusTags: ['可叠加'],
        modifiers: [{ type: 'skill_cost_flat', value: -1 }, { type: 'force_power_flat', value: -2 }]
      }),
      card('asset_mana_reduce_silver', '减幅咒式 II', 'silver', 'numeric', {
        effectText: 'Mana 消耗 -2，技能效果 -2',
        statusTags: ['可叠加'],
        modifiers: [{ type: 'skill_cost_flat', value: -2 }, { type: 'force_power_flat', value: -2 }]
      }),
      card('asset_mana_reduce_gold', '减幅咒式 III', 'gold', 'numeric', {
        effectText: 'Mana 消耗 -3，技能效果 -1',
        statusTags: ['可叠加'],
        modifiers: [{ type: 'skill_cost_flat', value: -3 }, { type: 'force_power_flat', value: -1 }]
      })
    ];
  }

  function upgradeCards() {
    return [
      card('asset_skill_upgrade_bronze', '技能升格 I', 'bronze', 'upgrade', {
        consumable: true,
        effectText: '绑定一张 LV1 技能卡，升一级',
        statusTags: ['消耗', '绑定目标'],
        modifiers: [{ type: 'skill_upgrade', maxFromLevel: 1, value: 1 }]
      }),
      card('asset_skill_upgrade_silver', '技能升格 II', 'silver', 'upgrade', {
        consumable: true,
        effectText: '绑定一张 LV1-LV2 技能卡，升一级',
        statusTags: ['消耗', '绑定目标'],
        modifiers: [{ type: 'skill_upgrade', maxFromLevel: 2, value: 1 }]
      }),
      card('asset_skill_upgrade_gold', '技能升格 III', 'gold', 'upgrade', {
        consumable: true,
        effectText: '绑定一张 LV1-LV3 技能卡，升一级',
        statusTags: ['消耗', '绑定目标'],
        modifiers: [{ type: 'skill_upgrade', maxFromLevel: 3, value: 1 }]
      })
    ];
  }

  function passiveCards() {
    return [
      card('asset_moirai_street_bronze', '偶发小吉 I', 'bronze', 'passive', {
        system: 'moirai',
        gameTags: ['texas-holdem'],
        effectText: '每街 10% 获得 3 好运',
        statusTags: ['被动', 'Texas'],
        modifiers: [{ type: 'street_force_chance_flat', system: 'moirai', forceType: 'fortune', chance: 0.1, value: 3 }]
      }),
      card('asset_moirai_power_silver', '天命锐化 II', 'silver', 'passive', {
        system: 'moirai',
        gameTags: ['texas-holdem'],
        effectText: 'Moirai 攻击 +8%',
        statusTags: ['被动', 'Texas'],
        modifiers: [{ type: 'force_power_pct', system: 'moirai', value: 0.08 }]
      }),
      card('asset_moirai_street_silver', '偶发小吉 II', 'silver', 'passive', {
        system: 'moirai',
        gameTags: ['texas-holdem'],
        effectText: '每街 15% 获得 4 好运',
        statusTags: ['被动', 'Texas'],
        modifiers: [{ type: 'street_force_chance_flat', system: 'moirai', forceType: 'fortune', chance: 0.15, value: 4 }]
      }),
      card('asset_moirai_power_gold', '天命锐化 III', 'gold', 'passive', {
        system: 'moirai',
        gameTags: ['texas-holdem'],
        effectText: 'Moirai 攻击 +12%',
        statusTags: ['被动', 'Texas'],
        modifiers: [{ type: 'force_power_pct', system: 'moirai', value: 0.12 }]
      }),
      card('asset_moirai_street_gold', '偶发小吉 III', 'gold', 'passive', {
        system: 'moirai',
        gameTags: ['texas-holdem'],
        effectText: '每街 20% 获得 5 好运',
        statusTags: ['被动', 'Texas'],
        modifiers: [{ type: 'street_force_chance_flat', system: 'moirai', forceType: 'fortune', chance: 0.2, value: 5 }]
      }),
      card('asset_moirai_power_rainbow', '天命锐化 IV', 'rainbow', 'passive', {
        system: 'moirai',
        gameTags: ['texas-holdem'],
        effectText: 'Moirai 攻击 +16%',
        statusTags: ['被动', 'Texas'],
        modifiers: [{ type: 'force_power_pct', system: 'moirai', value: 0.16 }]
      }),
      card('asset_moirai_street_rainbow', '偶发小吉 IV', 'rainbow', 'passive', {
        system: 'moirai',
        gameTags: ['texas-holdem'],
        effectText: '每街 25% 获得 6 好运',
        statusTags: ['被动', 'Texas'],
        modifiers: [{ type: 'street_force_chance_flat', system: 'moirai', forceType: 'fortune', chance: 0.25, value: 6 }]
      }),
      card('asset_chaos_street_bronze', '偶发厄咒 I', 'bronze', 'passive', {
        system: 'chaos',
        gameTags: ['texas-holdem'],
        effectText: '每街 10% 随机投放 4 厄运',
        statusTags: ['被动', 'Texas'],
        modifiers: [{ type: 'street_force_chance_flat', system: 'chaos', forceType: 'curse', chance: 0.1, value: 4, randomTarget: true }]
      }),
      card('asset_chaos_power_silver', '厄运锐化 II', 'silver', 'passive', {
        system: 'chaos',
        gameTags: ['texas-holdem'],
        effectText: 'Chaos 攻击 +10%',
        statusTags: ['被动', 'Texas'],
        modifiers: [{ type: 'force_power_pct', system: 'chaos', value: 0.1 }]
      }),
      card('asset_chaos_street_silver', '偶发厄咒 II', 'silver', 'passive', {
        system: 'chaos',
        gameTags: ['texas-holdem'],
        effectText: '每街 15% 随机投放 6 厄运',
        statusTags: ['被动', 'Texas'],
        modifiers: [{ type: 'street_force_chance_flat', system: 'chaos', forceType: 'curse', chance: 0.15, value: 6, randomTarget: true }]
      }),
      card('asset_chaos_power_gold', '厄运锐化 III', 'gold', 'passive', {
        system: 'chaos',
        gameTags: ['texas-holdem'],
        effectText: 'Chaos 攻击 +16%',
        statusTags: ['被动', 'Texas'],
        modifiers: [{ type: 'force_power_pct', system: 'chaos', value: 0.16 }]
      }),
      card('asset_chaos_street_gold', '偶发厄咒 III', 'gold', 'passive', {
        system: 'chaos',
        gameTags: ['texas-holdem'],
        effectText: '每街 20% 随机投放 8 厄运',
        statusTags: ['被动', 'Texas'],
        modifiers: [{ type: 'street_force_chance_flat', system: 'chaos', forceType: 'curse', chance: 0.2, value: 8, randomTarget: true }]
      }),
      card('asset_chaos_power_rainbow', '厄运锐化 IV', 'rainbow', 'passive', {
        system: 'chaos',
        gameTags: ['texas-holdem'],
        effectText: 'Chaos 攻击 +24%',
        statusTags: ['被动', 'Texas'],
        modifiers: [{ type: 'force_power_pct', system: 'chaos', value: 0.24 }]
      }),
      card('asset_chaos_street_rainbow', '偶发厄咒 IV', 'rainbow', 'passive', {
        system: 'chaos',
        gameTags: ['texas-holdem'],
        effectText: '每街 25% 随机投放 10 厄运',
        statusTags: ['被动', 'Texas'],
        modifiers: [{ type: 'street_force_chance_flat', system: 'chaos', forceType: 'curse', chance: 0.25, value: 10, randomTarget: true }]
      }),
      card('asset_psyche_power_silver', '洞悉锐化 II', 'silver', 'passive', {
        system: 'psyche',
        gameTags: ['texas-holdem'],
        effectText: 'Psyche 值 +10%',
        statusTags: ['被动', 'Texas'],
        modifiers: [{ type: 'force_power_pct', system: 'psyche', value: 0.1 }]
      }),
      card('asset_psyche_shield_silver', '洞悉护盾 II', 'silver', 'passive', {
        system: 'psyche',
        gameTags: ['texas-holdem'],
        effectText: '每街 20% 生成 6 Psyche 护盾',
        statusTags: ['被动', 'Texas'],
        modifiers: [{ type: 'street_force_chance_flat', system: 'psyche', forceType: 'psyche', chance: 0.2, value: 6, shield: true }]
      }),
      card('asset_psyche_power_gold', '洞悉锐化 III', 'gold', 'passive', {
        system: 'psyche',
        gameTags: ['texas-holdem'],
        effectText: 'Psyche 值 +16%',
        statusTags: ['被动', 'Texas'],
        modifiers: [{ type: 'force_power_pct', system: 'psyche', value: 0.16 }]
      }),
      card('asset_psyche_shield_gold', '洞悉护盾 III', 'gold', 'passive', {
        system: 'psyche',
        gameTags: ['texas-holdem'],
        effectText: '每街 30% 生成 8 Psyche 护盾',
        statusTags: ['被动', 'Texas'],
        modifiers: [{ type: 'street_force_chance_flat', system: 'psyche', forceType: 'psyche', chance: 0.3, value: 8, shield: true }]
      }),
      card('asset_psyche_power_rainbow', '洞悉锐化 IV', 'rainbow', 'passive', {
        system: 'psyche',
        gameTags: ['texas-holdem'],
        effectText: 'Psyche 值 +24%',
        statusTags: ['被动', 'Texas'],
        modifiers: [{ type: 'force_power_pct', system: 'psyche', value: 0.24 }]
      }),
      card('asset_psyche_shield_rainbow', '洞悉护盾 IV', 'rainbow', 'passive', {
        system: 'psyche',
        gameTags: ['texas-holdem'],
        effectText: '每街 40% 生成 10 Psyche 护盾',
        statusTags: ['被动', 'Texas'],
        modifiers: [{ type: 'street_force_chance_flat', system: 'psyche', forceType: 'psyche', chance: 0.4, value: 10, shield: true }]
      })
    ];
  }

  function miniGameCards() {
    const gameTags = ['blackjack', 'dice', 'dragon-tiger'];
    return [
      card('asset_mini_cost_bronze', '小游戏节流 I', 'bronze', 'numeric', {
        gameTags,
        effectText: '小游戏技能 Mana -12%',
        statusTags: ['小游戏'],
        modifiers: [{ type: 'skill_cost_pct', value: -0.12 }]
      }),
      card('asset_mini_cost_silver', '小游戏节流 II', 'silver', 'numeric', {
        gameTags,
        effectText: '小游戏技能 Mana -20%',
        statusTags: ['小游戏'],
        modifiers: [{ type: 'skill_cost_pct', value: -0.2 }]
      }),
      card('asset_mini_cost_gold', '小游戏节流 III', 'gold', 'numeric', {
        gameTags,
        effectText: '小游戏技能 Mana -33%',
        statusTags: ['小游戏'],
        modifiers: [{ type: 'skill_cost_pct', value: -0.33 }]
      }),
      card('asset_mini_power_bronze', '小游戏收益 I', 'bronze', 'numeric', {
        gameTags,
        effectText: '好运/厄运技能效果 +12%',
        statusTags: ['小游戏'],
        modifiers: [{ type: 'force_power_pct', system: 'moirai', value: 0.12 }, { type: 'force_power_pct', system: 'chaos', value: 0.12 }]
      }),
      card('asset_mini_power_silver', '小游戏收益 II', 'silver', 'numeric', {
        gameTags,
        effectText: '好运/厄运技能效果 +20%',
        statusTags: ['小游戏'],
        modifiers: [{ type: 'force_power_pct', system: 'moirai', value: 0.2 }, { type: 'force_power_pct', system: 'chaos', value: 0.2 }]
      }),
      card('asset_mini_power_gold', '小游戏收益 III', 'gold', 'numeric', {
        gameTags,
        effectText: '好运/厄运技能效果 +33%',
        statusTags: ['小游戏'],
        modifiers: [{ type: 'force_power_pct', system: 'moirai', value: 0.33 }, { type: 'force_power_pct', system: 'chaos', value: 0.33 }]
      })
    ];
  }

  function highRiskCards() {
    return [
      card('asset_risk_reward_bronze', '赌徒咒式 I', 'bronze', 'passive', {
        gameTags: ['texas-holdem'],
        effectText: '施放时 Mana/效果随机 -16% 到 +16%',
        statusTags: ['高风险', 'Texas'],
        modifiers: [{ type: 'risk_reward_roll', costPctMin: -0.16, costPctMax: 0.16, effectPctMin: -0.16, effectPctMax: 0.16 }]
      }),
      card('asset_risk_reward_silver', '赌徒咒式 II', 'silver', 'passive', {
        gameTags: ['texas-holdem'],
        effectText: '施放时 Mana -14%到+14%，效果 -12%到+20%',
        statusTags: ['高风险', 'Texas'],
        modifiers: [{ type: 'risk_reward_roll', costPctMin: -0.14, costPctMax: 0.14, effectPctMin: -0.12, effectPctMax: 0.2 }]
      }),
      card('asset_risk_reward_gold', '赌徒咒式 III', 'gold', 'passive', {
        gameTags: ['texas-holdem'],
        effectText: '施放时 Mana -10%到+10%，效果 -8%到+24%',
        statusTags: ['高风险', 'Texas'],
        modifiers: [{ type: 'risk_reward_roll', costPctMin: -0.1, costPctMax: 0.1, effectPctMin: -0.08, effectPctMax: 0.24 }]
      })
    ];
  }

  function godCards() {
    return [
      card('asset_god_mana_discount', '神卡：零耗律', 'rainbow', 'god', {
        unique: true,
        effectText: '全局 Mana 消耗 -10%',
        statusTags: ['唯一', '神卡'],
        modifiers: [{ type: 'skill_cost_pct', value: -0.1 }]
      }),
      card('asset_god_texas_skill_plus', '神卡：牌桌升格', 'rainbow', 'god', {
        unique: true,
        gameTags: ['texas-holdem'],
        effectText: 'Texas 技能卡等级默认 +1',
        statusTags: ['唯一', '神卡', 'Texas'],
        modifiers: [{ type: 'skill_level_bonus', value: 1 }]
      }),
      card('asset_god_mini_mastery', '神卡：小局支配', 'rainbow', 'god', {
        unique: true,
        gameTags: ['blackjack', 'dice', 'dragon-tiger'],
        effectText: '小游戏 Mana -33%，技能效果 +33%',
        statusTags: ['唯一', '神卡', '小游戏'],
        modifiers: [{ type: 'skill_cost_pct', value: -0.33 }, { type: 'force_power_pct', value: 0.33 }]
      }),
      card('asset_rainbow_contract', '彩虹契约', 'rainbow', 'god', {
        unique: true,
        effectText: '所有技能效果 +8%',
        statusTags: ['唯一', '神卡'],
        modifiers: [{ type: 'all_force_power_bonus', value: 0.08 }]
      })
    ];
  }

  const ASSET_CARD_CATALOG = [
    ...texasSkillFamily('moirai', ['minor_wish', 'grand_wish', 'divine_order'], ['RINO']),
    ...texasSkillFamily('chaos', ['hex', 'havoc', 'catastrophe'], ['team']),
    ...texasSkillFamily('psyche', ['analysis', 'premonition', 'refraction'], ['team']),
    skillCard('void', 'insulation', 'bronze', ['KAZU'], ['general', 'void']),
    skillCard('void', 'insulation', 'silver', ['KAZU'], ['general', 'void']),
    skillCard('void', 'insulation', 'gold', ['KAZU'], ['general', 'void']),
    skillCard('void', 'insulation', 'rainbow', ['KAZU'], ['general', 'void']),
    card('asset_skill_reality_l3', 'Reality I', 'gold', 'skill', {
      system: 'void',
      skillKey: 'reality',
      level: 3,
      targetTags: ['KAZU'],
      gameTags: ['texas-holdem'],
      slotTags: ['general', 'void'],
      effectText: 'reality 加入卡组，等级 III',
      statusTags: ['唯一升级', 'Texas', 'VOID'],
      modifiers: [{ type: 'skill_level', key: 'reality', value: 3 }]
    }),
    card('asset_skill_reality_l4', 'Reality II', 'rainbow', 'skill', {
      system: 'void',
      skillKey: 'reality',
      level: 4,
      targetTags: ['KAZU'],
      gameTags: ['texas-holdem'],
      slotTags: ['general', 'void'],
      effectText: 'reality 加入卡组，等级 IV',
      statusTags: ['唯一升级', 'Texas', 'VOID'],
      modifiers: [{ type: 'skill_level', key: 'reality', value: 4 }]
    }),
    ...manaMaxCards(),
    ...manaShiftCards(),
    ...upgradeCards(),
    ...passiveCards(),
    ...miniGameCards(),
    ...highRiskCards(),
    ...godCards(),
    card('asset_void_anchor', '虚空锚点', 'gold', 'passive', {
      targetTags: ['KAZU'],
      gameTags: ['any'],
      slotTags: ['general', 'void'],
      effectText: 'Void 槽稳定占位',
      statusTags: ['VOID'],
      modifiers: [{ type: 'void_stability', value: 1 }]
    }),
    card('asset_texas_force_amplifier', '强运增幅器', 'gold', 'numeric', {
      gameTags: ['texas-holdem'],
      effectText: 'Texas 技能效果 +12%',
      statusTags: ['Texas'],
      modifiers: [{ type: 'force_power_pct', value: 0.12 }]
    })
  ];

  global.ACE0AssetDeckData = {
    ASSET_DECK_CONFIG,
    ASSET_CARD_CATALOG,
    SYSTEM_LABEL,
    SKILL_NAME
  };
})(typeof window !== 'undefined' ? window : globalThis);
