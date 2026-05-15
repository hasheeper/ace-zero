#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {
  PACK_ROOT,
  assert,
  assertEqual,
  clone
} = require('./smoke-utils');

function runPackFile(sandbox, relativeFile) {
  const filename = path.join(PACK_ROOT, relativeFile);
  const source = fs.readFileSync(filename, 'utf8');
  vm.runInContext(source, sandbox, { filename: relativeFile });
}

const listeners = {};
const sandbox = {
  console,
  setTimeout,
  clearTimeout,
  CustomEvent: function CustomEvent(type, init) {
    this.type = type;
    this.detail = init?.detail;
  },
  window: null,
  globalThis: null
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.parent = sandbox;
sandbox.top = sandbox;
sandbox.addEventListener = () => {};
sandbox.removeEventListener = () => {};
sandbox.dispatchEvent = () => {};
sandbox.eventOn = (eventName, listener) => {
  if (!listeners[eventName]) listeners[eventName] = [];
  listeners[eventName].push(listener);
  return () => {};
};
sandbox.getContext = () => ({ chat: [] });
sandbox.injectPrompts = (prompts) => {
  sandbox.__injectedPrompts.push(clone(prompts));
  return { uninject: () => {} };
};
sandbox.uninjectPrompts = () => {};
sandbox.getChatMessages = () => [];
sandbox.setChatMessages = async () => {};
sandbox.getLastMessageId = () => 12;
sandbox.getCurrentMessageId = () => 12;
sandbox.createChatMessages = async () => {};
sandbox.getWorldbook = async () => null;

sandbox.__injectedPrompts = [];
sandbox.__writes = [];
sandbox.__variables = {
  stat_data: {
    hero: {
      funds: 45.44,
      aliases: { KAZU: 'Yota' },
      cast: {
        RINO: { activated: true, introduced: true, present: true, inParty: true },
        SIA: { activated: true, introduced: true, present: true, inParty: false }
      },
      roster: {
        KAZU: { level: 3, mana: 0, maxMana: 0 },
        RINO: { level: 5, mana: 45, maxMana: 100 },
        SIA: { level: 5, mana: 100, maxMana: 100 }
      }
    },
    world: {
      current_time: { day: 2, phase: 'MORNING' },
      clockPressure: 100,
      location: { layer: 'THE_STREET', site: '死灰隔离排泄管' },
      expansion_state: {
        activeMajor: '',
        activeLight: ['keep-light-expansion']
      },
      act: {
        id: 'chapter0_exchange',
        seed: 'PROLOGUE-EXCHANGE',
        nodeIndex: 6,
        route_history: [
          'node1-entry',
          'node2-floor-side',
          'node3-descent',
          'node04-b-route',
          'node05-d-route',
          'node06-c-route'
        ],
        limited: { combat: 0, rest: 0, asset: 0, vision: 0 },
        reserve: { combat: 0, rest: 2, asset: 1, vision: 0 },
        reserve_progress: { combat: 0, rest: 0, asset: 0, vision: 0 },
        income_rate: { combat: 0.45, rest: 0.2, asset: 0.3, vision: 0.2 },
        income_progress: { combat: 0.75, rest: 0, asset: 0.5, vision: 0 },
        phase_slots: [null, null, { key: 'combat', source: 'reserve', amount: 2, sources: ['reserve', 'reserve'] }, null],
        phase_index: 2,
        stage: 'executing',
        phase_advance: 0,
        phasePlanLock: {
          nodeId: 'node06-c-route',
          nodeIndex: 6,
          locked: true,
          confirmedPhaseIndex: 0,
          floorKey: 'message:46'
        },
        eventTree: {
          nodeGoals: { current: { goal: 'current', tendency: 'vision / combat' }, next: { goal: 'next', tendency: '' } },
          phaseWindow: { nodeId: 'node06-c-route', phases: [] }
        },
        controlledNodes: {},
        vision: { baseSight: 1, bonusSight: 2, jumpReady: true, pendingReplace: null },
        resourceSpent: { combat: 3, rest: 3, asset: 2, vision: 4 },
        characterEncounter: { queue: [] },
        pendingResolutions: [],
        pendingAssetDeckCommands: [],
        resolutionHistory: [],
        narrativeTension: 0,
        pendingTransitionTarget: '',
        transitionRequestTarget: '',
        pendingTransitionPrompt: ''
      },
      assetDeck: {
        version: 1,
        general_slots_unlocked: 4,
        void_slots_unlocked: 2,
        active_general_cards: [{ instanceId: 'minor:init', cardId: 'asset_skill_minor_wish_l1', level: 1 }],
        active_void_cards: [],
        pending_offer: null,
        pending_offer_queue: [],
        pending_replace: null,
        history: []
      },
      expansions: {}
    }
  }
};

sandbox.getVariables = async () => clone(sandbox.__variables);
sandbox.insertOrAssignVariables = async (variables) => {
  sandbox.__writes.push(clone(variables));
  sandbox.__variables = {
    ...sandbox.__variables,
    ...clone(variables)
  };
  return clone(sandbox.__variables);
};

vm.createContext(sandbox);
[
  'asset/data.js',
  'asset/runtime.js',
  'asset/summary.js',
  'act/data.js',
  'act/generated-data.js',
  'act/generated-runtime.js',
  'act/narrative-runtime.js',
  'act/frontend-snapshot.js',
  'act/encounter-runtime.js',
  'act/plugin.js',
  'tavern/npc-data.js',
  'tavern/docs.js',
  'tavern/battle-runtime.js',
  'tavern/character-runtime.js',
  'tavern/context.js',
  'tavern/act-runtime.js',
  'tavern/result.js',
  'tavern/plugin.js'
].forEach((relativeFile) => runPackFile(sandbox, relativeFile));

(async () => {
  sandbox.__writes = [];
  sandbox.__injectedPrompts = [];
  for (const listener of listeners.GENERATION_AFTER_COMMANDS || []) {
    await listener('normal', {}, true);
  }
  assertEqual(sandbox.__writes.length, 0, 'dryRun generation hook must not write MVU variables');
  assertEqual(sandbox.__injectedPrompts.length, 0, 'dryRun generation hook must not mutate prompt injections');

  await sandbox.ACE0Plugin.setActiveMajorExpansion('deep-merge-check');
  assertEqual(sandbox.__writes.length, 1, 'setActiveMajorExpansion should persist once');
  const statData = sandbox.__variables.stat_data;
  assert(statData.hero, 'partial era write should preserve hero root');
  assert(statData.world?.act, 'partial era write should preserve world.act');
  assertEqual(statData.hero.funds, 45.44, 'partial era write should preserve hero funds');
  assertEqual(statData.world.act.nodeIndex, 6, 'partial era write should not roll back ACT nodeIndex');
  assertEqual(statData.world.location.site, '死灰隔离排泄管', 'partial era write should preserve world location');
  assertEqual(statData.world.expansion_state.activeMajor, 'deep-merge-check', 'patch value should be applied');
  assertEqual(statData.world.expansion_state.activeLight[0], 'keep-light-expansion', 'nested patch should preserve sibling fields');
  console.log('[tavern-mvu-write-guard-smoke] all checks passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
