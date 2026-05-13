# Asset 系统工程规划

> 主需求来源：`st/docs/Asset系统需求.md`
>
> 当前目标：把 Asset 从“节点资源/角色升级点”收口为“团队层面的肉鸽卡组构筑系统”，并规划脚本、MVU、状态栏、战斗引擎四方面的闭环实现。

## 1. 核心结论

AssetDeck 是一个周目级团队卡组系统，不是角色升级树，也不是德州牌桌内的临时资产账本。

必须严格区分两个概念：

```text
AssetDeck
  周目 / 团队长期卡组
  存在于 MVU
  影响技能、Mana、被动、小游戏、德州结算

AssetLedger
  德州牌桌内临时资源账本
  已存在于 games/texasholdem/texas-holdem/core/runtime/asset-ledger.js
  记录 VV 头寸、COTA 牌列、Eulalia 合同、临时角色标记
```

后续实现不能把 AssetDeck 塞进 `AssetLedger`，也不能让 `AssetLedger` 变成长期成长系统。前者是玩家构筑，后者是战斗运行时状态。

## 2. 目标闭环

Asset 系统最终需要形成以下闭环：

```text
ACT Asset 节点 / 外部结算
  -> 获得 Asset 点数 (`world.act.reserve.asset`)
  -> 打开 Asset 结算面板
  -> 扩容或抽卡
  -> 卡牌进入 active deck
  -> MVU 持久化
  -> Dashboard 状态栏展示
  -> 德州 / 小游戏 / 后续玩法读取 modifiers
  -> 技能、Mana、force、被动触发产生实际效果
```

核心原则：

- MVU 是真相源。
- Dashboard 只提交操作意图，不自行决定随机结果和合法性。
- 战斗引擎只读取编译后的 modifier，不直接理解抽卡、槽位、卡池。
- ACT 只负责产生 Asset 结算机会，不在内部伪造成长结果。
- `hero.assets` 是剧情资产 / 资产负债表字段，和 AssetDeck 点数不是同一套资源。
- Asset 点数对玩家展示为 `ASSET / 契点`，代码真相源是 `world.act.reserve.asset`。
- ACT 可投入的 `asset` 相位 token 对玩家展示为 `契令 / TOKEN`，只表示本节点可排程的抽取机会，不等于 Deck Points 余额。

## 3. 推荐 MVU 结构

建议新增顶层字段：

```js
world.assetDeck = {
  version: 1,
  general_slots_unlocked: 4,
  void_slots_unlocked: 2,
  active_general_cards: [],
  active_void_cards: [],
  owned_skill_levels: {},
  pending_offer: null,
  pending_offer_queue: [],
  pending_replace: null,
  history: []
}
```

不建议放进 `world.act` 的原因：

- AssetDeck 是周目级长期构筑，不属于单个 ACT 节点执行状态。
- 德州和小游戏也需要读取它。
- 后续切章时也应保留卡组。

`world.act` 仍然保留：

```js
world.act.pendingResolutions[]
world.act.resolutionHistory[]
world.act.reserve.asset / limited.asset / resourceSpent.asset
```

这些字段只描述 ACT 节点中获得或投入的 Asset 点数，不承载卡组本体。

## 4. AssetDeck 数据模型

### 4.1 卡牌实例

```js
{
  instanceId: 'asset_card_xxx',
  cardId: 'texas_skill_minor_wish',
  rarity: 'bronze' | 'silver' | 'gold' | 'rainbow',
  level: 1,
  slotType: 'general' | 'void' | 'consumable',
  acquiredAt: {
    nodeId,
    nodeIndex,
    source: 'draw' | 'upgrade' | 'debug' | 'reward'
  }
}
```

### 4.2 卡牌定义

```js
{
  id: 'texas_skill_minor_wish',
  name: '小愿望',
  family: 'skill',
  rarityTable: {
    bronze: { level: 1 },
    silver: { level: 2 },
    gold: { level: 3 },
    rainbow: { level: 4 }
  },
  gameTags: ['texas'],
  targetTags: ['moirai', 'mana_user'],
  slotTags: ['general'],
  uniqueKey: 'skill:minor_wish',
  effects: [
    { type: 'grant_skill_level', skillKey: 'minor_wish', level: '$level' }
  ]
}
```

### 4.3 卡池 offer

```js
{
  id: 'asset_offer_xxx',
  pool: 'low' | 'mid' | 'high',
  cost: 1,
  refreshCost: 0,
  refreshUsed: 0,
  choices: [cardDraft, cardDraft, cardDraft],
  createdAt: { nodeId, nodeIndex },
  status: 'open' | 'resolved' | 'cancelled'
}
```

### 4.4 替换状态

```js
{
  offerId,
  incomingCard,
  allowedSlotTypes: ['general', 'void'],
  replaceableInstanceIds: [],
  reason: 'full_general' | 'full_void' | 'player_choice'
}
```

## 5. 卡槽规则

初始槽位：

```text
通用槽：4
Void 专属槽：2
```

最终槽位：

```text
通用槽：8
Void 专属槽：2
```

扩容价格：

```text
第 5 槽：1 Asset
第 6 槽：1 Asset
第 7 槽：2 Asset
第 8 槽：2 Asset
```

规则：

- 通用槽可放所有非消耗卡。
- Void 槽只能放 Void 系卡和 KAZU 专属卡。
- 无仓库。
- 抽到并选择的卡必须立刻进入激活区。
- 满槽时必须替换旧卡，旧卡销毁。
- 消耗升级卡不占槽，购买后立刻结算并销毁。

## 6. 卡牌规则

### 6.1 数值常驻卡

例如：

```text
Mana Max +4 / +8 / +12
Mana 消耗 +3，技能效果 +4
Mana 消耗 -2，技能效果 -2
```

这些卡可以叠加。后续是否设叠加上限需要再确认。

### 6.2 技能卡

技能卡不能叠加，每个技能只存在一个有效等级。

自动处理：

- 没有该技能：安装对应等级卡。
- 已有低级：获得高级时直接替换为高级。
- 已有同级：合成下一级。
- 已有更高级：低级卡不应进入刷新池。
- 已满级：该技能卡不再刷新。

涉及技能：

```text
Moirai: minor_wish / grand_wish / divine_order
Chaos: hex / havoc / catastrophe
Psyche: analysis / premonition / refraction
Void: insulation / reality
```

### 6.3 被动卡

德州被动卡需要进入战斗 adapter：

```text
每街概率获得 fortune
每街概率投放 curse
每街概率获得 psyche shield
体系攻击百分比提升
```

这些卡不应直接在 Dashboard 里触发，而应由德州引擎在街开始 / 发牌前统一检查。

### 6.4 神卡 / 彩卡

彩卡建议默认唯一，避免叠加爆炸。

初版先做：

```text
全局神卡：Mana 消耗 -10%，向上取整
德州神卡：所有技能卡组默认升一级，不突破 4
小游戏神卡：技能 Mana 消耗 -33%，技能效果 +33%
```

## 7. Modifier 编译层

AssetDeck 不应被 `SkillSystem` / `CombatFormula` 直接解析。应新增编译层：

```text
AssetDeckRuntime / AssetModifierCompiler
```

输入：

```js
world.assetDeck
gameContext
roster / players
```

输出：

```js
{
  manaMaxBonusByOwner: {},
  skillLevelBonusBySkill: {},
  skillCostFlat: [],
  skillCostPct: [],
  forcePowerFlat: [],
  forcePowerPct: [],
  passiveStreetRolls: [],
  tags: []
}
```

好处：

- 卡牌规则只在一个地方编译。
- 战斗系统只消费统一 modifier。
- 后续小游戏、金融市场、麻将可以各自读取同一套编译产物。

## 8. 四方面联动规划

### 8.1 脚本 / 规则层

建议新增：

```text
apps/st-bridge/packs/acezero-main/asset/data.js
apps/st-bridge/packs/acezero-main/asset/runtime.js
apps/st-bridge/packs/acezero-main/asset/index.js
```

职责：

- 卡牌目录。
- 卡池概率。
- 抽卡随机。
- offer 生成。
- 刷新规则。
- 选择卡牌。
- 自动升级 / 合成。
- 槽位合法性。
- 替换旧卡。
- modifier 编译的通用部分。

### 8.2 MVU / Host 层

涉及：

```text
apps/st-bridge/packs/acezero-main/schema/acezero-schema.js
apps/st-bridge/packs/acezero-main/tavern/plugin.js
apps/st-bridge/packs/acezero-main/dashboard/loader.js
apps/dashboard/shell/bridge.js
```

需要新增：

- `WorldAssetDeckSchema`
- `makeDefaultAssetDeckState()`
- `normalizeAssetDeckState()`
- `applyAssetDeckCommand(command)`
- Host commit 支持 AssetDeck 更新。

