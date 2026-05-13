#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {
  PACK_ROOT,
  assert,
  assertDeepEqual
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
      version: 1,
      general_slots_unlocked: 4,
      void_slots_unlocked: 2,
      active_general_cards: [
        {
          instanceId: 'asset_skill_minor_wish_l1:init',
          cardId: 'asset_skill_minor_wish_l1',
          rarity: 'bronze',
          kind: 'skill',
          system: 'moirai',
          skillKey: 'minor_wish',
          level: 1,
          targetTags: ['RINO'],
          gameTags: ['texas-holdem'],
          slotTags: ['general'],
          modifiers: [{ type: 'skill_level', key: 'minor_wish', value: 1 }]
        }
      ],
      active_void_cards: [
        {
          instanceId: 'asset_skill_insulation_l1:init_void',
          cardId: 'asset_skill_insulation_l1',
          rarity: 'bronze',
          kind: 'skill',
          system: 'void',
          skillKey: 'insulation',
          level: 1,
          targetTags: ['KAZU'],
          gameTags: ['texas-holdem'],
          slotTags: ['void'],
          modifiers: [{ type: 'skill_level', key: 'insulation', value: 1 }]
        }
      ],
      pending_offer: { id: 'offer-should-not-enter-battle-config' },
      history: [{ kind: 'history-should-not-enter-battle-config' }]
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
      config.assetDeck.active_general_cards.map((card) => card.cardId),
      ['asset_skill_minor_wish_l1'],
      'ACE0_FRONTEND assetDeck should carry active general cards'
    );
    assertDeepEqual(
      config.assetDeck.active_void_cards.map((card) => card.cardId),
      ['asset_skill_insulation_l1'],
      'ACE0_FRONTEND assetDeck should carry active void cards'
    );
    assert(!Object.prototype.hasOwnProperty.call(config.assetDeck, 'pending_offer'), 'Battle config should not carry pending offer state');
    assert(!Object.prototype.hasOwnProperty.call(config.assetDeck, 'history'), 'Battle config should not carry AssetDeck history');
    console.log('[tavern-frontend-assetdeck-smoke] all checks passed');
  })().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}, 0);
