'use strict';

const fs = require('fs');
const path = require('path');

const { SingleRoundRuntime } = require('../engine/runtime/single-round-runtime');
const { createScriptedDrawPolicy } = require('../engine/base/draw-policy');
const baseAiApi = require('../engine/ai/base-ai');
const { createMortalCoachAdapter } = require('../engine/coach/mortal/mortal-adapter');
const { createCoachController } = require('../engine/coach/review/coach-controller');
const { buildCoachSuggestion } = require('../engine/coach/review/suggestion-format');

const SMOKE_CONFIG_PATH = path.join(__dirname, '..', '..', 'third_party', 'Mortal', 'mortal', 'config.smoke.toml');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function createRuntimeFromConfig(config) {
  const scripted = config
    && config.engine
    && config.engine.wall
    && config.engine.wall.scripted
    && typeof config.engine.wall.scripted === 'object'
      ? config.engine.wall.scripted
      : null;
  const drawPolicy = scripted ? createScriptedDrawPolicy(scripted) : null;
  return new SingleRoundRuntime({
    ...config,
    drawPolicy
  });
}

function getReactionActionsForSeat(runtime, seatKey) {
  return runtime && runtime.pendingReaction && Array.isArray(runtime.pendingReaction.actions)
    ? runtime.pendingReaction.actions.filter((action) => (
        action
        && action.payload
        && action.payload.seat === seatKey
      ))
    : [];
}

function createAiController(runtime, config) {
  return baseAiApi.createAiController(runtime, config);
}

function getNewEventByType(runtime, previousCount, type) {
  const newEvents = Array.isArray(runtime.eventLog)
    ? runtime.eventLog.slice(previousCount)
    : [];
  return newEvents.find((event) => event && event.type === type) || null;
}

function runEncodingSmoke(cwd) {
  const configPath = path.join(cwd, 'test', 'game-config.ai-easy-call-smoke.json');
  const config = loadJson(configPath);
  const runtime = createRuntimeFromConfig(config);
  const adapter = createMortalCoachAdapter(runtime, {
    perspectiveSeatKey: 'right',
    configPath: SMOKE_CONFIG_PATH
  });
  const aiController = createAiController(runtime, config);

  runtime.start();

  const bootstrapEvents = adapter.buildBootstrapEvents();
  assert(Array.isArray(bootstrapEvents) && bootstrapEvents.length === 2, 'expected 2 bootstrap events');
  assert(bootstrapEvents[0].type === 'start_game', `expected first bootstrap event to be start_game, got ${JSON.stringify(bootstrapEvents[0])}`);
  assert(bootstrapEvents[1].type === 'start_kyoku', `expected second bootstrap event to be start_kyoku, got ${JSON.stringify(bootstrapEvents[1])}`);

  const startKyoku = bootstrapEvents[1];
  assert(Array.isArray(startKyoku.tehais) && startKyoku.tehais.length === 4, 'expected 4 tehais entries');
  assert(
    Array.isArray(startKyoku.tehais[1]) && startKyoku.tehais[1].every((tile) => tile !== '?'),
    `expected right seat hand to be visible, got ${JSON.stringify(startKyoku.tehais[1])}`
  );
  assert(
    Array.isArray(startKyoku.tehais[0]) && startKyoku.tehais[0].every((tile) => tile === '?'),
    `expected bottom seat hand to be masked, got ${JSON.stringify(startKyoku.tehais[0])}`
  );

  let previousEventCount = runtime.eventLog.length;
  runtime.drawTile('bottom');
  const drawEvents = adapter.encodeEvent(getNewEventByType(runtime, previousEventCount, 'tile:draw'));
  assert(drawEvents.length === 1 && drawEvents[0].type === 'tsumo', `expected draw event to encode to tsumo, got ${JSON.stringify(drawEvents)}`);
  assert(drawEvents[0].actor === 0, `expected bottom actor id to be 0, got ${JSON.stringify(drawEvents[0])}`);
  assert(drawEvents[0].pai === '?', `expected hidden bottom draw tile, got ${JSON.stringify(drawEvents[0])}`);

  previousEventCount = runtime.eventLog.length;
  runtime.discardTile('bottom', 'm4');
  const discardEvents = adapter.encodeEvent(getNewEventByType(runtime, previousEventCount, 'tile:discard'));
  assert(discardEvents.length === 1 && discardEvents[0].type === 'dahai', `expected discard event to encode to dahai, got ${JSON.stringify(discardEvents)}`);
  assert(discardEvents[0].pai === '4m', `expected discard tile 4m, got ${JSON.stringify(discardEvents[0])}`);

  const rightActions = getReactionActionsForSeat(runtime, 'right');
  const decision = aiController.chooseReaction('right', rightActions);
  assert(decision && decision.type === 'call', `expected right AI to choose call, got ${JSON.stringify(decision)}`);

  previousEventCount = runtime.eventLog.length;
  runtime.dispatch(decision);
  const callEvents = adapter.encodeEvent(getNewEventByType(runtime, previousEventCount, 'meld:call'));
  assert(callEvents.length === 1, `expected one encoded call event, got ${JSON.stringify(callEvents)}`);
  assert(callEvents[0].type === 'chi', `expected chi event, got ${JSON.stringify(callEvents[0])}`);
  assert(callEvents[0].actor === 1, `expected right actor id to be 1, got ${JSON.stringify(callEvents[0])}`);
  assert(callEvents[0].target === 0, `expected bottom target id to be 0, got ${JSON.stringify(callEvents[0])}`);
  assert(callEvents[0].pai === '4m', `expected claimed tile 4m, got ${JSON.stringify(callEvents[0])}`);
  assert(
    JSON.stringify(callEvents[0].consumed) === JSON.stringify(['2m', '3m']),
    `expected consumed chi tiles to be [2m,3m], got ${JSON.stringify(callEvents[0])}`
  );

  return {
    name: 'mjai-bridge-encoding-smoke',
    snapshot: {
      bootstrap: startKyoku,
      draw: drawEvents[0],
      discard: discardEvents[0],
      call: callEvents[0]
    }
  };
}

