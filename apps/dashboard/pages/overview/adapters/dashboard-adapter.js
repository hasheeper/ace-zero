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
            getAssetDeckModuleApi = () => null,
            getSearchParams = () => new URLSearchParams(''),
            hasUsableCampaignNodes = () => false,
            isTruthyQueryValue = () => false,
            normalizeAssetDeckForDashboard = (assetDeck) => assetDeck,
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
            const reserveSource = actState.reserve && typeof actState.reserve === 'object' && !Array.isArray(actState.reserve)
                ? actState.reserve
                : {};
            let assetPoints = Math.max(0, Math.round(Number(reserveSource.asset) || 0));
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
                        seed: `debug-act:${pending.id || [actState.id || 'act', pending.nodeId || 'node', pending.nodeIndex || 0, pending.phaseIndex || 0, command.kind || command.type || 'command'].join(':')}`,
                        assetPoints
                    });
                } catch (error) {
                    result = { ok: false, code: 'asset_command_error', error: error?.message || String(error) };
                }

                if (result?.assetDeck) assetDeck = normalizeAssetDeckForDashboard(result.assetDeck);
                if (Number.isFinite(Number(result?.assetPoints))) {
                    assetPoints = Math.max(0, Math.round(Number(result.assetPoints) || 0));
                }
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
                        error: result?.error || ''
                    }
                });
                consumedIds.add(pending.id);
            });

            actState.pendingAssetDeckCommands = pendingCommands.filter((item) => !consumedIds.has(item.id));
            actState.resolutionHistory = resolutionHistory;
            actState.reserve = {
                combat: Math.max(0, Number(reserveSource.combat) || 0),
                rest: Math.max(0, Number(reserveSource.rest) || 0),
                asset: assetPoints,
                vision: Math.max(0, Number(reserveSource.vision) || 0)
            };
            world.act = actState;
            world.assetDeck = assetDeck;
            return world;
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
            normalizePendingAssetDeckCommandsForDashboard,
            settlePendingActAssetDeckCommandsForDashboardWorld,
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
