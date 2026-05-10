// Overview page is now a composition layer.
// Static config, shared boot helpers, runtimes, and views live in sibling modules.

const OVERVIEW_CORE = (typeof window !== 'undefined' && window.ACE0OverviewCore && typeof window.ACE0OverviewCore === 'object')
    ? window.ACE0OverviewCore
    : {};
const {
    DEFAULT_DASHBOARD_CHAPTER_ID = 'chapter0_exchange',
    INITIAL_OVERVIEW_MODE = 'debug',
    getOverviewConfigProfile = () => ({ chapterId: 'chapter0_exchange', campaign: {}, fixedPhaseMarkers: {} }),
    getOverviewFallbackCampaign = () => ({ seed: '', totalNodes: 1, rules: {}, reserveGrowthByNode: [], days: [] }),
    getOverviewFallbackFixedPhaseMarkers = () => ({}),
    hasUsableCampaignNodes = (campaign) => Array.isArray(campaign?.nodes) && campaign.nodes.length > 0,
    canUseOverviewFallbackData = (mode = 'debug') => mode !== 'host'
} = OVERVIEW_CORE;
const OVERVIEW_STATE_API = (typeof window !== 'undefined' && window.ACE0OverviewState && typeof window.ACE0OverviewState === 'object')
    ? window.ACE0OverviewState
    : null;
const OVERVIEW_STATE = OVERVIEW_STATE_API && typeof OVERVIEW_STATE_API.create === 'function'
    ? OVERVIEW_STATE_API.create(OVERVIEW_CORE)
    : null;
if (!OVERVIEW_STATE) {
    throw new Error('ACE0OverviewState is required before overview/index.js');
}
const {
    appData,
    appState,
    INITIAL_RESOURCES,
    selectionState,
    syncState,
    assetCommandState,
    adapterState,
    constants: OVERVIEW_CONSTANTS
} = OVERVIEW_STATE;
const {
    WORLD_CLOCK_PHASES,
    DEFAULT_WORLD_CLOCK,
    WORLD_LOCATION_LAYERS,
    WORLD_LOCATION_LAYER_LABELS,
    ENCOUNTER_DEBUG_TAG_OPTIONS,
    ENCOUNTER_DEBUG_FLAG_OPTIONS,
    ENCOUNTER_REASON_LABELS,
    DASHBOARD_HERO_CODE_BY_KEY,
    RESOURCE_KEYS,
    RESOURCE_ALIASES,
    RESOURCE_TYPE_MAP,
    RESOURCE_LABEL_MAP,
    PLANNER_PAGE_KEYS,
    PLANNER_PAGE_META,
    REST_CONTROL_TINT_KEYS,
    ENCOUNTER_DEBUG_CHARACTER_KEYS,
    PHASE_SLOT_IDS,
    ACT_MESSAGE_TYPES,
    ACT_OUTBOUND_MESSAGE_TYPES,
    ACT_INBOUND_MESSAGE_TYPES,
    DASHBOARD_DEBUG_STORAGE_KEY,
    DASHBOARD_DEBUG_GLOBAL_PAYLOAD_KEY,
    DASHBOARD_DEBUG_GLOBAL_SNAPSHOT_KEY,
    DASHBOARD_DEBUG_GLOBAL_ACT_STATE_KEY
} = OVERVIEW_CONSTANTS;

// Runtime module accessors: overview/index.js bridges script-loaded modules into UI state.
function getOverviewGlobalApi(globalKey) {
    const api = typeof window !== 'undefined' && typeof globalKey === 'string' ? window[globalKey] : null;
    return api && typeof api === 'object' ? api : null;
}

function createOverviewGlobalModule(globalKey, ctx, options = {}) {
    const { required = true } = options;
    const api = getOverviewGlobalApi(globalKey);
    if (!api || typeof api.create !== 'function') {
        if (required) throw new Error(`${globalKey} is required before overview/index.js`);
        return null;
    }
    return api.create(ctx);
}

function getOverviewCampaignRuntimeApi() {
    return getOverviewGlobalApi('ACE0OverviewCampaignRuntime');
}

function getOverviewPlannerRuntimeApi() {
    return getOverviewGlobalApi('ACE0OverviewPlannerRuntime');
}

function getOverviewExecutionRuntimeApi() {
    return getOverviewGlobalApi('ACE0OverviewExecutionRuntime');
}

function createRuntimeSeed() {
    const timeToken = Date.now().toString(36).toUpperCase();
    const randToken = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `DEMO-${timeToken}-${randToken}`;
}

// Context builders keep sibling runtime modules stateless and browser-debug friendly.
function createCampaignRuntimeContext() {
    return {
        campaignNodes: getCampaignNodes(),
        campaignTotalNodes: getCampaignTotalNodes(),
        currentNodeIndex: appState.currentNodeIndex,
        currentNodeId: appState.currentNodeId,
        routeHistory: [...appState.routeHistory],
        frontendSnapshot: appData.runtime.frontendSnapshot || null,
        resourceLabelMap: RESOURCE_LABEL_MAP,
        resourceTypeMap: RESOURCE_TYPE_MAP,
        normalizeResourceKey,
        hasFixedPhaseMarkers(nodeId) {
            return Object.keys(getFixedPhaseMarkers(nodeId)).length > 0;
        },
        getDefaultLimitedRewardsForNode
    };
}

function createPlannerRuntimeContext() {
    return {
        appState,
        plannerPhases: appData.planner.phases,
        phaseSlotIds: PHASE_SLOT_IDS,
        resourceKeys: RESOURCE_KEYS,
        areProgressionControlsEnabled,
        canUseNodeAdvanceControl,
        canUsePhaseAdvanceControl,
        getCampaignRules,
        getCampaignReserveGrowthByNode,
        getCurrentNodeData,
        getFixedPhaseKind,
        getCurrentVisionFixedPhasePrompt,
        getNodeTemplate,
        getSelectableNodeIds,
        getDefaultPresentNodeId,
        normalizeResourceKey,
        resourceTypeMap: RESOURCE_TYPE_MAP,
        setCurrentFocusNodeId(nextNodeId) {
            setMapFocusNodeId(nextNodeId);
        }
    };
}

