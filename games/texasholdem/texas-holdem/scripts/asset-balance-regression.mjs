#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CDP_PORT = process.env.ACEZERO_CDP_PORT || '9223';
const TARGET_URL = process.env.ACEZERO_TEXAS_URL
  || 'http://127.0.0.1:8788/games/texasholdem/texas-holdem/texas-holdem.html';
const CDP_BASE = `http://127.0.0.1:${CDP_PORT}`;
const SCENARIO_FILTER = String(process.env.ACEZERO_ASSET_BALANCE_SCENARIOS || '')
  .split(',')
  .map(item => item.trim())
  .filter(Boolean);
const VERBOSE = process.env.ACEZERO_ASSET_BALANCE_VERBOSE === '1';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../../..');

async function cdpFetch(route, options = {}) {
  const response = await fetch(`${CDP_BASE}${route}`, options);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`CDP ${response.status} ${response.statusText}: ${body}`);
  }
  return response.json();
}

function waitForSocketOpen(socket) {
  return new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
}

function createCdpClient(webSocketDebuggerUrl) {
  const socket = new WebSocket(webSocketDebuggerUrl);
  let seq = 0;
  const pending = new Map();
  const events = [];

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolve(message.result || {});
      return;
    }
    if (message.method) events.push(message);
  });

  return {
    socket,
    events,
    send(method, params = {}) {
      const id = ++seq;
      socket.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
      });
    },
    close() {
      socket.close();
    }
  };
}

async function evalJs(client, expression) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true
  });
  if (result.exceptionDetails) {
    throw new Error(JSON.stringify(result.exceptionDetails, null, 2));
  }
  return result.result?.value;
}

function makeAssetDeck(cards = [], voidCards = []) {
  return {
    asset_count: 0,
    general_slots_unlocked: 4,
    void_slots_unlocked: 2,
    active_general_cards: cards,
    active_void_cards: voidCards,
    history: []
  };
}

function makeScenarioDeck(name) {
  if (name === 'baseline') return makeAssetDeck();
  if (name === 'mid_asset') {
    return makeAssetDeck([
      {
        cardId: 'balance_mid_minor_wish_l2',
        skillKey: 'minor_wish',
        system: 'moirai',
        level: 2,
        targetTags: ['RINO'],
        gameTags: ['texas-holdem'],
        modifiers: [
          { type: 'skill_level', key: 'minor_wish', value: 2 },
          { type: 'skill_cost_flat', key: 'minor_wish', value: -3 }
        ]
      },
      {
        cardId: 'balance_mid_moirai_lens',
        gameTags: ['texas-holdem'],
        modifiers: [{ type: 'force_power_pct', system: 'moirai', value: 0.08 }]
      },
      {
        cardId: 'balance_mid_opening_glimmer',
        gameTags: ['texas-holdem'],
        modifiers: [{ type: 'once_per_hand_fortune_flat', value: 12 }]
      }
    ]);
  }
  if (name === 'high_asset') {
    return makeAssetDeck([
      {
        cardId: 'balance_high_minor_wish_l4',
        skillKey: 'minor_wish',
        system: 'moirai',
        level: 4,
        targetTags: ['RINO'],
        gameTags: ['texas-holdem'],
        modifiers: [
          { type: 'skill_level', key: 'minor_wish', value: 4 },
          { type: 'skill_cost_flat', key: 'minor_wish', value: -5 }
        ]
      },
      {
        cardId: 'balance_high_grand_wish_l4',
        skillKey: 'grand_wish',
        system: 'moirai',
        level: 4,
        targetTags: ['RINO'],
        gameTags: ['texas-holdem'],
        modifiers: [
          { type: 'skill_level', key: 'grand_wish', value: 4 },
          { type: 'skill_cost_pct', key: 'grand_wish', value: -0.15 }
        ]
      },
      {
        cardId: 'balance_high_rainbow_force',
        gameTags: ['any'],
        modifiers: [
          { type: 'all_force_power_bonus', value: 0.16 },
          { type: 'first_force_power_pct', value: 0.1 }
        ]
      },
      {
        cardId: 'balance_high_opening_blessing',
        gameTags: ['texas-holdem'],
        modifiers: [{ type: 'once_per_hand_fortune_flat', value: 14 }]
      }
    ], [
      {
        cardId: 'balance_high_mana_battery',
        gameTags: ['texas-holdem'],
        modifiers: [{ type: 'mana_max_flat', value: 10 }]
      }
    ]);
  }
  throw new Error(`Unknown scenario: ${name}`);
}

