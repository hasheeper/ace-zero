// Overview page is now a thin engine layer.
// Static chapter config and legacy generation live in sibling modules under this directory.

const OVERVIEW_CONFIG_REGISTRY = (typeof window !== 'undefined' && window.ACE0_OVERVIEW_CONFIGS && typeof window.ACE0_OVERVIEW_CONFIGS === 'object')
    ? window.ACE0_OVERVIEW_CONFIGS
    : {};
const DEFAULT_DASHBOARD_CHAPTER_ID = 'chapter0_exchange';
const WORLD_CLOCK_PHASES = ['MORNING', 'NOON', 'AFTERNOON', 'NIGHT'];
const DEFAULT_WORLD_CLOCK = Object.freeze({ day: 1, phase: 'MORNING' });
const WORLD_LOCATION_LAYERS = ['THE_COURT', 'THE_EXCHANGE', 'THE_STREET', 'THE_RUST'];
const WORLD_LOCATION_LAYER_LABELS = Object.freeze({
    THE_COURT: '上庭',
    THE_EXCHANGE: '中市',
    THE_STREET: '下街',
    THE_RUST: '底锈'
});
const DASHBOARD_HERO_CODE_BY_KEY = Object.freeze({
    kazu: 'KAZU',
    rino: 'RINO',
    sia: 'SIA',
    poppy: 'POPPY',
    vv: 'VV',
    trixie: 'TRIXIE',
    cota: 'COTA',
    eulalia: 'EULALIA',
    kako: 'KAKO',
    kuzuha: 'KUZUHA'
});

const DEFAULT_DEBUG_CONFIG = Object.freeze({
    chapterId: DEFAULT_DASHBOARD_CHAPTER_ID,
    campaign: {
        seed: 'AUTO-DEMO',
        totalNodes: 1,
        rules: {
            requireScheduleAllLimited: true,
            reserveGrowthTiming: 'end_of_node'
        },
        reserveGrowthByNode: [],
        days: []
    },
    fixedPhaseMarkers: {}
});

const DEFAULT_TAVERN_CONFIG = Object.freeze({
    campaign: {
        seed: '',
        totalNodes: 1,
        rules: {
            requireScheduleAllLimited: true,
            reserveGrowthTiming: 'end_of_node'
        },
        reserveGrowthByNode: [],
        days: []
    },
    fixedPhaseMarkers: {}
});

const DEBUG_OVERVIEW_CONFIG = Object.freeze(
    JSON.parse(JSON.stringify(OVERVIEW_CONFIG_REGISTRY.debug || DEFAULT_DEBUG_CONFIG))
);
const TAVERN_OVERVIEW_CONFIG = Object.freeze(
    JSON.parse(JSON.stringify(OVERVIEW_CONFIG_REGISTRY.tavern || DEFAULT_TAVERN_CONFIG))
);

function cloneOverviewConfigValue(value, fallback) {
    try {
        return JSON.parse(JSON.stringify(value == null ? fallback : value));
    } catch (_) {
        return JSON.parse(JSON.stringify(fallback));
    }
}

function getOverviewConfigProfile(mode = 'debug') {
    return mode === 'host' ? TAVERN_OVERVIEW_CONFIG : DEBUG_OVERVIEW_CONFIG;
}

function getOverviewFallbackCampaign(mode = 'debug') {
    if (mode === 'host') {
        return cloneOverviewConfigValue(DEFAULT_TAVERN_CONFIG.campaign, DEFAULT_TAVERN_CONFIG.campaign);
    }
    return cloneOverviewConfigValue(getOverviewConfigProfile(mode).campaign, DEFAULT_DEBUG_CONFIG.campaign);
}

function getOverviewFallbackFixedPhaseMarkers(mode = 'debug') {
    if (mode === 'host') {
        return cloneOverviewConfigValue(DEFAULT_TAVERN_CONFIG.fixedPhaseMarkers, DEFAULT_TAVERN_CONFIG.fixedPhaseMarkers);
    }
    return cloneOverviewConfigValue(getOverviewConfigProfile(mode).fixedPhaseMarkers, DEFAULT_DEBUG_CONFIG.fixedPhaseMarkers);
}

function hasUsableCampaignNodes(campaign) {
    return Array.isArray(campaign?.nodes) && campaign.nodes.length > 0;
}

function detectInitialOverviewMode() {
    try {
        const forcedMode = typeof window.ACE0_OVERVIEW_BOOT_MODE === 'string'
            ? window.ACE0_OVERVIEW_BOOT_MODE.trim().toLowerCase()
            : '';
        if (forcedMode === 'host' || forcedMode === 'debug') return forcedMode;
    } catch (_) {}

    try {
        const params = new URLSearchParams(window.location.search || '');
        const debugValue = typeof params.get('debug') === 'string' ? params.get('debug').trim().toLowerCase() : '';
        if (['1', 'true', 'yes', 'on', 'debug'].includes(debugValue)) return 'debug';
    } catch (_) {}

    try {
        if (window.__ACE0_DEBUG_PAYLOAD__ || window.__ACE0_DEBUG_SNAPSHOT__ || window.__ACE0_DEBUG_ACT_STATE__) {
            return 'debug';
        }
    } catch (_) {}

    try {
        if (window.localStorage.getItem('ace0.dashboard.debugPayload')) return 'debug';
    } catch (_) {}

    try {
        if (window.parent && window.parent !== window) return 'host';
    } catch (_) {}

    return 'debug';
}

const INITIAL_OVERVIEW_MODE = detectInitialOverviewMode();

function canUseOverviewFallbackData(mode = INITIAL_OVERVIEW_MODE) {
    return mode !== 'host';
}

// Runtime module accessors: overview/index.js only bridges these modules into UI state.

function getOverviewCampaignRuntimeApi() {
    const api = typeof window !== 'undefined' ? window.ACE0OverviewCampaignRuntime : null;
    return api && typeof api === 'object' ? api : null;
}

function getOverviewPlannerRuntimeApi() {
    const api = typeof window !== 'undefined' ? window.ACE0OverviewPlannerRuntime : null;
    return api && typeof api === 'object' ? api : null;
}

