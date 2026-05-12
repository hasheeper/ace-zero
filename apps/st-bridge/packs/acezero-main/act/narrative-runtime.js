/**
 * ACEZERO ACT NARRATIVE RUNTIME
 *
 * Owns ACT prompt summaries, narrative pacing, seeded event pools,
 * phase-event rendering, and chapter transition prompt content.
 */
(function initAceZeroActNarrativeRuntime(global) {
  'use strict';

  global.ACE0ActNarrativeRuntime = {
    create(options = {}) {
      const constants = options.constants || {};
      const deps = options.deps || {};
      const {
        DEFAULT_WORLD_ACT = { id: 'chapter0_exchange', seed: 'AUTO' },
        ACT_RESOURCE_KEYS = ['combat', 'rest', 'asset', 'vision'],
        ACT_PHASE_LABELS = ['一段', '二段', '三段', '四段']
      } = constants;
      const {
        deepClone = (value) => (value == null ? value : JSON.parse(JSON.stringify(value))),
        normalizeTrimmedString = (value, fallback = '') => {
          const normalized = typeof value === 'string' ? value.trim() : '';
          return normalized || fallback;
        },
        normalizeActResourceKey = (value, fallback = 'vision') => {
          const normalized = normalizeTrimmedString(value, fallback).toLowerCase();
          return ACT_RESOURCE_KEYS.includes(normalized) ? normalized : fallback;
        },
        normalizeActState,
        getVisionReplacementForPhase,
        getNodeV2Phase,
        getNodeRuntime,
        getChapterRuntime,
        getChapter,
        getDefaultActState
      } = deps;

  function buildFirstMeetPromptContent(firstMeetHints) {
    if (!firstMeetHints || typeof firstMeetHints !== 'object' || Array.isArray(firstMeetHints)) return '';
    const entries = Object.entries(firstMeetHints)
      .filter(([, v]) => typeof v === 'string' && v.trim());
    if (!entries.length) return '';
    const lines = entries.map(([charKey, hint]) => `- ${charKey}：${hint}`);
    const header = '本轮以下角色首次在主角视野里登场。请按"首见"质感描写：主角对她们还不熟，不要写成老熟人、不要直接称呼默契的细节。';
    return `<ace0_first_meet>\n${header}\n${lines.join('\n')}\n</ace0_first_meet>`;
  }

  function buildPreSignalPromptContent(preSignalHints) {
    if (!preSignalHints || typeof preSignalHints !== 'object' || Array.isArray(preSignalHints)) return '';
    const entries = Object.entries(preSignalHints)
      .filter(([, v]) => typeof v === 'string' && v.trim());
    if (!entries.length) return '';
    const lines = entries.map(([charKey, hint]) => `- ${charKey}：${hint}`);
    const header = '本轮出现以下角色的前置信号。请只写成线索、气味、委托、监视或环境异常；不要让角色本人正式登场，不要解锁熟人关系，也不要写成已经相识。';
    return `<ace0_pre_signal>\n${header}\n${lines.join('\n')}\n</ace0_pre_signal>`;
  }

  function buildActStateSummaryFromDerived(derivedState) {
    if (!derivedState) return '';

    const { act, currentNodeId, managedCharacters, states } = derivedState;
    const routeLine = act.route_history.join(' > ');
    const limitedLine = ACT_RESOURCE_KEYS.map((key) => `${key}=${Math.round(act.limited[key] || 0)}`).join(' | ');
    const reserveLine = ACT_RESOURCE_KEYS.map((key) => `${key}=${Math.round(act.reserve[key] || 0)}`).join(' | ');
    const phaseLines = act.phase_slots.map((slot, index) => {
      if (!slot) return `  ${ACT_PHASE_LABELS[index]} = EMPTY`;
      const tint = slot.key === 'rest' ? normalizeActResourceKey(slot.tint || slot.controlType || slot.targetKey, '') : '';
      const tintText = tint ? ` -> ${tint.toUpperCase()}` : '';
      return `  ${ACT_PHASE_LABELS[index]} = ${slot.key.toUpperCase()} x${Math.max(1, Math.round(Number(slot.amount) || 1))}${tintText} (${slot.source})`;
    });
    const activatedChars = managedCharacters.filter((charKey) => states[charKey]?.activated === true);
    const presentChars = managedCharacters.filter((charKey) => states[charKey]?.present === true);

    // 注：node_seq 是节点序列索引（1..totalNodes），与世界日无关。世界时间见 <ace0_world_context>。
    return `<ace0_act_state>
[ACT]
  id: ${act.id}
  seed: ${act.seed}
  node_seq: ${act.nodeIndex}
  stage: ${act.stage}
  current_node: ${currentNodeId}
  route_history: ${routeLine}
[TOKENS]
  limited: ${limitedLine}
  reserve: ${reserveLine}
  pending_resolutions: ${Array.isArray(act.pendingResolutions) ? act.pendingResolutions.length : 0}
[PHASE_SLOTS]
${phaseLines.join('\n')}
[ACT_CHARACTERS]
  activated: ${activatedChars.length ? activatedChars.join(', ') : '（无）'}
  present: ${presentChars.length ? presentChars.join(', ') : '（无）'}
</ace0_act_state>`;
  }

  // ---------- 情节张力辅助（纯函数）----------
  // 档位映射：数值 → 自然语言节奏提示（永不对 LLM 暴露数值）
  const NARRATIVE_TENSION_TIERS = [
    { min: 0,  max: 30,  hint: '当前段落仍可继续展开，不忙着收束。' },
    { min: 30, max: 60,  hint: '当前互动已进入中段，可以继续铺垫，但不要拖得太远。' },
    { min: 60, max: 85,  hint: '铺垫已经足够，适合尽快形成决定或进入结果。' },
    { min: 85, max: 101, hint: '情节停留较久，强烈建议收束本幕，推进到下一节点。' }
  ];

  function pickNarrativeTensionTier(tension) {
    const v = Math.max(0, Math.min(100, Math.round(Number(tension) || 0)));
    for (const tier of NARRATIVE_TENSION_TIERS) {
      if (v >= tier.min && v < tier.max) return tier;
    }
    return NARRATIVE_TENSION_TIERS[NARRATIVE_TENSION_TIERS.length - 1];
  }

  function buildNarrativePacingSummary(tension, worldClockSuggestion = null) {
    // 返回给 LLM 看的自然语言提示（不包含数值）
    const value = Math.max(0, Math.min(100, Math.round(Number(tension) || 0)));
    const tier = pickNarrativeTensionTier(value);
    const timeHint = worldClockSuggestion && typeof worldClockSuggestion === 'object'
      ? String(worldClockSuggestion.hint || '').trim()
      : '';
    const timePressure = worldClockSuggestion && typeof worldClockSuggestion === 'object'
      ? Math.max(0, Math.min(100, Math.round(Number(worldClockSuggestion.pressure) || 0)))
      : null;
    const lines = [
      `节奏建议：${tier.hint}`,
      `节奏值：${value}/100`
    ];
    if (timeHint) lines.push(`时间建议：${timeHint}`);
    if (timePressure != null) lines.push(`时间值：${timePressure}/100`);
    return `<ace0_narrative_pacing>\n${lines.join('\n')}\n</ace0_narrative_pacing>`;
  }

  // ---------- 随机池抽签（seed 确定性）----------
  function hashStringToSeed(str) {
    // FNV-1a 32-bit
    let h = 2166136261 >>> 0;
    const s = String(str || '');
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function rng() {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pickFromCandidates(candidates, seedStr) {
    if (!Array.isArray(candidates) || !candidates.length) return null;
    if (candidates.length === 1) return candidates[0];
    const rng = mulberry32(hashStringToSeed(seedStr));
    const weights = candidates.map((c) => Math.max(0.0001, Number(c?.weight) || 1));
    const total = weights.reduce((a, b) => a + b, 0);
    let target = rng() * total;
    for (let i = 0; i < candidates.length; i += 1) {
      target -= weights[i];
      if (target <= 0) return candidates[i];
    }
    return candidates[candidates.length - 1];
  }

  function resolvePhaseEvent(config, narrative, nodeId, phaseIndex, act) {
    const visionReplacement = getVisionReplacementForPhase(act, nodeId, phaseIndex);

    // L1 节点级 pinned（固定包）
    const pinned = getNodeV2Phase(config, nodeId, phaseIndex)?.event;
    if (!visionReplacement && pinned && typeof pinned === 'object') {
      return { kind: 'pinned', template: deepClone(pinned) };
    }

    // 当前 slot kind 来源区分：
    //  token = 玩家在 phase_slots 里规划的点数
    //  phase = 章节定义里写死的 slot kind
    const phaseSlots = Array.isArray(act?.phase_slots) ? act.phase_slots : [];
    const currentSlot = phaseSlots[phaseIndex] || null;
    const slotKeyFromToken = currentSlot && typeof currentSlot.key === 'string' ? currentSlot.key.toLowerCase() : '';
    const slotKeyFromPhase = normalizeTrimmedString(getNodeV2Phase(config, nodeId, phaseIndex)?.slot, '').toLowerCase();
    const slotKeyFromReplacement = visionReplacement?.key || '';
    const slotKey = slotKeyFromToken || slotKeyFromReplacement || slotKeyFromPhase;

    // L2 节点级 fateEvents（按 slot kind 的 flavor，单条、不池化；任意 slotKey 来源都触发）
    const nodeNarrative = config?.nodes?.[nodeId]?.narrative;
    const fateFlavor = slotKey && nodeNarrative?.fateEvents?.[slotKey];
    if (fateFlavor) {
      return { kind: 'flavor', flavorText: fateFlavor, slotKey };
    }

    return null;
  }

  function findPinnedEvent(config, narrative, nodeId, phaseIndex) {
    const v2Event = getNodeV2Phase(config, nodeId, phaseIndex)?.event;
    if (v2Event && typeof v2Event === 'object') {
      return {
        node: nodeId,
        phaseIndex,
        inlineTemplate: deepClone(v2Event)
      };
    }
    return null;
  }

  function resolveNodeGuide(config, narrative, nodeId) {
    const nodeNarrative = config?.nodes?.[nodeId]?.narrative;
    if (nodeNarrative && typeof nodeNarrative === 'object') {
      return {
        overview: typeof nodeNarrative.overview === 'string' ? nodeNarrative.overview : '',
        guidance: typeof nodeNarrative.guidance === 'string' ? nodeNarrative.guidance : '',
        fateEvents: nodeNarrative.fateEvents && typeof nodeNarrative.fateEvents === 'object' ? nodeNarrative.fateEvents : {}
      };
    }
    return { overview: '', guidance: '', fateEvents: {} };
  }

  function renderPinnedTemplate(template, phaseIndex) {
    if (!template) return '';
    const phaseLabel = `${ACT_PHASE_LABELS[phaseIndex] || `段${phaseIndex + 1}`} · 固定事件`;
    const heading = template.title ? `[命运事件 · ${phaseLabel}] ${template.title}` : `[命运事件 · ${phaseLabel}]`;
    return [
      heading,
      template.objective ? `  目标: ${template.objective}` : '',
      template.direction ? `  方向: ${template.direction}` : '',
      template.castDirective ? `  出手: ${template.castDirective}` : '',
      template.mustEnd ? `  收束: ${template.mustEnd}` : ''
    ].filter(Boolean).join('\n');
  }

  function renderFateFlavor(flavorText, phaseIndex, tokenKey) {
    const label = tokenKey || '';
    const segLabel = ACT_PHASE_LABELS[phaseIndex] || `段${phaseIndex + 1}`;
    const heading = `[命运事件 · ${segLabel}${label ? ` · ${label}` : ''}]`;
    return flavorText ? `${heading}\n${flavorText}` : heading;
  }

  function getNodePositionLabel(act, config) {
    const nodeIndex = Math.max(1, Math.round(Number(act?.nodeIndex) || 1));
    const totalNodes = Math.max(1, Math.round(Number(config?.meta?.totalNodes) || 1));
    if (nodeIndex <= 1) return '开局';
    const ratio = nodeIndex / totalNodes;
    if (ratio < 0.28) return '前期';
    if (ratio < 0.68) return '中段';
    if (ratio < 0.92) return '后期';
    return '终盘';
  }

  function formatPhaseAction(slot) {
    if (!slot || typeof slot !== 'object') return '自然推进';
    const key = normalizeActResourceKey(slot.key, '');
    if (!key) return '自然推进';
    const amount = Math.max(1, Math.min(3, Math.round(Number(slot.amount) || 1)));
    const labels = {
      combat: ['一级·小交锋', '二级·精英战', '三级·Boss战'],
      asset: ['一级·低阶契令', '二级·中阶契令', '三级·高阶契令'],
      rest: ['一级·休整', '二级·休整', '三级·休整'],
      vision: ['一级·情报', '二级·情报', '三级·情报']
    };
    const label = labels[key]?.[amount - 1] || `${amount}级`;
    return `行动-${key}｜${label}`;
  }

  function getPhaseWindowItem(eventTree, phaseIndex) {
    const phases = Array.isArray(eventTree?.phaseWindow?.phases)
      ? eventTree.phaseWindow.phases
      : [];
    return phases.find((item) => Math.max(0, Math.min(3, Math.round(Number(item?.index) || 0))) === phaseIndex) || null;
  }

  function buildStoryTendencyLine(act, eventTree, currentSlot) {
    const explicit = normalizeTrimmedString(eventTree?.nodeGoals?.current?.tendency, '');
    const key = currentSlot && typeof currentSlot.key === 'string' ? currentSlot.key : '';
    const tokenHints = {
      combat: '交锋 / 对抗 / 风险',
      rest: '休整 / 关系 / 调整',
      asset: '收益 / 资源 / 契机',
      vision: '情报 / 选择 / 预兆'
    };
    const tokenHint = tokenHints[key] || '自然推进 / 场景变化';
    const spent = act?.resourceSpent && typeof act.resourceSpent === 'object'
      ? ACT_RESOURCE_KEYS
          .map((resourceKey) => [resourceKey, Math.max(0, Math.round(Number(act.resourceSpent[resourceKey]) || 0))])
          .filter(([, value]) => value > 0)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 2)
          .map(([resourceKey]) => resourceKey)
      : [];
    return [explicit, tokenHint, spent.length ? `长期偏向: ${spent.join(' / ')}` : ''].filter(Boolean).join(' / ');
  }

  function getPhasePlanLockForAct(raw) {
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    return {
      nodeId: normalizeTrimmedString(source.nodeId, ''),
      nodeIndex: Math.max(0, Math.round(Number(source.nodeIndex) || 0)),
      locked: source.locked === true || source.confirmed === true,
      confirmedPhaseIndex: Math.max(0, Math.min(3, Math.round(Number(source.confirmedPhaseIndex) || 0))),
      floorKey: normalizeTrimmedString(source.floorKey, '')
    };
  }

  function isPhasePlanLockCurrent(act, currentNodeId = '') {
    if (!act) return false;
    const lock = getPhasePlanLockForAct(act.phasePlanLock);
    return lock.locked === true
      && lock.nodeId === normalizeTrimmedString(currentNodeId, '')
      && lock.nodeIndex === Math.max(1, Math.round(Number(act.nodeIndex) || 1));
  }

  function getEffectivePhaseSlot(act, index, currentNodeId = '') {
    if (!isPhasePlanLockCurrent(act, currentNodeId)) return null;
    return Array.isArray(act?.phase_slots) ? act.phase_slots[index] || null : null;
  }

  function buildEventTreeSection(act, config, currentNodeId, phaseIndex, currentSlot, currentFloorKey = '') {
    const eventTree = act?.eventTree && typeof act.eventTree === 'object' ? act.eventTree : {};
    const nodeGoals = eventTree.nodeGoals && typeof eventTree.nodeGoals === 'object' ? eventTree.nodeGoals : {};
    const currentGoal = normalizeTrimmedString(nodeGoals.current?.goal, '');
    const nextGoal = normalizeTrimmedString(nodeGoals.next?.goal, '');
    const windowNodeId = normalizeTrimmedString(eventTree.phaseWindow?.nodeId, '');
    const hasCurrentWindow = windowNodeId === currentNodeId && Array.isArray(eventTree.phaseWindow?.phases) && eventTree.phaseWindow.phases.length > 0;
    const tendency = buildStoryTendencyLine(act, eventTree, currentSlot);
    const nodeLines = [
      '[节点]',
      `位置: ${getNodePositionLabel(act, config)}`,
      `当前目标: ${currentGoal || '未规划'}`,
      `下一节点目标: ${nextGoal || '未规划'}`,
      `倾向: ${tendency}`
    ];

    const phaseLines = ['[事件树]'];
    let currentPhaseLine = '';
    let currentPhaseGoal = '';
    for (let index = 0; index < 4; index += 1) {
      const item = hasCurrentWindow ? getPhaseWindowItem(eventTree, index) : null;
      const label = index < phaseIndex ? '已完成' : (index === phaseIndex ? '当前进行' : '未来准备');
      const goal = normalizeTrimmedString(item?.goal, '') || '未规划';
      const event = normalizeTrimmedString(item?.event, '');
      const slot = getEffectivePhaseSlot(act, index, currentNodeId);
      const action = formatPhaseAction(slot);
      const detail = `${ACT_PHASE_LABELS[index]} - ${goal}${event ? ` / ${event}` : ''}`;
      const line = `${label}: ${detail}｜${action}`;
      phaseLines.push(line);
      if (index === phaseIndex) {
        currentPhaseLine = line;
        currentPhaseGoal = detail;
      }
    }
    if (!hasCurrentWindow) {
      phaseLines.push('规划提示: 当前节点尚无 phaseWindow。请优先在 COT 中规划本节点四段小目标，再判断是否推进。');
    }

    const currentLines = [
      '[当前进行]',
      `本轮演绎: ${currentPhaseGoal || currentPhaseLine || `${ACT_PHASE_LABELS[phaseIndex] || '当前段'} - 未规划`}`,
      '写出这件事的实际发生、阻力与结果；如果已经形成可观察结果，结尾推进 /world/act/phase_advance 进入下一段。'
    ];

    const decisionLines = [
      '[推进判断]',
      '当前进行项没有实际结果时，停留本段。',
      '当前进行项已经落地时，写 /world/act/phase_advance 进入下一段。',
      '若剧情目标需要修正，只更新 /world/act/eventTree。'
    ];

    return [nodeLines.join('\n'), phaseLines.join('\n'), currentLines.join('\n'), decisionLines.join('\n')].join('\n\n');
  }

  function buildConfirmedPlanActionLines(act, eventTree) {
    return [0, 1, 2, 3].map((index) => {
      const item = getPhaseWindowItem(eventTree, index);
      const goal = normalizeTrimmedString(item?.goal, '') || '未规划';
      const event = normalizeTrimmedString(item?.event, '');
      const slot = Array.isArray(act?.phase_slots) ? act.phase_slots[index] : null;
      const detail = `${ACT_PHASE_LABELS[index] || `${index + 1}段`} - ${goal}${event ? ` / ${event}` : ''}`;
      return `${detail}｜${formatPhaseAction(slot)}`;
    });
  }

  function buildPhasePlanConfirmedPromptContent(derivedState, currentFloorKey = '') {
    if (!derivedState) return '';
    const { act, currentNodeId } = derivedState;
    const floorKey = normalizeTrimmedString(currentFloorKey, '');
    if (!act || !floorKey) return '';

    const lock = getPhasePlanLockForAct(act.phasePlanLock);
    const phaseIndex = Math.max(0, Math.min(3, Math.round(Number(act.phase_index) || 0)));
    const nodeIndex = Math.max(1, Math.round(Number(act.nodeIndex) || 1));
    const nodeId = normalizeTrimmedString(currentNodeId, '');
    if (
      lock.locked !== true ||
      lock.nodeId !== nodeId ||
      lock.nodeIndex !== nodeIndex ||
      lock.confirmedPhaseIndex !== phaseIndex ||
      lock.floorKey !== floorKey
    ) {
      return '';
    }

    const eventTree = act?.eventTree && typeof act.eventTree === 'object' ? act.eventTree : {};
    const actionLines = buildConfirmedPlanActionLines(act, eventTree);
    return [
      '<ace0_phase_plan_confirmed>',
      '本楼刚确认了本节点行动编排。',
      '[已确认行动]',
      ...actionLines,
      '[本轮要求]',
      '必须先在 COT 中按以上四段行动建立或修正本节点 eventTree。',
      '若当前目标、下一节点目标或 phaseWindow 缺失、空泛、偏离行动编排，本轮必须在 UpdateVariable 中更新 /world/act/eventTree。',
      '完成计划对齐后，再按当前进行项演绎正文；只有当前进行项已经落地，才推进 /world/act/phase_advance。',
      '</ace0_phase_plan_confirmed>'
    ].join('\n');
  }

  function buildNarrativePromptContentFromDerived(derivedState, options = {}) {
    if (!derivedState) return '';

    const { act, config, currentNodeId } = derivedState;
    const narrative = config && config.narrative;
    if (!narrative) return '';

    const stage = act?.stage || 'planning';
    const rawPhaseIndex = Math.round(Number(act?.phase_index) || 0);
    const phaseIndex = Math.max(0, Math.min(3, rawPhaseIndex));
    const currentFloorKey = normalizeTrimmedString(options?.currentFloorKey, '');
    const currentSlot = getEffectivePhaseSlot(act, phaseIndex, currentNodeId);
    const tokenKey = currentSlot && typeof currentSlot.key === 'string' ? currentSlot.key : '';
    const headerAttrs = [
      `nodeIndex="${act?.nodeIndex || 1}"`,
      `node="${currentNodeId || ''}"`,
      `stage="${stage}"`,
      `phase="${phaseIndex}"`,
      tokenKey ? `token="${tokenKey}"` : ''
    ].filter(Boolean).join(' ');

    const sections = [];
    const nodeGuide = resolveNodeGuide(config, narrative, currentNodeId);
    if (nodeGuide.overview) sections.push(`[今日]\n${nodeGuide.overview}`);
    if (nodeGuide.guidance) sections.push(`[今日指引]\n${nodeGuide.guidance}`);

    const stageGuides = narrative.stageGuides || {};

    if (stage === 'route' && stageGuides.route) {
      const routeNode = config?.nodes?.[currentNodeId];
      const routeOptions = Array.isArray(routeNode?.next?.options) ? routeNode.next.options : [];
      const currentNodeIndex = Math.max(1, Number(act?.nodeIndex) || 1);
      const existingHistory = Array.isArray(act?.route_history) ? act.route_history.slice(0, currentNodeIndex) : [];
      const parts = ['[阶段 · 选路相]', stageGuides.route];
      if (routeOptions.length) {
        parts.push(`[可选节点] ${routeOptions.join(' / ')}`);
        const sampleNode = routeOptions[0];
        const sampleHistory = [...existingHistory, sampleNode];
        const samplePatch = JSON.stringify([
          { op: 'replace', path: '/world/act/route_history', value: sampleHistory },
          { op: 'replace', path: '/world/act/phase_advance', value: 1 }
        ]);
        parts.push(`[UpdateVariable 模板] 将下面 JSONPatch 的 route_history 末项替换为实际选中的节点 ID，runtime 会自动推进到下一日：\n${samplePatch}`);
      }
      sections.push(parts.filter(Boolean).join('\n'));
    } else if (stage === 'complete' && stageGuides.complete) {
      sections.push(`[阶段 · 收束相]\n${stageGuides.complete}`);
    } else if (stage === 'executing') {
      const resolved = resolvePhaseEvent(config, narrative, currentNodeId, phaseIndex, act);
      if (resolved?.kind === 'pinned') {
        sections.push(renderPinnedTemplate(resolved.template, phaseIndex));
      } else if (resolved?.kind === 'flavor') {
        sections.push(renderFateFlavor(resolved.flavorText, phaseIndex, resolved.slotKey));
      }
      sections.push(buildEventTreeSection(act, config, currentNodeId, phaseIndex, currentSlot, currentFloorKey));
    }

    if (!sections.length) return '';
    return `<ace0_act_narrative ${headerAttrs}>\n${sections.join('\n\n')}\n</ace0_act_narrative>`;
  }

  function evaluateCompletionTransition(actStateInput, heroStateInput) {
    const act = normalizeActState(actStateInput);
    const chapter = getChapter(act.id);
    const runtime = getChapterRuntime(chapter);
    const completionTransition = runtime?.completionTransition;
    if (!completionTransition?.targetChapterId) {
      return { eligible: false, reason: 'no_completion_transition' };
    }

    const defaultRouteNode = Array.isArray(getDefaultActState(act.id).route_history) && getDefaultActState(act.id).route_history.length
      ? getDefaultActState(act.id).route_history[0]
      : '';
    const currentNodeId = act.route_history[act.nodeIndex - 1]
      || act.route_history[act.route_history.length - 1]
      || defaultRouteNode;
    const currentNode = getNodeRuntime(chapter, currentNodeId);
    const nextMode = normalizeTrimmedString(currentNode?.next?.mode, 'none').toLowerCase();
    const transitionReady = nextMode === 'none' || act.stage === 'complete';
    if (!transitionReady) {
      return { eligible: false, reason: 'transition_not_ready', currentNodeId };
    }

    const targetChapter = getChapter(completionTransition.targetChapterId);
    if (!targetChapter) {
      return { eligible: false, reason: 'missing_target_chapter' };
    }

    const currentFunds = Math.max(0, Number(heroStateInput?.funds) || 0);
    const minFunds = Math.max(0, Number(completionTransition?.conditions?.minFunds) || 0);
    if (currentFunds < minFunds) {
      return {
        eligible: false,
        reason: 'funds_below_min',
        currentFunds,
        minFunds,
        sourceChapterId: act.id,
        targetChapterId: completionTransition.targetChapterId
      };
    }

    return {
      eligible: true,
      sourceChapterId: act.id,
      targetChapterId: completionTransition.targetChapterId,
      sourceNodeId: currentNodeId,
      currentFunds,
      minFunds,
      targetActState: getDefaultActState(completionTransition.targetChapterId),
      prompt: deepClone(completionTransition.prompt || {})
    };
  }

  function buildCompletionTransitionPromptContent(transitionResult, options = {}) {
    if (!transitionResult?.eligible) return '';
    const mode = normalizeTrimmedString(options?.mode, 'request').toLowerCase();
    const sourceChapter = getChapter(transitionResult.sourceChapterId);
    const targetChapter = getChapter(transitionResult.targetChapterId);
    const sourceTitle = normalizeTrimmedString(sourceChapter?.meta?.title, transitionResult.sourceChapterId || 'CURRENT_CHAPTER');
    const targetTitle = normalizeTrimmedString(targetChapter?.meta?.title, transitionResult.targetChapterId || 'NEXT_CHAPTER');
    const customTitle = normalizeTrimmedString(transitionResult?.prompt?.title, '');
    const customBody = normalizeTrimmedString(transitionResult?.prompt?.body, '');
    const lines = mode === 'entered'
      ? [
          '[章节切换]',
          customTitle || `${sourceTitle} 已结束，切入 ${targetTitle}。`,
          customBody || `上一章已经满足进入下一章的条件。后续叙事直接从 ${targetTitle} 的起始节点继续。`,
          `当前资金：${transitionResult.currentFunds.toFixed(2)}`,
          `切换结果：当前 ACT 已进入 ${targetTitle}。请不要再把叙事停留在上一章结束后的空档。`
        ]
      : [
          '[可转章状态]',
          customTitle || `${sourceTitle} 已进入可转章状态，可视叙事结果切入 ${targetTitle}。`,
          customBody || `只有当本轮叙事已经明确满足转章条件时，才推进到 ${targetTitle}。如果条件还没真正落地，就留在当前章节继续写。`,
          `当前节点：${normalizeTrimmedString(transitionResult.sourceNodeId, 'UNKNOWN_NODE')}`,
          `当前资金：${transitionResult.currentFunds.toFixed(2)}（门槛：${transitionResult.minFunds.toFixed(2)}）`,
          `若本轮决定切章，请在 UpdateVariable 中写入 world.act.transitionRequestTarget = "${transitionResult.targetChapterId}"。`,
          `若尚未切章，不要改 world.act.id，也不要写 transitionRequestTarget。`
        ];
    return `<ace0_act_transition from="${transitionResult.sourceChapterId}" to="${transitionResult.targetChapterId}">\n${lines.join('\n')}\n</ace0_act_transition>`;
  }

      return {
        buildFirstMeetPromptContent,
        buildPreSignalPromptContent,
        buildActStateSummaryFromDerived,
        NARRATIVE_TENSION_TIERS: deepClone(NARRATIVE_TENSION_TIERS),
        pickNarrativeTensionTier,
        buildNarrativePacingSummary,
        hashStringToSeed,
        mulberry32,
        pickFromCandidates,
        resolvePhaseEvent,
        findPinnedEvent,
        resolveNodeGuide,
        renderPinnedTemplate,
        renderFateFlavor,
        formatPhaseAction,
        buildNarrativePromptContentFromDerived,
        buildPhasePlanConfirmedPromptContent,
        evaluateCompletionTransition,
        buildCompletionTransitionPromptContent
      };
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
