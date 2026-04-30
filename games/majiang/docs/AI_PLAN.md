# Mahjong AI 新规划

本文是 `majiang` 项目的新版 AI 规划文档。

它替代旧版 `AI_PLAN.md`，作为当前统一口径，明确以下问题：

- 二麻、三麻、四麻如何共存
- AI 难度如何分层
- 什么叫基础 AI，什么叫外挂特殊 AI
- 未来的暴露条、心理影响、AI 倾向应该把接口留在哪里
- 当前先做什么，哪些只留接口暂不实现

本文是正式规划文档，不是阶段日志。

---

## 0. 当前收口状态

当前实现层已经有一个正式收口目标：

- 四麻 `easy v1`

这层的边界文档见：

- [EASY_AI_V1.md](/Users/liuhang/Documents/acezero/majiang/docs/EASY_AI_V1.md)

这里特别强调：

- `easy v1` 是基础简单 AI 的收口版本
- 它不是最终 AI
- 后续强度提升应进入 `normal / hard / hell`
- 不应继续把所有新能力零散补进 `easy`

也就是说：

**当前 AI 工程已经从“先让 easy 能打”进入“easy 收口、后续难度分层开发”的阶段。**

同时，当前代码层已经开始正式沉淀“基础层”，用于承接未来的 `easy / normal` 共用逻辑。

当前已落下的基础层职责如下：

- `discard-evaluator.js`
  当前弃牌主链与候选比较
- `riichi-evaluator.js`
  基础立直阈值与合法立直切判断
- `defense-evaluator.js`
  基础危险度与 push/fold 状态汇总
- `easy-policy.js`
  `easy` 的基础阈值与人味参数
- `normal-policy.js`
  `normal` 的基础阈值与人味参数

这意味着后续不应再把共享能力直接写死在单一 evaluator 里，而应继续往“基础 evaluator + difficulty policy”方向收口。

---

## 1. 总目标

`majiang` 的 AI 不追求一步做成“最强异能麻将 AI”。

当前正确目标是：

1. 先建立一套可复用的麻将基础 AI 底座
2. 让这套底座能运行在二麻、三麻、四麻
3. 再在其上叠加外挂特殊 AI
4. 最后再扩展暴露条、心理影响、异能、角色倾向

核心原则：

**先把基础打法和工程边界做稳，再做特殊能力。**

---

## 2. 新总框架

新版 AI 规划正式分成两层：

- `基础 AI`
- `外挂特殊 AI`

这两层必须明确分离，不能混成一个“大脑”。

### 2.1 基础 AI

基础 AI 是麻将本体能力。

它不管是二麻、三麻还是四麻，都应共享同一套基础决策框架，只在规则集、桌型参数、难度策略上有所差异。

基础 AI 负责：

- 合法动作判断
- 弃牌
- 立直
- 吃碰杠
- 和牌 / 过和
- 基础攻守判断
- 基础 push / fold
- 基础局况判断

基础 AI 不负责：

- 异能发动
- 异能反制
- 暴露条机制本身
- 心理影响演算
- 读心类外挂能力

### 2.2 外挂特殊 AI

外挂特殊 AI 是在基础 AI 之上的外挂层。

它不是替代基础 AI，而是：

- 读取基础 AI 的候选动作和评分
- 再叠加桌型特化逻辑
- 再叠加异能相关逻辑
- 再叠加暴露条 / 心理 / 倾向修正

外挂特殊 AI 当前分两类：

- `桌型外挂`
- `异能外挂`

#### 桌型外挂

针对：

- 二麻
- 三麻
- 四麻

它们的职责不是重写基础麻将能力，而是补足这些模式的额外差异：

- 座位人数差异
- 牌山结构差异
- 三麻特有动作和收益判断
- 二麻节奏和价值判断
- 四麻标准场况下的更完整攻守权衡

#### 异能外挂

针对未来：

- 发好牌 / 发烂牌
- 基础透视
- 反异能
- 暴露条
- 心理影响

当前阶段：

**异能外挂只留接口，不正式实现。**

---

## 3. AI 难度分层

新版正式采用四档难度：

