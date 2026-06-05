'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PROJECT_DIR = path.resolve(__dirname, '..');
const LUCK_SEQUENCE_SCRIPT = path.join(PROJECT_DIR, 'frontend/scripts/ui/luck-sequence-panel.js');
const { createLuckDrawPolicy } = require('../engine/base/luck-draw-policy');

function pass(name) {
  console.log(`[PASS] ${name}`);
}

function createPanelHarness() {
  const code = fs.readFileSync(LUCK_SEQUENCE_SCRIPT, 'utf8');
  const context = {
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    document: {
      readyState: 'loading',
      addEventListener() {},
      getElementById() { return null; },
      body: null
    },
    AceZeroMahjongUI: null,
    AceMahjongGameRuntime: null
  };
  context.globalThis = context;
  context.window = context;
  vm.createContext(context);
  vm.runInContext(code, context, { filename: 'luck-sequence-panel.js' });
  assert(context.AceMahjongLuckSequencePanel, 'expected luck sequence panel api');
  return context.AceMahjongLuckSequencePanel;
}

function assertNoLuckLeak(value, message) {
  const json = JSON.stringify(value);
  [
    'selectedTileCode',
    'normalizedSelectedTileCode',
    'randomRoll',
    'candidates',
    'finalWeight',
    'baseWeight',
    'probability',
    'tileCode',
    'replacementTileCode',
    'meldString',
    'meld',
    'm1',
    'p1',
    's1',
    'm123'
  ].forEach((token) => {
    assert(!json.includes(token), `${message}: leaked ${token} in ${json}`);
  });
}

function validatePublicSummaryNoLeak() {
  const policy = createLuckDrawPolicy({
    id: 'luck-public-summary-smoke',
    seed: 'luck-public-summary',
    activeForces: [{ id: 'fortune-a', kind: 'fortune', power: 100 }],
    objectiveIntentBySeat: {
      bottom: { speed: 1, value: 0, safety: 0, commit: 0, pressure: 0, confidence: 1 }
    },
    candidateLocalValues: {
      m1: { speed: 1 },
      p1: { speed: -1 },
      s1: { speed: 0 }
    },
    auditLimit: 4
  });
  const result = policy.chooseDraw({
    seat: 'bottom',
    wallState: { liveWall: ['m1', 'p1', 's1', 'm1', 'p1', 's1'] }
  });
  const publicSummary = result && result.meta ? result.meta.luckPublicSummary : null;
  assert(publicSummary, `expected luckPublicSummary, got ${JSON.stringify(result)}`);
  assert.strictEqual(publicSummary.outcome, 'fortune', `expected fortune public outcome, got ${JSON.stringify(publicSummary)}`);
  assert.strictEqual(publicSummary.dominantKind, 'fortune', `expected fortune dominant kind, got ${JSON.stringify(publicSummary)}`);
  assert.strictEqual(publicSummary.intensity, 2, `expected medium public intensity, got ${JSON.stringify(publicSummary)}`);
  assertNoLuckLeak(publicSummary, 'public summary');
  pass('luck-sequence-panel public-summary-no-leak');
}

function validateSummaryNormalizationNoLeak() {
  const panel = createPanelHarness();
  const entry = panel.pushSummary({
    auditId: 'audit-public-1',
    outcome: 'fortune',
    dominantKind: 'fortune',
    intensity: 99,
    sourceCount: 1,
    selectedTileCode: 'm1',
    probability: 0.75,
    finalWeight: 12
  });
  assert.strictEqual(entry.outcome, 'fortune', `expected fortune entry, got ${JSON.stringify(entry)}`);
  assert.strictEqual(entry.intensity, 3, `expected intensity clamp to strong, got ${JSON.stringify(entry)}`);
  assert(!Object.prototype.hasOwnProperty.call(entry, 'selectedTileCode'), `entry should not retain selectedTileCode: ${JSON.stringify(entry)}`);
  assertNoLuckLeak(entry, 'normalized entry');
  assertNoLuckLeak(panel.formatEntryTitle(entry), 'entry title');
  assertNoLuckLeak(panel.getVisibleEntryText(entry), 'entry visible text');
  pass('luck-sequence-panel summary-normalization-no-leak');
}

