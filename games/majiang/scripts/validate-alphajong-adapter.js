'use strict';

const assert = require('assert');

const coreAdapter = require('../engine/base/majiang-core-adapter');
const alphaJongAdapterApi = require('./lib/alphajong-adapter');
const arenaApi = require('./benchmark-ai-hanchan-arena');

function parseHandCodes(paistr = '') {
  const handPart = String(paistr || '').split(',')[0] || '';
  const codes = [];
  let suit = null;
  for (const char of handPart.replace(/\*/g, '')) {
    if (/[mpsz]/.test(char)) {
      suit = char;
    } else if (/\d/.test(char) && suit) {
      codes.push(`${suit}${char}`);
    }
  }
  return codes;
}

function createFakeRuntime() {
  const rule = coreAdapter.createRule({});
  const shoupai = [
    coreAdapter.createShoupaiFromString('m123p456s789z112m4'),
    coreAdapter.createShoupaiFromString('m234p234s234z2345'),
    coreAdapter.createShoupaiFromString('m345p345s345z3456'),
    coreAdapter.createShoupaiFromString('m456p456s456z4567')
  ];
  return {
    rule,
    roundConfig: {
      zhuangfeng: 0,
      jushu: 0
    },
    board: {
      shoupai,
      he: [
        { _pai: ['m9', 'p9'] },
        { _pai: ['z1', 'm1'] },
        { _pai: ['z2', 'p1', 'm5*'] },
        { _pai: ['z3', 's1'] }
      ],
      defen: [25000, 25000, 25000, 25000]
    },
    riichiState: {
      bottom: { declared: false },
      right: { declared: false },
      top: { declared: true },
      left: { declared: false }
    },
    getSeatIndex(seatKey) {
      return { bottom: 0, right: 1, top: 2, left: 3 }[seatKey] ?? -1;
    },
    getSeatHandCodes(seatKey) {
      const seatIndex = this.getSeatIndex(seatKey);
      const hand = this.board.shoupai[seatIndex];
      return hand && typeof hand.toString === 'function'
        ? parseHandCodes(hand.toString())
        : [];
    },
    getWallState() {
      return {
        remaining: 60,
        baopai: ['m5']
      };
    }
  };
}

function validateVariantRegistration() {
  const variants = arenaApi.resolveVariants(['alphajong', 'alphajong-discard-only', 'alphajong-core', 'hard-defensive']);
  assert.strictEqual(variants[0].externalAdapter, 'alphajong-discard-only');
  assert.strictEqual(variants[1].externalAdapter, 'alphajong-discard-only');
  assert.strictEqual(variants[2].externalAdapter, 'alphajong-core');
  assert.strictEqual(variants[3].externalAdapter, null);
  console.log('[PASS] alphajong-arena-variant-registration-smoke');
  console.log(`  snapshot=${JSON.stringify({
    variants: variants.map((variant) => variant.id),
    externalAdapters: variants.map((variant) => variant.externalAdapter || null)
  })}`);
}

function validateTileMappingSmoke() {
  assert.strictEqual(alphaJongAdapterApi.canonicalTileCode('m0'), 'm5');
  assert.strictEqual(alphaJongAdapterApi.resolveCandidateTileCode('m5', ['m0', 'p1']), 'm0');
  assert.strictEqual(alphaJongAdapterApi.resolveCandidateTileCode('m5', ['m5', 'p1']), 'm5');
  console.log('[PASS] alphajong-red-five-candidate-mapping-smoke');
}

