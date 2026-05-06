# ACT Planner 五页重构规划

> 目标：把当前 Plan 抽屉从“相位规划 + AssetDeck”改成一个更清晰的五页结构。
> 一个主页负责节点相位投入，四个点数页分别负责信息展示与点数能力操作。

## 1. 目标结构

当前结构：

```text
PHASE PLANNER
AssetDeck 卡组页
```

目标结构：

```text
PHASE PLANNER
交锋点 / COMBAT
休整点 / REST
契令点 / ASSET
情报点 / VISION
```

其中：

- `PHASE PLANNER` 是主页，保留四段相位、点数库存、拖拽/点击投入。
- `COMBAT` 是交锋点信息页，目前只保留接口与占位，不触发正式战斗。
- `REST` 是休整点操作页，展示 Mana 回复、节点染色、固定营收。
- `ASSET` 是契令/AssetDeck 操作页，整合卡组装配与卡池 overlay。
- `VISION` 是情报点操作页，展示视野、固定相位替换、跃迁状态。

## 2. 主页：PHASE PLANNER

主页要更高一些，避免当前点数库存和相位规划显得被压扁。

建议高度：

```text
planner page: min(360px, calc(100vh - 230px))
resource pages: min(420px, calc(100vh - 240px))
```

主页职责只保留“排程”：

- 显示当前节点四段 phase。
- 显示四点数库存：limited / reserve。
- 支持投入 1-3 点。
- 显示固定相位、Encounter marker、Vision 替换提示。
- 不承载 AssetDeck 卡槽、Rest 染色细节、Vision 跃迁候选等重操作。

主页顶部应增加四个点数页入口：

```text
COMBAT / REST / ASSET / VISION
```

入口不是简单 tab 平铺，而是资源信息导航。主页仍然是默认页。

## 3. COMBAT：交锋点页

当前只留接口，不做正式功能。

展示内容：

- 当前 `combat` limited / reserve / income_rate / income_progress。
- 交锋点 1/2/3 的需求稿说明。
- 当前节点 phase 中已排入的 combat 相位。
- `pendingResolutions` 或未来 `pendingCombatCommands` 的占位摘要。

交互策略：

- 按钮可以显示为 disabled / coming soon。
- 不在 Dashboard 里直接启动德州、小玩法、日麻。
- 不伪造收益。
- 保留 command 协议入口，等 Combat adapter 正式接入。

建议接口名：

```js
protocol: 'ace0.combatCommand.v1'
kind: 'open_combat'
level: 1 | 2 | 3
source: { nodeId, nodeIndex, phaseIndex }
```

## 4. REST：休整点页

Rest 已经有第一版闭环，可以做成正式操作页。

展示内容：

- 当前 `rest` limited / reserve。
- 当前 Mana、最大 Mana、预计回复量。
- 当前节点控制状态。
- 当前节点可选染色：neutral / combat / rest / asset / vision。
- 已控制节点列表或同 lane 染色摘要。
- 固定营收：`income_rate` / `income_progress`。

操作内容：

- 选择 Rest 染色目标。
- 展示追加消耗：染色会额外消耗 1 个对应点数。
- 展示 Rest 1/2/3 的收益说明。

实现边界：

- Rest 页不直接替代 phase 投入。
- 玩家仍然要先在主页把 Rest token 放进 phase。
- Rest 页负责设置“当 Rest 相位结算时如何染色”的意图。

建议状态：

```js
world.act.restIntent = {
  nodeId,
  tint: 'neutral' | 'combat' | 'rest' | 'asset' | 'vision',
  updatedAt
}
```

如果当前 runtime 已有等价字段，优先复用，不新开重复变量。

## 5. ASSET：契令点页

Asset 页承接当前 AssetDeck 卡组装配。

命名边界：

- ACT 相位 token 叫 `契令 / TOKEN`。
- AssetDeck 长期点数叫 `DECK PTS`。
- 剧情资产仍是 `hero.assets`，不能混用。

展示内容：

- `world.assetDeck.asset_count`。
- 通用槽 / Void 槽容量。
- 已装备卡。
- 右侧卡片详情。
- `pending_offer` overlay。
- `pending_offer_queue` 队列数。

操作内容：

- 选择 pending offer 卡片。
- 解锁 slot。
- 替换卡。
- refresh offer。

关键交互：

- 没有 `pending_offer` 时，卡池隐藏。
- 有 `pending_offer` 时，卡池覆盖在 Asset 页上，不挤压卡槽。
- 选择后当前 offer 消失；如果 queue 存在，推进到下一池。

## 6. VISION：情报点页

Vision 已经有第一版闭环，可以做成正式信息/操作页。

展示内容：

- 当前 `vision` limited / reserve。
- `baseSight + bonusSight`。
- 已探明节点范围。
- `pendingReplace` 状态。
- `jumpReady` 状态。
- 当前 route 阶段可跳线候选。

操作内容：

- 查看 Vision 1 / 2 / 3 的规则说明。
- 如果 `pendingReplace.status === charged`，显示替换机会剩余次数。
- 如果 `jumpReady`，展示候选路线按钮。

实现边界：

- Vision 2 的固定相位替换选择仍在 phase bar 临场弹出，因为它绑定具体 phase。
- Vision 页只做状态、说明、候选管理，不抢走临场确认。

## 7. UI 架构建议

统一使用一个 planner drawer 壳：

```js
appState.plannerPage =
  'planner'
  | 'combat'
  | 'rest'
  | 'asset'
  | 'vision'
```

兼容旧字段：

```js
assetDrawerTab === 'deck' -> plannerPage = 'asset'
assetDrawerTab === 'extract' -> plannerPage = 'asset'
```

