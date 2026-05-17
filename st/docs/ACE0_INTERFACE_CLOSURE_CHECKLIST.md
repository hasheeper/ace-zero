# ACE0 接口收口检查文档

> 目的：记录本轮遭遇、资产、ACT_RESULT、Dashboard、MVU replay 的真实接口约束，方便之后做边界检查、代码审查和回归排错。
>
> 本文以当前 compact 变量方案为准。旧规划文档中关于 `queue / characters`、AssetDeck `history / pending_* / active_*` 的结构，均视为已废弃。

## 1. 总原则

### 1.1 单一事实源

所有长期状态必须以 MVU 变量为真相源：

- 遭遇事实源：`world.act.characterEncounter`
- 资产事实源：`world.assetDeck`
- ACT 节点事实源：`world.act`
- 角色出场事实源：`hero.cast`

Dashboard、ACT_RESULT、战斗界面、调试面板只能读取或提交操作意图，不能保存另一份持久状态。

### 1.2 持久变量只存最小事实

变量里只存不能从静态表或上下文推导的事实：

- 资产卡只存 `{ id, lv }`
- 遭遇只存 `active / met / signaled / lastMeet`
- 卡牌显示、效果、slotTag、技能信息都从 `asset/data.js` catalog 派生
- 遭遇 label、hint、角色状态视图都从规则和 compact ledger 派生

禁止把 UI 展开态、调试视图、历史流水账、默认角色镜像写回 MVU。

### 1.3 楼层绑定

Asset offer 是楼层临时状态：

- `world.assetDeck.offer.floor` 必须绑定到当前 `message:n`
- 回滚到该楼时，已结算 offer 可保留 `settled: true`，用于按钮置灰和记忆
- 进入不同楼层且没有新资产池事件时，必须清空 `world.assetDeck.offer = null`
- ACT_RESULT 只展示 `offer.floor === 当前 floorKey` 的 offer

## 2. Canonical MVU 结构

### 2.1 Encounter

唯一允许的持久结构：

```json
{
  "active": {
    "COTA": {
      "kind": "meet",
      "state": "placed",
      "node": "node2-floor-side",
      "nodeIndex": 2,
      "from": 1,
      "until": 4,
      "priority": 188
    }
  },
  "met": {
    "COTA": { "node": "node2-floor-side", "nodeIndex": 2, "phase": 1 }
  },
  "signaled": {},
  "lastMeet": 2
}
```

字段约束：

- `kind`: `meet | signal`
- `state`: `queued | placed`
- `active[char]`: 当前未完成遭遇，一个角色最多一条
- `met[char]`: 已正式初见
- `signaled[char]`: 已前置信号
- `lastMeet`: 全局初见冷却用节点 index

禁止持久字段：

- `v`
- `queue`
- `characters`
- `queuedRequestId`
- `placedNodeId`
- `firstMeetDone`
- 默认 8 人 locked 镜像

### 2.2 AssetDeck

唯一允许的持久结构：

```json
{
  "slots": { "general": 4, "void": 2 },
  "bag": {
    "general": [{ "id": "asset_skill_minor_wish_l1", "lv": 1 }],
    "void": [{ "id": "asset_skill_insulation_l1", "lv": 1 }]
  },
  "offer": {
    "floor": "message:12",
    "id": "offer:low:2349879602",
    "pool": "low",
    "settled": false,
    "choices": [{ "id": "asset_x", "lv": 1 }],
    "reroll": [{ "id": "asset_y", "lv": 1 }]
  }
}
```

字段约束：

- `slots.general`: 通用槽数量
- `slots.void`: Void 槽数量
- `bag.general[] / bag.void[]`: 只存 compact card ref
- `offer`: 当前楼层卡池，或 `null`
- `offer.pool`: `low | mid | high`
- `offer.settled`: 当前楼层是否已结算
- `offer.choices[]`: 当前三选一
- `offer.reroll[]`: 预生成 reroll，使用后删除

禁止持久字段：

- `v`
- `version`
- `active_general_cards`
- `active_void_cards`
- `pending_offer`
- `pending_offer_queue`
- `pending_replace`
- `history`
- `instanceId`
- `source`
- `addedAt`

### 2.3 Hero Cast

`hero.cast[char]` 仍是角色是否可正式出场的真相源：

