# Mahjong AI Current Status and Roadmap

This is the living progress note for the Mahjong AI stack.

It tracks what is actually implemented now, what is only an interface, and what should happen next. Keep this document practical. The long-term design still lives in `AI_PLAN.md`; the current easy baseline lives in `EASY_AI_V1.md`.

Last reviewed: 2026-06-03

## Summary

The current AI is in the first stable foundation phase.

Implemented and verified:

- Four-player `easy v1` can play a basic riichi hand.
- Four-player `normal v1` is delivered as the first ordinary-AI upgrade over easy.
- Four-player `hard v1` is formally delivered through H9 as a gate-backed ordinary Mahjong AI.
- H10 adds a Mortal-backed offline alignment report for four-player hard discard and riichi decisions; H11 adds q-value severity diagnostics so low top-1 agreement can be separated into near misses versus large mistakes.
- H12 P0/P1/R0/P2/P3/P4/P5 are delivered as the current clean base: benchmark-only candidate diagnostics, hard-only no-pressure discard shape tie-breaks, a behavior-preserving discard evaluator mount-point cleanup, hard-only low-danger defense tie-breaks, a narrow early/mid no-pressure thin tanki riichi exception, expanded hard-only no-pressure same-xiangting shape review, and a diagnosis-only fixed-state corpus.
- H12 P6/P7 strategy patches were retired after real-report regression/overfitting evidence. The no-pressure recalibrated score, fixed P6 fixture replay gate, and no-pressure backstep review module have been removed from the runtime and validation chain.
- H13 starts the Mortal q-value distillation path outside gameplay: candidate-level dataset generation, baseline evaluators, optional LightGBM LambdaRank training, held-out evaluation, an H13c isolated `/tmp/h13-ranker-venv` setup, H13d runtime-safe features plus protected override evaluation, H13f feature ablation diagnostics, and H13g native hand/route feature experiments.
- H14 keeps `hard-tuned` as the formal baseline and moves experimental work behind gates. P3 defense overlay was rejected by arena scout, P4 same-xiangting rerank had no replay-eligible real rows, P5 adds an experimental ledger plus compact route diagnostics, and P6 adds route review packs plus tuned-vs-pure arena baseline analysis before any new overlay.
- H1-H8 hard foundation remains smoke/stat-covered for visible tiles, hard danger, steady same-xiangting discard EV, first-pass riichi/call review, round context, broader acceptance gates, headless hard-vs-normal statistics, first-pass cross-xiangting push/fold, and a repeatable promotion gate.
- Basic discard, riichi, hule priority, pass, chi, peng, ukeire, hand-shape preference, and light riichi-pressure defense are covered by smoke tests.
- The AI directory already has the shape needed for future difficulty policies, mode adapters, profiles, input/output contracts, and special adapters.

Not yet implemented as a stable deliverable:

- `hell`
- Sanma AI
- Two-player AI
- supernatural skill AI
- exposure bar logic
- mental influence logic
- full role/personality strategy

Current practical reading:

- `easy v1`: usable baseline, mostly done for four-player smoke coverage.
- `normal v1`: delivered baseline for steadier ordinary Mahjong decisions.
- ordinary Mahjong base AI overall: early foundation, improving but not complete.
- `hard`: first player-facing four-player v1 is delivered through H9. H10/H11 provide Mortal alignment reports with candidate q-value severity, H12 provides the clean diagnostic/policy base, and H13 is testing whether a supervised candidate ranker can beat hand-written rules before any runtime integration.
- supernatural Mahjong AI: interface direction only, not a gameplay system yet.

## Current Completion Estimate

These percentages are engineering estimates, not product promises.

