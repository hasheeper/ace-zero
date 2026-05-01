import {
  ASSET_META,
  DIRECTIONAL_PRODUCT_META,
  PHASES,
  chance,
  clamp,
  comparePhasePoint,
  cryptoRandomId,
  getDirectionalProductMeta,
  getEconomyTier,
  getNextPhase,
  getPhaseName,
  getPrevPhase,
  rand,
} from "./config.js";
import { logMarketEvent } from "./logger.js";

const HISTORY_LIMIT = 192;
const SEED_HISTORY_COUNT = 96;
const CREDIT_KIND_MAP = {
  liquid: "liquid",
  sanctuary: "sanctuary",
  badDebtStreet: "debt",
};
const BET_STRIKE_PRESETS = {
  tight: {
    thresholdMultiplier: 0.8,
    premiumMultiplier: 0.9,
    payoutMultiplier: 2.4,
    label: "近阈值",
  },
  standard: {
    thresholdMultiplier: 1,
    premiumMultiplier: 1,
    payoutMultiplier: 3,
    label: "标准",
  },
  wide: {
    thresholdMultiplier: 1.25,
    premiumMultiplier: 1.18,
    payoutMultiplier: 3.6,
    label: "远阈值",
  },
};

export function createAssetState(id, price, holdings, avgCost) {
  const meta = ASSET_META[id];
  const boardState = createBoardState(id);
  const asset = {
    id,
    name: meta.name,
    code: meta.code,
    unit: meta.unit,
    basePrice: meta.basePrice,
    range: meta.range,
    kind: meta.kind,
    board: meta.board,
    boardName: meta.boardName,
    drivers: [],
    volatility: "mid",
    spot: {
      price,
      prevPrice: price * rand(0.92, 0.98),
      change: 0,
      changePct: 0,
      holdings,
      avgCost,
    },
    forward: [],
    forwardPositions: [],
    history: [],
    boardState,
  };

  seedSpotBuckets(asset, holdings, avgCost);
  return asset;
}

export function bootstrapAssets(state) {
  for (const asset of Object.values(state.assets)) {
    asset.spot.change = asset.spot.price - asset.spot.prevPrice;
    asset.spot.changePct = (asset.spot.change / asset.spot.prevPrice) * 100;
  }

  for (const asset of Object.values(state.assets)) {
    asset.history = generateSeedHistory(state, asset.id, SEED_HISTORY_COUNT);
  }

  refreshAllAssetsDerived(state);
}

export function advancePhase(state) {
  const prevState = {
    day: state.day,
    phaseIndex: state.phaseIndex,
    cash: Number(state.wallet.cash.toFixed(3)),
    creditUsed: Number(state.credit.used.toFixed(3)),
  };
  const next = getNextPhase(state.day, state.phaseIndex, 1);
  state.day = next.day;
  state.phaseIndex = next.phaseIndex;
  state.tick += 1;

  applyNaturalDrift(state);

  for (const assetId of Object.keys(state.assets)) {
    const asset = state.assets[assetId];
    refreshBoardStateOnAdvance(state, assetId);
    const oldPrice = asset.spot.price;
    const targetPrice = clamp(computeTargetPrice(state, assetId), asset.range.min, asset.range.max);
    const alpha = Math.max(0.32, 0.55 - (state.indices.distortion / 100) * 0.15);
    const shock = computeEventShock(state, assetId);
    const newPrice = clamp(oldPrice + alpha * (targetPrice - oldPrice) + shock, asset.range.min, asset.range.max);

    asset.spot.prevPrice = oldPrice;
    asset.spot.price = Number(newPrice.toFixed(3));
    asset.spot.change = Number((asset.spot.price - oldPrice).toFixed(3));
    asset.spot.changePct = Number((((asset.spot.price - oldPrice) / oldPrice) * 100).toFixed(1));

    pushHistoryBar(state, assetId, oldPrice, asset.spot.price);
  }

  settleForwardPositions(state);
  settleBets(state);
  accrueCreditCarry(state);
  refreshAllAssetsDerived(state);
  refreshZeroState(state);
  refreshCreditState(state);
  logMarketEvent("phase-advance", "Market phase advanced", {
    from: prevState,
    to: {
      day: state.day,
      phaseIndex: state.phaseIndex,
      cash: Number(state.wallet.cash.toFixed(3)),
      creditUsed: Number(state.credit.used.toFixed(3)),
    },
    prices: Object.fromEntries(
      Object.values(state.assets).map((asset) => [asset.id, asset.spot.price]),
    ),
  });
}

export function buySpot(state, asset, options = {}) {
  const preview = previewSpotTrade(state, asset, { ...options, side: "buy" });
  if (!preview.success) {
    window.alert(preview.reason);
    logMarketEvent("trade-rejected", "Spot buy blocked", {
      assetId: asset.id,
      reason: preview.reason,
    });
    return false;
  }

  const creditResult = preview.borrowed > 0
    ? consumeCredit(state, asset, preview.borrowed)
    : { success: true, allocations: [] };

  if (!creditResult.success) {
    window.alert("授信额度不足，无法支撑当前杠杆");
    logMarketEvent("trade-rejected", "Spot buy failed due to insufficient credit", {
      assetId: asset.id,
      borrowed: preview.borrowed,
    });
    return false;
  }

  asset.lastSpotFunding = {
    success: true,
    cashUsed: preview.cashRequirement,
    creditUsed: preview.borrowed,
    allocations: creditResult.allocations,
    leverage: preview.leverage,
    borrowed: preview.borrowed,
    marginCost: preview.marginCost,
    blackMarketFee: preview.blackMarketFee,
    tradeFee: preview.tradeFee,
    kind: "spot",
  };

  state.wallet.cash = Number((state.wallet.cash - preview.cashRequirement).toFixed(3));
  refreshCreditState(state);

  if (usesContextualSpotBuckets(asset)) {
    const bucket = getCurrentSpotBucket(asset);
    const nextHoldings = bucket.holdings + preview.quantity;
    const nextCost = bucket.holdings * bucket.avgCost + preview.grossCost + preview.tradeFee;
    bucket.holdings = Number(nextHoldings.toFixed(3));
    bucket.avgCost = Number((nextCost / nextHoldings).toFixed(3));
    syncSpotFromBuckets(asset);
    logMarketEvent("trade-spot-buy", "Spot position increased", {
      assetId: asset.id,
      board: asset.board,
      quantity: preview.quantity,
      grossCost: preview.grossCost,
      marginCost: preview.marginCost,
      borrowed: preview.borrowed,
      tradeFee: preview.tradeFee,
      executionPrice: preview.price,
      blackMarketMode: preview.blackMarketMode,
      blackMarketTier: preview.blackMarketTier,
      blackMarketFee: preview.blackMarketFee,
      lotCount: preview.lotCount,
      context: captureTradeContext(asset),
    });
    return true;
  }

  const currentAmount = asset.spot.holdings;
  const currentCost = currentAmount * asset.spot.avgCost;
  const newAmount = currentAmount + preview.quantity;
  const newAverageCost = (currentCost + preview.grossCost + preview.tradeFee) / newAmount;

  asset.spot.holdings = Number(newAmount.toFixed(3));
  asset.spot.avgCost = Number(newAverageCost.toFixed(3));
  logMarketEvent("trade-spot-buy", "Spot position increased", {
    assetId: asset.id,
    board: asset.board,
    quantity: preview.quantity,
    grossCost: preview.grossCost,
    marginCost: preview.marginCost,
    borrowed: preview.borrowed,
    tradeFee: preview.tradeFee,
    executionPrice: preview.price,
    blackMarketMode: preview.blackMarketMode,
    blackMarketTier: preview.blackMarketTier,
    blackMarketFee: preview.blackMarketFee,
    lotCount: preview.lotCount,
  });
  return true;
}

export function buySpotSmall(state, asset) {
  return buySpot(state, asset, { lotCount: 1 });
}

export function sellSpot(state, asset, options = {}) {
  const preview = previewSpotTrade(state, asset, { ...options, side: "sell" });
  if (!preview.success) {
    logMarketEvent("trade-rejected", "Spot sell failed because no holdings are available", {
      assetId: asset.id,
      context: captureTradeContext(asset),
    });
    return false;
  }

  return executeSpotSell(state, asset, preview.quantity, preview.mode);
}

export function sellSpotSmall(state, asset) {
  return sellSpot(state, asset, { lotCount: 1 });
}

export function sellSpotAll(state, asset) {
  return sellSpot(state, asset, {
    quantity: getSpotPositionSnapshot(asset).holdings,
    mode: "all",
  });
}

