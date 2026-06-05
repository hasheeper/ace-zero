'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const luck = require('../shared/runtime/luck');
const { SingleRoundRuntime } = require('../engine/runtime/single-round-runtime');
const {
  createCompositeDrawPolicy,
  createScriptedDrawPolicy
} = require('../engine/base/draw-policy');
const { createLuckDrawPolicy } = require('../engine/base/luck-draw-policy');

const { MANA_EVENT_KINDS } = luck;
const PROJECT_DIR = path.resolve(__dirname, '..');
const BASE_CONFIG = JSON.parse(fs.readFileSync(path.join(PROJECT_DIR, 'game-config.json'), 'utf8'));

const INITIAL_HANDS = [
  ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'p1', 'p2', 'p3', 's1', 's2', 's3', 'z1'],
  ['m1', 'm1', 'm1', 'p4', 'p5', 'p6', 's4', 's5', 's6', 'z2', 'z2', 'z3', 'z3'],
  ['m7', 'm8', 'm9', 'p7', 'p8', 'p9', 's7', 's8', 's9', 'z4', 'z4', 'z5', 'z5'],
  ['m2', 'm2', 'm2', 'p2', 'p2', 'p2', 's2', 's2', 's2', 'z6', 'z6', 'z7', 'z7']
];

function pass(name) {
  console.log(`[PASS] ${name}`);
}

function createRuntime(initialMana = 500) {
  const luckPolicy = createLuckDrawPolicy({
    id: 'luck-mana-runtime-smoke',
    seed: 'luck-mana-runtime',
    manaState: luck.createInitialManaState({
      initialMana,
      maxMana: 1000
    }),
    auditLimit: 8
  });
  const drawPolicy = createCompositeDrawPolicy([
    createScriptedDrawPolicy({ initialHands: INITIAL_HANDS }),
    luckPolicy
  ]);
  const runtime = new SingleRoundRuntime({
    ...BASE_CONFIG,
    drawPolicy,
    testing: {
      runtimeSetup: {
        liveWallTiles: [
          'm7', 'p7', 's7', 'z1', 'z2', 'z3',
          'm8', 'p8', 's8', 'z4', 'z5', 'z6',
          'm9', 'p9', 's9', 'z7', 'm3', 'p3'
        ]
      }
    }
  });
  return { runtime, luckPolicy };
}

function getLastPayload(runtime, type) {
  const event = runtime.eventLog.slice().reverse().find((entry) => entry.type === type);
  return event ? event.payload : null;
}

function assertSummary(summary, expectedDelta, name) {
  assert(summary, `${name}: expected mana summary`);
  assert.strictEqual(summary.manaDelta, expectedDelta, `${name}: expected manaDelta ${expectedDelta}, got ${JSON.stringify(summary)}`);
  assert(Number.isInteger(summary.manaDelta), `${name}: expected integer manaDelta`);
  assert(Number.isInteger(summary.manaAfter), `${name}: expected integer manaAfter`);
  assert.strictEqual(summary.manaBroken, false, `${name}: expected no manaBroken`);
}

function validateDiscardEventPayload() {
  const { runtime } = createRuntime(500);
  runtime.start();
  runtime.drawTile('bottom');
  const drawPayload = getLastPayload(runtime, 'tile:draw');
  assert(drawPayload && drawPayload.tileCode, `expected tile draw before discard, got ${JSON.stringify(drawPayload)}`);

  runtime.discardTile('bottom', drawPayload.tileCode);
  const discardPayload = getLastPayload(runtime, 'tile:discard');
  assert(discardPayload, 'expected tile:discard payload');
  assertSummary(discardPayload.manaSummary, 3, 'runtime-events closed discard payload');
  pass('luck-mana-runtime-events closed-discard-payload');
}

