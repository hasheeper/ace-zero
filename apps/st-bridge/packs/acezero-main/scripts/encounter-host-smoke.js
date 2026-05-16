#!/usr/bin/env node

const {
  assert,
  assertEqual,
  loadTavernSandbox,
  createTavernRuntime,
  createActStateAt,
  createContext,
  currentRouteToNode4A,
  currentRouteToNode5A,
  firstActiveQueueItem
} = require('./smoke-utils');

const { sandbox, act, tavernFactory } = loadTavernSandbox();
const config = act.getChapter('chapter0_exchange');

function makeRuntimeWithEra(eraVars) {
  return createTavernRuntime(tavernFactory, sandbox, { eraVars });
}

function makePlacedCotaAct() {
  const context = createContext();
  const base = createActStateAt(act, 4, currentRouteToNode4A());
  const forced = act.debugForceCharacterEncounter(base, 'COTA', config, { context });
  assert(forced.placed, 'COTA debug force should place for host smoke setup');
  return {
    ...forced.actState,
    nodeIndex: 5,
    route_history: currentRouteToNode5A(),
    phase_index: forced.placed.targetPhaseIndex,
    phase_advance: 1
  };
}

async function testHostAutoAddsEligibleEncounter() {
  const eraVars = {
    hero: {
      funds: 9999,
      cast: {
        RINO: { activated: true, introduced: true, present: true, inParty: true }
      },
      roster: {}
    },
    world: {
      current_time: { day: 9, phase: 'NOON' },
      location: { layer: 'THE_EXCHANGE', site: 'casino_floor', tags: ['casino', 'card_table'] },
      tags: ['casino', 'card_table'],
      flags: [],
      storyFlags: {},
      clockPressure: 0,
      act: createActStateAt(act, 4, currentRouteToNode4A(), {
        resourceSpent: { combat: 10, rest: 10, asset: 10, vision: 10 },
        characterEncounter: {}
      })
    }
  };
  const { runtime } = makeRuntimeWithEra(eraVars);

  const synced = await runtime.synchronizeActCharacterState(eraVars);
  const queuedCota = firstActiveQueueItem(synced.eraVars.world.act, (item) => item.charKey === 'COTA' && item.status === 'queued');
  assert(synced.changed, 'Host sync should persist automatic encounter queueing');
  assert(queuedCota, 'Host sync should queue eligible COTA without manual RULE ADD');
  assertEqual(queuedCota.targetNodeIndex, 0, 'Host auto queueing should not assign a target before the scheduler runs');
}

async function testHostAutoQueuesAllEligibleEncounters() {
  const eraVars = {
    hero: {
      funds: 9999,
      cast: {
        RINO: { activated: true, introduced: true, present: true, inParty: true }
      },
      roster: {}
    },
    world: {
      current_time: { day: 9, phase: 'NOON' },
      location: { layer: 'THE_EXCHANGE', site: 'casino_floor', tags: ['casino', 'card_table'] },
      tags: ['casino', 'card_table'],
      flags: [],
      storyFlags: {},
      clockPressure: 0,
      act: createActStateAt(act, 7, [
        'node1-entry',
        'node2-floor-high',
        'node3-descent',
        'node04-a-route',
        'node05-a-route',
        'node06-a-route',
        'node07-a-route'
      ], {
        resourceSpent: { combat: 12, rest: 0, asset: 0, vision: 0 },
        characterEncounter: {}
      })
    }
  };
  const { runtime } = makeRuntimeWithEra(eraVars);

  const synced = await runtime.synchronizeActCharacterState(eraVars);
  const active = Object.entries(synced.eraVars.world.act.characterEncounter.active || {})
    .map(([charKey, entry]) => ({
      charKey,
      status: entry.state === 'placed' ? 'placed' : 'queued'
    }));
  assert(synced.changed, 'Host sync should persist queued eligible encounters');
  assert(active.length >= 2, 'Host auto mode should queue every currently eligible encounter, not just one');
  assert(!active.some((item) => item.status === 'placed'), 'Host auto mode should not place encounters outside the ACT scheduler');
  assert(active.every((item) => item.status === 'queued'), 'Host auto mode should only queue; placement remains node-boundary controlled');
}

