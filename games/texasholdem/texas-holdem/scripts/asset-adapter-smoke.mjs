import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const adapterPath = path.join(root, 'core/runtime/assets/asset-deck-adapter.js');
const skillSystemPath = path.join(root, 'core/skill-system.js');

const sandbox = { console };
sandbox.global = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(adapterPath, 'utf8'), sandbox, { filename: adapterPath });
vm.runInContext(fs.readFileSync(skillSystemPath, 'utf8'), sandbox, { filename: skillSystemPath });

const adapter = sandbox.AssetDeckAdapter;
assert.ok(adapter, 'AssetDeckAdapter should be exported');

const assetDeck = {
  active_general_cards: [
    {
      cardId: 'asset_skill_minor_wish_l2',
      skillKey: 'minor_wish',
      gameTags: ['texas-holdem'],
      modifiers: [
        { type: 'skill_level', key: 'minor_wish', value: 2 },
        { type: 'skill_cost_flat', key: 'minor_wish', value: -3 }
      ]
    },
    {
      cardId: 'asset_rainbow_contract',
      gameTags: ['any'],
      modifiers: [{ type: 'all_force_power_bonus', value: 0.08 }]
    }
  ],
  active_void_cards: [
    {
      cardId: 'asset_void_battery',
      gameTags: ['texas-holdem'],
      modifiers: [{ type: 'mana_max_flat', value: 10 }]
    }
  ]
};

const compiled = adapter.compile({ assetDeck, gameId: 'texas-holdem' });
assert.equal(compiled.skillLevelBySkill.minor_wish, 2, 'Skill level cards should compile');

const config = adapter.applySkillLevelsToConfig({
  hero: {
    vanguard: { name: 'KAZU', level: 3 },
    rearguard: { name: 'RINO', level: 3 },
    maxMana: 100,
    vanguardSkills: {},
    rearguardSkills: { minor_wish: 1 }
  },
  seats: {}
}, compiled);
assert.equal(config.hero.rearguardSkills.minor_wish, 2, 'Asset skill card should upgrade hero skill config');

const existingVanguardConfig = adapter.applySkillLevelsToConfig({
  hero: {
    vanguard: { name: 'RINO', level: 5 },
    rearguard: { name: 'RINO_REAR', level: 4 },
    vanguardSkills: [{ key: 'minor_wish', level: 1 }],
    rearguardSkills: []
  },
  seats: {}
}, compiled);
assert.equal(existingVanguardConfig.hero.vanguardSkills.minor_wish, 2, 'Existing skill slot should be upgraded in place');

const grantCompiled = adapter.compile({
  gameId: 'texas-holdem',
  assetDeck: {
    active_general_cards: [
      {
        cardId: 'asset_grant_minor_wish',
        skillKey: 'minor_wish',
        system: 'moirai',
        targetTags: ['RINO'],
        gameTags: ['texas-holdem'],
        modifiers: [{ type: 'skill_level', key: 'minor_wish', value: 2 }]
      }
    ]
  }
});
const grantConfig = adapter.applySkillLevelsToConfig({
  hero: {
    vanguard: { name: 'KAZU', level: 3 },
    rearguard: { name: 'RINO', level: 3 },
    vanguardSkills: {},
    rearguardSkills: {}
  },
  seats: {}
}, grantCompiled);
assert.equal(grantConfig.hero.rearguardSkills.minor_wish, 2, 'Asset skill card should grant missing hero skill to matching target tag');

const unknownCompiled = adapter.compile({
  gameId: 'texas-holdem',
  assetDeck: {
    active_general_cards: [
      {
        cardId: 'asset_unknown_skill',
        skillKey: 'definitely_missing_skill',
        gameTags: ['texas-holdem'],
        modifiers: [{ type: 'skill_level', key: 'definitely_missing_skill', value: 2 }]
      }
    ]
  }
});
const unknownConfig = adapter.applySkillLevelsToConfig({
  hero: {
    vanguard: { name: 'KAZU', level: 3 },
    rearguard: { name: 'RINO', level: 3 },
    vanguardSkills: {},
    rearguardSkills: {}
  },
  seats: {}
}, unknownCompiled);
assert.equal(unknownConfig.hero.vanguardSkills.definitely_missing_skill, undefined, 'Unknown Asset skill should not enter hero config');
assert.equal(unknownConfig.assetModifiers.skillLevelEntries.length, 0, 'Unknown Asset skill should be removed from compiled skill entries');
assert.ok(
  unknownConfig.assetModifiers.debug.ignored.some(item => item.reason === 'unknown_skill' && item.key === 'definitely_missing_skill'),
  'Unknown Asset skill should be recorded in debug ignored'
);