```json
{
  "introduced": false,
  "present": false,
  "inParty": false,
  "activated": true
}
```

规则：

- `introduced=false` 表示普通生成禁止让该角色正式出场
- `introduced=true, present=false` 表示角色已正式解锁但当前不在场，必须在 `<ace0_hero_state>` 的 `INTRODUCED NOT PRESENT` 分组中出现
- 只有 encounter consume meet 或明确剧情事件才能写 `introduced=true`
- 首见帧需要在场时，同时写 `present=true`
- Dashboard 可从 encounter ledger 派生“即将首见”展示，但不能把派生状态写回 `hero.cast`

## 3. Asset 接口链路

### 3.1 资产相位开池

流程：

```text
ACT asset phase
  -> transient asset_offer event
  -> settleActAssetDeckEventsForHost()
  -> assetDeck.applyAssetDeckCommand(open_offer)
  -> world.assetDeck.offer
```

写入规则：

- 资产相位只生成一个 compact `offer`
- `offer.floor` 必须等于当前 `floorKey`
- `world.act.reserve.asset` 按开池消耗结算
- 不写 `world.act.pendingAssetDeckCommands`
- 不写 asset 类 `world.act.resolutionHistory`
- 不写 AssetDeck `history`

同楼幂等：

- 同一楼层已有同 pool offer 时，不重复开池
- 同一楼层已 settled 时，不重开，只保留 settled 状态

跨楼清理：

- 当前楼层没有 asset event 且 `offer.floor !== 当前 floorKey` 时，清空 `offer`
- 这是资产变量楼层标记制的关键边界

### 3.2 ACT_RESULT 展示 offer

ACT_RESULT payload 来自：

```text
tavern/result.js -> buildAssetOfferResultPayload(after.assetDeck, options.floorKey)
```

展示条件：

- `assetDeck.offer` 存在
- `offer.choices.length > 0`
- `offer.floor === 当前 floorKey`

否则 `assetOffer = null`。

### 3.3 点击卡牌

点击必须提交卡牌身份，而不是只提交 index：

```json
{
  "kind": "choose_card",
  "payload": {
    "choiceIndex": 1,
    "choiceId": "asset_psyche_shield_gold",
    "cardId": "asset_psyche_shield_gold",
    "slotType": "general",
    "clearKey": "offer:low:1290386838",
    "floorKey": "message:4"
  }
}
```

所有桥接路径都必须保留：

- `choiceId / cardId`
- `choiceIndex`
- `floorKey`
- `clearKey / offerId`
- `targetIndex / replaceIndex`
- `confirmDestroy`

覆盖路径：

- ACT_RESULT direct API: `ACE0Plugin.chooseAssetCard(...)`
- ACT_RESULT host fallback: `acezero-act-result-asset-command`
- Dashboard asset command: `ACE0_DASHBOARD_ASSET_DECK_COMMAND`

### 3.4 选择结算

`asset/runtime.js` 的 `choose_card` 规则：

- 有 `choiceId` 时，必须在 live `offer.choices[].id` 中找到
- 找不到时返回 `choice_id_mismatch`
- 禁止回退到 `choiceIndex` 结算另一张牌
- 没有 `choiceId` 时才允许按 `choiceIndex` 兜底

结算结果：

- 普通卡：进入 `bag.general` 或 `bag.void`
- 同技能卡：合并或升级对应 `{ id, lv }`
- 技能升级卡：消费后升级目标技能
- 满槽：返回 `needs_replace`，不落 `pending_replace`
- 成功后写 `offer.settled = true`
- 成功后删除 `offer.reroll`

### 3.5 Catalog 与 Schema 对齐

`asset/data.js` 是卡牌 catalog 真相源。

`schema/acezero-schema.js` 的 `ASSET_DECK_CARD_SLOT_TAGS` 必须覆盖 catalog 中所有 card id。否则会出现：

```text
ACT_RESULT 能显示卡
  -> MVU schema reconciliation 过滤掉该 id
  -> 点击时报 choice_id_mismatch
```

必须保留测试：

```text
init-alignment-smoke
```

该测试必须检查 catalog 里的每个 id 都在 schema 白名单里。

## 4. Encounter 接口链路

### 4.1 投放

流程：

```text
derive context from MVU
  -> evaluate eligible character
  -> enqueue active[char]
  -> place active[char]
  -> frontendSnapshot.encounterMarkers
```

