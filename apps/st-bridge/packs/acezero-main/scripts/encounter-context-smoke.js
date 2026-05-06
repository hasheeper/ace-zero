#!/usr/bin/env node

const {
  assert,
  assertEqual,
  loadActSandbox,
  loadTavernSandbox,
  createTavernRuntime,
  createActStateAt,
  createHero,
  createContext,
  currentRouteToNode4A
} = require('./smoke-utils');

function hasEligible(evaluated, charKey) {
  return evaluated.eligible.some((item) => item.charKey === charKey);
}

function blockedReason(evaluated, charKey, reasonCode) {
  const item = evaluated.blocked.find((entry) => entry.charKey === charKey);
  return Boolean(item && Array.isArray(item.reasonCodes) && item.reasonCodes.includes(reasonCode));
}

function testRuleRequirements() {
  const { act } = loadActSandbox();
  const baseHero = createHero();
  const node4State = createActStateAt(act, 4, currentRouteToNode4A());

  const noCasino = act.evaluateCharacterEncounterEligibility(node4State, baseHero, createContext({
    tags: [],
    location: { layer: 'THE_EXCHANGE', site: '', tags: [] }
  }));
  assert(!hasEligible(noCasino, 'COTA'), 'COTA should block without casino/card-table/dealer tags');
  assert(blockedReason(noCasino, 'COTA', 'tag'), 'COTA should report tag requirement failure');

  const casino = act.evaluateCharacterEncounterEligibility(node4State, baseHero, createContext({ tags: ['casino'] }));
  assert(hasEligible(casino, 'COTA'), 'COTA should pass with casino tag');

  const rustNoFunds = act.evaluateCharacterEncounterEligibility(node4State, createHero({ funds: 5 }), createContext({
    geo: 'THE_RUST',
    layer: 'THE_RUST',
    locationLayer: 'THE_RUST',
    funds: 5
  }));
  assert(!hasEligible(rustNoFunds, 'POPPY'), 'POPPY should block without enough funds');
  assert(blockedReason(rustNoFunds, 'POPPY', 'funds'), 'POPPY should report funds requirement failure');

  const rustWithFunds = act.evaluateCharacterEncounterEligibility(node4State, createHero({ funds: 9999 }), createContext({
    geo: 'THE_RUST',
    layer: 'THE_RUST',
    locationLayer: 'THE_RUST',
    funds: 9999
  }));
  assert(hasEligible(rustWithFunds, 'POPPY'), 'POPPY should pass in THE_RUST with enough funds');

  const node7State = createActStateAt(act, 7, [
    'node1-entry',
    'node2-floor-high',
    'node3-descent',
    'node04-a-route',
    'node05-a-route',
    'node06-a-route',
    'node07-a-route'
  ], {
    resourceSpent: { combat: 20, rest: 20, asset: 20, vision: 20 }
  });
  const kuzNoPoppy = act.evaluateCharacterEncounterEligibility(node7State, baseHero, createContext({
    geo: 'THE_RUST',
    layer: 'THE_RUST',
    locationLayer: 'THE_RUST'
  }));
  assert(!hasEligible(kuzNoPoppy, 'KUZUHA'), 'KUZUHA should require POPPY introduced');
  assert(blockedReason(kuzNoPoppy, 'KUZUHA', 'requires_poppy'), 'KUZUHA should report requires_poppy');

  const kuzWithPoppyActivatedOnly = act.evaluateCharacterEncounterEligibility(node7State, createHero({
    cast: {
      POPPY: { activated: true, introduced: false }
    }
  }), createContext({
    geo: 'THE_RUST',
    layer: 'THE_RUST',
    locationLayer: 'THE_RUST'
  }));
  assert(!hasEligible(kuzWithPoppyActivatedOnly, 'KUZUHA'), 'KUZUHA should not treat activated-only POPPY as introduced');
  assert(blockedReason(kuzWithPoppyActivatedOnly, 'KUZUHA', 'requires_poppy'), 'KUZUHA should still report requires_poppy for activated-only POPPY');

  const kuzWithPoppy = act.evaluateCharacterEncounterEligibility(node7State, createHero({
    cast: {
      POPPY: { activated: true, introduced: true }
    }
  }), createContext({
    geo: 'THE_RUST',
    layer: 'THE_RUST',
    locationLayer: 'THE_RUST'
  }));
  assert(hasEligible(kuzWithPoppy, 'KUZUHA'), 'KUZUHA should pass after POPPY is introduced');

  const node11State = createActStateAt(act, 11, [
    'node1-entry',
    'node2-floor-high',
    'node3-descent',
    'node04-a-route',
    'node05-a-route',
    'node06-a-route',
    'node07-a-route',
    'node08-a-route',
    'node09-a-route',
    'node10-a-route',
    'node11-a-route'
  ], {
    resourceSpent: { combat: 30, rest: 30, asset: 30, vision: 30 }
  });
  const eulaliaNoFlag = act.evaluateCharacterEncounterEligibility(node11State, createHero({
    cast: {
      VV: { activated: true, introduced: true }
    }
  }), createContext({ day: 9, crisis: 80, tags: [] }));
  assert(!hasEligible(eulaliaNoFlag, 'EULALIA'), 'EULALIA should require church_event_triggered');
  assert(blockedReason(eulaliaNoFlag, 'EULALIA', 'missing_flag_church_event_triggered'), 'EULALIA should report missing_flag_church_event_triggered');

  const eulaliaWithVv = act.evaluateCharacterEncounterEligibility(node11State, createHero({
    cast: {
      VV: { activated: true, introduced: true }
    }
  }), createContext({
    day: 9,
    crisis: 10,
    tags: ['church_event_triggered'],
    flags: ['church_event_triggered'],
    storyFlags: { church_event_triggered: true }
  }));
  assert(hasEligible(eulaliaWithVv, 'EULALIA'), 'EULALIA should pass with church flag and VV introduced');

  const eulaliaWithCrisis = act.evaluateCharacterEncounterEligibility(node11State, baseHero, createContext({
    day: 9,
    crisis: 80,
    tags: ['church_event_triggered'],
    flags: ['church_event_triggered'],
    storyFlags: { church_event_triggered: true }
  }));
  assert(hasEligible(eulaliaWithCrisis, 'EULALIA'), 'EULALIA should also pass with church flag and crisis >= 51');
}