async function testPhaseAdvanceQueuesPoppyImmediatelyWhenConditionBecomesTrue() {
  const eraVars = {
    hero: {
      funds: 9999,
      cast: {
        RINO: { activated: true, introduced: true, present: true, inParty: true }
      },
      roster: {}
    },
    world: {
      current_time: { day: 9, phase: 'NOON' },
      location: { layer: 'THE_RUST', site: 'rust_gate', tags: ['rust'] },
      tags: ['rust'],
      flags: [],
      storyFlags: {},
      clockPressure: 0,
      act: createActStateAt(act, 4, currentRouteToNode4A(), {
        resourceSpent: { combat: 0, rest: 0, asset: 0, vision: 0 },
        phase_index: 0,
        phase_advance: 1,
        characterEncounter: {}
      })
    }
  };
  const { runtime } = makeRuntimeWithEra(eraVars);

  const resolved = await runtime.resolvePendingActAdvance(eraVars);
  const poppy = firstActiveQueueItem(resolved.eraVars.world.act, (item) => item.charKey === 'POPPY');
  assert(poppy, 'POPPY should enter encounter queue during the same NODE4 phase advance that satisfies conditions');
  assertEqual(poppy.status, 'queued', 'POPPY should be queued immediately, while placement remains scheduler-controlled');
  assertEqual(poppy.targetNodeIndex, 0, 'Queued POPPY should not receive a target until the scheduler runs');
}

async function testQueuedPoppySchedulesAtNodeBoundary() {
  const eraVars = {
    hero: {
      funds: 9999,
      cast: {
        RINO: { activated: true, introduced: true, present: true, inParty: true }
      },
      roster: {}
    },
    world: {
      current_time: { day: 9, phase: 'NOON' },
      location: { layer: 'THE_RUST', site: 'rust_gate', tags: ['rust'] },
      tags: ['rust'],
      flags: [],
      storyFlags: {},
      clockPressure: 0,
      act: createActStateAt(act, 4, currentRouteToNode4A(), {
        resourceSpent: { combat: 0, rest: 0, asset: 0, vision: 0 },
        phase_index: 0,
        phase_advance: 4,
        characterEncounter: {}
      })
    }
  };
  const { runtime } = makeRuntimeWithEra(eraVars);

  const resolved = await runtime.resolvePendingActAdvance(eraVars);
  const poppy = firstActiveQueueItem(resolved.eraVars.world.act, (item) => item.charKey === 'POPPY');
  assert(poppy, 'POPPY should stay in the encounter queue after node-boundary scheduling');
  assertEqual(poppy.status, 'placed', 'POPPY should be placed by the scheduler at the node boundary');
  assert(poppy.targetNodeIndex > 4 && poppy.targetNodeIndex <= 6, 'POPPY should target a near future path node from NODE4, not drift to NODE7');
}

async function testFirstMeetPendingAndDossierWriteback() {
  const eraVars = {
    hero: {
      funds: 9999,
      cast: {
        RINO: { activated: true, introduced: true, present: true, inParty: true },
        COTA: { activated: true, introduced: false, present: false, inParty: false }
      },
      roster: {}
    },
    world: {
      current_time: { day: 9, phase: 'NOON' },
      location: { layer: 'THE_EXCHANGE', site: 'casino_floor', tags: ['casino'] },
      tags: ['casino'],
      flags: [],
      storyFlags: {},
      clockPressure: 0,
      act: makePlacedCotaAct()
    }
  };
  const { runtime } = makeRuntimeWithEra(eraVars);

  const resolved = await runtime.resolvePendingActAdvance(eraVars);
  assert(resolved.changed, 'resolvePendingActAdvance should advance and consume target phase');

  const synced = await runtime.synchronizeActCharacterState(resolved.eraVars);
  assert(synced.changed, 'synchronizeActCharacterState should write first-meet cast patch');
  assertEqual(synced.eraVars.hero.cast.COTA.activated, true, 'COTA should be activated in Dossier after first meet');
  assertEqual(synced.eraVars.hero.cast.COTA.introduced, true, 'COTA should be introduced in Dossier after first meet');
  assertEqual(synced.eraVars.hero.cast.COTA.present, false, 'COTA present should remain LLM-controlled after first meet consumption');

  const prompts = runtime.buildActNarrativePrompts(synced.eraVars);
  const firstMeetPrompt = prompts.find((prompt) => prompt.id === 'ace0_first_meet');
  assert(!firstMeetPrompt, 'Consumed first_meet should not inject ace0_first_meet again');
}

