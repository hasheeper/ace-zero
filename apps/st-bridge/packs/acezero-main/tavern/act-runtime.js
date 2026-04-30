/**
 * ACEZERO TAVERN ACT RUNTIME
 *
 * Owns ACT module bridging, ACT state normalization, narrative prompts,
 * snapshots, phase advancement, tension, and the independent world clock.
 */
(function () {
  'use strict';

  const root = typeof window !== 'undefined' ? window : globalThis;

  root.ACE0TavernActRuntime = {
    create(options = {}) {
      const constants = options.constants || {};
      const deps = options.deps || {};
      const {
        ACT_RESOURCE_KEYS = ['combat', 'rest', 'asset', 'vision'],
        ACT_STAGE_VALUES = ['planning', 'executing', 'route', 'complete'],
        ACT_PHASE_LABELS = ['一段', '二段', '三段', '四段'],
        WORLD_CLOCK_SLOTS = ['MORNING', 'NOON', 'AFTERNOON', 'NIGHT'],
        DEFAULT_WORLD_CLOCK = { day: 1, phase: 'MORNING' },
        DEFAULT_WORLD_CLOCK_PRESSURE = 0,
        DEFAULT_WORLD_ACT = {},
        DEBT_INTEREST_RATE_PER_PHASE = 0.005,
        MAJOR_DEBT_INTEREST_RATE_PER_PHASE = 0.01,
        LOCATION_LAYER_META = {},
        HERO_INTERNAL_KEY = 'KAZU',
        ACT_STATE_INJECT_ID = 'ace0_act_state',
        ACT_CHARTER_INJECT_ID = 'ace0_act_charter',
        ACT_NARRATIVE_INJECT_ID = 'ace0_act_narrative',
        ACT_TRANSITION_INJECT_ID = 'ace0_act_transition',
        ACT_PACING_INJECT_ID = 'ace0_narrative_pacing',
        ACT_FIRST_MEET_INJECT_ID = 'ace0_first_meet'
      } = constants;
      const {
        getAce0HostRoot = () => root,
        normalizeTrimmedString = (value, fallback = '') => (typeof value === 'string' ? value.trim() : fallback),
        normalizeActResourceKey = (value, fallback = 'vision') => {
          const normalized = typeof value === 'string' ? value.trim().toLowerCase() : fallback;
          return ACT_RESOURCE_KEYS.includes(normalized) ? normalized : fallback;
        },
        normalizeFundsAmount = (value) => {
          const numeric = Number(value);
          return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
        },
        getEraVars = async () => ({}),
        updateEraVars = async () => {},
        getWorldState = () => ({}),
        getHeroState = () => ({}),
        getHeroCast = () => ({}),
        getCastNode = () => ({}),
        getRosterNode = () => ({}),
        getWorldLocation = () => ({ layer: 'THE_STREET', site: '' })
      } = deps;

      let hasWarnedMissingActModule = false;
      let lastHandledMk = null;
      let latchedTransitionRequestTarget = '';

  function normalizeWorldClock(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const day = Math.max(1, Math.round(Number(src.day) || DEFAULT_WORLD_CLOCK.day));
    const rawPhase = typeof src.phase === 'string' ? src.phase.trim().toUpperCase() : '';
    const phase = WORLD_CLOCK_SLOTS.includes(rawPhase) ? rawPhase : DEFAULT_WORLD_CLOCK.phase;
    return { day, phase };
  }

  function getWorldClock(eraVars) {
    const world = getWorldState(eraVars);
    return normalizeWorldClock(world && world.current_time);
  }

  function advanceWorldClockState(clock, steps) {
    const normalized = normalizeWorldClock(clock);
    const n = Math.max(0, Math.round(Number(steps) || 0));
    if (n === 0) return normalized;
    const totalSlots = WORLD_CLOCK_SLOTS.length;
    const curIdx = WORLD_CLOCK_SLOTS.indexOf(normalized.phase);
    const absolute = (normalized.day - 1) * totalSlots + (curIdx < 0 ? 0 : curIdx) + n;
    return {
      day: Math.floor(absolute / totalSlots) + 1,
      phase: WORLD_CLOCK_SLOTS[absolute % totalSlots]
    };
  }

  function getWorldClockAbsoluteIndex(clock) {
    const normalized = normalizeWorldClock(clock);
    const totalSlots = WORLD_CLOCK_SLOTS.length;
    const phaseIndex = WORLD_CLOCK_SLOTS.indexOf(normalized.phase);
    return ((normalized.day - 1) * totalSlots) + (phaseIndex < 0 ? 0 : phaseIndex);
  }

  function getForwardWorldClockPhaseSteps(fromClock, toClock) {
    const diff = getWorldClockAbsoluteIndex(toClock) - getWorldClockAbsoluteIndex(fromClock);
    return diff > 0 ? diff : 0;
  }

  function applyDebtInterest(principalAmount, phaseSteps, ratePerPhase) {
    const principal = normalizeFundsAmount(principalAmount);
    const steps = Math.max(0, Math.round(Number(phaseSteps) || 0));
    const rate = Math.max(0, Number(ratePerPhase) || 0);
    if (principal <= 0 || steps <= 0 || rate <= 0) return principal;
    const next = principal * Math.pow(1 + rate, steps);
    return normalizeFundsAmount(next);
  }

  function normalizeActStage(value) {
    const normalized = normalizeTrimmedString(value, '').toLowerCase();
    return ACT_STAGE_VALUES.includes(normalized) ? normalized : DEFAULT_WORLD_ACT.stage;
  }

  function getActModuleApi() {
    const candidates = [];
    const pushCandidate = (candidate) => {
      if (!candidate || typeof candidate !== 'object') return;
      if (candidates.includes(candidate)) return;
      candidates.push(candidate);
    };

    try {
      if (window && typeof window === 'object') pushCandidate(window);
    } catch (_) {}
    try {
      const hostRoot = getAce0HostRoot();
      if (hostRoot && typeof hostRoot === 'object') pushCandidate(hostRoot);
    } catch (_) {}
    try {
      if (typeof globalThis === 'object' && globalThis) pushCandidate(globalThis);
    } catch (_) {}

    for (const candidate of candidates) {
      try {
        const modules = candidate.ACE0Modules;
        const actModule = modules && typeof modules === 'object' ? modules.act : null;
        if (!actModule || typeof actModule !== 'object') continue;
        if (actModule.__ACE0_HOST_BRIDGE__ === true && actModule.__ACE0_TARGET__ && typeof actModule.__ACE0_TARGET__ === 'object') {
          return actModule.__ACE0_TARGET__;
        }
        return actModule;
      } catch (_) {}
    }

    return null;
  }

  function installActModuleHostBridge() {
    const hostRoot = getAce0HostRoot();
    if (!hostRoot || typeof hostRoot !== 'object') return null;

    if (!hostRoot.ACE0Modules || typeof hostRoot.ACE0Modules !== 'object') {
      hostRoot.ACE0Modules = {};
    }

    const localModules = window.ACE0Modules;
    const localActModule = localModules && typeof localModules === 'object' && localModules.act && typeof localModules.act === 'object'
      ? localModules.act
      : null;
    const existingHostActModule = hostRoot.ACE0Modules.act && typeof hostRoot.ACE0Modules.act === 'object'
      ? hostRoot.ACE0Modules.act
      : null;
    const targetActModule = localActModule && localActModule.__ACE0_HOST_BRIDGE__ !== true
      ? localActModule
      : (existingHostActModule && existingHostActModule.__ACE0_HOST_BRIDGE__ !== true ? existingHostActModule : null);

    if (!targetActModule) return null;

    const proxiedMethodNames = [
      'getDefaultActState',
      'normalizeActState',
      'createFrontendSnapshot',
      'getChapter',
      'listChapters',
      'normalizeActEffectList',
      'getNormalizedActNodeEffects',
      'getNormalizedActPhaseEffects',
      'getNodeRuntime',
      'getJumpRouteOptions',
      'createEmptyCounts',
      'createRewardsForNode',
      'applyReserveGrowthToAct',
      'clearLimitedActTokens',
      'resetActPhaseSlots',
      'applyNodeRewardsToAct',
      'advanceActToNextNode',
      'resolveActNodeTransition',
      'consumeSingleActPhase',
      'commitPackUsageForPhase',
      'deriveWorldTimeFromAct',
      'resolvePendingAdvanceState',
      'deriveCharacterStatesFromActState',
      'createCharacterCastPatch',
      'buildActStateSummaryFromDerived',
      'buildCharterPromptContent',
      'buildNarrativePromptContentFromDerived',
      'buildNarrativePacingSummary',
      'getNodeFirstMeetMap',
      'buildFirstMeetPromptContent'
    ];

    const bridge = {
      __ACE0_HOST_BRIDGE__: true,
      __ACE0_TARGET__: targetActModule
    };

    proxiedMethodNames.forEach((methodName) => {
      bridge[methodName] = (...args) => {
        if (typeof targetActModule[methodName] !== 'function') {
          if (methodName === 'listChapters') return [];
          return null;
        }
        try {
          return targetActModule[methodName](...args);
        } catch (error) {
          console.warn(`[ACE0 ACT] Host bridge ${methodName} failed:`, error);
          if (methodName === 'listChapters') return [];
          return null;
        }
      };
    });

    hostRoot.ACE0Modules.act = bridge;
    return bridge;
  }

  function getActDefaultStateFromModule(actId) {
    const actModule = getActModuleApi();
    if (!actModule || typeof actModule.getDefaultActState !== 'function') return null;
    try {
      const defaultState = actModule.getDefaultActState(actId);
      return defaultState && typeof defaultState === 'object'
        ? JSON.parse(JSON.stringify(defaultState))
        : null;
    } catch (error) {
      console.warn('[ACE0 ACT] Failed to read default act state from module:', error);
      return null;
    }
  }

  function getActChapterConfigFromModule(actId) {
    const actModule = getActModuleApi();
    if (!actModule || typeof actModule.getChapter !== 'function') return null;
    try {
      const chapter = actModule.getChapter(actId);
      return chapter && typeof chapter === 'object'
        ? JSON.parse(JSON.stringify(chapter))
        : null;
    } catch (error) {
      console.warn('[ACE0 ACT] Failed to read chapter config from module:', error);
      return null;
    }
  }

  function runActModuleMethod(methodName, ...args) {
    const actModule = getActModuleApi();
    if (!actModule || typeof actModule[methodName] !== 'function') return { ok: false, value: null };
    try {
      return {
        ok: true,
        value: actModule[methodName](...args)
      };
    } catch (error) {
      console.warn(`[ACE0 ACT] Failed to call module method ${methodName}:`, error);
      return { ok: false, value: null };
    }
  }

  function normalizeActResourceCounts(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const counts = ACT_RESOURCE_KEYS.reduce((acc, key) => {
      acc[key] = 0;
      return acc;
    }, {});
    Object.entries(source).forEach(([rawKey, rawValue]) => {
      const key = normalizeActResourceKey(rawKey, '');
      if (!key) return;
      const value = Number(rawValue);
      counts[key] += Number.isFinite(value) ? Math.max(0, value) : 0;
    });
    return counts;
  }

  function normalizeActIncomeRateCounts(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const counts = { ...DEFAULT_WORLD_ACT.income_rate };
    Object.entries(source).forEach(([rawKey, rawValue]) => {
      const key = normalizeActResourceKey(rawKey, '');
      if (!key) return;
      const value = Number(rawValue);
      counts[key] = Number.isFinite(value) ? Math.max(0, value) : 0;
    });
    for (const key of ACT_RESOURCE_KEYS) {
      counts[key] = Math.max(0, Math.min(1.5, Number(counts[key]) || 0));
    }
    return counts;
  }

  function normalizeActVisionState(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    return {
      baseSight: Math.max(0, Math.round(Number(source.baseSight) || 1)),
      bonusSight: Math.max(0, Math.round(Number(source.bonusSight) || 0)),
      jumpReady: source.jumpReady === true,
      pendingReplace: source.pendingReplace && typeof source.pendingReplace === 'object' && !Array.isArray(source.pendingReplace)
        ? JSON.parse(JSON.stringify(source.pendingReplace))
        : null
    };
  }

  function getWorldActState(eraVars) {
    const world = getWorldState(eraVars);
    const moduleDefaultAct = getActDefaultStateFromModule(world?.act?.id || DEFAULT_WORLD_ACT.id);
    const fallbackDefaultAct = moduleDefaultAct || DEFAULT_WORLD_ACT;
    const rawAct = world.act && typeof world.act === 'object' ? world.act : fallbackDefaultAct;
    const routeHistory = Array.isArray(rawAct.route_history)
      ? rawAct.route_history.map(value => normalizeTrimmedString(value, '')).filter(Boolean)
      : [];

    return {
      id: normalizeTrimmedString(rawAct.id, fallbackDefaultAct.id) || fallbackDefaultAct.id,
      seed: normalizeTrimmedString(rawAct.seed, fallbackDefaultAct.seed) || fallbackDefaultAct.seed,
      nodeIndex: Math.max(1, Math.round(Number(rawAct.nodeIndex) || fallbackDefaultAct.nodeIndex)),
      route_history: routeHistory.length ? routeHistory : [...fallbackDefaultAct.route_history],
      limited: normalizeActResourceCounts(rawAct.limited),
      reserve: normalizeActResourceCounts(rawAct.reserve),
      reserve_progress: normalizeActResourceCounts(rawAct.reserve_progress),
      income_rate: normalizeActIncomeRateCounts(rawAct.income_rate || fallbackDefaultAct.income_rate),
      income_progress: normalizeActResourceCounts(rawAct.income_progress),
      phase_slots: Array.from({ length: 4 }, (_, index) => {
        const slot = Array.isArray(rawAct.phase_slots) ? rawAct.phase_slots[index] : null;
        if (!slot || typeof slot !== 'object') return null;
        const key = normalizeActResourceKey(slot.key, '');
        const amount = Math.max(1, Math.min(3, Math.round(Number(slot.amount) || 1)));
        const rawSources = Array.isArray(slot.sources) && slot.sources.length
          ? slot.sources
          : Array.from({ length: amount }, () => slot.source);
        const sources = rawSources
          .slice(0, amount)
          .map(source => normalizeTrimmedString(source, 'limited').toLowerCase() === 'reserve' ? 'reserve' : 'limited');
        while (sources.length < amount) {
          sources.push(normalizeTrimmedString(slot.source, 'limited').toLowerCase() === 'reserve' ? 'reserve' : 'limited');
        }
        if (!ACT_RESOURCE_KEYS.includes(key)) return null;
        const normalizedSlot = {
          key,
          source: normalizeTrimmedString(slot.source, 'limited').toLowerCase() === 'reserve'
            ? 'reserve'
            : 'limited',
          amount,
          sources
        };
        const tint = normalizeActResourceKey(slot.tint || slot.controlType || slot.targetKey, '');
        if (key === 'rest' && tint) {
          normalizedSlot.tint = tint;
          const tintSource = normalizeTrimmedString(slot.tintSource, '').toLowerCase();
          if (tintSource === 'reserve' || tintSource === 'limited') normalizedSlot.tintSource = tintSource;
        }
        return normalizedSlot;
      }),
      phase_index: Math.max(0, Math.min(4, Math.round(Number(rawAct.phase_index) || 0))),
      stage: normalizeActStage(rawAct.stage),
      phase_advance: Math.max(0, Math.round(Number(rawAct.phase_advance) || 0)),
      pickedPacks: (rawAct.pickedPacks && typeof rawAct.pickedPacks === 'object' && !Array.isArray(rawAct.pickedPacks))
        ? JSON.parse(JSON.stringify(rawAct.pickedPacks))
        : {},
      controlledNodes: (rawAct.controlledNodes && typeof rawAct.controlledNodes === 'object' && !Array.isArray(rawAct.controlledNodes))
        ? JSON.parse(JSON.stringify(rawAct.controlledNodes))
        : {},
      crisis: Math.max(0, Math.min(100, Math.round(Number(rawAct.crisis) || 0))),
      crisisSignals: Array.isArray(rawAct.crisisSignals)
        ? rawAct.crisisSignals
            .filter(item => item && typeof item === 'object' && !Array.isArray(item))
            .map(item => JSON.parse(JSON.stringify(item)))
        : [],
      vision: normalizeActVisionState(rawAct.vision),
      resourceSpent: normalizeActResourceCounts(rawAct.resourceSpent),
      characterEncounter: (rawAct.characterEncounter && typeof rawAct.characterEncounter === 'object' && !Array.isArray(rawAct.characterEncounter))
        ? JSON.parse(JSON.stringify(rawAct.characterEncounter))
        : {},
      pendingResolutions: Array.isArray(rawAct.pendingResolutions)
        ? rawAct.pendingResolutions
            .filter(item => item && typeof item === 'object' && !Array.isArray(item))
            .map(item => JSON.parse(JSON.stringify(item)))
        : [],
      resolutionHistory: Array.isArray(rawAct.resolutionHistory)
        ? rawAct.resolutionHistory
            .filter(item => item && typeof item === 'object' && !Array.isArray(item))
            .map(item => JSON.parse(JSON.stringify(item)))
        : [],
      narrativeTension: Math.max(0, Math.min(100, Math.round(Number(rawAct.narrativeTension) || 0))),
      pendingFirstMeet: (() => {
        const raw = rawAct.pendingFirstMeet;
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
        const out = {};
        for (const [k, v] of Object.entries(raw)) {
          if (typeof v === 'string' && v.trim()) out[k] = v;
        }
        return out;
      })(),
      pendingTransitionTarget: typeof rawAct.pendingTransitionTarget === 'string'
        ? rawAct.pendingTransitionTarget.trim()
        : '',
      transitionRequestTarget: typeof rawAct.transitionRequestTarget === 'string'
        ? rawAct.transitionRequestTarget.trim()
        : '',
      pendingTransitionPrompt: typeof rawAct.pendingTransitionPrompt === 'string'
        ? rawAct.pendingTransitionPrompt.trim()
        : ''
    };
  }

  function getActRuntimeConfig(actId) {
    const key = normalizeTrimmedString(actId, DEFAULT_WORLD_ACT.id);
    const moduleConfig = getActChapterConfigFromModule(key);
    if (moduleConfig) return moduleConfig;
    if (!hasWarnedMissingActModule) {
      hasWarnedMissingActModule = true;
      console.warn('[ACE0 ACT] No chapter config available from act/plugin.js. ACT runtime module is required but was not loaded.');
    }
    return null;
  }

  function maybeResolveActCompletionTransition(actState, heroState, worldState) {
    const transitionResult = runActModuleMethod('evaluateCompletionTransition', actState, heroState, worldState);
    const requestTarget = (typeof actState?.transitionRequestTarget === 'string'
      ? actState.transitionRequestTarget.trim()
      : '') || latchedTransitionRequestTarget;
    if (!transitionResult.ok || !transitionResult.value?.eligible) {
      const nextActState = {
        ...actState,
        pendingTransitionTarget: '',
        transitionRequestTarget: requestTarget,
        pendingTransitionPrompt: ''
      };
      const changed = nextActState.pendingTransitionTarget !== actState.pendingTransitionTarget
        || nextActState.transitionRequestTarget !== actState.transitionRequestTarget
        || nextActState.pendingTransitionPrompt !== actState.pendingTransitionPrompt;
      return { transitioned: false, changed, actState: nextActState };
    }

    const transition = transitionResult.value;
    const targetChapterId = typeof transition.targetChapterId === 'string' ? transition.targetChapterId.trim() : '';
    const requestPromptResult = runActModuleMethod('buildCompletionTransitionPromptContent', transition, { mode: 'request' });
    const pendingTransitionPrompt = requestPromptResult.ok && typeof requestPromptResult.value === 'string'
      ? requestPromptResult.value
      : '';

    if (requestTarget && requestTarget === targetChapterId) {
      const targetActState = transition.targetActState && typeof transition.targetActState === 'object'
        ? JSON.parse(JSON.stringify(transition.targetActState))
        : getActDefaultStateFromModule(transition.targetChapterId);
      if (!targetActState || typeof targetActState !== 'object') {
        return { transitioned: false, changed: false, actState };
      }

      const enteredPromptResult = runActModuleMethod('buildCompletionTransitionPromptContent', transition, { mode: 'entered' });
      const enteredPrompt = enteredPromptResult.ok && typeof enteredPromptResult.value === 'string'
        ? enteredPromptResult.value
        : '';
      latchedTransitionRequestTarget = '';

      return {
        transitioned: true,
        changed: true,
        actState: {
          ...targetActState,
          pendingFirstMeet: {},
          pendingTransitionTarget: '',
          transitionRequestTarget: '',
          pendingTransitionPrompt: enteredPrompt
        },
        transition
      };
    }

    const nextActState = {
      ...actState,
      pendingTransitionTarget: targetChapterId,
      transitionRequestTarget: requestTarget && requestTarget === targetChapterId ? requestTarget : '',
      pendingTransitionPrompt
    };
    const changed = nextActState.pendingTransitionTarget !== actState.pendingTransitionTarget
      || nextActState.transitionRequestTarget !== actState.transitionRequestTarget
      || nextActState.pendingTransitionPrompt !== actState.pendingTransitionPrompt;
    return { transitioned: false, changed, actState: nextActState, transition };
  }

  function getActNodeRuntime(config, nodeId) {
    const moduleResult = runActModuleMethod('getNodeRuntime', config, nodeId);
    if (moduleResult.ok) return moduleResult.value;
    return config?.nodes?.[nodeId] || null;
  }

  function createEmptyActCounts(defaultValue = 0) {
    const moduleResult = runActModuleMethod('createEmptyCounts', defaultValue);
    if (moduleResult.ok && moduleResult.value) return moduleResult.value;
    return ACT_RESOURCE_KEYS.reduce((acc, key) => {
      acc[key] = defaultValue;
      return acc;
    }, {});
  }

  function createActRewardsForNode(nodeRuntime) {
    const moduleResult = runActModuleMethod('createRewardsForNode', nodeRuntime);
    if (moduleResult.ok && moduleResult.value) return moduleResult.value;
    const rewards = createEmptyActCounts(0);
    if (!nodeRuntime) return rewards;

    if (nodeRuntime.rewards && typeof nodeRuntime.rewards === 'object') {
      Object.entries(nodeRuntime.rewards).forEach(([rawKey, rawValue]) => {
        const key = normalizeActResourceKey(rawKey, '');
        if (!key) return;
        rewards[key] += Math.max(0, Math.round(Number(rawValue) || 0));
      });
      return rewards;
    }

    const key = normalizeActResourceKey(nodeRuntime.key, '');
    if (ACT_RESOURCE_KEYS.includes(key)) {
      rewards[key] = 1;
    }
    return rewards;
  }

  function normalizeActEffectList(list) {
    const moduleResult = runActModuleMethod('normalizeActEffectList', list);
    if (moduleResult.ok && Array.isArray(moduleResult.value)) return moduleResult.value;
    return [];
  }

  function getNormalizedActNodeEffects(config, nodeId) {
    const moduleResult = runActModuleMethod('getNormalizedActNodeEffects', config, nodeId);
    if (moduleResult.ok && moduleResult.value) return moduleResult.value;
    return {
      activate: [],
      introduce: [],
      present: [],
      join_party: []
    };
  }

  // phaseEffects[nodeId][phaseIndex] 覆盖 nodeEffects[nodeId]，只在被显式定义时生效。
  function getNormalizedActPhaseEffects(config, nodeId, phaseIndex) {
    const moduleResult = runActModuleMethod('getNormalizedActPhaseEffects', config, nodeId, phaseIndex);
    if (moduleResult.ok) return moduleResult.value;
    return null;
  }

  function deriveActCharacterStates(eraVars) {
    const act = getWorldActState(eraVars);
    const config = getActRuntimeConfig(act.id);
    if (!config) return null;
    const moduleResult = runActModuleMethod('deriveCharacterStatesFromActState', act, config);
    if (moduleResult.ok && moduleResult.value) return moduleResult.value;
    return null;
  }

  function getAllActManagedCharacterKeys() {
    const chapterIdsResult = runActModuleMethod('listChapters');
    const chapterIds = chapterIdsResult.ok && Array.isArray(chapterIdsResult.value)
      ? chapterIdsResult.value
      : [];
    const keySet = new Set();

    chapterIds.forEach((chapterId) => {
      const chapterResult = runActModuleMethod('getChapter', chapterId);
      const managedCharacters = chapterResult.ok
        ? chapterResult.value?.runtime?.managedCharacters
        : null;
      if (!Array.isArray(managedCharacters)) return;
      managedCharacters.forEach((charKey) => {
        const normalized = typeof charKey === 'string' ? charKey.trim().toUpperCase() : '';
        if (normalized) keySet.add(normalized);
      });
    });

    return keySet;
  }

  async function synchronizeActCharacterState(eraVars) {
    const derived = deriveActCharacterStates(eraVars);
    if (!derived) return { eraVars, derived: null, changed: false };

    const hero = eraVars?.hero || {};
    const currentCast = getHeroCast(hero);
    const modulePatchResult = runActModuleMethod('createCharacterCastPatch', currentCast, derived);
    const castPatch = modulePatchResult.ok && modulePatchResult.value?.castPatch
      ? modulePatchResult.value.castPatch
      : {};
    const firstMeetHints = modulePatchResult.ok && modulePatchResult.value?.firstMeetHints
      && typeof modulePatchResult.value.firstMeetHints === 'object'
      ? modulePatchResult.value.firstMeetHints
      : {};
    let changed = modulePatchResult.ok
      ? modulePatchResult.value?.changed === true
      : false;

    if (!modulePatchResult.ok) {
      for (const charKey of derived.managedCharacters) {
        const currentNode = getCastNode(hero, charKey);
        const desiredNode = derived.states[charKey];
        const nextNode = {
          activated: desiredNode.activated === true,
          introduced: desiredNode.introduced === true,
          present: desiredNode.present === true,
          inParty: desiredNode.inParty === true,
          miniKnown: desiredNode.miniKnown === true
        };

        if (
          currentNode.activated !== nextNode.activated ||
          currentNode.introduced !== nextNode.introduced ||
          currentNode.present !== nextNode.present ||
          currentNode.inParty !== nextNode.inParty ||
          currentNode.miniKnown !== nextNode.miniKnown
        ) {
          castPatch[charKey] = nextNode;
          changed = true;
        }
      }
    }

    const activeManagedSet = new Set(
      Array.isArray(derived.managedCharacters)
        ? derived.managedCharacters.map((charKey) => String(charKey || '').trim().toUpperCase()).filter(Boolean)
        : []
    );
    getAllActManagedCharacterKeys().forEach((charKey) => {
      if (activeManagedSet.has(charKey)) return;
      const currentNode = getCastNode(hero, charKey);
      if (
        currentNode.activated === true ||
        currentNode.introduced === true ||
        currentNode.present === true ||
        currentNode.inParty === true ||
        currentNode.miniKnown === true
      ) {
        castPatch[charKey] = {
          activated: false,
          introduced: false,
          present: false,
          inParty: false,
          miniKnown: false
        };
        changed = true;
      }
    });

    // 首见帧持久化到 MVU: world.act.pendingFirstMeet。
    // - 纯跃迁驱动：只在本轮 cast 的 introduced=false→true 时写入
    // - 跨楼层稳定：玩家在同一楼层内编辑 / swipe / 重生成都保留
    //   （楼层前进的清理由 prompt 流水里的 chat.length 闸门负责）
    // - 段位推进清空（见 resolvePendingActAdvance）
    // 注意：不做"设计了就补写"的补偿逻辑——那会让 pending 段位内常驻去不掉。
    const currentActState = getWorldActState(eraVars);
    const currentPending = currentActState?.pendingFirstMeet && typeof currentActState.pendingFirstMeet === 'object'
      ? currentActState.pendingFirstMeet
      : {};
    const pendingPatch = {};

    for (const [k, v] of Object.entries(firstMeetHints)) {
      if (typeof v !== 'string' || !v.trim()) continue;
      if (!currentPending[k]) pendingPatch[k] = v;
    }

    const pendingChanged = Object.keys(pendingPatch).length > 0;
    const nextPending = pendingChanged
      ? { ...currentPending, ...pendingPatch }
      : currentPending;

    if (changed || pendingChanged) {
      const actUpdate = pendingChanged
        ? { pendingFirstMeet: nextPending }
        : undefined;

      await updateEraVars({
        ...(changed ? { hero: { cast: castPatch } } : {}),
        ...(actUpdate ? { world: { act: actUpdate } } : {})
      });

      const nextEraVars = {
        ...(eraVars || {}),
        hero: {
          ...(eraVars?.hero || {}),
          cast: {
            ...(eraVars?.hero?.cast || {}),
            ...(changed ? castPatch : {})
          }
        },
        world: {
          ...(eraVars?.world || {}),
          act: {
            ...(eraVars?.world?.act || {}),
            ...(pendingChanged ? { pendingFirstMeet: nextPending } : {})
          }
        }
      };
      return { eraVars: nextEraVars, derived, changed: changed || pendingChanged, firstMeetHints };
    }

    return { eraVars, derived, changed: false, firstMeetHints };
  }

  function buildActStateSummary(eraVars, derivedActState = null) {
    const derived = derivedActState || deriveActCharacterStates(eraVars);
    if (!derived) return '';
    const moduleResult = runActModuleMethod('buildActStateSummaryFromDerived', derived);
    if (moduleResult.ok && typeof moduleResult.value === 'string') return moduleResult.value;
    return '';
  }

  function buildActNarrativePrompts(eraVars, derivedActState = null, firstMeetHints = null) {
    const derived = derivedActState || deriveActCharacterStates(eraVars);
    if (!derived) return [];
    const { act, config, currentNodeId } = derived;
    const narrative = config && config.narrative;
    if (!narrative) return [];

    const prompts = [];
    const liveAct = getWorldActState(eraVars);
    let transitionPromptContent = typeof liveAct?.pendingTransitionPrompt === 'string'
      ? liveAct.pendingTransitionPrompt.trim()
      : '';
    if (!transitionPromptContent) {
      const transitionResult = runActModuleMethod('evaluateCompletionTransition', act, getHeroState(eraVars), getWorldState(eraVars));
      if (transitionResult.ok && transitionResult.value?.eligible) {
        const promptResult = runActModuleMethod('buildCompletionTransitionPromptContent', transitionResult.value, { mode: 'request' });
        transitionPromptContent = promptResult.ok && typeof promptResult.value === 'string'
          ? promptResult.value.trim()
          : '';
      }
    }
    if (transitionPromptContent) {
      prompts.push({
        id: ACT_TRANSITION_INJECT_ID,
        position: 'in_chat',
        depth: 1,
        role: 'system',
        content: transitionPromptContent,
        should_scan: false
      });
    }

    // 首见帧 hook（新 hook）：仅在 firstMeetHints 非空时注入。
    // firstMeetHints 由 synchronizeActCharacterState 基于 MVU 践迁推出，用完即消。
    const hints = firstMeetHints && typeof firstMeetHints === 'object' ? firstMeetHints : {};
    if (Object.keys(hints).length > 0) {
      const firstMeetModule = runActModuleMethod('buildFirstMeetPromptContent', hints);
      const firstMeetContent = firstMeetModule.ok && typeof firstMeetModule.value === 'string'
        ? firstMeetModule.value
        : '';
      if (firstMeetContent) {
        prompts.push({
          id: ACT_FIRST_MEET_INJECT_ID,
          position: 'in_chat',
          depth: 1,
          role: 'system',
          content: firstMeetContent,
          should_scan: false
        });
      }
    }

    const charterModule = runActModuleMethod('buildCharterPromptContent', narrative);
    const charterContent = charterModule.ok && typeof charterModule.value === 'string'
      ? charterModule.value
      : '';
    if (charterContent) {
      prompts.push({
        id: ACT_CHARTER_INJECT_ID,
        position: 'in_chat',
        depth: 2,
        role: 'system',
        content: charterContent,
        should_scan: false
      });
    }

    const narrativeModule = runActModuleMethod('buildNarrativePromptContentFromDerived', derived);
    const narrativeContent = narrativeModule.ok && typeof narrativeModule.value === 'string'
      ? narrativeModule.value
      : '';
    if (narrativeContent) {
      prompts.push({
        id: ACT_NARRATIVE_INJECT_ID,
        position: 'in_chat',
        depth: 1,
        role: 'system',
        content: narrativeContent,
        should_scan: false
      });
    }

    // 节奏提示直接读当前 live act，避免派生链遗漏 narrativeTension 时显示成 0。
    const tension = Math.max(0, Math.min(100, Math.round(Number(liveAct?.narrativeTension) || 0)));
    const worldClockSuggestion = buildWorldClockAdvanceSuggestion(getWorldClockPressure(eraVars));
    const pacingModule = runActModuleMethod('buildNarrativePacingSummary', tension, worldClockSuggestion);
    const pacingContent = pacingModule.ok && typeof pacingModule.value === 'string'
      ? pacingModule.value
      : '';
    if (pacingContent) {
      prompts.push({
        id: ACT_PACING_INJECT_ID,
        position: 'in_chat',
        depth: 1,
        role: 'system',
        content: pacingContent,
        should_scan: false
      });
    }

    return prompts;
  }

  function normalizeActSnapshotCounts(raw) {
    const normalized = normalizeActResourceCounts(raw);
    return ACT_RESOURCE_KEYS.reduce((acc, key) => {
      acc[key] = Math.round(Number(normalized[key]) || 0);
      return acc;
    }, {});
  }

  function getHeroResourceSnapshot(eraVars) {
    const hero = eraVars?.hero || {};
    const funds = normalizeFundsAmount(hero.funds);
    const assets = normalizeFundsAmount(hero.assets);
    const debt = normalizeFundsAmount(hero.debt);
    const majorDebt = normalizeFundsAmount(hero.majorDebt);
    // mana 按 roster 成员逐一快照——KAZU maxMana=0 无 mana 池，
    // 战斗 mana 分散在 RINO / SIA / POPPY 等 roster 节点，需要
    // 分角色追踪，避免用合计掩盖谁回 / 谁耗。
    const roster = (hero && typeof hero.roster === 'object') ? hero.roster : {};
    const manaByRoster = {};
    const maxManaByRoster = {};
    const levelByRoster = {};
    for (const key of Object.keys(roster)) {
      const node = roster[key];
      if (!node || typeof node !== 'object') continue;
      manaByRoster[key] = Math.max(0, Math.round(Number(node.mana) || 0));
      maxManaByRoster[key] = Math.max(0, Math.round(Number(node.maxMana) || 0));
      levelByRoster[key] = Math.max(0, Math.round(Number(node.level) || 0));
    }
    return {
      funds,
      assets,
      debt,
      majorDebt,
      manaByRoster,
      maxManaByRoster,
      levelByRoster
    };
  }

  function getHeroCastStateSnapshot(eraVars, managedCharacters, states) {
    const hero = eraVars?.hero || {};
    const cast = (hero && typeof hero.cast === 'object') ? hero.cast : {};
    const introduced = [];
    const inParty = [];

    for (const charKey of managedCharacters || []) {
      const castNode = cast[charKey];
      const derivedState = states?.[charKey] || {};
      if ((castNode?.introduced === true) || derivedState.introduced === true) introduced.push(charKey);
      if ((castNode?.inParty === true) || derivedState.inParty === true) inParty.push(charKey);
    }

    introduced.sort();
    inParty.sort();
    return { introduced, inParty };
  }

  function createActRuntimeSnapshot(eraVars, derivedActState = null) {
    const derived = derivedActState || deriveActCharacterStates(eraVars);
    if (!derived) return null;

    const { act, currentNodeId, managedCharacters, states } = derived;
    const heroResources = getHeroResourceSnapshot(eraVars);
    const heroCastState = getHeroCastStateSnapshot(eraVars, managedCharacters, states);
    const activated = managedCharacters.filter(charKey => states[charKey]?.activated === true).sort();
    const present = managedCharacters.filter(charKey => states[charKey]?.present === true).sort();
    const clock = getWorldClock(eraVars);
    const clockPressure = getWorldClockPressure(eraVars);
    const location = getWorldLocation(eraVars);

    return {
      id: act.id,
      seed: act.seed,
      nodeIndex: act.nodeIndex,
      phaseIndex: act.phase_index,
      stage: act.stage,
      currentNodeId,
      routeHistory: [...act.route_history],
      limited: normalizeActSnapshotCounts(act.limited),
      reserve: normalizeActSnapshotCounts(act.reserve),
      reserveProgress: normalizeActSnapshotCounts(act.reserve_progress),
      incomeRate: normalizeActResourceCounts(act.income_rate),
      incomeProgress: normalizeActResourceCounts(act.income_progress),
      phaseSlots: act.phase_slots.map(slot => slot ? {
        key: normalizeActResourceKey(slot.key, 'vision'),
        source: slot.source === 'reserve' ? 'reserve' : 'limited',
        amount: Math.max(1, Math.min(3, Math.round(Number(slot.amount) || 1))),
        sources: Array.isArray(slot.sources) ? slot.sources.map(source => source === 'reserve' ? 'reserve' : 'limited') : undefined,
        tint: slot.key === 'rest' ? normalizeActResourceKey(slot.tint || slot.controlType || slot.targetKey, '') || undefined : undefined,
        tintSource: slot.tintSource === 'reserve' || slot.tintSource === 'limited' ? slot.tintSource : undefined
      } : null),
      controlledNodes: act.controlledNodes && typeof act.controlledNodes === 'object' ? JSON.parse(JSON.stringify(act.controlledNodes)) : {},
      crisis: Math.max(0, Math.round(Number(act.crisis) || 0)),
      vision: normalizeActVisionState(act.vision),
      resourceSpent: normalizeActSnapshotCounts(act.resourceSpent),
      funds: heroResources.funds,
      assets: heroResources.assets,
      debt: heroResources.debt,
      majorDebt: heroResources.majorDebt,
      manaByRoster: heroResources.manaByRoster,
      maxManaByRoster: heroResources.maxManaByRoster,
      levelByRoster: heroResources.levelByRoster,
      activated,
      introduced: heroCastState.introduced,
      present,
      inParty: heroCastState.inParty,
      clockPressure,
      worldClockAdvanceSuggestion: buildWorldClockAdvanceSuggestion(clockPressure),
      worldLocation: {
        layer: location.layer,
        site: location.site,
        // layerIndex：底锈=0 → 下街=1 → 中市=2 → 上庭=3（视觉上"向上爬升"）
        layerIndex: Math.max(0, ['THE_RUST', 'THE_STREET', 'THE_EXCHANGE', 'THE_COURT'].indexOf(location.layer)),
        label: (LOCATION_LAYER_META[location.layer] || LOCATION_LAYER_META.THE_STREET).label,
        english: (LOCATION_LAYER_META[location.layer] || LOCATION_LAYER_META.THE_STREET).english
      },
      worldClock: {
        day: clock.day,
        phase: clock.phase,
        phaseIndex: Math.max(0, WORLD_CLOCK_SLOTS.indexOf(clock.phase))
      }
    };
  }

  function applyReserveGrowthToAct(actState, config, nodeIndex) {
    const moduleResult = runActModuleMethod('applyReserveGrowthToAct', actState, config, nodeIndex);
    if (moduleResult.ok) return;
  }

  function clearLimitedActTokens(actState) {
    const moduleResult = runActModuleMethod('clearLimitedActTokens', actState);
    if (moduleResult.ok) return;
  }

  function resetActPhaseSlots(actState, phaseIndex = 0) {
    const moduleResult = runActModuleMethod('resetActPhaseSlots', actState, phaseIndex);
    if (moduleResult.ok) return;
  }

  function applyNodeRewardsToAct(actState, config, nodeId) {
    const moduleResult = runActModuleMethod('applyNodeRewardsToAct', actState, config, nodeId);
    if (moduleResult.ok) return;
  }

  function advanceActToNextNode(actState, config) {
    const moduleResult = runActModuleMethod('advanceActToNextNode', actState, config);
    if (moduleResult.ok) return moduleResult.value;
    return false;
  }

  function resolveActNodeTransition(actState, config) {
    const moduleResult = runActModuleMethod('resolveActNodeTransition', actState, config);
    if (moduleResult.ok) return moduleResult.value;
  }

  function consumeSingleActPhase(actState, heroState, config) {
    const moduleResult = runActModuleMethod('consumeSingleActPhase', actState, heroState, config);
    if (moduleResult.ok) return moduleResult.value;
  }

  // ========== 阶段 4：情节张力 Delta 表 ==========
  const TENSION_DELTA = {
    MESSAGE_TURN: 2,      // 每条 AI 回复
    BATTLE_RESULT: 15,    // ACE0_BATTLE 结算
    PHASE_ADVANCE: 25,    // 段位推进作为压力累积
    ROUTE_CHOICE: 10      // 路线选择
  };
  const CLOCK_PRESSURE_DELTA = {
    PHASE_ADVANCE: 25,    // 平均一节点（四相）≈ 一个时段建议值
    NODE_ADVANCE: 10
  };
  const FLOOR_PROGRESS_DELTA = {
    NARRATIVE_TENSION: 10,
    CLOCK_PRESSURE: 5
  };
  const CLOCK_ADVANCE_SUGGESTION_TIERS = [
    { min: 0, max: 30, level: 'none', hint: '当前世界时段仍可继续承载剧情。' },
    { min: 30, max: 60, level: 'weak', hint: '当前世界时段开始接近中段，可轻度考虑推进。' },
    { min: 60, max: 85, level: 'medium', hint: '当前世界时段已消耗较多，建议准备推进到下一时段。' },
    { min: 85, max: 101, level: 'strong', hint: '当前世界时段基本吃满，强烈建议推进到下一时段。' }
  ];

  async function adjustNarrativeTensionInternal(delta) {
    const eraVars = (typeof getEraVars === 'function' ? await getEraVars() : null) || {};
    const act = getWorldActState(eraVars);
    const current = Math.max(0, Math.min(100, Math.round(Number(act.narrativeTension) || 0)));
    const next = Math.max(0, Math.min(100, current + Math.round(Number(delta) || 0)));
    if (next === current) return next;
    await updateEraVars({
      world: {
        act: {
          ...act,
          narrativeTension: next
        }
      }
    });
    return next;
  }

  async function setNarrativeTensionInternal(value) {
    const eraVars = (typeof getEraVars === 'function' ? await getEraVars() : null) || {};
    const act = getWorldActState(eraVars);
    const v = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
    await updateEraVars({
      world: {
        act: {
          ...act,
          narrativeTension: v
        }
      }
    });
    return v;
  }

  async function resetNarrativeTensionInternal() {
    return setNarrativeTensionInternal(0);
  }

  function getWorldClockPressure(eraVars) {
    const world = getWorldState(eraVars);
    return Math.max(0, Math.min(100, Math.round(Number(world?.clockPressure) || DEFAULT_WORLD_CLOCK_PRESSURE)));
  }

  function pickWorldClockAdvanceTier(pressure) {
    const value = Math.max(0, Math.min(100, Math.round(Number(pressure) || 0)));
    for (const tier of CLOCK_ADVANCE_SUGGESTION_TIERS) {
      if (value >= tier.min && value < tier.max) return tier;
    }
    return CLOCK_ADVANCE_SUGGESTION_TIERS[CLOCK_ADVANCE_SUGGESTION_TIERS.length - 1];
  }

  function buildWorldClockAdvanceSuggestion(pressure) {
    const value = Math.max(0, Math.min(100, Math.round(Number(pressure) || 0)));
    const tier = pickWorldClockAdvanceTier(value);
    return {
      pressure: value,
      level: tier.level,
      hint: tier.hint,
      shouldAdvance: tier.level === 'strong'
    };
  }

  async function adjustClockPressureInternal(delta) {
    const eraVars = (typeof getEraVars === 'function' ? await getEraVars() : null) || {};
    const current = getWorldClockPressure(eraVars);
    const next = Math.max(0, Math.min(100, current + Math.round(Number(delta) || 0)));
    if (next === current) return next;
    await updateEraVars({ world: { clockPressure: next } });
    return next;
  }

  async function setClockPressureInternal(value) {
    const next = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
    await updateEraVars({ world: { clockPressure: next } });
    return next;
  }

  async function resetClockPressureInternal() {
    return setClockPressureInternal(0);
  }

  // 在段位推进前：将当前 nodeId×phaseIndex 的随机池抽签结果落到 actState.pickedPacks。
  function commitCurrentPhasePackUsage(actState, config) {
    const actModule = getActModuleApi();
    if (!actModule || typeof actModule.commitPackUsageForPhase !== 'function') return;
    if (actState.stage !== 'executing') return;
    const nodeId = Array.isArray(actState.route_history)
      ? actState.route_history[Math.max(0, (actState.nodeIndex || 1) - 1)]
      : null;
    if (!nodeId) return;
    const phaseIdx = Math.max(0, Math.min(3, Math.round(Number(actState.phase_index) || 0)));
    const narrative = (config && config.narrative) || null;
    try {
      actModule.commitPackUsageForPhase(actState, config, narrative, nodeId, phaseIdx);
    } catch (_) {}
  }

  function deriveWorldTimeFromAct(actState) {
    // 阶段2：ACT 不再为世界时间提供任何值。全部返回 null 表示"不覆盖"。
    const moduleResult = runActModuleMethod('deriveWorldTimeFromAct', actState);
    if (moduleResult.ok && moduleResult.value) return moduleResult.value;
    return { day: null, phase: null };
  }

  async function resolvePendingActAdvance(eraVars) {
    const world = getWorldState(eraVars);
    const hero = eraVars?.hero && typeof eraVars.hero === 'object'
      ? JSON.parse(JSON.stringify(eraVars.hero))
      : {};
    const act = getWorldActState(eraVars);
    const config = getActRuntimeConfig(act.id);
    if (!config) {
      return { eraVars, changed: false };
    }

    const requestedSteps = Math.max(0, Math.min(4, Math.round(Number(act.phase_advance) || 0)));
    let actState = JSON.parse(JSON.stringify(act));
    let nextHero = hero;
    let moduleAdvance = { ok: false };

    if (requestedSteps > 0) {
      moduleAdvance = runActModuleMethod('resolvePendingAdvanceState', act, hero, config);
      actState = moduleAdvance.ok && moduleAdvance.value?.actState
        ? moduleAdvance.value.actState
        : JSON.parse(JSON.stringify(act));
      nextHero = moduleAdvance.ok && moduleAdvance.value?.heroState
        ? moduleAdvance.value.heroState
        : hero;
    }

    if (act.transitionRequestTarget) {
      actState.transitionRequestTarget = act.transitionRequestTarget;
    }

    if (requestedSteps > 0 && !moduleAdvance.ok) {
      const stepCount = Math.max(0, Math.min(4, Math.round(Number(actState.phase_advance) || 0)));
      actState.phase_advance = 0;

      for (let index = 0; index < stepCount; index += 1) {
        // 先落存本段的抽签结果再推进（commit 是幂等的，已存不会重写）
        commitCurrentPhasePackUsage(actState, config);
        consumeSingleActPhase(actState, nextHero, config);
        // 段位推进一格，上一段的首见帧进入历史 → 清空缓冲，避免注入到下一段的 prompt。
        actState.pendingFirstMeet = {};
        if (actState.stage === 'complete') break;
        if (actState.stage === 'route' && actState.route_history.length < actState.nodeIndex + 1) break;
      }
    }

    // 阶段推进后的两套积分独立累计：
    // - narrativeTension 服务相位内收束，并在每次 phase_advance 结算后清零
    // - clockPressure 服务世界时钟推进建议
    let tensionDelta = 0;
    let clockPressureDelta = 0;
    if (requestedSteps > 0) {
      const advancedPhases = actState.nodeIndex > act.nodeIndex
        ? Math.max(0, (4 - act.phase_index) + actState.phase_index)
        : Math.max(0, actState.phase_index - act.phase_index);
      tensionDelta += advancedPhases * TENSION_DELTA.PHASE_ADVANCE;
      clockPressureDelta += advancedPhases * CLOCK_PRESSURE_DELTA.PHASE_ADVANCE;
    }
    if (act.stage !== 'route' && actState.stage === 'route') {
      tensionDelta += TENSION_DELTA.ROUTE_CHOICE;
    }
    if (actState.nodeIndex > act.nodeIndex) {
      clockPressureDelta += CLOCK_PRESSURE_DELTA.NODE_ADVANCE;
    }
    if (requestedSteps > 0) {
      actState.narrativeTension = 0;
    } else if (tensionDelta !== 0) {
      const cur = Math.max(0, Math.min(100, Math.round(Number(actState.narrativeTension) || 0)));
      actState.narrativeTension = Math.max(0, Math.min(100, cur + tensionDelta));
    }
    const nextClockPressure = clockPressureDelta !== 0
      ? Math.max(0, Math.min(100, getWorldClockPressure(eraVars) + clockPressureDelta))
      : getWorldClockPressure(eraVars);

    // 首见帧兜底清空：无论 module 路径还是 fallback，只要推进后坐标（node:phase:stage）有变化，
    // 上一段的 pendingFirstMeet 都应进入历史、不带进下一段。
    const prevCoord = `${act?.nodeIndex}:${act?.phase_index}:${act?.stage}`;
    const nextCoord = `${actState?.nodeIndex}:${actState?.phase_index}:${actState?.stage}`;
    if (prevCoord !== nextCoord) {
      actState.pendingFirstMeet = {};
    }

    const completionTransition = maybeResolveActCompletionTransition(actState, nextHero, world);
    if (completionTransition.transitioned) {
      actState = completionTransition.actState;
    } else if (completionTransition.changed) {
      actState = completionTransition.actState;
    }

    const stateChanged = requestedSteps > 0
      || completionTransition.transitioned === true
      || completionTransition.changed === true;
    if (!stateChanged && nextClockPressure === getWorldClockPressure(eraVars)) {
      return { eraVars, changed: false };
    }

    // 阶段2：ACT 推进不再触及 world.current_time（世界时钟完全独立）。
    // 若需推进时钟，调用 ACE0Plugin.advanceWorldClock() 或直接写 world.current_time。
    await updateEraVars({
      hero: {
        funds: nextHero.funds,
        roster: nextHero.roster && typeof nextHero.roster === 'object'
          ? nextHero.roster
          : {
              [HERO_INTERNAL_KEY]: getRosterNode(nextHero, HERO_INTERNAL_KEY)
            }
      },
      world: {
        clockPressure: nextClockPressure,
        act: actState
      }
    });

    return {
      eraVars: {
        ...(eraVars || {}),
        hero: nextHero,
        world: {
          ...(world || {}),
          clockPressure: nextClockPressure,
          act: actState
        }
      },
      changed: true
    };
  }

  async function applyFloorProgressDelta(messageId, message) {
    const mk = String(messageId ?? '');
    if (!mk) return;
    if (lastHandledMk === mk) return;
    const msg = message && typeof message === 'object' ? message : {};
    if (msg.role !== 'assistant') return;
    lastHandledMk = mk;
    try {
      await adjustNarrativeTensionInternal(FLOOR_PROGRESS_DELTA.NARRATIVE_TENSION);
    } catch (_) {}
    try {
      await adjustClockPressureInternal(FLOOR_PROGRESS_DELTA.CLOCK_PRESSURE);
    } catch (_) {}
  }

  async function advanceWorldClock(steps) {
    const eraVars = (typeof getEraVars === 'function' ? await getEraVars() : null) || {};
    const current = getWorldClock(eraVars);
    const next = advanceWorldClockState(current, steps == null ? 1 : steps);
    const changed = next.day !== current.day || next.phase !== current.phase;
    const hero = getHeroState(eraVars);
    const phaseSteps = changed ? getForwardWorldClockPhaseSteps(current, next) : 0;
    const nextDebt = changed
      ? applyDebtInterest(hero?.debt, phaseSteps, DEBT_INTEREST_RATE_PER_PHASE)
      : normalizeFundsAmount(hero?.debt);
    const nextMajorDebt = changed
      ? applyDebtInterest(hero?.majorDebt, phaseSteps, MAJOR_DEBT_INTEREST_RATE_PER_PHASE)
      : normalizeFundsAmount(hero?.majorDebt);
    await updateEraVars({
      ...(changed ? {
        hero: {
          debt: nextDebt,
          majorDebt: nextMajorDebt
        }
      } : {}),
      world: {
        current_time: next,
        ...(changed ? { clockPressure: 0 } : {})
      }
    });
    return next;
  }

  async function setWorldClock(input) {
    const eraVars = (typeof getEraVars === 'function' ? await getEraVars() : null) || {};
    const current = getWorldClock(eraVars);
    const next = normalizeWorldClock(input);
    const changed = next.day !== current.day || next.phase !== current.phase;
    const hero = getHeroState(eraVars);
    const phaseSteps = changed ? getForwardWorldClockPhaseSteps(current, next) : 0;
    const nextDebt = phaseSteps > 0
      ? applyDebtInterest(hero?.debt, phaseSteps, DEBT_INTEREST_RATE_PER_PHASE)
      : normalizeFundsAmount(hero?.debt);
    const nextMajorDebt = phaseSteps > 0
      ? applyDebtInterest(hero?.majorDebt, phaseSteps, MAJOR_DEBT_INTEREST_RATE_PER_PHASE)
      : normalizeFundsAmount(hero?.majorDebt);
    await updateEraVars({
      ...(phaseSteps > 0 ? {
        hero: {
          debt: nextDebt,
          majorDebt: nextMajorDebt
        }
      } : {}),
      world: {
        current_time: next,
        ...(changed ? { clockPressure: 0 } : {})
      }
    });
    return next;
  }

      function setLatchedTransitionRequestTarget(value) {
        latchedTransitionRequestTarget = typeof value === 'string' ? value.trim() : '';
        return latchedTransitionRequestTarget;
      }

      function resetState() {
        hasWarnedMissingActModule = false;
        lastHandledMk = null;
        latchedTransitionRequestTarget = '';
      }

      return {
        TENSION_DELTA: Object.assign({}, TENSION_DELTA),
        CLOCK_PRESSURE_DELTA: Object.assign({}, CLOCK_PRESSURE_DELTA),
        FLOOR_PROGRESS_DELTA: Object.assign({}, FLOOR_PROGRESS_DELTA),
        CLOCK_ADVANCE_SUGGESTION_TIERS: JSON.parse(JSON.stringify(CLOCK_ADVANCE_SUGGESTION_TIERS)),
        resetState,
        setLatchedTransitionRequestTarget,
        normalizeWorldClock,
        getWorldClock,
        advanceWorldClockState,
        getWorldClockAbsoluteIndex,
        getForwardWorldClockPhaseSteps,
        applyDebtInterest,
        normalizeActStage,
        getActModuleApi,
        installActModuleHostBridge,
        getActDefaultStateFromModule,
        getActChapterConfigFromModule,
        runActModuleMethod,
        normalizeActResourceCounts,
        normalizeActIncomeRateCounts,
        normalizeActVisionState,
        getWorldActState,
        getActRuntimeConfig,
        maybeResolveActCompletionTransition,
        getActNodeRuntime,
        createEmptyActCounts,
        createActRewardsForNode,
        normalizeActEffectList,
        getNormalizedActNodeEffects,
        getNormalizedActPhaseEffects,
        deriveActCharacterStates,
        getAllActManagedCharacterKeys,
        synchronizeActCharacterState,
        buildActStateSummary,
        buildActNarrativePrompts,
        normalizeActSnapshotCounts,
        getHeroResourceSnapshot,
        getHeroCastStateSnapshot,
        createActRuntimeSnapshot,
        applyReserveGrowthToAct,
        clearLimitedActTokens,
        resetActPhaseSlots,
        applyNodeRewardsToAct,
        advanceActToNextNode,
        resolveActNodeTransition,
        consumeSingleActPhase,
        adjustNarrativeTensionInternal,
        setNarrativeTensionInternal,
        resetNarrativeTensionInternal,
        getWorldClockPressure,
        pickWorldClockAdvanceTier,
        buildWorldClockAdvanceSuggestion,
        adjustClockPressureInternal,
        setClockPressureInternal,
        resetClockPressureInternal,
        commitCurrentPhasePackUsage,
        deriveWorldTimeFromAct,
        resolvePendingActAdvance,
        applyFloorProgressDelta,
        advanceWorldClock,
        setWorldClock
      };
    }
  };
})();
