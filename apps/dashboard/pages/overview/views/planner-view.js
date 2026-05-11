(function initAce0OverviewPlannerView(global) {
    // Intentionally not strict: this view keeps migrated planner markup helpers in a
    // ctx-backed with scope while overview remains a static-script page.

    function create(ctx = {}) {
        with (ctx) {
    const PLAN_LAYOUT_WIDE_WIDTH = 1080;
    const PLAN_LAYOUT_NARROW_WIDTH = 760;
    const PLAN_LAYOUT_MIN_HEIGHT = 260;
    let plannerLayoutResizeObserver = null;
    let observedPlannerDrawer = null;
    let observedPlannerAux = null;

    function getPlannerLayoutMode(drawer, auxContainer) {
        const drawerWidth = Math.max(0, drawer?.getBoundingClientRect?.().width || 0);
        const isExpanded = drawer?.classList?.contains('is-expanded') === true;
        const auxHeight = isExpanded
            ? Math.max(0, auxContainer?.getBoundingClientRect?.().height || 0)
            : Number.POSITIVE_INFINITY;
        if ((drawerWidth > 0 && drawerWidth < PLAN_LAYOUT_NARROW_WIDTH) || auxHeight < PLAN_LAYOUT_MIN_HEIGHT) return 'narrow';
        if (drawerWidth > 0 && drawerWidth < PLAN_LAYOUT_WIDE_WIDTH) return 'mid';
        return 'wide';
    }

    function observePlannerLayout(drawer, auxContainer) {
        if (typeof ResizeObserver !== 'function' || !drawer || !auxContainer) return;
        if (!plannerLayoutResizeObserver) {
            plannerLayoutResizeObserver = new ResizeObserver(() => syncPlannerLayoutChrome());
        }
        if (observedPlannerDrawer === drawer && observedPlannerAux === auxContainer) return;
        plannerLayoutResizeObserver.disconnect();
        plannerLayoutResizeObserver.observe(drawer);
        plannerLayoutResizeObserver.observe(auxContainer);
        observedPlannerDrawer = drawer;
        observedPlannerAux = auxContainer;
    }

    function syncPlannerLayoutChrome() {
        const drawer = document.getElementById('drawer');
        if (!drawer) return;
        const auxContainer = drawer.querySelector('.aux-container');
        const mode = getPlannerLayoutMode(drawer, auxContainer);
        drawer.classList.toggle('plan-layout-wide', mode === 'wide');
        drawer.classList.toggle('plan-layout-mid', mode === 'mid');
        drawer.classList.toggle('plan-layout-narrow', mode === 'narrow');
        drawer.dataset.planLayout = mode;
        observePlannerLayout(drawer, auxContainer);
    }

    function getAssetCardDisplayName(card) {
        if (card?.name) return card.name;
        const assetModule = getAssetDeckModuleApi();
        const catalog = assetModule && typeof assetModule.getCatalog === 'function' ? assetModule.getCatalog() : [];
        const catalogCard = Array.isArray(catalog)
            ? catalog.find((item) => item?.id === card?.cardId)
            : null;
        return catalogCard?.name || card?.name || card?.cardId || 'EMPTY';
    }

    function getAssetCardLevelLabel(card) {
        const level = Math.max(0, Math.round(Number(card?.level) || 0));
        return level > 0 ? `LV ${level}` : String(card?.kind || 'CARD').toUpperCase();
    }

    function buildAssetCardTagsMarkup(card) {
        const tags = [
            card?.rarity,
            card?.system,
            ...(Array.isArray(card?.gameTags) ? card.gameTags : []),
            ...(Array.isArray(card?.slotTags) ? card.slotTags : [])
        ].map((tag) => typeof tag === 'string' ? tag.trim() : '').filter(Boolean).slice(0, 4);
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
        { pool: 'low', level: 1, code: 'I', title: '一级卡池', label: 'LOW EXTRACT', cost: 1, note: '基础契令，偏向铜 / 银。' },
        { pool: 'mid', level: 2, code: 'II', title: '二级卡池', label: 'MID EXTRACT', cost: 2, note: '进阶契令，提升金卡概率。' },
        { pool: 'high', level: 3, code: 'III', title: '三级卡池', label: 'HIGH EXTRACT', cost: 3, note: '高阶契令，开放虹卡权重。' }
    ]);

    function buildAssetPoolCardMarkup(meta, assetSummary, plannedAsset) {
        const points = Math.max(0, Math.round(Number(assetSummary?.points) || 0));
        const isActive = plannedAsset.maxAmount >= meta.level;
        const canOpen = isActive && points >= meta.cost && !assetSummary?.pending?.offer;
        const stateText = !isActive ? 'LOCKED' : (points >= meta.cost ? 'READY' : `NEED ${meta.cost}`);
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
        return rows || `<div class="row is-empty"><strong>-</strong><span>没有更多${escapePartyHtml(RESOURCE_LABEL_MAP[normalizedKey] || '')}点</span><em>EMPTY</em></div>`;
    }

    function buildControlledNodeSummaryMarkup() {
        const actState = buildCurrentActStateSnapshot();
        const controlled = actState.controlledNodes && typeof actState.controlledNodes === 'object'
            ? Object.entries(actState.controlledNodes)
            : [];
        const rows = controlled.slice(-4).reverse().map(([nodeId, entry]) => {
            const type = normalizeRestTintKey(entry?.type || entry?.tint || entry?.key, 'neutral');
            const label = type === 'neutral' ? 'NEUTRAL' : (RESOURCE_TYPE_MAP[type] || type.toUpperCase());
            return `
                <div class="row type-${type}">
                    <strong>${escapePartyHtml(label.slice(0, 1))}</strong>
                    <span>${escapePartyHtml(getRouteOptionLabel(nodeId) || nodeId)} · ${escapePartyHtml(label)} tint</span>
                    <em>+0.25</em>
                </div>
            `;
        }).join('');
        return rows || '<div class="row is-empty"><strong>-</strong><span>没有更多控制节点</span><em>EMPTY</em></div>';
    }

    function getRestTintActionMeta(tintKey, token = getSelectedRestSlotToken()) {
        const normalized = normalizeRestTintKey(tintKey, 'neutral');
        const currentTint = token ? normalizeRestTintKey(token.tint || token.controlType || token.targetKey, 'neutral') : 'neutral';
        const labelMap = {
            neutral: { title: '默认休整', note: '只结算回复，不追加节点染色。' },
            rest: { title: '休整染色', note: '稳定节奏，强化后续回复窗口。' },
            asset: { title: '契点染色', note: '倾向后续契约池与技能槽操作。' },
            vision: { title: '情报染色', note: '倾向视野、路径与固定相位信息。' },
            combat: { title: '交锋接口', note: '先保留接口，等待战斗 adapter 接入。' }
        };
        if (normalized === 'neutral') {
            return {
                disabled: !token,
                active: currentTint === 'neutral',
                ...(labelMap.neutral),
                note: token ? labelMap.neutral.note : '先选择一个未来 Rest 相位。'
            };
        }
        const source = getPreferredSourceForKey(normalized);
        const disabled = !token || (!source && currentTint !== normalized);
        return {
            disabled,
            active: currentTint === normalized,
            ...(labelMap[normalized] || { title: getRestTintLabel(normalized), note: '' }),
            note: !token
                ? '先选择一个未来 Rest 相位。'
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
        let note = 'Vision 1 会扩大未来节点可见范围。';
        if (pending && pending.status === 'ready') {
            label = '固定相位替换';
            value = 'READY';
            note = '抵达目标相位时，底部 phase bar 会要求 KEEP 或替换。';
        } else if (pending && ['charged', 'choosing'].includes(pending.status)) {
            label = '固定相位替换';
            value = `CHARGED x${Math.max(1, Math.round(Number(pending.charges) || 1))}`;
            note = '等待下一个可替换 fixed phase。';
        } else if (vision.jumpReady || routeMode === 'jump') {
            label = '跃迁';
            value = isRouteSelectionActive() ? 'CHOOSE ROUTE' : 'READY';
            note = isRouteSelectionActive() ? '可在下方候选中选择跃迁目标。' : '抵达 route 阶段后可跨线选择。';
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
                    <div class="note">只生成外部结算请求，不伪造收益。</div>
                    <button class="action-btn" type="button">REQUEST QUEUE</button>
                </aside>
                <main class="main-panel">
                    <div class="section-head"><span>COMBAT RULES</span><strong>外部结算</strong></div>
                    <div class="rule-grid">
                        ${buildRuleCardMarkup('combat', 1, '小游戏', '低风险外部请求。')}
                        ${buildRuleCardMarkup('combat', 2, '精英德州', '生成精英对局请求。')}
                        ${buildRuleCardMarkup('combat', 3, 'Boss 德州', '等待 adapter 回写。')}
                    </div>
                    <div class="queue-grid">
                        <div class="queue-card"><span>COMBAT PHASES</span>
                            ${buildScheduledResourceSlotsMarkup('combat')}
                        </div>
                        <div class="queue-card"><span>EXTERNAL REQUESTS</span>
                            ${buildCombatSettlementRowsMarkup(actState)}
                        </div>
                    </div>
                </main>
                <aside class="detail-panel">
                    <div class="detail-icon">C</div>
                    <div class="detail-title">请求详情</div>
                    <div class="detail-text">最终由德州或小游戏 adapter 决定收益、损失与状态回写。</div>
                    <div class="detail-box"><span>ADAPTER</span><strong>PENDING</strong></div>
                </aside>
            </div>
        `;
    }

    function buildRestResourcePageMarkup() {
        const selectedRest = getSelectedRestSlotToken();
        const selectedTint = selectedRest
            ? normalizeRestTintKey(selectedRest.tint || selectedRest.controlType || selectedRest.targetKey, 'neutral')
            : 'neutral';
        const showTintOverlay = Boolean(selectedRest && appState.restTintPopupSlotId);
        return `
            <div class="resource-shell${getPlannedModuleClass('rest')}" data-planned-resource="rest">
                <aside class="side-panel">
                    <div class="eyebrow">REST POINT</div>
                    <div class="big-title">休整点</div>
                    ${buildResourceMeterMarkup('rest')}
                    <div class="note">回复 Mana、染色节点、稳定节奏。</div>
                    <button class="action-btn" type="button" data-open-rest-tint>SET TINT</button>
                </aside>
                <main class="main-panel">
                    <div class="section-head"><span>REST RULES</span><strong>回复 · 染色 · 营收</strong></div>
                    <div class="rule-grid">
                        ${buildRuleCardMarkup('rest', 1, '回复 25%', '可追加节点染色。')}
                        ${buildRuleCardMarkup('rest', 2, '回复 66%', '固定营收 +0.25。')}
                        ${buildRuleCardMarkup('rest', 3, '回复 100%', '完整重整。')}
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
                    <div class="detail-title">染色状态</div>
                    <div class="detail-text">当前选择 ${escapePartyHtml(selectedTint.toUpperCase())}，不额外消耗其他点数。</div>
                    <div class="detail-box"><span>CURRENT</span><strong>${escapePartyHtml(selectedTint.toUpperCase())}</strong></div>
                </aside>
                ${showTintOverlay ? `<div class="tint-overlay" id="restTintOverlay" role="dialog" aria-label="Rest Tint">
                    <section class="tint-panel">
                        <div class="tint-head"><span>REST RESOLUTION</span><strong>SELECT TINT</strong></div>
                        <div class="tint-grid">${buildRestTintActionsMarkup()}</div>
                        <div class="tint-foot"><span>DEFAULT POPUP · ON RESOLVE</span><button class="action-btn" type="button" data-close-rest-tint>SKIP</button></div>
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
                    <div class="note">有限视野、固定相位替换、跃迁路径。</div>
                    <button class="action-btn" type="button">SCAN ROUTE</button>
                </aside>
                <main class="main-panel">
                    <div class="section-head"><span>VISION RULES</span><strong>视野 · 替换 · 跃迁</strong></div>
                    <div class="rule-grid">
                        ${buildRuleCardMarkup('vision', 1, '探路', '当前视野 +2。')}
                        ${buildRuleCardMarkup('vision', 2, '替换相位', '可替换固定事件。')}
                        ${buildRuleCardMarkup('vision', 3, '跃迁', '显示连续路径线。')}
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
                    <div class="detail-title">跃迁就绪</div>
                    <div class="detail-text">抵达 route 阶段后可以跨线选择。</div>
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
        const attrs = [
            action ? `data-asset-action="${escapePartyHtml(action)}"` : '',
            choiceIndex != null ? `data-choice-index="${choiceIndex}"` : '',
            slotType ? `data-slot-type="${escapePartyHtml(slotType)}"` : '',
            slotIndex != null ? `data-slot-index="${slotIndex}"` : '',
            confirmDestroy ? 'data-confirm-destroy="true"' : ''
        ].filter(Boolean).join(' ');
        const accent = String(card.system || card.kind || '').toLowerCase().includes('void') ? 'var(--void)' : 'var(--asset)';
        const glyph = String(card.system || card.kind || 'A').slice(0, 1).toUpperCase();
        return `
            <button class="cmd-card rarity-${escapePartyHtml(String(card.rarity || 'bronze').toLowerCase())}${compact ? ' is-compact' : ''}" style="--card-accent:${accent};" type="button" ${attrs}>
                <div class="cmd-card-accent-line"></div>
                <div class="bg-svg">${escapePartyHtml(glyph)}</div>
                <span class="cmd-type">${escapePartyHtml(String(card.rarity || 'bronze').toUpperCase())} · ${escapePartyHtml(String(card.kind || 'card').toUpperCase())}</span>
                <div class="cmd-name-row">
                    <span class="cmd-name">${escapePartyHtml(getAssetCardDisplayName(card))}</span>
                    <span class="cmd-level">${escapePartyHtml(getAssetCardLevelLabel(card))}</span>
                </div>
                <div class="cmd-desc">${escapePartyHtml(String(card.skillKey || '').replace(/_/g, ' ') || String(card.kind || 'ACTIVE CARD'))}</div>
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
        const accent = String(card.system || card.kind || '').toLowerCase().includes('void') || slotType === 'void' ? 'var(--void)' : 'var(--asset)';
        return `
            <div class="mini-slot filled${canReplace ? ' is-replaceable' : ''}" style="--c:${accent};" data-asset-action="${canReplace ? 'replace-card' : ''}" data-slot-type="${escapePartyHtml(slotType)}" data-slot-index="${index}"${confirmDestroy ? ' data-confirm-destroy="true"' : ''}>
                <span class="type">${escapePartyHtml(String(card.kind || card.system || 'ASSET').toUpperCase())}</span>
                <div class="name-row"><span class="name">${escapePartyHtml(getAssetCardDisplayName(card))}</span><span class="lvl">${escapePartyHtml(getAssetCardLevelLabel(card))}</span></div>
            </div>
        `;
    }

    function buildAssetOfferChoiceMarkup(card, index) {
        const slotTags = Array.isArray(card?.slotTags) ? card.slotTags : [];
        const canUseVoid = slotTags.includes('void');
        return `
            <div class="choice">
                ${buildAssetCardMarkup(card, { compact: true })}
                <div class="choice-actions">
                    <button type="button" data-asset-action="choose-card" data-choice-index="${index}" data-slot-type="general">GENERAL</button>
                    ${canUseVoid ? `<button type="button" data-asset-action="choose-card" data-choice-index="${index}" data-slot-type="void">VOID</button>` : ''}
                </div>
            </div>
        `;
    }

    function buildAssetOfferOverlayMarkup(assetSummary) {
        const pendingOffer = assetSummary.pending?.offer;
        const queuedOffers = Array.isArray(assetSummary.pending?.offerQueue) ? assetSummary.pending.offerQueue : [];
        const queueText = queuedOffers.length ? ` · QUEUE ${queuedOffers.length}` : '';
        const offerMarkup = pendingOffer?.choices?.length
            ? pendingOffer.choices.map((card, index) => buildAssetOfferChoiceMarkup(card, index)).join('')
            : '';
        if (!offerMarkup) return '';
        return `
            <div class="offer-overlay pool-${escapePartyHtml(String(pendingOffer?.pool || 'low').toLowerCase())}" role="dialog" aria-label="Contract Extract">
                <section class="offer-panel draw-panel">
                    <div class="offer-head"><span>CONTRACT EXTRACT${escapePartyHtml(queueText)}</span><strong>${escapePartyHtml(String(pendingOffer?.pool || 'POOL').toUpperCase())}</strong></div>
                    <div class="offer-grid">${offerMarkup}</div>
                    <div class="offer-foot">
                        <span>DECK POINTS · ${assetSummary.points}</span>
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
                    <span>${pendingReplace.confirm_destroy ? 'CONFIRM DESTROY' : 'PENDING REPLACE'}</span>
                    <strong>${escapePartyHtml(getAssetCardDisplayName(pendingReplace.card))}</strong>
                    <em>${pendingReplace.confirm_destroy ? 'Protected Rainbow/God card selected. Click the highlighted slot again to destroy it.' : 'Choose a highlighted occupied slot. Old card will be destroyed.'}</em>
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
                        <span class="detect-label">ASSET POINTS · ${assetSummary.points}</span>
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
                                <button class="btn-unequip" type="button" disabled>REPLACE & DESTROY OLD CARD</button>
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
        const offerOverlayMarkup = buildAssetOfferOverlayMarkup(assetSummary);
        const warehouseOverlayMarkup = buildAssetWarehouseOverlayMarkup(assetSummary);
        return `
            <div class="resource-shell${getPlannedModuleClass('asset')}" data-planned-resource="asset">
                <aside class="side-panel">
                    <div class="eyebrow">ASSET POINT</div>
                    <div class="big-title">契点</div>
                    <div class="meter type-asset"><span>DECK POINTS</span><strong>${Math.max(0, Math.round(Number(assetSummary.points) || 0))}</strong></div>
                    <div class="note">投入契点激活一级 / 二级 / 三级卡池，满足条件后进入抽卡页面。</div>
                    <button class="action-btn" type="button" data-asset-action="open-warehouse">WAREHOUSE</button>
                </aside>
                <main class="main-panel">
                    <div class="section-head"><span>ASSET RULES</span><strong>卡池 · 抽取 · 仓库</strong></div>
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
                    <div class="detail-title">契约卡池</div>
                    <div class="detail-text">${pendingOffer ? '当前已有抽卡页面等待选择。' : '激活卡池并消耗 Deck Points 后，会弹出抽卡页面。'}</div>
                    <div class="detail-box"><span>NEXT STEP</span><strong>${pendingOffer ? 'CHOOSE CARD' : 'OPEN POOL'}</strong></div>
                    <button class="action-btn" type="button" data-asset-action="open-warehouse">OPEN WAREHOUSE</button>
                </aside>
                ${warehouseOverlayMarkup}
                ${offerOverlayMarkup}
            </div>
        `;
    }

    function renderPlannerDrawer() {
        const plannerDrawerMount = document.getElementById('plannerDrawerMount');
        if (!plannerDrawerMount) return;
        const readonlyClass = canUseInteractivePlannerControls() ? '' : ' is-host-readonly';
        const planLocked = typeof isPhasePlanConfirmedForCurrentNode === 'function' && isPhasePlanConfirmedForCurrentNode();
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
        const assetDeckHash = JSON.stringify({
            summary: getCurrentAssetDeckSummary(),
            assetWarehouseOpen: appState.assetWarehouseOpen,
            phaseSlots: appState.phaseSlots
        });
        const resourceHash = JSON.stringify({
            page: activePage,
            inventory: appState.inventory,
            phaseSlots: appState.phaseSlots,
            selection: selectionState,
            phasePlanLocked: typeof isPhasePlanConfirmedForCurrentNode === 'function' && isPhasePlanConfirmedForCurrentNode(),
            restTintPopupSlotId: appState.restTintPopupSlotId,
            nodeId: appState.currentNodeId,
            nodeIndex: appState.currentNodeIndex,
            vision: getVisionStateForDashboard()
        });
        const editMode = normalizePlannerEditMode(appState.plannerEditMode);
        plannerDrawerMount.innerHTML = `
            <section class="drawer theme-${drawerTheme}${drawerOpenClass}${drawerExpandedClass}${readonlyClass}" id="drawer" data-active-tab="${activeResourcePage}" data-planner-page="${activePage}" data-edit-mode="${editMode}" data-asset-page="${activePage === 'asset' ? 'deck' : activePage}" data-asset-hash="${escapePartyHtml(assetDeckHash)}" data-resource-hash="${escapePartyHtml(resourceHash)}">
                <div class="aux-container">
                    <section class="view theme-combat ${activePage === 'combat' ? 'is-active' : ''}" data-view="combat">
                        ${buildCombatResourcePageMarkup()}
                    </section>
                    <section class="view theme-rest ${activePage === 'rest' ? 'is-active' : ''}" data-view="rest">
                        ${buildRestResourcePageMarkup()}
                    </section>
                    <section class="view theme-asset ${activePage === 'asset' ? 'is-active' : ''}" data-view="asset">
                        ${buildAssetResourcePageMarkup()}
                    </section>
                    <section class="view theme-vision ${activePage === 'vision' ? 'is-active' : ''}" data-view="vision">
                        ${buildVisionResourcePageMarkup()}
                    </section>
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
        syncPlannerLayoutChrome();
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
        const planLocked = typeof isPhasePlanConfirmedForCurrentNode === 'function' && isPhasePlanConfirmedForCurrentNode();
        const lockClass = planLocked ? ' is-plan-locked' : '';
        const plannerControlsMarkup = canOpenPlannerDrawer()
            ? `<div class="planner-controls${readonlyClass}${lockClass}">
                    <button class="toggle-planner-btn${readonlyClass}" id="toggle-planner"><span class="btn-text" id="toggle-planner-label">${appData.planner.toggleClosedLabel.replace(/\s*\/\/$/, '')}</span></button>
                    <button class="planner-commit-btn${lockClass}" id="confirm-phase-plan" type="button" ${planLocked ? 'disabled' : ''}>${planLocked ? 'PLAN LOCKED' : 'CONFIRM PLAN'}</button>
                    <div class="planner-sync-status${planLocked ? ' is-locked' : ''}" id="planner-sync-status">${planLocked ? '本节点编排已确认' : ''}</div>
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
        const resourceHash = JSON.stringify({
            page: activePage,
            inventory: appState.inventory,
            phaseSlots: appState.phaseSlots,
            selection: selectionState,
            restTintPopupSlotId: appState.restTintPopupSlotId,
            nodeId: appState.currentNodeId,
            nodeIndex: appState.currentNodeIndex,
            vision: getVisionStateForDashboard()
        });
        if (drawer.dataset.activeTab !== activeResourcePage) return true;
        if (drawer.dataset.plannerPage !== activePage) return true;
        if (drawer.dataset.editMode !== normalizePlannerEditMode(appState.plannerEditMode)) return true;
        if (drawer.dataset.assetPage !== (activePage === 'asset' ? 'deck' : activePage)) return true;
        if (activePage === 'asset' && drawer.dataset.assetHash !== JSON.stringify({
            summary: getCurrentAssetDeckSummary(),
            assetWarehouseOpen: appState.assetWarehouseOpen,
            phaseSlots: appState.phaseSlots
        })) return true;
        if (activePage !== 'asset' && activePage !== 'planner' && drawer.dataset.resourceHash !== resourceHash) return true;
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
        const planLocked = typeof isPhasePlanConfirmedForCurrentNode === 'function' && isPhasePlanConfirmedForCurrentNode();
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
            tokenEl.className = `token-dispenser type-${item.key}`;
            tokenEl.classList.toggle('is-empty', total <= 0 && !tokenEl.dataset.plannerTab);
            tokenEl.classList.toggle('is-active', activePage === item.key);
            tokenEl.classList.toggle('is-selected', selectionState.source === 'inventory' && selectionState.type === item.key);
            tokenEl.classList.toggle('is-plan-locked', planLocked);
            const planned = getPlannedResourceState(item.key);
            tokenEl.classList.toggle('is-planned', planned.amount > 0);
            tokenEl.dataset.plannedAmount = String(planned.amount);
            countEl.textContent = `×${total}`;
            if (subEl) subEl.textContent = '';
        });

        document.querySelectorAll('[data-planner-edit-mode]').forEach((button) => {
            button.classList.toggle('is-active', normalizePlannerEditMode(button.dataset.plannerEditMode) === normalizePlannerEditMode(appState.plannerEditMode));
            button.disabled = planLocked;
        });

        syncRestControlPanelDOM();
        syncPlannerLayoutChrome();
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
        const syncStatus = document.getElementById('planner-sync-status');
        const planLocked = typeof isPhasePlanConfirmedForCurrentNode === 'function' && isPhasePlanConfirmedForCurrentNode();
        if (toggleButton) toggleButton.classList.toggle('is-active', appState.drawerOpen);
        if (toggleLabel) {
            toggleLabel.textContent = (appState.drawerOpen ? appData.planner.toggleOpenLabel : appData.planner.toggleClosedLabel).replace(/\s*\/\/$/, '');
        }
        if (confirmButton) {
            confirmButton.classList.toggle('is-plan-locked', planLocked);
            confirmButton.classList.toggle('is-saving', syncState.saving);
            confirmButton.disabled = planLocked || syncState.saving || !canUseInteractivePlannerControls();
            confirmButton.textContent = planLocked ? 'PLAN LOCKED' : (syncState.saving ? 'SAVING' : 'CONFIRM PLAN');
        }
        if (commitButton) {
            commitButton.classList.toggle('is-dirty', syncState.dirty);
            commitButton.classList.toggle('is-saving', syncState.saving);
            commitButton.disabled = syncState.saving || !syncState.dirty;
            commitButton.textContent = syncState.saving ? 'SAVING' : (syncState.dirty ? 'CONFIRM' : 'SYNCED');
        }
        if (syncStatus) {
            syncStatus.className = 'planner-sync-status';
            if (syncState.errorText) syncStatus.classList.add('is-error');
            else if (syncState.saving) syncStatus.classList.add('is-saving');
            else if (planLocked) syncStatus.classList.add('is-locked');
            else if (syncState.dirty) syncStatus.classList.add('is-dirty');
            syncStatus.textContent = syncState.errorText
                || (syncState.saving ? syncState.statusText : '')
                || (planLocked ? '本节点编排已确认' : syncState.statusText);
        }

        appData.planner.phases.slice(0, -1).forEach((phase, index) => {
            const segment = document.getElementById(`phase-seg-${index}`);
            if (!segment) return;
            let segmentClass = 'seg-future';
            if (!planningPhase) {
                if (index < appState.currentPhaseIndex - 1) segmentClass = 'seg-past';
                else if (index === appState.currentPhaseIndex - 1) segmentClass = 'seg-active';
            }
            segment.setAttribute('class', segmentClass);
        });

        appData.planner.phases.forEach((phase, phaseIndex) => {
            const nodeEl = document.getElementById(`phase-node-${phaseIndex}`);
            const coreEl = document.getElementById(phase.slotId);
            const mountedEl = document.getElementById(`mounted-${phase.slotId}`);
            const fixedGlyphEl = document.getElementById(`phase-fixed-glyph-${phaseIndex}`);
            const slotToken = appState.phaseSlots[phase.slotId];
            if (!nodeEl || !coreEl || !mountedEl) return;
            const currentNodeId = getCurrentNodeData().presentNode;
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
            nodeEl.className = `phase-node ${state}`;

            coreEl.className = 'phase-core drop-zone';
            if (displayToken) coreEl.classList.add('has-token', `type-${displayToken.key}`);
            if (visionReplacement) coreEl.classList.add('has-vision-replacement');
            if (fixedKind) coreEl.classList.add('has-fixed', `fixed-${fixedKind}`);
            if (encounterMarker) coreEl.classList.add('has-fixed', 'has-encounter-fixed');
            if (isVisionPromptPhase) coreEl.classList.add('vision-replace-prompt');
            if ((selectionState.source === 'slot' && selectionState.slotId === phase.slotId) || appState.restTintPopupSlotId === phase.slotId) coreEl.classList.add('is-selected');
            if (!canEditPhaseSlot(phase.slotId)) coreEl.classList.add('is-locked');

            mountedEl.className = 'mounted-token';
            mountedEl.removeAttribute('data-type');
            mountedEl.removeAttribute('data-source');
            mountedEl.removeAttribute('data-amount');
            mountedEl.removeAttribute('data-tint');
            mountedEl.removeAttribute('data-vision-replacement');
            if (displayToken) {
                mountedEl.classList.add(`type-${displayToken.key}`);
                if ((selectionState.source === 'slot' && selectionState.slotId === phase.slotId) || appState.restTintPopupSlotId === phase.slotId) mountedEl.classList.add('is-selected');
                mountedEl.dataset.type = displayToken.type;
                mountedEl.dataset.source = displayToken.source;
                mountedEl.dataset.amount = String(Math.max(1, Math.min(3, Math.round(Number(displayToken.amount) || 1))));
                if (displayToken.visionReplacement) mountedEl.dataset.visionReplacement = 'true';
                const tint = normalizeRestTintKey(displayToken.tint || displayToken.controlType || displayToken.targetKey, '');
                if (displayToken.key === 'rest' && tint) {
                    mountedEl.classList.add(`tint-${tint}`);
                    mountedEl.dataset.tint = RESOURCE_TYPE_MAP[tint] || tint.toUpperCase();
                }
            }

            if (fixedGlyphEl) {
                fixedGlyphEl.className = 'phase-fixed-glyph';
                if (encounterMarker) {
                    fixedGlyphEl.classList.add('type-encounter', 'is-visible');
                    fixedGlyphEl.classList.toggle('is-pre-signal', encounterMarker.type === 'pre_signal');
                    fixedGlyphEl.title = `${encounterMarker.charKey} · ${encounterMarker.type === 'pre_signal' ? 'PRE SIGNAL' : 'FIRST MEET'}`;
                    fixedGlyphEl.innerHTML = buildEncounterFixedGlyphMarkup(encounterMarker);
                } else if (fixedKind) {
                    fixedGlyphEl.classList.add(`type-${fixedKind}`, 'is-visible');
                    fixedGlyphEl.title = getFixedPhaseMarker(getCurrentNodeData().presentNode, phaseIndex)?.title || '';
                    fixedGlyphEl.innerHTML = '<div class="magic-core"></div>';
                } else {
                    fixedGlyphEl.removeAttribute('title');
                    fixedGlyphEl.innerHTML = '<div class="magic-core"></div>';
                }
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
    }

    global.ACE0OverviewPlannerView = Object.freeze({ create });
})(typeof window !== 'undefined' ? window : globalThis);
