/**
 * Poker AI split module: SkillAI.
 */
(function(global) {
  'use strict';

  var modules = global.PokerAIModules || (global.PokerAIModules = {});
  var register = modules.register || function(moduleName, value) {
    modules[moduleName] = value;
    return value;
  };

  var Profiles = modules.Profiles || {};
  var UtilityScorer = modules.UtilityScorer || {};
  var CardUtils = modules.CardUtils || {};
  var NpcRoleDirector = global.NpcRoleDirector || {
    shouldUseSkill: function(input, fallback) {
      return fallback(input);
    }
  };
  var PHASE_INDEX = Profiles.PHASE_INDEX || { preflop: 0, flop: 1, turn: 2, river: 3 };
  var RIVER_INFO_SKILL_EFFECTS = Profiles.RIVER_INFO_SKILL_EFFECTS || { psyche: 1, heart_read: 1, clairvoyance: 1 };
  var normalizeSkillAiDifficulty = Profiles.normalizeSkillAiDifficulty || function(type) { return type || 'regular'; };
  var INFO_SKILL_EFFECTS = UtilityScorer.INFO_SKILL_EFFECTS || { psyche: 1, heart_read: 1, clairvoyance: 1 };
  var evaluateHandStrength = CardUtils.evaluateHandStrength || function() { return { rank: 0, name: 'Invalid' }; };
  var evaluatePreflopStrength = CardUtils.evaluatePreflopStrength || function() { return 0; };
  var HAND_STRENGTH_MAP = CardUtils.HAND_STRENGTH_MAP || {};

  // ========== SkillAI — 技能决策模块 ==========
  // 纯函数，无状态。所有技能相关的 AI 决策集中在这里。
  // skill-system.js 通过回调委托到这里，不直接耦合。
  //
  // 两大职责：
  //   1. shouldUseSkill — NPC 是否使用某个主动技能（4属性 × 3难度）
  //   2. pickCurseTarget — Curse 选目标（3难度）

  const SkillAI = {

    // ================================================================
    //  shouldUseSkill — NPC 技能使用决策
    // ================================================================

    /**
     * NPC 是否应该使用某个主动技能
     *
     * @param {string} difficulty    - 'noob' | 'regular' | 'pro'
     * @param {object} skill         - skill 注册对象 (system, kind, level, matrix, lockChance, special, manaCost, ...)
     * @param {object} owner         - gameContext.players 中的 owner 对象
     * @param {object} ctx           - gameContext { phase, pot, players, board }
     * @param {Array}  pendingForces - skillSystem.pendingForces
     * @param {object} mana          - { current, max }
     * @returns {boolean}
     */
    shouldUseSkill(difficulty, skill, owner, ctx, pendingForces, mana) {
      ctx = ctx && typeof ctx === 'object' ? ctx : {};
      if (!Array.isArray(ctx.players)) ctx = Object.assign({}, ctx, { players: [] });
      pendingForces = Array.isArray(pendingForces) ? pendingForces : [];
      owner = owner || {};
      mana = mana || {};
      var director = global.NpcRoleDirector || NpcRoleDirector;
      return director.shouldUseSkill({
        difficulty: difficulty,
        skill: skill,
        owner: owner,
        ctx: ctx,
        pendingForces: pendingForces,
        mana: mana
      }, function(roleCtx) {
        return SkillAI._shouldUseSkillBase(
          roleCtx.difficulty,
          roleCtx.skill,
          roleCtx.owner,
          roleCtx.ctx,
          roleCtx.pendingForces,
          roleCtx.mana
        );
      });
    },

    _shouldUseSkillBase(difficulty, skill, owner, ctx, pendingForces, mana) {
      if (!skill) return false;
      ctx = ctx && typeof ctx === 'object' ? ctx : {};
      if (!Array.isArray(ctx.players)) ctx = Object.assign({}, ctx, { players: [] });
      pendingForces = Array.isArray(pendingForces) ? pendingForces : [];
      owner = owner || {};
      mana = mana || {};
      difficulty = normalizeSkillAiDifficulty(difficulty);
      // Cota / Kuzuha 的这些技能当前不交给通用 AI 主动驱动
      if (skill.effect === 'deal_card')        return false;
      if (skill.effect === 'gather_or_spread') return false;
      if (skill.effect === 'house_edge')       return false;
      if (skill.effect === 'debt_call')        return false;

      // river 后不会再发牌，fortune/curse 等改牌收益都会白白浪费。
      // 这里只保留信息技能，供最终下注决策使用。
      if (ctx.phase === 'river') {
        if (!RIVER_INFO_SKILL_EFFECTS[skill.effect]) return false;
      }

      if (!SkillAI._passesSkillEconomyGate(difficulty, skill, owner, ctx, pendingForces, mana)) {
        return false;
      }

      // --- 专属技能特殊决策 ---
      if (skill.effect === 'cooler')       return SkillAI._decideCooler(difficulty, skill, owner, ctx, mana);
      if (skill.effect === 'royal_decree') return SkillAI._decideExclusive(difficulty, skill, owner, ctx, mana);
      if (skill.effect === 'clairvoyance') return SkillAI._decideClairvoyance(difficulty, skill, owner, ctx, mana);
      if (skill.effect === 'skill_seal')   return SkillAI._decideSeal(difficulty, skill, owner, ctx, mana);
      if (skill.effect === 'heart_read')   return SkillAI._decideHeartRead(difficulty, skill, owner, ctx, mana);
      if (skill.effect === 'rule_rewrite') return SkillAI._decideRuleRewrite(difficulty, skill, owner, ctx, pendingForces, mana);
      if (skill.effect === 'blind_box')    return SkillAI._decideBlindBox(difficulty, skill, owner, ctx, pendingForces, mana);
      // Eulalia
      if (skill.effect === 'absolution')     return SkillAI._decideAbsolution(difficulty, skill, owner, ctx, pendingForces, mana);
      if (skill.effect === 'benediction')    return SkillAI._decideBenediction(difficulty, skill, owner, ctx, pendingForces, mana);

      switch (skill.system) {
        case 'moirai': return SkillAI._decideMoirai(difficulty, skill, owner, ctx, pendingForces, mana);
        case 'chaos':  return SkillAI._decideChaos(difficulty, skill, owner, ctx, pendingForces, mana);
        case 'psyche': return SkillAI._decidePsyche(difficulty, skill, owner, ctx, pendingForces, mana);
        case 'void':   return SkillAI._decideVoid(difficulty, skill, owner, ctx, pendingForces, mana);
        default:       return Math.random() < 0.2;
      }
    },

    // ---- Moirai (天命: fortune) ----
    // 核心逻辑：技能概率与筹码投入挂钩，投入越多越需要技能保护/提升
    _decideMoirai(difficulty, skill, owner, ctx, forces, mana) {
      const pi = PHASE_INDEX[ctx.phase] || 0;
      const pot = ctx.pot || 0;
      const commit = SkillAI._getCommitRatio(owner);

      switch (difficulty) {
        case 'noob': {
          // 本能型：有就用，不区分大小，投入多时更积极
          return Math.random() < (0.15 + commit * 0.3 + pi * 0.08);
        }
        case 'regular': {
          // 底池+投入感知：投入多或底池大时积极
          if (pi === 0) {
            if (Number(skill.level || 1) <= 1) return Math.random() < 0.15;
            if (Number(skill.level || 1) <= 2) return Math.random() < 0.08;
            return false;
          }
          if (mana && mana.current < mana.max * 0.3 && Number(skill.level || 1) > 1) return false;
          var blinds = ctx.blinds || 20;
          var potFactor = Math.min(1, pot / (blinds * 15));
          // 投入占比是主要驱动力
          return Math.random() < (0.10 + commit * 0.45 + potFactor * 0.20 + pi * 0.05);
        }
        case 'boss':
        case 'pro': {
          if (mana && mana.current < skill.manaCost * 1.5 && Number(skill.level || 1) < 4) return false;
          var strength = SkillAI._getHandStrength(owner, ctx);
          var strengthMod = strength >= 50 ? 0.15 : 0;
          if (pi === 0) {
            // preflop→flop 是最关键的选牌：基于手牌强度决定
            var levelMod = Number(skill.level || 1) <= 1 ? 0.10 : 0;
            var base = 0.12 + levelMod + commit * 0.40;
            return Math.random() < (base + strengthMod);
          }
          return Math.random() < (0.08 + commit * 0.50 + strengthMod + pi * 0.08);
        }
        default: return false;
      }
    },

    // ---- Chaos (狂厄: curse) ----
    // 核心逻辑：投入越多越需要诅咒对手来保护自己的投资
    _decideChaos(difficulty, skill, owner, ctx, forces, mana) {
      var pi = PHASE_INDEX[ctx.phase] || 0;
      var pot = ctx.pot || 0;
      var commit = SkillAI._getCommitRatio(owner);
      var plannedBoost = ctx && ctx.plannedAction === 'raise' ? 0.18
        : ctx && ctx.plannedAction === 'call' ? 0.08
          : 0;
      if (ctx && Number(ctx.plannedAmount || 0) >= Math.max(1, Number(ctx.blinds || 20)) * 3) {
        plannedBoost += 0.08;
      }

      switch (difficulty) {
        case 'noob': {
          // 本能型：投入多时更积极
          return Math.random() < (0.15 + commit * 0.25 + pi * 0.08 + plannedBoost * 0.5);
        }
        case 'regular': {
          if (pi === 0) return Math.random() < (0.08 + plannedBoost * 0.6);
          if (mana && mana.current < mana.max * 0.3 && Number(skill.level || 1) > 1) return false;
          var blinds2 = ctx.blinds || 20;
          var potFactor = Math.min(1, pot / (blinds2 * 15));
          return Math.random() < (0.10 + commit * 0.40 + potFactor * 0.20 + plannedBoost);
        }
        case 'boss':
        case 'pro': {
          if (mana && mana.current < skill.manaCost * 1.5 && Number(skill.level || 1) < 4) return false;
          var strength = SkillAI._getHandStrength(owner, ctx);
          if (strength > 80) return false; // 碾压局不浪费 mana
          if (pi === 0) {
            // preflop→flop：基于手牌强度诅咒对手
            var levelMod2 = Number(skill.level || 1) <= 1 ? 0.08 : 0;
            return Math.random() < (0.10 + levelMod2 + commit * 0.35 + plannedBoost * 0.75);
          }
          return Math.random() < (0.10 + commit * 0.45 + pi * 0.08 + plannedBoost);
        }
        default: return false;
      }
    },

    // ---- Psyche ----
    // 核心问题：什么时候反制？预防性使用还是反应性使用？
    _decidePsyche(difficulty, skill, owner, ctx, forces, mana) {
      var pi = PHASE_INDEX[ctx.phase] || 0;
      // 检测敌方 Chaos forces
      var enemyChaos = forces.filter(function(f) {
        return SkillAI._getForceSystem(f) === 'chaos' && f.ownerId !== owner.id;
      });
      var hasChaos = enemyChaos.length > 0;
      // 检测敌方 Chaos 总 power
      var chaosPower = enemyChaos.reduce(function(sum, f) { return sum + (f.power || 0); }, 0);
      var enemyFortunePower = 0;
      var enemyThreatPower = 0;
      if (forces) {
        for (var fi = 0; fi < forces.length; fi++) {
          var force = forces[fi];
          if (force.ownerId === owner.id) continue;
          enemyThreatPower += (force.power || 0);
          if (SkillAI._getForceSystem(force) === 'moirai') enemyFortunePower += (force.power || 0);
        }
      }
      var highThreat = Math.max(chaosPower, enemyFortunePower, enemyThreatPower * 0.75);
      var hasScoutingNeed = hasChaos || enemyFortunePower >= 18 || enemyThreatPower >= 28;
      var toCall = ctx.toCall || 0;
      var pot = ctx.pot || 0;
      var infoPressure = toCall > 0 && (toCall >= pot * 0.18 || toCall >= Math.max(40, owner.chips * 0.12));
      var hasRecentScout = !!(owner && owner.ai && owner.ai.scoutMemory && owner.ai.scoutMemory.some(function(entry) {
        return entry && entry.phaseSeen === ctx.phase;
      }));

      switch (difficulty) {
        case 'noob': {
          // 几乎不用：不懂反制价值，偶尔随机触发
          // 有敌方 Chaos 时稍微积极一点（本能反应）
          return Math.random() < (hasChaos ? 0.15 : 0.05);
        }
        case 'regular': {
          // 反应式：检测到敌方 Chaos 才用
          // 优先用低阶 Psyche 省 mana，高阶留给大威胁
          if (!hasScoutingNeed) return Math.random() < 0.08; // 无明显威胁时仅偶尔做信息侦查
          if (mana && mana.current < mana.max * 0.3 && Number(skill.level || 1) > 1) return false;
          // 敌方待结算威胁越大越积极
          var urgency = Math.min(1, highThreat / 30);
          if (Number(skill.level || 1) <= 1) return Math.random() < (0.5 + urgency * 0.3);
          if (Number(skill.level || 1) <= 3) return Math.random() < (0.2 + urgency * 0.5);
          return Math.random() < (highThreat >= 25 ? 0.55 : 0.15);
        }
        case 'boss':
        case 'pro': {
          // 预判式：即使没 Chaos 也会在关键轮次预防性使用
          // 优先高 level Psyche，信息+反制双重价值
          // mana 精细管理
          if (mana && mana.current < skill.manaCost * 1.2) return false;

          if (hasScoutingNeed) {
            // 有显著敌方威胁时：根据威胁等级选择对应技能
            var urgency2 = Math.min(1, highThreat / 40);
            if (Number(skill.level || 1) >= 4) return Math.random() < (highThreat >= 25 ? 0.7 : 0.2);
            if (Number(skill.level || 1) >= 2) return Math.random() < (0.3 + urgency2 * 0.4);
            return Math.random() < (0.4 + urgency2 * 0.2); // 低级技能兜底
          }

          if (infoPressure && !hasRecentScout) {
            if (Number(skill.level || 1) >= 4) return Math.random() < (difficulty === 'boss' ? 0.28 : 0.20);
            if (Number(skill.level || 1) >= 2) return Math.random() < (difficulty === 'boss' ? 0.42 : 0.30);
            return Math.random() < (difficulty === 'boss' ? 0.20 : 0.14);
          }

          if (difficulty === 'pro') {
            // pro：无明显威胁时明显克制，只在关键街低概率做信息预判
            if (pi === 1 || pi === 2 || pi === 3) {
              if (Number(skill.level || 1) >= 3) return Math.random() < 0.08;
              if (Number(skill.level || 1) >= 4) return Math.random() < 0.05;
              return Math.random() < 0.04;
            }
            if (pi === 0) {
              if (Number(skill.level || 1) >= 3) return Math.random() < 0.03;
              if (Number(skill.level || 1) >= 4) return Math.random() < 0.02;
              return false;
            }
            return false;
          }

          // boss：保留更强的预判式打法
          if (pi >= 1 && pi <= 2) {
            if (Number(skill.level || 1) >= 2) return Math.random() < 0.2;
            return Math.random() < 0.12;
          }
          if (pi === 0) {
            if (Number(skill.level || 1) >= 4) return Math.random() < 0.15;
            if (Number(skill.level || 1) >= 2) return Math.random() < 0.18;
            return Math.random() < 0.10;
          }
          return false;
        }
        default: return false;
      }
    },

    // ---- Void ----
    _decideVoid(difficulty, skill, owner, ctx, forces, mana) {
      if (skill.effect !== 'void') return false;
      if (skill.skillKey !== 'reality' && skill.skillKey !== 'insulation') return false;

      var enemyForces = forces.filter(function(f) { return f.ownerId !== owner.id && SkillAI._getForceSystem(f) !== 'void'; });
      var allyForces = forces.filter(function(f) { return f.ownerId === owner.id && SkillAI._getForceSystem(f) !== 'void'; });
      var enemyPower = enemyForces.reduce(function(s, f) { return s + Math.max(0, Number(f.effectivePower != null ? f.effectivePower : f.power || 0)); }, 0);
      var allyPower = allyForces.reduce(function(s, f) { return s + Math.max(0, Number(f.effectivePower != null ? f.effectivePower : f.power || 0)); }, 0);
      var hasHighLevelEnemy = enemyForces.some(function(f) { return Number(f.level || 1) >= 4; });

      if (skill.skillKey === 'insulation') {
        if (enemyForces.length <= 0 || enemyPower <= 0) return false;
        switch (difficulty) {
          case 'noob':
            return enemyPower >= 50 && Math.random() < 0.25;
          case 'regular':
            return enemyPower >= 35 && Math.random() < 0.45;
          case 'boss':
          case 'pro':
            return enemyPower >= 25 && Math.random() < (hasHighLevelEnemy ? 0.85 : 0.65);
          default:
            return false;
        }
      }

      var totalForces = enemyForces.length + allyForces.length;
      if (enemyPower <= allyPower) return false;

      switch (difficulty) {
        case 'noob': {
          // Reality 是整局级归零按钮，低难度几乎不会抓准时机。
          return totalForces >= 5 && enemyPower >= allyPower + 80 && Math.random() < 0.08;
        }
        case 'regular': {
          return totalForces >= 4 && enemyPower >= allyPower + 60 && Math.random() < 0.22;
        }
        case 'boss':
        case 'pro': {
          return totalForces >= 3 && enemyPower >= allyPower + 45 && Math.random() < (hasHighLevelEnemy ? 0.55 : 0.35);
        }
        default: return false;
      }
    },

    // ---- 工具函数 ----

    /**
     * 筹码投入比：已投入筹码 / 初始筹码 (0~1)
     * commit=0: 还没投入, commit=0.5: 投了一半, commit=1.0: 全押
     * 注意：totalBet 已包含 currentBet，不要重复计算
     */
    // ---- 专属技能：royal_decree（整局限1）----
    // 核心逻辑：整局只有一次，必须在关键时刻使用
    // 条件：turn/river + 高投入 或 flop + 极高投入
    _decideExclusive(difficulty, skill, owner, ctx, mana) {
      var pi = PHASE_INDEX[ctx.phase] || 0;
      var commit = SkillAI._getCommitRatio(owner);

      // river 阶段不用（选牌已结束）
      if (ctx.phase === 'river') return false;
      // preflop 不用（太早浪费）
      if (pi === 0) return false;
      // mana 不足
      if (mana && mana.current < skill.manaCost) return false;

      switch (difficulty) {
        case 'noob':
          // noob 不会战略性使用终极技能
          return Math.random() < 0.08;
        case 'regular':
          // regular 在 turn 且投入较多时可能使用
          if (pi < 2) return false;
          return Math.random() < (commit * 0.4);
        case 'boss':
        case 'pro': {
          // pro/boss 在 flop 高投入或 turn 中投入时使用
          var strength = SkillAI._getHandStrength(owner, ctx);
          // 碾压局不浪费终极技能
          if (strength > 80) return false;
          // turn 是最佳时机（还有 river 牌可影响）
          if (pi === 2) return Math.random() < (0.25 + commit * 0.45);
          // flop 需要高投入才值得
          if (pi === 1) return Math.random() < (commit > 0.3 ? 0.15 + commit * 0.3 : 0);
          return false;
        }
        default: return false;
      }
    },

    _decideCooler(difficulty, skill, owner, ctx, mana) {
      var pi = PHASE_INDEX[ctx.phase] || 0;
      if (ctx.phase === 'preflop' || ctx.phase === 'river') return false;
      if (mana && mana.current < skill.manaCost) return false;

      var skillSystem = ctx && ctx.skillSystem;
      var targets = (ctx.players || []).filter(function(p) {
        return p && p.id !== owner.id && !p.folded && p.isActive !== false;
      });
      if (!targets.length) return false;

      var hasMarkedTarget = !!(skillSystem && typeof skillSystem.hasStatusMark === 'function' && targets.some(function(target) {
        return skillSystem.hasStatusMark(target.id, 'cooler_mark');
      }));
      if (hasMarkedTarget) return false;

      var commit = SkillAI._getCommitRatio(owner);
      var strength = SkillAI._getHandStrength(owner, ctx);
      var toCall = ctx.toCall || 0;
      var pressure = toCall > 0 ? Math.min(1, toCall / Math.max(40, owner.chips * 0.18)) : 0;

      switch (difficulty) {
        case 'noob':
          return Math.random() < 0.04;
        case 'regular':
          if (pi < 1) return false;
          return Math.random() < (0.08 + commit * 0.12 + pressure * 0.10);
        case 'boss':
          return Math.random() < (0.22 + commit * 0.18 + pressure * 0.20 + (strength < 55 ? 0.10 : 0));
        case 'pro':
          return Math.random() < (0.12 + commit * 0.12 + pressure * 0.14 + (strength < 50 ? 0.05 : 0));
        default:
          return false;
      }
    },

    // ---- skill_seal（冻结令）：控制技能，冻结对手技能 2 回合 ----
    // 核心逻辑：在对手刚用过强力技能后封印最有价值，或预防性封印
    _decideSeal(difficulty, skill, owner, ctx, mana) {
      var pi = PHASE_INDEX[ctx.phase] || 0;
      // mana 不足
      if (mana && mana.current < skill.manaCost) return false;

      switch (difficulty) {
        case 'noob':
          return Math.random() < 0.05;
        case 'regular':
          if (pi === 0) return false;
          return Math.random() < 0.15;
        case 'boss':
        case 'pro': {
          // preflop 不封印（对手还没用技能）
          if (pi === 0) return false;
          // flop/turn 是封印的好时机（封住 2 回合 = 封住 turn+river）
          if (pi === 1) return Math.random() < 0.25;
          if (pi === 2) return Math.random() < 0.20;
          // river 也可以封印（防止对手 river 反击）
          if (pi === 3) return Math.random() < 0.10;
          return false;
        }
        default: return false;
      }
    },

    // ---- heart_read（读心）：信息技能 ----
    _decideHeartRead(difficulty, skill, owner, ctx, mana) {
      var pi = PHASE_INDEX[ctx.phase] || 0;
      if (mana && mana.current < skill.manaCost) return false;
      var toCall = ctx.toCall || 0;
      var pot = ctx.pot || 0;
      var infoPressure = toCall > 0 && (toCall >= pot * 0.18 || toCall >= Math.max(40, owner.chips * 0.12));
      var hasRecentScout = !!(owner && owner.ai && owner.ai.scoutMemory && owner.ai.scoutMemory.some(function(entry) {
        return entry && entry.phaseSeen === ctx.phase;
      }));

      switch (difficulty) {
        case 'noob':    return false;
        case 'regular': return pi >= 1 && Math.random() < 0.2;
        case 'pro': {
          // preflop: 读心有信息价值 + 生成少量防守 Psyche
          if (pi === 0) return Math.random() < 0.15;
          return Math.random() < 0.3;
        }
        case 'boss': {
          if (infoPressure && !hasRecentScout) {
            if (pi === 0) return Math.random() < 0.32;
            if (pi === 3) return Math.random() < 0.42;
            return Math.random() < 0.50;
          }
          if (pi === 0) return Math.random() < 0.22;
          if (pi === 3) return Math.random() < 0.26;
          return Math.random() < 0.38;
        }
        default:        return false;
      }
    },

    // ---- clairvoyance（估价眼）：建立头寸，至少需要 1 档追加耗蓝 ----
    _decideClairvoyance(difficulty, skill, owner, ctx, mana) {
      var pi = PHASE_INDEX[ctx.phase] || 0;
      if (mana && mana.current < ((skill.manaCost || 0) + 20)) return false;
      var toCall = ctx.toCall || 0;
      var pot = ctx.pot || 0;
      var infoPressure = toCall > 0 && (toCall >= pot * 0.20 || toCall >= Math.max(60, owner.chips * 0.15));
      var hasRecentScout = !!(owner && owner.ai && owner.ai.scoutMemory && owner.ai.scoutMemory.some(function(entry) {
        return entry && entry.phaseSeen === ctx.phase;
      }));

      switch (difficulty) {
        case 'noob':    return Math.random() < 0.05;
        case 'regular': return pi >= 1 && Math.random() < 0.15;
        case 'pro': {
          // preflop: 高价值信息技能，影响翻牌选择
          if (pi === 0) return Math.random() < 0.20;
          // flop/turn: 更积极
          var commit = SkillAI._getCommitRatio(owner);
          return Math.random() < (0.20 + commit * 0.30 + pi * 0.05);
        }
        case 'boss': {
          var commit2 = SkillAI._getCommitRatio(owner);
          if (infoPressure && !hasRecentScout) {
            if (pi === 0) return Math.random() < 0.20;
            if (pi === 3) return Math.random() < 0.34;
            return Math.random() < (0.28 + commit2 * 0.35 + pi * 0.05);
          }
          if (pi === 0) return Math.random() < 0.12;
          if (pi === 3) return Math.random() < 0.16;
          return Math.random() < (0.22 + commit2 * 0.32 + pi * 0.05);
        }
        default: return false;
      }
    },

    // ---- rule_rewrite（规则篡改）：纯混沌，越乱越想用 ----
    // Trixie 的性格：不图赢，图好玩。场上 force 越多越兴奋
    _decideRuleRewrite(difficulty, skill, owner, ctx, pendingForces, mana) {
      var pi = PHASE_INDEX[ctx.phase] || 0;
      if (ctx.phase === 'river') return false;
      if (mana && mana.current < skill.manaCost) return false;
      // 需要有可篡改的对象
      var forceCount = pendingForces ? pendingForces.filter(function(f) {
        return f.ownerId !== owner.id && SkillAI._getForceSystem(f) !== 'void';
      }).length : 0;
      if (forceCount === 0) return false;

      switch (difficulty) {
        case 'noob':
          // Trixie 是混沌本能——noob 模式下反而更冲动
          return Math.random() < (0.20 + forceCount * 0.10);
        case 'regular':
          if (pi === 0) return Math.random() < 0.10;
          return Math.random() < (0.15 + forceCount * 0.12 + pi * 0.05);
        case 'boss':
        case 'pro': {
          // pro/boss Trixie: 场上 force 越多越值得搅局（信息量大）
          // 但不在 preflop 浪费唯一机会
          if (pi === 0) return false;
          var strength = SkillAI._getHandStrength(owner, ctx);
          // 牌差时更想搅局（反正赢不了，不如搞事）
          var desperation = strength < 40 ? 0.15 : 0;
          return Math.random() < (0.15 + forceCount * 0.10 + desperation + pi * 0.05);
        }
        default: return false;
      }
    },

    // ---- blind_box（盲盒派对）：全场 force 洗牌 ----
    // 核心逻辑：场上 force 对自己不利时（敌方 fortune 多 / 己方 curse 多），用来翻盘
    _decideBlindBox(difficulty, skill, owner, ctx, pendingForces, mana) {
      var pi = PHASE_INDEX[ctx.phase] || 0;
      if (ctx.phase === 'river') return false;
      if (mana && mana.current < skill.manaCost) return false;
      // 需要有足够的 force 才值得打碎重组
      var shuffleableCount = pendingForces ? pendingForces.filter(function(f) {
        return SkillAI._getForceSystem(f) !== 'void';
      }).length : 0;
      if (shuffleableCount < 2) return false; // 少于2个没意义

      // 计算局势：敌方 fortune 和己方被 curse 的数量
      var enemyFortune = 0, myCurse = 0;
      if (pendingForces) {
        for (var i = 0; i < pendingForces.length; i++) {
          var f = pendingForces[i];
          if (f.ownerId !== owner.id && f.type === 'fortune') enemyFortune++;
          if (f.type === 'curse' && f.targetId === owner.id) myCurse++;
        }
      }
      var disadvantage = enemyFortune + myCurse;

      switch (difficulty) {
        case 'noob':
          // 混沌本能：force 多就想搅
          return Math.random() < (0.10 + shuffleableCount * 0.08);
        case 'regular':
          if (pi === 0) return false;
          return Math.random() < (0.08 + disadvantage * 0.12 + shuffleableCount * 0.05);
        case 'boss':
        case 'pro': {
          if (pi === 0) return Math.random() < 0.05;
          // 劣势越大越值得洗牌（反正现在的布局对自己不利）
          return Math.random() < (0.08 + disadvantage * 0.15 + shuffleableCount * 0.04 + pi * 0.03);
        }
        default: return false;
      }
    },

    // ---- absolution（赦免）：Eulalia 整局限1 — 开启三街承灾合同 ----
    // 核心逻辑：场上 curse 压力越高，越值得尽早开出并把后续两街也纳入承灾窗口
    _decideAbsolution(difficulty, skill, owner, ctx, pendingForces, mana) {
      if (ctx.phase === 'river') return false;
      if (mana && mana.current < skill.manaCost) return false;
      var selfCurseCount = 0;
      if (pendingForces) {
        for (var i = 0; i < pendingForces.length; i++) {
          var f = pendingForces[i];
          if (f.type === 'curse' && f.targetId === owner.id) {
            selfCurseCount++;
          }
        }
      }
      switch (difficulty) {
        case 'noob': return selfCurseCount >= 1 && Math.random() < 0.25;
        case 'regular': return selfCurseCount >= 1 && Math.random() < (0.20 + selfCurseCount * 0.15);
        case 'boss':
        case 'pro':
          // 2+curse时几乎必用，1curse时概率使用
          if (selfCurseCount >= 2) return Math.random() < 0.85;
          if (selfCurseCount >= 1) return Math.random() < 0.45;
          return false; // 无curse不浪费整局限1
        default: return false;
      }
    },

    // ---- benediction（祝福）：Eulalia CD1 — 对非自身目标施加 fortune，并吸取相关 curse 记为承灾 ----
    // 核心逻辑：后续需要按新版 Runtime 目标/吸取语义重做；当前保留 AI 骨架，避免继续扩散旧接口
    _decideBenediction(difficulty, skill, owner, ctx, pendingForces, mana) {
      var pi = PHASE_INDEX[ctx.phase] || 0;
      if (ctx.phase === 'river') return false;
      if (mana && mana.current < skill.manaCost) return false;
      var commit = SkillAI._getCommitRatio(owner);
      var hasCurseOnSelf = false;
      if (pendingForces) {
        for (var i = 0; i < pendingForces.length; i++) {
          var f = pendingForces[i];
          if (f.type === 'curse' && f.targetId === owner.id) {
            hasCurseOnSelf = true;
            break;
          }
        }
      }
      var curseBonus = hasCurseOnSelf ? 0.25 : 0;
      switch (difficulty) {
        case 'noob': return Math.random() < (0.12 + curseBonus);
        case 'regular':
          if (pi === 0) return false;
          return Math.random() < (0.10 + commit * 0.25 + curseBonus + pi * 0.04);
        case 'boss':
        case 'pro':
          if (pi === 0) return Math.random() < (0.06 + curseBonus);
          return Math.random() < (0.12 + commit * 0.30 + curseBonus + pi * 0.05);
        default: return false;
      }
    },

    // ---- house_edge（抽水）：Kuzuha 整局限1 — fortune(P50)+群体curse(P15) ----
    // 核心逻辑：攻防一体的强技能，投入较大时或中后期使用
    _decideHouseEdge(difficulty, skill, owner, ctx, pendingForces, mana) {
      var pi = PHASE_INDEX[ctx.phase] || 0;
      if (ctx.phase === 'river') return false;
      if (mana && mana.current < skill.manaCost) return false;
      var commit = SkillAI._getCommitRatio(owner);
      switch (difficulty) {
        case 'noob': return Math.random() < 0.18;
        case 'regular':
          if (pi === 0) return false;
          return Math.random() < (0.12 + commit * 0.30 + pi * 0.08);
        case 'boss':
        case 'pro':
          // 整局限1: flop/turn 中高投入时使用
          if (pi === 0) return Math.random() < 0.06;
          return Math.random() < (0.15 + commit * 0.35 + pi * 0.08);
        default: return false;
      }
    },

    // ---- debt_call（催收）：Kuzuha CD3 — debt rot 催收（Runtime 接入后实现） ----
    // 核心逻辑：敌方fortune多时最有价值（相当于反转局势），己方fortune少时才用
    _decideTableFlip(difficulty, skill, owner, ctx, pendingForces, mana) {
      var pi = PHASE_INDEX[ctx.phase] || 0;
      if (ctx.phase === 'river') return false;
      if (mana && mana.current < skill.manaCost) return false;
      var enemyFortune = 0, myFortune = 0;
      if (pendingForces) {
        for (var i = 0; i < pendingForces.length; i++) {
          var f = pendingForces[i];
          if (f.type === 'fortune' && f.ownerId !== owner.id) enemyFortune++;
          if (f.type === 'fortune' && f.ownerId === owner.id) myFortune++;
        }
      }
      // 只有敌方fortune > 己方fortune时才值得掀桌
      var advantage = enemyFortune - myFortune;
      switch (difficulty) {
        case 'noob':
          return enemyFortune >= 1 && Math.random() < (0.12 + enemyFortune * 0.10);
        case 'regular':
          if (pi === 0) return false;
          if (advantage <= 0) return false;
          return Math.random() < (0.10 + advantage * 0.18);
        case 'boss':
        case 'pro':
          if (pi === 0) return false;
          if (advantage <= 0 && enemyFortune < 2) return false;
          return Math.random() < (0.10 + advantage * 0.20 + enemyFortune * 0.08);
        default: return false;
      }
    },

    _getCommitRatio(owner) {
      var invested = Math.max(owner.totalBet || 0, owner.currentBet || 0);
      var startStack = invested + (owner.chips || 0);
      return startStack > 0 ? Math.min(1, invested / startStack) : 0;
    },

    _getSkillEconomyState(skill, owner, ctx, pendingForces, mana) {
      var bb = Math.max(1, Number(ctx && ctx.blinds || 20));
      var plannedAmount = Math.max(0, Number(ctx && ctx.plannedAmount || 0));
      var pot = Math.max(0, Number(ctx && ctx.pot || 0)) + plannedAmount;
      var toCall = Math.max(0, Number(ctx && ctx.toCall || 0));
      var commit = SkillAI._getCommitRatio(owner);
      var ownerLiveStack = Math.max(1, Number((owner && owner.chips || 0) + (owner && owner.currentBet || 0)));
      var effectiveStack = ownerLiveStack;
      var players = ctx && Array.isArray(ctx.players) ? ctx.players : [];
      for (var i = 0; i < players.length; i++) {
        var player = players[i];
        if (!player || player.id === owner.id || player.folded || player.isActive === false) continue;
        var oppLiveStack = Math.max(1, Number((player.chips || 0) + (player.currentBet || 0)));
        effectiveStack = Math.min(effectiveStack, oppLiveStack);
      }
      effectiveStack = Math.max(1, effectiveStack);
      var potBb = pot / bb;
      var pressure = Math.max(
        commit,
        pot / effectiveStack,
        toCall / ownerLiveStack,
        plannedAmount / ownerLiveStack
      );
      var hostilePressure = 0;
      if (Array.isArray(pendingForces)) {
        for (var fi = 0; fi < pendingForces.length; fi++) {
          var force = pendingForces[fi];
          if (!force || force.ownerId === owner.id) continue;
          if (force.type === 'curse' && force.targetId === owner.id) {
            hostilePressure += Math.max(0, Number(force.power || 0));
          } else if (SkillAI._getForceSystem(force) === 'moirai' && Number(force.power || 0) >= 20) {
            hostilePressure += Math.max(0, Number(force.power || 0)) * 0.5;
          }
        }
      }
      return {
        bb: bb,
        pot: pot,
        potBb: potBb,
        toCall: toCall,
        plannedAmount: plannedAmount,
        commit: commit,
        effectiveStack: effectiveStack,
        pressure: pressure,
        hostilePressure: hostilePressure,
        manaRatio: mana && mana.max ? Math.max(0, Number(mana.current || 0)) / Math.max(1, Number(mana.max || 1)) : 1
      };
    },

    _passesSkillEconomyGate(difficulty, skill, owner, ctx, pendingForces, mana) {
      if (!skill || !ctx || skill.activation !== 'active') return true;
      var state = SkillAI._getSkillEconomyState(skill, owner, ctx, pendingForces, mana);
      var isInfoSkill = !!INFO_SKILL_EFFECTS[skill.effect];
      var isUltimate = Number(skill.level || 1) >= 4 || !!skill.usesPerGame || (skill.manaCost || 0) >= 25;
      var isMajor = !isUltimate && (((skill.manaCost || 0) >= 15) || Number(skill.level || 1) >= 2);

      if (state.hostilePressure >= 30) return true;
      if (ctx.plannedAction === 'raise' && state.plannedAmount >= state.bb * 2) return true;
      if (ctx.plannedAction === 'call' && state.toCall >= state.bb && state.potBb >= 3) return true;

      // 小锅且无人给压力时，不要在免费街面里白白砸高费技能。
      if (!isInfoSkill && state.toCall <= 0 && state.potBb < 10 && state.pressure < 0.12) {
        if (isUltimate || isMajor) return false;
      }

      if (isInfoSkill) {
        if (ctx.phase === 'preflop') {
          return state.potBb >= 5 || state.toCall >= state.bb * 2 || state.pressure >= 0.10;
        }
        return state.potBb >= 6 || state.toCall >= state.bb * 2 || state.pressure >= 0.12;
      }

      if (isUltimate) {
        if (ctx.phase === 'preflop') return (state.potBb >= 12 && state.pressure >= 0.12) || state.pressure >= 0.24;
        if (ctx.phase === 'flop') return (state.potBb >= 10 && state.pressure >= 0.12) || state.pressure >= 0.22;
        if (ctx.phase === 'turn') return (state.potBb >= 9 && state.pressure >= 0.10) || state.pressure >= 0.18;
        return (state.potBb >= 7 && state.pressure >= 0.08) || state.pressure >= 0.15;
      }

      if (isMajor) {
        if (ctx.phase === 'preflop') return (state.potBb >= 7 && state.pressure >= 0.08) || state.pressure >= 0.16;
        if (ctx.phase === 'flop') return (state.potBb >= 8 && state.pressure >= 0.08) || state.pressure >= 0.14;
        if (ctx.phase === 'turn') return (state.potBb >= 6 && state.pressure >= 0.06) || state.pressure >= 0.12;
        if (ctx.phase === 'river') return (state.potBb >= 5 && state.pressure >= 0.05) || state.pressure >= 0.10;
      }

      if ((skill.manaCost || 0) >= 10 && state.manaRatio < 0.45 && state.potBb < 4 && state.pressure < 0.08) {
        return false;
      }
      return true;
    },

    _getForceSystem(force) {
      if (!force) return null;
      if (force.system) return force.system;
      if (force.type === 'fortune') return 'moirai';
      if (force.type === 'curse') return 'chaos';
      if (force.type === 'psyche') return 'psyche';
      if (force.type === 'void') return 'void';
      return null;
    },

    /**
     * 获取 NPC 当前手牌强度 (0-100)
     * preflop 用 preflopStrength，flop+ 用 pokersolver
     */
    _getHandStrength(owner, ctx) {
      if (!owner.cards || owner.cards.length < 2) return 30; // 默认中等
      var board = ctx.board || [];
      if (board.length === 0) {
        return evaluatePreflopStrength(owner.cards);
      }
      var result = evaluateHandStrength(owner.cards, board);
      return HAND_STRENGTH_MAP[result.rank] || 30;
    },

    // ================================================================
    //  pickCurseTarget — Curse 选目标
    // ================================================================

    /**
     * 为 Curse 选择最佳目标
     *
     * 策略由 difficulty 决定：
     *   noob    → Chip Leader:      筹码最多的对手 + 随机性
     *   regular → Pot Commitment:   诅咒投入底池最多的对手（沉没成本最大）
     *   pro     → Threat Assessment: 综合下注量+筹码量评估威胁度
     *
     * @param {string} difficulty - 'noob' | 'regular' | 'pro'
     * @param {number} casterId  - 施法者 ID
     * @param {Array}  players   - gameContext.players
     * @returns {number} targetId
     */
    pickCurseTarget(difficulty, casterId, players) {
      difficulty = normalizeSkillAiDifficulty(difficulty);
      if (!players || !players.length) {
        return casterId === 0 ? 1 : 0;
      }

      // all-in 玩家仍是有效目标（chips===0 但未弃牌）
      var candidates = players.filter(function(p) {
        return p.id !== casterId && !p.folded && p.isActive !== false;
      });

      if (candidates.length === 0) {
        // 无有效目标时，选任意非施法者
        var fallback = players.filter(function(p) { return p.id !== casterId && p.isActive !== false; });
        return fallback.length > 0 ? fallback[0].id : (casterId === 0 ? 1 : 0);
      }

      switch (difficulty) {
        case 'boss':
        case 'pro':     return SkillAI._targetByThreat(candidates);
        case 'regular': return SkillAI._targetByPotCommitment(candidates);
        default:        return SkillAI._targetByChips(candidates);
      }
    },

    /**
     * Chip Leader + Random — 筹码最多的对手，但有 30% 随机
     * 适用：noob AI（直觉型，谁钱多打谁，但不精准）
     */
    _targetByChips(candidates) {
      // 30% 纯随机
      if (Math.random() < 0.3) {
        return candidates[Math.floor(Math.random() * candidates.length)].id;
      }
      // 70% 选筹码最多的
      candidates.sort(function(a, b) { return (b.chips || 0) - (a.chips || 0); });
      return candidates[0].id;
    },

    /**
     * Pot Commitment — 诅咒投入底池最多的对手（加权随机）
     * 适用：regular AI
     * 逻辑：投入越多权重越高，但不是100%确定性
     */
    _targetByPotCommitment(candidates) {
      var weights = candidates.map(function(p) {
        return Math.max(1, (p.totalBet || 0) + (p.currentBet || 0) + (p.chips || 0) * 0.1);
      });
      return SkillAI._weightedPick(candidates, weights);
    },

    /**
     * Threat Assessment — 综合威胁度评估（加权随机）
     * 适用：pro AI（"拥有魔力的高手能感知势头"）
     * 逻辑：威胁分 = 下注量×0.7 + 筹码量×0.3，按威胁分加权随机
     */
    _targetByThreat(candidates) {
      var maxInvested = Math.max(1, Math.max.apply(null, candidates.map(function(p) { return (p.totalBet || 0) + (p.currentBet || 0); })));
      var maxChips = Math.max(1, Math.max.apply(null, candidates.map(function(p) { return p.chips || 0; })));

      var weights = candidates.map(function(p) {
        var invested = (p.totalBet || 0) + (p.currentBet || 0);
        return Math.max(0.1, (invested / maxInvested) * 0.7 + ((p.chips || 0) / maxChips) * 0.3);
      });
      return SkillAI._weightedPick(candidates, weights);
    },

    /**
     * 加权随机选择 — 权重越高被选中概率越大，但不是100%确定
     */
    _weightedPick(candidates, weights) {
      var total = weights.reduce(function(s, w) { return s + w; }, 0);
      var r = Math.random() * total;
      var cumulative = 0;
      for (var i = 0; i < candidates.length; i++) {
        cumulative += weights[i];
        if (r <= cumulative) return candidates[i].id;
      }
      return candidates[candidates.length - 1].id;
    }
  };


  register('SkillAI', SkillAI);
})(typeof window !== 'undefined' ? window : global);
