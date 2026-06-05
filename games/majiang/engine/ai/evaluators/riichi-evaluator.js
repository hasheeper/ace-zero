(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('../../base/majiang-core-adapter'),
      require('../difficulty/easy-policy'),
      require('../difficulty/normal-policy'),
      require('../difficulty/hard-policy'),
      require('../support/hard-ev'),
      require('../support/round-context')
    );
    return;
  }
  root.AceMahjongRiichiEvaluator = factory(
    root.AceMahjongBrowserCoreAdapter || null,
    root.AceMahjongEasyDifficultyPolicy || null,
    root.AceMahjongNormalDifficultyPolicy || null,
    root.AceMahjongHardDifficultyPolicy || null,
    root.AceMahjongAiHardEv || null,
    root.AceMahjongAiRoundContext || null
  );
})(typeof globalThis !== 'undefined' ? globalThis : this, function(
  coreAdapter,
  easyPolicyApi,
  normalPolicyApi,
  hardPolicyApi,
  hardEvApi,
  roundContextApi
) {
  'use strict';

  function getCoreAdapter() {
    if (coreAdapter) return coreAdapter;
    if (typeof globalThis !== 'undefined' && globalThis.AceMahjongBrowserCoreAdapter) {
      return globalThis.AceMahjongBrowserCoreAdapter;
    }
    throw new Error('AceMahjongRiichiEvaluator requires a majiang core adapter.');
  }

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function normalizeDifficulty(value) {
    const difficulty = typeof value === 'string' ? value.toLowerCase() : 'normal';
    if (difficulty === 'easy') return 'easy';
    if (difficulty === 'hard') return 'hard';
    if (difficulty === 'hell') return 'hell';
    return 'normal';
  }

  function createPolicyByDifficulty(difficulty) {
    if (difficulty === 'easy' && easyPolicyApi && typeof easyPolicyApi.createEasyPolicy === 'function') {
      return easyPolicyApi.createEasyPolicy();
    }
    if (difficulty === 'hard' && hardPolicyApi && typeof hardPolicyApi.createHardPolicy === 'function') {
      return hardPolicyApi.createHardPolicy();
    }
    if (difficulty === 'hell' && hardPolicyApi && typeof hardPolicyApi.createHardPolicy === 'function') {
      return {
        ...hardPolicyApi.createHardPolicy(),
        id: 'hell'
      };
    }
    if (normalPolicyApi && typeof normalPolicyApi.createNormalPolicy === 'function') {
      return normalPolicyApi.createNormalPolicy();
    }
    return { id: normalizeDifficulty(difficulty) };
  }

  function normalizeCandidate(code) {
    return String(code || '').replace(/\*$/, '');
  }

  function getSeatScore(runtime, seatKey, seatIndex) {
    if (!runtime || !runtime.board || !Array.isArray(runtime.board.defen)) return 0;
    const playerIndex = typeof runtime.getPlayerIdentityIndex === 'function'
      ? runtime.getPlayerIdentityIndex(seatKey)
      : seatIndex;
    return Number(runtime.board.defen[playerIndex] || 0) || 0;
  }

  function resolvePolicy(options = {}) {
    if (options.policy && typeof options.policy === 'object') {
      return clone(options.policy);
    }
    return createPolicyByDifficulty(normalizeDifficulty(options.difficulty));
  }

  function getHardEvApi() {
    if (hardEvApi) return hardEvApi;
    if (typeof globalThis !== 'undefined' && globalThis.AceMahjongAiHardEv) {
      return globalThis.AceMahjongAiHardEv;
    }
    return null;
  }

  function getRoundContextApi() {
    if (roundContextApi) return roundContextApi;
    if (typeof globalThis !== 'undefined' && globalThis.AceMahjongAiRoundContext) {
      return globalThis.AceMahjongAiRoundContext;
    }
    return null;
  }

  function simulateDiscard(shoupai, tileCode) {
    if (!shoupai || typeof shoupai.clone !== 'function' || !tileCode) return null;
    try {
      return shoupai.clone().dapai(normalizeCandidate(tileCode));
    } catch (error) {
      return null;
    }
  }

  function evaluateHardRiichiMetrics(adapter, runtime, seatKey, shoupai, discardDecision, policy, handValueEstimate) {
    const contextApi = getRoundContextApi();
    const existing = discardDecision && discardDecision.hardMetrics && typeof discardDecision.hardMetrics === 'object'
      ? discardDecision.hardMetrics
      : null;
    let hardMetrics = existing;
    const hardContext = hardMetrics && hardMetrics.hardContext
      ? hardMetrics.hardContext
      : contextApi && typeof contextApi.buildRuntimeHardRoundContext === 'function'
      ? contextApi.buildRuntimeHardRoundContext(runtime, seatKey, {
          contextPolicy: policy && policy.context && typeof policy.context === 'object'
            ? policy.context
            : {}
        })
      : null;

    if (!hardMetrics) {
      const api = getHardEvApi();
      const simulated = simulateDiscard(shoupai, discardDecision && discardDecision.tileCode);
      if (api && simulated && typeof api.evaluateHardDiscardMetrics === 'function') {
        hardMetrics = api.evaluateHardDiscardMetrics(adapter, runtime, seatKey, simulated, {
          handValueEstimate,
          policy: policy && policy.discard && typeof policy.discard === 'object'
            ? policy.discard
            : {},
          contextPolicy: policy && policy.context && typeof policy.context === 'object'
            ? policy.context
            : {},
          hardContext
        });
      }
    }

    const pushFoldState = discardDecision && discardDecision.pushFoldState && typeof discardDecision.pushFoldState === 'object'
      ? discardDecision.pushFoldState
      : {};
    const danger = discardDecision && discardDecision.danger && typeof discardDecision.danger === 'object'
      ? discardDecision.danger
      : {};

    const contextualHandValueEstimate = Number.isFinite(Number(hardMetrics && hardMetrics.contextualHandValueEstimate))
      ? Number(hardMetrics.contextualHandValueEstimate)
      : contextApi && typeof contextApi.applyHardContextToHandValue === 'function'
      ? contextApi.applyHardContextToHandValue(handValueEstimate, hardContext)
      : Number(handValueEstimate || 0) || 0;

    return {
      liveTingpaiCount: Number(hardMetrics && hardMetrics.liveTingpaiCount || 0) || 0,
      waitQualityScore: Number(hardMetrics && hardMetrics.waitQualityScore || 0) || 0,
      bestWaitType: hardMetrics && typeof hardMetrics.bestWaitType === 'string'
        ? hardMetrics.bestWaitType
        : null,
      handValueEstimate: Number(handValueEstimate || 0) || 0,
      contextualHandValueEstimate,
      pressureScore: Number(pushFoldState.pressureScore || 0) || 0,
      pushFoldState: typeof pushFoldState.state === 'string' ? pushFoldState.state : 'neutral',
      discardDangerScore: Number(danger.dangerScore || 0) || 0,
      hardContext,
      waits: Array.isArray(hardMetrics && hardMetrics.waits) ? hardMetrics.waits.slice() : []
    };
  }

  function buildRejectedResult(reason, policy, hardRiichiMetrics = null) {
    const result = {
      shouldRiichi: false,
      score: 0,
      reasons: [reason],
      policy
    };
    if (hardRiichiMetrics) {
      result.hardRiichiMetrics = hardRiichiMetrics;
    }
    return result;
  }

  function numberFromPolicy(source, key, fallback) {
    const value = Number(source && source[key]);
    return Number.isFinite(value) ? value : fallback;
  }

  function shouldAllowNoPressureThinRiichi(riichiPolicy, hardRiichiMetrics, remaining, contextualHandValueEstimate) {
    if (!riichiPolicy || riichiPolicy.allowNoPressureThinRiichi !== true) return false;
    const allowedWaitTypes = Array.isArray(riichiPolicy.thinRiichiAllowedWaitTypes)
      ? riichiPolicy.thinRiichiAllowedWaitTypes
      : ['tanki'];
    if (!allowedWaitTypes.includes(hardRiichiMetrics.bestWaitType || 'unknown')) return false;
    if (hardRiichiMetrics.pushFoldState === 'careful' || hardRiichiMetrics.pressureScore > 0) return false;

    const minRemainingTiles = numberFromPolicy(riichiPolicy, 'thinRiichiMinRemainingTiles', Infinity);
    const minLiveTingpai = numberFromPolicy(riichiPolicy, 'thinRiichiMinLiveTingpai', Infinity);
    const minHandValue = numberFromPolicy(riichiPolicy, 'thinRiichiMinHandValue', Infinity);
    const maxDiscardDanger = numberFromPolicy(riichiPolicy, 'thinRiichiMaxDiscardDanger', -Infinity);

    return remaining >= minRemainingTiles
      && hardRiichiMetrics.liveTingpaiCount >= minLiveTingpai
      && contextualHandValueEstimate >= minHandValue
      && hardRiichiMetrics.discardDangerScore <= maxDiscardDanger;
  }

  function evaluateHardRiichiGate(adapter, runtime, seatKey, shoupai, discardDecision, policy, riichiPolicy, remaining, tingpaiCount, handValueEstimate) {
    const hardRiichiMetrics = evaluateHardRiichiMetrics(
      adapter,
      runtime,
      seatKey,
      shoupai,
      discardDecision,
      policy,
      handValueEstimate
    );
    const minLiveTingpaiCount = Number(riichiPolicy.minLiveTingpaiCount || 0) || 0;
    const minWaitQualityScore = Number(riichiPolicy.minWaitQualityScore || 0) || 0;
    const goodWaitTypes = Array.isArray(riichiPolicy.goodWaitTypes)
      ? riichiPolicy.goodWaitTypes
      : ['ryanmen', 'shanpon'];
    const bestWaitType = hardRiichiMetrics.bestWaitType || 'unknown';
    const isGoodWait = goodWaitTypes.includes(bestWaitType);
    const contextualHandValueEstimate = Number.isFinite(Number(hardRiichiMetrics.contextualHandValueEstimate))
      ? Number(hardRiichiMetrics.contextualHandValueEstimate)
      : handValueEstimate;
    const allowThinRiichi = shouldAllowNoPressureThinRiichi(
      riichiPolicy,
      hardRiichiMetrics,
      remaining,
      contextualHandValueEstimate
    );

    if (hardRiichiMetrics.liveTingpaiCount < minLiveTingpaiCount) {
      return buildRejectedResult('hard-riichi-live-wait-too-low', policy, hardRiichiMetrics);
    }
    if (hardRiichiMetrics.waitQualityScore < minWaitQualityScore && !allowThinRiichi) {
      return buildRejectedResult('hard-riichi-wait-quality-too-low', policy, hardRiichiMetrics);
    }

    if (!isGoodWait && !allowThinRiichi) {
      const badWaitMinHandValue = Number.isFinite(Number(riichiPolicy.badWaitMinHandValue))
        ? Number(riichiPolicy.badWaitMinHandValue)
        : Infinity;
      const badWaitMinRemainingTiles = Number.isFinite(Number(riichiPolicy.badWaitMinRemainingTiles))
        ? Number(riichiPolicy.badWaitMinRemainingTiles)
        : 0;
      if (remaining < badWaitMinRemainingTiles) {
        return buildRejectedResult('hard-riichi-bad-wait-too-late', policy, hardRiichiMetrics);
      }
      if (riichiPolicy.allowBadWait === false && contextualHandValueEstimate < badWaitMinHandValue) {
        return buildRejectedResult('hard-riichi-bad-wait-value-too-low', policy, hardRiichiMetrics);
      }
    }

    if (hardRiichiMetrics.pushFoldState === 'careful' && hardRiichiMetrics.pressureScore > 0) {
      const pressureMinHandValue = Number.isFinite(Number(riichiPolicy.pressureMinHandValue))
        ? Number(riichiPolicy.pressureMinHandValue)
        : Infinity;
      const maxPressureDiscardDanger = Number.isFinite(Number(riichiPolicy.maxPressureDiscardDanger))
        ? Number(riichiPolicy.maxPressureDiscardDanger)
        : Infinity;
      if (contextualHandValueEstimate < pressureMinHandValue) {
        return buildRejectedResult('hard-riichi-pressure-value-too-low', policy, hardRiichiMetrics);
      }
      if (hardRiichiMetrics.discardDangerScore > maxPressureDiscardDanger) {
        return buildRejectedResult('hard-riichi-pressure-discard-too-dangerous', policy, hardRiichiMetrics);
      }
    }

    return {
      shouldRiichi: true,
      hardRiichiMetrics,
      reasons: allowThinRiichi ? ['hard-riichi-no-pressure-thin-wait-exception'] : []
    };
  }

  function evaluateRuntimeRiichi(runtime, seatKey, shoupai, discardDecision, options = {}) {
    const adapter = getCoreAdapter();
    const difficulty = normalizeDifficulty(options.difficulty);
    const policy = resolvePolicy(options);
    const riichiPolicy = policy && policy.riichi && typeof policy.riichi === 'object'
      ? policy.riichi
      : {};
    const metrics = discardDecision && discardDecision.metrics && typeof discardDecision.metrics === 'object'
      ? discardDecision.metrics
      : {};
    const reasons = [];

    if (!runtime || !seatKey || !shoupai || !discardDecision) {
      return {
        shouldRiichi: false,
        score: 0,
        reasons: ['riichi-missing-context'],
        policy
      };
    }

    if (metrics.xiangting !== 0) {
      return {
        shouldRiichi: false,
        score: 0,
        reasons: ['riichi-not-tenpai'],
        policy
      };
    }

    if (!runtime.rulesetProfile || runtime.rulesetProfile.enableRiichi === false) {
      return {
        shouldRiichi: false,
        score: 0,
        reasons: ['riichi-disabled-by-ruleset'],
        policy
      };
    }

    const seatIndex = typeof runtime.getSeatIndex === 'function' ? runtime.getSeatIndex(seatKey) : -1;
    if (seatIndex < 0) {
      return {
        shouldRiichi: false,
        score: 0,
        reasons: ['riichi-invalid-seat'],
        policy
      };
    }

    const wallState = typeof runtime.getWallState === 'function' ? runtime.getWallState() : null;
    const remaining = wallState ? Number(wallState.remaining || 0) : 0;
    const seatScore = getSeatScore(runtime, seatKey, seatIndex);
    const riichiChoices = adapter.getRiichiChoices(runtime.rule, shoupai.clone(), remaining, seatScore);
    const normalizedChoices = Array.isArray(riichiChoices)
      ? riichiChoices.map((choice) => normalizeCandidate(choice)).filter(Boolean)
      : [];
    const tingpaiCount = Number(metrics.tingpaiCount || 0) || 0;
    const handValueEstimate = Number(metrics.handValueEstimate || 0) || 0;
    const minTingpaiCount = Number(riichiPolicy.minTingpaiCount || 0) || 0;
    const minRemainingTiles = Number(riichiPolicy.minRemainingTiles || 0) || 0;
    const minHandValueEstimate = Number(riichiPolicy.minHandValueEstimate || 0) || 0;

    if (riichiPolicy.requireLegalChoice !== false && !normalizedChoices.includes(discardDecision.tileCode)) {
      return {
        shouldRiichi: false,
        score: 0,
        reasons: ['riichi-illegal-discard-choice'],
        policy
      };
    }
    if (tingpaiCount < minTingpaiCount) {
      return {
        shouldRiichi: false,
        score: 0,
        reasons: ['riichi-wait-count-too-low'],
        policy
      };
    }
    if (remaining < minRemainingTiles) {
      return {
        shouldRiichi: false,
        score: 0,
        reasons: ['riichi-too-late'],
        policy
      };
    }
    if (handValueEstimate < minHandValueEstimate) {
      return {
        shouldRiichi: false,
        score: 0,
        reasons: ['riichi-hand-value-too-low'],
        policy
      };
    }

    let hardRiichiMetrics = null;
    if (difficulty === 'hard') {
      const hardGate = evaluateHardRiichiGate(
        adapter,
        runtime,
        seatKey,
        shoupai,
        discardDecision,
        policy,
        riichiPolicy,
        remaining,
        tingpaiCount,
        handValueEstimate
      );
      if (!hardGate.shouldRiichi) return hardGate;
      hardRiichiMetrics = hardGate.hardRiichiMetrics;
      if (Array.isArray(hardGate.reasons) && hardGate.reasons.length) {
        reasons.push(...hardGate.reasons);
      }
      reasons.push('hard-riichi-context-cleared');
    }

    reasons.push('riichi-legal-choice');
    reasons.push('riichi-thresholds-cleared');

    const result = {
      shouldRiichi: true,
      score: tingpaiCount + handValueEstimate,
      reasons,
      policy,
      thresholds: {
        minTingpaiCount,
        minRemainingTiles,
        minHandValueEstimate
      }
    };
    if (hardRiichiMetrics) {
      result.hardRiichiMetrics = hardRiichiMetrics;
    }
    return result;
  }

  function createRiichiEvaluator() {
    return {
      evaluateRiichi: evaluateRuntimeRiichi,
      evaluateRuntimeRiichi
    };
  }

  return {
    evaluateRuntimeRiichi,
    createRiichiEvaluator
  };
});
