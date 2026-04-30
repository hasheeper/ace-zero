# P2 Plan: 吃碰杠主链收口

本文是当前单局麻将实现进入 P2 阶段的执行文档。

P1 已基本完成立直正式化，当前最影响稳定性的部分，已经从“立直规则”转移到“吃碰杠主链是否稳定、浏览器 runtime 与 engine runtime 是否一致”。

这一阶段的核心目标只有一句话：

**把吃、碰、大明杠、加杠、暗杠收口成一条稳定的正式主链，并且继续以 `majiang-core` 为规则真源。**

---

## 1. P2 原则

P2 明确遵守下面三条，不走偏：

- `majiang-core` 负责：
  - 规则判断
  - 副露/杠合法性
  - 手牌、牌河、牌山状态
  - 和牌/副露基础语义
- `engine/runtime` 负责：
  - 单局 phase/turn 编排
  - reaction window 生命周期
  - 杠后流程串联
  - snapshot 与事件流
- `browser` 层只负责：
  - bottom 玩家交互
  - AI 自动推进
  - 动画、cut-in、调试日志

一句话边界：

**P2 不自立规则，不重写副露判定，只收口 runtime 状态机与浏览器接线。**

---

## 2. 当前状态

按当前代码检查，这块已经具备“可跑”的基础：

- 已有：
  - 吃/碰 reaction 生成
  - 三种杠区分
  - 杠后流程 `resolveKanSequence(...)`
  - `qianggang` 基础窗口
  - reaction priority 基础排序
  - AI reaction / AI 副露后自动续跑的补丁逻辑
- 仍不稳定：
  - engine runtime 与 browser formal runtime 双实现，存在行为漂移风险
  - 副露后 `turnSeat / phase` 推进分散在多处
  - browser factory 里为了避免“卡死”已经累积了若干补丁逻辑
  - 某些“纯 AI reaction”链路需要浏览器层额外兜底

一句话判断：

**P2 当前不是“完全没做”，而是已经进入“能跑但要统一和固化”的阶段。**

---

## 3. P2 目标

P2 完成后，至少要满足：

- 吃、碰、大明杠、加杠、暗杠都走统一动作语义
- reaction priority 固定为：
  - 荣 > 杠 > 碰 > 吃
- 副露后 `turnSeat` 与 `phase` 严格一致
- AI 吃/碰/杠后一定继续走完它该走的那一步
- browser runtime 与 engine runtime 对同一动作链给出一致结果
- 不再依赖“UI 看起来没卡”判断流程是否正确，而是 snapshot / 事件 / UI 三者一致

---

## 4. 范围

本阶段纳入范围：

- 四麻
- 单局
- 吃
- 碰
- 大明杠
- 加杠
- 暗杠
- 杠后流程
- 副露后自动续跑
- reaction priority 收口

本阶段不纳入范围：

- 跨局
- 三麻规则
- 新役种扩张
- 多局结算推进
- AI 难度扩张
- 复杂演出系统

---

## 5. P2 执行块

### P2.1 统一动作语义

目标：

- `callMeld()` 只承担吃/碰
- `declareKan()` 只承担杠成立
- `resolveKanSequence()` 统一承担杠后流程

要求：

- reaction 明杠继续走 reaction `kan`
- 自回合暗杠 / 加杠统一走 `resolveKanSequence()`
- browser factory 与 action resolver 不再偷偷分叉语义

涉及文件：

- [single-round-runtime.js](/Users/liuhang/Documents/acezero/majiang/engine/runtime/single-round-runtime.js)
- [browser-formal-runtime-core.js](/Users/liuhang/Documents/acezero/majiang/frontend/scripts/runtime/browser-formal-runtime-core.js)
- [action-resolver.js](/Users/liuhang/Documents/acezero/majiang/engine/runtime/action-resolver.js)

验收：

- 同一动作在 engine/browser 两边不会出现“一个走 call，一个走 kan”的漂移

### P2.2 Reaction Priority 收口

当前优先级定义已经存在于：

- [reaction-priority.js](/Users/liuhang/Documents/acezero/majiang/engine/runtime/reaction-priority.js)

规则为：

- `HULE = 400`
- `KAN = 300`
- `PENG = 200`
- `CHI = 100`