幂等规则：

- 已有 `active[char]` 时，不重复投放同角色
- 已有 `met[char]` 时，不再投放 meet
- 已有 `signaled[char]` 时，不重复 signal，只能进入 follow-up meet

### 4.2 Dashboard 展示

Dashboard 仍保留现有地图和相位显示方式，但数据只能来自派生 snapshot：

```json
{
  "charKey": "COTA",
  "type": "first_meet",
  "status": "placed",
  "nodeId": "node2-floor-side",
  "nodeIndex": 2,
  "phaseIndex": 1,
  "label": "COTA"
}
```

映射规则：

- `kind: meet` -> `type: first_meet`
- `kind: signal` -> `type: pre_signal`
- `state: queued | placed` -> UI status

Dashboard 禁止读取旧结构：

- `/world/act/characterEncounter/queue`
- `/world/act/characterEncounter/characters`

Dashboard 禁止把 `encounterMarkers` 或展开角色视图回灌到 MVU。

### 4.3 消费

Meet 消费：

```text
delete active[char]
write met[char] = { node, nodeIndex, phase }
write lastMeet = nodeIndex
patch hero.cast[char].introduced = true
if first-meet frame needs presence:
  patch hero.cast[char].present = true
```

Signal 消费：

```text
delete active[char]
write signaled[char] = { node, nodeIndex, phase }
create follow-up meet when rule allows
```

## 5. MVU Replay 边界

### 5.1 允许写入

Asset 允许写入：

- `/world/assetDeck`
- `/world/assetDeck/slots`
- `/world/assetDeck/bag`
- `/world/assetDeck/offer`
- `/world/act/reserve/asset`

Encounter 允许写入：

- `/world/act/characterEncounter`
- `/hero/cast/<char>/introduced`
- `/hero/cast/<char>/present`

ACT 允许写入：

- `/world/act`
- `/world/clockPressure`
- 必要的 `hero` 经济和 roster patch

### 5.2 禁止写入

Asset 禁止：

- `/world/assetDeck/history`
- `/world/assetDeck/pending_offer`
- `/world/assetDeck/pending_offer_queue`
- `/world/assetDeck/pending_replace`
- `/world/assetDeck/active_general_cards`
- `/world/assetDeck/active_void_cards`
- asset 类 `/world/act/resolutionHistory`
- `/world/act/pendingAssetDeckCommands`

Encounter 禁止：

- `/world/act/characterEncounter/queue`
- `/world/act/characterEncounter/characters`
- `queuedRequestId`
- `placedNodeId`
- `firstMeetDone`
- 默认 locked 角色镜像

### 5.3 Replay 失败处理

如果 replay 失败：

- 不得把假想执行后的 assetDeck 应用到 Dashboard
- 只允许回传当前真实 assetDeck
- UI 应刷新到真实状态

典型错误含义：

| code | 含义 | 首查位置 |
|---|---|---|
| `offer_settled` | UI 点击了已结算 offer | Dashboard / ACT_RESULT settled 状态 |
| `stale_asset_offer` | clearKey 和 live offer id 不一致 | ACT_RESULT payload 是否过期 |
| `choice_id_mismatch` | 点击 card id 不在 live choices 中 | schema 白名单、floor、offer choices 是否漂移 |
| `floor_key_mismatch` | 操作楼层和当前消息楼层不一致 | floorKey 传递链路 |
| `mvu_replay_unavailable` | 无法写回 MVU replay | Tavern replay bridge |
| `mvu_replay_missing_base` | 当前楼缺少完整 MVU 基底 | 消息变量 / 回滚基底 |

## 6. Dashboard / ACT_RESULT 前端规则

### 6.1 Dashboard Asset

Dashboard 展示规则：

- `pending.offer.settled === true` 时，不显示三选一 overlay
- settled 后面板显示 `SETTLED`
- 点击失败但返回 `assetDeck` 时，先应用返回的真实 assetDeck，再显示错误
- host 收到失败但带 `assetDeck` 时也要刷新 Dashboard

Dashboard 操作规则：

- `choose-card` 必须带 `data-card-id`
- payload 必须带 `choiceId/cardId`
- Dashboard 不能自己决定选择结果

### 6.2 ACT_RESULT Asset