function validateAdapterDiscardSmoke() {
  const adapter = alphaJongAdapterApi.createAlphaJongAdapter();
  assert(adapter.isAvailable(), `expected AlphaJong source to be available: ${adapter.getLoadError()}`);
  const runtime = createFakeRuntime();
  const decision = adapter.evaluateRuntimeDiscard(runtime, 'bottom');
  const handCodes = runtime.getSeatHandCodes('bottom');
  assert(decision, 'expected AlphaJong discard decision');
  assert(handCodes.includes(decision.tileCode), `expected selected tile in hand, got ${JSON.stringify({ tile: decision.tileCode, handCodes })}`);
  assert.strictEqual(decision.policyId, 'alphajong-discard-only');
  assert.strictEqual(decision.shouldRiichi, false);
  assert(decision.alphaJong && Array.isArray(decision.alphaJong.top), 'expected compact AlphaJong diagnostics');
  assert(
    decision.alphaJong.stateMemory && decision.alphaJong.stateMemory.riichiTileCount >= 1,
    `expected reconstructed AlphaJong state memory, got ${JSON.stringify(decision.alphaJong.stateMemory)}`
  );
  console.log('[PASS] alphajong-adapter-discard-smoke');
  console.log(`  snapshot=${JSON.stringify({
    rootDir: adapter.rootDir,
    tileCode: decision.tileCode,
    top: decision.alphaJong.top.slice(0, 3).map((entry) => entry.tileCode),
    mode: decision.alphaJong.mode
  })}`);
}

function validateCoreAdapterSmoke() {
  const adapter = alphaJongAdapterApi.createAlphaJongAdapter({ mode: 'core' });
  assert(adapter.isAvailable(), `expected AlphaJong source to be available: ${adapter.getLoadError()}`);
  const runtime = createFakeRuntime();
  const discard = adapter.evaluateRuntimeDiscard(runtime, 'bottom');
  assert(discard, 'expected AlphaJong core discard decision');
	  assert.strictEqual(discard.policyId, 'alphajong-core');
	  assert.strictEqual(discard.alphaJong.mode, 'core');
	  assert.strictEqual(typeof discard.shouldRiichi, 'boolean');
	  assert(
	    discard.alphaJong.riichiDiagnostics
	      && Number.isFinite(Number(discard.alphaJong.riichiDiagnostics.legalChoiceCount))
	      && typeof discard.alphaJong.riichiDiagnostics.canRiichi === 'boolean',
	    `expected compact AlphaJong riichi diagnostics, got ${JSON.stringify(discard.alphaJong.riichiDiagnostics)}`
	  );

	  const pengAction = {
    type: 'call',
    key: 'peng:bottom:0',
    payload: {
      seat: 'bottom',
      callType: 'peng',
      meld: 'z111-',
      meldString: 'z111-',
      tileCode: 'z1',
      fromSeat: 'right',
      preview: {
        handTileCodes: ['z1', 'z1']
      }
    }
  };
  const reaction = adapter.evaluateRuntimeReaction(runtime, 'bottom', [pengAction]);
  assert(reaction, 'expected AlphaJong core reaction decision');
  assert.strictEqual(reaction.type, 'call', `expected accepted AlphaJong core call, got ${reaction.type}`);
  assert(reaction.aiDecision, 'expected compact reaction aiDecision');
  assert.strictEqual(reaction.aiDecision.policyId, 'alphajong-core');
  assert(reaction.aiDecision.metrics, 'expected AlphaJong core call metrics');
  assert(
    Number.isFinite(Number(reaction.aiDecision.metrics.xiangting)),
    `expected next xiangting metric, got ${JSON.stringify(reaction.aiDecision.metrics)}`
  );
	  assert(reaction.aiDecision.hardCallMetrics, 'expected AlphaJong core hardCallMetrics for arena diagnostics');
	  assert.strictEqual(
	    reaction.aiDecision.hardCallMetrics.simulationOk,
	    true,
	    `expected AlphaJong call simulation to succeed, got ${JSON.stringify(reaction.aiDecision.hardCallMetrics)}`
	  );
	  assert(
	    Number.isFinite(Number(reaction.aiDecision.hardCallMetrics.currentXiangting))
	      && Number.isFinite(Number(reaction.aiDecision.hardCallMetrics.nextXiangting)),
    `expected current/next xiangting call metrics, got ${JSON.stringify(reaction.aiDecision.hardCallMetrics)}`
  );
  assert.strictEqual(
    reaction.aiDecision.hardCallMetrics.isYakuhaiPeng,
    true,
    `expected yakuhai peng marker, got ${JSON.stringify(reaction.aiDecision.hardCallMetrics)}`
  );
  assert(
    reaction.aiDecision.reasons.includes('alphajong-yakuhai-peng'),
    `expected yakuhai reason, got ${JSON.stringify(reaction.aiDecision.reasons)}`
  );
  assert(
    reaction.aiDecision.alphaJong
      && reaction.aiDecision.alphaJong.stateMemory
      && reaction.aiDecision.alphaJong.stateMemory.riichiTileCount >= 1,
    `expected call state memory diagnostics, got ${JSON.stringify(reaction.aiDecision.alphaJong)}`
  );
  console.log('[PASS] alphajong-core-adapter-smoke');
  console.log(`  snapshot=${JSON.stringify({
    rootDir: adapter.rootDir,
	    discard: {
	      tileCode: discard.tileCode,
	      shouldRiichi: discard.shouldRiichi,
	      riichiDiagnostics: discard.alphaJong.riichiDiagnostics
	    },
    reaction: {
      type: reaction.type,
      reasons: reaction.aiDecision.reasons,
      metrics: reaction.aiDecision.hardCallMetrics,
      stateMemory: reaction.aiDecision.alphaJong.stateMemory
    }
  })}`);
}

