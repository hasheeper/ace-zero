(function (global) {
  'use strict';

  var INTERACTIVE_SELECTOR = [
    'button',
    '[role="button"]',
    'input',
    'select',
    'textarea',
    'a',
    '.btn-cmd',
    '.btn-mental',
    '.hero-card',
    '.seat'
  ].join(', ');

  function toArray(value) {
    if (value == null) return [];
    return Array.isArray(value) ? value : [value];
  }

  function uniqueElements(list) {
    var seen = [];
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (!(el instanceof Element)) continue;
      if (seen.indexOf(el) >= 0) continue;
      seen.push(el);
    }
    return seen;
  }

  function resolveElements(target) {
    var out = [];
    var items = toArray(target);
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (!item) continue;
      if (typeof item === 'string') {
        var nodes = document.querySelectorAll(item);
        for (var j = 0; j < nodes.length; j++) out.push(nodes[j]);
      } else if (item instanceof Element) {
        out.push(item);
      }
    }
    return uniqueElements(out);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function isVisible(el) {
    if (!(el instanceof Element)) return false;
    var rect = el.getBoundingClientRect();
    if (!rect.width && !rect.height) return false;
    var style = global.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  }

  function TutorialUI() {
    this.state = {
      highlights: [],
      muted: [],
      spotlightTarget: null,
      spotlightPadding: 12,
      dialogAnchor: null,
      dialogPlacement: 'center',
      allowedSelectors: null,
      allowedElements: [],
      lockAttached: false
    };

    this._raf = 0;
    this._build();
    this._bind();
  }

  TutorialUI.prototype._build = function () {
    var maskId = 'az-tutorial-mask-' + Math.random().toString(36).slice(2, 10);
    var root = document.createElement('div');
    root.className = 'az-tutorial-root';
    root.setAttribute('aria-hidden', 'true');
    root.innerHTML = [
      '<div class="az-tutorial-backdrop">',
      '  <svg class="az-tutorial-backdrop-svg" preserveAspectRatio="none" aria-hidden="true">',
      '    <defs>',
      '      <mask id="' + maskId + '" class="az-tutorial-backdrop-mask" maskUnits="userSpaceOnUse">',
      '        <rect class="az-tutorial-backdrop-mask-base" x="0" y="0" width="0" height="0" fill="white"></rect>',
      '        <g class="az-tutorial-backdrop-mask-holes"></g>',
      '      </mask>',
      '    </defs>',
      '    <rect class="az-tutorial-backdrop-fill" x="0" y="0" width="0" height="0" mask="url(#' + maskId + ')"></rect>',
      '  </svg>',
      '  <div class="az-tutorial-backdrop-pane" data-pane="top"></div>',
      '  <div class="az-tutorial-backdrop-pane" data-pane="right"></div>',
      '  <div class="az-tutorial-backdrop-pane" data-pane="bottom"></div>',
      '  <div class="az-tutorial-backdrop-pane" data-pane="left"></div>',
      '</div>',
      '<div class="az-tutorial-spotlight"></div>',
      '<div class="az-tutorial-focus-layer"></div>',
      '<div class="az-tutorial-message"></div>',
      '<button class="az-tutorial-quick-action" type="button" hidden>牌型说明</button>',
      '<div class="az-tutorial-dialog" hidden data-placement="center">',
      '  <div class="az-tutorial-dialog-head">',
      '    <div>',
      '      <span class="az-tutorial-dialog-kicker">GUIDED STEP</span>',
      '      <h3 class="az-tutorial-dialog-title"></h3>',
      '    </div>',
      '    <button class="az-tutorial-dialog-close" type="button" aria-label="关闭教程提示">×</button>',
      '  </div>',
      '  <p class="az-tutorial-dialog-body"></p>',
      '  <div class="az-tutorial-dialog-footer">',
      '    <button class="az-tutorial-dialog-btn az-tutorial-dialog-btn-secondary is-secondary" type="button" data-role="secondary" hidden></button>',
      '    <button class="az-tutorial-dialog-btn" type="button" data-role="primary">知道了</button>',
      '  </div>',
      '</div>',
      '<div class="az-tutorial-info-panel" hidden>',
      '  <div class="az-tutorial-info-panel-head">',
      '    <div>',
      '      <h3 class="az-tutorial-info-panel-title"></h3>',
      '      <div class="az-tutorial-info-panel-sub"></div>',
      '    </div>',
      '    <button class="az-tutorial-info-panel-close" type="button" aria-label="关闭说明面板">×</button>',
      '  </div>',
      '  <div class="az-tutorial-info-panel-body"></div>',
      '  <div class="az-tutorial-info-panel-actions">',
      '    <button class="az-tutorial-dialog-btn" type="button" data-info-close="1">返回教程</button>',
      '  </div>',
      '</div>'
    ].join('');
    document.body.appendChild(root);

    this.root = root;
    this.backdropEl = root.querySelector('.az-tutorial-backdrop');
    this.backdropSvgEl = root.querySelector('.az-tutorial-backdrop-svg');
    this.backdropMaskBaseEl = root.querySelector('.az-tutorial-backdrop-mask-base');
    this.backdropMaskHolesEl = root.querySelector('.az-tutorial-backdrop-mask-holes');
    this.backdropFillEl = root.querySelector('.az-tutorial-backdrop-fill');
    this.backdropPanes = {
      top: root.querySelector('[data-pane="top"]'),
      right: root.querySelector('[data-pane="right"]'),
      bottom: root.querySelector('[data-pane="bottom"]'),
      left: root.querySelector('[data-pane="left"]')
    };
    this.spotlightEl = root.querySelector('.az-tutorial-spotlight');
    this.focusLayerEl = root.querySelector('.az-tutorial-focus-layer');
    this.messageEl = root.querySelector('.az-tutorial-message');
    this.quickActionEl = root.querySelector('.az-tutorial-quick-action');
    this.dialogEl = root.querySelector('.az-tutorial-dialog');
    this.dialogTitleEl = root.querySelector('.az-tutorial-dialog-title');
    this.dialogBodyEl = root.querySelector('.az-tutorial-dialog-body');
    this.dialogCloseEl = root.querySelector('.az-tutorial-dialog-close');
    this.dialogBtnEl = root.querySelector('[data-role="primary"]');
    this.dialogSecondaryBtnEl = root.querySelector('[data-role="secondary"]');
    this.dialogFooterEl = root.querySelector('.az-tutorial-dialog-footer');
    this.infoPanelEl = root.querySelector('.az-tutorial-info-panel');
    this.infoPanelTitleEl = root.querySelector('.az-tutorial-info-panel-title');
    this.infoPanelSubEl = root.querySelector('.az-tutorial-info-panel-sub');
    this.infoPanelBodyEl = root.querySelector('.az-tutorial-info-panel-body');
    this.infoPanelCloseEls = root.querySelectorAll('.az-tutorial-info-panel-close, [data-info-close="1"]');
  };

  TutorialUI.prototype._bind = function () {
    var self = this;

    this.dialogCloseEl.addEventListener('click', function () {
      self.hideDialog();
    });

    this.quickActionEl.addEventListener('click', function () {
      if (typeof self._quickActionHandler === 'function') self._quickActionHandler();
    });

    this.dialogBtnEl.addEventListener('click', function () {
      var handler = self._dismissHandler;
      self.hideDialog();
      if (typeof handler === 'function') handler();
    });

    this.dialogSecondaryBtnEl.addEventListener('click', function () {
      if (typeof self._secondaryAction === 'function') self._secondaryAction();
    });

    Array.prototype.forEach.call(this.infoPanelCloseEls, function (el) {
      el.addEventListener('click', function () {
        self.hideInfoPanel();
      });
    });

    this._boundReposition = function () {
      self._scheduleReposition();
    };

    global.addEventListener('resize', this._boundReposition);
    global.addEventListener('scroll', this._boundReposition, true);
  };

  TutorialUI.prototype._scheduleReposition = function () {
    var self = this;
    if (this._raf) return;
    this._raf = global.requestAnimationFrame(function () {
      self._raf = 0;
      self._reposition();
    });
  };

  TutorialUI.prototype._reposition = function () {
    if (this.state.spotlightTarget) {
      this._placeSpotlight(this.state.spotlightTarget, this.state.spotlightPadding);
    }
    this._renderBackdropCutouts();
    this._renderHighlightRings();
    if (!this.dialogEl.hidden) {
      this._placeDialog(this.state.dialogAnchor, this.state.dialogPlacement);
    }
  };

  TutorialUI.prototype.showMessage = function (text) {
    if (!text) {
      this.messageEl.classList.remove('is-visible');
      this.messageEl.textContent = '';
      return;
    }
    this.messageEl.textContent = String(text);
    this.messageEl.classList.add('is-visible');
  };

  TutorialUI.prototype.showDialog = function (options) {
    var opts = options || {};
    this.state.dialogAnchor = resolveElements(opts.anchor)[0] || null;
    this.state.dialogPlacement = opts.placement || 'auto';
    this.state.dialogBackdrop = opts.backdrop !== false;
    this._dismissHandler = typeof opts.onDismiss === 'function' ? opts.onDismiss : null;

    this.dialogTitleEl.textContent = opts.title || '教学提示';
    this.dialogBodyEl.textContent = opts.body || '';
    this.dialogBtnEl.textContent = opts.dismissText || '知道了';
    this._secondaryAction = typeof opts.secondaryAction === 'function' ? opts.secondaryAction : null;
    if (this._secondaryAction) {
      this.dialogSecondaryBtnEl.hidden = false;
      this.dialogSecondaryBtnEl.textContent = opts.secondaryText || '更多说明';
    } else {
      this.dialogSecondaryBtnEl.hidden = true;
      this.dialogSecondaryBtnEl.textContent = '';
    }

    var dismissible = opts.dismissible !== false;
    var showClose = opts.showClose !== false && dismissible;
    this.dialogCloseEl.style.display = showClose ? '' : 'none';
    this.dialogBtnEl.hidden = !dismissible;
    this.dialogFooterEl.style.display = dismissible || this._secondaryAction ? '' : 'none';

    this.dialogEl.hidden = false;
    this.dialogEl.classList.add('is-visible');
    this._placeDialog(this.state.dialogAnchor, this.state.dialogPlacement);
    this._syncBackdrop();
  };

  TutorialUI.prototype.hideDialog = function () {
    this.dialogEl.classList.remove('is-visible');
    this.dialogEl.hidden = true;
    this.dialogEl.style.top = '50%';
    this.dialogEl.style.left = '50%';
    this.dialogEl.style.transform = 'translate(-50%, -50%)';
    this.dialogEl.dataset.placement = 'center';
    this.state.dialogAnchor = null;
    this.state.dialogPlacement = 'center';
    this.state.dialogBackdrop = false;
    this._dismissHandler = null;
    this._secondaryAction = null;
    this.dialogBtnEl.hidden = false;
    this.dialogSecondaryBtnEl.hidden = true;
    this.dialogSecondaryBtnEl.textContent = '';
    this._syncBackdrop();
  };

  TutorialUI.prototype.showInfoPanel = function (options) {
    var opts = options || {};
    this.infoPanelTitleEl.textContent = opts.title || '说明';
    this.infoPanelSubEl.textContent = opts.subtitle || '';
    this.infoPanelBodyEl.innerHTML = opts.html || '';
    this._infoPanelCloseHandler = typeof opts.onClose === 'function' ? opts.onClose : null;
    this.infoPanelEl.hidden = false;
    this.infoPanelEl.classList.add('is-visible');
    this._syncBackdrop();
  };

  TutorialUI.prototype.hideInfoPanel = function () {
    var handler = this._infoPanelCloseHandler;
    this._infoPanelCloseHandler = null;
    this.infoPanelEl.classList.remove('is-visible');
    this.infoPanelEl.hidden = true;
    this.infoPanelBodyEl.innerHTML = '';
    this._syncBackdrop();
    if (typeof handler === 'function') handler();
  };

  TutorialUI.prototype.setQuickAction = function (options) {
    var opts = options || {};
    if (!opts || opts.visible === false) {
      this.clearQuickAction();
      return;
    }
    this.quickActionEl.hidden = false;
    this.quickActionEl.textContent = opts.label || '帮助';
    this.quickActionEl.style.setProperty('right', global.innerWidth <= 640 ? '12px' : '18px', 'important');
    this.quickActionEl.style.setProperty('bottom', '56px', 'important');
    this.quickActionEl.style.setProperty('left', 'auto', 'important');
    this.quickActionEl.style.setProperty('top', 'auto', 'important');
    this._quickActionHandler = typeof opts.onClick === 'function' ? opts.onClick : null;
  };

  TutorialUI.prototype.clearQuickAction = function () {
    this.quickActionEl.hidden = true;
    this.quickActionEl.textContent = '';
    this.quickActionEl.style.removeProperty('top');
    this.quickActionEl.style.removeProperty('right');
    this.quickActionEl.style.removeProperty('bottom');
    this.quickActionEl.style.removeProperty('left');
    this._quickActionHandler = null;
  };

  TutorialUI.prototype._placeDialog = function (anchorEl, preferredPlacement) {
    var dialog = this.dialogEl;
    if (dialog.hidden) return;

    if (!anchorEl || !isVisible(anchorEl)) {
      dialog.dataset.placement = 'center';
      dialog.style.top = '50%';
      dialog.style.left = '50%';
      dialog.style.transform = 'translate(-50%, -50%)';
      return;
    }

    var rect = anchorEl.getBoundingClientRect();
    var margin = 18;
    var viewportPadding = 16;
    var dialogRect = dialog.getBoundingClientRect();
    var placements = preferredPlacement && preferredPlacement !== 'auto'
      ? [preferredPlacement]
      : ['bottom', 'top', 'right', 'left'];
    var choice = placements[0];

    for (var i = 0; i < placements.length; i++) {
      var p = placements[i];
      if (p === 'bottom' && rect.bottom + margin + dialogRect.height <= global.innerHeight - viewportPadding) {
        choice = p; break;
      }
      if (p === 'top' && rect.top - margin - dialogRect.height >= viewportPadding) {
        choice = p; break;
      }
      if (p === 'right' && rect.right + margin + dialogRect.width <= global.innerWidth - viewportPadding) {
        choice = p; break;
      }
      if (p === 'left' && rect.left - margin - dialogRect.width >= viewportPadding) {
        choice = p; break;
      }
    }

    var top = global.innerHeight / 2 - dialogRect.height / 2;
    var left = global.innerWidth / 2 - dialogRect.width / 2;

    if (choice === 'bottom') {
      top = rect.bottom + margin;
      left = rect.left + rect.width / 2 - dialogRect.width / 2;
      dialog.style.setProperty('--az-tutorial-arrow-x', clamp(rect.left + rect.width / 2 - left, 28, dialogRect.width - 28) + 'px');
    } else if (choice === 'top') {
      top = rect.top - dialogRect.height - margin;
      left = rect.left + rect.width / 2 - dialogRect.width / 2;
      dialog.style.setProperty('--az-tutorial-arrow-x', clamp(rect.left + rect.width / 2 - left, 28, dialogRect.width - 28) + 'px');
    } else if (choice === 'right') {
      top = rect.top + rect.height / 2 - dialogRect.height / 2;
      left = rect.right + margin;
      dialog.style.setProperty('--az-tutorial-arrow-y', clamp(rect.top + rect.height / 2 - top, 28, dialogRect.height - 28) + 'px');
    } else if (choice === 'left') {
      top = rect.top + rect.height / 2 - dialogRect.height / 2;
      left = rect.left - dialogRect.width - margin;
      dialog.style.setProperty('--az-tutorial-arrow-y', clamp(rect.top + rect.height / 2 - top, 28, dialogRect.height - 28) + 'px');
    }

    top = clamp(top, viewportPadding, global.innerHeight - dialogRect.height - viewportPadding);
    left = clamp(left, viewportPadding, global.innerWidth - dialogRect.width - viewportPadding);

    dialog.dataset.placement = choice;
    dialog.style.top = top + 'px';
    dialog.style.left = left + 'px';
    dialog.style.transform = 'translate(0, 0)';
  };

  TutorialUI.prototype.highlight = function (target, options) {
    var opts = options || {};
    if (!opts.append) this._clearHighlights();
    var elements = resolveElements(target);
    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      el.classList.add('az-tutorial-target', 'az-tutorial-highlight');
      if (this.state.highlights.indexOf(el) < 0) this.state.highlights.push(el);
    }
    this._renderHighlightRings();
    this._updateMuted();
  };

  TutorialUI.prototype.spotlight = function (target, options) {
    var opts = options || {};
    var el = resolveElements(target)[0] || null;
    if (!el || !isVisible(el)) {
      this.spotlightEl.classList.remove('is-visible');
      this.state.spotlightTarget = null;
      this._clearBackdropCutouts();
      this._syncBackdrop();
      this._updateMuted();
      return;
    }

    this.state.spotlightTarget = el;
    this.state.spotlightPadding = Number(opts.padding || 12);
    this.spotlightEl.classList.add('is-visible');
    this.highlight(el, { append: true });
    this._placeSpotlight(el, this.state.spotlightPadding);
    this._syncBackdrop();
    this._updateMuted();
  };

  TutorialUI.prototype._placeSpotlight = function (el, padding) {
    if (!el || !isVisible(el)) return;
    var rect = el.getBoundingClientRect();
    var top = Math.max(6, rect.top - padding);
    var left = Math.max(6, rect.left - padding);
    var width = Math.min(global.innerWidth - left - 6, rect.width + padding * 2);
    var height = Math.min(global.innerHeight - top - 6, rect.height + padding * 2);

    this.spotlightEl.style.top = top + 'px';
    this.spotlightEl.style.left = left + 'px';
    this.spotlightEl.style.width = width + 'px';
    this.spotlightEl.style.height = height + 'px';
    this.spotlightEl.style.borderRadius = (padding + 8) + 'px';
  };

  TutorialUI.prototype._getCutoutTargets = function () {
    var entries = [];
    var seen = [];
    var spotlight = this.state.spotlightTarget;
    if (spotlight && isVisible(spotlight)) {
      entries.push({
        element: spotlight,
        padding: Number(this.state.spotlightPadding || 12)
      });
      seen.push(spotlight);
    }

    for (var i = 0; i < this.state.highlights.length; i++) {
      var el = this.state.highlights[i];
      if (!isVisible(el)) continue;
      if (seen.indexOf(el) >= 0) continue;
      entries.push({
        element: el,
        padding: 10
      });
      seen.push(el);
    }

    return entries;
  };

  TutorialUI.prototype._renderBackdropCutouts = function () {
    if (!this.backdropSvgEl || !this.backdropMaskBaseEl || !this.backdropMaskHolesEl || !this.backdropFillEl) return;

    var vw = global.innerWidth;
    var vh = global.innerHeight;
    this.backdropSvgEl.setAttribute('viewBox', '0 0 ' + vw + ' ' + vh);
    this.backdropSvgEl.setAttribute('width', String(vw));
    this.backdropSvgEl.setAttribute('height', String(vh));
    this.backdropMaskBaseEl.setAttribute('width', String(vw));
    this.backdropMaskBaseEl.setAttribute('height', String(vh));
    this.backdropFillEl.setAttribute('width', String(vw));
    this.backdropFillEl.setAttribute('height', String(vh));

    this.backdropMaskHolesEl.innerHTML = '';

    var cutouts = this._getCutoutTargets();
    for (var i = 0; i < cutouts.length; i++) {
      var target = cutouts[i];
      var rect = target.element.getBoundingClientRect();
      var padding = Number(target.padding || 10);
      var top = Math.max(4, rect.top - padding);
      var left = Math.max(4, rect.left - padding);
      var width = Math.min(vw - left - 4, rect.width + padding * 2);
      var height = Math.min(vh - top - 4, rect.height + padding * 2);
      if (width <= 0 || height <= 0) continue;

      var hole = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      hole.setAttribute('x', String(left));
      hole.setAttribute('y', String(top));
      hole.setAttribute('width', String(width));
      hole.setAttribute('height', String(height));
      hole.setAttribute('rx', String(padding + 8));
      hole.setAttribute('ry', String(padding + 8));
      hole.setAttribute('fill', 'black');
      this.backdropMaskHolesEl.appendChild(hole);
    }
  };

  TutorialUI.prototype._placeBackdropPanes = function (top, left, width, height) {
    var vw = global.innerWidth;
    var vh = global.innerHeight;
    var right = left + width;
    var bottom = top + height;

    this.backdropPanes.top.style.top = '0px';
    this.backdropPanes.top.style.left = '0px';
    this.backdropPanes.top.style.width = vw + 'px';
    this.backdropPanes.top.style.height = Math.max(0, top) + 'px';

    this.backdropPanes.bottom.style.top = bottom + 'px';
    this.backdropPanes.bottom.style.left = '0px';
    this.backdropPanes.bottom.style.width = vw + 'px';
    this.backdropPanes.bottom.style.height = Math.max(0, vh - bottom) + 'px';

    this.backdropPanes.left.style.top = top + 'px';
    this.backdropPanes.left.style.left = '0px';
    this.backdropPanes.left.style.width = Math.max(0, left) + 'px';
    this.backdropPanes.left.style.height = Math.max(0, height) + 'px';

    this.backdropPanes.right.style.top = top + 'px';
    this.backdropPanes.right.style.left = right + 'px';
    this.backdropPanes.right.style.width = Math.max(0, vw - right) + 'px';
    this.backdropPanes.right.style.height = Math.max(0, height) + 'px';
  };

  TutorialUI.prototype.setAllowedActions = function (selectors) {
    var items = toArray(selectors).filter(Boolean);
    this.state.allowedSelectors = items.length ? items : null;
    this.state.allowedElements = items.length ? resolveElements(items) : [];

    if (!this.state.lockAttached) {
      this._attachLockHandlers();
      this.state.lockAttached = true;
    }

    this._updateMuted();
    this._syncBackdrop();
  };

  TutorialUI.prototype._syncBackdrop = function () {
    var shouldShow = !!this.state.spotlightTarget ||
      (!!this.state.allowedSelectors && this.state.allowedSelectors.length > 0) ||
      (!this.dialogEl.hidden && this.state.dialogBackdrop !== false) ||
      !this.infoPanelEl.hidden;

    this.backdropEl.classList.toggle('is-visible', shouldShow);
    if (!shouldShow) {
      this._clearBackdropCutouts();
      return;
    }
    this._renderBackdropCutouts();
  };

  TutorialUI.prototype._clearBackdropCutouts = function () {
    if (this.backdropMaskHolesEl) this.backdropMaskHolesEl.innerHTML = '';
    if (this.backdropSvgEl) {
      this.backdropSvgEl.setAttribute('width', '0');
      this.backdropSvgEl.setAttribute('height', '0');
    }
    if (this.backdropMaskBaseEl) {
      this.backdropMaskBaseEl.setAttribute('width', '0');
      this.backdropMaskBaseEl.setAttribute('height', '0');
    }
    if (this.backdropFillEl) {
      this.backdropFillEl.setAttribute('width', '0');
      this.backdropFillEl.setAttribute('height', '0');
    }
  };

  TutorialUI.prototype._attachLockHandlers = function () {
    var self = this;

    function allowEvent(target) {
      if (!self.state.allowedSelectors || !self.state.allowedSelectors.length) return true;
      if (!target) return false;
      if (self.root.contains(target)) return true;
      for (var i = 0; i < self.state.allowedElements.length; i++) {
        var el = self.state.allowedElements[i];
        if (el === target || el.contains(target)) return true;
      }
      return false;
    }

    this._lockHandler = function (event) {
      if (allowEvent(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    this._focusHandler = function (event) {
      if (allowEvent(event.target)) return;
      if (event.target && typeof event.target.blur === 'function') event.target.blur();
    };

    document.addEventListener('pointerdown', this._lockHandler, true);
    document.addEventListener('click', this._lockHandler, true);
    document.addEventListener('focusin', this._focusHandler, true);
  };

  TutorialUI.prototype._updateMuted = function () {
    for (var i = 0; i < this.state.muted.length; i++) {
      this.state.muted[i].classList.remove('az-tutorial-muted');
    }
    this.state.muted = [];

    var shouldMute = !!(this.state.allowedSelectors && this.state.allowedSelectors.length) || !!this.state.spotlightTarget;
    if (!shouldMute) return;

    var keep = uniqueElements(
      this.state.allowedElements
        .concat(this.state.highlights)
        .concat(this.state.spotlightTarget ? [this.state.spotlightTarget] : [])
    );

    var all = document.querySelectorAll(INTERACTIVE_SELECTOR);
    for (var j = 0; j < all.length; j++) {
      var node = all[j];
      if (this.root.contains(node)) continue;

      var keepNode = false;
      for (var k = 0; k < keep.length; k++) {
        var el = keep[k];
        if (el === node || el.contains(node) || node.contains(el)) {
          keepNode = true;
          break;
        }
      }
      if (keepNode) continue;

      node.classList.add('az-tutorial-muted');
      this.state.muted.push(node);
    }
  };

  TutorialUI.prototype._clearHighlights = function () {
    for (var i = 0; i < this.state.highlights.length; i++) {
      var el = this.state.highlights[i];
      el.classList.remove('az-tutorial-target', 'az-tutorial-highlight');
    }
    this.state.highlights = [];
    if (this.focusLayerEl) this.focusLayerEl.innerHTML = '';
  };

  TutorialUI.prototype._renderHighlightRings = function () {
    if (!this.focusLayerEl) return;

    var elements = this.state.highlights.filter(isVisible);
    var rings = this.focusLayerEl.children;

    while (rings.length > elements.length) {
      this.focusLayerEl.removeChild(this.focusLayerEl.lastChild);
    }

    for (var i = 0; i < elements.length; i++) {
      var ring = rings[i];
      if (!ring) {
        ring = document.createElement('div');
        ring.className = 'az-tutorial-focus-ring';
        this.focusLayerEl.appendChild(ring);
      }
      this._placeHighlightRing(ring, elements[i]);
    }
  };

  TutorialUI.prototype._placeHighlightRing = function (ring, el) {
    if (!ring || !el || !isVisible(el)) return;
    var rect = el.getBoundingClientRect();
    var padding = 10;
    var top = Math.max(4, rect.top - padding);
    var left = Math.max(4, rect.left - padding);
    var width = Math.min(global.innerWidth - left - 4, rect.width + padding * 2);
    var height = Math.min(global.innerHeight - top - 4, rect.height + padding * 2);

    ring.style.top = top + 'px';
    ring.style.left = left + 'px';
    ring.style.width = width + 'px';
    ring.style.height = height + 'px';
    ring.style.borderRadius = (padding + 8) + 'px';
  };

  TutorialUI.prototype.clear = function () {
    this.showMessage('');
    this.hideDialog();
    this.hideInfoPanel();
    this.backdropEl.classList.remove('is-visible');
    this.spotlightEl.classList.remove('is-visible');
    this.spotlightEl.style.width = '0';
    this.spotlightEl.style.height = '0';
    this._clearBackdropCutouts();
    this.state.spotlightTarget = null;
    this.state.spotlightPadding = 12;
    this.state.dialogBackdrop = false;
    this.state.allowedSelectors = null;
    this.state.allowedElements = [];
    this._clearHighlights();
    this._updateMuted();
    this.clearQuickAction();
  };

  global.TutorialUI = new TutorialUI();
  global.tutorialUI = global.TutorialUI;
})(window);
