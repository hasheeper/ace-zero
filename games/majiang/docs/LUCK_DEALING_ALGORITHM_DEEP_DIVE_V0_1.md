# 魔运发牌算法深扒 v0.1

Last reviewed: 2026-06-05

本文是 [`BASIC_LUCK_DEALING_V0_1.md`](BASIC_LUCK_DEALING_V0_1.md) 的算法深化稿。

目标不是马上实现完整魔运麻将，而是把“未来一摸”的发牌系统地基打稳：

- 牌必须来自真实剩余牌墙。
- 风向只修正意图，不直接指定结果。
- fortune / curse 只改候选权重，不凭空造牌。
- 强弱冲突必须可解释、可测试、可审计。
- hard AI 里的评估资产要复用思想，但不能把 AI 动作选择和魔运发牌混成一层。

---

## 1. 外部源码参考

本次源码参考拉取到本机临时目录：

```text
/tmp/ace-zero-mahjong-research/
  MahjongRepository-mahjong/
  datamllab-rlcard/
  worldveil-deuces/
  Equim-chan-Mortal/
```

这些项目只作为算法结构参考，不作为直接复制来源。

### 1.1 MahjongRepository/mahjong

仓库：

```text
https://github.com/MahjongRepository/mahjong
```

许可：MIT。

可参考点：

- `mahjong/shanten.py`
  - 使用 34 种牌计数数组计算向听。
  - 同时考虑普通型、七对子、国士。
  - 对非法手牌数量做校验。
- `mahjong/hand_calculating/hand.py`
  - 先校验规则条件，再分解手牌，再计算役、符、番、点数。
  - 对魔运系统的启发是：**魔运不能绕过规则裁判**。发牌系统最多影响未来输入，不能替代和牌判定。

本项目已有 `majiang-core-adapter`，不需要引入 Python 库；应参考其“34 计数 + 严格校验 + 规则裁判隔离”的结构。

### 1.2 RLCard

仓库：

```text
https://github.com/datamllab/rlcard
```

许可：MIT。

可参考点：

- `rlcard/games/limitholdem/dealer.py`
  - dealer 持有唯一 deck。
  - shuffle 后每次 `deal_card()` 从 deck 移除一张。
- `rlcard/games/nolimitholdem/game.py`
  - 发牌、下注轮、公共牌推进、历史快照分层。
- `rlcard/games/limitholdem/judger.py`
  - 结算由 judger 做，dealer 只负责发牌。

对本项目的启发：

- `wall-service` 必须是牌墙真相源。
- `draw-policy` 只提出偏置选择，不能自己伪造牌。
- 发牌、动作推进、结算裁判必须分层。

这点与当前项目已经接近：`wall-service` 在 `beforeDraw` 或 `chooseDraw` 请求某张牌时，会从真实牌墙移除；请求不到就回退正常摸牌。

### 1.3 worldveil/deuces

仓库：

```text
https://github.com/worldveil/deuces
```

许可：MIT。

可参考点：

- `deuces/evaluator.py`
  - 德扑牌力被映射成稳定整数 rank。
  - 5/6/7 张牌统一转成最好 5 张牌结果。
  - 比较时不是散权重互怼，而是固定 rank 越小越强。
- `deuces/lookup.py`
  - 先分牌型 class：同花顺、四条、葫芦、同花、顺子、三条、两对、一对、高牌。
  - 再在同 class 内比较细分 rank。

对魔运的启发：

**异能力量比较也应该先分层，再同层比较。**

不要用一堆无序数值直接相加互撞，否则后期技能越多越难解释。

### 1.4 Equim-chan/Mortal

仓库：

```text
https://github.com/Equim-chan/Mortal
```

许可：AGPL-3.0-or-later。

只做架构观察，不复制代码。

可参考点：

- `libriichi/src/algo/sp/candidate.rs`
  - 候选包含 `tenpai_probs`、`win_probs`、`exp_values`、`required_tiles`、`num_required_tiles`、`shanten_down`。
  - 候选比较按固定列顺序：EV、和率、听牌率、是否退向、有效牌数、弃牌优先级。
- `libriichi/src/state/obs_repr.rs`
  - 会把候选表、所需进张、EV 表编码给 AI。

对魔运发牌的启发：

- 我们也需要结构化 `CandidateDraw`，而不是只给每张牌一个总分。
- 每张未来摸牌要保留局部维度、有效牌解释、最终权重和审计原因。
- 但 Mortal 是 AI 动作候选表，不是魔运发牌系统；只能借结构思想。