function assertCompactAdapterPayload(payload, label) {
  const text = JSON.stringify(payload);
  ['runtime', 'eventLog', 'stdout', 'stderr'].forEach((blocked) => {
    assert(!text.includes(blocked), `${label} should not contain ${blocked}`);
  });
}

function validateCoreKanAdapterSmoke() {
  const adapter = alphaJongAdapterApi.createAlphaJongAdapter({ mode: 'core' });
  assert(adapter.isAvailable(), `expected AlphaJong source to be available: ${adapter.getLoadError()}`);

  const selfRuntime = createFakeRuntime();
  selfRuntime.board.shoupai[0] = coreAdapter.createShoupaiFromString('z1111m123p456s789m1');
  selfRuntime.riichiState.bottom = { declared: true };
  const concealedKanAction = {
    type: 'kan',
    key: 'kan:bottom:self:0',
    payload: {
      seat: 'bottom',
      meld: 'z1111',
      meldString: 'z1111',
      kanType: 'kan-concealed'
    }
  };
  const turnDecision = adapter.evaluateRuntimeTurnAction(selfRuntime, 'bottom', [concealedKanAction]);
  assert(turnDecision, 'expected AlphaJong core self kan decision');
  assert.strictEqual(turnDecision.type, 'kan');
  assert(turnDecision.aiDecision && turnDecision.aiDecision.hardKanMetrics, 'expected compact self kan metrics');
  assert.strictEqual(turnDecision.aiDecision.hardKanMetrics.kanType, 'kan-concealed');
  assert.strictEqual(turnDecision.aiDecision.hardKanMetrics.operation, 'an_gang');
  assert(
    turnDecision.aiDecision.reasons.includes('alphajong-kan-accepted'),
    `expected kan accepted reason, got ${JSON.stringify(turnDecision.aiDecision.reasons)}`
  );
  assertCompactAdapterPayload(turnDecision.aiDecision, 'self kan decision');

  const reactionRuntime = createFakeRuntime();
  reactionRuntime.board.shoupai[0] = coreAdapter.createShoupaiFromString('z111m123p456s789m1');
  reactionRuntime.board.shoupai[0]._fulou.push('p123-');
  reactionRuntime.riichiState.bottom = { declared: true };
  const openKanAction = {
    type: 'kan',
    key: 'kan:bottom:0',
    payload: {
      seat: 'bottom',
      meld: 'z1111-',
      meldString: 'z1111-',
      tileCode: 'z1',
      fromSeat: 'right',
      preview: {
        handTileCodes: ['z1', 'z1', 'z1']
      }
    }
  };
  const reactionDecision = adapter.evaluateRuntimeReaction(reactionRuntime, 'bottom', [openKanAction]);
  assert(reactionDecision, 'expected AlphaJong core reaction kan decision');
  assert.strictEqual(reactionDecision.type, 'kan');
  assert(reactionDecision.aiDecision && reactionDecision.aiDecision.hardKanMetrics, 'expected compact reaction kan metrics');
  assert.strictEqual(reactionDecision.aiDecision.hardKanMetrics.kanType, 'kan-open');
  assert.strictEqual(reactionDecision.aiDecision.hardKanMetrics.operation, 'ming_gang');
  assertCompactAdapterPayload(reactionDecision.aiDecision, 'reaction kan decision');

  const declinedRuntime = createFakeRuntime();
  declinedRuntime.riichiState.bottom = { declared: false };
  const declinedReaction = adapter.evaluateRuntimeReaction(declinedRuntime, 'bottom', [openKanAction]);
  assert(declinedReaction, 'expected AlphaJong core rejected kan pass decision');
  assert.strictEqual(declinedReaction.type, 'pass');
  assert(
    declinedReaction.aiDecision
      && declinedReaction.aiDecision.alphaJong
      && declinedReaction.aiDecision.alphaJong.kanReview
      && declinedReaction.aiDecision.alphaJong.kanReview.accepted === false,
    `expected rejected kanReview pass payload, got ${JSON.stringify(declinedReaction)}`
  );
  assert(
    declinedReaction.aiDecision.reasons.includes('alphajong-kan-declined'),
    `expected kan declined reason, got ${JSON.stringify(declinedReaction.aiDecision.reasons)}`
  );
  assertCompactAdapterPayload(declinedReaction.aiDecision, 'declined kan pass decision');

  console.log('[PASS] alphajong-core-kan-adapter-smoke');
  console.log(`  snapshot=${JSON.stringify({
    selfKan: {
      reasons: turnDecision.aiDecision.reasons,
      metrics: turnDecision.aiDecision.hardKanMetrics
    },
    reactionKan: {
      reasons: reactionDecision.aiDecision.reasons,
      metrics: reactionDecision.aiDecision.hardKanMetrics
    },
    declinedKan: {
      reasons: declinedReaction.aiDecision.reasons,
      kanReview: declinedReaction.aiDecision.alphaJong.kanReview
    }
  })}`);
}

