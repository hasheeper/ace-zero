/**
 * ACEZERO ACT ENCOUNTER RUNTIME
 *
 * Owns character encounter state, first-meet queues, placement, trigger,
 * and encounter markers used by the Dashboard snapshot.
 */
(function initAceZeroActEncounterRuntime(global) {
  'use strict';

  global.ACE0ActEncounterRuntime = {
    create(options = {}) {
      const data = options.data || {};
      const constants = options.constants || {};
      const deps = options.deps || {};
      const {
        DEFAULT_WORLD_ACT = { id: 'chapter0_exchange', seed: 'AUTO' },
        ACT_RESOURCE_KEYS = ['combat', 'rest', 'asset', 'vision'],
        ENCOUNTER_CHARACTER_KEYS = ['SIA', 'TRIXIE', 'POPPY', 'COTA', 'VV', 'KUZUHA', 'KAKO', 'EULALIA'],
        ENCOUNTER_CHARACTER_STATUS_VALUES = ['locked', 'eligible', 'queued', 'pre_signal', 'first_meet', 'introduced'],
        ENCOUNTER_QUEUE_STATUS_VALUES = ['queued', 'placed', 'triggered', 'expired', 'cancelled'],
        ENCOUNTER_QUEUE_TYPE_VALUES = ['first_meet', 'pre_signal'],
        ENCOUNTER_TERMINAL_QUEUE_STATUSES = ['triggered', 'expired', 'cancelled']
      } = constants;
      const ENCOUNTER_RULES = data.ENCOUNTER_RULES || {};
      const {
        deepClone = (value) => (value == null ? value : JSON.parse(JSON.stringify(value))),
        normalizeTrimmedString = (value, fallback = '') => {
          const normalized = typeof value === 'string' ? value.trim() : '';
          return normalized || fallback;
        },
        normalizeActState,
        normalizePendingFirstMeet,
        normalizeCountMap,
        getChapter,
        getCurrentActNodeId,
        getNodeRuntime,
        buildTopologyFromV2Nodes,
        getNodeIdsAtIndex,
        pickFromCandidates,
        mulberry32,
        hashStringToSeed
      } = deps;

  function normalizeEncounterCharacterStatus(value) {
    const normalized = normalizeTrimmedString(value, 'locked').toLowerCase();
    return ENCOUNTER_CHARACTER_STATUS_VALUES.includes(normalized) ? normalized : 'locked';
  }

  function normalizeEncounterQueueStatus(value) {
    const normalized = normalizeTrimmedString(value, 'queued').toLowerCase();
    return ENCOUNTER_QUEUE_STATUS_VALUES.includes(normalized) ? normalized : 'queued';
  }

  function normalizeEncounterQueueType(value) {
    const normalized = normalizeTrimmedString(value, 'first_meet').toLowerCase();
    return ENCOUNTER_QUEUE_TYPE_VALUES.includes(normalized) ? normalized : 'first_meet';
  }

  function createDefaultEncounterCharacterState(charKey) {
    return {
      status: 'locked',
      firstMeetDone: false,
      preSignalDone: false,
      cooldownUntilNodeIndex: 0,
      queuedRequestId: '',
      placedNodeId: '',
      introducedNodeId: '',
      introducedAtNodeIndex: 0,
      lastEvaluatedNodeIndex: 0,
      reasonCodes: [],
      firstMeetHint: '',
      debugLabel: normalizeTrimmedString(charKey, '').toUpperCase()
    };
  }

  function normalizeEncounterReasonCodes(value) {
    const list = Array.isArray(value) ? value : [];
    return list
      .map((item) => normalizeTrimmedString(item, '').toLowerCase())
      .filter((item, index, source) => item && source.indexOf(item) === index);
  }

  function normalizeEncounterCharacterState(rawValue, charKey) {
    const source = rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue) ? rawValue : {};
    const normalizedCharKey = normalizeTrimmedString(source.charKey || charKey, '').toUpperCase();
    const state = {
      ...createDefaultEncounterCharacterState(normalizedCharKey),
      status: normalizeEncounterCharacterStatus(source.status),
      firstMeetDone: source.firstMeetDone === true || source.status === 'introduced',
      preSignalDone: source.preSignalDone === true,
      cooldownUntilNodeIndex: Math.max(0, Math.round(Number(source.cooldownUntilNodeIndex) || 0)),
      queuedRequestId: normalizeTrimmedString(source.queuedRequestId, ''),
      placedNodeId: normalizeTrimmedString(source.placedNodeId, ''),
      introducedNodeId: normalizeTrimmedString(source.introducedNodeId, ''),
      introducedAtNodeIndex: Math.max(0, Math.round(Number(source.introducedAtNodeIndex) || 0)),
      lastEvaluatedNodeIndex: Math.max(0, Math.round(Number(source.lastEvaluatedNodeIndex) || 0)),
      reasonCodes: normalizeEncounterReasonCodes(source.reasonCodes),
      firstMeetHint: normalizeTrimmedString(source.firstMeetHint || source.hint || source.summary, ''),
      debugLabel: normalizeTrimmedString(source.debugLabel || source.label, normalizedCharKey)
    };
    if (state.firstMeetDone && state.status === 'locked') state.status = 'introduced';
    return state;
  }

  function normalizeEncounterQueueItem(rawItem, fallbackIndex = 0) {
    if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) return null;
    const charKey = normalizeTrimmedString(rawItem.charKey || rawItem.character || rawItem.key, '').toUpperCase();
    if (!ENCOUNTER_CHARACTER_KEYS.includes(charKey)) return null;
    const type = normalizeEncounterQueueType(rawItem.type);
    const status = normalizeEncounterQueueStatus(rawItem.status);
    const targetNodeId = normalizeTrimmedString(rawItem.targetNodeId || rawItem.nodeId, '');
    return {
      ...deepClone(rawItem),
      id: normalizeTrimmedString(rawItem.id, `enc:${charKey}:${type}:${targetNodeId || 'unplaced'}:${fallbackIndex}`),
      charKey,
      type,
      status,
      targetNodeId,
      targetNodeIndex: Math.max(0, Math.round(Number(rawItem.targetNodeIndex ?? rawItem.nodeIndex) || 0)),
      targetPhaseIndex: Math.max(0, Math.min(3, Math.round(Number(rawItem.targetPhaseIndex ?? rawItem.phaseIndex) || 0))),
      createdNodeIndex: Math.max(0, Math.round(Number(rawItem.createdNodeIndex) || 0)),
      expiresNodeIndex: Math.max(0, Math.round(Number(rawItem.expiresNodeIndex) || 0)),
      priority: Math.round(Number(rawItem.priority) || 0),
      reasonCodes: normalizeEncounterReasonCodes(rawItem.reasonCodes),
      debugLabel: normalizeTrimmedString(rawItem.debugLabel || rawItem.label, charKey),
      firstMeetHint: normalizeTrimmedString(rawItem.firstMeetHint || rawItem.hint || rawItem.summary, '')
    };
  }

  function normalizeCharacterEncounterState(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const rawCharacters = source.characters && typeof source.characters === 'object' && !Array.isArray(source.characters)
      ? source.characters
      : source;
    const characters = {};
    ENCOUNTER_CHARACTER_KEYS.forEach((charKey) => {
      characters[charKey] = normalizeEncounterCharacterState(rawCharacters?.[charKey], charKey);
    });
    const queue = (Array.isArray(source.queue) ? source.queue : [])
      .map((item, index) => normalizeEncounterQueueItem(item, index))
      .filter(Boolean);
    return {
      meta: {
        version: Math.max(1, Math.round(Number(source?.meta?.version) || 1)),
        lastFirstMeetNodeIndex: Math.max(0, Math.round(Number(source?.meta?.lastFirstMeetNodeIndex) || 0)),
        lastSignalNodeIndex: Math.max(0, Math.round(Number(source?.meta?.lastSignalNodeIndex) || 0))
      },
      queue,
      characters
    };
  }

  function getActiveEncounterCharacterKeys(characterEncounterInput) {
    const encounter = normalizeCharacterEncounterState(characterEncounterInput);
    const active = new Set();
    Object.entries(encounter.characters).forEach(([charKey, state]) => {
      if (state.status !== 'locked' || state.firstMeetDone || state.preSignalDone) active.add(charKey);
    });
    encounter.queue.forEach((item) => active.add(item.charKey));
    return Array.from(active);
  }

  function getCharacterEncounterFirstMeetMap(actStateInput, currentNodeId) {
    const actState = normalizeActState(actStateInput);
    const encounter = normalizeCharacterEncounterState(actState.characterEncounter);
    const nodeId = normalizeTrimmedString(currentNodeId, '');
    const hints = {};
    Object.entries(encounter.characters).forEach(([charKey, state]) => {
      if (state.status !== 'introduced' && state.status !== 'first_meet') return;
      if (state.introducedNodeId && state.introducedNodeId !== nodeId) return;
      if (!state.firstMeetHint) return;
      hints[charKey] = state.firstMeetHint;
    });
    return hints;
  }

  function calculateEncounterSpentScore(actStateInput, weightsInput) {
    const spent = normalizeCountMap(actStateInput?.resourceSpent, false);
    const weights = weightsInput && typeof weightsInput === 'object' ? weightsInput : {};
    return ACT_RESOURCE_KEYS.reduce((total, key) => {
      const weight = Number(weights[key]) || 0;
      return total + (Math.max(0, spent[key] || 0) * weight);
    }, 0);
  }

  function getEncounterRuntimeDay(contextInput) {
    const context = contextInput && typeof contextInput === 'object' ? contextInput : {};
    const candidates = [
      context.day,
      context.worldDay,
      context.worldClock?.day,
      context.clock?.day,
      context.world?.clock?.day
    ];
    for (const candidate of candidates) {
      const day = Math.round(Number(candidate) || 0);
      if (day > 0) return day;
    }
    return 0;
  }

  function getEncounterRuntimeGeo(contextInput) {
    const context = contextInput && typeof contextInput === 'object' ? contextInput : {};
    return normalizeTrimmedString(
      context.geo
        || context.layer
        || context.locationLayer
        || context.location?.layer
        || context.world?.location?.layer
        || context.world?.geo,
      ''
    ).toUpperCase();
  }

  function collectEncounterRuntimeTags(contextInput, configInput, currentNodeId) {
    const tags = [];
    const pushTag = (value) => {
      const tag = normalizeTrimmedString(value, '').toLowerCase();
      if (tag && !tags.includes(tag)) tags.push(tag);
    };
    const pushText = (value) => {
      const text = normalizeTrimmedString(value, '').toLowerCase();
      if (text) tags.push(text);
    };
    const context = contextInput && typeof contextInput === 'object' ? contextInput : {};
    [
      ...(Array.isArray(context.tags) ? context.tags : []),
      ...(Array.isArray(context.location?.tags) ? context.location.tags : []),
      ...(Array.isArray(context.flags) ? context.flags : [])
    ].forEach(pushTag);
    pushTag(context.sceneTag);
    pushTag(context.nodeTag);

    const node = getNodeRuntime(configInput, currentNodeId);
    const nodeTags = [
      ...(Array.isArray(node?.tags) ? node.tags : []),
      ...(Array.isArray(node?.ui?.tags) ? node.ui.tags : [])
    ];
    nodeTags.forEach(pushTag);
    pushText(node?.id);
    pushText(node?.ui?.label);
    pushText(node?.ui?.subtitle);
    pushText(node?.narrative?.title);
    pushText(node?.narrative?.subtitle);
    pushText(node?.narrative?.overview);
    pushText(node?.narrative?.guidance);
    return tags;
  }

  function isEncounterCharacterIntroduced(actStateInput, heroStateInput, charKeyInput) {
    const charKey = normalizeTrimmedString(charKeyInput, '').toUpperCase();
    if (!ENCOUNTER_CHARACTER_KEYS.includes(charKey)) return false;
    const encounter = normalizeCharacterEncounterState(actStateInput?.characterEncounter);
    const encounterChar = encounter.characters[charKey];
    if (encounterChar?.firstMeetDone || encounterChar?.status === 'introduced' || encounterChar?.status === 'first_meet') return true;
    const hero = heroStateInput && typeof heroStateInput === 'object' ? heroStateInput : {};
    const heroCast = hero.cast && typeof hero.cast === 'object' ? hero.cast : {};
    const heroRoster = hero.roster && typeof hero.roster === 'object' ? hero.roster : {};
    return heroCast[charKey]?.introduced === true
      || heroCast[charKey]?.activated === true
      || heroRoster[charKey]?.introduced === true;
  }

  function hasActiveEncounterForCharacter(encounterInput, charKeyInput) {
    const encounter = normalizeCharacterEncounterState(encounterInput);
    const charKey = normalizeTrimmedString(charKeyInput, '').toUpperCase();
    const state = encounter.characters[charKey];
    if (!state) return false;
    if (state.firstMeetDone || state.status === 'introduced' || state.status === 'first_meet') return true;
    if (state.status === 'queued' || state.status === 'pre_signal' || state.queuedRequestId || state.placedNodeId) return true;
    return encounter.queue.some((item) => item.charKey === charKey && !ENCOUNTER_TERMINAL_QUEUE_STATUSES.includes(item.status));
  }

  function evaluateCharacterEncounterEligibility(actStateInput, heroStateInput = {}, contextInput = {}) {
    const act = normalizeActState(actStateInput);
    const config = getChapter(act.id);
    const currentNodeId = getCurrentActNodeId(act);
    const day = getEncounterRuntimeDay(contextInput);
    const geo = getEncounterRuntimeGeo(contextInput);
    const tags = collectEncounterRuntimeTags(contextInput, config, currentNodeId);
    const hero = heroStateInput && typeof heroStateInput === 'object' ? heroStateInput : {};
    const funds = Math.max(0, Number(hero.funds ?? hero.assets ?? hero.money) || 0);
    const crisis = Math.max(0, Math.round(Number(act.crisis) || 0));
    const encounter = normalizeCharacterEncounterState(act.characterEncounter);
    const eligible = [];
    const blocked = [];

    ENCOUNTER_CHARACTER_KEYS.forEach((charKey) => {
      const rule = ENCOUNTER_RULES[charKey];
      const reasons = [];
      if (!rule) reasons.push('missing_rule');
      if (hasActiveEncounterForCharacter(encounter, charKey)) reasons.push('active_or_done');
      if (Number(rule?.minDay) > 0) {
        if (!day) reasons.push('missing_day');
        else if (day < Number(rule.minDay)) reasons.push('day');
      }
      if (Number(rule?.minNodeIndex) > 0 && act.nodeIndex < Number(rule.minNodeIndex)) reasons.push('node_index');
      if (Number(rule?.crisisMin) > 0 && crisis < Number(rule.crisisMin)) reasons.push('crisis');
      if (Number(rule?.minFunds) > 0 && funds < Number(rule.minFunds)) reasons.push('funds');
      if (rule?.requiredGeo) {
        if (!geo) reasons.push('missing_geo');
        else if (geo !== normalizeTrimmedString(rule.requiredGeo, '').toUpperCase()) reasons.push('geo');
      }
      const requiredTags = Array.isArray(rule?.requiredTags) ? rule.requiredTags : [];
      if (requiredTags.length && !requiredTags.some((tag) => tags.some((runtimeTag) => runtimeTag.includes(normalizeTrimmedString(tag, '').toLowerCase())))) {
        reasons.push(tags.length ? 'tag' : 'missing_tags');
      }
      const requiredIntroduced = Array.isArray(rule?.requiredIntroduced) ? rule.requiredIntroduced : [];
      requiredIntroduced.forEach((requiredCharKey) => {
        if (!isEncounterCharacterIntroduced(act, hero, requiredCharKey)) reasons.push(`requires_${normalizeTrimmedString(requiredCharKey, '').toLowerCase()}`);
      });
      if (rule?.requiresChurchEvent) {
        const hasChurchEvent = contextInput?.churchEvent === true
          || (Array.isArray(contextInput?.flags) && contextInput.flags.some((flag) => normalizeTrimmedString(flag, '').toLowerCase().includes('church')));
        if (!hasChurchEvent) reasons.push('missing_church_event');
      }

      const spentScore = calculateEncounterSpentScore(act, rule?.spentWeights);
      if (Number(rule?.minSpentScore) > 0 && spentScore < Number(rule.minSpentScore)) reasons.push('spent_score');

      const result = {
        charKey,
        eligible: reasons.length === 0,
        reasonCodes: reasons,
        priority: Math.round((spentScore * 2) + (crisis * 1.5) + (act.nodeIndex * 3) + (10 - (Number(rule?.rarity) || 3))),
        spentScore,
        debugLabel: normalizeTrimmedString(rule?.debugLabel, charKey),
        firstMeetHint: normalizeTrimmedString(rule?.firstMeetHint, '')
      };
      if (result.eligible) eligible.push(result);
      else blocked.push(result);
    });

    eligible.sort((left, right) => right.priority - left.priority || ENCOUNTER_CHARACTER_KEYS.indexOf(left.charKey) - ENCOUNTER_CHARACTER_KEYS.indexOf(right.charKey));
    return { eligible, blocked, context: { day, geo, tags, currentNodeId, funds, crisis } };
  }

  function buildEncounterRequestId(actStateInput, charKey, type, fallbackIndex = 0) {
    return [
      'enc',
      normalizeTrimmedString(actStateInput?.id, DEFAULT_WORLD_ACT.id),
      normalizeTrimmedString(charKey, '').toUpperCase(),
      normalizeTrimmedString(type, 'first_meet').toLowerCase(),
      Math.max(1, Math.round(Number(actStateInput?.nodeIndex) || 1)),
      Math.max(0, fallbackIndex)
    ].join(':');
  }

  function findEncounterPlacementCandidates(actStateInput, configInput, options = {}) {
    const act = normalizeActState(actStateInput);
    const config = configInput || getChapter(act.id);
    const distance = Math.max(1, Math.min(3, Math.round(Number(options.distance) || 2)));
    const currentIndex = Math.max(1, Math.round(Number(act.nodeIndex) || 1));
    const currentNodeId = normalizeTrimmedString(
      act.route_history[currentIndex - 1] || getCurrentActNodeId(act),
      ''
    );
    const pastNodes = new Set(act.route_history.slice(0, currentIndex));
    const activeTargets = new Set(
      normalizeCharacterEncounterState(act.characterEncounter).queue
        .filter((item) => item.status === 'placed' && item.targetNodeId)
        .map((item) => item.targetNodeId)
    );
    const candidates = [];
    const seen = new Set();
    const topology = buildTopologyFromV2Nodes(config);
    const outgoingByNode = topology.reduce((acc, edge) => {
      if (!acc.has(edge.from)) acc.set(edge.from, []);
      acc.get(edge.from).push(edge.to);
      return acc;
    }, new Map());
    let frontier = currentNodeId ? [currentNodeId] : [];

    for (let step = 1; step <= distance; step += 1) {
      const nodeIndex = currentIndex + step;
      const plannedNodeId = normalizeTrimmedString(act.route_history[nodeIndex - 1], '');
      const nextIds = [];
      const nextSeen = new Set();

      if (plannedNodeId) {
        nextIds.push(plannedNodeId);
        nextSeen.add(plannedNodeId);
      } else {
        frontier.forEach((nodeId) => {
          (outgoingByNode.get(nodeId) || []).forEach((toId) => {
            if (!toId || nextSeen.has(toId)) return;
            nextSeen.add(toId);
            nextIds.push(toId);
          });
        });
      }

      nextIds.forEach((nodeId) => {
        if (!nodeId || seen.has(nodeId) || pastNodes.has(nodeId) || activeTargets.has(nodeId)) return;
        const nodeRuntime = getNodeRuntime(config, nodeId);
        const targetNodeIndex = Math.max(1, Math.round(Number(nodeRuntime?.nodeIndex) || nodeIndex));
        if (targetNodeIndex <= currentIndex || targetNodeIndex > currentIndex + distance) return;
        seen.add(nodeId);
        candidates.push({ nodeId, nodeIndex: targetNodeIndex, distance: step, weight: 1 });
      });

      frontier = nextIds;
      if (!frontier.length) break;
    }

    if (!candidates.length && !currentNodeId) {
      for (let nodeIndex = currentIndex + 1; nodeIndex <= currentIndex + distance; nodeIndex += 1) {
        getNodeIdsAtIndex(config, nodeIndex).forEach((nodeId) => {
          if (!nodeId || seen.has(nodeId) || pastNodes.has(nodeId) || activeTargets.has(nodeId)) return;
          seen.add(nodeId);
          candidates.push({ nodeId, nodeIndex, distance: nodeIndex - currentIndex, weight: 1 });
        });
      }
    }

    return candidates;
  }

  function pickEncounterTargetPhaseIndex(actStateInput, requestInput, targetInput, options = {}) {
    if (Number.isFinite(Number(options.targetPhaseIndex))) {
      return Math.max(0, Math.min(3, Math.round(Number(options.targetPhaseIndex) || 0)));
    }
    const seed = [
      actStateInput?.seed || DEFAULT_WORLD_ACT.seed,
      actStateInput?.id || DEFAULT_WORLD_ACT.id,
      requestInput?.id || requestInput?.charKey || 'encounter',
      targetInput?.nodeId || 'node',
      targetInput?.nodeIndex || 0,
      'phase'
    ].join('|');
    return Math.floor(mulberry32(hashStringToSeed(seed))() * 4);
  }

  function placeNextCharacterEncounter(actStateInput, configInput, options = {}) {
    const act = normalizeActState(actStateInput);
    const encounter = normalizeCharacterEncounterState(act.characterEncounter);
    const currentNodeIndex = Math.max(1, Math.round(Number(act.nodeIndex) || 1));
    if (
      encounter.meta.lastFirstMeetNodeIndex > 0
      && currentNodeIndex <= encounter.meta.lastFirstMeetNodeIndex + Math.max(1, Math.round(Number(options.cooldownNodes) || 1))
    ) {
      act.characterEncounter = encounter;
      return { actState: act, placed: null, reason: 'cooldown' };
    }

    const requestedCharKey = normalizeTrimmedString(options.charKey || options.requestCharKey || options.forceCharKey, '').toUpperCase();
    const request = encounter.queue
      .filter((item) => (
        item.type === 'first_meet'
        && item.status === 'queued'
        && (!requestedCharKey || item.charKey === requestedCharKey)
      ))
      .sort((left, right) => right.priority - left.priority || left.createdNodeIndex - right.createdNodeIndex)[0];
    if (!request) {
      act.characterEncounter = encounter;
      return { actState: act, placed: null, reason: 'empty_queue' };
    }

    const candidates = findEncounterPlacementCandidates({ ...act, characterEncounter: encounter }, configInput, options);
    const target = pickFromCandidates(candidates, [
      act.seed || DEFAULT_WORLD_ACT.seed,
      act.id || DEFAULT_WORLD_ACT.id,
      request.id || request.charKey || 'encounter',
      currentNodeIndex,
      candidates.map((item) => item.nodeId).join(',')
    ].join('|')) || null;
    if (!target) {
      act.characterEncounter = encounter;
      return { actState: act, placed: null, reason: 'no_candidate' };
    }

    const placed = {
      ...request,
      status: 'placed',
      targetNodeId: target.nodeId,
      targetNodeIndex: target.nodeIndex,
      targetPhaseIndex: pickEncounterTargetPhaseIndex(act, request, target, options),
      expiresNodeIndex: target.nodeIndex + Math.max(1, Math.round(Number(options.expireAfterNodes) || 2))
    };
    encounter.queue = encounter.queue.map((item) => item.id === request.id ? placed : item);
    const charState = encounter.characters[request.charKey] || createDefaultEncounterCharacterState(request.charKey);
    encounter.characters[request.charKey] = {
      ...charState,
      status: 'queued',
      queuedRequestId: placed.id,
      placedNodeId: placed.targetNodeId,
      lastEvaluatedNodeIndex: currentNodeIndex,
      reasonCodes: deepClone(placed.reasonCodes),
      firstMeetHint: placed.firstMeetHint || charState.firstMeetHint,
      debugLabel: placed.debugLabel || charState.debugLabel
    };
    act.characterEncounter = encounter;
    return { actState: act, placed };
  }

  function enqueueEligibleCharacterEncounters(actStateInput, heroStateInput = {}, options = {}) {
    const act = normalizeActState(actStateInput);
    const encounter = normalizeCharacterEncounterState(act.characterEncounter);
    const evaluated = options.eligibility || evaluateCharacterEncounterEligibility({ ...act, characterEncounter: encounter }, heroStateInput, options.context || {});
    const limit = Math.max(1, Math.round(Number(options.limit) || 1));
    const queued = [];
    evaluated.eligible.slice(0, limit).forEach((candidate) => {
      if (hasActiveEncounterForCharacter(encounter, candidate.charKey)) return;
      const request = {
        id: buildEncounterRequestId(act, candidate.charKey, 'first_meet', encounter.queue.length + queued.length),
        charKey: candidate.charKey,
        type: 'first_meet',
        status: 'queued',
        targetNodeId: '',
        targetNodeIndex: 0,
        targetPhaseIndex: 0,
        createdNodeIndex: Math.max(1, Math.round(Number(act.nodeIndex) || 1)),
        expiresNodeIndex: 0,
        priority: candidate.priority,
        reasonCodes: deepClone(candidate.reasonCodes),
        debugLabel: candidate.debugLabel,
        firstMeetHint: candidate.firstMeetHint
      };
      encounter.queue.push(request);
      encounter.characters[candidate.charKey] = {
        ...(encounter.characters[candidate.charKey] || createDefaultEncounterCharacterState(candidate.charKey)),
        status: 'queued',
        queuedRequestId: request.id,
        placedNodeId: '',
        lastEvaluatedNodeIndex: Math.max(1, Math.round(Number(act.nodeIndex) || 1)),
        reasonCodes: deepClone(request.reasonCodes),
        firstMeetHint: request.firstMeetHint,
        debugLabel: request.debugLabel
      };
      queued.push(request);
    });
    act.characterEncounter = encounter;
    if (options.place === false || queued.length === 0) return { actState: act, queued, placed: null, evaluated };
    const placedResult = placeNextCharacterEncounter(act, options.config || getChapter(act.id), options);
    return { actState: placedResult.actState, queued, placed: placedResult.placed, evaluated };
  }

  function consumeCharacterEncounterForNode(actStateInput, nodeIdInput, options = {}) {
    const act = normalizeActState(actStateInput);
    const encounter = normalizeCharacterEncounterState(act.characterEncounter);
    const nodeId = normalizeTrimmedString(nodeIdInput || getCurrentActNodeId(act), '');
    const phaseIndex = Number.isFinite(Number(options.phaseIndex))
      ? Math.max(0, Math.min(3, Math.round(Number(options.phaseIndex) || 0)))
      : null;
    const request = encounter.queue.find((item) => (
      item.type === 'first_meet'
      && item.status === 'placed'
      && item.targetNodeId === nodeId
      && (phaseIndex === null || item.targetPhaseIndex === phaseIndex)
    ));
    if (!request) {
      act.characterEncounter = encounter;
      return { actState: act, consumed: null };
    }

    const currentNodeIndex = Math.max(1, Math.round(Number(act.nodeIndex) || 1));
    const rule = ENCOUNTER_RULES[request.charKey] || {};
    const firstMeetHint = normalizeTrimmedString(request.firstMeetHint || rule.firstMeetHint, '');
    const consumed = {
      ...request,
      status: 'triggered',
      triggeredNodeId: nodeId,
      triggeredNodeIndex: currentNodeIndex,
      triggeredPhaseIndex: phaseIndex === null ? request.targetPhaseIndex : phaseIndex
    };
    encounter.queue = encounter.queue.map((item) => item.id === request.id ? consumed : item);
    encounter.characters[request.charKey] = {
      ...(encounter.characters[request.charKey] || createDefaultEncounterCharacterState(request.charKey)),
      status: 'introduced',
      firstMeetDone: true,
      queuedRequestId: '',
      placedNodeId: '',
      introducedNodeId: nodeId,
      introducedAtNodeIndex: currentNodeIndex,
      cooldownUntilNodeIndex: currentNodeIndex + Math.max(1, Math.round(Number(options.cooldownNodes) || 1)),
      reasonCodes: deepClone(request.reasonCodes),
      firstMeetHint,
      debugLabel: normalizeTrimmedString(request.debugLabel || rule.debugLabel, request.charKey)
    };
    encounter.meta.lastFirstMeetNodeIndex = currentNodeIndex;
    act.characterEncounter = encounter;
    act.pendingFirstMeet = {
      ...normalizePendingFirstMeet(act.pendingFirstMeet),
      ...(firstMeetHint ? { [request.charKey]: firstMeetHint } : {})
    };
    return { actState: act, consumed };
  }

  function updateCharacterEncountersForNodeEntry(actStateInput, heroStateInput = {}, configInput = null, contextInput = {}) {
    const act = normalizeActState(actStateInput);
    const config = configInput || getChapter(act.id);
    const enqueueResult = enqueueEligibleCharacterEncounters(act, heroStateInput, {
      context: contextInput,
      config,
      limit: 1,
      place: true
    });
    return {
      actState: enqueueResult.actState,
      consumed: null,
      queued: enqueueResult.queued,
      placed: enqueueResult.placed,
      evaluated: enqueueResult.evaluated
    };
  }

  function debugForceCharacterEncounter(actStateInput, charKeyInput, configInput = null, options = {}) {
    const charKey = normalizeTrimmedString(charKeyInput, '').toUpperCase();
    const act = normalizeActState(actStateInput);
    const config = configInput || getChapter(act.id);
    const encounter = normalizeCharacterEncounterState(act.characterEncounter);
    const rule = ENCOUNTER_RULES[charKey] || null;
    if (!ENCOUNTER_CHARACTER_KEYS.includes(charKey) || !rule) {
      act.characterEncounter = encounter;
      return { actState: act, applied: false, reason: 'unknown_character' };
    }
    if (encounter.characters[charKey]?.firstMeetDone || encounter.characters[charKey]?.status === 'introduced') {
      act.characterEncounter = encounter;
      return { actState: act, applied: false, reason: 'already_introduced' };
    }
    const active = encounter.queue.find((item) => item.charKey === charKey && !ENCOUNTER_TERMINAL_QUEUE_STATUSES.includes(item.status));
    if (active?.status === 'placed') {
      act.characterEncounter = encounter;
      return {
        actState: act,
        applied: true,
        request: active,
        placed: active,
        reason: 'already_placed'
      };
    }
    if (!active) {
      const request = {
        id: buildEncounterRequestId(act, charKey, 'first_meet', encounter.queue.length),
        charKey,
        type: 'first_meet',
        status: 'queued',
        targetNodeId: '',
        targetNodeIndex: 0,
        targetPhaseIndex: 0,
        createdNodeIndex: Math.max(1, Math.round(Number(act.nodeIndex) || 1)),
        expiresNodeIndex: 0,
        priority: 999,
        reasonCodes: ['debug_force'],
        debugLabel: normalizeTrimmedString(rule.debugLabel, charKey),
        firstMeetHint: normalizeTrimmedString(rule.firstMeetHint, '')
      };
      encounter.queue.push(request);
      encounter.characters[charKey] = {
        ...(encounter.characters[charKey] || createDefaultEncounterCharacterState(charKey)),
        status: 'queued',
        queuedRequestId: request.id,
        placedNodeId: '',
        lastEvaluatedNodeIndex: Math.max(1, Math.round(Number(act.nodeIndex) || 1)),
        reasonCodes: ['debug_force'],
        firstMeetHint: request.firstMeetHint,
        debugLabel: request.debugLabel
      };
    }
    act.characterEncounter = encounter;
    const placedResult = placeNextCharacterEncounter(act, config, {
      ...options,
      forceCharKey: charKey
    });
    return {
      actState: placedResult.actState,
      applied: true,
      request: placedResult.actState.characterEncounter.queue.find((item) => item.charKey === charKey && !ENCOUNTER_TERMINAL_QUEUE_STATUSES.includes(item.status)) || null,
      placed: placedResult.placed,
      reason: placedResult.reason || ''
    };
  }

  function buildEncounterMarkersForSnapshot(actStateInput) {
    const encounter = normalizeCharacterEncounterState(actStateInput?.characterEncounter);
    return encounter.queue
      .filter((item) => item.status === 'placed' && item.targetNodeId)
      .map((item) => ({
        id: item.id,
        charKey: item.charKey,
        type: item.type,
        status: item.status,
        nodeId: item.targetNodeId,
        nodeIndex: item.targetNodeIndex,
        phaseIndex: item.targetPhaseIndex,
        label: item.charKey,
        debugLabel: item.debugLabel,
        reasonCodes: deepClone(item.reasonCodes)
      }));
  }

      return {
        normalizeEncounterCharacterStatus,
        normalizeEncounterQueueStatus,
        normalizeEncounterQueueType,
        createDefaultEncounterCharacterState,
        normalizeEncounterReasonCodes,
        normalizeEncounterCharacterState,
        normalizeEncounterQueueItem,
        normalizeCharacterEncounterState,
        getActiveEncounterCharacterKeys,
        getCharacterEncounterFirstMeetMap,
        calculateEncounterSpentScore,
        getEncounterRuntimeDay,
        getEncounterRuntimeGeo,
        collectEncounterRuntimeTags,
        isEncounterCharacterIntroduced,
        hasActiveEncounterForCharacter,
        evaluateCharacterEncounterEligibility,
        buildEncounterRequestId,
        findEncounterPlacementCandidates,
        pickEncounterTargetPhaseIndex,
        placeNextCharacterEncounter,
        enqueueEligibleCharacterEncounters,
        consumeCharacterEncounterForNode,
        updateCharacterEncountersForNodeEntry,
        debugForceCharacterEncounter,
        buildEncounterMarkersForSnapshot
      };
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
