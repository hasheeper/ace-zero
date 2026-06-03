# Hard AI Research and Plan

Last started: 2026-05-31

This is the working note for building `hard` ordinary Mahjong AI without TypeScript migration, deep-learning models, supernatural logic, or a large architecture rewrite.

## Short Answer

Pure hand-written local rules are not enough for `hard`.

`hard` should still be non-ML, but it needs to become a small evaluation engine:

- live tile accounting from visible tiles
- hand expected-value scoring, not only xiangting sorting
- better danger categories and fold selection
- push/fold comparison between attack value and deal-in risk
- riichi and call judgment that changes by wait quality, round phase, pressure, and score context
- deterministic smoke tests first, then headless simulation statistics

The current `BaseAI` evaluator structure can support this. The first step should be additive modules under `engine/ai/support/` and `engine/ai/evaluators/`, not a replacement of the runtime entrypoint.

## External Direction Scan

Initial research clones were kept outside the repo under `/tmp/ace-zero-majiang-ai-research/` to avoid vendoring third-party code into the project.

### kobalab/majiang-ai

Use as the closest practical reference.

Why it matters:

- JavaScript implementation.
- MIT licensed.
- Designed as the thinking routine for Dennou Mahjong.
- Has practical versions of tile accounting, discard selection, hand expected value, call evaluation, and riichi-pressure danger.

Useful ideas to reimplement cleanly:

- `SuanPai` style visible-tile accounting.
- `paijia` style tile-value estimation that uses dora, honors, and remaining tile shape.
- recursive `eval_shoupai` style expected value for 0-2 xiangting hands.
- `suan_weixian` style danger estimate from genbutsu, remaining shapes, and riichi pressure.
- discard selection that can choose safety when pressure is high and value is low.

Do not import it directly for now. Its model object and action format are different from Ace runtime, and direct dependency would pull us toward a second AI controller. Reimplement the small concepts inside our existing evaluator chain.

### critter-mj/akochan

Use as architecture inspiration only.

Why it matters:

- Strong traditional C++ Japanese Mahjong AI project.
- Shows the shape of a mature non-DL AI: hand analysis, tenpai probability estimation, expected-point comparison, betaori, tactics config, and self-match tuning.

Boundary:

- Its license is custom and restrictive for AI-source modification/redistribution. Do not copy code.
- The C++ stack is too heavy for our current browser/static JS runtime.

Useful ideas to imitate at a high level:

- separate attack expected value, defense expected value, and betaori expected value
- estimate opponent tenpai / threat state rather than only checking riichi
- tune tactics through config and self-match statistics

### MahjongRepository/mahjong

Use as a validation reference, not as the runtime AI.

Why it matters:

- Mature MIT Python riichi Mahjong calculator.
- Covers shanten, agari validation, hand cost, han/fu/yaku, and tests.

Boundary:

- Python runtime is not suitable for browser gameplay.
- Current project already has `majiang-core` through the adapter, so this is mainly a correctness reference when we add value/yaku tests.

### gimite/mjai

Use as benchmark/interoperability direction.

Why it matters:

- MJAI is a Japanese Mahjong AI game server/protocol ecosystem.
- It can help future external-bot benchmarking and deterministic match logs.

Boundary:

- Not needed for `hard v1` gameplay.
- Keep it as a later benchmark bridge after the hard evaluator is stable.

### Rule-based Browser AI Articles

Recent rule-based browser Mahjong AI writeups support the same direction:

- parameter-driven personalities
- shanten and acceptance based discard scoring
- multi-tier safe tile classification
- phase and score based attack/defense weighting
- headless simulation for tuning

This matches our needs better than adding a model dependency.

## Current Difficulty Standards

### easy

Goal: can play a legal ordinary four-player hand without looking broken.

Expected behavior:

- xiangting first
- simple ukeire and shape tie-breaks
- basic riichi
- basic chi/peng
- very light riichi-pressure safety
- can make obvious ordinary mistakes

Delivered status: implemented for `riichi-4p`.

### normal

Goal: a steadier ordinary player that makes fewer self-destructive choices.

