# Encounter 下一阶段规划

> 当前事实状态见 `st/docs/CURRENT_ACT_STATUS.md`。
> 原始需求约束见 `st/docs/需求稿.md`。

## 1. 下一阶段目标

Encounter v0.2 的目标不是重写已完成的队列闭环，而是把第一版 debug 可跑系统推进到正式玩法可承载状态。

本阶段拆成 6 个实施阶段：

| 阶段 | 名称 | 目标 | 交付结果 |
|---|---|---|---|
| Phase 1 | 正式上下文接入 | 让 encounter 资格判断读取真实世界变量，而不是只靠 debug 假数据 | Host 读取正式 MVU，Debug 使用 `encounterContext` override |
| Phase 2 | 资格规则细化 | 让 8 名角色的 READY / BLOCKED 原因稳定、可解释、可测试 | 角色规则表统一，blocked reason codes 可读 |
| Phase 3 | `pre_signal` 正式玩法 | 给稀有角色做前置信号，不直接解锁 Dossier | `pendingPreSignal`、pre-signal marker、pre-signal prompt |
| Phase 4 | 节奏与待生效序列 | 避免刚遇到角色马上又刷，同时让 eligible 角色进入待生效序列而不是互相顶掉 | encounter sequence、first-meet cooldown、统一投放调度 |
| Phase 5 | Prompt 与 MVU 写回收口 | 保证 first meet / pre-signal 从 ACT 到 Host 到 Dossier 同链路持续稳定 | pending 清理、cast / Dossier 同步、Host 边界补测 |
| Phase 6 | 测试与 smoke | 把关键路径固定成自动验证 | runtime / context / UI smoke 覆盖 |

核心目标：

- 角色初见不再只依赖 debug 手动 FORCE。
- 资格判断能读取正式世界上下文。
- 前置信号 `pre_signal` 成为真正玩法，而不是只保留枚举值。
- 角色投放节奏自然，不会刚遇到角色马上又刷下一个正式初见。
- Host / Debug / Dossier / Prompt 注入保持同一条真相链路。

阶段验收标准：

- Phase 1 完成后，Cota / Eulalia 这类依赖 tag / flag 的角色可以在 Debug 面板中明确看到阻塞和解除阻塞。
- Phase 2 完成后，8 名角色的规则不再散落，所有 `blocked` 都能解释到具体字段。
- Phase 3 完成后，`pre_signal` 可以触发提示但不会解锁 Dossier。
- Phase 4 完成后，eligible 角色会进入待生效序列；投放调度只在节奏允许时把序列项变成 placed，不会顶掉已有目标。
- Phase 5 完成后，Host / Debug 下 first meet 和 pre-signal 的 pending 生命周期、角色状态同步和 Dossier 解密边界都有补测。
- Phase 6 完成后，Encounter 主路径有 smoke 覆盖，后续改规则不容易悄悄断线。

当前不把 Combat / Asset 正式收益纳入本阶段。

Combat 和 Asset 仍然只保留 `pendingResolutions` 外部接口，最后接入。原因是它们牵涉赌局、小玩法、角色成长、契约、技能、经济资产、负债、失败惩罚和剧情后果，不应该在 Encounter 阶段提前伪造结果。

## 2. 设计边界

### 2.1 ACT 负责的内容

ACT 真相层负责：

- normalize `world.act.characterEncounter`
- 判断角色是否 eligible
- 入队 `queue`
- 投放 placed marker
- 选择目标 node / phase
- 消费目标 phase
- 写入 `pendingFirstMeet`
- 标记 `firstMeetDone`
- 输出 `frontendSnapshot.encounterMarkers`

### 2.2 外部世界负责的内容

外部世界 / Tavern / 剧情系统负责提供上下文：

- 当前日期 / 回合
- 当前地理层级
- 当前地点 site
- 当前场景 tags
- 剧情 flags
- 教廷事件是否触发
- 赌场 / 荷官 / 赌桌等场所标签
- 角色是否已正式认识
- funds / 资产等经济信息

ACT 不硬猜剧情事实。