function validateRuntimeRecordEvents() {
  let runtime = createRuntime(500).runtime;
  assertSummary(runtime.recordLuckManaEvents([{
    kind: MANA_EVENT_KINDS.DISCARD,
    seat: 'bottom',
    meldCount: 1
  }]), 1, 'runtime-events open discard');

  runtime = createRuntime(500).runtime;
  assertSummary(runtime.recordLuckManaEvents([{
    kind: MANA_EVENT_KINDS.CALL,
    seat: 'bottom'
  }]), 10, 'runtime-events call');

  runtime = createRuntime(500).runtime;
  assertSummary(runtime.recordLuckManaEvents([{
    kind: MANA_EVENT_KINDS.KAN,
    seat: 'bottom',
    kanType: 'kan-open'
  }]), 30, 'runtime-events open kan');

  runtime = createRuntime(500).runtime;
  assertSummary(runtime.recordLuckManaEvents([{
    kind: MANA_EVENT_KINDS.KAN,
    seat: 'bottom',
    kanType: 'kan-concealed'
  }]), 60, 'runtime-events concealed kan');

  runtime = createRuntime(500).runtime;
  assertSummary(runtime.recordLuckManaEvents([
    {
      kind: MANA_EVENT_KINDS.SELF_DRAW_WIN,
      seat: 'bottom'
    },
    {
      kind: MANA_EVENT_KINDS.HULE_BONUS,
      seat: 'bottom',
      han: 4
    }
  ]), 160, 'runtime-events self draw plus 4 han');

  runtime = createRuntime(500).runtime;
  assertSummary(runtime.recordLuckManaEvents([
    {
      kind: MANA_EVENT_KINDS.RON_WIN,
      seat: 'bottom'
    },
    {
      kind: MANA_EVENT_KINDS.HULE_BONUS,
      seat: 'bottom',
      han: 5
    }
  ]), 170, 'runtime-events ron plus mangan');

  runtime = createRuntime(500).runtime;
  assertSummary(runtime.recordLuckManaEvents([{
    kind: MANA_EVENT_KINDS.DEAL_IN,
    seat: 'bottom',
    pointLoss: 8000
  }]), 120, 'runtime-events deal-in pain recovery');

  runtime = createRuntime(500).runtime;
  assertSummary(runtime.recordLuckManaEvents([{
    kind: MANA_EVENT_KINDS.RIICHI_DECLARATION,
    seat: 'bottom'
  }]), -60, 'runtime-events riichi declaration stake');

  runtime = createRuntime(500).runtime;
  assertSummary(runtime.recordLuckManaEvents([{
    kind: MANA_EVENT_KINDS.RIICHI_STICK_COLLECT,
    seat: 'bottom',
    count: 2
  }]), 240, 'runtime-events riichi stick collect');

  runtime = createRuntime(500).runtime;
  assertSummary(runtime.recordLuckManaEvents([{
    kind: MANA_EVENT_KINDS.HONBA_COLLECT,
    seat: 'bottom',
    count: 2
  }]), 20, 'runtime-events honba collect');

  runtime = createRuntime(500).runtime;
  assertSummary(runtime.recordLuckManaEvents([{
    kind: MANA_EVENT_KINDS.HONBA_PAY,
    seat: 'right',
    count: 2
  }]), 0, 'runtime-events honba pay disabled');

  pass('luck-mana-runtime-events record-event-deltas');
}

function validateRuntimeApplyEventForwarding() {
  const { runtime } = createRuntime(2);
  const result = runtime.applyLuckManaEvent({
    kind: MANA_EVENT_KINDS.SKILL_SPEND,
    seat: 'bottom',
    force: { kind: 'fortune', power: 60 },
    activeSkill: true
  });
  assert(result && result.entry, `expected forwarded mana event result, got ${JSON.stringify(result)}`);
  assert.strictEqual(result.entry.after, 0, `expected active skill to spend to zero, got ${JSON.stringify(result.entry)}`);
  assert.strictEqual(result.entry.manaLocked, true, `expected mana lock at zero, got ${JSON.stringify(result.entry)}`);
  assert.strictEqual(result.entry.triggeredBreak, false, `expected no backlash break, got ${JSON.stringify(result.entry)}`);
  assert.strictEqual(result.manaState.seats.bottom.manaBroken, false, `expected manaBroken false, got ${JSON.stringify(result.manaState.seats.bottom)}`);
  pass('luck-mana-runtime-events apply-event-forwarding');
}

function main() {
  validateDiscardEventPayload();
  validateRuntimeRecordEvents();
  validateRuntimeApplyEventForwarding();
}

main();