Expected behavior:

- keeps easy's legality and speed baseline
- under riichi pressure, prefers lower-danger same-xiangting discards
- uses stricter riichi thresholds
- avoids flat speed-up calls that visibly damage hand shape
- still does not do deep opponent modeling or full push/fold EV

Delivered status: first milestone implemented for `riichi-4p`.

### hard

Goal: stronger ordinary Mahjong AI without cheating, supernatural logic, or neural inference.

Expected behavior:

- estimates live ukeire from visible tiles, not only own hand
- scores discard candidates by expected value and future acceptance
- recognizes better/worse waits
- folds competently against riichi and high-pressure calls
- decides push/fold by hand value, distance to tenpai, wall phase, seat/round/score context, and danger
- calls selectively for yaku, speed, and value while avoiding unsafe low-value openings
- declares riichi more contextually instead of only crossing static thresholds

Delivered status: H9 four-player Hard v1 is formally delivered through `AceMahjongBaseAI` for `riichi-4p`. H1-H8 foundation checks cover visible-tile accounting, hard danger, same-xiangting discard EV, first-pass riichi/call review, broader deterministic acceptance, headless hard-vs-normal statistics, first-pass cross-xiangting push/fold, and repeatable promotion gate reporting.

## Proposed Hard AI Shape

Keep the current entrypoint:

```text
AceMahjongBaseAI
-> discard-evaluator
-> riichi-evaluator
-> call-evaluator
-> defense-evaluator
-> difficulty policy
```

Add new hard-only support pieces:

```text
visible-tiles.js
  count known tiles from hand, rivers, melds, dora indicators, and dead/visible state when available

wait-quality.js
  classify waits: ryanmen, kanchan, penchan, shanpon, tanki, honor, live copies

danger-model.js
  combine genbutsu, suji, kabe/one-chance/no-chance, honor count, dora adjacency, and multi-threat pressure

hard-ev.js
  shallow cached expected-value score for discard/call/riichi candidates

round-context.js
  dealer, remaining wall, honba, riichi-stick, score rank, and late-leader pressure modifiers

hard-push-fold.js
  compare attack EV against defense risk and betaori fallback
```

These modules should be clean-room Ace implementations. If a borrowed idea maps to a permissive source, record the source in this document or code comments only when useful.

## Hard v1 Scope

`hard v1` should be a strong ordinary baseline, not a full expert bot.

In scope:

- four-player `riichi-4p` only
- no TypeScript migration
- no `ai-controller.js` activation
- no supernatural adapters
- no deep-learning model
- no wholesale dependency on third-party AI code
- deterministic smoke tests

Out of scope:

- sanma / two-player hard AI
- full opponent hand reading
- Monte Carlo rollout
- Mortal/NAGA benchmark as required pass condition
- personality profiles beyond policy constants
- browser UI for AI analysis

## Implementation Phases

### H0 Research Checkpoint

Status: started.

Deliverables:

- external direction scan
- licensing boundary
- Hard v1/v2 implementation plan

### H1 Live Tile Foundation

Status: delivered as a hidden Hard AI foundation smoke.

Add a support module for known/remaining tile counts.

Acceptance:

- visible own hand, all rivers, called meld tiles, dora indicators, and red-five normalization
- existing easy/normal tests still pass
- new unit-like smoke proves a discarded visible tile reduces hard ukeire

### H2 Hard Danger Model

Status: delivered as a hidden Hard AI foundation smoke.

Replace hard's use of the current simple `tile-danger` score with richer categories.

Acceptance:

- genbutsu is safest against each riichi opponent
- suji is safer than unknown middle tile
- no-chance / one-chance lowers danger
- dangerous dora-adjacent middle tile is avoided when folding
- multiple riichi opponents aggregate pressure

### H3 Hard Discard EV

Status: delivered as a hidden Hard AI foundation smoke.

Add hard-only candidate scoring after xiangting legality.

Acceptance:

- same xiangting candidates compare by live ukeire, live waits, wait quality, and hand value estimate
- hard keeps xiangting as the first gate; H3 does not intentionally fold across xiangting
- under careful riichi pressure, H2 safety remains ahead of hard EV
- `validate-hard-ai.js` covers live-ukeire discard, wait-quality scoring, and pressure safety smoke

Deferred:

- recursive 0-2 xiangting expected value
- full betaori / multi-discard fold sequencing
- point, wall phase, and placement-aware push/fold EV

### H4 Hard Riichi and Call Review

Status: delivered as a pre-promotion hidden Hard AI foundation smoke.

Make riichi/calls context-aware while `hard` was still hidden from the formal BaseAI entrypoint.

Acceptance:

- riichi good wait with enough remaining tiles is accepted
- late bad wait / low value / pressure can skip riichi
- hard accepts yaku-backed speed calls
- hard rejects unsafe low-value flat calls under pressure
- `validate-hard-ai.js` covers good-wait riichi, bad-wait no-riichi, pressure no-riichi, yakuhai call, and unsafe flat-call rejection

### H5 Hard Smoke Suite

Status: delivered as a pre-promotion hidden Hard AI acceptance smoke.

Broaden `games/majiang/scripts/validate-hard-ai.js` beyond the current H1-H4 deterministic foundation.

Delivered fixtures:

- `hard-current-turn-direct-discard`
- `hard-multi-riichi-defense-smoke`
- `hard-late-leader-safety-smoke`
- `hard-round-context-riichi-smoke`
- `hard-vs-normal-comparison-smoke`

Acceptance:

- pre-H9 BaseAI refused `hard` as a formal delivered difficulty; H9 replaces this with `hard-formal-controller-smoke`
- multi-opponent riichi pressure aggregates into stronger fold pressure
- late leading score context keeps safety ahead of higher EV danger
- dealer / honba / riichi-stick context can make a borderline push more aggressive
- hard-vs-normal fixed samples cover no-pressure discard EV, pressure defense, riichi, and call review

These checks were the precondition for H9 adding `hard` to `IMPLEMENTED_DIFFICULTIES` and `game-config.json`.

### H6 Headless Tuning

Status: delivered as a stats-first report, not as tuning automation.

After deterministic smoke is stable, add simulation stats. The first H6 gate is `games/majiang/scripts/validate-hard-headless-stats.js`; it runs a deterministic decision corpus and compares hard against normal.

Metrics:

- deterministic corpus samples
- hard advantages
- regressions
- pressure safety wins
- no-pressure EV wins
- riichi accept/reject counts
- call accept/reject counts

Goal:

- hard should have zero known regressions in the deterministic corpus
- hard should have at least one pressure-safety win and one no-pressure EV win
- riichi and call review should include both accept and reject evidence

Soft report:

- `node games/majiang/scripts/benchmark-hard-headless.js --seed 20260531 --rounds 8`
- outputs hule rate, deal-in rate, riichi/call rates, riichi/call counts per round, average score by seat, right-seat average score, and error count
- this is deliberately not a quick/CI hard gate and does not auto-tune constants

### H7 Push/Fold v1

Status: delivered as a hidden Hard AI foundation smoke.

Add first-pass hard-only cross-xiangting push/fold after the existing H2/H3 discard selection.

Acceptance:

- hard can fold across xiangting to a genbutsu / very low danger tile under riichi pressure
- good tenpai or high-context value push can be protected from over-folding
- multi-threat pressure increases fold pressure
- dealer / honba / riichi-stick / trailing context can protect a borderline push
- late leader context can force a lower-risk fold
- `validate-hard-ai.js` covers cross-xiangting fold, protected push, multi-threat fold, dealer value push, and late leader fold
- `validate-hard-headless-stats.js` tracks `crossXiangtingFoldWins` and `protectedPushWins`

Soft promotion report:

- `node games/majiang/scripts/benchmark-hard-headless.js --promotion-report`
- H7 initially used seed probes around `20260531`, `20260607`, `20260614`, `20260621`; H8 expands the default set
- outputs runtime errors, completed rounds, right-seat average score, right-seat deal-in rate, overall hule rate, riichi rate, and call rate for normal vs hard
- H8 supersedes this with explicit ready/not-ready gate fields

