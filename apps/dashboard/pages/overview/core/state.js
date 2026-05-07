(function initAce0OverviewState(global) {
    'use strict';

    function create(core = {}) {
        const {
            INITIAL_OVERVIEW_MODE = 'debug',
            getOverviewFallbackCampaign = () => ({ seed: '', totalNodes: 1, rules: {}, reserveGrowthByNode: [], days: [] })
        } = core;

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
                assets: 0,
                mana: 45,
                majorDebt: 395000000,
                debt: 0
            }
        };

        return {
            appData,
            appState,
            INITIAL_RESOURCES: { ...appState.resources },
            selectionState: { source: null, type: null, slotId: null },
            syncState: {
                dirty: false,
                saving: false,
                pendingRequestId: '',
                pendingTimer: null,
                statusText: 'SYNCED TO MVU',
                errorText: ''
            },
            assetCommandState: {
                pendingRequestId: '',
                pendingTimer: null,
                resolver: null
            },
            adapterState: {
                mode: INITIAL_OVERVIEW_MODE,
                adapter: null,
                lastPayload: null,
                lastFrontendSnapshot: null
            },
            constants: {
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
                ACT_MESSAGE_TYPES: new Set(['ACE0_ACT_INIT', 'ACE0_ACT_REFRESH', 'ACE0_DASHBOARD_INIT', 'ACE0_DASHBOARD_REFRESH']),
                ACT_OUTBOUND_MESSAGE_TYPES: {
                    commit: 'ACE0_ACT_COMMIT',
                    assetCommand: 'ACE0_ASSET_DECK_COMMAND'
                },
                ACT_INBOUND_MESSAGE_TYPES: {
                    commitResult: 'ACE0_ACT_COMMIT_RESULT',
                    assetCommandResult: 'ACE0_ASSET_DECK_COMMAND_RESULT'
                },
                DASHBOARD_DEBUG_STORAGE_KEY: 'ace0.dashboard.debugPayload',
                DASHBOARD_DEBUG_GLOBAL_PAYLOAD_KEY: '__ACE0_DEBUG_PAYLOAD__',
                DASHBOARD_DEBUG_GLOBAL_SNAPSHOT_KEY: '__ACE0_DEBUG_SNAPSHOT__',
                DASHBOARD_DEBUG_GLOBAL_ACT_STATE_KEY: '__ACE0_DEBUG_ACT_STATE__'
            }
        };
    }

    global.ACE0OverviewState = Object.freeze({ create });
})(typeof window !== 'undefined' ? window : globalThis);
