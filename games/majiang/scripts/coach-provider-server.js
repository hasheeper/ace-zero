'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const { createMortalCoachAdapter, resolveMortalConfigPath } = require('../engine/coach/mortal/mortal-adapter');
const { buildCoachSuggestion } = require('../engine/coach/review/suggestion-format');
const { localTileToMjai } = require('../engine/coach/mjai/tile-codec');

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 14517;
const DEFAULT_MORTAL_ROOT = path.resolve(__dirname, '../../third_party/Mortal');
const DEFAULT_CONDA_ENV_PATH = path.join(DEFAULT_MORTAL_ROOT, '.conda/envs/mortal');
const CANONICAL_SEAT_KEYS = ['bottom', 'right', 'top', 'left'];

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  response.end(JSON.stringify(payload));
}

function collectBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function normalizeNumber(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function normalizeSeatKeys(value) {
  const seatKeys = Array.isArray(value) ? value : [];
  const unique = seatKeys
    .filter((seatKey) => typeof seatKey === 'string' && CANONICAL_SEAT_KEYS.includes(seatKey))
    .filter((seatKey, index, list) => list.indexOf(seatKey) === index);
  return unique.length ? CANONICAL_SEAT_KEYS.filter((seatKey) => unique.includes(seatKey)) : CANONICAL_SEAT_KEYS.slice();
}

function readRequiredModelPaths(configPath) {
  if (!configPath || !fs.existsSync(configPath)) {
    return [];
  }
  const content = fs.readFileSync(configPath, 'utf8');
  const lines = content.split(/\r?\n/g);
  let currentSection = '';
  const requiredPaths = [];

  lines.forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) return;
    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      return;
    }
    if (currentSection !== 'control') return;
    if (!/^((best_)?state_file)\s*=/.test(line)) return;
    const match = line.match(/=\s*['"]([^'"]+)['"]/);
    if (match && match[1]) {
      requiredPaths.push(match[1]);
    }
  });

  return requiredPaths.filter((filePath, index, list) => list.indexOf(filePath) === index);
}

function validateMortalConfigAssets(configPath) {
  const requiredPaths = readRequiredModelPaths(configPath);
  const missingPaths = requiredPaths.filter((filePath) => !fs.existsSync(filePath));
  return {
    ok: missingPaths.length === 0,
    requiredPaths,
    missingPaths
  };
}

function buildRuntimeShimFromSession(coachSession = {}) {
  const round = coachSession.round && typeof coachSession.round === 'object' ? coachSession.round : {};
  const seatKeys = normalizeSeatKeys(coachSession.seatKeys);
  const scoreMap = coachSession.scoreMap && typeof coachSession.scoreMap === 'object' ? coachSession.scoreMap : {};
  const initialDeal = coachSession.initialDeal && typeof coachSession.initialDeal === 'object' ? coachSession.initialDeal : {};

  return {
    activeSeats: seatKeys.slice(),
    board: {
      zhuangfeng: normalizeNumber(round.zhuangfeng, 0),
      jushu: normalizeNumber(round.jushu, 0),
      changbang: normalizeNumber(round.changbang, 0),
      lizhibang: normalizeNumber(round.lizhibang, 0),
      defen: seatKeys.map((seatKey) => normalizeNumber(scoreMap[seatKey], 25000))
    },
    getWallState() {
      return {
        baopai: Array.isArray(coachSession.baopai) && coachSession.baopai.length
          ? coachSession.baopai.slice()
          : (Array.isArray(initialDeal.baopai) ? initialDeal.baopai.slice() : ['z1']),
        remaining: normalizeNumber(coachSession.remaining, normalizeNumber(initialDeal.remaining, 0))
      };
    },
    getSeatHandCodes(seatKey) {
      const seatIndex = seatKeys.indexOf(seatKey);
      if (seatIndex < 0) return [];
      const haipai = Array.isArray(initialDeal.haipai) ? initialDeal.haipai : [];
      return Array.isArray(haipai[seatIndex]) ? haipai[seatIndex].slice() : [];
    },
    getPlayerIdentityIndex(seatKey) {
      return seatKeys.indexOf(seatKey);
    },
    getSeatKeyByPlayerIdentity(playerIndex) {
      return seatKeys[playerIndex] || null;
    },
    getDealerSeat() {
      return typeof round.dealerSeat === 'string' ? round.dealerSeat : (seatKeys[0] || 'bottom');
    }
  };
}

