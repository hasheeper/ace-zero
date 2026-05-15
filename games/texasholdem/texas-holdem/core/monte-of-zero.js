/* global Hand */

/**
 * Core Module: MonteOfZero
 * 角色：命运选牌与 force 结算引擎。
 *
 * 职责：
 * - 接收技能系统与 trait 系统整理后的 forces
 * - 计算候选牌 destiny score，并选出本街命运牌
 * - 处理 fortune / curse / psyche / void 的主要对抗与结算
 * - 接受外部修正器，对选牌倾向进行角色化扩展
 *
 * 暴露：
 * - `window.MonteOfZero`
 *
 * 边界：
 * - 不负责技能注册、mana 管理、角色 AI
 * - 只消费输入的 forces 和上下文，输出选牌结果
 */

(function (global) {
  'use strict';

  // ========== 常量 ==========
  const SUIT_MAP = { 0: 's', 1: 'h', 2: 'c', 3: 'd' };
  const RANK_MAP = { 1: 'A', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: 'T', 11: 'J', 12: 'Q', 13: 'K' };

  // pokersolver hand.rank: 9=SF, 8=4K, 7=FH, 6=Flush, 5=Straight, 4=3K, 3=2P, 2=1P, 1=HC
  // 权重设计原则：顺子/同花的加分必须足够大，能在 destinyScore 中产生可见影响
  // destinyScore 典型范围: 5~15，所以 style 需要在 2~8 的量级才能真正影响选牌
  const STYLE_WEIGHTS = {
    9: 25,   // Straight Flush  - 极致戏剧性
    8: 6,    // Four of a Kind  - 强但视觉单调
    7: 8,    // Full House      - 经典赌神牌型
    6: 15,   // Flush           - 同花，视觉冲击强
    5: 12,   // Straight        - 顺子，叙事感强
    4: 3,    // Three of a Kind - 微弱加分
    3: 0,    // Two Pair        - 基线
    2: -3,   // One Pair        - 惩罚，避免单调
    1: 0     // High Card       - 基线
  };

  // ========== 工具函数 ==========
  function cardToSolverString(card) {
    if (!card) return '';
    return RANK_MAP[card.rank] + SUIT_MAP[card.suit];
  }

  // ========== MonteOfZero 类 ==========
  class MonteOfZero {
    constructor() {
      // 上一次筛选的元数据
      this.lastSelectionMeta = null;
      this._lastPsycheEvents = [];
      this._lastResolvedForces = [];

      // 日志回调
      this.onLog = null;

      // 是否启用
      this.enabled = true;

      // 调试模式
      this.debugMode = false;
      this.debugTimeline = [];  // 每次 selectCard 的完整时间线

      // 时髦命运 (Style Bias)
      this.styleBias = true;           // 总开关
      this.styleIntensity = 1.0;       // 强度倍率 (0~2)
      this._handHistory = [];          // 近期赢家牌型记录 [{rank, name}]
      this._historyMaxLen = 5;         // 记录最近N手

      // 战斗公式钩子（属性面板加成 + 特质 + Void 减伤）
      // 由外部注入 CombatFormula 实例
      this.combatFormula = null;
    }

    // ========== 核心：权重叠加选牌 ==========

    /**
     * 从牌堆中选择一张牌（核心方法 v3 — 纯引擎）
     *
     * @param {Array} deckCards - 牌堆中剩余的牌
     * @param {Array} currentBoard - 当前公共牌
     * @param {Array} players - 玩家数组 [{ id, cards, folded }]
     * @param {Array} forces - 当前生效的力列表（由 SkillSystem 提供）
     * @param {object} options - { rinoPlayerId: 0 }
     * @returns {object} { card, meta }
     */
    selectCard(deckCards, currentBoard, players, forces, options) {
      options = options || {};
      const rinoPlayerId = options.rinoPlayerId != null ? options.rinoPlayerId : 0;
      this._heroId = rinoPlayerId; // 存储供内部方法使用
      this._players = players; // 存储供 meta 构建使用
      this._skillSystem = options.skillSystem || null;
      if (this.combatFormula) this.combatFormula.heroId = rinoPlayerId;

      // ---- 调试时间线 ----
      if (this.debugMode) {
        this.debugTimeline = [];
        this._debugPush('ROUND_START', {
          phase: options.phase || '?',
          deckRemaining: deckCards.length,
          boardCards: currentBoard.length,
          inputForces: forces.map(f => ({
            owner: f.ownerName || f.ownerId,
            type: f.type, system: f.system, level: f.level,
            power: f.power, activation: f.activation, skillKey: f.skillKey
          }))
        });
      }

      if (!this.enabled) {
        if (this.debugMode) this._debugPush('ENGINE_DISABLED', { result: 'random' });
        return this._randomSelect(deckCards);
      }

      // ---- 属性面板加成 + 特质注入（CombatFormula 钩子） ----
      let enhancedForces = forces;
      if (this.combatFormula) {
        enhancedForces = this.combatFormula.enhanceForces(forces, { players: players });
        this._log('COMBAT_ENHANCE', {
          enhanced: enhancedForces.filter(f => f._attrBonus !== undefined).map(f => ({
            owner: f.ownerName || f.ownerId,
            type: f.type,
            rawPower: forces.find(o => o.ownerId === f.ownerId && o.type === f.type)?.power,
            enhancedPower: f.power,
            system: f._primaryAttr,
            counter: f._counterMult,
            assetBonus: f._assetBonus || null
          }))
        });
      }

      // 过滤掉非发牌力，保留 meta 力（psyche / void / role info）
      const dealForces = enhancedForces.filter(f =>
        f.type === 'fortune' || f.type === 'curse' || f.type === 'backlash'
      );
      const metaForces = enhancedForces.filter(f =>
        f.type === 'psyche' || f.type === 'void' || f.type === 'heart_read'
      );

      // 如果没有任何力在生效，纯随机
      if (dealForces.length === 0 && metaForces.length === 0) {
        return this._randomSelect(deckCards);
      }
      if (dealForces.length === 0) {
        return this._randomSelect(deckCards);
      }

      // ---- 生成所有平行宇宙 ----
      const activePlayers = players.filter(p => !p.folded && p.cards && p.cards.length >= 2);
      const universes = this._generateUniverses(deckCards, currentBoard, activePlayers);

      if (universes.length === 0) {
        return this._randomSelect(deckCards);
      }

      if (this.debugMode) {
        this._debugPush('UNIVERSES', { count: universes.length });
      }

      // ---- 权重叠加：为每个宇宙计算命运分 ----
      // 传入 dealForces + metaForces，opposition 需要看到 meta 力
      this._calculateDestinyScores(universes, dealForces.concat(metaForces));

      // ---- 选牌策略：始终使用加权概率 ----
      const sorted = [...universes].sort((a, b) => b.destinyScore - a.destinyScore);

      // 计算每张牌的概率（softmax）
      const temperature = 1.0;
      const scores = universes.map(u => u.destinyScore);
      const maxScore = Math.max(...scores);
      const weights = universes.map(u => Math.exp((u.destinyScore - maxScore) / temperature));
      const totalWeight = weights.reduce((sum, w) => sum + w, 0);
      // 为 sorted 数组计算概率
      const sortedProbs = sorted.map(u => {
        const idx = universes.indexOf(u);
        return weights[idx] / totalWeight;
      });

      let selectedUniverse = this._selectByWeightedRandom(universes);

      // 找出选中牌在排序中的位置
      const selectedRank = sorted.findIndex(u => u.card === selectedUniverse.card);

      // 构建 top candidates 列表（前5名 + 选中的牌如果不在前5）
      const topN = 5;
      const topCandidates = sorted.slice(0, topN).map((u, i) => ({
        card: cardToSolverString(u.card),
        score: u.destinyScore,
        prob: Math.round(sortedProbs[i] * 1000) / 10,
        selected: u.card === selectedUniverse.card,
        rinoWins: u.winnerIds.includes(rinoPlayerId)
      }));
      // 如果选中的牌不在 top5，追加到末尾
      if (selectedRank >= topN) {
        const selIdx = universes.indexOf(selectedUniverse);
        topCandidates.push({
          card: cardToSolverString(selectedUniverse.card),
          score: selectedUniverse.destinyScore,
          prob: Math.round((weights[selIdx] / totalWeight) * 1000) / 10,
          selected: true,
          rank: selectedRank + 1,
          rinoWins: selectedUniverse.winnerIds.includes(rinoPlayerId)
        });
      }

      if (this.debugMode) {
        this._debugPush('CARD_SELECTED', {
          card: cardToSolverString(selectedUniverse.card),
          destinyScore: selectedUniverse.destinyScore,
          styleBonus: selectedUniverse.styleBonus || 0,
          breakdown: selectedUniverse.forceBreakdown,
          rank: selectedRank + 1,
          totalCandidates: universes.length,
          top3: sorted.slice(0, 3).map(u => ({
            card: cardToSolverString(u.card), score: u.destinyScore,
            style: u.styleBonus || 0, breakdown: u.forceBreakdown
          })),
          bottom3: sorted.slice(-3).map(u => ({
            card: cardToSolverString(u.card), score: u.destinyScore
          }))
        });
      }

      // ---- 控制台诊断日志 ----
      console.log('[MoZ] ═══ 命运选牌 ═══');
      console.log('[MoZ] heroId=' + rinoPlayerId + ', 候选牌=' + universes.length);
      // 力量对抗结果
      var rfLog = (this._lastResolvedForces || []).filter(function(f) { return !f._suppressed; });
      console.log('[MoZ] 生效力量:', rfLog.map(function(f) {
        var extras = [];
        if (f._traitTag) extras.push(f._traitTag);
        if (f._assetBonus) {
          var assetSources = Array.isArray(f._assetBonus.sources)
            ? f._assetBonus.sources.map(function(source) { return source && source.cardId; }).filter(Boolean)
            : [];
          extras.push('asset +' + Math.round(Number(f._assetBonus.pctDelta || 0) * 100) + '%' + (assetSources.length ? ':' + assetSources.join(',') : ''));
        }
        if (f._nullArmorAbsorbed > 0) extras.push('抹除 ' + f._nullArmorAbsorbed);
        if (f._nullArmorManaGain > 0) extras.push('回蓝 ' + f._nullArmorManaGain);
        var extraText = extras.length ? ' [' + extras.join(' / ') + ']' : '';
        var label = f.type;
        var ownerLabel = f.ownerName || f.ownerId;
        var recipientLabel = ownerLabel;
        var sourceText = '';
        if (f.type === 'curse' && f.targetId != null) {
          recipientLabel = f.targetName || f.targetId || recipientLabel;
          if (recipientLabel !== ownerLabel) sourceText = ' FROM ' + ownerLabel;
        } else if (f.type === 'fortune') {
          var fortuneTarget = f.targetName || f.targetId || null;
          var protectTarget = f.protectName || f.protectId || null;
          if (fortuneTarget != null) recipientLabel = fortuneTarget;
          else if (protectTarget != null) recipientLabel = protectTarget;
          if (recipientLabel !== ownerLabel) sourceText = ' FROM ' + ownerLabel;
        }
        if (f._eulaliaRuntimeForce === 'burst') {
          label = '爆账';
          recipientLabel = f.targetName || f.targetId || recipientLabel;
          sourceText = recipientLabel !== ownerLabel ? ' FROM ' + ownerLabel : '';
        } else if (f._eulaliaRuntimeForce === 'street_burden') {
          label = '承灾';
        }
        return recipientLabel + ' ' + label + sourceText + ' P=' + f.power + '→EP=' + f.effectivePower + extraText;
      }).join(' | '));
      // Top 5 + 选中牌
      console.log('[MoZ] Top候选:', topCandidates.map(function(c) {
        return c.card + ' S=' + c.score + (c.rinoWins ? '✓' : '✗') + (c.selected ? ' ★' : '');
      }).join(' | '));
      console.log('[MoZ] 选中: ' + cardToSolverString(selectedUniverse.card) +
        ' (rank #' + (selectedRank + 1) + '/' + universes.length + ')' +
        ' heroWins=' + selectedUniverse.winnerIds.includes(rinoPlayerId) +
        ' score=' + selectedUniverse.destinyScore);
      // 选中牌的各玩家得分
      var scoreEntries = [];
      for (var sid in selectedUniverse.scores) {
        scoreEntries.push('p' + sid + '=' + Math.round(selectedUniverse.scores[sid]));
      }
      console.log('[MoZ] 各玩家分:', scoreEntries.join(', '),
        '| 牌型:', JSON.stringify(selectedUniverse.handDescriptions));

      // ---- 记录赢家牌型（反单调系统） ----
      const fortuneForces = dealForces.filter(f => f.type === 'fortune');
      const fortuneOwnerIds = [...new Set(fortuneForces.map(f => f.ownerId))];
      this._recordHandResult(selectedUniverse, fortuneOwnerIds);

      // ---- 保存元数据 ----
      // 使用对抗后的 resolvedForces（包含 _suppressed 标记 + 转化的 fortune）
      const resolvedForMeta = this._lastResolvedForces || [];
      this.lastSelectionMeta = {
        activeForces: resolvedForMeta.map(f => {
          // 查找目标名称（优先从 players 数组查，保证准确）
          var tName = null;
          if (f.targetId != null) {
            var tPlayer = (this._players || []).find(p => p.id === f.targetId);
            tName = tPlayer ? tPlayer.name : (f.ownerName || ('ID:' + f.targetId));
          }
          return {
            ownerId: f.ownerId,
            owner: f.ownerName || f.ownerId,
            targetId: f.targetId != null ? f.targetId : null,
            targetName: tName,
            type: f.type,
            system: f.system,
            level: f.level,
            power: f.power,
            effectivePower: f.effectivePower,
            skillKey: f.skillKey || null,
            source: f.source || null,
            assetBonus: f._assetBonus || null,
            eulaliaRuntimeForce: f._eulaliaRuntimeForce || null,
            traitTag: f._traitTag || null,
            protectId: f.protectId != null ? f.protectId : null,
            suppressed: !!f._suppressed,
            converted: !!f._converted
          };
        }),
        psycheEvents: this._lastPsycheEvents || [],
        totalUniverses: universes.length,
        selectedCard: cardToSolverString(selectedUniverse.card),
        selectedRank: selectedRank + 1,
        destinyScore: selectedUniverse.destinyScore,
        styleBonus: selectedUniverse.styleBonus || 0,
        forceBreakdown: selectedUniverse.forceBreakdown,
        topCandidates: topCandidates,
        winnerIds: selectedUniverse.winnerIds,
        scores: selectedUniverse.scores,
        handDescriptions: selectedUniverse.handDescriptions,
        dramaticShift: this._calculateDramaticShift(universes, selectedUniverse, rinoPlayerId),
        debugTimeline: this.debugMode ? [...this.debugTimeline] : null
      };

      this._log('DESTINY_SELECT', {
        card: this.lastSelectionMeta.selectedCard,
        destinyScore: selectedUniverse.destinyScore,
        styleBonus: selectedUniverse.styleBonus || 0,
        forces: this.lastSelectionMeta.activeForces,
        breakdown: selectedUniverse.forceBreakdown
      });

      return {
        card: selectedUniverse.card,
        meta: this.lastSelectionMeta
      };
    }

    // ========== 先知能力（纯计算，不管技能消耗） ==========

    /**
     * 预览命运的多条路径
     * @param {Array} deckCards
     * @param {Array} currentBoard
     * @param {Array} players
     * @param {Array} forces - 当前力列表
     * @param {number} rinoPlayerId
     * @returns {Array} [{ card, label, score, rinoScore }]
     */
    foresight(deckCards, currentBoard, players, forces, rinoPlayerId) {
      const activePlayers = players.filter(p => !p.folded && p.cards && p.cards.length >= 2);
      const universes = this._generateUniverses(deckCards, currentBoard, activePlayers);

      if (universes.length === 0) return [];

      const dealForces = (forces || []).filter(f =>
        f.type === 'fortune' || f.type === 'curse' || f.type === 'backlash'
      );

      if (dealForces.length > 0) {
        this._calculateDestinyScores(universes, dealForces);
      } else {
        universes.forEach(u => { u.destinyScore = u.scores[rinoPlayerId] || 0; });
      }

      const sorted = [...universes].sort((a, b) => b.destinyScore - a.destinyScore);

      const best = sorted[0];
      const mid = sorted[Math.floor(sorted.length / 2)];
      const worst = sorted[sorted.length - 1];

      return [
        { card: cardToSolverString(best.card), label: 'BEST', score: best.destinyScore, rinoScore: best.scores[rinoPlayerId] },
        { card: cardToSolverString(mid.card), label: 'NEUTRAL', score: mid.destinyScore, rinoScore: mid.scores[rinoPlayerId] },
        { card: cardToSolverString(worst.card), label: 'WORST', score: worst.destinyScore, rinoScore: worst.scores[rinoPlayerId] }
      ];
    }

    // ========== 命运分计算 ==========

    /**
     * 为每个宇宙计算命运分（权重叠加核心 v2 — 力量对抗）
     *
     * 力量对抗规则：
     *   1. 被动技能是微弱底色(power = level×3)，主动技能是决定性力量(power = level×10)
     *   2. 同类型力量(fortune vs fortune)来自不同阵营时互相抵消
     *   3. 主动力量压制被动力量：主动fortune可以削弱敌方被动fortune
     *   4. 等级差产生额外优势：高等级主动技能碾压低等级
     */
    _calculateDestinyScores(universes, forces) {
      // ---- 预处理：力量对抗 ----
      const resolvedForces = this.resolveForceOpposition(forces, {
        heroId: this._heroId,
        players: this._players,
        skillSystem: this._skillSystem
      });
      this._lastResolvedForces = resolvedForces; // 供 meta 输出使用

      // ---- 提取命运受益者信息（用于时髦分） ----
      const fortuneForces = resolvedForces.filter(f => f.type === 'fortune' && f.effectivePower > 0);
      const fortuneOwnerIds = [...new Set(fortuneForces.map(f => f.ownerId))];
      // 用原始 power 而非 effectivePower 来缩放时髦分
      // 玩家激活大吉(power=50)的意图应该影响风格偏好，不应被对抗削弱
      const maxRawFortunePower = fortuneForces.length > 0
        ? Math.max(...fortuneForces.map(f => f.power))
        : 0;
      const coolerMarks = this._collectCoolerMarks();

      for (const u of universes) {
        let destinyScore = 0;
        const breakdown = {};

        for (const force of resolvedForces) {
          if (force.effectivePower <= 0) continue; // 被完全压制

          let contribution = 0;
          const forceKey = (force.ownerName || force.ownerId) + '_' + force.type;

          switch (force.type) {
            case 'fortune': {
              const ownerScore = u.scores[force.ownerId] || 0;
              const outcome = ownerScore / 100;
              contribution = force.effectivePower * outcome;
              break;
            }
            case 'curse': {
              const targetId = force.targetId != null ? force.targetId : null;
              if (targetId == null) break;
              const targetScore = u.scores[targetId] || 0;
              const loseRate = 1 - (targetScore / 100);
              contribution = force.effectivePower * loseRate;
              break;
            }
            case 'backlash': {
              const rinoScore = u.scores[force.targetId] || 0;
              const rinoLoseRate = 1 - (rinoScore / 100);
              contribution = force.effectivePower * rinoLoseRate;
              break;
            }
          }

          destinyScore += contribution;
          breakdown[forceKey] = Math.round(contribution * 10) / 10;
        }

        // ---- 时髦命运加分 ----
        const styleBonus = this._calculateStyleBonus(u, fortuneOwnerIds, maxRawFortunePower);
        if (styleBonus !== 0) {
          destinyScore += styleBonus;
          breakdown['style_bias'] = styleBonus;
        }

        const coolerBonus = this._calculateCoolerBonus(u, coolerMarks);
        if (coolerBonus !== 0) {
          destinyScore += coolerBonus;
          breakdown['cooler_bias'] = coolerBonus;
        }

        u.destinyScore = Math.round(destinyScore * 10) / 10;
        u.forceBreakdown = breakdown;
        u.styleBonus = styleBonus;
      }
    }

    _collectCoolerMarks() {
      if (!this._skillSystem || !this._skillSystem.statusMarks || typeof this._skillSystem.statusMarks.entries !== 'function') {
        return [];
      }
      const marks = [];
      for (const [targetId, markMap] of this._skillSystem.statusMarks.entries()) {
        if (!markMap || !markMap.cooler_mark) continue;
        marks.push(Object.assign({ targetId: targetId }, markMap.cooler_mark));
      }
      return marks;
    }

    _calculateCoolerBonus(universe, marks) {
      if (!marks || !marks.length) return 0;
      let totalBonus = 0;

      for (const mark of marks) {
        const targetId = mark.targetId;
        const casterId = mark.sourceId;
        if (targetId == null || casterId == null) continue;

        const targetScore = universe.scores[targetId] || 0;
        const casterScore = universe.scores[casterId] || 0;
        const targetRank = universe.handRanks ? (universe.handRanks[targetId] || 0) : 0;
        const casterRank = universe.handRanks ? (universe.handRanks[casterId] || 0) : 0;
        const targetWins = universe.winnerIds.indexOf(targetId) >= 0;
        const casterWins = universe.winnerIds.indexOf(casterId) >= 0;

        // 第一版冤家牌偏好：
        // 目标要有一定摊牌值，但最后仍被施法者压死。
        if (targetWins || !casterWins) continue;
        if (targetScore < 52) continue;
        if (casterScore < targetScore + 6) continue;
        if (targetRank < 2) continue;
        if (casterRank < targetRank) continue;

        let bonus = 10;
        if (targetScore >= 60) bonus += 4;
        if (targetRank >= 3) bonus += 3;
        if (casterRank > targetRank) bonus += 2;
        totalBonus += bonus;
      }

      return totalBonus;
    }

    resolveForceOpposition(forces, context) {
      context = context || {};
      const resolved = (Array.isArray(forces) ? forces : []).map(f => this._normalizeForce(f));
      const trace = [];

      this._debugResolutionStage('OPPOSITION_START', resolved, trace);
      this.applyInactiveParticipantFilter(resolved, context, trace);
      this.applyTargetSemantics(resolved, context, trace);
      this.applyReality(resolved, context, trace);
      this.applyInsulation(resolved, context, trace);
      this.applyForceLocks(resolved, context, trace);
      this.applySystemCounters(resolved, context, trace);
      this._lastPsycheEvents = this.applyPsycheMatrix(resolved, context, trace);
      this.applyFortuneCurseContest(resolved, context, trace);

      if (this.combatFormula) {
        this.combatFormula.applyVoidReduction(resolved);
      }

      this._lastResolutionTrace = trace;
      this._debugResolutionStage('OPPOSITION_RESULT', resolved, trace);
      return resolved;
    }

    applyInactiveParticipantFilter(resolved, context, trace) {
      const activeIds = this._getActiveParticipantIds(context && context.players);
      if (!activeIds) return resolved;

      for (const f of resolved) {
        if (!f || f._suppressed) continue;

        const ownerActive = f.ownerId == null || activeIds.has(f.ownerId);
        const recipientId = this._getForceRecipientId(f);
        const recipientActive = recipientId == null || activeIds.has(recipientId);

        if (ownerActive && recipientActive) continue;

        f.effectivePower = 0;
        f._suppressed = true;
        f._suppressedBy = ownerActive ? 'inactive_recipient' : 'inactive_owner';
        this._pushResolutionTrace(trace, 'inactive_participant_filter', {
          force: f.skillKey || f.type,
          ownerId: f.ownerId,
          recipientId: recipientId,
          ownerActive: ownerActive,
          recipientActive: recipientActive
        });
      }

      return resolved;
    }

    _getActiveParticipantIds(players) {
      if (!Array.isArray(players) || players.length === 0) return null;
      const ids = new Set();
      for (const player of players) {
        if (!player || player.isActive === false || player.folded) continue;
        if (player.id == null) continue;
        ids.add(player.id);
      }
      return ids;
    }

    applyTargetSemantics(resolved, context, trace) {
      for (const f of resolved) {
        if (!f || f._suppressed) continue;
        if (f.type !== 'curse') continue;
        if (f.targetId != null) continue;

        f.effectivePower = 0;
        f._suppressed = true;
        f._suppressedBy = 'missing_curse_target';
        this._pushResolutionTrace(trace, 'missing_curse_target', {
          force: f.skillKey || f.type,
          ownerId: f.ownerId
        });
      }
      return resolved;
    }

    _normalizeForce(force) {
      const f = Object.assign({}, force || {});
      f.type = f.type || f.kind || 'meta';
      f.system = f.system || this._inferSystemForForce(f);
      f.power = Math.max(0, Number(f.power || 0));
      f.effectivePower = Math.max(0, Number(f.effectivePower != null ? f.effectivePower : f.power));
      f.lockChance = Math.max(0, Math.min(1, Number(f.lockChance || 0)));
      f._resolutionSide = this._getForceSide(f);
      f._recipientId = this._getForceRecipientId(f);
      return f;
    }

    _inferSystemForForce(force) {
      if (!force) return null;
      if (force.type === 'fortune') return 'moirai';
      if (force.type === 'curse') return 'chaos';
      if (force.type === 'psyche' || force.type === 'heart_read') return 'psyche';
      if (force.type === 'void') return 'void';
      return null;
    }

    _getForceSide(force) {
      const hid = this._heroId != null ? this._heroId : 0;
      return force && force.ownerId === hid ? 'hero' : 'opponent';
    }

    _getForceRecipientId(force) {
      if (!force) return null;
      if (force.type === 'curse') return force.targetId != null ? force.targetId : null;
      if (force.targetId != null) return force.targetId;
      if (force.protectId != null) return force.protectId;
      return force.ownerId != null ? force.ownerId : null;
    }

    _isActiveForce(force) {
      return !!(force && !force._suppressed && force.effectivePower > 0);
    }

    _isVoidForce(force) {
      return !!(force && (force.type === 'void' || force.system === 'void'));
    }

    _pushResolutionTrace(trace, stage, payload) {
      if (!Array.isArray(trace)) return;
      trace.push(Object.assign({ stage: stage }, payload || {}));
    }

    _debugResolutionStage(label, resolved, trace) {
      if (!this.debugMode) return;
      this._debugPush(label, {
        forces: resolved.map(f => ({
          owner: f.ownerName || f.ownerId,
          type: f.type,
          system: f.system,
          skillKey: f.skillKey || null,
          targetId: f.targetId != null ? f.targetId : null,
          power: f.power,
          effectivePower: f.effectivePower,
          lockActive: !!f._lockActive,
          lockWinner: !!f._lockWinner,
          suppressed: !!f._suppressed,
          converted: !!f._converted,
          tags: {
            insulation: !!f._insulationReduced,
            counter: f._systemCounterMult || null,
            contest: f._contestDrain || null,
            voidReduced: !!f._voidReduced
          }
        })),
        trace: Array.isArray(trace) ? trace.slice() : []
      });
    }

    applyReality(resolved, context, trace) {
      const realityForces = resolved.filter(f => this._isVoidForce(f) && f.skillKey === 'reality' && !f._suppressed);
      if (realityForces.length === 0) return resolved;

      for (const f of resolved) {
        if (this._isVoidForce(f)) continue;
        f.effectivePower = 0;
        f._suppressed = true;
        f._suppressedBy = 'reality';
      }
      this._pushResolutionTrace(trace, 'reality', { cleared: resolved.filter(f => f._suppressedBy === 'reality').length });
      return resolved;
    }

    applyInsulation(resolved, context, trace) {
      const shieldForces = resolved.filter(f => this._isVoidForce(f) && f.skillKey === 'insulation' && !f._suppressed);
      if (shieldForces.length === 0) return resolved;

      const hid = context && context.heroId != null ? context.heroId : (this._heroId != null ? this._heroId : 0);
      const strongest = shieldForces.reduce((best, f) => {
        const level = Number(f.level || 1);
        return !best || level > Number(best.level || 1) ? f : best;
      }, null);
      const special = strongest && strongest.special ? strongest.special : {};

      for (const f of resolved) {
        if (!this._isActiveForce(f) || this._isVoidForce(f)) continue;
        const isAlly = f.ownerId === hid;
        let delta = 0;

        if (f.type === 'fortune') {
          delta = isAlly ? Number(special.allyFortune || -0.15) : Number(special.enemyFortune || -0.25);
        } else if (f.type === 'curse' && !isAlly) {
          delta = Number(special.enemyCurse || -0.4);
        } else {
          continue;
        }

        const before = f.effectivePower;
        f.effectivePower = Math.round(f.effectivePower * Math.max(0, 1 + delta) * 10) / 10;
        f._insulationReduced = true;
        this._pushResolutionTrace(trace, 'insulation', {
          skillLevel: strongest ? strongest.level : null,
          force: f.skillKey || f.type,
          ownerId: f.ownerId,
          before: before,
          after: f.effectivePower,
          delta: delta
        });
      }
      return resolved;
    }

    applyForceLocks(resolved, context, trace) {
      const lockForces = resolved.filter(f =>
        this._isActiveForce(f) &&
        (f.type === 'fortune' || f.type === 'curse') &&
        f.lockChance > 0
      );
      if (lockForces.length === 0) return resolved;

      for (const f of lockForces) {
        const roll = f.lockRoll != null ? Number(f.lockRoll) : Math.random();
        f._lockRoll = roll;
        f._lockActive = roll < f.lockChance;
        f._lockFinalPower = Math.round(f.effectivePower * (1 + f.lockChance) * 10) / 10;
        this._pushResolutionTrace(trace, 'force_lock_roll', {
          force: f.skillKey || f.type,
          ownerId: f.ownerId,
          chance: f.lockChance,
          roll: Math.round(roll * 1000) / 1000,
          active: !!f._lockActive
        });
      }

      const activeLocks = lockForces.filter(f => f._lockActive);
      if (activeLocks.length === 0) return resolved;

      for (const lock of activeLocks) {
        if (lock.type === 'curse' && this._hasOpposingMoiraiFortune(lock, resolved)) {
          lock._lockFinalPower = Math.round(lock._lockFinalPower * 1.25 * 10) / 10;
          lock._lockCounterMult = 1.25;
        }
      }

      for (const lock of activeLocks) {
        const opponents = activeLocks.filter(other => other !== lock && this._forcesContest(lock, other));
        if (opponents.length === 0) {
          lock._lockWinner = true;
          lock._skipRegularContest = true;
          continue;
        }

        const best = [lock].concat(opponents).reduce((winner, candidate) => {
          return candidate._lockFinalPower > winner._lockFinalPower ? candidate : winner;
        }, lock);
        for (const candidate of [lock].concat(opponents)) {
          if (candidate === best) {
            candidate._lockWinner = true;
            candidate._skipRegularContest = true;
          } else {
            candidate.effectivePower = 0;
            candidate._suppressed = true;
            candidate._suppressedBy = best.skillKey || best.type;
          }
        }
      }

      this._pushResolutionTrace(trace, 'force_locks', {
        locks: activeLocks.map(f => ({
          force: f.skillKey || f.type,
          ownerId: f.ownerId,
          targetId: f.targetId != null ? f.targetId : null,
          finalPower: f._lockFinalPower,
          winner: !!f._lockWinner,
          suppressed: !!f._suppressed
        }))
      });
      return resolved;
    }

    _hasOpposingMoiraiFortune(curse, resolved) {
      return resolved.some(f =>
        f !== curse &&
        this._isActiveForce(f) &&
        f.type === 'fortune' &&
        f.system === 'moirai' &&
        this._forcesContest(curse, f)
      );
    }

    _forcesContest(a, b) {
      if (!a || !b || a.ownerId === b.ownerId) return false;
      if (a.type === b.type) return a._resolutionSide !== b._resolutionSide;
      if (a.type === 'curse' && b.type === 'fortune') return this._getForceRecipientId(a) === b.ownerId;
      if (a.type === 'fortune' && b.type === 'curse') return this._getForceRecipientId(b) === a.ownerId;
      return false;
    }

    applySystemCounters(resolved, context, trace) {
      for (const curse of resolved) {
        if (!this._isActiveForce(curse)) continue;
        if (curse.type !== 'curse') continue;
        if (curse.system !== 'chaos') continue;
        if (!this._hasOpposingMoiraiFortune(curse, resolved)) continue;

        const before = curse.effectivePower;
        curse.effectivePower = Math.round(curse.effectivePower * 1.25 * 10) / 10;
        curse._systemCounter = 'chaos_over_moirai';
        curse._systemCounterMult = 1.25;
        this._pushResolutionTrace(trace, 'system_counter', {
          counter: 'Chaos > Moirai',
          force: curse.skillKey || curse.type,
          ownerId: curse.ownerId,
          before: before,
          after: curse.effectivePower
        });
      }
      return resolved;
    }

    applyPsycheMatrix(resolved, context, trace) {
      const events = [];
      const psycheForces = resolved
        .filter(f => !f._suppressed && (f.type === 'psyche' || f.type === 'heart_read'))
        .sort((a, b) => Number(b.level || 1) - Number(a.level || 1));
      if (psycheForces.length === 0) return events;

      for (const psyche of psycheForces) {
        const ledger = this._buildPsycheLedger(psyche);
        const protectId = psyche.protectId != null ? psyche.protectId : psyche.ownerId;
        let touched = false;

        for (const curse of resolved.filter(f => f.type === 'curse')) {
          if (!curse || curse.effectivePower <= 0) continue;
          if (curse.ownerId === psyche.ownerId) continue;
          if (curse.targetId == null || curse.targetId !== protectId) continue;

          if (curse._lockActive && this._canPsycheConvertCurse(psyche, curse, protectId)) {
            curse._lockActive = false;
            curse._lockWinner = false;
            curse._skipRegularContest = false;
            curse._lockDowngradedBy = psyche.skillKey;
            this._pushResolutionTrace(trace, 'psyche_lock_downgrade', {
              skillKey: psyche.skillKey,
              curse: curse.skillKey || curse.type,
              curseOwnerId: curse.ownerId
            });
          }

          const originalPower = Math.max(0, Number(curse.effectivePower || 0));
          const efficiency = this._getPsycheEfficiencyAgainstCurse(curse);

          const defenseBlock = Math.min(originalPower, ledger.defenseRemaining * efficiency);
          if (defenseBlock > 0) {
            ledger.defenseRemaining = Math.max(0, ledger.defenseRemaining - defenseBlock / efficiency);
            curse.effectivePower = Math.max(0, Math.round((curse.effectivePower - defenseBlock) * 10) / 10);
            curse._psycheDefendedPower = Math.round(((curse._psycheDefendedPower || 0) + defenseBlock) * 10) / 10;
            curse._psycheDefendedBy = psyche.skillKey;
            touched = true;
          }

          let convertedPower = 0;
          if (curse.effectivePower > 0 && ledger.conversionRemaining > 0 && this._canPsycheConvertCurse(psyche, curse, protectId)) {
            const conversionBlock = Math.min(curse.effectivePower, ledger.conversionRemaining * efficiency);
            ledger.conversionRemaining = Math.max(0, ledger.conversionRemaining - conversionBlock / efficiency);
            curse.effectivePower = Math.max(0, Math.round((curse.effectivePower - conversionBlock) * 10) / 10);
            curse._psycheConvertedPower = Math.round(((curse._psycheConvertedPower || 0) + conversionBlock) * 10) / 10;
            curse._psycheConvertedBy = psyche.skillKey;
            convertedPower = Math.round(conversionBlock * 10) / 10;
            touched = true;

            resolved.push({
              ownerId: psyche.ownerId,
              ownerName: psyche.ownerName,
              type: 'fortune',
              power: convertedPower,
              effectivePower: convertedPower,
              activation: 'active',
              source: 'psyche_refraction',
              level: psyche.level,
              system: 'psyche',
              skillKey: 'refraction_converted',
              _converted: true,
              _convertedFrom: curse.skillKey || curse.type,
              _psycheLedger: {
                sourceSkill: psyche.skillKey,
                sourceOwnerId: psyche.ownerId,
                curseOwnerId: curse.ownerId
              }
            });
          }

          if (defenseBlock > 0 || convertedPower > 0) {
            const event = {
              action: convertedPower > 0 ? 'convert' : 'defend',
              arbiterType: psyche.type,
              skillKey: psyche.skillKey,
              arbiterOwner: psyche.ownerName,
              protectId: protectId,
              targetOwner: curse.ownerName || curse.ownerId,
              targetType: curse.type,
              originalPower: originalPower,
              defenseBlockedPower: Math.round(defenseBlock * 10) / 10,
              convertedPower: convertedPower,
              remainingPower: curse.effectivePower,
              efficiency: efficiency,
              ledger: {
                infoValue: ledger.infoValue,
                defenseRemaining: Math.round(ledger.defenseRemaining * 10) / 10,
                conversionRemaining: Math.round(ledger.conversionRemaining * 10) / 10
              }
            };
            events.push(event);
            if (this.debugMode) this._debugPush(convertedPower > 0 ? 'PSYCHE_CONVERT' : 'PSYCHE_DEFEND', event);
            this._pushResolutionTrace(trace, convertedPower > 0 ? 'psyche_convert' : 'psyche_defend', event);
          }

          if (ledger.defenseRemaining <= 0 && ledger.conversionRemaining <= 0) break;
        }

        if (!touched) {
          const event = {
            action: 'whiff',
            arbiterType: psyche.type,
            skillKey: psyche.skillKey,
            arbiterOwner: psyche.ownerName,
            protectId: protectId,
            ledger: {
              infoValue: ledger.infoValue,
              defenseValue: ledger.defenseValue,
              conversionValue: ledger.conversionValue
            }
          };
          events.push(event);
          if (this.debugMode) this._debugPush('PSYCHE_WHIFF', event);
        }
      }

      return events;
    }

    applyFortuneCurseContest(resolved, context, trace) {
      const fortuneForces = resolved.filter(f => this._isActiveForce(f) && f.type === 'fortune' && !f._skipRegularContest);
      const curseForces = resolved.filter(f => this._isActiveForce(f) && f.type === 'curse' && !f._skipRegularContest);
      if (fortuneForces.length === 0 || curseForces.length === 0) return resolved;

      for (const fortune of fortuneForces) {
        if (!this._isActiveForce(fortune)) continue;
        const targetingCurses = curseForces.filter(curse =>
          this._isActiveForce(curse) &&
          this._getForceRecipientId(curse) === fortune.ownerId &&
          curse.ownerId !== fortune.ownerId
        );
        if (targetingCurses.length === 0) continue;

        const curseTotal = targetingCurses.reduce((sum, curse) => sum + curse.effectivePower, 0);
        const fortunePower = fortune.effectivePower;
        const contestAmount = Math.min(fortunePower, curseTotal);
        if (contestAmount <= 0) continue;

        const fortuneAfter = Math.round((fortunePower - contestAmount) * 10) / 10;
        const curseRatio = curseTotal > 0 ? Math.max(0, (curseTotal - contestAmount) / curseTotal) : 0;
        fortune.effectivePower = fortuneAfter;
        fortune._contestDrain = Math.round(contestAmount * 10) / 10;
        const curseContestDetails = [];

        for (const curse of targetingCurses) {
          const before = curse.effectivePower;
          curse.effectivePower = Math.round(curse.effectivePower * curseRatio * 10) / 10;
          curse._contestDrain = Math.round((before - curse.effectivePower) * 10) / 10;
          curseContestDetails.push({
            force: curse.skillKey || curse.type,
            ownerId: curse.ownerId,
            before: before,
            after: curse.effectivePower
          });
        }

        this._pushResolutionTrace(trace, 'fortune_curse_contest', {
          fortune: fortune.skillKey || fortune.type,
          fortuneOwnerId: fortune.ownerId,
          fortuneBefore: fortunePower,
          fortuneAfter: fortune.effectivePower,
          curseTotalBefore: curseTotal,
          contestAmount: contestAmount,
          curses: curseContestDetails
        });
      }
      return resolved;
    }

    _buildPsycheLedger(force) {
      const matrix = Array.isArray(force.matrix) && force.matrix.length >= 3
        ? force.matrix
        : [0.35, 0.45, 0.2];
      const total = Math.max(0, Number(force.power || 0));
      const infoValue = Math.round(total * Math.max(0, Number(matrix[0] || 0)) * 10) / 10;
      const defenseValue = Math.round(total * Math.max(0, Number(matrix[1] || 0)) * 10) / 10;
      const canConvert = force.skillKey === 'refraction';
      const conversionValue = canConvert
        ? Math.round(total * Math.max(0, Number(matrix[2] || 0)) * 10) / 10
        : 0;
      return {
        infoValue: infoValue,
        defenseValue: defenseValue,
        conversionValue: conversionValue,
        defenseRemaining: defenseValue,
        conversionRemaining: conversionValue
      };
    }

    _getPsycheEfficiencyAgainstCurse(curse) {
      const system = curse.system || (curse.type === 'curse' ? 'chaos' : null);
      return system === 'chaos' ? 1.25 : 1;
    }

    _canPsycheConvertCurse(psyche, curse, protectId) {
      if (!psyche || psyche.skillKey !== 'refraction') return false;
      if (psyche.curseSourceId != null && curse.ownerId !== psyche.curseSourceId) return false;
      const direction = String(psyche.curseDirection || 'self_loss');
      if (direction === 'self_loss') {
        return curse.targetId != null && curse.targetId === protectId;
      }
      if (direction === 'target_loss') {
        return psyche.targetId != null && curse.targetId === psyche.targetId;
      }
      return true;
    }

    // ========== 时髦命运 (Style Bias System) ==========

    /**
     * 计算某个宇宙中命运受益者的牌型时髦分
     * 只对命运的“赢家”计算时髦分，不会改变谁赢，只改变“怎么赢”
     *
     * @param {object} universe - 平行宇宙对象
     * @param {Array} fortuneOwnerIds - 命运受益者ID列表
     * @param {number} maxFortunePower - 最强命运力量（用于缩放时髦影响）
     * @returns {number} styleBonus
     */
    _calculateStyleBonus(universe, fortuneOwnerIds, maxFortunePower) {
      if (!this.styleBias || fortuneOwnerIds.length === 0) return 0;

      let totalStyle = 0;

      for (const ownerId of fortuneOwnerIds) {
        const hand = universe.hands[ownerId];
        if (!hand) continue;

        const rank = hand.rank || 1;
        const baseStyle = STYLE_WEIGHTS[rank] || 0;

        // 听牌加分：如果当前差一张成顺/同花，额外加分鼓励“保留悬念”
        const drawBonus = this._detectDrawPotential(universe, ownerId);

        // 反单调惩罚：连续出同类型牌时降低分数
        const monotonyPenalty = this._getMonotonyPenalty(rank);

        totalStyle += baseStyle + drawBonus + monotonyPenalty;
      }

      // 时髦分随命运力量缩放：弱被动命运几乎不关心时髦，强主动命运积极追求戏剧性
      // 用原始 power: passive 3~6 -> 0.15~0.3, active 30~50 -> 0.75~1.0
      // 最低 0.3 保底，确保即使被动技能也有一定风格偏好
      const powerFactor = Math.max(0.3, Math.min(1.0, maxFortunePower / 40));
      const finalBonus = totalStyle * powerFactor * this.styleIntensity;

      return Math.round(finalBonus * 10) / 10;
    }

    /**
     * 听牌检测：当前是否差一张成顺子或同花
     * 如果是，返回正分数鼓励引擎“保留听牌”而不是立刻完成对子
     */
    _detectDrawPotential(universe, playerId) {
      const hand = universe.hands[playerId];
      if (!hand || !hand.cardPool) return 0;

      const rank = hand.rank || 1;
      // 如果已经成顺/同花，不需要听牌加分
      if (rank >= 5) return 0;

      let bonus = 0;
      const cards = hand.cardPool || [];

      // 检测同花听牌：4张同花色
      const suitCounts = {};
      for (const c of cards) {
        suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1;
      }
      for (const suit in suitCounts) {
        if (suitCounts[suit] === 4) {
          bonus += 8; // 同花听牌，强加分——下一张可能成同花
          break;
        }
      }

      // 检测顺子听牌：4张连续牌
      const ranks = cards.map(c => c.rank).filter(r => r != null);
      const uniqueRanks = [...new Set(ranks)].sort((a, b) => a - b);
      // 也检查 A-low (A=1 在 pokersolver 中 rank=14，但也可以当 1)
      for (let i = 0; i <= uniqueRanks.length - 4; i++) {
        const span = uniqueRanks[i + 3] - uniqueRanks[i];
        if (span <= 4) { // 4张牌跨度<=4 = open-ended 或 gutshot
          bonus += (span === 3) ? 6 : 4; // open-ended +6, gutshot +4
          break;
        }
      }

      // 3张同花色也给小加分（预热）
      for (const suit in suitCounts) {
        if (suitCounts[suit] === 3) {
          bonus += 2;
          break;
        }
      }

      // 3张连续牌也给小加分
      for (let i = 0; i <= uniqueRanks.length - 3; i++) {
        const span = uniqueRanks[i + 2] - uniqueRanks[i];
        if (span <= 3) {
          bonus += 2;
          break;
        }
      }

      return bonus;
    }

    /**
     * 反单调惩罚：连续出同类型牌时降低分数
     * 连续2手对子 -> -3, 连续3手 -> -6
     */
    _getMonotonyPenalty(currentRank) {
      if (this._handHistory.length === 0) return 0;

      let streak = 0;
      for (let i = this._handHistory.length - 1; i >= 0; i--) {
        if (this._handHistory[i].rank === currentRank) {
          streak++;
        } else {
          break;
        }
      }

      if (streak === 0) return 0;

      // 对子(rank=2)和两对(rank=3)的惩罚更重，因为它们最常见
      const isCommonType = (currentRank <= 3);
      const basePenalty = isCommonType ? -3 : -1.5;
      return basePenalty * streak;
    }

    /**
     * 记录本手赢家牌型（在 selectCard 后调用）
     */
    _recordHandResult(universe, fortuneOwnerIds) {
      if (!universe || fortuneOwnerIds.length === 0) return;

      for (const ownerId of fortuneOwnerIds) {
        if (universe.winnerIds && universe.winnerIds.includes(ownerId)) {
          const hand = universe.hands[ownerId];
          if (hand) {
            this._handHistory.push({ rank: hand.rank || 1, name: hand.name || 'Unknown' });
            if (this._handHistory.length > this._historyMaxLen) {
              this._handHistory.shift();
            }
          }
        }
      }
    }

    // ========== 选牌策略 ==========

    _selectByWeightedRandom(universes) {
      // 使用指数加权（softmax）：分数差距越大，高分牌概率越高
      // temperature=1.0：高分牌被强烈偏好，但仍有小概率抽到低分牌
      // 例：分差10 → 高分牌概率约 e^10 ≈ 22000 倍
      const temperature = 1.0;
      const scores = universes.map(u => u.destinyScore);
      const maxScore = Math.max(...scores);
      // 指数加权（softmax-like），减去 maxScore 防止溢出
      const weights = universes.map(u => {
        const diff = (u.destinyScore - maxScore) / temperature;
        return Math.exp(diff);
      });
      const totalWeight = weights.reduce((sum, w) => sum + w, 0);
      let roll = Math.random() * totalWeight;
      for (let i = 0; i < weights.length; i++) {
        roll -= weights[i];
        if (roll <= 0) return universes[i];
      }
      return universes[universes.length - 1];
    }

    // ========== 内部方法 ==========

    _generateUniverses(deckCards, currentBoard, activePlayers) {
      const boardStrings = currentBoard.map(cardToSolverString);
      const universes = [];

      for (let i = 0; i < deckCards.length; i++) {
        const candidateCard = deckCards[i];
        const futureBoard = [...boardStrings, cardToSolverString(candidateCard)];

        const hands = {};
        const handObjects = [];

        for (const player of activePlayers) {
          const playerCards = player.cards.map(cardToSolverString);
          const allCards = [...playerCards, ...futureBoard];
          try {
            const hand = Hand.solve(allCards);
            hands[player.id] = hand;
            handObjects.push({ playerId: player.id, hand: hand });
          } catch (e) {
            continue;
          }
        }

        if (handObjects.length === 0) continue;

        const allHands = handObjects.map(h => h.hand);
        const winners = Hand.winners(allHands);
        const winnerIds = handObjects
          .filter(h => winners.includes(h.hand))
          .map(h => h.playerId);

        // scores 是胜率代理值，fortune 用它决定"选哪张牌让持有者赢"
        // 核心：赢家和输家之间必须有大差距，fortune 才能有效偏向赢的牌
        // 赢家: 55~75 (高分=fortune偏好), 输家: 15~35 (低分=fortune回避)
        // rank 微调：同为赢家时，强牌型略高；同为输家时，强牌型略高
        // 时髦度由 style bias 系统单独处理，不在这里
        const scores = {};
        const noise = () => (Math.random() - 0.5) * 10;
        for (const ph of handObjects) {
          if (winnerIds.includes(ph.playerId)) {
            scores[ph.playerId] = Math.min(80, 55 + (ph.hand.rank || 0) * 2 + noise());
          } else {
            scores[ph.playerId] = Math.max(10, 20 + (ph.hand.rank || 0) * 4 + noise());
          }
        }

        universes.push({
          card: candidateCard,
          hands: hands,
          winnerIds: winnerIds,
          scores: scores,
          handRanks: Object.fromEntries(
            handObjects.map(h => [h.playerId, h.hand.rank || 0])
          ),
          destinyScore: 0,
          forceBreakdown: {},
          handDescriptions: Object.fromEntries(
            handObjects.map(h => [h.playerId, h.hand.descr || h.hand.name])
          )
        });
      }

      return universes;
    }

    _randomSelect(deckCards) {
      const idx = Math.floor(Math.random() * deckCards.length);
      return {
        card: deckCards[idx],
        meta: { random: true, activeForces: [] }
      };
    }

    _calculateDramaticShift(universes, selected, rinoPlayerId) {
      if (universes.length < 2) return false;
      let totalScore = 0;
      for (const u of universes) {
        totalScore += (u.scores[rinoPlayerId] || 0);
      }
      const avgScore = totalScore / universes.length;
      const selectedScore = selected.scores[rinoPlayerId] || 0;
      return Math.abs(selectedScore - avgScore) > 30;
    }

    _log(type, data) {
      if (this.onLog) this.onLog(type, data);
      console.log(`[MonteOfZero] ${type}`, data);
    }

    _debugPush(stage, data) {
      if (!this.debugMode) return;
      this.debugTimeline.push({
        stage: stage,
        timestamp: Date.now(),
        data: data
      });
    }

    // ========== 状态查询 ==========

    getState() {
      return {
        enabled: this.enabled,
        styleBias: this.styleBias,
        styleIntensity: this.styleIntensity,
        handHistory: this._handHistory.slice(),
        lastMeta: this.lastSelectionMeta
      };
    }
  }

  // ========== 导出 ==========
  global.MonteOfZero = MonteOfZero;

})(typeof window !== 'undefined' ? window : global);