| Area | Status | Estimated Completion |
| --- | --- | --- |
| Four-player `easy v1` | Usable baseline, smoke-covered | 70-80% |
| Shared ordinary Mahjong AI foundation | Started, first normal baseline delivered | 40-50% |
| `normal` | First delivered ordinary-AI milestone | 35-45% |
| `hard` | H9 four-player Hard v1 formally delivered, H10/H11 Mortal alignment tracked with severity, H12 P0/P1/R0/P2/P3/P4/P5 delivered for diagnostics, no-pressure shape cleanup, safer evaluator mount points, low-danger defense tie-breaks, narrow thin tanki riichi acceptance, expanded same-xiangting shape review, and fixed-state tile-choice attribution; P6/P7 strategy patches retired after regression/overfitting evidence; H13-H13g evaluate a Mortal q-value ranker offline without changing gameplay; H14 gates experimental overlays with repair pools, replay, Mortal scout, and arena scout | 60-68% |
| `hell` | Planned as `hard` plus special adapters | 0-5% |
| Sanma / two-player AI | Mode adapter shells only | 0-10% |
| Supernatural AI | Contract and extension direction only | 0-5% |

## Verified Baseline

Current baseline command:

```bash
node games/majiang/scripts/validate-easy-ai.js
```

Last observed result on 2026-05-31:

- PASS `easy-ai-current-turn-smoke`
- PASS `easy-ai-riichi-smoke`
- PASS `easy-ai-ukeire-smoke`
- PASS `easy-ai-defense-smoke`
- PASS `easy-ai-shape-smoke`
- PASS `easy-ai-call-smoke`
- PASS `easy-ai-yakuhai-call-smoke`
- PASS `easy-ai-speedup-call-smoke`

This is the acceptance floor for `easy v1`. Future changes should not break it unless the baseline is deliberately replaced with a stronger one.

Current normal baseline command:

```bash
node games/majiang/scripts/validate-normal-ai.js
```

Last observed result on 2026-05-31:

- PASS `normal-current-turn-smoke`
- PASS `normal-riichi-threshold-smoke`
- PASS `normal-defense-priority-smoke`
- PASS `normal-call-selectivity-smoke`

This is the acceptance floor for `normal v1`.

Current hard baseline command:

```bash
node games/majiang/scripts/validate-hard-ai.js
```

Last observed result on 2026-05-31:

- PASS `hard-formal-controller-smoke`
- PASS `hard-current-turn-direct-discard`
- PASS `hard-candidate-diagnostics-default-hidden-smoke`
- PASS `hard-candidate-diagnostics-opt-in-smoke`
- PASS `hard-mortal-no-pressure-shape-terminal-smoke`
- PASS `hard-mortal-no-pressure-shape-tiebreak-smoke`
- PASS `hard-mortal-no-pressure-five-retention-smoke`
- PASS `hard-no-pressure-existing-ev-regression-smoke`
- PASS `hard-no-pressure-no-backstep-smoke`
- PASS `hard-shape-low-xiangting-terminal-smoke`
- PASS `hard-shape-low-xiangting-five-retention-smoke`
- PASS `hard-shape-strong-override-smoke`
- PASS `hard-shape-tenpai-near-tie-only-smoke`
- PASS `hard-shape-no-backstep-still-smoke`
- PASS `hard-shape-clear-ev-advantage-regression-smoke`
- PASS `hard-sanma-boundary-smoke`
- PASS `hard-visible-tiles-smoke`
- PASS `hard-defense-genbutsu-smoke`
- PASS `hard-defense-suji-kabe-smoke`
- PASS `hard-defense-safety-rank-smoke`
- PASS `hard-low-danger-same-xiangting-smoke`
- PASS `hard-low-pressure-soft-fold-smoke`
- PASS `hard-protected-push-not-soft-fold-smoke`
- PASS `hard-defense-diagnostics-safety-smoke`
- PASS `hard-live-ukeire-discard-smoke`
- PASS `hard-wait-quality-smoke`
- PASS `hard-pressure-keeps-safety-smoke`
- PASS `hard-multi-riichi-defense-smoke`
- PASS `hard-late-leader-safety-smoke`
- PASS `hard-cross-xiangting-fold-smoke`
- PASS `hard-tenpai-good-wait-push-smoke`
- PASS `hard-multi-threat-cross-fold-smoke`
- PASS `hard-dealer-value-push-smoke`
- PASS `hard-leader-late-cross-fold-smoke`
- PASS `hard-good-wait-riichi-smoke`
- PASS `hard-late-bad-wait-no-riichi-smoke`
- PASS `hard-mortal-thin-tanki-riichi-smoke`
- PASS `hard-thin-tanki-late-no-riichi-smoke`
- PASS `hard-thin-tanki-pressure-no-riichi-smoke`
- PASS `hard-thin-tanki-danger-discard-no-riichi-smoke`
- PASS `hard-pressure-no-thin-riichi-smoke`
- PASS `hard-round-context-riichi-smoke`
- PASS `hard-yakuhai-speed-call-smoke`
- PASS `hard-unsafe-flat-call-smoke`
- PASS `hard-vs-normal-comparison-smoke`

