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
      const FIRST_MEET_PHASE_INDEX = 1;
      const {
        deepClone = (value) => (value == null ? value : JSON.parse(JSON.stringify(value))),
        normalizeTrimmedString = (value, fallback = '') => {
          const normalized = typeof value === 'string' ? value.trim() : '';
          return normalized || fallback;
        },
        normalizeActState,
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
      preSignalNodeId: '',
      preSignalAtNodeIndex: 0,
      preSignalPhaseIndex: -1,
      cooldownUntilNodeIndex: 0,
      queuedRequestId: '',
      placedNodeId: '',
      introducedNodeId: '',
      introducedAtNodeIndex: 0,
      introducedPhaseIndex: -1,
      lastEvaluatedNodeIndex: 0
    };
  }

  function normalizeEncounterReasonCodes(value) {
    const list = Array.isArray(value) ? value : [];
    return list
      .map((item) => normalizeTrimmedString(item, '').toLowerCase())
      .filter((item, index, source) => item && source.indexOf(item) === index);
  }

  function isPlainEncounterObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function normalizeEncounterKind(value) {
    const normalized = normalizeTrimmedString(value, 'meet').toLowerCase();
    if (normalized === 'pre_signal' || normalized === 'signal') return 'signal';
    return 'meet';
  }

  function encounterKindToQueueType(kind) {
    return normalizeEncounterKind(kind) === 'signal' ? 'pre_signal' : 'first_meet';
  }

  function normalizeCompactEncounterPhase(value, fallback = null) {
    if (!Number.isFinite(Number(value))) return fallback;
    const phase = Math.round(Number(value));
    if (phase < 0) return fallback;
    return Math.max(0, Math.min(3, phase));
  }

  function normalizeEncounterFactEntry(value) {
    const source = value === true ? {} : (isPlainEncounterObject(value) ? value : {});
    const out = {};
    const node = normalizeTrimmedString(source.node, '');
    const nodeIndex = Math.max(0, Math.round(Number(source.nodeIndex) || 0));
    const phase = normalizeCompactEncounterPhase(source.phase, null);
    if (node) out.node = node;
    if (nodeIndex > 0) out.nodeIndex = nodeIndex;
    if (phase !== null) out.phase = phase;
    return out;
  }

  function normalizeCompactActiveEncounterEntry(value, rawCharKey = '') {
    if (!isPlainEncounterObject(value)) return null;
    const charKey = normalizeTrimmedString(rawCharKey, '').toUpperCase();
    if (!ENCOUNTER_CHARACTER_KEYS.includes(charKey)) return null;
    const kind = normalizeEncounterKind(value.kind);
    const hasExplicitState = value.state != null;
    const rawState = normalizeTrimmedString(value.state, 'queued').toLowerCase();
    if (hasExplicitState && rawState !== 'queued' && rawState !== 'placed') return null;
    let state = rawState === 'placed' ? 'placed' : 'queued';
    const node = normalizeTrimmedString(value.node, '');
    if (state === 'placed' && !node) state = 'queued';

    const phase = normalizeCompactEncounterPhase(value.phase, null);
    const nodeIndex = Math.max(0, Math.round(Number(value.nodeIndex) || 0));
    const from = Math.max(0, Math.round(Number(value.from) || 0));
    const until = Math.max(0, Math.round(Number(value.until) || 0));
    const priority = Math.round(Number(value.priority) || 0);
    const score = Math.max(0, Math.round(Number(value.score) || 0));

    const entry = { kind, state };
    if (node) entry.node = node;
    if (nodeIndex > 0) entry.nodeIndex = nodeIndex;
    if (phase !== null && (kind === 'signal' || phase !== FIRST_MEET_PHASE_INDEX)) entry.phase = phase;
    if (from > 0) entry.from = from;
    if (until > 0) entry.until = until;
    if (priority !== 0) entry.priority = priority;
    if (score > 0) entry.score = score;
    return { charKey, entry };
  }

  function shouldReplaceCompactActiveEncounter(current, next) {
    if (!current) return true;
    const currentRank = current.state === 'placed' ? 2 : 1;
    const nextRank = next.state === 'placed' ? 2 : 1;
    if (currentRank !== nextRank) return nextRank > currentRank;
    const currentPriority = Math.round(Number(current.priority) || 0);
    const nextPriority = Math.round(Number(next.priority) || 0);
    if (currentPriority !== nextPriority) return nextPriority > currentPriority;
    return Math.max(0, Math.round(Number(next.from) || 0)) < Math.max(0, Math.round(Number(current.from) || 0));
  }

  function putCompactActiveEncounter(target, charKey, entry) {
    if (!charKey || !entry) return;
    if (!target.active) target.active = {};
    if (shouldReplaceCompactActiveEncounter(target.active[charKey], entry)) {
      target.active[charKey] = entry;
    }
  }

  function putCompactFact(target, bucket, charKey, fact) {
    if (!charKey) return;
    if (!target[bucket]) target[bucket] = {};
    target[bucket][charKey] = normalizeEncounterFactEntry(fact);
  }

  function normalizeCharacterEncounterState(value) {
    const source = isPlainEncounterObject(value) ? value : {};
    if (source.v !== 2) return {};
    const compact = {};

    const lastMeet = Math.max(0, Math.round(Number(source.lastMeet) || 0));
    if (lastMeet > 0) compact.lastMeet = lastMeet;

    if (isPlainEncounterObject(source.active)) {
      Object.entries(source.active).forEach(([rawKey, rawEntry]) => {
        const normalized = normalizeCompactActiveEncounterEntry(rawEntry, rawKey);
        if (normalized) putCompactActiveEncounter(compact, normalized.charKey, normalized.entry);
      });
    }

    if (isPlainEncounterObject(source.met)) {
      Object.entries(source.met).forEach(([rawKey, rawValue]) => {
        const charKey = normalizeTrimmedString(rawKey, '').toUpperCase();
        if (ENCOUNTER_CHARACTER_KEYS.includes(charKey)) putCompactFact(compact, 'met', charKey, rawValue);
      });
    }

    if (isPlainEncounterObject(source.signaled)) {
      Object.entries(source.signaled).forEach(([rawKey, rawValue]) => {
        const charKey = normalizeTrimmedString(rawKey, '').toUpperCase();
        if (ENCOUNTER_CHARACTER_KEYS.includes(charKey)) putCompactFact(compact, 'signaled', charKey, rawValue);
      });
    }

    if (compact.met && compact.active) {
      Object.keys(compact.met).forEach((charKey) => {
        delete compact.active[charKey];
      });
      if (!Object.keys(compact.active).length) delete compact.active;
    }

    const hasData = compact.lastMeet > 0
      || (compact.active && Object.keys(compact.active).length)
      || (compact.met && Object.keys(compact.met).length)
      || (compact.signaled && Object.keys(compact.signaled).length);
    if (!hasData) return {};

    const out = { v: 2 };
    if (compact.active && Object.keys(compact.active).length) out.active = compact.active;
    if (compact.met && Object.keys(compact.met).length) out.met = compact.met;
    if (compact.signaled && Object.keys(compact.signaled).length) out.signaled = compact.signaled;
    if (compact.lastMeet > 0) out.lastMeet = compact.lastMeet;
    return out;
  }

  function isExpandedCharacterEncounterState(value) {
    return isPlainEncounterObject(value) && value.__ace0ExpandedEncounter === true;
  }

  function compactExpandedCharacterEncounterState(value) {
    if (!isExpandedCharacterEncounterState(value)) return normalizeCharacterEncounterState(value);
    const compact = {};
    const lastMeet = Math.max(0, Math.round(Number(value.meta?.lastFirstMeetNodeIndex) || 0));
    if (lastMeet > 0) compact.lastMeet = lastMeet;

    (Array.isArray(value.queue) ? value.queue : [])
      .filter(item => item && typeof item === 'object' && !Array.isArray(item))
      .forEach((item) => {
        const charKey = normalizeTrimmedString(item.charKey, '').toUpperCase();
        if (!ENCOUNTER_CHARACTER_KEYS.includes(charKey)) return;
        if (ENCOUNTER_TERMINAL_QUEUE_STATUSES.includes(normalizeEncounterQueueStatus(item.status))) return;
        const type = normalizeEncounterQueueType(item.type);
        putCompactActiveEncounter(compact, charKey, {
          kind: type === 'pre_signal' ? 'signal' : 'meet',
          state: item.status === 'placed' && normalizeTrimmedString(item.targetNodeId, '') ? 'placed' : 'queued',
          node: normalizeTrimmedString(item.targetNodeId, ''),
          nodeIndex: Math.max(0, Math.round(Number(item.targetNodeIndex) || 0)),
          phase: normalizeCompactEncounterPhase(item.targetPhaseIndex, type === 'first_meet' ? FIRST_MEET_PHASE_INDEX : 0),
          from: Math.max(0, Math.round(Number(item.createdNodeIndex) || 0)),
          until: Math.max(0, Math.round(Number(item.expiresNodeIndex) || 0)),
          priority: Math.round(Number(item.priority) || 0),
          score: Math.max(0, Math.round(Number(item.spentScore) || 0))
        });
      });

    Object.entries(isPlainEncounterObject(value.characters) ? value.characters : {}).forEach(([rawKey, state]) => {
      const charKey = normalizeTrimmedString(rawKey, '').toUpperCase();
      if (!ENCOUNTER_CHARACTER_KEYS.includes(charKey) || !isPlainEncounterObject(state)) return;
      if (state.firstMeetDone === true || state.status === 'introduced' || state.status === 'first_meet') {
        putCompactFact(compact, 'met', charKey, {
          node: state.introducedNodeId,
          nodeIndex: state.introducedAtNodeIndex,
          phase: state.introducedPhaseIndex
        });
      }
      if (state.preSignalDone === true) {
        putCompactFact(compact, 'signaled', charKey, {
          node: state.preSignalNodeId,
          nodeIndex: state.preSignalAtNodeIndex,
          phase: state.preSignalPhaseIndex
        });
      }
    });

    if (compact.met && compact.active) {
      Object.keys(compact.met).forEach((charKey) => {
        delete compact.active[charKey];
      });
      if (!Object.keys(compact.active).length) delete compact.active;
    }

    const hasData = compact.lastMeet > 0
      || (compact.active && Object.keys(compact.active).length)
      || (compact.met && Object.keys(compact.met).length)
      || (compact.signaled && Object.keys(compact.signaled).length);
    if (!hasData) return {};
    const out = { v: 2 };
    if (compact.active && Object.keys(compact.active).length) out.active = compact.active;
    if (compact.met && Object.keys(compact.met).length) out.met = compact.met;
    if (compact.signaled && Object.keys(compact.signaled).length) out.signaled = compact.signaled;
    if (compact.lastMeet > 0) out.lastMeet = compact.lastMeet;
    return out;
  }

  function buildSyntheticEncounterRequestId(charKey, entry, fallbackIndex = 0) {
    return [
      'enc',
      charKey,
      encounterKindToQueueType(entry?.kind),
      normalizeTrimmedString(entry?.node, 'unplaced') || 'unplaced',
      Math.max(0, Math.round(Number(entry?.from) || 0)),
      fallbackIndex
    ].join(':');
  }

  function compactActiveEncounterToQueueItem(charKey, entry, fallbackIndex = 0) {
    const kind = normalizeEncounterKind(entry?.kind);
    const type = encounterKindToQueueType(kind);
    const phase = normalizeCompactEncounterPhase(entry?.phase, type === 'first_meet' ? FIRST_MEET_PHASE_INDEX : 0);
    return {
      id: buildSyntheticEncounterRequestId(charKey, entry, fallbackIndex),
      charKey,
      type,
      status: entry?.state === 'placed' ? 'placed' : 'queued',
      targetNodeId: normalizeTrimmedString(entry?.node, ''),
      targetNodeIndex: Math.max(0, Math.round(Number(entry?.nodeIndex) || 0)),
      targetPhaseIndex: phase,
      createdNodeIndex: Math.max(0, Math.round(Number(entry?.from) || 0)),
      expiresNodeIndex: Math.max(0, Math.round(Number(entry?.until) || 0)),
      priority: Math.round(Number(entry?.priority) || 0),
      spentScore: Math.max(0, Math.round(Number(entry?.score) || 0))
    };
  }

  function expandCharacterEncounterState(value) {
    if (isExpandedCharacterEncounterState(value)) return value;

    const compact = normalizeCharacterEncounterState(value);
    const characters = {};
    ENCOUNTER_CHARACTER_KEYS.forEach((charKey) => {
      characters[charKey] = createDefaultEncounterCharacterState(charKey);
    });

    Object.entries(compact.signaled || {}).forEach(([charKey, fact]) => {
      if (!characters[charKey]) return;
      characters[charKey] = {
        ...characters[charKey],
        status: 'pre_signal',
        preSignalDone: true,
        preSignalNodeId: normalizeTrimmedString(fact.node, ''),
        preSignalAtNodeIndex: Math.max(0, Math.round(Number(fact.nodeIndex) || 0)),
        preSignalPhaseIndex: normalizeCompactEncounterPhase(fact.phase, -1)
      };
    });

    Object.entries(compact.met || {}).forEach(([charKey, fact]) => {
      if (!characters[charKey]) return;
      characters[charKey] = {
        ...characters[charKey],
        status: 'introduced',
        firstMeetDone: true,
        introducedNodeId: normalizeTrimmedString(fact.node, ''),
        introducedAtNodeIndex: Math.max(0, Math.round(Number(fact.nodeIndex) || 0)),
        introducedPhaseIndex: normalizeCompactEncounterPhase(fact.phase, -1)
      };
    });

    const queue = Object.entries(compact.active || {}).map(([charKey, entry], index) => {
      const item = compactActiveEncounterToQueueItem(charKey, entry, index);
      if (characters[charKey] && !compact.met?.[charKey]) {
        characters[charKey] = {
          ...characters[charKey],
          status: item.type === 'pre_signal' ? 'pre_signal' : 'queued',
          queuedRequestId: item.id,
          placedNodeId: item.status === 'placed' ? item.targetNodeId : '',
          lastEvaluatedNodeIndex: item.createdNodeIndex
        };
      }
      return item;
    });

    const expanded = {
      meta: {
        version: 2,
        lastFirstMeetNodeIndex: Math.max(0, Math.round(Number(compact.lastMeet) || 0)),
        lastSignalNodeIndex: 0
      },
      queue,
      characters
    };
    Object.defineProperty(expanded, '__ace0ExpandedEncounter', {
      value: true,
      enumerable: false
    });
    return expanded;
  }

  function setCharacterEncounterState(act, encounter) {
    act.characterEncounter = compactExpandedCharacterEncounterState(encounter);
    return act.characterEncounter;
  }

  function getActiveEncounterCharacterKeys(characterEncounterInput) {
    const encounter = expandCharacterEncounterState(characterEncounterInput);
    const active = new Set();
    Object.entries(encounter.characters).forEach(([charKey, state]) => {
      if (state.status !== 'locked' || state.firstMeetDone || state.preSignalDone) active.add(charKey);
    });
    encounter.queue.forEach((item) => active.add(item.charKey));
    return Array.from(active);
  }

  function getCharacterEncounterFirstMeetMap(actStateInput, currentNodeId) {
    const actState = normalizeActState(actStateInput);
    const encounter = expandCharacterEncounterState(actState.characterEncounter);
    const nodeId = normalizeTrimmedString(currentNodeId, '');
    const phaseIndex = Math.max(0, Math.min(3, Math.round(Number(actState.phase_index) || 0)));
    const hints = {};
    encounter.queue.forEach((item) => {
      if (item.type !== 'first_meet' || item.status !== 'placed') return;
      if (item.targetNodeId !== nodeId) return;
      const targetPhaseIndex = Math.max(0, Math.min(3, Math.round(Number(item.targetPhaseIndex) || 0)));
      if (targetPhaseIndex !== phaseIndex) return;
      const ruleHint = normalizeTrimmedString(ENCOUNTER_RULES[item.charKey]?.firstMeetHint, '');
      const hint = normalizeTrimmedString(item.firstMeetHint, ruleHint);
      if (!hint) return;
      hints[item.charKey] = hint;
    });
    Object.entries(encounter.characters).forEach(([charKey, state]) => {
      if (state.status !== 'introduced' && state.status !== 'first_meet') return;
      if (state.introducedNodeId && state.introducedNodeId !== nodeId) return;
      if (Number.isFinite(Number(state.introducedPhaseIndex))) {
        const introducedPhaseIndex = Math.max(0, Math.min(3, Math.round(Number(state.introducedPhaseIndex))));
        if (introducedPhaseIndex !== phaseIndex) return;
      }
      const hint = normalizeTrimmedString(ENCOUNTER_RULES[charKey]?.firstMeetHint, '');
      if (!hint) return;
      hints[charKey] = hint;
    });
    return hints;
  }

  function getCharacterEncounterNodeFirstMeetMap(actStateInput, currentNodeId) {
    const actState = normalizeActState(actStateInput);
    const encounter = expandCharacterEncounterState(actState.characterEncounter);
    const nodeId = normalizeTrimmedString(currentNodeId, '');
    const hints = {};
    encounter.queue.forEach((item) => {
      if (item.type !== 'first_meet' || item.status !== 'placed') return;
      if (item.targetNodeId !== nodeId) return;
      const ruleHint = normalizeTrimmedString(ENCOUNTER_RULES[item.charKey]?.firstMeetHint, '');
      const hint = normalizeTrimmedString(item.firstMeetHint, ruleHint);
      hints[item.charKey] = {
        charKey: item.charKey,
        hint,
        targetPhaseIndex: FIRST_MEET_PHASE_INDEX
      };
    });
    return hints;
  }

  function getCharacterEncounterPreSignalMap(actStateInput, currentNodeId) {
    const actState = normalizeActState(actStateInput);
    const encounter = expandCharacterEncounterState(actState.characterEncounter);
    const nodeId = normalizeTrimmedString(currentNodeId, '');
    const phaseIndex = Math.max(0, Math.min(4, Math.round(Number(actState.phase_index) || 0)));
    const hints = {};
    Object.entries(encounter.characters).forEach(([charKey, state]) => {
      if (state.preSignalDone !== true) return;
      if (Number.isFinite(Number(state.preSignalPhaseIndex))) {
        const signalPhaseIndex = Math.max(0, Math.min(3, Math.round(Number(state.preSignalPhaseIndex))));
        const signalNodeIndex = Math.max(0, Math.round(Number(state.preSignalAtNodeIndex) || 0));
        const sameNodeNextPhase = (!state.preSignalNodeId || state.preSignalNodeId === nodeId)
          && phaseIndex === Math.min(4, signalPhaseIndex + 1);
        const nextNodeAfterFinalPhase = signalPhaseIndex === 3
          && signalNodeIndex > 0
          && Math.max(1, Math.round(Number(actState.nodeIndex) || 1)) === signalNodeIndex + 1
          && phaseIndex === 0;
        if (!sameNodeNextPhase && !nextNodeAfterFinalPhase) return;
      } else if (state.preSignalNodeId && state.preSignalNodeId !== nodeId) {
        return;
      }
      const hint = normalizeTrimmedString(ENCOUNTER_RULES[charKey]?.preSignalHint, '');
      if (!hint) return;
      hints[charKey] = hint;
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

  function compareEncounterPriority(left, right) {
    const leftSpent = Math.max(0, Math.round(Number(left?.spentScore) || 0));
    const rightSpent = Math.max(0, Math.round(Number(right?.spentScore) || 0));
    if (leftSpent !== rightSpent) return rightSpent - leftSpent;
    const leftPriority = Math.round(Number(left?.priority) || 0);
    const rightPriority = Math.round(Number(right?.priority) || 0);
    if (leftPriority !== rightPriority) return rightPriority - leftPriority;
    return ENCOUNTER_CHARACTER_KEYS.indexOf(left?.charKey) - ENCOUNTER_CHARACTER_KEYS.indexOf(right?.charKey);
  }

  function getEncounterFinalNodeIndex(configInput) {
    const config = configInput && typeof configInput === 'object' ? configInput : {};
    return Math.max(1, Math.round(Number(config.totalNodes || config.meta?.totalNodes) || 1));
  }

  function isEncounterFinalNode(configInput, nodeIdInput, nodeRuntimeInput = null) {
    const nodeId = normalizeTrimmedString(nodeIdInput, '');
    const nodeRuntime = nodeRuntimeInput || getNodeRuntime(configInput, nodeId);
    const nodeIndex = Math.max(1, Math.round(Number(nodeRuntime?.nodeIndex) || 1));
    if (nodeIndex >= getEncounterFinalNodeIndex(configInput)) return true;
    const role = normalizeTrimmedString(nodeRuntime?.role || nodeRuntime?.ui?.role || nodeRuntime?.ui?.variant, '').toLowerCase();
    return role === 'finale' || nodeId.includes('finale');
  }

  function normalizeEncounterGeoList(value) {
    const raw = Array.isArray(value) ? value : (value ? [value] : []);
    return raw
      .map((entry) => normalizeTrimmedString(entry, '').toUpperCase())
      .filter((entry, index, list) => entry && list.indexOf(entry) === index);
  }

  function normalizeEncounterLaneAlias(value) {
    const lane = normalizeTrimmedString(value, '').toLowerCase();
    const aliases = {
      high: 'white',
      mid_high: 'blue',
      midlow: 'orange',
      mid_low: 'orange',
      low: 'red'
    };
    return aliases[lane] || lane;
  }

  function getEncounterNodeLaneKey(configInput, nodeIdInput) {
    const node = getNodeRuntime(configInput, nodeIdInput);
    const lane = normalizeTrimmedString(node?.lane || node?.ui?.lane, '').toLowerCase();
    if (lane) return lane;
    const lanes = Array.isArray(node?.mainlineLanes) ? node.mainlineLanes : [];
    return normalizeTrimmedString(lanes[0], '').toLowerCase();
  }

  function getEncounterLanePreferenceScore(ruleInput, laneInput) {
    const lane = normalizeEncounterLaneAlias(laneInput);
    const weights = Array.isArray(ruleInput?.laneWeights) ? ruleInput.laneWeights : [];
    const normalizedWeights = weights.map(normalizeEncounterLaneAlias);
    const index = normalizedWeights.indexOf(lane);
    if (index < 0) return 0;
    return Math.max(0, normalizedWeights.length - index) * 4;
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
    const storyFlags = context.storyFlags && typeof context.storyFlags === 'object' && !Array.isArray(context.storyFlags)
      ? context.storyFlags
      : {};
    [
      ...(Array.isArray(context.tags) ? context.tags : []),
      ...(Array.isArray(context.location?.tags) ? context.location.tags : []),
      ...(Array.isArray(context.flags) ? context.flags : []),
      ...Object.entries(storyFlags).filter(([, enabled]) => enabled === true).map(([key]) => key)
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

  function isEncounterCharacterIntroduced(actStateInput, heroStateInput, charKeyInput, contextInput = {}) {
    const charKey = normalizeTrimmedString(charKeyInput, '').toUpperCase();
    if (!ENCOUNTER_CHARACTER_KEYS.includes(charKey)) return false;
    const encounter = expandCharacterEncounterState(actStateInput?.characterEncounter);
    const encounterChar = encounter.characters[charKey];
    if (encounterChar?.firstMeetDone || encounterChar?.status === 'introduced' || encounterChar?.status === 'first_meet') return true;
    const hero = heroStateInput && typeof heroStateInput === 'object' ? heroStateInput : {};
    const heroCast = hero.cast && typeof hero.cast === 'object' ? hero.cast : {};
    const heroRoster = hero.roster && typeof hero.roster === 'object' ? hero.roster : {};
    const context = contextInput && typeof contextInput === 'object' ? contextInput : {};
    const storyFlags = context.storyFlags && typeof context.storyFlags === 'object' && !Array.isArray(context.storyFlags)
      ? context.storyFlags
      : {};
    const introducedCharacters = Array.isArray(context.introducedCharacters)
      ? context.introducedCharacters.map((value) => normalizeTrimmedString(value, '').toUpperCase())
      : [];
    const lowerKey = charKey.toLowerCase();
    return storyFlags[`${lowerKey}_introduced`] === true
      || storyFlags[`${lowerKey}_met`] === true
      || introducedCharacters.includes(charKey)
      || heroCast[charKey]?.introduced === true
      || heroRoster[charKey]?.introduced === true;
  }

  function evaluateEncounterConditionGroup(groupInput, context) {
    const group = groupInput && typeof groupInput === 'object' ? groupInput : {};
    const reasons = [];
    const minFunds = Number(group.minFunds);
    if (minFunds > 0 && context.funds < minFunds) reasons.push('funds');
    const minSpentScore = Number(group.minSpentScore);
    if (minSpentScore > 0 && context.spentScore < minSpentScore) reasons.push('spent_score');
    const requiredFlags = Array.isArray(group.requiredFlags) ? group.requiredFlags : [];
    requiredFlags.forEach((flag) => {
      const normalizedFlag = normalizeTrimmedString(flag, '').toLowerCase();
      const flagEnabled = context.storyFlags[flag] === true
        || context.storyFlags[normalizedFlag] === true
        || context.contextFlags.includes(normalizedFlag);
      if (!flagEnabled) reasons.push(`missing_flag_${normalizedFlag || 'unknown'}`);
    });
    const requiredCharacters = Array.isArray(group.requiredCharacters)
      ? group.requiredCharacters
      : (Array.isArray(group.requiredIntroduced) ? group.requiredIntroduced : []);
    requiredCharacters.forEach((requiredCharKey) => {
      if (!isEncounterCharacterIntroduced(context.act, context.hero, requiredCharKey, context.contextInput)) {
        reasons.push(`requires_${normalizeTrimmedString(requiredCharKey, '').toLowerCase()}`);
      }
    });
    return {
      passed: reasons.length === 0,
      reasons,
      summary: {
        minFunds: Math.max(0, Math.round(minFunds || 0)),
        minSpentScore: Math.max(0, Math.round(minSpentScore || 0)),
        requiredFlags,
        requiredCharacters
      }
    };
  }

  function hasActiveEncounterForCharacter(encounterInput, charKeyInput) {
    const encounter = expandCharacterEncounterState(encounterInput);
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
    const currentLane = getEncounterNodeLaneKey(config, currentNodeId);
    const geo = getEncounterRuntimeGeo(contextInput);
    const tags = collectEncounterRuntimeTags(contextInput, config, currentNodeId);
    const hero = heroStateInput && typeof heroStateInput === 'object' ? heroStateInput : {};
    const funds = Math.max(0, Number(contextInput?.funds ?? hero.funds ?? hero.money) || 0);
    const contextFlags = Array.isArray(contextInput?.flags)
      ? contextInput.flags.map((flag) => normalizeTrimmedString(flag, '').toLowerCase()).filter(Boolean)
      : [];
    const storyFlags = contextInput?.storyFlags && typeof contextInput.storyFlags === 'object' && !Array.isArray(contextInput.storyFlags)
      ? contextInput.storyFlags
      : {};
    const encounter = expandCharacterEncounterState(act.characterEncounter);
    const eligible = [];
    const blocked = [];

    ENCOUNTER_CHARACTER_KEYS.forEach((charKey) => {
      const rule = ENCOUNTER_RULES[charKey];
      const reasons = [];
      if (!rule) reasons.push('missing_rule');
      if (hasActiveEncounterForCharacter(encounter, charKey)) reasons.push('active_or_done');
      if (Number(rule?.minNodeIndex) > 0 && act.nodeIndex < Number(rule.minNodeIndex)) reasons.push('node_index');
      if (Number(rule?.minFunds) > 0 && funds < Number(rule.minFunds)) reasons.push('funds');
      if (rule?.requiredGeo) {
        if (!geo) reasons.push('missing_geo');
        else if (geo !== normalizeTrimmedString(rule.requiredGeo, '').toUpperCase()) reasons.push('geo');
      }
      const optionalGeo = normalizeEncounterGeoList(rule?.optionalGeo);
      const geoScore = optionalGeo.length && optionalGeo.includes(geo) ? 6 : 0;
      const requiredTags = Array.isArray(rule?.requiredTags) ? rule.requiredTags : [];
      if (requiredTags.length && !requiredTags.some((tag) => tags.some((runtimeTag) => runtimeTag.includes(normalizeTrimmedString(tag, '').toLowerCase())))) {
        reasons.push(tags.length ? 'tag' : 'missing_tags');
      }
      const requiredFlags = Array.isArray(rule?.requiredFlags) ? rule.requiredFlags : [];
      requiredFlags.forEach((flag) => {
        const normalizedFlag = normalizeTrimmedString(flag, '').toLowerCase();
        const flagEnabled = storyFlags[flag] === true
          || storyFlags[normalizedFlag] === true
          || contextFlags.includes(normalizedFlag);
        if (!flagEnabled) reasons.push(`missing_flag_${normalizedFlag || 'unknown'}`);
      });
      const requiredIntroduced = Array.isArray(rule?.requiredCharacters)
        ? rule.requiredCharacters
        : (Array.isArray(rule?.requiredIntroduced) ? rule.requiredIntroduced : []);
      requiredIntroduced.forEach((requiredCharKey) => {
        if (!isEncounterCharacterIntroduced(act, hero, requiredCharKey, contextInput)) reasons.push(`requires_${normalizeTrimmedString(requiredCharKey, '').toLowerCase()}`);
      });
      if (rule?.requiresChurchEvent) {
        const hasChurchEvent = contextInput?.churchEvent === true
          || storyFlags.church_event_triggered === true
          || storyFlags.church === true
          || contextFlags.some((flag) => flag.includes('church'))
          || tags.some((tag) => tag.includes('church'));
        if (!hasChurchEvent) reasons.push('missing_church_event');
      }
      const requiredAny = Array.isArray(rule?.requiredAny) ? rule.requiredAny : [];
      const spentScore = calculateEncounterSpentScore(act, rule?.spentWeights);
      const anyResults = requiredAny.map((group) => evaluateEncounterConditionGroup(group, {
        act,
        hero,
        contextInput,
        storyFlags,
        contextFlags,
        funds,
        spentScore
      }));
      if (anyResults.length && !anyResults.some((result) => result.passed)) reasons.push('requires_any');

      if (Number(rule?.minSpentScore) > 0 && spentScore < Number(rule.minSpentScore)) reasons.push('spent_score');
      const laneScore = getEncounterLanePreferenceScore(rule, currentLane);
      const basePriority = Math.round(Number(rule?.priority) || 0);
      const rarity = Number(rule?.rarity) || 3;

      const result = {
        charKey,
        eligible: reasons.length === 0,
        reasonCodes: reasons,
        priority: Math.round(basePriority + (spentScore * 2) + (act.nodeIndex * 3) + laneScore + geoScore + (10 - rarity)),
        spentScore,
        requirements: {
          nodeIndex: Math.max(1, Math.round(Number(act.nodeIndex) || 1)),
          minNodeIndex: Math.max(0, Math.round(Number(rule?.minNodeIndex) || 0)),
          funds,
          minFunds: Math.max(0, Math.round(Number(rule?.minFunds) || 0)),
          geo,
          requiredGeo: normalizeTrimmedString(rule?.requiredGeo, '').toUpperCase(),
          optionalGeo,
          tags,
          requiredTags,
          requiredFlags,
          requiredCharacters: requiredIntroduced,
          requiredAny: anyResults.map((result) => result.summary),
          spentScore,
          minSpentScore: Math.max(0, Math.round(Number(rule?.minSpentScore) || 0)),
          lane: currentLane,
          laneScore,
          geoScore,
          rarity,
          basePriority
        },
        debugLabel: normalizeTrimmedString(rule?.debugLabel, charKey),
        preSignalPreferred: rule?.preSignalPreferred === true,
        preSignalHint: normalizeTrimmedString(rule?.preSignalHint, ''),
        firstMeetHint: normalizeTrimmedString(rule?.firstMeetHint, '')
      };
      if (result.eligible) eligible.push(result);
      else blocked.push(result);
    });

    eligible.sort(compareEncounterPriority);
    return { eligible, blocked, context: { geo, tags, currentNodeId, funds } };
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
      expandCharacterEncounterState(act.characterEncounter).queue
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
        if (isEncounterFinalNode(config, nodeId, nodeRuntime)) return;
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
          if (isEncounterFinalNode(config, nodeId)) return;
          seen.add(nodeId);
          candidates.push({ nodeId, nodeIndex, distance: nodeIndex - currentIndex, weight: 1 });
        });
      }
    }

    return candidates;
  }

  function pickEncounterTargetPhaseIndex(actStateInput, requestInput, targetInput, options = {}) {
    if (normalizeEncounterQueueType(requestInput?.type) === 'first_meet') {
      return FIRST_MEET_PHASE_INDEX;
    }
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
    const encounter = expandCharacterEncounterState(act.characterEncounter);
    const currentNodeIndex = Math.max(1, Math.round(Number(act.nodeIndex) || 1));
    const requestedCharKey = normalizeTrimmedString(options.charKey || options.requestCharKey || options.forceCharKey, '').toUpperCase();
    const requestedType = normalizeTrimmedString(options.type || options.requestType, '').toLowerCase();
    const hasActivePlacedRequest = encounter.queue.some((item) => (
      ['first_meet', 'pre_signal'].includes(item.type)
      && item.status === 'placed'
      && item.targetNodeId
    ));
    if (hasActivePlacedRequest) {
      setCharacterEncounterState(act, encounter);
      return { actState: act, placed: null, reason: 'active_placement' };
    }
    const pendingRequests = encounter.queue
      .filter((item) => (
        ['first_meet', 'pre_signal'].includes(item.type)
        && item.status === 'queued'
        && (!requestedCharKey || item.charKey === requestedCharKey)
        && (!requestedType || item.type === requestedType)
      ))
      .sort((left, right) => compareEncounterPriority(left, right) || left.createdNodeIndex - right.createdNodeIndex);
    const request = pendingRequests[0] || null;
    if (!request) {
      setCharacterEncounterState(act, encounter);
      return {
        actState: act,
        placed: null,
        reason: 'empty_queue'
      };
    }
    if (
      options.ignoreCooldown !== true
      && encounter.meta.lastFirstMeetNodeIndex > 0
      && currentNodeIndex < encounter.meta.lastFirstMeetNodeIndex + Math.max(1, Math.round(Number(options.cooldownNodes) || 1))
    ) {
      setCharacterEncounterState(act, encounter);
      return { actState: act, placed: null, reason: 'cooldown' };
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
      setCharacterEncounterState(act, encounter);
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
      status: request.type === 'pre_signal' ? 'pre_signal' : 'queued',
      queuedRequestId: placed.id,
      placedNodeId: placed.targetNodeId,
      lastEvaluatedNodeIndex: currentNodeIndex,
      reasonCodes: deepClone(placed.reasonCodes),
      firstMeetHint: placed.firstMeetHint || charState.firstMeetHint,
      preSignalHint: placed.preSignalHint || charState.preSignalHint,
      debugLabel: placed.debugLabel || charState.debugLabel
    };
    setCharacterEncounterState(act, encounter);
    return { actState: act, placed };
  }

  function queueFirstMeetAfterPreSignal(actStateInput, requestInput, ruleInput, configInput, options = {}) {
    const act = normalizeActState(actStateInput);
    const encounter = expandCharacterEncounterState(act.characterEncounter);
    const request = requestInput || {};
    const charKey = normalizeTrimmedString(request.charKey, '').toUpperCase();
    if (!ENCOUNTER_CHARACTER_KEYS.includes(charKey)) {
      setCharacterEncounterState(act, encounter);
      return { actState: act, queued: null, placed: null, reason: 'unknown_character' };
    }
    const existingActive = encounter.queue.find((item) => (
      item.charKey === charKey &&
      item.type === 'first_meet' &&
      !ENCOUNTER_TERMINAL_QUEUE_STATUSES.includes(item.status)
    ));
    if (existingActive) {
      setCharacterEncounterState(act, encounter);
      return { actState: act, queued: existingActive, placed: existingActive.status === 'placed' ? existingActive : null, reason: 'existing_followup' };
    }

    const currentNodeIndex = Math.max(1, Math.round(Number(act.nodeIndex) || 1));
    const rule = ruleInput || ENCOUNTER_RULES[charKey] || {};
    const firstMeetHint = normalizeTrimmedString(request.firstMeetHint || rule.firstMeetHint, '');
    const followUpRequest = {
      id: buildEncounterRequestId(act, charKey, 'first_meet', encounter.queue.length),
      charKey,
      type: 'first_meet',
      status: 'queued',
      targetNodeId: '',
      targetNodeIndex: 0,
      targetPhaseIndex: FIRST_MEET_PHASE_INDEX,
      createdNodeIndex: currentNodeIndex,
      expiresNodeIndex: 0,
      priority: Math.max(999, Math.round(Number(request.priority) || 0) + 50),
      spentScore: Math.max(0, Math.round(Number(request.spentScore) || 0)),
      reasonCodes: ['pre_signal_followup'],
      debugLabel: normalizeTrimmedString(request.debugLabel || rule.debugLabel, charKey),
      preSignalHint: normalizeTrimmedString(request.preSignalHint || rule.preSignalHint, ''),
      firstMeetHint
    };
    encounter.queue.push(followUpRequest);
    encounter.characters[charKey] = {
      ...(encounter.characters[charKey] || createDefaultEncounterCharacterState(charKey)),
      status: 'queued',
      preSignalDone: true,
      queuedRequestId: followUpRequest.id,
      placedNodeId: '',
      lastEvaluatedNodeIndex: currentNodeIndex,
      reasonCodes: deepClone(followUpRequest.reasonCodes),
      preSignalHint: followUpRequest.preSignalHint,
      firstMeetHint: followUpRequest.firstMeetHint,
      debugLabel: followUpRequest.debugLabel
    };
    setCharacterEncounterState(act, encounter);
    const placedResult = placeNextCharacterEncounter(act, configInput, {
      ...options,
      requestCharKey: charKey,
      requestType: 'first_meet',
      distance: 1
    });
    const placed = placedResult.placed || null;
    const queued = placed || followUpRequest;
    return { actState: placedResult.actState, queued, placed };
  }

  function enqueueEligibleCharacterEncounters(actStateInput, heroStateInput = {}, options = {}) {
    const act = normalizeActState(actStateInput);
    const encounter = expandCharacterEncounterState(act.characterEncounter);
    const evaluated = options.eligibility || evaluateCharacterEncounterEligibility({ ...act, characterEncounter: encounter }, heroStateInput, options.context || {});
    const limit = Math.max(1, Math.round(Number(options.limit) || 1));
    const queued = [];
    evaluated.eligible.forEach((candidate) => {
      if (queued.length >= limit) return;
      if (hasActiveEncounterForCharacter(encounter, candidate.charKey)) return;
      const charState = encounter.characters[candidate.charKey] || createDefaultEncounterCharacterState(candidate.charKey);
      const shouldPreSignal = options.disablePreSignal !== true
        && candidate.preSignalPreferred === true
        && charState.preSignalDone !== true;
      const requestType = shouldPreSignal ? 'pre_signal' : 'first_meet';
      const request = {
        id: buildEncounterRequestId(act, candidate.charKey, requestType, encounter.queue.length + queued.length),
        charKey: candidate.charKey,
        type: requestType,
        status: 'queued',
        targetNodeId: '',
        targetNodeIndex: 0,
        targetPhaseIndex: requestType === 'first_meet' ? FIRST_MEET_PHASE_INDEX : 0,
        createdNodeIndex: Math.max(1, Math.round(Number(act.nodeIndex) || 1)),
        expiresNodeIndex: 0,
        priority: shouldPreSignal ? candidate.priority + 25 : (charState.preSignalDone === true ? candidate.priority + 18 : candidate.priority),
        spentScore: Math.max(0, Math.round(Number(candidate.spentScore) || 0)),
        reasonCodes: deepClone(candidate.reasonCodes),
        debugLabel: candidate.debugLabel,
        preSignalHint: candidate.preSignalHint,
        firstMeetHint: candidate.firstMeetHint
      };
      encounter.queue.push(request);
      encounter.characters[candidate.charKey] = {
        ...charState,
        status: shouldPreSignal ? 'pre_signal' : 'queued',
        queuedRequestId: request.id,
        placedNodeId: '',
        lastEvaluatedNodeIndex: Math.max(1, Math.round(Number(act.nodeIndex) || 1)),
        reasonCodes: deepClone(request.reasonCodes),
        preSignalHint: request.preSignalHint,
        firstMeetHint: request.firstMeetHint,
        debugLabel: request.debugLabel
      };
      queued.push(request);
    });
    setCharacterEncounterState(act, encounter);
    if (options.place !== true) return { actState: act, queued, placed: null, evaluated };
    const placedResult = placeNextCharacterEncounter(act, options.config || getChapter(act.id), options);
    return { actState: placedResult.actState, queued, placed: placedResult.placed, evaluated };
  }

  function consumeCharacterEncounterForNode(actStateInput, nodeIdInput, options = {}) {
    const act = normalizeActState(actStateInput);
    const encounter = expandCharacterEncounterState(act.characterEncounter);
    const nodeId = normalizeTrimmedString(nodeIdInput || getCurrentActNodeId(act), '');
    const phaseIndex = Number.isFinite(Number(options.phaseIndex))
      ? Math.max(0, Math.min(3, Math.round(Number(options.phaseIndex) || 0)))
      : null;
    const request = encounter.queue.find((item) => (
      ['first_meet', 'pre_signal'].includes(item.type)
      && item.status === 'placed'
      && item.targetNodeId === nodeId
      && (phaseIndex === null || item.targetPhaseIndex === phaseIndex)
    ));
    if (!request) {
      setCharacterEncounterState(act, encounter);
      return { actState: act, consumed: null };
    }

    const currentNodeIndex = Math.max(1, Math.round(Number(act.nodeIndex) || 1));
    const rule = ENCOUNTER_RULES[request.charKey] || {};
    if (request.type === 'pre_signal') {
      const preSignalHint = normalizeTrimmedString(request.preSignalHint || rule.preSignalHint, '');
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
        status: 'pre_signal',
        preSignalDone: true,
        preSignalNodeId: nodeId,
        preSignalAtNodeIndex: currentNodeIndex,
        preSignalPhaseIndex: phaseIndex === null ? request.targetPhaseIndex : phaseIndex,
        queuedRequestId: '',
        placedNodeId: '',
        lastEvaluatedNodeIndex: currentNodeIndex,
        reasonCodes: deepClone(request.reasonCodes),
        preSignalHint,
        firstMeetHint: normalizeTrimmedString(request.firstMeetHint || rule.firstMeetHint, ''),
        debugLabel: normalizeTrimmedString(request.debugLabel || rule.debugLabel, request.charKey)
      };
      setCharacterEncounterState(act, encounter);
      const followUp = queueFirstMeetAfterPreSignal(act, request, rule, options.config || getChapter(act.id), options);
      return {
        actState: followUp.actState,
        consumed,
        queued: followUp.queued,
        placed: followUp.placed
      };
    }
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
      introducedPhaseIndex: phaseIndex === null ? request.targetPhaseIndex : phaseIndex,
      cooldownUntilNodeIndex: currentNodeIndex + Math.max(1, Math.round(Number(options.cooldownNodes) || 1)),
      reasonCodes: deepClone(request.reasonCodes),
      firstMeetHint,
      debugLabel: normalizeTrimmedString(request.debugLabel || rule.debugLabel, request.charKey)
    };
    encounter.meta.lastFirstMeetNodeIndex = currentNodeIndex;
    setCharacterEncounterState(act, encounter);
    return { actState: act, consumed };
  }

  function updateCharacterEncountersForNodeEntry(actStateInput, heroStateInput = {}, configInput = null, contextInput = {}) {
    const act = normalizeActState(actStateInput);
    const config = configInput || getChapter(act.id);
    const enqueueResult = enqueueEligibleCharacterEncounters(act, heroStateInput, {
      context: contextInput,
      config,
      limit: ENCOUNTER_CHARACTER_KEYS.length,
      place: false
    });
    const placedResult = placeNextCharacterEncounter(enqueueResult.actState, config);
    return {
      actState: placedResult.actState,
      consumed: null,
      queued: enqueueResult.queued,
      placed: placedResult.placed,
      reason: placedResult.reason || null,
      evaluated: enqueueResult.evaluated
    };
  }

  function debugForceCharacterEncounter(actStateInput, charKeyInput, configInput = null, options = {}) {
    const charKey = normalizeTrimmedString(charKeyInput, '').toUpperCase();
    const act = normalizeActState(actStateInput);
    const config = configInput || getChapter(act.id);
    const encounter = expandCharacterEncounterState(act.characterEncounter);
    const rule = ENCOUNTER_RULES[charKey] || null;
    if (!ENCOUNTER_CHARACTER_KEYS.includes(charKey) || !rule) {
      setCharacterEncounterState(act, encounter);
      return { actState: act, applied: false, reason: 'unknown_character' };
    }
    if (encounter.characters[charKey]?.firstMeetDone || encounter.characters[charKey]?.status === 'introduced') {
      setCharacterEncounterState(act, encounter);
      return { actState: act, applied: false, reason: 'already_introduced' };
    }
    const active = encounter.queue.find((item) => item.charKey === charKey && !ENCOUNTER_TERMINAL_QUEUE_STATUSES.includes(item.status));
    let rollbackRequestId = active?.status === 'queued'
      && Array.isArray(active.reasonCodes)
      && active.reasonCodes.includes('debug_force')
      ? active.id
      : '';
    if (active?.status === 'placed') {
      setCharacterEncounterState(act, encounter);
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
        targetPhaseIndex: FIRST_MEET_PHASE_INDEX,
        createdNodeIndex: Math.max(1, Math.round(Number(act.nodeIndex) || 1)),
        expiresNodeIndex: 0,
        priority: 999,
        spentScore: Math.max(0, calculateEncounterSpentScore(act, rule.spentWeights)),
        reasonCodes: ['debug_force'],
        debugLabel: normalizeTrimmedString(rule.debugLabel, charKey),
        firstMeetHint: normalizeTrimmedString(rule.firstMeetHint, '')
      };
      encounter.queue.push(request);
      rollbackRequestId = request.id;
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
    setCharacterEncounterState(act, encounter);
    const placedResult = placeNextCharacterEncounter(act, config, {
      ...options,
      distance: Math.max(1, Math.round(Number(options.distance) || 1)),
      ignoreCooldown: options.ignoreCooldown === true,
      forceCharKey: charKey
    });
    const nextActiveRequest = expandCharacterEncounterState(placedResult.actState.characterEncounter).queue.find((item) => (
      item.charKey === charKey
      && !ENCOUNTER_TERMINAL_QUEUE_STATUSES.includes(item.status)
    )) || null;
    const applied = Boolean(placedResult.placed || nextActiveRequest);
    if (!applied && rollbackRequestId) {
      const nextEncounter = expandCharacterEncounterState(placedResult.actState.characterEncounter);
      nextEncounter.queue = nextEncounter.queue.filter((item) => item.id !== rollbackRequestId);
      nextEncounter.characters[charKey] = {
        ...createDefaultEncounterCharacterState(charKey),
        reasonCodes: [placedResult.reason || 'not_placed'],
        firstMeetHint: normalizeTrimmedString(rule.firstMeetHint, ''),
        debugLabel: normalizeTrimmedString(rule.debugLabel, charKey)
      };
      setCharacterEncounterState(placedResult.actState, nextEncounter);
    }
    return {
      actState: placedResult.actState,
      applied,
      request: nextActiveRequest,
      placed: placedResult.placed,
      reason: placedResult.reason || ''
    };
  }

  function buildEncounterMarkersForSnapshot(actStateInput) {
    const encounter = expandCharacterEncounterState(actStateInput?.characterEncounter);
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
        normalizeCharacterEncounterState,
        expandCharacterEncounterState,
        getActiveEncounterCharacterKeys,
        getCharacterEncounterFirstMeetMap,
        getCharacterEncounterNodeFirstMeetMap,
        getCharacterEncounterPreSignalMap,
        calculateEncounterSpentScore,
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