const cost = adapter.resolveSkillCost(compiled, {
  ownerId: 0,
  skillKey: 'minor_wish',
  system: 'moirai'
}, 20);
assert.equal(cost.finalCost, 17, 'Flat skill-cost modifier should affect final cost');
assert.equal(cost.sources[0].cardId, 'asset_skill_minor_wish_l2', 'Cost modifier should expose source card');

const zeroCostCompiled = adapter.compile({
  gameId: 'texas-holdem',
  assetDeck: {
    active_general_cards: [
      { cardId: 'asset_zero_flat', gameTags: ['texas-holdem'], modifiers: [{ type: 'skill_cost_flat', value: -12 }] },
      { cardId: 'asset_zero_pct', gameTags: ['texas-holdem'], modifiers: [{ type: 'skill_cost_pct', value: -0.5 }] }
    ]
  }
});
const zeroCost = adapter.resolveSkillCost(zeroCostCompiled, { ownerId: 0, skillKey: 'minor_wish', system: 'moirai' }, 10);
assert.equal(zeroCost.finalCost, 0, 'Flat reduction can make a skill free before percent modifiers');

const pctCapCompiled = adapter.compile({
  gameId: 'texas-holdem',
  assetDeck: {
    active_general_cards: [
      { cardId: 'asset_pct_reduce_a', gameTags: ['texas-holdem'], modifiers: [{ type: 'skill_cost_pct', value: -0.5 }] },
      { cardId: 'asset_pct_reduce_b', gameTags: ['texas-holdem'], modifiers: [{ type: 'skill_cost_pct', value: -0.5 }] },
      { cardId: 'asset_pct_increase', gameTags: ['texas-holdem'], modifiers: [{ type: 'skill_cost_pct', value: 0.5 }] }
    ]
  }
});
const pctCapCost = adapter.resolveSkillCost(pctCapCompiled, { ownerId: 0, skillKey: 'hex', system: 'chaos' }, 30);
assert.equal(pctCapCost.finalCost, 25, 'Percent reductions cap at 66% while increases remain uncapped');

const riskCompiled = adapter.compile({
  gameId: 'texas-holdem',
  assetDeck: {
    active_general_cards: [
      {
        cardId: 'asset_risk_fixed',
        gameTags: ['texas-holdem'],
        modifiers: [{ type: 'risk_reward_roll', costPctMin: -0.1, costPctMax: -0.1, effectPctMin: 0.2, effectPctMax: 0.2 }]
      }
    ]
  }
});
const riskCost = adapter.resolveSkillCost(riskCompiled, { ownerId: 0, skillKey: 'hex', system: 'chaos' }, 20, { consumeAssetRisk: true, random: () => 0.5 });
assert.equal(riskCost.finalCost, 18, 'Risk/reward cost roll should apply only when consumed');
const riskForce = adapter.enhanceForcePower(riskCompiled, { ownerId: 0, skillKey: 'hex', system: 'chaos', power: 50, _assetRiskRolls: riskCost.riskRolls });
assert.equal(riskForce.power, 60, 'Risk/reward effect roll should apply to the activated force');

const mana = adapter.resolveManaMax(compiled, 0, 100);
assert.equal(mana.max, 110, 'Mana max modifier should affect max mana');
const enemyMana = adapter.resolveManaMax(compiled, 2, 100);
assert.equal(enemyMana.max, 100, 'Player Asset mana max modifier should not affect enemy mana by default');

const force = adapter.enhanceForcePower(compiled, {
  ownerId: 0,
  skillKey: 'minor_wish',
  system: 'moirai',
  power: 50
});
assert.equal(force.power, 54, 'Global force power bonus should affect force power');
assert.equal(force._assetBonus.sources[0].cardId, 'asset_rainbow_contract', 'Force modifier should expose source card');