---

## 2. 本项目 hard AI 可复用资产

当前 hard AI 没有风向系统，也没有魔运发牌系统。

但它已经有一批可以抽象复用的算法零件：

### 2.1 速度 / 进张

相关文件：

- [`../engine/ai/support/hard-ev.js`](../engine/ai/support/hard-ev.js)
- [`../engine/ai/support/discard-ranking.js`](../engine/ai/support/discard-ranking.js)

已有指标：

- `xiangting`
- `ukeireCount`
- `liveUkeireCount`
- `tingpaiCount`
- `liveTingpaiCount`
- `waitQualityScore`

hard EV 当前核心式：

```text
hardEvScore =
  liveUkeireCount * liveUkeireWeight
+ liveTingpaiCount * liveTingpaiWeight
+ waitQualityScore * waitQualityWeight
+ contextualHandValueEstimate * handValueWeight
```

这非常接近魔运候选牌的 `speed + shape + value` 基础。

### 2.2 打点 / 场况价值

相关文件：

- [`../engine/ai/support/round-context.js`](../engine/ai/support/round-context.js)
- [`../engine/ai/evaluators/call-evaluator.js`](../engine/ai/evaluators/call-evaluator.js)

已有指标：

- dealer attack bonus
- honba / riichi stick attack bonus
- trailing attack bonus
- leader late defense penalty
- contextual hand value
- riichi potential
- closed route value

魔运发牌可以复用这种思路：打点不是孤立番数，而是“当前点数态势 + 巡目 + 门清机会 + 宝牌/役潜力”的综合值。

### 2.3 防守 / 威胁

相关文件：

- [`../engine/ai/support/tile-danger.js`](../engine/ai/support/tile-danger.js)
- [`../engine/ai/support/danger-model.js`](../engine/ai/support/danger-model.js)
- [`../engine/ai/support/hard-defensive-profile.js`](../engine/ai/support/hard-defensive-profile.js)
- [`../engine/ai/support/hard-push-fold.js`](../engine/ai/support/hard-push-fold.js)

已有指标：

- `dangerScore`
- `safetyRank`
- `defenseTileRank`
- `expectedDealInCost`
- `pressureScore`
- `threatScore`
- `pushFoldState`

魔运的 `safety` 维度不能只看“摸到这张牌危险不危险”，还要看：

- 摸到它后下一步会不会被迫切危险牌。
- 它是否增加安全牌储备。
- 它是否允许半守半攻。
- 它是否降低未来放铳成本。

### 2.4 路线收束 / 定

相关文件：

- [`../engine/ai/evaluators/call-evaluator.js`](../engine/ai/evaluators/call-evaluator.js)
- [`../engine/ai/support/hard-candidate-diagnostics.js`](../engine/ai/support/hard-candidate-diagnostics.js)

已有结构：

- `closed-route-value-rebalance`
- `balancedRouteState`
- `speed`
- `value`
- `tenpai-speed`
- `defense`
- `neutral`

这不是风向，但非常接近“客观路线状态”。

魔运的 `commit` 不应该让玩家指定役种，而应该基于系统路线候选：

- 顺子型
- 对子型
- 刻子型
- 染手型
- 役牌型
- 门清型

每条路线输出：

```js
{
  id: "flush-p",
  kind: "flush",
  confidence: 0.72,
  supportTiles: ["p2", "p3", "p4", "p6", "p8"],
  conflictTiles: ["m4", "s7"],
  decay: 0.18
}
```

`commit` 只允许加强 `confidence` 足够高的路线。

---

## 3. 为什么不能直接套 hard AI

hard AI 当前做的是：

```text
当前手牌 -> 候选弃牌/副露/立直/杠 -> 选择动作
```

魔运发牌要做的是：

```text
当前手牌 + 真实剩余牌墙 -> 候选未来摸牌 -> 加权抽样
```

关键差异：

| 维度 | hard AI | 魔运发牌 |
| --- | --- | --- |
| 目标 | 选动作 | 选未来摸牌结果 |
| 输入 | 当前合法动作候选 | 当前真实剩余牌候选 |
| 输出 | 一个动作 | 一个从牌墙移除的 tile |
| 权重含义 | AI 策略偏好 | luck force 对分布的偏置 |
| 主观层 | AI profile / variant | 玩家风向 |
| 审计重点 | 为什么这样打 | 为什么这次摸牌分布被偏置 |

