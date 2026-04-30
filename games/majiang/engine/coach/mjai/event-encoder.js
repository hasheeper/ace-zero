'use strict';

const { buildMaskedTehais } = require('./mask-view');
const { createSeatMapper } = require('./seat-mapper');
const { localTileToMjai, normalizeLocalTileCode } = require('./tile-codec');
const { parseLocalMeldString, buildConsumedTilesForMjai } = require('./meld-codec');

const WIND_LABELS = Object.freeze(['E', 'S', 'W', 'N']);

class MjaiEventEncoder {
  constructor(runtime, options = {}) {
    this.runtime = runtime;
    this.perspectiveSeatKey = options.perspectiveSeatKey || 'bottom';
    this.seatMapper = options.seatMapper || createSeatMapper(runtime, options);
    this.lastDrawBySeat = new Map();
    this.lastDiscard = null;
    this.currentScores = this.seatMapper.getScoresByPlayerId();
  }

  buildBootstrapEvents() {
    const runtime = this.runtime;
    this.currentScores = this.seatMapper.getScoresByPlayerId();
    return [
      { type: 'start_game' },
      {
        type: 'start_kyoku',
        bakaze: WIND_LABELS[runtime.board.zhuangfeng] || 'E',
        dora_marker: localTileToMjai(runtime.getWallState().baopai[0]) || '?',
        kyoku: Math.max(1, Number(runtime.board.jushu || 0) + 1),
        honba: Number(runtime.board.changbang || 0),
        kyotaku: Number(runtime.board.lizhibang || 0),
        oya: this.seatMapper.getDealerPlayerId(),
        scores: this.seatMapper.getScoresByPlayerId(),
        tehais: buildMaskedTehais(runtime, this.perspectiveSeatKey, this.seatMapper)
      }
    ];
  }

  encodeEvent(event) {
    if (!event || typeof event !== 'object') return [];
    switch (event.type) {
      case 'tile:draw':
        return this.encodeDrawEvent(event);
      case 'tile:discard':
        return this.encodeDiscardEvent(event);
      case 'meld:call':
        return this.encodeCallEvent(event);
      case 'meld:kan':
        return this.encodeKanEvent(event);
      case 'dora:flip':
        return this.encodeDoraEvent(event);
      case 'round:end':
        return this.encodeRoundEndEvent(event);
      case 'session:finished':
        return this.encodeSessionFinishedEvent(event);
      case 'round:hule':
        return this.encodeHoraEvent(event);
      case 'round:draw':
        return this.encodeRyukyokuEvent(event);
      default:
        return [];
    }
  }

  encodeDrawEvent(event) {
    const seatKey = event.payload && event.payload.seat;
    const tileCode = event.payload && event.payload.tileCode;
    if (!seatKey || !tileCode) return [];

    const normalizedTile = normalizeLocalTileCode(tileCode);
    this.lastDrawBySeat.set(seatKey, normalizedTile);

    return [{
      type: 'tsumo',
      actor: this.seatMapper.seatKeyToPlayerId(seatKey),
      pai: seatKey === this.perspectiveSeatKey
        ? (localTileToMjai(normalizedTile) || '?')
        : '?'
    }];
  }

  encodeDiscardEvent(event) {
    const seatKey = event.payload && event.payload.seat;
    const tileCode = event.payload && event.payload.tileCode;
    if (!seatKey || !tileCode) return [];

    const actor = this.seatMapper.seatKeyToPlayerId(seatKey);
    const normalizedTile = normalizeLocalTileCode(tileCode);
    const lastDrawTile = this.lastDrawBySeat.get(seatKey) || null;
    const result = [];

    if (event.payload && event.payload.riichi) {
      result.push({
        type: 'reach',
        actor
      });
    }

    result.push({
      type: 'dahai',
      actor,
      pai: localTileToMjai(normalizedTile) || '?',
      tsumogiri: Boolean(lastDrawTile && lastDrawTile === normalizedTile)
    });

    this.lastDrawBySeat.delete(seatKey);
    this.lastDiscard = {
      seatKey,
      tileCode: normalizedTile
    };

    return result;
  }

  encodeCallEvent(event) {
    const seatKey = event.payload && event.payload.seat;
    const meldString = event.payload && event.payload.meld;
    if (!seatKey || !meldString || !this.lastDiscard) return [];

    const actor = this.seatMapper.seatKeyToPlayerId(seatKey);
    const target = this.seatMapper.seatKeyToPlayerId(this.lastDiscard.seatKey);
    const parsed = parseLocalMeldString(meldString);
    if (!parsed) return [];

    if (parsed.callType === 'chi' || parsed.callType === 'peng') {
      return [{
        type: parsed.callType === 'peng' ? 'pon' : 'chi',
        actor,
        target,
        pai: localTileToMjai(this.lastDiscard.tileCode) || '?',
        consumed: buildConsumedTilesForMjai(meldString, this.lastDiscard.tileCode)
      }];
    }

    return [];
  }

