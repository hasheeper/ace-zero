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
    const MIN_CAMERA_SCALE = 0.2;
    const MAX_CAMERA_SCALE = 2.0;

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

    function setTextIfChanged(el, value) {
        if (!el || el.textContent === value) return false;
        el.textContent = value;
        return true;
    }

    function setClassNameIfChanged(el, value) {
        if (!el || el.className === value) return false;
        el.className = value;
        return true;
    }

    function setAttributeIfChanged(el, name, value) {
        if (!el || el.getAttribute(name) === value) return false;
        el.setAttribute(name, value);
        return true;
    }

    function setStylePxIfChanged(el, prop, value) {
        const nextValue = `${value}px`;
        if (!el || el.style[prop] === nextValue) return false;
        el.style[prop] = nextValue;
        return true;
    }

    function setDatasetValueIfChanged(el, name, value) {
        if (!el || el.dataset[name] === value) return false;
        el.dataset[name] = value;
        return true;
    }

    function removeAttributeIfPresent(el, name) {
        if (!el?.hasAttribute(name)) return false;
        el.removeAttribute(name);
        return true;
    }

    function getNodeElementParts(nodeEl) {
        if (nodeEl.__ace0MapParts) return nodeEl.__ace0MapParts;
        const parts = {
            labelEl: nodeEl.querySelector('.node-label'),
            sublabelEl: nodeEl.querySelector('.node-sublabel'),
            ringEl: nodeEl.querySelector('.astrolabe-ring')
        };
        nodeEl.__ace0MapParts = parts;
        return parts;
    }

    function getNodeCenter(id) {
        const el = global.document?.getElementById(id);
        if (!el) return { x: 0, y: 0 };
        return {
            x: parsePxPosition(el.style.left, 0),
            y: parsePxPosition(el.style.top, 0)
        };
    }

    function getNodeCenterFromCache(cache, id) {
        if (!cache.has(id)) cache.set(id, getNodeCenter(id));
        return cache.get(id);
    }

    function getCurveMetrics(start, end) {
        const dx = end.x - start.x;
        const cy = dx * 0.45;
        return {
            c1x: start.x + cy,
            c1y: start.y,
            c2x: end.x - cy,
            c2y: end.y
        };
    }

    function rememberGeometry(item, start, end) {
        const changed = (
            item.lastStartX !== start.x
            || item.lastStartY !== start.y
            || item.lastEndX !== end.x
            || item.lastEndY !== end.y
        );
        if (!changed) return false;
        item.lastStartX = start.x;
        item.lastStartY = start.y;
        item.lastEndX = end.x;
        item.lastEndY = end.y;
        item.staticPathD = '';
        item.segmentSamples = null;
        return true;
    }

    function getStaticPathD(item, start, end) {
        if (item.staticPathD) return item.staticPathD;
        if (item.isJumpPath) {
            item.staticPathD = `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
            return item.staticPathD;
        }
        const { c1x, c1y, c2x, c2y } = getCurveMetrics(start, end);
        item.staticPathD = `M ${start.x} ${start.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${end.x} ${end.y}`;
        return item.staticPathD;
    }

    function getSegmentSamples(item, start, end) {
        if (item.segmentSamples) return item.segmentSamples;
        const { c1x, c1y, c2x, c2y } = getCurveMetrics(start, end);
        item.segmentSamples = Array.from({ length: SEGMENTS }, (_, index) => {
            const t = (index + 1) / SEGMENTS;
            const mt = 1 - t;
            const pX = mt * mt * mt * start.x + 3 * mt * mt * t * c1x + 3 * mt * t * t * c2x + t * t * t * end.x;
            const pY = mt * mt * mt * start.y + 3 * mt * mt * t * c1y + 3 * mt * t * t * c2y + t * t * t * end.y;
            const dX = 3 * mt * mt * (c1x - start.x) + 6 * mt * t * (c2x - c1x) + 3 * t * t * (end.x - c2x);
            const dY = 3 * mt * mt * (c1y - start.y) + 6 * mt * t * (c2y - c1y) + 3 * t * t * (end.y - c2y);
            const len = Math.sqrt(dX * dX + dY * dY) || 1;
            return {
                t,
                pX,
                pY,
                nX: -dY / len,
                nY: dX / len,
                damping: Math.sin(t * Math.PI)
            };
        });
        return item.segmentSamples;
    }

    function create(ctx = {}) {
        const appData = ctx.appData || {};
        const appState = ctx.appState || {};
        const autoLayoutRules = { ...(appData.map?.layout || {}) };
        let active = true;
        let drawLoopRunning = false;
        let staticRenderQueue = [];
        let dynamicRenderQueue = [];
        let staticPathsDirty = true;
        let renderSignature = '';
        const nodeCenterCache = new Map();
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
        const activePointers = new Map();
        let activePointerDrag = null;
        let activePinch = null;
        let lastTransform = '';

        function invalidateNodeCenterCache() {
            nodeCenterCache.clear();
            staticPathsDirty = true;
        }

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
            const nextTransform = `translate(${panX}px, ${panY}px) scale(${scale})`;
            if (layer && lastTransform !== nextTransform) {
                lastTransform = nextTransform;
                layer.style.transform = nextTransform;
            }
        }

        function clampCameraScale(value) {
            return Math.max(MIN_CAMERA_SCALE, Math.min(MAX_CAMERA_SCALE, value));
        }

        function getViewportLocalPoint(clientX, clientY) {
            const viewport = getViewport();
            const rect = viewport?.getBoundingClientRect?.() || { left: 0, top: 0 };
            return {
                x: clientX - rect.left,
                y: clientY - rect.top
            };
        }

        function zoomAtPoint(point, nextScale) {
            const clampedScale = clampCameraScale(nextScale);
            if (!Number.isFinite(clampedScale) || clampedScale <= 0 || clampedScale === scale) return;
            const scaleRatio = clampedScale / scale;
            panX = point.x - (point.x - panX) * scaleRatio;
            panY = point.y - (point.y - panY) * scaleRatio;
            scale = clampedScale;
            updateTransform();
        }

        function getPointerDistance(a, b) {
            const dx = a.clientX - b.clientX;
            const dy = a.clientY - b.clientY;
            return Math.sqrt((dx * dx) + (dy * dy));
        }

        function getPointerCenter(a, b) {
            return getViewportLocalPoint(
                (a.clientX + b.clientX) / 2,
                (a.clientY + b.clientY) / 2
            );
        }

        function resetPointerGesture() {
            isDragging = false;
            activePointerDrag = null;
            activePinch = null;
            activePointers.clear();
        }

        function beginPointerDrag(pointer) {
            activePointerDrag = {
                pointerId: pointer.pointerId,
                startClientX: pointer.clientX,
                startClientY: pointer.clientY,
                startPanX: panX,
                startPanY: panY
            };
            activePinch = null;
            isDragging = true;
        }

        function beginPinchGesture() {
            const pointers = Array.from(activePointers.values());
            if (pointers.length < 2) return;
            const first = pointers[0];
            const second = pointers[1];
            const distance = getPointerDistance(first, second);
            if (!Number.isFinite(distance) || distance <= 0) return;
            const center = getPointerCenter(first, second);
            activePinch = {
                startDistance: distance,
                startScale: scale,
                contentX: (center.x - panX) / scale,
                contentY: (center.y - panY) / scale
            };
            activePointerDrag = null;
            isDragging = false;
        }

        function updatePinchGesture() {
            if (!activePinch || activePointers.size < 2) return;
            const pointers = Array.from(activePointers.values());
            const first = pointers[0];
            const second = pointers[1];
            const distance = getPointerDistance(first, second);
            if (!Number.isFinite(distance) || distance <= 0) return;
            const center = getPointerCenter(first, second);
            scale = clampCameraScale(activePinch.startScale * (distance / activePinch.startDistance));
            panX = center.x - (activePinch.contentX * scale);
            panY = center.y - (activePinch.contentY * scale);
            updateTransform();
        }

        function updatePointerDrag(pointer) {
            if (!activePointerDrag || activePointerDrag.pointerId !== pointer.pointerId) return;
            panX = activePointerDrag.startPanX + (pointer.clientX - activePointerDrag.startClientX);
            panY = activePointerDrag.startPanY + (pointer.clientY - activePointerDrag.startClientY);
            updateTransform();
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
            let layoutChanged = false;
            (call(ctx, 'getMapColumns') || []).forEach((column, columnIndex) => {
                const x = autoLayoutRules.startX + (autoLayoutRules.columnGap * columnIndex);
                const offsets = getRowOffsets(column.nodeIds.length);
                const gridLine = global.document?.getElementById(column.lineId);

                if (gridLine) {
                    setStylePxIfChanged(gridLine, 'left', x);
                }

                column.nodeIds.forEach((nodeId, nodeIndex) => {
                    const node = global.document?.getElementById(nodeId);
                    if (!node) return;
                    const micro = getMicroLayoutOffset(column.nodeIds.length, columnIndex, nodeIndex);
                    const baseOffset = offsets[nodeIndex] || 0;
                    const laneOffset = getLaneAnchorValue(nodeId, column.nodeIds.length);
                    const y = autoLayoutRules.centerY + (baseOffset * 0.45) + (laneOffset * 0.65) + micro.dy;
                    layoutChanged = setStylePxIfChanged(node, 'left', x + micro.dx) || layoutChanged;
                    layoutChanged = setStylePxIfChanged(node, 'top', y) || layoutChanged;
                });
            });
            if (layoutChanged) invalidateNodeCenterCache();
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
            const maxIndex = currentIndex + Math.max(0, Math.round(Number(call(ctx, 'getVisionSightValue')) || 0)) + 1;
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
            setStylePxIfChanged(layer, 'width', layerWidth);
            setStylePxIfChanged(layer, 'height', layerHeight);
            setAttributeIfChanged(canvas, 'viewBox', `0 0 ${layerWidth} ${layerHeight}`);

            (call(ctx, 'getMapColumns') || []).forEach((column) => {
                const line = global.document?.getElementById(column.lineId);
                if (!line) return;
                const bounds = getColumnLineBounds(column, layerHeight, gridTop, gridBottom);
                const lineLeft = column.nodeIds.includes(currentNodeData.presentNode) && Number.isFinite(presentNodeX)
                    ? presentNodeX
                    : parsePxPosition(line.style.left, 0);
                setStylePxIfChanged(line, 'left', lineLeft);
                setStylePxIfChanged(line, 'top', bounds.top);
                setStylePxIfChanged(line, 'height', Math.max(40, bounds.bottom - bounds.top));
            });

            const mapLayerMeta = getMapLayerMeta();
            if (mapLayerMeta) {
                const currentNodeTemplate = call(ctx, 'getCurrentNodeTemplate');
                const currentNodeDebugLabel = call(ctx, 'getNodeDebugLabel', currentNodeTemplate);
                let metaText = call(ctx, 'shouldShowMapProgressMeta')
                    ? (
                        call(ctx, 'isRouteSelectionActive')
                            ? `MACRO THREAT MAP · NODE ${String(appState.currentNodeIndex + 1).padStart(2, '0')}`
                            : call(ctx, 'isPlanningPhase')
                                ? `MACRO THREAT MAP · NODE ${String(appState.currentNodeIndex).padStart(2, '0')}`
                                : `MACRO THREAT MAP · NODE ${String(appState.currentNodeIndex).padStart(2, '0')} · SEG ${Math.min(appState.currentPhaseIndex + 1, appData.planner?.phases?.length || 0)}/${appData.planner?.phases?.length || 0}`
                    )
                    : `MACRO THREAT MAP · NODE ${String(appState.currentNodeIndex).padStart(2, '0')}`;
                if (currentNodeDebugLabel) {
                    metaText += ` · ${currentNodeDebugLabel}`;
                }
                setTextIfChanged(mapLayerMeta, metaText);
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
            scale = Math.max(0.32, clampCameraScale(fittedScale));
        }

        function getControlledNodesFromActState(actState) {
            const controlledNodes = actState?.controlledNodes && typeof actState.controlledNodes === 'object'
                ? actState.controlledNodes
                : {};
            return controlledNodes;
        }

        function buildMapRenderContext() {
            const currentNodeData = call(ctx, 'getCurrentNodeData') || {};
            const routeSelectionActive = call(ctx, 'isRouteSelectionActive');
            return {
                currentNodeData,
                pathNodeIds: Array.isArray(currentNodeData.pathNodes) && currentNodeData.pathNodes.length
                    ? currentNodeData.pathNodes
                    : appState.routeHistory,
                routeOptionIds: routeSelectionActive ? (call(ctx, 'getRouteOptions') || []) : [],
                isJumpRouteMode: appData.runtime?.frontendSnapshot?.routeMode === 'jump',
                controlledNodes: getControlledNodesFromActState(call(ctx, 'buildCurrentActStateSnapshot') || {})
            };
        }

        function getControlledNodeEntry(nodeId, renderContext) {
            const controlledNodes = renderContext?.controlledNodes || getControlledNodesFromActState(call(ctx, 'buildCurrentActStateSnapshot') || {});
            const entry = controlledNodes[nodeId];
            return entry && typeof entry === 'object' ? entry : null;
        }

        function getOriginalNodeTypeClass(node) {
            const rawTypeClass = node.classes.find((className) => className.startsWith('type-'));
            const originalType = call(ctx, 'normalizeResourceKey', rawTypeClass ? rawTypeClass.replace('type-', '') : '', 'vision');
            return `type-${originalType}`;
        }

        function getDisplayTypeKeyForMapNode(node, renderContext) {
            const controlledEntry = getControlledNodeEntry(node.id, renderContext);
            const controlType = call(ctx, 'normalizeRestTintKey', controlledEntry?.type, '');
            if (controlType) return controlType;
            return getOriginalNodeTypeClass(node).replace('type-', '');
        }

        function getMapClassNameForNode(node, renderContext = null) {
            const mapRenderContext = renderContext || buildMapRenderContext();
            const isBranchNode = node.classes.includes('node-branch');
            const hasFixedPhase = node.classes.includes('node-has-fixed-phase');
            const classList = ['az-node'];
            const currentNodeData = mapRenderContext.currentNodeData || {};
            const isBossNode = call(ctx, 'isBossNodeId', node.id);
            const isFinaleNode = call(ctx, 'isFinaleNodeId', node.id);
            const controlledEntry = getControlledNodeEntry(node.id, mapRenderContext);
            const controlType = call(ctx, 'normalizeRestTintKey', controlledEntry?.type, '');
            const detailVisible = call(ctx, 'isNodeDetailVisible', node.id);
            const positionPreviewVisible = detailVisible || call(ctx, 'isNodePositionPreviewVisible', node.id);
            const displayTypeClass = detailVisible ? `type-${getDisplayTypeKeyForMapNode(node, mapRenderContext)}` : '';
            const pathNodeIds = mapRenderContext.pathNodeIds;
            const routeOptionIds = mapRenderContext.routeOptionIds;
            const isRouteChoiceNode = routeOptionIds.includes(node.id);
            const isJumpRouteChoice = isRouteChoiceNode && mapRenderContext.isJumpRouteMode;
            const encounterMarkers = detailVisible ? (call(ctx, 'getEncounterMarkersForNode', node.id) || []) : [];

            if (!detailVisible) {
                classList.push('node-future', 'node-position-preview');
            } else if (node.id === currentNodeData.presentNode) {
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

            if (isBranchNode && detailVisible) classList.push('node-branch');
            if (hasFixedPhase && detailVisible) classList.push('node-has-fixed-phase');
            if (displayTypeClass) classList.push(displayTypeClass);
            if (node.id !== currentNodeData.presentNode && !(pathNodeIds || []).includes(node.id) && !(currentNodeData.deadNodes || []).includes(node.id)) {
                classList.push(call(ctx, 'isNodeInVisionRange', node.id) ? 'node-visible' : 'node-obscured');
            }
            if (!detailVisible) classList.push('node-intel-hidden');
            if (!positionPreviewVisible) classList.push('node-fog-hidden');
            if (call(ctx, 'isNodeTemporarilyRevealedByIntel', node.id)) classList.push('node-intel-revealed');
            if (controlledEntry && detailVisible) {
                classList.push('node-controlled', `control-${controlType || 'neutral'}`);
            }
            if (encounterMarkers.length) {
                classList.push('node-encounter');
            }
            return classList.join(' ');
        }

        function updateMapUI() {
            const mapRenderContext = buildMapRenderContext();
            (call(ctx, 'getMapColumns') || []).forEach((column) => {
                const lineEl = global.document?.getElementById(column.lineId);
                if (!lineEl) return;
                setClassNameIfChanged(
                    lineEl,
                    `grid-base-line ${call(ctx, 'getCurrentColumnLineClass', column)}${call(ctx, 'isColumnVisibleInMapFog', column) ? '' : ' grid-line-fog-hidden'}`
                );
            });

            (call(ctx, 'getMapNodes') || []).forEach((node) => {
                const nodeEl = global.document?.getElementById(node.id);
                if (!nodeEl) return;
                setClassNameIfChanged(nodeEl, getMapClassNameForNode(node, mapRenderContext));
                const { labelEl, sublabelEl, ringEl } = getNodeElementParts(nodeEl);
                const detailVisible = call(ctx, 'isNodeDetailVisible', node.id);
                setTextIfChanged(labelEl, detailVisible ? node.label : '');
                setTextIfChanged(sublabelEl, detailVisible ? node.sublabel : '');
                setDatasetValueIfChanged(nodeEl, 'displayType', detailVisible ? getDisplayTypeKeyForMapNode(node, mapRenderContext) : 'unknown');
                const controlledEntry = getControlledNodeEntry(node.id, mapRenderContext);
                const controlType = call(ctx, 'normalizeRestTintKey', controlledEntry?.type, '');
                const encounterMarkup = detailVisible ? call(ctx, 'buildEncounterBadgeMarkup', node.id) : '';
                const encounterEl = ringEl?.querySelector('.encounter-badge');
                if (ringEl) {
                    if (encounterMarkup) {
                        if (encounterEl) {
                            if (encounterEl.outerHTML !== encounterMarkup) encounterEl.outerHTML = encounterMarkup;
                        } else {
                            ringEl.insertAdjacentHTML('afterbegin', encounterMarkup);
                        }
                    } else if (encounterEl) {
                        encounterEl.remove();
                    }
                }
                const encounterMarker = detailVisible ? (call(ctx, 'getEncounterMarkersForNode', node.id) || [])[0] || null : null;
                if (encounterMarker) {
                    setDatasetValueIfChanged(nodeEl, 'encounterChar', encounterMarker.charKey);
                } else {
                    removeAttributeIfPresent(nodeEl, 'data-encounter-char');
                }
                if (controlType) {
                    setDatasetValueIfChanged(nodeEl, 'controlType', controlType);
                } else {
                    removeAttributeIfPresent(nodeEl, 'data-control-type');
                }
            });
            setFocusNodeId(mapRenderContext.currentNodeData?.mapFocus || currentFocusNodeId);
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
                if (canvas.childNodes.length) canvas.replaceChildren();
                staticRenderQueue = [];
                dynamicRenderQueue = [];
                renderSignature = '';
                staticPathsDirty = true;
                return;
            }
            const renderEntries = renderedTopology.map((conn) => {
                const type = getConnectionTypeForCurrentNode(conn);
                const layers = THEMES[type] || THEMES.future;
                const laneClass = getConnectionLaneKey(conn);
                return { conn, type, layers, laneClass };
            });
            const nextRenderSignature = renderEntries
                .map((entry) => `${entry.conn.from}>${entry.conn.to}:${entry.conn.isJumpPath ? 'jump' : 'path'}:${entry.type}:${entry.laneClass}:${entry.layers.map((cfg) => cfg.class).join(',')}`)
                .join('|');
            const nextPathCount = renderEntries.reduce((count, entry) => count + entry.layers.length, 0);

            if (renderSignature === nextRenderSignature && canvas.childNodes.length === nextPathCount) {
                return;
            }

            canvas.replaceChildren();
            staticRenderQueue = [];
            dynamicRenderQueue = [];
            const fragment = global.document.createDocumentFragment();
            renderEntries.forEach(({ conn, laneClass, layers }) => {
                layers.forEach((cfg) => {
                    const pathEl = global.document.createElementNS(SVG_NS, 'path');
                    pathEl.setAttribute('class', `magic-thread ${cfg.class} ${laneClass}`);
                    fragment.appendChild(pathEl);
                    const item = { pathEl, fromId: conn.from, toId: conn.to, laneClass, isJumpPath: conn.isJumpPath === true, ...cfg };
                    if (item.isStatic || item.isJumpPath) {
                        staticRenderQueue.push(item);
                    } else {
                        dynamicRenderQueue.push(item);
                    }
                });
            });
            canvas.appendChild(fragment);
            renderSignature = nextRenderSignature;
            staticPathsDirty = true;
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
            renderSignature = '';
            invalidateNodeCenterCache();
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
                if (!active) return;
                syncViewportSize();
                applyAutoMacroLayout();
                syncLayerSize();
                fitLayerToViewport();
                centerViewportOnCurrentFocus();
            });

            const viewport = getViewport();
            if (viewport) {
                if (global.PointerEvent) {
                    viewport.addEventListener('pointerdown', (event) => {
                        if (event.button != null && event.button !== 0) return;
                        if (event.target.closest('.az-node')) return;
                        event.preventDefault();
                        activePointers.set(event.pointerId, {
                            pointerId: event.pointerId,
                            clientX: event.clientX,
                            clientY: event.clientY
                        });
                        try { viewport.setPointerCapture(event.pointerId); } catch (_) {}
                        if (activePointers.size >= 2) beginPinchGesture();
                        else beginPointerDrag(activePointers.get(event.pointerId));
                    }, { passive: false });

                    viewport.addEventListener('pointermove', (event) => {
                        if (!activePointers.has(event.pointerId)) return;
                        event.preventDefault();
                        activePointers.set(event.pointerId, {
                            pointerId: event.pointerId,
                            clientX: event.clientX,
                            clientY: event.clientY
                        });
                        if (activePointers.size >= 2) {
                            updatePinchGesture();
                            return;
                        }
                        updatePointerDrag(activePointers.get(event.pointerId));
                    }, { passive: false });

                    const finishPointer = (event) => {
                        if (!activePointers.has(event.pointerId)) return;
                        activePointers.delete(event.pointerId);
                        try { viewport.releasePointerCapture(event.pointerId); } catch (_) {}
                        if (activePointers.size >= 2) {
                            beginPinchGesture();
                            return;
                        }
                        if (activePointers.size === 1) {
                            beginPointerDrag(Array.from(activePointers.values())[0]);
                            return;
                        }
                        resetPointerGesture();
                    };

                    viewport.addEventListener('pointerup', finishPointer);
                    viewport.addEventListener('pointercancel', finishPointer);
                    viewport.addEventListener('pointerleave', finishPointer);
                } else {
                    viewport.addEventListener('mousedown', (event) => {
                        if (event.target.closest('.az-node')) return;
                        isDragging = true;
                        startMouseX = event.clientX - panX;
                        startMouseY = event.clientY - panY;
                    });

                    const syncTouches = (event) => {
                        activePointers.clear();
                        Array.from(event.touches || []).forEach((touch) => {
                            activePointers.set(touch.identifier, {
                                pointerId: touch.identifier,
                                clientX: touch.clientX,
                                clientY: touch.clientY
                            });
                        });
                    };

                    viewport.addEventListener('touchstart', (event) => {
                        if ((event.touches || []).length === 1 && event.target.closest('.az-node')) return;
                        event.preventDefault();
                        syncTouches(event);
                        if (activePointers.size >= 2) beginPinchGesture();
                        else if (activePointers.size === 1) beginPointerDrag(Array.from(activePointers.values())[0]);
                    }, { passive: false });

                    viewport.addEventListener('touchmove', (event) => {
                        if (!activePointers.size) return;
                        event.preventDefault();
                        syncTouches(event);
                        if (activePointers.size >= 2) {
                            updatePinchGesture();
                            return;
                        }
                        if (activePointers.size === 1) updatePointerDrag(Array.from(activePointers.values())[0]);
                    }, { passive: false });

                    const finishTouch = (event) => {
                        if (!activePointers.size) return;
                        event.preventDefault();
                        syncTouches(event);
                        if (activePointers.size >= 2) {
                            beginPinchGesture();
                            return;
                        }
                        if (activePointers.size === 1) {
                            beginPointerDrag(Array.from(activePointers.values())[0]);
                            return;
                        }
                        resetPointerGesture();
                    };

                    viewport.addEventListener('touchend', finishTouch, { passive: false });
                    viewport.addEventListener('touchcancel', finishTouch, { passive: false });
                }

                viewport.addEventListener('wheel', (event) => {
                    event.preventDefault();
                    const zoomFactor = -event.deltaY * 0.001;
                    zoomAtPoint(getViewportLocalPoint(event.clientX, event.clientY), scale * Math.exp(zoomFactor));
                }, { passive: false });
            }

            global.addEventListener('mouseup', () => { isDragging = false; });
            global.addEventListener('mousemove', (event) => {
                if (global.PointerEvent) return;
                if (!isDragging) return;
                panX = event.clientX - startMouseX;
                panY = event.clientY - startMouseY;
                updateTransform();
            });
            global.document?.addEventListener('visibilitychange', () => {
                if (!global.document.hidden) {
                    drawLoopRunning = false;
                    ensureDrawLoop();
                }
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
            else resetPointerGesture();
        }

        function ensureDrawLoop() {
            if (!active || drawLoopRunning || global.document?.hidden) return;
            drawLoopRunning = true;
            global.requestAnimationFrame(draw);
        }

        function draw() {
            if (!active || global.document?.hidden) {
                drawLoopRunning = false;
                return;
            }
            const time = global.performance?.now ? global.performance.now() : Date.now();

            if (staticPathsDirty) {
                staticRenderQueue.forEach((item) => {
                    const start = getNodeCenterFromCache(nodeCenterCache, item.fromId);
                    const end = getNodeCenterFromCache(nodeCenterCache, item.toId);
                    const geometryChanged = rememberGeometry(item, start, end);
                    const pathD = getStaticPathD(item, start, end);
                    if (geometryChanged || item.renderedPathD !== pathD) {
                        item.renderedPathD = pathD;
                        item.pathEl.setAttribute('d', pathD);
                    }
                });
                staticPathsDirty = false;
            }

            dynamicRenderQueue.forEach((item) => {
                const start = getNodeCenterFromCache(nodeCenterCache, item.fromId);
                const end = getNodeCenterFromCache(nodeCenterCache, item.toId);
                rememberGeometry(item, start, end);

                let d = `M ${start.x} ${start.y} `;
                const samples = getSegmentSamples(item, start, end);
                for (let i = 0; i < samples.length; i += 1) {
                    const sample = samples[i];
                    const wave = Math.sin((sample.t * Math.PI * item.freq) + (time * item.speed) + item.phaseOffset);
                    const offset = item.mathAmp * sample.damping * wave;
                    d += `L ${sample.pX + sample.nX * offset} ${sample.pY + sample.nY * offset} `;
                }
                item.pathEl.setAttribute('d', d);
            });

            if (dynamicRenderQueue.length) {
                global.requestAnimationFrame(draw);
            } else {
                drawLoopRunning = false;
            }
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
