'use strict';

const http = require('http');
const path = require('path');
const { createCoachServer, validateMortalConfigAssets } = require('./coach-provider-server');
const { resolveMortalConfigPath } = require('../engine/coach/mortal/mortal-adapter');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function requestJson(port, path, payload) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: '127.0.0.1',
      port,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        try {
          const body = Buffer.concat(chunks).toString('utf8');
          resolve({
            statusCode: response.statusCode,
            body: body ? JSON.parse(body) : null
          });
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on('error', reject);
    request.write(JSON.stringify(payload));
    request.end();
  });
}

function createCoachSession() {
  const now = Date.now();
  return {
    sessionKey: `z0-j0::bottom::${now}`,
    perspectiveSeat: 'bottom',
    round: {
      id: 'z0-j0',
      label: '东1局',
      zhuangfeng: 0,
      jushu: 0,
      changbang: 0,
      lizhibang: 0,
      dealerSeat: 'bottom'
    },
    seatKeys: ['bottom', 'right', 'top', 'left'],
    scoreMap: {
      bottom: 25000,
      right: 25000,
      top: 25000,
      left: 25000
    },
    baopai: ['m1'],
    remaining: 69,
    initialDeal: {
      source: 'test',
      remaining: 69,
      baopai: ['m1'],
      haipai: [
        ['m1', 'm2', 'm3', 'p1', 'p2', 'p3', 's1', 's2', 's3', 'z1', 'z2', 'z3', 'z4'],
        ['m1', 'm1', 'm1', 'p1', 'p1', 'p1', 's1', 's1', 's1', 'z1', 'z1', 'z1', 'z1'],
        ['m2', 'm2', 'm2', 'p2', 'p2', 'p2', 's2', 's2', 's2', 'z2', 'z2', 'z2', 'z2'],
        ['m3', 'm3', 'm3', 'p3', 'p3', 'p3', 's3', 's3', 's3', 'z3', 'z3', 'z3', 'z3']
      ]
    },
    runtimeEvents: [
      {
        seq: 1,
        type: 'tile:draw',
        payload: {
          seat: 'bottom',
          tileCode: 'm4'
        },
        timestamp: now
      }
    ]
  };
}

async function main() {
  const port = 14527;
  const smokeConfigPath = path.join(__dirname, '..', '..', 'third_party', 'Mortal', 'mortal', 'config.smoke.toml');
  const service = createCoachServer({ port, configPath: smokeConfigPath });
  await new Promise((resolve) => service.listen(resolve));

  try {
    const expectedConfigPath = resolveMortalConfigPath({ configPath: smokeConfigPath });
    assert(service.configPath === expectedConfigPath, `expected resolved config path ${expectedConfigPath}, got ${service.configPath}`);
    assert(service.assetValidation && service.assetValidation.ok === true, `expected asset validation to pass for ${service.configPath}`);
    const coachSession = createCoachSession();
    const syncResponse = await requestJson(port, '/coach/session/sync', {
      coachSession
    });
    assert(syncResponse.statusCode === 200, `expected sync 200, got ${syncResponse.statusCode}`);
    assert(syncResponse.body && syncResponse.body.ok === true, `expected ok sync response, got ${JSON.stringify(syncResponse.body)}`);
    assert(syncResponse.body.lastSeq === 1, `expected synced lastSeq=1, got ${JSON.stringify(syncResponse.body)}`);

    const suggestResponse = await requestJson(port, '/coach/session/suggest', {
      sessionKey: coachSession.sessionKey,
      requestToken: 'test-token'
    });
    assert(suggestResponse.statusCode === 200, `expected suggest 200, got ${suggestResponse.statusCode}`);
    assert(suggestResponse.body && suggestResponse.body.ok === true, `expected ok coach response, got ${JSON.stringify(suggestResponse.body)}`);
    assert(suggestResponse.body.suggestion && suggestResponse.body.suggestion.recommended, `expected recommended suggestion, got ${JSON.stringify(suggestResponse.body)}`);
    assert(suggestResponse.body.suggestion.contextSignature === 'test-token', `expected request token to round-trip, got ${JSON.stringify(suggestResponse.body.suggestion)}`);

    console.log('[PASS] coach-provider-server-smoke');
    console.log(`  snapshot=${JSON.stringify({
      sync: syncResponse.body,
      suggest: {
        mjaiEventCount: suggestResponse.body.mjaiEventCount,
        suggestion: suggestResponse.body.suggestion
      }
    })}`);
  } finally {
    await new Promise((resolve) => service.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
