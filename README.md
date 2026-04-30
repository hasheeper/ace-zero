# ace-zero

Standalone AceZero game app repository.

## GitHub Pages Entry

- `index.html` is the canonical GitHub Pages app container.
- `apps/game/index.html` is the current game dashboard/runtime shell.

## Layout

```text
.
├── registry/               # App and game registries
├── apps/                   # GitPage app surfaces: game, tutorial, dashboard, act-result, st-bridge
├── games/                  # Independent game containers
├── st/                     # SillyTavern wrappers, init payloads, and docs
├── content/                # Game config and tutorial payloads
├── assets/                 # Shared visual assets
└── index.html              # Root App Container
```

The next migration step is to move each game from wrapper entries into first-class game containers without mixing ST bridge code into game runtime code.
