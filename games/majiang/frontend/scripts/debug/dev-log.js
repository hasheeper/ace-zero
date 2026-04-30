(function(global) {
  'use strict';

  if (global.AceMahjongDevLog && typeof global.AceMahjongDevLog.log === 'function') {
    return;
  }

  const MAX_ENTRIES = 500;
  const LEVEL_TO_CONSOLE = {
    debug: 'debug',
    info: 'info',
    warn: 'warn',
    error: 'error'
  };
  const history = [];
  let nextId = 1;
  let enabled = true;
  let consoleEnabled = true;

  function sanitizeDetail(value, depth = 0) {
    if (value == null) return value;
    if (depth >= 4) return '[Truncated]';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack || null
      };
    }
    if (Array.isArray(value)) {
      return value.slice(0, 20).map((item) => sanitizeDetail(item, depth + 1));
    }
    if (typeof value === 'object') {
      const output = {};
      Object.keys(value).slice(0, 20).forEach((key) => {
        output[key] = sanitizeDetail(value[key], depth + 1);
      });
      return output;
    }
    return String(value);
  }

  function pushEntry(level, scope, message, detail) {
    if (!enabled) return null;

    const entry = {
      id: nextId++,
      time: new Date().toISOString(),
      level: level || 'info',
      scope: scope || 'app',
      message: String(message || ''),
      detail: sanitizeDetail(detail)
    };

    history.push(entry);
    if (history.length > MAX_ENTRIES) history.shift();

    if (consoleEnabled && global.console) {
      const consoleMethod = LEVEL_TO_CONSOLE[entry.level] || 'log';
      const prefix = `[Mahjong][${entry.scope}][${entry.level.toUpperCase()}] ${entry.message}`;
      if (entry.detail == null) {
        global.console[consoleMethod](prefix);
      } else {
        global.console[consoleMethod](prefix, entry.detail);
      }
    }

    return entry;
  }

  function createScope(scope) {
    return {
      log(message, detail) {
        return pushEntry('info', scope, message, detail);
      },
      info(message, detail) {
        return pushEntry('info', scope, message, detail);
      },
      debug(message, detail) {
        return pushEntry('debug', scope, message, detail);
      },
      warn(message, detail) {
        return pushEntry('warn', scope, message, detail);
      },
      error(message, detail) {
        return pushEntry('error', scope, message, detail);
      }
    };
  }

  const api = {
    log(scope, message, detail) {
      return pushEntry('info', scope, message, detail);
    },
    info(scope, message, detail) {
      return pushEntry('info', scope, message, detail);
    },
    debug(scope, message, detail) {
      return pushEntry('debug', scope, message, detail);
    },
    warn(scope, message, detail) {
      return pushEntry('warn', scope, message, detail);
    },
    error(scope, message, detail) {
      return pushEntry('error', scope, message, detail);
    },
    createScope,
    clear() {
      history.length = 0;
      return [];
    },
    getEntries() {
      return history.slice();
    },
    getRecentEntries(limit = 50) {
      const safeLimit = Math.max(1, Number(limit) || 50);
      return history.slice(-safeLimit);
    },
    setEnabled(value) {
      enabled = value !== false;
      return enabled;
    },
    setConsoleEnabled(value) {
      consoleEnabled = value !== false;
      return consoleEnabled;
    },
    isEnabled() {
      return enabled;
    },
    isConsoleEnabled() {
      return consoleEnabled;
    }
  };

  global.AceMahjongDevLog = api;

  global.addEventListener('error', (event) => {
    pushEntry('error', 'browser', '捕获到未处理错误', {
      message: event.message || 'Unknown error',
      filename: event.filename || null,
      lineno: event.lineno || null,
      colno: event.colno || null,
      error: event.error || null
    });
  });

  global.addEventListener('unhandledrejection', (event) => {
    pushEntry('error', 'browser', '捕获到未处理 Promise 拒绝', {
      reason: event.reason || null
    });
  });

  pushEntry('info', 'system', '开发者日志系统已初始化', {
    maxEntries: MAX_ENTRIES
  });
})(window);
