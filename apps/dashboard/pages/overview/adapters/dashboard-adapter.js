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
        const {
            adapterState,
            appData,
            appState,
            DASHBOARD_DEBUG_STORAGE_KEY,
            DASHBOARD_DEBUG_GLOBAL_PAYLOAD_KEY,
            DASHBOARD_DEBUG_GLOBAL_SNAPSHOT_KEY,
            DASHBOARD_DEBUG_GLOBAL_ACT_STATE_KEY,
            DEFAULT_DASHBOARD_CHAPTER_ID = 'chapter0_exchange',
            applyOverviewFallbackCampaignProfile = () => {},
            applyActStateFromPayload = () => false,
            applyDebugUrlOverridesToActState = (actState) => actState,
            createDefaultActStateForDashboard = () => ({}),
            createFrontendSnapshotForActState = () => null,
            deepCloneValue = (value) => value,
            extractHeroPayload = () => null,
            extractWorldPayload = () => null,
            getSearchParams = () => new URLSearchParams(''),
            hasUsableCampaignNodes = () => false,
            isTruthyQueryValue = () => false,
            getCommitIdleStatusText = () => 'SYNCED'
        } = ctx;

        function readStoredDebugPayload() {
            return readStoredJson(DASHBOARD_DEBUG_STORAGE_KEY);
        }

        function writeStoredDebugPayload(payload) {
            writeStoredJson(DASHBOARD_DEBUG_STORAGE_KEY, payload);
        }

        function clearStoredDebugPayload() {
            clearStoredJson(DASHBOARD_DEBUG_STORAGE_KEY);
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
            const globalPayload = global[DASHBOARD_DEBUG_GLOBAL_PAYLOAD_KEY];
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

            const globalActState = global[DASHBOARD_DEBUG_GLOBAL_ACT_STATE_KEY];
            if (globalActState && typeof globalActState === 'object') {
                return createDebugPayloadFromActState(applyDebugUrlOverridesToActState(globalActState));
            }

            const globalSnapshot = global[DASHBOARD_DEBUG_GLOBAL_SNAPSHOT_KEY];
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
            const forcedMode = typeof global.ACE0_OVERVIEW_BOOT_MODE === 'string'
                ? global.ACE0_OVERVIEW_BOOT_MODE.trim().toLowerCase()
                : '';
            if (forcedMode === 'host') return false;
            if (forcedMode === 'debug') return true;
            const params = getSearchParams();
            if (isTruthyQueryValue(params.get('debug'))) return true;
            if (isTruthyQueryValue(params.get('host'))) return false;
            if (global[DASHBOARD_DEBUG_GLOBAL_PAYLOAD_KEY] || global[DASHBOARD_DEBUG_GLOBAL_SNAPSHOT_KEY] || global[DASHBOARD_DEBUG_GLOBAL_ACT_STATE_KEY]) {
                return true;
            }
            try {
                if (global.parent && global.parent !== global) return false;
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
                    const world = commitPayload?.world && typeof commitPayload.world === 'object'
                        ? deepCloneValue(commitPayload.world)
                        : {};
                    const debugPayload = {
                        ...(adapterState.lastPayload || {}),
                        ...deepCloneValue(commitPayload),
                        world,
                        frontendSnapshot: createFrontendSnapshotForActState(world?.act || createDefaultActStateForDashboard())
                    };
                    writeStoredDebugPayload(debugPayload);
                    applyActStateFromPayload(debugPayload);
                    return {
                        ok: true,
                        requestId: commitPayload?.requestId || '',
                        mode: 'debug',
                        statusText: getCommitIdleStatusText()
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

        return Object.freeze({
            postMessageToHost,
            resolveDirectActCommitBridge() {
                return resolveDirectBridge(ctx.actCommitBridgeName || 'ACE0DashboardCommitActState');
            },
            resolveDirectAssetDeckCommandBridge() {
                return resolveDirectBridge(ctx.assetDeckBridgeName || 'ACE0DashboardApplyAssetDeckCommand');
            },
            writeStoredDebugPayload,
            clearStoredDebugPayload,
            extractFrontendSnapshot,
            buildNormalizedDashboardPayload,
            createDebugPayloadFromActState,
            buildInitialDebugPayload,
            normalizeHostPayload,
            ensureDashboardAdapter,
            switchDashboardAdapter
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
