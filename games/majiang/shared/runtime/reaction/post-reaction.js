(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.AceMahjongCreateRuntimePostReactionHelpers = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  function buildSelectedHuleSettlements(runtime, orderedSelections, context, hooks = {}) {
    const settlements = [];
    const totalFenpei = [0, 0, 0, 0];

    orderedSelections.forEach((selection) => {
      const seatKey = selection.seatKey;
      const seatIndex = runtime.getSeatIndex(seatKey);
      const shoupai = runtime.board.shoupai[seatIndex].clone();
      const hupaiContext = hooks.buildHupaiContext(runtime, seatKey, {
        ...selection.options,
        seatIndex,
        shoupai,
        rongpai: selection.options.rongpai,
        claimTileCode: selection.options.claimTileCode,
        selfDraw: false
      });
      const settledFubaopai = hooks.getResolvedFubaopai(runtime, shoupai, selection.options);
      const rawResult = hooks.calculateHule(
        shoupai,
        selection.options.rongpai,
        hooks.createHuleParams(runtime, shoupai, seatIndex, {
          ...selection.options,
          seatIndex,
          hupai: hupaiContext,
          fubaopai: settledFubaopai
        })
      );
      const result = typeof hooks.applyKitaSettlementAdjustments === 'function'
        ? hooks.applyKitaSettlementAdjustments(runtime, seatIndex, rawResult, {
            ...selection.options,
            seatKey,
            fromSeat: context.fromSeat || null,
            rongpai: selection.options.rongpai,
            baojiaIndex: context.fromSeat ? runtime.getSeatIndex(context.fromSeat) : null,
            kitaCount: Number(hupaiContext.kita || 0)
          })
        : rawResult;

      result.fenpei.forEach((value, index) => {
        totalFenpei[index] += Number(value || 0);
      });

      settlements.push({
        winnerSeat: seatKey,
        fromSeat: context.fromSeat || null,
        tileCode: context.tileCode || null,
        rongpai: selection.options.rongpai,
        qianggang: Boolean(selection.options.qianggang),
        lingshang: Boolean(selection.options.lingshang),
        haidi: Number(hupaiContext.haidi || 0),
        tianhu: Number(hupaiContext.tianhu || 0),
        kitaCount: Number(result && result.kitaCount || 0),
        kitaTiles: Array.isArray(result && result.kitaTiles) ? result.kitaTiles.map((tile) => ({ ...tile })) : [],
        result: hooks.clone(result)
      });
    });

    return {
      settlements,
      totalFenpei
    };
  }

  function applyMultiHuleBoardState(runtime, settlements, totalFenpei, context = {}) {
    const winnerSeatIndices = [];
    settlements.forEach((settlement) => {
      const seatIndex = runtime.getSeatIndex(settlement.winnerSeat);
      if (seatIndex >= 0) {
        winnerSeatIndices.push(seatIndex);
      }
      const currentHand = runtime.board.shoupai[seatIndex] ? runtime.board.shoupai[seatIndex].clone() : null;
      if (!currentHand) return;
      const settledHandString = settlement.rongpai
        ? currentHand.zimo(settlement.rongpai).toString()
        : currentHand.toString();
      runtime.board.shoupai[seatIndex].fromString(settledHandString);
      if (context.fromSeat) {
        const winningTile = runtime.board.shoupai[seatIndex].get_dapai().pop();
        if (winningTile) {
          runtime.board.shoupai[seatIndex].dapai(winningTile);
        }
      }
    });

    totalFenpei.forEach((value, seatOffset) => {
      runtime.board.defen[runtime.board.player_id[seatOffset]] += Number(value || 0);
    });
    runtime.board.changbang = 0;
    runtime.board.lizhibang = 0;
    if ('_changbang' in runtime.board) runtime.board._changbang = runtime.board.changbang;
    if ('_lizhibang' in runtime.board) runtime.board._lizhibang = 0;
    if ('_fenpei' in runtime.board) {
      const lastSettlement = Array.isArray(settlements) && settlements.length
        ? settlements[settlements.length - 1]
        : null;
      runtime.board._fenpei = lastSettlement
        && lastSettlement.result
        && Array.isArray(lastSettlement.result.fenpei)
        ? lastSettlement.result.fenpei.slice()
        : totalFenpei.slice();
    }
    {
      const renchanMode = Number(runtime && runtime.rule ? runtime.rule['連荘方式'] || 0 : 0);
      const hasDealerWinner = winnerSeatIndices.includes(0);
      runtime.board._lianzhuang = Number(runtime && runtime.rule ? runtime.rule['場数'] || 0 : 0) === 0
        ? false
        : (renchanMode > 0 && hasDealerWinner);
    }
  }

  function resolvePostReactionWithoutHule(runtime, context, hooks = {}) {
    if (context.kind === 'qianggang' && runtime.pendingKanResolution) {
      return hooks.completePendingKanSequence(runtime, context);
    }

    let committedPendingRiichi = false;
    if (context.kind === 'discard'
        && hooks.runtimeRuleHelpers
        && typeof hooks.runtimeRuleHelpers.projectDiscardReplyResolution === 'function') {
      const resolution = hooks.runtimeRuleHelpers.projectDiscardReplyResolution(runtime, context, {
        selectedHuleSeats: []
      });
      if (resolution && resolution.commitPendingRiichi
          && typeof hooks.runtimeRuleHelpers.commitPendingRiichiStick === 'function') {
        hooks.runtimeRuleHelpers.commitPendingRiichiStick(runtime);
        committedPendingRiichi = true;
      }
      if (resolution && resolution.kind === 'draw') {
        const drawOptions = {
          commitPendingRiichi: false
        };
        if (resolution.revealedHands) {
          drawOptions.revealedHands = resolution.revealedHands;
        }
        return hooks.resolveDraw(runtime, resolution.reason, drawOptions);
      }
    }

    if (hooks.isExhaustiveDrawState(runtime)) {
      const buildExhaustiveDrawOptions = () => hooks.buildExhaustiveDrawResultOptions(runtime);
      const exhaustiveDrawOptions = buildExhaustiveDrawOptions();
      const exhaustiveDrawReason = exhaustiveDrawOptions && exhaustiveDrawOptions.reason
        ? exhaustiveDrawOptions.reason
        : '荒牌平局';
      const preparedResolution = typeof hooks.prepareExhaustiveDrawResolution === 'function'
        ? hooks.prepareExhaustiveDrawResolution(runtime, exhaustiveDrawReason, buildExhaustiveDrawOptions)
        : null;
      if (preparedResolution != null) {
        return preparedResolution;
      }
      return hooks.resolveDraw(runtime, exhaustiveDrawReason, {
        ...exhaustiveDrawOptions,
        commitPendingRiichi: committedPendingRiichi ? false : exhaustiveDrawOptions && exhaustiveDrawOptions.commitPendingRiichi
      });
    }

    return hooks.advanceToNextTurn(runtime, context);
  }

  function createRuntimePostReactionHelpers() {
    return {
      buildSelectedHuleSettlements,
      applyMultiHuleBoardState,
      resolvePostReactionWithoutHule
    };
  }

  return createRuntimePostReactionHelpers;
});