function buildBootstrapEventsFromSession(coachSession = {}, adapter) {
  const runtimeShim = adapter.getRuntime();
  const perspectiveSeatKey = coachSession.perspectiveSeat || 'bottom';
  const seatKeys = adapter.encoder.seatMapper.seatKeys;
  const initialDeal = coachSession.initialDeal && typeof coachSession.initialDeal === 'object' ? coachSession.initialDeal : {};
  const round = coachSession.round && typeof coachSession.round === 'object' ? coachSession.round : {};
  const tehais = seatKeys.map((seatKey, seatIndex) => {
    if (seatKey !== perspectiveSeatKey) {
      return new Array(13).fill('?');
    }
    const source = Array.isArray(initialDeal.haipai) && Array.isArray(initialDeal.haipai[seatIndex])
      ? initialDeal.haipai[seatIndex]
      : runtimeShim.getSeatHandCodes(seatKey).slice(0, 13);
    return source.map((tileCode) => localTileToMjai(tileCode) || '?').slice(0, 13);
  });

  return [
    { type: 'start_game' },
    {
      type: 'start_kyoku',
      bakaze: ['E', 'S', 'W', 'N'][normalizeNumber(round.zhuangfeng, 0)] || 'E',
      dora_marker: localTileToMjai((Array.isArray(coachSession.baopai) && coachSession.baopai[0]) || (Array.isArray(initialDeal.baopai) && initialDeal.baopai[0]) || 'z1') || '?',
      kyoku: Math.max(1, normalizeNumber(round.jushu, 0) + 1),
      honba: normalizeNumber(round.changbang, 0),
      kyotaku: normalizeNumber(round.lizhibang, 0),
      oya: adapter.encoder.seatMapper.getDealerPlayerId(),
      scores: adapter.encoder.seatMapper.getScoresByPlayerId(),
      tehais
    }
  ];
}

function createSessionRecord(coachSession = {}, options = {}) {
  const runtimeShim = buildRuntimeShimFromSession(coachSession);
  const adapter = createMortalCoachAdapter(runtimeShim, {
    perspectiveSeatKey: coachSession.perspectiveSeat || 'bottom',
    mortalRoot: options.mortalRoot,
    condaEnvPath: options.condaEnvPath,
    configPath: options.configPath,
    seatKeys: normalizeSeatKeys(coachSession.seatKeys)
  });

  return {
    sessionKey: coachSession.sessionKey,
    roundId: coachSession.round && coachSession.round.id ? coachSession.round.id : 'single-round',
    perspectiveSeat: coachSession.perspectiveSeat || 'bottom',
    sessionSignature: JSON.stringify({
      round: coachSession.round || null,
      initialDeal: coachSession.initialDeal || null,
      seatKeys: coachSession.seatKeys || null
    }),
    lastSeq: 0,
    mjaiEvents: buildBootstrapEventsFromSession(coachSession, adapter),
    adapter,
    updatedAt: Date.now()
  };
}

function shouldResetSession(record, coachSession = {}) {
  if (!record) return true;
  const signature = JSON.stringify({
    round: coachSession.round || null,
    initialDeal: coachSession.initialDeal || null,
    seatKeys: coachSession.seatKeys || null
  });
  return record.sessionSignature !== signature;
}

function syncSessionRecord(record, coachSession = {}) {
  const runtimeEvents = Array.isArray(coachSession.runtimeEvents) ? coachSession.runtimeEvents.slice() : [];
  runtimeEvents.sort((a, b) => normalizeNumber(a && a.seq, 0) - normalizeNumber(b && b.seq, 0));

  let replayFromScratch = false;
  if (runtimeEvents.length && record.lastSeq > 0) {
    const expectedNextSeq = record.lastSeq + 1;
    const firstNewSeq = normalizeNumber(runtimeEvents.find((event) => normalizeNumber(event && event.seq, 0) > record.lastSeq)?.seq, expectedNextSeq);
    replayFromScratch = firstNewSeq !== expectedNextSeq;
  }
  if (replayFromScratch) {
    record.lastSeq = 0;
    record.mjaiEvents = buildBootstrapEventsFromSession(coachSession, record.adapter);
  }

  runtimeEvents.forEach((event) => {
    const seq = normalizeNumber(event && event.seq, 0);
    if (!seq || seq <= record.lastSeq) return;
    if (!event || event.type === 'round:start' || event.type === 'deal:initial' || event.type === 'action-window:update') {
      record.lastSeq = seq;
      return;
    }
    record.mjaiEvents.push(...record.adapter.encodeEvent(event));
    record.lastSeq = seq;
  });

  record.updatedAt = Date.now();
  return record;
}

