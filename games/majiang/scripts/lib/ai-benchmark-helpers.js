'use strict';

const fs = require('fs');
const path = require('path');

const { SingleRoundRuntime } = require('../../engine/runtime/single-round-runtime');
const { createScriptedDrawPolicy } = require('../../engine/base/draw-policy');
const baseAiApi = require('../../engine/ai/base-ai');
const { createCoachController } = require('../../engine/coach/review/coach-controller');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_MORTAL_ROOT = path.resolve(ROOT, '..', 'third_party', 'Mortal');

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function createRuntimeFromConfig(config) {
  const scripted = config
    && config.engine
    && config.engine.wall
    && config.engine.wall.scripted
    && typeof config.engine.wall.scripted === 'object'
      ? config.engine.wall.scripted
      : null;
  const drawPolicy = scripted ? createScriptedDrawPolicy(scripted) : null;
  return new SingleRoundRuntime({
    ...config,
    drawPolicy
  });
}

function createAiController(runtime, config) {
  return baseAiApi.createAiController(runtime, config);
}

function passAllPendingReactions(runtime, reason = 'ai-benchmark-pass') {
  const seatOrder = ['right', 'top', 'left', 'bottom'];
  seatOrder.forEach((seatKey) => {
    if (!runtime.pendingReaction || !Array.isArray(runtime.pendingReaction.actions)) return;
    const hasSeatAction = runtime.pendingReaction.actions.some((action) => (
      action
      && action.payload
      && action.payload.seat === seatKey
    ));
    if (hasSeatAction) {
      runtime.passReaction(seatKey, { reason });
    }
  });
}

function fastForwardToRightFirstDiscard(runtime) {
  runtime.start();
  runtime.drawTile('bottom');
  const bottomHandCodes = runtime.getSeatHandCodes('bottom');
  const bottomDiscard = bottomHandCodes[bottomHandCodes.length - 1];
  runtime.discardTile('bottom', bottomDiscard);
  passAllPendingReactions(runtime, 'ai-benchmark-opening-pass');
  runtime.drawTile('right');
  return runtime.getSnapshot();
}

function normalizeActionDecision(decision = null) {
  if (!decision || typeof decision !== 'object') return null;
  const payload = decision.payload && typeof decision.payload === 'object'
    ? decision.payload
    : decision;
  return {
    type: typeof decision.type === 'string' ? decision.type : (typeof payload.type === 'string' ? payload.type : null),
    seat: typeof payload.seat === 'string' ? payload.seat : (typeof decision.seatKey === 'string' ? decision.seatKey : null),
    tileCode: typeof payload.tileCode === 'string'
      ? payload.tileCode.replace(/[\*_\+\=\-]$/g, '')
      : (typeof decision.tileCode === 'string' ? decision.tileCode.replace(/[\*_\+\=\-]$/g, '') : null),
    fromSeat: typeof payload.fromSeat === 'string' ? payload.fromSeat : null,
    callType: typeof payload.callType === 'string' ? payload.callType : null,
    meldString: typeof payload.meldString === 'string'
      ? payload.meldString
      : (typeof payload.meld === 'string' ? payload.meld : null),
    riichi: Boolean(payload.riichi != null ? payload.riichi : decision.shouldRiichi)
  };
}

function compareDecisions(localDecision, coachDecision) {
  const local = normalizeActionDecision(localDecision);
  const coach = normalizeActionDecision(coachDecision);
  const result = {
    exactMatch: false,
    typeMatch: false,
    tileMatch: false,
    callMatch: false,
    riichiMatch: false,
    mismatchKind: 'missing'
  };

  if (!local || !coach) {
    result.mismatchKind = !local && !coach ? 'both-missing' : 'missing';
    return result;
  }

  result.typeMatch = local.type === coach.type;
  result.tileMatch = local.tileCode === coach.tileCode;
  result.callMatch = local.callType === coach.callType && local.meldString === coach.meldString;
  result.riichiMatch = local.riichi === coach.riichi;
  result.exactMatch = result.typeMatch && result.tileMatch && result.callMatch && result.riichiMatch;

  if (result.exactMatch) result.mismatchKind = 'none';
  else if (!result.typeMatch) result.mismatchKind = 'action-type';
  else if (!result.tileMatch) result.mismatchKind = 'tile';
  else if (!result.callMatch) result.mismatchKind = 'call';
  else if (!result.riichiMatch) result.mismatchKind = 'riichi';
  else result.mismatchKind = 'other';

  return result;
}

function summarizeBenchmarkResults(rows = []) {
  const summary = {
    total: rows.length,
    mortalOkCount: 0,
    coachDecisionCount: 0,
    exactMatches: 0,
    typeMatches: 0,
    tileMatches: 0,
    callMatches: 0,
    riichiMatches: 0,
    mismatchKinds: {}
  };

  rows.forEach((row) => {
    const comparison = row && row.comparison ? row.comparison : null;
    if (row && row.mortalOk) summary.mortalOkCount += 1;
    if (row && row.coachDecision) summary.coachDecisionCount += 1;
    if (!comparison) return;
    if (comparison.exactMatch) summary.exactMatches += 1;
    if (comparison.typeMatch) summary.typeMatches += 1;
    if (comparison.tileMatch) summary.tileMatches += 1;
    if (comparison.callMatch) summary.callMatches += 1;
    if (comparison.riichiMatch) summary.riichiMatches += 1;
    const key = comparison.mismatchKind || 'unknown';
    summary.mismatchKinds[key] = (summary.mismatchKinds[key] || 0) + 1;
  });

  return summary;
}

