/**
 * ===========================================
 * MINI-GAME-BASE.JS — 小游戏通用基础模块
 * ===========================================
 *
 * 提供所有小游戏共享的：
 *  - 配置加载 (game-config.json / postMessage)
 *  - Mana 管理
 *  - 下注选择器逻辑
 *  - HUD 更新辅助
 *  - 通用 UI 工具
 */
(function (global) {
  'use strict';

  // ============================================
  //  配置加载器
  // ============================================

  /**
   * 创建配置加载器
   * @param {Object} opts
   * @param {string} opts.gameKey   - 如 'blackjack', 'dice', 'dragon_tiger'
   * @param {Object} opts.defaults  - 默认配置 { [gameKey]: {...}, hero: {...} }
   * @param {Function} opts.onReady - 配置加载完成后回调 (config)
   * @returns {Object} loader { cfg(), gameCfg(), heroName(), applyExternal(cfg) }
   */
  function createConfigLoader(opts) {
    var _config = null;
    var _applied = false;
    var gameKey = opts.gameKey || 'blackjack';
    var defaults = opts.defaults || {};
    var onReady = opts.onReady || function () {};

    function cfg() { return _config || defaults; }

    function gameCfg() {
      var c = cfg();
      return (c && c[gameKey]) || defaults[gameKey] || {};
    }

    function heroName() {
      var h = cfg().hero;
      if (h && h.vanguard && h.vanguard.name) return h.vanguard.name;
      return 'PLAYER';
    }

    function heroCfg() {
      return cfg().hero || defaults.hero || {};
    }

    function applyExternal(nextConfig) {
      if (!nextConfig || _applied) return;
      _config = nextConfig;
      _applied = true;
      onReady(_config);
    }

    async function load() {
      if (_applied) return;
      if (window.parent && window.parent !== window) return;

      var paths = ['../../content/game-config.json', './game-config.json'];
      for (var i = 0; i < paths.length; i++) {
        try {
          var resp = await fetch(paths[i]);
          if (resp.ok) {
            _config = await resp.json();
            onReady(_config);
            return;
          }
        } catch (e) { /* next */ }
      }
      _config = defaults;
      onReady(_config);
    }

    function requestFromEngine() {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'acezero-data-request' }, '*');
      }
    }

    // 监听外部注入
    window.addEventListener('message', function (event) {
      var msg = event && event.data;
      if (!msg || msg.type !== 'acezero-game-data') return;
      applyExternal(msg.payload);
    });

    return {
      cfg: cfg,
      gameCfg: gameCfg,
      heroName: heroName,
      heroCfg: heroCfg,
      applyExternal: applyExternal,
      load: load,
      requestFromEngine: requestFromEngine
    };
  }

  // ============================================
  //  Mana 管理器
  // ============================================

  /**
   * 创建 Mana 管理器
   * @param {Object} opts
   * @param {number} opts.current
   * @param {number} opts.max
   * @param {HTMLElement} opts.barEl     - .mana-bar 元素
   * @param {HTMLElement} opts.textEl    - mana 文本元素
   * @param {HTMLElement} opts.boxEl     - .mana-box 容器
   * @param {HTMLElement} opts.skillBarEl - .controls-skills 容器
   * @returns {Object}
   */
  function createManaManager(opts) {
    var state = {
      current: opts.current || 0,
      max: opts.max || 0,
      enabled: opts.enabled !== false
    };

    var barEl = opts.barEl;
    var textEl = opts.textEl;
    var boxEl = opts.boxEl;
    var skillBarEl = opts.skillBarEl;

    function set(current, max) {
      if (current !== undefined) state.current = current;
      if (max !== undefined) state.max = max;
    }

    function spend(amount) {
      if (state.current < amount) return false;
      state.current -= amount;
      updateUI();
      return true;
    }

    function canSpend(amount) {
      return state.current >= amount;
    }

    function updateUI() {
      if (!state.enabled) {
        if (boxEl) boxEl.classList.add('hidden');
        if (skillBarEl) skillBarEl.classList.add('hidden');
        return;
      }
      if (boxEl) boxEl.classList.remove('hidden');
      if (skillBarEl) skillBarEl.classList.remove('hidden');

      if (textEl) textEl.textContent = state.current + '/' + state.max;
      if (barEl) {
        var pct = state.max > 0 ? (state.current / state.max * 100) : 0;
        barEl.style.width = pct + '%';
      }
    }

    return {
      state: state,
      set: set,
      spend: spend,
      canSpend: canSpend,
      updateUI: updateUI
    };
  }

  // ============================================
  //  下注选择器
  // ============================================

  /**
   * 创建下注选择器控制器
   * @param {Object} opts
   * @param {HTMLElement} opts.selectorEl  - #bet-selector 容器
   * @param {HTMLElement} opts.amountEl    - #bet-amount 显示
   * @param {HTMLElement} opts.currencyEl  - #bet-currency 显示
   * @param {HTMLElement} opts.minEl       - #bet-min 显示
   * @param {HTMLElement} opts.maxEl       - #bet-max 显示
   * @param {HTMLElement} opts.balanceEl   - #bet-balance 显示
   * @param {HTMLElement} opts.confirmBtn  - #btn-deal 按钮
   * @param {number} opts.min
   * @param {number} opts.max
   * @param {number} opts.defaultBet
   * @param {Function} opts.getBalance - () => number
   * @param {Function} opts.onConfirm - (betAmount) => void
   */
  function createBetSelector(opts) {
    var state = {
      pendingBet: opts.defaultBet || 50,
      min: opts.min || 10,
      max: opts.max || 500,
      defaultBet: opts.defaultBet || 50
    };

    var els = {
      selector: opts.selectorEl,
      amount: opts.amountEl,
      currency: opts.currencyEl,
      min: opts.minEl,
      max: opts.maxEl,
      balance: opts.balanceEl,
      confirm: opts.confirmBtn,
      slider: opts.selectorEl ? opts.selectorEl.querySelector('.bet-slider') : null,
      presetBtns: opts.selectorEl ? opts.selectorEl.querySelectorAll('.bet-preset-btn') : [],
      adjustBtns: opts.selectorEl ? opts.selectorEl.querySelectorAll('.bet-adjust-btn') : []
    };

    function formatFundsValue(amount) {
      var gold = (Math.round(Number(amount) || 0) / 100).toFixed(2);
      return gold.replace(/\.?0+$/, '');
    }

    function visibleMax() {
      var bal = opts.getBalance ? opts.getBalance() : Infinity;
      return Math.max(state.min, Math.min(state.max, bal));
    }

    function getSliderStep(maxVisible) {
      if (maxVisible <= 20) return 1;
      if (maxVisible <= 100) return 5;
      if (maxVisible <= 300) return 10;
      if (maxVisible <= 1000) return 25;
      return 50;
    }

    function clampBet() {
      var hi = visibleMax();
      state.pendingBet = Math.max(state.min, Math.min(hi, state.pendingBet));
    }

    function updateDisplay() {
      clampBet();
      var bal = opts.getBalance ? opts.getBalance() : 0;
      var hi = visibleMax();
      var sliderStep = getSliderStep(hi);
      if (els.amount) els.amount.textContent = formatFundsValue(state.pendingBet);
      if (els.currency) els.currency.textContent = '金弗';
      if (els.min) els.min.innerHTML = window.Currency ? Currency.htmlAmount(state.min) : formatFundsValue(state.min);
      if (els.max) els.max.innerHTML = window.Currency ? Currency.htmlAmount(hi) : formatFundsValue(hi);
      if (els.balance) els.balance.innerHTML = window.Currency ? Currency.html(bal) : String(bal);
      if (els.slider) {
        els.slider.min = String(state.min);
        els.slider.max = String(hi);
        els.slider.step = String(sliderStep);
        els.slider.value = String(state.pendingBet);
      }
      for (var i = 0; i < els.presetBtns.length; i++) {
        var presetBtn = els.presetBtns[i];
        var kind = presetBtn.getAttribute('data-bet-preset');
        var presetValue = getPresetValue(kind, hi);
        presetBtn.classList.toggle('active', presetValue === state.pendingBet);
      }
      for (var j = 0; j < els.adjustBtns.length; j++) {
        els.adjustBtns[j].setAttribute('data-step', String(sliderStep));
      }
    }

    function getPresetValue(kind, hi) {
      if (kind === 'min') return state.min;
      if (kind === 'base') return Math.max(state.min, Math.min(hi, state.defaultBet));
      if (kind === 'half') return Math.max(state.min, Math.min(hi, Math.floor(balancedHalf(hi))));
      if (kind === 'max') return hi;
      return state.pendingBet;
    }

    function balancedHalf(hi) {
      return hi / 2;
    }

    function adjust(delta) {
      state.pendingBet += delta;
      clampBet();
      updateDisplay();
    }

    function show() {
      state.pendingBet = Math.max(state.min, Math.min(state.defaultBet, visibleMax()));
      updateDisplay();
      if (els.selector) els.selector.classList.remove('hidden');
    }

    function hide() {
      if (els.selector) els.selector.classList.add('hidden');
    }

    function configure(min, max, defaultBet) {
      state.min = min;
      state.max = max;
      if (defaultBet !== undefined) {
        state.defaultBet = defaultBet;
        state.pendingBet = defaultBet;
      }
      updateDisplay();
    }

    if (els.slider) {
      els.slider.addEventListener('input', function () {
        state.pendingBet = parseInt(els.slider.value, 10) || state.min;
        updateDisplay();
      });
    }

    for (var i = 0; i < els.presetBtns.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          state.pendingBet = getPresetValue(btn.getAttribute('data-bet-preset'), visibleMax());
          updateDisplay();
        });
      })(els.presetBtns[i]);
    }

    for (var j = 0; j < els.adjustBtns.length; j++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          var direction = parseInt(btn.getAttribute('data-bet-adjust'), 10) || 0;
          var step = parseInt(btn.getAttribute('data-step'), 10) || getSliderStep(visibleMax());
          adjust(direction * step);
        });
      })(els.adjustBtns[j]);
    }

    // 绑定确认
    if (els.confirm) {
      els.confirm.addEventListener('click', function () {
        hide();
        if (opts.onConfirm) opts.onConfirm(state.pendingBet);
      });
    }

    return {
      state: state,
      show: show,
      hide: hide,
      adjust: adjust,
      configure: configure,
      updateDisplay: updateDisplay
    };
  }

  // ============================================
  //  通用 UI 工具
  // ============================================

  function updateMessage(el, text, cls) {
    if (!el) return;
    el.textContent = text || '';
    el.classList.remove('win', 'lose');
    if (cls) el.classList.add(cls);
  }

  function updateChipDisplay(amountEl, clustersEl, amount) {
    if (amountEl) {
      amountEl.innerHTML = window.Currency ? Currency.html(amount) : String(amount);
    }
    if (clustersEl && window.AceZeroChips && window.Currency) {
      window.AceZeroChips.renderPotClusters(clustersEl, amount, Currency);
    }
  }

  function wait(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  // ============================================
  //  开场预备页
  // ============================================

  /**
   * 创建小游戏开场预备页（带 ACEZERO Logo）
   * @param {Object} opts
   * @param {string} opts.id
   * @param {string} opts.subText
   * @param {string} opts.buttonText
   * @param {Function} opts.onStart
   */
  function createStartSplash(opts) {
    opts = opts || {};
    var overlayId = opts.id || 'mg-start-splash';
    var subText = opts.subText || '/// MINI-GAME TERMINAL';
    var buttonText = opts.buttonText || 'NEW ROUND';
    var onStart = opts.onStart || function () {};

    var overlay = document.getElementById(overlayId);
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = overlayId;
      overlay.className = 'mg-splash-overlay';
      overlay.innerHTML = [
        '<div class="mg-splash-inner">',
        '  <div class="mg-splash-logo" data-acezero-logo></div>',
        '  <div class="mg-splash-sub"></div>',
        '  <button type="button" class="btn-cmd primary mg-splash-btn"></button>',
        '</div>'
      ].join('\n');
      document.body.appendChild(overlay);
    }

    var subEl = overlay.querySelector('.mg-splash-sub');
    var btnEl = overlay.querySelector('.mg-splash-btn');
    if (subEl) subEl.textContent = subText;
    if (btnEl) btnEl.textContent = buttonText;

    if (global.AceZeroLogo && typeof global.AceZeroLogo.mountAll === 'function') {
      global.AceZeroLogo.mountAll(overlay);
    }

    function show() {
      overlay.classList.remove('hidden');
      overlay.classList.remove('is-hidden');
      overlay.style.display = 'flex';
    }

    function hide() {
      overlay.classList.add('is-hidden');
      setTimeout(function () {
        overlay.style.display = 'none';
      }, 460);
    }

    if (btnEl && btnEl.dataset.boundStart !== '1') {
      btnEl.dataset.boundStart = '1';
      btnEl.addEventListener('click', function () {
        hide();
        onStart();
      });
    }

    show();

    return {
      element: overlay,
      show: show,
      hide: hide
    };
  }

  // ============================================
  //  导出
  // ============================================

  global.MiniGameBase = {
    createConfigLoader: createConfigLoader,
    createManaManager: createManaManager,
    createBetSelector: createBetSelector,
    updateMessage: updateMessage,
    updateChipDisplay: updateChipDisplay,
    wait: wait,
    createStartSplash: createStartSplash
  };

})(typeof window !== 'undefined' ? window : global);
