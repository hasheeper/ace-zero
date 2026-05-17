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
  assertEqual(helper.buildRewardDelta(1, 'great_victory').total, 3, 'level 1 max reward');
  assertEqual(helper.buildRewardDelta(2, 'great_victory').total, 6, 'level 2 max reward');
  assertEqual(helper.buildRewardDelta(3, 'great_victory').total, 10, 'level 3 max reward');
  assertEqual(helper.buildRewardDelta(2, 'minor_defeat').total, 0, 'minor defeat should not return points');
  assertEqual(helper.buildRewardDelta(3, 'draw').total, 2, 'level 3 draw should return low consolation points');
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
  assert(!settlement.suggestedJsonPatch.some((op) => op.path === '/world/act/pendingResolutions/2/outcome'), 'patch should not write redundant pending outcome');
  assert(settlement.suggestedJsonPatch.some((op) => op.path === '/world/act/reserve/combat'), 'patch returns combat reserve');
}

function testCombatPromptInjection() {
  const { sandbox, act, tavernFactory } = loadTavernSandbox();
  const eraVars = {
    hero: { funds: 100, assets: 50, cast: {}, roster: {} },
    world: {
      current_time: { day: 1, phase: 'NOON' },
      location: { layer: 'THE_EXCHANGE', site: 'casino_floor', tags: [] },
      act: createActStateAt(act, 1, ['node1-entry'], {
        phase_index: 1,
        pendingResolutions: [
          { type: 'combat', status: 'resolved', id: 'old' },
          { type: 'combat', status: 'pending', id: 'boss-req', level: 3, nodeId: 'node1-entry', nodeIndex: 1, phaseIndex: 1 }
        ]
      })
    }
  };
  const { runtime } = createTavernRuntime(tavernFactory, sandbox, { eraVars });
  const prompts = runtime.buildActNarrativePrompts(eraVars);
  const prompt = prompts.find((item) => item.id === 'ace0_combat_request');
  assert(prompt, 'pending combat should inject combat request prompt');
  assertEqual(prompt.depth, 0, 'combat prompt depth');
  assert(prompt.content.includes('"ace0Combat": true'), 'combat prompt should ask AI for compact marker');
  assert(!prompt.content.includes('"requestId"'), 'combat prompt should not expose request id');
  assert(!prompt.content.includes('"requestIndex"'), 'combat prompt should not expose request index');
  assert(!prompt.content.includes('"stakeGold"'), 'combat prompt should not expose stakeGold');
  assert(prompt.content.includes('建议买入'), 'combat prompt should provide buy-in guidance');

  const combatConfig = runtime.resolveAce0CombatConfig(eraVars);
  assert(combatConfig, 'pending combat should resolve frontend combat config');
  assertEqual(combatConfig.requestId, 'boss-req', 'request id should resolve from pending request');
  assertEqual(combatConfig.requestIndex, 1, 'request index should point to original pending index');
  assertEqual(combatConfig.level, 3, 'level should resolve from pending request');
  assertEqual(combatConfig.kind, 'boss', 'kind should default from level');
  assertEqual(combatConfig.stakeGold, 127.5, 'stakeGold should use 85% of positive funds + assets for level 3');
  assertEqual(combatConfig.stakeChips, 12750, 'stakeChips should convert resolved gold to silver');
}

function testStaleCombatPromptDoesNotInject() {
  const { sandbox, act, tavernFactory } = loadTavernSandbox();
  const eraVars = {
    hero: { funds: 12, assets: 0, cast: {}, roster: {} },
    world: {
      current_time: { day: 1, phase: 'MORNING' },
      location: { layer: 'THE_EXCHANGE', site: 'casino_floor', tags: [] },
      act: createActStateAt(act, 1, ['node1-entry'], {
        phase_index: 2,
        phasePlanLock: {
          nodeId: 'node1-entry',
          nodeIndex: 1,
          locked: true,
          confirmedPhaseIndex: 0,
          floorKey: 'message:7'
        },
        phase_slots: [
          null,
          { key: 'combat', source: 'reserve', amount: 1 },
          { key: 'rest', source: 'reserve', amount: 1 },
          null
        ],
        pendingResolutions: [
          {
            type: 'combat',
            status: 'pending',
            id: 'chapter0_exchange:node1-entry:1:combat:1:1',
            level: 1,
            nodeId: 'node1-entry',
            nodeIndex: 1,
            phaseIndex: 1
          }
        ]
      })
    }
  };
  const { runtime } = createTavernRuntime(tavernFactory, sandbox, { eraVars });
  const prompts = runtime.buildActNarrativePrompts(eraVars);
  assert(!prompts.find((item) => item.id === 'ace0_combat_request'), 'stale combat pending from previous phase should not inject during rest phase');
}