function validateMaxEntriesClamp() {
  const panel = createPanelHarness();
  for (let index = 0; index < 12; index += 1) {
    panel.pushSummary({
      auditId: `audit-${index}`,
      outcome: index % 2 ? 'curse' : 'fortune',
      dominantKind: index % 2 ? 'curse' : 'fortune',
      intensity: index % 4
    });
  }
  const entries = panel.getEntries();
  assert.strictEqual(entries.length, 10, `expected 10 recent entries, got ${entries.length}`);
  assert.strictEqual(entries[0].auditId, 'audit-11', `expected newest entry first, got ${JSON.stringify(entries[0])}`);
  assert.strictEqual(entries[9].auditId, 'audit-2', `expected oldest retained entry audit-2, got ${JSON.stringify(entries[9])}`);
  pass('luck-sequence-panel max-entries-clamp');
}

function validateOutcomeClassGeneration() {
  const panel = createPanelHarness();
  const className = panel.getEntryClassName({
    outcome: 'contested',
    dominantKind: 'curse',
    intensity: 2,
    contested: true,
    hasVoidDamping: true
  });
  ['luck-sequence-entry', 'is-contested', 'intensity-2', 'has-void-damping', 'is-dominant-curse'].forEach((token) => {
    assert(className.split(/\s+/).includes(token), `expected class ${token}, got ${className}`);
  });
  pass('luck-sequence-panel outcome-class-generation');
}

function validateDrawEventFallback() {
  const panel = createPanelHarness();
  const entry = panel.pushEvent({
    type: 'tile:draw',
    payload: {
      seat: 'top',
      tileCode: 'm1',
      meta: null
    }
  });
  assert(entry, 'expected plain draw entry');
  assert.strictEqual(entry.outcome, 'draw', `expected draw outcome, got ${JSON.stringify(entry)}`);
  assert.strictEqual(entry.targetLabel, '对', `expected top seat label, got ${JSON.stringify(entry)}`);
  assertNoLuckLeak(entry, 'plain draw entry');
  assertNoLuckLeak(panel.formatEntryTitle(entry), 'plain draw title');
  pass('luck-sequence-panel draw-event-fallback');
}

function validateActionEventEntries() {
  const panel = createPanelHarness();
  const discard = panel.pushEvent({
    type: 'tile:discard',
    payload: {
      seat: 'bottom',
      tileCode: 'm1',
      riichi: true
    }
  });
  assert(discard, 'expected riichi discard entry');
  assert.strictEqual(discard.outcome, 'riichi', `expected riichi outcome, got ${JSON.stringify(discard)}`);
  assert.strictEqual(discard.eventGroup, 'action', `expected action event group, got ${JSON.stringify(discard)}`);
  assert.strictEqual(panel.getVisibleEntryText(discard), '立自', `expected riichi visible text, got ${panel.getVisibleEntryText(discard)}`);
  assertNoLuckLeak(discard, 'riichi action entry');
  assertNoLuckLeak(panel.formatEntryTitle(discard), 'riichi action title');

  const call = panel.pushEvent({
    type: 'meld:call',
    payload: {
      seat: 'left',
      meld: 'm123-'
    }
  });
  assert(call, 'expected call entry');
  assert.strictEqual(call.outcome, 'call', `expected call outcome, got ${JSON.stringify(call)}`);
  assert(panel.getEntryClassName(call).split(/\s+/).includes('is-call'), `expected is-call class, got ${panel.getEntryClassName(call)}`);
  assertNoLuckLeak(call, 'call action entry');

  const roundDraw = panel.pushEvent({
    type: 'round:draw',
    payload: {
      reason: 'huangpai',
      roundResult: { type: 'draw' }
    }
  });
  assert(roundDraw, 'expected round draw entry');
  assert.strictEqual(roundDraw.outcome, 'round-draw', `expected round draw outcome, got ${JSON.stringify(roundDraw)}`);
  assert.strictEqual(panel.getVisibleEntryText(roundDraw), '流', `expected round draw visible text, got ${panel.getVisibleEntryText(roundDraw)}`);
  pass('luck-sequence-panel action-event-entries');
}

function validateUnsupportedEventIgnored() {
  const panel = createPanelHarness();
  const entry = panel.pushEvent({
    type: 'reaction-window:open',
    payload: {
      seat: 'bottom',
      tileCode: 'm1'
    }
  });
  assert.strictEqual(entry, null, `expected unsupported event to be ignored, got ${JSON.stringify(entry)}`);
  assert.strictEqual(panel.getEntries().length, 0, `expected no entries after unsupported event, got ${JSON.stringify(panel.getEntries())}`);
  pass('luck-sequence-panel unsupported-event-ignored');
}

function main() {
  validatePublicSummaryNoLeak();
  validateSummaryNormalizationNoLeak();
  validateMaxEntriesClamp();
  validateOutcomeClassGeneration();
  validateDrawEventFallback();
  validateActionEventEntries();
  validateUnsupportedEventIgnored();
}

main();
