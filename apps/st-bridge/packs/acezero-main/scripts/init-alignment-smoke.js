#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {
  PACK_ROOT,
  REPO_ROOT,
  assert,
  assertDeepEqual
} = require('./smoke-utils');

function runPackFile(sandbox, relativeFile) {
  const filename = path.join(PACK_ROOT, relativeFile);
  const source = fs.readFileSync(filename, 'utf8');
  vm.runInContext(source, sandbox, { filename: relativeFile });
}

const sandbox = { console, globalThis: null };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
runPackFile(sandbox, 'tavern/npc-data.js');
runPackFile(sandbox, 'tavern/battle-runtime.js');

const data = sandbox.ACE0TavernPluginData;
const runtime = sandbox.ACE0TavernBattleRuntime.create({ data });
const voidSkills = Object.entries(data.UNIVERSAL_SKILLS)
  .filter(([, def]) => def && def.attr === 'void')
  .map(([key]) => key)
  .sort();

assertDeepEqual(voidSkills, ['insulation', 'reality'], 'Void universal skills should match the current skill spec');
assertDeepEqual(
  runtime.deriveSkillsFromAttrs({ moirai: 0, chaos: 0, psyche: 30, void: 60 }, 'KAZU'),
  [],
  'KAZU should not auto-derive universal skills from starting attrs'
);
assertDeepEqual(
  runtime.deriveSkillsFromAttrs({ moirai: 80, chaos: 20, psyche: 30, void: 0 }, 'RINO'),
  ['royal_decree', 'heart_read'],
  'RINO should only auto-derive exclusive skills'
);

const initText = fs.readFileSync(path.join(REPO_ROOT, 'st/init/initvar.txt'), 'utf8');
assert(initText.includes('id: asset_skill_minor_wish_l1'), 'initvar should start with Minor Wish I in general slots');
assert(initText.includes('id: asset_skill_insulation_l1'), 'initvar should start with Insulation I in void slots');
assert(!initText.includes('static_field'), 'initvar should not contain removed static_field');

const schemaText = fs.readFileSync(path.join(PACK_ROOT, 'schema/acezero-schema.js'), 'utf8');
[
  'asset_skill_minor_wish_l4',
  'asset_skill_hex_l3',
  'asset_skill_analysis_l3',
  'asset_skill_premonition_l2',
  'asset_skill_insulation_l3'
].forEach((cardId) => {
  assert(schemaText.includes(cardId), `schema card whitelist should include ${cardId}`);
});

console.log('[init-alignment-smoke] all checks passed');
