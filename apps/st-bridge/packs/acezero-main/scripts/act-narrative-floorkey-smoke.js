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
        { index: 1, goal: '迎接生客', event: '行动-combat' },
        { index: 2, goal: '上桌博弈', event: '行动-rest' },
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
assert(confirmed.includes('[已确认行动]'), 'confirmed XML should list the whole node plan');
assert(confirmed.includes('一段 - 包间对话与身份确认 / 与Rino的私下交底｜自然推进'), 'confirmed XML should include phase 1 action');
assert(confirmed.includes('行动-combat｜二级·精英战'), 'confirmed XML should include combat level label');
assert(confirmed.includes('二段 - 迎接生客｜行动-combat｜二级·精英战'), 'confirmed XML should not duplicate action labels from phase event text');
assert(!confirmed.includes('迎接生客 / 行动-combat｜行动-combat'), 'confirmed XML should strip duplicated action event text');
assert(confirmed.includes('三段 - 上桌博弈｜行动-rest｜一级·休整'), 'confirmed XML should include phase 3 action without duplicated event text');
assert(confirmed.includes('必须先在 COT 中按以上四段行动建立或修正本节点 eventTree'), 'confirmed XML should strongly require eventTree alignment');
assert(!confirmed.includes('当前行动：'), 'confirmed XML should not be scoped to only one current action');

const staleConfirmed = act.buildPhasePlanConfirmedPromptContent(derived, 'message:8');
assert(staleConfirmed === '', 'mismatched floor should not inject confirmed XML');

const narrative = act.buildNarrativePromptContentFromDerived(derived);
assert(narrative.includes('token="combat"'), 'node-locked plan should expose current token attr');
assert(narrative.includes('行动-combat｜二级·精英战'), 'node-locked narrative should include action label');
assert(narrative.includes('本轮演绎: 二段 - 迎接生客｜行动-combat｜二级·精英战'), 'current section should include action label without duplicated event text');

console.log('[act-narrative-floorkey-smoke] all checks passed');
