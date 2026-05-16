(function(global) {
  'use strict';

  function createRuntimeFactory(options = {}) {
    const logRuntime = typeof options.logRuntime === 'function'
      ? options.logRuntime
      : function noopLogRuntime() {};
    const clone = typeof options.clone === 'function'
      ? options.clone
      : function cloneValue(value) { return JSON.parse(JSON.stringify(value)); };
    const actionNormalizer = options.actionNormalizer || {};
    let legacyRuntimeFactoryLoadPromise = null;

    function isRuntimeContractCompatible(runtime) {
      return Boolean(
        runtime
        && typeof runtime.start === 'function'
        && typeof runtime.dispatch === 'function'
        && typeof runtime.getSnapshot === 'function'
        && typeof runtime.subscribe === 'function'
      );
    }

    function findExternalRuntimeFactory() {
      const candidates = [
        global.AceMahjongFormalRuntimeFactory,
        global.AceMahjongEngineRuntimeFactory,
        global.AceMahjongRuntimeFactory,
        global.AceMahjongEngine
      ].filter(Boolean);

      for (const candidate of candidates) {
        if (candidate && typeof candidate.createRuntime === 'function') {
          return candidate;
        }
      }

      return null;
    }

    function resolveLegacyRuntimeScriptUrl() {
      if (typeof global.AceMahjongLegacyRuntimeScriptUrl === 'string' && global.AceMahjongLegacyRuntimeScriptUrl) {
        return global.AceMahjongLegacyRuntimeScriptUrl;
      }
      const documentRef = global.document || null;
      if (!documentRef || !documentRef.querySelectorAll) return null;
      const script = Array.from(documentRef.querySelectorAll('script[src]')).find((node) => (
        typeof node.src === 'string' && /runtime-bridge\.js(?:\?|$)/.test(node.src)
      ));
      if (!script || !script.src) return null;
      try {
        return new URL('../formal/legacy-runtime-factory.js', script.src).toString();
      } catch (error) {
        return null;
      }
    }

    function loadScriptOnce(url) {
      if (!url) {
        return Promise.reject(new Error('Legacy runtime script URL could not be resolved.'));
      }
      const documentRef = global.document || null;
      if (!documentRef || !documentRef.createElement) {
        return Promise.reject(new Error('Dynamic legacy runtime loading requires document access.'));
      }

      const existingScript = Array.from(documentRef.querySelectorAll('script[src]')).find((node) => node.src === url);
      if (existingScript && global.AceMahjongLegacyBrowserRuntimeFactory) {
        return Promise.resolve(global.AceMahjongLegacyBrowserRuntimeFactory);
      }
      if (existingScript && !global.AceMahjongLegacyBrowserRuntimeFactory) {
        return Promise.reject(new Error('Legacy runtime script tag already exists, but factory is not available.'));
      }

      if (legacyRuntimeFactoryLoadPromise) {
        return legacyRuntimeFactoryLoadPromise;
      }

      legacyRuntimeFactoryLoadPromise = new Promise((resolve, reject) => {
        const script = existingScript || documentRef.createElement('script');
        if (!existingScript) {
          script.src = url;
          script.async = false;
        }

        const cleanup = () => {
          script.removeEventListener('load', handleLoad);
          script.removeEventListener('error', handleError);
        };
        const handleLoad = () => {
          cleanup();
          if (global.AceMahjongLegacyBrowserRuntimeFactory) {
            resolve(global.AceMahjongLegacyBrowserRuntimeFactory);
            return;
          }
          reject(new Error('Legacy runtime script loaded, but factory was not registered.'));
        };
        const handleError = () => {
          cleanup();
          reject(new Error(`Failed to load legacy runtime script: ${url}`));
        };

        script.addEventListener('load', handleLoad, { once: true });
        script.addEventListener('error', handleError, { once: true });

        if (!existingScript) {
          const parent = documentRef.head || documentRef.body || documentRef.documentElement;
          parent.appendChild(script);
        }
      }).finally(() => {
        legacyRuntimeFactoryLoadPromise = null;
      });

      return legacyRuntimeFactoryLoadPromise;
    }

    async function ensureLegacyRuntimeFactory() {
      if (global.AceMahjongLegacyBrowserRuntimeFactory) {
        return global.AceMahjongLegacyBrowserRuntimeFactory;
      }

      const scriptUrl = resolveLegacyRuntimeScriptUrl();
      const factory = await loadScriptOnce(scriptUrl);
      if (!factory || typeof factory.createRuntime !== 'function') {
        throw new Error('AceMahjongLegacyBrowserRuntimeFactory is required for legacy fallback runtime.');
      }
      return factory;
    }

    async function createLegacyRuntime(config = {}) {
      const legacyFactory = await ensureLegacyRuntimeFactory();
      if (!legacyFactory || typeof legacyFactory.createRuntime !== 'function') {
        throw new Error('AceMahjongLegacyBrowserRuntimeFactory is required for legacy fallback runtime.');
      }
      return legacyFactory.createRuntime(config, getLegacyRuntimeDependencies());
    }

    function shouldAllowLegacyFallback(config = {}) {
      return Boolean(global.AceMahjongEnableLegacyRuntimeFallback)
        || Boolean(config && config.runtime && config.runtime.allowLegacyFallback)
        || Boolean(config && config.testing && config.testing.allowLegacyRuntimeFallback);
    }

    function describeRuntime(runtime) {
      if (!runtime) {
        return {
          kind: 'unknown-runtime',
          source: 'unknown',
          mode: null
        };
      }

      return {
        kind: runtime.kind || 'unknown-runtime',
        source: runtime.source || 'unknown',
        mode: runtime.mode || null
      };
    }

    function getLegacyRuntimeDependencies() {
      return {
        clone,
        inferBrowserActionType: actionNormalizer.inferBrowserActionType,
        normalizeBrowserActionPayload: actionNormalizer.normalizeBrowserActionPayload,
        logRuntime
      };
    }

    async function createPreferredRuntime(config = {}) {
      const externalFactory = findExternalRuntimeFactory();

      if (externalFactory && typeof externalFactory.createRuntime === 'function') {
        try {
          const runtime = await Promise.resolve(externalFactory.createRuntime(config));
          if (runtime) {
            return {
              runtime,
              externalFactory,
              source: 'external-factory'
            };
          }
        } catch (error) {
          if (!shouldAllowLegacyFallback(config)) {
            logRuntime('error', '外部 runtime 工厂创建失败，且 legacy fallback 未启用', {
              message: error && error.message ? error.message : String(error)
            });
            throw error;
          }
          logRuntime('warn', '外部 runtime 工厂创建失败，按显式配置回退到 legacy browser runtime', {
            message: error && error.message ? error.message : String(error)
          });
        }
      }

      if (!shouldAllowLegacyFallback(config)) {
        throw new Error('Formal runtime unavailable, and legacy fallback is disabled.');
      }

      return {
        runtime: await createLegacyRuntime(config),
        externalFactory: null,
        source: 'legacy-browser-runtime'
      };
    }

    return {
      isRuntimeContractCompatible,
      findExternalRuntimeFactory,
      resolveLegacyRuntimeScriptUrl,
      loadScriptOnce,
      ensureLegacyRuntimeFactory,
      createLegacyRuntime,
      shouldAllowLegacyFallback,
      describeRuntime,
      getLegacyRuntimeDependencies,
      createPreferredRuntime
    };
  }

  global.AceMahjongBridgeRuntimeFactory = {
    create: createRuntimeFactory
  };
})(typeof window !== 'undefined' ? window : globalThis);
