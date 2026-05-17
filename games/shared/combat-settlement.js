/**
 * ACE0 Combat settlement marker helper.
 *
 * Game engines use this to produce deterministic settlement advice only.
 * MVU is updated later by the LLM via <UpdateVariable>.
 */
(function (global) {
  'use strict';

  var PROTOCOL = 'ace0.combat.v1';
  var RESULT_BUCKETS = [
    { key: 'rout', label: '打败', maxRatio: -0.75 },
    { key: 'defeat', label: '失败', maxRatio: -0.30 },
    { key: 'minor_defeat', label: '小败', maxRatio: -0.05 },
    { key: 'draw', label: '平局', maxRatio: 0.05 },
    { key: 'minor_victory', label: '小胜', maxRatio: 0.30 },
    { key: 'victory', label: '胜利', maxRatio: 0.75 },
    { key: 'great_victory', label: '大胜', maxRatio: Infinity }
  ];
  var MAX_POINTS_BY_LEVEL = { 1: 3, 2: 6, 3: 10 };
  var POINT_RATE_BY_BUCKET = {
    rout: 0,
    defeat: 0,
    minor_defeat: 0,
    draw: 0.2,
    minor_victory: 0.45,
    victory: 0.75,
    great_victory: 1
  };
  var REWARD_SEQUENCE_BY_LEVEL = {
    1: ['combat', 'rest', 'vision'],
    2: ['combat', 'asset', 'vision', 'rest', 'combat', 'asset'],
    3: ['combat', 'asset', 'vision', 'combat', 'rest', 'asset', 'vision', 'combat', 'rest', 'asset']
  };
  function clampInt(value, min, max, fallback) {
    var n = Math.round(Number(value));
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  }

  function roundGold(value) {
    var n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 100) / 100;
  }

  function silverToGold(chips) {
    return roundGold((Number(chips) || 0) / 100);
  }

  function goldToSilver(gold) {
    return Math.round((Number(gold) || 0) * 100);
  }

  function normalizeCombatConfig(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    var requestId = typeof value.requestId === 'string' ? value.requestId.trim() : '';
    if (!requestId) return null;
    var level = clampInt(value.level, 1, 3, 1);
    var kind = typeof value.kind === 'string' && value.kind.trim()
      ? value.kind.trim()
      : (level === 3 ? 'boss' : level === 2 ? 'elite' : 'skirmish');
    var stakeGold = Math.max(0, roundGold(value.stakeGold));
    var stakeChips = Math.max(0, Math.round(Number(value.stakeChips) || goldToSilver(stakeGold)));
    return {
      protocol: PROTOCOL,
      requestId: requestId,
      requestIndex: Math.max(0, clampInt(value.requestIndex, 0, 9999, 0)),
      level: level,
      kind: kind,
      special: true,
      stakeGold: stakeGold,
      stakeChips: stakeChips
    };
  }

  function classifyOutcome(netChips, stakeChips) {
    var stake = Math.max(1, Math.abs(Math.round(Number(stakeChips) || 0)));
    var ratio = (Number(netChips) || 0) / stake;
    for (var i = 0; i < RESULT_BUCKETS.length; i++) {
      if (ratio <= RESULT_BUCKETS[i].maxRatio) {
        return {
          key: RESULT_BUCKETS[i].key,
          label: RESULT_BUCKETS[i].label,
          ratio: Math.round(ratio * 10000) / 10000
        };
      }
    }
    return { key: 'draw', label: '平局', ratio: 0 };
  }

  function buildRewardDelta(level, bucketKey) {
    var max = MAX_POINTS_BY_LEVEL[level] || MAX_POINTS_BY_LEVEL[1];
    var rate = POINT_RATE_BY_BUCKET[bucketKey];
    var total = Math.max(0, Math.floor(max * (Number.isFinite(rate) ? rate : 0)));
    var sequence = REWARD_SEQUENCE_BY_LEVEL[level] || REWARD_SEQUENCE_BY_LEVEL[1];
    var delta = { combat: 0, rest: 0, asset: 0, vision: 0 };
    for (var i = 0; i < total && i < sequence.length; i++) {
      var key = sequence[i];
      if (Object.prototype.hasOwnProperty.call(delta, key)) delta[key] += 1;
    }
    return { total: total, delta: delta, max: max };
  }

  function buildSuggestedJsonPatch(settlement) {
    var patch = [];
    if (settlement.fundsDeltaGold !== 0) {
      patch.push({ op: 'delta', path: '/hero/funds', value: settlement.fundsDeltaGold });
    }
    Object.keys(settlement.rewardDelta).forEach(function (key) {
      var value = settlement.rewardDelta[key];
      if (value > 0) {
        patch.push({ op: 'delta', path: '/world/act/reserve/' + key, value: value });
      }
    });
    patch.push({ op: 'replace', path: '/world/act/pendingResolutions/' + settlement.requestIndex + '/status', value: 'resolved' });
    return patch;
  }

  function buildSettlement(input) {
    input = input || {};
    var combat = normalizeCombatConfig(input.ace0Combat);
    if (!combat) return null;
    var startingChips = Math.max(0, Math.round(Number(input.startingChips) || Number(input.initialChips) || 0));
    var endingChips = Math.max(0, Math.round(Number(input.endingChips) || 0));
    var explicitNet = Number(input.netChips);
    var netChips = Number.isFinite(explicitNet) ? Math.round(explicitNet) : (endingChips - startingChips);
    var stakeChips = Math.max(1, combat.stakeChips || goldToSilver(combat.stakeGold) || startingChips || Math.abs(netChips) || 1);
    var outcome = classifyOutcome(netChips, stakeChips);
    var rewardInfo = buildRewardDelta(combat.level, outcome.key);
    var fundsDeltaGold = silverToGold(netChips);
    var settlement = {
      protocol: PROTOCOL,
      requestId: combat.requestId,
      requestIndex: combat.requestIndex,
      level: combat.level,
      kind: combat.kind,
      special: true,
      gameId: input.gameId || '',
      gameName: input.gameName || '',
      stakeGold: combat.stakeGold,
      stakeChips: stakeChips,
      startingChips: startingChips,
      endingChips: endingChips,
      netChips: netChips,
      fundsDeltaGold: fundsDeltaGold,
      outcome: outcome,
      rewardPoints: rewardInfo.total,
      rewardMax: rewardInfo.max,
      rewardDelta: rewardInfo.delta
    };
    settlement.suggestedJsonPatch = buildSuggestedJsonPatch(settlement);
    return settlement;
  }

  function buildMarkerPayload(settlement) {
    if (!settlement || typeof settlement !== 'object') return null;
    return {
      suggestedJsonPatch: settlement.suggestedJsonPatch || []
    };
  }

  function getRoundNetChips(context) {
    context = context || {};
    var explicit = Number(context.fundsDelta);
    if (Number.isFinite(explicit)) return Math.round(explicit);
    var fundsUp = Number(context.fundsUp);
    var fundsDown = Number(context.fundsDown);
    if (Number.isFinite(fundsUp) && fundsUp > 0) return Math.round(fundsUp);
    if (Number.isFinite(fundsDown) && fundsDown > 0) return -Math.round(fundsDown);
    var starting = Number(context.startingChips != null ? context.startingChips : context.initialChips);
    var ending = Number(context.endingChips);
    if (Number.isFinite(starting) && Number.isFinite(ending)) return Math.round(ending - starting);
    return 0;
  }

  function buildSettlementFromSession(input) {
    input = input || {};
    var rounds = Array.isArray(input.rounds) ? input.rounds : [];
    var chosen = null;
    var firstContext = null;
    var lastContext = null;
    var totalNetChips = 0;
    var hasRoundContext = false;
    for (var i = rounds.length - 1; i >= 0; i--) {
      var ctx = rounds[i] && rounds[i].context;
      if (!ctx) continue;
      if (!lastContext) lastContext = ctx;
      firstContext = ctx;
      totalNetChips += getRoundNetChips(ctx);
      hasRoundContext = true;
      if (ctx.ace0Combat) chosen = ctx;
    }
    if (!hasRoundContext && input.context) {
      firstContext = input.context;
      lastContext = input.context;
      totalNetChips = getRoundNetChips(input.context);
    }
    if (!chosen && input.context && input.context.ace0Combat) chosen = input.context;
    if (!chosen) return null;
    return buildSettlement({
      ace0Combat: chosen.ace0Combat,
      gameId: input.gameId || chosen.gameId || '',
      gameName: input.gameName || chosen.gameName || '',
      startingChips: firstContext && firstContext.startingChips != null ? firstContext.startingChips : firstContext && firstContext.initialChips,
      initialChips: firstContext && firstContext.initialChips,
      endingChips: lastContext && lastContext.endingChips,
      netChips: totalNetChips,
      resultText: chosen.resultText
    });
  }

  global.ACE0CombatSettlement = {
    PROTOCOL: PROTOCOL,
    normalizeCombatConfig: normalizeCombatConfig,
    classifyOutcome: classifyOutcome,
    buildRewardDelta: buildRewardDelta,
    buildSettlement: buildSettlement,
    buildSettlementFromSession: buildSettlementFromSession,
    buildMarkerPayload: buildMarkerPayload,
    silverToGold: silverToGold,
    goldToSilver: goldToSilver
  };
})(typeof window !== 'undefined' ? window : globalThis);