建议新增构建函数：

```js
buildPlannerHomePageMarkup()
buildCombatResourcePageMarkup()
buildRestResourcePageMarkup()
buildAssetResourcePageMarkup()
buildVisionResourcePageMarkup()
buildPlannerResourceNavMarkup()
```

旧函数处理：

- `buildAssetDeckPanelMarkup()` 已重命名为 `buildAssetResourcePageMarkup()`。
- 旧 `extract` CSS 清理掉。
- `renderPlannerDrawer()` 只负责组装壳，不继续塞具体业务。

## 8. 数据源对齐

主页和四点数页都只读同一份 ACT 真相源：

```js
world.act.limited
world.act.reserve
world.act.income_rate
world.act.income_progress
world.act.phase_slots
world.act.vision
world.act.controlledNodes
world.act.pendingAssetDeckCommands
world.assetDeck
```

禁止新增平行副本：

- 不新建第二套点数余额。
- 不把 `hero.assets` 当 AssetDeck 点。
- 不把 `world.assetDeck.asset_count` 当 ACT 相位 token。

## 9. 实施阶段

### Phase A：导航壳重构

- 把 `assetDrawerTab` 迁移为通用 `plannerPage`。
- 五个页面入口上线。
- 保留旧 `assetDrawerTab` 兼容映射。
- `PHASE PLANNER` 主页高度提高。

验收：

- 打开抽屉默认在主页。
- 点击四点数入口能切页。
- 旧 pending offer 到来时仍能自动切到 Asset 页。

当前状态：

- 已完成。
- Overview 已新增 `plannerPage`，并兼容 `deck / extract -> asset`。
- 抽屉已改为 `PHASE PLANNER / COMBAT / REST / ASSET / VISION` 五页导航。
- `PHASE PLANNER` 主页高度已提高。
- `COMBAT / REST / VISION` 当前先落信息页骨架；正式操作在 Phase C / D 继续收口。
- `ASSET` 页继续承接当前 AssetDeck 与 pending offer overlay。

### Phase B：Asset 页迁移

- 当前 AssetDeck 卡组装配迁移成 `ASSET` 页。
- pending offer overlay 保持不挤压布局。
- 清理旧 `extract` CSS 和命名。

验收：

- Asset 相位结算后进入 Asset 页并显示 overlay。
- 选择卡后 overlay 消失。
- 队列 offer 正常串行。

当前状态：

- 已完成。
- Asset 页内部主标题已调整为 `ASSET DECK`。
- 旧 `extract` 专用 CSS 已清理，pending offer 只作为 Asset 页 overlay 存在。
- Asset 卡组页构建函数已收口为 `buildAssetResourcePageMarkup()`。

### Phase C：Rest / Vision 页成型

- Rest 页接当前染色意图和收益摘要。
- Vision 页接当前视野、替换、跃迁摘要。
- 现有 phase bar 临场 prompt 不改变。

验收：

- Rest 页能解释并设置当前节点染色意图。
- Vision 页能看到 `bonusSight / pendingReplace / jumpReady`。
- 不影响 `ADV SEG / ADV NODE` 的 Vision 保护逻辑。

当前状态：

- 进行中，第一版已落地。
- Rest 页已显示 Rest 排程、当前选中 Rest 相位、染色按钮、已控制节点摘要。
- Rest 页染色按钮复用现有 `setSelectedRestTint()`，不新增第二套染色状态。
- Rest 页已补充染色额外消耗、库存不足提示、当前染色意图说明。
- Vision 页已显示 Vision 排程、视野范围、固定相位替换状态、跃迁候选。
- Vision 页已补充下一步提示：探路范围、charged 替换等待、ready 替换、jump route。
- 修复了 Vision 页误调用不存在的 `buildVisionActPanelMarkup()` 的问题，统一复用 `buildVisionPanelMarkup()`。
- Phase bar 的 Vision 2 临场替换 prompt 仍保留在原位置，资源页只展示状态和候选，不抢确认流程。

### Phase D：Combat 接口页

- Combat 页只做信息和 pending command 占位。
- disabled 操作按钮写明 `Combat adapter pending`。
- 不触发正式战斗，不伪造收益。

验收：

- Combat 页不会改变 MVU。
- Combat token 仍可在主页投入相位。
- 抵达 combat phase 仍只生成外部接口/占位。

当前状态：

- 已完成。
- COMBAT 资源页显示当前交锋点库存、已排程 Combat 相位、pending external request、最近 combat history。
- ACT Debug 面板新增 Combat 外部请求摘要，与 Asset 结算摘要并列。
- Combat 页没有启动按钮，不调用德州/小游戏/日麻，也不伪造收益。
- 底层仍使用既有 `pendingResolutions[type=combat]` / `ace0.externalResolution.v1` 协议；正式 adapter 后续再接入。

## 10. 回归测试

基础检查：

```bash
node --check apps/dashboard/pages/overview/index.js
git diff --check
```

ACT / Asset 检查：

```bash
node apps/st-bridge/packs/acezero-main/scripts/act-asset-command-smoke.js
node apps/st-bridge/packs/acezero-main/scripts/act-asset-flow-smoke.js
node apps/st-bridge/packs/acezero-main/scripts/act-asset-host-smoke.js
node apps/st-bridge/packs/acezero-main/scripts/asset-runtime-smoke.js
```

人工检查：

- 主页高度是否足够，四个点数 token 是否不挤压。
- 五页切换是否稳定。
- Asset overlay 是否覆盖而不是挤开卡槽。
- Rest / Vision 页是否只读同一份 ACT 状态。
- Combat 页是否没有误触发正式战斗。