### 2.3 Dashboard 负责的内容

Dashboard 负责：

- 显示 encounter 状态。
- 显示阻塞原因。
- Debug Mode 下允许改上下文变量。
- 显示地图节点 marker。
- 显示目标 SEG 固定事件头像。
- 在正式初见后刷新 Dossier 解密状态。

## 3. 第一阶段：正式上下文接入

状态：第一版已接入。

当前已完成：

- `encounterContext` 已降级为 Debug-only override，不再作为 Host 正式上下文来源。
- Runtime 资格判断会读取 `funds / tags / storyFlags / resourceSpent`。
- Tavern Host 侧会从正式 MVU `world.current_time / world.location / world.tags / world.flags / world.storyFlags / hero.funds / world.act.resourceSpent` 组装 encounter context。
- Dashboard Debug 面板已提供 `SCENE TAGS / STORY FLAGS / FUNDS` 控件。
- Dashboard Debug 面板已拆出两种投放入口：
  - `FREE`：自由添加，等同 debug force，指定角色无视资格条件投放到路径。
  - `RULE ADD`：限制条件添加，只从当前 eligible 角色中自动投放到路径。
- Cota 可通过 casino / gambling / dealer / card table tag 验证阻塞与解除阻塞。
- Eulalia 可通过 `church_event_triggered` 验证阻塞与解除阻塞。
- Phase 1 收口检查已通过：`FREE` 与 `RULE ADD` 分离，前者无视条件，后者只按 eligible 自动投放。

### 3.1 统一 Encounter Context

Runtime 内部仍使用一个标准上下文输入，但它是派生对象，不是 Host 必须持久化的 MVU 字段：

```js
encounterContext = {
  geo,
  site,
  tags: [],
  storyFlags: {},
  funds,
  introducedCharacters: []
}
```

来源优先级：

1. Host Mode 从正式 MVU / Tavern runtime 派生。
2. Debug Mode 从 ACT 面板控件读取，并临时写入 `world.encounterContext` override。
3. 缺失字段返回明确 `blocked` reason，不猜默认成立。

### 3.2 需要接入的正式变量

地理：

- `world.location.layer`
- `world.location.site`

场景标签：

- `world.tags`
- `world.flags`
- `world.storyFlags`
- `casino`
- `gambling_hall`
- `dealer`
- `card_table`
- `church`
- `audit`
- `rust`
- `market`

剧情 flags：

- `church_event_triggered`
- `sia_introduced`
- `poppy_introduced`
- `vv_introduced`

经济：

- `hero.funds` 或当前 MVU 经济字段。

### 3.3 Debug 面板扩展

现有 `MVU LOCATION` 保留，并增加：

- `SCENE TAGS`
- `STORY FLAGS`
- `FUNDS`
- `CRISIS`

Debug 面板要能看到每个角色的：

- `READY`
- `BLOCKED`
- `PLACED`
- `DONE`
- 具体 reason codes

验收标准：

- Cota 缺少 casino tag 时显示 blocked。
- 切入 casino tag 后 Cota 变为 eligible。
- Eulalia 缺少 church flag 时显示 blocked。
- 打开 church flag 后 Eulalia 可进入 eligible 判定。

## 4. 第二阶段：资格规则细化

状态：前五阶段收口已复核。

当前已完成：

- Runtime 规则字段已兼容统一命名：
  - `minSpentScore` 作为主要投入强度门槛
  - `requiredCharacters` 兼容旧 `requiredIntroduced`
- 规则表已改用统一字段名。
- Debug 面板 blocked reason 已从机器码转成可读说明。
- 规则结果会输出 `requirements` 摘要，Debug 面板可显示具体门槛，例如 `funds 100/2501`、`spent 12/45`。
- `optionalGeo / laneWeights / priority / rarity` 已进入优先级计算，不再只是文档字段。
- 8 名角色规则已完成第一轮逐个校准：
  - Sia：异常行动 / Vision / Combat 加权。
  - Trixie：高 Combat / spentScore。
  - Poppy：底锈 + funds。
  - Cota：赌场 / 赌桌 / 荷官场景 tag。
  - VV：资金 + Asset 加权。
  - Kuzuha：底锈 + Poppy 前置。
  - Kako：Sia 前置 + 高 spentScore。
  - Eulalia：教廷事件 + `VV 已触发` 或高 spentScore。

