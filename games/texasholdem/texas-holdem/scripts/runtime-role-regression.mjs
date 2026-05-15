import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const runtimeRoot = path.join(root, 'core/runtime');
const runtimeIndexPath = path.join(runtimeRoot, 'index.js');

const rootJsFiles = fs.readdirSync(runtimeRoot)
  .filter(name => name.endsWith('.js'))
  .sort();
assert.deepEqual(rootJsFiles, ['index.js'], 'core/runtime root should expose only index.js');

const runtimeIndexSource = fs.readFileSync(runtimeIndexPath, 'utf8');
const filesMatch = runtimeIndexSource.match(/var files = \[([\s\S]*?)\];/);
assert.ok(filesMatch, 'runtime index should declare a static files list');
const runtimeFiles = [...filesMatch[1].matchAll(/'([^']+)'/g)].map(match => match[1]);
assert.ok(runtimeFiles.length > 0, 'runtime index should load split runtime files');

const capturedErrors = [];
const sandbox = {
  Date,
  JSON,
  Promise,
  console: {
    log() {},
    warn() {},
    error(...args) {
      capturedErrors.push(args.map(String).join(' '));
    }
  },
  setTimeout,
  clearTimeout
};
sandbox.Math = Object.create(Math);
sandbox.Math.random = () => 0.42;
sandbox.window = sandbox;
sandbox.global = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

for (const file of runtimeFiles) {
  const fullPath = path.join(runtimeRoot, file);
  assert.ok(fs.existsSync(fullPath), `runtime index target should exist: ${file}`);
  vm.runInContext(fs.readFileSync(fullPath, 'utf8'), sandbox, { filename: fullPath });
}

for (const globalName of [
  'RoleRuntime',
  'RuntimeFlow',
  'ForceRuntime',
  'AssetLedger',
  'AssetDeckAdapter',
  'NpcRoleDirector',
  'RuntimeModuleRegistry',
  'AceBuiltinModules'
]) {
  assert.ok(sandbox[globalName], `${globalName} should be exported`);
}
assert.equal(
  typeof sandbox.AceBuiltinModules.registerBuiltinRoleModules,
  'function',
  'AceBuiltinModules.registerBuiltinRoleModules should be exported'
);

const ROLE_ORDER = ['SIA', 'RINO', 'VV', 'COTA', 'EULALIA', 'KUZUHA', 'TRIXIE', 'KAKO', 'POPPY'];
const roleIdToPlayerId = new Map(ROLE_ORDER.map((roleId, index) => [roleId, index]));

const players = ROLE_ORDER.map((roleId, index) => ({
  id: index,
  name: roleId,
  roleId,
  roleVariant: 'base',
  difficultyProfile: roleId.toLowerCase(),
  difficulty: roleId.toLowerCase(),
  ai: {
    difficultyProfile: roleId.toLowerCase(),
    scoutMemory: [{ phaseSeen: 'preflop' }]
  },
  chips: 120 + index * 12,
  initialChips: 160,
  currentBet: index % 3 === 0 ? 18 : 6,
  totalBet: 20 + index * 4,
  folded: false,
  isActive: true
}));

const playerByRole = Object.fromEntries(players.map(player => [player.roleId, player]));

const config = {
  hero: {
    vanguard: { name: 'SIA', roleId: 'SIA', level: 4 },
    rearguard: { name: 'RINO', roleId: 'RINO', level: 4 },
    maxMana: 100,
    vanguardSkills: {},
    rearguardSkills: {}
  },
  seats: Object.fromEntries(ROLE_ORDER.slice(2).map((roleId, index) => [
    `seat_${index}`,
    { name: roleId, roleId, level: 4, skills: {} }
  ]))
};

