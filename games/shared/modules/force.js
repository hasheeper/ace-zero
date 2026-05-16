import '../mini-game-force.js';

/**
 * @typedef {Object} MiniGameForceSkill
 * @property {string} [key]
 * @property {string} [attr]
 * @property {number} [power]
 * @property {number} [manaCost]
 */

/**
 * @typedef {Object} MiniGameForceResult
 * @property {number} bias
 * @property {unknown} [info]
 * @property {unknown[]} [log]
 */

/**
 * @typedef {Object} MiniGameForceEngine
 * @property {(skills: Record<string, MiniGameForceSkill>) => void} defineSkills
 * @property {(skillKey: string) => MiniGameForceResult} playerUseSkill
 * @property {() => number} getRoundBias
 * @property {(skillKey: string) => MiniGameForceSkill | null} getSkill
 * @property {() => Record<string, MiniGameForceSkill>} getSkills
 */

/**
 * @typedef {Object} MiniGameForceApi
 * @property {string[]} ATTRS
 * @property {Record<string, string>} BEATS
 * @property {Record<string, string>} ATTR_CN
 * @property {number} COUNTER_MULTIPLIER
 * @property {number} PSYCHE_CONVERT_RATE
 * @property {(playerForce: unknown, dealerForce: unknown) => MiniGameForceResult} resolveForces
 * @property {(strategy: string, dealerSkills: Record<string, MiniGameForceSkill>, dealerState: unknown, playerForce?: unknown, history?: string[]) => MiniGameForceSkill | null} dealerDecide
 * @property {(options?: Record<string, unknown>) => MiniGameForceEngine} createEngine
 * @property {(power: number) => number} powerToBias
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

/** @type {MiniGameForceApi} */
const MiniGameForce = readSharedGlobal('MiniGameForce');

export const ATTRS = MiniGameForce.ATTRS;
export const BEATS = MiniGameForce.BEATS;
export const ATTR_CN = MiniGameForce.ATTR_CN;
export const resolveForces = MiniGameForce.resolveForces;
export const dealerDecide = MiniGameForce.dealerDecide;
export const createEngine = MiniGameForce.createEngine;
export const powerToBias = MiniGameForce.powerToBias;

export default MiniGameForce;