function executeSpotSell(state, asset, quantity, mode) {
  const safeQuantity = Number(Math.max(quantity || 0, 0).toFixed(3));

  if (safeQuantity <= 0) {
    logMarketEvent("trade-rejected", "Spot sell failed because no holdings are available", {
      assetId: asset.id,
      context: captureTradeContext(asset),
    });
    return false;
  }

  const executionPrice = getSpotExecutionPrice(asset, "sell");

  if (usesContextualSpotBuckets(asset)) {
    const bucket = getCurrentSpotBucket(asset);
    const grossProceeds = Number((safeQuantity * executionPrice).toFixed(3));
    const tradeFee = getSpotTradeFee(asset, grossProceeds);
    const netProceeds = Number((grossProceeds - tradeFee).toFixed(3));
    const realizedPnl = Number((netProceeds - bucket.avgCost * safeQuantity).toFixed(3));
    const inflow = applyCashInflow(state, netProceeds, "spot-sell");
    bucket.holdings = Number((bucket.holdings - safeQuantity).toFixed(3));
    if (bucket.holdings <= 0.0001) {
      bucket.holdings = 0;
      bucket.avgCost = 0;
    }
    syncSpotFromBuckets(asset);
    logMarketEvent("trade-spot-sell", "Spot position reduced", {
      assetId: asset.id,
      board: asset.board,
      quantity: safeQuantity,
      mode,
      price: executionPrice,
      grossProceeds,
      tradeFee,
      netProceeds,
      realizedPnl,
      repaid: inflow.repaid,
      netCash: inflow.netCash,
      context: captureTradeContext(asset),
    });
    return true;
  }

  const grossProceeds = Number((safeQuantity * executionPrice).toFixed(3));
  const tradeFee = getSpotTradeFee(asset, grossProceeds);
  const netProceeds = Number((grossProceeds - tradeFee).toFixed(3));
  const realizedPnl = Number((netProceeds - asset.spot.avgCost * safeQuantity).toFixed(3));
  const inflow = applyCashInflow(state, netProceeds, "spot-sell");
  asset.spot.holdings = Number((asset.spot.holdings - safeQuantity).toFixed(3));
  if (asset.spot.holdings <= 0.0001) {
    asset.spot.holdings = 0;
    asset.spot.avgCost = 0;
  }
  logMarketEvent("trade-spot-sell", "Spot position reduced", {
    assetId: asset.id,
    board: asset.board,
    quantity: safeQuantity,
    mode,
    price: executionPrice,
    grossProceeds,
    tradeFee,
    netProceeds,
    realizedPnl,
    repaid: inflow.repaid,
    netCash: inflow.netCash,
  });
  return true;
}

export function buyForward(state, asset, offsetIndex, contractCount = 1) {
  const preview = previewForwardTrade(state, asset, offsetIndex, contractCount);
  if (!preview.success) {
    window.alert(preview.reason);
    logMarketEvent("trade-rejected", "Forward buy blocked", {
      assetId: asset.id,
      reason: preview.reason,
      offsetIndex,
    });
    return false;
  }

  const payment = payWithCashAndCredit(state, asset, preview.totalCost);
  if (!payment.success) {
    window.alert("现金与授信均不足");
    logMarketEvent("trade-rejected", "Forward buy failed due to insufficient funding", {
      assetId: asset.id,
      offsetIndex,
      activePrice: preview.price,
      totalCost: preview.totalCost,
    });
    return false;
  }

  asset.forwardPositions.push({
    id: cryptoRandomId(),
    assetId: asset.id,
    quantity: preview.contractCount,
    entryPrice: preview.price,
    settleDay: preview.settleDay,
    settlePhaseIndex: preview.settlePhaseIndex,
    contextSnapshot: captureTradeContext(asset),
  });
  asset.lastForwardFunding = {
    ...payment,
    kind: "forward",
  };
  refreshAssetDerived(state, asset.id);
  logMarketEvent("trade-forward-buy", "Forward position opened", {
    assetId: asset.id,
    offsetIndex,
    settleDay: preview.settleDay,
    settlePhaseIndex: preview.settlePhaseIndex,
    entryPrice: preview.price,
    quantity: preview.contractCount,
    totalCost: preview.totalCost,
    context: captureTradeContext(asset),
  });
  return true;
}

export function openBet(state, asset, direction, options = {}) {
  const blockReason = getBetTradeBlockReason(asset, direction);
  if (blockReason) {
    window.alert(blockReason);
    logMarketEvent("trade-rejected", "Bet open blocked", {
      assetId: asset.id,
      direction,
      reason: blockReason,
    });
    return false;
  }

  const preview = previewBetTrade(state, asset, direction, options);
  const expire = getNextPhase(state.day, state.phaseIndex, 2);
  const {
    productKey,
    productName,
    subtitle,
    metricKey,
    metricLabel,
    metricType,
    compare,
    entryMetric,
    triggerMetric,
    premium,
    expectedPayout,
    size,
    strikeKey,
    thresholdPct,
    triggerDisplay,
  } = preview;

  if (state.wallet.cash < premium) {
    window.alert("资金不足以支付保费");
    logMarketEvent("trade-rejected", "Bet open failed due to insufficient cash", {
      assetId: asset.id,
      premium,
      cash: state.wallet.cash,
    });
    return false;
  }

  state.wallet.cash -= premium;
  state.bets.unshift({
    id: cryptoRandomId(),
    targetId: asset.id,
    direction,
    productKey,
    productName,
    subtitle,
    metricKey,
    metricLabel,
    metricType,
    compare,
    entryMetric,
    triggerMetric,
    triggerDisplay,
    contextSnapshot: captureTradeContext(asset),
    size,
    strikeKey,
    thresholdPct,
    premium,
    expectedPayout,
    openDay: state.day,
    openPhaseIndex: state.phaseIndex,
    expireDay: expire.day,
    expirePhaseIndex: expire.phaseIndex,
    expirePhaseName: expire.phaseName,
    status: "open",
  });

  logMarketEvent("trade-bet-open", "Crack bet opened", {
    assetId: asset.id,
    direction,
    productKey,
    productName,
    metricKey,
    metricLabel,
    metricType,
    compare,
    entryMetric,
    triggerMetric,
    triggerDisplay,
    premium,
    expectedPayout,
    size,
    strikeKey,
    thresholdPct,
    expireDay: expire.day,
    expirePhaseIndex: expire.phaseIndex,
    context: captureTradeContext(asset),
  });

  return true;
}

export function refreshZeroState(state) {
  const { k0, distortion } = state.indices;

  if (k0 >= 82 || distortion >= 88) {
    state.zero.debtState = "rupture-risk";
  } else if (k0 >= 60 || distortion >= 72) {
    state.zero.debtState = "unstable";
  } else {
    state.zero.debtState = "suspended";
  }
}

export function refreshCreditState(state) {
  const credit = state.credit;
  if (!credit) {
    return;
  }

  credit.totalLimit = Number(credit.facilities.reduce((sum, facility) => sum + facility.limit, 0).toFixed(1));
  credit.used = Number(credit.facilities.reduce((sum, facility) => sum + facility.used, 0).toFixed(1));
  credit.available = Number(credit.facilities
    .filter((facility) => !facility.locked)
    .reduce((sum, facility) => sum + Math.max(facility.limit - facility.used, 0), 0)
    .toFixed(1));
  credit.accruedCost = Number(credit.facilities.reduce((sum, facility) => sum + (facility.accruedCost || 0), 0).toFixed(3));
  credit.lastPhaseCost = Number(credit.facilities.reduce((sum, facility) => sum + (facility.lastPhaseCost || 0), 0).toFixed(3));

  const primary = [...credit.facilities]
    .filter((facility) => !facility.locked && facility.limit - facility.used > 0)
    .sort((a, b) => a.priority - b.priority || (b.limit - b.used) - (a.limit - a.used))[0];

  credit.primaryFacilityId = primary?.id || null;
  if (typeof credit.lastRepayment !== "number") {
    credit.lastRepayment = 0;
  }
}

export function getAssetCreditKind(asset) {
  return CREDIT_KIND_MAP[asset.id] || "general";
}

export function getEligibleFacilities(state, asset) {
  const assetKind = getAssetCreditKind(asset);
  return [...state.credit.facilities]
    .filter((facility) =>
      facility.locked !== true &&
      facility.limit - facility.used > 0 &&
      (facility.kind === "general" || facility.kind === assetKind))
    .sort((a, b) => a.priority - b.priority || (b.limit - b.used) - (a.limit - a.used));
}

export function canAffordWithCredit(state, asset, totalCost) {
  const cash = state.wallet.cash;
  const creditAvailable = getEligibleFacilities(state, asset)
    .reduce((sum, facility) => sum + Math.max(facility.limit - facility.used, 0), 0);

  return cash + creditAvailable >= totalCost;
}

export function previewCashAndCreditPlan(state, asset, totalCost) {
  const roundedCost = Number(Math.max(totalCost || 0, 0).toFixed(3));
  const cashUsed = Math.min(state.wallet.cash, roundedCost);
  const creditNeed = Number((roundedCost - cashUsed).toFixed(3));
  const allocations = [];
  let remaining = creditNeed;

  for (const facility of getEligibleFacilities(state, asset)) {
    if (remaining <= 0.0001) {
      break;
    }

    const spendable = Math.min(Math.max(facility.limit - facility.used, 0), remaining);
    if (spendable <= 0) {
      continue;
    }

    allocations.push({
      facilityId: facility.id,
      providerName: facility.providerName,
      amount: Number(spendable.toFixed(3)),
    });
    remaining = Number((remaining - spendable).toFixed(3));
  }

  return {
    success: remaining <= 0.0001,
    cashUsed: Number(cashUsed.toFixed(3)),
    creditUsed: Number(creditNeed.toFixed(3)),
    allocations: remaining <= 0.0001 ? allocations : [],
  };
}

