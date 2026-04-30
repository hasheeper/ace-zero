(function initAce0OverviewTavernConfig(global) {
    'use strict';

    const registry = global.ACE0_OVERVIEW_CONFIGS && typeof global.ACE0_OVERVIEW_CONFIGS === 'object'
        ? global.ACE0_OVERVIEW_CONFIGS
        : (global.ACE0_OVERVIEW_CONFIGS = {});

    registry.tavern = Object.freeze({
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
})(typeof window !== 'undefined' ? window : globalThis);
