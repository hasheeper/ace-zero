# Character Encounter Queue Plan

本文档规划角色 encounter 队列接口。范围只覆盖“初见资格 -> 队列 -> 投放到附近节点 -> 踩上后只触发一次 -> 地图头像/debug 展示”的系统接口；不写正式剧情文本，不替代 Combat / Asset / Crisis 的正式规则。

## 1. 需求对照

来自 `docs/需求稿.md` 的硬约束：

- RINO 是初始角色，不走 encounter 初见系统。
- 初见系统用于 `SIA / TRIXIE / POPPY / COTA / VV / KUZUHA / KAKO / EULALIA`。
- 角色不是固定挂在某个 node 上，而是在玩家满足条件后，刷新到玩家附近可接触路径上。
- 投放距离不超过 2 个 nodes。
- 每个 node 最多 1 个正式初见。
- 每个 node 最多 1 个前置信号。
- 正式初见后至少冷却 1 个 node，再允许下一个正式初见。
- 多个角色同时满足条件时进入队列。
- 玩家踩上正式初见节点后，该角色本轮不再重复触发。

当前实现现状（2026-04-27）：

- `world.act.characterEncounter` 已固化为 `meta / queue / characters`，并有 normalize、状态迁移和 smoke 覆盖。
- `ace0_first_meet` prompt 注入链路已接通；首见文案来源现在只允许走 `characterEncounter` 运行态，不再读取固定 node/phase 的 `first_meet` 配置。
- Dashboard 已有角色头像来源：`ST/Dashboard/app/shared/characters.js` 中的 `avatarUrl / portraitUrl`。
- `frontendSnapshot.encounterMarkers` 已接入地图 UI，placed first-meet 会在未来节点显示角色头像角标。
- Debug 面板已接入专门的 `ENCOUNTER DEBUG` 折叠区，可查看全部 8 名角色的满足/阻塞状态，并逐个 FORCE。
- `advanceActToNextNode(...)` 已挂 `enqueue -> place`；正式消费点在 `consumeSingleActPhase(...)`，必须推进到目标节点的目标段才触发。

## 2. 非目标

本阶段不做：

- 不做完整剧情包或正式初见文本创作。
- 不做 Combat / Asset 的正式收益对 encounter 的复杂联动。
- 不做 Crisis 正式来源公式。
- 不做 8 个角色所有资格规则的最终调参，只先把规则表、队列接口、debug 可观测性做出来。

## 3. 状态模型

建议将 `world.act.characterEncounter` 固化为：

```js
characterEncounter: {
  meta: {
    version: 1,
    lastFirstMeetNodeIndex: 0,
    lastSignalNodeIndex: 0
  },
  queue: [
    {
      id: 'enc:chapter0_exchange:SIA:first_meet:node6:0',
      charKey: 'SIA',
      type: 'first_meet',
      status: 'queued' | 'placed' | 'triggered' | 'expired' | 'cancelled',
      targetNodeId: 'node6-xxx',
      targetNodeIndex: 6,
      targetPhaseIndex: 0,
      createdNodeIndex: 4,
      expiresNodeIndex: 7,
      priority: 80,
      reasonCodes: ['node_index', 'spent_weight'],
      debugLabel: 'SIA / anomaly audit'
    }
  ],
  characters: {
    SIA: {
      status: 'locked' | 'eligible' | 'queued' | 'pre_signal' | 'first_meet' | 'introduced',
      firstMeetDone: false,
      preSignalDone: false,
      cooldownUntilNodeIndex: 0,
      queuedRequestId: '',
      placedNodeId: '',
      introducedNodeId: '',
      introducedAtNodeIndex: 0,
      lastEvaluatedNodeIndex: 0,
      reasonCodes: []
    }
  }
}
```

说明：

