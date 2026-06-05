(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./hard-policy')
    );
    return;
  }
  root.AceMahjongHardVariantPolicies = factory(
    root.AceMahjongHardDifficultyPolicy || null
  );
})(typeof globalThis !== 'undefined' ? globalThis : this, function(hardPolicyApi) {
  'use strict';

  const EXPERIMENTAL_OVERLAYS = Object.freeze({
    DEFENSE_EQUAL_SAFE_BACKSTEP_V1: 'defense-equal-safe-backstep-v1',
    NO_PRESSURE_SAME_XIANGTING_RERANK_V1: 'no-pressure-same-xiangting-rerank-v1',
    CLOSED_ROUTE_VALUE_REBALANCE_V1: 'closed-route-value-rebalance-v1'
  });

  const HARD_VARIANT_ALIASES = Object.freeze({
    'hard-pure': 'hard-pure-v1',
    'hard-aggressive': 'hard-pure-v1',
    'hard-aggressive-dev': 'hard-pure-v1-dev',
    'hard-tuned': 'hard-tuned-v2',
    'hard-defensive': 'hard-tuned-v2',
    'hard-defensive-dev': 'hard-closed-defense',
    'hard-balanced': 'hard-standard',
    'hard-balanced-dev': 'hard-standard-dev',
    'hard-heavy': 'hard-value-classic'
  });

  const HARD_BASE_POLICY_IDS = Object.freeze(['hard', 'hell']);
  const HARD_CLOSED_ROUTE_POLICY_IDS = Object.freeze([
    'hard-experimental',
    'hard-standard',
    'hard-standard-dev',
    'hard-value-classic'
  ]);
  const HARD_BALANCED_ROUTE_POLICY_IDS = Object.freeze([
    'hard-standard',
    'hard-standard-dev'
  ]);
  let hardVariantPresetCache = null;

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function normalizeHardVariantId(id) {
    const normalized = typeof id === 'string' ? id.trim().toLowerCase() : '';
    return normalized ? (HARD_VARIANT_ALIASES[normalized] || normalized) : '';
  }

  function normalizeHardPolicyId(id) {
    const normalized = typeof id === 'string' ? id.trim().toLowerCase() : '';
    if (!normalized) return '';
    if (HARD_BASE_POLICY_IDS.includes(normalized)) return normalized;
    return normalizeHardVariantId(normalized);
  }

  function createBaseHardPolicy(id) {
    const policy = hardPolicyApi && typeof hardPolicyApi.createHardPolicy === 'function'
      ? hardPolicyApi.createHardPolicy()
      : { id };
    policy.id = id;
    return policy;
  }

  function createPureHardPolicy() {
    const policy = createBaseHardPolicy('hard-pure-v1');
    policy.personality = 'pure-v1';
    if (policy.discard && typeof policy.discard === 'object') {
      policy.discard.enableNoPressureShapeReview = false;
      policy.discard.shapeStrongOverrideEnabled = false;
      policy.discard.enableNoPressureCleanupGuard = false;
    }
    if (policy.defense && typeof policy.defense === 'object') {
      policy.defense.enableLowDangerTiebreak = false;
    }
    if (policy.riichi && typeof policy.riichi === 'object') {
      policy.riichi.allowNoPressureThinRiichi = false;
    }
    return policy;
  }

  function createTunedHardPolicy() {
    const policy = createBaseHardPolicy('hard-tuned-v2');
    policy.personality = 'tuned-v2';
    return policy;
  }

  function normalizeExperimentalOverlays(value = []) {
    if (Array.isArray(value)) {
      return value.map((entry) => String(entry || '').trim()).filter(Boolean);
    }
    if (value && typeof value === 'object' && Array.isArray(value.experimentalOverlays)) {
      return normalizeExperimentalOverlays(value.experimentalOverlays);
    }
    if (value && typeof value === 'object') {
      return [];
    }
    return String(value || '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  function applyExperimentalOverlay(policy, overlayName) {
    if (overlayName === EXPERIMENTAL_OVERLAYS.DEFENSE_EQUAL_SAFE_BACKSTEP_V1) {
      policy.defense = policy.defense && typeof policy.defense === 'object' ? policy.defense : {};
      policy.defense.enableEqualSafeBackstep = true;
      policy.defense.equalSafeBackstepMinPressure = 8;
      policy.defense.equalSafeBackstepDangerMax = 0;
      policy.defense.equalSafeBackstepSafetyRankMax = 0;
      policy.defense.equalSafeBackstepMinDefenseTileRankGain = 2;
      policy.defense.equalSafeBackstepMaxXiangtingLoss = 1;
      return;
    }
    if (overlayName === EXPERIMENTAL_OVERLAYS.NO_PRESSURE_SAME_XIANGTING_RERANK_V1) {
      policy.discard = policy.discard && typeof policy.discard === 'object' ? policy.discard : {};
      policy.discard.enableNoPressureSameXiangtingRerank = true;
      policy.discard.sameXiangtingRerankMinShapeDelta = 14;
      policy.discard.sameXiangtingRerankMaxHardEvLoss = 60;
      policy.discard.sameXiangtingRerankMinXiangting = 1;
      policy.discard.sameXiangtingRerankMaxXiangting = 4;
      return;
    }
    if (overlayName === EXPERIMENTAL_OVERLAYS.CLOSED_ROUTE_VALUE_REBALANCE_V1) {
      policy.route = policy.route && typeof policy.route === 'object' ? policy.route : {};
      policy.route.enableClosedRouteValueRebalance = true;
      policy.route.closedRouteMaxXiangting = 2;
      policy.route.closedRouteMinRemainingTiles = 24;
      policy.route.closedRouteOverrideMinMargin = 35;
      policy.route.directTenpaiCallAlwaysAllow = true;
      policy.route.pressureDisablesClosedRouteOverride = true;
      policy.route.weights = {
        ...((policy.route && policy.route.weights) || {})
      };
      return;
    }
    throw new Error(`Unknown hard experimental overlay: ${overlayName}`);
  }

  function createExperimentalHardPolicy(options = {}) {
    const overlays = normalizeExperimentalOverlays(options);
    const policy = createTunedHardPolicy();
    policy.id = 'hard-experimental';
    overlays.forEach((overlayName) => applyExperimentalOverlay(policy, overlayName));
    policy.experimentalOverlay = {
      enabled: overlays.length > 0,
      overlays,
      note: 'Benchmark-only variant. Defaults to hard-tuned until explicit experimental overlays are enabled.'
    };
    return policy;
  }

  function createStandardHardPolicy() {
    const policy = createTunedHardPolicy();
    policy.id = 'hard-standard';
    policy.personality = 'standard';
    policy.route = policy.route && typeof policy.route === 'object' ? policy.route : {};
    policy.route.enableClosedRouteValueRebalance = true;
    policy.route.enableBalancedRouteState = true;
    policy.route.closedRouteMaxXiangting = 2;
    policy.route.closedRouteMinRemainingTiles = 24;
    policy.route.closedRouteOverrideMinMargin = 95;
    policy.route.balancedValueOverrideMinMargin = 85;
    policy.route.balancedNeutralOverrideMinMargin = 135;
    policy.route.balancedLowValueMax = 30;
    policy.route.balancedStrongCallHardEvDelta = 145;
    policy.route.balancedStrongCallLiveUkeireDelta = 14;
    policy.route.balancedShantenCallHardEvDelta = 70;
    policy.route.balancedShantenCallLiveUkeireDelta = 9;
    policy.route.balancedValueMinRiichiPotential = 48;
    policy.route.balancedValueMinContextualHandValue = 30;
    policy.route.balancedTwoShantenValueMinRiichiPotential = 68;
    policy.route.balancedTwoShantenValueMinContextualHandValue = 50;
    policy.route.directTenpaiCallAlwaysAllow = true;
    policy.route.pressureDisablesClosedRouteOverride = true;
    policy.route.weights = {
      ...((policy.route && policy.route.weights) || {}),
      passClosedBase: 22,
      passWaitQuality: 1.55,
      passContextualHandValue: 1.08,
      passRiichiPotential: 1.25,
      lostClosedRouteBase: 22
    };
    policy.riichi = policy.riichi && typeof policy.riichi === 'object' ? policy.riichi : {};
    policy.riichi.minLiveTingpaiCount = 2;
    policy.riichi.minWaitQualityScore = 6;
    policy.riichi.badWaitMinHandValue = 32;
    policy.riichi.badWaitMinRemainingTiles = 16;
    policy.riichi.thinRiichiAllowedWaitTypes = ['tanki', 'kanchan'];
    policy.riichi.thinRiichiMinRemainingTiles = 24;
    policy.riichi.thinRiichiMinHandValue = 18;
    return policy;
  }

  function createValueClassicHardPolicy() {
    const policy = createTunedHardPolicy();
    policy.id = 'hard-value-classic';
    policy.personality = 'value-classic';
    applyExperimentalOverlay(policy, EXPERIMENTAL_OVERLAYS.CLOSED_ROUTE_VALUE_REBALANCE_V1);
    return policy;
  }

  function createPureDevHardPolicy() {
    const policy = createPureHardPolicy();
    policy.id = 'hard-pure-v1-dev';
    policy.personality = 'pure-v1-dev';
    policy.devVariant = {
      parent: 'hard-pure-v1',
      note: 'Legacy development shell for hard-pure-v1. Kept for compatibility with old hard-aggressive-dev runs.'
    };
    return policy;
  }

  function createClosedDefenseHardPolicy() {
    const policy = createTunedHardPolicy();
    policy.id = 'hard-closed-defense';
    policy.personality = 'closed-defense';
    policy.defense = policy.defense && typeof policy.defense === 'object' ? policy.defense : {};
    policy.defense.enableThreatScoreReview = true;
    policy.defense.enableRankAwarePushFold = true;
    policy.defense.enableDealInAttribution = true;
    policy.defense.enableDefensiveUtilityShadow = true;
    policy.defense.enableSafetyGateRerank = true;
    policy.defense.enableSafetyGateDiagnostics = true;
    policy.defense.enableDefensiveCallGate = true;
    policy.defense.enableDefensiveCallGateDiagnostics = true;
    policy.defense.highThreatScore = 11;
    policy.defense.expectedDealInCostWeight = 0.16;
    policy.defense.safetyGateMinThreatScore = 11;
    policy.defense.safetyGateProtectScore = 8;
    policy.defense.safetyGateMaxXiangtingLoss = 1;
    policy.defense.safetyGateMinDangerDelta = 2;
    policy.defense.safetyGateMinSafetyRankDelta = 2;
    policy.defense.safetyGateMinExpectedCostDelta = 80;
    policy.defense.safetyGateBackstepMinThreatScore = 14;
    policy.defense.safetyGateBackstepMinExpectedCostDelta = 140;
    policy.defense.safetyGateProtectedTenpaiMinHandValue = 42;
    policy.defense.safetyGateProtectedTenpaiMinWaitQuality = 12;
    policy.defense.defensiveCallGateMaxClosedXiangting = 3;
    policy.defense.defensiveCallGateMinRemainingTiles = 14;
    policy.defense.defensiveCallGateNeutralMargin = 55;
    policy.defense.defensiveCallGateProtectMargin = 40;
    policy.defense.defensiveCallGatePressureMargin = 40;
    policy.defense.defensiveCallGateComebackMargin = 120;
    policy.defense.defensiveCallGateOpenHandMargin = 140;
    policy.defense.defensiveCallGateDirectTenpaiMinHandValue = 32;
    policy.defense.defensiveCallGateDirectTenpaiMinWaitQuality = 8;
    policy.defense.defensiveCallGateHighValue = 62;
    policy.defense.defensiveCallGateComebackMinHandValue = 42;
    policy.defense.defensiveCallGateStrongHardEvDelta = 180;
    policy.defense.defensiveCallGateStrongLiveUkeireDelta = 14;
    policy.defense.defensiveCallGateStrongLiveTingpaiDelta = 3;
    policy.defense.defensiveCallGatePressureThreatScore = 8;
    policy.kan = policy.kan && typeof policy.kan === 'object' ? policy.kan : {};
    policy.kan.hardAddedThreshold = 95;
    policy.kan.hardOpenThreshold = 140;
    policy.kan.hardPressureThresholdBonus = 65;
    policy.kan.hardProtectThresholdBonus = 55;
    policy.kan.weights = {
      ...((policy.kan && policy.kan.weights) || {}),
      riichiPressure: 48,
      multiThreat: 38,
      dealerThreat: 34,
      protectLead: 58,
      protectSecond: 36,
      addedKanRisk: 34,
      openDoraRisk: 42
    };
    policy.defense.protectLeadScore = 5000;
    policy.defense.comebackTrailingScore = 7000;
    policy.defense.stateRiskBias = {
      'protect-lead': 22,
      'protect-second': 14,
      'neutral-defense': 2,
      comeback: -16,
      'safe-tenpai': -24
    };
    policy.defense.stateAttackBias = {
      'protect-lead': -6,
      'protect-second': -3,
      'neutral-defense': 0,
      comeback: 16,
      'safe-tenpai': 18
    };
    policy.defense.stateFoldNetPushBias = {
      'protect-lead': 18,
      'protect-second': 10,
      'neutral-defense': 2,
      comeback: -20,
      'safe-tenpai': -24
    };
    policy.riichi = policy.riichi && typeof policy.riichi === 'object' ? policy.riichi : {};
    policy.riichi.minLiveTingpaiCount = 2;
    policy.riichi.minWaitQualityScore = 5;
    policy.riichi.badWaitMinHandValue = 28;
    policy.riichi.badWaitMinRemainingTiles = 14;
    policy.riichi.thinRiichiAllowedWaitTypes = ['tanki', 'kanchan', 'penchan'];
    policy.riichi.thinRiichiMinRemainingTiles = 20;
    policy.riichi.thinRiichiMinLiveTingpai = 2;
    policy.riichi.thinRiichiMinHandValue = 18;
    policy.riichi.pressureMinHandValue = 52;
    policy.riichi.maxPressureDiscardDanger = 2;
    policy.devVariant = {
      parent: 'hard-tuned-v2',
      note: 'Primary specialized closed-hand defense profile. Legacy alias: hard-defensive-dev.'
    };
    return policy;
  }

  function createStandardDevHardPolicy() {
    const policy = createStandardHardPolicy();
    policy.id = 'hard-standard-dev';
    policy.personality = 'standard-dev';
    policy.devVariant = {
      parent: 'hard-standard',
      note: 'Development shell for hard-standard. Legacy alias: hard-balanced-dev.'
    };
    return policy;
  }

  function createHardVariantPresets() {
    if (hardVariantPresetCache) return hardVariantPresetCache;
    const presets = {
      'hard-pure-v1': {
        id: 'hard-pure-v1',
        label: '历史-Pure v1',
        difficulty: 'hard',
        group: 'history',
        description: 'First-generation hard-pure heuristic model. Legacy aliases: hard-aggressive, hard-pure.',
        createPolicy: createPureHardPolicy
      },
      'hard-pure-v1-dev': {
        id: 'hard-pure-v1-dev',
        label: '历史-Pure v1 dev',
        difficulty: 'hard',
        group: 'history',
        description: 'Legacy development shell for hard-pure-v1. Alias: hard-aggressive-dev.',
        createPolicy: createPureDevHardPolicy
      },
      'hard-tuned-v2': {
        id: 'hard-tuned-v2',
        label: '历史-Tuned v2',
        difficulty: 'hard',
        group: 'history',
        description: 'Second-generation hard-tuned baseline. Legacy aliases: hard-defensive, hard-tuned.',
        createPolicy: createTunedHardPolicy
      },
      'hard-standard': {
        id: 'hard-standard',
        label: '困难-标准',
        difficulty: 'hard',
        group: 'primary',
        description: 'Primary hard model. Successor to hard-balanced with promoted closed-route and riichi tuning.',
        createPolicy: createStandardHardPolicy
      },
      'hard-standard-dev': {
        id: 'hard-standard-dev',
        label: '困难-标准 dev',
        difficulty: 'hard',
        group: 'development',
        description: 'Development shell for hard-standard. Legacy alias: hard-balanced-dev.',
        createPolicy: createStandardDevHardPolicy
      },
      'hard-closed-defense': {
        id: 'hard-closed-defense',
        label: '困难-门清防守',
        difficulty: 'hard',
        group: 'primary',
        description: 'Primary specialized hard model focused on closed-hand defense, low calls, and low-pressure riichi counterattack. Legacy alias: hard-defensive-dev.',
        createPolicy: createClosedDefenseHardPolicy
      },
      'hard-value-classic': {
        id: 'hard-value-classic',
        label: '困难-打点经典',
        difficulty: 'hard',
        group: 'special',
        description: 'Special value-oriented classic hard model. Legacy alias: hard-heavy.',
        createPolicy: createValueClassicHardPolicy
      },
      'hard-experimental': {
        id: 'hard-experimental',
        label: '困难 AI（实验门禁）',
        difficulty: 'hard',
        group: 'development',
        description: 'Benchmark-only hard experiment variant. Defaults to hard-tuned with experimental overlays disabled.',
        createPolicy: createExperimentalHardPolicy
      }
    };
    Object.entries(HARD_VARIANT_ALIASES).forEach(([aliasId, canonicalId]) => {
      const canonical = presets[canonicalId];
      if (!canonical) return;
      presets[aliasId] = {
        ...canonical,
        id: aliasId,
        aliasOf: canonicalId,
        deprecated: true,
        label: `${canonical.label}（旧名）`,
        description: `Deprecated alias for ${canonicalId}. ${canonical.description}`
      };
    });
    hardVariantPresetCache = Object.freeze(presets);
    return hardVariantPresetCache;
  }

  function isHardVariantId(id) {
    const normalized = typeof id === 'string' ? id.trim().toLowerCase() : '';
    return Boolean(normalized && createHardVariantPresets()[normalized]);
  }

  function getHardVariantPreset(id) {
    const normalized = typeof id === 'string' ? id.trim().toLowerCase() : '';
    return normalized ? createHardVariantPresets()[normalized] || null : null;
  }

  function isHardFamilyPolicyId(id) {
    const normalized = normalizeHardPolicyId(id);
    if (!normalized) return false;
    if (HARD_BASE_POLICY_IDS.includes(normalized)) return true;
    return Boolean(getHardVariantPreset(normalized));
  }

  function isClosedRouteValuePolicyId(id) {
    return HARD_CLOSED_ROUTE_POLICY_IDS.includes(normalizeHardPolicyId(id));
  }

  function isBalancedRoutePolicyId(id) {
    return HARD_BALANCED_ROUTE_POLICY_IDS.includes(normalizeHardPolicyId(id));
  }

  function isClosedDefensePolicyId(id) {
    return normalizeHardPolicyId(id) === 'hard-closed-defense';
  }

  function createHardVariantPolicy(id, options = {}) {
    const canonicalId = normalizeHardVariantId(id);
    const preset = getHardVariantPreset(canonicalId);
    if (!preset || typeof preset.createPolicy !== 'function') return null;
    return preset.createPolicy({
      experimentalOverlays: canonicalId === 'hard-experimental'
        ? normalizeExperimentalOverlays(options.experimentalOverlays || [])
        : []
    });
  }

  return {
    EXPERIMENTAL_OVERLAYS,
    HARD_VARIANT_ALIASES,
    HARD_BASE_POLICY_IDS,
    HARD_CLOSED_ROUTE_POLICY_IDS,
    HARD_BALANCED_ROUTE_POLICY_IDS,
    clone,
    normalizeHardVariantId,
    normalizeHardPolicyId,
    normalizeExperimentalOverlays,
    applyExperimentalOverlay,
    createPureHardPolicy,
    createTunedHardPolicy,
    createExperimentalHardPolicy,
    createStandardHardPolicy,
    createClosedDefenseHardPolicy,
    createValueClassicHardPolicy,
    createStandardDevHardPolicy,
    createPureDevHardPolicy,
    createAggressiveHardPolicy: createPureHardPolicy,
    createDefensiveHardPolicy: createTunedHardPolicy,
    createBalancedHardPolicy: createStandardHardPolicy,
    createHeavyHardPolicy: createValueClassicHardPolicy,
    createAggressiveDevHardPolicy: createPureDevHardPolicy,
    createDefensiveDevHardPolicy: createClosedDefenseHardPolicy,
    createBalancedDevHardPolicy: createStandardDevHardPolicy,
    createHardVariantPresets,
    isHardVariantId,
    isHardFamilyPolicyId,
    isClosedRouteValuePolicyId,
    isBalancedRoutePolicyId,
    isClosedDefensePolicyId,
    getHardVariantPreset,
    createHardVariantPolicy
  };
});
