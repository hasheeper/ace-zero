# Hard AI H14 Cleanup And Arena Runbook

## Current Status

H14 当前先收口为“证据闭环”阶段：

- `hard-tuned`：当前正式困难 AI 基线，保留 H12/H14 已证明有 arena 收益的启发式调整。
- `hard-pure`：纯净困难 AI 对照，关闭后续 shape/defense/cleanup 等 tuning gate，用于消融。
- `hard-experimental`：只给 benchmark/arena 使用的实验变体，默认等价 `hard-tuned`，必须显式传 overlay 才会改变。

最近两条 experimental 线暂不进入正式 hard：

- `defense-equal-safe-backstep-v1`：P3 arena scout 劣化，拒绝晋升。
- `no-pressure-same-xiangting-rerank-v1`：P4 replay 没有发现可直接补丁的 eligible 样本，跳过 Mortal/arena scout。

因此下一轮不要继续直接加规则。更稳的方向是用无 Mortal 的半庄 arena 先确认 `hard-tuned` 相对 `hard-pure` 的真实收益，再从候选池里挑可人工复盘的恶手做小补丁。

P5 新增 `hard-ai-experimental-ledger`：把 P1 repair pool、P3 defense replay、P4 tile-choice replay、P3/P4 scout 结果合并成一份候选账本。它只做诊断，不改正式 `hard-tuned`，也不启用新的 overlay。

## What Was Cleaned

- 删除工作区里的 macOS `.DS_Store` 系统文件。
- 保留 H12/H13/H14 的诊断、ranker、corpus、repair 脚本。它们虽然阶段较多，但仍是当前证据链的一部分，不作为无用残留删除。
- Arena summary/report 对重复 variant 做去重展示：`variantOrder` 仍保留真实阵容，`variants` 只保留唯一配置，避免“一纯三调”滚动日志里重复打印三遍 `hard-tuned`。

## Mac Mini Background Arena

这个测试不需要 Mortal，不需要 Python/LightGBM，只跑本地脚本 AI。

目标阵容：一家 `hard-pure`，三家 `hard-tuned`。重复写三个 `hard-tuned` 是有意的；arena 会按半庄轮换座位，避免固定座位污染。

```bash
cd /Users/liuhang/Documents/ace-zero
git pull
mkdir -p /tmp/ace-zero-arena

nohup node games/majiang/scripts/benchmark-ai-hanchan-arena.js \
  --mode mixed \
  --variants hard-pure,hard-tuned,hard-tuned,hard-tuned \
  --matches 1000 \
  --seed 20260603 \
  --checkpoint-interval 25 \
  --stdout summary \
  --out /tmp/ace-zero-arena/h14-hard-pure-vs-3-hard-tuned-1000.json \
  > /tmp/ace-zero-arena/h14-hard-pure-vs-3-hard-tuned-1000.log 2>&1 &

echo $! > /tmp/ace-zero-arena/h14-hard-pure-vs-3-hard-tuned-1000.pid
```

查看进度：

```bash
tail -f /tmp/ace-zero-arena/h14-hard-pure-vs-3-hard-tuned-1000.log
```

查看进程：

```bash
cat /tmp/ace-zero-arena/h14-hard-pure-vs-3-hard-tuned-1000.pid
ps -p "$(cat /tmp/ace-zero-arena/h14-hard-pure-vs-3-hard-tuned-1000.pid)"
```

完成后渲染摘要：

```bash
node games/majiang/scripts/analyze-ai-hanchan-arena-report.js \
  --report /tmp/ace-zero-arena/h14-hard-pure-vs-3-hard-tuned-1000.json
```

需要给看板或表格用 JSON：

```bash
node games/majiang/scripts/analyze-ai-hanchan-arena-report.js \
  --report /tmp/ace-zero-arena/h14-hard-pure-vs-3-hard-tuned-1000.json \
  --json
```

## Optional Confirmation Run