所以应抽出“评估维度”，不能直接调用 hard 的最终动作选择器。

---

## 4. 稳固发牌总流程

推荐 v0.1 只做普通摸牌：

```text
draw request
  -> build LuckContext
  -> read live wall counts
  -> build CandidateDraw[] from real remaining tiles
  -> evaluate local tile values
  -> build objective intent
  -> apply player wind
  -> resolve active forces
  -> calculate final weights
  -> weighted sample
  -> remove selected tile from wall-service
  -> emit audit
```

### 4.1 真实牌墙不可破

硬规则：

- 候选集合只能来自 `wallState.liveWall` 或等价真实剩余集合。
- `remainingCount(tile) <= 0` 的牌权重必须为 0。
- 抽样结果必须交回 `wall-service` 移除。
- `wall-service` 移除失败必须 fallback。
- 魔运不直接改 `majiang-core`。

这条比任何技能设计都优先。

### 4.2 候选集合

候选牌按 34 种牌聚合，而不是按每一张实体牌逐张模拟：

```js
[
  { tileCode: "m1", remainingCount: 1 },
  { tileCode: "m2", remainingCount: 3 },
  ...
]
```

最终抽样按牌种权重抽中 `tileCode`，再由 `wall-service` 移除一张真实实体牌。

好处：

- 计算量稳定，最多 34 个候选。
- 审计更清楚。
- 符合“牌种价值 + 剩余枚数”的概率模型。

### 4.3 每张候选牌的模拟

对每张 `candidate.tileCode`：

```text
simulated = clone(currentShoupai)
simulated.zimo(candidate.tileCode)

beforeMetrics = evaluate(currentShoupai)
afterMetrics  = evaluate(simulated)
localValue    = diff(beforeMetrics, afterMetrics)
```

v0.1 不需要深 rollout，先做一层模拟。

原因：

- 魔运只影响“未来一摸”，不是完整 AI。
- 一层模拟已经能稳定判断向听推进、有效牌、宝牌、形状、路线收束。
- 深 rollout 后续可以作为高性能优化，不作为地基依赖。

---

## 5. CandidateDraw 价值向量

建议统一为：

```js
{
  tileCode: "m3",
  remainingCount: 2,
  before: {
    xiangting: 2,
    liveUkeireCount: 22,
    liveTingpaiCount: 0,
    waitQualityScore: 0,
    contextualHandValueEstimate: 18
  },
  after: {
    xiangting: 1,
    liveUkeireCount: 31,
    liveTingpaiCount: 0,
    waitQualityScore: 3,
    contextualHandValueEstimate: 22
  },
  localValue: {
    speed: 0.0,
    value: 0.0,
    shape: 0.0,
    safety: 0.0,
    commit: 0.0,
    volatility: 0.0
  },
  tags: []
}
```

### 5.1 speed

来自：

- `xiangtingDelta`
- `liveUkeireDelta`
- `liveTingpaiDelta`
- 是否直接听牌
- 是否直接和牌

建议初版：

```text
speed =
  shantenGainScore
+ liveUkeireDeltaScore
+ liveTingpaiDeltaScore
+ directTenpaiBonus
+ agariBonus
```

归一化到 `0..1`。

### 5.2 value

来自：

- 宝牌 / 赤宝牌相关。
- 役牌对子/刻子进展。
- 门清立直潜力。
- 平和、三色、一气、染手等路线潜力。
- contextual hand value delta。

建议初版先保守：

```text
value =
  doraScore
+ yakuhaiScore
+ riichiPotentialDelta
+ contextualHandValueDeltaScore
+ routeValueBonus
```

不要一开始就完整枚举所有役种。先把稳定、可解释的打点来源做准。

### 5.3 shape

来自：

- 愚形改善。
- 两面形成。
- 搭子数量与质量。
- 浮牌清理价值。
- 孤张中张保留价值。

hard AI 已经有 shape review，可先抽象成较轻的 shape bonus，不要让 shape 单独压过向听。

### 5.4 safety

候选牌本身不是“弃出去的牌”，所以 safety 必须用未来约束评估：

- 摸上后是否保留更多安全牌。
- 摸上后是否必须切危险牌才能推进。
- 摸上后如果选择降落，是否有现物/筋牌/字牌空间。
- 当前是否有立直或高威胁副露。

建议：

```text
safety =
  safeReserveDelta
- forcedDangerousDiscardPenalty
- futurePushPressurePenalty
+ foldFlexibilityBonus
```

v0.1 可以先做简化：

