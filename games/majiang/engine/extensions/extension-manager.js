(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./extension-hooks'),
      require('./extension-context'),
      require('./extension-results')
    );
    return;
  }
  root.AceMahjongExtensionManager = factory(
    root.AceMahjongExtensionHooks,
    root.AceMahjongExtensionContext,
    root.AceMahjongExtensionResults
  );
})(typeof globalThis !== 'undefined' ? globalThis : this, function(extensionHooksApi, extensionContextApi, extensionResultsApi) {
  'use strict';

  const hookRegistry = extensionHooksApi || {};
  const contextApi = extensionContextApi || {};
  const resultApi = extensionResultsApi || {};

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function createNoopLogger() {
    return function noop() {};
  }

  function normalizeLogger(logger) {
    return typeof logger === 'function' ? logger : createNoopLogger();
  }

  function normalizeExtension(extension) {
    if (!extension || typeof extension !== 'object') return null;
    return {
      id: extension.id || 'unknown-extension',
      name: extension.name || extension.id || 'Unknown Extension',
      priority: Number.isFinite(Number(extension.priority)) ? Number(extension.priority) : 100,
      appliesTo: typeof extension.appliesTo === 'function' ? extension.appliesTo : null,
      hooks: extension
    };
  }

  function sortExtensions(extensions) {
    return extensions.slice().sort((left, right) => {
      if (left.priority !== right.priority) return right.priority - left.priority;
      return String(left.id).localeCompare(String(right.id));
    });
  }

  function createExtensionManager(options = {}) {
    const logger = normalizeLogger(options.logger);
    const registered = sortExtensions((options.extensions || []).map(normalizeExtension).filter(Boolean));

    function registerExtension(extension) {
      const normalized = normalizeExtension(extension);
      if (!normalized) return null;
      registered.push(normalized);
      const sorted = sortExtensions(registered);
      registered.length = 0;
      registered.push(...sorted);
      return normalized.id;
    }

    function listExtensions() {
      return registered.map((entry) => ({
        id: entry.id,
        name: entry.name,
        priority: entry.priority
      }));
    }

    function resolveExtensionsForHook(hookName, context) {
      return registered.filter((entry) => {
        if (!entry || !entry.hooks || typeof entry.hooks[hookName] !== 'function') return false;
        if (typeof entry.appliesTo !== 'function') return true;
        try {
          return entry.appliesTo(context) !== false;
        } catch (error) {
          logger('warn', '[ExtensionManager] appliesTo failed', {
            extensionId: entry.id,
            hookName,
            error: error && error.message ? error.message : String(error)
          });
          return false;
        }
      });
    }

    function runHook(hookName, payload = {}, optionsForHook = {}) {
      if (!hookRegistry || typeof hookRegistry.isKnownHook !== 'function' || !hookRegistry.isKnownHook(hookName)) {
        throw new Error(`Unknown extension hook: ${hookName}`);
      }

      const context = contextApi && typeof contextApi.createExtensionContext === 'function'
        ? contextApi.createExtensionContext(hookName, payload, optionsForHook)
        : { hook: hookName, payload: clone(payload), ...clone(optionsForHook) };
      const matchedExtensions = resolveExtensionsForHook(hookName, context);
      let mergedResult = resultApi && typeof resultApi.createEmptyHookResult === 'function'
        ? resultApi.createEmptyHookResult(hookName)
        : {};
      const trace = [];

      matchedExtensions.forEach((extension) => {
        try {
          const patch = extension.hooks[hookName](context);
          if (patch == null) return;
          mergedResult = resultApi && typeof resultApi.mergeHookResult === 'function'
            ? resultApi.mergeHookResult(hookName, mergedResult, patch)
            : clone(patch);
          trace.push({
            id: extension.id,
            hook: hookName
          });
        } catch (error) {
          logger('warn', '[ExtensionManager] hook execution failed', {
            extensionId: extension.id,
            hookName,
            error: error && error.message ? error.message : String(error)
          });
        }
      });

      return {
        hook: hookName,
        context,
        result: mergedResult,
        trace
      };
    }

    function buildDebugState() {
      return {
        extensions: listExtensions(),
        hooks: hookRegistry && typeof hookRegistry.listHookNames === 'function'
          ? hookRegistry.listHookNames()
          : []
      };
    }

    return {
      kind: 'mahjong-extension-manager',
      registerExtension,
      listExtensions,
      runHook,
      buildDebugState
    };
  }

  return {
    createExtensionManager
  };
});
