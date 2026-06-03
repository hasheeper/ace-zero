# Hard AI H13h: Disagreement Adjudication Corpus

## Summary

H13h starts the fixed-position review stage for the H13g heldout disagreements.

It does not change hard AI behavior. It exports a compact adjudication corpus so the remaining disagreements can be labeled as:

- normal disagreement
- acceptable Mortal preference
- hard suspect mistake
- hard likely bad move
- defense tradeoff
- route/backstep review
- insufficient context

## Output

Command:

```bash
node games/majiang/scripts/analyze-hard-disagreement-corpus.js --out /tmp/h13h-hard-disagreement-adjudication-corpus.json
```

Output:

- `/tmp/h13h-hard-disagreement-adjudication-corpus.json`

Teacher provenance:

- Config: `/Users/liuhang/Documents/Mortal/mortal/config.real.toml`
- `state_file`: `/Users/liuhang/Documents/Mortal/models/model_v4_20240308_best_min.pth`
- `best_state_file`: `/Users/liuhang/Documents/Mortal/models/model_v4_20240308_best_min.pth`

## Corpus Slice

Default export excludes normal small-q disagreements and includes only the fixed-review queue:

| Band | Count |
| --- | ---: |
| `review` (`0.15 < qDelta <= 1.0`) | 39 |
| `serious-suspect` (`qDelta > 1.0`) | 43 |
| Total | 82 |

Breakdown:

| Slice | Count |
| --- | ---: |
| `tile-choice` | 67 |
| `tile-defense` | 15 |
| no-pressure | 67 |
| pressure | 15 |
| same-xiangting | 60 |
| Mortal worse-xiangting | 20 |
| Mortal better-xiangting | 2 |

Suggested review classes:

| Class | Count |
| --- | ---: |
| `fixed-position-review` | 31 |
| `serious-suspect-review` | 14 |
| `same-xiangting-serious-suspect` | 22 |
| `defense-risk-review` | 15 |

## Model Signals

The corpus also attaches the H13g native ranker predictions for reference:

| Model | Exact Improvements In Corpus | Changed | Same |
| --- | ---: | ---: | ---: |
| `runtime-safe-native-v1` | 25 | 43 | 39 |
| `runtime-safe-native-no-shape` | 24 | 39 | 43 |

These numbers are diagnostic only. They do not justify model override by themselves, because exact-match regressions are outside this corpus and remain the main blocker.

## How To Use

For each row, review:

- `fixedState`: hand, rivers, melds, dora, scores, round counters
- `localDecision`: current hard discard
- `bestMortalCandidate`: Mortal best discard and q value
- `localCandidate` / `mortalCandidate`: compact hard diagnostics for both tiles
- `candidateTable`: all local discard candidates with Mortal q labels where available
- `modelSignals`: whether H13g models also prefer the Mortal tile
- `adjudication`: empty label slot for manual review

Do not treat `serious-suspect` as automatically proven bad. It means the q gap is large enough to deserve fixed-position judgment.

## Next Step

H13h should label the 82 rows first, then decide whether the next action is:

- a conservative override gate for high-confidence no-pressure tile-choice
- a separate defense review path
- route/backstep fixture work
- no runtime change because the row is an acceptable teacher preference difference

## P1 Auto-Adjudication

P1 adds a first-pass machine triage layer. It does not mark rows as human-reviewed and does not change hard AI behavior.

Command:

```bash
node games/majiang/scripts/adjudicate-hard-disagreement-corpus.js --out /tmp/h13h-hard-disagreement-adjudication-labeled.json
```

Output:

- `/tmp/h13h-hard-disagreement-adjudication-labeled.json`

First-pass label counts:

| Suggested label | Count | Meaning |
| --- | ---: | --- |
| `hard-likely-bad-move` | 14 | P0 same-xiangting / high-qDelta candidates where fixed review should start. |
| `hard-suspect-mistake` | 24 | Strong enough signal to inspect, but not enough to call likely bad automatically. |
| `defense-tradeoff-review` | 15 | Pressure/defense rows; keep separate from no-pressure tile-choice. |
| `route-backstep-review` | 10 | Mortal chooses worse xiangting; route/backstep judgment required. |
| `mortal-preference-acceptable` | 19 | Review-band tile-choice rows without strong objective support. |

Priority counts:

| Priority | Count | Queue |
| --- | ---: | --- |
| `P0` | 14 | Start manual review here. |
| `P1` | 29 | Serious suspect and defense rows. |
| `P2` | 20 | Lower-q review rows and route/backstep cases. |
| `P3` | 19 | Likely preference differences, still unreviewed. |

Important caveat:

- `hard-likely-bad-move` is still a machine label, not a final human judgment.
- All `82` rows remain `manualReviewRequired`.
- The labeler intentionally keeps `defense` and `Mortal worse-xiangting` cases out of direct bad-move buckets.

The recommended human review order is:

1. Review the `14` P0 likely-bad rows.
2. Split the `24` suspect rows into fixture-worthy vs acceptable preference.
3. Review the `15` defense rows separately.
4. Keep the `10` backstep rows for route/backstep design, not simple discard sorting.

