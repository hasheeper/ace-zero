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

function applyReplayBlocksToVars(message, vars) {
  const text = typeof message === 'string' ? message : '';
  const regex = /<JSONPatch>\s*([\s\S]*?)\s*<\/JSONPatch>/gi;
  let match;
  while ((match = regex.exec(text))) {
    const patches = JSON.parse(match[1].trim());
    patches.forEach((patch) => {
      if (!patch || patch.op !== 'replace') return;
      applyJsonPointer(vars.stat_data, patch.path, patch.value);
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

async function testPhaseAdvanceWritesReplayAndReplaysFullAct() {
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
  assert(message.includes('ACE0_REPLAY:render:50:act-result'), 'phase advance should append deterministic act-result replay block');
  assert(message.indexOf('ACE0_REPLAY:render:50:act-result') < message.indexOf('<StatusPlaceHolderImpl/>'), 'replay should be inserted before status placeholder');

  const replayedAct = sandbox.__messageVars[50].stat_data.world.act;
  assertEqual(replayedAct.phase_advance, 0, 'replayed ACT should consume phase_advance');
  assertEqual(replayedAct.phase_index, 2, 'replayed ACT should advance to the next phase');
  assert(Array.isArray(replayedAct.route_history) && replayedAct.route_history[0] === 'node1-entry', 'replayed ACT should preserve route history');
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

async function main() {
  await testMissingBaseDoesNotCreateDefaultAct();
  await testPhaseAdvanceWritesReplayAndReplaysFullAct();
  await testFloorKeyMismatchRejected();
  console.log('[mvu-replay-smoke] all checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
