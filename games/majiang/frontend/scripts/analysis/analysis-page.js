(function(global) {
  'use strict';

  const COACH_STATE_STORAGE_KEY = 'acezero.majiang.coachState';
  const COACH_ANALYSIS_STATE_STORAGE_KEY = 'acezero.majiang.coachAnalysisState';
  const ALL_ROUNDS_ID = '__all_rounds__';

  const pageState = {
    selectedSubjectId: null,
    selectedRoundId: ALL_ROUNDS_ID
  };

  function getEl(id) {
    return document.getElementById(id);
  }

  function readJson(key) {
    try {
      const raw = global.localStorage ? global.localStorage.getItem(key) : null;
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function formatPercent(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '-';
    return `${Math.round(number * 100)}%`;
  }

  function formatCoachText(recommended) {
    if (!recommended || typeof recommended !== 'object') return '暂无动作建议';
    const parts = [];
    if (recommended.type) parts.push(`动作 ${recommended.type}`);
    if (recommended.tileCode) parts.push(`牌 ${recommended.tileCode}`);
    if (recommended.callType) parts.push(`副露 ${recommended.callType}`);
    if (recommended.meldString) parts.push(`组合 ${recommended.meldString}`);
    if (recommended.riichi) parts.push('立直');
    return parts.join(' · ') || '暂无动作建议';
  }

  function clearChildren(root) {
    if (!root) return;
    root.innerHTML = '';
    if (Array.isArray(root.children)) {
      root.children = [];
    }
  }

  function appendEmpty(root, text) {
    if (!root) return;
    root.innerHTML = `<div class="empty-state">${text}</div>`;
  }

  function createNode(className, html) {
    const node = document.createElement('div');
    node.className = className;
    node.innerHTML = html;
    return node;
  }

  function normalizeSummary(summary, fallbackLabel) {
    return {
      id: summary && summary.id ? summary.id : null,
      label: summary && summary.label ? summary.label : fallbackLabel || '-',
      total: Number(summary && summary.total) || 0,
      mortalRate: Number(summary && summary.mortalRate) || 0,
      actionTypeRate: Number(summary && summary.actionTypeRate) || 0,
      riichiRate: Number(summary && summary.riichiRate) || 0,
      goodCount: Number(summary && summary.goodCount) || 0,
      neutralCount: Number(summary && summary.neutralCount) || 0,
      badCount: Number(summary && summary.badCount) || 0,
      bucketCounts: summary && summary.bucketCounts ? summary.bucketCounts : {}
    };
  }

  function summarizeRows(rows, label) {
    const summary = normalizeSummary({ label, total: Array.isArray(rows) ? rows.length : 0 }, label);
    if (!Array.isArray(rows)) return summary;
    rows.forEach((row) => {
      const comparison = row && row.comparison ? row.comparison : null;
      const judgment = row && row.judgment ? row.judgment : null;
      if (comparison && comparison.exactMatch) summary.mortalRate += 1;
      if (comparison && comparison.typeMatch) summary.actionTypeRate += 1;
      if (comparison && comparison.riichiMatch) summary.riichiRate += 1;
      if (judgment && judgment.verdict === 'good') summary.goodCount += 1;
      else if (judgment && judgment.verdict === 'bad') summary.badCount += 1;
      else summary.neutralCount += 1;
      const bucket = judgment && judgment.bucket ? judgment.bucket : 'unknown';
      summary.bucketCounts[bucket] = (summary.bucketCounts[bucket] || 0) + 1;
    });
    if (summary.total > 0) {
      summary.mortalRate /= summary.total;
      summary.actionTypeRate /= summary.total;
      summary.riichiRate /= summary.total;
    }
    return summary;
  }

  function normalizeSubjectRows(subject) {
    if (subject && Array.isArray(subject.rows) && subject.rows.length) {
      return subject.rows;
    }
    const rows = [];
    const appendRows = (items, verdict) => {
      if (!Array.isArray(items)) return;
      items.forEach((item) => {
        rows.push({
          ...item,
          judgment: item && item.judgment ? item.judgment : { verdict, bucket: verdict }
        });
      });
    };
    appendRows(subject && subject.badHands, 'bad');
    appendRows(subject && subject.neutralHands, 'neutral');
    appendRows(subject && subject.goodHands, 'good');
    return rows;
  }

  function normalizeSubjects(report) {
    const subjects = report && Array.isArray(report.subjects) ? report.subjects : [];
    return subjects.map((subject) => ({
      ...subject,
      summary: normalizeSummary(subject && subject.summary, subject && subject.summary && subject.summary.label),
      rows: normalizeSubjectRows(subject)
    }));
  }

  function deriveRoundsFromSubjects(subjects) {
    const grouped = new Map();
    subjects.forEach((subject) => {
      subject.rows.forEach((row) => {
        const roundId = row && row.round && row.round.id ? row.round.id : 'legacy-round';
        const roundLabel = row && row.round && row.round.label ? row.round.label : '未标记局';
        if (!grouped.has(roundId)) {
          grouped.set(roundId, []);
        }
        grouped.get(roundId).push({
          ...row,
          round: {
            id: roundId,
            label: roundLabel
          }
        });
      });
    });
    return Array.from(grouped.entries()).map(([roundId, rows]) => ({
      summary: {
        ...summarizeRows(rows, rows[0] && rows[0].round && rows[0].round.label ? rows[0].round.label : roundId),
        id: roundId
      },
      rows
    }));
  }

  function deriveOverview(report, subjects) {
    if (report && report.overview) {
      return normalizeSummary(report.overview, report.overview.label || '全部样本');
    }
    const rows = subjects.flatMap((subject) => subject.rows);
    return summarizeRows(rows, '全部样本');
  }

  function ensureSelections(subjects, rounds) {
    if (!subjects.some((subject) => subject.summary && subject.summary.id === pageState.selectedSubjectId)) {
      pageState.selectedSubjectId = subjects[0] && subjects[0].summary ? subjects[0].summary.id : null;
    }
    const validRoundIds = [ALL_ROUNDS_ID].concat(rounds.map((round) => round.summary && round.summary.id));
    if (!validRoundIds.includes(pageState.selectedRoundId)) {
      pageState.selectedRoundId = ALL_ROUNDS_ID;
    }
  }

  function renderCoachState(state) {
    getEl('coach-status-pill').textContent = state && state.status ? state.status : '待命';
    getEl('coach-meta-line').textContent = state
      ? [state.source ? `来源 ${state.source}` : null, state.perspectiveSeat ? `视角 ${state.perspectiveSeat}` : null].filter(Boolean).join(' · ') || '已接入教练状态'
      : '等待游戏页写入教练状态';
    getEl('coach-summary-block').textContent = state && state.summary ? state.summary : '当前没有教练建议。';
    getEl('coach-recommend-block').textContent = state && state.humanRecommended ? state.humanRecommended : formatCoachText(state && state.recommended ? state.recommended : null);
    const reasons = state && Array.isArray(state.reasons) ? state.reasons.filter(Boolean) : [];
    const reasonSummary = state && state.reasonSummary ? state.reasonSummary : null;
    const coachReasonBlock = getEl('coach-reason-block');
    if (coachReasonBlock) {
      coachReasonBlock.innerHTML = [reasonSummary].concat(reasons).filter(Boolean).slice(0, 3)
        .map((item) => `<div class="detail-chip">${item}</div>`)
        .join('') || '<div class="empty-state">当前还没有解释理由。</div>';
    }
  }

  function bindSelect(selectEl, value, options, onChange) {
    if (!selectEl) return;
    selectEl.innerHTML = options.map((entry) => `<option value="${entry.value}">${entry.label}</option>`).join('');
    selectEl.value = value;
    if (typeof selectEl.addEventListener === 'function' && !selectEl.__bound) {
      selectEl.addEventListener('change', onChange);
      selectEl.__bound = true;
    }
  }

  function buildSelectionAbstract(summary, subject, roundLabel) {
    if (!subject) return '当前还没有可用分析。';
    const bucketEntries = Object.entries(summary.bucketCounts || {}).sort((a, b) => Number(b[1]) - Number(a[1]));
    const primaryBucket = bucketEntries[0] ? `${bucketEntries[0][0]}（${bucketEntries[0][1]}次）` : '暂无';
    return `${subject.summary.label} 在 ${roundLabel} 的样本里，参考一致率为 ${formatPercent(summary.mortalRate)}，动作族一致率为 ${formatPercent(summary.actionTypeRate)}，主要分歧集中在 ${primaryBucket}。`;
  }

  function buildConclusion(summary, roundId) {
    if (!summary || !summary.total) return '当前还没有总结结论。';
    const bucketEntries = Object.entries(summary.bucketCounts || {}).sort((a, b) => Number(b[1]) - Number(a[1]));
    const primaryBucket = bucketEntries[0] ? bucketEntries[0][0] : 'unknown';
    if (roundId !== ALL_ROUNDS_ID) {
      return `这一局建议先盯 ${primaryBucket}，然后逐手看每一步为什么和参考建议分开。当前恶手 ${summary.badCount} 条，中性 ${summary.neutralCount} 条，善手 ${summary.goodCount} 条。`;
    }
    return `全部局视角下，当前对象最主要的问题仍然是 ${primaryBucket}。建议先从恶手开始复盘，再回头看中性手是否属于风格差异。`;
  }

  function renderList(targetId, items, renderer, emptyText) {
    const root = getEl(targetId);
    clearChildren(root);
    if (!Array.isArray(items) || !items.length) {
      appendEmpty(root, emptyText);
      return;
    }
    items.forEach((item, index) => root.appendChild(renderer(item, index)));
  }

  function createHandCard(row, verdict) {
    const localTile = row && row.localDecision && row.localDecision.tileCode ? row.localDecision.tileCode : '-';
    const coachTile = row && row.coachDecision && row.coachDecision.tileCode ? row.coachDecision.tileCode : '-';
    const bucket = row && row.judgment && row.judgment.bucket ? row.judgment.bucket : '-';
    const node = createNode('hand-card', [
      `<div class="hand-title">${row && (row.label || row.id) ? (row.label || row.id) : '-'}</div>`,
      `<div class="hand-meta">bucket=${bucket} · 本地=${localTile} · 参考=${coachTile}</div>`
    ].join(''));
    node.dataset.verdict = verdict;
    return node;
  }

  function createActionCard(row, index) {
    const judgment = row && row.judgment ? row.judgment : null;
    const localTile = row && row.localDecision && row.localDecision.tileCode ? row.localDecision.tileCode : '-';
    const coachTile = row && row.coachDecision && row.coachDecision.tileCode ? row.coachDecision.tileCode : '-';
    const localType = row && row.localDecision && row.localDecision.type ? row.localDecision.type : '-';
    const coachType = row && row.coachDecision && row.coachDecision.type ? row.coachDecision.type : '-';
    const node = createNode('action-card', [
      `<div class="action-title"><span>${row && (row.label || row.id) ? (row.label || row.id) : '未命名动作'}</span><span class="action-step">第 ${index + 1} 项</span></div>`,
      `<div class="action-meta">判断=${judgment && judgment.verdict ? judgment.verdict : '-'} · bucket=${judgment && judgment.bucket ? judgment.bucket : '-'}</div>`,
      `<div class="action-detail">本地动作 ${localType} / ${localTile}，参考动作 ${coachType} / ${coachTile}</div>`
    ].join(''));
    node.dataset.verdict = judgment && judgment.verdict ? judgment.verdict : 'unknown';
    return node;
  }

  function renderAnalysisState(state) {
    const report = state && state.report ? state.report : null;
    const subjects = normalizeSubjects(report);
    const rounds = report && Array.isArray(report.rounds) && report.rounds.length
      ? report.rounds.map((round) => ({
          ...round,
          summary: normalizeSummary(round.summary, round.summary && round.summary.label)
        }))
      : deriveRoundsFromSubjects(subjects);
    const overview = deriveOverview(report, subjects);

    ensureSelections(subjects, rounds);

    bindSelect(
      getEl('player-select'),
      pageState.selectedSubjectId,
      subjects.map((subject) => ({
        value: subject.summary.id,
        label: subject.summary.label
      })),
      function(event) {
        pageState.selectedSubjectId = event && event.target ? event.target.value : null;
        syncAll();
      }
    );

    bindSelect(
      getEl('round-select'),
      pageState.selectedRoundId,
      [{ value: ALL_ROUNDS_ID, label: '全部局' }].concat(rounds.map((round) => ({
        value: round.summary.id,
        label: round.summary.label
      }))),
      function(event) {
        pageState.selectedRoundId = event && event.target ? event.target.value : ALL_ROUNDS_ID;
        syncAll();
      }
    );

    getEl('analysis-status-pill').textContent = state && state.status ? state.status : '待命';

    const subject = subjects.find((entry) => entry.summary.id === pageState.selectedSubjectId) || null;
    const roundLabel = pageState.selectedRoundId === ALL_ROUNDS_ID
      ? '全部局'
      : ((rounds.find((entry) => entry.summary.id === pageState.selectedRoundId) || {}).summary || {}).label || '未标记局';

    const selectedRows = subject
      ? (
          pageState.selectedRoundId === ALL_ROUNDS_ID
            ? subject.rows
            : subject.rows.filter((row) => row && row.round && row.round.id === pageState.selectedRoundId)
        )
      : [];
    const summary = subject ? summarizeRows(selectedRows, subject.summary.label) : normalizeSummary(null, '-');
    const focusBuckets = Object.entries(summary.bucketCounts || {}).sort((a, b) => Number(b[1]) - Number(a[1]));

    getEl('selection-title').textContent = subject ? `${subject.summary.label} · ${roundLabel}` : '等待分析对象';
    getEl('selection-subtitle').textContent = overview
      ? `当前总样本 ${overview.total} 条，当前筛选样本 ${summary.total} 条。`
      : '请选择玩家与局。';
    getEl('selection-abstract').textContent = buildSelectionAbstract(summary, subject, roundLabel);

    getEl('metric-mortal-rate').textContent = formatPercent(summary.mortalRate);
    getEl('metric-action-rate').textContent = formatPercent(summary.actionTypeRate);
    getEl('metric-riichi-rate').textContent = formatPercent(summary.riichiRate);
    getEl('metric-total').textContent = summary.total ? String(summary.total) : '-';

    getEl('conclusion-meta').textContent = state
      ? [state.source ? `来源 ${state.source}` : null, subject ? `对象 ${subject.summary.label}` : null, `范围 ${roundLabel}`].filter(Boolean).join(' · ')
      : '等待分析状态写入';
    getEl('selection-conclusion').textContent = buildConclusion(summary, pageState.selectedRoundId);

    renderList('focus-list', focusBuckets, ([bucket, count]) => createNode('focus-card', `<div class="focus-text">${bucket} · ${count}</div>`), '当前还没有重点分歧。');
    renderList('bad-hand-list', selectedRows.filter((row) => row && row.judgment && row.judgment.verdict === 'bad'), (row) => createHandCard(row, 'bad'), '当前没有恶手样本。');
    renderList('neutral-hand-list', selectedRows.filter((row) => row && row.judgment && row.judgment.verdict === 'neutral'), (row) => createHandCard(row, 'neutral'), '当前没有中性样本。');
    renderList('good-hand-list', selectedRows.filter((row) => row && row.judgment && row.judgment.verdict === 'good'), (row) => createHandCard(row, 'good'), '当前没有善手样本。');

    getEl('action-analysis-title').textContent = pageState.selectedRoundId === ALL_ROUNDS_ID
      ? '逐手分析'
      : `${roundLabel} · 逐手分析`;
    getEl('action-analysis-meta').textContent = pageState.selectedRoundId === ALL_ROUNDS_ID
      ? '当前选择的是全部局，下面不展开逐手动作。'
      : `当前只展开 ${subject ? subject.summary.label : '-'} 在 ${roundLabel} 的每一步动作。`;
    renderList(
      'action-list',
      pageState.selectedRoundId === ALL_ROUNDS_ID ? [] : selectedRows,
      createActionCard,
      pageState.selectedRoundId === ALL_ROUNDS_ID ? '当前是全部局视角，暂不展开逐手分析。' : '这一局当前还没有逐手样本。'
    );
  }

  function syncAll() {
    renderCoachState(readJson(COACH_STATE_STORAGE_KEY));
    renderAnalysisState(readJson(COACH_ANALYSIS_STATE_STORAGE_KEY));
  }

  global.addEventListener('storage', (event) => {
    if (!event || (event.key !== COACH_STATE_STORAGE_KEY && event.key !== COACH_ANALYSIS_STATE_STORAGE_KEY)) return;
    syncAll();
  });

  syncAll();
})(window);