- `characters[charKey].firstMeetDone = true` 是“踩上后不会再触发”的主开关。
- `status = introduced` 是可读状态，方便 prompt / debug / UI 判断。
- `queue[].status = triggered` 是事件账本，保留一次触发记录，方便 debug 回看。
- `placedNodeId` 用来驱动地图头像显示。
- `targetPhaseIndex` 表示目标节点内的触发段位；投放时会随机落到 0-3 段之一。

## 4. 角色规则表

新增 ACT 内部规则表，先作为数据，不把剧情写死：

```js
ENCOUNTER_RULES = {
  SIA: {
    category: 'condition',
    minDay: 3,
    minNodeIndex: 5,
    spentWeights: { combat: 2, rest: 1, asset: 1, vision: 2 },
    minSpentScore: 15,
    crisisMin: 0,
    laneWeights: ['mid_low', 'low', 'mid_high', 'high'],
    preSignalPreferred: false,
    rarity: 2
  }
}
```

第一版角色规则只做“可计算字段”：

- `minDay`
- `minNodeIndex`
- `minSpentScore`
- `spentWeights`
- `crisisMin`
- `requiredTags`
- `requiredIntroduced`
- `requiredGeo`
- `requiresChurchEvent`
- `preSignalPreferred`
- `rarity`

其中 `requiredGeo` 第一版已经接入 `world.location.layer`：

- `THE_COURT`
- `THE_EXCHANGE`
- `THE_STREET`
- `THE_RUST`

Debug 面板的 `ENCOUNTER DEBUG / MVU LOCATION` 会直接写回 `world.location.layer`，并让资格扫描读取同一个变量；Host Mode 下则读取宿主 MVU 当前地区。对需求稿中仍依赖“教廷事件”等剧情前置的角色，继续允许规则返回 `blocked: missing_context` 或对应 reason，不在 ACT 内部硬猜剧情事实。

## 5. 队列流程

### 5.1 资格评估

入口建议：

```js
evaluateCharacterEncounterEligibility(actState, heroState, context)
```

输出：

```js
{
  eligible: [
    { charKey, score, priority, reasonCodes, ruleSnapshot }
  ],
  blocked: [
    { charKey, reasonCodes }
  ]
}
```

评估顺序：

1. 跳过 `RINO`。
2. 跳过 `firstMeetDone === true` 或 `status === 'introduced'` 的角色。
3. 跳过已经 `queued / placed / first_meet` 的角色。
4. 检查 node/day/crisis/resourceSpent/geo/tag/prerequisite。
5. 计算 priority，交给队列排序。

### 5.2 入队

入口建议：

```js
enqueueEligibleCharacterEncounters(actState, heroState, options)
```

规则：

- 每次节点推进后评估一次。
- 同一角色最多存在一个 active request。
- 如果当前初见冷却未结束，只把角色保持为 `eligible`，不进入正式投放。
- 多人同时 eligible 时进入 `queue`，按需求稿排序因子排优先级。

### 5.3 投放

入口建议：

```js
placeNextCharacterEncounter(actState, frontendSnapshot, options)
```

投放规则：

- 只投放到当前节点前方 1-2 nodes 的可接触路径。
- 不投放到已经过去的节点。
- 不投放到当前节点，避免“刚评估就立刻触发”导致玩家没有可见预告。
- 一个 node 已有正式初见 marker 时，跳过。
- 投放到节点后，同时随机一个 `targetPhaseIndex`。
- 如果没有合法节点，保留 queued，下一次节点推进再试。
- `pre_signal` 可作为以后扩展；第一版 debug 可只实现 first_meet marker。

### 5.4 目标段触发

入口建议：

```js
consumeCharacterEncounterForNode(actState, nodeId, options)
```

触发规则：

