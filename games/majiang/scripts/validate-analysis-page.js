'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function createElement(id) {
  return {
    id,
    dataset: {},
    textContent: '',
    innerHTML: '',
    children: [],
    value: '',
    listeners: {},
    appendChild(node) {
      this.children.push(node);
      return node;
    },
    addEventListener(type, listener) {
      this.listeners[type] = listener;
    }
  };
}

function buildDocument() {
  const ids = [
    'player-select',
    'round-select',
    'coach-status-pill',
    'coach-meta-line',
    'coach-summary-block',
    'coach-recommend-block',
    'coach-reason-block',
    'analysis-status-pill',
    'selection-title',
    'selection-subtitle',
    'selection-abstract',
    'metric-mortal-rate',
    'metric-action-rate',
    'metric-riichi-rate',
    'metric-total',
    'conclusion-meta',
    'selection-conclusion',
    'focus-list',
    'bad-hand-list',
    'neutral-hand-list',
    'good-hand-list',
    'action-analysis-title',
    'action-analysis-meta',
    'action-list'
  ];
  const map = new Map(ids.map((id) => [id, createElement(id)]));
  return {
    getElementById(id) {
      return map.get(id) || null;
    },
    createElement(tagName) {
      return createElement(tagName);
    }
  };
}

function main() {
  const scriptPath = path.resolve(__dirname, '../frontend/scripts/analysis/analysis-page.js');
  const source = fs.readFileSync(scriptPath, 'utf8');
  const document = buildDocument();
  const storage = new Map();
  storage.set('acezero.majiang.coachState', JSON.stringify({
    status: 'ready',
    source: 'mortal',
    perspectiveSeat: 'bottom',
    summary: '建议切出 s3。',
    humanRecommended: '推荐动作：打出 三索',
    reasons: ['建议打出 三索。', 'Mortal 评估时的向听数是 2。'],
    reasonSummary: '建议打出 三索。',
    recommended: {
      type: 'discard',
      tileCode: 's3'
    }
  }));
  storage.set('acezero.majiang.coachAnalysisState', JSON.stringify({
    status: 'ready',
    source: 'benchmark',
    report: {
      overview: {
        label: '全部样本',
        mortalRate: 0.35,
        actionTypeRate: 0.82,
        riichiRate: 0.66,
        total: 12
      },
      rounds: [
        {
          summary: {
            id: 'east-1',
            label: '东一局',
            mortalRate: 0.35,
            actionTypeRate: 0.82,
            riichiRate: 0.66,
            total: 12,
            goodCount: 2,
            neutralCount: 7,
            badCount: 3,
            bucketCounts: {
              'tile-defense': 2,
              'tile-choice': 5
            }
          }
        }
      ],
      subjects: [
        {
          summary: {
            id: 'player:bottom',
            label: 'player(bottom)',
            mortalRate: 0.35,
            actionTypeRate: 0.82,
            riichiRate: 0.66,
            total: 12,
            goodCount: 2,
            neutralCount: 7,
            badCount: 3,
            bucketCounts: {
              'tile-defense': 2,
              'tile-choice': 5
            }
          },
          rows: [
            { label: '防守弃牌', round: { id: 'east-1', label: '东一局' }, judgment: { verdict: 'bad', bucket: 'tile-defense' }, comparison: { exactMatch: false, typeMatch: true, riichiMatch: true }, localDecision: { tileCode: 'z3' }, coachDecision: { tileCode: 'm2' } },
            { label: '手型取舍', round: { id: 'east-1', label: '东一局' }, judgment: { verdict: 'neutral', bucket: 'tile-choice' }, comparison: { exactMatch: false, typeMatch: true, riichiMatch: true }, localDecision: { tileCode: 's2' }, coachDecision: { tileCode: 's3' } },
            { label: '起手字牌处理', round: { id: 'east-1', label: '东一局' }, judgment: { verdict: 'good', bucket: 'exact-match' }, comparison: { exactMatch: true, typeMatch: true, riichiMatch: true }, localDecision: { tileCode: 'z1' }, coachDecision: { tileCode: 'z1' } }
          ]
        }
      ]
    }
  }));

  const sandbox = {
    console,
    window: null,
    document,
    localStorage: {
      getItem(key) {
        return storage.has(key) ? storage.get(key) : null;
      }
    },
    addEventListener() {}
  };
  sandbox.window = sandbox;
  vm.runInNewContext(source, sandbox, { filename: scriptPath });

  assert(document.getElementById('metric-mortal-rate').textContent === '33%', 'expected mortal rate text');
  assert(document.getElementById('player-select').innerHTML.includes('player(bottom)'), 'expected player option');
  assert(document.getElementById('round-select').innerHTML.includes('全部局'), 'expected round option');
  assert(/player\(bottom\)/.test(document.getElementById('selection-title').textContent), 'expected selection title');
  assert(document.getElementById('bad-hand-list').children.length === 1, 'expected bad hand card');
  assert(document.getElementById('action-list').children.length === 0, 'expected all-rounds action list to stay empty');
  assert(document.getElementById('coach-recommend-block').textContent.includes('推荐动作：打出 三索'), 'expected coach recommend text');
  assert(document.getElementById('coach-reason-block').innerHTML.includes('向听数'), 'expected coach reason block');

  document.getElementById('round-select').value = 'east-1';
  document.getElementById('round-select').listeners.change({ target: document.getElementById('round-select') });

  assert(document.getElementById('action-list').children.length === 3, 'expected single-round action list');
  assert(/东一局/.test(document.getElementById('action-analysis-title').textContent), 'expected action title to include round label');

  console.log('[PASS] analysis-page-smoke');
}

main();
