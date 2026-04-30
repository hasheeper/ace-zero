'use strict';

const createBrowserGameSessionRuntime = require('../frontend/scripts/runtime/session/game-session-runtime');
const { createCoachController } = require('../engine/coach/review/coach-controller');
const { MjaiEventEncoder } = require('../engine/coach/mjai/event-encoder');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function createStubChildRuntime(runtimeConfig = {}) {
  const roundConfig = runtimeConfig && runtimeConfig.round ? runtimeConfig.round : {};
  const listeners = new Set();
  const runtime = {
    round: null,
    board: {
      zhuangfeng: Number.isInteger(roundConfig.zhuangfeng) ? roundConfig.zhuangfeng : 1,
      jushu: Number.isInteger(roundConfig.jushu) ? roundConfig.jushu : 3,
      changbang: Number.isInteger(roundConfig.changbang) ? roundConfig.changbang : 0,
      lizhibang: Number.isInteger(roundConfig.lizhibang) ? roundConfig.lizhibang : 0,
      defen: Array.isArray(roundConfig.defen) ? roundConfig.defen.slice() : [25000, 25000, 25000, 25000]
    },
    start() {},
    startSession() {},
    getWallState() {
      return { baopai: ['m1'] };
    },
    getPlayerIdentityIndex(seatKey) {
      return ['bottom', 'right', 'top', 'left'].indexOf(seatKey);
    },
    getSeatKeyByPlayerIdentity(playerId) {
      return ['bottom', 'right', 'top', 'left'][playerId] || null;
    },
    getDealerSeat() {
      return 'bottom';
    },
    getSeatHandCodes(seatKey) {
      const hands = {
        bottom: ['m1', 'm2', 'm3', 'p1', 'p2', 'p3', 's1', 's2', 's3', 'z1', 'z1', 'z2', 'z2'],
        right: ['m2', 'm3', 'm4', 'p2', 'p3', 'p4', 's2', 's3', 's4', 'z3', 'z3', 'z4', 'z4'],
        top: ['m4', 'm5', 'm6', 'p4', 'p5', 'p6', 's4', 's5', 's6', 'z5', 'z5', 'z6', 'z6'],
        left: ['m7', 'm8', 'm9', 'p7', 'p8', 'p9', 's7', 's8', 's9', 'z2', 'z2', 'z7', 'z7']
      };
      return (hands[seatKey] || hands.bottom).slice();
    },
    getSnapshot() {
      return {
        kind: 'stub-child-runtime'
      };
    },
    subscribe(listener) {
      if (typeof listener !== 'function') return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit(type, payload = {}, meta = {}) {
      const event = {
        type,
        payload,
        meta,
        snapshot: runtime.getSnapshot()
      };
      listeners.forEach((listener) => listener(event));
      return event;
    }
  };
  return runtime;
}

async function validateSessionRoundEndAndFinishEvents() {
  const sessionRuntime = createBrowserGameSessionRuntime({
    config: {
      mode: 'match',
      ruleset: 'riichi-4p',
      tableSize: 4,
      targetScore: 30000,
      round: {
        zhuangfeng: 1,
        jushu: 3
      }
    },
    createChildRuntime: () => createStubChildRuntime()
  });

  await sessionRuntime.startSession();

  const initialLog = sessionRuntime.getEventLog();
  assert(initialLog.length >= 1, 'expected session runtime to record at least one event on startSession');
  assert(initialLog[0].type === 'session:round-start', `expected first session event to be session:round-start, got ${JSON.stringify(initialLog[0])}`);

  const childRuntime = sessionRuntime.getRuntime();
  assert(childRuntime, 'expected session runtime to expose current child runtime');

  const roundResult = {
    type: 'hule',
    winnerSeat: 'bottom',
    fromSeat: 'right',
    scores: {
      bottom: 32000,
      right: 18000,
      top: 25000,
      left: 25000
    }
  };

  childRuntime.emit('round:hule', {
    roundResult
  });
  childRuntime.emit('round:end', {
    type: 'hule',
    roundResult
  });

  const sessionLog = sessionRuntime.getEventLog();
  const forwardedRoundEnd = sessionLog.find((event) => event && event.type === 'round:end');
  assert(forwardedRoundEnd, 'expected session runtime to forward child round:end event');
  assert(
    forwardedRoundEnd.payload && forwardedRoundEnd.payload.matchState,
    `expected forwarded round:end to include matchState, got ${JSON.stringify(forwardedRoundEnd)}`
  );

  await sessionRuntime.continueToNextRound();

  const lastEvent = sessionRuntime.getLastEvent();
  assert(lastEvent && lastEvent.type === 'session:finished', `expected session to finish after over-target hule, got ${JSON.stringify(lastEvent)}`);
  assert(
    lastEvent.payload && lastEvent.payload.finishReason === 'leader-over-target',
    `expected finishReason=leader-over-target, got ${JSON.stringify(lastEvent)}`
  );

  return {
    name: 'session-runtime-end-events-smoke',
    snapshot: {
      firstEventType: initialLog[0].type,
      forwardedRoundEndType: forwardedRoundEnd.type,
      finalEventType: lastEvent.type,
      finishReason: lastEvent.payload.finishReason
    }
  };
}

async function validateSessionCoachControllerBoundaryFlow() {
  const sessionRuntime = createBrowserGameSessionRuntime({
    config: {
      mode: 'match',
      ruleset: 'riichi-4p',
      tableSize: 4,
      targetScore: 30000,
      round: {
        zhuangfeng: 1,
        jushu: 3
      }
    },
    createChildRuntime: () => createStubChildRuntime()
  });

  await sessionRuntime.startSession();
  const controller = createCoachController(sessionRuntime, {
    perspectiveSeatKey: 'right'
  });

  controller.ensureBootstrap();
  let mjaiEvents = controller.getMjaiEvents();
  assert(mjaiEvents.length === 2, `expected session bootstrap to include start_game + start_kyoku, got ${JSON.stringify(mjaiEvents)}`);
  assert(mjaiEvents[0].type === 'start_game', `expected first session coach event to be start_game, got ${JSON.stringify(mjaiEvents[0])}`);
  assert(mjaiEvents[1].type === 'start_kyoku', `expected second session coach event to be start_kyoku, got ${JSON.stringify(mjaiEvents[1])}`);

  const childRuntime = sessionRuntime.getRuntime();
  const roundResult = {
    type: 'hule',
    winnerSeat: 'bottom',
    fromSeat: 'right',
    scores: {
      bottom: 32000,
      right: 18000,
      top: 25000,
      left: 25000
    }
  };

  childRuntime.emit('round:hule', {
    roundResult
  });
  childRuntime.emit('round:end', {
    type: 'hule',
    roundResult
  });

  await sessionRuntime.continueToNextRound();
  mjaiEvents = controller.syncNewEvents();

  assert(mjaiEvents.some((event) => event && event.type === 'end_kyoku'), `expected session coach stream to include end_kyoku, got ${JSON.stringify(mjaiEvents)}`);
  assert(mjaiEvents.some((event) => event && event.type === 'end_game'), `expected session coach stream to include end_game, got ${JSON.stringify(mjaiEvents)}`);

  return {
    name: 'session-coach-boundary-flow-smoke',
    snapshot: {
      eventTypes: mjaiEvents.map((event) => event.type)
    }
  };
}

async function validateSessionCoachNextRoundBootstrap() {
  const sessionRuntime = createBrowserGameSessionRuntime({
    config: {
      mode: 'match',
      ruleset: 'riichi-4p',
      tableSize: 4,
      targetScore: 35000,
      round: {
        zhuangfeng: 1,
        jushu: 3
      }
    },
    createChildRuntime: (runtimeConfig) => createStubChildRuntime(runtimeConfig)
  });

  await sessionRuntime.startSession();
  const controller = createCoachController(sessionRuntime, {
    perspectiveSeatKey: 'right'
  });

  controller.ensureBootstrap();

  const childRuntime = sessionRuntime.getRuntime();
  const roundResult = {
    type: 'hule',
    winnerSeat: 'bottom',
    fromSeat: 'right',
    scores: {
      bottom: 34000,
      right: 18000,
      top: 31000,
      left: 17000
    }
  };

  childRuntime.emit('round:hule', {
    roundResult
  });
  childRuntime.emit('round:end', {
    type: 'hule',
    roundResult
  });

  await sessionRuntime.continueToNextRound();
  const mjaiEvents = controller.syncNewEvents();
  const startKyokuEvents = mjaiEvents.filter((event) => event && event.type === 'start_kyoku');
  assert(startKyokuEvents.length === 2, `expected session coach stream to contain two start_kyoku events after non-terminal continue, got ${JSON.stringify(mjaiEvents)}`);
  assert(!mjaiEvents.some((event) => event && event.type === 'end_game'), `expected non-terminal continue to avoid end_game, got ${JSON.stringify(mjaiEvents)}`);

  const nextStartKyoku = startKyokuEvents[startKyokuEvents.length - 1];
  assert(nextStartKyoku.bakaze === 'W', `expected next round bakaze=W after west entry, got ${JSON.stringify(nextStartKyoku)}`);
  assert(nextStartKyoku.kyoku === 1, `expected next round kyoku=1 after west entry, got ${JSON.stringify(nextStartKyoku)}`);

  return {
    name: 'session-coach-next-round-bootstrap-smoke',
    snapshot: {
      eventTypes: mjaiEvents.map((event) => event.type),
      nextStartKyoku
    }
  };
}

function validateMjaiEncoderBoundaryEvents() {
  const encoder = new MjaiEventEncoder({
    board: {
      zhuangfeng: 0,
      jushu: 0,
      changbang: 0,
      lizhibang: 0
    },
    getWallState() {
      return { baopai: ['m1'] };
    }
  }, {
    perspectiveSeatKey: 'bottom',
    seatKeys: ['bottom', 'right', 'top', 'left']
  });

  const endKyoku = encoder.encodeEvent({
    type: 'round:end',
    payload: {
      roundResult: {
        type: 'hule'
      }
    }
  });
  assert(endKyoku.length === 1 && endKyoku[0].type === 'end_kyoku', `expected round:end to encode into end_kyoku, got ${JSON.stringify(endKyoku)}`);

  const endGame = encoder.encodeEvent({
    type: 'session:finished',
    payload: {
      finishReason: 'leader-over-target'
    }
  });
  assert(endGame.length === 1 && endGame[0].type === 'end_game', `expected session:finished to encode into end_game, got ${JSON.stringify(endGame)}`);

  return {
    name: 'mjai-encoder-boundary-events-smoke',
    snapshot: {
      endKyoku: endKyoku[0],
      endGame: endGame[0]
    }
  };
}

async function main() {
  const results = [
    await validateSessionRoundEndAndFinishEvents(),
    await validateSessionCoachControllerBoundaryFlow(),
    await validateSessionCoachNextRoundBootstrap(),
    validateMjaiEncoderBoundaryEvents()
  ];

  results.forEach((result) => {
    console.log(`[PASS] ${result.name}`);
    console.log(`  snapshot=${JSON.stringify(result.snapshot)}`);
  });
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
