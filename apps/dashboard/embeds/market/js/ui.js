import {
  clamp,
  fmtDay,
  fmtDiff,
  fmtPct,
  fmtPrice,
  formatSeedHash,
  getDirectionalProductMeta,
  getMarketModeConfig,
  getTradeLabels,
  getAccentColor,
  getNextPhase,
  getPhaseName,
} from "./config.js";
import {
  formatDirectionalMetric,
  getAssetTradeBlockReason,
  getBetTradeBlockReason,
  getBlackMarketLeverageCap,
  getMaxForwardOrderCount,
  isBlackMarketMode,
  getContextualForwardPrice,
  getContextualSpotPrice,
  getMaxBetSize,
  getMaxLeverageForAsset,
  getMaxSpotOrderLotCount,
  getSpotPositionSnapshot,
  previewBetTrade,
  previewForwardTrade,
  previewLeveragedTrade,
  previewSpotTrade,
  snapLeverage,
} from "./engine.js";
import {
  formatCompactNumber,
  formatFullNumber,
  formatMoney,
  formatUnits,
} from "./formatter.js";

const CHART_MIN_VISIBLE = 8;
const CHART_MAX_VISIBLE = 192;

export function renderAll(state) {
  renderTicker(state);
  renderAssetList(state);
  renderCenterPanel(state);
  renderBoardContext(state);
  renderOrderDraftModal(state);
  renderBets(state);
  renderBetDraftModal(state);
  renderZero(state);
  renderCredit(state);
  renderRightDetailPanel(state);
}

export function createChartRenderer(getState) {
  const canvas = document.getElementById("kline-canvas");
  const wrapper = canvas.parentElement;
  const context = canvas.getContext("2d");
  const hud = document.getElementById("crosshair-hud");
  let hoverIndex = null;
  let dragState = null;

  function resize() {
    const rect = canvas.parentElement.getBoundingClientRect();
    const style = window.getComputedStyle(canvas.parentElement);
    const horizontalPadding = parseFloat(style.paddingLeft || "0") + parseFloat(style.paddingRight || "0");
    const verticalPadding = parseFloat(style.paddingTop || "0") + parseFloat(style.paddingBottom || "0");
    canvas.width = Math.max(Math.floor(rect.width - horizontalPadding), 120);
    canvas.height = Math.max(Math.floor(rect.height - verticalPadding), 120);
  }

  function draw() {
    const state = getState();
    const asset = getSelectedAsset(state);
    const data = getChartData(state);
    if (!data.length) {
      return;
    }

    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    const topHeight = canvasHeight * 0.7;
    const volumeHeight = canvasHeight * 0.2;
    const bottomPad = canvasHeight - topHeight - volumeHeight;

    context.clearRect(0, 0, canvasWidth, canvasHeight);

    const backgroundGradient = context.createRadialGradient(
      canvasWidth / 2,
      topHeight / 2,
      0,
      canvasWidth / 2,
      topHeight / 2,
      canvasWidth,
    );
    backgroundGradient.addColorStop(0, "rgba(58, 235, 200, 0.02)");
    backgroundGradient.addColorStop(1, "rgba(0, 0, 0, 0)");
    context.fillStyle = backgroundGradient;
    context.fillRect(0, 0, canvasWidth, canvasHeight);

    const minPrice = Math.min(...data.map((point) => point.l)) * 0.98;
    const maxPrice = Math.max(...data.map((point) => point.h)) * 1.02;
    const maxVolume = Math.max(...data.map((point) => point.v));
    const minVolume = Math.min(...data.map((point) => point.v));
    const volumeSpan = Math.max(maxVolume - minVolume, 1);
    const span = maxPrice - minPrice || 1;
    const spacing = canvasWidth / data.length;
    const coreWidth = spacing * 0.4;
    const clampWidth = spacing * 0.6;
    const positiveColor = asset.id === "sanctuary" ? "#d4af37" : "#3aebc8";
    const negativeColor = "#8b3a3a";

    context.strokeStyle = "rgba(179, 156, 104, 0.15)";
    context.lineWidth = 1;
    context.setLineDash([2, 4]);
    for (let yIndex = 1; yIndex < 4; yIndex += 1) {
      const y = topHeight * (yIndex / 4);
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(canvasWidth, y);
      context.stroke();
    }
    context.setLineDash([]);

    const seenDays = new Set();
    const dayLabelInterval = getDayLabelInterval(state.chart.visibleCount || data.length);
    const firstVisibleDay = data[0]?.day ?? 0;
    for (let index = 0; index < data.length; index += 1) {
      const point = data[index];
      const x = index * spacing;

      if (seenDays.has(point.day)) {
        continue;
      }

      seenDays.add(point.day);
      const shouldShowDayLabel =
        dayLabelInterval <= 1 ||
        Math.abs(point.day - firstVisibleDay) % dayLabelInterval === 0 ||
        index === data.length - 1;

      if (!shouldShowDayLabel) {
        continue;
      }

      context.strokeStyle = "rgba(179, 156, 104, 0.25)";
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, canvasHeight);
      context.stroke();

      context.fillStyle = "#7f8795";
      context.font = "10px JetBrains Mono";
      context.fillText(fmtDay(point.day), x + 4, canvasHeight - 4);
    }

    for (let index = 0; index < data.length; index += 1) {
      const point = data[index];
      const centerX = index * spacing + spacing / 2;
      const openY = topHeight - ((point.o - minPrice) / span) * topHeight;
      const closeY = topHeight - ((point.c - minPrice) / span) * topHeight;
      const highY = topHeight - ((point.h - minPrice) / span) * topHeight;
      const lowY = topHeight - ((point.l - minPrice) / span) * topHeight;
      const isUp = point.c >= point.o;
      const mainColor = isUp ? positiveColor : negativeColor;
      const topBody = Math.min(openY, closeY);
      const bottomBody = Math.max(openY, closeY);
      const midY = (openY + closeY) / 2;
      const bodySpan = Math.abs(closeY - openY);

      const lineGradient = context.createLinearGradient(0, highY, 0, lowY);
      lineGradient.addColorStop(0, "rgba(0,0,0,0)");
      lineGradient.addColorStop(0.2, mainColor);
      lineGradient.addColorStop(0.8, mainColor);
      lineGradient.addColorStop(1, "rgba(0,0,0,0)");

      context.strokeStyle = lineGradient;
      context.lineWidth = 1.5;
      context.beginPath();
      context.moveTo(centerX, highY);
      context.lineTo(centerX, lowY);
      context.stroke();

      context.strokeStyle = mainColor;
      context.lineWidth = 1.5;
      context.beginPath();
      context.moveTo(centerX - clampWidth / 2, openY);
      context.lineTo(centerX + clampWidth / 2, openY);
      context.moveTo(centerX - clampWidth / 2, closeY);
      context.lineTo(centerX + clampWidth / 2, closeY);
      context.stroke();

      context.fillStyle = isUp ? "rgba(58, 235, 200, 0.2)" : "rgba(139, 58, 58, 0.3)";
      context.beginPath();
      if (bodySpan < 1) {
        context.arc(centerX, midY, 2, 0, Math.PI * 2);
        context.fill();
      } else {
        context.moveTo(centerX, topBody);
        context.lineTo(centerX + coreWidth / 2, midY);
        context.lineTo(centerX, bottomBody);
        context.lineTo(centerX - coreWidth / 2, midY);
        context.closePath();
        context.fill();
        context.strokeStyle = isUp ? "rgba(58, 235, 200, 0.5)" : "rgba(139, 58, 58, 0.6)";
        context.stroke();
      }

      const volumeRatio = (point.v - minVolume) / volumeSpan;
      const boostedVolumeRatio = Math.pow(clamp(volumeRatio, 0, 1), 0.7);
      const volumeHeightPx = Math.max(volumeHeight * 0.18, boostedVolumeRatio * volumeHeight);
      const volumeTopY = canvasHeight - bottomPad - volumeHeightPx;
      const volumeAreaGradient = context.createLinearGradient(0, volumeTopY, 0, canvasHeight - bottomPad);
      volumeAreaGradient.addColorStop(0, isUp ? "rgba(58, 235, 200, 0.05)" : "rgba(139, 58, 58, 0.08)");
      volumeAreaGradient.addColorStop(1, isUp ? "rgba(58, 235, 200, 0)" : "rgba(139, 58, 58, 0)");
      context.fillStyle = volumeAreaGradient;
      context.fillRect(centerX - coreWidth / 2, volumeTopY, coreWidth, volumeHeightPx);

      context.strokeStyle = isUp ? "rgba(58, 235, 200, 0.3)" : "rgba(139, 58, 58, 0.4)";
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(centerX, volumeTopY);
      context.lineTo(centerX, canvasHeight - bottomPad);
      context.stroke();

      context.fillStyle = mainColor;
      context.fillRect(centerX - coreWidth / 2 + 1, volumeTopY - 1, Math.max(coreWidth - 2, 1), 2);
    }

    if (hoverIndex !== null && data[hoverIndex]) {
      const centerX = hoverIndex * spacing + spacing / 2;
      context.setLineDash([3, 4]);
      context.strokeStyle = "rgba(255,255,255,0.22)";
      context.beginPath();
      context.moveTo(centerX, 0);
      context.lineTo(centerX, canvasHeight);
      context.stroke();
      context.setLineDash([]);
    }
  }

  function bind() {
    canvas.addEventListener("mousemove", (event) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const rawX = event.clientX - rect.left;
      const rawY = event.clientY - rect.top;
      const data = getChartData(getState());

      if (!data.length) {
        return;
      }

      const spacing = canvas.width / data.length;
      hoverIndex = clamp(Math.floor((rawX * scaleX) / spacing), 0, data.length - 1);
      const point = data[hoverIndex];

      draw();
      hud.style.display = "block";
      hud.style.left = `${Math.min(rawX + 20, rect.width - 190)}px`;
      hud.style.top = `${Math.min(rawY + 20, rect.height - 180)}px`;

      document.getElementById("hud-phase").innerText = `${fmtDay(point.day)} · ${point.phaseName}`;
      document.getElementById("hud-o").innerText = fmtPrice(point.o);
      document.getElementById("hud-h").innerText = fmtPrice(point.h);
      document.getElementById("hud-l").innerText = fmtPrice(point.l);
      document.getElementById("hud-c").innerText = fmtPrice(point.c);
      document.getElementById("hud-v").innerText = point.v.toString();
      document.getElementById("hud-c").style.color =
        point.c >= point.o ? getAccentColor(getState().selectedAssetId) : "#8b3a3a";
    });

    canvas.addEventListener("mouseleave", () => {
      hoverIndex = null;
      if (!dragState) {
        hud.style.display = "none";
      }
      draw();
    });

    wrapper.addEventListener("wheel", (event) => {
      event.preventDefault();
      const direction = event.deltaY > 0 ? 1 : -1;
      zoomHistory(getState(), direction);
      draw();
      renderCenterPanel(getState());
    }, { passive: false });

    wrapper.addEventListener("dblclick", () => {
      getState().chart.offset = 0;
      draw();
      renderCenterPanel(getState());
    });

    canvas.addEventListener("mousedown", (event) => {
      dragState = {
        startX: event.clientX,
        startOffset: getState().chart.offset,
      };
      hud.style.display = "none";
    });

    window.addEventListener("mousemove", (event) => {
      if (!dragState) {
        return;
      }

      const state = getState();
      const data = getChartData(state);
      if (!data.length) {
        return;
      }

      const rect = canvas.getBoundingClientRect();
      const pixelsPerBar = Math.max(rect.width / data.length, 1);
      const deltaBars = Math.round((event.clientX - dragState.startX) / pixelsPerBar);
      state.chart.offset = dragState.startOffset + deltaBars;
      normalizeChartWindow(state);
      draw();
      renderCenterPanel(state);
    });

    window.addEventListener("mouseup", () => {
      dragState = null;
    });
  }

  return { resize, draw, bind };
}

