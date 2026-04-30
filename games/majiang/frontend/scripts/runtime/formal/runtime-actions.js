(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.AceMahjongCreateBrowserFormalRuntimeActions = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  function createBrowserFormalRuntimeActions() {
    function attachActionMethods(runtime, deps = {}) {
      function getRuntimeWallPayload() {
        const wallState = typeof runtime.getWallState === 'function' ? runtime.getWallState() : null;
        return {
          remaining: wallState && Number.isFinite(Number(wallState.remaining)) ? Number(wallState.remaining) : null,
          baopai: wallState && Array.isArray(wallState.baopai) ? wallState.baopai.slice() : []
        };
      }

      runtime.drawTile = function(seatKey, tileCode, options = {}) {
        const seatIndex = runtime.getSeatIndex(seatKey);
        const drawResult = !tileCode && runtime.wallService && typeof runtime.wallService.drawTile === 'function'
          ? runtime.wallService.drawTile({
              seat: seatKey,
              reason: options.reason || 'runtime-draw'
            })
          : null;
        const resolvedInputTile = drawResult && drawResult.tileCode ? drawResult.tileCode : tileCode;
        if (!resolvedInputTile) {
          runtime.board.zimo({ l: seatIndex });
        } else {
          runtime.board.lizhi();
          runtime.board.lunban = seatIndex;
          runtime.board.shoupai[seatIndex].zimo(resolvedInputTile, false);
        }
        runtime.turnSeat = seatKey;
        deps.markIppatsuPendingExpiry(runtime, seatKey);
        deps.refreshSeatFuritenState(runtime, seatKey);
        runtime.pendingSupplementDrawType = null;
        runtime.setPhase(deps.FORMAL_PHASES.AWAIT_DISCARD);
        const resolvedTileCode = runtime.board.shoupai[seatIndex] && runtime.board.shoupai[seatIndex]._zimo
          ? runtime.board.shoupai[seatIndex]._zimo
          : resolvedInputTile || null;
        const wallPayload = getRuntimeWallPayload();
        return runtime.emit('tile:draw', {
          seat: seatKey,
          tileCode: resolvedTileCode,
          source: options.source || (drawResult && drawResult.source) || 'majiang-core:shan',
          remaining: wallPayload.remaining,
          baopai: wallPayload.baopai,
          meta: drawResult && drawResult.meta ? deps.clone(drawResult.meta) : null
        });
      };

      runtime.drawGangTile = function(seatKey, options = {}) {
        const seatIndex = runtime.getSeatIndex(seatKey);
        const drawResult = runtime.wallService && typeof runtime.wallService.drawGangTile === 'function'
          ? runtime.wallService.drawGangTile({
              seat: seatKey,
              reason: options.reason || 'runtime-gang-draw'
            })
          : null;
        const tileCode = drawResult && drawResult.tileCode
          ? drawResult.tileCode
          : (runtime.board.shan && typeof runtime.board.shan.gangzimo === 'function'
            ? runtime.board.shan.gangzimo()
            : null);
        runtime.board.lizhi();
        runtime.board.lunban = seatIndex;
        runtime.board.shoupai[seatIndex].zimo(tileCode, false);
        runtime.turnSeat = seatKey;
        deps.markIppatsuPendingExpiry(runtime, seatKey);
        deps.refreshSeatFuritenState(runtime, seatKey);
        runtime.pendingSupplementDrawType = 'gang';
        runtime.setPhase(deps.FORMAL_PHASES.AWAIT_DISCARD);
        const wallPayload = getRuntimeWallPayload();
        return runtime.emit('tile:gang-draw', {
          seat: seatKey,
          tileCode,
          source: options.source || (drawResult && drawResult.source) || 'majiang-core:shan:gang',
          remaining: wallPayload.remaining,
          baopai: wallPayload.baopai,
          meta: drawResult && drawResult.meta ? deps.clone(drawResult.meta) : null
        });
      };

      runtime.declareKita = function(seatKey, options = {}) {
        if (!seatKey || typeof runtime.canDeclareKita !== 'function' || !runtime.canDeclareKita(seatKey)) {
          return runtime.getSnapshot();
        }
        const seatIndex = runtime.getSeatIndex(seatKey);
        if (seatIndex < 0) {
          throw new Error(`Unknown seat key: ${seatKey}`);
        }
        const shoupai = runtime.board && Array.isArray(runtime.board.shoupai) ? runtime.board.shoupai[seatIndex] : null;
        if (!shoupai || typeof shoupai.dapai !== 'function') {
          throw new Error(`Seat ${seatKey} does not have a mutable hand state.`);
        }

        shoupai.dapai('z4');

        if (!runtime.seatMeta[seatKey]) {
          runtime.seatMeta[seatKey] = { kitaTiles: [] };
        }
        if (!Array.isArray(runtime.seatMeta[seatKey].kitaTiles)) {
          runtime.seatMeta[seatKey].kitaTiles = [];
        }

        runtime.seatMeta[seatKey].kitaTiles.push({
          asset: deps.getTileAsset ? deps.getTileAsset('z4') : null,
          label: '北',
          code: 'z4',
          open: true
        });

        let drawResult = null;
        if (runtime.wallService && typeof runtime.wallService.drawKitaTile === 'function') {
          drawResult = runtime.wallService.drawKitaTile({
            seat: seatKey,
            reason: 'runtime-kita-draw'
          });
        }

        let replacementTileCode = drawResult && drawResult.tileCode ? drawResult.tileCode : null;
        if (!replacementTileCode) {
          const wallState = typeof runtime.getWallState === 'function' ? runtime.getWallState() : null;
          const shan = runtime.board && runtime.board.shan;
          if (!shan || !Array.isArray(shan._pai) || !wallState || wallState.remaining <= 0) {
            throw new Error('No supplement tile available for kita draw.');
          }
          replacementTileCode = shan._pai.shift() || null;
        }

        runtime.board.lunban = seatIndex;
        runtime.board.shoupai[seatIndex].zimo(replacementTileCode, false);
        runtime.turnSeat = seatKey;
        deps.refreshSeatFuritenState(runtime, seatKey);
        runtime.pendingSupplementDrawType = 'kita';
        runtime.setPhase(deps.FORMAL_PHASES.AWAIT_DISCARD);

        const wallPayload = getRuntimeWallPayload();
        return runtime.emit('tile:kita', {
          seat: seatKey,
          tileCode: 'z4',
          replacementTileCode,
          source: options.source || (drawResult && drawResult.source) || 'majiang-core:shan:kita',
          meta: options.meta || (drawResult && drawResult.meta) || null,
          remaining: wallPayload.remaining,
          baopai: wallPayload.baopai,
          kitaCount: runtime.seatMeta[seatKey].kitaTiles.length
        });
      };

      runtime.discardTile = function(seatKey, tileCode, options = {}) {
        const seatIndex = runtime.getSeatIndex(seatKey);
        deps.consumePendingIppatsuExpiry(runtime, seatKey);
        deps.prepareSeatForDiscard(runtime, seatKey);
        runtime.pendingSupplementDrawType = null;
        if (options.riichi) {
          deps.validateRiichiDeclaration(runtime, seatKey, tileCode);
        }
        runtime.board.dapai({ l: seatIndex, p: options.riichi ? `${tileCode}*` : tileCode });
        if (options.riichi) {
          deps.markRiichiDeclaration(runtime, seatKey);
        }
        deps.finalizeDiscardTurn(runtime, seatKey);
        deps.refreshSeatFuritenState(runtime, seatKey);
        runtime.turnSeat = runtime.getNextSeatKey(seatKey);
        runtime.setPhase(deps.FORMAL_PHASES.AWAIT_REACTION);
        runtime.pendingReaction = null;
        runtime.emit('tile:discard', {
          seat: seatKey,
          tileCode,
          riichi: Boolean(options.riichi)
        });
        return runtime.openReactionWindow(seatKey, tileCode);
      };

      runtime.getBlockingReactionAction = function(type, seatKey) {
        return deps.findBlockingReactionAction(runtime.pendingReaction, type, seatKey);
      };

      runtime.assertReactionActionAllowed = function(type, seatKey) {
        if (!runtime.pendingReaction) return;
        const blockingAction = runtime.getBlockingReactionAction(type, seatKey);
        if (!blockingAction) return;
        if (blockingAction.reason === 'missing-action') {
          throw new Error(`Reaction action is not available for seat ${seatKey}.`);
        }
        throw new Error(`Reaction action for seat ${seatKey} is blocked by higher-priority ${blockingAction.type}.`);
      };

      runtime.callMeld = function(seatKey, meldString) {
        runtime.assertReactionActionAllowed('call', seatKey);
        const seatIndex = runtime.getSeatIndex(seatKey);
        const reactionContext = runtime.pendingReaction ? deps.clone(runtime.pendingReaction) : null;
        deps.closeDoubleRiichiWindow(runtime);
        deps.clearAllIppatsu(runtime);
        runtime.pendingReaction = null;
        runtime.pendingKanResolution = null;
        runtime.setActionWindow(null);
        deps.applyPendingReactionFuriten(runtime, reactionContext);
        runtime.board.fulou({ l: seatIndex, m: meldString });
        runtime.board.lunban = seatIndex;
        runtime.turnSeat = seatKey;
        runtime.setPhase(deps.FORMAL_PHASES.AWAIT_DISCARD);
        return runtime.emit('meld:call', { seat: seatKey, meld: meldString });
      };

      runtime.declareKan = function(seatKey, meldString) {
        runtime.assertReactionActionAllowed('kan', seatKey);
        const seatIndex = runtime.getSeatIndex(seatKey);
        const isReactionKan = Boolean(runtime.pendingReaction);
        const reactionContext = runtime.pendingReaction ? deps.clone(runtime.pendingReaction) : null;
        deps.closeDoubleRiichiWindow(runtime);
        deps.clearAllIppatsu(runtime);
        const kanType = deps.detectKanType(meldString, isReactionKan);
        runtime.pendingReaction = null;
        runtime.pendingKanResolution = null;
        runtime.setActionWindow(null);
        if (isReactionKan) {
          deps.applyPendingReactionFuriten(runtime, reactionContext);
        }
        if (isReactionKan) {
          runtime.board.fulou({ l: seatIndex, m: meldString });
        } else {
          runtime.board.gang({ l: seatIndex, m: meldString });
        }
        runtime.board.lunban = seatIndex;
        runtime.turnSeat = seatKey;
        runtime.setPhase(deps.FORMAL_PHASES.AWAIT_RESOLUTION);
        return runtime.emit('meld:kan', { seat: seatKey, meld: meldString, kanType });
      };

      runtime.completePendingKanSequence = function(options = {}) {
        const pendingKan = runtime.pendingKanResolution;
        if (!pendingKan) return runtime.getSnapshot();
        const seatKey = pendingKan.seat;
        const meldString = pendingKan.meldString;
        const kanSnapshot = runtime.declareKan(seatKey, meldString);
        const kanType = runtime.lastEvent && runtime.lastEvent.payload ? runtime.lastEvent.payload.kanType : pendingKan.kanType;
        const gangDrawSnapshot = runtime.drawGangTile(seatKey, {
          source: pendingKan.drawSource || options.drawSource || 'majiang-core:shan:gang',
          meta: {
            kanType,
            sequence: 'post-kan'
          }
        });
        const doraSnapshot = runtime.flipDora(
          pendingKan.doraTileCode || options.doraTileCode,
          { nextPhase: deps.FORMAL_PHASES.AWAIT_DISCARD }
        );
        return doraSnapshot || gangDrawSnapshot || kanSnapshot;
      };

      runtime.openQianggangWindow = function(seatKey, meldString, options = {}) {
        deps.closeDoubleRiichiWindow(runtime);
        deps.clearAllIppatsu(runtime);
        const tileCode = deps.getKanClaimTileCode(meldString);
        if (!tileCode) {
          runtime.pendingKanResolution = {
            seat: seatKey,
            meldString,
            kanType: 'kan-added',
            doraTileCode: options.doraTileCode || null,
            drawSource: options.drawSource || 'majiang-core:shan:gang'
          };
          return runtime.completePendingKanSequence(options);
        }

        runtime.pendingKanResolution = {
          seat: seatKey,
          meldString,
          kanType: 'kan-added',
          tileCode,
          doraTileCode: options.doraTileCode || null,
          drawSource: options.drawSource || 'majiang-core:shan:gang'
        };

        const sorted = deps.runtimeReactionHelpers.buildQianggangReactionCandidates(runtime, seatKey, tileCode, {
          reactionPriority: deps.REACTION_PRIORITY,
          getSeatIndex: (currentRuntime, currentSeatKey) => currentRuntime.getSeatIndex(currentSeatKey),
          getActiveSeats: (currentRuntime, currentSeatKey) => currentRuntime.activeSeats.filter((otherSeat) => otherSeat !== currentSeatKey),
          getClaimTileCode: deps.getClaimTileCode,
          buildHupaiContext: deps.buildHupaiContext,
          allowHule: (currentRuntime, shoupai, claimTileCode, seatIndexValue, hupai, otherSeat) => (
            currentRuntime.canSeatHule(otherSeat, {
              shoupai,
              claimTileCode,
              hupai,
              fromSeat: seatKey,
              tileCode
            })
          ),
          createReactionAction: deps.createReactionAction,
          createPassAction: deps.createPassAction,
          sortReactionActions: deps.sortReactionActions
        });
        const reactionActions = sorted.filter((action) => action.type !== 'pass');
        if (!reactionActions.length) {
          deps.getReactionFuritenSeatKeys(runtime, seatKey, tileCode).forEach((otherSeat) => (
            deps.observeMissedWinningTile(runtime, otherSeat, { skipRon: false })
          ));
          return runtime.completePendingKanSequence(options);
        }

        runtime.pendingReaction = {
          kind: 'qianggang',
          fromSeat: seatKey,
          tileCode,
          nextSeat: runtime.getNextSeatKey(seatKey),
          actions: sorted,
          passedSeats: [],
          furitenSeatKeys: deps.getReactionFuritenSeatKeys(runtime, seatKey, tileCode),
          selectedHuleActions: []
        };
        runtime.turnSeat = seatKey;
        runtime.setPhase(deps.FORMAL_PHASES.AWAIT_REACTION);
        if (typeof runtime.refreshActionWindow === 'function') {
          runtime.refreshActionWindow();
        } else {
          runtime.setActionWindow(null);
        }
        return runtime.emit('reaction-window:open', {
          kind: 'qianggang',
          fromSeat: seatKey,
          tileCode,
          actions: sorted.map((action) => deps.clone(action))
        });
      };

      runtime.resolveKanSequence = function(seatKey, meldString, options = {}) {
        const kanType = deps.detectKanType(meldString, Boolean(runtime.pendingReaction));
        if (kanType === 'kan-added' && !runtime.pendingReaction) {
          return runtime.openQianggangWindow(seatKey, meldString, options);
        }
        const kanSnapshot = runtime.declareKan(seatKey, meldString);
        const gangDrawSnapshot = runtime.drawGangTile(seatKey, {
          source: options.drawSource || 'majiang-core:shan:gang',
          meta: {
            kanType,
            sequence: 'post-kan'
          }
        });
        const doraSnapshot = runtime.flipDora(
          options.doraTileCode,
          { nextPhase: deps.FORMAL_PHASES.AWAIT_DISCARD }
        );
        return doraSnapshot || gangDrawSnapshot || kanSnapshot;
      };

      runtime.flipDora = function(tileCode, options = {}) {
        if (!tileCode && runtime.wallService && typeof runtime.wallService.revealDora === 'function') {
          runtime.wallService.revealDora({ reason: 'formal-runtime-flip-dora' });
        } else if (!tileCode && runtime.board.shan && typeof runtime.board.shan.kaigang === 'function') {
          runtime.board.shan.kaigang();
        } else {
          runtime.board.kaigang({ baopai: tileCode });
        }
        runtime.setPhase(options.nextPhase || runtime.phase || deps.FORMAL_PHASES.AWAIT_DRAW);
        const wallPayload = getRuntimeWallPayload();
        const resolvedTileCode = Array.isArray(wallPayload.baopai)
          ? wallPayload.baopai.slice(-1)[0] || tileCode || null
          : tileCode || null;
        return runtime.emit('dora:flip', {
          tileCode: resolvedTileCode,
          source: 'majiang-core:shan:kaigang',
          remaining: wallPayload.remaining,
          baopai: wallPayload.baopai
        });
      };

      runtime.resolveHule = function(seatKey, options = {}) {
        if (!options.finalizeImmediately) {
          runtime.assertReactionActionAllowed('hule', seatKey);
        }
        const reactionContext = runtime.pendingReaction ? deps.clone(runtime.pendingReaction) : null;
        const resolvedFromSeat = reactionContext ? reactionContext.fromSeat : (options.fromSeat || null);
        const resolvedTileCode = reactionContext ? reactionContext.tileCode : (options.tileCode || null);
        const discardSeatIndex = resolvedFromSeat ? runtime.getSeatIndex(resolvedFromSeat) : null;
        const rongpai = options.rongpai
          || options.claimTileCode
          || (resolvedTileCode && discardSeatIndex >= 0
            ? deps.getClaimTileCode(resolvedTileCode, discardSeatIndex, runtime.getSeatIndex(seatKey))
            : null);
        const resolvedLingshang = Object.prototype.hasOwnProperty.call(options, 'lingshang')
          ? Boolean(options.lingshang)
          : (!rongpai && Boolean(runtime.pendingSupplementDrawType));

        if (!options.finalizeImmediately && runtime.pendingReaction) {
          return deps.runtimeReactionFlowHelpers.queueSelectedHuleAction(runtime, seatKey, {
            ...options,
            rongpai,
            claimTileCode: options.claimTileCode || rongpai || null
          }, {
            getPendingReactionHuleActions: deps.getPendingReactionHuleActions,
            emitReactionHuleSelect: (currentRuntime, payload) => currentRuntime.emit('reaction:hule-select', payload),
            rebuildReactionWindow: deps.rebuildReactionWindow,
            getSnapshot: (currentRuntime) => currentRuntime.getSnapshot()
          });
        }

        const seatIndex = runtime.getSeatIndex(seatKey);
        const shoupai = runtime.board.shoupai[seatIndex].clone();
        const settledFubaopai = deps.getResolvedFubaopai(runtime, shoupai, options);
        const hupaiContext = deps.buildHupaiContext(runtime, seatKey, {
          ...options,
          seatIndex,
          shoupai,
          rongpai,
          claimTileCode: options.claimTileCode || rongpai || null,
          selfDraw: !rongpai,
          lingshang: resolvedLingshang
        });
        const rawResult = deps.calculateHule(
          shoupai,
          rongpai,
          deps.createHuleParams(runtime, shoupai, seatIndex, {
            ...options,
            seatIndex,
            hupai: hupaiContext,
            fubaopai: settledFubaopai
          })
        );
        if (!deps.satisfiesShibari(rawResult, deps.getShibariMinYakuHan(runtime.customRuleConfig))) {
          throw new Error('Hand does not satisfy shibari requirement.');
        }
        const result = typeof deps.applyKitaSettlementAdjustments === 'function'
          ? deps.applyKitaSettlementAdjustments(runtime, seatIndex, rawResult, {
              ...options,
              seatKey,
              kitaCount: Number(hupaiContext.kita || 0)
            })
          : rawResult;

        deps.applyHuleSettlement(runtime, seatIndex, result, {
          rongpai,
          baojiaIndex: resolvedFromSeat ? runtime.getSeatIndex(resolvedFromSeat) : null
        });
        if (reactionContext) {
          deps.applyPendingReactionFuriten(runtime, reactionContext);
        }
        runtime.setActionWindow(null);
        runtime.pendingReaction = null;
        runtime.pendingKanResolution = null;
        runtime.pendingSupplementDrawType = null;
        runtime.roundResult = deps.buildHuleRoundResult(runtime, seatKey, result, {
          fromSeat: resolvedFromSeat,
          tileCode: resolvedTileCode,
          rongpai,
          qianggang: Boolean(options.qianggang),
          lingshang: resolvedLingshang,
          haidi: Number(hupaiContext.haidi || 0),
          tianhu: Number(hupaiContext.tianhu || 0)
        });
        runtime.setPhase(deps.FORMAL_PHASES.ROUND_END);
        runtime.emit('round:hule', { seat: seatKey, result, roundResult: runtime.roundResult });
        return runtime.emit('round:end', { type: 'hule', roundResult: runtime.roundResult });
      };

      runtime.resolveDraw = function(reason, options = {}) {
        if (options.commitPendingRiichi !== false) {
          deps.runtimeRuleHelpers.commitPendingRiichiStick(runtime);
        }
        deps.applyDrawSettlement(runtime, options);
        runtime.setActionWindow(null);
        runtime.pendingReaction = null;
        runtime.pendingKanResolution = null;
        runtime.roundResult = deps.buildDrawRoundResult(runtime, reason, options);
        runtime.setPhase(deps.FORMAL_PHASES.ROUND_END);
        runtime.emit('round:draw', { reason: runtime.roundResult.reason, roundResult: runtime.roundResult });
        return runtime.emit('round:end', { type: 'draw', roundResult: runtime.roundResult });
      };

      runtime.openReactionWindow = function(discardSeat, tileCode) {
        if (!deps.browserMajiang || !deps.browserMajiang.Game) {
          runtime.pendingReaction = null;
          runtime.turnSeat = runtime.getNextSeatKey(discardSeat);
          runtime.board.lunban = runtime.getSeatIndex(runtime.turnSeat);
          runtime.setPhase(deps.FORMAL_PHASES.AWAIT_DRAW);
          runtime.setActionWindow(null);
          return runtime.emit('reaction-window:empty', {
            fromSeat: discardSeat,
            tileCode,
            nextSeat: runtime.getNextSeatKey(discardSeat)
          });
        }

        const sorted = deps.buildReactionCandidates(runtime, discardSeat, tileCode);
        const nextSeat = runtime.getNextSeatKey(discardSeat);
        const furitenSeatKeys = deps.getReactionFuritenSeatKeys(runtime, discardSeat, tileCode);

        return deps.runtimeReactionFlowHelpers.openPendingReaction(runtime, {
          kind: 'discard',
          fromSeat: discardSeat,
          tileCode,
          nextSeat,
          actions: sorted,
          furitenSeatKeys
        }, {
          cloneActions: (actions) => actions.map((action) => deps.clone(action)),
          onEmpty: (currentRuntime, context) => {
            context.furitenSeatKeys.forEach((seatKey) => (
              deps.observeMissedWinningTile(currentRuntime, seatKey, { skipRon: false })
            ));
            currentRuntime.pendingReaction = null;
            currentRuntime.setActionWindow(null);
          },
          onOpen: (currentRuntime, context) => {
            currentRuntime.setPhase(deps.FORMAL_PHASES.AWAIT_REACTION);
            if (typeof currentRuntime.refreshActionWindow === 'function') {
              currentRuntime.refreshActionWindow();
              return;
            }
            currentRuntime.setActionWindow(null);
          },
          emitReactionWindowEmpty: (currentRuntime, payload, context) => {
            currentRuntime.emit('reaction-window:empty', {
              fromSeat: payload.fromSeat,
              tileCode: payload.tileCode,
              nextSeat: payload.nextSeat
            });
            return deps.resolvePostReactionState(currentRuntime, context);
          },
          emitReactionWindowOpen: (currentRuntime, payload) => currentRuntime.emit('reaction-window:open', {
            fromSeat: payload.fromSeat,
            tileCode: payload.tileCode,
            actions: payload.actions
          })
        });
      };

      runtime.passReaction = function(seatKey, options = {}) {
        if (!runtime.pendingReaction) return runtime.getSnapshot();
        deps.applyReactionPassFuriten(runtime, seatKey, runtime.pendingReaction);
        if (!runtime.pendingReaction.passedSeats.includes(seatKey)) {
          runtime.pendingReaction.passedSeats.push(seatKey);
        }
        runtime.emit('reaction:pass', {
          seat: seatKey,
          fromSeat: runtime.pendingReaction.fromSeat,
          tileCode: runtime.pendingReaction.tileCode,
          reason: options.reason || 'manual-pass'
        });
        return deps.rebuildReactionWindow(runtime);
      };

      return runtime;
    }

    return {
      attachActionMethods
    };
  }

  return createBrowserFormalRuntimeActions;
});
