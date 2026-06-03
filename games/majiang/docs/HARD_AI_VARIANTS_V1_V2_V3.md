# Hard AI Variants: Aggressive, Defensive, Balanced, Heavy

Last updated: 2026-06-03

## Summary

当前 hard 系列不再按“谁替代谁”理解，而是拆成四个可长期微调的性格分支。四个分支共用同一套 hard 引擎、同一套 evaluator、同一套 arena/Mortal 报告，只通过 policy/personality 参数改变偏好。

| Personality | Script Variant | Legacy Source | Style |
| --- | --- | --- | --- |
| hard aggressive / 速攻 | `hard-aggressive` | `hard-pure` | 更重速度、副露推进、保留纯启发 hard 的攻速底色 |
| hard defensive / 防御 | `hard-defensive` | `hard-tuned` / formal `hard` | 当前 tuned 基线，更重安全、低危险排序和稳定顺位 |
| hard balanced / 平衡 | `hard-balanced` | tuned + mild route value | 在 tuned 基线之上温和保护门清路线，目标是速度、打点、防守综合最优 |
| hard heavy / 打点 | `hard-heavy` | H15c route value | 保留 tuned 基线，加入门清立直路线价值评分，追求更高打点/立直路线 |

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
- 新调参先在对应 personality 上 arena scout，不直接改 formal `hard`。

## Expected Arena Profile

这些不是硬门槛，是大样本下希望看到的风格画像。

| 风格流派 AI | avgRank | 1st | 4th | avgWin | Riichi | nonRiichiWin | win/R | dealIn/R |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `hard-aggressive` / 速攻 | 2.65 | 22.0% | 31.0% | 3150 | 8.0% | 76.0% | 23.0% | 15.5% |
| `hard-defensive` / 防御 | 2.46 | 23.0% | 18.5% | 3750 | 9.0% | 71.0% | 20.5% | 12.5% |
| `hard-heavy` / 打点 | 2.50 | 27.5% | 25.5% | 4100 | 14.5% | 58.0% | 19.5% | 14.2% |
| `hard-balanced` / 平衡 | 2.38 | 26.5% | 19.0% | 3850 | 11.5% | 66.0% | 22.0% | 13.0% |

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
| `hard-balanced` | 综合顺位、速度/打点/防守三者折中 | mild route value、轻量 defense gate、riichi opportunity take rate、不过度少鸣 | 指标变成四不像：avgRank 不优、打点不升、四位率也不低 |

## Current Policy Shape

| Variant | Base | Route Rebalance | Route Range | Override Margin |
| --- | --- | --- | --- | --- |
| `hard-aggressive` | pure hard | off | none | none |
| `hard-defensive` | tuned hard | off | none | none |
| `hard-balanced` | tuned hard | on, mild | `xiangting <= 1` | `90` |
| `hard-heavy` | tuned hard | on, strong | `xiangting <= 2` | `35` |

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

`hard-balanced` 是综合顺位人格。它以 defensive/tuned 为基础，但只温和启用门清路线价值评分。

它默认打开：

| Section | Setting | Meaning |
| --- | --- | --- |
| route | `enableClosedRouteValueRebalance=true` | 对 call 与 pass 的路线价值做评分 |
| route | `closedRouteMaxXiangting=1` | 只在 1 向听以内保护门清路线，避免过早损失速度 |
| route | `closedRouteMinRemainingTiles=24` | 晚巡不硬保门清路线 |
| route | `closedRouteOverrideMinMargin=90` | 比 heavy 更严格，只有 pass 路线明显更好才覆盖 call |
| route | `directTenpaiCallAlwaysAllow=true` | 直接进听 call 不被挡 |
| route | `pressureDisablesClosedRouteOverride=true` | 有立直压力时不触发路线覆盖 |

用途：

- 作为四个 personality 的默认竞技场主力候选。
- 重点看 avgRank，而不是单项漂亮。
- 预期应该比 heavy 保留更多副露速度，比 defensive 多一点立直/打点。

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
