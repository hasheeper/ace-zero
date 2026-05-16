/**
 * =============================================================
 * ACEZERO TAVERN PLUGIN — 酒馆助手中间件
 * =============================================================
 *
 * 流程:
 *
 *   1. GENERATION_AFTER_COMMANDS
 *      读取 MVU 变量 → 构建 hero 状态 XML 摘要 → injectPrompts 注入 AI 上下文
 *
 *   2. AI 回复
 *      AI 在正文中输出 <ACE0_BATTLE> { ...战局JSON... } </ACE0_BATTLE>
 *      同时 AI 可能输出 <UpdateVariable> 标签（MVU-zod 框架自动处理）
 *
 *   3. mag_before_message_update (优选) / character_message_rendered (兜底)
 *      检测消息中的 <ACE0_BATTLE> 标签 → 解析 AI 的战局 JSON
 *      → 读取 MVU hero 数据 → 按等级展开技能/特质/属性
 *      → 合并为完整 game-config
 *      → 追加 <ACE0_FRONTEND>\n{完整JSON}\n</ACE0_FRONTEND> 到消息
 *      → SillyTavern 正则匹配 ACE0_FRONTEND → 替换为 STver.html（$1 = JSON）
 *      → STver.html 解析 JSON → postMessage 到游戏 iframe
 *
 *      资金结算 (funds_up/funds_down) 与 cast/roster 状态补全由
 *      acezero-schema.js 的 zod transform 自动处理，无需插件介入。
 *
 * MVU 变量结构（message 变量 → stat_data）:
 * {
 *   "hero": {
 *     "funds": 5,
 *     "cast": { "RINO": { "introduced": true, "present": true, "inParty": true } },
 *     "roster": { "KAZU": { "level": 3, "mana": 0, "maxMana": 0 }, "RINO": { "level": 5, "mana": 100, "maxMana": 100 } }
 *   },
 * }
 *
 * 依赖: MVU-zod 变量框架 + JS-Slash-Runner (酒馆助手) API
 *       schema/acezero-schema.js (变量结构定义 + 自动结算)
 */

