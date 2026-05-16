#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {
  PACK_ROOT,
  assert,
  assertEqual,
  createActStateAt,
  createHero
} = require('./smoke-utils');

function runPackFile(sandbox, relativeFile) {
  const filename = path.join(PACK_ROOT, relativeFile);
  const source = fs.readFileSync(filename, 'utf8');
  vm.runInContext(source, sandbox, { filename: relativeFile });
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function applyJsonPointer(root, pointer, value) {
  const parts = String(pointer || '').split('/').slice(1).map(part => part.replace(/~1/g, '/').replace(/~0/g, '~'));
  let current = root;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i];
    if (!current[part] || typeof current[part] !== 'object') current[part] = {};
    current = current[part];
  }
  current[parts[parts.length - 1]] = clone(value);
}

function removeJsonPointer(root, pointer) {
  const parts = String(pointer || '').split('/').slice(1).map(part => part.replace(/~1/g, '/').replace(/~0/g, '~'));
  let current = root;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i];
    if (!current || typeof current !== 'object') return;
    current = current[part];
  }
  if (current && typeof current === 'object') {
    delete current[parts[parts.length - 1]];
  }
}

function applyReplayBlocksToVars(message, vars) {
  const text = typeof message === 'string' ? message : '';
  const regex = /<JSONPatch>\s*([\s\S]*?)\s*<\/JSONPatch>/gi;
  let match;
  while ((match = regex.exec(text))) {
    const patches = JSON.parse(match[1].trim());
    patches.forEach((patch) => {
      if (!patch) return;
      if (patch.op === 'replace' || patch.op === 'add') {
        applyJsonPointer(vars.stat_data, patch.path, patch.value);
      } else if (patch.op === 'remove') {
        removeJsonPointer(vars.stat_data, patch.path);
      }
    });
  }
}

function makePluginSandbox() {
  const handlers = {};
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    CustomEvent: function CustomEvent(type) { this.type = type; },
    window: null,
    globalThis: null,
    parent: null,
    top: null,
    __handlers: handlers,
    __messages: {},
    __messageVars: {},
    __currentMessageId: 0
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.parent = sandbox;
  sandbox.top = sandbox;
  sandbox.addEventListener = () => {};
  sandbox.removeEventListener = () => {};
  sandbox.dispatchEvent = () => {};
  sandbox.eventOn = (name, handler) => {
    handlers[name] = handler;
    return () => {};
  };
  sandbox.getContext = () => ({ chat: [] });
  sandbox.injectPrompts = () => {};
  sandbox.uninjectPrompts = () => {};
  sandbox.getCurrentMessageId = () => sandbox.__currentMessageId;
  sandbox.getChatMessages = (id) => {
    const targetId = Number(id) === -1 ? sandbox.__currentMessageId : Number(id);
    const msg = sandbox.__messages[targetId];
    return msg ? [msg] : [];
  };
  sandbox.setChatMessages = async (messages) => {
    messages.forEach((message) => {
      sandbox.__messages[message.message_id] = {
        ...(sandbox.__messages[message.message_id] || { role: 'assistant' }),
        ...message
      };
    });
  };
  sandbox.getLastMessageId = () => sandbox.__currentMessageId;
  sandbox.createChatMessages = async () => {};
  sandbox.getVariables = async (options = {}) => {
    const id = Number.isFinite(Number(options.message_id)) ? Math.round(Number(options.message_id)) : sandbox.__currentMessageId;
    return sandbox.__messageVars[id];
  };
  sandbox.insertOrAssignVariables = async () => {
    throw new Error('direct insertOrAssignVariables should not be used in replay smoke');
  };
  sandbox.updateVariablesWith = async () => {
    throw new Error('direct updateVariablesWith should not be used in replay smoke');
  };
  sandbox.handleVariablesInMessage = async (messageId) => {
    const vars = sandbox.__messageVars[messageId];
    const msg = sandbox.__messages[messageId];
    if (!vars || !vars.stat_data || !msg) return false;
    applyReplayBlocksToVars(msg.message, vars);
    return true;
  };
  vm.createContext(sandbox);
  [
    'asset/data.js',
    'asset/runtime.js',
    'asset/summary.js',
    'act/data.js',
    'act/generated-data.js',
    'act/generated-runtime.js',
    'act/frontend-snapshot.js',
    'act/encounter-runtime.js',
    'act/narrative-runtime.js',
    'act/plugin.js',
    'tavern/npc-data.js',
    'tavern/character-runtime.js',
    'tavern/context.js',
    'tavern/battle-runtime.js',
    'tavern/result.js',
    'tavern/act-runtime.js',
    'tavern/plugin.js'
  ].forEach((relativeFile) => runPackFile(sandbox, relativeFile));
  return sandbox;
}

