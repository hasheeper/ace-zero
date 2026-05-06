const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PACK_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(PACK_ROOT, '../../../..');

const ACT_RUNTIME_FILES = [
  'act/data.js',
  'act/generated-data.js',
  'act/generated-runtime.js',
  'act/frontend-snapshot.js',
  'act/encounter-runtime.js',
  'act/narrative-runtime.js',
  'act/plugin.js'
];

const ASSET_RUNTIME_FILES = [
  'asset/data.js',
  'asset/runtime.js',
  'asset/summary.js'
];

const TAVERN_RUNTIME_FILES = [
  ...ASSET_RUNTIME_FILES,
  ...ACT_RUNTIME_FILES,
  'tavern/act-runtime.js'
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message || 'Values are not equal'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertDeepEqual(actual, expected, message) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message || 'Values are not deeply equal'}: expected ${expectedJson}, got ${actualJson}`);
  }
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function createSandbox() {
  const sandbox = {
    console,
    globalThis: null,
    window: undefined
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  return sandbox;
}

function runPackFile(sandbox, relativeFile) {
  const filename = path.join(PACK_ROOT, relativeFile);
  const source = fs.readFileSync(filename, 'utf8');
  vm.runInContext(source, sandbox, { filename: relativeFile });
}

function loadActSandbox(extraFiles = []) {
  const sandbox = createSandbox();
  [...ACT_RUNTIME_FILES, ...extraFiles].forEach((relativeFile) => runPackFile(sandbox, relativeFile));
  const act = sandbox.ACE0Modules && sandbox.ACE0Modules.act;
  assert(act && typeof act === 'object', 'ACT module should be installed into ACE0Modules.act');
  return { sandbox, act, packRoot: PACK_ROOT, repoRoot: REPO_ROOT };
}

function loadAssetSandbox(extraFiles = []) {
  const sandbox = createSandbox();
  [...ASSET_RUNTIME_FILES, ...extraFiles].forEach((relativeFile) => runPackFile(sandbox, relativeFile));
  const assetDeck = sandbox.ACE0Modules && sandbox.ACE0Modules.assetDeck;
  assert(assetDeck && typeof assetDeck === 'object', 'AssetDeck module should be installed into ACE0Modules.assetDeck');
  return { sandbox, assetDeck, packRoot: PACK_ROOT, repoRoot: REPO_ROOT };
}

function loadTavernSandbox() {
  const sandbox = createSandbox();
  TAVERN_RUNTIME_FILES.forEach((relativeFile) => runPackFile(sandbox, relativeFile));
  const act = sandbox.ACE0Modules && sandbox.ACE0Modules.act;
  const tavernFactory = sandbox.ACE0TavernActRuntime;
  assert(act && typeof act === 'object', 'ACT module should be installed before Tavern runtime smoke');
  assert(tavernFactory && typeof tavernFactory.create === 'function', 'Tavern ACT runtime factory should be available');
  return { sandbox, act, tavernFactory, packRoot: PACK_ROOT, repoRoot: REPO_ROOT };
}

function getChapterConfig(act) {
  const defaultAct = act.getDefaultActState();
  const config = act.getChapter(defaultAct.id);
  assert(config && typeof config === 'object', 'Default ACT chapter config should load');
  return config;
}

function createActStateAt(act, nodeIndex, routeHistory, overrides = {}) {
  return {
    ...act.getDefaultActState(),
    nodeIndex,
    route_history: routeHistory.slice(),
    stage: 'executing',
    resourceSpent: {
      combat: 10,
      rest: 10,
      asset: 10,
      vision: 10
    },
    ...clone(overrides)
  };
}

function createHero(overrides = {}) {
  return {
    funds: 9999,
    assets: 0,
    cast: {},
    roster: {},
    ...clone(overrides)
  };
}

function createContext(overrides = {}) {
  return {
    day: 9,
    geo: 'THE_EXCHANGE',
    layer: 'THE_EXCHANGE',
    locationLayer: 'THE_EXCHANGE',
    location: {
      layer: 'THE_EXCHANGE',
      site: 'casino_floor',
      tags: ['casino']
    },
    tags: ['casino', 'card_table'],
    flags: [],
    storyFlags: {},
    funds: 9999,
    crisis: 80,
    ...clone(overrides)
  };
}

function currentRouteToNode4A() {
  return ['node1-entry', 'node2-floor-high', 'node3-descent', 'node04-a-route'];
}

function currentRouteToNode5A() {
  return [...currentRouteToNode4A(), 'node05-a-route'];
}

function firstActiveQueueItem(actState, predicate = () => true) {
  const queue = actState.characterEncounter && Array.isArray(actState.characterEncounter.queue)
    ? actState.characterEncounter.queue
    : [];
  return queue.find((item) => !['triggered', 'expired', 'cancelled'].includes(item.status) && predicate(item));
}

function createTavernRuntime(tavernFactory, sandbox, hooks = {}) {
  let eraVarsRef = hooks.eraVars || {};
  const patches = [];
  const deepMerge = (target, patch) => {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return target;
    const next = { ...(target && typeof target === 'object' && !Array.isArray(target) ? target : {}) };
    Object.entries(patch).forEach(([key, value]) => {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        next[key] = deepMerge(next[key], value);
      } else {
        next[key] = value;
      }
    });
    return next;
  };

  const runtime = tavernFactory.create({
    deps: {
      getAce0HostRoot: () => sandbox,
      normalizeTrimmedString: (value, fallback = '') => {
        const normalized = typeof value === 'string' ? value.trim() : '';
        return normalized || fallback;
      },
      normalizeFundsAmount: (value) => {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
      },
      getEraVars: async () => eraVarsRef,
      updateEraVars: async (patch) => {
        patches.push(clone(patch));
        eraVarsRef = deepMerge(eraVarsRef, patch);
      },
      getWorldState: (eraVars) => eraVars && eraVars.world ? eraVars.world : {},
      getHeroState: (eraVars) => eraVars && eraVars.hero ? eraVars.hero : {},
      getHeroCast: (hero) => hero && hero.cast ? hero.cast : {},
      getCastNode: (hero, key) => hero && hero.cast && hero.cast[key] ? hero.cast[key] : {},
      getRosterNode: (hero, key) => hero && hero.roster && hero.roster[key] ? hero.roster[key] : {},
      getWorldLocation: (eraVars) => eraVars && eraVars.world && eraVars.world.location
        ? eraVars.world.location
        : { layer: 'THE_STREET', site: '', tags: [] }
    }
  });

  return {
    runtime,
    patches,
    getEraVars: () => eraVarsRef,
    setEraVars: (next) => {
      eraVarsRef = next;
    }
  };
}

module.exports = {
  PACK_ROOT,
  REPO_ROOT,
  assert,
  assertEqual,
  assertDeepEqual,
  clone,
  loadActSandbox,
  loadAssetSandbox,
  loadTavernSandbox,
  getChapterConfig,
  createActStateAt,
  createHero,
  createContext,
  currentRouteToNode4A,
  currentRouteToNode5A,
  firstActiveQueueItem,
  createTavernRuntime
};