export function bindEvents(handlers) {
  bindOptionalClick("btn-buy-spot", () => handlers.onOpenSpotOrder?.("buy"));
  bindOptionalClick("btn-sell-spot", () => handlers.onOpenSpotOrder?.("sell"));
  bindOptionalClick("btn-sell-spot-all", handlers.onSellSpotAll);
  bindOptionalClick("btn-buy-fwd1", () => handlers.onOpenForwardOrder?.(0));
  bindOptionalClick("btn-buy-fwd2", () => handlers.onOpenForwardOrder?.(1));
  bindOptionalClick("btn-open-align", () => handlers.onOpenBet("align"));
  bindOptionalClick("btn-open-fracture", () => handlers.onOpenBet("fracture"));
  bindOptionalClick("btn-order-modal-close", handlers.onCloseOrderDraft);
  bindOptionalClick("btn-order-modal-cancel", handlers.onCloseOrderDraft);
  bindOptionalClick("btn-order-modal-confirm", handlers.onConfirmOrderDraft);
  bindOptionalClick("btn-bet-modal-close", handlers.onCloseBetDraft);
  bindOptionalClick("btn-bet-modal-cancel", handlers.onCloseBetDraft);
  bindOptionalClick("btn-bet-modal-confirm", handlers.onConfirmBetDraft);
  bindOptionalClick("btn-advance-phase", handlers.onAdvancePhase);
  bindOptionalClick("btn-phase-next-inline", handlers.onAdvancePhase);
  bindOptionalClick("btn-reset", handlers.onReset);
  bindOptionalClick("btn-toggle-sidebar", handlers.onToggleSidebar);
  bindOptionalClick("btn-toggle-top-panel", handlers.onToggleTopPanel);

  document.getElementById("asset-list").addEventListener("click", (event) => {
    const row = event.target.closest("[data-asset-id]");
    if (row) {
      handlers.onSelectAsset(row.dataset.assetId);
    }
  });

  document.getElementById("board-context-panel").addEventListener("click", (event) => {
    const actionNode = event.target.closest("[data-board-action]");
    if (!actionNode) {
      return;
    }

    const action = actionNode.dataset.boardAction;
    if (action === "layer") {
      handlers.onSelectLayer?.(actionNode.dataset.layerKey);
      return;
    }

    if (action === "tranche") {
      handlers.onSelectTranche?.(actionNode.dataset.trancheKey);
    }
  });

  document.getElementById("board-context-panel").addEventListener("change", (event) => {
    const controlNode = event.target.closest("[data-board-control]");
    if (!controlNode) {
      return;
    }

    if (controlNode.dataset.boardControl === "pool") {
      handlers.onSelectPool?.(controlNode.value);
    }
  });

  document.getElementById("right-detail-tabs").addEventListener("click", (event) => {
    const tab = event.target.closest("[data-detail-tab]");
    if (!tab) {
      return;
    }

    handlers.onSelectRightDetailTab?.(tab.dataset.detailTab);
  });

  document.getElementById("leverage-slider").addEventListener("input", (event) => {
    handlers.onChangeLeverage?.(Number(event.target.value));
  });

  bindOptionalClick("btn-toggle-black-market", handlers.onToggleBlackMarketMode);

  document.getElementById("credit-body").addEventListener("click", (event) => {
    const toggle = event.target.closest("[data-credit-facility-toggle]");
    if (!toggle) {
      return;
    }

    handlers.onToggleFacilityLock?.(toggle.dataset.creditFacilityToggle);
  });

  document.getElementById("bet-size-slider").addEventListener("input", (event) => {
    handlers.onChangeBetSize?.(Number(event.target.value));
  });

  document.getElementById("order-lot-input").addEventListener("input", (event) => {
    handlers.onChangeOrderLotCount?.(Number(event.target.value));
  });

  document.getElementById("order-preset-group").addEventListener("click", (event) => {
    const chip = event.target.closest("[data-order-preset]");
    if (!chip) {
      return;
    }

    handlers.onOrderSetPreset?.(chip.dataset.orderPreset);
  });

  document.getElementById("bet-strike-group").addEventListener("click", (event) => {
    const chip = event.target.closest("[data-bet-strike]");
    if (!chip) {
      return;
    }

    handlers.onChangeBetStrike?.(chip.dataset.betStrike);
  });

  document.getElementById("bet-modal-backdrop").addEventListener("click", () => {
    handlers.onCloseBetDraft?.();
  });

  document.getElementById("order-modal-backdrop").addEventListener("click", () => {
    handlers.onCloseOrderDraft?.();
  });

  window.addEventListener("resize", handlers.onResize);
}

