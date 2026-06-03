# Hard AI H16: Personality Tuning Plan

Last updated: 2026-06-03

## Summary

H16 的目标不是继续给 `hard` 加零散规则，而是把当前四个困难 AI 分支整理成可长期微调的 personality 系统。

当前四个分支已经能跑出明显画像：

- `hard-aggressive`: 速攻流，速度明确，但四位率偏高。
- `hard-defensive`: 防御流，放铳控制有效，但和牌/听牌效率偏弱。
- `hard-heavy`: 打点流，当前 200 局 scout 表现最好，但需要巡目衰减，避免晚巡硬保门清。
- `hard-balanced`: 平衡流，当前失败。它不是中间态，而是 route override 几乎不触发，沦为弱化版 tuned/速攻。

从 H16 开始，当前四个分支视为 stable baseline，不直接继续改：

- `hard-aggressive`
- `hard-defensive`
- `hard-balanced`
- `hard-heavy`

下一轮所有调参都进入 dev 变体：

- `hard-aggressive-dev`
- `hard-defensive-dev`
- `hard-balanced-dev`
- `hard-heavy-dev`

dev 变体可以退步、试错、回滚；stable 变体只在 dev 经过 200 scout 和 1000 confirmation 后再显式晋升。

H16 的核心方向：

1. 先承认 `hard-heavy` 的路线价值评分是有效信号。
2. 重做 `hard-balanced` 的底层逻辑，不能只是把 heavy 的阈值调小。
3. 让四个 AI 共用引擎，但通过统一 personality weight / state layer 变得更鲜明。
4. 所有调参仍以 arena 为主判据，Mortal 只做问题发现和离线参考。

## Current 200-Match Scout

Command:

```bash
node games/majiang/scripts/benchmark-ai-hanchan-arena.js \
  --mode mixed \
  --variants hard-aggressive,hard-defensive,hard-balanced,hard-heavy \
  --matches 200 \
  --checkpoint-interval 25 \
  --progress \
  --stdout summary \
  --out /tmp/hard-four-personalities-mixed-200.json
```

Observed result:

| Variant | avgRank | 1st | 4th | hule | dealIn | avgWin | call/R | riichi | nonRiichiWin | drawTenpai | routeReview/R | routeOverride/R |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `hard-aggressive` | 2.65 | 21.5% | 31.0% | 22.4% | 15.2% | 3408 | 1.14 | 8.1% | 76.3% | 83.0% | 0.00 | 0.00 |
| `hard-defensive` | 2.51 | 27.5% | 27.5% | 20.6% | 12.8% | 3713 | 1.16 | 9.0% | 72.7% | 73.1% | 0.00 | 0.00 |
| `hard-balanced` | 2.55 | 22.0% | 24.5% | 20.7% | 14.7% | 3785 | 1.19 | 9.7% | 70.6% | 69.7% | 0.12 | 0.01 |
| `hard-heavy` | 2.30 | 29.0% | 17.0% | 21.6% | 13.6% | 4001 | 0.89 | 14.6% | 59.8% | 74.4% | 0.58 | 0.42 |

Reading:

- `hard-aggressive` matches the intended speed profile almost exactly, including the bad part: high fourth rate.
- `hard-defensive` proves the current tuned defense signal works: lowest deal-in rate, but speed and draw-tenpai are weak.
- `hard-heavy` is currently the strongest scout profile. It increases riichi, average win value, first rate, and lowers fourth rate.
- `hard-balanced` does not function as a balanced middle. `closedRouteOverride/R=0.01` means its route protection mostly never changes decisions.

## Current Code Relationship

The four AIs are not four copied engines.

They share:

- discard evaluator
- riichi evaluator
- call evaluator
- push/fold evaluator
- danger model
- hard EV / live ukeire / wait quality
- shape diagnostics
- route diagnostics
- arena and Mortal benchmark infrastructure

Current branch shape:

```text
shared hard engine
├─ hard-aggressive = hard policy with later tuned gates disabled
├─ hard-defensive = tuned hard baseline
├─ hard-balanced = tuned hard baseline + mild closed-route value rebalance
└─ hard-heavy = tuned hard baseline + strong closed-route value rebalance
```

H16 dev branch shape:

```text
stable hard personalities
├─ hard-aggressive -> hard-aggressive-dev
├─ hard-defensive -> hard-defensive-dev
├─ hard-balanced -> hard-balanced-dev
└─ hard-heavy -> hard-heavy-dev
```

Important: this is not a linear stack:

```text
aggressive -> defensive -> balanced -> heavy
```

It is a fork from shared hard logic.

The stable names are the current reproducible checkpoints. The `-dev` names are the only places H16 behavior changes should land.

Current policy constructors live in:

- `games/majiang/scripts/benchmark-ai-hanchan-arena.js`
- `games/majiang/scripts/benchmark-hard-vs-mortal.js`

Current shared default policy lives in:

- `games/majiang/engine/ai/difficulty/hard-policy.js`

Current closed-route value trigger lives in:

- `games/majiang/engine/ai/evaluators/call-evaluator.js`

## Closed Route Trigger Today

The route scorer only works when:

- `policy.route.enableClosedRouteValueRebalance === true`
- policy id is `hard-experimental`, `hard-balanced`, `hard-balanced-dev`, `hard-heavy`, or `hard-heavy-dev`
- hand is still closed
- no riichi pressure, unless policy disables that guard
- `currentXiangting <= closedRouteMaxXiangting`
- `remainingTiles >= closedRouteMinRemainingTiles`
- direct tenpai call is allowed immediately
- otherwise, pass overrides call only if:

```text
passClosedRouteScore - callOpenRouteScore >= closedRouteOverrideMinMargin
```

Current balanced settings:

| Setting | Value |
| --- | ---: |
| `closedRouteMaxXiangting` | 1 |
| `closedRouteMinRemainingTiles` | 24 |
| `closedRouteOverrideMinMargin` | 90 |

Current heavy settings:

| Setting | Value |
| --- | ---: |
| `closedRouteMaxXiangting` | 2 |
| `closedRouteMinRemainingTiles` | 24 |
| `closedRouteOverrideMinMargin` | 35 |

This explains the current scout:

- heavy reviews and overrides often enough to create a real personality.
- balanced barely overrides, so it does not create a real personality.

## H16 Design Principle

H16 should not add more局面级 if/else.

The right direction is a common personality layer. The stable personalities keep their current policy values; dev personalities inherit from the stable version and then apply only their own experimental deltas.

```js
personalityWeights: {
  speedBias,
  valueBias,
  defenseBias,
  riichiBias,
  callBias,
  pushRiskTolerance,
  routeValueBias
}
```

Evaluators should continue to share the same logic, but read these weights to adjust scoring.

This keeps the hard identity intact:

- still a scripted hard AI
- still explainable
- still deterministic enough for smoke tests
- still arena-gated
- not a LightGBM runtime replacement
- not a pile of isolated if/else patches

## Stable vs Dev Naming Rule

Stable variants:

| Stable Variant | Meaning |
| --- | --- |
| `hard-aggressive` | Frozen H15/H16 scout baseline for speed style |
| `hard-defensive` | Frozen tuned/formal-hard baseline personality |
| `hard-balanced` | Frozen current mild-route baseline, even though it is weak |
| `hard-heavy` | Frozen current strong route-value baseline |

Dev variants:

| Dev Variant | Inherits From | H16 Purpose |
| --- | --- | --- |
| `hard-aggressive-dev` | `hard-aggressive` | smart speed risk ceiling |
| `hard-defensive-dev` | `hard-defensive` | counterattack and tenpai recovery |
| `hard-balanced-dev` | `hard-balanced` | state-machine-like balanced layer |
| `hard-heavy-dev` | `hard-heavy` | turn decay for value route |

Rules:

- Never tune the stable variant directly.
- A dev variant may underperform; this is expected during scout.
- Arena reports must include stable and dev side by side when measuring a change.
- Promotion is explicit: copy the dev deltas into the stable personality only after passing gate.
- Formal `hard` remains unchanged unless a later decision explicitly remaps it.

## Personality Goals

### hard-aggressive-dev: Smart Speed

Current profile:

- speed identity is correct
- `avgRank=2.65`, `4th=31.0%`, `dealIn=15.2%`
- it is fast, but too willing to fall into fourth

Goal:

```text
聪明的快，而不是低智的送
```

Tune direction:

- keep call/R and hule high
- keep first-pass speed identity
- add risk ceiling under bad score/rank/late-round conditions
- avoid low-value push into multi-riichi or late dangerous tiles
- reduce flown and fourth rate before chasing higher win rate

Candidate knobs:

- slightly stronger late-round `pushFold` risk ceiling
- score/rank-aware aggression decay when currently third/fourth with low value hand
- low-value open-hand push penalty under pressure
- no broad call suppression

Success profile:

