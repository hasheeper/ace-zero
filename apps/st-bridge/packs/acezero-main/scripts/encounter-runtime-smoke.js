#!/usr/bin/env node

const {
  assert,
  assertEqual,
  loadActSandbox,
  getChapterConfig,
  createActStateAt,
  createHero,
  createContext,
  currentRouteToNode4A,
  currentRouteToNode5A,
  firstActiveQueueItem
} = require('./smoke-utils');

const { act } = loadActSandbox();
const config = getChapterConfig(act);

function testGeneratedChapterExpandedTo24Nodes() {
  assertEqual(config.totalNodes, 24, 'Generated chapter should expose 24 total nodes');
  assertEqual(config.meta.totalNodes, 24, 'Generated chapter metadata should expose 24 total nodes');
  const nodesByIndex = Object.values(config.nodes || {}).reduce((map, node) => {
    const nodeIndex = Math.max(1, Math.round(Number(node?.nodeIndex) || 1));
    if (!map.has(nodeIndex)) map.set(nodeIndex, []);
    map.get(nodeIndex).push(node);
    return map;
  }, new Map());
  assertEqual((nodesByIndex.get(4) || []).length, 2, 'NODE4 should open into two lane choices');
  assert((nodesByIndex.get(22) || []).length >= 3, 'NODE22 should still be a woven lane layer before collapse');
  assertEqual((nodesByIndex.get(23) || []).length, 2, 'NODE23 should be the collapse layer');
  assertEqual((nodesByIndex.get(24) || []).length, 1, 'NODE24 should be the finale layer');
  assert(config.nodes['node24-finale'], 'NODE24 finale id should exist');
  Object.values(config.nodes || {}).forEach((node) => {
    assert(node.nodeIndex >= 1 && node.nodeIndex <= 24, `Generated node ${node.id} should stay inside 1..24`);
  });
  const visited = new Set();
  const stack = ['node3-descent'];
  while (stack.length) {
    const nodeId = stack.pop();
    if (!nodeId || visited.has(nodeId)) continue;
    visited.add(nodeId);
    const node = config.nodes[nodeId];
    if (!node) continue;
    const nextIds = Array.isArray(node.next?.options)
      ? node.next.options
      : (node.next?.nodeId ? [node.next.nodeId] : []);
    nextIds.forEach((nextId) => {
      if (nextId && !visited.has(nextId)) stack.push(nextId);
    });
  }
  assert(visited.has('node24-finale'), 'Generated route should connect node3-descent to node24-finale');
}

function testFinalNodeCannotReceiveEncounter() {
  const node23 = Object.values(config.nodes || {}).find((node) => node?.nodeIndex === 23);
  assert(node23, 'NODE23 should exist before finale');
  const route = Array.from({ length: 23 }, (_, index) => `past-${index + 1}`);
  route[22] = node23.id;
  const state = createActStateAt(act, 23, route, {
    characterEncounter: {
      queue: [{
        id: 'enc:test:SIA:finale',
        charKey: 'SIA',
        type: 'first_meet',
        status: 'queued',
        createdNodeIndex: 23,
        priority: 999,
        spentScore: 999
      }]
    }
  });

  const placedResult = act.placeNextCharacterEncounter(state, config, { distance: 1 });
  assertEqual(placedResult.placed, null, 'Encounter should not be placed on the final node');
  assertEqual(placedResult.reason, 'no_candidate', 'Final-only target layer should produce no candidate');
}

function testEncounterQueuePrefersHighestSpentScore() {
  const state = createActStateAt(act, 7, [
    'node1-entry',
    'node2-floor-high',
    'node3-descent',
    'node04-a-route',
    'node05-a-route',
    'node06-a-route',
    'node07-a-route'
  ], {
    resourceSpent: { combat: 12, rest: 0, asset: 0, vision: 0 }
  });
  const queuedResult = act.enqueueEligibleCharacterEncounters(state, createHero(), {
    context: createContext(),
    config,
    limit: 3,
    place: false
  });
  assert(queuedResult.queued.length >= 2, 'Multiple eligible encounters should queue for priority ordering smoke');
  assertEqual(queuedResult.queued[0].charKey, 'TRIXIE', 'Highest spent-score sequence should queue first');
  assert(queuedResult.queued[0].spentScore >= queuedResult.queued[1].spentScore, 'Queued encounters should be sorted by spentScore first');
}

function testVisionBonusDecaysAcrossNodeAdvance() {
  const state = createActStateAt(act, 4, currentRouteToNode5A(), {
    vision: {
      baseSight: 1,
      bonusSight: 2,
      jumpReady: true,
      pendingReplace: null
    }
  });

  const advanced = act.advanceActToNextNode(state, config, createHero(), createContext());
  assert(advanced, 'ACT should advance to the queued next node');
  assertEqual(state.nodeIndex, 5, 'Vision decay test should advance exactly one node');
  assertEqual(state.vision.bonusSight, 1, 'Vision bonus should decay by one node instead of clearing');
  assertEqual(state.vision.jumpReady, false, 'Jump readiness should still be one-shot after node advance');
}

