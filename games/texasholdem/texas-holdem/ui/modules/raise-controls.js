(function(global) {
  'use strict';

  var DEFAULT_PRESET_SELECTOR = '[data-raise-preset]';

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function parseInteger(value, fallback) {
    var parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function getClosest(target, selector) {
    return target && typeof target.closest === 'function'
      ? target.closest(selector)
      : null;
  }

  function createRaiseControls(options) {
    options = options || {};
    var ui = options.ui || options.UI || {};
    var documentRef = options.document || global.document;
    var body = options.body || (documentRef && documentRef.body);
    var currency = options.currency || global.Currency || {};
    var presetSelector = options.presetSelector || DEFAULT_PRESET_SELECTOR;
    var gesturesBound = false;

    function htmlAmount(value) {
      if (currency && typeof currency.htmlAmount === 'function') {
        return currency.htmlAmount(value);
      }
      return String(value);
    }

    function getGameState() {
      if (typeof options.getGameState === 'function') {
        return options.getGameState() || {};
      }
      return options.gameState || {};
    }

    function getHeroPlayer() {
      return typeof options.getHeroPlayer === 'function'
        ? options.getHeroPlayer()
        : null;
    }

    function getBigBlind() {
      return typeof options.getBigBlind === 'function'
        ? options.getBigBlind()
        : 0;
    }

    function hide() {
      if (ui.raiseControls) ui.raiseControls.style.display = 'none';
      if (ui.raiseBackdrop) ui.raiseBackdrop.style.display = 'none';
      if (body) body.classList.remove('raise-open');
    }

    function show() {
      if (!ui.raiseControls) return;
      ui.raiseControls.style.display = 'block';
      if (ui.raiseBackdrop) ui.raiseBackdrop.style.display = 'block';
      if (body) body.classList.add('raise-open');
    }

    function isOpen() {
      return !!(
        ui.raiseControls &&
        ui.raiseControls.style.display !== 'none' &&
        ui.raiseControls.style.display !== ''
      );
    }

    function syncAmountDisplay(value) {
      if (!ui.raiseAmountDisplay) return;
      ui.raiseAmountDisplay.innerHTML = htmlAmount(parseInteger(value || 0, 0));
    }

    function setValue(value) {
      if (!ui.raiseSlider) return;
      var min = parseInteger(ui.raiseSlider.min || '0', 0);
      var max = parseInteger(ui.raiseSlider.max || '0', 0);
      var nextValue = clamp(parseInteger(value || min, min), min, max);
      ui.raiseSlider.value = nextValue;
      syncAmountDisplay(nextValue);
    }

    function nudge(direction) {
      if (!ui.raiseSlider) return;
      var min = parseInteger(ui.raiseSlider.min || '0', 0);
      var max = parseInteger(ui.raiseSlider.max || '0', 0);
      var step = parseInteger(ui.raiseSlider.step || '1', 1) || 1;
      var current = parseInteger(ui.raiseSlider.value || String(min), min);
      var range = Math.max(step, max - min);
      var onePercent = Math.max(step, Math.round(range * 0.01 / step) * step);
      setValue(current + onePercent * direction);
    }

    function applyPreset(preset) {
      var player = getHeroPlayer();
      if (!player || !ui.raiseSlider) return;
      var state = getGameState();
      var currentBet = Number(state.currentBet || 0);
      var pot = Number(state.pot || 0);
      var toCall = Math.max(0, currentBet - (player.currentBet || 0));
      var min = parseInteger(ui.raiseSlider.min || '0', 0);
      var max = parseInteger(ui.raiseSlider.max || '0', 0);
      var target = min;

      switch (preset) {
        case 'half':
          target = Math.max(min, Math.round(max * 0.5));
          break;
        case 'pot':
          target = Math.max(min, Math.min(max, Math.max(getBigBlind(), pot + toCall)));
          break;
        case 'max':
          target = max;
          break;
        case 'min':
        default:
          target = min;
          break;
      }

      setValue(target);
    }

    function bindGestures() {
      if (gesturesBound || !ui.raiseSlider || !ui.raiseSliderShell) return;
      gesturesBound = true;
      var isDragging = false;

      function sliderStep() {
        return parseInteger(ui.raiseSlider.step || '1', 1) || 1;
      }

      function updateByClientX(clientX) {
        var rect = ui.raiseSliderShell.getBoundingClientRect();
        var ratio = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
        var clampedRatio = Math.max(0, Math.min(1, ratio));
        var min = parseInteger(ui.raiseSlider.min || '0', 0);
        var max = parseInteger(ui.raiseSlider.max || '0', 0);
        var step = sliderStep();
        var raw = min + (max - min) * clampedRatio;
        var snapped = Math.round(raw / step) * step;
        setValue(snapped);
      }

      ui.raiseSliderShell.addEventListener('pointerdown', function(event) {
        if (
          event.target === ui.raiseSlider ||
          getClosest(event.target, presetSelector) ||
          getClosest(event.target, '.raise-adjust-btn') ||
          event.target === ui.btnConfirmRaise ||
          event.target === ui.btnCancelRaise
        ) return;
        isDragging = true;
        updateByClientX(event.clientX);
        if (ui.raiseSliderShell.setPointerCapture) ui.raiseSliderShell.setPointerCapture(event.pointerId);
        event.preventDefault();
      });

      ui.raiseSliderShell.addEventListener('pointermove', function(event) {
        if (!isDragging) return;
        updateByClientX(event.clientX);
      });

      function endDrag(event) {
        if (!isDragging) return;
        isDragging = false;
        if (event && ui.raiseSliderShell.releasePointerCapture) {
          try { ui.raiseSliderShell.releasePointerCapture(event.pointerId); } catch (error) {}
        }
      }

      ui.raiseSliderShell.addEventListener('pointerup', endDrag);
      ui.raiseSliderShell.addEventListener('pointercancel', endDrag);
      ui.raiseSliderShell.addEventListener('lostpointercapture', function() { isDragging = false; });
    }

    return Object.freeze({
      hide: hide,
      show: show,
      isOpen: isOpen,
      syncAmountDisplay: syncAmountDisplay,
      setValue: setValue,
      nudge: nudge,
      applyPreset: applyPreset,
      bindGestures: bindGestures
    });
  }

  global.AceTexasRaiseControls = Object.freeze({
    create: createRaiseControls
  });
})(window);