This is the acceptance floor for four-player `hard v1`. It also verifies that hard remains blocked outside `riichi-4p`.

Current hard stats command:

```bash
node games/majiang/scripts/validate-hard-headless-stats.js
```

Last observed result on 2026-05-31:

- PASS `hard-headless-stats-smoke`
- deterministic corpus samples: 12
- hard advantages: 12
- regressions: 0
- pressure safety wins: 2
- no-pressure EV wins: 1
- cross-xiangting fold wins: 1
- low-danger defense wins: 2
- low-pressure soft-fold wins: 1
- protected push wins: 1
- riichi accept/reject coverage: 1 / 1
- call accept/reject coverage: 1 / 1

Current hard promotion gate command:

```bash
node games/majiang/scripts/validate-hard-promotion-gates.js
```

Last observed result on 2026-05-31:

- PASS `hard-promotion-report-shape-smoke`
- PASS `hard-promotion-formal-boundary-smoke`
- PASS `hard-promotion-gate-status-smoke`
- PASS `hard-promotion-gate-ready-fixture-smoke`

This verifies the reusable H8/H9 gate machinery and confirms `hard` is formally exposed only for four-player config while sanma remains unopened.

Optional local soft report:

```bash
node games/majiang/scripts/benchmark-hard-headless.js --seed 20260531 --rounds 8
```

This reports hule rate, deal-in rate, riichi/call rates, riichi/call counts per round, average scores, and errors for normal and formal hard. It is not a quick/CI gate.

Promotion gate report:

```bash
node games/majiang/scripts/benchmark-hard-headless.js --promotion-report
```

This runs the default 12-seed fixed set for normal vs formal hard and reports `softGates`, deterministic corpus stats, and `promotionGates.status`. The gate checks hard runtime errors, completed rounds, deterministic regressions, right-seat deal-in rate, right-seat average score, and hule-rate floor. It remains a report, not an automatic promotion switch.

Current Mortal alignment command:

```bash
node games/majiang/scripts/benchmark-hard-vs-mortal.js --smoke
node games/majiang/scripts/validate-hard-vs-mortal-benchmark.js
```

Last observed intent on 2026-05-31:

- H10 compares formal `hard` AI decisions against Mortal through the existing MJAI coach bridge.
- H11 decodes Mortal `q_values` / `mask_bits` into legal candidate rows, local candidate q-delta, severity counts, and top disagreements.
- H11 also fixes coach/Mortal event-stream drift by letting `coach-controller` capture runtime events through `runtime.subscribe()` instead of relying on the truncated runtime `eventLog`.
- The default non-smoke report rotates the target hard seat through `bottom`, `right`, `top`, and `left`, while the other three seats use `normal`.
- Only discard and riichi flags are counted in H10; calls and reactions remain out of scope.
- Report buckets include `riichi-missed`, `riichi-overpush`, `tile-choice`, `tile-defense`, and `missing-mortal`.
- Severity buckets are `exact`, `near`, `medium`, `large`, `stale`, and `unknown`; `stale` means the Mortal output did not advance and is excluded from q-value strength reading.
- H12 P3 real report is `/tmp/h12-p3-hard-vs-mortal-real.json`: `160` rows, `107` exact matches, `48` large disagreements, `unknown=0`, `stale=0`, `tile-choice large=42`, `tile-defense large=6`, and `riichi-missed=0`.
- H12 P4 latest real report is `/tmp/h12-p4-hard-vs-mortal-real.json`: `160` rows, `107` exact matches, `47` large disagreements, `unknown=0`, `stale=0`, `tile-choice large=39`, `tile-defense large=6`, and `riichi-missed large=1`.
- P4 is a partial no-pressure tile-choice improvement, not a full acceptance close. The new `riichi-missed` row is a trajectory-exposed no-pressure kanchan tenpai rejected by `hard-riichi-wait-quality-too-low`; the next step should treat this as P5 corpus evidence rather than broadening P4 further.
- H12 P5 adds a compact fixed-state corpus generator for the remaining P4 `tile-choice large` rows. It records benchmark-only `decisionContext`, classifies same-xiangting versus Mortal backstep shape, EV/shape suspect rows, dora/five route rows, and stable versus trajectory-introduced disagreements, and writes `/tmp/h12-p5-hard-tile-choice-corpus.json` for offline review. The regenerated fixed-state corpus currently contains `44` rows (`35` same-xiangting, `9` Mortal backstep, `0` missing decision contexts), so P5 records the actual input report instead of hard-coding the earlier `39`-row historical slice. P5 does not change Hard policy.
- H12 P6/P7 strategy patches were tested and then retired. P6's fixed fixtures and no-pressure recalibrated score did not reduce continuous self-play `tile-choice large` in a stable way, and P7's enabled no-pressure backstep report `/tmp/h12-p7-backstep-enabled-hard-vs-mortal-real.json` regressed exact matches from `104` to `96` while increasing large disagreements from `49` to `57`. The codebase now keeps the P5 corpus analyzer as the clean diagnostic base and removes the P6/P7 runtime hooks.

This is an evaluation tool, not a hard gate and not an automatic tuner.

Current Mortal ranker experiment commands:

```bash
node games/majiang/scripts/setup-hard-mortal-ranker-env.js --dry-run
node games/majiang/scripts/setup-hard-mortal-ranker-env.js
node games/majiang/scripts/validate-hard-mortal-ranker-env.js --python /tmp/h13-ranker-venv/bin/python
node games/majiang/scripts/run-hard-mortal-ranker-experiment.js --smoke --python /tmp/h13-ranker-venv/bin/python
```

H13c keeps ranker training in an isolated temporary venv. It does not use or modify Mortal conda environments, does not become a project runtime dependency, and does not change formal hard decisions. The first real H13c run showed signal but not enough stability: current-hard exact `63.40%`, always-pick model exact `67.97%`, large `49 -> 46`, with `24` improved states and `23` regressed states.

H13d cleans the experimental base before any larger-data run. Default training now uses `h13d-ranker-runtime-safe-feature-schema-v1`, removes report-result leakage such as `state.bucket`, and reports `model-always-pick` separately from `model-confidence-override-hard`. The first clean `80/40` real run produced heldout `153` dataset states with current-hard exact `63.40%`, model-always-pick exact `64.71%`, and large unchanged at `49`. The best large-reducing override margin found was `0.50`, but it still regressed `8` current-hard exact states, so the recommended gate is `no-override`. H13e should consider larger data only after clean protected override becomes stable, or after runtime-safe feature gaps are addressed.

The first H13e scale-up run used train `160/seat` and heldout `80/seat` with the same runtime-safe schema. It produced train `617` dataset states / `5801` candidate rows and heldout `307` states / `3021` candidate rows. Current hard improved to exact `68.40%` on this heldout slice, while model-always-pick fell to exact `63.84%` and large worsened from `82` to `100`. The model changed `83` states, improving `31` and regressing `52`; `39` regressions were current-hard exact states. This says the immediate bottleneck is not just data volume. H13e should prioritize better runtime-safe state representation and confidence calibration before another blind scale-up.