### 4.1 角色规则表整理

每个角色规则统一成：

```js
{
  minNodeIndex,
  minSpentScore,
  minFunds,
  requiredGeo: [],
  optionalGeo: [],
  requiredTags: [],
  requiredFlags: [],
  requiredCharacters: [],
  spentWeights: {
    combat,
    rest,
    asset,
    vision
  },
  minSpentScore,
  laneWeights,
  rarity,
  priority
}
```

当前点数阈值策略：

- 只降低 `minSpentScore`，不降低地理 / tag / 资金 / 前置角色门槛。
- 早期角色应在 1-2 次相关投入后接近可触发。
- 中后期角色应在 3-5 次相关投入后可自然满足。
- Combat / Asset 正式玩法收益仍不提前接入，只使用 ACT 已记录的 `resourceSpent`。

### 4.2 第一版角色规则目标

Sia：

- 条件型。
- 不强依赖地理。
- 关注异常行动、Vision、Combat。

Trixie：

- 条件型。
- 依赖高 Combat / 高 spentScore。

Poppy：

- 地理型。
- 依赖 `THE_RUST`。
- 依赖资金或可偷价值。

Cota：

- 地理 / 场所型。
- 依赖 casino / gambling / dealer tag。
- 中市高权重，上庭 / 下街低权重。

VV：

- 混合型。
- 依赖资金、Asset。

Kuzuha：

- 混合型。
- 依赖 `THE_RUST`。
- 依赖 Poppy 已触发。

Kako：

- 混合型。
- 依赖 Sia 已触发。
- 依赖高 spentScore。

Eulalia：

- 晚期稀有型。
- 依赖 church event。
- 依赖 VV 或高 spentScore。

验收标准：

- 每个角色 blocked reason 可解释。
- Debug 面板切变量后资格变化即时可见。
- 已 introduced 的角色不再入队。
- 已 placed 的角色再次 FORCE 不会投放别人。

## 5. 第三阶段：pre_signal 正式玩法

`pre_signal` 的目标是给稀有角色做铺垫，不直接解锁 Dossier。

状态：前五阶段收口已复核。

当前已完成：

- `preSignalPreferred` 角色首次 eligible 时会先投放 `pre_signal`。
- `pre_signal` 使用同一套路径投放和目标 SEG 消费逻辑，默认只投到玩家路径的下一节点。
- 完成 `pre_signal` 后，后续正式 `first_meet` 同样默认投到下一节点，避免跨 2 个节点导致节奏过远。
- 消费后写入 `preSignalDone = true` 和 `pendingPreSignal`。
- 消费 `pre_signal` 不写 `firstMeetDone`，不写 `pendingFirstMeet`，不解锁 Dossier。
- 已完成 `pre_signal` 的角色再次 eligible 时会投放正式 `first_meet`，并获得优先级加成。
- Dashboard 地图 marker / phase SEG / ACT 面板会区分 `SIG` 与 `MEET`。
- Tavern Host 会把 `pendingPreSignal` 注入为 `<ace0_pre_signal>`，只提示线索/异常/委托/监视，不加载角色 full doc，不解锁 Dossier。

### 5.1 状态规则

新增流程：

```text
locked -> eligible -> queued(pre_signal) -> pre_signal -> queued(first_meet) -> first_meet -> introduced
```

pre_signal 消费后：

- `preSignalDone = true`
- 不写 `firstMeetDone`
- 不写 Dossier introduced
- 可写入 `pendingPreSignal`
- 提高该角色后续 first_meet priority

### 5.2 适用角色

优先做：

- VV
- Eulalia
- Kako

Trixie / Poppy / Cota / Sia / Kuzuha 当前先直接 first_meet，不强制 pre_signal。

### 5.3 UI 表现

地图 marker 需要区分：