export function previewCreditUsage(state, asset, amount) {
  if (amount <= 0) {
    return { success: true, allocations: [] };
  }

  const allocations = [];
  let remaining = Number(amount.toFixed(3));
  for (const facility of getEligibleFacilities(state, asset)) {
    if (remaining <= 0.0001) {
      break;
    }

    const spendable = Math.min(Math.max(facility.limit - facility.used, 0), remaining);
    if (spendable <= 0) {
      continue;
    }

    allocations.push({
      facilityId: facility.id,
      providerName: facility.providerName,
      amount: Number(spendable.toFixed(3)),
    });
    remaining = Number((remaining - spendable).toFixed(3));
  }

  return {
    success: remaining <= 0.0001,
    allocations: remaining <= 0.0001 ? allocations : [],
  };
}

export function consumeCredit(state, asset, amount) {
  if (amount <= 0) {
    return { success: true, allocations: [] };
  }

  const allocations = [];
  let remaining = amount;
  const facilities = getEligibleFacilities(state, asset);

  for (const facility of facilities) {
    const spendable = Math.min(Math.max(facility.limit - facility.used, 0), remaining);
    if (spendable <= 0) {
      continue;
    }

    allocations.push({
      facilityId: facility.id,
      providerName: facility.providerName,
      amount: Number(spendable.toFixed(3)),
    });
    remaining -= spendable;

    if (remaining <= 0.0001) {
      break;
    }
  }

  if (remaining > 0.0001) {
    return { success: false, allocations: [] };
  }

  for (const allocation of allocations) {
    const facility = state.credit.facilities.find((item) => item.id === allocation.facilityId);
    facility.used = Number((facility.used + allocation.amount).toFixed(3));
  }

  return { success: true, allocations };
}

export function payWithCashAndCredit(state, asset, totalCost) {
  const roundedCost = Number(totalCost.toFixed(3));
  const cashUsed = Math.min(state.wallet.cash, roundedCost);
  const creditNeed = Number((roundedCost - cashUsed).toFixed(3));

  if (creditNeed > 0 && !canAffordWithCredit(state, asset, roundedCost)) {
    return { success: false, cashUsed: 0, creditUsed: 0, allocations: [] };
  }

  const creditResult = consumeCredit(state, asset, creditNeed);
  if (!creditResult.success) {
    return { success: false, cashUsed: 0, creditUsed: 0, allocations: [] };
  }

  state.wallet.cash = Number((state.wallet.cash - cashUsed).toFixed(3));
  refreshCreditState(state);
  if (creditNeed > 0) {
    logMarketEvent("credit-consume", "Credit facility consumed for trade", {
      assetId: asset.id,
      cashUsed,
      creditUsed: creditNeed,
      allocations: creditResult.allocations,
    });
  }

  return {
    success: true,
    cashUsed: Number(cashUsed.toFixed(3)),
    creditUsed: Number(creditNeed.toFixed(3)),
    allocations: creditResult.allocations,
  };
}

export function autoRepayCredit(state, amount) {
  const credit = state.credit;
  if (!credit || amount <= 0) {
    if (credit) {
      credit.lastRepayment = 0;
    }
    return { repaid: 0, allocations: [] };
  }

  let remaining = Math.min(amount, state.wallet.cash);
  const allocations = [];
  const facilities = [...credit.facilities]
    .filter((facility) => (facility.accruedCost || 0) > 0 || facility.used > 0)
    .sort((a, b) => b.rate - a.rate || b.priority - a.priority || b.used - a.used);

  for (const facility of facilities) {
    if (remaining <= 0.0001) {
      break;
    }

    let repaidCost = 0;
    let repaidPrincipal = 0;
    const accruedCost = facility.accruedCost || 0;

    if (accruedCost > 0) {
      repaidCost = Math.min(accruedCost, remaining);
      facility.accruedCost = Number((accruedCost - repaidCost).toFixed(3));
      remaining = Number((remaining - repaidCost).toFixed(3));
    }

    if (remaining > 0.0001 && facility.used > 0) {
      repaidPrincipal = Math.min(facility.used, remaining);
      facility.used = Number((facility.used - repaidPrincipal).toFixed(3));
      remaining = Number((remaining - repaidPrincipal).toFixed(3));
    }

    if (repaidCost > 0 || repaidPrincipal > 0) {
      allocations.push({
        facilityId: facility.id,
        providerName: facility.providerName,
        amount: Number((repaidCost + repaidPrincipal).toFixed(3)),
        repaidCost: Number(repaidCost.toFixed(3)),
        repaidPrincipal: Number(repaidPrincipal.toFixed(3)),
      });
    }
  }

  const repaid = Number((amount - remaining).toFixed(3));
  if (repaid > 0) {
    state.wallet.cash = Number((state.wallet.cash - repaid).toFixed(3));
  }

  credit.lastRepayment = repaid;
  refreshCreditState(state);
  if (repaid > 0) {
    logMarketEvent("credit-repay", "Automatic credit repayment applied", {
      repaid,
      allocations,
    });
  }
  return { repaid, allocations };
}

export function applyCashInflow(state, amount, source = "cashflow") {
  const inflow = Number(Math.max(amount, 0).toFixed(3));
  if (inflow <= 0) {
    return { amount: 0, repaid: 0, netCash: 0, allocations: [], source };
  }

  state.wallet.cash = Number((state.wallet.cash + inflow).toFixed(3));
  const repayment = autoRepayCredit(state, inflow);
  logMarketEvent("cash-inflow", "Cash inflow processed", {
    source,
    amount: inflow,
    repaid: repayment.repaid,
    netCash: Number((inflow - repayment.repaid).toFixed(3)),
    allocations: repayment.allocations,
  });

  return {
    amount: inflow,
    repaid: repayment.repaid,
    netCash: Number((inflow - repayment.repaid).toFixed(3)),
    allocations: repayment.allocations,
    source,
  };
}

export function accrueCreditCarry(state) {
  const credit = state.credit;
  if (!credit) {
    return { totalCost: 0, charges: [] };
  }

  const charges = [];
  let totalCost = 0;

  for (const facility of credit.facilities) {
    if (facility.used <= 0) {
      facility.lastPhaseCost = 0;
      continue;
    }

    const carryFactor = typeof facility.carryFactor === "number" ? facility.carryFactor : 0.1;
    const rawCost = facility.used * facility.rate * carryFactor;
    const cost = Number(Math.max(rawCost, 0.1).toFixed(3));
    facility.lastPhaseCost = cost;
    totalCost += cost;

    const cashPaid = Math.min(state.wallet.cash, cost);
    if (cashPaid > 0) {
      state.wallet.cash = Number((state.wallet.cash - cashPaid).toFixed(3));
    }

    const unpaid = Number((cost - cashPaid).toFixed(3));
    if (unpaid > 0) {
      facility.accruedCost = Number(((facility.accruedCost || 0) + unpaid).toFixed(3));
    }

    charges.push({
      facilityId: facility.id,
      providerName: facility.providerName,
      carryFactor,
      cost,
      cashPaid: Number(cashPaid.toFixed(3)),
      capitalized: unpaid,
    });
  }

  credit.lastPhaseCost = Number(totalCost.toFixed(3));
  refreshCreditState(state);
  if (totalCost > 0) {
    logMarketEvent("credit-carry", "Credit carry accrued for current phase", {
      totalCost: Number(totalCost.toFixed(3)),
      charges,
    });
  }
  return {
    totalCost: Number(totalCost.toFixed(3)),
    charges,
  };
}

export function unlockFacility(state, facilityId) {
  const facility = state.credit.facilities.find((item) => item.id === facilityId);
  if (!facility) return false;
  facility.locked = false;
  refreshCreditState(state);
  return true;
}

export function lockFacility(state, facilityId) {
  const facility = state.credit.facilities.find((item) => item.id === facilityId);
  if (!facility) return false;
  facility.locked = true;
  refreshCreditState(state);
  return true;
}

export function adjustFacilityLimit(state, facilityId, nextLimit) {
  const facility = state.credit.facilities.find((item) => item.id === facilityId);
  if (!facility) return false;
  facility.limit = Number(nextLimit.toFixed(3));
  refreshCreditState(state);
  return true;
}

export function setFacilityRate(state, facilityId, nextRate) {
  const facility = state.credit.facilities.find((item) => item.id === facilityId);
  if (!facility) return false;
  facility.rate = Number(nextRate.toFixed(4));
  refreshCreditState(state);
  return true;
}

export function getContextualSpotPrice(asset) {
  return Number((asset.spot.price * getBoardPriceFactor(asset)).toFixed(3));
}

export function getContextualForwardPrice(asset, offsetIndex) {
  const quote = asset.forward[offsetIndex];
  if (!quote) {
    return null;
  }

  return Number((quote.price * getBoardPriceFactor(asset)).toFixed(3));
}

export function getSpotExecutionPrice(asset, side = "buy") {
  const basePrice = getContextualSpotPrice(asset);
  const spreadRate = getBoardSpreadRate(asset);
  const multiplier = side === "sell" ? 1 - spreadRate : 1 + spreadRate;
  return Number((basePrice * multiplier).toFixed(3));
}

export function getSpotTradeFee(asset, notional) {
  const normalizedNotional = Math.max(Number(notional) || 0, 0);
  if (normalizedNotional <= 0) {
    return 0;
  }

  return Number((normalizedNotional * getBoardFeeRate(asset)).toFixed(3));
}

