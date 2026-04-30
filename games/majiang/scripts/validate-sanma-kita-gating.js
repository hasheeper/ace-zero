'use strict';

const { SingleRoundRuntime } = require('../engine/runtime/single-round-runtime');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function createRuntime() {
  return new SingleRoundRuntime({
    mode: 'single-round',
    tableSize: 3,
    ruleset: 'riichi-3p-sanma',
    players: [
      { seat: 'bottom', title: '测试者', name: '底家', human: true, ai: { enabled: false, difficulty: 'beta' } },
      { seat: 'right', title: '测试者', name: '右家', human: false, ai: { enabled: false, difficulty: 'beta' } },
      { seat: 'left', title: '测试者', name: '左家', human: false, ai: { enabled: false, difficulty: 'beta' } }
    ],
    round: {
      title: 'Sanma Kita Gating',
      zhuangfeng: 0,
      jushu: 0,
      changbang: 0,
      lizhibang: 0
    }
  });
}

function main() {
  const runtime = createRuntime();
  runtime.start();

  runtime.wallService.shan._pai = [
    'm1', 'm9', 'p1', 'p9',
    'z1', 'z2', 'z3', 'z4', 'z5', 'z6', 'z7', 's1', 's2', 's3'
  ];

  for (let index = 0; index < 4; index += 1) {
    runtime.wallService.drawKitaTile({ seat: 'bottom', reason: 'kita-gating-validation' });
  }

  const bottomIndex = runtime.getSeatIndex('bottom');
  runtime.board.shoupai[bottomIndex].fromString('m11p123s123z12344');
  runtime.turnSeat = 'bottom';
  runtime.stateMachine.setPhase('await_discard');

  const canDeclare = runtime.canDeclareKita('bottom');
  const interactionState = runtime.getInteractionState();
  const legalActionKeys = interactionState
    && interactionState.specialActions
    && Array.isArray(interactionState.specialActions.legalActionKeys)
      ? interactionState.specialActions.legalActionKeys
      : [];

  assert(canDeclare === false, 'bottom should not be allowed to declare kita when no supplement tile remains');
  assert(!legalActionKeys.includes('kita'), 'interaction state should not expose kita when no supplement tile remains');

  console.log('[PASS] sanma-kita-gating');
  console.log(`  canDeclareKita=${canDeclare} legalActionKeys=${JSON.stringify(legalActionKeys)}`);
}

main();
