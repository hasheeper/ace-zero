'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function createClassList() {
  const tokens = new Set();
  return {
    add(...names) {
      names.forEach((name) => tokens.add(name));
    },
    remove(...names) {
      names.forEach((name) => tokens.delete(name));
    },
    toggle(name, force) {
      if (force === true) {
        tokens.add(name);
        return true;
      }
      if (force === false) {
        tokens.delete(name);
        return false;
      }
      if (tokens.has(name)) {
        tokens.delete(name);
        return false;
      }
      tokens.add(name);
      return true;
    },
    contains(name) {
      return tokens.has(name);
    }
  };
}

function createElement(id) {
  return {
    id,
    style: {},
    dataset: {},
    textContent: '',
    innerHTML: '',
    children: [],
    classList: createClassList(),
    appendChild(node) {
      this.children.push(node);
      return node;
    },
    prepend(node) {
      this.children.unshift(node);
      return node;
    },
    querySelector() {
      return null;
    }
  };
}

function buildDocument() {
  const ids = [
    'info-round-text',
    'info-tenbou-row',
    'info-honba-count',
    'info-riichi-count',
    'info-riichi-item',
    'info-divider',
    'info-remain-count',
    'center-dora-wrap',
    'center-dora-tier',
    'score-top',
    'score-left',
    'score-right',
    'score-bottom',
    'wind-top',
    'wind-left',
    'wind-right',
    'wind-bottom',
    'coach-card',
    'coach-card-status',
    'coach-card-meta',
    'coach-card-summary',
    'coach-card-recommend',
    'analysis-card',
    'analysis-card-status',
    'analysis-card-meta',
    'analysis-card-summary',
    'analysis-card-metrics',
    'analysis-card-focus',
    'analysis-card-close'
  ];
  const elements = new Map(ids.map((id) => [id, createElement(id)]));
  return {
    getElementById(id) {
      return elements.get(id) || null;
    },
    createElement(tagName) {
      return createElement(tagName);
    }
  };
}

function loadRenderer(getTableInfoState) {
  const rendererPath = path.resolve(__dirname, '../frontend/scripts/ui/table-renderer.js');
  const source = fs.readFileSync(rendererPath, 'utf8');
  const document = buildDocument();
  const sandbox = {
    console,
    window: null,
    document
  };
  sandbox.window = sandbox;
  vm.runInNewContext(source, sandbox, { filename: rendererPath });
  const createTableRenderer = sandbox.AceMahjongCreateTableRenderer;
  const renderer = createTableRenderer({
    getTableInfoState,
    getAppRoot: () => ({ classList: { toggle() {} }, dataset: {} }),
    getBottomRiverTiles: () => [],
    getBottomHandTiles: () => [],
    getBaseBottomMelds: () => [],
    getBottomSeatState: () => ({ riichi: null, kitaTiles: [] }),
    getOpponentSeats: () => [],
    renderHandStatusOverlay() {},
    scheduleTableInteractionProxySync() {},
    applyBottomHandPreviewClasses() {},
    playPendingTableAnimations() {}
  });
  return { renderer, document };
}

function main() {
  const state = {
    roundText: '东一',
    scores: {},
    seatWinds: {},
    coachAnalysisState: {
      status: 'ready',
      source: 'benchmark',
      summary: 'easy(right) 当前主要分歧集中在防守弃牌。',
      report: {
        totals: { rows: 5, subjects: 1 },
        subjects: [
          {
            summary: {
              label: 'easy(right)',
              mortalRate: 0.2,
              actionTypeRate: 1,
              riichiRate: 0.8,
              goodCount: 1,
              neutralCount: 3,
              badCount: 1,
              bucketCounts: {
                'tile-defense': 1,
                'tile-choice': 3
              }
            }
          }
        ]
      }
    }
  };
  const { renderer, document } = loadRenderer(() => state);
  renderer.renderCenterInfo();

  const root = document.getElementById('analysis-card');
  assert(root.classList.contains('is-active'), 'expected analysis card active');
  assert(document.getElementById('analysis-card-status').textContent === '分析就绪', 'expected analysis ready label');
  assert(/easy\(right\)/.test(document.getElementById('analysis-card-meta').textContent), 'expected subject label in analysis meta');
  assert(/参考一致率 20%/.test(document.getElementById('analysis-card-metrics').textContent), 'expected analysis metrics text');
  assert(/tile-choice x3/.test(document.getElementById('analysis-card-focus').textContent), 'expected focus bucket text');

  document.getElementById('analysis-card-close').onclick();
  assert(!root.classList.contains('is-active'), 'expected analysis card hidden after close button');

  state.coachAnalysisState = null;
  renderer.renderCenterInfo();
  assert(!root.classList.contains('is-active'), 'expected analysis card hidden after clear');

  console.log('[PASS] table-renderer-analysis-card-smoke');
}

main();