- `pre_signal`
- `first_meet`

Phase SEG 也需要区分：

- 前置信号图标
- 正式初见头像

验收标准：

- pre_signal 触发后 Dossier 仍加密。
- pre_signal 触发后角色状态显示 `PRE-SIGNAL` 或类似状态。
- 后续 first_meet 投放优先级提高。
- 同一节点最多 1 个 pre_signal。

## 6. 第四阶段：节奏与待生效序列

Phase 4 不再做硬容量配额。

不设“一轮必须只见 4-5 人”这种全局上限。Encounter 应该由玩家路径、上下文、前置条件和危机自然决定谁出现；系统只负责避免体验上太挤、太机械、太连续。

状态：第一版已接入。

当前已完成：

- `enqueueEligibleCharacterEncounters()` 默认只写入 queued，不再隐式投放。
- 显式 `place:true`、节点进入、Debug `RULE ADD`、Debug `FREE` 都统一走 `placeNextCharacterEncounter()` 调度。
- `limit` 不再被已 active 的角色吃掉；会继续扫描 eligible 列表直到真正入队达到上限。
- 已有 placed marker 时，新 FREE 角色会保留为 queued，不会顶掉原 placed。
- first_meet 消费后可以立即调度下一条，但目标最早只能落到下一节点。
- 调度器不会把新的 first_meet 放回当前节点当场触发。

### 6.1 节奏目标

核心目标：

- 不能刚正式遇到一个角色，马上下一段或同节点又刷另一个正式初见。
- 至少到下一节点，才允许新的正式 `first_meet` 生效。
- `pre_signal` 可以比正式初见更轻，但也应该走同一套序列调度，不直接绕开系统。
- 已经排入路径的 encounter 不应被新 eligible 角色顶掉。
- Debug 的 `FREE` 可以绕过资格条件，但不应该绕过“指定角色只投指定角色”和“不顶掉已有 placed”的基本约束。

### 6.2 待生效序列

把当前“eligible 后立刻尝试投放”的路径，收敛成统一序列：

```text
eligible
  -> queued              // 待生效序列，只记录谁准备出现
  -> placed              // 调度器找到合适的下一节点/SEG 后才投放
  -> triggered           // 玩家推进到目标 SEG 后消费
```

原则：

- `enqueueEligibleCharacterEncounters()` 只负责把 eligible 角色写入 `queue`，默认不直接抢投。
- 新 eligible 角色如果已有同角色 active queue / placed，不重复入队。
- 新 queued 项不会取消、覆盖、替换已有 placed 项。
- `placeNextCharacterEncounter()` 成为唯一调度入口，负责从 queue 中挑选一个当前允许生效的项目。
- 节点进入、Debug `RULE ADD`、Debug `FREE` 都统一走这个调度入口。
- 如果当前已有 placed marker，queue 保留为 queued，等 marker 消费后再尝试。

### 6.3 节奏阀

建议固化：

- 正式 `first_meet` 消费后，下一个 `first_meet` 可以 placed，但目标必须是未来节点，不能是当前节点。
- 同一目标 node 默认只允许 1 个 active encounter marker。
- 同一角色同一时间只允许 1 个 active queue / placed。
- `pre_signal` 不解锁 Dossier，不计入正式初见冷却；但如果目标节点已有 active marker，也排队等待。
- 临近章节末尾不做硬概率砍掉，只在排序上降低新角色优先级，避免尾端硬塞。

### 6.4 序列排序

排序因素保留，但只影响“谁先从 queued 变 placed”，不删除其他 queued：

1. 已完成 pre_signal 的角色优先转正式 first_meet。
2. 当前地理匹配更强者优先。
3. 当前 lane 权重更高者优先。
4. spentScore 满足程度更高者优先。
5. 剧情前置角色已触发者优先。
6. 稀有角色只降低排序或进入 pre_signal，不做硬容量封顶。

验收标准：

