const jsonFiles = [
  'registry/apps.json',
  'registry/games.json',
  'apps/st-bridge/manifest.json',
  'content/game-config.json',
  'content/tutorials/texas-holdem/tutorial-index.json'
];

const gameRuntimeEsmModules = [
  'apps/game/runtime/game-protocol.js',
  'apps/game/runtime/registry-loader.js',
  'apps/game/runtime/shared-utils.js',
  'apps/game/runtime/data-loader.js'
];

const stCoreSmokes = [
  'apps/st-bridge/packs/acezero-main/scripts/schema-smoke.js',
  'apps/st-bridge/packs/acezero-main/scripts/asset-runtime-smoke.js',
  'apps/st-bridge/packs/acezero-main/scripts/asset-summary-smoke.js',
  'apps/st-bridge/packs/acezero-main/scripts/combat-loop-smoke.js',
  'apps/st-bridge/packs/acezero-main/scripts/encounter-runtime-smoke.js',
  'apps/st-bridge/packs/acezero-main/scripts/encounter-context-smoke.js',
  'apps/st-bridge/packs/acezero-main/scripts/encounter-host-smoke.js'
];

const stExtendedSmokes = [
  'apps/st-bridge/packs/acezero-main/scripts/act-asset-command-smoke.js',
  'apps/st-bridge/packs/acezero-main/scripts/act-asset-flow-smoke.js',
  'apps/st-bridge/packs/acezero-main/scripts/act-asset-host-smoke.js',
  'apps/st-bridge/packs/acezero-main/scripts/act-asset-tavern-host-smoke.js',
  'apps/st-bridge/packs/acezero-main/scripts/act-narrative-floorkey-smoke.js',
  'apps/st-bridge/packs/acezero-main/scripts/act-result-asset-offer-smoke.js',
  'apps/st-bridge/packs/acezero-main/scripts/character-doc-mini-smoke.js',
  'apps/st-bridge/packs/acezero-main/scripts/init-alignment-smoke.js',
  'apps/st-bridge/packs/acezero-main/scripts/tavern-frontend-assetdeck-smoke.js'
];

const mahjongBridgeSmokes = [
  'games/majiang/scripts/validate-runtime-bridge-action-type-fallback.js',
  'games/majiang/scripts/validate-runtime-bridge-analysis-state.js',
  'games/majiang/scripts/validate-runtime-bridge-auto-coach-pass.js',
  'games/majiang/scripts/validate-runtime-bridge-auto-coach.js',
  'games/majiang/scripts/validate-runtime-bridge-coach-state.js',
  'games/majiang/scripts/validate-runtime-bridge-coach-timer-cleanup.js',
  'games/majiang/scripts/validate-runtime-bridge-live-analysis.js',
  'games/majiang/scripts/validate-runtime-bridge-pending-review-state.js',
  'games/majiang/scripts/validate-runtime-bridge-reaction-review-baseline.js',
  'games/majiang/scripts/validate-runtime-bridge-review-hold.js',
  'games/majiang/scripts/validate-runtime-bridge-review-to-draw-live-switch.js',
  'games/majiang/scripts/validate-runtime-bridge-review-to-live-switch.js',
  'games/majiang/scripts/validate-analysis-page.js'
];

