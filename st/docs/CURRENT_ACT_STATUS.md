# AceZero ACT 当前实现状态

> 记录当前 `apps/st-bridge` / `apps/dashboard` 真实实现进度。
> 需求原文仍见 `st/docs/需求稿.md`，本文件只做阶段性收口说明。

## 1. 当前总状态

ACT v0.1 已经进入第一版闭环：

- `chapter0_exchange` 是当前默认章节。
- 命运宏图为 `24 Nodes`。
- Node 1-3 为固定引导。
- Node 4-24 由 ACT 生成器按 seed 生成后段地图。
- Dashboard 可在 Host / Debug 两种模式下查看和推进 ACT。
- Host Mode 会写回 MVU。
- Debug Mode 会写入本地 debug payload / localStorage。

当前重点已经从“地图能不能跑”推进到：

- 点数投入闭环。
- Vision 干涉闭环。
- Encounter 初见投放闭环。
- Host / Debug / Dossier 状态同步闭环。

## 2. 已完成的基础系统

### 2.1 四点数

旧 `contract / event` 已收束为四点数：

```text
combat / rest / asset / vision
```

旧存档兼容：

- `contract -> asset`
- `event -> vision`

### 2.2 Phase 投入

`phase_slots` 已支持三档投入：

```js
phase_slots[index] = {
  key: 'combat' | 'rest' | 'asset' | 'vision',
  amount: 1 | 2 | 3,
  source: 'limited' | 'reserve',
  sources: ['limited', 'reserve']
}
```

消耗规则：

- 优先消耗当前节点限定点数。
- 不足部分消耗储备点数。
- 进入下一节点后，未使用的限定点数会过期。

### 2.3 固定营收

已接入字段：

```js
income_rate
income_progress
```

每推进一个节点，会按 `income_rate` 增长进度；进度满 1 后转化为对应储备点数。

### 2.4 Rest 闭环

Rest 当前已是可跑玩法：

- Rest 1/2/3 回复 Mana。
- 可选择 `neutral / combat / rest / asset / vision` 染色。
- 资源染色会额外消耗 1 个对应点数。
- 当前节点会写入 `controlledNodes`。
- 地图上过去染色节点会高亮。
- 染色节点图标会替换为对应点数图标。
- 进入同 lane 时，会按同 lane 同类染色节点数量触发 2-3 点资源爆发。

### 2.5 Vision 闭环

Vision 当前已完成第一版：

- `Vision 1`：增加地图视野，远端未来节点压暗。
- `Vision 2`：获得固定相位替换机会，抵达 fixed phase 前弹出 `KEEP / 替换点数`。
- `Vision 3`：进入跳线模式，route 阶段可选择跳线候选。

Debug 推进保护：

- `ADV SEG`
- `ADV NODE`

都会尊重 Vision 2 的替换 prompt，不会批量越过选择点。

## 3. Combat / Asset 当前策略

Combat 和 Asset 当前明确不做正式玩法，只保留外部接口。

原因：

- Combat 涉及赌局、小玩法、德州、日麻、失败惩罚、筹码规模和风险收益。
- Asset 涉及角色成长、契约、技能升级、Mana 上限、剧情成长系统。
- 这两块都不是 ACT 单独能安全伪造的收益，必须和主游戏引擎、剧情系统、角色成长系统一起收口。

因此当前 ACT 只负责生成外部结算请求：

```js
pendingResolutions: [
  {
    id,
    protocol: 'ace0.externalResolution.v1',
    type: 'combat' | 'asset',
    level: 1 | 2 | 3,
    nodeId,
    nodeIndex,
    phaseIndex,
    status: 'pending',
    sources: ['limited', 'reserve']
  }
]
```

外部系统回填后，ACT 负责：

- 消费对应 request。
- 应用允许的 `actPatch / heroPatch`。
- 将结果写入 `resolutionHistory`。

当前边界：

- ACT 不在内部伪造 Combat 收益。
- ACT 不在内部伪造 Asset 成长。
- Combat / Asset 正式玩法放到最后接入。
- 在正式接入前，它们只作为稳定协议和调试入口存在。

## 4. 压力账本状态

原 `crisis / crisisSignals` 系统已移除。

当前风险、角色入场强度和优先级不再依赖独立危机值，而是从已有结构派生：

- `resourceSpent`：长期投入倾向。
- `spentScore`：Encounter 资格和优先级计算。
- `storyFlags / tags`：明确剧情前置。
- `pendingResolutions / resolutionHistory`：外部玩法结算记录。

## 5. Encounter 当前状态

角色初见系统第一版已经接入 ACT 真相层。

范围：

```text
SIA / TRIXIE / POPPY / COTA / VV / KUZUHA / KAKO / EULALIA
```

RINO 是初始角色，不走 encounter。

当前默认角色状态：

- KAZU：主角，自身可见。
- RINO：默认已遇到、在场、入队。
- 其他 encounter 角色：默认 `activated: true`，但 `introduced / present / inParty` 为 `false`。

已完成：

- `world.act.characterEncounter` 已 normalize。
- `ENCOUNTER_RULES` 已作为第一版资格规则表存在。
- `evaluate / enqueue / place / consume / update / debugForce` 已导出。
- 进入节点后会评估 encounter，并投放未来 encounter。
- 投放默认只会落到当前玩家路径的下一节点。
- 目标节点和目标段位均由 seed 驱动随机。
- 进入目标节点时只显示 marker。
- 推进到目标 SEG 时才消费初见。
- 消费后写入 `pendingFirstMeet / firstMeetDone / introduced`。
- Dashboard 地图节点会显示角色头像 marker。
- 目标 SEG 会显示固定事件式角色头像。
- Dossier 会在角色正式初见后解密。