- 玩家进入 `targetNodeId` 只显示头像预告，不立刻触发。
- 玩家推进到 `targetPhaseIndex` 对应段位时触发。
- 把 request 从 `placed` 改为 `triggered`。
- 把角色状态改为 `introduced`。
- 设置：
  - `firstMeetDone = true`
  - `introducedNodeId = nodeId`
  - `introducedAtNodeIndex = actState.nodeIndex`
  - `cooldownUntilNodeIndex = actState.nodeIndex + 1`
  - `meta.lastFirstMeetNodeIndex = actState.nodeIndex`
- 清空 `queuedRequestId / placedNodeId`。
- 后续评估永远跳过 `firstMeetDone === true` 的角色。

## 6. 与 `ace0_first_meet` 注入的关系

现有 `<ace0_first_meet>` 注入仍然复用，但旧的固定 node/phase `first_meet` 读取链路已经移除。

Encounter 不改章节节点配置，而是在触发节点时生成 runtime hint：

```js
pendingFirstMeet: {
  SIA: 'SIA 首次在主角视野里具象化...'
}
```

然后复用现有 Host 注入：

- `consumeCharacterEncounterForNode(...)` 产出 `firstMeetHints`
- `createCharacterCastPatch(...)` 或 Host commit 阶段把角色 `introduced = true / present = true`
- Host 注入 `<ace0_first_meet>`

这样 encounter 不是“写死在固定节点”，但仍能使用当前首见 prompt 能力。

## 7. 地图头像显示

`frontendSnapshot` 新增：

```js
encounterMarkers: [
  {
    id,
    charKey: 'SIA',
    type: 'first_meet',
    status: 'placed',
    nodeId,
    nodeIndex,
    phaseIndex: 0,
    label: 'SIA',
    debugLabel: 'SIA / anomaly audit',
    reasonCodes: ['spent_weight', 'node_index']
  }
]
```

Dashboard 渲染：

- 地图节点读取 `encounterMarkers`。
- 对 marker 对应 node 加 `node-encounter` class。
- 节点内显示角色头像小徽章：
  - 优先 `characters.js` 的 `avatarUrl`
  - 其次 `portraitUrl`
  - 最后显示角色首字母
- 如果该 node 同时有 Rest 染色图标，头像徽章作为角标，不替换节点内芯资源图标。
- `pre_signal` 后续可用半透明头像或问号徽章；正式初见用清晰头像。

## 8. Debug 设计

Debug 面板只放在 ACT 面板内。

建议新增 debug 行：

- `ENCOUNTER SCAN`
  - 只评估资格，不改状态。
  - 输出 eligible / blocked 数量和原因。

- `QUEUE ENCOUNTER`
  - 执行资格评估 + 入队 + 尝试投放。
  - 用当前 debug payload 写回 localStorage。

- `FORCE SIA / FORCE COTA`
  - 第一版可选，用于快速验证地图头像和踩上消费。
  - 只在 Debug Mode 出现，Host Mode 不显示。

- `MVU LOCATION`
  - 直接切换 `world.location.layer`。
  - 用于验证 `requiredGeo` 与 MVU 变量是否一致。
  - 切换后下一次 scan / force 会用新的地理上下文。

- `CLEAR ENCOUNTER`
  - 清空 `characterEncounter.queue` 和未触发 placed marker。
  - 不清空 `firstMeetDone`，除非另有 `RESET`。

ACT 面板展示：

```text
ENCOUNTER
  queued: 2
  placed: SIA -> NODE_06
  cooldown: 1 node
  done: COTA
```

地图验证路径：

1. Debug 下点 `QUEUE ENCOUNTER`。
2. 地图未来 1-2 nodes 出现角色头像。
3. `ADV NODE` 踩到该节点。
4. 头像消失，ACT 面板显示该角色 `introduced / done`。
5. 再次 `QUEUE ENCOUNTER` 不再为该角色生成 marker。

## 9. Host / MVU 写回

Host Mode 的真相写回只以 `world.act` 为入口。Dashboard commit 桥当前只持久化 `world.act`，不直接写 `hero.cast`。

闭环字段：

