'use strict';

const ROUND_PHASES = Object.freeze({
  AWAIT_DRAW: 'await_draw',
  AWAIT_DISCARD: 'await_discard',
  AWAIT_REACTION: 'await_reaction',
  AWAIT_RESOLUTION: 'await_resolution',
  ROUND_END: 'round_end'
});

const VALID_PHASES = new Set(Object.values(ROUND_PHASES));

function normalizePhase(phase) {
  return VALID_PHASES.has(phase) ? phase : ROUND_PHASES.AWAIT_DRAW;
}

function createRoundStateMachine(initialPhase = ROUND_PHASES.AWAIT_DRAW) {
  let phase = normalizePhase(initialPhase);

  return {
    getPhase() {
      return phase;
    },
    setPhase(nextPhase) {
      phase = normalizePhase(nextPhase);
      return phase;
    },
    is(targetPhase) {
      return phase === targetPhase;
    },
    toJSON() {
      return {
        phase
      };
    }
  };
}

module.exports = {
  ROUND_PHASES,
  createRoundStateMachine,
  normalizePhase
};