ACT_RESULT 展示规则：

- 只展示当前楼层 offer
- 点击前尝试同步 live MVU offer
- live offer 与 payload 不一致时锁定面板，不允许继续点
- settled 时锁定面板

ACT_RESULT 点击规则：

- direct API 和 fallback bridge 都必须传 `choiceId/cardId`
- fallback bridge 不得丢弃 replacement payload
- 成功后用 clicked `choiceId` 标记 chosen，不用返回的升级后 id 标记按钮

## 7. 战斗与展示 Hydrate 规则

所有展示和战斗读取 asset v2 时，都必须通过同一类 hydrate 逻辑：

```text
{ id, lv }
  -> catalog card
  -> display name / rarity / kind / system
  -> slotTags / gameTags
  -> modifiers / effectText
```

不得再读取旧字段：

- `cardId` 作为持久字段
- `instanceId`
- `source`
- `addedAt`
- `history`

输出给 UI 的 view model 可以包含 `cardId`，但那是派生字段，不得写回 MVU。

## 8. Source Scan 清单

每次收口检查建议跑以下搜索：

```bash
rg -n "pending_offer|pending_offer_queue|pending_replace|active_general_cards|active_void_cards|history" apps/st-bridge apps/dashboard apps/act-result
rg -n "characterEncounter.*queue|characterEncounter.*characters|queuedRequestId|placedNodeId|firstMeetDone" apps/st-bridge apps/dashboard
rg -n "choiceIndex" apps/act-result apps/st-bridge/packs/acezero-main/tavern apps/dashboard/pages/overview
rg -n "choiceId|cardId" apps/act-result apps/st-bridge/packs/acezero-main/tavern apps/dashboard/pages/overview
```

检查目标：

- 旧字段只允许出现在测试断言、历史文档、明确拒绝逻辑里
- `choiceIndex` 不得单独作为 ACT_RESULT / Dashboard choose-card 的唯一身份
- 所有 choose-card 桥接必须同时保留 `choiceId/cardId`

## 9. 必跑测试

资产相关：

```bash
node apps/st-bridge/packs/acezero-main/scripts/asset-runtime-smoke.js
node apps/st-bridge/packs/acezero-main/scripts/asset-summary-smoke.js
node apps/st-bridge/packs/acezero-main/scripts/act-asset-flow-smoke.js
node apps/st-bridge/packs/acezero-main/scripts/act-asset-host-smoke.js
node apps/st-bridge/packs/acezero-main/scripts/act-asset-tavern-host-smoke.js
node apps/st-bridge/packs/acezero-main/scripts/act-result-asset-offer-smoke.js
node apps/st-bridge/packs/acezero-main/scripts/tavern-frontend-assetdeck-smoke.js
node apps/st-bridge/packs/acezero-main/scripts/init-alignment-smoke.js
```

遭遇相关：

```bash
node apps/st-bridge/packs/acezero-main/scripts/encounter-runtime-smoke.js
node apps/st-bridge/packs/acezero-main/scripts/encounter-host-smoke.js
```

MVU / Dashboard 边界：

```bash
node apps/st-bridge/packs/acezero-main/scripts/mvu-replay-smoke.js
node apps/st-bridge/packs/acezero-main/scripts/schema-smoke.js
node apps/dashboard/pages/overview/scripts/validate-overview-boundaries.js
```

语法检查：

```bash
node --check apps/st-bridge/packs/acezero-main/tavern/plugin.js
node --check apps/st-bridge/packs/acezero-main/tavern/act-runtime.js
node --check apps/st-bridge/packs/acezero-main/tavern/result.js
node --check apps/st-bridge/packs/acezero-main/asset/runtime.js
node --check apps/st-bridge/packs/acezero-main/schema/acezero-schema.js
node --check apps/act-result/app.js
node --check apps/dashboard/pages/overview/adapters/asset-adapter.js
node --check apps/dashboard/pages/overview/views/planner-view.js
```

## 10. 回归场景

### 10.1 Asset 货不对版

准备：

- offer choices 包含三张不同卡
- 点击第二张，比如 `asset_psyche_shield_gold`

期望：

- payload 带 `choiceId: asset_psyche_shield_gold`
- live `offer.choices` 包含该 id
- bag 写入 `asset_psyche_shield_gold`
- 不会写入其他 index 对应卡