export function getAssetTradeBlockReason(asset) {
  if (asset.board !== "C") {
    return "";
  }

  const selectedPool = getSelectedDebtPool(asset);
  if (!selectedPool?.halted) {
    return "";
  }

  return `${selectedPool.label} 当前停牌，不可交易`;
}

export function getBaseLot(assetId) {
  return getSpotSmallLot(assetId);
}

export function getScaledBaseLot(state, assetId) {
  const tier = getEconomyTier(state?.economy?.level);
  return getBaseLot(assetId) * (tier.tradeLotMultiplier || 1);
}

export function getMaxLeverageForAsset(state, asset) {
  const boardMax = getRequestedLeverageCap(state, asset);
  const globalMax = state.tradePrefs?.leverageMaxGlobal || 20;
  const effectiveGlobalMax = isBlackMarketModeActive(state) ? Math.max(globalMax, boardMax) : globalMax;
  const step = getEffectiveLeverageStep(state, asset);
  const min = state.tradePrefs?.leverageMin || 1;
  const hardMax = Math.min(boardMax, effectiveGlobalMax);

  const candidates = enumerateLeverageSteps(min, hardMax, step).reverse();
  for (const candidate of candidates) {
    const quote = computeSpotBuyQuote(state, asset, 1, candidate);
    if (quote.cashRequirement <= state.wallet.cash && previewCreditUsage(state, asset, quote.borrowed).success) {
      return candidate;
    }
  }

  return min;
}

export function isBlackMarketMode(state) {
  return isBlackMarketModeActive(state);
}

export function previewLeveragedTrade(state, asset) {
  return previewSpotTrade(state, asset, { side: "buy", lotCount: 1 });
}

export function previewSpotTrade(state, asset, options = {}) {
  const side = options.side === "sell" ? "sell" : "buy";
  const lotCount = normalizeLotCount(options.lotCount);

  if (side === "sell") {
    const position = getSpotPositionSnapshot(asset);
    const requestedQuantity = Number((typeof options.quantity === "number"
      ? options.quantity
      : getScaledBaseLot(state, asset.id) * lotCount).toFixed(3));
    const quantity = Number(Math.min(Math.max(requestedQuantity, 0), position.holdings).toFixed(3));
    const price = getSpotExecutionPrice(asset, "sell");
    const grossProceeds = Number((quantity * price).toFixed(3));
    const tradeFee = getSpotTradeFee(asset, grossProceeds);
    const netProceeds = Number((grossProceeds - tradeFee).toFixed(3));
    const realizedPnl = Number((netProceeds - position.avgCost * quantity).toFixed(3));
    const success = quantity > 0;

    return {
      kind: "spot",
      side,
      lotCount,
      baseLot: getScaledBaseLot(state, asset.id),
      quantity,
      price,
      grossProceeds,
      tradeFee,
      netProceeds,
      realizedPnl,
      holdings: position.holdings,
      avgCost: position.avgCost,
      success,
      reason: success ? "" : "当前没有可卖持仓",
      mode: options.mode === "all" || quantity >= position.holdings ? "all" : "partial",
      maxLotCount: getMaxSpotOrderLotCount(state, asset, "sell"),
    };
  }

  const blockReason = getAssetTradeBlockReason(asset);
  if (blockReason) {
    return {
      kind: "spot",
      side,
      success: false,
      reason: blockReason,
      lotCount,
      maxLotCount: 0,
    };
  }

  const baseLot = getScaledBaseLot(state, asset.id);
  const min = state.tradePrefs?.leverageMin || 1;
  const step = getEffectiveLeverageStep(state, asset);
  const requested = Number(options.leverage ?? (state.tradePrefs?.leverage || 1));
  const maxLeverage = getMaxLeverageForAsset(state, asset);
  const leverage = snapLeverage(requested, min, maxLeverage, step);
  const quote = computeSpotBuyQuote(state, asset, lotCount, leverage);
  const {
    price,
    quantity,
    grossCost,
    marginCost,
    borrowed,
    tradeFee,
    blackMarketFee,
    cashRequirement,
  } = quote;
  const normalMaxLeverage = getNormalLeverageCap(asset);
  const blackMarketMode = isBlackMarketModeActive(state);
  const blackMarketTier = blackMarketMode ? getBlackMarketLeverageCap(asset) : 0;
  const creditPreview = previewCreditUsage(state, asset, borrowed);
  const success = quantity > 0 && cashRequirement <= state.wallet.cash && creditPreview.success;
  let reason = "";
  if (quantity <= 0) {
    reason = "数量必须大于 0";
  } else if (cashRequirement > state.wallet.cash) {
    reason = blackMarketFee > 0 ? "现金不足以支付保证金、手续费与黑市入场抽成" : "现金不足以支付保证金与手续费";
  } else if (!creditPreview.success) {
    reason = "授信额度不足，无法支撑当前杠杆";
  }

  return {
    kind: "spot",
    side,
    lotCount,
    leverage,
    baseLot,
    quantity,
    price,
    grossCost,
    marginCost,
    borrowed,
    tradeFee,
    cashRequirement,
    maxLeverage,
    normalMaxLeverage,
    blackMarketMode,
    blackMarketTier,
    blackMarketFee,
    step,
    fundingAllocations: creditPreview.allocations,
    success,
    reason,
    maxLotCount: getMaxSpotOrderLotCount(state, asset, "buy"),
  };
}

export function previewForwardTrade(state, asset, offsetIndex, contractCount = 1) {
  const blockReason = getAssetTradeBlockReason(asset);
  if (blockReason) {
    return {
      kind: "forward",
      success: false,
      reason: blockReason,
      contractCount: 0,
      offsetIndex,
      maxLotCount: 0,
    };
  }

  const quote = asset.forward[offsetIndex];
  if (!quote) {
    return {
      kind: "forward",
      success: false,
      reason: "当前远期报价不可用",
      contractCount: 0,
      offsetIndex,
      maxLotCount: 0,
    };
  }

  const normalizedCount = normalizeLotCount(contractCount);
  const price = getContextualForwardPrice(asset, offsetIndex) ?? quote.price;
  const totalCost = Number((price * normalizedCount).toFixed(3));
  const paymentPreview = previewCashAndCreditPlan(state, asset, totalCost);
  let reason = "";
  if (normalizedCount <= 0) {
    reason = "数量必须大于 0";
  } else if (!paymentPreview.success) {
    reason = "现金与授信均不足";
  }

  return {
    kind: "forward",
    success: normalizedCount > 0 && paymentPreview.success,
    reason,
    offsetIndex,
    contractCount: normalizedCount,
    price,
    totalCost,
    settleDay: quote.day,
    settlePhaseIndex: quote.phaseIndex,
    settlePhaseName: quote.phaseName,
    cashUsed: paymentPreview.cashUsed,
    creditUsed: paymentPreview.creditUsed,
    fundingAllocations: paymentPreview.allocations,
    maxLotCount: getMaxForwardOrderCount(state, asset, offsetIndex),
  };
}

export function getMaxSpotOrderLotCount(state, asset, side = "buy") {
  if (side === "sell") {
    const holdings = getSpotPositionSnapshot(asset).holdings;
    const baseLot = getScaledBaseLot(state, asset.id);
    if (baseLot <= 0 || holdings <= 0) {
      return 0;
    }
    return Math.max(1, Math.ceil(holdings / baseLot));
  }

  const singlePreview = previewSpotTradeWithoutMax(state, asset, 1);
  if (!singlePreview.success) {
    return 0;
  }

  const maxByCash = singlePreview.cashRequirement > 0
    ? Math.floor(state.wallet.cash / singlePreview.cashRequirement)
    : Number.MAX_SAFE_INTEGER;
  const availableCredit = getEligibleFacilities(state, asset)
    .reduce((sum, facility) => sum + Math.max(facility.limit - facility.used, 0), 0);
  const maxByCredit = singlePreview.borrowed > 0
    ? Math.floor(availableCredit / singlePreview.borrowed)
    : Number.MAX_SAFE_INTEGER;
  return Math.max(0, Math.min(maxByCash, maxByCredit));
}

export function getMaxForwardOrderCount(state, asset, offsetIndex) {
  const quote = asset.forward[offsetIndex];
  if (!quote || getAssetTradeBlockReason(asset)) {
    return 0;
  }

  const price = getContextualForwardPrice(asset, offsetIndex) ?? quote.price;
  const availableCredit = getEligibleFacilities(state, asset)
    .reduce((sum, facility) => sum + Math.max(facility.limit - facility.used, 0), 0);
  return Math.max(0, Math.floor((state.wallet.cash + availableCredit) / Math.max(price, 0.001)));
}

function previewSpotTradeWithoutMax(state, asset, lotCount) {
  const min = state.tradePrefs?.leverageMin || 1;
  const step = getEffectiveLeverageStep(state, asset);
  const requested = Number(state.tradePrefs?.leverage || 1);
  const maxLeverage = getMaxLeverageForAsset(state, asset);
  const leverage = snapLeverage(requested, min, maxLeverage, step);
  const {
    quantity,
    grossCost,
    marginCost,
    borrowed,
    tradeFee,
    blackMarketFee,
    cashRequirement,
  } = computeSpotBuyQuote(state, asset, lotCount, leverage);
  const creditPreview = previewCreditUsage(state, asset, borrowed);
  return {
    success: quantity > 0 && cashRequirement <= state.wallet.cash && creditPreview.success,
    quantity,
    leverage,
    grossCost,
    marginCost,
    borrowed,
    tradeFee,
    blackMarketFee,
    cashRequirement,
  };
}

