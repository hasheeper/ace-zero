(function initAce0OverviewMapView(global) {
    'use strict';

    const SVG_NS = 'http://www.w3.org/2000/svg';
    const SEGMENTS = 100;
    const LAYER_FIT_SHRINK = 1;
    const LAYER_PADDING_X = 48;
    const LAYER_PADDING_Y = 64;
    const GRID_LINE_PADDING_TOP = 110;
    const GRID_LINE_PADDING_BOTTOM = 110;
    const GRID_LINE_FOCUS_OVERSHOOT = 48;
    const LAYER_BOTTOM_PADDING_Y = GRID_LINE_PADDING_BOTTOM + GRID_LINE_FOCUS_OVERSHOOT + 32;

    const THEMES = Object.freeze({
        dead: Object.freeze([{ class: 'th-dead', isStatic: true }]),
        solid_path: Object.freeze([{ class: 'th-path-solid', isStatic: true }]),
        jump_path: Object.freeze([
            { class: 'th-jump-aura', isStatic: true },
            { class: 'th-jump-main', isStatic: true }
        ]),
        future: Object.freeze([{ class: 'th-future', isStatic: true }]),
        finale_far: Object.freeze([
            { class: 'th-finale-far', isStatic: true },
            { class: 'th-finale-aura', isStatic: false, freq: 1.6, mathAmp: 7, speed: 0.0009, phaseOffset: 0 }
        ]),
        danger_far: Object.freeze([
            { class: 'th-danger-far', isStatic: true },
            { class: 'th-danger-aura', isStatic: false, freq: 2, mathAmp: 8, speed: 0.001, phaseOffset: 0 }
        ]),
        active_flow: Object.freeze([
            { class: 'th-active-aura', isStatic: false, freq: 1.5, mathAmp: 5, speed: 0.0008, phaseOffset: 0 },
            { class: 'th-active-main', isStatic: false, freq: 2.2, mathAmp: 3, speed: 0.0016, phaseOffset: Math.PI / 4 },
            { class: 'th-active-high', isStatic: false, freq: 3.5, mathAmp: -2, speed: 0.0022, phaseOffset: Math.PI }
        ])
    });

    function call(ctx, name, ...args) {
        const fn = ctx && typeof ctx[name] === 'function' ? ctx[name] : null;
        return fn ? fn(...args) : undefined;
    }

    function getDomElement(ctx, name, fallbackId) {
        const getter = ctx && typeof ctx[name] === 'function' ? ctx[name] : null;
        const value = getter ? getter() : null;
        return value || global.document?.getElementById(fallbackId) || null;
    }

    function parsePxPosition(value, fallback = 0) {
        const parsed = Number.parseFloat(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    function getNodeCenter(id) {
        const el = global.document?.getElementById(id);
        if (!el) return { x: 0, y: 0 };
        return { x: Number.parseFloat(el.style.left), y: Number.parseFloat(el.style.top) };
    }

    function create(ctx = {}) {
        const appData = ctx.appData || {};
        const appState = ctx.appState || {};
        const autoLayoutRules = { ...(appData.map?.layout || {}) };
        let active = true;
        let drawLoopRunning = false;
        let renderQueue = [];
        let initializedCamera = false;
        let currentFocusNodeId = call(ctx, 'getMapFocusNodeId') || appData.map?.focusNodeId || '';
        let scale = 1;
        let viewportWidth = 1;
        let viewportHeight = 1;
        let panX = 0;
        let panY = 0;
        let layerMetrics = { width: 1, height: 1 };
        let isDragging = false;
        let startMouseX = 0;
        let startMouseY = 0;

        function getViewport() {
            return getDomElement(ctx, 'getViewport', 'mapViewport');
        }

        function getLayer() {
            return getDomElement(ctx, 'getLayer', 'mapLayer');
        }

        function getCanvas() {
            return getDomElement(ctx, 'getCanvas', 'fate-canvas');
        }

        function getMapLayerMeta() {
            return getDomElement(ctx, 'getMapLayerMeta', 'map-layer-meta');
        }

        function updateTransform() {
            const layer = getLayer();
            if (layer) layer.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
        }

        function syncViewportSize() {
            const viewport = getViewport();
            viewportWidth = viewport?.clientWidth || viewportWidth || 1;
            viewportHeight = viewport?.clientHeight || viewportHeight || 1;
        }

        function getRowOffsets(count) {
            if (count === 1) return [0];
            if (count === 2) return [-autoLayoutRules.spreadTwo, autoLayoutRules.spreadTwo];
            if (count === 3) return [-autoLayoutRules.spreadThree, 0, autoLayoutRules.spreadThree];
            if (count === 4) return [-360, -120, 120, 360];
            if (count === 5) return [-480, -240, 0, 240, 480];
            return Array.from({ length: count }, (_, index) => (index - (count - 1) / 2) * 190);
        }

        function getMicroLayoutOffset(count, columnIndex, nodeIndex) {
            const presets = {
                1: [[0, 0]],
                2: [[-6, -6], [6, 6]],
                3: [[-8, -8], [3, 0], [-6, 8]],
                4: [[-9, -9], [6, -3], [-6, 3], [9, 9]],
                5: [[-10, -10], [6, -6], [0, 0], [-6, 6], [10, 10]]
            };
            const selected = presets[count];
            if (selected?.[nodeIndex]) {
                const [dx, dy] = selected[nodeIndex];
                const direction = columnIndex % 2 === 0 ? 1 : -1;
                return { dx: dx * direction, dy };
            }
            return {
                dx: ((nodeIndex % 2 === 0 ? -1 : 1) * 12),
                dy: (nodeIndex - ((count - 1) / 2)) * 10
            };
        }

        function getLaneAnchorValue(nodeId, count) {
            const nodeData = call(ctx, 'getNodeData', nodeId);
            const laneScalars = {
                white: -1,
                blue: -0.33,
                orange: 0.33,
                red: 1
            };
            const rowOffsets = getRowOffsets(count);
            const maxOffset = rowOffsets.length
                ? Math.max(...rowOffsets.map((value) => Math.abs(value)))
                : 0;
            const getLaneValue = (laneKey) => {
                const scalar = laneScalars[laneKey];
                if (!Number.isFinite(scalar)) return null;
                return scalar * maxOffset * 0.9;
            };
            const mainlineLanes = Array.isArray(nodeData?.mainlineLanes) ? nodeData.mainlineLanes : [];
            if (mainlineLanes.length) {
                const values = mainlineLanes
                    .map((laneKey) => getLaneValue(laneKey))
                    .filter((value) => Number.isFinite(value));
                if (values.length) {
                    return values.reduce((sum, value) => sum + value, 0) / values.length;
                }
            }
            if (typeof nodeData?.lane === 'string') {
                const fallbackLaneValue = getLaneValue(nodeData.lane);
                if (Number.isFinite(fallbackLaneValue)) return fallbackLaneValue;
            }
            return 0;
        }

        function applyAutoMacroLayout() {
            (call(ctx, 'getMapColumns') || []).forEach((column, columnIndex) => {
                const x = autoLayoutRules.startX + (autoLayoutRules.columnGap * columnIndex);
                const offsets = getRowOffsets(column.nodeIds.length);
                const gridLine = global.document?.getElementById(column.lineId);

                if (gridLine) {
                    gridLine.style.left = `${x}px`;
                }

                column.nodeIds.forEach((nodeId, nodeIndex) => {
                    const node = global.document?.getElementById(nodeId);
                    if (!node) return;
                    const micro = getMicroLayoutOffset(column.nodeIds.length, columnIndex, nodeIndex);
                    const baseOffset = offsets[nodeIndex] || 0;
                    const laneOffset = getLaneAnchorValue(nodeId, column.nodeIds.length);
                    const y = autoLayoutRules.centerY + (baseOffset * 0.45) + (laneOffset * 0.65) + micro.dy;
                    node.style.left = `${x + micro.dx}px`;
                    node.style.top = `${y}px`;
                });
            });
        }

        function getFocusNodeCenter() {
            const focus = global.document?.getElementById(currentFocusNodeId);
            if (!focus) return { x: 0, y: 0 };
            return {
                x: parsePxPosition(focus.style.left, 0),
                y: parsePxPosition(focus.style.top, 0)
            };
        }

        function centerViewportOnCurrentFocus() {
            syncViewportSize();
            const focus = getFocusNodeCenter();
            panX = (viewportWidth / 2) - (focus.x * scale);
            panY = (viewportHeight / 2) - (focus.y * scale);
            updateTransform();
        }

        function getCameraFitMetrics() {
            const layer = getLayer();
            const currentIndex = Math.max(1, Math.round(Number(appState.currentNodeIndex) || 1));
            const maxIndex = currentIndex + Math.max(0, Math.round(Number(call(ctx, 'getVisionSightValue')) || 0));
            const minIndex = Math.max(1, currentIndex - 1);
            const fitNodes = Array.from(layer?.querySelectorAll('.az-node:not(.node-fog-hidden)') || [])
                .map((node) => ({
                    x: parsePxPosition(node.style.left, NaN),
                    y: parsePxPosition(node.style.top, NaN),
                    nodeIndex: call(ctx, 'getNodeIndex', node.id)
                }))
                .filter((node) => (
                    Number.isFinite(node.x) &&
                    Number.isFinite(node.y) &&
                    node.nodeIndex >= minIndex &&
                    node.nodeIndex <= maxIndex
                ));
            if (!fitNodes.length) return layerMetrics;
            const minX = Math.min(...fitNodes.map((node) => node.x));
            const maxX = Math.max(...fitNodes.map((node) => node.x));
            const minY = Math.min(...fitNodes.map((node) => node.y));
            const maxY = Math.max(...fitNodes.map((node) => node.y));
            return {
                width: Math.max(320, (maxX - minX) + 260),
                height: Math.max(320, (maxY - minY) + 260)
            };
        }

        function getColumnLineBounds(column, layerHeight, fallbackTop, fallbackBottom) {
            const currentNodeData = call(ctx, 'getCurrentNodeData') || {};
            if (column.nodeIds.includes(currentNodeData.presentNode)) {
                const presentNode = global.document?.getElementById(currentNodeData.presentNode);
                const presentY = presentNode ? parsePxPosition(presentNode.style.top, NaN) : NaN;

                if (Number.isFinite(presentY)) {
                    const top = Math.max(24, Math.round(presentY - GRID_LINE_PADDING_TOP - GRID_LINE_FOCUS_OVERSHOOT));
                    const bottom = Math.min(layerHeight - 24, Math.round(presentY + GRID_LINE_PADDING_BOTTOM + GRID_LINE_FOCUS_OVERSHOOT));
                    return {
                        top,
                        bottom: Math.max(top + 40, bottom)
                    };
                }
            }

            const columnYValues = column.nodeIds
                .map((nodeId) => {
                    const node = global.document?.getElementById(nodeId);
                    return node ? parsePxPosition(node.style.top, NaN) : NaN;
                })
                .filter((value) => Number.isFinite(value));

            if (!columnYValues.length) {
                return {
                    top: fallbackTop,
                    bottom: fallbackBottom
                };
            }

            const columnMinY = Math.min(...columnYValues);
            const columnMaxY = Math.max(...columnYValues);
            const top = Math.max(24, Math.round(columnMinY - GRID_LINE_PADDING_TOP));
            const bottom = Math.min(layerHeight - 24, Math.round(columnMaxY + GRID_LINE_PADDING_BOTTOM));

            return {
                top,
                bottom: Math.max(top + 40, bottom)
            };
        }

        function syncLayerSize() {
            const layer = getLayer();
            const canvas = getCanvas();
            if (!layer || !canvas) return;
            syncViewportSize();
            const xValues = [];
            const yValues = [];
            const currentNodeData = call(ctx, 'getCurrentNodeData') || {};

            layer.querySelectorAll('.az-node:not(.node-fog-hidden)').forEach((node) => {
                xValues.push(parsePxPosition(node.style.left, 0));
                yValues.push(parsePxPosition(node.style.top, 0));
            });

            layer.querySelectorAll('.grid-base-line:not(.grid-line-fog-hidden)').forEach((line) => {
                xValues.push(parsePxPosition(line.style.left, 0));
            });

            const maxX = xValues.length ? Math.max(...xValues) : viewportWidth;
            const maxY = yValues.length ? Math.max(...yValues) : viewportHeight / 2;
            const minY = yValues.length ? Math.min(...yValues) : viewportHeight / 2;
            const layerWidth = Math.ceil(maxX + LAYER_PADDING_X);
            const layerHeight = Math.ceil(maxY + Math.max(LAYER_PADDING_Y, LAYER_BOTTOM_PADDING_Y, minY * 0.08));
            const gridTop = Math.max(24, Math.round(minY - GRID_LINE_PADDING_TOP));
            const gridBottom = Math.min(layerHeight - 24, Math.round(maxY + GRID_LINE_PADDING_BOTTOM));
            const presentNode = currentNodeData?.presentNode
                ? global.document?.getElementById(currentNodeData.presentNode)
                : null;
            const presentNodeX = presentNode ? parsePxPosition(presentNode.style.left, NaN) : NaN;

            layerMetrics = { width: layerWidth, height: layerHeight };
            layer.style.width = `${layerWidth}px`;
            layer.style.height = `${layerHeight}px`;
            canvas.setAttribute('viewBox', `0 0 ${layerWidth} ${layerHeight}`);

            (call(ctx, 'getMapColumns') || []).forEach((column) => {
                const line = global.document?.getElementById(column.lineId);
                if (!line) return;
                const bounds = getColumnLineBounds(column, layerHeight, gridTop, gridBottom);
                const lineLeft = column.nodeIds.includes(currentNodeData.presentNode) && Number.isFinite(presentNodeX)
                    ? presentNodeX
                    : parsePxPosition(line.style.left, 0);
                line.style.left = `${lineLeft}px`;
                line.style.top = `${bounds.top}px`;
                line.style.height = `${Math.max(40, bounds.bottom - bounds.top)}px`;
            });

            const mapLayerMeta = getMapLayerMeta();
            if (mapLayerMeta) {
                const currentNodeTemplate = call(ctx, 'getCurrentNodeTemplate');
                const currentNodeDebugLabel = call(ctx, 'getNodeDebugLabel', currentNodeTemplate);
                mapLayerMeta.textContent = call(ctx, 'shouldShowMapProgressMeta')
                    ? (
                        call(ctx, 'isRouteSelectionActive')
                            ? `MACRO THREAT MAP · NODE ${String(appState.currentNodeIndex + 1).padStart(2, '0')}`
                            : call(ctx, 'isPlanningPhase')
                                ? `MACRO THREAT MAP · NODE ${String(appState.currentNodeIndex).padStart(2, '0')}`
                                : `MACRO THREAT MAP · NODE ${String(appState.currentNodeIndex).padStart(2, '0')} · SEG ${Math.min(appState.currentPhaseIndex + 1, appData.planner?.phases?.length || 0)}/${appData.planner?.phases?.length || 0}`
                    )
                    : `MACRO THREAT MAP · NODE ${String(appState.currentNodeIndex).padStart(2, '0')}`;
                if (currentNodeDebugLabel) {
                    mapLayerMeta.textContent += ` · ${currentNodeDebugLabel}`;
                }
            }
        }

        function fitLayerToViewport() {
            syncViewportSize();
            const safeWidth = Math.max(viewportWidth - 180, 320);
            const safeHeight = Math.max(viewportHeight - 220, 320);
            const fitMetrics = getCameraFitMetrics();
            const widthScale = safeWidth / Math.max(fitMetrics.width, 1);
            const heightScale = safeHeight / Math.max(fitMetrics.height, 1);
            const fittedScale = Math.min(widthScale, heightScale, 1) * LAYER_FIT_SHRINK;
            scale = Math.max(0.32, fittedScale);
        }

        function getControlledNodeEntry(nodeId) {
            const actState = call(ctx, 'buildCurrentActStateSnapshot') || {};
            const controlledNodes = actState.controlledNodes && typeof actState.controlledNodes === 'object'
                ? actState.controlledNodes
                : {};
            const entry = controlledNodes[nodeId];
            return entry && typeof entry === 'object' ? entry : null;
        }

        function getOriginalNodeTypeClass(node) {
            const rawTypeClass = node.classes.find((className) => className.startsWith('type-'));
            const originalType = call(ctx, 'normalizeResourceKey', rawTypeClass ? rawTypeClass.replace('type-', '') : '', 'vision');
            return `type-${originalType}`;
        }

        function getDisplayTypeKeyForMapNode(node) {
            const controlledEntry = getControlledNodeEntry(node.id);
            const controlType = call(ctx, 'normalizeRestTintKey', controlledEntry?.type, '');
            if (controlType) return controlType;
            return getOriginalNodeTypeClass(node).replace('type-', '');
        }

        function getMapClassNameForNode(node) {
            const isBranchNode = node.classes.includes('node-branch');
            const hasFixedPhase = node.classes.includes('node-has-fixed-phase');
            const classList = ['az-node'];
            const currentNodeData = call(ctx, 'getCurrentNodeData') || {};
            const isBossNode = call(ctx, 'isBossNodeId', node.id);
            const isFinaleNode = call(ctx, 'isFinaleNodeId', node.id);
            const controlledEntry = getControlledNodeEntry(node.id);
            const controlType = call(ctx, 'normalizeRestTintKey', controlledEntry?.type, '');
            const detailVisible = call(ctx, 'isNodeDetailVisible', node.id);
            const displayTypeClass = detailVisible ? `type-${getDisplayTypeKeyForMapNode(node)}` : '';
            const pathNodeIds = Array.isArray(currentNodeData.pathNodes) && currentNodeData.pathNodes.length
                ? currentNodeData.pathNodes
                : appState.routeHistory;
            const routeSelectionActive = call(ctx, 'isRouteSelectionActive');
            const routeOptionIds = routeSelectionActive ? (call(ctx, 'getRouteOptions') || []) : [];
            const isRouteChoiceNode = routeOptionIds.includes(node.id);
            const isJumpRouteChoice = isRouteChoiceNode && appData.runtime?.frontendSnapshot?.routeMode === 'jump';
            const encounterMarkers = call(ctx, 'getEncounterMarkersForNode', node.id) || [];

            if (node.id === currentNodeData.presentNode) {
                classList.push(isBossNode ? 'node-reckoning' : isFinaleNode ? 'node-finale' : 'node-present');
            } else if ((pathNodeIds || []).includes(node.id)) {
                classList.push('node-path');
            } else if ((currentNodeData.deadNodes || []).includes(node.id)) {
                classList.push('node-dead');
            } else if (isRouteChoiceNode) {
                classList.push(isBossNode ? 'node-reckoning' : isFinaleNode ? 'node-finale' : 'node-future', 'node-route-choice');
                if (isJumpRouteChoice) classList.push('node-jump-choice');
            } else if (isBossNode) {
                classList.push('node-reckoning');
            } else if (isFinaleNode) {
                classList.push('node-finale');
            } else {
                classList.push('node-future');
                if (call(ctx, 'isImmediateNextNode', node.id)) {
                    classList.push('node-next');
                } else {
                    classList.push('node-future-far');
                }
            }

            if (isBranchNode) classList.push('node-branch');
            if (hasFixedPhase && detailVisible) classList.push('node-has-fixed-phase');
            if (displayTypeClass) classList.push(displayTypeClass);
            if (node.id !== currentNodeData.presentNode && !(pathNodeIds || []).includes(node.id) && !(currentNodeData.deadNodes || []).includes(node.id)) {
                classList.push(call(ctx, 'isNodeInVisionRange', node.id) ? 'node-visible' : 'node-obscured');
            }
            if (!detailVisible) classList.push('node-intel-hidden', 'node-fog-hidden');
            if (call(ctx, 'isNodeTemporarilyRevealedByIntel', node.id)) classList.push('node-intel-revealed');
            if (controlledEntry) {
                classList.push('node-controlled', `control-${controlType || 'neutral'}`);
            }
            if (encounterMarkers.length) {
                classList.push('node-encounter');
            }
            return classList.join(' ');
        }

        function updateMapUI() {
            (call(ctx, 'getMapColumns') || []).forEach((column) => {
                const lineEl = global.document?.getElementById(column.lineId);
                if (!lineEl) return;
                lineEl.className = `grid-base-line ${call(ctx, 'getCurrentColumnLineClass', column)}${call(ctx, 'isColumnVisibleInMapFog', column) ? '' : ' grid-line-fog-hidden'}`;
            });

            (call(ctx, 'getMapNodes') || []).forEach((node) => {
                const nodeEl = global.document?.getElementById(node.id);
                if (!nodeEl) return;
                nodeEl.className = getMapClassNameForNode(node);
                const labelEl = nodeEl.querySelector('.node-label');
                const sublabelEl = nodeEl.querySelector('.node-sublabel');
                const detailVisible = call(ctx, 'isNodeDetailVisible', node.id);
                if (labelEl) labelEl.textContent = node.label;
                if (sublabelEl) sublabelEl.textContent = detailVisible ? node.sublabel : 'UNKNOWN';
                nodeEl.dataset.displayType = detailVisible ? getDisplayTypeKeyForMapNode(node) : 'unknown';
                const controlledEntry = getControlledNodeEntry(node.id);
                const controlType = call(ctx, 'normalizeRestTintKey', controlledEntry?.type, '');
                const encounterMarkup = call(ctx, 'buildEncounterBadgeMarkup', node.id);
                const ringEl = nodeEl.querySelector('.astrolabe-ring');
                const encounterEl = ringEl?.querySelector('.encounter-badge');
                if (ringEl) {
                    if (encounterMarkup) {
                        if (encounterEl) encounterEl.outerHTML = encounterMarkup;
                        else ringEl.insertAdjacentHTML('afterbegin', encounterMarkup);
                    } else if (encounterEl) {
                        encounterEl.remove();
                    }
                }
                const encounterMarker = (call(ctx, 'getEncounterMarkersForNode', node.id) || [])[0] || null;
                if (encounterMarker) {
                    nodeEl.dataset.encounterChar = encounterMarker.charKey;
                } else {
                    nodeEl.removeAttribute('data-encounter-char');
                }
                if (controlType) {
                    nodeEl.dataset.controlType = controlType;
                } else {
                    nodeEl.removeAttribute('data-control-type');
                }
            });
            setFocusNodeId(call(ctx, 'getCurrentNodeData')?.mapFocus || currentFocusNodeId);
        }

        function refresh() {
            updateMapUI();
            applyAutoMacroLayout();
            syncLayerSize();
            rebuild();
            ensureDrawLoop();
            centerViewportOnCurrentFocus();
        }

        function getNodeMainlineLanes(nodeId) {
            const nodeData = call(ctx, 'getNodeData', nodeId);
            return Array.isArray(nodeData?.mainlineLanes) ? nodeData.mainlineLanes : [];
        }

        function getPreferredLaneTargetId(fromNodeId, laneKey) {
            const outgoing = (call(ctx, 'getMapTopology') || []).filter((entry) => entry.from === fromNodeId);
            const candidates = outgoing
                .map((entry) => ({ nodeId: entry.to, targetLanes: getNodeMainlineLanes(entry.to) }))
                .filter((entry) => entry.targetLanes.includes(laneKey));
            if (!candidates.length) return '';
            candidates.sort((left, right) => {
                const leftExact = left.targetLanes.length === 1 && left.targetLanes[0] === laneKey ? 0 : 1;
                const rightExact = right.targetLanes.length === 1 && right.targetLanes[0] === laneKey ? 0 : 1;
                if (leftExact !== rightExact) return leftExact - rightExact;
                if (left.targetLanes.length !== right.targetLanes.length) return left.targetLanes.length - right.targetLanes.length;
                return left.nodeId.localeCompare(right.nodeId);
            });
            return candidates[0]?.nodeId || '';
        }

        function getPreferredLaneSourceId(toNodeId, laneKey) {
            const incoming = (call(ctx, 'getMapTopology') || []).filter((entry) => entry.to === toNodeId);
            const candidates = incoming
                .map((entry) => ({ nodeId: entry.from, sourceLanes: getNodeMainlineLanes(entry.from) }))
                .filter((entry) => entry.sourceLanes.includes(laneKey));
            if (!candidates.length) return '';
            candidates.sort((left, right) => {
                const leftExact = left.sourceLanes.length === 1 && left.sourceLanes[0] === laneKey ? 0 : 1;
                const rightExact = right.sourceLanes.length === 1 && right.sourceLanes[0] === laneKey ? 0 : 1;
                if (leftExact !== rightExact) return leftExact - rightExact;
                if (left.sourceLanes.length !== right.sourceLanes.length) return left.sourceLanes.length - right.sourceLanes.length;
                return left.nodeId.localeCompare(right.nodeId);
            });
            return candidates[0]?.nodeId || '';
        }

        function getConnectionLaneKey(conn) {
            if (conn.isJumpPath) return 'lane-jump';
            if (conn.from === 'node3-descent') {
                if (conn.to === 'node04-a-route') return 'lane-blue';
                if (conn.to === 'node04-b-route') return 'lane-orange';
            }
            if (conn.from === 'node04-a-route' && conn.to === 'node05-a-route') return 'lane-white';
            if (conn.from === 'node04-b-route' && conn.to === 'node05-d-route') return 'lane-red';
            if (conn.from === 'node14-a-route' && conn.to === 'node15-a-route') return 'lane-white';
            if (conn.from === 'node14-b-route' && conn.to === 'node15-a-route') return 'lane-blue';
            if (conn.from === 'node14-c-route' && conn.to === 'node15-a-route') return 'lane-orange';
            if (conn.from === 'node14-c-route' && conn.to === 'node15-b-route') return 'lane-orange';
            if (conn.from === 'node14-d-route' && conn.to === 'node15-b-route') return 'lane-red';
            const fromMainlineLanes = getNodeMainlineLanes(conn.from);
            const toMainlineLanes = getNodeMainlineLanes(conn.to);
            const sharedLane = ['white', 'blue', 'orange', 'red'].find((laneKey) => (
                fromMainlineLanes.includes(laneKey)
                && toMainlineLanes.includes(laneKey)
                && getPreferredLaneTargetId(conn.from, laneKey) === conn.to
                && getPreferredLaneSourceId(conn.to, laneKey) === conn.from
            ));
            return sharedLane ? `lane-${sharedLane}` : 'lane-neutral';
        }

        function getConnectionTypeForCurrentNode(conn) {
            const presentNode = call(ctx, 'getCurrentNodeData')?.presentNode;
            if (conn.isJumpPath) return 'jump_path';
            if (call(ctx, 'isBossNodeId', conn.to) && appState.currentNodeIndex < call(ctx, 'getCampaignTotalNodes')) return 'danger_far';
            if (call(ctx, 'isFinaleNodeId', conn.to) && appState.currentNodeIndex < call(ctx, 'getCampaignTotalNodes')) return 'finale_far';
            if (conn.from === presentNode) return 'active_flow';
            if (call(ctx, 'isVisitedConnection', conn.from, conn.to)) return 'solid_path';
            return 'future';
        }

        function rebuild() {
            const canvas = getCanvas();
            const renderedTopology = (call(ctx, 'getRenderedMapTopology') || [])
                .filter((conn) => call(ctx, 'isConnectionVisibleInMapFog', conn));
            if (!canvas) return;
            if (!(call(ctx, 'getMapNodes') || []).length || !renderedTopology.length) {
                canvas.innerHTML = '';
                renderQueue = [];
                return;
            }
            canvas.innerHTML = '';
            renderQueue = [];
            renderedTopology.forEach((conn) => {
                const type = getConnectionTypeForCurrentNode(conn);
                const layers = THEMES[type] || THEMES.future;
                const laneClass = getConnectionLaneKey(conn);
                layers.forEach((cfg) => {
                    const pathEl = global.document.createElementNS(SVG_NS, 'path');
                    pathEl.setAttribute('class', `magic-thread ${cfg.class} ${laneClass}`);
                    canvas.appendChild(pathEl);
                    renderQueue.push({ pathEl, fromId: conn.from, toId: conn.to, laneClass, isJumpPath: conn.isJumpPath === true, ...cfg });
                });
            });
        }

        function fitToFocus() {
            fitLayerToViewport();
            centerViewportOnCurrentFocus();
        }

        function setFocusNodeId(nextNodeId) {
            if (typeof nextNodeId === 'string' && nextNodeId.trim()) {
                currentFocusNodeId = nextNodeId.trim();
            }
        }

        function setCanvasGetter(getCanvasFn) {
            if (typeof getCanvasFn === 'function') ctx.getCanvas = getCanvasFn;
        }

        function renderedCanvasChanged() {
            setCanvasGetter(() => global.document?.getElementById('fate-canvas') || null);
            rebuild();
            ensureDrawLoop();
        }

        function initializeCamera() {
            if (initializedCamera) return;
            initializedCamera = true;
            syncViewportSize();
            applyAutoMacroLayout();
            syncLayerSize();
            fitLayerToViewport();
            centerViewportOnCurrentFocus();

            global.addEventListener('resize', () => {
                syncViewportSize();
                applyAutoMacroLayout();
                syncLayerSize();
                fitLayerToViewport();
                centerViewportOnCurrentFocus();
            });

            const viewport = getViewport();
            if (viewport) {
                viewport.addEventListener('mousedown', (event) => {
                    if (event.target.closest('.az-node')) return;
                    isDragging = true;
                    startMouseX = event.clientX - panX;
                    startMouseY = event.clientY - panY;
                });

                viewport.addEventListener('wheel', (event) => {
                    event.preventDefault();
                    const rect = viewport.getBoundingClientRect();
                    const mouseX = event.clientX - rect.left;
                    const mouseY = event.clientY - rect.top;
                    const zoomFactor = -event.deltaY * 0.001;
                    let newScale = scale * Math.exp(zoomFactor);
                    newScale = Math.max(0.2, Math.min(newScale, 2.0));
                    const scaleRatio = newScale / scale;
                    panX = mouseX - (mouseX - panX) * scaleRatio;
                    panY = mouseY - (mouseY - panY) * scaleRatio;
                    scale = newScale;
                    updateTransform();
                }, { passive: false });
            }

            global.addEventListener('mouseup', () => { isDragging = false; });
            global.addEventListener('mousemove', (event) => {
                if (!isDragging) return;
                panX = event.clientX - startMouseX;
                panY = event.clientY - startMouseY;
                updateTransform();
            });
        }

        function start() {
            active = true;
            ensureDrawLoop();
        }

        function stop() {
            active = false;
        }

        function setActive(nextActive) {
            const normalized = Boolean(nextActive);
            if (active === normalized) return;
            active = normalized;
            if (normalized) ensureDrawLoop();
        }

        function ensureDrawLoop() {
            if (!active || drawLoopRunning) return;
            drawLoopRunning = true;
            global.requestAnimationFrame(draw);
        }

        function draw() {
            if (!active) {
                drawLoopRunning = false;
                return;
            }
            const time = global.performance?.now ? global.performance.now() : Date.now();

            renderQueue.forEach((item) => {
                const start = getNodeCenter(item.fromId);
                const end = getNodeCenter(item.toId);
                if (item.isJumpPath) {
                    item.pathEl.setAttribute('d', `M ${start.x} ${start.y} L ${end.x} ${end.y}`);
                    return;
                }

                const dx = end.x - start.x;
                const cy = dx * 0.45;
                const c1x = start.x + cy;
                const c1y = start.y;
                const c2x = end.x - cy;
                const c2y = end.y;

                if (item.isStatic) {
                    item.pathEl.setAttribute('d', `M ${start.x} ${start.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${end.x} ${end.y}`);
                    return;
                }

                let d = `M ${start.x} ${start.y} `;
                for (let i = 1; i <= SEGMENTS; i += 1) {
                    const t = i / SEGMENTS;
                    const mt = 1 - t;
                    const pX = mt * mt * mt * start.x + 3 * mt * mt * t * c1x + 3 * mt * t * t * c2x + t * t * t * end.x;
                    const pY = mt * mt * mt * start.y + 3 * mt * mt * t * c1y + 3 * mt * t * t * c2y + t * t * t * end.y;

                    const dX = 3 * mt * mt * (c1x - start.x) + 6 * mt * t * (c2x - c1x) + 3 * t * t * (end.x - c2x);
                    const dY = 3 * mt * mt * (c1y - start.y) + 6 * mt * t * (c2y - c1y) + 3 * t * t * (end.y - c2y);
                    const len = Math.sqrt(dX * dX + dY * dY) || 1;
                    const nX = -dY / len;
                    const nY = dX / len;

                    const damping = Math.sin(t * Math.PI);
                    const wave = Math.sin((t * Math.PI * item.freq) + (time * item.speed) + item.phaseOffset);
                    const offset = item.mathAmp * damping * wave;

                    d += `L ${pX + nX * offset} ${pY + nY * offset} `;
                }
                item.pathEl.setAttribute('d', d);
            });

            global.requestAnimationFrame(draw);
        }

        return Object.freeze({
            refresh,
            rebuild,
            fitToFocus,
            start,
            stop,
            setActive,
            setFocusNodeId,
            setCanvasGetter,
            renderedCanvasChanged,
            initializeCamera,
            updateMapUI,
            applyAutoMacroLayout,
            syncLayerSize,
            fitLayerToViewport,
            centerViewportOnCurrentFocus,
            getMapClassNameForNode,
            ensureDrawLoop
        });
    }

    global.ACE0OverviewMapView = Object.freeze({ create });
})(typeof window !== 'undefined' ? window : globalThis);