- Debug 连续推进时，刚消费 first_meet 后不会立刻刷下一个 first_meet。
- 已有 placed encounter 时，新 eligible 角色进入 queued，不会顶掉原 placed。
- `RULE ADD` 只追加/调度 eligible 队列，不直接覆盖路径上的已有 encounter。
- `FREE` 只影响指定角色，不会把队列里的上一个角色顺手投出去。
- `pre_signal` 和 `first_meet` 都通过统一序列入口调度。

## 7. 第五阶段：Prompt 与 MVU 写回

状态：第一版已收口。

当前已完成：

- `encounterContext` 已降级为 Debug-only override，Host 不再读取它。
- Host 正式 encounter context 只从 MVU 正式字段派生。
- `world.tags / world.flags / world.storyFlags` 已作为轻量正式字段进入 schema。
- `pendingFirstMeet / pendingPreSignal` 推进清理已改为：清掉进入本次推进前存在的旧 pending，保留本次 consume 新产生的 pending 给下一轮 prompt。
- `first_meet` 消费后会通过 `hero.cast` 长期解锁 Dossier。
- `pre_signal` 消费后只写 `pendingPreSignal` 和 `preSignalDone`，不解锁 Dossier。

### 7.1 First Meet

`<ace0_first_meet>` 链路：

- encounter 消费后写 `pendingFirstMeet`
- Host 注入 prompt
- 下一轮 prompt 注入后，由楼层闸门清空 pending
- 同步 `hero.cast`
- Dossier 解密

### 7.2 Pre Signal

新增类似结构：

```js
pendingPreSignal: {
  CHAR_KEY: 'hint text'
}
```

Host 注入可用：

```xml
<ace0_pre_signal>
...
</ace0_pre_signal>
```

验收标准：

- first_meet 和 pre_signal 不共用同一个 pending 字段。
- first_meet 会解锁角色。
- pre_signal 不解锁角色。
- 两者 prompt 注入不会重复。
- 本次推进新产生的 pending 不会被段位推进立刻清掉。

## 8. 第六阶段：测试与 smoke

Phase 6 的目标是把前五阶段已经跑通的临时 smoke 固化成可重复执行的回归测试。

测试原则：

- 不引入重型测试框架，优先使用 Node 自包含脚本。
- Runtime / Host 逻辑先自动化，UI 视觉交互后续再接 browser smoke。
- 测试脚本与 AceZero pack 放在同一域：`apps/st-bridge/packs/acezero-main/scripts/`。
- 每个 smoke 都应该能独立运行，失败时抛出明确断言信息。
- Combat / Asset 正式收益仍不进入本阶段，只验证接口不被破坏。

### 8.1 Runtime smoke

已新增：

```bash
node apps/st-bridge/packs/acezero-main/scripts/encounter-runtime-smoke.js
```

覆盖：

- eligible -> queued
- queued -> placed
- placed -> phase consume
- firstMeetDone 防重复
- FORCE 指定角色不被旧 queued 插队
- 路径下一节点投放
- targetPhaseIndex 命中才消费
- first_meet 节奏阀生效
- queued 待生效序列不会顶掉 placed
- 节奏序列生效
- pre_signal 不解锁 Dossier 状态
- pre_signal 后续 first_meet 可被调度
- debug FORCE 不会投放旧 queued 角色

### 8.2 Context smoke

已新增：

```bash
node apps/st-bridge/packs/acezero-main/scripts/encounter-context-smoke.js
```

覆盖：

- requiredGeo
- requiredTags
- requiredFlags
- requiredCharacters
- funds
- Host 忽略 `world.encounterContext`
- Host 读取 `world.tags / world.flags / world.storyFlags`
- Debug override 仍可单独构造 context

### 8.3 Host / MVU smoke

已新增：

```bash
node apps/st-bridge/packs/acezero-main/scripts/encounter-host-smoke.js
```

覆盖：

- `resolvePendingActAdvance()` 消费 encounter 后保留本次新 pending。
- 旧 `pendingFirstMeet / pendingPreSignal` 会被推进清理。
- `synchronizeActCharacterState()` 会把 first_meet 写入 `hero.cast`。
- `pre_signal` 不写 `hero.cast.introduced`。
- `<ace0_first_meet>` 和 `<ace0_pre_signal>` 都能由 pending 生成。
- 两种 pending 不共用同一字段。

