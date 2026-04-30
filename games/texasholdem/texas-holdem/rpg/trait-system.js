/**
 * Trait System — 特质系统
 * 《零之王牌》角色被动天赋模块
 *
 * 每个角色有两个特质槽位：
 *   - vanguard trait（主手特质）：影响防御、牌运、物理层
 *   - rearguard trait（副手特质）：影响魔力、技能增幅、精神层
 *
 * 特质是被动天赋，始终生效，不消耗 mana。
 * 特质目录 TRAIT_CATALOG 定义所有可用特质及其效果。
 * 角色的特质由 JSON 配置声明（trait 字段）。
 *
 * 依赖：无（独立模块）
 */

// ========== 特质类型 ==========

export const TRAIT_SLOT = {
  VANGUARD: 'vanguard',
  REARGUARD: 'rearguard',
  HIDDEN: 'hidden'
};

// ========== 特质目录 ==========

export const TRAIT_CATALOG = {
  // --- 主手特质（防御/物理层） ---
  blank_body: {
    slot: 'vanguard',
    name: '空白体质',
    description: '天生的概率死角，削弱所有被动魔运力量',
    effect: { type: 'weaken_passive', value: 0.3 }
  },
  iron_nerve: {
    slot: 'vanguard',
    name: '铁壁心志',
    description: '精神防御极高，降低受到的诅咒效果',
    effect: { type: 'resist_curse', value: 0.25 }
  },
  wild_surge: {
    slot: 'vanguard',
    name: '狂野脉冲',
    description: '混沌体质，被动魔运效果随机波动±50%',
    effect: { type: 'chaos_fluctuation', value: 0.5 }
  },
  stone_wall: {
    slot: 'vanguard',
    name: '磐石之壁',
    description: 'Void 属性额外 +20，减伤能力增强',
    effect: { type: 'void_bonus', value: 20 }
  },

  // --- 主手特质：角色专属 ---
  null_armor: {
    slot: 'vanguard',
    name: '零号体质',
    description: '自身幸运效果-20%；每街首次受到hostile Curse或作用于自身的fortune时，抹除该力量30%，并将被抹除力量值的50%转为mana（直接进位）',
    effect: { type: 'null_absorption', fortunePenalty: 0.20, absorbRate: 0.30, manaGainRate: 0.50 }
  },
  crimson_crown: {
    slot: 'vanguard',
    name: '天宫血统',
    description: '幸运效果+35%，但受到的诅咒效果+20%（越强大越是众矢之的）',
    effect: { type: 'fortune_amp_curse_vuln', fortuneBonus: 0.35, curseVuln: 0.20 }
  },
  death_ledger: {
    slot: 'vanguard',
    name: '死亡账簿',
    description: '诅咒常态穿透目标15%的Void减伤和Psyche反制；对带有冤家牌标记的目标额外+15%穿透',
    effect: { type: 'curse_penetration', value: 0.15, markedBonus: 0.15 }
  },

  // --- 副手特质（魔力/精神层） ---
  fate_weaver: {
    slot: 'rearguard',
    name: '命运编织者',
    description: '主动 fortune 技能效果 +20%',
    effect: { type: 'boost_fortune', value: 0.2 }
  },
  hex_pulse: {
    slot: 'rearguard',
    name: '咒脉共振',
    description: '诅咒技能冷却 -1 回合',
    effect: { type: 'reduce_cooldown_curse', value: 1 }
  },
  mana_tide: {
    slot: 'rearguard',
    name: '魔力潮汐',
    description: 'mana 回复量 +2/回合',
    effect: { type: 'mana_regen_bonus', value: 2 }
  },
  glass_cannon: {
    slot: 'rearguard',
    name: '玻璃大炮',
    description: '所有主动技能伤害 +30%，但 mana 上限 -20%',
    effect: { type: 'damage_up_mana_down', damage: 0.3, mana: -0.2 }
  },

  // --- 副手特质：角色专属 ---
  steady_hand: {
    slot: 'rearguard',
    name: '不动心',
    description: '被动mana回复+4/回合，前台角色受curse伤害-15%，自身幸运效果-15%',
    effect: { type: 'calm_support', manaRegen: 4, curseReduction: 0.15, fortunePenalty: 0.15 }
  },
  obsessive_love: {
    slot: 'rearguard',
    name: '执念之爱',
    description: '无论顺风逆风都给予主手+20%fortune；顺风时每街一次fortune(P15)，逆风时每街一次curse(P15)',
    effect: { type: 'desperate_devotion', fortuneBonus: 0.20, passiveAhead: 15, passiveBehind: 15 }
  },
  binding_protocol: {
    slot: 'rearguard',
    name: '拘束协议',
    description: '封印拘束节省魔力，技能mana消耗-40%，但力量-10%',
    effect: { type: 'mana_efficiency', costMult: 0.6, powerMult: 0.9 }
  },

  // --- 主手特质：VV 专属 ---
  laser_eye: {
    slot: 'vanguard',
    name: '单片镜',
    description: '发动估价眼后，选择 1 / 2 / 3 档建仓，并预设一个隐藏清算方向',
    effect: { type: 'vv_positioning', tiers: [1, 2, 3], directions: ['bullish', 'bearish'] }
  },

  // --- 副手特质：VV 专属 ---
  service_fee: {
    slot: 'rearguard',
    name: '手续费',
    description: '任意角色通过主动技能获得 fortune / mana / curse→fortune 转化时，VV 抽取其中 12% 作为供血；fortune/转化收益转为 VV 的 fortune，mana 收益转为 VV 的 mana；单次 mana 抽取最多 10',
    effect: { type: 'vv_service_fee', siphonRate: 0.12, maxManaFee: 10 }
  },

  // --- 主手特质：POPPY 专属 ---
  four_leaf_clover: {
    slot: 'vanguard',
    name: '四叶草',
    description: '筹码>150%时fortune-15%且受curse+15%；筹码<100%时fortune+15%并常驻fortune(P5)；筹码<=50%时fortune+30%并常驻fortune(P10)',
    effect: {
      type: 'underdog_fortune',
      highThreshold: 1.5,
      highFortunePenalty: 0.15,
      highCurseVuln: 0.15,
      midThreshold: 1.0,
      midBonus: 0.15,
      midFixedFortune: 5,
      lowThreshold: 0.5,
      lowBonus: 0.3,
      lowFixedFortune: 10
    }
  },

  // --- 副手特质：POPPY 专属 ---
  cockroach: {
    slot: 'rearguard',
    name: '不死身',
    description: '继续入局血线降至5%；若本局结算时血线≤50%，回收全场本街总耗蓝15%（上限8）并将50%被Psyche转化Chaos回收为fortune',
    effect: {
      type: 'desperation_reclaim',
      continueThreshold: 0.05,
      reclaimThreshold: 0.5,
      totalManaRecoverRate: 0.15,
      manaRecoverCap: 8,
      convertedChaosRecoverRate: 0.5
    }
  },

  // --- 主手特质：Trixie 专属 ---
  paradox_frame: {
    slot: 'vanguard',
    name: '悖论体',
    description: '本街承受的 fortune 与 curse 均按 125% 计入鬼牌炼成',
    effect: { type: 'trixie_paradox_frame', fortuneTakenRate: 1.25, curseTakenRate: 1.25 }
  },

  // --- 副手特质：Trixie 专属 ---
  improvised_stage: {
    slot: 'rearguard',
    name: '即兴表演',
    description: '若本街同时承受过 fortune 与 curse，且两者原始总值均 >40 / >80，则鬼牌额外 +25 / +50',
    effect: {
      type: 'trixie_improvised_stage',
      midThreshold: 40,
      highThreshold: 80,
      midBonus: 25,
      highBonus: 50
    }
  },

  // --- 隐藏特质：Trixie 专属 ---
  wild_card_core: {
    slot: 'hidden',
    name: '鬼牌炼成',
    description: '每街结束时，将本街承受的 fortune 与 curse 总值的 50% 炼成为唯一鬼牌；鬼牌上限 120',
    effect: {
      type: 'trixie_wild_card_core',
      convertRate: 0.5,
      cap: 120
    }
  },

  // --- 主手特质：Cota 专属 ---
  contract_template: {
    slot: 'vanguard',
    name: '契约模板',
    description: '收牌/铺牌后所有吉牌/厄牌额外 +1 点数；若同类牌达到 2 张或以上，该类牌结算效果额外 +15%',
    effect: { type: 'cota_contract_template', gatherBaseBonus: 1, spreadBaseBonus: 1, spreadNewCardCostDelta: 0, pairBonusRate: 0.15 }
  },

  // --- 副手特质：Cota 专属 ---
  dealer_hands_fault: {
    slot: 'rearguard',
    name: '发牌手故障',
    description: '默认处于标准态；场上存在杂牌时自动进入故障态，杂牌清空后退出。故障态基础爆牌率 10%；故障态下每次发牌/收牌/铺牌后爆牌率 +10%；若发生爆牌则返还 mana 并给爆牌收益修正',
    effect: { type: 'cota_dealer_hands_fault', baseBustRate: 0.1, bustRatePerAction: 0.1, bustRefundMana: 3, miscBustMultiplier: 1.5, firstBustFortune: 15 }
  },

  // --- 主手特质：Eulalia 专属 ---
  martyr_frame: {
    slot: 'vanguard',
    name: '殉道体质',
    description: '本街开始时按上一街继承的名义厄运分层；每10点名义厄运使自身 fortune 类效果倍率 +0.15',
    effect: { type: 'eulalia_martyr_frame', burdenPerLayer: 10, fortuneBonusPerLayer: 0.15 }
  },

  // --- 副手特质：Eulalia 专属 ---
  sanctuary_core: {
    slot: 'rearguard',
    name: '庇护所',
    description: '本街开始时按上一街继承的名义厄运分层；每10点名义厄运恢复 3 mana',
    effect: { type: 'eulalia_sanctuary_core', burdenPerLayer: 10, manaPerLayer: 3 }
  },

  // --- 主手特质：Kako 专属 ---
  redline_file: {
    slot: 'vanguard',
    name: '红线卷宗',
    description: '对带红章目标发动技能时，按当前红章率提高本次裁定效果',
    effect: { type: 'kako_redline_file', bonusPerRedlineRate: 0.33 }
  },

  // --- 副手特质：Kako 专属 ---
  signoff_flow: {
    slot: 'rearguard',
    name: '签批流程',
    description: '每街结束时按当前红章率恢复 mana',
    effect: { type: 'kako_signoff_flow', manaPerStreetCap: 6 }
  },

  // --- 主手特质：Kuzuha 专属 ---
  house_tab: {
    slot: 'vanguard',
    name: '挂账规矩',
    description: 'KUZUHA 对敌方施加 fortune / curse 时，为目标附加额外 debt rot',
    effect: { type: 'kuzuha_house_tab', initialDebt: 8, convertRate: 0.25 }
  },

  // --- 副手特质：Kuzuha 专属 ---
  grace_period: {
    slot: 'rearguard',
    name: '宽限期',
    description: '每街先结算债蚀，再按结算总值回蓝；高债目标会额外给 KUZUHA fortune',
    effect: { type: 'kuzuha_grace_period', manaRecoverRate: 0.12, highDebtThreshold: 40, highDebtFortune: 8 }
  }
};

