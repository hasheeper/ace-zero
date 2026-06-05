# Mahjong Docs Guide

中文摘要：

- 当前麻将目录的实际代码结构与能力，以 [`../CURRENT_FRAMEWORK_REFERENCE.md`](../CURRENT_FRAMEWORK_REFERENCE.md) 为准。
- `majiang` 现在不是只有前端工作台，而是“麻将引擎 + 浏览器工作台前端 + session/runtime + coach/review 配套”。

## Current Categories

### Current truth

These should stay aligned with the codebase and be kept short:

- [`../CURRENT_FRAMEWORK_REFERENCE.md`](../CURRENT_FRAMEWORK_REFERENCE.md)
- [`AI_CURRENT_STATUS_AND_ROADMAP.md`](AI_CURRENT_STATUS_AND_ROADMAP.md)
- [`AI_BASELINE_STATUS.md`](AI_BASELINE_STATUS.md)
- [`HARD_AI_VARIANTS_V1_V2_V3.md`](HARD_AI_VARIANTS_V1_V2_V3.md)

### Long-term design

These describe direction and constraints rather than current file layout:

- [`AI_PLAN.md`](AI_PLAN.md)
- [`FUTURE_DEVELOPMENT_REFERENCE.md`](FUTURE_DEVELOPMENT_REFERENCE.md)
- [`FUTURE_PROOFING.md`](FUTURE_PROOFING.md)
- [`MULTI_ROUND_AND_SETTLEMENT_PLAN.md`](MULTI_ROUND_AND_SETTLEMENT_PLAN.md)

### Operational docs

These are the day-to-day references for running and understanding the project:

- [`../test/TESTS.md`](../test/TESTS.md)
- [`../TEST_SCENARIO_GUIDE.md`](../TEST_SCENARIO_GUIDE.md)
- [`AI_BENCHMARK_PLAN.md`](AI_BENCHMARK_PLAN.md)
- [`AI_ANALYSIS_UI_PLAN.md`](AI_ANALYSIS_UI_PLAN.md)
- [`../frontend/scripts/runtime/README.md`](../frontend/scripts/runtime/README.md)
- [`../shared/runtime/README.md`](../shared/runtime/README.md)
- [`../engine/extensions/extensions.md`](../engine/extensions/extensions.md)

### Cleanup Rule

Rule of thumb:

- if a doc is dated and stops being true after refactors, consolidate the still-useful facts into a current doc and delete the stale note
- if a doc explains a stable boundary or workflow, keep it near the root

Current layout rule:

- root Markdown files should mostly be current-truth docs
- stale phase logs should be consolidated into a current doc and removed