- `win/R` remains high
- `4th` falls meaningfully from 31%
- `dealIn/R` does not exceed 16%
- `avgWin` does not collapse into tiny open hands

### hard-defensive-dev: Turtle With Counterpunch

Current profile:

- `dealIn=12.8%` is excellent
- `drawTenpai=73.1%` and `hule=20.6%` are weak
- it defends, but sometimes gives up too much speed

Goal:

```text
极致龟缩，暗杀之王
```

Tune direction:

- keep the lowest deal-in identity
- improve counterattack when safe candidates are close
- avoid defending forever after pressure disappears
- preserve tenpai chances under low/medium pressure

Candidate knobs:

- improve low-danger same-xiangting selection with retained ukeire
- pressure decay after riichi threat is no longer relevant or safe tiles are abundant
- better safe-push threshold for good waits / high value hands
- late leader defense remains strict

Success profile:

- `dealIn/R` remains the best or near-best
- `4th` moves toward the intended low range
- `hule` and `drawTenpai` recover without turning into aggressive

### hard-heavy-dev: Value With Turn Decay

Current profile:

- best scout result: `avgRank=2.30`, `1st=29.0%`, `4th=17.0%`
- `avgWin=4001`, `riichi=14.6%`, `nonRiichiWin=59.8%`
- route scorer is doing real work: `routeOverride/R=0.42`

Goal:

```text
识时务者为俊杰
```

Tune direction:

- keep early/mid closed-riichi value
- add turn decay so it does not over-protect closed route late
- preserve direct tenpai call allowance
- avoid losing hule/drawTenpai while chasing value

Candidate knobs:

- route value decay by remaining tiles
- higher override margin after mid-round
- stronger callOpenRouteScore for late shanten-improving calls
- dealer/behind score context can keep value aggression longer

Success profile:

- `avgWin` remains highest or near-highest
- `riichi` remains clearly above other personalities
- `hule` and `drawTenpai` do not drop below current scout
- `routeOverride/R` comes down from 0.42 only if avgRank stays strong

### hard-balanced-dev: State Machine, Not Mild Heavy

Current profile:

- `avgRank=2.55`, worse than intended
- `routeReview/R=0.12`, `routeOverride/R=0.01`
- route protection is almost inactive
- it is not a true middle style

Goal:

```text
重写底层逻辑，状态机化
```

Tune direction:

Balanced should not be "heavy but weaker".

It should choose a temporary mode based on game state:

```text
early + no pressure + strong closed value -> value mode
early/mid + weak value + good speed call -> speed mode
pressure + weak hand -> defense mode
late + not tenpai -> tenpai/speed mode
leader late -> defense mode
behind with value -> value/push mode
```

Candidate knobs:

- add `balancedState` diagnostic:
  - `speed`
  - `value`
  - `defense`
  - `tenpai`
  - `leader-protect`
  - `push-comeback`
- derive temporary weights from state instead of fixed route margin
- route value can trigger more often in value mode
- call speed is preserved in speed/tenpai mode
- defensive thresholds harden in leader-protect / pressure mode

Success profile:

- `avgRank` should be best or close to best
- `4th` should stay near defensive/heavy, not aggressive
- `win/R` should not trail heavy/defensive badly
- `riichi` should sit between defensive and heavy
- `routeOverride/R` should be clearly nonzero but far below heavy

Suggested initial balanced route target:

| Metric | Target |
| --- | ---: |
| `closedRouteReview/R` | 0.25-0.40 |
| `closedRouteOverride/R` | 0.08-0.18 |
| `riichi` | 10.5-12.5% |
| `calls/R` | 1.00-1.12 |
| `drawTenpai` | not below defensive/heavy by more than 3pp |

H16 P0/P3 implementation status:

- `hard-aggressive-dev`, `hard-defensive-dev`, `hard-balanced-dev`, and `hard-heavy-dev` are now accepted by arena and Mortal benchmark variant parsing.
- Stable `hard-balanced` is unchanged: no balanced state layer, route range remains `xiangting <= 1`, margin `90`.
- `hard-balanced-dev` is the only dev variant with behavior changes in this phase.
- `hard-balanced-dev` reuses the shared closed-route scorer and adds `balancedState`, `balancedStateReasons`, and `effectiveMinMargin`.
- Arena summary now prints both `balancedState` and `balancedStateReason` compact counts when present.

Current H16 P0/P3 `hard-balanced-dev` route knobs:

