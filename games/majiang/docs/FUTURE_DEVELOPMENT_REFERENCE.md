# Mahjong Future Development Reference

## Purpose

This document is for future feature work.

It is not a phase log and not a detailed architecture spec.

It answers one practical question:

where should new Mahjong features go so the project stays layered and does not drift back into duplicated runtime logic.

Read this together with:

- [`/Users/liuhang/Documents/acezero/majiang/CURRENT_FRAMEWORK_REFERENCE.md`](/Users/liuhang/Documents/acezero/majiang/CURRENT_FRAMEWORK_REFERENCE.md)

---

## Current Stable Shape

The project now has a relatively clear split:

- `majiang-core/`
  owns canonical Mahjong rule primitives and low-level legality/scoring APIs
- `engine/runtime/`
  owns single-round truth execution
- `shared/runtime/`
  owns cross-environment round helpers
- `shared/core/` and `shared/match/`
  own session and cross-round decisions
- `frontend/scripts/runtime/`
  owns browser assembly, mount, and smoke helpers
- `frontend/scripts/ui/`
  owns rendering and interaction

The most important rule for future work:

**do not add a second rules engine in the browser layer.**

If a feature changes round truth, it should land in `engine/` or `shared/`, not only in `frontend/`.

---

## File Structure Reference

### Truth and rules

- [`/Users/liuhang/Documents/acezero/majiang/engine/runtime/single-round-runtime.js`](/Users/liuhang/Documents/acezero/majiang/engine/runtime/single-round-runtime.js)
- [`/Users/liuhang/Documents/acezero/majiang/shared/runtime`](/Users/liuhang/Documents/acezero/majiang/shared/runtime)
- [`/Users/liuhang/Documents/acezero/majiang/shared/core/adapter-factory.js`](/Users/liuhang/Documents/acezero/majiang/shared/core/adapter-factory.js)
- [`/Users/liuhang/Documents/acezero/majiang/shared/core/session-adapter.js`](/Users/liuhang/Documents/acezero/majiang/shared/core/session-adapter.js)

### Session and multi-round

- [`/Users/liuhang/Documents/acezero/majiang/shared/match/match-state.js`](/Users/liuhang/Documents/acezero/majiang/shared/match/match-state.js)
- [`/Users/liuhang/Documents/acezero/majiang/shared/match/round-transition.js`](/Users/liuhang/Documents/acezero/majiang/shared/match/round-transition.js)
- [`/Users/liuhang/Documents/acezero/majiang/frontend/scripts/runtime/session/game-session-runtime.js`](/Users/liuhang/Documents/acezero/majiang/frontend/scripts/runtime/session/game-session-runtime.js)

### Browser runtime and UI

- [`/Users/liuhang/Documents/acezero/majiang/frontend/scripts/runtime/formal`](/Users/liuhang/Documents/acezero/majiang/frontend/scripts/runtime/formal)
- [`/Users/liuhang/Documents/acezero/majiang/frontend/scripts/runtime/bridge`](/Users/liuhang/Documents/acezero/majiang/frontend/scripts/runtime/bridge)
- [`/Users/liuhang/Documents/acezero/majiang/frontend/scripts/ui`](/Users/liuhang/Documents/acezero/majiang/frontend/scripts/ui)
- [`/Users/liuhang/Documents/acezero/majiang/index.html`](/Users/liuhang/Documents/acezero/majiang/index.html)

### AI and extensions

- [`/Users/liuhang/Documents/acezero/majiang/engine/ai/base-ai.js`](/Users/liuhang/Documents/acezero/majiang/engine/ai/base-ai.js)
- [`/Users/liuhang/Documents/acezero/majiang/engine/ai/discard-evaluator.js`](/Users/liuhang/Documents/acezero/majiang/engine/ai/discard-evaluator.js)
- [`/Users/liuhang/Documents/acezero/majiang/engine/extensions/extension-manager.js`](/Users/liuhang/Documents/acezero/majiang/engine/extensions/extension-manager.js)
- [`/Users/liuhang/Documents/acezero/majiang/engine/extensions/extensions.md`](/Users/liuhang/Documents/acezero/majiang/engine/extensions/extensions.md)