function testHostDebugContextSplit() {
  const { sandbox, tavernFactory } = loadTavernSandbox();
  const eraVars = {
    hero: { funds: 1234, cast: {}, roster: {} },
    world: {
      current_time: { day: 7, phase: 'AFTERNOON' },
      location: { layer: 'THE_EXCHANGE', site: 'casino_floor', tags: ['dealer'] },
      tags: ['casino'],
      flags: ['manual_flag'],
      storyFlags: { church_event_triggered: true, disabled_flag: false },
      encounterContext: {
        day: 99,
        geo: 'THE_RUST',
        tags: ['debug_only_tag'],
        funds: 1,
        crisis: 1
      },
      act: { crisis: 66 }
    }
  };
  const { runtime } = createTavernRuntime(tavernFactory, sandbox, { eraVars });
  const context = runtime.buildEncounterContextFromEraVars(eraVars);

  assertEqual(context.day, 7, 'Host context should read world.current_time.day');
  assertEqual(context.geo, 'THE_EXCHANGE', 'Host context should read world.location.layer');
  assertEqual(context.funds, 1234, 'Host context should read hero funds');
  assertEqual(context.crisis, 66, 'Host context should read world.act.crisis');
  assert(context.tags.includes('casino'), 'Host context should include world.tags');
  assert(context.tags.includes('manual_flag'), 'Host context should include world.flags as tags');
  assert(context.tags.includes('dealer'), 'Host context should include location tags');
  assert(context.tags.includes('church_event_triggered'), 'Host context should include true storyFlags as tags');
  assert(!context.tags.includes('debug_only_tag'), 'Host context should ignore world.encounterContext debug override');
  assert(!context.tags.includes('disabled_flag'), 'Host context should ignore false storyFlags');

  const debugContext = createContext({
    geo: 'THE_RUST',
    tags: ['debug_only_tag'],
    funds: 1,
    crisis: 1
  });
  assertEqual(debugContext.geo, 'THE_RUST', 'Debug helper context should still be able to override geo');
  assert(debugContext.tags.includes('debug_only_tag'), 'Debug helper context should still carry debug tags');
}

testRuleRequirements();
testHostDebugContextSplit();

console.log('encounter-context-smoke ok');