### 8.4 Schema smoke

已新增：

```bash
node apps/st-bridge/packs/acezero-main/scripts/schema-smoke.js
```

覆盖：

- `world.tags / world.flags / world.storyFlags` normalize。
- `world.act.pendingFirstMeet / pendingPreSignal` normalize。
- `world.act.characterEncounter` 保留对象结构。
- `hero.cast` 默认：RINO 已遇到，其余 encounter 角色未 introduced。

### 8.5 UI smoke

需要覆盖：

- marker 显示。
- phase 头像显示。
- Dossier 解密。
- Debug reason codes。
- Debug 变量切换后即时刷新。

第一版先做手工 checklist，后续可升级为 browser smoke：

```text
1. Debug 打开 ENCOUNTER DEBUG。
2. 切 LOCATION / TAG / FLAG，确认 READY/BLOCKED 即时变化。
3. RULE ADD 后地图下一节点出现 marker。
4. 进入目标节点，目标 SEG 显示固定头像。
5. 推进到目标 SEG 后 first_meet 解锁 Dossier。
6. pre_signal 触发后 Dossier 仍加密，但 ACT 面板显示 PRE-SIGNAL。
7. placed 已存在时 FREE 另一角色，只进入 queued，不顶掉地图 marker。
```

### 8.6 回归执行顺序

日常改 Encounter 后执行：

```bash
node --check apps/st-bridge/packs/acezero-main/act/encounter-runtime.js
node --check apps/st-bridge/packs/acezero-main/act/plugin.js
node --check apps/st-bridge/packs/acezero-main/tavern/act-runtime.js
node --check apps/st-bridge/packs/acezero-main/tavern/plugin.js
node --check apps/st-bridge/packs/acezero-main/schema/acezero-schema.js
node --check apps/dashboard/pages/overview/index.js
node apps/st-bridge/packs/acezero-main/scripts/encounter-runtime-smoke.js
node apps/st-bridge/packs/acezero-main/scripts/encounter-context-smoke.js
node apps/st-bridge/packs/acezero-main/scripts/encounter-host-smoke.js
node apps/st-bridge/packs/acezero-main/scripts/schema-smoke.js
git diff --check
```

阶段完成标准：

- 四个 Node smoke 全部通过。
- Debug 手工 UI checklist 至少跑一遍。
- 文档中的 Phase 1-5 承诺都有对应 smoke 或 checklist 覆盖。

## 9. 明确不在本阶段做

以下内容不进入 Encounter v0.2：

- Combat 三档正式赌局。
- Combat 失败惩罚。
- Asset 三档正式成长。
- 技能升级和契约结算。
- 经济系统正式收益模型。
- 所有角色的最终首见文案。

这些内容等 Encounter UI smoke、正式场景 tag 来源稳定后再接。

## 10. 推荐实施顺序

已完成：

1. 将 Host encounter context 改为正式 MVU 派生，`encounterContext` 降级为 Debug-only override。
2. 扩展 Debug 面板的 tags / flags / funds。
3. 重写 reason code 展示，让 blocked 原因可读。
4. 细化 8 名角色资格规则。
5. 接入 `pre_signal` 状态和 pending 字段。
6. 做 pre_signal marker / SEG UI。
7. 改成 first_meet / pre_signal 统一待生效序列与节奏调度。
8. 收口 pending 生命周期、Host prompt 注入和 `hero.cast` / Dossier 写回。

下一步：

1. 增加 Encounter UI smoke 覆盖。
2. 正式接入赌场 / 教廷 / 场所 tag 来源。
3. 正式接入剧情前置状态来源。
9. 再开始接正式剧情 tag 来源。

## 11. 当前判断

Encounter 的下一步重点不是继续堆 FORCE 按钮，而是把“角色为什么能出现 / 为什么不能出现”变成可调、可见、可测的正式上下文系统。

只要上下文与 reason code 稳，后面接正式剧情条件、教廷事件、赌场场景、危机公式都会顺很多。