### H8 Promotion Gate

Status: delivered as pre-promotion gate tooling.

Convert the H7 soft report into a repeatable promotion gate before opening `hard`.

Acceptance:

- at H8 time, `hard` remains hidden from `AceMahjongBaseAI` and `game-config.json`
- promotion report uses 12 fixed seeds by default
- `benchmark-hard-headless.js --promotion-report` emits `softGates`, deterministic corpus stats, and `promotionGates`
- `promotionGates.status` is `ready` only when all hard promotion gates pass
- gate failures are explicit and non-fatal; a `not-ready` report means the gate is working, not that the script failed
- `validate-hard-promotion-gates.js` covers report shape, formal boundary after H9, failing-gate status, and ready fixture status

Promotion gates:

- hard runtime errors must be zero
- hard completed rounds must equal rounds per difficulty
- deterministic corpus regressions must be zero
- hard right-seat deal-in rate must not exceed normal
- hard right-seat average score must not be lower than normal
- hard hule rate must be at least normal minus 0.05
- riichi and call rate deltas are warnings only

Default promotion report:

- `node games/majiang/scripts/benchmark-hard-headless.js --promotion-report`
- default seeds: `20260531`, `20260607`, `20260614`, `20260621`, `20260628`, `20260705`, `20260712`, `20260719`, `20260726`, `20260802`, `20260809`, `20260816`
- the report is an H9 decision input, not a code path that opens `hard`

### H9 Four-Player Hard v1 Promotion

Status: delivered as a controlled four-player promotion.

Expose `hard` through the existing BaseAI path after the H8 promotion gate reports `ready`.

Acceptance:

- `AceMahjongBaseAI.IMPLEMENTED_DIFFICULTIES` includes `easy`, `normal`, and `hard`
- four-player `game-config.json` declares `hard` in `ai.implementedDifficulties`
- `defaultDifficulty` remains `easy`, and existing default AI players remain `easy`
- `hard` still only produces formal BaseAI decisions under `riichi-4p`
- sanma config does not declare hard and sanma runtime guard returns no hard decision
- `validate-hard-ai.js` covers formal hard controller discard, direct hard discard, and sanma boundary
- `validate-hard-headless-stats.js` includes a formal controller case in the deterministic corpus
- `validate-hard-promotion-gates.js` covers formal exposure, sanma unopened boundary, failing gate, and ready fixture

Promotion gate:

- `node games/majiang/scripts/benchmark-hard-headless.js --promotion-report`
- H9 requires `promotionGates.status === "ready"` before opening
- gate output remains a report and does not auto-toggle config

## Hard v2 Direction

After Hard v1:

- score/rank-aware last-round behavior
- open-hand opponent threat estimation
- yaku route planning for honitsu, tanyao, yakuhai, chiitoitsu, toitoi
- betaori discard sequence planning, not only one discard
- optional MJAI bridge for external benchmark runs
- Mortal-backed offline alignment reports for discard and riichi disagreements
- later, supernatural adapters may adjust ordinary hard scores rather than replacing them

### H10 Mortal Alignment Report

Status: delivered as an offline evaluation tool.

Add a Mortal-backed report for formal four-player `hard` without changing gameplay strategy.

Acceptance:

- `benchmark-hard-vs-mortal.js` runs formal BaseAI decisions, not direct evaluator calls
- default layout rotates target `hard` through `bottom`, `right`, `top`, and `left`
- the other three AI seats use `normal`
- H10 counts only `await_discard` decisions and riichi flags
- rows include local decision, Mortal coach decision, comparison, riichi reasons, metrics, and hard metrics
- report summaries reuse the benchmark analysis shape and add buckets for `riichi-missed`, `riichi-overpush`, `tile-choice`, `tile-defense`, and `missing-mortal`
- `validate-hard-vs-mortal-benchmark.js` is part of the environment-specific `mortal` suite, not `quick` or `ci`

Default report:

- `node games/majiang/scripts/benchmark-hard-vs-mortal.js`
- uses real Mortal config by default
- samples around 40 target-seat discard decisions per seat