function makeScenarioConfig(baseConfig, scenarioName) {
  return {
    ...baseConfig,
    gameMode: 'texas-holdem',
    blinds: [20, 40],
    chips: 4000,
    heroChips: 4000,
    hero: {
      ...(baseConfig.hero || {}),
      vanguard: { name: 'RINO', level: 4, trait: 'crimson_crown' },
      rearguard: { name: 'RINO_REAR', level: 4, trait: 'obsessive_love' },
      attrs: { moirai: 30, chaos: 0, psyche: 18, void: 0 },
      vanguardSkills: [
        { key: 'minor_wish', level: 2 },
        { key: 'grand_wish', level: 2 },
        { key: 'premonition', level: 2 },
        { key: 'analysis', level: 2 }
      ],
      rearguardSkills: [],
      mana: 100,
      maxMana: 100
    },
    seats: {
      SB: {
        vanguard: { name: 'COTA', level: 3 },
        attrs: { moirai: 0, chaos: 22, psyche: 28, void: 0 },
        skills: [
          { key: 'hex', level: 2 },
          { key: 'premonition', level: 2 },
          { key: 'analysis', level: 2 },
          { key: 'refraction', level: 2 }
        ],
        ai: 'aggressive',
        difficulty: 'pro',
        mental: { discipline: 50, composureMax: 100 }
      },
      BB: {
        vanguard: { name: 'VV', level: 3 },
        attrs: { moirai: 0, chaos: 30, psyche: 25, void: 0 },
        skills: [
          { key: 'hex', level: 3 },
          { key: 'havoc', level: 2 },
          { key: 'premonition', level: 2 },
          { key: 'analysis', level: 2 }
        ],
        ai: 'balanced',
        difficulty: 'boss',
        mental: { discipline: 50, composureMax: 100 }
      }
    },
    world: {
      ...(baseConfig.world || {}),
      assetDeck: makeScenarioDeck(scenarioName)
    }
  };
}

function buildInjection(config, scenarioName) {
  return `
    (() => {
      const config = ${JSON.stringify(config).replace(/</g, '\\u003c')};
      window.__ACEZERO_ASSET_BALANCE_SCENARIO__ = ${JSON.stringify(scenarioName)};
      window.__ACEZERO_ASSET_BALANCE_CONFIG__ = config;
      function send() {
        window.postMessage({ type: 'acezero-game-data', payload: config, source: 'asset-balance-regression' }, '*');
      }
      send();
      window.addEventListener('DOMContentLoaded', send);
      window.addEventListener('load', send);
      const timer = setInterval(send, 80);
      setTimeout(() => clearInterval(timer), 2400);
    })();
  `;
}

function summarizeCdpEvents(events) {
  const consoleEvents = events
    .filter(event => event.method === 'Runtime.consoleAPICalled')
    .map(event => {
      const args = event.params?.args || [];
      return {
        type: event.params?.type || 'log',
        text: args.map(arg => {
          if (arg.value != null) return String(arg.value);
          if (arg.description != null) return String(arg.description);
          return '';
        }).join(' ')
      };
    });
  const skillLogs = consoleEvents.filter(event => event.text.includes('[SkillSystem]'));
  const mozLogs = consoleEvents.filter(event => event.text.includes('[MoZ]') || event.text.includes('[MonteOfZero]'));
  const aiLogs = consoleEvents.filter(event => event.text.includes('[AI]') || event.text.includes('NPC_SKILL_'));
  const issues = events
    .filter(event => event.method === 'Runtime.exceptionThrown' || event.method === 'Log.entryAdded')
    .map(event => event.params)
    .slice(0, 40);
  return { skillLogs, mozLogs, aiLogs, issues };
}