function runInferenceSmoke(cwd) {
  const configPath = path.join(cwd, 'test', 'game-config.ai-easy-call-smoke.json');
  const config = loadJson(configPath);
  const runtime = createRuntimeFromConfig(config);
  const adapter = createMortalCoachAdapter(runtime, {
    perspectiveSeatKey: 'right',
    configPath: SMOKE_CONFIG_PATH
  });
  const aiController = createAiController(runtime, config);

  runtime.start();
  const mjaiEvents = adapter.buildBootstrapEvents();

  let previousEventCount = runtime.eventLog.length;
  runtime.drawTile('bottom');
  mjaiEvents.push(...adapter.encodeEvent(getNewEventByType(runtime, previousEventCount, 'tile:draw')));

  previousEventCount = runtime.eventLog.length;
  runtime.discardTile('bottom', 'm4');
  mjaiEvents.push(...adapter.encodeEvent(getNewEventByType(runtime, previousEventCount, 'tile:discard')));

  const rightActions = getReactionActionsForSeat(runtime, 'right');
  const decision = aiController.chooseReaction('right', rightActions);
  assert(decision && decision.type === 'call', `expected right AI to choose chi before inference, got ${JSON.stringify(decision)}`);

  previousEventCount = runtime.eventLog.length;
  runtime.dispatch(decision);
  mjaiEvents.push(...adapter.encodeEvent(getNewEventByType(runtime, previousEventCount, 'meld:call')));

  const inference = adapter.runInference(mjaiEvents);
  assert(inference.ok, `expected Mortal inference to succeed, stderr=${inference.stderr || '<empty>'}`);
  assert(Array.isArray(inference.lines) && inference.lines.length > 0, 'expected Mortal to return at least one output line');

  const lastDecoded = inference.decoded[inference.decoded.length - 1];
  assert(lastDecoded && lastDecoded.type === 'discard', `expected last decoded action to be discard, got ${JSON.stringify(lastDecoded)}`);
  assert(
    lastDecoded.runtimeAction
      && lastDecoded.runtimeAction.type === 'discard'
      && lastDecoded.runtimeAction.payload
      && lastDecoded.runtimeAction.payload.seat === 'right',
    `expected decoded runtime action to discard for right seat, got ${JSON.stringify(lastDecoded)}`
  );

  return {
    name: 'mjai-bridge-mortal-smoke',
    snapshot: {
      eventCount: mjaiEvents.length,
      lastOutputLine: inference.lines[inference.lines.length - 1],
      decoded: lastDecoded
    }
  };
}