const enemyForce = adapter.enhanceForcePower(compiled, {
  ownerId: 2,
  skillKey: 'hex',
  system: 'chaos',
  power: 50
});
assert.equal(enemyForce.power, 50, 'Player Asset force bonus should not buff enemy forces by default');

const tableCompiled = adapter.compile({
  gameId: 'texas-holdem',
  assetDeck: {
    active_general_cards: [
      {
        cardId: 'asset_table_force_bonus',
        scope: 'table',
        gameTags: ['texas-holdem'],
        modifiers: [{ type: 'all_force_power_bonus', value: 0.08 }]
      }
    ]
  }
});
const tableEnemyForce = adapter.enhanceForcePower(tableCompiled, {
  ownerId: 2,
  skillKey: 'hex',
  system: 'chaos',
  power: 50
});
assert.equal(tableEnemyForce.power, 54, 'Explicit table-scoped Asset force bonus should affect enemy forces');

const passiveCompiled = adapter.compile({
  gameId: 'texas-holdem',
  assetDeck: {
    active_general_cards: [
      {
        cardId: 'asset_passive_street_mana_test',
        gameTags: ['texas-holdem'],
        modifiers: [{ type: 'street_start_mana_gain', value: 2 }]
      },
      {
        cardId: 'asset_passive_cost_test',
        gameTags: ['texas-holdem'],
        modifiers: [{ type: 'first_skill_cost_flat', value: -5 }]
      },
      {
        cardId: 'asset_passive_force_test',
        gameTags: ['texas-holdem'],
        modifiers: [{ type: 'first_force_power_pct', value: 0.2 }]
      },
      {
        cardId: 'asset_passive_fortune_test',
        gameTags: ['texas-holdem'],
        modifiers: [{ type: 'once_per_hand_fortune_flat', value: 9 }]
      }
    ]
  }
});
assert.equal(passiveCompiled.passiveTriggers.length, 4, 'Passive Asset modifiers should compile into passive triggers');

const passiveState = { handId: 1, used: {} };
const passiveCost = adapter.resolveSkillCost(passiveCompiled, {
  ownerId: 0,
  skillKey: 'minor_wish',
  system: 'moirai'
}, 20, { passiveState });
assert.equal(passiveCost.finalCost, 15, 'First skill passive should reduce cost before use');
assert.equal(passiveCost.passiveTriggers[0].cardId, 'asset_passive_cost_test', 'First skill passive should expose trigger source');
passiveState.used[passiveCost.passiveTriggers[0].runtimeKey] = { used: true };
const passiveCostAfterUse = adapter.resolveSkillCost(passiveCompiled, {
  ownerId: 0,
  skillKey: 'minor_wish',
  system: 'moirai'
}, 20, { passiveState });
assert.equal(passiveCostAfterUse.finalCost, 20, 'First skill passive should not repeat after use');

const passiveForceState = { handId: 1, used: {} };
const passiveForce = adapter.enhanceForcePower(passiveCompiled, {
  ownerId: 0,
  skillKey: 'minor_wish',
  system: 'moirai',
  power: 50
}, { passiveState: passiveForceState });
assert.equal(passiveForce.power, 60, 'First force passive should boost first force');
assert.equal(passiveForce._assetBonus.passiveTriggers[0].cardId, 'asset_passive_force_test', 'First force passive should expose trigger source');
const passiveForceAgain = adapter.enhanceForcePower(passiveCompiled, {
  ownerId: 0,
  skillKey: 'minor_wish',
  system: 'moirai',
  power: 50
}, { passiveState: passiveForceState });
assert.equal(passiveForceAgain.power, 50, 'First force passive should not repeat after use');

const passiveEnemyForce = adapter.enhanceForcePower(passiveCompiled, {
  ownerId: 2,
  skillKey: 'hex',
  system: 'chaos',
  power: 50
}, { passiveState: { handId: 1, used: {} } });
assert.equal(passiveEnemyForce.power, 50, 'First force passive should not buff enemy forces by default');