async function testPlacedFirstMeetInjectsBeforePhaseConsumption() {
  const baseAct = makePlacedCotaAct();
  const eraVars = {
    hero: {
      funds: 9999,
      cast: {
        RINO: { activated: true, introduced: true, present: true, inParty: true },
        COTA: { activated: true, introduced: false, present: true, inParty: false }
      },
      roster: {}
    },
    world: {
      current_time: { day: 9, phase: 'NOON' },
      location: { layer: 'THE_EXCHANGE', site: 'casino_floor', tags: ['casino'] },
      tags: ['casino'],
      flags: [],
      storyFlags: {},
      clockPressure: 0,
      act: {
        ...baseAct,
        phase_advance: 0
      }
    }
  };
  const { runtime } = makeRuntimeWithEra(eraVars);
  const synced = await runtime.synchronizeActCharacterState(eraVars);
  assertEqual(synced.eraVars.hero.cast.COTA.introduced, true, 'Placed first_meet should unlock introduced during the appearance phase');
  assertEqual(synced.eraVars.hero.cast.COTA.present, true, 'Placed first_meet should preserve existing present=true during the appearance phase');

  const prompts = runtime.buildActNarrativePrompts(synced.eraVars);
  const firstMeetPrompt = prompts.find((prompt) => prompt.id === 'ace0_first_meet');
  assert(firstMeetPrompt, 'Placed current-phase first_meet should produce ace0_first_meet before phase consumption');
  assert(firstMeetPrompt.content.includes('COTA'), 'Placed current-phase first_meet should mention COTA');
}

async function testIntroducedEncounterKeepsManualPresentAfterPhaseConsumption() {
  const eraVars = {
    hero: {
      funds: 9999,
      cast: {
        RINO: { activated: true, introduced: true, present: true, inParty: true },
        COTA: { activated: true, introduced: false, present: true, inParty: false }
      },
      roster: {}
    },
    world: {
      current_time: { day: 9, phase: 'NOON' },
      location: { layer: 'THE_EXCHANGE', site: 'casino_floor', tags: ['casino'] },
      tags: ['casino'],
      flags: [],
      storyFlags: {},
      clockPressure: 0,
      act: makePlacedCotaAct()
    }
  };
  const { runtime } = makeRuntimeWithEra(eraVars);
  const resolved = await runtime.resolvePendingActAdvance(eraVars);
  const movedEraVars = {
    ...resolved.eraVars,
    world: {
      ...resolved.eraVars.world,
      act: {
        ...resolved.eraVars.world.act,
        nodeIndex: 6,
        route_history: [...currentRouteToNode5A(), 'node06-a-route']
      }
    }
  };
  const synced = await runtime.synchronizeActCharacterState(movedEraVars);

  assertEqual(synced.eraVars.hero.cast.COTA.introduced, true, 'Consumed first_meet should keep Dossier unlocked');
  assertEqual(synced.eraVars.hero.cast.COTA.present, true, 'Consumed first_meet should leave present=true under LLM control');
}

async function testIntroducedEncounterPreservesManualPresentAfterFirstMeetPendingClears() {
  const eraVars = {
    hero: {
      funds: 9999,
      cast: {
        RINO: { activated: true, introduced: true, present: true, inParty: true },
        COTA: { activated: true, introduced: true, present: true, inParty: false }
      },
      roster: {}
    },
    world: {
      current_time: { day: 9, phase: 'NOON' },
      location: { layer: 'THE_EXCHANGE', site: 'casino_floor', tags: ['casino'] },
      tags: ['casino'],
      flags: [],
      storyFlags: {},
      clockPressure: 0,
      act: {
        ...makePlacedCotaAct(),
        nodeIndex: 6,
        route_history: [...currentRouteToNode5A(), 'node06-a-route'],
        phase_advance: 0,
        characterEncounter: {
          v: 2,
          met: {
            COTA: {
              node: 'node05-a-route',
              nodeIndex: 5,
              phase: 1
            }
          }
        }
      }
    }
  };
  const { runtime } = makeRuntimeWithEra(eraVars);
  const synced = await runtime.synchronizeActCharacterState(eraVars);

  assertEqual(synced.eraVars.hero.cast.COTA.introduced, true, 'Introduced encounter should remain introduced after first-meet pending clears');
  assertEqual(synced.eraVars.hero.cast.COTA.present, true, 'Manual present=true should persist after first-meet pending clears');
}