- `简单`
- `普通`
- `困难`
- `地狱`

这四档不是四套完全独立 AI，而应建立在统一底层评估器之上。

推荐结构：

- 同一套 `base evaluator`
- 不同 `difficulty policy`
- 不同 `profile`
- 不同 `外挂特殊 AI` 修正

---

## 4. 四档难度定义

### 4.1 简单

定位：

- 对标雀魂较低难度人机体验
- 规则正确
- 不犯明显低级错误
- 但整体偏直线、保守、可读

能力要求：

- 基础向听判断
- 基础牌效
- 基础立直判断
- 基础副露判断
- 几乎不做复杂防守

实现原则：

- 不追求复杂搜索
- 不追求高压攻守转换
- 以“能正常打麻将”为目标

### 4.2 普通

定位：

- 对标雀魂普通难度人机体验
- 有稳定的基础攻守意识
- 可作为正常陪打体验

能力要求：

- 比简单更好的牌效
- 基础危险度
- 基础 push / fold
- 更稳定的立直 / 副露判断

实现原则：

- 仍属于基础 AI
- 不接异能
- 不依赖暴露条

### 4.3 困难

定位：

- 基础 AI 最高正式难度
- 目标达到“金牌守门员”级别
- 是未来高阶对局体验的主底座

能力要求：

- 更强的攻守评估
- 更强的危险度模型
- 更强的副露 / 立直 / 押退判断
- 更强的局况判断
- 可接受局部 1~2 巡搜索或 rollout

额外要求：

- 必须和未来暴露条机制顺畅衔接
- 必须给心理影响和 AI 倾向留接口

注意：

`困难` 仍然属于基础 AI，不是异能 AI。

也就是说：

**困难 = 标准麻将实力强，不靠外挂读手，不靠异能作弊。**

### 4.4 地狱

定位：

- `地狱` 的底层直接建立在 `困难` 之上
- 它不是另一套完全独立的基础 AI

正式定义：

**地狱 = 困难基础 AI + 更强的外挂特殊 AI 修正**

这层未来允许更强地使用：

- 技能运用
- 反异能判断
- 暴露条联动
- 更强的视图外挂能力
- 更强的对手手牌倾向识别

但当前阶段：

**地狱只定义结构和接口，不正式落地完整能力。**

---

## 5. 二麻、三麻、四麻的关系

### 5.1 原则

二麻、三麻、四麻不能各写一套完全独立 AI。

正确分层应是：

- 公共基础 AI
- ruleset / mode 差异参数
- 桌型外挂特化层

也就是说：

**先共享，再特化。**

### 5.2 基础 AI 的共通部分

以下能力应尽量共用：

- 候选动作生成后的评分框架
- 向听 / 有效牌 / 听牌质量评估
- 基础危险度接口
- 立直 / 副露 / 押退总体框架
- profile 和 difficulty policy

### 5.3 桌型外挂负责什么

桌型外挂负责各模式真正不同的逻辑：

- 二麻的牌型价值和节奏偏移
- 三麻的特殊规则和专属动作
- 四麻的标准多人攻守权衡

推荐设计：

- `mode-2p-special-ai`
- `mode-3p-special-ai`
- `mode-4p-special-ai`

但这些模块只做“额外修正”，不做“推翻基础评估器”的第二大脑。

---

## 6. 基础 AI 与外挂特殊 AI 的边界

### 6.1 基础 AI 必须稳定负责

- 规则合法性
- 动作评分主链
- 基础攻守
- 基础立直
- 基础副露
- 基础押退
- 基础局况理解

### 6.2 外挂特殊 AI 允许影响

- 不同模式的附加偏置
- 技能发动时机
- 反异能时机
- 额外透视信息如何使用
- 暴露条带来的风险收益判断
- 心理状态导致的偏好修正

### 6.3 当前阶段的硬约束

当前不允许：

- 让外挂特殊 AI 直接替代基础 AI
- 让异能逻辑直接写死在 UI 中
- 让模式差异散落到各处 if/else

当前允许：

- 先实现基础 AI
- 桌型外挂先留壳
- 异能外挂先留接口