function normalizeLotCount(value) {
  return Math.max(1, Math.floor(Number(value) || 1));
}

export function snapLeverage(value, min, max, step) {
  const safeMin = Number(min || 1);
  const safeMax = Math.max(Number(max || safeMin), safeMin);
  const safeStep = Math.max(Number(step || 0.5), 0.0001);
  const clamped = clamp(Number(value || safeMin), safeMin, safeMax);
  const snappedSteps = Math.round((clamped - safeMin) / safeStep);
  const snapped = safeMin + snappedSteps * safeStep;
  return Number(clamp(snapped, safeMin, safeMax).toFixed(3));
}

function enumerateLeverageSteps(min, max, step) {
  const values = [];
  let current = Number(min.toFixed(3));
  while (current <= max + 0.0001) {
    values.push(Number(current.toFixed(3)));
    current += step;
  }
  if (!values.length || Math.abs(values[values.length - 1] - max) > 0.0001) {
    values.push(Number(max.toFixed(3)));
  }
  return [...new Set(values.map((value) => Number(value.toFixed(3))))];
}

function computeSpotBuyQuote(state, asset, lotCount, leverage) {
  const baseLot = getScaledBaseLot(state, asset.id);
  const price = getSpotExecutionPrice(asset, "buy");
  const quantity = Number((baseLot * lotCount * leverage).toFixed(3));
  const grossCost = Number((quantity * price).toFixed(3));
  const marginCost = Number((grossCost / leverage).toFixed(3));
  const borrowed = Number((grossCost - marginCost).toFixed(3));
  const tradeFee = getSpotTradeFee(asset, grossCost);
  const blackMarketFee = Number(computeBlackMarketEntryFee(asset, leverage, borrowed).toFixed(3));
  const cashRequirement = Number((marginCost + blackMarketFee + tradeFee).toFixed(3));
  return {
    price,
    quantity,
    grossCost,
    marginCost,
    borrowed,
    tradeFee,
    blackMarketFee,
    cashRequirement,
  };
}

export function previewBetTrade(state, asset, direction, options = {}) {
  const size = clamp(Number(options.size ?? 1), 1, getMaxBetSize(state, asset));
  const strikeKey = BET_STRIKE_PRESETS[options.strikeKey] ? options.strikeKey : "standard";
  const strike = BET_STRIKE_PRESETS[strikeKey];
  const productMeta = getDirectionalProductMeta(asset.board, direction);
  const entryMetric = getDirectionalMetricSnapshot(asset, direction);
  const blackMarketMode = isBlackMarketModeActive(state);
  const premiumMultiplier = blackMarketMode ? 1.45 : 1;
  const payoutMultiplier = blackMarketMode ? 2.15 : 1;
  const thresholdPct = Number((getBoardBetBaseThreshold(asset.board, blackMarketMode) * strike.thresholdMultiplier).toFixed(4));
  const triggerMetric = computeDirectionalTrigger(entryMetric, direction, productMeta.unitType, thresholdPct);
  const premium = Number((getBoardBetBasePremium(asset.board) * strike.premiumMultiplier * size * premiumMultiplier).toFixed(1));
  const stylePayoutFactor = getBoardStylePayoutFactor(asset);
  const expectedPayout = Number((premium * strike.payoutMultiplier * stylePayoutFactor * payoutMultiplier).toFixed(1));

  return {
    direction,
    productKey: productMeta.productKey,
    productName: productMeta.displayName,
    shortLabel: productMeta.shortLabel,
    subtitle: productMeta.subtitle,
    metricKey: productMeta.metricKey,
    metricLabel: productMeta.metricLabel,
    metricType: productMeta.unitType,
    compare: productMeta.compare,
    size,
    strikeKey,
    strikeLabel: strike.label,
    stylePayoutFactor,
    entryMetric,
    thresholdPct,
    triggerMetric,
    triggerDisplay: formatDirectionalMetric(triggerMetric, productMeta.unitType),
    premium,
    expectedPayout,
    blackMarketMode,
    expireOffset: 2,
  };
}

export function getMaxBetSize(state) {
  return getEconomyTier(state?.economy?.level).betMaxSize;
}

export function getSpotPositionSnapshot(asset) {
  if (!usesContextualSpotBuckets(asset)) {
    return {
      holdings: asset.spot.holdings,
      avgCost: asset.spot.avgCost,
      contextual: false,
    };
  }

  const bucket = getCurrentSpotBucket(asset);
  return {
    holdings: bucket.holdings || 0,
    avgCost: bucket.avgCost || 0,
    contextual: true,
  };
}

function refreshAllAssetsDerived(state) {
  for (const asset of Object.values(state.assets)) {
    refreshAssetDerived(state, asset.id);
  }
}

function getBoardBetBaseThreshold(board, blackMarketMode = false) {
  if (!blackMarketMode) {
    if (board === "B") return 0.06;
    if (board === "C") return 0.09;
    return 0.04;
  }

  if (board === "B") return 0.08;
  if (board === "C") return 0.125;
  return 0.05;
}

function getBoardBetBasePremium(board) {
  if (board === "B") return 4.5;
  if (board === "C") return 5.0;
  return 4.0;
}

function getNormalLeverageCap(asset) {
  if (asset.board === "B") {
    const layer = asset.boardState.layers[asset.boardState.selectedLayer];
    return layer?.leverageCap || 8;
  }

  if (asset.board === "C") {
    const tranche = asset.boardState.tranches[asset.boardState.selectedTranche];
    return tranche?.leverageCap || 8;
  }

  return 5;
}

export function getBlackMarketLeverageCap(asset) {
  if (asset.board === "A") {
    return 25;
  }

  if (asset.board === "B") {
    if (asset.boardState.selectedLayer === "saint") return 125;
    if (asset.boardState.selectedLayer === "choir") return 50;
    return 25;
  }

  if (asset.board === "C") {
    if (asset.boardState.selectedTranche === "equity") return 500;
    if (asset.boardState.selectedTranche === "mezz") return 100;
    return 50;
  }

  return 20;
}

function isBlackMarketModeActive(state) {
  return Boolean(state.tradePrefs?.blackMarketMode);
}

function getRequestedLeverageCap(state, asset) {
  return isBlackMarketModeActive(state) ? getBlackMarketLeverageCap(asset) : getNormalLeverageCap(asset);
}

function getEffectiveLeverageStep(state, asset) {
  if (!isBlackMarketModeActive(state)) {
    return state.tradePrefs?.leverageStep || 0.5;
  }

  const blackMarketCap = getBlackMarketLeverageCap(asset);
  if (blackMarketCap >= 250) return 5;
  if (blackMarketCap >= 100) return 2.5;
  if (blackMarketCap > 20) return 1;
  return state.tradePrefs?.leverageStep || 0.5;
}

function getBlackMarketFeeRate(asset) {
  if (asset.board === "C") return 0.03;
  if (asset.board === "B") return 0.018;
  return 0.006;
}

function computeBlackMarketEntryFee(asset, leverage, borrowed) {
  const normalMax = getNormalLeverageCap(asset);
  if (leverage <= normalMax || borrowed <= 0) {
    return 0;
  }

  return borrowed * getBlackMarketFeeRate(asset);
}

function getBoardStylePayoutFactor(asset) {
  if (asset.board === "B") {
    const layer = asset.boardState.layers[asset.boardState.selectedLayer];
    return layer?.payoutFactor || 1;
  }

  if (asset.board === "C") {
    const tranche = asset.boardState.tranches[asset.boardState.selectedTranche];
    return tranche?.payoutFactor || 1;
  }

  return 1;
}

function getDirectionalMetricSnapshot(asset, direction, contextSnapshot = null) {
  const context = contextSnapshot || captureTradeContext(asset);
  const board = asset.board;

  if (board === "A") {
    return getSettlementSpotPrice(asset, context);
  }

  if (board === "B") {
    if (direction === "fracture") {
      return Number(asset.boardState.capacityAvailable.toFixed(3));
    }

    return getSettlementSpotPrice(asset, context);
  }

  if (direction === "fracture") {
    const poolId = context.poolId || asset.boardState.selectedPoolId;
    const pool = asset.boardState.pools.find((item) => item.id === poolId);
    return Number(((pool?.recoveryRate || 0)).toFixed(3));
  }

  return getSettlementSpotPrice(asset, context);
}

function computeDirectionalTrigger(entryMetric, direction, metricType, thresholdPct) {
  if (metricType === "price") {
    return direction === "align"
      ? Number((entryMetric * (1 + thresholdPct)).toFixed(3))
      : Number((entryMetric * (1 - thresholdPct)).toFixed(3));
  }

  if (metricType === "capacity" || metricType === "ratio") {
    return Number((entryMetric * (1 - thresholdPct)).toFixed(3));
  }

  return Number(entryMetric.toFixed(3));
}

