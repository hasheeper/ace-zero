(function initAce0OverviewCore(global) {
    'use strict';

    const OVERVIEW_CONFIG_REGISTRY = (global.ACE0_OVERVIEW_CONFIGS && typeof global.ACE0_OVERVIEW_CONFIGS === 'object')
        ? global.ACE0_OVERVIEW_CONFIGS
        : {};
    const DEFAULT_DASHBOARD_CHAPTER_ID = 'chapter0_exchange';

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
            const forcedMode = typeof global.ACE0_OVERVIEW_BOOT_MODE === 'string'
                ? global.ACE0_OVERVIEW_BOOT_MODE.trim().toLowerCase()
                : '';
            if (forcedMode === 'host' || forcedMode === 'debug') return forcedMode;
        } catch (_) {}

        try {
            const params = new URLSearchParams(global.location?.search || '');
            const debugValue = typeof params.get('debug') === 'string' ? params.get('debug').trim().toLowerCase() : '';
            if (['1', 'true', 'yes', 'on', 'debug'].includes(debugValue)) return 'debug';
        } catch (_) {}

        try {
            if (global.__ACE0_DEBUG_PAYLOAD__ || global.__ACE0_DEBUG_SNAPSHOT__ || global.__ACE0_DEBUG_ACT_STATE__) {
                return 'debug';
            }
        } catch (_) {}

        try {
            if (global.localStorage?.getItem('ace0.dashboard.debugPayload')) return 'debug';
        } catch (_) {}

        try {
            if (global.parent && global.parent !== global) return 'host';
        } catch (_) {}

        return 'debug';
    }

    const INITIAL_OVERVIEW_MODE = detectInitialOverviewMode();

    function canUseOverviewFallbackData(mode = INITIAL_OVERVIEW_MODE) {
        return mode !== 'host';
    }

    global.ACE0OverviewCore = Object.freeze({
        DEFAULT_DASHBOARD_CHAPTER_ID,
        DEFAULT_DEBUG_CONFIG,
        DEFAULT_TAVERN_CONFIG,
        INITIAL_OVERVIEW_MODE,
        cloneOverviewConfigValue,
        getOverviewConfigProfile,
        getOverviewFallbackCampaign,
        getOverviewFallbackFixedPhaseMarkers,
        hasUsableCampaignNodes,
        detectInitialOverviewMode,
        canUseOverviewFallbackData
    });
})(typeof window !== 'undefined' ? window : globalThis);
