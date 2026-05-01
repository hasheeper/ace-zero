import { clearMarketLog, getMarketLogEntries } from "./logger.js";

const TYPE_LABELS = {
  all: "全部",
  "runtime-error": "运行时错误",
  "promise-rejection": "未处理拒绝",
  "trade-rejected": "交易拒绝",
  "action-spot-sell": "玩家点击卖出",
  "action-spot-close-all": "玩家点击全部平仓",
  "trade-spot-sell": "现货卖出",
  "cash-inflow": "现金流入",
  "credit-repay": "自动还款",
  "phase-advance": "市场推进",
  "credit-carry": "授信持有成本",
  "action-phase-advance": "玩家推进相位",
  "trade-spot-buy": "现货买入",
  "action-spot-buy": "玩家点击买入",
  "action-leverage": "调整杠杆",
  "action-black-market-mode": "切换黑市模式",
  "action-black-market-tier": "选择黑市档位",
  "action-credit-facility-toggle": "切换授信锁定",
  "bet-settle": "押单结算",
  "session-start": "会话启动",
  "trade-bet-open": "押单开仓",
  "action-bet-open": "确认押单",
  "action-bet-draft-open": "打开押单面板",
  "trade-forward-buy": "远期开仓",
  "forward-settle": "远期结算",
  "action-forward-buy": "点击远期买入",
  "action-select-asset": "切换标的",
  "action-select-layer": "切换承灾层",
  "action-select-pool": "切换资产池",
  "action-select-tranche": "切换分层",
  "action-detail-tab": "切换右侧面板",
  "credit-consume": "动用授信",
  "action-reset": "重置市场",
};

const MESSAGE_LABELS = {
  "Market terminal session started": "市场终端会话启动",
  "Player clicked spot buy": "玩家点击现货买入",
  "Player clicked spot sell": "玩家点击现货卖出",
  "Player clicked close-all sell": "玩家点击全部平仓",
  "Player clicked forward buy": "玩家点击远期买入",
  "Player opened crack bet confirm panel": "玩家打开押单确认面板",
  "Player confirmed crack bet": "玩家确认押单",
  "Player advanced market phase": "玩家推进市场相位",
  "Player reset market state": "玩家重置市场状态",
  "Player selected asset": "玩家切换标的",
  "Player changed sanctuary layer": "玩家切换承灾层",
  "Player changed debt pool": "玩家切换资产池",
  "Player changed debt tranche": "玩家切换分层",
  "Player switched right detail tab": "玩家切换右侧详情面板",
  "Player adjusted leverage slider": "玩家调整杠杆滑条",
  "Player toggled black market mode": "玩家切换黑市模式",
  "Player selected black market tier": "玩家选择黑市档位",
  "Player toggled credit facility lock": "玩家切换授信锁定",
  "Market phase advanced": "市场相位已推进",
  "Spot position increased": "现货仓位增加",
  "Spot position reduced": "现货仓位减少",
  "Forward position opened": "远期仓位已建立",
  "Forward position settled": "远期仓位已结算",
  "Crack bet opened": "裂价押单已建立",
  "Crack bet settled as win": "裂价押单结算为盈利",
  "Crack bet settled as loss": "裂价押单结算为亏损",
  "Cash inflow processed": "现金流入已处理",
  "Automatic credit repayment applied": "自动还款已执行",
  "Credit carry accrued for current phase": "本相授信持有成本已计提",
  "Credit facility consumed for trade": "交易已动用授信设施",
  "Spot buy blocked": "现货买入被阻止",
  "Bet open blocked": "押单建立被阻止",
  "Spot buy failed due to insufficient margin cash": "保证金现金不足，现货买入失败",
  "Spot buy failed due to insufficient credit": "授信不足，现货买入失败",
  "Spot sell failed because no holdings are available": "无可卖持仓，现货卖出失败",
  "Bet open failed due to insufficient cash": "现金不足，押单建立失败",
};

const KEY_LABELS = {
  source: "来源",
  amount: "金额",
  repaid: "已偿还",
  netCash: "净入账",
  allocations: "分配明细",
  facilityId: "设施ID",
  providerName: "提供方",
  locked: "锁定状态",
  repaidCost: "偿还费用",
  repaidPrincipal: "偿还本金",
  from: "推进前",
  to: "推进后",
  day: "日序",
  phaseIndex: "相位索引",
  cash: "现金",
  creditUsed: "授信已用",
  prices: "价格",
  assetId: "标的",
  direction: "方向",
  payout: "赔付",
  expireDay: "到期日",
  expirePhaseIndex: "到期相位",
  currentPrice: "结算价",
  triggerPrice: "触发价",
  premium: "保费",
  offsetIndex: "远期槽位",
  settleDay: "结算日",
  settlePhaseIndex: "结算相位",
  settlePrice: "结算价",
  quantity: "数量",
  context: "语境",
  leverage: "杠杆",
  blackMarketMode: "黑市模式",
  blackMarketTier: "黑市档位",
  value: "数值",
  reason: "原因",
  borrowed: "借入额",
  marginCost: "保证金",
  cashRequirement: "现金需求",
  blackMarketFee: "黑市抽成",
  grossCost: "名义成本",
  grossProceeds: "卖出回款",
  realizedPnl: "已实现盈亏",
  mode: "模式",
  board: "板块",
  layerKey: "层级",
  poolId: "资产池",
  trancheKey: "分层",
  tabKey: "标签",
  totalCost: "总成本",
  charges: "费用项目",
  cost: "成本",
  cashPaid: "现金支付",
  capitalized: "挂账部分",
  price: "价格",
  entryPrice: "入场价",
  expectedPayout: "预估赔付",
  strikeKey: "阈值档位",
  size: "数量倍数",
  thresholdPct: "阈值比例",
  productKey: "产品键",
  productName: "产品名",
  subtitle: "产品说明",
  metricKey: "结算指标键",
  metricLabel: "指标标签",
  metricType: "指标类型",
  compare: "比较方式",
  entryMetric: "建仓指标",
  triggerMetric: "触发指标",
  triggerDisplay: "触发显示",
  settlementMetric: "结算指标",
};

