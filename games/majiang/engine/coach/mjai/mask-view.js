'use strict';

const { localTileToMjai } = require('./tile-codec');

function buildMaskedTehais(runtime, perspectiveSeatKey, seatMapper) {
  return seatMapper.seatKeys.map((seatKey) => {
    if (seatKey !== perspectiveSeatKey) {
      return new Array(13).fill('?');
    }
    if (!runtime || typeof runtime.getSeatHandCodes !== 'function') {
      return new Array(13).fill('?');
    }
    return runtime.getSeatHandCodes(seatKey).slice(0, 13).map((code) => localTileToMjai(code) || '?');
  });
}

module.exports = {
  buildMaskedTehais
};