function testQueuePlaceConsumeFirstMeet() {
  const hero = createHero();
  const context = createContext();
  const plannedRoute = currentRouteToNode5A();
  const state = createActStateAt(act, 4, plannedRoute);

  const evaluated = act.evaluateCharacterEncounterEligibility(state, hero, context);
  assert(evaluated.eligible.some((item) => item.charKey === 'COTA'), 'COTA should be eligible in casino context');

  const queuedResult = act.enqueueEligibleCharacterEncounters(state, hero, {
    context,
    config,
    limit: 1,
    place: false
  });
  assertEqual(queuedResult.queued.length, 1, 'One eligible encounter should be queued');
  assertEqual(queuedResult.queued[0].charKey, 'COTA', 'The first queued casino encounter should be COTA');
  assertEqual(queuedResult.placed, null, 'Default enqueue with place:false should not place immediately');

  const placedResult = act.placeNextCharacterEncounter(queuedResult.actState, config, { context });
  const placed = placedResult.placed;
  assert(placed, 'Queued encounter should be placed');
  assertEqual(placed.charKey, 'COTA', 'Placed encounter should match queued character');
  assert(placed.targetNodeIndex > 4 && placed.targetNodeIndex <= 6, 'Encounter should be placed on a near future route node');
  assert(['node05-a-route', 'node06-a-route'].includes(placed.targetNodeId), 'Encounter should stay on the planned player path');

  const wrongPhase = (placed.targetPhaseIndex + 1) % 4;
  const missed = act.consumeCharacterEncounterForNode(placedResult.actState, placed.targetNodeId, {
    phaseIndex: wrongPhase
  });
  assertEqual(missed.consumed, null, 'Encounter should not consume on the wrong phase');

  const atTargetNode = {
    ...missed.actState,
    nodeIndex: placed.targetNodeIndex,
    route_history: placed.targetNodeIndex >= 6
      ? [...plannedRoute, placed.targetNodeId]
      : plannedRoute
  };
  const consumedResult = act.consumeCharacterEncounterForNode(atTargetNode, placed.targetNodeId, {
    phaseIndex: placed.targetPhaseIndex
  });
  assert(consumedResult.consumed, 'Encounter should consume on the target phase');
  assertEqual(consumedResult.consumed.charKey, 'COTA', 'Consumed encounter should be COTA');
  assertEqual(consumedResult.actState.characterEncounter.characters.COTA.firstMeetDone, true, 'COTA should be marked firstMeetDone');
  assertEqual(consumedResult.actState.characterEncounter.characters.COTA.status, 'introduced', 'COTA should become introduced');
  assertEqual(consumedResult.actState.characterEncounter.characters.COTA.introducedPhaseIndex, placed.targetPhaseIndex, 'First-meet should record the phase it was introduced on');

  const afterIntroduced = act.evaluateCharacterEncounterEligibility(consumedResult.actState, hero, context);
  assert(!afterIntroduced.eligible.some((item) => item.charKey === 'COTA'), 'Introduced COTA should not become eligible again');
}

function testForceSpecificCharacterAndQueuedSequence() {
  const context = createContext();
  const hero = createHero();
  const base = createActStateAt(act, 4, currentRouteToNode4A());
  const queuedCota = act.enqueueEligibleCharacterEncounters(base, hero, {
    context,
    config,
    limit: 1,
    place: false
  }).actState;

  const forcedSia = act.debugForceCharacterEncounter(queuedCota, 'SIA', config, { context });
  assert(forcedSia.applied, 'Debug FORCE should apply for SIA');
  assert(forcedSia.placed, 'Debug FORCE should place SIA when the next node is open');
  assertEqual(forcedSia.placed.charKey, 'SIA', 'FORCE should place the clicked character, not an older queued character');
  const cotaQueue = forcedSia.actState.characterEncounter.queue.find((item) => item.charKey === 'COTA');
  assertEqual(cotaQueue.status, 'queued', 'Older queued COTA should remain queued');

  const forcedCota = act.debugForceCharacterEncounter(forcedSia.actState, 'COTA', config, { context });
  assert(forcedCota.applied, 'FORCE should keep a request queued when the next node is occupied');
  assertEqual(forcedCota.placed, null, 'FORCE should not replace an existing placed marker');
  const activeCota = firstActiveQueueItem(forcedCota.actState, (item) => item.charKey === 'COTA');
  assert(activeCota, 'COTA request should remain active after blocked force placement');
  assertEqual(activeCota.status, 'queued', 'Blocked FORCE should preserve queued request for later placement');
}