async function testMissingBaseDoesNotCreateDefaultAct() {
  const sandbox = makePluginSandbox();
  sandbox.__currentMessageId = 24;
  sandbox.__messages[24] = {
    message_id: 24,
    role: 'assistant',
    message: 'old floor without MVU base'
  };
  sandbox.__messageVars[24] = {};

  await sandbox.__handlers.character_message_rendered(24);

  assert(!sandbox.__messages[24].message.includes('ACE0_REPLAY'), 'missing MVU base should not append ACE0_REPLAY');
  assert(!sandbox.__messageVars[24].stat_data, 'missing MVU base should not synthesize stat_data');
}

async function testPhaseAdvanceWritesReplayAndReplaysActAdvance() {
  const sandbox = makePluginSandbox();
  const act = sandbox.ACE0Modules.act;
  const assetDeck = sandbox.ACE0Modules.assetDeck;
  sandbox.__currentMessageId = 50;
  const initialAct = createActStateAt(act, 1, ['node1-entry'], {
    stage: 'executing',
    phase_index: 1,
    phase_advance: 1,
    phase_slots: [null, null, null, null],
    pendingResolutions: []
  });
  sandbox.__messages[50] = {
    message_id: 50,
    role: 'assistant',
    message: [
      'phase advance smoke',
      '<StatusPlaceHolderImpl/>'
    ].join('\n')
  };
  sandbox.__messageVars[50] = {
    initialized_lorebooks: {},
    stat_data: {
      hero: createHero({
        funds: 100,
        roster: {
          KAZU: { level: 3, mana: 0, maxMana: 0 }
        }
      }),
      world: {
        current_time: { day: 1, phase: 'MORNING' },
        clockPressure: 0,
        location: { layer: 'THE_EXCHANGE', site: 'smoke' },
        tags: [],
        flags: [],
        storyFlags: {},
        expansion_state: { activeMajor: '', activeLight: [] },
        assetDeck: assetDeck.makeDefaultAssetDeckState(),
        act: initialAct
      }
    },
    schema: 'smoke'
  };

  await sandbox.__handlers.character_message_rendered(50);

  const message = sandbox.__messages[50].message;
  assert(message.includes('ACE0_REPLAY:render:50:state'), 'phase advance should append one deterministic render replay block');
  assert(!message.includes('ACE0_REPLAY:render:50:act-result'), 'phase advance should not append legacy act-result replay block');
  assert(!message.includes('ACE0_REPLAY:render:50:floor-progress'), 'phase advance floors should not also append floor-progress replay');
  assert(message.indexOf('ACE0_REPLAY:render:50:state') < message.indexOf('<StatusPlaceHolderImpl/>'), 'replay should be inserted before status placeholder');
  assert(!message.includes('"path": "/world/act",'), 'act-result replay should not replace the whole ACT subtree');
  assert(message.includes('"path": "/world/act/phase_advance"'), 'act-result replay should include the consumed phase_advance leaf');

  const replayedAct = sandbox.__messageVars[50].stat_data.world.act;
  assertEqual(replayedAct.phase_advance, 0, 'replayed ACT should consume phase_advance');
  assertEqual(replayedAct.phase_index, 2, 'replayed ACT should advance to the next phase');
  assert(Array.isArray(replayedAct.route_history) && replayedAct.route_history[0] === 'node1-entry', 'replayed ACT should preserve route history');
}

