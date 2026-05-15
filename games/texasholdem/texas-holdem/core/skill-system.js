/**
 * Core Module: SkillSystem
 *
 * Compatibility entry for the IIFE SkillSystem modules. Keep this file as the
 * only browser-facing script so existing static-page load order remains stable.
 */
(function (global) {
  'use strict';

  var files = [
    'catalog.js',
    'core-state.js',
    'state-runtime.js',
    'availability.js',
    'registration.js',
    'mana.js',
    'activation-npc.js',
    'forces-effects.js',
    'lifecycle-state.js',
    'exports.js'
  ];

  function resolveBaseUrl() {
    var doc = global.document;
    var current = doc && doc.currentScript;
    if (current && current.src) return current.src.replace(/[^/]*$/, '');
    return '';
  }

  function modulePath(file) {
    return 'skill-system/' + file;
  }

  function isReady() {
    return !!(global.SkillSystem && global.SkillSystem.lookupSkill);
  }

  function loadWithHook() {
    if (typeof global.__aceSkillSystemLoad !== 'function') return false;
    for (var i = 0; i < files.length; i++) {
      global.__aceSkillSystemLoad(modulePath(files[i]));
    }
    global.AceSkillSystemReady = Promise.resolve(global.SkillSystem);
    return true;
  }

  function appendScript(src) {
    return new Promise(function(resolve, reject) {
      var script = document.createElement('script');
      script.src = src;
      script.async = false;
      script.onload = resolve;
      script.onerror = function() {
        reject(new Error('Failed to load skill-system script: ' + src));
      };
      (document.head || document.documentElement).appendChild(script);
    });
  }

  function loadDynamic(baseUrl) {
    var chain = Promise.resolve();
    files.forEach(function(file) {
      chain = chain.then(function() {
        return appendScript(baseUrl + modulePath(file));
      });
    });
    global.AceSkillSystemReady = chain.then(function() {
      return global.SkillSystem;
    });
  }

  function loadParserBlocking(baseUrl) {
    files.forEach(function(file) {
      document.write('<script src="' + baseUrl + modulePath(file) + '"><\/script>');
    });
  }

  if (isReady()) {
    global.AceSkillSystemReady = Promise.resolve(global.SkillSystem);
    return;
  }

  if (loadWithHook()) return;

  var doc = global.document;
  var baseUrl = resolveBaseUrl();
  if (doc && doc.readyState === 'loading' && typeof doc.write === 'function') {
    loadParserBlocking(baseUrl);
  } else if (doc && typeof doc.createElement === 'function') {
    loadDynamic(baseUrl);
  } else if (global.console && typeof console.error === 'function') {
    console.error('[SkillSystem] document is unavailable and no __aceSkillSystemLoad hook was provided.');
  }
})(typeof window !== 'undefined' ? window : global);
