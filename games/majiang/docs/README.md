# Mahjong Docs Guide

中文摘要：

- 当前麻将目录的实际代码结构与能力，以 [`/Users/liuhang/Documents/acezero/majiang/CURRENT_FRAMEWORK_REFERENCE.md`](/Users/liuhang/Documents/acezero/majiang/CURRENT_FRAMEWORK_REFERENCE.md) 为准。
- `majiang` 现在不是只有前端工作台，而是“麻将引擎 + 浏览器工作台前端 + session/runtime + coach/review 配套”。

## Current Categories

### Current truth

These should stay aligned with the codebase and be kept short:

- [`/Users/liuhang/Documents/acezero/majiang/CURRENT_FRAMEWORK_REFERENCE.md`](/Users/liuhang/Documents/acezero/majiang/CURRENT_FRAMEWORK_REFERENCE.md)

### Long-term design

These describe direction and constraints rather than current file layout:

- [`/Users/liuhang/Documents/acezero/majiang/docs/AI_PLAN.md`](/Users/liuhang/Documents/acezero/majiang/docs/AI_PLAN.md)
- [`/Users/liuhang/Documents/acezero/majiang/docs/FUTURE_DEVELOPMENT_REFERENCE.md`](/Users/liuhang/Documents/acezero/majiang/docs/FUTURE_DEVELOPMENT_REFERENCE.md)
- [`/Users/liuhang/Documents/acezero/majiang/docs/FUTURE_PROOFING.md`](/Users/liuhang/Documents/acezero/majiang/docs/FUTURE_PROOFING.md)
- [`/Users/liuhang/Documents/acezero/majiang/docs/MULTI_ROUND_AND_SETTLEMENT_PLAN.md`](/Users/liuhang/Documents/acezero/majiang/docs/MULTI_ROUND_AND_SETTLEMENT_PLAN.md)

### Operational docs

These are the day-to-day references for running and understanding the project:

- [`/Users/liuhang/Documents/acezero/majiang/test/TESTS.md`](/Users/liuhang/Documents/acezero/majiang/test/TESTS.md)
- [`/Users/liuhang/Documents/acezero/majiang/TEST_SCENARIO_GUIDE.md`](/Users/liuhang/Documents/acezero/majiang/TEST_SCENARIO_GUIDE.md)
- [`/Users/liuhang/Documents/acezero/majiang/frontend/scripts/runtime/README.md`](/Users/liuhang/Documents/acezero/majiang/frontend/scripts/runtime/README.md)
- [`/Users/liuhang/Documents/acezero/majiang/shared/runtime/README.md`](/Users/liuhang/Documents/acezero/majiang/shared/runtime/README.md)
- [`/Users/liuhang/Documents/acezero/majiang/engine/extensions/extensions.md`](/Users/liuhang/Documents/acezero/majiang/engine/extensions/extensions.md)

### Archive

Completed phase docs and stale status snapshots move to:

- [`/Users/liuhang/Documents/acezero/majiang/docs/archive`](/Users/liuhang/Documents/acezero/majiang/docs/archive)

Rule of thumb:

- if a doc is dated and stops being true after refactors, archive it
- if a doc explains a stable boundary or workflow, keep it near the root

Current layout rule:

- root Markdown files should mostly be current-truth docs
- `docs/` should hold long-term design and archive material
