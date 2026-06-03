# Hard AI H12 Mortal Large Fix Plan

Last updated: 2026-05-31

H12 starts from the clean H11 Mortal report, not from manual table feel.

Baseline report:

```bash
node games/majiang/scripts/benchmark-hard-vs-mortal.js --out /tmp/h11-fix4-full-real.json
```

Observed clean baseline:

```text
rows: 160
mortalRate: 62.5%
actionTypeRate: 100%
riichiRate: 98.75%
unknown: 0
stale: 0

large: 54
  tile-choice: 43
  tile-defense: 9
  riichi-missed: 2
```

This means the old `55 unknown` problem is no longer the thing to tune around. H12 should treat the remaining `large` rows as real comparable disagreements.

Current H12 execution status:

- P0 candidate-level Hard diagnostics is delivered for benchmark opt-in only.
- P1 no-pressure discard shape v1 is delivered for hard-only, no-pressure, same-xiangting near-tie review.
- R0 hard discard evaluator light refactor is delivered as a behavior-preserving mount-point cleanup.
- P2 low-danger defense tie-break v1 is delivered for hard-only pressure-side review.
- P3 early/mid no-pressure thin tanki riichi exception is delivered for hard-only riichi review.
- P4 no-pressure same-xiangting shape v2 is delivered for hard-only 0-3 xiangting shape review and strong same-xiangting shape override.
- P5 fixed-state tile-choice corpus and attribution is delivered as a diagnosis-only step. It adds compact decision context to Mortal benchmark rows and a report-to-corpus script, but it does not change Hard policy or decision strategy.
- P6/P7 strategy patches were tested and retired. The current clean base removes the no-pressure recalibrated score, P6 fixed fixture replay gate, and no-pressure backstep review module after real-report regression/overfitting evidence.
- P1/P4 remain conservative in one important way: no-pressure shape review still cannot choose a worse-xiangting discard. The historical P4 slice was `39` all-no-pressure `tile-choice large` rows: about `30` same-xiangting rows and `9` Mortal worse-xiangting/backstep rows.
- Latest P1 report: `/tmp/h12-p1-hard-vs-mortal-real.json`.
- Latest R0 behavior-check report: `/tmp/h12-r0-hard-vs-mortal-real.json`.
- Latest P2 report: `/tmp/h12-p2-hard-vs-mortal-real.json`.
- Latest P3 report: `/tmp/h12-p3-hard-vs-mortal-real.json`.
- Latest P4 report: `/tmp/h12-p4-hard-vs-mortal-real.json`.
- P5 generated corpus path: `/tmp/h12-p5-hard-tile-choice-corpus.json`.

Observed P1 result versus P0:

```text
rows: 160 -> 160
mortalRate: 62.5% -> 65.0%
large: 54 -> 51
no-pressure tile-choice large: 43 -> 40
tile-defense: 9 -> 9
riichi-missed: 2 -> 2
unknown: 0 -> 0
stale: 0 -> 0
```

Observed R0 result versus P1:

```text
rows: 160 -> 160
mortalRate: 65.0% -> 65.0%
large: 51 -> 51
no-pressure tile-choice large: 40 -> 40
tile-defense: 9 -> 9
riichi-missed: 2 -> 2
unknown: 0 -> 0
stale: 0 -> 0
```

Observed P2 result versus R0:

```text
rows: 160 -> 160
exact matches: 104 -> 106
mortalRate: 65.0% -> 66.25%
large: 51 -> 48
tile-choice large: 40 -> 40
tile-defense large: 9 -> 6
riichi-missed large: 2 -> 2
unknown: 0 -> 0
stale: 0 -> 0
hardDefenseTiebreak modes:
  keep-current: 155
  same-xiangting-low-danger: 3
  low-pressure-soft-fold: 1
```

One additional `riichi-missed` bucket row appears in the P2 report, but it is a near `qDelta=0` riichi-flag mismatch where the discard tile matches. Treat this as a tracking note, not a P2 large regression.

Observed P3 result versus P2:

```text
rows: 160 -> 160
exact matches: 106 -> 107
mortalRate: 66.25% -> 66.87%
large: 48 -> 48
tile-choice large: 40 -> 42
tile-defense large: 6 -> 6
riichi-missed bucket: 3 -> 0
riichi-missed large: 2 -> 0
unknown: 0 -> 0
stale: 0 -> 0
```

P3 fixed the targeted leak: `h10-right-20260614-2-9` now matches Mortal exactly as `m8+riichi`, and no row remains in the `riichi-missed` bucket. The total `large` count did not drop because the new riichi changes later round trajectory and exposes new `tile-choice` large rows. Treat that as evidence for later tile-choice work, not as a P3 riichi failure.

Observed P4 result versus P3:

```text
rows: 160 -> 160
exact matches: 107 -> 107
mortalRate: 66.87% -> 66.87%
large: 48 -> 47
tile-choice large: 42 -> 39
tile-defense large: 6 -> 6
riichi-missed bucket: 0 -> 1
riichi-missed large: 0 -> 1
unknown: 0 -> 0
stale: 0 -> 0
```

P4 did reduce the targeted no-pressure `tile-choice large` bucket, but it did not fully pass the soft acceptance bar because the changed self-play trajectory exposed one new no-pressure `riichi-missed` row and one `kan` action-type disagreement. Keep the P4 implementation because the deterministic fixtures and intended same-xiangting behavior are useful, but do not treat P4 as a complete tile-choice fix. The next step should focus on separating true same-state discard improvements from trajectory drift, then decide whether P5 should add a narrow no-pressure backstep gate or recalibrate hard EV / shape penalties.

Observed P5 direction:

- P5 is a diagnostic/corpus phase, not a strength phase.
- `benchmark-hard-vs-mortal.js` now records benchmark-only `decisionContext` for each row: compact round context, target hand snapshot, rivers, melds, riichi states, candidate summaries, and the local discard.
- `analyze-hard-tile-choice-corpus.js` filters `tile-choice` + `large` rows from the P4 report and emits compact fixed-state rows with Hard candidate diagnostics, Mortal q information, and attribution tags.
- Attribution categories include same-xiangting, Mortal backstep shape, Hard EV favoring local against Mortal, ranking overriding Hard EV, shape-score suspect, route/dora/five, stable disagreement, and trajectory-introduced.
- Regenerating the P4 report after adding `decisionContext` produced a current fixed-state corpus of `44` rows, not the older `39`-row historical P4 slice. The regenerated corpus has `35` same-xiangting rows, `9` Mortal backstep rows, `44/44` fixed-state rows, and `0` missing decision contexts. The script intentionally reports the actual input slice instead of hard-coding the historical count.
- Current P5 summary recommends `prioritize-hard-ev-and-shape-recalibration`: primary categories are `ev-prefers-local-against-mortal=16`, `shape-score-suspect=10`, `mortal-backstep-shape=9`, `route-dora-or-five=8`, and `ranking-overrode-hard-ev=1`.
- P5 output should guide the next clean strategy design toward route/dora/five modeling, richer hand-route features, or a supervised candidate scorer. It should not justify another broad shape patch by itself.

## Scope

In scope:

- four-player `hard` ordinary Mahjong only
- formal BaseAI path only
- discard and riichi alignment only
- deterministic fixtures derived from H11 large rows
- small evaluator improvements with smoke coverage
- richer benchmark diagnostics

Out of scope:

- TypeScript migration
- `ai-controller.js` activation
- Mortal automatic tuning
- realtime frontend AI analysis panel
- call/reaction Mortal scoring
- sanma / two-player hard
- supernatural AI
- neural model inference inside gameplay

## Code Audit

The current large disagreements map to real code boundaries:

- `games/majiang/engine/ai/discard-evaluator.js`
  - builds all discard candidates, but the benchmark row only stores the selected candidate's `metrics` / `hardMetrics`
  - keeps xiangting as the first gate
  - for hard same-xiangting candidates, compares `hardEvScore`, then live ukeire, live waits, wait quality, then old core tie-breaks
  - after R0, candidate construction/ranking/review/diagnostics live behind separate support modules rather than being packed into the evaluator entry