- `world.act.characterEncounter`
- `frontendSnapshot.encounterMarkers`
- `world.act.pendingFirstMeet`

派生字段：

- `hero.cast[charKey].introduced / present`

这些 cast 字段不由 Dashboard 直接提交，而是在 Tavern 插件生成前通过 ACT 派生后写回 MVU：

1. Dashboard / Debug 只提交 `world.act.characterEncounter`。
2. ACT 模块从 `characterEncounter` 派生当前节点的角色状态与首见 hint。
3. Tavern 插件 `synchronizeActCharacterState(...)` 调用 `deriveCharacterStatesFromActState(...)` 和 `createCharacterCastPatch(...)`。
4. 插件把 `hero.cast` patch 与 `world.act.pendingFirstMeet` 写回 MVU。
5. 同一轮生成前，Host 注入 `<ace0_first_meet>`。

写回原则：

- Dashboard 不自行决定角色是否已初见，只提交用户动作。
- ACT 模块负责 normalize、入队、投放、踩上消费。
- Host commit ACK 仍沿用现有 MVU 链路。

已完成的 schema / normalize 清洁：

- `ST/act/acezero-act-plugin.js`
  - `DEFAULT_WORLD_ACT.pendingFirstMeet = {}`
  - `normalizeActState(...)` 保留并清洗 `pendingFirstMeet`
  - `deriveCharacterStatesFromActState(...)` 读取 `characterEncounter`，把 triggered encounter 对应角色设为 `introduced / present`
  - `createCharacterCastPatch(...)` 能从 encounter runtime hint 生成 `firstMeetHints`
- `ST/host/acezero-schema.js`
  - `makeDefaultActState()` 与 `WorldActSchema` 增加 `pendingFirstMeet`
  - transform 阶段保留 `{ [charKey]: hintText }`
- `ST/host/acezero-tavern-plugin.js`
  - 已有 `pendingFirstMeet` 注入、楼层闸门和清空逻辑；encounter 只需要接入同一字段，不另起注入通道。

## 9.1 节点流程闭环

现有 ACT 节点推进关键点：

- `resolvePendingAdvanceState(...)` 结算 phase。
- 节点结束进入 `resolveActNodeTransition(...)`。
- forced / 单选路线会调用 `advanceActToNextNode(...)` 自动进入下一节点。
- Dashboard Debug 的 `ADV NODE` 也优先走 `resolvePendingAdvanceState(...)`。
- 手动选路走 `chooseNextRoute(...)`，最终也会进入下一节点并 commit。

Encounter 必须挂在 ACT 真相层，而不是只挂 Debug 按钮：

```js
advanceActToNextNode(actState, config) {
  // 1. nodeIndex / stage / vision / phase reset
  // 2. node rewards / Rest lane burst
  // 3. evaluate + enqueue + place future encounters
}
```

推荐顺序：

1. 进入新节点后不消费当前节点已有 `placed` encounter，只显示地图预告。
2. 在 `consumeSingleActPhase(...)` 中命中 `nodeId + targetPhaseIndex` 时消费 encounter。
3. 如果消费成功，写入 `pendingFirstMeet`、`firstMeetDone`、`status = introduced`。
2. 如果消费成功，写入 `pendingFirstMeet`、`firstMeetDone`、`status = introduced`。
3. 再执行下一轮 eligibility scan / enqueue / place，把新 encounter 投到未来 1-2 nodes。
4. 生成 `frontendSnapshot.encounterMarkers`，只展示仍为 `placed` 的未来 marker。

这样 Host、Debug、forced route、manual route 都走同一条 ACT 真相层，不会出现 Debug 能触发而 MVU/Host 不触发的分叉。

## 10. Smoke 测试计划

新增 `ST/scripts/act-encounter-smoke-test.js` 或并入现有 `act-v01-smoke-test.js`：

必须覆盖：