建议命令协议：

```js
{
  type: 'ACE0_ASSET_DECK_COMMAND',
  command: {
    kind: 'grant_asset' | 'unlock_slot' | 'open_offer' | 'refresh_offer' | 'choose_card' | 'replace_card' | 'debug_reset',
    payload: {}
  }
}
```

### 8.3 Dashboard 状态栏 / 面板

涉及：

```text
apps/dashboard/pages/overview/index.js
apps/dashboard/pages/overview/style.css
apps/st-bridge/packs/acezero-main/act/frontend-snapshot.js
st/docs/Asset前端定稿.html
```

需要显示：

- Asset 点数。
- 通用槽 4/8。
- Void 槽 2/2。
- 激活卡组。
- 卡牌 rarity / target / game tag。
- 抽卡候选。
- 刷新按钮。
- 满槽替换流程。
- Debug：加 Asset、开低/中/高 offer、清卡组。

UI 规则：

- 前端不自行抽随机。
- 前端不绕过槽位合法性。
- 所有操作都通过 command -> Host -> MVU -> snapshot 回显。

#### 8.3.1 当前前端定稿对齐结论

`st/docs/Asset前端定稿.html` 的整体方向是正确的，并且应作为现有 plan 页面底部 `planner-drawer` 的 Asset 子页面实现，而不是独立全屏页。

定稿中已经对齐的部分：

```text
planner-drawer
PHASE PLANNER / COMBAT / REST / ASSET / VISION 五页导航
ASSET 显示
ASSET 页卡组装配
通用槽 4 / 8
Void 专属槽 2 / 2
EXPAND (1 ASSET)
CONTRACT EXTRACT 三选一卡牌作为 ASSET 页上的覆盖层
右侧卡牌详情读取面板
```

这和需求稿中的以下规则吻合：

```text
初始 4 通用槽 + 2 Void 槽
最终 8 通用槽 + 2 Void 槽
无仓库
抽卡展示 3 张候选
满槽替换旧卡
Void 卡有独立槽位区域
```

因此前端落点建议为：

```text
保留原 planner drawer
在 drawer 内加入五页导航状态
PHASE PLANNER：原节点相位规划
ASSET：激活卡组 / 扩容 / 替换 / 详情
CONTRACT EXTRACT：仅在 `pending_offer` 存在时覆盖在 ASSET 页上，不单独占用 tab / layout
```

#### 8.3.2 前端定稿需要调整的点

当前 HTML 仍有若干术语和交互需要按 AssetDeck 需求修正。

必须调整：

- `TIER 1 / TIER 2 / TIER 3` 改为 `BRONZE / SILVER / GOLD / RAINBOW` 或 `铜 / 银 / 金 / 彩`，技能等级单独显示 `Lv.1-4`。避免和已经删除的旧 `skill.tier` 体系混淆。
- `Generating Tier 2 Pool...` 改为 `LOW / MID / HIGH POOL`，并显示消耗 `1 / 2 / 3 Asset`。
- `REROLL POOL` 必须显示刷新成本和剩余次数：低 / 中池免费刷新 1 次，高池消耗 1 Asset 刷新 1 次。
- `DESTROY & UNEQUIP` 不应作为常态卸下按钮。需求没有仓库，不能自由卸下保存。建议仅在替换流程中显示 `REPLACE & DESTROY OLD CARD`。
- Void 卡选择后需要允许玩家选择放入通用槽或 Void 槽；非 Void 卡不能显示 Void 槽替换目标。
- 卡组槽位状态需要区分 `empty / locked / filled / replaceable / invalid`，替换流程中高亮可替换槽。
- 抽卡选择后如果槽位满，不应立刻写入 active deck，而是进入 `pending_replace`。

建议调整：

- `CONTRACT EXTRACT` 可保留作为风格名，但内部字段使用 `Asset Pool`，避免玩家误解成剧情合同系统。
- 右侧详情面板增加 `targetTags / gameTags / slotTags` 的短标签。
- `ASSET : 3` 绑定 `world.act.reserve.asset`，不要读取剧情 funds/assets，也不要读取 `hero.assets`。
- `CAPACITY LIMIT 4 / 8` 绑定 `general_slots_unlocked / 8`。
- Void 区标题保留 `VOID ISOLATION`，但详情里明确 `VOID SLOT ONLY: Void / KAZU`。

#### 8.3.3 前端状态映射

HTML 定稿中的静态字段后续应映射为：

```js
ASSET
  -> world.act.reserve.asset

CAPACITY LIMIT 4 / 8
  -> world.assetDeck.general_slots_unlocked / 8

ASSET DECK 通用槽
  -> world.assetDeck.active_general_cards

VOID ISOLATION
  -> world.assetDeck.active_void_cards

CONTRACT EXTRACT overlay 三张卡
  -> world.assetDeck.pending_offer.choices

REROLL POOL
  -> command: refresh_offer

EXPAND
  -> command: unlock_slot

选择抽卡候选
  -> command: choose_card

替换旧卡
  -> command: replace_card
```

#### 8.3.4 plan drawer 集成原则

因为原本就是 plan 页面上的 drawer，所以不要新增一套并行抽屉。

正确集成方式：

```text
复用 planner-drawer 容器
扩展 drawer header tab
把原 phase planner 包进 view-planner
新增 view-deck
pending_offer 存在时，在 view-deck 上显示 CONTRACT EXTRACT overlay
drawer 高度沿用定稿的固定高度 / 内部滚动
```

这样可以避免：

```text
规划面板和 Asset 面板互相遮挡
移动端 / 小窗口布局重复
两个 drawer 各自管理 open 状态
Host commit 状态显示重复
```

### 8.4 德州战斗引擎

涉及：

```text
games/texasholdem/texas-holdem/core/skill-system.js
games/texasholdem/texas-holdem/rpg/combat-formula.js
games/texasholdem/texas-holdem/ui/skill-ui.js
games/texasholdem/texas-holdem/core/runtime/force-runtime.js
games/texasholdem/texas-holdem/texas-holdem.js
```

接入点：

- Mana Max：注册 mana pool 时应用。
- Mana cost：`_getSkillActualManaCost()` 前后应用固定减费和百分比减费。
- 技能等级：注册技能时读取 `owned_skill_levels` 和全局 +1 神卡。
- Force power：`_skillToForce()` 或 `CombatFormula.enhanceForces()` 中应用。
- 被动街触发：街开始 / 发牌前统一 roll，并加入 `pendingForces`。
- 状态展示：SkillUI 状态栏显示 AssetDeck 产生的 modifiers。

Mana cost 规则必须按需求稿：

```js
remaining = baseCost - fixedReduction

if (remaining <= 0) {
  finalCost = 0
} else {
  finalCost = max(1, ceil(remaining * (1 - min(percentReduction, 0.66))))
}
```

## 9. 阶段拆分

### Phase 1：Schema 与纯规则 runtime

状态：已完成第一版闭环。

目标：

- 建立 `world.assetDeck` 默认结构。
- 新增 normalize。
- 新增卡牌目录。
- 新增纯函数 runtime。
- 不接 UI，不接德州。

验收：

- 默认 MVU 自动补齐 `world.assetDeck`。
- 非法槽位 / 非法卡牌会被 normalize 压回安全状态。
- smoke 覆盖默认值、扩容、抽卡、替换、Void 槽限制。

已落地：

```text
apps/st-bridge/packs/acezero-main/asset/data.js
apps/st-bridge/packs/acezero-main/asset/runtime.js
apps/st-bridge/packs/acezero-main/schema/acezero-schema.js
apps/st-bridge/packs/acezero-main/scripts/asset-runtime-smoke.js
apps/st-bridge/packs/acezero-main/scripts/schema-smoke.js
apps/st-bridge/manifest.json
```

当前边界：

- `world.assetDeck` 已作为长期真相源进入 MVU schema。
- runtime 只处理纯规则 command，不读写 DOM，不接德州战斗，不接 ACT 节点收益。
- 卡牌目录先保留最小测试集，用于钉住 rarity / kind / slotTags / pool / modifiers 结构。
- `open_offer / refresh_offer / choose_card / replace_card / unlock_slot / grant_asset / debug_reset` 已可纯函数运行。
- 非法卡、重复 instance、超容量卡、非 Void 卡进入 Void 槽都会被 normalize 清理。
- 抽卡池、技能合成、正式奖励入口仍放在 Phase 2 继续完善。

验证：

```bash
node --check apps/st-bridge/packs/acezero-main/asset/data.js
node --check apps/st-bridge/packs/acezero-main/asset/runtime.js
node --check apps/st-bridge/packs/acezero-main/schema/acezero-schema.js
node apps/st-bridge/packs/acezero-main/scripts/asset-runtime-smoke.js
node apps/st-bridge/packs/acezero-main/scripts/schema-smoke.js
```