- `games/majiang/engine/ai/support/hard-ev.js`
  - current formula is shallow:

```text
hardEvScore =
  liveUkeireCount * 3
  + liveTingpaiCount * 8
  + waitQualityScore * 4
  + contextualHandValueEstimate
```

  - it does not score discard-leave shape, isolated tile value, yaku route, dora retention, or multi-draw future value

- `games/majiang/engine/ai/support/wait-quality.js`
  - classifies final waits, but not the quality of the hand shape before tenpai
  - cannot explain 2-4 xiangting large rows where Mortal prefers keeping different blocks

- `games/majiang/engine/ai/support/danger-model.js`
  - only models riichi opponents
  - produces coarse integer danger buckets
  - now also provides P2 readonly `safetyRank`, `defenseTileRank`, and `safetyReasons` for hard pressure-side tie-breaks
  - does not estimate open-hand / damaten threat

- `games/majiang/engine/ai/support/hard-push-fold.js`
  - cross-xiangting fold only triggers for `careful` pressure and pressure score >= 8
  - if the attack tile has danger <= `safeDangerMax`, it returns `hard-push-fold-attack-already-safe`
  - P2 handles the lower-pressure / low-danger tie-break layer through `hard-defense-tiebreak.js` rather than widening H7 push/fold

- `games/majiang/engine/ai/evaluators/riichi-evaluator.js`
  - hard rejects immediately when `waitQualityScore < minWaitQualityScore`
  - the current hard policy has `minWaitQualityScore: 8`
  - H11 found middle/early no-pressure tanki examples with live wait 3 and value 23 where Mortal prefers riichi, but hard returns `hard-riichi-wait-quality-too-low`

- `games/majiang/scripts/benchmark-hard-vs-mortal.js`
  - now has clean `mortalCandidates`, `localMortalCandidate`, `bestMortalCandidate`, q-delta severity, and fresh Mortal record selection
  - now includes opt-in hard candidate diagnostics, including compact shape and P2 safety fields, for benchmark/report inspection

## H12 Problems To Fix

### P0: Add Candidate-Level Diagnostics

Why first:

- The report tells us Mortal's candidate q-values, but only the final local Hard candidate's metrics.
- For every large row, we need to see why Hard selected its tile over the Mortal tile.
- This is instrumentation, not AI tuning.

Implementation direction:

- Add a hard-only optional candidate diagnostics field to discard decisions, for example `hardCandidateMetrics`.
- Keep it compact and readonly:
  - `tileCode`
  - `tileIndex`
  - `isDrawDiscard`
  - `dangerScore`
  - `xiangting`
  - `tingpaiCount`
  - `ukeireCount`
  - `handValueEstimate`
  - `hardEvScore`
  - `liveUkeireCount`
  - `liveTingpaiCount`
  - `waitQualityScore`
  - `bestWaitType`
  - `hardPushFoldMode` when applicable
- Include this field in `benchmark-hard-vs-mortal.js` rows, at least for hard rows.

Acceptance:

- `validate-hard-ai.js` confirms hard decisions can expose candidate diagnostics without changing `metrics`.
- `validate-hard-vs-mortal-benchmark.js` confirms rows include compact local candidate diagnostics.
- easy/normal outputs remain unchanged except for no added fields.

### P1: No-Pressure Discard Shape v1

Observed after P0 diagnostics:

```text
large: 54
  tile-choice: 43
  tile-defense: 9
  riichi-missed: 2

no-pressure large rows: 45
no-pressure discard best rows: 43
  same xiangting local vs Mortal best: 37
  Mortal best worse xiangting: 6
  same-xiangting near hardEv tie, abs delta <= 10: 23
  same-xiangting where Hard EV favors local: 27
  same-xiangting where Hard EV favors Mortal best: 1
```

