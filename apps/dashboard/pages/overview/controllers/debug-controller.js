(function initAce0OverviewDebugController(global) {
    'use strict';

    function create(ctx = {}) {
        const {
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
            extractHeroPayload,
            extractWorldPayload,
            getActModuleApi,
            getCampaignTotalNodes,
            getCurrentChapterId,
            getCurrentEncounterDebugContext,
            getCurrentNodeData,
            getCurrentVisionFixedPhasePrompt,
            getCurrentWorldLocation,
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
        } = ctx;

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

    function setDebugEncounterNumericField(_field, value) {
        const numeric = Math.max(0, Math.round(Number(value) || 0));
        return updateDebugEncounterContext((context) => ({
            ...context,
            funds: numeric
        }));
    }

    function resetDebugActState() {
        if (!isOverviewDebugMode()) return false;
        if (global.ACE0DashboardDebug && typeof global.ACE0DashboardDebug.reset === 'function') {
            global.ACE0DashboardDebug.reset();
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

    return {
        getDebugChapterTransitionOption,
        enterNextChapterInDebug,
        grantDebugResource,
        getDebugEncounterContext,
        scanDebugEncounters,
        autoAddEligibleEncounter,
        forceDebugEncounter,
        clearDebugEncounterQueue,
        setDebugWorldLocationLayer,
        updateDebugEncounterContext,
        toggleDebugEncounterTag,
        toggleDebugEncounterFlag,
        setDebugEncounterNumericField,
        resetDebugActState,
        advanceDebugActWithModule,
        advanceDebugActSafely,
        advanceDebugNode,
        handleDebugActAction
    };
    }

    global.ACE0OverviewDebugController = { create };
})(window);