P2 要做的不是重写，而是确保全链一致使用：

- browser formal runtime 的 reaction 排序
- `assertReactionActionAllowed(...)`
- `passReaction(...)` 后剩余动作重算

验收：

- 低优先级动作绝不会抢在高优先级前执行

### P2.3 副露后 Phase / Turn 收口

这是 P2 最核心的一块。

目标链：

1. 弃牌
2. 开 reaction window
3. 选中吃/碰/大明杠
4. 应用 `majiang-core` 的 `fulou/gang`
5. 正确进入后续 phase

固定约束：

- 吃/碰/大明杠成立后：
  - `turnSeat = 副露者`
  - `phase = await_discard`
- 加杠 / 暗杠成立后：
  - 进入 `await_resolution`
  - 再串 `杠 -> 岭上摸 -> 翻宝 -> await_discard`
- 全员过牌后：
  - `phase = await_draw`
  - `turnSeat = nextSeat`

涉及文件：

- [single-round-runtime.js](/Users/liuhang/Documents/acezero/majiang/engine/runtime/single-round-runtime.js)
- [browser-formal-runtime-core.js](/Users/liuhang/Documents/acezero/majiang/frontend/scripts/runtime/browser-formal-runtime-core.js)

验收：

- 吃碰杠后不会停在无按钮的 `await_reaction`
- snapshot 中 `phase / turnSeat / availableActions` 三者一致

### P2.4 AI 副露后自动续跑稳定化

这块主要在浏览器层收口。

原则：

- browser factory 只做自动推进，不做规则判定
- “是否能吃/碰/杠/荣”继续以 runtime 输出和 `majiang-core` 判定为准

需要稳定的场景：

- 底家打牌后，只有 AI 有 reaction
- AI 吃后进入自己的弃牌阶段
- AI 碰后进入自己的弃牌阶段
- AI 杠后进入自己的杠后弃牌阶段
- AI 全员过牌后，自动推进到下一摸

涉及文件：

- [browser-formal-runtime-factory.js](/Users/liuhang/Documents/acezero/majiang/frontend/scripts/runtime/browser-formal-runtime-factory.js)

验收：

- 不再因为“只有 AI 有 reaction”停在无可操作 UI
- AI 副露和杠后一定继续到下一步

### P2.5 浏览器与 Engine Runtime 对齐

目标：

- 把 phase / turn / reaction 生命周期的主语义尽量收回 runtime core
- browser factory 只保留：
  - action window 刷新
  - bottom 交互
  - AI 自动推进
  - 动画/日志

要求：

- 不把规则修复永久留在 browser-only 补丁里
- 能下沉到 engine/runtime 的，优先下沉

验收：

- 同一场动作链，engine runtime 与 browser formal runtime 的 snapshot 结果一致

---

## 6. 推荐实施顺序

P2 不建议并行乱修，按下面顺序最稳：

1. `P2.3` 副露后 phase / turn 收口
2. `P2.4` AI 副露后自动续跑稳定化
3. `P2.1` 动作语义统一
4. `P2.2` reaction priority 全链复核
5. `P2.5` browser / engine 对齐收尾

---

## 7. 验收样例

P2 完成后，至少要有下面 4 组固定样例：

- `chi-focus`
  - 底家打牌，下家吃，随后自动打牌
- `peng-focus`
  - 底家打牌，他家碰，随后自动打牌
- `daiminkan-focus`
  - 反应明杠成立，随后杠后流程继续
- `ankan-kakan-focus`
  - 自回合暗杠 / 加杠成立，随后岭上摸、翻宝、弃牌继续

建议每组样例都分成：

- `setup`
- `final`

这样出问题时能迅速判断是：

- 配置问题
- runtime 状态机问题
- browser 自动续跑问题
- UI 渲染问题

---

## 8. P2 完成标准

P2 全部完成后，必须同时满足：

- 吃碰杠后不会卡 phase
- reaction priority 始终正确
- AI 副露和杠后一定继续走完该走的一步
- browser formal runtime 与 engine runtime 对同一动作链输出一致
- 吃、碰、大明杠、加杠、暗杠都进入稳定主链

一句话：

**P2 的目标不是“再加规则”，而是把副露与杠从“能跑”收口成“稳定正式主链”。**
