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

['tavern/docs.js', 'tavern/character-runtime.js'].forEach((relativeFile) => {
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

  console.log('[character-doc-mini-smoke] all checks passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
