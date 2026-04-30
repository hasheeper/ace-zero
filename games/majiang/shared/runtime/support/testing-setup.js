(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.AceMahjongCreateRuntimeTestingSetupHelpers = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  function createDefaultDeadWallTiles() {
    return ['m1', 'm1', 'm2', 'm2', 'm3', 'm3', 'p1', 'p1', 'p2', 'p2', 's1', 's1', 'z1', 'z1'];
  }

  function applyTestingRuntimeSetup(runtime, setup = {}) {
    if (!setup || typeof setup !== 'object') return;
    const shan = runtime && runtime.board ? runtime.board.shan : null;
    if (!shan) return;

    const wallService = runtime && runtime.wallService && typeof runtime.wallService.getState === 'function'
      ? runtime.wallService
      : null;
    const serviceState = wallService ? wallService.getState() : null;
    const deadWallSize = serviceState && Number.isFinite(Number(serviceState.deadWallSize))
      ? Number(serviceState.deadWallSize)
      : 14;
    const hasCustomDeadWall = Array.isArray(setup.deadWallTiles) && setup.deadWallTiles.length >= deadWallSize;
    const deadWallTiles = hasCustomDeadWall
      ? setup.deadWallTiles.slice(0, deadWallSize)
      : createDefaultDeadWallTiles();

    if (Array.isArray(setup.liveWallTiles)) {
      shan._pai = deadWallTiles.concat(setup.liveWallTiles.slice().reverse());
      shan._baopai = [deadWallTiles[4]].filter(Boolean);
      shan._fubaopai = shan._fubaopai ? [deadWallTiles[9]].filter(Boolean) : null;
    } else if (hasCustomDeadWall && Array.isArray(shan._pai) && shan._pai.length >= deadWallSize) {
      shan._pai = deadWallTiles.concat(shan._pai.slice(deadWallSize));
      shan._baopai = [deadWallTiles[4]].filter(Boolean);
      shan._fubaopai = shan._fubaopai ? [deadWallTiles[9]].filter(Boolean) : null;
    }

    if (typeof setup.weikaigang === 'boolean') {
      shan._weikaigang = setup.weikaigang;
    }
  }

  function createRuntimeTestingSetupHelpers() {
    return {
      createDefaultDeadWallTiles,
      applyTestingRuntimeSetup
    };
  }

  createRuntimeTestingSetupHelpers.createDefaultDeadWallTiles = createDefaultDeadWallTiles;
  createRuntimeTestingSetupHelpers.applyTestingRuntimeSetup = applyTestingRuntimeSetup;

  return createRuntimeTestingSetupHelpers;
});