  encodeKanEvent(event) {
    const seatKey = event.payload && event.payload.seat;
    const meldString = event.payload && event.payload.meld;
    const kanType = event.payload && event.payload.kanType;
    if (!seatKey || !meldString) return [];

    const actor = this.seatMapper.seatKeyToPlayerId(seatKey);
    const parsed = parseLocalMeldString(meldString);
    if (!parsed) return [];

    if (kanType === 'kan-added') {
      const claimedTileCode = `${parsed.suit}${parsed.digits[parsed.digits.length - 1]}`;
      return [{
        type: 'kakan',
        actor,
        pai: localTileToMjai(claimedTileCode) || '?',
        consumed: buildConsumedTilesForMjai(meldString, claimedTileCode)
      }];
    }

    if (kanType === 'kan-concealed') {
      const consumed = parsed.digits
        .map((digit) => localTileToMjai(`${parsed.suit}${digit}`))
        .filter(Boolean);
      return [{
        type: 'ankan',
        actor,
        consumed
      }];
    }

    const targetSeatKey = this.lastDiscard ? this.lastDiscard.seatKey : null;
    const target = targetSeatKey ? this.seatMapper.seatKeyToPlayerId(targetSeatKey) : null;
    const claimedTileCode = this.lastDiscard ? this.lastDiscard.tileCode : `${parsed.suit}${parsed.digits[parsed.digits.length - 1]}`;
    if (target == null) return [];
    return [{
      type: 'daiminkan',
      actor,
      target,
      pai: localTileToMjai(claimedTileCode) || '?',
      consumed: buildConsumedTilesForMjai(meldString, claimedTileCode)
    }];
  }

  encodeDoraEvent(event) {
    const tileCode = event && event.payload ? event.payload.tileCode : null;
    if (!tileCode) return [];
    return [{
      type: 'dora',
      dora_marker: localTileToMjai(tileCode) || '?'
    }];
  }

  encodeRoundEndEvent(event) {
    if (!event || !event.payload || !event.payload.roundResult) return [];
    return [{ type: 'end_kyoku' }];
  }

  encodeSessionFinishedEvent(event) {
    if (!event || !event.payload) return [];
    return [{ type: 'end_game' }];
  }

  encodeHoraEvent(event) {
    const roundResult = event && event.payload ? event.payload.roundResult : null;
    if (!roundResult) return [];

    const deltas = this.buildScoreDeltas(roundResult.scores);
    const winners = roundResult.multiHule && Array.isArray(roundResult.winners) && roundResult.winners.length
      ? roundResult.winners
      : [roundResult];

    const horaEvents = winners
      .map((winner) => {
        if (!winner || !winner.winnerSeat) return null;
        const actor = this.seatMapper.seatKeyToPlayerId(winner.winnerSeat);
        const targetSeat = winner.fromSeat || roundResult.fromSeat || winner.winnerSeat;
        const target = this.seatMapper.seatKeyToPlayerId(targetSeat);
        const payload = {
          type: 'hora',
          actor,
          target
        };
        if (!roundResult.multiHule && deltas) {
          payload.deltas = deltas;
        }
        return payload;
      })
      .filter(Boolean);

    if (roundResult && roundResult.scores) {
      this.currentScores = this.seatMapper.getScoresByPlayerIdFromScoreMap
        ? this.seatMapper.getScoresByPlayerIdFromScoreMap(roundResult.scores)
        : this.currentScores;
    }

    return horaEvents;
  }

  encodeRyukyokuEvent(event) {
    const roundResult = event && event.payload ? event.payload.roundResult : null;
    if (!roundResult) return [];

    const payload = {
      type: 'ryukyoku'
    };
    const deltas = this.buildScoreDeltas(roundResult.scores);
    if (deltas) {
      payload.deltas = deltas;
    }

    if (roundResult && roundResult.scores) {
      this.currentScores = this.seatMapper.getScoresByPlayerIdFromScoreMap
        ? this.seatMapper.getScoresByPlayerIdFromScoreMap(roundResult.scores)
        : this.currentScores;
    }

    return [payload];
  }

  buildScoreDeltas(scoreMap) {
    if (!scoreMap || typeof scoreMap !== 'object') return null;
    const nextScores = this.seatMapper.getScoresByPlayerIdFromScoreMap
      ? this.seatMapper.getScoresByPlayerIdFromScoreMap(scoreMap)
      : null;
    if (!Array.isArray(nextScores) || !Array.isArray(this.currentScores) || nextScores.length !== this.currentScores.length) {
      return null;
    }
    return nextScores.map((score, index) => Number(score || 0) - Number(this.currentScores[index] || 0));
  }
}

module.exports = {
  MjaiEventEncoder
};
