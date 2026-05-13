(function () {
  'use strict';

  const ROOT = typeof window !== 'undefined' ? window : globalThis;
  const IDS = {
    style: 'ace0-dashboard-style',
    container: 'ace0-dashboard-container',
    trigger: 'ace0-dashboard-trigger',
    overlay: 'ace0-dashboard-overlay',
    wrapper: 'ace0-dashboard-wrapper',
    iframe: 'ace0-dashboard-iframe',
    close: 'ace0-dashboard-close'
  };

  const DEFAULT_DASHBOARD_ICON = {
    labelTop: 'A',
    labelBottom: 'Z',
    accent: '#d6b960',
    glow: 'rgba(212, 175, 55, 0.16)',
    ring: 'rgba(242, 211, 122, 0.78)',
    subLabel: 'DASH'
  };

  const DASHBOARD_FORCE_REFRESH_EVENT = 'ace0:dashboard-force-refresh';

  if (ROOT.ACE0DashboardLoader && ROOT.ACE0DashboardLoader.version) return;

  function resolveDashboardUrl() {
    if (typeof ROOT.ACE0_DASHBOARD_APP_URL === 'string' && ROOT.ACE0_DASHBOARD_APP_URL) {
      return ROOT.ACE0_DASHBOARD_APP_URL;
    }
    if (ROOT.STBridge?.utils?.resolveUrl) {
      return ROOT.STBridge.utils.resolveUrl('../../index.html?app=dashboard');
    }
    return 'https://hasheeper.github.io/ace-zero/index.html?app=dashboard';
  }

  function getAce0HostRoot() {
    try {
      if (window.parent && window.parent !== window) return window.parent;
    } catch (_) {}

    try {
      if (window.top && window.top !== window) return window.top;
    } catch (_) {}

    return window;
  }

  function addDashboardMessageListener(handler) {
    const attachedWindows = [];

    const attach = (targetWindow) => {
      if (!targetWindow || attachedWindows.includes(targetWindow)) return;
      try {
        targetWindow.addEventListener('message', handler);
        attachedWindows.push(targetWindow);
      } catch (_) {}
    };

    attach(window);
    attach(getAce0HostRoot());

    return () => {
      attachedWindows.forEach((targetWindow) => {
        try {
          targetWindow.removeEventListener('message', handler);
        } catch (_) {}
      });
    };
  }

  function removeDashboardMessageListener(handler) {
    [window, getAce0HostRoot()].forEach((targetWindow, index, list) => {
      if (!targetWindow || list.indexOf(targetWindow) !== index) return;
      try {
        targetWindow.removeEventListener('message', handler);
      } catch (_) {}
    });
  }

  function waitForJQuery(callback) {
    if (typeof jQuery !== 'undefined') {
      callback(jQuery);
      return;
    }
    setTimeout(() => waitForJQuery(callback), 100);
  }

  function getCurrentEraVars() {
    try {
      if (typeof getVariables !== 'function') return null;
      const vars = getVariables({ type: 'message' }) || {};
      return vars?.stat_data || vars || null;
    } catch (error) {
      console.warn('[ACE0 Dashboard] 读取 MVU 变量失败:', error);
      return null;
    }
  }

  function getCurrentDashboardFloorKey() {
    try {
      if (typeof getCurrentMessageId === 'function') {
        const id = Number(getCurrentMessageId());
        if (Number.isFinite(id) && id >= 0) return `message:${Math.round(id)}`;
      }
    } catch (_) {}
    try {
      if (typeof getChatMessages === 'function') {
        const latest = getChatMessages(-1)?.[0];
        const id = Number(latest?.message_id);
        if (Number.isFinite(id) && id >= 0) return `message:${Math.round(id)}`;
      }
    } catch (_) {}
    return '';
  }

  function normalizeDashboardString(value, fallback = '') {
    return typeof value === 'string' ? value.trim() : fallback;
  }

  function normalizePendingActAssetDeckCommands(actState) {
    const list = Array.isArray(actState?.pendingAssetDeckCommands) ? actState.pendingAssetDeckCommands : [];
    return list.filter((item) => item && typeof item === 'object' && !Array.isArray(item));
  }

  function isHeroMacroToken(value) {
    return value === '{{user}}' || value === '<user>';
  }

  function getCurrentUserDisplayName() {
    try {
      const ctx = typeof getContext === 'function' ? getContext() : null;
      const candidates = [
        ctx?.name1,
        ctx?.userName,
        ctx?.user_name,
        ctx?.chat_metadata?.user_name,
        window?.name1,
        window?.userName,
        window?.user_name,
        window?.chat_metadata?.user_name,
        window?.power_user?.persona?.name
      ];
      for (const candidate of candidates) {
        const normalized = normalizeDashboardString(candidate, '');
        if (normalized) return normalized;
      }
    } catch (error) {
      console.warn('[ACE0 Dashboard] 读取当前酒馆 user 名失败:', error);
    }
    return 'KAZU';
  }

  function resolveDashboardUserDisplayName(hero) {
    const aliasName = normalizeDashboardString(hero?.aliases?.KAZU, '');
    if (aliasName) {
      return isHeroMacroToken(aliasName)
        ? getCurrentUserDisplayName()
        : aliasName;
    }

    const explicit = normalizeDashboardString(hero?.heroDisplayName, '');
    if (explicit && !isHeroMacroToken(explicit)) return explicit;
    return 'KAZU';
  }

  function getExpansionRegistry() {
    const hostRoot = getAce0HostRoot();
    return hostRoot.ACE0ExpansionRegistry && typeof hostRoot.ACE0ExpansionRegistry === 'object'
      ? hostRoot.ACE0ExpansionRegistry
      : null;
  }

  function cloneJsonData(value, fallback) {
    if (value == null) return fallback;

    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_) {
      return fallback;
    }
  }

  function getActModuleApi() {
    const hostRoot = getAce0HostRoot();
    const candidates = [];
    const normalizeActModuleCandidate = (candidate) => {
      if (!candidate || typeof candidate !== 'object') return null;
      if (candidate.__ACE0_HOST_BRIDGE__ === true && candidate.__ACE0_TARGET__ && typeof candidate.__ACE0_TARGET__ === 'object') {
        return candidate.__ACE0_TARGET__;
      }
      return candidate;
    };

    if (hostRoot && typeof hostRoot === 'object') candidates.push(hostRoot);
    if (window && typeof window === 'object' && !candidates.includes(window)) candidates.push(window);
    if (typeof globalThis === 'object' && globalThis && !candidates.includes(globalThis)) candidates.push(globalThis);
    if (typeof unsafeWindow === 'object' && unsafeWindow && !candidates.includes(unsafeWindow)) candidates.push(unsafeWindow);

    for (const candidate of candidates) {
      try {
        const modules = candidate.ACE0Modules;
        const actModule = modules && typeof modules === 'object' ? normalizeActModuleCandidate(modules.act) : null;
        if (actModule && typeof actModule === 'object') {
          return actModule;
        }
      } catch (_) {}
    }

    const pluginCandidates = [];
    if (hostRoot && typeof hostRoot === 'object') pluginCandidates.push(hostRoot);
    if (window && typeof window === 'object' && !pluginCandidates.includes(window)) pluginCandidates.push(window);

    for (const candidate of pluginCandidates) {
      try {
        const plugin = candidate.ACE0Plugin;
        if (!plugin || typeof plugin !== 'object') continue;
        const hasActBridge = (
          typeof plugin.getDefaultActState === 'function'
          || typeof plugin.normalizeActState === 'function'
          || typeof plugin.createFrontendSnapshot === 'function'
        );
        if (hasActBridge) {
          return normalizeActModuleCandidate(plugin);
        }
      } catch (_) {}
    }

    return null;
  }

  function getAssetDeckModuleApi() {
    const hostRoot = getAce0HostRoot();
    const candidates = [];
    if (hostRoot && typeof hostRoot === 'object') candidates.push(hostRoot);
    if (window && typeof window === 'object' && !candidates.includes(window)) candidates.push(window);
    if (typeof globalThis === 'object' && globalThis && !candidates.includes(globalThis)) candidates.push(globalThis);
    if (typeof unsafeWindow === 'object' && unsafeWindow && !candidates.includes(unsafeWindow)) candidates.push(unsafeWindow);

    for (const candidate of candidates) {
      try {
        const assetDeck = candidate?.ACE0Modules?.assetDeck;
        if (assetDeck && typeof assetDeck.applyAssetDeckCommand === 'function') {
          return assetDeck;
        }
      } catch (_) {}
    }

    return null;
  }

  function buildCompactAssetDeckResolution(pending, command, commandResult, status) {
    const commandPayload = command && typeof command.payload === 'object' && !Array.isArray(command.payload)
      ? command.payload
      : {};
    const source = commandPayload.source && typeof commandPayload.source === 'object' && !Array.isArray(commandPayload.source)
      ? commandPayload.source
      : {};
    const out = {
      id: normalizeDashboardString(pending.id, ''),
      protocol: 'ace0.assetDeckCommand.v1',
      type: 'asset',
      level: Math.max(1, Math.min(3, Math.round(Number(pending.level) || Number(commandPayload.amount) || 1))),
      nodeId: normalizeDashboardString(pending.nodeId || source.nodeId, ''),
      nodeIndex: Math.max(0, Math.round(Number(pending.nodeIndex ?? source.nodeIndex) || 0)),
      phaseIndex: Math.max(0, Math.round(Number(pending.phaseIndex ?? source.phaseIndex) || 0)),
      status,
      outcome: commandResult?.code || (commandResult?.ok ? 'asset_command_applied' : 'asset_command_failed'),
      commandKind: normalizeDashboardString(command.kind || command.type, '')
    };
    if (commandResult?.error) out.error = normalizeDashboardString(commandResult.error, '');
    if (commandPayload.pool) out.pool = normalizeDashboardString(commandPayload.pool, '');
    return out;
  }

  function compactActResolutionHistoryItem(item) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    if (item.protocol === 'ace0.assetOfferClear.v1' || item.type === 'asset_offer_clear') {
      const clearKey = normalizeDashboardString(item.clearKey || item.offerId, '');
      if (!clearKey) return null;
      return {
        id: normalizeDashboardString(item.id, `asset-offer-clear:${clearKey}`),
        protocol: 'ace0.assetOfferClear.v1',
        type: 'asset_offer_clear',
        status: normalizeDashboardString(item.status, 'resolved') || 'resolved',
        clearKey,
        offerId: normalizeDashboardString(item.offerId, clearKey),
        outcome: normalizeDashboardString(item.outcome, '')
      };
    }
    const type = normalizeDashboardString(item.type, '');
    if (type !== 'asset' && type !== 'combat') return null;
    const payload = item.payload && typeof item.payload === 'object' && !Array.isArray(item.payload) ? item.payload : {};
    const compact = {
      id: normalizeDashboardString(item.id, ''),
      protocol: normalizeDashboardString(item.protocol, type === 'asset' ? 'ace0.assetDeckCommand.v1' : ''),
      type,
      level: Math.max(1, Math.min(3, Math.round(Number(item.level) || 1))),
      nodeId: normalizeDashboardString(item.nodeId, ''),
      nodeIndex: Math.max(0, Math.round(Number(item.nodeIndex) || 0)),
      phaseIndex: Math.max(0, Math.round(Number(item.phaseIndex) || 0)),
      status: normalizeDashboardString(item.status, 'resolved') || 'resolved',
      outcome: normalizeDashboardString(item.outcome, '')
    };
    const commandKind = normalizeDashboardString(item.commandKind || payload.commandKind, '');
    if (commandKind) compact.commandKind = commandKind;
    if (item.pool) compact.pool = normalizeDashboardString(item.pool, '');
    if (item.error || payload.error) compact.error = normalizeDashboardString(item.error || payload.error, '');
    return compact.id ? compact : null;
  }

  function applyPendingActAssetDeckCommands(nextState, nextActState) {
    const pendingCommands = normalizePendingActAssetDeckCommands(nextActState);
    const commandsToApply = pendingCommands.filter((item) => {
      const status = (normalizeDashboardString(item.status, 'pending') || 'pending').toLowerCase();
      return status === 'pending' && item.command && typeof item.command === 'object' && !Array.isArray(item.command);
    });
    if (!commandsToApply.length) return nextActState;

    const assetDeckModule = getAssetDeckModuleApi();
    if (!assetDeckModule || typeof assetDeckModule.applyAssetDeckCommand !== 'function') {
      throw new Error('AssetDeck runtime is not loaded in host; cannot settle ACT asset commands.');
    }

    let currentAssetDeck = typeof assetDeckModule.normalizeAssetDeckState === 'function'
      ? assetDeckModule.normalizeAssetDeckState(nextState.world.assetDeck)
      : (nextState.world.assetDeck || {});
    const reserveSource = nextActState.reserve && typeof nextActState.reserve === 'object' && !Array.isArray(nextActState.reserve)
      ? nextActState.reserve
      : {};
    let currentAssetPoints = Math.max(0, Math.round(Number(reserveSource.asset) || 0));
    const consumedIds = new Set();
    const resolutionHistory = Array.isArray(nextActState.resolutionHistory)
      ? nextActState.resolutionHistory.map(compactActResolutionHistoryItem).filter(Boolean).slice(-64)
      : [];

    commandsToApply.forEach((pending) => {
      const command = cloneJsonData(pending.command, {}) || {};
      const payload = command.payload && typeof command.payload === 'object' && !Array.isArray(command.payload)
        ? cloneJsonData(command.payload, {})
        : {};
      command.payload = {
        ...payload,
        requestId: normalizeDashboardString(payload.requestId || pending.id, '')
      };
      if (!command.payload.source && pending.nodeId) {
        command.payload.source = {
          type: 'act_asset_token',
          actId: normalizeDashboardString(nextActState.id, ''),
          nodeId: pending.nodeId,
          nodeIndex: pending.nodeIndex,
          phaseIndex: pending.phaseIndex,
          level: pending.level,
          sources: Array.isArray(pending.sources) ? cloneJsonData(pending.sources, []) : []
        };
      }

      let commandResult;
      try {
        commandResult = assetDeckModule.applyAssetDeckCommand(currentAssetDeck, command, {
          seed: `act:${pending.id || Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
          assetPoints: currentAssetPoints
        });
      } catch (error) {
        commandResult = { ok: false, code: 'asset_command_error', error: error?.message || String(error) };
      }

      const status = commandResult?.ok ? 'resolved' : 'failed';
      if (commandResult?.assetDeck) currentAssetDeck = cloneJsonData(commandResult.assetDeck, currentAssetDeck);
      if (Number.isFinite(Number(commandResult?.assetPoints))) {
        currentAssetPoints = Math.max(0, Math.round(Number(commandResult.assetPoints) || 0));
      }
      resolutionHistory.push(buildCompactAssetDeckResolution(pending, command, commandResult, status));
      consumedIds.add(pending.id);
    });

    nextState.world.assetDeck = cloneJsonData(currentAssetDeck, currentAssetDeck);
    nextActState.reserve = {
      combat: Math.max(0, Number(reserveSource.combat) || 0),
      rest: Math.max(0, Number(reserveSource.rest) || 0),
      asset: currentAssetPoints,
      vision: Math.max(0, Number(reserveSource.vision) || 0)
    };
    nextActState.pendingAssetDeckCommands = pendingCommands.filter((item) => !consumedIds.has(item.id));
    nextActState.resolutionHistory = resolutionHistory.slice(-64);
    return nextActState;
  }

  function resolveDashboardActState(eraVars) {
    const actModule = getActModuleApi();
    const rawActState = eraVars?.world?.act;

    if (actModule && typeof actModule.normalizeActState === 'function') {
      try {
        if (rawActState && typeof rawActState === 'object') {
          return cloneJsonData(actModule.normalizeActState(rawActState), null);
        }
        if (typeof actModule.getDefaultActState === 'function') {
          return cloneJsonData(actModule.getDefaultActState(), null);
        }
      } catch (error) {
        console.warn('[ACE0 Dashboard] resolveDashboardActState failed:', error);
      }
    }

    return rawActState && typeof rawActState === 'object'
      ? cloneJsonData(rawActState, null)
      : null;
  }

  function buildFrontendSnapshot(eraVars, resolvedActState) {
    const actModule = getActModuleApi();
    const actState = resolvedActState && typeof resolvedActState === 'object'
      ? resolvedActState
      : resolveDashboardActState(eraVars);
    if (!actModule || typeof actModule.createFrontendSnapshot !== 'function' || !actState || typeof actState !== 'object') {
      return null;
    }

    try {
      return cloneJsonData(actModule.createFrontendSnapshot({ actState }), null);
    } catch (error) {
      console.warn('[ACE0 Dashboard] createFrontendSnapshot failed:', error);
      return null;
    }
  }

  function deriveHeroCastFromAct(heroInput, actState) {
    const actModule = getActModuleApi();
    if (!actModule || !actState || typeof actState !== 'object') return {};
    if (typeof actModule.getChapter !== 'function') return {};
    if (typeof actModule.deriveCharacterStatesFromActState !== 'function') return {};
    if (typeof actModule.createCharacterCastPatch !== 'function') return {};

    try {
      const chapter = actModule.getChapter(actState.id);
      const derivedState = actModule.deriveCharacterStatesFromActState(actState, chapter);
      const patchResult = actModule.createCharacterCastPatch(heroInput?.cast, derivedState);
      return patchResult && typeof patchResult.castPatch === 'object'
        ? cloneJsonData(patchResult.castPatch, {})
        : {};
    } catch (error) {
      console.warn('[ACE0 Dashboard] deriveHeroCastFromAct failed:', error);
      return {};
    }
  }

  function buildDashboardPayload(eraVars) {
    const hero = eraVars?.hero;
    const world = eraVars?.world;
    if (!hero || typeof hero !== 'object') return null;

    const clonedHero = cloneJsonData(hero, null);
    if (!clonedHero) return null;
    const clonedWorld = cloneJsonData(world, {});
    const actState = resolveDashboardActState(eraVars);

    if (actState && typeof actState === 'object') {
      clonedWorld.act = cloneJsonData(actState, actState);
    }

    clonedHero.heroDisplayName = resolveDashboardUserDisplayName(hero);
    const derivedCastPatch = deriveHeroCastFromAct(clonedHero, actState);
    if (Object.keys(derivedCastPatch).length > 0) {
      clonedHero.cast = {
        ...(clonedHero.cast && typeof clonedHero.cast === 'object' ? clonedHero.cast : {}),
        ...derivedCastPatch
      };
    }

    const registry = getExpansionRegistry();
    const dashboardState = registry && typeof registry.collectDashboardState === 'function'
      ? registry.collectDashboardState({ eraVars })
      : { tabs: [], icon: null };
    const frontendSnapshot = buildFrontendSnapshot(eraVars, actState);

    return {
      hero: clonedHero,
      world: clonedWorld,
      frontendSnapshot,
      meta: {
        ...(eraVars?.meta && typeof eraVars.meta === 'object' ? cloneJsonData(eraVars.meta, {}) : {}),
        floorKey: getCurrentDashboardFloorKey()
      },
      extensions: {
        tabs: cloneJsonData(dashboardState.tabs, []),
        icon: cloneJsonData(dashboardState.icon, null)
      }
    };
  }

  async function persistDashboardActState(commitPayload) {
    if (!commitPayload || typeof commitPayload !== 'object') return false;

    const eraVars = getCurrentEraVars();
    if (!eraVars || typeof eraVars !== 'object') return false;
    const currentFloorKey = getCurrentDashboardFloorKey();
    const commitFloorKey = normalizeDashboardString(commitPayload?.meta?.floorKey, '');
    if (currentFloorKey && commitFloorKey !== currentFloorKey) {
      throw new Error('Stale ACT commit rejected: floorKey mismatch.');
    }

    const nextState = cloneJsonData(eraVars, {}) || {};
    if (!nextState.world || typeof nextState.world !== 'object') nextState.world = {};

    const worldPatch = commitPayload.world && typeof commitPayload.world === 'object'
      ? cloneJsonData(commitPayload.world, {})
      : {};
    Object.entries(worldPatch).forEach(([key, value]) => {
      if (key === 'act') return;
      nextState.world[key] = value;
    });

    let nextActState = cloneJsonData(worldPatch.act || commitPayload.act, null);
    if (!nextActState || typeof nextActState !== 'object') return false;

    nextActState = applyPendingActAssetDeckCommands(nextState, nextActState);
    nextState.world.act = nextActState;
    if (typeof insertOrAssignVariables === 'function') {
      await insertOrAssignVariables({ stat_data: nextState }, { type: 'message' });
      return true;
    }
    if (ROOT.STBridge?.mvu?.writeVariables) {
      await ROOT.STBridge.mvu.writeVariables({ stat_data: nextState }, { type: 'message' });
      return true;
    }
    console.warn('[ACE0 Dashboard] insertOrAssignVariables 不可用，无法回写 MVU');
    return false;
  }

  async function commitDashboardActState(commitPayload) {
    const requestId = typeof commitPayload?.requestId === 'string' ? commitPayload.requestId : '';
    try {
      const didPersist = await persistDashboardActState(commitPayload);
      if (didPersist) {
        return {
          ok: true,
          requestId
        };
      }
      return {
        ok: false,
        requestId,
        error: 'Persist returned false. MVU state was not updated.'
      };
    } catch (error) {
      return {
        ok: false,
        requestId,
        error: error?.message || String(error)
      };
    }
  }

  async function persistDashboardAssetDeckCommand(commandPayload) {
    const requestId = typeof commandPayload?.requestId === 'string' ? commandPayload.requestId : '';
    const assetDeckModule = getAssetDeckModuleApi();
    if (!assetDeckModule || typeof assetDeckModule.applyAssetDeckCommand !== 'function') {
      return {
        ok: false,
        requestId,
        error: 'AssetDeck runtime is not loaded in host.'
      };
    }

    const command = commandPayload?.command && typeof commandPayload.command === 'object'
      ? commandPayload.command
      : (commandPayload && typeof commandPayload === 'object' ? commandPayload : {});
    const eraVars = getCurrentEraVars();
    if (!eraVars || typeof eraVars !== 'object') {
      return {
        ok: false,
        requestId,
        error: 'MVU state is unavailable.'
      };
    }

    const nextState = cloneJsonData(eraVars, {}) || {};
    if (!nextState.world || typeof nextState.world !== 'object') nextState.world = {};
    const currentAssetDeck = typeof assetDeckModule.normalizeAssetDeckState === 'function'
      ? assetDeckModule.normalizeAssetDeckState(nextState.world.assetDeck)
      : (nextState.world.assetDeck || {});
    const actState = nextState.world.act && typeof nextState.world.act === 'object' && !Array.isArray(nextState.world.act)
      ? nextState.world.act
      : {};
    const reserveSource = actState.reserve && typeof actState.reserve === 'object' && !Array.isArray(actState.reserve)
      ? actState.reserve
      : {};
    const assetPoints = Math.max(0, Math.round(Number(reserveSource.asset) || 0));

    let commandResult;
    try {
      commandResult = assetDeckModule.applyAssetDeckCommand(currentAssetDeck, command, {
        seed: `host:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
        assetPoints
      });
    } catch (error) {
      return {
        ok: false,
        requestId,
        error: error?.message || String(error)
      };
    }

    if (!commandResult?.ok) {
      return {
        ok: false,
        requestId,
        code: commandResult?.code || 'asset_command_rejected',
        error: commandResult?.code || 'AssetDeck command rejected.',
        assetDeck: cloneJsonData(commandResult?.assetDeck, null)
      };
    }

    nextState.world.assetDeck = cloneJsonData(commandResult.assetDeck, commandResult.assetDeck);
    if (Number.isFinite(Number(commandResult.assetPoints))) {
      nextState.world.act = {
        ...actState,
        reserve: {
          combat: Math.max(0, Number(reserveSource.combat) || 0),
          rest: Math.max(0, Number(reserveSource.rest) || 0),
          asset: Math.max(0, Math.round(Number(commandResult.assetPoints) || 0)),
          vision: Math.max(0, Number(reserveSource.vision) || 0)
        }
      };
    }
    let didPersist = false;
    if (typeof insertOrAssignVariables === 'function') {
      await insertOrAssignVariables({ stat_data: nextState }, { type: 'message' });
      didPersist = true;
    } else if (ROOT.STBridge?.mvu?.writeVariables) {
      await ROOT.STBridge.mvu.writeVariables({ stat_data: nextState }, { type: 'message' });
      didPersist = true;
    }

    if (!didPersist) {
      console.warn('[ACE0 Dashboard] insertOrAssignVariables 不可用，无法回写 AssetDeck');
      return {
        ok: false,
        requestId,
        code: 'persist_unavailable',
        error: 'Persist bridge is unavailable. MVU state was not updated.',
        assetDeck: cloneJsonData(commandResult.assetDeck, null)
      };
    }

    return {
      ok: true,
      requestId,
      code: commandResult.code || 'asset_command_applied',
      assetDeck: cloneJsonData(commandResult.assetDeck, null)
    };
  }

  function attachDashboardCommitBridge(targetWindow, commitBridge = commitDashboardActState) {
    if (!targetWindow) return;
    try {
      targetWindow.ACE0DashboardCommitActState = commitBridge;
    } catch (_) {}
  }

  function attachDashboardAssetDeckCommandBridge(targetWindow, commandBridge = persistDashboardAssetDeckCommand) {
    if (!targetWindow) return;
    try {
      targetWindow.ACE0DashboardApplyAssetDeckCommand = commandBridge;
    } catch (_) {}
  }

  let activeIframe = null;

  function postDashboardCommitResult(resultPayload) {
    const targetWindow = activeIframe?.contentWindow;
    if (!targetWindow) return;
    targetWindow.postMessage({
      type: 'ACE0_DASHBOARD_ACT_COMMIT_RESULT',
      payload: resultPayload
    }, '*');
  }

  function postDashboardAssetDeckCommandResult(resultPayload) {
    const targetWindow = activeIframe?.contentWindow;
    if (!targetWindow) return;
    targetWindow.postMessage({
      type: 'ACE0_DASHBOARD_ASSET_DECK_COMMAND_RESULT',
      payload: resultPayload
    }, '*');
  }

  if (ROOT.__ACE0_DASHBOARD_LOADER_TEST_HOOKS__ === true) {
    ROOT.ACE0DashboardLoaderTestHooks = {
      applyPendingActAssetDeckCommands,
      normalizePendingActAssetDeckCommands
    };
    return;
  }

  function normalizeIconConfig(icon) {
    return {
      ...DEFAULT_DASHBOARD_ICON,
      ...(icon && typeof icon === 'object' ? icon : {})
    };
  }

  function renderDashboardTriggerIcon(icon) {
    const config = normalizeIconConfig(icon);
    const labelTop = normalizeDashboardString(config.labelTop, DEFAULT_DASHBOARD_ICON.labelTop).slice(0, 2).toUpperCase();
    const labelBottom = normalizeDashboardString(config.labelBottom, DEFAULT_DASHBOARD_ICON.labelBottom).slice(0, 3).toUpperCase();
    const subLabel = normalizeDashboardString(config.subLabel, DEFAULT_DASHBOARD_ICON.subLabel).slice(0, 6).toUpperCase();

    return `
      <span style="position:absolute;inset:-10px;border-radius:28px;background:radial-gradient(circle, ${config.glow} 0%, rgba(212,175,55,0) 72%);filter:blur(10px);pointer-events:none;"></span>
      <span style="position:absolute;inset:7px;border-radius:18px;border:1px solid rgba(214,185,96,0.16);box-shadow:inset 0 0 0 1px rgba(255,255,255,0.02);"></span>
      <span style="position:relative;z-index:2;display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1;transform:translateY(1px);">
        <span style="display:flex;align-items:center;justify-content:center;gap:4px;font-family:'Cinzel',serif;font-weight:900;letter-spacing:-0.04em;">
          <span style="font-size:24px;background:linear-gradient(180deg,#fff1b0 0%,${config.accent} 24%,#c89c3d 58%,#775114 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">${labelTop}</span>
          <span style="position:relative;width:12px;height:12px;border-radius:50%;border:1px solid ${config.ring};box-shadow:0 0 0 1px rgba(10,13,18,0.86), inset 0 0 0 1px rgba(255,255,255,0.04);background:radial-gradient(circle, rgba(12,16,22,1) 28%, rgba(26,18,6,1) 100%);">
            <span style="position:absolute;top:50%;left:50%;width:4px;height:4px;background:linear-gradient(180deg,#fff1b0 0%,${config.accent} 24%,#c89c3d 58%,#775114 100%);transform:translate(-50%,-50%) rotate(45deg);"></span>
          </span>
          <span style="font-size:28px;background:linear-gradient(180deg,#fff1b0 0%,${config.accent} 24%,#c89c3d 58%,#775114 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">${labelBottom}</span>
        </span>
        <span style="margin-top:3px;font-family:'JetBrains Mono',monospace;font-size:8px;letter-spacing:2px;color:rgba(255,236,179,0.62);">${subLabel}</span>
      </span>
    `;
  }

  waitForJQuery(function ($) {
    console.log('[ACE0 Dashboard] 悬浮窗注入启动');

    if (Array.isArray(window.__ACE0_DASHBOARD_CLEANUPS__)) {
      window.__ACE0_DASHBOARD_CLEANUPS__.forEach((cleanup) => {
        try { cleanup(); } catch (_) {}
      });
    }
    const cleanups = [];
    window.__ACE0_DASHBOARD_CLEANUPS__ = cleanups;

    function unmountDashboard() {
      cleanups.forEach((cleanup) => {
        try { cleanup(); } catch (_) {}
      });
      $('#' + IDS.container).remove();
      $('#' + IDS.overlay).remove();
      $('#' + IDS.style).remove();
      $(document).off('.ace0Dashboard');
      if (window.__ACE0_DASHBOARD_MESSAGE_HANDLER__) {
        removeDashboardMessageListener(window.__ACE0_DASHBOARD_MESSAGE_HANDLER__);
        window.__ACE0_DASHBOARD_MESSAGE_HANDLER__ = null;
      }
      window.__ACE0_DASHBOARD_CLEANUPS__ = [];
      activeIframe = null;
      if (window.ACE0Dashboard && window.ACE0Dashboard.unmount === unmountDashboard) {
        delete window.ACE0Dashboard;
      }
      if (window.ACE0DashboardLoader && window.ACE0DashboardLoader.unmount === unmountDashboard) {
        delete window.ACE0DashboardLoader;
      }
    }

    if (window.__ACE0_DASHBOARD_MESSAGE_HANDLER__) {
      removeDashboardMessageListener(window.__ACE0_DASHBOARD_MESSAGE_HANDLER__);
    }

    $('#' + IDS.container).remove();
    $('#' + IDS.overlay).remove();
    $('#' + IDS.style).remove();
    $(document).off('.ace0Dashboard');

    $('head').append(`
      <style id="${IDS.style}">
        @keyframes ace0DashboardFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-5px); }
        }

        @keyframes ace0DashboardPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(186, 153, 67, 0.34); }
          50% { box-shadow: 0 0 0 14px rgba(186, 153, 67, 0); }
        }
      </style>
    `);

    const container = $('<div>')
      .attr('id', IDS.container)
      .css({
        position: 'fixed',
        top: '80px',
        right: '20px',
        zIndex: '2147483645'
      });

    const trigger = $('<button>')
      .attr({ id: IDS.trigger, type: 'button', title: 'Open AceZero Dashboard', 'aria-label': 'Open AceZero Dashboard' })
      .css({
        width: '72px',
        height: '72px',
        border: '1px solid rgba(214, 185, 96, 0.26)',
        borderRadius: '22px',
        background: 'linear-gradient(180deg, rgba(13, 17, 23, 0.98) 0%, rgba(7, 9, 13, 1) 100%)',
        color: '#111',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 12px 32px rgba(0,0,0,0.46), inset 0 1px 0 rgba(255,255,255,0.04)',
        animation: 'ace0DashboardFloat 3.2s ease-in-out infinite, ace0DashboardPulse 3.1s ease-in-out infinite',
        transition: 'transform 0.22s ease, box-shadow 0.22s ease, border-color 0.22s ease, background 0.22s ease',
        padding: '0',
        position: 'relative',
        overflow: 'hidden'
      })
      .html(renderDashboardTriggerIcon(null))
      .on('mouseenter', function () {
        $(this).css({ transform: 'scale(1.08)', boxShadow: '0 16px 38px rgba(0,0,0,0.56), inset 0 1px 0 rgba(255,255,255,0.05)', borderColor: 'rgba(242, 211, 122, 0.42)' });
      })
      .on('mouseleave', function () {
        $(this).css({ transform: 'scale(1)', boxShadow: '0 12px 32px rgba(0,0,0,0.46), inset 0 1px 0 rgba(255,255,255,0.04)', borderColor: 'rgba(214, 185, 96, 0.26)' });
      });

    const overlay = $('<div>')
      .attr('id', IDS.overlay)
      .css({
        position: 'fixed',
        inset: '0',
        width: '100vw',
        height: '100vh',
        background: 'rgba(5, 8, 12, 0.56)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'none',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        zIndex: '2147483646',
        overflow: 'hidden'
      });

    const wrapper = $('<div>')
      .attr('id', IDS.wrapper)
      .css({
        position: 'relative',
        width: 'min(94vw, 1520px)',
        height: 'min(92vh, 980px)',
        minHeight: '680px',
        pointerEvents: 'auto'
      });

    const iframe = $('<iframe>')
      .attr({
        id: IDS.iframe,
        title: 'AceZero Dashboard',
        allow: 'autoplay; fullscreen'
      })
      .css({
        width: '100%',
        height: '100%',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '24px',
        background: '#0b0c10',
        boxShadow: '0 28px 70px rgba(0,0,0,0.48)',
        overflow: 'hidden'
      });

    activeIframe = iframe[0];

    const closeBtn = $('<button>')
      .attr({ id: IDS.close, type: 'button', 'aria-label': 'Close AceZero Dashboard' })
      .css({
        position: 'absolute',
        top: '-12px',
        right: '-12px',
        width: '42px',
        height: '42px',
        borderRadius: '999px',
        border: '1px solid rgba(255,255,255,0.12)',
        background: 'rgba(15, 18, 24, 0.72)',
        color: '#f5f5f5',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: '2',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        transition: 'transform 0.2s ease, background 0.2s ease'
      })
      .html(`
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      `)
      .on('mouseenter', function () {
        $(this).css({ transform: 'scale(1.08)', background: 'rgba(193, 66, 66, 0.88)' });
      })
      .on('mouseleave', function () {
        $(this).css({ transform: 'scale(1)', background: 'rgba(15, 18, 24, 0.72)' });
      });

    wrapper.append(iframe, closeBtn);
    container.append(trigger);
    overlay.append(wrapper);
    $('body').append(container, overlay);

    let iframeInitialized = false;
    let pendingHero = null;
    let iconSyncTimer = null;

    function refreshTriggerIcon() {
      const eraVars = getCurrentEraVars();
      const payload = buildDashboardPayload(eraVars);
      trigger.html(renderDashboardTriggerIcon(payload?.extensions?.icon || null));
    }

    function forceRefreshDashboardUi() {
      refreshTriggerIcon();
      if (!iframeInitialized) return;
      postDashboardData('ACE0_DASHBOARD_REFRESH');
    }

    function postDashboardData(type) {
      const eraVars = getCurrentEraVars();
      const payload = buildDashboardPayload(eraVars);
      if (!payload) return;
      pendingHero = payload.hero;
      refreshTriggerIcon();

      const targetWindow = iframe[0]?.contentWindow;
      if (!targetWindow) return;
      attachDashboardCommitBridge(targetWindow, commitDashboardActStateAndRefresh);
      attachDashboardAssetDeckCommandBridge(targetWindow, applyDashboardAssetDeckCommandAndRefresh);

      targetWindow.postMessage({
        type: type || 'ACE0_DASHBOARD_REFRESH',
        payload
      }, '*');
    }

    async function commitDashboardActStateAndRefresh(commitPayload) {
      const result = await commitDashboardActState(commitPayload);
      if (result?.ok) {
        postDashboardData('ACE0_DASHBOARD_REFRESH');
      }
      return result;
    }

    async function applyDashboardAssetDeckCommandAndRefresh(commandPayload) {
      const result = await persistDashboardAssetDeckCommand(commandPayload);
      if (result?.ok) {
        postDashboardData('ACE0_DASHBOARD_REFRESH');
      }
      return result;
    }

    function initializeIframe() {
      if (iframeInitialized) return;
      iframeInitialized = true;
      iframe.attr('src', resolveDashboardUrl());
    }

    function openOverlay() {
      overlay.css('display', 'flex');
      initializeIframe();
      setTimeout(() => postDashboardData('ACE0_DASHBOARD_INIT'), 60);
    }

    function closeOverlay() {
      overlay.css('display', 'none');
    }

    trigger.on('click', openOverlay);
    closeBtn.on('click', closeOverlay);
    overlay.on('click', function (event) {
      if (event.target === overlay[0]) closeOverlay();
    });

    $(document).on('keydown.ace0Dashboard', function (event) {
      if (event.key === 'Escape' && overlay.css('display') !== 'none') {
        closeOverlay();
      }
    });

    iframe.on('load', function () {
      setTimeout(() => postDashboardData('ACE0_DASHBOARD_INIT'), 80);
    });

    let refreshTimer = null;
    function refreshDashboard() {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        refreshTriggerIcon();
        if (!iframeInitialized) return;
        postDashboardData('ACE0_DASHBOARD_REFRESH');
        refreshTimer = null;
      }, 120);
    }

    if (typeof eventOn === 'function') {
      const stopEraWrite = eventOn('era:writeDone', refreshDashboard);
      const stopGenerationEnded = eventOn('generation_ended', refreshDashboard);
      const stopMessageEdited = eventOn('message_edited', refreshDashboard);
      const stopMessageSwiped = eventOn('message_swiped', refreshDashboard);
      const stopChatChanged = eventOn('chat_changed', () => {
        console.log('[ACE0 Dashboard] 检测到对话/角色切换，卸载悬浮窗');
        unmountDashboard();
      });

      [stopEraWrite, stopGenerationEnded, stopMessageEdited, stopMessageSwiped, stopChatChanged]
        .filter((stop) => typeof stop === 'function')
        .forEach((stop) => cleanups.push(stop));
    }

    const messageHandler = async function (event) {
      const payload = event?.data;
      if (!payload || typeof payload !== 'object') return;

      if (payload.type === 'ACE0_DASHBOARD_DEBUG') {
        if (window.ACE0_OVERVIEW_BOOT_MODE === 'debug') {
          console.log('[ACE0 Dashboard debug]', payload.stage, payload.extra || {});
        }
        return;
      }

      if (payload.type === 'ACE0_DASHBOARD_ACT_COMMIT' || payload.type === 'ACE0_ACT_COMMIT') {
        const commitPayload = payload.payload || payload.data || payload;
        const result = await commitDashboardActState(commitPayload);
        if (!result.ok) {
          console.warn('[ACE0 Dashboard] 回写 act 状态失败:', result.error);
        }
        postDashboardCommitResult(result);
        if (result.ok) {
          postDashboardData('ACE0_DASHBOARD_REFRESH');
        }
        return;
      }

      if (payload.type === 'ACE0_DASHBOARD_ASSET_DECK_COMMAND' || payload.type === 'ACE0_ASSET_DECK_COMMAND') {
        const commandPayload = payload.payload || payload.data || payload;
        const result = await persistDashboardAssetDeckCommand(commandPayload);
        if (!result.ok) {
          console.warn('[ACE0 Dashboard] 执行 AssetDeck command 失败:', result.error || result.code);
        }
        postDashboardAssetDeckCommandResult(result);
        if (result.ok) {
          postDashboardData('ACE0_DASHBOARD_REFRESH');
        }
        return;
      }

      if (payload.type === 'ACE0_DASHBOARD_READY' || payload.type === 'ACE0_DASHBOARD_REQUEST_DATA') {
        postDashboardData('ACE0_DASHBOARD_INIT');
      }
    };

    window.__ACE0_DASHBOARD_MESSAGE_HANDLER__ = messageHandler;
    const removeDashboardMessageListener = addDashboardMessageListener(messageHandler);
    window.removeEventListener('pagehide', unmountDashboard);
    window.addEventListener('pagehide', unmountDashboard);
    cleanups.push(removeDashboardMessageListener);
    cleanups.push(() => window.removeEventListener('pagehide', unmountDashboard));
    cleanups.push(() => $(document).off('.ace0Dashboard'));

    const hostRoot = getAce0HostRoot();
    attachDashboardCommitBridge(window, commitDashboardActStateAndRefresh);
    attachDashboardCommitBridge(hostRoot, commitDashboardActStateAndRefresh);
    attachDashboardAssetDeckCommandBridge(window, applyDashboardAssetDeckCommandAndRefresh);
    attachDashboardAssetDeckCommandBridge(hostRoot, applyDashboardAssetDeckCommandAndRefresh);
    hostRoot.__ACE0_DASHBOARD_FORCE_REFRESH__ = forceRefreshDashboardUi;
    cleanups.push(() => {
      try {
        if (window.ACE0DashboardCommitActState === commitDashboardActStateAndRefresh) {
          delete window.ACE0DashboardCommitActState;
        }
      } catch (_) {}
      try {
        if (hostRoot.ACE0DashboardCommitActState === commitDashboardActStateAndRefresh) {
          delete hostRoot.ACE0DashboardCommitActState;
        }
      } catch (_) {}
      try {
        if (window.ACE0DashboardApplyAssetDeckCommand === applyDashboardAssetDeckCommandAndRefresh) {
          delete window.ACE0DashboardApplyAssetDeckCommand;
        }
      } catch (_) {}
      try {
        if (hostRoot.ACE0DashboardApplyAssetDeckCommand === applyDashboardAssetDeckCommandAndRefresh) {
          delete hostRoot.ACE0DashboardApplyAssetDeckCommand;
        }
      } catch (_) {}
      if (hostRoot.__ACE0_DASHBOARD_FORCE_REFRESH__ === forceRefreshDashboardUi) {
        delete hostRoot.__ACE0_DASHBOARD_FORCE_REFRESH__;
      }
    });

    if (typeof hostRoot.addEventListener === 'function') {
      hostRoot.addEventListener(DASHBOARD_FORCE_REFRESH_EVENT, forceRefreshDashboardUi);
      cleanups.push(() => hostRoot.removeEventListener(DASHBOARD_FORCE_REFRESH_EVENT, forceRefreshDashboardUi));
    }

    iconSyncTimer = window.setInterval(() => {
      refreshTriggerIcon();
    }, 600);
    cleanups.push(() => {
      if (iconSyncTimer) {
        window.clearInterval(iconSyncTimer);
        iconSyncTimer = null;
      }
    });

    refreshTriggerIcon();

    window.ACE0Dashboard = {
      open: openOverlay,
      close: closeOverlay,
      refresh: () => postDashboardData('ACE0_DASHBOARD_REFRESH'),
      unmount: unmountDashboard,
      applyAssetDeckCommand: applyDashboardAssetDeckCommandAndRefresh
    };

    window.ACE0DashboardLoader = {
      version: '0.2.0',
      open: openOverlay,
      close: closeOverlay,
      refresh: () => postDashboardData('ACE0_DASHBOARD_REFRESH'),
      unmount: unmountDashboard,
      commit: commitDashboardActStateAndRefresh,
      applyAssetDeckCommand: applyDashboardAssetDeckCommandAndRefresh,
      url: resolveDashboardUrl()
    };

    if (pendingHero) {
      postDashboardData('ACE0_DASHBOARD_INIT');
    }
  });
})();
