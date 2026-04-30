(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }

  root.AceMahjongDrawPolicy = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  function createNoOpDrawPolicy(options = {}) {
    return {
      id: options.id || 'noop-random',
      name: options.name || 'No-Op Random Draw Policy',
      beforeRoundStart() {
        return null;
      },
      chooseInitialHands() {
        return null;
      },
      chooseDraw() {
        return null;
      },
      chooseGangDraw() {
        return null;
      },
      afterInitialDeal() {
        return null;
      },
      afterDraw() {
        return null;
      },
      getDebugState() {
        return {
          id: this.id,
          name: this.name
        };
      }
    };
  }

  function createCompositeDrawPolicy(policies = []) {
    const normalizedPolicies = (policies || []).filter(Boolean);

    function runHook(hookName, payload) {
      for (const policy of normalizedPolicies) {
        if (!policy || typeof policy[hookName] !== 'function') continue;
        const result = policy[hookName](payload);
        if (result != null) return result;
      }
      return null;
    }

    return {
      id: 'composite',
      name: 'Composite Draw Policy',
      beforeRoundStart(payload) {
        return runHook('beforeRoundStart', payload);
      },
      chooseInitialHands(payload) {
        return runHook('chooseInitialHands', payload);
      },
      chooseDraw(payload) {
        return runHook('chooseDraw', payload);
      },
      chooseGangDraw(payload) {
        return runHook('chooseGangDraw', payload);
      },
      afterInitialDeal(payload) {
        return runHook('afterInitialDeal', payload);
      },
      afterDraw(payload) {
        return runHook('afterDraw', payload);
      },
      getDebugState() {
        return normalizedPolicies.map((policy) => {
          if (policy && typeof policy.getDebugState === 'function') {
            return policy.getDebugState();
          }
          return {
            id: policy && policy.id ? policy.id : 'unknown',
            name: policy && policy.name ? policy.name : 'Unknown Draw Policy'
          };
        });
      }
    };
  }

  function createScriptedDrawPolicy(options = {}) {
    const initialHands = Array.isArray(options.initialHands)
      ? options.initialHands.map((tiles) => Array.isArray(tiles) ? tiles.slice() : [])
      : null;
    const drawQueue = Array.isArray(options.draws) ? options.draws.slice() : [];
    const gangDrawQueue = Array.isArray(options.gangDraws) ? options.gangDraws.slice() : [];

    function shiftNext(queue) {
      return queue.length ? queue.shift() : null;
    }

    return {
      id: options.id || 'scripted-draw-policy',
      name: options.name || 'Scripted Draw Policy',
      chooseInitialHands() {
        if (!initialHands || !initialHands.length) return null;
        return {
          haipai: initialHands.map((tiles) => tiles.slice())
        };
      },
      chooseDraw() {
        return shiftNext(drawQueue);
      },
      chooseGangDraw() {
        return shiftNext(gangDrawQueue);
      },
      getDebugState() {
        return {
          id: this.id,
          name: this.name,
          initialHandsConfigured: Boolean(initialHands && initialHands.length),
          remainingDraws: drawQueue.slice(),
          remainingGangDraws: gangDrawQueue.slice()
        };
      }
    };
  }

  return {
    createNoOpDrawPolicy,
    createCompositeDrawPolicy,
    createScriptedDrawPolicy
  };
});
