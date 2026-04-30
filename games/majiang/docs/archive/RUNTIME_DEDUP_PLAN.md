# Mahjong Runtime Dedup Plan

Date: 2026-04-08

## 1. Goal

The goal is not to delete `browser-formal-runtime-core.js` immediately.

The goal is to remove duplicated single-round rule logic so that:

- `engine/runtime/single-round-runtime.js` becomes the single-round truth source
- `shared/runtime/` holds cross-environment rule/state helpers
- `browser-formal-runtime-core.js` becomes a thin browser composition layer
- `browser-formal-runtime-factory.js` keeps browser-only automation
- `browser-runtime-bridge.js` keeps mount/sync/logging only

In one sentence:

**deduplicate logic first, thin the browser layer second, delete nothing until the browser path is fully covered by the shared/runtime path**

---

## 2. Current Reality

Large mirrored blocks have already been reduced by moving reaction / settlement / round-result logic into `shared/runtime/`.

However, both of these files still carry overlapping single-round support logic:

- `engine/runtime/single-round-runtime.js`
- `frontend/scripts/runtime/browser-formal-runtime-core.js`

The remaining overlap is mostly in these categories:

- riichi state initialization and reset
- furiten state initialization, refresh, and temporary lock handling
- tile-rank normalization helpers
- kan-type / kan-claim helper logic
- test-setup wall bootstrap helpers
- thin runtime adapter shims around shared helpers

This means the project is no longer in the old “two fully mirrored runtimes” state, but it is still not cleanly converged.

---

## 3. Target Boundary

### 3.1 `engine/runtime/single-round-runtime.js`

Owns:

- round truth state
- round state machine progression
- dispatch / action resolution
- engine-facing lifecycle
- integration of `base/`, `shared/`, and extensions

Should not own:

- browser global wiring
- browser lifecycle glue
- UI synchronization details

### 3.2 `shared/runtime/`

Owns:

- pure or hook-driven helpers that are valid in both Node and browser
- round state support helpers
- riichi / furiten / claim / settlement helper logic
- cross-environment data shaping

Should not own:

- DOM or frontend behavior
- `window` globals
- browser-only automation

### 3.3 `frontend/scripts/runtime/browser-formal-runtime-core.js`

Owns:

- browser-safe composition entry
- injection of browser adapters into shared/runtime helpers
- export consumed by `browser-formal-runtime-factory.js`

Should not own:

- duplicated rule logic
- duplicated state transition logic
- duplicated settlement logic

### 3.4 `frontend/scripts/runtime/browser-formal-runtime-factory.js`

Owns:

- browser-only AI turn automation
- human-seat dispatch routing
- auto-resume / timing behavior

### 3.5 `frontend/scripts/runtime/browser-runtime-bridge.js`

Owns:

- runtime mount
- frontend sync
- logging
- compatibility fallback loading

Should never regain round-rule truth.

---

## 4. Dedup Principles

### 4.1 Truth first

If a function affects round truth, and the same behavior is needed in Node and browser, it belongs in `shared/runtime/` or engine runtime support, not in browser core.

### 4.2 Extract behavior, not wrappers

Do not move code just to create one more forwarding layer.

A good extraction removes real duplicated behavior and leaves each caller with a small environment adapter.

### 4.3 Browser layer may compose, but not decide rule truth

Browser runtime can inject:

- tile assets
- browser-safe adapter functions
- factory automation

But it should not become an alternate rule engine.

### 4.4 Keep migration reversible

Each phase should preserve:

- current browser entry behavior
- current Node validation scripts
- current retained config assets

No big-bang rewrite.

---

## 5. Planned Extraction Units

The remaining dedup work should be split into small support modules instead of one giant “runtime utils” file.

### 5.1 Round state support

Proposed shared module:

- `shared/runtime/round-state-support.js`

Candidate responsibilities:

- `createInitialRiichiState`
- `createInitialTurnState`
- `createInitialFuritenState`
- `getSeatRiichiState`
- `getSeatTurnState`
- `getSeatFuritenState`
- `resetRuntimeRiichiTracking`

Reason:

- these are environment-agnostic
- they are duplicated almost line-for-line today

### 5.2 Furiten support

Proposed shared module:

- `shared/runtime/furiten.js`

Candidate responsibilities:

- `getTileRankValue`
- `getSeatWinningTileCodes`
- `wouldCompleteHandWithTile`
- `refreshSeatFuritenState`
- `refreshAllFuritenStates`
- `clearTemporaryFuriten`
- `markSameTurnFuriten`
- `markSkipRonFuriten`
- `getSeatNengRong`
- `getReactionFuritenSeatKeys`
- `applyPendingReactionFuriten`