const mahjongScenarioSmokes = [
  'games/majiang/scripts/validate-easy-ai-call-execution.js',
  'games/majiang/scripts/validate-easy-ai.js',
  'games/majiang/scripts/validate-friendly-json-rules.js',
  'games/majiang/scripts/validate-furiten-scenarios.js',
  'games/majiang/scripts/validate-match-session-regression.js',
  'games/majiang/scripts/validate-p2-heads-up-scoring.js',
  'games/majiang/scripts/validate-p2-scenarios.js',
  'games/majiang/scripts/validate-p2-wall.js',
  'games/majiang/scripts/validate-p2-wind-yaku.js',
  'games/majiang/scripts/validate-p3-scenarios.js',
  'games/majiang/scripts/validate-p5-scenarios.js',
  'games/majiang/scripts/validate-p6-pao-scenarios.js',
  'games/majiang/scripts/validate-phase1-scenarios.js',
  'games/majiang/scripts/validate-phaseA-scenarios.js',
  'games/majiang/scripts/validate-phaseB-scenarios.js',
  'games/majiang/scripts/validate-phaseD-scenarios.js',
  'games/majiang/scripts/validate-sanma-dead-wall.js',
  'games/majiang/scripts/validate-sanma-dora-indicators.js',
  'games/majiang/scripts/validate-sanma-kita-gating.js',
  'games/majiang/scripts/validate-sanma-settlement-view.js',
  'games/majiang/scripts/validate-sanma-tsumo-loss.js',
  'games/majiang/scripts/validate-shibari-rules.js',
  'games/majiang/scripts/validate-suggestion-format.js',
  'games/majiang/scripts/validate-table-renderer-analysis-card.js',
  'games/majiang/scripts/validate-table-renderer-auto-dismiss.js',
  'games/majiang/scripts/validate-table-renderer-coach-card.js',
  'games/majiang/scripts/validate-table-renderer-review-card.js',
  'games/majiang/scripts/validate-west-entry-target-score.js'
];

const texasNodeSmokes = [
  'games/texasholdem/texas-holdem/scripts/ai-action-regression.mjs',
  'games/texasholdem/texas-holdem/scripts/ai-destiny-equity-smoke.mjs',
  'games/texasholdem/texas-holdem/scripts/asset-adapter-smoke.mjs',
  'games/texasholdem/texas-holdem/scripts/asset-mini-game-adapter-smoke.mjs',
  'games/texasholdem/texas-holdem/scripts/asset-mini-game-status-smoke.mjs',
  'games/texasholdem/texas-holdem/scripts/runtime-role-regression.mjs'
];

const texasCdpSmokes = [
  'games/texasholdem/texas-holdem/scripts/asset-real-regression.mjs',
  'games/texasholdem/texas-holdem/scripts/asset-balance-regression.mjs',
  'games/texasholdem/texas-holdem/scripts/skill-real-regression.mjs'
];

function nodeTasks(files, prefix) {
  return files.map((file) => ({
    type: 'node',
    name: `${prefix}: ${file}`,
    script: file
  }));
}

const quickTasks = [
  { type: 'json', name: 'Parse required JSON files', files: jsonFiles },
  { type: 'node-check-all', name: 'Check JavaScript syntax for all .js/.mjs files' },
  { type: 'esm-import', name: 'Import game runtime ESM boundaries', files: gameRuntimeEsmModules },
  { type: 'node', name: 'Shared mini-game ESM facade smoke', script: 'games/shared/scripts/shared-module-smoke.mjs' },
  { type: 'node', name: 'Dashboard overview boundary smoke', script: 'apps/dashboard/pages/overview/scripts/validate-overview-boundaries.js' },
  ...nodeTasks(stCoreSmokes, 'ST core smoke'),
  ...nodeTasks(mahjongBridgeSmokes, 'Mahjong bridge smoke'),
  ...nodeTasks(texasNodeSmokes, 'Texas Node smoke')
];

const fullAdditionalTasks = [
  ...nodeTasks(stExtendedSmokes, 'ST extended smoke'),
  ...nodeTasks(mahjongScenarioSmokes, 'Mahjong scenario smoke')
];

export const defaultSuiteName = 'quick';

export const suiteDefinitions = Object.freeze({
  quick: Object.freeze({
    description: 'Fast local deterministic validation. No browser or CDP dependencies.',
    tasks: quickTasks
  }),
  ci: Object.freeze({
    description: 'GitHub Actions deterministic validation. Equivalent to quick and excludes browser/CDP checks.',
    tasks: quickTasks
  }),
  full: Object.freeze({
    description: 'Extended deterministic validation. Includes quick plus more ST and Mahjong Node regressions.',
    tasks: [...quickTasks, ...fullAdditionalTasks]
  }),
  cdp: Object.freeze({
    description: 'Texas browser/CDP regressions. Requires Chrome CDP and a static Texas page URL.',
    tasks: [
      { type: 'cdp-preflight', name: 'Check Texas CDP environment' },
      ...nodeTasks(texasCdpSmokes, 'Texas CDP regression')
    ]
  })
});
