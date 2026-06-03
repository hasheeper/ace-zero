# Hard AI H13g Native Ranker Analysis

Date: 2026-06-02

## Scope

This report analyzes the first H13g offline native-feature ranker run. It does not propose any runtime policy change.

Inputs:

- Experiment report: `/tmp/h13g-native-ranker-experiment-report.json`
- Native full predictions: `/tmp/h13g-native-ranker-predictions/runtime-safe-native-v1-predictions.json`
- Native no-shape predictions: `/tmp/h13g-native-ranker-predictions/runtime-safe-native-no-shape-predictions.json`
- Compact analysis snapshot: `/tmp/h13g-native-analysis-summary.json`

H13g reused H13e Mortal reports and rebuilt JSONL with native hand/route features. No new Mortal sampling was performed.

## Baseline

Held-out dataset:

| Metric | Value |
| --- | ---: |
| States | 307 |
| Candidate rows | 3021 |
| Current-hard exact | 210 / 307 = 68.40% |
| Current-hard near or exact | 215 / 307 = 70.03% |
| Current-hard medium or better | 225 / 307 = 73.29% |
| Current-hard large | 82 |
| Tile-choice large | 67 |
| Tile-defense large | 15 |
| Unknown / stale | 0 / 0 |

This held-out slice is stronger for current hard than the earlier H13d small slice. That matters: the model is not trying to beat a weak baseline here.

## Model Results

### Always Pick

| Mode | Exact | Large | Changed | Improved | Regressed | Hard-exact regressed |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `runtime-safe-native-v1` | 203 / 307 = 66.12% | 93 | 89 | 36 | 53 | 37 |
| `runtime-safe-native-no-shape` | 198 / 307 = 64.50% | 100 | 87 | 29 | 58 | 39 |

Always-pick is clearly not viable. Native features add signal, but the model still destroys too many positions where hard already matches Mortal exactly.

### Protected Override

The stricter native coverage sweep filters obvious unsafe overrides such as worse xiangting, higher danger under pressure, cutting more value, or breaking more structure.

Best observed coverage slices:

| Mode | Margin | Exact | Large | Overrides | Improved | Regressed | Hard-exact regressed |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `runtime-safe-native-v1` | 0.50 | 210 / 307 = 68.40% | 83 | 35 | 15 | 20 | 13 |
| `runtime-safe-native-no-shape` | 0.30 | 213 / 307 = 69.38% | 81 | 31 | 15 | 16 | 12 |

The no-shape native gate is the best-looking slice: exact +3 and large -1 versus current hard. But it still regresses 12 current-hard exact states. That is far above the H13d/H13g safety target of <= 2, so the recommended gate remains `no-override`.

## Where The Model Helps

Native full improved 36 changed states:

- 32 were `tile-choice`.
- 4 were `tile-defense`.
- 32 were no-pressure or neutral; 4 were careful.
- Improvements are spread across xiangting 0-5, with the largest counts at xiangting 1 and 3.
- 21 / 36 improvements were early (`remaining >= 55`).

Native no-shape improved 29 changed states:

- 27 were `tile-choice`.
- 2 were `tile-defense`.
- 27 were neutral; 2 were careful.
- 18 / 29 improvements were early.

The useful signal is real but narrow: it mainly finds better no-pressure tile-choice candidates. This is the same problem family H12 P4/P5 exposed.

## Where It Breaks

The damaging pattern is also clear: the model changes exact-match states.

Native full hard-exact regressions:

- 37 total.
- 35 neutral, 2 careful.
- Xiangting distribution: 0:1, 1:11, 2:14, 3:10, 4:1.
- 18 early, 18 mid, 1 late.
- 23 closed, 14 open.
- Median prediction margin: 0.487; p90: 1.809.
- Average qDelta damage: 2.096.

Native no-shape hard-exact regressions:

- 39 total.
- 35 neutral, 4 careful.
- Xiangting distribution: 0:1, 1:10, 2:16, 3:11, 4:1.
- 23 early, 14 mid, 2 late.
- 26 closed, 13 open.
- Median prediction margin: 0.272; p90: 1.262.
- Average qDelta damage: 2.213.

The high-margin errors are the most important warning. LightGBM score margin is not yet a calibrated confidence signal.

## Failure Modes

Top recurring hard-exact regression flags:

| Pattern | Native full | Native no-shape | Reading |
| --- | ---: | ---: | --- |
| Model live ukeire lower by >= 5 | 14 | 10 | Model often chooses locally worse acceptance despite current hard and Mortal agreeing. |
| Model hard EV lower by >= 100 | 10 | 9 | Model overrides clear hard EV advantages. |
| Model shape score higher by >= 10 | 9 | 9 | Cleanup-looking tiles are still overvalued in exact-match states. |
| Honor -> terminal | 8 | 9 | Model often prefers cutting terminals over honors when Mortal keeps hard's honor discard. |
| Breaks kanchan window | 6 | 4 | Native structure features catch this, but the ranker does not reliably respect it. |
| Breaks pair | 3 | 5 | Pair/block damage remains under-modeled. |
| Cuts dora | 4 | 1 | Value-route protection is incomplete. |
| Higher danger under pressure | 0 | 2 | Defense filtering helped but did not fully eliminate pressure mistakes. |

The overlap is also important:

- 25 improvements appear in both modes.
- 41 regressions appear in both modes.
- 27 hard-exact regressions appear in both modes.
- Native full has 10 unique hard-exact regressions.
- Native no-shape has 12 unique hard-exact regressions.

This means the issue is not simply "old shape features poisoned the model." Removing shape makes always-pick worse and still leaves many of the same bad states.

## Feature Importance

LightGBM gain summary:

| Mode | Feature count | Native nonzero features | Native gain share |
| --- | ---: | ---: | ---: |
| `runtime-safe-native-v1` | 116 | 34 | 28.49% |
| `runtime-safe-native-no-shape` | 98 | 37 | 53.06% |

Top gain features:

- Native full: `features.xiangting`, `features.discardShapeScore`, `features.pairOrBlockBreakPenalty`, `features.native.breaksRyanmenWindow`.
- Native no-shape: `features.native.breaksRyanmenWindow`, `features.xiangting`, `features.native.discardCountBefore`, `features.native.discardConnectivityBefore`, `features.defenseTileRank`.

Native features are being used heavily, especially when old shape features are removed. The problem is not that the model ignores native features. The problem is that the native feature representation is still too local and not calibrated against route/value context.

## Interpretation

H13g says:

1. More data alone is not the next move.
   H13e already showed scaling from 153 to 307 held-out states did not stabilize the model. H13g adds richer features and still cannot protect exact states.

2. The model can identify some real tile-choice fixes.
   The 25 shared improvements across both native modes are likely good future fixture candidates.

3. The model cannot reliably tell when current hard is already correct.
   This is the blocker for H14 shadow scorer. The model's confidence score is not calibrated, and many high-margin changes are large regressions.

4. The current feature set lacks route-level semantics.
   We added counts and local block damage, but not enough information about yaku route, dora route, pair value, wait transformation quality, or "this candidate keeps the same route while that candidate abandons it."

5. Derived shape is not the only issue.
   No-shape still regresses 39 hard-exact states and shares 27 hard-exact regressions with native full.

## Recommended Next Step

Do not enter H14 runtime shadow scorer yet.

Recommended H13h:

- Build a compact regression corpus from H13g:
  - all hard-exact regressions from both native modes
  - all shared improvements
  - top high-margin regressions
  - top high-qDelta improvements
- Add an offline-only "should override current hard?" classifier or calibration layer.
  - Label positive: model improves current hard.
  - Label negative: model regresses current hard, especially current-hard exact.
  - This is different from ranking all candidates.
- Add route-level runtime-safe features before more sampling:
  - value honor pair/triplet route preservation
  - dora and red-five route preservation
  - open-hand yaku completion state
  - pair role: head candidate vs redundant pair
  - block count and complete/taatsu balance
  - same-route versus route-switch candidate flag
  - tenpai transformation quality for xiangting 0-2
- Tighten coverage gates by class:
  - no override under pressure unless model danger <= current danger and q-like margin is very high
  - no override when current-hard is exact-like by internal heuristics: high hard EV lead, high live ukeire lead, or value tile protection
  - no override when model lowers hard EV by >= 100 or live ukeire by >= 5 unless a separate override classifier approves

Only after H13h can reduce hard-exact regressions near the target should larger data or H14 shadow scorer be reconsidered.

## Current Decision

Status: not ready.

Action:

- Keep H13g code and reports as an offline diagnostic base.
- Do not connect the ranker to runtime.
- Do not collect much larger data yet.
- Use H13g regressions and improvements as the next fixed corpus for calibration and route-feature work.
