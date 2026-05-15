/**
 * Poker AI module namespace.
 *
 * Browser IIFE modules register here while the legacy `window.PokerAI`
 * facade remains the public entrypoint for existing callers.
 */
(function(global) {
  'use strict';

  var modules = global.PokerAIModules || {};

  if (typeof modules.register !== 'function') {
    modules.register = function(name, value) {
      modules[name] = value;
      return value;
    };
  }

  global.PokerAIModules = modules;
})(typeof window !== 'undefined' ? window : global);
