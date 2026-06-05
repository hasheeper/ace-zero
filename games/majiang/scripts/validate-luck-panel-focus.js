'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PROJECT_DIR = path.resolve(__dirname, '..');
const LUCK_PANEL_SCRIPT = path.join(PROJECT_DIR, 'frontend/scripts/ui/luck-panel.js');

function pass(name) {
  console.log(`[PASS] ${name}`);
}

function createPanelHarness(options = {}) {
  const code = fs.readFileSync(LUCK_PANEL_SCRIPT, 'utf8');
  const events = [];
  const runtimeCalls = [];
  const runtimeListeners = [];
  const stored = {
    ...(options.localStorage || {})
  };
  let storedSetCount = 0;
  let runtimeMana = Number.isFinite(Number(options.runtimeMana)) ? Math.round(Number(options.runtimeMana)) : 1000;
  function enforceRuntimeCallLimit() {
    if (!Number.isFinite(Number(options.runtimeCallLimit))) return;
    const limit = Math.max(1, Math.floor(Number(options.runtimeCallLimit)));
    if (runtimeCalls.length > limit) {
      throw new Error(`runtime sync call limit exceeded: ${runtimeCalls.length} > ${limit}`);
    }
  }
  function emitRuntimeLuckUpdate(type, payload) {
    if (!options.emitRuntimeLuckUpdates) return;
    runtimeListeners.slice().forEach((listener) => {
      listener({
        type,
        payload: JSON.parse(JSON.stringify(payload || {})),
        meta: { source: 'runtime-luck' }
      });
    });
  }
  const fakeRuntime = {
    kind: 'single-round-runtime',
    getSeatHandCodes() {
      return ['m1', 'm2', 'm3'];
    },
    getLuckManaState() {
      return {
        seats: {
          bottom: {
            mana: runtimeMana,
            maxMana: 1000,
            manaLocked: runtimeMana <= 0,
            manaBroken: false
          }
        }
      };
    },
    setLuckWindState(seat, windState, callOptions = {}) {
      runtimeCalls.push({
        type: 'wind',
        seat,
        state: JSON.parse(JSON.stringify(windState)),
        options: JSON.parse(JSON.stringify(callOptions || {}))
      });
      enforceRuntimeCallLimit();
      emitRuntimeLuckUpdate('luck:wind-update', { seat, windState });
      return windState;
    },
    setLuckForceState(seat, forceState, callOptions = {}) {
      runtimeCalls.push({
        type: 'force',
        seat,
        state: JSON.parse(JSON.stringify(forceState)),
        options: JSON.parse(JSON.stringify(callOptions || {}))
      });
      enforceRuntimeCallLimit();
      emitRuntimeLuckUpdate('luck:force-update', { seat, forceState });
      return forceState;
    }
  };
  function createFakeElement(id = '') {
    const classNames = new Set();
    return {
      id,
      dataset: {},
      style: {},
      hidden: false,
      disabled: false,
      textContent: '',
      innerHTML: '',
      children: [],
      offsetWidth: 1,
      classList: {
        add(name) { classNames.add(name); },
        remove(name) { classNames.delete(name); },
        toggle(name, enabled) {
          if (enabled === false) classNames.delete(name);
          else classNames.add(name);
        },
        contains(name) { return classNames.has(name); }
      },
      setAttribute(name, value) {
        this[name] = String(value);
      },
      appendChild(child) {
        this.children.push(child);
        return child;
      },
      addEventListener() {},
      querySelector(selector) {
        if (selector === '.luck-wind-col') return createFakeElement('wind-col');
        if (selector === '.luck-curse-target-col') return createFakeElement('target-col');
        return null;
      },
      querySelectorAll() {
        return [];
      }
    };
  }
  const fakePanelEl = createFakeElement('luck-panel');
  const domNodes = {
    '#luck-mana-energy': createFakeElement('luck-mana-energy'),
    '#luck-mana-digit': createFakeElement('luck-mana-digit'),
    '#luck-intent-ghost': createFakeElement('luck-intent-ghost'),
    '#luck-intent-solid': createFakeElement('luck-intent-solid'),
    '#luck-focus-pips': createFakeElement('luck-focus-pips'),
    '#luck-layer-title': createFakeElement('luck-layer-title'),
    '#luck-mode-section-kicker': createFakeElement('luck-mode-section-kicker'),
    '#luck-commit-route-box': createFakeElement('luck-commit-route-box'),
    '#luck-commit-route-grid': createFakeElement('luck-commit-route-grid'),
    '#luck-intent-hitboxes': createFakeElement('luck-intent-hitboxes')
  };
  fakePanelEl.querySelector = function querySelector(selector) {
    if (domNodes[selector]) return domNodes[selector];
    if (selector === '.luck-wind-col') return createFakeElement('wind-col');
    if (selector === '.luck-curse-target-col') return createFakeElement('target-col');
    return null;
  };
  const runtimeForApi = options.wrapRuntime
    ? {
        kind: 'browser-game-session-runtime',
        getRuntime() {
          return fakeRuntime;
        }
      }
    : fakeRuntime;
  const runtimeApi = {
    getRuntime() {
      return runtimeForApi;
    },
    subscribe(listener) {
      if (typeof listener === 'function') runtimeListeners.push(listener);
      return function unsubscribe() {};
    }
  };
  const context = {
    console,
    setTimeout(callback) {
      if (typeof callback === 'function') callback();
      return 0;
    },
    document: {
      readyState: options.mountWithDom ? 'complete' : 'loading',
      addEventListener() {},
      getElementById(id) {
        return options.mountWithDom && id === 'luck-panel' ? fakePanelEl : null;
      },
      createElement(tagName) {
        return createFakeElement(tagName);
      },
      body: options.mountWithDom
        ? {
            firstChild: null,
            insertBefore() {}
          }
        : null
    },
    localStorage: options.localStorage
      ? {
          getItem(key) {
            return Object.prototype.hasOwnProperty.call(stored, key) ? stored[key] : null;
          },
          setItem(key, value) {
            stored[key] = String(value);
            storedSetCount += 1;
          }
        }
      : null,
    CustomEvent: function CustomEvent(type, init) {
      this.type = type;
      this.detail = init && init.detail;
    },
    AceZeroMahjongUI: {
      runtime: runtimeApi
    },
    dispatchEvent(event) {
      events.push(event);
    }
  };
  context.globalThis = context;
  context.window = context;
  vm.createContext(context);
  vm.runInContext(code, context, { filename: 'luck-panel.js' });
  assert(context.AceMahjongLuckPanel, 'expected luck panel api');
  return {
    panel: context.AceMahjongLuckPanel,
    events,
    runtimeCalls,
    runtimeListeners,
    domNodes,
    stored,
    getStoredSetCount() {
      return storedSetCount;
    },
    setRuntimeMana(value) {
      runtimeMana = Math.max(0, Math.round(Number(value) || 0));
    },
    emitRuntimeEvent(event = { type: 'tile:discard' }) {
      runtimeListeners.forEach((listener) => listener(event));
    }
  };
}

