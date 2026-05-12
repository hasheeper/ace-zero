#!/usr/bin/env node

const {
  assert,
  loadActSandbox,
  createActStateAt
} = require('./smoke-utils');

const { act } = loadActSandbox();

const actState = createActStateAt(act, 1, ['node1-entry'], {
  phase_index: 1,
  phasePlanLock: {
    nodeId: 'node1-entry',
    nodeIndex: 1,
    locked: true,
    confirmedPhaseIndex: 1,
    floorKey: 'message:7'
  },
  phase_slots: [
    null,
    { key: 'combat', amount: 2, source: 'reserve', sources: ['reserve', 'reserve'] },
    { key: 'rest', amount: 1, source: 'reserve', sources: ['reserve'] },
    null
  ],
  eventTree: {
    nodeGoals: {
      current: { goal: '赌场包间薅羊毛', tendency: '' },
      next: { goal: '带着结果离开包间区', tendency: '' }
    },
    phaseWindow: {
      nodeId: 'node1-entry',
      phases: [
        { index: 0, goal: '包间对话与身份确认', event: '与Rino的私下交底' },
        { index: 1, goal: '迎接生客', event: '未知牌局对手入场试探' },
        { index: 2, goal: '上桌博弈', event: '首轮牌桌交锋' },
        { index: 3, goal: '结算与脱身', event: '完成本局收尾并撤离' }
      ]
    }
  }
});

const derived = {
  act: actState,
  config: act.getChapter(actState.id),
  currentNodeId: 'node1-entry'
};

const confirmed = act.buildPhasePlanConfirmedPromptContent(derived, 'message:7');
assert(confirmed.includes('<ace0_phase_plan_confirmed>'), 'confirmed floor should inject standalone XML');
assert(confirmed.includes('行动-combat｜二级·精英战'), 'confirmed XML should include combat level label');

const staleConfirmed = act.buildPhasePlanConfirmedPromptContent(derived, 'message:8');
assert(staleConfirmed === '', 'mismatched floor should not inject confirmed XML');

const narrative = act.buildNarrativePromptContentFromDerived(derived, { currentFloorKey: 'message:7' });
assert(narrative.includes('token="combat"'), 'matched floor should expose current token attr');
assert(narrative.includes('行动-combat｜二级·精英战'), 'matched floor narrative should include action label');

const staleNarrative = act.buildNarrativePromptContentFromDerived(derived, { currentFloorKey: 'message:8' });
assert(!staleNarrative.includes('token="combat"'), 'stale floor should hide current token attr');
assert(!staleNarrative.includes('行动-combat｜二级·精英战'), 'stale floor narrative should hide stale action label');

console.log('[act-narrative-floorkey-smoke] all checks passed');
