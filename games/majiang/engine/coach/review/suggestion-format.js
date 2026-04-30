'use strict';

const { buildSuggestionExplanation } = require('./suggestion-explainer');

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function summarizeRuntimeAction(runtimeAction = null) {
  if (!runtimeAction || typeof runtimeAction !== 'object') return null;
  const payload = runtimeAction.payload && typeof runtimeAction.payload === 'object'
    ? runtimeAction.payload
    : {};
  return {
    type: runtimeAction.type || null,
    seat: payload.seat || null,
    tileCode: payload.tileCode || null,
    fromSeat: payload.fromSeat || null,
    callType: payload.callType || null,
    meldString: payload.meldString || payload.meld || null,
    riichi: Boolean(payload.riichi)
  };
}

function pickPrimaryDecoded(decoded = []) {
  if (!Array.isArray(decoded) || !decoded.length) return null;
  for (let index = decoded.length - 1; index >= 0; index -= 1) {
    const entry = decoded[index];
    if (entry && entry.runtimeAction) return entry;
  }
  return decoded[decoded.length - 1] || null;
}

function buildCoachSuggestion(result = {}, options = {}) {
  const decoded = Array.isArray(result.decoded) ? result.decoded : [];
  const primary = pickPrimaryDecoded(decoded);
  const runtimeAction = primary && primary.runtimeAction ? primary.runtimeAction : null;
  const actionSummary = summarizeRuntimeAction(runtimeAction);
  const explanation = buildSuggestionExplanation(actionSummary, primary && primary.raw ? primary.raw : null);

  return {
    source: options.source || 'mortal',
    perspectiveSeat: options.perspectiveSeatKey || null,
    ok: Boolean(result && result.ok),
    status: result && result.ok ? 'ready' : 'error',
    recommended: actionSummary,
    humanRecommended: explanation.humanRecommended,
    reasons: explanation.reasons,
    reasonSummary: explanation.reasonSummary,
    primaryDecisionType: primary && primary.type ? primary.type : null,
    decodedCount: decoded.length,
    stdoutLines: Array.isArray(result.lines) ? result.lines.slice() : [],
    stderr: result && result.stderr ? String(result.stderr) : '',
    decoded: decoded.map((entry) => ({
      type: entry && entry.type ? entry.type : null,
      runtimeAction: summarizeRuntimeAction(entry && entry.runtimeAction ? entry.runtimeAction : null),
      raw: entry && entry.raw ? clone(entry.raw) : null
    }))
  };
}

module.exports = {
  summarizeRuntimeAction,
  buildCoachSuggestion
};
