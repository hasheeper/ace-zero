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

function toPlacedMarker(placed) {
  if (!placed) return null;
  const kind = placed.kind === 'signal' ? 'signal' : 'meet';
  return {
    charKey: placed.charKey,
    type: kind === 'signal' ? 'pre_signal' : 'first_meet',
    targetNodeId: placed.node || '',
    targetNodeIndex: Math.max(0, Math.round(Number(placed.nodeIndex) || 0)),
    targetPhaseIndex: Number.isFinite(Number(placed.phase)) ? Math.max(0, Math.min(3, Math.round(Number(placed.phase)))) : (kind === 'signal' ? 0 : 1)
  };
}

function makeRuntimeWithEra(eraVars) {
  return createTavernRuntime(tavernFactory, sandbox, { eraVars });
}

function makePlacedCotaAct() {
  const context = createContext();
  const base = createActStateAt(act, 4, currentRouteToNode4A());
  const forced = act.debugForceCharacterEncounter(base, 'COTA', config, { context });
  assert(forced.placed, 'COTA debug force should place for host smoke setup');
  const placed = toPlacedMarker(forced.placed);
  return {
    ...forced.actState,
    nodeIndex: placed.targetNodeIndex,
    route_history: [...currentRouteToNode4A(), placed.targetNodeId],
    phase_index: placed.targetPhaseIndex,
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
  const placedCota = firstActiveQueueItem(synced.eraVars.world.act, (item) => item.charKey === 'COTA' && item.status === 'placed');
  assert(synced.changed, 'Host sync should persist automatic encounter scheduling');
  assert(placedCota, 'Host sync should schedule eligible COTA without manual RULE ADD');
  assert(placedCota.targetNodeIndex > synced.eraVars.world.act.nodeIndex, 'Host auto scheduling should target a future node');
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
  assert(synced.changed, 'Host sync should persist eligible encounters');
  assert(active.length >= 2, 'Host auto mode should keep every currently eligible encounter active, not drop lower-priority entries');
  assert(active.some((item) => item.status === 'placed'), 'Host auto mode should schedule one visible future encounter');
  assert(active.filter((item) => item.status === 'placed').length <= 1, 'Host auto mode should not schedule more than one first meet at a time');
}

async function testPhaseAdvanceSchedulesPoppyWhenConditionBecomesTrue() {
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
  assertEqual(poppy.status, 'placed', 'POPPY should be scheduled immediately onto a future node');
  assert(poppy.targetNodeIndex > resolved.eraVars.world.act.nodeIndex, 'Scheduled POPPY should target a future node');
}

async function testPhaseAdvanceQueuesPoppyInStreetLayer() {
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
      location: { layer: 'THE_STREET', site: 'street_hideout', tags: [] },
      tags: [],
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
  assert(poppy, 'POPPY should also enter encounter queue in THE_STREET when conditions are satisfied');
  assertEqual(poppy.status, 'placed', 'Street-layer POPPY should schedule onto a future node');
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
  assert(poppy, 'POPPY should stay active at a route-choice boundary');
  assertEqual(poppy.status, 'placed', 'POPPY should keep its scheduled future target at route-choice boundary');
  assert(poppy.targetNodeIndex > resolved.eraVars.world.act.nodeIndex, 'POPPY should not bind to the current or past node at route-choice boundary');
}

async function testQueuedMeetAndPlacedSignalSurfaceInPrompts() {
  const route = [
    'node1-entry',
    'node2-floor-side',
    'node3-descent',
    'node04-b-route',
    'node05-d-route',
    'node06-c-route',
    'node07-d-route',
    'node08-d-route'
  ];
  const actState = createActStateAt(act, 8, route, {
    phase_index: 1,
    phase_advance: 0,
    phasePlanLock: {
      nodeId: 'node08-d-route',
      nodeIndex: 8,
      locked: true,
      confirmedPhaseIndex: 1,
      floorKey: 'message:63'
    },
    phase_slots: [
      null,
      null,
      null,
      { key: 'combat', amount: 2, source: 'reserve', sources: ['reserve', 'reserve'] }
    ],
    eventTree: {
      nodeGoals: {
        current: { goal: '探寻金融派处理主债核心路径或教廷防线', tendency: 'vision' },
        next: { goal: '引爆或重构主债关联契约', tendency: '' }
      },
      phaseWindow: {
        nodeId: 'node08-d-route',
        phases: [
          { index: 0, goal: '清理街区跟踪者并修整', event: 'SIA处理追兵，确认保护线' },
          { index: 1, goal: '潜入教廷据点', event: '借灰败人群掩护混入建筑' },
          { index: 2, goal: '收集结算书线索', event: '暗中寻找大主教精算室的情报' },
          { index: 3, goal: '获取核心证据引发警报', event: '冲突或逃离，为主债清算寻找抓手' }
        ]
      }
    },
    characterEncounter: {
      active: {
        KAKO: {
          kind: 'signal',
          state: 'placed',
          node: 'node08-d-route',
          nodeIndex: 8,
          phase: 2,
          from: 7,
          until: 10,
          priority: 172
        },
        TRIXIE: {
          kind: 'meet',
          state: 'placed',
          node: 'node08-d-route',
          nodeIndex: 8,
          phase: 1,
          from: 7,
          priority: 125
        },
        POPPY: {
          kind: 'meet',
          state: 'queued',
          from: 7,
          priority: 60
        }
      },
      met: {
        COTA: { node: 'node2-floor-side', nodeIndex: 2, phase: 1 },
        SIA: { node: 'node05-d-route', nodeIndex: 5, phase: 1 }
      },
      lastMeet: 5
    }
  });
  const eraVars = {
    hero: {
      funds: 196.29,
      cast: {
        RINO: { activated: true, introduced: true, present: false, inParty: true },
        SIA: { activated: true, introduced: true, present: true, inParty: true },
        COTA: { activated: true, introduced: true, present: false, inParty: false },
        TRIXIE: { activated: true, introduced: false, present: false, inParty: false },
        KAKO: { activated: true, introduced: false, present: false, inParty: false }
      },
      roster: {}
    },
    world: {
      current_time: { day: 2, phase: 'NIGHT' },
      location: { layer: 'THE_STREET', site: '教廷救济站外围', tags: [] },
      tags: [],
      flags: [],
      storyFlags: {},
      clockPressure: 100,
      act: actState
    }
  };
  const { runtime } = createTavernRuntime(tavernFactory, sandbox, {
    eraVars,
    getCurrentFloorKey: () => 'message:63'
  });

  const prompts = runtime.buildActNarrativePrompts(eraVars);
  const confirmedPrompt = prompts.find((prompt) => prompt.id === 'ace0_phase_plan_confirmed');
  const narrativePrompt = prompts.find((prompt) => prompt.id === 'ace0_act_narrative');
  assert(confirmedPrompt?.content.includes('二段 - 潜入教廷据点 / 借灰败人群掩护混入建筑｜自然推进｜人物首见-TRIXIE'), 'confirmed plan should surface only the highest-priority first-meet marker for one phase');
  assert(!confirmedPrompt?.content.includes('人物首见-POPPY/TRIXIE'), 'confirmed plan should not crowd multiple first meets into one phase');
  assert(confirmedPrompt?.content.includes('三段 - 收集结算书线索 / 暗中寻找大主教精算室的情报｜自然推进｜人物预兆-KAKO'), 'confirmed plan should surface KAKO pre-signal on phase 3');
  assert(narrativePrompt?.content.includes('当前进行: 二段 - 潜入教廷据点 / 借灰败人群掩护混入建筑｜自然推进｜人物首见-TRIXIE'), 'narrative should surface only the highest-priority first-meet marker for one phase');
  assert(!narrativePrompt?.content.includes('人物首见-POPPY/TRIXIE'), 'narrative should not crowd multiple first meets into one phase');
  assert(narrativePrompt?.content.includes('未来准备: 三段 - 收集结算书线索 / 暗中寻找大主教精算室的情报｜自然推进｜人物预兆-KAKO'), 'narrative should preview KAKO pre-signal on the next phase');

  const advancedEraVars = JSON.parse(JSON.stringify(eraVars));
  advancedEraVars.world.act.phase_advance = 1;
  const resolved = await runtime.resolvePendingActAdvance(advancedEraVars);
  assert(resolved.eraVars.world.act.characterEncounter.met?.TRIXIE, 'phase advance should consume the placed TRIXIE first meet');
  assert(!resolved.eraVars.world.act.characterEncounter.active?.TRIXIE, 'consumed placed TRIXIE should leave active queue');
  assert(resolved.eraVars.world.act.characterEncounter.active?.POPPY, 'lower-priority same-phase queued POPPY should wait for a later phase advance');
  assert(resolved.eraVars.world.act.characterEncounter.active?.KAKO, 'future KAKO pre-signal should remain active after phase 2 advance');
  assertEqual(resolved.eraVars.hero.cast.TRIXIE.introduced, true, 'placed TRIXIE first meet should unlock cast introduction when consumed');

  const afterTrixiePrompts = runtime.buildActNarrativePrompts(resolved.eraVars)
    .map((prompt) => prompt.content || '')
    .join('\n');
  assert(!afterTrixiePrompts.includes('人物首见-POPPY'), 'POPPY should not be injected into NODE8 after TRIXIE first meet is consumed');
  const afterTrixieSnapshot = act.createFrontendSnapshot({ actState: resolved.eraVars.world.act });
  assert(!afterTrixieSnapshot.encounterMarkers.some((marker) => marker.charKey === 'POPPY' && marker.nodeId === 'node08-d-route'), 'Dashboard snapshot should not project POPPY back onto NODE8 after TRIXIE');

  const afterKakoEraVars = JSON.parse(JSON.stringify(resolved.eraVars));
  afterKakoEraVars.world.act.phase_advance = 1;
  const afterKako = await runtime.resolvePendingActAdvance(afterKakoEraVars);
  assert(afterKako.eraVars.world.act.characterEncounter.signaled?.KAKO, 'KAKO pre-signal should consume on phase 3');
  assert(afterKako.eraVars.world.act.characterEncounter.active?.POPPY, 'POPPY should still remain queued after KAKO pre-signal');
  const afterKakoPrompts = runtime.buildActNarrativePrompts(afterKako.eraVars)
    .map((prompt) => prompt.content || '')
    .join('\n');
  assert(!afterKakoPrompts.includes('人物首见-POPPY'), 'POPPY should not be injected into NODE8 after TRIXIE and KAKO have both resolved');
  const afterKakoSnapshot = act.createFrontendSnapshot({ actState: afterKako.eraVars.world.act });
  assert(!afterKakoSnapshot.encounterMarkers.some((marker) => marker.charKey === 'POPPY' && marker.nodeId === 'node08-d-route'), 'Dashboard snapshot should not show POPPY on past NODE8 after KAKO');
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
  assertEqual(synced.eraVars.hero.cast.COTA.present, true, 'COTA should be present on the first-meet frame after consumption');

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
    limit: 8
  }).actState;
  const signalState = {
    ...queued,
    characterEncounter: {
      ...(queued.characterEncounter || {}),
      active: {
        VV: {
          kind: 'signal',
          state: 'queued',
          from: 9,
          priority: 50
        }
      }
    }
  };
  const placed = act.updateCharacterEncountersForNodeEntry(signalState, {
    funds: 9999,
    cast: {
      SIA: { introduced: true },
      TRIXIE: { introduced: true },
      COTA: { introduced: true }
    }
  }, config, context);
  const placedMarker = toPlacedMarker(placed.placed);
  assert(placedMarker && placedMarker.type === 'pre_signal', 'VV pre_signal should place for host smoke setup');

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
        nodeIndex: placedMarker.targetNodeIndex,
        route_history: [...route, placedMarker.targetNodeId],
        phase_index: placedMarker.targetPhaseIndex,
        phase_advance: 1
      }
    }
  };
  const { runtime } = makeRuntimeWithEra(eraVars);

  const pendingPrompts = runtime.buildActNarrativePrompts(eraVars);
  const pendingPreSignalPrompt = pendingPrompts.find((prompt) => prompt.id === 'ace0_pre_signal');
  assert(pendingPreSignalPrompt, 'pre_signal pending should produce ace0_pre_signal prompt');
  assert(pendingPreSignalPrompt.content.includes('<ace0_pre_signal>'), 'pre_signal prompt should include XML wrapper');
  assert(pendingPreSignalPrompt.content.includes('VV'), 'pre_signal prompt should mention VV');

  const resolved = await runtime.resolvePendingActAdvance(eraVars);

  const synced = await runtime.synchronizeActCharacterState(resolved.eraVars);
  assertEqual(synced.eraVars.hero.cast.VV.introduced, false, 'pre_signal should not unlock VV Dossier');
}

(async () => {
  await testHostAutoAddsEligibleEncounter();
  await testHostAutoQueuesAllEligibleEncounters();
  await testPhaseAdvanceSchedulesPoppyWhenConditionBecomesTrue();
  await testPhaseAdvanceQueuesPoppyInStreetLayer();
  await testQueuedPoppySchedulesAtNodeBoundary();
  await testQueuedMeetAndPlacedSignalSurfaceInPrompts();
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