function forceSummary(state) {
  return state.forceState.activeForces.map((force) => ({
    targetSeat: force.targetSeat,
    power: force.power
  }));
}

function assertJsonEqual(actual, expected, message) {
  assert.strictEqual(JSON.stringify(actual), JSON.stringify(expected), message);
}

function validateMultiCurseFocusBudget() {
  const { panel, events } = createPanelHarness();
  panel.setState({ systemMode: 'off' }, { layer: 'fortune' });
  panel.setState({ activeLayer: 'curse' });
  panel.setState({ selectedTargetSeat: 'top' }, { layer: 'curse' });
  panel.setState({ systemMode: 'on', intensity: 'light' }, { layer: 'curse' });
  panel.setState({ selectedTargetSeat: 'left' }, { layer: 'curse' });
  panel.setState({ systemMode: 'on', intensity: 'medium' }, { layer: 'curse' });

  const beforeReject = panel.getState();
  assert.strictEqual(beforeReject.focus.used, 3, `expected top light + left medium to use 3 focus, got ${JSON.stringify(beforeReject.focus)}`);
  assertJsonEqual(forceSummary(beforeReject), [
    { targetSeat: 'top', power: 60 },
    { targetSeat: 'left', power: 100 }
  ], `expected top light + left medium forces, got ${JSON.stringify(forceSummary(beforeReject))}`);

  panel.setState({ selectedTargetSeat: 'right' }, { layer: 'curse' });
  panel.setState({ systemMode: 'on', intensity: 'light' }, { layer: 'curse' });
  const afterReject = panel.getState();
  assert.strictEqual(afterReject.focus.used, 3, `expected rejected right curse to keep focus at 3, got ${JSON.stringify(afterReject.focus)}`);
  assertJsonEqual(forceSummary(afterReject), [
    { targetSeat: 'top', power: 60 },
    { targetSeat: 'left', power: 100 }
  ], `expected rejected right curse to preserve forces, got ${JSON.stringify(forceSummary(afterReject))}`);
  assert(events.some((event) => event.type === 'ace-mahjong:luck-panel-reject'), 'expected budget reject event');
  pass('luck-panel-focus multi-curse-budget');
}