function summarizeForceList(forces) {
  const list = Array.isArray(forces) ? forces : [];
  const byType = {};
  const bySystem = {};
  const byOwner = {};
  let rawPower = 0;
  let effectivePower = 0;
  let assetBoosted = 0;
  for (const force of list) {
    const type = force?.type || 'unknown';
    const system = force?.system || 'unknown';
    const owner = force?.ownerName || String(force?.ownerId ?? 'unknown');
    const power = Math.max(0, Number(force?.power || 0));
    const ep = Math.max(0, Number(force?.effectivePower != null ? force.effectivePower : force?.power || 0));
    rawPower += power;
    effectivePower += ep;
    byType[type] = (byType[type] || 0) + ep;
    bySystem[system] = (bySystem[system] || 0) + ep;
    byOwner[owner] = (byOwner[owner] || 0) + ep;
    if (force?.assetBonus || force?.assetPassive || force?.assetSourceCardId) assetBoosted += 1;
  }
  return {
    count: list.length,
    rawPower: Math.round(rawPower * 10) / 10,
    effectivePower: Math.round(effectivePower * 10) / 10,
    byType,
    bySystem,
    byOwner,
    assetBoosted
  };
}

function summarizeAssetBonusSources(forces) {
  const sourceMap = new Map();
  for (const force of Array.isArray(forces) ? forces : []) {
    const bonus = force?.assetBonus;
    if (force?.assetSourceCardId) {
      sourceMap.set(force.assetSourceCardId, {
        cardId: force.assetSourceCardId,
        trigger: 'asset_passive',
        count: (sourceMap.get(force.assetSourceCardId)?.count || 0) + 1
      });
    }
    const sources = Array.isArray(bonus?.sources) ? bonus.sources : [];
    for (const source of sources) {
      if (!source?.cardId) continue;
      const prev = sourceMap.get(source.cardId) || {
        cardId: source.cardId,
        type: source.type || null,
        value: source.value ?? null,
        count: 0
      };
      prev.count += 1;
      sourceMap.set(source.cardId, prev);
    }
    const triggers = Array.isArray(bonus?.passiveTriggers) ? bonus.passiveTriggers : [];
    for (const trigger of triggers) {
      if (!trigger?.cardId) continue;
      const prev = sourceMap.get(trigger.cardId) || {
        cardId: trigger.cardId,
        trigger: trigger.trigger || null,
        value: trigger.value ?? null,
        count: 0
      };
      prev.count += 1;
      sourceMap.set(trigger.cardId, prev);
    }
  }
  return Array.from(sourceMap.values());
}

