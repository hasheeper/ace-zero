(function(global) {
  'use strict';

  const sharedCore = global.AceMahjongFormalRuntimeSharedCore;

  if (!sharedCore || typeof sharedCore.createFormalRuntimeCore !== 'function') {
    throw new Error('AceMahjongFormalRuntimeSharedCore is required before browser-formal-runtime-factory.js');
  }

  const {
    clone,
    aiApi,
    getRiichiChoices,
    getKanChoices,
    createRiichiAction,
    createKitaAction,
    isKitaEnabled,
    countTileInHand,
    buildExhaustiveDrawResultOptions,
    inferActionType,
    normalizeActionPayload,
    chooseAutoDiscardDecision,
    createFormalRuntimeCore
  } = sharedCore;
  const browserMajiang = global.Majiang || null;

  function createFormalBrowserRuntime(config = {}) {
    const AI_REACTION_AFTER_DISCARD_DELAY = 720;
    const runtime = createFormalRuntimeCore(config);
    runtime.pendingAutoResumeIndex = null;
    runtime.reactionDecisionState = null;
    runtime.isResolvingReactionDecision = false;
    runtime.selfActionSelectionResolved = false;
    runtime.postDiscardReactionTimer = 0;
    runtime.pendingExhaustiveDraw = null;
    const runtimeLogger = global.AceMahjongDevLog && typeof global.AceMahjongDevLog.createScope === 'function'
      ? global.AceMahjongDevLog.createScope('runtime')
      : null;
    runtime.aiController = aiApi && typeof aiApi.createAiController === 'function'
      ? aiApi.createAiController(runtime, {
          ai: config.ai && typeof config.ai === 'object' ? config.ai : {},
          players: Array.isArray(config.players) ? config.players.slice() : []
        })
      : null;

    function logRuntime(level, message, detail) {
      if (!runtimeLogger || typeof runtimeLogger[level] !== 'function') return;
      runtimeLogger[level](message, detail);
    }

    function dispatchActionSafely(action, contextLabel) {
      try {
        return runtime.dispatch(action);
      } catch (error) {
        logRuntime('error', '浏览器 formal runtime 动作执行失败', {
          context: contextLabel || 'runtime-dispatch',
          actionKey: action && action.key ? action.key : null,
          actionType: action && action.type ? action.type : null,
          seat: action && action.payload && action.payload.seat ? action.payload.seat : null,
          message: error && error.message ? error.message : String(error)
        });
        if (typeof runtime.refreshActionWindow === 'function') {
          try {
            runtime.refreshActionWindow();
          } catch (refreshError) {
            logRuntime('warn', '动作执行失败后刷新 action window 也失败', {
              context: contextLabel || 'runtime-dispatch',
              message: refreshError && refreshError.message ? refreshError.message : String(refreshError)
            });
          }
        }
        return runtime.getSnapshot();
      }
    }

    function clearReactionDecisionState() {
      runtime.reactionDecisionState = null;
    }

    function clearPostDiscardReactionTimer() {
      if (!runtime.postDiscardReactionTimer) return;
      window.clearTimeout(runtime.postDiscardReactionTimer);
      runtime.postDiscardReactionTimer = 0;
    }

    function scheduleAiReactionAfterDiscard(callback) {
      clearPostDiscardReactionTimer();
      runtime.postDiscardReactionTimer = window.setTimeout(() => {
        runtime.postDiscardReactionTimer = 0;
        if (typeof callback === 'function') callback();
      }, AI_REACTION_AFTER_DISCARD_DELAY);
    }

    function isBottomInteractionPhase(snapshot = runtime.getSnapshot()) {
      if (!snapshot) return false;
      if (runtime.pendingExhaustiveDraw && snapshot.phase === 'await_resolution') {
        return true;
      }
      if (snapshot.phase === 'await_reaction') {
        return Boolean(runtime.pendingReaction && collectSeatReactionActions('bottom').length);
      }
      return snapshot.phase === 'await_discard' && snapshot.turnSeat === 'bottom';
    }

    function resumeAutoRoundIfNeeded(snapshot) {
      if (runtime.isApplyingStartupScript) return snapshot;
      if (!snapshot) return snapshot;

      if (snapshot.phase === 'await_draw' && Number.isInteger(runtime.pendingAutoResumeIndex)) {
        continueAutoRoundFrom(runtime.pendingAutoResumeIndex);
        return snapshot;
      }

      if (snapshot.phase === 'await_draw' && runtime.turnSeat === 'bottom' && !runtime.pendingReaction) {
        runtime.beginBottomTurn();
        return runtime.getSnapshot();
      }

      if (snapshot.phase === 'await_draw' && runtime.turnSeat && runtime.turnSeat !== 'bottom' && !runtime.pendingReaction) {
        const aiSeats = runtime.activeSeats.filter((seatKey) => seatKey !== 'bottom');
        const currentIndex = aiSeats.indexOf(runtime.turnSeat);
        continueAutoRoundFrom(currentIndex >= 0 ? currentIndex : 0);
        return snapshot;
      }

      if (snapshot.phase === 'await_discard' && runtime.turnSeat && runtime.turnSeat !== 'bottom') {
        const aiSeats = runtime.activeSeats.filter((seatKey) => seatKey !== 'bottom');
        const currentIndex = aiSeats.indexOf(runtime.turnSeat);
        continueAutoRoundFrom(currentIndex >= 0 ? currentIndex : 0);
      }

      return snapshot;
    }

    function expandStartupActions(actions = []) {
      const expanded = [];
      actions.forEach((entry) => {
        if (!entry || typeof entry !== 'object') return;
        const repeat = Number.isInteger(entry.repeat) && entry.repeat > 1 ? entry.repeat : 1;
        const action = entry.action && typeof entry.action === 'object'
          ? entry.action
          : entry;
        for (let index = 0; index < repeat; index += 1) {
          expanded.push(clone(action));
        }
      });
      return expanded;
    }

    function runStartupActions() {
      const testing = runtime.testing && typeof runtime.testing === 'object' ? runtime.testing : {};
      const actions = expandStartupActions(testing.fastForwardActions);
      if (!actions.length) return runtime.getSnapshot();

      logRuntime('info', '开始执行启动测试脚本', {
        count: actions.length,
        actions: actions.map((action) => ({
          key: action && action.key ? action.key : null,
          type: action && action.type ? action.type : null,
          payload: action && action.payload ? clone(action.payload) : {}
        }))
      });

      runtime.isApplyingStartupScript = true;
      try {
        actions.forEach((action) => {
          logRuntime('debug', '执行启动动作', {
            key: action && action.key ? action.key : null,
            type: action && action.type ? action.type : null,
            payload: action && action.payload ? clone(action.payload) : {}
          });
          dispatchActionSafely(action, 'startup-script');
        });
      } finally {
        runtime.isApplyingStartupScript = false;
      }

      runtime.refreshActionWindow();
      return runtime.getSnapshot();
    }

    function inferKanType(meldString) {
      const normalized = typeof meldString === 'string' ? meldString : '';
      if (/\d{3}[\+\=\-]\d$/.test(normalized)) return 'kan-added';
      if (/[\+\=\-]/.test(normalized)) return 'kan-open';
      return 'kan-concealed';
    }

    function createBottomTsumoAction(seatKey) {
      return {
        type: 'hule',
        key: `hule:${seatKey}:self`,
        label: '自摸',
        group: 'special',
        priority: 120,
        bgChar: '和',
        variant: 'alert-red',
        textLayout: 'len-2',
        row: 0,
        payload: {
          seat: seatKey
        }
      };
    }

    function createRiichiCancelAction() {
      return {
        type: 'ui-action',
        key: 'pass:self-turn',
        label: '过',
        group: 'special',
        priority: 80,
        bgChar: '过',
        variant: 'skip',
        row: 0,
        payload: {
          actionKey: 'pass:self-turn'
        }
      };
    }

    function createBottomKitaAction(seatKey) {
      const seatIndex = runtime.getSeatIndex(seatKey);
      const shoupai = seatIndex >= 0 && runtime.board && Array.isArray(runtime.board.shoupai)
        ? runtime.board.shoupai[seatIndex]
        : null;
      const kitaCount = Math.max(1, countTileInHand(shoupai, 'z4'));
      const baseAction = createKitaAction(seatKey);
      return {
        ...baseAction,
        payload: {
          ...(baseAction && baseAction.payload ? baseAction.payload : {}),
          seat: seatKey,
          preview: {
            handTileCodes: Array.from({ length: kitaCount }, () => 'z4')
          }
        }
      };
    }

    function canDeclareKita(runtime, seatKey) {
      if (!isKitaEnabled(runtime)) return false;
      if (!seatKey || seatKey !== runtime.turnSeat) return false;
      if (runtime.phase !== 'await_discard') return false;
      const seatIndex = runtime.getSeatIndex(seatKey);
      if (seatIndex < 0) return false;
      const seatRiichiState = runtime.riichiState && runtime.riichiState[seatKey]
        ? runtime.riichiState[seatKey]
        : null;
      if (seatRiichiState && seatRiichiState.declared) return false;
      const seatMeta = runtime.seatMeta && runtime.seatMeta[seatKey] ? runtime.seatMeta[seatKey] : null;
      if (seatMeta && Array.isArray(seatMeta.kitaTiles) && seatMeta.kitaTiles.length >= 4) return false;
      if (runtime.wallService && typeof runtime.wallService.canDrawSupplementTile === 'function' && !runtime.wallService.canDrawSupplementTile()) {
        return false;
      }
      const shoupai = runtime.board && Array.isArray(runtime.board.shoupai) ? runtime.board.shoupai[seatIndex] : null;
      return countTileInHand(shoupai, 'z4') > 0;
    }

    runtime.canDeclareKita = function(seatKey) {
      return canDeclareKita(runtime, seatKey);
    };

    function createBottomNineKindsDrawAction(seatKey, seatIndex) {
      const revealedHands = ['', '', '', ''];
      const shoupai = runtime.board && runtime.board.shoupai ? runtime.board.shoupai[seatIndex] : null;
      if (shoupai) {
        revealedHands[seatIndex] = shoupai.toString();
      }
      return {
        type: 'pingju',
        key: `pingju:${seatKey}:nine-kinds`,
        label: '九种九牌',
        group: 'special',
        priority: 110,
        bgChar: '流',
        variant: 'alert',
        textLayout: 'len-4',
        row: 0,
        payload: {
          seat: seatKey,
          reason: '九種九牌',
          revealedHands
        }
      };
    }

    function createBottomNoDaopaiAction(seatKey) {
      return {
        type: 'no-daopai',
        key: `no-daopai:${seatKey}`,
        label: '听牌',
        group: 'special',
        priority: 105,
        bgChar: '听',
        variant: 'alert',
        textLayout: 'len-2',
        row: 0,
        payload: {
          seat: seatKey
        }
      };
    }

    function createNoDaopaiPassAction() {
      return {
        type: 'ui-action',
        key: 'pass:no-daopai',
        label: '跳过',
        group: 'special',
        priority: 80,
        bgChar: '过',
        variant: 'skip',
        row: 0,
        payload: {
          actionKey: 'pass:no-daopai'
        }
      };
    }

    function canBottomSelfHule(seatIndex) {
      if (!browserMajiang || !browserMajiang.Game) return false;
      const shoupai = runtime.board.shoupai[seatIndex];
      if (!shoupai || !shoupai._zimo) return false;
      const seatKey = runtime.getSeatKeyByIndex ? runtime.getSeatKeyByIndex(seatIndex) : 'bottom';
      return typeof runtime.canSeatHule === 'function'
        ? runtime.canSeatHule(seatKey, {
            shoupai,
            seatIndex,
            selfDraw: true
          })
        : false;
    }

    function createBottomKanActions(seatKey, seatIndex) {
      const kanChoices = getKanChoices(runtime, seatIndex);
      const groupedCounts = kanChoices.reduce((counts, meldString) => {
        const kanType = inferKanType(meldString);
        counts.set(kanType, (counts.get(kanType) || 0) + 1);
        return counts;
      }, new Map());
      const groupedIndex = new Map();

      return kanChoices.map((meldString, index) => {
        const kanType = inferKanType(meldString);
        const nextIndex = (groupedIndex.get(kanType) || 0) + 1;
        groupedIndex.set(kanType, nextIndex);
        const suffixNeeded = (groupedCounts.get(kanType) || 0) > 1;
        const typeLabel = kanType === 'kan-added'
          ? '加杠'
          : (kanType === 'kan-concealed' ? '暗杠' : '大明杠');
        return {
          type: 'kan',
          key: `kan:${seatKey}:self:${index}`,
          label: suffixNeeded ? `${typeLabel}${nextIndex}` : typeLabel,
          group: 'special',
          priority: 90,
          bgChar: '杠',
          variant: kanType === 'kan-added' ? 'alert' : 'default',
          row: 0,
          payload: {
            seat: seatKey,
            meld: meldString,
            meldString,
            kanType
          }
        };
      });
    }

    function sortReactionDecisions(actions = []) {
      return actions.slice().sort((left, right) => {
        const priorityDiff = Number(right.priority || 0) - Number(left.priority || 0);
        if (priorityDiff !== 0) return priorityDiff;
        const orderDiff = Number(left.reactionOrder || 0) - Number(right.reactionOrder || 0);
        if (orderDiff !== 0) return orderDiff;
        return String(left.key || '').localeCompare(String(right.key || ''));
      });
    }

    function chooseTopReactionDecisions(actions = []) {
      const sorted = sortReactionDecisions(actions).filter(Boolean);
      if (!sorted.length) return [];
      const highestPriority = Number(sorted[0].priority || 0);
      if (sorted[0].type === 'hule') {
        return sorted.filter((action) => (
          action
          && action.type === 'hule'
          && Number(action.priority || 0) === highestPriority
        ));
      }
      return [sorted[0]];
    }

    function collectSeatReactionActions(seatKey) {
      if (!runtime.pendingReaction || !Array.isArray(runtime.pendingReaction.actions)) return [];
      return runtime.pendingReaction.actions.filter((action) => (
        action
        && action.type !== 'pass'
        && action.payload
        && action.payload.seat === seatKey
      ));
    }

    function collectAiReactionDecisions() {
      if (!runtime.pendingReaction || !Array.isArray(runtime.pendingReaction.actions)) return [];
      const aiSeats = Array.from(new Set(
        runtime.pendingReaction.actions
          .filter((action) => action && action.payload && action.payload.seat && action.payload.seat !== 'bottom')
          .map((action) => action.payload.seat)
      ));

      const decisions = [];
      aiSeats.forEach((seatKey) => {
        const seatActions = collectSeatReactionActions(seatKey);
        if (!seatActions.length) return;
        const decision = runtime.chooseAutoReaction(seatKey, seatActions);
        if (decision && decision.type && decision.type !== 'pass') {
          decisions.push(decision);
        }
      });
      return decisions;
    }

    function finalizeReactionDecisions(bottomDecision = null, reason = 'manual-pass') {
      if (!runtime.pendingReaction || !Array.isArray(runtime.pendingReaction.actions)) {
        clearReactionDecisionState();
        return runtime.getSnapshot();
      }

      const session = runtime.reactionDecisionState;
      const candidateActions = [];
      if (session && Array.isArray(session.aiDecisions)) {
        session.aiDecisions.forEach((action) => {
          if (!action || !action.key) return;
          const stillAvailable = runtime.pendingReaction.actions.some((current) => current && current.key === action.key);
          if (stillAvailable) candidateActions.push(action);
        });
      }
      if (bottomDecision && bottomDecision.key) {
        const stillAvailable = runtime.pendingReaction.actions.some((current) => current && current.key === bottomDecision.key);
        if (stillAvailable) candidateActions.push(bottomDecision);
      }

      clearReactionDecisionState();
      const chosenActions = chooseTopReactionDecisions(candidateActions);
      if (chosenActions.length) {
        let snapshot = runtime.getSnapshot();
        runtime.isResolvingReactionDecision = true;
        try {
          chosenActions.forEach((action) => {
            snapshot = dispatchActionSafely(action, 'finalize-reaction-decisions');
          });
        } finally {
          runtime.isResolvingReactionDecision = false;
        }
        return resumeAutoRoundIfNeeded(snapshot);
      }

      const seatKeys = Array.from(new Set(
        runtime.pendingReaction.actions
          .filter((action) => action && action.payload && action.payload.seat)
          .map((action) => action.payload.seat)
      ));
      let snapshot = runtime.getSnapshot();
      seatKeys.forEach((seatKey) => {
        if (!runtime.pendingReaction) return;
        snapshot = runtime.passReaction(seatKey, { reason });
      });
      return resumeAutoRoundIfNeeded(snapshot);
    }

    function startPlayerReactionSession() {
      if (!runtime.pendingReaction || !Array.isArray(runtime.pendingReaction.actions)) return false;
      const bottomActions = collectSeatReactionActions('bottom');
      if (!bottomActions.length) return false;

      const aiDecisions = collectAiReactionDecisions();
      clearReactionDecisionState();
      runtime.reactionDecisionState = {
        aiDecisions
      };
      runtime.refreshActionWindow();
      return true;
    }

    function resolvePendingAiOnlyReactions(options = {}) {
      if (!runtime.pendingReaction || !Array.isArray(runtime.pendingReaction.actions)) {
        const emptySnapshot = runtime.getSnapshot();
        if (typeof options.onResolved === 'function') options.onResolved(emptySnapshot);
        return emptySnapshot;
      }
      if (collectSeatReactionActions('bottom').length) {
        logRuntime('debug', '反应窗口包含底家动作，切换到玩家反应会话', {
          actions: runtime.pendingReaction.actions.map((action) => action && action.key).filter(Boolean)
        });
        startPlayerReactionSession();
        const playerSnapshot = runtime.getSnapshot();
        if (typeof options.onResolved === 'function') options.onResolved(playerSnapshot);
        return playerSnapshot;
      }

      const aiSeats = Array.from(new Set(
        runtime.pendingReaction.actions
          .filter((action) => action && action.payload && action.payload.seat && action.payload.seat !== 'bottom')
          .map((action) => action.payload.seat)
      ));

      const decisions = [];
      aiSeats.forEach((seatKey) => {
        if (!runtime.pendingReaction || !Array.isArray(runtime.pendingReaction.actions)) return;
        const seatActions = collectSeatReactionActions(seatKey);
        if (!seatActions.length) return;

        const decision = runtime.chooseAutoReaction(seatKey, seatActions);
        if (decision && decision.type && decision.type !== 'pass') {
          decisions.push(decision);
          logRuntime('info', 'AI 选择反应动作', {
            seat: seatKey,
            decisionKey: decision.key || null,
            decisionType: decision.type || null,
            availableActions: seatActions.map((action) => action.key)
          });
          return;
        }

        logRuntime('debug', 'AI 放弃反应动作', {
          seat: seatKey,
          availableActions: seatActions.map((action) => action.key)
        });
      });

      if (!decisions.length && aiSeats.length) {
        let snapshot = runtime.getSnapshot();
        aiSeats.forEach((seatKey) => {
          if (!runtime.pendingReaction) return;
          snapshot = runtime.passReaction(seatKey, { reason: 'easy-ai-auto-pass' });
        });
        if (typeof options.onResolved === 'function') options.onResolved(snapshot);
        return snapshot;
      }

      const chosenActions = chooseTopReactionDecisions(decisions);
      if (chosenActions.length) {
        const dispatchChosenActions = () => {
          let snapshot = runtime.getSnapshot();
          chosenActions.forEach((action) => {
            snapshot = dispatchActionSafely(action, 'resolve-ai-only-reactions');
          });
          if (typeof options.onResolved === 'function') options.onResolved(snapshot);
          return snapshot;
        };

        const table = global.AceZeroMahjongUI && global.AceZeroMahjongUI.table
          ? global.AceZeroMahjongUI.table
          : null;
        const primaryAction = chosenActions[0] || null;
        const primaryActionType = primaryAction ? inferActionType(primaryAction) : null;
        const shouldAnimateMeldCapture = Boolean(options.animateMeldCapture)
          && chosenActions.length === 1
          && (primaryActionType === 'call' || primaryActionType === 'kan' || primaryActionType === 'gang')
          && primaryAction
          && primaryAction.payload
          && primaryAction.payload.preview
          && table
          && typeof table.animateReactionMeldCapture === 'function';

        if (shouldAnimateMeldCapture) {
          table.animateReactionMeldCapture(primaryAction, () => {
            dispatchChosenActions();
          });
          return runtime.getSnapshot();
        }

        return dispatchChosenActions();
      }

      aiSeats.forEach((seatKey) => {
        if (!runtime.pendingReaction || !Array.isArray(runtime.pendingReaction.actions)) return;
        if (!collectSeatReactionActions(seatKey).length) return;
        runtime.passReaction(seatKey, { reason: 'auto-pass-ai' });
      });

      const passSnapshot = runtime.getSnapshot();
      if (typeof options.onResolved === 'function') options.onResolved(passSnapshot);
      return passSnapshot;
    }

    function advanceAfterStateChange(snapshot) {
      const currentSnapshot = snapshot || runtime.getSnapshot();
      runtime.refreshActionWindow();

      if (runtime.pendingReaction) {
        return currentSnapshot;
      }

      if (isBottomInteractionPhase(currentSnapshot)) {
        return currentSnapshot;
      }

      if (currentSnapshot.phase === 'round_end') {
        return currentSnapshot;
      }

      if ((currentSnapshot.phase === 'await_draw' || currentSnapshot.phase === 'await_discard')
        && runtime.turnSeat
        && runtime.turnSeat !== 'bottom') {
        return resumeAutoRoundIfNeeded(currentSnapshot);
      }

      return currentSnapshot;
    }

    function continueAutoRoundFrom(index) {
      runtime.clearAutoTurnTimer();
      const seats = runtime.activeSeats.filter((seatKey) => seatKey !== 'bottom');
      const stepDelay = 1220;
      const drawToDiscardDelay = 980;

      const scheduleAiDiscardTurn = (seatKey, nextStepIndex) => {
        const scheduleSelfTurnContinue = () => {
          runtime.autoTurnTimer = window.setTimeout(() => {
            if (typeof runtime.canDeclareKita === 'function' && runtime.canDeclareKita(seatKey)) {
              runtime.declareKita(seatKey, { source: 'runtime-ai-kita' });
              runtime.refreshActionWindow();
              scheduleAiDiscardTurn(seatKey, nextStepIndex);
              return;
            }
            const discardDecision = runtime.chooseAutoDiscard(seatKey);
            if (!discardDecision || typeof discardDecision.tileCode !== 'string') {
              logRuntime('info', 'AI 接口模式：未提供弃牌决策，自动流程暂停', {
                seat: seatKey,
                decision: discardDecision ? clone(discardDecision) : null
              });
              runtime.clearAutoTurnTimer();
              runtime.pendingAutoResumeIndex = nextStepIndex;
              return;
            }
            const discardIndex = Number.isInteger(discardDecision.tileIndex) ? discardDecision.tileIndex : 0;
            const discardCode = discardDecision.tileCode;
            const table = global.AceZeroMahjongUI && global.AceZeroMahjongUI.table;

            logRuntime('info', 'AI 选择弃牌', {
              seat: seatKey,
              tileIndex: discardIndex,
              tileCode: discardCode,
              shouldRiichi: Boolean(discardDecision && discardDecision.shouldRiichi),
              decision: discardDecision ? clone(discardDecision) : null
            });

            const proceedDiscard = () => {
              const discardSnapshot = runtime.discardTile(
                seatKey,
                discardCode,
                { riichi: Boolean(discardDecision && discardDecision.shouldRiichi) }
              );
              runtime.refreshActionWindow();
              if (!runtime.pendingReaction || collectSeatReactionActions('bottom').length) {
                const progressedSnapshot = advanceAfterStateChange(runtime.getSnapshot() || discardSnapshot);
                const remainsAiDriven = runtime.pendingReaction
                  || isBottomInteractionPhase(progressedSnapshot)
                  || progressedSnapshot.phase === 'round_end'
                  || ((progressedSnapshot.phase === 'await_draw' || progressedSnapshot.phase === 'await_discard')
                    && runtime.turnSeat
                    && runtime.turnSeat !== 'bottom');
                if (!remainsAiDriven) {
                  runtime.autoTurnTimer = window.setTimeout(() => runStep(nextStepIndex), stepDelay);
                }
                return;
              }
              scheduleAiReactionAfterDiscard(() => {
                resolveNonBottomAiReactions({
                  animateMeldCapture: true,
                  onResolved(reactionSnapshot) {
                    const progressedSnapshot = advanceAfterStateChange(reactionSnapshot || discardSnapshot);
                    const remainsAiDriven = runtime.pendingReaction
                      || isBottomInteractionPhase(progressedSnapshot)
                      || progressedSnapshot.phase === 'round_end'
                      || ((progressedSnapshot.phase === 'await_draw' || progressedSnapshot.phase === 'await_discard')
                        && runtime.turnSeat
                        && runtime.turnSeat !== 'bottom');
                    if (!remainsAiDriven) {
                      runtime.autoTurnTimer = window.setTimeout(() => runStep(nextStepIndex), stepDelay);
                    }
                  }
                });
              });
            };

            if (table && typeof table.animateSeatHandDiscard === 'function') {
              table.animateSeatHandDiscard(seatKey, discardIndex, proceedDiscard);
              return;
            }
            proceedDiscard();
          }, drawToDiscardDelay);
        };

        scheduleSelfTurnContinue();
      };

      const resolveNonBottomAiReactions = (options) => resolvePendingAiOnlyReactions(options);

      const runStep = (stepIndex) => {
        runtime.pendingAutoResumeIndex = null;

        const reactionSnapshot = resolveNonBottomAiReactions();
        if (runtime.pendingReaction || isBottomInteractionPhase(reactionSnapshot)) {
          runtime.pendingAutoResumeIndex = stepIndex;
          advanceAfterStateChange(reactionSnapshot);
          return;
        }

        if (reactionSnapshot.phase === 'await_draw'
          && runtime.turnSeat
          && runtime.turnSeat !== 'bottom') {
          const drawSeat = runtime.turnSeat;
          const drawSeatIndex = seats.indexOf(drawSeat);
          runtime.drawForSeat(drawSeat);
          scheduleAiDiscardTurn(drawSeat, drawSeatIndex >= 0 ? drawSeatIndex + 1 : stepIndex);
          return;
        }

        if (reactionSnapshot.phase === 'await_discard'
          && runtime.turnSeat
          && runtime.turnSeat !== 'bottom') {
          const reactionSeat = runtime.turnSeat;
          const reactionSeatIndex = seats.indexOf(reactionSeat);
          scheduleAiDiscardTurn(reactionSeat, reactionSeatIndex >= 0 ? reactionSeatIndex + 1 : stepIndex);
          return;
        }

        if (reactionSnapshot.phase === 'round_end') return;

        if (stepIndex >= seats.length) {
          runtime.beginBottomTurn();
          return;
        }

        const seatKey = seats[stepIndex];
        runtime.drawForSeat(seatKey);
        scheduleAiDiscardTurn(seatKey, stepIndex + 1);
      };

      runtime.autoTurnTimer = window.setTimeout(() => runStep(index), stepDelay);
    }

    runtime.refreshActionWindow = function() {
      if (runtime.pendingExhaustiveDraw) {
        return runtime.setActionWindow({
          visible: true,
          layout: 'single',
          actions: [
            createBottomNoDaopaiAction('bottom'),
            createNoDaopaiPassAction()
          ],
          activeActionKey: null
        });
      }

      if (runtime.pendingReaction && Array.isArray(runtime.pendingReaction.actions)) {
        const bottomActions = runtime.pendingReaction.actions.filter((action) => (
          action.payload
          && action.payload.seat === 'bottom'
        ));
        return runtime.setActionWindow({
          visible: bottomActions.length > 0,
          layout: 'reaction',
          actions: bottomActions,
          activeActionKey: null
        });
      }

      const bottomIndex = runtime.getSeatIndex('bottom');
      const bottomSeat = bottomIndex >= 0 && runtime.board && runtime.board.shoupai
        ? runtime.board.shoupai[bottomIndex]
        : null;
      const isBottomDiscardPhase = bottomIndex >= 0
        && runtime.phase === 'await_discard'
        && runtime.turnSeat === 'bottom'
        && runtime.board.lunban === bottomIndex;
      const hasDrawnTile = Boolean(bottomSeat && bottomSeat._zimo);

      if (!isBottomDiscardPhase) {
        runtime.pendingRiichi = false;
        runtime.selfActionSelectionResolved = false;
        return runtime.setActionWindow({
          visible: false,
          layout: 'single',
          actions: [],
          activeActionKey: null
        });
      }

      if (runtime.selfActionSelectionResolved) {
        return runtime.setActionWindow({
          visible: false,
          layout: 'single',
          actions: [],
          activeActionKey: null
        });
      }

      const riichiChoices = getRiichiChoices(runtime, bottomIndex);
      const actions = [];

      if (hasDrawnTile && canBottomSelfHule(bottomIndex)) {
        actions.push(createBottomTsumoAction('bottom'));
      }

      if (hasDrawnTile) {
        actions.push(...createBottomKanActions('bottom', bottomIndex));
      }
      if (hasDrawnTile && runtime.canDeclareKita('bottom')) {
        actions.push(createBottomKitaAction('bottom'));
      }
      if (hasDrawnTile && typeof runtime.canDeclareNineKindsDraw === 'function' && runtime.canDeclareNineKindsDraw('bottom')) {
        actions.push(createBottomNineKindsDrawAction('bottom', bottomIndex));
      }
      if (hasDrawnTile && Array.isArray(riichiChoices) && riichiChoices.length) {
        actions.push(createRiichiAction());
        actions.push(createRiichiCancelAction());
      }

      return runtime.setActionWindow({
        visible: actions.length > 0,
        layout: 'single',
        actions,
        activeActionKey: null
      });
    };

    runtime.finalizePendingExhaustiveDrawResolution = function() {
      if (!runtime.pendingExhaustiveDraw) return runtime.getSnapshot();
      const pendingResolution = runtime.pendingExhaustiveDraw;
      runtime.pendingExhaustiveDraw = null;
      runtime.setActionWindow({
        visible: false,
        layout: 'single',
        actions: [],
        activeActionKey: null
      });
      const options = typeof pendingResolution.buildOptions === 'function'
        ? pendingResolution.buildOptions()
        : buildExhaustiveDrawResultOptions(runtime);
      return runtime.resolveDraw(pendingResolution.reason || '荒牌平局', options);
    };

    runtime.prepareExhaustiveDrawResolution = function(reason, buildOptions) {
      if (reason !== '荒牌平局') return null;
      if (!runtime.rule || runtime.rule['ノーテン宣言あり'] !== true) return null;
      if (typeof runtime.canDeclareNoDaopai !== 'function' || typeof runtime.declareNoDaopai !== 'function') {
        return null;
      }

      runtime.activeSeats
        .filter((seatKey) => seatKey && seatKey !== 'bottom')
        .forEach((seatKey) => {
          if (runtime.canDeclareNoDaopai(seatKey)) {
            runtime.declareNoDaopai(seatKey);
          }
        });

      if (runtime.getSeatIndex('bottom') < 0 || !runtime.canDeclareNoDaopai('bottom')) {
        return null;
      }

      runtime.pendingExhaustiveDraw = {
        reason,
        buildOptions
      };
      runtime.setPhase('await_resolution');
      runtime.refreshActionWindow();
      return runtime.getSnapshot();
    };

    runtime.drawForSeat = function(seatKey) {
      if (seatKey === 'bottom') {
        runtime.pendingRiichi = false;
        runtime.selfActionSelectionResolved = false;
      }
      runtime.drawTile(seatKey);
      return runtime.getSnapshot();
    };

    runtime.chooseAutoDiscard = function(seatKey) {
      if (runtime.aiController && typeof runtime.aiController.chooseDiscard === 'function' && runtime.aiController.isAiSeat(seatKey)) {
        return runtime.aiController.chooseDiscard(seatKey, {
          view: runtime.getSnapshot().views.aiViews[seatKey],
          availableActions: [],
          decisionContext: {
            phase: runtime.phase,
            turnSeat: runtime.turnSeat,
            seat: seatKey
          }
        });
      }
      return chooseAutoDiscardDecision(runtime, seatKey);
    };

    runtime.chooseAutoReaction = function(seatKey, actions) {
      if (runtime.aiController && typeof runtime.aiController.chooseReaction === 'function' && runtime.aiController.isAiSeat(seatKey)) {
        return runtime.aiController.chooseReaction(seatKey, actions, {
          view: runtime.getSnapshot().views.aiViews[seatKey],
          availableActions: actions,
          decisionContext: {
            phase: runtime.phase,
            turnSeat: runtime.turnSeat,
            seat: seatKey
          }
        });
      }
      return null;
    };

    runtime.discardHandTileAtIndex = function(seatKey, tileIndex) {
      const seatIndex = runtime.getSeatIndex(seatKey);
      if (seatIndex < 0) return null;
      const handCodes = runtime.getSeatHandCodes(seatKey);
      if (!Number.isInteger(tileIndex) || tileIndex < 0 || tileIndex >= handCodes.length) return null;

      const tileCode = handCodes[tileIndex];
      const riichiChoices = getRiichiChoices(runtime, seatIndex);
      const shouldRiichi = runtime.pendingRiichi && Array.isArray(riichiChoices) && riichiChoices.includes(tileCode);

      if (runtime.pendingRiichi && (!Array.isArray(riichiChoices) || !riichiChoices.includes(tileCode))) {
        return runtime.getSnapshot();
      }

      runtime.pendingRiichi = false;
      runtime.selfActionSelectionResolved = false;
      const discardSnapshot = runtime.discardTile(seatKey, tileCode, { riichi: shouldRiichi });
      runtime.refreshActionWindow();
      if (!runtime.pendingReaction) {
        return advanceAfterStateChange(runtime.getSnapshot() || discardSnapshot);
      }
      if (collectSeatReactionActions('bottom').length) {
        return advanceAfterStateChange(runtime.getSnapshot() || discardSnapshot);
      }
      scheduleAiReactionAfterDiscard(() => {
        resolvePendingAiOnlyReactions({
          animateMeldCapture: true,
          onResolved(reactionSnapshot) {
            advanceAfterStateChange(reactionSnapshot || runtime.getSnapshot());
          }
        });
      });
      return runtime.getSnapshot() || discardSnapshot;
    };

    runtime.canDiscardHandTileAtIndex = function(seatKey, tileIndex) {
      const seatIndex = runtime.getSeatIndex(seatKey);
      if (seatIndex < 0) return false;
      const handCodes = runtime.getSeatHandCodes(seatKey);
      if (!Number.isInteger(tileIndex) || tileIndex < 0 || tileIndex >= handCodes.length) return false;
      const tileCode = String(handCodes[tileIndex] || '').replace(/[\*_\+\=\-]$/, '');
      const interaction = runtime.getInteractionState ? runtime.getInteractionState() : null;
      const discardSelection = interaction && interaction.discardSelection ? interaction.discardSelection : null;
      if (discardSelection && discardSelection.active) {
        const legalDiscardCodes = Array.isArray(discardSelection.legalTileCodes)
          ? discardSelection.legalTileCodes.map((code) => String(code || '').replace(/[\*_\+\=\-]$/, ''))
          : [];
        if (!legalDiscardCodes.includes(tileCode)) return false;
      }
      if (!runtime.pendingRiichi) return true;
      const riichiChoices = getRiichiChoices(runtime, seatIndex);
      return Array.isArray(riichiChoices) && riichiChoices.includes(tileCode);
    };

    runtime.clearAutoTurnTimer = function() {
      if (runtime.autoTurnTimer) {
        window.clearTimeout(runtime.autoTurnTimer);
        runtime.autoTurnTimer = 0;
      }
      clearPostDiscardReactionTimer();
    };

    runtime.beginBottomTurn = function() {
      if (runtime.getSeatIndex('bottom') < 0) return null;
      runtime.drawForSeat('bottom');
      runtime.refreshActionWindow();
      return runtime.getSnapshot();
    };

    runtime.startSession = function() {
      const startSnapshot = runtime.start();
      if (runtime.testing && Array.isArray(runtime.testing.fastForwardActions) && runtime.testing.fastForwardActions.length) {
        return runStartupActions();
      }
      return resumeAutoRoundIfNeeded(startSnapshot || runtime.getSnapshot());
    };

    runtime.scheduleAutoRound = function() {
      continueAutoRoundFrom(0);
    };

    runtime.dispatch = function(action) {
      if (typeof action === 'string') {
        return runtime.dispatch({ key: action });
      }

      const type = inferActionType(action) || 'ui-action';
      const payload = normalizeActionPayload(action);
      const actionKey = payload.actionKey || (action && action.key) || null;

      if (type === 'ui-action') {
        if (actionKey === 'riichi') {
          runtime.pendingRiichi = true;
          runtime.selfActionSelectionResolved = true;
          runtime.setActionWindow({
            visible: false,
            layout: 'single',
            actions: [],
            activeActionKey: null
          });
          return runtime.getSnapshot();
        }
        if (actionKey === 'pass:self-turn') {
          runtime.pendingRiichi = false;
          runtime.selfActionSelectionResolved = true;
          runtime.setActionWindow({
            visible: false,
            layout: 'single',
            actions: [],
            activeActionKey: null
          });
          return runtime.getSnapshot();
        }
        if (actionKey === 'pass:no-daopai' && runtime.pendingExhaustiveDraw) {
          return runtime.finalizePendingExhaustiveDrawResolution();
        }
        return null;
      }

      if (type === 'draw') return runtime.drawTile(payload.seat, payload.tileCode);
      if (type === 'draw-seat') {
        runtime.drawForSeat(payload.seat || 'bottom');
        return runtime.getSnapshot();
      }
      if (type === 'draw-round' || type === 'pingju') return runtime.resolveDraw(payload.reason, payload);
      if (type === 'daopai' || type === 'no-daopai') {
        if (runtime.pendingExhaustiveDraw && payload.seat === 'bottom') {
          runtime.declareNoDaopai(payload.seat);
          return runtime.finalizePendingExhaustiveDrawResolution();
        }
        return runtime.declareNoDaopai(payload.seat);
      }
      if (type === 'kita' || type === 'nuki' || type === 'bei') {
        const snapshot = runtime.declareKita(payload.seat || 'bottom', payload);
        runtime.refreshActionWindow();
        return snapshot;
      }
      if (type === 'discard') return runtime.discardTile(payload.seat, payload.tileCode, payload.options || { riichi: Boolean(payload.riichi) });
      if (type === 'discard-index') return runtime.discardHandTileAtIndex(payload.seat || 'bottom', payload.tileIndex);
      if (!runtime.isResolvingReactionDecision
        && runtime.phase === 'await_reaction'
        && payload.seat === 'bottom'
        && type !== 'pass'
        && type !== 'reaction-pass') {
        return finalizeReactionDecisions(action, 'player-choice');
      }
      if (type === 'meld' || type === 'call') return runtime.callMeld(payload.seat, payload.meld || payload.meldString);
      if (type === 'kan' || type === 'gang') {
        const snapshot = typeof runtime.resolveKanSequence === 'function'
          ? runtime.resolveKanSequence(payload.seat, payload.meld || payload.meldString, payload)
          : runtime.declareKan(payload.seat, payload.meld || payload.meldString);
        runtime.refreshActionWindow();
        if (!runtime.isApplyingStartupScript && runtime.phase === 'await_discard' && runtime.turnSeat && runtime.turnSeat !== 'bottom') {
          runtime.scheduleAutoRound();
        }
        return snapshot;
      }
      if (type === 'dora' || type === 'flip-dora') return runtime.flipDora(payload.tileCode);
      if (type === 'hule') return runtime.resolveHule(payload.seat, payload);
      if (type === 'pass' || type === 'reaction-pass') {
        if (runtime.phase === 'await_reaction' && payload.seat === 'bottom') {
          return finalizeReactionDecisions(null, payload.reason || 'manual-pass');
        }
        const snapshot = runtime.passReaction(payload.seat, payload);
        return resumeAutoRoundIfNeeded(snapshot);
      }
      if (type === 'scores' || type === 'scores-update') return runtime.setScores(payload.scores || payload);
      if (type === 'action-window' || type === 'action-window-update') return runtime.setActionWindow(payload.actionWindow || payload);
      return null;
    };

    return runtime;
  }

  global.AceMahjongFormalRuntimeFactory = {
    kind: 'formal-runtime-factory',
    source: 'browser-formal-runtime-factory',
    createRuntime(config = {}) {
      return createFormalBrowserRuntime(config);
    }
  };
})(window);