function runPonEncodingSmoke(cwd) {
  const configPath = path.join(cwd, 'test', 'game-config.ai-easy-yakuhai-call-smoke.json');
  const config = loadJson(configPath);
  const runtime = createRuntimeFromConfig(config);
  const adapter = createMortalCoachAdapter(runtime, {
    perspectiveSeatKey: 'right',
    configPath: SMOKE_CONFIG_PATH
  });
  const aiController = createAiController(runtime, config);

  runtime.start();
  adapter.buildBootstrapEvents();

  let previousEventCount = runtime.eventLog.length;
  runtime.drawTile('bottom');
  adapter.encodeEvent(getNewEventByType(runtime, previousEventCount, 'tile:draw'));

  previousEventCount = runtime.eventLog.length;
  runtime.discardTile('bottom', 'z7');
  const discardEvents = adapter.encodeEvent(getNewEventByType(runtime, previousEventCount, 'tile:discard'));
  assert(discardEvents.length === 1 && discardEvents[0].pai === 'C', `expected peng smoke discard tile C, got ${JSON.stringify(discardEvents)}`);

  const rightActions = getReactionActionsForSeat(runtime, 'right');
  const decision = aiController.chooseReaction('right', rightActions);
  assert(decision && decision.type === 'call', `expected right AI to choose peng call, got ${JSON.stringify(decision)}`);

  previousEventCount = runtime.eventLog.length;
  runtime.dispatch(decision);
  const callEvents = adapter.encodeEvent(getNewEventByType(runtime, previousEventCount, 'meld:call'));
  assert(callEvents.length === 1 && callEvents[0].type === 'pon', `expected pon event, got ${JSON.stringify(callEvents)}`);
  assert(callEvents[0].actor === 1, `expected right actor id to be 1, got ${JSON.stringify(callEvents[0])}`);
  assert(callEvents[0].target === 0, `expected bottom target id to be 0, got ${JSON.stringify(callEvents[0])}`);
  assert(callEvents[0].pai === 'C', `expected claimed tile C, got ${JSON.stringify(callEvents[0])}`);
  assert(
    JSON.stringify(callEvents[0].consumed) === JSON.stringify(['C', 'C']),
    `expected consumed pon tiles to be [C,C], got ${JSON.stringify(callEvents[0])}`
  );

  return {
    name: 'mjai-bridge-pon-encoding-smoke',
    snapshot: {
      discard: discardEvents[0],
      call: callEvents[0]
    }
  };
}

