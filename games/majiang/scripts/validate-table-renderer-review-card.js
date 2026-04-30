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
    'coach-card-kicker',
    'coach-card-mode',
    'coach-card-status',
    'coach-card-meta',
    'coach-card-summary',
    'coach-card-recommend',
    'coach-card-reason-summary',
    'coach-card-reasons',
    'coach-card-close',
    'review-card',
    'review-card-kicker',
    'review-card-mode',
    'review-card-status',
    'review-card-meta',
    'review-card-summary',
    'review-card-recommend',
    'review-card-reason-summary',
    'review-card-reasons',
    'review-card-close'
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
    coachState: {
      status: 'ready',
      source: 'auto-review-background',
      perspectiveSeat: 'bottom',
      summary: '建议切出 五万。',
      recommended: {
        type: 'discard',
        seat: 'bottom',
        tileCode: 'm5'
      },
      liveState: {
        status: 'ready',
        source: 'auto-review-background',
        perspectiveSeat: 'bottom',
        summary: '建议切出 五万。',
        recommended: {
          type: 'discard',
          seat: 'bottom',
          tileCode: 'm5'
        },
        contextSignature: 'draw-live'
      },
      reviewState: {
        status: 'ready',
        source: 'auto-review',
        perspectiveSeat: 'bottom',
        summary: '本手判定：恶手。你的碰选择偏激进。',
        recommended: {
          type: 'call',
          seat: 'bottom',
          callType: 'peng',
          meldString: 'm555='
        },
        reasonSummary: '这是一条行动复盘。',
        reviewMode: true,
        contextSignature: 'reaction-review'
      }
    }
  };
  const { renderer, document } = loadRenderer(() => state);
  renderer.renderCenterInfo();

  const coachRoot = document.getElementById('coach-card');
  const reviewRoot = document.getElementById('review-card');

  assert(coachRoot.classList.contains('is-active'), 'expected coach card to be active');
  assert(reviewRoot.classList.contains('is-active'), 'expected review card to be active');
  assert(document.getElementById('coach-card-mode').textContent === '摸打建议', 'expected coach card to render draw suggestion mode');
  assert(document.getElementById('review-card-mode').textContent === '行动复盘', 'expected review card to render reaction review mode');
  assert(document.getElementById('coach-card-kicker').textContent === 'Draw Coach', 'expected coach card kicker to distinguish draw suggestion');
  assert(document.getElementById('review-card-kicker').textContent === 'Reaction Review', 'expected review card kicker to distinguish reaction review');
  assert(document.getElementById('review-card-status').textContent === '复盘就绪', 'expected review card ready label');
  assert(/推荐碰 m555=/.test(document.getElementById('review-card-recommend').textContent), `expected review recommendation to format peng, got ${JSON.stringify(document.getElementById('review-card-recommend').textContent)}`);

  console.log('[PASS] table-renderer-review-card-smoke');
}

main();
