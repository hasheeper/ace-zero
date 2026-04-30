# ACT System Implementation

这份文档只描述 `ST/` 当前已经落地的 ACT 实现，不记录旧规划。

核心文件：

- [acezero-act-plugin.js](/Users/liuhang/Documents/acezero/ST/act/acezero-act-plugin.js)
- [acezero-schema.js](/Users/liuhang/Documents/acezero/ST/host/acezero-schema.js)
- [acezero-tavern-plugin.js](/Users/liuhang/Documents/acezero/ST/host/acezero-tavern-plugin.js)
- [index.js](/Users/liuhang/Documents/acezero/ST/Dashboard/app/pages/overview/index.js)
- [campaign-runtime.js](/Users/liuhang/Documents/acezero/ST/Dashboard/app/pages/overview/campaign-runtime.js)
- [dashboard-inject.js](/Users/liuhang/Documents/acezero/ST/host/dashboard/dashboard-inject.js)

## 1. 当前架构

当前 ACT 系统分四层：

1. Schema 层  
   `acezero-schema.js` 负责 `stat_data.hero` / `stat_data.world` 的结构规范化。

2. ACT 真相层  
   `acezero-act-plugin.js` 负责章节定义、节点拓扑、角色推导、提示词内容、`frontendSnapshot` 生成。

3. Host 编排层  
   `acezero-tavern-plugin.js` 负责读取/写回 MVU 变量、注入 prompt、消费切章请求、同步 cast 和首见提示。

4. Dashboard 渲染层  
   `overview` 只吃 `frontendSnapshot` 和 ACT runtime 数据，不再持有章节真相。

## 2. 当前章节状态

当前只注册了一个章节：

- `chapter0_exchange`

它不是旧的 5 天 demo，也不是多章节 demo。当前实现是：

- `meta.totalNodes = 16`
- `node1 ~ node3` 手写
- `node4 ~ node16` 由 ACT 生成器自动生成

### 固定前段

- `node1-entry`
- `node2-floor-high`
- `node2-floor-side`
- `node3-descent`

其中：

- `node1 -> node2A / node2B`
- `node2A / node2B -> node3`

### 生成后段

`node4 ~ node16` 走 `generatedTail.mode = "lane_backbone"`。

当前生成器特征：

- 从 `node3-descent` 接入后段
- `node4` 是 2 节点 opening
- `node5 ~ node14` 以 `3/4/5` 数量波动生成
- `node15` 收成 2 节点
- `node16` 收成 1 个终局节点

## 3. 当前地图生成规则

### 3.1 四条主线

从 `node5` 开始，后段主骨架按四条 lane 组织：

- `white`
- `blue`
- `orange`
- `red`

用途：

- 控制节点纵向分层
- 控制主线彩色连线
- 控制局部交汇时哪些边允许上彩

### 3.2 开场分色

当前开场不是四线直接展开，而是：

- `node3` 是单节点
- `node4` 分成上下两条
- `node5` 扩成四条主线

当前前端特殊分色规则：

- `node3 -> node4A` 显示为蓝
- `node3 -> node4B` 显示为橙

### 3.3 主线与灰线

当前地图不是“所有边都上彩”。

规则是：

- 每条 lane 只保留一条主彩线
- 局部交汇边默认是灰线
- 只有满足主线判定的边才允许显示为白/蓝/橙/红

这部分逻辑主要在：

- `getPreferredLaneTargetId(...)`
- `getPreferredLaneSourceId(...)`
- `getConnectionLaneKey(...)`

### 3.4 邻接约束

当前后段交汇只允许相邻位映射，不允许大跨位飞线。

例如：

- `4 -> 5`、`5 -> 4`、`3 -> 4` 这类连接都按邻接规则生成
- 额外交汇线只允许补在相邻位之间

## 4. 随机生成内容

### 4.1 节点数量

后段节点位数量不是固定模板写死，而是按 seed 生成，并受这些约束：

- `node5 = 4`
- `node14 = 4`
- 相邻位差值不超过 1
- 避免连续吐出死板模板串

### 4.2 节点标题

每个节点位都按 seed 生成唯一标题：

- `A词 x B词`

生成结果写在：

- `nodeRuntime.ui.generatedTitle`

注意：

- 原始 `narrative.title` 保留，不再被覆盖
- 左侧目录优先显示 `ui.generatedTitle`
- 同一章内保证不重复

## 5. `world.act` 当前字段

当前主字段：

