'use strict';

const { buildCoachSuggestion } = require('../engine/coach/review/suggestion-format');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function main() {
  const suggestion = buildCoachSuggestion({
    ok: true,
    lines: [
      '{"type":"dahai","actor":0,"pai":"6z","tsumogiri":false}',
      '{"type":"dahai","actor":0,"pai":"9p","tsumogiri":false}'
    ],
    decoded: [
      {
        type: 'discard',
        runtimeAction: {
          type: 'discard',
          payload: {
            seat: 'bottom',
            tileCode: 'z6',
            riichi: false
          }
        },
        raw: { type: 'dahai', actor: 0, pai: '6z', tsumogiri: false }
      },
      {
        type: 'discard',
        runtimeAction: {
          type: 'discard',
          payload: {
            seat: 'bottom',
            tileCode: 'p9',
            riichi: false
          }
        },
        raw: { type: 'dahai', actor: 0, pai: '9p', tsumogiri: false }
      }
    ]
  }, {
    source: 'test',
    perspectiveSeatKey: 'bottom'
  });

  assert(suggestion && suggestion.recommended, `expected recommended suggestion, got ${JSON.stringify(suggestion)}`);
  assert(suggestion.recommended.tileCode === 'p9', `expected latest decoded action p9, got ${JSON.stringify(suggestion.recommended)}`);
  assert(suggestion.humanRecommended === '推荐动作：打出 九筒', `expected humanRecommended to explain p9, got ${JSON.stringify(suggestion.humanRecommended)}`);
  assert(Array.isArray(suggestion.reasons) && suggestion.reasons.length > 0, `expected explanation reasons, got ${JSON.stringify(suggestion)}`);

  const callSuggestion = buildCoachSuggestion({
    ok: true,
    lines: ['{"type":"pon","actor":0,"target":1,"pai":"7s","consumed":["7s","7s"]}'],
    decoded: [
      {
        type: 'call',
        runtimeAction: {
          type: 'call',
          payload: {
            seat: 'bottom',
            fromSeat: 'right',
            tileCode: 's7',
            callType: 'peng',
            meldString: 's777-'
          }
        },
        raw: { type: 'pon', actor: 0, target: 1, pai: '7s', consumed: ['7s', '7s'], meta: { shanten: 1 } }
      }
    ]
  }, {
    source: 'test',
    perspectiveSeatKey: 'bottom'
  });

  assert(callSuggestion.humanRecommended === '推荐动作：碰七索', `expected humanRecommended to explain peng, got ${JSON.stringify(callSuggestion.humanRecommended)}`);
  assert(Array.isArray(callSuggestion.reasons) && /副露建议/.test(callSuggestion.reasons[0] || ''), `expected call explanation reasons, got ${JSON.stringify(callSuggestion.reasons)}`);

  console.log('[PASS] suggestion-format-latest-decision-smoke');
  console.log(`  recommended=${JSON.stringify(suggestion.recommended)}`);
  console.log(`  human=${JSON.stringify({ discard: suggestion.humanRecommended, call: callSuggestion.humanRecommended })}`);
}

main();