function buildEasyBenchmarkCases(root = ROOT) {
  return [
    {
      id: 'easy-current-turn',
      label: '默认四麻起手弃牌',
      kind: 'discard',
      tags: ['discard', 'opening', 'neutral'],
      configPath: path.join(root, 'game-config.json'),
      perspectiveSeatKey: 'right',
      prepare(runtime) {
        fastForwardToRightFirstDiscard(runtime);
      }
    },
    {
      id: 'easy-riichi-smoke',
      label: '立直判断',
      kind: 'discard',
      tags: ['discard', 'riichi', 'aggression'],
      configPath: path.join(root, 'test', 'game-config.ai-easy-riichi-smoke.json'),
      perspectiveSeatKey: 'right',
      prepare(runtime) {
        fastForwardToRightFirstDiscard(runtime);
      }
    },
    {
      id: 'easy-ukeire-smoke',
      label: '有效牌平手打破',
      kind: 'discard',
      tags: ['discard', 'ukeire', 'efficiency'],
      configPath: path.join(root, 'test', 'game-config.ai-easy-ukeire-smoke.json'),
      perspectiveSeatKey: 'right',
      prepare(runtime) {
        fastForwardToRightFirstDiscard(runtime);
      }
    },
    {
      id: 'easy-defense-smoke',
      label: '立直压力下轻防守',
      kind: 'discard',
      tags: ['discard', 'defense', 'riichi-pressure'],
      configPath: path.join(root, 'test', 'game-config.ai-easy-defense-smoke.json'),
      perspectiveSeatKey: 'right',
      prepare(runtime) {
        fastForwardToRightFirstDiscard(runtime);
        const topSeatIndex = runtime.getSeatIndex('top');
        runtime.riichiState.top.declared = true;
        runtime.riichiState.top.ippatsuPending = true;
        runtime.board.he[topSeatIndex]._pai = ['z3*'];
      }
    },
    {
      id: 'easy-shape-smoke',
      label: '基础手型偏好',
      kind: 'discard',
      tags: ['discard', 'shape', 'efficiency'],
      configPath: path.join(root, 'test', 'game-config.ai-easy-shape-smoke.json'),
      perspectiveSeatKey: 'right',
      prepare(runtime) {
        fastForwardToRightFirstDiscard(runtime);
      }
    }
  ];
}

function evaluateCase(caseDef, options = {}) {
  const config = loadJson(caseDef.configPath);
  const runtime = createRuntimeFromConfig(config);
  if (typeof caseDef.prepare === 'function') {
    caseDef.prepare(runtime, config);
  }

  const aiController = createAiController(runtime, config);
  const localDecisionRaw = caseDef.kind === 'reaction'
    ? aiController.chooseReaction(caseDef.perspectiveSeatKey, caseDef.getAvailableActions(runtime), {
        benchmarkCaseId: caseDef.id
      })
    : aiController.chooseDiscard(caseDef.perspectiveSeatKey, {
        benchmarkCaseId: caseDef.id
      });

  const controller = createCoachController(runtime, {
    perspectiveSeatKey: caseDef.perspectiveSeatKey,
    mortalRoot: options.mortalRoot || DEFAULT_MORTAL_ROOT,
    condaEnvPath: options.condaEnvPath,
    configPath: options.configPath
  });
  const inference = controller.requestSuggestion();
  const suggestionState = controller.getSuggestionState();
  const coachDecisionRaw = suggestionState && suggestionState.recommended ? suggestionState.recommended : null;

  return {
    id: caseDef.id,
    label: caseDef.label,
    kind: caseDef.kind,
    tags: Array.isArray(caseDef.tags) ? caseDef.tags.slice() : [],
    configPath: caseDef.configPath,
    perspectiveSeatKey: caseDef.perspectiveSeatKey,
    round: {
      id: options.roundId || caseDef.roundId || 'benchmark-round-1',
      label: options.roundLabel || caseDef.roundLabel || '基准局面样本',
      wind: options.roundWind || caseDef.roundWind || null,
      hand: options.roundHand || caseDef.roundHand || null
    },
    subject: {
      id: options.subjectId || `ai:${caseDef.perspectiveSeatKey}:easy`,
      label: options.subjectLabel || `easy(${caseDef.perspectiveSeatKey})`,
      type: options.subjectType || 'ai'
    },
    mortalOk: Boolean(inference && inference.ok),
    suggestionStatus: suggestionState && suggestionState.status ? suggestionState.status : null,
    localDecision: normalizeActionDecision(localDecisionRaw),
    coachDecision: normalizeActionDecision(coachDecisionRaw),
    suggestionState,
    comparison: compareDecisions(localDecisionRaw, coachDecisionRaw)
  };
}

module.exports = {
  ROOT,
  DEFAULT_MORTAL_ROOT,
  loadJson,
  createRuntimeFromConfig,
  createAiController,
  passAllPendingReactions,
  fastForwardToRightFirstDiscard,
  normalizeActionDecision,
  compareDecisions,
  summarizeBenchmarkResults,
  buildEasyBenchmarkCases,
  evaluateCase
};
