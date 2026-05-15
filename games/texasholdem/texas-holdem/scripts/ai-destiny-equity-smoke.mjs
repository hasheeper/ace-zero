import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const repoRoot = path.resolve(root, '../../..');

const sandbox = {
  console,
  Date,
  Math,
  JSON
};
sandbox.window = sandbox;
sandbox.global = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

function runScript(file) {
  vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
}

runScript(path.join(repoRoot, 'games/texasholdem/pokersolver/pokersolver.js'));
runScript(path.join(root, 'core/ai/poker-ai-modules.js'));
runScript(path.join(root, 'core/ai/destiny-aware-equity.js'));

const DestinyAwareEquity = sandbox.PokerAIModules.DestinyAwareEquity;
assert.ok(DestinyAwareEquity, 'DestinyAwareEquity should be registered');

const hero = [
  { rank: 1, suit: 0 },
  { rank: 13, suit: 0 }
];
const board = [
  { rank: 2, suit: 1 },
  { rank: 7, suit: 2 },
  { rank: 10, suit: 3 }
];
const visiblePlayers = [
  { id: 1, name: 'AI', cardsKnown: true, cards: hero, chips: 1000 },
  { id: 2, name: 'Opp', cards: [], chips: 1000 }
];

function estimate(forces, extra = {}) {
  return DestinyAwareEquity.estimate({
    heroId: 1,
    playerId: 1,
    holeCards: hero,
    boardCards: board,
    phase: 'flop',
    visiblePlayers,
    visibleForces: forces,
    samplesPerCandidate: 6,
    maxMs: 1000,
    ...extra
  });
}

const enemyFortune = estimate([
  { ownerId: 2, ownerName: 'Opp', type: 'fortune', power: 80, effectivePower: 80 }
]);
assert.equal(enemyFortune.applied, true, 'enemy fortune should apply destiny equity');
assert.ok(
  enemyFortune.destinyEquity < enemyFortune.physicalEquity,
  `enemy fortune should lower hero equity (${enemyFortune.destinyEquity} < ${enemyFortune.physicalEquity})`
);

const selfFortune = estimate([
  { ownerId: 1, ownerName: 'AI', type: 'fortune', power: 80, effectivePower: 80 }
]);
assert.equal(selfFortune.applied, true, 'self fortune should apply destiny equity');
assert.ok(
  selfFortune.destinyEquity > selfFortune.physicalEquity,
  `self fortune should raise hero equity (${selfFortune.destinyEquity} > ${selfFortune.physicalEquity})`
);

const hiddenStrongOpponent = estimate([
  { ownerId: 2, ownerName: 'Opp', type: 'fortune', power: 80, effectivePower: 80 }
], {
  visiblePlayers: [
    { id: 1, name: 'AI', cardsKnown: true, cards: hero, chips: 1000 },
    { id: 2, name: 'Opp', cardsKnown: false, cards: [{ rank: 1, suit: 1 }, { rank: 1, suit: 2 }], chips: 1000 }
  ]
});
assert.equal(
  hiddenStrongOpponent.destinyEquity,
  enemyFortune.destinyEquity,
  'hidden opponent cards should be ignored without scout knowledge'
);

const scoutedStrongOpponent = estimate([
  { ownerId: 2, ownerName: 'Opp', type: 'fortune', power: 80, effectivePower: 80 }
], {
  scoutMemory: [{
    targetId: 2,
    infoLevel: 'perfect',
    knownCards: [{ rank: 1, suit: 1 }, { rank: 1, suit: 2 }]
  }]
});
assert.notEqual(
  scoutedStrongOpponent.destinyEquity,
  enemyFortune.destinyEquity,
  'perfect scout knowledge should affect destiny equity'
);

console.log('[ai-destiny-equity-smoke] ok');