function bindOptionalClick(id, handler) {
  const node = document.getElementById(id);
  if (!node || !handler) {
    return;
  }

  node.addEventListener("click", handler);
}

function renderTicker(state) {
  const next = getNextPhase(state.day, state.phaseIndex, 1);
  const marketModeConfig = getMarketModeConfig(state.settings?.marketMode);
  const blackMarketMode = marketModeConfig.allowsBlackMarket && isBlackMarketMode(state);
  const toggleButton = document.getElementById("btn-toggle-black-market");
  const toggleLabel = document.getElementById("black-market-toggle-label");
  const actionGroup = document.getElementById("ticker-action-group");
  const terminal = document.getElementById("terminal-container");

  terminal.classList.toggle("dramatic-mode", marketModeConfig.key === "dramatic");
  terminal.classList.toggle("black-market-mode", blackMarketMode);
  if (toggleButton && toggleLabel) {
    toggleButton.classList.toggle("is-active", blackMarketMode);
    toggleLabel.textContent = blackMarketMode ? "退出黑市" : "开启黑市";
  }
  if (actionGroup) {
    const shouldShowActionGroup = marketModeConfig.allowsManualAdvance
      || marketModeConfig.allowsReset
      || marketModeConfig.allowsBlackMarket;
    actionGroup.hidden = !shouldShowActionGroup;
    actionGroup.style.display = shouldShowActionGroup ? "flex" : "none";
  }

  document.getElementById("tk-day").textContent = fmtDay(state.day);
  document.getElementById("tk-phase").textContent = getPhaseName(state.phaseIndex);
  document.getElementById("tk-next").textContent = next.phaseName;
  document.getElementById("tk-supply").textContent = state.indices.supply.toFixed(1);
  document.getElementById("tk-sanctuary").textContent = state.indices.sanctuary.toFixed(1);
  document.getElementById("tk-clearance").textContent = state.indices.clearance.toFixed(1);
  document.getElementById("tk-k0").textContent = state.indices.k0.toFixed(1);
  document.getElementById("tk-distortion").textContent = state.indices.distortion.toFixed(1);
  setMoneyText(document.getElementById("tk-cash"), state, state.wallet.cash, { digits: 2 });
  setMoneyText(document.getElementById("tk-credit-available"), state, state.credit.available, { digits: 2 });
  setNumberText(document.getElementById("tk-credit-used"), state.credit.used, { compact: shouldCompactNumbers(state), digits: 2 });
  const modeNode = document.getElementById("tk-market-mode");
  modeNode.textContent = marketModeConfig.shortLabel;
  modeNode.title = marketModeConfig.label;
  const seedNode = document.getElementById("tk-market-seed");
  if (seedNode) {
    const seedHash = formatSeedHash(state.settings?.fixedSeed || "N/A");
    bindSeedHashReveal(seedNode, seedHash);
  }
}

function bindSeedHashReveal(node, seedHash) {
  const masked = "••••••••";
  node.textContent = masked;
  node.title = `SEED HASH ${seedHash}`;
  node.onmouseenter = () => {
    node.textContent = seedHash;
  };
  node.onmouseleave = () => {
    node.textContent = masked;
  };
}

function renderAssetList(state) {
  const wrap = document.getElementById("asset-list");
  wrap.innerHTML = "";

  for (const asset of Object.values(state.assets)) {
    const row = document.createElement("div");
    row.className = `asset-item${state.selectedAssetId === asset.id ? " active" : ""}`;
    row.dataset.assetId = asset.id;
    const miniLabel = getMiniAssetLabel(asset);

    const priceClass =
      asset.id === "sanctuary" ? "color-gold" :
      asset.spot.change >= 0 ? "color-teal" :
      "color-red";
    const diffClass = asset.spot.change >= 0 ? "diff-teal" : "diff-red";

    row.innerHTML = `
      <div class="asset-info">
        <div class="asset-mini-label">${miniLabel}</div>
        <div class="asset-name">${asset.name}</div>
        <div class="asset-code">${asset.code}</div>
      </div>
      <div class="asset-data">
        <div class="asset-price ${priceClass}">${fmtPrice(asset.spot.price)}</div>
        <div class="asset-diff ${diffClass}">${fmtDiff(asset.spot.change)} (${fmtPct(asset.spot.changePct)})</div>
      </div>
    `;

    wrap.appendChild(row);
  }
}

function renderCenterPanel(state) {
  const asset = getSelectedAsset(state);
  const fwd1 = asset.forward[0];
  const contextualFwd1Price = fwd1 ? getContextualForwardPrice(asset, 0) ?? fwd1.price : null;
  const contextualSpotPrice = getContextualSpotPrice(asset);
  const positionSnapshot = getSpotPositionSnapshot(asset);
  const floatingPnl = positionSnapshot.holdings > 0
    ? Number(((contextualSpotPrice - positionSnapshot.avgCost) * positionSnapshot.holdings).toFixed(1))
    : 0;
  const blockReason = getAssetTradeBlockReason(asset);
  const tradeLabels = getTradeLabels(asset.id);
  const leveragePreview = previewLeveragedTrade(state, asset);

  document.getElementById("chart-title").textContent = asset.name;
  document.getElementById("board-badge").textContent = `${asset.board} ${asset.boardName}`;
  document.getElementById("meta-sync").textContent =
    `SYNC_LOCKED: ${fmtDay(state.day)} · ${getPhaseName(state.phaseIndex)}`;
  document.getElementById("meta-context-label").textContent = getMetaContextLabel(asset.board);
  document.getElementById("meta-context").innerHTML = getMetaContextValue(asset);
  document.getElementById("meta-driver").textContent = asset.drivers.join(" · ");
  document.getElementById("spot-exec-title").innerHTML = `
    ${getSpotExecTitle(asset.board)}
    <span class="hdr-inline-meta" id="spot-sub">${fmtDay(state.day)} <span class="hdr-time-cn">${getPhaseName(state.phaseIndex)}</span></span>
  `;
  document.getElementById("spot-price").textContent = fmtPrice(contextualSpotPrice);
  setUnitsText(document.getElementById("spot-badge"), state, positionSnapshot.holdings, asset.unit, { digits: 2 });
  document.getElementById("spot-avg-cost").textContent = positionSnapshot.holdings > 0 ? fmtPrice(positionSnapshot.avgCost) : "--";
  const spotPnl = document.getElementById("spot-pnl");
  setMoneyText(spotPnl, state, floatingPnl, { forceSign: true, digits: 2 });
  spotPnl.className = `spot-detail-value ${floatingPnl > 0 ? "is-profit" : floatingPnl < 0 ? "is-loss" : ""}`;
  document.getElementById("spot-funding-note").textContent = formatFundingNote(asset);
  document.getElementById("bet-context-subtitle").textContent = getBetContextSubtitle(asset.board);
  applyTradeLabels(asset, tradeLabels);
  renderLeveragePanel(state, asset, leveragePreview);

  if (fwd1) {
    document.getElementById("fwd1-sub").innerHTML = `${fmtDay(fwd1.day)} <span class="hdr-time-cn">${fwd1.phaseName}</span>`;
    document.getElementById("fwd1-price").textContent = fmtPrice(contextualFwd1Price);
    setUnitsText(document.getElementById("fwd1-holdings"), state, fwd1.holdings, "pos", { digits: 2 });
    const fwd1Basis = document.getElementById("fwd1-basis");
    const basis = contextualFwd1Price - contextualSpotPrice;
    fwd1Basis.textContent = `Δ ${basis >= 0 ? "+" : ""}${fmtPrice(basis)}`;
    fwd1Basis.className = `badge-bottom-right ${basis >= 0 ? "text-glow-teal" : "text-glow-red"}`;
    document.getElementById("fwd1-slot").className = `data-slot ${basis >= 0 ? "slot-teal" : "slot-red"}`;
  }
  const fwd2 = asset.forward[1];
  if (fwd2) {
    const contextualFwd2Price = getContextualForwardPrice(asset, 1) ?? fwd2.price;
    document.getElementById("fwd2-sub").innerHTML = `${fmtDay(fwd2.day)} <span class="hdr-time-cn">${fwd2.phaseName}</span>`;
    document.getElementById("fwd2-price").textContent = fmtPrice(contextualFwd2Price);
    setUnitsText(document.getElementById("fwd2-holdings"), state, fwd2.holdings, "pos", { digits: 2 });
    const fwd2Basis = document.getElementById("fwd2-basis");
    const basis = contextualFwd2Price - contextualSpotPrice;
    fwd2Basis.textContent = `Δ ${basis >= 0 ? "+" : ""}${fmtPrice(basis)}`;
    fwd2Basis.className = `badge-bottom-right ${basis >= 0 ? "text-glow-teal" : "text-glow-red"}`;
    document.getElementById("fwd2-slot").className = `data-slot ${basis >= 0 ? "slot-teal" : "slot-red"}`;
  }

  applyTradeBlockState(asset, blockReason);
  applyFundingAbilityState(state, asset, blockReason);
}

