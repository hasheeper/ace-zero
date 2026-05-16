import './combat-settlement.js';
import '../mini-game-logger.js';

/**
 * @typedef {Object} MiniGameLoggerOptions
 * @property {string} [gameName]
 * @property {string} [gameKey]
 * @property {() => void} [onNewRound]
 * @property {() => void} [onRestart]
 */

/**
 * @typedef {Object} MiniGameLoggerInstance
 * @property {(type: string, data?: Record<string, unknown>) => void} log
 * @property {() => void} clear
 * @property {(context?: Record<string, unknown>) => string} generateAIPrompt
 * @property {(context?: Record<string, unknown>) => void} showEndRound
 * @property {() => void} hideEndRound
 * @property {() => void} resetSession
 */

/**
 * @typedef {new (options?: MiniGameLoggerOptions) => MiniGameLoggerInstance} MiniGameLoggerConstructor
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

/** @type {MiniGameLoggerConstructor} */
export const MiniGameLogger = readSharedGlobal('MiniGameLogger');

export default MiniGameLogger;