Smoke report:

- `node games/majiang/scripts/benchmark-hard-vs-mortal.js --smoke`
- uses smoke Mortal config and one sample per target seat

Boundary:

- H10 does not change the realtime frontend analysis panel
- H10 does not tune policy constants automatically
- H10 does not score calls or reactions against Mortal yet

### H11 Mortal Severity Diagnostics

Status: delivered as offline report diagnostics.

Explain low `mortalRate` by decoding Mortal's legal-action q-values instead of treating every top-1 mismatch as equally bad.

Acceptance:

- `benchmark-hard-vs-mortal.js` decodes Mortal `q_values` and `mask_bits` into `mortalCandidates`
- each row records `bestMortalCandidate`, `localMortalCandidate`, `mortalMeta`, and `mortalSeverity`
- severity buckets are `exact`, `near`, `medium`, `large`, `stale`, and `unknown`
- the report includes top-level `severity`, `severityCounts`, `severityBySubject`, and `topDisagreements`
- `--top <n>` controls how many compact disagreement rows are included
- `coach-controller` captures runtime events through `runtime.subscribe()` so Mortal sync is not broken by the runtime's truncated `eventLog`
- `validate-hard-vs-mortal-benchmark.js` checks the new report shape in the `mortal` suite

Boundary:

- H11 does not change the hard AI policy
- H11 does not tune from Mortal automatically
- H11 does not add realtime AI actions to the frontend analysis panel
- H11 still only scores discard/riichi decisions

## Immediate Next Coding Step

H10/H11 give us a reliable way to find systematic hard-vs-Mortal disagreement and separate near misses from large mistakes. H12 strength work is tracked in `HARD_AI_H12_MORTAL_LARGE_FIX_PLAN.md`.

H12 focuses on the clean `/tmp/h11-fix4-full-real.json` baseline:

- `large=54 / 160`
- `unknown=0`
- `stale=0`
- `tile-choice=43`
- `tile-defense=9`
- `riichi-missed=2`

H12 current status:

- P0 candidate-level diagnostics is delivered for benchmark opt-in.
- P1 no-pressure discard shape v1 is delivered conservatively. Latest P1 real report improved `mortalRate` from `62.5%` to `65.0%`, reduced `large` from `54` to `51`, reduced no-pressure `tile-choice large` from `43` to `40`, and kept `unknown=0` / `stale=0`.
- R0 hard discard evaluator light refactor is delivered with matching P1 report counts, so future strength work has cleaner mount points without strategy drift.
- P2 low-danger defense tie-break is delivered. Latest real report `/tmp/h12-p2-hard-vs-mortal-real.json` improved exact matches from `104` to `106`, reduced `large` from `51` to `48`, reduced `tile-defense large` from `9` to `6`, and kept `unknown=0` / `stale=0`.
- P2's extra `riichi-missed` bucket row is a near `qDelta=0` riichi-flag mismatch; `riichi-missed large` stayed at `2`.
- P3 no-pressure thin tanki riichi is delivered. Latest real report `/tmp/h12-p3-hard-vs-mortal-real.json` improved exact matches from `106` to `107`, reduced `riichi-missed` bucket rows from `3` to `0`, reduced `riichi-missed large` from `2` to `0`, and kept `unknown=0` / `stale=0`. Total `large` stayed at `48` because later trajectory differences shifted two disagreements into `tile-choice`.
- P4 no-pressure same-xiangting shape v2 is delivered. Latest real report `/tmp/h12-p4-hard-vs-mortal-real.json` kept exact matches at `107`, reduced total `large` from `48` to `47`, reduced `tile-choice large` from `42` to `39`, kept `tile-defense large=6`, and kept `unknown=0` / `stale=0`. It also exposed one new no-pressure `riichi-missed large` row and one `kan` action-type disagreement, so P4 is a partial tile-choice improvement rather than a finished H12 close.
- P5 fixed-state tile-choice corpus and attribution is delivered as a diagnosis-only step. `benchmark-hard-vs-mortal.js` now records compact benchmark-only `decisionContext`, and `analyze-hard-tile-choice-corpus.js` converts `/tmp/h12-p4-hard-vs-mortal-real.json` into `/tmp/h12-p5-hard-tile-choice-corpus.json` with primary categories for Hard EV bias, ranking override, shape suspicion, Mortal backstep shape, dora/five route, and trajectory/stable disagreement. The regenerated fixed-state corpus currently contains `44` rows: `35` same-xiangting, `9` Mortal backstep, `44/44` fixed-state rows, and `0` missing decision contexts.
- P6/P7 strategy patches were tested and retired. P6's fixed-state fixtures plus no-pressure recalibrated score were too brittle against continuous self-play trajectory changes, and P7's no-pressure backstep experiment regressed the enabled real report (`exact=96`, `large=57`, `unknown=0`, `stale=0`) versus P6 (`exact=104`, `large=49`). The runtime now returns to the cleaner P5-era diagnostic base: candidate diagnostics and corpus attribution remain, but the recalibrated no-pressure score, P6 fixed fixture harness, and backstep review module are removed.