### Phase 2：抽卡 / 扩容 / 替换闭环

状态：已完成第一版闭环。

目标：

- 实现低 / 中 / 高池。
- 实现刷新。
- 实现三选一。
- 实现技能卡自动升级 / 合成 / 过滤。
- 实现满槽替换。

验收：

- 低级池成本 1，中级池成本 2，高级池成本 3。
- 高级池刷新消耗 1 Asset。
- 通用槽满时进入 `pending_replace`。
- Void 卡可选择通用槽或 Void 槽。
- 非 Void 卡不能进入 Void 槽。

已落地：

- 卡池成本：低池 1 Asset，中池 2 Asset，高池 3 Asset。
- 稀有度权重：低池 `65/25/10/0`，中池 `35/35/25/5`，高池 `0/35/40/25`。
- 每次 offer 固定最多 3 张候选；候选不足时安全降级，不伪造卡。
- 刷新限制：低 / 中池免费刷新 1 次，高池消耗 1 Asset 刷新 1 次，三池都最多刷新 1 次。
- 技能卡唯一：同技能不会叠加成多张。
- 技能卡升级：已有低级卡时，选择更高级卡会原槽升级 / 替换。
- 技能卡合成：已有同级卡时，选择同级卡会原槽合成到下一级。
- 技能卡过滤：已有更高级或满级时，低级 / 满级重复技能不会进入 offer。
- 满槽选择新卡进入 `pending_replace`，替换后旧卡销毁，不进入仓库。
- Void 卡可进通用槽或 Void 槽；非 Void 卡会被 normalize 拦截。

当前边界：

- 技能卡已在 AssetDeck 层完成“唯一 / 升级 / 合成 / 过滤”，但还没有编译进德州 `SkillSystem`，这仍属于后续战斗接入阶段。
- 通用消耗升级卡的独立卡型暂不展开；Phase 2 先用技能卡本体完成自动升级闭环。
- 卡牌目录仍是测试规模目录，后续可按正式角色 / 玩法补全内容池。

验证：

```bash
node --check apps/st-bridge/packs/acezero-main/asset/data.js
node --check apps/st-bridge/packs/acezero-main/asset/runtime.js
node --check apps/st-bridge/packs/acezero-main/schema/acezero-schema.js
node apps/st-bridge/packs/acezero-main/scripts/asset-runtime-smoke.js
node apps/st-bridge/packs/acezero-main/scripts/schema-smoke.js
node apps/st-bridge/packs/acezero-main/scripts/encounter-context-smoke.js
node apps/st-bridge/packs/acezero-main/scripts/encounter-host-smoke.js
```

### Phase 3：Dashboard UI

状态：已完成第一版闭环，并完成本轮收口回归。

目标：

- Overview 状态栏显示 AssetDeck。
- 添加 Asset 面板。
- 添加 Debug 操作。
- Host / Debug 模式都能稳定提交。

验收：

- UI 操作后刷新不丢状态。
- Debug 模式和 Host 模式行为一致。
- 满槽替换流程清晰。

已落地：

- Overview 顶部 `ASSET` 读取 `world.act.reserve.asset`，不再读取 `world.assetDeck` 或 `hero.assets` 作为点数。
- 复用原 `planner-drawer`，并纳入 `PHASE PLANNER / COMBAT / REST / ASSET / VISION` 五页导航，不新增第二个抽屉。
- `CONTRACT EXTRACT` 不再是独立页；当 `pending_offer` 存在时，以 overlay 方式覆盖在 `ASSET` 页上，不挤压卡槽布局。
- `ASSET` 页显示容量、Asset 点数、通用槽 `x/8`、Void 槽 `x/2`、卡槽滚动区和右侧详情读取器。
- `CONTRACT EXTRACT` overlay 展示当前 offer 的候选卡，玩家选择后 `pending_offer` 被 runtime 消费，overlay 自动消失。
- Void 卡候选可选择 `GENERAL` 或 `VOID` 放置。
- 满槽后显示 `PENDING REPLACE`，高亮可替换槽，点击槽内卡执行替换并销毁旧卡。
- UI 不自行实现抽卡 / 升级 / 合成规则，只调用 `ACE0Modules.assetDeck.applyAssetDeckCommand()`，再通过 Dashboard commit 回写 `world.assetDeck`。

本轮收口回归：

- Planner 页状态已由 `appState.plannerPage` 管理，`deck / extract` 旧状态会兼容映射到 `asset`。
- `world.assetDeck` 会被序列化为 `data-asset-hash`，AssetDeck 状态变化后会触发 drawer 重建，避免刷新后显示旧 offer / 旧卡槽。
- `CONTRACT EXTRACT` overlay 采用 `st/docs/Asset前端定稿.html` 的切角透明卡样式，`GENERAL / VOID` 是卡片下方独立操作行。
- `ASSET` 页改为左侧容量信息、中间卡槽滚动区、右侧详情读取器三段结构；中间区域独立滚动。

当前边界：

- 这阶段只接 Overview / planner drawer，不接德州战斗。
- Asset 面板已按 `st/docs/Asset前端定稿.html` 对齐第一轮结构和主视觉；后续仍可继续做 hover 详情联动、替换二次确认、刷新成本显示等体验增强。

验证：

```bash
node --check apps/dashboard/pages/overview/index.js
node --check apps/st-bridge/packs/acezero-main/asset/data.js
node --check apps/st-bridge/packs/acezero-main/asset/runtime.js
node --check apps/st-bridge/packs/acezero-main/schema/acezero-schema.js
node apps/st-bridge/packs/acezero-main/scripts/asset-runtime-smoke.js
node apps/st-bridge/packs/acezero-main/scripts/schema-smoke.js
node apps/st-bridge/packs/acezero-main/scripts/encounter-context-smoke.js
node apps/st-bridge/packs/acezero-main/scripts/encounter-host-smoke.js
```

### Phase 3.5：Host command 正式化

状态：已完成第一版闭环。

目标：

- AssetDeck 操作不再依赖前端先计算完整 `world.assetDeck` 后再 commit。
- Host 侧提供正式 `ACE0_ASSET_DECK_COMMAND` 入口。
- Host 读取 MVU 真相源、调用 `ACE0Modules.assetDeck.applyAssetDeckCommand()`、写回 `world.assetDeck`，再把结果 ACK 给 Dashboard。
- Debug 模式保留本地 runtime fallback，方便单页开发。

已落地：

- `apps/dashboard/shell/bridge.js` 新增 `ACE0_DASHBOARD_ASSET_DECK_COMMAND / ACE0_DASHBOARD_ASSET_DECK_COMMAND_RESULT` 转发。
- `apps/st-bridge/packs/acezero-main/dashboard/loader.js` 新增 `ACE0DashboardApplyAssetDeckCommand` host bridge。
- Host loader 收到 command 后会读取当前 MVU `stat_data.world.assetDeck`，执行 AssetDeck runtime，并只写回 `world.assetDeck`。
- `apps/dashboard/pages/overview/index.js` 的 Asset 操作在 Host 模式下优先走正式 command；Debug 模式继续走本地 runtime + commit。
- command ACK 返回 `assetDeck` 后，Overview 会先即时更新本地 payload，再等待 Host refresh 覆盖，避免点击后短暂显示旧状态。

当前边界：

- 这一步只把命令入口正式化，不接德州战斗。
- command 仍然是 Dashboard/Host 桥内消息，不是 AI 文本协议。
- 后续如果需要审计日志，可在 Host ACK 中扩展 `history` / `source` / `nodeId`。

验证：

```bash
node --check apps/dashboard/pages/overview/index.js
node --check apps/dashboard/shell/bridge.js
node --check apps/dashboard/shell/shell.js
node --check apps/st-bridge/packs/acezero-main/dashboard/loader.js
node apps/st-bridge/packs/acezero-main/scripts/asset-runtime-smoke.js
node apps/st-bridge/packs/acezero-main/scripts/schema-smoke.js
node apps/st-bridge/packs/acezero-main/scripts/encounter-context-smoke.js
node apps/st-bridge/packs/acezero-main/scripts/encounter-host-smoke.js
```

### Phase 4：德州基础 adapter

状态：第一版已完成。

目标：

- AssetDeck 编译为德州 modifiers。
- 先接最稳定的三类：
  - Mana Max
  - Mana cost
  - force power

核心设计：

- 新增通用编译器，不让德州直接解析 `world.assetDeck.active_*_cards`。
- AssetDeck 卡牌仍只声明 JSON modifiers；德州 adapter 只消费编译产物。
- `game-config.json` / Host 注入配置只需要携带 `world.assetDeck` 或已编译的 `assetModifiers`，不需要每个角色手写专属资产逻辑。