This narrows P1: most large no-pressure rows are **same xiangting** and often near-ties under current `hardEvScore`. The first improvement should not be recursive EV or full Mortal imitation. It should add a conservative shape tie-break so Hard stops choosing useful middle tiles over Mortal-like cleanup tiles when immediate EV is nearly equal.

Important boundary:

- Some Mortal best rows are worse xiangting than local. P1 should **not** enable general no-pressure backstep yet.
- Some rows have `riichi-illegal-discard-choice` in the local riichi review. P1 can still improve discard shape, but should not tune against a Mortal recommendation if local legality is ambiguous.
- Pressure rows stay out of P1; P2 handles low-danger defense tie-breaks.

Representative P1 rows:

```text
h10-bottom-20260607-1-4
Hard:   p7
Mortal: s9
qDelta: 4.952443
pressure: 0
xiangting: both 3
Hard candidate:   hardEv 567, live 21, waitQuality 76, value 32
Mortal candidate: hardEv 565, live 21, waitQuality 76, value 30
Interpretation: current score slightly overvalues keeping terminal cleanup / undervalues useful middle retention.

h10-bottom-20260607-1-5
Hard:   s9
Mortal: m9
qDelta: 1.085936
pressure: 0
xiangting: both 3
Hard candidate:   hardEv 643, live 25, waitQuality 84, value 32
Mortal candidate: hardEv 641, live 25, waitQuality 84, value 30
Interpretation: near-tie terminal cleanup needs a stable shape preference, not handValueEstimate noise.

h10-bottom-20260531-0-3
Hard:   s4
Mortal: m2
qDelta: 2.520555
pressure: 0
xiangting: both 2
Hard candidate:   hardEv 334, live 16, waitQuality 32, value 30
Mortal candidate: hardEv 334, live 16, waitQuality 32, value 30
Interpretation: exact hardEv tie currently falls through to local ordering; shape tie-break should decide.
```

Implementation direction:

- Add a hard-only support module, e.g. `engine/ai/support/discard-shape.js`.
- Export `evaluateHardDiscardShape(adapter, runtime, seatKey, shoupaiAfterDiscard, discardTileCode, options)`.
- Return compact readonly metrics:
  - `discardShapeScore`
  - `discardTileRole`
  - `keptUsefulMiddleCount`
  - `weakTerminalCleanupBonus`
  - `isolatedHonorCleanupBonus`
  - `middleTileCutPenalty`
  - `fiveOrRedFiveCutPenalty`
  - `doraRetentionPenalty`
  - `pairOrBlockBreakPenalty`
  - `reasons`
- Integrate only for `hard` and only when `pushFoldState.pressureScore === 0`.
- Preserve xiangting priority for P1 v1:
  - compare `xiangting` first exactly as today
  - compare hard EV as today
  - if same xiangting and hard EV is within a policy window, compare `discardShapeScore`
  - then fall back to existing `tingpaiCount`, `ukeireCount`, hand value, draw discard, tile index
- Add policy fields under `hard-policy.discard`:
  - `enableNoPressureShapeReview: true`
  - `shapeTieBreakMaxHardEvDelta: 12`
  - `shapeScoreWeight: 1`
  - no-pressure shape review preserves xiangting priority

Scoring principles for v1:

- Favor discarding isolated terminals and isolated non-yakuhai honors in early/far hands.
- Penalize cutting middle tiles that keep two-sided or multi-sided growth.
- Penalize cutting `5`, red five, dora, and dora-adjacent tiles unless they are clearly isolated or duplicate-clogged.
- Penalize breaking complete blocks, pairs, and useful two-tile blocks.
- Keep the score coarse and explainable; do not add multi-draw recursion in P1.

Acceptance fixtures:

- `hard-mortal-no-pressure-shape-terminal-smoke`
  - no pressure, same xiangting, near hard EV tie; hard should choose Mortal-like terminal cleanup over a useful middle cut.
- `hard-mortal-no-pressure-shape-tiebreak-smoke`
  - no pressure, exact hard EV tie; hard should not fall through to incidental tile order.
