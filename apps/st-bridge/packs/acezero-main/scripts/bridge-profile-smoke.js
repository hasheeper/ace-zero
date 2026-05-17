#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {
  assert,
  assertEqual,
  REPO_ROOT
} = require('./smoke-utils');

const bridgeSource = fs.readFileSync(path.join(REPO_ROOT, 'apps/st-bridge/bridge.js'), 'utf8');

function createSandbox({ bridgeUrl, globals = {} }) {
  const loadedScriptUrls = [];
  const sandbox = {
    ...globals,
    console,
    URL,
    setTimeout,
    clearTimeout,
    performance: { getEntriesByType: () => [] },
    document: {
      currentScript: { src: bridgeUrl },
      getElementsByTagName: () => []
    },
    fetch: async (url) => {
      const href = String(url);
      if (href.includes('/manifest.json')) {
        return {
          ok: true,
          json: async () => ({
            version: 'test',
            defaultPack: 'acezero-main',
            activePack: 'acezero-main',
            packs: {
              'acezero-main': {
                product: 'acezero',
                globals: {
                  ACE0_GAME_APP_URL: 'https://hasheeper.github.io/ace-zero/index.html?app=game',
                  ACE0_DASHBOARD_APP_URL: 'https://hasheeper.github.io/ace-zero/index.html?app=dashboard',
                  ACE0_ACT_RESULT_APP_URL: 'https://hasheeper.github.io/ace-zero/apps/act-result/index.html'
                },
                scripts: [
                  { id: 'acezero-test-script', type: 'script', url: './packs/acezero-main/test-script.js' }
                ]
              }
            }
          })
        };
      }
      if (href.includes('/packs/acezero-main/test-script.js')) {
        loadedScriptUrls.push(href);
        return {
          ok: true,
          text: async () => 'globalThis.__ACE0_BRIDGE_PROFILE_SCRIPT_LOADED__ = true;'
        };
      }
      throw new Error(`Unexpected fetch: ${href}`);
    },
    __loadedScriptUrls: loadedScriptUrls
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  return sandbox;
}

async function runBridge(options) {
  const sandbox = createSandbox(options);
  vm.createContext(sandbox);
  vm.runInContext(bridgeSource, sandbox, { filename: 'bridge.js' });
  const deadline = Date.now() + 1000;
  while (!sandbox.STBridge?.state?.loaded?.length && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert(sandbox.STBridge?.state, 'Bridge should expose STBridge.state');
  assert(sandbox.__ACE0_BRIDGE_PROFILE_SCRIPT_LOADED__, 'Bridge should load the test script');
  return sandbox;
}

(async () => {
  const prod = await runBridge({
    bridgeUrl: 'https://hasheeper.github.io/ace-zero/apps/st-bridge/bridge.js?v=test'
  });
  assertEqual(prod.STBridge.state.env, 'prod', 'prod bridge should expose prod env');
  assertEqual(prod.STBridge.state.appBaseUrl, 'https://hasheeper.github.io/ace-zero', 'prod bridge should expose GitHub app base');
  assertEqual(prod.STBridge.state.fullDocWorldbookName, 'AceZeroInfo-MVUVer-1.2.4', 'prod bridge should use main worldbook');
  assertEqual(prod.ACE0_GAME_APP_URL, 'https://hasheeper.github.io/ace-zero/index.html?app=game', 'prod bridge should publish game URL');
  assert(prod.__loadedScriptUrls.every(url => url.startsWith('https://hasheeper.github.io/ace-zero/apps/st-bridge/')), 'prod scripts should load from GitHub Pages');

  const local = await runBridge({
    bridgeUrl: 'http://127.0.0.1:4173/apps/st-bridge/bridge.js?v=dev'
  });
  assertEqual(local.STBridge.state.env, 'local', 'local bridge should expose local env');
  assertEqual(local.STBridge.state.appBaseUrl, 'http://127.0.0.1:4173', 'local bridge should expose local app base');
  assertEqual(local.STBridge.state.fullDocWorldbookName, 'AceZeroInfo-MVUVer-2.0-Test', 'local bridge should use test worldbook');
  assertEqual(local.STBridge.utils.resolveAppUrl('dashboard'), 'http://127.0.0.1:4173/index.html?app=dashboard', 'local dashboard URL should point to local app host');
  assertEqual(local.STBridge.utils.resolveAppUrl('act-result'), 'http://127.0.0.1:4173/apps/act-result/index.html', 'local ACT_RESULT URL should point to local app');
  assert(local.__loadedScriptUrls.every(url => url.startsWith('http://127.0.0.1:4173/apps/st-bridge/')), 'local scripts should load from local server');

  const explicit = await runBridge({
    bridgeUrl: 'http://127.0.0.1:4173/apps/st-bridge/bridge.js?env=local&appBase=http%3A%2F%2F127.0.0.1%3A4999&worldbook=QueryBook&v=dev',
    globals: { ACE0_FULL_DOC_WORLDBOOK_NAME: 'GlobalBook' }
  });
  assertEqual(explicit.STBridge.state.appBaseUrl, 'http://127.0.0.1:4999', 'appBase query should override default local base');
  assertEqual(explicit.STBridge.state.fullDocWorldbookName, 'GlobalBook', 'global worldbook should override query worldbook');

  const stverSource = fs.readFileSync(path.join(REPO_ROOT, 'st/wrappers/STver.html'), 'utf8');
  const actResultWrapperSource = fs.readFileSync(path.join(REPO_ROOT, 'st/wrappers/ACT_RESULT.html'), 'utf8');
  const dashboardLoaderSource = fs.readFileSync(path.join(REPO_ROOT, 'apps/st-bridge/packs/acezero-main/dashboard/loader.js'), 'utf8');
  assert(stverSource.includes("resolveAppUrl('game')"), 'STver wrapper should use bridge app resolver for game');
  assert(actResultWrapperSource.includes('ACE0_ACT_RESULT_APP_URL'), 'ACT_RESULT wrapper should accept bridge-published ACT_RESULT app URL');
  assert(actResultWrapperSource.includes("resolveAppUrl('act-result')"), 'ACT_RESULT wrapper should use bridge app resolver for ACT_RESULT');
  assert(dashboardLoaderSource.includes("resolveAppUrl('dashboard')"), 'Dashboard loader should use bridge app resolver for dashboard');

  console.log('[bridge-profile-smoke] all checks passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
