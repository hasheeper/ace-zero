# AI Benchmark Plan

## Goal

第一阶段不做整局胜率，也不做对战 ELO。

先做两件更轻、更稳定、也更适合当前工程状态的事：

- 局面级基准
- 建议分歧分析

这里的“基准”不是说 `easy` 已经可以和 `Mortal` 比强度，而是：

- 在同一个局面
- 让本地 AI 给出一个动作
- 再让 `Mortal` 给出一个建议
- 统计它们一致、不一致，以及不一致出现在哪一类动作上

## Current Scope

第一版 benchmark 只覆盖这些边界：

- 只做 `riichi-4p`
- 只做 `easy`
- 只做单局、单手的当前决策
- 只做固定 scripted scenario
- 只做当前一手建议，不做整局 rollout

当前不做：

- 胜率统计
- ELO
- 自博弈
- 长局分差分析
- 二麻 / 三麻
- 情绪层 / 性格层干预
- 异能逻辑

## Benchmark Layers

### 1. Case Runner

给一份固定 `game-config.*.json`，把 runtime 推到指定决策点。

当前已经收进：

- 默认四麻起手弃牌
- 立直判断
- `ukeire` 平手打破
- 立直压力下轻防守
- 基础手型偏好

这些都来自现有 `easy` smoke 场景。

### 2. Local AI Decision

当前只采本地 AI 的单次动作：

- `chooseDiscard()`

后续第二阶段再加：

- `chooseReaction()`
- `chi / pon / kan`
- `riichi` 反应拆分

### 3. Mortal Suggestion

在同一个 runtime 局面上，创建 `coach-controller`：

- 把 runtime 局面转成 `mjai`
- 请求 `Mortal`
- 取 `suggestionState.recommended`

### 4. Comparison

当前按这几层比对：

- `type` 是否一致
- `tileCode` 是否一致
- `callType / meldString` 是否一致
- `riichi` 是否一致

输出：

- `exactMatch`
- `typeMatch`
- `tileMatch`
- `callMatch`
- `riichiMatch`
- `mismatchKind`

## Why This Matters

这个框架的价值不在“立刻证明 easy 强不强”，而在于以后每升一个 AI 档位，都能回答这些问题：

- 它和 `Mortal` 在哪些局面差距最大
- 分歧主要是弃牌、立直，还是副露
- 它是不是总在某些类型的局面里犯同一种错

## Current Limitation

当前仓库里的 `Mortal` 仍然是 smoke 配置。

也就是说：

- benchmark 框架已经真实可跑
- 但当前 `Mortal` 输出还不能视为真正强度基准

所以第一版 benchmark 的意义是：

- 先验证流程
- 先固定数据结构
- 先建立分歧分析面

等真实权重接入后，这套 runner 和报告可以直接复用。

## Commands

全量跑第一版 benchmark：

```bash
node /Users/liuhang/Documents/acezero/majiang/scripts/benchmark-ai-vs-mortal.js
```

跑 smoke：

```bash
node /Users/liuhang/Documents/acezero/majiang/scripts/validate-ai-benchmark.js
```

只跑某一个 case：

```bash
node /Users/liuhang/Documents/acezero/majiang/scripts/benchmark-ai-vs-mortal.js easy-defense-smoke
```

## Next Step

第二阶段建议按这个顺序扩：

1. 加 reaction benchmark
2. 加 `chi / pon` 分歧分析
3. 加结果落盘 JSON
4. 加基础聚合报表
5. 等真实 `Mortal` 权重后，再开始做更有意义的质量对照
