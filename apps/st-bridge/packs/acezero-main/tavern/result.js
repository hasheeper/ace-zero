/**
 * AceZero Tavern result runtime.
 *
 * Owns ACE0_BATTLE parsing, ACE0_FRONTEND injection payload construction, and
 * ACE0_ACT_RESULT payload/tag generation. The main Tavern plugin keeps wrappers
 * for stable event flow.
 */
(function installAceZeroTavernResultRuntime(global) {
  'use strict';

  function createAceZeroTavernResultRuntime(options = {}) {
    const PLUGIN_NAME = options.pluginName || '[ACE0]';
    const tags = options.tags || {};
    const BATTLE_TAG = tags.BATTLE_TAG || 'ACE0_BATTLE';
    const FRONTEND_TAG = tags.FRONTEND_TAG || 'ACE0_FRONTEND';
    const ACT_RESULT_TAG = tags.ACT_RESULT_TAG || 'ACE0_ACT_RESULT';
    const constants = options.constants || {};
    const ACT_RESOURCE_KEYS = constants.ACT_RESOURCE_KEYS || ['combat', 'rest', 'asset', 'vision'];
    const ACT_PHASE_LABELS = constants.ACT_PHASE_LABELS || ['一段', '二段', '三段', '四段'];
    const deps = options.deps || {};
    const getActRuntimeConfig = deps.getActRuntimeConfig || (() => null);
    const getActNodeRuntime = deps.getActNodeRuntime || (() => null);
    const diffManaByRoster = deps.diffManaByRoster || (() => ({}));
    const diffNumberMap = deps.diffNumberMap || (() => ({}));
    const diffStringArray = deps.diffStringArray || (() => []);
    const getArrayDiff = deps.getArrayDiff || (() => []);
    const getActResultType = deps.getActResultType || (() => '');
    const getEraVars = deps.getEraVars || (async () => ({}));
    const resolvePendingActAdvance = deps.resolvePendingActAdvance || (async (eraVars) => ({ eraVars }));
    const synchronizeActCharacterState = deps.synchronizeActCharacterState || (async (eraVars) => ({ eraVars, derived: null }));
    const createActRuntimeSnapshot = deps.createActRuntimeSnapshot || (() => null);
    const getNonRelationshipPatchesFromContent = deps.getNonRelationshipPatchesFromContent || (() => []);
    const areActSnapshotsEqual = deps.areActSnapshotsEqual || (() => false);
    const getPendingActBaselineSnapshot = deps.getPendingActBaselineSnapshot || (() => null);
    const setPendingActBaselineSnapshot = deps.setPendingActBaselineSnapshot || (() => {});
    const resolveBattleData = deps.resolveBattleData || ((value) => value);
    const buildCompleteGameConfig = deps.buildCompleteGameConfig || ((eraVars, battleData) => ({ eraVars, battleData }));

  function buildStateUpdateSummary(before, after, changedPaths = []) {
    const summaryParts = [];
    if (Number(after.funds) !== Number(before.funds)) summaryParts.push('资金已结算。');
    if (Number(after.assets) !== Number(before.assets)) summaryParts.push('资产状态已更新。');
    if (Number(after.debt) !== Number(before.debt)) summaryParts.push('普通债务已更新。');
    if (Number(after.majorDebt) !== Number(before.majorDebt)) summaryParts.push('主线大债已更新。');
    if (Object.keys(diffManaByRoster(before.manaByRoster, after.manaByRoster)).length) summaryParts.push('法力状态已更新。');
    if (Object.keys(diffNumberMap(before.levelByRoster, after.levelByRoster)).length) summaryParts.push('队伍等级已更新。');
    if (Object.keys(diffNumberMap(before.maxManaByRoster, after.maxManaByRoster)).length) summaryParts.push('法力上限已更新。');
    if (diffStringArray(before.activated, after.activated).length) summaryParts.push('角色激活状态已更新。');
    if (diffStringArray(before.introduced, after.introduced).length) summaryParts.push('角色登场记录已更新。');
    if (JSON.stringify(before.present || []) !== JSON.stringify(after.present || [])) summaryParts.push('同场角色已更新。');
    if (diffStringArray(before.inParty, after.inParty).length) summaryParts.push('同行队伍已更新。');
    if ((before.worldLocation?.layer || '') !== (after.worldLocation?.layer || '') || (before.worldLocation?.site || '') !== (after.worldLocation?.site || '')) {
      summaryParts.push('场景位置已更新。');
    }
    if ((before.worldClock?.day || 0) !== (after.worldClock?.day || 0) || (before.worldClock?.phase || '') !== (after.worldClock?.phase || '')) {
      summaryParts.push('世界时间已更新。');
    }
    if (!summaryParts.length && changedPaths.length) summaryParts.push('世界状态已更新。');
    return summaryParts.join(' ');
  }

  function buildActResultSummary(resultType, before, after, changedPaths = []) {
    if (resultType === 'node_advance') {
      // 注：act.nodeIndex 是节点序列索引，此处展示为 NODE，不造成与世界日混淆。
      if (after.stage === 'planning') {
        return `NODE ${String(after.nodeIndex).padStart(2, '0')} started. Planner reopened.`;
      }
      if (after.stage === 'route') {
        return `NODE ${String(after.nodeIndex).padStart(2, '0')} reached route selection.`;
      }
      return `NODE ${String(after.nodeIndex).padStart(2, '0')} started.`;
    }

    if (after.stage === 'planning') {
      return `${ACT_PHASE_LABELS[Math.max(0, Math.min(3, before.phaseIndex))] || 'PHASE'} completed. Planner reopened.`;
    }
    if (after.stage === 'route') {
      return `Phase execution completed. Route choice required.`;
    }
    if (resultType === 'state_update') {
      return buildStateUpdateSummary(before, after, changedPaths);
    }
    return `${ACT_PHASE_LABELS[Math.max(0, Math.min(3, after.phaseIndex - 1))] || 'PHASE'} advanced.`;
  }

  function buildActResultPayload(before, after, options = {}) {
    const changedPaths = Array.isArray(options.changedPaths) ? options.changedPaths.filter(Boolean) : [];
    const shouldForceStateUpdate = options.forceStateUpdate === true;
    const resultType = getActResultType(before, after) || (shouldForceStateUpdate ? 'state_update' : '');
    if (!resultType) return null;

    const advancedPhases = after.nodeIndex > before.nodeIndex
      ? Math.max(0, (4 - before.phaseIndex) + after.phaseIndex)
      : Math.max(0, after.phaseIndex - before.phaseIndex);
    const limitedDelta = ACT_RESOURCE_KEYS.reduce((acc, key) => {
      acc[key] = after.limited[key] - before.limited[key];
      return acc;
    }, {});
    const reserveDelta = ACT_RESOURCE_KEYS.reduce((acc, key) => {
      acc[key] = after.reserve[key] - before.reserve[key];
      return acc;
    }, {});

    // stage=route 时收集路线选项 + 展示名，便于结算卡 HTML 渲染可点击按钮。
    // 选项上限通常 ≤ 3，payload 体积可忽略。
    let routeOptions = [];
    const routeOptionLabels = {};
    if (after.stage === 'route') {
      const actIdForLookup = (after.id || before.id || null);
      const config = actIdForLookup ? getActRuntimeConfig(actIdForLookup) : null;
      const curNodeRuntime = config ? getActNodeRuntime(config, after.currentNodeId) : null;
      const transition = curNodeRuntime?.next || { mode: 'none' };
      if (transition.mode === 'choice' && Array.isArray(transition.options)) {
        routeOptions = transition.options.filter(id => typeof id === 'string' && id.trim());
      } else if (transition.mode === 'forced' && typeof transition.nodeId === 'string') {
        routeOptions = [transition.nodeId];
      }
      for (const optId of routeOptions) {
        const optRuntime = config ? getActNodeRuntime(config, optId) : null;
        const uiLabel = optRuntime?.ui?.label;
        const narrativeTitle = optRuntime?.narrative?.title;
        const narrativeSubtitle = optRuntime?.narrative?.subtitle;
        routeOptionLabels[optId] = {
          label: typeof uiLabel === 'string' && uiLabel.trim() ? uiLabel : optId,
          subtitle: typeof narrativeSubtitle === 'string' && narrativeSubtitle.trim()
            ? narrativeSubtitle
            : (typeof narrativeTitle === 'string' ? narrativeTitle : '')
        };
      }
    }

    return {
      type: resultType,
      fromNodeIndex: before.nodeIndex,
      toNodeIndex: after.nodeIndex,
      fromPhaseIndex: before.phaseIndex,
      toPhaseIndex: after.phaseIndex,
      fromStage: before.stage,
      toStage: after.stage,
      fromNode: before.currentNodeId,
      toNode: after.currentNodeId,
      needsPlanning: after.stage === 'planning',
      needsRouteChoice: after.stage === 'route',
      nextAction: after.stage === 'route'
        ? 'choose_route'
        : (after.stage === 'planning' ? 'plan_node' : 'continue'),
      advancedPhases,
      routeChanged: JSON.stringify(before.routeHistory) !== JSON.stringify(after.routeHistory),
      routeHistory: after.routeHistory,
      routeOptions,
      routeOptionLabels,
      worldClockPressure: Math.max(0, Math.min(100, Math.round(Number(after.clockPressure) || 0))),
      worldClockAdvanceSuggestion: after.worldClockAdvanceSuggestion || null,
      // 世界时钟四相信息（与节点轨完全解耦）。结算卡上段展示 DAY + 晨/昼/暮/夜。
      worldClock: after.worldClock || null,
      worldLocation: after.worldLocation || null,
      fromWorldLocation: before.worldLocation || null,
      // 四层地理变动标志（底锈/下街/中市/上庭）
      worldLayerShifted: !!(
        before.worldLocation && after.worldLocation &&
        (before.worldLocation.layer !== after.worldLocation.layer ||
         (before.worldLocation.site || '') !== (after.worldLocation.site || ''))
      ),
      changedPaths,
      fundsDelta: Math.round((after.funds - before.funds) * 100) / 100,
      assetsDelta: Math.round((after.assets - before.assets) * 100) / 100,
      debtDelta: Math.round((after.debt - before.debt) * 100) / 100,
      majorDebtDelta: Math.round((after.majorDebt - before.majorDebt) * 100) / 100,
      manaDelta: diffManaByRoster(before.manaByRoster, after.manaByRoster),
      limitedDelta,
      reserveDelta,
      activated: getArrayDiff(after.activated, before.activated),
      present: after.present,
      summary: buildActResultSummary(resultType, before, after, changedPaths)
    };
  }

  function buildActResultTag(resultPayload) {
    if (!resultPayload) return '';
    return `<${ACT_RESULT_TAG}>\n${JSON.stringify(resultPayload)}\n</${ACT_RESULT_TAG}>`;
  }

  async function buildPendingActResult(content = '', eraVars = null) {
    const currentVars = eraVars || await getEraVars();
    const resolvedAdvance = await resolvePendingActAdvance(currentVars);
    const syncedState = await synchronizeActCharacterState(resolvedAdvance.eraVars);
    const nextSnapshot = createActRuntimeSnapshot(syncedState.eraVars, syncedState.derived);
    const changedPatches = getNonRelationshipPatchesFromContent(content);
    const changedPaths = changedPatches
      .map(patch => typeof patch.path === 'string' ? patch.path.trim() : '')
      .filter(Boolean);
    const shouldForceStateUpdate = changedPaths.length > 0;
    const baselineSnapshot = getPendingActBaselineSnapshot();
    if (!baselineSnapshot || !nextSnapshot) {
      setPendingActBaselineSnapshot(nextSnapshot);
      return { payload: null, eraVars: syncedState.eraVars, snapshot: nextSnapshot };
    }

    if (areActSnapshotsEqual(baselineSnapshot, nextSnapshot) && !shouldForceStateUpdate) {
      setPendingActBaselineSnapshot(nextSnapshot);
      return { payload: null, eraVars: syncedState.eraVars, snapshot: nextSnapshot };
    }

    const payload = buildActResultPayload(baselineSnapshot, nextSnapshot, {
      forceStateUpdate: shouldForceStateUpdate,
      changedPaths
    });
    setPendingActBaselineSnapshot(nextSnapshot);
    return { payload, eraVars: syncedState.eraVars, snapshot: nextSnapshot };
  }

  async function appendActResultIfNeeded(content, options = {}) {
    const baseContent = typeof content === 'string' ? content : '';
    if (!baseContent.trim()) return { content: baseContent, changed: false, payload: null };
    if (baseContent.includes(`<${ACT_RESULT_TAG}>`)) return { content: baseContent, changed: false, payload: null };

    const built = await buildPendingActResult(baseContent, options.eraVars || null);
    if (!built.payload) {
      return { content: baseContent, changed: false, payload: null };
    }

    const nextContent = `${baseContent.trim()}\n\n${buildActResultTag(built.payload)}`;
    return { content: nextContent, changed: true, payload: built.payload };
  }


  function parseAiBattleOutput(content) {
    // 预处理：移除 AI 思考过程标签（think / planning）内的所有内容
    // 这些标签内的内容不应被解析为战局数据
    let cleanedContent = content;
    cleanedContent = cleanedContent.replace(/[\s\S]*<\/think>/gi, '');
    cleanedContent = cleanedContent.replace(/[\s\S]*<\/planning>/gi, '');

    const regex = new RegExp(`<${BATTLE_TAG}>([\\s\\S]*?)<\\/${BATTLE_TAG}>`, 'i');
    const match = cleanedContent.match(regex);
    if (!match) return null;

    let raw = match[1].trim();

    // AI 经常用 markdown 代码块包裹 JSON，需要剥离
    // 处理: ```json ... ``` 或 ``` ... ```
    raw = raw.replace(/^```[\w]*\s*/i, '').replace(/\s*```$/i, '');

    // 剥离散落的反引号
    raw = raw.replace(/^`+|`+$/g, '');

    // 提取第一个 { 到最后一个 } 之间的内容（兜底）
    const braceStart = raw.indexOf('{');
    const braceEnd = raw.lastIndexOf('}');
    if (braceStart >= 0 && braceEnd > braceStart) {
      raw = raw.substring(braceStart, braceEnd + 1);
    }

    try {
      return JSON.parse(raw);
    } catch (e) {
      console.warn(`${PLUGIN_NAME} 解析 ${BATTLE_TAG} JSON 失败:`, e);
      console.warn(`${PLUGIN_NAME} 原始内容:`, raw.substring(0, 200));
      return null;
    }
  }

  // ==========================================================
  //  C. 注入 <ACE0_FRONTEND> 到消息
  //
  //  MVU 时序问题：
  //    MVU 在变量更新后总是调用 setChatMessages 重写消息内容，
  //    如果我们在其之前或之后单独调用 setChatMessages，
  //    内容会被 MVU 覆盖或产生竞争。
  //
  //  双事件策略：
  //    1. mag_before_message_update
  //       → 优选路径：AI 同时输出了 <UpdateVariable> 时触发，
  //         直接修改 event.message_content，由 MVU 统一写入。
  //    2. CHARACTER_MESSAGE_RENDERED
  //       → 兆底路径：MVU 完成所有 setChatMessages 写入后触发，
  //         检查消息是否已包含 FRONTEND，若未包含则注入。
  //         此时 MVU 已完成，不会再覆盖。
  // ==========================================================

  /**
   * 核心处理逻辑：解析 <ACE0_BATTLE> 并构建 game-config
   * @param {string} content - 消息内容
   * @returns {{ content: string, config: object } | null}
   */
  async function processBattleContent(content) {
    // 解析 AI 输出的战局 JSON
    const rawBattleData = parseAiBattleOutput(content);
    if (!rawBattleData) {
      console.warn(`${PLUGIN_NAME} 无法解析战局数据`);
      return null;
    }

    // NPC 组装流水线：runner/kernel/直写 → 统一 seat config
    const aiBattleData = resolveBattleData(rawBattleData);

    // 读取 MVU 变量
    const eraVars = await getEraVars();

    // 构建完整 game-config（MVU hero 数据 + AI 战局数据）
    const completeConfig = buildCompleteGameConfig(eraVars, aiBattleData);

    // 追加 <ACE0_FRONTEND>
    const frontendPayload = `<${FRONTEND_TAG}>\n${JSON.stringify(completeConfig)}\n</${FRONTEND_TAG}>`;
    const newContent = content.trim() + '\n\n' + frontendPayload;

    return { content: newContent, config: completeConfig };
  }


    return {
      buildStateUpdateSummary,
      buildActResultSummary,
      buildActResultPayload,
      buildActResultTag,
      buildPendingActResult,
      appendActResultIfNeeded,
      parseAiBattleOutput,
      processBattleContent
    };
  }

  global.ACE0TavernResultRuntime = Object.assign({}, global.ACE0TavernResultRuntime || {}, {
    create: createAceZeroTavernResultRuntime
  });
})(typeof window !== 'undefined' ? window : globalThis);