async function testFloorProgressWritesOnlyLeafPatches() {
  const sandbox = makePluginSandbox();
  const act = sandbox.ACE0Modules.act;
  const assetDeck = sandbox.ACE0Modules.assetDeck;
  sandbox.__currentMessageId = 12;
  sandbox.__messages[12] = {
    message_id: 12,
    role: 'assistant',
    message: 'ordinary assistant floor\n<StatusPlaceHolderImpl/>'
  };
  sandbox.__messageVars[12] = {
    initialized_lorebooks: {},
    stat_data: {
      hero: createHero(),
      world: {
        current_time: { day: 1, phase: 'MORNING' },
        clockPressure: 5,
        location: { layer: 'THE_EXCHANGE', site: 'smoke' },
        tags: [],
        flags: [],
        storyFlags: {},
        expansion_state: { activeMajor: '', activeLight: [] },
        assetDeck: assetDeck.makeDefaultAssetDeckState(),
        act: createActStateAt(act, 1, ['node1-entry'], {
          stage: 'executing',
          phase_index: 0,
          phase_advance: 0,
          narrativeTension: 0
        })
      }
    },
    schema: 'smoke'
  };

  await sandbox.__handlers.character_message_rendered(12);

  const message = sandbox.__messages[12].message;
  assert(message.includes('ACE0_REPLAY:render:12:state'), 'floor progress should append one render replay block');
  assert(!message.includes('ACE0_REPLAY:render:12:floor-progress'), 'floor progress should not append legacy floor-progress replay block');
  assert(!message.includes('"path": "/world/act",'), 'floor progress should not replace the whole ACT subtree');
  assert(message.includes('"path": "/world/act/narrativeTension"'), 'floor progress should write only narrative tension leaf');
  assert(message.includes('"path": "/world/clockPressure"'), 'floor progress should write clock pressure leaf');
  assertEqual(sandbox.__messageVars[12].stat_data.world.act.narrativeTension, 10, 'floor progress should replay narrative tension');
  assertEqual(sandbox.__messageVars[12].stat_data.world.clockPressure, 10, 'floor progress should replay clock pressure');
}

async function testFloorKeyMismatchRejected() {
  const sandbox = makePluginSandbox();
  sandbox.__currentMessageId = 8;
  sandbox.__messages[8] = { message_id: 8, role: 'assistant', message: 'floor key smoke' };
  sandbox.__messageVars[8] = {
    stat_data: {
      hero: createHero(),
      world: { act: sandbox.ACE0Modules.act.getDefaultActState(), clockPressure: 0 }
    },
    schema: 'smoke'
  };

  const result = await sandbox.ACE0Plugin.commitReplayPatch({
    floorKey: 'message:9',
    messageId: 8,
    operationId: 'dashboard-act:message:9',
    patches: [{ op: 'replace', path: '/world/clockPressure', value: 50 }]
  });
  assertEqual(result.ok, false, 'floorKey mismatch should be rejected');
  assertEqual(result.reason, 'floor_key_mismatch', 'floorKey mismatch should use stable reason');
  assertEqual(sandbox.__messageVars[8].stat_data.world.clockPressure, 0, 'rejected replay should not mutate variables');
}

async function testParentMvuReplayHandlerIsUsed() {
  const sandbox = makePluginSandbox();
  sandbox.__currentMessageId = 9;
  sandbox.__messages[9] = { message_id: 9, role: 'assistant', message: 'parent handler smoke' };
  sandbox.__messageVars[9] = {
    initialized_lorebooks: {},
    stat_data: {
      hero: createHero(),
      world: { act: sandbox.ACE0Modules.act.getDefaultActState(), clockPressure: 0 }
    },
    schema: 'smoke'
  };
  sandbox.handleVariablesInMessage = undefined;
  sandbox.parent = {
    handleVariablesInMessage: async (messageId) => {
      const vars = sandbox.__messageVars[messageId];
      const msg = sandbox.__messages[messageId];
      if (!vars || !vars.stat_data || !msg) return false;
      applyReplayBlocksToVars(msg.message, vars);
      return true;
    }
  };

  const result = await sandbox.ACE0Plugin.commitReplayPatch({
    floorKey: 'message:9',
    messageId: 9,
    operationId: 'parent-handler-smoke',
    patches: [{ op: 'replace', path: '/world/clockPressure', value: 45 }]
  });
  assertEqual(result.ok, true, 'replay should use MVU handler exposed on window.parent');
  assertEqual(sandbox.__messageVars[9].stat_data.world.clockPressure, 45, 'parent MVU handler should replay variables');
}

