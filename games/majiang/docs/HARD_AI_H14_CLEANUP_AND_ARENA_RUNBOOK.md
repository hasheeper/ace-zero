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
