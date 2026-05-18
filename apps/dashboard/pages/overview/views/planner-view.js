(function initAce0OverviewPlannerView(global) {
    function create(ctx = {}) {
        const {
            PHASE_SLOT_IDS,
            PLANNER_PAGE_KEYS,
            PLANNER_PAGE_META,
            RESOURCE_KEYS,
            RESOURCE_LABEL_MAP,
            RESOURCE_TYPE_MAP,
            REST_CONTROL_TINT_KEYS,
            appData,
            appState,
            buildCombatSettlementRowsMarkup,
            buildCurrentActStateSnapshot,
            buildEncounterFixedGlyphMarkup,
            buildVisionPanelMarkup,
            canEditPhaseSlot,
            canOpenPlannerDrawer,
            canUseInteractivePlannerControls,
            escapePartyHtml,
            getAssetDeckModuleApi,
            getCampaignTotalNodes,
            getCurrentAssetDeckSummary,
            getCurrentNodeData,
            getCurrentVisionFixedPhasePrompt,
            getDisplayTokenForPhase,
            getEncounterMarkerForPhase,
            getFixedPhaseKind,
            getFixedPhaseMarker,
            getPhaseRomanLabel,
            getPreferredSourceForKey,
            getReadyVisionReplacementForPhase,
            getRestTintLabel,
            getRouteOptionLabel,
            getTotalInventoryCount,
            getVisionStateForDashboard,
            isPhasePlanConfirmedForCurrentNode,
            isPlanningPhase,
            isRouteSelectionActive,
            normalizeResourceKey,
            normalizeRestTintKey,
            selectInventoryToken,
            selectionState,
            syncState
        } = ctx;

    const PLAN_LAYOUT_WIDE_WIDTH = 1080;
    const PLAN_LAYOUT_NARROW_WIDTH = 760;
    let plannerLayoutResizeBound = false;
    let plannerLayoutSyncScheduled = false;

    function isCurrentPhasePlanLocked() {
        return typeof isPhasePlanConfirmedForCurrentNode === 'function' && isPhasePlanConfirmedForCurrentNode();
    }

    function buildPlannerAssetHash() {
        return JSON.stringify({
            summary: getCurrentAssetDeckSummary(),
            assetWarehouseOpen: appState.assetWarehouseOpen,
            phaseSlots: appState.phaseSlots
        });
    }

    function buildPlannerResourceHash(activePage = getActivePlannerPage()) {
        return JSON.stringify({
            page: activePage,
            inventory: appState.inventory,
            phaseSlots: appState.phaseSlots,
            selection: selectionState,
            phasePlanLocked: isCurrentPhasePlanLocked(),
            restTintPopupSlotId: appState.restTintPopupSlotId,
            nodeId: appState.currentNodeId,
            nodeIndex: appState.currentNodeIndex,
            vision: getVisionStateForDashboard()
        });
    }

    function setClassNameIfChanged(element, className) {
        if (element.className !== className) element.className = className;
    }

    function setTextContentIfChanged(element, text) {
        const nextText = String(text ?? '');
        if (element.textContent !== nextText) element.textContent = nextText;
    }

    function setAttributeIfChanged(element, name, value) {
        const nextValue = String(value);
        if (element.getAttribute(name) !== nextValue) element.setAttribute(name, nextValue);
    }

    function removeAttributeIfPresent(element, name) {
        if (element.hasAttribute(name)) element.removeAttribute(name);
    }

    function setDatasetIfChanged(element, key, value) {
        const nextValue = String(value);
        if (element.dataset[key] !== nextValue) element.dataset[key] = nextValue;
    }

    function setInnerHTMLIfChanged(element, markup) {
        if (element.innerHTML !== markup) element.innerHTML = markup;
    }

    function getPlannerViewportWidth(drawer) {
        return Math.max(
            0,
            drawer?.getBoundingClientRect?.().width || 0,
            document.documentElement?.clientWidth || 0,
            global.innerWidth || 0
        );
    }

    function getPlannerLayoutMode(drawer) {
        const drawerWidth = getPlannerViewportWidth(drawer);
        if (drawerWidth > 0 && drawerWidth < PLAN_LAYOUT_NARROW_WIDTH) return 'narrow';
        if (drawerWidth > 0 && drawerWidth < PLAN_LAYOUT_WIDE_WIDTH) return 'mid';
        return 'wide';
    }

    function getPlannerLayoutClass(mode = getPlannerLayoutMode()) {
        return `plan-layout-${mode}`;
    }

    function isOverviewPageActive() {
        const bodyClassList = global.document?.body?.classList;
        if (!bodyClassList || typeof bodyClassList.contains !== 'function') return true;
        return bodyClassList.contains('is-overview-page');
    }

    function bindPlannerLayoutResize() {
        if (plannerLayoutResizeBound) return;
        if (!global || typeof global.addEventListener !== 'function') return;
        plannerLayoutResizeBound = true;
        global.addEventListener('resize', requestPlannerLayoutChromeSync, { passive: true });
    }

    function requestPlannerLayoutChromeSync() {
        if (!isOverviewPageActive()) return;
        if (plannerLayoutSyncScheduled) return;
        if (!global || typeof global.requestAnimationFrame !== 'function') {
            syncPlannerLayoutChrome();
            return;
        }
        plannerLayoutSyncScheduled = true;
        global.requestAnimationFrame(() => {
            plannerLayoutSyncScheduled = false;
            syncPlannerLayoutChrome();
        });
    }

    function syncPlannerLayoutChrome() {
        if (!isOverviewPageActive()) return;
        const drawer = document.getElementById('drawer');
        if (!drawer) return;
        const mode = getPlannerLayoutMode(drawer);
        if (drawer.dataset.planLayout === mode) {
            bindPlannerLayoutResize();
            return;
        }
        drawer.classList.toggle('plan-layout-wide', mode === 'wide');
        drawer.classList.toggle('plan-layout-mid', mode === 'mid');
        drawer.classList.toggle('plan-layout-narrow', mode === 'narrow');
        drawer.dataset.planLayout = mode;
        bindPlannerLayoutResize();
    }

    function buildAssetCardViewModel(card) {
        if (!card) return null;
        const assetModule = getAssetDeckModuleApi();
        const catalog = assetModule && typeof assetModule.getCatalog === 'function' ? assetModule.getCatalog() : [];
        const cardId = String(card?.cardId || card?.id || '').trim();
        const catalogCard = Array.isArray(catalog)
            ? catalog.find((item) => item?.id === cardId)
            : null;
        const name = catalogCard?.name || card?.name || cardId || 'EMPTY';
        const rarity = String(card?.rarity || catalogCard?.rarity || 'bronze').toLowerCase();
        const kind = String(card?.kind || catalogCard?.kind || 'card').toLowerCase();
        const system = String(card?.system || catalogCard?.system || '').toLowerCase();
        const level = Math.max(0, Math.round(Number((card?.level ?? card?.lv) ?? catalogCard?.level) || 0));
        const levelLabel = level > 0 ? `LV ${level}` : kind.toUpperCase();
        const explicit = typeof card?.effectText === 'string' ? card.effectText.trim() : '';
        const modifiers = Array.isArray(card?.modifiers || catalogCard?.modifiers) ? (card.modifiers || catalogCard.modifiers) : [];
        const modifierParts = modifiers.map((modifier) => {
            const type = String(modifier?.type || modifier?.kind || '').toLowerCase();
            const value = Number(modifier?.value) || 0;
            const signed = `${value > 0 ? '+' : ''}${value}`;
            if (type === 'mana_max_flat') return `Mana Max ${signed}`;
            if (type === 'skill_cost_flat') return `Mana ${signed}`;
            if (type === 'skill_cost_pct') return `Mana ${value > 0 ? '+' : ''}${Math.round(value * 100)}%`;
            if (type === 'force_power_flat') return `效果 ${signed}`;
            if (type === 'force_power_pct' || type === 'all_force_power_bonus') return `效果 ${value > 0 ? '+' : ''}${Math.round(value * 100)}%`;
            if (type === 'risk_reward_roll') return '释放时随机 Mana / 效果';
            if (type === 'skill_level_bonus') return 'Texas 技能等级 +1';
            return '';
        }).filter(Boolean);
        const effectText = explicit
            || (modifierParts.length ? modifierParts.slice(0, 2).join(' / ') : '')
            || String(card?.skillKey || catalogCard?.skillKey || '').replace(/_/g, ' ')
            || kind.replace(/_/g, ' ')
            || 'ACTIVE CARD';
        const baseTags = Array.isArray(card?.statusTags) && card.statusTags.length
            ? card.statusTags
            : [
                rarity,
                system,
                ...(Array.isArray(card?.gameTags || catalogCard?.gameTags) ? (card.gameTags || catalogCard.gameTags) : []),
                ...(Array.isArray(card?.slotTags || catalogCard?.slotTags) ? (card.slotTags || catalogCard.slotTags) : [])
            ];
        const tags = baseTags.map((tag) => typeof tag === 'string' ? tag.trim() : '').filter(Boolean).slice(0, 5);
        return {
            name,
            rarity,
            kind,
            system,
            level,
            levelLabel,
            effectText,
            tags,
            glyph: String(system || kind || 'A').slice(0, 1).toUpperCase(),
            typeLabel: `${String(rarity || 'bronze').toUpperCase()} · ${String(kind || 'card').toUpperCase()}`,
            effective: card?.effective !== false
        };
    }

    function getAssetCardDisplayName(card) {
        return buildAssetCardViewModel(card)?.name || 'EMPTY';
    }

    function getAssetCardLevelLabel(card) {
        return buildAssetCardViewModel(card)?.levelLabel || 'CARD';
    }

    function getAssetCardEffectText(card) {
        return buildAssetCardViewModel(card)?.effectText || 'ACTIVE CARD';
    }

    function buildAssetCardTagsMarkup(card) {
        const tags = buildAssetCardViewModel(card)?.tags || [];
        return tags.map((tag) => `<span>${escapePartyHtml(tag.toUpperCase())}</span>`).join('');
    }

    function normalizeAssetPendingReplaceForMarkup(pendingReplace) {
        if (!pendingReplace || typeof pendingReplace !== 'object') return null;
        return {
            card: pendingReplace.card || pendingReplace.candidate || null,
            allowedSlots: Array.isArray(pendingReplace.allowedSlots) ? pendingReplace.allowedSlots : [],
            reason: pendingReplace.reason || 'slot_full',
            confirm_destroy: pendingReplace.confirm_destroy === true || pendingReplace.confirmDestroy === true
        };
    }

    function normalizePlannerPage(value) {
        const page = typeof value === 'string' ? value.trim().toLowerCase() : '';
        if (page === 'deck' || page === 'extract') return 'asset';
        return PLANNER_PAGE_KEYS.includes(page) ? page : 'planner';
    }

    function getActivePlannerPage() {
        const activePage = normalizePlannerPage(appState.plannerPage || appState.assetDrawerTab);
        appState.plannerPage = activePage;
        appState.assetDrawerTab = activePage === 'asset' ? 'deck' : activePage;
        return activePage;
    }

    function setPlannerPage(page) {
        appState.plannerPage = normalizePlannerPage(page);
        appState.assetDrawerTab = appState.plannerPage === 'asset' ? 'deck' : appState.plannerPage;
        if (appState.plannerPage !== 'asset') appState.assetWarehouseOpen = false;
        return appState.plannerPage;
    }

    function normalizePlannerEditMode(mode) {
        return mode === 'remove' ? 'remove' : 'add';
    }

    function setPlannerEditMode(mode) {
        appState.plannerEditMode = normalizePlannerEditMode(mode);
        if (appState.plannerEditMode === 'add') {
            const key = normalizeResourceKey(appState.plannerAddType || selectionState.type, '');
            if (key && getTotalInventoryCount(key) > 0) {
                selectInventoryToken(key);
            }
        }
        return appState.plannerEditMode;
    }

    function buildPlannerResourceNavMarkup(activePage) {
        return PLANNER_PAGE_KEYS.map((page) => {
            const meta = PLANNER_PAGE_META[page] || PLANNER_PAGE_META.planner;
            return `
                <button class="${activePage === page ? 'is-active' : ''} page-${page}" type="button" data-planner-tab="${page}">
                    <span>${escapePartyHtml(meta.title)}</span>
                    <em>${escapePartyHtml(meta.label)}</em>
                </button>
            `;
        }).join('');
    }

    function buildResourceMeterMarkup(key) {
        const resourceKey = normalizeResourceKey(key, 'vision');
        const total = getTotalInventoryCount(resourceKey);
        return `
            <div class="meter type-${resourceKey}">
                <span>AVAILABLE</span>
                <strong>${Math.max(0, total)} / ${Math.max(0, total)}</strong>
            </div>
        `;
    }

    function getPlannedResourceState(key) {
        const resourceKey = normalizeResourceKey(key, '');
        const state = { amount: 0, maxAmount: 0, slots: 0 };
        if (!resourceKey) return state;
        Object.values(appState.phaseSlots).forEach((slot) => {
            if (!slot || normalizeResourceKey(slot.key, '') !== resourceKey) return;
            const amount = Math.max(1, Math.min(3, Math.round(Number(slot.amount) || 1)));
            state.amount += amount;
            state.maxAmount = Math.max(state.maxAmount, amount);
            state.slots += 1;
        });
        return state;
    }

    function getPlannedModuleClass(key) {
        const planned = getPlannedResourceState(key);
        return planned.amount > 0 ? ` is-planned planned-level-${planned.maxAmount}` : '';
    }

    function buildRuleCardMarkup(key, level, title, note) {
        const planned = getPlannedResourceState(key);
        const isLit = planned.maxAmount >= level;
        return `<div class="rule-card${isLit ? ' is-lit' : ''}" data-rule-level="${level}"><span>${level === 1 ? 'I' : level === 2 ? 'II' : 'III'}</span><strong>${escapePartyHtml(title)}</strong><em>${escapePartyHtml(note)}</em></div>`;
    }

    const ASSET_POOL_META = Object.freeze([
        { pool: 'low', level: 1, code: 'I', title: '低阶牌池', label: 'LOW DRAW', cost: 1, note: '铜银契令，稳住起手。' },
        { pool: 'mid', level: 2, code: 'II', title: '中阶牌池', label: 'MID DRAW', cost: 2, note: '金色回响开始浮现。' },
        { pool: 'high', level: 3, code: 'III', title: '高阶牌池', label: 'HIGH DRAW', cost: 3, note: '虹色契约进入视野。' }
    ]);

    function getDisplayAssetPoints() {
        return Math.max(0, Math.round(Number(appState.resources.assets) || 0));
    }

    function isAssetOfferActive(assetSummary) {
        const offer = assetSummary?.pending?.offer;
        return !!(offer && offer.settled !== true);
    }

    function buildAssetPoolCardMarkup(meta, assetSummary, plannedAsset) {
        const points = getDisplayAssetPoints();
        const isActive = plannedAsset.maxAmount >= meta.level;
        const activeOffer = isAssetOfferActive(assetSummary);
        const hasSettledOffer = assetSummary?.pending?.offer?.settled === true;
        const canOpen = isActive && points >= meta.cost && !assetSummary?.pending?.offer;
        const stateText = !isActive ? 'LOCKED' : (hasSettledOffer ? 'SETTLED' : (activeOffer ? 'OPEN' : (points >= meta.cost ? 'READY' : `NEED ${meta.cost}`)));
        return `
            <button class="asset-pool-card pool-${meta.pool}${isActive ? ' is-lit' : ''}${canOpen ? ' is-ready' : ''}" type="button" data-asset-action="open-offer" data-pool="${meta.pool}"${canOpen ? '' : ' disabled'}>
                <span>${escapePartyHtml(meta.code)}</span>
                <strong>${escapePartyHtml(meta.title)}</strong>
                <em>${escapePartyHtml(meta.note)}</em>
                <b>${escapePartyHtml(meta.label)} · ${escapePartyHtml(stateText)}</b>
            </button>
        `;
    }

    function buildAssetPoolPanelMarkup(assetSummary) {
        const plannedAsset = getPlannedResourceState('asset');
        return `
            <div class="asset-pool-grid">
                ${ASSET_POOL_META.map((meta) => buildAssetPoolCardMarkup(meta, assetSummary, plannedAsset)).join('')}
            </div>
        `;
    }

    function buildScheduledResourceSlotsMarkup(resourceKey) {
        const normalizedKey = normalizeResourceKey(resourceKey, 'vision');
        const rows = appData.planner.phases.map((phase, index) => {
            const slot = appState.phaseSlots[phase.slotId];
            if (!slot || normalizeResourceKey(slot.key, '') !== normalizedKey) return '';
            const amount = Math.max(1, Math.min(3, Math.round(Number(slot.amount) || 1)));
            const tint = normalizedKey === 'rest'
                ? normalizeRestTintKey(slot.tint || slot.controlType || slot.targetKey, 'neutral')
                : '';
            const tintLabel = normalizedKey === 'rest' && tint !== 'neutral'
                ? ` · ${RESOURCE_LABEL_MAP[tint] || RESOURCE_TYPE_MAP[tint] || tint}`
                : '';
            const state = index < appState.currentPhaseIndex ? 'DONE' : (index === appState.currentPhaseIndex ? 'NOW' : 'WAIT');
            return `
                <div class="row type-${normalizedKey}${index === appState.currentPhaseIndex ? ' is-current' : ''}">
                    <strong>${escapePartyHtml(phase.title || String(index + 1))}</strong>
                    <span>${RESOURCE_TYPE_MAP[normalizedKey]} x${amount}${escapePartyHtml(tintLabel)}</span>
                    <em>${state}</em>
                </div>
            `;
        }).filter(Boolean).join('');
        return rows || `<div class="row is-empty"><strong>-</strong><span>尚未排入${escapePartyHtml(RESOURCE_LABEL_MAP[normalizedKey] || '')}相位</span><em>EMPTY</em></div>`;
    }

    function buildControlledNodeSummaryMarkup() {
        const actState = buildCurrentActStateSnapshot();
        const controlled = actState.controlledNodes && typeof actState.controlledNodes === 'object'
            ? Object.entries(actState.controlledNodes)
            : [];
        const rows = controlled.slice(-4).reverse().map(([nodeId, entry]) => {
            const type = normalizeRestTintKey(entry?.type || entry?.tint || entry?.key, 'neutral');
            const label = type === 'neutral' ? 'NEUTRAL' : (RESOURCE_TYPE_MAP[type] || type.toUpperCase());
            const tintLabel = type === 'neutral' ? '默认' : (RESOURCE_LABEL_MAP[type] || label);
            return `
                <div class="row type-${type}">
                    <strong>${escapePartyHtml(label.slice(0, 1))}</strong>
                    <span>${escapePartyHtml(getRouteOptionLabel(nodeId) || nodeId)} · ${escapePartyHtml(tintLabel)}倾向</span>
                    <em>TINT</em>
                </div>
            `;
        }).join('');
        return rows || '<div class="row is-empty"><strong>-</strong><span>尚未留下节点倾向</span><em>EMPTY</em></div>';
    }

    function getRestTintActionMeta(tintKey, token = getSelectedRestSlotToken()) {
        const normalized = normalizeRestTintKey(tintKey, 'neutral');
        const currentTint = token ? normalizeRestTintKey(token.tint || token.controlType || token.targetKey, 'neutral') : 'neutral';
        const labelMap = {
            neutral: { title: '默认休整', note: '只回稳 Mana，不留下倾向。' },
            rest: { title: '休整倾向', note: '把节奏留在当前节点。' },
            asset: { title: '契令倾向', note: '让牌池与仓库更容易接上。' },
            vision: { title: '情报倾向', note: '让前路与既定相位更清晰。' },
            combat: { title: '交锋倾向', note: '把下一次风险推向赌桌。' }
        };
        if (normalized === 'neutral') {
            return {
                disabled: !token,
                active: currentTint === 'neutral',
                ...(labelMap.neutral),
                note: token ? labelMap.neutral.note : '先选择一个未来休整相位。'
            };
        }
        const source = getPreferredSourceForKey(normalized);
        const disabled = !token || (!source && currentTint !== normalized);
        return {
            disabled,
            active: currentTint === normalized,
            ...(labelMap[normalized] || { title: getRestTintLabel(normalized), note: '' }),
            note: !token
                ? '先选择一个未来休整相位。'
                : (disabled ? `${RESOURCE_LABEL_MAP[normalized] || normalized} 点不足。` : (labelMap[normalized]?.note || ''))
        };
    }

    function buildRestTintActionsMarkup() {
        const token = getSelectedRestSlotToken();
        return REST_CONTROL_TINT_KEYS.map((key) => {
            const meta = getRestTintActionMeta(key, token);
            const tint = key === 'combat' ? 'combat' : key === 'asset' ? 'asset' : key === 'vision' ? 'vision' : 'rest';
            const label = key === 'vision' ? 'intel' : key;
            return `
                <button class="tint-choice${meta.active ? ' is-active' : ''}${meta.disabled ? ' is-disabled' : ''}" style="--tint: var(--${tint});" type="button" data-rest-tint="${key}" data-tint-type="${key}"${meta.disabled ? ' disabled' : ''}>
                    <span>${escapePartyHtml(label)}</span>
                    <strong>${escapePartyHtml(meta.title)}</strong>
                    <em>${escapePartyHtml(meta.note)}</em>
                </button>
            `;
        }).join('');
    }

    function buildVisionNextStepMarkup(vision, sight) {
        const pending = vision.pendingReplace;
        const routeMode = appData.runtime.frontendSnapshot?.routeMode || '';
        let label = '探路';
        let value = `可见到 NODE ${String(Math.min(getCampaignTotalNodes(), appState.currentNodeIndex + sight)).padStart(2, '0')}`;
        let note = '情报会照亮更远的节点。';
        if (pending && pending.status === 'ready') {
            label = '既定相位改写';
            value = 'READY';
            note = '抵达目标相位时，可选择保留或改写。';
        } else if (pending && ['charged', 'choosing'].includes(pending.status)) {
            label = '既定相位改写';
            value = `CHARGED x${Math.max(1, Math.round(Number(pending.charges) || 1))}`;
            note = '等待下一个可被改写的既定相位。';
        } else if (vision.jumpReady || routeMode === 'jump') {
            label = '跃迁';
            value = isRouteSelectionActive() ? 'CHOOSE ROUTE' : 'READY';
            note = isRouteSelectionActive() ? '可在下方候选中选择跃迁目标。' : '岔路出现时可跨线选择。';
        }
        return `
            <div class="resource-next-step">
                <span>${escapePartyHtml(label)}</span>
                <strong>${escapePartyHtml(value)}</strong>
                <em>${escapePartyHtml(note)}</em>
            </div>
        `;
    }

    function buildCombatResourcePageMarkup() {
        const actState = buildCurrentActStateSnapshot();
        return `
            <div class="resource-shell${getPlannedModuleClass('combat')}" data-planned-resource="combat">
                <aside class="side-panel">
                    <div class="eyebrow">COMBAT POINT</div>
                    <div class="big-title">交锋点</div>
                    ${buildResourceMeterMarkup('combat')}
                    <div class="note">把风险推向赌桌，等待交锋回响。</div>
                    <button class="action-btn" type="button">ECHO LOG</button>
                </aside>
                <main class="main-panel">
                    <div class="section-head"><span>COMBAT FLOW</span><strong>赌桌 · 交锋 · 回响</strong></div>
                    <div class="rule-grid">
                        ${buildRuleCardMarkup('combat', 1, '小交锋', '轻压一注，试探局势。')}
                        ${buildRuleCardMarkup('combat', 2, '精英局', '把筹码压向更深的桌面。')}
                        ${buildRuleCardMarkup('combat', 3, 'Boss 局', '高压对决，等待回响落定。')}
                    </div>
                    <div class="queue-grid">
                        <div class="queue-card"><span>COMBAT PHASES</span>
                            ${buildScheduledResourceSlotsMarkup('combat')}
                        </div>
                        <div class="queue-card"><span>COMBAT ECHOES</span>
                            ${buildCombatSettlementRowsMarkup(actState)}
                        </div>
                    </div>
                </main>
                <aside class="detail-panel">
                    <div class="detail-icon">C</div>
                    <div class="detail-title">交锋回响</div>
                    <div class="detail-text">胜负、损失与收获会在交锋结算后回到这里。</div>
                    <div class="detail-box"><span>ECHO</span><strong>WAITING</strong></div>
                </aside>
            </div>
        `;
    }

    function buildRestResourcePageMarkup() {
        const selectedRest = getSelectedRestSlotToken();
        const selectedTint = selectedRest
            ? normalizeRestTintKey(selectedRest.tint || selectedRest.controlType || selectedRest.targetKey, 'neutral')
            : 'neutral';
        const selectedTintLabel = selectedTint === 'neutral'
            ? 'NEUTRAL'
            : (RESOURCE_LABEL_MAP[selectedTint] || RESOURCE_TYPE_MAP[selectedTint] || selectedTint.toUpperCase());
        const restDetailText = selectedTint === 'neutral'
            ? '默认休整只回稳 Mana，不留下额外倾向。'
            : `当前倾向 ${selectedTintLabel}，会消耗对应点数并留下节点倾向。`;
        const showTintOverlay = Boolean(selectedRest && appState.restTintPopupSlotId);
        return `
            <div class="resource-shell${getPlannedModuleClass('rest')}" data-planned-resource="rest">
                <aside class="side-panel">
                    <div class="eyebrow">REST POINT</div>
                    <div class="big-title">休整点</div>
                    ${buildResourceMeterMarkup('rest')}
                    <div class="note">回稳 Mana，让当前节点染上倾向。</div>
                    <button class="action-btn" type="button" data-open-rest-tint>SET TINT</button>
                </aside>
                <main class="main-panel">
                    <div class="section-head"><span>REST FLOW</span><strong>回复 · 倾向 · 回稳</strong></div>
                    <div class="rule-grid">
                        ${buildRuleCardMarkup('rest', 1, '浅休整', '回稳少量 Mana。')}
                        ${buildRuleCardMarkup('rest', 2, '深呼吸', '回稳大半 Mana，倾向更稳。')}
                        ${buildRuleCardMarkup('rest', 3, '完整整备', '把状态拉回可战。')}
                    </div>
                    <div class="queue-grid">
                        <div class="queue-card"><span>REST PHASES</span>
                            ${buildScheduledResourceSlotsMarkup('rest')}
                        </div>
                        <div class="queue-card"><span>CONTROLLED NODES</span>
                            ${buildControlledNodeSummaryMarkup()}
                        </div>
                    </div>
                </main>
                <aside class="detail-panel">
                    <div class="detail-icon">R</div>
                    <div class="detail-title">节点倾向</div>
                    <div class="detail-text">${escapePartyHtml(restDetailText)}</div>
                    <div class="detail-box"><span>CURRENT</span><strong>${escapePartyHtml(selectedTintLabel)}</strong></div>
                </aside>
                ${showTintOverlay ? `<div class="tint-overlay" id="restTintOverlay" role="dialog" aria-label="Rest Tint">
                    <section class="tint-panel">
                        <div class="tint-head"><span>REST TENDENCY</span><strong>SELECT TINT</strong></div>
                        <div class="tint-grid">${buildRestTintActionsMarkup()}</div>
                        <div class="tint-foot"><span>TINT CHOICE · OPTIONAL</span><button class="action-btn" type="button" data-close-rest-tint>KEEP PLAIN</button></div>
                    </section>
                </div>` : ''}
            </div>
        `;
    }

    function buildVisionResourcePageMarkup() {
        const vision = getVisionStateForDashboard();
        const sight = Math.max(0, Math.round(Number(vision.baseSight) || 0)) + Math.max(0, Math.round(Number(vision.bonusSight) || 0));
        const replaceStatus = vision.pendingReplace?.status || 'none';
        return `
            <div class="resource-shell${getPlannedModuleClass('vision')}" data-planned-resource="vision">
                <aside class="side-panel">
                    <div class="eyebrow">VISION POINT</div>
                    <div class="big-title">情报点</div>
                    <div class="meter type-vision"><span>SIGHT</span><strong>${sight}</strong></div>
                    <div class="note">照亮前路，改写既定相位。</div>
                    <button class="action-btn" type="button">SIGHTLINE</button>
                </aside>
                <main class="main-panel">
                    <div class="section-head"><span>VISION FLOW</span><strong>探路 · 改写 · 跃迁</strong></div>
                    <div class="rule-grid">
                        ${buildRuleCardMarkup('vision', 1, '探路', '前路再亮一层。')}
                        ${buildRuleCardMarkup('vision', 2, '改写', '为既定相位留下一次选择。')}
                        ${buildRuleCardMarkup('vision', 3, '跃迁', '让远处岔路进入待命。')}
                    </div>
                    <div class="queue-grid">
                        <div class="queue-card"><span>VISION PHASES</span>
                            ${buildScheduledResourceSlotsMarkup('vision')}
                        </div>
                        <div class="queue-card"><span>VISION STATE</span>
                            ${buildVisionPanelMarkup()}
                        </div>
                    </div>
                </main>
                <aside class="detail-panel">
                    <div class="detail-icon">V</div>
                    <div class="detail-title">前路待命</div>
                    <div class="detail-text">岔路出现时，可以跨线选择。</div>
                    <div class="detail-box"><span>NEXT STEP</span><strong>${vision.jumpReady ? 'READY' : escapePartyHtml(String(replaceStatus).toUpperCase())}</strong></div>
                </aside>
            </div>
        `;
    }

    function buildAssetCardMarkup(card, options = {}) {
        const { compact = false, action = '', choiceIndex = null, slotType = '', slotIndex = null, confirmDestroy = false } = options;
        if (!card) {
            return `<div class="mini-slot empty"><span class="type">EMPTY</span><div class="name-row"><span class="name">未装配指令</span></div></div>`;
        }
        const cardId = String(card?.cardId || card?.id || '').trim();
        const attrs = [
            action ? `data-asset-action="${escapePartyHtml(action)}"` : '',
            cardId ? `data-card-id="${escapePartyHtml(cardId)}"` : '',
            choiceIndex != null ? `data-choice-index="${choiceIndex}"` : '',
            slotType ? `data-slot-type="${escapePartyHtml(slotType)}"` : '',
            slotIndex != null ? `data-slot-index="${slotIndex}"` : '',
            confirmDestroy ? 'data-confirm-destroy="true"' : ''
        ].filter(Boolean).join(' ');
        const view = buildAssetCardViewModel(card);
        const tags = view.tags.map((tag) => `<span>${escapePartyHtml(tag.toUpperCase())}</span>`).join('');
        return `
            <button class="cmd-card rarity-${escapePartyHtml(view.rarity)}${compact ? ' is-compact' : ''}${view.effective ? '' : ' is-ineffective'}" type="button" ${attrs}>
                <div class="cmd-card-accent-line"></div>
                <div class="bg-svg">${escapePartyHtml(view.glyph)}</div>
                <span class="cmd-type">${escapePartyHtml(view.typeLabel)}</span>
                <div class="cmd-name-row">
                    <span class="cmd-name">${escapePartyHtml(view.name)}</span>
                    <span class="cmd-level">${escapePartyHtml(view.levelLabel)}</span>
                </div>
                <div class="cmd-desc">${escapePartyHtml(view.effectText)}</div>
                ${tags ? `<div class="cmd-tags">${tags}</div>` : ''}
            </button>
        `;
    }

    function buildAssetSlotMarkup(card, slotType, index, unlocked = true, pendingReplaceInput = null) {
        if (!unlocked) {
            return `<div class="mini-slot locked"><span class="type">LOCKED</span><div class="name-row"><span class="name">硬件锁止</span></div></div>`;
        }
        const pending = normalizeAssetPendingReplaceForMarkup(pendingReplaceInput);
        const canReplace = pending && Array.isArray(pending.allowedSlots) && pending.allowedSlots.includes(slotType) && card;
        const confirmDestroy = !!(canReplace && pending.confirm_destroy === true);
        if (!card) {
            const voidCopy = slotType === 'void';
            return `<div class="mini-slot empty"><span class="type">${voidCopy ? 'EMPTY VOID' : 'EMPTY'}</span><div class="name-row"><span class="name">${voidCopy ? '未装配零号参数' : '未装配指令'}</span></div></div>`;
        }
        const view = buildAssetCardViewModel(card);
        const accent = slotType === 'void' ? 'var(--void)' : '';
        return `
            <div class="mini-slot filled rarity-${escapePartyHtml(view.rarity)}${canReplace ? ' is-replaceable' : ''}${view.effective ? '' : ' is-ineffective'}"${accent ? ` style="--c:${accent};"` : ''} data-asset-action="${canReplace ? 'replace-card' : ''}" data-slot-type="${escapePartyHtml(slotType)}" data-slot-index="${index}"${confirmDestroy ? ' data-confirm-destroy="true"' : ''}>
                <span class="type">${escapePartyHtml(String(view.kind || view.system || 'ASSET').toUpperCase())}</span>
                <div class="name-row"><span class="name">${escapePartyHtml(view.name)}</span><span class="lvl">${escapePartyHtml(view.levelLabel)}</span></div>
            </div>
        `;
    }

    function resolveOfferChoiceSlotType(card, assetSummary) {
        const slotTags = Array.isArray(card?.slotTags) ? card.slotTags : [];
        const canUseVoid = slotTags.includes('void');
        if (!canUseVoid) return 'general';
        const slots = assetSummary?.slots || {};
        const voidUsed = Math.max(0, Math.round(Number(slots.voidUsed) || 0));
        const voidMax = Math.max(0, Math.round(Number(slots.voidMax) || 0));
        return voidUsed < voidMax ? 'void' : 'general';
    }

    function buildAssetOfferChoiceMarkup(card, index, assetSummary) {
        const slotType = resolveOfferChoiceSlotType(card, assetSummary);
        return `
            <div class="choice">
                ${buildAssetCardMarkup(card, { compact: true, action: 'choose-card', choiceIndex: index, slotType })}
            </div>
        `;
    }

    function buildAssetOfferOverlayMarkup(assetSummary) {
        const pendingOffer = assetSummary.pending?.offer;
        if (!pendingOffer || pendingOffer.settled === true) return '';
        const queuedOffers = Array.isArray(assetSummary.pending?.offerQueue) ? assetSummary.pending.offerQueue : [];
        const queueText = queuedOffers.length ? ` · QUEUE ${queuedOffers.length}` : '';
        const offerMarkup = pendingOffer?.choices?.length
            ? pendingOffer.choices.map((card, index) => buildAssetOfferChoiceMarkup(card, index, assetSummary)).join('')
            : '';
        if (!offerMarkup) return '';
        return `
            <div class="offer-overlay pool-${escapePartyHtml(String(pendingOffer?.pool || 'low').toLowerCase())}" role="dialog" aria-label="Contract Extract">
                <section class="offer-panel draw-panel">
                    <div class="offer-head"><span>CONTRACT EXTRACT${escapePartyHtml(queueText)}</span><strong>${escapePartyHtml(String(pendingOffer?.pool || 'POOL').toUpperCase())}</strong></div>
                    <div class="offer-grid">${offerMarkup}</div>
                    <div class="offer-foot">
                        <span>ASSET · ${getDisplayAssetPoints()}</span>
                        <button class="action-btn" type="button" data-asset-action="refresh-offer">REROLL POOL</button>
                    </div>
                </section>
            </div>
        `;
    }

    function buildAssetWarehouseOverlayMarkup(assetSummary) {
        const generalCards = Array.isArray(assetSummary.activeCards?.general) ? assetSummary.activeCards.general : [];
        const voidCards = Array.isArray(assetSummary.activeCards?.void) ? assetSummary.activeCards.void : [];
        const slots = assetSummary.slots || {};
        const pendingReplace = normalizeAssetPendingReplaceForMarkup(assetSummary.pending?.replace);
        const generalSlots = Array.from({ length: 8 }, (_, index) => buildAssetSlotMarkup(generalCards[index], 'general', index, index < slots.generalMax, pendingReplace)).join('');
        const voidSlots = Array.from({ length: 2 }, (_, index) => buildAssetSlotMarkup(voidCards[index], 'void', index, index < slots.voidMax, pendingReplace)).join('');
        const focusedCard = pendingReplace?.card || generalCards.find(Boolean) || voidCards.find(Boolean);
        const replaceMarkup = pendingReplace?.card
            ? `<div class="asset-replace-callout">
                    <span>${pendingReplace.confirm_destroy ? 'CONFIRM BREAK' : 'REPLACE READY'}</span>
                    <strong>${escapePartyHtml(getAssetCardDisplayName(pendingReplace.card))}</strong>
                    <em>${pendingReplace.confirm_destroy ? '高阶契约受保护，再次点击高亮槽位才会摧毁旧牌。' : '选择一个高亮槽位，新契约会替换旧牌。'}</em>
                </div>`
            : '';
        const focusedType = focusedCard
            ? `${String(focusedCard.system || focusedCard.kind || 'asset').toUpperCase()} / ${String(focusedCard.rarity || 'bronze').toUpperCase()}`
            : '';
        const focusedName = focusedCard ? getAssetCardDisplayName(focusedCard) : '';
        const focusedLevel = focusedCard ? getAssetCardLevelLabel(focusedCard) : '';
        const focusedDesc = focusedCard
            ? `${String(focusedCard.kind || 'card').toUpperCase()}${focusedCard.skillKey ? ` · ${String(focusedCard.skillKey).toUpperCase()}` : ''}`
            : '';
        if (!appState.assetWarehouseOpen && !pendingReplace?.card) return '';
        return `
            <div class="warehouse-overlay" role="dialog" aria-label="Contract Warehouse">
                <section class="warehouse-panel asset-layout">
                    <aside class="detect-panel">
                        <span class="detect-label">CONTRACT WAREHOUSE</span>
                        <span class="detect-target">${slots.generalUsed}<span> / ${slots.generalMax}</span></span>
                        <span class="detect-label">VOID ISOLATION · ${slots.voidUsed}/${slots.voidMax}</span>
                        <span class="detect-label">ASSET · ${getDisplayAssetPoints()}</span>
                        <div class="astrolabe-ring"><div class="magic-core"></div></div>
                        <button class="action-btn" type="button" data-asset-action="unlock-slot">EXPAND (1 ASSET)</button>
                        <button class="action-btn ghost" type="button" data-asset-action="close-warehouse">CLOSE</button>
                    </aside>
                    <main class="deck-scroll-area">
                        ${replaceMarkup}
                        <div class="deck-grid-vertical">${generalSlots}</div>
                        <div class="void-section-vertical">${voidSlots}</div>
                    </main>
                    <aside class="details-panel${focusedCard ? '' : ' is-idle'}" style="--dp-color: var(--asset);">
                        ${focusedCard ? `
                            <div class="dp-bg-svg">${escapePartyHtml(String(focusedCard.system || focusedCard.kind || 'A').slice(0, 1).toUpperCase())}</div>
                            <div class="dp-type">${escapePartyHtml(focusedType)}</div>
                            <div class="dp-name-row">
                                <div class="dp-name">${escapePartyHtml(focusedName)}</div>
                                <div class="dp-lvl">${escapePartyHtml(focusedLevel)}</div>
                            </div>
                            <div class="dp-divider"></div>
                            <div class="dp-desc">${escapePartyHtml(focusedDesc)}</div>
                            <div class="dp-action-area">
                                <div class="dp-note">[ STATUS: ACTIVE ]</div>
                                <button class="btn-unequip" type="button" disabled>WAITING FOR REPLACE SLOT</button>
                            </div>
                        ` : ''}
                    </aside>
                </section>
            </div>
        `;
    }

    function buildAssetWarehouseRowsMarkup(assetSummary) {
        const slots = assetSummary.slots || {};
        const queue = Array.isArray(assetSummary.pending?.offerQueue) ? assetSummary.pending.offerQueue : [];
        return `
            <div class="row type-asset"><strong>G</strong><span>GENERAL · ${slots.generalUsed || 0}/${slots.generalMax || 0}</span><em>SLOTS</em></div>
            <div class="row type-asset"><strong>V</strong><span>VOID · ${slots.voidUsed || 0}/${slots.voidMax || 0}</span><em>ISO</em></div>
            <div class="row type-asset${queue.length ? '' : ' is-empty'}"><strong>Q</strong><span>抽卡队列 · ${queue.length}</span><em>QUEUE</em></div>
        `;
    }

    function buildAssetResourcePageMarkup() {
        const assetSummary = getCurrentAssetDeckSummary();
        const pendingOffer = assetSummary.pending?.offer;
        const activeOffer = pendingOffer && pendingOffer.settled !== true ? pendingOffer : null;
        const detailText = activeOffer
            ? '牌面已展开，等待选择。'
            : (pendingOffer?.settled === true ? '本轮契约已结算。' : '点亮牌池后，会展开本轮契约。');
        const nextStepText = activeOffer ? 'CHOOSE CARD' : (pendingOffer?.settled === true ? 'SETTLED' : 'OPEN POOL');
        const offerOverlayMarkup = buildAssetOfferOverlayMarkup(assetSummary);
        const warehouseOverlayMarkup = buildAssetWarehouseOverlayMarkup(assetSummary);
        return `
            <div class="resource-shell${getPlannedModuleClass('asset')}" data-planned-resource="asset">
                <aside class="side-panel">
                    <div class="eyebrow">ASSET POINT</div>
                    <div class="big-title">契点</div>
                    <div class="meter type-asset"><span>ASSET</span><strong>${getDisplayAssetPoints()}</strong></div>
                    <div class="note">把契令送入牌池，抽取后进入仓库。</div>
                    <button class="action-btn" type="button" data-asset-action="open-warehouse">WAREHOUSE</button>
                </aside>
                <main class="main-panel">
                    <div class="section-head"><span>ASSET POOLS</span><strong>牌池 · 抽取 · 仓库</strong></div>
                    ${buildAssetPoolPanelMarkup(assetSummary)}
                    <div class="queue-grid">
                        <div class="queue-card"><span>ASSET PHASES</span>
                            ${buildScheduledResourceSlotsMarkup('asset')}
                        </div>
                        <div class="queue-card"><span>WAREHOUSE STATE</span>
                            ${buildAssetWarehouseRowsMarkup(assetSummary)}
                        </div>
                    </div>
                </main>
                <aside class="detail-panel">
                    <div class="detail-icon">A</div>
                    <div class="detail-title">契约牌池</div>
                    <div class="detail-text">${detailText}</div>
                    <div class="detail-box"><span>NEXT STEP</span><strong>${nextStepText}</strong></div>
                    <button class="action-btn" type="button" data-asset-action="open-warehouse">OPEN WAREHOUSE</button>
                </aside>
                ${warehouseOverlayMarkup}
                ${offerOverlayMarkup}
            </div>
        `;
    }

    function buildPlannerResourceViewMarkup(activePage) {
        if (activePage === 'combat') {
            return `
                <section class="view theme-combat is-active" data-view="combat">
                    ${buildCombatResourcePageMarkup()}
                </section>
            `;
        }
        if (activePage === 'rest') {
            return `
                <section class="view theme-rest is-active" data-view="rest">
                    ${buildRestResourcePageMarkup()}
                </section>
            `;
        }
        if (activePage === 'asset') {
            return `
                <section class="view theme-asset is-active" data-view="asset">
                    ${buildAssetResourcePageMarkup()}
                </section>
            `;
        }
        if (activePage === 'vision') {
            return `
                <section class="view theme-vision is-active" data-view="vision">
                    ${buildVisionResourcePageMarkup()}
                </section>
            `;
        }
        return '';
    }

    function renderPlannerDrawer() {
        const plannerDrawerMount = document.getElementById('plannerDrawerMount');
        if (!plannerDrawerMount) return;
        const readonlyClass = canUseInteractivePlannerControls() ? '' : ' is-host-readonly';
        const planLocked = isCurrentPhasePlanLocked();
        const lockClass = planLocked ? ' is-plan-locked' : '';
        const inventoryMarkup = appData.planner.inventory.map((item) => {
            const planned = getPlannedResourceState(item.key);
            return `
                <div class="token-dispenser type-${item.key}${planned.amount > 0 ? ' is-planned' : ''}" id="inv_${item.key}" data-planner-tab="${item.key}" data-tab="${item.key}" data-type="${item.key}" data-planned-amount="${planned.amount}">
                    <span class="badge-count" id="count_${item.key}">×0</span>
                    <div class="magic-core"></div>
                    <div class="token-label">${item.label}</div>
                </div>
            `;
        }).join('');
        const activePage = getActivePlannerPage();
        const activeResourcePage = activePage === 'planner' ? '' : activePage;
        const drawerTheme = activeResourcePage || 'asset';
        const drawerOpenClass = appState.drawerOpen ? ' is-hub-open' : '';
        const drawerExpandedClass = appState.drawerOpen && activeResourcePage ? ' is-expanded' : '';
        const assetDeckHash = activePage === 'asset' ? buildPlannerAssetHash() : '';
        const resourceHash = activeResourcePage && activePage !== 'asset' ? buildPlannerResourceHash(activePage) : '';
        const editMode = normalizePlannerEditMode(appState.plannerEditMode);
        const initialLayoutMode = getPlannerLayoutMode();
        plannerDrawerMount.innerHTML = `
            <section class="drawer theme-${drawerTheme}${drawerOpenClass}${drawerExpandedClass}${readonlyClass} ${getPlannerLayoutClass(initialLayoutMode)}" id="drawer" data-active-tab="${activeResourcePage}" data-planner-page="${activePage}" data-edit-mode="${editMode}" data-asset-page="${activePage === 'asset' ? 'deck' : activePage}" data-plan-layout="${initialLayoutMode}" data-asset-hash="${escapePartyHtml(assetDeckHash)}" data-resource-hash="${escapePartyHtml(resourceHash)}">
                <div class="aux-container">
                    ${buildPlannerResourceViewMarkup(activePage)}
                </div>
                <header class="planner-hub">
                    <div class="hub-title">
                        <span>PHASE DEPLOYMENT · RESOURCES</span>
                        <div class="planner-edit-mode" aria-label="Phase point edit mode">
                            <button class="${editMode === 'remove' ? 'is-active' : ''}" type="button" data-planner-edit-mode="remove" ${planLocked ? 'disabled' : ''}>-1</button>
                            <button class="${editMode === 'add' ? 'is-active' : ''}" type="button" data-planner-edit-mode="add" ${planLocked ? 'disabled' : ''}>+1</button>
                        </div>
                    </div>
                    <div class="token-grid${readonlyClass}${lockClass}" id="inventory" aria-label="Phase resource hub">${inventoryMarkup}</div>
                </header>
            </section>
        `;
        bindPlannerLayoutResize();
        requestPlannerLayoutChromeSync();
    }

    function buildPhaseVisionPromptMarkup() {
        const prompt = getCurrentVisionFixedPhasePrompt();
        if (!prompt) return '';
        const replaceButtons = RESOURCE_KEYS.map((key) => `
            <button class="phase-vision-btn type-${key}" type="button" data-vision-phase-action="replace" data-replacement-key="${key}">${RESOURCE_TYPE_MAP[key]}</button>
        `).join('');
        return `
            <div class="phase-vision-prompt" id="phase-vision-prompt" data-phase-key="${prompt.phaseKey}" data-charges="${prompt.charges}">
                <div class="phase-vision-copy">
                    <span>情报改写 x${prompt.charges}</span>
                    <strong>${getRouteOptionLabel(prompt.nodeId)} · ${getPhaseRomanLabel(prompt.phaseIndex)} · ${RESOURCE_TYPE_MAP[prompt.fixedKind]}</strong>
                </div>
                <div class="phase-vision-actions">
                    <button class="phase-vision-btn keep" type="button" data-vision-phase-action="keep">KEEP</button>
                    ${replaceButtons}
                </div>
            </div>
        `;
    }

    function renderPhaseBar() {
        const phaseBarMount = document.getElementById('phaseBarMount');
        if (!phaseBarMount) return;
        const readonlyClass = canUseInteractivePlannerControls() ? '' : ' is-host-readonly';
        const planLocked = isCurrentPhasePlanLocked();
        const lockClass = planLocked ? ' is-plan-locked' : '';
        const plannerControlsMarkup = canOpenPlannerDrawer()
            ? `<div class="planner-controls${readonlyClass}${lockClass}">
                    <button class="toggle-planner-btn${readonlyClass}" id="toggle-planner"><span class="btn-text" id="toggle-planner-label">${appData.planner.toggleClosedLabel.replace(/\s*\/\/$/, '')}</span></button>
                    <button class="planner-commit-btn${lockClass}" id="confirm-phase-plan" type="button" ${planLocked ? 'disabled' : ''}>${planLocked ? 'PLAN LOCKED' : 'CONFIRM PLAN'}</button>
                </div>`
            : `<div class="planner-controls${readonlyClass}"></div>`;
        const phaseSegments = appData.planner.phases.slice(0, -1).map((phase, index) => {
            const startX = 100 + (index * 200);
            const endX = startX + 200;
            return `
                        <g class="seg-future" id="phase-seg-${index}">
                            <path d="M ${startX} 50 C ${startX + 60} 30, ${endX - 60} 70, ${endX} 50" class="magic-thread th-main" />
                            <path d="M ${startX} 50 C ${startX + 60} 30, ${endX - 60} 70, ${endX} 50" class="magic-thread th-flow" />
                        </g>
            `;
        }).join('');

        const phaseMarkup = appData.planner.phases.map((phase, phaseIndex) => {
            const coreMarkup = `
                <div class="phase-core drop-zone" id="${phase.slotId}">
                    <div class="phase-fixed-glyph" id="phase-fixed-glyph-${phaseIndex}"><div class="magic-core"></div></div>
                    <div class="mounted-token" id="mounted-${phase.slotId}"><div class="magic-core"></div></div>
                </div>
            `;
            return `
                <div class="phase-node future" id="phase-node-${phaseIndex}" style="left: ${phase.left};">
                    <div class="phase-label">${phase.phase}</div>
                    ${coreMarkup}
                    <div class="phase-title">${phase.title}</div>
                </div>
            `;
        }).join('');

        phaseBarMount.innerHTML = `
            <div class="phase-bottom-bar">
                ${plannerControlsMarkup}
                <div class="timeline-container">
                    <svg class="phase-svg-layer" viewBox="0 0 800 100" preserveAspectRatio="none">
${phaseSegments}
                    </svg>
                    ${phaseMarkup}
                </div>
                ${buildPhaseVisionPromptMarkup()}
            </div>
        `;
    }

    function needsPlannerDrawerRebuild() {
        const drawer = document.getElementById('drawer');
        const inventory = document.getElementById('inventory');
        if (!drawer || !inventory) return true;
        const shouldBeReadonly = !canUseInteractivePlannerControls();
        if (drawer.classList.contains('is-host-readonly') !== shouldBeReadonly) return true;
        if (inventory.classList.contains('is-host-readonly') !== shouldBeReadonly) return true;
        const activePage = getActivePlannerPage();
        const activeResourcePage = activePage === 'planner' ? '' : activePage;
        if (drawer.dataset.activeTab !== activeResourcePage) return true;
        if (drawer.dataset.plannerPage !== activePage) return true;
        if (drawer.dataset.editMode !== normalizePlannerEditMode(appState.plannerEditMode)) return true;
        if (drawer.dataset.assetPage !== (activePage === 'asset' ? 'deck' : activePage)) return true;
        if (activePage === 'asset' && drawer.dataset.assetHash !== buildPlannerAssetHash()) return true;
        if (activePage !== 'asset' && activePage !== 'planner' && drawer.dataset.resourceHash !== buildPlannerResourceHash(activePage)) return true;
        const activeView = drawer.querySelector('.view.is-active');
        if (activeResourcePage && activeView?.dataset.view !== activeResourcePage) return true;
        if (!activeResourcePage && drawer.querySelector('.view')) return true;
        const renderedCount = inventory.querySelectorAll('.token-dispenser').length;
        return renderedCount !== appData.planner.inventory.length;
    }

    function needsPhaseBarRebuild() {
        const toggleButton = document.getElementById('toggle-planner');
        const phaseNodes = document.querySelectorAll('.phase-node');
        const phaseSegments = document.querySelectorAll('[id^="phase-seg-"]');
        const visionPrompt = document.getElementById('phase-vision-prompt');
        const currentVisionPrompt = getCurrentVisionFixedPhasePrompt();
        const shouldHaveToggle = canOpenPlannerDrawer();
        if (!!toggleButton !== shouldHaveToggle) return true;
        if (phaseNodes.length !== appData.planner.phases.length) return true;
        if (!!visionPrompt !== Boolean(currentVisionPrompt)) return true;
        if (visionPrompt && currentVisionPrompt) {
            if (visionPrompt.dataset.phaseKey !== currentVisionPrompt.phaseKey) return true;
            if (visionPrompt.dataset.charges !== String(currentVisionPrompt.charges)) return true;
        }
        return phaseSegments.length !== Math.max(0, appData.planner.phases.length - 1);
    }

    function syncPlannerDrawerDOM() {
        const drawer = document.getElementById('drawer');
        if (!drawer) return;
        const activePage = getActivePlannerPage();
        const activeResourcePage = activePage === 'planner' ? '' : activePage;
        const planLocked = isCurrentPhasePlanLocked();
        drawer.classList.toggle('is-hub-open', appState.drawerOpen);
        drawer.classList.toggle('is-expanded', appState.drawerOpen && Boolean(activeResourcePage));
        drawer.classList.toggle('is-plan-locked', planLocked);
        drawer.classList.toggle('theme-combat', activeResourcePage === 'combat');
        drawer.classList.toggle('theme-rest', activeResourcePage === 'rest');
        drawer.classList.toggle('theme-asset', !activeResourcePage || activeResourcePage === 'asset');
        drawer.classList.toggle('theme-vision', activeResourcePage === 'vision');

        appData.planner.inventory.forEach((item) => {
            const tokenEl = document.getElementById(`inv_${item.key}`);
            const countEl = document.getElementById(`count_${item.key}`);
            const subEl = document.getElementById(`sub_${item.key}`);
            if (!tokenEl || !countEl) return;
            const total = getTotalInventoryCount(item.key);
            const planned = getPlannedResourceState(item.key);
            const tokenClasses = ['token-dispenser', `type-${item.key}`];
            if (total <= 0 && !tokenEl.dataset.plannerTab) tokenClasses.push('is-empty');
            if (activePage === item.key) tokenClasses.push('is-active');
            if (selectionState.source === 'inventory' && selectionState.type === item.key) tokenClasses.push('is-selected');
            if (planLocked) tokenClasses.push('is-plan-locked');
            if (planned.amount > 0) tokenClasses.push('is-planned');
            setClassNameIfChanged(tokenEl, tokenClasses.join(' '));
            setDatasetIfChanged(tokenEl, 'plannedAmount', planned.amount);
            setTextContentIfChanged(countEl, `×${total}`);
            if (subEl) setTextContentIfChanged(subEl, '');
        });

        document.querySelectorAll('[data-planner-edit-mode]').forEach((button) => {
            button.classList.toggle('is-active', normalizePlannerEditMode(button.dataset.plannerEditMode) === normalizePlannerEditMode(appState.plannerEditMode));
            button.disabled = planLocked;
        });

        syncRestControlPanelDOM();
        requestPlannerLayoutChromeSync();
    }

    function getSelectedRestSlotToken() {
        const slotId = appState.restTintPopupSlotId || (selectionState.source === 'slot' ? selectionState.slotId : '');
        if (!slotId || !canEditPhaseSlot(slotId)) return null;
        const token = appState.phaseSlots[slotId];
        return token?.key === 'rest' ? token : null;
    }

    function canApplyRestTint(tintKey, token = getSelectedRestSlotToken()) {
        if (!token) return false;
        const normalized = normalizeRestTintKey(tintKey, 'neutral');
        if (normalized === 'neutral') return true;
        const currentTint = normalizeRestTintKey(token.tint || token.controlType || token.targetKey, 'neutral');
        if (currentTint === normalized) return true;
        return getTotalInventoryCount(normalized) > 0;
    }

    function openRestTintPopup(slotId = selectionState.slotId) {
        const token = slotId ? appState.phaseSlots[slotId] : null;
        if (!token || token.key !== 'rest') return false;
        setPlannerPage('rest');
        appState.drawerOpen = true;
        appState.restTintPopupSlotId = slotId;
        return true;
    }

    function closeRestTintPopup() {
        appState.restTintPopupSlotId = '';
        document.getElementById('restTintOverlay')?.remove();
    }

    function syncRestControlPanelDOM() {
        const token = getSelectedRestSlotToken();
        const isVisible = Boolean(token) && canUseInteractivePlannerControls();
        const currentTint = token ? normalizeRestTintKey(token.tint || token.controlType || token.targetKey, 'neutral') : 'neutral';
        document.querySelectorAll('[data-rest-tint]').forEach((button) => {
            const tintKey = normalizeRestTintKey(button.dataset.restTint, 'neutral');
            const isActive = tintKey === currentTint;
            const isDisabled = !isVisible || !canApplyRestTint(tintKey, token);
            button.classList.toggle('is-active', isActive);
            button.classList.toggle('is-disabled', isDisabled);
            button.disabled = isDisabled;
        });
    }

    function syncPhaseBarDOM() {
        const planningPhase = isPlanningPhase();
        const toggleButton = document.getElementById('toggle-planner');
        const toggleLabel = document.getElementById('toggle-planner-label');
        const confirmButton = document.getElementById('confirm-phase-plan');
        const commitButton = document.getElementById('commit-act-state');
        const planLocked = isCurrentPhasePlanLocked();
        const currentNodeId = getCurrentNodeData().presentNode;
        if (toggleButton) toggleButton.classList.toggle('is-active', appState.drawerOpen);
        if (toggleLabel) {
            setTextContentIfChanged(toggleLabel, (appState.drawerOpen ? appData.planner.toggleOpenLabel : appData.planner.toggleClosedLabel).replace(/\s*\/\/$/, ''));
        }
        if (confirmButton) {
            confirmButton.classList.toggle('is-plan-locked', planLocked);
            confirmButton.classList.toggle('is-saving', syncState.saving);
            confirmButton.disabled = planLocked || syncState.saving || !canUseInteractivePlannerControls();
            setTextContentIfChanged(confirmButton, planLocked ? 'PLAN LOCKED' : (syncState.saving ? 'SAVING' : 'CONFIRM PLAN'));
        }
        if (commitButton) {
            commitButton.classList.toggle('is-dirty', syncState.dirty);
            commitButton.classList.toggle('is-saving', syncState.saving);
            commitButton.disabled = syncState.saving || !syncState.dirty;
            setTextContentIfChanged(commitButton, syncState.saving ? 'SAVING' : (syncState.dirty ? 'CONFIRM' : 'SYNCED'));
        }
        appData.planner.phases.slice(0, -1).forEach((phase, index) => {
            const segment = document.getElementById(`phase-seg-${index}`);
            if (!segment) return;
            let segmentClass = 'seg-future';
            if (!planningPhase) {
                if (index < appState.currentPhaseIndex - 1) segmentClass = 'seg-past';
                else if (index === appState.currentPhaseIndex - 1) segmentClass = 'seg-active';
            }
            setAttributeIfChanged(segment, 'class', segmentClass);
        });

        appData.planner.phases.forEach((phase, phaseIndex) => {
            const nodeEl = document.getElementById(`phase-node-${phaseIndex}`);
            const coreEl = document.getElementById(phase.slotId);
            const mountedEl = document.getElementById(`mounted-${phase.slotId}`);
            const fixedGlyphEl = document.getElementById(`phase-fixed-glyph-${phaseIndex}`);
            const slotToken = appState.phaseSlots[phase.slotId];
            if (!nodeEl || !coreEl || !mountedEl) return;
            const visionReplacement = getReadyVisionReplacementForPhase(currentNodeId, phaseIndex);
            const encounterMarker = getEncounterMarkerForPhase(currentNodeId, phaseIndex);
            const fixedKind = visionReplacement ? null : getFixedPhaseKind(currentNodeId, phaseIndex);
            const displayToken = getDisplayTokenForPhase(slotToken, currentNodeId, phaseIndex);
            const visionPrompt = getCurrentVisionFixedPhasePrompt();
            const isVisionPromptPhase = Boolean(visionPrompt && visionPrompt.phaseIndex === phaseIndex);

            let state = 'future';
            if (!planningPhase) {
                if (phaseIndex < appState.currentPhaseIndex) state = 'past';
                else if (phaseIndex === appState.currentPhaseIndex) state = 'active';
            }
            setClassNameIfChanged(nodeEl, `phase-node ${state}`);

            const isSlotSelected = (selectionState.source === 'slot' && selectionState.slotId === phase.slotId) || appState.restTintPopupSlotId === phase.slotId;
            const coreClasses = ['phase-core', 'drop-zone'];
            if (displayToken) coreClasses.push('has-token', `type-${displayToken.key}`);
            if (displayToken && !planLocked) coreClasses.push('is-draft-plan');
            if (visionReplacement) coreClasses.push('has-vision-replacement');
            if (fixedKind) coreClasses.push('has-fixed', `fixed-${fixedKind}`);
            if (encounterMarker) coreClasses.push('has-fixed', 'has-encounter-fixed');
            if (isVisionPromptPhase) coreClasses.push('vision-replace-prompt');
            if (isSlotSelected) coreClasses.push('is-selected');
            if (!canEditPhaseSlot(phase.slotId)) {
                coreClasses.push(planLocked ? 'is-plan-readonly' : 'is-locked');
            }
            setClassNameIfChanged(coreEl, coreClasses.join(' '));

            const mountedClasses = ['mounted-token'];
            let mountedTint = '';
            if (displayToken) {
                mountedClasses.push(`type-${displayToken.key}`);
                if (!planLocked) mountedClasses.push('is-draft-plan');
                if (isSlotSelected) mountedClasses.push('is-selected');
                mountedTint = normalizeRestTintKey(displayToken.tint || displayToken.controlType || displayToken.targetKey, '');
                if (displayToken.key === 'rest' && mountedTint) mountedClasses.push(`tint-${mountedTint}`);
            }
            setClassNameIfChanged(mountedEl, mountedClasses.join(' '));
            if (displayToken) {
                setDatasetIfChanged(mountedEl, 'type', displayToken.type);
                setDatasetIfChanged(mountedEl, 'source', displayToken.source);
                setDatasetIfChanged(mountedEl, 'amount', Math.max(1, Math.min(3, Math.round(Number(displayToken.amount) || 1))));
                if (displayToken.visionReplacement) setDatasetIfChanged(mountedEl, 'visionReplacement', 'true');
                else removeAttributeIfPresent(mountedEl, 'data-vision-replacement');
                if (displayToken.key === 'rest' && mountedTint) {
                    setDatasetIfChanged(mountedEl, 'tint', RESOURCE_TYPE_MAP[mountedTint] || mountedTint.toUpperCase());
                } else {
                    removeAttributeIfPresent(mountedEl, 'data-tint');
                }
            } else {
                removeAttributeIfPresent(mountedEl, 'data-type');
                removeAttributeIfPresent(mountedEl, 'data-source');
                removeAttributeIfPresent(mountedEl, 'data-amount');
                removeAttributeIfPresent(mountedEl, 'data-tint');
                removeAttributeIfPresent(mountedEl, 'data-vision-replacement');
            }

            if (fixedGlyphEl) {
                const fixedGlyphClasses = ['phase-fixed-glyph'];
                let fixedGlyphTitle = null;
                let fixedGlyphMarkup = '<div class="magic-core"></div>';
                if (encounterMarker) {
                    fixedGlyphClasses.push('type-encounter', 'is-visible');
                    if (encounterMarker.type === 'pre_signal') fixedGlyphClasses.push('is-pre-signal');
                    fixedGlyphTitle = `${encounterMarker.charKey} · ${encounterMarker.type === 'pre_signal' ? 'PRE SIGNAL' : 'FIRST MEET'}`;
                    fixedGlyphMarkup = buildEncounterFixedGlyphMarkup(encounterMarker);
                } else if (fixedKind) {
                    fixedGlyphClasses.push(`type-${fixedKind}`, 'is-visible');
                    fixedGlyphTitle = getFixedPhaseMarker(currentNodeId, phaseIndex)?.title || '';
                }
                setClassNameIfChanged(fixedGlyphEl, fixedGlyphClasses.join(' '));
                if (fixedGlyphTitle === null) removeAttributeIfPresent(fixedGlyphEl, 'title');
                else if (fixedGlyphEl.title !== fixedGlyphTitle) fixedGlyphEl.title = fixedGlyphTitle;
                setInnerHTMLIfChanged(fixedGlyphEl, fixedGlyphMarkup);
            }
        });
    }

    return Object.freeze({
        getActivePlannerPage,
        setPlannerPage,
        normalizePlannerEditMode,
        setPlannerEditMode,
        renderPlannerDrawer,
        renderPhaseBar,
        needsPlannerDrawerRebuild,
        needsPhaseBarRebuild,
        syncPlannerDrawerDOM,
        getSelectedRestSlotToken,
        canApplyRestTint,
        openRestTintPopup,
        closeRestTintPopup,
        syncRestControlPanelDOM,
        syncPhaseBarDOM
    });
    }

    global.ACE0OverviewPlannerView = Object.freeze({ create });
})(typeof window !== 'undefined' ? window : globalThis);