- 枚举摸牌后所有可切牌。
- 取“最佳安全弃牌”和“最佳进攻弃牌”。
- 如果两者差距很大，说明该摸牌增加了未来防守弹性。

### 5.5 commit

来自路线候选：

```text
commit(tile) =
  max(route.confidence * route.tileSupport(tile) * route.decayAdjustedWeight)
```

原则：

- `commit` 只加强已存在路线。
- 路线置信度低时衰减。
- 与主路线冲突的牌可以得到负向 commit。

### 5.6 volatility

`volatility` 表示这张牌会不会引入巨大分叉。

用途：

- “定”风向下压低高分叉牌。
- curse 可以提高高分叉但低当前意图一致性的牌。
- fortune 不应总是推高高波动牌，否则会变成“老是来诱惑牌”。

---

## 6. 客观意图层

客观意图不是玩家选的，它由局面自动推导：

```js
{
  speed: 0.35,
  value: 0.25,
  safety: 0.20,
  commit: 0.20,
  pressure: 0.10,
  confidence: 0.70
}
```

推荐来源：

### 6.1 手牌阶段

```text
xiangting <= 0   -> speed 上升，value 看听牌质量，safety 看威胁
xiangting == 1   -> speed 上升，shape 上升
xiangting >= 3   -> value/commit 可上升，但强度低
```

### 6.2 巡目

```text
早巡 -> value / commit 空间较大
中巡 -> speed / shape 权重上升
晚巡 -> safety 权重自然上升
```

### 6.3 威胁态

```text
对手立直 / 高威胁副露 / 多家压力 -> safety 上升
无压力 -> speed/value/commit 由手牌决定
```

### 6.4 点数 / 血量态势

```text
大幅落后 -> value 或 speed 上升，取决于巡目和向听
领先晚巡 -> safety 上升
亲家机会 -> speed/value 上升
```

这部分可以直接参考 hard 的 `round-context` 和 `hard-defensive-profile` 思路。

---

## 7. 风向修正层

玩家风向只改变 objective intent 的权重，不直接改候选牌。

```text
compositeIntent = clampIntent(objectiveIntent + windDelta)
```

强度建议：

```text
light  = 0.08
medium = 0.16
strong = 0.24
```

修正上限：

```text
effectiveWindDelta = baseDelta * objectivePermission
```

示例：

- 高威胁晚巡，`speed/value` 的 `objectivePermission` 降低。
- 路线置信度低，`commit` 的 `objectivePermission` 降低。
- 已经听牌，`speed` 的收益上限降低，改看 `waitQuality/value/safety`。

这样才能防止玩家靠风向骗 curse。

---

## 8. 候选分与权重

### 8.1 候选分

```text
intentScore(tile) =
  composite.speed  * local.speed
+ composite.value  * local.value
+ composite.safety * local.safety
+ composite.commit * local.commit
+ shapeWeight      * local.shape
- volatilityWeight * local.volatilityPenalty
```

输出建议归一化到 `[-1, 1]`：

- `1` 表示高度符合综合意图。
- `0` 表示中性。
- `-1` 表示明显违背综合意图。

### 8.2 基础权重

```text
baseWeight(tile) = remainingCount(tile)
```

### 8.3 使用温和 softmax 偏置

不建议直接：

```text
finalWeight = baseWeight + score * power
```

因为负数、零值、极端 power 都容易出问题。

推荐：

```text
bias = exp(temperature * forceAdjustedScore)
rawWeight = remainingCount * bias
finalWeight = clamp(rawWeight, minFactor * remainingCount, maxFactor * remainingCount)
```

建议初始参数：

```text
temperature = 0.75
minFactor = 0.25
maxFactor = 4.0
```

高阶技能可以提高 `maxFactor`，但必须走力量比较和审计。

---

## 9. Fortune / Curse / Void / Psyche

### 9.1 Fortune

fortune 提高顺综合意图牌的相对权重：

```text
fortuneScore(tile) = positive(intentScore(tile)) * forceStrength
```

fortune 不应该：

- 指定某张牌。
- 生成没有剩余枚数的牌。
- 忽略 safety gate。
- 把低置信路线硬抬成主路线。

### 9.2 Curse

curse 作用于目标的真实综合意图，不作用于目标口头风向。

初版：

```text
curseScore(tile) = positive(-intentScore(tile)) * forceStrength
```

也就是提高“对目标当前综合意图不顺”的牌。

v0.2 才考虑：

