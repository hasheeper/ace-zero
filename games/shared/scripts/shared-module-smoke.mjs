#!/usr/bin/env node

import assert from 'node:assert/strict';

import MiniGameForce, { createEngine } from '../modules/force.js';
import MiniGameBase, { createConfigLoader } from '../modules/base.js';
import ACE0CombatSettlement, { buildSettlement } from '../modules/combat-settlement.js';
import MiniGameLogger, { MiniGameLogger as NamedMiniGameLogger } from '../modules/logger.js';

function createFakeElement() {
  return {
    classList: {
      add() {},
      remove() {}
    },
    addEventListener() {},
    appendChild() {},
    removeChild() {},
    set innerHTML(value) {
      this._innerHTML = value;
    },
    get innerHTML() {
      return this._innerHTML || '';
    }
  };
}

globalThis.document = globalThis.document || {
  body: createFakeElement(),
  createElement: createFakeElement,
  execCommand() {
    return false;
  },
  getElementById() {
    return null;
  }
};

if (typeof globalThis.navigator === 'undefined') {
  Object.defineProperty(globalThis, 'navigator', {
    value: {},
    configurable: true
  });
}

assert.equal(typeof MiniGameForce, 'object', 'MiniGameForce default export should exist');
assert.equal(typeof createEngine, 'function', 'createEngine named export should exist');
assert.equal(typeof MiniGameBase, 'object', 'MiniGameBase default export should exist');
assert.equal(typeof createConfigLoader, 'function', 'createConfigLoader named export should exist');
assert.equal(typeof ACE0CombatSettlement, 'object', 'ACE0CombatSettlement default export should exist');
assert.equal(typeof buildSettlement, 'function', 'buildSettlement named export should exist');
assert.equal(typeof MiniGameLogger, 'function', 'MiniGameLogger default export should be constructible');
assert.equal(MiniGameLogger, NamedMiniGameLogger, 'MiniGameLogger named/default exports should match');

const logger = new MiniGameLogger({ gameName: 'Smoke', gameKey: 'shared-module-smoke' });
assert.equal(typeof logger.generateAIPrompt, 'function', 'MiniGameLogger instance should expose generateAIPrompt');

console.log('[shared-module-smoke] ok');
