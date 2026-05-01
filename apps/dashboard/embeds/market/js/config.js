export const PHASES = [
  { key: "morning", name: "晨相" },
  { key: "day", name: "昼相" },
  { key: "dusk", name: "暮相" },
  { key: "night", name: "夜相" },
];

export const MARKET_MODES = {
  dramatic: {
    key: "dramatic",
    shortLabel: "PRICE BREACH",
    label: "Price Breach · 裂价合约",
    allowsManualAdvance: false,
    allowsReset: false,
    allowsBlackMarket: false,
  },
  debug: {
    key: "debug",
    shortLabel: "DEBUG",
    label: "调试模式",
    allowsManualAdvance: true,
    allowsReset: true,
    allowsBlackMarket: true,
  },
};

export const DEFAULT_MARKET_MODE = "debug";
export const MARKET_FIXED_SEED = "price-breach-seed-b";

let activeMarketSeed = MARKET_FIXED_SEED;
let activeMarketRng = createSeededRng(activeMarketSeed);

export const ECONOMY_TIERS = {
  1: {
    key: "early",
    label: "前期",
    cashRange: [340, 440],
    creditLimitMultiplier: 1,
    tradeLotMultiplier: 1,
    forwardContractMultiplier: 1,
    betMaxSize: 5,
    betPremiumScale: 1,
  },
  2: {
    key: "mid",
    label: "中期",
    cashRange: [3400, 4400],
    creditLimitMultiplier: 8,
    tradeLotMultiplier: 5,
    forwardContractMultiplier: 5,
    betMaxSize: 25,
    betPremiumScale: 5,
  },
  3: {
    key: "late",
    label: "后期",
    cashRange: [34000, 44000],
    creditLimitMultiplier: 50,
    tradeLotMultiplier: 20,
    forwardContractMultiplier: 20,
    betMaxSize: 100,
    betPremiumScale: 20,
  },
};

export const ASSET_META = {
  liquid: {
    id: "liquid",
    name: "福液",
    code: "LIQUID",
    unit: "LU",
    kind: "resource",
    basePrice: 1.0,
    range: { min: 0.6, max: 2.8 },
    board: "A",
    boardName: "福液板",
    tradeLabels: {
      spotBuy: "买入现货",
      spotSell: "卖出现货",
      fwd1: "锁定次相交割",
      fwd2: "锁定次日交割",
      align: "押顺交割",
      fracture: "押裂贴水",
    },
  },
  sanctuary: {
    id: "sanctuary",
    name: "承灾",
    code: "SANCTUARY",
    unit: "份",
    kind: "capacity",
    basePrice: 2.0,
    range: { min: 1.2, max: 6.0 },
    board: "B",
    boardName: "承灾板",
    tradeLabels: {
      spotBuy: "承接额度",
      spotSell: "转让额度",
      fwd1: "锁定次相承保",
      fwd2: "锁定次日承保",
      align: "押顺费率",
      fracture: "押裂容量",
    },
  },
  badDebtStreet: {
    id: "badDebtStreet",
    name: "坏账",
    code: "BAD-DEBT/STREET",
    unit: "份额",
    kind: "debt",
    basePrice: 0.5,
    range: { min: 0.08, max: 0.95 },
    board: "C",
    boardName: "坏账板",
    tradeLabels: {
      spotBuy: "买入层份额",
      spotSell: "卖出层份额",
      fwd1: "锁定次相报价",
      fwd2: "锁定次日报价",
      align: "押顺回收",
      fracture: "押裂违约",
    },
  },
};

export const DIRECTIONAL_PRODUCT_META = {
  A: {
    align: {
      productKey: "delivery_up",
      displayName: "顺势交割",
      shortLabel: "押顺交割",
      subtitle: "围绕当前交割价语境结算",
      metricKey: "deliveryPrice",
      metricLabel: "DELIVERY",
      compare: "gte",
      unitType: "price",
    },
    fracture: {
      productKey: "basis_crack",
      displayName: "贴水裂价",
      shortLabel: "押裂贴水",
      subtitle: "押注交割价回落或贴水裂开",
      metricKey: "deliveryPrice",
      metricLabel: "DELIVERY",
      compare: "lte",
      unitType: "price",
    },
  },
  B: {
    align: {
      productKey: "fee_spike",
      displayName: "费率上冲",
      shortLabel: "押顺费率",
      subtitle: "围绕当前承接费率语境结算",
      metricKey: "feePrice",
      metricLabel: "FEE_RATE",
      compare: "gte",
      unitType: "price",
    },
    fracture: {
      productKey: "capacity_crack",
      displayName: "容量裂解",
      shortLabel: "押裂容量",
      subtitle: "押注承灾容量继续塌缩",
      metricKey: "capacityAvailable",
      metricLabel: "CAPACITY",
      compare: "lte",
      unitType: "capacity",
    },
  },
  C: {
    align: {
      productKey: "recovery_rebound",
      displayName: "回收修复",
      shortLabel: "押顺回收",
      subtitle: "围绕当前池层估值修复结算",
      metricKey: "contextPrice",
      metricLabel: "CTX_PRICE",
      compare: "gte",
      unitType: "price",
    },
    fracture: {
      productKey: "default_widen",
      displayName: "违约扩散",
      shortLabel: "押裂违约",
      subtitle: "押注回收率继续恶化或违约扩散",
      metricKey: "recoveryRate",
      metricLabel: "RECOVERY",
      compare: "lte",
      unitType: "ratio",
    },
  },
};

