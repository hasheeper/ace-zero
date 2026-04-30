# Mahjong Tests

## Last Regression

Date: 2026-04-08

Commands:

```bash
node /Users/liuhang/Documents/acezero/majiang/scripts/validate-p3-scenarios.js
node /Users/liuhang/Documents/acezero/majiang/scripts/validate-phaseA-scenarios.js
node /Users/liuhang/Documents/acezero/majiang/scripts/validate-phaseB-scenarios.js
node /Users/liuhang/Documents/acezero/majiang/scripts/validate-phaseD-scenarios.js
node /Users/liuhang/Documents/acezero/majiang/scripts/validate-furiten-scenarios.js
node /Users/liuhang/Documents/acezero/majiang/scripts/validate-p5-scenarios.js
node /Users/liuhang/Documents/acezero/majiang/scripts/validate-p6-pao-scenarios.js
node /Users/liuhang/Documents/acezero/majiang/scripts/validate-sanma-tsumo-loss.js
node /Users/liuhang/Documents/acezero/majiang/scripts/validate-sanma-settlement-view.js
node /Users/liuhang/Documents/acezero/majiang/scripts/validate-sanma-dora-indicators.js
node /Users/liuhang/Documents/acezero/majiang/scripts/validate-sanma-dead-wall.js
node /Users/liuhang/Documents/acezero/majiang/scripts/validate-sanma-kita-gating.js
node /Users/liuhang/Documents/acezero/majiang/scripts/validate-friendly-json-rules.js
node /Users/liuhang/Documents/acezero/majiang/scripts/validate-shibari-rules.js
```

Result:

- PASS `game-config.p3-sanma-tsumo-loss-chiihou.json`
- PASS `game-config.p3-haitei-tsumo.json`
- PASS `game-config.p3-houtei-ron.json`
- PASS `game-config.p3-tenhou.json`
- PASS `game-config.p3-chiihou.json`
- PASS `game-config.p3-nine-kinds.json`
- PASS `game-config.p3-exhaustive-draw.json`
- PASS `game-config.p4-furiten-discard.json`
- PASS `game-config.p4-furiten-pass-ron.json`
- PASS `game-config.p4-furiten-clear-after-discard.json`
- PASS `game-config.p4-furiten-riichi-lock.json`
- PASS `dealer-double-ron-board-state-default`
- PASS `dealer-double-ron-board-state-renchan`

## Retained Configs

### Normal Entry

- [game-config.json](/Users/liuhang/Documents/acezero/majiang/game-config.json)
  用途：默认单局入口

### Manual Mid-State

- [game-config.qianggang-setup.json](/Users/liuhang/Documents/acezero/majiang/game-config.qianggang-setup.json)
  用途：抢杠和中间态，停在“碰已完成、加杠前”

### Script Regression

- [game-config.p3-sanma-tsumo-loss-chiihou.json](/Users/liuhang/Documents/acezero/majiang/test/game-config.p3-sanma-tsumo-loss-chiihou.json)
  用途：三麻子家自摸损真实对局样例（地和）
- [game-config.p3-haitei-tsumo.json](/Users/liuhang/Documents/acezero/majiang/test/game-config.p3-haitei-tsumo.json)
  用途：海底摸月
- [game-config.p3-houtei-ron.json](/Users/liuhang/Documents/acezero/majiang/test/game-config.p3-houtei-ron.json)
  用途：河底捞鱼
- [game-config.p3-tenhou.json](/Users/liuhang/Documents/acezero/majiang/test/game-config.p3-tenhou.json)
  用途：天和
- [game-config.p3-chiihou.json](/Users/liuhang/Documents/acezero/majiang/test/game-config.p3-chiihou.json)
  用途：地和
- [game-config.p3-nine-kinds.json](/Users/liuhang/Documents/acezero/majiang/test/game-config.p3-nine-kinds.json)
  用途：九种九牌
- [game-config.p3-exhaustive-draw.json](/Users/liuhang/Documents/acezero/majiang/test/game-config.p3-exhaustive-draw.json)
  用途：荒牌平局
- [game-config.p4-furiten-discard.json](/Users/liuhang/Documents/acezero/majiang/test/game-config.p4-furiten-discard.json)
  用途：舍张振听
