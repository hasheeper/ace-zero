(function(global) {
  'use strict';

  const PANEL_ID = 'luck-sequence-panel';
  const MAX_ENTRIES = 10;
  const RUNTIME_RETRY_LIMIT = 160;
  const LUCK_OUTCOMES = ['fortune', 'curse', 'contested', 'void', 'fallback', 'silent', 'draw'];
  const ACTION_OUTCOMES = ['discard', 'riichi', 'call', 'kan', 'kita', 'dora', 'hule', 'round-draw'];
  const OUTCOMES = LUCK_OUTCOMES.concat(ACTION_OUTCOMES);
  const DOMINANT_KINDS = ['fortune', 'curse', 'void', 'none'];
  const SEAT_LABELS = {
    bottom: '自',
    right: '下',
    top: '对',
    left: '上'
  };
  const OUTCOME_LABELS = {
    fortune: '运',
    curse: '厄',
    contested: '争',
    void: '虚',
    fallback: '退',
    silent: '静',
    draw: '摸',
    discard: '打',
    riichi: '立',
    call: '鸣',
    kan: '杠',
    kita: '北',
    dora: '宝',
    hule: '和',
    'round-draw': '流'
  };
  const OUTCOME_TEXT = {
    fortune: '幸运偏置',
    curse: '厄运压制',
    contested: '力量相争',
    void: '力量削弱',
    fallback: '回退摸牌',
    silent: '无有效力量',
    draw: '普通摸牌',
    discard: '弃牌',
    riichi: '立直宣言',
    call: '鸣牌',
    kan: '开杠',
    kita: '拔北',
    dora: '翻宝牌',
    hule: '和牌',
    'round-draw': '流局'
  };
  const INTENSITY_TEXT = ['无', '轻', '中', '强'];

  const PANEL_HTML = `
    <aside class="luck-sequence-container" id="${PANEL_ID}" aria-label="魔运顺次力量">
      <div class="luck-sequence-head">
        <div class="luck-sequence-title">势</div>
        <div class="luck-sequence-kicker">顺次</div>
      </div>
      <div class="luck-sequence-rail" aria-live="polite" aria-atomic="false">
        <div class="luck-sequence-axis" aria-hidden="true"></div>
        <ol class="luck-sequence-list" id="luck-sequence-list"></ol>
      </div>
      <div class="luck-sequence-foot" aria-hidden="true">
        <span>近摸</span><b id="luck-sequence-count">0</b>
      </div>
    </aside>`;

  let mounted = false;
  let panelEl = null;
  let listEl = null;
  let countEl = null;
  let entries = [];
  let sequenceIndex = 0;
  let runtimeRetryCount = 0;
  let runtimeRetryTimer = null;
  let runtimeWatchTimer = null;
  let boundRuntime = null;
  let unsubscribeRuntime = null;

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function clampNumber(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(min, Math.min(max, number));
  }

  function uniqueStrings(values) {
    const seen = new Set();
    return (Array.isArray(values) ? values : []).reduce((result, value) => {
      if (value == null || value === '') return result;
      const key = String(value);
      if (seen.has(key)) return result;
      seen.add(key);
      result.push(key);
      return result;
    }, []);
  }

  function normalizeOutcome(value, fallback = 'draw') {
    return OUTCOMES.includes(value) ? value : fallback;
  }

  function normalizeDominantKind(value) {
    return DOMINANT_KINDS.includes(value) ? value : 'none';
  }

  function normalizeSeat(value) {
    return value == null || value === '' ? null : String(value);
  }

  function getSeatLabel(seat) {
    return SEAT_LABELS[seat] || (seat ? String(seat).slice(0, 1) : '');
  }

  function normalizeSourceSeats(sourceSeats) {
    if (Array.isArray(sourceSeats)) return uniqueStrings(sourceSeats);
    if (sourceSeats == null || sourceSeats === '') return [];
    return uniqueStrings([sourceSeats]);
  }

  function isActionOutcome(outcome) {
    return ACTION_OUTCOMES.includes(outcome);
  }

  function getEventSeat(payload = {}) {
    return payload.seat || payload.seatKey || payload.actorSeat || null;
  }

  function getManaFields(source = {}) {
    const manaSummary = source.manaSummary && typeof source.manaSummary === 'object'
      ? source.manaSummary
      : source.luckManaSummary && typeof source.luckManaSummary === 'object'
        ? source.luckManaSummary
        : source;
    const hasDelta = Number.isFinite(Number(manaSummary.manaDelta));
    return {
      manaDelta: hasDelta ? Math.round(Number(manaSummary.manaDelta)) : null,
      manaAfter: Number.isFinite(Number(manaSummary.manaAfter)) ? Math.round(Number(manaSummary.manaAfter)) : null,
      maxMana: Number.isFinite(Number(manaSummary.maxMana)) ? Math.round(Number(manaSummary.maxMana)) : null,
      manaLocked: Boolean(manaSummary.manaLocked)
    };
  }

  function buildActionSummaryFromEvent(event = {}) {
    const payload = event && event.payload && typeof event.payload === 'object' ? event.payload : {};
    const seat = getEventSeat(payload);
    const mana = getManaFields(payload);
    switch (event.type) {
      case 'tile:discard':
        return {
          outcome: payload.riichi ? 'riichi' : 'discard',
          eventGroup: 'action',
          actionKind: payload.riichi ? 'riichi' : 'discard',
          seat,
          targetSeat: seat,
          ...mana
        };
      case 'meld:call':
        return {
          outcome: 'call',
          eventGroup: 'action',
          actionKind: 'call',
          seat,
          targetSeat: seat,
          ...mana
        };
      case 'meld:kan':
        return {
          outcome: 'kan',
          eventGroup: 'action',
          actionKind: 'kan',
          seat,
          targetSeat: seat,
          ...mana
        };
      case 'tile:kita':
        return {
          outcome: 'kita',
          eventGroup: 'action',
          actionKind: 'kita',
          seat,
          targetSeat: seat,
          ...mana
        };
      case 'dora:flip':
        return {
          outcome: 'dora',
          eventGroup: 'action',
          actionKind: 'dora',
          seat,
          targetSeat: seat,
          ...mana
        };
      case 'round:hule':
        return {
          outcome: 'hule',
          eventGroup: 'action',
          actionKind: 'hule',
          seat,
          targetSeat: seat,
          ...mana
        };
      case 'round:draw':
        return {
          outcome: 'round-draw',
          eventGroup: 'action',
          actionKind: 'round-draw',
          seat,
          targetSeat: seat,
          ...mana
        };
      default:
        return null;
    }
  }

  function normalizeSummary(summary = {}, event = {}) {
    const source = summary && typeof summary === 'object' ? summary : {};
    const payload = event && event.payload && typeof event.payload === 'object' ? event.payload : {};
    const meta = payload.meta && typeof payload.meta === 'object' ? payload.meta : {};
    const hasLuckSummary = Boolean(source.auditId || source.outcome || meta.luckPublicSummary);
    const outcome = normalizeOutcome(source.outcome, hasLuckSummary ? 'silent' : 'draw');
    const dominantKind = normalizeDominantKind(source.dominantKind);
    const seat = normalizeSeat(source.seat || payload.seat || payload.seatKey || null);
    const targetSeat = normalizeSeat(source.targetSeat || seat);
    const sourceSeats = normalizeSourceSeats(source.sourceSeats);
    const targetSeats = normalizeSourceSeats(source.targetSeats);
    const intensity = Math.round(clampNumber(source.intensity, 0, 3, 0));
    const drawKind = source.drawKind || (event.type === 'tile:gang-draw' ? 'rinshan' : 'normal');
    const mana = getManaFields(source);

    sequenceIndex += 1;

    return {
      id: source.auditId || `${outcome}:${sequenceIndex}`,
      auditId: source.auditId || null,
      order: sequenceIndex,
      seat,
      seatLabel: getSeatLabel(seat),
      drawKind,
      eventGroup: source.eventGroup === 'action' || isActionOutcome(outcome) ? 'action' : 'luck',
      actionKind: typeof source.actionKind === 'string' ? source.actionKind : null,
      outcome,
      dominantKind,
      contested: Boolean(source.contested || outcome === 'contested'),
      sourceCount: Math.max(0, Math.floor(clampNumber(source.sourceCount, 0, 99, sourceSeats.length))),
      intensity,
      hasVoidDamping: Boolean(source.hasVoidDamping),
      fallbackReason: source.fallbackReason ? String(source.fallbackReason) : null,
      targetSeat,
      targetLabel: getSeatLabel(targetSeat),
      sourceSeats,
      sourceLabels: sourceSeats.map(getSeatLabel),
      targetSeats,
      targetLabels: targetSeats.map(getSeatLabel),
      manaDelta: mana.manaDelta,
      manaAfter: mana.manaAfter,
      maxMana: mana.maxMana,
      manaLocked: mana.manaLocked
    };
  }

  function getEntryClassName(entry = {}) {
    const normalized = entry && typeof entry === 'object' ? entry : {};
    const outcome = normalizeOutcome(normalized.outcome, 'draw');
    const dominantKind = normalizeDominantKind(normalized.dominantKind);
    const intensity = Math.round(clampNumber(normalized.intensity, 0, 3, 0));
    return [
      'luck-sequence-entry',
      `is-${outcome}`,
      `intensity-${intensity}`,
      normalized.contested ? 'is-contested' : '',
      normalized.hasVoidDamping ? 'has-void-damping' : '',
      dominantKind !== 'none' ? `is-dominant-${dominantKind}` : ''
    ].filter(Boolean).join(' ');
  }

  function getVisibleEntryText(entry = {}) {
    const outcome = normalizeOutcome(entry.outcome, 'draw');
    const mark = OUTCOME_LABELS[outcome] || OUTCOME_LABELS.draw;
    const seatLabel = entry.targetLabel || entry.seatLabel || '';
    return `${mark}${seatLabel}`;
  }

  function formatEntryTitle(entry = {}) {
    const outcome = normalizeOutcome(entry.outcome, 'draw');
    const intensity = Math.round(clampNumber(entry.intensity, 0, 3, 0));
    const seatText = entry.targetLabel || entry.seatLabel || '未定';
    const isAction = entry.eventGroup === 'action' || isActionOutcome(outcome);
    const drawText = entry.drawKind === 'rinshan' && outcome === 'draw'
      ? '岭上摸牌'
      : OUTCOME_TEXT[outcome] || OUTCOME_TEXT.draw;
    const parts = [
      `第 ${entry.order || 0} ${isAction ? '记' : '摸'}`,
      seatText,
      drawText
    ];
    if (!isAction) parts.push(`强度 ${INTENSITY_TEXT[intensity] || INTENSITY_TEXT[0]}`);
    if (entry.contested) parts.push('相争');
    if (entry.hasVoidDamping) parts.push('虚化');
    if (entry.sourceCount > 1) parts.push(`${entry.sourceCount} 源`);
    if (entry.manaDelta != null) {
      const sign = entry.manaDelta > 0 ? '+' : '';
      parts.push(`Mana ${sign}${entry.manaDelta}`);
    }
    if (entry.manaLocked) parts.push('技能锁定');
    if (entry.fallbackReason) parts.push('已回退');
    return parts.join(' · ');
  }

  function createEntryNode(entry) {
    const item = global.document.createElement('li');
    item.className = getEntryClassName(entry);
    item.dataset.outcome = entry.outcome;
    item.dataset.intensity = String(entry.intensity);
    item.title = formatEntryTitle(entry);
    item.setAttribute('aria-label', item.title);

    const node = global.document.createElement('span');
    node.className = 'luck-sequence-node';

    const glyph = global.document.createElement('span');
    glyph.className = 'luck-sequence-glyph';
    glyph.textContent = OUTCOME_LABELS[entry.outcome] || OUTCOME_LABELS.draw;

    const seat = global.document.createElement('span');
    seat.className = 'luck-sequence-seat';
    seat.textContent = entry.targetLabel || entry.seatLabel || '';

    const mana = global.document.createElement('span');
    mana.className = 'luck-sequence-mana';
    if (entry.manaDelta != null && entry.manaDelta !== 0) {
      mana.textContent = `${entry.manaDelta > 0 ? '+' : ''}${entry.manaDelta}`;
    }

    const spark = global.document.createElement('span');
    spark.className = 'luck-sequence-spark';
    spark.setAttribute('aria-hidden', 'true');

    item.appendChild(node);
    item.appendChild(glyph);
    item.appendChild(seat);
    if (mana.textContent) item.appendChild(mana);
    item.appendChild(spark);
    return item;
  }

  function render() {
    if (!panelEl || !listEl) return;
    panelEl.classList.toggle('is-empty', entries.length === 0);
    listEl.innerHTML = '';
    entries.forEach((entry) => {
      listEl.appendChild(createEntryNode(entry));
    });
    if (countEl) countEl.textContent = String(entries.length);
  }

  function pushSummary(summary = {}, event = {}) {
    const entry = normalizeSummary(summary, event);
    entries.unshift(entry);
    if (entries.length > MAX_ENTRIES) {
      entries = entries.slice(0, MAX_ENTRIES);
    }
    render();
    return clone(entry);
  }

  function pushEvent(event = {}) {
    if (!event || !event.type) return null;
    const payload = event.payload && typeof event.payload === 'object' ? event.payload : {};
    const meta = payload.meta && typeof payload.meta === 'object' ? payload.meta : {};
    if (event.type !== 'tile:draw' && event.type !== 'tile:gang-draw') {
      const actionSummary = buildActionSummaryFromEvent(event);
      return actionSummary ? pushSummary(actionSummary, event) : null;
    }
    const publicSummary = meta.luckPublicSummary && typeof meta.luckPublicSummary === 'object'
      ? meta.luckPublicSummary
      : {
          outcome: meta.luckAuditId ? 'silent' : 'draw',
          seat: payload.seat || payload.seatKey || null,
          drawKind: event.type === 'tile:gang-draw' ? 'rinshan' : 'normal'
        };
    return pushSummary(publicSummary, event);
  }

  function getActiveRuntime() {
    const publicUi = global.AceZeroMahjongUI || null;
    const runtimeApi = publicUi && publicUi.runtime ? publicUi.runtime : null;
    if (runtimeApi && typeof runtimeApi.getRuntime === 'function') {
      const runtime = runtimeApi.getRuntime();
      if (runtime && typeof runtime.subscribe === 'function') return runtime;
    }
    const runtime = global.AceMahjongGameRuntime || null;
    return runtime && typeof runtime.subscribe === 'function' ? runtime : null;
  }

  function unbindRuntime() {
    if (typeof unsubscribeRuntime === 'function') {
      unsubscribeRuntime();
    }
    unsubscribeRuntime = null;
    boundRuntime = null;
  }

  function bindRuntime(force = false) {
    const runtime = getActiveRuntime();
    if (!runtime) return false;
    if (!force && runtime === boundRuntime && typeof unsubscribeRuntime === 'function') return true;
    unbindRuntime();
    boundRuntime = runtime;
    unsubscribeRuntime = runtime.subscribe((event) => {
      pushEvent(event);
    });
    return true;
  }

  function scheduleRuntimeBind() {
    if (bindRuntime()) return;
    if (runtimeRetryCount >= RUNTIME_RETRY_LIMIT) return;
    runtimeRetryCount += 1;
    if (runtimeRetryTimer || typeof global.setTimeout !== 'function') return;
    runtimeRetryTimer = global.setTimeout(() => {
      runtimeRetryTimer = null;
      scheduleRuntimeBind();
    }, 450);
  }

  function startRuntimeWatch() {
    if (runtimeWatchTimer || typeof global.setInterval !== 'function') return;
    runtimeWatchTimer = global.setInterval(() => {
      const runtime = getActiveRuntime();
      if (runtime && runtime !== boundRuntime) bindRuntime(true);
    }, 1200);
  }

  function mount() {
    if (mounted) {
      scheduleRuntimeBind();
      return getEntries();
    }
    if (!global.document || !global.document.body || typeof global.document.createElement !== 'function') {
      return getEntries();
    }

    panelEl = global.document.getElementById(PANEL_ID);
    if (!panelEl) {
      const template = global.document.createElement('template');
      template.innerHTML = PANEL_HTML.trim();
      panelEl = template.content.firstElementChild;
      global.document.body.appendChild(panelEl);
    }

    listEl = panelEl.querySelector('#luck-sequence-list');
    countEl = panelEl.querySelector('#luck-sequence-count');
    mounted = true;
    render();
    scheduleRuntimeBind();
    startRuntimeWatch();
    return getEntries();
  }

  function getEntries() {
    return clone(entries);
  }

  function clear() {
    entries = [];
    sequenceIndex = 0;
    render();
    return getEntries();
  }

  const api = {
    mount,
    pushEvent,
    pushSummary,
    getEntries,
    clear,
    normalizeSummary(summary, event) {
      const currentIndex = sequenceIndex;
      const normalized = normalizeSummary(summary, event);
      sequenceIndex = currentIndex;
      return clone(normalized);
    },
    getEntryClassName,
    getVisibleEntryText,
    formatEntryTitle
  };

  global.AceMahjongLuckSequencePanel = api;
  if (global.AceZeroMahjongUI && typeof global.AceZeroMahjongUI === 'object') {
    global.AceZeroMahjongUI.luckSequence = api;
  }

  if (global.document && global.document.readyState === 'loading') {
    global.document.addEventListener('DOMContentLoaded', () => mount(), { once: true });
  } else {
    mount();
  }
})(typeof window !== 'undefined' ? window : globalThis);
