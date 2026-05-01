import {
  buyForward,
  buySpot,
  getMaxForwardOrderCount,
  openBet,
  lockFacility,
  getMaxSpotOrderLotCount,
  previewLeveragedTrade,
  sellSpotAll,
  sellSpot,
  snapLeverage,
  advancePhase,
  getMaxLeverageForAsset,
  refreshCreditState,
  refreshZeroState,
  unlockFacility,
} from "./engine.js";
import { getMarketModeConfig } from "./config.js";
import { initGlobalLogHandlers, logMarketEvent } from "./logger.js";
import { getState, resetState } from "./state.js";
import { bindEvents, createChartRenderer, renderAll } from "./ui.js";

const chart = createChartRenderer(getState);

function getSelectedAsset() {
  return getState().assets[getState().selectedAssetId];
}

function fitTerminalToViewport() {
  const viewport = document.getElementById("terminal-viewport");
  const terminal = document.getElementById("terminal-container");
  const designWidth = 1440;
  const designHeight = 900;
  const horizontalSafeArea = 32;
  const verticalSafeArea = 72;
  const availableWidth = Math.max(window.innerWidth - horizontalSafeArea, 320);
  const availableHeight = Math.max(window.innerHeight - verticalSafeArea, 320);
  const scale = Math.min(availableWidth / designWidth, availableHeight / designHeight, 1);

  viewport.style.width = `${Math.floor(designWidth * scale)}px`;
  viewport.style.height = `${Math.floor(designHeight * scale)}px`;
  terminal.style.transform = `scale(${scale})`;
  terminal.style.transformOrigin = "top left";
}

function rerender() {
  renderAll(getState());
  chart.draw();
}

function isDramaticMode(state = getState()) {
  return getMarketModeConfig(state.settings?.marketMode).key === "dramatic";
}

function syncSidebarToggleUi() {
  const terminal = document.getElementById("terminal-container");
  const button = document.getElementById("btn-toggle-sidebar");
  const glyph = document.getElementById("sidebar-toggle-glyph");
  const isCollapsed = terminal.classList.contains("sidebar-collapsed");
  glyph.innerHTML = isCollapsed ? "&rsaquo;&rsaquo;" : "&lsaquo;&lsaquo;";
  button.setAttribute("aria-label", isCollapsed ? "展开左侧标的栏" : "折叠左侧标的栏");
  button.title = isCollapsed ? "展开左侧标的栏" : "折叠左侧标的栏";
}

function syncTopPanelToggleUi() {
  const terminal = document.getElementById("terminal-container");
  const button = document.getElementById("btn-toggle-top-panel");
  const glyph = document.getElementById("top-panel-toggle-glyph");
  const isCollapsed = terminal.classList.contains("top-panel-collapsed");
  glyph.innerHTML = isCollapsed ? "&darr;" : "&uarr;";
  button.setAttribute("aria-label", isCollapsed ? "展开顶部板块面板" : "折叠顶部板块面板");
  button.title = isCollapsed ? "展开顶部板块面板" : "折叠顶部板块面板";
}

function handleSellSpotAll() {
  logMarketEvent("action-spot-close-all", "Player clicked close-all sell", {
    assetId: getSelectedAsset().id,
  });
  sellSpotAll(getState(), getSelectedAsset());
  rerender();
}

function handleOpenSpotOrder(side) {
  const draft = getState().runtime.orderDraft;
  getState().runtime.betDraft.open = false;
  draft.open = true;
  draft.market = "spot";
  draft.side = side;
  draft.offsetIndex = 0;
  draft.lotCount = 1;
  logMarketEvent(side === "buy" ? "action-spot-buy" : "action-spot-sell", "Player opened spot order ticket", {
    assetId: getSelectedAsset().id,
    side,
    leverage: getState().tradePrefs.leverage,
  });
  rerender();
}

function handleOpenForwardOrder(offsetIndex) {
  const draft = getState().runtime.orderDraft;
  getState().runtime.betDraft.open = false;
  draft.open = true;
  draft.market = "forward";
  draft.side = "buy";
  draft.offsetIndex = offsetIndex;
  draft.lotCount = 1;
  logMarketEvent("action-forward-buy", "Player opened forward order ticket", {
    assetId: getSelectedAsset().id,
    offsetIndex,
  });
  rerender();
}

function handleCloseOrderDraft() {
  getState().runtime.orderDraft.open = false;
  rerender();
}

function handleChangeOrderLotCount(value) {
  getState().runtime.orderDraft.lotCount = Math.max(1, Math.floor(Number(value) || 1));
  rerender();
}

