#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CDP_PORT = process.env.ACEZERO_CDP_PORT || '9223';
const TARGET_URL = process.env.ACEZERO_TEXAS_URL
  || 'http://127.0.0.1:8787/games/texasholdem/texas-holdem/texas-holdem.html';
const CDP_BASE = `http://127.0.0.1:${CDP_PORT}`;

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

function makeAssetConfig(baseConfig) {
  return {
    ...baseConfig,
    gameMode: 'texas-holdem',
    blinds: [20, 40],
    chips: 4000,
    heroChips: 4000,
    hero: {
      ...(baseConfig.hero || {}),
      vanguard: { name: 'RINO', level: 3, trait: 'crimson_crown' },
      rearguard: { name: 'RINO_REAR', level: 3, trait: 'obsessive_love' },
      attrs: { moirai: 20, chaos: 0, psyche: 0, void: 0 },
      vanguardSkills: [],
      rearguardSkills: [],
      mana: 100,
      maxMana: 100
    },
    seats: {
      SB: {
        vanguard: { name: 'COTA', level: 3 },
        attrs: { moirai: 0, chaos: 20, psyche: 30, void: 0 },
        skills: [{ key: 'hex', level: 1 }],
        ai: 'aggressive',
        difficulty: 'pro',
        mental: { discipline: 50, composureMax: 100 }
      },
      BB: {
        vanguard: { name: 'VV', level: 3 },
        attrs: { moirai: 0, chaos: 30, psyche: 30, void: 0 },
        skills: [{ key: 'hex', level: 1 }],
        ai: 'balanced',
        difficulty: 'regular',
        mental: { discipline: 50, composureMax: 100 }
      }
    },
    world: {
      ...(baseConfig.world || {}),
      assetDeck: {
        general_slots_unlocked: 4,
        void_slots_unlocked: 2,
        active_general_cards: [
          {
            cardId: 'asset_skill_minor_wish_l2_regression',
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
            cardId: 'asset_rainbow_contract_regression',
            gameTags: ['any'],
            modifiers: [{ type: 'all_force_power_bonus', value: 0.08 }]
          },
          {
            cardId: 'asset_first_cast_discount_regression',
            gameTags: ['texas-holdem'],
            modifiers: [{ type: 'first_skill_cost_flat', value: -4 }]
          },
          {
            cardId: 'asset_first_force_focus_regression',
            gameTags: ['texas-holdem'],
            modifiers: [{ type: 'first_force_power_pct', value: 0.1 }]
          },
          {
            cardId: 'asset_opening_blessing_regression',
            gameTags: ['texas-holdem'],
            modifiers: [{ type: 'once_per_hand_fortune_flat', value: 9 }]
          }
        ],
        active_void_cards: [
          {
            cardId: 'asset_mana_battery_regression',
            gameTags: ['texas-holdem'],
            modifiers: [{ type: 'mana_max_flat', value: 10 }]
          }
        ]
      }
    }
  };
}