function getOverviewExecutionRuntimeApi() {
    const api = typeof window !== 'undefined' ? window.ACE0OverviewExecutionRuntime : null;
    return api && typeof api === 'object' ? api : null;
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
        setCurrentFocusNodeId(nextNodeId) {
            currentFocusNodeId = nextNodeId;
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

const appData = {
        runtime: {
            progression: {
                enabled: true,
                allowRouteSelection: true,
                allowPhaseAdvance: true,
                allowNodeAdvance: true,
                showSeedChip: true,
                showGenerationTags: true,
                showMapProgressMeta: true
            }
        },
        topbar: {
            actLabel: 'ACT',
            actTitleCn: '命运宏图',
            // 阶段2：节点序列指示（NODE 最新值 / 总节点数），与世界日无关
            nodeLabel: 'NODE',
            nodeIndexValue: '01/05',
            nodePoolLabel: 'NODES',
            nodePool: [
                { key: 'combat', title: '交锋', icon: '◆', count: 0, className: 'stat-combat' },
                { key: 'rest', title: '休整', icon: '●', count: 0, className: 'stat-rest' },
                { key: 'asset', title: '资产', icon: '■', count: 0, className: 'stat-asset' },
                { key: 'vision', title: '视野', icon: '⬢', count: 0, className: 'stat-vision' }
            ],
        resources: [
                { label: 'FUNDS', value: '1,250', className: 'res-gold' },
                { label: 'ASSETS', value: '0', className: 'res-assets' },
                { label: 'MAJOR DEBT', value: '395,000,000', className: 'res-danger' },
                { label: 'DEBT', value: '0', className: 'res-debt' }
            ]
        },
        sidebar: {
            heroTitle: 'CHRONICLE',
            heroSubtitle: '命运丝线记录',
            branches: [
                {
                    title: 'DEMO: THE RUST',
                    icon: '[-]',
                    state: 'is-active'
                }
            ]
        },
        map: {
            focusNodeId: 'node1',
            layout: {
                startX: 48,
                columnGap: 280,
                centerY: 600,
                spreadThree: 240,
                spreadTwo: 130
            }
        },
        planner: {
            header: 'PLANNER',
            toggleClosedLabel: 'ALLOCATE',
            toggleOpenLabel: 'CLOSE',
            executeIdleLabel: '',
            executeReadyLabel: 'ADVANCE NODE',
            executeWorkingLabel: 'EXECUTING...',
            inventory: [
                { key: 'combat', type: 'COMBAT', label: '交锋', sublabel: 'L0 / R0', count: 0 },
                { key: 'rest', type: 'REST', label: '休整', sublabel: 'L0 / R0', count: 0 },
                { key: 'asset', type: 'ASSET', label: '资产', sublabel: 'L0 / R0', count: 0 },
                { key: 'vision', type: 'VISION', label: '视野', sublabel: 'L0 / R0', count: 0 }
            ],
            // slotId/key 为 DOM 稳定标识，保留既有命名不改；
            // 显示字符串改为罗马数字 I~IV，不再使用中文段位文案。
            phases: [
                { key: 'seg-1', phase: 'SEG 1', title: 'I', state: 'active', left: '12.5%', slotId: 'slot-seg-1' },
                { key: 'seg-2', phase: 'SEG 2', title: 'II', state: 'future', left: '37.5%', slotId: 'slot-seg-2' },
                { key: 'seg-3', phase: 'SEG 3', title: 'III', state: 'future', left: '62.5%', slotId: 'slot-seg-3' },
                { key: 'seg-4', phase: 'SEG 4', title: 'IV', state: 'future', left: '87.5%', slotId: 'slot-seg-4' }
            ]
        },
        intel: {
            nodeIndexLabel: 'NODE 01',
            title: 'OPENING EVENT',
            subtitle: '固定起始点 / 限定事件点',
            rewardsTitle: 'NODE TOKENS',
            rewards: [],
            rosterTitle: 'PARTY',
            roster: [
                {
                    className: 'main-hand',
                    avatar: 'R',
                    roleLabel: 'MAIN_HAND',
                    levelLabel: 'LV 03',
                    name: '天宫理乃',
                    manaValue: '85',
                    manaWidth: '85%',
                    traits: [
                        { icon: '♥', className: 'icon-moirai active' },
                        { icon: '♠', className: 'icon-chaos' },
                        { icon: '♦', className: 'icon-psyche' },
                        { icon: '♣', className: 'icon-void' }
                    ]
                },
                {
                    className: 'sub-hand',
                    avatar: 'S',
                    roleLabel: 'SUB_HAND',
                    levelLabel: 'LV 02',
                    name: '夜伽希亚',
                    manaValue: '60',
                    manaWidth: '60%',
                    traits: [
                        { icon: '♥', className: 'icon-moirai' },
                        { icon: '♠', className: 'icon-chaos active' },
                        { icon: '♦', className: 'icon-psyche' },
                        { icon: '♣', className: 'icon-void' }
                    ]
                }
            ]
        },
        campaign: getOverviewFallbackCampaign(INITIAL_OVERVIEW_MODE)
    };

    const RESOURCE_KEYS = ['combat', 'rest', 'asset', 'vision'];
    const RESOURCE_ALIASES = {
        contract: 'asset',
        event: 'vision'
    };
    const RESOURCE_TYPE_MAP = {
        combat: 'COMBAT',
        rest: 'REST',
        asset: 'ASSET',
        vision: 'VISION'
    };
    const RESOURCE_LABEL_MAP = {
        combat: '交锋',
        rest: '休整',
        asset: '资产',
        vision: '视野'
    };
    const REST_CONTROL_TINT_KEYS = ['neutral', ...RESOURCE_KEYS];
    const ENCOUNTER_DEBUG_CHARACTER_KEYS = ['SIA', 'TRIXIE', 'POPPY', 'COTA', 'VV', 'KUZUHA', 'KAKO', 'EULALIA'];
    const PHASE_SLOT_IDS = appData.planner.phases.map((phase) => phase.slotId);
    const appState = {
        currentNodeIndex: 1,
        currentNodeId: 'node1',
        currentPhaseIndex: 0,
        worldClock: { ...DEFAULT_WORLD_CLOCK },
        executing: false,
        drawerOpen: false,
        encounterDebugOpen: false,
        awaitingRouteChoice: false,
        routeHistory: ['node1'],
        reserveProgress: Object.fromEntries(RESOURCE_KEYS.map((key) => [key, 0])),
        incomeRate: Object.fromEntries(RESOURCE_KEYS.map((key) => [key, 0.2])),
        incomeProgress: Object.fromEntries(RESOURCE_KEYS.map((key) => [key, 0])),
        inventory: Object.fromEntries(RESOURCE_KEYS.map((key) => [key, { reserve: 0, limited: 0 }])),
        phaseSlots: Object.fromEntries(PHASE_SLOT_IDS.map((slotId) => [slotId, null])),
        resources: {
            funds: 1250,
            assets: 0,
            mana: 45,
            majorDebt: 395000000,
            debt: 0
        }
    };
    const INITIAL_RESOURCES = { ...appState.resources };
    const ACT_MESSAGE_TYPES = new Set(['ACE0_ACT_INIT', 'ACE0_ACT_REFRESH', 'ACE0_DASHBOARD_INIT', 'ACE0_DASHBOARD_REFRESH']);
    const ACT_OUTBOUND_MESSAGE_TYPES = {
        commit: 'ACE0_ACT_COMMIT'
    };
    const ACT_INBOUND_MESSAGE_TYPES = {
        commitResult: 'ACE0_ACT_COMMIT_RESULT'
    };
    const selectionState = { source: null, type: null, slotId: null };
    const syncState = {
        dirty: false,
        saving: false,
        pendingRequestId: '',
        pendingTimer: null,
        statusText: 'SYNCED TO MVU',
        errorText: ''
    };
    const DASHBOARD_DEBUG_STORAGE_KEY = 'ace0.dashboard.debugPayload';
    const DASHBOARD_DEBUG_GLOBAL_PAYLOAD_KEY = '__ACE0_DEBUG_PAYLOAD__';
    const DASHBOARD_DEBUG_GLOBAL_SNAPSHOT_KEY = '__ACE0_DEBUG_SNAPSHOT__';
    const DASHBOARD_DEBUG_GLOBAL_ACT_STATE_KEY = '__ACE0_DEBUG_ACT_STATE__';

    // Adapter state: host mode for Tavern injection, debug mode for standalone browser iteration.
const adapterState = {
        mode: INITIAL_OVERVIEW_MODE,
        adapter: null,
        lastPayload: null,
        lastFrontendSnapshot: null
    };

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

    function readStoredDebugPayload() {
        try {
            const raw = window.localStorage.getItem(DASHBOARD_DEBUG_STORAGE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : null;
        } catch (_) {
            return null;
        }
    }

    function writeStoredDebugPayload(payload) {
        try {
            window.localStorage.setItem(DASHBOARD_DEBUG_STORAGE_KEY, JSON.stringify(payload));
        } catch (_) {}
    }

    function clearStoredDebugPayload() {
        try {
            window.localStorage.removeItem(DASHBOARD_DEBUG_STORAGE_KEY);
        } catch (_) {}
    }

    function extractFrontendSnapshot(payload) {
        if (!payload || typeof payload !== 'object') return null;
        if (payload.frontendSnapshot && typeof payload.frontendSnapshot === 'object') return payload.frontendSnapshot;
        if (payload.data?.frontendSnapshot && typeof payload.data.frontendSnapshot === 'object') return payload.data.frontendSnapshot;
        if (payload.payload?.frontendSnapshot && typeof payload.payload.frontendSnapshot === 'object') return payload.payload.frontendSnapshot;
        return null;
    }

    function shouldIgnoreStoredDebugPayload(payload) {
        const actState = extractWorldPayload(payload)?.act;
        if (!actState || typeof actState !== 'object') return false;
        const actId = typeof actState.id === 'string' ? actState.id.trim() : '';
        if (actId && actId !== 'demo_rust') return false;
        const snapshot = extractFrontendSnapshot(payload);
        const snapshotNodes = snapshot?.campaign?.nodes || snapshot?.nodes;
        return !Array.isArray(snapshotNodes) || snapshotNodes.length === 0;
    }

    function getActModuleApi() {
        const modules = window.ACE0Modules;
        return modules && typeof modules === 'object' && modules.act && typeof modules.act === 'object'
            ? modules.act
            : null;
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
            crisis: 0,
            crisisSignals: [],
            vision: { baseSight: 1, bonusSight: 0, jumpReady: false, pendingReplace: null },
            resourceSpent: createEmptyActResourceCounts(0),
            characterEncounter: {},
            pendingFirstMeet: {},
            pendingResolutions: [],
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
        const source = sourcePayload && typeof sourcePayload === 'object'
            ? deepCloneValue(sourcePayload)
            : {};
        const sourceHero = extractHeroPayload(source);
        const sourceWorld = extractWorldPayload(source);
        const optionHero = options.hero && typeof options.hero === 'object' ? deepCloneValue(options.hero) : null;
        const optionWorld = options.world && typeof options.world === 'object' ? deepCloneValue(options.world) : null;

        const hero = sourceHero && typeof sourceHero === 'object'
            ? deepCloneValue(sourceHero)
            : (optionHero || {});
        const world = sourceWorld && typeof sourceWorld === 'object'
            ? deepCloneValue(sourceWorld)
            : (optionWorld || {});

        let actState = options.actState && typeof options.actState === 'object'
            ? deepCloneValue(options.actState)
            : (world?.act && typeof world.act === 'object' ? deepCloneValue(world.act) : null);

        let frontendSnapshot = options.frontendSnapshot && typeof options.frontendSnapshot === 'object'
            ? deepCloneValue(options.frontendSnapshot)
            : extractFrontendSnapshot(source);

        if (options.forceActDerivedSnapshot && actState) {
            frontendSnapshot = createFrontendSnapshotForActState(actState);
        }

        if ((!frontendSnapshot || typeof frontendSnapshot !== 'object') && actState) {
            frontendSnapshot = createFrontendSnapshotForActState(actState);
        }

        if (!actState && frontendSnapshot?.actState && typeof frontendSnapshot.actState === 'object') {
            actState = deepCloneValue(frontendSnapshot.actState);
        }

        if (!actState && (!frontendSnapshot || typeof frontendSnapshot !== 'object')) {
            return null;
        }

        if (actState) {
            if (!world || typeof world !== 'object') {
                return null;
            }
            world.act = deepCloneValue(actState);
        }

        return {
            ...source,
            hero,
            world,
            frontendSnapshot: frontendSnapshot && typeof frontendSnapshot === 'object'
                ? deepCloneValue(frontendSnapshot)
                : null
        };
    }

    function createDebugPayloadFromActState(actState) {
        const nextActState = deepCloneValue(actState);
        return buildNormalizedDashboardPayload({}, {
            hero: {
                funds: appState.resources.funds,
                assets: appState.resources.assets,
                debt: appState.resources.debt,
                majorDebt: appState.resources.majorDebt,
                roster: {
                    KAZU: {
                        mana: appState.resources.mana
                    }
                }
            },
            actState: nextActState,
            forceActDerivedSnapshot: true
        });
    }

    function buildInitialDebugPayload() {
        const globalPayload = window[DASHBOARD_DEBUG_GLOBAL_PAYLOAD_KEY];
        if (globalPayload && typeof globalPayload === 'object' && extractWorldPayload(globalPayload)?.act) {
            return buildNormalizedDashboardPayload(globalPayload, {
                actState: applyDebugUrlOverridesToActState(extractWorldPayload(globalPayload)?.act),
                forceActDerivedSnapshot: true
            }) || deepCloneValue(globalPayload);
        }

        const storedPayload = readStoredDebugPayload();
        if (storedPayload && extractWorldPayload(storedPayload)?.act) {
            if (!shouldIgnoreStoredDebugPayload(storedPayload)) {
                return buildNormalizedDashboardPayload(storedPayload, {
                    actState: applyDebugUrlOverridesToActState(extractWorldPayload(storedPayload)?.act),
                    forceActDerivedSnapshot: true
                }) || deepCloneValue(storedPayload);
            }
            clearStoredDebugPayload();
        }

        const globalActState = window[DASHBOARD_DEBUG_GLOBAL_ACT_STATE_KEY];
        if (globalActState && typeof globalActState === 'object') {
            return createDebugPayloadFromActState(applyDebugUrlOverridesToActState(globalActState));
        }

        const globalSnapshot = window[DASHBOARD_DEBUG_GLOBAL_SNAPSHOT_KEY];
        if (globalSnapshot && typeof globalSnapshot === 'object') {
            const actState = globalSnapshot.actState && typeof globalSnapshot.actState === 'object'
                ? globalSnapshot.actState
                : createDefaultActStateForDashboard(globalSnapshot.chapterId);
            const payload = createDebugPayloadFromActState(applyDebugUrlOverridesToActState(actState));
            payload.frontendSnapshot = deepCloneValue(globalSnapshot);
            return payload;
        }

        return createDebugPayloadFromActState(applyDebugUrlOverridesToActState(createDefaultActStateForDashboard()));
    }

    function normalizeHostPayload(payload) {
        if (!payload || typeof payload !== 'object') return null;
        const hostWorld = extractWorldPayload(payload);
        const hostActState = hostWorld?.act && typeof hostWorld.act === 'object'
            ? hostWorld.act
            : null;
        const hostFrontendSnapshot = extractFrontendSnapshot(payload);
        return buildNormalizedDashboardPayload(payload, {
            actState: hostActState,
            frontendSnapshot: hostFrontendSnapshot
        });
    }

    function shouldUseDebugAdapterByDefault() {
        const forcedMode = typeof window.ACE0_OVERVIEW_BOOT_MODE === 'string'
            ? window.ACE0_OVERVIEW_BOOT_MODE.trim().toLowerCase()
            : '';
        if (forcedMode === 'host') return false;
        if (forcedMode === 'debug') return true;
        const params = getSearchParams();
        if (isTruthyQueryValue(params.get('debug'))) return true;
        if (isTruthyQueryValue(params.get('host'))) return false;
        if (window[DASHBOARD_DEBUG_GLOBAL_PAYLOAD_KEY] || window[DASHBOARD_DEBUG_GLOBAL_SNAPSHOT_KEY] || window[DASHBOARD_DEBUG_GLOBAL_ACT_STATE_KEY]) {
            return true;
        }
        try {
            if (window.parent && window.parent !== window) return false;
        } catch (_) {}
        if (readStoredDebugPayload()) return true;
        return true;
    }

    function createHostAdapter() {
        return {
            mode: 'host',
            async bootstrap() {
                return false;
            },
            async commitActState(commitPayload) {
                return { mode: 'host', commitPayload };
            }
        };
    }

    function createDebugAdapter() {
        return {
            mode: 'debug',
            async bootstrap() {
                const payload = buildInitialDebugPayload();
                writeStoredDebugPayload(payload);
                applyActStateFromPayload(payload);
                return true;
            },
            async commitActState(commitPayload) {
                const debugPayload = {
                    ...(adapterState.lastPayload || {}),
                    ...deepCloneValue(commitPayload),
                    frontendSnapshot: createFrontendSnapshotForActState(commitPayload?.world?.act || createDefaultActStateForDashboard())
                };
                writeStoredDebugPayload(debugPayload);
                applyActStateFromPayload(debugPayload);
                return {
                    ok: true,
                    requestId: commitPayload?.requestId || '',
                    mode: 'debug'
                };
            }
        };
    }

    function ensureDashboardAdapter() {
        if (adapterState.adapter) return adapterState.adapter;
        adapterState.adapter = shouldUseDebugAdapterByDefault()
            ? createDebugAdapter()
            : createHostAdapter();
        adapterState.mode = adapterState.adapter.mode;
        applyOverviewFallbackCampaignProfile(adapterState.mode, {
            preserveGeneratedNodes: hasUsableCampaignNodes(appData.campaign)
        });
        return adapterState.adapter;
    }

    function switchDashboardAdapter(mode) {
        adapterState.adapter = mode === 'debug' ? createDebugAdapter() : createHostAdapter();
        adapterState.mode = adapterState.adapter.mode;
        applyOverviewFallbackCampaignProfile(adapterState.mode, {
            preserveGeneratedNodes: hasUsableCampaignNodes(appData.campaign)
        });
        return adapterState.adapter;
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
            site: typeof source.site === 'string' ? source.site.trim() : ''
        };
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
            inParty: isKnownByDefault,
            miniKnown: false
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
            || encounterChar.status === 'first_meet'
            || Boolean(act.pendingFirstMeet?.[heroCode]);
        if (!isIntroduced) return null;

        return {
            activated: true,
            introduced: true,
            present: encounterChar.status === 'first_meet'
                || Boolean(act.pendingFirstMeet?.[heroCode])
                || (introducedNodeId && introducedNodeId === currentNodeId),
            inParty: false,
            miniKnown: false
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
                ...(castNode ? {
                    activated: true,
                    introduced: castNode.introduced === true,
                    present: castNode.present === true,
                    inParty: castNode.inParty === true,
                    miniKnown: castNode.miniKnown === true
                } : {}),
                ...(encounterState || {})
            };
        });
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
        const normalizedPayload = buildNormalizedDashboardPayload(payload);
        const world = extractWorldPayload(normalizedPayload);
        const actState = world?.act;
        const frontendSnapshot = extractFrontendSnapshot(normalizedPayload);

        syncHeroResourcesFromPayload(normalizedPayload);
        syncDashboardCharactersFromHeroPayload(normalizedPayload);
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
            crisis: Math.max(0, Math.min(100, Math.round(Number(currentActState.crisis) || 0))),
            crisisSignals: Array.isArray(currentActState.crisisSignals)
                ? deepCloneValue(currentActState.crisisSignals)
                : [],
            vision: (() => {
                const vision = deepCloneValue(currentActState.vision || { baseSight: 1, bonusSight: 0, jumpReady: false, pendingReplace: null });
                if (appState.currentNodeIndex > Math.max(1, Math.round(Number(currentActState.nodeIndex) || 1))) {
                    vision.bonusSight = 0;
                    vision.jumpReady = false;
                }
                return vision;
            })(),
            resourceSpent: normalizeActResourceCounts(currentActState.resourceSpent),
            characterEncounter: deepCloneValue(currentActState.characterEncounter || {}),
            pendingFirstMeet: currentActState.pendingFirstMeet && typeof currentActState.pendingFirstMeet === 'object' && !Array.isArray(currentActState.pendingFirstMeet)
                ? deepCloneValue(currentActState.pendingFirstMeet)
                : {},
            pendingResolutions: Array.isArray(currentActState.pendingResolutions)
                ? deepCloneValue(currentActState.pendingResolutions)
                : [],
            resolutionHistory: Array.isArray(currentActState.resolutionHistory)
                ? deepCloneValue(currentActState.resolutionHistory)
                : []
        };
    }

    function buildWorldStateForCommit() {
        return {
            location: getCurrentWorldLocation(),
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

    function getDebugChapterTransitionOption() {
        if (!isOverviewDebugMode()) return null;
        const actModule = getActModuleApi();
        if (!actModule || typeof actModule.evaluateCompletionTransition !== 'function') return null;

        try {
            const transition = actModule.evaluateCompletionTransition(buildCurrentActStateSnapshot(), {
                funds: appState.resources.funds,
                assets: appState.resources.assets,
                debt: appState.resources.debt,
                majorDebt: appState.resources.majorDebt
            });
            return transition && transition.eligible ? transition : null;
        } catch (_) {
            return null;
        }
    }

    function enterNextChapterInDebug() {
        const transition = getDebugChapterTransitionOption();
        if (!transition?.eligible || !transition.targetActState) return false;

        const nextPayload = createDebugPayloadFromActState(transition.targetActState);
        writeStoredDebugPayload(nextPayload);
        applyActStateFromPayload(nextPayload);
        return true;
    }

    function postActMessageToHost(message) {
        const targets = [];
        if (window.parent && window.parent !== window) {
            targets.push(window.parent);
        }
        if (window.top && window.top !== window && !targets.includes(window.top)) {
            targets.push(window.top);
        }

        targets.forEach((targetWindow) => {
            try {
                targetWindow.postMessage(message, '*');
            } catch (error) {
                console.warn('[ACE0 ACT] postMessage failed:', error);
            }
        });

        return targets.length > 0;
    }

    function resolveDirectActCommitBridge() {
        const candidates = [window];
        try {
            if (window.parent && window.parent !== window) candidates.push(window.parent);
        } catch (_) {}
        try {
            if (window.top && window.top !== window && !candidates.includes(window.top)) candidates.push(window.top);
        } catch (_) {}

        for (const candidate of candidates) {
            try {
                if (typeof candidate.ACE0DashboardCommitActState === 'function') {
                    return candidate.ACE0DashboardCommitActState.bind(candidate);
                }
            } catch (_) {}
        }

        return null;
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
        const isActMessage = payload.type === ACT_INBOUND_MESSAGE_TYPES.commitResult || ACT_MESSAGE_TYPES.has(payload.type);
        if (!isActMessage) return;
        if (payload.type === ACT_INBOUND_MESSAGE_TYPES.commitResult) {
            resolveActCommitResult(payload.payload || payload.data || payload);
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

    const SVG_NS = "http://www.w3.org/2000/svg";
    const SEGMENTS = 100;
    const LAYER_FIT_SHRINK = 1;
    const LAYER_PADDING_X = 48;
    const LAYER_PADDING_Y = 64;
    const GRID_LINE_PADDING_TOP = 110;
    const GRID_LINE_PADDING_BOTTOM = 110;
    const GRID_LINE_FOCUS_OVERSHOOT = 48;
    const LAYER_BOTTOM_PADDING_Y = GRID_LINE_PADDING_BOTTOM + GRID_LINE_FOCUS_OVERSHOOT + 32;
    let currentFocusNodeId = appData.map.focusNodeId;
    const AUTO_LAYOUT_RULES = {
        ...appData.map.layout
    };

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
        return `
            <div class="encounter-badge" title="${escapePartyHtml(displayName)} · FIRST MEET · ${escapePartyHtml(getPhaseRomanLabel(phaseIndex))}" data-encounter-char="${escapePartyHtml(marker.charKey)}" data-encounter-phase="${phaseIndex}">
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
        const node = getNodeData(presentNodeId);
        const typeKey = getNodeTypeKey(presentNodeId);
        const label = nodeTemplate?.label || `NODE ${String(appState.currentNodeIndex).padStart(2, '0')}`;
        const deadNodeIds = getDerivedDeadNodeIds(appState.currentNodeIndex, presentNodeId);
        const presentTransition = getPresentNodeTransition(presentNodeId);
        const snapshotLimited = Array.isArray(appData.runtime.frontendSnapshot?.currentLimitedRewards)
            ? appData.runtime.frontendSnapshot.currentLimitedRewards
            : null;
        const limitedRewards = (snapshotLimited?.length
            ? snapshotLimited
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
        return phaseIndex >= appState.currentPhaseIndex;
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
        currentFocusNodeId = getCurrentNodeData().mapFocus;
    }

    // UI rendering starts here. Everything below should stay presentation-first.
    function renderTopbar() {
        const sysTopbar = document.getElementById('sysTopbar');
        const { actLabel, actTitleCn, nodeLabel, nodePoolLabel, resources } = appData.topbar;
        const nodeIndexValue = `${String(appState.currentNodeIndex).padStart(2, '0')}/${String(getCampaignTotalNodes()).padStart(2, '0')}`;
        const worldClock = normalizeWorldClock(appState.worldClock);
        const worldClockMarkup = `
            <div class="hdr-node hdr-worldclock">
                <span class="label">DAY</span>
                <span class="val">${worldClock.day}</span>
                <span class="phase">${worldClock.phase}</span>
            </div>
        `;
        const progressionControlsEnabled = canUseInteractivePlannerControls();
        const routeSelectionActive = progressionControlsEnabled && isRouteSelectionActive();
        const canAdvanceNode = progressionControlsEnabled && canUseNodeAdvanceControl() && canExecuteCurrentNode();
        const pendingLimitedCount = getPendingLimitedCount();
        const nodePoolMarkup = appData.topbar.nodePool.map((node) => `
            <div class="node-stat ${node.className}${getTotalInventoryCount(node.key) <= 0 ? ' is-empty' : ''}" title="${node.title}">
                <div class="mini-sigil"><div class="sigil-${node.key}"></div></div>
                <span class="node-val">${getTotalInventoryCount(node.key)}</span>
            </div>
        `).join('');
        const resourcesMarkup = resources.map((resource, index) => `
            ${index ? '<div class="magic-divider"></div>' : ''}
            <div class="res-stat ${resource.className}">
                <span class="res-label">${resource.label}</span>
                <span class="res-val">${
                    resource.className === 'res-gold'
                        ? formatCompactResourceValue(appState.resources.funds)
                        : resource.className === 'res-assets'
                            ? formatCompactResourceValue(appState.resources.assets)
                        : resource.className === 'res-mana'
                            ? `${appState.resources.mana}/100`
                            : resource.className === 'res-danger'
                                ? formatCompactResourceValue(appState.resources.majorDebt)
                            : formatCompactResourceValue(appState.resources.debt)
                }</span>
            </div>
        `).join('');
        const routeOptionsMarkup = routeSelectionActive
            ? `
                <div class="topbar-route-list">
                    ${getRouteOptions().map((nodeId) => `<button class="route-option-btn" data-node-id="${nodeId}">${getRouteOptionLabel(nodeId)}</button>`).join('')}
                </div>
            `
            : '';
        const controlsMarkup = !progressionControlsEnabled
            ? ''
            : routeSelectionActive
            ? `
                <div class="topbar-actions">
                    <div class="topbar-mode-chip">SELECT PATH</div>
                </div>
            `
            : pendingLimitedCount > 0 && !canAdvanceNode
            ? `
                <div class="topbar-actions">
                    <div class="topbar-mode-chip">QUEUE ${pendingLimitedCount} LIMITED</div>
                </div>
            `
            : '';

        sysTopbar.innerHTML = `
            <div class="bar-group">
                <div class="hdr-title">${actLabel} <span class="hdr-title-cn">${actTitleCn}</span></div>
                <div class="magic-divider"></div>
                <div class="hdr-node">${nodeLabel} <span class="val">${nodeIndexValue}</span></div>
                <div class="magic-divider"></div>
                ${worldClockMarkup}
            </div>
            <div class="bar-group center-pool">
                <span class="pool-leader">${nodePoolLabel}</span>
                <div class="magic-divider"></div>
                ${nodePoolMarkup}
            </div>
            <div class="bar-group topbar-right">${resourcesMarkup}${controlsMarkup}${routeOptionsMarkup}</div>
        `;
    }

    let sidebarCollapseHandler = null;
    function getSidebarChapterTitle(chapterId, fallbackIndex = 0) {
        const normalizedChapterId = typeof chapterId === 'string' ? chapterId.trim() : '';
        if (!normalizedChapterId) return `CHAPTER ${fallbackIndex + 1}`;

        if (normalizedChapterId === getCurrentChapterId()) {
            const snapshotChapterTitle = typeof adapterState.lastFrontendSnapshot?.chapterMeta?.title === 'string'
                ? adapterState.lastFrontendSnapshot.chapterMeta.title.trim()
                : '';
            if (snapshotChapterTitle) return snapshotChapterTitle;
        }

        const actModule = getActModuleApi();
        if (actModule && typeof actModule.getChapter === 'function') {
            try {
                const chapter = actModule.getChapter(normalizedChapterId);
                const title = typeof chapter?.meta?.title === 'string' ? chapter.meta.title.trim() : '';
                if (title) return title;
            } catch (_) {}
        }

        if (normalizedChapterId === 'chapter0_exchange') return '命运';
        return normalizedChapterId.toUpperCase();
    }

    function getSidebarCampaignNodesForChapter(chapterId) {
        const normalizedChapterId = typeof chapterId === 'string' ? chapterId.trim() : '';
        if (!normalizedChapterId) return [];
        if (normalizedChapterId === getCurrentChapterId()) {
            return deepCloneValue(getCampaignNodes());
        }

        const actModule = getActModuleApi();
        if (!actModule || typeof actModule.getDefaultActState !== 'function' || typeof actModule.createFrontendSnapshot !== 'function') {
            return [];
        }

        try {
            const actState = actModule.getDefaultActState(normalizedChapterId);
            const snapshot = actModule.createFrontendSnapshot({ actState });
            if (Array.isArray(snapshot?.campaign?.nodes)) return deepCloneValue(snapshot.campaign.nodes);
            if (Array.isArray(snapshot?.nodes)) return deepCloneValue(snapshot.nodes);
        } catch (_) {}

        return [];
    }

    function buildSidebarChapterBranches() {
        const currentChapterId = getCurrentChapterId();
        const actModule = getActModuleApi();
        const listedChapterIds = actModule && typeof actModule.listChapters === 'function'
            ? actModule.listChapters()
            : [];
        const fallbackChapterIds = ['chapter0_exchange'];
        const orderedChapterIds = (listedChapterIds.length ? listedChapterIds : fallbackChapterIds)
            .filter((chapterId, index, list) => typeof chapterId === 'string' && chapterId.trim() && list.indexOf(chapterId) === index);
        const currentChapterIndex = Math.max(0, orderedChapterIds.indexOf(currentChapterId));

        return orderedChapterIds.map((chapterId, index) => ({
            chapterId,
            title: getSidebarChapterTitle(chapterId, index),
            state: index < currentChapterIndex
                ? 'is-past'
                : index === currentChapterIndex
                    ? 'is-active'
                    : 'is-future',
            expanded: chapterId === currentChapterId,
            nodes: getSidebarCampaignNodesForChapter(chapterId)
        }));
    }

    function renderSidebarLeaves(campaignNodes, currentNodeIndex, isActiveChapter) {
        if (!Array.isArray(campaignNodes) || !campaignNodes.length) return '';
        return campaignNodes.map((nodeTemplate) => {
            const state = !isActiveChapter
                ? 'is-future'
                : nodeTemplate.nodeIndex < currentNodeIndex
                    ? 'is-past'
                    : nodeTemplate.nodeIndex === currentNodeIndex
                        ? 'is-active'
                        : 'is-future';
            return `
                <div class="tree-leaf ${state}">
                    <div class="leaf-ring"></div>
                    <div class="leaf-info">
                        <span class="leaf-id">${nodeTemplate.label.replace(/\s+/g, '_')}</span>
                        <span class="leaf-name${state === 'is-future' ? ' abstract-node' : ''}">${nodeTemplate.title}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    function renderSidebar() {
        const sidebar = document.querySelector('.sidebar');
        const currentNodeIndex = appState.currentNodeIndex;
        const branchMarkup = buildSidebarChapterBranches().map((branch) => {
            const leafMarkup = renderSidebarLeaves(branch.nodes, currentNodeIndex, branch.expanded);
            return `
            <div class="tree-branch ${branch.state}" data-chapter-id="${branch.chapterId}">
                <div class="branch-head">
                    <span class="branch-icon"></span>
                    <span class="branch-title">${branch.title}</span>
                </div>
                ${branch.expanded && leafMarkup ? `<div class="branch-body">${leafMarkup}</div>` : ''}
            </div>
        `;
        }).join('');

        sidebar.innerHTML = `
            <div class="sidebar-hero" role="button" tabindex="0" aria-label="Toggle chronicle">
                <span class="sidebar-title">${appData.sidebar.heroTitle}</span>
                <span class="sidebar-subtitle">${appData.sidebar.heroSubtitle}</span>
                <span class="sidebar-collapse-caret" aria-hidden="true">▾</span>
            </div>
            <div class="archive-tree" id="archiveTree">${branchMarkup}</div>
        `;

        // Mobile: click header to toggle collapse. Desktop: no-op (CSS guards visibility).
        if (!sidebarCollapseHandler) {
            sidebarCollapseHandler = (e) => {
                if (!window.matchMedia('(max-width: 820px)').matches) return;
                sidebar.classList.toggle('is-collapsed');
            };
        }
        const hero = sidebar.querySelector('.sidebar-hero');
        if (hero) {
            hero.addEventListener('click', sidebarCollapseHandler);
            hero.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    sidebarCollapseHandler(e);
                }
            });
        }

        // Default to collapsed on initial mobile render
        if (window.matchMedia('(max-width: 820px)').matches && !sidebar.dataset.mobileInit) {
            sidebar.classList.add('is-collapsed');
            sidebar.dataset.mobileInit = '1';
        }
    }

    function renderMapLayer() {
        const mapLayer = document.getElementById('mapLayer');
        const gridMarkup = getMapColumns().map((column) => `
            <div class="grid-base-line ${column.lineClass}" id="${column.lineId}"></div>
        `).join('');
        const nodeMarkup = getMapNodes().map((node) => `
            <div class="az-node ${node.classes.join(' ')}" id="${node.id}">
                <div class="node-label">${node.label}</div>
                <div class="node-sublabel">${node.sublabel}</div>
                <div class="astrolabe-ring">
                    <div class="node-fixed-envelope" aria-hidden="true"></div>
                    ${buildEncounterBadgeMarkup(node.id)}
                    <div class="magic-core"></div>
                </div>
            </div>
        `).join('');

        mapLayer.innerHTML = `
            <svg id="fate-canvas" viewBox="0 0 2800 1200"></svg>
            ${gridMarkup}
            ${nodeMarkup}
        `;
    }

    function needsMapLayerRebuild() {
        const mapLayer = document.getElementById('mapLayer');
        if (!mapLayer) return false;

        const expectedNodeIds = getMapNodes().map((node) => node.id);
        const renderedNodeIds = Array.from(mapLayer.querySelectorAll('.az-node')).map((nodeEl) => nodeEl.id);
        const expectedLineIds = getMapColumns().map((column) => column.lineId);
        const renderedLineIds = Array.from(mapLayer.querySelectorAll('.grid-base-line')).map((lineEl) => lineEl.id);
        const hasCanvas = !!mapLayer.querySelector('#fate-canvas');

        if (!hasCanvas) return true;
        if (renderedNodeIds.length !== expectedNodeIds.length) return true;
        if (renderedLineIds.length !== expectedLineIds.length) return true;

        for (let index = 0; index < expectedNodeIds.length; index += 1) {
            if (renderedNodeIds[index] !== expectedNodeIds[index]) return true;
        }

        for (let index = 0; index < expectedLineIds.length; index += 1) {
            if (renderedLineIds[index] !== expectedLineIds[index]) return true;
        }

        return false;
    }

    function renderPlannerDrawer() {
        const plannerDrawerMount = document.getElementById('plannerDrawerMount');
        if (!plannerDrawerMount) return;
        const readonlyClass = canUseInteractivePlannerControls() ? '' : ' is-host-readonly';
        const inventoryMarkup = appData.planner.inventory.map((item) => `
            <div class="token-dispenser type-${item.key}" id="inv_${item.key}" data-type="${item.type}">
                <div class="badge-count" id="count_${item.key}">x0</div>
                <div class="magic-core"></div>
                <div class="token-info">
                    <div class="token-label">${item.label}</div>
                    <div class="token-sub" id="sub_${item.key}">L0 / R0</div>
                </div>
            </div>
        `).join('');
        const restTintMarkup = REST_CONTROL_TINT_KEYS.map((key) => `
            <button class="rest-tint-btn tint-${key}" type="button" data-rest-tint="${key}" title="${key === 'neutral' ? 'Neutral control point' : `${RESOURCE_TYPE_MAP[key]} control tint`}">${getRestTintLabel(key)}</button>
        `).join('');
        plannerDrawerMount.innerHTML = `
            <div class="planner-drawer${readonlyClass}" id="planner-drawer">
                <div class="planner-panel-header">
                    <span class="planner-panel-title">${appData.planner.header}</span>
                    <div class="rest-control-panel" id="rest-control-panel">
                        <div class="rest-control-label">REST CONTROL</div>
                        <div class="rest-control-options">${restTintMarkup}</div>
                    </div>
                </div>
                <div class="inventory-area${readonlyClass}" id="inventory">${inventoryMarkup}</div>
            </div>
        `;
    }

    function buildPhaseVisionPromptMarkup() {
        const prompt = getCurrentVisionFixedPhasePrompt();
        if (!prompt) return '';
        const replaceButtons = RESOURCE_KEYS.map((key) => `
            <button class="phase-vision-btn type-${key}" type="button" data-vision-phase-action="replace" data-replacement-key="${key}">${RESOURCE_TYPE_MAP[key]}</button>
        `).join('');
        return `
            <div class="phase-vision-prompt" id="phase-vision-prompt" data-phase-key="${prompt.phaseKey}" data-charges="${prompt.charges}">
                <div class="phase-vision-copy">
                    <span>VISION REPLACE x${prompt.charges}</span>
                    <strong>${getRouteOptionLabel(prompt.nodeId)} · ${getPhaseRomanLabel(prompt.phaseIndex)} · ${RESOURCE_TYPE_MAP[prompt.fixedKind]}</strong>
                </div>
                <div class="phase-vision-actions">
                    <button class="phase-vision-btn keep" type="button" data-vision-phase-action="keep">KEEP</button>
                    ${replaceButtons}
                </div>
            </div>
        `;
    }

    function renderPhaseBar() {
        const phaseBarMount = document.getElementById('phaseBarMount');
        if (!phaseBarMount) return;
        const readonlyClass = canUseInteractivePlannerControls() ? '' : ' is-host-readonly';
        const plannerControlsMarkup = canOpenPlannerDrawer()
            ? `<div class="planner-controls${readonlyClass}">
                    <button class="toggle-planner-btn${readonlyClass}" id="toggle-planner"><span class="btn-text" id="toggle-planner-label">${appData.planner.toggleClosedLabel.replace(/\s*\/\/$/, '')}</span></button>
                </div>`
            : `<div class="planner-controls${readonlyClass}"></div>`;
        const phaseSegments = appData.planner.phases.slice(0, -1).map((phase, index) => {
            const startX = 100 + (index * 200);
            const endX = startX + 200;
            return `
                        <g class="seg-future" id="phase-seg-${index}">
                            <path d="M ${startX} 50 C ${startX + 60} 30, ${endX - 60} 70, ${endX} 50" class="magic-thread th-main" />
                            <path d="M ${startX} 50 C ${startX + 60} 30, ${endX - 60} 70, ${endX} 50" class="magic-thread th-flow" />
                        </g>
            `;
        }).join('');

        const phaseMarkup = appData.planner.phases.map((phase, phaseIndex) => {
            const coreMarkup = `
                <div class="phase-core drop-zone" id="${phase.slotId}">
                    <div class="phase-fixed-glyph" id="phase-fixed-glyph-${phaseIndex}"><div class="magic-core"></div></div>
                    <div class="mounted-token" id="mounted-${phase.slotId}"><div class="magic-core"></div></div>
                </div>
            `;
            return `
                <div class="phase-node future" id="phase-node-${phaseIndex}" style="left: ${phase.left};">
                    <div class="phase-label">${phase.phase}</div>
                    ${coreMarkup}
                    <div class="phase-title">${phase.title}</div>
                </div>
            `;
        }).join('');

        phaseBarMount.innerHTML = `
            <div class="phase-bottom-bar">
                ${plannerControlsMarkup}
                <div class="timeline-container">
                    <svg class="phase-svg-layer" viewBox="0 0 800 100" preserveAspectRatio="none">
${phaseSegments}
                    </svg>
                    ${phaseMarkup}
                </div>
                ${buildPhaseVisionPromptMarkup()}
            </div>
        `;
    }

    function needsPlannerDrawerRebuild() {
        const drawer = document.getElementById('planner-drawer');
        const inventory = document.getElementById('inventory');
        if (!drawer || !inventory) return true;
        const shouldBeReadonly = !canUseInteractivePlannerControls();
        if (drawer.classList.contains('is-host-readonly') !== shouldBeReadonly) return true;
        if (inventory.classList.contains('is-host-readonly') !== shouldBeReadonly) return true;
        const renderedCount = inventory.querySelectorAll('.token-dispenser').length;
        return renderedCount !== appData.planner.inventory.length;
    }

    function needsPhaseBarRebuild() {
        const toggleButton = document.getElementById('toggle-planner');
        const phaseNodes = document.querySelectorAll('.phase-node');
        const phaseSegments = document.querySelectorAll('[id^="phase-seg-"]');
        const visionPrompt = document.getElementById('phase-vision-prompt');
        const currentVisionPrompt = getCurrentVisionFixedPhasePrompt();
        const shouldHaveToggle = canOpenPlannerDrawer();
        if (!!toggleButton !== shouldHaveToggle) return true;
        if (phaseNodes.length !== appData.planner.phases.length) return true;
        if (!!visionPrompt !== Boolean(currentVisionPrompt)) return true;
        if (visionPrompt && currentVisionPrompt) {
            if (visionPrompt.dataset.phaseKey !== currentVisionPrompt.phaseKey) return true;
            if (visionPrompt.dataset.charges !== String(currentVisionPrompt.charges)) return true;
        }
        return phaseSegments.length !== Math.max(0, appData.planner.phases.length - 1);
    }

    function syncPlannerDrawerDOM() {
        const drawer = document.getElementById('planner-drawer');
        if (!drawer) return;
        drawer.classList.toggle('is-open', appState.drawerOpen);

        appData.planner.inventory.forEach((item) => {
            const tokenEl = document.getElementById(`inv_${item.key}`);
            const countEl = document.getElementById(`count_${item.key}`);
            const subEl = document.getElementById(`sub_${item.key}`);
            if (!tokenEl || !countEl || !subEl) return;
            const total = getTotalInventoryCount(item.key);
            tokenEl.className = `token-dispenser type-${item.key}`;
            tokenEl.classList.toggle('is-empty', total <= 0);
            tokenEl.classList.toggle('is-selected', selectionState.source === 'inventory' && selectionState.type === item.type);
            countEl.textContent = `x${total}`;
            subEl.textContent = `L${getInventoryBucket(item.key).limited} / R${getInventoryBucket(item.key).reserve}`;
        });

        syncRestControlPanelDOM();
    }

    function getSelectedRestSlotToken() {
        if (selectionState.source !== 'slot' || !selectionState.slotId) return null;
        if (!canEditPhaseSlot(selectionState.slotId)) return null;
        const token = appState.phaseSlots[selectionState.slotId];
        return token?.key === 'rest' ? token : null;
    }

    function canApplyRestTint(tintKey, token = getSelectedRestSlotToken()) {
        if (!token) return false;
        const normalized = normalizeRestTintKey(tintKey, 'neutral');
        if (normalized === 'neutral') return true;
        const currentTint = normalizeRestTintKey(token.tint || token.controlType || token.targetKey, 'neutral');
        if (currentTint === normalized) return true;
        return getTotalInventoryCount(normalized) > 0;
    }

    function syncRestControlPanelDOM() {
        const panel = document.getElementById('rest-control-panel');
        if (!panel) return;
        const token = getSelectedRestSlotToken();
        const isVisible = Boolean(token) && canUseInteractivePlannerControls();
        panel.classList.toggle('is-visible', isVisible);
        const currentTint = token ? normalizeRestTintKey(token.tint || token.controlType || token.targetKey, 'neutral') : 'neutral';
        panel.querySelectorAll('[data-rest-tint]').forEach((button) => {
            const tintKey = normalizeRestTintKey(button.dataset.restTint, 'neutral');
            const isActive = tintKey === currentTint;
            const isDisabled = !isVisible || !canApplyRestTint(tintKey, token);
            button.classList.toggle('is-active', isActive);
            button.classList.toggle('is-disabled', isDisabled);
            button.disabled = isDisabled;
        });
    }

    function syncPhaseBarDOM() {
        const planningPhase = isPlanningPhase();
        const toggleButton = document.getElementById('toggle-planner');
        const toggleLabel = document.getElementById('toggle-planner-label');
        const commitButton = document.getElementById('commit-act-state');
        const syncStatus = document.getElementById('planner-sync-status');
        if (toggleButton) toggleButton.classList.toggle('is-active', appState.drawerOpen);
        if (toggleLabel) {
            toggleLabel.textContent = (appState.drawerOpen ? appData.planner.toggleOpenLabel : appData.planner.toggleClosedLabel).replace(/\s*\/\/$/, '');
        }
        if (commitButton) {
            commitButton.classList.toggle('is-dirty', syncState.dirty);
            commitButton.classList.toggle('is-saving', syncState.saving);
            commitButton.disabled = syncState.saving || !syncState.dirty;
            commitButton.textContent = syncState.saving ? 'SAVING' : (syncState.dirty ? 'CONFIRM' : 'SYNCED');
        }
        if (syncStatus) {
            syncStatus.className = 'planner-sync-status';
            if (syncState.errorText) syncStatus.classList.add('is-error');
            else if (syncState.saving) syncStatus.classList.add('is-saving');
            else if (syncState.dirty) syncStatus.classList.add('is-dirty');
            syncStatus.textContent = syncState.errorText || syncState.statusText;
        }

        appData.planner.phases.slice(0, -1).forEach((phase, index) => {
            const segment = document.getElementById(`phase-seg-${index}`);
            if (!segment) return;
            let segmentClass = 'seg-future';
            if (!planningPhase) {
                if (index < appState.currentPhaseIndex - 1) segmentClass = 'seg-past';
                else if (index === appState.currentPhaseIndex - 1) segmentClass = 'seg-active';
            }
            segment.setAttribute('class', segmentClass);
        });

        appData.planner.phases.forEach((phase, phaseIndex) => {
            const nodeEl = document.getElementById(`phase-node-${phaseIndex}`);
            const coreEl = document.getElementById(phase.slotId);
            const mountedEl = document.getElementById(`mounted-${phase.slotId}`);
            const fixedGlyphEl = document.getElementById(`phase-fixed-glyph-${phaseIndex}`);
            const slotToken = appState.phaseSlots[phase.slotId];
            if (!nodeEl || !coreEl || !mountedEl) return;
            const currentNodeId = getCurrentNodeData().presentNode;
            const visionReplacement = getReadyVisionReplacementForPhase(currentNodeId, phaseIndex);
            const encounterMarker = getEncounterMarkerForPhase(currentNodeId, phaseIndex);
            const fixedKind = visionReplacement ? null : getFixedPhaseKind(currentNodeId, phaseIndex);
            const displayToken = getDisplayTokenForPhase(slotToken, currentNodeId, phaseIndex);
            const visionPrompt = getCurrentVisionFixedPhasePrompt();
            const isVisionPromptPhase = Boolean(visionPrompt && visionPrompt.phaseIndex === phaseIndex);

            let state = 'future';
            if (!planningPhase) {
                if (phaseIndex < appState.currentPhaseIndex) state = 'past';
                else if (phaseIndex === appState.currentPhaseIndex) state = 'active';
            }
            nodeEl.className = `phase-node ${state}`;

            coreEl.className = 'phase-core drop-zone';
            if (displayToken) coreEl.classList.add('has-token', `type-${displayToken.key}`);
            if (visionReplacement) coreEl.classList.add('has-vision-replacement');
            if (fixedKind) coreEl.classList.add('has-fixed', `fixed-${fixedKind}`);
            if (encounterMarker) coreEl.classList.add('has-fixed', 'has-encounter-fixed');
            if (isVisionPromptPhase) coreEl.classList.add('vision-replace-prompt');
            if (selectionState.source === 'slot' && selectionState.slotId === phase.slotId) coreEl.classList.add('is-selected');
            if (!canEditPhaseSlot(phase.slotId)) coreEl.classList.add('is-locked');

            mountedEl.className = 'mounted-token';
            mountedEl.removeAttribute('data-type');
            mountedEl.removeAttribute('data-source');
            mountedEl.removeAttribute('data-amount');
            mountedEl.removeAttribute('data-tint');
            mountedEl.removeAttribute('data-vision-replacement');
            if (displayToken) {
                mountedEl.classList.add(`type-${displayToken.key}`);
                if (selectionState.source === 'slot' && selectionState.slotId === phase.slotId) mountedEl.classList.add('is-selected');
                mountedEl.dataset.type = displayToken.type;
                mountedEl.dataset.source = displayToken.source;
                mountedEl.dataset.amount = String(Math.max(1, Math.min(3, Math.round(Number(displayToken.amount) || 1))));
                if (displayToken.visionReplacement) mountedEl.dataset.visionReplacement = 'true';
                const tint = normalizeRestTintKey(displayToken.tint || displayToken.controlType || displayToken.targetKey, '');
                if (displayToken.key === 'rest' && tint) {
                    mountedEl.classList.add(`tint-${tint}`);
                    mountedEl.dataset.tint = RESOURCE_TYPE_MAP[tint] || tint.toUpperCase();
                }
            }

            if (fixedGlyphEl) {
                fixedGlyphEl.className = 'phase-fixed-glyph';
                if (encounterMarker) {
                    fixedGlyphEl.classList.add('type-encounter', 'is-visible');
                    fixedGlyphEl.title = `${encounterMarker.charKey} · FIRST MEET`;
                    fixedGlyphEl.innerHTML = buildEncounterFixedGlyphMarkup(encounterMarker);
                } else if (fixedKind) {
                    fixedGlyphEl.classList.add(`type-${fixedKind}`, 'is-visible');
                    fixedGlyphEl.title = getFixedPhaseMarker(getCurrentNodeData().presentNode, phaseIndex)?.title || '';
                    fixedGlyphEl.innerHTML = '<div class="magic-core"></div>';
                } else {
                    fixedGlyphEl.removeAttribute('title');
                    fixedGlyphEl.innerHTML = '<div class="magic-core"></div>';
                }
            }
        });
    }

    const PARTY_ORDER = [
        { key: 'rino',    suit: '♥', exclusiveLabel: 'Bond',         exclusiveCn: '羁绊度' },
        { key: 'kuzuha',  suit: '♣', exclusiveLabel: 'Debtbind',     exclusiveCn: '债缚度' },
        { key: 'poppy',   suit: '♦', exclusiveLabel: 'Nesting',      exclusiveCn: '寄生度' },
        { key: 'sia',     suit: '♠', exclusiveLabel: 'Custody',      exclusiveCn: '接管度' },
        { key: 'vv',      suit: '♦', exclusiveLabel: 'Majority',     exclusiveCn: '控股度' },
        { key: 'trixie',  suit: '🃏', exclusiveLabel: 'Mania',        exclusiveCn: '妄执度' },
        { key: 'kako',    suit: '♠', exclusiveLabel: 'Complicity',   exclusiveCn: '包庇度' },
        { key: 'eulalia', suit: '♥', exclusiveLabel: 'Entrust',      exclusiveCn: '寄托度' },
        { key: 'cota',    suit: '♦', exclusiveLabel: 'Retention',    exclusiveCn: '留存度' }
    ];

    function escapePartyHtml(text) {
        return String(text ?? '').replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    function pctClamp(value) {
        const n = Number(value);
        if (!Number.isFinite(n)) return 0;
        return Math.max(0, Math.min(100, Math.round(n)));
    }

    function buildPartySlotMarkup(entry) {
        const pool = (typeof window !== 'undefined' && window.dashboardCharacters) || {};
        const c = pool[entry.key];
        if (!c) return '';

        const state = c.dashboardState || {};
        const isMasked = state.miniKnown === true;

        // 未激活：整条消失（9人 → 8人）。默认 activated 缺省视为 true。
        if (state.activated === false) return '';

        let slotClass = 'sub-hand';
        let roleLabel = 'UNKNOWN';
        let opacityStyle = '';

        if (isMasked) { roleLabel = 'UNKNOWN'; opacityStyle = 'opacity: 0.3; filter: grayscale(1);'; }
        else if (state.inParty) { slotClass = 'main-hand'; roleLabel = 'IN PARTY'; }
        else if (state.present) { roleLabel = 'PRESENT'; }
        else if (state.introduced) { roleLabel = 'INTRODUCED'; opacityStyle = 'opacity: 0.6;'; }
        else { roleLabel = 'UNKNOWN'; opacityStyle = 'opacity: 0.3; filter: grayscale(1);'; }

        const resource = c.variables?.resource || {};
        const manaCur = Math.max(0, Math.round(Number(resource.current) || 0));
        const manaMax = Math.max(1, Math.round(Number(resource.max) || 0)) || 100;
        const manaPct = Math.max(0, Math.min(100, Math.round((manaCur / manaMax) * 100)));

        const isHookStage = isMasked || !state.introduced;

        const rawDisplayName = c.watermark || c.name || entry.key.toUpperCase();
        const displayName = isHookStage ? '???' : rawDisplayName;
        const avatarUrl = isHookStage ? '' : (c.avatarUrl || c.portraitUrl || '');
        const avatarLetter = isHookStage ? '?' : rawDisplayName.charAt(0);
        const levelText = isHookStage
            ? 'LV ??'
            : `LV ${String(Math.max(0, Math.round(Number(c.level) || 0))).padStart(2, '0')}`;

        const suitSymbol = String(c.suitSymbol || '');
        const suitClass = String(c.suitClass || '').toLowerCase();
        const attrUpper = String(c.attribute || '').toUpperCase();
        const CHAR_TO_ATTR = { '♥': 'moirai', '♠': 'chaos', '♦': 'psyche', '♣': 'void' };
        const CLASS_TO_ATTR = { 'heart': 'moirai', 'spade': 'chaos', 'diamond': 'psyche', 'club': 'void' };
        const active = { moirai: false, chaos: false, psyche: false, void: false };
        const isJoker = suitSymbol.includes('🃏') || suitClass === 'joker';
        if (isJoker) {
            active.moirai = active.chaos = active.psyche = active.void = true;
        } else {
            Array.from(suitSymbol).forEach((ch) => {
                const k = CHAR_TO_ATTR[ch];
                if (k) active[k] = true;
            });
            suitClass.split(/[^a-z]+/).forEach((piece) => {
                const k = CLASS_TO_ATTR[piece];
                if (k) active[k] = true;
            });
            if (!Object.values(active).some(Boolean)) {
                if (attrUpper.includes('MOIRAI')) active.moirai = true;
                if (attrUpper.includes('CHAOS')) active.chaos = true;
                if (attrUpper.includes('PSYCHE')) active.psyche = true;
                if (attrUpper.includes('VOID')) active.void = true;
            }
        }
        const isMoirai = !isHookStage && active.moirai ? 'active' : '';
        const isChaos  = !isHookStage && active.chaos  ? 'active' : '';
        const isPsyche = !isHookStage && active.psyche ? 'active' : '';
        const isVoid   = !isHookStage && active.void   ? 'active' : '';

        const goldMain = c.theme?.semantic?.goldMain || c.theme?.goldMain || '#CFB53B';

        return `
            <div class="roster-slot ${slotClass}" data-party-key="${escapePartyHtml(entry.key)}" style="--gold-main: ${escapePartyHtml(goldMain)}; ${opacityStyle}">
                <div class="comp-avatar-frame">${
                    avatarUrl
                        ? `<img class="comp-avatar-img" src="${escapePartyHtml(avatarUrl)}" alt="${escapePartyHtml(displayName)}" draggable="false">`
                        : `<span class="comp-avatar">${escapePartyHtml(avatarLetter)}</span>`
                }</div>
                <div class="comp-details">
                    <div class="comp-header">
                        <span class="comp-role">${escapePartyHtml(roleLabel)}</span>
                        <span class="comp-level">${escapePartyHtml(levelText)}</span>
                    </div>
                    <div class="comp-name">${escapePartyHtml(displayName)}</div>
                    <div class="comp-traits">
                        <span class="icon-moirai ${isMoirai}">♥</span>
                        <span class="icon-chaos ${isChaos}">♠</span>
                        <span class="icon-psyche ${isPsyche}">♦</span>
                        <span class="icon-void ${isVoid}">♣</span>
                    </div>
                    <div class="mana-row">
                        <span class="mana-label">MANA</span>
                        <div class="mana-bar-glass"><div class="mana-fluid" style="width: ${isHookStage ? 0 : manaPct}%;"></div></div>
                        <span class="mana-val">${isHookStage ? '??' : manaCur}</span>
                    </div>
                </div>
            </div>
        `;
    }

    const PARTY_STATUS_WEIGHT = { party: 0, present: 1, offstage: 2, unintroduced: 4 };

    function getPartyEntryOrder(entry) {
        const pool = (typeof window !== 'undefined' && window.dashboardCharacters) || {};
        const c = pool[entry.key] || {};
        const state = c.dashboardState || {};
        const isMasked = state.miniKnown === true;
        let tone = 'unintroduced';
        if (isMasked) tone = 'unintroduced';
        else if (state.inParty) tone = 'party';
        else if (state.present) tone = 'present';
        else if (state.introduced) tone = 'offstage';
        const statusWeight = PARTY_STATUS_WEIGHT[tone] ?? 4;
        const commonScore = pctClamp(c.variables?.common?.score);
        const exclusiveScore = pctClamp(c.variables?.exclusive?.score);
        return {
            statusWeight,
            total: commonScore + exclusiveScore,
            fallbackIndex: PARTY_ORDER.findIndex((item) => item.key === entry.key)
        };
    }

    function buildPartyRosterMarkup() {
        const ordered = PARTY_ORDER.slice().sort((left, right) => {
            const a = getPartyEntryOrder(left);
            const b = getPartyEntryOrder(right);
            if (a.statusWeight !== b.statusWeight) return a.statusWeight - b.statusWeight;
            if (b.total !== a.total) return b.total - a.total;
            return a.fallbackIndex - b.fallbackIndex;
        });
        return ordered.map((entry) => buildPartySlotMarkup(entry)).join('');
    }

    function formatActDecimal(value) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return '0';
        return String(Math.round(numeric * 100) / 100);
    }

    function getCurrentActStateForPanel() {
        return buildCurrentActStateSnapshot();
    }

    function buildResourceStateRows(actState) {
        return RESOURCE_KEYS.map((key) => {
            const limited = Math.max(0, Math.round(Number(actState.limited?.[key]) || 0));
            const reserve = Math.max(0, Math.round(Number(actState.reserve?.[key]) || 0));
            const rate = formatActDecimal(actState.income_rate?.[key] ?? appState.incomeRate?.[key] ?? 0);
            const progress = formatActDecimal(actState.income_progress?.[key] ?? appState.incomeProgress?.[key] ?? 0);
            return `
                <div class="act-state-row type-${key}">
                    <span class="act-state-key">${RESOURCE_TYPE_MAP[key]}</span>
                    <span class="act-state-value">L${limited} / R${reserve}</span>
                    <span class="act-state-sub">+${rate} · ${progress}</span>
                </div>
            `;
        }).join('');
    }

    function buildPhaseSlotStateRows(actState) {
        const slots = Array.isArray(actState.phase_slots) ? actState.phase_slots : [];
        return slots.map((slot, index) => {
            const label = appData.planner.phases[index]?.title || String(index + 1);
            if (!slot) {
                return `
                    <div class="act-slot-row is-empty">
                        <span>${label}</span>
                        <span>EMPTY</span>
                    </div>
                `;
            }
            const key = normalizeResourceKey(slot.key, 'vision');
            const amount = Math.max(1, Math.min(3, Math.round(Number(slot.amount) || 1)));
            const tint = key === 'rest' ? normalizeRestTintKey(slot.tint || slot.controlType || slot.targetKey, 'neutral') : 'neutral';
            const tintLabel = key === 'rest' && tint !== 'neutral' ? ` > ${RESOURCE_TYPE_MAP[tint]}` : '';
            return `
                <div class="act-slot-row type-${key}">
                    <span>${label}</span>
                    <span>${RESOURCE_TYPE_MAP[key]} x${amount}${tintLabel}</span>
                </div>
            `;
        }).join('');
    }

    function buildDebugActionButtons() {
        if (!isOverviewDebugMode()) return '';
        const debugChapterTransition = getDebugChapterTransitionOption();
        const canAdvancePhase = canUsePhaseAdvanceControl() && canAdvanceCurrentPhase();
        const canAdvanceNode = canUseNodeAdvanceControl() && canExecuteCurrentNode();
        const resourceButtons = RESOURCE_KEYS.map((key) => `
            <button class="debug-act-btn type-${key}" type="button" data-debug-action="grant-resource" data-resource-key="${key}">+${RESOURCE_TYPE_MAP[key]}</button>
        `).join('');
        return `
            <div class="debug-action-grid">
                ${resourceButtons}
                <button class="debug-act-btn${canAdvancePhase ? '' : ' is-disabled'}" type="button" data-debug-action="advance-phase">ADV SEG</button>
                <button class="debug-act-btn${canAdvanceNode ? '' : ' is-disabled'}" type="button" data-debug-action="advance-node">ADV NODE</button>
                ${debugChapterTransition ? '<button class="debug-act-btn is-ready" type="button" data-debug-action="next-chapter">NEXT CHAPTER</button>' : ''}
                <button class="debug-act-btn" type="button" data-debug-action="reset-act">RESET</button>
            </div>
        `;
    }

    function buildModeMetaRows() {
        const seed = getCampaignConfig().seed || '';
        const seedMarkup = isOverviewDebugMode() && seed ? `
            <div class="act-meta-row">
                <span>SEED</span>
                <strong title="${seed}">${getSeedDisplayLabel()}</strong>
            </div>
        ` : '';
        return `
            <div class="act-mode-meta">
                <div class="act-meta-row">
                    <span>SYNC</span>
                    <strong>${syncState.errorText || syncState.statusText}</strong>
                </div>
                ${seedMarkup}
            </div>
        `;
    }

    function getPhaseRomanLabel(phaseIndex) {
        return appData.planner.phases[phaseIndex]?.title || String(phaseIndex + 1);
    }

    function buildVisionReadyReplacementMarkup(pendingReplace) {
        if (!pendingReplace || pendingReplace.status !== 'ready') return '';
        const nodeId = typeof pendingReplace.nodeId === 'string' ? pendingReplace.nodeId : '';
        const phaseIndex = Math.max(0, Math.min(3, Math.round(Number(pendingReplace.phaseIndex) || 0)));
        const replacementKey = normalizeResourceKey(pendingReplace.replacementKey || pendingReplace.key, 'vision');
        return `
            <div class="vision-task-row type-${replacementKey}">
                <span>REPLACE</span>
                <strong>${nodeId ? getRouteOptionLabel(nodeId) : 'TARGET'} · ${getPhaseRomanLabel(phaseIndex)} > ${RESOURCE_TYPE_MAP[replacementKey]}</strong>
            </div>
        `;
    }

    function buildVisionChargedMarkup(pendingReplace) {
        if (!pendingReplace || !['charged', 'choosing'].includes(pendingReplace.status)) return '';
        const charges = Math.max(1, Math.round(Number(pendingReplace.charges) || 1));
        return `
            <div class="vision-task-row is-ready">
                <span>REPLACE</span>
                <strong>CHARGED x${charges}</strong>
            </div>
        `;
    }

    function buildVisionJumpMarkup(vision) {
        if (!vision.jumpReady && appData.runtime.frontendSnapshot?.routeMode !== 'jump') return '';
        const routeOptions = isRouteSelectionActive() ? getRouteOptions() : [];
        if (!routeOptions.length) {
            return `
                <div class="vision-task-row${vision.jumpReady ? ' is-ready' : ''}">
                    <span>JUMP</span>
                    <strong>${vision.jumpReady ? 'READY' : 'WAIT ROUTE'}</strong>
                </div>
            `;
        }
        return `
            <div class="vision-jump-list">
                ${routeOptions.map((nodeId) => `<button class="vision-route-btn route-option-btn" type="button" data-node-id="${nodeId}">${getRouteOptionLabel(nodeId)}</button>`).join('')}
            </div>
        `;
    }

    function buildVisionPanelMarkup(actState) {
        const vision = getVisionStateForDashboard();
        const sight = Math.max(0, vision.baseSight + vision.bonusSight);
        const visibleTo = Math.min(getCampaignTotalNodes(), appState.currentNodeIndex + sight);
        const pendingReplace = vision.pendingReplace;
        const pendingMarkup = buildVisionReadyReplacementMarkup(pendingReplace) || buildVisionChargedMarkup(pendingReplace);
        const jumpMarkup = buildVisionJumpMarkup(vision);
        return `
            <div class="vision-act-panel">
                <div class="vision-task-row">
                    <span>SIGHT</span>
                    <strong>${String(appState.currentNodeIndex).padStart(2, '0')} > ${String(visibleTo).padStart(2, '0')}</strong>
                </div>
                ${pendingMarkup}
                ${jumpMarkup}
            </div>
        `;
    }

    function getEncounterDebugEligibilityMap(actState) {
        const actModule = getActModuleApi();
        if (!isOverviewDebugMode() || !actModule || typeof actModule.evaluateCharacterEncounterEligibility !== 'function') {
            return new Map();
        }
        const currentPayload = adapterState.lastPayload || buildInitialDebugPayload();
        const hero = extractHeroPayload(currentPayload) || { funds: appState.resources.funds, assets: appState.resources.assets };
        const result = actModule.evaluateCharacterEncounterEligibility(actState, hero, getDebugEncounterContext());
        const map = new Map();
        (Array.isArray(result?.eligible) ? result.eligible : []).forEach((item) => {
            map.set(item.charKey, { ...item, debugState: 'ready' });
        });
        (Array.isArray(result?.blocked) ? result.blocked : []).forEach((item) => {
            if (!map.has(item.charKey)) map.set(item.charKey, { ...item, debugState: 'blocked' });
        });
        return map;
    }

    function buildEncounterLocationDebugMarkup() {
        const location = getCurrentWorldLocation();
        return `
            <div class="encounter-location-debug">
                <div class="encounter-location-head">
                    <span>MVU LOCATION</span>
                    <strong>${getWorldLocationLayerLabel(location.layer)} · ${location.layer}</strong>
                </div>
                <div class="encounter-location-grid">
                    ${WORLD_LOCATION_LAYERS.map((layer) => `
                        <button class="debug-act-btn${location.layer === layer ? ' is-ready' : ''}" type="button" data-debug-action="set-location-layer" data-location-layer="${layer}">
                            ${getWorldLocationLayerLabel(layer)}
                        </button>
                    `).join('')}
                </div>
            </div>
        `;
    }

    function getEncounterDebugState(charKey, encounter, eligibilityMap) {
        const state = encounter?.characters?.[charKey] || {};
        const queue = Array.isArray(encounter?.queue) ? encounter.queue : [];
        const active = queue.find((item) => item?.charKey === charKey && !['triggered', 'expired', 'cancelled'].includes(item.status));
        if (state.firstMeetDone === true || state.status === 'introduced') {
            return { label: 'DONE', reason: state.introducedNodeId || 'introduced', canForce: false, className: 'is-done' };
        }
        if (active?.status === 'placed') {
            const phaseIndex = Math.max(0, Math.min(3, Math.round(Number(active.targetPhaseIndex) || 0)));
            return {
                label: 'PLACED',
                reason: `${getRouteOptionLabel(active.targetNodeId || '') || active.targetNodeId || 'NODE'} · ${getPhaseRomanLabel(phaseIndex)}`,
                canForce: false,
                className: 'is-placed'
            };
        }
        if (active) {
            return { label: String(active.status || 'QUEUED').toUpperCase(), reason: 'queue', canForce: false, className: 'is-queued' };
        }
        const evaluated = eligibilityMap.get(charKey);
        if (evaluated?.debugState === 'ready') {
            return { label: 'READY', reason: `priority ${evaluated.priority || 0}`, canForce: true, className: 'is-ready' };
        }
        const reasons = Array.isArray(evaluated?.reasonCodes) && evaluated.reasonCodes.length
            ? evaluated.reasonCodes.join(' / ')
            : 'blocked';
        return { label: 'BLOCKED', reason: reasons, canForce: true, className: 'is-blocked' };
    }

    function buildEncounterDebugPanelMarkup(actState, encounter) {
        if (!isOverviewDebugMode()) return '';
        const eligibilityMap = getEncounterDebugEligibilityMap(actState);
        return `
            <details class="encounter-debug-panel"${appState.encounterDebugOpen ? ' open' : ''}>
                <summary>ENCOUNTER DEBUG</summary>
                <div class="encounter-debug-actions">
                    <button class="debug-act-btn" type="button" data-debug-action="encounter-scan">SCAN</button>
                    <button class="debug-act-btn" type="button" data-debug-action="clear-encounter">CLEAR</button>
                </div>
                ${buildEncounterLocationDebugMarkup()}
                <div class="encounter-debug-list">
                    ${ENCOUNTER_DEBUG_CHARACTER_KEYS.map((charKey) => {
                        const debugState = getEncounterDebugState(charKey, encounter, eligibilityMap);
                        return `
                            <div class="encounter-debug-row ${debugState.className}">
                                <div class="encounter-debug-meta">
                                    <strong>${charKey}</strong>
                                    <span>${debugState.label} · ${escapePartyHtml(debugState.reason)}</span>
                                </div>
                                <button class="debug-act-btn${debugState.canForce ? ' is-ready' : ' is-disabled'}" type="button" data-debug-action="force-encounter" data-encounter-char="${charKey}">FORCE</button>
                            </div>
                        `;
                    }).join('')}
                </div>
            </details>
        `;
    }

    function buildEncounterPanelMarkup(actState) {
        const encounter = actState.characterEncounter && typeof actState.characterEncounter === 'object'
            ? actState.characterEncounter
            : {};
        const queue = Array.isArray(encounter.queue) ? encounter.queue : [];
        const activeQueue = queue.filter((item) => item && !['triggered', 'expired', 'cancelled'].includes(item.status));
        const placed = activeQueue.filter((item) => item.status === 'placed');
        const introduced = Object.entries(encounter.characters || {})
            .filter(([, state]) => state?.firstMeetDone === true || state?.status === 'introduced')
            .map(([charKey]) => charKey);
        const activeLabel = placed.length
            ? placed.map((item) => {
                const phaseIndex = Math.max(0, Math.min(3, Math.round(Number(item.targetPhaseIndex) || 0)));
                return `${item.charKey}@${getRouteOptionLabel(item.targetNodeId || '') || item.targetNodeId || 'NODE'}·${getPhaseRomanLabel(phaseIndex)}`;
            }).join(' / ')
            : activeQueue.length
                ? activeQueue.map((item) => `${item.charKey}:${String(item.status || 'queued').toUpperCase()}`).join(' / ')
                : 'EMPTY';
        return `
            <div class="encounter-act-panel">
                <div class="vision-task-row${placed.length ? ' is-ready' : ''}">
                    <span>FIRST MEET</span>
                    <strong>${activeLabel}</strong>
                </div>
                <div class="vision-task-row">
                    <span>DONE</span>
                    <strong>${introduced.length ? introduced.join(' / ') : 'NONE'}</strong>
                </div>
                ${buildEncounterDebugPanelMarkup(actState, encounter)}
            </div>
        `;
    }

    function buildActModePanelMarkup() {
        const actState = getCurrentActStateForPanel();
        const modeLabel = getAdapterModeLabel();
        const stage = normalizeActStage(actState.stage).toUpperCase();
        const crisis = Math.max(0, Math.min(100, Math.round(Number(actState.crisis) || 0)));
        const sight = Math.max(0, Math.round(Number(actState.vision?.baseSight) || 0))
            + Math.max(0, Math.round(Number(actState.vision?.bonusSight) || 0));
        return `
            <div class="act-mode-panel ${isOverviewDebugMode() ? 'is-debug' : 'is-host'}">
                <div class="section-header"><span>ACT MODE</span></div>
                <div class="act-mode-head">
                    <span class="act-mode-label">${modeLabel}</span>
                    <span class="act-mode-stage">${stage}</span>
                </div>
                ${buildModeMetaRows()}
                <div class="act-state-grid">
                    <div class="act-kpi">
                        <span>NODE</span>
                        <strong>${String(appState.currentNodeIndex).padStart(2, '0')}/${String(getCampaignTotalNodes()).padStart(2, '0')}</strong>
                    </div>
                    <div class="act-kpi">
                        <span>PHASE</span>
                        <strong>${Math.min(appState.currentPhaseIndex + 1, PHASE_SLOT_IDS.length)}/${PHASE_SLOT_IDS.length}</strong>
                    </div>
                    <div class="act-kpi">
                        <span>CRISIS</span>
                        <strong>${crisis}</strong>
                    </div>
                    <div class="act-kpi">
                        <span>SIGHT</span>
                        <strong>${sight}</strong>
                    </div>
                </div>
                <div class="act-resource-ledger">${buildResourceStateRows(actState)}</div>
                <div class="act-slot-ledger">${buildPhaseSlotStateRows(actState)}</div>
                ${buildVisionPanelMarkup(actState)}
                ${buildEncounterPanelMarkup(actState)}
                ${buildDebugActionButtons()}
            </div>
        `;
    }

    function renderIntelPanel() {
        const intelBody = document.getElementById('intelBody');
        const nodeData = getCurrentNodeData();
        const rewardMarkup = nodeData.limited.map((reward) => `
            <div class="token-row type-${reward.key}">
                <div class="token-sigil">
                    <div class="sigil-${reward.key}"></div>
                </div>
                <div class="token-info">
                    <div class="token-title">${reward.title}</div>
                    <div class="token-sub">${reward.sublabel}</div>
                </div>
                <div class="token-count">${String(reward.count).padStart(2, '0')}</div>
            </div>
        `).join('');
        const rosterMarkup = buildPartyRosterMarkup();
        const actPanelMarkup = buildActModePanelMarkup();

        intelBody.innerHTML = `
            <div class="node-hero">
                <span class="hero-node">${nodeData.label}</span>
                <span class="hero-title">${nodeData.title}</span>
                <span class="hero-subtitle">${nodeData.subtitle}</span>
            </div>
            <div>
                <div class="section-header"><span>${appData.intel.rewardsTitle}</span></div>
                <div class="token-ledger-list">${rewardMarkup}</div>
            </div>
            ${actPanelMarkup}
            <div>
                <div class="section-header"><span>${appData.intel.rosterTitle}</span></div>
                <div class="glass-cards-grid">${rosterMarkup}</div>
            </div>
        `;
    }

    function renderAppShell() {
        renderTopbar();
        renderSidebar();
        renderMapLayer();
        renderPlannerDrawer();
        renderPhaseBar();
        renderIntelPanel();
    }

    startNode(1);
    renderAppShell();

    // 摄像机镜头物理引擎
    const viewport = document.getElementById('mapViewport');
    const layer = document.getElementById('mapLayer');
    const mapLayerMeta = document.getElementById('map-layer-meta');
    let canvas = document.getElementById('fate-canvas');
    const sysTopbar = document.getElementById('sysTopbar');
    const phaseBarMount = document.getElementById('phaseBarMount');
    
    let scale = 1; 
    let viewportWidth = viewport.clientWidth;
    let viewportHeight = viewport.clientHeight;
    let panX = 0;
    let panY = 0;
    let layerMetrics = { width: 1, height: 1 };

    let isDragging = false;
    let startMouseX = 0, startMouseY = 0;

    function updateTransform() { layer.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`; }

    function parsePxPosition(value, fallback = 0) {
        const parsed = Number.parseFloat(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    function getRowOffsets(count) {
        if (count === 1) return [0];
        if (count === 2) return [-AUTO_LAYOUT_RULES.spreadTwo, AUTO_LAYOUT_RULES.spreadTwo];
        if (count === 3) return [-AUTO_LAYOUT_RULES.spreadThree, 0, AUTO_LAYOUT_RULES.spreadThree];
        if (count === 4) return [-360, -120, 120, 360];
        if (count === 5) return [-480, -240, 0, 240, 480];
        return Array.from({ length: count }, (_, index) => (index - (count - 1) / 2) * 190);
    }

    function getMicroLayoutOffset(count, columnIndex, nodeIndex) {
        const presets = {
            1: [[0, 0]],
            2: [[-6, -6], [6, 6]],
            3: [[-8, -8], [3, 0], [-6, 8]],
            4: [[-9, -9], [6, -3], [-6, 3], [9, 9]],
            5: [[-10, -10], [6, -6], [0, 0], [-6, 6], [10, 10]]
        };
        const selected = presets[count];
        if (selected?.[nodeIndex]) {
            const [dx, dy] = selected[nodeIndex];
            const direction = columnIndex % 2 === 0 ? 1 : -1;
            return { dx: dx * direction, dy };
        }
        return {
            dx: ((nodeIndex % 2 === 0 ? -1 : 1) * 12),
            dy: (nodeIndex - ((count - 1) / 2)) * 10
        };
    }

    function getLaneAnchorValue(nodeId, count) {
        const nodeData = getNodeData(nodeId);
        const laneScalars = {
            white: -1,
            blue: -0.33,
            orange: 0.33,
            red: 1
        };
        const rowOffsets = getRowOffsets(count);
        const maxOffset = rowOffsets.length
            ? Math.max(...rowOffsets.map((value) => Math.abs(value)))
            : 0;
        const getLaneValue = (laneKey) => {
            const scalar = laneScalars[laneKey];
            if (!Number.isFinite(scalar)) return null;
            return scalar * maxOffset * 0.9;
        };
        const mainlineLanes = Array.isArray(nodeData?.mainlineLanes) ? nodeData.mainlineLanes : [];
        if (mainlineLanes.length) {
            const values = mainlineLanes
                .map((laneKey) => getLaneValue(laneKey))
                .filter((value) => Number.isFinite(value));
            if (values.length) {
                return values.reduce((sum, value) => sum + value, 0) / values.length;
            }
        }
        if (typeof nodeData?.lane === 'string') {
            const fallbackLaneValue = getLaneValue(nodeData.lane);
            if (Number.isFinite(fallbackLaneValue)) return fallbackLaneValue;
        }
        return 0;
    }

    function applyAutoMacroLayout() {
        getMapColumns().forEach((column, columnIndex) => {
            const x = AUTO_LAYOUT_RULES.startX + (AUTO_LAYOUT_RULES.columnGap * columnIndex);
            const offsets = getRowOffsets(column.nodeIds.length);
            const gridLine = document.getElementById(column.lineId);

            if (gridLine) {
                gridLine.style.left = `${x}px`;
            }

            column.nodeIds.forEach((nodeId, nodeIndex) => {
                const node = document.getElementById(nodeId);
                if (!node) return;
                const micro = getMicroLayoutOffset(column.nodeIds.length, columnIndex, nodeIndex);
                const baseOffset = offsets[nodeIndex] || 0;
                const laneOffset = getLaneAnchorValue(nodeId, column.nodeIds.length);
                const y = AUTO_LAYOUT_RULES.centerY + (baseOffset * 0.45) + (laneOffset * 0.65) + micro.dy;
                node.style.left = `${x + micro.dx}px`;
                node.style.top = `${y}px`;
            });
        });
    }

    function getFocusNodeCenter() {
        const focus = document.getElementById(currentFocusNodeId);
        if (!focus) return { x: 0, y: 0 };
        return {
            x: parsePxPosition(focus.style.left, 0),
            y: parsePxPosition(focus.style.top, 0)
        };
    }

    function centerViewportOnCurrentFocus() {
        const focus = getFocusNodeCenter();
        panX = (viewportWidth / 2) - (focus.x * scale);
        panY = (viewportHeight / 2) - (focus.y * scale);
        updateTransform();
    }

    function getColumnLineBounds(column, layerHeight, fallbackTop, fallbackBottom) {
        const currentNodeData = getCurrentNodeData();
        if (column.nodeIds.includes(currentNodeData.presentNode)) {
            const presentNode = document.getElementById(currentNodeData.presentNode);
            const presentY = presentNode ? parsePxPosition(presentNode.style.top, NaN) : NaN;

            if (Number.isFinite(presentY)) {
                const top = Math.max(24, Math.round(presentY - GRID_LINE_PADDING_TOP - GRID_LINE_FOCUS_OVERSHOOT));
                const bottom = Math.min(layerHeight - 24, Math.round(presentY + GRID_LINE_PADDING_BOTTOM + GRID_LINE_FOCUS_OVERSHOOT));
                return {
                    top,
                    bottom: Math.max(top + 40, bottom)
                };
            }
        }

        const columnYValues = column.nodeIds
            .map((nodeId) => {
                const node = document.getElementById(nodeId);
                return node ? parsePxPosition(node.style.top, NaN) : NaN;
            })
            .filter((value) => Number.isFinite(value));

        if (!columnYValues.length) {
            return {
                top: fallbackTop,
                bottom: fallbackBottom
            };
        }

        const columnMinY = Math.min(...columnYValues);
        const columnMaxY = Math.max(...columnYValues);
        const top = Math.max(24, Math.round(columnMinY - GRID_LINE_PADDING_TOP));
        const bottom = Math.min(layerHeight - 24, Math.round(columnMaxY + GRID_LINE_PADDING_BOTTOM));

        return {
            top,
            bottom: Math.max(top + 40, bottom)
        };
    }

    function syncLayerSize() {
        const xValues = [];
        const yValues = [];
        const currentNodeData = getCurrentNodeData();

        layer.querySelectorAll('.az-node').forEach((node) => {
            xValues.push(parsePxPosition(node.style.left, 0));
            yValues.push(parsePxPosition(node.style.top, 0));
        });

        layer.querySelectorAll('.grid-base-line').forEach((line) => {
            xValues.push(parsePxPosition(line.style.left, 0));
        });

        const maxX = xValues.length ? Math.max(...xValues) : viewportWidth;
        const maxY = yValues.length ? Math.max(...yValues) : viewportHeight / 2;
        const minY = yValues.length ? Math.min(...yValues) : viewportHeight / 2;
        const layerWidth = Math.ceil(maxX + LAYER_PADDING_X);
        // Give the current column line enough room below the focused node so the
        // vertical day-line stays visually centered instead of getting clipped.
        const layerHeight = Math.ceil(maxY + Math.max(LAYER_PADDING_Y, LAYER_BOTTOM_PADDING_Y, minY * 0.08));
        const gridTop = Math.max(24, Math.round(minY - GRID_LINE_PADDING_TOP));
        const gridBottom = Math.min(layerHeight - 24, Math.round(maxY + GRID_LINE_PADDING_BOTTOM));
        const gridHeight = Math.max(40, gridBottom - gridTop);
        const presentNode = currentNodeData?.presentNode
            ? document.getElementById(currentNodeData.presentNode)
            : null;
        const presentNodeX = presentNode ? parsePxPosition(presentNode.style.left, NaN) : NaN;

        layerMetrics = { width: layerWidth, height: layerHeight };
        layer.style.width = `${layerWidth}px`;
        layer.style.height = `${layerHeight}px`;
        canvas.setAttribute('viewBox', `0 0 ${layerWidth} ${layerHeight}`);

        getMapColumns().forEach((column) => {
            const line = document.getElementById(column.lineId);
            if (!line) return;
            const bounds = getColumnLineBounds(column, layerHeight, gridTop, gridBottom);
            const lineLeft = column.nodeIds.includes(currentNodeData.presentNode) && Number.isFinite(presentNodeX)
                ? presentNodeX
                : parsePxPosition(line.style.left, 0);
            line.style.left = `${lineLeft}px`;
            line.style.top = `${bounds.top}px`;
            line.style.height = `${Math.max(40, bounds.bottom - bounds.top)}px`;
        });

        if (mapLayerMeta) {
            const currentNodeTemplate = getCurrentNodeTemplate();
            const currentNodeDebugLabel = getNodeDebugLabel(currentNodeTemplate);
            mapLayerMeta.textContent = shouldShowMapProgressMeta()
                ? (
                    isRouteSelectionActive()
                        ? `MACRO THREAT MAP · NODE ${String(appState.currentNodeIndex + 1).padStart(2, '0')}`
                        : isPlanningPhase()
                            ? `MACRO THREAT MAP · NODE ${String(appState.currentNodeIndex).padStart(2, '0')}`
                            : `MACRO THREAT MAP · NODE ${String(appState.currentNodeIndex).padStart(2, '0')} · SEG ${Math.min(appState.currentPhaseIndex + 1, appData.planner.phases.length)}/${appData.planner.phases.length}`
                )
                : `MACRO THREAT MAP · NODE ${String(appState.currentNodeIndex).padStart(2, '0')}`;
            if (currentNodeDebugLabel) {
                mapLayerMeta.textContent += ` · ${currentNodeDebugLabel}`;
            }
        }
    }

    function fitLayerToViewport() {
        const safeWidth = Math.max(viewportWidth - 180, 320);
        const safeHeight = Math.max(viewportHeight - 220, 320);
        const widthScale = safeWidth / Math.max(layerMetrics.width, 1);
        const heightScale = safeHeight / Math.max(layerMetrics.height, 1);
        const fittedScale = Math.min(widthScale, heightScale, 1) * LAYER_FIT_SHRINK;
        scale = Math.max(0.32, fittedScale);
    }
    
    window.addEventListener('resize', () => {
        viewportWidth = viewport.clientWidth;
        viewportHeight = viewport.clientHeight;
        applyAutoMacroLayout();
        syncLayerSize();
        fitLayerToViewport();
        centerViewportOnCurrentFocus();
    });

    applyAutoMacroLayout();
    syncLayerSize();
    fitLayerToViewport();
    centerViewportOnCurrentFocus();

    viewport.addEventListener('mousedown', (e) => {
        if (e.target.closest('.az-node')) return;
        isDragging = true;
        startMouseX = e.clientX - panX;
        startMouseY = e.clientY - panY;
    });
    window.addEventListener('mouseup', () => { isDragging = false; });
    window.addEventListener('mousemove', (e) => { if (!isDragging) return; panX = e.clientX - startMouseX; panY = e.clientY - startMouseY; updateTransform(); });

    viewport.addEventListener('wheel', (e) => {
        e.preventDefault();
        const rect = viewport.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const zoomFactor = -e.deltaY * 0.001;
        let newScale = scale * Math.exp(zoomFactor);
        newScale = Math.max(0.2, Math.min(newScale, 2.0)); 
        const scaleRatio = newScale / scale;
        panX = mouseX - (mouseX - panX) * scaleRatio;
        panY = mouseY - (mouseY - panY) * scaleRatio;
        scale = newScale;
        updateTransform();
    }, { passive: false });

    let plannerToggleBtn = null;
    let plannerDrawer = null;
    let inventoryPanel = null;
    let inventoryTokens = [];
    let dropZones = [];
    let restTintButtons = [];
    let btnExecute = null;

    function getControlledNodeEntry(nodeId) {
        const actState = buildCurrentActStateSnapshot();
        const controlledNodes = actState.controlledNodes && typeof actState.controlledNodes === 'object'
            ? actState.controlledNodes
            : {};
        const entry = controlledNodes[nodeId];
        return entry && typeof entry === 'object' ? entry : null;
    }

    function getOriginalNodeTypeClass(node) {
        const rawTypeClass = node.classes.find((className) => className.startsWith('type-'));
        const originalType = normalizeResourceKey(rawTypeClass ? rawTypeClass.replace('type-', '') : '', 'vision');
        return `type-${originalType}`;
    }

    function getDisplayTypeKeyForMapNode(node) {
        const controlledEntry = getControlledNodeEntry(node.id);
        const controlType = normalizeRestTintKey(controlledEntry?.type, '');
        if (controlType) return controlType;
        return getOriginalNodeTypeClass(node).replace('type-', '');
    }

    function getMapClassNameForNode(node) {
        const isBranchNode = node.classes.includes('node-branch');
        const hasFixedPhase = node.classes.includes('node-has-fixed-phase');
        const classList = ['az-node'];
        const currentNodeData = getCurrentNodeData();
        const isBossNode = isBossNodeId(node.id);
        const isFinaleNode = isFinaleNodeId(node.id);
        const controlledEntry = getControlledNodeEntry(node.id);
        const controlType = normalizeRestTintKey(controlledEntry?.type, '');
        const displayTypeClass = `type-${getDisplayTypeKeyForMapNode(node)}`;
        const pathNodeIds = Array.isArray(currentNodeData.pathNodes) && currentNodeData.pathNodes.length
            ? currentNodeData.pathNodes
            : appState.routeHistory;
        const routeSelectionActive = isRouteSelectionActive();
        const routeOptionIds = routeSelectionActive ? getRouteOptions() : [];
        const isRouteChoiceNode = routeOptionIds.includes(node.id);
        const isJumpRouteChoice = isRouteChoiceNode && appData.runtime.frontendSnapshot?.routeMode === 'jump';
        const encounterMarkers = getEncounterMarkersForNode(node.id);

        if (node.id === currentNodeData.presentNode) {
            classList.push(isBossNode ? 'node-reckoning' : isFinaleNode ? 'node-finale' : 'node-present');
        } else if (pathNodeIds.includes(node.id)) {
            classList.push('node-path');
        } else if (currentNodeData.deadNodes.includes(node.id)) {
            classList.push('node-dead');
        } else if (isRouteChoiceNode) {
            classList.push(isBossNode ? 'node-reckoning' : isFinaleNode ? 'node-finale' : 'node-future', 'node-route-choice');
            if (isJumpRouteChoice) classList.push('node-jump-choice');
        } else if (isBossNode) {
            classList.push('node-reckoning');
        } else if (isFinaleNode) {
            classList.push('node-finale');
        } else {
            classList.push('node-future');
            if (isImmediateNextNode(node.id)) {
                classList.push('node-next');
            } else {
                classList.push('node-future-far');
            }
        }

        if (isBranchNode) classList.push('node-branch');
        if (hasFixedPhase) classList.push('node-has-fixed-phase');
        if (displayTypeClass) classList.push(displayTypeClass);
        if (node.id !== currentNodeData.presentNode && !pathNodeIds.includes(node.id) && !currentNodeData.deadNodes.includes(node.id)) {
            classList.push(isNodeInVisionRange(node.id) ? 'node-visible' : 'node-obscured');
        }
        if (controlledEntry) {
            classList.push('node-controlled', `control-${controlType || 'neutral'}`);
        }
        if (encounterMarkers.length) {
            classList.push('node-encounter');
        }
        return classList.join(' ');
    }

    function updateMapUI() {
        getMapColumns().forEach((column) => {
            const lineEl = document.getElementById(column.lineId);
            if (!lineEl) return;
            lineEl.className = `grid-base-line ${getCurrentColumnLineClass(column)}`;
        });

        getMapNodes().forEach((node) => {
            const nodeEl = document.getElementById(node.id);
            if (!nodeEl) return;
            nodeEl.className = getMapClassNameForNode(node);
            const labelEl = nodeEl.querySelector('.node-label');
            const sublabelEl = nodeEl.querySelector('.node-sublabel');
            if (labelEl) labelEl.textContent = node.label;
            if (sublabelEl) sublabelEl.textContent = node.sublabel;
            nodeEl.dataset.displayType = getDisplayTypeKeyForMapNode(node);
            const controlledEntry = getControlledNodeEntry(node.id);
            const controlType = normalizeRestTintKey(controlledEntry?.type, '');
            const encounterMarkup = buildEncounterBadgeMarkup(node.id);
            const ringEl = nodeEl.querySelector('.astrolabe-ring');
            let encounterEl = ringEl?.querySelector('.encounter-badge');
            if (ringEl) {
                if (encounterMarkup) {
                    if (encounterEl) encounterEl.outerHTML = encounterMarkup;
                    else ringEl.insertAdjacentHTML('afterbegin', encounterMarkup);
                } else if (encounterEl) {
                    encounterEl.remove();
                }
            }
            const encounterMarker = getEncounterMarkersForNode(node.id)[0] || null;
            if (encounterMarker) {
                nodeEl.dataset.encounterChar = encounterMarker.charKey;
            } else {
                nodeEl.removeAttribute('data-encounter-char');
            }
            if (controlType) {
                nodeEl.dataset.controlType = controlType;
            } else {
                nodeEl.removeAttribute('data-control-type');
            }
        });
        currentFocusNodeId = getCurrentNodeData().mapFocus;
        syncLayerSize();
        initSVGPaths();
        ensureDrawLoop();
        centerViewportOnCurrentFocus();
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
        if (needsMapLayerRebuild()) {
            renderMapLayer();
            canvas = document.getElementById('fate-canvas');
            applyAutoMacroLayout();
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

    function resetSelection() {
        selectionState.source = null;
        selectionState.type = null;
        selectionState.slotId = null;
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
        selectionState.source = 'inventory';
        selectionState.type = type;
        selectionState.slotId = null;
    }

    function selectSlotToken(slotId) {
        if (!canEditPhaseSlot(slotId)) return;
        const token = appState.phaseSlots[slotId];
        if (!token) return;
        selectionState.source = 'slot';
        selectionState.type = token.type;
        selectionState.slotId = slotId;
    }

    function consumeInventoryToken(type) {
        const plannerRuntime = getOverviewPlannerRuntimeApi();
        if (plannerRuntime && typeof plannerRuntime.consumeInventoryToken === 'function') {
            return plannerRuntime.consumeInventoryToken(createPlannerRuntimeContext(), type);
        }
        const key = type.toLowerCase();
        const source = getPreferredSourceForKey(key);
        if (!source) return null;
        appState.inventory[key][source] -= 1;
        return { key, type, source, amount: 1, sources: [source] };
    }

    function restoreTokenToInventory(token) {
        const plannerRuntime = getOverviewPlannerRuntimeApi();
        if (plannerRuntime && typeof plannerRuntime.restoreTokenToInventory === 'function') {
            plannerRuntime.restoreTokenToInventory(createPlannerRuntimeContext(), token);
            return;
        }
        if (!token) return;
        const amount = Math.max(1, Math.min(3, Math.round(Number(token.amount) || 1)));
        const sources = Array.isArray(token.sources) && token.sources.length
            ? token.sources.slice(0, amount)
            : Array.from({ length: amount }, () => token.source);
        sources.forEach((source) => {
            const bucket = source === 'reserve' ? 'reserve' : 'limited';
            appState.inventory[token.key][bucket] += 1;
        });
        restoreRestTintToInventory(token);
    }

    function restoreRestTintToInventory(token) {
        if (!token || token.key !== 'rest') return;
        const tint = normalizeRestTintKey(token.tint || token.controlType || token.targetKey, '');
        const tintSource = getRestTintSource(token.tintSource);
        if (!tint || !tintSource || !appState.inventory[tint]) return;
        appState.inventory[tint][tintSource] += 1;
        delete token.tint;
        delete token.tintSource;
        delete token.controlType;
        delete token.targetKey;
    }

    function setSelectedRestTint(tintKey) {
        const token = getSelectedRestSlotToken();
        if (!token) return false;
        const nextTint = normalizeRestTintKey(tintKey, 'neutral');
        const currentTint = normalizeRestTintKey(token.tint || token.controlType || token.targetKey, 'neutral');
        if (nextTint === currentTint) return true;

        let nextSource = '';
        if (nextTint !== 'neutral') {
            nextSource = getPreferredSourceForKey(nextTint);
            if (!nextSource) return false;
            appState.inventory[nextTint][nextSource] -= 1;
        }

        restoreRestTintToInventory(token);
        if (nextTint !== 'neutral') {
            token.tint = nextTint;
            token.tintSource = nextSource;
        }
        markActStateDirty();
        refreshAllUI();
        return true;
    }

    function placeInventorySelection(slotId) {
        if (!canEditPhaseSlot(slotId)) return;
        if (selectionState.source !== 'inventory' || !selectionState.type) return;
        const currentToken = appState.phaseSlots[slotId];
        const selectedKey = normalizeResourceKey(selectionState.type, '');
        if (currentToken && currentToken.key === selectedKey && Math.max(1, Math.round(Number(currentToken.amount) || 1)) < 3) {
            const extraToken = consumeInventoryToken(selectionState.type);
            if (!extraToken) return;
            currentToken.amount = Math.max(1, Math.round(Number(currentToken.amount) || 1)) + 1;
            currentToken.sources = Array.isArray(currentToken.sources) ? currentToken.sources : [currentToken.source || 'limited'];
            currentToken.sources.push(extraToken.source);
            currentToken.source = currentToken.sources.includes('limited') ? 'limited' : 'reserve';
            markActStateDirty();
            if (getTotalInventoryCount(currentToken.key) <= 0) {
                resetSelection();
            } else {
                selectInventoryToken(selectionState.type);
            }
            refreshAllUI();
            return;
        }
        const token = consumeInventoryToken(selectionState.type);
        if (!token) return;
        restoreTokenToInventory(appState.phaseSlots[slotId]);
        appState.phaseSlots[slotId] = token;
        markActStateDirty();
        if (getTotalInventoryCount(token.key) <= 0) {
            resetSelection();
        } else {
            selectInventoryToken(token.type);
        }
        refreshAllUI();
    }

    function moveOrSwapSlotSelection(targetSlotId) {
        if (selectionState.source !== 'slot' || !selectionState.slotId) return;
        const sourceSlotId = selectionState.slotId;
        if (sourceSlotId === targetSlotId) return;
        if (!canEditPhaseSlot(sourceSlotId) || !canEditPhaseSlot(targetSlotId)) return;
        const sourceToken = appState.phaseSlots[sourceSlotId];
        if (!sourceToken) {
            resetSelection();
            refreshAllUI();
            return;
        }

        const targetToken = appState.phaseSlots[targetSlotId];
        appState.phaseSlots[targetSlotId] = sourceToken;
        appState.phaseSlots[sourceSlotId] = targetToken || null;
        markActStateDirty();
        selectSlotToken(targetSlotId);
        refreshAllUI();
    }

    function returnSelectedSlotTokenToInventory() {
        if (selectionState.source !== 'slot' || !selectionState.slotId) return;
        if (!canEditPhaseSlot(selectionState.slotId)) {
            resetSelection();
            refreshPlannerUI();
            return;
        }
        const token = appState.phaseSlots[selectionState.slotId];
        restoreTokenToInventory(token);
        appState.phaseSlots[selectionState.slotId] = null;
        markActStateDirty();
        resetSelection();
        refreshAllUI();
    }

    function grantDebugResource(key, amount = 1, source = 'reserve') {
        if (!isOverviewDebugMode()) return false;
        const normalizedKey = normalizeResourceKey(key, '');
        if (!normalizedKey) return false;
        const bucket = source === 'limited' ? 'limited' : 'reserve';
        appState.inventory[normalizedKey][bucket] += Math.max(1, Math.round(Number(amount) || 1));
        markActStateDirty();
        refreshAllUI();
        return true;
    }

    function getDebugEncounterContext() {
        const node = getCurrentNodeData();
        const runtimeNode = getNodeRuntimeEntry(node.presentNode);
        const location = getCurrentWorldLocation();
        return {
            day: 99,
            geo: location.layer,
            location,
            world: {
                location
            },
            tags: [
                'debug',
                'casino',
                location.layer,
                location.site,
                runtimeNode?.ui?.subtitle,
                runtimeNode?.narrative?.title,
                runtimeNode?.narrative?.overview,
                runtimeNode?.narrative?.guidance
            ].filter(Boolean),
            flags: ['debug']
        };
    }

    function scanDebugEncounters() {
        if (!isOverviewDebugMode()) return false;
        const actModule = getActModuleApi();
        if (!actModule || typeof actModule.evaluateCharacterEncounterEligibility !== 'function') return false;
        const currentPayload = adapterState.lastPayload || buildInitialDebugPayload();
        const hero = extractHeroPayload(currentPayload) || { funds: appState.resources.funds, assets: appState.resources.assets };
        const result = actModule.evaluateCharacterEncounterEligibility(buildCurrentActStateSnapshot(), hero, getDebugEncounterContext());
        const eligible = Array.isArray(result?.eligible) ? result.eligible.map((item) => item.charKey) : [];
        const blockedCount = Array.isArray(result?.blocked) ? result.blocked.length : 0;
        syncState.statusText = eligible.length
            ? `ENCOUNTER READY: ${eligible.join('/')}`
            : `ENCOUNTER NONE (${blockedCount} BLOCKED)`;
        refreshAllUI();
        return true;
    }

    function forceDebugEncounter(charKey) {
        if (!isOverviewDebugMode()) return false;
        const actModule = getActModuleApi();
        if (!actModule || typeof actModule.debugForceCharacterEncounter !== 'function' || typeof actModule.getChapter !== 'function') return false;
        const normalizedCharKey = typeof charKey === 'string' ? charKey.trim().toUpperCase() : '';
        if (!normalizedCharKey) return false;
        return updateActStatePayloadAndCommit((actState) => {
            const config = actModule.getChapter(actState.id || getCurrentChapterId());
            const result = actModule.debugForceCharacterEncounter(actState, normalizedCharKey, config, { distance: 2 });
            syncState.statusText = result?.applied
                ? `ENCOUNTER FORCED: ${normalizedCharKey}`
                : `ENCOUNTER SKIP: ${result?.reason || normalizedCharKey}`;
            return result?.actState || actState;
        });
    }

    function clearDebugEncounterQueue() {
        if (!isOverviewDebugMode()) return false;
        return updateActStatePayloadAndCommit((actState) => {
            const encounter = actState.characterEncounter && typeof actState.characterEncounter === 'object'
                ? deepCloneValue(actState.characterEncounter)
                : {};
            const characters = encounter.characters && typeof encounter.characters === 'object'
                ? deepCloneValue(encounter.characters)
                : {};
            Object.entries(characters).forEach(([charKey, state]) => {
                if (!state || typeof state !== 'object') return;
                if (state.firstMeetDone === true || state.status === 'introduced') return;
                characters[charKey] = {
                    ...state,
                    status: 'locked',
                    queuedRequestId: '',
                    placedNodeId: '',
                    reasonCodes: []
                };
            });
            actState.characterEncounter = {
                ...encounter,
                queue: Array.isArray(encounter.queue)
                    ? encounter.queue.filter((item) => ['triggered', 'expired', 'cancelled'].includes(item?.status))
                    : [],
                characters
            };
            syncState.statusText = 'ENCOUNTER QUEUE CLEARED';
            return actState;
        });
    }

    function setDebugWorldLocationLayer(layerValue) {
        if (!isOverviewDebugMode()) return false;
        const layer = normalizeWorldLocationLayer(layerValue, '');
        if (!layer) return false;
        return updateWorldPayloadAndCommit((world) => {
            const location = normalizeWorldLocation(world.location);
            world.location = {
                ...location,
                layer
            };
            syncState.statusText = `LOCATION: ${layer}`;
            return world;
        });
    }

    function resetDebugActState() {
        if (!isOverviewDebugMode()) return false;
        if (window.ACE0DashboardDebug && typeof window.ACE0DashboardDebug.reset === 'function') {
            window.ACE0DashboardDebug.reset();
            return true;
        }
        const payload = createDebugPayloadFromActState(createDefaultActStateForDashboard(DEFAULT_DASHBOARD_CHAPTER_ID));
        writeStoredDebugPayload(payload);
        applyActStateFromPayload(payload);
        return true;
    }

    function advanceDebugActWithModule(stepCount = 1) {
        if (!isOverviewDebugMode()) return false;
        if (getCurrentVisionFixedPhasePrompt()) {
            refreshAllUI();
            return false;
        }
        const actModule = getActModuleApi();
        if (!actModule || typeof actModule.resolvePendingAdvanceState !== 'function' || typeof actModule.getChapter !== 'function') return false;

        const currentPayload = adapterState.lastPayload || buildInitialDebugPayload();
        const currentHero = extractHeroPayload(currentPayload) || {
            funds: appState.resources.funds,
            assets: appState.resources.assets,
            debt: appState.resources.debt,
            majorDebt: appState.resources.majorDebt,
            roster: {
                KAZU: {
                    mana: appState.resources.mana,
                    maxMana: Math.max(100, appState.resources.mana)
                }
            }
        };
        const currentWorld = extractWorldPayload(currentPayload) || {};
        const actState = {
            ...buildActStateForCommit(),
            phase_advance: Math.max(1, Math.min(4, Math.round(Number(stepCount) || 1)))
        };
        const config = actModule.getChapter(actState.id);
        if (!config) return false;

        let result = null;
        try {
            result = actModule.resolvePendingAdvanceState(actState, currentHero, config);
        } catch (error) {
            console.warn('[ACE0 DEBUG] advance through ACT module failed:', error);
            return false;
        }
        if (!result?.actState) return false;

        const nextPayload = buildNormalizedDashboardPayload({
            ...(currentPayload || {}),
            hero: result.heroState && typeof result.heroState === 'object'
                ? result.heroState
                : currentHero,
            world: {
                ...(currentWorld || {}),
                act: result.actState
            }
        }, {
            actState: result.actState,
            forceActDerivedSnapshot: true
        });
        if (!nextPayload) return false;

        writeStoredDebugPayload(nextPayload);
        applyActStateFromPayload(nextPayload);
        return true;
    }

    function advanceDebugActSafely(stepCount = 1) {
        if (!isOverviewDebugMode()) return false;
        const steps = Math.max(1, Math.min(PHASE_SLOT_IDS.length, Math.round(Number(stepCount) || 1)));
        for (let index = 0; index < steps; index += 1) {
            if (getCurrentVisionFixedPhasePrompt()) {
                refreshAllUI();
                return true;
            }
            if (!advanceDebugActWithModule(1)) return false;
            if (getCurrentVisionFixedPhasePrompt()) {
                refreshAllUI();
                return true;
            }
            if (appState.awaitingRouteChoice || appState.currentPhaseIndex >= PHASE_SLOT_IDS.length) return true;
        }
        return true;
    }

    function advanceDebugNode() {
        if (!isOverviewDebugMode()) return false;
        if (appState.awaitingRouteChoice) {
            const nextRoute = getRouteOptions()[0];
            if (nextRoute) {
                chooseNextRoute(nextRoute);
                return true;
            }
            return false;
        }
        if (canExecuteCurrentNode()) {
            return advanceDebugActSafely(PHASE_SLOT_IDS.length - appState.currentPhaseIndex);
        }
        if (appState.currentNodeIndex < getCampaignTotalNodes()) {
            const currentNodeData = getCurrentNodeData();
            const nextNodeId = currentNodeData.nextForcedNodeId || getRouteOptions()[0] || getDefaultPresentNodeId(getNodeTemplate(appState.currentNodeIndex + 1));
            if (!nextNodeId) return false;
            appState.routeHistory = appState.routeHistory.slice(0, appState.currentNodeIndex);
            appState.routeHistory.push(nextNodeId);
            startNode(appState.currentNodeIndex + 1, nextNodeId);
            markActStateDirty();
            commitActStateToHost();
            refreshAllUI();
            return true;
        }
        return false;
    }

    function handleDebugActAction(action, target) {
        if (!isOverviewDebugMode()) return false;
        if (target?.closest?.('.encounter-debug-panel')) {
            appState.encounterDebugOpen = true;
        }
        if (action === 'grant-resource') {
            return grantDebugResource(target?.dataset?.resourceKey, 1, 'reserve');
        }
        if (action === 'advance-phase') {
            if (getCurrentVisionFixedPhasePrompt()) {
                refreshAllUI();
                return true;
            }
            return advanceDebugActWithModule(1) || (advanceSinglePhase(), true);
        }
        if (action === 'reset-act') {
            return resetDebugActState();
        }
        if (action === 'encounter-scan') {
            return scanDebugEncounters();
        }
        if (action === 'force-encounter') {
            return forceDebugEncounter(target?.dataset?.encounterChar);
        }
        if (action === 'clear-encounter') {
            return clearDebugEncounterQueue();
        }
        if (action === 'set-location-layer') {
            return setDebugWorldLocationLayer(target?.dataset?.locationLayer);
        }
        if (action === 'advance-node') {
            return advanceDebugNode();
        }
        if (action === 'next-chapter') {
            return enterNextChapterInDebug();
        }
        return false;
    }

    function applyCurrentPhaseVisionChoice(action, replacementKeyValue = '') {
        const prompt = getCurrentVisionFixedPhasePrompt();
        if (!prompt) return false;
        const replacementKey = normalizeResourceKey(replacementKeyValue, '');
        const shouldReplace = action === 'replace' && replacementKey;
        const shouldKeep = action === 'keep';
        if (!shouldReplace && !shouldKeep) return false;
        return updateActStatePayloadAndCommit((actState) => {
            const vision = actState.vision && typeof actState.vision === 'object'
                ? deepCloneValue(actState.vision)
                : { baseSight: 1, bonusSight: 0, jumpReady: false, pendingReplace: null };
            const charges = Math.max(1, Math.round(Number(vision.pendingReplace?.charges) || prompt.charges || 1));
            if (shouldKeep) {
                vision.pendingReplace = {
                    status: 'charged',
                    charges,
                    source: 'vision2',
                    skippedPhaseKey: prompt.phaseKey
                };
            } else {
                vision.pendingReplace = {
                    status: 'ready',
                    charges,
                    source: 'vision2',
                    nodeId: prompt.nodeId,
                    nodeIndex: prompt.nodeIndex,
                    phaseIndex: prompt.phaseIndex,
                    originalKey: prompt.fixedKind,
                    replacementKey
                };
            }
            actState.vision = vision;
            return actState;
        });
    }

    function executeTokenEffect(token) {
        const executionRuntime = getOverviewExecutionRuntimeApi();
        if (executionRuntime && typeof executionRuntime.executeTokenEffect === 'function') {
            executionRuntime.executeTokenEffect(createExecutionRuntimeContext(), token);
            return;
        }
        if (!token) return;
        const amount = Math.max(1, Math.min(3, Math.round(Number(token.amount) || 1)));
        if (token.key === 'rest') {
            appState.resources.mana = Math.min(100, appState.resources.mana + 30 * amount);
        }
    }

    function enterRouteChoiceState() {
        const executionRuntime = getOverviewExecutionRuntimeApi();
        if (executionRuntime && typeof executionRuntime.enterRouteChoiceState === 'function') {
            executionRuntime.enterRouteChoiceState(createExecutionRuntimeContext());
            return;
        }
        resetSelection();
        appState.executing = false;
        appState.drawerOpen = false;
        const currentNodeData = getCurrentNodeData();
        appState.awaitingRouteChoice = currentNodeData.nextRouteMode === 'choice' && getRouteOptions().length > 0;

        if (!appState.awaitingRouteChoice) {
            resetPhaseSlots();
            appState.currentPhaseIndex = appData.planner.phases.length;
        } else {
            appState.currentPhaseIndex = appData.planner.phases.length;
        }

        refreshAllUI();
    }

    function advanceToForcedNextNode() {
        const executionRuntime = getOverviewExecutionRuntimeApi();
        if (executionRuntime && typeof executionRuntime.advanceToForcedNextNode === 'function') {
            return executionRuntime.advanceToForcedNextNode(createExecutionRuntimeContext());
        }
        const currentNodeData = getCurrentNodeData();
        if (currentNodeData.nextRouteMode !== 'forced') return false;
        if (appState.currentNodeIndex >= getCampaignTotalNodes()) return false;

        const forcedNodeId = currentNodeData.nextForcedNodeId || getRouteOptions()[0];
        if (!forcedNodeId) return false;

        const nextRouteHistory = appState.routeHistory.slice(0, appState.currentNodeIndex);
        nextRouteHistory.push(forcedNodeId);
        appState.routeHistory = nextRouteHistory;
        startNode(appState.currentNodeIndex + 1, forcedNodeId);
        markActStateDirty();
        commitActStateToHost();
        return true;
    }

    function finishNodeExecution() {
        const executionRuntime = getOverviewExecutionRuntimeApi();
        if (executionRuntime && typeof executionRuntime.finishNodeExecution === 'function') {
            executionRuntime.finishNodeExecution(createExecutionRuntimeContext());
            return;
        }
        clearPendingLimitedTokens();
        if (shouldGrantReserveGrowthAtEndOfNode()) {
            grantDailyReserveGrowth(appState.currentNodeIndex);
        }
        if (advanceToForcedNextNode()) {
            refreshAllUI();
            return;
        }
        enterRouteChoiceState();
    }

    function runPhaseExecution(index) {
        const executionRuntime = getOverviewExecutionRuntimeApi();
        if (executionRuntime && typeof executionRuntime.runPhaseExecution === 'function') {
            executionRuntime.runPhaseExecution(createExecutionRuntimeContext(), index);
            return;
        }
        if (index >= appData.planner.phases.length) {
            finishNodeExecution();
            return;
        }

        appState.currentPhaseIndex = index;
        const visionPrompt = getCurrentVisionFixedPhasePrompt();
        if (visionPrompt) {
            appState.executing = false;
            refreshAllUI();
            return;
        }
        const phase = appData.planner.phases[index];
        const nodeId = getCurrentNodeData().presentNode;
        const visionReplacement = getReadyVisionReplacementForPhase(nodeId, index);
        const fixedKind = getFixedPhaseKind(nodeId, index);
        const token = appState.phaseSlots[phase.slotId];
        const activeToken = visionReplacement
            ? { key: visionReplacement.key, type: visionReplacement.key.toUpperCase(), source: 'vision', fixed: false, visionReplacement: true }
            : fixedKind
            ? { key: fixedKind, type: fixedKind.toUpperCase(), source: 'fixed', fixed: true }
            : token;
        executeTokenEffect(activeToken);
        if (visionReplacement) {
            consumeReadyVisionReplacementLocally(visionReplacement);
        }
        refreshAllUI();

        window.setTimeout(() => {
            runPhaseExecution(index + 1);
        }, activeToken ? 280 : 160);
    }

    function consumeReadyVisionReplacementLocally(replacement) {
        if (!replacement) return;
        const currentPayload = adapterState.lastPayload || buildInitialDebugPayload();
        const currentActState = extractWorldPayload(currentPayload)?.act || createDefaultActStateForDashboard();
        const currentVision = currentActState.vision && typeof currentActState.vision === 'object'
            ? deepCloneValue(currentActState.vision)
            : { baseSight: 1, bonusSight: 0, jumpReady: false, pendingReplace: null };
        const remaining = Math.max(0, Math.round(Number(currentVision.pendingReplace?.charges) || 1) - 1);
        currentVision.pendingReplace = remaining > 0
            ? { status: 'charged', charges: remaining, source: 'vision2' }
            : null;
        updateActStatePayloadAndCommit({
            vision: currentVision
        });
    }

    function advanceSinglePhase(options = {}) {
        const executionRuntime = getOverviewExecutionRuntimeApi();
        if (executionRuntime && typeof executionRuntime.advanceSinglePhase === 'function') {
            executionRuntime.advanceSinglePhase(createExecutionRuntimeContext(), options);
            return;
        }
        if (!areProgressionControlsEnabled()) return;
        if (!canAdvanceCurrentPhase(options)) return;

        const phaseIndex = appState.currentPhaseIndex;
        const phase = appData.planner.phases[phaseIndex];
        const nodeId = getCurrentNodeData().presentNode;
        const visionReplacement = getReadyVisionReplacementForPhase(nodeId, phaseIndex);
        const fixedKind = getFixedPhaseKind(getCurrentNodeData().presentNode, phaseIndex);
        const token = appState.phaseSlots[phase.slotId];
        const activeToken = visionReplacement
            ? { key: visionReplacement.key, type: visionReplacement.key.toUpperCase(), source: 'vision', fixed: false, visionReplacement: true }
            : fixedKind
            ? { key: fixedKind, type: fixedKind.toUpperCase(), source: 'fixed', fixed: true }
            : token;
        executeTokenEffect(activeToken);
        if (visionReplacement) {
            consumeReadyVisionReplacementLocally(visionReplacement);
        }
        appState.currentPhaseIndex += 1;

        if (appState.currentPhaseIndex >= appData.planner.phases.length) {
            finishNodeExecution();
            return;
        }

        refreshAllUI();
    }

    function executeCurrentNode() {
        const executionRuntime = getOverviewExecutionRuntimeApi();
        if (executionRuntime && typeof executionRuntime.executeCurrentNode === 'function') {
            executionRuntime.executeCurrentNode(createExecutionRuntimeContext());
            return;
        }
        if (!areProgressionControlsEnabled()) return;
        if (!canExecuteCurrentNode()) return;
        appState.executing = true;
        appState.drawerOpen = false;
        appState.currentPhaseIndex = 0;
        resetSelection();
        refreshAllUI();
        runPhaseExecution(0);
    }

    function chooseNextRoute(nodeId) {
        const executionRuntime = getOverviewExecutionRuntimeApi();
        if (executionRuntime && typeof executionRuntime.chooseNextRoute === 'function') {
            executionRuntime.chooseNextRoute(createExecutionRuntimeContext(), nodeId);
            return;
        }
        if (!isRouteSelectionActive()) return;
        if (!getRouteOptions().includes(nodeId)) return;
        appState.routeHistory.push(nodeId);
        startNode(appState.currentNodeIndex + 1, nodeId);
        markActStateDirty();
        commitActStateToHost();
        refreshAllUI();
    }

    function bindPlannerEvents() {
        plannerToggleBtn = document.getElementById('toggle-planner');
        plannerDrawer = document.getElementById('planner-drawer');
        inventoryPanel = document.getElementById('inventory');
        inventoryTokens = Array.from(document.querySelectorAll('.token-dispenser'));
        dropZones = Array.from(document.querySelectorAll('.phase-core.drop-zone'));
        restTintButtons = Array.from(document.querySelectorAll('[data-rest-tint]'));

        inventoryTokens.forEach((token) => {
            if (token.dataset.bound === 'true') return;
            token.dataset.bound = 'true';
            token.addEventListener('click', () => {
                if (!canUseInteractivePlannerControls()) return;
                // executing 下仍允许点击 inventory token，用于编辑未来相位
                if (isRouteSelectionActive() || token.classList.contains('is-empty')) return;
                const type = token.dataset.type;
                if (selectionState.source === 'inventory' && selectionState.type === type) {
                    resetSelection();
                } else {
                    selectInventoryToken(type);
                    appState.drawerOpen = true;
                }
                syncPlannerOpenState();
            });
        });

        dropZones.forEach((zone) => {
            if (zone.dataset.bound === 'true') return;
            zone.dataset.bound = 'true';
            zone.addEventListener('click', () => {
                if (!canUseInteractivePlannerControls()) return;
                if (isRouteSelectionActive()) return;
                const slotId = zone.id;
                // 当前相位及以前的 slot 锁定，仅未来相位可编辑
                if (!canEditPhaseSlot(slotId)) return;
                const mounted = appState.phaseSlots[slotId];
                const editable = canEditPhaseSlot(slotId);

                if (selectionState.source === 'inventory') {
                    if (!editable) return;
                    placeInventorySelection(slotId);
                    return;
                }

                if (selectionState.source === 'slot') {
                    if (selectionState.slotId === slotId) {
                        if (!editable) return;
                        if (mounted) restoreTokenToInventory(mounted);
                        appState.phaseSlots[slotId] = null;
                        markActStateDirty();
                        resetSelection();
                        refreshAllUI();
                        return;
                    }

                    moveOrSwapSlotSelection(slotId);
                    return;
                }

                if (mounted && editable) {
                    selectSlotToken(slotId);
                    syncPlannerOpenState();
                }
            });
        });

        restTintButtons.forEach((button) => {
            if (button.dataset.bound === 'true') return;
            button.dataset.bound = 'true';
            button.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (!canUseInteractivePlannerControls()) return;
                if (button.disabled || button.classList.contains('is-disabled')) return;
                setSelectedRestTint(button.dataset.restTint);
            });
        });

        if (inventoryPanel?.dataset.bound === 'true') return;
        if (inventoryPanel) inventoryPanel.dataset.bound = 'true';
        inventoryPanel.addEventListener('click', (e) => {
            if (!canUseInteractivePlannerControls()) return;
            if (isRouteSelectionActive() || e.target.closest('.token-dispenser')) return;
            if (selectionState.source !== 'slot') return;
            returnSelectedSlotTokenToInventory();
        });
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

        const debugActionButton = e.target.closest('[data-debug-action]');
        if (!debugActionButton) return;
        e.preventDefault();
        e.stopPropagation();
        handleDebugActAction(debugActionButton.dataset.debugAction, debugActionButton);
    });

    phaseBarMount.addEventListener('pointerdown', (e) => {
        const commitActButton = e.target.closest('#commit-act-state');
        if (commitActButton) {
            e.preventDefault();
            commitActStateToHost();
            return;
        }

        const togglePlannerButton = e.target.closest('#toggle-planner');
        if (!togglePlannerButton) return;
        e.preventDefault();
        if (!canOpenPlannerDrawer()) return;
        if (isRouteSelectionActive()) return;
        appState.drawerOpen = !appState.drawerOpen;
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
        const keepAction = e.target.closest('#toggle-planner, #commit-act-state, .route-option-btn, [data-debug-action], [data-vision-phase-action]');
        if (keepAction) return;

        const keep = e.target.closest('.token-dispenser, .phase-core.drop-zone, .mounted-token, #inventory, .rest-control-panel, .az-node');
        if (keep || !selectionState.source) return;
        resetSelection();
        syncPlannerOpenState();
    });

    const themes = {
        'dead':[ { class: 'th-dead', isStatic: true } ],
        'solid_path':[ { class: 'th-path-solid', isStatic: true } ],
        'future':[ { class: 'th-future', isStatic: true } ],
        'finale_far':[ { class: 'th-finale-far', isStatic: true }, { class: 'th-finale-aura', isStatic: false, freq: 1.6, mathAmp: 7, speed: 0.0009, phaseOffset: 0 } ],
        'danger_far':[ { class: 'th-danger-far', isStatic: true }, { class: 'th-danger-aura', isStatic: false, freq: 2, mathAmp: 8, speed: 0.001, phaseOffset: 0 } ],
        'active_flow':[ 
            { class: 'th-active-aura', isStatic: false, freq: 1.5, mathAmp: 5, speed: 0.0008, phaseOffset: 0 },
            { class: 'th-active-main', isStatic: false, freq: 2.2, mathAmp: 3, speed: 0.0016, phaseOffset: Math.PI / 4 },
            { class: 'th-active-high', isStatic: false, freq: 3.5, mathAmp: -2, speed: 0.0022, phaseOffset: Math.PI }
        ]
    };

    let renderQueue =[];

    function getNodeMainlineLanes(nodeId) {
        const nodeData = getNodeData(nodeId);
        return Array.isArray(nodeData?.mainlineLanes) ? nodeData.mainlineLanes : [];
    }

    function getPreferredLaneTargetId(fromNodeId, laneKey) {
        const outgoing = getMapTopology().filter((entry) => entry.from === fromNodeId);
        const candidates = outgoing
            .map((entry) => {
                const targetLanes = getNodeMainlineLanes(entry.to);
                return {
                    nodeId: entry.to,
                    targetLanes
                };
            })
            .filter((entry) => entry.targetLanes.includes(laneKey));
        if (!candidates.length) return '';
        candidates.sort((left, right) => {
            const leftExact = left.targetLanes.length === 1 && left.targetLanes[0] === laneKey ? 0 : 1;
            const rightExact = right.targetLanes.length === 1 && right.targetLanes[0] === laneKey ? 0 : 1;
            if (leftExact !== rightExact) return leftExact - rightExact;
            if (left.targetLanes.length !== right.targetLanes.length) return left.targetLanes.length - right.targetLanes.length;
            return left.nodeId.localeCompare(right.nodeId);
        });
        return candidates[0]?.nodeId || '';
    }

    function getPreferredLaneSourceId(toNodeId, laneKey) {
        const incoming = getMapTopology().filter((entry) => entry.to === toNodeId);
        const candidates = incoming
            .map((entry) => {
                const sourceLanes = getNodeMainlineLanes(entry.from);
                return {
                    nodeId: entry.from,
                    sourceLanes
                };
            })
            .filter((entry) => entry.sourceLanes.includes(laneKey));
        if (!candidates.length) return '';
        candidates.sort((left, right) => {
            const leftExact = left.sourceLanes.length === 1 && left.sourceLanes[0] === laneKey ? 0 : 1;
            const rightExact = right.sourceLanes.length === 1 && right.sourceLanes[0] === laneKey ? 0 : 1;
            if (leftExact !== rightExact) return leftExact - rightExact;
            if (left.sourceLanes.length !== right.sourceLanes.length) return left.sourceLanes.length - right.sourceLanes.length;
            return left.nodeId.localeCompare(right.nodeId);
        });
        return candidates[0]?.nodeId || '';
    }

    function getConnectionLaneKey(conn) {
        if (conn.from === 'node3-descent') {
            if (conn.to === 'node04-a-route') return 'lane-blue';
            if (conn.to === 'node04-b-route') return 'lane-orange';
        }
        if (conn.from === 'node04-a-route' && conn.to === 'node05-a-route') return 'lane-white';
        if (conn.from === 'node04-b-route' && conn.to === 'node05-d-route') return 'lane-red';
        if (conn.from === 'node14-a-route' && conn.to === 'node15-a-route') return 'lane-white';
        if (conn.from === 'node14-b-route' && conn.to === 'node15-a-route') return 'lane-blue';
        if (conn.from === 'node14-c-route' && conn.to === 'node15-a-route') return 'lane-orange';
        if (conn.from === 'node14-c-route' && conn.to === 'node15-b-route') return 'lane-orange';
        if (conn.from === 'node14-d-route' && conn.to === 'node15-b-route') return 'lane-red';
        const fromMainlineLanes = getNodeMainlineLanes(conn.from);
        const toMainlineLanes = getNodeMainlineLanes(conn.to);
        const sharedLane = ['white', 'blue', 'orange', 'red'].find((laneKey) => (
            fromMainlineLanes.includes(laneKey) &&
            toMainlineLanes.includes(laneKey) &&
            getPreferredLaneTargetId(conn.from, laneKey) === conn.to &&
            getPreferredLaneSourceId(conn.to, laneKey) === conn.from
        ));
        return sharedLane ? `lane-${sharedLane}` : 'lane-neutral';
    }

    function getConnectionTypeForCurrentNode(conn) {
        const presentNode = getCurrentNodeData().presentNode;
        if (isBossNodeId(conn.to) && appState.currentNodeIndex < getCampaignTotalNodes()) return 'danger_far';
        if (isFinaleNodeId(conn.to) && appState.currentNodeIndex < getCampaignTotalNodes()) return 'finale_far';
        if (conn.from === presentNode) return 'active_flow';
        if (isVisitedConnection(conn.from, conn.to)) return 'solid_path';
        return 'future';
    }

    function initSVGPaths() {
        if (!getMapNodes().length || !getMapTopology().length) {
            canvas.innerHTML = '';
            renderQueue = [];
            return;
        }
        canvas.innerHTML = ''; 
        renderQueue =[];
        getMapTopology().forEach(conn => {
            const type = getConnectionTypeForCurrentNode(conn);
            const layers = themes[type];
            const laneClass = getConnectionLaneKey(conn);
            layers.forEach(cfg => {
                const pathEl = document.createElementNS(SVG_NS, 'path');
                pathEl.setAttribute('class', `magic-thread ${cfg.class} ${laneClass}`);
                canvas.appendChild(pathEl);
                renderQueue.push({ pathEl: pathEl, fromId: conn.from, toId: conn.to, laneClass, ...cfg });
            });
        });
    }

    function getNodeCenter(id) {
        const el = document.getElementById(id);
        if (!el) return { x: 0, y: 0 };
        return { x: parseFloat(el.style.left), y: parseFloat(el.style.top) };
    }

    let drawActive = true;
    let drawLoopRunning = false;

    function ensureDrawLoop() {
        if (!drawActive || drawLoopRunning) return;
        drawLoopRunning = true;
        requestAnimationFrame(draw);
    }

    function draw() {
        if (!drawActive) {
            drawLoopRunning = false;
            return;
        }
        const time = performance.now();

        renderQueue.forEach(item => {
            const start = getNodeCenter(item.fromId);
            const end = getNodeCenter(item.toId);
            
            const dx = end.x - start.x;
            const cy = dx * 0.45;
            const c1x = start.x + cy, c1y = start.y; 
            const c2x = end.x - cy,   c2y = end.y;

            if (item.isStatic) {
                item.pathEl.setAttribute('d', `M ${start.x} ${start.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${end.x} ${end.y}`);
                return;
            }

            let d = `M ${start.x} ${start.y} `;
            for (let i = 1; i <= SEGMENTS; i++) {
                const t = i / SEGMENTS;
                const mt = 1 - t;
                const pX = mt*mt*mt*start.x + 3*mt*mt*t*c1x + 3*mt*t*t*c2x + t*t*t*end.x;
                const pY = mt*mt*mt*start.y + 3*mt*mt*t*c1y + 3*mt*t*t*c2y + t*t*t*end.y;

                const dX = 3*mt*mt*(c1x - start.x) + 6*mt*t*(c2x - c1x) + 3*t*t*(end.x - c2x);
                const dY = 3*mt*mt*(c1y - start.y) + 6*mt*t*(c2y - c1y) + 3*t*t*(end.y - c2y);
                const len = Math.sqrt(dX*dX + dY*dY) || 1;
                const nX = -dY / len;
                const nY =  dX / len;

                const damping = Math.sin(t * Math.PI); 
                const wave = Math.sin((t * Math.PI * item.freq) + (time * item.speed) + item.phaseOffset);
                const offset = item.mathAmp * damping * wave;

                d += `L ${pX + nX * offset} ${pY + nY * offset} `;
            }
            item.pathEl.setAttribute('d', d);
        });

        requestAnimationFrame(draw);
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
            setCrisis(value) {
                return this.patchActState({
                    crisis: Math.max(0, Math.min(100, Math.round(Number(value) || 0)))
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
                initSVGPaths();
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
        initSVGPaths();
        ensureDrawLoop();
    }

    registerDashboardDebugApi();
    window.addEventListener('message', handleActHostMessage);
    bootstrapDashboard();

    window.__acezeroHomeRefreshIntel = function acezeroHomeRefreshIntel() {
        try { renderIntelPanel(); } catch (err) { console.warn('[home-page] refresh intel failed', err); }
    };

    window.__acezeroHomePageActive = function acezeroHomePageActive(isActive) {
        const next = !!isActive;
        if (drawActive === next) return;
        drawActive = next;
        if (drawActive) ensureDrawLoop();
    };