// ========== TraitSystem 类 ==========

export class TraitSystem {
  constructor() {
    // key: ownerId, value: { vanguard: traitKey|null, rearguard: traitKey|null, hidden: string[] }
    this.traits = new Map();
  }

  /**
   * 从 game-config.json 注册所有角色的特质
   * 统一接口：每个角色有 vanguard.trait 和 rearguard.trait
   * @param {object} config - 完整的 game config
   * @param {object} [playerIdMap] - { heroId, seats: { BTN: id, ... } }
   *   如果提供，使用真实游戏 ID；否则回退到顺序分配（hero=0, NPC=1,2,...）
   */
  registerFromConfig(config, playerIdMap) {
    this.traits.clear();

    if (playerIdMap && playerIdMap.heroId != null) {
      // 使用真实游戏 ID
      if (config.hero) {
        this._registerChar(playerIdMap.heroId, config.hero);
      }
      if (config.seats && playerIdMap.seats) {
        for (const seat in playerIdMap.seats) {
          const s = config.seats[seat];
          if (!s) continue;
          this._registerChar(playerIdMap.seats[seat], s);
        }
      }
    } else {
      // 回退：顺序分配
      if (config.hero) {
        this._registerChar(0, config.hero);
      }
      if (config.seats) {
        const order = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
        let idx = 1;
        for (const seat of order) {
          const s = config.seats[seat];
          if (!s) continue;
          this._registerChar(idx, s);
          idx++;
        }
      }
    }
  }

