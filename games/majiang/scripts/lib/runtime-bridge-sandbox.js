'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const BRIDGE_SCRIPT_PATHS = [
  '../../frontend/scripts/runtime/bridge/modules/action-normalizer.js',
  '../../frontend/scripts/runtime/bridge/modules/runtime-factory.js',
  '../../frontend/scripts/runtime/bridge/modules/frontend-effects.js',
  '../../frontend/scripts/runtime/bridge/runtime-bridge.js'
];

function loadMahjongRuntimeBridgeIntoSandbox(sandbox, options = {}) {
  if (!sandbox || typeof sandbox !== 'object') {
    throw new Error('A sandbox object is required to load the Mahjong runtime bridge.');
  }
  if (!sandbox.window) {
    sandbox.window = sandbox;
  }

  const context = vm.createContext(sandbox);
  const scriptPaths = Array.isArray(options.scriptPaths) && options.scriptPaths.length
    ? options.scriptPaths
    : BRIDGE_SCRIPT_PATHS;

  scriptPaths.forEach((relativePath) => {
    const scriptPath = path.resolve(__dirname, relativePath);
    const source = fs.readFileSync(scriptPath, 'utf8');
    vm.runInContext(source, context, { filename: scriptPath });
  });

  return sandbox;
}

module.exports = {
  BRIDGE_SCRIPT_PATHS,
  loadMahjongRuntimeBridgeIntoSandbox
};