function testActiveCombatTokenPromptInjection() {
  const { sandbox, act, tavernFactory } = loadTavernSandbox();
  const eraVars = {
    hero: { funds: 21.98, assets: 0, cast: {}, roster: {} },
    world: {
      current_time: { day: 1, phase: 'MORNING' },
      location: { layer: 'THE_EXCHANGE', site: 'casino_floor', tags: [] },
      act: createActStateAt(act, 1, ['node1-entry'], {
        phase_index: 1,
        phasePlanLock: {
          nodeId: 'node1-entry',
          nodeIndex: 1,
          locked: true,
          confirmedPhaseIndex: 1,
          floorKey: 'message:7'
        },
        resourceSpent: { combat: 0, rest: 0, asset: 0, vision: 0 },
        phase_slots: [
          null,
          { key: 'combat', source: 'limited', amount: 1 },
          null,
          null
        ],
        pendingResolutions: []
      })
    }
  };
  const { runtime } = createTavernRuntime(tavernFactory, sandbox, {
    eraVars,
    getCurrentFloorKey: () => 'message:7'
  });
  const prompts = runtime.buildActNarrativePrompts(eraVars);
  const prompt = prompts.find((item) => item.id === 'ace0_combat_request');
  assert(prompt, 'active combat token should inject combat request prompt before pending exists');
  assert(prompt.content.includes('"ace0Combat": true'), 'active token prompt should ask AI for compact marker');
  assert(!prompt.content.includes('"requestId"'), 'active token prompt should not expose request id');
  assert(!prompt.content.includes('"requestIndex"'), 'active token prompt should not expose request index');
  assert(!prompt.content.includes('"stakeGold"'), 'active token prompt should not expose stakeGold');
  assert(prompt.content.includes('建议买入'), 'active token prompt should provide buy-in guidance');
  assert(prompt.content.includes('phase_advance'), 'active token prompt should ask to advance current phase when opening combat');

  const combatConfig = runtime.resolveAce0CombatConfig(eraVars);
  assert(combatConfig, 'active combat token should resolve frontend combat config before pending exists');
  assertEqual(combatConfig.requestId, 'chapter0_exchange:node1-entry:1:combat:1:0', 'active token request id should match future pending id');
  assertEqual(combatConfig.requestIndex, 0, 'active token request index should point to future pending index');
  assertEqual(combatConfig.level, 1, 'active token level should be carried');
  assertEqual(combatConfig.kind, 'skirmish', 'active token kind should default from level');
  assertEqual(combatConfig.stakeGold, 5.5, 'active token stakeGold should use level 1 25% estimate');
}

function testNoCombatRequestDoesNotResolveConfig() {
  const { sandbox, act, tavernFactory } = loadTavernSandbox();
  const eraVars = {
    hero: { funds: 20, assets: 0, cast: {}, roster: {} },
    world: {
      current_time: { day: 1, phase: 'MORNING' },
      location: { layer: 'THE_EXCHANGE', site: 'casino_floor', tags: [] },
      act: createActStateAt(act, 1, ['node1-entry'], {
        phase_index: 1,
        phase_slots: [
          null,
          { key: 'rest', source: 'reserve', amount: 1 },
          null,
          null
        ],
        pendingResolutions: []
      })
    }
  };
  const { runtime } = createTavernRuntime(tavernFactory, sandbox, { eraVars });
  assertEqual(runtime.resolveAce0CombatConfig(eraVars), null, 'ordinary ACT phase should not resolve combat config');
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
  assert(!prompt.includes('"requestId": "mini-combat"'), 'mini-game marker should not expose request id');
  assert(!prompt.includes('"protocol"'), 'mini-game marker should not expose protocol internals');
  assert(prompt.includes('"suggestedJsonPatch"'), 'mini-game marker should include suggested patch');
  assert(!prompt.includes('"summary"'), 'mini-game marker should not expose summary text');
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
  assert(!prompt.includes('"requestId": "texas-combat"'), 'texas marker should not expose request id');
  assert(!prompt.includes('"fundsDeltaGold"'), 'texas marker should not expose intermediate fields');
  assert(prompt.includes('/hero/funds'), 'texas marker should include funds patch');
  assert(!prompt.includes('"summary"'), 'texas marker should not expose summary text');
  assert(!logger.generateAIPrompt({ ...context, ace0Combat: null }).includes('<ACE0_COMBAT_SETTLEMENT>'), 'ordinary texas prompt should not include settlement marker');
}

