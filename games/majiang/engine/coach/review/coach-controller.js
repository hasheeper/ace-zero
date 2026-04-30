'use strict';

const { createMortalCoachAdapter } = require('../mortal/mortal-adapter');
const { buildCoachSuggestion } = require('./suggestion-format');

function createCoachController(runtime, options = {}) {
  if (!runtime) {
    throw new Error('createCoachController requires a runtime instance.');
  }

  const adapter = options.adapter || createMortalCoachAdapter(runtime, options);
  let bootstrapped = false;
  let eventCursor = 0;
  const mjaiEvents = [];
  let startedGame = false;
  let lastSuggestion = null;

  function isSessionRuntime(value) {
    return Boolean(value && typeof value.getRuntime === 'function' && typeof value.getEventLog === 'function');
  }

  function ensureBootstrap() {
    if (bootstrapped) return;
    mjaiEvents.push(...adapter.buildBootstrapEvents({
      includeStartGame: !startedGame
    }));
    startedGame = true;
    bootstrapped = true;
    eventCursor = 0;
  }

  function syncNewEvents() {
    ensureBootstrap();
    const eventLog = typeof runtime.getEventLog === 'function'
      ? runtime.getEventLog()
      : (Array.isArray(runtime.eventLog) ? runtime.eventLog : []);
    const newEvents = eventLog.slice(eventCursor);
    newEvents.forEach((event) => {
      if (isSessionRuntime(runtime) && event && event.type === 'session:round-start') {
        adapter.attachRuntime(runtime.getRuntime());
        mjaiEvents.push(...adapter.buildRoundBootstrapEvents());
        return;
      }
      mjaiEvents.push(...adapter.encodeEvent(event));
    });
    eventCursor = eventLog.length;
    return mjaiEvents.slice();
  }

  function requestSuggestion() {
    syncNewEvents();
    const inference = adapter.runInference(mjaiEvents);
    lastSuggestion = buildCoachSuggestion(inference, {
      source: 'mortal',
      perspectiveSeatKey: options.perspectiveSeatKey || 'bottom'
    });
    return inference;
  }

  return {
    adapter,
    ensureBootstrap,
    syncNewEvents,
    requestSuggestion,
    getSuggestionState() {
      return lastSuggestion ? JSON.parse(JSON.stringify(lastSuggestion)) : null;
    },
    getEventCursor() {
      return eventCursor;
    },
    getMjaiEvents() {
      return mjaiEvents.slice();
    }
  };
}

module.exports = {
  createCoachController
};