推荐新增文件：

```text
games/texasholdem/texas-holdem/core/runtime/asset-deck-adapter.js
```

输入：

```js
{
  assetDeck,
  players,
  hero,
  world,
  gameId: 'texas-holdem'
}
```

输出：

```js
{
  version: 1,
  source: 'assetDeck',
  manaMaxBonusByOwner: {},
  skillCost: {
    flatByOwner: {},
    pctByOwner: {},
    flatBySkill: {},
    pctBySkill: {}
  },
  forcePower: {
    flatByOwner: {},
    pctByOwner: {},
    flatBySkill: {},
    pctBySkill: {},
    flatBySystem: {},
    pctBySystem: {}
  },
  skillLevelBySkill: {},
  tags: [],
  debug: {
    cards: [],
    applied: []
  }
}
```

JSON modifier 建议统一为：

```js
{ type: 'mana_max_flat', value: 8, scope: 'team' }
{ type: 'skill_cost_flat', value: -2, scope: 'team' }
{ type: 'skill_cost_pct', value: -0.1, scope: 'team' }
{ type: 'force_power_flat', value: 4, system: 'moirai', scope: 'team' }
{ type: 'force_power_pct', value: 0.08, scope: 'team' }
{ type: 'skill_level', key: 'minor_wish', value: 2 }
```

兼容当前目录已有 modifier：

```js
skill_level
all_force_power_bonus
```

第一版实际接入点：

1. `texas-holdem.js`
   - 从外部配置读取 `world.assetDeck` 或 `assetDeck`。
   - 初始化时调用 `AssetDeckAdapter.compile(config)`。
   - 把结果挂到 `assetModifiers`。
   - 通过 `AssetDeckAdapter.applySkillLevelsToConfig()` 把技能卡注入到原有 JSON 技能注册路径。

2. `core/skill-system.js`
   - `registerFromConfig()` 接收已编译 `assetModifiers`。
   - `_registerManaPool()` 应用 Mana Max。
   - `_getSkillActualManaCost()` 统一调用 adapter cost resolver。

3. `rpg/combat-formula.js`
   - `enhanceForces()` 在属性/特质增强后、MoZ resolution 前应用 `forcePower`。
   - 每个 force 写入 `_assetBonus`，方便日志解释。

4. `ui/skill-ui.js`
   - 卡片显示修正后的 `manaCost`。
   - 可选显示 `ASSET +x` 或 `ASSET -x MP` 小标签。

5. `core/monte-of-zero.js`
   - 不直接读取 AssetDeck。
   - 只消费已经增强后的 forces。

成本结算顺序必须固定：

```js
remaining = baseCost + flatDelta

if (remaining <= 0) {
  finalCost = 0
} else {
  finalCost = max(1, ceil(remaining * (1 + pctDeltaClamped)))
}
```

其中：

- 减费 pct 下限按需求稿限制到 `-0.66`。
- 加费 pct 初版不限制，但必须进入 debug 日志。
- `baseCost / flatDelta / pctDelta / finalCost` 必须可追踪。

配置注入方式：

```json
{
  "gameMode": "texas-holdem",
  "world": {
    "assetDeck": {
      "active_general_cards": [],
      "active_void_cards": []
    }
  }
}
```

或兼容扁平：

```json
{
  "assetDeck": {
    "active_general_cards": [],
    "active_void_cards": []
  }
}
```

不推荐直接配置：

```json
{
  "skillCostPct": -0.1
}
```

原因是这样会绕开 AssetDeck 真相源和卡牌目录，后续难以解释“这个 modifier 从哪张卡来”。

第一版只做：

- `mana_max_flat`
- `skill_cost_flat`
- `skill_cost_pct`
- `force_power_flat`
- `force_power_pct`
- 兼容 `all_force_power_bonus`
- 兼容 `skill_level`，因为当前 Asset 卡池的德州卡主要以通用技能卡存在。

技能卡注入规则：

- 优先升级角色原本已经持有的技能槽，避免把已有技能错误搬到另一名前/后排角色上。
- 如果原技能不存在，再根据 `targetTags` 匹配 hero 的 `vanguard.name` / `rearguard.name`。
- `KAZU` / `void` 默认进 vanguard，`RINO` / 非 Void 默认进 rearguard。
- 数组格式和对象格式的 `vanguardSkills` / `rearguardSkills` 都会被安全归一化。

明确不做：

- 每街被动 roll。
- 彩卡神卡全局技能 +1。
- ACT Asset 节点正式奖励。

这些都放到 Phase 5 / Phase 6，避免 Phase 4 过载。

验收：

- 卡组里的 Mana Max 会影响 mana pool。
- 减费 / 加费严格按需求稿顺序结算。
- `minor_wish / hex / analysis` 等 force power 受卡组修正影响。
- UI 显示修正后的成本和效果。

验证：

```bash
node --check games/texasholdem/texas-holdem/core/runtime/asset-deck-adapter.js
node --check games/texasholdem/texas-holdem/core/skill-system.js
node --check games/texasholdem/texas-holdem/ui/skill-ui.js
node --check games/texasholdem/texas-holdem/rpg/combat-formula.js
node --check games/texasholdem/texas-holdem/texas-holdem.js
node games/texasholdem/texas-holdem/scripts/asset-adapter-smoke.mjs
node apps/st-bridge/packs/acezero-main/scripts/asset-runtime-smoke.js
node games/texasholdem/texas-holdem/scripts/asset-real-regression.mjs
```

实机回归结果：

- Asset 技能卡把 `minor_wish` 从 LV1 升到 LV2。
- `skill_cost_flat: -3` 后，卡片显示 `7 MP`，点击后 Mana 从 `100` 到 `93`。
- `mana_max_flat: +10` 后，Mana Max 为 `110`。
- 彩虹契约 `all_force_power_bonus: 0.08` 进入 CombatFormula，`_assetBonus.pctDelta = 0.08`，最终 force power 从 `29.2` 到 `31.5`。
- 日志能看到 AssetDeck modifier 来源，至少包含 `cardId / modifier type / before / after`。
- 没有 `world.assetDeck` 时，德州保持当前行为完全不变。

### Phase 5：德州 Asset 体验闭环

状态：待开始。

Phase 4 已经证明 adapter 能把 AssetDeck 接进德州基础链路。下一阶段不建议立刻做复杂战斗收益，而是先把“玩家看得懂、调试能追踪、卡池能扩展”闭环。

#### Phase 5.1：局内可解释性与 UI 回显

状态：第一版已完成。

目标：

- 技能卡上能看出 Asset 来源，例如 `ASSET LV+1` / `ASSET -3 MP`。
- Mana 面板或调试信息能看出 `base max + asset bonus`。
- MoZ / Combat 日志能明确展示 `base power / trait power / asset pct / final power`。
- `_assetBonus` 不只存在于对象里，至少在 Debug / console / 回归日志中可读。

验收：

- 玩家能在技能卡上看到 `7 MP`，并能知道为什么不是原始费用。
- 控制台或 Debug 输出能追踪到具体 `cardId`。
- 没有 AssetDeck 时 UI 不出现空的 Asset 标记。

已完成：

- 技能卡显示 Asset 小标签，例如 `ASSET LV2`、`-3 MP`。
- Mana 文本显示 Asset 上限加成，例如 `MP 93/110 · ASSET +10`。
- `SkillSystem.getState()` 暴露 `assetCost / assetCards`，供 UI 和 Debug 消费。
- `CombatFormula` 输出的 force 带 `_assetBonus.sources`。
- MoZ `COMBAT_ENHANCE / DESTINY_SELECT` 日志能看到 Asset 增幅来源。

回归：

```bash
node games/texasholdem/texas-holdem/scripts/asset-real-regression.mjs
```

实机结果：

```text
小吉卡片：LV 2 / 7 MP / ASSET LV2 / -3 MP
Mana：baseMax 100 -> max 110，来源 asset_mana_battery_regression
Force：彩虹契约 pctDelta 0.08，来源 asset_rainbow_contract_regression
```

#### Phase 5.2：德州卡池扩展与分层

状态：进行中，第一批正式德州卡池已落地。

目标：

- 补齐第一批正式德州卡池，而不是只保留测试卡。
- 将卡牌分成三类：
  - 技能卡：`skill_level`
  - 数值卡：`mana_max_flat / skill_cost_* / force_power_*`
  - 全局卡：`all_force_power_bonus` 等
- 保持卡牌只声明 JSON modifier，不写战斗 if。

建议第一批卡：