### Debug, smoke, and logs

- [`/Users/liuhang/Documents/acezero/majiang/frontend/scripts/debug/debug-panel.js`](/Users/liuhang/Documents/acezero/majiang/frontend/scripts/debug/debug-panel.js)
- [`/Users/liuhang/Documents/acezero/majiang/frontend/scripts/debug/dev-log.js`](/Users/liuhang/Documents/acezero/majiang/frontend/scripts/debug/dev-log.js)
- [`/Users/liuhang/Documents/acezero/majiang/frontend/scripts/runtime/bridge/browser-smoke-tests.js`](/Users/liuhang/Documents/acezero/majiang/frontend/scripts/runtime/bridge/browser-smoke-tests.js)
- [`/Users/liuhang/Documents/acezero/majiang/test/TESTS.md`](/Users/liuhang/Documents/acezero/majiang/test/TESTS.md)

---

## Future Work Map

### 1. Three-player Mahjong

Best fit:

- rule profile in `shared/core/`
- round/runtime support in `engine/runtime/` and `shared/runtime/`
- session transition updates in `shared/match/`
- browser seat layout updates in `frontend/scripts/ui/`

Suggested order:

1. Add a new ruleset and seat-model layer before touching UI
2. Make seat iteration, dealer order, and snapshot shaping stop assuming four seats
3. Only then build the three-seat table layout and labels

Do not do this first:

- hardcode three-player special cases directly in UI panels
- fork a separate `single-round-runtime-3p.js`

Current likely pressure points:

- seat loops that implicitly assume four entries
- score arrays and `fenpei` shaping
- layout and panel positioning
- test fixtures that always use `bottom/right/top/left`

Recommended landing zones:

- `shared/core/rule-config.js`
- `shared/match/`
- `shared/runtime/state/`
- `frontend/scripts/ui/`

### 2. Two-player or mini Mahjong game modes

Treat this as a product variant, not a patch on top of four-player riichi truth.

Best fit:

- isolated ruleset/config layer in `shared/core/`
- mode-specific runtime composition in `engine/runtime/` only if the turn structure really differs
- dedicated UI flow in `frontend/scripts/ui/`

Recommendation:

- prefer a mode flag and capability map first
- only split runtime modules if the action graph becomes materially different

Good candidates:

- lightweight mini-game with reduced round flow
- tutorial mode
- puzzle/challenge mode

Bad candidate:

- stuffing mini-game-only shortcuts into normal four-player action resolution

### 3. Log recording and replay

This is a good next investment because the project already emits many useful runtime events.

Best fit:

- event capture contract in `shared/` or `engine/runtime/`
- browser inspector in `frontend/scripts/debug/`
- replay loader/player in `frontend/scripts/runtime/bridge/` or `frontend/scripts/runtime/session/`

Current useful anchors:

- runtime emits `round:start`, `round:hule`, `round:draw`, `round:end`
- browser smoke already listens to runtime events
- debug panel and dev log already exist

Recommended direction:

1. Define a stable event log schema
2. Persist round config + ordered action/event stream
3. Add a replay-only runtime bootstrap path
4. Keep replay as a consumer of truth events, not a second source of truth

Do not do this:

- scrape UI state to reconstruct logs
- store only screenshots or rendered text

### 4. AI optimization and AI upgrade

Best fit:

- evaluation logic in `engine/ai/`
- action selection orchestration close to runtime snapshots, not inside UI
- optional personality or skill modifiers through extension hooks or AI config

Current foundation:

- [`/Users/liuhang/Documents/acezero/majiang/engine/ai/base-ai.js`](/Users/liuhang/Documents/acezero/majiang/engine/ai/base-ai.js)
- [`/Users/liuhang/Documents/acezero/majiang/engine/ai/discard-evaluator.js`](/Users/liuhang/Documents/acezero/majiang/engine/ai/discard-evaluator.js)
- [`/Users/liuhang/Documents/acezero/majiang/docs/AI_PLAN.md`](/Users/liuhang/Documents/acezero/majiang/docs/AI_PLAN.md)