如果 1000 半庄仍显示 `hard-tuned` 明显优于 `hard-pure`，可以用另一个 seed 跑 2000 半庄确认：

```bash
nohup node games/majiang/scripts/benchmark-ai-hanchan-arena.js \
  --mode mixed \
  --variants hard-pure,hard-tuned,hard-tuned,hard-tuned \
  --matches 2000 \
  --seed 20260604 \
  --checkpoint-interval 25 \
  --stdout summary \
  --out /tmp/ace-zero-arena/h14-hard-pure-vs-3-hard-tuned-2000.json \
  > /tmp/ace-zero-arena/h14-hard-pure-vs-3-hard-tuned-2000.log 2>&1 &
```

## How To Read The Result

重点看 `hard-pure` 与 `hard-tuned`：

- `avgRank`：越低越好，是第一指标。
- `4th` / `flown`：越低越好，用来判断是否变得更容易崩盘。
- `dealIn` / `avgDealIn`：越低越稳。
- `hule` / `avgWin`：判断收益是否来自更强进攻，而不是只靠少放铳。
- `nonRiichiWin`、`call`、`riichi`：辅助判断风格变化。

因为阵容是 1 家 `hard-pure` 对 3 家 `hard-tuned`，`hard-tuned` 的 `rec` 大约是 `hard-pure` 的 3 倍。这是预期现象。

## Next Decision Rule

后续补丁必须先过三道门：

1. 固定候选 replay 能证明不是报告噪音。
2. Mortal bucket 不恶化，只作为挖问题参考。
3. Arena 1000 半庄 `avgRank`、四位率、放铳率不劣于当前 `hard-tuned`。

只提升 Mortal exact 但 arena 变差的补丁，不进入正式困难 AI。

## Experimental Ledger

P5 收口命令：

```bash
node games/majiang/scripts/build-hard-ai-experimental-ledger.js \
  --pool /tmp/h14-p1-hard-ai-repair-candidates.json \
  --defense-replay /tmp/h14-p3-defense-replay.json \
  --tile-choice-replay /tmp/h14-p4-tile-choice-replay.json \
  --defense-experiment /tmp/h14-p3-defense-experiment-scout.json \
  --tile-choice-experiment /tmp/h14-p4-tile-choice-experiment-scout.json \
  --out /tmp/h14-p5-hard-ai-experimental-ledger.json
```

读账本时优先看：

- `rejected-by-arena-scout`：候选级可改，但 arena scout 已拒绝，不要重复推进同一 overlay。
- `rejected-by-replay-gate` / `blocked-by-replay-gate`：replay 没有找到可直接补丁样本，不跑 arena。
- `manual-route-review`：需要人工复盘路线、宝牌、红五、役牌或听牌形，不应该继续堆简单 shape 规则。
- `eligible-for-scout`：只表示可以设计下一轮 scout，不表示可以进正式 hard。

当前本机 P5 快照：

- total `126`
- same-xiangting tile-choice `84`
- defense `15`
- backstep `19`
- route-dora-five `8`
- `eligible-for-scout=0`
- `rejected-by-arena-scout=1`
- `manual-route-review=19`

这意味着下一步应优先复盘这 `19` 条路线分歧；没有新的 overlay 候选需要立刻跑 arena。

## P6 Route Review And Arena Baseline

P6 不新增 overlay。它只补两份证据：

1. `hard-tuned` 相对 `hard-pure` 的 arena 基线判定。
2. `manual-route-review` 的固定局面复盘包。

生成路线复盘包：

```bash
node games/majiang/scripts/build-hard-ai-route-review-pack.js \
  --ledger /tmp/h14-p5-hard-ai-experimental-ledger.json \
  --pool /tmp/h14-p1-hard-ai-repair-candidates.json \
  --tile-choice-replay /tmp/h14-p4-tile-choice-replay.json \
  --json-out /tmp/h14-p6-route-review-pack.json \
  --md-out /tmp/h14-p6-route-review-pack.md
```