```text
低池：小吉 I、诅咒 I、解析 I、绝缘 I、小幅减费、小幅 Mana 上限
中池：小吉 II、诅咒 II、解析 II、绝缘 II、体系 force +pct
高池：折射协议、Reality II、彩虹契约、强力 Mana / cost / force 卡
```

当前已实现：

- 技能卡：`minor_wish I-IV`、`hex I-III`、`analysis I-III`、`premonition II`、`refraction`、`insulation I-III`、`reality II`。
- 数值卡：`mana_max_flat`、`skill_cost_flat`、`skill_cost_pct`、三体系 `force_power_pct`、全局 `force_power_pct`。
- 全局卡：`rainbow_contract` 继续走 `all_force_power_bonus`，保持 adapter 编译，不写战斗分支。
- Runtime smoke 新增德州卡池覆盖检查，要求 low / mid / high 都有足够的第一批卡，且覆盖 `skill_level / mana / cost / force` modifier。

验收：

- 已满级技能不再出现在卡池。
- 同技能低等级卡不会降级现有技能。
- 数值卡可叠加，但日志必须显示每张来源。
- 德州卡只在 `gameTags: ['texas-holdem']` 或 `any` 生效。

#### Phase 5.3：技能授予边界

状态：已完成第一版闭环。

目标：

- 明确 Asset 技能卡究竟是“升级已有技能”，还是“授予新技能”。
- 第一版建议允许授予，但只授予到 hero 队伍，不给 NPC 自动授予。
- 授予规则必须仍走 `AssetDeckAdapter.applySkillLevelsToConfig()`，不能在 `SkillSystem` 里直接读卡。

推荐规则：

```text
如果 hero 已有该技能：升级原槽位。
如果 targetTags 命中 vanguard/rearguard：授予对应槽位。
如果 targetTags 不明确：非 Void 默认授予 vanguard，Void 默认授予 KAZU/vanguard。
如果技能 key 不存在于 SkillSystem catalog：忽略并写 debug ignored。
```

当前实现：

- `AssetDeckAdapter.applySkillLevelsToConfig()` 负责技能授予/升级，仍然只改写 hero 配置。
- 已有技能优先原槽位升级；缺失技能按 `targetTags` 落到 vanguard / rearguard；不明确时回落 vanguard，Void / KAZU 仍回落 vanguard。
- adapter 会通过 `SkillSystem.lookupSkill()` 校验技能 key；未知技能写入 `assetModifiers.debug.ignored`，不会进入 hero 技能配置，也不会被 `SkillSystem` 注册。
- 实机回归已改为“hero 原本没有 `minor_wish`，由 Asset 卡授予 `minor_wish LV2`”，用于覆盖 UI / 费用 / 点击 / pending force 全链路。

验收：

- Asset 卡能给没有 `minor_wish` 的 hero 授予 `minor_wish`。
- 不能把不存在的技能 key 注册成野技能。
- 授予后 UI、费用、点击、pending force 全链路一致。

#### Phase 5.4：轻量被动卡

状态：已完成第一版闭环。

目标：

- 只做低耦合、可解释的被动卡，不做复杂角色专属战斗结算。
- 被动卡也编译成 modifier 或事件 hook，不直接写进 MoZ。

第一版允许：

```text
street_start_mana_gain
first_skill_cost_flat
first_force_power_pct
once_per_hand_fortune_flat
```

当前实现：

- `AssetDeckAdapter.compile()` 会把四类被动卡编译进 `assetModifiers.passiveTriggers`。
- `street_start_mana_gain`：由 `SkillSystem.onNewHand()` / `onStreetStart()` 触发，执行回蓝并记录 `ASSET_PASSIVE_TRIGGERED`。
- `first_skill_cost_flat`：由 `SkillSystem.getSkillActualManaCost()` 消费 adapter 计算结果，首次成功激活后标记为已用。
- `first_force_power_pct`：由 `CombatFormula` 调用 `AssetDeckAdapter.enhanceForcePower()`，在 MoZ 前给本手第一个匹配 force 增幅，并写入 `_assetBonus.passiveTriggers`。
- `once_per_hand_fortune_flat`：由 `SkillSystem.onNewHand()` 触发，向 pending force 队列加入一条 Asset fortune。
- 第一批正式卡：`街头魔力`、`首发节流`、`首力聚焦`、`开局祝福`。

暂不做：

```text
复杂概率 roll
按牌型触发
按输赢触发
跨手牌复合债务
Combat/Asset 复杂收益重算
```

验收：

- 被动触发有 `cardId / trigger / value / ownerId` 日志。
- 每手/每街计数能重置。
- 不影响现有角色 runtime 的专属机制。

回归：

```bash
node games/texasholdem/texas-holdem/scripts/asset-adapter-smoke.mjs
node games/texasholdem/texas-holdem/scripts/asset-real-regression.mjs
```

实机结果：

```text
小吉：Asset 授予 LV2，首发费用 3 MP，卡面显示 ASSET LV2 -7 MP
开局祝福：pending force 中出现 asset_passive fortune P9
首力聚焦：首个 force 的 Asset pctDelta = 0.18（彩虹 0.08 + 首力 0.10）
页面问题：pageIssues []
```

#### Phase 5.5：神卡 / 彩卡最小闭环

状态：已完成第一版闭环。

目标：

- 只做一张神卡或彩卡的可控示例，避免同时铺开。
- 建议保留当前 `彩虹契约` 作为第一张 Rainbow：`all_force_power_bonus: 0.08`。
- “全技能 +1”可以规划，但不要立刻实现为默认彩卡，避免技能授予和升级边界还没稳定时膨胀。

当前实现：

- `彩虹契约` 标记为 `unique: true`，仍只提供 `all_force_power_bonus: 0.08`。
- AssetDeck runtime 会对唯一 / 彩虹 / 神卡做去重，已激活时不会再次装备同一张彩卡。
- 满槽替换时，如果目标旧卡是唯一 / 彩虹 / 神卡，第一次替换会返回 `requires_destroy_confirm`，保留 `pending_replace.confirm_destroy`。
- Dashboard 会在确认态显示 `CONFIRM DESTROY`，再次点击高亮槽才传入 `confirmDestroy: true` 完成销毁。
- 战斗侧仍只通过 adapter 编译产物读取增幅，MoZ 日志/force meta 可看到 `asset_rainbow_contract` 来源。

验收：

- 彩虹契约唯一。
- 可替换销毁，但需要二次确认。
- 日志能看出彩虹卡来源。

回归：

```bash
node apps/st-bridge/packs/acezero-main/scripts/asset-runtime-smoke.js
node games/texasholdem/texas-holdem/scripts/asset-real-regression.mjs
```

Phase 5 完成标准：

- 德州 Asset 卡从“能生效”进入“能解释、能扩展、能调试”。
- 不引入 Combat 正式收益和 ACT 节点奖励。
- 不让 `SkillSystem / CombatFormula / MoZ` 直接依赖 `world.assetDeck`。

### Phase 6：ACT Asset 节点正式结算

状态：已完成。

目标：

- ACT Asset 节点从“pending external resolution”推进到正式 AssetDeck 奖励入口。
- Asset 节点可以给 Asset 点数 (`world.act.reserve.asset`)，或打开 AssetDeck 结算面板。
- ACT 只发 command，不直接改 `world.assetDeck.active_*_cards`。
- 奖励来源进入 `resolutionHistory` / AssetDeck history，保证可回放。

验收：

- ACT 仍不直接伪造卡组结果。
- 节点收益进入 AssetDeck command。
- resolutionHistory 记录来源。
- Encounter 仍只读取已记录的 spent / funds / tags / flags，不被卡组系统污染。

建议拆分：

```text
6.1 Asset 节点 grant_asset：只给 `world.act.reserve.asset`，不开抽卡面板。已完成。
6.2 Asset 节点 open_offer：通关 / 高价值节点后自动打开抽卡 offer。已完成。
6.3 Dashboard ACT 结果页显示 Asset 奖励来源。已完成。
6.4 回归：ACT 节点 -> Host command -> MVU world.assetDeck -> Dashboard 刷新。已完成。
6.5 Host Loader 回归：直接覆盖 Dashboard Host commit 结算函数。已完成。
```

6.1 当前收口：

- ACT 消费 `asset` token 后不再生成 `pendingResolutions[type=asset]`。
- ACT 生成 `pendingAssetDeckCommands[]`，协议为 `ace0.assetDeckCommand.v1`，命令为 `grant_asset -> open_offer`。
- Host 在 Dashboard ACT commit 时消费 pending AssetDeck command，调用 `ACE0Modules.assetDeck.applyAssetDeckCommand()`，写回 `world.assetDeck`。
- 结算来源同时进入 `world.act.resolutionHistory` 和 `world.assetDeck.history`。
- 旧档中的 `pendingResolutions[type=asset]` 会在 ACT normalize 时迁移成 `pendingAssetDeckCommands[]`，避免旧外部结算残留。

