/**
 * AceZero Texas runtime entry.
 *
 * Keep this as the only script loaded from core/runtime/. The implementation
 * files stay grouped by responsibility under foundation/, assets/, forces/,
 * ai/, and builtin/.
 */
(function(global) {
  'use strict';

  var files = [
    'foundation/role-runtime.js',
    'foundation/runtime-flow.js',
    'forces/force-runtime.js',
    'assets/asset-ledger.js',
    'assets/asset-deck-adapter.js',
    'ai/npc-role-director.js',
    'foundation/runtime-module-registry.js',
    'builtin/shared.js',
    'builtin/systems/eulalia.js',
    'builtin/systems/vv.js',
    'builtin/systems/poppy.js',
    'builtin/systems/kuzuha.js',
    'builtin/systems/trixie.js',
    'builtin/systems/cota.js',
    'builtin/systems/kako.js',
    'builtin/roles/kuzuha.js',
    'builtin/roles/trixie.js',
    'builtin/roles/kako.js',
    'builtin/profiles/eulalia.js',
    'builtin/profiles/sia.js',
    'builtin/profiles/rino.js',
    'builtin/profiles/vv.js',
    'builtin/profiles/cota.js',
    'builtin/index.js'
  ];

  function resolveBaseUrl() {
    var doc = global.document;
    var current = doc && doc.currentScript;
    if (current && current.src) return current.src.replace(/[^/]*$/, '');
    return '';
  }

  function isReady() {
    return !!(
      global.RoleRuntime &&
      global.RuntimeFlow &&
      global.ForceRuntime &&
      global.AssetLedger &&
      global.AssetDeckAdapter &&
      global.NpcRoleDirector &&
      global.RuntimeModuleRegistry &&
      global.AceBuiltinModules &&
      typeof global.AceBuiltinModules.registerBuiltinRoleModules === 'function'
    );
  }

  function appendScript(src) {
    return new Promise(function(resolve, reject) {
      var script = document.createElement('script');
      script.src = src;
      script.async = false;
      script.onload = resolve;
      script.onerror = function() {
        reject(new Error('Failed to load runtime script: ' + src));
      };
      (document.head || document.documentElement).appendChild(script);
    });
  }

  function loadDynamic(baseUrl) {
    var chain = Promise.resolve();
    files.forEach(function(file) {
      chain = chain.then(function() {
        return appendScript(baseUrl + file);
      });
    });
    global.AceTexasRuntimeReady = chain.then(function() {
      return {
        RoleRuntime: global.RoleRuntime,
        RuntimeFlow: global.RuntimeFlow,
        ForceRuntime: global.ForceRuntime,
        AssetLedger: global.AssetLedger,
        AssetDeckAdapter: global.AssetDeckAdapter,
        NpcRoleDirector: global.NpcRoleDirector,
        RuntimeModuleRegistry: global.RuntimeModuleRegistry,
        AceBuiltinModules: global.AceBuiltinModules
      };
    });
  }

  function loadParserBlocking(baseUrl) {
    files.forEach(function(file) {
      document.write('<script src="' + baseUrl + file + '"><\/script>');
    });
    global.AceTexasRuntimeReady = Promise.resolve(true);
  }

  if (isReady()) {
    global.AceTexasRuntimeReady = Promise.resolve(true);
    return;
  }

  var doc = global.document;
  var baseUrl = resolveBaseUrl();
  if (doc && doc.readyState === 'loading' && typeof doc.write === 'function') {
    loadParserBlocking(baseUrl);
  } else if (doc && typeof doc.createElement === 'function') {
    loadDynamic(baseUrl);
  } else if (global.console && typeof console.error === 'function') {
    console.error('[AceTexasRuntime] document is unavailable; runtime scripts were not loaded.');
  }
})(window);
