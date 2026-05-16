import '../mini-game-base.js';

/**
 * @typedef {Object} MiniGameConfigLoaderOptions
 * @property {string} [gameKey]
 * @property {Record<string, unknown>} [defaults]
 * @property {(config: Record<string, unknown>) => void} [onReady]
 */

/**
 * @typedef {Object} MiniGameConfigLoader
 * @property {() => Record<string, unknown>} cfg
 * @property {(callbackConfig?: Record<string, unknown>) => void} applyExternal
 * @property {() => Promise<void>} load
 * @property {() => void} requestFromEngine
 */

/**
 * @typedef {Object} MiniGameBaseApi
 * @property {(options?: MiniGameConfigLoaderOptions) => MiniGameConfigLoader} createConfigLoader
 * @property {(config: Record<string, unknown>, gameKey: string) => Record<string, unknown>} applyAssetDeckToMiniGameConfig
 * @property {(forceEngine: unknown, assetModifiers: unknown) => void} applyAssetModifiersToForceEngine
 * @property {(assetModifiers: unknown, bucketName: string, key: string, baseValue: unknown) => unknown} resolveAssetValue
 * @property {(config: Record<string, unknown>) => void} renderAssetStatus
 * @property {(options?: Record<string, unknown>) => unknown} createManaManager
 * @property {(options?: Record<string, unknown>) => unknown} createBetSelector
 * @property {(element: Element | null, text: string, className?: string) => void} updateMessage
 * @property {(element: Element | null, value: number) => void} updateChipDisplay
 * @property {(ms: number) => Promise<void>} wait
 * @property {(options?: Record<string, unknown>) => unknown} createStartSplash
 * @property {() => void} fitMiniGameStageToScreen
 */

/**
 * @param {string} name
 * @returns {unknown}
 */
function readSharedGlobal(name) {
  const scope = typeof window !== 'undefined' ? window : globalThis;
  const api = scope[name] || globalThis[name];
  if (!api) {
    throw new Error('[AceZero Shared ESM] Missing legacy global: ' + name);
  }
  return api;
}

/** @type {MiniGameBaseApi} */
const MiniGameBase = readSharedGlobal('MiniGameBase');

export const createConfigLoader = MiniGameBase.createConfigLoader;
export const createManaManager = MiniGameBase.createManaManager;
export const createBetSelector = MiniGameBase.createBetSelector;
export const updateMessage = MiniGameBase.updateMessage;
export const updateChipDisplay = MiniGameBase.updateChipDisplay;
export const wait = MiniGameBase.wait;
export const createStartSplash = MiniGameBase.createStartSplash;

export default MiniGameBase;
