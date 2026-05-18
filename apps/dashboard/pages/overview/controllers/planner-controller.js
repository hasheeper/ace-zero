(function initAce0OverviewPlannerController(global) {
    'use strict';

    function create(ctx = {}) {
        const {
            appState,
            selectionState,
            RESOURCE_TYPE_MAP,
            normalizeResourceKey,
            canEditPhaseSlot,
            getOverviewPlannerRuntimeApi,
            createPlannerRuntimeContext,
            getPreferredSourceForKey,
            normalizeRestTintKey,
            getRestTintSource,
            getSelectedRestSlotToken,
            markActStateDirty,
            refreshAllUI,
            refreshPlannerAllocationUI = refreshAllUI,
            refreshPlannerUI,
            openRestTintPopup,
            getTotalInventoryCount
        } = ctx;

    function resetSelection() {
        selectionState.source = null;
        selectionState.type = null;
        selectionState.slotId = null;
        appState.restTintPopupSlotId = '';
    }

    function selectInventoryToken(type) {
        const key = normalizeResourceKey(type, '');
        if (!key) return;
        selectionState.source = 'inventory';
        selectionState.type = key;
        selectionState.slotId = null;
        appState.plannerAddType = key;
        appState.restTintPopupSlotId = '';
    }

    function selectSlotToken(slotId) {
        if (!canEditPhaseSlot(slotId)) return;
        const token = appState.phaseSlots[slotId];
        if (!token) return;
        selectionState.source = 'slot';
        selectionState.type = token.type;
        selectionState.slotId = slotId;
        if (token.key !== 'rest') appState.restTintPopupSlotId = '';
    }

    function consumeInventoryToken(type) {
        const plannerRuntime = getOverviewPlannerRuntimeApi();
        if (plannerRuntime && typeof plannerRuntime.consumeInventoryToken === 'function') {
            return plannerRuntime.consumeInventoryToken(createPlannerRuntimeContext(), type);
        }
        const key = normalizeResourceKey(type, '');
        if (!key) return null;
        const source = getPreferredSourceForKey(key);
        if (!source) return null;
        appState.inventory[key][source] -= 1;
        return { key, type: RESOURCE_TYPE_MAP[key] || key.toUpperCase(), source, amount: 1, sources: [source] };
    }

    function restoreTokenToInventory(token) {
        const plannerRuntime = getOverviewPlannerRuntimeApi();
        if (plannerRuntime && typeof plannerRuntime.restoreTokenToInventory === 'function') {
            plannerRuntime.restoreTokenToInventory(createPlannerRuntimeContext(), token);
            return;
        }
        if (!token) return;
        const amount = Math.max(1, Math.min(3, Math.round(Number(token.amount) || 1)));
        const sources = Array.isArray(token.sources) && token.sources.length
            ? token.sources.slice(0, amount)
            : Array.from({ length: amount }, () => token.source);
        sources.forEach((source) => {
            const bucket = source === 'reserve' ? 'reserve' : 'limited';
            appState.inventory[token.key][bucket] += 1;
        });
        restoreRestTintToInventory(token);
    }

    function restoreRestTintToInventory(token) {
        if (!token || token.key !== 'rest') return;
        const tint = normalizeRestTintKey(token.tint || token.controlType || token.targetKey, '');
        const tintSource = getRestTintSource(token.tintSource);
        if (!tint || !tintSource || !appState.inventory[tint]) return;
        appState.inventory[tint][tintSource] += 1;
        delete token.tint;
        delete token.tintSource;
        delete token.controlType;
        delete token.targetKey;
    }

    function setSelectedRestTint(tintKey) {
        const token = getSelectedRestSlotToken();
        if (!token) return false;
        const slotId = appState.restTintPopupSlotId || selectionState.slotId;
        if (!canEditPhaseSlot(slotId)) return false;
        const nextTint = normalizeRestTintKey(tintKey, 'neutral');
        const currentTint = normalizeRestTintKey(token.tint || token.controlType || token.targetKey, 'neutral');
        if (nextTint === currentTint) return true;

        let nextSource = '';
        if (nextTint !== 'neutral') {
            nextSource = getPreferredSourceForKey(nextTint);
            if (!nextSource) return false;
            appState.inventory[nextTint][nextSource] -= 1;
        }

        restoreRestTintToInventory(token);
        if (nextTint !== 'neutral') {
            token.tint = nextTint;
            token.tintSource = nextSource;
        }
        markActStateDirty();
        refreshPlannerAllocationUI();
        return true;
    }

    function placeInventorySelection(slotId) {
        if (!canEditPhaseSlot(slotId)) return;
        if (selectionState.source !== 'inventory' || !selectionState.type) return;
        const currentToken = appState.phaseSlots[slotId];
        const selectedKey = normalizeResourceKey(selectionState.type, '');
        if (currentToken && currentToken.key === selectedKey && Math.max(1, Math.round(Number(currentToken.amount) || 1)) < 3) {
            const extraToken = consumeInventoryToken(selectionState.type);
            if (!extraToken) return;
            currentToken.amount = Math.max(1, Math.round(Number(currentToken.amount) || 1)) + 1;
            currentToken.sources = Array.isArray(currentToken.sources) ? currentToken.sources : [currentToken.source || 'limited'];
            currentToken.sources.push(extraToken.source);
            currentToken.source = currentToken.sources.includes('limited') ? 'limited' : 'reserve';
            markActStateDirty();
            if (currentToken.key === 'rest') {
                openRestTintPopup(slotId);
            } else {
                if (getTotalInventoryCount(currentToken.key) <= 0) {
                    resetSelection();
                } else {
                    selectInventoryToken(selectionState.type);
                }
            }
            refreshPlannerAllocationUI();
            return;
        }
        const token = consumeInventoryToken(selectionState.type);
        if (!token) return;
        restoreTokenToInventory(appState.phaseSlots[slotId]);
        appState.phaseSlots[slotId] = token;
        markActStateDirty();
        if (token.key === 'rest') {
            openRestTintPopup(slotId);
        } else {
            if (getTotalInventoryCount(token.key) <= 0) {
                resetSelection();
            } else {
                selectInventoryToken(token.type);
            }
        }
        refreshPlannerAllocationUI();
    }

    function moveOrSwapSlotSelection(targetSlotId) {
        if (selectionState.source !== 'slot' || !selectionState.slotId) return;
        const sourceSlotId = selectionState.slotId;
        if (sourceSlotId === targetSlotId) return;
        if (!canEditPhaseSlot(sourceSlotId) || !canEditPhaseSlot(targetSlotId)) return;
        const sourceToken = appState.phaseSlots[sourceSlotId];
        if (!sourceToken) {
            resetSelection();
            refreshPlannerAllocationUI();
            return;
        }

        const targetToken = appState.phaseSlots[targetSlotId];
        appState.phaseSlots[targetSlotId] = sourceToken;
        appState.phaseSlots[sourceSlotId] = targetToken || null;
        markActStateDirty();
        selectSlotToken(targetSlotId);
        refreshPlannerAllocationUI();
    }

    function returnSelectedSlotTokenToInventory() {
        if (selectionState.source !== 'slot' || !selectionState.slotId) return;
        if (!canEditPhaseSlot(selectionState.slotId)) {
            resetSelection();
            refreshPlannerUI();
            return;
        }
        const token = appState.phaseSlots[selectionState.slotId];
        restoreTokenToInventory(token);
        appState.phaseSlots[selectionState.slotId] = null;
        markActStateDirty();
        resetSelection();
        refreshPlannerAllocationUI();
    }

    function removeOnePointFromPhaseSlot(slotId) {
        if (!canEditPhaseSlot(slotId)) return false;
        const token = appState.phaseSlots[slotId];
        if (!token) return false;
        restoreRestTintToInventory(token);
        const amount = Math.max(1, Math.min(3, Math.round(Number(token.amount) || 1)));
        const sources = Array.isArray(token.sources) && token.sources.length
            ? token.sources
            : Array.from({ length: amount }, () => token.source || 'limited');
        const source = sources.pop() || token.source || 'limited';
        const bucket = source === 'reserve' ? 'reserve' : 'limited';
        appState.inventory[token.key][bucket] += 1;
        if (amount <= 1) {
            appState.phaseSlots[slotId] = null;
        } else {
            token.amount = amount - 1;
            token.sources = sources.slice(0, amount - 1);
            token.source = token.sources.includes('limited') ? 'limited' : (token.sources[0] || 'limited');
        }
        selectionState.source = null;
        selectionState.type = null;
        selectionState.slotId = null;
        appState.restTintPopupSlotId = '';
        markActStateDirty();
        refreshPlannerAllocationUI();
        return true;
    }

    return Object.freeze({
        resetSelection,
        selectInventoryToken,
        selectSlotToken,
        setSelectedRestTint,
        placeInventorySelection,
        moveOrSwapSlotSelection,
        returnSelectedSlotTokenToInventory,
        removeOnePointFromPhaseSlot
    });
    }

    global.ACE0OverviewPlannerController = Object.freeze({ create });
})(typeof window !== 'undefined' ? window : globalThis);