- [game-config.p4-furiten-pass-ron.json](/Users/liuhang/Documents/acezero/majiang/test/game-config.p4-furiten-pass-ron.json)
  用途：过和振听
- [game-config.p4-furiten-clear-after-discard.json](/Users/liuhang/Documents/acezero/majiang/test/game-config.p4-furiten-clear-after-discard.json)
  用途：非立直振听解除
- [game-config.p4-furiten-riichi-lock.json](/Users/liuhang/Documents/acezero/majiang/test/game-config.p4-furiten-riichi-lock.json)
  用途：立直后振听锁定
- [game-config.p5-four-riichi.json](/Users/liuhang/Documents/acezero/majiang/test/game-config.p5-four-riichi.json)
  用途：四家立直
- [game-config.p5-four-kan-draw.json](/Users/liuhang/Documents/acezero/majiang/test/game-config.p5-four-kan-draw.json)
  用途：四杠散了
- [game-config.p5-four-wind.json](/Users/liuhang/Documents/acezero/majiang/test/game-config.p5-four-wind.json)
  用途：四风连打
- [game-config.p5-triple-ron.json](/Users/liuhang/Documents/acezero/majiang/test/game-config.p5-triple-ron.json)
  用途：三家和
- [game-config.p5-double-ron.json](/Users/liuhang/Documents/acezero/majiang/test/game-config.p5-double-ron.json)
  用途：一炮双响 / 多响收束
- [game-config.p5-riichi-discard-ron.json](/Users/liuhang/Documents/acezero/majiang/test/game-config.p5-riichi-discard-ron.json)
  用途：立直宣言牌被荣和时，不应提前入立直棒
- [game-config.p6-daisangen-pao.json](/Users/liuhang/Documents/acezero/majiang/test/game-config.p6-daisangen-pao.json)
  用途：大三元包牌
- [game-config.p6-daisuushi-pao.json](/Users/liuhang/Documents/acezero/majiang/test/game-config.p6-daisuushi-pao.json)
  用途：大四喜包牌
- [game-config.browser-smoke-all-pass-bottom-draw.json](/Users/liuhang/Documents/acezero/majiang/test/game-config.browser-smoke-all-pass-bottom-draw.json)
  用途：浏览器 smoke，覆盖 `all-pass -> bottom draw`
- [game-config.browser-smoke-exhaustive-no-daopai.json](/Users/liuhang/Documents/acezero/majiang/test/game-config.browser-smoke-exhaustive-no-daopai.json)
  用途：浏览器 smoke，覆盖 `await_resolution -> bottom no-daopai -> round:draw`
- [game-config.browser-manual-riichi-ron.json](/Users/liuhang/Documents/acezero/majiang/test/game-config.browser-manual-riichi-ron.json)
  用途：浏览器手动路径，底家首巡手动立直，三家正常 AI 推进后荣和

## Commands

### Run All Retained P3 Regressions

```bash
node /Users/liuhang/Documents/acezero/majiang/scripts/validate-p3-scenarios.js
```

### Run Furiten Regressions

```bash
node /Users/liuhang/Documents/acezero/majiang/scripts/validate-furiten-scenarios.js
```

### Run P5 Special Draw Regressions

```bash
node /Users/liuhang/Documents/acezero/majiang/scripts/validate-p5-scenarios.js
```

### Run Phase 1 API / Timing Regressions

```bash
node /Users/liuhang/Documents/acezero/majiang/scripts/validate-phase1-scenarios.js
```

### Run P2 Wall Regression

```bash
node /Users/liuhang/Documents/acezero/majiang/scripts/validate-p2-wall.js
```

### Run P2 Heads-Up Settlement Regression

```bash
node /Users/liuhang/Documents/acezero/majiang/scripts/validate-p2-heads-up-scoring.js
```

### Run P2 East-South Regression

```bash
node /Users/liuhang/Documents/acezero/majiang/scripts/validate-p2-east-south.js
```

### Run P2 Wind Yaku Regression

```bash
node /Users/liuhang/Documents/acezero/majiang/scripts/validate-p2-wind-yaku.js
```

### Run West Entry Target Score Regression

```bash
node /Users/liuhang/Documents/acezero/majiang/scripts/validate-west-entry-target-score.js
```

