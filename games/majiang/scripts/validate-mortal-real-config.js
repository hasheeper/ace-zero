'use strict';

const path = require('path');
const { validateMortalConfigAssets } = require('./coach-provider-server');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function main() {
  const configPath = path.join(
    __dirname,
    '..',
    '..',
    'third_party',
    'Mortal',
    'mortal',
    'config.real.toml'
  );
  const validation = validateMortalConfigAssets(configPath);

  assert(Array.isArray(validation.requiredPaths) && validation.requiredPaths.length >= 1, `expected real config to reference model files, got ${JSON.stringify(validation)}`);

  if (!validation.ok) {
    console.log('[WARN] mortal-real-config-assets-missing');
    console.log(`  config=${configPath}`);
    console.log(`  missing=${JSON.stringify(validation.missingPaths)}`);
    return;
  }

  console.log('[PASS] mortal-real-config-assets-ready');
  console.log(`  config=${configPath}`);
  console.log(`  required=${JSON.stringify(validation.requiredPaths)}`);
}

main();
