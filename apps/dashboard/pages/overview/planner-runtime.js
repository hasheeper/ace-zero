(function initAce0OverviewPlannerRuntime(global) {
    'use strict';

    function getInventoryBucket(ctx, key) {
        return ctx.appState.inventory[key] || { reserve: 0, limited: 0 };
    }

    function normalizeRestTintKey(ctx, value) {
        const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
        return ctx.resourceKeys.includes(normalized) ? normalized : '';
    }

    function getTotalInventoryCount(ctx, key) {
        const bucket = getInventoryBucket(ctx, key);
        return bucket.reserve + bucket.limited;
    }

    function getAllocatedCounts(ctx) {
        const counts = Object.fromEntries(ctx.resourceKeys.map((key) => [key, 0]));
        Object.values(ctx.appState.phaseSlots).forEach((token) => {
            if (!token) return;
            counts[token.key] += Math.max(1, Math.min(3, Math.round(Number(token.amount) || 1)));
        });
        return counts;
    }

    function getPendingLimitedCount(ctx) {
        const currentNodeId = ctx.getCurrentNodeData().presentNode;
        const remainingFixedByKey = Object.fromEntries(ctx.resourceKeys.map((key) => [key, 0]));

        ctx.plannerPhases
            .slice(ctx.appState.currentPhaseIndex)
            .forEach((phase, relativeIndex) => {
                const absolutePhaseIndex = ctx.appState.currentPhaseIndex + relativeIndex;
                const fixedKind = ctx.getFixedPhaseKind(currentNodeId, absolutePhaseIndex);
                if (!fixedKind) return;
                remainingFixedByKey[fixedKind] += 1;
            });

        return ctx.resourceKeys.reduce((sum, key) => {
            const limited = getInventoryBucket(ctx, key).limited;
            const coveredByFixed = Math.min(limited, remainingFixedByKey[key] || 0);
            return sum + Math.max(0, limited - coveredByFixed);
        }, 0);
    }

    function shouldRequireAllLimitedScheduling(ctx) {
        return Boolean(ctx.getCampaignRules().requireScheduleAllLimited);
    }

    function isRouteSelectionActive(ctx) {
        return ctx.appState.awaitingRouteChoice === true;
    }

    function isPlanningPhase(ctx) {
        return !ctx.appState.executing
            && !ctx.appState.awaitingRouteChoice
            && ctx.appState.currentPhaseIndex === 0;
    }

    function canExecuteCurrentNode(ctx) {
        if (!ctx.areProgressionControlsEnabled() || !ctx.canUseNodeAdvanceControl()) return false;
        if (ctx.appState.executing || isRouteSelectionActive(ctx)) return false;
        if (!shouldRequireAllLimitedScheduling(ctx)) return true;
        return getPendingLimitedCount(ctx) === 0;
    }

    function shouldGrantReserveGrowthAtEndOfNode(ctx) {
        return ctx.getCampaignRules().reserveGrowthTiming === 'end_of_node';
    }

    function shouldGrantReserveGrowthAtStartOfNode(ctx) {
        return ctx.getCampaignRules().reserveGrowthTiming === 'start_of_node';
    }

    function clearPendingLimitedTokens(ctx) {
        ctx.resourceKeys.forEach((key) => {
            ctx.appState.inventory[key].limited = 0;
        });
    }

    function hasRemainingScheduledPhases(ctx) {
        return ctx.plannerPhases
            .slice(ctx.appState.currentPhaseIndex)
            .some((phase) => Boolean(ctx.appState.phaseSlots[phase.slotId]));
    }

    function canAdvanceCurrentPhase(ctx, options = {}) {
        if (!ctx.areProgressionControlsEnabled() || !ctx.canUsePhaseAdvanceControl()) return false;
        if (ctx.appState.executing || isRouteSelectionActive(ctx)) return false;
        if (ctx.appState.currentPhaseIndex > ctx.plannerPhases.length - 1) return false;
        if (!options.bypassVisionPrompt && typeof ctx.getCurrentVisionFixedPhasePrompt === 'function' && ctx.getCurrentVisionFixedPhasePrompt()) return false;
        return true;
    }

    function getPhaseSlotIndex(ctx, slotId) {
        return ctx.plannerPhases.findIndex((phase) => phase.slotId === slotId);
    }

    function canEditPhaseSlot(ctx, slotId) {
        if (ctx.appState.awaitingRouteChoice) return false;
        const phaseIndex = getPhaseSlotIndex(ctx, slotId);
        if (phaseIndex < 0) return false;
        if (ctx.getFixedPhaseKind(ctx.getCurrentNodeData().presentNode, phaseIndex)) return false;
        return phaseIndex >= ctx.appState.currentPhaseIndex;
    }

    function getPreferredSourceForKey(ctx, key) {
        const bucket = getInventoryBucket(ctx, key);
        if (bucket.limited > 0) return 'limited';
        if (bucket.reserve > 0) return 'reserve';
        return null;
    }

    function grantDailyReserveGrowth(ctx, nodeIndex) {
        const fallbackGrowth = ctx.getCampaignReserveGrowthByNode()[nodeIndex - 1] ?? 0;
        ctx.resourceKeys.forEach((key) => {
            const growth = Number(ctx.appState.incomeRate?.[key]);
            const normalizedGrowth = Number.isFinite(growth) ? Math.max(0, Math.min(1.5, growth)) : fallbackGrowth;
            if (!ctx.appState.incomeProgress) ctx.appState.incomeProgress = {};
            if (!Number.isFinite(Number(ctx.appState.incomeProgress[key]))) ctx.appState.incomeProgress[key] = 0;
            ctx.appState.incomeProgress[key] += normalizedGrowth;
            while (ctx.appState.incomeProgress[key] >= 1) {
                ctx.appState.incomeProgress[key] -= 1;
                ctx.appState.inventory[key].reserve += 1;
            }
            // Legacy dashboard reserveProgress remains for older snapshots and UI debug payloads.
            ctx.appState.reserveProgress[key] += normalizedGrowth;
            while (ctx.appState.reserveProgress[key] >= 1) {
                ctx.appState.reserveProgress[key] -= 1;
            }
        });
    }

    function grantDailyLimitedPoints(ctx, nodeData) {
        nodeData.limited.forEach((entry) => {
            ctx.appState.inventory[entry.key].limited += entry.count;
        });
    }

    function resetPhaseSlots(ctx) {
        ctx.phaseSlotIds.forEach((slotId) => {
            ctx.appState.phaseSlots[slotId] = null;
        });
        ctx.appState.currentPhaseIndex = 0;
    }

    function startNode(ctx, nodeIndex, nodeId = ctx.appState.currentNodeId) {
        const nodeTemplate = ctx.getNodeTemplate(nodeIndex);
        ctx.appState.currentNodeIndex = nodeIndex;
        ctx.appState.currentNodeId = ctx.getSelectableNodeIds(nodeTemplate).includes(nodeId)
            ? nodeId
            : ctx.getDefaultPresentNodeId(nodeTemplate) || nodeId;
        ctx.appState.executing = false;
        ctx.appState.awaitingRouteChoice = false;
        resetPhaseSlots(ctx);
        if (shouldGrantReserveGrowthAtStartOfNode(ctx)) {
            grantDailyReserveGrowth(ctx, nodeIndex);
        }
        const nodeData = ctx.getCurrentNodeData();
        grantDailyLimitedPoints(ctx, nodeData);
        if (typeof ctx.setCurrentFocusNodeId === 'function') {
            ctx.setCurrentFocusNodeId(nodeData.mapFocus);
        }
        return nodeData;
    }

    function consumeInventoryToken(ctx, type) {
        const key = type.toLowerCase();
        const source = getPreferredSourceForKey(ctx, key);
        if (!source) return null;
        ctx.appState.inventory[key][source] -= 1;
        return { key, type, source, amount: 1, sources: [source] };
    }

    function restoreTokenToInventory(ctx, token) {
        if (!token) return;
        const amount = Math.max(1, Math.min(3, Math.round(Number(token.amount) || 1)));
        const sources = Array.isArray(token.sources) && token.sources.length
            ? token.sources.slice(0, amount)
            : Array.from({ length: amount }, () => token.source);
        sources.forEach((source) => {
            const bucket = source === 'reserve' ? 'reserve' : 'limited';
            ctx.appState.inventory[token.key][bucket] += 1;
        });
        const tint = token.key === 'rest'
            ? normalizeRestTintKey(ctx, token.tint || token.controlType || token.targetKey)
            : '';
        const tintSource = token.tintSource === 'reserve' ? 'reserve' : (token.tintSource === 'limited' ? 'limited' : '');
        if (tint && tintSource && ctx.appState.inventory[tint]) {
            ctx.appState.inventory[tint][tintSource] += 1;
        }
    }

    global.ACE0OverviewPlannerRuntime = Object.freeze({
        getInventoryBucket,
        getTotalInventoryCount,
        getAllocatedCounts,
        getPendingLimitedCount,
        shouldRequireAllLimitedScheduling,
        isRouteSelectionActive,
        isPlanningPhase,
        canExecuteCurrentNode,
        shouldGrantReserveGrowthAtEndOfNode,
        shouldGrantReserveGrowthAtStartOfNode,
        clearPendingLimitedTokens,
        hasRemainingScheduledPhases,
        canAdvanceCurrentPhase,
        getPhaseSlotIndex,
        canEditPhaseSlot,
        getPreferredSourceForKey,
        grantDailyReserveGrowth,
        grantDailyLimitedPoints,
        resetPhaseSlots,
        startNode,
        consumeInventoryToken,
        restoreTokenToInventory
    });
})(typeof window !== 'undefined' ? window : globalThis);
