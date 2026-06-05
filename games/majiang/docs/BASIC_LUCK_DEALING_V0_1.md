# 基础运气发牌 v0.1 初步规划

Last reviewed: 2026-06-05

本文定义 `majiang` 中“基础运气发牌”的初步口径。

算法深化与外部源码参考见 [`LUCK_DEALING_ALGORITHM_DEEP_DIVE_V0_1.md`](LUCK_DEALING_ALGORITHM_DEEP_DIVE_V0_1.md)。

这里的“发牌”泛指牌墙相关结果，包括：

- 起手发牌
- 普通摸牌
- 杠后补牌
- 后续可能扩展的宝牌指示牌相关偏置

但 v0.1 的实现重点应先放在 **未来一摸**，也就是普通摸牌的候选权重偏置。

核心一句话：

**基础运气发牌不是指定发好牌或坏牌，而是在真实剩余牌墙中，根据综合意图与魔运力量调整候选牌权重，再进行可审计抽样。**

---

## 1. 当前规划摘要

当前相关文档已经形成三条边界：

1. [`FUTURE_PROOFING.md`](FUTURE_PROOFING.md)
   - 牌墙 / 发牌 / 魔运不能写死成纯随机。
   - `majiang-core` 保持规则底层，不承载魔运。
   - `wall-service` 拥有牌墙与发牌 / 摸牌 / 杠摸。
   - `draw-policy` 决定是否偏置，不直接拥有规则真相。

2. [`WIND_SYSTEM_V0_1.md`](WIND_SYSTEM_V0_1.md)
   - 风向是 MonteOfZero 的主观意图修正层。
   - 风向不直接改牌，不指定摸牌，不指定役种。
   - MonteOfZero 应输出候选未来牌权重分布。
   - fortune / curse 只在权重分布上施加正负影响。

3. [`../../../../st/docs/技能需求稿.md`](../../../../st/docs/技能需求稿.md)
   - Moirai 提供 `fortune`，让牌局向有利方向偏移。
   - Chaos 提供 `curse`，让目标牌局向不利方向偏移。
   - Psyche 负责读局、防灾、折射。
   - Void 负责绝缘、降低、清空或归零魔运干涉。

本规划把这三者合并为一个初步发牌模型：

```text
真实牌墙
  -> 候选未来牌集合
  -> MonteOfZero 计算候选牌价值
  -> 风向修正综合意图
  -> fortune / curse / psyche / void 修正候选权重
  -> 从真实剩余牌墙中抽样
  -> 输出审计记录
```

---

## 2. 定位

基础运气发牌是魔运麻将的最小牌墙偏置层。

它负责回答：

- 当前可能摸到哪些牌？
- 哪些牌符合当前综合意图？
- 哪些牌违背当前综合意图？
- fortune 应该提高哪些牌的权重？
- curse 应该提高哪些逆意图牌的权重，或压低哪些关键顺意图牌？
- 最终从真实剩余牌墙里抽到了哪张？
- 这次偏置是否可解释、可复盘、可测试？

它不负责：

- 指定某张牌
- 生成牌墙中不存在的牌
- 改写已经发生的牌
- 判定番种规则
- 替代 AI 决策
- 替代风向系统
- 承载完整技能 UI

---

## 3. 基本原则

### 3.1 只偏置真实剩余牌墙

所有结果必须来自当前真实剩余牌墙。

如果候选牌不在牌墙中，必须忽略或降权，不能凭空生成。

### 3.2 不直接指定牌

fortune 不等于“给我某张好牌”。

curse 不等于“给敌人某张坏牌”。

二者只影响权重：

```text
fortune = 提高顺综合意图牌的权重
curse = 提高逆综合意图牌的权重，或压低关键顺意图牌的权重
```

### 3.3 风向只修正意图，不直接改结果

风向先进入 MonteOfZero 的综合意图计算，再间接影响候选权重。

基础运气发牌不能直接读取 UI 风向后硬发某类牌。

### 3.4 客观局势优先

如果客观局势强烈要求防守、推进、收束或价值路线，玩家风向和魔运都必须受上限约束。

这条用于防止：

- 反向风向骗 curse
- 强行把不成立路线变成 fortune 目标
- 在极高危险场面把生张强行评成好牌

### 3.5 可审计

每次偏置必须能记录：

- 输入牌墙
- 目标 seat
- 当前风向
- 客观意图
- 综合意图
- 原始候选分
- 魔运修正
- 最终权重
- 抽样结果
- fallback 原因

---

## 4. v0.1 范围

### 4.1 先做普通摸牌

v0.1 只要求普通摸牌可用。

也就是：