- `id`
- `seed`
- `nodeIndex`
- `route_history`
- `pickedPacks`
- `limited`
- `reserve`
- `reserve_progress`
- `income_rate`
- `income_progress`
- `phase_slots`
- `phase_index`
- `phase_advance`
- `stage`
- `controlledNodes`
- `crisis`
- `crisisSignals`
- `vision`
- `resourceSpent`
- `characterEncounter`
- `pendingResolutions`
- `resolutionHistory`
- `narrativeTension`

章节外部但会参与 ACT 判定的 `world` 字段：

- `world.location.layer`：当前地区层级，取值为 `THE_COURT / THE_EXCHANGE / THE_STREET / THE_RUST`
- `world.location.site`：当前具体地点标记，可为空字符串

这些字段不属于 `world.act`，但 Dashboard commit 会和 `world.act` 一起写回 MVU，避免 Debug 面板改了地区后只停留在前端临时状态。

切章/提示相关字段：

- `pendingFirstMeet`
- `pendingTransitionTarget`
- `transitionRequestTarget`
- `pendingTransitionPrompt`

这些字段在 schema 和 host 都已经接通，即使当前只保留了初章。

### 需求稿 v0.1 接入起点

当前第一批接入的是 `docs/需求稿.md` 的第一优先级基础面：

- 四点数主键切到 `combat / rest / asset / vision`
- 旧存档 `contract / event` 兼容归并为 `asset / vision`
- `phase_slots` 支持 `amount: 1..3` 和多来源 `sources`
- 新增固定营收字段 `income_rate / income_progress`
- 接入 `controlledNodes / vision / resourceSpent`
- 预留 `characterEncounter`
- 新增 `crisisSignals` 作为危机前置信号账本；`crisis` 仍是 0-100 总值
- 新增 `pendingResolutions` 作为 Combat / Asset 外部结算接口
- 新增 `resolutionHistory` 记录外部系统已回填的 Combat / Asset 请求

当前规则边界：

- Rest / Vision 由 ACT 真相层独立结算，并通过 Host 写回 MVU。
- Combat / Asset 不在 ACT 内部伪造收益，只写入 `pendingResolutions`，等待主游戏引擎 / 剧情成长系统回填；回填后移入 `resolutionHistory`。
- Vision 固定相位替换 UI、Vision 跳线 UI、Combat / Asset 外部回填协议、Crisis 前置信号账本已经接入。
- 后续进入角色 encounter 队列接口；Combat / Asset 正式收益、Crisis 正式来源公式、角色初见资格判定仍不在 ACT 内部抢先实现。

### Crisis 前置信号接口

Crisis 当前只定义信号入口，不定义正式来源公式。

`world.act.crisis` 是当前危机总值，范围 `0-100`。`world.act.crisisSignals` 是危机来源账本：

```js
{
  id,
  source: 'combat' | 'asset' | 'vision' | 'debt' | 'node' | 'external',
  kind: '外部系统自定义类型',
  level: 0 | 1 | 2 | 3,
  delta: 0,        // 可选；由外部规则决定，ACT 只按显式 delta 改 crisis
  nodeId,
  nodeIndex,
  phaseIndex,
  status: 'open' | 'acknowledged' | 'resolved' | 'dismissed',
  summary,
  payload
}
```

ACT 模块提供：

- `appendCrisisSignalToActState(actState, signal)`
- `getCrisisSignals(actState, filters)`

Combat / Asset 外部回填 result 可附带 `crisisSignal` 或 `crisisSignals`。ACT 会继承 request 的 `type / node / phase` 作为默认上下文，并把显式 `delta` 应用到 `crisis`。

### Combat / Asset 外部回填协议

Combat / Asset 当前只定义接口，不定义正式收益。

ACT 产出的 pending request：

```js
{
  id: 'chapter0_exchange:node1-entry:0:combat:2:2',
  protocol: 'ace0.externalResolution.v1',
  type: 'combat' | 'asset',
  level: 1 | 2 | 3,
  nodeId,
  nodeIndex,
  phaseIndex,
  status: 'pending',
  sources: ['limited' | 'reserve']
}
```

外部主引擎 / 剧情成长系统消费后，回填 result：

```js
{
  id,
  type: 'combat' | 'asset',
  status: 'resolved' | 'failed' | 'cancelled',
  outcome: '外部系统自定义结果码',
  summary: '可选摘要',
  actPatch: {},   // 可选：由外部系统决定写回 world.act 的增量
  heroPatch: {},  // 可选：由外部系统决定写回 hero 的增量
  payload: {}     // 可选：外部系统原始结果，ACT 只存档不解释
}
```

ACT 模块提供三类帮助函数：

