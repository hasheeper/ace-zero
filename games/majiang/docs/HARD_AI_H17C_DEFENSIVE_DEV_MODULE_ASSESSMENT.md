# H17c Defensive-Dev Module Assessment

## Summary

结论：当前 `hard-defensive-dev` 在 H17b 清理之后，已经回到正确方向。它不再复用 `closedRouteValueReview` 去做高立直、低副露、打点路线保护，因此不会继续把防守型 AI 误调成 `hard-heavy`。现在保留下来的模块符合 defensive-dev 的基础需求：威胁评分、顺位防守、预期放铳成本、放铳归因。

但它还只是防守骨架，不是完整防守 AI。当前模块能解释“为什么要更保守”，也能在 push/fold 里增加风险成本；它还不能细致回答“哪张牌对哪一家安全”“是否应该保留未来安全牌”“这次放铳到底是无筋推立直、亲家高威胁、还是没有安全牌”。所以下一步应该补防守评分的颗粒度，而不是再调立直率、副露率或门清路线。

## Current Module Fit

| 模块 | 当前状态 | 是否符合 defensive-dev | 说明 |
| --- | --- | --- | --- |
| `hard-defensive-profile.js` | 已有 | 符合 | 提供 `threatProfile`、`rankDefenseState`、`expectedDealInCost`、`dealInAttribution`。这是正确底座。 |
| `hard-push-fold.js` 接入 | 已有 | 符合 | 把 defensive profile 转成 `attackBias`、`riskBias`、`foldNetPushBias`，没有写成局面 if/else。 |
| arena 防守诊断 | 已有 | 符合 | 输出 `defensiveState`、`threatReason`、`dealInAttribution`，可以指导下一轮调参。 |
| `closedRouteValueReview` | defensive-dev 已关闭 | 符合 | 这套属于 balanced/heavy，不应进入 defensive-dev。H17b 清理是正确的。 |
| riichi/call 个性参数 | defensive-dev 不再额外调整 | 符合 | 防守型不应该靠高立直或大幅少鸣塑形。 |

## What Is Already Right

1. `hard-defensive-dev` 现在是 stable `hard-defensive` 的防守增强分支，而不是替换关系。
2. 它保留了 scored defense 的形态：威胁、顺位、放铳成本都进入数值评分。
3. 它不会压副露到 heavy 水平，也不会把立直率强行拉到 16% 以上。
4. arena 已经能输出归因，后续可以看 `riichi-push`、`dealer-threat`、`multi-threat` 是否下降。
5. stable `hard-defensive`、formal `hard`、`hard-balanced-dev`、`hard-heavy` 都不被影响。

## Main Gaps

| 缺口 | 当前问题 | 应补方向 |
| --- | --- | --- |
| 安全牌分层不足 | 现在主要还是总 danger/safety，不够区分对每一家是否安全。 | 新增 `safetyLadderScore`：genbutsu、suji、kabe、one-chance、honor-deadness、multi-safe。 |
| 多家威胁聚合偏粗 | `dealerThreat`、`multiThreat` 有了，但没有逐家安全度。 | 每个威胁者单独算 risk，再聚合为 worst-risk / average-risk / dealer-risk。 |
| 开副露威胁偏粗 | 目前 `threat-open-hand` 能识别，但分类不细。 | 拆成 `open-cheap`、`open-yakuhai`、`open-honitsu`、`open-dora-heavy`、`dealer-open-threat`。 |
| 安全牌库存缺失 | AI 可能在中巡打掉最后的强安全牌，导致后面没牌可守。 | 新增 `safetyReserveScore`，领先/二位/低价值时保留未来安全牌。 |
| 放铳归因仍偏粗 | 已有归因，但不能区分“危险牌种”和“是否有更安全替代”。 | 归因增加 `had-safe-alternative`、`no-safe-tile`、`cut-last-safe-tile`。 |
| push/fold 触发还偏保守 | 只有高威胁、领先、二位时明显触发。 | 让低价值远向听在中高威胁下更早进入 review，但保留 comeback 和 safe-tenpai 反击。 |

## Why The Previous Direction Was Wrong

H17b 的错误方向是把 `hard-defensive-dev` 对齐到 closed-route / riichi 路线。它在 arena 里看起来更强，但本质变成了 heavy-like：

