# Mahjong Current Status Report

Date: 2026-04-04

## 1. Project Summary

`majiang` has moved beyond a browser-only demo and is now a layered riichi mahjong project built around `majiang-core`.

Current scope is:

- four-player mahjong
- single-round runtime
- browser-playable table
- formal runtime/state/snapshot pipeline
- retained regression scenarios

At this point, the project is best described as:

**single-round rule loop mostly complete, with remaining work concentrated in code-structure cleanup, UI productization, and edge-case coverage**

---

## 2. Current Functional Coverage

### 2.1 Core round flow

Implemented:

- initial deal
- draw / discard
- turn rotation
- action window generation
- reaction priority handling
- round-end settlement

Primary runtime:

- [single-round-runtime.js](/Users/liuhang/Documents/acezero/majiang/engine/runtime/single-round-runtime.js)

### 2.2 Meld / kan chain

Implemented:

- chi
- peng
- open kan
- concealed kan
- added kan
- qianggang
- rinshan draw
- dora flip after kan

### 2.3 Riichi chain

Implemented:

- riichi
- double riichi
- ippatsu
- ura-dora conditions
- riichi stick score writeback

### 2.4 Win / draw special cases

Implemented:

- haitei
- houtei
- tenhou
- chiihou
- nine kinds draw
- exhaustive draw
- four riichi abortive draw
- four winds abortive draw
- four kans abortive draw
- triple ron abortive draw
- double ron / multi-ron settlement

### 2.5 State modeling

Implemented:

- tenpai state output
- waiting tile output
- furiten state output
- same-turn furiten
- skip-ron furiten
- discard furiten
- riichi furiten lock
- kuikae discard blocking

Unified seat status output exists in runtime snapshots.

### 2.6 Pao / responsibility payment

Formally validated:

- daisangen pao
- daisuushi pao

Project-level fields now extracted:

- `baojiaSeat`
- `baojiaYaku`
- `baojiaDirection`

### 2.7 Frontend / browser capabilities

Implemented:

- playable table UI
- action window
- cut-in effects
- dora area
- runtime status bar
- debug panel
- F12 developer log
- browser config bootstrap

### 2.8 Testing assets

Retained automated regressions:

- P3: special win / draw
- P4: furiten
- P5: special abortive draw / multi-ron
- P6: pao

Test index:

- [TESTS.md](/Users/liuhang/Documents/acezero/majiang/test/TESTS.md)

---

## 3. Active Architecture

Current effective startup chain:

`game-config.json`
-> `runtime-bootstrap`
-> `browser-runtime-bridge`
-> browser runtime factory
-> runtime core
-> `engine/base`
-> `majiang-core`
-> snapshot
-> frontend UI

Relevant files:

- [runtime-bootstrap.js](/Users/liuhang/Documents/acezero/majiang/frontend/scripts/runtime/runtime-bootstrap.js)
- [browser-runtime-bridge.js](/Users/liuhang/Documents/acezero/majiang/frontend/scripts/runtime/browser-runtime-bridge.js)
- [browser-formal-runtime-factory.js](/Users/liuhang/Documents/acezero/majiang/frontend/scripts/runtime/browser-formal-runtime-factory.js)
- [browser-formal-runtime-core.js](/Users/liuhang/Documents/acezero/majiang/frontend/scripts/runtime/browser-formal-runtime-core.js)
- [majiang-core-adapter.js](/Users/liuhang/Documents/acezero/majiang/engine/base/majiang-core-adapter.js)
- [single-round-runtime.js](/Users/liuhang/Documents/acezero/majiang/engine/runtime/single-round-runtime.js)
- [app-shell.js](/Users/liuhang/Documents/acezero/majiang/frontend/scripts/ui/app-shell.js)

---

## 4. Entry Points and Runtime Paths

### 4.1 Browser entry points

Current browser pages:

- [frontend/index.html](/Users/liuhang/Documents/acezero/majiang/frontend/index.html)
- [game.html](/Users/liuhang/Documents/acezero/majiang/game.html)
- [majiang.html](/Users/liuhang/Documents/acezero/majiang/majiang.html)
- [test2.html](/Users/liuhang/Documents/acezero/majiang/test2.html)

Intended roles:

- `frontend/index.html`: formal entry
- `game.html`: dev/debug entry
- `majiang.html`: analyzer/playground page
- `test2.html`: historical prototype

### 4.2 Runtime implementations currently present

The repo currently contains three meaningful single-round runtime paths:

1. Node/formal runtime
   - [single-round-runtime.js](/Users/liuhang/Documents/acezero/majiang/engine/runtime/single-round-runtime.js)

2. Browser formal runtime
   - [browser-formal-runtime-core.js](/Users/liuhang/Documents/acezero/majiang/frontend/scripts/runtime/browser-formal-runtime-core.js)

3. Browser legacy fallback runtime
   - [browser-legacy-runtime-factory.js](/Users/liuhang/Documents/acezero/majiang/frontend/scripts/runtime/browser-legacy-runtime-factory.js)

This is the project’s largest current structural risk.

---

## 5. Code Structure Findings

### 5.1 Major duplication

The largest duplication is between:

- [single-round-runtime.js](/Users/liuhang/Documents/acezero/majiang/engine/runtime/single-round-runtime.js)
- [browser-formal-runtime-core.js](/Users/liuhang/Documents/acezero/majiang/frontend/scripts/runtime/browser-formal-runtime-core.js)

Both files contain mirrored implementations for:

- furiten tracking
- hule parameter construction
- reaction window handling
- qianggang
- rinshan / dora flip
- special abortive draws
- multi-ron settlement
- pao extraction
- snapshot-side state exposure

Impact:

- every rule fix must be patched twice
- browser/runtime divergence risk is persistent
- regression effort increases linearly with each rule addition

### 5.2 Legacy fallback still alive

`browser-runtime-bridge` still contains fallback logic into the legacy browser runtime.

Impact:

- browser behavior is not guaranteed to come from one source of truth
- debugging failures can be confusing if formal runtime creation ever regresses

### 5.3 Dual browser entry maintenance

[game.html](/Users/liuhang/Documents/acezero/majiang/game.html) and [frontend/index.html](/Users/liuhang/Documents/acezero/majiang/frontend/index.html) are mostly path-adjusted equivalents rather than separate products.

This is manageable, but still a maintenance burden.

### 5.4 Large UI shell file

[app-shell.js](/Users/liuhang/Documents/acezero/majiang/frontend/scripts/ui/app-shell.js) remains a large integration shell.

It currently mixes:

- rendering orchestration
- debug status
- cut-ins
- animations
- interaction glue
- runtime display formatting

### 5.5 Historical artifacts still present

Still retained:

- [test2.html](/Users/liuhang/Documents/acezero/majiang/test2.html)
- [majiang.html](/Users/liuhang/Documents/acezero/majiang/majiang.html)
- [majiang.js](/Users/liuhang/Documents/acezero/majiang/majiang.js)

These are not immediate bugs, but they increase ambiguity about what is still “active”.

---

## 6. File Size Snapshot

Current large files:

- `engine/runtime/single-round-runtime.js`: 2073 lines
- `frontend/scripts/runtime/browser-formal-runtime-core.js`: 2714 lines
- `frontend/scripts/runtime/browser-legacy-runtime-factory.js`: 1278 lines
- `frontend/scripts/ui/app-shell.js`: 3254 lines
- `test2.html`: 3240 lines

This supports the conclusion that the next optimization phase should focus on reducing mirrored logic and clarifying ownership.

---

## 7. Single-Round Riichi Mahjong Edge Cases Still Missing or Not Fully Closed

The project is already strong on default single-round flow, but these edge cases still deserve attention.

### 7.1 Nagashi mangan

Status:

- not formally project-integrated
- no retained scenario / validation

This is one of the clearest remaining single-round rules not yet closed.

### 7.2 Riichi-after-kan restriction edge cases

The core library supports relevant restriction levels, but project-level validation is still incomplete for:

- closed kan after riichi when shape changes
- closed kan after riichi when wait changes

These should be verified with dedicated scenarios.

### 7.3 Rule-toggle combinations

Default rules now work well, but the project has not yet systematically validated combinations such as:

- `最大同時和了数 = 1`
- `最大同時和了数 = 3`
- pao disabled
- ippatsu disabled
- abortive draws disabled

Current confidence is highest for the default rule set, not for the whole rule-switch matrix.

### 7.4 Combined edge cases

Still lacking dedicated project validation:

- qianggang + multiple ron
- pao + multi-ron interaction
- pao + visual result summary consistency
- riichi / ippatsu interactions under unusual abortive timing

### 7.5 Final result presentation

Rules are ahead of UI polish.

What still feels unfinished on the product side:

- richer end-of-round result panel
- fuller yaku breakdown presentation
- cleaner multi-ron result presentation
- cleaner pao presentation on final results

### 7.6 Non-default seat-count assumptions

This phase explicitly targets four-player mahjong.

Some code still assumes 4 seats directly, so three-player support would require a dedicated follow-up pass.

---

## 8. What Is Complete vs. What Is Still Primarily Engineering Cleanup

### Complete enough for current scope

- default 4p single-round rule loop
- chi / peng / kan / qianggang / rinshan chain
- riichi / double riichi / ippatsu
- major special win/draw conditions already listed above
- furiten and tenpai state output
- pao validation
- retained automated regressions

### Mostly engineering cleanup now

- runtime de-duplication
- removal or retirement of legacy paths
- browser/UI consistency hardening
- final result panel productization
- explicit ownership of entry points and old prototype files

---

## 9. Recommended Optimization Priorities

### Priority A: eliminate main-flow duplication

Goal:

- reduce or remove mirrored rule logic between Node runtime and browser formal runtime

Reason:

- this is the highest long-term maintenance cost in the repo

### Priority B: retire or isolate legacy browser runtime

Goal:

- make fallback behavior explicit, temporary, or removable

Reason:

- reduces runtime ambiguity
- improves debugging confidence

### Priority C: clarify page ownership

Goal:

- keep one formal browser entry
- keep one clearly-labeled dev entry
- mark analyzer/prototype pages as non-primary

### Priority D: finish single-round edge-case coverage

Suggested rule work:

- nagashi mangan
- riichi-kan restriction scenarios
- rule-toggle matrix checks

### Priority E: improve result presentation

Suggested UI work:

- richer end-of-round summary
- multi-ron panel clarity
- pao visibility in final panel

---

## 10. Practical Current Assessment

If evaluated as a single-round riichi mahjong implementation, the project is already in a strong state:

- playable
- test-backed
- rule-rich
- no longer just a prototype

If evaluated as a long-term codebase, the biggest remaining issue is not rule correctness but structural duplication.

In short:

**the game logic is ahead of the architecture cleanup**