  /**
   * @private
   */
  _registerChar(ownerId, char) {
    const vTrait = (char.vanguard && char.vanguard.trait) || null;
    const rTrait = (char.rearguard && char.rearguard.trait) || null;
    const hiddenTraits = this._deriveHiddenTraits(char);
    this.traits.set(ownerId, { vanguard: vTrait, rearguard: rTrait, hidden: hiddenTraits });
  }

  _deriveHiddenTraits(char) {
    const roleNames = [];
    if (char && char.vanguard && char.vanguard.name) roleNames.push(String(char.vanguard.name).toUpperCase());
    if (char && char.rearguard && char.rearguard.name) roleNames.push(String(char.rearguard.name).toUpperCase());

    const hidden = [];
    if (roleNames.some(name => name.indexOf('TRIXIE') === 0)) {
      hidden.push('wild_card_core');
    }
    return hidden;
  }

  /**
   * 获取角色的特质
   * @param {number} ownerId
   * @returns {{ vanguard: string|null, rearguard: string|null }}
   */
  getTraits(ownerId) {
    return this.traits.get(ownerId) || { vanguard: null, rearguard: null, hidden: [] };
  }

  /**
   * 获取特质的完整定义
   * @param {string} traitKey
   * @returns {object|null}
   */
  getTraitDef(traitKey) {
    return TRAIT_CATALOG[traitKey] || null;
  }

