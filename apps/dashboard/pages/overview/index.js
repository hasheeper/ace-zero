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
const WORLD_CLOCK_PHASES = ['MORNING', 'NOON', 'AFTERNOON', 'NIGHT'];
const DEFAULT_WORLD_CLOCK = Object.freeze({ day: 1, phase: 'MORNING' });
const WORLD_LOCATION_LAYERS = ['THE_COURT', 'THE_EXCHANGE', 'THE_STREET', 'THE_RUST'];
const WORLD_LOCATION_LAYER_LABELS = Object.freeze({
    THE_COURT: '上庭',
    THE_EXCHANGE: '中市',
    THE_STREET: '下街',
    THE_RUST: '底锈'
});
const ENCOUNTER_DEBUG_TAG_OPTIONS = Object.freeze([
    { key: 'casino', label: 'CASINO' },
    { key: 'gambling_hall', label: 'GAMBLING' },
    { key: 'dealer', label: 'DEALER' },
    { key: 'card_table', label: 'TABLE' },
    { key: 'church', label: 'CHURCH' },
    { key: 'audit', label: 'AUDIT' },
    { key: 'rust', label: 'RUST' },
    { key: 'market', label: 'MARKET' }
]);
const ENCOUNTER_DEBUG_FLAG_OPTIONS = Object.freeze([
    { key: 'church_event_triggered', label: 'CHURCH EVENT' },
    { key: 'sia_introduced', label: 'SIA MET' },
    { key: 'poppy_introduced', label: 'POPPY MET' },
    { key: 'vv_introduced', label: 'VV MET' }
]);
const ENCOUNTER_REASON_LABELS = Object.freeze({
    active_or_done: 'already active/done',
    cooldown: 'cooldown',
    crisis: 'crisis too low',
    day: 'day too early',
    funds: 'funds too low',
    geo: 'wrong geo',
    missing_church_event: 'needs church event',
    missing_day: 'missing day',
    missing_geo: 'missing geo',
    missing_rule: 'missing rule',
    missing_tags: 'missing scene tag',
    node_index: 'node too early',
    requires_any: 'needs one alternate gate',
    spent_score: 'spent score too low',
    tag: 'wrong scene tag'
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

function getOverviewDashboardAdapterApi() {
    const api = typeof window !== 'undefined' ? window.ACE0OverviewDashboardAdapter : null;
    return api && typeof api === 'object' ? api : null;
}

function getOverviewMapViewApi() {
    const api = typeof window !== 'undefined' ? window.ACE0OverviewMapView : null;
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
        normalizeResourceKey,
        resourceTypeMap: RESOURCE_TYPE_MAP,
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
                { key: 'asset', title: '契令', icon: '■', count: 0, className: 'stat-asset' },
                { key: 'vision', title: '情报', icon: '⬢', count: 0, className: 'stat-vision' }
            ],
        resources: [
                { label: 'FUNDS', value: '1,250', className: 'res-gold' },
                { label: 'DECK PTS', value: '0', className: 'res-assets' },
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
                { key: 'combat', type: 'COMBAT', label: '交锋点', sublabel: '', count: 0 },
                { key: 'rest', type: 'REST', label: '休整点', sublabel: '', count: 0 },
                { key: 'asset', type: 'TOKEN', label: '契点', sublabel: '', count: 0 },
                { key: 'vision', type: 'INTEL', label: '情报点', sublabel: '', count: 0 }
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
        event: 'vision',
        intel: 'vision',
        intelligence: 'vision',
        sight: 'vision'
    };
    const RESOURCE_TYPE_MAP = {
        combat: 'COMBAT',
        rest: 'REST',
        asset: 'TOKEN',
        vision: 'INTEL'
    };
    const RESOURCE_LABEL_MAP = {
        combat: '交锋',
        rest: '休整',
        asset: '契令',
        vision: '情报'
    };
    const PLANNER_PAGE_KEYS = ['planner', ...RESOURCE_KEYS];
    const PLANNER_PAGE_META = {
        planner: { title: 'PHASE PLANNER', label: '规划', subtitle: '四段相位排程' },
        combat: { title: 'COMBAT', label: '交锋点', subtitle: '战斗接口预留' },
        rest: { title: 'REST', label: '休整点', subtitle: '回复 / 染色 / 营收' },
        asset: { title: 'ASSET', label: '契令点', subtitle: '契约卡组 / Deck' },
        vision: { title: 'VISION', label: '情报点', subtitle: '视野 / 替换 / 跃迁' }
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
        assetDrawerTab: 'planner',
        plannerPage: 'planner',
        plannerEditMode: 'add',
        plannerAddType: '',
        assetWarehouseOpen: false,
        restTintPopupSlotId: '',
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
            // Balance-sheet assets from hero.assets. AssetDeck points are world.assetDeck.asset_count.
            assets: 0,
            mana: 45,
            majorDebt: 395000000,
            debt: 0
        }
    };
    const INITIAL_RESOURCES = { ...appState.resources };
    const ACT_MESSAGE_TYPES = new Set(['ACE0_ACT_INIT', 'ACE0_ACT_REFRESH', 'ACE0_DASHBOARD_INIT', 'ACE0_DASHBOARD_REFRESH']);
    const ACT_OUTBOUND_MESSAGE_TYPES = {
        commit: 'ACE0_ACT_COMMIT',
        assetCommand: 'ACE0_ASSET_DECK_COMMAND'
    };
    const ACT_INBOUND_MESSAGE_TYPES = {
        commitResult: 'ACE0_ACT_COMMIT_RESULT',
        assetCommandResult: 'ACE0_ASSET_DECK_COMMAND_RESULT'
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
    const assetCommandState = {
        pendingRequestId: '',
        pendingTimer: null,
        resolver: null
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
        const adapterRuntime = getOverviewDashboardAdapterApi();
        return adapterRuntime && typeof adapterRuntime.readStoredJson === 'function'
            ? adapterRuntime.readStoredJson(DASHBOARD_DEBUG_STORAGE_KEY)
            : null;
    }

    function writeStoredDebugPayload(payload) {
        const adapterRuntime = getOverviewDashboardAdapterApi();
        if (adapterRuntime && typeof adapterRuntime.writeStoredJson === 'function') {
            adapterRuntime.writeStoredJson(DASHBOARD_DEBUG_STORAGE_KEY, payload);
        }
    }

    function clearStoredDebugPayload() {
        const adapterRuntime = getOverviewDashboardAdapterApi();
        if (adapterRuntime && typeof adapterRuntime.clearStoredJson === 'function') {
            adapterRuntime.clearStoredJson(DASHBOARD_DEBUG_STORAGE_KEY);
        }
    }

    function extractFrontendSnapshot(payload) {
        const adapterRuntime = getOverviewDashboardAdapterApi();
        return adapterRuntime && typeof adapterRuntime.extractFrontendSnapshot === 'function'
            ? adapterRuntime.extractFrontendSnapshot(payload)
            : null;
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

    function getAssetDeckModuleApi() {
        const candidates = [window];
        try {
            if (window.parent && window.parent !== window) candidates.push(window.parent);
        } catch (_) {}
        try {
            if (window.top && window.top !== window && !candidates.includes(window.top)) candidates.push(window.top);
        } catch (_) {}
        if (typeof globalThis === 'object' && globalThis && !candidates.includes(globalThis)) candidates.push(globalThis);

        for (const candidate of candidates) {
            try {
                const assetModule = candidate?.ACE0Modules?.assetDeck;
                if (assetModule && typeof assetModule.applyAssetDeckCommand === 'function') return assetModule;
            } catch (_) {}
        }
        return null;
    }

    function getAssetSummaryModuleApi() {
        const candidates = [window];
        try {
            if (window.parent && window.parent !== window) candidates.push(window.parent);
        } catch (_) {}
        try {
            if (window.top && window.top !== window && !candidates.includes(window.top)) candidates.push(window.top);
        } catch (_) {}
        if (typeof globalThis === 'object' && globalThis && !candidates.includes(globalThis)) candidates.push(globalThis);

        for (const candidate of candidates) {
            try {
                const assetSummary = candidate?.ACE0Modules?.assetSummary;
                if (assetSummary && typeof assetSummary.buildAssetDeckSummary === 'function') return assetSummary;
            } catch (_) {}
        }
        return null;
    }

    function createFallbackAssetDeckState() {
        return {
            version: 1,
            asset_count: 0,
            general_slots_unlocked: 4,
            void_slots_unlocked: 2,
            active_general_cards: [],
            active_void_cards: [],
            pending_offer: null,
            pending_offer_queue: [],
            pending_replace: null,
            history: [],
            debug: {}
        };
    }

    function normalizeAssetDeckForDashboard(rawAssetDeck) {
        const assetModule = getAssetDeckModuleApi();
        if (assetModule && typeof assetModule.normalizeAssetDeckState === 'function') {
            try {
                return assetModule.normalizeAssetDeckState(rawAssetDeck);
            } catch (error) {
                console.warn('[ACE0 AssetDeck] normalize failed:', error);
            }
        }
        const source = rawAssetDeck && typeof rawAssetDeck === 'object' && !Array.isArray(rawAssetDeck) ? rawAssetDeck : {};
        return {
            ...createFallbackAssetDeckState(),
            ...deepCloneValue(source),
            asset_count: Math.max(0, Math.round(Number(source.asset_count ?? source.assetCount) || 0)),
            general_slots_unlocked: Math.max(4, Math.min(8, Math.round(Number(source.general_slots_unlocked ?? source.generalSlotsUnlocked) || 4))),
            void_slots_unlocked: Math.max(0, Math.min(2, Math.round(Number(source.void_slots_unlocked ?? source.voidSlotsUnlocked) || 2))),
            active_general_cards: Array.isArray(source.active_general_cards) ? deepCloneValue(source.active_general_cards) : [],
            active_void_cards: Array.isArray(source.active_void_cards) ? deepCloneValue(source.active_void_cards) : [],
            pending_offer: source.pending_offer && typeof source.pending_offer === 'object' ? deepCloneValue(source.pending_offer) : null,
            pending_offer_queue: Array.isArray(source.pending_offer_queue || source.pendingOfferQueue) ? deepCloneValue(source.pending_offer_queue || source.pendingOfferQueue) : [],
            pending_replace: source.pending_replace && typeof source.pending_replace === 'object' ? deepCloneValue(source.pending_replace) : null
        };
    }

    function getCurrentAssetDeckState() {
        const world = getCurrentWorldPayload();
        return normalizeAssetDeckForDashboard(world?.assetDeck);
    }

    function getAssetPendingOfferIdentity(assetDeckInput) {
        const normalized = normalizeAssetDeckForDashboard(assetDeckInput);
        const offer = normalized.pending_offer;
        if (!offer || typeof offer !== 'object') return '';
        const queueIdentity = Array.isArray(normalized.pending_offer_queue)
            ? normalized.pending_offer_queue.map((queued) => [
                queued?.id || '',
                queued?.pool || '',
                queued?.createdAt || ''
            ].join(':')).join(';')
            : '';
        return [
            offer.id || '',
            offer.pool || '',
            offer.createdAt || '',
            Array.isArray(offer.choices) ? offer.choices.map((card) => card?.cardId || '').join(',') : '',
            queueIdentity
        ].join('|');
    }

    function getDashboardAssetSummaryGameId() {
        return 'texas-holdem';
    }

    function buildFallbackAssetDeckSummary(assetDeck, gameId = getDashboardAssetSummaryGameId()) {
        const normalized = normalizeAssetDeckForDashboard(assetDeck);
        const generalCards = Array.isArray(normalized.active_general_cards) ? deepCloneValue(normalized.active_general_cards) : [];
        const voidCards = Array.isArray(normalized.active_void_cards) ? deepCloneValue(normalized.active_void_cards) : [];
        const allCards = [...generalCards, ...voidCards];
        return {
            version: 1,
            gameId,
            mode: isOverviewDebugMode() ? 'debug' : 'host',
            points: Math.max(0, Math.round(Number(normalized.asset_count) || 0)),
            slots: {
                generalUsed: generalCards.length,
                generalMax: Math.max(0, Math.round(Number(normalized.general_slots_unlocked) || 0)),
                voidUsed: voidCards.length,
                voidMax: Math.max(0, Math.round(Number(normalized.void_slots_unlocked) || 0))
            },
            activeCards: {
                general: generalCards,
                void: voidCards,
                all: allCards,
                effective: allCards,
                inactive: []
            },
            counts: {
                active: allCards.length,
                effective: allCards.length,
                inactive: 0
            },
            pending: {
                offer: normalized.pending_offer,
                offerQueue: Array.isArray(normalized.pending_offer_queue) ? deepCloneValue(normalized.pending_offer_queue) : [],
                replace: normalized.pending_replace
            },
            recentHistory: Array.isArray(normalized.history) ? normalized.history.slice(-5) : [],
            gameplay: {
                skillLevels: [],
                mana: [],
                cost: [],
                forcePower: [],
                passive: [],
                miniGame: {}
            },
            ...(isOverviewDebugMode() ? { debug: { fallback: true } } : {})
        };
    }

    function getCurrentAssetDeckSummary(gameId = getDashboardAssetSummaryGameId()) {
        const assetDeck = getCurrentAssetDeckState();
        const summaryModule = getAssetSummaryModuleApi();
        if (summaryModule && typeof summaryModule.buildAssetDeckSummary === 'function') {
            try {
                return summaryModule.buildAssetDeckSummary(assetDeck, {
                    gameId,
                    mode: isOverviewDebugMode() ? 'debug' : 'host'
                });
            } catch (error) {
                console.warn('[ACE0 AssetDeck] summary failed:', error);
            }
        }
        return buildFallbackAssetDeckSummary(assetDeck, gameId);
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
            pendingPreSignal: {},
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
                const settledWorld = settlePendingActAssetDeckCommandsForDashboardWorld(commitPayload?.world || {});
                const debugPayload = {
                    ...(adapterState.lastPayload || {}),
                    ...deepCloneValue(commitPayload),
                    world: settledWorld,
                    frontendSnapshot: createFrontendSnapshotForActState(settledWorld?.act || createDefaultActStateForDashboard())
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

    function normalizePendingAssetDeckCommandsForDashboard(actState) {
        const list = Array.isArray(actState?.pendingAssetDeckCommands) ? actState.pendingAssetDeckCommands : [];
        return list.filter((item) => item && typeof item === 'object' && !Array.isArray(item));
    }

    function settlePendingActAssetDeckCommandsForDashboardWorld(worldInput) {
        const world = worldInput && typeof worldInput === 'object' && !Array.isArray(worldInput)
            ? deepCloneValue(worldInput)
            : {};
        const actState = world.act && typeof world.act === 'object' && !Array.isArray(world.act)
            ? deepCloneValue(world.act)
            : null;
        const pendingCommands = normalizePendingAssetDeckCommandsForDashboard(actState);
        const commandsToApply = pendingCommands.filter((item) => {
            const status = typeof item.status === 'string' && item.status.trim() ? item.status.trim().toLowerCase() : 'pending';
            return status === 'pending' && item.command && typeof item.command === 'object' && !Array.isArray(item.command);
        });
        if (!actState || !commandsToApply.length) return world;

        const assetModule = getAssetDeckModuleApi();
        if (!assetModule || typeof assetModule.applyAssetDeckCommand !== 'function') return world;

        let assetDeck = normalizeAssetDeckForDashboard(world.assetDeck);
        const consumedIds = new Set();
        const resolutionHistory = Array.isArray(actState.resolutionHistory) ? deepCloneValue(actState.resolutionHistory) : [];

        commandsToApply.forEach((pending) => {
            const command = deepCloneValue(pending.command || {});
            const payload = command.payload && typeof command.payload === 'object' && !Array.isArray(command.payload)
                ? deepCloneValue(command.payload)
                : {};
            command.payload = {
                ...payload,
                requestId: typeof payload.requestId === 'string' && payload.requestId.trim() ? payload.requestId.trim() : pending.id
            };
            if (!command.payload.source && pending.nodeId) {
                command.payload.source = {
                    type: 'act_asset_token',
                    actId: actState.id || '',
                    nodeId: pending.nodeId,
                    nodeIndex: pending.nodeIndex,
                    phaseIndex: pending.phaseIndex,
                    level: pending.level,
                    sources: Array.isArray(pending.sources) ? deepCloneValue(pending.sources) : []
                };
            }

            let result;
            try {
                result = assetModule.applyAssetDeckCommand(assetDeck, command, {
                    seed: `debug-act:${pending.id || Date.now()}`
                });
            } catch (error) {
                result = { ok: false, code: 'asset_command_error', error: error?.message || String(error) };
            }

            if (result?.assetDeck) assetDeck = normalizeAssetDeckForDashboard(result.assetDeck);
            const status = result?.ok ? 'resolved' : 'failed';
            resolutionHistory.push({
                ...deepCloneValue(pending),
                type: 'asset',
                status,
                outcome: result?.code || (result?.ok ? 'asset_command_applied' : 'asset_command_failed'),
                summary: pending.summary || `ACT AssetDeck command ${status}`,
                payload: {
                    commandKind: command.kind || command.type || '',
                    commandPayload: deepCloneValue(command.payload),
                    resultCode: result?.code || '',
                    asset_count: Math.max(0, Math.round(Number(assetDeck.asset_count) || 0)),
                    error: result?.error || ''
                }
            });
            consumedIds.add(pending.id);
        });

        actState.pendingAssetDeckCommands = pendingCommands.filter((item) => !consumedIds.has(item.id));
        actState.resolutionHistory = resolutionHistory;
        world.act = actState;
        world.assetDeck = assetDeck;
        return world;
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
            funds: Math.max(0, Math.round(Number(source.funds ?? appState.resources.funds) || 0)),
            crisis: Math.max(0, Math.min(100, Math.round(Number(source.crisis ?? actState?.crisis) || 0)))
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
            crisis: Math.max(0, Math.min(100, Math.round(Number(currentActState.crisis) || 0))),
            crisisSignals: Array.isArray(currentActState.crisisSignals)
                ? deepCloneValue(currentActState.crisisSignals)
                : [],
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
            pendingFirstMeet: currentActState.pendingFirstMeet && typeof currentActState.pendingFirstMeet === 'object' && !Array.isArray(currentActState.pendingFirstMeet)
                ? deepCloneValue(currentActState.pendingFirstMeet)
                : {},
            pendingPreSignal: currentActState.pendingPreSignal && typeof currentActState.pendingPreSignal === 'object' && !Array.isArray(currentActState.pendingPreSignal)
                ? deepCloneValue(currentActState.pendingPreSignal)
                : {},
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
        if (!command || typeof command !== 'object') return false;
        if (isOverviewDebugMode()) {
            return applyAssetDeckCommandLocally(command);
        }

        const requestId = `asset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        const commandPayload = { requestId, command };
        const directBridge = resolveDirectAssetDeckCommandBridge();
        syncState.statusText = 'ASSET COMMAND';
        syncState.errorText = '';

        if (directBridge) {
            Promise.resolve()
                .then(() => directBridge(commandPayload))
                .then((result) => {
                    resolveAssetDeckCommandResult(result || {
                        ok: false,
                        requestId,
                        error: 'Direct AssetDeck bridge returned no result.'
                    });
                })
                .catch((error) => {
                    resolveAssetDeckCommandResult({
                        ok: false,
                        requestId,
                        error: error?.message || String(error)
                    });
                });
            refreshPlannerUI();
            return true;
        }

        if (assetCommandState.pendingTimer) {
            window.clearTimeout(assetCommandState.pendingTimer);
        }
        assetCommandState.pendingRequestId = requestId;
        assetCommandState.pendingTimer = window.setTimeout(() => {
            if (assetCommandState.pendingRequestId !== requestId) return;
            assetCommandState.pendingRequestId = '';
            assetCommandState.pendingTimer = null;
            assetCommandState.resolver = null;
            syncState.statusText = 'ASSET COMMAND FAILED';
            syncState.errorText = 'No ACK from host within 4s. Bridge path: ACT -> DASHBOARD -> HOST.';
            refreshPlannerUI();
        }, 4000);

        const didDispatch = postActMessageToHost({
            type: ACT_OUTBOUND_MESSAGE_TYPES.assetCommand,
            payload: commandPayload
        });
        if (!didDispatch) {
            if (assetCommandState.pendingTimer) {
                window.clearTimeout(assetCommandState.pendingTimer);
                assetCommandState.pendingTimer = null;
            }
            assetCommandState.pendingRequestId = '';
            syncState.statusText = 'ASSET COMMAND FAILED';
            syncState.errorText = 'No parent/top host window available for AssetDeck command.';
            refreshPlannerUI();
            return false;
        }
        refreshPlannerUI();
        return true;
    }

    function applyAssetDeckCommandLocally(command) {
        const assetModule = getAssetDeckModuleApi();
        if (!assetModule || typeof assetModule.applyAssetDeckCommand !== 'function') {
            syncState.statusText = 'ASSET RUNTIME MISSING';
            syncState.errorText = 'AssetDeck runtime is not loaded.';
            refreshPlannerUI();
            return false;
        }
        return updateWorldPayloadAndCommit((world) => {
            const currentAssetDeck = normalizeAssetDeckForDashboard(world.assetDeck);
            const result = assetModule.applyAssetDeckCommand(currentAssetDeck, command, {
                seed: `${appData.campaign.seed || 'ASSET'}:${Date.now()}`
            });
            if (!result?.assetDeck) {
                syncState.statusText = 'ASSET COMMAND FAILED';
                syncState.errorText = result?.code || 'Unknown AssetDeck command failure.';
                return world;
            }
            world.assetDeck = result.assetDeck;
            syncState.statusText = result.ok ? `ASSET: ${String(result.code || 'OK').toUpperCase()}` : 'ASSET COMMAND BLOCKED';
            syncState.errorText = result.ok ? '' : String(result.code || 'Command rejected.');
            return world;
        });
    }

    function handleAssetDeckAction(target) {
        if (!target) return false;
        if (target.disabled || target.getAttribute('aria-disabled') === 'true') return false;
        const action = target.dataset.assetAction;
        if (!action) return false;
        if (['open-offer', 'refresh-offer', 'choose-card', 'unlock-slot', 'replace-card', 'open-warehouse', 'close-warehouse'].includes(action)) {
            setPlannerPage('asset');
        }
        if (action === 'grant-asset') {
            return applyAssetDeckCommand({ kind: 'grant_asset', payload: { amount: 1 } });
        }
        if (action === 'unlock-slot') {
            appState.assetWarehouseOpen = true;
            return applyAssetDeckCommand({ kind: 'unlock_slot', payload: {} });
        }
        if (action === 'open-warehouse') {
            appState.assetWarehouseOpen = true;
            refreshPlannerUI();
            return true;
        }
        if (action === 'close-warehouse') {
            appState.assetWarehouseOpen = false;
            refreshPlannerUI();
            return true;
        }
        if (action === 'open-offer') {
            appState.assetWarehouseOpen = false;
            return applyAssetDeckCommand({ kind: 'open_offer', payload: { pool: target.dataset.pool || 'low' } });
        }
        if (action === 'refresh-offer') {
            return applyAssetDeckCommand({ kind: 'refresh_offer', payload: {} });
        }
        if (action === 'choose-card') {
            return applyAssetDeckCommand({
                kind: 'choose_card',
                payload: {
                    choiceIndex: Math.max(0, Math.round(Number(target.dataset.choiceIndex) || 0)),
                    slotType: target.dataset.slotType || 'general'
                }
            });
        }
        if (action === 'replace-card') {
            const pending = getCurrentAssetDeckState().pending_replace;
            return applyAssetDeckCommand({
                kind: 'replace_card',
                payload: {
                    slotType: target.dataset.slotType || 'general',
                    targetIndex: Math.max(0, Math.round(Number(target.dataset.slotIndex) || 0)),
                    confirmDestroy: target.dataset.confirmDestroy === 'true'
                        || !!(pending && pending.confirm_destroy === true)
                }
            });
        }
        if (action === 'debug-reset') {
            return applyAssetDeckCommand({ kind: 'debug_reset', payload: {} });
        }
        return false;
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
        const adapterRuntime = getOverviewDashboardAdapterApi();
        if (adapterRuntime && typeof adapterRuntime.postMessageToHost === 'function') {
            return adapterRuntime.postMessageToHost(message);
        }
        return false;
    }

    function resolveDirectActCommitBridge() {
        const adapterRuntime = getOverviewDashboardAdapterApi();
        return adapterRuntime && typeof adapterRuntime.resolveDirectBridge === 'function'
            ? adapterRuntime.resolveDirectBridge('ACE0DashboardCommitActState')
            : null;
    }

    function resolveDirectAssetDeckCommandBridge() {
        const adapterRuntime = getOverviewDashboardAdapterApi();
        return adapterRuntime && typeof adapterRuntime.resolveDirectBridge === 'function'
            ? adapterRuntime.resolveDirectBridge('ACE0DashboardApplyAssetDeckCommand')
            : null;
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
        const requestId = typeof resultPayload?.requestId === 'string' ? resultPayload.requestId : '';
        if (requestId && assetCommandState.pendingRequestId && requestId !== assetCommandState.pendingRequestId) return;
        if (assetCommandState.pendingTimer) {
            window.clearTimeout(assetCommandState.pendingTimer);
            assetCommandState.pendingTimer = null;
        }

        assetCommandState.pendingRequestId = '';
        const resolver = assetCommandState.resolver;
        assetCommandState.resolver = null;

        if (resultPayload?.ok) {
            if (resultPayload.assetDeck && typeof resultPayload.assetDeck === 'object') {
                const currentPayload = adapterState.lastPayload || buildInitialDebugPayload();
                const currentWorld = extractWorldPayload(currentPayload) || {};
                const nextPayload = buildNormalizedDashboardPayload({
                    ...(currentPayload || {}),
                    world: {
                        ...deepCloneValue(currentWorld),
                        assetDeck: deepCloneValue(resultPayload.assetDeck)
                    }
                });
                if (nextPayload) {
                    applyActStateFromPayload(nextPayload);
                }
            }
            syncState.dirty = false;
            syncState.statusText = resultPayload.code ? `ASSET: ${String(resultPayload.code).toUpperCase()}` : getCommitIdleStatusText();
            syncState.errorText = '';
        } else {
            syncState.statusText = 'ASSET COMMAND BLOCKED';
            syncState.errorText = typeof resultPayload?.error === 'string' && resultPayload.error.trim()
                ? resultPayload.error.trim()
                : String(resultPayload?.code || 'AssetDeck command failed.');
        }

        refreshPlannerUI();
        if (typeof resolver === 'function') resolver(resultPayload);
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
        const assetSummary = getCurrentAssetDeckSummary();
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
                            ? formatCompactResourceValue(assetSummary.points)
                        : resource.className === 'res-mana'
                            ? `${appState.resources.mana}/100`
                            : resource.className === 'res-danger'
                                ? formatCompactResourceValue(appState.resources.majorDebt)
                            : formatCompactResourceValue(appState.resources.debt)
                }</span>
            </div>
        `).join('');
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
            <div class="bar-group topbar-right">${resourcesMarkup}</div>
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
            <div class="grid-base-line ${getCurrentColumnLineClass(column)}${isColumnVisibleInMapFog(column) ? '' : ' grid-line-fog-hidden'}" id="${column.lineId}"></div>
        `).join('');
        const nodeMarkup = getMapNodes().map((node) => `
            <div class="${getMapClassNameForNode(node)}" id="${node.id}">
                <div class="node-label">${escapePartyHtml(node.label)}</div>
                <div class="node-sublabel">${escapePartyHtml(isNodeDetailVisible(node.id) ? node.sublabel : 'UNKNOWN')}</div>
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

    function getAssetCardDisplayName(card) {
        if (card?.name) return card.name;
        const assetModule = getAssetDeckModuleApi();
        const catalog = assetModule && typeof assetModule.getCatalog === 'function' ? assetModule.getCatalog() : [];
        const catalogCard = Array.isArray(catalog)
            ? catalog.find((item) => item?.id === card?.cardId)
            : null;
        return catalogCard?.name || card?.name || card?.cardId || 'EMPTY';
    }

    function getAssetCardLevelLabel(card) {
        const level = Math.max(0, Math.round(Number(card?.level) || 0));
        return level > 0 ? `LV ${level}` : String(card?.kind || 'CARD').toUpperCase();
    }

    function buildAssetCardTagsMarkup(card) {
        const tags = [
            card?.rarity,
            card?.system,
            ...(Array.isArray(card?.gameTags) ? card.gameTags : []),
            ...(Array.isArray(card?.slotTags) ? card.slotTags : [])
        ].map((tag) => typeof tag === 'string' ? tag.trim() : '').filter(Boolean).slice(0, 4);
        return tags.map((tag) => `<span>${escapePartyHtml(tag.toUpperCase())}</span>`).join('');
    }

    function normalizeAssetPendingReplaceForMarkup(pendingReplace) {
        if (!pendingReplace || typeof pendingReplace !== 'object') return null;
        return {
            card: pendingReplace.card || pendingReplace.candidate || null,
            allowedSlots: Array.isArray(pendingReplace.allowedSlots) ? pendingReplace.allowedSlots : [],
            reason: pendingReplace.reason || 'slot_full',
            confirm_destroy: pendingReplace.confirm_destroy === true || pendingReplace.confirmDestroy === true
        };
    }

    function normalizePlannerPage(value) {
        const page = typeof value === 'string' ? value.trim().toLowerCase() : '';
        if (page === 'deck' || page === 'extract') return 'asset';
        return PLANNER_PAGE_KEYS.includes(page) ? page : 'planner';
    }

    function getActivePlannerPage() {
        const activePage = normalizePlannerPage(appState.plannerPage || appState.assetDrawerTab);
        appState.plannerPage = activePage;
        appState.assetDrawerTab = activePage === 'asset' ? 'deck' : activePage;
        return activePage;
    }

    function setPlannerPage(page) {
        appState.plannerPage = normalizePlannerPage(page);
        appState.assetDrawerTab = appState.plannerPage === 'asset' ? 'deck' : appState.plannerPage;
        if (appState.plannerPage !== 'asset') appState.assetWarehouseOpen = false;
        return appState.plannerPage;
    }

    function normalizePlannerEditMode(mode) {
        return mode === 'remove' ? 'remove' : 'add';
    }

    function setPlannerEditMode(mode) {
        appState.plannerEditMode = normalizePlannerEditMode(mode);
        if (appState.plannerEditMode === 'add') {
            const key = normalizeResourceKey(appState.plannerAddType || selectionState.type, '');
            if (key && getTotalInventoryCount(key) > 0) {
                selectInventoryToken(key);
            }
        }
        return appState.plannerEditMode;
    }

    function buildPlannerResourceNavMarkup(activePage) {
        return PLANNER_PAGE_KEYS.map((page) => {
            const meta = PLANNER_PAGE_META[page] || PLANNER_PAGE_META.planner;
            return `
                <button class="${activePage === page ? 'is-active' : ''} page-${page}" type="button" data-planner-tab="${page}">
                    <span>${escapePartyHtml(meta.title)}</span>
                    <em>${escapePartyHtml(meta.label)}</em>
                </button>
            `;
        }).join('');
    }

    function buildResourceMeterMarkup(key) {
        const resourceKey = normalizeResourceKey(key, 'vision');
        const total = getTotalInventoryCount(resourceKey);
        return `
            <div class="meter type-${resourceKey}">
                <span>AVAILABLE</span>
                <strong>${Math.max(0, total)} / ${Math.max(0, total)}</strong>
            </div>
        `;
    }

    function getPlannedResourceState(key) {
        const resourceKey = normalizeResourceKey(key, '');
        const state = { amount: 0, maxAmount: 0, slots: 0 };
        if (!resourceKey) return state;
        Object.values(appState.phaseSlots).forEach((slot) => {
            if (!slot || normalizeResourceKey(slot.key, '') !== resourceKey) return;
            const amount = Math.max(1, Math.min(3, Math.round(Number(slot.amount) || 1)));
            state.amount += amount;
            state.maxAmount = Math.max(state.maxAmount, amount);
            state.slots += 1;
        });
        return state;
    }

    function getPlannedModuleClass(key) {
        const planned = getPlannedResourceState(key);
        return planned.amount > 0 ? ` is-planned planned-level-${planned.maxAmount}` : '';
    }

    function buildRuleCardMarkup(key, level, title, note) {
        const planned = getPlannedResourceState(key);
        const isLit = planned.maxAmount >= level;
        return `<div class="rule-card${isLit ? ' is-lit' : ''}" data-rule-level="${level}"><span>${level === 1 ? 'I' : level === 2 ? 'II' : 'III'}</span><strong>${escapePartyHtml(title)}</strong><em>${escapePartyHtml(note)}</em></div>`;
    }

    const ASSET_POOL_META = Object.freeze([
        { pool: 'low', level: 1, code: 'I', title: '一级卡池', label: 'LOW EXTRACT', cost: 1, note: '基础契令，偏向铜 / 银。' },
        { pool: 'mid', level: 2, code: 'II', title: '二级卡池', label: 'MID EXTRACT', cost: 2, note: '进阶契令，提升金卡概率。' },
        { pool: 'high', level: 3, code: 'III', title: '三级卡池', label: 'HIGH EXTRACT', cost: 3, note: '高阶契令，开放虹卡权重。' }
    ]);

    function buildAssetPoolCardMarkup(meta, assetSummary, plannedAsset) {
        const points = Math.max(0, Math.round(Number(assetSummary?.points) || 0));
        const isActive = plannedAsset.maxAmount >= meta.level;
        const canOpen = isActive && points >= meta.cost && !assetSummary?.pending?.offer;
        const stateText = !isActive ? 'LOCKED' : (points >= meta.cost ? 'READY' : `NEED ${meta.cost}`);
        return `
            <button class="asset-pool-card pool-${meta.pool}${isActive ? ' is-lit' : ''}${canOpen ? ' is-ready' : ''}" type="button" data-asset-action="open-offer" data-pool="${meta.pool}"${canOpen ? '' : ' disabled'}>
                <span>${escapePartyHtml(meta.code)}</span>
                <strong>${escapePartyHtml(meta.title)}</strong>
                <em>${escapePartyHtml(meta.note)}</em>
                <b>${escapePartyHtml(meta.label)} · ${escapePartyHtml(stateText)}</b>
            </button>
        `;
    }

    function buildAssetPoolPanelMarkup(assetSummary) {
        const plannedAsset = getPlannedResourceState('asset');
        return `
            <div class="asset-pool-grid">
                ${ASSET_POOL_META.map((meta) => buildAssetPoolCardMarkup(meta, assetSummary, plannedAsset)).join('')}
            </div>
        `;
    }

    function buildScheduledResourceSlotsMarkup(resourceKey) {
        const normalizedKey = normalizeResourceKey(resourceKey, 'vision');
        const rows = appData.planner.phases.map((phase, index) => {
            const slot = appState.phaseSlots[phase.slotId];
            if (!slot || normalizeResourceKey(slot.key, '') !== normalizedKey) return '';
            const amount = Math.max(1, Math.min(3, Math.round(Number(slot.amount) || 1)));
            const tint = normalizedKey === 'rest'
                ? normalizeRestTintKey(slot.tint || slot.controlType || slot.targetKey, 'neutral')
                : '';
            const tintLabel = normalizedKey === 'rest' && tint !== 'neutral'
                ? ` · ${RESOURCE_LABEL_MAP[tint] || RESOURCE_TYPE_MAP[tint] || tint}`
                : '';
            const state = index < appState.currentPhaseIndex ? 'DONE' : (index === appState.currentPhaseIndex ? 'NOW' : 'WAIT');
            return `
                <div class="row type-${normalizedKey}${index === appState.currentPhaseIndex ? ' is-current' : ''}">
                    <strong>${escapePartyHtml(phase.title || String(index + 1))}</strong>
                    <span>${RESOURCE_TYPE_MAP[normalizedKey]} x${amount}${escapePartyHtml(tintLabel)}</span>
                    <em>${state}</em>
                </div>
            `;
        }).filter(Boolean).join('');
        return rows || `<div class="row is-empty"><strong>-</strong><span>没有更多${escapePartyHtml(RESOURCE_LABEL_MAP[normalizedKey] || '')}点</span><em>EMPTY</em></div>`;
    }

    function buildControlledNodeSummaryMarkup() {
        const actState = buildCurrentActStateSnapshot();
        const controlled = actState.controlledNodes && typeof actState.controlledNodes === 'object'
            ? Object.entries(actState.controlledNodes)
            : [];
        const rows = controlled.slice(-4).reverse().map(([nodeId, entry]) => {
            const type = normalizeRestTintKey(entry?.type || entry?.tint || entry?.key, 'neutral');
            const label = type === 'neutral' ? 'NEUTRAL' : (RESOURCE_TYPE_MAP[type] || type.toUpperCase());
            return `
                <div class="row type-${type}">
                    <strong>${escapePartyHtml(label.slice(0, 1))}</strong>
                    <span>${escapePartyHtml(getRouteOptionLabel(nodeId) || nodeId)} · ${escapePartyHtml(label)} tint</span>
                    <em>+0.25</em>
                </div>
            `;
        }).join('');
        return rows || '<div class="row is-empty"><strong>-</strong><span>没有更多控制节点</span><em>EMPTY</em></div>';
    }

    function getRestTintActionMeta(tintKey, token = getSelectedRestSlotToken()) {
        const normalized = normalizeRestTintKey(tintKey, 'neutral');
        const currentTint = token ? normalizeRestTintKey(token.tint || token.controlType || token.targetKey, 'neutral') : 'neutral';
        const labelMap = {
            neutral: { title: '默认休整', note: '只结算回复，不追加节点染色。' },
            rest: { title: '休整染色', note: '稳定节奏，强化后续回复窗口。' },
            asset: { title: '契点染色', note: '倾向后续契约池与技能槽操作。' },
            vision: { title: '情报染色', note: '倾向视野、路径与固定相位信息。' },
            combat: { title: '交锋接口', note: '先保留接口，等待战斗 adapter 接入。' }
        };
        if (normalized === 'neutral') {
            return {
                disabled: !token,
                active: currentTint === 'neutral',
                ...(labelMap.neutral),
                note: token ? labelMap.neutral.note : '先选择一个未来 Rest 相位。'
            };
        }
        const source = getPreferredSourceForKey(normalized);
        const disabled = !token || (!source && currentTint !== normalized);
        return {
            disabled,
            active: currentTint === normalized,
            ...(labelMap[normalized] || { title: getRestTintLabel(normalized), note: '' }),
            note: !token
                ? '先选择一个未来 Rest 相位。'
                : (disabled ? `${RESOURCE_LABEL_MAP[normalized] || normalized} 点不足。` : (labelMap[normalized]?.note || ''))
        };
    }

    function buildRestTintActionsMarkup() {
        const token = getSelectedRestSlotToken();
        return REST_CONTROL_TINT_KEYS.map((key) => {
            const meta = getRestTintActionMeta(key, token);
            const tint = key === 'combat' ? 'combat' : key === 'asset' ? 'asset' : key === 'vision' ? 'vision' : 'rest';
            const label = key === 'vision' ? 'intel' : key;
            return `
                <button class="tint-choice${meta.active ? ' is-active' : ''}${meta.disabled ? ' is-disabled' : ''}" style="--tint: var(--${tint});" type="button" data-rest-tint="${key}" data-tint-type="${key}"${meta.disabled ? ' disabled' : ''}>
                    <span>${escapePartyHtml(label)}</span>
                    <strong>${escapePartyHtml(meta.title)}</strong>
                    <em>${escapePartyHtml(meta.note)}</em>
                </button>
            `;
        }).join('');
    }

    function buildVisionNextStepMarkup(vision, sight) {
        const pending = vision.pendingReplace;
        const routeMode = appData.runtime.frontendSnapshot?.routeMode || '';
        let label = '探路';
        let value = `可见到 NODE ${String(Math.min(getCampaignTotalNodes(), appState.currentNodeIndex + sight)).padStart(2, '0')}`;
        let note = 'Vision 1 会扩大未来节点可见范围。';
        if (pending && pending.status === 'ready') {
            label = '固定相位替换';
            value = 'READY';
            note = '抵达目标相位时，底部 phase bar 会要求 KEEP 或替换。';
        } else if (pending && ['charged', 'choosing'].includes(pending.status)) {
            label = '固定相位替换';
            value = `CHARGED x${Math.max(1, Math.round(Number(pending.charges) || 1))}`;
            note = '等待下一个可替换 fixed phase。';
        } else if (vision.jumpReady || routeMode === 'jump') {
            label = '跃迁';
            value = isRouteSelectionActive() ? 'CHOOSE ROUTE' : 'READY';
            note = isRouteSelectionActive() ? '可在下方候选中选择跃迁目标。' : '抵达 route 阶段后可跨线选择。';
        }
        return `
            <div class="resource-next-step">
                <span>${escapePartyHtml(label)}</span>
                <strong>${escapePartyHtml(value)}</strong>
                <em>${escapePartyHtml(note)}</em>
            </div>
        `;
    }

    function buildCombatResourcePageMarkup() {
        const actState = buildCurrentActStateSnapshot();
        return `
            <div class="resource-shell${getPlannedModuleClass('combat')}" data-planned-resource="combat">
                <aside class="side-panel">
                    <div class="eyebrow">COMBAT POINT</div>
                    <div class="big-title">交锋点</div>
                    ${buildResourceMeterMarkup('combat')}
                    <div class="note">只生成外部结算请求，不伪造收益。</div>
                    <button class="action-btn" type="button">REQUEST QUEUE</button>
                </aside>
                <main class="main-panel">
                    <div class="section-head"><span>COMBAT RULES</span><strong>外部结算</strong></div>
                    <div class="rule-grid">
                        ${buildRuleCardMarkup('combat', 1, '小游戏', '低风险外部请求。')}
                        ${buildRuleCardMarkup('combat', 2, '精英德州', '生成精英对局请求。')}
                        ${buildRuleCardMarkup('combat', 3, 'Boss 德州', '等待 adapter 回写。')}
                    </div>
                    <div class="queue-grid">
                        <div class="queue-card"><span>COMBAT PHASES</span>
                            ${buildScheduledResourceSlotsMarkup('combat')}
                        </div>
                        <div class="queue-card"><span>EXTERNAL REQUESTS</span>
                            ${buildCombatSettlementRowsMarkup(actState)}
                        </div>
                    </div>
                </main>
                <aside class="detail-panel">
                    <div class="detail-icon">C</div>
                    <div class="detail-title">请求详情</div>
                    <div class="detail-text">最终由德州或小游戏 adapter 决定收益、损失与状态回写。</div>
                    <div class="detail-box"><span>ADAPTER</span><strong>PENDING</strong></div>
                </aside>
            </div>
        `;
    }

    function buildRestResourcePageMarkup() {
        const selectedRest = getSelectedRestSlotToken();
        const selectedTint = selectedRest
            ? normalizeRestTintKey(selectedRest.tint || selectedRest.controlType || selectedRest.targetKey, 'neutral')
            : 'neutral';
        const showTintOverlay = Boolean(selectedRest && appState.restTintPopupSlotId);
        return `
            <div class="resource-shell${getPlannedModuleClass('rest')}" data-planned-resource="rest">
                <aside class="side-panel">
                    <div class="eyebrow">REST POINT</div>
                    <div class="big-title">休整点</div>
                    ${buildResourceMeterMarkup('rest')}
                    <div class="note">回复 Mana、染色节点、稳定节奏。</div>
                    <button class="action-btn" type="button" data-open-rest-tint>SET TINT</button>
                </aside>
                <main class="main-panel">
                    <div class="section-head"><span>REST RULES</span><strong>回复 · 染色 · 营收</strong></div>
                    <div class="rule-grid">
                        ${buildRuleCardMarkup('rest', 1, '回复 25%', '可追加节点染色。')}
                        ${buildRuleCardMarkup('rest', 2, '回复 66%', '固定营收 +0.25。')}
                        ${buildRuleCardMarkup('rest', 3, '回复 100%', '完整重整。')}
                    </div>
                    <div class="queue-grid">
                        <div class="queue-card"><span>REST PHASES</span>
                            ${buildScheduledResourceSlotsMarkup('rest')}
                        </div>
                        <div class="queue-card"><span>CONTROLLED NODES</span>
                            ${buildControlledNodeSummaryMarkup()}
                        </div>
                    </div>
                </main>
                <aside class="detail-panel">
                    <div class="detail-icon">R</div>
                    <div class="detail-title">染色状态</div>
                    <div class="detail-text">当前选择 ${escapePartyHtml(selectedTint.toUpperCase())}，不额外消耗其他点数。</div>
                    <div class="detail-box"><span>CURRENT</span><strong>${escapePartyHtml(selectedTint.toUpperCase())}</strong></div>
                </aside>
                ${showTintOverlay ? `<div class="tint-overlay" id="restTintOverlay" role="dialog" aria-label="Rest Tint">
                    <section class="tint-panel">
                        <div class="tint-head"><span>REST RESOLUTION</span><strong>SELECT TINT</strong></div>
                        <div class="tint-grid">${buildRestTintActionsMarkup()}</div>
                        <div class="tint-foot"><span>DEFAULT POPUP · ON RESOLVE</span><button class="action-btn" type="button" data-close-rest-tint>SKIP</button></div>
                    </section>
                </div>` : ''}
            </div>
        `;
    }

    function buildVisionResourcePageMarkup() {
        const vision = getVisionStateForDashboard();
        const sight = Math.max(0, Math.round(Number(vision.baseSight) || 0)) + Math.max(0, Math.round(Number(vision.bonusSight) || 0));
        const replaceStatus = vision.pendingReplace?.status || 'none';
        return `
            <div class="resource-shell${getPlannedModuleClass('vision')}" data-planned-resource="vision">
                <aside class="side-panel">
                    <div class="eyebrow">VISION POINT</div>
                    <div class="big-title">情报点</div>
                    <div class="meter type-vision"><span>SIGHT</span><strong>${sight}</strong></div>
                    <div class="note">有限视野、固定相位替换、跃迁路径。</div>
                    <button class="action-btn" type="button">SCAN ROUTE</button>
                </aside>
                <main class="main-panel">
                    <div class="section-head"><span>VISION RULES</span><strong>视野 · 替换 · 跃迁</strong></div>
                    <div class="rule-grid">
                        ${buildRuleCardMarkup('vision', 1, '探路', '当前视野 +2。')}
                        ${buildRuleCardMarkup('vision', 2, '替换相位', '可替换固定事件。')}
                        ${buildRuleCardMarkup('vision', 3, '跃迁', '显示连续路径线。')}
                    </div>
                    <div class="queue-grid">
                        <div class="queue-card"><span>VISION PHASES</span>
                            ${buildScheduledResourceSlotsMarkup('vision')}
                        </div>
                        <div class="queue-card"><span>VISION STATE</span>
                            ${buildVisionPanelMarkup()}
                        </div>
                    </div>
                </main>
                <aside class="detail-panel">
                    <div class="detail-icon">V</div>
                    <div class="detail-title">跃迁就绪</div>
                    <div class="detail-text">抵达 route 阶段后可以跨线选择。</div>
                    <div class="detail-box"><span>NEXT STEP</span><strong>${vision.jumpReady ? 'READY' : escapePartyHtml(String(replaceStatus).toUpperCase())}</strong></div>
                </aside>
            </div>
        `;
    }

    function buildAssetCardMarkup(card, options = {}) {
        const { compact = false, action = '', choiceIndex = null, slotType = '', slotIndex = null, confirmDestroy = false } = options;
        if (!card) {
            return `<div class="mini-slot empty"><span class="type">EMPTY</span><div class="name-row"><span class="name">未装配指令</span></div></div>`;
        }
        const attrs = [
            action ? `data-asset-action="${escapePartyHtml(action)}"` : '',
            choiceIndex != null ? `data-choice-index="${choiceIndex}"` : '',
            slotType ? `data-slot-type="${escapePartyHtml(slotType)}"` : '',
            slotIndex != null ? `data-slot-index="${slotIndex}"` : '',
            confirmDestroy ? 'data-confirm-destroy="true"' : ''
        ].filter(Boolean).join(' ');
        const accent = String(card.system || card.kind || '').toLowerCase().includes('void') ? 'var(--void)' : 'var(--asset)';
        const glyph = String(card.system || card.kind || 'A').slice(0, 1).toUpperCase();
        return `
            <button class="cmd-card rarity-${escapePartyHtml(String(card.rarity || 'bronze').toLowerCase())}${compact ? ' is-compact' : ''}" style="--card-accent:${accent};" type="button" ${attrs}>
                <div class="cmd-card-accent-line"></div>
                <div class="bg-svg">${escapePartyHtml(glyph)}</div>
                <span class="cmd-type">${escapePartyHtml(String(card.rarity || 'bronze').toUpperCase())} · ${escapePartyHtml(String(card.kind || 'card').toUpperCase())}</span>
                <div class="cmd-name-row">
                    <span class="cmd-name">${escapePartyHtml(getAssetCardDisplayName(card))}</span>
                    <span class="cmd-level">${escapePartyHtml(getAssetCardLevelLabel(card))}</span>
                </div>
                <div class="cmd-desc">${escapePartyHtml(String(card.skillKey || '').replace(/_/g, ' ') || String(card.kind || 'ACTIVE CARD'))}</div>
            </button>
        `;
    }

    function buildAssetSlotMarkup(card, slotType, index, unlocked = true, pendingReplaceInput = null) {
        if (!unlocked) {
            return `<div class="mini-slot locked"><span class="type">LOCKED</span><div class="name-row"><span class="name">硬件锁止</span></div></div>`;
        }
        const pending = normalizeAssetPendingReplaceForMarkup(pendingReplaceInput);
        const canReplace = pending && Array.isArray(pending.allowedSlots) && pending.allowedSlots.includes(slotType) && card;
        const confirmDestroy = !!(canReplace && pending.confirm_destroy === true);
        if (!card) {
            const voidCopy = slotType === 'void';
            return `<div class="mini-slot empty"><span class="type">${voidCopy ? 'EMPTY VOID' : 'EMPTY'}</span><div class="name-row"><span class="name">${voidCopy ? '未装配零号参数' : '未装配指令'}</span></div></div>`;
        }
        const accent = String(card.system || card.kind || '').toLowerCase().includes('void') || slotType === 'void' ? 'var(--void)' : 'var(--asset)';
        return `
            <div class="mini-slot filled${canReplace ? ' is-replaceable' : ''}" style="--c:${accent};" data-asset-action="${canReplace ? 'replace-card' : ''}" data-slot-type="${escapePartyHtml(slotType)}" data-slot-index="${index}"${confirmDestroy ? ' data-confirm-destroy="true"' : ''}>
                <span class="type">${escapePartyHtml(String(card.kind || card.system || 'ASSET').toUpperCase())}</span>
                <div class="name-row"><span class="name">${escapePartyHtml(getAssetCardDisplayName(card))}</span><span class="lvl">${escapePartyHtml(getAssetCardLevelLabel(card))}</span></div>
            </div>
        `;
    }

    function buildAssetOfferChoiceMarkup(card, index) {
        const slotTags = Array.isArray(card?.slotTags) ? card.slotTags : [];
        const canUseVoid = slotTags.includes('void');
        return `
            <div class="choice">
                ${buildAssetCardMarkup(card, { compact: true })}
                <div class="choice-actions">
                    <button type="button" data-asset-action="choose-card" data-choice-index="${index}" data-slot-type="general">GENERAL</button>
                    ${canUseVoid ? `<button type="button" data-asset-action="choose-card" data-choice-index="${index}" data-slot-type="void">VOID</button>` : ''}
                </div>
            </div>
        `;
    }

    function buildAssetOfferOverlayMarkup(assetSummary) {
        const pendingOffer = assetSummary.pending?.offer;
        const queuedOffers = Array.isArray(assetSummary.pending?.offerQueue) ? assetSummary.pending.offerQueue : [];
        const queueText = queuedOffers.length ? ` · QUEUE ${queuedOffers.length}` : '';
        const offerMarkup = pendingOffer?.choices?.length
            ? pendingOffer.choices.map((card, index) => buildAssetOfferChoiceMarkup(card, index)).join('')
            : '';
        if (!offerMarkup) return '';
        return `
            <div class="offer-overlay pool-${escapePartyHtml(String(pendingOffer?.pool || 'low').toLowerCase())}" role="dialog" aria-label="Contract Extract">
                <section class="offer-panel draw-panel">
                    <div class="offer-head"><span>CONTRACT EXTRACT${escapePartyHtml(queueText)}</span><strong>${escapePartyHtml(String(pendingOffer?.pool || 'POOL').toUpperCase())}</strong></div>
                    <div class="offer-grid">${offerMarkup}</div>
                    <div class="offer-foot">
                        <span>DECK POINTS · ${assetSummary.points}</span>
                        <button class="action-btn" type="button" data-asset-action="refresh-offer">REROLL POOL</button>
                    </div>
                </section>
            </div>
        `;
    }

    function buildAssetWarehouseOverlayMarkup(assetSummary) {
        const generalCards = Array.isArray(assetSummary.activeCards?.general) ? assetSummary.activeCards.general : [];
        const voidCards = Array.isArray(assetSummary.activeCards?.void) ? assetSummary.activeCards.void : [];
        const slots = assetSummary.slots || {};
        const pendingReplace = normalizeAssetPendingReplaceForMarkup(assetSummary.pending?.replace);
        const generalSlots = Array.from({ length: 8 }, (_, index) => buildAssetSlotMarkup(generalCards[index], 'general', index, index < slots.generalMax, pendingReplace)).join('');
        const voidSlots = Array.from({ length: 2 }, (_, index) => buildAssetSlotMarkup(voidCards[index], 'void', index, index < slots.voidMax, pendingReplace)).join('');
        const focusedCard = pendingReplace?.card || generalCards.find(Boolean) || voidCards.find(Boolean);
        const replaceMarkup = pendingReplace?.card
            ? `<div class="asset-replace-callout">
                    <span>${pendingReplace.confirm_destroy ? 'CONFIRM DESTROY' : 'PENDING REPLACE'}</span>
                    <strong>${escapePartyHtml(getAssetCardDisplayName(pendingReplace.card))}</strong>
                    <em>${pendingReplace.confirm_destroy ? 'Protected Rainbow/God card selected. Click the highlighted slot again to destroy it.' : 'Choose a highlighted occupied slot. Old card will be destroyed.'}</em>
                </div>`
            : '';
        const focusedType = focusedCard
            ? `${String(focusedCard.system || focusedCard.kind || 'asset').toUpperCase()} / ${String(focusedCard.rarity || 'bronze').toUpperCase()}`
            : '';
        const focusedName = focusedCard ? getAssetCardDisplayName(focusedCard) : '';
        const focusedLevel = focusedCard ? getAssetCardLevelLabel(focusedCard) : '';
        const focusedDesc = focusedCard
            ? `${String(focusedCard.kind || 'card').toUpperCase()}${focusedCard.skillKey ? ` · ${String(focusedCard.skillKey).toUpperCase()}` : ''}`
            : '';
        if (!appState.assetWarehouseOpen && !pendingReplace?.card) return '';
        return `
            <div class="warehouse-overlay" role="dialog" aria-label="Contract Warehouse">
                <section class="warehouse-panel asset-layout">
                    <aside class="detect-panel">
                        <span class="detect-label">CONTRACT WAREHOUSE</span>
                        <span class="detect-target">${slots.generalUsed}<span> / ${slots.generalMax}</span></span>
                        <span class="detect-label">VOID ISOLATION · ${slots.voidUsed}/${slots.voidMax}</span>
                        <span class="detect-label">ASSET POINTS · ${assetSummary.points}</span>
                        <div class="astrolabe-ring"><div class="magic-core"></div></div>
                        <button class="action-btn" type="button" data-asset-action="unlock-slot">EXPAND (1 ASSET)</button>
                        <button class="action-btn ghost" type="button" data-asset-action="close-warehouse">CLOSE</button>
                    </aside>
                    <main class="deck-scroll-area">
                        ${replaceMarkup}
                        <div class="deck-grid-vertical">${generalSlots}</div>
                        <div class="void-section-vertical">${voidSlots}</div>
                    </main>
                    <aside class="details-panel${focusedCard ? '' : ' is-idle'}" style="--dp-color: var(--asset);">
                        ${focusedCard ? `
                            <div class="dp-bg-svg">${escapePartyHtml(String(focusedCard.system || focusedCard.kind || 'A').slice(0, 1).toUpperCase())}</div>
                            <div class="dp-type">${escapePartyHtml(focusedType)}</div>
                            <div class="dp-name-row">
                                <div class="dp-name">${escapePartyHtml(focusedName)}</div>
                                <div class="dp-lvl">${escapePartyHtml(focusedLevel)}</div>
                            </div>
                            <div class="dp-divider"></div>
                            <div class="dp-desc">${escapePartyHtml(focusedDesc)}</div>
                            <div class="dp-action-area">
                                <div class="dp-note">[ STATUS: ACTIVE ]</div>
                                <button class="btn-unequip" type="button" disabled>REPLACE & DESTROY OLD CARD</button>
                            </div>
                        ` : ''}
                    </aside>
                </section>
            </div>
        `;
    }

    function buildAssetWarehouseRowsMarkup(assetSummary) {
        const slots = assetSummary.slots || {};
        const queue = Array.isArray(assetSummary.pending?.offerQueue) ? assetSummary.pending.offerQueue : [];
        return `
            <div class="row type-asset"><strong>G</strong><span>GENERAL · ${slots.generalUsed || 0}/${slots.generalMax || 0}</span><em>SLOTS</em></div>
            <div class="row type-asset"><strong>V</strong><span>VOID · ${slots.voidUsed || 0}/${slots.voidMax || 0}</span><em>ISO</em></div>
            <div class="row type-asset${queue.length ? '' : ' is-empty'}"><strong>Q</strong><span>抽卡队列 · ${queue.length}</span><em>QUEUE</em></div>
        `;
    }

    function buildAssetResourcePageMarkup() {
        const assetSummary = getCurrentAssetDeckSummary();
        const pendingOffer = assetSummary.pending?.offer;
        const offerOverlayMarkup = buildAssetOfferOverlayMarkup(assetSummary);
        const warehouseOverlayMarkup = buildAssetWarehouseOverlayMarkup(assetSummary);
        return `
            <div class="resource-shell${getPlannedModuleClass('asset')}" data-planned-resource="asset">
                <aside class="side-panel">
                    <div class="eyebrow">ASSET POINT</div>
                    <div class="big-title">契点</div>
                    <div class="meter type-asset"><span>DECK POINTS</span><strong>${Math.max(0, Math.round(Number(assetSummary.points) || 0))}</strong></div>
                    <div class="note">投入契点激活一级 / 二级 / 三级卡池，满足条件后进入抽卡页面。</div>
                    <button class="action-btn" type="button" data-asset-action="open-warehouse">WAREHOUSE</button>
                </aside>
                <main class="main-panel">
                    <div class="section-head"><span>ASSET RULES</span><strong>卡池 · 抽取 · 仓库</strong></div>
                    ${buildAssetPoolPanelMarkup(assetSummary)}
                    <div class="queue-grid">
                        <div class="queue-card"><span>ASSET PHASES</span>
                            ${buildScheduledResourceSlotsMarkup('asset')}
                        </div>
                        <div class="queue-card"><span>WAREHOUSE STATE</span>
                            ${buildAssetWarehouseRowsMarkup(assetSummary)}
                        </div>
                    </div>
                </main>
                <aside class="detail-panel">
                    <div class="detail-icon">A</div>
                    <div class="detail-title">契约卡池</div>
                    <div class="detail-text">${pendingOffer ? '当前已有抽卡页面等待选择。' : '激活卡池并消耗 Deck Points 后，会弹出抽卡页面。'}</div>
                    <div class="detail-box"><span>NEXT STEP</span><strong>${pendingOffer ? 'CHOOSE CARD' : 'OPEN POOL'}</strong></div>
                    <button class="action-btn" type="button" data-asset-action="open-warehouse">OPEN WAREHOUSE</button>
                </aside>
                ${warehouseOverlayMarkup}
                ${offerOverlayMarkup}
            </div>
        `;
    }

    function renderPlannerDrawer() {
        const plannerDrawerMount = document.getElementById('plannerDrawerMount');
        if (!plannerDrawerMount) return;
        const readonlyClass = canUseInteractivePlannerControls() ? '' : ' is-host-readonly';
        const inventoryMarkup = appData.planner.inventory.map((item) => {
            const planned = getPlannedResourceState(item.key);
            return `
                <div class="token-dispenser type-${item.key}${planned.amount > 0 ? ' is-planned' : ''}" id="inv_${item.key}" data-planner-tab="${item.key}" data-tab="${item.key}" data-type="${item.key}" data-planned-amount="${planned.amount}">
                    <span class="badge-count" id="count_${item.key}">×0</span>
                    <div class="magic-core"></div>
                    <div class="token-label">${item.label}</div>
                </div>
            `;
        }).join('');
        const activePage = getActivePlannerPage();
        const activeResourcePage = activePage === 'planner' ? '' : activePage;
        const drawerTheme = activeResourcePage || 'asset';
        const drawerOpenClass = appState.drawerOpen ? ' is-hub-open' : '';
        const drawerExpandedClass = appState.drawerOpen && activeResourcePage ? ' is-expanded' : '';
        const assetDeckHash = JSON.stringify({
            summary: getCurrentAssetDeckSummary(),
            assetWarehouseOpen: appState.assetWarehouseOpen,
            phaseSlots: appState.phaseSlots
        });
        const resourceHash = JSON.stringify({
            page: activePage,
            inventory: appState.inventory,
            phaseSlots: appState.phaseSlots,
            selection: selectionState,
            restTintPopupSlotId: appState.restTintPopupSlotId,
            nodeId: appState.currentNodeId,
            nodeIndex: appState.currentNodeIndex,
            vision: getVisionStateForDashboard()
        });
        const editMode = normalizePlannerEditMode(appState.plannerEditMode);
        plannerDrawerMount.innerHTML = `
            <section class="drawer theme-${drawerTheme}${drawerOpenClass}${drawerExpandedClass}${readonlyClass}" id="drawer" data-active-tab="${activeResourcePage}" data-planner-page="${activePage}" data-edit-mode="${editMode}" data-asset-page="${activePage === 'asset' ? 'deck' : activePage}" data-asset-hash="${escapePartyHtml(assetDeckHash)}" data-resource-hash="${escapePartyHtml(resourceHash)}">
                <div class="aux-container">
                    <section class="view theme-combat ${activePage === 'combat' ? 'is-active' : ''}" data-view="combat">
                        ${buildCombatResourcePageMarkup()}
                    </section>
                    <section class="view theme-rest ${activePage === 'rest' ? 'is-active' : ''}" data-view="rest">
                        ${buildRestResourcePageMarkup()}
                    </section>
                    <section class="view theme-asset ${activePage === 'asset' ? 'is-active' : ''}" data-view="asset">
                        ${buildAssetResourcePageMarkup()}
                    </section>
                    <section class="view theme-vision ${activePage === 'vision' ? 'is-active' : ''}" data-view="vision">
                        ${buildVisionResourcePageMarkup()}
                    </section>
                </div>
                <header class="planner-hub">
                    <div class="hub-title">
                        <span>PHASE DEPLOYMENT · RESOURCES</span>
                        <div class="planner-edit-mode" aria-label="Phase point edit mode">
                            <button class="${editMode === 'remove' ? 'is-active' : ''}" type="button" data-planner-edit-mode="remove">-1</button>
                            <button class="${editMode === 'add' ? 'is-active' : ''}" type="button" data-planner-edit-mode="add">+1</button>
                        </div>
                    </div>
                    <div class="token-grid${readonlyClass}" id="inventory" aria-label="Phase resource hub">${inventoryMarkup}</div>
                </header>
            </section>
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
                    <span>情报改写 x${prompt.charges}</span>
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
        const drawer = document.getElementById('drawer');
        const inventory = document.getElementById('inventory');
        if (!drawer || !inventory) return true;
        const shouldBeReadonly = !canUseInteractivePlannerControls();
        if (drawer.classList.contains('is-host-readonly') !== shouldBeReadonly) return true;
        if (inventory.classList.contains('is-host-readonly') !== shouldBeReadonly) return true;
        const activePage = getActivePlannerPage();
        const activeResourcePage = activePage === 'planner' ? '' : activePage;
        const resourceHash = JSON.stringify({
            page: activePage,
            inventory: appState.inventory,
            phaseSlots: appState.phaseSlots,
            selection: selectionState,
            restTintPopupSlotId: appState.restTintPopupSlotId,
            nodeId: appState.currentNodeId,
            nodeIndex: appState.currentNodeIndex,
            vision: getVisionStateForDashboard()
        });
        if (drawer.dataset.activeTab !== activeResourcePage) return true;
        if (drawer.dataset.plannerPage !== activePage) return true;
        if (drawer.dataset.editMode !== normalizePlannerEditMode(appState.plannerEditMode)) return true;
        if (drawer.dataset.assetPage !== (activePage === 'asset' ? 'deck' : activePage)) return true;
        if (activePage === 'asset' && drawer.dataset.assetHash !== JSON.stringify({
            summary: getCurrentAssetDeckSummary(),
            assetWarehouseOpen: appState.assetWarehouseOpen,
            phaseSlots: appState.phaseSlots
        })) return true;
        if (activePage !== 'asset' && activePage !== 'planner' && drawer.dataset.resourceHash !== resourceHash) return true;
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
        const drawer = document.getElementById('drawer');
        if (!drawer) return;
        const activePage = getActivePlannerPage();
        const activeResourcePage = activePage === 'planner' ? '' : activePage;
        drawer.classList.toggle('is-hub-open', appState.drawerOpen);
        drawer.classList.toggle('is-expanded', appState.drawerOpen && Boolean(activeResourcePage));
        drawer.classList.toggle('theme-combat', activeResourcePage === 'combat');
        drawer.classList.toggle('theme-rest', activeResourcePage === 'rest');
        drawer.classList.toggle('theme-asset', !activeResourcePage || activeResourcePage === 'asset');
        drawer.classList.toggle('theme-vision', activeResourcePage === 'vision');

        appData.planner.inventory.forEach((item) => {
            const tokenEl = document.getElementById(`inv_${item.key}`);
            const countEl = document.getElementById(`count_${item.key}`);
            const subEl = document.getElementById(`sub_${item.key}`);
            if (!tokenEl || !countEl) return;
            const total = getTotalInventoryCount(item.key);
            tokenEl.className = `token-dispenser type-${item.key}`;
            tokenEl.classList.toggle('is-empty', total <= 0 && !tokenEl.dataset.plannerTab);
            tokenEl.classList.toggle('is-active', activePage === item.key);
            tokenEl.classList.toggle('is-selected', selectionState.source === 'inventory' && selectionState.type === item.key);
            const planned = getPlannedResourceState(item.key);
            tokenEl.classList.toggle('is-planned', planned.amount > 0);
            tokenEl.dataset.plannedAmount = String(planned.amount);
            countEl.textContent = `×${total}`;
            if (subEl) subEl.textContent = '';
        });

        document.querySelectorAll('[data-planner-edit-mode]').forEach((button) => {
            button.classList.toggle('is-active', normalizePlannerEditMode(button.dataset.plannerEditMode) === normalizePlannerEditMode(appState.plannerEditMode));
        });

        syncRestControlPanelDOM();
    }

    function getSelectedRestSlotToken() {
        const slotId = appState.restTintPopupSlotId || (selectionState.source === 'slot' ? selectionState.slotId : '');
        if (!slotId || !canEditPhaseSlot(slotId)) return null;
        const token = appState.phaseSlots[slotId];
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

    function openRestTintPopup(slotId = selectionState.slotId) {
        const token = slotId ? appState.phaseSlots[slotId] : null;
        if (!token || token.key !== 'rest') return false;
        setPlannerPage('rest');
        appState.drawerOpen = true;
        appState.restTintPopupSlotId = slotId;
        return true;
    }

    function closeRestTintPopup() {
        appState.restTintPopupSlotId = '';
        document.getElementById('restTintOverlay')?.remove();
    }

    function syncRestControlPanelDOM() {
        const token = getSelectedRestSlotToken();
        const isVisible = Boolean(token) && canUseInteractivePlannerControls();
        const currentTint = token ? normalizeRestTintKey(token.tint || token.controlType || token.targetKey, 'neutral') : 'neutral';
        document.querySelectorAll('[data-rest-tint]').forEach((button) => {
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
            if ((selectionState.source === 'slot' && selectionState.slotId === phase.slotId) || appState.restTintPopupSlotId === phase.slotId) coreEl.classList.add('is-selected');
            if (!canEditPhaseSlot(phase.slotId)) coreEl.classList.add('is-locked');

            mountedEl.className = 'mounted-token';
            mountedEl.removeAttribute('data-type');
            mountedEl.removeAttribute('data-source');
            mountedEl.removeAttribute('data-amount');
            mountedEl.removeAttribute('data-tint');
            mountedEl.removeAttribute('data-vision-replacement');
            if (displayToken) {
                mountedEl.classList.add(`type-${displayToken.key}`);
                if ((selectionState.source === 'slot' && selectionState.slotId === phase.slotId) || appState.restTintPopupSlotId === phase.slotId) mountedEl.classList.add('is-selected');
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
                    fixedGlyphEl.classList.toggle('is-pre-signal', encounterMarker.type === 'pre_signal');
                    fixedGlyphEl.title = `${encounterMarker.charKey} · ${encounterMarker.type === 'pre_signal' ? 'PRE SIGNAL' : 'FIRST MEET'}`;
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
            const total = limited + reserve;
            return `
                <div class="act-state-row type-${key}">
                    <span class="act-state-key">${RESOURCE_TYPE_MAP[key]}</span>
                    <span class="act-state-value">${total}</span>
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
        const seedMarkup = seed ? `
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
                    <span>跃迁</span>
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
                    <span>情报</span>
                    <strong>${String(appState.currentNodeIndex).padStart(2, '0')} > ${String(visibleTo).padStart(2, '0')}</strong>
                </div>
                ${pendingMarkup}
                ${jumpMarkup}
            </div>
        `;
    }

    function formatActAssetSourceLabel(item) {
        const nodeId = typeof item?.nodeId === 'string' ? item.nodeId : item?.payload?.commandPayload?.source?.nodeId;
        const phaseIndex = Number.isFinite(Number(item?.phaseIndex))
            ? Math.max(0, Math.min(3, Math.round(Number(item.phaseIndex))))
            : Number.isFinite(Number(item?.payload?.commandPayload?.source?.phaseIndex))
                ? Math.max(0, Math.min(3, Math.round(Number(item.payload.commandPayload.source.phaseIndex))))
                : null;
        const nodeLabel = nodeId ? getRouteOptionLabel(nodeId) || nodeId : 'ACT';
        return phaseIndex === null ? nodeLabel : `${nodeLabel} · ${getPhaseRomanLabel(phaseIndex)}`;
    }

    function formatActAssetCommandLabel(commandInput) {
        const command = commandInput && typeof commandInput === 'object' ? commandInput : {};
        const kind = typeof command.kind === 'string' ? command.kind : command.type;
        const payload = command.payload && typeof command.payload === 'object' ? command.payload : {};
        if (kind === 'grant_asset') return `+${Math.max(0, Math.round(Number(payload.amount) || 0))} DECK PT`;
        if (kind === 'open_offer') return `OPEN ${String(payload.pool || 'low').toUpperCase()}`;
        return String(kind || 'COMMAND').toUpperCase();
    }

    function normalizeCombatPendingResolutionsForDashboard(actState) {
        return (Array.isArray(actState?.pendingResolutions) ? actState.pendingResolutions : [])
            .filter((item) => item && typeof item === 'object' && normalizeResourceKey(item.type, '') === 'combat')
            .map((item) => ({
                ...deepCloneValue(item),
                level: Math.max(1, Math.min(3, Math.round(Number(item.level) || 1))),
                status: typeof item.status === 'string' && item.status.trim() ? item.status.trim().toLowerCase() : 'pending'
            }));
    }

    function formatCombatRequestLabel(item) {
        const level = Math.max(1, Math.min(3, Math.round(Number(item?.level) || 1)));
        if (level === 1) return 'COMBAT I · LOW STAKE';
        if (level === 2) return 'COMBAT II · ELITE';
        return 'COMBAT III · BOSS';
    }

    function buildCombatSettlementRowsMarkup(actState, options = {}) {
        const rowClass = options.panel === 'act'
            ? 'vision-task-row combat-task-row type-combat'
            : 'row combat-request-row type-combat';
        const pendingRows = normalizeCombatPendingResolutionsForDashboard(actState)
            .filter((item) => item.status === 'pending')
            .slice(0, 3)
            .map((item) => `
                <div class="${rowClass}">
                    <span>PENDING</span>
                    <strong>${escapePartyHtml(formatCombatRequestLabel(item))} · ${escapePartyHtml(formatActAssetSourceLabel(item))}</strong>
                    <em>EXT</em>
                </div>
            `).join('');
        const historyRows = (Array.isArray(actState?.resolutionHistory) ? actState.resolutionHistory : [])
            .filter((item) => item && typeof item === 'object' && normalizeResourceKey(item.type, '') === 'combat')
            .slice(-2)
            .reverse()
            .map((item) => `
                <div class="${rowClass} is-current">
                    <span>${escapePartyHtml(String(item.status || 'DONE').toUpperCase().slice(0, 8))}</span>
                    <strong>${escapePartyHtml(String(item.outcome || item.summary || 'COMBAT RESULT').toUpperCase())} · ${escapePartyHtml(formatActAssetSourceLabel(item))}</strong>
                    <em>HIST</em>
                </div>
            `).join('');
        return pendingRows || historyRows || `<div class="${options.panel === 'act' ? 'vision-task-row combat-task-row' : 'row'} is-empty"><strong>-</strong><span>不生成假收益</span><em>LOCK</em></div>`;
    }

    function buildCombatSettlementPanelMarkup(actState) {
        return `
            <div class="asset-act-panel combat-act-panel">
                <div class="vision-task-row combat-task-row">
                    <span>COMBAT</span>
                    <strong>ADAPTER PENDING · EXTERNAL ONLY</strong>
                </div>
                ${buildCombatSettlementRowsMarkup(actState, { panel: 'act' })}
            </div>
        `;
    }

    function buildAssetSettlementPanelMarkup(actState) {
        const assetSummary = getCurrentAssetDeckSummary();
        const pendingCommands = normalizePendingAssetDeckCommandsForDashboard(actState);
        const pendingRows = pendingCommands
            .filter((item) => {
                const status = typeof item.status === 'string' && item.status.trim() ? item.status.trim().toLowerCase() : 'pending';
                return status === 'pending';
            })
            .slice(0, 2)
            .map((item) => `
                <div class="vision-task-row asset-task-row">
                    <span>PENDING</span>
                    <strong>${escapePartyHtml(formatActAssetCommandLabel(item.command))} · ${escapePartyHtml(formatActAssetSourceLabel(item))}</strong>
                </div>
            `).join('');
        const historyRows = (Array.isArray(actState.resolutionHistory) ? actState.resolutionHistory : [])
            .filter((item) => item && typeof item === 'object' && item.type === 'asset')
            .slice(-2)
            .reverse()
            .map((item) => {
                const kind = item?.payload?.commandKind || item?.command?.kind || item?.command?.type || 'asset';
                const outcome = item?.outcome || item?.status || '';
                return `
                    <div class="vision-task-row asset-task-row is-ready">
                        <span>${escapePartyHtml(String(kind).replace(/_/g, ' ').toUpperCase().slice(0, 8))}</span>
                        <strong>${escapePartyHtml(String(outcome).toUpperCase())} · ${escapePartyHtml(formatActAssetSourceLabel(item))}</strong>
                    </div>
                `;
            }).join('');
        const offer = assetSummary.pending?.offer;
        const offerMarkup = offer ? `
            <div class="vision-task-row asset-task-row is-ready">
                <span>OFFER</span>
                <strong>${escapePartyHtml(String(offer.pool || 'low').toUpperCase())} · ${Array.isArray(offer.choices) ? offer.choices.length : 0} CARDS</strong>
            </div>
        ` : '';
        return `
            <div class="asset-act-panel">
                <div class="vision-task-row asset-task-row">
                    <span>DECK PTS</span>
                    <strong>${Math.max(0, Math.round(Number(assetSummary.points) || 0))} POINTS</strong>
                </div>
                ${offerMarkup}
                ${pendingRows}
                ${historyRows}
            </div>
        `;
    }

    function getEncounterDebugEligibilityMap(actState) {
        const actModule = getActModuleApi();
        if (!actModule || typeof actModule.evaluateCharacterEncounterEligibility !== 'function') {
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
        const context = getCurrentEncounterDebugContext();
        const enabledFlags = Object.entries(context.storyFlags)
            .filter(([, enabled]) => enabled === true)
            .map(([key]) => key);
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
                <div class="encounter-location-head">
                    <span>SCENE TAGS</span>
                    <strong>${context.tags.length ? context.tags.join(' / ') : 'NONE'}</strong>
                </div>
                <div class="encounter-location-grid is-tags">
                    ${ENCOUNTER_DEBUG_TAG_OPTIONS.map((option) => `
                        <button class="debug-act-btn${context.tags.includes(option.key) ? ' is-ready' : ''}" type="button" data-debug-action="toggle-encounter-tag" data-encounter-tag="${option.key}">
                            ${option.label}
                        </button>
                    `).join('')}
                </div>
                <div class="encounter-location-head">
                    <span>STORY FLAGS</span>
                    <strong>${enabledFlags.length ? enabledFlags.join(' / ') : 'NONE'}</strong>
                </div>
                <div class="encounter-location-grid is-flags">
                    ${ENCOUNTER_DEBUG_FLAG_OPTIONS.map((option) => `
                        <button class="debug-act-btn${context.storyFlags[option.key] ? ' is-ready' : ''}" type="button" data-debug-action="toggle-encounter-flag" data-encounter-flag="${option.key}">
                            ${option.label}
                        </button>
                    `).join('')}
                </div>
                <div class="encounter-debug-numeric-grid">
                    <label>
                        <span>FUNDS</span>
                        <input type="number" min="0" step="50" value="${context.funds}" data-debug-action="set-encounter-funds">
                    </label>
                    <label>
                        <span>CRISIS</span>
                        <input type="number" min="0" max="100" step="1" value="${context.crisis}" data-debug-action="set-encounter-crisis">
                    </label>
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
        if (state.preSignalDone === true) {
            return { label: 'PRE-SIGNAL', reason: 'signal done; first meet boosted', canForce: true, className: 'is-pre-signal' };
        }
        if (active?.status === 'placed') {
            const phaseIndex = Math.max(0, Math.min(3, Math.round(Number(active.targetPhaseIndex) || 0)));
            return {
                label: active.type === 'pre_signal' ? 'SIGNAL' : 'PLACED',
                reason: `${getRouteOptionLabel(active.targetNodeId || '') || active.targetNodeId || 'NODE'} · ${getPhaseRomanLabel(phaseIndex)}`,
                canForce: false,
                className: active.type === 'pre_signal' ? 'is-pre-signal' : 'is-placed'
            };
        }
        if (active) {
            return { label: String(active.status || 'QUEUED').toUpperCase(), reason: 'queue', canForce: false, className: 'is-queued' };
        }
        const evaluated = eligibilityMap.get(charKey);
        if (evaluated?.debugState === 'ready') {
            return { label: 'READY', reason: formatEncounterRequirementSummary(evaluated, { includePassed: true }), canForce: true, className: 'is-ready' };
        }
        const reasons = Array.isArray(evaluated?.reasonCodes) && evaluated.reasonCodes.length
            ? evaluated.reasonCodes
            : ['blocked'];
        return { label: 'BLOCKED', reason: formatEncounterRequirementSummary(evaluated, { fallback: formatEncounterReasonCodes(reasons) }), canForce: true, className: 'is-blocked' };
    }

    function formatEncounterReasonCodes(reasonCodes) {
        const codes = Array.isArray(reasonCodes)
            ? reasonCodes
            : String(reasonCodes || '').split('/');
        return codes
            .map((code) => {
                const normalized = String(code || '').trim();
                if (!normalized) return '';
                if (ENCOUNTER_REASON_LABELS[normalized]) return ENCOUNTER_REASON_LABELS[normalized];
                if (normalized.startsWith('requires_')) return `needs ${normalized.slice('requires_'.length).toUpperCase()}`;
                if (normalized.startsWith('missing_flag_')) return `missing ${normalized.slice('missing_flag_'.length).replace(/_/g, ' ')}`;
                return normalized.replace(/_/g, ' ');
            })
            .filter(Boolean)
            .join(' / ') || 'blocked';
    }

    function formatEncounterRequirementSummary(evaluated, options = {}) {
        const req = evaluated?.requirements && typeof evaluated.requirements === 'object' ? evaluated.requirements : null;
        if (!req) return options.fallback || `priority ${evaluated?.priority || 0}`;
        const parts = [];
        const pushThreshold = (label, current, required) => {
            const threshold = Math.max(0, Math.round(Number(required) || 0));
            if (!threshold) return;
            parts.push(`${label} ${Math.max(0, Math.round(Number(current) || 0))}/${threshold}`);
        };
        pushThreshold('day', req.day, req.minDay);
        pushThreshold('node', req.nodeIndex, req.minNodeIndex);
        pushThreshold('funds', req.funds, req.minFunds);
        pushThreshold('crisis', req.crisis, req.minCrisis);
        pushThreshold('spent', req.spentScore, req.minSpentScore);
        if (req.requiredGeo) parts.push(`geo ${req.geo || 'missing'}>${req.requiredGeo}`);
        if (Array.isArray(req.requiredTags) && req.requiredTags.length) parts.push(`tag ${req.requiredTags.join('|')}`);
        if (Array.isArray(req.requiredFlags) && req.requiredFlags.length) parts.push(`flag ${req.requiredFlags.join('|')}`);
        if (Array.isArray(req.requiredCharacters) && req.requiredCharacters.length) parts.push(`needs ${req.requiredCharacters.join('|')}`);
        if (Array.isArray(req.requiredAny) && req.requiredAny.length) parts.push(`any ${formatEncounterAnyRequirement(req.requiredAny)}`);
        if (options.includePassed) parts.push(`priority ${evaluated?.priority || 0}`);
        return parts.join(' / ') || options.fallback || 'no requirements';
    }

    function formatEncounterAnyRequirement(groups) {
        return groups
            .map((group) => {
                const parts = [];
                if (Array.isArray(group.requiredCharacters) && group.requiredCharacters.length) parts.push(group.requiredCharacters.join('+'));
                if (Array.isArray(group.requiredFlags) && group.requiredFlags.length) parts.push(group.requiredFlags.join('+'));
                if (Number(group.minCrisis) > 0) parts.push(`crisis>${group.minCrisis}`);
                if (Number(group.minFunds) > 0) parts.push(`funds>${group.minFunds}`);
                return parts.join('+');
            })
            .filter(Boolean)
            .join(' OR ') || 'alternate gate';
    }

    function buildEncounterDebugPanelMarkup(actState, encounter) {
        const eligibilityMap = getEncounterDebugEligibilityMap(actState);
        return `
            <details class="encounter-debug-panel"${appState.encounterDebugOpen ? ' open' : ''}>
                <summary>ENCOUNTER DEBUG</summary>
                <div class="encounter-debug-mode-note">
                    <span>FREE ADD = FORCE ignores rules</span>
                    <span>RULE ADD = eligible auto placement</span>
                </div>
                <div class="encounter-debug-actions">
                    <button class="debug-act-btn" type="button" data-debug-action="encounter-scan">SCAN</button>
                    <button class="debug-act-btn is-ready" type="button" data-debug-action="auto-add-encounter">RULE ADD</button>
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
                                    <span title="${escapePartyHtml(`${debugState.label} · ${debugState.reason}`)}">${debugState.label} · ${escapePartyHtml(debugState.reason)}</span>
                                </div>
                                <button class="debug-act-btn${debugState.canForce ? ' is-ready' : ' is-disabled'}" type="button" data-debug-action="force-encounter" data-encounter-char="${charKey}">FREE</button>
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
                const typeLabel = item.type === 'pre_signal' ? 'SIG' : 'MEET';
                return `${typeLabel}:${item.charKey}@${getRouteOptionLabel(item.targetNodeId || '') || item.targetNodeId || 'NODE'}·${getPhaseRomanLabel(phaseIndex)}`;
            }).join(' / ')
            : activeQueue.length
                ? activeQueue.map((item) => `${item.type === 'pre_signal' ? 'SIG' : 'MEET'}:${item.charKey}:${String(item.status || 'queued').toUpperCase()}`).join(' / ')
                : 'EMPTY';
        return `
            <div class="encounter-act-panel">
                <div class="vision-task-row${placed.length ? ' is-ready' : ''}">
                    <span>ENCOUNTER</span>
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
        if (!isOverviewDebugMode()) return '';
        const actState = getCurrentActStateForPanel();
        const modeLabel = getAdapterModeLabel();
        const stage = normalizeActStage(actState.stage).toUpperCase();
        const crisis = Math.max(0, Math.min(100, Math.round(Number(actState.crisis) || 0)));
        const sight = Math.max(0, Math.round(Number(actState.vision?.baseSight) || 0))
            + Math.max(0, Math.round(Number(actState.vision?.bonusSight) || 0));
        return `
            <div class="act-mode-panel is-debug">
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
                        <span>情报</span>
                        <strong>${sight}</strong>
                    </div>
                </div>
                <div class="act-resource-ledger">${buildResourceStateRows(actState)}</div>
                <div class="act-slot-ledger">${buildPhaseSlotStateRows(actState)}</div>
                ${buildVisionPanelMarkup(actState)}
                ${buildCombatSettlementPanelMarkup(actState)}
                ${buildAssetSettlementPanelMarkup(actState)}
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
    let overviewMapView = null;
    
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

    function getCameraFitMetrics() {
        const currentIndex = Math.max(1, Math.round(Number(appState.currentNodeIndex) || 1));
        const maxIndex = currentIndex + getVisionSightValue();
        const minIndex = Math.max(1, currentIndex - 1);
        const fitNodes = Array.from(layer.querySelectorAll('.az-node:not(.node-fog-hidden)'))
            .map((node) => ({
                x: parsePxPosition(node.style.left, NaN),
                y: parsePxPosition(node.style.top, NaN),
                nodeIndex: getNodeIndex(node.id)
            }))
            .filter((node) => (
                Number.isFinite(node.x) &&
                Number.isFinite(node.y) &&
                node.nodeIndex >= minIndex &&
                node.nodeIndex <= maxIndex
            ));
        if (!fitNodes.length) return layerMetrics;
        const minX = Math.min(...fitNodes.map((node) => node.x));
        const maxX = Math.max(...fitNodes.map((node) => node.x));
        const minY = Math.min(...fitNodes.map((node) => node.y));
        const maxY = Math.max(...fitNodes.map((node) => node.y));
        return {
            width: Math.max(320, (maxX - minX) + 260),
            height: Math.max(320, (maxY - minY) + 260)
        };
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

        layer.querySelectorAll('.az-node:not(.node-fog-hidden)').forEach((node) => {
            xValues.push(parsePxPosition(node.style.left, 0));
            yValues.push(parsePxPosition(node.style.top, 0));
        });

        layer.querySelectorAll('.grid-base-line:not(.grid-line-fog-hidden)').forEach((line) => {
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
        const fitMetrics = getCameraFitMetrics();
        const widthScale = safeWidth / Math.max(fitMetrics.width, 1);
        const heightScale = safeHeight / Math.max(fitMetrics.height, 1);
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
        const detailVisible = isNodeDetailVisible(node.id);
        const displayTypeClass = detailVisible ? `type-${getDisplayTypeKeyForMapNode(node)}` : '';
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
        if (hasFixedPhase && detailVisible) classList.push('node-has-fixed-phase');
        if (displayTypeClass) classList.push(displayTypeClass);
        if (node.id !== currentNodeData.presentNode && !pathNodeIds.includes(node.id) && !currentNodeData.deadNodes.includes(node.id)) {
            classList.push(isNodeInVisionRange(node.id) ? 'node-visible' : 'node-obscured');
        }
        if (!detailVisible) classList.push('node-intel-hidden', 'node-fog-hidden');
        if (isNodeTemporarilyRevealedByIntel(node.id)) classList.push('node-intel-revealed');
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
            lineEl.className = `grid-base-line ${getCurrentColumnLineClass(column)}${isColumnVisibleInMapFog(column) ? '' : ' grid-line-fog-hidden'}`;
        });

        getMapNodes().forEach((node) => {
            const nodeEl = document.getElementById(node.id);
            if (!nodeEl) return;
            nodeEl.className = getMapClassNameForNode(node);
            const labelEl = nodeEl.querySelector('.node-label');
            const sublabelEl = nodeEl.querySelector('.node-sublabel');
            const detailVisible = isNodeDetailVisible(node.id);
            if (labelEl) labelEl.textContent = node.label;
            if (sublabelEl) sublabelEl.textContent = detailVisible ? node.sublabel : 'UNKNOWN';
            nodeEl.dataset.displayType = detailVisible ? getDisplayTypeKeyForMapNode(node) : 'unknown';
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
        if (overviewMapView) {
            overviewMapView.rebuild();
            overviewMapView.ensureDrawLoop();
        } else {
            initSVGPaths();
            ensureDrawLoop();
        }
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
        appState.restTintPopupSlotId = '';
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
        const key = normalizeResourceKey(type, '');
        if (!key) return;
        selectionState.source = 'inventory';
        selectionState.type = key;
        selectionState.slotId = null;
        appState.plannerAddType = key;
        appState.restTintPopupSlotId = '';
    }

    function selectSlotToken(slotId) {
        if (!canEditPhaseSlot(slotId)) return;
        const token = appState.phaseSlots[slotId];
        if (!token) return;
        selectionState.source = 'slot';
        selectionState.type = token.type;
        selectionState.slotId = slotId;
        if (token.key !== 'rest') appState.restTintPopupSlotId = '';
    }

    function consumeInventoryToken(type) {
        const plannerRuntime = getOverviewPlannerRuntimeApi();
        if (plannerRuntime && typeof plannerRuntime.consumeInventoryToken === 'function') {
            return plannerRuntime.consumeInventoryToken(createPlannerRuntimeContext(), type);
        }
        const key = normalizeResourceKey(type, '');
        if (!key) return null;
        const source = getPreferredSourceForKey(key);
        if (!source) return null;
        appState.inventory[key][source] -= 1;
        return { key, type: RESOURCE_TYPE_MAP[key] || key.toUpperCase(), source, amount: 1, sources: [source] };
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
            if (currentToken.key === 'rest') {
                openRestTintPopup(slotId);
            } else {
                if (getTotalInventoryCount(currentToken.key) <= 0) {
                    resetSelection();
                } else {
                    selectInventoryToken(selectionState.type);
                }
            }
            refreshAllUI();
            return;
        }
        const token = consumeInventoryToken(selectionState.type);
        if (!token) return;
        restoreTokenToInventory(appState.phaseSlots[slotId]);
        appState.phaseSlots[slotId] = token;
        markActStateDirty();
        if (token.key === 'rest') {
            openRestTintPopup(slotId);
        } else {
            if (getTotalInventoryCount(token.key) <= 0) {
                resetSelection();
            } else {
                selectInventoryToken(token.type);
            }
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

    function removeOnePointFromPhaseSlot(slotId) {
        if (!canEditPhaseSlot(slotId)) return false;
        const token = appState.phaseSlots[slotId];
        if (!token) return false;
        restoreRestTintToInventory(token);
        const amount = Math.max(1, Math.min(3, Math.round(Number(token.amount) || 1)));
        const sources = Array.isArray(token.sources) && token.sources.length
            ? token.sources
            : Array.from({ length: amount }, () => token.source || 'limited');
        const source = sources.pop() || token.source || 'limited';
        const bucket = source === 'reserve' ? 'reserve' : 'limited';
        appState.inventory[token.key][bucket] += 1;
        if (amount <= 1) {
            appState.phaseSlots[slotId] = null;
        } else {
            token.amount = amount - 1;
            token.sources = sources.slice(0, amount - 1);
            token.source = token.sources.includes('limited') ? 'limited' : (token.sources[0] || 'limited');
        }
        const addKey = normalizeResourceKey(appState.plannerAddType, '');
        if (addKey && getTotalInventoryCount(addKey) > 0) {
            selectInventoryToken(addKey);
        } else if (selectionState.source === 'slot' && selectionState.slotId === slotId) {
            selectionState.source = null;
            selectionState.type = null;
            selectionState.slotId = null;
        }
        markActStateDirty();
        refreshAllUI();
        return true;
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
        const debugContext = getCurrentEncounterDebugContext();
        return {
            day: 99,
            geo: location.layer,
            site: location.site,
            location,
            funds: debugContext.funds,
            crisis: debugContext.crisis,
            storyFlags: debugContext.storyFlags,
            world: {
                location,
                encounterContext: debugContext
            },
            tags: [
                'debug',
                ...debugContext.tags,
                location.layer,
                location.site,
                ...location.tags,
                runtimeNode?.ui?.subtitle,
                runtimeNode?.narrative?.title,
                runtimeNode?.narrative?.overview,
                runtimeNode?.narrative?.guidance
            ].filter(Boolean),
            flags: [
                'debug',
                ...Object.entries(debugContext.storyFlags).filter(([, enabled]) => enabled === true).map(([key]) => key)
            ]
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

    function autoAddEligibleEncounter() {
        if (!isOverviewDebugMode()) return false;
        const actModule = getActModuleApi();
        if (
            !actModule
            || typeof actModule.enqueueEligibleCharacterEncounters !== 'function'
            || typeof actModule.getChapter !== 'function'
        ) {
            return false;
        }
        const currentPayload = adapterState.lastPayload || buildInitialDebugPayload();
        const hero = extractHeroPayload(currentPayload) || { funds: appState.resources.funds, assets: appState.resources.assets };
        return updateActStatePayloadAndCommit((actState) => {
            const config = actModule.getChapter(actState.id || getCurrentChapterId());
            const result = actModule.enqueueEligibleCharacterEncounters(actState, hero, {
                context: getDebugEncounterContext(),
                config,
                limit: 1,
                place: true,
                distance: 1
            });
            const queued = Array.isArray(result?.queued) ? result.queued : [];
            const placed = result?.placed || null;
            const blockedCount = Array.isArray(result?.evaluated?.blocked) ? result.evaluated.blocked.length : 0;
            if (placed) {
                syncState.statusText = `RULE ADD: ${placed.charKey}@${placed.targetNodeId || 'PATH'}`;
            } else if (queued.length) {
                syncState.statusText = `RULE ADD QUEUED: ${queued.map((item) => item.charKey).join('/')}`;
            } else {
                syncState.statusText = `RULE ADD NONE (${blockedCount} BLOCKED)`;
            }
            return result?.actState || actState;
        });
    }

    function forceDebugEncounter(charKey) {
        if (!isOverviewDebugMode()) return false;
        const actModule = getActModuleApi();
        if (!actModule || typeof actModule.debugForceCharacterEncounter !== 'function' || typeof actModule.getChapter !== 'function') return false;
        const normalizedCharKey = typeof charKey === 'string' ? charKey.trim().toUpperCase() : '';
        if (!normalizedCharKey) return false;
        return updateActStatePayloadAndCommit((actState) => {
            const config = actModule.getChapter(actState.id || getCurrentChapterId());
            const result = actModule.debugForceCharacterEncounter(actState, normalizedCharKey, config, { distance: 1 });
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

    function updateDebugEncounterContext(updater) {
        if (!isOverviewDebugMode()) return false;
        return updateWorldPayloadAndCommit((world) => {
            const current = normalizeEncounterDebugContext(world.encounterContext, world.act);
            const next = typeof updater === 'function'
                ? updater(current)
                : { ...current, ...(updater || {}) };
            world.encounterContext = normalizeEncounterDebugContext(next, world.act);
            syncState.statusText = 'ENCOUNTER CONTEXT UPDATED';
            return world;
        });
    }

    function toggleDebugEncounterTag(tagValue) {
        const tag = typeof tagValue === 'string' ? tagValue.trim().toLowerCase() : '';
        if (!tag) return false;
        return updateDebugEncounterContext((context) => {
            const tags = context.tags.includes(tag)
                ? context.tags.filter((item) => item !== tag)
                : [...context.tags, tag];
            return { ...context, tags };
        });
    }

    function toggleDebugEncounterFlag(flagValue) {
        const flag = typeof flagValue === 'string' ? flagValue.trim().toLowerCase() : '';
        if (!flag) return false;
        return updateDebugEncounterContext((context) => ({
            ...context,
            storyFlags: {
                ...context.storyFlags,
                [flag]: context.storyFlags[flag] !== true
            }
        }));
    }

    function setDebugEncounterNumericField(field, value) {
        const key = field === 'crisis' ? 'crisis' : 'funds';
        const max = key === 'crisis' ? 100 : Number.POSITIVE_INFINITY;
        const numeric = Math.max(0, Math.min(max, Math.round(Number(value) || 0)));
        return updateDebugEncounterContext((context) => ({
            ...context,
            [key]: numeric
        }));
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
            result = actModule.resolvePendingAdvanceState(actState, currentHero, config, getDebugEncounterContext());
        } catch (error) {
            console.warn('[ACE0 DEBUG] advance through ACT module failed:', error);
            return false;
        }
        if (!result?.actState) return false;

        const settledWorld = settlePendingActAssetDeckCommandsForDashboardWorld({
            ...(currentWorld || {}),
            act: result.actState
        });
        const settledActState = settledWorld?.act && typeof settledWorld.act === 'object'
            ? settledWorld.act
            : result.actState;
        const nextPayload = buildNormalizedDashboardPayload({
            ...(currentPayload || {}),
            hero: result.heroState && typeof result.heroState === 'object'
                ? result.heroState
                : currentHero,
            world: settledWorld
        }, {
            actState: settledActState,
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
        if (action === 'auto-add-encounter') {
            return autoAddEligibleEncounter();
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
        if (action === 'toggle-encounter-tag') {
            return toggleDebugEncounterTag(target?.dataset?.encounterTag);
        }
        if (action === 'toggle-encounter-flag') {
            return toggleDebugEncounterFlag(target?.dataset?.encounterFlag);
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
        plannerDrawer = document.getElementById('drawer');
        inventoryPanel = document.getElementById('inventory');
        inventoryTokens = Array.from(document.querySelectorAll('.token-dispenser'));
        dropZones = Array.from(document.querySelectorAll('.phase-core.drop-zone'));
        restTintButtons = Array.from(document.querySelectorAll('[data-rest-tint]'));

        inventoryTokens.forEach((token) => {
            if (token.dataset.bound === 'true') return;
            token.dataset.bound = 'true';
            token.addEventListener('click', () => {
                if (!canUseInteractivePlannerControls()) return;
                if (token.dataset.plannerTab) return;
                // executing 下仍允许点击 inventory token，用于编辑未来相位
                if (isRouteSelectionActive() || token.classList.contains('is-empty')) return;
                const type = token.dataset.type;
                setPlannerEditMode('add');
                if (getTotalInventoryCount(type) > 0) selectInventoryToken(type);
                else resetSelection();
                appState.drawerOpen = true;
                setPlannerPage(type);
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

                if (normalizePlannerEditMode(appState.plannerEditMode) === 'remove') {
                    removeOnePointFromPhaseSlot(slotId);
                    return;
                }

                if (selectionState.source === 'inventory') {
                    if (!editable) return;
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

                if (mounted && editable) {
                    selectSlotToken(slotId);
                    if (mounted.key === 'rest') {
                        setPlannerPage('rest');
                        appState.drawerOpen = true;
                    }
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
                if (setSelectedRestTint(button.dataset.restTint)) {
                    closeRestTintPopup();
                    refreshPlannerUI();
                }
            });
        });

        document.querySelectorAll('[data-close-rest-tint]').forEach((button) => {
            if (button.dataset.bound === 'true') return;
            button.dataset.bound = 'true';
            button.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                closeRestTintPopup();
                refreshPlannerUI();
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

        const editModeButton = e.target.closest('[data-planner-edit-mode]');
        if (editModeButton) {
            e.preventDefault();
            e.stopPropagation();
            setPlannerEditMode(editModeButton.dataset.plannerEditMode);
            appState.drawerOpen = true;
            refreshPlannerUI();
            return;
        }

        const plannerTabButton = e.target.closest('[data-planner-tab]');
        if (plannerTabButton) {
            e.preventDefault();
            e.stopPropagation();
            const requestedTab = plannerTabButton.dataset.plannerTab;
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
            return;
        }
        if (action === 'set-encounter-crisis') {
            setDebugEncounterNumericField('crisis', input.value);
        }
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
        const mapViewApi = getOverviewMapViewApi();
        if (!mapViewApi || typeof mapViewApi.create !== 'function') return null;
        return mapViewApi.create({
            appState,
            getCanvas: () => canvas,
            getNodeData,
            getMapNodes,
            getMapTopology,
            getRenderedMapTopology,
            isConnectionVisibleInMapFog,
            getCurrentNodeData,
            isBossNodeId,
            isFinaleNodeId,
            getCampaignTotalNodes,
            isVisitedConnection,
            updateMapUI,
            applyAutoMacroLayout,
            syncLayerSize,
            fitLayerToViewport,
            centerViewportOnCurrentFocus
        });
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

    overviewMapView = createOverviewMapView();
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