function summarizeResolutionTrace(trace) {
  const entries = Array.isArray(trace) ? trace : [];
  const byStage = {};
  let systemCounterGain = 0;
  let psycheDefenseBlocked = 0;
  let psycheConverted = 0;
  let fortuneContestDrain = 0;
  let curseContestDrain = 0;
  const fortuneContests = [];
  const psycheEvents = [];

  for (const entry of entries) {
    const stage = entry?.stage || 'unknown';
    byStage[stage] = (byStage[stage] || 0) + 1;
    if (stage === 'system_counter') {
      systemCounterGain += Math.max(0, Number(entry.after || 0) - Number(entry.before || 0));
    }
    if (stage === 'psyche_defend' || stage === 'psyche_convert') {
      const defense = Math.max(0, Number(entry.defenseBlockedPower || 0));
      const converted = Math.max(0, Number(entry.convertedPower || 0));
      psycheDefenseBlocked += defense;
      psycheConverted += converted;
      psycheEvents.push({
        action: entry.action || stage,
        skillKey: entry.skillKey || null,
        arbiterOwner: entry.arbiterOwner || null,
        protectId: entry.protectId ?? null,
        targetOwner: entry.targetOwner ?? null,
        originalPower: entry.originalPower ?? null,
        defenseBlockedPower: defense,
        convertedPower: converted,
        remainingPower: entry.remainingPower ?? null,
        efficiency: entry.efficiency ?? null
      });
    }
    if (stage === 'fortune_curse_contest') {
      const drain = Math.max(0, Number(entry.contestAmount || 0));
      fortuneContestDrain += drain;
      const curses = Array.isArray(entry.curses) ? entry.curses : [];
      for (const curse of curses) {
        curseContestDrain += Math.max(0, Number(curse.before || 0) - Number(curse.after || 0));
      }
      fortuneContests.push({
        fortune: entry.fortune || null,
        fortuneOwnerId: entry.fortuneOwnerId ?? null,
        fortuneBefore: entry.fortuneBefore ?? null,
        fortuneAfter: entry.fortuneAfter ?? null,
        curseTotalBefore: entry.curseTotalBefore ?? null,
        contestAmount: drain,
        curses: curses.map(curse => ({
          force: curse.force || null,
          ownerId: curse.ownerId ?? null,
          before: curse.before ?? null,
          after: curse.after ?? null
        }))
      });
    }
  }

  return {
    byStage,
    totals: {
      systemCounterGain: Math.round(systemCounterGain * 10) / 10,
      psycheDefenseBlocked: Math.round(psycheDefenseBlocked * 10) / 10,
      psycheConverted: Math.round(psycheConverted * 10) / 10,
      fortuneContestDrain: Math.round(fortuneContestDrain * 10) / 10,
      curseContestDrain: Math.round(curseContestDrain * 10) / 10
    },
    psycheEvents,
    fortuneContests
  };
}

function summarizeScenarioResult(result) {
  const sample = result.sample || {};
  const before = sample.beforeState || {};
  const summary = before.assetSummary || {};
  const activations = Array.isArray(sample.activations) ? sample.activations : [];
  const skills = Array.isArray(before.skills) ? before.skills : [];
  const getSkill = (ownerId, key) => skills.find(skill => skill.ownerId === ownerId && skill.key === key) || null;
  return {
    scenario: result.scenario,
    asset: {
      active: summary.counts?.active || 0,
      effective: summary.counts?.effective || 0,
      slots: summary.slots || null,
      gameplay: summary.gameplay || null
    },
    keySkills: {
      minorWish: getSkill(0, 'minor_wish'),
      grandWish: getSkill(0, 'grand_wish'),
      heroPremonition: getSkill(0, 'premonition'),
      cotaHex: getSkill(1, 'hex'),
      vvHavoc: getSkill(2, 'havoc')
    },
    activations: activations.map(item => ({
      ownerId: item.ownerId,
      key: item.key,
      found: item.found,
      level: item.level,
      success: !!item.result?.success,
      reason: item.result?.reason || null,
      cost: item.result?.actualManaCost ?? item.renderedManaCost ?? null
    })),
    mana: {
      before: before.mana || {},
      after: sample.manaAfter || {}
    },
    forces: {
      pending: summarizeForceList(sample.pendingForces),
      enhanced: summarizeForceList(sample.enhancedForces),
      resolved: summarizeForceList(sample.resolvedForces)
    },
    resolution: summarizeResolutionTrace(sample.resolutionTrace),
    assetBonusSources: summarizeAssetBonusSources(sample.enhancedForces),
    logs: {
      skill: result.events?.skillLogs?.length || 0,
      moz: result.events?.mozLogs?.length || 0,
      ai: result.events?.aiLogs?.length || 0,
      issues: result.events?.issues?.length || 0
    },
    mozSelected: sample.mozLastSelectionMeta
      ? {
          card: sample.mozLastSelectionMeta.selectedCard || null,
          score: sample.mozLastSelectionMeta.score ?? null,
          activeForceCount: Array.isArray(sample.mozLastSelectionMeta.activeForces)
            ? sample.mozLastSelectionMeta.activeForces.length
            : null
        }
      : null
  };
}

