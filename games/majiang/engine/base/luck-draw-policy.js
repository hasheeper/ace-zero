(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('../../shared/runtime/luck'),
      require('./luck-intent-evaluator')
    );
    return;
  }

  root.AceMahjongLuckDrawPolicy = factory(
    root.AceMahjongLuck,
    root.AceMahjongLuckIntentEvaluator
  );
})(typeof globalThis !== 'undefined' ? globalThis : this, function(luck, luckIntentEvaluatorApi) {
  'use strict';

  if (!luck) {
    throw new Error('AceMahjongLuckDrawPolicy requires shared runtime luck helpers.');
  }

  function clone(value) {
    if (value == null) return value;
    return JSON.parse(JSON.stringify(value));
  }

  function resolveSeatValue(source, seat, fallback = null) {
    if (!source || typeof source !== 'object') return fallback;
    if (seat && Object.prototype.hasOwnProperty.call(source, seat)) return source[seat];
    return fallback;
  }

  function resolveSeatArray(source, seat, fallback = []) {
    const seatValue = resolveSeatValue(source, seat, null);
    if (Array.isArray(seatValue)) return seatValue.slice();
    return Array.isArray(fallback) ? fallback.slice() : [];
  }

  function resolveSeatObject(source, seat, fallback = {}) {
    const seatValue = resolveSeatValue(source, seat, null);
    if (seatValue && typeof seatValue === 'object' && !Array.isArray(seatValue)) return { ...seatValue };
    return fallback && typeof fallback === 'object' && !Array.isArray(fallback) ? { ...fallback } : {};
  }

  function hasSeatObject(source, seat) {
    return Boolean(
      source
      && typeof source === 'object'
      && seat
      && Object.prototype.hasOwnProperty.call(source, seat)
      && source[seat]
      && typeof source[seat] === 'object'
      && !Array.isArray(source[seat])
    );
  }

  function getSeatFromPayload(payload = {}) {
    return payload.seat || payload.seatKey || payload.actorSeat || null;
  }

  function getLiveWallFromPayload(payload = {}) {
    const wallState = payload && payload.wallState && typeof payload.wallState === 'object'
      ? payload.wallState
      : {};
    return Array.isArray(wallState.liveWall) ? wallState.liveWall.slice() : null;
  }

  function getActualTileCode(normalizedTileCode, liveWall) {
    if (!normalizedTileCode || !Array.isArray(liveWall)) return null;
    for (let index = liveWall.length - 1; index >= 0; index -= 1) {
      const tileCode = liveWall[index];
      if (luck.normalizeTileCode(tileCode) === normalizedTileCode) return tileCode;
    }
    return null;
  }

  function hasEffectiveLuckBias(resolvedForces) {
    return Boolean(
      resolvedForces
      && (
        Number(resolvedForces.fortuneBias || 0) > 0
        || Number(resolvedForces.curseBias || 0) > 0
      )
    );
  }

  function createAuditId(policyId, drawIndex) {
    return `${policyId}:audit:${drawIndex}`;
  }

  function uniqueStrings(values) {
    const seen = new Set();
    return (Array.isArray(values) ? values : []).reduce((result, value) => {
      if (value == null || value === '') return result;
      const key = String(value);
      if (seen.has(key)) return result;
      seen.add(key);
      result.push(key);
      return result;
    }, []);
  }

  function bucketLuckIntensity(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return 0;
    if (number <= 0.75) return 1;
    if (number <= 1.25) return 2;
    return 3;
  }

  function getForceSourceSeat(force, fallbackSeat = null) {
    return force && force.sourceSeat ? force.sourceSeat : fallbackSeat;
  }

  function isSpendableForceKind(kind) {
    return kind === luck.FORCE_KINDS.FORTUNE || kind === luck.FORCE_KINDS.CURSE;
  }

  function buildPublicLuckSummary(audit = {}, resolvedForces = null, context = {}) {
    const resolved = resolvedForces || audit.resolvedForces || {};
    const activeForces = Array.isArray(resolved.activeForces)
      ? resolved.activeForces
      : Array.isArray(audit.activeForces)
        ? audit.activeForces
        : [];
    const dominantKind = typeof resolved.dominantKind === 'string' ? resolved.dominantKind : 'none';
    const contested = Boolean(resolved.contested);
    const hasVoidDamping = Number(resolved.voidDamping || 0) > 0;
    const fallbackReason = audit.fallback && audit.fallback.reason
      ? String(audit.fallback.reason)
      : null;
    const rawForceLevel = Math.max(
      Number(resolved.rawFortuneBias || 0),
      Number(resolved.rawCurseBias || 0),
      Number(resolved.voidDamping || 0),
      Number(resolved.fortuneBias || 0),
      Number(resolved.curseBias || 0)
    );
    const outcome = fallbackReason
      ? 'fallback'
      : contested
        ? 'contested'
        : dominantKind === luck.FORCE_KINDS.FORTUNE
          ? 'fortune'
          : dominantKind === luck.FORCE_KINDS.CURSE
            ? 'curse'
            : dominantKind === luck.FORCE_KINDS.VOID
              ? 'void'
              : 'silent';
    const sourceSeats = uniqueStrings(activeForces.map((force) => force.sourceSeat));
    const forceTargetSeats = uniqueStrings(activeForces.map((force) => force.targetSeat));
    const contextSeat = context && context.seat ? context.seat : audit.seat;
    const targetSeat = contextSeat || (forceTargetSeats.length === 1 ? forceTargetSeats[0] : null);

    return {
      auditId: audit.auditId || null,
      seat: audit.seat || contextSeat || null,
      drawKind: audit.drawKind || (context && context.drawKind) || luck.DRAW_KINDS.NORMAL,
      outcome,
      dominantKind,
      contested,
      sourceCount: Number.isFinite(Number(resolved.sourceCount))
        ? Math.max(0, Math.floor(Number(resolved.sourceCount)))
        : activeForces.length,
      intensity: bucketLuckIntensity(rawForceLevel),
      hasVoidDamping,
      fallbackReason,
      targetSeat,
      sourceSeats,
      targetSeats: forceTargetSeats
    };
  }

  function buildPublicLuckSummaryWithMana(audit = {}, resolvedForces = null, context = {}, manaSummary = null) {
    const summary = buildPublicLuckSummary(audit, resolvedForces, context);
    if (!manaSummary || typeof manaSummary !== 'object') return summary;
    return {
      ...summary,
      manaDelta: Number.isFinite(Number(manaSummary.manaDelta)) ? Math.round(Number(manaSummary.manaDelta)) : 0,
      manaAfter: manaSummary.manaAfter == null ? null : Math.round(Number(manaSummary.manaAfter) || 0),
      maxMana: manaSummary.maxMana == null ? null : Math.round(Number(manaSummary.maxMana) || 0),
      manaLocked: Boolean(manaSummary.manaLocked),
      manaBroken: false,
      manaEntries: Array.isArray(manaSummary.entries)
        ? manaSummary.entries.map((entry) => ({
            kind: entry.kind,
            seat: entry.seat,
            delta: Math.round(Number(entry.delta) || 0),
            after: Math.round(Number(entry.after) || 0),
            max: Math.round(Number(entry.max) || 0),
            activeSkill: Boolean(entry.activeSkill),
            triggeredBreak: false,
            manaLocked: Boolean(entry.manaLocked)
          }))
        : []
    };
  }

  function normalizeSeatObjectMap(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? clone(value)
      : {};
  }

  function normalizeSeatArrayMap(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? clone(value)
      : {};
  }

  function createLuckDrawPolicy(options = {}) {
    options = {
      ...options,
      objectiveIntentBySeat: normalizeSeatObjectMap(options.objectiveIntentBySeat),
      windStateBySeat: normalizeSeatObjectMap(options.windStateBySeat),
      policyBySeat: normalizeSeatObjectMap(options.policyBySeat),
      candidateLocalValuesBySeat: normalizeSeatObjectMap(options.candidateLocalValuesBySeat),
      activeForcesBySeat: normalizeSeatArrayMap(options.activeForcesBySeat),
      forceStateBySeat: normalizeSeatObjectMap(options.forceStateBySeat),
      activeForces: Array.isArray(options.activeForces) ? options.activeForces.slice() : options.activeForces
    };
    const policyId = options.id || 'luck-draw-policy';
    const policyName = options.name || 'Luck Draw Policy';
    const inactiveBehavior = options.inactiveBehavior || 'pass-through';
    const auditLimit = Math.max(0, Number(options.auditLimit == null ? 200 : options.auditLimit) || 0);
    const baseSeed = options.seed == null ? policyId : options.seed;
    const auditLog = [];
    let drawIndex = 0;
    const manaPolicy = luck.normalizeManaPolicy(options.manaPolicy || {});
    const manaLedgerLimit = Math.max(0, Number(options.manaLedgerLimit == null ? Math.max(400, auditLimit * 4) : options.manaLedgerLimit) || 0);
    let manaState = luck.normalizeManaState(
      options.manaState || luck.createInitialManaState({
        activeSeats: Array.isArray(options.activeSeats) ? options.activeSeats : ['bottom', 'right', 'top', 'left'],
        policy: manaPolicy
      }),
      manaPolicy
    );

    function pushAudit(audit) {
      if (!auditLimit) return audit;
      auditLog.push(clone(audit));
      if (auditLog.length > auditLimit) {
        auditLog.splice(0, auditLog.length - auditLimit);
      }
      return audit;
    }

    function trimManaLedger() {
      if (!manaLedgerLimit || !manaState || !Array.isArray(manaState.ledger)) return;
      if (manaState.ledger.length <= manaLedgerLimit) return;
      manaState.ledger = manaState.ledger.slice(-manaLedgerLimit);
    }

    function getSourceManaState(sourceSeat) {
      if (!sourceSeat) return null;
      return luck.getSeatManaState(manaState, sourceSeat, manaPolicy);
    }

    function sourceCanUseMana(sourceSeat) {
      if (!sourceSeat) return true;
      const seatMana = getSourceManaState(sourceSeat);
      if (!seatMana) return true;
      return seatMana.mana > 0 && seatMana.manaLocked !== true;
    }

    function getForceManaBlockReason(force, fallbackSeat = null) {
      const sourceSeat = getForceSourceSeat(force, fallbackSeat);
      if (!sourceSeat) return null;
      const seatMana = getSourceManaState(sourceSeat);
      if (!seatMana) return null;
      if (seatMana.mana <= 0 || seatMana.manaLocked) return 'source-mana-empty';
      return null;
    }

    function enrichForceFocusMetadata(force, focusState = null) {
      const normalized = luck.normalizeLuckForce(force);
      const metadata = {
        ...(normalized.metadata || {})
      };
      if (focusState && typeof focusState === 'object') {
        if (Number.isFinite(Number(focusState.used))) metadata.focusUsed = Math.max(0, Math.round(Number(focusState.used)));
        if (Number.isFinite(Number(focusState.budget))) metadata.focusBudget = Math.max(0, Math.round(Number(focusState.budget)));
      }
      return {
        ...normalized,
        metadata
      };
    }

    function filterForcesByMana(activeForces, fallbackSeat = null) {
      const forces = Array.isArray(activeForces) ? activeForces : [];
      const allowed = [];
      const ignored = [];
      forces.forEach((force) => {
        const normalized = luck.normalizeLuckForce(force);
        const reason = getForceManaBlockReason(normalized, fallbackSeat);
        if (reason) {
          ignored.push({
            ...normalized,
            manaIgnoredReason: reason
          });
          return;
        }
        allowed.push(normalized);
      });
      return {
        activeForces: allowed,
        manaIgnoredForces: ignored
      };
    }

    function getSourceFocusUsed(sourceSeat, allForces) {
      const matching = (Array.isArray(allForces) ? allForces : []).filter((force) => {
        if (!force || !isSpendableForceKind(force.kind || force.type)) return false;
        return getForceSourceSeat(force, null) === sourceSeat;
      });
      const explicit = matching.reduce((max, force) => {
        const metadata = force.metadata && typeof force.metadata === 'object' ? force.metadata : {};
        const value = metadata.focusUsed == null ? null : Number(metadata.focusUsed);
        return Number.isFinite(value) ? Math.max(max, Math.round(value)) : max;
      }, 0);
      if (explicit > 0) return Math.max(1, Math.min(manaPolicy.focusBudget, explicit));
      const total = matching.reduce((sum, force) => sum + luck.getAttentionCostFromForce(force), 0);
      return Math.max(0, Math.min(manaPolicy.focusBudget, total));
    }

    function applySkillSpendForForces(resolvedActiveForces, allContextForces, auditId) {
      const entries = [];
      const spendableForces = (Array.isArray(resolvedActiveForces) ? resolvedActiveForces : [])
        .filter((force) => isSpendableForceKind(force.kind || force.type));
      spendableForces.forEach((force) => {
        const sourceSeat = getForceSourceSeat(force, null);
        if (!sourceSeat || !sourceCanUseMana(sourceSeat)) return;
        const focusUsed = getSourceFocusUsed(sourceSeat, allContextForces);
        const spend = luck.calculateSkillManaSpend({
          force,
          focusUsed,
          policy: manaPolicy
        });
        if (!spend.delta) return;
        const result = luck.applyManaEvent(manaState, {
          kind: luck.MANA_EVENT_KINDS.SKILL_SPEND,
          seat: sourceSeat,
          force,
          focusUsed,
          activeSkill: true,
          reason: force.kind === luck.FORCE_KINDS.CURSE ? 'curse-draw-bias' : 'fortune-draw-bias',
          metadata: {
            auditId,
            forceId: force.id,
            forceKind: force.kind,
            targetSeat: force.targetSeat || null,
            attentionCost: spend.attentionCost,
            focusUsed: spend.focusUsed,
            multiplier: spend.multiplier
          }
        }, manaPolicy);
        manaState = result.manaState;
        trimManaLedger();
        entries.push(result.entry);
      });
      return entries;
    }

    function normalizeRuntimeWindState(windState = {}) {
      const source = windState && typeof windState === 'object' ? windState : {};
      const systemMode = source.systemMode === 'off'
        ? 'off'
        : source.systemMode === 'on'
          ? 'on'
          : source.systemMode === 'auto'
            ? 'auto'
            : source.enabled === false
              ? 'off'
              : source.mode === luck.WIND_MODES.AUTO
                ? 'auto'
                : 'on';
      const mode = systemMode === 'auto' || systemMode === 'off'
        ? luck.WIND_MODES.AUTO
        : source.mode;
      const intensity = ['light', 'medium', 'strong'].includes(source.intensity)
        ? source.intensity
        : 'medium';
      return {
        ...clone(source),
        enabled: systemMode !== 'off',
        systemMode,
        mode,
        intensity
      };
    }

    function setLuckWindState(seat, windState = {}) {
      if (!seat) return null;
      const normalized = normalizeRuntimeWindState(windState);
      options.windStateBySeat[seat] = normalized;
      return clone(normalized);
    }

    function normalizeRuntimeForceState(seat, forceState = {}) {
      const source = forceState && typeof forceState === 'object' ? forceState : {};
      const systemMode = source.systemMode === 'off'
        ? 'off'
        : source.systemMode === 'auto'
          ? 'auto'
          : source.enabled === false
            ? 'off'
            : 'on';
      const rawForces = Array.isArray(source.activeForces)
        ? source.activeForces
        : Array.isArray(source.forces)
          ? source.forces
          : source.force && typeof source.force === 'object'
            ? [source.force]
            : [];
      const activeForces = systemMode === 'off'
        ? []
        : rawForces.map((force) => enrichForceFocusMetadata({
            ...force,
            sourceSeat: force.sourceSeat || seat || null
          }, source.focus || null));
      return {
        ...clone(source),
        seat: seat || source.seat || null,
        enabled: systemMode !== 'off',
        systemMode,
        activeForces
      };
    }

    function setLuckForceState(seat, forceState = {}) {
      if (!seat) return null;
      const normalized = normalizeRuntimeForceState(seat, forceState);
      options.forceStateBySeat[seat] = normalized;
      return clone(normalized);
    }

    function collectRuntimeActiveForces() {
      return Object.values(options.forceStateBySeat || {}).reduce((forces, forceState) => {
        const normalized = normalizeRuntimeForceState(forceState && forceState.seat, forceState);
        if (!normalized.enabled) return forces;
        return forces.concat(normalized.activeForces || []);
      }, []);
    }

    function buildPolicyContext(payload, auditSeed, autoEvaluation = null) {
      const seat = getSeatFromPayload(payload);
      const hasExplicitObjectiveIntent = hasSeatObject(options.objectiveIntentBySeat, seat)
        || Boolean(payload.objectiveIntent && typeof payload.objectiveIntent === 'object')
        || Boolean(options.objectiveIntent && typeof options.objectiveIntent === 'object');
      const objectiveIntent = hasExplicitObjectiveIntent
        ? resolveSeatObject(
            options.objectiveIntentBySeat,
            seat,
            payload.objectiveIntent || options.objectiveIntent || {}
          )
        : (autoEvaluation && autoEvaluation.objectiveIntent ? autoEvaluation.objectiveIntent : {});
      const windState = resolveSeatObject(
        options.windStateBySeat,
        seat,
        payload.windState || options.windState || {}
      );
      const commitRouteSelection = autoEvaluation
        && autoEvaluation.diagnostics
        && autoEvaluation.diagnostics.commitRouteSelection
        && typeof autoEvaluation.diagnostics.commitRouteSelection === 'object'
          ? autoEvaluation.diagnostics.commitRouteSelection
          : null;
      const enrichedWindState = {
        ...windState
      };
      if (commitRouteSelection) {
        enrichedWindState.commitRouteId = enrichedWindState.commitRouteId
          || commitRouteSelection.requestedRouteId
          || 'auto';
        enrichedWindState.routeConfidence = commitRouteSelection.routeConfidence;
        enrichedWindState.selectedCommitRouteId = commitRouteSelection.selectedRouteId;
        if (commitRouteSelection.blockedReason) {
          enrichedWindState.commitRouteBlockedReason = commitRouteSelection.blockedReason;
        }
      }
      const policy = resolveSeatObject(
        options.policyBySeat,
        seat,
        payload.policy || options.policy || {}
      );
      const explicitCandidateLocalValues = resolveSeatObject(
        options.candidateLocalValuesBySeat,
        seat,
        payload.candidateLocalValues || options.candidateLocalValues || {}
      );
      const candidateLocalValues = {
        ...(autoEvaluation && autoEvaluation.candidateLocalValues ? autoEvaluation.candidateLocalValues : {}),
        ...explicitCandidateLocalValues
      };
      const rawActiveForces = resolveSeatArray(
        options.activeForcesBySeat,
        seat,
        Array.isArray(payload.activeForces) ? payload.activeForces : options.activeForces
      ).concat(collectRuntimeActiveForces());
      const manaFiltered = filterForcesByMana(rawActiveForces, seat);

      return {
        seat,
        drawKind: luck.DRAW_KINDS.NORMAL,
        wallState: payload.wallState || null,
        windState: enrichedWindState,
        objectiveIntent,
        activeForces: manaFiltered.activeForces,
        rawActiveForces,
        manaIgnoredForces: manaFiltered.manaIgnoredForces,
        policy,
        seed: auditSeed,
        candidateLocalValues,
        autoEvaluation: autoEvaluation ? clone(autoEvaluation.diagnostics || null) : null,
        pressure: payload.pressure
      };
    }

    function recordFallback(payload, auditSeed, fallback, partial = {}) {
      const context = buildPolicyContext(payload || {}, auditSeed);
      const auditId = createAuditId(policyId, drawIndex);
      const audit = {
        auditId,
        ...luck.createLuckAudit({
          context,
          seed: auditSeed,
          objectiveIntent: partial.objectiveIntent || context.objectiveIntent,
          windState: partial.windState || context.windState,
          compositeIntent: partial.compositeIntent || context.objectiveIntent,
          activeForces: partial.activeForces || context.activeForces,
          resolvedForces: partial.resolvedForces || null,
          candidates: partial.candidates || []
        }, {
          selectedTileCode: null,
          randomRoll: null,
          fallback
        })
      };
      pushAudit(audit);
      return audit;
    }

    function chooseDraw(payload = {}) {
      drawIndex += 1;
      const auditSeed = `${baseSeed}:${drawIndex}`;
      const liveWall = getLiveWallFromPayload(payload);
      if (!Array.isArray(liveWall)) {
        recordFallback(payload, auditSeed, { reason: 'missing-backend-live-wall' });
        return null;
      }
      if (!liveWall.length) {
        recordFallback(payload, auditSeed, { reason: 'empty-live-wall' });
        return null;
      }

      const tileCounts = luck.buildTileCountsFromWall({ liveWall });
      const candidateTileCodes = luck.tileCountsToCandidates(tileCounts).map((entry) => entry.tileCode);
      const autoEvaluation = options.autoEvaluate === false
        || !luckIntentEvaluatorApi
        || typeof luckIntentEvaluatorApi.buildLuckRuntimeEvaluation !== 'function'
          ? null
          : luckIntentEvaluatorApi.buildLuckRuntimeEvaluation({
              payload,
              candidateTileCodes,
              options
            });
      const context = buildPolicyContext(payload, auditSeed, autoEvaluation);
      const candidates = luck.buildCandidateDraws({ tileCounts, context });
      const objectiveIntent = luck.buildObjectiveIntent(context);
      const compositeIntent = luck.applyWindAdjustment(objectiveIntent, context.windState, context);
      const resolvedForces = {
        ...luck.resolveForces(context.activeForces, context),
        manaIgnoredForces: Array.isArray(context.manaIgnoredForces) ? context.manaIgnoredForces : []
      };
      const weightedCandidates = luck.scoreCandidateDraws(
        candidates,
        compositeIntent,
        resolvedForces,
        context.policy
      );

      if (!weightedCandidates.length) {
        recordFallback(payload, auditSeed, { reason: 'no-candidates' }, {
          objectiveIntent,
          windState: context.windState,
          compositeIntent,
          activeForces: resolvedForces.activeForces,
          resolvedForces,
          candidates: weightedCandidates
        });
        return null;
      }

      if (!hasEffectiveLuckBias(resolvedForces) && inactiveBehavior === 'pass-through') {
        recordFallback(payload, auditSeed, { reason: 'no-effective-luck-force' }, {
          objectiveIntent,
          windState: context.windState,
          compositeIntent,
          activeForces: resolvedForces.activeForces,
          resolvedForces,
          candidates: weightedCandidates
        });
        return null;
      }

      const sample = luck.sampleWeightedDraw(weightedCandidates, luck.createSeededRng(auditSeed));
      const actualTileCode = getActualTileCode(sample.selectedTileCode, liveWall);
      const fallback = sample.fallback || (!actualTileCode ? { reason: 'selected-tile-missing-from-live-wall' } : null);
      const auditId = createAuditId(policyId, drawIndex);
      let audit = {
        auditId,
        ...luck.createLuckAudit({
          context,
          seed: auditSeed,
          objectiveIntent,
          windState: context.windState,
          compositeIntent,
          activeForces: resolvedForces.activeForces,
          resolvedForces,
          candidates: weightedCandidates
        }, {
          ...sample,
          selectedTileCode: actualTileCode,
          fallback
        })
      };

      if (fallback || !actualTileCode) {
        pushAudit(audit);
        return null;
      }

      const manaEntries = applySkillSpendForForces(
        resolvedForces.activeForces,
        context.rawActiveForces || context.activeForces,
        auditId
      );
      const sourceSeat = manaEntries[0] ? manaEntries[0].seat : (context.seat || null);
      const manaSummary = luck.buildManaPublicSummary(manaEntries, manaState, sourceSeat);
      audit = {
        ...audit,
        manaEntries: clone(manaEntries),
        manaSummary: clone(manaSummary)
      };
      pushAudit(audit);

      return {
        tileCode: actualTileCode,
        source: `policy:${policyId}`,
        meta: {
          luckAuditId: audit.auditId,
          luckSeed: audit.seed,
          randomRoll: audit.randomRoll,
          selectedTileCode: audit.selectedTileCode,
          normalizedSelectedTileCode: sample.selectedTileCode,
          autoEvaluation: context.autoEvaluation,
          luckPublicSummary: buildPublicLuckSummaryWithMana(audit, resolvedForces, context, manaSummary),
          luckManaSummary: manaSummary,
          summary: luck.formatLuckDistributionSummary(audit)
        }
      };
    }

    function setLuckManaState(seat, nextState = null) {
      if (seat && typeof seat === 'object' && nextState == null) {
        manaState = luck.normalizeManaState(seat, manaPolicy);
        trimManaLedger();
        return clone(manaState);
      }
      if (!seat) return clone(manaState);
      if (nextState && typeof nextState === 'object' && nextState.seats) {
        manaState = luck.normalizeManaState(nextState, manaPolicy);
        trimManaLedger();
        return clone(manaState);
      }
      const normalized = luck.normalizeManaState(manaState, manaPolicy);
      const patch = nextState && typeof nextState === 'object' ? nextState : {};
      normalized.seats[seat] = {
        ...luck.getSeatManaState(normalized, seat, manaPolicy),
        ...clone(patch)
      };
      manaState = luck.normalizeManaState(normalized, manaPolicy);
      trimManaLedger();
      return clone(manaState.seats[seat]);
    }

    function getLuckManaState() {
      return clone(manaState);
    }

    function applyLuckManaEvent(event = {}) {
      const result = luck.applyManaEvent(manaState, event, manaPolicy);
      manaState = result.manaState;
      trimManaLedger();
      return {
        entry: clone(result.entry),
        manaState: clone(manaState),
        summary: luck.buildManaPublicSummary([result.entry], manaState, result.entry.seat)
      };
    }

    return {
      id: policyId,
      name: policyName,
      chooseDraw,
      chooseGangDraw() {
        return null;
      },
      chooseInitialHands() {
        return null;
      },
      getAuditLog() {
        return clone(auditLog);
      },
      clearAuditLog() {
        auditLog.splice(0, auditLog.length);
      },
      setLuckWindState,
      setLuckForceState,
      setLuckManaState,
      getLuckManaState,
      applyLuckManaEvent,
      getLuckDebugState() {
        return {
          id: policyId,
          name: policyName,
          inactiveBehavior,
          windStateBySeat: clone(options.windStateBySeat),
          forceStateBySeat: clone(options.forceStateBySeat),
          manaState: clone(manaState),
          auditCount: auditLog.length,
          lastAudit: auditLog.length ? clone(auditLog[auditLog.length - 1]) : null
        };
      },
      getDebugState() {
        return {
          id: policyId,
          name: policyName,
          inactiveBehavior,
          windStateBySeat: clone(options.windStateBySeat),
          forceStateBySeat: clone(options.forceStateBySeat),
          manaState: clone(manaState),
          auditCount: auditLog.length,
          lastAudit: auditLog.length ? clone(auditLog[auditLog.length - 1]) : null
        };
      }
    };
  }

  return {
    createLuckDrawPolicy,
    buildPublicLuckSummary,
    buildPublicLuckSummaryWithMana
  };
});
