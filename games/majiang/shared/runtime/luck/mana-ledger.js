(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.AceMahjongLuckManaLedger = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const MANA_MODEL_VERSION = 'luck-mana-v0.4';

  const DEFAULT_MANA_POLICY = Object.freeze({
    initialMana: 1000,
    maxMana: 1000,
    rounding: 'nearest',
    precision: 0,
    fortuneBaseCost: 4,
    curseBaseCost: 4,
    focusBudget: 3,
    attentionMultipliers: Object.freeze({
      1: 0.6,
      2: 1,
      3: 1.4
    }),
    discardGain: 3,
    closedDiscardGain: 3,
    openDiscardGain: 1,
    callGain: 10,
    kanGain: 30,
    concealedKanGain: 60,
    selfDrawWinGain: 80,
    ronWinGain: 50,
    dealInPainRate: 0.015,
    hanGainTiers: Object.freeze({
      1: 10,
      2: 20,
      3: 40,
      4: 80
    }),
    manganGain: 120,
    hanemanGain: 160,
    baimanGain: 240,
    yakumanGain: 300,
    yakumanFill: false,
    riichiDeclarationCost: 60,
    riichiStickCollectMultiplier: 2,
    riichiStickCollectGain: 120,
    honbaCollectGain: 10,
    honbaPayCost: 0
  });

  const MANA_EVENT_KINDS = Object.freeze({
    SKILL_SPEND: 'skill-spend',
    DISCARD: 'discard',
    CALL: 'call',
    KAN: 'kan',
    OPEN_KAN: 'open-kan',
    CONCEALED_KAN: 'concealed-kan',
    SELF_DRAW_WIN: 'self-draw-win',
    RON_WIN: 'ron-win',
    DEAL_IN: 'deal-in',
    HULE_BONUS: 'hule-bonus',
    RIICHI_DECLARATION: 'riichi-declaration',
    RIICHI_STICK_COLLECT: 'riichi-stick-collect',
    HONBA_COLLECT: 'honba-collect',
    HONBA_PAY: 'honba-pay',
    SET: 'set',
    GENERIC: 'generic'
  });

  const DEFAULT_SEATS = Object.freeze(['bottom', 'right', 'top', 'left']);

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function numberOr(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, min, max) {
    const number = numberOr(value, min);
    return Math.max(min, Math.min(max, number));
  }

  function roundDelta(value, policy) {
    const precision = Math.max(0, Math.floor(numberOr(policy && policy.precision, 0)));
    const factor = 10 ** precision;
    const raw = numberOr(value, 0);
    if ((policy && policy.rounding) === 'floor') return Math.floor(raw * factor) / factor;
    if ((policy && policy.rounding) === 'ceil') return Math.ceil(raw * factor) / factor;
    return Math.round(raw * factor) / factor;
  }

  function toInteger(value, fallback = 0) {
    return Math.round(numberOr(value, fallback));
  }

  function normalizeManaPolicy(source = {}) {
    const policy = source && typeof source === 'object' ? source : {};
    const base = DEFAULT_MANA_POLICY;
    const rawMultipliers = policy.attentionMultipliers && typeof policy.attentionMultipliers === 'object'
      ? policy.attentionMultipliers
      : {};
    const attentionMultipliers = {
      1: Math.max(0, numberOr(rawMultipliers[1], base.attentionMultipliers[1])),
      2: Math.max(0, numberOr(rawMultipliers[2], base.attentionMultipliers[2])),
      3: Math.max(0, numberOr(rawMultipliers[3], base.attentionMultipliers[3]))
    };

    return {
      initialMana: Math.max(0, toInteger(policy.initialMana, base.initialMana)),
      maxMana: Math.max(1, toInteger(policy.maxMana, base.maxMana)),
      rounding: ['nearest', 'floor', 'ceil'].includes(policy.rounding) ? policy.rounding : base.rounding,
      precision: 0,
      fortuneBaseCost: Math.max(0, numberOr(policy.fortuneBaseCost, base.fortuneBaseCost)),
      curseBaseCost: Math.max(0, numberOr(policy.curseBaseCost, base.curseBaseCost)),
      focusBudget: Math.max(1, toInteger(policy.focusBudget, base.focusBudget)),
      attentionMultipliers,
      discardGain: numberOr(policy.discardGain, base.discardGain),
      closedDiscardGain: numberOr(policy.closedDiscardGain, policy.discardGain == null ? base.closedDiscardGain : policy.discardGain),
      openDiscardGain: numberOr(policy.openDiscardGain, base.openDiscardGain),
      callGain: numberOr(policy.callGain, base.callGain),
      kanGain: numberOr(policy.kanGain, base.kanGain),
      concealedKanGain: numberOr(policy.concealedKanGain, base.concealedKanGain),
      selfDrawWinGain: numberOr(policy.selfDrawWinGain, base.selfDrawWinGain),
      ronWinGain: numberOr(policy.ronWinGain, base.ronWinGain),
      dealInPainRate: Math.max(0, numberOr(policy.dealInPainRate, base.dealInPainRate)),
      hanGainTiers: {
        1: numberOr(policy.hanGainTiers && policy.hanGainTiers[1], base.hanGainTiers[1]),
        2: numberOr(policy.hanGainTiers && policy.hanGainTiers[2], base.hanGainTiers[2]),
        3: numberOr(policy.hanGainTiers && policy.hanGainTiers[3], base.hanGainTiers[3]),
        4: numberOr(policy.hanGainTiers && policy.hanGainTiers[4], base.hanGainTiers[4])
      },
      manganGain: numberOr(policy.manganGain, base.manganGain),
      hanemanGain: numberOr(policy.hanemanGain, base.hanemanGain),
      baimanGain: numberOr(policy.baimanGain, base.baimanGain),
      yakumanGain: numberOr(policy.yakumanGain, base.yakumanGain),
      yakumanFill: policy.yakumanFill == null ? base.yakumanFill : Boolean(policy.yakumanFill),
      riichiDeclarationCost: Math.max(0, numberOr(policy.riichiDeclarationCost, base.riichiDeclarationCost)),
      riichiStickCollectMultiplier: Math.max(0, numberOr(policy.riichiStickCollectMultiplier, base.riichiStickCollectMultiplier)),
      riichiStickCollectGain: numberOr(
        policy.riichiStickCollectGain,
        Math.max(0, numberOr(policy.riichiDeclarationCost, base.riichiDeclarationCost))
          * Math.max(0, numberOr(policy.riichiStickCollectMultiplier, base.riichiStickCollectMultiplier))
      ),
      honbaCollectGain: numberOr(policy.honbaCollectGain, base.honbaCollectGain),
      honbaPayCost: Math.max(0, numberOr(policy.honbaPayCost, base.honbaPayCost))
    };
  }

  function normalizeSeatList(activeSeats) {
    const source = Array.isArray(activeSeats) && activeSeats.length ? activeSeats : DEFAULT_SEATS;
    const seen = new Set();
    return source.reduce((result, seat) => {
      if (seat == null || seat === '') return result;
      const key = String(seat);
      if (seen.has(key)) return result;
      seen.add(key);
      result.push(key);
      return result;
    }, []);
  }

  function createSeatManaState(value, policy) {
    const source = value && typeof value === 'object' ? value : {};
    const rawMaxMana = Object.prototype.hasOwnProperty.call(source, 'maxMana')
      ? source.maxMana
      : policy.maxMana;
    const rawMana = Object.prototype.hasOwnProperty.call(source, 'mana')
      ? source.mana
      : policy.initialMana;
    const maxMana = Math.max(1, toInteger(rawMaxMana, policy.maxMana));
    const mana = clamp(toInteger(rawMana, policy.initialMana), 0, maxMana);
    return {
      mana,
      maxMana,
      manaLocked: mana <= 0,
      manaBroken: false,
      brokenReason: null,
      brokenAt: null
    };
  }

  function createInitialManaState(options = {}) {
    const policy = normalizeManaPolicy(options.policy || options.manaPolicy || options);
    const activeSeats = normalizeSeatList(options.activeSeats);
    const seatPolicy = {
      ...policy,
      initialMana: Math.max(0, toInteger(options.initialMana, policy.initialMana)),
      maxMana: Math.max(1, toInteger(options.maxMana, policy.maxMana))
    };
    const seats = activeSeats.reduce((result, seat) => {
      result[seat] = createSeatManaState(null, seatPolicy);
      return result;
    }, {});
    return {
      version: MANA_MODEL_VERSION,
      maxMana: seatPolicy.maxMana,
      seats,
      ledger: []
    };
  }

  function normalizeManaState(state = {}, policyInput = {}) {
    const policy = normalizeManaPolicy(policyInput);
    if (!state || typeof state !== 'object') {
      return createInitialManaState({ policy });
    }
    const sourceSeats = state.seats && typeof state.seats === 'object'
      ? state.seats
      : {};
    const activeSeats = normalizeSeatList(
      Object.keys(sourceSeats).length ? Object.keys(sourceSeats) : DEFAULT_SEATS
    );
    const maxMana = Math.max(1, toInteger(state.maxMana, policy.maxMana));
    const seats = activeSeats.reduce((result, seat) => {
      result[seat] = createSeatManaState(sourceSeats[seat], {
        ...policy,
        maxMana,
        initialMana: policy.initialMana
      });
      return result;
    }, {});
    const ledger = Array.isArray(state.ledger)
      ? state.ledger.map((entry) => ({
          ...clone(entry),
          before: toInteger(entry && entry.before, 0),
          delta: toInteger(entry && entry.delta, 0),
          after: toInteger(entry && entry.after, 0),
          max: toInteger(entry && entry.max, maxMana)
        }))
      : [];
    return {
      version: state.version || MANA_MODEL_VERSION,
      maxMana,
      seats,
      ledger
    };
  }

  function getSeatManaState(state = {}, seat, policyInput = {}) {
    const policy = normalizeManaPolicy(policyInput);
    const normalized = normalizeManaState(state, policy);
    const seatKey = seat || 'bottom';
    if (normalized.seats[seatKey]) return clone(normalized.seats[seatKey]);
    return createSeatManaState(null, policy);
  }

  function getAttentionCostFromForce(force = {}) {
    const metadata = force && force.metadata && typeof force.metadata === 'object' ? force.metadata : {};
    const explicit = numberOr(metadata.attentionCost, numberOr(force.attentionCost, NaN));
    if (Number.isFinite(explicit) && explicit > 0) return Math.max(1, Math.min(3, Math.round(explicit)));
    const power = numberOr(force && force.power, 0);
    if (power >= 130) return 3;
    if (power >= 90) return 2;
    if (power > 0) return 1;
    return 0;
  }

  function getFocusUsed(value, policy) {
    const focus = Math.max(0, Math.round(numberOr(value, 0)));
    if (focus <= 0) return 0;
    return Math.max(1, Math.min(policy.focusBudget, focus));
  }

  function getAttentionMultiplier(focusUsed, policy) {
    const focus = getFocusUsed(focusUsed, policy);
    if (focus <= 0) return 0;
    const key = String(Math.max(1, Math.min(3, focus)));
    return numberOr(policy.attentionMultipliers[key], 1);
  }

  function calculateSkillManaSpend(input = {}) {
    const policy = normalizeManaPolicy(input.policy || {});
    const force = input.force && typeof input.force === 'object' ? input.force : {};
    const kind = force.kind || force.type || input.kind || 'fortune';
    const attentionCost = Math.max(0, Math.min(policy.focusBudget, toInteger(
      input.attentionCost,
      getAttentionCostFromForce(force)
    )));
    const focusUsed = getFocusUsed(
      input.focusUsed == null ? attentionCost : input.focusUsed,
      policy
    );
    const baseCost = kind === 'curse'
      ? policy.curseBaseCost
      : kind === 'fortune'
        ? policy.fortuneBaseCost
        : numberOr(input.baseCost, 0);
    const multiplier = getAttentionMultiplier(focusUsed, policy);
    const rawDelta = -baseCost * attentionCost * multiplier;
    const delta = roundDelta(rawDelta, policy);
    return {
      kind,
      attentionCost,
      focusUsed,
      multiplier,
      baseCost,
      rawDelta,
      delta
    };
  }

  function detectLimitName(event = {}) {
    const source = event.limit || event.limitName || event.huleLimit || event.resultLimit;
    return source == null ? '' : String(source).toLowerCase();
  }

  function getHanValue(event = {}) {
    return Math.max(0, Math.floor(numberOr(
      event.han,
      event.fanshu == null
        ? event.fan
        : event.fanshu
    )));
  }

  function calculateHuleBonusDelta(event = {}, policyInput = {}) {
    const policy = normalizeManaPolicy(policyInput);
    const limitName = detectLimitName(event);
    if (/役满|yakuman/.test(limitName) || event.yakuman === true) {
      return {
        rawDelta: policy.yakumanGain,
        delta: roundDelta(policy.yakumanGain, policy),
        fillToMax: policy.yakumanFill,
        limit: 'yakuman'
      };
    }
    if (/三倍满|sanbaiman|倍满|baiman/.test(limitName)) {
      return { rawDelta: policy.baimanGain, delta: roundDelta(policy.baimanGain, policy), limit: 'baiman' };
    }
    if (/跳满|haneman/.test(limitName)) {
      return { rawDelta: policy.hanemanGain, delta: roundDelta(policy.hanemanGain, policy), limit: 'haneman' };
    }
    if (/满贯|mangan/.test(limitName)) {
      return { rawDelta: policy.manganGain, delta: roundDelta(policy.manganGain, policy), limit: 'mangan' };
    }
    const han = getHanValue(event);
    if (han >= 13) {
      return {
        rawDelta: policy.yakumanGain,
        delta: roundDelta(policy.yakumanGain, policy),
        fillToMax: policy.yakumanFill,
        limit: 'yakuman'
      };
    }
    if (han >= 8) return { rawDelta: policy.baimanGain, delta: roundDelta(policy.baimanGain, policy), limit: 'baiman' };
    if (han >= 6) return { rawDelta: policy.hanemanGain, delta: roundDelta(policy.hanemanGain, policy), limit: 'haneman' };
    if (han >= 5) return { rawDelta: policy.manganGain, delta: roundDelta(policy.manganGain, policy), limit: 'mangan' };
    const rawDelta = numberOr(policy.hanGainTiers[han], 0);
    return { rawDelta, delta: roundDelta(rawDelta, policy), limit: 'han-tier' };
  }

  function isOpenDiscardEvent(event = {}) {
    if (event.closed === true || event.menzen === true) return false;
    if (event.closed === false || event.open === true) return true;
    const meldCount = Number(event.meldCount == null ? event.openMeldCount : event.meldCount);
    return Number.isFinite(meldCount) && meldCount > 0;
  }

  function isConcealedKanEvent(event = {}) {
    const kanType = event.kanType == null ? '' : String(event.kanType).toLowerCase();
    return event.concealed === true
      || event.isConcealed === true
      || kanType === 'kan-concealed'
      || kanType === 'concealed'
      || kanType === 'ankan';
  }

  function resolveEventDelta(event = {}, seatState, policy) {
    const kind = event.kind || MANA_EVENT_KINDS.GENERIC;
    if (Object.prototype.hasOwnProperty.call(event, 'delta')) {
      const rawDelta = numberOr(event.rawDelta, event.delta);
      return { rawDelta, delta: roundDelta(event.delta, policy), setTo: null };
    }
    if (kind === MANA_EVENT_KINDS.SKILL_SPEND) {
      const spend = calculateSkillManaSpend({ ...event, policy });
      return { ...spend, setTo: null };
    }
    if (kind === MANA_EVENT_KINDS.DISCARD) {
      const rawDelta = isOpenDiscardEvent(event) ? policy.openDiscardGain : policy.closedDiscardGain;
      return { rawDelta, delta: roundDelta(rawDelta, policy), setTo: null };
    }
    if (kind === MANA_EVENT_KINDS.CALL) return { rawDelta: policy.callGain, delta: roundDelta(policy.callGain, policy), setTo: null };
    if (kind === MANA_EVENT_KINDS.KAN) {
      const rawDelta = isConcealedKanEvent(event) ? policy.concealedKanGain : policy.kanGain;
      return { rawDelta, delta: roundDelta(rawDelta, policy), setTo: null };
    }
    if (kind === MANA_EVENT_KINDS.OPEN_KAN) return { rawDelta: policy.kanGain, delta: roundDelta(policy.kanGain, policy), setTo: null };
    if (kind === MANA_EVENT_KINDS.CONCEALED_KAN) return { rawDelta: policy.concealedKanGain, delta: roundDelta(policy.concealedKanGain, policy), setTo: null };
    if (kind === MANA_EVENT_KINDS.SELF_DRAW_WIN) return { rawDelta: policy.selfDrawWinGain, delta: roundDelta(policy.selfDrawWinGain, policy), setTo: null };
    if (kind === MANA_EVENT_KINDS.RON_WIN) return { rawDelta: policy.ronWinGain, delta: roundDelta(policy.ronWinGain, policy), setTo: null };
    if (kind === MANA_EVENT_KINDS.DEAL_IN) {
      const pointLoss = Math.max(0, numberOr(event.pointLoss, event.lossPoints == null ? 0 : event.lossPoints));
      const rawDelta = pointLoss * policy.dealInPainRate;
      return { rawDelta, delta: roundDelta(rawDelta, policy), setTo: null };
    }
    if (kind === MANA_EVENT_KINDS.RIICHI_DECLARATION) {
      return {
        rawDelta: -policy.riichiDeclarationCost,
        delta: roundDelta(-policy.riichiDeclarationCost, policy),
        setTo: null,
        flow: {
          stake: policy.riichiDeclarationCost,
          collectMultiplier: policy.riichiStickCollectMultiplier,
          collectGain: policy.riichiStickCollectGain
        }
      };
    }
    if (kind === MANA_EVENT_KINDS.RIICHI_STICK_COLLECT) {
      const count = Math.max(0, Math.floor(numberOr(event.count, event.stickCount == null ? 1 : event.stickCount)));
      const rawDelta = policy.riichiStickCollectGain * count;
      return {
        rawDelta,
        delta: roundDelta(rawDelta, policy),
        setTo: null,
        flow: {
          stickCount: count,
          stake: policy.riichiDeclarationCost,
          collectMultiplier: policy.riichiStickCollectMultiplier,
          collectGainPerStick: policy.riichiStickCollectGain
        }
      };
    }
    if (kind === MANA_EVENT_KINDS.HONBA_COLLECT) {
      const count = Math.max(0, Math.floor(numberOr(event.count, event.honba == null ? 1 : event.honba)));
      const rawDelta = policy.honbaCollectGain * count;
      return { rawDelta, delta: roundDelta(rawDelta, policy), setTo: null };
    }
    if (kind === MANA_EVENT_KINDS.HONBA_PAY) {
      const count = Math.max(0, Math.floor(numberOr(event.count, event.honba == null ? 1 : event.honba)));
      const rawDelta = -policy.honbaPayCost * count;
      return { rawDelta, delta: roundDelta(rawDelta, policy), setTo: null };
    }
    if (kind === MANA_EVENT_KINDS.HULE_BONUS) {
      const bonus = calculateHuleBonusDelta(event, policy);
      return {
        ...bonus,
        setTo: bonus.fillToMax ? seatState.maxMana : null
      };
    }
    if (kind === MANA_EVENT_KINDS.SET) {
      const setTo = clamp(toInteger(event.value, seatState.mana), 0, seatState.maxMana);
      return { rawDelta: setTo - seatState.mana, delta: setTo - seatState.mana, setTo };
    }
    return { rawDelta: 0, delta: 0, setTo: null };
  }

  function createLedgerEntry(state, seat, seatState, event, resolvedDelta) {
    const before = toInteger(seatState.mana, 0);
    const max = Math.max(1, toInteger(seatState.maxMana, state.maxMana));
    const after = resolvedDelta.setTo != null
      ? clamp(toInteger(resolvedDelta.setTo, before), 0, max)
      : clamp(before + toInteger(resolvedDelta.delta, 0), 0, max);
    const activeSkill = Boolean(event.activeSkill || event.kind === MANA_EVENT_KINDS.SKILL_SPEND);
    const triggeredBreak = false;
    const entry = {
      id: event.id || `${MANA_MODEL_VERSION}:ledger:${(state.ledger || []).length + 1}`,
      version: MANA_MODEL_VERSION,
      kind: event.kind || MANA_EVENT_KINDS.GENERIC,
      seat,
      before,
      delta: toInteger(after - before, 0),
      after,
      max,
      activeSkill,
      triggeredBreak,
      manaLocked: after <= 0,
      reason: event.reason || null,
      metadata: event.metadata && typeof event.metadata === 'object' ? clone(event.metadata) : {}
    };
    if (Object.prototype.hasOwnProperty.call(resolvedDelta, 'rawDelta')) {
      entry.rawDelta = numberOr(resolvedDelta.rawDelta, entry.delta);
    }
    if (resolvedDelta.flow && typeof resolvedDelta.flow === 'object') {
      entry.metadata = {
        ...entry.metadata,
        flow: clone(resolvedDelta.flow)
      };
    }
    return entry;
  }

  function applyManaEvent(sourceState = {}, event = {}, policyInput = {}) {
    const policy = normalizeManaPolicy(policyInput);
    const state = normalizeManaState(sourceState, policy);
    const seat = event.seat || event.seatKey || event.actorSeat || 'bottom';
    if (!state.seats[seat]) {
      state.seats[seat] = createSeatManaState(null, policy);
    }
    const seatState = state.seats[seat];
    const resolvedDelta = resolveEventDelta(event, seatState, policy);
    const entry = createLedgerEntry(state, seat, seatState, event, resolvedDelta);
    const nextSeatState = {
      ...seatState,
      mana: entry.after,
      maxMana: entry.max,
      manaLocked: entry.after <= 0,
      manaBroken: false,
      brokenReason: null,
      brokenAt: null
    };
    state.seats[seat] = nextSeatState;
    state.ledger = Array.isArray(state.ledger) ? state.ledger.concat(entry) : [entry];
    return {
      manaState: state,
      entry
    };
  }

  function buildManaPublicSummary(entries = [], manaState = {}, seat = null) {
    const sourceEntries = Array.isArray(entries) ? entries : entries ? [entries] : [];
    const publicEntries = sourceEntries.map((entry) => ({
      kind: entry.kind,
      seat: entry.seat,
      before: toInteger(entry.before, 0),
      delta: toInteger(entry.delta, 0),
      after: toInteger(entry.after, 0),
      max: toInteger(entry.max, 1000),
      activeSkill: Boolean(entry.activeSkill),
      triggeredBreak: Boolean(entry.triggeredBreak),
      manaLocked: Boolean(entry.manaLocked),
      reason: entry.reason || null
    }));
    const targetSeat = seat || (publicEntries[0] ? publicEntries[0].seat : null);
    const seatState = targetSeat ? getSeatManaState(manaState, targetSeat) : null;
    const totalDelta = publicEntries.reduce((sum, entry) => sum + entry.delta, 0);
    return {
      manaDelta: toInteger(totalDelta, 0),
      manaAfter: seatState ? toInteger(seatState.mana, 0) : null,
      maxMana: seatState ? toInteger(seatState.maxMana, 1000) : null,
      manaLocked: Boolean(seatState && seatState.manaLocked),
      manaBroken: false,
      entries: publicEntries
    };
  }

  return {
    MANA_MODEL_VERSION,
    DEFAULT_MANA_POLICY,
    MANA_EVENT_KINDS,
    normalizeManaPolicy,
    createInitialManaState,
    normalizeManaState,
    getSeatManaState,
    getAttentionCostFromForce,
    calculateSkillManaSpend,
    calculateHuleBonusDelta,
    applyManaEvent,
    buildManaPublicSummary
  };
});