H12 remaining priorities:

1. treat P5 corpus attribution as the stable base for further work, not P6/P7 fixed-state distillation
2. keep Mortal backstep rows separate; the first P7 gate showed that enabling backstep without richer route context creates trajectory regressions
3. keep route/dora/five rows separate from pure shape rows so the next policy change does not overfit isolated terminal cleanup
4. prefer route/dora/five modeling or a supervised candidate scorer over more ad hoc shape/backstep if-else rules
5. decide whether remaining defense rows need full betaori / open-hand threat modeling after the tile-choice corpus has been sliced

Deeper yaku-route planning, open-hand opponent threat estimation, and multi-discard betaori remain later H13+ work unless H12 evidence shows they are needed immediately.

### H13 Mortal Q-Value Candidate Ranker

Status: in offline experiment.

H13 changes direction from adding more hand-written discard patches to testing a supervised candidate ranker against Mortal q-values.

Delivered / planned pieces:

- H13 builds candidate-level JSONL datasets from `benchmark-hard-vs-mortal.js` reports.
- Each discard state becomes multiple candidate rows with Mortal q-value labels, current hard selection, hard candidate diagnostics, danger, shape, wait, and tile features.
- H13b adds optional LightGBM LambdaRank training, held-out evaluation, and a `modelReadyForShadow` gate. Missing LightGBM is a clean `skipped` result, not a game regression.
- H13c adds an isolated ranker environment setup at `/tmp/h13-ranker-venv` using `python3.10` and pip-installed `lightgbm`.
- H13d removes report-result leakage from the default feature schema and adds protected override evaluation, so the experiment can tell apart pure model picks from "only override current hard when prediction margin is high enough".
- H13f adds feature ablation and per-state prediction diagnostics.
- H13g adds native hand/route features from benchmark-only `decisionContext` and a stricter native coverage override sweep.

H13 ranker commands:

```bash
node games/majiang/scripts/setup-hard-mortal-ranker-env.js --dry-run
node games/majiang/scripts/setup-hard-mortal-ranker-env.js
node games/majiang/scripts/validate-hard-mortal-ranker-env.js --python /tmp/h13-ranker-venv/bin/python
node games/majiang/scripts/run-hard-mortal-ranker-experiment.js --smoke --python /tmp/h13-ranker-venv/bin/python --progress
node games/majiang/scripts/run-hard-mortal-ranker-experiment.js --samples-per-seat 80 --heldout-samples-per-seat 40 --python /tmp/h13-ranker-venv/bin/python --progress --out /tmp/h13d-ranker-experiment-real-report.json
node games/majiang/scripts/run-hard-mortal-ranker-native-experiment.js --python /tmp/h13-ranker-venv/bin/python --progress --out /tmp/h13g-native-ranker-experiment-report.json
```

Boundary:

- Mortal remains an offline teacher, not a runtime dependency.
- The ranker venv is temporary and separate from Mortal conda environments.
- H13d-H13g do not change hard policy, BaseAI, `ai-controller.js`, frontend analysis, sanma, two-player AI, or supernatural adapters.
- M2 8G is enough for smoke and small experiments; larger 5k+ decision collection can move to M4 32G.

