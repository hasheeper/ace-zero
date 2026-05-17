# AceZero ST Bridge

Stable SillyTavern entry for AceZero packs.

## Load

Production script:

```js
window.ST_BRIDGE_PACK = 'acezero-main';
window.ST_BRIDGE_ENV = 'prod';
window.ST_BRIDGE_URL = 'https://hasheeper.github.io/ace-zero/apps/st-bridge/bridge.js';
import 'https://hasheeper.github.io/ace-zero/apps/st-bridge/bridge.js?env=prod&v=fix-url';
```

Explicit pack:

```js
import 'https://hasheeper.github.io/ace-zero/apps/st-bridge/bridge.js?pack=acezero-main&v=fix-url';
```

Local testing:

```sh
node apps/st-bridge/scripts/serve-local.mjs --port 4173 --root .
```

```js
window.ST_BRIDGE_PACK = 'acezero-main';
window.ST_BRIDGE_ENV = 'local';
window.ACE0_APP_BASE_URL = 'http://127.0.0.1:4173';
window.ST_BRIDGE_URL = 'http://127.0.0.1:4173/apps/st-bridge/bridge.js';
import 'http://127.0.0.1:4173/apps/st-bridge/bridge.js?env=local&v=dev';
```

Full-doc worldbook names are centralized in `packs/acezero-main/tavern/worldbook-profile.js`.
Only set `window.ACE0_FULL_DOC_WORLDBOOK_NAME` in the Tavern helper script when you intentionally want to override that profile for one test session.

For Tavern regex wrappers, production uses `st/wrappers/STver.html` and `st/wrappers/ACT_RESULT.html`.
Local offline testing uses `st/wrappers/local/STver.local.html` and `st/wrappers/local/ACT_RESULT.local.html`; these two files hardcode `http://127.0.0.1:4173` and do not fall back to GitHub Pages.

## Contract

`bridge.js` owns loading, ordering, cache busting, pack selection, and shared MVU IO helpers.

Pack scripts own AceZero business behavior.

Dashboard and visible UI surfaces should be loaded as GitPage or local static apps through root `index.html?app=...`, not inlined into one large Tavern script. The bridge profile controls whether app iframes resolve to GitHub Pages or the local static server.

## Pack Layout

`packs/acezero-main` keeps the stable bridge pack. It is organized by domain:

- `schema/acezero-schema.js` owns MVU schema registration.
- `act/data.js` provides ACT encounter/campaign defaults.
- `act/generated-data.js` provides generated-route motif, lane, and node-name tables.
- `act/generated-runtime.js` owns generated-route graph construction.
- `act/narrative-runtime.js` owns ACT prompt summaries, narrative pacing, seeded event pools, and chapter transition prompt content.
- `act/frontend-snapshot.js` owns Dashboard/frontend payload projection from ACT state and chapter config.
- `act/encounter-runtime.js` owns character encounter state, first-meet queues, placement, and trigger helpers.
- `act/plugin.js` owns ACT runtime behavior and exposes `ACE0Modules.act`.
- `tavern/docs.js` provides character prompt documents and location layer docs.
- `tavern/worldbook-profile.js` owns full-doc worldbook names for prod/local profiles.
- `tavern/npc-data.js` provides NPC assembly tables, character stats, skills, runner presets, and relationship stage data.
- `tavern/battle-runtime.js` owns NPC/battle assembly helpers backed by `tavern/npc-data.js`.
- `tavern/character-runtime.js` owns hero naming, cast/roster helpers, and character prompt doc injection.
- `tavern/context.js` owns hero, relationship, world, and location summaries.
- `tavern/act-runtime.js` owns ACT host bridging, ACT state normalization, narrative prompts, snapshots, tension, and world clock helpers.
- `tavern/result.js` owns battle tag parsing, frontend payload injection, and ACT result payload generation.
- `tavern/plugin.js` owns Tavern middleware, prompt injection, and `ACE0Plugin`.
- `dashboard/loader.js` injects the GitPage Dashboard app.