- `getPendingExternalResolutionRequests(actState, { type })`
- `applyExternalResolutionResult(actState, heroState, result)`
- `applyExternalResolutionResults(actState, heroState, results)`

回填原则：

- ACT 只校验 request 是否存在、type 是否匹配。
- `actPatch / heroPatch` 是外部系统的结果，不由 ACT 计算 Combat / Asset 收益。
- `actPatch` 不允许直接覆盖 `pendingResolutions / resolutionHistory / crisisSignals`；危机账本只能通过 `crisisSignal(s)` 入口追加。
- 默认消费成功后，该 request 从 `pendingResolutions` 移除，并写入 `resolutionHistory`。
- `consume: false` 可用于只更新 request 状态，不从队列移除。

## 12. Host / Debug 双模式

Dashboard overview 当前明确分为两种模式：

### Host Mode

Host Mode 是 SillyTavern 嵌入运行模式。

- 默认触发条件：页面被 ST iframe / Dashboard 注入层嵌入，且没有显式 `?debug=1`
- 数据来源：宿主下发的 `hero / world / frontendSnapshot`
- 写回方式：`ACE0_ACT_COMMIT` / `ACE0DashboardCommitActState`
- 状态标识：右侧 ACT 面板显示 `HOST MVU`
- 右侧 ACT 面板只显示真实 MVU / ACT 状态，不显示本地调试按钮

Host Mode 不应依赖 localStorage 里的 debug payload。即使浏览器保留了上次 debug 数据，只要页面在宿主 iframe 中运行，默认仍进入 Host Mode。

### Debug Mode

Debug Mode 是本地独立打开 Dashboard 的调试模式。

- 默认触发条件：独立打开 overview，或显式 `?debug=1`
- 数据来源：ACT 模块生成的 debug payload、本地 localStorage、或 `window.__ACE0_DEBUG_*`
- 默认章：`chapter0_exchange`；旧 `demo_rust` 空图缓存会被丢弃，避免本地调试页出现容器存在但没有地图节点的状态
- 写回方式：只写 localStorage / 本地 payload，不写 MVU
- 状态标识：右侧 ACT 面板显示 `DEBUG LOCAL` 与 seed
- 右侧 ACT 面板显示调试按钮：
  - `+COMBAT`
  - `+REST`
  - `+ASSET`
  - `+VISION`
  - `ADV NODE`
  - `RESET`

Debug Mode 用于验证：

- 四点数库存
- `amount 1..3` 相位投入
- 固定营收 `income_rate / income_progress`
- 节点推进与路线选择
- Rest 控点与 Vision 探路 / 跳线
- Combat / Asset `pendingResolutions` 与外部 result 回填接口
- Crisis 前置信号账本接口
- 角色 encounter 队列接口前的状态一致性检查

## 13. v0.1 阶段收口

当前阶段只收 `docs/需求稿.md` 里能独立闭环的基础面：

- Rest：ACT 真相层结算 Mana 回复，并写入 `controlledNodes`
- Rest 染色：Dashboard 对已放置的 Rest slot 提供 `neutral / combat / rest / asset / vision` 选择；选择资源染色会额外消耗 1 个对应点数，并通过 `phase_slots[].tint / tintSource` 写回 MVU
- Rest lane 爆发：进入新节点时检查该节点所属 lane 上的资源染色控制点；同 lane 同资源 1 个时 50% 触发给 2 点，2 个时 75% 触发给 3 点，3 个及以上必定触发给 3 点；多资源同时存在时按同类数量加权选择一种，roll 由 seed / node / lane 确定
- Rest 地图表现：被染色的过去节点在地图上保持高亮，并把节点内芯图标替换为染色后的点数类型，而不是保留原节点事件类型
- Vision 1：写入 `vision.bonusSight`
- Vision 2：写入 `vision.pendingReplace`，先作为固定相位替换接口
- Vision 3：写入 `vision.jumpReady`，进入跨 lane 跳线 route mode
- Combat / Asset：只写入 `pendingResolutions`，等待外部主引擎 / 剧情成长系统回填

本阶段明确不做：

- Combat 三档正式收益 / 失败 / 危机增长规则
- Asset 三档正式成长 / 契约 / 剧情资产结算
- 角色 encounter 的正式资格判定和投放
- Crisis 正式来源公式；当前只记录 `crisisSignals` 并按外部显式 `delta` 更新总值

## 14. Encounter 前收口检查

进入角色 encounter 队列接口前，当前代码状态为：

