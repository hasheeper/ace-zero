# Hard AI Variants

Last reviewed: 2026-06-05

This is the current naming and maintenance reference for hard-family AI variants. Old long-form hard-AI phase notes have been consolidated into this short reference.

## Canonical Names

| Role | Canonical ID | Legacy Alias | Status |
| --- | --- | --- | --- |
| 主力门清防御 | `hard-closed-defense` | `hard-defensive-dev` | Current primary specialized model |
| 主力标准均衡 | `hard-standard` | `hard-balanced` | Current primary standard model |
| 特殊经典打点 | `hard-value-classic` | `hard-heavy` | Usable special comparison model |
| 历史 tuned v2 | `hard-tuned-v2` | `hard-defensive`, `hard-tuned` | Historical baseline |
| 历史 pure v1 | `hard-pure-v1` | `hard-aggressive`, `hard-pure` | Historical baseline |

Use canonical IDs in new config and benchmark commands. Legacy aliases remain accepted for old reports and old scripts.

## Current Model Reading

- `hard-closed-defense` is the strongest current defensive specialization: very low call rate, high riichi rate, lower deal-in in recent scouts, and strong rank results. It should be verified with larger samples before promotion beyond dev/specialized use.
- `hard-standard` is the recommended standard hard baseline: balanced route-state profile, moderate calls, stronger riichi than old tuned hard.
- `hard-value-classic` is not the main direction anymore, but it remains useful as a value-route comparison point.
- `hard-tuned-v2` and `hard-pure-v1` are history models. Keep them for regression and old-report comparison, not as future tuning targets.

## Dev And Retired Names

Current dev shells:

- `hard-standard-dev`: inherits `hard-standard`; use this for the next balanced/standard experiment.
- `hard-pure-v1-dev`: history shell kept for compatibility with old aggressive-dev runs.
- `hard-experimental`: benchmark-only overlay sandbox.

Retired experiments:

- `hard-balanced-candidate`: removed because it was just a `hard-value-classic` clone.
- `hard-heavy-dev`: removed because extra route weight did not improve avgWin or avgRank.
- Old route-inactive `hard-balanced`: retired; the alias now resolves to `hard-standard`.

## Maintenance Rules

- Keep hard-family behavior centralized through `hard-variants.js`.
- Do not add parallel evaluators for personality tuning unless the mechanism is genuinely new.
- Prefer policy weights and compact gates over scattered variant-specific conditionals.
- Preserve legacy aliases, but do not use them as new experiment names.
- Promote only after a 200-match scout and a larger confirmation run both support the change.

## Useful Commands

Current primary comparison:

```bash
node games/majiang/scripts/benchmark-ai-hanchan-arena.js \
  --mode mixed \
  --variants hard-closed-defense,hard-standard,hard-value-classic,alphajong-core \
  --matches 200 \
  --checkpoint-interval 25 \
  --progress \
  --stdout summary \
  --out /tmp/hard-current-primary-200.json
```

Legacy compatibility smoke:

```bash
node games/majiang/scripts/validate-ai-hanchan-arena.js
node games/majiang/scripts/validate-hard-vs-mortal-benchmark.js
```
