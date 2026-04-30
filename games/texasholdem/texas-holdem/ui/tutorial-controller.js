(function (global) {
  'use strict';

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderBasicsPanel(content) {
    if (!content || !Array.isArray(content.sections)) return '';

    return content.sections.map(function (section) {
      if (!section) return '';

      if (section.kind === 'paragraph') {
        return [
          '<section class="az-tutorial-info-block">',
          '  <h4>' + escapeHtml(section.title) + '</h4>',
          '  <p>' + escapeHtml(section.body) + '</p>',
          '</section>'
        ].join('');
      }

      if (section.kind === 'rankList') {
        var rows = (section.items || []).map(function (item) {
          return [
            '<div class="az-tutorial-rank-row">',
            '  <span class="az-tutorial-rank-order">' + escapeHtml(item.order) + '</span>',
            '  <div class="az-tutorial-rank-copy">',
            '    <div class="az-tutorial-rank-name">' + escapeHtml(item.name) + '</div>',
            '    <div class="az-tutorial-rank-note">' + escapeHtml(item.note) + '</div>',
            '  </div>',
            '</div>'
          ].join('');
        }).join('');

        return [
          '<section class="az-tutorial-info-block">',
          '  <h4>' + escapeHtml(section.title) + '</h4>',
          '  <div class="az-tutorial-rank-list">' + rows + '</div>',
          '</section>'
        ].join('');
      }

      if (section.kind === 'imageCompass') {
        var compassImageHtml = section.src
          ? '<img class="az-tutorial-guide-image" src="' + escapeHtml(section.src) + '" alt="' + escapeHtml(section.alt || section.title || 'guide') + '">'
          : '<div class="az-tutorial-guide-image-placeholder">' + escapeHtml(section.placeholder || '把说明图放到这里') + '</div>';
        function renderCompassCard(item, cls) {
          if (!item) return '';
          return [
            '<div class="az-tutorial-compass-card ' + cls + '">',
            '  <div class="az-tutorial-compass-label">' + escapeHtml(item.label || '') + '</div>',
            '  <div class="az-tutorial-compass-copy">' + escapeHtml(item.copy || '') + '</div>',
            '</div>'
          ].join('');
        }

        return [
          '<section class="az-tutorial-info-block">',
          section.title ? ('  <h4>' + escapeHtml(section.title) + '</h4>') : '',
          '  <div class="az-tutorial-compass-layout">',
          renderCompassCard(section.top, 'az-tutorial-compass-top'),
          renderCompassCard(section.left, 'az-tutorial-compass-left'),
          '    <div class="az-tutorial-compass-center az-tutorial-guide-image-wrap">',
          '      ' + compassImageHtml,
          '    </div>',
          renderCompassCard(section.right, 'az-tutorial-compass-right'),
          renderCompassCard(section.bottom, 'az-tutorial-compass-bottom'),
          '  </div>',
          '</section>'
        ].join('');
      }

      var keypoints = (section.items || []).map(function (item) {
        return [
          '<div class="az-tutorial-keypoint">',
          '  <span class="az-tutorial-keypoint-label">' + escapeHtml(item.label) + '</span>',
          '  <span class="az-tutorial-keypoint-copy">' + escapeHtml(item.copy) + '</span>',
          '</div>'
        ].join('');
      }).join('');

      return [
        '<section class="az-tutorial-info-block">',
        '  <h4>' + escapeHtml(section.title) + '</h4>',
        '  <div class="az-tutorial-keypoints">' + keypoints + '</div>',
        '</section>'
      ].join('');
    }).join('');
  }

  function renderGlossaryPanel(glossary, fallbackSections) {
    var sections = [];
    if (glossary && glossary.coreRule) {
      sections.push({
        kind: 'paragraph',
        title: '核心规则',
        body: glossary.coreRule
      });
    }

    if (glossary && Array.isArray(glossary.terms) && glossary.terms.length) {
      sections.push({
        kind: 'keypoints',
        title: '基础名词',
        items: glossary.terms.map(function (term) {
          return {
            label: term.label || term.id || 'term',
            copy: term.summary || ''
          };
        })
      });
    }

    if (glossary && Array.isArray(glossary.triangle) && glossary.triangle.length) {
      sections.push({
        kind: 'keypoints',
        title: '克制关系',
        items: glossary.triangle.map(function (entry) {
          return {
            label: '关系',
            copy: entry
          };
        })
      });
    }

    if (glossary && glossary.priorityNote) {
      sections.push({
        kind: 'paragraph',
        title: '优先提醒',
        body: glossary.priorityNote
      });
    }

    if (!sections.length && Array.isArray(fallbackSections)) {
      sections = fallbackSections;
    }

    return renderBasicsPanel({ sections: sections });
  }

  global.AceTutorialController = function AceTutorialController(deps) {
    var contentRoot = global.AceTutorialContent || {};
    var noviceContent = contentRoot.novice || {};
    var expertContent = contentRoot.expert || {};
    var basicsPanel = contentRoot.noviceBasicsPanel || {};

    function TutorialController() {
      this.active = false;
      this.signature = '';
      this.profile = 'novice';
      this.course = '';
      this.lesson = '';
      this.handIndex = 0;
      this.handCount = 0;
      this.currentHandId = '';
      this.stepFlow = 'idle';
      this.hasShownStart = false;
      this.hasPromptedMagicKey = false;
      this.hasShownMagicCard = false;
      this.hasShownExpertIntro = false;
      this.hasShownExpertForcePanel = false;
      this.hasUsedExpertSkill = false;
      this.hasPromptedExpertPreflop = false;
      this.hasShownExpertProtectPrompt = false;
      this.hasShownExpertPeekPrompt = false;
      this.pendingExpertPeekDismiss = false;
      this.hasPromptedMentalToggle = false;
      this.hasShownMentalSkillPrompt = false;
      this.hasShownMentalResult = false;
      this.isExpertSkillPhaseActive = false;
      this.expertResolvedCardCode = '';
      this.expertForceMeta = null;
      this.pendingExpertFlopSummary = false;
      this.expertFreePlay = false;
      this.promptedControls = {};
      this.promptedStreets = {};
      this.pendingControlPrompt = null;
      this._bindStatic();
    }

    TutorialController.prototype._isCurrentExpertHand = function (id) {
      return this.profile === 'expert' && this.currentHandId === id;
    };

    TutorialController.prototype._shouldGuideExpertPreflop = function () {
      return this._isCurrentExpertHand('fortune-intro') ||
        this._isCurrentExpertHand('curse-pressure') ||
        this._isCurrentExpertHand('psyche-convert') ||
        this._isCurrentExpertHand('mental-basics') ||
        this._isCurrentExpertHand('kazu-rino-contrast');
    };

    TutorialController.prototype._contentForCurrentHand = function () {
      if (this.profile === 'expert') {
        return (expertContent.hands || {})[this.currentHandId] || null;
      }
      return (noviceContent.hands || {})[this.currentHandId] || null;
    };

    TutorialController.prototype._resetHandRuntime = function () {
      this.stepFlow = 'idle';
      this.promptedControls = {};
      this.promptedStreets = {};
      this.hasPromptedMagicKey = false;
      this.hasShownMagicCard = false;
      this.hasShownExpertIntro = false;
      this.hasShownExpertForcePanel = false;
      this.hasUsedExpertSkill = false;
      this.hasPromptedExpertPreflop = false;
      this.hasShownExpertProtectPrompt = false;
      this.hasShownExpertPeekPrompt = false;
      this.pendingExpertPeekDismiss = false;
      this.hasPromptedMentalToggle = false;
      this.hasShownMentalSkillPrompt = false;
      this.hasShownMentalResult = false;
      this.isExpertSkillPhaseActive = false;
      this.expertResolvedCardCode = '';
      this.expertForceMeta = null;
      this.pendingExpertFlopSummary = false;
      this.expertFreePlay = false;
      this.pendingControlPrompt = null;
    };

    TutorialController.prototype._getCurrentHandMeta = function () {
      return deps.getCurrentTutorialHand() || null;
    };

    TutorialController.prototype._isCurrentNoviceHand = function (id) {
      return this.profile === 'novice' && this.currentHandId === id;
    };

    TutorialController.prototype._installQuickHelp = function () {
      if (!this.active || !deps.tutorialUI) return;
      if (this.profile === 'expert') {
        deps.tutorialUI.setQuickAction({
          label: this._getExpertInfoLabel(),
          onClick: this._showExpertGlossaryPanel.bind(this)
        });
        return;
      }
      deps.tutorialUI.setQuickAction({
        label: '牌型说明',
        onClick: this._showNoviceBasicsPanel.bind(this)
      });
    };

    TutorialController.prototype._isMentalInfoContext = function () {
      return this.profile === 'expert' &&
        (this.course === 'mental-special' || this._isCurrentExpertHand('mental-basics'));
    };

    TutorialController.prototype._isMagicInfoContext = function () {
      return this.profile === 'expert' &&
        (this.course === 'magic-basics' ||
          this._isCurrentExpertHand('fortune-intro') ||
          this._isCurrentExpertHand('curse-pressure') ||
          this._isCurrentExpertHand('psyche-convert'));
    };

    TutorialController.prototype._isRoleInfoContext = function () {
      return this.profile === 'expert' && this._isCurrentExpertHand('kazu-rino-contrast');
    };

    TutorialController.prototype._isLiveMatchContext = function () {
      return this.profile === 'expert' && this._isCurrentExpertHand('special-live-match');
    };

    TutorialController.prototype._getExpertInfoLabel = function () {
      if (this._isLiveMatchContext()) return '实战说明';
      if (this._isRoleInfoContext()) return '搭配说明';
      if (this._isMagicInfoContext()) return '机制说明';
      return this._isMentalInfoContext() ? '机制说明' : '名词说明';
    };

    TutorialController.prototype._hasEnabledActionButtons = function () {
      var refs = deps.refs || {};
      return !!(
        (refs.btnCheckCall && !refs.btnCheckCall.disabled && deps.isVisibleTutorialTarget(refs.btnCheckCall)) ||
        (refs.btnRaise && !refs.btnRaise.disabled && deps.isVisibleTutorialTarget(refs.btnRaise)) ||
        (refs.btnFold && !refs.btnFold.disabled && deps.isVisibleTutorialTarget(refs.btnFold))
      );
    };

    TutorialController.prototype._rememberPendingControlPrompt = function () {
      this.pendingControlPrompt = this.currentHandId + ':' + deps.getGameState().phase;
    };

    TutorialController.prototype._flushPendingControlPrompt = function () {
      if (this.profile === 'expert') {
        if (this.pendingControlPrompt !== 'expert:fortune-call') return;
        if (!this._hasEnabledActionButtons()) return;
        this.pendingControlPrompt = null;
        this._showExpertCallStep();
        return;
      }
      var expectedKey = this.currentHandId + ':' + deps.getGameState().phase;
      if (this.pendingControlPrompt !== expectedKey) return;
      if (!this._hasEnabledActionButtons()) return;
      this.pendingControlPrompt = null;
      this._handleNovicePlayerControls();
    };

    TutorialController.prototype._bindStatic = function () {
      var self = this;
      var refs = deps.refs || {};

      function onStart() {
        if (!self.active) return;
        deps.tutorialUI.clear();
        deps.tutorialUI.showMessage(self.profile === 'expert'
          ? '发牌完成后，我会直接带你进入魔运第一课。'
          : '发牌完成后，我会按顺序带你完成这一局教程。');
      }

      if (refs.splashDeal) refs.splashDeal.addEventListener('click', onStart);
      if (refs.btnDeal) refs.btnDeal.addEventListener('click', onStart);

      if (refs.btnCheckCall) {
        refs.btnCheckCall.addEventListener('click', function () {
          self.onPlayerAction('check-call');
        });
      }
      if (refs.btnRaise) {
        refs.btnRaise.addEventListener('click', function () {
          self.onPlayerAction('raise');
        });
      }
      if (refs.btnConfirmRaise) {
        refs.btnConfirmRaise.addEventListener('click', function () {
          self.onPlayerAction('raise-confirm');
        });
      }
      if (refs.btnFold) {
        refs.btnFold.addEventListener('click', function () {
          self.onPlayerAction('fold');
        });
      }
      if (refs.magicKey) {
        refs.magicKey.addEventListener('click', function () {
          self.onMagicKeyClick();
        });
      }
    };

    TutorialController.prototype.loadFromConfig = function (config) {
      var tutorial = config && config.tutorial;
      if (!tutorial || tutorial.enabled !== true || !deps.tutorialUI) {
        this.active = false;
        this.signature = '';
        deps.tutorialUI.clear();
        return;
      }

      var signature = [
        tutorial.profile || '',
        tutorial.course || '',
        tutorial.lesson || '',
        tutorial.step || 1,
        tutorial.currentHandIndex || 0
      ].join('|');

      if (signature === this.signature) return;

      this.active = true;
      this.signature = signature;
      this.profile = tutorial.profile === 'expert' ? 'expert' : 'novice';
      this.course = tutorial.course || '';
      this.lesson = tutorial.lesson || '';
      this.handIndex = deps.getCurrentTutorialHandIndex();
      this.handCount = deps.getTutorialHands().length;
      this.currentHandId = (deps.getCurrentTutorialHand() && deps.getCurrentTutorialHand().id) || '';
      this.hasShownStart = false;
      this._resetHandRuntime();

      deps.tutorialUI.clear();
      this.showStartPrompt();
    };

    TutorialController.prototype.showStartPrompt = function () {
      if (!this.active || this.hasShownStart) return;
      var refs = deps.refs || {};
      var target = deps.isVisibleTutorialTarget(refs.splashDeal) ? refs.splashDeal : refs.btnDeal;
      var profileContent = this.profile === 'expert' ? expertContent : noviceContent;
      var courseStart = profileContent && profileContent.courseStart && profileContent.courseStart[this.course]
        ? profileContent.courseStart[this.course]
        : null;
      var startMessage = (courseStart && courseStart.message) || profileContent.startMessage || '';
      var startBody = (courseStart && courseStart.body) || profileContent.startBody || '';
      if (!deps.isVisibleTutorialTarget(target)) return;

      this.hasShownStart = true;
      deps.tutorialUI.clear();
      deps.tutorialUI.showMessage(startMessage);
      deps.tutorialUI.showDialog({
        title: '开始教程',
        body: startBody,
        anchor: target,
        placement: 'top',
        dismissible: false
      });
      deps.tutorialUI.spotlight(target, { padding: 12 });
      deps.tutorialUI.setAllowedActions(target);
    };

    TutorialController.prototype.onGameStarted = function () {
      if (!this.active) return;
      this.handIndex = deps.getCurrentTutorialHandIndex();
      this.handCount = deps.getTutorialHands().length;
      this.currentHandId = (deps.getCurrentTutorialHand() && deps.getCurrentTutorialHand().id) || '';
      this._resetHandRuntime();
      deps.tutorialUI.clear();
      this._installQuickHelp();

      var hand = this._getCurrentHandMeta();
      deps.tutorialUI.showMessage(this.profile === 'expert'
        ? expertContent.gameStartMessage
        : ('当前是第 ' + (this.handIndex + 1) + ' / ' + Math.max(1, this.handCount) + ' 局' +
          (hand && hand.title ? '：' + hand.title : '')));
    };

    TutorialController.prototype.onPlayerControls = function (enabled) {
      if (!this.active || !enabled) return;

      if (this.profile === 'expert') {
        if (this.expertFreePlay) return;
        this._installQuickHelp();
        if (this._shouldGuideExpertPreflop() &&
            deps.getGameState().phase === 'preflop' &&
            !this.hasPromptedExpertPreflop) {
          this._showExpertPreflopStep();
          return;
        }
        if (this._isCurrentExpertHand('mental-basics') &&
            deps.getGameState().phase === 'flop' &&
            !this.hasShownExpertIntro) {
          this._showExpertIntroPanel();
          return;
        }
        if (this._isCurrentExpertHand('kazu-rino-contrast') &&
            deps.getGameState().phase === 'flop' &&
            !this.hasShownExpertIntro) {
          this._showExpertIntroPanel();
          return;
        }
        if (this._isCurrentExpertHand('special-live-match') &&
            deps.getGameState().phase === 'preflop' &&
            !this.hasShownExpertIntro) {
          this._showExpertIntroPanel();
          return;
        }
        if (this.pendingControlPrompt === 'expert:fortune-call' || this.stepFlow === 'expert-fortune-force-ready') {
          this._flushPendingControlPrompt();
        }
        return;
      }

      this._installQuickHelp();
      this._handleNovicePlayerControls();
    };

    TutorialController.prototype._showNoviceBasicsPanel = function () {
      deps.tutorialUI.showInfoPanel({
        title: basicsPanel.title || '说明',
        subtitle: basicsPanel.subtitle || '',
        html: renderBasicsPanel(basicsPanel)
      });
    };

    TutorialController.prototype._showExpertGlossaryPanel = function () {
      var handContent = this._contentForCurrentHand() || {};
      var panel = this._isLiveMatchContext()
        ? (expertContent.liveMatchPanel || expertContent.roleContrastPanel || expertContent.mentalGlossaryPanel || expertContent.glossaryPanel || { sections: [] })
        : this._isRoleInfoContext()
        ? (expertContent.roleContrastPanel || expertContent.mentalGlossaryPanel || expertContent.glossaryPanel || { sections: [] })
        : this._isCurrentExpertHand('fortune-intro')
          ? (handContent.forceGuidePanel || expertContent.magicBasicsPanel || { sections: [] })
        : this._isCurrentExpertHand('curse-pressure')
          ? (expertContent.curseBasicsPanel || expertContent.magicBasicsPanel || { sections: [] })
        : this._isCurrentExpertHand('psyche-convert')
          ? (expertContent.psycheBasicsPanel || expertContent.glossaryPanel || { sections: [] })
        : this._isMentalInfoContext()
          ? (expertContent.mentalGlossaryPanel || expertContent.glossaryPanel || { sections: [] })
          : (expertContent.glossaryPanel || { sections: [] });
      deps.tutorialUI.showInfoPanel({
        title: panel.title || '术语说明',
        subtitle: panel.subtitle || '',
        html: renderBasicsPanel(panel)
      });
    };

    TutorialController.prototype._showExpertIntroPanel = function () {
      var self = this;
      var panel = this._isCurrentExpertHand('special-live-match')
        ? (expertContent.liveMatchPanel || expertContent.roleContrastPanel || expertContent.mentalGlossaryPanel || {})
        : this._isCurrentExpertHand('kazu-rino-contrast')
        ? (expertContent.roleContrastPanel || expertContent.mentalGlossaryPanel || {})
        : this._isCurrentExpertHand('curse-pressure')
        ? (expertContent.curseBasicsPanel || expertContent.magicBasicsPanel || {})
        : this._isCurrentExpertHand('psyche-convert')
          ? (expertContent.psycheBasicsPanel || expertContent.magicBasicsPanel || {})
          : this._isCurrentExpertHand('mental-basics')
            ? (expertContent.mentalBasicsPanel || expertContent.magicBasicsPanel || {})
          : (expertContent.magicBasicsPanel || {});
      var handContent = this._contentForCurrentHand() || {};
      this.hasShownExpertIntro = true;
      this.stepFlow = 'expert-fortune-intro-panel';
      deps.tutorialUI.clear();
      this._installQuickHelp();
      deps.tutorialUI.showMessage(handContent.introMessage || '先建立一个最小认知：魔运能改局势，但胜负仍然要回到牌型本身。');
      deps.tutorialUI.showInfoPanel({
        title: handContent.introPanelTitle || panel.title || '魔运基础',
        subtitle: panel.subtitle || '',
        html: renderBasicsPanel(panel),
        onClose: function () {
          if (self._isCurrentExpertHand('special-live-match') || self._isCurrentExpertHand('kazu-rino-contrast')) {
            self._releaseExpertFreePlay();
          } else if (self._isCurrentExpertHand('mental-basics')) {
            self._showExpertMentalToggleStep();
          } else {
            self._showExpertMagicIntro();
          }
        }
      });
      deps.tutorialUI.setAllowedActions('[data-tutorial-root-only]');
    };

    TutorialController.prototype._showExpertMentalToggleStep = function () {
      if (this.hasPromptedMentalToggle) return;
      this.hasPromptedMentalToggle = true;
      this.stepFlow = 'expert-mental-open';
      var handContent = this._contentForCurrentHand() || {};

      deps.tutorialUI.clear();
      deps.tutorialUI.showMessage('先打开 MENTAL 面板，看看这手能怎么影响对手的心态。');
      deps.tutorialUI.showDialog({
        title: handContent.openMentalTitle || '打开 MENTAL',
        body: handContent.openMentalBody || '',
        anchor: deps.refs.btnMentalToggle,
        placement: 'left',
        dismissible: false,
        secondaryText: this._getExpertInfoLabel(),
        secondaryAction: this._showExpertGlossaryPanel.bind(this)
      });
      deps.tutorialUI.spotlight(deps.refs.btnMentalToggle, { padding: 10 });
      deps.tutorialUI.highlight(deps.refs.btnMentalToggle);
      deps.tutorialUI.setAllowedActions(deps.refs.btnMentalToggle);
    };

    TutorialController.prototype._showExpertMentalSkillStep = function () {
      if (this.hasShownMentalSkillPrompt) return;
      this.hasShownMentalSkillPrompt = true;
      this.stepFlow = 'expert-mental-skill';
      var handContent = this._contentForCurrentHand() || {};

      deps.tutorialUI.clear();
      deps.tutorialUI.showMessage('这手先试一次压场，让对手的气势先缩下去。');
      deps.tutorialUI.showDialog({
        title: handContent.mentalSkillTitle || '先用一次压场',
        body: handContent.mentalSkillBody || '',
        anchor: deps.refs.btnPresence,
        placement: 'top',
        dismissible: false,
        secondaryText: this._getExpertInfoLabel(),
        secondaryAction: this._showExpertGlossaryPanel.bind(this)
      });
      deps.tutorialUI.highlight(deps.refs.btnPresence);
      deps.tutorialUI.setAllowedActions(deps.refs.btnPresence);
    };

    TutorialController.prototype._showExpertMentalResultStep = function (payload) {
      var self = this;
      var handContent = this._contentForCurrentHand() || {};
      var target = deps.getOpponentCardsTarget();
      var result = payload && payload.result;
      var effectText = result ? ({
        none: '几乎没造成动摇',
        weak: '只打出了很轻的一层压力',
        effective: '已经明显起效',
        excellent: '打得很深，对面会明显难受'
      }[result.effectLevel] || '已经起效') : '已经起效';
      var stateText = result ? ({
        stable: '稳定',
        shaken: '动摇',
        unsteady: '失衡',
        broken: '崩拍'
      }[result.state] || result.state) : '';

      this.stepFlow = 'expert-mental-result';
      deps.tutorialUI.clear();
      deps.tutorialUI.showDialog({
        title: handContent.mentalResultTitle || '这次心理战打中了什么',
        body: (handContent.mentalResultBody || '') + '\n' +
          '这次结果：' + effectText + '\n' +
          (stateText ? ('对手当前状态：' + stateText + '\n') : '') +
          '关键理解：你的牌没有变大，但对手更容易在后续动作里退缩。',
        anchor: target,
        placement: 'left',
        dismissible: true,
        showClose: false,
        dismissText: '我知道了',
        secondaryText: this._getExpertInfoLabel(),
        secondaryAction: this._showExpertGlossaryPanel.bind(this),
        onDismiss: function () {
          self._releaseExpertFreePlay();
        }
      });
      deps.tutorialUI.highlight(target);
      deps.tutorialUI.setAllowedActions('[data-tutorial-root-only]');
    };

    TutorialController.prototype._showExpertPreflopStep = function () {
      var self = this;
      var handContent = this._contentForCurrentHand() || {};
      var handTarget = deps.getHeroCardsTarget();
      this.hasPromptedExpertPreflop = true;
      this.stepFlow = 'expert-preflop-intro';
      deps.tutorialUI.clear();
      this._installQuickHelp();
      deps.tutorialUI.showMessage('这手先按正常德州流程入池，技能教学会在后面的技能阶段开始。');
      deps.tutorialUI.showDialog({
        title: handContent.preflopTitle || '先跟入这一手',
        body: handContent.preflopBody || '',
        anchor: handTarget,
        placement: 'top',
        dismissible: true,
        showClose: false,
        dismissText: '去跟注',
        secondaryText: this._getExpertInfoLabel(),
        secondaryAction: this._showExpertGlossaryPanel.bind(this),
        onDismiss: function () {
          self.stepFlow = 'expert-preflop-call';
          deps.tutorialUI.clear();
          self._installQuickHelp();
          deps.tutorialUI.showDialog({
            title: '先点 CALL',
            body: self._isCurrentExpertHand('mental-basics')
              ? '这一步先用普通德州动作入池。按 [跟注 (CALL)]，翻牌后我会带你看一次最基础的心理战。'
              : '这一步先用普通德州动作入池。按 [跟注 (CALL)]，等这条街结束后，牌桌会进入技能阶段，再开始好运教学。',
            anchor: '#action-row',
            placement: 'top',
            dismissible: false,
            secondaryText: self._getExpertInfoLabel(),
            secondaryAction: self._showExpertGlossaryPanel.bind(self)
          });
          deps.tutorialUI.spotlight('#action-row', { padding: 14 });
          deps.tutorialUI.highlight('#btn-check-call');
          deps.tutorialUI.setAllowedActions('#btn-check-call');
        }
      });
      deps.tutorialUI.spotlight(handTarget, { padding: 16 });
      deps.tutorialUI.highlight(handTarget);
      deps.tutorialUI.setAllowedActions('[data-tutorial-root-only]');
    };

    TutorialController.prototype._showBoardAndHandStep = function (title, body, dismissText, nextStepFlow) {
      var self = this;
      var boardTarget = deps.getBoardTarget();
      var handTarget = deps.getHeroCardsTarget();
      deps.tutorialUI.clear();
      deps.tutorialUI.showMessage('现在把你的底牌和公告牌一起看。');
      deps.tutorialUI.showDialog({
        title: title,
        body: body,
        anchor: boardTarget,
        placement: 'top',
        dismissible: true,
        showClose: false,
        dismissText: dismissText || '继续',
        secondaryText: '牌型说明',
        secondaryAction: function () {
          self._showNoviceBasicsPanel();
        },
        onDismiss: function () {
          self.stepFlow = nextStepFlow || self.stepFlow;
          deps.tutorialUI.clear();
          self._installQuickHelp();
          self._flushPendingControlPrompt();
        }
      });
      deps.tutorialUI.spotlight(boardTarget, { padding: 16 });
      deps.tutorialUI.highlight([boardTarget, handTarget]);
      deps.tutorialUI.setAllowedActions('[data-tutorial-root-only]');
    };

    TutorialController.prototype._startNoviceWalkthrough = function () {
      var self = this;
      var handContent = this._contentForCurrentHand() || {};
      this.stepFlow = 'novice-intro';
      deps.tutorialUI.clear();
      deps.tutorialUI.showMessage('先别急着操作，我会按顺序带你看完这手牌。');
      deps.tutorialUI.showDialog({
        title: handContent.startSequenceTitle || '一手德州的基础顺序',
        body: handContent.startSequenceBody || '',
        placement: 'center',
        dismissible: true,
        showClose: false,
        dismissText: '开始看手牌',
        secondaryText: '怎么赢/牌型',
        secondaryAction: function () {
          self._showNoviceBasicsPanel();
        },
        onDismiss: function () {
          self._showNoviceHoleCardsStep();
        }
      });
      deps.tutorialUI.setAllowedActions('[data-tutorial-root-only]');
    };

    TutorialController.prototype._showNoviceHoleCardsStep = function () {
      var self = this;
      var handContent = this._contentForCurrentHand() || {};
      var target = deps.getHeroCardsTarget();
      if (!deps.isVisibleTutorialTarget(target)) {
        setTimeout(function () {
          self._showNoviceHoleCardsStep();
        }, 180);
        return;
      }

      this.stepFlow = 'novice-hole-cards';
      deps.tutorialUI.clear();
      deps.tutorialUI.showMessage('先看你自己的两张底牌。');
      deps.tutorialUI.showDialog({
        title: handContent.holeTitle || '你的手牌',
        body: handContent.holeBody || '',
        anchor: target,
        placement: 'top',
        dismissible: true,
        showClose: false,
        dismissText: '我知道了',
        secondaryText: '怎么赢/牌型',
        secondaryAction: function () {
          self._showNoviceBasicsPanel();
        },
        onDismiss: function () {
          self._showNoviceDealerStep();
        }
      });
      deps.tutorialUI.spotlight(target, { padding: 16 });
      deps.tutorialUI.highlight(target);
      deps.tutorialUI.setAllowedActions('[data-tutorial-root-only]');
    };

    TutorialController.prototype._showNoviceDealerStep = function () {
      var self = this;
      var handContent = this._contentForCurrentHand() || {};
      var target = deps.getHeroDealerTarget();
      var hero = deps.getHeroPlayer();
      if (!deps.isVisibleTutorialTarget(target) || !hero) {
        setTimeout(function () {
          self._showNoviceDealerStep();
        }, 180);
        return;
      }

      var dealerBadge = hero.seatElement ? hero.seatElement.querySelector('.dealer-module') : null;
      var positionBadge = hero.seatElement ? hero.seatElement.querySelector('.position-badge') : null;

      this.stepFlow = 'novice-dealer';
      deps.tutorialUI.clear();
      deps.tutorialUI.showMessage('这把你坐庄，位置会直接影响谁先说话。');
      deps.tutorialUI.showDialog({
        title: handContent.dealerTitle || '你现在是庄位',
        body: handContent.dealerBody || '',
        anchor: target,
        placement: 'top',
        dismissible: true,
        showClose: false,
        dismissText: '看操作区',
        secondaryText: '怎么赢/牌型',
        secondaryAction: function () {
          self._showNoviceBasicsPanel();
        },
        onDismiss: function () {
          self._showNoviceActionStep();
        }
      });
      deps.tutorialUI.spotlight(target, { padding: 14 });
      deps.tutorialUI.highlight([target, dealerBadge, positionBadge]);
      deps.tutorialUI.setAllowedActions('[data-tutorial-root-only]');
    };

    TutorialController.prototype._showNoviceActionStep = function () {
      var self = this;
      var handContent = this._contentForCurrentHand() || {};

      this.stepFlow = 'novice-action';
      deps.tutorialUI.clear();
      deps.tutorialUI.showMessage('现在轮到你了，这一步只需要跟注继续看翻牌。');
      deps.tutorialUI.showDialog({
        title: handContent.preflopActionTitle || '第一步操作',
        body: handContent.preflopActionBody || '',
        anchor: '#action-row',
        placement: 'top',
        dismissible: false,
        secondaryText: '怎么赢/牌型',
        secondaryAction: function () {
          self._showNoviceBasicsPanel();
        }
      });
      deps.tutorialUI.spotlight('#action-row', { padding: 14 });
      deps.tutorialUI.highlight('#btn-check-call');
      deps.tutorialUI.setAllowedActions('#btn-check-call');
    };

    TutorialController.prototype._showIntroStreetAction = function (phase) {
      var self = this;
      var handContent = this._contentForCurrentHand() || {};
      var title = handContent.streetActionTitles && handContent.streetActionTitles[phase];
      var body = handContent.streetActionBodies && handContent.streetActionBodies[phase];

      deps.tutorialUI.clear();
      deps.tutorialUI.showMessage((title || phase) + '先不求复杂判断，继续用 CHECK 看完整体流程。');
      deps.tutorialUI.showDialog({
        title: title || '本街操作',
        body: body || '',
        anchor: '#action-row',
        placement: 'top',
        dismissible: false,
        secondaryText: '牌型说明',
        secondaryAction: function () {
          self._showNoviceBasicsPanel();
        }
      });
      deps.tutorialUI.spotlight('#action-row', { padding: 14 });
      deps.tutorialUI.highlight('#btn-check-call');
      deps.tutorialUI.setAllowedActions('#btn-check-call');
    };

    TutorialController.prototype._showAheadPreflopStep = function () {
      var self = this;
      var handContent = this._contentForCurrentHand() || {};
      var handTarget = deps.getHeroCardsTarget();
      deps.tutorialUI.clear();
      deps.tutorialUI.showMessage('这把你的起手更强，应该主动争取价值。');
      deps.tutorialUI.showDialog({
        title: handContent.preflopTitle || '顺风局：先主动加注',
        body: handContent.preflopBody || '',
        anchor: handTarget,
        placement: 'top',
        dismissible: true,
        showClose: false,
        dismissText: '去加注',
        secondaryText: '牌型说明',
        secondaryAction: function () {
          self._showNoviceBasicsPanel();
        },
        onDismiss: function () {
          self.stepFlow = 'ahead-preflop-open';
          deps.tutorialUI.clear();
          deps.tutorialUI.showDialog({
            title: handContent.preflopActionTitle || '现在按 RAISE',
            body: handContent.preflopActionBody || '',
            anchor: '#btn-raise',
            placement: 'top',
            dismissible: false,
            secondaryText: '牌型说明',
            secondaryAction: function () {
              self._showNoviceBasicsPanel();
            }
          });
          deps.tutorialUI.spotlight('#btn-raise', { padding: 14 });
          deps.tutorialUI.highlight('#btn-raise');
          deps.tutorialUI.setAllowedActions('#btn-raise');
        }
      });
      deps.tutorialUI.spotlight(handTarget, { padding: 16 });
      deps.tutorialUI.highlight(handTarget);
      deps.tutorialUI.setAllowedActions('[data-tutorial-root-only]');
    };

    TutorialController.prototype._applyFixedRaise = function () {
      var hand = this._getCurrentHandMeta() || {};
      var fixedRaiseTo = Number(hand.fixedRaiseTo || 0);
      var gameState = deps.getGameState();
      var hero = deps.getHeroPlayer();
      if (!fixedRaiseTo || !gameState || !hero || typeof deps.setRaiseSliderValue !== 'function') return;

      var amount = Math.max(0, fixedRaiseTo - Number(gameState.currentBet || 0));
      deps.setRaiseSliderValue(amount);
    };

    TutorialController.prototype._showAheadRaiseConfirmStep = function () {
      var self = this;
      var handContent = this._contentForCurrentHand() || {};

      this.stepFlow = 'ahead-preflop-confirm';
      this._applyFixedRaise();
      deps.tutorialUI.clear();
      deps.tutorialUI.showMessage('这次加注已经帮你固定好了，不需要自己试探大小。');
      deps.tutorialUI.showDialog({
        title: handContent.preflopConfirmTitle || '确认这次标准加注',
        body: handContent.preflopConfirmBody || '',
        anchor: '#btn-confirm-raise',
        placement: 'top',
        dismissible: false,
        secondaryText: '牌型说明',
        secondaryAction: function () {
          self._showNoviceBasicsPanel();
        }
      });
      deps.tutorialUI.spotlight('#btn-confirm-raise', { padding: 14 });
      deps.tutorialUI.highlight(['#btn-confirm-raise', '#raise-amount-display']);
      deps.tutorialUI.setAllowedActions('#btn-confirm-raise');
    };

    TutorialController.prototype._showAheadStreetAction = function (phase) {
      var self = this;
      var handContent = this._contentForCurrentHand() || {};
      var gameState = deps.getGameState();
      var title = handContent.streetActionTitles && handContent.streetActionTitles[phase];
      var body = handContent.streetActionBodies && handContent.streetActionBodies[phase];
      var toCall = Math.max(0, Number(gameState.currentBet || 0) - Number((deps.getHeroPlayer() && deps.getHeroPlayer().currentBet) || 0));
      var ctaSelector = toCall > 0 ? '#btn-check-call' : '#btn-check-call';
      var actionWord = toCall > 0 ? 'CALL' : 'CHECK';

      deps.tutorialUI.clear();
      deps.tutorialUI.showMessage('这手已经建立领先优势，先观察对手愿不愿意继续讲故事。');
      deps.tutorialUI.showDialog({
        title: title || handContent.streetActionTitle || '顺风局：保持简单',
        body: body || handContent.streetActionBody || '',
        anchor: '#action-row',
        placement: 'top',
        dismissible: false,
        secondaryText: '牌型说明',
        secondaryAction: function () {
          self._showNoviceBasicsPanel();
        }
      });
      deps.tutorialUI.spotlight('#action-row', { padding: 14 });
      deps.tutorialUI.highlight(ctaSelector);
      deps.tutorialUI.setAllowedActions(ctaSelector);
    };

    TutorialController.prototype._showBehindPreflopStep = function () {
      var self = this;
      var handContent = this._contentForCurrentHand() || {};
      var handTarget = deps.getHeroCardsTarget();
      deps.tutorialUI.clear();
      deps.tutorialUI.showMessage('这把起手一般，我们先便宜入池，看翻牌再决定。');
      deps.tutorialUI.showDialog({
        title: handContent.preflopTitle || '逆风局：先便宜看翻牌',
        body: handContent.preflopBody || '',
        anchor: handTarget,
        placement: 'top',
        dismissible: true,
        showClose: false,
        dismissText: '去跟注',
        secondaryText: '牌型说明',
        secondaryAction: function () {
          self._showNoviceBasicsPanel();
        },
        onDismiss: function () {
          self.stepFlow = 'behind-preflop-action';
          deps.tutorialUI.clear();
          deps.tutorialUI.showDialog({
            title: handContent.preflopActionTitle || '先按 CHECK/CALL',
            body: handContent.preflopActionBody || '',
            anchor: '#action-row',
            placement: 'top',
            dismissible: false,
            secondaryText: '牌型说明',
            secondaryAction: function () {
              self._showNoviceBasicsPanel();
            }
          });
          deps.tutorialUI.spotlight('#action-row', { padding: 14 });
          deps.tutorialUI.highlight('#btn-check-call');
          deps.tutorialUI.setAllowedActions('#btn-check-call');
        }
      });
      deps.tutorialUI.spotlight(handTarget, { padding: 16 });
      deps.tutorialUI.highlight(handTarget);
      deps.tutorialUI.setAllowedActions('[data-tutorial-root-only]');
    };

    TutorialController.prototype._showBehindFoldStep = function () {
      var self = this;
      var handContent = this._contentForCurrentHand() || {};
      var hero = deps.getHeroPlayer();
      deps.tutorialUI.clear();
      deps.tutorialUI.showMessage('现在就是逆风局最重要的一课：该放弃时要放弃。');
      deps.tutorialUI.showDialog({
        title: handContent.foldTitle || '逆风局：及时弃牌',
        body:
          '公告牌现在是 ' + deps.describeCards(deps.getGameState().board || []) + '。你手里是 ' +
          deps.describeCards(hero ? hero.cards : []) + '，没有击中成型牌；对手还主动下注，' +
          (handContent.foldBody || '这时候继续跟会越来越亏。先按 FOLD，学会止损。'),
        anchor: '#action-row',
        placement: 'top',
        dismissible: false,
        secondaryText: '牌型说明',
        secondaryAction: function () {
          self._showNoviceBasicsPanel();
        }
      });
      deps.tutorialUI.spotlight('#action-row', { padding: 14 });
      deps.tutorialUI.highlight(['#btn-fold', deps.getBoardTarget(), deps.getHeroCardsTarget()]);
      deps.tutorialUI.setAllowedActions('#btn-fold');
    };

    TutorialController.prototype._handleNovicePlayerControls = function () {
      var gameState = deps.getGameState();
      if (this._isCurrentNoviceHand('intro') && gameState.phase === 'flop' && this.stepFlow === 'intro-flop-board') {
        this._rememberPendingControlPrompt();
        return;
      }
      if (this._isCurrentNoviceHand('ahead') && gameState.phase === 'flop' && this.stepFlow !== 'ahead-flop-ready') {
        this._rememberPendingControlPrompt();
        return;
      }
      if (this._isCurrentNoviceHand('behind') && gameState.phase === 'flop' && this.stepFlow !== 'behind-flop-ready') {
        this._rememberPendingControlPrompt();
        return;
      }

      var key = this.currentHandId + ':' + gameState.phase;
      if (this.promptedControls[key]) return;
      this.promptedControls[key] = true;

      if (this._isCurrentNoviceHand('intro')) {
        if (gameState.phase === 'preflop') {
          this._startNoviceWalkthrough();
        } else if (gameState.phase === 'flop' || gameState.phase === 'turn' || gameState.phase === 'river') {
          this._showIntroStreetAction(gameState.phase);
        }
        return;
      }

      if (this._isCurrentNoviceHand('ahead')) {
        if (gameState.phase === 'preflop') {
          this._showAheadPreflopStep();
        } else {
          this._showAheadStreetAction(gameState.phase);
        }
        return;
      }

      if (this._isCurrentNoviceHand('behind')) {
        if (gameState.phase === 'preflop') {
          this._showBehindPreflopStep();
        } else if (gameState.phase === 'flop') {
          this._showBehindFoldStep();
        }
      }
    };

    TutorialController.prototype._showExpertMagicIntro = function () {
      if (this.hasPromptedMagicKey) return;
      this.hasPromptedMagicKey = true;
      this.stepFlow = this._isCurrentExpertHand('curse-pressure')
        ? 'expert-curse-open-grimoire'
        : this._isCurrentExpertHand('psyche-convert')
          ? 'expert-psyche-open-grimoire'
        : 'expert-fortune-open-grimoire';
      var handContent = this._contentForCurrentHand() || {};

      deps.tutorialUI.clear();
      deps.tutorialUI.showMessage('技能阶段到了。先打开 GRIMOIRE，看你这手真正要用的那张牌。');
      deps.tutorialUI.showDialog({
        title: handContent.openMagicTitle || expertContent.openMagicTitle || '打开技能区',
        body: handContent.openMagicBody || expertContent.openMagicBody || '',
        anchor: deps.refs.magicKey,
        placement: 'left',
        dismissible: false
      });
      deps.tutorialUI.spotlight(deps.refs.magicKey, { padding: 10 });
      deps.tutorialUI.highlight(deps.refs.magicKey);
      deps.tutorialUI.setAllowedActions(deps.refs.magicKey);
    };

    TutorialController.prototype._findExpertGuidedCard = function () {
      var isCurseHand = this._isCurrentExpertHand('curse-pressure');
      var isPsycheHand = this._isCurrentExpertHand('psyche-convert');
      var cards = document.querySelectorAll(isCurseHand
        ? '#skill-panel .hero-card.skin-chaos:not([disabled])'
        : isPsycheHand
          ? '#skill-panel .hero-card.skin-psyche:not([disabled])'
          : '#skill-panel .hero-card.skin-moirai:not([disabled])');
      if (!cards || !cards.length) return null;
      for (var i = 0; i < cards.length; i++) {
        var card = cards[i];
        var label = card.querySelector('.meta-name');
        var text = label ? label.textContent : '';
        if (isCurseHand && text && (text.indexOf('小凶') >= 0 || text.indexOf('大凶') >= 0 || text.indexOf('灾变') >= 0)) {
          return card;
        }
        if (!isCurseHand && text && (text.indexOf('小吉') >= 0 || text.indexOf('大吉') >= 0 || text.indexOf('天命') >= 0)) {
          return card;
        }
        if (isPsycheHand && text && (text.indexOf('折射') >= 0 || text.indexOf('真理') >= 0 || text.indexOf('澄澈') >= 0)) {
          return card;
        }
      }
      return cards[0] || null;
    };

    TutorialController.prototype._showExpertSkillCardPrompt = function () {
      var self = this;
      var handContent = this._contentForCurrentHand() || {};
      var card = this._findExpertGuidedCard();
      if (!card) {
        setTimeout(function () {
          self._showExpertSkillCardPrompt();
        }, 180);
        return;
      }

      var isCurseHand = this._isCurrentExpertHand('curse-pressure');
      var isPsycheHand = this._isCurrentExpertHand('psyche-convert');
      var heroSeat = deps.getHeroPlayer() && deps.getHeroPlayer().seatElement;
      var opponentTarget = deps.getOpponentCardsTarget();
      var opponentSeat = opponentTarget ? opponentTarget.closest('.seat') : null;
      this.hasShownMagicCard = true;
      this.stepFlow = isCurseHand ? 'expert-curse-card' : isPsycheHand ? 'expert-psyche-card' : 'expert-fortune-card';
      deps.tutorialUI.clear();
      this._installQuickHelp();
      deps.tutorialUI.showMessage(isCurseHand
        ? '这一步先点一张 curse，再把目标指向对手。'
        : isPsycheHand
          ? '这一步先点折射，再先守护自己，最后锁定对手。'
        : '这一步只点一张 fortune，先看它怎么改变后面的发牌。');
      deps.tutorialUI.showDialog({
        title: handContent.psycheCardTitle || handContent.curseCardTitle || handContent.fortuneCardTitle || expertContent.cardTitle || '先点一张技能牌',
        body: handContent.psycheCardBody || handContent.curseCardBody || handContent.fortuneCardBody || expertContent.cardBody || '',
        anchor: card,
        placement: 'top',
        dismissible: false,
        secondaryText: this._getExpertInfoLabel(),
        secondaryAction: this._showExpertGlossaryPanel.bind(this)
      });
      deps.tutorialUI.spotlight(card, { padding: 12 });
      deps.tutorialUI.highlight(isCurseHand ? [card, opponentSeat] : card);
      deps.tutorialUI.setAllowedActions(isCurseHand ? [card, opponentSeat] : card);
    };

    TutorialController.prototype._showExpertPsycheProtectStep = function () {
      var magicKey = deps.refs.magicKey;
      var heroSeat = deps.getHeroPlayer() && deps.getHeroPlayer().seatElement;
      var heroVisual = deps.getHeroCardsTarget() || deps.getHeroDealerTarget() || heroSeat;
      if (!heroSeat) return;

      this.hasShownExpertProtectPrompt = true;
      this.stepFlow = 'expert-psyche-protect';
      deps.tutorialUI.clear();
      this._installQuickHelp();
      deps.tutorialUI.showMessage('先把魔运面板收起来，再点自己的位置作为守护目标。');
      deps.tutorialUI.showDialog({
        title: '先收起面板，再守护自己',
        body: '点完 [折射] 以后，先点一次魔运按钮把面板收起。这样不会挡住座位。然后点你自己的座位，把这次灵视的守护目标放在自己身上。',
        anchor: magicKey || '#action-row',
        placement: 'top',
        dismissible: false,
        secondaryText: this._getExpertInfoLabel(),
        secondaryAction: this._showExpertGlossaryPanel.bind(this)
      });
      deps.tutorialUI.highlight([magicKey, heroVisual]);
      deps.tutorialUI.setAllowedActions([magicKey, heroSeat]);
    };

    TutorialController.prototype._showExpertPsychePeekStep = function () {
      var opponentTarget = deps.getOpponentCardsTarget();
      var opponentSeat = opponentTarget ? opponentTarget.closest('.seat') : null;
      var magicKey = deps.refs.magicKey;
      if (!opponentSeat) return;

      this.hasShownExpertPeekPrompt = true;
      this.stepFlow = 'expert-psyche-peek';
      deps.tutorialUI.clear();
      this._installQuickHelp();
      deps.tutorialUI.showMessage('很好。现在点对手的位置，把透视目标锁到他身上。');
      deps.tutorialUI.showDialog({
        title: '接着点对手',
        body: '守护目标已经立好了。现在如果面板还没收，就先点一下魔运按钮；然后点对手座位，完成这次折射的透视目标。',
        anchor: magicKey || '#action-row',
        placement: 'top',
        dismissible: false,
        secondaryText: this._getExpertInfoLabel(),
        secondaryAction: this._showExpertGlossaryPanel.bind(this)
      });
      deps.tutorialUI.highlight([magicKey, opponentTarget || opponentSeat]);
      deps.tutorialUI.setAllowedActions([magicKey, opponentSeat]);
    };

    TutorialController.prototype._showExpertProceedStep = function () {
      var self = this;
      var handContent = this._contentForCurrentHand() || {};
      var proceedBtn = document.getElementById('btn-skill-proceed');
      if (!deps.isVisibleTutorialTarget(proceedBtn)) {
        setTimeout(function () {
          self._showExpertProceedStep();
        }, 150);
        return;
      }

      this.stepFlow = this._isCurrentExpertHand('curse-pressure')
        ? 'expert-curse-proceed'
        : this._isCurrentExpertHand('psyche-convert')
          ? 'expert-psyche-proceed'
          : 'expert-fortune-proceed';
      deps.tutorialUI.clear();
      this._installQuickHelp();
      deps.tutorialUI.showMessage(this._isCurrentExpertHand('curse-pressure')
        ? '厄运已经压到对手身上了，现在让系统结算它怎样把结果往坏处推。'
        : this._isCurrentExpertHand('psyche-convert')
          ? '折射已经立起来了，现在让系统结算它怎样把对手的厄运折回来。'
        : '好运已经挂上去了，现在让系统结算它如何影响下一张牌。');
      deps.tutorialUI.showDialog({
        title: handContent.proceedTitle || '点继续发牌',
        body: handContent.proceedBody || '',
        anchor: proceedBtn,
        placement: 'top',
        dismissible: false,
        secondaryText: this._getExpertInfoLabel(),
        secondaryAction: this._showExpertGlossaryPanel.bind(this)
      });
      deps.tutorialUI.spotlight(proceedBtn, { padding: 12 });
      deps.tutorialUI.highlight([deps.refs.magicKey, proceedBtn]);
      deps.tutorialUI.setAllowedActions([deps.refs.magicKey, proceedBtn]);
    };

    TutorialController.prototype._showExpertPeekDismissStep = function () {
      var self = this;
      var overlay = document.querySelector('.peek-result-overlay');
      if (!overlay) {
        this.pendingExpertPeekDismiss = false;
        this._showExpertProceedStep();
        return;
      }

      this.pendingExpertPeekDismiss = true;
      this.stepFlow = 'expert-psyche-dismiss-peek';
      deps.tutorialUI.clear();
      this._installQuickHelp();
      deps.tutorialUI.showMessage('透视结果已经出来了，先把这张情报面板关掉。');
      deps.tutorialUI.showDialog({
        title: '先关掉透视结果',
        body: '这块 CLAIRVOYANCE LOCK 是折射带来的情报结果。先点它一下把面板关掉，教程再继续带你去 [继续发牌]。',
        anchor: overlay,
        placement: 'top',
        backdrop: false,
        dismissible: false,
        secondaryText: this._getExpertInfoLabel(),
        secondaryAction: this._showExpertGlossaryPanel.bind(this)
      });
      deps.tutorialUI.highlight(overlay);
      deps.tutorialUI.setAllowedActions(overlay);

      setTimeout(function () {
        self._watchExpertPeekDismiss();
      }, 120);
    };

    TutorialController.prototype._watchExpertPeekDismiss = function () {
      var self = this;
      if (!this.pendingExpertPeekDismiss) return;
      var overlay = document.querySelector('.peek-result-overlay');
      if (overlay) {
        setTimeout(function () {
          self._watchExpertPeekDismiss();
        }, 120);
        return;
      }
      this.pendingExpertPeekDismiss = false;
      this._showExpertProceedStep();
    };

    TutorialController.prototype._showExpertForcePanelGuide = function (attempt) {
      var self = this;
      var handContent = this._contentForCurrentHand() || {};
      var overlay = document.getElementById('force-pk-overlay');
      var tries = Number(attempt || 0);
      if (!deps.isVisibleTutorialTarget(overlay)) {
        if (tries < 8) {
          setTimeout(function () {
            self._showExpertForcePanelGuide(tries + 1);
          }, 80);
        }
        return;
      }

      this.hasShownExpertForcePanel = true;
      this.stepFlow = this._isCurrentExpertHand('curse-pressure')
        ? 'expert-curse-force-panel'
        : this._isCurrentExpertHand('psyche-convert')
          ? 'expert-psyche-force-panel'
          : 'expert-fortune-force-panel';

      if (this._isCurrentExpertHand('fortune-intro') && handContent.forceGuidePanel) {
        deps.tutorialUI.clear();
        this._installQuickHelp();
        deps.tutorialUI.showMessage('先别急着关，这一块最值得停下来读一遍。');
        deps.tutorialUI.showInfoPanel({
          title: handContent.forceGuidePanel.title || handContent.forcePanelTitle || '命运结算面板',
          subtitle: handContent.forceGuidePanel.subtitle || 'FORTUNE PANEL GUIDE',
          html: renderBasicsPanel(handContent.forceGuidePanel),
          onClose: function () {
            self._showExpertForcePanelDismissHint();
          }
        });
        deps.tutorialUI.setAllowedActions('[data-tutorial-root-only]');
        return;
      }

      deps.tutorialUI.clear();
      this._installQuickHelp();
      deps.tutorialUI.showMessage(this._isCurrentExpertHand('curse-pressure')
        ? '这块面板在告诉你：这次厄运怎样把结果往对手不舒服的方向推。'
        : this._isCurrentExpertHand('psyche-convert')
          ? '这块面板会同时显示：对手的凶咒被怎样拦下，以及它最后怎样转成了你的收益。'
        : '这块面板就是这次好运的结算结果。');
      deps.tutorialUI.showDialog({
        title: handContent.forcePanelTitle || '命运结算面板',
        body: handContent.forcePanelBody || '',
        anchor: overlay,
        placement: 'left',
        backdrop: false,
        dismissible: true,
        showClose: false,
        dismissText: this._isCurrentExpertHand('fortune-intro') ? '继续看下一步' : '我看懂了',
        secondaryText: this._getExpertInfoLabel(),
        secondaryAction: this._showExpertGlossaryPanel.bind(this),
        onDismiss: function () {
          if (self._isCurrentExpertHand('fortune-intro')) {
            self._showExpertForcePanelDismissHint();
            return;
          }
          deps.tutorialUI.clear();
          deps.tutorialUI.showMessage('你可以点一下面板把它关掉，然后回到牌桌继续这一手。');
          deps.tutorialUI.highlight(overlay);
          deps.tutorialUI.setAllowedActions(['#force-pk-overlay', '[data-tutorial-root-only]']);
        }
      });
      deps.tutorialUI.highlight(overlay);
      deps.tutorialUI.setAllowedActions('[data-tutorial-root-only]');
    };

    TutorialController.prototype._showExpertForcePanelDismissHint = function () {
      var overlay = document.getElementById('force-pk-overlay');
      if (!deps.isVisibleTutorialTarget(overlay)) return;

      deps.tutorialUI.clear();
      this._installQuickHelp();
      deps.tutorialUI.showMessage('现在把这块面板当成结算单看就行，看完再点它一次关闭。');
      deps.tutorialUI.showDialog({
        title: '怎么看最后这行结果',
        body: '记法很简单：越往上的候选牌权重越大；左边更偏向你，右边更偏向别人或更不利于你；而被箭头和高亮选中的那一行，就是这次真正发出来的牌。\n\n你看完以后，直接点一下这块面板，把它关掉，我们就回到牌桌看结果落地。',
        anchor: overlay,
        placement: 'left',
        backdrop: false,
        dismissible: true,
        showClose: false,
        dismissText: '我知道怎么读了',
        secondaryText: this._getExpertInfoLabel(),
        secondaryAction: this._showExpertGlossaryPanel.bind(this),
        onDismiss: function () {
          deps.tutorialUI.clear();
          deps.tutorialUI.showMessage('现在点一下面板本体，把这次命运结算关掉。');
          deps.tutorialUI.highlight(overlay);
          deps.tutorialUI.setAllowedActions(['#force-pk-overlay', '[data-tutorial-root-only]']);
        }
      });
      deps.tutorialUI.highlight(overlay);
      deps.tutorialUI.setAllowedActions('[data-tutorial-root-only]');
    };

    TutorialController.prototype._showExpertCallStep = function () {
      var handContent = this._contentForCurrentHand() || {};
      this.stepFlow = 'expert-fortune-call';
      deps.tutorialUI.clear();
      this._installQuickHelp();
      deps.tutorialUI.showMessage('命运结算看完后，还是要回到牌桌把这手牌打完。');
      deps.tutorialUI.showDialog({
        title: handContent.callTitle || '回到行动区',
        body: handContent.callBody || '',
        anchor: '#action-row',
        placement: 'top',
        dismissible: false,
        secondaryText: this._getExpertInfoLabel(),
        secondaryAction: this._showExpertGlossaryPanel.bind(this)
      });
      deps.tutorialUI.spotlight('#action-row', { padding: 14 });
      deps.tutorialUI.highlight('#btn-check-call');
      deps.tutorialUI.setAllowedActions('#btn-check-call');
    };

    TutorialController.prototype._showExpertFlopResultStep = function () {
      var self = this;
      var handContent = this._contentForCurrentHand() || {};
      var hero = deps.getHeroPlayer();
      var villain = (deps.getGameState().players || []).find(function (player) {
        return player && player.type === 'ai';
      }) || null;
      var board = (deps.getGameState().board || []).slice();
      var boardTarget = deps.getBoardTarget();
      var handTarget = deps.getHeroCardsTarget();
      var opponentTarget = deps.getOpponentCardsTarget();
      var resolvedCard = this.expertResolvedCardCode || (board.length ? deps.describeCards([board[board.length - 1]]) : '暂无');
      var handDescr = deps.describeCurrentHand ? deps.describeCurrentHand(hero) : '';
      var villainDescr = deps.describeCurrentHand ? deps.describeCurrentHand(villain) : '';
      var psycheEvents = this.expertForceMeta && Array.isArray(this.expertForceMeta.psycheEvents)
        ? this.expertForceMeta.psycheEvents
        : [];
      var psycheSummary = '';
      if (this._isCurrentExpertHand('psyche-convert') && psycheEvents.length) {
        var convertEvent = psycheEvents.find(function (event) {
          return event && event.action === 'convert';
        }) || psycheEvents[0];
        if (convertEvent && convertEvent.action === 'convert') {
          psycheSummary = '灵视裁定：' + (convertEvent.arbiterOwner || '你') + ' 用 ' +
            (convertEvent.arbiterType === 'refraction' ? '折射' : '灵视') +
            ' 拦下了 ' + (convertEvent.targetOwner || '对手') + ' 的厄运，并转成了对自己的好运。';
        } else if (convertEvent && convertEvent.action === 'nullify') {
          psycheSummary = '灵视裁定：这次厄运先被你拦下了，没有直接落到你身上。';
        } else if (convertEvent && convertEvent.action === 'whiff') {
          psycheSummary = '灵视裁定：这次对面的厄运没有真正形成有效压制。';
        }
      }

      this.pendingExpertFlopSummary = false;
      this.stepFlow = this._isCurrentExpertHand('curse-pressure')
        ? 'expert-curse-flop-summary'
        : this._isCurrentExpertHand('psyche-convert')
          ? 'expert-psyche-flop-summary'
          : 'expert-fortune-flop-summary';
      deps.tutorialUI.clear();
      this._installQuickHelp();
      deps.tutorialUI.showMessage(this._isCurrentExpertHand('curse-pressure')
        ? '现在回到牌桌，看看这次厄运究竟把对手压成了什么。'
        : this._isCurrentExpertHand('psyche-convert')
          ? '现在回到牌桌，看看这次灵视反制最后把局面改写成了什么。'
          : '现在回到牌桌，看看这次好运实际把局面推成了什么。');
      deps.tutorialUI.showDialog({
        title: handContent.flopResultTitle || '好运把翻牌推到了这里',
        body:
          (handContent.flopResultBody || '') + '\n' +
          (psycheSummary ? ('灵视结果：' + psycheSummary + '\n') : '') +
          '这次被推出来的牌：' + resolvedCard + '\n' +
          '当前公告牌：' + deps.describeCards(board) + '\n' +
          '你现在凑出来的是：' + (handDescr || '暂未成型') + '\n' +
          (villain ? ('对手现在凑出来的是：' + (villainDescr || '暂未成型')) : ''),
        anchor: boardTarget || handTarget,
        placement: 'left',
        dismissible: true,
        showClose: false,
        dismissText: '我看懂了',
        secondaryText: this._getExpertInfoLabel(),
        secondaryAction: this._showExpertGlossaryPanel.bind(this),
        onDismiss: function () {
          self._releaseExpertFreePlay();
        }
      });
      deps.tutorialUI.highlight([boardTarget, handTarget, opponentTarget]);
      deps.tutorialUI.setAllowedActions('[data-tutorial-root-only]');
    };

    TutorialController.prototype._releaseExpertFreePlay = function () {
      var handContent = this._contentForCurrentHand() || {};
      this.expertFreePlay = true;
      this.stepFlow = 'expert-freeplay';
      this.pendingControlPrompt = null;
      deps.tutorialUI.clear();
      this._installQuickHelp();
      deps.tutorialUI.showMessage(handContent.freePlayBody || '这一段先不再逐步指挥了，你可以自己点点看。');
    };

    TutorialController.prototype.onMagicKeyClick = function () {
      var self = this;
      if (!this.active || this.profile !== 'expert' || this.hasShownMagicCard || !this.hasPromptedMagicKey) return;

      setTimeout(function () {
        self._showExpertSkillCardPrompt();
      }, 220);
    };

    TutorialController.prototype.onPlayerAction = function (actionType) {
      if (!this.active) return;
      var gameState = deps.getGameState();
      deps.tutorialUI.clear();
      this._installQuickHelp();
      if (this.profile === 'expert') {
        if (actionType === 'check-call' && this.stepFlow === 'expert-preflop-call') {
          deps.tutorialUI.showMessage(this._isCurrentExpertHand('curse-pressure')
            ? '很好。先把这手牌留住，下一步进入技能阶段后，我会带你看厄运怎样压住对手。'
            : this._isCurrentExpertHand('psyche-convert')
              ? '很好。先把这手牌留住，下一步进入技能阶段后，我会带你看灵视怎样把对手的厄运折回来。'
            : this._isCurrentExpertHand('mental-basics')
              ? '很好。先留在牌局里。翻牌后我们不碰魔运，直接看一次心理战是怎么改变对手倾向的。'
            : this._isCurrentExpertHand('kazu-rino-contrast')
              ? '很好。先把牌局留住。翻牌后我不急着教你按哪个技能，而是先把主手 / 副手这套搭配逻辑讲清楚。'
            : '很好。先把这手牌留住，下一步进入技能阶段后，我会带你看好运如何介入发牌。');
          deps.tutorialUI.setAllowedActions('[data-tutorial-root-only]');
          return;
        }
        if (actionType === 'check-call' && this.stepFlow === 'expert-fortune-call') {
          deps.tutorialUI.showMessage('很好。你已经把“发动好运 → 看结算 → 回到 CALL”这条最小链路走完了。');
        }
        return;
      }

      if (this._isCurrentNoviceHand('intro')) {
        if (actionType === 'check-call') {
          deps.tutorialUI.showMessage(gameState.phase === 'preflop'
            ? '很好。先补齐盲注，下一步我们看翻牌后的公告牌。'
            : '很好。继续推进这一手，重点看公共牌怎样和你的底牌组合。');
        }
        return;
      }

      if (this._isCurrentNoviceHand('ahead')) {
        if (actionType === 'raise') {
          if (gameState.phase === 'preflop' && this.stepFlow === 'ahead-preflop-open') {
            this._showAheadRaiseConfirmStep();
          }
          return;
        }
        if (actionType === 'raise-confirm') {
          deps.tutorialUI.showMessage('很好。顺风局的关键就是先把主动权和底池节奏拿到手里。');
        } else if (actionType === 'check-call') {
          deps.tutorialUI.showMessage(gameState.phase === 'flop'
            ? '很好。先跟一手，看见对手在被你加注后还敢下注，说明他的范围里多少还有点牌。'
            : '很好。这一步先别把局面打得太复杂，把重点放在观察对手后续有没有继续施压。');
        }
        return;
      }

      if (this._isCurrentNoviceHand('behind')) {
        if (actionType === 'fold') {
          deps.tutorialUI.showMessage('很好。逆风时及时弃牌不是保守，而是避免把更多筹码送进去。');
        } else if (actionType === 'check-call') {
          deps.tutorialUI.showMessage('先看翻牌没问题，但如果局面变差，就要准备及时止损。');
        }
      }
    };

    TutorialController.prototype.onStreetDealt = function (phase) {
      if (!this.active) return;
      if (this.profile === 'expert') {
        if (this.expertFreePlay) return;
        if (this._isCurrentExpertHand('mental-basics') &&
            phase === 'flop' &&
            !this.hasShownExpertIntro) {
          this._showExpertIntroPanel();
          return;
        }
        if (this._isCurrentExpertHand('kazu-rino-contrast') &&
            phase === 'flop' &&
            !this.hasShownExpertIntro) {
          this._showExpertIntroPanel();
          return;
        }
        if ((this.currentHandId === 'fortune-intro' || this.currentHandId === 'curse-pressure' || this.currentHandId === 'psyche-convert') &&
            phase === 'flop' && this.hasUsedExpertSkill) {
          this.pendingExpertFlopSummary = true;
          var overlay = document.getElementById('force-pk-overlay');
          var overlayVisible = overlay && overlay.style.display !== 'none';
          if (!overlayVisible) {
            this._showExpertFlopResultStep();
          }
        }
        return;
      }
      var handContent = this._contentForCurrentHand() || {};
      this._installQuickHelp();

      var key = this.currentHandId + ':' + phase;
      if (this.promptedStreets[key]) return;
      this.promptedStreets[key] = true;

      if (this._isCurrentNoviceHand('intro') && phase === 'flop') {
        this.stepFlow = 'intro-flop-board';
        this._showBoardAndHandStep(
          handContent.flopBoardTitle || '翻牌看哪里',
          handContent.flopBoardBody || '',
          '去看下一步',
          'intro-flop-ready'
        );
        return;
      }

      if (this._isCurrentNoviceHand('ahead') && phase === 'flop') {
        this._showBoardAndHandStep(
          handContent.flopBoardTitle || '顺风局为什么舒服',
          handContent.flopBoardBody || '',
          '继续',
          'ahead-flop-ready'
        );
        return;
      }

      if (this._isCurrentNoviceHand('behind') && phase === 'flop') {
        this._showBoardAndHandStep(
          handContent.flopBoardTitle || '逆风局为什么难受',
          handContent.flopBoardBody || '',
          '准备判断',
          'behind-flop-ready'
        );
      }
    };

    TutorialController.prototype.onShowdownResolved = function (payload) {
      if (!this.active) return false;
      if (this.profile === 'expert' && this._isCurrentExpertHand('special-live-match')) {
        if (!payload || !payload.hands || payload.hands.length < 2) return false;

        var expertHeroEntry = payload.hands.find(function (entry) {
          return entry && entry.player && entry.player.type === 'human';
        }) || null;
        var expertVillainEntry = payload.hands.find(function (entry) {
          return entry && entry.player && entry.player.type === 'ai';
        }) || null;
        if (!expertHeroEntry || !expertVillainEntry) return false;

        var expertHeroWon = payload.winnerPlayers.some(function (player) {
          return player && expertHeroEntry.player && player.id === expertHeroEntry.player.id;
        });
        var expertHandContent = this._contentForCurrentHand() || {};
        var expertHeroCardsTarget = deps.getHeroCardsTarget();
        var expertOpponentCardsTarget = deps.getOpponentCardsTarget();
        var expertBoardTarget = deps.getBoardTarget();
        var expertDialogAnchor = expertBoardTarget || expertOpponentCardsTarget || expertHeroCardsTarget;

        deps.tutorialUI.clear();
        this._installQuickHelp();
        deps.tutorialUI.showDialog({
          title: expertHeroWon ? '这一局，你收住了' : '这一局，对面收住了',
          body:
            '公告牌：' + deps.describeCards(payload.board) + '\n' +
            '你的底牌：' + deps.describeCards(expertHeroEntry.player.cards) + ' → ' + expertHeroEntry.hand.descr + '\n' +
            '对手底牌：' + deps.describeCards(expertVillainEntry.player.cards) + ' → ' + expertVillainEntry.hand.descr + '\n' +
            (expertHeroWon
              ? (expertHandContent.showdownWinReason || '这把你赢了。')
              : (expertHandContent.showdownLoseReason || '这把你输了。')),
          anchor: expertDialogAnchor,
          placement: 'left',
          backdrop: false,
          dismissible: true,
          showClose: false,
          dismissText: '进入结算',
          secondaryText: this._getExpertInfoLabel(),
          secondaryAction: this._showExpertGlossaryPanel.bind(this),
          onDismiss: function () {
            deps.tutorialUI.clear();
            deps.callbacks.endGame();
          }
        });
        deps.tutorialUI.highlight([expertBoardTarget, expertHeroCardsTarget, expertOpponentCardsTarget]);
        deps.tutorialUI.setAllowedActions('[data-tutorial-root-only]');
        return true;
      }

      if (this.profile !== 'novice') return false;
      if (!(this._isCurrentNoviceHand('intro') || this._isCurrentNoviceHand('ahead'))) return false;
      if (!payload || !payload.hands || payload.hands.length < 2) return false;

      var heroEntry = payload.hands.find(function (entry) {
        return entry && entry.player && entry.player.type === 'human';
      }) || null;
      var villainEntry = payload.hands.find(function (entry) {
        return entry && entry.player && entry.player.type === 'ai';
      }) || null;
      if (!heroEntry || !villainEntry) return false;

      var heroWon = payload.winnerPlayers.some(function (player) {
        return player && heroEntry.player && player.id === heroEntry.player.id;
      });
      var heroCardsTarget = deps.getHeroCardsTarget();
      var opponentCardsTarget = deps.getOpponentCardsTarget();
      var boardTarget = deps.getBoardTarget();
      var dialogAnchor = boardTarget || opponentCardsTarget || heroCardsTarget;
      var handContent = this._contentForCurrentHand() || {};

      deps.tutorialUI.clear();
      this._installQuickHelp();
      deps.tutorialUI.showDialog({
        title: heroWon ? '摊牌结果：你赢了' : '摊牌结果：你输了',
        body:
          '公告牌：' + deps.describeCards(payload.board) + '\n' +
          '你的底牌：' + deps.describeCards(heroEntry.player.cards) + ' → ' + heroEntry.hand.descr + '\n' +
          '对手底牌：' + deps.describeCards(villainEntry.player.cards) + ' → ' + villainEntry.hand.descr + '\n' +
          (heroWon
            ? (handContent.showdownWinReason || '这一手你赢了。')
            : (handContent.showdownLoseReason || '这一手你输了。')),
        anchor: dialogAnchor,
        placement: 'left',
        backdrop: false,
        dismissible: true,
        showClose: false,
        dismissText: '进入结算',
        secondaryText: '牌型说明',
        secondaryAction: this._showNoviceBasicsPanel.bind(this),
        onDismiss: function () {
          deps.tutorialUI.clear();
          deps.callbacks.endGame();
        }
      });
      deps.tutorialUI.highlight([boardTarget, heroCardsTarget, opponentCardsTarget]);
      deps.tutorialUI.setAllowedActions('[data-tutorial-root-only]');
      return true;
    };

    TutorialController.prototype.decorateEndhandModal = function () {
      var refs = deps.refs || {};
      if (!this.active || !refs.endhandTitle || !refs.endhandContinue) return;
      var hand = this._getCurrentHandMeta();
      if (!hand) return;
      var index = deps.getCurrentTutorialHandIndex();
      var hands = deps.getTutorialHands();
      var handLabel = hand.title || ('第 ' + (index + 1) + ' 局');
      var summary = hand.endSummary || '';

      refs.endhandTitle.textContent = '第 ' + (index + 1) + ' / ' + Math.max(1, hands.length) + ' 局完成 · ' + handLabel;
      if (summary && refs.endhandResult) {
        refs.endhandResult.textContent = (refs.endhandResult.textContent || '') + '\n\n教学重点：' + summary;
      }
      refs.endhandContinue.textContent = index < hands.length - 1 ? '继续下一局' : '返回课程页';
    };

    TutorialController.prototype.handleContinue = function () {
      if (!this.active) return false;
      var tutorial = deps.getTutorialConfig();
      var hands = deps.getTutorialHands();
      if (!tutorial || hands.length === 0) return false;

      if (deps.getCurrentTutorialHandIndex() < hands.length - 1) {
        tutorial.currentHandIndex = deps.getCurrentTutorialHandIndex() + 1;
      } else {
        if (deps.callbacks && typeof deps.callbacks.openTutorialMenu === 'function' &&
            deps.callbacks.openTutorialMenu()) {
          return true;
        }
        tutorial.currentHandIndex = 0;
      }
      tutorial.step = Number(tutorial.currentHandIndex || 0) + 1;
      tutorial.lesson = (hands[tutorial.currentHandIndex] && hands[tutorial.currentHandIndex].lesson) || tutorial.lesson;
      deps.callbacks.startNewGame(true);
      return true;
    };

    TutorialController.prototype.resetProgress = function () {
      var tutorial = deps.getTutorialConfig();
      if (!tutorial) return;
      tutorial.currentHandIndex = 0;
      tutorial.step = 1;
    };

    TutorialController.prototype.onSkillPhaseEntered = function () {
      if (!this.active || this.profile !== 'expert') return;
      this.isExpertSkillPhaseActive = true;
      this._installQuickHelp();
      if ((this.currentHandId === 'fortune-intro' || this.currentHandId === 'curse-pressure' || this.currentHandId === 'psyche-convert') &&
          !this.hasShownExpertIntro) {
        this._showExpertIntroPanel();
      }
    };

    TutorialController.prototype.onSkillLog = function (type, data) {
      if (!this.active || this.profile !== 'expert' || type !== 'SKILL_USE') return;
      if (!(this.currentHandId === 'fortune-intro' || this.currentHandId === 'curse-pressure' || this.currentHandId === 'psyche-convert')) return;
      if (!this.isExpertSkillPhaseActive) return;
      if (!this.hasPromptedMagicKey &&
          this.stepFlow !== 'expert-fortune-card' &&
          this.stepFlow !== 'expert-curse-card' &&
          this.stepFlow !== 'expert-psyche-card') return;
      if (!data) return;
      var skillKey = data.skillKey || '';
      if (!skillKey && this._isCurrentExpertHand('psyche-convert')) {
        if (data.skill === '折射') skillKey = 'refraction';
        else if (data.skill === '真理') skillKey = 'axiom';
        else if (data.skill === '澄澈') skillKey = 'clarity';
      }
      if (!skillKey) return;
      var validSkillKeys = this._isCurrentExpertHand('curse-pressure')
        ? ['hex', 'havoc', 'catastrophe']
        : this._isCurrentExpertHand('psyche-convert')
          ? ['refraction', 'axiom', 'clarity']
          : ['minor_wish', 'grand_wish', 'divine_order'];
      if (validSkillKeys.indexOf(skillKey) < 0) return;
      if (this.hasUsedExpertSkill) return;

      this.hasUsedExpertSkill = true;
      if (this._isCurrentExpertHand('psyche-convert') && document.querySelector('.peek-result-overlay')) {
        this._showExpertPeekDismissStep();
        return;
      }
      this._showExpertProceedStep();
    };

    TutorialController.prototype.onSkillMessage = function (msg) {
      if (!this.active || this.profile !== 'expert' || !this._isCurrentExpertHand('psyche-convert')) return;
      if (!msg) return;
      if (String(msg).indexOf('选择守护目标') >= 0 && !this.hasShownExpertProtectPrompt) {
        this._showExpertPsycheProtectStep();
        return;
      }
      if (String(msg).indexOf('选择透视目标') >= 0 && !this.hasShownExpertPeekPrompt) {
        this._showExpertPsychePeekStep();
      }
    };

    TutorialController.prototype.onMentalToggle = function () {
      if (!this.active || this.profile !== 'expert') return;
      if (!this._isCurrentExpertHand('mental-basics')) return;
      if (this.stepFlow !== 'expert-mental-open') return;
      this._showExpertMentalSkillStep();
    };

    TutorialController.prototype.onMentalApplied = function (payload) {
      if (!this.active || this.profile !== 'expert') return;
      if (!this._isCurrentExpertHand('mental-basics')) return;
      if (this.expertFreePlay || this.hasShownMentalResult) return;
      if (!payload || payload.skillKey !== 'presence') return;
      this.hasShownMentalResult = true;
      this._showExpertMentalResultStep(payload);
    };

    TutorialController.prototype.onForcePanelShown = function (meta) {
      if (!this.active || this.profile !== 'expert') return;
      if (this.expertFreePlay) return;
      if (!(this.currentHandId === 'fortune-intro' || this.currentHandId === 'curse-pressure' || this.currentHandId === 'psyche-convert')) return;
      if (!this.hasUsedExpertSkill || this.hasShownExpertForcePanel) return;
      this.expertForceMeta = meta || null;
      var overlay = document.getElementById('force-pk-overlay');
      var selectedCell = overlay ? overlay.querySelector('.fpk-row.is-selected .fpk-cell-card') : null;
      if (selectedCell) {
        this.expertResolvedCardCode = selectedCell.textContent.replace(/\s+/g, '');
      }
      var self = this;
      setTimeout(function () {
        self._showExpertForcePanelGuide(0);
      }, 60);
    };

    TutorialController.prototype.onSkillProceed = function () {
      if (!this.active || this.profile !== 'expert') return;
      if (!(this.currentHandId === 'fortune-intro' || this.currentHandId === 'curse-pressure' || this.currentHandId === 'psyche-convert')) return;
      if (!this.hasUsedExpertSkill) return;

      this.stepFlow = this._isCurrentExpertHand('curse-pressure')
        ? 'expert-curse-resolving'
        : this._isCurrentExpertHand('psyche-convert')
          ? 'expert-psyche-resolving'
        : 'expert-fortune-resolving';
      deps.tutorialUI.clear();
      this._installQuickHelp();
      deps.tutorialUI.showMessage(this._isCurrentExpertHand('curse-pressure')
        ? '正在结算这次厄运，接下来会显示命运结算面板。'
        : this._isCurrentExpertHand('psyche-convert')
          ? '正在结算这次灵视反制，接下来会显示命运结算面板。'
        : '正在结算这次好运，接下来会显示命运结算面板。');
    };

    TutorialController.prototype.onForcePanelDismissed = function () {
      if (!this.active || this.profile !== 'expert') return;
      if (!(this.currentHandId === 'fortune-intro' || this.currentHandId === 'curse-pressure' || this.currentHandId === 'psyche-convert')) return;
      if (!this.hasUsedExpertSkill) return;

      this.isExpertSkillPhaseActive = false;
      if (this.pendingExpertFlopSummary) {
        this._showExpertFlopResultStep();
        return;
      }
      this.stepFlow = this._isCurrentExpertHand('curse-pressure')
        ? 'expert-curse-force-ready'
        : this._isCurrentExpertHand('psyche-convert')
          ? 'expert-psyche-force-ready'
        : 'expert-fortune-force-ready';
      deps.tutorialUI.clear();
      this._installQuickHelp();
    };

    return new TutorialController();
  };
})(window);