## P0 Likely-Bad Review

P0 adds a focused review report for the `14` rows that the auto-adjudicator marked as `hard-likely-bad-move`.

Command:

```bash
node games/majiang/scripts/analyze-hard-p0-likely-bad-review.js --out /tmp/h13h-p0-likely-bad-review.json
```

Output:

- `/tmp/h13h-p0-likely-bad-review.json`

This report still does not change hard AI behavior. It only turns the P0 queue into fixed-position review rows with:

- local tile vs Mortal tile
- compact local/Mortal candidate diagnostics
- sorted candidate table with Mortal q labels
- fixed state context
- model support summary
- suggested primary pattern and next action

P0 real slice:

| Slice | Count |
| --- | ---: |
| Total P0 rows | 14 |
| `tile-choice` | 14 |
| no-pressure | 14 |
| same-xiangting | 14 |

Primary patterns:

| Pattern | Count | Meaning |
| --- | ---: | --- |
| `shape-and-model-consensus-support-mortal` | 7 | Shape and both native rankers support Mortal; fixture-first. |
| `missing-runtime-feature-or-route-signal` | 5 | Hard EV/shape/danger are near-tied, but Mortal q gap is large; likely missing route/state features. |
| `shape-overprotects-local-against-model-consensus` | 1 | Current shape favors local, while Mortal and both native rankers prefer the other tile. |
| `single-model-support-high-q-review` | 1 | High q gap with one native model supporting Mortal; keep manual review first. |

Model support:

| Support | Count |
| --- | ---: |
| both native rankers support Mortal | 8 |
| one native ranker supports Mortal | 2 |
| no native ranker support | 4 |

Metric bands:

| Band | Count |
| --- | ---: |
| hard EV near tie | 11 |
| hard EV mildly prefers local | 2 |
| hard EV strongly prefers local | 1 |
| shape prefers Mortal | 7 |
| shape near tie | 6 |
| shape prefers local | 1 |

Human takeaway:

- These are not defense mistakes and not backstep cases; they are clean no-pressure same-xiangting tile-choice disputes.
- `7` rows are strong fixture candidates because Mortal, shape, and both native rankers point in the same direction.
- `5` rows are the important warning sign: current compact features cannot explain a large Mortal preference, so adding more shape rules is likely to overfit. These rows need fixed-position review for missing route features before strategy changes.
- The one shape-overprotect row is useful as a guardrail against reusing P4-style shape bonuses too aggressively.

## P0 Fixture-First Corpus

The next P0 slice extracts only the `fixture-first` rows from the P0 review report. This is deliberately narrower than all `14` P0 rows: it includes only rows whose suggested next action is `promote-to-deterministic-fixture-before-strategy-change`.

Command:

```bash
node games/majiang/scripts/build-hard-p0-fixture-first-corpus.js --out /tmp/h13h-p0-fixture-first-corpus.json
```

Output:

- `/tmp/h13h-p0-fixture-first-corpus.json`

Real output:

| Slice | Count |
| --- | ---: |
| fixture-first rows | 7 |
| no-pressure rows | 7 |
| both native rankers support Mortal | 7 |
| shape-and-model consensus rows | 7 |

These fixtures preserve:

- the fixed decision state
- current Hard tile
- Mortal teacher tile
- compact local and teacher candidate diagnostics
- full compact candidate table
- qDelta, metric bands, tile-pair theme, model signal summary
- an empty human review slot

This is still a static review corpus, not a runtime replay API. Its job is to lock the most credible P0 debt as stable evidence before any feature or strategy change.

## P0 Cleanup Guard

The first P0 runtime repair is intentionally narrower than Mortal exact alignment.

Goal:

- avoid clear no-pressure same-xiangting bad shape cuts
- do not force the exact Mortal tile when another cleanup tile is also reasonable
- do not override non-cleanup Hard EV conflicts such as useful-middle versus useful-middle

Implementation:

- hard-only discard ranking adds `enableNoPressureCleanupGuard`
- active only at `pressureScore === 0`
- active only for same-xiangting, non-tenpai candidates within `cleanupGuardMinXiangting..cleanupGuardMaxXiangting`
- allows isolated terminal / isolated honor / weak floating cleanup to beat protected cuts when:
  - shape delta is at least `12`
  - hard EV loss is at most `100`
- protected cut roles include value honors, useful middles, useful fives, floating middles/fives, and edge blocks

Fixture-first impact from the static P0 corpus:

| Old Hard | Teacher | New ranking intent |
| --- | --- | --- |
| `p6` | `p9` | select `p9` cleanup |
| `z6` | `m9` | select a cleanup terminal (`s1` in the compact fixture table), not the value honor |
| `z5` | `m9` | select `m9` cleanup |
| `p4` | `m6` | unchanged; not a cleanup-vs-protected-cut case |
| `z5` | `z3` | select `z3` isolated honor |
| `z4` | `z3` | select `z3` isolated honor |
| `z7` | `p9` | select `p9` cleanup |

This deliberately fixes the shape debt class, not the teacher-exact metric.
