#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '../../../../..');
const dashboardIndexPath = path.join(repoRoot, 'apps/dashboard/index.html');

const expectedOverviewScripts = [
    './pages/overview/config/debug.js',
    './pages/overview/config/tavern.js',
    './pages/overview/core/boot.js',
    './pages/overview/core/state.js',
    './pages/overview/adapters/dashboard-adapter.js',
    './pages/overview/adapters/asset-adapter.js',
    './pages/overview/runtime/campaign-runtime.js',
    './pages/overview/runtime/planner-runtime.js',
    './pages/overview/runtime/execution-runtime.js',
    './pages/overview/views/map-view.js',
    './pages/overview/views/shell-view.js',
    './pages/overview/views/intel-panel.js',
    './pages/overview/views/planner-view.js',
    './pages/overview/controllers/planner-controller.js',
    './pages/overview/controllers/debug-controller.js',
    './pages/overview/controllers/execution-controller.js',
    './pages/overview/index.js'
];

function createMemoryStorage() {
    const values = new Map();
    return {
        getItem(key) {
            return values.has(String(key)) ? values.get(String(key)) : null;
        },
        setItem(key, value) {
            values.set(String(key), String(value));
        },
        removeItem(key) {
            values.delete(String(key));
        },
        clear() {
            values.clear();
        }
    };
}

function createSandbox() {
    const sandbox = {
        console,
        URL,
        URLSearchParams,
        setTimeout,
        clearTimeout,
        location: { search: '' },
        localStorage: createMemoryStorage(),
        document: {
            body: {
                classList: {
                    add() {},
                    remove() {},
                    toggle() {}
                }
            },
            addEventListener() {},
            getElementById() { return null; },
            querySelector() { return null; },
            querySelectorAll() { return []; }
        }
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    sandbox.self = sandbox;
    sandbox.parent = sandbox;
    sandbox.top = sandbox;
    return vm.createContext(sandbox);
}

function readDashboardOverviewScripts() {
    const html = fs.readFileSync(dashboardIndexPath, 'utf8');
    return Array.from(html.matchAll(/<script\s+src="([^"]+)"><\/script>/g))
        .map((match) => match[1])
        .filter((src) => src.startsWith('./pages/overview/'));
}

function readDashboardSource(scriptSource) {
    const relativePath = scriptSource.replace(/^\.\//, 'apps/dashboard/');
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function assertFunction(value, label) {
    assert.equal(typeof value, 'function', `${label} must be a function`);
}

function assertGlobalObject(sandbox, globalName) {
    const value = sandbox[globalName];
    assert(value && typeof value === 'object', `${globalName} must be installed`);
    return value;
}

function assertCreateModule(sandbox, globalName, expectedMethods = []) {
    const moduleApi = assertGlobalObject(sandbox, globalName);
    assertFunction(moduleApi.create, `${globalName}.create`);
    const instance = moduleApi.create({});
    assert(instance && typeof instance === 'object', `${globalName}.create() must return an API object`);
    expectedMethods.forEach((methodName) => {
        assertFunction(instance[methodName], `${globalName}.create().${methodName}`);
    });
}

function runClassicScript(sandbox, scriptSource) {
    const relativePath = scriptSource.replace(/^\.\//, 'apps/dashboard/');
    const absolutePath = path.join(repoRoot, relativePath);
    const code = fs.readFileSync(absolutePath, 'utf8');
    vm.runInContext(code, sandbox, { filename: absolutePath });
}

const actualOverviewScripts = readDashboardOverviewScripts();
assert.deepEqual(
    actualOverviewScripts,
    expectedOverviewScripts,
    'apps/dashboard/index.html overview script load order changed'
);
assert(!actualOverviewScripts.includes('./pages/overview/runtime/legacy-generator.js'), 'legacy generator must stay out of the page load chain');

[
    ...expectedOverviewScripts,
    './shell/shell.js'
].forEach((scriptSource) => {
    const source = readDashboardSource(scriptSource);
    [
        'pendingAssetDeckCommands',
        'active_general_cards',
        'active_void_cards',
        'general_slots_unlocked',
        'void_slots_unlocked',
        'pending_offer',
        'pending_offer_queue',
        'pending_replace',
        'instanceId',
        'addedAt',
        'grant_asset',
        'replace_card'
    ].forEach((token) => {
        assert(!source.includes(token), `${scriptSource} must not use legacy AssetDeck field ${token}`);
    });
});

const sandbox = createSandbox();
expectedOverviewScripts
    .filter((scriptSource) => scriptSource !== './pages/overview/index.js')
    .forEach((scriptSource) => runClassicScript(sandbox, scriptSource));

const coreApi = assertGlobalObject(sandbox, 'ACE0OverviewCore');
assertFunction(coreApi.detectInitialOverviewMode, 'ACE0OverviewCore.detectInitialOverviewMode');

const stateApi = assertGlobalObject(sandbox, 'ACE0OverviewState');
assertFunction(stateApi.create, 'ACE0OverviewState.create');
const state = stateApi.create(coreApi);
assert(state && typeof state === 'object', 'ACE0OverviewState.create() must return state');
assert(state.appData && typeof state.appData === 'object', 'overview state must expose appData');
assert(state.appState && typeof state.appState === 'object', 'overview state must expose appState');
assert(state.constants && typeof state.constants === 'object', 'overview state must expose constants');
assert(Array.isArray(state.constants.PLANNER_PAGE_KEYS), 'overview constants must expose PLANNER_PAGE_KEYS');

[
    ['ACE0OverviewDashboardAdapter', ['ensureDashboardAdapter', 'switchDashboardAdapter']],
    ['ACE0OverviewAssetAdapter', ['getCurrentAssetDeckSummary', 'handleAssetDeckAction']],
    ['ACE0OverviewMapView', ['rebuild', 'refresh', 'start']],
    ['ACE0OverviewShellView', ['renderTopbar', 'renderSidebar', 'renderMapLayer']],
    ['ACE0OverviewIntelPanel', ['escapePartyHtml', 'renderIntelPanel']],
    ['ACE0OverviewPlannerView', ['renderPlannerDrawer', 'renderPhaseBar', 'syncPlannerDrawerDOM']],
    ['ACE0OverviewPlannerController', ['selectInventoryToken', 'placeInventorySelection']],
    ['ACE0OverviewDebugController', ['getDebugChapterTransitionOption', 'handleDebugActAction']],
    ['ACE0OverviewExecutionController', ['executeCurrentNode', 'bindPlannerEvents']]
].forEach(([globalName, expectedMethods]) => {
    assertCreateModule(sandbox, globalName, expectedMethods);
});

[
    ['ACE0OverviewCampaignRuntime', ['getMapNodes', 'getCurrentNodeData', 'getRouteOptions']],
    ['ACE0OverviewPlannerRuntime', ['getPreferredSourceForKey', 'canEditPhaseSlot', 'startNode']],
    ['ACE0OverviewExecutionRuntime', ['executeCurrentNode', 'chooseNextRoute', 'advanceSinglePhase']]
].forEach(([globalName, expectedMethods]) => {
    const moduleApi = assertGlobalObject(sandbox, globalName);
    expectedMethods.forEach((methodName) => {
        assertFunction(moduleApi[methodName], `${globalName}.${methodName}`);
    });
});

console.log('[overview-boundaries] OK: load order and classic global APIs validated.');
