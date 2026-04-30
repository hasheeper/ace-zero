(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.AceMahjongCreateRuntimeReactionHelpers = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  function getTileRankValue(code) {
    if (!code || typeof code !== 'string') return code;
    if (code.length < 2) return code;
    return `${code[0]}${code[1] === '0' ? '5' : code[1]}`;
  }

  function buildReactionPreview(meldString, tileCode, fromSeat) {
    const digits = String(meldString || '').match(/\d/g) || [];
    const suit = String(meldString || '')[0] || (tileCode ? tileCode[0] : '');
    const claimedValue = getTileRankValue(tileCode);
    let removedClaim = false;
    const handTileCodes = digits
      .map((digit) => `${suit}${digit}`)
      .filter((code) => {
        if (!removedClaim && claimedValue && getTileRankValue(code) === claimedValue) {
          removedClaim = true;
          return false;
        }
        return true;
      });

    return {
      handTileCodes,
      riverTarget: fromSeat && tileCode
        ? {
            seat: fromSeat,
            area: 'river',
            tileCode
          }
        : null
    };
  }

  function finalizeReactionLabels(actions = []) {
    const groupedCounts = new Map();
    actions.forEach((action) => {
      const callType = action && action.payload ? action.payload.callType : null;
      const typeKey = callType || action.type;
      if (typeKey !== 'chi' && typeKey !== 'peng' && typeKey !== 'kan' && typeKey !== 'gang') return;
      groupedCounts.set(typeKey, (groupedCounts.get(typeKey) || 0) + 1);
    });

    const groupedIndex = new Map();
    actions.forEach((action) => {
      const callType = action && action.payload ? action.payload.callType : null;
      const typeKey = callType || action.type;
      if (typeKey !== 'chi' && typeKey !== 'peng' && typeKey !== 'kan' && typeKey !== 'gang') return;

      const count = groupedCounts.get(typeKey) || 0;
      const index = (groupedIndex.get(typeKey) || 0) + 1;
      groupedIndex.set(typeKey, index);

      const baseLabel = typeKey === 'chi'
        ? '吃'
        : (typeKey === 'peng' ? '碰' : '杠');
      action.label = count > 1 ? `${baseLabel}${['', '一', '二', '三', '四'][index] || String(index)}` : baseLabel;
      action.bgChar = baseLabel;
      action.textLayout = '';
      if (!action.variant || action.variant === '') {
        action.variant = count > 1 ? `option-${index}` : action.variant;
      }
    });

    return actions;
  }

  function buildReactionCandidates(runtime, discardSeat, tileCode, hooks = {}) {
    const discardSeatIndex = hooks.getSeatIndex(runtime, discardSeat);
    if (discardSeatIndex < 0) return [];

    const candidates = [];
    const nextSeat = hooks.getNextSeat(runtime, discardSeat);
    const activeSeats = hooks.getActiveSeats(runtime, discardSeat);

    activeSeats.forEach((seatKey) => {
      const seatIndex = hooks.getSeatIndex(runtime, seatKey);
      if (seatIndex < 0) return;

      const startIndex = candidates.length;
      const claimTileCode = hooks.getClaimTileCode(tileCode, discardSeatIndex, seatIndex);
      const seatOrder = (4 + seatIndex - discardSeatIndex) % 4;
      const shoupai = runtime.board.shoupai[seatIndex];
      const wallState = runtime && typeof runtime.getWallState === 'function' ? runtime.getWallState() : null;
      const paishu = wallState ? Number(wallState.remaining || 0) : 0;
      const hupai = hooks.buildHupaiContext(runtime, seatKey, {
        seatIndex,
        shoupai,
        claimTileCode,
        tileCode,
        selfDraw: false
      });

      if (hooks.allowHule(runtime, shoupai, claimTileCode, seatIndex, hupai, seatKey)) {
        candidates.push(hooks.createReactionAction({
          type: 'hule',
          key: `hule:${seatKey}`,
          label: '荣',
          seat: seatKey,
          priority: hooks.reactionPriority.HULE,
          bgChar: '荣',
          variant: 'alert-red',
          row: 0,
          payload: {
            seat: seatKey,
            claimTileCode,
            tileCode,
            fromSeat: discardSeat
          }
        }));
      }

      (hooks.getGangMelds(runtime, shoupai, claimTileCode, paishu) || []).forEach((meld, index) => {
        candidates.push(hooks.createReactionAction({
          type: 'kan',
          key: `kan:${seatKey}:${index}`,
          label: '杠',
          seat: seatKey,
          priority: hooks.reactionPriority.KAN,
          bgChar: '杠',
          row: 1,
          payload: {
            seat: seatKey,
            meld,
            meldString: meld,
            tileCode,
            fromSeat: discardSeat,
            preview: buildReactionPreview(meld, tileCode, discardSeat)
          }
        }));
      });

      (hooks.getPengMelds(runtime, shoupai, claimTileCode, paishu) || []).forEach((meld, index) => {
        candidates.push(hooks.createReactionAction({
          type: 'call',
          key: `peng:${seatKey}:${index}`,
          label: '碰',
          seat: seatKey,
          priority: hooks.reactionPriority.PENG,
          bgChar: '碰',
          row: 1,
          payload: {
            seat: seatKey,
            meld,
            meldString: meld,
            callType: 'peng',
            tileCode,
            fromSeat: discardSeat,
            preview: buildReactionPreview(meld, tileCode, discardSeat)
          }
        }));
      });

      if (seatKey === nextSeat) {
        (hooks.getChiMelds(runtime, shoupai, claimTileCode, paishu) || []).forEach((meld, index) => {
          candidates.push(hooks.createReactionAction({
            type: 'call',
            key: `chi:${seatKey}:${index}`,
            label: '吃',
            seat: seatKey,
            priority: hooks.reactionPriority.CHI,
            bgChar: '吃',
            row: 1,
            payload: {
              seat: seatKey,
              meld,
              meldString: meld,
              callType: 'chi',
              tileCode,
              fromSeat: discardSeat,
              preview: buildReactionPreview(meld, tileCode, discardSeat)
            }
          }));
        });
      }

      if (candidates.length > startIndex) {
        candidates.push(hooks.createPassAction({
          key: `pass:${seatKey}`,
          label: '过',
          priority: hooks.reactionPriority.PASS,
          bgChar: '过',
          variant: 'skip',
          row: 1,
          payload: {
            seat: seatKey,
            fromSeat: discardSeat,
            tileCode
          }
        }));
      }

      for (let index = startIndex; index < candidates.length; index += 1) {
        const action = candidates[index];
        if (action.payload && action.payload.seat === seatKey) {
          action.reactionOrder = seatOrder;
        }
      }
    });

    return finalizeReactionLabels(hooks.sortReactionActions(candidates));
  }

  function buildQianggangReactionCandidates(runtime, seatKey, tileCode, hooks = {}) {
    const seatIndex = hooks.getSeatIndex(runtime, seatKey);
    if (seatIndex < 0 || !tileCode) return [];

    const candidates = [];
    const activeSeats = hooks.getActiveSeats(runtime, seatKey);

    activeSeats.forEach((otherSeat) => {
      const otherIndex = hooks.getSeatIndex(runtime, otherSeat);
      if (otherIndex < 0) return;

      const claimTileCode = hooks.getClaimTileCode(tileCode, seatIndex, otherIndex);
      const seatOrder = (4 + otherIndex - seatIndex) % 4;
      const shoupai = runtime.board.shoupai[otherIndex];
      const hupai = hooks.buildHupaiContext(runtime, otherSeat, {
        seatIndex: otherIndex,
        shoupai,
        claimTileCode,
        tileCode,
        selfDraw: false,
        qianggang: true
      });

      if (!hooks.allowHule(runtime, shoupai, claimTileCode, otherIndex, hupai, otherSeat)) {
        return;
      }

      const huleAction = hooks.createReactionAction({
        type: 'hule',
        key: `hule:qianggang:${otherSeat}`,
        label: '荣',
        seat: otherSeat,
        priority: hooks.reactionPriority.HULE,
        bgChar: '荣',
        variant: 'alert-red',
        row: 0,
        payload: {
          seat: otherSeat,
          claimTileCode,
          tileCode,
          fromSeat: seatKey,
          qianggang: true
        }
      });
      huleAction.reactionOrder = seatOrder;
      candidates.push(huleAction);

      const passAction = hooks.createPassAction({
        key: `pass:qianggang:${otherSeat}`,
        label: '过',
        priority: hooks.reactionPriority.PASS,
        bgChar: '过',
        variant: 'skip',
        row: 1,
        payload: {
          seat: otherSeat,
          tileCode,
          fromSeat: seatKey,
          qianggang: true
        }
      });
      passAction.reactionOrder = seatOrder;
      candidates.push(passAction);
    });

    return hooks.sortReactionActions(candidates);
  }

  function createRuntimeReactionHelpers() {
    return {
      buildReactionPreview,
      finalizeReactionLabels,
      buildReactionCandidates,
      buildQianggangReactionCandidates
    };
  }

  createRuntimeReactionHelpers.buildReactionPreview = buildReactionPreview;
  createRuntimeReactionHelpers.finalizeReactionLabels = finalizeReactionLabels;
  createRuntimeReactionHelpers.buildReactionCandidates = buildReactionCandidates;
  createRuntimeReactionHelpers.buildQianggangReactionCandidates = buildQianggangReactionCandidates;

  return createRuntimeReactionHelpers;
});