```text
beforeDraw
  -> 候选剩余牌
  -> 权重修正
  -> 抽样
```

起手发牌、杠后补牌、宝牌偏置先保留接口，不作为第一批平衡目标。

### 4.2 不接完整技能

v0.1 不需要实现完整 `minor_wish / hex / reality` 技能。

只需要支持抽象魔运输入：

```js
{
  type: "fortune" | "curse" | "void",
  power: 20,
  sourceSeat: "bottom",
  targetSeat: "bottom"
}
```

### 4.3 不接 UI

v0.1 先走 Node smoke。

UI 后续只消费审计结果和风向状态，不参与计算。

---

## 5. 数据模型草案

### 5.1 LuckContext

```js
{
  seat: "bottom",
  drawKind: "normal", // normal | initial | rinshan | dora
  ruleset: "riichi-4p",
  wallState: {},
  runtimeSnapshot: {},
  windState: {},
  objectiveIntent: {},
  compositeIntent: {},
  activeForces: []
}
```

### 5.2 CandidateDraw

```js
{
  tileCode: "m3",
  remainingCount: 2,
  localValue: {
    speed: 0.62,
    value: 0.28,
    shape: 0.54,
    safety: 0.22,
    commit: 0.47
  },
  objectiveScore: 0.44,
  windDelta: 0.08,
  forceDelta: 0.12,
  finalScore: 0.64,
  baseWeight: 2,
  finalWeight: 3.6,
  tags: ["speed", "shape-improve"]
}
```

### 5.3 LuckForce

```js
{
  id: "force_001",
  type: "fortune", // fortune | curse | void
  system: "moirai", // moirai | chaos | psyche | void
  power: 20,
  lockChance: 0,
  sourceSeat: "bottom",
  targetSeat: "bottom",
  scope: "next-draw",
  metadata: {}
}
```

### 5.4 LuckDrawResult

```js
{
  seat: "bottom",
  drawKind: "normal",
  selectedTileCode: "m3",
  source: "luck-policy:weighted-draw",
  candidates: [],
  audit: {
    objectiveIntent: {},
    windState: {},
    compositeIntent: {},
    activeForces: [],
    totalWeightBefore: 34,
    totalWeightAfter: 41.5,
    randomRoll: 0.382,
    fallback: null
  }
}
```

---

## 6. 权重模型

### 6.1 基础权重

基础权重来自剩余牌数量：

```text
baseWeight(tile) = remainingCount(tile)
```

这保证没有魔运时，系统接近真实随机牌墙。

### 6.2 候选分

候选分来自 MonteOfZero：

```text
candidateScore =
  speedWeight  * tileSpeed
+ valueWeight  * tileValue
+ safetyWeight * tileSafety
+ commitWeight * tileCommit
+ shapeBonus
- riskPenalty
```

其中 `speedWeight / valueWeight / safetyWeight / commitWeight` 来自综合意图。

### 6.3 Fortune 修正

fortune 提高高候选分牌的权重：

```text
fortuneDelta = f(power) * positive(candidateScore)
```

初版建议：

- 使用温和倍率，不做硬锁定。
- `power` 转换为 0-1 区间的 bias strength。
- 只提高已存在候选牌权重。

### 6.4 Curse 修正

curse 有两种初版方式：

1. 提高逆综合意图牌的权重。
2. 压低目标关键顺意图牌的权重。

推荐 v0.1 先做第一种：

```text
curseDelta = f(power) * positive(-candidateScore)
```

第二种“压低关键牌”更强，容易影响平衡，留到 v0.2。

### 6.5 Void 修正

Void 不产生好牌或坏牌。

Void 负责降低临时魔运干涉：

```text
effectiveForcePower = forcePower / voidDivisor
```

v0.1 可先实现：

- `voidDivisor = 2`
- 或直接清除一次 `next-draw` force

---

## 7. 抽样规则

### 7.1 加权抽样

最终从候选牌中按 `finalWeight` 抽样。

候选集合必须来自真实剩余牌墙。

```text
P(tile) = finalWeight(tile) / sum(finalWeight)
```

### 7.2 防极端保护

每张牌权重需要上下限。

建议 v0.1：

```text
minWeight = remainingCount * 0.25
maxWeight = remainingCount * 4.0
```

这能防止基础 fortune / curse 过早变成指定摸牌。

### 7.3 Fallback

以下情况必须回退到正常摸牌：

- 没有候选牌
- 权重全为 0 或非数值
- 抽样结果不在牌墙中
- runtime snapshot 不足以计算候选分
- debug/test 明确要求 no-op

fallback 需要写入 audit。

---

## 8. 起手发牌的初步口径

