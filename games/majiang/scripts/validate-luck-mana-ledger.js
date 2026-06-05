'use strict';

const assert = require('assert');
const luck = require('../shared/runtime/luck');

const { MANA_EVENT_KINDS } = luck;

function pass(name) {
  console.log(`[PASS] ${name}`);
}

function assertInteger(value, message) {
  assert(Number.isInteger(value), `${message}: expected integer, got ${value}`);
}

function createState(initialMana = 500) {
  return luck.createInitialManaState({
    initialMana,
    maxMana: 1000
  });
}

function apply(state, event) {
  const result = luck.applyManaEvent(state, event);
  assert(result && result.entry, `expected mana ledger entry, got ${JSON.stringify(result)}`);
  assertInteger(result.entry.before, 'ledger before');
  assertInteger(result.entry.delta, 'ledger delta');
  assertInteger(result.entry.after, 'ledger after');
  assertInteger(result.entry.max, 'ledger max');
  return result;
}

function assertDelta(event, expectedDelta, name, initialMana = 500) {
  const result = apply(createState(initialMana), {
    seat: 'bottom',
    ...event
  });
  assert.strictEqual(result.entry.delta, expectedDelta, `${name}: expected delta ${expectedDelta}, got ${JSON.stringify(result.entry)}`);
  assert.strictEqual(result.entry.after, Math.max(0, Math.min(1000, initialMana + expectedDelta)), `${name}: unexpected after value`);
  pass(name);
}

function validateInitialState() {
  const state = luck.createInitialManaState();
  ['bottom', 'right', 'top', 'left'].forEach((seat) => {
    assert(state.seats[seat], `expected seat mana state for ${seat}`);
    assert.strictEqual(state.seats[seat].mana, 1000, `expected ${seat} initial mana 1000`);
    assert.strictEqual(state.seats[seat].maxMana, 1000, `expected ${seat} max mana 1000`);
    assert.strictEqual(state.seats[seat].manaLocked, false, `expected ${seat} unlocked`);
    assert.strictEqual(state.seats[seat].manaBroken, false, `expected ${seat} not broken`);
  });
  const policy = luck.normalizeManaPolicy();
  assert.strictEqual(policy.yakumanFill, false, `expected yakumanFill false, got ${JSON.stringify(policy)}`);
  pass('luck-mana-ledger initial-state');
}

function validateActionRecovery() {
  assertDelta({ kind: MANA_EVENT_KINDS.DISCARD, closed: true }, 3, 'luck-mana-ledger closed-discard-gain');
  assertDelta({ kind: MANA_EVENT_KINDS.DISCARD, meldCount: 1 }, 1, 'luck-mana-ledger open-discard-gain');
  assertDelta({ kind: MANA_EVENT_KINDS.CALL }, 10, 'luck-mana-ledger call-gain');
  assertDelta({ kind: MANA_EVENT_KINDS.KAN, kanType: 'kan-open' }, 30, 'luck-mana-ledger open-kan-gain');
  assertDelta({ kind: MANA_EVENT_KINDS.KAN, kanType: 'kan-added' }, 30, 'luck-mana-ledger added-kan-gain');
  assertDelta({ kind: MANA_EVENT_KINDS.KAN, kanType: 'kan-concealed' }, 60, 'luck-mana-ledger concealed-kan-gain');
}

function validateStickRecovery() {
  const policy = luck.normalizeManaPolicy();
  assert.strictEqual(policy.riichiDeclarationCost, 60, `expected riichi stake 60, got ${JSON.stringify(policy)}`);
  assert.strictEqual(policy.riichiStickCollectMultiplier, 2, `expected riichi collect multiplier 2, got ${JSON.stringify(policy)}`);
  assert.strictEqual(policy.riichiStickCollectGain, 120, `expected riichi stick collect gain 120, got ${JSON.stringify(policy)}`);
  assert.strictEqual(policy.honbaCollectGain, 10, `expected honba collect gain 10, got ${JSON.stringify(policy)}`);
  assert.strictEqual(policy.honbaPayCost, 0, `expected honba pay cost 0, got ${JSON.stringify(policy)}`);

  const riichiDeclare = apply(createState(500), {
    kind: MANA_EVENT_KINDS.RIICHI_DECLARATION,
    seat: 'bottom'
  });
  assert.strictEqual(riichiDeclare.entry.delta, -60, `expected riichi declaration stake -60, got ${JSON.stringify(riichiDeclare.entry)}`);
  assert.strictEqual(riichiDeclare.entry.after, 440, `expected riichi declaration after 440, got ${JSON.stringify(riichiDeclare.entry)}`);
  assert.deepStrictEqual(
    riichiDeclare.entry.metadata.flow,
    { stake: 60, collectMultiplier: 2, collectGain: 120 },
    `expected full riichi flow metadata, got ${JSON.stringify(riichiDeclare.entry.metadata)}`
  );

  const riichiCollect = apply(createState(500), {
    kind: MANA_EVENT_KINDS.RIICHI_STICK_COLLECT,
    seat: 'bottom',
    count: 2
  });
  assert.strictEqual(riichiCollect.entry.delta, 240, `expected two riichi sticks to recover 240, got ${JSON.stringify(riichiCollect.entry)}`);
  assert.deepStrictEqual(
    riichiCollect.entry.metadata.flow,
    { stickCount: 2, stake: 60, collectMultiplier: 2, collectGainPerStick: 120 },
    `expected full riichi collect flow metadata, got ${JSON.stringify(riichiCollect.entry.metadata)}`
  );

  assertDelta({ kind: MANA_EVENT_KINDS.HONBA_COLLECT, count: 3 }, 30, 'luck-mana-ledger honba-collect-gain');
  assertDelta({ kind: MANA_EVENT_KINDS.HONBA_PAY, count: 3 }, 0, 'luck-mana-ledger honba-pay-disabled');
  pass('luck-mana-ledger stick-recovery-flow');
}

