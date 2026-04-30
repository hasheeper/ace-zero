# Runtime Layout

`runtime/` now groups browser runtime code by responsibility instead of keeping every file flat in one directory.

## `formal/`

Single-round formal browser runtime.

- `runtime-core.js`: composition root for the formal browser runtime shell
- `runtime-foundation.js`: seat/phase/snapshot/foundation method attachment
- `runtime-actions.js`: draw/discard/call/kan/hule action methods
- `runtime-shell.js`: runtime object creation and round initialization
- `runtime-factory.js`: browser-facing factory with AI/auto-run behavior
- `legacy-runtime-factory.js`: legacy browser runtime fallback

## `session/`

Match / multi-round runtime built on top of child single-round runtimes.

- `game-session-runtime.js`

## `bridge/`

Page bootstrap, runtime mounting, browser sync, smoke helpers.

- `runtime-bridge.js`
- `runtime-bootstrap.js`
- `browser-smoke-tests.js`

## Root files

- `browser-core-adapter.js`: browser adapter over majiang-core and shared runtime dependencies
