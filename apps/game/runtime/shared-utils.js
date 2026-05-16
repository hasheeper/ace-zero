/**
 * Small browser-native helpers shared by the AceZero game host runtime.
 */

/**
 * @param {string} url
 * @param {RequestInit} [options]
 * @returns {Promise<unknown>}
 */
export async function fetchJson(url, options) {
  const resp = await fetch(url, options);
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  return resp.json();
}

/**
 * @param {string} path
 * @returns {string[]}
 */
export function tutorialPathCandidates(path) {
  const raw = String(path || '').trim();
  if (!raw) return [];
  if (/^(?:https?:)?\/\//i.test(raw) || raw.startsWith('/') || raw.startsWith('./') || raw.startsWith('../')) {
    return [raw];
  }
  return [raw, '../../' + raw];
}

/**
 * @param {string[]} candidates
 * @param {{ logger?: Console, warningPrefix?: string }} [options]
 * @returns {Promise<unknown | null>}
 */
export async function fetchFirstJson(candidates, options = {}) {
  const logger = options.logger || console;
  const warningPrefix = options.warningPrefix || '[AceZero Game] JSON fetch failed:';

  for (const candidate of candidates) {
    try {
      return await fetchJson(candidate);
    } catch (error) {
      if (logger && typeof logger.warn === 'function') {
        logger.warn(warningPrefix, candidate, error);
      }
    }
  }

  return null;
}

/**
 * @param {string} key
 * @param {string | null} [fallback]
 * @returns {string | null}
 */
export function safeLocalStorageGet(key, fallback = null) {
  try {
    return localStorage.getItem(key) || fallback;
  } catch (_) {
    return fallback;
  }
}

/**
 * @param {string} key
 * @param {string} value
 * @param {{ logger?: Console, warningPrefix?: string }} [options]
 * @returns {boolean}
 */
export function safeLocalStorageSet(key, value, options = {}) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    const logger = options.logger || console;
    if (logger && typeof logger.warn === 'function' && options.warningPrefix) {
      logger.warn(options.warningPrefix, error);
    }
    return false;
  }
}

/**
 * @param {string} url
 * @param {number | string} [value]
 * @returns {string}
 */
export function withCacheBust(url, value = Date.now()) {
  const sep = url.includes('?') ? '&' : '?';
  return url + sep + 'v=' + value;
}
