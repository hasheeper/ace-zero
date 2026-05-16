import '../combat-settlement.js';

/**
 * @typedef {Object} AceZeroCombatConfig
 * @property {string} requestId
 * @property {number} [requestIndex]
 * @property {number} [level]
 * @property {string} [kind]
 * @property {number} [stakeGold]
 * @property {number} [stakeChips]
 */

/**
 * @typedef {Object} AceZeroCombatOutcome
 * @property {string} key
 * @property {string} label
 * @property {number} ratio
 */

/**
 * @typedef {Object} AceZeroCombatSettlementApi
 * @property {string} PROTOCOL
 * @property {(value: unknown) => AceZeroCombatConfig | null} normalizeCombatConfig
 * @property {(netChips: number, stakeChips: number) => AceZeroCombatOutcome} classifyOutcome
 * @property {(level: number, outcomeKey: string) => Record<string, unknown>} buildRewardDelta
 * @property {(input: Record<string, unknown>) => Record<string, unknown> | null} buildSettlement
 * @property {(input: Record<string, unknown>) => Record<string, unknown> | null} buildSettlementFromSession
 * @property {(settlement: Record<string, unknown>) => Record<string, unknown>} buildMarkerPayload
 * @property {(chips: number) => number} silverToGold
 * @property {(gold: number) => number} goldToSilver
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

/** @type {AceZeroCombatSettlementApi} */
const ACE0CombatSettlement = readSharedGlobal('ACE0CombatSettlement');

export const normalizeCombatConfig = ACE0CombatSettlement.normalizeCombatConfig;
export const classifyOutcome = ACE0CombatSettlement.classifyOutcome;
export const buildRewardDelta = ACE0CombatSettlement.buildRewardDelta;
export const buildSettlement = ACE0CombatSettlement.buildSettlement;
export const buildSettlementFromSession = ACE0CombatSettlement.buildSettlementFromSession;
export const buildMarkerPayload = ACE0CombatSettlement.buildMarkerPayload;
export const silverToGold = ACE0CombatSettlement.silverToGold;
export const goldToSilver = ACE0CombatSettlement.goldToSilver;

export default ACE0CombatSettlement;
