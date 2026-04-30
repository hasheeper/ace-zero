(function (global) {
  'use strict';

  /* ── Shared runtime logo markup ── */
  function buildLogoHTML() {
    return [
      /* 1. 扑克牌层 — cards use ::before in CSS for suit symbols */
      '<div class="az-logo-cards" aria-hidden="true">',
      '  <div class="az-logo-card"></div>',
      '  <div class="az-logo-card"></div>',
      '  <div class="az-logo-card"></div>',
      '</div>',

      /* 2. 背景圆盘 — roulette-container provides solid black bg */
      '<div class="az-logo-wheel" aria-hidden="true">',
      '  <div class="az-logo-roulette">',
      '    <div class="az-logo-layer az-logo-layer-outer">',
      '      <div class="az-logo-suit top">♠</div>',
      '      <div class="az-logo-suit right">♥</div>',
      '      <div class="az-logo-suit bottom">♣</div>',
      '      <div class="az-logo-suit left">♦</div>',
      '    </div>',
      '    <div class="az-logo-layer az-logo-layer-ticks">',
      '      <div class="az-logo-ticks-short"></div>',
      '      <div class="az-logo-ticks-long"></div>',
      '    </div>',
      '    <div class="az-logo-layer az-logo-layer-inner">',
      '      <div class="az-logo-spoke" style="transform:rotate(0deg)"></div>',
      '      <div class="az-logo-spoke" style="transform:rotate(30deg)"></div>',
      '      <div class="az-logo-spoke" style="transform:rotate(60deg)"></div>',
      '      <div class="az-logo-spoke" style="transform:rotate(90deg)"></div>',
      '      <div class="az-logo-spoke" style="transform:rotate(120deg)"></div>',
      '      <div class="az-logo-spoke" style="transform:rotate(150deg)"></div>',
      '    </div>',
      '    <div class="az-logo-layer az-logo-layer-core">',
      '      <div class="az-logo-core-diamond"></div>',
      '    </div>',
      '  </div>',
      '</div>',

      /* 3. 主标题 — div.letter > span.grad pattern */
      '<div class="az-logo-text" aria-label="ACEZERO">',
      '  <div class="az-logo-letter" data-char="A"><span class="az-logo-grad">A</span></div>',
      '  <div class="az-logo-letter" data-char="C"><span class="az-logo-grad">C</span></div>',
      '  <div class="az-logo-letter" data-char="E"><span class="az-logo-grad">E</span></div>',
      '  <div class="az-logo-letter az-logo-letter-z" data-char="Z"><span class="az-logo-grad">Z</span></div>',
      '  <div class="az-logo-letter" data-char="E"><span class="az-logo-grad">E</span></div>',
      '  <div class="az-logo-letter" data-char="R"><span class="az-logo-grad">R</span></div>',
      '  <div class="az-logo-letter" data-char="O">',
      '    <span class="az-logo-grad">O</span>',
      '    <span class="az-logo-grad az-logo-inner-star" style="left:50%;top:50%;">✦</span>',
      '  </div>',
      '</div>',

      /* 4. 中文副标题 — div > span.grad-static pattern */
      '<div class="az-logo-cn" aria-label="零之王牌">',
      '  <div class="az-logo-cn-star"><span class="az-logo-grad-static">✦</span></div>',
      '  <div class="az-logo-cn-char" data-char="零"><span class="az-logo-grad-static">零</span></div>',
      '  <div class="az-logo-cn-char" data-char="之"><span class="az-logo-grad-static">之</span></div>',
      '  <div class="az-logo-cn-char" data-char="王"><span class="az-logo-grad-static">王</span></div>',
      '  <div class="az-logo-cn-char" data-char="牌"><span class="az-logo-grad-static">牌</span></div>',
      '  <div class="az-logo-cn-star"><span class="az-logo-grad-static">✦</span></div>',
      '</div>'
    ].join('\n');
  }

  function mountOne(el) {
    if (!el || el.dataset.azLogoMounted === '1') return;
    el.classList.add('az-logo');
    el.innerHTML = buildLogoHTML();
    el.dataset.azLogoMounted = '1';
  }

  function mountAll(root) {
    var scope = root || document;
    var nodes = scope.querySelectorAll('[data-acezero-logo]');
    for (var i = 0; i < nodes.length; i++) {
      mountOne(nodes[i]);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      mountAll(document);
    });
  } else {
    mountAll(document);
  }

  global.AceZeroLogo = {
    mount: mountOne,
    mountAll: mountAll
  };
})(typeof window !== 'undefined' ? window : this);
