(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./constants'),
      require('./schemas'),
      require('./force-rank')
    );
    return;
  }
  root.AceMahjongLuckForceResolution = factory(
    root.AceMahjongLuckConstants,
    root.AceMahjongLuckSchemas,
    root.AceMahjongLuckForceRank
  );
})(typeof globalThis !== 'undefined' ? globalThis : this, function(constants, schemas, forceRankApi) {
  'use strict';

  const { FORCE_KINDS } = constants;
  const { clamp, normalizeLuckForce, normalizePolicy, numberOr } = schemas;
  const { buildForceCompareKey, compareForceRank } = forceRankApi;

  function forceIsDisabled(rawForce, normalizedForce) {
    const raw = rawForce && typeof rawForce === 'object' ? rawForce : {};
    const metadata = normalizedForce.metadata || {};
    return raw.disabled === true
      || raw.enabled === false
      || metadata.disabled === true
      || metadata.enabled === false
      || normalizedForce.power <= 0;
  }

  function scaleForcePower(force, policy) {
    return clamp(numberOr(force.power, 0) / policy.forcePowerScale, 0, 4);
  }

  function normalizeForceList(activeForces) {
    return Array.isArray(activeForces) ? activeForces : [];
  }

  function forceAppliesToContext(force, context = {}) {
    const targetSeat = force && force.targetSeat != null ? String(force.targetSeat) : '';
    if (!targetSeat || targetSeat === '*' || targetSeat === 'all') return true;

    const seat = context && context.seat != null ? String(context.seat) : '';
    return Boolean(seat && targetSeat === seat);
  }

  function getStackFactor(index, policy) {
    if (index === 0) return 1;
    if (index === 1) return policy.forceStackSecondFactor;
    if (index === 2) return policy.forceStackThirdFactor;
    return policy.forceStackRestFactor;
  }

  function buildForceEntries(forces, policy) {
    return forces
      .map((force) => ({
        force,
        compareKey: buildForceCompareKey(force),
        strength: scaleForcePower(force, policy)
      }))
      .sort((left, right) => compareForceRank(right.compareKey, left.compareKey));
  }

  function stackForceEntries(entries, policy) {
    return entries.reduce((sum, entry, index) => {
      return sum + entry.strength * getStackFactor(index, policy);
    }, 0);
  }

  function getTopTier(entries) {
    return entries.length > 0 ? numberOr(entries[0].compareKey.tier, 0) : 0;
  }

  function resolveFortuneCurseContest(fortuneEntries, curseEntries, policy) {
    const fortunePool = stackForceEntries(fortuneEntries, policy);
    const cursePool = stackForceEntries(curseEntries, policy);
    const fortuneTopTier = getTopTier(fortuneEntries);
    const curseTopTier = getTopTier(curseEntries);

    if (fortunePool <= 0 || cursePool <= 0) {
      const dominantKind = fortunePool > 0
        ? FORCE_KINDS.FORTUNE
        : cursePool > 0
          ? FORCE_KINDS.CURSE
          : 'none';
      return {
        fortuneBias: fortunePool,
        curseBias: cursePool,
        dominantKind,
        contested: false,
        fortunePool,
        cursePool,
        fortuneTopTier,
        curseTopTier,
        curseAdvantageApplied: false,
        fortuneMitigation: 0,
        cursePressure: 0
      };
    }

    const tierDelta = clamp(curseTopTier - fortuneTopTier, -4, 4);
    const fortuneMitigation = clamp(
      policy.fortuneMitigationAgainstCurse - tierDelta * policy.tierCounterStep,
      0.2,
      0.95
    );
    const cursePressure = Math.max(
      0.2,
      policy.cursePressureAgainstFortune + tierDelta * policy.tierPressureStep
    );
    const fortuneCandidate = Math.max(0, fortunePool - cursePool * cursePressure);
    const curseCandidate = Math.max(0, cursePool - fortunePool * fortuneMitigation);
    const curseWinsTie = curseCandidate >= fortuneCandidate;
    const fortuneBias = curseWinsTie ? 0 : fortuneCandidate;
    const curseBias = curseWinsTie ? curseCandidate : 0;

    return {
      fortuneBias,
      curseBias,
      dominantKind: curseWinsTie ? FORCE_KINDS.CURSE : FORCE_KINDS.FORTUNE,
      contested: true,
      fortunePool,
      cursePool,
      fortuneTopTier,
      curseTopTier,
      curseAdvantageApplied: curseTopTier >= fortuneTopTier,
      fortuneMitigation,
      cursePressure
    };
  }

  function resolveForces(activeForces, context = {}) {
    const contextForces = context && Array.isArray(context.activeForces) ? context.activeForces : [];
    const rawForces = normalizeForceList(activeForces || contextForces);
    const policy = normalizePolicy((context && context.policy) || {});
    const active = [];
    const disabled = [];
    const ignored = [];

    rawForces.forEach((rawForce) => {
      const normalized = normalizeLuckForce(rawForce);
      if (forceIsDisabled(rawForce, normalized)) {
        disabled.push(normalized);
        return;
      }
      if (!forceAppliesToContext(normalized, context)) {
        ignored.push(normalized);
        return;
      }
      active.push(normalized);
    });

    const forceEntries = buildForceEntries(active, policy);
    const compareOrder = forceEntries.map((entry) => ({
      id: entry.force.id,
      kind: entry.force.kind,
      compareKey: entry.compareKey,
      strength: entry.strength
    }));

    const fortuneEntries = forceEntries.filter((entry) => entry.force.kind === FORCE_KINDS.FORTUNE);
    const curseEntries = forceEntries.filter((entry) => entry.force.kind === FORCE_KINDS.CURSE);
    const voidEntries = forceEntries.filter((entry) => entry.force.kind === FORCE_KINDS.VOID);

    const contest = resolveFortuneCurseContest(fortuneEntries, curseEntries, policy);
    const rawFortuneBias = contest.fortunePool;
    const rawCurseBias = contest.cursePool;
    const rawVoidDamping = stackForceEntries(voidEntries, policy);

    const voidDamping = clamp(rawVoidDamping, 0, policy.maxVoidDamping);
    const dampingFactor = 1 - voidDamping;
    const fortuneBiasBeforeVoid = contest.fortuneBias;
    const curseBiasBeforeVoid = contest.curseBias;
    const fortuneBias = fortuneBiasBeforeVoid * dampingFactor;
    const curseBias = curseBiasBeforeVoid * dampingFactor;

    return {
      fortuneBias,
      curseBias,
      rawFortuneBias,
      rawCurseBias,
      fortuneBiasBeforeVoid,
      curseBiasBeforeVoid,
      voidDamping,
      activeForces: active,
      disabledForces: disabled,
      ignoredForces: ignored,
      compareOrder,
      contest,
      dominantKind: fortuneBias > 0
        ? FORCE_KINDS.FORTUNE
        : curseBias > 0
          ? FORCE_KINDS.CURSE
          : voidDamping > 0
            ? FORCE_KINDS.VOID
            : 'none',
      contested: contest.contested,
      sourceCount: active.length
    };
  }

  return {
    resolveForces
  };
});
