(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.AceMahjongCreateRuntimeDrawSupportHelpers = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  function createRuntimeDrawSupportHelpers(options = {}) {
    const getSeatKeys = typeof options.getSeatKeys === 'function'
      ? options.getSeatKeys
      : (() => ['bottom', 'right', 'top', 'left']);
    const getSeatKeyByIndex = typeof options.getSeatKeyByIndex === 'function'
      ? options.getSeatKeyByIndex
      : ((runtime, seatIndex) => {
          const seatKeys = getSeatKeys(runtime);
          return seatKeys[seatIndex] || null;
        });
    const getSeatIndex = typeof options.getSeatIndex === 'function'
      ? options.getSeatIndex
      : ((runtime, seatKey) => (runtime && typeof runtime.getSeatIndex === 'function' ? runtime.getSeatIndex(seatKey) : -1));
    const calculateXiangting = typeof options.calculateXiangting === 'function'
      ? options.calculateXiangting
      : null;
    const getTingpai = typeof options.getTingpai === 'function'
      ? options.getTingpai
      : null;
    const getTianhuValue = typeof options.getTianhuValue === 'function'
      ? options.getTianhuValue
      : (() => 0);
    const allowPingju = typeof options.allowPingju === 'function'
      ? options.allowPingju
      : (() => false);
    const allowNoDaopai = typeof options.allowNoDaopai === 'function'
      ? options.allowNoDaopai
      : (() => false);
    const shouldDealerContinueOnDraw = typeof options.shouldDealerContinueOnDraw === 'function'
      ? options.shouldDealerContinueOnDraw
      : ((ruleConfig = {}, context = {}) => {
          if (Number(ruleConfig['場数']) === 0) return true;
          const normalizedReason = String(context.reason || '').trim();
          if (normalizedReason && normalizedReason !== '荒牌平局' && normalizedReason !== 'exhaustive-draw') {
            return true;
          }
          const renchanMode = Number(ruleConfig['連荘方式']);
          if (renchanMode === 3) return true;
          if (renchanMode === 2) return Boolean(context.dealerTenpai);
          return false;
        });
    const getSeatRiichiState = typeof options.getSeatRiichiState === 'function'
      ? options.getSeatRiichiState
      : null;
    const getDeclaredNoDaopaiSeats = typeof options.getDeclaredNoDaopaiSeats === 'function'
      ? options.getDeclaredNoDaopaiSeats
      : ((runtime) => (
          runtime && Array.isArray(runtime.declaredNoDaopaiSeats)
            ? runtime.declaredNoDaopaiSeats.slice()
            : []
        ));

    function isTerminalOrHonorRiverTile(code) {
      const normalized = String(code || '').replace(/\*$/, '');
      if (!normalized || /[\+\=\-]$/.test(normalized)) return false;
      if (/^z[1-7]$/.test(normalized)) return true;
      return /^[mps][19]$/.test(normalized);
    }

    function buildNagashiManganResultOptions(runtime) {
      const seatKeys = getSeatKeys(runtime);
      if (!runtime || !runtime.rule || runtime.rule['流し満貫あり'] === false) return null;
      if (!runtime.board || !Array.isArray(runtime.board.he)) return null;

      const nagashiManganSeats = [];
      const fenpei = Array.from({ length: seatKeys.length }, () => 0);

      for (let seatIndex = 0; seatIndex < seatKeys.length; seatIndex += 1) {
        const river = runtime.board.he[seatIndex];
        const riverCodes = river && Array.isArray(river._pai) ? river._pai : [];
        const isNagashiSeat = riverCodes.every((code) => isTerminalOrHonorRiverTile(code));
        if (!isNagashiSeat) continue;

        const seatKey = getSeatKeyByIndex(runtime, seatIndex);
        if (seatKey) nagashiManganSeats.push(seatKey);

        for (let targetIndex = 0; targetIndex < seatKeys.length; targetIndex += 1) {
          fenpei[targetIndex] += (
            seatIndex === 0 && targetIndex === seatIndex ? 12000
              : seatIndex === 0 ? -4000
              : seatIndex !== 0 && targetIndex === seatIndex ? 8000
              : seatIndex !== 0 && targetIndex === 0 ? -4000
              : -2000
          );
        }
      }

      if (!nagashiManganSeats.length) return null;

      return {
        reason: '流し満貫',
        nagashiManganSeats,
        tenpaiSeats: [],
        notenSeats: [],
        revealedHands: Array.from({ length: seatKeys.length }, () => ''),
        fenpei,
        dealerContinues: shouldDealerContinueOnDraw(runtime && runtime.rule ? runtime.rule : {}, {
          reason: '流し満貫',
          dealerTenpai: false
        })
      };
    }

    function isExhaustiveDrawState(runtime) {
      if (!runtime) return false;
      const wallState = typeof runtime.getWallState === 'function' ? runtime.getWallState() : null;
      return Boolean(
        wallState
          ? Number(wallState.remaining || 0) === 0
          : (runtime.board && runtime.board.shan && runtime.board.shan.paishu === 0)
      );
    }

    function isSeatRiichi(runtime, seatKey, shoupai = null) {
      const state = getSeatRiichiState ? getSeatRiichiState(runtime, seatKey) : null;
      if (state && state.declared) return true;
      return Boolean(shoupai && shoupai.lizhi);
    }

    function shouldCountDealerTenpaiForContinuation(runtime, seatIndex, isTenpai) {
      if (!runtime || !runtime.rule || !isTenpai || seatIndex !== 0) return false;
      return Number(runtime.rule['連荘方式']) === 2;
    }

    function shouldRevealHandWithoutNotenPenalty(runtime, seatIndex, isRiichi) {
      if (!runtime || !runtime.rule) return true;
      if (runtime.rule['ノーテン罰あり'] !== false) return true;
      if (isRiichi) return true;
      return Number(runtime.rule['連荘方式']) === 2 && seatIndex === 0;
    }

    function buildExhaustiveDrawResultOptions(runtime) {
      const nagashiResult = buildNagashiManganResultOptions(runtime);
      if (nagashiResult) return nagashiResult;

      const seatKeys = getSeatKeys(runtime);
      const tenpaiSeats = [];
      const revealedHands = Array.from({ length: seatKeys.length }, () => '');
      const fenpei = Array.from({ length: seatKeys.length }, () => 0);
      const declaredNoDaopaiSet = new Set((getDeclaredNoDaopaiSeats(runtime) || []).map((seatKey) => String(seatKey || '')));
      let dealerContinues = false;

      for (let seatIndex = 0; seatIndex < seatKeys.length; seatIndex += 1) {
        const shoupai = runtime && runtime.board && runtime.board.shoupai ? runtime.board.shoupai[seatIndex] : null;
        const seatKey = getSeatKeyByIndex(runtime, seatIndex);
        const riichi = isSeatRiichi(runtime, seatKey, shoupai);
        const declaredNoDaopai = seatKey ? declaredNoDaopaiSet.has(seatKey) : false;
        if (runtime && runtime.rule && runtime.rule['ノーテン宣言あり'] === true && !declaredNoDaopai && !riichi) {
          continue;
        }

        const tingpai = shoupai && getTingpai ? getTingpai(shoupai) : [];
        const isTenpai = Boolean(
          shoupai
          && calculateXiangting
          && calculateXiangting(shoupai) === 0
          && Array.isArray(tingpai)
          && tingpai.length > 0
        );

        if (!shouldRevealHandWithoutNotenPenalty(runtime, seatIndex, riichi)) {
          continue;
        }

        if (isTenpai) {
          if (seatKey) tenpaiSeats.push(seatKey);
          revealedHands[seatIndex] = typeof shoupai.toString === 'function' ? shoupai.toString() : '';
          if (shouldCountDealerTenpaiForContinuation(runtime, seatIndex, isTenpai)) {
            dealerContinues = true;
          }
        }
      }

      const notenSeats = seatKeys.filter((seatKey) => !tenpaiSeats.includes(seatKey));

      if (runtime && runtime.rule && runtime.rule['ノーテン罰あり'] !== false
        && tenpaiSeats.length > 0 && tenpaiSeats.length < seatKeys.length) {
        const tenpaiShare = 3000 / tenpaiSeats.length;
        const notenShare = -3000 / notenSeats.length;
        tenpaiSeats.forEach((seatKey) => {
          const seatIndex = getSeatIndex(runtime, seatKey);
          if (seatIndex >= 0) fenpei[seatIndex] = tenpaiShare;
        });
        notenSeats.forEach((seatKey) => {
          const seatIndex = getSeatIndex(runtime, seatKey);
          if (seatIndex >= 0) fenpei[seatIndex] = notenShare;
        });
      }

      dealerContinues = shouldDealerContinueOnDraw(runtime && runtime.rule ? runtime.rule : {}, {
        reason: '荒牌平局',
        dealerTenpai: tenpaiSeats.includes(getSeatKeyByIndex(runtime, 0))
      });

      return {
        reason: '荒牌平局',
        tenpaiSeats,
        notenSeats,
        revealedHands,
        fenpei,
        dealerContinues
      };
    }

    function getPendingReactionHuleActions(reactionContext) {
      if (!reactionContext || !Array.isArray(reactionContext.actions)) return [];
      return reactionContext.actions.filter((action) => action && action.type === 'hule' && action.payload);
    }

    function canDeclareNineKindsDraw(runtime, seatKey) {
      if (!runtime || !runtime.rule || !runtime.board || !runtime.board.shoupai) return false;
      const seatIndex = getSeatIndex(runtime, seatKey);
      if (seatIndex < 0) return false;
      const shoupai = runtime.board.shoupai[seatIndex];
      if (!shoupai || !shoupai._zimo) return false;
      const diyizimo = getTianhuValue(runtime, seatKey, {
        seatIndex,
        shoupai,
        selfDraw: true
      }) !== 0;
      return Boolean(allowPingju(runtime, shoupai, diyizimo));
    }

    function canDeclareNoDaopai(runtime, seatKey) {
      if (!runtime || !runtime.board || !runtime.board.shoupai) return false;
      const seatIndex = getSeatIndex(runtime, seatKey);
      if (seatIndex < 0) return false;
      const shoupai = runtime.board.shoupai[seatIndex];
      const wallState = typeof runtime.getWallState === 'function' ? runtime.getWallState() : null;
      const paishu = wallState ? Number(wallState.remaining || 0) : 0;
      return Boolean(allowNoDaopai(runtime, shoupai, paishu));
    }

    return {
      isExhaustiveDrawState,
      buildExhaustiveDrawResultOptions,
      getPendingReactionHuleActions,
      canDeclareNineKindsDraw,
      canDeclareNoDaopai
    };
  }

  return createRuntimeDrawSupportHelpers;
});