function renderBoardContext(state) {
  const asset = getSelectedAsset(state);
  const wrap = document.getElementById("board-context-panel");

  if (asset.board === "A") {
    wrap.innerHTML = `
      <div class="module-metrics-grid">
        <div class="metric-cell">
          <span class="m-label">总库存 <span class="en">TOTAL</span></span>
          <span class="m-val">${asset.boardState.inventory.total}</span>
        </div>
        <div class="metric-cell">
          <span class="m-label">可交割 <span class="en">DELIV</span></span>
          <span class="m-val">${asset.boardState.inventory.deliverable}</span>
        </div>
        <div class="metric-cell">
          <span class="m-label">近月基差 <span class="en">NEAR</span></span>
          <span class="m-val diff-up">${fmtSignedValue(asset.boardState.basis.near)}</span>
        </div>
        <div class="metric-cell">
          <span class="m-label">远月基差 <span class="en">FAR</span></span>
          <span class="m-val diff-up">${fmtSignedValue(asset.boardState.basis.far)}</span>
        </div>
      </div>
    `;
    return;
  }

  if (asset.board === "B") {
    const layerButtons = Object.entries(asset.boardState.layers)
      .map(([layerKey, layer]) => `
        <button
          class="pill-btn${asset.boardState.selectedLayer === layerKey ? " active" : ""}${layer.status === "critical" ? " is-critical" : ""}"
          type="button"
          data-board-action="layer"
          data-layer-key="${layerKey}"
        >
          <span class="pill-title">${layer.label}</span>
          <span class="pill-sub">${layer.styleLabel} / 最大${layer.leverageCap}x / 押单${layer.payoutFactor.toFixed(2)}x</span>
        </button>
      `)
      .join("");
    const selectedLayer = asset.boardState.layers[asset.boardState.selectedLayer];

    wrap.innerHTML = `
      <div class="module-metrics-grid">
        <div class="metric-cell">
          <span class="m-label">当前风格 <span class="en">STYLE</span></span>
          <span class="m-val">${selectedLayer.styleLabel}</span>
        </div>
        <div class="metric-cell">
          <span class="m-label">价格档位 <span class="en">PRICE</span></span>
          <span class="m-val">${selectedLayer.priceFactor.toFixed(2)}x</span>
        </div>
        <div class="metric-cell">
          <span class="m-label">最大杠杆 <span class="en">MAX</span></span>
          <span class="m-val">${selectedLayer.leverageCap}x</span>
        </div>
        <div class="metric-cell">
          <span class="m-label">押单收益 <span class="en">PAYOUT</span></span>
          <span class="m-val">${selectedLayer.payoutFactor.toFixed(2)}x</span>
        </div>
      </div>
      <div class="module-controls">
        <div class="control-label"><span class="en">LAYER</span><span class="cn">选择</span></div>
        <div class="action-controls layer-selector">${layerButtons}</div>
      </div>
      <div class="trade-block-notice">容量 ${asset.boardState.capacityAvailable.toFixed(1)} / 尾险 ${asset.boardState.tailRiskRate.toFixed(2)}% / ${selectedLayer.riskLabel}</div>
    `;
    return;
  }

  const selectedPool = getSelectedPool(asset);
  const selectedTranche = asset.boardState.tranches[asset.boardState.selectedTranche];
  const haltNotice = selectedPool?.halted
    ? `<div class="trade-block-notice">${selectedPool.label} 当前停牌，已锁定该池交易。</div>`
    : "";
  const poolOptions = asset.boardState.pools
    .map((pool) => `
      <option value="${pool.id}" ${pool.id === asset.boardState.selectedPoolId ? "selected" : ""}>
        ${pool.label}${pool.halted ? " [停牌]" : ""}
      </option>
    `)
    .join("");
  const trancheButtons = Object.entries(asset.boardState.tranches)
    .map(([trancheKey, tranche]) => `
      <button
        class="pill-btn${asset.boardState.selectedTranche === trancheKey ? " active" : ""}"
        type="button"
        data-board-action="tranche"
        data-tranche-key="${trancheKey}"
      >
        <span class="pill-title">${tranche.label}</span>
        <span class="pill-sub">${tranche.styleLabel} / 最大${tranche.leverageCap}x / 弹性${tranche.payoutFactor.toFixed(2)}x</span>
      </button>
    `)
    .join("");

  wrap.innerHTML = `
    <div class="module-metrics-grid">
      <div class="metric-cell">
        <span class="m-label">目标池 <span class="en">POOL</span></span>
        <span class="m-val">${selectedPool?.label || "-"}</span>
      </div>
      <div class="metric-cell">
        <span class="m-label">回收率 <span class="en">RECOV</span></span>
        <span class="m-val">${((selectedPool?.recoveryRate || 0) * 100).toFixed(1)}%</span>
      </div>
      <div class="metric-cell">
        <span class="m-label">最大杠杆 <span class="en">MAX</span></span>
        <span class="m-val">${selectedTranche.leverageCap}x</span>
      </div>
      <div class="metric-cell">
        <span class="m-label">收益弹性 <span class="en">ELASTIC</span></span>
        <span class="m-val">${selectedTranche.payoutFactor.toFixed(2)}x</span>
      </div>
    </div>
    <div class="module-controls">
      <div class="control-label"><span class="en">POOL</span><span class="cn">选择</span></div>
      <div class="action-controls">
        <label class="inline-select-block">
          <select class="select-styled" data-board-control="pool">${poolOptions}</select>
        </label>
        <div class="tranche-selector">${trancheButtons}</div>
      </div>
    </div>
    <div class="trade-block-notice">${selectedTranche.label} / ${selectedTranche.styleLabel} / 停牌池 ${asset.boardState.haltedPoolCount} 个</div>
    ${haltNotice}
  `;
}

