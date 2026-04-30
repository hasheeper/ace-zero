(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.AceMahjongExtensionContext = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function freezeIfPossible(value) {
    if (!value || typeof value !== 'object') return value;
    try {
      return Object.freeze(value);
    } catch (error) {
      return value;
    }
  }

  function createReadonlySnapshot(source) {
    return freezeIfPossible(clone(source || {}));
  }

  function createExtensionContext(hookName, payload = {}, options = {}) {
    const context = {
      hook: hookName || null,
      timestamp: Date.now(),
      tags: Array.isArray(options.tags) ? options.tags.slice() : [],
      debugSource: options.debugSource || null,
      ruleset: options.ruleset || null,
      advancedMode: Boolean(options.advancedMode),
      actorSeat: options.actorSeat || null,
      seatKeys: Array.isArray(options.seatKeys) ? options.seatKeys.slice() : null,
      matchState: createReadonlySnapshot(options.matchState),
      roundState: createReadonlySnapshot(options.roundState),
      wallState: createReadonlySnapshot(options.wallState),
      boardState: createReadonlySnapshot(options.boardState),
      presentation: createReadonlySnapshot(options.presentation),
      payload: createReadonlySnapshot(payload),
      meta: createReadonlySnapshot(options.meta)
    };

    return freezeIfPossible(context);
  }

  return {
    clone,
    createReadonlySnapshot,
    createExtensionContext
  };
});
