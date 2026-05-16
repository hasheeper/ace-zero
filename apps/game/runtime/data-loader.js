import {
  isGameDataMessage,
  requestGameDataFromParent
} from './game-protocol.js';

/**
 * ===========================================
 * DATA-LOADER.JS - 外部数据加载系统
 * ===========================================
 *
 * 职责:
 * - 接收 STver.html / 父级 App Host 通过 postMessage 注入的 game-config
 * - 缓存统一 game-config（hero、seats、blinds 等）并通知 apps/game host
 * - 静态 fallback 由 apps/game/index.html 统一读取 content/game-config.json
 * - 主动向父窗口请求数据
 *
 * JSON 格式 (game-config v4):
 * {
 *   "blinds": [10, 20],
 *   "chips": 1000,
 *   "hero": {
 *     "vanguard": { "name": "KAZU", "level": 3, "trait": "blank_body" },
 *     "rearguard": { "name": "RINO", "level": 5, "trait": "fate_weaver" },
 *     "attrs": { ... },
 *     "skills": { ... }
 *   },
 *   "seats": { "BTN": { ... }, "SB": { ... }, ... }
 * }
 */

/**
 * @typedef {import('./game-protocol.js').AceZeroGameConfig} AceZeroGameConfig
 */

/**
 * @typedef {Object} AceZeroDataLoader
 * @property {() => AceZeroGameConfig | null} getInjectedConfig
 * @property {(callback: (config: AceZeroGameConfig) => void) => void} onConfigLoaded
 * @property {(json: unknown) => { valid: boolean, errors: string[] }} validateGameConfig
 * @property {() => void} requestDataFromParent
 */

/**
 * @param {{ windowRef?: Window | null, documentRef?: Document | null, logger?: Console }} [options]
 * @returns {AceZeroDataLoader}
 */
export function createAceZeroDataLoader(options = {}) {
  const windowRef = options.windowRef || (typeof window !== 'undefined' ? window : null);
  const documentRef = options.documentRef || (typeof document !== 'undefined' ? document : null);
  const logger = options.logger || console;

  /** @type {AceZeroGameConfig | null} */
  let injectedConfig = null;
  /** @type {Array<(config: AceZeroGameConfig) => void>} */
  let configCallbacks = [];

  /**
   * 获取已注入的外部配置
   * @returns {AceZeroGameConfig | null}
   */
  function getInjectedConfig() {
    return injectedConfig;
  }

  /**
   * 注册配置加载回调。如果配置已加载，立即执行；否则等待注入。
   * @param {(config: AceZeroGameConfig) => void} callback
   */
  function onConfigLoaded(callback) {
    if (injectedConfig) {
      callback(injectedConfig);
    } else {
      configCallbacks.push(callback);
    }
  }

  /**
   * 应用注入的配置数据
   * @param {AceZeroGameConfig} data
   */
  function applyInjectedConfig(data) {
    if (!data) return;
    // 已有配置 -> 忽略重复投递
    if (injectedConfig) {
      logger.log('[DATA-LOADER] 配置已加载，忽略重复投递');
      return;
    }

    injectedConfig = data;
    const heroName = (data.hero && data.hero.vanguard && data.hero.vanguard.name) || '(none)';
    logger.log('[DATA-LOADER] 外部配置已加载, hero:', heroName);

    // 如果 texas-holdem.js 已加载，直接应用配置
    if (windowRef && typeof windowRef.applyExternalConfig === 'function') {
      try {
        windowRef.applyExternalConfig(data);
        logger.log('[DATA-LOADER] ✓ 已调用 applyExternalConfig');
      } catch (error) {
        logger.error('[DATA-LOADER] applyExternalConfig 失败:', error);
      }
    }

    configCallbacks.forEach((callback) => {
      try {
        callback(data);
      } catch (error) {
        logger.error('[DATA-LOADER] 回调执行失败:', error);
      }
    });
    configCallbacks = [];
  }

  function handleMessage(event) {
    const msg = event && event.data;
    if (!isGameDataMessage(msg)) return;

    logger.log('[DATA-LOADER] 收到 postMessage 数据:', msg.payload);
    applyInjectedConfig(msg.payload);
  }

  /**
   * 主动请求数据（如果在 iframe 中）
   */
  function requestDataFromParent() {
    const didRequest = requestGameDataFromParent(windowRef);
    if (didRequest) logger.log('[DATA-LOADER] 向父窗口请求数据...');
  }

  /**
   * 验证游戏配置 JSON 格式
   * @param {unknown} json
   * @returns {{ valid: boolean, errors: string[] }}
   */
  function validateGameConfig(json) {
    const errors = [];

    if (!json) {
      errors.push('JSON data is null or undefined');
      return { valid: false, errors };
    }

    const config = json;

    // 新格式验证：hero + seats
    if (config.hero) {
      if (!config.hero.vanguard || !config.hero.vanguard.name) {
        errors.push('hero.vanguard.name is required');
      }
    }

    if (config.seats && typeof config.seats === 'object') {
      for (const [seat, cfg] of Object.entries(config.seats)) {
        if (!cfg.vanguard || !cfg.vanguard.name) {
          errors.push(`seats.${seat}: vanguard.name is required`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  const api = {
    getInjectedConfig,
    onConfigLoaded,
    validateGameConfig,
    requestDataFromParent
  };

  if (windowRef) {
    windowRef.addEventListener('message', handleMessage);
    windowRef.AceZeroDataLoader = api;

    // 页面加载后主动请求一次
    if (documentRef && documentRef.readyState === 'complete') {
      requestDataFromParent();
    } else {
      windowRef.addEventListener('load', requestDataFromParent);
    }
  }

  return api;
}

const defaultDataLoader = typeof window !== 'undefined'
  ? createAceZeroDataLoader()
  : null;

export default defaultDataLoader;
