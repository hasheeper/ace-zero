(function(global) {
  'use strict';

  var GAME_MESSAGE_TYPES = Object.freeze({
    data: 'acezero-game-data',
    request: 'acezero-data-request',
    ready: 'acezero-game-ready'
  });

  var DEFAULT_STATIC_CONFIG_PATHS = Object.freeze([
    '../../../content/game-config.json',
    'game-config.json'
  ]);

  function noop() {}

  function createLogger(logger) {
    return logger || global.console || {
      log: noop,
      warn: noop,
      error: noop
    };
  }

  function hasParentWindow(win) {
    try {
      return !!(win.parent && win.parent !== win);
    } catch (error) {
      return false;
    }
  }

  function createHostRuntime(options) {
    options = options || {};
    var win = options.window || global;
    var logger = createLogger(options.console || win.console);
    var staticConfigPaths = Array.isArray(options.staticConfigPaths)
      ? options.staticConfigPaths.slice()
      : DEFAULT_STATIC_CONFIG_PATHS.slice();
    var externalConfigApplied = false;
    var configSource = null;
    var messageListenerBound = false;

    function getPreloadedConfig() {
      if (typeof options.getPreloadedConfig === 'function') {
        return options.getPreloadedConfig();
      }
      return win.__ACEZERO_GAME_CONFIG__ || null;
    }

    function setConfig(config) {
      if (typeof options.setConfig === 'function') {
        options.setConfig(config);
      }
    }

    function registerRuntimeModules() {
      if (typeof options.registerRuntimeModules === 'function') {
        options.registerRuntimeModules();
      }
    }

    function refreshTutorialController() {
      if (typeof options.refreshTutorialController === 'function') {
        options.refreshTutorialController();
      }
    }

    async function resolveConfig(config) {
      if (typeof options.resolveTutorialConfig === 'function') {
        return options.resolveTutorialConfig(config);
      }
      return config;
    }

    async function applyExternalConfig(config, source) {
      if (!config) return;
      var nextSource = source || 'static';
      if (externalConfigApplied) {
        if (configSource === 'injected' || nextSource !== 'injected') {
          logger.log('[CONFIG] 配置已应用，忽略重复 [' + nextSource + ']');
          return;
        }
        logger.log('[CONFIG] injected 配置覆盖之前的 static 配置');
      }

      var resolvedConfig = await resolveConfig(config);
      setConfig(resolvedConfig);
      externalConfigApplied = true;
      configSource = nextSource;
      logger.log('[CONFIG] 外部配置已应用 [' + nextSource + ']:', resolvedConfig);
      registerRuntimeModules();
      refreshTutorialController();
      return resolvedConfig;
    }

    async function loadConfig() {
      var preloadedConfig = getPreloadedConfig();
      if (!externalConfigApplied && preloadedConfig) {
        await applyExternalConfig(preloadedConfig, 'preloaded');
        return;
      }

      if (externalConfigApplied) {
        logger.log('[CONFIG] 外部配置已存在，跳过 game-config.json 加载');
        return;
      }

      if (hasParentWindow(win)) {
        logger.log('[CONFIG] 在 iframe 中运行，等待主引擎 postMessage 配置');
        return;
      }

      for (var i = 0; i < staticConfigPaths.length; i += 1) {
        var path = staticConfigPaths[i];
        if (externalConfigApplied) return;
        try {
          var response = await win.fetch(path);
          if (externalConfigApplied) return;
          if (response.ok) {
            var config = await response.json();
            var resolvedConfig = await resolveConfig(config);
            setConfig(resolvedConfig);
            configSource = 'static';
            logger.log('[CONFIG] 从', path, '加载:', resolvedConfig);
            registerRuntimeModules();
            return;
          }
        } catch (error) {
          // Try the next static config path.
        }
      }

      logger.log('[CONFIG] 使用默认内置配置');
    }

    function bindHostMessages() {
      if (messageListenerBound || typeof win.addEventListener !== 'function') return;
      messageListenerBound = true;
      win.addEventListener('message', function(event) {
        var msg = event && event.data;
        if (!msg || msg.type !== GAME_MESSAGE_TYPES.data) return;
        var source = msg.source || 'static';
        logger.log('[CONFIG] 收到主引擎 postMessage 配置 [' + source + ']');
        void applyExternalConfig(msg.payload, source);
      });
    }

    function requestConfigFromEngine() {
      if (hasParentWindow(win)) {
        win.parent.postMessage({ type: GAME_MESSAGE_TYPES.request }, '*');
      }
    }

    function notifyGameReady() {
      try {
        if (!hasParentWindow(win)) return;
        var schedule = typeof win.requestAnimationFrame === 'function'
          ? win.requestAnimationFrame.bind(win)
          : function(callback) { return win.setTimeout(callback, 0); };
        schedule(function() {
          win.parent.postMessage({ type: GAME_MESSAGE_TYPES.ready }, '*');
        });
      } catch (error) {
        // Keep startup tolerant of embedded browser restrictions.
      }
    }

    function waitForRPG() {
      if (win.__rpgReady) return Promise.resolve();
      return new Promise(function(resolve) {
        if (typeof win.addEventListener === 'function') {
          win.addEventListener('rpg:ready', resolve, { once: true });
        }
        win.setTimeout(function() {
          if (!win.__rpgReady) {
            logger.warn('[INIT] RPG 模块未在 2s 内加载，降级运行');
          }
          resolve();
        }, 2000);
      });
    }

    win.__acezeroApplyGameConfig = applyExternalConfig;

    return Object.freeze({
      loadConfig: loadConfig,
      applyExternalConfig: applyExternalConfig,
      bindHostMessages: bindHostMessages,
      requestConfigFromEngine: requestConfigFromEngine,
      notifyGameReady: notifyGameReady,
      waitForRPG: waitForRPG,
      getConfigSource: function() { return configSource; },
      isExternalConfigApplied: function() { return externalConfigApplied; }
    });
  }

  global.AceTexasHostRuntime = Object.freeze({
    GAME_MESSAGE_TYPES: GAME_MESSAGE_TYPES,
    create: createHostRuntime
  });
})(window);