async function testParentMvuApiReplayFallbackIsUsed() {
  const sandbox = makePluginSandbox();
  sandbox.__currentMessageId = 10;
  sandbox.__messages[10] = { message_id: 10, role: 'assistant', message: 'parent Mvu API smoke' };
  sandbox.__messageVars[10] = {
    initialized_lorebooks: {},
    stat_data: {
      hero: createHero(),
      world: { act: sandbox.ACE0Modules.act.getDefaultActState(), clockPressure: 0 }
    },
    schema: 'smoke'
  };
  sandbox.handleVariablesInMessage = undefined;
  sandbox.parent = {
    Mvu: {
      parseMessage: async (message, oldVars) => {
        const nextVars = clone(oldVars);
        applyReplayBlocksToVars(message, nextVars);
        return nextVars;
      },
      replaceMvuData: async (vars, options = {}) => {
        const id = Number.isFinite(Number(options.message_id)) ? Math.round(Number(options.message_id)) : sandbox.__currentMessageId;
        sandbox.__messageVars[id] = clone(vars);
      }
    }
  };

  const result = await sandbox.ACE0Plugin.commitReplayPatch({
    floorKey: 'message:10',
    messageId: 10,
    operationId: 'parent-mvu-api-smoke',
    patches: [{ op: 'replace', path: '/world/clockPressure', value: 55 }]
  });
  assertEqual(result.ok, true, 'replay should use parent Mvu API fallback');
  assertEqual(sandbox.__messageVars[10].stat_data.world.clockPressure, 55, 'parent Mvu API should replay variables');
}

