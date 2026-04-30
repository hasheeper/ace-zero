(function(global) {
  'use strict';

  const createCoreAdapter = global.AceMahjongCreateCoreAdapter;

  if (typeof createCoreAdapter !== 'function') {
    throw new Error('AceMahjongCreateCoreAdapter is required before browser-core-adapter.js');
  }

  function getMajiang() {
    if (!global.Majiang || !global.Majiang.Board || !global.Majiang.Shoupai || !global.Majiang.Util || !global.Majiang.Game) {
      throw new Error('Majiang core is not available in browser adapter.');
    }
    return global.Majiang;
  }

  global.AceMahjongBrowserCoreAdapter = createCoreAdapter(getMajiang);
})(window);