const handEvents = adapter.resolvePassiveTriggers(passiveCompiled, 'hand_start', { heroId: 0, passiveState: { handId: 2, used: {} } });
assert.equal(handEvents.length, 1, 'Once-per-hand passive should trigger on hand start');
assert.equal(handEvents[0].cardId, 'asset_passive_fortune_test', 'Once-per-hand passive should expose source card');
const streetEvents = adapter.resolvePassiveTriggers(passiveCompiled, 'street_start', { heroId: 0, passiveState: { handId: 2, used: {} } });
assert.equal(streetEvents.length, 1, 'Street-start passive should trigger on street start');
assert.equal(streetEvents[0].cardId, 'asset_passive_street_mana_test', 'Street-start passive should expose source card');

const ss = new sandbox.SkillSystem();
ss.onLog = () => {};
ss.registerFromConfig(config, { heroId: 0, seats: {} });
const registeredMinorWish = ss.getPlayerSkills(0).find(skill => skill.skillKey === 'minor_wish');
assert.equal(registeredMinorWish.level, 2, 'SkillSystem should receive asset-upgraded skill level through config');
assert.equal(ss.getMana(0).max, 110, 'SkillSystem should receive asset mana max modifier');

const grantSkillSystem = new sandbox.SkillSystem();
grantSkillSystem.onLog = () => {};
grantSkillSystem.registerFromConfig(grantConfig, { heroId: 0, seats: {} });
const grantedMinorWish = grantSkillSystem.getPlayerSkills(0).find(skill => skill.skillKey === 'minor_wish');
assert.equal(grantedMinorWish.level, 2, 'SkillSystem should receive Asset-granted hero skill through config');

const unknownSkillSystem = new sandbox.SkillSystem();
unknownSkillSystem.onLog = () => {};
unknownSkillSystem.registerFromConfig(unknownConfig, { heroId: 0, seats: {} });
assert.equal(
  unknownSkillSystem.getPlayerSkills(0).some(skill => skill.skillKey === 'definitely_missing_skill'),
  false,
  'SkillSystem should not register unknown Asset skill'
);

const passiveSkillSystem = new sandbox.SkillSystem();
const passiveLogs = [];
passiveSkillSystem.onLog = (type, data) => passiveLogs.push({ type, data });
passiveSkillSystem.registerFromConfig({
  hero: {
    vanguard: { name: 'RINO', level: 3 },
    maxMana: 100,
    mana: 50,
    vanguardSkills: { minor_wish: 1 },
    rearguardSkills: {}
  },
  seats: {},
  assetModifiers: passiveCompiled
}, { heroId: 0, seats: {} });
passiveSkillSystem.onNewHand();
assert.equal(passiveSkillSystem.pendingForces.some(force => force._assetSourceCardId === 'asset_passive_fortune_test'), true, 'Once-per-hand fortune passive should queue an Asset force');
assert.equal(passiveSkillSystem.getMana(0).current, 52, 'Street-start mana passive should apply at preflop hand start');
passiveSkillSystem.onStreetStart('flop');
assert.equal(passiveSkillSystem.getMana(0).current, 54, 'Street-start mana passive should apply on later streets');
const passiveSkill = passiveSkillSystem.getPlayerSkills(0).find(skill => skill.skillKey === 'minor_wish');
assert.equal(passiveSkillSystem.getSkillActualManaCost(passiveSkill, {}), 10, 'First skill passive should affect displayed actual cost');
const passiveActivation = passiveSkillSystem.activatePlayerSkill(passiveSkill.uniqueId, {});
assert.equal(passiveActivation.success, true, 'Passive skill-system activation should succeed');
assert.equal(passiveActivation.actualManaCost, 10, 'First skill passive should affect activation cost');
assert.equal(passiveSkillSystem.getSkillActualManaCost(passiveSkill, {}), 15, 'First skill passive should be consumed after activation');
assert.equal(
  passiveLogs.some(log => log.type === 'ASSET_PASSIVE_TRIGGERED' && log.data.cardId === 'asset_passive_cost_test'),
  true,
  'SkillSystem should log passive trigger source'
);

console.log('[asset-adapter-smoke] ok');
