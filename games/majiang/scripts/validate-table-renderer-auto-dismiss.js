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

function createFakeTimers() {
  let now = 0;
  let seq = 0;
  const timers = new Map();
  return {
    setTimeout(fn, delay) {
      const id = ++seq;
      timers.set(id, {
        fn,
        at: now + Number(delay || 0)
      });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    advance(ms) {
      now += Number(ms || 0);
      let ran = true;
      while (ran) {
        ran = false;
        Array.from(timers.entries())
          .sort((a, b) => a[1].at - b[1].at)
          .forEach(([id, timer]) => {
            if (timer.at > now || !timers.has(id)) return;
            timers.delete(id);
            ran = true;
            timer.fn();
          });
      }
    }
  };
}

function loadRenderer(getTableInfoState, fakeTimers) {
  const rendererPath = path.resolve(__dirname, '../frontend/scripts/ui/table-renderer.js');
  const source = fs.readFileSync(rendererPath, 'utf8');
  const document = buildDocument();
  const sandbox = {
    console,
    window: null,
    document,
    setTimeout: fakeTimers.setTimeout,
    clearTimeout: fakeTimers.clearTimeout
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
  const fakeTimers = createFakeTimers();
  const state = {
    roundText: '东一',
    scores: {},
    seatWinds: {},
    coachState: {
      status: 'ready',
      source: 'auto-review',
      perspectiveSeat: 'bottom',
      summary: '初始建议',
      recommended: {
        type: 'discard',
        seat: 'bottom',
        tileCode: 'm5'
      },
      liveState: {
        status: 'ready',
        source: 'auto-review-background',
        perspectiveSeat: 'bottom',
        summary: '初始建议',
        recommended: {
          type: 'discard',
          seat: 'bottom',
          tileCode: 'm5'
        },
        contextSignature: 'live-a'
      },
      reviewState: {
        status: 'ready',
        source: 'auto-review',
        perspectiveSeat: 'bottom',
        summary: '初始复盘',
        recommended: {
          type: 'call',
          seat: 'bottom',
          callType: 'peng',
          meldString: 'm555='
        },
        reviewMode: true,
        contextSignature: 'review-a'
      }
    }
  };
  const { renderer, document } = loadRenderer(() => state, fakeTimers);

  renderer.renderCenterInfo();
  assert(document.getElementById('coach-card').classList.contains('is-active'), 'expected coach card active initially');
  assert(document.getElementById('review-card').classList.contains('is-active'), 'expected review card active initially');

  fakeTimers.advance(5001);
  assert(!document.getElementById('coach-card').classList.contains('is-active'), 'expected coach card to auto dismiss after 5s');
  assert(!document.getElementById('review-card').classList.contains('is-active'), 'expected review card to auto dismiss after 5s');

  state.coachState = {
    status: 'ready',
    source: 'auto-review',
    perspectiveSeat: 'bottom',
    summary: '新建议',
    recommended: {
      type: 'discard',
      seat: 'bottom',
      tileCode: 'p5'
    },
    liveState: {
      status: 'ready',
      source: 'auto-review-background',
      perspectiveSeat: 'bottom',
      summary: '新建议',
      recommended: {
        type: 'discard',
        seat: 'bottom',
        tileCode: 'p5'
      },
      contextSignature: 'live-b'
    },
    reviewState: {
      status: 'ready',
      source: 'auto-review',
      perspectiveSeat: 'bottom',
      summary: '新复盘',
      recommended: {
        type: 'pass',
        seat: 'bottom'
      },
      reviewMode: true,
      contextSignature: 'review-b'
    }
  };

  renderer.renderCenterInfo();
  assert(document.getElementById('coach-card').classList.contains('is-active'), 'expected new coach card to re-appear with new signature');
  assert(document.getElementById('review-card').classList.contains('is-active'), 'expected new review card to re-appear with new signature');
  assert(document.getElementById('coach-card-summary').textContent === '新建议', 'expected coach card to show latest content');
  assert(document.getElementById('review-card-summary').textContent === '新复盘', 'expected review card to show latest content');

  console.log('[PASS] table-renderer-auto-dismiss-smoke');
}

main();
