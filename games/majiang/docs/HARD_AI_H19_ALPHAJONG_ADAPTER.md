# H19 AlphaJong External Baseline Adapter

## Summary

H19 adds a benchmark-only AlphaJong adapter so Ace Zero hard AI variants can be compared with an external traditional-algorithm baseline.

AlphaJong is cloned outside this repository at:

```text
/Users/liuhang/Documents/AlphaJong
```

Current source commit:

```text
a868e1654decb9374081c72117b008beccfa0eaa
```

AlphaJong is GPL-3.0. To keep the boundary clean, its source is not vendored into Ace Zero and is not used by formal game configuration. The adapter dynamically loads the external checkout through `ALPHAJONG_ROOT`.

## Current Scope

Two benchmark-only variants are available:

- Variant: `alphajong-discard-only`
- Alias: `alphajong`
- Uses AlphaJong discard scoring for own-turn discard.
- Does not declare riichi.
- Reaction windows pass by default.

- Variant: `alphajong-core`
- Uses AlphaJong discard scoring.
- Uses AlphaJong riichi gate through Ace Zero's legal riichi choices.
- Uses AlphaJong chi/peng decision core by translating Ace Zero `meldString` actions into AlphaJong operation combinations.
- H19e adapts AlphaJong kan decision core for benchmark-only `alphajong-core`: concealed kan, added kan, and open kan are evaluated through AlphaJong's `callKan` path and dispatched through Ace Zero's native kan runtime.
- H19c adds compact call diagnostics for accepted chi/peng: current/next xiangting, tingpai counts, closed-before marker, and yakuhai-peng marker.
- H19d reconstructs AlphaJong state memory from Ace Zero runtime: riichi declaration tiles and compact discard-safety history.
- Still does not load AlphaJong browser `main.js`, `api.js`, or `gui.js`.
- Still does not adapt kita/abortive-draw browser operation paths.

For both variants, ron/tsumo are handled by the arena common hule priority before AI reaction selection.

## Boundary

AlphaJong's browser entrypoint is tightly coupled to Mahjong Soul operation objects and browser globals. The adapter therefore does not call AlphaJong `main()`. Instead, it loads the decision source into a VM sandbox and injects compact runtime state:

- own hand
- visible discards
- open melds
- dora indicators
- scores
- riichi state
- remaining tiles
- seat/round wind

The adapter loads only:

```text
src/parameters.js
src/logging.js
src/utils.js
src/yaku.js
src/ai_defense.js
src/ai_offense.js
```

It does not load `api.js`, `main.js`, or `gui.js`.

For `alphajong-core`, the adapter applies a runtime-only compatibility patch to the loaded external source so the browser-yielding async helpers can return synchronously inside the arena. Browser operation functions such as `callDiscard`, `sendRiichiCall`, `makeCallWithOption`, and `declineCall` are replaced with decision capture stubs.

## Kan Scope

H19e exposes Ace Zero legal kan candidates to `alphajong-core` only:

- Own turn concealed kan and added kan are generated from `Majiang.Game.get_gang_mianzi(...)`.
- Reaction open kan is passed from Ace Zero's normal reaction candidate list.
- Accepted kan actions are dispatched through Ace Zero `resolveKanSequence`, so supplement draw, kan dora, and rob-kan windows remain owned by the native runtime.
- Kan is counted separately from chi/peng: arena reports `kan/R`, `openKan/R`, `closedKan/R`, and `addedKan/R`.
- AlphaJong kan diagnostics are compact: `alphaKanReview/R`, `alphaKanAccept/R`, `alphaKanSimFail/R`, and reason counts.

Kita is intentionally not adapted in this phase.

## State Fidelity

AlphaJong's browser integration keeps some defensive memory while watching Mahjong Soul events:

- `riichiTiles`: tile discarded on each player's riichi declaration
- `playerDiscardSafetyList`: recent discard danger values used to infer whether an opponent is pushing or folding

The adapter does not run the browser event hook. Instead, H19d rebuilds compact memory before each AlphaJong decision:

- `riichiTiles` are reconstructed from Ace Zero rivers by reading riichi-marked discards such as `m5*`.
- `playerDiscardSafetyList` is approximated by running AlphaJong's own `getTileDanger(tile, playerPerspective)` over the current visible river.

This is more faithful than resetting the memory every turn, but it is still not a perfect historical replay because old discard danger is evaluated from the current visible state rather than from the exact past moment when the discard happened.

## Performance Note

AlphaJong performs a two-step hand simulation per discard. Even with `PERFORMANCE_MODE=0`, the current adapter is much slower than Ace Zero's native hard AI. A 1 hanchan smoke can take roughly tens of seconds on local hardware.

Use small scouts first. Treat 200 matches as a background job, not a quick regression.

## Commands

Validate adapter registration and one direct discard decision:

```bash
ALPHAJONG_ROOT=/Users/liuhang/Documents/AlphaJong \
node games/majiang/scripts/validate-alphajong-adapter.js
```

Discard-only one-match smoke:

```bash
ALPHAJONG_ROOT=/Users/liuhang/Documents/AlphaJong \
node games/majiang/scripts/benchmark-ai-hanchan-arena.js \
  --mode mixed \
  --variants alphajong-discard-only,hard-defensive,hard-balanced-dev,hard-heavy \
  --matches 1 \
  --checkpoint-interval 1 \
  --progress \
  --stdout summary \
  --out /tmp/h19-alphajong-smoke-1.json
```

Core one-match smoke:

```bash
ALPHAJONG_ROOT=/Users/liuhang/Documents/AlphaJong \
node games/majiang/scripts/benchmark-ai-hanchan-arena.js \
  --mode mixed \
  --variants alphajong-core,hard-defensive,hard-balanced-dev,hard-heavy \
  --matches 1 \
  --checkpoint-interval 1 \
  --progress \
  --stdout summary \
  --out /tmp/h19b-alphajong-core-smoke-1.json
```

Core background comparison:

```bash
ALPHAJONG_ROOT=/Users/liuhang/Documents/AlphaJong \
node games/majiang/scripts/benchmark-ai-hanchan-arena.js \
  --mode mixed \
  --variants alphajong-core,hard-defensive,hard-balanced-dev,hard-heavy \
  --matches 200 \
  --checkpoint-interval 10 \
  --progress \
  --stdout summary \
  --out /tmp/h19e-alphajong-kan-fullcore-200.json
```

## Interpretation

Do not compare `alphajong-discard-only` as a full-strength AI yet:

- `call=0`
- `riichi=0`
- non-riichi win rate will be distorted
- hule rate will likely be low

`alphajong-core` is closer, but still not a full Mahjong Soul AlphaJong clone:

- chi/peng are adapted
- riichi is adapted
- kan is adapted through Ace Zero legal candidates and AlphaJong `callKan`
- accepted chi/peng now include compact metrics, so arena `improveCall/R`, `flatCall/R`, `closedCall/R`, and `yakuhai/R` are interpretable for AlphaJong core
- accepted kan now has separate compact metrics and does not pollute `calls/R`
- defensive state memory is reconstructed for riichi declaration tiles and recent discard safety history
- kita/abortive-draw are not adapted
- browser timing, GUI state, and Mahjong Soul operation ordering are not loaded

Useful early signals:

- discard-only: deal-in rate from discard decisions
- core: whether AlphaJong-style riichi/call policy becomes competitive once not crippled by pass-only reactions
- core: whether hard AI loses to an external traditional scorer in some seats
- later fixture-level discard disagreements

## Next Steps

Recommended sequence:

1. H19f should adapt remaining operation families such as kita/abortive-draw only if Ace Zero's runtime exposes matching legal actions and the benchmark needs them.
2. H19g should add an AlphaJong shadow report that logs AlphaJong's discard/call recommendation beside hard variants without controlling a seat.
3. H19h should run 200/1000-match comparisons only after full operation coverage and state diagnostics are stable.

Do not load AlphaJong `main.js` directly into arena; full comparison should remain a decision-core adapter, not Mahjong Soul browser automation.