H13c observation:

- The first real run showed `current-hard exact=63.40%`, always-pick model exact `67.97%`, and large `49 -> 46`.
- The model improved `24` held-out states but regressed `23`, including current-hard exact states.
- `state.bucket` appeared as a high-gain feature, so H13d treats H13c as proof of signal, not as a clean runtime-scorer base.

H13d acceptance direction:

- default feature schema version is `h13d-ranker-runtime-safe-feature-schema-v1`
- leakage guard blocks legacy `state.bucket` training unless explicitly allowed for historical experiments
- reports include `modelAlwaysPick`, `confidenceOverrideSweep`, and `recommendedOverrideGate`
- H13e should scale sample count only after clean protected override looks stable

H13d real result:

- `/tmp/h13d-ranker-experiment-real-report.json`
- train report `320` rows, train dataset `310` states / `2899` candidate rows
- heldout report `160` rows, heldout dataset `153` states / `1449` candidate rows
- runtime-safe leakage check passed
- current-hard exact `63.40%`, large `49`
- model-always-pick exact `64.71%`, large `49`
- confidence override did not find a safe gate; the best large count was `47` at margin `0.50`, but it regressed `8` current-hard exact states
- recommended override gate is `no-override`, so H14 shadow scorer is not ready from this run

H13e scale-up probe:

- `/tmp/h13e-scale160-ranker-experiment-report.json`
- train report `640` rows, train dataset `617` states / `5801` candidate rows
- heldout report `320` rows, heldout dataset `307` states / `3021` candidate rows
- runtime-safe leakage check passed, candidate coverage stayed healthy (`96%+`)
- current-hard exact `68.40%`, large `82`
- model-always-pick exact `63.84%`, large `100`
- model changed `83` heldout states: `31` improved, `52` regressed, including `39` current-hard exact regressions
- best confidence override was still not safe: margin `0.50` gave exact `69.06%` and large `81`, but regressed `15` current-hard exact states
- conclusion: do not proceed to H14 shadow scorer; add better runtime-safe features and calibration before simply collecting a much larger dataset

H13f ablation probe:

- `/tmp/h13f-ranker-ablation-report.json`
- reuses H13e train/heldout JSONL; no new Mortal sampling
- full runtime-safe: exact `63.84%`, large `100`, hard-exact regressions `40`
- no-shape: exact `59.28%`, large `115`, hard-exact regressions `52`
- core-only: exact `61.56%`, large `109`, hard-exact regressions `50`
- no-hard-ev: exact `63.19%`, large `102`, hard-exact regressions `43`
- all protected override gates remained `no-override`
- conclusion: the current feature set is not failing because of one obvious leaked/overdominant feature; it needs richer native hand/route context and calibrated coverage before another data scale-up

H13g native feature probe:

- `/tmp/h13g-native-ranker-experiment-report.json`
- reuses H13e reports and rebuilds JSONL with native features; no new Mortal sampling
- train dataset `617` states / `5801` candidate rows; heldout dataset `307` states / `3021` candidate rows
- current-hard heldout baseline: exact `68.40%`, large `82`
- `runtime-safe-native-v1`: exact `66.12%`, large `93`, changed `89` states, improved `36`, regressed `53`, hard-exact regressions `37`
- `runtime-safe-native-no-shape`: exact `64.50%`, large `100`, changed `87` states, improved `29`, regressed `58`, hard-exact regressions `39`
- best native coverage sweep was `runtime-safe-native-no-shape` at margin `0.30`: exact `69.38%`, large `81`, but it still regressed `12` current-hard exact states
- all native coverage gates remain `no-override`
- conclusion: native hand/route features recover some useful signal but are not calibrated safely enough for H14 shadow scorer; next work should inspect the hard-exact regressions and improve confidence/route features before collecting more data or touching runtime

Keep `hard` limited to four-player ordinary Mahjong until sanma/two-player hard strategies and supernatural adapters have their own acceptance gates.