function runDecoderProtocolSmoke(cwd) {
  const configPath = path.join(cwd, 'test', 'game-config.ai-easy-call-smoke.json');
  const config = loadJson(configPath);
  const runtime = createRuntimeFromConfig(config);
  const adapter = createMortalCoachAdapter(runtime, {
    perspectiveSeatKey: 'right',
    configPath: SMOKE_CONFIG_PATH
  });

  runtime.start();
  adapter.buildBootstrapEvents();

  const reachIntent = adapter.decoder.decode({
    type: 'reach',
    actor: 1
  });
  assert(reachIntent && reachIntent.type === 'reach-intent', `expected reach-intent, got ${JSON.stringify(reachIntent)}`);

  const riichiDiscard = adapter.decoder.decode({
    type: 'dahai',
    actor: 1,
    pai: '3s',
    tsumogiri: false
  });
  assert(
    riichiDiscard
      && riichiDiscard.runtimeAction
      && riichiDiscard.runtimeAction.payload
      && riichiDiscard.runtimeAction.payload.riichi === true,
    `expected dahai after reach to carry riichi=true, got ${JSON.stringify(riichiDiscard)}`
  );

  const ponCall = adapter.decoder.decode({
    type: 'pon',
    actor: 1,
    target: 0,
    pai: 'C',
    consumed: ['C', 'C']
  });
  assert(
    ponCall
      && ponCall.runtimeAction
      && ponCall.runtimeAction.payload
      && ponCall.runtimeAction.payload.callType === 'peng'
      && /^z777[\+\=\-]$/.test(ponCall.runtimeAction.payload.meldString),
    `expected pon to decode into local peng meld, got ${JSON.stringify(ponCall)}`
  );

  const hora = adapter.decoder.decode({
    type: 'hora',
    actor: 1,
    target: 0
  });
  assert(
    hora
      && hora.runtimeAction
      && hora.runtimeAction.type === 'hule'
      && hora.runtimeAction.payload
      && hora.runtimeAction.payload.seat === 'right'
      && hora.runtimeAction.payload.fromSeat === 'bottom',
    `expected hora to decode into hule action, got ${JSON.stringify(hora)}`
  );

  const ryukyoku = adapter.decoder.decode({
    type: 'ryukyoku',
    deltas: [-1500, 1500, 0, 0]
  });
  assert(
    ryukyoku
      && ryukyoku.runtimeAction
      && ryukyoku.runtimeAction.type === 'draw-round',
    `expected ryukyoku to decode into draw-round action, got ${JSON.stringify(ryukyoku)}`
  );

  const daiminkan = adapter.decoder.decode({
    type: 'daiminkan',
    actor: 1,
    target: 0,
    pai: 'C',
    consumed: ['C', 'C', 'C']
  });
  assert(
    daiminkan
      && daiminkan.runtimeAction
      && daiminkan.runtimeAction.type === 'kan'
      && daiminkan.runtimeAction.payload
      && daiminkan.runtimeAction.payload.meldString === 'z7777-',
    `expected daiminkan to decode into local open kan meld, got ${JSON.stringify(daiminkan)}`
  );

  const kakan = adapter.decoder.decode({
    type: 'kakan',
    actor: 1,
    pai: 'S',
    consumed: ['S', 'S', 'S']
  });
  assert(
    kakan
      && kakan.runtimeAction
      && kakan.runtimeAction.payload
      && kakan.runtimeAction.payload.meldString === 'z222-2',
    `expected kakan to decode into local added kan meld, got ${JSON.stringify(kakan)}`
  );

  const ankan = adapter.decoder.decode({
    type: 'ankan',
    actor: 1,
    consumed: ['9m', '9m', '9m', '9m']
  });
  assert(
    ankan
      && ankan.runtimeAction
      && ankan.runtimeAction.payload
      && ankan.runtimeAction.payload.meldString === 'm9999',
    `expected ankan to decode into local concealed kan meld, got ${JSON.stringify(ankan)}`
  );

  const dora = adapter.decoder.decode({
    type: 'dora',
    dora_marker: '3s'
  });
  assert(
    dora
      && dora.runtimeAction
      && dora.runtimeAction.type === 'flip-dora'
      && dora.runtimeAction.payload
      && dora.runtimeAction.payload.tileCode === 's3',
    `expected dora to decode into flip-dora action, got ${JSON.stringify(dora)}`
  );

  const reachAccepted = adapter.decoder.decode({
    type: 'reach_accepted',
    actor: 1
  });
  assert(
    reachAccepted
      && reachAccepted.type === 'reach-accepted'
      && reachAccepted.runtimeAction == null,
    `expected reach_accepted to decode as meta-only, got ${JSON.stringify(reachAccepted)}`
  );

  return {
    name: 'mjai-bridge-decoder-protocol-smoke',
    snapshot: {
      riichiDiscard: riichiDiscard.runtimeAction,
      ponCall: ponCall.runtimeAction,
      hora: hora.runtimeAction,
      ryukyoku: ryukyoku.runtimeAction,
      daiminkan: daiminkan.runtimeAction,
      kakan: kakan.runtimeAction,
      ankan: ankan.runtimeAction,
      dora: dora.runtimeAction
    }
  };
}