```text
curseSuppress(tile) = positive(intentScore(tile)) * suppressStrength
```

即压低关键顺意图牌。

压低关键牌比提高逆意图牌更危险，容易让 curse 变成“精确拆牌”，所以后置。

### 9.3 Void

void 不定义好坏牌。

void 负责削弱或清除魔运干涉：

```text
effectiveForce = force * (1 - voidDamping)
```

或：

```text
if voidRank >= forceRank:
  force.disabled = true
```

### 9.4 Psyche

Psyche 不建议 v0.1 直接改权重。

更适合先做：

- 读取 audit。
- 预警高 curse / 高 volatility。
- 提供一次性 `voidDamping` 或 `forceRedirect`。

---

## 10. 德扑式异能力量比较

德州扑克牌力的启发是：**先分牌型等级，再在等级内比较细节**。

魔运也应如此，避免技能越多越变成散权重混战。

### 10.1 ForceRank

每个魔运效果归一成：

```js
{
  forceId: "f_001",
  kind: "fortune", // fortune | curse | void | psyche | lock
  tier: 2,          // 0 trivial, 1 minor, 2 normal, 3 major, 4 fate
  timing: 3,        // earlier declarations usually lower than reaction/counter windows
  scope: 1,         // next-draw < one-turn < round < global
  power: 42,
  precision: 1,     // broad intent < route < exact tile
  cost: 10,
  sourceSeat: "bottom",
  targetSeat: "right",
  tags: ["next-draw"]
}
```

### 10.2 比较顺序

类似 poker rank，冲突时按固定 tuple 比：

```text
forceCompareKey =
  tier
  timingWindow
  counterRelation
  effectivePower
  scopeWeight
  precisionPenalty
  paidCost
  sourcePriority
  forceIdStableOrder
```

解释：

- `tier`：技能层级最高优先。
- `timingWindow`：后发反制通常优先于先发普通偏置，但不能无限套娃。
- `counterRelation`：void 克制 fortune/curse，psyche 可折射或预警。
- `effectivePower`：扣除 void、防御、抗性后的强度。
- `scopeWeight`：范围越大不一定越强，范围大通常精度低。
- `precisionPenalty`：直接指定精确牌要被重罚；基础系统不开放 exact tile。
- `paidCost`：消耗资源可作为同级胜负手。
- `sourcePriority`：同一 timing 内用座次或行动顺序稳定裁决。
- `forceIdStableOrder`：最后保底，防止不确定排序。

### 10.3 不建议的比较方式

不要：

```text
totalPower = power + scope + timing + random
```

原因：

- 不可解释。
- 同级技能容易被范围滥用。
- exact tile 能力会天然压垮 intent bias。
- 后续平衡无法定位问题。

### 10.4 具体到发牌权重

大多数 force 不需要决出唯一赢家，而是进入同一个 bias field：

```js
{
  fortuneBias: 0.22,
  curseBias: 0.14,
  voidDamping: 0.35,
  lock: null
}
```

只有互斥效果才走硬比较：

- 一方要清除本次魔运，一方要保留本次魔运。
- 一方要重定向目标，一方要保护目标。
- 高阶剧情技能尝试锁定某类结果。

基础发牌 v0.1 不开放 exact lock。

---

## 11. 稳定性保护

### 11.1 权重上下限

每张牌：

```text
remainingCount * 0.25 <= finalWeight <= remainingCount * 4.0
```

普通技能只能在这个范围内改。

高级技能必须显式声明：

```js
{
  canExceedNormalClamp: true,
  maxFactorOverride: 8.0,
  auditReason: "major-fate-skill"
}
```

### 11.2 分布熵保护

每次抽样前计算分布熵：

```text
entropy = -sum(P(tile) * log(P(tile)))
```

如果熵过低，说明系统接近指定牌。

v0.1 可先用简单保护：

```text
topProbability <= 0.35
```

除非 force 明确允许强锁定。

### 11.3 反向利用保护

curse 目标使用：

```text
targetTrueIntent = objectiveIntent + boundedWindCorrection
```

不能只读目标风向。

如果玩家风向与客观局势强冲突：

```text
windTrust = low
```

curse 以客观意图为主。

### 11.4 牌墙一致性保护

审计必须记录：

- 抽样前 `wallHash`
- 抽样后 `wallHash`
- `selectedTileCode`
- `remainingBefore`
- `remainingAfter`
- `removeFromWallOk`

如果 `removeFromWallOk === false`，本次魔运结果无效，回退正常摸牌。

