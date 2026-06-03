# Hard AI H13g: 70-75% Mortal Exact Gap Analysis

## Summary

This note re-frames the H13g native-ranker result around a practical target: **70-75% Mortal exact/near alignment**, not the earlier 80-85% stretch target.

Data source:

- Heldout dataset: `/tmp/h13g-native-heldout-dataset.jsonl`
- Native ranker report: `/tmp/h13g-native-ranker-experiment-report.json`
- Gap analysis: `/tmp/h13g-70-75-gap-analysis.json`

Current heldout baseline:

- Total states: `307`
- Current hard exact: `210 / 307 = 68.40%`
- Current hard exact + near: `(210 + 5) / 307 = 70.03%`
- Need for 70%: `+5` net exact states
- Need for 75%: `+21` net exact states

The important conclusion is: **70% is already reachable if near counts as acceptable; strict 70% exact is only 5 states away; 75% is plausible but needs safe selection.**

## Where The Gap Is

### 1. The 70% Gap Is Small

Current hard needs only `5` more exact matches to cross strict 70%.

If `near` is accepted as "close enough," current hard is already at:

- `(210 exact + 5 near) / 307 = 70.03%`

The current non-exact set is:

- `97` non-exact states total
- `5` near
- `10` medium
- `82` large

If all near and medium states became exact, hard would reach:

- `(210 + 15) / 307 = 73.29%`

So 70% should not require a larger model or more Mortal data. It needs a conservative way to harvest a few low-risk corrections without regressing exact states.

### 2. The 75% Gap Requires Some Large Fixes

75% requires `231 / 307` exact states, or `+21` over current hard.

Near + medium cleanup can contribute at most `+15`, so 75% requires at least `6` large states to become exact as well.

This is why 75% is possible but not automatic:

- 70% can be reached by small, safe corrections.
- 75% needs selective large-disagreement fixes.
- 80%+ would need a much broader strategy and is not a useful near-term gate.

### 3. Most Large Gap Is No-Pressure Tile Choice

Large disagreements:

- `82` large total
- `67` tile-choice large
- `15` tile-defense large

The `tile-choice large` group is the main target:

- `67 / 67` are `pressureScore=0` / neutral
- `57 / 67` are same-xiangting
- Most are early/mid round rather than endgame

This means the largest gap is not riichi, not call, not emergency defense. It is mostly:

- no-pressure discard ordering
- same-xiangting candidate preference
- hand-shape / route calibration
- Hard EV over-valuing or under-valuing local candidate features

### 4. Defense Is Smaller And Riskier

`tile-defense large` is only `15` states:

- All are under pressure / careful
- `12` are xiangting `1`
- `3` are xiangting `2`
- `10 / 15` have Mortal choosing worse-xiangting candidates

This bucket likely needs a separate defense/backstep model or stricter safety semantics. It is not the best first route to 70%, because false positives here can make hard look visibly worse.

### 5. The Model Has Enough Signal, But It Misfires

Native full model:

- Converts `30` current non-exact states into exact
- But regresses `37` current exact states

Native no-shape model:

- Converts `27` current non-exact states into exact
- But regresses `39` current exact states

Shared exact improvements between both native modes:

- `21` states
- `20` tile-choice
- `1` tile-defense
- `18` large, `2` medium, `1` near

That shared improvement set is exactly enough to reach 75% if applied with zero regressions:

- `210 + 21 = 231`
- `231 / 307 = 75.24%`

But the same models also share `27` hard-exact regressions. So the problem is not "the model cannot find better candidates." The problem is **the model cannot yet tell when it should override current hard**.

## Practical Interpretation

The current hard AI is already close to the lower target:

- It is already `70.03%` if exact + near is accepted.
- It is `5` exact states short of strict exact-only 70%.
- It is `21` exact states short of 75%.

The remaining gap is concentrated enough that we should not keep adding broad discard rules. Broad rules and always-on model override both have the same failure mode: they harvest improvements and regressions together.

The next useful layer is an **override gate**, not a stronger always-pick ranker.

## Recommended Next Step

H13h should build a compact override corpus and evaluator:

- Positive set: the `21` shared model improvements.
- Negative set: the `27` shared hard-exact regressions.
- Cheap set: all `15` near/medium disagreements.
- Risk set: the `15` tile-defense large disagreements.

Then evaluate a binary question:

> Should hard keep its current discard, or should the model override it?

The gate should be optimized for:

- exact never regresses much
- override count stays small
- 70% is reached first
- 75% only if large fixes pass safely

Suggested gates:

- `H13h-P0`: export override corpus and diagnostics.
- `H13h-P1`: hand-written conservative gate using only runtime-safe confidence and candidate deltas.
- `H13h-P2`: optional tiny binary override classifier, trained on improvement vs regression states.
- `H13h-P3`: heldout check against 70/75 targets.

Do not expand data first. The heldout already shows the central issue: **selection safety**, not absence of positive examples.
