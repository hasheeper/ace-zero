# AceZero 技能系统收口记录

更新时间：2026-05-03

## 当前结论

通用技能系统已按 `技能需求稿.md` 完成第一版接口收口。

当前正式运行时字段为：

```text
skill.system
skill.kind
skill.level
skill.matrix
skill.lockChance
skill.special
```

force 进入 MoZ 结算时同样使用：

```text
force.type
force.system
force.kind
force.level
force.matrix
force.lockChance
force.special
```

旧的 T123 / attr / 旧 Psyche / 旧 Void 接口不再作为正式技能入口。

## 已清理的旧接口

以下旧接口已从技能核心运行链路清除：

```text
skill.attr
force.attr
skill.tier
force.tier
selectedSkill.tier
payload.tier
positionTier
options.tier
pack.tier
clarity
axiom
reversal
null_field
void_shield
purge_all
COUNTER_MAP
getCounterMultiplier
ADVANTAGE_MULT
DISADVANTAGE_MULT
_applyTierSuppression
旧 _applyInsulation / void_shield 版本
```

保留的 `attr` 只属于 AttributeSystem 内部“属性面板”变量名，不是技能 / force 接口。

## 结算结构

MoZ force resolution 现在统一走显式流水线：

```text
resolveForceOpposition(forces, context)
  applyReality()
  applyInsulation()
  applyForceLocks()
  applySystemCounters()
  applyPsycheMatrix()
  applyFortuneCurseContest()
```

当前克制规则：

```text
Psyche 防守 / 转化 Chaos ×1.25
Chaos 对 Moirai ×1.25
Moirai 通过 fortune noise 降低 Psyche 信息有效值
```

AttributeSystem 不再承载三角克制，只负责属性面板数值、属性加成和 Void divisor。

## VV 建仓口径

VV 的建仓规模不再使用 `tier`。

正式字段为：

```text
entrySize = 1 / 2 / 3
```

`entrySize` 表示头寸规模档位，不是技能等级。

## JSON 技能等级配置

`content/game-config.json` 的技能配置推荐使用显式对象格式：

```json
{
  "vanguardSkills": [
    { "key": "grand_wish", "level": 4 },
    { "key": "heart_read", "level": 2 }
  ],
  "skills": [
    { "key": "analysis", "level": 3 }
  ]
}
```

仍兼容旧的字符串数组：

```json
["grand_wish", "analysis"]
```

但字符串数组只会使用技能默认等级，不适合作为正式调参格式。

当前 `content` 下德州配置已切成通用技能测试口径：

```text
minor_wish
grand_wish
divine_order
hex
havoc
catastrophe
analysis
premonition
refraction
insulation
reality
```

主配置和教程配置暂不使用角色专属技能，方便回归通用结算链路。

AI 仍然保留角色 profile：

```text
difficulty: vv / cota / sia / ...
```

这些 profile 会先保留给 `NpcRoleDirector` 做角色偏好；进入通用技能决策时会归一化为基础难度：

```text
vv / rino / sia / kuzuha / trixie / eulalia / kako -> boss
cota / kazu / poppy -> pro
```

因此测试配置可以使用通用技能，同时仍保持角色 AI 的下注个性与 profile 行为。

NPC 技能释放窗口：

```text
pre-bet：信息 / 防御类技能，例如 analysis、premonition、refraction、insulation
post-bet：攻击 / 增益类技能，例如 hex、havoc、grand_wish
reactive-defense：post-bet 新增 curse/chaos 后，目标 NPC 的即时防御窗口，例如 premonition、refraction、insulation
```

这些窗口分别限 1 次，避免 pre-bet 信息技能把同一街的诅咒防御窗口吃掉。

`reactive-defense` 的目标是解决 Boss / 精英 AI 被诅咒后的响应延迟：当一个 NPC 的 post-bet 技能新增 curse/chaos force 后，被指向的 NPC 会立刻获得一次防御判定。排序上会优先防守 / 转化型 Psyche，其次才是普通信息技能，因此 `analysis` 不会抢掉 `premonition` / `refraction` 的防御机会。

暂不进入测试配置的专属技能包括：

```text
royal_decree
heart_read
deal_card
gather_or_spread
clairvoyance
bubble_liquidation
miracle
lucky_find
rule_rewrite
blind_box
absolution
benediction
reclassification
general_ruling
house_edge
debt_call
```

## 当前文件分工