function renderOrderDraftModal(state) {
  const shell = document.getElementById("order-modal-shell");
  const modal = document.getElementById("order-modal");
  const draft = state.runtime.orderDraft;

  if (!draft?.open) {
    shell.hidden = true;
    return;
  }

  const asset = getSelectedAsset(state);
  const preview = draft.market === "forward"
    ? previewForwardTrade(state, asset, draft.offsetIndex, draft.lotCount)
    : previewSpotTrade(state, asset, { side: draft.side, lotCount: draft.lotCount });
  const isSell = draft.market === "spot" && draft.side === "sell";
  const title = getOrderTitle(asset, draft);
  const subtitle = getOrderSubtitle(state, asset, draft);
  const actionLabel = draft.market === "forward" ? "锁定远期" : isSell ? "执行卖出" : "执行买入";
  const maxLotCount = draft.market === "forward"
    ? getMaxForwardOrderCount(state, asset, draft.offsetIndex)
    : getMaxSpotOrderLotCount(state, asset, draft.side);

  shell.hidden = false;
  modal.classList.toggle("theme-align", !isSell);
  modal.classList.toggle("theme-fracture", isSell);

  document.getElementById("order-modal-title").textContent = title;
  document.getElementById("order-modal-subtitle").textContent = subtitle;
  document.getElementById("order-ledger-target").textContent = asset.name;
  document.getElementById("order-ledger-mode").textContent = draft.market === "forward"
    ? `FORWARD+${draft.offsetIndex + 1}`
    : draft.side === "sell" ? "SPOT SELL" : "SPOT BUY";
  document.getElementById("order-ledger-price").textContent = fmtPrice(preview.price || 0);
  document.getElementById("order-ledger-context").textContent = getOrderContextLabel(asset);
  const lotInput = document.getElementById("order-lot-input");
  lotInput.value = String(draft.lotCount || 1);
  lotInput.max = String(Math.max(maxLotCount || 0, 0));
  lotInput.disabled = maxLotCount <= 0;
  document.getElementById("order-lot-caption").textContent = draft.market === "forward"
    ? `${preview.contractCount || 0} 份合约`
    : `${formatUnits(preview.quantity || 0, { compact: shouldCompactNumbers(state), digits: 2 })} ${asset.unit}`;
  document.getElementById("order-preview-quantity").textContent = draft.market === "forward"
    ? `${preview.contractCount || 0} pos`
    : `${formatUnits(preview.quantity || 0, { compact: shouldCompactNumbers(state), digits: 2 })} ${asset.unit}`;
  document.getElementById("order-preview-primary-label").textContent = draft.market === "forward" ? "TOTAL" : isSell ? "PROCEEDS" : "NOTIONAL";
  document.getElementById("order-preview-secondary-label").textContent = draft.market === "forward" ? "CREDIT" : isSell ? "FEE" : "MARGIN";
  document.getElementById("order-preview-tertiary-label").textContent = draft.market === "forward" ? "CASH" : isSell ? "PNL" : "BORROWED";
  document.getElementById("order-preview-quaternary-label").textContent = draft.market === "forward" ? "SETTLE" : isSell ? "CASH_IN" : "CASH_REQ";
  setMoneyText(document.getElementById("order-preview-primary"), state, draft.market === "forward" ? preview.totalCost : (isSell ? preview.grossProceeds : preview.grossCost), { digits: 2 });
  setMoneyText(document.getElementById("order-preview-secondary"), state, draft.market === "forward" ? preview.creditUsed : (isSell ? preview.tradeFee : preview.marginCost), { digits: 2 });
  setMoneyText(document.getElementById("order-preview-tertiary"), state, draft.market === "forward" ? preview.cashUsed : (isSell ? preview.realizedPnl : preview.borrowed), { digits: 2, forceSign: isSell });
  document.getElementById("order-preview-quaternary").textContent = draft.market === "forward"
    ? (preview.settleDay != null ? `${fmtDay(preview.settleDay)} ${preview.settlePhaseName}` : "--")
    : `${formatMoneyValue(state, isSell ? preview.netProceeds : preview.cashRequirement)} ₣`;
  document.getElementById("order-preview-quaternary").title = draft.market === "forward"
    ? (preview.settleDay != null ? `${fmtDay(preview.settleDay)} ${preview.settlePhaseName}` : "--")
    : formatMoneyTitle(isSell ? preview.netProceeds : preview.cashRequirement);
  document.getElementById("order-funding-note").textContent = formatOrderFundingNote(preview, draft.market);
  document.getElementById("order-status-note").textContent = formatOrderStatusNote(state, draft, preview, maxLotCount);
  document.getElementById("btn-order-modal-confirm").textContent = actionLabel;

  document.querySelectorAll("[data-order-preset]").forEach((node) => {
    const preset = node.dataset.orderPreset;
    const isMax = preset === "max";
    const active = isMax ? Number(draft.lotCount) === Number(maxLotCount) && maxLotCount > 0 : Number(preset) === Number(draft.lotCount);
    node.classList.toggle("is-active", active);
    node.disabled = maxLotCount <= 0 || (!isMax && Number(preset) > maxLotCount);
  });

  const confirmButton = document.getElementById("btn-order-modal-confirm");
  confirmButton.disabled = !preview.success;
  confirmButton.title = preview.success ? "" : preview.reason || "当前不可执行";
}

function renderBets(state) {
  const wrap = document.getElementById("bet-list");
  wrap.innerHTML = "";

  const bets = [...state.bets].sort((a, b) => rankStatus(a.status) - rankStatus(b.status));
  const recentSettlements = [...(state.runtime.recentSettlements || [])];
  if (!bets.length && !recentSettlements.length) {
    wrap.innerHTML = `<div class="muted small">当前没有裂价押单。</div>`;
    return;
  }

  const buildBetCardHtml = (bet, settled = false) => {
    const target = state.assets[bet.targetId];
    const settleText = settled
      ? `${fmtDay(bet.settledDay || bet.expireDay)} ${getPhaseName(bet.settledPhaseIndex ?? bet.expirePhaseIndex)} 已结算`
      : `${fmtDay(bet.expireDay)} ${bet.expirePhaseName}结算`;
    const strikeText = getBetStrikeLabel(bet.strikeKey);
    const sizeText = `${bet.size || 1}x`;
    const compareLabel = bet.compare === "gte" ? ">" : "<";
    const metricDisplay = formatDirectionalMetric(bet.triggerMetric, bet.metricType);
    const productName = bet.productName || getDirectionalProductMeta(target.board, bet.direction).displayName;
    const payoutValue = settled ? Number(bet.payout || 0) : Number(bet.expectedPayout || 0);
    const statusBadge = settled
      ? `<span class="bet-status ${bet.status === "won" ? "is-win" : "is-loss"}">${bet.status === "won" ? "已命中" : "未命中"}</span>`
      : `<span class="direction">${bet.direction === "align" ? "[ 押顺 · ALIGN ]" : "[ 押裂 · FRACTURE ]"}</span>`;

    return `
      <div class="card-glow-bar"></div>
      <div class="bet-row">
        <span class="target-name">${target.name} · ${productName}</span>
        ${statusBadge}
      </div>
      <div class="bet-row">
        <span class="threshold"><span class="op">${compareLabel}</span>${metricDisplay}</span>
        <div class="payout-block">
          <span class="label">${bet.metricLabel || "TRIGGER"}</span><span class="val" title="${formatMoneyTitle(payoutValue)}">${formatMoneyValue(state, payoutValue)} ₣</span>
        </div>
      </div>
      <div class="bet-row meta-footer">
        <span>保费 <span title="${formatMoneyTitle(bet.premium)}">${formatMoneyValue(state, bet.premium)} ₣</span> | ${sizeText} | <span class="meta-cn">${strikeText}</span></span>
        <span class="meta-cn">${settleText}</span>
      </div>
    `;
  };

  for (const bet of bets) {
    const card = document.createElement("div");
    card.className = `bet-card ${bet.direction === "align" ? "type-align" : "type-fracture"}`;
    card.innerHTML = buildBetCardHtml(bet, false);
    wrap.appendChild(card);
  }

  if (recentSettlements.length) {
    const history = document.createElement("div");
    history.className = "settlement-history";
    history.innerHTML = `<div class="settlement-history-title">RECENT_SETTLE <span class="meta-cn">最近结算</span></div>`;

    for (const bet of recentSettlements) {
      const card = document.createElement("div");
      card.className = `bet-card is-settled ${bet.direction === "align" ? "type-align" : "type-fracture"}`;
      card.innerHTML = buildBetCardHtml(bet, true);
      history.appendChild(card);
    }

    wrap.appendChild(history);
  }
}

