(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.AceMahjongExtensionHooks = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const HOOKS = {
    beforeRoundSetup: {
      id: 'beforeRoundSetup',
      stage: 'round-setup',
      category: 'truth',
      description: '在局配置正式落地前修改 round config、seed 或能力上下文。',
      returns: ['roundConfigPatch', 'statePatch', 'tags', 'metadata']
    },
    beforeInitialDeal: {
      id: 'beforeInitialDeal',
      stage: 'deal',
      category: 'truth',
      description: '在起手发牌前决定或偏置初始手牌、牌山和宝牌相关信息。',
      returns: ['initialHands', 'wallPatch', 'deadWallTiles', 'metadata']
    },
    afterInitialDeal: {
      id: 'afterInitialDeal',
      stage: 'deal',
      category: 'truth',
      description: '在起手发牌完成后对结果做最后微调或记录状态。',
      returns: ['seatPatches', 'statePatch', 'metadata']
    },
    beforeDraw: {
      id: 'beforeDraw',
      stage: 'draw',
      category: 'truth',
      description: '在摸牌前操控本次摸牌候选、来源或附加标签。',
      returns: ['tileCode', 'source', 'metadata', 'tags']
    },
    afterDraw: {
      id: 'afterDraw',
      stage: 'draw',
      category: 'truth',
      description: '在摸牌后记录或追加副作用，不改变已确认的摸牌真相。',
      returns: ['statePatch', 'metadata', 'tags']
    },
    modifyReactionCandidates: {
      id: 'modifyReactionCandidates',
      stage: 'reaction',
      category: 'truth',
      description: '修改当前反应窗口的 action 候选集、标签或可用性。',
      returns: ['candidates', 'metadata', 'tags']
    },
    beforeBuildPlayerView: {
      id: 'beforeBuildPlayerView',
      stage: 'view',
      category: 'view',
      description: '在构建玩家视图前调整可见信息、透视和提示层。',
      returns: ['viewPatch', 'visibilityPatch', 'hints', 'metadata']
    },
    beforeNextRoundConfigBuild: {
      id: 'beforeNextRoundConfigBuild',
      stage: 'match',
      category: 'truth',
      description: '在多局推进前修改下一局配置和局间 meta 状态。',
      returns: ['roundConfigPatch', 'matchStatePatch', 'metadata', 'tags']
    }
  };

  function getHookDefinition(hookName) {
    return HOOKS[hookName] || null;
  }

  function isKnownHook(hookName) {
    return Boolean(getHookDefinition(hookName));
  }

  function listHookNames() {
    return Object.keys(HOOKS);
  }

  return {
    HOOKS,
    getHookDefinition,
    isKnownHook,
    listHookNames
  };
});