function validateFortuneAndCurseShareBudget() {
  const { panel, events } = createPanelHarness();
  panel.setState({ systemMode: 'on', intensity: 'light' }, { layer: 'fortune' });
  panel.setState({ activeLayer: 'curse' });
  panel.setState({ selectedTargetSeat: 'left' }, { layer: 'curse' });
  panel.setState({ systemMode: 'on', intensity: 'medium' }, { layer: 'curse' });

  const beforeReject = panel.getState();
  assert.strictEqual(beforeReject.focus.used, 3, `expected fortune light + left medium to use 3 focus, got ${JSON.stringify(beforeReject.focus)}`);
  assert.strictEqual(beforeReject.focus.fortuneCost, 1, `expected fortune cost 1, got ${JSON.stringify(beforeReject.focus)}`);
  assertJsonEqual(forceSummary(beforeReject), [
    { targetSeat: 'bottom', power: 60 },
    { targetSeat: 'left', power: 100 }
  ], `expected fortune light + left medium curse, got ${JSON.stringify(forceSummary(beforeReject))}`);

  panel.setState({ selectedTargetSeat: 'right' }, { layer: 'curse' });
  panel.setState({ systemMode: 'on', intensity: 'light' }, { layer: 'curse' });
  const afterReject = panel.getState();
  assert.strictEqual(afterReject.focus.used, 3, `expected rejected right curse to keep focus at 3, got ${JSON.stringify(afterReject.focus)}`);
  assertJsonEqual(forceSummary(afterReject), [
    { targetSeat: 'bottom', power: 60 },
    { targetSeat: 'left', power: 100 }
  ], `expected rejected right curse to preserve fortune + left force, got ${JSON.stringify(forceSummary(afterReject))}`);
  assert(events.some((event) => event.type === 'ace-mahjong:luck-panel-reject'), 'expected budget reject event');
  pass('luck-panel-focus fortune-and-curse-budget');
}

function validateFortuneCreatesSelfForce() {
  const { panel, runtimeCalls } = createPanelHarness();
  panel.setState({ systemMode: 'on', mode: 'speed', intensity: 'medium' }, { layer: 'fortune' });

  const state = panel.getState();
  assert.strictEqual(state.focus.used, 2, `expected fortune medium to use 2 focus, got ${JSON.stringify(state.focus)}`);
  assert(state.forceState && Array.isArray(state.forceState.activeForces), `expected forceState activeForces, got ${JSON.stringify(state.forceState)}`);
  assertJsonEqual(forceSummary(state), [
    { targetSeat: 'bottom', power: 100 }
  ], `expected self fortune force, got ${JSON.stringify(forceSummary(state))}`);
  const force = state.forceState.activeForces[0];
  assert.strictEqual(force.kind, 'fortune', `expected fortune force kind, got ${JSON.stringify(force)}`);
  assert.strictEqual(force.sourceSeat, 'bottom', `expected self source, got ${JSON.stringify(force)}`);
  assert.strictEqual(force.targetSeat, 'bottom', `expected self target, got ${JSON.stringify(force)}`);
  const syncedForceCall = runtimeCalls.slice().reverse().find((call) => call.type === 'force');
  assert(syncedForceCall, `expected runtime force sync call, got ${JSON.stringify(runtimeCalls)}`);
  assertJsonEqual(forceSummary({ forceState: syncedForceCall.state }), [
    { targetSeat: 'bottom', power: 100 }
  ], `expected synced runtime self fortune force, got ${JSON.stringify(syncedForceCall)}`);
  pass('luck-panel-focus fortune-self-force');
}