如果报 `choice_id_mismatch`：

1. 检查 `assetDeck.offer.floor` 是否等于当前 `message:n`
2. 检查 `offer.id` 是否等于 clearKey
3. 检查 `offer.choices[].id` 是否包含 clicked id
4. 检查 schema 白名单是否包含 clicked id
5. 检查 ACT_RESULT fallback bridge 是否保留 `choiceId/cardId`

### 10.2 Asset 下一楼清空

准备：

- message 4 有 `offer.floor = message:4`
- 已选择卡，`settled = true`
- 生成 message 5，且没有 asset phase

期望：

- message 4 变量保留 settled offer
- message 5 变量 `world.assetDeck.offer = null`
- message 5 ACT_RESULT 不显示 message 4 的三选一

### 10.3 Dashboard settled 后残留按钮

准备：

- ACT_RESULT 或 Dashboard 选择卡成功
- `offer.settled = true`

期望：

- Dashboard 三选一 overlay 消失
- 牌池显示 `SETTLED`
- 再点旧按钮不会继续发 choose-card
- 如果误点 stale UI，host 返回真实 assetDeck 并刷新

### 10.4 Encounter COTA 不重复

准备：

- `active.COTA` 已存在，或 `met.COTA` 已存在

期望：

- enqueue 不再创建新的 COTA meet
- place 不产生重复 marker
- consume 后只剩 `met.COTA`
- `hero.cast.COTA.introduced = true`

### 10.5 NOT INTRODUCED 禁止出场

准备：

- `hero.cast.X.introduced = false`
- 没有当前 placed meet

期望：

- hero state prompt 中进入 NOT INTRODUCED
- 普通生成不得让该角色正式出场
- Dashboard 只可显示规则派生的预告/marker，不可当作已出场角色

### 10.6 已出场但不在场

准备：

- `hero.cast.COTA.introduced = true`
- `hero.cast.COTA.present = false`

期望：

- hero state prompt 中进入 `INTRODUCED NOT PRESENT`
- 不进入 `NOT INTRODUCED`
- 允许 AI 记得该角色已正式认识，但不得把该角色写成当前在场，除非后续变量写入 `present=true`

## 11. 文件职责索引

Asset runtime:

- `apps/st-bridge/packs/acezero-main/asset/data.js`
- `apps/st-bridge/packs/acezero-main/asset/runtime.js`
- `apps/st-bridge/packs/acezero-main/asset/summary.js`

Schema / init:

- `apps/st-bridge/packs/acezero-main/schema/acezero-schema.js`
- `st/init/initvar.txt`

Tavern host:

- `apps/st-bridge/packs/acezero-main/tavern/act-runtime.js`
- `apps/st-bridge/packs/acezero-main/tavern/result.js`
- `apps/st-bridge/packs/acezero-main/tavern/plugin.js`

Dashboard:

- `apps/st-bridge/packs/acezero-main/dashboard/loader.js`
- `apps/dashboard/pages/overview/adapters/asset-adapter.js`
- `apps/dashboard/pages/overview/views/planner-view.js`
- `apps/dashboard/pages/overview/views/map-view.js`

ACT_RESULT:

- `apps/act-result/app.js`
- `st/wrappers/ACT_RESULT.html`

Encounter:

- `apps/st-bridge/packs/acezero-main/act/encounter-runtime.js`
- `apps/st-bridge/packs/acezero-main/act/plugin.js`
- `apps/st-bridge/packs/acezero-main/tavern/plugin.js`

Tests:

- `apps/st-bridge/packs/acezero-main/scripts/*smoke.js`
- `apps/dashboard/pages/overview/scripts/validate-overview-boundaries.js`

## 12. 收口验收标准

本轮接口算收口，必须同时满足：

- MVU 中不出现旧 encounter 和旧 asset 持久字段
- AssetDeck 所有卡牌 id 能被 schema 保留
- 资产三选一点击以 card id 为主，不以 index 为主
- offer 生命周期严格绑定 floor
- ACT_RESULT 和 Dashboard 都不展示跨楼 offer
- Dashboard 不回灌 UI 派生态
- Encounter marker 来自 compact ledger 派生
- `introduced=false` 角色不会被普通生成提前出场
- 必跑 smoke 全绿
- source scan 没有旧字段写入入口
