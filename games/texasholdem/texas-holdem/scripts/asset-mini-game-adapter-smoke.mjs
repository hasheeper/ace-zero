import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const repoRoot = path.resolve(root, '../../..');
const assetDataPath = path.join(repoRoot, 'apps/st-bridge/packs/acezero-main/asset/data.js');
const adapterPath = path.join(root, 'core/runtime/assets/asset-deck-adapter.js');

const sandbox = { console };
sandbox.global = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(assetDataPath, 'utf8'), sandbox, { filename: assetDataPath });
vm.runInContext(fs.readFileSync(adapterPath, 'utf8'), sandbox, { filename: adapterPath });

const adapter = sandbox.AssetDeckAdapter;
assert.ok(adapter, 'AssetDeckAdapter should be exported');

function makeAssetDeck({ general = [], void: voidCards = [] }) {
  const catalog = sandbox.ACE0AssetDeckData.ASSET_CARD_CATALOG;
  const ensureCatalogCard = (card) => {
    const id = card.id || card.cardId;
    if (!id) return null;
    if (card.modifiers && !catalog.some(item => item.id === id)) {
      catalog.push({
        id,
        name: card.name || id,
        rarity: card.rarity || 'bronze',
        kind: card.kind || 'numeric',
        scope: card.scope,
        system: card.system,
        skillKey: card.skillKey,
        level: card.level,
        targetTags: card.targetTags || ['team'],
        gameTags: card.gameTags || ['any'],
        slotTags: card.slotTags || ['general'],
        effectText: card.effectText || '',
        statusTags: card.statusTags || [],
        modifiers: card.modifiers
      });
    }
    return { id, lv: Math.max(1, Math.round(Number(card.lv || card.level) || 1)) };
  };
  return {
    slots: { general: 4, void: 2 },
    bag: {
      general: general.map(ensureCatalogCard).filter(Boolean),
      void: voidCards.map(ensureCatalogCard).filter(Boolean)
    }
  };
}

const assetDeck = makeAssetDeck({
  general: [
    {
      cardId: 'asset_texas_only',
      gameTags: ['texas-holdem'],
      modifiers: [
        { type: 'skill_cost_pct', value: -0.5 },
        { type: 'force_power_pct', value: 0.5 }
      ]
    },
    {
      cardId: 'asset_global_force',
      gameTags: ['any'],
      modifiers: [{ type: 'force_power_pct', value: 0.08 }]
    },
    {
      cardId: 'asset_blackjack_cost',
      gameTags: ['blackjack'],
      modifiers: [{ type: 'skill_cost_pct', value: -0.15 }]
    },
    {
      cardId: 'asset_blackjack_bonus',
      gameTags: ['blackjack'],
      modifiers: [{ type: 'reward_pct', key: 'blackjack', value: 0.12 }]
    },
    {
      cardId: 'asset_dice_risk',
      gameTags: ['dice'],
      modifiers: [{ type: 'risk_pct', value: -0.12 }]
    },
    {
      cardId: 'asset_dice_triple',
      gameTags: ['dice'],
      modifiers: [{ type: 'payout_pct', key: 'triple', value: 0.1 }]
    },
    {
      cardId: 'asset_dt_force',
      gameTags: ['dragon-tiger'],
      modifiers: [{ type: 'force_power_pct', value: 0.1 }]
    },
    {
      cardId: 'asset_dt_tie',
      gameTags: ['dragon_tiger'],
      modifiers: [{ type: 'odds_pct', key: 'tie', value: 0.08 }]
    }
  ],
  void: []
});

const blackjack = adapter.compile({ gameId: 'blackjack', assetDeck });
assert.equal(adapter.resolveSkillCost(blackjack, { skillKey: 'lucky_hit', system: 'moirai' }, 20).finalCost, 17, 'Blackjack cost card should reduce mini-game skill cost');
assert.equal(adapter.resolveMiniGameValue(blackjack, 'reward', 'blackjack', 150).value, 168, 'Blackjack reward card should affect blackjack reward');
assert.equal(adapter.enhanceForcePower(blackjack, { skillKey: 'lucky_hit', system: 'moirai', power: 50 }).power, 54, 'Global any force card should affect blackjack');
assert.equal(adapter.enhanceForcePower(blackjack, { ownerId: 2, skillKey: 'curse', system: 'chaos', power: 50 }).power, 50, 'Mini-game force card should not buff enemy forces by default');
assert.equal(blackjack.debug.ignored.some(item => item.cardId === 'asset_texas_only' && item.reason === 'game_tag_mismatch'), true, 'Texas-only card should not affect blackjack');

const dice = adapter.compile({ gameId: 'dice-game', assetDeck });
assert.equal(adapter.resolveMiniGameValue(dice, 'risk', 'roll', 1).value, 0.88, 'Dice risk card should affect dice risk multiplier');
assert.equal(adapter.resolveMiniGameValue(dice, 'payout', 'triple', 30).value, 33, 'Dice triple payout card should affect triple payout');
assert.equal(adapter.resolveSkillCost(dice, { skillKey: 'fortune_die', system: 'moirai' }, 20).finalCost, 20, 'Blackjack cost card should not affect dice skill cost');

const dragonTiger = adapter.compile({ gameId: 'dragon_tiger', assetDeck });
assert.equal(adapter.enhanceForcePower(dragonTiger, { skillKey: 'dt_boost', system: 'moirai', power: 20 }).power, 23.6, 'Dragon-tiger force card and global force card should stack');
assert.equal(adapter.resolveMiniGameValue(dragonTiger, 'odds', 'tie', 8).value, 8.64, 'Dragon-tiger tie odds card should affect tie payout');

const mahjong = adapter.compile({ gameId: 'mahjong', assetDeck });
assert.equal(adapter.enhanceForcePower(mahjong, { skillKey: 'generic', system: 'moirai', power: 50 }).power, 54, 'Mahjong should read any/global cards');
assert.equal(adapter.resolveMiniGameValue(mahjong, 'payout', 'blackjack', 1.5).value, 1.5, 'Mahjong should ignore blackjack-only cards');

const compiledConfig = adapter.compileMiniGameConfig({
  gameMode: 'blackjack',
  assetDeck
}, { gameId: 'blackjack' });
assert.equal(compiledConfig.assetModifiers.debug.applied.some(item => item.cardId === 'asset_blackjack_cost'), true, 'compileMiniGameConfig should attach compiled mini-game modifiers');

console.log('[asset-mini-game-adapter-smoke] ok');