Reason:

- this logic is still duplicated
- it is pure runtime logic, not browser logic
- it is likely to change again when more edge cases are added

### 5.3 Kan / claim support

Proposed shared module:

- `shared/runtime/kan.js`

Candidate responsibilities:

- `detectKanType`
- `countRuntimeKanMelds`
- `getKanClaimTileCode`
- any helper that decides whether four-kan abortive draw should trigger

### 5.4 Hule gating support

Proposed shared module:

- `shared/runtime/hule-gate.js`

Candidate responsibilities:

- `safeAllowHule`
- helpers for claim-tile hule eligibility input shaping

Reason:

- same rule gate exists in both runtimes
- this area is load-bearing and easy to diverge silently

### 5.5 Test setup support

Proposed shared module:

- `shared/runtime/testing-setup.js`

Candidate responsibilities:

- `createDefaultDeadWallTiles`
- `applyTestingRuntimeSetup`

Reason:

- still duplicated
- isolated enough to move without touching main flow semantics

---

## 6. Recommended Rollout

### Phase 0. Freeze boundary rules

Before more feature work:

- stop adding new single-round rule logic directly into `browser-formal-runtime-core.js`
- new cross-environment logic must go to `shared/runtime/`
- browser core may only add composition glue unless there is a documented exception

Exit condition:

- team agrees on the file ownership rules in this document

### Phase 1. Extract low-risk support helpers

Move first:

- round state support
- testing setup support
- kan helpers

Why first:

- lower regression risk
- limited coupling to browser UI
- quick reduction in mirrored code size

Exit condition:

- browser core and engine runtime both import these helpers from `shared/runtime/`
- browser behavior unchanged

### Phase 2. Extract furiten support

Move next:

- furiten state refresh and temporary-lock behavior
- waiting-tile helpers
- reaction furiten propagation

Why second:

- high duplicate density
- central to correctness
- easier to verify with existing P4 regressions

Required validation:

- `node majiang/scripts/validate-furiten-scenarios.js`
- `node majiang/scripts/validate-p3-scenarios.js`

Exit condition:

- there is only one implementation of furiten refresh logic

### Phase 3. Extract hule gate and claim helpers

Move next:

- safe hule gating
- claim tile helper shaping used by qianggang / ron checks

Required validation:

- P3 retained scenarios
- P5 multi-ron / special draw scenarios
- P6 pao scenarios

Exit condition:

- hule eligibility input shaping exists in one shared path

Status:

- completed for `safeAllowHule`
- claim-direction / reaction-priority browser-local helpers still remain

### Phase 4. Thin browser formal runtime core

Phase 4 should no longer be treated as one large cleanup bucket.

It should be split into 3 implementation batches.

### Phase 4A. Seat status support

Target new shared module:

- `shared/runtime/seat-status.js`

Move first:

- `parseHandTileCodes`
- `getSeatHandTileCodes`
- `getSeatDiscardCandidateCodes`
- `getSeatBlockedDiscardCodes`
- `buildSeatStatusState`

Reason:

- this is now the largest remaining true duplicate block
- it directly affects tenpai / furiten / kuikae output shown to UI
- both runtimes still carry near-mirrored implementations

Required hooks:

- current-phase reader
- current-turn-seat reader
- discard-candidate provider
- furiten-state reader
- winning-tile reader

Required validation:

- `node majiang/scripts/validate-furiten-scenarios.js`
- `node majiang/scripts/validate-p5-scenarios.js`

Exit condition:

- there is only one implementation of seat-status / kuikae-blocked computation

Status:

- completed with `shared/runtime/seat-status.js`

### Phase 4B. Riichi / ippatsu bookkeeping

Target new shared module:

- `shared/runtime/riichi-flow.js`

Move next:

- `closeDoubleRiichiWindow`
- `validateRiichiDeclaration`
- `markRiichiDeclaration`
- `finalizeDiscardTurn`
- `clearSeatIppatsu`
- `clearAllIppatsu`
- `markIppatsuPendingExpiry`
- `consumePendingIppatsuExpiry`

Reason:

- this is the second largest remaining duplicate cluster
- it is load-bearing for riichi, double riichi, and ippatsu correctness
- the browser and Node implementations differ only in how legal riichi choices are sourced

Required hooks:

- riichi-choice provider
- seat-state reader
- turn-state reader
- seat-iteration source

Required validation:

- `node majiang/scripts/validate-p3-scenarios.js`
- `node majiang/scripts/validate-p5-scenarios.js`

Exit condition:

- there is only one implementation of riichi / ippatsu state mutation rules