---

## 7. 暴露条机制接口

当前项目还没有正式暴露条机制，但必须提前留接口。

这里统一把未来相关抽象称为：

- `暴露状态`
- `暴露事件`
- `暴露视图`

### 7.1 暴露条机制未来可能影响什么

- AI 是否判断自己“被看穿”
- AI 是否判断对手“暴露过多”
- 技能是否值得发动
- 是否值得保留技能
- 是否继续 push
- 是否因为暴露风险而转守

### 7.2 当前必须提前留的接口

AI 输入中应预留：

- `exposureState`
- `exposureSignals`
- `exposureEstimate`

说明：

- `exposureState`
  当前 seat 的正式暴露状态
- `exposureSignals`
  最近的暴露事件或外部影响
- `exposureEstimate`
  AI 对敌我暴露程度的估计

### 7.3 当前阶段要求

当前：

- 不实现正式暴露条逻辑
- 但 AI 输入协议必须允许这些字段存在

---

## 8. 心理影响接口

未来 AI 不仅有“数值强弱”，还会有心理影响。

这里的心理影响不是剧情文本，而是：

- 压迫感
- 谨慎度变化
- 连续被针对后的保守
- 连胜 / 连铳后的偏差
- 对特定对手的倾向变化

### 8.1 当前必须留的抽象

建议预留：

- `mentalState`
- `mentalModifiers`
- `opponentImpression`

说明：

- `mentalState`
  AI 当前自身心理状态
- `mentalModifiers`
  对基础评分器的修正项
- `opponentImpression`
  AI 对其他座位的倾向认知

### 8.2 当前阶段要求

当前：

- 不做完整心理系统
- 只在 AI 输入输出和 profile 接口中给位置

---

## 9. AI 倾向与 profile

AI 倾向不是另写一套算法，而是对统一基础评估器的偏置。

推荐保留的 profile 方向：

- `speedWeight`
- `valueWeight`
- `safetyWeight`
- `riichiAggression`
- `meldAggression`
- `pushThreshold`
- `foldThreshold`
- `skillUsageBias`
- `antiSkillReserve`
- `randomness`

未来可支持的人格方向：

- 速攻型
- 打点型
- 稳健型
- 激进型
- 技能保守型
- 反制优先型

当前阶段：

- `profile` 只作为接口和配置项存在
- 不要求现在做完整角色人格系统

---

## 10. AI 输入输出协议

AI 输入输出协议必须现在就统一，否则后续模式 AI、技能 AI、暴露机制、心理机制会互相冲突。

### 10.1 AI 输入至少应包含

- 当前动作窗口
- 当前可行动作列表
- 当前 seat 的 AI view
- 当前 player view
- 当前 truth context 的安全摘要
- 当前 round context
- 当前 match context
- 当前 ruleset / mode
- 当前 difficulty
- 当前 profile
- 预留的 `exposureState`
- 预留的 `mentalState`

### 10.2 AI 输出至少应支持

- `discard`
- `meld`
- `riichi`
- `hule`
- `pass`
- `skill`
- `counter-skill`

说明：

- 当前可以只有前五项真正实现
- `skill` / `counter-skill` 当前只留协议

---

## 11. 视图分层要求

为了支持未来的透视、暴露条、心理战和异能，必须坚持视图分层。

推荐继续采用三层：

- `truth view`
- `player view`
- `ai augmented view`

解释：

- `truth view`
  真相层，只给系统和调试使用
- `player view`
  玩家合法可见信息
- `ai augmented view`
  AI 在玩家视图基础上附加的特殊可见信息

未来这些能力都应通过 `ai augmented view` 接入：

- 不完全透视
- 暴露条附加信息
- 心理判断线索
- 异能带来的额外提示

当前阶段：

- 允许 `ai augmented view` 为空增强
- 但接口必须保留

---

## 12. 难度、profile、外挂层的关系

三者关系必须明确：

- `difficulty`
  决定基础 AI 的强度上限
- `profile`
  决定 AI 风格偏置
- `special ai`
  决定模式 / 异能 / 暴露 / 心理的外挂修正

