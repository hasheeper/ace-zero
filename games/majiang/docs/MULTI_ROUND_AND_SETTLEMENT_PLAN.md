# Mahjong Multi-Round And Settlement Roadmap

## Purpose

This document tracks the long-lived roadmap for moving from a strong single-round product to a real multi-round match flow.

It is not a dated regression log.

---

## Current Baseline

Already in place:

- single-round runtime truth in [`/Users/liuhang/Documents/acezero/majiang/engine/runtime/single-round-runtime.js`](/Users/liuhang/Documents/acezero/majiang/engine/runtime/single-round-runtime.js)
- browser table entry at [`/Users/liuhang/Documents/acezero/majiang/index.html`](/Users/liuhang/Documents/acezero/majiang/index.html)
- session/match support in [`/Users/liuhang/Documents/acezero/majiang/shared/match`](/Users/liuhang/Documents/acezero/majiang/shared/match)
- browser session runtime in [`/Users/liuhang/Documents/acezero/majiang/frontend/scripts/runtime/session/game-session-runtime.js`](/Users/liuhang/Documents/acezero/majiang/frontend/scripts/runtime/session/game-session-runtime.js)
- retained round-end/scoring regressions in [`/Users/liuhang/Documents/acezero/majiang/test/TESTS.md`](/Users/liuhang/Documents/acezero/majiang/test/TESTS.md)

Not yet fully productized:

- round-to-round settlement UX
- full East/South match progression
- final match summary panel
- richer browser regression coverage for session flow

---

## Product Goal

Recommended rollout:

1. stable East-only match flow
2. configurable East/South game length
3. full match-end summary

The project should avoid jumping straight to a full hanchan implementation before the round-transition and settlement surfaces are fully stable.

---

## Required Capabilities

### Match state

Need a single stable container for:

- dealer rotation
- round wind / hand count
- honba
- riichi sticks
- cumulative scores
- match-end detection

Primary home:

- [`/Users/liuhang/Documents/acezero/majiang/shared/match/match-state.js`](/Users/liuhang/Documents/acezero/majiang/shared/match/match-state.js)

### Transition policy

Need deterministic round transition logic for:

- dealer repeat
- exhaustive draw continuation rules
- match-end checks
- next-round config building

Primary home:

- [`/Users/liuhang/Documents/acezero/majiang/shared/match/round-transition.js`](/Users/liuhang/Documents/acezero/majiang/shared/match/round-transition.js)

### Settlement presentation

Need a browser-visible settlement flow that cleanly separates:

- round-end result data
- score delta display
- continue/next-round action
- final match-end presentation

This should stay UI-driven, but must consume canonical round result data from the runtime chain.

### Session runtime stability

Browser session flow should own:

- mount next round
- preserve match state between rounds
- emit `session:finished`
- decide when to show next-round vs match-end UI

Primary home:

- [`/Users/liuhang/Documents/acezero/majiang/frontend/scripts/runtime/session/game-session-runtime.js`](/Users/liuhang/Documents/acezero/majiang/frontend/scripts/runtime/session/game-session-runtime.js)

---

## Recommended Work Order

### Phase A

Stabilize match-state and transition payloads.

Success condition:

- one round-end result can deterministically produce the next-round config or a match-end decision

### Phase B

Upgrade the settlement panel into a round-to-round transition UI.

Success condition:

- after a round ends, the browser can show results and continue to the next round without reloading the page

### Phase C

Add East-only full game orchestration.

Success condition:

- the browser can run a complete East game from start to final summary

### Phase D

Extend to configurable East/South progression and final match summary polish.

---

## Testing Policy

For multi-round work, avoid relying on visual confidence alone.

Preferred coverage:

- deterministic transition tests in Node
- retained browser smoke scenarios for continue/next-round flow
- explicit checks for score carry-over, honba, riichi sticks, and dealer repeat

Current regression entry references remain:

- [`/Users/liuhang/Documents/acezero/majiang/test/TESTS.md`](/Users/liuhang/Documents/acezero/majiang/test/TESTS.md)
- [`/Users/liuhang/Documents/acezero/majiang/TEST_SCENARIO_GUIDE.md`](/Users/liuhang/Documents/acezero/majiang/TEST_SCENARIO_GUIDE.md)