function createExecutionRuntimeContext() {
    return {
        appState,
        plannerPhases: appData.planner.phases,
        areProgressionControlsEnabled,
        canAdvanceCurrentPhase,
        canExecuteCurrentNode,
        getCampaignTotalNodes,
        getCurrentNodeData,
        getRouteOptions,
        getFixedPhaseKind,
        getCurrentVisionFixedPhasePrompt,
        getReadyVisionReplacementForPhase,
        consumeReadyVisionReplacementLocally,
        shouldGrantReserveGrowthAtEndOfNode,
        grantDailyReserveGrowth,
        clearPendingLimitedTokens,
        resetPhaseSlots,
        startNode,
        markActStateDirty,
        commitActStateToHost,
        refreshAllUI,
        resetSelection,
        isRouteSelectionActive
    };
}

    function applyOverviewFallbackCampaignProfile(mode = adapterState.mode, options = {}) {
        const { preserveSeed = true, preserveGeneratedNodes = hasUsableCampaignNodes(appData.campaign) } = options;
        const previousCampaign = appData.campaign && typeof appData.campaign === 'object' ? appData.campaign : {};
        const nextCampaign = getOverviewFallbackCampaign(mode);
        if (preserveSeed && typeof previousCampaign.seed === 'string' && previousCampaign.seed.trim()) {
            nextCampaign.seed = previousCampaign.seed.trim();
        }
        if (
            preserveGeneratedNodes
            && hasUsableCampaignNodes(previousCampaign)
            && !hasUsableCampaignNodes(nextCampaign)
        ) {
            nextCampaign.nodes = deepCloneValue(previousCampaign.nodes);
            nextCampaign.totalNodes = Math.max(
                1,
                Math.round(Number(previousCampaign.totalNodes) || previousCampaign.nodes.length || nextCampaign.totalNodes || 1)
            );
            if (previousCampaign.rules && typeof previousCampaign.rules === 'object') {
                nextCampaign.rules = deepCloneValue(previousCampaign.rules);
            }
            if (Array.isArray(previousCampaign.reserveGrowthByNode)) {
                nextCampaign.reserveGrowthByNode = deepCloneValue(previousCampaign.reserveGrowthByNode);
            }
        }
        appData.campaign = nextCampaign;
        return appData.campaign;
    }

    function deepCloneValue(value) {
        if (value == null) return value;
        return JSON.parse(JSON.stringify(value));
    }

    function getSearchParams() {
        try {
            return new URLSearchParams(window.location.search || '');
        } catch (_) {
            return new URLSearchParams('');
        }
    }

    function isTruthyQueryValue(value) {
        const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
        return ['1', 'true', 'yes', 'on', 'debug'].includes(normalized);
    }

    let overviewDashboardRuntime = null;
    let overviewAssetAdapter = null;

    function getOverviewAssetAdapter() {
        if (!overviewAssetAdapter) {
            overviewAssetAdapter = createOverviewGlobalModule('ACE0OverviewAssetAdapter', {
                adapterState,
                appData,
                appState,
                syncState,
                assetCommandState,
                ACT_OUTBOUND_MESSAGE_TYPES,
                buildInitialDebugPayload,
                buildNormalizedDashboardPayload,
                applyActStateFromPayload,
                deepCloneValue,
                extractWorldPayload,
                getCommitIdleStatusText,
                getCurrentWorldPayload,
                isOverviewDebugMode,
                postActMessageToHost,
                refreshPlannerUI,
                resolveDirectAssetDeckCommandBridge,
                setPlannerPage,
                updateWorldPayloadAndCommit
            });
        }
        return overviewAssetAdapter;
    }

    let overviewDebugController = null;

    function getOverviewDebugController() {
        if (!overviewDebugController) {
            overviewDebugController = createOverviewGlobalModule('ACE0OverviewDebugController', {
                adapterState,
                appData,
                appState,
                syncState,
                DEFAULT_DASHBOARD_CHAPTER_ID,
                PHASE_SLOT_IDS,
                advanceSinglePhase,
                applyActStateFromPayload,
                buildActStateForCommit,
                buildCurrentActStateSnapshot,
                buildInitialDebugPayload,
                buildNormalizedDashboardPayload,
                canExecuteCurrentNode,
                chooseNextRoute,
                commitActStateToHost,
                createDebugPayloadFromActState,
                createDefaultActStateForDashboard,
                deepCloneValue,
                enterNextChapterInDebug,
                extractHeroPayload,
                extractWorldPayload,
                getActModuleApi,
                getCampaignTotalNodes,
                getCurrentChapterId,
                getCurrentEncounterDebugContext,
                getCurrentNodeData,
                getCurrentVisionFixedPhasePrompt,
                getCurrentWorldLocation,
                getDebugChapterTransitionOption,
                getDefaultPresentNodeId,
                getNodeRuntimeEntry,
                getNodeTemplate,
                getRouteOptions,
                isOverviewDebugMode,
                markActStateDirty,
                normalizeEncounterDebugContext,
                normalizeResourceKey,
                normalizeWorldLocation,
                normalizeWorldLocationLayer,
                refreshAllUI,
                settlePendingActAssetDeckCommandsForDashboardWorld,
                startNode,
                updateActStatePayloadAndCommit,
                updateWorldPayloadAndCommit,
                writeStoredDebugPayload
            });
        }
        return overviewDebugController;
    }

    function getOverviewDashboardRuntime() {
        if (!overviewDashboardRuntime) {
            overviewDashboardRuntime = createOverviewGlobalModule('ACE0OverviewDashboardAdapter', {
                adapterState,
                appData,
                appState,
                DASHBOARD_DEBUG_STORAGE_KEY,
                DASHBOARD_DEBUG_GLOBAL_PAYLOAD_KEY,
                DASHBOARD_DEBUG_GLOBAL_SNAPSHOT_KEY,
                DASHBOARD_DEBUG_GLOBAL_ACT_STATE_KEY,
                DEFAULT_DASHBOARD_CHAPTER_ID,
                applyOverviewFallbackCampaignProfile,
                applyActStateFromPayload,
                applyDebugUrlOverridesToActState,
                createDefaultActStateForDashboard,
                createFrontendSnapshotForActState,
                deepCloneValue,
                extractHeroPayload,
                extractWorldPayload,
                getAssetDeckModuleApi,
                getSearchParams,
                hasUsableCampaignNodes,
                isTruthyQueryValue,
                normalizeAssetDeckForDashboard,
                getCommitIdleStatusText
            });
        }
        return overviewDashboardRuntime;
    }

    function writeStoredDebugPayload(payload) {
        getOverviewDashboardRuntime().writeStoredDebugPayload(payload);
    }

    function clearStoredDebugPayload() {
        getOverviewDashboardRuntime().clearStoredDebugPayload();
    }

    function extractFrontendSnapshot(payload) {
        return getOverviewDashboardRuntime().extractFrontendSnapshot(payload);
    }

    function getActModuleApi() {
        const modules = window.ACE0Modules;
        return modules && typeof modules === 'object' && modules.act && typeof modules.act === 'object'
            ? modules.act
            : null;
    }

    function getAssetDeckModuleApi() {
        return getOverviewAssetAdapter().getAssetDeckModuleApi();
    }

    function normalizeAssetDeckForDashboard(rawAssetDeck) {
        return getOverviewAssetAdapter().normalizeAssetDeckForDashboard(rawAssetDeck);
    }

    function getCurrentAssetDeckState() {
        return getOverviewAssetAdapter().getCurrentAssetDeckState();
    }

    function getAssetPendingOfferIdentity(assetDeckInput) {
        return getOverviewAssetAdapter().getAssetPendingOfferIdentity(assetDeckInput);
    }

    function getDashboardAssetSummaryGameId() {
        return getOverviewAssetAdapter().getDashboardAssetSummaryGameId();
    }

    function getCurrentAssetDeckSummary(gameId = getDashboardAssetSummaryGameId()) {
        return getOverviewAssetAdapter().getCurrentAssetDeckSummary(gameId);
    }

    function getCurrentChapterId() {
        const snapshotChapterId = typeof adapterState.lastFrontendSnapshot?.chapterId === 'string'
            ? adapterState.lastFrontendSnapshot.chapterId.trim()
            : '';
        const configuredChapterId = typeof getOverviewConfigProfile(adapterState.mode || 'debug').chapterId === 'string'
            ? getOverviewConfigProfile(adapterState.mode || 'debug').chapterId.trim()
            : '';
        return snapshotChapterId || configuredChapterId || DEFAULT_DASHBOARD_CHAPTER_ID;
    }

    function createDefaultActStateForDashboard(chapterId = getCurrentChapterId()) {
        const actModule = getActModuleApi();
        if (actModule && typeof actModule.getDefaultActState === 'function') {
            try {
                const moduleState = actModule.getDefaultActState(chapterId);
                if (moduleState && typeof moduleState === 'object') return deepCloneValue(moduleState);
            } catch (error) {
                console.warn('[ACE0 DEBUG] Failed to read default act state from module:', error);
            }
        }

        const fallbackCampaign = getOverviewFallbackCampaign(adapterState.mode || 'debug');
        return {
            id: chapterId,
            seed: typeof appData.campaign.seed === 'string' && appData.campaign.seed.trim()
                ? appData.campaign.seed.trim()
                : fallbackCampaign.seed,
            nodeIndex: 1,
            route_history: [],
            limited: createEmptyActResourceCounts(0),
            reserve: createEmptyActResourceCounts(0),
            reserve_progress: createEmptyActResourceCounts(0),
            income_rate: createEmptyActResourceCounts(0.2),
            income_progress: createEmptyActResourceCounts(0),
            phase_slots: [null, null, null, null],
            phase_index: 0,
            stage: 'executing',
            phase_advance: 0,
            controlledNodes: {},
            vision: { baseSight: 1, bonusSight: 0, jumpReady: false, pendingReplace: null },
            resourceSpent: createEmptyActResourceCounts(0),
            characterEncounter: {},
            pendingResolutions: [],
            pendingAssetDeckCommands: [],
            resolutionHistory: []
        };
    }

    function mergePlainObjects(base, patch) {
        if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return deepCloneValue(patch);
        const output = Array.isArray(base) ? [...base] : { ...(base || {}) };
        Object.entries(patch).forEach(([key, value]) => {
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                output[key] = mergePlainObjects(output[key], value);
                return;
            }
            output[key] = deepCloneValue(value);
        });
        return output;
    }

    function applyDebugUrlOverridesToActState(actState) {
        const nextState = deepCloneValue(actState);
        const params = getSearchParams();
        const seed = params.get('seed');
        const route = params.get('route');
        const nodeId = params.get('node');
        const nodeIndex = Number(params.get("nodeIndex"));
        const phase = Number(params.get('phase'));
        const stage = params.get('stage');

        if (typeof seed === 'string' && seed.trim()) {
            nextState.seed = seed.trim();
            appData.campaign.seed = nextState.seed;
        }

        if (Array.isArray(nextState.route_history)) {
            if (typeof route === 'string' && route.trim()) {
                nextState.route_history = route.split(',').map((value) => value.trim()).filter(Boolean);
            } else if (typeof nodeId === 'string' && nodeId.trim()) {
                nextState.route_history[Math.max(0, Math.round(Number(nextState.nodeIndex) || 1) - 1)] = nodeId.trim();
            }
        }

        if (Number.isFinite(nodeIndex) && nodeIndex > 0) {
            nextState.nodeIndex = Math.max(1, Math.round(nodeIndex));
        }
        if (Number.isFinite(phase)) {
            nextState.phase_index = Math.max(0, Math.min(PHASE_SLOT_IDS.length, Math.round(phase)));
        }
        if (typeof stage === 'string' && stage.trim()) {
            nextState.stage = normalizeActStage(stage);
        }

        if (!Array.isArray(nextState.route_history) || !nextState.route_history.length) {
            nextState.route_history = ['node1'];
        }

        return nextState;
    }

    function createFrontendSnapshotForActState(actState) {
        const actModule = getActModuleApi();
        if (!actModule || typeof actModule.createFrontendSnapshot !== 'function') return null;
        try {
            return deepCloneValue(actModule.createFrontendSnapshot({ actState }));
        } catch (error) {
            console.warn('[ACE0 DEBUG] Failed to create frontend snapshot from module:', error);
            return null;
        }
    }

    function buildNormalizedDashboardPayload(sourcePayload = {}, options = {}) {
        return getOverviewDashboardRuntime().buildNormalizedDashboardPayload(sourcePayload, options);
    }

    function createDebugPayloadFromActState(actState) {
        return getOverviewDashboardRuntime().createDebugPayloadFromActState(actState);
    }

    function buildInitialDebugPayload() {
        return getOverviewDashboardRuntime().buildInitialDebugPayload();
    }

    function normalizeHostPayload(payload) {
        return getOverviewDashboardRuntime().normalizeHostPayload(payload);
    }

    function normalizePendingAssetDeckCommandsForDashboard(actState) {
        return getOverviewDashboardRuntime().normalizePendingAssetDeckCommandsForDashboard(actState);
    }

    function settlePendingActAssetDeckCommandsForDashboardWorld(worldInput) {
        return getOverviewDashboardRuntime().settlePendingActAssetDeckCommandsForDashboardWorld(worldInput);
    }

    function ensureDashboardAdapter() {
        return getOverviewDashboardRuntime().ensureDashboardAdapter();
    }

    function switchDashboardAdapter(mode) {
        return getOverviewDashboardRuntime().switchDashboardAdapter(mode);
    }

    function getProgressionConfig() {
        return appData.runtime?.progression ?? {};
    }

    function areProgressionControlsEnabled() {
        return getProgressionConfig().enabled === true;
    }

    function isOverviewDebugMode() {
        return adapterState.mode === 'debug';
    }

    function getAdapterModeLabel() {
        return isOverviewDebugMode() ? 'DEBUG LOCAL' : 'HOST MVU';
    }

    function getCommitIdleStatusText() {
        return isOverviewDebugMode() ? 'SAVED TO LOCAL DEBUG' : 'SYNCED TO MVU';
    }

    function getCommitSavingStatusText() {
        return isOverviewDebugMode() ? 'SAVING LOCAL DEBUG...' : 'SYNCING TO MVU...';
    }

    function canUseInteractivePlannerControls() {
        // host 模式下亦允许交互——commit 通过 ACE0_ACT_COMMIT 写回 MVU。
        // 仅受 progression.enabled 与具体 allow* 开关约束。
        return areProgressionControlsEnabled();
    }

    function canOpenPlannerDrawer() {
        return areProgressionControlsEnabled();
    }

    function canUseRouteSelection() {
        return getProgressionConfig().allowRouteSelection === true;
    }

    function canUsePhaseAdvanceControl() {
        return getProgressionConfig().allowPhaseAdvance === true;
    }

    function canUseNodeAdvanceControl() {
        return getProgressionConfig().allowNodeAdvance === true;
    }

    function shouldShowSeedChip() {
        // SEED 芯片（AUTO-DEMO 等）只在 debug 模式显示；host 模式里它没意义。
        return isOverviewDebugMode() && getProgressionConfig().showSeedChip === true;
    }

    function shouldShowGenerationTags() {
        return getProgressionConfig().showGenerationTags === true;
    }

    function shouldShowMapProgressMeta() {
        return getProgressionConfig().showMapProgressMeta === true;
    }

    // Host/debug adapter and snapshot bridge.
    function createEmptyActResourceCounts(defaultValue = 0) {
        return Object.fromEntries(RESOURCE_KEYS.map((key) => [key, defaultValue]));
    }

    function extractHeroPayload(payload) {
        if (!payload || typeof payload !== 'object') return null;
        if (payload.hero && typeof payload.hero === 'object') return payload.hero;
        if (payload.stat_data?.hero && typeof payload.stat_data.hero === 'object') return payload.stat_data.hero;
        if (payload.data?.hero && typeof payload.data.hero === 'object') return payload.data.hero;
        if (payload.data?.stat_data?.hero && typeof payload.data.stat_data.hero === 'object') return payload.data.stat_data.hero;
        return null;
    }

    function extractWorldPayload(payload) {
        if (!payload || typeof payload !== 'object') return null;
        if (payload.world && typeof payload.world === 'object') return payload.world;
        if (payload.stat_data?.world && typeof payload.stat_data.world === 'object') return payload.stat_data.world;
        if (payload.data?.world && typeof payload.data.world === 'object') return payload.data.world;
        if (payload.data?.stat_data?.world && typeof payload.data.stat_data.world === 'object') return payload.data.stat_data.world;
        return null;
    }

    function normalizeActResourceCounts(raw, options = {}) {
        const { allowDecimal = false } = options;
        const counts = Object.fromEntries(RESOURCE_KEYS.map((key) => [key, 0]));
        const source = raw && typeof raw === 'object' ? raw : {};
        Object.entries(source).forEach(([rawKey, rawValue]) => {
            const normalizedKey = typeof rawKey === 'string' ? rawKey.trim().toLowerCase() : '';
            const key = RESOURCE_ALIASES[normalizedKey] || normalizedKey;
            if (!RESOURCE_KEYS.includes(key)) return;
            const value = Number(rawValue);
            const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0;
            counts[key] += allowDecimal ? safeValue : Math.max(0, Math.round(safeValue));
        });
        return counts;
    }

    function normalizeResourceKey(value, fallback = 'vision') {
        const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
        const migrated = RESOURCE_ALIASES[raw] || raw;
        return RESOURCE_KEYS.includes(migrated) ? migrated : fallback;
    }

    function normalizeIncomeRateCounts(raw) {
        const source = raw && typeof raw === 'object' ? raw : {};
        const counts = Object.fromEntries(RESOURCE_KEYS.map((key) => [key, 0.2]));
        Object.entries(source).forEach(([rawKey, rawValue]) => {
            const key = normalizeResourceKey(rawKey, '');
            if (!key) return;
            const value = Number(rawValue);
            counts[key] = Number.isFinite(value) ? Math.max(0, Math.min(1.5, value)) : 0;
        });
        return counts;
    }

    function normalizeWorldClock(rawClock) {
        const dayValue = Math.max(1, Math.round(Number(rawClock?.day) || DEFAULT_WORLD_CLOCK.day));
        const phaseValue = typeof rawClock?.phase === 'string' ? rawClock.phase.trim().toUpperCase() : '';
        return {
            day: dayValue,
            phase: WORLD_CLOCK_PHASES.includes(phaseValue) ? phaseValue : DEFAULT_WORLD_CLOCK.phase
        };
    }

    function formatCompactResourceValue(value) {
        const numericValue = Number(value);
        if (!Number.isFinite(numericValue)) return '0';
        const absValue = Math.abs(numericValue);
        if (absValue >= 1000000000) return `${Math.round((numericValue / 1000000000) * 100) / 100}b`;
        if (absValue >= 1000000) return `${Math.round((numericValue / 1000000) * 100) / 100}m`;
        if (absValue >= 1000) return `${Math.round((numericValue / 1000) * 100) / 100}k`;
        return `${Math.round(numericValue * 100) / 100}`;
    }

    function normalizeRestTintKey(value, fallback = 'neutral') {
        const normalized = normalizeResourceKey(value, '');
        if (RESOURCE_KEYS.includes(normalized)) return normalized;
        return fallback === 'neutral' ? 'neutral' : '';
    }

    function getRestTintLabel(tintKey) {
        const normalized = normalizeRestTintKey(tintKey, 'neutral');
        if (normalized === 'neutral') return 'NEUTRAL';
        return RESOURCE_TYPE_MAP[normalized] || 'NEUTRAL';
    }

    function getRestTintSource(value) {
        if (value === 'reserve') return 'reserve';
        if (value === 'limited') return 'limited';
        return '';
    }

    function normalizeActPhaseSlots(rawSlots) {
        return Object.fromEntries(PHASE_SLOT_IDS.map((slotId, index) => {
            const slot = Array.isArray(rawSlots) ? rawSlots[index] : null;
            if (!slot) return [slotId, null];
            if (typeof slot === 'string') {
                const stringKey = normalizeResourceKey(slot, '');
                if (stringKey) return [slotId, { key: stringKey, type: RESOURCE_TYPE_MAP[stringKey], source: 'limited', amount: 1, sources: ['limited'] }];
            }

            const key = normalizeResourceKey(slot?.key, '');
            const source = slot?.source === 'reserve' ? 'reserve' : 'limited';
            const amount = Math.max(1, Math.min(3, Math.round(Number(slot?.amount) || 1)));
            const rawSources = Array.isArray(slot?.sources) && slot.sources.length
                ? slot.sources
                : Array.from({ length: amount }, () => source);
            const sources = rawSources
                .slice(0, amount)
                .map((item) => item === 'reserve' ? 'reserve' : 'limited');
            while (sources.length < amount) sources.push(source);
            if (!key) return [slotId, null];
            const token = { key, type: RESOURCE_TYPE_MAP[key], source, amount, sources };
            const tint = normalizeRestTintKey(slot?.tint || slot?.controlType || slot?.targetKey, '');
            const tintSource = getRestTintSource(slot?.tintSource);
            if (key === 'rest' && tint) {
                token.tint = tint;
                if (tintSource) token.tintSource = tintSource;
            }
            return [slotId, token];
        }));
    }

    function normalizeActStage(value) {
        const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
        if (['planning', 'executing', 'route', 'complete'].includes(normalized)) return normalized;
        return 'planning';
    }

    function normalizeWorldLocationLayer(value, fallback = 'THE_STREET') {
        const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
        return WORLD_LOCATION_LAYERS.includes(normalized) ? normalized : fallback;
    }

    function normalizeWorldLocation(rawLocation) {
        const source = rawLocation && typeof rawLocation === 'object' ? rawLocation : {};
        return {
            layer: normalizeWorldLocationLayer(source.layer),
            site: typeof source.site === 'string' ? source.site.trim() : '',
            tags: Array.isArray(source.tags)
                ? source.tags.map((tag) => typeof tag === 'string' ? tag.trim().toLowerCase() : '').filter(Boolean)
                : []
        };
    }

    function normalizeEncounterDebugTags(value) {
        const allowed = new Set(ENCOUNTER_DEBUG_TAG_OPTIONS.map((option) => option.key));
        const raw = Array.isArray(value) ? value : [];
        return raw
            .map((tag) => typeof tag === 'string' ? tag.trim().toLowerCase() : '')
            .filter((tag, index, list) => tag && allowed.has(tag) && list.indexOf(tag) === index);
    }

    function normalizeEncounterDebugFlags(value) {
        const allowed = new Set(ENCOUNTER_DEBUG_FLAG_OPTIONS.map((option) => option.key));
        const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
        return ENCOUNTER_DEBUG_FLAG_OPTIONS.reduce((result, option) => {
            result[option.key] = source[option.key] === true && allowed.has(option.key);
            return result;
        }, {});
    }

    function normalizeEncounterDebugContext(rawContext, actState = null) {
        const source = rawContext && typeof rawContext === 'object' ? rawContext : {};
        return {
            tags: normalizeEncounterDebugTags(source.tags),
            storyFlags: normalizeEncounterDebugFlags(source.storyFlags),
            funds: Math.max(0, Math.round(Number(source.funds ?? appState.resources.funds) || 0))
        };
    }

    function getCurrentEncounterDebugContext() {
        const world = getCurrentWorldPayload();
        const actState = world?.act && typeof world.act === 'object' ? world.act : buildCurrentActStateSnapshot();
        return normalizeEncounterDebugContext(world?.encounterContext, actState);
    }

    function getCurrentWorldPayload() {
        const payloadWorld = extractWorldPayload(adapterState.lastPayload);
        return payloadWorld && typeof payloadWorld === 'object' ? payloadWorld : {};
    }

    function getCurrentWorldLocation() {
        return normalizeWorldLocation(getCurrentWorldPayload().location);
    }

    function getWorldLocationLayerLabel(layer) {
        const normalizedLayer = normalizeWorldLocationLayer(layer);
        return WORLD_LOCATION_LAYER_LABELS[normalizedLayer] || normalizedLayer;
    }

    function syncHeroResourcesFromPayload(payload) {
        const hero = extractHeroPayload(payload);
        if (!hero) return;

        if (Number.isFinite(Number(hero.funds))) {
            appState.resources.funds = Math.round(Number(hero.funds) * 100) / 100;
        }

        if (Number.isFinite(Number(hero.assets))) {
            appState.resources.assets = Math.round(Number(hero.assets) * 100) / 100;
        }

        if (Number.isFinite(Number(hero.debt))) {
            appState.resources.debt = Math.round(Number(hero.debt) * 100) / 100;
        }

        if (Number.isFinite(Number(hero.majorDebt))) {
            appState.resources.majorDebt = Math.round(Number(hero.majorDebt) * 100) / 100;
        }

        const heroRoster = hero.roster && typeof hero.roster === 'object' ? hero.roster : {};
        const heroCast = hero.cast && typeof hero.cast === 'object' ? hero.cast : {};
        const partyManaNode = Object.entries(heroRoster)
            .map(([key, node]) => ({ key, node }))
            .find(({ key, node }) => (
                node
                && typeof node === 'object'
                && Number(node.maxMana) > 0
                && (key === 'KAZU' || heroCast[key]?.inParty === true)
            ));
        const heroNode = partyManaNode?.node
            || (heroRoster.KAZU && typeof heroRoster.KAZU === 'object'
                ? heroRoster.KAZU
                : (hero.KAZU && typeof hero.KAZU === 'object' ? hero.KAZU : null));

        if (heroNode && Number.isFinite(Number(heroNode.mana))) {
            appState.resources.mana = Math.max(0, Math.round(Number(heroNode.mana)));
        }
    }

    function getDefaultDashboardCharacterState(characterKey) {
        const key = typeof characterKey === 'string' ? characterKey.trim().toLowerCase() : '';
        const isKnownByDefault = key === 'kazu' || key === 'rino';
        return {
            activated: true,
            introduced: isKnownByDefault,
            present: isKnownByDefault,
            inParty: isKnownByDefault
        };
    }

    function getEncounterDashboardStateFromPayload(payload, heroCode) {
        const world = extractWorldPayload(payload);
        const act = world?.act && typeof world.act === 'object' ? world.act : null;
        const encounter = act?.characterEncounter && typeof act.characterEncounter === 'object'
            ? act.characterEncounter
            : null;
        const encounterChar = encounter?.characters?.[heroCode];
        if (!encounterChar || typeof encounterChar !== 'object') return null;

        const routeHistory = Array.isArray(act.route_history) ? act.route_history : [];
        const nodeIndex = Math.max(1, Math.round(Number(act.nodeIndex) || 1));
        const currentNodeId = routeHistory[nodeIndex - 1] || routeHistory[routeHistory.length - 1] || '';
        const introducedNodeId = typeof encounterChar.introducedNodeId === 'string' ? encounterChar.introducedNodeId : '';
        const isIntroduced = encounterChar.firstMeetDone === true
            || encounterChar.status === 'introduced'
            || encounterChar.status === 'first_meet';
        if (!isIntroduced) return null;

        return {
            activated: true,
            introduced: true,
            present: encounterChar.status === 'first_meet'
                || (introducedNodeId && introducedNodeId === currentNodeId),
            inParty: false
        };
    }

    function syncDashboardCharactersFromHeroPayload(payload) {
        const hero = extractHeroPayload(payload);
        const registry = window.dashboardCharacters && typeof window.dashboardCharacters === 'object'
            ? window.dashboardCharacters
            : null;
        if (!registry) return;

        const cast = hero?.cast && typeof hero.cast === 'object' ? hero.cast : {};
        Object.entries(registry).forEach(([dashboardKey, character]) => {
            if (!character || typeof character !== 'object') return;
            const key = typeof dashboardKey === 'string' ? dashboardKey.trim().toLowerCase() : '';
            const heroCode = DASHBOARD_HERO_CODE_BY_KEY[key] || key.toUpperCase();
            const castNode = cast[heroCode] && typeof cast[heroCode] === 'object' ? cast[heroCode] : null;
            const encounterState = getEncounterDashboardStateFromPayload(payload, heroCode);
            character.dashboardState = {
                ...getDefaultDashboardCharacterState(key),
                ...(encounterState || {}),
                ...(castNode ? {
                    activated: true,
                    introduced: castNode.introduced === true,
                    present: castNode.present === true,
                    inParty: castNode.inParty === true
                } : {})
            };
        });
    }

    function notifyDashboardCharactersSynced(payload) {
        try {
            window.dispatchEvent(new CustomEvent('acezero:dashboard-characters-synced', {
                detail: { payload }
            }));
        } catch (_) {}
    }

    function applyFrontendSnapshotToDashboard(frontendSnapshot, actState) {
        if (!frontendSnapshot || typeof frontendSnapshot !== 'object') return false;
        if (frontendSnapshot.campaign && typeof frontendSnapshot.campaign === 'object') {
            appData.campaign = deepCloneValue(frontendSnapshot.campaign);
        } else if (Array.isArray(frontendSnapshot.nodes)) {
            appData.campaign.nodes = deepCloneValue(frontendSnapshot.nodes);
        }

        if (typeof frontendSnapshot.totalNodes === 'number' && frontendSnapshot.totalNodes > 0) {
            appData.campaign.totalNodes = Math.max(1, Math.round(frontendSnapshot.totalNodes));
        }

        const chapterTitle = typeof frontendSnapshot.chapterMeta?.title === 'string'
            ? frontendSnapshot.chapterMeta.title.trim()
            : '';
        if (chapterTitle) {
            appData.sidebar.branches = [
                {
                    title: chapterTitle,
                    icon: '[-]',
                    state: 'is-active'
                }
            ];
        }

        if (typeof appData.campaign.seed !== 'string' || !appData.campaign.seed.trim()) {
            appData.campaign.seed = typeof actState?.seed === 'string' && actState.seed.trim()
                ? actState.seed.trim()
                : appData.campaign.seed;
        }

        return true;
    }

    function seedCampaignFallbackIfNeeded() {
        if (!canUseOverviewFallbackData(adapterState.mode)) {
            applyOverviewFallbackCampaignProfile('host', { preserveSeed: false });
            return false;
        }
        if (!appData.campaign || typeof appData.campaign !== 'object') {
            applyOverviewFallbackCampaignProfile(adapterState.mode, { preserveSeed: false });
        }
        if (appData.campaign.seed === 'AUTO-DEMO') {
            appData.campaign.seed = createRuntimeSeed();
        }
        const snapshot = primeCampaignFromActState(createDefaultActStateForDashboard(getCurrentChapterId()), {
            persistSnapshot: true
        });
        return Boolean(snapshot);
    }

    function primeCampaignFromActState(actState, options = {}) {
        const { persistSnapshot = false } = options;
        const normalizedPayload = buildNormalizedDashboardPayload({}, {
            hero: {
                funds: appState.resources.funds,
                roster: {
                    KAZU: {
                        mana: appState.resources.mana
                    }
                }
            },
            actState
        });
        const snapshot = extractFrontendSnapshot(normalizedPayload);
        if (snapshot && applyFrontendSnapshotToDashboard(snapshot, actState)) {
            if (persistSnapshot) {
                adapterState.lastFrontendSnapshot = deepCloneValue(snapshot);
                appData.runtime.frontendSnapshot = adapterState.lastFrontendSnapshot;
            }
            return snapshot;
        }

        return null;
    }

    function applyActStateFromPayload(payload) {
        const previousDrawerOpen = appState.drawerOpen;
        const previousPayload = adapterState.lastPayload;
        const previousOfferIdentity = getAssetPendingOfferIdentity(extractWorldPayload(previousPayload)?.assetDeck);
        const normalizedPayload = buildNormalizedDashboardPayload(payload);
        const world = extractWorldPayload(normalizedPayload);
        const actState = world?.act;
        const frontendSnapshot = extractFrontendSnapshot(normalizedPayload);
        const nextOfferIdentity = getAssetPendingOfferIdentity(world?.assetDeck);

        syncHeroResourcesFromPayload(normalizedPayload);
        syncDashboardCharactersFromHeroPayload(normalizedPayload);
        notifyDashboardCharactersSynced(normalizedPayload);
        if (!actState || typeof actState !== 'object') return false;
        adapterState.lastPayload = deepCloneValue(normalizedPayload);
        if (frontendSnapshot && typeof frontendSnapshot === 'object') {
            adapterState.lastFrontendSnapshot = deepCloneValue(frontendSnapshot);
            appData.runtime.frontendSnapshot = adapterState.lastFrontendSnapshot;
        }
        const appliedSnapshot = applyFrontendSnapshotToDashboard(frontendSnapshot, actState);

        const seed = typeof actState.seed === 'string' && actState.seed.trim()
            ? actState.seed.trim()
            : appData.campaign.seed;
        if (!appliedSnapshot && canUseOverviewFallbackData(adapterState.mode) && (seed !== appData.campaign.seed || !Array.isArray(appData.campaign.nodes) || !appData.campaign.nodes.length)) {
            appData.campaign.seed = seed;
            primeCampaignFromActState(actState, { persistSnapshot: true });
        } else if (!appliedSnapshot && !canUseOverviewFallbackData(adapterState.mode)) {
            console.warn('[ACE0 Dashboard] Host payload missing frontendSnapshot. Overview will not fall back to local chapter config.');
            appData.campaign.seed = seed;
        }

        const totalNodes = getCampaignTotalNodes();
        const currentNodeIndex = Math.max(1, Math.min(totalNodes, Math.round(Number(actState.nodeIndex) || 1)));
        const firstNodeId = getDefaultPresentNodeId(getNodeTemplate(1)) || 'node1';
        const routeHistory = Array.isArray(actState.route_history)
            ? actState.route_history.map((value) => typeof value === 'string' ? value.trim() : '').filter(Boolean)
            : [];
        if (!routeHistory.length) {
            routeHistory.push(firstNodeId);
        }

        const currentNodeDefaultNodeId = getDefaultPresentNodeId(getNodeTemplate(currentNodeIndex)) || routeHistory[routeHistory.length - 1] || firstNodeId;
        const currentNodeId = routeHistory[currentNodeIndex - 1] || currentNodeDefaultNodeId;
        const stage = normalizeActStage(actState.stage);
        const phaseIndexValue = Math.max(0, Math.min(PHASE_SLOT_IDS.length, Math.round(Number(actState.phase_index) || 0)));

        appState.currentNodeIndex = currentNodeIndex;
        appState.currentNodeId = currentNodeId;
        appState.currentPhaseIndex = stage === 'route' || stage === 'complete'
            ? PHASE_SLOT_IDS.length
            : phaseIndexValue;
        appState.worldClock = normalizeWorldClock(world?.current_time);
        // MVU 的 stage='executing' 仅表示当前不在 route/complete，
        // 不等于前端正在播放自动执行动画。否则第二天刚进入时会被误锁按钮。
        appState.executing = false;
        appState.drawerOpen = canOpenPlannerDrawer() ? previousDrawerOpen : false;
        appState.awaitingRouteChoice = stage === 'route';
        appState.routeHistory = routeHistory;
        appState.reserveProgress = normalizeActResourceCounts(actState.reserve_progress, { allowDecimal: true });
        appState.incomeRate = normalizeIncomeRateCounts(actState.income_rate);
        appState.incomeProgress = normalizeActResourceCounts(actState.income_progress, { allowDecimal: true });
        appState.inventory = Object.fromEntries(RESOURCE_KEYS.map((key) => [key, {
            limited: normalizeActResourceCounts(actState.limited)[key],
            reserve: normalizeActResourceCounts(actState.reserve)[key]
        }]));
        appState.phaseSlots = normalizeActPhaseSlots(actState.phase_slots);
        if (nextOfferIdentity && nextOfferIdentity !== previousOfferIdentity && canOpenPlannerDrawer()) {
            appState.drawerOpen = true;
            setPlannerPage('asset');
        }
        syncState.dirty = false;
        syncState.saving = false;
        syncState.pendingRequestId = '';
        syncState.statusText = getCommitIdleStatusText();
        syncState.errorText = '';
        if (syncState.pendingTimer) {
            window.clearTimeout(syncState.pendingTimer);
            syncState.pendingTimer = null;
        }

        if (stage === 'route' || stage === 'complete') {
            resetSelection();
            appState.drawerOpen = false;
        }
        refreshAllUI();
        return true;
    }

    function markActStateDirty() {
        syncState.dirty = true;
        syncState.saving = false;
        syncState.statusText = 'UNSAVED CHANGES';
        syncState.errorText = '';
        if (syncState.pendingTimer) {
            window.clearTimeout(syncState.pendingTimer);
            syncState.pendingTimer = null;
        }
        // 自动提交：排点数后 300ms 无新改动即回写 MVU，无需再按 CONFIRM。
        if (syncState.autoCommitTimer) {
            window.clearTimeout(syncState.autoCommitTimer);
        }
        syncState.autoCommitTimer = window.setTimeout(() => {
            syncState.autoCommitTimer = null;
            if (syncState.dirty && !syncState.saving) {
                commitActStateToHost();
            }
        }, 300);
    }

    function serializeActPhaseSlots() {
        return appData.planner.phases.map((phase) => {
            const token = appState.phaseSlots[phase.slotId];
            if (!token) return null;
            const payload = {
                key: token.key,
                source: token.source === 'reserve' ? 'reserve' : 'limited',
                amount: Math.max(1, Math.min(3, Math.round(Number(token.amount) || 1))),
                sources: Array.isArray(token.sources) ? [...token.sources] : [token.source === 'reserve' ? 'reserve' : 'limited']
            };
            const tint = normalizeRestTintKey(token.tint || token.controlType || token.targetKey, '');
            const tintSource = getRestTintSource(token.tintSource);
            if (token.key === 'rest' && tint) {
                payload.tint = tint;
                if (tintSource) payload.tintSource = tintSource;
            }
            return payload;
        });
    }

    function buildActStateForCommit() {
        const currentActState = extractWorldPayload(adapterState.lastPayload)?.act || {};
        return {
            id: getCurrentChapterId(),
            seed: appData.campaign.seed,
            nodeIndex: appState.currentNodeIndex,
            route_history: [...appState.routeHistory],
            limited: Object.fromEntries(RESOURCE_KEYS.map((key) => [key, appState.inventory[key].limited])),
            reserve: Object.fromEntries(RESOURCE_KEYS.map((key) => [key, appState.inventory[key].reserve])),
            reserve_progress: Object.fromEntries(RESOURCE_KEYS.map((key) => [key, appState.reserveProgress[key]])),
            income_rate: Object.fromEntries(RESOURCE_KEYS.map((key) => [key, appState.incomeRate?.[key] ?? 0.2])),
            income_progress: Object.fromEntries(RESOURCE_KEYS.map((key) => [key, appState.incomeProgress?.[key] ?? 0])),
            phase_slots: serializeActPhaseSlots(),
            phase_index: appState.currentPhaseIndex,
            // 本章已去除 planning——非选路即执行。
            stage: appState.awaitingRouteChoice ? 'route' : 'executing',
            phase_advance: 0,
            controlledNodes: deepCloneValue(currentActState.controlledNodes || {}),
            vision: (() => {
                const vision = deepCloneValue(currentActState.vision || { baseSight: 1, bonusSight: 0, jumpReady: false, pendingReplace: null });
                const nodeDelta = appState.currentNodeIndex - Math.max(1, Math.round(Number(currentActState.nodeIndex) || 1));
                if (nodeDelta > 0) {
                    vision.bonusSight = Math.max(0, Math.round(Number(vision.bonusSight) || 0) - nodeDelta);
                    vision.jumpReady = false;
                }
                return vision;
            })(),
            resourceSpent: normalizeActResourceCounts(currentActState.resourceSpent),
            characterEncounter: deepCloneValue(currentActState.characterEncounter || {}),
            pendingResolutions: Array.isArray(currentActState.pendingResolutions)
                ? deepCloneValue(currentActState.pendingResolutions)
                : [],
            pendingAssetDeckCommands: Array.isArray(currentActState.pendingAssetDeckCommands)
                ? deepCloneValue(currentActState.pendingAssetDeckCommands)
                : [],
            resolutionHistory: Array.isArray(currentActState.resolutionHistory)
                ? deepCloneValue(currentActState.resolutionHistory)
                : []
        };
    }

    function buildWorldStateForCommit() {
        const currentWorld = getCurrentWorldPayload();
        const world = currentWorld && typeof currentWorld === 'object'
            ? deepCloneValue(currentWorld)
            : {};
        if (!isOverviewDebugMode() && Object.prototype.hasOwnProperty.call(world, 'encounterContext')) {
            delete world.encounterContext;
        }
        const encounterContext = isOverviewDebugMode()
            ? normalizeEncounterDebugContext(world.encounterContext, world.act)
            : undefined;
        return {
            ...world,
            location: getCurrentWorldLocation(),
            ...(encounterContext ? { encounterContext } : {}),
            act: buildActStateForCommit()
        };
    }

    function getCurrentActStageForDashboard() {
        if (appState.awaitingRouteChoice) return 'route';
        if (
            !appState.executing
            && appState.currentPhaseIndex >= appData.planner.phases.length
            && appState.currentNodeIndex >= getCampaignTotalNodes()
        ) {
            return 'complete';
        }
        return 'executing';
    }

    function buildCurrentActStateSnapshot() {
        return {
            ...buildActStateForCommit(),
            stage: getCurrentActStageForDashboard()
        };
    }

    function updateActStatePayloadAndCommit(updater) {
        const currentPayload = adapterState.lastPayload || buildInitialDebugPayload();
        const currentActState = extractWorldPayload(currentPayload)?.act || createDefaultActStateForDashboard();
        const nextActState = typeof updater === 'function'
            ? updater(deepCloneValue(currentActState))
            : mergePlainObjects(currentActState, updater || {});
        if (!nextActState || typeof nextActState !== 'object') return false;
        const nextPayload = buildNormalizedDashboardPayload(currentPayload, {
            actState: nextActState,
            forceActDerivedSnapshot: true
        });
        if (!nextPayload) return false;
        if (isOverviewDebugMode()) {
            writeStoredDebugPayload(nextPayload);
        }
        applyActStateFromPayload(nextPayload);
        markActStateDirty();
        commitActStateToHost();
        return true;
    }

    function updateWorldPayloadAndCommit(updater) {
        const currentPayload = adapterState.lastPayload || buildInitialDebugPayload();
        const currentWorld = extractWorldPayload(currentPayload) || {};
        const nextWorld = typeof updater === 'function'
            ? updater(deepCloneValue(currentWorld))
            : mergePlainObjects(currentWorld, updater || {});
        if (!nextWorld || typeof nextWorld !== 'object') return false;
        nextWorld.location = normalizeWorldLocation(nextWorld.location);
        const nextActState = nextWorld.act && typeof nextWorld.act === 'object'
            ? nextWorld.act
            : (currentWorld.act || createDefaultActStateForDashboard());
        const nextPayload = buildNormalizedDashboardPayload({
            ...(currentPayload || {}),
            world: nextWorld
        }, {
            actState: nextActState,
            forceActDerivedSnapshot: true
        });
        if (!nextPayload) return false;
        if (isOverviewDebugMode()) {
            writeStoredDebugPayload(nextPayload);
        }
        applyActStateFromPayload(nextPayload);
        markActStateDirty();
        commitActStateToHost();
        return true;
    }

    function applyAssetDeckCommand(command) {
        return getOverviewAssetAdapter().applyAssetDeckCommand(command);
    }

    function handleAssetDeckAction(target) {
        return getOverviewAssetAdapter().handleAssetDeckAction(target);
    }

    function getDebugChapterTransitionOption() {
        return getOverviewDebugController().getDebugChapterTransitionOption();
    }

    function enterNextChapterInDebug() {
        return getOverviewDebugController().enterNextChapterInDebug();
    }

    function postActMessageToHost(message) {
        return getOverviewDashboardRuntime().postMessageToHost(message);
    }

    function resolveDirectActCommitBridge() {
        return getOverviewDashboardRuntime().resolveDirectActCommitBridge();
    }

    function resolveDirectAssetDeckCommandBridge() {
        return getOverviewDashboardRuntime().resolveDirectAssetDeckCommandBridge();
    }

    function resolveActCommitResult(resultPayload) {
        const requestId = typeof resultPayload?.requestId === 'string' ? resultPayload.requestId : '';
        if (requestId && syncState.pendingRequestId && requestId !== syncState.pendingRequestId) return;
        if (syncState.pendingTimer) {
            window.clearTimeout(syncState.pendingTimer);
            syncState.pendingTimer = null;
        }

        syncState.pendingRequestId = '';
        syncState.saving = false;

        if (resultPayload?.ok) {
            syncState.dirty = false;
            syncState.statusText = getCommitIdleStatusText();
            syncState.errorText = '';
        } else {
            syncState.dirty = true;
            syncState.statusText = 'SYNC FAILED';
            syncState.errorText = typeof resultPayload?.error === 'string' && resultPayload.error.trim()
                ? resultPayload.error.trim()
                : 'Unknown MVU write failure.';
        }

        refreshPlannerUI();
    }

    function resolveAssetDeckCommandResult(resultPayload) {
        return getOverviewAssetAdapter().resolveAssetDeckCommandResult(resultPayload);
    }

    async function commitActStateToHost() {
        if (syncState.saving) return;
        const requestId = `act-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        const commitPayload = {
            requestId,
            world: buildWorldStateForCommit()
        };
        syncState.saving = true;
        syncState.pendingRequestId = requestId;
        syncState.statusText = getCommitSavingStatusText();
        syncState.errorText = '';
        const adapter = ensureDashboardAdapter();
        if (adapter.mode === 'debug') {
            try {
                const result = await adapter.commitActState(commitPayload);
                resolveActCommitResult(result || {
                    ok: false,
                    requestId,
                    error: 'Debug adapter returned no result.'
                });
            } catch (error) {
                resolveActCommitResult({
                    ok: false,
                    requestId,
                    error: error?.message || String(error)
                });
            }
            return;
        }
        const directBridge = resolveDirectActCommitBridge();
        if (directBridge) {
            try {
                const result = await directBridge(commitPayload);
                resolveActCommitResult(result || {
                    ok: false,
                    requestId,
                    error: 'Direct bridge returned no result.'
                });
            } catch (error) {
                resolveActCommitResult({
                    ok: false,
                    requestId,
                    error: error?.message || String(error)
                });
            }
            return;
        }
        if (syncState.pendingTimer) {
            window.clearTimeout(syncState.pendingTimer);
        }
        syncState.pendingTimer = window.setTimeout(() => {
            if (syncState.pendingRequestId !== requestId) return;
            syncState.pendingRequestId = '';
            syncState.saving = false;
            syncState.statusText = 'SYNC FAILED';
            syncState.errorText = 'No ACK from host within 4s. Bridge path: ACT -> DASHBOARD -> HOST.';
            refreshPlannerUI();
        }, 4000);
        const didDispatch = postActMessageToHost({
            type: ACT_OUTBOUND_MESSAGE_TYPES.commit,
            payload: commitPayload
        });
        if (!didDispatch) {
            if (syncState.pendingTimer) {
                window.clearTimeout(syncState.pendingTimer);
                syncState.pendingTimer = null;
            }
            syncState.pendingRequestId = '';
            syncState.saving = false;
            syncState.statusText = 'SYNC FAILED';
            syncState.errorText = 'No parent/top host window available for commit.';
        }
        refreshPlannerUI();
    }

    function handleActHostMessage(event) {
        const payload = event?.data;
        if (!payload || typeof payload !== 'object') return;
        const isActMessage = payload.type === ACT_INBOUND_MESSAGE_TYPES.commitResult
            || payload.type === ACT_INBOUND_MESSAGE_TYPES.assetCommandResult
            || ACT_MESSAGE_TYPES.has(payload.type);
        if (!isActMessage) return;
        if (payload.type === ACT_INBOUND_MESSAGE_TYPES.commitResult) {
            resolveActCommitResult(payload.payload || payload.data || payload);
            return;
        }
        if (payload.type === ACT_INBOUND_MESSAGE_TYPES.assetCommandResult) {
            resolveAssetDeckCommandResult(payload.payload || payload.data || payload);
            return;
        }

        const hostPayload = normalizeHostPayload(payload.payload || payload.data || payload);

        if (!hostPayload) {
            syncHeroResourcesFromPayload(payload.payload || payload.data || payload);
            return;
        }

        if (adapterState.mode !== 'host') switchDashboardAdapter('host');
        const didApplyActState = applyActStateFromPayload(hostPayload);
        if (!didApplyActState) {
            syncHeroResourcesFromPayload(hostPayload);
            refreshAllUI();
        }
    }

    let overviewMapView = null;
    let mapFocusNodeId = appData.map.focusNodeId;

    function getMapFocusNodeId() {
        return mapFocusNodeId;
    }

    function setMapFocusNodeId(nextNodeId) {
        if (typeof nextNodeId === 'string' && nextNodeId.trim()) {
            mapFocusNodeId = nextNodeId.trim();
        }
        if (overviewMapView && typeof overviewMapView.setFocusNodeId === 'function') {
            overviewMapView.setFocusNodeId(mapFocusNodeId);
        }
    }

    // Campaign/runtime wrappers. Real logic lives in campaign-runtime.js / planner-runtime.js / execution-runtime.js.
    function getDefaultLimitedRewardsForNode(nodeId) {
        const typeKey = getNodeTypeKey(nodeId);
        return [{
            key: typeKey,
            count: 1,
            title: `限定·${RESOURCE_LABEL_MAP[typeKey]}点`,
            sublabel: `NODE-BOUND ${RESOURCE_TYPE_MAP[typeKey]}`
        }];
    }

    function getNodeDebugLabel(nodeTemplate) {
        if (!shouldShowGenerationTags() || !nodeTemplate?.debug) return '';
        const sourceId = nodeTemplate.debug.sourceId || 'manual';
        const poolTail = '';
        return `${sourceId}${poolTail}`;
    }

    function getCampaignConfig() {
        return appData.campaign || {};
    }

    function getCampaignNodes() {
        const nodes = getCampaignConfig().nodes;
        return Array.isArray(nodes) ? nodes : [];
    }

    function getCampaignTotalNodes() {
        return Math.max(1, Math.round(Number(getCampaignConfig().totalNodes) || 1));
    }

    function getCampaignRules() {
        const rules = getCampaignConfig().rules;
        return rules && typeof rules === 'object' ? rules : {};
    }

    function getCampaignReserveGrowthByNode() {
        const values = getCampaignConfig().reserveGrowthByNode;
        return Array.isArray(values) ? values : [];
    }

    function getSeedDisplayLabel() {
        const seed = getCampaignConfig().seed || '';
        if (seed.length <= 12) return seed;
        return seed.slice(-12);
    }

    if (canUseOverviewFallbackData(INITIAL_OVERVIEW_MODE)) {
        const initialDashboardActState = createDefaultActStateForDashboard();
        if (initialDashboardActState.seed === 'AUTO-DEMO') {
            initialDashboardActState.seed = createRuntimeSeed();
        }
        primeCampaignFromActState(initialDashboardActState, { persistSnapshot: true });
    } else {
        appData.runtime.frontendSnapshot = null;
    }

    function getNodeDefinitionByIndex(nodeTemplate, nodeId) {
        const campaignRuntime = getOverviewCampaignRuntimeApi();
        if (campaignRuntime && typeof campaignRuntime.getNodeDefinitionByIndex === 'function') {
            return campaignRuntime.getNodeDefinitionByIndex(nodeTemplate, nodeId);
        }
        return nodeTemplate?.nodes?.find((node) => node.id === nodeId) || null;
    }

    function getSelectableNodeIds(nodeTemplate) {
        const campaignRuntime = getOverviewCampaignRuntimeApi();
        if (campaignRuntime && typeof campaignRuntime.getSelectableNodeIds === 'function') {
            return campaignRuntime.getSelectableNodeIds(nodeTemplate);
        }
        if (!nodeTemplate) return [];
        if (nodeTemplate.selectableNodeIds?.length) return [...nodeTemplate.selectableNodeIds];
        if (nodeTemplate.nodes?.length) return nodeTemplate.nodes.map((node) => node.id);
        if (nodeTemplate.presentNode) return [nodeTemplate.presentNode];
        return [];
    }

    function getDefaultPresentNodeId(nodeTemplate) {
        const campaignRuntime = getOverviewCampaignRuntimeApi();
        if (campaignRuntime && typeof campaignRuntime.getDefaultPresentNodeId === 'function') {
            return campaignRuntime.getDefaultPresentNodeId(nodeTemplate);
        }
        return nodeTemplate?.presentNode || getSelectableNodeIds(nodeTemplate)[0] || null;
    }

    function getFixedPhaseMarkers(nodeId) {
        const snapshotMarkers = appData.runtime.frontendSnapshot?.fixedPhaseMarkers;
        if (snapshotMarkers && typeof snapshotMarkers === 'object' && snapshotMarkers[nodeId]) {
            return snapshotMarkers[nodeId];
        }
        if (!canUseOverviewFallbackData(adapterState.mode)) return {};
        return getOverviewFallbackFixedPhaseMarkers(adapterState.mode)[nodeId] || {};
    }

    function getFixedPhaseMarker(nodeId, phaseIndex) {
        return getFixedPhaseMarkers(nodeId)[phaseIndex] || null;
    }

    function getEncounterMarkersForNode(nodeId) {
        if (!isNodeDetailVisible(nodeId)) return [];
        const markers = Array.isArray(appData.runtime.frontendSnapshot?.encounterMarkers)
            ? appData.runtime.frontendSnapshot.encounterMarkers
            : [];
        return markers.filter((marker) => marker && marker.status === 'placed' && marker.nodeId === nodeId);
    }

    function getEncounterMarkerForPhase(nodeId, phaseIndex) {
        const normalizedPhaseIndex = Math.max(0, Math.min(3, Math.round(Number(phaseIndex) || 0)));
        return getEncounterMarkersForNode(nodeId).find((marker) => (
            Math.max(0, Math.min(3, Math.round(Number(marker.phaseIndex) || 0))) === normalizedPhaseIndex
        )) || null;
    }

    function getDashboardCharacterMeta(charKey) {
        const key = typeof charKey === 'string' ? charKey.trim().toLowerCase() : '';
        const registry = window.dashboardCharacters && typeof window.dashboardCharacters === 'object'
            ? window.dashboardCharacters
            : {};
        return registry[key] || null;
    }

    function buildEncounterBadgeMarkup(nodeId) {
        const marker = getEncounterMarkersForNode(nodeId)[0];
        if (!marker) return '';
        const meta = getDashboardCharacterMeta(marker.charKey);
        const displayName = meta?.name || marker.charKey;
        const avatarUrl = typeof meta?.avatarUrl === 'string' ? meta.avatarUrl : '';
        const phaseIndex = Math.max(0, Math.min(3, Math.round(Number(marker.phaseIndex) || 0)));
        const typeLabel = marker.type === 'pre_signal' ? 'PRE SIGNAL' : 'FIRST MEET';
        return `
            <div class="encounter-badge${marker.type === 'pre_signal' ? ' is-pre-signal' : ''}" title="${escapePartyHtml(displayName)} · ${typeLabel} · ${escapePartyHtml(getPhaseRomanLabel(phaseIndex))}" data-encounter-char="${escapePartyHtml(marker.charKey)}" data-encounter-phase="${phaseIndex}" data-encounter-type="${escapePartyHtml(marker.type || 'first_meet')}">
                ${avatarUrl
                    ? `<img src="${escapePartyHtml(avatarUrl)}" alt="${escapePartyHtml(displayName)}" draggable="false">`
                    : `<span>${escapePartyHtml(String(marker.charKey || '?').slice(0, 2))}</span>`}
            </div>
        `;
    }

    function buildEncounterFixedGlyphMarkup(marker) {
        if (!marker) return '<div class="magic-core"></div>';
        const meta = getDashboardCharacterMeta(marker.charKey);
        const displayName = meta?.name || marker.charKey;
        const avatarUrl = typeof meta?.avatarUrl === 'string' ? meta.avatarUrl : '';
        if (avatarUrl) {
            return `<img class="encounter-fixed-avatar" src="${escapePartyHtml(avatarUrl)}" alt="${escapePartyHtml(displayName)}" draggable="false">`;
        }
        return `<span class="encounter-fixed-fallback">${escapePartyHtml(String(marker.charKey || '?').slice(0, 2))}</span>`;
    }

    function getFixedPhaseKind(nodeId, phaseIndex) {
        const marker = getFixedPhaseMarker(nodeId, phaseIndex);
        const kind = marker && typeof marker.kind === 'string' ? marker.kind.trim().toLowerCase() : '';
        return RESOURCE_KEYS.includes(kind) ? kind : null;
    }

    function getPresentNodeTransition(nodeId) {
        const nodeCatalog = appData.runtime.frontendSnapshot?.nodeCatalog;
        const runtimeNode = nodeCatalog && typeof nodeCatalog === 'object'
            ? nodeCatalog[nodeId]
            : null;
        const next = runtimeNode && typeof runtimeNode.next === 'object' ? runtimeNode.next : null;
        const mode = typeof next?.mode === 'string' ? next.mode.trim().toLowerCase() : 'none';
        const forcedNodeId = typeof next?.nodeId === 'string' ? next.nodeId.trim() : null;
        return {
            mode: mode || 'none',
            forcedNodeId: forcedNodeId || null
        };
    }

    function hasFixedPhaseMarkers(nodeId) {
        const markers = getFixedPhaseMarkers(nodeId);
        return Object.keys(markers).length > 0;
    }

    function getNodeCatalogEntry(nodeId) {
        const campaignRuntime = getOverviewCampaignRuntimeApi();
        if (campaignRuntime && typeof campaignRuntime.getNodeCatalogEntry === 'function') {
            return campaignRuntime.getNodeCatalogEntry(createCampaignRuntimeContext(), nodeId);
        }
        const ownerNodeIndex = getCampaignNodes().find((cNode) => getSelectableNodeIds(cNode).includes(nodeId));
        const nodeDefinition = getNodeDefinitionByIndex(ownerNodeIndex, nodeId);
        if (!nodeDefinition) return null;
        const nodeTypeKey = normalizeResourceKey(nodeDefinition.key, 'vision');
        const classList = [`type-${nodeTypeKey}`];
        const laneKey = typeof nodeDefinition.lane === 'string' ? nodeDefinition.lane.trim().toLowerCase() : '';
        if (nodeDefinition.isBranch) classList.push('node-branch');
        if (laneKey) classList.push(`lane-${laneKey}`);
        if (isBossNodeId(nodeId)) classList.push('node-reckoning');
        else if (isFinaleNodeId(nodeId)) classList.push('node-finale');
        if (hasFixedPhaseMarkers(nodeId)) classList.push('node-has-fixed-phase');
        return {
            id: nodeDefinition.id,
            label: nodeDefinition.label,
            sublabel: nodeDefinition.sublabel,
            classes: classList,
            lane: laneKey,
            mainlineLanes: Array.isArray(nodeDefinition.mainlineLanes)
                ? nodeDefinition.mainlineLanes
                    .map((value) => typeof value === 'string' ? value.trim().toLowerCase() : '')
                    .filter((value, index, list) => value && list.indexOf(value) === index)
                : [],
            hasFixedPhaseMarkers: hasFixedPhaseMarkers(nodeId)
        };
    }

    function getNodeData(nodeId) {
        return getNodeCatalogEntry(nodeId);
    }

    function getNodeTypeKey(nodeId) {
        const campaignRuntime = getOverviewCampaignRuntimeApi();
        if (campaignRuntime && typeof campaignRuntime.getNodeTypeKey === 'function') {
            return normalizeResourceKey(campaignRuntime.getNodeTypeKey(createCampaignRuntimeContext(), nodeId), 'vision');
        }
        const node = getNodeData(nodeId);
        if (!node) return 'vision';
        const typeClass = node.classes.find((className) => className.startsWith('type-'));
        return normalizeResourceKey(typeClass ? typeClass.replace('type-', '') : 'vision', 'vision');
    }

    function getNodeTemplate(nodeIndex = appState.currentNodeIndex) {
        const campaignRuntime = getOverviewCampaignRuntimeApi();
        if (campaignRuntime && typeof campaignRuntime.getNodeTemplate === 'function') {
            return campaignRuntime.getNodeTemplate(createCampaignRuntimeContext(), nodeIndex);
        }
        return getCampaignNodes().find((cNode) => cNode.nodeIndex === nodeIndex) || null;
    }

    function getCurrentNodeTemplate() {
        return getNodeTemplate(appState.currentNodeIndex);
    }

    function getNextNodeTemplate() {
        return getNodeTemplate(appState.currentNodeIndex + 1);
    }

    function getNodeIdsByIndex(nodeIndex) {
        const campaignRuntime = getOverviewCampaignRuntimeApi();
        if (campaignRuntime && typeof campaignRuntime.getNodeIdsByIndex === 'function') {
            return campaignRuntime.getNodeIdsByIndex(createCampaignRuntimeContext(), nodeIndex);
        }
        const nodeTemplate = getNodeTemplate(nodeIndex);
        if (!nodeTemplate) return [];
        return getSelectableNodeIds(nodeTemplate);
    }

    function getNodeIndex(nodeId) {
        const campaignRuntime = getOverviewCampaignRuntimeApi();
        if (campaignRuntime && typeof campaignRuntime.getNodeIndex === 'function') {
            return campaignRuntime.getNodeIndex(createCampaignRuntimeContext(), nodeId);
        }
        const ownerNodeIndex = getCampaignNodes().find((cNode) => getNodeIdsByIndex(cNode.nodeIndex).includes(nodeId));
        return ownerNodeIndex?.nodeIndex ?? -1;
    }

    function getNodeRuntimeEntry(nodeId) {
        const nodeCatalog = appData.runtime.frontendSnapshot?.nodeCatalog;
        if (nodeCatalog && typeof nodeCatalog === 'object' && nodeCatalog[nodeId]) {
            return nodeCatalog[nodeId];
        }
        return null;
    }

    function isBossNodeId(nodeId) {
        if (typeof nodeId !== 'string' || !nodeId.trim()) return false;
        const runtimeNode = getNodeRuntimeEntry(nodeId);
        const uiVariant = typeof runtimeNode?.ui?.variant === 'string'
            ? runtimeNode.ui.variant.trim().toLowerCase()
            : '';
        if (uiVariant === 'boss') return true;
        return nodeId === 'node5-boss';
    }

    function isFinaleNodeId(nodeId) {
        if (typeof nodeId !== 'string' || !nodeId.trim()) return false;
        if (isBossNodeId(nodeId)) return false;
        const nextMode = typeof getNodeRuntimeEntry(nodeId)?.next?.mode === 'string'
            ? getNodeRuntimeEntry(nodeId).next.mode.trim().toLowerCase()
            : '';
        if (nextMode === 'none') return true;
        return getNodeIndex(nodeId) === getCampaignTotalNodes();
    }

    function getMapColumns() {
        const campaignRuntime = getOverviewCampaignRuntimeApi();
        if (campaignRuntime && typeof campaignRuntime.getMapColumns === 'function') {
            return campaignRuntime.getMapColumns(createCampaignRuntimeContext());
        }
        return getCampaignNodes().map((cNode) => ({
            lineId: `grid-node${cNode.nodeIndex}`,
            lineClass: 'grid-col-line',
            nodeIds: getNodeIdsByIndex(cNode.nodeIndex)
        }));
    }

    function getMapNodes() {
        const campaignRuntime = getOverviewCampaignRuntimeApi();
        if (campaignRuntime && typeof campaignRuntime.getMapNodes === 'function') {
            return campaignRuntime.getMapNodes(createCampaignRuntimeContext());
        }
        return getMapColumns()
            .flatMap((column) => column.nodeIds)
            .map((nodeId) => getNodeData(nodeId))
            .filter(Boolean);
    }

    function getMapTopology() {
        const campaignRuntime = getOverviewCampaignRuntimeApi();
        if (campaignRuntime && typeof campaignRuntime.getMapTopology === 'function') {
            return campaignRuntime.getMapTopology(createCampaignRuntimeContext());
        }
        const snapshotTopology = appData.runtime.frontendSnapshot?.topology;
        if (Array.isArray(snapshotTopology) && snapshotTopology.length) {
            return snapshotTopology
                .filter((entry) => entry && typeof entry.from === 'string' && typeof entry.to === 'string')
                .map((entry) => ({ from: entry.from, to: entry.to }));
        }
        const topology = [];
        for (let nodeIndex = 1; nodeIndex < getCampaignTotalNodes(); nodeIndex += 1) {
            const fromNodeIds = getNodeIdsByIndex(nodeIndex);
            const toNodeIds = getNodeIdsByIndex(nodeIndex + 1);
            fromNodeIds.forEach((fromId) => {
                toNodeIds.forEach((toId) => {
                    topology.push({ from: fromId, to: toId });
                });
            });
        }
        return topology;
    }

    function getTopologyEdgeKey(fromId, toId) {
        return `${fromId || ''}->${toId || ''}`;
    }

    function getRenderedMapTopology() {
        const baseTopology = getMapTopology();
        const renderedTopology = baseTopology.map((entry) => ({ ...entry, isJumpPath: entry.isJumpPath === true }));
        const knownEdges = new Set(renderedTopology.map((entry) => getTopologyEdgeKey(entry.from, entry.to)));
        appState.routeHistory.forEach((fromId, index) => {
            const toId = appState.routeHistory[index + 1];
            if (!fromId || !toId) return;
            const edgeKey = getTopologyEdgeKey(fromId, toId);
            if (knownEdges.has(edgeKey)) return;
            knownEdges.add(edgeKey);
            renderedTopology.push({ from: fromId, to: toId, isJumpPath: true });
        });
        return renderedTopology;
    }

    function getChosenNodeIdByIndex(nodeIndex, currentPresentNodeId = appState.currentNodeId) {
        const campaignRuntime = getOverviewCampaignRuntimeApi();
        if (campaignRuntime && typeof campaignRuntime.getChosenNodeIdByIndex === 'function') {
            return campaignRuntime.getChosenNodeIdByIndex(createCampaignRuntimeContext(), nodeIndex, currentPresentNodeId);
        }
        const nodeTemplate = getNodeTemplate(nodeIndex);
        if (!nodeTemplate) return null;
        if (nodeIndex < appState.currentNodeIndex) {
            return appState.routeHistory[nodeIndex - 1] || getDefaultPresentNodeId(nodeTemplate);
        }
        if (nodeIndex === appState.currentNodeIndex) {
            if (getSelectableNodeIds(nodeTemplate).includes(currentPresentNodeId)) return currentPresentNodeId;
            return getDefaultPresentNodeId(nodeTemplate);
        }
        if (nodeTemplate.template === 'fixed') {
            return getDefaultPresentNodeId(nodeTemplate);
        }
        return null;
    }

    function getDerivedPathNodeIds(nodeIndex, presentNodeId) {
        const campaignRuntime = getOverviewCampaignRuntimeApi();
        if (campaignRuntime && typeof campaignRuntime.getDerivedPathNodeIds === 'function') {
            return campaignRuntime.getDerivedPathNodeIds(createCampaignRuntimeContext(), nodeIndex, presentNodeId);
        }
        const pathNodeIds = [];
        for (let index = 1; index <= nodeIndex; index += 1) {
            const chosenNodeId = getChosenNodeIdByIndex(index, presentNodeId);
            if (chosenNodeId) pathNodeIds.push(chosenNodeId);
        }
        return pathNodeIds.filter((nodeId, index, list) => list.indexOf(nodeId) === index);
    }

    function getDerivedFutureNodeIds(nodeIndex, presentNodeId, deadNodeIds) {
        const campaignRuntime = getOverviewCampaignRuntimeApi();
        if (campaignRuntime && typeof campaignRuntime.getDerivedFutureNodeIds === 'function') {
            return campaignRuntime.getDerivedFutureNodeIds(createCampaignRuntimeContext(), nodeIndex, presentNodeId, deadNodeIds);
        }
        const deadNodeIdSet = new Set(deadNodeIds);
        const futureNodeIds = [];
        getCampaignNodes()
            .filter((cNode) => cNode.nodeIndex > nodeIndex)
            .forEach((cNode) => {
                getNodeIdsByIndex(cNode.nodeIndex).forEach((nodeId) => {
                    if (nodeId === presentNodeId) return;
                    if (deadNodeIdSet.has(nodeId)) return;
                    futureNodeIds.push(nodeId);
                });
            });
        return futureNodeIds.filter((nodeId, index, list) => list.indexOf(nodeId) === index);
    }

    function getDerivedDeadNodeIds(nodeIndex, presentNodeId) {
        const campaignRuntime = getOverviewCampaignRuntimeApi();
        if (campaignRuntime && typeof campaignRuntime.getDerivedDeadNodeIds === 'function') {
            return campaignRuntime.getDerivedDeadNodeIds(createCampaignRuntimeContext(), nodeIndex, presentNodeId);
        }
        const deadNodeIds = new Set();

        getCampaignNodes()
            .filter((cNode) => cNode.nodeIndex <= nodeIndex)
            .forEach((cNode) => {
                (cNode.deadNodes || []).forEach((nodeId) => deadNodeIds.add(nodeId));
                const nodeIdsAtIndex = getSelectableNodeIds(cNode);
                if (nodeIdsAtIndex.length <= 1) return;
                const chosenNodeId = cNode.nodeIndex === nodeIndex ? presentNodeId : appState.routeHistory[cNode.nodeIndex - 1];
                nodeIdsAtIndex.forEach((nodeId) => {
                    if (nodeId !== chosenNodeId) deadNodeIds.add(nodeId);
                });
            });

        deadNodeIds.delete(presentNodeId);
        return Array.from(deadNodeIds);
    }

    function getCurrentNodeData() {
        const campaignRuntime = getOverviewCampaignRuntimeApi();
        if (campaignRuntime && typeof campaignRuntime.getCurrentNodeData === 'function') {
            return campaignRuntime.getCurrentNodeData(createCampaignRuntimeContext());
        }
        const nodeTemplate = getCurrentNodeTemplate();
        const selectableNodeIds = getSelectableNodeIds(nodeTemplate);
        const presentNodeId = selectableNodeIds.includes(appState.currentNodeId)
            ? appState.currentNodeId
            : getDefaultPresentNodeId(nodeTemplate) || appState.currentNodeId;
        const nodeDefinition = getNodeDefinitionByIndex(nodeTemplate, presentNodeId);
        const node = getNodeData(presentNodeId);
        const typeKey = getNodeTypeKey(presentNodeId);
        const label = nodeTemplate?.label || `NODE ${String(appState.currentNodeIndex).padStart(2, '0')}`;
        const deadNodeIds = getDerivedDeadNodeIds(appState.currentNodeIndex, presentNodeId);
        const presentTransition = getPresentNodeTransition(presentNodeId);
        const snapshotMatchesCurrentNode = appData.runtime.frontendSnapshot
            && Math.max(1, Math.round(Number(appData.runtime.frontendSnapshot.currentNodeIndex) || 1)) === appState.currentNodeIndex
            && typeof appData.runtime.frontendSnapshot.currentNodeId === 'string'
            && appData.runtime.frontendSnapshot.currentNodeId.trim() === presentNodeId;
        const snapshotLimited = snapshotMatchesCurrentNode && Array.isArray(appData.runtime.frontendSnapshot?.currentLimitedRewards)
            ? appData.runtime.frontendSnapshot.currentLimitedRewards
            : null;
        const limitedRewards = snapshotLimited
            ? snapshotLimited
            : (nodeDefinition?.limited?.length
                ? nodeDefinition.limited
                : (nodeTemplate?.limited?.length ? nodeTemplate.limited : getDefaultLimitedRewardsForNode(presentNodeId)));
        return {
            nodeIndex: appState.currentNodeIndex,
            label,
            template: nodeTemplate?.template || 'fixed',
            title: nodeTemplate?.title || node?.sublabel || 'UNASSIGNED NODE',
            subtitle: nodeTemplate?.subtitle || `${RESOURCE_LABEL_MAP[typeKey]}点 · 当日排程节点`,
            mapFocus: nodeTemplate?.template === 'fixed'
                ? (nodeTemplate?.mapFocus || presentNodeId)
                : presentNodeId,
            presentNode: presentNodeId,
            selectableNodeIds,
            nextRouteMode: presentTransition.mode || nodeTemplate?.nextRouteMode || 'none',
            nextForcedNodeId: presentTransition.forcedNodeId || nodeTemplate?.nextForcedNodeId || null,
            pathNodes: getDerivedPathNodeIds(appState.currentNodeIndex, presentNodeId),
            futureNodes: getDerivedFutureNodeIds(appState.currentNodeIndex, presentNodeId, deadNodeIds),
            deadNodes: deadNodeIds,
            limited: limitedRewards.map((reward) => ({
                ...reward,
                title: reward.title || `限定·${RESOURCE_LABEL_MAP[reward.key]}点`,
                sublabel: reward.sublabel || `NODE-BOUND ${RESOURCE_TYPE_MAP[reward.key]}`
            }))
        };
    }

    function getRouteIndex(nodeId) {
        const nodeIndex = getNodeIndex(nodeId);
        return nodeIndex === -1 ? -1 : nodeIndex - 1;
    }

    function getCurrentRouteIndex() {
        return getRouteIndex(getCurrentNodeData().presentNode);
    }

    function getCurrentColumnLineClass(column) {
        const nodeData = getCurrentNodeData();
        const containsPresentNode = column.nodeIds.includes(nodeData.presentNode);
        const containsBoss = column.nodeIds.some((nodeId) => isBossNodeId(nodeId));
        const containsFinale = column.nodeIds.some((nodeId) => isFinaleNodeId(nodeId));

        if (containsPresentNode) return 'grid-line-current';
        if (containsBoss && appState.currentNodeIndex < getCampaignTotalNodes()) return 'grid-line-danger';
        if (containsFinale && appState.currentNodeIndex < getCampaignTotalNodes()) return 'grid-line-finale';
        return 'grid-col-line';
    }

    function getConnectionKey(fromId, toId) {
        return `${fromId}->${toId}`;
    }

    function getOutgoingNodeIds(nodeId) {
        return getMapTopology()
            .filter((conn) => conn.from === nodeId)
            .map((conn) => conn.to);
    }

    function getRouteOptions() {
        const campaignRuntime = getOverviewCampaignRuntimeApi();
        if (campaignRuntime && typeof campaignRuntime.getRouteOptions === 'function') {
            return campaignRuntime.getRouteOptions(createCampaignRuntimeContext());
        }
        const currentNodeData = getCurrentNodeData();
        const nextNodeTemplate = getNextNodeTemplate();
        const snapshotRouteOptions = appData.runtime.frontendSnapshot?.routeOptions;
        if (!nextNodeTemplate) return [];
        if (Array.isArray(snapshotRouteOptions) && snapshotRouteOptions.length && appData.runtime.frontendSnapshot?.routeMode === 'jump') {
            return snapshotRouteOptions
                .filter((nodeId) => typeof nodeId === 'string' && nodeId.trim())
                .map((nodeId) => nodeId.trim());
        }
        if (currentNodeData.nextRouteMode === 'none') return [];

        const outgoingNodeIds = getOutgoingNodeIds(currentNodeData.presentNode).filter((nodeId) => nodeId !== currentNodeData.presentNode);
        if (!outgoingNodeIds.length) return [];

        if (currentNodeData.nextRouteMode === 'forced') {
            const forcedNodeId = currentNodeData.nextForcedNodeId;
            return forcedNodeId && outgoingNodeIds.includes(forcedNodeId) ? [forcedNodeId] : [];
        }

        if (Array.isArray(snapshotRouteOptions) && snapshotRouteOptions.length) {
            const normalizedSnapshotOptions = snapshotRouteOptions
                .filter((nodeId) => typeof nodeId === 'string' && nodeId.trim())
                .map((nodeId) => nodeId.trim());
            const filteredSnapshotOptions = normalizedSnapshotOptions.filter((nodeId) => outgoingNodeIds.includes(nodeId));
            if (filteredSnapshotOptions.length) return filteredSnapshotOptions;
        }

        const allowedNodeIds = getSelectableNodeIds(nextNodeTemplate);
        return outgoingNodeIds.filter((nodeId) => allowedNodeIds.includes(nodeId));
    }

    function getVisionStateForDashboard() {
        const actState = buildCurrentActStateSnapshot();
        const vision = actState.vision && typeof actState.vision === 'object' ? actState.vision : {};
        const pendingReplace = vision.pendingReplace && typeof vision.pendingReplace === 'object'
            ? deepCloneValue(vision.pendingReplace)
            : null;
        if (pendingReplace && pendingReplace.status === 'needs_target') {
            pendingReplace.status = 'charged';
            pendingReplace.charges = Math.max(1, Math.round(Number(pendingReplace.charges) || 1));
            pendingReplace.source = pendingReplace.source || 'vision2';
        }
        return {
            baseSight: Math.max(0, Math.round(Number(vision.baseSight) || 1)),
            bonusSight: Math.max(0, Math.round(Number(vision.bonusSight) || 0)),
            jumpReady: vision.jumpReady === true,
            pendingReplace
        };
    }

    function getVisionSightValue() {
        const vision = getVisionStateForDashboard();
        return Math.max(0, vision.baseSight + vision.bonusSight);
    }

    function isNodeInVisionRange(nodeId) {
        const nodeIndex = getNodeIndex(nodeId);
        if (nodeIndex < 0) return false;
        return nodeIndex <= appState.currentNodeIndex + getVisionSightValue();
    }

    function isNodeDetailVisible(nodeId) {
        const nodeIndex = getNodeIndex(nodeId);
        if (nodeIndex < 0) return false;
        if (nodeIndex <= appState.currentNodeIndex) return true;
        return isNodeInVisionRange(nodeId);
    }

    function isColumnVisibleInMapFog(column) {
        return Array.isArray(column?.nodeIds) && column.nodeIds.some((nodeId) => isNodeDetailVisible(nodeId));
    }

    function isConnectionVisibleInMapFog(conn) {
        return conn
            && isNodeDetailVisible(conn.from)
            && isNodeDetailVisible(conn.to);
    }

    function isNodeTemporarilyRevealedByIntel(nodeId) {
        const nodeIndex = getNodeIndex(nodeId);
        if (nodeIndex < 0 || nodeIndex <= appState.currentNodeIndex) return false;
        const vision = getVisionStateForDashboard();
        const baseVisibleTo = appState.currentNodeIndex + Math.max(0, Math.round(Number(vision.baseSight) || 0));
        const boostedVisibleTo = baseVisibleTo + Math.max(0, Math.round(Number(vision.bonusSight) || 0));
        return vision.bonusSight > 0 && nodeIndex > baseVisibleTo && nodeIndex <= boostedVisibleTo;
    }

    function getVisionReplaceChargeCount() {
        const pending = getVisionStateForDashboard().pendingReplace;
        if (!pending || typeof pending !== 'object') return 0;
        if (!['charged', 'choosing', 'ready'].includes(pending.status)) return 0;
        return Math.max(1, Math.round(Number(pending.charges) || 1));
    }

    function getPhaseKey(nodeId, phaseIndex) {
        return `${nodeId || ''}:${Math.max(0, Math.min(3, Math.round(Number(phaseIndex) || 0)))}`;
    }

    function getCurrentVisionFixedPhasePrompt() {
        if (appState.awaitingRouteChoice) return null;
        const nodeId = getCurrentNodeData().presentNode;
        const phaseIndex = Math.max(0, Math.min(PHASE_SLOT_IDS.length - 1, appState.currentPhaseIndex));
        const fixedKind = getFixedPhaseKind(nodeId, phaseIndex);
        if (!fixedKind) return null;
        const pending = getVisionStateForDashboard().pendingReplace;
        const charges = getVisionReplaceChargeCount();
        if (charges <= 0) return null;
        const phaseKey = getPhaseKey(nodeId, phaseIndex);
        const skippedKey = typeof pending?.skippedPhaseKey === 'string' ? pending.skippedPhaseKey : '';
        if (skippedKey === phaseKey) return null;
        if (
            pending?.status === 'ready' &&
            pending.nodeId === nodeId &&
            Math.max(0, Math.min(3, Math.round(Number(pending.phaseIndex) || 0))) === phaseIndex
        ) {
            return null;
        }
        return {
            nodeId,
            nodeIndex: appState.currentNodeIndex,
            phaseIndex,
            phaseKey,
            fixedKind,
            charges,
            title: getFixedPhaseMarker(nodeId, phaseIndex)?.title || `${getRouteOptionLabel(nodeId)} · ${getPhaseRomanLabel(phaseIndex)}`
        };
    }

    function getReadyVisionReplacementForPhase(nodeId, phaseIndex) {
        const pending = getVisionStateForDashboard().pendingReplace;
        if (!pending || pending.status !== 'ready') return null;
        const targetNodeId = typeof pending.nodeId === 'string' ? pending.nodeId.trim() : '';
        const targetPhaseIndex = Math.max(0, Math.min(3, Math.round(Number(pending.phaseIndex) || 0)));
        const replacementKey = normalizeResourceKey(pending.replacementKey || pending.key, '');
        if (!targetNodeId || targetNodeId !== nodeId) return null;
        if (targetPhaseIndex !== Math.max(0, Math.min(3, Math.round(Number(phaseIndex) || 0)))) return null;
        if (!replacementKey) return null;
        return {
            key: replacementKey,
            type: RESOURCE_TYPE_MAP[replacementKey] || replacementKey.toUpperCase(),
            source: 'vision',
            amount: 1,
            sources: ['vision'],
            visionReplacement: true,
            charges: Math.max(1, Math.round(Number(pending.charges) || 1))
        };
    }

    function getDisplayTokenForPhase(slotToken, nodeId, phaseIndex) {
        if (slotToken) return slotToken;
        const visionReplacement = getReadyVisionReplacementForPhase(nodeId, phaseIndex);
        if (!visionReplacement) return null;
        return {
            key: visionReplacement.key,
            type: visionReplacement.type,
            source: 'vision',
            amount: 1,
            sources: ['vision'],
            visionReplacement: true
        };
    }

    function getRouteOptionLabel(nodeId) {
        const node = getNodeData(nodeId);
        if (!node) return nodeId.toUpperCase();
        return node.label.replace(/[\[\]_]/g, ' ').replace(/\s+/g, ' ').trim();
    }

    function isVisitedConnection(fromId, toId) {
        return appState.routeHistory.some((nodeId, index) => nodeId === fromId && appState.routeHistory[index + 1] === toId);
    }

    function isMainRouteConnection(fromId, toId) {
        const fromNodeIndex = getNodeIndex(fromId);
        const toNodeIndex = getNodeIndex(toId);
        return fromNodeIndex !== -1
            && toNodeIndex === fromNodeIndex + 1
            && getOutgoingNodeIds(fromId).includes(toId);
    }

    function isImmediateNextNode(nodeId) {
        return getRouteOptions().includes(nodeId);
    }

    function getInventoryBucket(key) {
        const plannerRuntime = getOverviewPlannerRuntimeApi();
        if (plannerRuntime && typeof plannerRuntime.getInventoryBucket === 'function') {
            return plannerRuntime.getInventoryBucket(createPlannerRuntimeContext(), key);
        }
        return appState.inventory[key] || { reserve: 0, limited: 0 };
    }

    function getTotalInventoryCount(key) {
        const plannerRuntime = getOverviewPlannerRuntimeApi();
        if (plannerRuntime && typeof plannerRuntime.getTotalInventoryCount === 'function') {
            return plannerRuntime.getTotalInventoryCount(createPlannerRuntimeContext(), key);
        }
        const bucket = getInventoryBucket(key);
        return bucket.reserve + bucket.limited;
    }

    function getAllocatedCounts() {
        const plannerRuntime = getOverviewPlannerRuntimeApi();
        if (plannerRuntime && typeof plannerRuntime.getAllocatedCounts === 'function') {
            return plannerRuntime.getAllocatedCounts(createPlannerRuntimeContext());
        }
        const counts = Object.fromEntries(RESOURCE_KEYS.map((key) => [key, 0]));
        Object.values(appState.phaseSlots).forEach((token) => {
            if (!token) return;
            counts[token.key] += Math.max(1, Math.min(3, Math.round(Number(token.amount) || 1)));
        });
        return counts;
    }

    function getPendingLimitedCount() {
        const plannerRuntime = getOverviewPlannerRuntimeApi();
        if (plannerRuntime && typeof plannerRuntime.getPendingLimitedCount === 'function') {
            return plannerRuntime.getPendingLimitedCount(createPlannerRuntimeContext());
        }
        const currentNodeId = getCurrentNodeData().presentNode;
        const remainingFixedByKey = Object.fromEntries(RESOURCE_KEYS.map((key) => [key, 0]));

        appData.planner.phases
            .slice(appState.currentPhaseIndex)
            .forEach((phase, relativeIndex) => {
                const absolutePhaseIndex = appState.currentPhaseIndex + relativeIndex;
                const fixedKind = getFixedPhaseKind(currentNodeId, absolutePhaseIndex);
                if (!fixedKind) return;
                remainingFixedByKey[fixedKind] += 1;
            });

        return RESOURCE_KEYS.reduce((sum, key) => {
            const limited = getInventoryBucket(key).limited;
            const coveredByFixed = Math.min(limited, remainingFixedByKey[key] || 0);
            return sum + Math.max(0, limited - coveredByFixed);
        }, 0);
    }

    function shouldRequireAllLimitedScheduling() {
        const plannerRuntime = getOverviewPlannerRuntimeApi();
        if (plannerRuntime && typeof plannerRuntime.shouldRequireAllLimitedScheduling === 'function') {
            return plannerRuntime.shouldRequireAllLimitedScheduling(createPlannerRuntimeContext());
        }
        return getCampaignRules().requireScheduleAllLimited;
    }

    function canExecuteCurrentNode() {
        const plannerRuntime = getOverviewPlannerRuntimeApi();
        if (plannerRuntime && typeof plannerRuntime.canExecuteCurrentNode === 'function') {
            return plannerRuntime.canExecuteCurrentNode(createPlannerRuntimeContext());
        }
        if (!canUseInteractivePlannerControls() || !canUseNodeAdvanceControl()) return false;
        if (appState.executing || isRouteSelectionActive()) return false;
        if (!shouldRequireAllLimitedScheduling()) return true;
        return getPendingLimitedCount() === 0;
    }

    function shouldGrantReserveGrowthAtEndOfNode() {
        const plannerRuntime = getOverviewPlannerRuntimeApi();
        if (plannerRuntime && typeof plannerRuntime.shouldGrantReserveGrowthAtEndOfNode === 'function') {
            return plannerRuntime.shouldGrantReserveGrowthAtEndOfNode(createPlannerRuntimeContext());
        }
        return getCampaignRules().reserveGrowthTiming === 'end_of_node';
    }

    function shouldGrantReserveGrowthAtStartOfNode() {
        const plannerRuntime = getOverviewPlannerRuntimeApi();
        if (plannerRuntime && typeof plannerRuntime.shouldGrantReserveGrowthAtStartOfNode === 'function') {
            return plannerRuntime.shouldGrantReserveGrowthAtStartOfNode(createPlannerRuntimeContext());
        }
        return getCampaignRules().reserveGrowthTiming === 'start_of_node';
    }

    function clearPendingLimitedTokens() {
        const plannerRuntime = getOverviewPlannerRuntimeApi();
        if (plannerRuntime && typeof plannerRuntime.clearPendingLimitedTokens === 'function') {
            plannerRuntime.clearPendingLimitedTokens(createPlannerRuntimeContext());
            return;
        }
        RESOURCE_KEYS.forEach((key) => {
            appState.inventory[key].limited = 0;
        });
    }

    function hasRemainingScheduledPhases() {
        const plannerRuntime = getOverviewPlannerRuntimeApi();
        if (plannerRuntime && typeof plannerRuntime.hasRemainingScheduledPhases === 'function') {
            return plannerRuntime.hasRemainingScheduledPhases(createPlannerRuntimeContext());
        }
        return appData.planner.phases
            .slice(appState.currentPhaseIndex)
            .some((phase) => Boolean(appState.phaseSlots[phase.slotId]));
    }

    function isRouteSelectionActive() {
        const plannerRuntime = getOverviewPlannerRuntimeApi();
        if (plannerRuntime && typeof plannerRuntime.isRouteSelectionActive === 'function') {
            return plannerRuntime.isRouteSelectionActive(createPlannerRuntimeContext());
        }
        return appState.awaitingRouteChoice === true;
    }

    function isPlanningPhase() {
        const plannerRuntime = getOverviewPlannerRuntimeApi();
        if (plannerRuntime && typeof plannerRuntime.isPlanningPhase === 'function') {
            return plannerRuntime.isPlanningPhase(createPlannerRuntimeContext());
        }
        return !appState.executing
            && !appState.awaitingRouteChoice
            && appState.currentPhaseIndex === 0;
    }

    function canAdvanceCurrentPhase(options = {}) {
        const plannerRuntime = getOverviewPlannerRuntimeApi();
        if (plannerRuntime && typeof plannerRuntime.canAdvanceCurrentPhase === 'function') {
            return plannerRuntime.canAdvanceCurrentPhase(createPlannerRuntimeContext(), options);
        }
        if (!canUseInteractivePlannerControls() || !canUsePhaseAdvanceControl()) return false;
        if (appState.executing || isRouteSelectionActive()) return false;
        if (appState.currentPhaseIndex > appData.planner.phases.length - 1) return false;
        if (!options.bypassVisionPrompt && getCurrentVisionFixedPhasePrompt()) return false;
        return true;
    }

    function getPhaseSlotIndex(slotId) {
        const plannerRuntime = getOverviewPlannerRuntimeApi();
        if (plannerRuntime && typeof plannerRuntime.getPhaseSlotIndex === 'function') {
            return plannerRuntime.getPhaseSlotIndex(createPlannerRuntimeContext(), slotId);
        }
        return appData.planner.phases.findIndex((phase) => phase.slotId === slotId);
    }

    function canEditPhaseSlot(slotId) {
        const plannerRuntime = getOverviewPlannerRuntimeApi();
        if (plannerRuntime && typeof plannerRuntime.canEditPhaseSlot === 'function') {
            return plannerRuntime.canEditPhaseSlot(createPlannerRuntimeContext(), slotId);
        }
        if (!canUseInteractivePlannerControls()) return false;
        if (appState.awaitingRouteChoice) return false;
        const phaseIndex = getPhaseSlotIndex(slotId);
        if (phaseIndex < 0) return false;
        if (getFixedPhaseKind(getCurrentNodeData().presentNode, phaseIndex)) return false;
        if (getEncounterMarkerForPhase(getCurrentNodeData().presentNode, phaseIndex)) return false;
        return phaseIndex > appState.currentPhaseIndex;
    }

    function getPreferredSourceForKey(key) {
        const plannerRuntime = getOverviewPlannerRuntimeApi();
        if (plannerRuntime && typeof plannerRuntime.getPreferredSourceForKey === 'function') {
            return plannerRuntime.getPreferredSourceForKey(createPlannerRuntimeContext(), key);
        }
        const bucket = getInventoryBucket(key);
        if (bucket.limited > 0) return 'limited';
        if (bucket.reserve > 0) return 'reserve';
        return null;
    }

    function grantDailyReserveGrowth(nodeIndex) {
        const plannerRuntime = getOverviewPlannerRuntimeApi();
        if (plannerRuntime && typeof plannerRuntime.grantDailyReserveGrowth === 'function') {
            plannerRuntime.grantDailyReserveGrowth(createPlannerRuntimeContext(), nodeIndex);
            return;
        }
        const fallbackGrowth = getCampaignReserveGrowthByNode()[nodeIndex - 1] ?? 0;
        RESOURCE_KEYS.forEach((key) => {
            const growth = Number(appState.incomeRate?.[key]);
            const normalizedGrowth = Number.isFinite(growth) ? Math.max(0, Math.min(1.5, growth)) : fallbackGrowth;
            if (!appState.incomeProgress) appState.incomeProgress = {};
            if (!Number.isFinite(Number(appState.incomeProgress[key]))) appState.incomeProgress[key] = 0;
            appState.incomeProgress[key] += normalizedGrowth;
            while (appState.incomeProgress[key] >= 1) {
                appState.incomeProgress[key] -= 1;
                appState.inventory[key].reserve += 1;
            }
            appState.reserveProgress[key] += normalizedGrowth;
            while (appState.reserveProgress[key] >= 1) {
                appState.reserveProgress[key] -= 1;
            }
        });
    }

    function grantDailyLimitedPoints(nodeData) {
        const plannerRuntime = getOverviewPlannerRuntimeApi();
        if (plannerRuntime && typeof plannerRuntime.grantDailyLimitedPoints === 'function') {
            plannerRuntime.grantDailyLimitedPoints(createPlannerRuntimeContext(), nodeData);
            return;
        }
        nodeData.limited.forEach((entry) => {
            appState.inventory[entry.key].limited += entry.count;
        });
    }

    function resetPhaseSlots() {
        const plannerRuntime = getOverviewPlannerRuntimeApi();
        if (plannerRuntime && typeof plannerRuntime.resetPhaseSlots === 'function') {
            plannerRuntime.resetPhaseSlots(createPlannerRuntimeContext());
            return;
        }
        PHASE_SLOT_IDS.forEach((slotId) => {
            appState.phaseSlots[slotId] = null;
        });
        appState.currentPhaseIndex = 0;
    }

    function startNode(nodeIndex, nodeId = appState.currentNodeId) {
        const plannerRuntime = getOverviewPlannerRuntimeApi();
        if (plannerRuntime && typeof plannerRuntime.startNode === 'function') {
            plannerRuntime.startNode(createPlannerRuntimeContext(), nodeIndex, nodeId);
            return;
        }
        const nodeTemplate = getNodeTemplate(nodeIndex);
        appState.currentNodeIndex = nodeIndex;
        appState.currentNodeId = getSelectableNodeIds(nodeTemplate).includes(nodeId)
            ? nodeId
            : getDefaultPresentNodeId(nodeTemplate) || nodeId;
        appState.executing = false;
        appState.awaitingRouteChoice = false;
        resetPhaseSlots();
        if (shouldGrantReserveGrowthAtStartOfNode()) {
            grantDailyReserveGrowth(nodeIndex);
        }
        grantDailyLimitedPoints(getCurrentNodeData());
        setMapFocusNodeId(getCurrentNodeData().mapFocus);
    }

    // UI rendering starts here. Everything below should stay presentation-first.
    let overviewShellView = null;

    function createOverviewShellView() {
        return createOverviewGlobalModule('ACE0OverviewShellView', {
            appData,
            appState,
            adapterState,
            getCampaignTotalNodes,
            normalizeWorldClock,
            getCurrentAssetDeckSummary,
            getTotalInventoryCount,
            formatCompactResourceValue,
            getCurrentChapterId,
            getActModuleApi,
            deepCloneValue,
            getCampaignNodes,
            getCurrentColumnLineClass,
            isColumnVisibleInMapFog,
            getMapColumns,
            getMapNodes,
            getMapClassNameForNode,
            isNodeDetailVisible,
            buildEncounterBadgeMarkup,
            escapePartyHtml
        });
    }

    function getOverviewShellView() {
        if (!overviewShellView) overviewShellView = createOverviewShellView();
        return overviewShellView;
    }

    function renderTopbar() {
        return getOverviewShellView().renderTopbar();
    }

    function renderSidebar() {
        return getOverviewShellView().renderSidebar();
    }

    function syncSidePanelChrome() {
        return getOverviewShellView().syncSidePanelChrome();
    }

    function renderMapLayer() {
        return getOverviewShellView().renderMapLayer();
    }

    function needsMapLayerRebuild() {
        return getOverviewShellView().needsMapLayerRebuild();
    }

    let overviewPlannerView = null;

    function createOverviewPlannerView() {
        return createOverviewGlobalModule('ACE0OverviewPlannerView', {
            appData,
            appState,
            selectionState,
            syncState,
            RESOURCE_KEYS,
            RESOURCE_TYPE_MAP,
            RESOURCE_LABEL_MAP,
            PLANNER_PAGE_META,
            REST_CONTROL_TINT_KEYS,
            PHASE_SLOT_IDS,
            getAssetDeckModuleApi,
            getCurrentAssetDeckSummary,
            getTotalInventoryCount,
            buildCombatSettlementRowsMarkup,
            normalizeRestTintKey,
            getRestTintLabel,
            canUseInteractivePlannerControls,
            isPlanningPhase,
            canOpenPlannerDrawer,
            canEditPhaseSlot,
            getCurrentNodeData,
            getReadyVisionReplacementForPhase,
            getEncounterMarkerForPhase,
            getFixedPhaseKind,
            getDisplayTokenForPhase,
            getCurrentVisionFixedPhasePrompt,
            buildEncounterFixedGlyphMarkup,
            getFixedPhaseMarker,
            escapePartyHtml,
            getPhaseRomanLabel,
            getCampaignTotalNodes,
            isRouteSelectionActive,
            getRouteOptionLabel,
            getVisionStateForDashboard,
            buildVisionPanelMarkup
        });
    }

    function getOverviewPlannerView() {
        if (!overviewPlannerView) overviewPlannerView = createOverviewPlannerView();
        return overviewPlannerView;
    }

    function getActivePlannerPage() {
        return getOverviewPlannerView().getActivePlannerPage();
    }

    function setPlannerPage(page) {
        return getOverviewPlannerView().setPlannerPage(page);
    }

    function normalizePlannerEditMode(mode) {
        return getOverviewPlannerView().normalizePlannerEditMode(mode);
    }

    function setPlannerEditMode(mode) {
        return getOverviewPlannerView().setPlannerEditMode(mode);
    }

    function renderPlannerDrawer() {
        return getOverviewPlannerView().renderPlannerDrawer();
    }

    function renderPhaseBar() {
        return getOverviewPlannerView().renderPhaseBar();
    }

    function needsPlannerDrawerRebuild() {
        return getOverviewPlannerView().needsPlannerDrawerRebuild();
    }

    function needsPhaseBarRebuild() {
        return getOverviewPlannerView().needsPhaseBarRebuild();
    }

    function syncPlannerDrawerDOM() {
        return getOverviewPlannerView().syncPlannerDrawerDOM();
    }

    function getSelectedRestSlotToken() {
        return getOverviewPlannerView().getSelectedRestSlotToken();
    }

    function canApplyRestTint(tintKey, token = getSelectedRestSlotToken()) {
        return getOverviewPlannerView().canApplyRestTint(tintKey, token);
    }

    function openRestTintPopup(slotId = selectionState.slotId) {
        return getOverviewPlannerView().openRestTintPopup(slotId);
    }

    function closeRestTintPopup() {
        return getOverviewPlannerView().closeRestTintPopup();
    }

    function syncRestControlPanelDOM() {
        return getOverviewPlannerView().syncRestControlPanelDOM();
    }

    function syncPhaseBarDOM() {
        return getOverviewPlannerView().syncPhaseBarDOM();
    }

    let overviewIntelPanel = null;

    function createOverviewIntelPanel() {
        return createOverviewGlobalModule('ACE0OverviewIntelPanel', {
            appData,
            appState,
            syncState,
            adapterState,
            RESOURCE_KEYS,
            RESOURCE_TYPE_MAP,
            RESOURCE_LABEL_MAP,
            PHASE_SLOT_IDS,
            ENCOUNTER_DEBUG_CHARACTER_KEYS,
            WORLD_LOCATION_LAYERS,
            ENCOUNTER_DEBUG_TAG_OPTIONS,
            ENCOUNTER_DEBUG_FLAG_OPTIONS,
            ENCOUNTER_REASON_LABELS,
            buildCurrentActStateSnapshot,
            normalizeResourceKey,
            normalizeRestTintKey,
            getDebugChapterTransitionOption,
            canUsePhaseAdvanceControl,
            canAdvanceCurrentPhase,
            canUseNodeAdvanceControl,
            canExecuteCurrentNode,
            getCampaignConfig,
            getSeedDisplayLabel,
            getVisionStateForDashboard,
            getCampaignTotalNodes,
            isRouteSelectionActive,
            getRouteOptions,
            getRouteOptionLabel,
            deepCloneValue,
            normalizePendingAssetDeckCommandsForDashboard,
            getCurrentAssetDeckSummary,
            getActModuleApi,
            buildInitialDebugPayload,
            extractHeroPayload,
            getDebugEncounterContext,
            getCurrentWorldLocation,
            getCurrentEncounterDebugContext,
            getWorldLocationLayerLabel,
            isOverviewDebugMode,
            getAdapterModeLabel,
            normalizeActStage,
            getCurrentNodeData
        });
    }

    function getOverviewIntelPanel() {
        if (!overviewIntelPanel) overviewIntelPanel = createOverviewIntelPanel();
        return overviewIntelPanel;
    }

    function escapePartyHtml(text) {
        return getOverviewIntelPanel().escapePartyHtml(text);
    }

    function getPhaseRomanLabel(phaseIndex) {
        return getOverviewIntelPanel().getPhaseRomanLabel(phaseIndex);
    }

    function buildVisionPanelMarkup(actState) {
        return getOverviewIntelPanel().buildVisionPanelMarkup(actState);
    }

    function buildCombatSettlementRowsMarkup(actState, options = {}) {
        return getOverviewIntelPanel().buildCombatSettlementRowsMarkup(actState, options);
    }

    function renderIntelPanel() {
        return getOverviewIntelPanel().renderIntelPanel();
    }

    const layer = document.getElementById('mapLayer');
    const sysTopbar = document.getElementById('sysTopbar');
    const phaseBarMount = document.getElementById('phaseBarMount');

    function renderAppShell() {
        renderTopbar();
        renderSidebar();
        renderMapLayer();
        renderPlannerDrawer();
        renderPhaseBar();
        renderIntelPanel();
        syncSidePanelChrome();
    }

    overviewMapView = createOverviewMapView();
    startNode(1);
    renderAppShell();
    if (overviewMapView && typeof overviewMapView.initializeCamera === 'function') {
        overviewMapView.initializeCamera();
    }

    function getMapClassNameForNode(node) {
        return overviewMapView && typeof overviewMapView.getMapClassNameForNode === 'function'
            ? overviewMapView.getMapClassNameForNode(node)
            : 'az-node';
    }

    function updateMapUI() {
        if (overviewMapView) overviewMapView.refresh();
    }

    function applyAutoMacroLayout() {
        if (overviewMapView) overviewMapView.applyAutoMacroLayout();
    }

    function syncLayerSize() {
        if (overviewMapView) overviewMapView.syncLayerSize();
    }

    function fitLayerToViewport() {
        if (overviewMapView) overviewMapView.fitLayerToViewport();
    }

    function centerViewportOnCurrentFocus() {
        if (overviewMapView) overviewMapView.centerViewportOnCurrentFocus();
    }

    function syncRosterUIState() {
        const manaWidth = `${Math.max(0, Math.min(100, appState.resources.mana))}%`;
        appData.intel.roster[0].manaValue = String(appState.resources.mana);
        appData.intel.roster[0].manaWidth = manaWidth;
    }

    function refreshStaticPanels() {
        syncRosterUIState();
        renderTopbar();
        renderSidebar();
        renderIntelPanel();
        syncSidePanelChrome();
        if (needsMapLayerRebuild()) {
            renderMapLayer();
            if (overviewMapView && typeof overviewMapView.renderedCanvasChanged === 'function') {
                overviewMapView.renderedCanvasChanged();
            }
        }
        updateMapUI();
    }

    function syncPlannerModeState() {
        document.body.classList.toggle('mode-debug', isOverviewDebugMode());
        document.body.classList.toggle('mode-host', !isOverviewDebugMode());
        document.body.classList.toggle('is-allocating', appState.drawerOpen);
        document.body.classList.toggle('is-planning-phase', isPlanningPhase());
    }

    function refreshPlannerUI() {
        if (needsPlannerDrawerRebuild()) {
            renderPlannerDrawer();
        }
        if (needsPhaseBarRebuild()) {
            renderPhaseBar();
        }
        syncPlannerDrawerDOM();
        syncPhaseBarDOM();
        bindPlannerEvents();
        syncPlannerModeState();
    }

    function syncPlannerOpenState() {
        syncPlannerDrawerDOM();
        syncPhaseBarDOM();
        syncPlannerModeState();
    }

    function refreshAllUI() {
        refreshStaticPanels();
        refreshPlannerUI();
    }

    let overviewPlannerController = null;

    function createOverviewPlannerController() {
        return createOverviewGlobalModule('ACE0OverviewPlannerController', {
            appState,
            selectionState,
            RESOURCE_TYPE_MAP,
            normalizeResourceKey,
            canEditPhaseSlot,
            getOverviewPlannerRuntimeApi,
            createPlannerRuntimeContext,
            getPreferredSourceForKey,
            normalizeRestTintKey,
            getRestTintSource,
            getSelectedRestSlotToken,
            markActStateDirty,
            refreshAllUI,
            refreshPlannerUI,
            openRestTintPopup,
            getTotalInventoryCount
        });
    }

    function getOverviewPlannerController() {
        if (!overviewPlannerController) overviewPlannerController = createOverviewPlannerController();
        return overviewPlannerController;
    }

    let overviewExecutionController = null;

    function getOverviewExecutionController() {
        if (!overviewExecutionController) {
            overviewExecutionController = createOverviewGlobalModule('ACE0OverviewExecutionController', {
                adapterState,
                appData,
                appState,
                selectionState,
                areProgressionControlsEnabled,
                buildInitialDebugPayload,
                canAdvanceCurrentPhase,
                canEditPhaseSlot,
                canExecuteCurrentNode,
                canUseInteractivePlannerControls,
                chooseNextRoute,
                clearPendingLimitedTokens,
                closeRestTintPopup,
                commitActStateToHost,
                consumeReadyVisionReplacementLocally,
                createDefaultActStateForDashboard,
                createExecutionRuntimeContext,
                deepCloneValue,
                executeTokenEffect,
                finishNodeExecution,
                getCampaignTotalNodes,
                getCurrentNodeData,
                getCurrentVisionFixedPhasePrompt,
                getFixedPhaseKind,
                getOverviewExecutionRuntimeApi,
                getReadyVisionReplacementForPhase,
                getRouteOptions,
                getTotalInventoryCount,
                grantDailyReserveGrowth,
                isRouteSelectionActive,
                markActStateDirty,
                moveOrSwapSlotSelection,
                normalizePlannerEditMode,
                normalizeResourceKey,
                placeInventorySelection,
                refreshAllUI,
                refreshPlannerUI,
                removeOnePointFromPhaseSlot,
                resetPhaseSlots,
                resetSelection,
                returnSelectedSlotTokenToInventory,
                selectInventoryToken,
                selectSlotToken,
                setPlannerEditMode,
                setPlannerPage,
                setSelectedRestTint,
                shouldGrantReserveGrowthAtEndOfNode,
                startNode,
                syncPlannerOpenState,
                updateActStatePayloadAndCommit,
                extractWorldPayload
            });
        }
        return overviewExecutionController;
    }

    function resetSelection() {
        return getOverviewPlannerController().resetSelection();
    }

    function resetCampaignRuntimeState() {
        appState.currentNodeIndex = 1;
        appState.currentNodeId = getDefaultPresentNodeId(getNodeTemplate(1)) || 'node1';
        appState.currentPhaseIndex = 0;
        appState.executing = false;
        appState.drawerOpen = false;
        appState.awaitingRouteChoice = false;
        appState.routeHistory = [appState.currentNodeId];
        appState.reserveProgress = Object.fromEntries(RESOURCE_KEYS.map((key) => [key, 0]));
        appState.incomeRate = Object.fromEntries(RESOURCE_KEYS.map((key) => [key, 0.2]));
        appState.incomeProgress = Object.fromEntries(RESOURCE_KEYS.map((key) => [key, 0]));
        appState.inventory = Object.fromEntries(RESOURCE_KEYS.map((key) => [key, { reserve: 0, limited: 0 }]));
        appState.phaseSlots = Object.fromEntries(PHASE_SLOT_IDS.map((slotId) => [slotId, null]));
        appState.resources = { ...INITIAL_RESOURCES };
        resetSelection();
    }

    function rerollCampaignSeed() {
        const nextActState = createDefaultActStateForDashboard(getCurrentChapterId());
        nextActState.seed = createRuntimeSeed();
        primeCampaignFromActState(nextActState, { persistSnapshot: true });
        resetCampaignRuntimeState();
        startNode(1, appState.currentNodeId);
        refreshAllUI();
    }

    function selectInventoryToken(type) {
        return getOverviewPlannerController().selectInventoryToken(type);
    }

    function selectSlotToken(slotId) {
        return getOverviewPlannerController().selectSlotToken(slotId);
    }

    function setSelectedRestTint(tintKey) {
        return getOverviewPlannerController().setSelectedRestTint(tintKey);
    }

    function placeInventorySelection(slotId) {
        return getOverviewPlannerController().placeInventorySelection(slotId);
    }

    function moveOrSwapSlotSelection(targetSlotId) {
        return getOverviewPlannerController().moveOrSwapSlotSelection(targetSlotId);
    }

    function returnSelectedSlotTokenToInventory() {
        return getOverviewPlannerController().returnSelectedSlotTokenToInventory();
    }

    function removeOnePointFromPhaseSlot(slotId) {
        return getOverviewPlannerController().removeOnePointFromPhaseSlot(slotId);
    }

    function grantDebugResource(key, amount = 1, source = 'reserve') {
        return getOverviewDebugController().grantDebugResource(key, amount, source);
    }

    function getDebugEncounterContext() {
        return getOverviewDebugController().getDebugEncounterContext();
    }

    function setDebugEncounterNumericField(field, value) {
        return getOverviewDebugController().setDebugEncounterNumericField(field, value);
    }

    function advanceDebugActWithModule(stepCount = 1) {
        return getOverviewDebugController().advanceDebugActWithModule(stepCount);
    }

    function handleDebugActAction(action, target) {
        return getOverviewDebugController().handleDebugActAction(action, target);
    }

    function applyCurrentPhaseVisionChoice(action, replacementKeyValue = '') {
        return getOverviewExecutionController().applyCurrentPhaseVisionChoice(action, replacementKeyValue);
    }

    function executeTokenEffect(token) {
        return getOverviewExecutionController().executeTokenEffect(token);
    }

    function finishNodeExecution() {
        return getOverviewExecutionController().finishNodeExecution();
    }

    function consumeReadyVisionReplacementLocally(replacement) {
        return getOverviewExecutionController().consumeReadyVisionReplacementLocally(replacement);
    }

    function advanceSinglePhase(options = {}) {
        return getOverviewExecutionController().advanceSinglePhase(options);
    }

    function executeCurrentNode() {
        return getOverviewExecutionController().executeCurrentNode();
    }

    function chooseNextRoute(nodeId) {
        return getOverviewExecutionController().chooseNextRoute(nodeId);
    }

    function bindPlannerEvents() {
        return getOverviewExecutionController().bindPlannerEvents();
    }

    function handlePhaseSlotPointer(slotId) {
        if (!slotId) return;
        if (!canUseInteractivePlannerControls()) return;
        if (isRouteSelectionActive()) return;
        if (!canEditPhaseSlot(slotId)) return;

        const mounted = appState.phaseSlots[slotId];
        if (normalizePlannerEditMode(appState.plannerEditMode) === 'remove') {
            removeOnePointFromPhaseSlot(slotId);
            return;
        }

        if (selectionState.source === 'inventory') {
            placeInventorySelection(slotId);
            return;
        }

        if (selectionState.source === 'slot') {
            if (selectionState.slotId === slotId) {
                syncPlannerOpenState();
                return;
            }
            moveOrSwapSlotSelection(slotId);
            return;
        }

        if (!mounted) return;
        selectSlotToken(slotId);
        if (mounted.key === 'rest') {
            setPlannerPage('rest');
            appState.drawerOpen = true;
        }
        syncPlannerOpenState();
    }

    sysTopbar.addEventListener('pointerdown', (e) => {
        const commitActButton = e.target.closest('#commit-act-state');
        if (commitActButton) {
            e.preventDefault();
            commitActStateToHost();
            return;
        }

        const routeOptionButton = e.target.closest('.route-option-btn');
        if (routeOptionButton) {
            e.preventDefault();
            e.stopPropagation();
            chooseNextRoute(routeOptionButton.dataset.nodeId);
        }
    });

    document.addEventListener('pointerdown', (e) => {
        const routeOptionButton = e.target.closest('.route-option-btn');
        if (routeOptionButton) {
            e.preventDefault();
            e.stopPropagation();
            chooseNextRoute(routeOptionButton.dataset.nodeId);
            return;
        }

        const visionPhaseButton = e.target.closest('[data-vision-phase-action]');
        if (visionPhaseButton) {
            e.preventDefault();
            e.stopPropagation();
            const action = visionPhaseButton.dataset.visionPhaseAction;
            applyCurrentPhaseVisionChoice(action, visionPhaseButton.dataset.replacementKey);
            return;
        }

        const editModeButton = e.target.closest('[data-planner-edit-mode]');
        if (editModeButton) {
            e.preventDefault();
            e.stopPropagation();
            const nextMode = normalizePlannerEditMode(editModeButton.dataset.plannerEditMode);
            setPlannerEditMode(nextMode);
            if (nextMode === 'remove') {
                closeRestTintPopup();
                resetSelection();
                setPlannerPage('planner');
            }
            appState.drawerOpen = true;
            refreshPlannerUI();
            return;
        }

        const plannerTabButton = e.target.closest('[data-planner-tab]');
        if (plannerTabButton) {
            e.preventDefault();
            e.stopPropagation();
            const requestedTab = plannerTabButton.dataset.plannerTab;
            const activePage = getActivePlannerPage();
            const isSameResourceTab = RESOURCE_KEYS.includes(requestedTab)
                && appState.drawerOpen
                && activePage === requestedTab;
            if (isSameResourceTab) {
                resetSelection();
                setPlannerPage('planner');
                appState.drawerOpen = true;
                refreshPlannerUI();
                return;
            }
            if (normalizePlannerEditMode(appState.plannerEditMode) === 'remove') setPlannerEditMode('add');
            if (RESOURCE_KEYS.includes(requestedTab)) {
                if (getTotalInventoryCount(requestedTab) > 0) selectInventoryToken(requestedTab);
                else resetSelection();
            }
            setPlannerPage(requestedTab);
            appState.drawerOpen = true;
            refreshPlannerUI();
            return;
        }

        const assetActionButton = e.target.closest('[data-asset-action]');
        if (assetActionButton) {
            e.preventDefault();
            e.stopPropagation();
            handleAssetDeckAction(assetActionButton);
            return;
        }

        if (e.target.matches?.('input[data-debug-action]')) return;
        const debugActionButton = e.target.closest('[data-debug-action]');
        if (!debugActionButton) return;
        e.preventDefault();
        e.stopPropagation();
        handleDebugActAction(debugActionButton.dataset.debugAction, debugActionButton);
    });

    document.addEventListener('change', (e) => {
        const input = e.target.closest?.('input[data-debug-action]');
        if (!input) return;
        const action = input.dataset.debugAction;
        if (action === 'set-encounter-funds') {
            setDebugEncounterNumericField('funds', input.value);
        }
    });

    phaseBarMount.addEventListener('pointerdown', (e) => {
        const commitActButton = e.target.closest('#commit-act-state');
        if (commitActButton) {
            e.preventDefault();
            commitActStateToHost();
            return;
        }

        const phaseSlot = e.target.closest('.phase-core.drop-zone');
        if (phaseSlot && phaseBarMount.contains(phaseSlot)) {
            e.preventDefault();
            e.stopPropagation();
            handlePhaseSlotPointer(phaseSlot.id);
            return;
        }

        const togglePlannerButton = e.target.closest('#toggle-planner');
        if (!togglePlannerButton) return;
        e.preventDefault();
        if (!canOpenPlannerDrawer()) return;
        if (isRouteSelectionActive()) return;
        if (appState.drawerOpen) {
            appState.drawerOpen = false;
            setPlannerPage('planner');
        } else {
            appState.drawerOpen = true;
            setPlannerPage('planner');
        }
        syncPlannerOpenState();
    });

    layer.addEventListener('pointerdown', (e) => {
        const node = e.target.closest('.az-node');
        if (!node) return;
        if (!isRouteSelectionActive()) return;
        e.preventDefault();
        e.stopPropagation();
        chooseNextRoute(node.id);
    });

    document.addEventListener('click', (e) => {
        const keepAction = e.target.closest('#toggle-planner, #commit-act-state, .route-option-btn, [data-debug-action], [data-vision-phase-action], [data-planner-tab], [data-planner-edit-mode], [data-asset-action]');
        if (keepAction) return;

        const keep = e.target.closest('.token-dispenser, .phase-core.drop-zone, .mounted-token, #inventory, .view, .asset-layout, .az-node');
        if (keep || !selectionState.source) return;
        resetSelection();
        syncPlannerOpenState();
    });

    function createOverviewMapView() {
        return createOverviewGlobalModule('ACE0OverviewMapView', {
            appData,
            appState,
            getViewport: () => document.getElementById('mapViewport'),
            getLayer: () => layer,
            getCanvas: () => document.getElementById('fate-canvas'),
            getMapLayerMeta: () => document.getElementById('map-layer-meta'),
            getMapFocusNodeId,
            getNodeData,
            getMapNodes,
            getMapColumns,
            getMapTopology,
            getRenderedMapTopology,
            isConnectionVisibleInMapFog,
            getCurrentNodeData,
            isBossNodeId,
            isFinaleNodeId,
            getCampaignTotalNodes,
            isVisitedConnection,
            getVisionSightValue,
            getNodeIndex,
            getCurrentNodeTemplate,
            getNodeDebugLabel,
            shouldShowMapProgressMeta,
            isRouteSelectionActive,
            isPlanningPhase,
            buildCurrentActStateSnapshot,
            normalizeResourceKey,
            normalizeRestTintKey,
            getRouteOptions,
            isImmediateNextNode,
            isNodeInVisionRange,
            isNodeDetailVisible,
            isNodeTemporarilyRevealedByIntel,
            getEncounterMarkersForNode,
            buildEncounterBadgeMarkup,
            getCurrentColumnLineClass,
            isColumnVisibleInMapFog
        }, { required: false });
    }

    function initSVGPaths() {
        if (overviewMapView) overviewMapView.rebuild();
    }

    function ensureDrawLoop() {
        if (overviewMapView) overviewMapView.start();
    }

    function registerDashboardDebugApi() {
        window.ACE0DashboardDebug = {
            getMode() {
                return adapterState.mode;
            },
            getPayload() {
                return deepCloneValue(adapterState.lastPayload || buildInitialDebugPayload());
            },
            getActState() {
                return deepCloneValue(extractWorldPayload(adapterState.lastPayload || buildInitialDebugPayload())?.act || null);
            },
            setPayload(payload) {
                switchDashboardAdapter('debug');
                const nextPayload = buildNormalizedDashboardPayload(payload) || deepCloneValue(payload);
                writeStoredDebugPayload(nextPayload);
                applyActStateFromPayload(nextPayload);
                return this.getPayload();
            },
            setSnapshot(snapshot) {
                const nextSnapshot = deepCloneValue(snapshot);
                const actState = nextSnapshot?.actState && typeof nextSnapshot.actState === 'object'
                    ? nextSnapshot.actState
                    : createDefaultActStateForDashboard(nextSnapshot?.chapterId);
                const payload = buildNormalizedDashboardPayload(createDebugPayloadFromActState(actState), {
                    actState,
                    frontendSnapshot: nextSnapshot
                });
                return this.setPayload(payload);
            },
            patchActState(patch) {
                const currentPayload = this.getPayload();
                const currentActState = extractWorldPayload(currentPayload)?.act || createDefaultActStateForDashboard();
                const nextActState = mergePlainObjects(currentActState, patch || {});
                const nextPayload = buildNormalizedDashboardPayload(currentPayload, {
                    actState: nextActState,
                    forceActDerivedSnapshot: true
                });
                return this.setPayload(nextPayload);
            },
            grantResource(key, amount = 1, source = 'reserve') {
                switchDashboardAdapter('debug');
                grantDebugResource(key, amount, source);
                commitActStateToHost();
                return this.getPayload();
            },
            setIncomeRate(key, value) {
                const normalizedKey = normalizeResourceKey(key, '');
                if (!normalizedKey) return this.getPayload();
                return this.patchActState({
                    income_rate: {
                        [normalizedKey]: Math.max(0, Math.min(1.5, Number(value) || 0))
                    }
                });
            },
            reset() {
                clearStoredDebugPayload();
                try { delete window[DASHBOARD_DEBUG_GLOBAL_PAYLOAD_KEY]; } catch (_) { window[DASHBOARD_DEBUG_GLOBAL_PAYLOAD_KEY] = undefined; }
                try { delete window[DASHBOARD_DEBUG_GLOBAL_SNAPSHOT_KEY]; } catch (_) { window[DASHBOARD_DEBUG_GLOBAL_SNAPSHOT_KEY] = undefined; }
                try { delete window[DASHBOARD_DEBUG_GLOBAL_ACT_STATE_KEY]; } catch (_) { window[DASHBOARD_DEBUG_GLOBAL_ACT_STATE_KEY] = undefined; }
                switchDashboardAdapter('debug');
                adapterState.lastPayload = null;
                adapterState.lastFrontendSnapshot = null;
                const payload = createDebugPayloadFromActState(createDefaultActStateForDashboard(DEFAULT_DASHBOARD_CHAPTER_ID));
                writeStoredDebugPayload(payload);
                applyActStateFromPayload(payload);
                return this.getPayload();
            },
            rerender() {
                refreshAllUI();
                if (overviewMapView) overviewMapView.rebuild();
                else initSVGPaths();
            },
            async commit() {
                switchDashboardAdapter('debug');
                await commitActStateToHost();
                return this.getPayload();
            }
        };
    }

    async function bootstrapDashboard() {
        const adapter = ensureDashboardAdapter();
        if (typeof adapter.bootstrap === 'function') {
            try {
                await adapter.bootstrap();
            } catch (error) {
                console.warn('[ACE0 DASHBOARD] adapter bootstrap failed:', error);
            }
        }
        if (adapterState.mode === 'host' && !hasUsableCampaignNodes(appData.campaign) && !adapterState.lastFrontendSnapshot) {
            return;
        }
        refreshAllUI();
        if (overviewMapView) {
            overviewMapView.rebuild();
            overviewMapView.start();
        } else {
            initSVGPaths();
            ensureDrawLoop();
        }
    }

    registerDashboardDebugApi();
    window.addEventListener('message', handleActHostMessage);
    bootstrapDashboard();

    window.__acezeroHomeRefreshIntel = function acezeroHomeRefreshIntel() {
        try { renderIntelPanel(); } catch (err) { console.warn('[home-page] refresh intel failed', err); }
    };

    window.__acezeroHomePageActive = function acezeroHomePageActive(isActive) {
        if (overviewMapView) {
            overviewMapView.setActive(isActive);
        }
    };