| Setting | Value |
| --- | ---: |
| `closedRouteMaxXiangting` | `2` |
| `closedRouteOverrideMinMargin` | `150` |
| `balancedValueOverrideMinMargin` | `150` |
| `balancedNeutralOverrideMinMargin` | `230` |
| `balancedLowValueMax` | `36` |
| `balancedStrongCallHardEvDelta` | `120` |
| `balancedStrongCallLiveUkeireDelta` | `12` |
| `balancedShantenCallHardEvDelta` | `40` |
| `balancedShantenCallLiveUkeireDelta` | `6` |

Latest local 10-match mechanism smoke:

| Variant | `avgRank` | `calls/R` | `riichi` | `drawTenpai` | `closedRouteReview/R` | `closedRouteOverride/R` |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `hard-balanced` | 2.55 | 1.23 | 9.5% | 75.9% | 0.14 | 0.02 |
| `hard-balanced-dev` | 2.45 | 1.08 | 10.2% | 72.2% | 0.45 | 0.12 |

This smoke is only a mechanism sanity check. The next real decision point is the 200-match focused scout.

## H16 Implementation Phases

### P0: Personality Policy Audit

Add dev variants and a small diagnostic script:

```text
games/majiang/scripts/export-hard-personality-policies.js
```

Output:

```text
/tmp/h16-hard-personality-policy-diff.json
/tmp/h16-hard-personality-policy-diff.md
```

Purpose:

- show exact policy diff for stable and dev personalities
- verify no hidden formal hard behavior changed
- make future tuning auditable

Acceptance:

- all eight personalities export policy ids and personality names
- each `hard-xxx-dev` initially equals its stable parent except for explicit H16 deltas
- diff shows changed knobs by section
- no runtime/eventLog/Mortal stdout included

### P1: Arena Personality Profile Analyzer

Add analyzer:

```text
games/majiang/scripts/analyze-hard-personality-arena.js
```

Input:

```text
/tmp/hard-four-personalities-mixed-200.json
```

Output:

```text
/tmp/h16-hard-personality-profile-analysis.json
/tmp/h16-hard-personality-profile-analysis.md
```

Purpose:

- compare observed profile against target profile
- compare each dev variant against its stable parent
- classify each personality:
  - `profile-hit`
  - `too-aggressive`
  - `too-passive`
  - `value-overprotected`
  - `route-inactive`
  - `inconclusive`
- highlight which knobs to tune next

Acceptance:

- flags `hard-balanced` as `route-inactive`
- flags `hard-heavy` as `profile-hit` with `turn-decay-needed`
- flags `hard-aggressive` as `too-risky`
- flags `hard-defensive` as `counterattack-needed`
- for dev experiments, reports stable-vs-dev deltas before any promotion decision

### P2: Heavy Turn Decay

Implement route value decay for `hard-heavy-dev` only.

No broad rule suppression.

Candidate formula:

```text
effectivePassClosedRouteScore = passClosedRouteScore * turnValueMultiplier
effectiveMinMargin = baseMargin + lateRoundMarginPenalty
```

Possible multiplier:

| Remaining Tiles | Multiplier |
| ---: | ---: |
| `>= 42` | 1.00 |
| `30-41` | 0.90 |
| `18-29` | 0.75 |
| `< 18` | route override disabled except exceptional value |

Acceptance scout:

- `avgRank` not worse than stable `hard-heavy` by more than 0.02
- `hule` and `drawTenpai` do not drop
- `avgWin` remains near 4000
- `riichi` remains clearly above defensive/balanced

### P3: Balanced State Layer

Implement `hard-balanced-dev` state selection before route/call/push-fold scoring.

First version should be diagnostic-heavy:

- output `balancedState`
- output state reasons
- output temporary personality weights
- do not hide behind one final score

State examples:

| State | Trigger Sketch | Behavior |
| --- | --- | --- |
| `speed` | weak value, good call improvement, no pressure | preserve calls and hule rate |
| `value` | closed hand, good wait/value potential, enough turns | allow route protection |
| `defense` | riichi pressure, weak hand, unsafe push | prefer safety |
| `tenpai` | late, not tenpai, useful call improves hand | preserve draw-tenpai |
| `leader-protect` | late leader or safe score lead | stricter defense |
| `push-comeback` | behind with high value / dealer / sticks | accept more risk |

Acceptance scout:

- `closedRouteOverride/R` no longer near zero
- `calls/R` lower than aggressive/defensive but higher than heavy
- `riichi` between defensive and heavy
- `avgRank` improves from stable `hard-balanced` 2.55

