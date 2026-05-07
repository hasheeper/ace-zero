#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {
  assert,
  assertEqual,
  REPO_ROOT,
  loadTavernSandbox,
  createTavernRuntime,
  createActStateAt
} = require('./smoke-utils');

const repoRoot = REPO_ROOT;

function loadCombatHelper() {
  const sandbox = { console, globalThis: null, window: undefined };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  const file = path.join(repoRoot, 'games/shared/combat-settlement.js');
  vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
  assert(sandbox.ACE0CombatSettlement, 'combat settlement helper should install');
  return sandbox.ACE0CombatSettlement;
}

function createBrowserSandbox() {
  const sandbox = {
    console,
    globalThis: null,
    window: null,
    global: null,
    Currency: {
      amount: (value) => `${value} silver`,
      compact: (value) => `${value}`
    }
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  sandbox.global = sandbox;
  vm.createContext(sandbox);
  return sandbox;
}

function runRepoFile(sandbox, relativeFile) {
  const file = path.join(repoRoot, relativeFile);
  vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
}

function testOutcomeAndRewards() {
  const helper = loadCombatHelper();
  const buckets = [
    [-80, 'rout', '打败'],
    [-35, 'defeat', '失败'],
    [-10, 'minor_defeat', '小败'],
    [0, 'draw', '平局'],
    [20, 'minor_victory', '小胜'],
    [50, 'victory', '胜利'],
    [90, 'great_victory', '大胜']
  ];
  buckets.forEach(([net, key, label]) => {
    const outcome = helper.classifyOutcome(net, 100);
    assertEqual(outcome.key, key, `bucket key for ${net}`);
    assertEqual(outcome.label, label, `bucket label for ${net}`);
  });
  assertEqual(helper.buildRewardDelta(1, 'great_victory').total, 2, 'level 1 max reward');
  assertEqual(helper.buildRewardDelta(2, 'great_victory').total, 5, 'level 2 max reward');
  assertEqual(helper.buildRewardDelta(3, 'great_victory').total, 9, 'level 3 max reward');
  assertEqual(helper.buildSettlement({}), null, 'ordinary config should not build settlement');
}

function testSettlementPatch() {
  const helper = loadCombatHelper();
  const settlement = helper.buildSettlement({
    gameId: 'blackjack',
    gameName: '夺金廿一',
    startingChips: 1000,
    endingChips: 1500,
    ace0Combat: {
      protocol: 'ace0.combat.v1',
      requestId: 'combat-1',
      requestIndex: 2,
      level: 2,
      kind: 'elite',
      special: true,
      stakeGold: 10
    }
  });
  assert(settlement, 'combat config should build settlement');
  assertEqual(settlement.requestId, 'combat-1', 'request id preserved');
  assertEqual(settlement.requestIndex, 2, 'request index preserved');
  assertEqual(settlement.level, 2, 'level preserved');
  assertEqual(settlement.fundsDeltaGold, 5, 'silver delta converted to gold funds');
  assert(settlement.suggestedJsonPatch.some((op) => op.path === '/world/act/pendingResolutions/2/status' && op.value === 'resolved'), 'patch resolves pending request');
  assert(settlement.suggestedJsonPatch.some((op) => op.path === '/world/act/reserve/combat'), 'patch returns combat reserve');
}

function testCombatPromptInjection() {
  const { sandbox, act, tavernFactory } = loadTavernSandbox();
  const eraVars = {
    hero: { funds: 100, assets: 50, cast: {}, roster: {} },
    world: {
      current_time: { day: 1, phase: 'NOON' },
      location: { layer: 'THE_EXCHANGE', site: 'casino_floor', tags: [] },
      act: createActStateAt(act, 0, [], {
        pendingResolutions: [
          { type: 'combat', status: 'resolved', id: 'old' },
          { type: 'combat', status: 'pending', id: 'boss-req', level: 3 }
        ]
      })
    }
  };
  const { runtime } = createTavernRuntime(tavernFactory, sandbox, { eraVars });
  const prompts = runtime.buildActNarrativePrompts(eraVars);
  const prompt = prompts.find((item) => item.id === 'ace0_combat_request');
  assert(prompt, 'pending combat should inject combat request prompt');
  assertEqual(prompt.depth, 0, 'combat prompt depth');
  assert(prompt.content.includes('"requestId": "boss-req"'), 'requestId should be in prompt');
  assert(prompt.content.includes('"requestIndex": 1'), 'requestIndex should point to original pending index');
  assert(prompt.content.includes('"level": 3'), 'level should be in prompt');
  assert(prompt.content.includes('"stakeGold": 105'), 'stakeGold should use 70% of positive funds + assets');
}

function testMiniGamePromptMarker() {
  const sandbox = createBrowserSandbox();
  runRepoFile(sandbox, 'games/shared/combat-settlement.js');
  runRepoFile(sandbox, 'games/shared/mini-game-logger.js');
  const logger = Object.create(sandbox.MiniGameLogger.prototype);
  logger.gameName = '夺金廿一';
  logger.gameKey = 'blackjack';
  logger.entries = [{ type: 'RESULT', desc: '玩家胜' }];
  logger.roundHistory = [];
  const prompt = logger.generateAIPrompt({
    gameId: 'blackjack',
    resultText: '玩家胜',
    startingChips: 1000,
    endingChips: 1300,
    ace0Combat: {
      requestId: 'mini-combat',
      requestIndex: 0,
      level: 1,
      kind: 'skirmish',
      stakeGold: 10
    }
  });
  assert(prompt.includes('<ACE0_COMBAT_SETTLEMENT>'), 'mini-game prompt should include settlement marker');
  assert(prompt.includes('"requestId": "mini-combat"'), 'mini-game marker should preserve request id');
  assert(prompt.includes('"suggestedJsonPatch"'), 'mini-game marker should include suggested patch');
  assert(!logger.generateAIPrompt({ startingChips: 1000, endingChips: 1100 }).includes('<ACE0_COMBAT_SETTLEMENT>'), 'ordinary mini-game prompt should not include settlement marker');
}

function testTexasPromptMarker() {
  const sandbox = createBrowserSandbox();
  runRepoFile(sandbox, 'games/shared/combat-settlement.js');
  runRepoFile(sandbox, 'games/texasholdem/texas-holdem/utils/game-logger.js');
  const logger = new sandbox.GameLogger();
  logger.entries = [{ type: 'RESULT', message: 'Hero wins', narrativeWeight: 3 }];
  logger.roundHistory = [];
  const context = {
    playerNames: ['Hero', 'Boss'],
    players: [
      { name: 'Hero', chips: 1800 },
      { name: 'Boss', chips: 200 }
    ],
    initialChips: 1000,
    startingChips: 1000,
    endingChips: 1800,
    smallBlind: 10,
    bigBlind: 20,
    fundsDelta: 800,
    ace0Combat: {
      requestId: 'texas-combat',
      requestIndex: 1,
      level: 3,
      kind: 'boss',
      stakeGold: 10
    }
  };
  const prompt = logger.generateAIPrompt(context);
  assert(prompt.includes('<ACE0_COMBAT_SETTLEMENT>'), 'texas prompt should include settlement marker');
  assert(prompt.includes('"requestId": "texas-combat"'), 'texas marker should preserve request id');
  assert(prompt.includes('"fundsDeltaGold": 8'), 'texas marker should convert silver to gold');
  assert(!logger.generateAIPrompt({ ...context, ace0Combat: null }).includes('<ACE0_COMBAT_SETTLEMENT>'), 'ordinary texas prompt should not include settlement marker');
}

function main() {
  testOutcomeAndRewards();
  testSettlementPatch();
  testCombatPromptInjection();
  testMiniGamePromptMarker();
  testTexasPromptMarker();
  console.log('combat-loop-smoke ok');
}

main();