分析 `hard-pure` vs `hard-tuned` arena：

```bash
node games/majiang/scripts/analyze-hard-ai-tuned-vs-pure-arena.js \
  --report /tmp/ace-zero-arena/h14-hard-pure-vs-3-hard-tuned-1000.json \
  --out /tmp/h14-p6-tuned-vs-pure-arena-analysis.json
```

判读：

- `sampleStatus=scout`：样本还不够，只能看方向，不能定案。正式判定要求 `hard-pure records >= 800`。
- `tuned-better`：优先进入 P7B，从路线复盘里挑 `likely-bad-route` 建 fixture。
- `tuned-speed-loss-suspect` 或 `tuned-defense-gain-not-monetized`：优先进入 P7A，做 shape/defense/riichi tuning gate 消融。
- `inconclusive`：继续扩样本或换 seed，不改正式 hard。

## H15 Rejected Call-Suppression Experiments

H15/H15b 证明了一件重要的事：当前 hard 的“副露多、立直少”不能靠直接压副露解决。两条 call-suppression overlay 都已从 active experimental runtime 移除，之后不再跑 1000 半庄确认。

Rejected:

- `closed-riichi-route-call-discipline-v1`: v1 能压低副露并提高立直率，但过度挡掉降向听/推进型副露，导致 `hule`、`drawTenpai` 和 `avgRank` 恶化。
- `closed-route-low-value-call-filter-v2`: v2 更窄，但 175/200 scout 中相对 `hard-tuned` 仍退步，且没有真正降低 `calls/R` 或提高 `riichi`。

保留的 arena 观测字段：

- `chi/R`
- `peng/R`
- `closedCall/R`
- `flatCall/R`
- `improveCall/R`
- `yakuhai/R`
- `riichiOpp/R`
- `riichiOppTake`

当前结论：

- 不再新增“少鸣” overlay。
- 下一步如果继续处理风格病，应先做门清路线打点/立直阈值复盘，而不是拦截 call。
- `hard-tuned` 仍是正式 baseline；`hard-experimental` 继续通过显式 overlay 做 defense/tile-choice/closed-route value 实验。

## H15c Closed Route Value Rebalance

H15c 是新的 active experimental 方向，但仍不改变正式 `hard-tuned`。

Overlay:

- `closed-route-value-rebalance-v1`

After the first H15c scout looked promising, this route is also exposed as the standalone personality `hard-heavy`, with `hard-balanced` added as the milder route-value version. The older `hard-experimental --experimental-overlays closed-route-value-rebalance-v1` command remains useful for gate comparisons, but future tuning should prefer the four names:

- `hard-aggressive`: speed / legacy pure
- `hard-defensive`: safety / legacy tuned
- `hard-balanced`: all-around / mild closed route scoring
- `hard-heavy`: value / closed riichi route scoring

核心差异：

- 不再直接追求少鸣。
- 对每个可接受 call 计算 `callOpenRouteScore` 和 `passClosedRouteScore`。
- 只有门清、无压力、早中巡、`xiangting <= 2` 且 `passClosedRouteScore - callOpenRouteScore` 超过阈值时，才在 `hard-experimental` 覆盖为 pass。
- 直接进听 call、已副露、有立直压力、晚巡、开放路线价值明显更高的 call 不覆盖。

新增 arena 观测字段：

- `closedRouteReview/R`
- `closedRouteOverride/R`
- `callRouteScore`
- `passRouteScore`
- `routeMargin`

200 半庄 scout:

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

H15c 是否继续，不看 `calls/R` 单项，优先看：

- `avgRank` 是否不劣于 `hard-tuned` 超过 `0.02`
- 四位率是否不升 `2pp`
- 放铳率是否不升 `0.5pp`
- `hule` / `drawTenpai` 不明显下降
- `riichi` 或 `riichiOppTake` 有提升
- 平均打点不下降