1. RINO 不进入 encounter 队列。
2. eligible 角色能入队。
3. 投放节点距离当前节点不超过 2。
4. 一个 node 不会投放两个正式初见。
5. 踩上节点后 request 变 `triggered`，角色变 `introduced`。
6. `firstMeetDone = true` 后再次评估不会重复入队。
7. 初见冷却未结束时，不投放下一位正式初见。
8. `frontendSnapshot.encounterMarkers` 能反映 placed 状态。

## 11. 分阶段实现顺序

### Phase A: 结构与 normalize

- 固化 `characterEncounter.meta / queue / characters`。
- 增加角色状态 normalize。
- 保留旧 `{ SIA: {} }` 形态迁移。

状态：已完成。

### Phase B: 规则表与资格扫描

- 增加 `ENCOUNTER_RULES`。
- 实现 eligibility scan。
- Debug 面板显示 scan 结果。

状态：已完成第一版。规则表字段已接入，`missing_day / missing_geo / missing_church_event` 等上下文缺口会以 blocked reason 暴露，不硬猜剧情条件。

### Phase C: 入队与投放

- 实现 enqueue / place。
- `frontendSnapshot.encounterMarkers` 接入。
- 地图节点显示头像徽章。
- 投放时随机一个目标段位，marker/panel 显示该段位。

状态：已完成第一版。正式初见只投当前节点沿 topology 向前 1-2 步可达的路径节点；已有 placed marker 的 node 会跳过；目标节点与目标段位均为 seed 驱动随机。

### Phase D: 目标段消费

- 节点进入时保留 marker。
- 推进到目标段时消费 marker。
- 写入 `introduced / firstMeetDone / pendingFirstMeet`。
- 确认同角色不重复触发。

状态：已完成。消费点在 `consumeSingleActPhase(...)`，只有推进到目标节点的目标段才触发；触发后 marker 消失，同角色再次 force/scan 不会重复投放。

### Phase E: Debug smoke

- 增加 debug 按钮。
- 增加 smoke 测试。
- 文档回写当前完成状态。

状态：已完成。`ST/scripts/act-v01-smoke-test.js` 覆盖 debug force、地图 marker、进入节点不立刻消费、目标段消费、`pendingFirstMeet` 写入和重复触发保护。

## 13. 当前代码接口

ACT 模块已导出：

- `evaluateCharacterEncounterEligibility(actState, heroState, context)`
- `enqueueEligibleCharacterEncounters(actState, heroState, options)`
- `placeNextCharacterEncounter(actState, config, options)`
- `consumeCharacterEncounterForNode(actState, nodeId, options)`
- `updateCharacterEncountersForNodeEntry(actState, heroState, config, context)`
- `debugForceCharacterEncounter(actState, charKey, config, options)`

Dashboard 当前只直接操作 debug 接口；正式 Host 写回仍以 `world.act` 为唯一真相。

## 14. 后续仍未完成

- `pre_signal` 仍是接口保留，尚未做前置信号正式投放和 UI 表现。
- `Crisis` 正式来源公式尚未接入，当前 eligibility 只读取已有 `act.crisis`。
- `Combat / Asset` 正式收益仍不参与 encounter，只保留 pending resolution 接口。
- `EULALIA` 的教廷事件、`COTA` 的赌场标签需要后续从正式世界/节点上下文传入。
- 多角色同时 eligible 的长期排序、过期、前置信号容量仍需在下一阶段细化。

## 12. 需要先确认的点

实现前有两个规则点需要避免误接：

1. `pre_signal` 第一版是否只做接口和 debug 状态，不在地图上正式显示。
2. `first_meet` 当前已经按“目标节点内随机段位”触发，不再是进入节点立刻触发。

推荐默认：

- 第一版先做正式初见 marker，不做前置信号 UI。
- 初见投放会同时随机目标段位，只有推进到该段位才写 `pendingFirstMeet`。