function renderBetDraftModal(state) {
  const shell = document.getElementById("bet-modal-shell");
  const modal = document.getElementById("bet-modal");
  const draft = state.runtime.betDraft;

  if (!draft?.open) {
    shell.hidden = true;
    return;
  }

  const asset = getSelectedAsset(state);
  const preview = previewBetTrade(state, asset, draft.direction, draft);
  const expire = getNextPhase(state.day, state.phaseIndex, preview.expireOffset);
  const triggerPrefix = preview.compare === "gte" ? ">" : "<";
  const modalTitle = `${preview.productName} 方向产品确认`;
  const modalSubtitle = preview.subtitle;

  shell.hidden = false;
  modal.classList.toggle("theme-align", draft.direction === "align");
  modal.classList.toggle("theme-fracture", draft.direction === "fracture");
  document.getElementById("bet-modal-title").textContent = modalTitle;
  document.getElementById("bet-modal-subtitle").textContent = modalSubtitle;
  document.getElementById("bet-preview-target").textContent = `${asset.name} · ${asset.boardName}`;
  document.getElementById("bet-preview-entry").textContent = `${formatDirectionalMetric(preview.entryMetric, preview.metricType)} ${preview.metricLabel}`;
  document.getElementById("bet-preview-trigger").textContent = `${triggerPrefix} ${formatDirectionalMetric(preview.triggerMetric, preview.metricType)} ${preview.metricLabel}`;
  document.getElementById("bet-preview-settle").textContent = `${fmtDay(expire.day)} ${expire.phaseName}`;
  const sizeSlider = document.getElementById("bet-size-slider");
  sizeSlider.min = "1";
  sizeSlider.max = String(getMaxBetSize(state, asset));
  sizeSlider.value = String(preview.size);
  document.getElementById("bet-size-value").textContent = `${preview.size}x`;
  setMoneyText(document.getElementById("bet-preview-premium"), state, preview.premium, { digits: 2 });
  setMoneyText(document.getElementById("bet-preview-payout"), state, preview.expectedPayout, { digits: 2 });
  document.getElementById("bet-preview-distance").textContent = `${(preview.thresholdPct * 100).toFixed(1)}% / ${preview.strikeLabel}`;
  setMoneyText(document.getElementById("bet-preview-cash"), state, state.wallet.cash, { digits: 2 });

  document.querySelectorAll("[data-bet-strike]").forEach((node) => {
    node.classList.toggle("is-active", node.dataset.betStrike === preview.strikeKey);
  });

  const confirmButton = document.getElementById("btn-bet-modal-confirm");
  const hasCash = state.wallet.cash >= preview.premium;
  confirmButton.disabled = !hasCash;
  confirmButton.title = hasCash ? "" : "现金不足以支付押单保费";
}

function renderZero(state) {
  const zero = state.zero;
  const body = document.getElementById("zero-body");
  const debtStateLabel =
    zero.debtState === "suspended" ? "SUSPENDED (悬挂)" :
    zero.debtState === "unstable" ? "UNSTABLE (失稳)" :
    "RUPTURE_RISK (破裂危险)";

  body.innerHTML = `
    <div class="k0-row">
      <span class="k0-label">主债务本体</span><span class="k0-dots"></span>
      <span class="k0-val text-red huge" title="${formatMoneyTitle(zero.debtFaceValue)}">${formatMoneyValue(state, zero.debtFaceValue)} ₣</span>
    </div>
    <div class="k0-row">
      <span class="k0-label">落账状态</span><span class="k0-dots"></span>
      <span class="k0-val text-white">${debtStateLabel.replace("(", "<span class=\"cn\">(").replace(")", ")</span>")}</span>
    </div>
    <div class="k0-row">
      <span class="k0-label">主控绑定方</span><span class="k0-dots"></span>
      <span class="k0-val text-gold">${zero.binder?.name || "无"}</span>
    </div>
    <div class="k0-row">
      <span class="k0-label">收益抽成锁</span><span class="k0-dots"></span>
      <span class="k0-val text-white">${Math.round(zero.cutRate * 100)}% <span class="cn">截留</span></span>
    </div>
    <div class="k0-row">
      <span class="k0-label">排他级别</span><span class="k0-dots"></span>
      <span class="k0-val text-white">LVL.${zero.exclusivity}</span>
    </div>
    <div class="k0-row">
      <span class="k0-label">保护值 · Guard</span><span class="k0-dots"></span>
      <span class="k0-val text-teal">+${zero.guardValue}</span>
    </div>
    <div class="k0-row">
      <span class="k0-label">K0 修正</span><span class="k0-dots"></span>
      <span class="k0-val text-gold">+${zero.k0Shift}</span>
    </div>
    <div class="k0-row">
      <span class="k0-label">违约代价</span><span class="k0-dots"></span>
      <span class="k0-val text-white" title="${formatMoneyTitle(zero.breakCost)}">${formatMoneyValue(state, zero.breakCost)} ₣</span>
    </div>
    <div class="k0-row" style="margin-top:4px;">
      <span class="k0-label text-muted">次级权益槽</span><span class="k0-dots"></span>
      <span class="k0-val text-muted">${zero.subRights.length ? zero.subRights.map((item) => item.label || item.type || item.holder).join(" · ") : "[ 空置 · 待售 ]"}</span>
    </div>
  `;
}

function renderCredit(state) {
  const credit = state.credit;
  const body = document.getElementById("credit-body");
  const usageRatio = credit.totalLimit > 0 ? credit.used / credit.totalLimit : 0;
  const riskState = getCreditRiskState(credit, usageRatio);
  const facilitiesHtml = credit.facilities
    .map((facility) => {
      const remaining = Math.max(facility.limit - facility.used, 0);
      const facilityUsage = facility.limit > 0 ? Math.min((facility.used / facility.limit) * 100, 100) : 0;
      return `
        <div class="credit-facility-card ${facility.locked ? "is-locked" : ""}">
          <div class="credit-provider-row">
            <span class="credit-provider-block">
              <span class="credit-provider">${facility.providerName}</span>
              <span class="credit-purpose">${formatCreditPurpose(facility)}</span>
            </span>
            <span class="credit-provider-actions">
              <span class="credit-kind">${formatCreditKind(facility.kind)}</span>
              <button class="credit-toggle-btn ${facility.locked ? "is-locked" : ""}" type="button" data-credit-facility-toggle="${facility.id}">
                ${facility.locked ? "UNLOCK" : "LOCK"}
              </button>
            </span>
          </div>
          <div class="credit-meta">
            <div class="credit-meta-item">
              <span class="credit-meta-label">LIM</span>
              <span class="credit-meta-value" title="${formatMoneyTitle(facility.limit)}">${formatMoneyValue(state, facility.limit)}</span>
            </div>
            <div class="credit-meta-item">
              <span class="credit-meta-label">USED</span>
              <span class="credit-meta-value" title="${formatMoneyTitle(facility.used)}">${formatMoneyValue(state, facility.used)}</span>
            </div>
            <div class="credit-meta-item">
              <span class="credit-meta-label">AVL</span>
              <span class="credit-meta-value" title="${formatMoneyTitle(remaining)}">${formatMoneyValue(state, remaining)}</span>
            </div>
            <div class="credit-meta-item">
              <span class="credit-meta-label">RATE</span>
              <span class="credit-meta-value">${(facility.rate * 100).toFixed(1)}%</span>
            </div>
            <div class="credit-meta-item">
              <span class="credit-meta-label">PHASE</span>
              <span class="credit-meta-value">x${((typeof facility.carryFactor === "number" ? facility.carryFactor : 0.1)).toFixed(2)}</span>
            </div>
          </div>
          <div class="credit-usage-bar">
            <div class="credit-usage-fill ${getFacilityRiskClass(facility)}" style="width: ${facilityUsage.toFixed(1)}%;"></div>
          </div>
          <div class="credit-note">${formatCreditNote(facility)}</div>
        </div>
      `;
    })
    .join("");

  body.innerHTML = `
    <div class="credit-summary">
      <div class="credit-row">
        <span class="credit-row-label">TOTAL_LIMIT</span>
        <span class="credit-row-value" title="${formatMoneyTitle(credit.totalLimit)}">${formatMoneyValue(state, credit.totalLimit)} ₣</span>
      </div>
      <div class="credit-row">
        <span class="credit-row-label">AVAILABLE</span>
        <span class="credit-row-value" title="${formatMoneyTitle(credit.available)}">${formatMoneyValue(state, credit.available)} ₣</span>
      </div>
      <div class="credit-row">
        <span class="credit-row-label">USED</span>
        <span class="credit-row-value" title="${formatMoneyTitle(credit.used)}">${formatMoneyValue(state, credit.used)} ₣</span>
      </div>
      <div class="credit-row">
        <span class="credit-row-label">PHASE_CARRY</span>
        <span class="credit-row-value" title="${formatMoneyTitle(credit.lastPhaseCost)}">${formatMoneyValue(state, credit.lastPhaseCost)} ₣</span>
      </div>
      <div class="credit-row">
        <span class="credit-row-label">AUTO_REPAY</span>
        <span class="credit-row-value" title="${formatMoneyTitle(credit.lastRepayment)}">${formatMoneyValue(state, credit.lastRepayment)} ₣</span>
      </div>
      <div class="credit-row">
        <span class="credit-row-label">RISK_STATE</span>
        <span class="credit-row-value ${riskState.className}">${riskState.label} ${(usageRatio * 100).toFixed(0)}%</span>
      </div>
    </div>
    ${facilitiesHtml}
  `;
}

