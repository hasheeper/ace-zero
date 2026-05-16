(function initAce0OverviewShellView(global) {
    function create(ctx = {}) {
        const {
            adapterState,
            appData,
            appState,
            buildEncounterBadgeMarkup,
            deepCloneValue,
            escapePartyHtml,
            formatCompactResourceValue,
            getActModuleApi,
            getCampaignNodes,
            getCampaignTotalNodes,
            getCurrentChapterId,
            getCurrentColumnLineClass,
            getMapClassNameForNode,
            getMapColumns,
            getMapNodes,
            getTotalInventoryCount,
            isColumnVisibleInMapFog,
            isNodeDetailVisible,
            normalizeWorldClock
        } = ctx;

    const TOPBAR_TWO_ROW_WIDTH = 1180;
    const TOPBAR_THREE_ROW_WIDTH = 760;
    let topbarResizeObserver = null;

    function getTopbarLayoutModeForWidth(width) {
        if (width > 0 && width < TOPBAR_THREE_ROW_WIDTH) return 'three';
        if (width > 0 && width < TOPBAR_TWO_ROW_WIDTH) return 'two';
        return 'one';
    }

    function syncTopbarLayoutChrome() {
        const sysTopbar = document.getElementById('sysTopbar');
        if (!sysTopbar) return;
        const width = sysTopbar.getBoundingClientRect?.().width || 0;
        const mode = getTopbarLayoutModeForWidth(width);
        sysTopbar.classList.toggle('topbar-layout-one', mode === 'one');
        sysTopbar.classList.toggle('topbar-layout-two', mode === 'two');
        sysTopbar.classList.toggle('topbar-layout-three', mode === 'three');
        if (!topbarResizeObserver && typeof ResizeObserver === 'function') {
            topbarResizeObserver = new ResizeObserver(() => syncTopbarLayoutChrome());
            topbarResizeObserver.observe(sysTopbar);
        }
    }

    function renderTopbar() {
        const sysTopbar = document.getElementById('sysTopbar');
        const { actLabel, actTitleCn, nodeLabel, nodePoolLabel, resources } = appData.topbar;
        const nodeIndexValue = `${String(appState.currentNodeIndex).padStart(2, '0')}/${String(getCampaignTotalNodes()).padStart(2, '0')}`;
        const worldClock = normalizeWorldClock(appState.worldClock);
        const worldClockMarkup = `
            <div class="hdr-node hdr-worldclock">
                <span class="label">DAY</span>
                <span class="val">${worldClock.day}</span>
                <span class="phase">${worldClock.phase}</span>
            </div>
        `;
        const nodePoolMarkup = appData.topbar.nodePool.map((node) => `
            <div class="node-stat ${node.className}${getTotalInventoryCount(node.key) <= 0 ? ' is-empty' : ''}" title="${node.title}">
                <div class="mini-sigil"><div class="sigil-${node.key}"></div></div>
                <span class="node-val">${getTotalInventoryCount(node.key)}</span>
            </div>
        `).join('');
        const resourcesMarkup = resources.map((resource, index) => `
            ${index ? '<div class="magic-divider"></div>' : ''}
            <div class="res-stat ${resource.className}">
                <span class="res-label">${resource.label}</span>
                <span class="res-val">${
                    resource.className === 'res-gold'
                        ? formatCompactResourceValue(appState.resources.funds)
                        : resource.className === 'res-assets'
                            ? formatCompactResourceValue(appState.resources.assets)
                        : resource.className === 'res-mana'
                            ? `${appState.resources.mana}/100`
                            : resource.className === 'res-danger'
                                ? formatCompactResourceValue(appState.resources.majorDebt)
                            : formatCompactResourceValue(appState.resources.debt)
                }</span>
            </div>
        `).join('');
        sysTopbar.innerHTML = `
            <div class="bar-group">
                <div class="hdr-title">${actLabel} <span class="hdr-title-cn">${actTitleCn}</span></div>
                <div class="magic-divider"></div>
                <div class="hdr-node">${nodeLabel} <span class="val">${nodeIndexValue}</span></div>
                <div class="magic-divider"></div>
                ${worldClockMarkup}
            </div>
            <div class="bar-group center-pool">
                <span class="pool-leader">${nodePoolLabel}</span>
                <div class="magic-divider"></div>
                ${nodePoolMarkup}
            </div>
            <div class="bar-group topbar-right">${resourcesMarkup}</div>
        `;
        syncTopbarLayoutChrome();
    }

    const SIDE_PANEL_COMPACT_WIDTH = 1280;
    const SIDE_PANEL_NARROW_WIDTH = 900;
    let sidePanelResizeObserver = null;
    let sidePanelResizeBound = false;

    function getSidePanelLayoutModeForWidth(width) {
        if (width > 0 && width < SIDE_PANEL_NARROW_WIDTH) return 'narrow';
        if (width > 0 && width < SIDE_PANEL_COMPACT_WIDTH) return 'compact';
        return 'full';
    }

    function getMainLayoutWidth() {
        const mainLayout = document.querySelector('.main-layout');
        return mainLayout?.getBoundingClientRect?.().width || 0;
    }

    function normalizeSidePage(page) {
        return page === 'log' || page === 'info' ? page : 'main';
    }

    function syncSidePanelLayoutState() {
        const previousMode = appState.sidePanelLayoutMode || 'full';
        const nextMode = getSidePanelLayoutModeForWidth(getMainLayoutWidth());
        appState.sidePanelLayoutMode = nextMode;
        appState.activeSidePage = normalizeSidePage(appState.activeSidePage);

        if (nextMode !== 'narrow') {
            appState.activeSidePage = 'main';
        }

        if (nextMode !== previousMode && nextMode !== 'full') {
            appState.leftLogPanelCollapsed = true;
            appState.rightInfoPanelCollapsed = true;
        }
    }

    function getPanelCollapsedState(panel) {
        const mode = appState.sidePanelLayoutMode || 'full';
        if (mode === 'narrow') {
            return panel === 'right'
                ? appState.activeSidePage !== 'info'
                : appState.activeSidePage !== 'log';
        }
        return panel === 'right'
            ? appState.rightInfoPanelCollapsed === true
            : appState.leftLogPanelCollapsed === true;
    }

    function setPanelCollapsedState(panel, collapsed) {
        if (panel === 'right') {
            appState.rightInfoPanelCollapsed = collapsed === true;
            return;
        }
        appState.leftLogPanelCollapsed = collapsed === true;
    }

    function toggleSidePanel(panel) {
        const mode = appState.sidePanelLayoutMode || 'full';
        if (mode === 'narrow') {
            const sidePage = panel === 'right' ? 'info' : 'log';
            appState.activeSidePage = appState.activeSidePage === sidePage ? 'main' : sidePage;
            syncSidePanelChrome();
            return;
        }

        const nextCollapsed = !getPanelCollapsedState(panel);
        setPanelCollapsedState(panel, nextCollapsed);
        if (mode === 'compact' && nextCollapsed === false) {
            setPanelCollapsedState(panel === 'right' ? 'left' : 'right', true);
        }
        syncSidePanelChrome();
    }

    function buildSidePanelHandleMarkup(panel) {
        const isRight = panel === 'right';
        const collapsed = getPanelCollapsedState(panel);
        const label = isRight ? 'INFO' : 'LOG';
        const ariaLabel = `${collapsed ? 'Expand' : 'Collapse'} ${isRight ? 'info panel' : 'log panel'}`;
        return `
            <button class="side-panel-toggle ${isRight ? 'right-panel-toggle' : 'left-panel-toggle'}" type="button" data-side-panel-toggle="${panel}" aria-label="${ariaLabel}" aria-expanded="${collapsed ? 'false' : 'true'}">
                <span class="side-panel-toggle-mark" aria-hidden="true">${isRight ? (collapsed ? '‹' : '›') : (collapsed ? '›' : '‹')}</span>
                <span class="side-panel-toggle-label">${label}</span>
            </button>
        `;
    }

    function syncSidePanelChrome() {
        syncSidePanelLayoutState();
        ensureSidePanelLayoutObserver();
        const mainLayout = document.querySelector('.main-layout');
        const sidebar = document.querySelector('.sidebar');
        const rightSidebar = document.querySelector('.right-sidebar');
        if (mainLayout) {
            const mode = appState.sidePanelLayoutMode || 'full';
            const activePage = normalizeSidePage(appState.activeSidePage);
            mainLayout.classList.toggle('side-layout-full', mode === 'full');
            mainLayout.classList.toggle('side-layout-compact', mode === 'compact');
            mainLayout.classList.toggle('side-layout-narrow', mode === 'narrow');
            mainLayout.classList.toggle('side-page-main', activePage === 'main');
            mainLayout.classList.toggle('side-page-log', activePage === 'log');
            mainLayout.classList.toggle('side-page-info', activePage === 'info');
        }
        if (sidebar) {
            const collapsed = getPanelCollapsedState('left');
            sidebar.classList.toggle('is-log-collapsed', collapsed);
            const handle = sidebar.querySelector('[data-side-panel-toggle="left"]');
            if (handle) {
                handle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
                handle.setAttribute('aria-label', `${collapsed ? 'Expand' : 'Collapse'} log panel`);
                const mark = handle.querySelector('.side-panel-toggle-mark');
                if (mark) mark.textContent = collapsed ? '›' : '‹';
            }
        }
        if (rightSidebar) {
            const collapsed = getPanelCollapsedState('right');
            rightSidebar.classList.toggle('is-info-collapsed', collapsed);
            let handle = rightSidebar.querySelector('[data-side-panel-toggle="right"]');
            if (!handle) {
                rightSidebar.insertAdjacentHTML('beforeend', buildSidePanelHandleMarkup('right'));
                handle = rightSidebar.querySelector('[data-side-panel-toggle="right"]');
            }
            if (handle) {
                handle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
                handle.setAttribute('aria-label', `${collapsed ? 'Expand' : 'Collapse'} info panel`);
                const mark = handle.querySelector('.side-panel-toggle-mark');
                if (mark) mark.textContent = collapsed ? '‹' : '›';
                if (!handle.dataset.boundSidePanelToggle) {
                    handle.dataset.boundSidePanelToggle = '1';
                    handle.addEventListener('click', () => toggleSidePanel('right'));
                }
            }
        }
    }

    function ensureSidePanelLayoutObserver() {
        const mainLayout = document.querySelector('.main-layout');
        if (!mainLayout) return;
        if (!sidePanelResizeObserver && typeof ResizeObserver === 'function') {
            sidePanelResizeObserver = new ResizeObserver(() => syncSidePanelChrome());
            sidePanelResizeObserver.observe(mainLayout);
        }
        if (!sidePanelResizeBound && typeof window !== 'undefined') {
            sidePanelResizeBound = true;
            window.addEventListener('resize', syncSidePanelChrome, { passive: true });
        }
    }

    function getSidebarChapterTitle(chapterId, fallbackIndex = 0) {
        const normalizedChapterId = typeof chapterId === 'string' ? chapterId.trim() : '';
        if (!normalizedChapterId) return `CHAPTER ${fallbackIndex + 1}`;

        if (normalizedChapterId === getCurrentChapterId()) {
            const snapshotChapterTitle = typeof adapterState.lastFrontendSnapshot?.chapterMeta?.title === 'string'
                ? adapterState.lastFrontendSnapshot.chapterMeta.title.trim()
                : '';
            if (snapshotChapterTitle) return snapshotChapterTitle;
        }

        const actModule = getActModuleApi();
        if (actModule && typeof actModule.getChapter === 'function') {
            try {
                const chapter = actModule.getChapter(normalizedChapterId);
                const title = typeof chapter?.meta?.title === 'string' ? chapter.meta.title.trim() : '';
                if (title) return title;
            } catch (_) {}
        }

        if (normalizedChapterId === 'chapter0_exchange') return '命运';
        return normalizedChapterId.toUpperCase();
    }

    function getSidebarCampaignNodesForChapter(chapterId) {
        const normalizedChapterId = typeof chapterId === 'string' ? chapterId.trim() : '';
        if (!normalizedChapterId) return [];
        if (normalizedChapterId === getCurrentChapterId()) {
            return deepCloneValue(getCampaignNodes());
        }

        const actModule = getActModuleApi();
        if (!actModule || typeof actModule.getDefaultActState !== 'function' || typeof actModule.createFrontendSnapshot !== 'function') {
            return [];
        }

        try {
            const actState = actModule.getDefaultActState(normalizedChapterId);
            const snapshot = actModule.createFrontendSnapshot({ actState });
            if (Array.isArray(snapshot?.campaign?.nodes)) return deepCloneValue(snapshot.campaign.nodes);
            if (Array.isArray(snapshot?.nodes)) return deepCloneValue(snapshot.nodes);
        } catch (_) {}

        return [];
    }

    function buildSidebarChapterBranches() {
        const currentChapterId = getCurrentChapterId();
        const actModule = getActModuleApi();
        const listedChapterIds = actModule && typeof actModule.listChapters === 'function'
            ? actModule.listChapters()
            : [];
        const fallbackChapterIds = ['chapter0_exchange'];
        const orderedChapterIds = (listedChapterIds.length ? listedChapterIds : fallbackChapterIds)
            .filter((chapterId, index, list) => typeof chapterId === 'string' && chapterId.trim() && list.indexOf(chapterId) === index);
        const currentChapterIndex = Math.max(0, orderedChapterIds.indexOf(currentChapterId));

        return orderedChapterIds.map((chapterId, index) => ({
            chapterId,
            title: getSidebarChapterTitle(chapterId, index),
            state: index < currentChapterIndex
                ? 'is-past'
                : index === currentChapterIndex
                    ? 'is-active'
                    : 'is-future',
            expanded: chapterId === currentChapterId,
            nodes: getSidebarCampaignNodesForChapter(chapterId)
        }));
    }

    function renderSidebarLeaves(campaignNodes, currentNodeIndex, isActiveChapter) {
        if (!Array.isArray(campaignNodes) || !campaignNodes.length) return '';
        return campaignNodes.map((nodeTemplate) => {
            const state = !isActiveChapter
                ? 'is-future'
                : nodeTemplate.nodeIndex < currentNodeIndex
                    ? 'is-past'
                    : nodeTemplate.nodeIndex === currentNodeIndex
                        ? 'is-active'
                        : 'is-future';
            return `
                <div class="tree-leaf ${state}">
                    <div class="leaf-ring"></div>
                    <div class="leaf-info">
                        <span class="leaf-id">${nodeTemplate.label.replace(/\s+/g, '_')}</span>
                        <span class="leaf-name${state === 'is-future' ? ' abstract-node' : ''}">${nodeTemplate.title}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    function renderSidebar() {
        const sidebar = document.querySelector('.sidebar');
        const currentNodeIndex = appState.currentNodeIndex;
        const branchMarkup = buildSidebarChapterBranches().map((branch) => {
            const leafMarkup = renderSidebarLeaves(branch.nodes, currentNodeIndex, branch.expanded);
            return `
            <div class="tree-branch ${branch.state}" data-chapter-id="${branch.chapterId}">
                <div class="branch-head">
                    <span class="branch-icon"></span>
                    <span class="branch-title">${branch.title}</span>
                </div>
                ${branch.expanded && leafMarkup ? `<div class="branch-body">${leafMarkup}</div>` : ''}
            </div>
        `;
        }).join('');

        sidebar.innerHTML = `
            <div class="sidebar-content">
                <div class="sidebar-hero">
                    <span class="sidebar-title">${appData.sidebar.heroTitle}</span>
                    <span class="sidebar-subtitle">${appData.sidebar.heroSubtitle}</span>
                </div>
                <div class="archive-tree" id="archiveTree">${branchMarkup}</div>
            </div>
            ${buildSidePanelHandleMarkup('left')}
        `;
        const leftHandle = sidebar.querySelector('[data-side-panel-toggle="left"]');
        if (leftHandle) {
            leftHandle.addEventListener('click', () => toggleSidePanel('left'));
        }
        syncSidePanelChrome();
    }

    function renderMapLayer() {
        const mapLayer = document.getElementById('mapLayer');
        const gridMarkup = getMapColumns().map((column) => `
            <div class="grid-base-line ${getCurrentColumnLineClass(column)}${isColumnVisibleInMapFog(column) ? '' : ' grid-line-fog-hidden'}" id="${column.lineId}"></div>
        `).join('');
        const nodeMarkup = getMapNodes().map((node) => `
            <div class="${getMapClassNameForNode(node)}" id="${node.id}">
                <div class="node-label">${escapePartyHtml(isNodeDetailVisible(node.id) ? node.label : '')}</div>
                <div class="node-sublabel">${escapePartyHtml(isNodeDetailVisible(node.id) ? node.sublabel : '')}</div>
                <div class="astrolabe-ring">
                    <div class="node-fixed-envelope" aria-hidden="true"></div>
                    ${isNodeDetailVisible(node.id) ? buildEncounterBadgeMarkup(node.id) : ''}
                    <div class="magic-core"></div>
                </div>
            </div>
        `).join('');

        mapLayer.innerHTML = `
            <svg id="fate-canvas" viewBox="0 0 2800 1200"></svg>
            ${gridMarkup}
            ${nodeMarkup}
        `;
    }

    function needsMapLayerRebuild() {
        const mapLayer = document.getElementById('mapLayer');
        if (!mapLayer) return false;

        const expectedNodeIds = getMapNodes().map((node) => node.id);
        const renderedNodeIds = Array.from(mapLayer.querySelectorAll('.az-node')).map((nodeEl) => nodeEl.id);
        const expectedLineIds = getMapColumns().map((column) => column.lineId);
        const renderedLineIds = Array.from(mapLayer.querySelectorAll('.grid-base-line')).map((lineEl) => lineEl.id);
        const hasCanvas = !!mapLayer.querySelector('#fate-canvas');

        if (!hasCanvas) return true;
        if (renderedNodeIds.length !== expectedNodeIds.length) return true;
        if (renderedLineIds.length !== expectedLineIds.length) return true;

        for (let index = 0; index < expectedNodeIds.length; index += 1) {
            if (renderedNodeIds[index] !== expectedNodeIds[index]) return true;
        }

        for (let index = 0; index < expectedLineIds.length; index += 1) {
            if (renderedLineIds[index] !== expectedLineIds[index]) return true;
        }

        return false;
    }


        return Object.freeze({
            renderTopbar,
            renderSidebar,
            syncSidePanelChrome,
            renderMapLayer,
            needsMapLayerRebuild
        });
    }

    global.ACE0OverviewShellView = Object.freeze({ create });
})(typeof window !== 'undefined' ? window : globalThis);