- `contract / event / needs_target` 只作为旧存档兼容别名保留；新状态主键统一为 `asset / vision / charged / ready`。
- 旧 debug 章 `demo_rust` 只用于丢弃空图缓存，避免本地调试页进入无节点状态。
- Debug 控件只存在于 ACT 面板；Host Mode 只展示真实 MVU / ACT 状态。
- Combat / Asset 的正式收益仍由外部主引擎 / 剧情成长系统决定，ACT 只负责 request/result 协议。
- Crisis signal 按 `id` 去重；重复 signal 不会重复应用 `delta`。
- 外部 result 的 `actPatch` 不能直接覆盖 `pendingResolutions / resolutionHistory / crisisSignals`，避免绕过队列和账本入口。

下一阶段 encounter 队列接口规划见：`ST/docs/ENCOUNTER_QUEUE_PLAN.md`。

## 15. Vision 交互接入状态

Vision 的底层 ACT 状态与 Dashboard 交互已经按以下顺序接入：

1. Vision 1 视野展示
   - ACT 继续使用 `vision.baseSight + vision.bonusSight` 表示当前可见节点跨度。
   - Dashboard 地图把可见范围内的未来节点标记为 `node-visible`，更远的未来节点标记为 `node-obscured`。
   - ACT 面板显示当前 sight 与可见节点范围。

2. Vision 2 固定相位替换
   - Vision 2 执行后，ACT 写入 `vision.pendingReplace.status = "charged"` 和 `charges`。
   - 这个 charge 不预绑定某个未来 node/phase；不用时可以跨节点保留。
   - Dashboard 在底部 phase 条抵达 fixed phase 前弹出选择。
   - 玩家可以选择 `KEEP` 保持原固定点；这不会消耗 charge。
   - 玩家选择替换点数后，写回：

```js
vision.pendingReplace = {
  status: 'ready',
  charges: 1,
  nodeId,
  nodeIndex,
  phaseIndex,
  originalKey,
  replacementKey: 'combat' | 'rest' | 'asset' | 'vision'
}
```

   - 后续到达该 node/phase 时，由 ACT 真相层把该固定相位视为替换后的普通点数相位。

3. Vision 3 跳线
   - Vision 3 执行后，ACT 写入 `vision.jumpReady = true`。
   - 节点结算进入 route 阶段时，`frontendSnapshot.routeMode = "jump"`。
   - Dashboard 在 ACT 面板内显示跳线候选节点，同时保留顶栏 route 入口。
   - 跳线候选在地图上使用 `node-jump-choice` 独立高亮，候选按钮与地图节点都会走同一条 `chooseNextRoute`。

最小烟测脚本：

```bash
node ST/scripts/act-v01-smoke-test.js
```

该脚本验证：

- Rest 2 能给主角与队内角色回 Mana，非队内角色不回
- Rest 会把当前节点写入 `controlledNodes`
- Vision 1 / 2 / 3 分别写入 `bonusSight / pendingReplace / jumpReady`
- Vision 2 会生成 charged replacement；不用可跨节点保留
- Vision 2 的 ready replacement 会在目标 phase 消费，并按替换后的点数类型执行，包括一段 fixed phase
- Vision 3 的 `frontendSnapshot.routeMode` 为 `jump`
- Combat / Asset 只生成 `pendingResolutions`

Dashboard 手测补充：

- Debug `ADV SEG` / `ADV NODE` 都必须尊重 Vision 2 fixed phase prompt。
- `ADV NODE` 内部按 segment 逐段推进；如果中途遇到 `VISION REPLACE` prompt，会停在当前相位等待 `KEEP / 替换点数`。
- 检查 Vision 2 时，不需要再避开 `ADV NODE`；若 prompt 出现，批量推进不会继续越过该相位。

## 6. 角色状态推导

当前角色状态不是手写堆在宿主层，而是从 ACT 推导。

推导来源：

- `runtime.managedCharacters`
- `runtime.initialCast`
- 节点 `cast.onEnter`
- 相位 `cast.present / introduce / joinParty / miniKnown`

当前规则：

- 属于当前章节 `managedCharacters` 的角色，默认 `activated = true`
- `introduced / present / inParty / miniKnown` 按章节、节点、相位累积推导
- 切章时 cast 会按目标章节重算，不再只增不减

核心函数：

- `createCharacterCastPatch(...)`
- `deriveHeroCastFromAct(...)`

## 7. `ace0_first_meet`

当前首见注入链路已接通，但首见来源已经从固定节点/相位配置切到 `characterEncounter` 运行态。

触发方式：

1. `world.act.characterEncounter` 把角色标记为 `first_meet / introduced`
2. ACT 派生 `hero.cast[charKey].introduced / present`
3. ACT 从 encounter runtime hint 生成 `pendingFirstMeet`
4. Host 注入 `<ace0_first_meet>`
5. 下一轮清空 `pendingFirstMeet`

