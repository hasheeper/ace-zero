import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../../..');

const adapterPath = path.join(repoRoot, 'games/texasholdem/texas-holdem/core/runtime/assets/asset-deck-adapter.js');
const assetDataPath = path.join(repoRoot, 'apps/st-bridge/packs/acezero-main/asset/data.js');
const summaryPath = path.join(repoRoot, 'apps/st-bridge/packs/acezero-main/asset/summary.js');
const basePath = path.join(repoRoot, 'games/shared/mini-game-base.js');

let appended = null;
let oldRemoved = false;
const oldStrip = { remove: () => { oldRemoved = true; } };
const dashboard = {
  querySelector(selector) {
    return selector === '.mg-asset-status' ? oldStrip : null;
  },
  appendChild(el) {
    appended = el;
  }
};

const sandbox = {
  console,
  document: {
    querySelector(selector) {
      return selector === '.ui-dashboard' ? dashboard : null;
    },
    createElement() {
      return {
        className: '',
        innerHTML: '',
        remove() {}
      };
    }
  },
  setTimeout,
  fetch: async () => ({ ok: false })
};
sandbox.window = sandbox;
sandbox.global = sandbox;
sandbox.globalThis = sandbox;
sandbox.window.parent = sandbox.window;
sandbox.window.addEventListener = () => {};

vm.createContext(sandbox);
for (const filePath of [assetDataPath, adapterPath, summaryPath, basePath]) {
  vm.runInContext(fs.readFileSync(filePath, 'utf8'), sandbox, { filename: filePath });
}

const MiniGameBase = sandbox.MiniGameBase;
assert.ok(MiniGameBase, 'MiniGameBase should be exported');
assert.equal(typeof MiniGameBase.applyAssetDeckToMiniGameConfig, 'function');
assert.equal(typeof MiniGameBase.renderAssetStatus, 'function');

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
    slots: { general: 4, void: 1 },
    bag: {
      general: general.map(ensureCatalogCard).filter(Boolean),
      void: voidCards.map(ensureCatalogCard).filter(Boolean)
    }
  };
}

const assetDeck = makeAssetDeck({
  general: [
    {
      cardId: 'asset_blackjack_cost',
      gameTags: ['blackjack'],
      modifiers: [{ type: 'skill_cost_pct', value: -0.15 }]
    },
    {
      cardId: 'asset_global_force',
      gameTags: ['any'],
      modifiers: [{ type: 'force_power_pct', value: 0.08 }]
    },
    {
      cardId: 'asset_dice_only',
      gameTags: ['dice'],
      modifiers: [{ type: 'payout_pct', key: 'triple', value: 0.1 }]
    }
  ],
  void: []
});

const compiled = MiniGameBase.applyAssetDeckToMiniGameConfig({
  gameMode: 'blackjack',
  assetPoints: 4,
  assetDeck
}, 'blackjack');

assert.ok(compiled.assetModifiers, 'mini-game config should receive compiled asset modifiers');
assert.ok(compiled.assetSummary, 'mini-game config should receive shared asset summary');
assert.equal(compiled.assetSummary.counts.active, 3);
assert.equal(compiled.assetSummary.counts.effective, 3);

MiniGameBase.renderAssetStatus(compiled);

assert.equal(oldRemoved, true, 'render should replace an existing mini-game asset strip');
assert.ok(appended, 'render should append mini-game asset strip');
assert.equal(appended.className, 'mg-asset-status');
assert.match(appended.innerHTML, /ASSET/);
assert.match(appended.innerHTML, /4 PTS/);
assert.match(appended.innerHTML, /3\/3 ACTIVE/);
assert.match(appended.innerHTML, /COST -15%/);
assert.match(appended.innerHTML, /FORCE \+8%/);

console.log('[asset-mini-game-status-smoke] ok');