---

## 12. 推荐模块落点

新增纯函数层：

```text
games/majiang/shared/runtime/luck/
  candidate-draw.js
  objective-intent.js
  wind-adjustment.js
  force-rank.js
  force-resolution.js
  weight-model.js
  weighted-sampler.js
  luck-audit.js
```

新增 engine 适配层：

```text
games/majiang/engine/runtime/
  monte-of-zero-luck-adapter.js

games/majiang/engine/base/
  luck-draw-policy.js
```

不要新增到：

```text
games/majiang/engine/base/majiang-core-adapter.js
```

除非只是暴露已有规则计算的轻包装。

---

## 13. 最小可施工版本

### Phase A：候选牌与抽样

实现：

- 从 wall state 聚合 `remainingCount`。
- 根据手牌模拟每张候选牌。
- 输出 `CandidateDraw[]`。
- 用固定假分数跑 weighted sampler。
- 记录 audit。

验收：

- 无 force 时，抽样概率接近剩余枚数比例。
- 任意抽样结果都来自真实牌墙。
- 权重为 0、NaN、Infinity 时 fallback。

### Phase B：接 hard-like 指标

实现：

- `speed` 接向听与 live ukeire。
- `value` 接 dora / contextual hand value。
- `safety` 接 danger model 的简化未来弃牌评估。
- `commit` 接路线候选原型。

验收：

- 一向听有效牌应得到更高 speed。
- 宝牌相关牌在 value 风向下更高。
- 对手立直晚巡，危险推进牌不应被 fortune 轻易推到最高。
- commit 路线置信度不足时加成衰减。

### Phase C：风向接入

实现：

- `auto/speed/value/safety/commit`。
- `light/medium/strong`。
- objective permission cap。

验收：

- 风向改变权重分布，但不能指定单张。
- 高威胁局面会压制 speed/value 风向。
- 无路线时 commit 基本无效。

### Phase D：force rank 接入

实现：

- fortune。
- curse 的逆意图加权。
- void damping。
- force audit。

验收：

- void 能降低 fortune/curse 的分布影响。
- 同 tier force 排序稳定。
- curse 不因目标反向风向被稳定骗成 fortune。

---

## 14. 测试矩阵

### 14.1 纯函数测试

- `remainingCount` 聚合正确。
- `normalizeScore` 输出在 `[-1, 1]`。
- `finalWeight` 始终有限且大于等于 0。
- clamp 生效。
- seeded RNG 下抽样可复现。

### 14.2 牌墙测试

- 抽中的牌必须能从 live wall 移除。
- 移除后剩余数减一。
- 不存在牌不能被抽中。
- fallback 不破坏 wall。

### 14.3 分布测试

- no-force 下，10000 次模拟分布接近 `remainingCount`。
- fortune 下，高 intentScore 组概率上升。
- curse 下，低 intentScore 组概率上升。
- void 下，分布向 no-force 回归。

### 14.4 风向测试

- speed 提高向听推进牌权重。
- value 提高宝牌/役牌/门清潜力牌权重。
- safety 在威胁态提高安全弹性牌权重。
- commit 只对高置信路线生效。

### 14.5 反作弊测试

- 目标故意选择反向风向，curse 仍按综合意图判断。
- 强 pressure 下，fortune 不能把危险生张抬成绝对最高。
- 低 route confidence 下，commit 不能把不存在路线抬高。

---

## 15. 当前结论

当前项目已经具备施工基础：

- `wall-service` 有真实牌墙与请求牌移除机制。
- `draw-policy` 有 `chooseDraw` 接口。
- `extension` 有 `beforeDraw / afterDraw` hook。
- hard AI 已经有速度、价值、防守、路线的评估零件。

但还缺：

- 独立的 `CandidateDraw` 评估器。
- 独立的 `ObjectiveIntent`。
- 风向修正层。
- force rank / resolution。
- 稳定 weighted sampler。
- 完整 audit。

因此可以动工，但第一刀应该是 **纯函数发牌权重层**，不是 UI，也不是完整技能。

最稳的施工顺序：

```text
CandidateDraw
  -> ObjectiveIntent
  -> WindAdjustment
  -> ForceResolution
  -> WeightedSampler
  -> DrawPolicy adapter
  -> Extension/skill integration
```

一句话：

**魔运发牌的地基不是“让玩家摸好牌”，而是“在真实牌墙内，用可解释的综合意图和有上限的力量系统，稳定改变下一摸的概率分布”。**