### P4: Aggressive Risk Ceiling

Tune `hard-aggressive-dev` without removing speed identity.

Candidate changes:

- stronger pressure cap only for low-value open hands
- late round dangerous push penalty
- keep early shanten-improving call acceptance

Acceptance scout:

- `4th` improves from 31%
- `dealIn/R` does not exceed 16%
- `win/R` remains the highest or near-highest
- `calls/R` remains high enough to preserve identity

### P5: Defensive Counterattack

Tune `hard-defensive-dev` to stop over-folding.

Candidate changes:

- safe-push when tenpai/good wait/high contextual hand value
- preserve same-xiangting ukeire when safety delta is small
- pressure decay in low-risk late situations

Acceptance scout:

- `dealIn/R` remains best or near-best
- `hule` improves from 20.6%
- `drawTenpai` improves from 73.1%
- `4th` improves toward target

## Test Plan

Deterministic validation:

```bash
node games/majiang/scripts/validate-hard-ai.js
node games/majiang/scripts/validate-ai-hanchan-arena.js
node games/majiang/scripts/validate-hard-vs-mortal-benchmark.js
node scripts/validate.mjs quick
git diff --check
```

Scout validation:

Stable baseline scout:

```bash
node games/majiang/scripts/benchmark-ai-hanchan-arena.js \
  --mode mixed \
  --variants hard-aggressive,hard-defensive,hard-balanced,hard-heavy \
  --matches 200 \
  --checkpoint-interval 25 \
  --progress \
  --stdout summary \
  --out /tmp/h16-four-hard-personality-scout-200.json
```

Stable vs dev scout after P0/P2/P3:

```bash
node games/majiang/scripts/benchmark-ai-hanchan-arena.js \
  --mode mixed \
  --variants hard-aggressive,hard-aggressive-dev,hard-defensive,hard-defensive-dev,hard-balanced,hard-balanced-dev,hard-heavy,hard-heavy-dev \
  --matches 200 \
  --checkpoint-interval 25 \
  --progress \
  --stdout summary \
  --out /tmp/h16-four-hard-personality-dev-scout-200.json
```

Confirmation:

```bash
node games/majiang/scripts/benchmark-ai-hanchan-arena.js \
  --mode mixed \
  --variants hard-aggressive,hard-aggressive-dev,hard-defensive,hard-defensive-dev,hard-balanced,hard-balanced-dev,hard-heavy,hard-heavy-dev \
  --matches 1000 \
  --checkpoint-interval 25 \
  --progress \
  --stdout summary \
  --out /tmp/h16-four-hard-personality-dev-confirm-1000.json
```

## Gate Rules

No change should be promoted only because one metric looks prettier.

Global rejection rules:

- `errors > 0`
- a dev personality loses its intended identity
- `hard-balanced-dev` improves style metrics but not avgRank versus `hard-balanced`
- `hard-heavy-dev` raises riichi but collapses hule/drawTenpai versus `hard-heavy`
- `hard-aggressive-dev` lowers fourth rate by simply becoming defensive
- `hard-defensive-dev` lowers deal-in by becoming unable to win

Promotion principle:

- personality-specific changes enter `hard-xxx-dev` first
- dev changes can enter the stable personality only after 200 scout plus 1000 confirmation
- formal `hard` does not change automatically
- if formal `hard` is changed later, it should likely point to stable `hard-balanced` only after `hard-balanced-dev` wins a large arena sample and is promoted

## Next Recommended Step

Run the focused `hard-balanced` vs `hard-balanced-dev` scout:

```bash
node games/majiang/scripts/benchmark-ai-hanchan-arena.js \
  --mode mixed \
  --variants hard-balanced,hard-balanced-dev,hard-balanced,hard-balanced-dev \
  --matches 200 \
  --checkpoint-interval 25 \
  --progress \
  --stdout summary \
  --out /tmp/h16-balanced-dev-focused-200.json
```

Decision rule:

1. If `closedRouteOverride/R` stays around `0.08-0.18` and `avgRank` is not worse than stable by more than `0.02`, run the 1000-match confirmation.
2. If route override is too high, tighten `balancedLowValueMax` upward only cautiously or raise value/neutral margins; do not copy heavy behavior.
3. If route override is too low, lower `balancedLowValueMax` slightly or reduce value margin; do not broaden generic call blocking.
4. Do not tune all four personalities at once. `hard-balanced-dev` remains the only H16 behavior target until its scout is read.
