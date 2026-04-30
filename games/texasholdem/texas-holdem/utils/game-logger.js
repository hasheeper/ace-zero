/**
 * ===========================================
 * GAME-LOGGER.JS - 牌局日志清洗与 AI 提示词系统
 * ===========================================
 *
 * 职责:
 * - 记录结构化牌局事件 (通过 log() 接口)
 * - D-E-L 模型: 事件分级 (T0~T3)、过滤、压缩
 * - 连续相同行动去重 (如多人连续 CHECK)
 * - 字数推荐算法 (基于有效事件权值 + 参战人数 + 底池规模)
 * - 生成 AI 叙事提示词模板 + 复制到剪贴板
 *
 * 参考: 参考/log-filter.js (PKM 战斗日志清洗系统)
 */

(function (global) {
  'use strict';

  // ============================================
  // 【事件分级规则】T0 ~ T3
  // tier 越低越重要, score 用于字数推荐
  // ============================================

  const TIER_SCORES = {
    0: 30,   // T0: 史诗级 (All-in 对决、大逆转、技能爆发)
    1: 12,   // T1: 关键交互 (大额加注、关键弃牌、摊牌)
    2: 5,    // T2: 常规行动 (跟注、过牌、发牌)
    3: 0.5   // T3: 噪音 (引擎内部、技能系统细节)
  };
  const HERO_INTERNAL_NAME = 'KAZU';
  const HERO_MAJOR_LABEL = 'USER';

  function _normalizeString(value, fallback) {
    return typeof value === 'string' ? value.trim() : (fallback || '');
  }

  function _resolveHeroDisplayName(context) {
    var explicit = _normalizeString(context && (
      context.heroVanguardDisplayName ||
      context.heroDisplayName ||
      context.heroUserName
    ), '');
    if (explicit) return explicit;

    var players = Array.isArray(context && context.players) ? context.players : [];
    for (var i = 0; i < players.length; i++) {
      if (players[i] && players[i].isHero) {
        var heroName = _normalizeString(players[i].name, '');
        if (heroName && heroName.toUpperCase() !== HERO_INTERNAL_NAME) return heroName;
      }
    }

    return HERO_INTERNAL_NAME;
  }

  function _isHeroName(name, context) {
    var normalized = _normalizeString(name, '');
    if (!normalized) return false;

    var heroCandidates = [
      HERO_INTERNAL_NAME,
      _normalizeString(context && context.heroVanguardName, ''),
      _normalizeString(context && context.heroVanguardRoleId, ''),
      _normalizeString(context && context.heroDisplayName, ''),
      _normalizeString(context && context.heroVanguardDisplayName, ''),
      _normalizeString(context && context.heroUserName, ''),
    ];

    var lower = normalized.toLowerCase();
    for (var i = 0; i < heroCandidates.length; i++) {
      var candidate = _normalizeString(heroCandidates[i], '');
      if (candidate && lower === candidate.toLowerCase()) return true;
    }
    return false;
  }

  function _replaceHeroNameInText(text, context) {
    if (typeof text !== 'string' || !text) return text;
    var heroDisplayName = _resolveHeroDisplayName(context);
    return text
      .replace(/\bKAZU\b/g, heroDisplayName)
      .replace(/\bKazu\b/g, heroDisplayName)
      .replace(/\bkazu\b/g, heroDisplayName);
  }

  function _mapHeroNames(list, context) {
    if (!Array.isArray(list)) return list;
    return list.map(function (item) {
      return _replaceHeroNameInText(String(item || ''), context);
    });
  }

  function _formatFundsValueFromSilver(silver) {
    var base = Currency && Currency.SILVER_PER_GOLD ? Currency.SILVER_PER_GOLD : 100;
    var gold = Math.round(Number(silver) || 0) / base;
    return gold.toFixed(2).replace(/\.?0+$/, '');
  }

  /**
   * T_DELETE: 直接删除的事件类型
   * 这些事件对 AI 叙事毫无价值
   */
  const DELETE_TYPES = new Set([
    // MonteOfZero 引擎内部
    'MOZ_SELECT', 'MOZ_FORCE', 'MOZ_OPPOSITION', 'MOZ_RESOLVE',
    'MOZ_DESTINY_SELECT', 'MOZ_STYLE_BONUS', 'MOZ_FORCE_BALANCE',
    // SkillSystem 内部注册/状态
    'SKILL_REGISTER', 'SKILL_LOADED', 'SKILL_RESET',
    'SKILL_COOLDOWN', 'SKILL_MANA_CHECK'
  ]);

  /**
   * 分级一条事件
   * @param {object} entry - 日志条目 { type, phase, pot, ... }
   * @returns {{ tier: number, score: number, action: string }}
   */
  function classifyEntry(entry) {
    const type = entry.type || '';

    // 优先保留有叙事价值的技能事件（必须在 SKILL_ 前缀删除规则之前）
    // 玩家主动技能 = 命运干涉，叙事高光 (T0)
    if (type === 'SKILL_USE') {
      return { tier: 0, score: TIER_SCORES[0], action: 'keep' };
    }
    // NPC 技能 (T1)
    if (type === 'NPC_SKILL') {
      return { tier: 1, score: TIER_SCORES[1], action: 'keep' };
    }
    // 结算后剧情亮牌 (T1)
    if (type === 'REVEAL') {
      return { tier: 1, score: TIER_SCORES[1], action: 'keep' };
    }
    // Psyche 拦截事件 (T1)
    if (type === 'PSYCHE_INTERCEPT') {
      return { tier: 1, score: TIER_SCORES[1], action: 'keep' };
    }
    // 心理战技能 (T1)
    if (type === 'MENTAL_PRESSURE' || type === 'MENTAL_AOE' || type === 'MENTAL_RECOVER') {
      return { tier: 1, score: TIER_SCORES[1], action: 'keep' };
    }
    // DELETE: 引擎内部噪音（具名列表）
    if (DELETE_TYPES.has(type)) {
      return { tier: -1, score: 0, action: 'delete' };
    }
    // DELETE: 所有 MOZ_ 和 SKILL_ 前缀的引擎内部事件
    if (type.startsWith('MOZ_') || type.startsWith('SKILL_')) {
      return { tier: -1, score: 0, action: 'delete' };
    }

    // T0: 史诗级节点
    if (type === 'RESULT') {
      return { tier: 0, score: TIER_SCORES[0], action: 'keep' };
    }
    if (type === 'SHOWDOWN') {
      return { tier: 0, score: TIER_SCORES[0], action: 'keep' };
    }
    // All-in 行为
    if (entry.isAllIn) {
      return { tier: 0, score: TIER_SCORES[0], action: 'keep' };
    }

    // T1: 关键交互
    // 大额加注 (超过底池 50%)
    if ((type === 'PLAYER_RAISE' || type === 'AI_RAISE' ||
         type === 'PLAYER_BET' || type === 'AI_BET') && entry.amount > 0) {
      const pot = entry.pot || 1;
      if (entry.amount >= pot * 0.5) {
        return { tier: 1, score: TIER_SCORES[1], action: 'keep' };
      }
    }
    // 弃牌 (放弃底池 = 关键决策)
    if (type === 'PLAYER_FOLD' || type === 'AI_FOLD') {
      return { tier: 1, score: TIER_SCORES[1], action: 'keep' };
    }
    // 公共牌发出 (翻牌/转牌/河牌 = 剧情转折点)
    if (type === 'FLOP' || type === 'TURN' || type === 'RIVER') {
      return { tier: 1, score: TIER_SCORES[1], action: 'keep' };
    }

    // T2: 常规行动
    if (type === 'PLAYER_RAISE' || type === 'AI_RAISE' ||
        type === 'PLAYER_BET' || type === 'AI_BET') {
      return { tier: 2, score: TIER_SCORES[2], action: 'keep' };
    }
    if (type === 'PLAYER_CALL' || type === 'AI_CALL') {
      return { tier: 2, score: TIER_SCORES[2], action: 'keep' };
    }
    if (type === 'PLAYER_CHECK' || type === 'AI_CHECK') {
      return { tier: 2, score: TIER_SCORES[2], action: 'keep' };
    }
    if (type === 'DEAL' || type === 'BLINDS') {
      return { tier: 2, score: TIER_SCORES[2], action: 'keep' };
    }

    // T3: 未分类 → 噪音
    return { tier: 3, score: TIER_SCORES[3], action: 'keep' };
  }

  // ============================================
  // 【格式化】将结构化事件转为可读文本行
  // ============================================

  function formatEntry(entry) {
    switch (entry.type) {
      case 'DEAL':
        return '[DEAL] ' + entry.playerCount + ' players';
      case 'BLINDS':
        return '[BLINDS] ' + entry.sb + ' SB ' + Currency.amount(entry.sbAmount || 10) + ', ' + entry.bb + ' BB ' + Currency.amount(entry.bbAmount || 20);
      case 'PLAYER_FOLD':
      case 'AI_FOLD':
        return '[' + entry.playerName + '] 弃牌';
      case 'PLAYER_CHECK':
      case 'AI_CHECK':
        return '[' + entry.playerName + '] 过牌';
      case 'PLAYER_CALL':
      case 'AI_CALL':
        return '[' + entry.playerName + '] 跟注 ' + Currency.amount(entry.amount) + (entry.isAllIn ? ' (ALL-IN)' : '');
      case 'PLAYER_BET':
      case 'AI_BET':
        return '[' + entry.playerName + '] 下注 ' + Currency.amount(entry.amount) + (entry.isAllIn ? ' (ALL-IN)' : '');
      case 'PLAYER_RAISE':
      case 'AI_RAISE':
        return '[' + entry.playerName + '] 加注 ' + Currency.amount(entry.amount) + ' (总注 ' + Currency.amount(entry.totalBet) + ')' + (entry.isAllIn ? ' (ALL-IN)' : '');
      case 'FLOP':
        return '[FLOP] ' + entry.cards;
      case 'TURN':
        return '[TURN] ' + entry.card + ' (公共牌: ' + entry.board + ')';
      case 'RIVER':
        return '[RIVER] ' + entry.card + ' (公共牌: ' + entry.board + ')';
      case 'SHOWDOWN':
        return '[SHOWDOWN] ' + entry.playerName + ': ' + entry.cards + ' (' + entry.handDescr + ')';
      case 'REVEAL':
        return '[REVEAL] ' + entry.playerName + ': ' + entry.cards + (entry.source ? ' (' + entry.source + ')' : '');
      case 'RESULT': {
        const parts = ['[RESULT]'];
        if (entry.winners) parts.push('winner: ' + entry.winners);
        else if (entry.winner) parts.push('winner: ' + entry.winner);
        parts.push('wins ' + Currency.compact(entry.potWon));
        if (entry.reasonCode === 'all_folded') parts.push('(all others folded)');
        else if (entry.reason) parts.push('(' + entry.reason + ')');
        if (entry.handDescr) parts.push('hand: ' + entry.handDescr);
        return parts.join(' ');
      }
      case 'ELIMINATED':
        return '[ELIMINATED] ' + entry.player + ' busted';
      case 'SKILL_USE': {
        var casterTag = entry.caster ? entry.caster + ': ' : '';
        var targetTag = entry.target ? ' → ' + entry.target : '';
        return '[SKILL] ' + casterTag + (entry.skill || 'unknown') + targetTag;
      }
      case 'NPC_SKILL':
        var targetTag = entry.targetName ? ' → ' + entry.targetName : '';
        return '[NPC_SKILL] ' + entry.owner + ' ' + entry.skill + targetTag;
      case 'PSYCHE_INTERCEPT':
        if (entry.action === 'convert') return '[PSYCHE] ' + entry.arbiter + ' converts ' + entry.target + ' curse to fortune(P' + entry.power + ')';
        if (entry.action === 'nullify') return '[PSYCHE] ' + entry.arbiter + ' nullifies ' + entry.target + ' curse';
        return null;
      case 'MENTAL_PRESSURE':
        const critMark = entry.crit ? ' CRIT!' : '';
        const stateChange = entry.prevState && entry.prevState !== entry.state ? ' (' + entry.prevState + '→' + entry.state + ')' : ' (' + entry.state + ')';
        return '[MENTAL] ' + entry.playerName + ' ' + entry.skill + ' -> ' + entry.targetName + ' ' + entry.effect + critMark + stateChange;
      case 'MENTAL_AOE':
        return '[MENTAL] ' + entry.playerName + ' ' + entry.skill + ' AOE -> ' + entry.summary;
      case 'MENTAL_RECOVER':
        return '[MENTAL] ' + entry.playerName + ' ' + entry.skill + ' -> recover';
      default:
        return '[' + entry.type + '] ' + (entry.playerName || '');
    }
  }

  function _isWeakMentalPressure(entry) {
    if (!entry || entry.type !== 'MENTAL_PRESSURE') return false;
    var effect = String(entry.effect || '');
    var sameState = !entry.prevState || entry.prevState === entry.state;
    return !entry.crit && sameState && effect.indexOf('微弱') !== -1;
  }

  function _getAggressionLabel(entry) {
    if (!entry) return '';
    if (entry.isAllIn) return 'ALL-IN';
    if (entry.type === 'PLAYER_RAISE' || entry.type === 'AI_RAISE') return 'RAISE';
    return 'BET';
  }

  function _getCallLabel(entry) {
    if (!entry) return 'CALL';
    if (entry.isAllIn) return 'ALL-IN CALL';
    return 'CALL';
  }

  function _formatAmountTag(amount) {
    if (!(amount > 0)) return '';
    return ' ' + Currency.amount(amount);
  }

  function _formatTotalBetTag(totalBet) {
    if (!(totalBet > 0)) return '';
    return ' (总注 ' + Currency.amount(totalBet) + ')';
  }

  function _formatPromptResult(entry) {
    if (!entry) return null;
    var winner = entry.winners || entry.winner || '未知';
    if (entry.reasonCode === 'all_folded' || entry.reason === 'All others folded') {
      return '[RESULT] winner: ' + winner + ' wins by fold';
    }
    var parts = ['[RESULT] winner: ' + winner];
    if (entry.handDescr) parts.push('hand: ' + entry.handDescr);
    return parts.join(' ');
  }

  function formatPromptEntry(entry, options) {
    options = options || {};
    if (!entry) return null;
    if (_isWeakMentalPressure(entry)) return null;

    switch (entry.type) {
      case 'DEAL':
        return options.playerCount > 2 ? '[DEAL] multi-way' : null;
      case 'BLINDS':
        return options.includeBlinds ? formatEntry(entry) : null;
      case 'PLAYER_FOLD':
      case 'AI_FOLD':
        return '[' + entry.playerName + '] FOLD';
      case 'PLAYER_CHECK':
      case 'AI_CHECK':
        return '[' + entry.playerName + '] CHECK';
      case 'PLAYER_CALL':
      case 'AI_CALL':
        return '[' + entry.playerName + '] ' + _getCallLabel(entry) + _formatAmountTag(entry.amount);
      case 'PLAYER_BET':
      case 'AI_BET':
        return '[' + entry.playerName + '] ' + _getAggressionLabel(entry) + _formatAmountTag(entry.amount);
      case 'PLAYER_RAISE':
      case 'AI_RAISE':
        return '[' + entry.playerName + '] ' + _getAggressionLabel(entry) + _formatAmountTag(entry.amount) + _formatTotalBetTag(entry.totalBet);
      case 'FLOP':
        return '[FLOP] ' + entry.cards;
      case 'TURN':
        return '[TURN] ' + entry.card;
      case 'RIVER':
        return '[RIVER] ' + entry.card;
      case 'SHOWDOWN':
        return '[SHOWDOWN] ' + entry.playerName + ': ' + entry.cards + ' (' + entry.handDescr + ')';
      case 'REVEAL':
        return '[REVEAL] ' + entry.playerName + ': ' + entry.cards;
      case 'RESULT':
        return _formatPromptResult(entry);
      case 'ELIMINATED':
        return '[ELIMINATED] ' + entry.player + ' busted';
      case 'SKILL_USE': {
        var casterTag = entry.caster ? entry.caster + ': ' : '';
        var targetTag = entry.target ? ' → ' + entry.target : '';
        return '[SKILL] ' + casterTag + (entry.skill || 'unknown') + targetTag;
      }
      case 'NPC_SKILL': {
        var targetTag = entry.targetName ? ' → ' + entry.targetName : '';
        return '[NPC_SKILL] ' + entry.owner + ' ' + entry.skill + targetTag;
      }
      case 'PSYCHE_INTERCEPT':
        if (entry.action === 'convert') return '[PSYCHE] ' + entry.arbiter + ' converts ' + entry.target + ' curse to fortune';
        if (entry.action === 'nullify') return '[PSYCHE] ' + entry.arbiter + ' nullifies ' + entry.target + ' curse';
        return null;
      case 'MENTAL_PRESSURE': {
        var critMark = entry.crit ? ' CRIT' : '';
        var stateTag = entry.prevState && entry.prevState !== entry.state ? ' (' + entry.prevState + '→' + entry.state + ')' : '';
        return '[MENTAL] ' + entry.playerName + ' ' + entry.skill + ' -> ' + entry.targetName + ' ' + entry.effect + critMark + stateTag;
      }
      case 'MENTAL_AOE':
        return '[MENTAL] ' + entry.playerName + ' ' + entry.skill + ' AOE -> ' + entry.summary;
      case 'MENTAL_RECOVER':
        return '[MENTAL] ' + entry.playerName + ' ' + entry.skill + ' -> recover';
      default:
        return null;
    }
  }

  function buildPromptLog(roundsForPrompt, context) {
    var logLines = [];
    var basePlayerCount = context && context.playerCount ? context.playerCount : 0;

    for (var r = 0; r < roundsForPrompt.length; r++) {
      var rr = roundsForPrompt[r];
      var filtered = rr.result.filtered;
      var roundContext = rr.context || {};
      var playerCount = roundContext.playerCount || basePlayerCount || 0;
      var heroPlayer = null;
      if (roundContext.players && roundContext.players.length) {
        for (var hp = 0; hp < roundContext.players.length; hp++) {
          if (roundContext.players[hp].isHero) {
            heroPlayer = roundContext.players[hp];
            break;
          }
        }
      }

      logLines.push('[HAND ' + rr.round + ' LOG]');
      if (heroPlayer && heroPlayer.cardsStr) {
        logLines.push('');
        logLines.push('▶ HOLE_CARDS');
        logLines.push('> [HOLE_CARDS] ' + heroPlayer.name + ': ' + heroPlayer.cardsStr);
      }

      var currentPhase = '';
      for (var i = 0; i < filtered.length; i++) {
        var item = filtered[i];
        var entry = item.entry || {};
        var promptText = formatPromptEntry(entry, {
          playerCount: playerCount,
          includeBlinds: rr.round === 1
        });
        if (!promptText) continue;
        if (entry.phase && entry.phase !== currentPhase) {
          currentPhase = entry.phase;
          logLines.push('');
          logLines.push('▶ ' + currentPhase.toUpperCase());
        }
        logLines.push('> ' + promptText);
      }

      if (r < roundsForPrompt.length - 1) logLines.push('');
    }

    return _replaceHeroNameInText(logLines.join('\n'), context);
  }

  function getShowdownRevealMap(entries) {
    var reveals = Object.create(null);
    for (var i = 0; i < (entries || []).length; i++) {
      var entry = entries[i];
      if (entry && (entry.type === 'SHOWDOWN' || entry.type === 'REVEAL') && entry.playerName) {
        reveals[entry.playerName] = true;
      }
    }
    return reveals;
  }

  function buildMajorNpcLines(context) {
    context = context || {};
    var seen = Object.create(null);
    var lines = [];
    var majorRoles = Array.isArray(context.majorRoles) ? context.majorRoles : [];
    var players = Array.isArray(context.players) ? context.players : [];
    var playerNames = Array.isArray(context.playerNames) ? context.playerNames : [];

    function addName(name) {
      var normalized = String(name || '').trim();
      if (!normalized || seen[normalized]) return;
      var label = _isHeroName(normalized, context) ? HERO_MAJOR_LABEL : normalized;
      if (seen[label]) return;
      seen[normalized] = true;
      seen[label] = true;
      lines.push('major:' + label);
    }

    for (var m = 0; m < majorRoles.length; m++) {
      addName(majorRoles[m]);
    }
    if (lines.length > 0) return lines;

    for (var i = 0; i < players.length; i++) {
      addName(players[i] && players[i].name);
    }
    for (var j = 0; j < playerNames.length; j++) {
      addName(playerNames[j]);
    }

    return _mapHeroNames(lines, context);
  }

  // ============================================
  // 【连续行动去重】多人连续 CHECK/FOLD → 合并
  // ============================================

  function getActionSignature(entry) {
    // 同类行动签名：忽略玩家名和金额，只看行动类型
    const type = entry.type || '';
    if (type.endsWith('_CHECK')) return 'CHECK';
    if (type.endsWith('_FOLD')) return 'FOLD';
    return null; // 其他行动不去重
  }

  /**
   * 去重: 连续 ≥3 个相同行动 → 保留首条 + 计数
   */
  function deduplicateActions(lines) {
    if (lines.length <= 1) return lines;
    const result = [];
    var i = 0;

    while (i < lines.length) {
      var sig = getActionSignature(lines[i].entry);
      if (!sig) {
        result.push(lines[i]);
        i++;
        continue;
      }

      var runEnd = i;
      var names = [lines[i].entry.playerName];
      while (runEnd + 1 < lines.length && getActionSignature(lines[runEnd + 1].entry) === sig) {
        runEnd++;
        names.push(lines[runEnd].entry.playerName);
      }

      var runLength = runEnd - i + 1;
      if (runLength >= 3) {
        result.push({
          text: '[' + names.join(', ') + '] 全部' + (sig === 'CHECK' ? '过牌' : '弃牌'),
          classification: lines[i].classification,
          entry: lines[i].entry
        });
      } else {
        for (var j = i; j <= runEnd; j++) {
          result.push(lines[j]);
        }
      }
      i = runEnd + 1;
    }
    return result;
  }

  // ============================================
  // 【T3 折叠】连续 T3 行折叠为摘要
  // ============================================

  function collapseT3Runs(lines) {
    var result = [];
    var t3Buffer = [];

    for (var i = 0; i < lines.length; i++) {
      if (lines[i].classification.tier === 3) {
        t3Buffer.push(lines[i]);
      } else {
        if (t3Buffer.length > 2) {
          result.push({
            text: '  (' + t3Buffer.length + ' 条系统事件省略)',
            classification: { tier: 3, score: 0.2, action: 'keep' },
            entry: {}
          });
        } else {
          t3Buffer.forEach(function (l) { result.push(l); });
        }
        t3Buffer = [];
        result.push(lines[i]);
      }
    }
    // 末尾
    if (t3Buffer.length > 2) {
      result.push({
        text: '  (' + t3Buffer.length + ' 条系统事件省略)',
        classification: { tier: 3, score: 0.2, action: 'keep' },
        entry: {}
      });
    } else {
      t3Buffer.forEach(function (l) { result.push(l); });
    }
    return result;
  }

  // ============================================
  // 【清洗流水线】D-E-L 模型主入口
  // ============================================

  function filterLog(entries) {
    // Step 1: 分级 + 格式化
    var classified = [];
    for (var i = 0; i < entries.length; i++) {
      var cls = classifyEntry(entries[i]);
      if (cls.action === 'delete') continue;
      var text = formatEntry(entries[i]);
      if (text === null) continue;
      classified.push({
        text: text,
        classification: cls,
        entry: entries[i]
      });
    }

    // Step 2: 连续行动去重
    classified = deduplicateActions(classified);

    // Step 3: T3 折叠
    classified = collapseT3Runs(classified);

    // Step 4: 统计
    var stats = { total: entries.length, kept: classified.length, deleted: 0, t0: 0, t1: 0, t2: 0, t3: 0 };
    stats.deleted = entries.length - classified.length;
    for (var k = 0; k < classified.length; k++) {
      var t = classified[k].classification.tier;
      if (t === 0) stats.t0++;
      else if (t === 1) stats.t1++;
      else if (t === 2) stats.t2++;
      else if (t === 3) stats.t3++;
    }

    // Step 5: 叙事总分
    stats.narrativeScore = 0;
    for (var m = 0; m < classified.length; m++) {
      stats.narrativeScore += (classified[m].classification.score || 0);
    }

    return { filtered: classified, stats: stats };
  }

  // ============================================
  // 【字数推荐算法】
  // 参战人数 + 有效事件权值 + 底池规模
  // ============================================

  function calculateWordCount(stats, context) {
    context = context || {};
    var breakdown = {};

    // 1. 参战规模
    var playerCount = context.playerCount || 2;
    var participantScore = playerCount * 100;
    breakdown.participants = participantScore;

    // 2. 有效事件权值
    var eventScore = Math.round((stats.narrativeScore || 0) * 8);
    breakdown.events = eventScore;

    // 3. 底池规模系数 (大底池 = 更紧张 = 更多描写)
    var maxPot = context.maxPot || 100;
    var initialChips = context.initialChips || 1000;
    var potModifier = Math.min(1.5, Math.max(0.8, maxPot / initialChips + 0.5));
    breakdown.potModifier = potModifier;

    // 4. T3 衰减 (噪音越多，压制膨胀)
    var t3Ratio = stats.kept > 0 ? stats.t3 / stats.kept : 0;
    var decayFactor = Math.max(0.6, 1 - t3Ratio * 0.4);
    breakdown.decayFactor = decayFactor;

    // 最终计算
    // 5. 资金波动加成（大输大赢 = 更多叙事空间）
    var fundsDelta = Math.abs(context.fundsDelta || 0);
    var fundsBonus = fundsDelta > 0 ? Math.min(140, Math.round(fundsDelta / 6)) : 0;
    breakdown.fundsBonus = fundsBonus;

    var lengthWeight = 0.38; // 字数权重
    var rawWords = (participantScore + eventScore + fundsBonus) * potModifier * decayFactor * lengthWeight;
    var recommended = Math.min(2400, Math.max(320, Math.round(rawWords)));
    var min = Math.max(280, recommended - 120);
    var max = Math.min(2800, recommended + 120);

    breakdown.rawWords = Math.round(rawWords);
    breakdown.lengthWeight = lengthWeight;

    return { min: min, max: max, recommended: recommended, breakdown: breakdown };
  }

  // ============================================
  // 【GameLogger 类】
  // ============================================

  class GameLogger {
    constructor() {
      this.entries = [];
      this.ui = { panel: null, content: null, btnCopy: null, btnToggle: null };
      // 游戏状态快照回调
      this.getGameSnapshot = null;
      // 缓存最后一次 show() 的 context，供按钮复制时使用
      this._lastContext = null;

      // ===== 多局 Session 追踪 =====
      this.roundHistory = [];   // 历史局: [{ round, entries, context, summary }]
      this.sessionRound = 0;    // 当前是第几局 (1-based after first archive)
      this._sessionStartChips = 0; // session 开始时的筹码快照
    }

    // ========== 初始化 ==========

    bindUI(elements) {
      this.ui.panel = elements.panel || document.getElementById('game-log-panel');
      this.ui.content = elements.content || document.getElementById('game-log-content');
      this.ui.btnCopy = elements.btnCopy || document.getElementById('btn-copy-log');
      this.ui.btnToggle = elements.btnToggle || document.getElementById('btn-toggle-log');

      if (this.ui.btnCopy) {
        this.ui.btnCopy.addEventListener('click', () => this.copyAIPrompt(this._lastContext));
      }
      if (this.ui.btnToggle) {
        this.ui.btnToggle.addEventListener('click', () => this.togglePanel());
      }
    }

    // ========== 核心：记录事件 ==========

    log(type, data) {
      var snapshot = this.getGameSnapshot ? this.getGameSnapshot() : {};
      var players = snapshot.players || [];
      var activeBets = 0;
      var playerChips = {};
      for (var i = 0; i < players.length; i++) {
        activeBets += (players[i].currentBet || 0);
        playerChips[players[i].name] = players[i].chips;
      }

      var entry = {
        type: type,
        phase: snapshot.phase || 'unknown',
        pot: (snapshot.pot || 0) + activeBets,
        chips: playerChips
      };
      // 合并 data
      if (data) {
        for (var key in data) {
          if (data.hasOwnProperty(key)) entry[key] = data[key];
        }
      }

      this.entries.push(entry);
    }

    clear() {
      this.entries = [];
      if (this.ui.panel) this.ui.panel.style.display = 'none';
      if (this.ui.btnCopy) this.ui.btnCopy.style.display = 'none';
    }

    /**
     * 归档当前局到 roundHistory，准备下一局
     * @param {object} context - buildLogContext() 的结果
     */
    archiveRound(context) {
      context = context || {};
      this.sessionRound++;
      if (this.sessionRound === 1 && context.initialChips) {
        this._sessionStartChips = context.initialChips;
      }
      var result = filterLog(this.entries);
      // 单局摘要
      var summary = {
        round: this.sessionRound,
        fundsDelta: context.fundsDelta || 0,
        fundsUp: context.fundsUp || 0,
        fundsDown: context.fundsDown || 0,
        endChips: context.players ? (context.players.find(function(p) { return p.chips != null; }) || {}).chips : 0,
        resultMsg: context._resultMsg || '',
        eventCount: result.stats.kept,
        t0: result.stats.t0,
        t1: result.stats.t1
      };
      // 用 hero 的筹码
      if (context.players) {
        for (var i = 0; i < context.players.length; i++) {
          if (context.players[i].isHero) { summary.endChips = context.players[i].chips; break; }
        }
        // fallback: 第一个玩家
        if (!summary.endChips && context.players.length > 0) summary.endChips = context.players[0].chips;
      }
      this.roundHistory.push({
        round: this.sessionRound,
        entries: this.entries.slice(),
        context: context,
        summary: summary
      });
      // 清空当前局 entries，但不清 session
      this.entries = [];
    }

    /**
     * 重置整个 session（重新开始 / SL）
     */
    resetSession() {
      this.entries = [];
      this.roundHistory = [];
      this.sessionRound = 0;
      this._sessionStartChips = 0;
      this._lastContext = null;
      if (this.ui.panel) this.ui.panel.style.display = 'none';
      if (this.ui.btnCopy) this.ui.btnCopy.style.display = 'none';
    }

    /**
     * 获取 session 总局数 (含已归档 + 当前进行中)
     */
    getSessionRoundCount() {
      return this.roundHistory.length;
    }

    // ========== 清洗 + 格式化 ==========

    /**
     * 生成清洗后的可读日志文本 (用于面板显示)
     */
    generateText(context) {
      context = context || {};
      var result = filterLog(this.entries);
      var revealMap = getShowdownRevealMap(this.entries);
      var lines = [];
      var totalRounds = this.roundHistory.length + (this.entries.length > 0 ? 1 : 0);
      var currentRound = this.roundHistory.length + 1;

      lines.push('═══════════════════════════════════════════');
      if (totalRounds > 1) {
        lines.push('ACEZERO 牌局日志 - ' + (context.playerCount || '?') + ' 名玩家 (共 ' + totalRounds + ' 局)');
      } else {
        lines.push('ACEZERO 牌局日志 - ' + (context.playerCount || '?') + ' 名玩家');
      }
      lines.push('═══════════════════════════════════════════');
      lines.push('');

      // 游戏设置
      lines.push('【设置】');
      lines.push('  筹码: ' + Currency.compact(context.initialChips || 1000));
      lines.push('  盲注: SB ' + Currency.amount(context.smallBlind || 10) + ' / BB ' + Currency.amount(context.bigBlind || 20));
      if (context.playerNames) {
        lines.push('  玩家: ' + _mapHeroNames(context.playerNames, context).join(', '));
      }
      lines.push('');

      // 历史局摘要
      if (this.roundHistory.length > 0) {
        lines.push('【历史局摘要】');
        lines.push('───────────────────────────────────────────');
        for (var h = 0; h < this.roundHistory.length; h++) {
          var rh = this.roundHistory[h];
          var s = rh.summary;
          var deltaStr = s.fundsDelta > 0 ? '+' + Currency.compact(s.fundsDelta) : s.fundsDelta < 0 ? '-' + Currency.compact(-s.fundsDelta) : '±0';
          lines.push('  第' + s.round + '局: ' + deltaStr + ' (事件:' + s.eventCount + ' T0:' + s.t0 + ' T1:' + s.t1 + ')' + (s.resultMsg ? ' — ' + s.resultMsg : ''));
        }
        lines.push('');
      }

      // 当前局标题
      if (totalRounds > 1) {
        lines.push('【第' + currentRound + '局】');
        lines.push('───────────────────────────────────────────');
      }

      // 最终手牌
      if (context.players) {
        lines.push('【最终手牌】');
        var shownCount = 0;
        for (var p = 0; p < context.players.length; p++) {
          var pl = context.players[p];
          if (!revealMap[pl.name]) continue;
          shownCount++;
          lines.push('  ' + _replaceHeroNameInText(pl.name, context) + ': ' + (pl.cardsStr || '[未知]'));
        }
        if (shownCount === 0) lines.push('  (本局无人亮牌)');
        if (context.boardStr) {
          lines.push('  公共牌: ' + context.boardStr);
        }
        lines.push('');
      }

      // 行动日志
      lines.push('【行动日志】');
      lines.push('───────────────────────────────────────────');

      var currentPhase = '';
      for (var i = 0; i < result.filtered.length; i++) {
        var item = result.filtered[i];
        var entry = item.entry || {};
        // 阶段分隔
        if (entry.phase && entry.phase !== currentPhase) {
          currentPhase = entry.phase;
          lines.push('');
          lines.push('▶ ' + currentPhase.toUpperCase());
        }
        lines.push('  ' + item.text);
      }

      lines.push('');

      // Session 总汇
      if (this.roundHistory.length > 0) {
        var sessionDelta = this._calcSessionDelta(context);
        lines.push('───────────────────────────────────────────');
        lines.push('【Session 总汇】共 ' + totalRounds + ' 局');
        var sDeltaStr = sessionDelta > 0 ? '+' + Currency.compact(sessionDelta) : sessionDelta < 0 ? '-' + Currency.compact(-sessionDelta) : '±0';
        lines.push('  累计盈亏: ' + sDeltaStr);
        lines.push('');
      }

      lines.push('═══════════════════════════════════════════');
      lines.push('统计: ' + result.stats.total + ' 条原始 → ' + result.stats.kept + ' 条有效 (T0:' + result.stats.t0 + ' T1:' + result.stats.t1 + ' T2:' + result.stats.t2 + ' T3:' + result.stats.t3 + ')');

      return _replaceHeroNameInText(lines.join('\n'), context);
    }

    /**
     * 生成 AI 叙事提示词 (清洗日志 + 提示词模板)
     */
    generateAIPrompt(context) {
      context = context || {};
      var roundsForPrompt = [];
      for (var h = 0; h < this.roundHistory.length; h++) {
        var hr = this.roundHistory[h];
        roundsForPrompt.push({
          round: hr.round,
          result: filterLog(hr.entries || []),
          context: hr.context || {}
        });
      }
      if (this.entries.length > 0) {
        roundsForPrompt.push({
          round: this.roundHistory.length + 1,
          result: filterLog(this.entries),
          context: context
        });
      }
      if (roundsForPrompt.length === 0) {
        roundsForPrompt.push({ round: 1, result: filterLog([]), context: context });
      }

      var totalRounds = roundsForPrompt.length;
      var currentRound = roundsForPrompt[roundsForPrompt.length - 1].round;

      // 聚合统计 (所有局)
      var stats = { total: 0, kept: 0, deleted: 0, t0: 0, t1: 0, t2: 0, t3: 0, narrativeScore: 0 };
      for (var sIdx = 0; sIdx < roundsForPrompt.length; sIdx++) {
        var st = roundsForPrompt[sIdx].result.stats;
        stats.total += st.total || 0;
        stats.kept += st.kept || 0;
        stats.deleted += st.deleted || 0;
        stats.t0 += st.t0 || 0;
        stats.t1 += st.t1 || 0;
        stats.t2 += st.t2 || 0;
        stats.t3 += st.t3 || 0;
        stats.narrativeScore += st.narrativeScore || 0;
      }

      // 构建清洗后的日志文本（每一局完整展开）
      var processLog = buildPromptLog(roundsForPrompt, context);

      // 资金变化：多局累计（避免已归档局 + 当前context重复计入）
      var sessionDeltaTotal = 0;
      for (var d = 0; d < roundsForPrompt.length; d++) {
        var rc = roundsForPrompt[d].context || {};
        if (typeof rc.fundsDelta === 'number') {
          sessionDeltaTotal += rc.fundsDelta;
        } else if (rc.fundsUp > 0) {
          sessionDeltaTotal += rc.fundsUp;
        } else if (rc.fundsDown > 0) {
          sessionDeltaTotal -= rc.fundsDown;
        }
      }

      // 计算推荐字数 (多局加成)
      var wordCount = calculateWordCount(stats, context);
      if (totalRounds > 1) {
        // 多局时：每多一局 +8% 字数，上限 ×1.45
        var multiRoundMult = Math.min(1.45, 1 + (totalRounds - 1) * 0.08);
        wordCount.recommended = Math.round(wordCount.recommended * multiRoundMult);
        wordCount.min = Math.max(280, wordCount.recommended - 120);
        wordCount.max = Math.min(3200, wordCount.recommended + 180);
      }

      // 构建结果摘要
      var resultSummary = '';
      if (context.players) {
        var latestRound = roundsForPrompt[roundsForPrompt.length - 1];
        var latestEntries = latestRound && latestRound.result && latestRound.result.filtered
          ? latestRound.result.filtered.map(function (item) { return item.entry; })
          : this.entries;
        var revealMap = getShowdownRevealMap(latestEntries);
        var summaryParts = [];
        if (totalRounds > 1) {
          summaryParts.push('[CURRENT HAND RESULT] Hand ' + currentRound + ' / ' + totalRounds);
        }
        summaryParts.push('Players: ' + _mapHeroNames(context.playerNames || [], context).join(', '));
        var majorNpcLines = buildMajorNpcLines(context);
        for (var mn = 0; mn < majorNpcLines.length; mn++) {
          summaryParts.push(majorNpcLines[mn]);
        }
        summaryParts.push('Starting Chips: ' + Currency.compact(context.initialChips || 1000));
        summaryParts.push('Blinds: ' + Currency.amount(context.smallBlind || 10) + '/' + Currency.amount(context.bigBlind || 20));
        for (var p = 0; p < context.players.length; p++) {
          var pl = context.players[p];
          summaryParts.push(_replaceHeroNameInText(pl.name, context) + ' Chips: ' + Currency.compact(pl.chips || 0));
        }
        if (context.heroMana && context.heroMana.max > 0) {
          summaryParts.push('Mana: ' + context.heroMana.current + '/' + context.heroMana.max);
        }
        resultSummary = summaryParts.join('\n');
      }

      // Session 总汇
      if (totalRounds > 1) {
        var sDeltaStr = sessionDeltaTotal > 0 ? '+' + Currency.compact(sessionDeltaTotal) : sessionDeltaTotal < 0 ? '-' + Currency.compact(-sessionDeltaTotal) : '±0';
        resultSummary += '\n\n[SESSION SUMMARY] Hands: ' + totalRounds + ', Net: ' + sDeltaStr;
      }

      var roundLabel = totalRounds > 1 ? '(第' + currentRound + '/' + totalRounds + '局) ' : '';
      var wordRequirement = roundLabel + '本次牌局共 ' + stats.total + ' 条原始日志，清洗后 ' + stats.kept + ' 条有效事件 (T0:' + stats.t0 + ' T1:' + stats.t1 + ' T2:' + stats.t2 + ' T3:' + stats.t3 + ')，正文参考字数: ' + wordCount.min + '~' + wordCount.max + ' 字（可围绕关键局适度浮动）';

      console.log('[GameLogger] 日志清洗完成: ' + stats.total + ' → ' + stats.kept + ' (删除 ' + stats.deleted + '), 叙事分: ' + stats.narrativeScore.toFixed(1) + ', 推荐字数: ' + wordCount.min + '~' + wordCount.max + (totalRounds > 1 ? ' (session ' + totalRounds + '局)' : ''));

      var fundsInstruction;
      var sessionDeltaFunds = _formatFundsValueFromSilver(Math.abs(sessionDeltaTotal || 0));
      if (sessionDeltaTotal > 0) {
        fundsInstruction = '主角本session共赢了 ' + Currency.amount(sessionDeltaTotal) + '(' + sessionDeltaFunds + 'funds)，请你更新相关变量，如有其他特殊赌局收益，请补充对应金额的 UpdateVariable。';
      } else if (sessionDeltaTotal < 0) {
        fundsInstruction = '主角本session共亏了 ' + Currency.amount(-sessionDeltaTotal) + '(' + sessionDeltaFunds + 'funds)，请你更新相关变量。如有其他特殊赌局损失，请补充对应金额的 UpdateVariable。';
      } else {
        fundsInstruction = '主角本session不赚不亏，请你更新相关变量。如有其他特殊赌局收益/损失，请补充对应金额的 UpdateVariable。';
      }

      var variableRules = [
        '1. 变量变更只准按本次牌局日志与结算写，禁止脑补。',
        '2. 金钱只看【POKER_RESULT】和【FUNDS_UPDATE】',
        '3. 魔运 / mana 只有日志或结算明确写出时才更新；技能使用、好运抽取、命运偏转不自动等于局外 mana 变化。'
      ].join('\n');

      // 多局写作指导
      var writingNote = '请立即生成牌局实况文案，建议字数参考 ' + wordCount.min + '~' + wordCount.max + ' 字，并优先保证节奏与重点局质量。';
      if (totalRounds > 1) {
        writingNote += '\n注意: 本session共 ' + totalRounds + ' 局连续对战。按局次推进（第1局到第' + currentRound + '局），但要主次分明、有呼吸感：关键局重点描写，非关键局用更凝练笔触交代转折与结果。';
      }

      // 组装最终提示词
      var finalContent = [
        '<CORE_TASK>',
        '核心任务: 基于下方的「牌局日志」与「结算」，将整个 session 的多局连续对战重构为充满画面感的小说级牌局实况（不是只写单局）。',
        '',
        '【核心原则】',
        '1. 去数据化: 严禁使用"底池X金弗"、"跟注X.XX金弗"等原始数据。通过筹码推动声、表情变化、手指动作来体现下注。',
        '2. 多局连续叙事: 默认按多局 session 创作并按局次推进（第1局→第2局→...→当前局），但要主次分明、节奏有呼吸感。关键局重点深描，非关键局简练交代，不平均用力。',
        '3. 心理博弈: 每次加注/弃牌背后都有心理活动。描写眼神交锋、微表情、犹豫与决断。',
        '4. 对手台词与演绎(硬性): 每一局都必须出现对手/NPC可感知的发言（挑衅、试探、伪装、施压、嘲讽、诱导等）与对应情绪演绎；不得将对手写成沉默工具人，禁止全程无台词。',
        '5. 台词真实性: 台词要短促、带场景目的，并与当下行动强绑定（例如加注时施压、弃牌前嘴硬、诈唬时虚张声势），避免空泛套路和无意义对白。',
        '6. 命运系统: 技能使用是超自然力量介入。大吉=命运偏转、先知=预见未来、空白=虚无侵蚀。用视觉特效描写。',
        '7. 节奏控制: 关键局可完整展开到翻牌前/翻牌/转牌/河牌，非关键局可压缩叙述，但转折与输赢结果必须交代清楚。',
        '8. 角色塑造: 每个NPC有独特的打牌风格和性格。通过小动作和台词体现。',
        '</CORE_TASK>',
        '',
        '<POKER_LOG>',
        processLog,
        '</POKER_LOG>',
        '',
        '<POKER_RESULT>',
        resultSummary,
        '</POKER_RESULT>',
        '',
        '<FUNDS_UPDATE>',
        fundsInstruction,
        '</FUNDS_UPDATE>',
        '',
        '<LOG_RULES>',
        variableRules,
        '</LOG_RULES>',
        '',
        '<WRITING_INSTRUCTION>',
        writingNote,
        '</WRITING_INSTRUCTION>'
      ].join('\n');

      return _replaceHeroNameInText(finalContent, context);
    }

    /**
     * 计算整个 session 的累计盈亏
     */
    _calcSessionDelta(currentContext) {
      var total = 0;
      for (var i = 0; i < this.roundHistory.length; i++) {
        total += (this.roundHistory[i].summary.fundsDelta || 0);
      }
      // 加上当前局
      if (currentContext) {
        total += (currentContext.fundsDelta || 0);
      }
      return total;
    }

    // ========== UI 控制 ==========

    show(context) {
      if (!this.ui.content || !this.ui.panel) return;
      this._lastContext = context;
      this.ui.content.textContent = this.generateText(context);
      this.ui.panel.style.display = 'block';
      if (this.ui.btnCopy) this.ui.btnCopy.style.display = 'inline-block';
    }

    togglePanel() {
      if (!this.ui.panel) return;
      if (this.ui.panel.style.display === 'none') {
        this.ui.panel.style.display = 'block';
        if (this.ui.btnToggle) this.ui.btnToggle.textContent = 'Hide';
      } else {
        this.ui.panel.style.display = 'none';
        if (this.ui.btnToggle) this.ui.btnToggle.textContent = 'Show';
      }
    }

    // ========== 复制系统 (iframe 兼容) ==========

    /**
     * 复制清洗后的日志 (面板显示用)
     */
    copyToClipboard(context) {
      var text = this.generateText(context);
      this._copyText(text);
    }

    /**
     * 复制 AI 提示词 (完整提示词模板)
     */
    copyAIPrompt(context) {
      var text = this.generateAIPrompt(context);
      this._copyText(text);
    }

    _copyText(text) {
      var self = this;
      var done = function () {
        if (self.ui.btnCopy) {
          self.ui.btnCopy.textContent = '✓ Copied!';
          setTimeout(function () { self.ui.btnCopy.textContent = '📋 Copy'; }, 2000);
        }
      };
      var fallback = function () {
        try {
          var ta = document.createElement('textarea');
          ta.value = text;
          ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          done();
        } catch (e) {
          console.warn('[GameLogger] 复制失败:', e);
        }
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(fallback);
      } else {
        fallback();
      }
    }
  }

  // ========== 导出 ==========
  global.GameLogger = GameLogger;

  // 导出工具函数供调试/测试
  global.GameLogger.filterLog = filterLog;
  global.GameLogger.classifyEntry = classifyEntry;
  global.GameLogger.calculateWordCount = calculateWordCount;
  global.GameLogger.TIER_SCORES = TIER_SCORES;

})(typeof window !== 'undefined' ? window : global);