### Run Friendly JSON Rules Regression

```bash
node /Users/liuhang/Documents/acezero/majiang/scripts/validate-friendly-json-rules.js
```

### Run Shibari Regression

```bash
node /Users/liuhang/Documents/acezero/majiang/scripts/validate-shibari-rules.js
```

### Run Easy AI Smoke

```bash
node /Users/liuhang/Documents/acezero/majiang/scripts/validate-easy-ai.js
```

### Run Easy AI Call Execution Smoke

```bash
node /Users/liuhang/Documents/acezero/majiang/scripts/validate-easy-ai-call-execution.js
```

用途：

- 验证 `easy` 的 `chi / peng` 不只是“选出来”，而是真的能 dispatch 到 runtime
- 验证副露后 `right` 座位 `_fulou` 已写入对应 `meldString`
- 验证副露后轮次回到副露者，phase 进入 `await_discard`

### Run Mjai Bridge Smoke

```bash
node /Users/liuhang/Documents/acezero/majiang/scripts/validate-mjai-bridge.js
```

用途：

- 验证 `start_game / start_kyoku / tsumo / dahai / chi` 的 `majiang -> mjai` 编码
- 验证 `pon / reach / hora / ryukyoku` 的本地协议编解码
- 验证 `daiminkan / kakan / ankan / dora` 的本地协议编解码
- 验证视角遮罩是否只暴露当前 coach seat 的手牌
- 验证最小 Mortal smoke 模型能返回 `mjai` 动作并被解码回本地 runtime action
- 验证 `coach-controller` 能从 runtime `eventLog` 增量同步并请求建议
- 验证 `coach-controller` 会产出统一的 `suggestion state`，而不只是原始 Mortal 输出

### Run Session Runtime End Event Smoke

```bash
node /Users/liuhang/Documents/acezero/majiang/scripts/validate-session-runtime-end-events.js
```

用途：

- 验证 `browser-game-session-runtime` 会记录自己的 `eventLog / lastEvent`
- 验证子 runtime 的 `round:end` 会被转发到 session runtime 事件流
- 验证 match 结束时 session runtime 会发出 `session:finished`
- 验证 `round:end -> end_kyoku`、`session:finished -> end_game` 的 `mjai` 边界编码
- 验证 session-aware `coach-controller` 会在整场首局发出 `start_game + start_kyoku`，并在终局补上 `end_kyoku + end_game`
- 验证非终局继续时，session-aware `coach-controller` 会自动补下一局 `start_kyoku`

### Run Runtime Bridge Coach State Smoke

```bash
node /Users/liuhang/Documents/acezero/majiang/scripts/validate-runtime-bridge-coach-state.js
node /Users/liuhang/Documents/acezero/majiang/scripts/validate-runtime-bridge-analysis-state.js
node /Users/liuhang/Documents/acezero/majiang/scripts/validate-runtime-bridge-live-analysis.js
node /Users/liuhang/Documents/acezero/majiang/scripts/validate-coach-provider-server.js
node /Users/liuhang/Documents/acezero/majiang/scripts/validate-ai-benchmark.js
node /Users/liuhang/Documents/acezero/majiang/scripts/validate-ai-benchmark-report.js
```

用途：

- 验证 `runtime-bridge.js` 暴露 `get/set/clear/subscribeCoachState`
- 验证 `runtime-bridge.js` 暴露 `setCoachSuggestion` 作为 suggestion 别名入口

- `node /Users/liuhang/Documents/acezero/majiang/scripts/validate-ai-benchmark.js`
  - PASS `ai-benchmark-smoke`
  - 验证第一版“局面级基准 + 建议分歧分析” runner 能跑通
  - 验证固定 discard 场景能同时拿到本地 `easy` 决策、`Mortal` 建议和分歧分类

- `node /Users/liuhang/Documents/acezero/majiang/scripts/validate-ai-benchmark-report.js`
  - PASS `ai-benchmark-report-smoke`
  - 验证 benchmark rows 能聚合成 subject 级分析 report
  - 验证 `Mortal` 率、善手 / 中性手 / 恶手分桶可直接提供给前端 UI
