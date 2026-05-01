/**
 * AceZero ACT plugin compatibility entry.
 *
 * Dashboard and legacy pages can load this single file. It expands to the
 * split ACT runtime files in the same order used by the st-bridge manifest.
 */
(function loadAceZeroActPluginEntry(global) {
  'use strict';

  if (global.__ACE0_ACT_PLUGIN_ENTRY_LOADED__) return;
  global.__ACE0_ACT_PLUGIN_ENTRY_LOADED__ = true;

  const files = [
    './act/data.js',
    './act/generated-data.js',
    './act/generated-runtime.js',
    './act/narrative-runtime.js',
    './act/frontend-snapshot.js',
    './act/encounter-runtime.js',
    './act/plugin.js'
  ];

  function resolveBaseUrl() {
    try {
      const currentScript = document.currentScript;
      if (currentScript && currentScript.src) return new URL('./', currentScript.src).href;
    } catch (_) {}
    return './';
  }

  function resolveScriptUrl(path) {
    try {
      return new URL(path, resolveBaseUrl()).href;
    } catch (_) {
      return path;
    }
  }

  function escapeAttribute(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  }

  function loadSequentially(urls) {
    return urls.reduce((chain, url) => chain.then(() => new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.async = false;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Failed to load AceZero ACT script: ${url}`));
      document.head.appendChild(script);
    })), Promise.resolve());
  }

  const urls = files.map(resolveScriptUrl);

  if (typeof document !== 'undefined' && document.readyState === 'loading') {
    document.write(urls.map((url) => `<script src="${escapeAttribute(url)}"><\/script>`).join(''));
    return;
  }

  global.ACE0ActPluginReady = loadSequentially(urls).then(() => global.ACE0Modules && global.ACE0Modules.act);
})(typeof window !== 'undefined' ? window : globalThis);
