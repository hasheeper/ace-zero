#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const {
  PACK_ROOT,
  assert
} = require('./smoke-utils');

const schemaPath = path.join(PACK_ROOT, 'schema/acezero-schema.js');
const source = fs.readFileSync(schemaPath, 'utf8');

function includes(fragment, message) {
  assert(source.includes(fragment), message);
}

function matches(pattern, message) {
  assert(pattern.test(source), message);
}

includes('function normalizeStringList', 'Schema should define normalizeStringList');
includes('function normalizeBooleanFlagMap', 'Schema should define normalizeBooleanFlagMap');
includes('tags: z.array(z.string()).default([]).transform(v => normalizeStringList(v, { lower: true }))', 'world.tags should normalize as lower-case list');
includes('flags: z.array(z.string()).default([]).transform(v => normalizeStringList(v, { lower: true }))', 'world.flags should normalize as lower-case list');
includes('storyFlags: z.record(z.string(), z.any()).default({}).transform(v => normalizeBooleanFlagMap(v))', 'world.storyFlags should normalize boolean map');
includes('world.tags = normalizeStringList(world.tags, { lower: true });', 'World transform should normalize world.tags');
includes('world.flags = normalizeStringList(world.flags, { lower: true });', 'World transform should normalize world.flags');
includes('world.storyFlags = normalizeBooleanFlagMap(world.storyFlags);', 'World transform should normalize world.storyFlags');

includes('pendingAssetDeckCommands: z.array(z.any()).default([])', 'WorldActSchema should preserve pending AssetDeck commands');
includes('function normalizeCharacterEncounterState', 'Schema should compact characterEncounter');
includes('characterEncounter: z.record(z.string(), z.any()).default({}).transform(v => normalizeCharacterEncounterState(v))', 'WorldActSchema should compact characterEncounter object');
includes('pendingAssetDeckCommands: [],', 'makeDefaultActState should include pending AssetDeck commands default');
includes('function makeDefaultAssetDeckState', 'Schema should define makeDefaultAssetDeckState');
includes('const WorldAssetDeckSchema', 'Schema should define WorldAssetDeckSchema');
includes('assetDeck: WorldAssetDeckSchema', 'WorldSchema should include world.assetDeck');
includes('assetDeck: makeDefaultAssetDeckState()', 'Default world should include assetDeck');
includes('world.assetDeck = WorldAssetDeckSchema.parse(world.assetDeck);', 'World transform should normalize world.assetDeck');
includes('active_general_cards: normalizeAssetDeckCardList', 'AssetDeck schema should normalize general cards');
includes('active_void_cards: normalizeAssetDeckCardList', 'AssetDeck schema should normalize void cards');

matches(/RINO:\s*\{\s*activated:\s*true,\s*introduced:\s*true,\s*present:\s*true,\s*inParty:\s*true\s*\}/m, 'RINO should default to known/present/in-party');
['SIA', 'POPPY', 'VV', 'TRIXIE', 'COTA', 'EULALIA', 'KAKO', 'KUZUHA'].forEach((charKey) => {
  includes(`${charKey}: makeDefaultCastNode()`, `${charKey} should default through makeDefaultCastNode`);
});
matches(/function makeDefaultCastNode\(\)\s*\{\s*return\s*\{\s*activated:\s*true,\s*introduced:\s*false,\s*present:\s*false,\s*inParty:\s*false,\s*miniKnown:\s*false,/m, 'Encounter cast nodes should default activated but not introduced/present/inParty');

console.log('schema-smoke ok');
