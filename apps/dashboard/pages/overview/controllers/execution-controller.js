(function initAce0OverviewExecutionController(global) {
    'use strict';

    function create(ctx = {}) {
        const {
            adapterState,
            appData,
            appState,
            selectionState,
            areProgressionControlsEnabled,
            buildInitialDebugPayload,
            canAdvanceCurrentPhase,
            canExecuteCurrentNode,
            canUseInteractivePlannerControls,
            clearPendingLimitedTokens,
            closeRestTintPopup,
            commitActStateToHost,
            createDefaultActStateForDashboard,
            createExecutionRuntimeContext,
            deepCloneValue,
            extractWorldPayload,
            getCampaignTotalNodes,
            getCurrentNodeData,
            getCurrentVisionFixedPhasePrompt,
            getFixedPhaseKind,
            getOverviewExecutionRuntimeApi,
            getReadyVisionReplacementForPhase,
            getRouteOptions,
            getTotalInventoryCount,
            grantDailyReserveGrowth,
            isRouteSelectionActive,
            markActStateDirty,
            normalizeResourceKey,
            refreshAllUI,
            refreshPlannerUI,
            resetPhaseSlots,
            resetSelection,
            returnSelectedSlotTokenToInventory,
            selectInventoryToken,
            setPlannerEditMode,
            setPlannerPage,
            setSelectedRestTint,
            shouldGrantReserveGrowthAtEndOfNode,
            startNode,
            syncPlannerOpenState,
            updateActStatePayloadAndCommit
        } = ctx;

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

        global.setTimeout(() => {
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
        const inventoryPanel = global.document.getElementById('inventory');
        const inventoryTokens = Array.from(global.document.querySelectorAll('.token-dispenser'));
        const restTintButtons = Array.from(global.document.querySelectorAll('[data-rest-tint]'));

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

        global.document.querySelectorAll('[data-close-rest-tint]').forEach((button) => {
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
        inventoryPanel?.addEventListener('click', (e) => {
            if (!canUseInteractivePlannerControls()) return;
            if (isRouteSelectionActive() || e.target.closest('.token-dispenser')) return;
            if (selectionState.source !== 'slot') return;
            returnSelectedSlotTokenToInventory();
        });
    }

    return {
        applyCurrentPhaseVisionChoice,
        executeTokenEffect,
        enterRouteChoiceState,
        advanceToForcedNextNode,
        finishNodeExecution,
        runPhaseExecution,
        consumeReadyVisionReplacementLocally,
        advanceSinglePhase,
        executeCurrentNode,
        chooseNextRoute,
        bindPlannerEvents
    };
    }

    global.ACE0OverviewExecutionController = { create };
})(window);