- `node /Users/liuhang/Documents/acezero/majiang/scripts/validate-runtime-bridge-analysis-state.js`
  - PASS `runtime-bridge-analysis-state-smoke`
  - 验证 bridge 暴露独立 analysis state 协议，并能同步到 table 和浏览器事件
- `node /Users/liuhang/Documents/acezero/majiang/scripts/validate-runtime-bridge-live-analysis.js`
  - PASS `runtime-bridge-live-analysis-smoke`
  - 验证 bridge 在收到 coach 建议后，会在真实动作发生时自动累计 live analysis row
  - 验证累计结果会自动回写 `coachAnalysisState.report`，并产出 `overview / rounds / subjects`
- `node /Users/liuhang/Documents/acezero/majiang/scripts/validate-coach-provider-server.js`
  - PASS `coach-provider-server-smoke`
  - 验证本地 coach HTTP 服务可以接收当前局面 payload，并返回 Mortal 建议
- 验证 bridge 会把 `coachState` 同步到 `window.AceMahjongCoachState`
- 验证 bridge 会调用 table 侧预留的 `setCoachState`
- 验证 bridge 会把 coach 状态同步到 debug panel 的 coach status 行
- 验证 bridge 会派发 `ace-mahjong-coach-state` 浏览器事件

### Run Table Renderer Analysis Card Smoke

```bash
node /Users/liuhang/Documents/acezero/majiang/scripts/validate-table-renderer-coach-card.js
node /Users/liuhang/Documents/acezero/majiang/scripts/validate-table-renderer-analysis-card.js
```

用途：

- 验证正式 coach 卡片会随 `coachState` 渲染状态、摘要、推荐动作，并在清空后回到 idle
- 验证独立 analysis 版块会渲染 Mortal 率、善手恶手聚合和重点分歧信息

当前 `easy v1` 基线覆盖：

- `easy-ai-current-turn-smoke`
  用途：验证当前回合真实弃牌闭环
- `easy-ai-riichi-smoke`
  用途：验证基础立直判断与 runtime 写入
- `easy-ai-ukeire-smoke`
  用途：验证基础牌效中的 `ukeireCount` tie-break
- `easy-ai-defense-smoke`
  用途：验证立直压力下的现物优先
- `easy-ai-shape-smoke`
  用途：验证基础手型偏好
- `easy-ai-call-smoke`
  用途：验证“明确降向听”的 `chi` 副露判断
- `easy-ai-yakuhai-call-smoke`
  用途：验证基础役牌 `peng` 判断
- `easy-ai-speedup-call-smoke`
  用途：验证“平向听但明显提速”的 `chi` 判断

说明：

- 这组 smoke 构成当前四麻 `easy v1` 的正式验收基线
- `easy` 后续只应修 bug 和补测试，不再继续扩张能力边界
- 更强 AI 的开发目标应转入 `normal / hard / hell`

### Run P6 Pao Regressions

```bash
node /Users/liuhang/Documents/acezero/majiang/scripts/validate-p6-pao-scenarios.js
```

### Run Sanma Tsumo-Loss Regression

```bash
node /Users/liuhang/Documents/acezero/majiang/scripts/validate-sanma-tsumo-loss.js
```

### Run Sanma Settlement View Regression

```bash
node /Users/liuhang/Documents/acezero/majiang/scripts/validate-sanma-settlement-view.js
```

### Run Sanma Dora Indicator Regression

```bash
node /Users/liuhang/Documents/acezero/majiang/scripts/validate-sanma-dora-indicators.js
```

### Run Sanma Dead Wall Regression

```bash
node /Users/liuhang/Documents/acezero/majiang/scripts/validate-sanma-dead-wall.js
```

### Run Sanma Kita Gating Regression

```bash
node /Users/liuhang/Documents/acezero/majiang/scripts/validate-sanma-kita-gating.js
```

### Run One Scenario

```bash
node /Users/liuhang/Documents/acezero/majiang/scripts/validate-p3-scenarios.js /Users/liuhang/Documents/acezero/majiang/test/game-config.p3-tenhou.json
```

### Run All Furiten Regressions

```bash
node /Users/liuhang/Documents/acezero/majiang/scripts/validate-furiten-scenarios.js
```

### Run One Furiten Scenario

