/**
 * ACEZERO ACT ENCOUNTER RUNTIME
 *
 * Owns compact character encounter ledger state and Dashboard markers.
 * Persistent state is only { active, met, signaled, lastMeet }.
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
        ENCOUNTER_CHARACTER_KEYS = ['SIA', 'TRIXIE', 'POPPY', 'COTA', 'VV', 'KUZUHA', 'KAKO', 'EULALIA']
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

      function isPlainEncounterObject(value) {
        return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
      }

      function normalizeEncounterKind(value) {
        const normalized = normalizeTrimmedString(value, 'meet').toLowerCase();
        return normalized === 'pre_signal' || normalized === 'signal' ? 'signal' : 'meet';
      }

      function normalizeEncounterActiveState(value) {
        const normalized = normalizeTrimmedString(value, 'queued').toLowerCase();
        return normalized === 'placed' ? 'placed' : 'queued';
      }

      function encounterKindToUiType(kind) {
        return normalizeEncounterKind(kind) === 'signal' ? 'pre_signal' : 'first_meet';
      }

      function uiTypeToEncounterKind(type) {
        const normalized = normalizeTrimmedString(type, '').toLowerCase();
        return normalized === 'pre_signal' || normalized === 'signal' ? 'signal' : 'meet';
      }

      function normalizeEncounterPhase(value, fallback = null) {
        if (!Number.isFinite(Number(value))) return fallback;
        const phase = Math.round(Number(value));
        if (phase < 0) return fallback;
        return Math.max(0, Math.min(3, phase));
      }

      function getEntryPhase(entry) {
        const kind = normalizeEncounterKind(entry?.kind);
        return normalizeEncounterPhase(entry?.phase, kind === 'meet' ? FIRST_MEET_PHASE_INDEX : 0);
      }

      function normalizeEncounterFactEntry(value) {
        const source = value === true ? {} : (isPlainEncounterObject(value) ? value : {});
        const out = {};
        const node = normalizeTrimmedString(source.node, '');
        const nodeIndex = Math.max(0, Math.round(Number(source.nodeIndex) || 0));
        const phase = normalizeEncounterPhase(source.phase, null);
        if (node) out.node = node;
        if (nodeIndex > 0) out.nodeIndex = nodeIndex;
        if (phase !== null) out.phase = phase;
        return out;
      }

      function normalizeActiveEncounterEntry(value, rawCharKey = '') {
        if (!isPlainEncounterObject(value)) return null;
        const charKey = normalizeTrimmedString(rawCharKey, '').toUpperCase();
        if (!ENCOUNTER_CHARACTER_KEYS.includes(charKey)) return null;
        const kind = normalizeEncounterKind(value.kind);
        let state = normalizeEncounterActiveState(value.state);
        const node = normalizeTrimmedString(value.node, '');
        if (state === 'placed' && !node) state = 'queued';
        const hasTarget = Boolean(node);
        const phase = normalizeEncounterPhase(value.phase, null);
        const nodeIndex = Math.max(0, Math.round(Number(value.nodeIndex) || 0));
        const from = Math.max(0, Math.round(Number(value.from) || 0));
        const until = Math.max(0, Math.round(Number(value.until) || 0));
        const priority = Math.round(Number(value.priority) || 0);

        const entry = { kind, state };
        if (hasTarget) entry.node = node;
        if (hasTarget && nodeIndex > 0) entry.nodeIndex = nodeIndex;
        if (hasTarget && phase !== null && (kind === 'signal' || phase !== FIRST_MEET_PHASE_INDEX)) entry.phase = phase;
        if (from > 0) entry.from = from;
        if (hasTarget && until > 0) entry.until = until;
        if (priority !== 0) entry.priority = priority;
        return { charKey, entry };
      }

      function shouldReplaceActiveEncounter(current, next) {
        if (!current) return true;
        const currentRank = current.state === 'placed' ? 2 : 1;
        const nextRank = next.state === 'placed' ? 2 : 1;
        if (currentRank !== nextRank) return nextRank > currentRank;
        const currentPriority = Math.round(Number(current.priority) || 0);
        const nextPriority = Math.round(Number(next.priority) || 0);
        if (currentPriority !== nextPriority) return nextPriority > currentPriority;
        return Math.max(0, Math.round(Number(next.from) || 0)) < Math.max(0, Math.round(Number(current.from) || 0));
      }

      function putActiveEncounter(target, charKey, entry) {
        if (!charKey || !entry) return;
        if (!target.active) target.active = {};
        if (shouldReplaceActiveEncounter(target.active[charKey], entry)) target.active[charKey] = entry;
      }

      function putEncounterFact(target, bucket, charKey, fact) {
        if (!charKey) return;
        if (!target[bucket]) target[bucket] = {};
        target[bucket][charKey] = normalizeEncounterFactEntry(fact);
      }

      function compactEncounterLedger(ledgerInput) {
        const ledger = ledgerInput && typeof ledgerInput === 'object' && !Array.isArray(ledgerInput) ? ledgerInput : {};
        const out = {};
        if (ledger.active && Object.keys(ledger.active).length) out.active = ledger.active;
        if (ledger.met && Object.keys(ledger.met).length) out.met = ledger.met;
        if (ledger.signaled && Object.keys(ledger.signaled).length) out.signaled = ledger.signaled;
        const lastMeet = Math.max(0, Math.round(Number(ledger.lastMeet) || 0));
        if (lastMeet > 0) out.lastMeet = lastMeet;
        return out;
      }

      function normalizeCharacterEncounterState(value) {
        const source = isPlainEncounterObject(value) ? value : {};
        const compact = {};
        const lastMeet = Math.max(0, Math.round(Number(source.lastMeet) || 0));
        if (lastMeet > 0) compact.lastMeet = lastMeet;

        if (isPlainEncounterObject(source.active)) {
          Object.entries(source.active).forEach(([rawKey, rawEntry]) => {
            const normalized = normalizeActiveEncounterEntry(rawEntry, rawKey);
            if (normalized) putActiveEncounter(compact, normalized.charKey, normalized.entry);
          });
        }

        if (isPlainEncounterObject(source.met)) {
          Object.entries(source.met).forEach(([rawKey, rawValue]) => {
            const charKey = normalizeTrimmedString(rawKey, '').toUpperCase();
            if (ENCOUNTER_CHARACTER_KEYS.includes(charKey)) putEncounterFact(compact, 'met', charKey, rawValue);
          });
        }

        if (isPlainEncounterObject(source.signaled)) {
          Object.entries(source.signaled).forEach(([rawKey, rawValue]) => {
            const charKey = normalizeTrimmedString(rawKey, '').toUpperCase();
            if (ENCOUNTER_CHARACTER_KEYS.includes(charKey)) putEncounterFact(compact, 'signaled', charKey, rawValue);
          });
        }

        if (compact.met && compact.active) {
          Object.keys(compact.met).forEach((charKey) => {
            delete compact.active[charKey];
          });
          if (!Object.keys(compact.active).length) delete compact.active;
        }

        return compactEncounterLedger(compact);
      }

      function setCharacterEncounterState(act, encounter) {
        act.characterEncounter = normalizeCharacterEncounterState(encounter);
        return act.characterEncounter;
      }

      function getActiveEncounterEntries(characterEncounterInput, filterFn = null) {
        const encounter = normalizeCharacterEncounterState(characterEncounterInput);
        return Object.entries(encounter.active || {})
          .map(([charKey, entry]) => ({ charKey, entry }))
          .filter(({ entry }) => entry && typeof entry === 'object')
          .filter(filterFn || (() => true));
      }

      function hasMetEncounter(encounter, charKey) {
        return Boolean(encounter.met && encounter.met[charKey]);
      }

      function hasSignaledEncounter(encounter, charKey) {
        return Boolean(encounter.signaled && encounter.signaled[charKey]);
      }

      function hasActiveEncounter(encounter, charKey) {
        return Boolean(encounter.active && encounter.active[charKey]);
      }

      function getActiveEncounterCharacterKeys(characterEncounterInput) {
        const encounter = normalizeCharacterEncounterState(characterEncounterInput);
        return Array.from(new Set([
          ...Object.keys(encounter.active || {}),
          ...Object.keys(encounter.met || {}),
          ...Object.keys(encounter.signaled || {})
        ]));
      }

      function getCharacterEncounterFirstMeetMap(actStateInput, currentNodeId) {
        const actState = normalizeActState(actStateInput);
        const nodeId = normalizeTrimmedString(currentNodeId, '');
        const phaseIndex = Math.max(0, Math.min(3, Math.round(Number(actState.phase_index) || 0)));
        const hints = {};
        getActiveEncounterEntries(actState.characterEncounter, ({ entry }) => (
          normalizeEncounterKind(entry.kind) === 'meet'
          && entry.state === 'placed'
          && normalizeTrimmedString(entry.node, '') === nodeId
          && getEntryPhase(entry) === phaseIndex
        )).forEach(({ charKey }) => {
          const hint = normalizeTrimmedString(ENCOUNTER_RULES[charKey]?.firstMeetHint, '');
          if (hint) hints[charKey] = hint;
        });
        return hints;
      }

      function getCharacterEncounterNodeFirstMeetMap(actStateInput, currentNodeId) {
        const actState = normalizeActState(actStateInput);
        const nodeId = normalizeTrimmedString(currentNodeId, '');
        const hints = {};
        getActiveEncounterEntries(actState.characterEncounter, ({ entry }) => (
          normalizeEncounterKind(entry.kind) === 'meet'
          && entry.state === 'placed'
          && normalizeTrimmedString(entry.node, '') === nodeId
        )).forEach(({ charKey, entry }) => {
          hints[charKey] = {
            charKey,
            hint: normalizeTrimmedString(ENCOUNTER_RULES[charKey]?.firstMeetHint, ''),
            targetPhaseIndex: getEntryPhase(entry)
          };
        });
        return hints;
      }

      function getCharacterEncounterPreSignalMap(actStateInput, currentNodeId) {
        const actState = normalizeActState(actStateInput);
        const encounter = normalizeCharacterEncounterState(actState.characterEncounter);
        const nodeId = normalizeTrimmedString(currentNodeId, '');
        const phaseIndex = Math.max(0, Math.min(4, Math.round(Number(actState.phase_index) || 0)));
        const hints = {};
        Object.entries(encounter.signaled || {}).forEach(([charKey, fact]) => {
          const signalPhaseIndex = normalizeEncounterPhase(fact?.phase, -1);
          const signalNodeIndex = Math.max(0, Math.round(Number(fact?.nodeIndex) || 0));
          const signalNodeId = normalizeTrimmedString(fact?.node, '');
          const sameNodeNextPhase = (!signalNodeId || signalNodeId === nodeId)
            && signalPhaseIndex >= 0
            && phaseIndex === Math.min(4, signalPhaseIndex + 1);
          const nextNodeAfterFinalPhase = signalPhaseIndex === 3
            && signalNodeIndex > 0
            && Math.max(1, Math.round(Number(actState.nodeIndex) || 1)) === signalNodeIndex + 1
            && phaseIndex === 0;
          if (!sameNodeNextPhase && !nextNodeAfterFinalPhase) return;
          const hint = normalizeTrimmedString(ENCOUNTER_RULES[charKey]?.preSignalHint, '');
          if (hint) hints[charKey] = hint;
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
        const leftPriority = Math.round(Number(left?.priority) || 0);
        const rightPriority = Math.round(Number(right?.priority) || 0);
        if (leftPriority !== rightPriority) return rightPriority - leftPriority;
        const leftFrom = Math.max(0, Math.round(Number(left?.from) || 0));
        const rightFrom = Math.max(0, Math.round(Number(right?.from) || 0));
        if (leftFrom !== rightFrom) return leftFrom - rightFrom;
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
        const encounter = normalizeCharacterEncounterState(actStateInput?.characterEncounter);
        if (hasMetEncounter(encounter, charKey)) return true;
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
        const encounter = normalizeCharacterEncounterState(encounterInput);
        const charKey = normalizeTrimmedString(charKeyInput, '').toUpperCase();
        if (!ENCOUNTER_CHARACTER_KEYS.includes(charKey)) return false;
        return hasActiveEncounter(encounter, charKey) || hasMetEncounter(encounter, charKey);
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
        const encounter = normalizeCharacterEncounterState(act.characterEncounter);
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

        eligible.sort((left, right) => compareEncounterPriority(left, right));
        return { eligible, blocked, context: { geo, tags, currentNodeId, funds } };
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
          getActiveEncounterEntries(act.characterEncounter, ({ entry }) => normalizeTrimmedString(entry.node, ''))
            .map(({ entry }) => normalizeTrimmedString(entry.node, ''))
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

      function pickEncounterTargetPhaseIndex(actStateInput, activeEntry, targetInput, options = {}) {
        if (normalizeEncounterKind(activeEntry?.kind) === 'meet') return FIRST_MEET_PHASE_INDEX;
        if (Number.isFinite(Number(options.targetPhaseIndex))) {
          return Math.max(0, Math.min(3, Math.round(Number(options.targetPhaseIndex) || 0)));
        }
        const seed = [
          actStateInput?.seed || DEFAULT_WORLD_ACT.seed,
          actStateInput?.id || DEFAULT_WORLD_ACT.id,
          normalizeEncounterKind(activeEntry?.kind),
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
        const requestedCharKey = normalizeTrimmedString(options.charKey || options.requestCharKey || options.forceCharKey, '').toUpperCase();
        const requestedKind = options.kind || options.requestKind || options.type || options.requestType
          ? uiTypeToEncounterKind(options.kind || options.requestKind || options.type || options.requestType)
          : '';
        const hasPlaced = Object.values(encounter.active || {}).some((entry) => entry?.state === 'placed' && normalizeTrimmedString(entry.node, ''));
        if (hasPlaced) {
          act.characterEncounter = encounter;
          return { actState: act, placed: null, reason: 'active_placement' };
        }

        const activeEntries = getActiveEncounterEntries(encounter, ({ charKey, entry }) => (
          entry.state === 'queued'
          && (!requestedCharKey || charKey === requestedCharKey)
          && (!requestedKind || normalizeEncounterKind(entry.kind) === requestedKind)
        )).sort((left, right) => compareEncounterPriority(
          { ...left.entry, charKey: left.charKey },
          { ...right.entry, charKey: right.charKey }
        ));
        const selected = activeEntries[0] || null;
        if (!selected) {
          act.characterEncounter = encounter;
          return { actState: act, placed: null, reason: 'empty_active' };
        }
        if (
          options.ignoreCooldown !== true
          && normalizeEncounterKind(selected.entry.kind) === 'meet'
          && encounter.lastMeet > 0
          && currentNodeIndex < encounter.lastMeet + Math.max(1, Math.round(Number(options.cooldownNodes) || 1))
        ) {
          act.characterEncounter = encounter;
          return { actState: act, placed: null, reason: 'cooldown' };
        }

        const candidates = findEncounterPlacementCandidates({ ...act, characterEncounter: encounter }, configInput, options);
        const target = pickFromCandidates(candidates, [
          act.seed || DEFAULT_WORLD_ACT.seed,
          act.id || DEFAULT_WORLD_ACT.id,
          selected.charKey,
          selected.entry.kind,
          currentNodeIndex,
          candidates.map((item) => item.nodeId).join(',')
        ].join('|')) || null;
        if (!target) {
          act.characterEncounter = encounter;
          return { actState: act, placed: null, reason: 'no_candidate' };
        }

        const phase = pickEncounterTargetPhaseIndex(act, selected.entry, target, options);
        const placed = normalizeActiveEncounterEntry({
          ...selected.entry,
          state: 'placed',
          node: target.nodeId,
          nodeIndex: target.nodeIndex,
          phase,
          until: target.nodeIndex + Math.max(1, Math.round(Number(options.expireAfterNodes) || 2))
        }, selected.charKey);
        if (placed) {
          if (!encounter.active) encounter.active = {};
          encounter.active[selected.charKey] = placed.entry;
        }
        act.characterEncounter = normalizeCharacterEncounterState(encounter);
        return {
          actState: act,
          placed: placed ? { charKey: selected.charKey, ...placed.entry } : null
        };
      }

      function placeQueuedCharacterEncounterOnNode(actStateInput, nodeIdInput, configInput, options = {}) {
        const act = normalizeActState(actStateInput);
        const encounter = normalizeCharacterEncounterState(act.characterEncounter);
        const config = configInput || getChapter(act.id);
        const nodeId = normalizeTrimmedString(nodeIdInput || getCurrentActNodeId(act), '');
        const currentNodeIndex = Math.max(1, Math.round(Number(act.nodeIndex) || 1));
        const requestedCharKey = normalizeTrimmedString(options.charKey || options.requestCharKey || options.forceCharKey, '').toUpperCase();
        const requestedKind = options.kind || options.requestKind || options.type || options.requestType
          ? uiTypeToEncounterKind(options.kind || options.requestKind || options.type || options.requestType)
          : '';
        if (!nodeId) {
          act.characterEncounter = encounter;
          return { actState: act, placed: null, reason: 'missing_node' };
        }
        if (isEncounterFinalNode(config, nodeId)) {
          act.characterEncounter = encounter;
          return { actState: act, placed: null, reason: 'final_node' };
        }
        const hasPlaced = Object.values(encounter.active || {}).some((entry) => entry?.state === 'placed' && normalizeTrimmedString(entry.node, ''));
        if (hasPlaced) {
          act.characterEncounter = encounter;
          return { actState: act, placed: null, reason: 'active_placement' };
        }

        const activeEntries = getActiveEncounterEntries(encounter, ({ charKey, entry }) => (
          entry.state === 'queued'
          && (!requestedCharKey || charKey === requestedCharKey)
          && (!requestedKind || normalizeEncounterKind(entry.kind) === requestedKind)
          && (options.onlyOverdue !== true || Math.max(0, Math.round(Number(entry.from) || 0)) < currentNodeIndex)
        )).sort((left, right) => compareEncounterPriority(
          { ...left.entry, charKey: left.charKey },
          { ...right.entry, charKey: right.charKey }
        ));
        const selected = activeEntries[0] || null;
        if (!selected) {
          act.characterEncounter = encounter;
          return { actState: act, placed: null, reason: 'empty_active' };
        }
        if (
          options.ignoreCooldown !== true
          && normalizeEncounterKind(selected.entry.kind) === 'meet'
          && encounter.lastMeet > 0
          && currentNodeIndex < encounter.lastMeet + Math.max(1, Math.round(Number(options.cooldownNodes) || 1))
        ) {
          act.characterEncounter = encounter;
          return { actState: act, placed: null, reason: 'cooldown' };
        }

        const nodeRuntime = getNodeRuntime(config, nodeId);
        const targetNodeIndex = Math.max(1, Math.round(Number(nodeRuntime?.nodeIndex) || currentNodeIndex));
        const phase = Number.isFinite(Number(options.targetPhaseIndex))
          ? Math.max(0, Math.min(3, Math.round(Number(options.targetPhaseIndex) || 0)))
          : getEntryPhase(selected.entry);
        const placed = normalizeActiveEncounterEntry({
          ...selected.entry,
          state: 'placed',
          node: nodeId,
          nodeIndex: targetNodeIndex,
          phase,
          until: targetNodeIndex + Math.max(1, Math.round(Number(options.expireAfterNodes) || 2))
        }, selected.charKey);
        if (placed) {
          if (!encounter.active) encounter.active = {};
          encounter.active[selected.charKey] = placed.entry;
        }
        act.characterEncounter = normalizeCharacterEncounterState(encounter);
        return {
          actState: act,
          placed: placed ? { charKey: selected.charKey, ...placed.entry } : null
        };
      }

      function createActiveEncounterEntry(act, charKey, kind, priority) {
        return {
          kind,
          state: 'queued',
          from: Math.max(1, Math.round(Number(act.nodeIndex) || 1)),
          priority: Math.round(Number(priority) || 0)
        };
      }

      function createFollowUpMeet(actStateInput, charKeyInput, ruleInput, options = {}) {
        const act = normalizeActState(actStateInput);
        const encounter = normalizeCharacterEncounterState(act.characterEncounter);
        const charKey = normalizeTrimmedString(charKeyInput, '').toUpperCase();
        const rule = ruleInput || ENCOUNTER_RULES[charKey] || {};
        if (!ENCOUNTER_CHARACTER_KEYS.includes(charKey)) {
          act.characterEncounter = encounter;
          return { actState: act, created: null, placed: null, reason: 'unknown_character' };
        }
        if (hasMetEncounter(encounter, charKey)) {
          act.characterEncounter = encounter;
          return { actState: act, created: null, placed: null, reason: 'already_met' };
        }
        if (hasActiveEncounter(encounter, charKey)) {
          act.characterEncounter = encounter;
          return { actState: act, created: null, active: encounter.active[charKey], placed: null, reason: 'already_active' };
        }
        if (!encounter.active) encounter.active = {};
        const created = createActiveEncounterEntry(act, charKey, 'meet', Math.max(999, Math.round(Number(rule.priority) || 0) + 50));
        encounter.active[charKey] = created;
        act.characterEncounter = normalizeCharacterEncounterState(encounter);
        const placedResult = placeNextCharacterEncounter(act, options.config || getChapter(act.id), {
          ...options,
          requestCharKey: charKey,
          requestKind: 'meet',
          distance: 1
        });
        return {
          actState: placedResult.actState,
          created: { charKey, ...created },
          active: placedResult.actState.characterEncounter?.active?.[charKey] || created,
          placed: placedResult.placed,
          reason: placedResult.reason || null
        };
      }

      function enqueueEligibleCharacterEncounters(actStateInput, heroStateInput = {}, options = {}) {
        const act = normalizeActState(actStateInput);
        const encounter = normalizeCharacterEncounterState(act.characterEncounter);
        const evaluated = options.eligibility || evaluateCharacterEncounterEligibility({ ...act, characterEncounter: encounter }, heroStateInput, options.context || {});
        const limit = Math.max(1, Math.round(Number(options.limit) || 1));
        const created = [];
        evaluated.eligible.forEach((candidate) => {
          if (created.length >= limit) return;
          if (hasActiveEncounter(encounter, candidate.charKey) || hasMetEncounter(encounter, candidate.charKey)) return;
          const shouldSignal = options.disablePreSignal !== true
            && candidate.preSignalPreferred === true
            && !hasSignaledEncounter(encounter, candidate.charKey);
          const kind = shouldSignal ? 'signal' : 'meet';
          const priority = shouldSignal
            ? candidate.priority + 25
            : (hasSignaledEncounter(encounter, candidate.charKey) ? candidate.priority + 18 : candidate.priority);
          const entry = createActiveEncounterEntry(act, candidate.charKey, kind, priority);
          if (!encounter.active) encounter.active = {};
          encounter.active[candidate.charKey] = entry;
          created.push({ charKey: candidate.charKey, ...entry });
        });
        act.characterEncounter = normalizeCharacterEncounterState(encounter);
        if (options.place !== true) {
          return { actState: act, created, active: deepClone(act.characterEncounter.active || {}), evaluated };
        }
        const placedResult = placeNextCharacterEncounter(act, options.config || getChapter(act.id), options);
        return {
          actState: placedResult.actState,
          created,
          active: deepClone(placedResult.actState.characterEncounter?.active || {}),
          placed: placedResult.placed,
          reason: placedResult.reason || null,
          evaluated
        };
      }

      function consumeCharacterEncounterForNode(actStateInput, nodeIdInput, options = {}) {
        const act = normalizeActState(actStateInput);
        const encounter = normalizeCharacterEncounterState(act.characterEncounter);
        const nodeId = normalizeTrimmedString(nodeIdInput || getCurrentActNodeId(act), '');
        const phaseIndex = Number.isFinite(Number(options.phaseIndex))
          ? Math.max(0, Math.min(3, Math.round(Number(options.phaseIndex) || 0)))
          : null;
        const selected = getActiveEncounterEntries(encounter, ({ entry }) => (
          entry.state === 'placed'
          && normalizeTrimmedString(entry.node, '') === nodeId
          && (phaseIndex === null || getEntryPhase(entry) === phaseIndex)
        ))[0] || null;
        if (!selected) {
          act.characterEncounter = encounter;
          return { actState: act, consumed: null };
        }

        const currentNodeIndex = Math.max(1, Math.round(Number(act.nodeIndex) || 1));
        const phase = phaseIndex === null ? getEntryPhase(selected.entry) : phaseIndex;
        const kind = normalizeEncounterKind(selected.entry.kind);
        const rule = ENCOUNTER_RULES[selected.charKey] || {};
        const fact = normalizeEncounterFactEntry({ node: nodeId, nodeIndex: currentNodeIndex, phase });
        if (encounter.active) delete encounter.active[selected.charKey];
        if (encounter.active && !Object.keys(encounter.active).length) delete encounter.active;

        const consumed = {
          charKey: selected.charKey,
          kind,
          node: nodeId,
          nodeIndex: currentNodeIndex,
          phase
        };

        if (kind === 'signal') {
          putEncounterFact(encounter, 'signaled', selected.charKey, fact);
          act.characterEncounter = normalizeCharacterEncounterState(encounter);
          const followUp = createFollowUpMeet(act, selected.charKey, rule, options);
          return {
            actState: followUp.actState,
            consumed,
            fact,
            heroCastPatch: {},
            firstMeetHint: normalizeTrimmedString(rule.firstMeetHint, ''),
            preSignalHint: normalizeTrimmedString(rule.preSignalHint, ''),
            created: followUp.created,
            active: followUp.active,
            placed: followUp.placed,
            reason: followUp.reason || null
          };
        }

        putEncounterFact(encounter, 'met', selected.charKey, fact);
        encounter.lastMeet = currentNodeIndex;
        act.characterEncounter = normalizeCharacterEncounterState(encounter);
        const heroCastPatch = {
          [selected.charKey]: {
            activated: true,
            introduced: true,
            present: true,
            inParty: false
          }
        };
        return {
          actState: act,
          consumed,
          fact,
          heroCastPatch,
          firstMeetHint: normalizeTrimmedString(rule.firstMeetHint, ''),
          preSignalHint: ''
        };
      }

      function updateCharacterEncountersForNodeEntry(actStateInput, heroStateInput = {}, configInput = null, contextInput = {}) {
        const act = normalizeActState(actStateInput);
        const config = configInput || getChapter(act.id);
        const currentNodeId = normalizeTrimmedString(
          act.route_history[Math.max(0, Math.round(Number(act.nodeIndex) || 1) - 1)] || getCurrentActNodeId(act),
          ''
        );
        const placedResult = placeQueuedCharacterEncounterOnNode(act, currentNodeId, config);
        const workingAct = placedResult.actState || act;
        const enqueueResult = enqueueEligibleCharacterEncounters(workingAct, heroStateInput, {
          context: contextInput,
          config,
          limit: ENCOUNTER_CHARACTER_KEYS.length,
          place: false
        });
        return {
          actState: enqueueResult.actState,
          consumed: null,
          created: enqueueResult.created,
          active: deepClone(enqueueResult.actState.characterEncounter?.active || {}),
          placed: placedResult.placed,
          reason: placedResult.reason || null,
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
        if (hasMetEncounter(encounter, charKey)) {
          act.characterEncounter = encounter;
          return { actState: act, applied: false, reason: 'already_met' };
        }
        if (!hasActiveEncounter(encounter, charKey)) {
          if (!encounter.active) encounter.active = {};
          encounter.active[charKey] = createActiveEncounterEntry(act, charKey, 'meet', 999);
        }
        act.characterEncounter = normalizeCharacterEncounterState(encounter);
        const placedResult = placeNextCharacterEncounter(act, config, {
          ...options,
          distance: Math.max(1, Math.round(Number(options.distance) || 1)),
          ignoreCooldown: options.ignoreCooldown === true,
          forceCharKey: charKey,
          requestKind: 'meet'
        });
        const active = placedResult.actState.characterEncounter?.active?.[charKey] || null;
        return {
          actState: placedResult.actState,
          applied: Boolean(active),
          active,
          placed: placedResult.placed,
          reason: placedResult.reason || ''
        };
      }

      function buildEncounterMarkersForSnapshot(actStateInput) {
        const act = normalizeActState(actStateInput);
        const currentNodeIndex = Math.max(1, Math.round(Number(act.nodeIndex) || 1));
        const currentNodeId = normalizeTrimmedString(
          act.route_history[currentNodeIndex - 1] || act.route_history[act.route_history.length - 1] || '',
          ''
        );
        return getActiveEncounterEntries(act.characterEncounter, ({ entry }) => (
          normalizeTrimmedString(entry.node, '')
          || (entry.state === 'queued' && currentNodeId && Math.max(0, Math.round(Number(entry.from) || 0)) < currentNodeIndex)
        )).map(({ charKey, entry }) => {
          const targetNodeId = normalizeTrimmedString(entry.node, '');
          const targetNodeIndex = Math.max(0, Math.round(Number(entry.nodeIndex) || 0));
          const isOverdueQueuedTarget = entry.state === 'queued'
            && targetNodeId
            && targetNodeIndex > 0
            && targetNodeIndex <= currentNodeIndex
            && targetNodeId !== currentNodeId;
          const nodeId = targetNodeId && !isOverdueQueuedTarget ? targetNodeId : currentNodeId;
          return {
            charKey,
            type: encounterKindToUiType(entry.kind),
            status: 'placed',
            nodeId,
            nodeIndex: targetNodeId && !isOverdueQueuedTarget
              ? Math.max(0, Math.round(Number(entry.nodeIndex) || 0))
              : currentNodeIndex,
            phaseIndex: getEntryPhase(entry),
            label: charKey,
            encounterState: entry.state === 'placed' ? 'placed' : 'queued'
          };
        });
      }

      return {
        normalizeEncounterKind,
        normalizeCharacterEncounterState,
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
        findEncounterPlacementCandidates,
        pickEncounterTargetPhaseIndex,
        placeNextCharacterEncounter,
        placeQueuedCharacterEncounterOnNode,
        enqueueEligibleCharacterEncounters,
        consumeCharacterEncounterForNode,
        updateCharacterEncountersForNodeEntry,
        debugForceCharacterEncounter,
        buildEncounterMarkersForSnapshot
      };
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