6.2 / 6.3 当前收口：

- `asset I / II / III` 都会生成串行 command：先 `grant_asset +N`，再按 `N` 打开对应池子。
- 池子映射：`asset I -> low`、`asset II -> mid`、`asset III -> high`。
- 交互语义已从“获得点数后手动去 AssetDeck 页抽卡”改为“Plan 页投入 Asset，相位抵达后在 ASSET 页覆盖对应卡池”。
- `open_offer` 仍由 AssetDeck runtime 处理并消耗点数，ACT 不直接生成卡牌结果。
- `open_offer` 的 `requestId/source` 已进入 AssetDeck history，便于追踪来自哪个 ACT 节点 / 段位。
- 多个 Asset 相位在同一次推进中结算时，当前池进入 `pending_offer`，后续池进入 `pending_offer_queue[]`；玩家选择当前池后，队列里的下一个池自动提升，避免多段投入互相覆盖。
- Overview 在收到新的 `world.assetDeck.pending_offer` 后会自动切到 ASSET 页，并用 overlay 展示三张候选卡；选择后当前 offer 被消费，overlay 消失或推进到队列中的下一池。
- Dashboard ACT 面板新增 Asset 结算摘要：显示当前 Asset points、pending offer、pending command、最近 Asset 结算记录。
- Debug adapter 也会消费 `pendingAssetDeckCommands[]`，避免本地调试模式只看到 pending 而不写回 `world.assetDeck`。

6.4 回归收口：

- 新增 `apps/st-bridge/packs/acezero-main/scripts/act-asset-flow-smoke.js`。
- 覆盖 `asset III -> pending grant/open_offer -> AssetDeck high offer -> ACT resolutionHistory -> AssetDeck history`。
- 覆盖 `asset II -> pending grant/open_offer -> AssetDeck mid offer`，确保中档 Asset 投入也会在抵达相位后弹池子。
- 回归脚本只验证 command 链和状态迁移，不绕过 AssetDeck runtime 伪造卡牌结果。

6.5 Host Loader 回归收口：

- 新增 `apps/st-bridge/packs/acezero-main/scripts/act-asset-host-smoke.js`。
- `dashboard/loader.js` 增加测试钩子：仅当 `__ACE0_DASHBOARD_LOADER_TEST_HOOKS__ === true` 时暴露 `applyPendingActAssetDeckCommands()`。
- smoke 会加载真实 Host loader，并调用 loader 自己的结算函数，而不是复制一份模拟逻辑。
- 覆盖 `asset III` 在 Host commit 层被消费后，`world.assetDeck.pending_offer.pool === high`、`pendingAssetDeckCommands` 清空、ACT / AssetDeck 双 history 写入。
- 覆盖非 `pending` command 不会被 Host loader 重复消费，避免重复发奖。

Phase 6 回归命令：

```bash
node apps/st-bridge/packs/acezero-main/scripts/act-asset-command-smoke.js
node apps/st-bridge/packs/acezero-main/scripts/act-asset-flow-smoke.js
node apps/st-bridge/packs/acezero-main/scripts/act-asset-host-smoke.js
node apps/st-bridge/packs/acezero-main/scripts/asset-runtime-smoke.js
node games/texasholdem/texas-holdem/scripts/asset-real-regression.mjs
```

明确不做：

```text
Asset 卡直接改变 Encounter 条件
Asset 卡直接改变 ACT 地图生成
Combat 结果直接即时改卡组
```

### Phase 7：小游戏 adapter

状态：已完成第一版闭环。

目标：

- 小游戏读取全局 / 小游戏卡。
- 支持 Mana cost pct 和 force power pct。
- 复用 `AssetDeckAdapter` 的编译思路，但每个小游戏只消费自己的 adapter output。

验收：

- 小游戏卡只在小游戏生效。
- 德州卡不污染小游戏。
- 全局卡可跨玩法生效。

建议第一批小游戏范围：

```text
blackjack：cost / reward modifier
dice：risk / payout modifier
dragon-tiger：force_power_pct / odds modifier
mahjong：先只读 any，不做正式 adapter
```

已落地：

- `AssetDeckAdapter` 从德州专用编译器扩展为跨玩法编译器，保留德州现有 `skill_level / mana / passive / force` 输出，并新增 `miniGame.reward / payout / risk / odds` 输出。
- `gameTags` 现在支持 `texas-holdem / blackjack / dice / dragon-tiger / mahjong / sanma / any`，小游戏只消费自身 tag 与 `any`，不会读取德州专属卡。
- 三个已接小游戏都加载同一份 adapter，不建立小游戏独立 AssetDeck，不绕过 Host command 抽卡。
- 小游戏通用框架已统一到 `games/shared/`，`mini-game-base / mini-game-force / mini-game-logger / mini-game-base.css` 不再在 blackjack / dice / dragon-tiger 下各复制一份。
- `blackjack` 接入：技能费用百分比、黑杰克 reward modifier；底层仍保留 payout modifier 能力供后续扩展。
- `dice` 接入：风险采样倍率、豹子 payout modifier。
- `dragon-tiger` 接入：force power pct、和局 odds modifier。
- `mahjong` 当前只通过 adapter 规则允许 `any` 全局卡，未接正式 UI / engine adapter。

已落地文件：

```text
games/texasholdem/texas-holdem/core/runtime/asset-deck-adapter.js
games/blackjack/blackjack.html
games/blackjack/blackjack.js
games/shared/mini-game-base.js
games/shared/mini-game-force.js
games/shared/mini-game-logger.js
games/shared/mini-game-base.css
games/dice-game/dice.html
games/dice-game/dice.js
games/dragon-tiger/dragon-tiger.html
games/dragon-tiger/dragon-tiger.js
apps/st-bridge/packs/acezero-main/asset/data.js
games/texasholdem/texas-holdem/scripts/asset-mini-game-adapter-smoke.mjs
```

Phase 7 回归命令：

```bash
node games/texasholdem/texas-holdem/scripts/asset-mini-game-adapter-smoke.mjs
node games/texasholdem/texas-holdem/scripts/asset-adapter-smoke.mjs
node apps/st-bridge/packs/acezero-main/scripts/asset-runtime-smoke.js
```

不要做：

```text
小游戏各自保存独立 AssetDeck
小游戏直接写 active cards
小游戏绕过 Host command 自己抽卡
```

### Phase 8：状态栏与长期展示

状态：8.1 Summary Runtime 已完成；8.2 Dashboard 长期展示已接入第一版；8.3 德州局内展示已接入第一版；8.4 小游戏状态条已接入第一版。

目标：

- 状态栏能显示当前 AssetDeck 的长期概览。
- Dossier / Planner / Asset Deck 三处展示口径一致。
- 玩家能知道当前卡组对本局德州产生了哪些 modifier。

建议展示：

```text
Asset 点数
已装备卡数量
Void 隔离数量
本玩法生效 modifier 摘要
最近一次 Asset 来源
```

验收：

- Dashboard 与德州局内显示的费用 / 等级一致。
- 刷新 Dashboard 后不丢 AssetDeck。
- Host 模式和 Debug 模式展示一致，但 Debug 可以额外显示 raw modifier。

8.1 Summary Runtime 已落地：

- 新增 `apps/st-bridge/packs/acezero-main/asset/summary.js`。
- `ACE0AssetDeckSummary.create()` 提供纯展示投影，不写 MVU，不执行 AssetDeck command。
- 默认实例挂到 `ACE0Modules.assetSummary`。
- `buildAssetDeckSummary(assetDeck, { gameId, mode, adapter })` 输出统一摘要：

```text
points
slots
activeCards.general / void / all / effective / inactive
pending.offer / pending.replace
recentHistory
gameplay.skillLevels / mana / cost / forcePower / passive / miniGame
debug(raw compiled / applied / ignored，仅 debug mode)
```

- Host 模式只输出玩家可读摘要；Debug 模式额外输出 `compiledDebug` 和 `rawCompiled`，用于解释卡牌未生效原因。
- `manifest.json` 已加入 `acezero-asset-summary`，加载顺序在 `asset/runtime.js` 之后。
- `smoke-utils` 已把 `asset/summary.js` 纳入 Asset runtime 基础加载。

8.1 回归命令：

```bash
node --check apps/st-bridge/packs/acezero-main/asset/summary.js
node apps/st-bridge/packs/acezero-main/scripts/asset-summary-smoke.js
node apps/st-bridge/packs/acezero-main/scripts/asset-runtime-smoke.js
node games/texasholdem/texas-holdem/scripts/asset-mini-game-adapter-smoke.mjs
node games/texasholdem/texas-holdem/scripts/asset-adapter-smoke.mjs
```

