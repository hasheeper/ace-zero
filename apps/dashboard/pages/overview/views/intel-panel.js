(function initAce0OverviewIntelPanel(global) {
    function create(ctx = {}) {
        const {
            ENCOUNTER_DEBUG_CHARACTER_KEYS,
            ENCOUNTER_DEBUG_FLAG_OPTIONS,
            ENCOUNTER_DEBUG_TAG_OPTIONS,
            ENCOUNTER_REASON_LABELS,
            PHASE_SLOT_IDS,
            RESOURCE_KEYS,
            RESOURCE_LABEL_MAP,
            RESOURCE_TYPE_MAP,
            WORLD_LOCATION_LAYERS,
            adapterState,
            appData,
            appState,
            buildCurrentActStateSnapshot,
            buildInitialDebugPayload,
            canAdvanceCurrentPhase,
            canExecuteCurrentNode,
            canUseNodeAdvanceControl,
            canUsePhaseAdvanceControl,
            deepCloneValue,
            extractHeroPayload,
            getActModuleApi,
            getAdapterModeLabel,
            getCampaignConfig,
            getCampaignTotalNodes,
            getCurrentAssetDeckSummary,
            getCurrentEncounterDebugContext,
            getCurrentNodeData,
            getCurrentWorldLocation,
            getDebugChapterTransitionOption,
            getDebugEncounterContext,
            getEncounterMarkerForPhase,
            getFixedPhaseKind,
            getReadyVisionReplacementForPhase,
            getRouteOptionLabel,
            getRouteOptions,
            getSeedDisplayLabel,
            getVisionStateForDashboard,
            getWorldLocationLayerLabel,
            isOverviewDebugMode,
            isPhasePlanConfirmedForCurrentNode,
            isRouteSelectionActive,
            normalizeActStage,
            normalizePendingAssetDeckCommandsForDashboard,
            normalizeResourceKey,
            normalizeRestTintKey,
            syncState
        } = ctx;

    const PARTY_ORDER = [
        { key: 'rino',    suit: '♥', exclusiveLabel: 'Bond',         exclusiveCn: '羁绊度' },
        { key: 'kuzuha',  suit: '♣', exclusiveLabel: 'Debtbind',     exclusiveCn: '债缚度' },
        { key: 'poppy',   suit: '♦', exclusiveLabel: 'Nesting',      exclusiveCn: '寄生度' },
        { key: 'sia',     suit: '♠', exclusiveLabel: 'Custody',      exclusiveCn: '接管度' },
        { key: 'vv',      suit: '♦', exclusiveLabel: 'Majority',     exclusiveCn: '控股度' },
        { key: 'trixie',  suit: '🃏', exclusiveLabel: 'Mania',        exclusiveCn: '妄执度' },
        { key: 'kako',    suit: '♠', exclusiveLabel: 'Complicity',   exclusiveCn: '包庇度' },
        { key: 'eulalia', suit: '♥', exclusiveLabel: 'Entrust',      exclusiveCn: '寄托度' },
        { key: 'cota',    suit: '♦', exclusiveLabel: 'Retention',    exclusiveCn: '留存度' }
    ];

    function escapePartyHtml(text) {
        return String(text ?? '').replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    function pctClamp(value) {
        const n = Number(value);
        if (!Number.isFinite(n)) return 0;
        return Math.max(0, Math.min(100, Math.round(n)));
    }

    function buildPartySlotMarkup(entry) {
        const pool = (typeof window !== 'undefined' && window.dashboardCharacters) || {};
        const c = pool[entry.key];
        if (!c) return '';

        const state = c.dashboardState || {};

        // 未激活：整条消失（9人 → 8人）。默认 activated 缺省视为 true。
        if (state.activated === false) return '';

        let slotClass = 'sub-hand';
        let roleLabel = 'UNKNOWN';
        let opacityStyle = '';

        if (state.inParty) { slotClass = 'main-hand'; roleLabel = 'IN PARTY'; }
        else if (state.present) { roleLabel = 'PRESENT'; }
        else if (state.introduced) { roleLabel = 'INTRODUCED'; opacityStyle = 'opacity: 0.6;'; }
        else { roleLabel = 'UNKNOWN'; opacityStyle = 'opacity: 0.3; filter: grayscale(1);'; }

        const resource = c.variables?.resource || {};
        const manaCur = Math.max(0, Math.round(Number(resource.current) || 0));
        const manaMax = Math.max(1, Math.round(Number(resource.max) || 0)) || 100;
        const manaPct = Math.max(0, Math.min(100, Math.round((manaCur / manaMax) * 100)));

        const isHookStage = state.introduced !== true;

        const rawDisplayName = c.watermark || c.name || entry.key.toUpperCase();
        const displayName = isHookStage ? '???' : rawDisplayName;
        const avatarUrl = isHookStage ? '' : (c.avatarUrl || c.portraitUrl || '');
        const avatarLetter = isHookStage ? '?' : rawDisplayName.charAt(0);
        const levelText = isHookStage
            ? 'LV ??'
            : `LV ${String(Math.max(0, Math.round(Number(c.level) || 0))).padStart(2, '0')}`;

        const suitSymbol = String(c.suitSymbol || '');
        const suitClass = String(c.suitClass || '').toLowerCase();
        const attrUpper = String(c.attribute || '').toUpperCase();
        const CHAR_TO_ATTR = { '♥': 'moirai', '♠': 'chaos', '♦': 'psyche', '♣': 'void' };
        const CLASS_TO_ATTR = { 'heart': 'moirai', 'spade': 'chaos', 'diamond': 'psyche', 'club': 'void' };
        const active = { moirai: false, chaos: false, psyche: false, void: false };
        const isJoker = suitSymbol.includes('🃏') || suitClass === 'joker';
        if (isJoker) {
            active.moirai = active.chaos = active.psyche = active.void = true;
        } else {
            Array.from(suitSymbol).forEach((ch) => {
                const k = CHAR_TO_ATTR[ch];
                if (k) active[k] = true;
            });
            suitClass.split(/[^a-z]+/).forEach((piece) => {
                const k = CLASS_TO_ATTR[piece];
                if (k) active[k] = true;
            });
            if (!Object.values(active).some(Boolean)) {
                if (attrUpper.includes('MOIRAI')) active.moirai = true;
                if (attrUpper.includes('CHAOS')) active.chaos = true;
                if (attrUpper.includes('PSYCHE')) active.psyche = true;
                if (attrUpper.includes('VOID')) active.void = true;
            }
        }
        const isMoirai = !isHookStage && active.moirai ? 'active' : '';
        const isChaos  = !isHookStage && active.chaos  ? 'active' : '';
        const isPsyche = !isHookStage && active.psyche ? 'active' : '';
        const isVoid   = !isHookStage && active.void   ? 'active' : '';

        const goldMain = c.theme?.semantic?.goldMain || c.theme?.goldMain || '#CFB53B';

        return `
            <div class="roster-slot ${slotClass}" data-party-key="${escapePartyHtml(entry.key)}" style="--gold-main: ${escapePartyHtml(goldMain)}; ${opacityStyle}">
                <div class="comp-avatar-frame">${
                    avatarUrl
                        ? `<img class="comp-avatar-img" src="${escapePartyHtml(avatarUrl)}" alt="${escapePartyHtml(displayName)}" draggable="false">`
                        : `<span class="comp-avatar">${escapePartyHtml(avatarLetter)}</span>`
                }</div>
                <div class="comp-details">
                    <div class="comp-header">
                        <span class="comp-role">${escapePartyHtml(roleLabel)}</span>
                        <span class="comp-level">${escapePartyHtml(levelText)}</span>
                    </div>
                    <div class="comp-name">${escapePartyHtml(displayName)}</div>
                    <div class="comp-traits">
                        <span class="icon-moirai ${isMoirai}">♥</span>
                        <span class="icon-chaos ${isChaos}">♠</span>
                        <span class="icon-psyche ${isPsyche}">♦</span>
                        <span class="icon-void ${isVoid}">♣</span>
                    </div>
                    <div class="mana-row">
                        <span class="mana-label">MANA</span>
                        <div class="mana-bar-glass"><div class="mana-fluid" style="width: ${isHookStage ? 0 : manaPct}%;"></div></div>
                        <span class="mana-val">${isHookStage ? '??' : manaCur}</span>
                    </div>
                </div>
            </div>
        `;
    }

    const PARTY_STATUS_WEIGHT = { party: 0, present: 1, offstage: 2, unintroduced: 4 };

    function getPartyEntryOrder(entry) {
        const pool = (typeof window !== 'undefined' && window.dashboardCharacters) || {};
        const c = pool[entry.key] || {};
        const state = c.dashboardState || {};
        let tone = 'unintroduced';
        if (state.inParty) tone = 'party';
        else if (state.present) tone = 'present';
        else if (state.introduced) tone = 'offstage';
        const statusWeight = PARTY_STATUS_WEIGHT[tone] ?? 4;
        const commonScore = pctClamp(c.variables?.common?.score);
        const exclusiveScore = pctClamp(c.variables?.exclusive?.score);
        return {
            statusWeight,
            total: commonScore + exclusiveScore,
            fallbackIndex: PARTY_ORDER.findIndex((item) => item.key === entry.key)
        };
    }

    function sortRosterEntries(entries) {
        return entries.slice().sort((left, right) => {
            const a = getPartyEntryOrder(left);
            const b = getPartyEntryOrder(right);
            if (a.statusWeight !== b.statusWeight) return a.statusWeight - b.statusWeight;
            if (b.total !== a.total) return b.total - a.total;
            return a.fallbackIndex - b.fallbackIndex;
        });
    }

    function isPartyEntry(entry) {
        const pool = (typeof window !== 'undefined' && window.dashboardCharacters) || {};
        const c = pool[entry.key];
        return c?.dashboardState?.inParty === true;
    }

    function buildRosterSectionMarkup(title, entries) {
        const visibleEntries = sortRosterEntries(entries)
            .map((entry) => buildPartySlotMarkup(entry))
            .filter(Boolean);
        if (!visibleEntries.length) return '';
        return `
            <div class="roster-section">
                <div class="section-header"><span>${escapePartyHtml(title)}</span></div>
                <div class="glass-cards-grid">${visibleEntries.join('')}</div>
            </div>
        `;
    }

    function buildRosterSectionsMarkup() {
        const partyEntries = PARTY_ORDER.filter((entry) => isPartyEntry(entry));
        const otherEntries = PARTY_ORDER.filter((entry) => !isPartyEntry(entry));
        return [
            buildRosterSectionMarkup(appData.intel.rosterTitle || 'PARTY', partyEntries),
            buildRosterSectionMarkup('OTHERS', otherEntries)
        ].filter(Boolean).join('');
    }

    function getCurrentActStateForPanel() {
        return buildCurrentActStateSnapshot();
    }

    function buildResourceStateRows(actState) {
        return RESOURCE_KEYS.map((key) => {
            const limited = Math.max(0, Math.round(Number(actState.limited?.[key]) || 0));
            const reserve = Math.max(0, Math.round(Number(actState.reserve?.[key]) || 0));
            const total = limited + reserve;
            return `
                <div class="act-state-row type-${key}">
                    <span class="act-state-key">${RESOURCE_TYPE_MAP[key]}</span>
                    <span class="act-state-value">${total}</span>
                </div>
            `;
        }).join('');
    }

    function buildPhaseSlotStateRows(actState) {
        const slots = Array.isArray(actState.phase_slots) ? actState.phase_slots : [];
        return slots.map((slot, index) => {
            const label = appData.planner.phases[index]?.title || String(index + 1);
            if (!slot) {
                return `
                    <div class="act-slot-row is-empty">
                        <span>${label}</span>
                        <span>EMPTY</span>
                    </div>
                `;
            }
            const key = normalizeResourceKey(slot.key, 'vision');
            const amount = Math.max(1, Math.min(3, Math.round(Number(slot.amount) || 1)));
            const tint = key === 'rest' ? normalizeRestTintKey(slot.tint || slot.controlType || slot.targetKey, 'neutral') : 'neutral';
            const tintLabel = key === 'rest' && tint !== 'neutral' ? ` > ${RESOURCE_TYPE_MAP[tint]}` : '';
            return `
                <div class="act-slot-row type-${key}">
                    <span>${label}</span>
                    <span>${RESOURCE_TYPE_MAP[key]} x${amount}${tintLabel}</span>
                </div>
            `;
        }).join('');
    }

    function buildDebugActionButtons() {
        const debugChapterTransition = getDebugChapterTransitionOption();
        const canAdvancePhase = canUsePhaseAdvanceControl() && canAdvanceCurrentPhase();
        const canAdvanceNode = canUseNodeAdvanceControl() && canExecuteCurrentNode();
        const resourceButtons = RESOURCE_KEYS.map((key) => `
            <button class="debug-act-btn type-${key}" type="button" data-debug-action="grant-resource" data-resource-key="${key}">+${RESOURCE_TYPE_MAP[key]}</button>
        `).join('');
        return `
            <div class="debug-action-grid">
                ${resourceButtons}
                <button class="debug-act-btn${canAdvancePhase ? '' : ' is-disabled'}" type="button" data-debug-action="advance-phase">ADV SEG</button>
                <button class="debug-act-btn${canAdvanceNode ? '' : ' is-disabled'}" type="button" data-debug-action="advance-node">ADV NODE</button>
                ${debugChapterTransition ? '<button class="debug-act-btn is-ready" type="button" data-debug-action="next-chapter">NEXT CHAPTER</button>' : ''}
                <button class="debug-act-btn" type="button" data-debug-action="reset-act">RESET</button>
            </div>
        `;
    }

    function buildModeMetaRows() {
        const seed = getCampaignConfig().seed || '';
        const seedMarkup = seed ? `
            <div class="act-meta-row">
                <span>SEED</span>
                <strong title="${seed}">${getSeedDisplayLabel()}</strong>
            </div>
        ` : '';
        return `
            <div class="act-mode-meta">
                <div class="act-meta-row">
                    <span>SYNC</span>
                    <strong>${syncState.errorText || syncState.statusText}</strong>
                </div>
                ${seedMarkup}
            </div>
        `;
    }

    function getPhaseRomanLabel(phaseIndex) {
        return appData.planner.phases[phaseIndex]?.title || String(phaseIndex + 1);
    }

    function getActionPhaseTimingLabel(phaseIndex) {
        const phaseCount = PHASE_SLOT_IDS.length;
        const current = Math.max(0, Math.min(phaseCount, Math.round(Number(appState.currentPhaseIndex) || 0)));
        const target = Math.max(0, Math.min(phaseCount - 1, Math.round(Number(phaseIndex) || 0)));
        const delta = Math.max(0, target - current);
        return delta <= 0 ? '当前段' : `${delta}段后`;
    }

    function getActionAmount(token) {
        return Math.max(1, Math.min(3, Math.round(Number(token?.amount) || 1)));
    }

    function getActionResourceLabel(key) {
        return RESOURCE_LABEL_MAP[key] || RESOURCE_TYPE_MAP[key] || String(key || '').toUpperCase();
    }

    function normalizeActionPreviewKey(key) {
        const raw = typeof key === 'string' ? key.trim().toLowerCase() : '';
        if (raw === 'encounter') return 'encounter';
        return normalizeResourceKey(raw, 'vision');
    }

    function getActionTag(key, amount = 1, fallback = '') {
        const type = RESOURCE_TYPE_MAP[key] || fallback || String(key || '').toUpperCase();
        return amount > 1 ? `${type} ${getPhaseRomanLabel(amount - 1)}` : type;
    }

    function getAssetActionTitle(amount) {
        if (amount >= 3) return '高阶契约展开';
        if (amount === 2) return '中阶契约展开';
        return '低阶契约展开';
    }

    function getVisionActionTitle(amount) {
        if (amount >= 3) return '跃迁待命';
        if (amount === 2) return '既定相位待命';
        return '探路预告';
    }

    function getRestActionTitle(token) {
        const tint = normalizeRestTintKey(token?.tint || token?.controlType || token?.targetKey, 'neutral');
        if (tint && tint !== 'neutral') return `Mana 回稳 · ${getActionResourceLabel(tint)}倾向`;
        return 'Mana 回稳';
    }

    function getActionPreviewForToken(token) {
        const key = normalizeResourceKey(token?.key, '');
        if (!key) return null;
        const amount = getActionAmount(token);
        if (key === 'combat') return { key, amount, title: '交锋回响待命', tag: getActionTag(key, amount) };
        if (key === 'rest') return { key, amount, title: getRestActionTitle(token), tag: getActionTag(key, amount) };
        if (key === 'asset') return { key, amount, title: getAssetActionTitle(amount), tag: getActionTag(key, amount) };
        if (key === 'vision') return { key, amount, title: getVisionActionTitle(amount), tag: getActionTag(key, amount) };
        return null;
    }

    function getActionPreviewForPhase(phaseIndex, options = {}) {
        const phase = appData.planner.phases[phaseIndex];
        if (!phase) return null;
        const nodeId = typeof options.nodeId === 'string' && options.nodeId.trim()
            ? options.nodeId.trim()
            : getCurrentNodeData().presentNode;
        const idPrefix = typeof options.idPrefix === 'string' && options.idPrefix.trim()
            ? options.idPrefix.trim()
            : 'phase';
        const includePlanToken = options.includePlanToken !== false;
        const visionReplacement = typeof getReadyVisionReplacementForPhase === 'function'
            ? getReadyVisionReplacementForPhase(nodeId, phaseIndex)
            : null;
        if (visionReplacement) {
            const key = normalizeResourceKey(visionReplacement.key, 'vision');
            return {
                id: `${idPrefix}:${nodeId}:${phaseIndex}:vision-replace:${key}`,
                key,
                title: `相位改写为${getActionResourceLabel(key)}`,
                tag: 'VISION',
                phaseIndex,
                carry: true,
                system: true
            };
        }

        const fixedKind = typeof getFixedPhaseKind === 'function'
            ? normalizeResourceKey(getFixedPhaseKind(nodeId, phaseIndex), '')
            : '';
        if (fixedKind) {
            return {
                id: `${idPrefix}:${nodeId}:${phaseIndex}:fixed:${fixedKind}`,
                key: fixedKind,
                title: `既定${getActionResourceLabel(fixedKind)}相位`,
                tag: 'FIXED',
                phaseIndex,
                carry: phaseIndex >= PHASE_SLOT_IDS.length - 1,
                system: true
            };
        }

        if (!includePlanToken) return null;
        const token = appState.phaseSlots[phase.slotId];
        const preview = getActionPreviewForToken(token);
        if (!preview) return null;
        const isVisionSight = preview.key === 'vision' && preview.amount <= 1;
        return {
            id: `${idPrefix}:${nodeId}:${phaseIndex}:${preview.key}`,
            ...preview,
            phaseIndex,
            carry: !isVisionSight && phaseIndex >= PHASE_SLOT_IDS.length - 1,
            effectPhaseIndex: isVisionSight ? phaseIndex + 1 : null,
            effectTitle: isVisionSight ? '探路生效' : '',
            system: false
        };
    }

    function getCarryActionTitle(preview) {
        if (!preview) return '';
        if (preview.title.startsWith('相位改写为')) return preview.title;
        if (preview.key === 'combat') return '交锋回响延续';
        if (preview.key === 'rest') return '节点倾向留存';
        if (preview.key === 'asset') return '契约牌面待选';
        if (preview.key === 'vision') {
            if (preview.amount >= 3 || preview.title.includes('跃迁')) return '跃迁入口待命';
            if (preview.amount === 2 || preview.title.includes('既定相位')) return '相位改写待命';
            return '视野延至前路';
        }
        return preview.title;
    }

    function pushActionPreviewRow(rows, seen, row) {
        if (!row || !row.title) return;
        const id = row.id || `${row.timeLabel}:${row.key}:${row.title}:${row.tag || ''}`;
        if (seen.has(id)) return;
        seen.add(id);
        rows.push({
            id,
            key: normalizeActionPreviewKey(row.key),
            timeLabel: row.timeLabel || 'NEXT I',
            title: row.title,
            tag: row.tag || '',
            next: row.next === true
        });
    }

    function appendActionEffectRow(rows, seen, preview, currentPhaseIndex, phaseCount) {
        if (!preview?.effectTitle) return;
        const effectPhaseIndex = Number.isFinite(Number(preview.effectPhaseIndex))
            ? Math.round(Number(preview.effectPhaseIndex))
            : phaseCount;
        if (effectPhaseIndex < currentPhaseIndex) return;
        pushActionPreviewRow(rows, seen, {
            id: `effect:${preview.id}`,
            key: preview.key,
            timeLabel: effectPhaseIndex < phaseCount ? getActionPhaseTimingLabel(effectPhaseIndex) : 'NEXT I',
            title: preview.effectTitle,
            tag: 'SIGHT',
            next: effectPhaseIndex >= phaseCount
        });
    }

    function getEncounterActionName(marker) {
        const key = typeof marker?.charKey === 'string' ? marker.charKey.trim().toLowerCase() : '';
        const registry = (typeof window !== 'undefined' && window.dashboardCharacters) || {};
        const meta = registry[key] || null;
        return meta?.watermark || meta?.name || marker?.charKey || 'UNKNOWN';
    }

    function getEncounterActionPreviewForPhase(phaseIndex, nodeId = getCurrentNodeData().presentNode, idPrefix = 'phase') {
        const marker = typeof getEncounterMarkerForPhase === 'function'
            ? getEncounterMarkerForPhase(nodeId, phaseIndex)
            : null;
        if (!marker) return null;
        const name = getEncounterActionName(marker);
        const isPreSignal = marker.type === 'pre_signal';
        return {
            id: `${idPrefix}:${nodeId}:${phaseIndex}:encounter:${marker.id || marker.charKey || marker.type || 'marker'}`,
            key: 'encounter',
            title: `${isPreSignal ? '人物预兆' : '人物相遇'} · ${name}`,
            tag: isPreSignal ? 'SIGNAL' : 'MEET'
        };
    }

    function getNextActionPreviewNodeIds() {
        const currentNodeData = getCurrentNodeData();
        const currentNodeId = currentNodeData.presentNode;
        const nodeIds = [];
        if (currentNodeData.nextForcedNodeId) nodeIds.push(currentNodeData.nextForcedNodeId);
        if (typeof getRouteOptions === 'function') {
            getRouteOptions().forEach((nodeId) => nodeIds.push(nodeId));
        }
        return nodeIds
            .filter((nodeId) => typeof nodeId === 'string' && nodeId.trim() && nodeId !== currentNodeId)
            .map((nodeId) => nodeId.trim())
            .filter((nodeId, index, list) => list.indexOf(nodeId) === index);
    }

    function appendNextNodeSystemActionRows(rows, seen) {
        getNextActionPreviewNodeIds().forEach((nodeId) => {
            for (let phaseIndex = 0; phaseIndex < PHASE_SLOT_IDS.length; phaseIndex += 1) {
                const encounterPreview = getEncounterActionPreviewForPhase(phaseIndex, nodeId, 'next');
                if (encounterPreview) {
                    pushActionPreviewRow(rows, seen, {
                        ...encounterPreview,
                        timeLabel: `NEXT ${getPhaseRomanLabel(phaseIndex)}`,
                        next: true
                    });
                }
                const fixedPreview = getActionPreviewForPhase(phaseIndex, {
                    nodeId,
                    idPrefix: 'next',
                    includePlanToken: false
                });
                if (!fixedPreview) continue;
                pushActionPreviewRow(rows, seen, {
                    id: fixedPreview.id,
                    key: fixedPreview.key,
                    timeLabel: `NEXT ${getPhaseRomanLabel(phaseIndex)}`,
                    title: fixedPreview.title,
                    tag: fixedPreview.tag,
                    next: true
                });
            }
        });
    }

    function getNextFixedPhaseIndexForActionPreview(nodeId) {
        const current = Math.max(0, Math.min(PHASE_SLOT_IDS.length, Math.round(Number(appState.currentPhaseIndex) || 0)));
        for (let phaseIndex = current; phaseIndex < PHASE_SLOT_IDS.length; phaseIndex += 1) {
            if (typeof getFixedPhaseKind === 'function' && getFixedPhaseKind(nodeId, phaseIndex)) return phaseIndex;
        }
        return null;
    }

    function appendPendingActionRows(rows, seen) {
        const vision = getVisionStateForDashboard();
        const pendingReplace = vision.pendingReplace;
        const currentNodeId = getCurrentNodeData().presentNode;
        const currentPhaseIndex = Math.max(0, Math.min(PHASE_SLOT_IDS.length, Math.round(Number(appState.currentPhaseIndex) || 0)));
        const nextPreviewNodeIds = getNextActionPreviewNodeIds();
        if (pendingReplace && pendingReplace.status === 'ready') {
            const targetNodeId = typeof pendingReplace.nodeId === 'string' ? pendingReplace.nodeId : '';
            const targetPhaseIndex = Math.max(0, Math.min(3, Math.round(Number(pendingReplace.phaseIndex) || 0)));
            const targetNodeIndex = Math.max(0, Math.round(Number(pendingReplace.nodeIndex) || 0));
            const isVisibleCurrentPhase = targetNodeId === currentNodeId
                && targetPhaseIndex >= currentPhaseIndex;
            const isPastCurrentPhase = targetNodeId === currentNodeId && targetPhaseIndex < currentPhaseIndex;
            const isFutureNode = targetNodeId !== currentNodeId
                && targetNodeIndex > Math.max(0, Math.round(Number(appState.currentNodeIndex) || 0));
            const isCoveredByNextSystemPreview = nextPreviewNodeIds.includes(targetNodeId);
            if (!isVisibleCurrentPhase) {
                const key = normalizeResourceKey(pendingReplace.replacementKey || pendingReplace.key, 'vision');
                if (!isPastCurrentPhase && isFutureNode && !isCoveredByNextSystemPreview) {
                    pushActionPreviewRow(rows, seen, {
                        id: `pending:vision-ready:${targetNodeId}:${targetPhaseIndex}:${key}`,
                        key,
                        timeLabel: `NEXT ${getPhaseRomanLabel(targetPhaseIndex)}`,
                        title: `相位改写为${getActionResourceLabel(key)}`,
                        tag: 'VISION',
                        next: true
                    });
                }
            }
        } else if (pendingReplace && ['charged', 'choosing'].includes(pendingReplace.status)) {
            const charges = Math.max(1, Math.round(Number(pendingReplace.charges) || 1));
            const nextFixedPhaseIndex = getNextFixedPhaseIndexForActionPreview(currentNodeId);
            pushActionPreviewRow(rows, seen, {
                id: `pending:vision-charged:${charges}`,
                key: 'vision',
                timeLabel: nextFixedPhaseIndex === null ? 'NEXT I' : getActionPhaseTimingLabel(nextFixedPhaseIndex),
                title: '既定相位待命',
                tag: `VISION ${charges}`,
                next: nextFixedPhaseIndex === null
            });
        }

        if (vision.jumpReady || appData.runtime.frontendSnapshot?.routeMode === 'jump') {
            pushActionPreviewRow(rows, seen, {
                id: 'pending:vision-jump',
                key: 'vision',
                timeLabel: 'NEXT I',
                title: '跃迁待命',
                tag: 'JUMP',
                next: true
            });
        }

        const assetSummary = getCurrentAssetDeckSummary();
        const offer = assetSummary.pending?.offer;
        if (offer) {
            const pool = String(offer.pool || 'low').toLowerCase();
            pushActionPreviewRow(rows, seen, {
                id: `pending:asset-offer:${offer.id || pool}`,
                key: 'asset',
                timeLabel: '当前段',
                title: `${pool === 'high' ? '高阶' : pool === 'mid' ? '中阶' : '低阶'}契约待选`,
                tag: 'OFFER',
                next: false
            });
        }
        const queue = Array.isArray(assetSummary.pending?.offerQueue) ? assetSummary.pending.offerQueue : [];
        if (queue.length) {
            pushActionPreviewRow(rows, seen, {
                id: `pending:asset-queue:${queue.length}`,
                key: 'asset',
                timeLabel: '当前段',
                title: `契约队列待命 x${queue.length}`,
                tag: 'QUEUE',
                next: false
            });
        }
    }

    function buildActionPreviewPanelMarkup() {
        const planConfirmed = typeof isPhasePlanConfirmedForCurrentNode === 'function' && isPhasePlanConfirmedForCurrentNode();
        const phaseCount = PHASE_SLOT_IDS.length;
        const current = Math.max(0, Math.min(phaseCount, Math.round(Number(appState.currentPhaseIndex) || 0)));
        const rows = [];
        const seen = new Set();

        for (let phaseIndex = 0; phaseIndex < phaseCount; phaseIndex += 1) {
            const shouldShowPhaseAction = phaseIndex >= current;
            if (shouldShowPhaseAction) {
                const encounterPreview = getEncounterActionPreviewForPhase(phaseIndex);
                if (encounterPreview) {
                    pushActionPreviewRow(rows, seen, {
                        ...encounterPreview,
                        timeLabel: getActionPhaseTimingLabel(phaseIndex)
                    });
                }
            }
            const preview = getActionPreviewForPhase(phaseIndex);
            if (!preview) continue;
            const canShowPreview = shouldShowPhaseAction && (planConfirmed || preview.system === true);
            if (canShowPreview) {
                pushActionPreviewRow(rows, seen, {
                    id: preview.id,
                    key: preview.key,
                    timeLabel: getActionPhaseTimingLabel(phaseIndex),
                    title: preview.title,
                    tag: preview.tag
                });
                if (preview.carry) {
                    pushActionPreviewRow(rows, seen, {
                        id: `carry:${preview.id}`,
                        key: preview.key,
                        timeLabel: 'NEXT I',
                        title: getCarryActionTitle(preview),
                        tag: preview.key === 'vision' ? 'INTEL' : (RESOURCE_TYPE_MAP[preview.key] || ''),
                        next: true
                    });
                }
            }
            if (planConfirmed || preview.system === true) {
                appendActionEffectRow(rows, seen, preview, current, phaseCount);
            }
        }

        appendNextNodeSystemActionRows(rows, seen);
        appendPendingActionRows(rows, seen);
        if (!rows.length) return '';

        return `
            <div class="action-preview-panel">
                <div class="section-header"><span>ACTIONS</span></div>
                <div class="action-preview-list">
                    ${rows.slice(0, 7).map((row) => `
                        <div class="action-preview-row type-${escapePartyHtml(row.key)}${row.next ? ' is-next' : ''}">
                            <span class="action-preview-time">${escapePartyHtml(row.timeLabel)}</span>
                            <strong>${escapePartyHtml(row.title)}</strong>
                            <em>${escapePartyHtml(row.tag)}</em>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    function buildVisionReadyReplacementMarkup(pendingReplace) {
        if (!pendingReplace || pendingReplace.status !== 'ready') return '';
        const nodeId = typeof pendingReplace.nodeId === 'string' ? pendingReplace.nodeId : '';
        const phaseIndex = Math.max(0, Math.min(3, Math.round(Number(pendingReplace.phaseIndex) || 0)));
        const replacementKey = normalizeResourceKey(pendingReplace.replacementKey || pendingReplace.key, 'vision');
        return `
            <div class="vision-task-row type-${replacementKey}">
                <span>REPLACE</span>
                <strong>${nodeId ? getRouteOptionLabel(nodeId) : 'TARGET'} · ${getPhaseRomanLabel(phaseIndex)} > ${RESOURCE_TYPE_MAP[replacementKey]}</strong>
            </div>
        `;
    }

    function buildVisionChargedMarkup(pendingReplace) {
        if (!pendingReplace || !['charged', 'choosing'].includes(pendingReplace.status)) return '';
        const charges = Math.max(1, Math.round(Number(pendingReplace.charges) || 1));
        return `
            <div class="vision-task-row is-ready">
                <span>REPLACE</span>
                <strong>CHARGED x${charges}</strong>
            </div>
        `;
    }

    function buildVisionJumpMarkup(vision) {
        if (!vision.jumpReady && appData.runtime.frontendSnapshot?.routeMode !== 'jump') return '';
        const routeOptions = isRouteSelectionActive() ? getRouteOptions() : [];
        if (!routeOptions.length) {
            return `
                <div class="vision-task-row${vision.jumpReady ? ' is-ready' : ''}">
                    <span>跃迁</span>
                    <strong>${vision.jumpReady ? 'READY' : 'WAIT ROUTE'}</strong>
                </div>
            `;
        }
        return `
            <div class="vision-jump-list">
                ${routeOptions.map((nodeId) => `<button class="vision-route-btn route-option-btn" type="button" data-node-id="${nodeId}">${getRouteOptionLabel(nodeId)}</button>`).join('')}
            </div>
        `;
    }

    function buildVisionPanelMarkup(actState) {
        const vision = getVisionStateForDashboard();
        const sight = Math.max(0, vision.baseSight + vision.bonusSight);
        const visibleTo = Math.min(getCampaignTotalNodes(), appState.currentNodeIndex + sight);
        const pendingReplace = vision.pendingReplace;
        const pendingMarkup = buildVisionReadyReplacementMarkup(pendingReplace) || buildVisionChargedMarkup(pendingReplace);
        const jumpMarkup = buildVisionJumpMarkup(vision);
        return `
            <div class="vision-act-panel">
                <div class="vision-task-row">
                    <span>情报</span>
                    <strong>${String(appState.currentNodeIndex).padStart(2, '0')} > ${String(visibleTo).padStart(2, '0')}</strong>
                </div>
                ${pendingMarkup}
                ${jumpMarkup}
            </div>
        `;
    }

    function formatActAssetSourceLabel(item) {
        const nodeId = typeof item?.nodeId === 'string' ? item.nodeId : item?.payload?.commandPayload?.source?.nodeId;
        const phaseIndex = Number.isFinite(Number(item?.phaseIndex))
            ? Math.max(0, Math.min(3, Math.round(Number(item.phaseIndex))))
            : Number.isFinite(Number(item?.payload?.commandPayload?.source?.phaseIndex))
                ? Math.max(0, Math.min(3, Math.round(Number(item.payload.commandPayload.source.phaseIndex))))
                : null;
        const nodeLabel = nodeId ? getRouteOptionLabel(nodeId) || nodeId : 'ACT';
        return phaseIndex === null ? nodeLabel : `${nodeLabel} · ${getPhaseRomanLabel(phaseIndex)}`;
    }

    function formatActAssetCommandLabel(commandInput) {
        const command = commandInput && typeof commandInput === 'object' ? commandInput : {};
        const kind = typeof command.kind === 'string' ? command.kind : command.type;
        const payload = command.payload && typeof command.payload === 'object' ? command.payload : {};
        if (kind === 'grant_asset') return `+${Math.max(0, Math.round(Number(payload.amount) || 0))} DECK PT`;
        if (kind === 'open_offer') return `OPEN ${String(payload.pool || 'low').toUpperCase()}`;
        return String(kind || 'COMMAND').toUpperCase();
    }

    function normalizeCombatPendingResolutionsForDashboard(actState) {
        return (Array.isArray(actState?.pendingResolutions) ? actState.pendingResolutions : [])
            .filter((item) => item && typeof item === 'object' && normalizeResourceKey(item.type, '') === 'combat')
            .map((item) => ({
                ...deepCloneValue(item),
                level: Math.max(1, Math.min(3, Math.round(Number(item.level) || 1))),
                status: typeof item.status === 'string' && item.status.trim() ? item.status.trim().toLowerCase() : 'pending'
            }));
    }

    function formatCombatRequestLabel(item) {
        const level = Math.max(1, Math.min(3, Math.round(Number(item?.level) || 1)));
        if (level === 1) return 'COMBAT I · LOW STAKE';
        if (level === 2) return 'COMBAT II · ELITE';
        return 'COMBAT III · BOSS';
    }

    function buildCombatSettlementRowsMarkup(actState, options = {}) {
        const isActPanel = options.panel === 'act';
        const rowClass = options.panel === 'act'
            ? 'vision-task-row combat-task-row type-combat'
            : 'row combat-request-row type-combat';
        const pendingRows = normalizeCombatPendingResolutionsForDashboard(actState)
            .filter((item) => item.status === 'pending')
            .slice(0, 3)
            .map((item) => `
                <div class="${rowClass}">
                    <span>${isActPanel ? 'PENDING' : 'WAITING'}</span>
                    <strong>${escapePartyHtml(formatCombatRequestLabel(item))} · ${escapePartyHtml(formatActAssetSourceLabel(item))}</strong>
                    <em>${isActPanel ? 'EXT' : 'ECHO'}</em>
                </div>
            `).join('');
        const historyRows = (Array.isArray(actState?.resolutionHistory) ? actState.resolutionHistory : [])
            .filter((item) => item && typeof item === 'object' && normalizeResourceKey(item.type, '') === 'combat')
            .slice(-2)
            .reverse()
            .map((item) => `
                <div class="${rowClass} is-current">
                    <span>${escapePartyHtml(String(item.status || 'DONE').toUpperCase().slice(0, 8))}</span>
                    <strong>${escapePartyHtml(String(item.outcome || item.summary || 'COMBAT RESULT').toUpperCase())} · ${escapePartyHtml(formatActAssetSourceLabel(item))}</strong>
                    <em>HIST</em>
                </div>
            `).join('');
        return pendingRows || historyRows || `<div class="${options.panel === 'act' ? 'vision-task-row combat-task-row' : 'row'} is-empty"><strong>-</strong><span>${isActPanel ? '不生成假收益' : '暂无交锋回响'}</span><em>${isActPanel ? 'LOCK' : 'QUIET'}</em></div>`;
    }

    function buildCombatSettlementPanelMarkup(actState) {
        return `
            <div class="asset-act-panel combat-act-panel">
                <div class="vision-task-row combat-task-row">
                    <span>COMBAT</span>
                    <strong>ADAPTER PENDING · EXTERNAL ONLY</strong>
                </div>
                ${buildCombatSettlementRowsMarkup(actState, { panel: 'act' })}
            </div>
        `;
    }

    function buildAssetSettlementPanelMarkup(actState) {
        const assetSummary = getCurrentAssetDeckSummary();
        const pendingCommands = normalizePendingAssetDeckCommandsForDashboard(actState);
        const pendingRows = pendingCommands
            .filter((item) => {
                const status = typeof item.status === 'string' && item.status.trim() ? item.status.trim().toLowerCase() : 'pending';
                return status === 'pending';
            })
            .slice(0, 2)
            .map((item) => `
                <div class="vision-task-row asset-task-row">
                    <span>PENDING</span>
                    <strong>${escapePartyHtml(formatActAssetCommandLabel(item.command))} · ${escapePartyHtml(formatActAssetSourceLabel(item))}</strong>
                </div>
            `).join('');
        const historyRows = (Array.isArray(actState.resolutionHistory) ? actState.resolutionHistory : [])
            .filter((item) => item && typeof item === 'object' && item.type === 'asset')
            .slice(-2)
            .reverse()
            .map((item) => {
                const kind = item?.payload?.commandKind || item?.command?.kind || item?.command?.type || 'asset';
                const outcome = item?.outcome || item?.status || '';
                return `
                    <div class="vision-task-row asset-task-row is-ready">
                        <span>${escapePartyHtml(String(kind).replace(/_/g, ' ').toUpperCase().slice(0, 8))}</span>
                        <strong>${escapePartyHtml(String(outcome).toUpperCase())} · ${escapePartyHtml(formatActAssetSourceLabel(item))}</strong>
                    </div>
                `;
            }).join('');
        const offer = assetSummary.pending?.offer;
        const offerMarkup = offer ? `
            <div class="vision-task-row asset-task-row is-ready">
                <span>OFFER</span>
                <strong>${escapePartyHtml(String(offer.pool || 'low').toUpperCase())} · ${Array.isArray(offer.choices) ? offer.choices.length : 0} CARDS</strong>
            </div>
        ` : '';
        const assetPoints = Math.max(0, Math.round(Number(appState.resources.assets) || 0));
        return `
            <div class="asset-act-panel">
                <div class="vision-task-row asset-task-row">
                    <span>ASSET</span>
                    <strong>${assetPoints} POINTS</strong>
                </div>
                ${offerMarkup}
                ${pendingRows}
                ${historyRows}
            </div>
        `;
    }

    function getEncounterDebugEligibilityMap(actState) {
        const actModule = getActModuleApi();
        if (!actModule || typeof actModule.evaluateCharacterEncounterEligibility !== 'function') {
            return new Map();
        }
        const currentPayload = adapterState.lastPayload || buildInitialDebugPayload();
        const hero = extractHeroPayload(currentPayload) || { funds: appState.resources.funds, assets: appState.resources.assets };
        const result = actModule.evaluateCharacterEncounterEligibility(actState, hero, getDebugEncounterContext());
        const map = new Map();
        (Array.isArray(result?.eligible) ? result.eligible : []).forEach((item) => {
            map.set(item.charKey, { ...item, debugState: 'ready' });
        });
        (Array.isArray(result?.blocked) ? result.blocked : []).forEach((item) => {
            if (!map.has(item.charKey)) map.set(item.charKey, { ...item, debugState: 'blocked' });
        });
        return map;
    }

    function buildEncounterLocationDebugMarkup() {
        const location = getCurrentWorldLocation();
        const context = getCurrentEncounterDebugContext();
        const enabledFlags = Object.entries(context.storyFlags)
            .filter(([, enabled]) => enabled === true)
            .map(([key]) => key);
        return `
            <div class="encounter-location-debug">
                <div class="encounter-location-head">
                    <span>MVU LOCATION</span>
                    <strong>${getWorldLocationLayerLabel(location.layer)} · ${location.layer}</strong>
                </div>
                <div class="encounter-location-grid">
                    ${WORLD_LOCATION_LAYERS.map((layer) => `
                        <button class="debug-act-btn${location.layer === layer ? ' is-ready' : ''}" type="button" data-debug-action="set-location-layer" data-location-layer="${layer}">
                            ${getWorldLocationLayerLabel(layer)}
                        </button>
                    `).join('')}
                </div>
                <div class="encounter-location-head">
                    <span>SCENE TAGS</span>
                    <strong>${context.tags.length ? context.tags.join(' / ') : 'NONE'}</strong>
                </div>
                <div class="encounter-location-grid is-tags">
                    ${ENCOUNTER_DEBUG_TAG_OPTIONS.map((option) => `
                        <button class="debug-act-btn${context.tags.includes(option.key) ? ' is-ready' : ''}" type="button" data-debug-action="toggle-encounter-tag" data-encounter-tag="${option.key}">
                            ${option.label}
                        </button>
                    `).join('')}
                </div>
                <div class="encounter-location-head">
                    <span>STORY FLAGS</span>
                    <strong>${enabledFlags.length ? enabledFlags.join(' / ') : 'NONE'}</strong>
                </div>
                <div class="encounter-location-grid is-flags">
                    ${ENCOUNTER_DEBUG_FLAG_OPTIONS.map((option) => `
                        <button class="debug-act-btn${context.storyFlags[option.key] ? ' is-ready' : ''}" type="button" data-debug-action="toggle-encounter-flag" data-encounter-flag="${option.key}">
                            ${option.label}
                        </button>
                    `).join('')}
                </div>
                <div class="encounter-debug-numeric-grid">
                    <label>
                        <span>FUNDS</span>
                        <input type="number" min="0" step="50" value="${context.funds}" data-debug-action="set-encounter-funds">
                    </label>
                </div>
            </div>
        `;
    }

    function normalizeEncounterPanelKind(value) {
        const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
        return normalized === 'signal' || normalized === 'pre_signal' ? 'signal' : 'meet';
    }

    function normalizeEncounterPanelState(value) {
        const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
        return normalized === 'placed' ? 'placed' : 'queued';
    }

    function getEncounterPanelPhaseIndex(active) {
        const explicit = Number(active?.phase);
        if (Number.isFinite(explicit)) return Math.max(0, Math.min(3, Math.round(explicit)));
        return normalizeEncounterPanelKind(active?.kind) === 'signal' ? 0 : 1;
    }

    function getEncounterPanelTypeLabel(active, short = false) {
        const isSignal = normalizeEncounterPanelKind(active?.kind) === 'signal';
        if (short) return isSignal ? 'SIG' : 'MEET';
        return isSignal ? 'SIGNAL' : 'PLACED';
    }

    function getEncounterPanelActiveEntries(encounter) {
        const active = encounter?.active && typeof encounter.active === 'object' ? encounter.active : {};
        return Object.entries(active)
            .map(([charKey, entry]) => ({
                charKey,
                entry: entry && typeof entry === 'object' ? entry : {}
            }))
            .filter(({ charKey }) => Boolean(charKey));
    }

    function getEncounterDebugState(charKey, encounter, eligibilityMap) {
        const met = encounter?.met && typeof encounter.met === 'object' ? encounter.met[charKey] : null;
        if (met && typeof met === 'object') {
            return { label: 'DONE', reason: met.node || 'introduced', canForce: false, className: 'is-done' };
        }
        const signaled = encounter?.signaled && typeof encounter.signaled === 'object' ? encounter.signaled[charKey] : null;
        if (signaled && typeof signaled === 'object') {
            return { label: 'PRE-SIGNAL', reason: 'signal done; first meet boosted', canForce: true, className: 'is-pre-signal' };
        }
        const active = encounter?.active && typeof encounter.active === 'object' ? encounter.active[charKey] : null;
        if (active && normalizeEncounterPanelState(active.state) === 'placed') {
            const phaseIndex = getEncounterPanelPhaseIndex(active);
            const nodeId = typeof active.node === 'string' ? active.node : '';
            return {
                label: getEncounterPanelTypeLabel(active),
                reason: `${getRouteOptionLabel(nodeId) || nodeId || 'NODE'} · ${getPhaseRomanLabel(phaseIndex)}`,
                canForce: false,
                className: normalizeEncounterPanelKind(active.kind) === 'signal' ? 'is-pre-signal' : 'is-placed'
            };
        }
        if (active) {
            return { label: normalizeEncounterPanelState(active.state).toUpperCase(), reason: 'active', canForce: false, className: 'is-queued' };
        }
        const evaluated = eligibilityMap.get(charKey);
        if (evaluated?.debugState === 'ready') {
            return { label: 'READY', reason: formatEncounterRequirementSummary(evaluated, { includePassed: true }), canForce: true, className: 'is-ready' };
        }
        const reasons = Array.isArray(evaluated?.reasonCodes) && evaluated.reasonCodes.length
            ? evaluated.reasonCodes
            : ['blocked'];
        return { label: 'BLOCKED', reason: formatEncounterRequirementSummary(evaluated, { fallback: formatEncounterReasonCodes(reasons) }), canForce: true, className: 'is-blocked' };
    }

    function formatEncounterReasonCodes(reasonCodes) {
        const codes = Array.isArray(reasonCodes)
            ? reasonCodes
            : String(reasonCodes || '').split('/');
        return codes
            .map((code) => {
                const normalized = String(code || '').trim();
                if (!normalized) return '';
                if (ENCOUNTER_REASON_LABELS[normalized]) return ENCOUNTER_REASON_LABELS[normalized];
                if (normalized.startsWith('requires_')) return `needs ${normalized.slice('requires_'.length).toUpperCase()}`;
                if (normalized.startsWith('missing_flag_')) return `missing ${normalized.slice('missing_flag_'.length).replace(/_/g, ' ')}`;
                return normalized.replace(/_/g, ' ');
            })
            .filter(Boolean)
            .join(' / ') || 'blocked';
    }

    function formatEncounterRequirementSummary(evaluated, options = {}) {
        const req = evaluated?.requirements && typeof evaluated.requirements === 'object' ? evaluated.requirements : null;
        if (!req) return options.fallback || `priority ${evaluated?.priority || 0}`;
        const parts = [];
        const pushThreshold = (label, current, required) => {
            const threshold = Math.max(0, Math.round(Number(required) || 0));
            if (!threshold) return;
            parts.push(`${label} ${Math.max(0, Math.round(Number(current) || 0))}/${threshold}`);
        };
        pushThreshold('node', req.nodeIndex, req.minNodeIndex);
        pushThreshold('funds', req.funds, req.minFunds);
        pushThreshold('spent', req.spentScore, req.minSpentScore);
        if (req.requiredGeo) parts.push(`geo ${req.geo || 'missing'}>${req.requiredGeo}`);
        if (Array.isArray(req.requiredTags) && req.requiredTags.length) parts.push(`tag ${req.requiredTags.join('|')}`);
        if (Array.isArray(req.requiredFlags) && req.requiredFlags.length) parts.push(`flag ${req.requiredFlags.join('|')}`);
        if (Array.isArray(req.requiredCharacters) && req.requiredCharacters.length) parts.push(`needs ${req.requiredCharacters.join('|')}`);
        if (Array.isArray(req.requiredAny) && req.requiredAny.length) parts.push(`any ${formatEncounterAnyRequirement(req.requiredAny)}`);
        if (options.includePassed) parts.push(`priority ${evaluated?.priority || 0}`);
        return parts.join(' / ') || options.fallback || 'no requirements';
    }

    function formatEncounterAnyRequirement(groups) {
        return groups
            .map((group) => {
                const parts = [];
                if (Array.isArray(group.requiredCharacters) && group.requiredCharacters.length) parts.push(group.requiredCharacters.join('+'));
                if (Array.isArray(group.requiredFlags) && group.requiredFlags.length) parts.push(group.requiredFlags.join('+'));
                if (Number(group.minSpentScore) > 0) parts.push(`spent>${group.minSpentScore}`);
                if (Number(group.minFunds) > 0) parts.push(`funds>${group.minFunds}`);
                return parts.join('+');
            })
            .filter(Boolean)
            .join(' OR ') || 'alternate gate';
    }

    function buildEncounterDebugPanelMarkup(actState, encounter) {
        const eligibilityMap = getEncounterDebugEligibilityMap(actState);
        return `
            <details class="encounter-debug-panel"${appState.encounterDebugOpen ? ' open' : ''}>
                <summary>ENCOUNTER DEBUG</summary>
                <div class="encounter-debug-mode-note">
                    <span>FREE ADD = FORCE ignores rules</span>
                    <span>RULE ADD = eligible auto placement</span>
                </div>
                <div class="encounter-debug-actions">
                    <button class="debug-act-btn" type="button" data-debug-action="encounter-scan">SCAN</button>
                    <button class="debug-act-btn is-ready" type="button" data-debug-action="auto-add-encounter">RULE ADD</button>
                    <button class="debug-act-btn" type="button" data-debug-action="clear-encounter">CLEAR</button>
                </div>
                ${buildEncounterLocationDebugMarkup()}
                <div class="encounter-debug-list">
                    ${ENCOUNTER_DEBUG_CHARACTER_KEYS.map((charKey) => {
                        const debugState = getEncounterDebugState(charKey, encounter, eligibilityMap);
                        return `
                            <div class="encounter-debug-row ${debugState.className}">
                                <div class="encounter-debug-meta">
                                    <strong>${charKey}</strong>
                                    <span title="${escapePartyHtml(`${debugState.label} · ${debugState.reason}`)}">${debugState.label} · ${escapePartyHtml(debugState.reason)}</span>
                                </div>
                                <button class="debug-act-btn${debugState.canForce ? ' is-ready' : ' is-disabled'}" type="button" data-debug-action="force-encounter" data-encounter-char="${charKey}">FREE</button>
                            </div>
                        `;
                    }).join('')}
                </div>
            </details>
        `;
    }

    function buildEncounterPanelMarkup(actState) {
        const encounter = actState.characterEncounter && typeof actState.characterEncounter === 'object'
            ? actState.characterEncounter
            : {};
        const activeEntries = getEncounterPanelActiveEntries(encounter);
        const placed = activeEntries.filter(({ entry }) => normalizeEncounterPanelState(entry.state) === 'placed');
        const introduced = Object.keys(encounter.met && typeof encounter.met === 'object' ? encounter.met : {});
        const activeLabel = placed.length
            ? placed.map(({ charKey, entry }) => {
                const phaseIndex = getEncounterPanelPhaseIndex(entry);
                const typeLabel = getEncounterPanelTypeLabel(entry, true);
                const nodeId = typeof entry.node === 'string' ? entry.node : '';
                return `${typeLabel}:${charKey}@${getRouteOptionLabel(nodeId) || nodeId || 'NODE'}·${getPhaseRomanLabel(phaseIndex)}`;
            }).join(' / ')
            : activeEntries.length
                ? activeEntries.map(({ charKey, entry }) => `${getEncounterPanelTypeLabel(entry, true)}:${charKey}:${normalizeEncounterPanelState(entry.state).toUpperCase()}`).join(' / ')
                : 'EMPTY';
        return `
            <div class="encounter-act-panel">
                <div class="vision-task-row${placed.length ? ' is-ready' : ''}">
                    <span>ENCOUNTER</span>
                    <strong>${activeLabel}</strong>
                </div>
                <div class="vision-task-row">
                    <span>DONE</span>
                    <strong>${introduced.length ? introduced.join(' / ') : 'NONE'}</strong>
                </div>
                ${buildEncounterDebugPanelMarkup(actState, encounter)}
            </div>
        `;
    }

    function buildActModePanelMarkup() {
        if (!isOverviewDebugMode()) return '';
        if (appState.actPanelCollapsed === true) return '';
        const actState = getCurrentActStateForPanel();
        const modeLabel = getAdapterModeLabel();
        const stage = normalizeActStage(actState.stage).toUpperCase();
        const sight = Math.max(0, Math.round(Number(actState.vision?.baseSight) || 0))
            + Math.max(0, Math.round(Number(actState.vision?.bonusSight) || 0));
        return `
            <div class="act-mode-panel is-debug">
                <div class="section-header"><span>ACT MODE</span></div>
                <div class="act-mode-head">
                    <span class="act-mode-label">${modeLabel}</span>
                    <span class="act-mode-stage">${stage}</span>
                </div>
                ${buildModeMetaRows()}
                <div class="act-state-grid">
                    <div class="act-kpi">
                        <span>NODE</span>
                        <strong>${String(appState.currentNodeIndex).padStart(2, '0')}/${String(getCampaignTotalNodes()).padStart(2, '0')}</strong>
                    </div>
                    <div class="act-kpi">
                        <span>PHASE</span>
                        <strong>${Math.min(appState.currentPhaseIndex + 1, PHASE_SLOT_IDS.length)}/${PHASE_SLOT_IDS.length}</strong>
                    </div>
                    <div class="act-kpi">
                        <span>情报</span>
                        <strong>${sight}</strong>
                    </div>
                </div>
                <div class="act-resource-ledger">${buildResourceStateRows(actState)}</div>
                <div class="act-slot-ledger">${buildPhaseSlotStateRows(actState)}</div>
                ${buildVisionPanelMarkup(actState)}
                ${buildCombatSettlementPanelMarkup(actState)}
                ${buildAssetSettlementPanelMarkup(actState)}
                ${buildEncounterPanelMarkup(actState)}
                ${buildDebugActionButtons()}
            </div>
        `;
    }

    function renderIntelPanel() {
        const intelBody = document.getElementById('intelBody');
        const nodeData = getCurrentNodeData();
        const rewardMarkup = nodeData.limited.map((reward) => `
            <div class="token-row type-${reward.key}">
                <div class="token-sigil">
                    <div class="sigil-${reward.key}"></div>
                </div>
                <div class="token-info">
                    <div class="token-title">${reward.title}</div>
                    <div class="token-sub">${reward.sublabel}</div>
                </div>
                <div class="token-count">${String(reward.count).padStart(2, '0')}</div>
            </div>
        `).join('');
        const rosterMarkup = buildRosterSectionsMarkup();
        const actPanelMarkup = buildActModePanelMarkup();
        const actionPreviewMarkup = buildActionPreviewPanelMarkup();
        const actToggleMarkup = isOverviewDebugMode()
            ? `<div class="act-panel-control"><button class="act-panel-mini-toggle${appState.actPanelCollapsed === true ? ' is-collapsed' : ''}" type="button" data-act-panel-toggle aria-expanded="${appState.actPanelCollapsed === true ? 'false' : 'true'}">${appState.actPanelCollapsed === true ? 'SHOW ACT' : 'HIDE ACT'}</button></div>`
            : '';

        intelBody.innerHTML = `
            <div class="node-hero">
                <span class="hero-node">${nodeData.label}</span>
                <span class="hero-title">${nodeData.title}</span>
                <span class="hero-subtitle">${nodeData.subtitle}</span>
            </div>
            ${actionPreviewMarkup}
            <div>
                <div class="section-header"><span>${appData.intel.rewardsTitle}</span></div>
                <div class="token-ledger-list">${rewardMarkup}</div>
            </div>
            ${actToggleMarkup}
            ${actPanelMarkup}
            ${rosterMarkup}
        `;

        const actPanelToggle = intelBody.querySelector('[data-act-panel-toggle]');
        if (actPanelToggle) {
            actPanelToggle.addEventListener('click', () => {
                appState.actPanelCollapsed = !appState.actPanelCollapsed;
                renderIntelPanel();
            });
        }
    }


        return Object.freeze({
            escapePartyHtml,
            getPhaseRomanLabel,
            buildVisionPanelMarkup,
            buildCombatSettlementRowsMarkup,
            buildActModePanelMarkup,
            renderIntelPanel
        });
    }

    global.ACE0OverviewIntelPanel = Object.freeze({ create });
})(typeof window !== 'undefined' ? window : globalThis);