const SKILLS_BY_ROLE = {
  SIA: [
    skill('SIA', 'cooler', 'cooler', { system: 'chaos', kind: 'marker', manaCost: 18, power: 0 }),
    skill('SIA', 'skill_seal', 'skill_seal', { system: 'chaos', kind: 'control', manaCost: 20, power: 0 }),
    skill('SIA', 'havoc', 'curse', { system: 'chaos', kind: 'curse', manaCost: 20, power: 35 }),
    skill('SIA', 'hex', 'curse', { system: 'chaos', kind: 'curse', manaCost: 12, power: 18 })
  ],
  RINO: [
    skill('RINO', 'heart_read', 'heart_read', { system: 'psyche', kind: 'psyche', manaCost: 15, power: 20 }),
    skill('RINO', 'royal_decree', 'royal_decree', { system: 'moirai', kind: 'fortune', manaCost: 25, power: 70 })
  ],
  VV: [
    skill('VV', 'clairvoyance', 'clairvoyance', { system: 'psyche', kind: 'runtime', manaCost: 12 }),
    skill('VV', 'bubble_liquidation', 'bubble_liquidation', { system: 'psyche', kind: 'runtime', manaCost: 16 })
  ],
  COTA: [
    skill('COTA', 'deal_card', 'deal_card', { system: 'psyche', kind: 'runtime', manaCost: 8 }),
    skill('COTA', 'gather_or_spread', 'gather_or_spread', { system: 'psyche', kind: 'runtime', manaCost: 10 })
  ],
  EULALIA: [
    skill('EULALIA', 'absolution', 'absolution', { system: 'moirai', kind: 'runtime', manaCost: 35 }),
    skill('EULALIA', 'benediction', 'benediction', { system: 'moirai', kind: 'fortune', manaCost: 15, power: 35 }),
    skill('EULALIA', 'minor_wish', 'fortune', { system: 'moirai', kind: 'fortune', manaCost: 10, power: 22 }),
    skill('EULALIA', 'grand_wish', 'fortune', { system: 'moirai', kind: 'fortune', manaCost: 30, power: 60 })
  ],
  KUZUHA: [
    skill('KUZUHA', 'house_edge', 'house_edge', { system: 'chaos', kind: 'curse', manaCost: 18, power: 18 }),
    skill('KUZUHA', 'debt_call', 'debt_call', { system: 'chaos', kind: 'runtime', manaCost: 34 }),
    skill('KUZUHA', 'minor_wish', 'fortune', { system: 'moirai', kind: 'fortune', manaCost: 10, power: 22 })
  ],
  TRIXIE: [
    skill('TRIXIE', 'rule_rewrite', 'rule_rewrite', { system: 'chaos', kind: 'runtime', manaCost: 10 }),
    skill('TRIXIE', 'blind_box', 'blind_box', { system: 'chaos', kind: 'runtime', manaCost: 50 })
  ],
  KAKO: [
    skill('KAKO', 'reclassification', 'reclassification', { system: 'psyche', kind: 'runtime', manaCost: 16 }),
    skill('KAKO', 'general_ruling', 'general_ruling', { system: 'psyche', kind: 'runtime', manaCost: 36 })
  ],
  POPPY: [
    skill('POPPY', 'miracle', 'miracle', { system: 'moirai', kind: 'fortune', activation: 'trigger', manaCost: 0 }),
    skill('POPPY', 'lucky_find', 'lucky_find', { system: 'moirai', kind: 'fortune', activation: 'trigger', manaCost: 0, power: 20 })
  ]
};
const allSkills = Object.values(SKILLS_BY_ROLE).flat();

function skill(roleId, skillKey, effect, overrides = {}) {
  const ownerId = roleIdToPlayerId.get(roleId);
  return {
    id: `${roleId}:${skillKey}`,
    skillKey,
    key: skillKey,
    name: skillKey,
    effect,
    type: effect,
    roleId,
    ownerId,
    ownerName: roleId,
    activation: overrides.activation || 'active',
    level: overrides.level ?? 3,
    power: overrides.power ?? 0,
    manaCost: overrides.manaCost ?? 0,
    cooldown: 0,
    system: overrides.system || 'moirai',
    kind: overrides.kind || overrides.system || 'runtime'
  };
}