推荐理解方式：

```text
基础评估器
  -> difficulty policy
  -> profile 偏置
  -> special ai 修正
  -> 最终选择
```

其中：

- `简单 / 普通 / 困难` 属于基础 AI 难度
- `地狱` 属于“困难底座 + 更强外挂修正”

---

## 13. 推荐工程结构

建议正式采用：

```text
engine/ai/
  base-ai.js
  discard-evaluator.js
  call-evaluator.js
  riichi-evaluator.js
  defense-evaluator.js
  base-ai-policy.js
  difficulty/
    easy.js
    normal.js
    hard.js
    hell.js
  profiles/
    default.js
    speed.js
    value.js
    defense.js
    aggressive.js
  special/
    mode-2p.js
    mode-3p.js
    mode-4p.js
    skill-ai.js
    counter-skill-ai.js
    exposure-adapter.js
    mental-adapter.js
```

职责建议：

- `base-ai.js`
  AI 统一入口
- `discard-evaluator.js`
  弃牌评分
- `call-evaluator.js`
  吃碰杠评分
- `riichi-evaluator.js`
  立直判断
- `defense-evaluator.js`
  危险度与押退
- `base-ai-policy.js`
  把评估器结果汇总成统一决策流程
- `difficulty/*.js`
  不同难度的策略配置
- `profiles/*.js`
  风格偏置
- `special/mode-*.js`
  二麻 / 三麻 / 四麻外挂修正
- `special/skill-ai.js`
  技能使用接口
- `special/counter-skill-ai.js`
  反异能接口
- `special/exposure-adapter.js`
  暴露条接口适配
- `special/mental-adapter.js`
  心理影响接口适配

注意：

当前阶段可以只实现：

- `base-ai.js`
- `discard-evaluator.js`
- `call-evaluator.js`
- `riichi-evaluator.js`
- `defense-evaluator.js`
- `difficulty/easy.js`
- `difficulty/normal.js`
- `difficulty/hard.js`

其余模块允许先留空壳。

---

## 14. 当前实现优先级

### Phase 1

先完成基础 AI 主链：

- 基础弃牌
- 基础立直
- 基础副露
- 基础防守
- 简单 / 普通 两档

### Phase 2

把基础 AI 做到高质量：

- 困难档
- 更强危险度
- 更强押退
- 局部搜索或 rollout

### Phase 3

建立正式外挂特殊 AI 架构：

- 二麻 / 三麻 / 四麻外挂模块
- skill / counter-skill 协议
- 暴露接口
- 心理接口

### Phase 4

再考虑真正上高阶玩法：

- 地狱档
- 异能联动
- 暴露条正式机制
- 心理影响正式机制
- 更完整角色倾向

---

## 15. 当前不做什么

当前规划明确不要求立刻做：

- 完整异能系统
- 完整暴露条系统
- 完整心理系统
- 读心式强透视
- 完整地狱 AI
- 为二麻 / 三麻 / 四麻各写一套独立大脑

当前明确只要求：

- 先把基础 AI 的边界和接口做对
- 先把简单 / 普通 / 困难三档基础 AI 做稳
- 让地狱档有合法的架构落点

---

## 16. 最终定稿

新版 AI 规划正式定稿为：

### 16.1 难度

- 简单
- 普通
- 困难
- 地狱

其中：

- 简单、普通对标雀魂较低和普通人机体验
- 困难目标对标金牌守门员级别
- 地狱以困难为底座，再叠加更强外挂特殊 AI

### 16.2 分层

- 基础 AI
- 外挂特殊 AI

其中：

- 简单、普通、困难属于基础 AI
- 地狱本质上是困难底座上的高阶外挂修正

### 16.3 模式

- 二麻、三麻、四麻共用基础 AI
- 不同模式差异通过外挂特殊 AI 处理

### 16.4 未来接口

必须提前留接口：

- 暴露条
- 心理影响
- AI 倾向
- 异能与反异能

### 16.5 当前工程原则

**基础 AI 先做强，外挂特殊 AI 先留口，暴露与心理先定协议，不抢跑做全。**