export function formatDirectionalMetric(value, metricType) {
  if (metricType === "ratio") {
    return `${(value * 100).toFixed(1)}%`;
  }

  if (metricType === "capacity") {
    return `${value.toFixed(1)} CAP`;
  }

  return Number(value).toFixed(3);
}

function createBoardState(assetId) {
  if (assetId === "liquid") {
    return {
      inventory: {
        total: 82,
        deliverable: 48,
      },
      basis: {
        near: 0.024,
        far: 0.051,
      },
    };
  }

  if (assetId === "sanctuary") {
    return {
      selectedLayer: "choir",
      capacityAvailable: 38.2,
      tailRiskRate: 2.6,
      layers: {
        parish: {
          label: "教区层",
          status: "normal",
          styleLabel: "稳健承接",
          riskLabel: "更稳",
          priceFactor: 0.93,
          leverageCap: 4,
          payoutFactor: 0.85,
          holdings: 0,
          avgCost: 0,
        },
        choir: {
          label: "唱诗班层",
          status: "tight",
          styleLabel: "标准承接",
          riskLabel: "均衡",
          priceFactor: 1.0,
          leverageCap: 8,
          payoutFactor: 1.0,
          holdings: 0,
          avgCost: 0,
        },
        saint: {
          label: "圣女层",
          status: "critical",
          styleLabel: "高压承接",
          riskLabel: "更赌",
          priceFactor: 1.12,
          leverageCap: 12,
          payoutFactor: 1.35,
          holdings: 0,
          avgCost: 0,
        },
      },
    };
  }

  return {
    selectedPoolId: "street_pool",
    selectedTranche: "mezz",
    haltedPoolCount: 1,
    liquidityState: "thin",
    pools: [
      {
        id: "street_pool",
        label: "下街主池",
        recoveryRate: 0.31,
        halted: false,
        priceFactor: 1.0,
      },
      {
        id: "dock_pool",
        label: "码头池",
        recoveryRate: 0.27,
        halted: false,
        priceFactor: 0.92,
      },
      {
        id: "bell_pool",
        label: "钟楼池",
        recoveryRate: 0.18,
        halted: true,
        priceFactor: 0.84,
      },
    ],
    tranches: {
      senior: {
        label: "优先层",
        styleLabel: "更稳",
        priceFactor: 1.16,
        spread: 0.028,
        leverageCap: 4,
        payoutFactor: 0.8,
      },
      mezz: {
        label: "夹层",
        styleLabel: "标准",
        priceFactor: 1.0,
        spread: 0.071,
        leverageCap: 8,
        payoutFactor: 1.0,
      },
      equity: {
        label: "股权层",
        styleLabel: "更赌",
        priceFactor: 0.74,
        spread: 0.146,
        leverageCap: 15,
        payoutFactor: 1.6,
      },
    },
    positionBuckets: {},
  };
}

function refreshAssetDerived(state, assetId) {
  const asset = state.assets[assetId];
  if (usesContextualSpotBuckets(asset)) {
    syncSpotFromBuckets(asset);
  }
  asset.volatility = getVolatility(Math.abs(asset.spot.changePct), state.indices.distortion);
  asset.drivers =
    assetId === "liquid" ? buildLiquidDrivers(state) :
    assetId === "sanctuary" ? buildSanctuaryDrivers(state) :
    buildBadDebtDrivers(state);
  asset.forward = buildForwardQuotes(state, assetId);
}

function refreshBoardStateOnAdvance(state, assetId) {
  const asset = state.assets[assetId];
  const boardState = asset.boardState;

  if (asset.board === "A") {
    const total = clamp(
      boardState.inventory.total + rand(-4, 3) - Math.max(0, (state.indices.supply - 50) * 0.05),
      36,
      118,
    );
    const deliverable = clamp(
      total * rand(0.45, 0.72) - state.indices.distortion * 0.03,
      12,
      total,
    );

    boardState.inventory.total = Number(total.toFixed(1));
    boardState.inventory.deliverable = Number(deliverable.toFixed(1));
    boardState.basis.near = Number((rand(0.008, 0.045) + (50 - state.indices.supply) * 0.0005).toFixed(3));
    boardState.basis.far = Number((boardState.basis.near + rand(0.01, 0.035)).toFixed(3));
    return;
  }

  if (asset.board === "B") {
    boardState.capacityAvailable = Number(clamp(
      boardState.capacityAvailable + rand(-3.8, 2.4) - state.runtime.churchStress * 0.03,
      9,
      68,
    ).toFixed(1));
    boardState.tailRiskRate = Number(clamp(
      boardState.tailRiskRate + rand(-0.25, 0.45) + state.indices.distortion * 0.01,
      0.9,
      8.4,
    ).toFixed(2));

    for (const layer of Object.values(boardState.layers)) {
      const stressScore = state.runtime.churchStress + state.indices.distortion * 0.35 + rand(-8, 10);
      layer.status =
        stressScore > 86 ? "critical" :
        stressScore > 60 ? "tight" :
        "normal";
    }

    boardState.layers.parish.priceFactor = Number((0.9 + boardState.tailRiskRate * 0.01).toFixed(2));
    boardState.layers.choir.priceFactor = Number((0.98 + boardState.tailRiskRate * 0.015).toFixed(2));
    boardState.layers.saint.priceFactor = Number((1.08 + boardState.tailRiskRate * 0.02).toFixed(2));
    return;
  }

  let haltedCount = 0;
  for (const pool of boardState.pools) {
    const nextRecovery = clamp(
      pool.recoveryRate + rand(-0.045, 0.03) - Math.max(0, state.indices.clearance - 60) * 0.001,
      0.08,
      0.62,
    );
    pool.recoveryRate = Number(nextRecovery.toFixed(2));

    const haltThreshold = state.indices.clearance + state.indices.distortion * 0.2 + rand(-12, 16);
    pool.halted = haltThreshold > 92 && pool.id !== "street_pool" ? true : haltThreshold < 72 ? false : pool.halted;
    pool.priceFactor = Number(clamp(0.6 + pool.recoveryRate * 1.15 + rand(-0.05, 0.05), 0.55, 1.25).toFixed(2));

    if (pool.halted) {
      haltedCount += 1;
    }
  }

  boardState.haltedPoolCount = haltedCount;
  boardState.liquidityState =
    haltedCount >= 2 ? "frozen" :
    haltedCount >= 1 || state.indices.clearance > 70 ? "thin" :
    "normal";
}

function generateSeedHistory(state, assetId, count = 32) {
  const asset = state.assets[assetId];
  const points = [];
  const labels = [];
  let cursor = { day: state.day, phaseIndex: state.phaseIndex };

  for (let index = 0; index < count; index += 1) {
    labels.push({ day: cursor.day, phaseIndex: cursor.phaseIndex });
    cursor = getPrevPhase(cursor.day, cursor.phaseIndex, 1);
  }

  labels.reverse();

  const driftScale =
    assetId === "liquid" ? 0.012 :
    assetId === "sanctuary" ? 0.02 :
    0.03;
  const wickBase =
    assetId === "liquid" ? 0.006 :
    assetId === "sanctuary" ? 0.012 :
    0.018;
  let close = clamp(
    asset.spot.price * rand(0.95, 0.985),
    asset.range.min,
    asset.range.max,
  );
  const baseVolume = assetId === "liquid" ? 700 : assetId === "sanctuary" ? 820 : 920;

  for (let index = 0; index < labels.length; index += 1) {
    const label = labels[index];
    const isLast = index === labels.length - 1;
    const open = close;
    const nextClose = isLast
      ? asset.spot.price
      : clamp(
          open
            + (asset.spot.price - open) * rand(0.08, 0.22)
            + rand(-driftScale, driftScale),
          asset.range.min,
          asset.range.max,
        );
    const wick = Math.max(wickBase, Math.abs(nextClose - open) * rand(0.45, 1.1));
    const high = clamp(Math.max(open, nextClose) + wick, asset.range.min, asset.range.max);
    const low = clamp(
      Math.min(open, nextClose) - wick * rand(0.55, 0.95),
      asset.range.min,
      asset.range.max,
    );

    points.push({
      day: label.day,
      phaseIndex: label.phaseIndex,
      phaseName: getPhaseName(label.phaseIndex),
      assetId,
      o: Number(open.toFixed(3)),
      h: Number(high.toFixed(3)),
      l: Number(low.toFixed(3)),
      c: Number(nextClose.toFixed(3)),
      v: Math.floor(baseVolume + rand(-180, 180) + state.indices.distortion * rand(0.8, 2.2)),
      tags: [],
    });

    close = nextClose;
  }

  return points;
}