起手发牌比普通摸牌更敏感，不建议 v0.1 直接做强偏置。

原因：

- 起手一次影响 13 张牌，力量放大很快。
- 起手偏置容易破坏体验公平感。
- 起手路线尚未稳定，风向与客观意图都更不可靠。

建议起手发牌采用三阶段策略：

### 8.1 v0.1：只记录，不偏置

起手发牌保持真实随机。

只在 `afterInitialDeal` 记录：

- 起手速度倾向
- 起手价值倾向
- 起手防守空间
- 起手路线候选

### 8.2 v0.2：轻微开局偏置

只允许极低强度的起手质量偏置。

例如：

- 微幅提高有效搭子数量
- 微幅提高宝牌相关概率
- 避免极端烂手

但不指定役种，不保证路线。

### 8.3 v0.3：技能驱动起手偏置

只有明确技能或剧情状态允许时，才启用起手偏置。

并且必须有审计记录和强度上限。

---

## 9. 与现有代码的落点

当前代码已有适合接入的基础：

- `engine/base/draw-policy.js`
  - 已有 `chooseInitialHands`
  - 已有 `chooseDraw`
  - 已有 `chooseGangDraw`
  - 已有 no-op 与 scripted policy

- `engine/base/wall-service.js`
  - 已经在起手前调用 `beforeInitialDeal`
  - 已经在摸牌前调用 `beforeDraw`
  - 已经校验请求牌是否仍在牌墙中
  - 已经在失败时回退正常摸牌

- `engine/extensions/`
  - 已经定义 `beforeInitialDeal / beforeDraw / afterDraw`
  - 未来技能可通过 extension 提供 active forces

推荐新增：

```text
games/majiang/shared/runtime/luck/
  luck-force.js
  luck-weighting.js
  weighted-draw.js
  luck-audit.js

games/majiang/engine/runtime/
  monte-of-zero-luck-adapter.js
```

后续可再新增：

```text
games/majiang/frontend/scripts/debug/
  luck-debug-panel.js
```

---

## 10. 实施阶段

### Phase 0：文档与边界

交付：

- 本文档
- 与风向系统的接口说明
- 明确 v0.1 只做普通摸牌

### Phase 1：纯函数权重模型

交付：

- candidate normalize
- baseWeight
- fortuneDelta
- curseDelta
- void reduction
- clamp
- weighted sample
- audit object

要求：

- 不依赖浏览器
- 不改 runtime
- 可单测

### Phase 2：MonteOfZero 候选分接入

交付：

- 使用风向文档中的 `CandidateTileValue`
- 生成 `candidateScore`
- 输出权重分布
- 保留 explain/audit

### Phase 3：draw-policy 接入

交付：

- `createLuckDrawPolicy`
- 接入 `chooseDraw`
- 从 wall-service 真实牌墙抽样
- fallback 到 no-op random

### Phase 4：extension force 接入

交付：

- extension 可提交 next-draw fortune / curse / void force
- Luck policy 读取 active forces
- force 用完后过期

### Phase 5：起手与杠摸扩展

交付：

- 起手只记录的审计
- 杠后补牌轻度复用普通摸牌模型
- 起手偏置继续保持关闭，直到有单独平衡方案

---

## 11. 验收标准

### 11.1 语义验收

- fortune 不等于指定好牌。
- curse 不等于指定坏牌。
- 所有结果来自真实剩余牌墙。
- 风向只通过综合意图影响候选分。
- curse 不能被反向风向稳定利用。
- 起手发牌 v0.1 不做强偏置。

### 11.2 工程验收

- 纯函数模型可 Node 测试。
- `majiang-core` 无改动。
- UI 不参与计算。
- wall-service fallback 行为保留。
- 每次偏置有 audit。

### 11.3 平衡验收

- 无 force 时接近真实随机。
- 低 power fortune 只轻微提高顺意图牌概率。
- 低 power curse 只轻微提高逆意图牌概率。
- 高 power 仍不能稳定指定单张牌，除非未来锁定技能另行定义。

---

## 12. 当前结论

基础运气发牌可以开始动工，但正确切口不是“发好牌 / 发坏牌”，而是：

1. 先做候选未来牌评分。
2. 再做 fortune / curse / void 的权重修正。
3. 再做真实牌墙加权抽样。
4. 最后补审计、测试和 UI 展示。

v0.1 最小闭环应是：

```text
WindState + ObjectiveIntent
  -> CompositeIntent
  -> CandidateTileValue
  -> LuckForce
  -> weighted draw
  -> audit
```

这条链路打稳后，后续完整魔运技能、Psyche 防灾、Void 绝缘、AI 复盘解释才有可以依赖的发牌基础。
