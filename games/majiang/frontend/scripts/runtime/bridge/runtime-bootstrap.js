(function(global) {
  'use strict';

  const devLog = global.AceMahjongDevLog || null;
  const bootstrapLogger = devLog && typeof devLog.createScope === 'function'
    ? devLog.createScope('bootstrap')
    : null;

  function logBootstrap(level, message, detail) {
    if (!bootstrapLogger || typeof bootstrapLogger[level] !== 'function') return null;
    return bootstrapLogger[level](message, detail);
  }

  function getConfigPaths() {
    try {
      const params = new URLSearchParams(global.location && global.location.search ? global.location.search : '');
      const queryPath = params.get('config');
      if (typeof queryPath === 'string' && queryPath) return [queryPath];
    } catch (error) {
      logBootstrap('debug', '解析 URL config 参数失败，继续使用默认配置来源', {
        message: error && error.message ? error.message : String(error)
      });
    }

    const configured = global.AceMahjongGameConfigPaths || global.AceMahjongGameConfigPath;
    if (Array.isArray(configured) && configured.length) return configured.slice();
    if (typeof configured === 'string' && configured) return [configured];
    return ['../game-config.json', './game-config.json'];
  }

  async function fetchConfigFromPaths(paths) {
    let lastError = null;

    for (const path of paths) {
      try {
        const response = await fetch(path, { cache: 'no-store' });
        if (!response.ok) {
          lastError = new Error(`Failed to load ${path}: ${response.status}`);
          continue;
        }
        const config = await response.json();
        return {
          config,
          path
        };
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new Error('Unable to load game config.');
  }

  async function bootstrapFromConfig() {
    if (!global.AceMahjongRuntimeBridge || typeof global.AceMahjongRuntimeBridge.bootstrap !== 'function') {
      logBootstrap('warn', '运行时桥接尚未就绪，跳过配置启动');
      return;
    }

    const paths = getConfigPaths();
    try {
      const loaded = await fetchConfigFromPaths(paths);
      logBootstrap('info', '已加载 game-config.json', {
        path: loaded.path,
        tableSize: loaded.config && loaded.config.tableSize,
        mode: loaded.config && loaded.config.mode
      });
      await global.AceMahjongRuntimeBridge.bootstrap(loaded.config || {});
    } catch (error) {
      logBootstrap('warn', '加载 game-config.json 失败，回退到默认配置启动', {
        paths,
        message: error && error.message ? error.message : String(error)
      });
      await global.AceMahjongRuntimeBridge.bootstrap({});
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrapFromConfig, { once: true });
  } else {
    bootstrapFromConfig();
  }
})(window);
