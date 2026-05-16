(function(global) {
  'use strict';

  function createFrontendEffects(options = {}) {
    const globalRef = options.global || global;
    const logRuntime = typeof options.logRuntime === 'function'
      ? options.logRuntime
      : function noopLogRuntime() {};
    const clone = typeof options.clone === 'function'
      ? options.clone
      : function cloneValue(value) { return JSON.parse(JSON.stringify(value)); };
    const canonicalSeatKeys = Array.isArray(options.canonicalSeatKeys)
      ? options.canonicalSeatKeys.slice()
      : ['bottom', 'right', 'top', 'left'];

    function normalizeRoundResultTileCode(tileCode) {
      const value = String(tileCode || '').trim();
      const match = value.match(/^[mpsz][0-9]/i);
      return match ? match[0].toLowerCase() : null;
    }

    function extractHuleYakuNames(result = null) {
      return result && Array.isArray(result.hupai)
        ? result.hupai.map((item) => item && item.name).filter(Boolean)
        : [];
    }

    function buildHuleLogSummary(result = null) {
      if (!result || typeof result !== 'object') {
        return {
          番数: null,
          符数: null,
          役种名称: []
        };
      }
      return {
        番数: Number.isFinite(Number(result.fanshu)) ? Number(result.fanshu) : result.fanshu ?? null,
        符数: Number.isFinite(Number(result.fu)) ? Number(result.fu) : result.fu ?? null,
        役种名称: extractHuleYakuNames(result)
      };
    }

    function buildSeatWindLogDetail(snapshot = null) {
      const info = snapshot && snapshot.info ? snapshot.info : null;
      const seatWinds = info && info.seatWinds && typeof info.seatWinds === 'object'
        ? info.seatWinds
        : null;
      const seatWindMap = {};

      canonicalSeatKeys.forEach((seatKey) => {
        const windState = seatWinds && seatWinds[seatKey] ? seatWinds[seatKey] : null;
        seatWindMap[seatKey] = windState && typeof windState.label === 'string' && windState.label
          ? windState.label
          : null;
      });

      const dealerSeat = info && typeof info.dealerSeat === 'string' ? info.dealerSeat : null;
      const turnSeat = info && typeof info.turnSeat === 'string' ? info.turnSeat : null;

      return {
        风位映射: seatWindMap,
        dealerSeat,
        dealerWind: dealerSeat && seatWindMap[dealerSeat] ? seatWindMap[dealerSeat] : null,
        turnSeat,
        turnWind: turnSeat && seatWindMap[turnSeat] ? seatWindMap[turnSeat] : null
      };
    }

    function formatRoundCutInLabel(matchState = null) {
      if (!matchState || typeof matchState !== 'object') return '东一局';
      const windLabels = ['东', '南', '西', '北'];
      const zhuangfeng = Number.isInteger(matchState.zhuangfeng) ? matchState.zhuangfeng : 0;
      const jushu = Number.isInteger(matchState.jushu) ? matchState.jushu : 0;
      return `${windLabels[zhuangfeng] || '东'}${jushu + 1}局`;
    }

    function formatSpacedCutInLabel(label = '') {
      return String(label || '')
        .trim()
        .split('')
        .filter(Boolean)
        .join(' ');
    }

    function queueWinnerReveal(table, event, roundResult, options = {}) {
      if (!table || typeof table.playWinnerRevealForSeat !== 'function') return;
      if (!roundResult || roundResult.type !== 'hule') return;
      const winnerSeat = roundResult.winnerSeat || null;
      if (!winnerSeat) return;

      const snapshot = event && event.snapshot ? event.snapshot : null;
      const truthSeats = snapshot && snapshot.views && snapshot.views.truthView && snapshot.views.truthView.seats
        ? snapshot.views.truthView.seats
        : null;
      const seatSnapshot = truthSeats && truthSeats[winnerSeat]
        ? truthSeats[winnerSeat]
        : (snapshot && snapshot.seats ? snapshot.seats[winnerSeat] : null);
      const handTiles = seatSnapshot && Array.isArray(seatSnapshot.handTiles)
        ? seatSnapshot.handTiles.map((tile) => ({ ...tile }))
        : [];
      const winningTileCode = normalizeRoundResultTileCode(roundResult.rongpai || roundResult.tileCode || null);
      const delayMs = Number.isFinite(Number(options.delayMs)) ? Number(options.delayMs) : 420;

      globalRef.setTimeout(() => {
        try {
          table.playWinnerRevealForSeat(winnerSeat, {
            handTiles,
            winningTileCode,
            autoClearMs: 0
          });
        } catch (error) {
          logRuntime('warn', '和牌后赢家推平动画播放失败', {
            winnerSeat,
            winningTileCode,
            message: error && error.message ? error.message : String(error)
          });
        }
      }, Math.max(0, delayMs));
    }

    function queueSettlementPanel(table, payload = {}, options = {}) {
      if (!table || typeof table.openSettlementPanel !== 'function') return;
      const delayMs = Number.isFinite(Number(options.delayMs)) ? Number(options.delayMs) : 720;
      globalRef.setTimeout(() => {
        try {
          table.openSettlementPanel(payload);
        } catch (error) {
          logRuntime('warn', '结算面板打开失败', {
            message: error && error.message ? error.message : String(error),
            roundType: payload && payload.roundResult ? payload.roundResult.type : null
          });
        }
      }, Math.max(0, delayMs));
    }

    return {
      normalizeRoundResultTileCode,
      extractHuleYakuNames,
      buildHuleLogSummary,
      buildSeatWindLogDetail,
      formatRoundCutInLabel,
      formatSpacedCutInLabel,
      queueWinnerReveal,
      queueSettlementPanel
    };
  }

  global.AceMahjongBridgeFrontendEffects = {
    create: createFrontendEffects
  };
})(typeof window !== 'undefined' ? window : globalThis);