```bash
node /Users/liuhang/Documents/acezero/majiang/scripts/validate-furiten-scenarios.js /Users/liuhang/Documents/acezero/majiang/test/game-config.p4-furiten-pass-ron.json
```

### Browser Manual Check

```text
http://127.0.0.1:5500/majiang/index.html?config=/majiang/game-config.qianggang-setup.json
http://127.0.0.1:5500/majiang/index.html?config=/majiang/test/game-config.p5-four-riichi.json
http://127.0.0.1:5500/majiang/index.html?config=/majiang/test/game-config.p5-four-kan-draw.json
http://127.0.0.1:5500/majiang/index.html?config=/majiang/test/game-config.p5-four-wind.json
http://127.0.0.1:5500/majiang/index.html?config=/majiang/test/game-config.p5-triple-ron.json
http://127.0.0.1:5500/majiang/index.html?config=/majiang/test/game-config.p5-double-ron.json
http://127.0.0.1:5500/majiang/index.html?config=/majiang/test/game-config.p6-daisangen-pao.json
http://127.0.0.1:5500/majiang/index.html?config=/majiang/test/game-config.p6-daisuushi-pao.json
http://127.0.0.1:5500/majiang/index.html?config=/majiang/test/game-config.browser-manual-riichi-ron.json
```

### Browser Smoke Check

```text
http://127.0.0.1:5500/majiang/index.html?config=/majiang/test/game-config.browser-smoke-all-pass-bottom-draw.json&smoke=all-pass-bottom-draw
http://127.0.0.1:5500/majiang/index.html?config=/majiang/test/game-config.browser-smoke-exhaustive-no-daopai.json&smoke=exhaustive-no-daopai
```

Expected result:

- 页面右下角应出现 `PASS`
- F12 控制台应出现 `[Mahjong][browser-smoke] PASS`
- trail 中应包含 `reaction-window:closed:all-pass:bottom -> tile:draw:bottom:*`
- `exhaustive-no-daopai` 场景应在 trail 中出现 `round:draw`，并显示 `reason: 荒牌平局`、`tenpaiSeats: bottom`、`dealerContinues: true`

### Browser Consistency Checklist

- `四家立直 / 四杠散了 / 四风连打 / 三家和` 的 cut-in 文案应显示对应中文标签，不应退化成通用 `流局`
- `一炮双响` 的 cut-in 应显示 `2家和了`
- 顶部 runtime 状态栏在 `一炮双响` 时应显示 `hule(bottom/right:multi)` 一类结果，而不是只显示单个赢家
- F12 日志里：
  - `round:hule` 应包含 `winnerCount / multiHule / winners`
  - `包牌` 场景应包含 `baojiaSeat / baojiaYaku`
  - `round:draw` 应包含 `reason / revealedHands`
- `四家立直` 结束后 `lizhibang` 应为 `4`

## Notes

- 目前不再保留 P2 内置样例。
- 目前不再保留各类一次性 `focus` 样例。
- 抢杠和手动验证统一使用 `game-config.qianggang-setup.json`。
- P3 与振听专项样例当前都位于 `test/` 目录。
- 涉及和牌算分的回归，默认应同时固定 `testing.runtimeSetup.deadWallTiles`，并在 `expectedSnapshot` 中锁定 `scores`；多响场景额外锁定 `winners`。
- `validate-p3-scenarios.js`、`validate-p5-scenarios.js`、`validate-p6-pao-scenarios.js` 已共用 `scripts/lib/round-result-assertions.js`，新样例优先沿用这套字段。
- Phase 1 当前额外保留两条专项回归：
  - `game-config.p5-riichi-discard-ron.json`：锁 `lizhibang` 提交时机
  - `validate-phase1-scenarios.js` 中的 `fourth-kan-candidate-gating`：锁 `get_gang_mianzi(..., n_gang)` 接线
- 浏览器 smoke 目前采用 `query param + 页面内自检脚本`，不依赖 Playwright/Puppeteer。
- `node /Users/liuhang/Documents/acezero/majiang/scripts/validate-table-renderer-coach-card.js`
  - PASS `table-renderer-coach-card-smoke`
  - 验证正式 coach 卡片会随 `coachState` 渲染状态、摘要、推荐动作，并在清空后回到 idle
