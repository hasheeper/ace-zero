# Hard AI Variants: Aggressive, Defensive, Balanced, Heavy

Last updated: 2026-06-04

## Summary

当前 hard 系列不再按“谁替代谁”理解，而是拆成四个可长期微调的性格分支。四个分支共用同一套 hard 引擎、同一套 evaluator、同一套 arena/Mortal 报告，只通过 policy/personality 参数改变偏好。

| Personality | Script Variant | Legacy Source | Style |
| --- | --- | --- | --- |
| hard aggressive / 速攻 | `hard-aggressive` | `hard-pure` | 更重速度、副露推进、保留纯启发 hard 的攻速底色 |
| hard defensive / 防御 | `hard-defensive` | `hard-tuned` / formal `hard` | 当前 tuned 基线，更重安全、低危险排序和稳定顺位 |
| hard balanced / 平衡 | `hard-balanced` | promoted balanced route-state profile | 在 tuned 基线之上启用轻量 route state，替代旧的 route-inactive bug 版本 |
| hard heavy / 打点 | `hard-heavy` | H15c route value | 保留 tuned 基线，加入门清立直路线价值评分，追求更高打点/立直路线 |

H18 后续清理：

- `hard-balanced-candidate` 已移除。它只是 `hard-heavy` 克隆改名，arena 数据差异来自小样本和非配对随机路径，没有提供独立机制信号。
- `hard-heavy-dev` 已移除。它把同一套 closed-route scorer 继续推向打点，但 scout 显示 route 分数抬高没有转化为更高 avgWin 或更好顺位。
- 旧 `hard-balanced` 已退役。它的 `closedRouteOverride/R` 长期接近 0，实际是 route-inactive bug 版本；原 `hard-balanced-dev` 的轻量状态分流已晋升为新的 stable `hard-balanced`。

兼容旧名仍保留：

- `hard-pure` 仍可用，等价于旧纯启发对照；新实验优先写 `hard-aggressive`。
- `hard-tuned` 仍可用，也是 formal `hard` 的来源；新实验优先写 `hard-defensive`。
- `hard-experimental` 仍保留为 overlay 门禁沙盒，不再当作第三个长期 personality。

## Shared Engine

四个 personality 不复制一套 AI 代码。

共用部分：

- discard evaluator
- riichi evaluator
- call evaluator
- push/fold evaluator
- danger model
- hard EV / live ukeire / wait quality
- shape / route diagnostics
- arena and Mortal benchmark scripts

差异只放在 policy：

- discard shape/cleanup gate 是否启用
- defense tie-break 强弱
- thin riichi exception 是否启用
- closed-route value rebalance 是否启用、阈值多严
- 后续新增权重时优先放进 `policy.personality` 或对应 section，不新增平行 evaluator

原则：

- 共用引擎保证维护成本低。
- personality 只改变偏好，不改变规则解释。
- 新调参先进入对应 `hard-xxx-dev`，再做 arena scout，不直接改 stable personality 或 formal `hard`。

## Dev Variant Rule

当前四个 personality 名称代表 stable checkpoint：

- `hard-aggressive`
- `hard-defensive`
- `hard-balanced`
- `hard-heavy`

后续调参统一使用 dev 名称：

- `hard-aggressive-dev`
- `hard-defensive-dev`
- `hard-balanced-dev`

Dev variants inherit from their stable parent and carry only the current experiment deltas. A failed scout should be discarded from dev without changing the stable variant.

Promotion rule:

- 200-match scout first.
- 1000-match confirmation second.
- Only after both pass can `hard-xxx-dev` deltas be copied into stable `hard-xxx`.
- Formal `hard` remains unchanged unless there is a separate explicit promotion decision.

## Expected Arena Profile

这些不是硬门槛，是大样本下希望看到的风格画像。

| 风格流派 AI | avgRank | 1st | 4th | avgWin | Riichi | nonRiichiWin | win/R | dealIn/R |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `hard-aggressive` / 速攻 | 2.65 | 22.0% | 31.0% | 3150 | 8.0% | 76.0% | 23.0% | 15.5% |
| `hard-defensive` / 防御 | 2.46 | 23.0% | 18.5% | 3750 | 9.0% | 71.0% | 20.5% | 12.5% |
| `hard-heavy` / 打点 | 2.50 | 27.5% | 25.5% | 4100 | 14.5% | 58.0% | 19.5% | 14.2% |
| `hard-balanced` / 平衡 | 2.38 | 26.5% | 19.0% | 3850 | 11.5% | 66.0% | 22.0% | 13.0% |