- `riichi` 被拉到约 16%。
- `calls/R` 被压到约 0.89。
- `closedRouteOverride/R` 到约 0.43。
- `dealIn` 没有更低，甚至比 stable defensive 更高。

这说明它不是防守变强，而是变成了打点路线 AI。这个方向已经清理，后续 defensive-dev 不再接入 closed-route scorer。

## H17c Correct Direction

H17c 应该做的是“更会判断危险和安全”，不是“更门清”。

### 1. Safety Ladder

新增一个轻量安全层级评分，作为 discard candidate 的附加诊断：

- `absolute-safe`: 对目标威胁者现物。
- `multi-genbutsu`: 对多家现物。
- `suji-safe`: 筋安全。
- `kabe-safe`: 壁安全。
- `one-chance`: 单 chance。
- `honor-safe`: 字牌安全度。
- `dangerous-middle`: 高威胁下的无筋中张。
- `dora-risk`: 宝牌/宝牌旁危险。

目标不是重新写弃牌器，而是给现有 push/fold 更准确的 `riskScore` 和 `safeDecision`。

### 2. Safety Reserve

新增安全牌库存意识：

- 领先或二位时，不轻易打掉最后一张强安全牌。
- 低价值、远向听时，保留未来防守资源。
- comeback、亲家、好型听牌时降低该权重。

这个模块可以先只做诊断，不直接改决策，再用 arena 看它是否能解释 `open-hand-no-safe` 和 `riichi-push`。

### 3. Threat Profile v2

把当前 `threat-open-hand` 拆细：

- `threat-open-yakuhai`
- `threat-open-flush`
- `threat-open-dora-heavy`
- `threat-open-dealer`
- `threat-open-two-meld`

并把 `expectedPointLoss` 从粗略加权改成更接近“当前铳点预期”的评分。

### 4. Push/Fold EV v2

继续复用现有公式：

```text
netPushScore = attackScore - riskScore
riskScore = dangerScore * pressureScore + expectedDealInCost + stateRiskBias
```

但把 `dangerScore` 升级为：

```text
defensiveRiskScore = perOpponentDanger + safetyLadderPenalty + safetyReservePenalty
```

这样仍然是评分化，不是堆局面 if/else。

## Acceptance For Defensive-Dev

200 局 scout 不是最终结论，只看方向：

- `dealIn` 目标进入 `12.5%-13.2%`，理想是接近 `12.0%-12.5%`。
- 四位率低于 stable defensive，或至少不升。
- `avgRank` 不劣化超过 `0.02`。
- `hule >= 20.0%`。
- `drawTenpai >= 65%`，不能继续大幅掉。
- `calls/R` 不作为主目标，只要不变成 heavy。
- `riichi` 不作为主目标，合理区间约 `8%-12%`。

归因目标：

- `riichi-push` 下降。
- `dealer-threat` 下降。
- `multi-threat` 下降。
- `open-hand-no-safe` 不上升；如果上升，说明安全牌库存不足。
- `comeback-push` 可以保留，因为落后时需要反击。

## Next Implementation Plan

1. 保持当前 H17b 清理结果，不重新接入 closed-route。
2. 在 `hard-defensive-profile.js` 增加 `safetyLadderScore` 诊断，先只输出 compact reason。
3. 在 `hard-push-fold.js` 用 `safetyLadderScore` 微调 `riskScore` 和 `safeDecision` 排序。
4. arena 增加：
   - `safetyLadderReason`
   - `safeAlternativeOnDealIn`
   - `lastSafeTileCut`
5. 跑 defensive 2v2：

```bash
node games/majiang/scripts/benchmark-ai-hanchan-arena.js \
  --mode mixed \
  --variants hard-defensive,hard-defensive,hard-defensive-dev,hard-defensive-dev \
  --matches 200 \
  --checkpoint-interval 25 \
  --progress \
  --stdout summary \
  --out /tmp/h17c-defensive-dev-2v2-200.json
```

6. 如果 scout 方向正确，再和 `hard-balanced-dev`、`hard-heavy` 放在生态局里看是否仍保持防守个性。

## Bottom Line

当前模块方向符合现在的问题，但还不够细。它已经避免了最危险的错误：把 defensive-dev 调成 high-riichi heavy。下一步不应该再碰副露/立直路线，而应该补“防守真正需要的牌级安全判断”：逐家安全、安全牌库存、开副露威胁细分、放铳时是否有安全替代。