function testFirstMeetPacing() {
  const context = createContext();
  const hero = createHero();
  const base = createActStateAt(act, 4, currentRouteToNode4A());
  const placedResult = act.debugForceCharacterEncounter(base, 'COTA', config, { context });
  const placed = placedResult.placed;
  const consumedResult = act.consumeCharacterEncounterForNode({
    ...placedResult.actState,
    nodeIndex: 5,
    route_history: currentRouteToNode5A()
  }, placed.targetNodeId, {
    phaseIndex: placed.targetPhaseIndex
  });

  const blockedRuleAddSia = act.enqueueEligibleCharacterEncounters(consumedResult.actState, hero, {
    context,
    config,
    limit: 1,
    place: true
  });
  assertEqual(blockedRuleAddSia.placed, null, 'Scheduler should not place a new first-meet immediately after one is consumed');
  const queuedNext = blockedRuleAddSia.actState.characterEncounter.queue.find((item) => item.status === 'queued');
  assert(queuedNext, 'The next eligible request should remain queued through the cooldown node');

  const afterCooldown = {
    ...blockedRuleAddSia.actState,
    nodeIndex: 6,
    route_history: [
      ...currentRouteToNode5A(),
      'node06-a-route'
    ]
  };
  const ruleAddSia = act.placeNextCharacterEncounter(afterCooldown, config, { context });
  assert(ruleAddSia.placed, 'Scheduler should place the next first-meet after one node of spacing');
  assertEqual(ruleAddSia.placed.charKey, queuedNext.charKey, 'The next scheduled request should preserve its character');
  assert(ruleAddSia.placed.targetNodeIndex > 6 && ruleAddSia.placed.targetNodeIndex <= 8, 'Next first-meet should target a near future path node after cooldown');
  const sameNodeConsume = act.consumeCharacterEncounterForNode(ruleAddSia.actState, placed.targetNodeId, {
    phaseIndex: ruleAddSia.placed.targetPhaseIndex
  });
  assertEqual(sameNodeConsume.consumed, null, 'Newly placed encounter should not trigger on the current node');
}

function testPreSignalThenFirstMeet() {
  const longRoute = [
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
  const context = createContext({
    day: 9,
    funds: 9999,
    tags: ['casino', 'asset_signal']
  });
  const hero = createHero({
    cast: {
      SIA: { activated: true, introduced: true },
      TRIXIE: { activated: true, introduced: true },
      COTA: { activated: true, introduced: true }
    }
  });
  const state = createActStateAt(act, 9, longRoute, {
    resourceSpent: { combat: 20, rest: 20, asset: 20, vision: 20 },
    characterEncounter: {
      characters: {
        SIA: { status: 'introduced', firstMeetDone: true },
        TRIXIE: { status: 'introduced', firstMeetDone: true },
        COTA: { status: 'introduced', firstMeetDone: true }
      },
      queue: []
    }
  });

  const queuedResult = act.enqueueEligibleCharacterEncounters(state, hero, {
    context,
    config,
    limit: 8,
    place: false
  });
  const vvPreSignal = queuedResult.actState.characterEncounter.queue.find((item) => item.charKey === 'VV');
  assert(vvPreSignal, 'VV should queue when hybrid requirements are met');
  assertEqual(vvPreSignal.type, 'pre_signal', 'VV should pre-signal before first meet');

  const placedResult = act.placeNextCharacterEncounter(queuedResult.actState, config, {
    context,
    requestCharKey: 'VV',
    requestType: 'pre_signal'
  });
  assert(placedResult.placed, 'VV pre-signal should place');
  const consumedResult = act.consumeCharacterEncounterForNode({
    ...placedResult.actState,
    nodeIndex: placedResult.placed.targetNodeIndex,
    route_history: [...longRoute, placedResult.placed.targetNodeId]
  }, placedResult.placed.targetNodeId, {
    phaseIndex: placedResult.placed.targetPhaseIndex
  });
  assert(consumedResult.consumed, 'VV pre-signal should consume');
  assertEqual(consumedResult.consumed.type, 'pre_signal', 'Consumed VV event should be pre_signal');
  assertEqual(consumedResult.actState.characterEncounter.characters.VV.preSignalDone, true, 'VV should remember preSignalDone');
  assertEqual(consumedResult.actState.characterEncounter.characters.VV.firstMeetDone, false, 'pre_signal should not unlock firstMeetDone');
  assertEqual(consumedResult.actState.characterEncounter.characters.VV.preSignalNodeId, placedResult.placed.targetNodeId, 'pre_signal should record its source node');
  assertEqual(consumedResult.actState.characterEncounter.characters.VV.preSignalPhaseIndex, placedResult.placed.targetPhaseIndex, 'pre_signal should record its source phase');
  assert(consumedResult.placed, 'pre_signal should immediately place the first_meet follow-up');
  assertEqual(consumedResult.placed.type, 'first_meet', 'VV follow-up request should be first_meet');
  assertEqual(consumedResult.placed.targetNodeIndex, placedResult.placed.targetNodeIndex + 1, 'first_meet follow-up should target the next node after pre_signal');
}

testGeneratedChapterExpandedTo24Nodes();
testFinalNodeCannotReceiveEncounter();
testEncounterQueuePrefersHighestSpentScore();
testVisionBonusDecaysAcrossNodeAdvance();
testQueuePlaceConsumeFirstMeet();
testForceSpecificCharacterAndQueuedSequence();
testFirstMeetPacing();
testPreSignalThenFirstMeet();

console.log('encounter-runtime-smoke ok');