function testTexasPromptMarkerUsesSessionNet() {
  const sandbox = createBrowserSandbox();
  runRepoFile(sandbox, 'games/shared/combat-settlement.js');
  runRepoFile(sandbox, 'games/texasholdem/texas-holdem/utils/game-logger.js');
  const logger = new sandbox.GameLogger();
  logger.roundHistory = [
    {
      round: 1,
      entries: [{ type: 'RESULT', message: 'Hero wins hand 1', narrativeWeight: 2 }],
      context: {
        players: [{ name: 'Hero', chips: 1100 }, { name: 'Boss', chips: 900 }],
        playerNames: ['Hero', 'Boss'],
        initialChips: 1000,
        startingChips: 1000,
        endingChips: 1100,
        fundsDelta: 100,
        smallBlind: 10,
        bigBlind: 20,
        ace0Combat: {
          requestId: 'texas-combat-session',
          requestIndex: 1,
          level: 1,
          kind: 'skirmish',
          stakeGold: 10
        }
      }
    },
    {
      round: 2,
      entries: [{ type: 'RESULT', message: 'Hero loses hand 2', narrativeWeight: 2 }],
      context: {
        players: [{ name: 'Hero', chips: 300 }, { name: 'Boss', chips: 1700 }],
        playerNames: ['Hero', 'Boss'],
        initialChips: 1000,
        startingChips: 1100,
        endingChips: 300,
        fundsDelta: -800,
        smallBlind: 10,
        bigBlind: 20,
        ace0Combat: {
          requestId: 'texas-combat-session',
          requestIndex: 1,
          level: 1,
          kind: 'skirmish',
          stakeGold: 10
        }
      }
    }
  ];
  logger.entries = [{ type: 'RESULT', message: 'Hero wins final hand', narrativeWeight: 3 }];
  const context = {
    playerNames: ['Hero', 'Boss'],
    players: [{ name: 'Hero', chips: 1200 }, { name: 'Boss', chips: 800 }],
    initialChips: 1000,
    startingChips: 300,
    endingChips: 1200,
    smallBlind: 10,
    bigBlind: 20,
    fundsDelta: 900,
    ace0Combat: {
      requestId: 'texas-combat-session',
      requestIndex: 1,
      level: 1,
      kind: 'skirmish',
      stakeGold: 10
    }
  };
  const prompt = logger.generateAIPrompt(context);
  assert(prompt.includes('<ACE0_COMBAT_SETTLEMENT>'), 'multi-round texas prompt should include settlement marker');
  assert(prompt.includes('"path": "/hero/funds"'), 'multi-round marker should include funds patch');
  assert(prompt.includes('"value": 2'), 'multi-round marker should settle session net +200 silver, not last hand +900 silver');
  assert(!prompt.includes('/world/act/pendingResolutions/1/outcome'), 'multi-round marker should not write redundant pending outcome');
  assert(!prompt.includes('"value": 9'), 'multi-round marker should not use only final hand funds');
}

function main() {
  testOutcomeAndRewards();
  testSettlementPatch();
  testCombatPromptInjection();
  testStaleCombatPromptDoesNotInject();
  testActiveCombatTokenPromptInjection();
  testNoCombatRequestDoesNotResolveConfig();
  testMiniGamePromptMarker();
  testTexasPromptMarker();
  testTexasPromptMarkerUsesSessionNet();
  console.log('combat-loop-smoke ok');
}

main();
