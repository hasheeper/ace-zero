/**
 * Attribute System — 属性系统
 * 《零之王牌》四属性定义 + 属性面板管理
 *
 * 四属性：
 *   天命 (Moirai)  — 顺流，强制发好牌，Rino 专精
 *   狂厄 (Chaos)   — 乱流，干扰与诅咒，反派专精
 *   灵视 (Psyche)  — 观察者之眼，识破与读心，Kazu 专精
 *   虚无 (Void)    — Kazu 前台独有，% 魔法减伤
 *
 * 系统克制关系由 MoZ force resolution 按技能需求稿逐条处理。
 * AttributeSystem 只负责属性面板数值和 Void 减伤除数。
 *
 * 技能→属性映射：
 *   fortune / role moirai skills → Moirai
 *   curse / role chaos skills    → Chaos
 *   psyche / role psyche skills  → Psyche
 *   void                         → Void
 */

// ========== 属性常量 ==========

export const ATTR = {
  MOIRAI: 'moirai',
  CHAOS:  'chaos',
  PSYCHE: 'psyche',
  VOID:   'void'
};

export const EFFECT_TO_ATTR = {
  fortune:      ATTR.MOIRAI,
  curse:        ATTR.CHAOS,
  psyche:       ATTR.PSYCHE,
  void:         ATTR.VOID,
  analysis:     ATTR.PSYCHE,
  premonition:  ATTR.PSYCHE,
  refraction:   ATTR.PSYCHE,
  insulation:   ATTR.VOID,
  reality:      ATTR.VOID,
  royal_decree: ATTR.MOIRAI,
  heart_read:   ATTR.PSYCHE,
  cooler:       ATTR.CHAOS,
  skill_seal:   ATTR.CHAOS,
  clairvoyance: ATTR.PSYCHE,
  bubble_liquidation: ATTR.PSYCHE,
  miracle:      ATTR.MOIRAI,
  lucky_find:   ATTR.MOIRAI,
  // Cota
  deal_card:       ATTR.PSYCHE,
  gather_or_spread: ATTR.PSYCHE,
  // Eulalia
  absolution:      ATTR.MOIRAI,
  benediction:     ATTR.MOIRAI,
  // Kako
  reclassification: ATTR.PSYCHE,
  general_ruling:   ATTR.PSYCHE,
  // Kuzuha
  house_edge:      ATTR.CHAOS,
  debt_call:       ATTR.CHAOS
};

const DEFAULT_ATTRIBUTES = {
  [ATTR.MOIRAI]: 0,
  [ATTR.CHAOS]:  0,
  [ATTR.PSYCHE]: 0,
  [ATTR.VOID]:   0
};

// ========== AttributeSystem 类 ==========

export class AttributeSystem {
  constructor() {
    this.panels = new Map();
  }

  registerFromConfig(players) {
    if (!players) return;
    for (const p of players) {
      const attrs = p.attributes
        ? { ...DEFAULT_ATTRIBUTES, ...p.attributes }
        : { ...DEFAULT_ATTRIBUTES };
      this.panels.set(p.id, attrs);
    }
  }

  getAttributes(characterId) {
    return this.panels.get(characterId) || { ...DEFAULT_ATTRIBUTES };
  }

  setAttribute(characterId, attr, value) {
    const panel = this.panels.get(characterId);
    if (!panel) return;
    panel[attr] = Math.max(0, Math.min(200, value));
  }

  addAttribute(characterId, attr, delta) {
    const panel = this.panels.get(characterId);
    if (!panel) return;
    panel[attr] = Math.max(0, Math.min(200, (panel[attr] || 0) + delta));
  }

  getAttributeForEffect(effectType) {
    return EFFECT_TO_ATTR[effectType] || ATTR.MOIRAI;
  }

  getAttributeBonus(attrValue) {
    return 1 + (attrValue || 0) / 100;
  }

  getVoidDivisor(voidValue) {
    return 1 + (voidValue || 0) / 100;
  }
}