H13f adds runtime-safe feature ablation and per-state prediction diagnostics. Using the H13e datasets, all tested schema variants remained not-ready: full runtime-safe exact `63.84%` / large `100` / hard-exact regressions `40`; no-shape exact `59.28%` / large `115` / regressions `52`; core-only exact `61.56%` / large `109` / regressions `50`; no-hard-ev exact `63.19%` / large `102` / regressions `43`. Removing shape or Hard EV does not rescue the model, so the next step should add more native runtime-safe hand/route context and better confidence calibration before any larger-scale data collection or shadow scorer.

H13g adds native hand/route features from benchmark-only `decisionContext` and rebuilds the H13e train/heldout JSONL instead of recollecting Mortal data. The first native run produced `/tmp/h13g-native-ranker-experiment-report.json`: train `617` states / `5801` candidates, heldout `307` states / `3021` candidates. Current hard stayed exact `68.40%`, large `82`. `runtime-safe-native-v1` always-pick reached exact `66.12%`, large `93`, with `37` hard-exact regressions. `runtime-safe-native-no-shape` always-pick reached exact `64.50%`, large `100`, with `39` hard-exact regressions. The best native coverage sweep was no-shape margin `0.30`: exact `69.38%`, large `81`, but still regressed `12` current-hard exact states. Gate remains `no-override`; H13g is useful diagnostic evidence, not a runtime scorer candidate yet.

## Current Implemented Ability

### Discard

The current discard chain evaluates:

- xiangting
- tingpai count
- ukeire count
- hand-shape preference
- light safety under riichi pressure
- non-tsumogiri preference as a tie-break
- hand position as a final tie-break

`hard` additionally evaluates:

- visible-tile remaining counts
- live ukeire
- live wait count
- wait quality
- hard-only EV score
- hard-only danger categories under riichi pressure
- hard-only low-danger safety rank and defense-tile rank under pressure
- hard-only round context for dealer, remaining wall, honba, riichi sticks, score rank, and late leader defense
- hard-only one-discard push/fold review that can cross xiangting under pressure

Main files:

- `engine/ai/discard-evaluator.js`
- `engine/ai/support/hand-metrics.js`
- `engine/ai/evaluators/defense-evaluator.js`
- `engine/ai/support/tile-danger.js`
- `engine/ai/support/push-fold.js`
- `engine/ai/support/visible-tiles.js`
- `engine/ai/support/wait-quality.js`
- `engine/ai/support/hard-ev.js`
- `engine/ai/support/hard-push-fold.js`
- `engine/ai/support/hard-defense-tiebreak.js`
- `engine/ai/support/danger-model.js`
- `engine/ai/support/round-context.js`

### Riichi

Current riichi logic is intentionally basic:

- formally delivered for four-player `easy`, `normal`, and `hard`
- requires legal riichi discard
- requires enough waits
- requires enough remaining tiles
- does not attempt optimal value/risk timing

`hard` additionally reviews:

- live wait count
- wait quality and wait type
- hand value
- remaining wall tiles
- dealer / honba / riichi-stick / score-rank context
- first-pass pressure and riichi discard danger

Main files:

- `engine/ai/evaluators/riichi-evaluator.js`
- `engine/ai/difficulty/easy-policy.js`
- `engine/ai/difficulty/hard-policy.js`

### Reaction

Current reaction priority:

- hule first
- otherwise consider chi / peng
- otherwise pass

Current call logic is conservative:

- chooses calls that clearly improve xiangting
- may choose yakuhai peng when it does not worsen the hand
- may choose flat speed-up calls when ukeire or shape clearly improves
- tightens flat speed-up calls under riichi pressure
- for `normal`, rejects flat speed-up calls that visibly drop hand-shape value
- for `hard`, reviews yaku-backed calls, live-tile/EV deltas, and unsafe flat calls under pressure

Main file:

- `engine/ai/evaluators/call-evaluator.js`