- `hard-mortal-no-pressure-five-retention-smoke`
  - no pressure, same xiangting; hard should avoid cutting useful five/red-five/dora-adjacent tile when a weaker cleanup tile exists.
- `hard-no-pressure-existing-ev-regression-smoke`
  - current H3 live-ukeire and wait-quality smokes still pass; shape score must not override clear EV wins.
- `hard-no-pressure-no-backstep-smoke`
  - if Mortal-like tile worsens xiangting, P1 v1 should not choose it unless a later phase explicitly enables backstep.

Soft report goal:

- Keep `unknown=0` and `stale=0`.
- Reduce no-pressure `tile-choice` large count.
- Reduce same-xiangting near-tie large rows.
- Do not increase `tile-defense` large or `riichi-missed`.
- Accept that the 6 no-pressure worse-xiangting Mortal rows may remain large until a later controlled backstep phase.

### P2: Low-Danger Defense Tie-Break

Status: delivered in H12 P2.

Observed issue:

```text
large tile-defense: 9
average qDelta: 3.371
all are comparable
```

Several rows show Hard thinks the chosen attack tile is already safe because `dangerScore <= 1`, but Mortal strongly prefers another low-risk tile.

Representative rows:

```text
h10-top-20260607-1-11
Hard:   m8
Mortal: z6
qDelta: 6.215204
pressureScore: 8
reason: hard-push-fold-attack-already-safe

h10-bottom-20260607-1-11
Hard:   p2
Mortal: p1
qDelta: 5.228300
pressureScore: 4
reason: hard-push-fold-pressure-too-low

h10-bottom-20260607-1-12
Hard:   s8
Mortal: p1
qDelta: 4.646749
pressureScore: 4
reason: hard-push-fold-attack-already-safe
```

Implemented direction:

- Extended hard danger output with readonly `safetyRank`, `defenseTileRank`, and `safetyReasons`.
- Kept `dangerScore` compatibility, but use the secondary rank when:
  - pressureScore > 0
  - candidates are same xiangting
  - danger scores are equal or both very low
- Considered safety features:
  - genbutsu against one or more threats
  - terminal/honor with visible count
  - suji plus kabe
  - no-chance versus one-chance
  - dora adjacency penalty
  - multi-threat safety aggregation
- Added `hard-defense-tiebreak.js` as a hard-only review layer with modes `keep-current`, `same-xiangting-low-danger`, and `low-pressure-soft-fold`.
- Kept the low-pressure soft fold narrow: pressure `4`, non-protected hand, current low-but-not-best danger, at most one xiangting loss, and bounded hard EV loss.
- Did not make this a full betaori engine in H12.

Acceptance fixtures:

- `hard-defense-safety-rank-smoke`
  - safety ordering distinguishes genbutsu, visible honors / kabe, one-chance, and unknown middle tiles
- `hard-low-danger-same-xiangting-smoke`
  - same xiangting, pressure > 0, both low danger, choose the better Mortal-like safe tile
- `hard-low-pressure-soft-fold-smoke`
  - pressure score 4 still uses low-danger tie-break when no clear attack upside is lost
- `hard-protected-push-not-soft-fold-smoke`
  - protected good-wait / high-value push is not pulled into a low-pressure soft fold
- existing `hard-tenpai-good-wait-push-smoke` and `hard-dealer-value-push-smoke` still pass

Soft report result:

- R0 -> P2 reduced `tile-defense large` from `9` to `6`.
- Total `large` fell from `51` to `48`.
- `unknown=0` and `stale=0` remained stable.
- Remaining defense large rows probably need open-hand / damaten threat modeling or multi-discard betaori, not more broadening of this narrow P2 tie-break.

### P3: Thin-Wait Riichi Gate

Status: delivered in H12 P3.

Observed issue:

Only 2 large rows are riichi disagreements, but both are clear:

```text
h10-right-20260614-2-9
Hard:   m8 no-riichi
Mortal: m8 riichi
qDelta: 0.511617
reason: hard-riichi-wait-quality-too-low
remainingTiles: 35
bestWaitType: tanki
liveTingpaiCount: 3
waitQualityScore: 3
handValueEstimate: 23
pressureScore: 0

h10-right-20260614-2-10
Hard:   m9 no-riichi
Mortal: m9 riichi
qDelta: 0.935361
reason: hard-riichi-wait-quality-too-low
remainingTiles: 33
bestWaitType: tanki
liveTingpaiCount: 3
waitQualityScore: 3
handValueEstimate: 23
pressureScore: 0
```

Implementation direction:

- Kept bad-wait caution under pressure and late rounds.
- Added an early/mid no-pressure thin-wait exception:
  - no riichi pressure
  - remaining tiles above a policy threshold
  - live wait count at least 3
  - hand value above a policy threshold
  - discard danger is low
- Policy names:
  - `allowNoPressureThinRiichi`
  - `thinRiichiMinRemainingTiles`
  - `thinRiichiMinLiveTingpai`
  - `thinRiichiMinHandValue`
  - `thinRiichiMaxDiscardDanger`
- Did not relax late bad waits or pressure thin waits.

Acceptance fixtures:

- `hard-mortal-thin-tanki-riichi-smoke`
  - no pressure, mid round, tanki live 3, hand value clears the thin-riichi threshold: hard should riichi
- `hard-thin-tanki-late-no-riichi-smoke`
  - late / too-few-remaining-tile thin tanki still rejects
- `hard-thin-tanki-pressure-no-riichi-smoke`
  - pressure-side thin tanki still rejects
- `hard-thin-tanki-danger-discard-no-riichi-smoke`
  - thin tanki with a nonzero discard danger still rejects
- existing `hard-late-bad-wait-no-riichi-smoke` and `hard-pressure-no-thin-riichi-smoke` still reject broader unsafe cases

Soft report goal:

- Delivered: `/tmp/h12-p3-hard-vs-mortal-real.json` reduces `riichi-missed large` from `2` to `0`, and total `riichi-missed` bucket rows from `3` to `0`.

### P4: No-Pressure Same-Xiangting Shape v2

Status: delivered in H12 P4, with a mixed soft-report result.

Observed issue after P3:

```text
tile-choice large: 42
pressureScore=0 / neutral: 42
same-xiangting local vs Mortal best: 34
Mortal worse-xiangting / backstep rows: 8
```

Implementation direction:

- Expanded hard-only shape review from far hands only to `shapeReviewMinXiangting: 0`.
- Kept `pressureScore === 0` as a hard boundary; pressure defense and push/fold are unchanged.
- Kept xiangting as the first gate; P4 still does not allow no-pressure backstep.
- Preserved the existing near-tie shape rule when `hardEvScore` delta is within `12`.
- Added a hard-only strong shape override for non-tenpai 1-3 xiangting candidates:
  - same xiangting only
  - shape delta at least `18`
  - hard EV loss at most `80`
  - tenpai `xiangting=0` remains near-tie only
- Kept the P0/P1 compact `hardCandidateDiagnostics[].shape` fields for benchmark inspection.

Acceptance fixtures:

- `hard-shape-low-xiangting-terminal-smoke`
- `hard-shape-low-xiangting-five-retention-smoke`
- `hard-shape-strong-override-smoke`
- `hard-shape-tenpai-near-tie-only-smoke`
- `hard-shape-no-backstep-still-smoke`
- `hard-shape-clear-ev-advantage-regression-smoke`

Soft report result:

- P3 -> P4 reduced `tile-choice large` from `42` to `39`.
- `unknown=0` and `stale=0` remained stable.
- `tile-defense large` stayed at `6`.
- One `riichi-missed large` row reappeared because P4 changed the deterministic self-play trajectory into a no-pressure kanchan tenpai where Mortal wants riichi and Hard still rejects on `hard-riichi-wait-quality-too-low`.
- One `action-type` large row appeared where Mortal chooses `kan`; H10 still only implements local discard/riichi evaluation for Hard, so this is tracked as a later call/kan alignment gap.
- Conclusion: P4 is structurally useful but not enough. The remaining large rows need either a fixed-state decision corpus, a narrower P5 no-pressure backstep gate, or hard EV / shape recalibration rather than more broad same-xiangting patching.

