# Mahjong AI Current Status and Roadmap

Last reviewed: 2026-06-05

This is the short current-status note for the built-in Mahjong AI stack. Old hard-AI phase logs have been consolidated into the current baseline and variant references.

## Current Verdict

基础 AI 已经接近阶段性收口。现在更适合进入稳定维护、小步验证和真实前端对局兼容检查，而不是继续大幅堆规则。

当前主线可用：

- `easy`：新手/低强度 AI，支持弃牌、立直、吃碰、基础防守和低频杠。
- `normal`：普通强度 AI，在 easy 上加强立直、防守、副露和杠选择。
- `hard-standard`：当前主力标准模型，来自原 `hard-balanced` 晋升线。
- `hard-closed-defense`：当前主力特化模型，门清防御、低副露、高低压立直反击。
- `hard-value-classic`：经典打点/门清路线对照，来自原 `hard-heavy`。
- `alphajong-core`：外来传统算法对照，可参与 arena，不作为内置 hard 主线。

旧 hard 名称仍然兼容，但新配置、新文档和新 benchmark 命令应优先使用 canonical ID。详见 `HARD_AI_VARIANTS_V1_V2_V3.md`。

## What Is Stable Enough

- 四人 ordinary Mahjong 的 easy/normal/hard 基础链路已经可用。
- AI controller 已覆盖弃牌、反应、立直、副露和自家回合杠决策。
- 前端 formal runtime 已接入 AI self-kan 流程，并保留玩家手动杠 UI。
- Arena/Mortal benchmark 解析 hard canonical ID 和 legacy alias。
- Hard 诊断已经覆盖 route review、threat profile、deal-in attribution、safety gate、call gate、kan metrics。

## What Is Not Stable Yet

- `hell` 仍不是稳定 AI。
- Sanma、两人麻将和 Kita 不在当前完成范围。
- Mortal/AlphaJong 只用于离线诊断或外部对照，不是 hard family runtime 决策器。
- 角色技能、精神影响、超自然人格 AI 仍属于后续系统。

## Current Maintenance Direction

1. 先用 1000 局以上 arena 确认 `hard-closed-defense`、`hard-standard`、`hard-value-classic` 的长期排序。
2. 前端真实对局优先查动作流 bug：反应优先级、杠后岭上摸牌、鸣牌后弃牌、流局听牌。
3. 只对明显 bug 或清晰诊断项做局部修复。
4. 不再新增 hard personality 名称，除非有独立机制和 scout 数据。
5. 新实验优先放进 `hard-standard-dev` 或 `hard-experimental`，通过 scout 后再考虑晋升。

## Recommended Checks

```bash
node games/majiang/scripts/validate-easy-ai-call-execution.js
node games/majiang/scripts/validate-hard-ai.js
node games/majiang/scripts/validate-ai-hanchan-arena.js
node games/majiang/scripts/validate-hard-vs-mortal-benchmark.js
node scripts/validate.mjs quick
git diff --check
```