function handleOrderSetPreset(preset) {
  const state = getState();
  const draft = state.runtime.orderDraft;
  const asset = getSelectedAsset();
  if (!draft?.open) {
    return;
  }

  let nextCount = 1;
  if (preset === "max") {
    nextCount = draft.market === "forward"
      ? getMaxForwardOrderCount(state, asset, draft.offsetIndex)
      : getMaxSpotOrderLotCount(state, asset, draft.side);
  } else {
    nextCount = Math.max(1, Math.floor(Number(preset) || 1));
  }

  draft.lotCount = Math.max(1, nextCount);
  rerender();
}

function handleConfirmOrderDraft() {
  const state = getState();
  const draft = state.runtime.orderDraft;
  const asset = getSelectedAsset();
  let didExecute = false;

  if (draft.market === "forward") {
    didExecute = buyForward(state, asset, draft.offsetIndex, draft.lotCount);
  } else if (draft.side === "sell") {
    didExecute = sellSpot(state, asset, { lotCount: draft.lotCount });
  } else {
    didExecute = buySpot(state, asset, { lotCount: draft.lotCount });
  }

  if (didExecute) {
    draft.open = false;
  }

  rerender();
}

function handleOpenBet(direction) {
  getState().runtime.orderDraft.open = false;
  getState().runtime.betDraft.open = true;
  getState().runtime.betDraft.direction = direction;
  getState().runtime.betDraft.size = getState().runtime.betDraft.size || 1;
  getState().runtime.betDraft.strikeKey = getState().runtime.betDraft.strikeKey || "standard";
  logMarketEvent("action-bet-draft-open", "Player opened crack bet confirm panel", {
    assetId: getSelectedAsset().id,
    direction,
  });
  rerender();
}

function handleCloseBetDraft() {
  getState().runtime.betDraft.open = false;
  rerender();
}

function handleConfirmBetDraft() {
  const draft = getState().runtime.betDraft;
  logMarketEvent("action-bet-open", "Player confirmed crack bet", {
    assetId: getSelectedAsset().id,
    direction: draft.direction,
    size: draft.size,
    strikeKey: draft.strikeKey,
  });

  const didOpen = openBet(getState(), getSelectedAsset(), draft.direction, {
    size: draft.size,
    strikeKey: draft.strikeKey,
  });

  if (didOpen) {
    draft.open = false;
  }

  rerender();
}

function handleAdvancePhase() {
  if (isDramaticMode()) {
    return;
  }
  logMarketEvent("action-phase-advance", "Player advanced market phase", {
    day: getState().day,
    phaseIndex: getState().phaseIndex,
  });
  advancePhase(getState());
  rerender();
}

function handleReset() {
  if (isDramaticMode()) {
    return;
  }
  logMarketEvent("action-reset", "Player reset market state");
  resetState();
  refreshZeroState(getState());
  refreshCreditState(getState());
  fitTerminalToViewport();
  chart.resize();
  rerender();
}

function handleSelectAsset(assetId) {
  getState().selectedAssetId = assetId;
  getState().chart.offset = 0;
  getState().runtime.betDraft.open = false;
  getState().runtime.orderDraft.open = false;
  if (getState().tradePrefs.blackMarketMode) {
    getState().tradePrefs.leverage = getMaxLeverageForAsset(getState(), getSelectedAsset());
  }
  logMarketEvent("action-select-asset", "Player selected asset", { assetId });
  rerender();
}

function handleSelectSanctuaryLayer(layerKey) {
  const asset = getSelectedAsset();
  if (asset.board !== "B" || !asset.boardState.layers[layerKey]) {
    return;
  }

  asset.boardState.selectedLayer = layerKey;
  if (getState().tradePrefs.blackMarketMode) {
    getState().tradePrefs.leverage = getMaxLeverageForAsset(getState(), asset);
  }
  logMarketEvent("action-select-layer", "Player changed sanctuary layer", {
    assetId: asset.id,
    layerKey,
  });
  rerender();
}

function handleSelectDebtPool(poolId) {
  const asset = getSelectedAsset();
  if (asset.board !== "C") {
    return;
  }

  const nextPool = asset.boardState.pools.find((pool) => pool.id === poolId);
  if (!nextPool) {
    return;
  }

  asset.boardState.selectedPoolId = poolId;
  if (getState().tradePrefs.blackMarketMode) {
    getState().tradePrefs.leverage = getMaxLeverageForAsset(getState(), asset);
  }
  logMarketEvent("action-select-pool", "Player changed debt pool", {
    assetId: asset.id,
    poolId,
  });
  rerender();
}

function handleSelectDebtTranche(trancheKey) {
  const asset = getSelectedAsset();
  if (asset.board !== "C" || !asset.boardState.tranches[trancheKey]) {
    return;
  }

  asset.boardState.selectedTranche = trancheKey;
  if (getState().tradePrefs.blackMarketMode) {
    getState().tradePrefs.leverage = getMaxLeverageForAsset(getState(), asset);
  }
  logMarketEvent("action-select-tranche", "Player changed debt tranche", {
    assetId: asset.id,
    trancheKey,
  });
  rerender();
}

