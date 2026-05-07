# Overview Architecture

`overview` 是 Dashboard 的 ACT 渲染页。第一阶段重构保留静态 HTML + 普通 script + IIFE 全局对象架构，不引入 bundler，也不改变宿主通信协议。

## Directory Layout

- [index.js](/Users/liuhang/Documents/ace-zero/apps/dashboard/pages/overview/index.js)
  页面入口与组装层：连接 state/runtime/view/adapter/controller，保留 payload/state glue、ctx 组装、页面级事件总线、公开 debug API 与少量兼容 wrapper。

- [style.css](/Users/liuhang/Documents/ace-zero/apps/dashboard/pages/overview/style.css)
  CSS 稳定入口。当前仍保持单文件，避免视觉回归。

- [config/debug.js](/Users/liuhang/Documents/ace-zero/apps/dashboard/pages/overview/config/debug.js)
  Debug 启动配置，注册到 `window.ACE0_OVERVIEW_CONFIGS.debug`。

- [config/tavern.js](/Users/liuhang/Documents/ace-zero/apps/dashboard/pages/overview/config/tavern.js)
  Host/Tavern 启动配置，注册到 `window.ACE0_OVERVIEW_CONFIGS.tavern`。

- [core/boot.js](/Users/liuhang/Documents/ace-zero/apps/dashboard/pages/overview/core/boot.js)
  启动模式识别、fallback campaign/fixed marker、config profile helpers。

- [core/state.js](/Users/liuhang/Documents/ace-zero/apps/dashboard/pages/overview/core/state.js)
  页面初始状态、资源常量、message type 常量与基础 state shape。

- [runtime/campaign-runtime.js](/Users/liuhang/Documents/ace-zero/apps/dashboard/pages/overview/runtime/campaign-runtime.js)
  节点模板、route options、topology、node catalog 读取。

- [runtime/planner-runtime.js](/Users/liuhang/Documents/ace-zero/apps/dashboard/pages/overview/runtime/planner-runtime.js)
  planner 状态、phase slot、inventory、编辑约束。

- [runtime/execution-runtime.js](/Users/liuhang/Documents/ace-zero/apps/dashboard/pages/overview/runtime/execution-runtime.js)
  节点推进、phase 执行、forced next、route choice。

- [runtime/legacy-generator.js](/Users/liuhang/Documents/ace-zero/apps/dashboard/pages/overview/runtime/legacy-generator.js)
  旧版 seed/random campaign generator。当前未由 `index.html` 加载，暂保留。

- [adapters/dashboard-adapter.js](/Users/liuhang/Documents/ace-zero/apps/dashboard/pages/overview/adapters/dashboard-adapter.js)
  Host window/postMessage/direct bridge discovery helpers，以及 dashboard payload normalize、debug payload、host payload、debug/host adapter runtime。

- [adapters/asset-adapter.js](/Users/liuhang/Documents/ace-zero/apps/dashboard/pages/overview/adapters/asset-adapter.js)
  AssetDeck module discovery、fallback state/summary、dashboard normalize、host/local command apply 与 asset action handler。

- [views/map-view.js](/Users/liuhang/Documents/ace-zero/apps/dashboard/pages/overview/views/map-view.js)
  地图视图 runtime：camera pan/zoom、auto layout、layer sizing、node class/fog refresh、SVG path draw loop。

- [views/shell-view.js](/Users/liuhang/Documents/ace-zero/apps/dashboard/pages/overview/views/shell-view.js)
  Topbar、sidebar、map layer DOM markup。`index.js` 中同名函数只做兼容转发。

- [views/intel-panel.js](/Users/liuhang/Documents/ace-zero/apps/dashboard/pages/overview/views/intel-panel.js)
  右侧 intel/party/ACT debug/encounter debug markup。Host 模式不生成 ACT panel DOM。

- [views/planner-view.js](/Users/liuhang/Documents/ace-zero/apps/dashboard/pages/overview/views/planner-view.js)
  Planner drawer、resource pages、asset overlay、phase bar 与 DOM sync。`index.js` 仍保留 wrapper 给后续 controller 迁移使用。

- [controllers/planner-controller.js](/Users/liuhang/Documents/ace-zero/apps/dashboard/pages/overview/controllers/planner-controller.js)
  Planner token selection、slot move/swap/remove、inventory consume/restore、rest tint 设置。

- [controllers/debug-controller.js](/Users/liuhang/Documents/ace-zero/apps/dashboard/pages/overview/controllers/debug-controller.js)
  Debug resource grant、encounter debug actions、debug ACT reset/advance/node advance。`ACE0DashboardDebug` 仍由入口注册并转调 controller。