function validateCommitRouteWindStateSync() {
  const { panel, runtimeCalls } = createPanelHarness();
  panel.setState({
    systemMode: 'on',
    mode: 'commit',
    intensity: 'medium',
    commitRouteId: 'suit-m'
  }, { layer: 'fortune' });

  const state = panel.getState();
  assert.strictEqual(state.fortune.commitRouteId, 'suit-m', `expected fortune commitRouteId, got ${JSON.stringify(state.fortune)}`);
  assert.strictEqual(state.windState.mode, 'commit', `expected wind mode commit, got ${JSON.stringify(state.windState)}`);
  assert.strictEqual(state.windState.commitRouteId, 'suit-m', `expected windState commit route, got ${JSON.stringify(state.windState)}`);

  const syncedWindCall = runtimeCalls.slice().reverse().find((call) => call.type === 'wind');
  assert(syncedWindCall, `expected runtime wind sync call, got ${JSON.stringify(runtimeCalls)}`);
  assert.strictEqual(syncedWindCall.state.mode, 'commit', `expected synced wind mode commit, got ${JSON.stringify(syncedWindCall)}`);
  assert.strictEqual(syncedWindCall.state.commitRouteId, 'suit-m', `expected synced commit route, got ${JSON.stringify(syncedWindCall)}`);
  assert.strictEqual(syncedWindCall.options.silent, true, `expected synced wind update to be silent, got ${JSON.stringify(syncedWindCall)}`);
  pass('luck-panel-focus commit-route-wind-sync');
}

function validateCommitRouteSyncThroughSessionWrapper() {
  const { panel, runtimeCalls } = createPanelHarness({ wrapRuntime: true });
  panel.setState({
    systemMode: 'on',
    mode: 'commit',
    intensity: 'medium',
    commitRouteId: 'shape-sequence'
  }, { layer: 'fortune' });

  const syncedWindCall = runtimeCalls.slice().reverse().find((call) => call.type === 'wind');
  assert(syncedWindCall, `expected wrapped runtime wind sync call, got ${JSON.stringify(runtimeCalls)}`);
  assert.strictEqual(syncedWindCall.state.mode, 'commit', `expected wrapped sync commit mode, got ${JSON.stringify(syncedWindCall)}`);
  assert.strictEqual(syncedWindCall.state.commitRouteId, 'shape-sequence', `expected wrapped sync route, got ${JSON.stringify(syncedWindCall)}`);
  pass('luck-panel-focus session-wrapper-commit-route-sync');
}

function validateCommitRouteRuntimeEchoDoesNotRecurse() {
  const { panel, runtimeCalls } = createPanelHarness({
    mountWithDom: true,
    emitRuntimeLuckUpdates: true,
    runtimeCallLimit: 8
  });
  panel.setState({
    systemMode: 'on',
    mode: 'commit',
    intensity: 'medium',
    commitRouteId: 'auto'
  }, { layer: 'fortune' });

  const windCalls = runtimeCalls.filter((call) => call.type === 'wind');
  const forceCalls = runtimeCalls.filter((call) => call.type === 'force');
  assert(windCalls.length >= 1, `expected at least one wind sync, got ${JSON.stringify(runtimeCalls)}`);
  assert(forceCalls.length >= 1, `expected at least one force sync, got ${JSON.stringify(runtimeCalls)}`);
  assert(windCalls.every((call) => call.options && call.options.silent === true), `expected wind syncs to be silent, got ${JSON.stringify(runtimeCalls)}`);
  assert(forceCalls.every((call) => call.options && call.options.silent === true), `expected force syncs to be silent, got ${JSON.stringify(runtimeCalls)}`);
  assert(runtimeCalls.length <= 4, `expected runtime echo not to recurse, got ${JSON.stringify(runtimeCalls)}`);
  assert.strictEqual(panel.getState().windState.mode, 'commit', 'expected panel to remain in commit mode after runtime echo');
  pass('luck-panel-focus commit-route-runtime-echo-no-recurse');
}

