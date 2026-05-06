(function initAce0OverviewExecutionRuntime(global) {
    'use strict';

    function executeTokenEffect(ctx, token) {
        if (!token) return;
        const amount = Math.max(1, Math.min(3, Math.round(Number(token.amount) || 1)));
        if (token.key === 'rest') {
            ctx.appState.resources.mana = Math.min(100, ctx.appState.resources.mana + 30 * amount);
            return;
        }
    }

    function enterRouteChoiceState(ctx) {
        ctx.resetSelection();
        ctx.appState.executing = false;
        ctx.appState.drawerOpen = false;
        const currentNodeData = ctx.getCurrentNodeData();
        ctx.appState.awaitingRouteChoice = currentNodeData.nextRouteMode === 'choice' && ctx.getRouteOptions().length > 0;
        ctx.resetPhaseSlots();
        ctx.appState.currentPhaseIndex = ctx.plannerPhases.length;
        ctx.refreshAllUI();
    }

    function advanceToForcedNextNode(ctx) {
        const currentNodeData = ctx.getCurrentNodeData();
        if (currentNodeData.nextRouteMode !== 'forced') return false;
        if (ctx.appState.currentNodeIndex >= ctx.getCampaignTotalNodes()) return false;

        const forcedNodeId = currentNodeData.nextForcedNodeId || ctx.getRouteOptions()[0];
        if (!forcedNodeId) return false;

        const nextRouteHistory = ctx.appState.routeHistory.slice(0, ctx.appState.currentNodeIndex);
        nextRouteHistory.push(forcedNodeId);
        ctx.appState.routeHistory = nextRouteHistory;
        ctx.startNode(ctx.appState.currentNodeIndex + 1, forcedNodeId);
        ctx.markActStateDirty();
        ctx.commitActStateToHost();
        return true;
    }

    function finishNodeExecution(ctx) {
        ctx.clearPendingLimitedTokens();
        if (ctx.shouldGrantReserveGrowthAtEndOfNode()) {
            ctx.grantDailyReserveGrowth(ctx.appState.currentNodeIndex);
        }
        if (advanceToForcedNextNode(ctx)) {
            ctx.refreshAllUI();
            return;
        }
        enterRouteChoiceState(ctx);
    }

    function runPhaseExecution(ctx, index) {
        if (index >= ctx.plannerPhases.length) {
            finishNodeExecution(ctx);
            return;
        }

        ctx.appState.currentPhaseIndex = index;
        if (typeof ctx.getCurrentVisionFixedPhasePrompt === 'function' && ctx.getCurrentVisionFixedPhasePrompt()) {
            ctx.appState.executing = false;
            ctx.refreshAllUI();
            return;
        }
        const phase = ctx.plannerPhases[index];
        const nodeId = ctx.getCurrentNodeData().presentNode;
        const visionReplacement = typeof ctx.getReadyVisionReplacementForPhase === 'function'
            ? ctx.getReadyVisionReplacementForPhase(nodeId, index)
            : null;
        const fixedKind = ctx.getFixedPhaseKind(nodeId, index);
        const token = ctx.appState.phaseSlots[phase.slotId];
        const activeToken = visionReplacement
            ? { key: visionReplacement.key, type: visionReplacement.key.toUpperCase(), source: 'vision', fixed: false, visionReplacement: true }
            : fixedKind
            ? { key: fixedKind, type: fixedKind.toUpperCase(), source: 'fixed', fixed: true }
            : token;
        executeTokenEffect(ctx, activeToken);
        if (visionReplacement && typeof ctx.consumeReadyVisionReplacementLocally === 'function') {
            ctx.consumeReadyVisionReplacementLocally(visionReplacement);
        }
        ctx.refreshAllUI();

        window.setTimeout(() => {
            runPhaseExecution(ctx, index + 1);
        }, activeToken ? 280 : 160);
    }

    function advanceSinglePhase(ctx, options = {}) {
        if (!ctx.areProgressionControlsEnabled()) return;
        if (!ctx.canAdvanceCurrentPhase(options)) return;

        const phaseIndex = ctx.appState.currentPhaseIndex;
        const phase = ctx.plannerPhases[phaseIndex];
        const nodeId = ctx.getCurrentNodeData().presentNode;
        const visionReplacement = typeof ctx.getReadyVisionReplacementForPhase === 'function'
            ? ctx.getReadyVisionReplacementForPhase(nodeId, phaseIndex)
            : null;
        const fixedKind = ctx.getFixedPhaseKind(nodeId, phaseIndex);
        const token = ctx.appState.phaseSlots[phase.slotId];
        const activeToken = visionReplacement
            ? { key: visionReplacement.key, type: visionReplacement.key.toUpperCase(), source: 'vision', fixed: false, visionReplacement: true }
            : fixedKind
            ? { key: fixedKind, type: fixedKind.toUpperCase(), source: 'fixed', fixed: true }
            : token;
        executeTokenEffect(ctx, activeToken);
        if (visionReplacement && typeof ctx.consumeReadyVisionReplacementLocally === 'function') {
            ctx.consumeReadyVisionReplacementLocally(visionReplacement);
        }
        ctx.appState.currentPhaseIndex += 1;

        if (ctx.appState.currentPhaseIndex >= ctx.plannerPhases.length) {
            finishNodeExecution(ctx);
            return;
        }

        ctx.refreshAllUI();
    }

    function executeCurrentNode(ctx) {
        if (!ctx.areProgressionControlsEnabled()) return;
        if (!ctx.canExecuteCurrentNode()) return;
        ctx.appState.executing = true;
        ctx.appState.drawerOpen = false;
        ctx.appState.currentPhaseIndex = 0;
        ctx.resetSelection();
        ctx.refreshAllUI();
        runPhaseExecution(ctx, 0);
    }

    function chooseNextRoute(ctx, nodeId) {
        if (!ctx.isRouteSelectionActive()) return;
        if (!ctx.getRouteOptions().includes(nodeId)) return;
        ctx.appState.routeHistory.push(nodeId);
        ctx.startNode(ctx.appState.currentNodeIndex + 1, nodeId);
        ctx.markActStateDirty();
        ctx.commitActStateToHost();
        ctx.refreshAllUI();
    }

    global.ACE0OverviewExecutionRuntime = Object.freeze({
        executeTokenEffect,
        enterRouteChoiceState,
        advanceToForcedNextNode,
        finishNodeExecution,
        runPhaseExecution,
        advanceSinglePhase,
        executeCurrentNode,
        chooseNextRoute
    });
})(typeof window !== 'undefined' ? window : globalThis);
