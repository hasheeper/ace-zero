(function initAce0OverviewMapView(global) {
    'use strict';

    const SVG_NS = 'http://www.w3.org/2000/svg';
    const SEGMENTS = 100;

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

    function getNodeCenter(id) {
        const el = global.document?.getElementById(id);
        if (!el) return { x: 0, y: 0 };
        return { x: Number.parseFloat(el.style.left), y: Number.parseFloat(el.style.top) };
    }

    function create(ctx = {}) {
        let active = true;
        let drawLoopRunning = false;
        let renderQueue = [];

        function getCanvas() {
            return typeof ctx.getCanvas === 'function' ? ctx.getCanvas() : null;
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
            const appState = ctx.appState || {};
            const presentNode = call(ctx, 'getCurrentNodeData')?.presentNode;
            if (conn.isJumpPath) return 'jump_path';
            if (call(ctx, 'isBossNodeId', conn.to) && appState.currentNodeIndex < call(ctx, 'getCampaignTotalNodes')) return 'danger_far';
            if (call(ctx, 'isFinaleNodeId', conn.to) && appState.currentNodeIndex < call(ctx, 'getCampaignTotalNodes')) return 'finale_far';
            if (conn.from === presentNode) return 'active_flow';
            if (call(ctx, 'isVisitedConnection', conn.from, conn.to)) return 'solid_path';
            return 'future';
        }

        function refresh() {
            call(ctx, 'updateMapUI');
            call(ctx, 'applyAutoMacroLayout');
            call(ctx, 'syncLayerSize');
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
            call(ctx, 'fitLayerToViewport');
            call(ctx, 'centerViewportOnCurrentFocus');
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
            ensureDrawLoop
        });
    }

    global.ACE0OverviewMapView = Object.freeze({ create });
})(typeof window !== 'undefined' ? window : globalThis);
