(function initAce0OverviewDebugConfig(global) {
    'use strict';

    const registry = global.ACE0_OVERVIEW_CONFIGS && typeof global.ACE0_OVERVIEW_CONFIGS === 'object'
        ? global.ACE0_OVERVIEW_CONFIGS
        : (global.ACE0_OVERVIEW_CONFIGS = {});

    registry.debug = Object.freeze({
        chapterId: 'chapter0_exchange',
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
})(typeof window !== 'undefined' ? window : globalThis);
