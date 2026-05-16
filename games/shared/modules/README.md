# Shared ESM Facades

This directory contains native ESM facades for the legacy `games/shared/*.js` classic scripts.

- `base.js` exposes `../mini-game-base.js` as ESM.
- `force.js` exposes `../mini-game-force.js` as ESM.
- `logger.js` exposes `../mini-game-logger.js` as ESM.
- `combat-settlement.js` exposes `../combat-settlement.js` as ESM.

The legacy files stay in `games/shared/` because existing game HTML files load them synchronously through `<script src="...">`. New code should import from this directory instead of adding more `.module.js` files to the shared root.