function handleToggleSidebar() {
  const terminal = document.getElementById("terminal-container");
  terminal.classList.toggle("sidebar-collapsed");
  syncSidebarToggleUi();
  chart.resize();
  chart.draw();
}

function handleToggleTopPanel() {
  const terminal = document.getElementById("terminal-container");
  terminal.classList.toggle("top-panel-collapsed");
  syncTopPanelToggleUi();
  chart.resize();
  chart.draw();
}

function handleSelectRightDetailTab(tabKey) {
  if (tabKey !== "zero" && tabKey !== "credit") {
    return;
  }

  getState().runtime.rightDetailTab = tabKey;
  logMarketEvent("action-detail-tab", "Player switched right detail tab", { tabKey });
  rerender();
}

function handleChangeLeverage(value) {
  const state = getState();
  const asset = getSelectedAsset();
  const preview = previewLeveragedTrade(state, asset);
  getState().tradePrefs.leverage = snapLeverage(
    Number(value),
    state.tradePrefs.leverageMin || 1,
    getMaxLeverageForAsset(state, asset),
    preview.step,
  );
  logMarketEvent("action-leverage", "Player adjusted leverage slider", {
    value: getState().tradePrefs.leverage,
    assetId: asset.id,
  });
  rerender();
}

function handleToggleBlackMarketMode() {
  if (isDramaticMode()) {
    return;
  }
  const nextMode = !getState().tradePrefs.blackMarketMode;
  getState().tradePrefs.blackMarketMode = nextMode;
  if (nextMode) {
    getState().tradePrefs.leverage = getMaxLeverageForAsset(getState(), getSelectedAsset());
  } else {
    getState().tradePrefs.leverage = Math.min(
      getState().tradePrefs.leverage,
      getMaxLeverageForAsset(getState(), getSelectedAsset()),
    );
  }
  logMarketEvent("action-black-market-mode", "Player toggled black market mode", {
    blackMarketMode: nextMode,
    leverage: getState().tradePrefs.leverage,
    assetId: getSelectedAsset().id,
  });
  rerender();
}

function handleToggleFacilityLock(facilityId) {
  const facility = getState().credit.facilities.find((item) => item.id === facilityId);
  if (!facility) {
    return;
  }

  const nextLocked = !facility.locked;
  const didChange = facility.locked
    ? unlockFacility(getState(), facilityId)
    : lockFacility(getState(), facilityId);
  if (!didChange) {
    return;
  }

  logMarketEvent("action-credit-facility-toggle", "Player toggled credit facility lock", {
    facilityId,
    providerName: facility.providerName,
    locked: nextLocked,
  });
  rerender();
}

function handleChangeBetSize(value) {
  getState().runtime.betDraft.size = Number(value);
  rerender();
}

function handleChangeBetStrike(value) {
  if (!["tight", "standard", "wide"].includes(value)) {
    return;
  }

  getState().runtime.betDraft.strikeKey = value;
  rerender();
}

function handleResize() {
  fitTerminalToViewport();
  chart.resize();
  chart.draw();
}

bindEvents({
  onOpenSpotOrder: handleOpenSpotOrder,
  onSellSpotAll: handleSellSpotAll,
  onOpenForwardOrder: handleOpenForwardOrder,
  onCloseOrderDraft: handleCloseOrderDraft,
  onChangeOrderLotCount: handleChangeOrderLotCount,
  onOrderSetPreset: handleOrderSetPreset,
  onConfirmOrderDraft: handleConfirmOrderDraft,
  onOpenBet: handleOpenBet,
  onCloseBetDraft: handleCloseBetDraft,
  onConfirmBetDraft: handleConfirmBetDraft,
  onAdvancePhase: handleAdvancePhase,
  onReset: handleReset,
  onSelectAsset: handleSelectAsset,
  onSelectLayer: handleSelectSanctuaryLayer,
  onSelectPool: handleSelectDebtPool,
  onSelectTranche: handleSelectDebtTranche,
  onSelectRightDetailTab: handleSelectRightDetailTab,
  onChangeLeverage: handleChangeLeverage,
  onToggleBlackMarketMode: handleToggleBlackMarketMode,
  onToggleFacilityLock: handleToggleFacilityLock,
  onChangeBetSize: handleChangeBetSize,
  onChangeBetStrike: handleChangeBetStrike,
  onToggleSidebar: handleToggleSidebar,
  onToggleTopPanel: handleToggleTopPanel,
  onResize: handleResize,
});

fitTerminalToViewport();
chart.resize();
chart.bind();
initGlobalLogHandlers();
refreshZeroState(getState());
syncSidebarToggleUi();
syncTopPanelToggleUi();
logMarketEvent("session-start", "Market terminal session started", {
  day: getState().day,
  phaseIndex: getState().phaseIndex,
});
rerender();