### P5: Fixed-State Corpus And Attribution

Status: delivered as diagnosis-only and kept as the current clean base.

P5 corpus result:

- `/tmp/h12-p5-hard-tile-choice-corpus.json` contains `44` fixed-state rows from the regenerated P4 report.
- `35` rows are same-xiangting local-vs-Mortal tile-choice disagreements.
- `9` rows are Mortal worse-xiangting / backstep shape rows and are explicitly left out of the current runtime strategy.
- Primary categories are `ev-prefers-local-against-mortal`, `shape-score-suspect`, `ranking-overrode-hard-ev`, `route-dora-or-five`, and `mortal-backstep-shape`.

P6/P7 retirement note:

- P6 promoted several fixed P5 rows into fixtures and added a hard-only no-pressure recalibrated score. It passed local deterministic checks but did not improve the continuous self-play report in a stable way: `/tmp/h12-p6-hard-vs-mortal-real.json` had `104` exact matches, `49` large disagreements, and `tile-choice large=42`.
- P7 added a hard-only no-pressure backstep review as an experiment. The enabled real report `/tmp/h12-p7-backstep-enabled-hard-vs-mortal-real.json` regressed to `96` exact matches and `57` large disagreements.
- Both patches are now removed from the runtime and validation chain. The retained asset is P5's corpus/analyzer, because it is diagnostic and does not steer gameplay by itself.
- Next strategy work should start from P5 categories and model route/dora/five value explicitly, or use the corpus as data for a separate candidate scorer, rather than adding more shape/backstep if-else gates.

### H13 Follow-Up: Mortal Ranker Experiments

Status: started outside gameplay.

H13 uses the retained P5 candidate diagnostics and Mortal q-values to build candidate-level JSONL datasets, compare simple feature baselines, and train an optional LightGBM LambdaRank model. H13c prepares the isolated `/tmp/h13-ranker-venv` environment and runs smoke plus small real held-out experiments. H13d then cleans the experimental base by removing report-result leakage such as `state.bucket` from the default feature schema and adding protected current-hard override evaluation. H13f adds feature ablation and per-state diagnostics; H13g adds native hand/route features from benchmark-only `decisionContext`. This is deliberately not a runtime policy patch: formal hard decisions remain unchanged until a held-out model beats current hard strongly enough to justify an H14 shadow scorer.

Environment commands:

```bash
node games/majiang/scripts/setup-hard-mortal-ranker-env.js --dry-run
node games/majiang/scripts/setup-hard-mortal-ranker-env.js
node games/majiang/scripts/validate-hard-mortal-ranker-env.js --python /tmp/h13-ranker-venv/bin/python
node games/majiang/scripts/run-hard-mortal-ranker-experiment.js --smoke --python /tmp/h13-ranker-venv/bin/python --progress
node games/majiang/scripts/run-hard-mortal-ranker-native-experiment.js --python /tmp/h13-ranker-venv/bin/python --progress --out /tmp/h13g-native-ranker-experiment-report.json
```

H13c real result:

- heldout `153` dataset states
- current-hard exact `63.40%`
- always-pick model exact `67.97%`
- large `49 -> 46`
- model improved `24` states and regressed `23`, so H13d treats it as a promising but unsafe scorer

H13d success is not raw score chasing. It first requires a runtime-safe feature schema, a passing leakage guard, and an override sweep where current-hard exact choices are not casually destroyed.

H13d real result:

- `/tmp/h13d-ranker-experiment-real-report.json`
- heldout `153` dataset states / `1449` candidate rows
- current-hard exact `63.40%`, large `49`
- model-always-pick exact `64.71%`, large `49`
- best large-reducing confidence override was margin `0.50`, large `47`, but it regressed `8` current-hard exact states
- recommended gate is `no-override`; this confirms the clean base is useful for diagnosis, but the current feature set is not stable enough for H14 shadow scoring

