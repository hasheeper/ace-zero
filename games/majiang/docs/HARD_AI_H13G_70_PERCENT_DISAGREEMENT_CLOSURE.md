# Hard AI H13g: 70% Disagreement Closure

## Summary

H13g reaches the practical lower bound only under the **exact + near** interpretation:

- Heldout states: `307`
- Exact: `210 / 307 = 68.40%`
- Exact + near: `(210 + 5) / 307 = 70.03%`

This means hard has reached the minimum alignment target, but it does **not** mean the remaining 30% are all acceptable human-style disagreements.

The right closure is:

- `70% exact+near` is enough to stop chasing the old 80-85% target.
- The remaining disagreements must be triaged by severity.
- Broad rules or always-on model override are still unsafe.

## Triage

Remaining non-exact states: `97`.

By Mortal qDelta band:

- Normal / acceptable: `15`
  - `qDelta <= 0.15`
  - Includes `5 near` and `10 medium`
  - These are mostly normal teacher/student preference differences.
- Needs fixed-position review: `39`
  - `0.15 < qDelta <= 1.0`
  - All are currently marked `large`, but the q gap is not high enough to call them obvious bad moves automatically.
  - These should be judged with fixed context before changing runtime behavior.
- Serious-suspect: `43`
  - `qDelta > 1.0`
  - `27` of these are `qDelta > 2.0`
  - These are not automatically proven human "blunders," but they are strong Mortal disagreements and should be treated as the main hard-quality debt.

Serious-suspect split:

- `36` tile-choice
- `7` tile-defense
- `36` neutral / no-pressure
- `7` careful / pressure

The important shape is that most serious-suspect cases are not emergency defense. They are mostly ordinary no-pressure tile choice.

## What Is Normal Disagreement?

The `15` near/medium states are acceptable as normal disagreement for now.

They are small qDelta differences, often same-xiangting, and not worth hard-coding around. Counting them as acceptable is why `exact + near` reaches `70.03%`.

These should not drive P-rule patches.

## What Is Probably Real Hard Debt?

The most suspicious group is:

- no-pressure tile-choice
- same-xiangting
- qDelta > 1.0, especially > 2.0

This is where hard is probably over-trusting shallow local EV / shape proxies and missing route-level candidate quality.

Current evidence:

- `67` tile-choice large total
- `57 / 67` are same-xiangting
- `36` tile-choice states have qDelta > 1.0
- `24` tile-choice states have qDelta > 2.0

This should be treated as the first quality debt bucket.

## What Needs Separate Judgment?

Do not automatically call every large disagreement an evil move.

These buckets need fixed-position review or labels:

- Defense large: only `15` states, but pressure tradeoffs are high risk.
- Mortal worse-xiangting choices: may be route/backstep quality, not simple discard ranking.
- Tenpai choices: waiting shape, dama/riichi route, and final-round context can dominate simple candidate features.
- Dora / five / value-honor route choices: Mortal may be optimizing route value, not just local shape.
- Endgame states: qDelta can reflect risk and future trajectory more than immediate tile quality.

These are candidates for corpus review, not immediate runtime changes.

## Mortal Teacher Provenance

The current real Mortal teacher is already using:

- Config: `/Users/liuhang/Documents/Mortal/mortal/config.real.toml`
- `state_file`: `/Users/liuhang/Documents/Mortal/models/model_v4_20240308_best_min.pth`
- `best_state_file`: `/Users/liuhang/Documents/Mortal/models/model_v4_20240308_best_min.pth`

So re-running the same H13g fit with `/Users/liuhang/Documents/Mortal/models/model_v4_20240308_best_min.pth` is not a new teacher comparison. It is the same real Mortal baseline unless a different config or weight file is supplied.

If we want a second opinion, H13h should run an explicit cross-teacher comparison with a different Mortal config/weight path. Otherwise, the next useful work is fixed-position adjudication of the `39 + 43` disagreement states against the current teacher.

Future reports should record `mortalConfigPath`, `state_file`, and `best_state_file` directly in the output so this provenance is visible without reopening the TOML.

## Product Interpretation

For the current hard AI:

- It is fair to say hard has reached a **minimum 70% alignment floor** under exact+near.
- It is not fair to say the remaining disagreements are harmless.
- It is also not fair to treat all remaining large rows as proven human blunders.

The clean statement is:

> Hard is usable at the 70% alignment floor, but its remaining debt is concentrated in a serious-suspect no-pressure tile-choice bucket. The next goal is not higher raw exact rate by broad override; it is reducing qDelta > 1.0 disagreements without regressing current exact states.

## Next Gate

H13h should use a fixed override corpus:

- Positive candidates: shared model improvements, especially qDelta > 1 tile-choice.
- Negative candidates: shared hard-exact regressions.
- Review candidates: qDelta `0.15-1.0`.
- Risk candidates: defense large and worse-xiangting choices.

Success should be measured as:

- exact + near stays above 70%
- qDelta > 1 serious-suspect count drops
- current-hard exact regressions stay near zero
- defense regressions do not increase

This is the right bridge from "we reached 70%" to "hard actually feels stronger."