当前 promoted balanced 目标另行观察：

- `hard-balanced`：高立直平衡流的稳定版本，目标 `riichi 15%-20%`、`calls/R 0.85-1.10`、`nonRiichiWin 55%-65%`，但 `hule` 和 `drawTenpai` 不能崩。

读法：

- `aggressive` 应该赢得快，但四位率和放铳会偏高。
- `defensive` 应该四位率最低，代价是和牌率和一位率不一定最高。
- `heavy` 应该平均打点和立直率最高，但不能让和牌率/听牌率崩掉。
- `balanced` 不必每个单项第一，但应在 avgRank 上长期最好。

## Tuning Focus

| Personality | 打磨重点 | 可以调的旋钮 | 不能接受的副作用 |
| --- | --- | --- | --- |
| `hard-aggressive` | 速度、副露推进、先制和牌 | call 接受阈值、平向听 speed-up、向听改善 call、低压力 push | 四位率继续失控、dealIn/R 明显高于 16%、avgWin 过低导致只会小和 |
| `hard-defensive` | 放铳控制、四位规避、压力下安全牌质量 | danger/safety rank、low-danger tiebreak、push/fold 阈值、晚巡领先防守 | hule/drawTenpai 掉太多、只会缩导致 avgRank 变差 |
| `hard-heavy` | 门清立直路线、平均打点、一位率 | route value 权重、closed-route margin、riichi value threshold、好型/打点保留 | call/R 被压过头、win/R 和 drawTenpai 明显下降 |
| `hard-balanced` | 综合顺位、速度/打点/防守三者折中 | route state、riichi opportunity take rate、不过度少鸣、不过度重打点 | 指标变成四不像：avgRank 不优、打点不升、四位率也不低 |

## Current Policy Shape

| Variant | Base | Route Rebalance | Route Range | Override Margin |
| --- | --- | --- | --- | --- |
| `hard-aggressive` | pure hard | off | none | none |
| `hard-defensive` | tuned hard | off | none | none |
| `hard-balanced` | tuned hard | on, route state | `xiangting <= 2` | base `95`, value `85`, neutral `135` |
| `hard-heavy` | tuned hard | on, strong | `xiangting <= 2` | `35` |

Dev variants:

| Variant | Stable Parent | Behavior Delta |
| --- | --- | --- |
| `hard-aggressive-dev` | `hard-aggressive` | none yet |
| `hard-defensive-dev` | `hard-defensive` | H17 threat score, rank-aware push/fold, deal-in attribution |
| `hard-balanced-dev` | `hard-balanced` | none currently; inherits promoted stable until the next explicit experiment |

## hard-aggressive

`hard-aggressive` 从当前 hard policy 克隆，但关闭后续 tuning gate：

| Section | Setting | Meaning |
| --- | --- | --- |
| discard | `enableNoPressureShapeReview=false` | 关闭无压力 shape tie-break |
| discard | `shapeStrongOverrideEnabled=false` | 关闭强 shape override |
| discard | `enableNoPressureCleanupGuard=false` | 关闭 cleanup guard |
| defense | `enableLowDangerTiebreak=false` | 关闭 P2 低危险防守二级排序 |
| riichi | `allowNoPressureThinRiichi=false` | 关闭 P3 窄薄听立直例外 |

用途：

- 作为速攻人格长期微调，不再只是“落后版本”。
- 适合观察副露推进、和牌速度、放铳代价。
- legacy `hard-pure` 保留用于历史报告对照。

## hard-defensive

Stable `hard-defensive` is still the tuned/formal hard baseline. It intentionally does not enable the H17 dev defense scorer.

`hard-defensive-dev` adds only dev-side behavior:

| Section | Setting | Meaning |
| --- | --- | --- |
| defense | `enableThreatScoreReview=true` | score opponent threat compactly from riichi/open-hand/dora/late-round signals |
| defense | `enableRankAwarePushFold=true` | bias push/fold by `protect-lead`, `protect-second`, `neutral-defense`, `comeback`, and `safe-tenpai` states |
| defense | `enableDealInAttribution=true` | emit compact arena attribution for actual deal-ins |

The scoring layer is continuous: it adds expected deal-in cost and state bias to the existing hard push/fold review. H17b explicitly removed the attempted closed-route/riichi alignment from `hard-defensive-dev`: arena showed it improved rank by turning into a heavy-like high-riichi route personality, but it raised deal-in and broke the defensive identity. Route personality tuning belongs to `hard-balanced` and stable `hard-heavy`, not defensive.

