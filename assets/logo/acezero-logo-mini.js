(function (global) {
  'use strict';

  function buildMiniLogoHTML() {
    return [
      '<span class="az-logo-mini-ring"></span>',
      '<span class="az-logo-mini-wheel"></span>',
      '<span class="az-logo-mini-text" aria-label="Ace of Zero">',
      '  <span class="az-logo-mini-letter"><span class="az-logo-mini-grad">A</span></span>',
      '  <span class="az-logo-mini-core" aria-hidden="true"></span>',
      '  <span class="az-logo-mini-letter az-logo-mini-letter--z"><span class="az-logo-mini-grad">Z</span></span>',
      '</span>'
    ].join('\n');
  }

  function mountOne(el) {
    if (!el || el.dataset.azLogoMiniMounted === '1') return;
    el.classList.add('az-logo-mini');
    el.innerHTML = buildMiniLogoHTML();
    el.dataset.azLogoMiniMounted = '1';
  }

  function mountAll(root) {
    const scope = root || document;
    const nodes = scope.querySelectorAll('[data-acezero-logo-mini]');
    for (let i = 0; i < nodes.length; i += 1) {
      mountOne(nodes[i]);
    }
  }

  global.AceZeroMiniLogo = {
    mount: mountOne,
    mountAll: mountAll
  };
})(typeof window !== 'undefined' ? window : this);