async function testPreSignalPendingDoesNotUnlockDossier() {
  const context = createContext({ day: 9, tags: ['casino', 'asset_signal'] });
  const route = [
    'node1-entry',
    'node2-floor-high',
    'node3-descent',
    'node04-a-route',
    'node05-a-route',
    'node06-a-route',
    'node07-a-route',
    'node08-a-route',
    'node09-a-route'
  ];
  const base = createActStateAt(act, 9, route, {
    resourceSpent: { combat: 20, rest: 20, asset: 20, vision: 20 },
    characterEncounter: {
      v: 2,
      met: {
        SIA: {},
        TRIXIE: {},
        COTA: {}
      }
    }
  });
  const queued = act.enqueueEligibleCharacterEncounters(base, {
    funds: 9999,
    cast: {
      SIA: { introduced: true },
      TRIXIE: { introduced: true },
      COTA: { introduced: true }
    }
  }, {
    context,
    config,
    limit: 8,
    place: false
  }).actState;
  const placed = act.placeNextCharacterEncounter(queued, config, {
    context,
    requestCharKey: 'VV',
    requestType: 'pre_signal'
  });
  assert(placed.placed && placed.placed.type === 'pre_signal', 'VV pre_signal should place for host smoke setup');

  const eraVars = {
    hero: {
      funds: 9999,
      cast: {
        VV: { activated: true, introduced: false, present: false, inParty: false }
      },
      roster: {}
    },
    world: {
      current_time: { day: 9, phase: 'NOON' },
      location: { layer: 'THE_EXCHANGE', site: 'casino_floor', tags: ['casino'] },
      tags: ['casino'],
      flags: [],
      storyFlags: {},
      clockPressure: 0,
      act: {
        ...placed.actState,
        nodeIndex: placed.placed.targetNodeIndex,
        route_history: [...route, placed.placed.targetNodeId],
        phase_index: placed.placed.targetPhaseIndex,
        phase_advance: 1
      }
    }
  };
  const { runtime } = makeRuntimeWithEra(eraVars);

  const resolved = await runtime.resolvePendingActAdvance(eraVars);

  const synced = await runtime.synchronizeActCharacterState(resolved.eraVars);
  assertEqual(synced.eraVars.hero.cast.VV.introduced, false, 'pre_signal should not unlock VV Dossier');

  const prompts = runtime.buildActNarrativePrompts(synced.eraVars);
  const preSignalPrompt = prompts.find((prompt) => prompt.id === 'ace0_pre_signal');
  assert(preSignalPrompt, 'pre_signal pending should produce ace0_pre_signal prompt');
  assert(preSignalPrompt.content.includes('<ace0_pre_signal>'), 'pre_signal prompt should include XML wrapper');
  assert(preSignalPrompt.content.includes('VV'), 'pre_signal prompt should mention VV');
}

(async () => {
  await testHostAutoAddsEligibleEncounter();
  await testHostAutoQueuesAllEligibleEncounters();
  await testPhaseAdvanceQueuesPoppyImmediatelyWhenConditionBecomesTrue();
  await testQueuedPoppySchedulesAtNodeBoundary();
  await testPlacedFirstMeetInjectsBeforePhaseConsumption();
  await testIntroducedEncounterKeepsManualPresentAfterPhaseConsumption();
  await testIntroducedEncounterPreservesManualPresentAfterFirstMeetPendingClears();
  await testFirstMeetPendingAndDossierWriteback();
  await testPreSignalPendingDoesNotUnlockDossier();
  console.log('encounter-host-smoke ok');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