H17 scout:

```bash
node games/majiang/scripts/benchmark-ai-hanchan-arena.js \
  --mode mixed \
  --variants hard-defensive,hard-defensive-dev,hard-balanced,hard-heavy \
  --matches 200 \
  --checkpoint-interval 25 \
  --progress \
  --stdout summary \
  --out /tmp/h17-defensive-dev-scout-200.json
```

Read these added lines for `hard-defensive-dev`:

- `defensiveState=...`
- `threatReason=...`
- `dealInAttribution=...`

Promotion to 1000 hanchan requires no arena errors, `avgRank` no worse than stable defensive by more than `0.02`, `dealIn <= 13.0%` or fourth-rate down at least `2pp`, and no collapse in `hule` or `drawTenpai`. Defensive-dev style targets should be evaluated through `dealIn`, fourth-rate, and attribution reductions; high riichi or low call rate is not a defensive success criterion.

`hard-defensive` 是当前 tuned hard policy 的人格化名称，也就是正式 `hard` 当前基线的主要来源。

相比 aggressive，defensive 打开了这些已保留调整：

| Area | Enabled Behavior | Origin / Purpose |
| --- | --- | --- |
| no-pressure discard shape | 无压力同向听近似平局时用 shape 破局 | H12 P1/P4 |
| shape strong override | 非听牌、同向听、shape 明显更好且 EV 损失有限时可覆盖小 EV | H12 P4 |
| cleanup guard | 无压力同向听时保护明显 cleanup 选择 | H12 后续清理 |
| low-danger defense tiebreak | 压力下低危险候选中细分现物、筋、壁、字牌、宝牌风险 | H12 P2 |
| thin tanki riichi exception | 早中巡、无压力、条件足够时允许窄 tanki 立直 | H12 P3 |

当前状态：

- defensive 是当前最稳的玩家 hard baseline。
- 新补丁不再默认并入 defensive；要先判断它属于 aggressive、defensive、balanced 还是 heavy。
- legacy `hard-tuned` 保留用于现有报告、repair gate 和正式 hard 对照。

## hard-balanced

`hard-balanced` 是综合顺位人格。旧版本只温和启用门清路线价值评分，但 `closedRouteOverride/R` 长期接近 0，实际没有形成可用 personality；现在已由原 `hard-balanced-dev` 的轻量 route-state profile 晋升替换。

它默认打开：

| Section | Setting | Meaning |
| --- | --- | --- |
| route | `enableClosedRouteValueRebalance=true` | 对 call 与 pass 的路线价值做评分 |
| route | `enableBalancedRouteState=true` | 用 `speed/value/tenpai-speed/defense/neutral` 状态决定是否允许覆盖 call |
| route | `closedRouteMaxXiangting=2` | 允许观察 2 向听以内的门清路线 |
| route | `closedRouteMinRemainingTiles=24` | 晚巡不硬保门清路线 |
| route | `closedRouteOverrideMinMargin=95` | 默认 route 覆盖基础 margin |
| route | `balancedValueOverrideMinMargin=85` | `value` 状态下更积极保留门清/立直路线 |
| route | `balancedNeutralOverrideMinMargin=135` | `neutral` 状态下保持保守 |
| route | `directTenpaiCallAlwaysAllow=true` | 直接进听 call 不被挡 |
| route | `pressureDisablesClosedRouteOverride=true` | 有立直压力时不触发路线覆盖 |
| riichi | `minLiveTingpaiCount=2` | 放宽立直候选的有效听牌门槛 |
| riichi | `minWaitQualityScore=6` | 放宽好型质量门槛 |

用途：

- 作为四个 personality 的默认竞技场主力候选。
- 重点看 avgRank，而不是单项漂亮。
- 预期应该比 heavy 保留更多副露速度，比 defensive 多一点立直/打点。
- 当前重点继续观察：立直率、副露率、听牌率和四位率是否同时维持在可接受区间。

## hard-balanced-dev

`hard-balanced-dev` 当前只是下一轮实验壳。它继承 promoted stable `hard-balanced`，不再携带额外行为差异。

保留这个名字的原因：

- 后续如果继续微调 balanced，先改 `hard-balanced-dev`。
- scout/1000 确认通过后，再把 dev delta 合并进 stable `hard-balanced`。
- 当前不要再用 `hard-balanced` vs `hard-balanced-dev` 判断旧 bug，因为两者行为应基本一致。

