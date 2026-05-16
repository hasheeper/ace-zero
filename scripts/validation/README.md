# Validation Suites

Use the top-level runner as the single validation entry:

```bash
node scripts/validate.mjs quick
node scripts/validate.mjs full
node scripts/validate.mjs ci
node scripts/validate.mjs cdp
```

## Suites

- `quick`: default local gate. Parses required JSON, checks all `.js/.mjs` syntax, imports the game host ESM boundaries, and runs deterministic smoke tests for shared modules, Dashboard overview, ST bridge, Mahjong bridge, and Texas non-CDP logic.
- `ci`: deterministic GitHub Actions gate. It is intentionally equivalent to `quick` and must not require browsers, CDP, servers, bundlers, or TypeScript.
- `full`: extended deterministic gate. It includes `quick`, then adds broader ST bridge and Mahjong scenario regressions. It still skips browser/CDP-only tests and external Mortal/conda inference checks.
- `cdp`: Texas browser regression gate. It only runs CDP-backed Texas scripts and requires a local Chrome/Chromium remote-debugging endpoint.

## CDP Setup

The `cdp` suite checks `http://127.0.0.1:${ACEZERO_CDP_PORT:-9223}/json/version` before running scripts.

Serve the repo with a local static server and point the Texas scripts at the served page when needed:

```bash
python3 -m http.server 8788 --bind 127.0.0.1
ACEZERO_CDP_PORT=9223 \
ACEZERO_TEXAS_URL=http://127.0.0.1:8788/games/texasholdem/texas-holdem/texas-holdem.html \
node scripts/validate.mjs cdp
```

If CDP is not running, the suite exits with a clear environment error instead of reporting a source regression.

Mortal/conda-backed Mahjong coach inference scripts are also treated as environment-specific checks. Keep them outside `quick`, `ci`, and `full` unless they gain a dedicated preflight gate like `cdp`.

Historical or currently red scenario scripts should stay outside the recommended suites until they are fixed and can fail only on real regressions.

## Migration Entry Rules

- New game-host code should import from `apps/game/runtime/*`.
- New mini-game shared code should import from `games/shared/modules/*`.
- Existing classic-script consumers do not need forced migration; keep their globals stable until the owning feature is intentionally migrated.
- Do not move Texas core gameplay, Mahjong coach logic, Dashboard CSS, or ST bridge protocols as part of validation-only work.