function createSkillSystem() {
  const marks = new Map();
  const listeners = new Map();
  const mana = new Map(players.map(player => [player.id, { current: 82, max: 100 }]));
  const matchScoped = new Set();

  function markKey(ownerId, key) {
    return `${ownerId}:${key}`;
  }

  return {
    skills: allSkills,
    pendingForces: [
      { ownerId: playerByRole.RINO.id, targetId: playerByRole.SIA.id, type: 'fortune', effect: 'royal_decree', skillKey: 'royal_decree', power: 24 },
      { ownerId: playerByRole.SIA.id, targetId: playerByRole.RINO.id, type: 'curse', effect: 'curse', skillKey: 'havoc', power: 18 },
      { ownerId: playerByRole.KUZUHA.id, targetId: playerByRole.COTA.id, type: 'curse', effect: 'house_edge', skillKey: 'house_edge', power: 22 }
    ],
    _forceSerial: 1,
    _log() {},
    on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event).push(handler);
      return () => {
        const next = (listeners.get(event) || []).filter(entry => entry !== handler);
        listeners.set(event, next);
      };
    },
    emit(event, payload) {
      this.lastEvent = { event, payload };
    },
    getPlayerSkills(ownerId) {
      return allSkills.filter(candidate => candidate.ownerId === ownerId);
    },
    getSkillAvailability() {
      return { ok: true, usable: true };
    },
    getMana(ownerId) {
      return mana.get(ownerId) || { current: 0, max: 100 };
    },
    getManaPool(ownerId) {
      return this.getMana(ownerId);
    },
    regenMana(ownerId, amount) {
      const pool = this.getMana(ownerId);
      const gain = Math.max(0, Number(amount || 0));
      pool.current = Math.min(pool.max, pool.current + gain);
      mana.set(ownerId, pool);
      return gain;
    },
    loseMana(ownerId, amount) {
      const pool = this.getMana(ownerId);
      const loss = Math.min(pool.current, Math.max(0, Number(amount || 0)));
      pool.current -= loss;
      mana.set(ownerId, pool);
      return loss;
    },
    setStatusMark(ownerId, key, payload) {
      marks.set(markKey(ownerId, key), payload || true);
    },
    hasStatusMark(ownerId, key) {
      return marks.has(markKey(ownerId, key));
    },
    clearStatusMark(ownerId, key) {
      marks.delete(markKey(ownerId, key));
    },
    isMatchScopedUsed(key) {
      return matchScoped.has(key);
    },
    consumeMatchScopedUse(key) {
      if (matchScoped.has(key)) return false;
      matchScoped.add(key);
      return true;
    },
    collectActiveForces() {
      return this.pendingForces.slice();
    }
  };
}

const runtimeFlow = new sandbox.RuntimeFlow();
const assetLedger = new sandbox.AssetLedger({
  emitter(event, payload) {
    runtimeFlow.emit(event, payload);
  }
});
const skillSystem = createSkillSystem();
const registeredModules = [];
const unregisteredModules = [];

const runtimeApi = {
  skillSystem,
  skillUI: {
    updateDisplay() {},
    updateButtons() {}
  },
  runtimeFlow,
  getGameConfig: () => config,
  getGameState: () => ({
    phase: 'flop',
    pot: 120,
    board: ['Ah', 'Kd', '7c'],
    communityCards: ['Ah', 'Kd', '7c'],
    players
  }),
  getAssetLedger: () => assetLedger,
  getForceRuntime: () => sandbox.ForceRuntime,
  isMatchScopedUsed: key => skillSystem.isMatchScopedUsed(key),
  consumeMatchScopedUse: key => skillSystem.consumeMatchScopedUse(key),
  moz: {
    _lastPsycheEvents: [],
    resolveForceOpposition(forces) {
      return (forces || []).map(force => ({
        ...force,
        effectivePower: force.effectivePower ?? force.power ?? 0
      }));
    },
    combatFormula: {
      _phaseStateKey: null,
      _phaseTraitState: {},
      _martyrdomStacks: {},
      _debtCount: {},
      onTraitManaGain: null,
      traitSystem: {
        hasEffect() {
          return { has: false, value: null };
        }
      },
      enhanceForces(forces) {
        return forces || [];
      }
    }
  }
};

const registry = new sandbox.RuntimeModuleRegistry(runtimeApi);
runtimeApi.registerRuntimeModule = module => {
  registeredModules.push(module);
  return registry.registerRuntimeModule(module);
};
runtimeApi.unregisterRuntimeModule = moduleId => {
  unregisteredModules.push(moduleId);
  return registry.unregisterRuntimeModule(moduleId);
};
sandbox.AceRuntimeAPI = runtimeApi;
if (sandbox.ForceRuntime && typeof sandbox.ForceRuntime.setRuntimeAPI === 'function') {
  sandbox.ForceRuntime.setRuntimeAPI(runtimeApi);
}

sandbox.AceBuiltinModules.registerBuiltinRoleModules(runtimeApi);

