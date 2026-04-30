'use strict';

const { parseLocalMeldString } = require('../mjai/meld-codec');

const SUIT_LABELS = Object.freeze({
  m: '万',
  p: '筒',
  s: '索',
  z: ''
});

const HONOR_LABELS = Object.freeze({
  1: '东',
  2: '南',
  3: '西',
  4: '北',
  5: '白',
  6: '发',
  7: '中'
});

const NUMBER_LABELS = Object.freeze({
  0: '零',
  1: '一',
  2: '二',
  3: '三',
  4: '四',
  5: '五',
  6: '六',
  7: '七',
  8: '八',
  9: '九'
});

function normalizeTileCode(tileCode) {
  if (typeof tileCode !== 'string' || tileCode.length < 2) return null;
  return String(tileCode).replace(/[\*_\+\=\-]+$/g, '').replace(/0/g, '5');
}

function formatTileLabel(tileCode) {
  const normalized = normalizeTileCode(tileCode);
  if (!normalized) return '-';
  const suit = normalized[0];
  const rank = normalized[1];
  if (suit === 'z') return HONOR_LABELS[rank] || normalized;
  return `${NUMBER_LABELS[rank] || rank}${SUIT_LABELS[suit] || ''}`;
}

function formatMeldLabel(meldString, fallbackCallType = null) {
  if (typeof meldString !== 'string' || !meldString) return null;
  const parsed = parseLocalMeldString(meldString);
  if (!parsed) return meldString;
  const callType = parsed.callType || fallbackCallType || 'call';
  const tileLabels = parsed.digits.map((digit) => formatTileLabel(`${parsed.suit}${digit}`));
  if (callType === 'peng') {
    return `碰${tileLabels[0] || ''}`;
  }
  if (callType === 'kan') {
    return `杠${tileLabels[0] || ''}`;
  }
  if (callType === 'chi') {
    return `吃${tileLabels.join('')}`;
  }
  return meldString;
}

function buildReasonList(runtimeActionSummary = null, primaryRaw = null) {
  const reasons = [];
  const action = runtimeActionSummary && typeof runtimeActionSummary === 'object' ? runtimeActionSummary : null;
  const meta = primaryRaw && primaryRaw.meta && typeof primaryRaw.meta === 'object'
    ? primaryRaw.meta
    : null;
  const type = action && typeof action.type === 'string' ? action.type : null;

  if (type === 'discard') {
    reasons.push(`建议打出 ${formatTileLabel(action.tileCode)}。`);
    if (action.riichi) {
      reasons.push('这一步同时建议立直。');
    }
  } else if (type === 'call') {
    const callType = action.callType || 'call';
    if (callType === 'peng') {
      reasons.push(`这是一条副露建议：碰 ${formatTileLabel(action.tileCode)}。`);
    } else if (callType === 'chi') {
      reasons.push(`这是一条副露建议：${formatMeldLabel(action.meldString, callType)}。`);
    } else {
      reasons.push('这是一条副露建议。');
    }
  } else if (type === 'kan') {
    reasons.push(`这是一条开杠建议：${formatMeldLabel(action.meldString, 'kan') || '杠牌'}。`);
  } else if (type === 'hule') {
    reasons.push('当前建议是立即和牌。');
  } else if (type === 'pass') {
    reasons.push('当前建议是放弃这次反应。');
  }

  if (meta && Number.isFinite(Number(meta.shanten))) {
    reasons.push(`Mortal 评估时的向听数是 ${Number(meta.shanten)}。`);
  }
  if (meta && meta.is_greedy === true) {
    reasons.push('当前建议偏向最直接的进攻选择。');
  }
  if (meta && Number.isFinite(Number(meta.batch_size))) {
    reasons.push(`本次建议基于 ${Number(meta.batch_size)} 个推理批次结果。`);
  }

  return reasons.filter(Boolean);
}

function formatRecommendedAction(runtimeActionSummary = null) {
  const action = runtimeActionSummary && typeof runtimeActionSummary === 'object' ? runtimeActionSummary : null;
  if (!action) return '暂无动作建议';
  const type = typeof action.type === 'string' ? action.type : null;
  if (type === 'discard') {
    return action.riichi ? `推荐动作：立直打出 ${formatTileLabel(action.tileCode)}` : `推荐动作：打出 ${formatTileLabel(action.tileCode)}`;
  }
  if (type === 'call') {
    return `推荐动作：${formatMeldLabel(action.meldString, action.callType) || action.meldString || action.callType || '副露'}`;
  }
  if (type === 'kan') {
    return `推荐动作：${formatMeldLabel(action.meldString, 'kan') || '开杠'}`;
  }
  if (type === 'hule') return '推荐动作：和牌';
  if (type === 'pass') return '推荐动作：跳过';
  return `推荐动作：${action.meldString || action.callType || formatTileLabel(action.tileCode) || type || '-'}`;
}

function buildSuggestionExplanation(runtimeActionSummary = null, primaryRaw = null) {
  const reasons = buildReasonList(runtimeActionSummary, primaryRaw);
  return {
    humanRecommended: formatRecommendedAction(runtimeActionSummary),
    reasons,
    reasonSummary: reasons[0] || '当前没有额外解释。'
  };
}

module.exports = {
  formatTileLabel,
  formatMeldLabel,
  formatRecommendedAction,
  buildSuggestionExplanation
};
