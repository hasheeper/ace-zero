import { fetchJson } from './shared-utils.js';

export const DEFAULT_GAME_ID = 'texas-holdem';
export const DEFAULT_GAME_REGISTRY_PATH = '../../registry/games.json';

export const FALLBACK_GAME_ROUTES = Object.freeze({
  'texas-holdem': './modules/texas-holdem/index.html',
  blackjack: './modules/blackjack/index.html',
  dice: './modules/dice/index.html',
  'dragon-tiger': './modules/dragon-tiger/index.html',
  mahjong: './modules/mahjong/index.html',
  majiang: './modules/mahjong/index.html',
  'mahjong-analysis': './modules/mahjong-analysis/index.html',
  'majiang-analysis': './modules/mahjong-analysis/index.html',
  sanma: './modules/mahjong-sanma/index.html',
  'majiang-sanma': './modules/mahjong-sanma/index.html'
});

/**
 * @typedef {Object} AceZeroGameRoute
 * @property {string} id
 * @property {string} entry
 * @property {string[]} [aliases]
 */

/**
 * @typedef {Object} AceZeroGameRegistry
 * @property {number} [version]
 * @property {string} [defaultGame]
 * @property {Record<string, AceZeroGameRoute>} routes
 */

/**
 * @param {{
 *   registryPath?: string,
 *   fallbackRoutes?: Record<string, string>,
 *   defaultGame?: string,
 *   baseUrl?: string,
 *   logger?: Console
 * }} [options]
 */
export function createGameRegistryLoader(options = {}) {
  const registryPath = options.registryPath || DEFAULT_GAME_REGISTRY_PATH;
  const fallbackRoutes = options.fallbackRoutes || FALLBACK_GAME_ROUTES;
  const logger = options.logger || console;
  const baseUrl = options.baseUrl || (typeof window !== 'undefined' ? window.location.href : 'http://localhost/');

  /** @type {AceZeroGameRegistry | null} */
  let routeRegistry = null;
  let defaultGame = options.defaultGame || DEFAULT_GAME_ID;

  function buildFallbackRegistry() {
    return {
      defaultGame,
      routes: Object.fromEntries(
        Object.entries(fallbackRoutes).map(([id, entry]) => [id, { id, entry, aliases: [] }])
      )
    };
  }

  async function loadGameRoutes() {
    if (routeRegistry) return routeRegistry;

    try {
      const registry = await fetchJson(registryPath, { cache: 'no-cache' });
      if (!registry || typeof registry !== 'object' || !registry.routes) {
        throw new Error('Invalid game route registry');
      }
      routeRegistry = registry;
      defaultGame = registry.defaultGame || defaultGame;
      logger.log('[ENGINE] routes loaded:', Object.keys(registry.routes));
      return routeRegistry;
    } catch (error) {
      logger.warn('[ENGINE] registry/games.json 加载失败，使用内置路由:', error);
      routeRegistry = buildFallbackRegistry();
      return routeRegistry;
    }
  }

  function getRegistry() {
    return routeRegistry;
  }

  function getDefaultGame() {
    return defaultGame;
  }

  /**
   * @param {Record<string, unknown> | null | undefined} config
   * @returns {string}
   */
  function resolveGameKey(config) {
    const raw = (config && (config.gameMode || config.gameId)) || defaultGame;
    const norm = String(raw).toLowerCase();
    const registryRoutes = routeRegistry && routeRegistry.routes ? routeRegistry.routes : {};

    if (registryRoutes[norm]) return registryRoutes[norm].id || norm;

    const matched = Object.values(registryRoutes).find((entry) => {
      const aliases = Array.isArray(entry && entry.aliases) ? entry.aliases : [];
      return aliases.map((alias) => String(alias).toLowerCase()).includes(norm);
    });
    if (matched && matched.id) return matched.id;

    if (fallbackRoutes[norm]) return norm;
    return defaultGame;
  }

  /**
   * @param {string} gameId
   * @returns {string}
   */
  function resolveGameUrl(gameId) {
    const registryRoutes = routeRegistry && routeRegistry.routes ? routeRegistry.routes : {};
    const route = (registryRoutes[gameId] && registryRoutes[gameId].entry)
      || fallbackRoutes[gameId]
      || fallbackRoutes[defaultGame];
    return new URL(route, baseUrl).href;
  }

  return {
    loadGameRoutes,
    getRegistry,
    getDefaultGame,
    resolveGameKey,
    resolveGameUrl
  };
}