function validateOverBudgetStateClamps() {
  const { panel } = createPanelHarness();
  panel.setState({
    fortune: { systemMode: 'on', intensity: 'strong' },
    curse: {
      selectedTargetSeat: 'right',
      targets: {
        right: { systemMode: 'on', intensity: 'strong' }
      }
    }
  }, { allowOverBudget: true, reason: 'over-budget-fixture' });

  const state = panel.getState();
  assert.strictEqual(state.focus.used, 3, `expected clamped focus to stay at 3, got ${JSON.stringify(state.focus)}`);
  assert.strictEqual(state.fortune.systemMode, 'on', `expected fortune to be preserved, got ${JSON.stringify(state.fortune)}`);
  assert.strictEqual(state.curse.targets.right.systemMode, 'off', `expected over-budget curse to be disabled, got ${JSON.stringify(state.curse.targets.right)}`);
  assertJsonEqual(forceSummary(state), [
    { targetSeat: 'bottom', power: 140 }
  ], `expected clamped force to preserve strong fortune only, got ${JSON.stringify(forceSummary(state))}`);
  pass('luck-panel-focus over-budget-clamp');
}

function validateManaIgnoresStoredValueAndRefreshesFromRuntime() {
  const storageKey = 'acezero.majiang.luckPanelState';
  const { panel, domNodes, stored, setRuntimeMana, emitRuntimeEvent } = createPanelHarness({
    mountWithDom: true,
    runtimeMana: 1000,
    localStorage: {
      [storageKey]: JSON.stringify({
        activeLayer: 'fortune',
        fortune: { systemMode: 'auto', mode: 'speed', intensity: 'light' },
        curse: { selectedTargetSeat: 'top', targets: {} },
        mana: 65
      })
    }
  });

  const mountedState = panel.getState();
  assert.strictEqual(mountedState.mana, 1000, `expected stored mana 65 to be ignored in favor of runtime 1000, got ${JSON.stringify(mountedState)}`);
  assert.strictEqual(domNodes['#luck-mana-digit'].textContent, '1000', `expected mana digit 1000, got ${domNodes['#luck-mana-digit'].textContent}`);
  const persisted = JSON.parse(stored[storageKey]);
  assert(!Object.prototype.hasOwnProperty.call(persisted, 'mana'), `expected persisted luck panel state not to include mana, got ${JSON.stringify(persisted)}`);

  setRuntimeMana(997);
  emitRuntimeEvent({ type: 'tile:discard' });
  const refreshedState = panel.getState();
  assert.strictEqual(refreshedState.mana, 997, `expected runtime event to refresh mana 997, got ${JSON.stringify(refreshedState)}`);
  assert.strictEqual(domNodes['#luck-mana-digit'].textContent, '997', `expected mana digit 997, got ${domNodes['#luck-mana-digit'].textContent}`);
  pass('luck-panel-focus mana-runtime-sync');
}

function main() {
  validateMultiCurseFocusBudget();
  validateFortuneAndCurseShareBudget();
  validateFortuneCreatesSelfForce();
  validateCommitRouteWindStateSync();
  validateCommitRouteSyncThroughSessionWrapper();
  validateCommitRouteRuntimeEchoDoesNotRecurse();
  validateOverBudgetStateClamps();
  validateManaIgnoresStoredValueAndRefreshesFromRuntime();
}

main();
