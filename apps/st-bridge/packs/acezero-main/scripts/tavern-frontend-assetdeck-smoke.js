#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {
  PACK_ROOT,
  assert,
  assertEqual,
  assertDeepEqual,
  createActStateAt
} = require('./smoke-utils');

function runPackFile(sandbox, relativeFile) {
  const filename = path.join(PACK_ROOT, relativeFile);
  const source = fs.readFileSync(filename, 'utf8');
  vm.runInContext(source, sandbox, { filename: relativeFile });
}

const sandbox = {
  console,
  setTimeout,
  clearTimeout,
  CustomEvent: function CustomEvent(type) { this.type = type; },
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
sandbox.eventOn = () => {};
sandbox.getContext = () => ({ chat: [] });
sandbox.injectPrompts = () => {};
sandbox.uninjectPrompts = () => {};
sandbox.getChatMessages = () => [];
sandbox.setChatMessages = async () => {};
sandbox.getLastMessageId = () => -1;
sandbox.createChatMessages = async (messages) => {
  sandbox.__createdMessages = messages;
};

sandbox.__vars = {
  hero: {
    funds: 29.78,
    aliases: { KAZU: 'Yota' },
    cast: {
      RINO: { activated: true, introduced: true, present: true, inParty: true }
    },
    roster: {
      KAZU: { level: 3, mana: 0, maxMana: 0 },
      RINO: { level: 5, mana: 140, maxMana: 140 }
    }
  },
  world: {
    assetDeck: {
      slots: { general: 4, void: 2 },
      bag: {
        general: [{ id: 'asset_skill_minor_wish_l1', lv: 1 }],
        void: [{ id: 'asset_skill_insulation_l1', lv: 1 }]
      },
      offer: {
        floor: 'message:frontend',
        id: 'offer:low:frontend',
        pool: 'low',
        settled: false,
        choices: [{ id: 'asset_mana_max_bronze', lv: 1 }]
      }
    }
  }
};
sandbox.getVariables = async () => ({ stat_data: sandbox.__vars });
sandbox.insertOrAssignVariables = async () => {};

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
  'tavern/worldbook-profile.js',
  'tavern/character-runtime.js',
  'tavern/battle-runtime.js',
  'tavern/result.js',
  'tavern/act-runtime.js',
  'tavern/plugin.js'
].forEach((relativeFile) => runPackFile(sandbox, relativeFile));

setTimeout(() => {
  (async () => {
    const config = await sandbox.ACE0Plugin.triggerBattle({
      hero: { vanguard: 'Yota', rearguard: 'RINO' },
      heroSeat: 'BTN',
      blinds: [0.1, 0.2],
      chips: 10,
      seats: {
        SB: { runner: 'pro_gambler', name: '秃头胖子', mood: 'tilt' },
        BB: { runner: 'casino_shark', name: '金丝眼镜', mood: 'calm' }
      }
    });

    assert(config.assetDeck, 'ACE0_FRONTEND config should include assetDeck');
    assertDeepEqual(
      config.assetDeck.bag.general.map((card) => card.id),
      ['asset_skill_minor_wish_l1'],
      'ACE0_FRONTEND assetDeck should carry compact general card refs'
    );
    assertDeepEqual(
      config.assetDeck.bag.void.map((card) => card.id),
      ['asset_skill_insulation_l1'],
      'ACE0_FRONTEND assetDeck should carry compact void card refs'
    );
    assertEqual(config.assetDeck.slots.general, 4, 'ACE0_FRONTEND assetDeck should carry general slot count');
    assertEqual(config.assetDeck.slots.void, 2, 'ACE0_FRONTEND assetDeck should carry void slot count');
    assert(!Object.prototype.hasOwnProperty.call(config.assetDeck, 'offer'), 'Battle config should not carry offer state');
    assert(!Object.prototype.hasOwnProperty.call(config.assetDeck, 'history'), 'Battle config should not carry AssetDeck history');

    const act = sandbox.ACE0Modules.act;
    const baseBattle = {
      ace0Combat: true,
      hero: { vanguard: 'Yota', rearguard: 'RINO' },
      heroSeat: 'BTN',
      blinds: [0.1, 0.2],
      chips: 10,
      seats: {
        BB: { character: 'COTA', mood: 'calm' }
      }
    };

    sandbox.__vars.hero.funds = 100;
    sandbox.__vars.hero.assets = 50;
    sandbox.__vars.world.act = createActStateAt(act, 1, ['node1-entry'], {
      phase_index: 1,
      pendingResolutions: [
        { type: 'combat', status: 'pending', id: 'boss-req', level: 3, nodeId: 'node1-entry', nodeIndex: 1, phaseIndex: 1 }
      ]
    });
    const pendingCombatConfig = await sandbox.ACE0Plugin.triggerBattle(baseBattle);
    assert(pendingCombatConfig.ace0Combat, 'ace0Combat true should build frontend combat config from pending request');
    assertEqual(pendingCombatConfig.ace0Combat.requestId, 'boss-req', 'frontend combat request id should come from pending request');
    assertEqual(pendingCombatConfig.ace0Combat.level, 3, 'frontend combat level should come from pending request');
    assertEqual(pendingCombatConfig.ace0Combat.stakeGold, 105, 'frontend combat stake should be system-derived');
    assertEqual(pendingCombatConfig.ace0Combat.stakeChips, 10500, 'frontend combat stake chips should be system-derived');

    sandbox.__vars.hero.funds = 21.98;
    sandbox.__vars.hero.assets = 0;
    sandbox.__vars.world.act = createActStateAt(act, 1, ['node1-entry'], {
      phase_index: 1,
      resourceSpent: { combat: 0, rest: 0, asset: 0, vision: 0 },
      phase_slots: [
        null,
        { key: 'combat', source: 'limited', amount: 1 },
        null,
        null
      ],
      pendingResolutions: []
    });
    const activeTokenCombatConfig = await sandbox.ACE0Plugin.triggerBattle(baseBattle);
    assert(activeTokenCombatConfig.ace0Combat, 'ace0Combat true should build frontend combat config from active combat token');
    assertEqual(activeTokenCombatConfig.ace0Combat.requestId, 'chapter0_exchange:node1-entry:1:combat:1:0', 'active token request id should be system-derived');
    assertEqual(activeTokenCombatConfig.ace0Combat.level, 1, 'active token level should come from phase slot amount');
    assertEqual(activeTokenCombatConfig.ace0Combat.stakeGold, 2.2, 'active token stake should be system-derived');

    const legacyObjectConfig = await sandbox.ACE0Plugin.triggerBattle({
      ...baseBattle,
      ace0Combat: {
        requestId: 'legacy-should-not-pass',
        requestIndex: 0,
        level: 3,
        stakeGold: 999
      }
    });
    assert(!legacyObjectConfig.ace0Combat, 'legacy ace0Combat object should no longer be accepted as AI input');

    sandbox.__vars.world.act = createActStateAt(act, 1, ['node1-entry'], {
      phase_index: 1,
      phase_slots: [
        null,
        { key: 'rest', source: 'reserve', amount: 1 },
        null,
        null
      ],
      pendingResolutions: []
    });
    const missingRequestConfig = await sandbox.ACE0Plugin.triggerBattle(baseBattle);
    assert(!missingRequestConfig.ace0Combat, 'ace0Combat true without ACT combat request should build ordinary frontend config');

    console.log('[tavern-frontend-assetdeck-smoke] all checks passed');
  })().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}, 0);
