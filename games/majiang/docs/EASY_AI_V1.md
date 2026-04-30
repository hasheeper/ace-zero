# Easy AI v1 收口说明

本文定义 `majiang` 当前四麻 `easy` AI 的正式收口边界。

它的作用不是继续拔高 AI 强度，而是明确：

- 当前 `easy v1` 已实现什么
- 当前 `easy v1` 明确不做什么
- 后续 `normal / hard / hell` 应该从哪里继续扩展

---

## 1. 当前定位

`easy v1` 的定位只有一个：

**成为“能正常打四麻”的基础简单 AI。**

它不是最终 AI，也不是强 AI，更不是后续异能 AI 的直接成品。

它当前只服务于以下目标：

- 四麻单局能完整推进
- 行为基本像麻将，不是纯随机
- 不犯太离谱的基础错误
- 为后续 `normal / hard / hell` 提供稳定底座和测试基线

---

## 2. 当前已实现能力

当前 `easy v1` 已经具备以下能力：

- 基础弃牌闭环
- 基础立直判断
- `hule` 优先
- 默认 `pass`
- 第一版 `chi / peng` 判断
- 基础牌效排序
- 基础立直压力下的轻防守
- 基础手型偏好

更具体地说：

### 2.1 弃牌

当前弃牌排序主链是：

1. `xiangting`
2. `tingpaiCount`
3. `ukeireCount`
4. `handShape`
5. `riichi pressure safety`
6. 非摸切优先
7. 手牌位置 tie-break

对应文件：

- [discard-evaluator.js](/Users/liuhang/Documents/acezero/majiang/engine/ai/discard-evaluator.js)
- [hand-metrics.js](/Users/liuhang/Documents/acezero/majiang/engine/ai/support/hand-metrics.js)
- [defense-evaluator.js](/Users/liuhang/Documents/acezero/majiang/engine/ai/evaluators/defense-evaluator.js)
- [tile-danger.js](/Users/liuhang/Documents/acezero/majiang/engine/ai/support/tile-danger.js)
- [push-fold.js](/Users/liuhang/Documents/acezero/majiang/engine/ai/support/push-fold.js)

### 2.2 立直

当前立直判断只做最基础版本：

- 仅四麻 `easy`
- 必须是合法立直切
- 听牌张数达到最低阈值
- 剩余牌数达到最低阈值

它的目标是“能正常立直”，不是“最优立直判断”。

当前这部分已经从弃牌排序里拆出基础层入口：

- [riichi-evaluator.js](/Users/liuhang/Documents/acezero/majiang/engine/ai/evaluators/riichi-evaluator.js)
- [easy-policy.js](/Users/liuhang/Documents/acezero/majiang/engine/ai/difficulty/easy-policy.js)

### 2.3 反应

当前反应顺序：

- 有 `hule` 必和
- 否则尝试 `chi / peng`
- 如果副露不能明确改善向听，则默认 `pass`

### 2.4 副露

当前 `easy v1` 的副露边界非常克制：

- 只看 `chi / peng`
- 副露后**明确降向听**时会考虑选择
- 基础役牌 `peng` 在“不变差”的情况下会考虑：
  - 三元牌
  - 自风
  - 场风
- 平向听但**明显提速**时也会考虑：
  - `ukeire` 明显变多
  - 或手型明显变好
- 不做复杂役种判断
- 不做局况驱动鸣牌
- 不做激进副露
- 场上已有立直时，平向听提速鸣牌会重新收紧

对应文件：

- [call-evaluator.js](/Users/liuhang/Documents/acezero/majiang/engine/ai/evaluators/call-evaluator.js)

---

## 3. 当前明确不做的内容

下面这些内容**不属于 `easy v1` 收口范围**：

- 复杂押退
- 中后盘巡目策略
- 精细危险度模型
- 读牌
- 役种导向进攻
- 精细副露策略
- 局部搜索 / rollout
- 二麻专用 AI
- 三麻专用 AI
- 异能逻辑
- 暴露条逻辑
- 心理影响
- AI 性格系统正式落地

这些内容不应继续零散补到 `easy` 里。

---

## 4. 当前模式边界

当前 `easy v1` 正式支持范围：

- `riichi-4p`

当前不作为 `easy v1` 交付范围的：

- `riichi-3p-sanma`
- `riichi-2p-pinzu-honor`

也就是说：

**当前 simple AI 的正式收口，只对四麻负责。**

---

## 5. 当前测试基线

`easy v1` 当前已经有正式 smoke 基线，集中在：

- [validate-easy-ai.js](/Users/liuhang/Documents/acezero/majiang/scripts/validate-easy-ai.js)

当前保留的 smoke：

- `easy-ai-current-turn-smoke`
  证明当前回合能真实产出弃牌决策
- `easy-ai-riichi-smoke`
  证明固定四麻场景会立直并写入 runtime 状态
- `easy-ai-ukeire-smoke`
  证明平分局面下会用 `ukeireCount` 选更好的打点
- `easy-ai-defense-smoke`
  证明立直压力下会优先选择现物
- `easy-ai-shape-smoke`
  证明会优先切孤张字牌并保留更合理的手型
- `easy-ai-call-smoke`
  证明会在反应窗口中选择明确降向听的 `chi`
- `easy-ai-yakuhai-call-smoke`
  证明会对基础役牌 `peng` 做最基本的价值判断
- `easy-ai-speedup-call-smoke`
  证明平向听但明显提速时会选择 `chi`

这些 smoke 现在就是 `easy v1` 的正式验收基线。

---

## 5.1 当前基础层落点

为了避免后续 `easy / normal` 继续互相污染，当前共享基础能力已经开始独立落位：

- `discard-evaluator`
  管弃牌候选主链，不直接承担所有共享逻辑
- `riichi-evaluator`
  管基础立直判断和阈值
- `defense-evaluator`
  管基础危险度和 push/fold 汇总
- `easy-policy`
  管 `easy` 的阈值与偏好参数
- `normal-policy`
  作为未来 `normal` 的同层参数入口

后续如果继续做 `normal`，应优先扩这些基础层文件，而不是回到 `easy` patch 风格。

---

## 6. 当前工程边界

`easy v1` 之后，工程上不应继续把所有新能力都塞进同一层 patch。

后续建议：

- `easy`
  保持当前强度，只允许修 bug，不再继续提能力上限
- `normal`
  在现有基础上增强牌效、役牌、副露和基础押退
- `hard`
  作为标准麻将强度主底座，补更完整攻守和局况判断
- `hell`
  以 `hard` 为底，再叠外挂特殊 AI、技能、暴露和心理接口

---

## 7. 收口结论

当前结论明确如下：

**`easy v1` 已进入收口状态。**

从现在开始：

- 可以修 bug
- 可以补测试
- 可以做文档整理
- 不再继续把它往“更强 AI”方向推

后续强度提升，应进入：

- `normal`
- `hard`
- `hell`

而不是继续无限给 `easy` 打补丁。
