(function initAce0OverviewAssetAdapter(global) {
    'use strict';

    function create(ctx = {}) {
        const {
            adapterState,
            appData,
            appState,
            syncState,
            assetCommandState,
            ACT_OUTBOUND_MESSAGE_TYPES,
            buildInitialDebugPayload,
            buildNormalizedDashboardPayload,
            applyActStateFromPayload,
            deepCloneValue,
            extractWorldPayload,
            getCommitIdleStatusText,
            getCurrentWorldPayload,
            isOverviewDebugMode,
            postActMessageToHost,
            refreshPlannerUI,
            resolveDirectAssetDeckCommandBridge,
            setPlannerPage,
            updateWorldPayloadAndCommit
        } = ctx;

    function collectAssetBridgeCandidates() {
        const candidates = [global];
        try {
            if (global.parent && global.parent !== global) candidates.push(global.parent);
        } catch (_) {}
        try {
            if (global.top && global.top !== global && !candidates.includes(global.top)) candidates.push(global.top);
        } catch (_) {}
        if (typeof globalThis === 'object' && globalThis && !candidates.includes(globalThis)) candidates.push(globalThis);
        return candidates;
    }

    function getAssetDeckModuleApi() {
        for (const candidate of collectAssetBridgeCandidates()) {
            try {
                const assetModule = candidate?.ACE0Modules?.assetDeck;
                if (assetModule && typeof assetModule.applyAssetDeckCommand === 'function') return assetModule;
            } catch (_) {}
        }
        return null;
    }

    function getAssetSummaryModuleApi() {
        for (const candidate of collectAssetBridgeCandidates()) {
            try {
                const assetSummary = candidate?.ACE0Modules?.assetSummary;
                if (assetSummary && typeof assetSummary.buildAssetDeckSummary === 'function') return assetSummary;
            } catch (_) {}
        }
        return null;
    }

    function createFallbackAssetDeckState() {
        return {
            slots: { general: 4, void: 2 },
            bag: { general: [], void: [] },
            offer: null
        };
    }

    function normalizeAssetDeckForDashboard(rawAssetDeck) {
        const assetModule = getAssetDeckModuleApi();
        if (assetModule && typeof assetModule.normalizeAssetDeckState === 'function') {
            try {
                return assetModule.normalizeAssetDeckState(rawAssetDeck);
            } catch (error) {
                console.warn('[ACE0 AssetDeck] normalize failed:', error);
            }
        }
        const source = rawAssetDeck && typeof rawAssetDeck === 'object' && !Array.isArray(rawAssetDeck) ? rawAssetDeck : {};
        return {
            ...createFallbackAssetDeckState(),
            ...deepCloneValue(source),
            slots: {
                general: Math.max(0, Math.min(8, Math.round(Number(source.slots?.general) || 4))),
                void: Math.max(0, Math.min(2, Math.round(Number(source.slots?.void) || 2)))
            },
            bag: {
                general: Array.isArray(source.bag?.general) ? deepCloneValue(source.bag.general) : [],
                void: Array.isArray(source.bag?.void) ? deepCloneValue(source.bag.void) : []
            },
            offer: source.offer && typeof source.offer === 'object' && !Array.isArray(source.offer)
                ? deepCloneValue(source.offer)
                : null
        };
    }

    function getCurrentAssetDeckState() {
        const world = getCurrentWorldPayload();
        return normalizeAssetDeckForDashboard(world?.assetDeck);
    }

    function getAssetPendingOfferIdentity(assetDeckInput) {
        const normalized = normalizeAssetDeckForDashboard(assetDeckInput);
        const offer = normalized.offer;
        if (!offer || typeof offer !== 'object') return '';
        return [
            offer.id || '',
            offer.pool || '',
            offer.floor || '',
            offer.settled === true ? 'settled' : 'open',
            Array.isArray(offer.choices) ? offer.choices.map((card) => card?.id || card?.cardId || '').join(',') : '',
            Array.isArray(offer.reroll) ? offer.reroll.map((card) => card?.id || card?.cardId || '').join(',') : ''
        ].join('|');
    }

    function getDashboardAssetSummaryGameId() {
        return 'texas-holdem';
    }

    function buildFallbackAssetDeckSummary(assetDeck, gameId = getDashboardAssetSummaryGameId()) {
        const normalized = normalizeAssetDeckForDashboard(assetDeck);
        const assetModule = getAssetDeckModuleApi();
        const catalog = assetModule && typeof assetModule.getCatalog === 'function' ? assetModule.getCatalog() : [];
        const catalogList = Array.isArray(catalog) ? catalog : [];
        const summarizeCard = (cardInput, slotType, slotIndex) => {
            const card = cardInput && typeof cardInput === 'object' && !Array.isArray(cardInput) ? cardInput : {};
            const cardId = String(card.cardId || card.id || '').trim();
            const meta = catalogList.find((item) => item && String(item.id || item.cardId || '').trim() === cardId) || {};
            const modifiers = Array.isArray(card.modifiers || meta.modifiers) ? deepCloneValue(card.modifiers || meta.modifiers) : [];
            const kind = String(card.kind || meta.kind || 'numeric').trim().toLowerCase() || 'numeric';
            const system = String(card.system || meta.system || '').trim().toLowerCase();
            const skillKey = String(card.skillKey || meta.skillKey || card.upgradeTargetSkillKey || meta.upgradeTargetSkillKey || '').trim();
            const level = Math.max(0, Math.round(Number((card.level ?? card.lv) ?? meta.level) || 0));
            const gameTags = Array.isArray(card.gameTags || meta.gameTags) ? deepCloneValue(card.gameTags || meta.gameTags) : [];
            const slotTags = Array.isArray(card.slotTags || meta.slotTags) ? deepCloneValue(card.slotTags || meta.slotTags) : [slotType || 'general'];
            const effective = !gameTags.length || gameTags.includes('any') || gameTags.includes('general') || gameTags.includes(gameId) || gameTags.includes('texas') || gameTags.includes('texas-holdem');
            const statusTags = [
                kind === 'skill' ? '技能唯一' : '可叠加',
                slotTags.includes('void') ? 'VOID槽' : '',
                gameTags.includes('texas') || gameTags.includes('texas-holdem') ? 'Texas' : '',
                skillKey ? `目标:${skillKey.replace(/_/g, ' ')}` : '',
                effective ? '' : '未生效'
            ].filter(Boolean).slice(0, 5);
            const effectText = String(card.effectText || '').trim()
                || (kind === 'skill' && skillKey ? `${skillKey.replace(/_/g, ' ')} ${level > 0 ? `LV ${level}` : ''}`.trim() : '')
                || (modifiers[0] && String(modifiers[0].type || modifiers[0].kind || '').replace(/_/g, ' '))
                || kind.replace(/_/g, ' ')
                || 'Asset effect';
            return {
                instanceId: card.instanceId || '',
                cardId,
                name: card.name || meta.name || cardId || 'Asset Card',
                rarity: String(card.rarity || meta.rarity || 'bronze').trim().toLowerCase() || 'bronze',
                kind,
                system,
                skillKey,
                level,
                gameTags,
                slotTags,
                slotType,
                slotIndex,
                effective,
                effectText,
                statusTags,
                modifiers
            };
        };
        const generalCards = Array.isArray(normalized.bag?.general)
            ? normalized.bag.general.map((card, index) => summarizeCard(card, 'general', index))
            : [];
        const voidCards = Array.isArray(normalized.bag?.void)
            ? normalized.bag.void.map((card, index) => summarizeCard(card, 'void', index))
            : [];
        const allCards = [...generalCards, ...voidCards];
        const summarizeOffer = (offerInput) => {
            if (!offerInput || typeof offerInput !== 'object' || Array.isArray(offerInput)) return null;
            const choices = Array.isArray(offerInput.choices)
                ? offerInput.choices.map((card, index) => summarizeCard(card, 'offer', index))
                : [];
            if (!choices.length) return null;
            return {
                ...deepCloneValue(offerInput),
                choices
            };
        };
        return {
            gameId,
            mode: isOverviewDebugMode() ? 'debug' : 'host',
            points: Math.max(0, Math.round(Number(appState.resources.assets) || 0)),
            slots: {
                generalUsed: generalCards.length,
                generalMax: Math.max(0, Math.round(Number(normalized.slots?.general) || 0)),
                voidUsed: voidCards.length,
                voidMax: Math.max(0, Math.round(Number(normalized.slots?.void) || 0))
            },
            activeCards: {
                general: generalCards,
                void: voidCards,
                all: allCards,
                effective: allCards,
                inactive: []
            },
            counts: {
                active: allCards.length,
                effective: allCards.length,
                inactive: 0
            },
            pending: {
                offer: summarizeOffer(normalized.offer),
                offerQueue: [],
                replace: null
            },
            recentHistory: [],
            gameplay: {
                skillLevels: [],
                mana: [],
                cost: [],
                forcePower: [],
                passive: [],
                miniGame: {}
            },
            ...(isOverviewDebugMode() ? { debug: { fallback: true } } : {})
        };
    }

    function getCurrentAssetDeckSummary(gameId = getDashboardAssetSummaryGameId()) {
        const assetDeck = getCurrentAssetDeckState();
        const summaryModule = getAssetSummaryModuleApi();
        if (summaryModule && typeof summaryModule.buildAssetDeckSummary === 'function') {
            try {
                return summaryModule.buildAssetDeckSummary(assetDeck, {
                    gameId,
                    mode: isOverviewDebugMode() ? 'debug' : 'host'
                });
            } catch (error) {
                console.warn('[ACE0 AssetDeck] summary failed:', error);
            }
        }
        return buildFallbackAssetDeckSummary(assetDeck, gameId);
    }

    function buildPhaseBoundAssetSeed(kind, extra = {}) {
        const world = getCurrentWorldPayload();
        const actState = world?.act && typeof world.act === 'object' && !Array.isArray(world.act) ? world.act : {};
        const routeHistory = Array.isArray(actState.route_history) ? actState.route_history : [];
        const nodeId = String(actState.nodeId || routeHistory[routeHistory.length - 1] || 'node').trim() || 'node';
        const nodeIndex = Math.max(1, Math.round(Number(actState.nodeIndex) || 1));
        const phaseIndex = Math.max(0, Math.min(3, Math.round(Number(actState.phase_index) || 0)));
        const phaseNo = phaseIndex + 1;
        const actId = String(actState.id || 'act').trim() || 'act';
        const seed = String(actState.seed || appData.campaign.seed || 'ASSET').trim() || 'ASSET';
        const pool = extra.pool ? `:${String(extra.pool).toLowerCase()}` : '';
        const refresh = extra.refreshCount != null ? `:refresh${Math.max(1, Math.round(Number(extra.refreshCount) || 1))}` : '';
        return `${seed}:asset:${kind}:${actId}:${nodeId}:${nodeIndex}:phase${phaseNo}${pool}${refresh}`;
    }

    function withPhaseBoundAssetSeed(command) {
        const source = command && typeof command === 'object' && !Array.isArray(command) ? command : {};
        const kind = String(source.kind || source.type || '').toLowerCase();
        if (kind !== 'open_offer' && kind !== 'refresh_offer') return source;
        const payload = source.payload && typeof source.payload === 'object' && !Array.isArray(source.payload)
            ? { ...source.payload }
            : {};
        if (payload.seed) return source;
        if (kind === 'open_offer') {
            const pool = payload.pool || 'low';
            return {
                ...source,
                payload: {
                    ...payload,
                    seed: buildPhaseBoundAssetSeed('offer', { pool })
                }
            };
        }
        const offer = getCurrentAssetDeckState().offer || {};
        return {
            ...source,
            payload: {
                ...payload,
                seed: buildPhaseBoundAssetSeed('offer', {
                    pool: offer.pool || payload.pool || 'low',
                    refreshCount: Math.max(1, Math.round(Number(offer.refreshCount) || 0) + 1)
                })
            }
        };
    }

    function applyAssetDeckCommand(command) {
        if (!command || typeof command !== 'object') return false;
        const preparedCommand = withPhaseBoundAssetSeed(command);
        if (isOverviewDebugMode()) {
            return applyAssetDeckCommandLocally(preparedCommand);
        }

        const requestId = `asset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        const commandPayload = { requestId, command: preparedCommand };
        const directBridge = resolveDirectAssetDeckCommandBridge();
        syncState.statusText = 'ASSET COMMAND';
        syncState.errorText = '';

        if (directBridge) {
            Promise.resolve()
                .then(() => directBridge(commandPayload))
                .then((result) => {
                    resolveAssetDeckCommandResult(result || {
                        ok: false,
                        requestId,
                        error: 'Direct AssetDeck bridge returned no result.'
                    });
                })
                .catch((error) => {
                    resolveAssetDeckCommandResult({
                        ok: false,
                        requestId,
                        error: error?.message || String(error)
                    });
                });
            refreshPlannerUI();
            return true;
        }

        if (assetCommandState.pendingTimer) {
            global.clearTimeout(assetCommandState.pendingTimer);
        }
        assetCommandState.pendingRequestId = requestId;
        assetCommandState.pendingTimer = global.setTimeout(() => {
            if (assetCommandState.pendingRequestId !== requestId) return;
            assetCommandState.pendingRequestId = '';
            assetCommandState.pendingTimer = null;
            assetCommandState.resolver = null;
            syncState.statusText = 'ASSET COMMAND FAILED';
            syncState.errorText = 'No ACK from host within 4s. Bridge path: ACT -> DASHBOARD -> HOST.';
            refreshPlannerUI();
        }, 4000);

        const didDispatch = postActMessageToHost({
            type: ACT_OUTBOUND_MESSAGE_TYPES.assetCommand,
            payload: commandPayload
        });
        if (!didDispatch) {
            if (assetCommandState.pendingTimer) {
                global.clearTimeout(assetCommandState.pendingTimer);
                assetCommandState.pendingTimer = null;
            }
            assetCommandState.pendingRequestId = '';
            syncState.statusText = 'ASSET COMMAND FAILED';
            syncState.errorText = 'No parent/top host window available for AssetDeck command.';
            refreshPlannerUI();
            return false;
        }
        refreshPlannerUI();
        return true;
    }

    function applyAssetDeckCommandLocally(command) {
        const assetModule = getAssetDeckModuleApi();
        if (!assetModule || typeof assetModule.applyAssetDeckCommand !== 'function') {
            syncState.statusText = 'ASSET RUNTIME MISSING';
            syncState.errorText = 'AssetDeck runtime is not loaded.';
            refreshPlannerUI();
            return false;
        }
        return updateWorldPayloadAndCommit((world) => {
            const currentAssetDeck = normalizeAssetDeckForDashboard(world.assetDeck);
            const actState = world.act && typeof world.act === 'object' && !Array.isArray(world.act) ? world.act : {};
            const reserveSource = actState.reserve && typeof actState.reserve === 'object' && !Array.isArray(actState.reserve) ? actState.reserve : {};
            const assetPoints = Math.max(0, Math.round(Number(reserveSource.asset ?? appState.resources.assets) || 0));
            const result = assetModule.applyAssetDeckCommand(currentAssetDeck, command, {
                seed: buildPhaseBoundAssetSeed(String(command.kind || command.type || 'command').toLowerCase()),
                assetPoints
            });
            if (!result?.assetDeck) {
                syncState.statusText = 'ASSET COMMAND FAILED';
                syncState.errorText = result?.code || 'Unknown AssetDeck command failure.';
                return world;
            }
            world.assetDeck = result.assetDeck;
            if (Number.isFinite(Number(result.assetPoints))) {
                const nextAssetPoints = Math.max(0, Math.round(Number(result.assetPoints) || 0));
                world.act = {
                    ...actState,
                    reserve: {
                        combat: Math.max(0, Number(reserveSource.combat) || 0),
                        rest: Math.max(0, Number(reserveSource.rest) || 0),
                        asset: nextAssetPoints,
                        vision: Math.max(0, Number(reserveSource.vision) || 0)
                    }
                };
                appState.resources.assets = nextAssetPoints;
            }
            syncState.statusText = result.ok ? `ASSET: ${String(result.code || 'OK').toUpperCase()}` : 'ASSET COMMAND BLOCKED';
            syncState.errorText = result.ok ? '' : String(result.code || 'Command rejected.');
            return world;
        });
    }

    function handleAssetDeckAction(target) {
        if (!target) return false;
        if (target.disabled || target.getAttribute('aria-disabled') === 'true') return false;
        const action = target.dataset.assetAction;
        if (!action) return false;
        if (['open-offer', 'refresh-offer', 'choose-card', 'unlock-slot', 'replace-card', 'open-warehouse', 'close-warehouse'].includes(action)) {
            setPlannerPage('asset');
        }
        if (action === 'grant-asset') {
            return applyAssetDeckCommand({ kind: 'grant_asset', payload: { amount: 1 } });
        }
        if (action === 'unlock-slot') {
            appState.assetWarehouseOpen = true;
            return applyAssetDeckCommand({ kind: 'unlock_slot', payload: {} });
        }
        if (action === 'open-warehouse') {
            appState.assetWarehouseOpen = true;
            refreshPlannerUI();
            return true;
        }
        if (action === 'close-warehouse') {
            appState.assetWarehouseOpen = false;
            refreshPlannerUI();
            return true;
        }
        if (action === 'open-offer') {
            appState.assetWarehouseOpen = false;
            return applyAssetDeckCommand({ kind: 'open_offer', payload: { pool: target.dataset.pool || 'low' } });
        }
        if (action === 'refresh-offer') {
            return applyAssetDeckCommand({ kind: 'refresh_offer', payload: {} });
        }
        if (action === 'choose-card') {
            return applyAssetDeckCommand({
                kind: 'choose_card',
                payload: {
                    choiceIndex: Math.max(0, Math.round(Number(target.dataset.choiceIndex) || 0)),
                    slotType: target.dataset.slotType || 'general'
                }
            });
        }
        if (action === 'replace-card') {
            return applyAssetDeckCommand({
                kind: 'replace_card',
                payload: {
                    slotType: target.dataset.slotType || 'general',
                    targetIndex: Math.max(0, Math.round(Number(target.dataset.slotIndex) || 0)),
                    confirmDestroy: target.dataset.confirmDestroy === 'true'
                }
            });
        }
        if (action === 'debug-reset') {
            return applyAssetDeckCommand({ kind: 'debug_reset', payload: {} });
        }
        return false;
    }

    function resolveAssetDeckCommandResult(resultPayload) {
        const requestId = typeof resultPayload?.requestId === 'string' ? resultPayload.requestId : '';
        if (requestId && assetCommandState.pendingRequestId && requestId !== assetCommandState.pendingRequestId) return;
        if (assetCommandState.pendingTimer) {
            global.clearTimeout(assetCommandState.pendingTimer);
            assetCommandState.pendingTimer = null;
        }

        assetCommandState.pendingRequestId = '';
        const resolver = assetCommandState.resolver;
        assetCommandState.resolver = null;

        if (resultPayload?.ok) {
            if (resultPayload.assetDeck && typeof resultPayload.assetDeck === 'object') {
                const currentPayload = adapterState.lastPayload || buildInitialDebugPayload();
                const currentWorld = extractWorldPayload(currentPayload) || {};
                const nextPayload = buildNormalizedDashboardPayload({
                    ...(currentPayload || {}),
                    world: {
                        ...deepCloneValue(currentWorld),
                        assetDeck: deepCloneValue(resultPayload.assetDeck)
                    }
                });
                if (nextPayload) {
                    applyActStateFromPayload(nextPayload);
                }
            }
            syncState.dirty = false;
            syncState.statusText = resultPayload.code ? `ASSET: ${String(resultPayload.code).toUpperCase()}` : getCommitIdleStatusText();
            syncState.errorText = '';
        } else {
            syncState.statusText = 'ASSET COMMAND BLOCKED';
            syncState.errorText = typeof resultPayload?.error === 'string' && resultPayload.error.trim()
                ? resultPayload.error.trim()
                : String(resultPayload?.code || 'AssetDeck command failed.');
        }

        refreshPlannerUI();
        if (typeof resolver === 'function') resolver(resultPayload);
    }

    return {
        getAssetDeckModuleApi,
        getAssetSummaryModuleApi,
        createFallbackAssetDeckState,
        normalizeAssetDeckForDashboard,
        getCurrentAssetDeckState,
        getAssetPendingOfferIdentity,
        getDashboardAssetSummaryGameId,
        buildFallbackAssetDeckSummary,
        getCurrentAssetDeckSummary,
        applyAssetDeckCommand,
        applyAssetDeckCommandLocally,
        handleAssetDeckAction,
        resolveAssetDeckCommandResult
    };
    }

    global.ACE0OverviewAssetAdapter = { create };
})(window);