function pushHistoryBar(state, assetId, open, close) {
  const asset = state.assets[assetId];
  const rangeAmplitude = Math.max(0.01, Math.abs(close - open) * rand(0.7, 1.9));
  const high = clamp(Math.max(open, close) + rangeAmplitude, asset.range.min, asset.range.max);
  const low = clamp(
    Math.min(open, close) - rangeAmplitude * rand(0.7, 1.3),
    asset.range.min,
    asset.range.max,
  );

  let baseVolume = assetId === "liquid" ? 740 : assetId === "sanctuary" ? 920 : 1080;
  baseVolume += Math.floor(state.indices.distortion * rand(1.0, 2.2));
  if (assetId === "badDebtStreet" && state.indices.clearance > 70) baseVolume += 180;
  if (assetId === "sanctuary" && state.indices.sanctuary < 40) baseVolume += 120;
  if (assetId === "liquid" && state.indices.k0 > 60) baseVolume += 100;
  const moveRatio = Math.abs(close - open) / Math.max(open, 0.001);
  const boardPulse =
    assetId === "liquid" ? rand(-120, 180) :
    assetId === "sanctuary" ? rand(-150, 220) :
    rand(-180, 280);
  const moveBoost =
    assetId === "liquid" ? moveRatio * 4200 :
    assetId === "sanctuary" ? moveRatio * 5200 :
    moveRatio * 6400;
  const eventBoost =
    (assetId === "sanctuary" ? Math.max(0, 48 - state.indices.sanctuary) * 7 : 0) +
    (assetId === "badDebtStreet" ? Math.max(0, state.indices.clearance - 58) * 6 : 0) +
    (assetId === "liquid" ? Math.max(0, state.indices.k0 - 58) * 4 : 0);
  const burstChance = assetId === "badDebtStreet" ? 0.22 : assetId === "sanctuary" ? 0.16 : 0.12;
  const burstBoost = chance(burstChance) ? rand(120, assetId === "badDebtStreet" ? 420 : 280) : 0;
  const volume = Math.max(120, Math.floor(baseVolume + boardPulse + moveBoost + eventBoost + burstBoost));

  asset.history.push({
    day: state.day,
    phaseIndex: state.phaseIndex,
    phaseName: getPhaseName(state.phaseIndex),
    assetId,
    o: Number(open.toFixed(3)),
    h: Number(high.toFixed(3)),
    l: Number(low.toFixed(3)),
    c: Number(close.toFixed(3)),
    v: volume,
    tags: [],
  });

  if (asset.history.length > HISTORY_LIMIT) {
    asset.history.shift();
  }
}

function buildForwardQuotes(state, assetId) {
  const asset = state.assets[assetId];

  return [1, 2].map((offset) => {
    const targetPrice = estimateForwardPrice(state, assetId, offset);
    const point = getNextPhase(state.day, state.phaseIndex, offset);
    const holdings = asset.forwardPositions
      .filter((position) => position.settleDay === point.day && position.settlePhaseIndex === point.phaseIndex)
      .reduce((sum, position) => sum + position.quantity, 0);
    return {
      offsetPhases: offset,
      day: point.day,
      phaseIndex: point.phaseIndex,
      phaseName: point.phaseName,
      price: Number(targetPrice.toFixed(3)),
      basis: Number((targetPrice - asset.spot.price).toFixed(3)),
      holdings: Number(holdings.toFixed(3)),
    };
  });
}

function estimateForwardPrice(state, assetId, offset) {
  const asset = state.assets[assetId];
  const phasePoint = getNextPhase(state.day, state.phaseIndex, offset);
  const phaseBias = getPhaseBias(assetId, phasePoint.phaseIndex, offset);
  const targetPrice = computeTargetPrice(state, assetId);
  const mix = 0.45 + offset * 0.15;
  const rawPrice = asset.spot.price + (targetPrice - asset.spot.price) * mix + phaseBias;

  return clamp(rawPrice, asset.range.min, asset.range.max);
}

function getPhaseBias(assetId, phaseIndex, offset) {
  const phaseKey = PHASES[phaseIndex].key;

  if (assetId === "liquid") {
    if (phaseKey === "day") return 0.02 * offset;
    if (phaseKey === "night") return 0.03 * offset;
    if (phaseKey === "morning") return 0.01 * offset;
    return 0.015 * offset;
  }

  if (assetId === "sanctuary") {
    if (phaseKey === "night") return 0.08 * offset;
    if (phaseKey === "dusk") return 0.05 * offset;
    return 0.03 * offset;
  }

  if (phaseKey === "dusk") return -0.03 * offset;
  if (phaseKey === "night") return -0.05 * offset;
  return -0.015 * offset;
}

function computeTargetPrice(state, assetId) {
  const indices = state.indices;
  const runtime = state.runtime;
  const distortionFactor = indices.distortion / 100;

  if (assetId === "liquid") {
    const scarcity = (50 - indices.supply) / 50;
    const demand = runtime.liquidDemand / 100;
    const panic = indices.k0 / 100;
    return 1.0 * (1 + 0.45 * scarcity + 0.2 * demand + 0.15 * panic + 0.1 * distortionFactor);
  }

  if (assetId === "sanctuary") {
    const load = (50 - indices.sanctuary) / 50;
    const stress = runtime.churchStress / 100;
    const panic = indices.k0 / 100;
    return 2.0 * (1 + 0.6 * load + 0.25 * stress + 0.15 * panic + 0.12 * distortionFactor);
  }

  const recovery = runtime.poolRecoveryStreet / 100;
  const pressure = indices.clearance / 100;
  const panic = indices.k0 / 100;
  const distortionNoise = rand(-0.08, 0.08) * (1 + distortionFactor * 1.2);

  return 0.5 * (1 + 0.7 * recovery - 0.55 * pressure - 0.15 * panic + distortionNoise);
}

function computeEventShock(state, assetId) {
  const distortionFactor = state.indices.distortion / 100;

  if (assetId === "liquid") {
    return rand(-0.015, 0.025 + distortionFactor * 0.035);
  }

  if (assetId === "sanctuary") {
    return rand(-0.03, 0.04 + distortionFactor * 0.06);
  }

  return rand(-0.05 - distortionFactor * 0.05, 0.03 + distortionFactor * 0.015);
}

function applyNaturalDrift(state) {
  const indices = state.indices;
  const phaseKey = PHASES[state.phaseIndex].key;

  let distortionGain = 1.0;
  if (indices.clearance > 60) distortionGain += 0.8;
  if (indices.sanctuary < 40) distortionGain += 0.9;
  if (indices.k0 > 55) distortionGain += 0.6;
  if (phaseKey === "night") distortionGain += 0.7;

  indices.distortion = clamp(indices.distortion + distortionGain + rand(-0.2, 0.35), 0, 100);

  switch (phaseKey) {
    case "morning":
      indices.k0 = clamp(indices.k0 + rand(-1.5, 2.2), 0, 100);
      state.runtime.liquidDemand = clamp(state.runtime.liquidDemand + rand(-3, 4), 0, 100);
      break;
    case "day":
      indices.supply = clamp(indices.supply + rand(-2.5, 1.5), 0, 100);
      state.runtime.liquidDemand = clamp(state.runtime.liquidDemand + rand(1, 5), 0, 100);
      break;
    case "dusk":
      indices.clearance = clamp(indices.clearance + rand(0.5, 3.2), 0, 100);
      state.runtime.poolRecoveryStreet = clamp(state.runtime.poolRecoveryStreet + rand(-4.5, 1.5), 0, 100);
      break;
    case "night":
      indices.sanctuary = clamp(indices.sanctuary + rand(-3.5, 0.8), 0, 100);
      indices.k0 = clamp(indices.k0 + rand(-0.5, 2.8), 0, 100);
      state.runtime.churchStress = clamp(state.runtime.churchStress + rand(1, 5), 0, 100);
      break;
    default:
      break;
  }

  indices.supply = clamp(indices.supply + rand(-1.5, 0.8), 0, 100);
  indices.sanctuary = clamp(indices.sanctuary + rand(-1.6, 0.7), 0, 100);
  indices.clearance = clamp(indices.clearance + rand(0.2, 1.8), 0, 100);
  indices.k0 = clamp(indices.k0 + state.zero.k0Shift * 0.03 + rand(-0.8, 1.6), 0, 100);

  state.runtime.churchStress = clamp(
    state.runtime.churchStress + (indices.sanctuary < 35 ? 2 : 0) + rand(-1, 1.5),
    0,
    100,
  );
  state.runtime.poolRecoveryStreet = clamp(
    state.runtime.poolRecoveryStreet - (indices.clearance > 70 ? 2 : 0) + rand(-1.5, 1),
    0,
    100,
  );
}

function settleBets(state) {
  for (const bet of state.bets) {
    if (bet.status !== "open") {
      continue;
    }

    const isExpired =
      comparePhasePoint(state.day, state.phaseIndex, bet.expireDay, bet.expirePhaseIndex) >= 0;

    if (!isExpired) {
      continue;
    }

    const settlementMetric = getDirectionalSettlementMetric(state, bet);
    const isHit = bet.compare === "gte"
      ? settlementMetric >= bet.triggerMetric
      : settlementMetric <= bet.triggerMetric;

    if (isHit) {
      bet.status = "won";
      applyCashInflow(state, bet.expectedPayout, "bet-payout");
      pushRecentSettlement(state, {
        ...bet,
        status: "won",
        settlementMetric,
        settledDay: state.day,
        settledPhaseIndex: state.phaseIndex,
      });
      logMarketEvent("bet-settle", "Crack bet settled as win", {
        assetId: bet.targetId,
        direction: bet.direction,
        productKey: bet.productKey,
        productName: bet.productName,
        metricKey: bet.metricKey,
        metricLabel: bet.metricLabel,
        metricType: bet.metricType,
        compare: bet.compare,
        settlementMetric,
        triggerMetric: bet.triggerMetric,
        premium: bet.premium,
        payout: bet.expectedPayout,
        expireDay: bet.expireDay,
        expirePhaseIndex: bet.expirePhaseIndex,
      });
    } else {
      bet.status = "lost";
      pushRecentSettlement(state, {
        ...bet,
        status: "lost",
        settlementMetric,
        settledDay: state.day,
        settledPhaseIndex: state.phaseIndex,
      });
      logMarketEvent("bet-settle", "Crack bet settled as loss", {
        assetId: bet.targetId,
        direction: bet.direction,
        productKey: bet.productKey,
        productName: bet.productName,
        metricKey: bet.metricKey,
        metricLabel: bet.metricLabel,
        metricType: bet.metricType,
        compare: bet.compare,
        settlementMetric,
        triggerMetric: bet.triggerMetric,
        premium: bet.premium,
        payout: 0,
        expireDay: bet.expireDay,
        expirePhaseIndex: bet.expirePhaseIndex,
      });
    }
  }

  state.bets = state.bets.filter((bet) => bet.status === "open");
}