## Current Boundaries

The current `easy v1` must stay simple.

Do not keep adding stronger behavior to `easy` unless it is a bug fix or a baseline stability fix. Strength improvements should move to `normal`, `hard`, or special adapters.

Not currently in scope for `easy v1`:

- complex push/fold
- detailed late-round strategy
- point-stick based strategy
- full yaku planning
- complex call judgment
- detailed danger model
- opponent modeling
- reading hands
- search or rollout
- sanma-specific strategy
- two-player strategy
- supernatural skill usage
- anti-skill strategy
- exposure bar logic
- mental influence logic
- formal personality system

## Architecture Direction

The intended structure is:

```text
base evaluators
-> difficulty policy
-> profile
-> mode adapter
-> special / supernatural adapter
-> normalized AI output
```

Important rule:

The supernatural layer should not replace the ordinary Mahjong AI.

The ordinary AI should first produce legal candidates and ordinary Mahjong scores. Supernatural systems should then adjust those decisions through explicit adapters and extension hooks.

## Existing AI Surfaces

### Base Evaluators

These hold reusable ordinary Mahjong logic:

- `discard-evaluator.js`
- `riichi-evaluator.js`
- `call-evaluator.js`
- `defense-evaluator.js`
- `hand-metrics.js`
- `tile-danger.js`
- `push-fold.js`

### Difficulty Policies

These decide strength and style thresholds:

- `easy-policy.js`
- `normal-policy.js`
- `hard-policy.js`

Current reality:

- `easy`, `normal`, and `hard` are delivered for four-player `riichi-4p`.
- `hard` is implemented as H9 Hard v1 with evaluator smokes, push/fold review, headless decision stats, and promotion gate tracking.
- `hell` is planned as hard plus stronger special adapters.

### Mode Adapters

These exist to avoid writing separate whole AIs for each table size:

- `special/mode-2p.js`
- `special/mode-3p.js`
- `special/mode-4p.js`

Current reality:

- these are mostly no-op adapters.
- they should become small correction layers, not second AI brains.

### Contracts

The input and output contract layer already allows future state to enter the AI:

- `contracts/ai-input.js`
- `contracts/ai-output.js`

Future-facing fields already include:

- `exposureState`
- `mentalState`
- profile fields such as skill bias and anti-skill reserve

These fields are currently structural preparation, not finished gameplay logic.

## Supernatural Compatibility Plan

The project is already shaped to support supernatural Mahjong later, but the implementation should wait until ordinary AI is stronger.

The future supernatural layer should use explicit hooks for:

- biased initial hands
- biased draws
- visible or hidden information changes
- reaction candidate changes
- multi-round ability carryover
- skill usage scoring
- anti-skill reservation
- exposure bar changes
- mental pressure changes

Related extension hooks:

- `beforeRoundSetup`
- `beforeInitialDeal`
- `afterInitialDeal`
- `beforeDraw`
- `afterDraw`
- `modifyReactionCandidates`
- `beforeBuildPlayerView`
- `beforeNextRoundConfigBuild`

Truth modifiers may affect deal, draw, and action candidates. View modifiers may affect visibility and hints. Neither should randomly mutate completed round truth.

## Roadmap

### M0: Lock Easy v1

Status: mostly done.

Goal:

- keep four-player `easy` stable
- use it as the baseline for regression tests
- only fix bugs or add missing tests

Acceptance:

- `node games/majiang/scripts/validate-easy-ai.js` passes
- top-level `node scripts/validate.mjs quick` keeps passing

### M1: Normal v1

Status: delivered as the first ordinary-AI upgrade over easy.

Goal:

- turn `normal` into the first real ordinary Mahjong improvement over easy
- reuse base evaluators instead of patching easy

Suggested scope:

- better ukeire and hand value balance
- more useful riichi thresholds
- stronger yakuhai and open-hand judgment
- basic opponent riichi danger response
- clearer push/fold thresholding
- fewer obviously bad calls

Acceptance ideas:

- normal can choose safer tiles under stronger pressure than easy
- normal can decline flat calls that easy might accept
- normal can prefer better riichi timing in fixed scenarios
- normal has dedicated smoke tests separate from easy

Current command:

```bash
node games/majiang/scripts/validate-normal-ai.js
```

### M2: Base Evaluator Consolidation

Status: should happen alongside M1.

Goal:

- make shared evaluators the real center of the AI
- keep difficulty differences in policy files

Suggested work:

- document AI input/output object shapes with JSDoc
- add test fixtures for discard, riichi, call, and defense evaluators
- make normal and easy share evaluator paths wherever reasonable
- avoid converting to TypeScript as part of this milestone

Acceptance ideas:

- easy and normal use the same evaluator entrypoints
- policy changes can shift behavior without copying evaluator logic

### M3: Hard Foundation

Status: H9 four-player Hard v1 delivered. H1-H8 are smoke/stat-covered and H9 exposes `hard` for `riichi-4p`.

Goal:

- build the strongest ordinary Mahjong base AI before supernatural logic

Suggested scope:

- richer danger model, started in H2
- visible-tile and live-tile accounting, started in H1
- same-xiangting discard EV, started in H3
- riichi and call context review, started in H4
- late-round defense, started in H5
- point-stick and placement awareness, started in H5
- dealer and honba context, started in H5
- deterministic hard-vs-normal statistics, started in H6
- one-discard cross-xiangting push/fold, started in H7
- fixed-seed promotion soft report, started in H7
- repeatable promotion gate with ready/not-ready status, started in H8
- shallow search or limited rollout
- stronger push/fold model

Acceptance ideas:

- hard produces better Mortal agreement than easy and normal on benchmark fixtures
- hard can explain major push/fold decisions with reason tags
- hard keeps zero known regressions in the deterministic corpus
- hard promotion gate reports `ready` for formal exposure

### M4: Mode Adapters

Status: future milestone.

Goal:

- support table-size differences without forking the whole AI

Suggested scope:

- sanma-specific call and draw value changes
- two-player tempo/value adjustments
- four-player standard correction layer

Acceptance ideas:

- mode adapters modify base decisions through a small documented interface
- sanma AI has its own smoke fixtures

### M5: Supernatural Adapter Layer

Status: future milestone, after the ordinary base AI is stable.

Goal:

- add skill, exposure, and mental modifiers on top of ordinary AI

Suggested scope:

- skill usage scoring
- anti-skill reserve scoring
- exposure-aware risk changes
- mental-pressure changes to aggression and folding
- view modifier integration for limited information and perspective changes

Acceptance ideas:

- supernatural adapter receives ordinary decision candidates and returns adjusted scores
- skill logic does not directly mutate runtime internals
- extension hooks are used for deal, draw, view, and reaction modifications

### M6: Analysis and Benchmark Loop

Status: partially started through coach and Mortal scripts.

Goal:

- use benchmark output to track AI quality over time

Suggested scope:

- keep Mortal comparison reports for fixed fixtures
- compare easy, normal, hard, and special adapters
- track good, neutral, and bad decision buckets
- expose summaries in the analysis page when useful

Acceptance ideas:

- each delivered difficulty has a small benchmark summary
- regressions can be detected without opening the browser manually

## Update Rules

Update this file when:

- a new difficulty becomes delivered
- a mode adapter becomes more than no-op
- AI input/output contracts change
- supernatural state starts affecting decisions
- smoke or benchmark expectations change

When updating AI behavior, run at least:

```bash
node games/majiang/scripts/validate-easy-ai.js
node games/majiang/scripts/validate-normal-ai.js
node games/majiang/scripts/validate-hard-ai.js
node games/majiang/scripts/validate-hard-headless-stats.js
node scripts/validate.mjs quick
```

For broader AI or scenario work, also consider:

```bash
node scripts/validate.mjs full
```

For Mortal-backed work, use the environment-specific suite:

```bash
node scripts/validate.mjs mortal
```
