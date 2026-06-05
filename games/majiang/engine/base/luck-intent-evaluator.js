(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./majiang-core-adapter'),
      require('../ai/support/hand-metrics'),
      require('../ai/support/danger-model'),
      require('../ai/support/round-context'),
      require('./luck-commit-route-evaluator'),
      require('../../shared/runtime/luck')
    );
    return;
  }

  root.AceMahjongLuckIntentEvaluator = factory(
    root.AceMahjongBrowserCoreAdapter,
    root.AceMahjongAiHandMetrics,
    root.AceMahjongAiDangerModel,
    root.AceMahjongAiRoundContext,
    root.AceMahjongLuckCommitRouteEvaluator,
    root.AceMahjongLuck
  );
})(typeof globalThis !== 'undefined' ? globalThis : this, function(
  coreAdapter,
  handMetricsApi,
  dangerModelApi,
  roundContextApi,
  commitRouteEvaluatorApi,
  luck
) {
  'use strict';

  function numberOr(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, numberOr(value, min)));
  }

  function normalizeTileCode(tileCode) {
    return luck && typeof luck.normalizeTileCode === 'function'
      ? luck.normalizeTileCode(tileCode)
      : null;
  }

  function createShoupaiFromCodes(tileCodes = []) {
    if (!coreAdapter || !coreAdapter.Majiang || !coreAdapter.Majiang.Shoupai) return null;
    return new coreAdapter.Majiang.Shoupai((Array.isArray(tileCodes) ? tileCodes : []).slice());
  }

  function getSeatState(state, seatKey) {
    const seats = state && Array.isArray(state.seats) ? state.seats : [];
    return seats.find((seat) => seat && seat.seat === seatKey) || null;
  }

  function getActiveSeats(state) {
    return state && Array.isArray(state.activeSeats) && state.activeSeats.length
      ? state.activeSeats.slice()
      : ['bottom', 'right', 'top', 'left'];
  }

  function buildRuntimeView(state, seatKey, shoupai) {
    const activeSeats = getActiveSeats(state);
    const seatStates = activeSeats.map((activeSeatKey) => getSeatState(state, activeSeatKey) || { seat: activeSeatKey });
    const he = seatStates.map((seatState) => ({
      _pai: Array.isArray(seatState.riverCodes) ? seatState.riverCodes.slice() : []
    }));
    const shoupaiList = seatStates.map((seatState) => {
      if (seatState.seat === seatKey) return shoupai;
      const placeholder = createShoupaiFromCodes([]);
      if (placeholder && Array.isArray(seatState.melds)) {
        placeholder._fulou = seatState.melds.slice();
      }
      return placeholder;
    });

    return {
      topology: { activeSeats },
      activeSeats,
      riichiState: state && state.riichiState && typeof state.riichiState === 'object' ? state.riichiState : {},
      roundConfig: state && state.roundConfig ? state.roundConfig : {},
      board: {
        he,
        shoupai: shoupaiList,
        defen: activeSeats.map((activeSeatKey) => numberOr(state && state.scores && state.scores[activeSeatKey], 0)),
        changbang: numberOr(state && state.roundConfig && state.roundConfig.changbang, 0),
        lizhibang: numberOr(state && state.roundConfig && state.roundConfig.lizhibang, 0)
      },
      getSeatIndex(targetSeatKey) {
        return activeSeats.indexOf(targetSeatKey);
      },
      getSeatHandCodes(targetSeatKey) {
        if (targetSeatKey !== seatKey) return [];
        return state && Array.isArray(state.handCodes) ? state.handCodes.slice() : [];
      },
      getWallState() {
        return state && state.wallState ? { ...state.wallState } : {};
      },
      getScoreMap() {
        return activeSeats.reduce((result, activeSeatKey) => {
          result[activeSeatKey] = numberOr(state && state.scores && state.scores[activeSeatKey], 0);
          return result;
        }, {});
      },
      getDealerSeat() {
        return state && state.dealerSeat ? state.dealerSeat : activeSeats[0] || 'bottom';
      }
    };
  }

  function countTiles(tileCodes = []) {
    return tileCodes.reduce((counts, tileCode) => {
      const normalized = normalizeTileCode(tileCode);
      if (!normalized) return counts;
      counts[normalized] = (counts[normalized] || 0) + 1;
      return counts;
    }, Object.create(null));
  }

  function hasTile(counts, tileCode) {
    return Number(counts[tileCode] || 0) > 0;
  }

  function getDominantSuit(counts) {
    const suitCounts = ['m', 'p', 's'].map((suit) => ({
      suit,
      count: Object.keys(counts).reduce((sum, tileCode) => (
        tileCode[0] === suit ? sum + Number(counts[tileCode] || 0) : sum
      ), 0)
    })).sort((left, right) => right.count - left.count);
    return suitCounts[0] && suitCounts[0].count >= 5 ? suitCounts[0] : null;
  }

  function evaluateGenericCommit(tileCode, handCodes) {
    const normalized = normalizeTileCode(tileCode);
    if (!normalized) return 0;
    const counts = countTiles(handCodes);
    const suit = normalized[0];
    const rank = Number(normalized[1]);
    const dominantSuit = getDominantSuit(counts);
    let score = 0;

    if (dominantSuit) {
      if (suit === dominantSuit.suit) score += 0.45;
      else if (suit !== 'z') score -= 0.25;
      else score -= 0.15;
    }

    const sameCount = Number(counts[normalized] || 0);
    if (sameCount === 1) score += 0.2;
    if (sameCount >= 2) score += 0.35;

    if (suit !== 'z') {
      const neighbor = hasTile(counts, `${suit}${rank - 1}`) || hasTile(counts, `${suit}${rank + 1}`);
      const skip = hasTile(counts, `${suit}${rank - 2}`) || hasTile(counts, `${suit}${rank + 2}`);
      if (neighbor) score += 0.25;
      else if (skip) score += 0.1;
      else score -= 0.12;
    }

    return clamp(score, -1, 1);
  }

  function evaluateCommit(tileCode, state, commitRouteSelection) {
    if (commitRouteEvaluatorApi && typeof commitRouteEvaluatorApi.scoreRouteTile === 'function') {
      return commitRouteEvaluatorApi.scoreRouteTile(tileCode, {
        handCodes: state && Array.isArray(state.handCodes) ? state.handCodes : [],
        wallState: state && state.wallState ? state.wallState : {},
        roundConfig: state && state.roundConfig ? state.roundConfig : {},
        activeSeats: state && Array.isArray(state.activeSeats) ? state.activeSeats : [],
        dealerSeat: state && state.dealerSeat ? state.dealerSeat : null,
        seat: state && state.seat ? state.seat : null
      }, commitRouteSelection);
    }
    return evaluateGenericCommit(tileCode, state && Array.isArray(state.handCodes) ? state.handCodes : []);
  }

  function isRedFive(tileCode) {
    return /^[mps]0$/.test(String(tileCode || '').replace(/[\*_\+\=\-]+$/g, ''));
  }

  function getDoraTilesFromState(state) {
    const indicators = state && state.wallState && Array.isArray(state.wallState.doraIndicators)
      ? state.wallState.doraIndicators
      : [];
    return indicators
      .map((indicator) => (
        dangerModelApi && typeof dangerModelApi.getDoraTileFromIndicator === 'function'
          ? dangerModelApi.getDoraTileFromIndicator(indicator)
          : null
      ))
      .filter(Boolean);
  }

  function evaluateBestPostDrawDiscard(input = {}) {
    const {
      runtimeView,
      seatKey,
      drawnShoupai,
      baseXiangting,
      baseUkeire,
      baseShapeValue
    } = input;
    const discardCandidates = coreAdapter && typeof coreAdapter.getDiscardCandidates === 'function'
      ? coreAdapter.getDiscardCandidates(runtimeView.rule || {}, drawnShoupai.clone()).filter(Boolean)
      : [];
    const candidates = discardCandidates.length ? discardCandidates : [];
    let best = null;

    candidates.forEach((discardTileCode) => {
      let simulated = null;
      try {
        simulated = drawnShoupai.clone().dapai(discardTileCode);
      } catch (error) {
        return;
      }

      const xiangting = coreAdapter.calculateXiangting(simulated.clone());
      const ukeireCount = handMetricsApi.estimateUkeireCount(coreAdapter, simulated.clone());
      const shapeValue = handMetricsApi.estimateHandShapeValue(simulated.clone());
      const danger = dangerModelApi && typeof dangerModelApi.evaluateRuntimeHardTileDanger === 'function'
        ? dangerModelApi.evaluateRuntimeHardTileDanger(runtimeView, seatKey, discardTileCode)
        : { dangerScore: 0, safetyRank: 9 };
      const shantenGain = numberOr(baseXiangting, xiangting) - xiangting;
      const score = shantenGain * 100
        + (ukeireCount - baseUkeire) * 2
        + (shapeValue - baseShapeValue)
        - numberOr(danger.dangerScore, 0) * 2
        - numberOr(danger.safetyRank, 9) * 0.2;

      if (!best || score > best.score) {
        best = {
          discardTileCode,
          xiangting,
          ukeireCount,
          shapeValue,
          danger,
          score
        };
      }
    });

    return best;
  }

  function buildRuntimeCandidateLocalValue(runtimeView, state, seatKey, shoupai, tileCode, commitRouteSelection = null) {
    const normalized = normalizeTileCode(tileCode);
    if (!normalized || !shoupai || typeof shoupai.clone !== 'function') return null;

    const baseShoupai = shoupai.clone();
    const baseXiangting = coreAdapter.calculateXiangting(baseShoupai.clone());
    const baseUkeire = handMetricsApi.estimateUkeireCount(coreAdapter, baseShoupai.clone());
    const baseShapeValue = handMetricsApi.estimateHandShapeValue(baseShoupai.clone());
    let drawnShoupai = null;
    try {
      drawnShoupai = shoupai.clone();
      drawnShoupai.zimo(normalized, false);
    } catch (error) {
      return null;
    }

    const best = evaluateBestPostDrawDiscard({
      runtimeView,
      seatKey,
      drawnShoupai,
      baseXiangting,
      baseUkeire,
      baseShapeValue
    });
    if (!best) return null;

    const shantenGain = baseXiangting - best.xiangting;
    const ukeireDelta = best.ukeireCount - baseUkeire;
    const shapeDelta = best.shapeValue - baseShapeValue;
    const doraTiles = getDoraTilesFromState(state);
    const doraBoost = doraTiles.includes(normalized) ? 0.45 : isRedFive(tileCode) ? 0.25 : 0;
    const safetyRank = numberOr(best.danger && best.danger.safetyRank, 9);
    const dangerScore = numberOr(best.danger && best.danger.dangerScore, 0);

    return {
      speed: clamp(shantenGain * 0.58 + ukeireDelta / 24, -1, 1),
      value: clamp(shapeDelta / 18 + doraBoost, -1, 1),
      shape: clamp(shapeDelta / 18 + ukeireDelta / 32, -1, 1),
      safety: clamp(1 - safetyRank / 9 - dangerScore / 16, -1, 1),
      commit: evaluateCommit(normalized, { ...state, seat: seatKey }, commitRouteSelection),
      volatility: clamp(dangerScore / 12 + Math.max(0, -shantenGain) * 0.25, 0, 1)
    };
  }

  function getPressureScore(state) {
    const activeSeats = getActiveSeats(state);
    const riichiState = state && state.riichiState && typeof state.riichiState === 'object' ? state.riichiState : {};
    const riichiCount = activeSeats.filter((seatKey) => (
      seatKey !== (state && state.seat)
      && riichiState[seatKey]
      && riichiState[seatKey].declared === true
    )).length;
    const remaining = numberOr(state && state.wallState && state.wallState.remaining, 70);
    const latePressure = remaining > 0 && remaining <= 18 ? 0.25 : 0;
    return clamp(riichiCount * 0.45 + latePressure, 0, 1);
  }

  function getRouteConfidence(handCodes = [], routeSelection = null) {
    if (routeSelection && Number.isFinite(Number(routeSelection.routeConfidence))) {
      return clamp(Number(routeSelection.routeConfidence), 0, 1);
    }
    const counts = countTiles(handCodes);
    const dominantSuit = getDominantSuit(counts);
    const pairCount = Object.keys(counts).filter((tileCode) => Number(counts[tileCode] || 0) >= 2).length;
    return clamp((dominantSuit ? (dominantSuit.count - 4) / 8 : 0) + pairCount / 8, 0, 1);
  }

  function buildRuntimeObjectiveIntent(runtimeView, state, seatKey, shoupai, commitRouteSelection = null) {
    const baseXiangting = shoupai && typeof shoupai.clone === 'function'
      ? coreAdapter.calculateXiangting(shoupai.clone())
      : 3;
    const baseShapeValue = shoupai && typeof shoupai.clone === 'function'
      ? handMetricsApi.estimateHandShapeValue(shoupai.clone())
      : 0;
    const hardContext = roundContextApi && typeof roundContextApi.buildRuntimeHardRoundContext === 'function'
      ? roundContextApi.buildRuntimeHardRoundContext(runtimeView, seatKey)
      : null;
    const pressure = getPressureScore({ ...state, seat: seatKey });
    const routeConfidence = getRouteConfidence(state && state.handCodes, commitRouteSelection);
    const speed = baseXiangting <= 1 ? 0.42 : baseXiangting === 2 ? 0.34 : 0.28;
    const value = 0.22 + clamp(baseShapeValue / 80, 0, 0.2)
      + (numberOr(hardContext && hardContext.attackValueBonus, 0) > 0 ? 0.08 : 0);
    const safety = 0.14 + pressure * 0.55;
    const commit = 0.16 + routeConfidence * 0.28;
    return luck.normalizeIntent({
      speed,
      value,
      safety,
      commit,
      pressure,
      confidence: clamp(0.45 + routeConfidence * 0.45, 0, 1)
    });
  }

  function resolveWindStateFromEvaluationInput(input, payload, seatKey) {
    const options = input && input.options && typeof input.options === 'object' ? input.options : {};
    const windStateBySeat = options.windStateBySeat && typeof options.windStateBySeat === 'object'
      ? options.windStateBySeat
      : {};
    if (seatKey && windStateBySeat[seatKey] && typeof windStateBySeat[seatKey] === 'object') {
      return windStateBySeat[seatKey];
    }
    if (payload.windState && typeof payload.windState === 'object') return payload.windState;
    if (options.windState && typeof options.windState === 'object') return options.windState;
    return {};
  }

  function buildCommitRouteSelection(state, seatKey, windState) {
    if (!commitRouteEvaluatorApi || typeof commitRouteEvaluatorApi.buildCommitRouteSelection !== 'function') {
      return {
        requestedRouteId: windState && windState.commitRouteId ? windState.commitRouteId : 'auto',
        selectedRouteId: 'auto',
        routeConfidence: getRouteConfidence(state && state.handCodes),
        blockedReason: null,
        selectedRoute: null,
        routes: []
      };
    }
    return commitRouteEvaluatorApi.buildCommitRouteSelection({
      handCodes: state && Array.isArray(state.handCodes) ? state.handCodes : [],
      wallState: state && state.wallState ? state.wallState : {},
      roundConfig: state && state.roundConfig ? state.roundConfig : {},
      activeSeats: state && Array.isArray(state.activeSeats) ? state.activeSeats : [],
      dealerSeat: state && state.dealerSeat ? state.dealerSeat : null,
      seat: seatKey
    }, windState && windState.commitRouteId ? windState.commitRouteId : 'auto');
  }

  function buildLuckRuntimeEvaluation(input = {}) {
    const payload = input.payload && typeof input.payload === 'object' ? input.payload : {};
    const state = payload.luckRuntimeState && typeof payload.luckRuntimeState === 'object'
      ? payload.luckRuntimeState
      : null;
    const seatKey = payload.seat || payload.seatKey || (state && state.seat) || null;
    const candidateTileCodes = Array.isArray(input.candidateTileCodes) ? input.candidateTileCodes : [];
    if (!state || !seatKey || !Array.isArray(state.handCodes) || !state.handCodes.length) {
      return null;
    }

    const shoupai = createShoupaiFromCodes(state.handCodes);
    if (!shoupai) return null;
    const runtimeView = buildRuntimeView(state, seatKey, shoupai);
    runtimeView.rule = state.rule || {};
    const windState = resolveWindStateFromEvaluationInput(input, payload, seatKey);
    const commitRouteSelection = buildCommitRouteSelection(state, seatKey, windState);

    const candidateLocalValues = {};
    candidateTileCodes.forEach((tileCode) => {
      const normalized = normalizeTileCode(tileCode);
      if (!normalized) return;
      const localValue = buildRuntimeCandidateLocalValue(
        runtimeView,
        state,
        seatKey,
        shoupai,
        normalized,
        commitRouteSelection
      );
      if (localValue) candidateLocalValues[normalized] = luck.normalizeLocalValue(localValue);
    });

    return {
      objectiveIntent: buildRuntimeObjectiveIntent(runtimeView, state, seatKey, shoupai, commitRouteSelection),
      candidateLocalValues,
      diagnostics: {
        seat: seatKey,
        candidateCount: Object.keys(candidateLocalValues).length,
        pressure: getPressureScore({ ...state, seat: seatKey }),
        routeConfidence: getRouteConfidence(state.handCodes, commitRouteSelection),
        commitRouteSelection
      }
    };
  }

  return {
    buildLuckRuntimeEvaluation,
    buildRuntimeObjectiveIntent,
    buildRuntimeCandidateLocalValue,
    buildCommitRouteSelection
  };
});