当前 stable/promoted 参数：

| Setting | Value | Meaning |
| --- | ---: | --- |
| `enableBalancedRouteState` | `true` | 开启 balanced 状态分流 |
| `closedRouteMaxXiangting` | `2` | 观察 2 向听门清路线 |
| `closedRouteOverrideMinMargin` | `95` | 默认 route 覆盖基础 margin |
| `balancedValueOverrideMinMargin` | `85` | `value` 状态覆盖 margin，鼓励门清立直路线 |
| `balancedNeutralOverrideMinMargin` | `135` | `neutral` 状态覆盖 margin，仍比 value 保守 |
| `balancedLowValueMax` | `30` | 低价值推进优先放行范围收窄 |
| `riichi.minLiveTingpaiCount` | `2` | 比 stable 更愿意立直 |
| `riichi.minWaitQualityScore` | `6` | 放宽好型质量门槛，目标是 15%-20% 立直区间 |

状态分流：

| State | Behavior |
| --- | --- |
| `defense` | 有立直压力时不做门清路线覆盖 |
| `tenpai-speed` | 直接进听或晚巡时保留速度 |
| `speed` | 低价值或明显推进收益 call 放行 |
| `value` | 门清价值/立直潜力足够时允许 route scorer 覆盖 call |
| `neutral` | 只在极明显门清收益时覆盖 call |

诊断字段：

- `balancedState`
- `balancedStateReason`
- `effectiveMinMargin`

旧 balanced 与 promoted profile 的 mechanism 对照只作为历史参照：

| Variant | `calls/R` | `riichi` | `closedRouteReview/R` | `closedRouteOverride/R` |
| --- | ---: | ---: | ---: | ---: |
| old `hard-balanced` | 1.23 | 9.5% | 0.14 | 0.02 |
| promoted `hard-balanced` | 1.08 | 10.2% | 0.45 | 0.12 |

正式判断仍需持续用 200/1000 半庄确认；现在 stable 名称已指向 promoted profile。

Promoted balanced ecosystem scout 命令：

```bash
node games/majiang/scripts/benchmark-ai-hanchan-arena.js \
  --mode mixed \
  --variants hard-aggressive,hard-defensive,hard-balanced,hard-heavy \
  --matches 200 \
  --checkpoint-interval 25 \
  --progress \
  --stdout summary \
  --out /tmp/h18-balanced-promoted-ecosystem-200.json
```

## hard-heavy

`hard-heavy` 是 H15c 后新增的打点/门清立直路线人格。

它以 defensive/tuned 为基础，默认打开：

| Section | Setting | Meaning |
| --- | --- | --- |
| route | `enableClosedRouteValueRebalance=true` | 对 call 的开放速度收益与 pass 的门清立直路线价值做线性评分 |
| route | `closedRouteMaxXiangting=2` | 只复盘门清 2 向听以内 |
| route | `closedRouteMinRemainingTiles=24` | 晚巡不硬保门清路线 |
| route | `closedRouteOverrideMinMargin=35` | 只有 pass 路线明显更值钱时才覆盖 call |
| route | `directTenpaiCallAlwaysAllow=true` | 直接进听 call 不被挡 |
| route | `pressureDisablesClosedRouteOverride=true` | 有立直压力时不触发打点路线覆盖 |

用途：

- 作为打点人格长期微调。
- 重点看平均打点、立直率、非立直和牌占比、和牌率、流局听牌率和顺位收益。
- 不追求单纯少鸣；`calls/R` 只是观测项。

## Retired H18 Branches

`hard-balanced-candidate` and `hard-heavy-dev` are no longer accepted by arena or Mortal benchmark variant parsing.

- `hard-balanced-candidate` was behavior-equivalent to `hard-heavy`, so it created confusing duplicate reports without a distinct mechanism.
- `hard-heavy-dev` raised internal route margins but did not improve avgWin or avgRank in scout data, so the stronger route-weight direction is paused.

## hard-experimental

`hard-experimental` 默认克隆 `hard-tuned`。

| State | Behavior |
| --- | --- |
| no overlay | 完全等价 v2/hard-tuned |
| explicit supported overlay | 只启用指定实验补丁 |
| formal gameplay | 不使用 |

当前仍受支持的 overlay：

