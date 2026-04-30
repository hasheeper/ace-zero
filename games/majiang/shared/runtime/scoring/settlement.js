(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.AceMahjongCreateRuntimeSettlementHelpers = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  function getSeatKeyByIndex(runtime, seatIndex, hooks = {}) {
    if (typeof hooks.getSeatKeyByIndex === 'function') {
      return hooks.getSeatKeyByIndex(runtime, seatIndex);
    }
    if (runtime && typeof runtime.getSeatKeyByIndex === 'function') {
      return runtime.getSeatKeyByIndex(seatIndex);
    }
    const seatKeys = Array.isArray(hooks.seatKeys) ? hooks.seatKeys : ['bottom', 'right', 'top', 'left'];
    return seatKeys[seatIndex] || null;
  }

  function getSeatKitaState(runtime, seatKey, hooks = {}) {
    if (typeof hooks.getSeatKitaState === 'function') {
      return hooks.getSeatKitaState(runtime, seatKey);
    }
    return runtime && runtime.seatMeta && runtime.seatMeta[seatKey]
      ? runtime.seatMeta[seatKey]
      : null;
  }

  function getSeatKitaCount(runtime, seatKey, hooks = {}) {
    const seatState = getSeatKitaState(runtime, seatKey, hooks);
    return seatState && Array.isArray(seatState.kitaTiles)
      ? seatState.kitaTiles.length
      : 0;
  }

  function getSeatKitaTiles(runtime, seatKey, hooks = {}) {
    const seatState = getSeatKitaState(runtime, seatKey, hooks);
    return seatState && Array.isArray(seatState.kitaTiles)
      ? seatState.kitaTiles.map((tile) => ({ ...tile }))
      : [];
  }

  function getActiveSeatIndices(runtime, hooks = {}) {
    const seatKeys = runtime && runtime.topology && Array.isArray(runtime.topology.activeSeats)
      ? runtime.topology.activeSeats.slice()
      : ['bottom', 'right', 'top', 'left'];
    return seatKeys
      .map((seatKey) => (typeof hooks.getSeatIndex === 'function' ? hooks.getSeatIndex(runtime, seatKey) : -1))
      .filter((seatIndex) => Number.isInteger(seatIndex) && seatIndex >= 0);
  }

  function getSeatMenfengIndex(runtime, seatKey, seatIndex, hooks = {}) {
    if (typeof hooks.getSeatMenfengIndex === 'function') {
      return hooks.getSeatMenfengIndex(runtime, seatKey, seatIndex);
    }

    const resolvedSeatIndex = Number.isInteger(seatIndex)
      ? seatIndex
      : (seatKey && typeof hooks.getSeatIndex === 'function' ? hooks.getSeatIndex(runtime, seatKey) : -1);
    return resolvedSeatIndex;
  }

  function isSanmaRuleset(runtime) {
    return Boolean(
      runtime
        && runtime.rulesetProfile
        && runtime.rulesetProfile.id === 'riichi-3p-sanma'
    );
  }

  function normalizeSanmaDoraIndicatorForCore(tileCode) {
    if (typeof tileCode !== 'string' || tileCode.length < 2) {
      return tileCode;
    }
    return tileCode[0] === 'm' && tileCode[1] === '1'
      ? `m8${tileCode.slice(2)}`
      : tileCode;
  }

  function resolveDoraIndicatorsForScoring(runtime, indicators) {
    const source = Array.isArray(indicators) ? indicators : [];
    if (!isSanmaRuleset(runtime)) {
      return source.slice();
    }
    return source.map((tileCode) => normalizeSanmaDoraIndicatorForCore(tileCode));
  }

  function getRuntimeWallState(runtime) {
    return runtime && typeof runtime.getWallState === 'function'
      ? runtime.getWallState()
      : {
          remaining: runtime && runtime.board && runtime.board.shan
            ? Number(runtime.board.shan.paishu || 0)
            : 0,
          baopai: runtime && runtime.board && runtime.board.shan && Array.isArray(runtime.board.shan.baopai)
            ? runtime.board.shan.baopai.slice()
            : [],
          fubaopai: runtime && runtime.board && runtime.board.shan && Array.isArray(runtime.board.shan.fubaopai)
            ? runtime.board.shan.fubaopai.slice()
            : []
        };
  }

  function getTianhuValue(runtime, seatKey, options = {}, hooks = {}) {
    if (Number.isFinite(Number(options.tianhu))) {
      return Number(options.tianhu);
    }

    const hasClaimTile = Boolean(options.rongpai || options.claimTileCode);
    const isSelfDraw = Object.prototype.hasOwnProperty.call(options, 'selfDraw')
      ? Boolean(options.selfDraw)
      : !hasClaimTile;
    if (!isSelfDraw || options.qianggang || options.lingshang) return 0;
    if (!runtime || runtime.doubleRiichiWindowOpen !== true) return 0;

    const seatIndex = Number.isInteger(options.seatIndex)
      ? options.seatIndex
      : hooks.getSeatIndex(runtime, seatKey);
    const menfengIndex = getSeatMenfengIndex(runtime, seatKey, seatIndex, hooks);
    const turnState = seatKey ? hooks.getSeatTurnState(runtime, seatKey) : null;
    if (!turnState || turnState.discardTurns !== 0) return 0;

    if (menfengIndex === 0) {
      return runtime.turnCounter === 0 ? 1 : 0;
    }

    return runtime.turnCounter >= 1 ? 2 : 0;
  }

  function buildHupaiContext(runtime, seatKey, options = {}, hooks = {}) {
    const seatIndex = Number.isInteger(options.seatIndex)
      ? options.seatIndex
      : hooks.getSeatIndex(runtime, seatKey);
    const shoupai = options.shoupai || (runtime.board && runtime.board.shoupai ? runtime.board.shoupai[seatIndex] : null);
    const seatRiichiState = seatKey ? hooks.getSeatRiichiState(runtime, seatKey) : null;
    const isRiichiHand = Boolean((seatRiichiState && seatRiichiState.declared) || (shoupai && shoupai.lizhi));
    const hasClaimTile = Boolean(options.rongpai || options.claimTileCode);
    const isSelfDraw = Object.prototype.hasOwnProperty.call(options, 'selfDraw')
      ? Boolean(options.selfDraw)
      : !hasClaimTile;
    const wallState = getRuntimeWallState(runtime);
    const remaining = Number(wallState.remaining || 0) || 0;
    const qianggang = Boolean(options.qianggang);
    const lingshang = Boolean(options.lingshang);
    let haidi = Number.isFinite(Number(options.haidi)) ? Number(options.haidi) : 0;

    if (!haidi && !qianggang && !lingshang && remaining === 0) {
      haidi = isSelfDraw ? 1 : 2;
    }

    return {
      lizhi: isRiichiHand ? ((seatRiichiState && seatRiichiState.doubleRiichi) ? 2 : 1) : 0,
      yifa: Boolean(seatRiichiState && seatRiichiState.ippatsuEligible),
      qianggang,
      lingshang,
      haidi,
      tianhu: getTianhuValue(runtime, seatKey, {
        ...options,
        seatIndex,
        shoupai,
        selfDraw: isSelfDraw
      }, hooks),
      kita: Number.isFinite(Number(options.kitaCount))
        ? Number(options.kitaCount)
        : getSeatKitaCount(runtime, seatKey, hooks)
    };
  }

  function createHuleParams(runtime, shoupai, seatIndex, options = {}, hooks = {}) {
    const seatKey = getSeatKeyByIndex(runtime, seatIndex, hooks);
    const hupai = options.hupai && typeof options.hupai === 'object'
      ? { ...options.hupai }
      : buildHupaiContext(runtime, seatKey, {
          ...options,
          seatIndex,
          shoupai
        }, hooks);
    const isRiichiHand = Boolean(hupai.lizhi);
    const wallState = getRuntimeWallState(runtime);
    const useFubaopai = Object.prototype.hasOwnProperty.call(options, 'fubaopai')
      ? options.fubaopai
      : (isRiichiHand ? wallState.fubaopai || [] : []);
    const menfengIndex = getSeatMenfengIndex(runtime, seatKey, seatIndex, hooks);

    return {
      zhuangfeng: runtime.board.zhuangfeng,
      menfeng: menfengIndex,
      lizhi: Number(hupai.lizhi || 0),
      yifa: Boolean(hupai.yifa),
      qianggang: Boolean(hupai.qianggang),
      lingshang: Boolean(hupai.lingshang),
      haidi: Number(hupai.haidi || 0),
      tianhu: Number(hupai.tianhu || 0),
      kita: Number(hupai.kita || 0),
      baopai: resolveDoraIndicatorsForScoring(
        runtime,
        wallState.baopai || []
      ),
      fubaopai: resolveDoraIndicatorsForScoring(runtime, useFubaopai),
      changbang: runtime.board.changbang || 0,
      lizhibang: runtime.board.lizhibang || 0
    };
  }

  function calculateBasePoints(rule, fu, fanshu, damanguan) {
    if (Number.isFinite(Number(damanguan)) && Number(damanguan) > 0) {
      return 8000 * Number(damanguan);
    }
    if (!Number.isFinite(Number(fu)) || !Number.isFinite(Number(fanshu))) return 0;
    const resolvedFu = Number(fu);
    const resolvedFanshu = Number(fanshu);
    return (resolvedFanshu >= 13 && rule['数え役満あり'])
      ? 8000
      : (resolvedFanshu >= 11) ? 6000
      : (resolvedFanshu >= 8) ? 4000
      : (resolvedFanshu >= 6) ? 3000
      : (rule['切り上げ満貫あり'] && resolvedFu << (2 + resolvedFanshu) === 1920)
        ? 2000
        : Math.min(resolvedFu << (2 + resolvedFanshu), 2000);
  }

  function buildRonFenpei(seatIndex, fromSeatIndex, defen, chang, lizhi) {
    const fenpei = [0, 0, 0, 0];
    fenpei[seatIndex] += defen + chang * 300 + lizhi * 1000;
    if (fromSeatIndex >= 0) {
      fenpei[fromSeatIndex] -= defen + chang * 300;
    }
    return fenpei;
  }

  function recalculateHandScore(runtime, seatIndex, fu, fanshu, options = {}, hooks = {}) {
    const menfeng = getSeatMenfengIndex(runtime, null, seatIndex, hooks);
    const rule = runtime && runtime.rule ? runtime.rule : {};
    const rulesetProfile = runtime && runtime.rulesetProfile ? runtime.rulesetProfile : {};
    const base = calculateBasePoints(rule, fu, fanshu, options.damanguan);
    const chang = runtime && runtime.board ? Number(runtime.board.changbang || 0) : 0;
    const lizhi = runtime && runtime.board ? Number(runtime.board.lizhibang || 0) : 0;
    const fromSeatIndex = Number.isInteger(options.baojiaIndex)
      ? options.baojiaIndex
      : (options.fromSeat && typeof hooks.getSeatIndex === 'function'
        ? hooks.getSeatIndex(runtime, options.fromSeat)
        : -1);
    const honbaPerPayer = Number.isFinite(Number(rulesetProfile.tsumoHonbaPerPayer))
      ? Number(rulesetProfile.tsumoHonbaPerPayer)
      : 100;
    const zhuangjia = Math.ceil(base * 2 / 100) * 100;
    const sanjia = Math.ceil(base / 100) * 100;

    if (fromSeatIndex >= 0 || options.rongpai) {
      const defen = Math.ceil(base * (menfeng === 0 ? 6 : 4) / 100) * 100;
      return {
        fu,
        fanshu,
        damanguan: Number.isFinite(Number(options.damanguan)) ? Number(options.damanguan) : undefined,
        defen,
        fenpei: buildRonFenpei(seatIndex, fromSeatIndex, defen, chang, lizhi)
      };
    }

    const activeSeatIndices = getActiveSeatIndices(runtime, hooks);
    const payerSeatIndices = activeSeatIndices.filter((index) => index !== seatIndex);
    const fenpei = [0, 0, 0, 0];
    let defen = 0;

    if (rulesetProfile.tsumoPaymentModel === 'heads-up-2p' && payerSeatIndices.length === 1) {
      const solePayerSeatIndex = payerSeatIndices[0];
      defen = Math.ceil(base * (menfeng === 0 ? 6 : 4) / 100) * 100;
      return {
        fu,
        fanshu,
        damanguan: Number.isFinite(Number(options.damanguan)) ? Number(options.damanguan) : undefined,
        defen,
        fenpei: buildRonFenpei(seatIndex, solePayerSeatIndex, defen, chang, lizhi)
      };
    }

    if (rulesetProfile.tsumoPaymentModel === 'tsumo-loss-3p' && payerSeatIndices.length === 2) {
      if (menfeng === 0) {
        const eachPayment = zhuangjia;
        defen = eachPayment * payerSeatIndices.length;
        fenpei[seatIndex] += defen + chang * honbaPerPayer * payerSeatIndices.length + lizhi * 1000;
        payerSeatIndices.forEach((payerSeatIndex) => {
          fenpei[payerSeatIndex] -= eachPayment + chang * honbaPerPayer;
        });
      } else {
        const dealerSeatIndex = activeSeatIndices.find((index) => index === 0);
        const childSeatIndex = payerSeatIndices.find((index) => index !== dealerSeatIndex);
        const dealerPayment = zhuangjia;
        const childPayment = sanjia;
        defen = dealerPayment + childPayment;
        fenpei[seatIndex] += defen + chang * honbaPerPayer * payerSeatIndices.length + lizhi * 1000;
        if (dealerSeatIndex >= 0) {
          fenpei[dealerSeatIndex] -= dealerPayment + chang * honbaPerPayer;
        }
        if (childSeatIndex >= 0) {
          fenpei[childSeatIndex] -= childPayment + chang * honbaPerPayer;
        }
      }
    } else {
      if (menfeng === 0) {
        defen = zhuangjia * 3;
        for (let seatOffset = 0; seatOffset < 4; seatOffset += 1) {
          if (seatOffset === seatIndex) fenpei[seatOffset] += defen + chang * 300 + lizhi * 1000;
          else fenpei[seatOffset] -= zhuangjia + chang * 100;
        }
      } else {
        defen = zhuangjia + sanjia * 2;
        for (let seatOffset = 0; seatOffset < 4; seatOffset += 1) {
          if (seatOffset === seatIndex) fenpei[seatOffset] += defen + chang * 300 + lizhi * 1000;
          else if (seatOffset === 0) fenpei[seatOffset] -= zhuangjia + chang * 100;
          else fenpei[seatOffset] -= sanjia + chang * 100;
        }
      }
    }

    return {
      fu,
      fanshu,
      damanguan: Number.isFinite(Number(options.damanguan)) ? Number(options.damanguan) : undefined,
      defen,
      fenpei
    };
  }

  function applyKitaSettlementAdjustments(runtime, seatIndex, result, options = {}, hooks = {}) {
    if (!result || !runtime) {
      return result;
    }

    const seatKey = getSeatKeyByIndex(runtime, seatIndex, hooks);
    const kitaCount = Number.isFinite(Number(options.kitaCount))
      ? Number(options.kitaCount)
      : getSeatKitaCount(runtime, seatKey, hooks);

    const adjusted = {
      ...result,
      hupai: Array.isArray(result.hupai) ? result.hupai.map((item) => ({ ...item })) : []
    };

    adjusted.kitaCount = kitaCount;
    adjusted.kitaTiles = getSeatKitaTiles(runtime, seatKey, hooks);

    if (runtime.rulesetProfile && runtime.rulesetProfile.id === 'riichi-3p-sanma' && kitaCount > 0) {
      adjusted.hupai.push({
        name: '抜きドラ',
        fanshu: kitaCount
      });
    }

    const adjustedFanshu = Number(adjusted.fanshu || 0) + (
      runtime.rulesetProfile && runtime.rulesetProfile.id === 'riichi-3p-sanma'
        ? kitaCount
        : 0
    );

    if ((runtime.rulesetProfile && runtime.rulesetProfile.id === 'riichi-3p-sanma')
        || kitaCount > 0) {
      const rescored = recalculateHandScore(
        runtime,
        seatIndex,
        Number(adjusted.fu || 0),
        adjustedFanshu,
        {
          ...options,
          damanguan: adjusted.damanguan
        },
        hooks
      );
      adjusted.fanshu = rescored.fanshu;
      adjusted.defen = rescored.defen;
      adjusted.fenpei = rescored.fenpei.slice();
    }

    return adjusted;
  }

  function closeRoundShan(runtime) {
    if (!runtime || !runtime.board || !runtime.board.shan || typeof runtime.board.shan.close !== 'function') {
      return;
    }
    try {
      runtime.board.shan.close();
    } catch (error) {
      // Ignore repeated close calls at round end.
    }
  }

  function getResolvedFubaopai(runtime, shoupai, options = {}, hooks = {}) {
    if (Object.prototype.hasOwnProperty.call(options, 'fubaopai')) {
      return Array.isArray(options.fubaopai) ? options.fubaopai.slice() : options.fubaopai;
    }
    const seatKey = Number.isInteger(options.seatIndex)
      ? getSeatKeyByIndex(runtime, options.seatIndex, hooks)
      : null;
    const seatRiichiState = seatKey ? hooks.getSeatRiichiState(runtime, seatKey) : null;
    if (!(seatRiichiState && seatRiichiState.declared) && !(shoupai && shoupai.lizhi)) return null;
    closeRoundShan(runtime);
    return Array.isArray(getRuntimeWallState(runtime).fubaopai)
      ? getRuntimeWallState(runtime).fubaopai.slice()
      : [];
  }

  function applyHuleSettlement(runtime, seatIndex, result, options = {}) {
    const board = runtime && runtime.board ? runtime.board : null;
    if (!board) return;

    const currentHand = board.shoupai[seatIndex] ? board.shoupai[seatIndex].clone() : null;
    if (currentHand) {
      const settledHandString = options.rongpai
        ? currentHand.zimo(options.rongpai).toString()
        : currentHand.toString();
      board.shoupai[seatIndex].fromString(settledHandString);
      if (options.baojiaIndex != null) {
        const winningTile = board.shoupai[seatIndex].get_dapai().pop();
        if (winningTile) {
          board.shoupai[seatIndex].dapai(winningTile);
        }
      }
    }

    const fenpei = Array.isArray(result && result.fenpei) ? result.fenpei.slice() : [0, 0, 0, 0];
    for (let seatOffset = 0; seatOffset < 4; seatOffset += 1) {
      board.defen[board.player_id[seatOffset]] += Number(fenpei[seatOffset] || 0);
    }

    board.changbang = 0;
    board.lizhibang = 0;
    if ('_changbang' in board) board._changbang = board.changbang;
    if ('_lizhibang' in board) board._lizhibang = 0;
    if ('_fenpei' in board) board._fenpei = fenpei.slice();
    {
      const renchanMode = Number(runtime && runtime.rule ? runtime.rule['連荘方式'] || 0 : 0);
      const hasDealerWinner = seatIndex === 0;
      board._lianzhuang = Number(runtime && runtime.rule ? runtime.rule['場数'] || 0 : 0) === 0
        ? false
        : (renchanMode > 0 && hasDealerWinner);
    }
  }

  function applyDrawSettlement(runtime, options = {}) {
    const board = runtime && runtime.board ? runtime.board : null;
    if (!board) return;

    closeRoundShan(runtime);

    const revealedHands = Array.isArray(options.revealedHands) ? options.revealedHands : null;
    if (revealedHands) {
      for (let seatIndex = 0; seatIndex < Math.min(revealedHands.length, board.shoupai.length); seatIndex += 1) {
        if (typeof revealedHands[seatIndex] === 'string' && revealedHands[seatIndex]) {
          board.shoupai[seatIndex].fromString(revealedHands[seatIndex]);
        }
      }
    }

    const fenpei = Array.isArray(options.fenpei) ? options.fenpei.slice() : [0, 0, 0, 0];
    for (let seatOffset = 0; seatOffset < 4; seatOffset += 1) {
      board.defen[board.player_id[seatOffset]] += Number(fenpei[seatOffset] || 0);
    }

    board.changbang = Number(board.changbang || 0) + 1;
    if ('_changbang' in board) board._changbang = board.changbang;
    if ('_fenpei' in board) board._fenpei = fenpei.slice();
    if ('_lizhibang' in board) board._lizhibang = board.lizhibang;
    board._lianzhuang = Object.prototype.hasOwnProperty.call(options, 'dealerContinues')
      ? Boolean(options.dealerContinues)
      : true;
  }

  function createRuntimeSettlementHelpers() {
    return {
      getTianhuValue,
      buildHupaiContext,
      createHuleParams,
      closeRoundShan,
      getResolvedFubaopai,
      getSeatKitaCount,
      getSeatKitaTiles,
      applyKitaSettlementAdjustments,
      applyHuleSettlement,
      applyDrawSettlement
    };
  }

  createRuntimeSettlementHelpers.getTianhuValue = getTianhuValue;
  createRuntimeSettlementHelpers.buildHupaiContext = buildHupaiContext;
  createRuntimeSettlementHelpers.createHuleParams = createHuleParams;
  createRuntimeSettlementHelpers.closeRoundShan = closeRoundShan;
  createRuntimeSettlementHelpers.getResolvedFubaopai = getResolvedFubaopai;
  createRuntimeSettlementHelpers.getSeatKitaCount = getSeatKitaCount;
  createRuntimeSettlementHelpers.getSeatKitaTiles = getSeatKitaTiles;
  createRuntimeSettlementHelpers.applyKitaSettlementAdjustments = applyKitaSettlementAdjustments;
  createRuntimeSettlementHelpers.applyHuleSettlement = applyHuleSettlement;
  createRuntimeSettlementHelpers.applyDrawSettlement = applyDrawSettlement;

  return createRuntimeSettlementHelpers;
});