function runTerminalEncodingSmoke(cwd) {
  const configPath = path.join(cwd, 'test', 'game-config.ai-easy-call-smoke.json');
  const config = loadJson(configPath);
  const runtime = createRuntimeFromConfig(config);
  const adapter = createMortalCoachAdapter(runtime, {
    perspectiveSeatKey: 'right',
    configPath: SMOKE_CONFIG_PATH
  });

  runtime.start();
  adapter.buildBootstrapEvents();

  const horaEvents = adapter.encodeEvent({
    type: 'round:hule',
    payload: {
      roundResult: {
        winnerSeat: 'right',
        fromSeat: 'bottom',
        scores: {
          bottom: 21000,
          right: 29000,
          top: 25000,
          left: 25000
        }
      }
    }
  });
  assert(horaEvents.length === 1 && horaEvents[0].type === 'hora', `expected hora event, got ${JSON.stringify(horaEvents)}`);
  assert(horaEvents[0].actor === 1 && horaEvents[0].target === 0, `expected hora actor=1,target=0, got ${JSON.stringify(horaEvents[0])}`);
  assert(
    JSON.stringify(horaEvents[0].deltas) === JSON.stringify([-4000, 4000, 0, 0]),
    `expected hora deltas [-4000,4000,0,0], got ${JSON.stringify(horaEvents[0])}`
  );

  const ryukyokuEvents = adapter.encodeEvent({
    type: 'round:draw',
    payload: {
      roundResult: {
        scores: {
          bottom: 19500,
          right: 30500,
          top: 25000,
          left: 25000
        }
      }
    }
  });
  assert(ryukyokuEvents.length === 1 && ryukyokuEvents[0].type === 'ryukyoku', `expected ryukyoku event, got ${JSON.stringify(ryukyokuEvents)}`);
  assert(
    JSON.stringify(ryukyokuEvents[0].deltas) === JSON.stringify([-1500, 1500, 0, 0]),
    `expected ryukyoku deltas [-1500,1500,0,0], got ${JSON.stringify(ryukyokuEvents[0])}`
  );

  const doraEvents = adapter.encodeEvent({
    type: 'dora:flip',
    payload: {
      tileCode: 's3'
    }
  });
  assert(
    doraEvents.length === 1 && doraEvents[0].type === 'dora' && doraEvents[0].dora_marker === '3s',
    `expected dora flip to encode into mjai dora, got ${JSON.stringify(doraEvents)}`
  );

  adapter.encodeEvent({
    type: 'tile:discard',
    payload: {
      seat: 'bottom',
      tileCode: 'z7',
      riichi: false
    }
  });
  const daiminkanEvents = adapter.encodeEvent({
    type: 'meld:kan',
    payload: {
      seat: 'right',
      meld: 'z7777-',
      kanType: 'kan-open'
    }
  });
  assert(
    daiminkanEvents.length === 1
      && daiminkanEvents[0].type === 'daiminkan'
      && daiminkanEvents[0].pai === 'C'
      && JSON.stringify(daiminkanEvents[0].consumed) === JSON.stringify(['C', 'C', 'C']),
    `expected local open kan to encode into daiminkan, got ${JSON.stringify(daiminkanEvents)}`
  );

  const kakanEvents = adapter.encodeEvent({
    type: 'meld:kan',
    payload: {
      seat: 'right',
      meld: 'z222-2',
      kanType: 'kan-added'
    }
  });
  assert(
    kakanEvents.length === 1
      && kakanEvents[0].type === 'kakan'
      && kakanEvents[0].pai === 'S'
      && JSON.stringify(kakanEvents[0].consumed) === JSON.stringify(['S', 'S', 'S']),
    `expected local added kan to encode into kakan, got ${JSON.stringify(kakanEvents)}`
  );

  const ankanEvents = adapter.encodeEvent({
    type: 'meld:kan',
    payload: {
      seat: 'right',
      meld: 'm9999',
      kanType: 'kan-concealed'
    }
  });
  assert(
    ankanEvents.length === 1
      && ankanEvents[0].type === 'ankan'
      && JSON.stringify(ankanEvents[0].consumed) === JSON.stringify(['9m', '9m', '9m', '9m']),
    `expected local concealed kan to encode into ankan, got ${JSON.stringify(ankanEvents)}`
  );

  return {
    name: 'mjai-bridge-terminal-encoding-smoke',
    snapshot: {
      hora: horaEvents[0],
      ryukyoku: ryukyokuEvents[0],
      dora: doraEvents[0],
      daiminkan: daiminkanEvents[0],
      kakan: kakanEvents[0],
      ankan: ankanEvents[0]
    }
  };
}