- [controllers/execution-controller.js](/Users/liuhang/Documents/ace-zero/apps/dashboard/pages/overview/controllers/execution-controller.js)
  Phase/node/route/vision 执行流与 planner drawer 内部 DOM 绑定。execution runtime 仍保留推进语义核心。

## Loading Order

`apps/dashboard/index.html` 需要按以下顺序加载：

1. `config/debug.js`
2. `config/tavern.js`
3. `core/boot.js`
4. `core/state.js`
5. `adapters/dashboard-adapter.js`
6. `adapters/asset-adapter.js`
7. `runtime/campaign-runtime.js`
8. `runtime/planner-runtime.js`
9. `runtime/execution-runtime.js`
10. `views/map-view.js`
11. `views/shell-view.js`
12. `views/intel-panel.js`
13. `views/planner-view.js`
14. `controllers/planner-controller.js`
15. `controllers/debug-controller.js`
16. `controllers/execution-controller.js`
17. `index.js`

## Current Notes

- 章节真相不要写回 overview；host 模式只消费真实 payload。
- 新增 runtime/view/adapter 仍通过 `window.ACE0Overview*` 暴露，保持 browser-debug 友好。
- `window.ACE0DashboardDebug`、`window.__acezeroHomeRefreshIntel`、`window.__acezeroHomePageActive` 仍由 `index.js` 暴露。
- `adapters/asset-adapter.js` 与 `controllers/*` 已改为显式 ctx 解构；`views/*` 中的大型 markup 模块仍处于 `with(ctx)` 过渡形态。
- 如果改拓扑、lane 或 fog 规则，要同步检查 `index.js` 与 `views/map-view.js` 的地图刷新边界。
- `index.js` 中的 `renderTopbar/renderSidebar/renderMapLayer/renderIntelPanel/renderPlannerDrawer/renderPhaseBar` 是过渡期兼容 wrapper；实现只保留在 `views/*`，避免重复业务逻辑。
- `index.js` 中的 AssetDeck、debug action、planner token、execution/route/vision 操作函数是过渡期兼容 wrapper；实现只保留在 `adapters/asset-adapter.js` 与 `controllers/*`。
- `index.js` 中的 `updateMapUI/applyAutoMacroLayout/syncLayerSize/fitLayerToViewport/centerViewportOnCurrentFocus` 是过渡期兼容 wrapper；实现只保留在 `views/map-view.js`。

## Index.js Final Boundary

`index.js` 当前约 3.1k 行，已不再承担大型 view/controller 实现。剩余代码主要分为：

- module lookup、ctx builders、module instance lifecycle；
- dashboard payload / ACT state / world state normalization glue；
- campaign/runtime wrapper 与 map/planner 数据查询 wrapper；
- page-level refresh flow、document/topbar/layer event delegation；
- public debug/home APIs。

这些边界继续强拆的收益较低，风险主要在于：

- payload/state helper 被 adapter、debug API、host message、runtime ctx 多向复用，拆出后容易形成更厚的 pass-through adapter；
- campaign/map/planner query wrapper 需要同时服务 shell/map/planner/intel/controller，继续拆会扩大 ctx 表面；
- page-level event delegation 依赖多个 controller/view wrapper，拆出后仍需要回调入口状态，容易制造循环 glue。

因此前三阶段后的收口策略是：`index.js` 保持为页面 composition layer，不再为“降行数”继续拆分。后续只有在出现明确新职责时再新增模块；常规维护优先更新对应 adapter/controller/view，而不是回填 `index.js`。

## Regression

```bash
node --check apps/dashboard/pages/overview/index.js
node --check apps/dashboard/pages/overview/core/boot.js
node --check apps/dashboard/pages/overview/core/state.js
node --check apps/dashboard/pages/overview/adapters/dashboard-adapter.js
node --check apps/dashboard/pages/overview/adapters/asset-adapter.js
node --check apps/dashboard/pages/overview/views/map-view.js
node --check apps/dashboard/pages/overview/views/shell-view.js
node --check apps/dashboard/pages/overview/views/intel-panel.js
node --check apps/dashboard/pages/overview/views/planner-view.js
node --check apps/dashboard/pages/overview/controllers/planner-controller.js
node --check apps/dashboard/pages/overview/controllers/debug-controller.js
node --check apps/dashboard/pages/overview/controllers/execution-controller.js
node --check apps/dashboard/pages/overview/runtime/campaign-runtime.js
node --check apps/dashboard/pages/overview/runtime/planner-runtime.js
node --check apps/dashboard/pages/overview/runtime/execution-runtime.js
```
