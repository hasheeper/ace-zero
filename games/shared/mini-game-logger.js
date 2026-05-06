/**
 * ===========================================
 * MINI-GAME-LOGGER.JS — 小游戏日志 & 回合结算弹窗
 * ===========================================
 *
 * 职责:
 * - 记录小游戏结构化事件 (下注、技能、发牌、结算)
 * - 生成可读日志文本
 * - 生成 AI 叙事提示词 (复制到剪贴板)
 * - 回合结束后弹出结算弹窗 (结果 + NEW ROUND + COPY TO AI)
 *
 * 用法:
 *   var logger = new MiniGameLogger({ gameName: '夺金廿一', gameKey: 'blackjack' });
 *   logger.log('BET', { amount: 100, side: 'player' });
 *   logger.log('DEAL', { desc: '玩家: K♠ 7♥ = 17, 庄家: A♣ [?]' });
 *   logger.log('SKILL', { skill: '幸运一击', attr: 'moirai', cost: 15, result: '完全成功' });
 *   logger.log('RESULT', { desc: '玩家胜！', winnings: 100 });
 *   logger.showEndRound({ resultText: '玩家胜！赢得 100', ... });
 */
(function (global) {
  'use strict';

  // ============================================
  //  事件格式化
  // ============================================

  var TYPE_LABEL = {
    BET:      '下注',
    DEAL:     '发牌',
    ACTION:   '行动',
    SKILL:    '技能',
    FORCE:    '力场',
    REVEAL:   '揭牌',
    RESULT:   '结算',
    INFO:     '信息'
  };

  function formatEntry(entry) {
    var label = TYPE_LABEL[entry.type] || entry.type;
    var desc = entry.desc || '';

    switch (entry.type) {
      case 'BET':
        var amt = entry.amount || 0;
        var side = entry.side ? '(' + entry.side + ')' : '';
        var amtStr = global.Currency ? Currency.amount(amt) : String(amt);
        return '[' + label + '] ' + amtStr + ' ' + side;
      case 'DEAL':
        return '[' + label + '] ' + desc;
      case 'ACTION':
        return '[' + label + '] ' + (entry.action || '') + (desc ? ' — ' + desc : '');
      case 'SKILL':
        var attr = entry.attr ? ' (' + entry.attr + ')' : '';
        var cost = entry.cost ? ' -' + entry.cost + 'MP' : '';
        var res  = entry.result ? ' → ' + entry.result : '';
        return '[' + label + '] ' + (entry.skill || '?') + attr + cost + res;
      case 'FORCE':
        return '[' + label + '] ' + (entry.skill || '') + (entry.result ? ' → ' + entry.result : '');
      case 'REVEAL':
        return '[' + label + '] ' + desc;
      case 'RESULT':
        return '[' + label + '] ' + desc;
      default:
        return '[' + label + '] ' + desc;
    }
  }

  // ============================================
  //  AI 提示词生成
  // ============================================

  function _amt(v) {
    return global.Currency ? Currency.amount(v) : String(v);
  }
  function _compact(v) {
    return global.Currency ? Currency.compact(v) : String(v);
  }
  function _fundsValue(v) {
    var amount = (Math.round(Number(v) || 0) / 100).toFixed(2);
    return amount.replace(/\.?0+$/, '');
  }
  function generateAIPrompt(gameName, entries, context, roundHistory, totalRounds, currentRound) {
    context = context || {};
    roundHistory = roundHistory || [];
    entries = entries || [];

    // 统一轮次数据：历史局 + 当前未归档局（如果有）
    var roundsForPrompt = [];
    for (var h = 0; h < roundHistory.length; h++) {
      roundsForPrompt.push({
        round: roundHistory[h].round || (h + 1),
        entries: roundHistory[h].entries || [],
        context: roundHistory[h].context || {}
      });
    }
    if (entries.length > 0) {
      roundsForPrompt.push({
        round: roundHistory.length + 1,
        entries: entries,
        context: context
      });
    }
    if (roundsForPrompt.length === 0) {
      roundsForPrompt.push({ round: 1, entries: [], context: context });
    }

    totalRounds = roundsForPrompt.length;
    currentRound = roundsForPrompt[roundsForPrompt.length - 1].round;

    // 构建日志行（每一局完整展开）
    var logLines = [];

    for (var r = 0; r < roundsForPrompt.length; r++) {
      var rr = roundsForPrompt[r];
      logLines.push('【第' + rr.round + '局 详细日志】');
      if (!rr.entries || rr.entries.length === 0) {
        logLines.push('> [INFO] 本局无可用日志');
      } else {
        for (var i = 0; i < rr.entries.length; i++) {
          logLines.push('> ' + formatEntry(rr.entries[i]));
        }
      }
      if (r < roundsForPrompt.length - 1) logLines.push('');
    }
    var processLog = logLines.join('\n');

    // 基本信息
    var infoLines = [];
    infoLines.push('游戏: ' + gameName);
    if (context.playerName) infoLines.push('玩家: ' + context.playerName);
    if (totalRounds > 1) infoLines.push('当前: 第' + currentRound + '/' + totalRounds + '局');
    if (context.startingChips != null) infoLines.push('本局初始筹码: ' + _compact(context.startingChips));
    if (context.endingChips != null) infoLines.push('剩余筹码: ' + _compact(context.endingChips));
    if (context.betAmount != null) infoLines.push('本局下注: ' + _amt(context.betAmount));
    if (context.mana) infoLines.push('Mana: ' + context.mana.current + '/' + context.mana.max);
    var resultSummary = infoLines.join('\n');
    if (context.resultText) resultSummary += '\n结果: ' + context.resultText;

    // Session 总汇（已归档局 + 当前未归档局）
    if (totalRounds > 1) {
      var sessionTotal = 0;
      for (var j = 0; j < roundHistory.length; j++) sessionTotal += (roundHistory[j].summary.fundsDelta || 0);
      if (entries.length > 0) {
        sessionTotal += ((context.endingChips || 0) - (context.startingChips || 0));
      }
      var sDStr = sessionTotal > 0 ? '+' + _compact(sessionTotal) : sessionTotal < 0 ? '-' + _compact(-sessionTotal) : '±0';
      resultSummary += '\n\n【Session 总汇】共 ' + totalRounds + ' 局，累计盈亏: ' + sDStr;
    }

    // 资金变化：多局累计（避免已归档后重复计入当前局）
    var sessionDelta = 0;
    for (var k = 0; k < roundHistory.length; k++) sessionDelta += (roundHistory[k].summary.fundsDelta || 0);
    if (entries.length > 0) {
      sessionDelta += ((context.endingChips || 0) - (context.startingChips || 0));
    }

    var fundsLine = '';
    if (sessionDelta > 0) {
      fundsLine = '主角本session共赢了 ' + _amt(sessionDelta) + '(' + _fundsValue(sessionDelta) + 'funds)，更新变量，如有其他特殊赌局收益/损失，请补充对应金额的 UpdateVariable。';
    } else if (sessionDelta < 0) {
      fundsLine = '主角本session共亏了 ' + _amt(-sessionDelta) + '(' + _fundsValue(-sessionDelta) + 'funds)，更新变量，如有其他特殊赌局收益/损失，请补充对应金额的 UpdateVariable。';
    } else {
      fundsLine = '主角本session不赚不亏，如有其他特殊赌局收益/损失，请补充对应金额的 UpdateVariable。';
    }

    // 推荐字数 (简化版 + 多局加成)
    var eventCount = 0;
    var hasSkills = false;
    for (var eidx = 0; eidx < roundsForPrompt.length; eidx++) {
      var re = roundsForPrompt[eidx].entries || [];
      eventCount += re.length;
      if (!hasSkills) {
        hasSkills = re.some(function (e) { return e.type === 'SKILL' || e.type === 'FORCE'; });
      }
    }
    var baseWords = 380;
    baseWords += eventCount * 26;
    if (hasSkills) baseWords += 190;
    if (Math.abs(sessionDelta) > 200) baseWords += 140;
    // 多局加成
    if (totalRounds > 1) {
      var multiMult = Math.min(2.2, 1 + (totalRounds - 1) * 0.18);
      baseWords = Math.round(baseWords * multiMult);
    }
    var minWords = Math.max(360, Math.min(3600, baseWords - 120));
    var maxWords = Math.max(620, Math.min(4600, baseWords + 160));

    // 多局写作指导
    var writingNote = '请立即生成 ' + minWords + '~' + maxWords + ' 字的' + gameName + '对局实况文案 (最低不少于 ' + minWords + ' 字)';
    if (totalRounds > 1) {
      writingNote += '\n注意: 本session共 ' + totalRounds + ' 局连续对战。必须按局次完整覆盖每一局（第1局到第' + currentRound + '局），不能只写“前局回顾”后略写后续局。';
    }

    var roundLabel = totalRounds > 1 ? '(第' + currentRound + '/' + totalRounds + '局) ' : '';

    // 组装
    var content = [
      '<CORE_TASK>',
      '核心任务: 基于下方的「' + gameName + '对局日志」与「结算」，将枯燥的数据重构为充满画面感的小说级赌局实况。',
      '',
      '【字数要求】' + roundLabel + '推荐正文字数: ' + minWords + '~' + maxWords + ' 字 (不少于 ' + minWords + ' 字)',
      '',
      '【核心原则】',
      '1. 去数据化: 严禁使用"下注X.XX金弗"等原始数据。通过筹码推动声、表情变化、手指动作来体现下注。',
      '2. 心理博弈: 每次下注背后都有心理活动。描写表情、犹豫与决断。',
      '3. 命运系统: 技能使用是超自然力量介入。用视觉特效描写强运/厄运/灵视的力场对抗。',
      '4. 氛围营造: 赌桌的紧张感、周围的环境音、光影变化。',
      '</CORE_TASK>',
      '',
      '<GAME_LOG>',
      processLog,
      '</GAME_LOG>',
      '',
      '<GAME_RESULT>',
      resultSummary,
      '</GAME_RESULT>',
      '',
      '<VARIABLE_UPDATE_HINT>',
      fundsLine,
      '</VARIABLE_UPDATE_HINT>',
      '',
      '<WRITING_INSTRUCTION>',
      writingNote,
      '</WRITING_INSTRUCTION>'
    ].join('\n');

    return content;
  }

  // ============================================
  //  生成可读文本
  // ============================================

  function generateText(gameName, entries, context) {
    context = context || {};
    var lines = [];

    lines.push('═══════════════════════════════════════════');
    lines.push('ACEZERO ' + gameName + ' 对局日志');
    lines.push('═══════════════════════════════════════════');
    lines.push('');

    if (context.playerName) lines.push('玩家: ' + context.playerName);
    if (context.round) lines.push('回合: ' + context.round);
    lines.push('');

    lines.push('【行动日志】');
    lines.push('───────────────────────────────────────────');
    for (var i = 0; i < entries.length; i++) {
      lines.push('  ' + formatEntry(entries[i]));
    }

    lines.push('');
    if (context.resultText) {
      lines.push('【结果】 ' + context.resultText);
    }
    lines.push('═══════════════════════════════════════════');
    lines.push('共 ' + entries.length + ' 条事件');

    return lines.join('\n');
  }

  // ============================================
  //  剪贴板 (iframe 兼容)
  // ============================================

  function copyText(text, btnEl) {
    var done = function () {
      if (btnEl) {
        var orig = btnEl.textContent;
        btnEl.textContent = '✓ Copied!';
        setTimeout(function () { btnEl.textContent = orig; }, 2000);
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
        console.warn('[MiniGameLogger] 复制失败:', e);
      }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(fallback);
    } else {
      fallback();
    }
  }

  // ============================================
  //  结算弹窗 DOM (自动注入)
  // ============================================

  function createModalDOM() {
    var overlay = document.createElement('div');
    overlay.id = 'mg-endround-modal';
    overlay.className = 'mg-endround-modal hidden';

    overlay.innerHTML = [
      '<div class="mg-endround-inner">',
      '  <div class="mg-endround-result" id="mg-endround-result"></div>',
      '  <div class="mg-endround-detail" id="mg-endround-detail"></div>',
      '  <div class="mg-endround-actions">',
      '    <button class="btn-cmd" id="mg-btn-copy-ai">COPY TO AI</button>',
      '    <button class="btn-cmd primary" id="mg-btn-continue">CONTINUE</button>',
      '    <button class="btn-cmd" id="mg-btn-restart">RESTART</button>',
      '  </div>',
      '</div>'
    ].join('\n');

    document.body.appendChild(overlay);
    return overlay;
  }

  // ============================================
  //  MiniGameLogger 类
  // ============================================

  function MiniGameLogger(opts) {
    opts = opts || {};
    this.gameName = opts.gameName || '小游戏';
    this.gameKey = opts.gameKey || 'unknown';
    this.entries = [];
    this._lastContext = null;
    this._onNewRound = opts.onNewRound || null;   // 继续下一局 (保留筹码/mana)
    this._onRestart = opts.onRestart || null;     // 重新开始 (全部重置)

    // ===== 多局 Session 追踪 =====
    this.roundHistory = [];   // [{ round, entries, context, summary }]
    this.sessionRound = 0;
    this._sessionStartChips = 0;

    // 自动注入弹窗 DOM
    this._modal = document.getElementById('mg-endround-modal') || createModalDOM();
    this._resultEl  = document.getElementById('mg-endround-result');
    this._detailEl  = document.getElementById('mg-endround-detail');
    this._btnCopy   = document.getElementById('mg-btn-copy-ai');
    this._btnContinue = document.getElementById('mg-btn-continue');
    this._btnRestart  = document.getElementById('mg-btn-restart');

    var self = this;
    if (this._btnCopy) {
      this._btnCopy.addEventListener('click', function () {
        var text = self.generateAIPrompt(self._lastContext);
        copyText(text, self._btnCopy);
      });
    }
    if (this._btnContinue) {
      this._btnContinue.addEventListener('click', function () {
        self.hideEndRound();
        if (self._onNewRound) self._onNewRound();
      });
    }
    if (this._btnRestart) {
      this._btnRestart.addEventListener('click', function () {
        self.hideEndRound();
        self.resetSession();
        if (self._onRestart) self._onRestart();
      });
    }
  }

  // ---- 日志记录 ----

  MiniGameLogger.prototype.log = function (type, data) {
    var entry = { type: type };
    if (data) {
      for (var key in data) {
        if (data.hasOwnProperty(key)) entry[key] = data[key];
      }
    }
    this.entries.push(entry);
  };

  MiniGameLogger.prototype.clear = function () {
    this.entries = [];
    this._lastContext = null;
  };

  /**
   * 归档当前局到 roundHistory
   * @param {object} context - showEndRound 传入的 context
   */
  MiniGameLogger.prototype.archiveRound = function (context) {
    context = context || {};
    this.sessionRound++;
    if (this.sessionRound === 1 && context.startingChips != null) {
      this._sessionStartChips = context.startingChips;
    }
    var delta = (context.endingChips || 0) - (context.startingChips || 0);
    var summary = {
      round: this.sessionRound,
      fundsDelta: delta,
      endChips: context.endingChips || 0,
      resultText: context.resultText || '',
      eventCount: this.entries.length,
      isWin: !!context.isWin,
      isLose: !!context.isLose
    };
    this.roundHistory.push({
      round: this.sessionRound,
      entries: this.entries.slice(),
      context: context,
      summary: summary
    });
    this.entries = [];
  };

  /**
   * 重置整个 session（重新开始 / SL）
   */
  MiniGameLogger.prototype.resetSession = function () {
    this.entries = [];
    this.roundHistory = [];
    this.sessionRound = 0;
    this._sessionStartChips = 0;
    this._lastContext = null;
  };

  MiniGameLogger.prototype.getSessionRoundCount = function () {
    return this.roundHistory.length;
  };

  MiniGameLogger.prototype._calcSessionDelta = function (currentContext) {
    var total = 0;
    for (var i = 0; i < this.roundHistory.length; i++) {
      total += (this.roundHistory[i].summary.fundsDelta || 0);
    }
    if (currentContext) {
      total += ((currentContext.endingChips || 0) - (currentContext.startingChips || 0));
    }
    return total;
  };

  // ---- 文本生成 ----

  MiniGameLogger.prototype.generateText = function (context) {
    context = context || this._lastContext || {};
    var totalRounds = this.roundHistory.length + (this.entries.length > 0 ? 1 : 0);
    var currentRound = this.roundHistory.length + 1;
    var lines = [];

    lines.push('═══════════════════════════════════════════');
    if (totalRounds > 1) {
      lines.push('ACEZERO ' + this.gameName + ' 对局日志 (共 ' + totalRounds + ' 局)');
    } else {
      lines.push('ACEZERO ' + this.gameName + ' 对局日志');
    }
    lines.push('═══════════════════════════════════════════');
    lines.push('');

    if (context.playerName) lines.push('玩家: ' + context.playerName);
    lines.push('');

    // 历史局摘要
    if (this.roundHistory.length > 0) {
      lines.push('【历史局摘要】');
      lines.push('───────────────────────────────────────────');
      for (var h = 0; h < this.roundHistory.length; h++) {
        var s = this.roundHistory[h].summary;
        var dStr = s.fundsDelta > 0 ? '+' + _amt(s.fundsDelta) : s.fundsDelta < 0 ? '-' + _amt(-s.fundsDelta) : '±0';
        lines.push('  第' + s.round + '局: ' + dStr + (s.resultText ? ' — ' + s.resultText : ''));
      }
      lines.push('');
    }

    // 当前局
    if (totalRounds > 1) {
      lines.push('【第' + currentRound + '局】');
      lines.push('───────────────────────────────────────────');
    }
    lines.push('【行动日志】');
    for (var i = 0; i < this.entries.length; i++) {
      lines.push('  ' + formatEntry(this.entries[i]));
    }
    lines.push('');
    if (context.resultText) lines.push('【结果】 ' + context.resultText);

    // Session 总汇
    if (this.roundHistory.length > 0) {
      var sessionDelta = this._calcSessionDelta(context);
      lines.push('');
      lines.push('───────────────────────────────────────────');
      lines.push('【Session 总汇】共 ' + totalRounds + ' 局');
      var sDStr = sessionDelta > 0 ? '+' + _amt(sessionDelta) : sessionDelta < 0 ? '-' + _amt(-sessionDelta) : '±0';
      lines.push('  累计盈亏: ' + sDStr);
    }

    lines.push('═══════════════════════════════════════════');
    lines.push('共 ' + this.entries.length + ' 条事件');
    return lines.join('\n');
  };

  MiniGameLogger.prototype.generateAIPrompt = function (context) {
    context = context || this._lastContext || {};
    var totalRounds = this.roundHistory.length + (this.entries.length > 0 ? 1 : 0);
    var currentRound = this.roundHistory.length + 1;
    return generateAIPrompt(this.gameName, this.entries, context, this.roundHistory, totalRounds, currentRound);
  };

  MiniGameLogger.prototype.copyAIPrompt = function (context) {
    var text = this.generateAIPrompt(context || this._lastContext);
    copyText(text, this._btnCopy);
  };

  // ---- 弹窗 ----

  MiniGameLogger.prototype.showEndRound = function (context) {
    context = context || {};
    this._lastContext = context;

    // 归档当前局
    this.archiveRound(context);

    // 结果文字
    if (this._resultEl) {
      this._resultEl.textContent = context.resultText || '回合结束';
      this._resultEl.className = 'mg-endround-result';
      if (context.isWin) this._resultEl.classList.add('win');
      else if (context.isLose) this._resultEl.classList.add('lose');
    }

    // 详情行
    var totalRounds = this.roundHistory.length;
    if (this._detailEl) {
      var parts = [];
      if (context.endingChips != null) {
        parts.push('余额: ' + (global.Currency ? Currency.html(context.endingChips) : context.endingChips));
      }
      parts.push('第 ' + totalRounds + ' 局');
      if (context.mana) parts.push('Mana: ' + context.mana.current + '/' + context.mana.max);
      // Session 累计
      if (totalRounds > 1) {
        var sDelta = this._calcSessionDelta(null); // 已全部归档，不需要 currentContext
        var sDStr = sDelta > 0 ? '+' + _amt(sDelta) : sDelta < 0 ? '-' + _amt(-sDelta) : '±0';
        parts.push('累计: ' + sDStr);
      }
      this._detailEl.innerHTML = parts.join(' &nbsp;·&nbsp; ');
    }

    // 筹码为零时禁用继续
    if (this._btnContinue) {
      this._btnContinue.disabled = (context.endingChips != null && context.endingChips <= 0);
    }

    // 显示
    if (this._modal) this._modal.classList.remove('hidden');
  };

  MiniGameLogger.prototype.hideEndRound = function () {
    if (this._modal) this._modal.classList.add('hidden');
  };

  // ---- 导出 ----
  global.MiniGameLogger = MiniGameLogger;

})(typeof window !== 'undefined' ? window : global);
