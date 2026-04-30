(function initAceZeroActPlugin(global) {
  'use strict';

  const MODULE_NAMESPACE = 'ACE0Modules';
  const MODULE_KEY = 'act';
  const DEFAULT_CHAPTER_ID = 'chapter0_exchange';
  const ACT_STAGE_VALUES = ['planning', 'executing', 'route', 'complete'];
  // 节点内四段（处理槽），与世界时间（晨昼暮夜）解耦
  const ACT_PHASE_LABELS = ['一段', '二段', '三段', '四段'];
  const ACT_RESOURCE_KEYS = ['combat', 'rest', 'asset', 'vision'];
  const ACT_RESOURCE_ALIASES = {
    contract: 'asset',
    event: 'vision'
  };
  const ACT_RESOURCE_TYPE_MAP = {
    combat: 'COMBAT',
    rest: 'REST',
    asset: 'ASSET',
    vision: 'VISION'
  };
  const ACT_RESOURCE_LABEL_MAP = {
    combat: '交锋',
    rest: '休整',
    asset: '资产',
    vision: '视野'
  };
  const SHARED_CAMPAIGN_SEED = 'ACEZERO-SHARD-SEED-V24';
  const NON_PLAYER_CHARACTER_KEYS = ['RINO', 'SIA', 'POPPY', 'VV', 'TRIXIE', 'COTA', 'EULALIA', 'KAKO', 'KUZUHA'];
  const ENCOUNTER_CHARACTER_KEYS = ['SIA', 'TRIXIE', 'POPPY', 'COTA', 'VV', 'KUZUHA', 'KAKO', 'EULALIA'];
  const ENCOUNTER_CHARACTER_STATUS_VALUES = ['locked', 'eligible', 'queued', 'pre_signal', 'first_meet', 'introduced'];
  const ENCOUNTER_QUEUE_STATUS_VALUES = ['queued', 'placed', 'triggered', 'expired', 'cancelled'];
  const ENCOUNTER_QUEUE_TYPE_VALUES = ['first_meet', 'pre_signal'];
  const ENCOUNTER_TERMINAL_QUEUE_STATUSES = ['triggered', 'expired', 'cancelled'];






  const ACT_PLUGIN_DATA = global.ACE0ActPluginData || {};
  const ACT_GENERATED_DATA = global.ACE0ActGeneratedData || {};
  const ENCOUNTER_RULES = ACT_PLUGIN_DATA.ENCOUNTER_RULES || {};
  const DEFAULT_WORLD_ACT = ACT_PLUGIN_DATA.DEFAULT_WORLD_ACT || { id: DEFAULT_CHAPTER_ID, seed: 'AUTO' };
  const PROLOGUE_EXCHANGE_CHAPTER = ACT_PLUGIN_DATA.PROLOGUE_EXCHANGE_CHAPTER || { id: DEFAULT_CHAPTER_ID, meta: { totalNodes: 1 }, runtime: {}, nodes: {} };

  function normalizeChapterConfig(chapterId, chapterConfig) {
    const runtimeConfig = chapterConfig.runtime && typeof chapterConfig.runtime === 'object'
      ? chapterConfig.runtime
      : {};
    const legacyInitialEffects = chapterConfig.initialEffects && typeof chapterConfig.initialEffects === 'object'
      ? chapterConfig.initialEffects
      : {};
    const runtimeInitialCast = runtimeConfig.initialCast && typeof runtimeConfig.initialCast === 'object'
      ? runtimeConfig.initialCast
      : {};
    const normalizedChapter = {
      id: chapterId,
      meta: deepClone(chapterConfig.meta || {}),
      totalNodes: Math.max(1, Math.round(Number(chapterConfig.totalNodes) || Number(chapterConfig.meta?.totalNodes) || 1)),
      runtime: {
        seed: normalizeTrimmedString(runtimeConfig.seed, DEFAULT_WORLD_ACT.seed),
        rules: normalizeRules(runtimeConfig.rules || chapterConfig.frontend?.campaign?.rules),
        initialState: normalizeChapterInitialState(chapterId, chapterConfig),
        completionTransition: normalizeCompletionTransition(runtimeConfig.completionTransition),
        generatedTail: normalizeGeneratedTailConfig(runtimeConfig.generatedTail, Math.max(1, Math.round(Number(chapterConfig.totalNodes) || Number(chapterConfig.meta?.totalNodes) || 1))),
        reserveGrowthByNode: Array.isArray(runtimeConfig.reserveGrowthByNode || chapterConfig.reserveGrowthByNode)
          ? (runtimeConfig.reserveGrowthByNode || chapterConfig.reserveGrowthByNode).map((value) => Math.max(0, Number(value) || 0))
          : [],
        managedCharacters: Array.isArray(runtimeConfig.managedCharacters || chapterConfig.managedCharacters)
          ? (runtimeConfig.managedCharacters || chapterConfig.managedCharacters).map((value) => normalizeTrimmedString(value, '')).filter(Boolean)
          : [],
        initialCast: {
          activate: normalizeActEffectList(runtimeInitialCast.activate || legacyInitialEffects.activate),
          introduce: normalizeActEffectList(runtimeInitialCast.introduce || legacyInitialEffects.introduce),
          present: normalizeActEffectList(runtimeInitialCast.present || legacyInitialEffects.present),
          miniKnown: normalizeActEffectList(runtimeInitialCast.miniKnown || runtimeInitialCast.mini_known),
          joinParty: normalizeActEffectList(
            runtimeInitialCast.joinParty
            || runtimeInitialCast.join_party
            || legacyInitialEffects.joinParty
            || legacyInitialEffects.join_party
          )
        }
      },
      nodes: deepClone(chapterConfig.nodes || {}),
      narrative: deepClone(chapterConfig.narrative || {}),
      frontend: deepClone(chapterConfig.frontend || {})
    };
    return applyGeneratedNodeTypesToChapter(buildGeneratedChapterTail(normalizedChapter));
  }

  const ACT_FRONTEND_SNAPSHOT = global.ACE0ActFrontendSnapshot && typeof global.ACE0ActFrontendSnapshot.create === 'function'
    ? global.ACE0ActFrontendSnapshot.create({
        constants: {
          DEFAULT_WORLD_ACT,
          ACT_PHASE_LABELS,
          ACT_RESOURCE_KEYS,
          ACT_RESOURCE_TYPE_MAP,
          ACT_RESOURCE_LABEL_MAP
        },
        deps: {
          deepClone,
          normalizeTrimmedString,
          normalizeActResourceKey,
          normalizeActState,
          normalizeRules,
          normalizeVisionState,
          getChapter,
          getChapterRuntime,
          getNodeRuntime,
          getNodeTypeKey,
          getJumpRouteOptions,
          createRewardsForNode,
          buildEncounterMarkersForSnapshot
        }
      })
    : null;

  function getNodeDisplayLabel(nodeId, nodeRuntime) { return ACT_FRONTEND_SNAPSHOT.getNodeDisplayLabel(nodeId, nodeRuntime); }
  function getNodeDisplaySubLabel(nodeRuntime) { return ACT_FRONTEND_SNAPSHOT.getNodeDisplaySubLabel(nodeRuntime); }
  function getNodeSortWeight(nodeRuntime, fallbackIndex = 0) { return ACT_FRONTEND_SNAPSHOT.getNodeSortWeight(nodeRuntime, fallbackIndex); }
  function getChapterNodesByIndex(config) { return ACT_FRONTEND_SNAPSHOT.getChapterNodesByIndex(config); }
  function getDefaultPresentNodeId(entries) { return ACT_FRONTEND_SNAPSHOT.getDefaultPresentNodeId(entries); }
  function buildLimitedRewardsForNode(nodeRuntime) { return ACT_FRONTEND_SNAPSHOT.buildLimitedRewardsForNode(nodeRuntime); }
  function buildCampaignNodeFromEntries(nodeIndex, entries) { return ACT_FRONTEND_SNAPSHOT.buildCampaignNodeFromEntries(nodeIndex, entries); }
  function buildCampaignNodesFromV2(config) { return ACT_FRONTEND_SNAPSHOT.buildCampaignNodesFromV2(config); }
  function buildTopologyFromV2Nodes(config) { return ACT_FRONTEND_SNAPSHOT.buildTopologyFromV2Nodes(config); }
  function buildFixedPhaseMarkersFromV2Nodes(config) { return ACT_FRONTEND_SNAPSHOT.buildFixedPhaseMarkersFromV2Nodes(config); }
  function applyVisionReplacementMarkers(markersInput, actStateInput) { return ACT_FRONTEND_SNAPSHOT.applyVisionReplacementMarkers(markersInput, actStateInput); }
  function createFrontendSnapshot(options) { return ACT_FRONTEND_SNAPSHOT.createFrontendSnapshot(options); }

  const ACT_GENERATED_RUNTIME = global.ACE0ActGeneratedRuntime && typeof global.ACE0ActGeneratedRuntime.create === 'function'
    ? global.ACE0ActGeneratedRuntime.create({
        data: ACT_GENERATED_DATA,
        deps: {
          deepClone,
          normalizeTrimmedString,
          normalizeActResourceKey,
          getNodeSortWeight,
          defaultWorldAct: DEFAULT_WORLD_ACT,
          actResourceKeys: ACT_RESOURCE_KEYS
        }
      })
    : null;

  const ACT_ENCOUNTER_RUNTIME = global.ACE0ActEncounterRuntime && typeof global.ACE0ActEncounterRuntime.create === 'function'
    ? global.ACE0ActEncounterRuntime.create({
        data: { ENCOUNTER_RULES },
        constants: {
          DEFAULT_WORLD_ACT,
          ACT_RESOURCE_KEYS,
          ENCOUNTER_CHARACTER_KEYS,
          ENCOUNTER_CHARACTER_STATUS_VALUES,
          ENCOUNTER_QUEUE_STATUS_VALUES,
          ENCOUNTER_QUEUE_TYPE_VALUES,
          ENCOUNTER_TERMINAL_QUEUE_STATUSES
        },
        deps: {
          deepClone,
          normalizeTrimmedString,
          normalizeActState,
          normalizePendingFirstMeet,
          normalizeCountMap,
          getChapter,
          getCurrentActNodeId,
          getNodeRuntime,
          buildTopologyFromV2Nodes,
          getNodeIdsAtIndex,
          pickFromCandidates,
          mulberry32,
          hashStringToSeed
        }
      })
    : null;

  function normalizeEncounterCharacterStatus(value) { return ACT_ENCOUNTER_RUNTIME.normalizeEncounterCharacterStatus(value); }
  function normalizeEncounterQueueStatus(value) { return ACT_ENCOUNTER_RUNTIME.normalizeEncounterQueueStatus(value); }
  function normalizeEncounterQueueType(value) { return ACT_ENCOUNTER_RUNTIME.normalizeEncounterQueueType(value); }
  function createDefaultEncounterCharacterState(charKey) { return ACT_ENCOUNTER_RUNTIME.createDefaultEncounterCharacterState(charKey); }
  function normalizeEncounterReasonCodes(value) { return ACT_ENCOUNTER_RUNTIME.normalizeEncounterReasonCodes(value); }
  function normalizeEncounterCharacterState(rawValue, charKey) { return ACT_ENCOUNTER_RUNTIME.normalizeEncounterCharacterState(rawValue, charKey); }
  function normalizeEncounterQueueItem(rawItem, fallbackIndex = 0) { return ACT_ENCOUNTER_RUNTIME.normalizeEncounterQueueItem(rawItem, fallbackIndex); }
  function normalizeCharacterEncounterState(value) { return ACT_ENCOUNTER_RUNTIME.normalizeCharacterEncounterState(value); }
  function getActiveEncounterCharacterKeys(characterEncounterInput) { return ACT_ENCOUNTER_RUNTIME.getActiveEncounterCharacterKeys(characterEncounterInput); }
  function getCharacterEncounterFirstMeetMap(actStateInput, currentNodeId) { return ACT_ENCOUNTER_RUNTIME.getCharacterEncounterFirstMeetMap(actStateInput, currentNodeId); }
  function calculateEncounterSpentScore(actStateInput, weightsInput) { return ACT_ENCOUNTER_RUNTIME.calculateEncounterSpentScore(actStateInput, weightsInput); }
  function getEncounterRuntimeDay(contextInput) { return ACT_ENCOUNTER_RUNTIME.getEncounterRuntimeDay(contextInput); }
  function getEncounterRuntimeGeo(contextInput) { return ACT_ENCOUNTER_RUNTIME.getEncounterRuntimeGeo(contextInput); }
  function collectEncounterRuntimeTags(contextInput, configInput, currentNodeId) { return ACT_ENCOUNTER_RUNTIME.collectEncounterRuntimeTags(contextInput, configInput, currentNodeId); }
  function isEncounterCharacterIntroduced(actStateInput, heroStateInput, charKeyInput) { return ACT_ENCOUNTER_RUNTIME.isEncounterCharacterIntroduced(actStateInput, heroStateInput, charKeyInput); }
  function hasActiveEncounterForCharacter(encounterInput, charKeyInput) { return ACT_ENCOUNTER_RUNTIME.hasActiveEncounterForCharacter(encounterInput, charKeyInput); }
  function evaluateCharacterEncounterEligibility(actStateInput, heroStateInput = {}, contextInput = {}) { return ACT_ENCOUNTER_RUNTIME.evaluateCharacterEncounterEligibility(actStateInput, heroStateInput, contextInput); }
  function buildEncounterRequestId(actStateInput, charKey, type, fallbackIndex = 0) { return ACT_ENCOUNTER_RUNTIME.buildEncounterRequestId(actStateInput, charKey, type, fallbackIndex); }
  function findEncounterPlacementCandidates(actStateInput, configInput, options = {}) { return ACT_ENCOUNTER_RUNTIME.findEncounterPlacementCandidates(actStateInput, configInput, options); }
  function pickEncounterTargetPhaseIndex(actStateInput, requestInput, targetInput, options = {}) { return ACT_ENCOUNTER_RUNTIME.pickEncounterTargetPhaseIndex(actStateInput, requestInput, targetInput, options); }
  function placeNextCharacterEncounter(actStateInput, configInput, options = {}) { return ACT_ENCOUNTER_RUNTIME.placeNextCharacterEncounter(actStateInput, configInput, options); }
  function enqueueEligibleCharacterEncounters(actStateInput, heroStateInput = {}, options = {}) { return ACT_ENCOUNTER_RUNTIME.enqueueEligibleCharacterEncounters(actStateInput, heroStateInput, options); }
  function consumeCharacterEncounterForNode(actStateInput, nodeIdInput, options = {}) { return ACT_ENCOUNTER_RUNTIME.consumeCharacterEncounterForNode(actStateInput, nodeIdInput, options); }
  function updateCharacterEncountersForNodeEntry(actStateInput, heroStateInput = {}, configInput = null, contextInput = {}) { return ACT_ENCOUNTER_RUNTIME.updateCharacterEncountersForNodeEntry(actStateInput, heroStateInput, configInput, contextInput); }
  function debugForceCharacterEncounter(actStateInput, charKeyInput, configInput = null, options = {}) { return ACT_ENCOUNTER_RUNTIME.debugForceCharacterEncounter(actStateInput, charKeyInput, configInput, options); }
  function buildEncounterMarkersForSnapshot(actStateInput) { return ACT_ENCOUNTER_RUNTIME.buildEncounterMarkersForSnapshot(actStateInput); }

  const ACT_CHAPTERS = {
    chapter0_exchange: normalizeChapterConfig('chapter0_exchange', PROLOGUE_EXCHANGE_CHAPTER)
  };

  function ensureModuleNamespace() {
    if (!global[MODULE_NAMESPACE] || typeof global[MODULE_NAMESPACE] !== 'object') {
      global[MODULE_NAMESPACE] = {};
    }
    return global[MODULE_NAMESPACE];
  }

  function getModuleBridgeTargets() {
    const targets = [];
    const pushTarget = (candidate) => {
      if (!candidate || typeof candidate !== 'object') return;
      if (targets.includes(candidate)) return;
      targets.push(candidate);
    };

    pushTarget(global);

    try { pushTarget(globalThis); } catch (_) {}
    try {
      if (typeof window === 'object' && window) {
        pushTarget(window);
        if (window.parent && window.parent !== window) pushTarget(window.parent);
        if (window.top && window.top !== window) pushTarget(window.top);
      }
    } catch (_) {}

    return targets;
  }

  function installModuleBridge(moduleApi) {
    getModuleBridgeTargets().forEach((target) => {
      try {
        if (!target[MODULE_NAMESPACE] || typeof target[MODULE_NAMESPACE] !== 'object') {
          target[MODULE_NAMESPACE] = {};
        }
        target[MODULE_NAMESPACE][MODULE_KEY] = moduleApi;
      } catch (_) {}
    });
  }

  function deepClone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function isPlainObject(value) {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
  }

  function mergePlainObjects(base, patch, blockedKeys = []) {
    if (!isPlainObject(patch)) return deepClone(base || {});
    const blocked = new Set(blockedKeys);
    const output = isPlainObject(base) ? deepClone(base) : {};
    Object.entries(patch).forEach(([key, value]) => {
      if (blocked.has(key)) return;
      if (isPlainObject(value) && isPlainObject(output[key])) {
        output[key] = mergePlainObjects(output[key], value, blockedKeys);
        return;
      }
      output[key] = deepClone(value);
    });
    return output;
  }

  function normalizeTrimmedString(value, fallback) {
    const normalized = typeof value === 'string' ? value.trim() : '';
    return normalized || fallback;
  }

  function normalizeActResourceKey(value, fallback = 'vision') {
    const normalized = normalizeTrimmedString(value, fallback).toLowerCase();
    const migrated = ACT_RESOURCE_ALIASES[normalized] || normalized;
    return ACT_RESOURCE_KEYS.includes(migrated) ? migrated : fallback;
  }

  function normalizeRules(value) {
    const source = value && typeof value === 'object' ? value : {};
    return {
      requireScheduleAllLimited: source.requireScheduleAllLimited !== false,
      reserveGrowthTiming: normalizeTrimmedString(source.reserveGrowthTiming, 'end_of_node')
    };
  }

  function normalizeGeneratedTailConfig(value, fallbackTotalNodes) {
    if (ACT_GENERATED_RUNTIME && typeof ACT_GENERATED_RUNTIME.normalizeGeneratedTailConfig === 'function') {
      return ACT_GENERATED_RUNTIME.normalizeGeneratedTailConfig(value, fallbackTotalNodes);
    }
    return { enabled: false, mode: 'motif', startNodeIndex: 1, totalNodes: Math.max(1, Math.round(Number(fallbackTotalNodes) || 1)), segmentSizes: [], motifPoolBySize: {}, shapeProfiles: [] };
  }

  function applyGeneratedNodeTypesToChapter(chapterConfig) {
    if (ACT_GENERATED_RUNTIME && typeof ACT_GENERATED_RUNTIME.applyGeneratedNodeTypesToChapter === 'function') {
      return ACT_GENERATED_RUNTIME.applyGeneratedNodeTypesToChapter(chapterConfig);
    }
    return chapterConfig;
  }

  function buildGeneratedChapterTail(chapterConfig) {
    if (ACT_GENERATED_RUNTIME && typeof ACT_GENERATED_RUNTIME.buildGeneratedChapterTail === 'function') {
      return ACT_GENERATED_RUNTIME.buildGeneratedChapterTail(chapterConfig);
    }
    return chapterConfig;
  }

  function normalizeCountMap(value, allowDecimal) {
    const source = value && typeof value === 'object' ? value : {};
    const counts = Object.fromEntries(ACT_RESOURCE_KEYS.map((key) => [key, 0]));
    Object.entries(source).forEach(([rawKey, rawValue]) => {
      const key = normalizeActResourceKey(rawKey, '');
      if (!key) return;
      const raw = Number(rawValue) || 0;
      counts[key] += allowDecimal ? Math.max(0, raw) : Math.max(0, Math.round(raw));
    });
    return counts;
  }

  function normalizeActStage(value) {
    const normalized = normalizeTrimmedString(value, DEFAULT_WORLD_ACT.stage).toLowerCase();
    return ACT_STAGE_VALUES.includes(normalized) ? normalized : DEFAULT_WORLD_ACT.stage;
  }

  function normalizePendingFirstMeet(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const out = {};
    Object.entries(source).forEach(([rawKey, rawHint]) => {
      const charKey = normalizeTrimmedString(rawKey, '').toUpperCase();
      const hint = normalizeTrimmedString(rawHint, '');
      if (!charKey || !hint) return;
      out[charKey] = hint;
    });
    return out;
  }

  function getVisionReplacementForPhase(actStateInput, nodeId, phaseIndex) {
    const vision = normalizeVisionState(actStateInput?.vision);
    const pending = vision.pendingReplace;
    if (!pending || pending.status !== 'ready') return null;
    const targetNodeId = normalizeTrimmedString(pending.nodeId || pending.targetNodeId, '');
    const targetPhaseIndex = Math.max(0, Math.min(3, Math.round(Number(pending.phaseIndex) || 0)));
    const replacementKey = normalizeActResourceKey(pending.replacementKey || pending.key, '');
    if (!targetNodeId || targetNodeId !== nodeId) return null;
    if (targetPhaseIndex !== phaseIndex) return null;
    if (!ACT_RESOURCE_KEYS.includes(replacementKey)) return null;
    return {
      key: replacementKey,
      nodeId: targetNodeId,
      nodeIndex: Math.max(1, Math.round(Number(pending.nodeIndex) || Number(actStateInput?.nodeIndex) || 1)),
      phaseIndex: targetPhaseIndex,
      charges: Math.max(1, Math.round(Number(pending.charges) || 1))
    };
  }

  function getVisionReplaceChargeCount(actStateInput) {
    const pending = normalizeVisionState(actStateInput?.vision).pendingReplace;
    if (!pending || typeof pending !== 'object') return 0;
    if (!['charged', 'choosing', 'ready'].includes(pending.status)) return 0;
    return Math.max(1, Math.round(Number(pending.charges) || 1));
  }

  function consumeVisionReplacementCharge(actStateInput, consumedReplacement) {
    if (!actStateInput || typeof actStateInput !== 'object') return;
    actStateInput.vision = normalizeVisionState(actStateInput.vision);
    const remaining = Math.max(0, getVisionReplaceChargeCount(actStateInput) - 1);
    if (remaining > 0) {
      actStateInput.vision.pendingReplace = {
        status: 'charged',
        charges: remaining,
        source: 'vision2'
      };
      return;
    }
    actStateInput.vision.pendingReplace = null;
    void consumedReplacement;
  }

  function normalizePhaseSlots(value) {
    const slots = Array.isArray(value) ? value.slice(0, 4) : [];
    while (slots.length < 4) slots.push(null);

    return slots.map((slot) => {
      if (!slot || typeof slot !== 'object') return null;
      const key = normalizeActResourceKey(slot.key, '');
      if (!ACT_RESOURCE_KEYS.includes(key)) return null;
      const amount = Math.max(1, Math.min(3, Math.round(Number(slot.amount) || 1)));
      const rawSources = Array.isArray(slot.sources) && slot.sources.length
        ? slot.sources
        : Array.from({ length: amount }, () => slot.source);
      const sources = rawSources
        .slice(0, amount)
        .map((source) => source === 'reserve' ? 'reserve' : 'limited');
      while (sources.length < amount) sources.push(slot.source === 'reserve' ? 'reserve' : 'limited');
      const normalized = {
        key,
        source: slot.source === 'reserve' ? 'reserve' : 'limited',
        amount,
        sources
      };
      const tint = normalizeActResourceKey(slot.tint || slot.controlType || slot.targetKey, '');
      if (key === 'rest' && tint) {
        normalized.tint = tint;
        if (slot.tintSource === 'reserve' || slot.tintSource === 'limited') {
          normalized.tintSource = slot.tintSource;
        }
      }
      return normalized;
    });
  }

  function getChapterEntryNodeId(config) {
    const firstIndexedNode = getChapterNodesByIndex(config)?.[0]?.[1]?.[0]?.[0];
    if (typeof firstIndexedNode === 'string' && firstIndexedNode.trim()) return firstIndexedNode.trim();
    return normalizeTrimmedString(Object.keys(config?.nodes || {})[0], '');
  }

  function normalizeChapterInitialState(chapterId, chapterConfig) {
    const runtimeConfig = chapterConfig?.runtime && typeof chapterConfig.runtime === 'object'
      ? chapterConfig.runtime
      : {};
    const raw = runtimeConfig.initialState && typeof runtimeConfig.initialState === 'object'
      ? runtimeConfig.initialState
      : {};
    const entryNodeId = normalizeTrimmedString(
      raw.entryNodeId || raw.startNodeId || getChapterEntryNodeId(chapterConfig),
      ''
    );
    const rawRouteHistory = Array.isArray(raw.route_history || raw.routeHistory)
      ? (raw.route_history || raw.routeHistory)
      : [];
    const normalizedRouteHistory = rawRouteHistory
      .map((value) => normalizeTrimmedString(value, ''))
      .filter(Boolean);

    return {
      ...deepClone(DEFAULT_WORLD_ACT),
      id: chapterId,
      seed: normalizeTrimmedString(raw.seed, normalizeTrimmedString(runtimeConfig.seed, DEFAULT_WORLD_ACT.seed)),
      nodeIndex: Math.max(1, Math.round(Number(raw.nodeIndex) || 1)),
      route_history: normalizedRouteHistory.length ? normalizedRouteHistory : (entryNodeId ? [entryNodeId] : []),
      limited: normalizeCountMap(raw.limited, false),
      reserve: normalizeCountMap(raw.reserve, false),
      reserve_progress: normalizeCountMap(raw.reserve_progress, true),
      income_rate: normalizeIncomeRateMap(raw.income_rate),
      income_progress: normalizeCountMap(raw.income_progress, true),
      phase_slots: normalizePhaseSlots(raw.phase_slots || raw.phaseSlots),
      phase_index: Math.max(0, Math.min(4, Math.round(Number(raw.phase_index) || 0))),
      phase_advance: Math.max(0, Math.min(4, Math.round(Number(raw.phase_advance) || 0))),
      stage: normalizeActStage(raw.stage),
      controlledNodes: (raw.controlledNodes && typeof raw.controlledNodes === 'object' && !Array.isArray(raw.controlledNodes))
        ? deepClone(raw.controlledNodes)
        : {},
      crisis: Math.max(0, Math.min(100, Math.round(Number(raw.crisis) || 0))),
      crisisSignals: normalizeCrisisSignals(raw.crisisSignals),
      vision: normalizeVisionState(raw.vision),
      resourceSpent: normalizeCountMap(raw.resourceSpent, false),
      characterEncounter: normalizeCharacterEncounterState(raw.characterEncounter),
      pendingFirstMeet: normalizePendingFirstMeet(raw.pendingFirstMeet),
      pendingResolutions: normalizePendingResolutions(raw.pendingResolutions),
      resolutionHistory: normalizeResolutionHistory(raw.resolutionHistory),
      narrativeTension: Math.max(0, Math.min(100, Math.round(Number(raw.narrativeTension) || 0))),
      pickedPacks: (raw.pickedPacks && typeof raw.pickedPacks === 'object' && !Array.isArray(raw.pickedPacks))
        ? deepClone(raw.pickedPacks)
        : {}
    };
  }

  function normalizeCompletionTransition(value) {
    if (!value || typeof value !== 'object') return null;
    const targetChapterId = normalizeTrimmedString(value.targetChapterId, '');
    if (!targetChapterId) return null;

    return {
      targetChapterId,
      conditions: {
        minFunds: Math.max(0, Number(value?.conditions?.minFunds) || 0)
      },
      prompt: {
        title: normalizeTrimmedString(value?.prompt?.title, ''),
        body: normalizeTrimmedString(value?.prompt?.body, '')
      }
    };
  }

  function registerChapter(chapterId, chapterConfig) {
    const key = normalizeTrimmedString(chapterId, '');
    if (!key) throw new Error('registerChapter requires a chapter id.');
    if (!chapterConfig || typeof chapterConfig !== 'object') {
      throw new Error(`registerChapter(${key}) requires an object config.`);
    }

    ACT_CHAPTERS[key] = normalizeChapterConfig(key, chapterConfig);

    return getChapter(key);
  }

  function listChapters() {
    return Object.keys(ACT_CHAPTERS).sort();
  }

  function getChapter(chapterId) {
    const key = normalizeTrimmedString(chapterId, DEFAULT_CHAPTER_ID);
    const chapter = ACT_CHAPTERS[key] || ACT_CHAPTERS[DEFAULT_CHAPTER_ID] || null;
    return chapter ? deepClone(chapter) : null;
  }

  function getDefaultActState(chapterId) {
    const chapter = getChapter(chapterId);
    const initialState = chapter?.runtime?.initialState && typeof chapter.runtime.initialState === 'object'
      ? chapter.runtime.initialState
      : null;
    const id = chapter?.id || DEFAULT_WORLD_ACT.id;
    return {
      ...deepClone(DEFAULT_WORLD_ACT),
      ...(initialState ? deepClone(initialState) : {}),
      id
    };
  }

  function normalizeActState(rawActState) {
    const source = rawActState && typeof rawActState === 'object' ? rawActState : {};
    const base = getDefaultActState(source.id);
    const normalizedRouteHistory = Array.isArray(source.route_history)
      ? source.route_history.map((value) => normalizeTrimmedString(value, '')).filter(Boolean)
      : [];

    return {
      id: normalizeTrimmedString(source.id, base.id),
      seed: normalizeTrimmedString(source.seed, base.seed),
      nodeIndex: Math.max(1, Math.round(Number(source.nodeIndex) || base.nodeIndex)),
      route_history: normalizedRouteHistory.length ? normalizedRouteHistory : deepClone(base.route_history),
      limited: normalizeCountMap(source.limited, false),
      reserve: normalizeCountMap(source.reserve, false),
      reserve_progress: normalizeCountMap(source.reserve_progress, true),
      income_rate: normalizeIncomeRateMap(source.income_rate || base.income_rate),
      income_progress: normalizeCountMap(source.income_progress, true),
      phase_slots: normalizePhaseSlots(source.phase_slots),
      phase_index: Math.max(0, Math.min(4, Math.round(Number(source.phase_index) || base.phase_index))),
      phase_advance: Math.max(0, Math.min(4, Math.round(Number(source.phase_advance) || base.phase_advance))),
      stage: normalizeActStage(source.stage),
      controlledNodes: (source.controlledNodes && typeof source.controlledNodes === 'object' && !Array.isArray(source.controlledNodes))
        ? deepClone(source.controlledNodes)
        : {},
      crisis: Math.max(0, Math.min(100, Math.round(Number(source.crisis) || 0))),
      crisisSignals: normalizeCrisisSignals(source.crisisSignals),
      vision: normalizeVisionState(source.vision || base.vision),
      resourceSpent: normalizeCountMap(source.resourceSpent, false),
      characterEncounter: normalizeCharacterEncounterState(source.characterEncounter),
      pendingFirstMeet: normalizePendingFirstMeet(source.pendingFirstMeet),
      pendingResolutions: normalizePendingResolutions(source.pendingResolutions),
      resolutionHistory: normalizeResolutionHistory(source.resolutionHistory),
      narrativeTension: Math.max(0, Math.min(100, Math.round(Number(source.narrativeTension) || base.narrativeTension || 0))),
      pickedPacks: (source.pickedPacks && typeof source.pickedPacks === 'object' && !Array.isArray(source.pickedPacks))
        ? deepClone(source.pickedPacks)
        : {}
    };
  }

  function normalizeActEffectList(list) {
    const values = Array.isArray(list) ? list : [];
    return Array.from(new Set(
      values
        .map((value) => normalizeTrimmedString(value, '').toUpperCase())
        .filter((value) => NON_PLAYER_CHARACTER_KEYS.includes(value))
    ));
  }

  function getNodeV2CastOnEnter(config, nodeId) {
    const raw = config?.nodes?.[nodeId]?.cast?.onEnter;
    if (!raw || typeof raw !== 'object') return null;
    return {
      activate: normalizeActEffectList(raw.activate),
      introduce: normalizeActEffectList(raw.introduce),
      present: normalizeActEffectList(raw.present),
      mini_known: normalizeActEffectList(raw.mini_known || raw.miniKnown),
      join_party: normalizeActEffectList(raw.join_party || raw.joinParty)
    };
  }

  function getNodeV2Phase(config, nodeId, phaseIndex) {
    const phases = config?.nodes?.[nodeId]?.phases;
    if (!Array.isArray(phases)) return null;
    return phases[phaseIndex] && typeof phases[phaseIndex] === 'object'
      ? phases[phaseIndex]
      : null;
  }

  function getNormalizedActNodeEffects(config, nodeId) {
    const v2Effects = getNodeV2CastOnEnter(config, nodeId);
    if (v2Effects) return v2Effects;
    return {
      activate: [],
      introduce: [],
      present: [],
      mini_known: [],
      join_party: []
    };
  }

  // 首见文案不再从固定 node/phase 的 first_meet 配置读取。
  // 新链路只接受 characterEncounter 运行时状态，避免角色初见重新变成固定节点脚本。

  function getNormalizedActPhaseEffects(config, nodeId, phaseIndex) {
    const rawV2 = getNodeV2Phase(config, nodeId, phaseIndex)?.cast;
    if (rawV2 && typeof rawV2 === 'object') {
      return {
        activate: normalizeActEffectList(rawV2.activate),
        introduce: normalizeActEffectList(rawV2.introduce),
        present: normalizeActEffectList(rawV2.present),
        mini_known: normalizeActEffectList(rawV2.mini_known || rawV2.miniKnown),
        join_party: normalizeActEffectList(rawV2.join_party || rawV2.joinParty)
      };
    }
    return null;
  }

  function getNodeRuntime(config, nodeId) {
    return config?.nodes?.[nodeId] || null;
  }

  function getChapterRuntime(config) {
    return config?.runtime && typeof config.runtime === 'object'
      ? config.runtime
      : {};
  }

  function getNodeTypeKey(nodeRuntime) {
    if (!nodeRuntime || typeof nodeRuntime !== 'object') return '';
    const kind = normalizeActResourceKey(nodeRuntime.kind, '');
    if (ACT_RESOURCE_KEYS.includes(kind)) return kind;
    const key = normalizeActResourceKey(nodeRuntime.key, '');
    return ACT_RESOURCE_KEYS.includes(key) ? key : '';
  }

  function getChapterTotalNodes(config) {
    return Math.max(
      1,
      Math.round(Number(config?.totalNodes) || Number(config?.meta?.totalNodes) || 1)
    );
  }

  function getCurrentActNodeId(actState) {
    const routeHistory = Array.isArray(actState?.route_history) ? actState.route_history : [];
    const index = Math.max(1, Math.round(Number(actState?.nodeIndex) || 1));
    return routeHistory[index - 1] || routeHistory[routeHistory.length - 1] || '';
  }

  function getNodeLaneKey(nodeRuntime) {
    const lane = normalizeTrimmedString(nodeRuntime?.lane, '').toLowerCase();
    if (lane) return lane;
    const lanes = Array.isArray(nodeRuntime?.mainlineLanes) ? nodeRuntime.mainlineLanes : [];
    return normalizeTrimmedString(lanes[0], '').toLowerCase();
  }

  function getNodeIdsAtIndex(config, nodeIndex) {
    const targetIndex = Math.max(1, Math.round(Number(nodeIndex) || 1));
    const layer = getChapterNodesByIndex(config).find(([index]) => index === targetIndex);
    return layer ? layer[1].map(([nodeId]) => nodeId) : [];
  }

  function getJumpRouteOptions(config, actStateInput) {
    const actState = normalizeActState(actStateInput);
    const nextNodeIndex = Math.max(1, Math.round(Number(actState.nodeIndex) || 1)) + 1;
    const totalNodes = getChapterTotalNodes(config);
    if (nextNodeIndex >= totalNodes) return [];
    return getNodeIdsAtIndex(config, nextNodeIndex)
      .filter((nodeId) => !actState.route_history.includes(nodeId));
  }

  function createEmptyCounts(defaultValue = 0) {
    return ACT_RESOURCE_KEYS.reduce((acc, key) => {
      acc[key] = defaultValue;
      return acc;
    }, {});
  }

  function normalizeVisionState(value) {
    const source = value && typeof value === 'object' ? value : {};
    const pendingReplace = source.pendingReplace && typeof source.pendingReplace === 'object' && !Array.isArray(source.pendingReplace)
      ? deepClone(source.pendingReplace)
      : null;
    if (pendingReplace && pendingReplace.status === 'needs_target') {
      pendingReplace.status = 'charged';
      pendingReplace.charges = Math.max(1, Math.round(Number(pendingReplace.charges) || 1));
      pendingReplace.source = pendingReplace.source || 'vision2';
    }
    return {
      baseSight: Math.max(0, Math.round(Number(source.baseSight) || 1)),
      bonusSight: Math.max(0, Math.round(Number(source.bonusSight) || 0)),
      jumpReady: source.jumpReady === true,
      pendingReplace
    };
  }

  function normalizePendingResolutions(value) {
    const list = Array.isArray(value) ? value : [];
    return list
      .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
      .map((item) => ({
        ...deepClone(item),
        type: normalizeActResourceKey(item.type, ''),
        level: Math.max(1, Math.min(3, Math.round(Number(item.level) || 1))),
        status: normalizeTrimmedString(item.status, 'pending') || 'pending'
      }))
      .filter((item) => item.type === 'combat' || item.type === 'asset');
  }

  function normalizeResolutionResultStatus(value) {
    const status = normalizeTrimmedString(value, 'resolved').toLowerCase();
    return ['resolved', 'failed', 'cancelled'].includes(status) ? status : 'resolved';
  }

  function normalizeResolutionHistory(value) {
    const list = Array.isArray(value) ? value : [];
    return list
      .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
      .map((item) => ({
        ...deepClone(item),
        id: normalizeTrimmedString(item.id, ''),
        type: normalizeActResourceKey(item.type, ''),
        level: Math.max(1, Math.min(3, Math.round(Number(item.level) || 1))),
        status: normalizeResolutionResultStatus(item.status),
        outcome: normalizeTrimmedString(item.outcome, ''),
        summary: normalizeTrimmedString(item.summary, '')
      }))
      .filter((item) => item.id && (item.type === 'combat' || item.type === 'asset'));
  }

  function normalizeCrisisSignalStatus(value) {
    const status = normalizeTrimmedString(value, 'open').toLowerCase();
    return ['open', 'acknowledged', 'resolved', 'dismissed'].includes(status) ? status : 'open';
  }

  function normalizeCrisisSignals(value) {
    const list = Array.isArray(value) ? value : [];
    return list
      .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
      .map((item) => ({
        ...deepClone(item),
        id: normalizeTrimmedString(item.id, ''),
        source: normalizeTrimmedString(item.source, 'external').toLowerCase(),
        kind: normalizeTrimmedString(item.kind || item.type, 'generic').toLowerCase(),
        level: Math.max(0, Math.round(Number(item.level) || 0)),
        delta: Number.isFinite(Number(item.delta)) ? Math.round(Number(item.delta)) : 0,
        nodeId: normalizeTrimmedString(item.nodeId, ''),
        nodeIndex: Math.max(0, Math.round(Number(item.nodeIndex) || 0)),
        phaseIndex: Math.max(-1, Math.min(3, Math.round(Number(item.phaseIndex ?? -1)))),
        status: normalizeCrisisSignalStatus(item.status),
        summary: normalizeTrimmedString(item.summary, '')
      }))
      .filter((item) => item.id);
  }

  function normalizeExternalResolutionResult(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const id = normalizeTrimmedString(value.id || value.requestId || value.resolutionId, '');
    if (!id) return null;
    const type = normalizeActResourceKey(value.type, '');
    return {
      id,
      type,
      status: normalizeResolutionResultStatus(value.status),
      outcome: normalizeTrimmedString(value.outcome, ''),
      summary: normalizeTrimmedString(value.summary || value.note || value.notes, ''),
      actPatch: isPlainObject(value.actPatch) ? deepClone(value.actPatch) : null,
      heroPatch: isPlainObject(value.heroPatch) ? deepClone(value.heroPatch) : null,
      crisisSignals: Array.isArray(value.crisisSignals)
        ? deepClone(value.crisisSignals)
        : (isPlainObject(value.crisisSignal) ? [deepClone(value.crisisSignal)] : []),
      payload: isPlainObject(value.payload) ? deepClone(value.payload) : null,
      consume: value.consume !== false
    };
  }

  function normalizeIncomeRateMap(value) {
    const source = value && typeof value === 'object' ? value : {};
    const rates = { ...DEFAULT_WORLD_ACT.income_rate };
    Object.entries(source).forEach(([rawKey, rawValue]) => {
      const key = normalizeActResourceKey(rawKey, '');
      if (!key) return;
      rates[key] = Math.max(0, Number(rawValue) || 0);
    });
    for (const key of ACT_RESOURCE_KEYS) {
      rates[key] = Math.max(0, Math.min(1.5, rates[key]));
    }
    return rates;
  }

  function createRewardsForNode(nodeRuntime) {
    const rewards = createEmptyCounts(0);
    if (!nodeRuntime || typeof nodeRuntime !== 'object') return rewards;

    if (nodeRuntime.rewards?.limited && typeof nodeRuntime.rewards.limited === 'object') {
      Object.entries(nodeRuntime.rewards.limited).forEach(([rawKey, rawValue]) => {
        const key = normalizeActResourceKey(rawKey, '');
        if (!key) return;
        rewards[key] += Math.max(0, Math.round(Number(rawValue) || 0));
      });
      return rewards;
    }

    if (nodeRuntime.rewards && typeof nodeRuntime.rewards === 'object') {
      Object.entries(nodeRuntime.rewards).forEach(([rawKey, rawValue]) => {
        const key = normalizeActResourceKey(rawKey, '');
        if (!key) return;
        rewards[key] += Math.max(0, Math.round(Number(rawValue) || 0));
      });
      return rewards;
    }

    const typeKey = getNodeTypeKey(nodeRuntime);
    if (typeKey) {
      rewards[typeKey] = 1;
    }
    return rewards;
  }

  function applyReserveGrowthToAct(actState, config, nodeIndex) {
    void config;
    void nodeIndex;
    if (!actState || typeof actState !== 'object') return;
    actState.income_rate = normalizeIncomeRateMap(actState.income_rate);
    actState.income_progress = normalizeCountMap(actState.income_progress, true);
    actState.reserve = normalizeCountMap(actState.reserve, false);
    for (const key of ACT_RESOURCE_KEYS) {
      actState.income_progress[key] += actState.income_rate[key];
      while (actState.income_progress[key] >= 1) {
        actState.income_progress[key] -= 1;
        actState.reserve[key] += 1;
      }
    }
  }

  function clearLimitedActTokens(actState) {
    for (const key of ACT_RESOURCE_KEYS) {
      actState.limited[key] = 0;
    }
  }

  function resetActPhaseSlots(actState, phaseIndex = 0) {
    actState.phase_slots = [null, null, null, null];
    actState.phase_index = phaseIndex;
  }

  function applyNodeRewardsToAct(actState, config, nodeId) {
    const rewards = createRewardsForNode(getNodeRuntime(config, nodeId));
    for (const key of ACT_RESOURCE_KEYS) {
      actState.limited[key] += rewards[key];
    }
  }

  function applyControlledNodeLaneBurst(actState, config, nodeId) {
    const nodeRuntime = getNodeRuntime(config, nodeId);
    const lane = getNodeLaneKey(nodeRuntime);
    if (!lane) return;

    const counts = createEmptyCounts(0);
    Object.values(actState.controlledNodes || {}).forEach((entry) => {
      if (!entry || typeof entry !== 'object') return;
      const entryLane = normalizeTrimmedString(entry.lane, '').toLowerCase();
      if (entryLane !== lane) return;
      const type = normalizeActResourceKey(entry.type, '');
      if (!ACT_RESOURCE_KEYS.includes(type)) return;
      counts[type] += 1;
    });

    const candidates = ACT_RESOURCE_KEYS
      .map((key) => ({
        key,
        count: counts[key],
        weight: counts[key],
        chance: counts[key] >= 3 ? 1 : counts[key] === 2 ? 0.75 : counts[key] === 1 ? 0.5 : 0,
        amount: counts[key] >= 2 ? 3 : 2
      }))
      .filter((entry) => entry.count > 0)
      .sort((left, right) => right.count - left.count || ACT_RESOURCE_KEYS.indexOf(left.key) - ACT_RESOURCE_KEYS.indexOf(right.key));

    if (!candidates.length) return;
    const seedBase = `${actState.seed || DEFAULT_WORLD_ACT.seed}|lane-burst|${nodeId}|${lane}|${Math.max(1, Math.round(Number(actState.nodeIndex) || 1))}`;
    const selected = pickFromCandidates(candidates, seedBase) || candidates[0];
    const roll = mulberry32(hashStringToSeed(`${seedBase}|${selected.key}`))();
    if (roll >= selected.chance) return;
    actState.reserve = normalizeCountMap(actState.reserve, false);
    actState.reserve[selected.key] += selected.amount;
  }

  function advanceActToNextNode(actState, config) {
    const nextNodeIndex = Math.max(1, Math.round(Number(actState.nodeIndex) || 1)) + 1;
    const nodeId = actState.route_history[nextNodeIndex - 1];
    if (!nodeId) return false;

    actState.nodeIndex = nextNodeIndex;
    actState.stage = 'executing';
    actState.vision = normalizeVisionState(actState.vision);
    actState.vision.bonusSight = 0;
    actState.vision.jumpReady = false;
    resetActPhaseSlots(actState, 0);
    applyNodeRewardsToAct(actState, config, nodeId);
    applyControlledNodeLaneBurst(actState, config, nodeId);
    const encounterResult = updateCharacterEncountersForNodeEntry(actState, {}, config);
    if (encounterResult?.actState) Object.assign(actState, encounterResult.actState);
    return true;
  }

  function resolveActNodeTransition(actState, config) {
    const currentNodeId = actState.route_history[actState.nodeIndex - 1];
    const currentNode = getNodeRuntime(config, currentNodeId);
    const nextTransition = currentNode?.next || { mode: 'none' };

    clearLimitedActTokens(actState);
    applyReserveGrowthToAct(actState, config, actState.nodeIndex);
    resetActPhaseSlots(actState, 4);

    const jumpOptions = actState.vision?.jumpReady === true
      ? getJumpRouteOptions(config, actState)
      : [];
    if (jumpOptions.length > 0) {
      actState.stage = 'route';
      return;
    }

    if (nextTransition.mode === 'choice') {
      const options = Array.isArray(nextTransition.options) ? nextTransition.options : [];
      // 只有一条可选路线 → 等价 forced，自动推进，不停在 route 等玩家选。
      // 避免"只有一个选项还要玩家去 dashboard 按一下"的无意义等待。
      if (options.length === 1) {
        if (actState.route_history.length < actState.nodeIndex + 1) {
          actState.route_history.push(options[0]);
        }
        const advanced = advanceActToNextNode(actState, config);
        if (!advanced) actState.stage = 'route';
        return;
      }
      // 设计态无效（0 个选项）→ 视同收束，而非永久卡 route。
      if (options.length === 0) {
        actState.stage = 'complete';
        return;
      }
      actState.stage = 'route';
      return;
    }

    if (nextTransition.mode === 'forced') {
      if (actState.route_history.length < actState.nodeIndex + 1) {
        actState.route_history.push(nextTransition.nodeId);
      }
      const advanced = advanceActToNextNode(actState, config);
      if (!advanced) {
        actState.stage = 'route';
      }
      return;
    }

    actState.stage = 'complete';
  }

  function getRestRecoverRatio(amount) {
    if (amount >= 3) return 1;
    if (amount === 2) return 0.66;
    return 0.25;
  }

  function getPartyRosterKeys(heroState) {
    const roster = heroState?.roster && typeof heroState.roster === 'object' ? heroState.roster : {};
    const cast = heroState?.cast && typeof heroState.cast === 'object' ? heroState.cast : {};
    return Object.keys(roster).filter((key) => {
      const node = roster[key];
      if (!node || typeof node !== 'object') return false;
      const maxMana = Math.max(0, Math.round(Number(node.maxMana) || 0));
      if (maxMana <= 0) return false;
      if (key === 'KAZU') return true;
      return cast[key]?.inParty === true;
    });
  }

  function applyRestTokenEffect(actState, heroState, config, token, amount, phaseIndex) {
    const ratio = getRestRecoverRatio(amount);
    const roster = heroState?.roster && typeof heroState.roster === 'object' ? heroState.roster : {};
    getPartyRosterKeys(heroState).forEach((charKey) => {
      const node = roster[charKey];
      const maxMana = Math.max(0, Math.round(Number(node.maxMana) || 0));
      const currentMana = Math.max(0, Math.round(Number(node.mana) || 0));
      const recovered = Math.ceil(maxMana * ratio);
      node.mana = Math.min(maxMana, currentMana + recovered);
    });

    const nodeId = getCurrentActNodeId(actState);
    const nodeRuntime = getNodeRuntime(config, nodeId);
    const tintKey = normalizeActResourceKey(token.controlType || token.tint || token.targetKey, '');
    const controlType = ACT_RESOURCE_KEYS.includes(tintKey) ? tintKey : 'neutral';
    actState.controlledNodes = actState.controlledNodes && typeof actState.controlledNodes === 'object' && !Array.isArray(actState.controlledNodes)
      ? actState.controlledNodes
      : {};
    actState.controlledNodes[nodeId] = {
      ...(actState.controlledNodes[nodeId] && typeof actState.controlledNodes[nodeId] === 'object' ? actState.controlledNodes[nodeId] : {}),
      type: controlType,
      lane: getNodeLaneKey(nodeRuntime),
      nodeIndex: Math.max(1, Math.round(Number(actState.nodeIndex) || 1)),
      level: Math.max(amount, Math.round(Number(actState.controlledNodes[nodeId]?.level) || 0)),
      phaseIndex
    };

    if (ACT_RESOURCE_KEYS.includes(tintKey)) {
      actState.income_rate = normalizeIncomeRateMap(actState.income_rate);
      actState.income_rate[tintKey] = Math.min(1.5, actState.income_rate[tintKey] + (amount >= 3 ? 0.4 : amount === 2 ? 0.25 : 0.1));
    }
  }

  function applyVisionTokenEffect(actState, token, amount, phaseIndex) {
    void token;
    actState.vision = normalizeVisionState(actState.vision);
    const nodeId = getCurrentActNodeId(actState);
    if (amount >= 3) {
      actState.vision.jumpReady = true;
      actState.vision.bonusSight += 2;
      return;
    }
    if (amount === 2) {
      const currentCharges = getVisionReplaceChargeCount(actState);
      actState.vision.pendingReplace = {
        status: 'charged',
        charges: currentCharges + 1,
        source: 'vision2',
        nodeId,
        nodeIndex: Math.max(1, Math.round(Number(actState.nodeIndex) || 1)),
        phaseIndex,
        level: amount
      };
      actState.vision.bonusSight += 2;
      return;
    }
    actState.vision.bonusSight += 2;
  }

  function appendPendingResolution(actState, token, amount, phaseIndex) {
    const key = normalizeActResourceKey(token.key, '');
    if (key !== 'combat' && key !== 'asset') return;
    actState.pendingResolutions = normalizePendingResolutions(actState.pendingResolutions);
    const nodeId = getCurrentActNodeId(actState);
    const request = {
      id: `${actState.id}:${nodeId}:${phaseIndex}:${key}:${amount}:${actState.resourceSpent[key] || 0}`,
      protocol: 'ace0.externalResolution.v1',
      type: key,
      level: amount,
      nodeId,
      nodeIndex: Math.max(1, Math.round(Number(actState.nodeIndex) || 1)),
      phaseIndex,
      status: 'pending',
      sources: Array.isArray(token.sources) ? deepClone(token.sources) : [token.source === 'reserve' ? 'reserve' : 'limited']
    };
    actState.pendingResolutions.push(request);
  }

  function getPendingExternalResolutionRequests(actStateInput, filters = {}) {
    const actState = normalizeActState(actStateInput);
    const typeFilter = normalizeActResourceKey(filters.type, '');
    return normalizePendingResolutions(actState.pendingResolutions)
      .filter((request) => request.status === 'pending')
      .filter((request) => !typeFilter || request.type === typeFilter)
      .map((request) => deepClone(request));
  }

  function applyExternalResolutionResult(actStateInput, heroStateInput, resultInput) {
    const result = normalizeExternalResolutionResult(resultInput);
    const originalActState = normalizeActState(actStateInput);
    const heroState = deepClone(heroStateInput || {});
    if (!result) {
      return {
        actState: originalActState,
        heroState,
        applied: false,
        reason: 'invalid_result'
      };
    }

    const pending = normalizePendingResolutions(originalActState.pendingResolutions);
    const requestIndex = pending.findIndex((request) => request.id === result.id);
    if (requestIndex < 0) {
      return {
        actState: originalActState,
        heroState,
        applied: false,
        reason: 'missing_request',
        result
      };
    }

    const request = pending[requestIndex];
    if (result.type && result.type !== request.type) {
      return {
        actState: originalActState,
        heroState,
        applied: false,
        reason: 'type_mismatch',
        request: deepClone(request),
        result
      };
    }

    const nextPending = result.consume
      ? pending.filter((_, index) => index !== requestIndex)
      : pending.map((item, index) => index === requestIndex ? { ...item, status: result.status } : item);
    const historyEntry = {
      ...deepClone(request),
      status: result.status,
      outcome: result.outcome,
      summary: result.summary,
      payload: result.payload
    };

    const patchedActState = result.actPatch
      ? mergePlainObjects(originalActState, result.actPatch, ['pendingResolutions', 'resolutionHistory', 'crisisSignals'])
      : deepClone(originalActState);
    patchedActState.pendingResolutions = nextPending;
    patchedActState.resolutionHistory = [
      ...normalizeResolutionHistory(originalActState.resolutionHistory),
      historyEntry
    ];
    if (Array.isArray(result.crisisSignals) && result.crisisSignals.length) {
      let signalActState = patchedActState;
      result.crisisSignals.forEach((signalInput) => {
        const signalResult = appendCrisisSignalToActState(signalActState, {
          source: request.type,
          nodeId: request.nodeId,
          nodeIndex: request.nodeIndex,
          phaseIndex: request.phaseIndex,
          level: request.level,
          ...signalInput
        });
        signalActState = signalResult.actState;
      });
      patchedActState.crisis = signalActState.crisis;
      patchedActState.crisisSignals = signalActState.crisisSignals;
    }

    const patchedHeroState = result.heroPatch
      ? mergePlainObjects(heroState, result.heroPatch)
      : heroState;

    return {
      actState: normalizeActState(patchedActState),
      heroState: patchedHeroState,
      applied: true,
      request: deepClone(request),
      result: historyEntry
    };
  }

  function applyExternalResolutionResults(actStateInput, heroStateInput, resultListInput) {
    const results = Array.isArray(resultListInput) ? resultListInput : [resultListInput];
    let actState = normalizeActState(actStateInput);
    let heroState = deepClone(heroStateInput || {});
    const applied = [];
    const rejected = [];

    results.forEach((resultInput) => {
      const next = applyExternalResolutionResult(actState, heroState, resultInput);
      actState = next.actState;
      heroState = next.heroState;
      if (next.applied) applied.push(next.result);
      else rejected.push({ reason: next.reason, result: next.result || resultInput });
    });

    return {
      actState,
      heroState,
      applied,
      rejected,
      changed: applied.length > 0
    };
  }

  function createCrisisSignal(actStateInput, signalInput = {}) {
    const actState = normalizeActState(actStateInput);
    const source = isPlainObject(signalInput) ? signalInput : {};
    const nodeId = normalizeTrimmedString(source.nodeId, getCurrentActNodeId(actState));
    const nodeIndex = Math.max(1, Math.round(Number(source.nodeIndex) || Number(actState.nodeIndex) || 1));
    const phaseIndex = Number.isFinite(Number(source.phaseIndex))
      ? Math.max(-1, Math.min(3, Math.round(Number(source.phaseIndex))))
      : Math.max(-1, Math.min(3, Math.round(Number(actState.phase_index) || 0)));
    const existingCount = normalizeCrisisSignals(actState.crisisSignals).length;
    const kind = normalizeTrimmedString(source.kind || source.type, 'generic').toLowerCase();
    const signal = {
      id: normalizeTrimmedString(
        source.id,
        `${actState.id}:${nodeId}:${phaseIndex}:crisis:${kind}:${existingCount}`
      ),
      source: normalizeTrimmedString(source.source, 'external').toLowerCase(),
      kind,
      level: Math.max(0, Math.round(Number(source.level) || 0)),
      delta: Number.isFinite(Number(source.delta)) ? Math.round(Number(source.delta)) : 0,
      nodeId,
      nodeIndex,
      phaseIndex,
      status: normalizeCrisisSignalStatus(source.status),
      summary: normalizeTrimmedString(source.summary || source.note, ''),
      payload: isPlainObject(source.payload) ? deepClone(source.payload) : null
    };
    return normalizeCrisisSignals([signal])[0] || signal;
  }

  function appendCrisisSignalToActState(actStateInput, signalInput = {}) {
    const actState = normalizeActState(actStateInput);
    const signal = createCrisisSignal(actState, signalInput);
    const signals = normalizeCrisisSignals(actState.crisisSignals);
    const alreadyRecorded = signals.some((item) => item.id === signal.id);
    if (!alreadyRecorded) {
      signals.push(signal);
    }
    actState.crisisSignals = signals;
    if (!alreadyRecorded && Number.isFinite(Number(signal.delta)) && signal.delta !== 0) {
      actState.crisis = Math.max(0, Math.min(100, Math.round(Number(actState.crisis) || 0) + signal.delta));
    }
    return {
      actState: normalizeActState(actState),
      signal: deepClone(signal),
      applied: !alreadyRecorded
    };
  }

  function getCrisisSignals(actStateInput, filters = {}) {
    const actState = normalizeActState(actStateInput);
    const sourceFilter = normalizeTrimmedString(filters.source, '').toLowerCase();
    const kindFilter = normalizeTrimmedString(filters.kind || filters.type, '').toLowerCase();
    const statusFilter = normalizeTrimmedString(filters.status, '').toLowerCase();
    return normalizeCrisisSignals(actState.crisisSignals)
      .filter((signal) => !sourceFilter || signal.source === sourceFilter)
      .filter((signal) => !kindFilter || signal.kind === kindFilter)
      .filter((signal) => !statusFilter || signal.status === statusFilter)
      .map((signal) => deepClone(signal));
  }

  function executeActTokenEffect(actState, heroState, config, token, phaseIndex = 0) {
    if (!token || typeof token !== 'object') return;
    const key = normalizeActResourceKey(token.key, '');
    if (!key) return;
    const amount = Math.max(1, Math.min(3, Math.round(Number(token.amount) || 1)));
    actState.resourceSpent = normalizeCountMap(actState.resourceSpent, false);
    actState.resourceSpent[key] += amount;

    if (key === 'rest') {
      applyRestTokenEffect(actState, heroState, config, token, amount, phaseIndex);
      return;
    }
    if (key === 'vision') {
      applyVisionTokenEffect(actState, token, amount, phaseIndex);
      return;
    }
    appendPendingResolution(actState, token, amount, phaseIndex);
  }

  function consumeSingleActPhase(actState, heroState, config) {
    if (actState.stage === 'route') {
      if (actState.route_history.length >= actState.nodeIndex + 1) {
        advanceActToNextNode(actState, config);
      }
      return;
    }

    if (actState.stage === 'complete') return;

    const phaseIndex = Math.max(0, Math.min(4, Math.round(Number(actState.phase_index) || 0)));
    if (phaseIndex >= 4) {
      resolveActNodeTransition(actState, config);
      return;
    }

    const currentNodeId = getCurrentActNodeId(actState);
    const visionReplacement = getVisionReplacementForPhase(actState, currentNodeId, phaseIndex);
    const token = Array.isArray(actState.phase_slots) && actState.phase_slots[phaseIndex]
      ? actState.phase_slots[phaseIndex]
      : visionReplacement
        ? { key: visionReplacement.key, amount: 1, source: 'vision', sources: ['vision'], visionReplacement: true }
        : null;
    const encounterResult = consumeCharacterEncounterForNode(actState, currentNodeId, { phaseIndex });
    if (encounterResult?.consumed && encounterResult.actState) {
      Object.assign(actState, encounterResult.actState);
    }
    executeActTokenEffect(actState, heroState, config, token, phaseIndex);
    if (Array.isArray(actState.phase_slots)) {
      actState.phase_slots[phaseIndex] = null;
    }
    if (visionReplacement) {
      consumeVisionReplacementCharge(actState, visionReplacement);
    }

    actState.phase_index = phaseIndex + 1;
    if (actState.phase_index >= 4) {
      resolveActNodeTransition(actState, config);
      return;
    }

    actState.stage = 'executing';
  }

  function deriveWorldTimeFromAct(actState) {
    // 阶段2：节点轨与世界时间轨完全解耦。
    // ACT 不再为世界时间提供任何值：day / phase 均返回 null（表示不覆盖）。
    // world.current_time 由独立时钟（参见 host advanceWorldClock）推进。
    return {
      day: null,
      phase: null
    };
  }

  function resolvePendingAdvanceState(actStateInput, heroStateInput, config) {
    const actState = normalizeActState(actStateInput);
    const heroState = deepClone(heroStateInput || {});
    if (!config || !(actState.phase_advance > 0)) {
      return {
        actState,
        heroState,
        changed: false,
        worldTime: deriveWorldTimeFromAct(actState)
      };
    }

    const stepCount = Math.max(0, Math.min(4, Math.round(Number(actState.phase_advance) || 0)));
    actState.phase_advance = 0;

    for (let index = 0; index < stepCount; index += 1) {
      consumeSingleActPhase(actState, heroState, config);
      if (actState.stage === 'complete') break;
      if (actState.stage === 'route' && actState.route_history.length < actState.nodeIndex + 1) break;
    }

    return {
      actState,
      heroState,
      changed: true,
      worldTime: deriveWorldTimeFromAct(actState)
    };
  }

  function deriveCharacterStatesFromActState(actStateInput, configInput) {
    const act = normalizeActState(actStateInput);
    const config = configInput && typeof configInput === 'object'
      ? deepClone(configInput)
      : getChapter(act.id);
    if (!config) return null;

    const runtime = getChapterRuntime(config);
    const chapterManagedCharacters = normalizeActEffectList(runtime.managedCharacters);
    const encounterManagedCharacters = getActiveEncounterCharacterKeys(act.characterEncounter);
    const managedCharacters = [...new Set([...chapterManagedCharacters, ...encounterManagedCharacters])];
    const initialEffects = {
      activate: normalizeActEffectList(runtime.initialCast?.activate),
      introduce: normalizeActEffectList(runtime.initialCast?.introduce),
      present: normalizeActEffectList(runtime.initialCast?.present),
      mini_known: normalizeActEffectList(runtime.initialCast?.miniKnown || runtime.initialCast?.mini_known),
      join_party: normalizeActEffectList(runtime.initialCast?.joinParty || runtime.initialCast?.join_party)
    };
    const defaultRouteNode = Array.isArray(getDefaultActState(act.id).route_history) && getDefaultActState(act.id).route_history.length
      ? getDefaultActState(act.id).route_history[0]
      : '';
    const routeNodes = act.route_history.slice(0, Math.max(1, act.nodeIndex));
    const currentNodeId = routeNodes[act.nodeIndex - 1] || routeNodes[routeNodes.length - 1] || defaultRouteNode;
    const nodeLevelEffects = getNormalizedActNodeEffects(config, currentNodeId);
    const currentPhaseIndex = Math.max(0, Math.min(3, Math.round(Number(act.phase_index) || 0)));
    const phaseLevelEffects = getNormalizedActPhaseEffects(config, currentNodeId, currentPhaseIndex);
    const currentNodeEffects = phaseLevelEffects || nodeLevelEffects;
    const states = {};
    const applyPersistentEffects = (effect) => {
      if (!effect || typeof effect !== 'object') return;
      for (const charKey of effect.activate || []) states[charKey].activated = true;
      for (const charKey of effect.mini_known || []) {
        states[charKey].activated = true;
        states[charKey].miniKnown = true;
      }
      for (const charKey of effect.introduce || []) {
        states[charKey].activated = true;
        states[charKey].introduced = true;
      }
      for (const charKey of effect.join_party || []) {
        states[charKey].activated = true;
        states[charKey].introduced = true;
        states[charKey].inParty = true;
      }
    };

    for (const charKey of managedCharacters) {
      const isChapterManaged = chapterManagedCharacters.includes(charKey);
      states[charKey] = {
        activated: isChapterManaged,
        introduced: initialEffects.introduce.includes(charKey)
          || initialEffects.present.includes(charKey)
          || initialEffects.join_party.includes(charKey),
        present: initialEffects.present.includes(charKey),
        inParty: initialEffects.join_party.includes(charKey),
        miniKnown: initialEffects.mini_known.includes(charKey)
      };
    }

    routeNodes.forEach((nodeId, routeIndex) => {
      applyPersistentEffects(getNormalizedActNodeEffects(config, nodeId));
      const phaseLimit = routeIndex < act.nodeIndex - 1 ? 3 : currentPhaseIndex;
      for (let phaseIndex = 0; phaseIndex <= phaseLimit; phaseIndex += 1) {
        applyPersistentEffects(getNormalizedActPhaseEffects(config, nodeId, phaseIndex));
      }
    });

	    for (const charKey of managedCharacters) {
	      states[charKey].present = currentNodeEffects.present.includes(charKey);
	      if (states[charKey].present) {
	        states[charKey].activated = true;
	        states[charKey].introduced = true;
	      }
	    }

    const encounterState = normalizeCharacterEncounterState(act.characterEncounter);
    Object.entries(encounterState.characters).forEach(([charKey, encounterChar]) => {
      if (!states[charKey]) return;
      if (encounterChar.status === 'introduced' || encounterChar.status === 'first_meet' || encounterChar.firstMeetDone) {
        states[charKey].activated = true;
        states[charKey].introduced = true;
      }
      if (
        encounterChar.status === 'first_meet'
        || (encounterChar.status === 'introduced' && encounterChar.introducedNodeId && encounterChar.introducedNodeId === currentNodeId)
      ) {
        states[charKey].present = true;
      }
    });

    // 首见帧来源只允许来自 characterEncounter 运行时状态。
    // 真正是否首见，仍在 createCharacterCastPatch 里比对 currentCast 旧态。
    const designedFirstMeet = getCharacterEncounterFirstMeetMap(act, currentNodeId);

    return {
      act,
      config,
      managedCharacters,
      routeNodes,
      currentNodeId,
      currentNodeEffects,
      states,
      designedFirstMeet
    };
  }

  function createCharacterCastPatch(currentCastInput, derivedState) {
    if (!derivedState) {
      return { changed: false, castPatch: {} };
    }

    const currentCast = currentCastInput && typeof currentCastInput === 'object' ? currentCastInput : {};
    const castPatch = {};
    let changed = false;

    for (const charKey of derivedState.managedCharacters) {
      const currentNode = currentCast[charKey] && typeof currentCast[charKey] === 'object'
        ? currentCast[charKey]
        : {};
      const desiredNode = derivedState.states[charKey];
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

    // 首见帧检测：旧态 introduced=false 且 本轮即将设为 true 且 章节提供了文案。
    const firstMeetHints = {};
    const designed = derivedState.designedFirstMeet || {};
    for (const charKey of derivedState.managedCharacters) {
      const currentNode = currentCast[charKey] && typeof currentCast[charKey] === 'object'
        ? currentCast[charKey]
        : {};
      const desiredNode = derivedState.states[charKey];
      if (!desiredNode) continue;
      if (
        currentNode.introduced !== true &&
        desiredNode.introduced === true &&
        typeof designed[charKey] === 'string' &&
        designed[charKey].trim()
      ) {
        firstMeetHints[charKey] = designed[charKey];
      }
    }

    return { changed, castPatch, firstMeetHints };
  }

  const ACT_NARRATIVE_RUNTIME = global.ACE0ActNarrativeRuntime && typeof global.ACE0ActNarrativeRuntime.create === 'function'
    ? global.ACE0ActNarrativeRuntime.create({
        constants: {
          DEFAULT_WORLD_ACT,
          ACT_RESOURCE_KEYS,
          ACT_PHASE_LABELS
        },
        deps: {
          deepClone,
          normalizeTrimmedString,
          normalizeActResourceKey,
          normalizeActState,
          getVisionReplacementForPhase,
          getNodeV2Phase,
          getNodeRuntime,
          getChapterRuntime,
          getChapter,
          getDefaultActState
        }
      })
    : null;

  function buildFirstMeetPromptContent(firstMeetHints) { return ACT_NARRATIVE_RUNTIME.buildFirstMeetPromptContent(firstMeetHints); }
  function buildActStateSummaryFromDerived(derivedState) { return ACT_NARRATIVE_RUNTIME.buildActStateSummaryFromDerived(derivedState); }
  const NARRATIVE_TENSION_TIERS = ACT_NARRATIVE_RUNTIME.NARRATIVE_TENSION_TIERS;
  function pickNarrativeTensionTier(tension) { return ACT_NARRATIVE_RUNTIME.pickNarrativeTensionTier(tension); }
  function buildNarrativePacingSummary(tension, worldClockSuggestion = null) { return ACT_NARRATIVE_RUNTIME.buildNarrativePacingSummary(tension, worldClockSuggestion); }
  function buildCharterPromptContent(narrative) { return ACT_NARRATIVE_RUNTIME.buildCharterPromptContent(narrative); }
  function hashStringToSeed(str) { return ACT_NARRATIVE_RUNTIME.hashStringToSeed(str); }
  function mulberry32(seed) { return ACT_NARRATIVE_RUNTIME.mulberry32(seed); }
  function pickFromCandidates(candidates, seedStr) { return ACT_NARRATIVE_RUNTIME.pickFromCandidates(candidates, seedStr); }
  function normalizePhaseGuideCandidates(guide) { return ACT_NARRATIVE_RUNTIME.normalizePhaseGuideCandidates(guide); }
  function collectUsedPackIds(act) { return ACT_NARRATIVE_RUNTIME.collectUsedPackIds(act); }
  function getPoolFallbackText(guide, slotKey) { return ACT_NARRATIVE_RUNTIME.getPoolFallbackText(guide, slotKey); }
  function resolvePhaseEvent(config, narrative, nodeId, phaseIndex, act) { return ACT_NARRATIVE_RUNTIME.resolvePhaseEvent(config, narrative, nodeId, phaseIndex, act); }
  function commitPackUsageForPhase(actState, config, narrative, nodeId, phaseIndex) { return ACT_NARRATIVE_RUNTIME.commitPackUsageForPhase(actState, config, narrative, nodeId, phaseIndex); }
  function renderPooledCandidate(candidate, phaseIndex, guide, slotKey) { return ACT_NARRATIVE_RUNTIME.renderPooledCandidate(candidate, phaseIndex, guide, slotKey); }
  function renderPoolFallback(fallbackText, phaseIndex, guide, slotKey) { return ACT_NARRATIVE_RUNTIME.renderPoolFallback(fallbackText, phaseIndex, guide, slotKey); }
  function findPinnedEvent(config, narrative, nodeId, phaseIndex) { return ACT_NARRATIVE_RUNTIME.findPinnedEvent(config, narrative, nodeId, phaseIndex); }
  function resolveNodeGuide(config, narrative, nodeId) { return ACT_NARRATIVE_RUNTIME.resolveNodeGuide(config, narrative, nodeId); }
  function renderPinnedTemplate(template, phaseIndex) { return ACT_NARRATIVE_RUNTIME.renderPinnedTemplate(template, phaseIndex); }
  function renderFateFlavor(flavorText, phaseIndex, phaseGuide, tokenKey) { return ACT_NARRATIVE_RUNTIME.renderFateFlavor(flavorText, phaseIndex, phaseGuide, tokenKey); }
  function buildNarrativePromptContentFromDerived(derivedState) { return ACT_NARRATIVE_RUNTIME.buildNarrativePromptContentFromDerived(derivedState); }
  function evaluateCompletionTransition(actStateInput, heroStateInput) { return ACT_NARRATIVE_RUNTIME.evaluateCompletionTransition(actStateInput, heroStateInput); }
  function buildCompletionTransitionPromptContent(transitionResult, options = {}) { return ACT_NARRATIVE_RUNTIME.buildCompletionTransitionPromptContent(transitionResult, options); }

  const moduleApi = {
    version: '0.1.0-skeleton',
    constants: {
      DEFAULT_CHAPTER_ID,
      ACT_STAGE_VALUES: deepClone(ACT_STAGE_VALUES),
      ACT_RESOURCE_KEYS: deepClone(ACT_RESOURCE_KEYS)
    },
    registerChapter,
    listChapters,
    getChapter,
    getDefaultActState,
    normalizeActState,
    normalizePendingFirstMeet,
    normalizeCharacterEncounterState,
    evaluateCharacterEncounterEligibility,
    enqueueEligibleCharacterEncounters,
    placeNextCharacterEncounter,
    consumeCharacterEncounterForNode,
    updateCharacterEncountersForNodeEntry,
    debugForceCharacterEncounter,
    normalizeActEffectList,
    getNormalizedActNodeEffects,
    getNormalizedActPhaseEffects,
    getNodeRuntime,
    getJumpRouteOptions,
    createEmptyCounts,
    createRewardsForNode,
    applyReserveGrowthToAct,
    clearLimitedActTokens,
    resetActPhaseSlots,
    applyNodeRewardsToAct,
    advanceActToNextNode,
    resolveActNodeTransition,
    consumeSingleActPhase,
    getPendingExternalResolutionRequests,
    applyExternalResolutionResult,
    applyExternalResolutionResults,
    appendCrisisSignalToActState,
    getCrisisSignals,
    deriveWorldTimeFromAct,
    resolvePendingAdvanceState,
    deriveCharacterStatesFromActState,
    createCharacterCastPatch,
    buildActStateSummaryFromDerived,
    buildCharterPromptContent,
    buildNarrativePromptContentFromDerived,
    evaluateCompletionTransition,
    buildCompletionTransitionPromptContent,
    createFrontendSnapshot,
    resolvePhaseEvent,
    commitPackUsageForPhase,
    buildNarrativePacingSummary,
    pickNarrativeTensionTier,
    buildFirstMeetPromptContent,
    NARRATIVE_TENSION_TIERS: deepClone(NARRATIVE_TENSION_TIERS)
  };

  const namespace = ensureModuleNamespace();
  namespace[MODULE_KEY] = moduleApi;
  installModuleBridge(moduleApi);
})(typeof window !== 'undefined' ? window : globalThis);