async function testDashboardActCommitWritesOnlyChangedActPointers() {
  const sandbox = makePluginSandbox();
  const act = sandbox.ACE0Modules.act;
  const assetDeck = sandbox.ACE0Modules.assetDeck;
  sandbox.__currentMessageId = 13;
  const baseAct = createActStateAt(act, 1, ['node1-entry'], {
    stage: 'executing',
    phase_index: 0,
    phase_advance: 0,
    phase_slots: [null, null, null, null],
    reserve: { combat: 1, rest: 1, asset: 1, vision: 1 }
  });
  const baseWorld = {
    current_time: { day: 1, phase: 'MORNING' },
    clockPressure: 5,
    location: { layer: 'THE_EXCHANGE', site: 'smoke', tags: [] },
    tags: [],
    flags: [],
    storyFlags: {},
    expansion_state: { activeMajor: '', activeLight: [] },
    assetDeck: assetDeck.makeDefaultAssetDeckState(),
    expansions: {},
    act: baseAct
  };
  sandbox.__messages[13] = {
    message_id: 13,
    role: 'assistant',
    message: 'dashboard compact smoke\n<StatusPlaceHolderImpl/>'
  };
  sandbox.__messageVars[13] = {
    initialized_lorebooks: {},
    stat_data: {
      hero: createHero(),
      world: clone(baseWorld)
    },
    schema: 'smoke'
  };
  sandbox.getVariables = (options = {}) => {
    const id = Number.isFinite(Number(options.message_id)) ? Math.round(Number(options.message_id)) : sandbox.__currentMessageId;
    return sandbox.__messageVars[id];
  };
  sandbox.ACE0Plugin = undefined;
  sandbox.parent = {
    Mvu: {
      parseMessage: async (message, oldVars) => {
        const nextVars = clone(oldVars);
        applyReplayBlocksToVars(message, nextVars);
        return nextVars;
      },
      replaceMvuData: async (vars, options = {}) => {
        const id = Number.isFinite(Number(options.message_id)) ? Math.round(Number(options.message_id)) : sandbox.__currentMessageId;
        sandbox.__messageVars[id] = clone(vars);
      }
    }
  };
  sandbox.__ACE0_DASHBOARD_LOADER_TEST_HOOKS__ = true;
  runPackFile(sandbox, 'dashboard/loader.js');

  const commitWorld = clone(baseWorld);
  commitWorld.current_time = { day: 99, phase: 'NIGHT' };
  commitWorld.clockPressure = 99;
  commitWorld.location = { layer: 'THE_STREET', site: 'should-not-write', tags: ['debug'] };
  commitWorld.act = {
    ...clone(baseAct),
    reserve: { combat: 0, rest: 1, asset: 1, vision: 1 },
    phase_slots: [
      null,
      { key: 'combat', source: 'reserve', amount: 1, sources: ['reserve'] },
      null,
      null
    ],
    phasePlanLock: {
      nodeId: 'node1-entry',
      nodeIndex: 1,
      locked: true,
      confirmedPhaseIndex: 0,
      floorKey: 'message:13'
    }
  };

  const didPersist = await sandbox.ACE0DashboardLoaderTestHooks.persistDashboardActState({
    requestId: 'dashboard-compact-smoke',
    meta: { floorKey: 'message:13' },
    world: commitWorld
  });

  assertEqual(didPersist, true, 'dashboard ACT commit should persist through replay');
  const message = sandbox.__messages[13].message;
  assert(message.includes('ACE0_REPLAY:dashboard-act:message:13'), 'dashboard ACT commit should append replay block');
  assert(message.includes('"path": "/world/act/reserve/combat"'), 'dashboard ACT commit should include changed reserve leaf');
  assert(message.includes('"path": "/world/act/phase_slots"'), 'dashboard ACT commit should include changed phase slots array');
  assert(message.includes('"path": "/world/act/phasePlanLock/nodeId"'), 'dashboard ACT commit should include changed lock leaf');
  assert(!message.includes('"path": "/world/act",'), 'dashboard ACT commit should not replace the whole ACT subtree');
  assert(!message.includes('"path": "/world/current_time"'), 'dashboard ACT commit should ignore unchanged full world payload fields');
  assert(!message.includes('"path": "/world/clockPressure"'), 'dashboard ACT commit should not write clock pressure from full payload');
  assert(!message.includes('"path": "/world/location"'), 'dashboard ACT commit should not write location from full payload');
  assert(!message.includes('"path": "/world/assetDeck"'), 'dashboard ACT commit should not write unchanged assetDeck');
  assertEqual(sandbox.__messageVars[13].stat_data.world.act.reserve.combat, 0, 'dashboard replay should apply ACT reserve leaf');
  assertEqual(sandbox.__messageVars[13].stat_data.world.current_time.day, 1, 'dashboard replay should not apply full world time payload');
  assertEqual(sandbox.__messageVars[13].stat_data.world.clockPressure, 5, 'dashboard replay should not apply full world clock payload');
}

async function testActResultMissingActBaseDoesNotCreateActReplay() {
  const sandbox = makePluginSandbox();
  sandbox.__currentMessageId = 14;
  sandbox.__messages[14] = {
    message_id: 14,
    role: 'assistant',
    message: 'missing act base\n<StatusPlaceHolderImpl/>'
  };
  sandbox.__messageVars[14] = {
    initialized_lorebooks: {},
    stat_data: {
      hero: createHero(),
      world: {
        clockPressure: 5
      }
    },
    schema: 'smoke'
  };

  await sandbox.__handlers.character_message_rendered(14);

  assert(!sandbox.__messages[14].message.includes('ACE0_REPLAY'), 'missing /world/act base should not append ACE0_REPLAY');
  assert(!sandbox.__messageVars[14].stat_data.world.act, 'missing /world/act base should not synthesize default ACT');
}

async function main() {
  await testMissingBaseDoesNotCreateDefaultAct();
  await testActResultMissingActBaseDoesNotCreateActReplay();
  await testFloorProgressWritesOnlyLeafPatches();
  await testPhaseAdvanceWritesReplayAndReplaysActAdvance();
  await testFloorKeyMismatchRejected();
  await testParentMvuReplayHandlerIsUsed();
  await testParentMvuApiReplayFallbackIsUsed();
  await testDashboardActCommitWritesOnlyChangedActPointers();
  console.log('[mvu-replay-smoke] all checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
