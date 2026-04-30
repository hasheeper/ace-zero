/**
 * ACEZERO ACT FRONTEND SNAPSHOT
 *
 * Owns Dashboard/frontend payload projection from ACT chapter config and
 * normalized ACT state. It does not mutate ACT execution state.
 */
(function initAceZeroActFrontendSnapshot(global) {
  'use strict';

  global.ACE0ActFrontendSnapshot = {
    create(options = {}) {
      const constants = options.constants || {};
      const deps = options.deps || {};
      const {
        DEFAULT_WORLD_ACT = { id: 'chapter0_exchange', seed: 'AUTO' },
        ACT_PHASE_LABELS = ['一段', '二段', '三段', '四段'],
        ACT_RESOURCE_KEYS = ['combat', 'rest', 'asset', 'vision'],
        ACT_RESOURCE_TYPE_MAP = { combat: 'COMBAT', rest: 'REST', asset: 'ASSET', vision: 'VISION' },
        ACT_RESOURCE_LABEL_MAP = { combat: '交锋', rest: '休整', asset: '资产', vision: '视野' }
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
        normalizeRules,
        normalizeVisionState,
        getChapter,
        getChapterRuntime,
        getNodeRuntime,
        getNodeTypeKey,
        getJumpRouteOptions,
        createRewardsForNode,
        buildEncounterMarkersForSnapshot
      } = deps;

  function getNodeDisplayLabel(nodeId, nodeRuntime) {
    const rawLabel = normalizeTrimmedString(nodeRuntime?.ui?.label, '');
    if (rawLabel) return rawLabel;
    return normalizeTrimmedString(String(nodeId || '').replace(/-/g, '_').toUpperCase(), 'UNASSIGNED_NODE');
  }

  function getNodeDisplaySubLabel(nodeRuntime) {
    return normalizeTrimmedString(
      nodeRuntime?.ui?.generatedTitle,
      normalizeTrimmedString(
        nodeRuntime?.narrative?.title,
        normalizeTrimmedString(
          nodeRuntime?.ui?.subtitle,
          normalizeTrimmedString(nodeRuntime?.narrative?.subtitle, 'UNASSIGNED NODE')
        )
      )
    );
  }

  function getNodeSortWeight(nodeRuntime, fallbackIndex = 0) {
    const label = getNodeDisplayLabel('', nodeRuntime);
    const suffixMatch = label.match(/_([A-Z])$/);
    if (suffixMatch) return suffixMatch[1].charCodeAt(0) - 64;
    return fallbackIndex + 1;
  }

  function getChapterNodesByIndex(config) {
    const grouped = new Map();
    Object.entries(config?.nodes || {}).forEach(([nodeId, nodeRuntime]) => {
      const nodeIndex = Math.max(1, Math.round(Number(nodeRuntime?.nodeIndex) || 1));
      if (!grouped.has(nodeIndex)) grouped.set(nodeIndex, []);
      grouped.get(nodeIndex).push([nodeId, nodeRuntime]);
    });
    return Array.from(grouped.entries())
      .sort((left, right) => left[0] - right[0])
      .map(([nodeIndex, entries]) => [
        nodeIndex,
        entries.sort((left, right) => getNodeSortWeight(left[1], 0) - getNodeSortWeight(right[1], 0) || left[0].localeCompare(right[0]))
      ]);
  }

  function getDefaultPresentNodeId(entries) {
    if (!entries.length) return null;
    return entries[Math.floor((entries.length - 1) / 2)][0];
  }

  function buildLimitedRewardsForNode(nodeRuntime) {
    const explicitLimited = Array.isArray(nodeRuntime?.planner?.limited)
      ? nodeRuntime.planner.limited
      : null;
    if (explicitLimited) {
      return explicitLimited
        .map((entry) => {
          const key = normalizeActResourceKey(entry?.key, '');
          if (!ACT_RESOURCE_KEYS.includes(key)) return null;
          const count = Math.max(0, Math.round(Number(entry?.count) || 0));
          if (!(count > 0)) return null;
          return {
            key,
            count,
            title: normalizeTrimmedString(entry?.title, `限定·${ACT_RESOURCE_LABEL_MAP[key]}点`),
            sublabel: normalizeTrimmedString(entry?.sublabel, `NODE-BOUND ${ACT_RESOURCE_TYPE_MAP[key]}`)
          };
        })
        .filter(Boolean);
    }

    const rewards = createRewardsForNode(nodeRuntime);
    return ACT_RESOURCE_KEYS
      .map((key) => {
        const count = Math.max(0, Math.round(Number(rewards[key]) || 0));
        if (!(count > 0)) return null;
        return {
          key,
          count,
          title: `限定·${ACT_RESOURCE_LABEL_MAP[key]}点`,
          sublabel: `NODE-BOUND ${ACT_RESOURCE_TYPE_MAP[key]}`
        };
      })
      .filter(Boolean);
  }

  function buildCampaignNodeFromEntries(nodeIndex, entries) {
    const selectableNodeIds = entries.map(([nodeId]) => nodeId);
    const defaultPresentNodeId = getDefaultPresentNodeId(entries);
    const defaultPresentNode = entries.find(([nodeId]) => nodeId === defaultPresentNodeId)?.[1] || null;
    const primaryNode = entries[0]?.[1] || null;
    const firstTransition = primaryNode?.next || { mode: 'none' };
    const isSingleNodeAtIndex = entries.length === 1;
    const template = isSingleNodeAtIndex ? 'fixed' : 'random';
    const nextForcedNodeId = firstTransition.mode === 'forced'
      ? normalizeTrimmedString(firstTransition.nodeId, null)
      : null;

    return {
      nodeIndex: nodeIndex,
      label: `NODE ${String(nodeIndex).padStart(2, '0')}`,
      template,
      title: isSingleNodeAtIndex
        ? getNodeDisplaySubLabel(primaryNode)
        : getNodeDisplaySubLabel(defaultPresentNode),
      subtitle: normalizeTrimmedString(
        (isSingleNodeAtIndex ? primaryNode : defaultPresentNode)?.narrative?.subtitle,
        isSingleNodeAtIndex
          ? getNodeDisplaySubLabel(primaryNode)
          : '多分支节点 / 选择后锁定一路'
      ),
      nodes: entries.map(([nodeId, nodeRuntime]) => ({
        id: nodeId,
        key: getNodeTypeKey(nodeRuntime) || 'vision',
        label: getNodeDisplayLabel(nodeId, nodeRuntime),
        sublabel: getNodeDisplaySubLabel(nodeRuntime),
        isBranch: !isSingleNodeAtIndex,
        lane: normalizeTrimmedString(nodeRuntime?.lane || nodeRuntime?.ui?.lane, ''),
        mainlineLanes: (Array.isArray(nodeRuntime?.mainlineLanes) ? nodeRuntime.mainlineLanes : [])
          .map((value) => normalizeTrimmedString(value, '').toLowerCase())
          .filter((value, index, list) => ['white', 'blue', 'orange', 'red'].includes(value) && list.indexOf(value) === index)
      })),
      selectableNodeIds,
      presentNode: defaultPresentNodeId,
      mapFocus: defaultPresentNodeId,
      nextRouteMode: normalizeTrimmedString(firstTransition.mode, 'none'),
      nextForcedNodeId,
      limited: isSingleNodeAtIndex ? buildLimitedRewardsForNode(primaryNode) : [],
      deadNodes: []
    };
  }

  function buildCampaignNodesFromV2(config) {
    return getChapterNodesByIndex(config).map(([nodeIndex, entries]) => buildCampaignNodeFromEntries(nodeIndex, entries));
  }

  function buildTopologyFromV2Nodes(config) {
    const topology = [];
    const seen = new Set();
    Object.entries(config?.nodes || {}).forEach(([nodeId, nodeRuntime]) => {
      const next = nodeRuntime?.next || null;
      if (!next || typeof next !== 'object') return;
      const pushEdge = (toId) => {
        const normalizedToId = normalizeTrimmedString(toId, '');
        if (!normalizedToId) return;
        const edgeKey = `${nodeId}=>${normalizedToId}`;
        if (seen.has(edgeKey)) return;
        seen.add(edgeKey);
        topology.push({ from: nodeId, to: normalizedToId });
      };
      if (next.mode === 'forced') {
        pushEdge(next.nodeId);
        return;
      }
      if (next.mode === 'choice') {
        (Array.isArray(next.options) ? next.options : []).forEach(pushEdge);
      }
    });
    return topology;
  }

  function buildFixedPhaseMarkersFromV2Nodes(config) {
    const markers = {};
    Object.entries(config?.nodes || {}).forEach(([nodeId, nodeRuntime]) => {
      const phases = Array.isArray(nodeRuntime?.phases) ? nodeRuntime.phases : [];
      phases.forEach((phase, phaseIndex) => {
        if (!phase || typeof phase !== 'object') return;
        const fixedKind = normalizeTrimmedString(phase.slot, '').toLowerCase();
        if (!phase.fixed && !phase.event) return;
        const kind = ACT_RESOURCE_KEYS.includes(fixedKind)
          ? fixedKind
          : getNodeTypeKey(nodeRuntime)
            ? getNodeTypeKey(nodeRuntime)
            : 'vision';
        if (!markers[nodeId]) markers[nodeId] = {};
        markers[nodeId][phaseIndex] = {
          kind,
          title: normalizeTrimmedString(
            phase.event?.title,
            `${getNodeDisplayLabel(nodeId, nodeRuntime)} · ${ACT_PHASE_LABELS[phaseIndex]}`
          )
        };
      });
    });
    return markers;
  }

  function applyVisionReplacementMarkers(markersInput, actStateInput) {
    const markers = markersInput && typeof markersInput === 'object' ? markersInput : {};
    const pending = normalizeVisionState(actStateInput?.vision).pendingReplace;
    if (!pending || pending.status !== 'ready') return markers;
    const nodeId = normalizeTrimmedString(pending.nodeId || pending.targetNodeId, '');
    const phaseIndex = Math.max(0, Math.min(3, Math.round(Number(pending.phaseIndex) || 0)));
    const replacementKey = normalizeActResourceKey(pending.replacementKey || pending.key, '');
    if (!nodeId || !ACT_RESOURCE_KEYS.includes(replacementKey)) return markers;
    if (!markers[nodeId]) markers[nodeId] = {};
    markers[nodeId][phaseIndex] = {
      kind: replacementKey,
      title: `VISION REPLACE · ${ACT_RESOURCE_TYPE_MAP[replacementKey]}`
    };
    return markers;
  }

  function createFrontendSnapshot(options) {
    const actState = normalizeActState(options?.actState);
    const chapter = getChapter(actState.id);
    const runtime = getChapterRuntime(chapter);
    const frontend = chapter?.frontend && typeof chapter.frontend === 'object' ? chapter.frontend : {};
    const chapterTotalNodes = Math.max(
      1,
      Math.round(Number(chapter?.totalNodes) || Number(chapter?.meta?.totalNodes) || 1)
    );
    const campaignNodes = buildCampaignNodesFromV2(chapter);
    const campaignConfig = {
      seed: normalizeTrimmedString(actState.seed, runtime.seed || frontend?.campaign?.seed || DEFAULT_WORLD_ACT.seed),
      totalNodes: Math.max(1, Math.round(Number(frontend?.campaign?.totalNodes) || chapterTotalNodes || campaignNodes.length || 1)),
      rules: deepClone(runtime.rules || normalizeRules(frontend?.campaign?.rules)),
      reserveGrowthByNode: deepClone(runtime.reserveGrowthByNode || frontend?.campaign?.reserveGrowthByNode || []),
      nodes: deepClone(campaignNodes)
    };
    const currentNodeIndex = Math.max(1, Math.min(campaignConfig.totalNodes || chapterTotalNodes || 1, Math.round(Number(actState.nodeIndex) || 1)));
    const routeHistory = Array.isArray(actState.route_history) ? [...actState.route_history] : [];
    const currentNodeId = routeHistory[currentNodeIndex - 1]
      || routeHistory[routeHistory.length - 1]
      || campaignConfig.nodes?.[0]?.selectableNodeIds?.[0]
      || '';
    const currentNodeRuntime = getNodeRuntime(chapter, currentNodeId);
    const routeTransition = currentNodeRuntime?.next || { mode: 'none' };
    const jumpRouteOptions = actState.vision?.jumpReady === true ? getJumpRouteOptions(chapter, actState) : [];
    const routeMode = actState.stage === 'route' && jumpRouteOptions.length > 0
      ? 'jump'
      : routeTransition.mode;
    const routeOptions = routeMode === 'jump'
      ? jumpRouteOptions
      : routeTransition.mode === 'choice'
      ? deepClone(routeTransition.options || [])
      : routeTransition.mode === 'forced' && routeTransition.nodeId
        ? [routeTransition.nodeId]
        : [];
    const topology = buildTopologyFromV2Nodes(chapter);
    const fixedPhaseMarkers = applyVisionReplacementMarkers(buildFixedPhaseMarkersFromV2Nodes(chapter), actState);
    const currentNodeTemplate = campaignConfig.nodes.find((cNode) => cNode.nodeIndex === currentNodeIndex) || null;
    const currentLimitedRewards = buildLimitedRewardsForNode(currentNodeRuntime).length
      ? buildLimitedRewardsForNode(currentNodeRuntime)
      : deepClone(currentNodeTemplate?.limited || []);

    return {
      chapterId: chapter?.id || actState.id,
      chapterMeta: deepClone(chapter?.meta || {}),
      totalNodes: chapterTotalNodes,
      runtime: deepClone(runtime),
      reserveGrowthByNode: deepClone(runtime.reserveGrowthByNode || []),
      managedCharacters: deepClone(runtime.managedCharacters || []),
      initialEffects: {
        activate: deepClone(runtime.initialCast?.activate || []),
        introduce: deepClone(runtime.initialCast?.introduce || []),
        present: deepClone(runtime.initialCast?.present || []),
        join_party: deepClone(runtime.initialCast?.joinParty || runtime.initialCast?.join_party || [])
      },
      currentNodeIndex,
      currentNodeId,
      routeHistory,
      stage: actState.stage,
      actState,
      campaign: campaignConfig,
      nodes: deepClone(campaignConfig.nodes || []),
      topology,
      nodeCatalog: deepClone(chapter?.nodes || {}),
      narrative: deepClone(chapter?.narrative || {}),
      fixedPhaseMarkers,
      encounterMarkers: buildEncounterMarkersForSnapshot(actState),
      routeMode,
      routeOptions,
      currentLimitedRewards
    };
  }

      return {
        getNodeDisplayLabel,
        getNodeDisplaySubLabel,
        getNodeSortWeight,
        getChapterNodesByIndex,
        getDefaultPresentNodeId,
        buildLimitedRewardsForNode,
        buildCampaignNodeFromEntries,
        buildCampaignNodesFromV2,
        buildTopologyFromV2Nodes,
        buildFixedPhaseMarkersFromV2Nodes,
        applyVisionReplacementMarkers,
        createFrontendSnapshot
      };
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