export function getAssetBoard(assetId) {
  return ASSET_META[assetId]?.board || "A";
}

export function getEconomyTier(level = 1) {
  return ECONOMY_TIERS[level] || ECONOMY_TIERS[1];
}

export function getTradeLabels(assetId) {
  return ASSET_META[assetId]?.tradeLabels || {
    spotBuy: "买入",
    spotSell: "卖出",
    fwd1: "锁定 F+1",
    fwd2: "锁定 F+2",
    align: "执行押顺",
    fracture: "执行押裂",
  };
}

export function getDirectionalProductMeta(board, direction) {
  return DIRECTIONAL_PRODUCT_META[board]?.[direction] || DIRECTIONAL_PRODUCT_META.A.align;
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function getMarketModeConfig(mode = DEFAULT_MARKET_MODE) {
  return MARKET_MODES[mode] || MARKET_MODES[DEFAULT_MARKET_MODE];
}

export function normalizeSeed(seed) {
  if (typeof seed !== "string") {
    return MARKET_FIXED_SEED;
  }

  const normalized = seed.trim();
  return normalized || MARKET_FIXED_SEED;
}

export function hashSeed(seed) {
  const normalized = normalizeSeed(seed);
  let hash = 2166136261;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function formatSeedHash(seed) {
  return `0x${hashSeed(seed).toString(16).toUpperCase().padStart(8, "0")}`;
}

export function createSeededRng(seed) {
  let state = hashSeed(seed) || 0x6d2b79f5;
  return function nextRandom() {
    state += 0x6d2b79f5;
    let result = state;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

export function deriveScopedSeed(baseSeed, scope) {
  const normalizedBase = normalizeSeed(baseSeed);
  const normalizedScope = typeof scope === "string" ? scope.trim() : "";
  return normalizedScope ? `${normalizedBase}::${normalizedScope}` : normalizedBase;
}

export function resetMarketRandom(seed = MARKET_FIXED_SEED) {
  activeMarketSeed = normalizeSeed(seed);
  activeMarketRng = createSeededRng(activeMarketSeed);
  return activeMarketSeed;
}

export function getMarketRandomSeed() {
  return activeMarketSeed;
}

export function rand(min, max) {
  return activeMarketRng() * (max - min) + min;
}

export function chance(probability) {
  return rand(0, 1) < clamp(Number(probability) || 0, 0, 1);
}

export function fmtPrice(value) {
  return Number(value).toFixed(3);
}

export function fmtPct(value) {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

export function fmtDiff(value) {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(3)}`;
}

export function fmtDay(day) {
  return `D${String(day).padStart(2, "0")}`;
}

export function getPhaseName(index) {
  return PHASES[index]?.name || "未知相";
}

export function getNextPhase(day, phaseIndex, offset = 1) {
  let nextDay = day;
  let nextPhaseIndex = phaseIndex;

  for (let index = 0; index < offset; index += 1) {
    nextPhaseIndex += 1;
    if (nextPhaseIndex >= 4) {
      nextPhaseIndex = 0;
      nextDay += 1;
    }
  }

  return {
    day: nextDay,
    phaseIndex: nextPhaseIndex,
    phaseName: getPhaseName(nextPhaseIndex),
  };
}

export function getPrevPhase(day, phaseIndex, offset = 1) {
  let prevDay = day;
  let prevPhaseIndex = phaseIndex;

  for (let index = 0; index < offset; index += 1) {
    prevPhaseIndex -= 1;
    if (prevPhaseIndex < 0) {
      prevPhaseIndex = 3;
      prevDay -= 1;
    }
  }

  return {
    day: prevDay,
    phaseIndex: prevPhaseIndex,
    phaseName: getPhaseName(prevPhaseIndex),
  };
}

export function comparePhasePoint(aDay, aPhase, bDay, bPhase) {
  return aDay * 4 + aPhase - (bDay * 4 + bPhase);
}

export function cryptoRandomId() {
  try {
    if (window.crypto?.randomUUID) {
      return window.crypto.randomUUID();
    }
  } catch (_) {
    // Fallback below.
  }

  return `id_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

export function getAccentColor(assetId) {
  if (assetId === "liquid") return "#3aebc8";
  if (assetId === "sanctuary") return "#d4af37";
  return "#8b3a3a";
}
