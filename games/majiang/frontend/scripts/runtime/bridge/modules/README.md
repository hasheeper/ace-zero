# Mahjong Runtime Bridge Internals

This directory contains classic-script helper modules for `runtime-bridge.js`.

They are intentionally loaded through `app-entry.js` before `runtime-bridge.js` and install private bridge namespaces on `window`:

- `AceMahjongBridgeActionNormalizer`
- `AceMahjongBridgeRuntimeFactory`
- `AceMahjongBridgeFrontendEffects`

These files are not public game APIs and are not ESM entrypoints. Keep coach state, coach request, coach analysis, and auto-coach behavior in `runtime-bridge.js` until that feature area is explicitly planned.
