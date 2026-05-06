(function initAce0OverviewDashboardAdapter(global) {
    'use strict';

    function collectHostWindows() {
        const targets = [];
        try {
            if (global.parent && global.parent !== global) targets.push(global.parent);
        } catch (_) {}
        try {
            if (global.top && global.top !== global && !targets.includes(global.top)) targets.push(global.top);
        } catch (_) {}
        return targets;
    }

    function collectBridgeCandidates() {
        const candidates = [global];
        collectHostWindows().forEach((target) => {
            if (!candidates.includes(target)) candidates.push(target);
        });
        return candidates;
    }

    function postMessageToHost(message) {
        const targets = collectHostWindows();
        targets.forEach((targetWindow) => {
            try {
                targetWindow.postMessage(message, '*');
            } catch (error) {
                console.warn('[ACE0 ACT] postMessage failed:', error);
            }
        });
        return targets.length > 0;
    }

    function resolveDirectBridge(functionName) {
        if (typeof functionName !== 'string' || !functionName.trim()) return null;
        for (const candidate of collectBridgeCandidates()) {
            try {
                if (typeof candidate[functionName] === 'function') {
                    return candidate[functionName].bind(candidate);
                }
            } catch (_) {}
        }
        return null;
    }

    function readStoredJson(storageKey) {
        try {
            const raw = global.localStorage?.getItem(storageKey);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : null;
        } catch (_) {
            return null;
        }
    }

    function writeStoredJson(storageKey, payload) {
        try {
            global.localStorage?.setItem(storageKey, JSON.stringify(payload));
        } catch (_) {}
    }

    function clearStoredJson(storageKey) {
        try {
            global.localStorage?.removeItem(storageKey);
        } catch (_) {}
    }

    function extractFrontendSnapshot(payload) {
        if (!payload || typeof payload !== 'object') return null;
        if (payload.frontendSnapshot && typeof payload.frontendSnapshot === 'object') return payload.frontendSnapshot;
        if (payload.data?.frontendSnapshot && typeof payload.data.frontendSnapshot === 'object') return payload.data.frontendSnapshot;
        if (payload.payload?.frontendSnapshot && typeof payload.payload.frontendSnapshot === 'object') return payload.payload.frontendSnapshot;
        return null;
    }

    function create(ctx = {}) {
        return Object.freeze({
            postMessageToHost,
            resolveDirectActCommitBridge() {
                return resolveDirectBridge(ctx.actCommitBridgeName || 'ACE0DashboardCommitActState');
            },
            resolveDirectAssetDeckCommandBridge() {
                return resolveDirectBridge(ctx.assetDeckBridgeName || 'ACE0DashboardApplyAssetDeckCommand');
            }
        });
    }

    global.ACE0OverviewDashboardAdapter = Object.freeze({
        create,
        collectHostWindows,
        postMessageToHost,
        resolveDirectBridge,
        readStoredJson,
        writeStoredJson,
        clearStoredJson,
        extractFrontendSnapshot
    });
})(typeof window !== 'undefined' ? window : globalThis);
