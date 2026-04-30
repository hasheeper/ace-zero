(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.AceMahjongExtensionResults = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function mergeObject(base, patch) {
    if (!patch || typeof patch !== 'object') return base;
    return {
      ...(base && typeof base === 'object' ? base : {}),
      ...clone(patch)
    };
  }

  function mergeArray(base, patch) {
    if (!Array.isArray(patch)) return Array.isArray(base) ? base.slice() : [];
    return patch.slice();
  }

  function createEmptyHookResult(hookName) {
    switch (hookName) {
      case 'beforeRoundSetup':
        return { roundConfigPatch: {}, statePatch: {}, tags: [], metadata: {} };
      case 'beforeInitialDeal':
        return { initialHands: null, wallPatch: {}, deadWallTiles: null, metadata: {} };
      case 'afterInitialDeal':
        return { seatPatches: {}, statePatch: {}, metadata: {} };
      case 'beforeDraw':
        return { tileCode: null, source: null, metadata: {}, tags: [] };
      case 'afterDraw':
        return { statePatch: {}, metadata: {}, tags: [] };
      case 'modifyReactionCandidates':
        return { candidates: null, metadata: {}, tags: [] };
      case 'beforeBuildPlayerView':
        return { viewPatch: {}, visibilityPatch: {}, hints: [], metadata: {} };
      case 'beforeNextRoundConfigBuild':
        return { roundConfigPatch: {}, matchStatePatch: {}, metadata: {}, tags: [] };
      default:
        return { metadata: {} };
    }
  }

  function mergeHookResult(hookName, currentResult, nextPatch) {
    const result = currentResult ? clone(currentResult) : createEmptyHookResult(hookName);
    const patch = nextPatch && typeof nextPatch === 'object' ? nextPatch : null;
    if (!patch) return result;

    switch (hookName) {
      case 'beforeRoundSetup':
        result.roundConfigPatch = mergeObject(result.roundConfigPatch, patch.roundConfigPatch);
        result.statePatch = mergeObject(result.statePatch, patch.statePatch);
        result.tags = mergeArray(result.tags, result.tags.concat(Array.isArray(patch.tags) ? patch.tags : []));
        break;
      case 'beforeInitialDeal':
        if (Array.isArray(patch.initialHands)) result.initialHands = clone(patch.initialHands);
        result.wallPatch = mergeObject(result.wallPatch, patch.wallPatch);
        if (Array.isArray(patch.deadWallTiles)) result.deadWallTiles = patch.deadWallTiles.slice();
        break;
      case 'afterInitialDeal':
        result.seatPatches = mergeObject(result.seatPatches, patch.seatPatches);
        result.statePatch = mergeObject(result.statePatch, patch.statePatch);
        break;
      case 'beforeDraw':
        if (patch.tileCode != null) result.tileCode = patch.tileCode;
        if (patch.source != null) result.source = patch.source;
        result.tags = mergeArray(result.tags, result.tags.concat(Array.isArray(patch.tags) ? patch.tags : []));
        break;
      case 'afterDraw':
        result.statePatch = mergeObject(result.statePatch, patch.statePatch);
        result.tags = mergeArray(result.tags, result.tags.concat(Array.isArray(patch.tags) ? patch.tags : []));
        break;
      case 'modifyReactionCandidates':
        if (Array.isArray(patch.candidates)) result.candidates = clone(patch.candidates);
        result.tags = mergeArray(result.tags, result.tags.concat(Array.isArray(patch.tags) ? patch.tags : []));
        break;
      case 'beforeBuildPlayerView':
        result.viewPatch = mergeObject(result.viewPatch, patch.viewPatch);
        result.visibilityPatch = mergeObject(result.visibilityPatch, patch.visibilityPatch);
        result.hints = mergeArray(result.hints, result.hints.concat(Array.isArray(patch.hints) ? patch.hints : []));
        break;
      case 'beforeNextRoundConfigBuild':
        result.roundConfigPatch = mergeObject(result.roundConfigPatch, patch.roundConfigPatch);
        result.matchStatePatch = mergeObject(result.matchStatePatch, patch.matchStatePatch);
        result.tags = mergeArray(result.tags, result.tags.concat(Array.isArray(patch.tags) ? patch.tags : []));
        break;
      default:
        break;
    }

    result.metadata = mergeObject(result.metadata, patch.metadata);
    return result;
  }

  return {
    clone,
    createEmptyHookResult,
    mergeHookResult
  };
});