```text
core/skill-system.js
  技能目录、注册、mana、CD、使用次数、技能转 force。

core/monte-of-zero.js
  MoZ 统一 force 对抗与四体系结算。

core/poker-ai.js
  NPC 使用技能决策；按 skill.system / skill.level 判断。

core/runtime/builtin-role-modules.js
  角色专属 Runtime、资产标记、头寸、合同、角色事件。

ui/skill-ui.js
  技能按钮、Psyche 读局展示、VV 建仓面板。

rpg/attribute-system.js
  属性面板，不做克制。

rpg/combat-formula.js
  Combat 层属性加成、Void divisor、特质被动 force 注入。
```

## Combat / Asset 边界

Combat 和 Asset 目前只保留必要接口，不做最终深度接入。

原因：

```text
Combat 涉及战斗收益、特质、前后排、伤害/资源公式。
Asset 涉及长期成长、角色资产、剧情/经济变量。
```

这两块会影响更大的系统闭环，应该最后接入，避免技能结算还没稳定时提前耦合。

当前允许：

```text
CombatFormula.enhanceForces()
CombatFormula.applyVoidReduction()
AssetLedger 记录角色临时资产 / 标记 / 合同
```

当前不做：

```text
Combat 正式收益重算
Asset 长期成长正式结算
Combat / Asset 对 encounter 或剧情收益的最终参与
```

## 实机回归

新增无依赖实机回归脚本：

```bash
node games/texasholdem/texas-holdem/scripts/skill-real-regression.mjs
```

使用方式：

```text
1. 先启动本地静态服务器。
2. 启动 Chromium / Edge headless DevTools 端口。
3. 执行脚本连接 CDP，真实加载 texas-holdem.html。
```

当前已覆盖：

```text
页面真实加载
静态 game-config.json 生效
NEW HAND 点击
GRIMOIRE 展开
RINO 技能卡显示
技能面板旧 Tier / T123 / 旧 Psyche / 旧 Void 文案扫描
点击大吉扣 mana
pending force 注入
MoZ resolveForceOpposition 基础调用
浏览器 pageIssues 检查
```

本轮实机结果：

```text
humanPlayerId = 0
humanSkillCount = 4
GRIMOIRE buttons = 4
点击大吉：MP 100 -> 80
pendingForces：0 -> 2
pending force 使用 system / kind / type / power / level
pageIssues = []
```

本轮修正：

```text
content/game-config.json 旧 clarity -> analysis
content/tutorials/texas-holdem/mental-special.json 旧 clarity -> analysis，旧 bad_omen -> hex
content/tutorials/texas-holdem/expert-skip-basics.json 旧 clarity -> analysis
runtime / trait / receipt force 补齐 kind 字段
回归脚本等待 RPG / 静态配置初始化完成后再点击 NEW HAND
```

## 已验证

语法检查已通过：

```bash
node --check games/texasholdem/texas-holdem/core/skill-system.js
node --check games/texasholdem/texas-holdem/core/monte-of-zero.js
node --check games/texasholdem/texas-holdem/core/poker-ai.js
node --check games/texasholdem/texas-holdem/core/runtime/builtin-role-modules.js
node --check games/texasholdem/texas-holdem/core/runtime/force-runtime.js
node --check games/texasholdem/texas-holdem/ui/skill-ui.js
node --check games/texasholdem/texas-holdem/ui/tutorial-content.js
node --check games/texasholdem/texas-holdem/rpg/attribute-system.js
node --check games/texasholdem/texas-holdem/rpg/combat-formula.js
node --check games/texasholdem/texas-holdem/rpg/rpg-init.js
node --check games/texasholdem/texas-holdem/texas-holdem.js
node --check games/texasholdem/texas-holdem/scripts/skill-real-regression.mjs
```

旧接口扫描目标为空：

```text
skill.attr / force.attr
skill.tier / force.tier
payload.tier / options.tier / positionTier / pack.tier
T0 / T1 / T2 / T3 / T123
clarity / axiom / reversal
null_field / void_shield / purge_all
COUNTER_MAP / getCounterMultiplier
```

## 下一步建议

1. 先做一轮实机回归，重点看 UI 技能按钮、NPC 自动施法、VV 建仓、Psyche 读局、Reality / Insulation。
2. 再校准 8 名角色专属技能数值和触发时机。
3. 最后再接 Combat / Asset 正式收益，避免当前技能结算再次被旧成长逻辑污染。