const expectedModuleIds = [
  'builtin:sia-role-ai',
  'builtin:rino-role-ai',
  'builtin:vv-profile-ai',
  'builtin:cota-profile-ai',
  'builtin:eulalia-profile-ai',
  'builtin:kuzuha-profile-ai',
  'builtin:trixie-role-ai',
  'builtin:kako-role-ai',
  'builtin:vv-runtime',
  'builtin:poppy-runtime',
  'builtin:eulalia-runtime',
  'builtin:kuzuha-runtime',
  'builtin:trixie-runtime',
  'builtin:cota-runtime',
  'builtin:kako-runtime'
];
const registeredIds = Array.from(registry.listModules(), String).sort();
assert.deepEqual(registeredIds, expectedModuleIds.slice().sort(), 'all builtin runtime modules should register');

for (const profileId of ['sia', 'rino', 'vv', 'cota', 'eulalia', 'kuzuha', 'trixie', 'kako']) {
  assert.ok(sandbox.NpcRoleDirector.getProfileHandler(profileId), `profile AI should register: ${profileId}`);
}
for (const roleId of ['RINO', 'KUZUHA', 'TRIXIE', 'KAKO']) {
  assert.ok(sandbox.NpcRoleDirector.getRoleHandler(roleId), `role AI should register: ${roleId}`);
}

const ctx = {
  phase: 'flop',
  pot: 120,
  toCall: 24,
  board: ['Ah', 'Kd', '7c'],
  players,
  skillSystem
};
const roleProbeResults = [];
for (const roleId of ROLE_ORDER) {
  for (const probeSkill of SKILLS_BY_ROLE[roleId]) {
    const owner = playerByRole[roleId];
    const input = {
      owner,
      skill: probeSkill,
      ctx,
      difficulty: roleId.toLowerCase(),
      difficultyProfile: roleId.toLowerCase(),
      mana: skillSystem.getMana(owner.id),
      pendingForces: skillSystem.pendingForces
    };
    const fallbackTarget = nextOpponentId(owner.id);
    if (roleId !== 'POPPY') {
      assert.doesNotThrow(() => {
        sandbox.NpcRoleDirector.shouldUseSkill(input, () => false);
        sandbox.NpcRoleDirector.selectSkillTarget(input, nextCtx => nextCtx.primaryTarget?.id ?? fallbackTarget);
        sandbox.NpcRoleDirector.selectProtectTarget(input, () => owner.id);
        sandbox.NpcRoleDirector.augmentSkillOptions(input, () => ({ targetId: fallbackTarget }));
        sandbox.NpcRoleDirector.resolveSkillUseOptions(input, {
          selectSkillTarget: nextCtx => nextCtx.primaryTarget?.id ?? fallbackTarget,
          selectProtectTarget: () => owner.id,
          augmentSkillOptions: () => ({ regression: true })
        });
      }, `${roleId} AI should handle ${probeSkill.skillKey}`);
      roleProbeResults.push(`${roleId}:${probeSkill.skillKey}:ai`);
    }
  }
}

const modulesByRole = new Map();
for (const module of registeredModules) {
  const roleId = roleFromModuleId(module.id);
  if (!roleId) continue;
  if (!modulesByRole.has(roleId)) modulesByRole.set(roleId, []);
  modulesByRole.get(roleId).push(module);
}

const hookProbeResults = [];
for (const roleId of ROLE_ORDER) {
  const roleModules = modulesByRole.get(roleId) || [];
  for (const probeSkill of SKILLS_BY_ROLE[roleId]) {
    for (const module of roleModules) {
      const skillHook = module.hooks && module.hooks['skill:activated'];
      if (typeof skillHook !== 'function') continue;
      assert.doesNotThrow(() => {
        skillHook(skillPayload(roleId, probeSkill), runtimeApi);
      }, `${module.id} should handle skill ${probeSkill.skillKey}`);
      hookProbeResults.push(`${roleId}:${probeSkill.skillKey}:skill-hook`);
    }
  }
}

for (const module of registeredModules) {
  const roleId = roleFromModuleId(module.id);
  if (!roleId || !module.hooks) continue;
  for (const [event, handler] of Object.entries(module.hooks)) {
    if (event === 'skill:activated' || typeof handler !== 'function') continue;
    assert.doesNotThrow(() => {
      handler(payloadForEvent(event, roleId), runtimeApi);
    }, `${module.id} should handle runtime event ${event}`);
    hookProbeResults.push(`${roleId}:${event}:runtime-hook`);
  }
}

assert.equal(capturedErrors.length, 0, `runtime should not log errors: ${capturedErrors.join('\n')}`);

