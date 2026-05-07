(function initAce0OverviewShellView(global) {
    // Intentionally not strict: this view keeps migrated markup helpers in a
    // ctx-backed with scope while overview is still a static-script app.

    function create(ctx = {}) {
        with (ctx) {
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
        const assetSummary = getCurrentAssetDeckSummary();
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
                            ? formatCompactResourceValue(assetSummary.points)
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
    }

    let sidebarCollapseHandler = null;
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
            <div class="sidebar-hero" role="button" tabindex="0" aria-label="Toggle chronicle">
                <span class="sidebar-title">${appData.sidebar.heroTitle}</span>
                <span class="sidebar-subtitle">${appData.sidebar.heroSubtitle}</span>
                <span class="sidebar-collapse-caret" aria-hidden="true">▾</span>
            </div>
            <div class="archive-tree" id="archiveTree">${branchMarkup}</div>
        `;

        // Mobile: click header to toggle collapse. Desktop: no-op (CSS guards visibility).
        if (!sidebarCollapseHandler) {
            sidebarCollapseHandler = (e) => {
                if (!window.matchMedia('(max-width: 820px)').matches) return;
                sidebar.classList.toggle('is-collapsed');
            };
        }
        const hero = sidebar.querySelector('.sidebar-hero');
        if (hero) {
            hero.addEventListener('click', sidebarCollapseHandler);
            hero.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    sidebarCollapseHandler(e);
                }
            });
        }

        // Default to collapsed on initial mobile render
        if (window.matchMedia('(max-width: 820px)').matches && !sidebar.dataset.mobileInit) {
            sidebar.classList.add('is-collapsed');
            sidebar.dataset.mobileInit = '1';
        }
    }

    function renderMapLayer() {
        const mapLayer = document.getElementById('mapLayer');
        const gridMarkup = getMapColumns().map((column) => `
            <div class="grid-base-line ${getCurrentColumnLineClass(column)}${isColumnVisibleInMapFog(column) ? '' : ' grid-line-fog-hidden'}" id="${column.lineId}"></div>
        `).join('');
        const nodeMarkup = getMapNodes().map((node) => `
            <div class="${getMapClassNameForNode(node)}" id="${node.id}">
                <div class="node-label">${escapePartyHtml(node.label)}</div>
                <div class="node-sublabel">${escapePartyHtml(isNodeDetailVisible(node.id) ? node.sublabel : 'UNKNOWN')}</div>
                <div class="astrolabe-ring">
                    <div class="node-fixed-envelope" aria-hidden="true"></div>
                    ${buildEncounterBadgeMarkup(node.id)}
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
                renderMapLayer,
                needsMapLayerRebuild
            });
        }
    }

    global.ACE0OverviewShellView = Object.freeze({ create });
})(typeof window !== 'undefined' ? window : globalThis);
