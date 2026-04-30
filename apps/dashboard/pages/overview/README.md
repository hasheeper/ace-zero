# Overview Architecture

`overview` 现在是 Dashboard 的 ACT 渲染页，不再持有章节真相。

## 当前职责

- 渲染 `frontendSnapshot`
- 渲染节点树、地图、路线、相位、planner
- 处理 debug / host 双模式
- 处理 lane 节点、主线彩线、灰色交汇线

## 模块分层

- [index.js](/Users/liuhang/Documents/acezero/apps/dashboard/pages/overview/index.js)
  页面主引擎、事件绑定、宿主桥、DOM 渲染

- [campaign-runtime.js](/Users/liuhang/Documents/acezero/apps/dashboard/pages/overview/campaign-runtime.js)
  节点模板、route options、topology、node catalog 读取

- [planner-runtime.js](/Users/liuhang/Documents/acezero/apps/dashboard/pages/overview/planner-runtime.js)
  planner 状态、phase slot、inventory、编辑约束

- [execution-runtime.js](/Users/liuhang/Documents/acezero/apps/dashboard/pages/overview/execution-runtime.js)
  节点推进、phase 执行、forced next、route choice

- [config.debug.js](/Users/liuhang/Documents/acezero/apps/dashboard/pages/overview/config.debug.js)
  debug 启动配置

- [config.tavern.js](/Users/liuhang/Documents/acezero/apps/dashboard/pages/overview/config.tavern.js)
  host 启动配置

## 当前数据入口

### Debug

- 本地构建 ACT payload
- 应用到 overview

### Host

- 宿主下发 `hero / world / frontendSnapshot`
- overview 只消费真实 payload

## 当前地图逻辑

当前 overview 已经内建：

- 节点位自动排布
- lane 类
- 主彩线判定
- 灰色交汇线判定
- finale / boss 节点外观

当前 sidebar 已统一为三态：

- `is-past`
- `is-active`
- `is-future`

future 节点统一灰化。

## 当前注意点

- 章节真相不要写回 overview
- 新主线通过 [containers/app.html](/Users/liuhang/Documents/acezero/containers/app.html) 作为 GitPage App 加载 Dashboard，不再要求把 Dashboard 本体打包进 `dashboard-inject.js`。
- 如果改了拓扑或 lane 规则，要同步检查 `index.js` 里的彩线判定

## 参考

- [ACT_IMPLEMENTATION.md](/Users/liuhang/Documents/acezero/ST/docs/ACT_IMPLEMENTATION.md)
