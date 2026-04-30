# Shared Runtime Layout

`shared/runtime/` groups cross-environment runtime helpers by responsibility.

## `state/`

Round state and seat-state shaping helpers.

- `round-state-support.js`
- `seat-status.js`
- `draw-support.js`

## `reaction/`

Reaction priority, candidate building, and post-reaction resolution helpers.

- `reaction-priority.js`
- `reaction-candidates.js`
- `reaction-flow.js`
- `post-reaction.js`

## `scoring/`

Hule gating, settlement, and round-result shaping helpers.

- `hule-gate.js`
- `settlement.js`
- `round-result.js`

## `rules/`

Cross-environment rule support that still belongs to runtime logic.

- `rules.js`
- `furiten.js`
- `riichi-flow.js`
- `kan.js`

## `support/`

Supporting helpers used by both Node and browser runtimes.

- `testing-setup.js`
- `view-factory.js`