function runCoachControllerSmoke(cwd) {
  const configPath = path.join(cwd, 'test', 'game-config.ai-easy-call-smoke.json');
  const config = loadJson(configPath);
  const runtime = createRuntimeFromConfig(config);
  const controller = createCoachController(runtime, {
    perspectiveSeatKey: 'right',
    configPath: SMOKE_CONFIG_PATH
  });

  runtime.start();
  controller.ensureBootstrap();
  assert(controller.getMjaiEvents().length === 2, `expected bootstrap to yield 2 mjai events, got ${controller.getMjaiEvents().length}`);

  runtime.drawTile('bottom');
  runtime.discardTile('bottom', 'm4');
  const syncedEvents = controller.syncNewEvents();
  assert(syncedEvents.length >= 4, `expected synced mjai events to include tsumo/dahai, got ${JSON.stringify(syncedEvents)}`);

  const suggestion = controller.requestSuggestion();
  assert(suggestion.ok, `expected controller suggestion to succeed, stderr=${suggestion.stderr || '<empty>'}`);
  assert(Array.isArray(suggestion.decoded) && suggestion.decoded.length > 0, 'expected controller suggestion to include decoded actions');

  const lastDecoded = suggestion.decoded[suggestion.decoded.length - 1];
  assert(lastDecoded && lastDecoded.runtimeAction, `expected controller to decode runtime action, got ${JSON.stringify(lastDecoded)}`);
  const suggestionState = controller.getSuggestionState();
  assert(suggestionState && suggestionState.status === 'ready', `expected controller suggestion state to be ready, got ${JSON.stringify(suggestionState)}`);
  assert(
    suggestionState.recommended && suggestionState.recommended.seat === 'right',
    `expected controller suggestion state to target right seat, got ${JSON.stringify(suggestionState)}`
  );

  return {
    name: 'mjai-bridge-coach-controller-smoke',
    snapshot: {
      eventCursor: controller.getEventCursor(),
      mjaiEventCount: controller.getMjaiEvents().length,
      lastDecoded,
      suggestionState
    }
  };
}

function runCoachSuggestionFormatSmoke() {
  const formatted = buildCoachSuggestion({
    ok: true,
    lines: ['{"type":"dahai","actor":1,"pai":"3s","tsumogiri":false}'],
    stderr: '',
    decoded: [{
      type: 'discard',
      runtimeAction: {
        type: 'discard',
        payload: {
          seat: 'right',
          tileCode: 's3',
          riichi: false
        }
      },
      raw: {
        type: 'dahai',
        actor: 1,
        pai: '3s',
        tsumogiri: false
      }
    }]
  }, {
    source: 'mortal',
    perspectiveSeatKey: 'right'
  });

  assert(formatted.status === 'ready', `expected formatted suggestion status ready, got ${JSON.stringify(formatted)}`);
  assert(
    formatted.recommended
      && formatted.recommended.type === 'discard'
      && formatted.recommended.seat === 'right'
      && formatted.recommended.tileCode === 's3',
    `expected formatted suggestion to summarize discard s3, got ${JSON.stringify(formatted)}`
  );

  return {
    name: 'mjai-bridge-suggestion-format-smoke',
    snapshot: formatted
  };
}

function main() {
  const cwd = path.resolve(__dirname, '..');
  const results = [
    runEncodingSmoke(cwd),
    runPonEncodingSmoke(cwd),
    runDecoderProtocolSmoke(cwd),
    runTerminalEncodingSmoke(cwd),
    runCoachSuggestionFormatSmoke(),
    runCoachControllerSmoke(cwd),
    runInferenceSmoke(cwd)
  ];

  results.forEach((result) => {
    console.log(`[PASS] ${result.name}`);
    console.log(`  snapshot=${JSON.stringify(result.snapshot)}`);
  });
}

main();
