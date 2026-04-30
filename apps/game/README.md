# AceZero Game App

`apps/game` is the GitPage-managed game surface.

## Structure

- `index.html` is the game dashboard/host. It loads `../../registry/games.json` and embeds the selected game.
- `modules/*/index.html` are App-managed game entries. Current entries are thin wrappers around legacy implementations.

The current game implementations live in `games/` as independent containers:

- `games/texasholdem/`
- `games/blackjack/`
- `games/dice-game/`
- `games/dragon-tiger/`
- `games/majiang/`

New links should target `index.html?app=game` or `apps/game`; direct `games/*` paths are available for standalone game debugging.
