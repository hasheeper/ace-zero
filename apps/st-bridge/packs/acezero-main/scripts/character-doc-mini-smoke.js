#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {
  assert,
  assertEqual,
  PACK_ROOT
} = require('./smoke-utils');

const sandbox = {
  console,
  globalThis: null,
  window: undefined,
  getWorldbook: async () => []
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

['tavern/worldbook-profile.js', 'tavern/docs.js', 'tavern/character-runtime.js'].forEach((relativeFile) => {
  const filename = path.join(PACK_ROOT, relativeFile);
  vm.runInContext(fs.readFileSync(filename, 'utf8'), sandbox, { filename: relativeFile });
});

const runtime = sandbox.ACE0TavernCharacterRuntime.create({
  data: sandbox.ACE0TavernPluginData,
  deps: {
    normalizeTrimmedString: (value, fallback = '') => {
      const normalized = typeof value === 'string' ? value.trim() : '';
      return normalized || fallback;
    },
    getWorldbook: async () => []
  }
});

(async () => {
  const prompts = await runtime.buildCharacterPromptInjections({
    hero: {
      cast: {
        COTA: { activated: true, introduced: false, present: false, inParty: false }
      },
      roster: {}
    }
  }, ['COTA']);

  const cotaPrompt = prompts.find((prompt) => prompt.id === 'ace0_char_doc_cota');
  assert(cotaPrompt, 'Node-level first-meet key should force mini character doc before introduced=true');
  assert(cotaPrompt.content.includes('<cota_mini>'), 'Forced mini doc should include COTA mini block');
  assert(!cotaPrompt.content.includes('<cota_full>'), 'Forced mini doc should not include full COTA doc');

  const ordinaryPrompts = await runtime.buildCharacterPromptInjections({
    hero: {
      cast: {
        COTA: { activated: true, introduced: false, present: false, inParty: false }
      },
      roster: {}
    }
  }, []);
  assertEqual(Boolean(ordinaryPrompts.find((prompt) => prompt.id === 'ace0_char_doc_cota')), false, 'Unintroduced character without node first-meet key should not inject doc');

  const worldbookCalls = [];
  const localWorldbookName = sandbox.ACE0WorldbookProfile.names.local;
  const fullDocRuntime = sandbox.ACE0TavernCharacterRuntime.create({
    data: sandbox.ACE0TavernPluginData,
    constants: {
      FULL_DOC_WORLDBOOK_NAME: localWorldbookName
    },
    deps: {
      normalizeTrimmedString: (value, fallback = '') => {
        const normalized = typeof value === 'string' ? value.trim() : '';
        return normalized || fallback;
      },
      getWorldbook: async (name) => {
        worldbookCalls.push(name);
        return [{ uid: 25, content: '<cota_full>TEST FULL DOC</cota_full>' }];
      }
    }
  });
  const fullDoc = await fullDocRuntime.getCharacterPromptDoc('COTA', {
    introduced: true,
    present: true
  });
  assertEqual(worldbookCalls[0], localWorldbookName, 'Full character doc should read the configured test worldbook');
  assert(fullDoc.includes('TEST FULL DOC'), 'Configured test worldbook should provide full character docs');

  const pluginSource = fs.readFileSync(path.join(PACK_ROOT, 'tavern/plugin.js'), 'utf8');
  assert(pluginSource.includes('FULL_DOC_WORLDBOOK_NAME: resolveFullDocWorldbookName()'), 'Tavern plugin should pass resolved worldbook name into character runtime');
  assert(pluginSource.includes('ACE0WorldbookProfile'), 'Tavern plugin should resolve worldbook names through the centralized profile');

  console.log('[character-doc-mini-smoke] all checks passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