const VALUE_LABELS = {
  align: "押顺",
  fracture: "押裂",
  "spot-sell": "现货卖出",
  "bet-payout": "押单赔付",
  "forward-settle": "远期结算",
  partial: "分批卖出",
  all: "全部平仓",
  A: "A板",
  B: "B板",
  C: "C板",
  tight: "近阈值",
  standard: "标准",
  wide: "远阈值",
  zero: "零号契约",
  credit: "授信池",
  true: "开启",
  false: "关闭",
  gte: "大于等于",
  lte: "小于等于",
  price: "价格",
  capacity: "容量",
  ratio: "比率",
  delivery_up: "顺势交割",
  basis_crack: "贴水裂价",
  fee_spike: "费率上冲",
  capacity_crack: "容量裂解",
  recovery_rebound: "回收修复",
  default_widen: "违约扩散",
};

const list = document.getElementById("log-list");
const meta = document.getElementById("log-meta");
const filter = document.getElementById("type-filter");
const copyButton = document.getElementById("btn-copy-all");

document.getElementById("btn-refresh").addEventListener("click", render);
document.getElementById("btn-clear").addEventListener("click", () => {
  clearMarketLog();
  render();
});
copyButton.addEventListener("click", handleCopyAll);
filter.addEventListener("change", render);

setInterval(render, 1000);
render();

function render() {
  const entries = getMarketLogEntries();
  hydrateFilter(entries);
  const filtered = getFilteredEntries(entries);

  meta.textContent = `${filtered.length} 条记录`;
  list.innerHTML = filtered.map((entry) => `
    <div class="entry" data-type="${escapeAttr(entry.type)}">
      <div class="entry-head">
        <span class="entry-type">${escapeHtml(getTypeLabel(entry.type))}</span>
        <span class="entry-time">${escapeHtml(formatTime(entry.ts))}</span>
      </div>
      <div class="entry-msg">${escapeHtml(getMessageLabel(entry.message))}</div>
      <pre class="entry-details">${escapeHtml(JSON.stringify(localizeDetails(entry.details ?? {}), null, 2))}</pre>
    </div>
  `).join("");
}

async function handleCopyAll() {
  const entries = getFilteredEntries(getMarketLogEntries());
  const payload = formatEntriesForCopy(entries);

  try {
    await copyText(payload);
    flashCopyState(`已复制 ${entries.length} 条`);
  } catch {
    flashCopyState("复制失败");
  }
}

function getFilteredEntries(entries) {
  return filter.value === "all"
    ? entries
    : entries.filter((entry) => entry.type === filter.value);
}

function formatEntriesForCopy(entries) {
  if (!entries.length) {
    return "市场开发日志\n（暂无记录）";
  }

  return [
    "市场开发日志",
    `筛选=${getTypeLabel(filter.value)}`,
    "",
    ...entries.map((entry) => {
      const details = JSON.stringify(localizeDetails(entry.details ?? {}), null, 2);
      return [
        `[${formatTime(entry.ts)}] ${getTypeLabel(entry.type)}`,
        getMessageLabel(entry.message),
        details,
      ].join("\n");
    }),
  ].join("\n\n");
}

function flashCopyState(label) {
  const original = copyButton.textContent;
  copyButton.textContent = label;
  window.setTimeout(() => {
    copyButton.textContent = original;
  }, 1200);
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);

  if (!copied) {
    throw new Error("copy-failed");
  }
}

function hydrateFilter(entries) {
  const current = filter.value;
  const types = ["all", ...new Set(entries.map((entry) => entry.type))];
  filter.innerHTML = types.map((type) => `
    <option value="${escapeAttr(type)}"${type === current ? " selected" : ""}>${escapeHtml(getTypeLabel(type))}</option>
  `).join("");
}

function getTypeLabel(type) {
  return TYPE_LABELS[type] || type;
}

function getMessageLabel(message) {
  return MESSAGE_LABELS[message] || message;
}

function localizeDetails(value, key = "") {
  if (Array.isArray(value)) {
    return value.map((item) => localizeDetails(item, key));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        KEY_LABELS[entryKey] || entryKey,
        localizeDetails(entryValue, entryKey),
      ]),
    );
  }

  if (typeof value === "string") {
    if (key === "productKey") {
      return value;
    }
    return VALUE_LABELS[value] || value;
  }

  if (typeof value === "number" && key === "phaseIndex") {
    return `${value}`;
  }

  return value;
}

function formatTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}
