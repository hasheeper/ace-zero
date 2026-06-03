# Mahjong Docs Guide

中文摘要：

- 当前麻将目录的实际代码结构与能力，以 [`../CURRENT_FRAMEWORK_REFERENCE.md`](../CURRENT_FRAMEWORK_REFERENCE.md) 为准。
- `majiang` 现在不是只有前端工作台，而是“麻将引擎 + 浏览器工作台前端 + session/runtime + coach/review 配套”。

## Current Categories

### Current truth

These should stay aligned with the codebase and be kept short:

- [`../CURRENT_FRAMEWORK_REFERENCE.md`](../CURRENT_FRAMEWORK_REFERENCE.md)
- [`AI_CURRENT_STATUS_AND_ROADMAP.md`](AI_CURRENT_STATUS_AND_ROADMAP.md)

### Long-term design

These describe direction and constraints rather than current file layout:

- [`AI_PLAN.md`](AI_PLAN.md)
- [`HARD_AI_RESEARCH_AND_PLAN.md`](HARD_AI_RESEARCH_AND_PLAN.md)
- [`FUTURE_DEVELOPMENT_REFERENCE.md`](FUTURE_DEVELOPMENT_REFERENCE.md)
- [`FUTURE_PROOFING.md`](FUTURE_PROOFING.md)
- [`MULTI_ROUND_AND_SETTLEMENT_PLAN.md`](MULTI_ROUND_AND_SETTLEMENT_PLAN.md)

### Operational docs

These are the day-to-day references for running and understanding the project:

- [`../test/TESTS.md`](../test/TESTS.md)
- [`../TEST_SCENARIO_GUIDE.md`](../TEST_SCENARIO_GUIDE.md)
- [`HARD_AI_H14_CLEANUP_AND_ARENA_RUNBOOK.md`](HARD_AI_H14_CLEANUP_AND_ARENA_RUNBOOK.md)
- [`../frontend/scripts/runtime/README.md`](../frontend/scripts/runtime/README.md)
- [`../shared/runtime/README.md`](../shared/runtime/README.md)
- [`../engine/extensions/extensions.md`](../engine/extensions/extensions.md)

### Archive

Completed phase docs and stale status snapshots move to:

- [`archive`](archive)

Rule of thumb:

- if a doc is dated and stops being true after refactors, archive it
- if a doc explains a stable boundary or workflow, keep it near the root

Current layout rule:

- root Markdown files should mostly be current-truth docs
- `docs/` should hold long-term design and archive material