function createCoachServer(options = {}) {
  const host = options.host || DEFAULT_HOST;
  const port = Number(options.port || DEFAULT_PORT);
  const mortalRoot = options.mortalRoot || DEFAULT_MORTAL_ROOT;
  const condaEnvPath = options.condaEnvPath || DEFAULT_CONDA_ENV_PATH;
  const configPath = resolveMortalConfigPath({
    mortalRoot,
    configPath: options.configPath
  });
  const assetValidation = validateMortalConfigAssets(configPath);
  const sessions = new Map();

  function getOrCreateRecord(coachSession = {}) {
    const sessionKey = typeof coachSession.sessionKey === 'string' && coachSession.sessionKey
      ? coachSession.sessionKey
      : null;
    if (!sessionKey) {
      throw new Error('coachSession.sessionKey is required.');
    }
    let record = sessions.get(sessionKey) || null;
    if (shouldResetSession(record, coachSession)) {
      record = createSessionRecord(coachSession, {
        mortalRoot,
        condaEnvPath,
        configPath
      });
      sessions.set(sessionKey, record);
    }
    return syncSessionRecord(record, coachSession);
  }

  const server = http.createServer(async (request, response) => {
    if (request.method === 'OPTIONS') {
      return sendJson(response, 200, { ok: true });
    }
    if (request.method !== 'POST') {
      return sendJson(response, 405, { ok: false, error: 'method-not-allowed' });
    }

    try {
      const rawBody = await collectBody(request);
      const payload = rawBody ? JSON.parse(rawBody) : {};

      if (request.url === '/coach/session/sync') {
        const coachSession = payload && payload.coachSession && typeof payload.coachSession === 'object'
          ? payload.coachSession
          : null;
        if (!coachSession) {
          return sendJson(response, 400, { ok: false, error: 'coachSession is required.' });
        }
        const record = getOrCreateRecord(coachSession);
        return sendJson(response, 200, {
          ok: true,
          sessionKey: record.sessionKey,
          roundId: record.roundId,
          lastSeq: record.lastSeq,
          mjaiEventCount: record.mjaiEvents.length
        });
      }

      if (request.url === '/coach/session/suggest') {
        const sessionKey = payload && typeof payload.sessionKey === 'string' ? payload.sessionKey : null;
        if (!sessionKey || !sessions.has(sessionKey)) {
          return sendJson(response, 404, { ok: false, error: 'coach session not found.' });
        }
        const record = sessions.get(sessionKey);
        const inference = record.adapter.runInference(record.mjaiEvents);
        const suggestion = buildCoachSuggestion(inference, {
          source: 'mortal-http',
          perspectiveSeatKey: record.perspectiveSeat
        });
        if (payload && typeof payload.requestToken === 'string' && payload.requestToken) {
          suggestion.contextSignature = payload.requestToken;
        }
        if (!inference || !inference.ok) {
          const errorMessage = [
            suggestion && suggestion.stderr ? suggestion.stderr.trim() : '',
            inference && inference.stderr ? String(inference.stderr).trim() : '',
            'Mortal 推理失败。'
          ].find(Boolean);
          return sendJson(response, 502, {
            ok: false,
            error: errorMessage,
            sessionKey,
            mjaiEventCount: record.mjaiEvents.length,
            suggestion
          });
        }
        return sendJson(response, 200, {
          ok: true,
          sessionKey,
          lastSeq: record.lastSeq,
          mjaiEventCount: record.mjaiEvents.length,
          suggestion
        });
      }

      return sendJson(response, 404, { ok: false, error: 'not-found' });
    } catch (error) {
      return sendJson(response, 500, {
        ok: false,
        error: error && error.message ? error.message : String(error)
      });
    }
  });

  return {
    server,
    listen(callback) {
      server.listen(port, host, callback);
      return server;
    },
    close(callback) {
      return server.close(callback);
    },
    host,
    port,
    mortalRoot,
    condaEnvPath,
    configPath,
    assetValidation,
    sessions
  };
}

if (require.main === module) {
  const service = createCoachServer();
  if (!service.assetValidation.ok) {
    console.error('[CoachProvider] missing Mortal model files for selected config.');
    console.error(`[CoachProvider] config: ${service.configPath}`);
    service.assetValidation.missingPaths.forEach((filePath) => {
      console.error(`[CoachProvider] missing: ${filePath}`);
    });
    process.exit(1);
  }
  service.listen(() => {
    console.log(`[CoachProvider] listening on http://${service.host}:${service.port}`);
    console.log(`[CoachProvider] mortal root: ${service.mortalRoot}`);
    console.log(`[CoachProvider] conda env: ${service.condaEnvPath}`);
    console.log(`[CoachProvider] config: ${service.configPath}`);
  });
}

module.exports = {
  createCoachServer,
  validateMortalConfigAssets
};