Debug 支持：

- ACT 面板内有 `ENCOUNTER DEBUG` 折叠区。
- 可查看 8 名角色的 READY / BLOCKED / PLACED / DONE。
- 可逐个 FORCE 指定角色。
- `MVU LOCATION` 可切换 `world.location.layer`，并参与 `requiredGeo` 判定。

前五阶段收口状态：

- `encounterContext` 已降级为 Debug-only override；Host 正式上下文从 `world.current_time / world.location / world.tags / world.flags / world.storyFlags / hero.funds` 派生。
- `FREE` 与 `RULE ADD` 已分离：前者自由投放指定角色，后者只按资格自动添加。
- 8 名角色规则已统一到 `minSpentScore / requiredCharacters / requiredFlags / requiredAny / spentWeights` 等字段。
- 点数阈值已下调到初章 24 节点内更容易自然满足的区间；地理、tag、资金、前置角色等剧情门槛仍保留。
- Debug 面板可显示 readable blocked reason 和门槛摘要。
- `pre_signal` 已接入 runtime / Dashboard / Tavern prompt：消费后写入 `pendingPreSignal`，注入 `<ace0_pre_signal>`，但不解锁 Dossier。
- `pre_signal` 与 `first_meet` 当前都默认投放到玩家路径下一节点。
- Encounter 节奏阀与待生效序列已接入第一版：默认先 queued，统一由调度器转 placed，FREE 不会顶掉已有 placed，first_meet 消费后可立即调度下一条，但目标最早只能落到下一节点，不会在当前节点当场触发。
- Phase 5 第一版已收口：Host / Debug encounter context 分流完成，`pendingFirstMeet / pendingPreSignal` 会保留本次新触发内容给下一轮 prompt，旧 pending 会被推进清理。

当前仍未完成：

- Encounter 节奏阀与待生效序列的 UI 细节和更多 smoke。
- Cota 的赌场 / 荷官 TAG 从正式场景上下文稳定传入。
- Eulalia 的教廷事件从正式剧情上下文稳定传入。
- Kuzuha / Kako / Eulalia 等混合角色的全部剧情前置来源。
- Combat / Asset 正式结果参与 encounter 权重。

## 6. Dashboard / Dossier 同步

当前已完成 Host / Debug 下的状态同步修正：

- Host 直连 commit 成功后，会刷新 Dashboard payload。
- Debug commit 后，Overview 会广播角色状态同步事件。
- Shell 收到事件后会刷新 roster、Overview 节点状态和当前 Dossier。
- Dossier 不直接读 `world.act.characterEncounter`，而是读取同步后的 `dashboardCharacters[*].dashboardState`。

这保证了：

- ACT 消费 encounter 后，Dossier 可以跟随解密。
- Debug 下角色初见后，不再停留在 `DATA ENCRYPTED / UNKNOWN`。

注意：

- `FORCE` 只负责把角色投放到未来节点 / 目标段位。
- `FORCE` 不等于立刻初见。
- 只有推进到目标节点的目标 SEG，并消费 placed encounter 后，Dossier 才会正式解密。

## 7. 已清理的旧系统残留

旧 `phaseGuides` 已删除。

原因：

- 旧系统依赖旧点数/相位引导逻辑。
- 新系统已经切到四点数 + amount 1-3 + limited/reserve 来源。
- 继续保留 `phaseGuides` 会造成维护误导。

当前应以 ACT runtime 的点数投入、固定相位、Vision 替换、Encounter marker 为准。

## 8. 当前待办优先级

### 第一优先级：收口稳定性

- 给 Encounter 增加更完整 UI smoke。
- 校准文档中的旧 `ST/` 路径为 `apps/st-bridge` / `apps/dashboard`。
- Phase 6 的四个 Node smoke 已固化到 `apps/st-bridge/packs/acezero-main/scripts/`。

Phase 6 已覆盖：

- Runtime smoke：队列、投放、消费、FORCE、pre_signal、节奏阀。
- Context smoke：地理、tag、flag、角色前置、资金、Host/Debug 分流。
- Host / MVU smoke：pending 生命周期、Dossier 解密、prompt XML 注入。
- Schema smoke：默认值和 normalize。
- UI smoke：已规划手工 checklist，后续再升级 browser smoke。

不纳入 Phase 6：

- Combat 正式赌局收益。
- Asset 正式成长收益。
### 第二优先级：Encounter 上下文

- 正式接入赌场 / 教廷 / 场所 tag。
- 正式接入剧情前置状态。
- 补 Encounter UI smoke。

### 第三优先级：Combat / Asset 正式玩法

Combat 和 Asset 放到最后接入。

这是刻意的，不是遗漏。

它们需要等以下系统更稳定后再做：

- 赌局 / 小游戏引擎。
- 角色成长和技能系统。
- 契约系统。
- 经济资产和负债系统。
- 失败惩罚与剧情后果。
- Encounter 权重调优。

在此之前，Combat / Asset 只保留 `pendingResolutions` 和外部回填协议，确保 ACT 主循环不会提前绑定错误收益模型。
