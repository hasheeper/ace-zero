#!/usr/bin/env node

const CDP_PORT = process.env.ACEZERO_CDP_PORT || '9223';
const TARGET_URL = process.env.ACEZERO_TEXAS_URL
  || 'http://127.0.0.1:8765/games/texasholdem/texas-holdem/texas-holdem.html';
const CDP_BASE = `http://127.0.0.1:${CDP_PORT}`;

async function cdpFetch(path, options = {}) {
  const response = await fetch(`${CDP_BASE}${path}`, options);
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
    },
  };
}

async function waitForLoad(client, timeoutMs = 10000) {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      client.socket.removeEventListener('message', onMessage);
      reject(new Error('Timed out waiting for Page.loadEventFired'));
    }, timeoutMs);

    function onMessage(event) {
      const message = JSON.parse(event.data);
      if (message.method === 'Page.loadEventFired') {
        clearTimeout(timeout);
        client.socket.removeEventListener('message', onMessage);
        resolve();
      }
    }

    client.socket.addEventListener('message', onMessage);
  });
}

async function evalJs(client, expression) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || JSON.stringify(result.exceptionDetails));
  }
  return result.result?.value;
}

async function main() {
  const target = await cdpFetch(`/json/new?${encodeURIComponent(TARGET_URL)}`, { method: 'PUT' });
  const client = createCdpClient(target.webSocketDebuggerUrl);
  await waitForSocketOpen(client.socket);

  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('Log.enable');
  await client.send('DOM.enable');
  await client.send('Page.navigate', { url: TARGET_URL });
  await waitForLoad(client);
  await evalJs(client, `new Promise((resolve) => setTimeout(resolve, 2600))`);

  const initial = await evalJs(client, `(() => ({
    title: document.title,
    url: location.href,
    hasSplashDeal: !!document.querySelector('#splash-deal'),
    hasSkillPanel: !!document.querySelector('#skill-panel'),
    hasDebugBridge: !!window._debug,
    hasSkillSystem: !!window.skillSystem,
    hasMoz: !!window.moz
  }))()`);

  const afterDeal = await evalJs(client, `(async () => {
    document.querySelector('#splash-deal')?.click();
    await new Promise((resolve) => setTimeout(resolve, 1800));
    return {
      message: document.querySelector('#game-message')?.textContent?.trim() || '',
      seats: document.querySelectorAll('.seat').length,
      visibleCards: document.querySelectorAll('#seats-container .card').length,
      foldDisabled: !!document.querySelector('#btn-fold')?.disabled,
      callDisabled: !!document.querySelector('#btn-check-call')?.disabled,
      raiseDisabled: !!document.querySelector('#btn-raise')?.disabled,
      manaText: document.querySelector('#mana-text')?.textContent?.trim() || '',
      skillPanelTextLength: document.querySelector('#skill-panel')?.innerText?.length || 0
    };
  })()`);

  const afterGrimoire = await evalJs(client, `(async () => {
    document.querySelector('#magic-key')?.click();
    await new Promise((resolve) => setTimeout(resolve, 300));
    const panel = document.querySelector('#skill-panel');
    const text = panel?.innerText || '';
    return {
      grimoireClass: document.querySelector('#grimoire-player')?.className || '',
      buttons: panel ? panel.querySelectorAll('button').length : 0,
      cards: panel ? panel.querySelectorAll('.skill-card, .hero-card, .skill-node, .skill-btn').length : 0,
      hasForbiddenText: /\\bTier\\b|\\bT[0-3]\\b|clarity|axiom|reversal|null_field|void_shield|purge_all/.test(text),
      sample: text.slice(0, 800)
    };
  })()`);

  const afterSkillClick = await evalJs(client, `(async () => {
    const beforeMana = window.skillSystem?.getMana?.(window.skillUI?.humanPlayerId ?? 0)?.current ?? null;
    const beforePending = window.skillSystem?.pendingForces?.length ?? null;
    const panel = document.querySelector('#skill-panel');
    const button = Array.from(panel?.querySelectorAll('button') || []).find((node) => !node.disabled);
    const beforeButtonText = button?.innerText?.trim() || '';
    button?.click();
    await new Promise((resolve) => setTimeout(resolve, 500));
    const afterMana = window.skillSystem?.getMana?.(window.skillUI?.humanPlayerId ?? 0)?.current ?? null;
    const pending = window.skillSystem?.pendingForces || [];
    return {
      clicked: !!button,
      buttonText: beforeButtonText.slice(0, 120),
      beforeMana,
      afterMana,
      beforePending,
      afterPending: pending.length,
      pendingPreview: pending.slice(0, 3).map((force) => ({
        ownerId: force.ownerId,
        system: force.system,
        kind: force.kind,
        type: force.type,
        power: force.power,
        level: force.level,
        attr: force.attr,
        tier: force.tier
      }))
    };
  })()`);

  const runtime = await evalJs(client, `(() => {
    const skillSystem = window.skillSystem;
    const moz = window.moz;
    const humanPlayerId = window.skillUI?.humanPlayerId ?? 0;
    const output = {
      hasSkillSystem: !!skillSystem,
      hasMoz: !!moz,
      humanPlayerId
    };
    try {
      const skills = skillSystem?.getPlayerSkills?.(humanPlayerId)
        || [];
      const flat = Array.isArray(skills) ? skills : Object.values(skills || {}).flat();
      output.humanSkillCount = flat.length;
      output.skillSample = flat.slice(0, 5).map((skill) => ({
        id: skill.id,
        uniqueId: skill.uniqueId,
        ownerId: skill.ownerId,
        system: skill.system,
        kind: skill.kind,
        level: skill.level,
        matrix: skill.matrix,
        tier: skill.tier,
        attr: skill.attr
      }));
      output.hasOldSkillFields = flat.some((skill) => (
        Object.prototype.hasOwnProperty.call(skill, 'tier')
        || Object.prototype.hasOwnProperty.call(skill, 'attr')
      ));
    } catch (error) {
      output.skillError = error.message;
    }

    try {
      if (moz?.resolveForceOpposition) {
        const forceResult = moz.resolveForceOpposition([
          { side: 'ally', system: 'psyche', kind: 'guard', level: 2, power: 10 },
          { side: 'enemy', system: 'chaos', kind: 'distortion', level: 2, power: 10 }
        ], { source: 'regression' });
        output.forceResultKeys = Object.keys(forceResult || {});
        output.forceResultPreview = JSON.parse(JSON.stringify(forceResult).slice(0, 1200));
      }
    } catch (error) {
      output.forceError = error.message;
    }
    return output;
  })()`);

  const pageIssues = client.events
    .filter((event) => event.method === 'Runtime.exceptionThrown' || event.method === 'Log.entryAdded')
    .map((event) => event.params)
    .slice(0, 30);

  client.close();
  console.log(JSON.stringify({ initial, afterDeal, afterGrimoire, afterSkillClick, runtime, pageIssues }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