8.2 起的硬规则：

```text
Dashboard / Asset Deck 页 / 德州局内 / 小游戏状态条都必须读取 AssetDeckSummary。
禁止在 UI 层重新手写 active_general_cards.length、modifier bucket 解析、gameTags 判断。
```

8.2 Dashboard 长期展示第一版：

- Overview 新增 `getCurrentAssetDeckSummary()`，优先读取 `ACE0Modules.assetSummary.buildAssetDeckSummary()`。
- 顶部 `ASSET` 资源值改读 `world.act.reserve.asset`。
- Planner 的 Asset Deck 页、Contract Extract 页、ACT Asset settlement 面板改读 `summary.slots / summary.activeCards / summary.pending`，点数统一读 `world.act.reserve.asset`。
- Shell 从 Host payload 的 `world.assetDeck` 派生 `dashboardAssetSummary`，并通过 Dossier context 传入。
- KAZU Dossier 状态块新增 Asset Deck 长期摘要：Asset 点数、有效/总装备数、Void 隔离数。

8.2 当前边界：

- Overview 仍保留 `normalizeAssetDeckForDashboard()` 和 `getCurrentAssetDeckState()` 作为 command / fallback 层，不作为展示口径。
- Dossier 只做 KAZU 长期状态摘要，不新增完整卡组列表；完整卡组仍在 Planner 的 Asset Deck 页。
- 小游戏状态条已走共享底座第一版，不在单个小游戏内重复解析 AssetDeck。

8.3 德州局内展示第一版：

- `texas-holdem.html` 加载 `asset/summary.js`，保证德州 iframe 内也有 `ACE0AssetDeckSummary`。
- `applyAssetDeckToTexasConfig()` 在编译 `assetModifiers` 时同步生成 `assetSummary`，并随 `playerConfigs` 传给 `SkillUI`。
- `SkillUI` 保存 `playerConfigs.assetSummary`，技能卡解释优先读取 `summary.gameplay.skillLevels / cost / forcePower / mana`。
- 旧的 `skill.assetCards / skill._assetCost / mana.assetMax` 仍保留为 fallback，不作为首选展示口径。
- 局内技能卡现在能展示统一摘要来源的 `ASSET LVx`、费用修正和 `FORCE +x%` 标签；Mana tooltip 也读 summary 的 mana modifier。

8.3 回归命令：

```bash
node --check games/texasholdem/texas-holdem/texas-holdem.js
node --check games/texasholdem/texas-holdem/ui/skill-ui.js
node games/texasholdem/texas-holdem/scripts/asset-adapter-smoke.mjs
ACEZERO_TEXAS_URL=http://127.0.0.1:8788/games/texasholdem/texas-holdem/texas-holdem.html node games/texasholdem/texas-holdem/scripts/asset-real-regression.mjs
```

8.4 小游戏状态条第一版：

- `blackjack / dice / dragon-tiger` HTML 统一加载 `asset-deck-adapter.js`、`asset/summary.js`、`mini-game-force.js`。
- `games/shared/mini-game-base.js` 在 `applyAssetDeckToMiniGameConfig()` 中同步生成 `assetModifiers` 与 `assetSummary`。
- `createConfigLoader()` 的 Host 注入、本地 JSON、默认配置三条路径都会先编译 AssetDeck，再渲染共享状态条。
- `.mg-asset-status` 放在通用底部 dashboard 内，显示 Asset 点数、生效/装备数量，以及本玩法生效的 cost / force / miniGame modifier 摘要。
- 这部分不在 `blackjack.js / dice.js / dragon-tiger.js` 内写 UI 分支，避免小游戏各自维护一套 Asset 展示逻辑。

8.4 回归命令：

```bash
node --check games/shared/mini-game-base.js
node games/texasholdem/texas-holdem/scripts/asset-mini-game-adapter-smoke.mjs
node games/texasholdem/texas-holdem/scripts/asset-mini-game-status-smoke.mjs
```

8.5 前八阶段收口结论：

链路已经收成一条主线：

```text
MVU world.assetDeck
  -> apps/st-bridge asset/runtime.js 负责长期规则与 command
  -> AssetDeckAdapter 负责玩法生效编译
  -> AssetDeckSummary 负责展示投影
  -> Dashboard / Dossier / Texas SkillUI / MiniGameBase 状态条读取 summary
```

结构检查结果：

- `asset/runtime.js` 仍是长期真相源，不直接承担战斗展示。
- `asset/summary.js` 是纯投影层，不写 MVU，不执行 command。
- Dashboard 展示入口优先读 `ACE0Modules.assetSummary.buildAssetDeckSummary()`；直接读取 `active_general_cards` 只保留在 summary 不可用时的 fallback。
- 德州局内先由 `applyAssetDeckToTexasConfig()` 生成 `assetModifiers + assetSummary`，`SkillUI` 优先读 summary 展示 Asset 等级、费用、Force 修正。
- 小游戏统一由 `games/shared/mini-game-base.js` 生成 `assetModifiers + assetSummary`，`blackjack / dice / dragon-tiger` 不再各自维护展示解析。
- 收口时修正了 `blackjack.js` 的旧配置入口：它此前只编译 AssetDeck，没有调用共享 `renderAssetStatus()`，现在已通过 `applyAssetDeckAndRenderConfig()` 统一编译并渲染状态条。

8.5 回归命令：

```bash
node --check games/blackjack/blackjack.js
node --check games/shared/mini-game-base.js
node --check games/texasholdem/texas-holdem/texas-holdem.js
node --check games/texasholdem/texas-holdem/ui/skill-ui.js
node apps/st-bridge/packs/acezero-main/scripts/asset-runtime-smoke.js
node apps/st-bridge/packs/acezero-main/scripts/asset-summary-smoke.js
node apps/st-bridge/packs/acezero-main/scripts/act-asset-command-smoke.js
node apps/st-bridge/packs/acezero-main/scripts/act-asset-flow-smoke.js
node apps/st-bridge/packs/acezero-main/scripts/act-asset-host-smoke.js
node apps/st-bridge/packs/acezero-main/scripts/schema-smoke.js
node games/texasholdem/texas-holdem/scripts/asset-adapter-smoke.mjs
node games/texasholdem/texas-holdem/scripts/asset-mini-game-adapter-smoke.mjs
node games/texasholdem/texas-holdem/scripts/asset-mini-game-status-smoke.mjs
git diff --check
```

### Phase 9：数值回归与平衡

状态：已具备进入条件，下一步开始实机样本采集。

目标：

- 在卡池和 adapter 稳定后再看数值。
- 建立多局回归样本，确认幸运、诅咒、Psyche、Void、Asset 增幅不会互相吞掉解释性。

重点观察：

```text
幸运是否仍然“不明显”
彩虹契约 8% 是否过强 / 过弱
Mana Max +10 对节奏影响
减费卡是否导致技能 spam
AI 是否因费用变化更频繁使用技能
```

验收：

- 至少有 3 套固定配置回归：无 Asset / 中等 Asset / 高 Asset。
- 每套能输出技能使用次数、Mana 消耗、MoZ force power、最终胜负趋势。
- 不在没有数据前大幅改数值。

Phase 9 执行建议：

```text
9.1 固定三套配置
  A. baseline：无 AssetDeck，用来观察幸运/诅咒/Psyche 原始强度。
  B. mid asset：1-2 张常规卡，验证减费/小幅 Force 对节奏的影响。
  C. high asset：彩虹契约 + 技能等级 + 被动，验证上限是否过强。

9.2 固定采样字段
  skillUseCount by owner/system/key
  manaSpent / manaGained / finalMana
  pendingForces and enhanced effectivePower
  MoZ selected card rank / heroWins / score
  AI action distribution: fold/call/raise/check
  page/runtime issues

9.3 先看解释性，再看数值
  如果日志里看不到 Asset 来源，先修展示/日志。
  如果来源清楚但胜率或节奏异常，再调数值。
  禁止靠单局体感直接改倍率。
```

Phase 9 第一批观察点：

- 幸运不明显时，先区分是 `force power` 太低、MoZ 候选牌池被对方 Psyche/Chaos 抵消，还是玩家已经牌型落后到幸运也救不回来。
- 诅咒过弱时，检查 `Chaos -> Moirai x1.25` 是否进入 force resolution，以及是否被 Psyche 防守/转化吃掉。
- Psyche 过强时，检查它是在正确防守/信息位生效，还是泛化成了万能抵消。
- Asset 过强时，优先看 `first_force_power_pct`、`all_force_power_bonus`、技能等级叠加是否同时放大同一个技能。

9.1 固定样本采集器已开始：

