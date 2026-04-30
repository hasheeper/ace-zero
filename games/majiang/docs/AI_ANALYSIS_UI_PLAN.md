# AI Analysis UI Plan

## Target

前端最终要显示的，不只是单条教练建议，而是一个持续的分析面板：

- 当前玩家的 `Mortal` 率
- 各个 AI 的 `Mortal` 率
- 各个 AI / 玩家的善手、恶手
- 分歧主要集中在哪一类局面

这里的 `Mortal` 率，第一阶段定义成：

- 在可比较局面里
- 本地决策与 `Mortal` 推荐完全一致的比例

同时保留：

- `actionTypeRate`
- `riichiRate`
- 后续可加 `callRate`

## Current Foundation

现在已经具备：

- 单局、单手 benchmark runner
- `easy` 固定场景对照
- `Mortal` suggestion state
- 分歧分类
- subject 级 summary
- 善手 / 中性手 / 恶手分桶

相关代码：

- [ai-benchmark-helpers.js](/Users/liuhang/Documents/acezero/majiang/scripts/lib/ai-benchmark-helpers.js)
- [benchmark-analysis.js](/Users/liuhang/Documents/acezero/majiang/engine/coach/review/benchmark-analysis.js)
- [benchmark-ai-vs-mortal.js](/Users/liuhang/Documents/acezero/majiang/scripts/benchmark-ai-vs-mortal.js)

## Analysis Contract

前端以后最适合接收的是 `analysis report`，而不是原始 benchmark row。

当前 report 已经包含：

- `subjects[]`
  - `summary`
    - `mortalRate`
    - `actionTypeRate`
    - `riichiRate`
    - `goodCount`
    - `neutralCount`
    - `badCount`
    - `bucketCounts`
  - `goodHands[]`
  - `neutralHands[]`
  - `badHands[]`
  - `rows[]`

## What Still Missing

离前端真正可展示，还差这几层：

### 1. Runtime Collection Layer

现在 benchmark 主要是离线脚本。

还缺：

- 从浏览器对局实时收集玩家决策
- 从 AI seat 自动收集每一步动作
- 每一步都请求一次 `Mortal` 对照
- 把结果累计成 per-seat / per-subject report

### 2. Subject Model

现在只有一个 subject：

- `easy(right)`

后面要扩成：

- `player:bottom`
- `ai:right:easy`
- `ai:top:normal`
- `ai:left:hard`

### 3. Judgment Refinement

现在善手恶手判断还是第一版：

- `good`: 完全一致
- `neutral`: 同动作族但细节不同
- `bad`: 动作大类不同、立直阈值不同、或防守关键牌分歧

后面还要继续细化：

- `tile-defense`
- `tile-shape`
- `tile-efficiency`
- `riichi-threshold`
- `call-aggression`

### 4. UI State Bridge

还需要把 analysis report 推到浏览器 bridge。

建议新增：

- `setCoachAnalysisState()`
- `getCoachAnalysisState()`
- `subscribeCoachAnalysisState()`

### 5. Real UI Panel

在 coach 卡片之外，再加一块 analysis panel：

- 顶部：当前玩家 `Mortal` 率
- 中部：四家对照条形图
- 底部：最近几手善手 / 恶手列表

## Recommended Order

1. 先做 reaction benchmark
2. 再做 seat / subject 扩展
3. 再做 runtime 采集器
4. 再做 analysis bridge state
5. 最后做正式前端分析面板

## Current Meaning

现在这套不是最终分析系统，但已经有了最重要的底座：

- 统一比较口径
- 统一 report 结构
- 统一善手恶手分桶方式

这三件事先固定，后面的 UI 和实时统计才不会反复推翻。
