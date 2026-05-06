# Overview Architecture

`overview` 是 Dashboard 的 ACT 渲染页。第一阶段重构保留静态 HTML + 普通 script + IIFE 全局对象架构，不引入 bundler，也不改变宿主通信协议。

## Directory Layout

- [index.js](/Users/liuhang/Documents/ace-zero/apps/dashboard/pages/overview/index.js)
  页面入口与组装层：创建 state/context、渲染 shell、连接 runtime/view/adapter。

- [style.css](/Users/liuhang/Documents/ace-zero/apps/dashboard/pages/overview/style.css)
  CSS 稳定入口。当前仍保持单文件，避免视觉回归。

- [config/debug.js](/Users/liuhang/Documents/ace-zero/apps/dashboard/pages/overview/config/debug.js)
  Debug 启动配置，注册到 `window.ACE0_OVERVIEW_CONFIGS.debug`。

- [config/tavern.js](/Users/liuhang/Documents/ace-zero/apps/dashboard/pages/overview/config/tavern.js)
  Host/Tavern 启动配置，注册到 `window.ACE0_OVERVIEW_CONFIGS.tavern`。

- [core/boot.js](/Users/liuhang/Documents/ace-zero/apps/dashboard/pages/overview/core/boot.js)
  启动模式识别、fallback campaign/fixed marker、config profile helpers。

- [runtime/campaign-runtime.js](/Users/liuhang/Documents/ace-zero/apps/dashboard/pages/overview/runtime/campaign-runtime.js)
  节点模板、route options、topology、node catalog 读取。

- [runtime/planner-runtime.js](/Users/liuhang/Documents/ace-zero/apps/dashboard/pages/overview/runtime/planner-runtime.js)
  planner 状态、phase slot、inventory、编辑约束。

- [runtime/execution-runtime.js](/Users/liuhang/Documents/ace-zero/apps/dashboard/pages/overview/runtime/execution-runtime.js)
  节点推进、phase 执行、forced next、route choice。

- [runtime/legacy-generator.js](/Users/liuhang/Documents/ace-zero/apps/dashboard/pages/overview/runtime/legacy-generator.js)
  旧版 seed/random campaign generator。当前未由 `index.html` 加载，暂保留。

- [adapters/dashboard-adapter.js](/Users/liuhang/Documents/ace-zero/apps/dashboard/pages/overview/adapters/dashboard-adapter.js)
  Host window/postMessage/direct bridge discovery helpers。

- [views/map-view.js](/Users/liuhang/Documents/ace-zero/apps/dashboard/pages/overview/views/map-view.js)
  地图视图生命周期边界：refresh/rebuild/focus/active state。

## Loading Order

`apps/dashboard/index.html` 需要按以下顺序加载：

1. `config/debug.js`
2. `config/tavern.js`
3. `core/boot.js`
4. `adapters/dashboard-adapter.js`
5. `runtime/campaign-runtime.js`
6. `runtime/planner-runtime.js`
7. `runtime/execution-runtime.js`
8. `views/map-view.js`
9. `index.js`

## Current Notes

- 章节真相不要写回 overview；host 模式只消费真实 payload。
- 新增 runtime/view/adapter 仍通过 `window.ACE0Overview*` 暴露，保持 browser-debug 友好。
- `window.ACE0DashboardDebug`、`window.__acezeroHomeRefreshIntel`、`window.__acezeroHomePageActive` 仍由 `index.js` 暴露。
- 如果改拓扑、lane 或 fog 规则，要同步检查 `index.js` 与 `views/map-view.js` 的地图刷新边界。

## Regression

```bash
node --check apps/dashboard/pages/overview/index.js
node --check apps/dashboard/pages/overview/core/boot.js
node --check apps/dashboard/pages/overview/adapters/dashboard-adapter.js
node --check apps/dashboard/pages/overview/views/map-view.js
node --check apps/dashboard/pages/overview/runtime/campaign-runtime.js
node --check apps/dashboard/pages/overview/runtime/planner-runtime.js
node --check apps/dashboard/pages/overview/runtime/execution-runtime.js
```
