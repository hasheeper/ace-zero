'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const DEFAULT_VENV_PATH = '/tmp/h13-ranker-venv';
const DEFAULT_PYTHON = 'python3.10';
const FALLBACK_LIBOMP_PREFIX = '/opt/homebrew/opt/libomp';

function parseArgs(argv = []) {
  const args = {
    help: false,
    dryRun: false,
    force: false,
    venv: DEFAULT_VENV_PATH,
    python: DEFAULT_PYTHON
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }
    if (token === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (token === '--force') {
      args.force = true;
      continue;
    }
    if (token === '--venv') {
      args.venv = String(argv[index + 1] || '').trim() || args.venv;
      index += 1;
      continue;
    }
    if (token === '--python') {
      args.python = String(argv[index + 1] || '').trim() || args.python;
      index += 1;
    }
  }

  return args;
}

function printHelp() {
  console.log('Usage: node games/majiang/scripts/setup-hard-mortal-ranker-env.js [options]');
  console.log('');
  console.log('Options:');
  console.log('  --dry-run        Print the planned environment actions without changing files.');
  console.log('  --force          Recreate the venv path before installing dependencies.');
  console.log('  --venv <path>    Ranker venv path. Default: /tmp/h13-ranker-venv');
  console.log('  --python <cmd>   Python used to create the venv. Default: python3.10');
}

function runCommand(command, args = [], options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: options.stdio || 'pipe',
    env: options.env || process.env
  });
  if (result.status !== 0) {
    const error = new Error(`Command failed: ${command} ${args.join(' ')}`);
    error.command = command;
    error.args = args;
    error.status = result.status;
    error.stdout = result.stdout || '';
    error.stderr = result.stderr || '';
    throw error;
  }
  return result;
}

function commandProbe(command, args = ['--version']) {
  const result = spawnSync(command, args, {
    encoding: 'utf8'
  });
  return {
    command,
    available: result.status === 0,
    stdout: String(result.stdout || '').trim(),
    stderr: String(result.stderr || '').trim()
  };
}

function resolveLibomp() {
  const brewResult = spawnSync('brew', ['--prefix', 'libomp'], {
    encoding: 'utf8'
  });
  const brewPrefix = brewResult.status === 0 ? String(brewResult.stdout || '').trim() : '';
  if (brewPrefix && fs.existsSync(brewPrefix)) {
    return {
      available: true,
      prefix: brewPrefix,
      source: 'brew'
    };
  }
  if (fs.existsSync(FALLBACK_LIBOMP_PREFIX)) {
    return {
      available: true,
      prefix: FALLBACK_LIBOMP_PREFIX,
      source: 'fallback'
    };
  }
  return {
    available: false,
    prefix: null,
    source: null,
    warning: 'Homebrew libomp was not found. Install it manually with `brew install libomp` if LightGBM import fails.'
  };
}

function buildPythonEnv(libomp) {
  const env = { ...process.env };
  if (libomp && libomp.available && libomp.prefix) {
    const libPath = path.join(libomp.prefix, 'lib');
    env.DYLD_LIBRARY_PATH = env.DYLD_LIBRARY_PATH
      ? `${libPath}:${env.DYLD_LIBRARY_PATH}`
      : libPath;
  }
  return env;
}

function safeForceRemoveVenv(venvPath) {
  const resolved = path.resolve(venvPath);
  if (!resolved.startsWith('/tmp/')) {
    throw new Error(`Refusing to --force remove non-/tmp venv path: ${resolved}`);
  }
  fs.rmSync(resolved, { recursive: true, force: true });
}

function parseJson(text) {
  const trimmed = String(text || '').trim();
  return trimmed ? JSON.parse(trimmed) : null;
}

function verifyLightgbm(venvPython, env) {
  const program = [
    'import json',
    'import sys',
    'import lightgbm',
    'print(json.dumps({"python": sys.executable, "pythonVersion": sys.version.split()[0], "lightgbmVersion": lightgbm.__version__}))'
  ].join('; ');
  const result = runCommand(venvPython, ['-c', program], { env });
  return parseJson(result.stdout);
}

function buildDryRunSummary(args, pythonProbe, libomp) {
  const venvPath = path.resolve(args.venv);
  return {
    status: 'dry-run',
    venvPath,
    venvPython: path.join(venvPath, 'bin', 'python'),
    basePython: args.python,
    basePythonAvailable: pythonProbe.available,
    basePythonVersion: pythonProbe.stdout || pythonProbe.stderr || null,
    libomp,
    actions: [
      `${args.python} -m venv ${venvPath}`,
      `${path.join(venvPath, 'bin', 'python')} -m pip install --upgrade pip setuptools wheel`,
      `${path.join(venvPath, 'bin', 'python')} -m pip install lightgbm`
    ],
    notes: [
      '/tmp/h13-ranker-venv is a temporary offline training environment and can be deleted/rebuilt.',
      'The script does not install Homebrew packages or modify Mortal conda environments.'
    ]
  };
}

function setupEnvironment(args) {
  const pythonProbe = commandProbe(args.python, ['--version']);
  const libomp = resolveLibomp();
  const venvPath = path.resolve(args.venv);
  const venvPython = path.join(venvPath, 'bin', 'python');

  if (args.dryRun) {
    return buildDryRunSummary(args, pythonProbe, libomp);
  }

  if (!pythonProbe.available) {
    throw new Error(`Python command is not available: ${args.python}`);
  }

  if (args.force) {
    safeForceRemoveVenv(venvPath);
  }

  fs.mkdirSync(path.dirname(venvPath), { recursive: true });
  if (!fs.existsSync(venvPython)) {
    runCommand(args.python, ['-m', 'venv', venvPath], {
      stdio: 'inherit'
    });
  }

  const env = buildPythonEnv(libomp);
  runCommand(venvPython, ['-m', 'pip', 'install', '--upgrade', 'pip', 'setuptools', 'wheel'], {
    stdio: 'inherit',
    env
  });
  runCommand(venvPython, ['-m', 'pip', 'install', 'lightgbm'], {
    stdio: 'inherit',
    env
  });

  const verification = verifyLightgbm(venvPython, env);
  return {
    status: 'ready',
    venvPath,
    venvPython,
    basePython: args.python,
    basePythonVersion: pythonProbe.stdout || pythonProbe.stderr || null,
    libomp,
    verification,
    recommendedCommands: [
      `node games/majiang/scripts/validate-hard-mortal-ranker-env.js --python ${venvPython}`,
      `node games/majiang/scripts/run-hard-mortal-ranker-experiment.js --smoke --python ${venvPython}`
    ]
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  try {
    console.log(JSON.stringify(setupEnvironment(args), null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      status: 'failed',
      error: error.message,
      command: error.command || null,
      args: error.args || null,
      exitCode: error.status || null,
      stdout: error.stdout || '',
      stderr: error.stderr || ''
    }, null, 2));
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  DEFAULT_VENV_PATH,
  DEFAULT_PYTHON,
  FALLBACK_LIBOMP_PREFIX,
  parseArgs,
  resolveLibomp,
  buildPythonEnv,
  setupEnvironment,
  main
};