function validateStateFidelitySmoke() {
  const runtime = createFakeRuntime();
  const state = alphaJongAdapterApi.buildAlphaState(runtime, 'bottom');
  assert(state, 'expected AlphaJong state');
  assert(Array.isArray(state.riichiTiles), 'expected reconstructed riichi tile array');
  assert.strictEqual(
    alphaJongAdapterApi.fromAlphaTile(state.riichiTiles[2]),
    'm5',
    `expected top riichi declaration tile to map to relative index 2, got ${JSON.stringify(state.riichiTiles)}`
  );
  assert.strictEqual(state.riichi[2], true, `expected top riichi state, got ${JSON.stringify(state.riichi)}`);
  console.log('[PASS] alphajong-state-fidelity-smoke');
  console.log(`  snapshot=${JSON.stringify({
    riichi: state.riichi,
    riichiTiles: state.riichiTiles.map(alphaJongAdapterApi.fromAlphaTile)
  })}`);
}

function main() {
  validateVariantRegistration();
  validateTileMappingSmoke();
  validateStateFidelitySmoke();
  validateAdapterDiscardSmoke();
  validateCoreAdapterSmoke();
  validateCoreKanAdapterSmoke();
}

if (require.main === module) {
  main();
}

module.exports = {
  createFakeRuntime,
  validateVariantRegistration,
  validateTileMappingSmoke,
  validateStateFidelitySmoke,
  validateAdapterDiscardSmoke,
  validateCoreAdapterSmoke,
  validateCoreKanAdapterSmoke
};