async function main() {
  const baseConfig = JSON.parse(await fs.readFile(path.join(repoRoot, 'content/game-config.json'), 'utf8'));
  const assetConfig = makeAssetConfig(baseConfig);
  const injection = `
    (() => {
      const config = ${JSON.stringify(assetConfig).replace(/</g, '\\u003c')};
      window.__ACEZERO_ASSET_REGRESSION_CONFIG__ = config;
      function send() {
        window.postMessage({ type: 'acezero-game-data', payload: config, source: 'injected' }, '*');
      }
      send();
      window.addEventListener('DOMContentLoaded', send);
      window.addEventListener('load', send);
      const timer = setInterval(send, 80);
      setTimeout(() => clearInterval(timer), 2400);
    })();
  `;

  const target = await cdpFetch(`/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' });
  const client = createCdpClient(target.webSocketDebuggerUrl);
  await waitForSocketOpen(client.socket);

  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('Log.enable');
  await client.send('Page.addScriptToEvaluateOnNewDocument', { source: injection });
  await client.send('Page.navigate', { url: TARGET_URL });
  await evalJs(client, `new Promise(resolve => setTimeout(resolve, 5200))`);

  const afterClick = await evalJs(client, `(async () => {
    document.querySelector('#splash-deal')?.click();
    await new Promise(resolve => setTimeout(resolve, 1600));
    document.querySelector('#magic-key')?.click();
    await new Promise(resolve => setTimeout(resolve, 350));
    const ss = window.skillSystem;
    const skillUI = window.skillUI;
    const heroId = skillUI?.humanPlayerId ?? 0;
    const skills = ss?.getPlayerSkills?.(heroId) || [];
    const minor = skills.find(skill => skill.skillKey === 'minor_wish') || null;
    const manaSnapshot = ss?.getMana?.(heroId) || null;
    const beforeState = {
      title: document.title,
      hasAdapter: !!window.AssetDeckAdapter,
      hasSkillSystem: !!ss,
      hasCombatFormula: !!window.moz?.combatFormula,
      assetAppliedCards: ss?.assetModifiers?.debug?.applied?.map(item => item.type) || [],
      minorWishLevel: minor?.level ?? null,
      minorWishCost: minor && ss?.getSkillActualManaCost ? ss.getSkillActualManaCost(minor, {}) : null,
      mana: manaSnapshot ? JSON.parse(JSON.stringify(manaSnapshot)) : null,
      skillPanelText: document.querySelector('#skill-panel')?.innerText || ''
    };
    const panel = document.querySelector('#skill-panel');
    const button = Array.from(panel?.querySelectorAll('button') || [])
      .find(node => /小愿望|小吉|minor/i.test(node.innerText || node.title || '') && !node.disabled);
    const buttonText = button?.innerText?.trim() || '';
    const beforeMana = window.skillSystem?.getMana?.(window.skillUI?.humanPlayerId ?? 0)?.current ?? null;
    button?.click();
    await new Promise(resolve => setTimeout(resolve, 600));
    const skillSystemAfterClick = window.skillSystem;
    const afterMana = skillSystemAfterClick?.getMana?.(window.skillUI?.humanPlayerId ?? 0)?.current ?? null;
    const pending = skillSystemAfterClick?.pendingForces || [];
    const enhanced = window.moz?.combatFormula?.enhanceForces
      ? window.moz.combatFormula.enhanceForces(pending, { players: [] })
      : pending;
    return {
      beforeState,
      clicked: !!button,
      buttonText,
      beforeMana,
      afterMana,
      pending: pending.map(force => ({
        skillKey: force.skillKey,
        system: force.system,
        type: force.type,
        level: force.level,
        power: force.power,
        assetPassive: !!force._assetPassive,
        assetSourceCardId: force._assetSourceCardId || null
      })),
      enhanced: enhanced.map(force => ({
        skillKey: force.skillKey,
        system: force.system,
        type: force.type,
        level: force.level,
        power: force.power,
        effectivePower: force.effectivePower,
        assetBonus: force._assetBonus || null
      }))
    };
  })()`);

  const pageIssues = client.events
    .filter(event => event.method === 'Runtime.exceptionThrown' || event.method === 'Log.entryAdded')
    .map(event => event.params)
    .filter(issue => !String(issue?.entry?.url || '').endsWith('/favicon.ico'))
    .slice(0, 40);

  client.close();
  if (!afterClick.beforeState.skillPanelText.includes('ASSET')) {
    throw new Error(`Expected skill card to render Asset explanation tags: ${JSON.stringify(afterClick.beforeState, null, 2)}`);
  }
  if (afterClick.beforeState.minorWishCost !== 3) {
    throw new Error(`Expected first-cast passive to reduce minor_wish to 3 MP: ${JSON.stringify(afterClick.beforeState, null, 2)}`);
  }
  if (!afterClick.pending.some(force => force.assetPassive && force.assetSourceCardId === 'asset_opening_blessing_regression')) {
    throw new Error(`Expected once-per-hand fortune passive to queue an Asset force: ${JSON.stringify(afterClick.pending, null, 2)}`);
  }
  if (!afterClick.enhanced.some(force => force.assetBonus && Number(force.assetBonus.pctDelta || 0) >= 0.18)) {
    throw new Error(`Expected enhanced force to expose Asset bonus details: ${JSON.stringify(afterClick, null, 2)}`);
  }
  console.log(JSON.stringify({ afterClick, pageIssues }, null, 2));
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
