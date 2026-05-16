/**
 * Shared AceZero game host protocol helpers.
 *
 * This module intentionally keeps the existing postMessage wire shape stable
 * while giving the host boundary a single source of truth for message names.
 */

export const GAME_MESSAGE_TYPES = Object.freeze({
  data: 'acezero-game-data',
  request: 'acezero-data-request',
  ready: 'acezero-game-ready',
  openTutorialPicker: 'acezero-open-tutorial-picker'
});

/**
 * @typedef {Record<string, unknown>} AceZeroGameConfig
 */

/**
 * @typedef {'injected' | 'url' | 'static' | string} AceZeroGameConfigSource
 */

/**
 * @typedef {Object} AceZeroGameDataMessage
 * @property {'acezero-game-data'} type
 * @property {AceZeroGameConfig} payload
 * @property {AceZeroGameConfigSource} [source]
 */

/**
 * @typedef {Object} AceZeroGameRequestMessage
 * @property {'acezero-data-request'} type
 */

/**
 * @typedef {Object} AceZeroGameReadyMessage
 * @property {'acezero-game-ready'} type
 */

/**
 * @typedef {Object} AceZeroOpenTutorialPickerMessage
 * @property {'acezero-open-tutorial-picker'} type
 * @property {Record<string, unknown>} [payload]
 */

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
export function isObjectRecord(value) {
  return !!value && typeof value === 'object';
}

/**
 * @param {unknown} message
 * @returns {message is AceZeroGameDataMessage}
 */
export function isGameDataMessage(message) {
  return isObjectRecord(message) && message.type === GAME_MESSAGE_TYPES.data;
}

/**
 * @param {unknown} message
 * @returns {message is AceZeroGameRequestMessage}
 */
export function isGameRequestMessage(message) {
  return isObjectRecord(message) && message.type === GAME_MESSAGE_TYPES.request;
}

/**
 * @param {unknown} message
 * @returns {message is AceZeroGameReadyMessage}
 */
export function isGameReadyMessage(message) {
  return isObjectRecord(message) && message.type === GAME_MESSAGE_TYPES.ready;
}

/**
 * @param {unknown} message
 * @returns {message is AceZeroOpenTutorialPickerMessage}
 */
export function isOpenTutorialPickerMessage(message) {
  return isObjectRecord(message) && message.type === GAME_MESSAGE_TYPES.openTutorialPicker;
}

/**
 * @param {AceZeroGameConfig} payload
 * @param {AceZeroGameConfigSource} [source]
 * @returns {AceZeroGameDataMessage}
 */
export function createGameDataMessage(payload, source) {
  return {
    type: GAME_MESSAGE_TYPES.data,
    payload,
    source: source || 'static'
  };
}

/**
 * @param {HTMLIFrameElement | null | undefined} frame
 * @returns {Window | null}
 */
export function getFrameWindow(frame) {
  return frame && frame.contentWindow ? frame.contentWindow : null;
}

/**
 * @param {Window | null | undefined} targetWindow
 * @param {unknown} message
 * @param {string} [warningPrefix]
 * @returns {boolean}
 */
export function postGameMessage(targetWindow, message, warningPrefix = '[AceZero Game Protocol]') {
  if (!targetWindow || !message) return false;
  try {
    targetWindow.postMessage(message, '*');
    return true;
  } catch (error) {
    console.warn(warningPrefix + ' postMessage failed:', error);
    return false;
  }
}

/**
 * @param {HTMLIFrameElement | null | undefined} frame
 * @param {AceZeroGameConfig} payload
 * @param {AceZeroGameConfigSource} [source]
 * @returns {boolean}
 */
export function postGameDataToFrame(frame, payload, source) {
  return postGameMessage(getFrameWindow(frame), createGameDataMessage(payload, source));
}

/**
 * @param {Window | null | undefined} [windowRef]
 * @returns {boolean}
 */
export function requestGameDataFromParent(windowRef = typeof window !== 'undefined' ? window : null) {
  if (!windowRef || !windowRef.parent || windowRef.parent === windowRef) return false;
  return postGameMessage(windowRef.parent, { type: GAME_MESSAGE_TYPES.request });
}
