# Mahjong AI Baseline Status

Last updated: 2026-06-05

This is the short current-status entry point for the built-in Mahjong AI. Historical H12-H19 research notes have been consolidated into this file and the hard variant reference.

## Current Verdict

基础 AI 主线已经接近阶段性收口，可以进入“稳定维护 + 小步验证”的状态。

当前已经具备：

- `easy`：可用的新手/低强度 AI，覆盖弃牌、立直、吃碰、基础防守、低频杠。
- `normal`：可用的普通 AI，相比 easy 有更稳的立直、防守和副露选择。
- `hard-standard`：当前主力标准模型，来自原 `hard-balanced` 晋升线，是默认强度基线候选。
- `hard-closed-defense`：当前主力特化模型，低副露、高立直、门清防御型，来自原 `hard-defensive-dev`。
- `hard-value-classic`：特殊打点/门清路线对照，来自原 `hard-heavy`。
- `alphajong-core`：外来传统算法对照，可参与 arena，但不是内置 hard 主线。

不建议继续在基础 AI 主线上大幅堆规则。后续收益更适合来自：

- 更稳定的 arena 大样本确认。
- 前端真实对局兼容验证。
- Mortal/AlphaJong 离线对照诊断。
- 针对明显 bug 的局部修复。

## Naming

Use canonical IDs in new commands and config:

| Role | Canonical ID | Legacy Alias |
| --- | --- | --- |
| 主力门清防御 | `hard-closed-defense` | `hard-defensive-dev` |
| 主力标准均衡 | `hard-standard` | `hard-balanced` |
| 特殊经典打点 | `hard-value-classic` | `hard-heavy` |
| 历史 tuned v2 | `hard-tuned-v2` | `hard-defensive`, `hard-tuned` |
| 历史 pure v1 | `hard-pure-v1` | `hard-aggressive`, `hard-pure` |

Legacy names are kept for old reports and old commands. New docs and configs should use canonical IDs.

## What Is Done

- Built-in AI has a shared controller path for discard, reaction, and self-turn kan decisions.
- Easy/normal/hard policies carry separate kan thresholds.
- Hard variant policy creation is centralized in `hard-variants.js`.
- Arena and Mortal benchmark variant parsing share the same hard variant presets.
- Frontend default AI lineup uses canonical hard variants.
- Reaction priority handling has smoke coverage for blocked higher-priority reactions.
- Hard diagnostics cover route review, defensive state, threat profile, deal-in attribution, safety gate, call gate, and kan metrics.

## What Is Not Done

- `hell` is still not a stable AI.
- Sanma and two-player AI are not stable deliverables.
- Kita is intentionally not implemented for built-in AI yet.
- Mortal and AlphaJong are not runtime decision engines for the built-in hard family.
- Role/personality supernatural skill AI is still outside the current baseline.

## Maintenance Rules

- Do not add new long-lived hard personality names unless they have a distinct mechanism and scout data.
- Do not reuse legacy aliases for new experiments.
- Put new hard tuning behind `hard-standard-dev`, `hard-experimental`, or a clearly named candidate.
- Keep future current-status notes short; do not reintroduce long phase logs unless they are actively maintained.
- Treat `AI_CURRENT_STATUS_AND_ROADMAP.md`, `AI_BASELINE_STATUS.md`, and `HARD_AI_VARIANTS_V1_V2_V3.md` as the current AI documentation entry points.

## Recommended Checks

```bash
node games/majiang/scripts/validate-hard-ai.js
node games/majiang/scripts/validate-ai-hanchan-arena.js
node games/majiang/scripts/validate-hard-vs-mortal-benchmark.js
node games/majiang/scripts/validate-easy-ai-call-execution.js
node scripts/validate.mjs quick
git diff --check
```