function renderRightDetailPanel(state) {
  const activeTab = state.runtime.rightDetailTab || "zero";
  const buttons = document.querySelectorAll("#right-detail-tabs .detail-tab");
  buttons.forEach((button) => {
    button.classList.toggle("active", button.dataset.detailTab === activeTab);
  });

  document.getElementById("detail-panel-zero").hidden = activeTab !== "zero";
  document.getElementById("detail-panel-credit").hidden = activeTab !== "credit";
}

function rankStatus(status) {
  if (status === "open") return 0;
  if (status === "won") return 1;
  return 2;
}

function getSelectedAsset(state) {
  return state.assets[state.selectedAssetId];
}

function getMiniAssetLabel(asset) {
  if (asset.id === "liquid") return "A福液";
  if (asset.id === "sanctuary") return "B承灾";
  if (asset.id === "badDebtStreet") return "C坏账";
  return asset.name.slice(0, 2);
}

function getChartData(state) {
  const asset = getSelectedAsset(state);
  const total = asset.history.length;
  const visibleCount = clamp(Math.round(state.chart.visibleCount || 32), CHART_MIN_VISIBLE, CHART_MAX_VISIBLE);
  const maxOffset = Math.max(total - visibleCount, 0);
  const offset = clamp(Math.round(state.chart.offset || 0), 0, maxOffset);

  const end = total - offset;
  const start = Math.max(end - visibleCount, 0);
  const factor = getCurrentChartFactor(asset);
  return asset.history.slice(start, end).map((point) => ({
    ...point,
    o: Number((point.o * factor).toFixed(3)),
    h: Number((point.h * factor).toFixed(3)),
    l: Number((point.l * factor).toFixed(3)),
    c: Number((point.c * factor).toFixed(3)),
  }));
}

function zoomHistory(state, direction) {
  const nextVisible = clamp(state.chart.visibleCount + direction * 2, CHART_MIN_VISIBLE, CHART_MAX_VISIBLE);
  state.chart.visibleCount = nextVisible;
  normalizeChartWindow(state);
}

function normalizeChartWindow(state) {
  const asset = getSelectedAsset(state);
  const maxOffset = Math.max(asset.history.length - state.chart.visibleCount, 0);
  state.chart.offset = clamp(state.chart.offset, 0, maxOffset);
}

function getDayLabelInterval(visibleCount) {
  if (visibleCount >= 128) return 14;
  if (visibleCount >= 64) return 7;
  if (visibleCount >= 48) return 4;
  return 1;
}

function getCurrentChartFactor(asset) {
  if (!asset?.spot?.price) {
    return 1;
  }

  return getContextualSpotPrice(asset) / asset.spot.price;
}

function applyTradeLabels(asset, labels) {
  const alignMeta = getDirectionalProductMeta(asset.board, "align");
  const fractureMeta = getDirectionalProductMeta(asset.board, "fracture");
  document.getElementById("btn-buy-spot").textContent = "BUY_SPOT";
  document.getElementById("btn-sell-spot").textContent = "SELL_SPOT";
  document.getElementById("btn-sell-spot-all").textContent = "CLOSE_ALL";
  document.getElementById("btn-buy-fwd1").innerHTML = `<span>${labels.fwd1}</span> F+1`;
  document.getElementById("btn-buy-fwd2").innerHTML = `<span>${labels.fwd2}</span> F+2`;
  document.getElementById("btn-open-align").innerHTML = `
    <span class="en">ACT: ALIGN</span>
    <span class="cn">${alignMeta.shortLabel}</span>
  `;
  document.getElementById("btn-open-fracture").innerHTML = `
    <span class="en">ACT: FRACT</span>
    <span class="cn">${fractureMeta.shortLabel}</span>
  `;
}

function applyTradeBlockState(asset, blockReason) {
  const targetIds = blockReason
    ? ["btn-buy-spot", "btn-buy-fwd1", "btn-buy-fwd2"]
    : ["btn-buy-spot", "btn-sell-spot", "btn-sell-spot-all", "btn-buy-fwd1", "btn-buy-fwd2", "btn-open-align", "btn-open-fracture"];

  for (const id of targetIds) {
    const button = document.getElementById(id);
    button.disabled = Boolean(blockReason);
    button.title = blockReason || "";
  }

  if (blockReason) {
    ["btn-sell-spot", "btn-sell-spot-all"].forEach((id) => {
      const button = document.getElementById(id);
      button.disabled = false;
      button.title = "";
    });
  }

  const alignBlockReason = getBetTradeBlockReason(asset, "align");
  const fractureBlockReason = getBetTradeBlockReason(asset, "fracture");
  setFundingButtonState("btn-open-align", !alignBlockReason, alignBlockReason || "");
  setFundingButtonState("btn-open-fracture", !fractureBlockReason, fractureBlockReason || "");
}

function applyFundingAbilityState(state, asset, blockReason) {
  if (blockReason) {
    return;
  }

  const spotPreview = previewLeveragedTrade(state, asset);
  const fwd1 = asset.forward[0];
  const fwd2 = asset.forward[1];
  const fwd1Preview = fwd1 ? previewForwardTrade(state, asset, 0, 1) : null;
  const fwd2Preview = fwd2 ? previewForwardTrade(state, asset, 1, 1) : null;

  setFundingButtonState(
    "btn-buy-spot",
    spotPreview.success,
    spotPreview.reason || "现金不足以支付保证金 / 手续费 / 黑市抽成，或授信不足",
  );
  setFundingButtonState("btn-buy-fwd1", Boolean(fwd1Preview?.success), fwd1Preview?.reason || "现金与授信均不足");
  setFundingButtonState("btn-buy-fwd2", Boolean(fwd2Preview?.success), fwd2Preview?.reason || "现金与授信均不足");
}

function setFundingButtonState(buttonId, enabled, reason = "现金与授信均不足") {
  const button = document.getElementById(buttonId);
  button.disabled = !enabled;
  button.title = enabled ? "" : reason;
}

function renderLeveragePanel(state, asset, preview) {
  const slider = document.getElementById("leverage-slider");
  const min = state.tradePrefs.leverageMin;
  const max = getMaxLeverageForAsset(state, asset);
  const step = preview.step;
  const blackMarketMode = Boolean(state.tradePrefs.blackMarketMode);
  const ceiling = blackMarketMode ? getBlackMarketLeverageCap(asset) : preview.normalMaxLeverage;
  const currentLeverage = snapLeverage(Number(state.tradePrefs.leverage || preview.leverage), min, max, step);
  const panelPreview = currentLeverage === preview.leverage
    ? preview
    : previewSpotTrade(state, asset, { side: "buy", lotCount: 1, leverage: currentLeverage });
  slider.min = String(min);
  slider.max = String(max);
  slider.step = String(step);
  slider.value = String(currentLeverage);
  slider.disabled = max <= min && !panelPreview.success;

  document.getElementById("leverage-value").textContent = `${currentLeverage.toFixed(1)}x`;
  setMoneyHtml(document.getElementById("leverage-notional"), state, panelPreview.grossCost, { digits: 2 });
  setMoneyHtml(document.getElementById("leverage-margin"), state, panelPreview.marginCost, { digits: 2 });
  setMoneyHtml(document.getElementById("leverage-borrowed"), state, panelPreview.borrowed, { digits: 2 });
  document.getElementById("leverage-max").innerHTML = `${max.toFixed(1)}x <span class="limit-ceiling">${ceiling.toFixed(1)}x</span>`;
}

function getBetStrikeLabel(strikeKey) {
  if (strikeKey === "tight") return "近阈值";
  if (strikeKey === "wide") return "远阈值";
  return "标准";
}

function getSpotExecTitle(board) {
  if (board === "B") {
    return 'COVER_EXEC <span class="hdr-title-cn">· 当前承接</span>';
  }

  if (board === "C") {
    return 'SLICE_EXEC <span class="hdr-title-cn">· 当前份额</span>';
  }

  return 'SPOT_EXEC <span class="hdr-title-cn">· 当前现货</span>';
}

function getMetaContextLabel(board) {
  if (board === "B") return "COVERAGE · 承接";
  if (board === "C") return "POOL_CTX · 池层";
  return "DELIVERY · 交割";
}