H13f ablation result:

- `/tmp/h13f-ranker-ablation-report.json`
- full runtime-safe, no-shape, core-only, and no-hard-ev schemas all remained `not-ready`
- no-shape and core-only increased current-hard exact regressions, so the immediate issue is not simply "shape features are poisoning the model"
- no-hard-ev also remained unsafe, so the model is not just over-copying Hard EV either
- next direction is richer native hand/route representation plus confidence calibration, not another blind data scale-up

H13g native feature result:

- `/tmp/h13g-native-ranker-experiment-report.json`
- reuses H13e reports; no new Mortal sampling
- train `617` states / `5801` candidate rows; heldout `307` states / `3021` candidate rows
- current-hard exact `68.40%`, large `82`
- native full always-pick exact `66.12%`, large `93`, hard-exact regressions `37`
- native no-shape always-pick exact `64.50%`, large `100`, hard-exact regressions `39`
- best native coverage slice was no-shape margin `0.30`: exact `69.38%`, large `81`, but hard-exact regressions were still `12`
- recommended gate remains `no-override`; native features are diagnostic progress, not runtime-ready scorer evidence

## H12 Implementation Order

1. P0 diagnostics first. Delivered.
   - Add local candidate diagnostics.
   - Update benchmark report shape smoke.
   - Re-run the current report to make sure `unknown=0` and `stale=0` remain true.

2. P1 no-pressure shape scoring. Delivered conservatively.
   - Keep this conservative.
   - Avoid overfitting to exact seed IDs.
   - Use fixed hand fixtures to lock behavior.
   - Keep shape as a near-tie breaker only; do not allow no-pressure backstep in P1.

3. P2 low-danger defense tie-break. Delivered.

4. P3 thin-wait riichi gate. Delivered.

5. P4 no-pressure same-xiangting shape v2. Delivered with mixed soft-report result.

6. P5 fixed-state tile-choice corpus and attribution. Delivered as diagnosis only.

7. P6 fixed-state fixtures and no-pressure same-xiangting EV/shape recalibration. Retired and removed after continuous-report overfitting.

8. P7 no-pressure backstep gate. Retired and removed after enabled real-report regression.

9. Re-run Mortal report and record before/after after each future policy change.

## Test Plan

Required deterministic checks:

```bash
node games/majiang/scripts/validate-easy-ai.js
node games/majiang/scripts/validate-normal-ai.js
node games/majiang/scripts/validate-hard-ai.js
node games/majiang/scripts/validate-hard-headless-stats.js
node games/majiang/scripts/validate-hard-promotion-gates.js
node games/majiang/scripts/validate-hard-tile-choice-corpus.js
node games/majiang/scripts/validate-hard-vs-mortal-benchmark.js
node scripts/validate.mjs quick
node scripts/validate.mjs mortal
git diff --check
```

Required P5 corpus generation:

```bash
node games/majiang/scripts/analyze-hard-tile-choice-corpus.js \
  --report /tmp/h12-p4-hard-vs-mortal-real.json \
  --baseline /tmp/h12-p3-hard-vs-mortal-real.json \
  --out /tmp/h12-p5-hard-tile-choice-corpus.json
```

Report comparison fields:

- `unknown` must remain 0
- `stale` must remain 0
- `tile-choice` large should not regress during no-pressure shape phases
- `tile-defense` large should not regress during no-pressure shape phases
- `riichi-missed large` should not increase during no-pressure shape phases
- exact `mortalRate` is useful but not the only score

## Success Criteria

Hard H12 is successful when:

- candidate-level diagnostics make every top large row explainable without manual reconstruction
- deterministic H12 fixtures pass
- easy/normal/hard existing smoke tests still pass
- `unknown=0` and `stale=0` remain true in Mortal reports
- large disagreements move in the right direction without opening new obvious regression buckets

H12 should not claim expert strength. Its job is to convert H11's clean large disagreements into targeted evaluator improvements.