function validateSkillSpend() {
  const mediumFortune = luck.calculateSkillManaSpend({
    force: { kind: 'fortune', power: 100 },
    focusUsed: 3
  });
  assert.strictEqual(mediumFortune.delta, -11, `expected medium fortune at 3 focus to cost 11, got ${JSON.stringify(mediumFortune)}`);

  const lightCurse = luck.calculateSkillManaSpend({
    force: { kind: 'curse', power: 60 },
    focusUsed: 3
  });
  assert.strictEqual(lightCurse.delta, -6, `expected light curse at 3 focus to cost 6, got ${JSON.stringify(lightCurse)}`);

  const strongFortune = luck.calculateSkillManaSpend({
    force: { kind: 'fortune', power: 140 }
  });
  assert.strictEqual(strongFortune.delta, -17, `expected strong fortune alone to cost 17, got ${JSON.stringify(strongFortune)}`);

  const lightFortune = luck.calculateSkillManaSpend({
    force: { kind: 'fortune', power: 60 }
  });
  assert.strictEqual(lightFortune.delta, -2, `expected light fortune alone to cost 2, got ${JSON.stringify(lightFortune)}`);

  const breakResult = apply(createState(2), {
    kind: MANA_EVENT_KINDS.SKILL_SPEND,
    seat: 'bottom',
    force: { kind: 'fortune', power: 60 },
    activeSkill: true
  });
  assert.strictEqual(breakResult.entry.delta, -2, `expected active skill to spend remaining mana, got ${JSON.stringify(breakResult.entry)}`);
  assert.strictEqual(breakResult.entry.after, 0, `expected mana to clamp at 0, got ${JSON.stringify(breakResult.entry)}`);
  assert.strictEqual(breakResult.entry.manaLocked, true, `expected mana lock at 0, got ${JSON.stringify(breakResult.entry)}`);
  assert.strictEqual(breakResult.entry.triggeredBreak, false, `expected no backlash break, got ${JSON.stringify(breakResult.entry)}`);
  assert.strictEqual(breakResult.manaState.seats.bottom.manaBroken, false, `expected manaBroken false, got ${JSON.stringify(breakResult.manaState.seats.bottom)}`);
  pass('luck-mana-ledger skill-spend-costs');
}

function validateHuleRecovery() {
  assertDelta({ kind: MANA_EVENT_KINDS.SELF_DRAW_WIN }, 80, 'luck-mana-ledger self-draw-win-gain');
  assertDelta({ kind: MANA_EVENT_KINDS.RON_WIN }, 50, 'luck-mana-ledger ron-win-gain');
  assertDelta({ kind: MANA_EVENT_KINDS.DEAL_IN, pointLoss: 8000 }, 120, 'luck-mana-ledger deal-in-pain-recovery');

  [
    [{ han: 1 }, 10, 'han-1'],
    [{ han: 2 }, 20, 'han-2'],
    [{ han: 3 }, 40, 'han-3'],
    [{ han: 4 }, 80, 'han-4'],
    [{ han: 5 }, 120, 'mangan-by-han'],
    [{ limit: '满贯' }, 120, 'mangan-by-limit'],
    [{ han: 6 }, 160, 'haneman-by-han'],
    [{ limit: '跳满' }, 160, 'haneman-by-limit'],
    [{ han: 8 }, 240, 'baiman-by-han'],
    [{ limit: '倍满' }, 240, 'baiman-by-limit'],
    [{ yakuman: true }, 300, 'yakuman']
  ].forEach(([event, expectedDelta, label]) => {
    const bonus = luck.calculateHuleBonusDelta(event);
    assert.strictEqual(bonus.delta, expectedDelta, `expected ${label} hule bonus ${expectedDelta}, got ${JSON.stringify(bonus)}`);
    assertInteger(bonus.delta, `${label} hule bonus delta`);
  });

  const yakumanResult = apply(createState(500), {
    kind: MANA_EVENT_KINDS.HULE_BONUS,
    seat: 'bottom',
    yakuman: true
  });
  assert.strictEqual(yakumanResult.entry.delta, 300, `expected yakuman to add 300, got ${JSON.stringify(yakumanResult.entry)}`);
  assert.strictEqual(yakumanResult.entry.after, 800, `expected yakuman not to refill, got ${JSON.stringify(yakumanResult.entry)}`);
  pass('luck-mana-ledger hule-recovery-gradient');
}

function main() {
  validateInitialState();
  validateActionRecovery();
  validateStickRecovery();
  validateSkillSpend();
  validateHuleRecovery();
}

main();
