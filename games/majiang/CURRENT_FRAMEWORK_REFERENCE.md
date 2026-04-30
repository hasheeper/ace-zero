# Current Framework Reference

## Purpose

This document describes the codebase as it exists now.

It answers three questions:

1. what the current runtime chain is
2. which directory owns which responsibility
3. where future extension work should plug in

It is the current code-truth reference for the Mahjong stack.

---

## Current Snapshot

The project has already moved past the old browser-only prototype stage and should no longer be described as only a table workbench.

Current shape:

- one canonical browser entry at [`/Users/liuhang/Documents/acezero/majiang/index.html`](/Users/liuhang/Documents/acezero/majiang/index.html)
- one script bootstrap at [`/Users/liuhang/Documents/acezero/majiang/frontend/scripts/app-entry.js`](/Users/liuhang/Documents/acezero/majiang/frontend/scripts/app-entry.js)
- one round-truth runtime at [`/Users/liuhang/Documents/acezero/majiang/engine/runtime/single-round-runtime.js`](/Users/liuhang/Documents/acezero/majiang/engine/runtime/single-round-runtime.js)
- one shared helper layer under [`/Users/liuhang/Documents/acezero/majiang/shared/runtime`](/Users/liuhang/Documents/acezero/majiang/shared/runtime)
- one browser session runtime at [`/Users/liuhang/Documents/acezero/majiang/frontend/scripts/runtime/session/game-session-runtime.js`](/Users/liuhang/Documents/acezero/majiang/frontend/scripts/runtime/session/game-session-runtime.js)
- one coach / review integration stack under [`/Users/liuhang/Documents/acezero/majiang/engine/coach`](/Users/liuhang/Documents/acezero/majiang/engine/coach)

Main current status:

- single-round flow is mature and remains the core rules executor
- browser table flow is usable and is backed by shared/runtime + engine/runtime truth
- browser session / multi-round runtime is implemented and exercised by validation scripts
- AI / coach / review plumbing is present in both engine and browser bridge layers
- key special-case regressions are retained

Practical conclusion:

- `majiang` is now best described as a Mahjong engine project with a browser workbench/front-end
- the front-end still looks like a workbench, but the repo is not only UI scaffolding anymore

---

## Directory Truth

### `shared/core/`

Current role:

- normalize rule/session adapter behavior
- host cross-round adapter helpers
- keep `majiang-core` integration out of browser UI code

Key files:

- [`/Users/liuhang/Documents/acezero/majiang/shared/core/adapter-factory.js`](/Users/liuhang/Documents/acezero/majiang/shared/core/adapter-factory.js)
- [`/Users/liuhang/Documents/acezero/majiang/shared/core/session-adapter.js`](/Users/liuhang/Documents/acezero/majiang/shared/core/session-adapter.js)

### `shared/match/`

Current role:

- match/session state modeling
- round transition object shaping
- next-round config construction support

Key files:

- [`/Users/liuhang/Documents/acezero/majiang/shared/match/match-state.js`](/Users/liuhang/Documents/acezero/majiang/shared/match/match-state.js)
- [`/Users/liuhang/Documents/acezero/majiang/shared/match/round-transition.js`](/Users/liuhang/Documents/acezero/majiang/shared/match/round-transition.js)

### `shared/runtime/`

Current role:

- host reusable single-round helpers for both Node/runtime and browser composition

Current substructure:

- `state/`: draw/round/seat shaping
- `reaction/`: reaction candidates, priority, flow, post-reaction helpers
- `scoring/`: hule gate, settlement, round-result helpers
- `rules/`: furiten, riichi flow, kan, rule helpers
- `support/`: testing setup and view support

Useful entry references:

- [`/Users/liuhang/Documents/acezero/majiang/shared/runtime/README.md`](/Users/liuhang/Documents/acezero/majiang/shared/runtime/README.md)
- [`/Users/liuhang/Documents/acezero/majiang/shared/runtime/state/seat-status.js`](/Users/liuhang/Documents/acezero/majiang/shared/runtime/state/seat-status.js)
- [`/Users/liuhang/Documents/acezero/majiang/shared/runtime/rules/furiten.js`](/Users/liuhang/Documents/acezero/majiang/shared/runtime/rules/furiten.js)
- [`/Users/liuhang/Documents/acezero/majiang/shared/runtime/scoring/settlement.js`](/Users/liuhang/Documents/acezero/majiang/shared/runtime/scoring/settlement.js)

### `engine/base/`