- 新增 `games/texasholdem/texas-holdem/scripts/asset-balance-regression.mjs`。
- 通过 CDP 注入三套固定配置：`baseline`、`mid_asset`、`high_asset`。
- 默认输出紧凑 JSON 报告；如需完整页面采样，可加 `ACEZERO_ASSET_BALANCE_VERBOSE=1`。
- 可用 `ACEZERO_ASSET_BALANCE_SCENARIOS=high_asset` 只跑单个场景。

9.1 回归命令：

```bash
node --check games/texasholdem/texas-holdem/scripts/asset-balance-regression.mjs
node games/texasholdem/texas-holdem/scripts/asset-balance-regression.mjs
ACEZERO_ASSET_BALANCE_SCENARIOS=high_asset node games/texasholdem/texas-holdem/scripts/asset-balance-regression.mjs
```

9.1 当前第一轮采样结论：

- `baseline`：无 Asset 时，6 个主动 force 的 pending raw power 为 201，Combat enhance 后为 277.9，force resolution 后 effective power 为 195.6。
- `mid_asset`：2 张 Asset 生效，`minor_wish` 费用从 10 降到 7；`all_force_power_bonus +8%` 只按玩家/队伍作用域增强 RINO force。
- `high_asset`：4 general + 1 void 合法样本，`minor_wish` 变 LV4 且费用 10 -> 5，`grand_wish` 变 LV4 且费用 20 -> 17，Mana Max +10 生效。
- 已确认：AssetDeck 语义按“玩家/队伍卡组”处理，默认不放大敌方。
- 9.2 已收口：`all_force_power_bonus / force_power_pct / force_power_flat / first_force_power_pct / mana_max_flat` 在没有显式 owner/team/table scope 时，默认按玩家/队伍作用域生效。
- 如果确实需要桌面规则卡，必须显式写 `scope: "table"`，否则不允许隐式全桌。
- 9.2 high_asset 重采样：`mana_max_flat +10` 只加 RINO，COTA/VV 保持 80；`minor_wish` LV4 且费用 10 -> 5；`grand_wish` LV4 且费用 20 -> 17；forcePower summary 显示 `scope: team`。
- 9.2 high_asset 重采样：pending raw power 215，enhanced raw power 325.6，resolved effective power 194.9；敌方不再吃 AssetDeck 的 Mana Max，Asset force 增幅不再是全桌语义。

9.3 force resolution 解释性追踪已补齐：

- `asset-balance-regression.mjs` 现在会采集 `system_counter / psyche_defend / fortune_curse_contest` 分阶段 trace，并输出 `systemCounterGain / psycheDefenseBlocked / fortuneContestDrain / curseContestDrain`。
- `baseline` 中 fortune 归零不是 Psyche 直接吞掉幸运。实际顺序是：Psyche 先防守 COTA/VV 的 Chaos 诅咒，其中 COTA `hex` 被完全挡掉，VV `havoc` 仍有剩余；最后 `fortune_curse_contest` 用剩余 `havoc` 把 RINO `minor_wish` 的 31.6 fortune drain 到 0。
- `mid_asset` 中 `minor_wish` 费用降低且 force +8% 生效，但剩余 VV `havoc` 仍高于 RINO fortune，所以 `minor_wish` 的 34.1 fortune 仍被 drain 到 0。
- `high_asset` 中 Asset 被动 fortune 会先吸收一轮诅咒 contest，随后 LV4 `minor_wish` 仍保留 20 fortune；这说明高配 Asset 已能让幸运变得可见，但中低配仍偏容易被 Chaos 压住。
- 当前推荐调参方向不是削 Psyche。Psyche 在这组样本里承担的是正确的防守职责；如果要让“幸运感”更早出现，优先调整中低配 Moirai 输出、Asset 中档增幅，或微调 VV `havoc` / Chaos 压制强度。

9.4 中档幸运可见性调参：

- 不修改 `st/docs/技能需求稿.md` 的通用技能表，保留 Chaos 比 Moirai 更高性价比的基础定位。
- `asset_texas_moirai_lens` 从 `Moirai +6%` 提到 `Moirai +8%`，让中档天命增幅更接近可感知阈值。
- 新增中档被动卡 `asset_texas_opening_glimmer / 开局微光`：每手一次 `fortune +12`，用于在强 Chaos 压力下给中档构筑保留一点可见幸运。
- 高档 `asset_texas_opening_blessing / 开局祝福` 从 `fortune +10` 提到 `fortune +14`，避免中档新增后压缩高档成长空间。
- `mid_asset` 回归样本改为真实语义组合：`minor_wish II + Moirai +8% + 开局微光`，不再用临时全 force +8% 代表中档。
- 9.4 mid_asset 采样：pending raw power 213，enhanced raw power 307.7，resolved effective power 170.8；fortune 在 VV `havoc` contest 后保留 `2.5`，Chaos 被清空。这个结果符合“中档能看见幸运，但只是刚越过阈值”的目标。

## 10. 测试计划

### 10.1 纯规则测试

建议新增：

```text
apps/st-bridge/packs/acezero-main/scripts/asset-deck-smoke.js
```

覆盖：

- default normalize。
- slot unlock cost。
- draw pool rarity。
- refresh cost。
- choose card。
- full slot replace。
- void slot legality。
- skill card merge。
- max level filter。

### 10.2 MVU / Host 测试

覆盖：

- `world.assetDeck` 缺失时自动补齐。
- Host commit 写回。
- command 幂等。
- pending offer 不被错误丢失。
- pending replace 刷新后仍可恢复。

### 10.3 Dashboard 回归

覆盖：

- Debug 加 Asset。
- 打开低 / 中 / 高 offer。
- 刷新 offer。
- 选择卡牌。
- 满槽替换。
- Void 槽限制。

### 10.4 德州实机回归

覆盖：

- Mana Max 卡。
- Mana cost 减费卡。
- Mana 增幅器。
- Moirai / Chaos / Psyche force 增幅。
- 技能卡等级覆盖。
- 每街被动触发。
- Reality 不清除长期 AssetDeck。

## 11. 风险与收口

### 11.1 命名风险

`Asset` 目前在项目里有三种语义：

```text
剧情经济资产 / funds assets
ACT asset 点数
德州 AssetLedger 临时资源
```

新系统建议统一命名为：

```text
AssetDeck
assetDeck
asset_card
```

避免单独使用 `asset` 作为模块名。

### 11.2 权限与真相源风险

Dashboard 不能自己抽卡，否则 Host / Debug / 存档会不一致。

所有随机和合法性必须走 runtime command。

### 11.3 战斗耦合风险

不要在每张卡里写战斗 if。

正确方式：

```text
card effects -> AssetModifierCompiler -> SkillSystem / CombatFormula 消费 modifiers
```

### 11.4 数值膨胀风险

增幅不设上限，但初版需要日志显示：

```text
base power
asset flat
asset pct
final power
```

否则后续很难查“为什么幸运这么强 / 不明显”。

### 11.5 Reality 边界

Reality I / II 不能清除长期 AssetDeck。

Reality II 可以清牌桌临时角色标记，但不能清：

```text
world.assetDeck
world.act.reserve.asset
active cards
owned_skill_levels
```

## 12. 首轮推荐实现范围

第一轮不要直接接德州战斗。

推荐只做：

```text
1. world.assetDeck schema / normalize
2. AssetDeck card catalog
3. draw / choose / replace / unlock 纯规则
4. smoke test
5. Dashboard Debug 最小入口
```

等真相源和规则稳定后，再进入德州 adapter。

这样可以避免 Asset 系统同时牵动 MVU、UI、战斗、技能四层时失控。

## 13. 当前待确认问题

来自需求稿的未决点：

- 每次抽卡展示 3 张还是 4 张。建议初版 3 张。
- 替换旧卡时是否允许取消购买。建议初版不允许取消，选择卡牌后必须替换。
- 消耗升级卡是否算抽卡结果。建议算，但不占槽。
- 同名数值卡是否无限叠加。建议初版允许叠加，后续按数值回归决定上限。
- 彩卡是否全部唯一。建议彩卡唯一。
- Void 专属槽满时，新 Void 卡是否优先替换 Void 槽。建议允许玩家选择通用或 Void 替换目标。
- 神卡是否允许被替换销毁。建议允许，但二次确认弹窗。
- 高风险高收益卡是否可叠加。建议初版不可叠加或最多 1 张，降低调试复杂度。

## 14. 一句话收口

AssetDeck 应作为独立的长期团队卡组系统落地：

```text
MVU 保存卡组真相
规则层负责抽卡与合法性
Dashboard 负责可视化和提交命令
战斗引擎只消费编译后的 modifiers
```

先稳住真相源和规则，再接德州战斗。不要把它和现有 `AssetLedger` 混成一个系统。
