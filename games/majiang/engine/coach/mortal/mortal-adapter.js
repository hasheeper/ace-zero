'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { MjaiEventEncoder } = require('../mjai/event-encoder');
const { MjaiActionDecoder } = require('../mjai/action-decoder');

function resolveMortalConfigPath(options = {}) {
  const mortalRoot = options.mortalRoot || '/Users/liuhang/Documents/acezero/third_party/Mortal';
  if (typeof options.configPath === 'string' && options.configPath.trim()) {
    return options.configPath.trim();
  }
  if (typeof process.env.MORTAL_CFG_PATH === 'string' && process.env.MORTAL_CFG_PATH.trim()) {
    return process.env.MORTAL_CFG_PATH.trim();
  }
  const modelMode = typeof process.env.MORTAL_MODEL_MODE === 'string'
    ? process.env.MORTAL_MODEL_MODE.trim().toLowerCase()
    : '';
  if (modelMode === 'smoke') {
    return path.join(mortalRoot, 'mortal/config.smoke.toml');
  }
  return path.join(mortalRoot, 'mortal/config.real.toml');
}

function createMortalCoachAdapter(runtime, options = {}) {
  let currentRuntime = runtime;
  let encoder = new MjaiEventEncoder(currentRuntime, options);
  let decoder = new MjaiActionDecoder(currentRuntime, options);
  const mortalRoot = options.mortalRoot || '/Users/liuhang/Documents/acezero/third_party/Mortal';
  const condaEnvPath = options.condaEnvPath || path.join(mortalRoot, '.conda/envs/mortal');
  const configPath = resolveMortalConfigPath({
    mortalRoot,
    configPath: options.configPath
  });
  const playerSeatKey = options.perspectiveSeatKey || 'bottom';

  function rebuildCodec(nextRuntime) {
    currentRuntime = nextRuntime || currentRuntime;
    encoder = new MjaiEventEncoder(currentRuntime, options);
    decoder = new MjaiActionDecoder(currentRuntime, options);
  }

  function resolveActiveRuntime() {
    if (currentRuntime && typeof currentRuntime.getRuntime === 'function') {
      return currentRuntime.getRuntime() || currentRuntime;
    }
    return currentRuntime;
  }

  function attachRuntime(nextRuntime) {
    if (!nextRuntime) return currentRuntime;
    rebuildCodec(nextRuntime);
    return currentRuntime;
  }

  function buildBootstrapEvents(optionsOverride = {}) {
    const activeRuntime = resolveActiveRuntime();
    if (!activeRuntime) return [];
    rebuildCodec(activeRuntime);
    const includeStartGame = optionsOverride.includeStartGame !== false;
    const roundEvents = encoder.buildBootstrapEvents();
    if (includeStartGame) {
      return roundEvents;
    }
    return roundEvents.filter((event) => event && event.type !== 'start_game');
  }

  function runInference(mjaiEvents = []) {
    const playerId = encoder.seatMapper.seatKeyToPlayerId(playerSeatKey);
    const lines = Array.isArray(mjaiEvents) ? mjaiEvents : [];
    const input = lines.map((event) => JSON.stringify(event)).join('\n').concat(lines.length ? '\n' : '');
    const inputFilePath = path.join(
      os.tmpdir(),
      `mortal-mjai-${Date.now()}-${Math.random().toString(16).slice(2)}.jsonl`
    );
    fs.writeFileSync(inputFilePath, input, 'utf8');
    const command = [
      'conda',
      'run',
      '-p',
      condaEnvPath,
      'bash',
      '-lc',
      `cd "${mortalRoot}/mortal" && MORTAL_CFG="${configPath}" python mortal.py ${playerId} < "${inputFilePath}"`
    ];

    let result;
    try {
      result = spawnSync(command[0], command.slice(1), {
        cwd: mortalRoot,
        encoding: 'utf8'
      });
    } finally {
      try {
        fs.unlinkSync(inputFilePath);
      } catch (error) {
        // Best-effort cleanup only.
      }
    }

    if (result.status !== 0) {
      return {
        ok: false,
        stdout: result.stdout || '',
        stderr: result.stderr || '',
        lines: [],
        decoded: []
      };
    }

    const outputLines = String(result.stdout || '')
      .split(/\r?\n/g)
      .map((line) => line.trim())
      .filter(Boolean);

    return {
      ok: true,
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      lines: outputLines,
      decoded: outputLines.map((line) => decoder.decode(line, {
        seatKey: playerSeatKey
      }))
    };
  }

  return {
    get encoder() {
      return encoder;
    },
    get decoder() {
      return decoder;
    },
    getRuntime() {
      return currentRuntime;
    },
    attachRuntime,
    buildBootstrapEvents,
    buildRoundBootstrapEvents() {
      return buildBootstrapEvents({ includeStartGame: false });
    },
    encodeEvent(event) {
      return encoder.encodeEvent(event);
    },
    runInference
  };
}

module.exports = {
  createMortalCoachAdapter,
  resolveMortalConfigPath
};
