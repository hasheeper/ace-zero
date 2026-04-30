'use strict';

const { createSeatMapper } = require('./seat-mapper');
const { mjaiTileToLocal } = require('./tile-codec');
const { buildLocalMeldStringFromMjaiCall, buildLocalKanMeldStringFromMjaiKan } = require('./meld-codec');

class MjaiActionDecoder {
  constructor(runtime, options = {}) {
    this.runtime = runtime;
    this.seatMapper = options.seatMapper || createSeatMapper(runtime, options);
    this.pendingRiichiActors = new Set();
  }

  decode(line, options = {}) {
    const payload = typeof line === 'string' ? JSON.parse(line) : line;
    if (!payload || typeof payload !== 'object' || !payload.type) return null;

    switch (payload.type) {
      case 'reach':
        this.pendingRiichiActors.add(Number(payload.actor));
        return {
          type: 'reach-intent',
          runtimeAction: null,
          raw: payload
        };
      case 'dahai':
        return this.decodeDiscard(payload);
      case 'none':
        return this.decodePass(payload, options);
      case 'pon':
        return this.decodeCall(payload, 'peng');
      case 'chi':
        return this.decodeCall(payload, 'chi');
      case 'daiminkan':
        return this.decodeKan(payload, 'daiminkan');
      case 'kakan':
        return this.decodeKan(payload, 'kakan');
      case 'ankan':
        return this.decodeKan(payload, 'ankan');
      case 'dora':
        return this.decodeDora(payload);
      case 'reach_accepted':
        return this.decodeMeta(payload, 'reach-accepted');
      case 'hora':
        return this.decodeHora(payload);
      case 'ryukyoku':
        return this.decodeRyukyoku(payload);
      case 'end_kyoku':
        return this.decodeMeta(payload, 'end-kyoku');
      case 'end_game':
        return this.decodeMeta(payload, 'end-game');
      default:
        return {
          type: 'unsupported',
          runtimeAction: null,
          raw: payload
        };
    }
  }

  decodeDiscard(payload) {
    const actor = Number(payload.actor);
    const seatKey = this.seatMapper.playerIdToSeatKey(actor);
    const tileCode = mjaiTileToLocal(payload.pai);
    const riichi = this.pendingRiichiActors.has(actor);
    this.pendingRiichiActors.delete(actor);

    return {
      type: 'discard',
      runtimeAction: {
        type: 'discard',
        payload: {
          seat: seatKey,
          tileCode,
          riichi
        }
      },
      raw: payload
    };
  }

  decodePass(payload, options = {}) {
    const seatKey = options.seatKey || null;
    return {
      type: 'pass',
      runtimeAction: seatKey
        ? {
            type: 'pass',
            payload: {
              seat: seatKey,
              reason: 'mjai-none'
            }
          }
        : null,
      raw: payload
    };
  }

  decodeCall(payload, callType) {
    const actor = Number(payload.actor);
    const target = Number(payload.target);
    const seatKey = this.seatMapper.playerIdToSeatKey(actor);
    const fromSeat = this.seatMapper.playerIdToSeatKey(target);
    const meldString = buildLocalMeldStringFromMjaiCall(
      callType,
      payload.pai,
      Array.isArray(payload.consumed) ? payload.consumed : [],
      actor,
      target,
      this.seatMapper
    );

    return {
      type: 'call',
      runtimeAction: meldString
        ? {
            type: 'call',
            payload: {
              seat: seatKey,
              fromSeat,
              tileCode: mjaiTileToLocal(payload.pai),
              callType,
              meldString
            }
          }
        : null,
      raw: payload
    };
  }

  decodeHora(payload) {
    const actor = Number(payload.actor);
    const target = Number(payload.target);
    const seatKey = this.seatMapper.playerIdToSeatKey(actor);
    const fromSeat = Number.isInteger(target) ? this.seatMapper.playerIdToSeatKey(target) : null;

    return {
      type: 'hule',
      runtimeAction: seatKey
        ? {
            type: 'hule',
            payload: {
              seat: seatKey,
              fromSeat
            }
          }
        : null,
      raw: payload
    };
  }

  decodeRyukyoku(payload) {
    return {
      type: 'draw-round',
      runtimeAction: {
        type: 'draw-round',
        payload: {
          reason: 'mjai-ryukyoku'
        }
      },
      raw: payload
    };
  }

  decodeKan(payload, kanType) {
    const actor = Number(payload.actor);
    const seatKey = this.seatMapper.playerIdToSeatKey(actor);
    const meldString = buildLocalKanMeldStringFromMjaiKan(kanType, payload, this.seatMapper);
    return {
      type: 'kan',
      runtimeAction: seatKey && meldString
        ? {
            type: 'kan',
            payload: {
              seat: seatKey,
              meldString,
              meld: meldString
            }
          }
        : null,
      raw: payload
    };
  }

  decodeDora(payload) {
    return {
      type: 'dora',
      runtimeAction: payload && payload.dora_marker
        ? {
            type: 'flip-dora',
            payload: {
              tileCode: mjaiTileToLocal(payload.dora_marker)
            }
          }
        : null,
      raw: payload
    };
  }

  decodeMeta(payload, type) {
    return {
      type,
      runtimeAction: null,
      raw: payload
    };
  }
}

module.exports = {
  MjaiActionDecoder
};