async function runScenario(baseConfig, scenarioName) {
  const config = makeScenarioConfig(baseConfig, scenarioName);
  const target = await cdpFetch(`/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' });
  const client = createCdpClient(target.webSocketDebuggerUrl);
  await waitForSocketOpen(client.socket);

  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('Log.enable');
  await client.send('Network.enable');
  await client.send('Network.setCacheDisabled', { cacheDisabled: true });
  await client.send('Page.addScriptToEvaluateOnNewDocument', {
    source: buildInjection(config, scenarioName)
  });
  await client.send('Page.navigate', { url: TARGET_URL });
  await evalJs(client, `new Promise(resolve => setTimeout(resolve, 5200))`);

  const sample = await evalJs(client, `(async () => {
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    document.querySelector('#splash-deal')?.click();
    await wait(1700);
    document.querySelector('#magic-key')?.click();
    await wait(300);

    const ss = window.skillSystem;
    const moz = window.moz;
    const skillUI = window.skillUI;
    const heroId = skillUI?.humanPlayerId ?? 0;
    const allSkills = Array.from(ss?.skills?.values?.() || []);
    const findSkill = (ownerId, key) => allSkills.find(skill => skill.ownerId === ownerId && skill.skillKey === key) || null;
    const snapshotMana = () => {
      const out = {};
      [0, 1, 2].forEach(id => {
        const mana = ss?.getMana?.(id);
        if (mana) out[id] = JSON.parse(JSON.stringify(mana));
      });
      return out;
    };
    const summarizeForce = force => ({
      ownerId: force.ownerId,
      ownerName: force.ownerName,
      targetId: force.targetId ?? null,
      protectId: force.protectId ?? null,
      skillKey: force.skillKey,
      type: force.type,
      system: force.system,
      kind: force.kind,
      level: force.level,
      power: force.power,
      effectivePower: force.effectivePower,
      assetPassive: !!force._assetPassive,
      assetSourceCardId: force._assetSourceCardId || null,
      assetBonus: force._assetBonus || null,
      suppressed: !!force._suppressed,
      suppressedBy: force._suppressedBy || null,
      systemCounter: force._systemCounter || null,
      systemCounterMult: force._systemCounterMult || null,
      psycheDefendedPower: force._psycheDefendedPower || 0,
      psycheDefendedBy: force._psycheDefendedBy || null,
      psycheConvertedPower: force._psycheConvertedPower || 0,
      psycheConvertedBy: force._psycheConvertedBy || null,
      contestDrain: force._contestDrain || 0,
      converted: !!force._converted,
      convertedFrom: force._convertedFrom || null
    });
    const activate = (ownerId, key, options = {}) => {
      const skill = findSkill(ownerId, key);
      const before = snapshotMana();
      const result = skill && ss?.activatePlayerSkill
        ? ss.activatePlayerSkill(skill.uniqueId, Object.assign({
            gameContext: {
              phase: 'preflop',
              pot: 120,
              board: [],
              players: [
                { id: 0, name: 'RINO', type: 'human', isActive: true, folded: false },
                { id: 1, name: 'COTA', type: 'ai', isActive: true, folded: false },
                { id: 2, name: 'VV', type: 'ai', isActive: true, folded: false }
              ]
            }
          }, options))
        : { success: false, reason: 'SKILL_NOT_FOUND' };
      return {
        ownerId,
        key,
        found: !!skill,
        level: skill?.level ?? null,
        baseManaCost: skill?.baseManaCost ?? skill?.manaCost ?? null,
        renderedManaCost: skill && ss?.getSkillActualManaCost ? ss.getSkillActualManaCost(skill, {}) : null,
        result: result ? {
          success: !!result.success,
          reason: result.reason || null,
          actualManaCost: result.actualManaCost ?? null
        } : null,
        beforeMana: before,
        afterMana: snapshotMana()
      };
    };

    const beforeState = {
      scenario: window.__ACEZERO_ASSET_BALANCE_SCENARIO__,
      title: document.title,
      hasAdapter: !!window.AssetDeckAdapter,
      hasSummary: !!window.ACE0AssetDeckSummary,
      hasSkillSystem: !!ss,
      hasMoz: !!moz,
      assetSummary: window.__ACEZERO_ASSET_BALANCE_CONFIG__?.world?.assetDeck && window.ACE0AssetDeckSummary
        ? window.ACE0AssetDeckSummary.create({ adapter: window.AssetDeckAdapter || null }).buildAssetDeckSummary(window.__ACEZERO_ASSET_BALANCE_CONFIG__.world.assetDeck, {
            gameId: 'texas-holdem',
            mode: 'host',
            adapter: window.AssetDeckAdapter || null,
            compiledModifiers: ss?.assetModifiers || null
          })
        : null,
      mana: snapshotMana(),
      skillPanelText: document.querySelector('#skill-panel')?.innerText?.slice(0, 1600) || '',
      skills: allSkills.map(skill => ({
        ownerId: skill.ownerId,
        ownerName: skill.ownerName,
        key: skill.skillKey,
        level: skill.level,
        system: skill.system,
        kind: skill.kind,
        effect: skill.effect,
        manaCost: skill.manaCost,
        actualManaCost: ss?.getSkillActualManaCost ? ss.getSkillActualManaCost(skill, {}) : skill.manaCost
      }))
    };

    const activations = [
      activate(0, 'minor_wish', { protectId: heroId }),
      activate(0, 'premonition', { protectId: heroId }),
      activate(1, 'hex', { targetId: heroId }),
      activate(1, 'refraction', { protectId: 1, targetId: heroId }),
      activate(2, 'havoc', { targetId: heroId }),
      activate(2, 'analysis', { protectId: 2, targetId: heroId })
    ];

    await wait(250);
    const pending = Array.isArray(ss?.pendingForces) ? ss.pendingForces.slice() : [];
    const enhanced = moz?.combatFormula?.enhanceForces
      ? moz.combatFormula.enhanceForces(pending, { players: [] })
      : pending;
    const resolved = moz?.resolveForceOpposition
      ? moz.resolveForceOpposition(enhanced, { source: 'asset-balance-regression' })
      : enhanced;
    const state = ss?.getState ? ss.getState() : null;

    return {
      beforeState,
      activations,
      pendingForces: pending.map(summarizeForce),
      enhancedForces: enhanced.map(summarizeForce),
      resolvedForces: Array.isArray(resolved) ? resolved.map(summarizeForce) : resolved,
      resolutionTrace: Array.isArray(moz?._lastResolutionTrace) ? JSON.parse(JSON.stringify(moz._lastResolutionTrace)) : [],
      manaAfter: snapshotMana(),
      skillSystemState: state,
      mozLastSelectionMeta: moz?.lastSelectionMeta ? JSON.parse(JSON.stringify(moz.lastSelectionMeta)) : null
    };
  })()`);

  const events = summarizeCdpEvents(client.events);
  client.close();
  return { scenario: scenarioName, sample, events };
}

async function main() {
  const baseConfig = JSON.parse(await fs.readFile(path.join(repoRoot, 'content/game-config.json'), 'utf8'));
  const scenarioNames = ['baseline', 'mid_asset', 'high_asset']
    .filter(name => SCENARIO_FILTER.length === 0 || SCENARIO_FILTER.includes(name));
  const results = [];
  for (const scenarioName of scenarioNames) {
    results.push(await runScenario(baseConfig, scenarioName));
  }
  console.log(JSON.stringify({
    targetUrl: TARGET_URL,
    scenarios: results.map(summarizeScenarioResult),
    raw: VERBOSE ? results : undefined
  }, null, 2));
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
