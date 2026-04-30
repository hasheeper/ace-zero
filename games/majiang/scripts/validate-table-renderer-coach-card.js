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
    'coach-card-close'
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
      source: 'mortal',
      perspectiveSeat: 'bottom',
      summary: '建议切出 s3，维持更好的两面结构。',
      recommended: {
        type: 'discard',
        seat: 'bottom',
        tileCode: 's3',
        riichi: false
      }
    }
  };
  const { renderer, document } = loadRenderer(() => state);
  renderer.renderCenterInfo();

  const coachRoot = document.getElementById('coach-card');
  const status = document.getElementById('coach-card-status').textContent;
  const meta = document.getElementById('coach-card-meta').textContent;
  const summary = document.getElementById('coach-card-summary').textContent;
  const recommend = document.getElementById('coach-card-recommend').textContent;

  assert(coachRoot.classList.contains('is-active'), 'expected coach card to become active for ready state');
  assert(status === '建议就绪', `expected ready label, got ${JSON.stringify(status)}`);
  assert(/来源 mortal/.test(meta), `expected meta to include source, got ${JSON.stringify(meta)}`);
  assert(/视角 自家/.test(meta), `expected meta to include seat label, got ${JSON.stringify(meta)}`);
  assert(/s3/.test(summary), `expected summary to preserve suggestion text, got ${JSON.stringify(summary)}`);
  assert(/推荐打出 三索/.test(recommend), `expected recommendation text to format tile label, got ${JSON.stringify(recommend)}`);

  document.getElementById('coach-card-close').onclick();
  assert(!coachRoot.classList.contains('is-active'), 'expected coach card to hide after close button');

  state.coachState = null;
  renderer.renderCenterInfo();

  assert(!coachRoot.classList.contains('is-active'), 'expected coach card to hide when coach state is cleared');
  assert(document.getElementById('coach-card-status').textContent === '待命', 'expected idle label after clear');
  assert(document.getElementById('coach-card-summary').textContent === '当前还没有教练建议。', 'expected idle summary after clear');

  console.log('[PASS] table-renderer-coach-card-smoke');
  console.log(`  snapshot=${JSON.stringify({ status, meta, summary, recommend })}`);
}

main();
