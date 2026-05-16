#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { defaultSuiteName, suiteDefinitions } from './validation/suites.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const excludedCheckDirs = new Set(['.git', 'node_modules', '.cache']);

class ValidationError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.name = 'ValidationError';
    this.exitCode = exitCode;
  }
}

function printUsage() {
  console.log('Usage: node scripts/validate.mjs [suite|list]');
  console.log('');
  Object.entries(suiteDefinitions).forEach(([name, suite]) => {
    console.log(`  ${name.padEnd(5)} ${suite.description}`);
  });
}

function resolveRepoPath(relativePath) {
  return path.resolve(repoRoot, relativePath);
}

async function assertFileExists(relativePath) {
  try {
    const stats = await fs.stat(resolveRepoPath(relativePath));
    if (!stats.isFile()) throw new Error('not a file');
  } catch (_) {
    throw new ValidationError(`Missing required file: ${relativePath}`);
  }
}

async function runCommand(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: repoRoot,
    env: { ...process.env, ...(options.env || {}) },
    stdio: 'inherit'
  });
  const code = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });
  if (code !== 0) {
    throw new ValidationError(`${command} ${args.join(' ')} failed with exit code ${code}`, code || 1);
  }
}

async function collectJavaScriptFiles(dir = repoRoot) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.') && excludedCheckDirs.has(entry.name)) continue;
    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (excludedCheckDirs.has(entry.name)) continue;
      files.push(...await collectJavaScriptFiles(absolutePath));
      continue;
    }
    if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.mjs'))) {
      files.push(absolutePath);
    }
  }
  return files.sort((a, b) => a.localeCompare(b));
}

async function runJsonTask(task) {
  for (const file of task.files) {
    await assertFileExists(file);
    const raw = await fs.readFile(resolveRepoPath(file), 'utf8');
    try {
      JSON.parse(raw);
    } catch (error) {
      throw new ValidationError(`Invalid JSON in ${file}: ${error.message}`);
    }
  }
  console.log(`[ok] parsed ${task.files.length} JSON files`);
}

async function runNodeCheckAllTask() {
  const files = await collectJavaScriptFiles();
  for (const file of files) {
    await runCommand(process.execPath, ['--check', file]);
  }
  console.log(`[ok] node --check passed for ${files.length} files`);
}

async function runEsmImportTask(task) {
  for (const file of task.files) {
    await assertFileExists(file);
    await import(pathToFileURL(resolveRepoPath(file)).href);
  }
  console.log(`[ok] imported ${task.files.length} ESM modules`);
}

async function runNodeTask(task) {
  await assertFileExists(task.script);
  await runCommand(process.execPath, [task.script], { env: task.env });
}

async function runCdpPreflightTask() {
  const cdpPort = process.env.ACEZERO_CDP_PORT || '9223';
  const cdpBase = `http://127.0.0.1:${cdpPort}`;
  try {
    const response = await fetch(`${cdpBase}/json/version`, {
      signal: AbortSignal.timeout(1500)
    });
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }
  } catch (error) {
    const targetUrl = process.env.ACEZERO_TEXAS_URL || '(using each Texas script default target URL)';
    throw new ValidationError(
      [
        'Texas CDP validation requires a running Chrome/Chromium remote-debugging service.',
        `Expected CDP endpoint: ${cdpBase}/json/version`,
        `Texas target URL: ${targetUrl}`,
        'Start a browser with --remote-debugging-port or set ACEZERO_CDP_PORT to the active CDP port,',
        'and make sure the Texas page is served by a local static server before rerunning this suite.',
        `Underlying error: ${error.message}`
      ].join('\n'),
      2
    );
  }
  console.log(`[ok] CDP endpoint available at ${cdpBase}`);
}

async function runMortalPreflightTask() {
  const mortalRoot = process.env.MORTAL_ROOT || '/Users/liuhang/Documents/acezero/third_party/Mortal';
  const configPath = process.env.MORTAL_CFG_PATH || path.join(mortalRoot, 'mortal', 'config.smoke.toml');
  const condaEnvPath = process.env.MORTAL_CONDA_ENV_PATH || path.join(mortalRoot, '.conda/envs/mortal');
  const requiredFiles = [
    path.join(mortalRoot, 'mortal', 'mortal.py'),
    configPath
  ];
  const requiredDirs = [
    mortalRoot,
    condaEnvPath
  ];

  const missing = [];
  for (const file of requiredFiles) {
    try {
      const stats = await fs.stat(file);
      if (!stats.isFile()) missing.push(file);
    } catch (_) {
      missing.push(file);
    }
  }
  for (const dir of requiredDirs) {
    try {
      const stats = await fs.stat(dir);
      if (!stats.isDirectory()) missing.push(dir);
    } catch (_) {
      missing.push(dir);
    }
  }

  if (missing.length) {
    throw new ValidationError(
      [
        'Mahjong Mortal validation requires a local Mortal model environment.',
        `MORTAL_ROOT: ${mortalRoot}`,
        `MORTAL_CFG_PATH: ${configPath}`,
        `MORTAL_CONDA_ENV_PATH: ${condaEnvPath}`,
        `Missing paths: ${missing.join(', ')}`,
        'Install or point these environment variables at a working Mortal checkout before rerunning this suite.'
      ].join('\n'),
      2
    );
  }

  await runCommand('conda', ['--version']);
  console.log(`[ok] Mortal environment available at ${mortalRoot}`);
}

async function runTask(task, index, total) {
  console.log(`\n[${index + 1}/${total}] ${task.name}`);
  if (task.type === 'json') return runJsonTask(task);
  if (task.type === 'node-check-all') return runNodeCheckAllTask(task);
  if (task.type === 'esm-import') return runEsmImportTask(task);
  if (task.type === 'node') return runNodeTask(task);
  if (task.type === 'cdp-preflight') return runCdpPreflightTask(task);
  if (task.type === 'mortal-preflight') return runMortalPreflightTask(task);
  throw new ValidationError(`Unknown validation task type: ${task.type}`);
}

async function main() {
  const suiteName = process.argv[2] || defaultSuiteName;
  if (suiteName === 'list' || suiteName === '--help' || suiteName === '-h') {
    printUsage();
    return;
  }

  const suite = suiteDefinitions[suiteName];
  if (!suite) {
    printUsage();
    throw new ValidationError(`Unknown validation suite: ${suiteName}`);
  }

  console.log(`[validate] suite=${suiteName}`);
  console.log(`[validate] ${suite.description}`);
  for (let index = 0; index < suite.tasks.length; index += 1) {
    await runTask(suite.tasks[index], index, suite.tasks.length);
  }
  console.log(`\n[validate] ${suiteName} passed`);
}

main().catch((error) => {
  console.error(`\n[validate] failed: ${error.message}`);
  process.exitCode = Number.isInteger(error.exitCode) ? error.exitCode : 1;
});