(async function () {
  'use strict';

  const PLUGIN_NAME = '[ACE0]';
  const BATTLE_TAG = 'ACE0_BATTLE';
  const FRONTEND_TAG = 'ACE0_FRONTEND';
  const ACT_RESULT_TAG = 'ACE0_ACT_RESULT';
  const HERO_INJECT_ID = 'ace0_hero_state';
  const REL_STATE_INJECT_ID = 'ace0_relationship_state';
  const PRIMARY_CONTEXT_INJECT_ID = 'ace0_primary_context';
  const ACT_STATE_INJECT_ID = 'ace0_act_state';
  const ACT_NARRATIVE_INJECT_ID = 'ace0_act_narrative';
  const ACT_TRANSITION_INJECT_ID = 'ace0_act_transition';
  const ACT_PACING_INJECT_ID = 'ace0_narrative_pacing';
  const ACT_FIRST_MEET_INJECT_ID = 'ace0_first_meet';
  const ACT_PRE_SIGNAL_INJECT_ID = 'ace0_pre_signal';
  const ACT_PHASE_PLAN_CONFIRMED_INJECT_ID = 'ace0_phase_plan_confirmed';
  const ACT_COMBAT_REQUEST_INJECT_ID = 'ace0_combat_request';
  const WORLD_CONTEXT_INJECT_ID = 'ace0_world_context';
  const LOCATION_DOC_INJECT_ID = 'ace0_location_doc';
  const HERO_INTERNAL_KEY = 'KAZU';
  const HERO_MACRO_NAME = '{{user}}';
  const HERO_MACRO_ALT = '<user>';
  const TAVERN_PLUGIN_DATA = (typeof window !== 'undefined' ? window : globalThis).ACE0TavernPluginData || {};
  const WORLD_LAYERS = TAVERN_PLUGIN_DATA.WORLD_LAYERS || ['THE_COURT', 'THE_EXCHANGE', 'THE_STREET', 'THE_RUST'];
  const DEFAULT_WORLD_LOCATION = TAVERN_PLUGIN_DATA.DEFAULT_WORLD_LOCATION || { layer: 'THE_STREET', site: '' };
  const LOCATION_LAYER_META = TAVERN_PLUGIN_DATA.LOCATION_LAYER_META || {};
  const ACT_RESOURCE_KEYS = ['combat', 'rest', 'asset', 'vision'];
  const ACT_STAGE_VALUES = ['planning', 'executing', 'route', 'complete'];
  // 节点内四段，与 world.clock 晨昼暮夜解耦
  const ACT_PHASE_LABELS = ['一段', '二段', '三段', '四段'];
  // 独立世界时钟：world.current_time 由它推进，与 ACT 节点无关。
  const WORLD_CLOCK_SLOTS = ['MORNING', 'NOON', 'AFTERNOON', 'NIGHT'];
  const DEFAULT_WORLD_CLOCK = { day: 1, phase: 'MORNING' };
  const DEFAULT_WORLD_CLOCK_PRESSURE = 0;
  const DEBT_INTEREST_RATE_PER_PHASE = 0.005;
  const MAJOR_DEBT_INTEREST_RATE_PER_PHASE = 0.01;

  const DEFAULT_WORLD_ACT = {
    id: 'chapter0_exchange',
    seed: 'AUTO',
    // 节点序列索引（1..totalNodes），与世界日无关
    nodeIndex: 1,
    route_history: [],
    limited: { combat: 0, rest: 0, asset: 0, vision: 0 },
    reserve: { combat: 0, rest: 0, asset: 0, vision: 0 },
    reserve_progress: { combat: 0, rest: 0, asset: 0, vision: 0 },
    income_rate: { combat: 0.2, rest: 0.2, asset: 0.2, vision: 0.2 },
    income_progress: { combat: 0, rest: 0, asset: 0, vision: 0 },
    phase_slots: [null, null, null, null],
    phase_index: 0,
    phasePlanLock: { nodeId: '', nodeIndex: 0, locked: false, confirmedPhaseIndex: 0, floorKey: '' },
    eventTree: { nodeGoals: { current: { goal: '', tendency: '' }, next: { goal: '', tendency: '' } }, phaseWindow: { nodeId: '', phases: [] } },
    // 本章已去掉 planning（编排相）——玩家通过 Dashboard 在 executing 过程中随时排/改未来相位的 slot。
    stage: 'executing',
    phase_advance: 0,
    controlledNodes: {},
    vision: { baseSight: 1, bonusSight: 0, jumpReady: false, pendingReplace: null },
    resourceSpent: { combat: 0, rest: 0, asset: 0, vision: 0 },
    characterEncounter: {},
    pendingResolutions: [],
    pendingAssetDeckCommands: [],
    resolutionHistory: [],
    // 情节张力 0-100
    narrativeTension: 0,
    pendingTransitionTarget: '',
    transitionRequestTarget: '',
    pendingTransitionPrompt: ''
  };
  // ACT 章节真相已迁入 `act/plugin.js`。

  let isProcessing = false;
  let pendingActBaselineSnapshot = null;
  let lastObservedWorldClock = null;

  function getAce0HostRoot() {
    try {
      if (window.parent && window.parent !== window) return window.parent;
    } catch (_) {}

    try {
      if (window.top && window.top !== window) return window.top;
    } catch (_) {}

    return window;
  }

  function getCurrentFloorKey() {
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

  function isSameWorldClock(a, b) {
    if (!a || !b) return false;
    return Number(a.day) === Number(b.day) && String(a.phase || '') === String(b.phase || '');
  }

  console.log(`${PLUGIN_NAME} 插件加载中...`);

  const BATTLE_RUNTIME = (typeof window !== 'undefined' ? window : globalThis).ACE0TavernBattleRuntime?.create({
    pluginName: PLUGIN_NAME,
    data: TAVERN_PLUGIN_DATA
  }) || {};
  const {
    UNIVERSAL_SKILLS,
    VANGUARD_TRAIT_UNLOCK,
    REARGUARD_TRAIT_UNLOCK,
    MANA_BY_LEVEL,
    MINI_GAME_SKILLS,
    NAMED_CHARACTERS,
    NAMED_NPC_PRESETS,
    VANGUARD_ATTRS_BY_LEVEL,
    REARGUARD_ATTRS_BY_LEVEL,
    AI_KERNELS,
    DIFFICULTY_MENTAL_PRESETS,
    AI_STYLE_PRESETS,
    RPG_TEMPLATES,
    MOOD_MODIFIERS,
    RUNNER_PRESETS,
    deriveMiniGameSkills,
    mergeAttrs,
    deriveSkillsFromAttrs,
    getCharAttrs,
    getCharTrait,
    getCharExclusiveSkills,
    assembleNPC,
    assembleFromRunner,
    assembleNamedNPC,
    resolveNpcSeat,
    resolveBattleData
  } = BATTLE_RUNTIME;


  // ==========================================================
  //  工具函数
  // ==========================================================

  function _normalizeTrimmedString(value, fallback = '') {
    return typeof value === 'string' ? value.trim() : fallback;
  }

  function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function cloneJsonData(value, fallback = null) {
    if (value === undefined || value === null) return fallback;
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_) {
      return fallback;
    }
  }

  function mergeMvuPatch(base, patch) {
    if (!isPlainObject(patch)) return cloneJsonData(patch, patch);
    const output = isPlainObject(base) ? { ...base } : {};
    Object.entries(patch).forEach(([key, value]) => {
      if (value === undefined) return;
      if (isPlainObject(value) && isPlainObject(output[key])) {
        output[key] = mergeMvuPatch(output[key], value);
      } else {
        output[key] = cloneJsonData(value, value);
      }
    });
    return output;
  }

  function escapeRegExp(text) {
    return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function sanitizeReplayOperationId(value) {
    const text = typeof value === 'string' ? value.trim() : '';
    return (text || `op:${Date.now()}`).replace(/[^\w:.-]+/g, '_').slice(0, 160);
  }

  function parseMessageIdFromFloorKey(floorKey) {
    const match = String(floorKey || '').trim().match(/^message:(\d+)$/i);
    if (!match) return null;
    const id = Number(match[1]);
    return Number.isFinite(id) && id >= 0 ? Math.round(id) : null;
  }

  function makeMessageFloorKey(messageId) {
    if (messageId === null || messageId === undefined || messageId === '') return '';
    const id = Number(messageId);
    return Number.isFinite(id) && id >= 0 ? `message:${Math.round(id)}` : '';
  }

  function getLatestMessageId() {
    try {
      if (typeof getCurrentMessageId === 'function') {
        const id = Number(getCurrentMessageId());
        if (Number.isFinite(id) && id >= 0) return Math.round(id);
      }
    } catch (_) {}
    try {
      if (typeof getChatMessages === 'function') {
        const latest = getChatMessages(-1)?.[0];
        const id = Number(latest?.message_id);
        if (Number.isFinite(id) && id >= 0) return Math.round(id);
      }
    } catch (_) {}
    return null;
  }

  function resolveReplayMessageId(options = {}) {
    const explicitId = Number(options.messageId ?? options.message_id);
    if (Number.isFinite(explicitId) && explicitId >= 0) return Math.round(explicitId);
    const floorId = parseMessageIdFromFloorKey(options.floorKey);
    if (floorId !== null) return floorId;
    return getLatestMessageId();
  }

  function hasCompleteMvuVariableBundle(vars) {
    return isPlainObject(vars)
      && isPlainObject(vars.stat_data)
      && isPlainObject(vars.stat_data.world)
      && isPlainObject(vars.stat_data.world.act)
      && Object.prototype.hasOwnProperty.call(vars, 'schema');
  }

  async function getMessageVariableBundle(messageId) {
    if (typeof getVariables !== 'function') return null;
    try {
      const id = Number(messageId);
      const options = { type: 'message' };
      if (Number.isFinite(id) && id >= 0) options.message_id = Math.round(id);
      const vars = await getVariables(options);
      return isPlainObject(vars) ? vars : null;
    } catch (error) {
      console.warn(`${PLUGIN_NAME} 读取 message:${messageId} MVU 变量失败:`, error);
      return null;
    }
  }

  async function getMessageEraVars(messageId) {
    const vars = await getMessageVariableBundle(messageId);
    return hasCompleteMvuVariableBundle(vars) ? vars.stat_data : null;
  }

  function buildAce0ReplayBlock(operationId, patches) {
    const id = sanitizeReplayOperationId(operationId);
    const patchList = Array.isArray(patches) ? patches.filter(item => item && typeof item === 'object') : [];
    return [
      '<UpdateVariable>',
      `<Analyze>ACE0_REPLAY:${id}</Analyze>`,
      '<JSONPatch>',
      JSON.stringify(patchList, null, 2),
      '</JSONPatch>',
      '</UpdateVariable>'
    ].join('\n');
  }

  function stripAce0ReplayBlock(content, operationId) {
    const id = sanitizeReplayOperationId(operationId);
    const text = typeof content === 'string' ? content : '';
    const pattern = new RegExp(
      `\\n*<UpdateVariable>\\s*<Analyze>\\s*ACE0_REPLAY:${escapeRegExp(id)}\\s*<\\/Analyze>\\s*<JSONPatch>[\\s\\S]*?<\\/JSONPatch>\\s*<\\/UpdateVariable>\\s*`,
      'gi'
    );
    return text.replace(pattern, '\n\n').replace(/\n{4,}/g, '\n\n\n').trimEnd();
  }

  function hasAce0ReplayBlock(content, operationId) {
    const id = sanitizeReplayOperationId(operationId);
    const text = typeof content === 'string' ? content : '';
    const pattern = new RegExp(
      `<UpdateVariable>\\s*<Analyze>\\s*ACE0_REPLAY:${escapeRegExp(id)}\\s*<\\/Analyze>\\s*<JSONPatch>[\\s\\S]*?<\\/JSONPatch>\\s*<\\/UpdateVariable>`,
      'i'
    );
    return pattern.test(text);
  }

  function insertAce0ReplayBlock(content, block) {
    const text = typeof content === 'string' ? content : '';
    const placeholder = '<StatusPlaceHolderImpl/>';
    const index = text.indexOf(placeholder);
    if (index >= 0) {
      const before = text.slice(0, index).trimEnd();
      const after = text.slice(index);
      return `${before}\n\n${block}\n\n${after.trimStart()}`;
    }
    const trimmed = text.trimEnd();
    return trimmed ? `${trimmed}\n\n${block}` : block;
  }

  function resolveMvuReplayHandler() {
    const root = getAce0HostRoot();
    const candidates = [];
    const seen = [];
    const pushHandler = (owner) => {
      try {
        const fn = owner && owner.handleVariablesInMessage;
        if (typeof fn !== 'function' || seen.includes(fn)) return;
        seen.push(fn);
        candidates.push(fn.bind(owner));
      } catch (_) {}
    };
    try {
      if (typeof handleVariablesInMessage === 'function' && !seen.includes(handleVariablesInMessage)) {
        seen.push(handleVariablesInMessage);
        candidates.push(handleVariablesInMessage);
      }
    } catch (_) {}
    try { pushHandler(window); } catch (_) {}
    try { pushHandler(window?.parent); } catch (_) {}
    try { pushHandler(window?.parent?.parent); } catch (_) {}
    try { pushHandler(window?.top); } catch (_) {}
    try { pushHandler(root); } catch (_) {}
    try { pushHandler(root?.parent); } catch (_) {}
    try { pushHandler(root?.parent?.parent); } catch (_) {}
    try { pushHandler(root?.top); } catch (_) {}
    try { pushHandler(typeof unsafeWindow === 'object' ? unsafeWindow : null); } catch (_) {}
    try { pushHandler(typeof unsafeWindow === 'object' ? unsafeWindow?.parent : null); } catch (_) {}
    try { pushHandler(typeof unsafeWindow === 'object' ? unsafeWindow?.top : null); } catch (_) {}
    try { pushHandler(window?.STBridge?.mvu); } catch (_) {}
    try { pushHandler(root?.STBridge?.mvu); } catch (_) {}
    return candidates[0] || null;
  }

  function resolveMvuApi() {
    const root = getAce0HostRoot();
    const candidates = [];
    const pushOwner = (owner) => {
      try {
        if (owner && !candidates.includes(owner)) candidates.push(owner);
      } catch (_) {}
    };
    try { pushOwner(window); } catch (_) {}
    try { pushOwner(window?.parent); } catch (_) {}
    try { pushOwner(window?.parent?.parent); } catch (_) {}
    try { pushOwner(window?.top); } catch (_) {}
    try { pushOwner(root); } catch (_) {}
    try { pushOwner(root?.parent); } catch (_) {}
    try { pushOwner(root?.parent?.parent); } catch (_) {}
    try { pushOwner(root?.top); } catch (_) {}
    try { pushOwner(typeof unsafeWindow === 'object' ? unsafeWindow : null); } catch (_) {}
    try { pushOwner(typeof unsafeWindow === 'object' ? unsafeWindow?.parent : null); } catch (_) {}
    try { pushOwner(typeof unsafeWindow === 'object' ? unsafeWindow?.top : null); } catch (_) {}

    for (const owner of candidates) {
      const api = owner?.Mvu;
      if (
        api &&
        typeof api.parseMessage === 'function' &&
        typeof api.replaceMvuData === 'function'
      ) {
        return api;
      }
    }
    return null;
  }

  async function getMvuReplayBaseVariables(messageId) {
    const id = Math.round(Number(messageId) || 0);
    const previousId = id > 0 ? id - 1 : 0;
    const previousVars = await getMessageVariableBundle(previousId);
    if (hasCompleteMvuVariableBundle(previousVars)) return cloneJsonData(previousVars, previousVars);
    if (id === 0) {
      const currentVars = await getMessageVariableBundle(0);
      if (hasCompleteMvuVariableBundle(currentVars)) return cloneJsonData(currentVars, currentVars);
    }
    return null;
  }

  async function replayMessageThroughMvu(messageId) {
    const replayHandler = resolveMvuReplayHandler();
    if (typeof replayHandler === 'function') {
      await replayHandler(messageId);
      return { ok: true, method: 'handleVariablesInMessage' };
    }

    const mvuApi = resolveMvuApi();
    if (!mvuApi) return { ok: false, reason: 'mvu_replay_unavailable' };

    const id = Math.round(Number(messageId) || 0);
    const msg = typeof getChatMessages === 'function' ? getChatMessages(id)?.[0] : null;
    if (!msg || typeof msg.message !== 'string') return { ok: false, reason: 'message_not_found' };

    const baseVars = await getMvuReplayBaseVariables(id);
    if (!hasCompleteMvuVariableBundle(baseVars)) return { ok: false, reason: 'mvu_replay_missing_base' };

    const nextVars = await mvuApi.parseMessage(msg.message, baseVars);
    if (!hasCompleteMvuVariableBundle(nextVars)) return { ok: false, reason: 'mvu_replay_parse_failed' };
    await mvuApi.replaceMvuData(nextVars, { type: 'message', message_id: id });
    return { ok: true, method: 'Mvu.parseMessage' };
  }

  function buildReplacePatch(path, value) {
    return {
      op: 'replace',
      path,
      value: cloneJsonData(value, value)
    };
  }

  function buildAddPatch(path, value) {
    return {
      op: 'add',
      path,
      value: cloneJsonData(value, value)
    };
  }

  function buildRemovePatch(path) {
    return {
      op: 'remove',
      path
    };
  }

  function escapeJsonPointerPart(part) {
    return String(part).replace(/~/g, '~0').replace(/\//g, '~1');
  }

  function appendJsonPointerPath(basePath, key) {
    return `${basePath || ''}/${escapeJsonPointerPart(key)}`;
  }

  function areJsonValuesEqual(left, right) {
    if (left === right) return true;
    try {
      return JSON.stringify(left) === JSON.stringify(right);
    } catch (_) {
      return false;
    }
  }

  function collectReplayDiffPatches(prevValue, nextValue, path, patches) {
    if (!path || areJsonValuesEqual(prevValue, nextValue)) return;

    if (nextValue === undefined) {
      patches.push(buildRemovePatch(path));
      return;
    }
    if (prevValue === undefined) {
      patches.push(buildAddPatch(path, nextValue));
      return;
    }

    if (isPlainObject(prevValue) && isPlainObject(nextValue)) {
      const keys = new Set([
        ...Object.keys(prevValue),
        ...Object.keys(nextValue)
      ]);
      keys.forEach((key) => {
        collectReplayDiffPatches(
          prevValue[key],
          nextValue[key],
          appendJsonPointerPath(path, key),
          patches
        );
      });
      return;
    }

    patches.push(buildReplacePatch(path, nextValue));
  }

  function readJsonPointer(rootValue, pointer) {
    if (!pointer || pointer === '/') return rootValue;
    const parts = String(pointer).split('/').slice(1).map(part => part.replace(/~1/g, '/').replace(/~0/g, '~'));
    let current = rootValue;
    for (const part of parts) {
      if (current == null || typeof current !== 'object') return undefined;
      current = current[part];
    }
    return current;
  }

  function buildReplayPatchesFromEraVars(beforeVars, afterVars, paths = null) {
    const patchPaths = Array.isArray(paths) && paths.length
      ? paths
      : [
          '/hero',
          '/world/act',
          '/world/assetDeck',
          '/world/clockPressure',
          '/world/current_time',
          '/world/location',
          '/world/tags',
          '/world/flags',
          '/world/storyFlags',
          '/world/expansion_state'
        ];
    const patches = [];
    patchPaths.forEach((path) => {
      const nextValue = readJsonPointer(afterVars, path);
      if (nextValue === undefined) return;
      const prevValue = readJsonPointer(beforeVars, path);
      collectReplayDiffPatches(prevValue, nextValue, path, patches);
    });
    return patches;
  }

  function normalizeReplayPatches(patches) {
    const byPath = new Map();
    (Array.isArray(patches) ? patches : []).forEach((patch) => {
      if (!patch || typeof patch !== 'object') return;
      const path = typeof patch.path === 'string' ? patch.path.trim() : '';
      if (!path) return;
      byPath.set(path, {
        ...patch,
        path
      });
    });
    return Array.from(byPath.values());
  }

  async function commitAce0ReplayPatch(options = {}) {
    const patches = Array.isArray(options.patches) ? options.patches.filter(item => item && typeof item === 'object') : [];
    if (!patches.length) return { ok: false, reason: 'empty_replay_patch' };

    const messageId = resolveReplayMessageId(options);
    if (!Number.isFinite(Number(messageId)) || Number(messageId) < 0) {
      return { ok: false, reason: 'missing_message_id' };
    }
    const normalizedMessageId = Math.round(Number(messageId));
    const expectedFloorKey = typeof options.floorKey === 'string' ? options.floorKey.trim() : '';
    const actualFloorKey = makeMessageFloorKey(normalizedMessageId);
    if (expectedFloorKey && expectedFloorKey !== actualFloorKey) {
      return { ok: false, reason: 'floor_key_mismatch', floorKey: actualFloorKey, expectedFloorKey };
    }

    const vars = await getMessageVariableBundle(normalizedMessageId);
    if (!hasCompleteMvuVariableBundle(vars)) {
      console.warn(`${PLUGIN_NAME} ${actualFloorKey} 缺少完整 MVU 基底，ACE0_REPLAY 写入已拒绝。需要先重演/恢复变量。`);
      return { ok: false, reason: 'mvu_replay_missing_base', messageId: normalizedMessageId, floorKey: actualFloorKey };
    }

    if (typeof getChatMessages !== 'function' || typeof setChatMessages !== 'function') {
      return { ok: false, reason: 'chat_message_api_unavailable', messageId: normalizedMessageId, floorKey: actualFloorKey };
    }

    const messages = getChatMessages(normalizedMessageId);
    const msg = Array.isArray(messages) ? messages[0] : null;
    if (!msg || typeof msg !== 'object') {
      return { ok: false, reason: 'message_not_found', messageId: normalizedMessageId, floorKey: actualFloorKey };
    }

    const hasReplayHandler = typeof resolveMvuReplayHandler() === 'function';
    const hasMvuApi = Boolean(resolveMvuApi());
    if (!hasReplayHandler && !hasMvuApi) {
      return { ok: false, reason: 'mvu_replay_unavailable', messageId: normalizedMessageId, floorKey: actualFloorKey };
    }

    const operationId = sanitizeReplayOperationId(options.operationId || `message:${normalizedMessageId}:ace0`);
    const stripIds = [
      operationId,
      ...(Array.isArray(options.replaceOperationIds) ? options.replaceOperationIds : [])
    ].map(sanitizeReplayOperationId).filter(Boolean);
    const uniqueStripIds = Array.from(new Set(stripIds));
    const originalMessage = msg.message || '';
    const stripped = uniqueStripIds.reduce(
      (content, stripId) => stripAce0ReplayBlock(content, stripId),
      originalMessage
    );
    const block = buildAce0ReplayBlock(operationId, patches);
    const nextMessage = insertAce0ReplayBlock(stripped, block);
    await setChatMessages([{
      message_id: normalizedMessageId,
      message: nextMessage
    }], { refresh: options.refresh || 'affected' });

    const replayResult = await replayMessageThroughMvu(normalizedMessageId);
    if (!replayResult.ok) {
      return {
        ok: false,
        reason: replayResult.reason || 'mvu_replay_failed',
        messageId: normalizedMessageId,
        floorKey: actualFloorKey,
        operationId
      };
    }
    return {
      ok: true,
      messageId: normalizedMessageId,
      floorKey: actualFloorKey,
      operationId,
      patchCount: patches.length,
      replayMethod: replayResult.method || ''
    };
  }

  function normalizeActResourceKey(value, fallback = 'vision') {
    const normalized = _normalizeTrimmedString(value, fallback).toLowerCase();
    return ACT_RESOURCE_KEYS.includes(normalized) ? normalized : fallback;
  }

  function normalizeBattleAssetDeckForFrontend(eraVars) {
    const rawAssetDeck = eraVars?.world?.assetDeck;
    if (!rawAssetDeck || typeof rawAssetDeck !== 'object' || Array.isArray(rawAssetDeck)) return null;

    let normalizedDeck = null;
    const assetDeckModule = getAssetDeckModuleApi();
    if (assetDeckModule && typeof assetDeckModule.normalizeAssetDeckState === 'function') {
      try {
        normalizedDeck = assetDeckModule.normalizeAssetDeckState(rawAssetDeck);
      } catch (error) {
        console.warn(`${PLUGIN_NAME} AssetDeck 规范化失败，降级透传原始卡组:`, error);
      }
    }

    if (!normalizedDeck) {
      try {
        normalizedDeck = JSON.parse(JSON.stringify(rawAssetDeck));
      } catch (_) {
        return null;
      }
    }

    return {
      version: Math.max(1, Math.round(Number(normalizedDeck.version) || 1)),
      general_slots_unlocked: Math.max(0, Math.round(Number(normalizedDeck.general_slots_unlocked) || 0)),
      void_slots_unlocked: Math.max(0, Math.round(Number(normalizedDeck.void_slots_unlocked) || 0)),
      active_general_cards: Array.isArray(normalizedDeck.active_general_cards) ? normalizedDeck.active_general_cards : [],
      active_void_cards: Array.isArray(normalizedDeck.active_void_cards) ? normalizedDeck.active_void_cards : []
    };
  }

  function compactActResolutionHistoryItem(item) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    if (item.protocol === 'ace0.assetOfferClear.v1' || item.type === 'asset_offer_clear') {
      const clearKey = _normalizeTrimmedString(item.clearKey || item.offerId, '');
      if (!clearKey) return null;
      return {
        id: _normalizeTrimmedString(item.id, `asset-offer-clear:${clearKey}`),
        protocol: 'ace0.assetOfferClear.v1',
        type: 'asset_offer_clear',
        status: _normalizeTrimmedString(item.status, 'resolved') || 'resolved',
        clearKey,
        offerId: _normalizeTrimmedString(item.offerId, clearKey),
        outcome: _normalizeTrimmedString(item.outcome, '')
      };
    }
    const type = normalizeActResourceKey(item.type, '');
    if (type !== 'asset' && type !== 'combat') return null;
    const payload = item.payload && typeof item.payload === 'object' && !Array.isArray(item.payload) ? item.payload : {};
    const compact = {
      id: _normalizeTrimmedString(item.id, ''),
      protocol: _normalizeTrimmedString(item.protocol, type === 'asset' ? 'ace0.assetDeckCommand.v1' : ''),
      type,
      level: Math.max(1, Math.min(3, Math.round(Number(item.level) || 1))),
      nodeId: _normalizeTrimmedString(item.nodeId, ''),
      nodeIndex: Math.max(0, Math.round(Number(item.nodeIndex) || 0)),
      phaseIndex: Math.max(0, Math.round(Number(item.phaseIndex) || 0)),
      status: _normalizeTrimmedString(item.status, 'resolved') || 'resolved',
      outcome: _normalizeTrimmedString(item.outcome, '')
    };
    const commandKind = _normalizeTrimmedString(item.commandKind || payload.commandKind, '');
    if (commandKind) compact.commandKind = commandKind;
    if (item.pool) compact.pool = _normalizeTrimmedString(item.pool, '');
    if (item.error || payload.error) compact.error = _normalizeTrimmedString(item.error || payload.error, '');
    return compact.id ? compact : null;
  }

  const CHARACTER_RUNTIME = (typeof window !== 'undefined' ? window : globalThis).ACE0TavernCharacterRuntime?.create({
    pluginName: PLUGIN_NAME,
    data: TAVERN_PLUGIN_DATA,
    constants: {
      HERO_INTERNAL_KEY,
      HERO_MACRO_NAME,
      HERO_MACRO_ALT
    },
    deps: {
      normalizeTrimmedString: _normalizeTrimmedString,
      getWorldbook: typeof getWorldbook === 'function' ? getWorldbook : undefined
    }
  }) || {};
  const {
    CHAR_DOC_INJECT_IDS = {},
    NON_PLAYER_CHARACTER_KEYS = [],
    ALL_CHARACTER_KEYS = [],
    DEFAULT_CAST_NODE = {},
    DEFAULT_ROSTER_NODE = {},
    CHARACTER_PROMPT_DOCS = {}
  } = CHARACTER_RUNTIME;

  function isHeroMacroToken(value) { return CHARACTER_RUNTIME.isHeroMacroToken(value); }
  function resolveCurrentUserDisplayName(fallback = HERO_INTERNAL_KEY) { return CHARACTER_RUNTIME.resolveCurrentUserDisplayName(fallback); }
  function resolveHeroDisplayName(fallback = HERO_INTERNAL_KEY) { return CHARACTER_RUNTIME.resolveHeroDisplayName(fallback); }
  function resolveHeroAliasDisplayName(hero, fallback = HERO_INTERNAL_KEY) { return CHARACTER_RUNTIME.resolveHeroAliasDisplayName(hero, fallback); }
  function normalizeHeroCharacterKey(rawName, hero) { return CHARACTER_RUNTIME.normalizeHeroCharacterKey(rawName, hero); }
  function replaceHeroPromptMacro(text) { return CHARACTER_RUNTIME.replaceHeroPromptMacro(text); }
  function resolveDisplayCharacterName(charKey) { return CHARACTER_RUNTIME.resolveDisplayCharacterName(charKey); }
  function resolveFrontendCharacterName(charKey, hero) { return CHARACTER_RUNTIME.resolveFrontendCharacterName(charKey, hero); }
  function getRelationshipTierIndex(score) { return CHARACTER_RUNTIME.getRelationshipTierIndex(score); }
  async function getFullCharacterDoc(charKey, fallbackDoc = null) { return await CHARACTER_RUNTIME.getFullCharacterDoc(charKey, fallbackDoc); }
  async function getCharacterPromptDoc(charKey, state = {}, options = {}) { return await CHARACTER_RUNTIME.getCharacterPromptDoc(charKey, state, options); }
  async function buildCharacterPromptInjections(eraVars, forceMiniKeys = null) { return await CHARACTER_RUNTIME.buildCharacterPromptInjections(eraVars, forceMiniKeys); }
  function getHeroCast(hero) { return CHARACTER_RUNTIME.getHeroCast(hero); }
  function getHeroRoster(hero) { return CHARACTER_RUNTIME.getHeroRoster(hero); }
  function getCastNode(hero, charKey) { return CHARACTER_RUNTIME.getCastNode(hero, charKey); }
  function getRosterNode(hero, charKey) { return CHARACTER_RUNTIME.getRosterNode(hero, charKey); }
  function _getHeroCharNames(hero) { return CHARACTER_RUNTIME.getHeroCharNames(hero); }
  function _getPartyRoster(hero) { return CHARACTER_RUNTIME.getPartyRoster(hero); }

  // ==========================================================
  //  MVU 变量读写（通过酒馆助手 variable API）
  //  变量存储: message 变量 → stat_data
  // ==========================================================

  async function getEraVars() {
    try {
      const vars = await getVariables({ type: 'message' });
      return vars?.stat_data || null;
    } catch (e) {
      console.warn(`${PLUGIN_NAME} MVU 变量读取失败:`, e);
      return null;
    }
  }

  async function updateEraVars(data) {
    try {
      const patch = isPlainObject(data) ? data : {};
      const currentBundle = typeof getVariables === 'function' ? await getVariables({ type: 'message' }) : null;
      if (!hasCompleteMvuVariableBundle(currentBundle)) {
        console.warn(`${PLUGIN_NAME} 当前楼缺少完整 MVU 基底，直接变量写入已拒绝。需要先重演/恢复变量。`);
        return false;
      }
      if (typeof updateVariablesWith === 'function') {
        await updateVariablesWith((vars) => {
          const currentVars = isPlainObject(vars) ? vars : {};
          if (!hasCompleteMvuVariableBundle(currentVars)) return currentVars;
          return {
            ...currentVars,
            stat_data: mergeMvuPatch(currentVars.stat_data, patch)
          };
        }, { type: 'message' });
        return true;
      }

      await insertOrAssignVariables({
        stat_data: mergeMvuPatch(currentBundle.stat_data, patch)
      }, { type: 'message' });
      return true;
    } catch (e) {
      console.error(`${PLUGIN_NAME} MVU 变量写入失败:`, e);
      return false;
    }
  }

  function refreshDashboardUiAfterExternalWrite() {
    const root = getAce0HostRoot();
    try {
      if (root && typeof root.__ACE0_DASHBOARD_FORCE_REFRESH__ === 'function') {
        root.__ACE0_DASHBOARD_FORCE_REFRESH__();
        return;
      }
    } catch (_) {}
    try {
      const evt = new CustomEvent('ace0:dashboard-force-refresh');
      if (root && typeof root.dispatchEvent === 'function') root.dispatchEvent(evt);
      else if (typeof window.dispatchEvent === 'function') window.dispatchEvent(evt);
    } catch (_) {}
  }

  function getExpansionRegistry() {
    const hostRoot = getAce0HostRoot();
    return hostRoot.ACE0ExpansionRegistry && typeof hostRoot.ACE0ExpansionRegistry === 'object'
      ? hostRoot.ACE0ExpansionRegistry
      : null;
  }

  function getExpansionPromptStateStore() {
    const hostRoot = getAce0HostRoot();
    if (!hostRoot.__ACE0_EXPANSION_PROMPT_STATE__) {
      hostRoot.__ACE0_EXPANSION_PROMPT_STATE__ = {
        ids: []
      };
    }
    return hostRoot.__ACE0_EXPANSION_PROMPT_STATE__;
  }

  function normalizeExpansionPrompt(prompt, index) {
    if (!prompt || typeof prompt !== 'object') return null;

    const content = typeof prompt.content === 'string' ? prompt.content : '';
    if (!content.trim()) return null;

    return {
      id: typeof prompt.id === 'string' && prompt.id.trim()
        ? prompt.id.trim()
        : `ace0_expansion_prompt_${index + 1}`,
      position: prompt.position || 'in_chat',
      depth: Number.isFinite(prompt.depth) ? prompt.depth : 1,
      role: prompt.role || 'system',
      content,
      should_scan: prompt.should_scan === true
    };
  }

  function buildExpansionPromptInjections(eraVars) {
    const registry = getExpansionRegistry();
    if (!registry || typeof registry.collectPromptInjections !== 'function') {
      return [];
    }

    const rawPrompts = registry.collectPromptInjections({
      eraVars
    });

    return rawPrompts
      .map((prompt, index) => normalizeExpansionPrompt(prompt, index))
      .filter(Boolean);
  }

  // ==========================================================
  //  MVU 变量 → 完整 game-config 构建
  // ==========================================================

  /**
   * 从 MVU 变量中提取 hero 数据，按等级展开技能/特质/属性，
   * 与 AI 提供的战局 JSON 合并，输出完整 game-config
   *
   * MVU 结构: stat_data.hero = { funds, KAZU: {level,mana,maxMana}, RINO: {...} }
   * funds 单位 = 金弗（可带 2 位小数）
   * 德州引擎内部仍使用银弗整数，因此在此处做单位换算
   * 战局 JSON 中 hero 字段指定本局的 vanguard/rearguard:
   *   { "hero": { "vanguard": "KAZU", "rearguard": "RINO" }, "seats": {...} }
   *   rearguard 可省略（无副手模式）
   *
   * @param {object} eraVars - MVU 变量 (stat_data)
   * @param {object} aiBattleData - AI 输出的战局 JSON
   * @returns {object} - 完整 game-config
   */
  function buildCompleteGameConfig(eraVars, aiBattleData) {
    const hero = (eraVars && eraVars.hero) || {};
    const battle = aiBattleData || {};
    const battleHero = battle.hero || {};

    // 从战局数据获取本局的主手/副手名称，回退到 MVU 中第一个在队角色
    const charNames = _getHeroCharNames(hero);
    const vName = normalizeHeroCharacterKey(battleHero.vanguard, hero) || charNames[0] || HERO_INTERNAL_KEY;
    const rName = normalizeHeroCharacterKey(battleHero.rearguard, hero) || null; // 副手可选

    const vData = getRosterNode(hero, vName);
    const rData = rName ? getRosterNode(hero, rName) : getRosterNode(hero, null);

    const vLv = Math.min(5, Math.max(0, vData.level || 0));
    const rLv = rName ? Math.min(5, Math.max(0, rData.level || 0)) : 0;
    const maxLv = Math.max(vLv, rLv);

    // 各角色独立属性面板（按角色名 + 等级查表，支持专属角色）
    const vAttrs = getCharAttrs(vName, vLv, 'vanguard');
    const rAttrs = rName ? getCharAttrs(rName, rLv, 'rearguard') : { moirai: 0, chaos: 0, psyche: 0, void: 0 };

    // 合并属性（取各维度最大值，用于战斗/防御）
    const eraAttrs = hero.attrs || null;
    const attrs = eraAttrs || mergeAttrs(vAttrs, rAttrs);

    // 技能：各角色独立推导（传入角色名以解锁专属技能）
    const vanguardSkills = deriveSkillsFromAttrs(vAttrs, vName);
    const rearguardSkills = rName ? deriveSkillsFromAttrs(rAttrs, rName) : [];

    // 特质（按角色名 + 等级 + 位置查表，支持专属角色）
    const vTrait = getCharTrait(vName, vLv, 'vanguard');
    const rTrait = rName ? getCharTrait(rName, rLv, 'rearguard') : null;

    // 魔运值：主手/副手独立。legacy hero.mana/maxMana 仅保留给旧前端 fallback。
    const vMaxMana = (vData.maxMana != null) ? vData.maxMana : (MANA_BY_LEVEL[vLv] || { max: 0 }).max;
    const rMaxMana = rName ? ((rData.maxMana != null) ? rData.maxMana : (MANA_BY_LEVEL[rLv] || { max: 0 }).max) : 0;
    const vMana = (vData.mana != null) ? Math.min(vData.mana, vMaxMana) : vMaxMana;
    const rMana = rName ? ((rData.mana != null) ? Math.min(rData.mana, rMaxMana) : rMaxMana) : 0;
    const legacyMaxMana = vMaxMana;
    const legacyMana = vMana;

    // 赌局筹码：NPC 使用 table chips，hero 使用 MVU funds（上限为 table chips）
    const tableChips = _goldFundsToSilverUnits(battle.chips != null ? battle.chips : 10);
    const heroFunds = _goldFundsToSilverUnits(hero.funds);
    const heroChips = heroFunds > 0 ? Math.min(heroFunds, tableChips) : tableChips;

    // 构建 hero 配置（game-config v5 格式：区分主手/副手技能）
    const heroConfig = {
      vanguard: {
        name: resolveFrontendCharacterName(vName, hero),
        level: vLv,
        displayName: resolveFrontendCharacterName(vName, hero),
        roleId: vName,
        mana: vMana,
        maxMana: vMaxMana,
        manaRegen: (vData.manaRegen != null) ? vData.manaRegen : ((MANA_BY_LEVEL[vLv] || { regen: 0 }).regen || 0)
      },
      attrs: { ...attrs },
      vanguardSkills: vanguardSkills,
      rearguardSkills: rearguardSkills,
      mana: legacyMana,
      maxMana: legacyMaxMana,
      heroDisplayName: resolveHeroAliasDisplayName(hero, HERO_INTERNAL_KEY)
    };
    if (vTrait) heroConfig.vanguard.trait = vTrait;

    // 副手：仅当指定时才写入
    if (rName) {
      heroConfig.rearguard = {
        name: rName,
        level: rLv,
        displayName: resolveDisplayCharacterName(rName),
        roleId: rName,
        mana: rMana,
        maxMana: rMaxMana,
        manaRegen: (rData.manaRegen != null) ? rData.manaRegen : ((MANA_BY_LEVEL[rLv] || { regen: 0 }).regen || 0)
      };
      if (rTrait) heroConfig.rearguard.trait = rTrait;
    }

    const result = {
      blinds: _normalizeBattleBlinds(battle.blinds),
      chips: tableChips,
      heroChips: heroChips,
      heroDisplayName: resolveHeroAliasDisplayName(hero, HERO_INTERNAL_KEY),
      hero: heroConfig,
      seats: battle.seats || {}
    };
    const assetDeck = normalizeBattleAssetDeckForFrontend(eraVars);
    if (assetDeck) result.assetDeck = assetDeck;

    // hero 的座位位置（BTN/SB/BB/UTG/HJ/CO）
    // 必须是 seats 中未被 NPC 占用的位置
    if (battle.heroSeat) {
      result.heroSeat = battle.heroSeat;
    } else {
      // 自动分配：找到 SEAT_ORDER 中第一个未被 NPC 占用的位置
      const SEAT_ORDER = ['BB', 'CO', 'UTG', 'HJ', 'SB', 'BTN'];
      const usedSeats = new Set(Object.keys(battle.seats || {}));
      const freeSeat = SEAT_ORDER.find(s => !usedSeats.has(s));
      result.heroSeat = freeSeat || 'BB';
    }

    // 心理战数据：从 battle.mentalPressure 传递
    if (battle.mentalPressure) {
      result.mentalPressure = battle.mentalPressure;
    }

    // 小游戏模式支持
    const gameMode = battle.gameMode || (Object.keys(battle.seats || {}).length > 0 ? 'texas-holdem' : null);
    if (gameMode) result.gameMode = gameMode;

    if (battle.ace0Combat === true) {
      const ace0Combat = resolveAce0CombatConfig(eraVars);
      if (ace0Combat) {
        result.ace0Combat = ace0Combat;
      } else {
        console.warn(`${PLUGIN_NAME} ace0Combat 标记存在，但当前 MVU/ACT 状态中没有可绑定的 combat request。`);
      }
    } else if (battle.ace0Combat && typeof battle.ace0Combat === 'object') {
      console.warn(`${PLUGIN_NAME} 已忽略旧式 ace0Combat 对象；请在 ${BATTLE_TAG} 中使用 ace0Combat: true。`);
    }

    // 小游戏配置：根据主手/副手属性映射
    if (gameMode === 'blackjack' || gameMode === 'dice' || gameMode === 'dragon-tiger' || gameMode === 'dragon_tiger') {
      const miniGameAttrs = rName
        ? { moirai: rAttrs.moirai || 0, chaos: rAttrs.chaos || 0, psyche: rAttrs.psyche || 0 }
        : { moirai: vAttrs.moirai || 0, chaos: vAttrs.chaos || 0, psyche: vAttrs.psyche || 0 };

      const miniGameSkills = deriveMiniGameSkills(miniGameAttrs, gameMode);

      result.hero.attrs = miniGameAttrs;
      result.hero.miniGameSkills = miniGameSkills;

      const gameKey = gameMode === 'dragon-tiger' ? 'dragon_tiger' : gameMode;
      result[gameKey] = _normalizeMiniGameConfig(
        battle[gameKey],
        {
          startingChips: heroChips,
          minBet: 10,
          maxBet: Math.floor(heroChips / 2),
          defaultBet: 50,
          mana: { enabled: true, pool: legacyMaxMana },
          dealer: { rpsStrategy: 'random' }
        }
      );
    }

    return result;
  }

  // ==========================================================
  //  A. AI 上下文注入（GENERATION_AFTER_COMMANDS）
  // ==========================================================

  function _normalizeFundsAmount(funds) {
    const numeric = Number(funds);
    if (!Number.isFinite(numeric)) return 0;
    return Math.max(0, Math.round(numeric * 100) / 100);
  }

  const SILVER_PER_GOLD = 100;

  function _formatFundsNumber(funds) {
    const value = _normalizeFundsAmount(funds);
    const units = [
      { threshold: 1_000_000_000, suffix: 'b' },
      { threshold: 1_000_000, suffix: 'm' },
      { threshold: 1_000, suffix: 'k' }
    ];

    for (const unit of units) {
      if (value >= unit.threshold) {
        const scaled = value / unit.threshold;
        const precision = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
        return `${scaled.toFixed(precision).replace(/\.?0+$/, '')}${unit.suffix}`;
      }
    }

    return value.toFixed(2).replace(/\.?0+$/, '');
  }

  function _goldFundsToSilverUnits(funds) {
    return Math.max(0, Math.round(_normalizeFundsAmount(funds) * SILVER_PER_GOLD));
  }

  function _silverUnitsToGoldFunds(silver) {
    const numeric = Number(silver);
    if (!Number.isFinite(numeric)) return 0;
    return _normalizeFundsAmount(numeric / SILVER_PER_GOLD);
  }

  function _normalizeBattleBlinds(blinds) {
    const normalized = Array.isArray(blinds) ? blinds : [0.1, 0.2];
    const sb = _goldFundsToSilverUnits(normalized[0] != null ? normalized[0] : 0.1);
    const bb = _goldFundsToSilverUnits(normalized[1] != null ? normalized[1] : 0.2);
    return [sb, bb];
  }

  function _normalizeMiniGameConfig(config, defaults) {
    if (!config || typeof config !== 'object') return { ...defaults };
    const normalized = {
      ...defaults,
      ...config
    };
    for (const key of ['startingChips', 'minBet', 'maxBet', 'defaultBet']) {
      if (config[key] != null) {
        normalized[key] = _goldFundsToSilverUnits(config[key]);
      }
    }
    return normalized;
  }

  function _formatFunds(funds) {
    return `${_formatFundsNumber(funds)} 金弗`;
  }

  // 魔运低于 30% 时视为低魔运
  const MANA_LOW_RATIO = TAVERN_PLUGIN_DATA.MANA_LOW_RATIO || 0.3;
  const REL_STAGE_ENT = TAVERN_PLUGIN_DATA.REL_STAGE_ENT || [];
  const REL_STAGE_EX_BY_CHAR = TAVERN_PLUGIN_DATA.REL_STAGE_EX_BY_CHAR || {};
  const REL_META = TAVERN_PLUGIN_DATA.REL_META || {};
  const REL_DELTA_META = TAVERN_PLUGIN_DATA.REL_DELTA_META || {};
  const CONTEXT_RUNTIME = (typeof window !== 'undefined' ? window : globalThis).ACE0TavernContextRuntime?.create({
    pluginName: PLUGIN_NAME,
    data: TAVERN_PLUGIN_DATA,
    constants: {
      HERO_INTERNAL_KEY,
      WORLD_LAYERS,
      DEFAULT_WORLD_LOCATION,
      LOCATION_LAYER_META,
      DEFAULT_WORLD_CLOCK,
      WORLD_CLOCK_SLOTS,
      MANA_LOW_RATIO,
      REL_STAGE_ENT,
      REL_STAGE_EX_BY_CHAR,
      REL_META,
      REL_DELTA_META
    },
    deps: {
      getCastNode,
      getWorldState,
      getWorldClock,
      getPartyRoster: _getPartyRoster,
      normalizeFundsAmount: _normalizeFundsAmount,
      formatFunds: _formatFunds,
      formatFundsNumber: _formatFundsNumber
    }
  }) || {};

  function getRelStageName(score, table) {
    return CONTEXT_RUNTIME.getRelStageName(score, table);
  }

  function getRelStage(score, table) {
    return CONTEXT_RUNTIME.getRelStage(score, table);
  }

  function buildRelationshipStateSummary(eraVars) {
    return CONTEXT_RUNTIME.buildRelationshipStateSummary(eraVars);
  }
  /**
   * 构建注入给 AI 的 hero 状态 XML 摘要
   * - 资金显示统一为金弗（可带小数）
   * - 在队角色显示等级 + 魔运（低魔运时警告）
   * - 未入队角色不显示等级
   */
  function buildHeroSummary(eraVars) {
    return CONTEXT_RUNTIME.buildHeroSummary(eraVars);
  }

  function getWorldState(eraVars) {
    return eraVars && eraVars.world && typeof eraVars.world === 'object'
      ? eraVars.world
      : {};
  }

  function getHeroState(eraVars) {
    return eraVars && eraVars.hero && typeof eraVars.hero === 'object'
      ? eraVars.hero
      : {};
  }

  function getWorldLocation(eraVars) {
    return CONTEXT_RUNTIME.getWorldLocation(eraVars);
  }

  function buildWorldContextSummary(eraVars) {
    return CONTEXT_RUNTIME.buildWorldContextSummary(eraVars);
  }

  function buildLocationDocSummary(eraVars) {
    return CONTEXT_RUNTIME.buildLocationDocSummary(eraVars);
  }

  const ACT_RUNTIME = (typeof window !== 'undefined' ? window : globalThis).ACE0TavernActRuntime?.create({
    constants: {
      ACT_RESOURCE_KEYS,
      ACT_STAGE_VALUES,
      ACT_PHASE_LABELS,
      WORLD_CLOCK_SLOTS,
      DEFAULT_WORLD_CLOCK,
      DEFAULT_WORLD_CLOCK_PRESSURE,
      DEFAULT_WORLD_ACT,
      DEBT_INTEREST_RATE_PER_PHASE,
      MAJOR_DEBT_INTEREST_RATE_PER_PHASE,
      LOCATION_LAYER_META,
      HERO_INTERNAL_KEY,
      ACT_STATE_INJECT_ID,
      ACT_NARRATIVE_INJECT_ID,
      ACT_TRANSITION_INJECT_ID,
      ACT_PACING_INJECT_ID,
      ACT_FIRST_MEET_INJECT_ID,
      ACT_PRE_SIGNAL_INJECT_ID,
      ACT_PHASE_PLAN_CONFIRMED_INJECT_ID,
      ACT_COMBAT_REQUEST_INJECT_ID
    },
    deps: {
      getAce0HostRoot,
      normalizeTrimmedString: _normalizeTrimmedString,
      normalizeActResourceKey,
      normalizeFundsAmount: _normalizeFundsAmount,
      getEraVars,
      updateEraVars,
      getWorldState,
      getHeroState,
      getHeroCast,
      getCastNode,
      getRosterNode,
      getWorldLocation,
      getCurrentFloorKey
    }
  }) || {};
  const {
    TENSION_DELTA = {},
    CLOCK_PRESSURE_DELTA = {},
    FLOOR_PROGRESS_DELTA = {},
    CLOCK_ADVANCE_SUGGESTION_TIERS = []
  } = ACT_RUNTIME;

  function normalizeWorldClock(raw) { return ACT_RUNTIME.normalizeWorldClock(raw); }
  function getWorldClock(eraVars) { return ACT_RUNTIME.getWorldClock(eraVars); }
  function getActModuleApi() { return ACT_RUNTIME.getActModuleApi(); }
  function installActModuleHostBridge() { return ACT_RUNTIME.installActModuleHostBridge(); }
  function getActDefaultStateFromModule(actId) { return ACT_RUNTIME.getActDefaultStateFromModule(actId); }
  function runActModuleMethod(methodName, ...args) { return ACT_RUNTIME.runActModuleMethod(methodName, ...args); }
  function normalizeActVisionState(raw) { return ACT_RUNTIME.normalizeActVisionState(raw); }
  function getWorldActState(eraVars) { return ACT_RUNTIME.getWorldActState(eraVars); }
  function getActRuntimeConfig(actId) { return ACT_RUNTIME.getActRuntimeConfig(actId); }
  function maybeResolveActCompletionTransition(actState, heroState, worldState) { return ACT_RUNTIME.maybeResolveActCompletionTransition(actState, heroState, worldState); }
  function getActNodeRuntime(config, nodeId) { return ACT_RUNTIME.getActNodeRuntime(config, nodeId); }
  function createEmptyActCounts(defaultValue = 0) { return ACT_RUNTIME.createEmptyActCounts(defaultValue); }
  function createActRewardsForNode(nodeRuntime) { return ACT_RUNTIME.createActRewardsForNode(nodeRuntime); }
  function normalizeActEffectList(list) { return ACT_RUNTIME.normalizeActEffectList(list); }
  function deriveActCharacterStates(eraVars) { return ACT_RUNTIME.deriveActCharacterStates(eraVars); }
  async function synchronizeActCharacterState(eraVars, options = {}) { return await ACT_RUNTIME.synchronizeActCharacterState(eraVars, options); }
  function buildActStateSummary(eraVars, derivedActState = null) { return ACT_RUNTIME.buildActStateSummary(eraVars, derivedActState); }
  function buildActNarrativePrompts(eraVars, derivedActState = null, firstMeetHints = null, preSignalHints = null) { return ACT_RUNTIME.buildActNarrativePrompts(eraVars, derivedActState, firstMeetHints, preSignalHints); }
  function resolveAce0CombatConfig(eraVars, derivedActState = null) { return ACT_RUNTIME.resolveAce0CombatConfig(eraVars, derivedActState); }

  function getActiveFirstMeetHintsForCurrentPhase(eraVars, derivedActState = null) {
    return ACT_RUNTIME && typeof ACT_RUNTIME.getActiveFirstMeetHintsForCurrentPhase === 'function'
      ? ACT_RUNTIME.getActiveFirstMeetHintsForCurrentPhase(eraVars, derivedActState)
      : {};
  }
  function normalizeActSnapshotCounts(raw) { return ACT_RUNTIME.normalizeActSnapshotCounts(raw); }
  function getHeroResourceSnapshot(eraVars) { return ACT_RUNTIME.getHeroResourceSnapshot(eraVars); }
  function getHeroCastStateSnapshot(eraVars, managedCharacters, states) { return ACT_RUNTIME.getHeroCastStateSnapshot(eraVars, managedCharacters, states); }
  function createActRuntimeSnapshot(eraVars, derivedActState = null) { return ACT_RUNTIME.createActRuntimeSnapshot(eraVars, derivedActState); }
  function getAssetDeckModuleApi() { return ACT_RUNTIME.getAssetDeckModuleApi(); }
  function advanceActToNextNode(actState, config, heroState = {}, contextInput = {}) { return ACT_RUNTIME.advanceActToNextNode(actState, config, heroState, contextInput); }
  function adjustNarrativeTensionInternal(delta) { return ACT_RUNTIME.adjustNarrativeTensionInternal(delta); }
  function setNarrativeTensionInternal(value) { return ACT_RUNTIME.setNarrativeTensionInternal(value); }
  function resetNarrativeTensionInternal() { return ACT_RUNTIME.resetNarrativeTensionInternal(); }
  function getWorldClockPressure(eraVars) { return ACT_RUNTIME.getWorldClockPressure(eraVars); }
  function pickWorldClockAdvanceTier(pressure) { return ACT_RUNTIME.pickWorldClockAdvanceTier(pressure); }
  function buildWorldClockAdvanceSuggestion(pressure) { return ACT_RUNTIME.buildWorldClockAdvanceSuggestion(pressure); }
  function adjustClockPressureInternal(delta) { return ACT_RUNTIME.adjustClockPressureInternal(delta); }
  function setClockPressureInternal(value) { return ACT_RUNTIME.setClockPressureInternal(value); }
  function resetClockPressureInternal() { return ACT_RUNTIME.resetClockPressureInternal(); }
  function buildEncounterContextFromEraVars(eraVars) { return ACT_RUNTIME.buildEncounterContextFromEraVars(eraVars); }
  async function resolvePendingActAdvance(eraVars, options = {}) { return await ACT_RUNTIME.resolvePendingActAdvance(eraVars, options); }
  async function applyFloorProgressDelta(messageId, message, options = {}) { return await ACT_RUNTIME.applyFloorProgressDelta(messageId, message, options); }
  async function advanceWorldClock(steps) { return await ACT_RUNTIME.advanceWorldClock(steps); }
  async function setWorldClock(input) { return await ACT_RUNTIME.setWorldClock(input); }

  function areActSnapshotsEqual(before, after) {
    if (!before || !after) return false;
    return JSON.stringify(before) === JSON.stringify(after);
  }

  function getArrayDiff(nextValues, prevValues) {
    const previous = new Set(Array.isArray(prevValues) ? prevValues : []);
    return (Array.isArray(nextValues) ? nextValues : []).filter(value => !previous.has(value));
  }

  function getActResultType(before, after) {
    if (!before || !after) return '';
    if (after.nodeIndex > before.nodeIndex) return 'node_advance';
    if (after.phaseIndex > before.phaseIndex || after.stage !== before.stage) return 'phase_advance';
    return '';
  }

  function diffNumberMap(beforeMap, afterMap) {
    const before = (beforeMap && typeof beforeMap === 'object') ? beforeMap : {};
    const after = (afterMap && typeof afterMap === 'object') ? afterMap : {};
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    const delta = {};
    for (const key of keys) {
      const diff = (Number(after[key]) || 0) - (Number(before[key]) || 0);
      if (diff !== 0) delta[key] = diff;
    }
    return delta;
  }

  function diffManaByRoster(beforeMap, afterMap) {
    return diffNumberMap(beforeMap, afterMap);
  }

  function diffStringArray(beforeValues, afterValues) {
    const previous = new Set(Array.isArray(beforeValues) ? beforeValues : []);
    return (Array.isArray(afterValues) ? afterValues : []).filter(value => !previous.has(value));
  }

  function parseUpdateVariableJsonPatch(content) {
    const text = typeof content === 'string' ? content : '';
    if (!text.includes('<UpdateVariable>') || !text.includes('<JSONPatch>')) return [];
    const match = text.match(/<JSONPatch>\s*([\s\S]*?)\s*<\/JSONPatch>/i);
    if (!match) return [];
    try {
      const parsed = JSON.parse(match[1].trim());
      return Array.isArray(parsed) ? parsed.filter(item => item && typeof item === 'object') : [];
    } catch (_) {
      return [];
    }
  }

  function hasCompleteBattleTag(content) {
    const text = typeof content === 'string' ? content : '';
    const regex = new RegExp(`<${BATTLE_TAG}>[\\s\\S]*?<\\/${BATTLE_TAG}>`, 'i');
    return regex.test(text);
  }

  function extractTransitionRequestTargetFromPatches(patches) {
    const items = Array.isArray(patches) ? patches : [];
    for (const patch of items) {
      if (!patch || typeof patch !== 'object') continue;
      if (String(patch.path || '').trim() !== '/world/act/transitionRequestTarget') continue;
      return typeof patch.value === 'string' ? patch.value.trim() : '';
    }
    return null;
  }

  function isRelationshipPatchPath(path) {
    const normalizedPath = typeof path === 'string' ? path.trim() : '';
    return normalizedPath.startsWith('/hero/relationship/');
  }

  function getNonRelationshipPatchesFromContent(content) {
    return parseUpdateVariableJsonPatch(content).filter(patch => !isRelationshipPatchPath(patch.path));
  }

  const RESULT_RUNTIME = (typeof window !== 'undefined' ? window : globalThis).ACE0TavernResultRuntime?.create({
    pluginName: PLUGIN_NAME,
    tags: { BATTLE_TAG, FRONTEND_TAG, ACT_RESULT_TAG },
    constants: { ACT_RESOURCE_KEYS, ACT_PHASE_LABELS },
    deps: {
      getActRuntimeConfig,
      getActNodeRuntime,
      diffManaByRoster,
      diffNumberMap,
      diffStringArray,
      getArrayDiff,
      getActResultType,
      getEraVars,
      resolvePendingActAdvance,
      synchronizeActCharacterState,
      createActRuntimeSnapshot,
      getAssetDeckModuleApi,
      getNonRelationshipPatchesFromContent,
      areActSnapshotsEqual,
      getPendingActBaselineSnapshot: () => pendingActBaselineSnapshot,
      setPendingActBaselineSnapshot: (snapshot) => { pendingActBaselineSnapshot = snapshot; },
      resolveBattleData,
      buildCompleteGameConfig
    }
  }) || {};

  async function appendActResultIfNeeded(content, options = {}) {
    return await RESULT_RUNTIME.appendActResultIfNeeded(content, options);
  }

  async function processBattleContent(content) {
    return await RESULT_RUNTIME.processBattleContent(content);
  }

  /**
   * 生成前：读取 MVU 变量 → 注入 hero 状态摘要到 AI 上下文
   */
  async function handleGenerationBefore(options = {}) {
    if (options.dryRun === true) {
      console.log(`${PLUGIN_NAME} dryRun 生成前注入跳过`);
      return;
    }

    try {
      const expansionPromptState = getExpansionPromptStateStore();

      try {
        uninjectPrompts([
          PRIMARY_CONTEXT_INJECT_ID,
          HERO_INJECT_ID,
          REL_STATE_INJECT_ID,
          ACT_STATE_INJECT_ID,
          ACT_NARRATIVE_INJECT_ID,
          ACT_TRANSITION_INJECT_ID,
          ACT_PACING_INJECT_ID,
          ACT_PHASE_PLAN_CONFIRMED_INJECT_ID,
          ACT_COMBAT_REQUEST_INJECT_ID,
          // 首见帧注入 id 必须每轮清理：本轮若 pending 空（楼层已前进/被闸门清掉），
          // 不会再 push 新 first_meet prompt；若这里不 uninject 旧注入，
          // 酒馆会保留上轮的 first_meet 记录形成幽灵残留。
          ACT_FIRST_MEET_INJECT_ID,
          ACT_PRE_SIGNAL_INJECT_ID,
          WORLD_CONTEXT_INJECT_ID,
          LOCATION_DOC_INJECT_ID,
          ...Object.values(CHAR_DOC_INJECT_IDS),
          ...expansionPromptState.ids
        ]);
      } catch (_) { /* ignore */ }

      const syncedState = await synchronizeActCharacterState(await getEraVars(), { persist: false });
      const eraVars = syncedState.eraVars;
      const currentWorldClock = getWorldClock(eraVars);
      if (lastObservedWorldClock && !isSameWorldClock(lastObservedWorldClock, currentWorldClock)) {
        if (getWorldClockPressure(eraVars) !== 0) {
          if (eraVars.world && typeof eraVars.world === 'object') {
            eraVars.world.clockPressure = 0;
          }
        }
      }
      lastObservedWorldClock = { day: currentWorldClock.day, phase: currentWorldClock.phase };
      pendingActBaselineSnapshot = createActRuntimeSnapshot(eraVars, syncedState.derived);
      const heroSummary = buildHeroSummary(eraVars);
      const relationState = buildRelationshipStateSummary(eraVars);
      const worldContext = buildWorldContextSummary(eraVars);
      const locationDoc = buildLocationDocSummary(eraVars);
      const activeFirstMeetHintsForTurn = getActiveFirstMeetHintsForCurrentPhase(eraVars, syncedState.derived);
      const nodeFirstMeetKeysForTurn = Object.keys(
        syncedState.derived?.encounterNodeFirstMeetHints && typeof syncedState.derived.encounterNodeFirstMeetHints === 'object'
          ? syncedState.derived.encounterNodeFirstMeetHints
          : {}
      );
      const preSignalHintsForTurn = syncedState.derived?.encounterPreSignalHints && typeof syncedState.derived.encounterPreSignalHints === 'object'
        ? syncedState.derived.encounterPreSignalHints
        : {};

      const charDocPrompts = await buildCharacterPromptInjections(eraVars, nodeFirstMeetKeysForTurn);
      const actNarrativePrompts = buildActNarrativePrompts(eraVars, syncedState.derived, activeFirstMeetHintsForTurn, preSignalHintsForTurn);
      const expansionPrompts = buildExpansionPromptInjections(eraVars);
      const prompts = [];
      const primaryContextContent = [
        worldContext,
        heroSummary,
        relationState
      ].filter(content => typeof content === 'string' && content.trim()).join('\n\n');

      if (primaryContextContent) {
        prompts.push({
          id: PRIMARY_CONTEXT_INJECT_ID,
          position: 'in_chat',
          depth: 1,
          role: 'system',
          content: primaryContextContent,
          should_scan: false
        });
      }

      if (locationDoc) {
        prompts.push({
          id: LOCATION_DOC_INJECT_ID,
          position: 'in_chat',
          depth: 2,
          role: 'system',
          content: locationDoc,
          should_scan: false
        });
      }

      prompts.push(...actNarrativePrompts);
      prompts.push(...charDocPrompts);
      prompts.push(...expansionPrompts);

      if (prompts.length <= 0) {
        console.warn(`${PLUGIN_NAME} 没有可注入 prompt，跳过`);
        return;
      }

      const normalizedPrompts = prompts.map(prompt => ({
        ...prompt,
        content: replaceHeroPromptMacro(prompt.content)
      }));

      expansionPromptState.ids = expansionPrompts.map(prompt => prompt.id);

      injectPrompts(normalizedPrompts);
      const hasPendingTransitionPrompt = normalizedPrompts.some((prompt) => prompt.id === ACT_TRANSITION_INJECT_ID);
      if (hasPendingTransitionPrompt) {
        if (eraVars?.world?.act && typeof eraVars.world.act === 'object') {
          eraVars.world.act.pendingTransitionPrompt = '';
        }
      }
      console.log(`${PLUGIN_NAME} world/location/hero/relationship/character docs 已注入 AI 上下文`);
    } catch (e) {
      console.error(`${PLUGIN_NAME} 注入失败:`, e);
    }
  }

  // ==========================================================
  //  B. 解析 AI 输出中的 <ACE0_BATTLE> 标签
  // ==========================================================

  /**
   * 从消息文本中提取 <ACE0_BATTLE> JSON
   * @param {string} content - 消息正文
   * @returns {object|null} - 解析后的战局 JSON
   */
  // ==========================================================
  //  D-1. 优选路径：mag_before_message_update
  //       AI 输出了 <UpdateVariable> 时触发，修改 event.message_content
  // ==========================================================

  async function handleBeforeMessageUpdate(event) {
    let content = event?.message_content || '';
    let changed = false;
    const transitionRequestTarget = extractTransitionRequestTargetFromPatches(parseUpdateVariableJsonPatch(content));
    if (transitionRequestTarget !== null) {
      ACT_RUNTIME.setLatchedTransitionRequestTarget(transitionRequestTarget);
    }

    // Battle 处理（原就逻辑）
    if (hasCompleteBattleTag(content) && !content.includes(`<${FRONTEND_TAG}>`)) {
      try {
        console.log(`${PLUGIN_NAME} [before_message_update] 检测到 ${BATTLE_TAG}，处理中...`);
        const result = await processBattleContent(content);
        if (result) {
          content = result.content;
          changed = true;
          console.log(`${PLUGIN_NAME} [before_message_update] 游戏前端已注入`);
        }
      } catch (e) {
        console.error(`${PLUGIN_NAME} [before_message_update] 处理失败:`, e);
      }
    }

    if (changed) {
      event.message_content = content;
    }
  }

  // ==========================================================
  //  D-2. 兆底路径：CHARACTER_MESSAGE_RENDERED
  //       MVU 完成所有写入后触发，检查并补注入
  // ==========================================================

  async function handleMessageRendered(messageId, options = {}) {
    if (isProcessing) return;

    try {
      const messages = getChatMessages(messageId);
      if (!messages || messages.length === 0) return;

      const msg = messages[0];
      const content = msg.message || '';
      let nextContent = content;
      let changed = false;
      const floorKey = makeMessageFloorKey(messageId);
      let workingEraVars = await getMessageEraVars(messageId);
      const hasReplayBase = isPlainObject(workingEraVars);
      const renderOperationId = `render:${messageId}:state`;
      const legacyRenderOperationIds = [
        `render:${messageId}:floor-progress`,
        `render:${messageId}:battle-result`,
        `render:${messageId}:act-result`
      ];
      const hasExistingRenderReplay = hasAce0ReplayBlock(nextContent, renderOperationId)
        || legacyRenderOperationIds.some(operationId => hasAce0ReplayBlock(nextContent, operationId));
      const replayPatches = [];
      const queueReplayPatches = (patches) => {
        if (Array.isArray(patches) && patches.length) replayPatches.push(...patches);
      };

      isProcessing = true;

      if (hasReplayBase && options.applyFloorProgress === true) {
        const rawAct = workingEraVars?.world?.act;
        const hasPendingPhaseAdvance = isPlainObject(rawAct)
          && Math.max(0, Math.round(Number(rawAct.phase_advance) || 0)) > 0;
        if (!hasPendingPhaseAdvance && !hasExistingRenderReplay) {
          const progressResult = await applyFloorProgressDelta(messageId, msg, {
            eraVars: workingEraVars,
            persist: false
          });
          if (progressResult?.changed && progressResult.eraVars) {
            const patches = buildReplayPatchesFromEraVars(workingEraVars, progressResult.eraVars, [
              '/world/act/narrativeTension',
              '/world/clockPressure'
            ]);
            queueReplayPatches(patches);
            workingEraVars = progressResult.eraVars;
          }
        }
      }

      if (hasReplayBase && hasCompleteBattleTag(nextContent) && !nextContent.includes(`<${FRONTEND_TAG}>`)) {
        console.log(`${PLUGIN_NAME} [rendered_fallback] 检测到未处理的 ${BATTLE_TAG}，补注入...`);
        const battleResult = await processBattleContent(nextContent);
        if (battleResult) {
          nextContent = battleResult.content;
          changed = true;
        }
      }

      if (hasReplayBase && hasCompleteBattleTag(nextContent)) {
        if (!hasExistingRenderReplay) {
          const act = getWorldActState(workingEraVars);
          const currentTension = Math.max(0, Math.min(100, Math.round(Number(act.narrativeTension) || 0)));
          const nextTension = Math.max(0, Math.min(100, currentTension + Math.round(Number(TENSION_DELTA.BATTLE_RESULT) || 0)));
          if (nextTension !== currentTension) {
            const nextEraVars = {
              ...(workingEraVars || {}),
              world: {
                ...(workingEraVars?.world || {}),
                act: {
                  ...act,
                  narrativeTension: nextTension
                }
              }
            };
            const patches = buildReplayPatchesFromEraVars(workingEraVars, nextEraVars, ['/world/act/narrativeTension']);
            queueReplayPatches(patches);
            workingEraVars = nextEraVars;
          }
        }
      }

      if (hasReplayBase) {
        const actResult = await appendActResultIfNeeded(nextContent, {
          eraVars: workingEraVars,
          persist: false,
          floorKey
        });
        if (actResult.changed) {
          nextContent = actResult.content;
          changed = true;
          console.log(`${PLUGIN_NAME} [rendered_fallback] ACT 结算回执已注入到消息 #${messageId}`);
        }
        if (actResult.stateChanged && actResult.eraVars && !hasExistingRenderReplay) {
          const patches = buildReplayPatchesFromEraVars(workingEraVars, actResult.eraVars);
          queueReplayPatches(patches);
          workingEraVars = actResult.eraVars;
        }
      } else {
        console.warn(`${PLUGIN_NAME} message:${messageId} 缺少完整 MVU 基底，已跳过 ACE0 可重演变量写入。需要先重演/恢复变量。`);
      }

      if (changed) {
        await setChatMessages([{
          message_id: messageId,
          message: nextContent
        }], { refresh: 'affected' });
      }

      const normalizedReplayPatches = normalizeReplayPatches(replayPatches);
      if (normalizedReplayPatches.length) {
        const result = await commitAce0ReplayPatch({
          messageId,
          floorKey,
          operationId: renderOperationId,
          replaceOperationIds: legacyRenderOperationIds,
          patches: normalizedReplayPatches
        });
        if (!result.ok) {
          console.warn(`${PLUGIN_NAME} ACE0_REPLAY ${renderOperationId} 写入失败: ${result.reason || 'unknown'}`);
        }
      }

      isProcessing = false;
    } catch (e) {
      console.error(`${PLUGIN_NAME} [rendered_fallback] 处理失败:`, e);
      isProcessing = false;
    }
  }

  // ==========================================================
  //  E+F. 资金结算 + 入队补全 → 已迁移到 acezero-schema.js
  //  由 MVU-zod schema 的 .transform() 自动处理
  //  reconcileFunds: funds_up/funds_down → hero.funds（归零）
  //  cast/roster 补全：在 schema transform 中自动处理
  // ==========================================================

  // ==========================================================
  //  事件绑定
  // ==========================================================

  function resetState(reason) {
    console.log(`${PLUGIN_NAME} ${reason} -> 重置状态`);
    isProcessing = false;
    pendingActBaselineSnapshot = null;
    if (ACT_RUNTIME && typeof ACT_RUNTIME.resetState === 'function') ACT_RUNTIME.resetState();
  }

  eventOn('CHAT_CHANGED', () => resetState('切换对话'));
  eventOn('message_swiped', async (messageId) => {
    resetState('消息重骰');
    setTimeout(() => handleMessageRendered(messageId, { applyFloorProgress: false }), 1500);
  });
  eventOn('message_edited', async (messageId) => {
    resetState('消息编辑');
    setTimeout(() => handleMessageRendered(messageId, { applyFloorProgress: false }), 1500);
  });
  // message_updated 不监听 — 太频繁（MVU 每次 setChatMessages 都触发）
  // 手动编辑后的重注入已由 message_edited 覆盖

  // 生成前：注入 hero 状态摘要
  eventOn('GENERATION_AFTER_COMMANDS', async (type, option, dryRun) => {
    await handleGenerationBefore({
      dryRun: dryRun === true || option?.dryRun === true || option?.dry_run === true
    });
  });

  // 优选路径：MVU 消息更新前拦截（AI 同时输出 UpdateVariable 时）
  //   修改 event.message_content，由 MVU 统一写入
  eventOn('mag_before_message_update', async (event) => {
    await handleBeforeMessageUpdate(event);
  });

  // 兜底路径 A：消息渲染完成后检查
  eventOn('character_message_rendered', async (messageId) => {
    await handleMessageRendered(messageId, { applyFloorProgress: true });
  });

  // 兜底路径 B：消息接收后延迟检查（等 MVU 处理完）
  eventOn('message_received', async (messageId) => {
    setTimeout(() => handleMessageRendered(messageId, { applyFloorProgress: false }), 1500);
  });

  // ==========================================================
  //  扫描并注入：遍历所有消息，为有 ACE0_BATTLE 但无 ACE0_FRONTEND 的消息补注入
  // ==========================================================

  async function scanAndInject() {
    const lastId = getLastMessageId();
    let injected = 0;
    for (let i = lastId; i >= 0; i--) {
      try {
        const messages = getChatMessages(i);
        if (!messages || messages.length === 0) continue;
        const msg = messages[0];
        const content = msg.message || '';
        if (!hasCompleteBattleTag(content)) continue;
        if (content.includes(`<${FRONTEND_TAG}>`)) continue;

        console.log(`${PLUGIN_NAME} [scan] 消息 #${i} 需要注入`);
        const result = await processBattleContent(content);
        if (result) {
          await setChatMessages([{
            message_id: i,
            message: result.content
          }], { refresh: 'affected' });
          injected++;
          console.log(`${PLUGIN_NAME} [scan] 消息 #${i} 注入完成`);
        }
      } catch (e) {
        console.error(`${PLUGIN_NAME} [scan] 消息 #${i} 处理失败:`, e);
      }
    }
    console.log(`${PLUGIN_NAME} [scan] 扫描完成，共注入 ${injected} 条消息`);
    return injected;
  }

  // ==========================================================
  //  全局 API
  // ==========================================================

  const hostRoot = getAce0HostRoot();
  installActModuleHostBridge();

  hostRoot.ACE0Plugin = {
    getEraVars,
    commitReplayPatch: commitAce0ReplayPatch,

    getDefaultActState(actId) {
      return getActDefaultStateFromModule(actId);
    },

    normalizeActState(rawActState) {
      const actModule = getActModuleApi();
      if (!actModule || typeof actModule.normalizeActState !== 'function') return null;
      try {
        return actModule.normalizeActState(rawActState);
      } catch (error) {
        console.warn('[ACE0 ACT] ACE0Plugin.normalizeActState failed:', error);
        return null;
      }
    },

    createFrontendSnapshot(options) {
      const actModule = getActModuleApi();
      if (!actModule || typeof actModule.createFrontendSnapshot !== 'function') return null;
      try {
        return actModule.createFrontendSnapshot(options);
      } catch (error) {
        console.warn('[ACE0 ACT] ACE0Plugin.createFrontendSnapshot failed:', error);
        return null;
      }
    },

    async syncActState() {
      const result = await synchronizeActCharacterState(await getEraVars(), { persist: false });
      return {
        changed: result.changed,
        derived: result.derived
      };
    },

    // 路线选择 API：由结算卡 / Dashboard / 外部 UI 调用。
    // 只在 stage=route 且 nodeId 为合法下一节点时生效，避免误触。
    // 返回 { ok, reason?, nextNodeIndex?, nextNodeId? }。
    async chooseActRoute(nodeId, options = {}) {
      const targetNodeId = typeof nodeId === 'string' ? nodeId.trim() : '';
      if (!targetNodeId) return { ok: false, reason: 'invalid_node_id' };

      const messageId = resolveReplayMessageId(options);
      const floorKey = makeMessageFloorKey(messageId);
      if (!floorKey) return { ok: false, reason: 'missing_message_id' };
      if (options.floorKey && String(options.floorKey).trim() !== floorKey) {
        return { ok: false, reason: 'floor_key_mismatch', floorKey, expectedFloorKey: String(options.floorKey).trim() };
      }
      const eraVars = await getMessageEraVars(messageId);
      if (!eraVars) return { ok: false, reason: 'mvu_replay_missing_base', floorKey };
      const act = getWorldActState(eraVars);
      if (act.stage !== 'route') return { ok: false, reason: 'not_in_route_stage' };

      const config = getActRuntimeConfig(act.id);
      if (!config) return { ok: false, reason: 'no_chapter_config' };

      const currentNodeId = act.route_history[act.nodeIndex - 1];
      const currentNodeRuntime = getActNodeRuntime(config, currentNodeId);
      const transition = currentNodeRuntime?.next || { mode: 'none' };
      const jumpOptionsResult = act.vision?.jumpReady === true
        ? runActModuleMethod('getJumpRouteOptions', config, act)
        : { ok: false, value: [] };
      const jumpOptions = jumpOptionsResult.ok && Array.isArray(jumpOptionsResult.value)
        ? jumpOptionsResult.value
        : [];
      const isJumpRoute = jumpOptions.includes(targetNodeId);
      const allowed = isJumpRoute
        ? jumpOptions
        : transition.mode === 'choice' && Array.isArray(transition.options)
        ? transition.options
        : (transition.mode === 'forced' && typeof transition.nodeId === 'string' ? [transition.nodeId] : []);
      if (!allowed.includes(targetNodeId)) {
        return { ok: false, reason: 'node_not_allowed' };
      }

      // 等价于 act-plugin 里 forced 分支的两步：先 push 再 advance。
      // 幂等：已经 push 过就不再 push，防抖（比如双击）。
      const actState = JSON.parse(JSON.stringify(act));
      if (actState.route_history.length < actState.nodeIndex + 1) {
        actState.route_history.push(targetNodeId);
      }
      const advanced = advanceActToNextNode(actState, config, eraVars.hero || {}, buildEncounterContextFromEraVars(eraVars));
      if (!advanced) {
        // advanceActToNextNode 在 route_history 长度不够时会返回 false —— 上面已补，理论上不该到
        return { ok: false, reason: 'advance_failed' };
      }
      if (isJumpRoute) {
        actState.vision = normalizeActVisionState(actState.vision);
        actState.vision.jumpReady = false;
        actState.vision.pendingReplace = null;
      }
      const nextEraVars = {
        ...(eraVars || {}),
        world: {
          ...(eraVars?.world || {}),
          act: actState
        }
      };
      const patches = buildReplayPatchesFromEraVars(eraVars, nextEraVars, ['/world/act']);
      const replayResult = await commitAce0ReplayPatch({
        messageId,
        floorKey,
        operationId: `act-route:${messageId}:${targetNodeId}`,
        patches
      });
      if (!replayResult.ok) {
        return { ok: false, reason: replayResult.reason || 'mvu_replay_failed', floorKey };
      }
      refreshDashboardUiAfterExternalWrite();
      return {
        ok: true,
        nextNodeIndex: actState.nodeIndex,
        nextNodeId: actState.route_history[actState.nodeIndex - 1] || null
      };
    },

    // 契约卡选择 API：由 ACT_RESULT 卡片直接调用。
    // 只处理当前 pending_offer 的 choose_card，不打开 Dashboard 悬浮窗。
    async chooseAssetCard(choiceIndex, slotType = 'general', clearKey = '', options = {}) {
      const index = Math.max(0, Math.round(Number(choiceIndex) || 0));
      const normalizedSlot = String(slotType || 'general').trim().toLowerCase() === 'void' ? 'void' : 'general';
      const requestedClearKey = String(clearKey || '').trim();
      const assetDeckModule = getAssetDeckModuleApi();
      if (!assetDeckModule || typeof assetDeckModule.applyAssetDeckCommand !== 'function') {
        return { ok: false, reason: 'asset_runtime_missing' };
      }

      const messageId = resolveReplayMessageId(options);
      const floorKey = makeMessageFloorKey(messageId);
      if (!floorKey) return { ok: false, reason: 'missing_message_id' };
      if (options.floorKey && String(options.floorKey).trim() !== floorKey) {
        return { ok: false, reason: 'floor_key_mismatch', floorKey, expectedFloorKey: String(options.floorKey).trim() };
      }
      const eraVars = await getMessageEraVars(messageId);
      if (!eraVars) return { ok: false, reason: 'mvu_replay_missing_base', floorKey };
      const currentAssetDeck = typeof assetDeckModule.normalizeAssetDeckState === 'function'
        ? assetDeckModule.normalizeAssetDeckState(eraVars?.world?.assetDeck)
        : (eraVars?.world?.assetDeck || {});
      if (!currentAssetDeck?.pending_offer) {
        return { ok: false, reason: 'no_pending_offer' };
      }
      const currentOfferId = typeof currentAssetDeck.pending_offer.id === 'string' ? currentAssetDeck.pending_offer.id : '';
      if (requestedClearKey && currentOfferId && requestedClearKey !== currentOfferId) {
        return { ok: false, reason: 'stale_asset_offer', clearKey: requestedClearKey, offerId: currentOfferId };
      }

      let commandResult;
      try {
        commandResult = assetDeckModule.applyAssetDeckCommand(currentAssetDeck, {
          kind: 'choose_card',
          payload: {
            choiceIndex: index,
            slotType: normalizedSlot
          }
        }, {
          seed: `act-result:${currentOfferId || requestedClearKey || 'offer'}:${index}:${normalizedSlot}`
        });
      } catch (error) {
        return { ok: false, reason: 'asset_command_error', error: error?.message || String(error) };
      }

      if (!commandResult?.assetDeck) {
        return {
          ok: false,
          reason: commandResult?.code || 'asset_command_failed'
        };
      }
      if (commandResult.ok !== true) {
        return {
          ok: false,
          reason: commandResult.code || 'asset_command_failed',
          code: commandResult.code || ''
        };
      }

      const nextWorld = { assetDeck: commandResult.assetDeck };
      const offerClearKey = requestedClearKey || currentOfferId;
      if (offerClearKey) {
        const rawAct = eraVars?.world?.act;
        const actState = rawAct && typeof rawAct === 'object' && !Array.isArray(rawAct)
          ? JSON.parse(JSON.stringify(rawAct))
          : null;
        if (actState) {
          const history = Array.isArray(actState.resolutionHistory)
            ? actState.resolutionHistory.map(compactActResolutionHistoryItem).filter(Boolean).slice(-64)
            : [];
          const alreadyRecorded = history.some(item =>
            item && typeof item === 'object' &&
            (item.protocol === 'ace0.assetOfferClear.v1' || item.type === 'asset_offer_clear') &&
            String(item.clearKey || item.offerId || '') === offerClearKey
          );
          if (!alreadyRecorded) {
            history.push({
              id: `asset-offer-clear:${offerClearKey}`,
              protocol: 'ace0.assetOfferClear.v1',
              type: 'asset_offer_clear',
              status: 'resolved',
              clearKey: offerClearKey,
              offerId: currentOfferId || offerClearKey,
              outcome: commandResult.code || 'asset_card_chosen'
            });
          }
          actState.resolutionHistory = history.slice(-64);
          nextWorld.act = actState;
        }
      }

      const nextEraVars = {
        ...(eraVars || {}),
        world: {
          ...(eraVars?.world || {}),
          assetDeck: nextWorld.assetDeck,
          ...(nextWorld.act ? { act: nextWorld.act } : {})
        }
      };
      const patches = buildReplayPatchesFromEraVars(eraVars, nextEraVars, [
        '/world/assetDeck',
        '/world/act'
      ]);
      const replayResult = await commitAce0ReplayPatch({
        messageId,
        floorKey,
        operationId: `asset-choice:${messageId}:${offerClearKey || currentOfferId || requestedClearKey || index}`,
        patches
      });
      if (!replayResult.ok) {
        return { ok: false, reason: replayResult.reason || 'mvu_replay_failed', floorKey };
      }
      refreshDashboardUiAfterExternalWrite();

      return {
        ok: commandResult.ok === true,
        code: commandResult.code || '',
        pendingReplace: !!commandResult.assetDeck.pending_replace,
        clearKey: offerClearKey,
        offerId: currentOfferId || offerClearKey,
        selectedCardId: typeof commandResult.card?.cardId === 'string'
          ? commandResult.card.cardId
          : (typeof commandResult.consumed?.cardId === 'string' ? commandResult.consumed.cardId : ''),
        selectedInstanceId: typeof commandResult.card?.instanceId === 'string'
          ? commandResult.card.instanceId
          : (typeof commandResult.consumed?.instanceId === 'string' ? commandResult.consumed.instanceId : ''),
        assetDeck: commandResult.assetDeck
      };
    },

    async getActStateSummary() {
      const result = await synchronizeActCharacterState(await getEraVars());
      return buildActStateSummary(result.eraVars, result.derived);
    },

    async getGameConfig() {
      const vars = await getEraVars();
      return buildCompleteGameConfig(vars, {});
    },

    getExpansionRegistry,

    async getExpansionSummary() {
      const vars = await getEraVars();
      const registry = getExpansionRegistry();
      const installed = registry && typeof registry.getInstalled === 'function'
        ? registry.getInstalled()
        : [];
      const active = registry && typeof registry.getActive === 'function'
        ? registry.getActive(vars)
        : [];

      return {
        installed: installed.map(expansion => expansion.id),
        active: active.map(expansion => expansion.id),
        state: vars?.world?.expansion_state || { activeMajor: '', activeLight: [] }
      };
    },

    async inspectActiveExpansionModules() {
      const vars = await getEraVars();
      const registry = getExpansionRegistry();
      if (!registry || typeof registry.collectHookEntries !== 'function') {
        return {
          state: vars?.world?.expansion_state || { activeMajor: '', activeLight: [] },
          prompts: [],
          dashboard: [],
          schema: [],
          characters: [],
          battle: []
        };
      }

      return {
        state: vars?.world?.expansion_state || { activeMajor: '', activeLight: [] },
        prompts: registry.collectPromptInjections({ eraVars: vars }),
        dashboard: registry.collectHookEntries('dashboard', { eraVars: vars }),
        schema: registry.collectHookEntries('schema', { eraVars: vars }),
        characters: registry.collectHookEntries('characters', { eraVars: vars }),
        battle: registry.collectHookEntries('battle', { eraVars: vars })
      };
    },

    async setActiveMajorExpansion(expansionId) {
      const normalizedId = typeof expansionId === 'string' ? expansionId.trim() : '';
      await updateEraVars({
        world: {
          expansion_state: {
            activeMajor: normalizedId
          }
        }
      });
      return true;
    },

    // 扫描所有消息，为有 ACE0_BATTLE 但无 ACE0_FRONTEND 的消息补注入
    scanAndInject,

    // 手动触发战局（支持 character/runner/kernel/直写四种格式）
    async triggerBattle(rawBattleData) {
      const eraVars = await getEraVars();
      const resolved = resolveBattleData(rawBattleData);
      const completeConfig = buildCompleteGameConfig(eraVars, resolved);

      const frontendPayload = `<${FRONTEND_TAG}>\n${JSON.stringify(completeConfig)}\n</${FRONTEND_TAG}>`;
      await createChatMessages([{
        role: 'assistant',
        message: frontendPayload
      }]);

      return completeConfig;
    },

    // 获取主角在队角色列表（从 MVU 变量，按 cast.inParty 过滤）
    async getHeroCharacters() {
      const vars = await getEraVars();
      if (!vars || !vars.hero) return [];
      return _getHeroCharNames(vars.hero).map(name => ({
        name,
        ...getCastNode(vars.hero, name),
        ...getRosterNode(vars.hero, name)
      }));
    },

    // 获取完整队伍花名册（含未入队角色）
    async getPartyRoster() {
      const vars = await getEraVars();
      if (!vars || !vars.hero) return [];
      return _getPartyRoster(vars.hero);
    },

    async setCharacterState(charKey, patch) {
      const key = String(charKey || '').toUpperCase();
      if (!NON_PLAYER_CHARACTER_KEYS.includes(key)) {
        console.warn(`${PLUGIN_NAME} 未知角色: ${charKey}`);
        return false;
      }

      const normalizedPatch = { ...(patch || {}) };
      if (normalizedPatch.present === true) {
        normalizedPatch.activated = true;
        normalizedPatch.introduced = true;
      }
      if (normalizedPatch.inParty === true) {
        normalizedPatch.activated = true;
        normalizedPatch.introduced = true;
      }
      await updateEraVars({
        hero: {
          cast: {
            [key]: normalizedPatch
          }
        }
      });

      return true;
    },

    async introduceCharacter(charKey, options = {}) {
      return this.setCharacterState(charKey, {
        activated: true,
        introduced: true,
        present: options.present ?? true
      });
    },

    async setCharacterPresent(charKey, present) {
      if (present) {
        return this.setCharacterState(charKey, {
          activated: true,
          introduced: true,
          present: true
        });
      }
      return this.setCharacterState(charKey, { present: false });
    },

    async setCharacterActivated(charKey, activated) {
      return this.setCharacterState(charKey, {
        activated: !!activated
      });
    },

    async addCharacterToParty(charKey, options = {}) {
      const key = String(charKey || '').toUpperCase();
      if (!NON_PLAYER_CHARACTER_KEYS.includes(key)) {
        console.warn(`${PLUGIN_NAME} 未知角色: ${charKey}`);
        return false;
      }

      const vars = await getEraVars();
      const hero = vars?.hero || {};
      const roster = getHeroRoster(hero);
      const patch = {
        activated: true,
        introduced: true,
        inParty: true
      };

      if (typeof options.present === 'boolean') patch.present = options.present;

      const heroPatch = {
        cast: {
          [key]: patch
        }
      };

      if (!roster[key]) {
        heroPatch.roster = {
          [key]: {
            level: 1,
            mana: 40,
            maxMana: 40
          }
        };
      }

      await updateEraVars({ hero: heroPatch });
      return true;
    },

    async removeCharacterFromParty(charKey) {
      return this.setCharacterState(charKey, {
        inParty: false
      });
    },

    CHARACTER_PROMPT_DOCS,
    getCharacterPromptDoc,

    clearFullDocCache() {
      return CHARACTER_RUNTIME.clearFullDocCache();
    },

    async debugCharacterPrompt(charKey) {
      const vars = await getEraVars();
      const hero = vars?.hero || {};
      const key = String(charKey || '').toUpperCase();
      return await getCharacterPromptDoc(key, getCastNode(hero, key));
    },

    // NPC 组装
    assembleNPC,
    assembleFromRunner,
    assembleNamedNPC,
    resolveBattleData,

    // 三维度配置表
    NPC: {
      AI_KERNELS,
      RPG_TEMPLATES,
      MOOD_MODIFIERS,
      RUNNER_PRESETS,
      NAMED_NPC_PRESETS
    },

    // 角色档案
    CHARACTERS: NAMED_CHARACTERS,

    // 原有表
    TABLES: {
      UNIVERSAL_SKILLS,
      VANGUARD_TRAIT: VANGUARD_TRAIT_UNLOCK,
      REARGUARD_TRAIT: REARGUARD_TRAIT_UNLOCK,
      VANGUARD_ATTRS: VANGUARD_ATTRS_BY_LEVEL,
      REARGUARD_ATTRS: REARGUARD_ATTRS_BY_LEVEL,
      MANA: MANA_BY_LEVEL
    },

    deriveSkillsFromAttrs,
    getCharAttrs,
    getCharTrait,

    // 阶段 4：情节张力 API
    adjustNarrativeTension(delta) { return adjustNarrativeTensionInternal(delta); },
    setNarrativeTension(v) { return setNarrativeTensionInternal(v); },
    resetNarrativeTension() { return resetNarrativeTensionInternal(); },
    async getNarrativeTension() {
      const eraVars = (typeof getEraVars === 'function' ? await getEraVars() : null) || {};
      const act = getWorldActState(eraVars);
      return Math.max(0, Math.min(100, Math.round(Number(act.narrativeTension) || 0)));
    },
    TENSION_DELTA: Object.assign({}, TENSION_DELTA),
    adjustClockPressure(delta) { return adjustClockPressureInternal(delta); },
    setClockPressure(v) { return setClockPressureInternal(v); },
    resetClockPressure() { return resetClockPressureInternal(); },
    async getClockPressure() {
      const eraVars = (typeof getEraVars === 'function' ? await getEraVars() : null) || {};
      return getWorldClockPressure(eraVars);
    },
    async getWorldClockAdvanceSuggestion() {
      const eraVars = (typeof getEraVars === 'function' ? await getEraVars() : null) || {};
      return buildWorldClockAdvanceSuggestion(getWorldClockPressure(eraVars));
    },
    CLOCK_PRESSURE_DELTA: Object.assign({}, CLOCK_PRESSURE_DELTA),
    CLOCK_ADVANCE_SUGGESTION_TIERS: JSON.parse(JSON.stringify(CLOCK_ADVANCE_SUGGESTION_TIERS)),
    DEBT_INTEREST_RATE_PER_PHASE,
    MAJOR_DEBT_INTEREST_RATE_PER_PHASE,

    // 独立世界时钟（与 ACT 节点完全解耦）
    WORLD_CLOCK_SLOTS,
    getWorldClock() {
      return (async () => {
        const eraVars = (typeof getEraVars === 'function' ? await getEraVars() : null) || {};
        return getWorldClock(eraVars);
      })();
    },
    advanceWorldClock,
    setWorldClock,

    version: '0.9.5'
  };

  window.ACE0Plugin = hostRoot.ACE0Plugin;

  const actResultAssetCommandRequestCache = new Map();

  function postActResultMessage(sourceWindow, type, payload, warnLabel) {
    if (!sourceWindow || typeof sourceWindow.postMessage !== 'function') return;
    try {
      sourceWindow.postMessage({
        type,
        payload
      }, '*');
    } catch (error) {
      console.warn(`${PLUGIN_NAME} ACT_RESULT ${warnLabel || type} 回包失败:`, error);
    }
  }

  async function handleActResultAssetCommandMessage(event) {
    const message = event?.data;
    if (!message || typeof message !== 'object') return;
    if (message.type === 'acezero-act-result-era-vars-request') {
      const payload = message.payload || message.data || {};
      const requestId = typeof payload.requestId === 'string' ? payload.requestId : '';
      try {
        postActResultMessage(event.source, 'acezero-act-result-era-vars-result', {
          ok: true,
          requestId,
          eraVars: await getEraVars()
        }, 'MVU');
      } catch (error) {
        postActResultMessage(event.source, 'acezero-act-result-era-vars-result', {
          ok: false,
          requestId,
          reason: 'era_vars_request_failed',
          error: error?.message || String(error)
        }, 'MVU');
      }
      return;
    }
    if (message.type === 'acezero-act-result-route-command') {
      const payload = message.payload || message.data || {};
      const requestId = typeof payload.requestId === 'string' ? payload.requestId : '';
      const nodeId = typeof payload.nodeId === 'string' ? payload.nodeId : '';
      const floorKey = typeof payload.floorKey === 'string' ? payload.floorKey.trim() : '';
      try {
        const result = await hostRoot.ACE0Plugin.chooseActRoute(nodeId, { floorKey });
        postActResultMessage(event.source, 'acezero-act-result-route-command-result', {
          ...(result && typeof result === 'object' ? result : { ok: false, reason: 'empty_result' }),
          requestId
        }, 'route command');
      } catch (error) {
        postActResultMessage(event.source, 'acezero-act-result-route-command-result', {
          ok: false,
          requestId,
          reason: 'route_command_error',
          error: error?.message || String(error)
        }, 'route command');
      }
      return;
    }
    if (message.type !== 'acezero-act-result-asset-command') return;

    const payload = message.payload || message.data || {};
    const requestId = typeof payload.requestId === 'string' ? payload.requestId : '';
    const command = payload.command && typeof payload.command === 'object' ? payload.command : {};
    const commandKind = String(command.kind || command.type || '').trim().toLowerCase();
    const commandPayload = command.payload && typeof command.payload === 'object' ? command.payload : {};
    const floorKey = typeof payload.floorKey === 'string'
      ? payload.floorKey.trim()
      : (typeof commandPayload.floorKey === 'string' ? commandPayload.floorKey.trim() : '');

    if (requestId && actResultAssetCommandRequestCache.has(requestId)) {
      const cached = actResultAssetCommandRequestCache.get(requestId);
      const cachedResult = cached?.promise ? await cached.promise : cached?.result;
      postActResultMessage(event.source, 'acezero-act-result-asset-command-result', {
        ...(cachedResult && typeof cachedResult === 'object' ? cachedResult : { ok: false, reason: 'empty_result' }),
        requestId
      }, 'asset command');
      return;
    }

    const executeCommand = async () => {
      try {
        if (commandKind !== 'choose_card') {
          return { ok: false, reason: 'unsupported_asset_command' };
        }
        return await hostRoot.ACE0Plugin.chooseAssetCard(commandPayload.choiceIndex, commandPayload.slotType || 'general', commandPayload.clearKey || commandPayload.offerId || '', { floorKey });
      } catch (error) {
        return { ok: false, reason: 'asset_command_error', error: error?.message || String(error) };
      }
    };

    const record = {};
    if (requestId) {
      record.promise = executeCommand();
      actResultAssetCommandRequestCache.set(requestId, record);
    }
    const result = requestId ? await record.promise : await executeCommand();
    if (requestId) {
      record.result = result;
      record.promise = null;
      window.setTimeout(() => {
        if (actResultAssetCommandRequestCache.get(requestId) === record) {
          actResultAssetCommandRequestCache.delete(requestId);
        }
      }, 30000);
    }

    postActResultMessage(event.source, 'acezero-act-result-asset-command-result', {
      ...(result && typeof result === 'object' ? result : { ok: false, reason: 'empty_result' }),
      requestId
    }, 'asset command');
  }

  try {
    const previousHandler = window.__ACE0_ACT_RESULT_ASSET_COMMAND_HANDLER__;
    const previousTargets = Array.isArray(window.__ACE0_ACT_RESULT_ASSET_COMMAND_HANDLER_TARGETS__)
      ? window.__ACE0_ACT_RESULT_ASSET_COMMAND_HANDLER_TARGETS__
      : [window];
    previousTargets.forEach((targetWindow) => {
      try {
        if (targetWindow && previousHandler) targetWindow.removeEventListener('message', previousHandler);
      } catch (_) {}
    });
  } catch (_) {}
  window.__ACE0_ACT_RESULT_ASSET_COMMAND_HANDLER__ = handleActResultAssetCommandMessage;
  window.__ACE0_ACT_RESULT_ASSET_COMMAND_HANDLER_TARGETS__ = [];
  [window, getAce0HostRoot()].forEach((targetWindow) => {
    try {
      if (!targetWindow || window.__ACE0_ACT_RESULT_ASSET_COMMAND_HANDLER_TARGETS__.includes(targetWindow)) return;
      targetWindow.addEventListener('message', handleActResultAssetCommandMessage);
      window.__ACE0_ACT_RESULT_ASSET_COMMAND_HANDLER_TARGETS__.push(targetWindow);
    } catch (_) {}
  });

  // ==========================================================
  //  初始化完成
  // ==========================================================

  console.log(`${PLUGIN_NAME} 插件加载完成 (v0.9.2 MVU-zod)`);
  console.log(`${PLUGIN_NAME} NPC 组装: kernel=${Object.keys(AI_KERNELS).join('/')} | archetype=${Object.keys(RPG_TEMPLATES).join('/')} | mood=${Object.keys(MOOD_MODIFIERS).join('/')}`);
  console.log(`${PLUGIN_NAME} 专属角色: ${Object.keys(NAMED_CHARACTERS).join(', ')} | NPC预设: ${Object.keys(NAMED_NPC_PRESETS).join(', ')}`);
  console.log(`${PLUGIN_NAME} 跑龙套: ${Object.keys(RUNNER_PRESETS).join(', ')}`);
  console.log(`${PLUGIN_NAME} 流程: AI 输出 <${BATTLE_TAG}> → NPC组装 → 合并 MVU hero → 注入 <${FRONTEND_TAG}> → ST 正则 → STver.html`);
  console.log(`${PLUGIN_NAME} 事件: mag_before_message_update(优选) + character_message_rendered/message_received(兜底)`);
  console.log(`${PLUGIN_NAME} 调试: ACE0Plugin.scanAndInject() — 扫描全部消息补注入`);

})();