  /**
   * 检查角色是否拥有某个特质效果类型
   * @param {number} ownerId
   * @param {string} effectType - 如 'weaken_passive', 'resist_curse'
   * @returns {{ has: boolean, value: number, slot: string|null }}
   */
  hasEffect(ownerId, effectType) {
    const t = this.getTraits(ownerId);
    for (const slot of ['vanguard', 'rearguard']) {
      const key = t[slot];
      if (!key) continue;
      const def = TRAIT_CATALOG[key];
      if (def && def.effect && def.effect.type === effectType) {
        return { has: true, value: def.effect, slot: slot };
      }
    }
    if (Array.isArray(t.hidden)) {
      for (const key of t.hidden) {
        if (!key) continue;
        const def = TRAIT_CATALOG[key];
        if (def && def.effect && def.effect.type === effectType) {
          return { has: true, value: def.effect, slot: 'hidden' };
        }
      }
    }
    return { has: false, value: 0, slot: null };
  }

  /**
   * 获取所有已注册角色的特质摘要
   */
  getSummary() {
    const result = [];
    for (const [id, t] of this.traits) {
      const entry = { ownerId: id, vanguard: null, rearguard: null };
      if (t.vanguard && TRAIT_CATALOG[t.vanguard]) {
        entry.vanguard = { key: t.vanguard, name: TRAIT_CATALOG[t.vanguard].name };
      }
      if (t.rearguard && TRAIT_CATALOG[t.rearguard]) {
        entry.rearguard = { key: t.rearguard, name: TRAIT_CATALOG[t.rearguard].name };
      }
      if (Array.isArray(t.hidden) && t.hidden.length > 0) {
        entry.hidden = t.hidden
          .filter(key => key && TRAIT_CATALOG[key])
          .map(key => ({ key: key, name: TRAIT_CATALOG[key].name }));
      }
      result.push(entry);
    }
    return result;
  }
}
