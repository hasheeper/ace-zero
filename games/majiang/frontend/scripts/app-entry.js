(function(global) {
  'use strict';

  const entryScript = document.currentScript;
  const entryUrl = entryScript && entryScript.src
    ? entryScript.src
    : new URL('./frontend/scripts/app-entry.js', global.location && global.location.href ? global.location.href : 'http://localhost/').toString();

  const scriptPaths = [
    './debug/dev-log.js',
    './debug/debug-fixtures.js',
    './debug/debug-panel.js',
    './ui/settlement-view-model.js',
    './ui/settlement-panel.js',
    './ui/table-animations.js',
    './ui/runtime-status-overlay.js',
    './ui/table-interactions.js',
    './ui/table-renderer.js',
    './ui/app-shell.js',
    '../../majiang-core/dist/majiang-core.js',
    '../../shared/core/adapter-factory.js',
    '../../shared/core/round-continuation.js',
    '../../shared/runtime/support/view-factory.js',
    '../../engine/base/ruleset-profile.js',
    '../../engine/base/action-builder.js',
    '../../engine/ai/discard-evaluator.js',
    '../../engine/ai/base-ai.js',
    './runtime/browser-core-adapter.js',
    './runtime/formal/runtime-foundation.js',
    './runtime/formal/runtime-actions.js',
    './runtime/formal/runtime-shell.js',
    '../../engine/base/draw-policy.js',
    '../../engine/base/seat-topology.js',
    '../../engine/base/wall-service.js',
    '../../shared/runtime/rules/rules.js',
    '../../shared/runtime/reaction/post-reaction.js',
    '../../shared/runtime/state/round-state-support.js',
    '../../shared/runtime/rules/furiten.js',
    '../../shared/runtime/scoring/hule-gate.js',
    '../../shared/runtime/state/seat-status.js',
    '../../shared/runtime/rules/riichi-flow.js',
    '../../shared/runtime/state/draw-support.js',
    '../../shared/runtime/reaction/reaction-priority.js',
    '../../shared/runtime/reaction/reaction-candidates.js',
    '../../shared/runtime/reaction/reaction-flow.js',
    '../../shared/runtime/support/testing-setup.js',
    '../../shared/runtime/rules/kan.js',
    '../../shared/runtime/scoring/settlement.js',
    '../../shared/runtime/scoring/round-result.js',
    '../../shared/core/rule-config.js',
    '../../shared/match/match-state.js',
    '../../shared/core/transition-case-map.js',
    '../../shared/core/session-adapter.js',
    '../../shared/match/round-transition.js',
    './runtime/formal/runtime-core.js',
    './runtime/formal/runtime-factory.js',
    './runtime/session/game-session-runtime.js',
    './runtime/bridge/coach-context.js',
    './runtime/bridge/runtime-bridge.js',
    './runtime/bridge/coach-provider.js',
    './runtime/bridge/runtime-bootstrap.js',
    './runtime/bridge/browser-smoke-tests.js'
  ];

  function toAbsoluteUrl(path) {
    return new URL(path, entryUrl).toString();
  }

  function loadScript(path) {
    const src = toAbsoluteUrl(path);
    const existing = Array.from(document.querySelectorAll('script[src]')).find((node) => node.src === src);
    if (existing) {
      return Promise.resolve(existing);
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = false;
      script.onload = function() { resolve(script); };
      script.onerror = function() {
        reject(new Error(`Failed to load script: ${path}`));
      };
      document.body.appendChild(script);
    });
  }

  global.AceMahjongFrontendConfig = Object.assign({}, global.AceMahjongFrontendConfig || {}, {
    assetBase: '../../assets'
  });
  global.AceMahjongRuntimeAutoStart = false;
  global.AceMahjongGameConfigPath = './game-config.json';

  scriptPaths.reduce((chain, path) => (
    chain.then(() => loadScript(path))
  ), Promise.resolve()).catch((error) => {
    console.error('[AceMahjongAppEntry] bootstrap failed.', error);
  });
})(window);