| Overlay | Status | What It Tests |
| --- | --- | --- |
| `defense-equal-safe-backstep-v1` | rejected by arena scout | 高压下同等安全退一向听防守 |
| `no-pressure-same-xiangting-rerank-v1` | replay gate blocked | 无压力同向听 cleanup-vs-middle rerank |
| `closed-route-value-rebalance-v1` | promoted to `hard-heavy` personality base | 用路线价值评分比较开放 call 与保留门清立直路线 |

Rejected and removed from active runtime:

| Overlay | Result |
| --- | --- |
| `closed-riichi-route-call-discipline-v1` | 压低副露、提高立直率，但过度损失和牌/流局听牌速度，arena scout 拒绝 |
| `closed-route-low-value-call-filter-v2` | 更窄但仍退步，未有效降低 `calls/R` 或提高 `riichi`，arena scout 拒绝 |

## Arena Diagnostics

保留的事实面板：

- `chi/R`
- `peng/R`
- `closedCall/R`
- `flatCall/R`
- `improveCall/R`
- `yakuhai/R`
- `riichiOpp/R`
- `riichiOppTake`
- `closedRouteReview/R`
- `closedRouteOverride/R`
- `callRouteScore`
- `passRouteScore`
- `routeMargin`
- `balancedState`
- `balancedStateReason`

已移除的 H15b 专属字段：

- `lowValueReview/R`
- `blockedFlatLowValue/R`
- `blockedWeakYakuhai/R`

## Recommended Commands

### Four-Personality Arena Scout

```bash
node games/majiang/scripts/benchmark-ai-hanchan-arena.js \
  --mode mixed \
  --variants hard-aggressive,hard-defensive,hard-balanced,hard-heavy \
  --matches 200 \
  --checkpoint-interval 25 \
  --progress \
  --stdout summary \
  --out /tmp/hard-four-personalities-mixed-200.json
```

### Balanced Stable Regression Scout

```bash
node games/majiang/scripts/benchmark-ai-hanchan-arena.js \
  --mode mixed \
  --variants hard-balanced,hard-balanced,hard-defensive,hard-heavy \
  --matches 200 \
  --checkpoint-interval 25 \
  --progress \
  --stdout summary \
  --out /tmp/hard-balanced-promoted-regression-200.json
```

### Legacy v1 vs v2 Arena Baseline

```bash
node games/majiang/scripts/benchmark-ai-hanchan-arena.js \
  --mode mixed \
  --variants hard-pure,hard-tuned,hard-tuned,hard-tuned \
  --matches 1000 \
  --checkpoint-interval 25 \
  --stdout summary \
  --out /tmp/ace-zero-arena/h14-hard-pure-vs-3-hard-tuned-1000.json
```

### v1/v2/v3 Neutral Check

With no overlay, v3 should equal v2:

```bash
node games/majiang/scripts/benchmark-ai-hanchan-arena.js \
  --mode mixed \
  --variants hard-pure,hard-pure,hard-tuned,hard-experimental \
  --matches 200 \
  --checkpoint-interval 25 \
  --progress \
  --stdout summary \
  --out /tmp/hard-v1v2v3-neutral-200.json
```

### Legacy H15c Experimental Scout

```bash
node games/majiang/scripts/benchmark-ai-hanchan-arena.js \
  --mode mixed \
  --variants hard-pure,hard-pure,hard-tuned,hard-experimental \
  --experimental-overlays closed-route-value-rebalance-v1 \
  --matches 200 \
  --checkpoint-interval 25 \
  --progress \
  --stdout summary \
  --out /tmp/h15c-closed-route-value-arena-200.json
```

## Promotion Rule

v3 overlay 不能因为 Mortal exact 变好就进 v2。

晋升必须同时满足：

- 固定局面 replay 能解释行为变化。
- Mortal 对应 bucket 不恶化。
- Arena 200 scout 不劣化。
- Arena 1000 确认中 `avgRank`、四位率、放铳率不劣于 v2/hard-tuned。

## Practical Reading

如果只想跑真实强度：

- 用 `hard-defensive` 或 legacy `hard-tuned` 代表当前正式困难 AI。

如果想判断四种风格：

- 跑 `hard-aggressive` / `hard-defensive` / `hard-balanced` / `hard-heavy`。

如果想验证新的补丁机制：

- 跑 `hard-experimental`，且必须显式指定仍受支持的 overlay。

不要把 `hard-experimental` 默认空 overlay 的结果当成新 AI；它默认就是 v2。