## 8. 切章机制

当前切章不是“末相位自动跳章”。

当前链路是：

1. 到达终局节点后，ACT 判断是否进入“可转章”状态
2. Host 写入：
   - `pendingTransitionTarget`
   - `pendingTransitionPrompt`
3. AI 如果决定切章，必须在 `UpdateVariable` 中写：
   - `world.act.transitionRequestTarget`
4. Host 收到请求后，才会真正切换 `world.act`

当前只有初章，所以这套字段主要是保留能力，不是当前主线玩法的一部分。

## 9. Prompt 注入

当前 ACT 相关 prompt 由 host 注入：

- `ace0_act_state`
- `ace0_act_charter`
- `ace0_act_narrative`
- `ace0_first_meet`
- `ace0_act_transition`

其中：

- `ace0_act_transition` 是“可转章提示”
- 不是自动切章命令

## 10. Dashboard 当前实现点

`overview` 当前已经依赖真实 ACT 数据运行：

- 节点树
- 地图节点
- route choice
- 固定相位标记
- lane 信息
- 彩线/灰线判定

当前 sidebar 规则：

- `is-past`
- `is-active`
- `is-future`

future 节点统一灰化，不再区分 fixed/random。

## 11. Character Encounter 当前状态

角色初见队列第一版已经接入 ACT 真相层：

- `characterEncounter.meta / queue / characters` 已 normalize。
- `ENCOUNTER_RULES` 已作为第一版资格规则表存在。
- `evaluate / enqueue / place / consume / update / debugForce` 已导出。
- `advanceActToNextNode(...)` 会在进入节点后评估并投放未来 encounter。
- `placeNextCharacterEncounter(...)` 会为目标节点随机一个 `targetPhaseIndex`。
- `consumeSingleActPhase(...)` 会在命中 `nodeId + targetPhaseIndex` 时消费 placed encounter。
- `frontendSnapshot.encounterMarkers` 会把 placed first-meet 暴露给 Dashboard 地图，并携带目标段位。
- Dashboard 的 ACT 面板显示 encounter 状态，并提供 debug-only 的 ENCOUNTER DEBUG 折叠区，可查看全部 8 名角色状态并逐个 force。
- Dashboard 的 ENCOUNTER DEBUG 折叠区已接入 `MVU LOCATION`，可切换 `world.location.layer` 并立即参与 `requiredGeo` 资格判断。
- Encounter 投放候选现在按当前玩家路径拓扑查找，只会落在当前 node 向前 1-2 步可达的节点；目标节点和目标段位都由 seed 决定。
- 推进到投放节点的目标段后会写入 `pendingFirstMeet`，Host 继续复用 `<ace0_first_meet>` 注入链路。

当前仍是接口优先：

- `pre_signal` 只保留类型与状态，未做正式前置信号玩法。
- Combat / Asset 正式收益不参与 encounter，只保留 pending resolution 接口。
- Crisis、地理层、教廷事件、赌场标签等条件需要后续从正式世界上下文传入。

对应规划文档：[ENCOUNTER_QUEUE_PLAN.md](/Users/liuhang/Documents/acezero/ST/docs/ENCOUNTER_QUEUE_PLAN.md)。

## 12. 当前已知边界

### 12.1 地图拓扑

当前拓扑虽然支持复杂 DAG 味道，但仍然是“相邻节点位连接”模型，不支持跨层跳连。

### 12.2 彩线规则

彩线目前依赖：

- lane 归属
- 主线唯一进出判定
- 少量手工特殊边映射

如果以后继续大改拓扑，需要同步调整 `index.js` 里的彩线判定。

### 12.3 `dashboard-inject.js`

这是构建产物。  
前端逻辑改完后，要重建一次：

```bash
node scripts/build-dashboard-inject.mjs
```

## 13. 当前参考顺序

要看当前实现，建议按这个顺序读：

1. [acezero-schema.js](/Users/liuhang/Documents/acezero/ST/host/acezero-schema.js)
2. [acezero-act-plugin.js](/Users/liuhang/Documents/acezero/ST/act/acezero-act-plugin.js)
3. [acezero-tavern-plugin.js](/Users/liuhang/Documents/acezero/ST/host/acezero-tavern-plugin.js)
4. [campaign-runtime.js](/Users/liuhang/Documents/acezero/ST/Dashboard/app/pages/overview/campaign-runtime.js)
5. [index.js](/Users/liuhang/Documents/acezero/ST/Dashboard/app/pages/overview/index.js)
