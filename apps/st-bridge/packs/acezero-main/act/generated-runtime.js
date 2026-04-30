/**
 * AceZero ACT generated-route runtime.
 *
 * Loaded after act/generated-data.js and before act/plugin.js.
 * Owns generated tail normalization, motif/lane graph generation, and generated
 * node naming.
 */
(function installAceZeroActGeneratedRuntime(global) {
  'use strict';

  function hashStringToSeed(str) {
    let hash = 2166136261;
    const source = String(str || '');
    for (let index = 0; index < source.length; index += 1) {
      hash ^= source.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function mulberry32(seed) {
    let value = seed >>> 0;
    return function nextRandom() {
      value += 0x6D2B79F5;
      let next = value;
      next = Math.imul(next ^ (next >>> 15), next | 1);
      next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
      return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
    };
  }

  function createAceZeroActGeneratedRuntime(options = {}) {
    const ACT_GENERATED_DATA = options.data || global.ACE0ActGeneratedData || {};
    const deps = options.deps || {};
    const deepClone = typeof deps.deepClone === 'function' ? deps.deepClone : (value) => value == null ? value : JSON.parse(JSON.stringify(value));
    const normalizeTrimmedString = typeof deps.normalizeTrimmedString === 'function' ? deps.normalizeTrimmedString : (value, fallback) => {
      const normalized = typeof value === 'string' ? value.trim() : '';
      return normalized || fallback;
    };
    const normalizeActResourceKey = typeof deps.normalizeActResourceKey === 'function' ? deps.normalizeActResourceKey : (value, fallback = 'vision') => {
      const normalized = normalizeTrimmedString(value, fallback).toLowerCase();
      return (deps.actResourceKeys || []).includes(normalized) ? normalized : fallback;
    };
    const DEFAULT_WORLD_ACT = deps.defaultWorldAct || { seed: 'AUTO' };
    const ACT_RESOURCE_KEYS = Array.isArray(deps.actResourceKeys) ? deps.actResourceKeys : ['combat', 'rest', 'asset', 'vision'];
    const getNodeSortWeight = typeof deps.getNodeSortWeight === 'function'
      ? deps.getNodeSortWeight
      : (_nodeRuntime, fallbackIndex = 0) => fallbackIndex + 1;

  function normalizeGeneratedTailConfig(value, fallbackTotalNodes) {
    const source = value && typeof value === 'object' ? value : {};
    const enabled = source.enabled === true;
    const mode = normalizeTrimmedString(source.mode, 'motif').toLowerCase();
    const totalNodes = Math.max(1, Math.round(Number(source.totalNodes) || fallbackTotalNodes || 1));
    const startNodeIndex = Math.max(1, Math.min(totalNodes, Math.round(Number(source.startNodeIndex) || 1)));
    const attachFromNodeIds = Array.isArray(source.attachFromNodeIds)
      ? source.attachFromNodeIds.map((value) => normalizeTrimmedString(value, '')).filter(Boolean)
      : [];
    const expectedLayerCount = Math.max(0, totalNodes - startNodeIndex + 1);
    const rawSegmentSizes = Array.isArray(source.segmentSizes) ? source.segmentSizes : [];
    const segmentSizes = [];
    let remaining = expectedLayerCount;
    rawSegmentSizes.forEach((value) => {
      if (remaining <= 0) return;
      const size = Math.max(1, Math.round(Number(value) || 0));
      const normalized = Math.min(size, remaining);
      segmentSizes.push(normalized);
      remaining -= normalized;
    });
    while (remaining > 0) {
      const nextSize = Math.min(4, remaining);
      segmentSizes.push(nextSize);
      remaining -= nextSize;
    }

    const motifPoolBySizeSource = source.motifPoolBySize && typeof source.motifPoolBySize === 'object'
      ? source.motifPoolBySize
      : {};
    const motifPoolBySize = {};
    Object.entries(motifPoolBySizeSource).forEach(([sizeKey, pool]) => {
      const size = Math.max(1, Math.round(Number(sizeKey) || 0));
      if (!Array.isArray(pool) || !size) return;
      motifPoolBySize[size] = pool.map((value) => normalizeTrimmedString(value, '')).filter(Boolean);
    });
    const shapeProfiles = Array.isArray(source.shapeProfiles)
      ? source.shapeProfiles
        .map((profile) => {
          if (!profile || typeof profile !== 'object') return null;
          const motifs = Array.isArray(profile.motifs)
            ? profile.motifs.map((value) => normalizeTrimmedString(value, '')).filter(Boolean)
            : [];
          if (!motifs.length) return null;
          return {
            id: normalizeTrimmedString(profile.id, 'generated_profile'),
            motifs
          };
        })
        .filter(Boolean)
      : [];
    const laneNodeIndexSource = source.laneNodeIndex && typeof source.laneNodeIndex === 'object'
      ? source.laneNodeIndex
      : {};
    const laneNodeIndex = {
      opening: Math.max(startNodeIndex, Math.min(totalNodes, Math.round(Number(laneNodeIndexSource.opening) || startNodeIndex))),
      fullLaneStart: Math.max(startNodeIndex, Math.min(totalNodes, Math.round(Number(laneNodeIndexSource.fullLaneStart) || Math.max(startNodeIndex + 1, startNodeIndex)))),
      fullLaneEnd: Math.max(startNodeIndex, Math.min(totalNodes, Math.round(Number(laneNodeIndexSource.fullLaneEnd) || Math.max(startNodeIndex + 1, totalNodes - 2)))),
      collapse: Math.max(startNodeIndex, Math.min(totalNodes, Math.round(Number(laneNodeIndexSource.collapse) || Math.max(startNodeIndex + 1, totalNodes - 1)))),
      finale: Math.max(startNodeIndex, Math.min(totalNodes, Math.round(Number(laneNodeIndexSource.finale) || totalNodes)))
    };
    return {
      enabled,
      mode,
      attachFromNodeId: normalizeTrimmedString(source.attachFromNodeId, ''),
      attachFromNodeIds,
      startNodeIndex,
      totalNodes,
      segmentSizes,
      motifPoolBySize,
      shapeProfiles,
      laneNodeIndex
    };
  }

  function isGeneratedNodeTypeMarker(nodeRuntime) {
    if (!nodeRuntime || typeof nodeRuntime !== 'object') return false;
    const kind = normalizeTrimmedString(nodeRuntime.kind, '').toLowerCase();
    const key = normalizeTrimmedString(nodeRuntime.key, '').toLowerCase();
    return kind === 'random' || key === 'random';
  }

  function shuffleResourceTypeKeys(seedStr) {
    const keys = [...ACT_RESOURCE_KEYS];
    const rng = mulberry32(hashStringToSeed(seedStr));
    for (let index = keys.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(rng() * (index + 1));
      [keys[index], keys[swapIndex]] = [keys[swapIndex], keys[index]];
    }
    return keys;
  }

  function applyGeneratedNodeTypesToChapter(chapterConfig) {
    if (!chapterConfig?.nodes || typeof chapterConfig.nodes !== 'object') return chapterConfig;
    const grouped = new Map();
    const chapterSeed = normalizeTrimmedString(chapterConfig?.runtime?.seed, DEFAULT_WORLD_ACT.seed);

    Object.entries(chapterConfig.nodes).forEach(([nodeId, nodeRuntime]) => {
      const nodeIndex = Math.max(1, Math.round(Number(nodeRuntime?.nodeIndex) || 1));
      if (!grouped.has(nodeIndex)) grouped.set(nodeIndex, []);
      grouped.get(nodeIndex).push([nodeId, nodeRuntime]);
    });

    grouped.forEach((entries, nodeIndex) => {
      const randomEntries = entries
        .filter(([, nodeRuntime]) => isGeneratedNodeTypeMarker(nodeRuntime))
        .sort((left, right) => getNodeSortWeight(left[1], 0) - getNodeSortWeight(right[1], 0) || left[0].localeCompare(right[0]));
      if (!randomEntries.length) return;

      const shuffledTypes = shuffleResourceTypeKeys(`${chapterSeed}|${nodeIndex}`);
      randomEntries.forEach(([nodeId], entryIndex) => {
        const targetNode = chapterConfig.nodes[nodeId];
        const generatedType = shuffledTypes[entryIndex % shuffledTypes.length] || 'vision';
        if (!targetNode || typeof targetNode !== 'object') return;
        if (normalizeTrimmedString(targetNode.kind, '').toLowerCase() === 'random') {
          targetNode.kind = generatedType;
        }
        if (normalizeTrimmedString(targetNode.key, '').toLowerCase() === 'random') {
          targetNode.key = generatedType;
        }
      });
    });

    return chapterConfig;
  }

  function getGeneratedTailMotifRegistry() {
    return ACT_GENERATED_DATA.GENERATED_TAIL_MOTIF_REGISTRY || {};
  }

  function cloneGeneratedTailMotif(motifId) {
    const motif = getGeneratedTailMotifRegistry()[motifId];
    return motif ? deepClone(motif) : null;
  }

  function listGeneratedMotifsForSize(size) {
    return Object.values(getGeneratedTailMotifRegistry())
      .filter((motif) => Math.max(1, Math.round(Number(motif?.size) || 0)) === Math.max(1, Math.round(Number(size) || 0)))
      .map((motif) => motif.id);
  }

  function selectGeneratedMotifId(size, configuredPool, seed, segmentIndex, requireFinalMerge = false) {
    const motifRegistry = getGeneratedTailMotifRegistry();
    const basePool = Array.isArray(configuredPool) && configuredPool.length
      ? configuredPool
      : listGeneratedMotifsForSize(size);
    const eligiblePool = basePool.filter((motifId) => {
      const motif = motifRegistry[motifId];
      if (!motif || motif.size !== size) return false;
      if (!requireFinalMerge) return true;
      return Array.isArray(motif.counts) && motif.counts[motif.counts.length - 1] === 1;
    });
    const pool = eligiblePool.length ? eligiblePool : listGeneratedMotifsForSize(size);
    if (!pool.length) return null;
    const rng = mulberry32(hashStringToSeed(`${seed}|segment|${segmentIndex}|${size}`));
    return pool[Math.floor(rng() * pool.length)] || pool[0];
  }

  function getGeneratedShapeProfiles(generatedTail) {
    return Array.isArray(generatedTail?.shapeProfiles) ? generatedTail.shapeProfiles : [];
  }

  function selectGeneratedShapeProfile(generatedTail, seed) {
    const profiles = getGeneratedShapeProfiles(generatedTail)
      .filter((profile) => Array.isArray(profile.motifs) && profile.motifs.length);
    if (!profiles.length) return null;
    const rng = mulberry32(hashStringToSeed(`${seed}|shape-profile`));
    return profiles[Math.floor(rng() * profiles.length)] || profiles[0];
  }

  function normalizeGeneratedSelectionPattern(pattern, currentCount, nextCount) {
    const strictLadders = {
      '4->5': [[0, 1], [1, 2], [2, 3], [3, 4]],
      '5->4': [[0], [0, 1], [1, 2], [2, 3], [3]]
    };
    const strictPattern = strictLadders[`${currentCount}->${nextCount}`] || null;
    const normalized = Array.from({ length: currentCount }, (_, sourceIndex) => {
      const allowedTargets = strictPattern
        ? strictPattern[sourceIndex] || []
        : null;
      const anchor = strictPattern
        ? (allowedTargets[0] ?? 0)
        : Math.max(0, Math.min(nextCount - 1, Math.round((sourceIndex / Math.max(1, currentCount - 1 || 1)) * Math.max(0, nextCount - 1))));
      const rawTargets = Array.isArray(pattern?.[sourceIndex]) ? pattern[sourceIndex] : [];
      const targets = rawTargets
        .map((targetIndex) => Math.max(0, Math.min(nextCount - 1, Math.round(Number(targetIndex) || 0))))
        .filter((targetIndex) => (allowedTargets ? allowedTargets.includes(targetIndex) : Math.abs(targetIndex - anchor) <= 1))
        .filter((value, index, list) => list.indexOf(value) === index)
        .sort((left, right) => left - right);
      if (targets.length) return targets;
      if (allowedTargets?.length) return [allowedTargets[0]];
      return [anchor];
    });

    for (let targetIndex = 0; targetIndex < nextCount; targetIndex += 1) {
      const covered = normalized.some((targets) => targets.includes(targetIndex));
      if (covered) continue;
      const attachIndex = strictPattern
        ? Math.max(0, strictPattern.findIndex((targets) => Array.isArray(targets) && targets.includes(targetIndex)))
        : Math.max(0, Math.min(currentCount - 1, Math.round((targetIndex / Math.max(1, nextCount - 1 || 1)) * Math.max(0, currentCount - 1))));
      normalized[attachIndex] = [...normalized[attachIndex], targetIndex]
        .filter((value, index, list) => list.indexOf(value) === index)
        .sort((left, right) => left - right);
    }

    return normalized;
  }

  function getBridgePatternCandidates(currentCount, nextCount) {
    const key = `${currentCount}->${nextCount}`;
    const patterns = {
      '1->1': [[[0]]],
      '1->2': [[[0, 1]]],
      '1->3': [[[0, 1, 2]]],
      '2->1': [[[0], [0]]],
      '2->2': [
        [[0], [1]],
        [[0], [0, 1]],
        [[0, 1], [1]],
        [[1], [0]]
      ],
      '2->3': [
        [[0, 1], [1, 2]],
        [[0, 1], [2]],
        [[0], [1, 2]]
      ],
      '3->1': [[[0], [0], [0]]],
      '3->2': [
        [[0], [0, 1], [1]],
        [[0, 1], [1], [0]]
      ],
      '3->3': [
        [[0], [1], [2]],
        [[0, 1], [1], [1, 2]]
      ]
    };
    return patterns[key] || [Array.from({ length: currentCount }, (_, index) => [Math.max(0, Math.min(nextCount - 1, index % Math.max(1, nextCount)))])];
  }

  function selectBridgePattern(currentCount, nextCount, seed) {
    const candidates = getBridgePatternCandidates(currentCount, nextCount);
    const rng = mulberry32(hashStringToSeed(seed));
    const pattern = candidates[Math.floor(rng() * candidates.length)] || candidates[0];
    return normalizeGeneratedSelectionPattern(pattern, currentCount, nextCount);
  }

  function getGeneratedNodeRole(nodeIndex, layerCount, totalNodes, previousLayerCount, nextLayerCount) {
    if (nodeIndex >= totalNodes) return 'finale';
    if (layerCount > 1) return 'branch';
    if (previousLayerCount > 1) return 'merge';
    if (nextLayerCount > 1) return 'split';
    return 'path';
  }

  function getGeneratedNodeSubtitle(role, branchLabel) {
    if (role === 'finale') return 'FINAL RECKONING';
    if (role === 'merge') return 'MERGE LINE';
    if (role === 'split') return 'SPLIT GATE';
    if (role === 'branch') return `ROUTE ${branchLabel || 'A'}`;
    return 'DESCENT PATH';
  }

  function getGeneratedNodeNarrativeTitle(nodeIndex, role, branchLabel) {
    const base = `GENERATED NODE ${String(nodeIndex).padStart(2, '0')}`;
    if (role === 'finale') return `${base} · FINALE`;
    if (role === 'merge') return `${base} · MERGE`;
    if (role === 'split') return `${base} · SPLIT`;
    if (role === 'branch') return `${base} · ROUTE ${branchLabel || 'A'}`;
    return `${base} · PATH`;
  }

  function createGeneratedNodeId(nodeIndex, branchIndex, layerCount, role) {
    const padded = String(nodeIndex).padStart(2, '0');
    if (role === 'finale') return `node${padded}-finale`;
    if (layerCount <= 1) {
      if (role === 'merge') return `node${padded}-merge`;
      if (role === 'split') return `node${padded}-split`;
      return `node${padded}-path`;
    }
    const branchLabel = String.fromCharCode(97 + branchIndex);
    return `node${padded}-${branchLabel}-route`;
  }

  function createGeneratedNodeSkeleton(options) {
    const nodeIndex = Math.max(1, Math.round(Number(options?.nodeIndex) || 1));
    const layerCount = Math.max(1, Math.round(Number(options?.layerCount) || 1));
    const branchIndex = Math.max(0, Math.round(Number(options?.branchIndex) || 0));
    const role = normalizeTrimmedString(options?.role, 'path').toLowerCase();
    const branchLabel = String.fromCharCode(65 + branchIndex);
    const nodeId = createGeneratedNodeId(nodeIndex, branchIndex, layerCount, role);
    const labelSuffix = layerCount > 1 ? `_${branchLabel}` : '';
    const title = getGeneratedNodeNarrativeTitle(nodeIndex, role, branchLabel);
    const subtitle = getGeneratedNodeSubtitle(role, branchLabel);
    const isFinale = role === 'finale';
    return {
      id: nodeId,
      nodeIndex,
      kind: isFinale ? 'vision' : 'random',
      key: isFinale ? 'vision' : 'random',
      ui: {
        label: `NODE_${String(nodeIndex).padStart(2, '0')}${labelSuffix}`,
        subtitle,
        variant: isFinale ? 'finale' : undefined
      },
      planner: {
        limited: []
      },
      cast: {
        onEnter: {
          present: ['RINO']
        }
      },
      narrative: {
        title,
        subtitle,
        overview: isFinale
          ? '这是种子生成路线的终局节点。把前面的路径结果收口，形成初章终局。'
          : '这是由 seed 自动生成的路线节点，用来承接初章前三节点后的后续推进。按当前节点类型和路径位置继续写。',
        guidance: isFinale
          ? '在这里收束这一整章，不再继续向外展开。'
          : '保持节点推进感，写出从上一节点承接下来的路线变化。'
      },
      phases: [
        { index: 0, slot: null, fixed: false },
        { index: 1, slot: null, fixed: false },
        { index: 2, slot: null, fixed: false },
        { index: 3, slot: null, fixed: false }
      ],
      next: { mode: 'none' }
    };
  }

  function getGeneratedLaneDefs() {
    return ACT_GENERATED_DATA.GENERATED_LANE_DEFS || [];
  }

  function getGeneratedLaneDef(laneKey) {
    const defs = getGeneratedLaneDefs();
    return defs.find((entry) => entry.key === laneKey) || defs[0];
  }

  function createLaneBackboneNode(options) {
    const nodeIndex = Math.max(1, Math.round(Number(options?.nodeIndex) || 1));
    const finale = options?.finale === true;
    if (finale) {
      const node = createGeneratedNodeSkeleton({ nodeIndex, layerCount: 1, branchIndex: 0, role: 'finale' });
      node.ui.subtitle = 'FOUR-LANE FINALE';
      node.narrative.title = `GENERATED NODE ${String(nodeIndex).padStart(2, '0')} · FOUR-LANE FINALE`;
      node.narrative.subtitle = 'FOUR-LANE FINALE';
      node.narrative.overview = '四条主线在这里完成最终收束，形成初章终局。';
      node.narrative.guidance = '把四条主线的结果在这里收束，不再继续展开。';
      return node;
    }

    const laneDef = getGeneratedLaneDef(options?.laneKey);
    const layerCount = Math.max(1, Math.round(Number(options?.layerCount) || 4));
    const subtitle = normalizeTrimmedString(options?.subtitle, laneDef.subtitle);
    const title = normalizeTrimmedString(options?.title, laneDef.title);
    const branchIndexSource = options?.branchIndex;
    const branchIndex = Math.max(
      0,
      Math.round(
        Number.isFinite(Number(branchIndexSource))
          ? Number(branchIndexSource)
          : laneDef.branchIndex
      )
    );
    const mainlineLanes = (Array.isArray(options?.mainlineLanes) ? options.mainlineLanes : [laneDef.key])
      .map((value) => normalizeTrimmedString(value, '').toLowerCase())
      .filter((value, index, list) => ['white', 'blue', 'orange', 'red'].includes(value) && list.indexOf(value) === index);
    const node = createGeneratedNodeSkeleton({
      nodeIndex,
      layerCount,
      branchIndex,
      role: 'branch'
    });
    node.lane = laneDef.key;
    node.ui.lane = laneDef.key;
    node.mainlineLanes = mainlineLanes;
    node.ui.subtitle = subtitle;
    node.narrative.title = `GENERATED NODE ${String(nodeIndex).padStart(2, '0')} · ${title}`;
    node.narrative.subtitle = subtitle;
    node.narrative.overview = `这是初章四条主线中的 ${title} 节点，用来维持稳定的分线推进。`;
    node.narrative.guidance = '保持该线位的推进感，只在相邻线之间做局部交汇，不要让整张图乱飞。';
    return node;
  }

  function assignNodeNext(node, targetIds) {
    const normalizedTargetIds = (Array.isArray(targetIds) ? targetIds : [])
      .map((value) => normalizeTrimmedString(value, ''))
      .filter(Boolean);
    const uniqueTargetIds = normalizedTargetIds.filter((value, index, list) => list.indexOf(value) === index);
    if (!uniqueTargetIds.length) {
      node.next = { mode: 'none' };
      return;
    }
    node.next = uniqueTargetIds.length === 1
      ? { mode: 'forced', nodeId: uniqueTargetIds[0] }
      : { mode: 'choice', options: uniqueTargetIds };
  }

  function appendNodeNextTarget(node, targetId) {
    const normalizedTargetId = normalizeTrimmedString(targetId, '');
    if (!node || !normalizedTargetId) return;
    const existingTargetIds = [];
    const nextMode = normalizeTrimmedString(node?.next?.mode, 'none').toLowerCase();
    if (nextMode === 'forced') {
      existingTargetIds.push(normalizeTrimmedString(node?.next?.nodeId, ''));
    } else if (nextMode === 'choice') {
      existingTargetIds.push(...(Array.isArray(node?.next?.options) ? node.next.options : []));
    }
    assignNodeNext(node, [...existingTargetIds, normalizedTargetId]);
  }

  function getNodeNextTargetIds(node) {
    const nextMode = normalizeTrimmedString(node?.next?.mode, 'none').toLowerCase();
    if (nextMode === 'forced') {
      return [normalizeTrimmedString(node?.next?.nodeId, '')].filter(Boolean);
    }
    if (nextMode === 'choice') {
      return (Array.isArray(node?.next?.options) ? node.next.options : [])
        .map((value) => normalizeTrimmedString(value, ''))
        .filter(Boolean);
    }
    return [];
  }

  function countLaneCrossovers(chapterNodes) {
    const laneCounts = { white: 0, blue: 0, orange: 0, red: 0 };
    Object.entries(chapterNodes || {}).forEach(([nodeId, node]) => {
      const sourceLanes = (Array.isArray(node?.mainlineLanes) ? node.mainlineLanes : [])
        .map((value) => normalizeTrimmedString(value, '').toLowerCase())
        .filter(Boolean);
      getNodeNextTargetIds(node).forEach((targetId) => {
        const targetNode = chapterNodes?.[targetId];
        const targetLanes = (Array.isArray(targetNode?.mainlineLanes) ? targetNode.mainlineLanes : [])
          .map((value) => normalizeTrimmedString(value, '').toLowerCase())
          .filter(Boolean);
        ['white', 'blue', 'orange', 'red'].forEach((laneKey) => {
          const touchesLane = sourceLanes.includes(laneKey) || targetLanes.includes(laneKey);
          const plainContinuation = sourceLanes.length === 1 && targetLanes.length === 1 &&
            sourceLanes[0] === laneKey && targetLanes[0] === laneKey;
          if (touchesLane && !plainContinuation) {
            laneCounts[laneKey] += 1;
          }
        });
      });
    });
    return laneCounts;
  }

  function ensureMinimumLaneCrossovers(chapterNodes) {
    const candidateMap = {
      white: [
        ['node06-a-route', 'node07-b-route'],
        ['node10-a-route', 'node11-b-route'],
        ['node13-a-route', 'node14-b-route']
      ],
      blue: [
        ['node05-b-route', 'node06-a-route'],
        ['node08-b-route', 'node09-c-route'],
        ['node11-b-route', 'node12-c-route']
      ],
      orange: [
        ['node07-c-route', 'node08-b-route'],
        ['node10-c-route', 'node11-b-route'],
        ['node13-c-route', 'node14-b-route']
      ],
      red: [
        ['node10-d-route', 'node11-c-route'],
        ['node13-d-route', 'node14-c-route'],
        ['node14-d-route', 'node15-b-route']
      ]
    };
    const counts = countLaneCrossovers(chapterNodes);
    ['white', 'blue', 'orange', 'red'].forEach((laneKey) => {
      const candidates = candidateMap[laneKey] || [];
      for (const [fromId, toId] of candidates) {
        if ((counts[laneKey] || 0) >= 2) break;
        const fromNode = chapterNodes?.[fromId];
        const toNode = chapterNodes?.[toId];
        if (!fromNode || !toNode) continue;
        const before = JSON.stringify(getNodeNextTargetIds(fromNode));
        appendNodeNextTarget(fromNode, toId);
        const after = JSON.stringify(getNodeNextTargetIds(fromNode));
        if (before !== after) {
          counts[laneKey] += 1;
        }
      }
    });
  }

  function buildLaneLayer(chapterNodes, nodeIndex, laneSpecs, finale = false) {
    return laneSpecs.map((laneSpec, laneIndex) => {
      const laneKey = typeof laneSpec === 'string' ? laneSpec : laneSpec?.lane;
      const node = createLaneBackboneNode({
        nodeIndex,
        laneKey,
        layerCount: laneSpecs.length,
        finale,
        branchIndex: laneIndex,
        subtitle: typeof laneSpec === 'object' ? laneSpec.subtitle : undefined,
        title: typeof laneSpec === 'object' ? laneSpec.title : undefined,
        mainlineLanes: typeof laneSpec === 'object' ? laneSpec.mainlineLanes : undefined
      });
      chapterNodes[node.id] = node;
      return { id: node.id, lane: finale ? 'finale' : laneKey, node };
    });
  }

  function getLaneEntryMap(layer) {
    const map = new Map();
    (Array.isArray(layer) ? layer : []).forEach((entry) => {
      if (!entry?.lane) return;
      map.set(entry.lane, entry);
    });
    return map;
  }

  function getLaneBridgeProfiles() {
    return ACT_GENERATED_DATA.LANE_BRIDGE_PROFILES || [];
  }

  function selectLaneBridgeSequence(seed, length) {
    const profiles = getLaneBridgeProfiles();
    const rng = mulberry32(hashStringToSeed(`${seed}|lane-bridge-profile`));
    const profile = profiles[Math.floor(rng() * profiles.length)] || profiles[0] || [];
    return Array.from({ length }, (_, index) => profile[index % profile.length] || 'hold');
  }

  function applyFourLaneBridgePattern(currentLayer, nextLayer, pattern) {
    const currentByLane = getLaneEntryMap(currentLayer);
    const nextByLane = getLaneEntryMap(nextLayer);
    getGeneratedLaneDefs().forEach((laneDef) => {
      const currentEntry = currentByLane.get(laneDef.key);
      const nextEntry = nextByLane.get(laneDef.key);
      if (!currentEntry || !nextEntry) return;
      assignNodeNext(currentEntry.node, [nextEntry.id]);
    });

    const connectChoice = (laneKey, targetLaneKeys) => {
      const currentEntry = currentByLane.get(laneKey);
      if (!currentEntry) return;
      const targetIds = targetLaneKeys
        .map((targetLaneKey) => nextByLane.get(targetLaneKey)?.id || '')
        .filter(Boolean);
      if (targetIds.length) assignNodeNext(currentEntry.node, targetIds);
    };

    switch (pattern) {
      case 'upper':
        connectChoice('white', ['white', 'blue']);
        break;
      case 'middle':
        connectChoice('blue', ['blue', 'orange']);
        break;
      case 'lower':
        connectChoice('orange', ['orange', 'red']);
        break;
      case 'dual':
        connectChoice('white', ['white', 'blue']);
        connectChoice('orange', ['orange', 'red']);
        break;
      default:
        break;
    }
  }

  function selectLaneCollapsePair(seed) {
    const pairs = [
      ['white', 'blue'],
      ['blue', 'orange'],
      ['orange', 'red'],
      ['white', 'orange'],
      ['blue', 'red']
    ];
    const rng = mulberry32(hashStringToSeed(`${seed}|lane-collapse-pair`));
    return pairs[Math.floor(rng() * pairs.length)] || pairs[0];
  }

  function getNearestLaneTarget(laneKey, targetLaneKeys) {
    const laneIndex = getGeneratedLaneDef(laneKey).branchIndex;
    return [...targetLaneKeys].sort((left, right) => {
      const leftDistance = Math.abs(getGeneratedLaneDef(left).branchIndex - laneIndex);
      const rightDistance = Math.abs(getGeneratedLaneDef(right).branchIndex - laneIndex);
      return leftDistance - rightDistance || getGeneratedLaneDef(left).branchIndex - getGeneratedLaneDef(right).branchIndex;
    })[0] || targetLaneKeys[0];
  }

  function getNodeNameAWords() {
    return ACT_GENERATED_DATA.NODE_NAME_A_WORDS || [];
  }

  function getNodeNameBWords() {
    return ACT_GENERATED_DATA.NODE_NAME_B_WORDS || [];
  }

  function generateChapterNodeNames(seed, totalNodes) {
    const safeTotalNodes = Math.max(1, Math.round(Number(totalNodes) || 1));
    const aWords = getNodeNameAWords();
    const bWords = getNodeNameBWords();
    const names = [];
    const used = new Set();
    const rng = mulberry32(hashStringToSeed(`${seed}|chapter-node-names`));
    let guard = 0;
    while (names.length < safeTotalNodes && guard < 2000) {
      guard += 1;
      const aWord = aWords[Math.floor(rng() * aWords.length)] || 'Silent';
      const bWord = bWords[Math.floor(rng() * bWords.length)] || 'Gate';
      const combo = `${aWord} ${bWord}`;
      if (used.has(combo)) continue;
      used.add(combo);
      names.push(combo.toUpperCase());
    }
    while (names.length < safeTotalNodes) {
      names.push(`NODE TITLE ${names.length + 1}`);
    }
    return names;
  }

  function applyGeneratedNodeNames(chapterConfig, seed, totalNodes) {
    const names = generateChapterNodeNames(seed, totalNodes);
    Object.entries(chapterConfig?.nodes || {}).forEach(([, nodeRuntime]) => {
      const nodeIndex = Math.max(1, Math.round(Number(nodeRuntime?.nodeIndex) || 1));
      const generatedTitle = names[nodeIndex - 1] || `NODE TITLE ${nodeIndex}`;
      if (!nodeRuntime.ui || typeof nodeRuntime.ui !== 'object') nodeRuntime.ui = {};
      nodeRuntime.ui.generatedTitle = generatedTitle;
    });
  }

  function generateLaneBackboneCounts(seed) {
    const rng = mulberry32(hashStringToSeed(`${seed}|lane-backbone-counts`));
    const counts = [4];
    let previousCount = 4;
    let repeatRun = 1;
    for (let step = 0; step < 8; step += 1) {
      const remainingSteps = 7 - step;
      const candidates = [3, 4, 5].filter((candidate) => Math.abs(candidate - previousCount) <= 1);
      const weighted = candidates.map((candidate) => {
        let weight = 1;
        if (candidate === previousCount) weight *= repeatRun >= 2 ? 0.12 : 0.45;
        if (candidate === 4) weight *= 0.85;
        if ((step <= 1 || step >= 6) && candidate === 5) weight *= 0.55;
        if (remainingSteps <= 1 && candidate !== 4) weight *= 0.7;
        return { candidate, weight };
      });
      const totalWeight = weighted.reduce((sum, entry) => sum + entry.weight, 0) || 1;
      let pick = rng() * totalWeight;
      let nextCount = weighted[0]?.candidate || 4;
      for (const entry of weighted) {
        pick -= entry.weight;
        if (pick <= 0) {
          nextCount = entry.candidate;
          break;
        }
      }
      if (counts.length >= 4) {
        const tail = counts.slice(-4).concat(nextCount).join('');
        if (tail === '43454' || tail === '34543' || tail === '45434') {
          nextCount = nextCount === 4 ? 3 : 4;
          if (Math.abs(nextCount - previousCount) > 1) nextCount = previousCount;
        }
      }
      counts.push(nextCount);
      repeatRun = nextCount === previousCount ? repeatRun + 1 : 1;
      previousCount = nextCount;
    }
    counts.push(4);
    return counts;
  }

  function createFourLaneLayerSpecs() {
    return [
      { lane: 'white', subtitle: 'UPPER LINE', title: 'WHITE LINE', mainlineLanes: ['white'] },
      { lane: 'blue', subtitle: 'MID-UPPER LINE', title: 'BLUE LINE', mainlineLanes: ['blue'] },
      { lane: 'orange', subtitle: 'MID-LOWER LINE', title: 'ORANGE LINE', mainlineLanes: ['orange'] },
      { lane: 'red', subtitle: 'LOWER LINE', title: 'RED LINE', mainlineLanes: ['red'] }
    ];
  }

  function createThreeLaneLayerSpecs(nodeIndex, variant = 'center') {
    const bridgeTitle = nodeIndex >= 10 ? 'MID CROSS' : 'MID BRIDGE';
    if (variant === 'upper') {
      return [
        { lane: 'neutral', subtitle: 'UPPER MERGE', title: 'UPPER MERGE', mainlineLanes: ['white', 'blue'] },
        { lane: 'orange', subtitle: 'MID-LOWER LINE', title: 'ORANGE LINE', mainlineLanes: ['orange'] },
        { lane: 'red', subtitle: 'LOWER LINE', title: 'RED LINE', mainlineLanes: ['red'] }
      ];
    }
    if (variant === 'lower') {
      return [
        { lane: 'white', subtitle: 'UPPER LINE', title: 'WHITE LINE', mainlineLanes: ['white'] },
        { lane: 'blue', subtitle: 'MID-UPPER LINE', title: 'BLUE LINE', mainlineLanes: ['blue'] },
        { lane: 'neutral', subtitle: 'LOWER MERGE', title: 'LOWER MERGE', mainlineLanes: ['orange', 'red'] }
      ];
    }
    return [
      { lane: 'white', subtitle: 'UPPER LINE', title: 'WHITE LINE', mainlineLanes: ['white'] },
      { lane: 'neutral', subtitle: bridgeTitle, title: bridgeTitle, mainlineLanes: ['blue', 'orange'] },
      { lane: 'red', subtitle: 'LOWER LINE', title: 'RED LINE', mainlineLanes: ['red'] }
    ];
  }

  function createFiveLaneLayerSpecs(nodeIndex, variant = 'center') {
    const gateTitle = nodeIndex % 4 === 0 ? 'CROSS GATE' : 'PRESSURE GATE';
    if (variant === 'upper') {
      return [
        { lane: 'white', subtitle: 'UPPER LINE', title: 'WHITE LINE', mainlineLanes: ['white'] },
        { lane: 'neutral', subtitle: 'UPPER GATE', title: 'UPPER GATE', mainlineLanes: ['white', 'blue'] },
        { lane: 'blue', subtitle: 'MID-UPPER LINE', title: 'BLUE LINE', mainlineLanes: ['blue'] },
        { lane: 'orange', subtitle: 'MID-LOWER LINE', title: 'ORANGE LINE', mainlineLanes: ['orange'] },
        { lane: 'red', subtitle: 'LOWER LINE', title: 'RED LINE', mainlineLanes: ['red'] }
      ];
    }
    if (variant === 'lower') {
      return [
        { lane: 'white', subtitle: 'UPPER LINE', title: 'WHITE LINE', mainlineLanes: ['white'] },
        { lane: 'blue', subtitle: 'MID-UPPER LINE', title: 'BLUE LINE', mainlineLanes: ['blue'] },
        { lane: 'orange', subtitle: 'MID-LOWER LINE', title: 'ORANGE LINE', mainlineLanes: ['orange'] },
        { lane: 'neutral', subtitle: 'LOWER GATE', title: 'LOWER GATE', mainlineLanes: ['orange', 'red'] },
        { lane: 'red', subtitle: 'LOWER LINE', title: 'RED LINE', mainlineLanes: ['red'] }
      ];
    }
    return [
      { lane: 'white', subtitle: 'UPPER LINE', title: 'WHITE LINE', mainlineLanes: ['white'] },
      { lane: 'blue', subtitle: 'MID-UPPER LINE', title: 'BLUE LINE', mainlineLanes: ['blue'] },
      { lane: 'neutral', subtitle: gateTitle, title: gateTitle, mainlineLanes: [] },
      { lane: 'orange', subtitle: 'MID-LOWER LINE', title: 'ORANGE LINE', mainlineLanes: ['orange'] },
      { lane: 'red', subtitle: 'LOWER LINE', title: 'RED LINE', mainlineLanes: ['red'] }
    ];
  }

  function selectLaneLayerVariant(seed, nodeIndex, count) {
    if (count <= 3) {
      const variants = ['center', 'upper', 'lower'];
      const rng = mulberry32(hashStringToSeed(`${seed}|lane-3-variant|${nodeIndex}`));
      return variants[Math.floor(rng() * variants.length)] || 'center';
    }
    if (count >= 5) {
      const variants = ['center', 'upper', 'lower'];
      const rng = mulberry32(hashStringToSeed(`${seed}|lane-5-variant|${nodeIndex}`));
      return variants[Math.floor(rng() * variants.length)] || 'center';
    }
    return 'plain';
  }

  function createLaneLayerSpecsForCount(seed, nodeIndex, count) {
    const variant = selectLaneLayerVariant(seed, nodeIndex, count);
    if (count <= 3) return createThreeLaneLayerSpecs(nodeIndex, variant);
    if (count >= 5) return createFiveLaneLayerSpecs(nodeIndex, variant);
    return createFourLaneLayerSpecs();
  }

  function buildAdjacentTransitionPattern(seed, nodeIndex, fromCount, toCount) {
    const safeFromCount = Math.max(1, Math.round(Number(fromCount) || 1));
    const safeToCount = Math.max(1, Math.round(Number(toCount) || 1));
    if (safeFromCount === safeToCount) {
      return Array.from({ length: safeFromCount }, (_, index) => [index]);
    }
    if (safeFromCount + 1 === safeToCount) {
      const splitIndexMax = Math.max(0, safeFromCount - 1);
      const splitRng = mulberry32(hashStringToSeed(`${seed}|lane-split|${nodeIndex}|${safeFromCount}|${safeToCount}`));
      const splitIndex = Math.min(splitIndexMax, Math.floor(splitRng() * (splitIndexMax + 1)));
      return Array.from({ length: safeFromCount }, (_, index) => {
        if (index < splitIndex) return [index];
        if (index === splitIndex) return [index, index + 1];
        return [Math.min(safeToCount - 1, index + 1)];
      });
    }
    if (safeFromCount === safeToCount + 1) {
      const mergeIndexMax = Math.max(0, safeToCount - 1);
      const mergeRng = mulberry32(hashStringToSeed(`${seed}|lane-merge|${nodeIndex}|${safeFromCount}|${safeToCount}`));
      const mergeIndex = Math.min(mergeIndexMax, Math.floor(mergeRng() * (mergeIndexMax + 1)));
      return Array.from({ length: safeFromCount }, (_, index) => {
        if (index < mergeIndex) return [index];
        if (index === mergeIndex || index === mergeIndex + 1) return [mergeIndex];
        return [Math.max(0, index - 1)];
      });
    }
    const fallback = [];
    for (let index = 0; index < safeFromCount; index += 1) {
      const projected = Math.round((index / Math.max(1, safeFromCount - 1)) * Math.max(0, safeToCount - 1));
      const targets = [Math.max(0, Math.min(safeToCount - 1, projected))];
      fallback.push(targets);
    }
    return fallback;
  }

  function buildLaneBackboneChapterTail(chapterConfig, generatedTail) {
    const totalNodes = Math.max(chapterConfig.totalNodes || 1, generatedTail.totalNodes || 1);
    const chapterSeed = normalizeTrimmedString(chapterConfig?.runtime?.seed, DEFAULT_WORLD_ACT.seed);
    const collapseIndex = 15;
    const finaleIndex = 16;
    const backboneCounts = generateLaneBackboneCounts(chapterSeed);
    const laneLayout = new Map([
      [4, [
        { lane: 'blue', subtitle: 'UPPER LINE', title: 'BLUE LINE', mainlineLanes: ['blue'] },
        { lane: 'orange', subtitle: 'LOWER LINE', title: 'ORANGE LINE', mainlineLanes: ['orange'] }
      ]],
      [5, createFourLaneLayerSpecs()]
    ]);
    for (let nodeIndex = 6; nodeIndex <= 14; nodeIndex += 1) {
      laneLayout.set(nodeIndex, createLaneLayerSpecsForCount(chapterSeed, nodeIndex, backboneCounts[nodeIndex - 5] || 4));
    }
    const transitionMap = new Map([
      ['4->5', [[0, 1], [2, 3]]]
    ]);
    for (let nodeIndex = 5; nodeIndex < 14; nodeIndex += 1) {
      const currentCount = (laneLayout.get(nodeIndex) || []).length;
      const nextCount = (laneLayout.get(nodeIndex + 1) || []).length;
      transitionMap.set(`${nodeIndex}->${nodeIndex + 1}`, buildAdjacentTransitionPattern(chapterSeed, nodeIndex, currentCount, nextCount));
    }

    Object.entries(chapterConfig.nodes).forEach(([nodeId, nodeRuntime]) => {
      const nodeIndex = Math.max(1, Math.round(Number(nodeRuntime?.nodeIndex) || 1));
      if (nodeIndex >= generatedTail.startNodeIndex) delete chapterConfig.nodes[nodeId];
    });

    const layers = new Map();
    for (const [nodeIndex, laneSpecs] of laneLayout.entries()) {
      layers.set(nodeIndex, buildLaneLayer(chapterConfig.nodes, nodeIndex, laneSpecs));
    }
    const collapsePair = selectLaneCollapsePair(chapterSeed);
    layers.set(collapseIndex, buildLaneLayer(chapterConfig.nodes, collapseIndex, collapsePair));
    layers.set(finaleIndex, buildLaneLayer(chapterConfig.nodes, finaleIndex, ['white'], true));

    const openingLayer = layers.get(4) || [];
    const firstFullLane = layers.get(5) || [];
    const openingByLane = getLaneEntryMap(openingLayer);
    const firstFullByLane = getLaneEntryMap(firstFullLane);
    if (openingByLane.get('blue')) {
      assignNodeNext(openingByLane.get('blue').node, [
        firstFullByLane.get('white')?.id || '',
        firstFullByLane.get('blue')?.id || ''
      ]);
    }
    if (openingByLane.get('orange')) {
      assignNodeNext(openingByLane.get('orange').node, [
        firstFullByLane.get('orange')?.id || '',
        firstFullByLane.get('red')?.id || ''
      ]);
    }

    for (let nodeIndex = 5; nodeIndex < 14; nodeIndex += 1) {
      const transition = transitionMap.get(`${nodeIndex}->${nodeIndex + 1}`);
      const currentLayer = layers.get(nodeIndex) || [];
      const nextLayer = layers.get(nodeIndex + 1) || [];
      if (!transition || !currentLayer.length || !nextLayer.length) continue;
      currentLayer.forEach((entry, entryIndex) => {
        const targetIndexes = Array.isArray(transition[entryIndex]) ? transition[entryIndex] : [];
        const targetIds = targetIndexes.map((index) => nextLayer[index]?.id || '').filter(Boolean);
        const mainlineLanes = (Array.isArray(entry?.node?.mainlineLanes) ? entry.node.mainlineLanes : [])
          .map((value) => normalizeTrimmedString(value, '').toLowerCase())
          .filter((value, index, list) => ['white', 'blue', 'orange', 'red'].includes(value) && list.indexOf(value) === index);
        mainlineLanes.forEach((laneKey) => {
          const continuityTargetId = nextLayer.find((candidate) => {
            const candidateMainlineLanes = (Array.isArray(candidate?.node?.mainlineLanes) ? candidate.node.mainlineLanes : [])
              .map((value) => normalizeTrimmedString(value, '').toLowerCase())
              .filter(Boolean);
            return candidateMainlineLanes.includes(laneKey);
          })?.id;
          if (continuityTargetId && !targetIds.includes(continuityTargetId)) {
            targetIds.push(continuityTargetId);
          }
        });
        assignNodeNext(entry.node, targetIds);
      });
    }

    ensureMinimumLaneCrossovers(chapterConfig.nodes);
    // Hard guarantees:
    // 1. Before NODE 07 there is at least one upward step.
    // 2. After NODE 12 there is at least one downward step.
    appendNodeNextTarget(chapterConfig.nodes['node06-b-route'], chapterConfig.nodes['node07-a-route']?.id || '');
    appendNodeNextTarget(chapterConfig.nodes['node12-a-route'], chapterConfig.nodes['node13-b-route']?.id || '');
    // Slightly raise weaving frequency in the middle, but keep it controlled.
    appendNodeNextTarget(chapterConfig.nodes['node08-b-route'], chapterConfig.nodes['node09-c-route']?.id || '');
    appendNodeNextTarget(chapterConfig.nodes['node11-c-route'], chapterConfig.nodes['node12-b-route']?.id || '');

    const collapseLayer = layers.get(collapseIndex) || [];
    const collapseByLane = getLaneEntryMap(collapseLayer);
    const finalLayer = layers.get(finaleIndex) || [];
    const finalNodeId = finalLayer[0]?.id || '';
    (layers.get(14) || []).forEach((entry) => {
      const targetLane = getNearestLaneTarget(entry.lane, collapsePair);
      assignNodeNext(entry.node, [collapseByLane.get(targetLane)?.id || '']);
    });
    collapseLayer.forEach((entry) => {
      assignNodeNext(entry.node, [finalNodeId]);
    });

    const attachNodeIds = Array.isArray(generatedTail.attachFromNodeIds) && generatedTail.attachFromNodeIds.length
      ? generatedTail.attachFromNodeIds
      : [normalizeTrimmedString(generatedTail.attachFromNodeId, '')].filter(Boolean);
    const openingNodeIds = openingLayer.map((entry) => entry.id);
    attachNodeIds.forEach((nodeId) => {
      const attachNode = chapterConfig.nodes[nodeId];
      if (!attachNode) return;
      assignNodeNext(attachNode, openingNodeIds);
    });

    chapterConfig.totalNodes = totalNodes;
    if (!chapterConfig.meta || typeof chapterConfig.meta !== 'object') chapterConfig.meta = {};
    chapterConfig.meta.totalNodes = totalNodes;
    applyGeneratedNodeNames(chapterConfig, chapterSeed, totalNodes);
    return chapterConfig;
  }

  function applyGeneratedLayerTransitions(currentLayer, nextLayer, selectionPattern) {
    if (!Array.isArray(currentLayer) || !currentLayer.length) return;
    if (!Array.isArray(nextLayer) || !nextLayer.length) {
      currentLayer.forEach((entry) => {
        entry.node.next = { mode: 'none' };
      });
      return;
    }

    const nextIds = nextLayer.map((entry) => entry.id);
    if (currentLayer.length === 1) {
      currentLayer[0].node.next = nextIds.length === 1
        ? { mode: 'forced', nodeId: nextIds[0] }
        : { mode: 'choice', options: [...nextIds] };
      return;
    }

    if (nextIds.length === 1) {
      currentLayer.forEach((entry) => {
        entry.node.next = { mode: 'forced', nodeId: nextIds[0] };
      });
      return;
    }

    const selections = normalizeGeneratedSelectionPattern(selectionPattern, currentLayer.length, nextIds.length);
    currentLayer.forEach((entry, entryIndex) => {
      const selectedIds = (selections[entryIndex] || [])
        .map((targetIndex) => nextIds[targetIndex])
        .filter(Boolean);
      const uniqueIds = [...new Set(selectedIds)];
      entry.node.next = uniqueIds.length <= 1
        ? { mode: 'forced', nodeId: uniqueIds[0] || nextIds[0] }
        : { mode: 'choice', options: uniqueIds };
    });
  }

  function buildGeneratedChapterTail(chapterConfig) {
    if (!chapterConfig?.nodes || typeof chapterConfig.nodes !== 'object') return chapterConfig;
    const generatedTail = chapterConfig?.runtime?.generatedTail;
    if (!generatedTail?.enabled) return chapterConfig;
    if (generatedTail.mode === 'lane_backbone') {
      return buildLaneBackboneChapterTail(chapterConfig, generatedTail);
    }

    const totalNodes = Math.max(chapterConfig.totalNodes || 1, generatedTail.totalNodes || 1);
    const startNodeIndex = Math.max(1, Math.min(totalNodes, generatedTail.startNodeIndex || 1));
    const segmentSizes = Array.isArray(generatedTail.segmentSizes) ? generatedTail.segmentSizes : [];
    const chapterSeed = normalizeTrimmedString(chapterConfig?.runtime?.seed, DEFAULT_WORLD_ACT.seed);
    const selectedShapeProfile = selectGeneratedShapeProfile(generatedTail, chapterSeed);

    Object.entries(chapterConfig.nodes).forEach(([nodeId, nodeRuntime]) => {
      const nodeIndex = Math.max(1, Math.round(Number(nodeRuntime?.nodeIndex) || 1));
      if (nodeIndex >= startNodeIndex) delete chapterConfig.nodes[nodeId];
    });

    const segmentPlans = [];
    if (selectedShapeProfile) {
      let generatedNodeIndex = startNodeIndex;
      selectedShapeProfile.motifs.forEach((motifId, segmentIndex) => {
        if (generatedNodeIndex > totalNodes) return;
        const motif = cloneGeneratedTailMotif(motifId);
        if (!motif) return;
        segmentPlans.push({
          motifId,
          motif,
          startNodeIndex: generatedNodeIndex
        });
        generatedNodeIndex += motif.size;
      });
    } else {
      let generatedNodeIndex = startNodeIndex;
      segmentSizes.forEach((segmentSize, segmentIndex) => {
        if (generatedNodeIndex > totalNodes) return;
        const normalizedSize = Math.max(1, Math.round(Number(segmentSize) || 1));
        const isLastSegment = segmentIndex === segmentSizes.length - 1;
        const motifId = selectGeneratedMotifId(
          normalizedSize,
          generatedTail.motifPoolBySize?.[normalizedSize],
          chapterSeed,
          segmentIndex,
          isLastSegment
        );
        const motif = cloneGeneratedTailMotif(motifId);
        if (!motif) return;
        segmentPlans.push({
          motifId,
          motif,
          startNodeIndex: generatedNodeIndex
        });
        generatedNodeIndex += motif.size;
      });
    }

    const allLayerPlans = [];
    segmentPlans.forEach((segmentPlan, segmentIndex) => {
      const counts = Array.isArray(segmentPlan.motif.counts) ? segmentPlan.motif.counts : [];
      counts.forEach((layerCount, layerOffset) => {
        const nodeIndex = segmentPlan.startNodeIndex + layerOffset;
        if (nodeIndex > totalNodes) return;
        const normalizedLayerCount = nodeIndex >= totalNodes ? 1 : Math.max(1, Math.round(Number(layerCount) || 1));
        const previousLayerCount = allLayerPlans.length ? allLayerPlans[allLayerPlans.length - 1].length : 1;
        const nextLayerCount = layerOffset + 1 < counts.length
          ? counts[layerOffset + 1]
          : (segmentPlans[segmentIndex + 1]?.motif?.counts?.[0] || 0);
        const role = getGeneratedNodeRole(nodeIndex, normalizedLayerCount, totalNodes, previousLayerCount, nextLayerCount);
        const layer = Array.from({ length: normalizedLayerCount }, (_, branchIndex) => {
          const node = createGeneratedNodeSkeleton({ nodeIndex, layerCount: normalizedLayerCount, branchIndex, role });
          chapterConfig.nodes[node.id] = node;
          return { id: node.id, node };
        });
        allLayerPlans.push(layer);
      });
    });

    let globalLayerIndex = 0;
    segmentPlans.forEach((segmentPlan) => {
      const transitions = Array.isArray(segmentPlan.motif.transitions) ? segmentPlan.motif.transitions : [];
      transitions.forEach((transitionPattern) => {
        const currentLayer = allLayerPlans[globalLayerIndex];
        const nextLayer = allLayerPlans[globalLayerIndex + 1];
        applyGeneratedLayerTransitions(currentLayer, nextLayer, transitionPattern);
        globalLayerIndex += 1;
      });
      globalLayerIndex += 1;
    });

    for (let layerIndex = 0; layerIndex < allLayerPlans.length - 1; layerIndex += 1) {
      const currentLayer = allLayerPlans[layerIndex];
      const nextLayer = allLayerPlans[layerIndex + 1];
      const hasAssignedTransition = currentLayer.some((entry) => entry.node?.next && normalizeTrimmedString(entry.node.next.mode, '') !== 'none');
      if (hasAssignedTransition) continue;
      const bridgePattern = selectBridgePattern(
        currentLayer.length,
        nextLayer.length,
        `${chapterSeed}|bridge|${startNodeIndex + layerIndex}`
      );
      applyGeneratedLayerTransitions(currentLayer, nextLayer, bridgePattern);
    }

    const attachNodeId = normalizeTrimmedString(generatedTail.attachFromNodeId, '');
    const attachNode = attachNodeId ? chapterConfig.nodes[attachNodeId] : null;
    if (attachNode && allLayerPlans[0]?.length) {
      const firstLayerIds = allLayerPlans[0].map((entry) => entry.id);
      attachNode.next = firstLayerIds.length === 1
        ? { mode: 'forced', nodeId: firstLayerIds[0] }
        : { mode: 'choice', options: firstLayerIds };
    }

    chapterConfig.totalNodes = totalNodes;
    if (!chapterConfig.meta || typeof chapterConfig.meta !== 'object') chapterConfig.meta = {};
    chapterConfig.meta.totalNodes = totalNodes;
    return chapterConfig;
  }



    return {
      normalizeGeneratedTailConfig,
      applyGeneratedNodeTypesToChapter,
      buildGeneratedChapterTail
    };
  }

  global.ACE0ActGeneratedRuntime = Object.assign({}, global.ACE0ActGeneratedRuntime || {}, {
    create: createAceZeroActGeneratedRuntime
  });
})(typeof window !== 'undefined' ? window : globalThis);