function pushRecentSettlement(state, settlement) {
  if (!Array.isArray(state.runtime.recentSettlements)) {
    state.runtime.recentSettlements = [];
  }

  state.runtime.recentSettlements.unshift(settlement);
  if (state.runtime.recentSettlements.length > 5) {
    state.runtime.recentSettlements.length = 5;
  }
}

function settleForwardPositions(state) {
  for (const asset of Object.values(state.assets)) {
    if (!asset.forwardPositions.length) {
      continue;
    }

    const remaining = [];
    for (const position of asset.forwardPositions) {
      const isDue = comparePhasePoint(
        state.day,
        state.phaseIndex,
        position.settleDay,
        position.settlePhaseIndex,
      ) >= 0;

      if (!isDue) {
        remaining.push(position);
        continue;
      }

      const settlePrice = getSettlementSpotPrice(asset, position.contextSnapshot);
      applyCashInflow(state, settlePrice * position.quantity, "forward-settle");
      logMarketEvent("forward-settle", "Forward position settled", {
        assetId: asset.id,
        quantity: position.quantity,
        settleDay: position.settleDay,
        settlePhaseIndex: position.settlePhaseIndex,
        settlePrice,
        context: position.contextSnapshot,
      });
    }

    asset.forwardPositions = remaining;
  }
}

function getSettlementSpotPrice(asset, contextSnapshot) {
  if (!contextSnapshot || asset.board === "A") {
    return asset.spot.price;
  }

  if (asset.board === "B") {
    const layer = asset.boardState.layers[contextSnapshot.layerKey];
    return Number((asset.spot.price * (layer?.priceFactor || 1)).toFixed(3));
  }

  const pool = asset.boardState.pools.find((item) => item.id === contextSnapshot.poolId);
  const tranche = asset.boardState.tranches[contextSnapshot.trancheKey];
  const factor = (pool?.priceFactor || 1) * (tranche?.priceFactor || 1);
  return Number((asset.spot.price * factor).toFixed(3));
}

function getBetSettlementPrice(state, bet) {
  const asset = state.assets[bet.targetId];
  return getSettlementSpotPrice(asset, bet.contextSnapshot);
}

function getDirectionalSettlementMetric(state, bet) {
  const asset = state.assets[bet.targetId];
  return getDirectionalMetricSnapshot(asset, bet.direction, bet.contextSnapshot);
}

function captureTradeContext(asset) {
  if (asset.board === "B") {
    return {
      board: "B",
      layerKey: asset.boardState.selectedLayer,
    };
  }

  if (asset.board === "C") {
    return {
      board: "C",
      poolId: asset.boardState.selectedPoolId,
      trancheKey: asset.boardState.selectedTranche,
    };
  }

  return { board: "A" };
}

export function getBetTradeBlockReason(asset, direction) {
  if (asset.board !== "C") {
    return "";
  }

  const selectedPool = getSelectedDebtPool(asset);
  if (!selectedPool?.halted) {
    return "";
  }

  if (direction === "fracture") {
    return "";
  }

  return `${selectedPool.label} 当前停牌，不可开顺向产品`;
}

function usesContextualSpotBuckets(asset) {
  return asset.board === "B" || asset.board === "C";
}

function getBoardSpreadRate(asset) {
  if (asset.board === "C") return 0.01;
  if (asset.board === "B") return 0.005;
  return 0.002;
}

function getBoardFeeRate(asset) {
  if (asset.board === "C") return 0.004;
  if (asset.board === "B") return 0.0025;
  return 0.001;
}

function seedSpotBuckets(asset, holdings, avgCost) {
  if (asset.board === "B") {
    const selectedLayer = asset.boardState.selectedLayer;
    asset.boardState.layers[selectedLayer].holdings = holdings;
    asset.boardState.layers[selectedLayer].avgCost = avgCost;
    return;
  }

  if (asset.board === "C") {
    const key = getDebtBucketKey(asset.boardState.selectedPoolId, asset.boardState.selectedTranche);
    asset.boardState.positionBuckets[key] = {
      holdings,
      avgCost,
    };
  }
}

function getCurrentSpotBucket(asset) {
  if (asset.board === "B") {
    return asset.boardState.layers[asset.boardState.selectedLayer];
  }

  const bucketKey = getDebtBucketKey(asset.boardState.selectedPoolId, asset.boardState.selectedTranche);
  if (!asset.boardState.positionBuckets[bucketKey]) {
    asset.boardState.positionBuckets[bucketKey] = { holdings: 0, avgCost: 0 };
  }
  return asset.boardState.positionBuckets[bucketKey];
}

function syncSpotFromBuckets(asset) {
  if (asset.board === "B") {
    const buckets = Object.values(asset.boardState.layers);
    const totalHoldings = buckets.reduce((sum, bucket) => sum + (bucket.holdings || 0), 0);
    const totalCost = buckets.reduce((sum, bucket) => sum + (bucket.holdings || 0) * (bucket.avgCost || 0), 0);
    asset.spot.holdings = Number(totalHoldings.toFixed(3));
    asset.spot.avgCost = totalHoldings > 0 ? Number((totalCost / totalHoldings).toFixed(3)) : 0;
    return;
  }

  const buckets = Object.values(asset.boardState.positionBuckets);
  const totalHoldings = buckets.reduce((sum, bucket) => sum + (bucket.holdings || 0), 0);
  const totalCost = buckets.reduce((sum, bucket) => sum + (bucket.holdings || 0) * (bucket.avgCost || 0), 0);
  asset.spot.holdings = Number(totalHoldings.toFixed(3));
  asset.spot.avgCost = totalHoldings > 0 ? Number((totalCost / totalHoldings).toFixed(3)) : 0;
}

function getDebtBucketKey(poolId, trancheKey) {
  return `${poolId}:${trancheKey}`;
}

function getVolatility(changePctAbs, distortion) {
  const score = changePctAbs + distortion * 0.08;
  if (score > 10) return "high";
  if (score > 4) return "mid";
  return "low";
}

function buildLiquidDrivers(state) {
  const tags = [];
  if (state.indices.supply < 45) tags.push("福液供给偏紧");
  if (state.runtime.liquidDemand > 55) tags.push("教廷/贵宾层囤货");
  if (state.indices.k0 > 60) tags.push("零号风险避险买盘");
  if (state.indices.distortion > 70) tags.push("市场扭曲抬升升水");
  if (!tags.length) tags.push("供需平衡缓慢恢复");
  return tags.slice(0, 2);
}

function buildSanctuaryDrivers(state) {
  const tags = [];
  if (state.indices.sanctuary < 40) tags.push("承灾容量逼近警戒");
  if (state.runtime.churchStress > 55) tags.push("教廷接单压力上升");
  if (state.indices.k0 > 55) tags.push("主债恐慌挤压教廷");
  if (state.indices.distortion > 65) tags.push("额度挤兑预期增强");
  if (!tags.length) tags.push("唱诗班轮值恢复中");
  return tags.slice(0, 2);
}

function buildBadDebtDrivers(state) {
  const tags = [];
  if (state.indices.clearance > 70) tags.push("清算压力极高");
  if (state.runtime.poolRecoveryStreet < 35) tags.push("下街回收率下调");
  if (state.indices.distortion > 70) tags.push("坏账市场泡沫化");
  if (state.indices.k0 > 60) tags.push("K0 恐慌压低坏账估值");
  if (!tags.length) tags.push("催收与承保暂时平衡");
  return tags.slice(0, 2);
}

function getSpotSmallLot(assetId) {
  if (assetId === "liquid") return 10;
  if (assetId === "sanctuary") return 1;
  return 20;
}

function getBoardPriceFactor(asset) {
  if (asset.board === "B") {
    const layer = asset.boardState.layers?.[asset.boardState.selectedLayer];
    return layer?.priceFactor || 1;
  }

  if (asset.board === "C") {
    const pool = getSelectedDebtPool(asset);
    const tranche = asset.boardState.tranches?.[asset.boardState.selectedTranche];
    return (pool?.priceFactor || 1) * (tranche?.priceFactor || 1);
  }

  return 1;
}

function getSelectedDebtPool(asset) {
  return asset.boardState.pools?.find((pool) => pool.id === asset.boardState.selectedPoolId) || asset.boardState.pools?.[0];
}
