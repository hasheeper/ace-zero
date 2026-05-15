import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const repoRoot = path.resolve(root, '../../..');

const randomQueue = [];
const sandboxMath = Object.create(Math);
sandboxMath.random = () => randomQueue.length > 0 ? randomQueue.shift() : 0.42;

const sandbox = {
  console: {
    log() {},
    warn() {},
    error: console.error
  },
  Date,
  JSON,
  Math: sandboxMath
};
sandbox.window = sandbox;
sandbox.global = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

function runScript(file) {
  vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
}

[
  path.join(repoRoot, 'games/texasholdem/pokersolver/pokersolver.js'),
  path.join(root, 'core/ai/poker-ai-modules.js'),
  path.join(root, 'core/ai/profiles.js'),
  path.join(root, 'core/ai/cards.js'),
  path.join(root, 'core/ai/utility-scorer.js'),
  path.join(root, 'core/ai/state-models.js'),
  path.join(root, 'core/ai/opponent-model.js'),
  path.join(root, 'core/ai/destiny-aware-equity.js'),
  path.join(root, 'core/ai/skill-ai.js'),
  path.join(root, 'core/ai/action-ai.js'),
  path.join(root, 'core/poker-ai.js')
].forEach(runScript);

const PokerAI = sandbox.PokerAI;
assert.ok(PokerAI, 'PokerAI facade should load');

function card(rank, suit) {
  return { rank, suit };
}

function baseContext(overrides = {}) {
  return {
    playerId: 1,
    playerName: 'AI',
    holeCards: [card(7, 0), card(2, 1)],
    boardCards: [],
    pot: 120,
    toCall: 20,
    aiStack: 1000,
    phase: 'preflop',
    minRaise: 20,
    activeOpponentCount: 1,
    magicLevel: 0,
    netForce: 0,
    opponentManaRatio: 0.5,
    heroId: 0,
    raiseCount: 0,
    opponentProfiles: [
      { id: 0, difficulty: 'human', risk: 'balanced', currentBet: 20, chips: 1000, isHuman: true }
    ],
    visiblePlayers: [],
    visibleForces: [],
    bigBlind: 20,
    currentMana: 50,
    maxMana: 100,
    manaRegen: 10,
    ...overrides
  };
}

{
  const ai = new PokerAI({ riskAppetite: 'balanced', difficulty: 'regular' });
  const riskBefore = ai.risk;
  const difficultyBefore = ai.difficulty;
  randomQueue.push(0.5, 0.5, 0.5, 0.5);
  ai.decide(baseContext({
    mentalModifiers: {
      composureRatio: 0.1,
      pressureType: null,
      pressureStack: { presence: 30, taunt: 0, probe: 0 },
      equityBias: 0
    }
  }));
  randomQueue.push(0.5, 0.5, 0.5, 0.5);
  ai.decide(baseContext({
    mentalModifiers: {
      composureRatio: 0.1,
      pressureType: null,
      pressureStack: { presence: 30, taunt: 0, probe: 0 },
      equityBias: 0
    }
  }));
  assert.equal(ai.risk, riskBefore, 'runtime mental modifiers should restore the original risk profile object');
  assert.equal(ai.difficulty, difficultyBefore, 'runtime mental modifiers should restore the original difficulty profile object');
  assert.equal(ai.risk.entryThreshold, 30, 'entry threshold should not accumulate across decisions');
}

{
  const ai = new PokerAI({ riskAppetite: 'balanced', difficulty: 'boss' });
  const humanBonus = ai._estimateReadBonus({
    toCall: 100,
    bigBlind: 20,
    opponentProfiles: [
      { id: 0, difficulty: 'regular', risk: 'balanced', currentBet: 220, isHuman: true }
    ]
  });
  const regularBonus = ai._estimateReadBonus({
    toCall: 100,
    bigBlind: 20,
    opponentProfiles: [
      { id: 2, difficulty: 'regular', risk: 'balanced', currentBet: 220, isHuman: false }
    ]
  });
  assert.equal(humanBonus, 0, 'human opponents should not receive regular bluff read bonus');
  assert.ok(regularBonus > 0, 'regular AI opponents should still be readable');
}

{
  const ai = new PokerAI({ riskAppetite: 'balanced', difficulty: 'pro' });
  const scoredIds = [];
  ai.opponentModel.score = function(playerId, oppManaRatio, action) {
    scoredIds.push(playerId);
    return 0;
  };
  randomQueue.push(0.5, 0.5, 0.5, 0.5);
  ai.decide(baseContext({
    toCall: 60,
    pot: 240,
    opponentProfiles: [
      { id: 0, difficulty: 'human', risk: 'balanced', currentBet: 0, chips: 800, isHuman: true },
      { id: 2, difficulty: 'regular', risk: 'aggressive', currentBet: 120, chips: 700, isCurrentAggressor: true }
    ]
  }));
  assert.ok(scoredIds.length > 0, 'OpponentModel should be consulted');
  assert.ok(scoredIds.every(id => id === 2), 'OpponentModel should score the current aggressor, not fixed heroId');
}

{
  const ai = new PokerAI({ riskAppetite: 'aggressive', difficulty: 'boss' });
  randomQueue.push(0.5, 0, 0.5, 0.5, 0.5);
  const decision = ai.decide(baseContext({
    holeCards: [card(1, 0), card(1, 1)],
    boardCards: [card(1, 2), card(13, 3), card(2, 0)],
    phase: 'flop',
    pot: 300,
    toCall: 20,
    aiStack: 1000,
    opponentProfiles: [
      { id: 0, difficulty: 'human', risk: 'balanced', currentBet: 20, chips: 1000, isHuman: true, isCurrentAggressor: true }
    ]
  }));
  assert.equal(decision.action, PokerAI.ACTIONS.RAISE, 'strong-hand protection should still allow a value raise');
  assert.match(decision.reason, /protect=/, 'strong-hand protection should be visible in the reason');
}

{
  const skill = { system: 'void', effect: 'void', skillKey: 'reality', activation: 'active', manaCost: 0, level: 1 };
  assert.doesNotThrow(() => {
    PokerAI.SkillAI.shouldUseSkill('pro', skill, { id: 1, chips: 1000 }, { phase: 'turn', pot: 300, blinds: 20 }, null, { current: 100, max: 100 });
  }, 'SkillAI should tolerate missing pendingForces and players arrays');
}

console.log('[ai-action-regression] ok');