Suggested upgrade path:

1. Strengthen discard evaluation
2. Add cleaner meld / riichi / defense heuristics
3. Split offense and defense scoring
4. Add personality weights
5. Add skill-aware or extension-aware modifiers

Keep this boundary:

- AI may read snapshots and legal actions
- AI should not mutate runtime state directly
- AI should not own rule truth

### 5. Ability or extension system

Best fit:

- extension bus in `engine/extensions/`
- rule-safe projection points in `shared/runtime/`
- player-view modifications in `engine/base/view-builder.js`

Current hook direction is already documented in:

- [`/Users/liuhang/Documents/acezero/majiang/engine/extensions/extensions.md`](/Users/liuhang/Documents/acezero/majiang/engine/extensions/extensions.md)

Recommended split:

- truth modifiers
  can affect draw/deal/reaction candidates before truth is finalized
- view modifiers
  can affect what a seat sees without changing truth state

Examples that fit well:

- good hand / bad hand opening bias
- controlled draw bias
- partial information reveal
- anti-skill or shield effects

Examples that need caution:

- retroactively changing settled round outcomes
- directly writing into runtime board internals from extensions

### 6. Session, half-game, and long-form progression

Best fit:

- `shared/match/`
- `shared/core/session-adapter.js`
- `frontend/scripts/runtime/session/game-session-runtime.js`

This is where:

- round advancement
- dealer continuation
- riichi sticks and changbang carry-over
- match finish conditions

should keep living.

If future work touches:

- east-only / half-game / full-game variants
- match finish rules
- cross-round abilities
- progression rewards

start here before changing the single-round runtime.

---

## Practical Placement Rules

### Put code in `majiang-core/` only if

- it is truly a base rules-engine concern
- it is not project-specific product logic
- you are intentionally maintaining a vendor-style fork

### Put code in `engine/runtime/` if

- it changes round truth execution
- it changes action sequencing
- it changes how a round progresses

### Put code in `shared/runtime/` if

- both Node/runtime and browser runtime composition need it
- it is helper logic, not top-level orchestration
- it must stay environment-neutral

### Put code in `shared/core/` or `shared/match/` if

- it belongs to cross-round progression
- it maps single-round result to match/session decisions
- it is a rule/session adapter rather than round execution

### Put code in `frontend/scripts/runtime/` if

- it is browser-only bootstrap
- it mounts or wires runtime to the page
- it handles browser smoke or session shell behavior

### Put code in `frontend/scripts/ui/` if

- it is visual
- it is interaction rendering
- it is animation, panel, or display logic

### Put code in `frontend/scripts/debug/` if

- it is inspection-only
- it is dev logging
- it is test or developer tooling surfaced in the browser

---

## Anti-Patterns To Avoid

- Reintroducing duplicated rules in browser runtime files
- Putting legality checks only in UI
- Forking separate runtimes for each new feature too early
- Letting AI write directly into board/runtime state
- Letting extensions mutate already-settled truth
- Encoding match progression rules inside settlement widgets
- Using one-off JSON fixtures as the only form of documentation

---

## Recommended Next Docs

If future work grows in one of these directions, add a focused doc instead of bloating this file:

- `docs/THREE_PLAYER_PLAN.md`
- `docs/REPLAY_AND_LOG_PLAN.md`
- `docs/ABILITY_SYSTEM_PLAN.md`
- `docs/AI_UPGRADE_PLAN.md`

Each such doc should cover:

- scope
- boundaries
- landing files
- regression plan

---

## Short Version

For almost every future feature:

1. decide whether it changes truth, shared helpers, session, browser assembly, or UI
2. put it in that layer first
3. add deterministic regression before polishing the screen

If a change seems to require duplicating rules in browser code, treat that as a warning sign and step back.
