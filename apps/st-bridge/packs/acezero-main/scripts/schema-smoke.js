#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const {
  PACK_ROOT,
  assert
} = require('./smoke-utils');

const schemaPath = path.join(PACK_ROOT, 'schema/acezero-schema.js');
const source = fs.readFileSync(schemaPath, 'utf8');
const contextSource = fs.readFileSync(path.join(PACK_ROOT, 'tavern/context.js'), 'utf8');
const initSource = fs.readFileSync(path.join(PACK_ROOT, '../../../../st/init/initvar.txt'), 'utf8');

function includes(fragment, message) {
  assert(source.includes(fragment), message);
}

function includesIn(haystack, fragment, message) {
  assert(haystack.includes(fragment), message);
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

includes('function normalizeCharacterEncounterState', 'Schema should compact characterEncounter');
includes('characterEncounter: z.record(z.string(), z.any()).default({}).transform(v => normalizeCharacterEncounterState(v))', 'WorldActSchema should compact characterEncounter object');
assert(!source.includes('source.queue'), 'Schema should not migrate legacy encounter queue');
assert(!source.includes('source.characters'), 'Schema should not migrate legacy encounter character mirrors');
assert(!source.includes('source.meta'), 'Schema should not migrate legacy encounter meta');
assert(!source.includes('pendingAssetDeckCommands'), 'Schema should not store AssetDeck pending command state');
includes('function makeDefaultAssetDeckState', 'Schema should define makeDefaultAssetDeckState');
includes('const WorldAssetDeckSchema', 'Schema should define WorldAssetDeckSchema');
includes('assetDeck: WorldAssetDeckSchema', 'WorldSchema should include world.assetDeck');
includes('assetDeck: makeDefaultAssetDeckState()', 'Default world should include assetDeck');
includes('world.assetDeck = WorldAssetDeckSchema.parse(world.assetDeck);', 'World transform should normalize world.assetDeck');
includes('slots: {', 'AssetDeck schema should normalize compact slots');
includes('bag: {', 'AssetDeck schema should normalize compact bag');
includes('offer: normalizeAssetDeckOffer(source.offer)', 'AssetDeck schema should normalize compact offer');
assert(!source.includes('active_general_cards'), 'AssetDeck schema should not store legacy general card mirrors');
assert(!source.includes('active_void_cards'), 'AssetDeck schema should not store legacy void card mirrors');
assert(!source.includes('pending_offer'), 'AssetDeck schema should not store legacy pending offer');
assert(!source.includes('pending_replace'), 'AssetDeck schema should not store legacy pending replace');
assert(!source.includes('history: normalizeAssetDeckHistory'), 'AssetDeck schema should not keep per-floor history');
includes('if (typeof goalInput === \'string\')', 'eventTree nodeGoals should accept shorthand string goals');
includes('rawWindow[`phase_${index + 1}`]', 'eventTree phaseWindow should accept phase_1..phase_4 shorthand');
includes('goal: normalizeTrimmedString(phaseSource.goal || stringGoal, \'\').slice(0, 160)', 'eventTree phase items should accept string shorthand');
includes('floorKey: z.string().transform(v => normalizeTrimmedString(v, \'\')).default(\'\')', 'phasePlanLock should preserve floorKey');

matches(/RINO:\s*\{\s*activated:\s*true,\s*introduced:\s*true,\s*present:\s*true,\s*inParty:\s*true\s*\}/m, 'RINO should default to known/present/in-party');
['SIA', 'POPPY', 'VV', 'TRIXIE', 'COTA', 'EULALIA', 'KAKO', 'KUZUHA'].forEach((charKey) => {
  includes(`${charKey}: makeDefaultCastNode()`, `${charKey} should default through makeDefaultCastNode`);
});
matches(/function makeDefaultCastNode\(\)\s*\{\s*return\s*\{\s*activated:\s*true,\s*introduced:\s*false,\s*present:\s*false,\s*inParty:\s*false,/m, 'Encounter cast nodes should default activated but not introduced/present/inParty');
assert(!source.includes('miniKnown'), 'Schema should no longer expose miniKnown');
includesIn(contextSource, '[NOT INTRODUCED(introduced=false, forbidden_to_appear=true)]', 'Hero context should mark not-introduced characters as forbidden to appear');
includesIn(contextSource, '禁止在正文中出现、发言、行动、被旁白写成在场', 'Hero context should state the not-introduced appearance ban');
includesIn(initSource, 'characterEncounter: {}', 'Initial variables should start with empty compact encounter ledger');
assert(!initSource.includes('v: 2'), 'Initial variables should not store encounter or AssetDeck version markers');
assert(!initSource.includes('version: 1'), 'Initial variables should not store legacy AssetDeck version marker');
assert(!initSource.includes('queuedRequestId'), 'Initial variables should not include legacy encounter request ids');
assert(!initSource.includes('placedNodeId'), 'Initial variables should not include legacy encounter placement mirrors');
assert(!initSource.includes('firstMeetDone'), 'Initial variables should not include legacy encounter completion mirrors');
assert(!initSource.includes('active_general_cards'), 'Initial variables should not include legacy AssetDeck general cards');
assert(!initSource.includes('active_void_cards'), 'Initial variables should not include legacy AssetDeck void cards');
assert(!initSource.includes('pending_offer'), 'Initial variables should not include legacy AssetDeck offer');
assert(!/assetDeck:[\s\S]*\n\s+history:/m.test(initSource), 'Initial variables should not include AssetDeck history');

console.log('schema-smoke ok');