Current role:

- wrap `majiang-core`
- manage wall/service behavior
- shape frontend-facing views and tile conversions

Key files:

- [`/Users/liuhang/Documents/acezero/majiang/engine/base/majiang-core-adapter.js`](/Users/liuhang/Documents/acezero/majiang/engine/base/majiang-core-adapter.js)
- [`/Users/liuhang/Documents/acezero/majiang/engine/base/wall-service.js`](/Users/liuhang/Documents/acezero/majiang/engine/base/wall-service.js)
- [`/Users/liuhang/Documents/acezero/majiang/engine/base/view-builder.js`](/Users/liuhang/Documents/acezero/majiang/engine/base/view-builder.js)

### `engine/runtime/`

Current role:

- own round-truth state and transitions
- resolve actions and reactions
- produce snapshots and round results
- serve as the primary rules execution layer consumed by browser/runtime composition and validation scripts

Key files:

- [`/Users/liuhang/Documents/acezero/majiang/engine/runtime/single-round-runtime.js`](/Users/liuhang/Documents/acezero/majiang/engine/runtime/single-round-runtime.js)
- [`/Users/liuhang/Documents/acezero/majiang/engine/runtime/action-resolver.js`](/Users/liuhang/Documents/acezero/majiang/engine/runtime/action-resolver.js)
- [`/Users/liuhang/Documents/acezero/majiang/engine/runtime/snapshot-builder.js`](/Users/liuhang/Documents/acezero/majiang/engine/runtime/snapshot-builder.js)
- [`/Users/liuhang/Documents/acezero/majiang/engine/runtime/round-result-builder.js`](/Users/liuhang/Documents/acezero/majiang/engine/runtime/round-result-builder.js)

### `engine/extensions/`

Current role:

- extension bus and hook contracts
- future injection surface for special rules, skills, and round events

Reference:

- [`/Users/liuhang/Documents/acezero/majiang/engine/extensions/extensions.md`](/Users/liuhang/Documents/acezero/majiang/engine/extensions/extensions.md)

### `frontend/scripts/runtime/`

Current role:

- browser-only composition, mount, and session orchestration layer

Current substructure:

- `formal/`: browser runtime assembly and factories
- `bridge/`: mount/bootstrap/smoke support
- `session/`: browser game-session runtime

Reference:

- [`/Users/liuhang/Documents/acezero/majiang/frontend/scripts/runtime/README.md`](/Users/liuhang/Documents/acezero/majiang/frontend/scripts/runtime/README.md)

### `frontend/scripts/ui/`

Current role:

- browser rendering
- animation and panel updates
- human interaction
- settlement display

### `engine/coach/`

Current role:

- mjai bridge and masking
- coach provider integration
- review / suggestion formatting and explanation

Key areas:

- [`/Users/liuhang/Documents/acezero/majiang/engine/coach/mjai`](/Users/liuhang/Documents/acezero/majiang/engine/coach/mjai)
- [`/Users/liuhang/Documents/acezero/majiang/engine/coach/review`](/Users/liuhang/Documents/acezero/majiang/engine/coach/review)
- [`/Users/liuhang/Documents/acezero/majiang/engine/coach/mortal/mortal-adapter.js`](/Users/liuhang/Documents/acezero/majiang/engine/coach/mortal/mortal-adapter.js)

---

## Runtime Chains

### Single-round chain

`SingleRoundRuntime`
-> base services
-> action/reaction resolution
-> round-result + snapshot building
-> browser bridge
-> UI

### Session chain

`game-session-runtime`
-> `shared/match/round-transition`
-> next round config
-> new `SingleRoundRuntime`

### Browser bootstrap chain

`frontend/scripts/app-entry.js`
-> shared/core
-> shared/runtime
-> engine/base + engine/runtime
-> browser formal runtime
-> browser session runtime
-> runtime bridge
-> UI

---

## Active Extension Surfaces

Current project-level extension direction is:

- keep core round truth in engine/shared
- inject special behavior through extension hooks instead of UI patches
- keep browser runtime thin

Current useful extension-adjacent surfaces include:

- engine extension manager/hooks
- wall/draw policy hooks
- shared round-transition helpers
- browser/session runtime checkpoints
- coach/review integration checkpoints in browser/runtime bridge

---

## What This Document Should Not Do

This file should not become:

- a dated progress report
- a phase checklist
- a line-by-line file inventory

If a section starts aging quickly, move that material to `docs/archive/` or to a more specific operational doc.