console.log(JSON.stringify({
  runtimeRootFiles: rootJsFiles,
  runtimeFilesChecked: runtimeFiles.length,
  registeredModules: registeredIds,
  aiProbes: roleProbeResults.length,
  hookProbes: hookProbeResults.length
}, null, 2));
console.log('[runtime-role-regression] ok');

function nextOpponentId(ownerId) {
  const target = players.find(player => player.id !== ownerId && !player.folded && player.isActive !== false);
  return target ? target.id : null;
}

function roleFromModuleId(moduleId) {
  const lower = String(moduleId || '').toLowerCase();
  if (lower.includes('sia')) return 'SIA';
  if (lower.includes('rino')) return 'RINO';
  if (lower.includes('vv')) return 'VV';
  if (lower.includes('cota')) return 'COTA';
  if (lower.includes('eulalia')) return 'EULALIA';
  if (lower.includes('kuzuha')) return 'KUZUHA';
  if (lower.includes('trixie')) return 'TRIXIE';
  if (lower.includes('kako')) return 'KAKO';
  if (lower.includes('poppy')) return 'POPPY';
  return null;
}

function skillPayload(roleId, probeSkill) {
  const owner = playerByRole[roleId];
  return {
    skill: { ...probeSkill },
    type: probeSkill.effect,
    ownerId: owner.id,
    targetId: nextOpponentId(owner.id),
    protectId: owner.id,
    options: {
      targetId: nextOpponentId(owner.id),
      direction: 'fortune',
      entrySize: 12,
      cardType: 'good',
      mode: 'gather',
      ruling: 'pass'
    }
  };
}

function payloadForEvent(event, roleId) {
  const owner = playerByRole[roleId] || players[0];
  const force = {
    id: `${roleId}:force`,
    _runtimeId: `${roleId}:force`,
    ownerId: owner.id,
    targetId: nextOpponentId(owner.id),
    protectId: owner.id,
    type: roleId === 'KUZUHA' || roleId === 'SIA' ? 'curse' : 'fortune',
    effect: roleId === 'KUZUHA' ? 'house_edge' : 'fortune',
    skillKey: roleId === 'KUZUHA' ? 'house_edge' : 'minor_wish',
    source: 'runtime-role-regression',
    system: roleId === 'KUZUHA' ? 'chaos' : 'moirai',
    kind: roleId === 'KUZUHA' ? 'curse' : 'fortune',
    power: 18,
    effectivePower: 18
  };
  const summary = {
    recipients: Object.fromEntries(players.map(player => [
      String(player.id),
      {
        ownerId: player.id,
        rawFortune: 12,
        rawCurse: player.id === owner.id ? 8 : 4,
        effectiveFortune: 12,
        effectiveCurse: player.id === owner.id ? 8 : 4,
        totalRaw: 20,
        totalEffective: 20,
        forceCount: 2
      }
    ]))
  };

  if (event === 'force:queued' || event === 'force:removed' || event === 'force:mutated') {
    return { force: { ...force }, meta: { source: 'runtime-role-regression' } };
  }
  if (event === 'mana:changed') {
    return { ownerId: owner.id, before: 72, after: 54, delta: -18, reason: 'runtime-role-regression' };
  }
  if (event === 'street:force_summary') {
    return { phase: 'flop', pot: 120, board: ['Ah', 'Kd', '7c'], allIn: false, summary };
  }
  if (event === 'forces:resolved') {
    return {
      phase: 'flop',
      pot: 120,
      board: ['Ah', 'Kd', '7c'],
      allIn: false,
      snapshot: skillSystem.pendingForces.map(item => ({ ...item, effectivePower: item.power || 0 })),
      psycheEvents: [],
      summary
    };
  }
  if (event === 'street:resolved') {
    return {
      phase: 'flop',
      pot: 120,
      board: ['Ah', 'Kd', '7c'],
      allIn: false,
      snapshot: skillSystem.pendingForces.map(item => ({ ...item, effectivePower: item.power || 0 }))
    };
  }
  if (event === 'table:pre_deal_window' || event === 'table:pre_deal_window_resolved') {
    return { phase: 'flop', nextPhase: 'turn', pot: 120, board: ['Ah', 'Kd', '7c'], players };
  }
  return { phase: 'flop', pot: 120, board: ['Ah', 'Kd', '7c'], allIn: false, players };
}