function getMetaContextValue(asset) {
  if (asset.board === "B") {
    const layer = asset.boardState.layers[asset.boardState.selectedLayer];
    return `${layer.label}<span>${layer.priceFactor.toFixed(2)}x</span>`;
  }

  if (asset.board === "C") {
    const pool = getSelectedPool(asset);
    const tranche = asset.boardState.tranches[asset.boardState.selectedTranche];
    return `${tranche.label}<span>${liquidityLabel(asset.boardState.liquidityState)}</span>`;
  }

  return `可交割<span>${asset.boardState.inventory.deliverable}</span>`;
}

function getCreditRiskState(credit, usageRatio) {
  if (usageRatio >= credit.liquidationRatio) {
    return { label: "STRESSED", className: "credit-risk-stressed" };
  }

  if (usageRatio >= credit.warningRatio) {
    return { label: "WARN", className: "credit-risk-warn" };
  }

  if (usageRatio >= credit.warningRatio * 0.7) {
    return { label: "WATCH", className: "credit-risk-warn" };
  }

  return { label: "SAFE", className: "credit-risk-safe" };
}

function getFacilityRiskClass(facility) {
  const ratio = facility.limit > 0 ? facility.used / facility.limit : 0;
  if (ratio >= 0.95) return "credit-risk-stressed";
  if (ratio >= 0.85) return "credit-risk-warn";
  return "";
}

function formatCreditKind(kind) {
  if (kind === "liquid") return "福液";
  if (kind === "sanctuary") return "承灾";
  if (kind === "debt") return "坏账";
  return "通用";
}

function formatCreditPurpose(facility) {
  if (facility.id === "kuzuha_greyline") return "仅坏账板 · 灰市高息";
  if (facility.kind === "sanctuary") return "仅承灾板 · 定向低费";
  if (facility.kind === "debt") return "仅坏账板 · 高波动可用";
  if (facility.kind === "liquid") return "仅福液板 · 交割向";
  return "全板可用 · 主融资线";
}

function formatCreditNote(facility) {
  const note = facility.note || formatCreditPurpose(facility);
  return `${note}${facility.locked ? " [锁定]" : ""}`;
}

function formatFundingNote(asset) {
  const funding = asset.lastSpotFunding;
  if (!funding || funding.kind !== "spot") {
    return "融资来源: 现金";
  }

  const allocations = funding.allocations || [];
  if (!allocations.length) {
    const feeChunk = funding.tradeFee > 0 ? ` / 手续费 ${formatFullMoney(funding.tradeFee)}₣` : "";
    return `融资来源: 现金${feeChunk}`;
  }

  const parts = allocations
    .slice(0, 2)
    .map((allocation) => `${allocation.providerName} ${formatFullMoney(allocation.amount)}₣`);
  const suffix = funding.tradeFee > 0 ? ` · 手续费 ${formatFullMoney(funding.tradeFee)}₣` : "";
  return `融资来源: ${parts.join(" · ")}${suffix}`;
}

function formatOrderFundingNote(preview, market) {
  const allocations = preview.fundingAllocations || [];
  if (!allocations.length) {
    return market === "forward" && preview.creditUsed > 0
      ? "预计融资来源: 现金 · 可用授信自动补足"
      : "预计融资来源: 现金";
  }

  const summary = allocations
    .slice(0, 2)
    .map((allocation) => `${allocation.providerName} ${formatFullMoney(allocation.amount)}₣`)
    .join(" · ");
  return `预计融资来源: ${summary}`;
}

function formatOrderStatusNote(state, draft, preview, maxLotCount) {
  if (!preview.success) {
    return preview.reason || "当前不可执行";
  }

  if (draft.market === "forward") {
    return `可执行，当前最大 ${maxLotCount || 0} 张 / 现金 ${formatMoneyValue(state, preview.cashUsed)} ₣ / 授信 ${formatMoneyValue(state, preview.creditUsed)} ₣`;
  }

  if (draft.side === "sell") {
    return `可执行，手续费 ${formatMoneyValue(state, preview.tradeFee)} ₣ / 净回流 ${formatMoneyValue(state, preview.netProceeds)} ₣`;
  }

  const blackFeeText = preview.blackMarketFee > 0 ? ` / 黑市抽成 ${formatMoneyValue(state, preview.blackMarketFee)} ₣` : "";
  return `可执行，手续费 ${formatMoneyValue(state, preview.tradeFee)} ₣${blackFeeText} / 当前最大 ${maxLotCount || 0} 手`;
}

function getOrderTitle(asset, draft) {
  if (draft.market === "forward") {
    return `${asset.code} · FORWARD+${draft.offsetIndex + 1}`;
  }

  return draft.side === "sell"
    ? `${asset.code} · SPOT SELL`
    : `${asset.code} · SPOT BUY`;
}

function getOrderSubtitle(state, asset, draft) {
  if (draft.market === "forward") {
    return `锁定 ${asset.name} 的未来报价与结算时点`;
  }

  return draft.side === "sell"
    ? `按当前上下文批量卖出 ${asset.name} 持仓`
    : `按当前 ${Number(state.tradePrefs.leverage || 1).toFixed(1)}x 杠杆批量买入 ${asset.name}`;
}

function getOrderContextLabel(asset) {
  if (asset.board === "B") {
    return asset.boardState.layers[asset.boardState.selectedLayer]?.label || "承灾层";
  }

  if (asset.board === "C") {
    const pool = getSelectedPool(asset);
    const tranche = asset.boardState.tranches[asset.boardState.selectedTranche];
    return `${pool?.label || "资产池"} · ${tranche?.label || "分层"}`;
  }

  return "标准交割";
}

function shouldCompactNumbers(state) {
  return state?.display?.compactNumbers !== false;
}

function formatMoneyValue(state, value, options = {}) {
  return formatMoney(value, {
    compact: shouldCompactNumbers(state),
    digits: options.digits ?? 2,
    forceSign: options.forceSign ?? false,
  });
}

function formatMoneyTitle(value, digits = 1) {
  return `${formatFullNumber(value, { digits })} ₣`;
}

function formatFullMoney(value, digits = 1) {
  return formatFullNumber(value, { digits });
}

function setMoneyText(node, state, value, options = {}) {
  node.textContent = `${formatMoneyValue(state, value, options)} ₣`;
  node.title = formatMoneyTitle(value, options.fullDigits ?? 1);
}

function setMoneyHtml(node, state, value, options = {}) {
  node.innerHTML = `${formatMoneyValue(state, value, options)} <span class="currency">₣</span>`;
  node.title = formatMoneyTitle(value, options.fullDigits ?? 1);
}

function setUnitsText(node, state, value, unit, options = {}) {
  node.textContent = `${formatUnits(value, {
    compact: shouldCompactNumbers(state),
    digits: options.digits ?? 2,
    forceSign: options.forceSign ?? false,
  })} ${unit}`.trim();
  node.title = `${formatFullNumber(value, { digits: options.fullDigits ?? 1 })} ${unit}`.trim();
}

function setNumberText(node, value, options = {}) {
  node.textContent = options.compact
    ? formatCompactNumber(value, { digits: options.digits ?? 2, forceSign: options.forceSign ?? false })
    : formatFullNumber(value, { digits: options.fullDigits ?? 1, forceSign: options.forceSign ?? false });
  node.title = formatFullNumber(value, { digits: options.fullDigits ?? 1, forceSign: options.forceSign ?? false });
}

function getBetContextSubtitle(board) {
  if (board === "B") return "承灾费率 · 容量方向产品";
  if (board === "C") return "回收修复 · 违约扩散方向产品";
  return "交割 · 贴水方向产品";
}

function fmtSignedValue(value) {
  return `${value >= 0 ? "+" : ""}${fmtPrice(value)}`;
}

function fmtSignedPct(value) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function statusLabel(status) {
  if (status === "critical") return "critical";
  if (status === "tight") return "tight";
  return "normal";
}

function liquidityLabel(state) {
  if (state === "frozen") return "liquidity frozen";
  if (state === "thin") return "liquidity thin";
  return "liquidity normal";
}

function getSelectedPool(asset) {
  return asset.boardState.pools.find((pool) => pool.id === asset.boardState.selectedPoolId) || asset.boardState.pools[0];
}
