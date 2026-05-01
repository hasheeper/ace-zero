import {
  DEFAULT_MARKET_MODE,
  MARKET_FIXED_SEED,
  deriveScopedSeed,
  getEconomyTier,
  getMarketModeConfig,
  rand,
  resetMarketRandom,
} from "./config.js";
import { bootstrapAssets, createAssetState, refreshCreditState } from "./engine.js";

let state = createInitialState();
window.marketState = state;

export function getState() {
  return state;
}

export function resetState() {
  state = createInitialState();
  window.marketState = state;
  return state;
}

function createInitialState() {
  const marketMode = DEFAULT_MARKET_MODE;
  const marketModeConfig = getMarketModeConfig(marketMode);
  const fixedSeed = MARKET_FIXED_SEED;
  const runtimeSeed = deriveScopedSeed(fixedSeed, "bootstrap");
  resetMarketRandom(runtimeSeed);
  const economyLevel = 1;
  const openingCash = sampleOpeningCash(economyLevel);
  const initialState = {
    day: 6,
    phaseIndex: 2,
    tick: 26,
    selectedAssetId: "liquid",
    settings: {
      marketMode,
      dramaticMode: marketMode === "dramatic",
      debugMode: marketMode === "debug",
      fixedSeed,
      runtimeSeed,
      modeLabel: marketModeConfig.label,
    },
    economy: {
      level: economyLevel,
    },
    display: {
      compactNumbers: true,
      numberStyle: "en-compact",
    },
    chart: {
      visibleCount: 32,
      offset: 0,
    },
    wallet: {
      cash: openingCash,
    },
    tradePrefs: {
      leverage: 1,
      leverageMin: 1,
      leverageStep: 0.5,
      leverageMaxGlobal: 20,
      blackMarketMode: marketModeConfig.allowsBlackMarket ? false : false,
    },
    indices: {
      supply: Number((55 + rand(-2.5, 2.5)).toFixed(1)),
      sanctuary: Number((38.2 + rand(-2.2, 2.2)).toFixed(1)),
      clearance: Number((84.5 + rand(-2.8, 2.8)).toFixed(1)),
      k0: Number((64 + rand(-2.4, 2.4)).toFixed(1)),
      distortion: Number((72.1 + rand(-2.6, 2.6)).toFixed(1)),
    },
    runtime: {
      liquidDemand: Number(rand(30, 38).toFixed(1)),
      churchStress: Number(rand(54, 62).toFixed(1)),
      poolRecoveryStreet: Number(rand(22, 30).toFixed(1)),
      rightDetailTab: "zero",
      recentSettlements: [],
      betDraft: {
        open: false,
        direction: "align",
        size: 1,
        strikeKey: "standard",
      },
      orderDraft: {
        open: false,
        market: "spot",
        side: "buy",
        offsetIndex: 0,
        lotCount: 1,
      },
    },
    credit: {
      totalLimit: 0,
      used: 0,
      available: 0,
      accruedCost: 0,
      lastPhaseCost: 0,
      lastRepayment: 0,
      marginRatio: 0.25,
      warningRatio: 0.85,
      liquidationRatio: 0.95,
      primaryFacilityId: "vv_prime",
      facilities: [
        {
          id: "vv_prime",
          provider: "vv",
          providerName: "V.V.资管部",
          kind: "general",
          limit: 4800,
          used: 0,
          rate: 0.03,
          carryFactor: 0.08,
          priority: 2,
          locked: false,
          accruedCost: 0,
          lastPhaseCost: 0,
          unlockKey: "vv_credit_1",
          note: "可自由调配的资管授信池",
        },
        {
          id: "church_sanctuary",
          provider: "church",
          providerName: "教廷承灾调配池",
          kind: "sanctuary",
          limit: 80,
          used: 0,
          rate: 0.02,
          carryFactor: 0.05,
          priority: 1,
          locked: false,
          accruedCost: 0,
          lastPhaseCost: 0,
          unlockKey: "church_credit_1",
          note: "仅可用于承灾板",
        },
        {
          id: "kuzuha_greyline",
          provider: "kuzuha",
          providerName: "久叶灰市周转线",
          kind: "debt",
          limit: 60,
          used: 0,
          rate: 0.05,
          carryFactor: 0.18,
          priority: 3,
          locked: false,
          accruedCost: 0,
          lastPhaseCost: 0,
          unlockKey: "kuzuha_credit_1",
          note: "仅可用于坏账板，风险较高",
        },
      ],
    },
    assets: {
      liquid: createAssetState("liquid", 1.185, 0, 0),
      sanctuary: createAssetState("sanctuary", 3.402, 0, 0),
      badDebtStreet: createAssetState("badDebtStreet", 0.428, 0, 0),
    },
    bets: [],
    zero: {
      debtFaceValue: 395000000,
      debtState: "suspended",
      binder: {
        faction: "vv",
        name: "V.V. (资管部)",
        level: 2,
      },
      cutRate: 0.3,
      exclusivity: 2,
      guardValue: 8,
      breakCost: 25,
      k0Shift: 10,
      subRights: [],
    },
  };

  bootstrapAssets(initialState);
  refreshCreditState(initialState);
  return initialState;
}

function sampleOpeningCash(level = 1) {
  const tier = getEconomyTier(level);
  const [min, max] = tier.cashRange || [340, 440];
  const value = rand(min, max);
  return Number(value.toFixed(1));
}
