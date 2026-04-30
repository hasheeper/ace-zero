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

  function buildCharterPromptContent(narrative) {
    const charter = narrative && narrative.charter;
    if (!charter) return '';
    const laws = Array.isArray(charter.ironLaws) && charter.ironLaws.length
      ? charter.ironLaws.map((law, index) => `${index + 1}. ${law}`).join('\n')
      : '';
    const bounds = charter.bounds && typeof charter.bounds === 'object' ? charter.bounds : {};
    const forbid = Array.isArray(bounds.forbid) && bounds.forbid.length
      ? bounds.forbid.map((item, index) => `${index + 1}. ${item}`).join('\n')
      : '';
    const closeWhen = Array.isArray(bounds.closeWhen) && bounds.closeWhen.length
      ? bounds.closeWhen.map((item, index) => `${index + 1}. ${item}`).join('\n')
      : '';
    const body = [
      '[使用方式]\n这是章节级节奏指导，用来帮助把握方向、轻重与收束位置；不是逐段强制命令。',
      charter.theme ? `[主题]\n${charter.theme}` : '',
      laws ? `[铁律]\n${laws}` : '',
      bounds.focus ? `[边界]\n${bounds.focus}` : '',
      forbid ? `[不要展开]\n${forbid}` : '',
      closeWhen ? `[收束参考]\n${closeWhen}` : '',
      charter.successCriterion ? `[成功标准]\n${charter.successCriterion}` : ''
    ].filter(Boolean).join('\n\n');
    if (!body.trim()) return '';
    return `<ace0_act_charter>\n${body}\n</ace0_act_charter>`;
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

  function normalizePhaseGuideCandidates(guide) {
    if (!guide || typeof guide !== 'object') return [];
    if (Array.isArray(guide.candidates) && guide.candidates.length) {
      return guide.candidates.filter((c) => c && typeof c === 'object');
    }
    // 向后兼容：旧结构 { direction } 当 1 候选
    if (typeof guide.direction === 'string' && guide.direction) {
      return [{
        id: 'legacy',
        weight: 1,
        direction: guide.direction,
        mustEnd: typeof guide.mustEnd === 'string' ? guide.mustEnd : ''
      }];
    }
    return [];
  }

  function collectUsedPackIds(act) {
    const picked = act?.pickedPacks;
    if (!picked || typeof picked !== 'object') return [];
    const ids = [];
    Object.values(picked).forEach((perNode) => {
      if (perNode && typeof perNode === 'object') {
        Object.values(perNode).forEach((id) => {
          if (typeof id === 'string' && id) ids.push(id);
        });
      }
    });
    return ids;
  }

  function getPoolFallbackText(guide, slotKey) {
    if (guide && typeof guide.fallback === 'string' && guide.fallback.trim()) return guide.fallback.trim();
    const label = (guide && guide.summary) || slotKey || '命运事件';
    return `本章节的${label}候选已全部消耗。本段作自然过场推进即可，不再增加新的命运事件。`;
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
      const guide = slotKey && narrative?.phaseGuides?.[slotKey];
      return { kind: 'flavor', flavorText: fateFlavor, guide, slotKey };
    }

    // L3 章级 phaseGuides 随机池：玩家规划点数或 Vision 替换固定相位时触发。
    if (!slotKeyFromToken && !slotKeyFromReplacement) return null;

    const guide = narrative?.phaseGuides?.[slotKeyFromToken || slotKeyFromReplacement];
    const candidates = normalizePhaseGuideCandidates(guide);
    if (!candidates.length) return null;

    // 已抽过：从 pickedPacks 读回，保证同一 segment 重入稳定
    const pickedId = act?.pickedPacks?.[nodeId]?.[phaseIndex];
    if (pickedId) {
      const found = candidates.find((c) => c.id === pickedId);
      if (found) {
        return { kind: 'pooled', candidate: found, guide, slotKey: slotKeyFromToken || slotKeyFromReplacement, isNew: false };
      }
      // pickedId 不在当前池里（candidate 被删或改名）→ 穿透到重抽分支
    }

    // 滤掉全局已用（跨 node/seg）
    const usedIds = collectUsedPackIds(act);
    const available = candidates.filter((c) => !usedIds.includes(c.id));

    // 池空：所有候选已被消耗 → 通用兜底
    if (!available.length) {
      const effectiveSlotKey = slotKeyFromToken || slotKeyFromReplacement;
      return {
        kind: 'fallback',
        guide,
        slotKey: effectiveSlotKey,
        fallbackText: getPoolFallbackText(guide, effectiveSlotKey)
      };
    }

    const seedStr = `${act?.seed || 'AUTO'}::${nodeId}::${phaseIndex}`;
    const picked = pickFromCandidates(available, seedStr);
    return { kind: 'pooled', candidate: picked, guide, slotKey: slotKeyFromToken || slotKeyFromReplacement, isNew: true };
  }

  // 给 host 调：在段位推进前将本段的抽签结果落存到 actState.pickedPacks。
  // 幂等：已落存的 segment 不会重抄。只对 isNew 的 pooled 结果写入。
  function commitPackUsageForPhase(actState, config, narrative, nodeId, phaseIndex) {
    if (!actState || typeof actState !== 'object') return false;
    const resolved = resolvePhaseEvent(config, narrative, nodeId, phaseIndex, actState);
    if (resolved?.kind !== 'pooled' || !resolved.isNew || !resolved.candidate?.id) return false;
    if (!actState.pickedPacks || typeof actState.pickedPacks !== 'object') {
      actState.pickedPacks = {};
    }
    if (!actState.pickedPacks[nodeId] || typeof actState.pickedPacks[nodeId] !== 'object') {
      actState.pickedPacks[nodeId] = {};
    }
    actState.pickedPacks[nodeId][phaseIndex] = resolved.candidate.id;
    return true;
  }

  function renderPooledCandidate(candidate, phaseIndex, guide, slotKey) {
    if (!candidate) return '';
    const summary = (guide && guide.summary) || slotKey || '';
    const segLabel = ACT_PHASE_LABELS[phaseIndex] || `段${phaseIndex + 1}`;
    const idTag = candidate.id ? ` #${candidate.id}` : '';
    const heading = `[命运事件 · ${segLabel}${summary ? ` · ${summary}` : ''}]${idTag}`;
    return [
      heading,
      candidate.direction ? `  方向: ${candidate.direction}` : '',
      candidate.castDirective ? `  出手: ${candidate.castDirective}` : '',
      candidate.mustEnd ? `  收束: ${candidate.mustEnd}` : ''
    ].filter(Boolean).join('\n');
  }

  function renderPoolFallback(fallbackText, phaseIndex, guide, slotKey) {
    const summary = (guide && guide.summary) || slotKey || '';
    const segLabel = ACT_PHASE_LABELS[phaseIndex] || `段${phaseIndex + 1}`;
    const heading = `[命运事件 · ${segLabel}${summary ? ` · ${summary}` : ''}] (池已消耗 · 通用兜底)`;
    return `${heading}\n${fallbackText}`;
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

  function renderFateFlavor(flavorText, phaseIndex, phaseGuide, tokenKey) {
    const label = (phaseGuide && phaseGuide.summary) || tokenKey || '';
    const segLabel = ACT_PHASE_LABELS[phaseIndex] || `段${phaseIndex + 1}`;
    const heading = `[命运事件 · ${segLabel}${label ? ` · ${label}` : ''}]`;
    return flavorText ? `${heading}\n${flavorText}` : heading;
  }

  function buildNarrativePromptContentFromDerived(derivedState) {
    if (!derivedState) return '';

    const { act, config, currentNodeId } = derivedState;
    const narrative = config && config.narrative;
    if (!narrative) return '';

    const stage = act?.stage || 'planning';
    const rawPhaseIndex = Math.round(Number(act?.phase_index) || 0);
    const phaseIndex = Math.max(0, Math.min(3, rawPhaseIndex));
    const phaseSlots = Array.isArray(act?.phase_slots) ? act.phase_slots : [];
    const currentSlot = phaseSlots[phaseIndex] || null;
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
        sections.push(renderFateFlavor(resolved.flavorText, phaseIndex, resolved.guide, resolved.slotKey));
      } else if (resolved?.kind === 'pooled') {
        sections.push(renderPooledCandidate(resolved.candidate, phaseIndex, resolved.guide, resolved.slotKey));
      } else if (resolved?.kind === 'fallback') {
        sections.push(renderPoolFallback(resolved.fallbackText, phaseIndex, resolved.guide, resolved.slotKey));
      }

      if (stageGuides.executing) {
        sections.push(`[阶段 · 执行相]\n${stageGuides.executing}`);
      }
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
        buildActStateSummaryFromDerived,
        NARRATIVE_TENSION_TIERS: deepClone(NARRATIVE_TENSION_TIERS),
        pickNarrativeTensionTier,
        buildNarrativePacingSummary,
        buildCharterPromptContent,
        hashStringToSeed,
        mulberry32,
        pickFromCandidates,
        normalizePhaseGuideCandidates,
        collectUsedPackIds,
        getPoolFallbackText,
        resolvePhaseEvent,
        commitPackUsageForPhase,
        renderPooledCandidate,
        renderPoolFallback,
        findPinnedEvent,
        resolveNodeGuide,
        renderPinnedTemplate,
        renderFateFlavor,
        buildNarrativePromptContentFromDerived,
        evaluateCompletionTransition,
        buildCompletionTransitionPromptContent
      };
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