Status:

- completed with `shared/runtime/riichi-flow.js`

### Phase 4C. Draw support and thin wrappers

Target extraction or cleanup:

- `isExhaustiveDrawState`
- `buildExhaustiveDrawResultOptions`
- `getPendingReactionHuleActions`
- thin settlement wrapper review
- remaining browser-local utility wrappers that only forward into shared helpers

Reason:

- lower risk than 4A / 4B
- still worthwhile for keeping browser core readable
- helps reveal what is truly browser-only after the important rule support is removed

Required validation:

- `node majiang/scripts/validate-p3-scenarios.js`
- `node majiang/scripts/validate-p5-scenarios.js`
- browser smoke scenario

Exit condition:

- `browser-formal-runtime-core.js` reads primarily as a composition module
- remaining local helpers are browser-specific rather than duplicated rule support

Status:

- completed for:
  - `shared/runtime/draw-support.js`
  - exhaustive draw support
  - pending reaction hule filtering
  - nine-kinds draw gating
- intentionally retained:
  - thin settlement wrappers
  - browser-local claim / reaction priority utilities

After Phases 1-3:

- remove now-redundant local helper definitions from browser core
- keep only browser composition, exports, and browser-safe adapter bindings
- review whether `browser-formal-runtime-core.js` can be split further or reduced substantially

Success signal:

- browser core reads as an assembler, not a second runtime implementation

### Phase 5. Re-evaluate runtime ownership

Only after the above:

- measure remaining code in `browser-formal-runtime-core.js`
- decide whether more logic should move into engine runtime or stay as browser composition
- do not delete the file unless factory loading and browser startup can stay stable without it

---

## 7. File-Level Ownership After Refactor

### Add / expand in `shared/runtime/`

- `round-state-support.js`
- `furiten.js`
- `kan.js`
- `hule-gate.js`
- `testing-setup.js`
- `seat-status.js`
- `riichi-flow.js`

### Keep in engine runtime

- `single-round-runtime.js`
  - orchestration
  - state machine integration
  - dispatch integration
  - extension manager integration

### Keep in browser runtime

- `browser-formal-runtime-core.js`
  - shared helper assembly
  - browser-safe bindings
  - export surface for formal factory

- `browser-formal-runtime-factory.js`
  - browser-only auto progression
  - UI-originated dispatch affordances

- `browser-runtime-bridge.js`
  - mounting and sync only

---

## 8. Acceptance Criteria

The dedup effort should be considered successful only when all of the following are true:

- no cross-environment rule helper has two live implementations
- browser formal runtime no longer defines duplicated furiten / riichi / kan / hule-gate / seat-status support logic
- `single-round-runtime.js` remains the single-round truth owner
- browser entry pages still work
- retained Node regressions still pass
- browser smoke scenario still passes
- adding a new single-round rule fix requires touching one truth path, not two

---

## 9. Risks

### 9.1 False dedup

Risk:

- moving code into `shared/` but leaving browser-only wrappers that still duplicate behavior

Mitigation:

- each extraction must delete the old behavior, not just hide it

### 9.2 Boundary leakage

Risk:

- `shared/` starts depending on browser globals or UI concerns

Mitigation:

- use hook injection and plain data only

### 9.3 Refactor without coverage

Risk:

- the code gets “cleaner” but browser flow silently regresses

Mitigation:

- validate retained Node scripts plus browser smoke after each phase

---

## 10. First Execution Batch

The best first implementation batch is:

1. add `shared/runtime/round-state-support.js`
2. add `shared/runtime/testing-setup.js`
3. add `shared/runtime/kan.js`
4. switch both runtimes to consume them
5. re-run retained regressions

Why this batch:

- smallest semantic risk
- immediate mirrored-code reduction
- prepares Phase 2 furiten extraction without mixing too many moving parts

## 11. Current Progress Snapshot

Completed:

- Phase 1
  - `round-state-support.js`
  - `testing-setup.js`
  - `kan.js`
- Phase 2
  - `furiten.js`
- Phase 3
  - `hule-gate.js`
- Phase 4A
  - `seat-status.js`
- Phase 4B
  - `riichi-flow.js`
- Phase 4C
  - `draw-support.js`

Current highest-priority remaining duplicate clusters:

1. browser-local claim / reaction priority utility review
2. settlement wrapper cleanup
3. optional browser-core wrapper minimization

---

## 12. Practical Rule For Future Work

When a new helper is needed, ask:

1. Does it affect round truth?
2. Is the same logic needed in browser and Node?
3. Is it free of DOM / window / UI timing concerns?

If the answer is yes to all three, it should start in `shared/runtime/`.
