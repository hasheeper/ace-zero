'use strict';

const HONOR_TO_MJAI = Object.freeze({
  z1: 'E',
  z2: 'S',
  z3: 'W',
  z4: 'N',
  z5: 'P',
  z6: 'F',
  z7: 'C'
});

const MJAI_TO_HONOR = Object.freeze(Object.entries(HONOR_TO_MJAI).reduce((result, [local, mjai]) => {
  result[mjai] = local;
  return result;
}, {}));

function normalizeLocalTileCode(tileCode) {
  if (typeof tileCode !== 'string' || tileCode.length < 2) return null;
  return String(tileCode).replace(/[\*_\+\=\-]+$/g, '');
}

function localTileToMjai(tileCode) {
  const normalized = normalizeLocalTileCode(tileCode);
  if (!normalized) return null;

  if (HONOR_TO_MJAI[normalized]) {
    return HONOR_TO_MJAI[normalized];
  }

  const suit = normalized[0];
  const rank = normalized[1];
  if ((suit === 'm' || suit === 'p' || suit === 's') && rank === '0') {
    return `5${suit}r`;
  }
  if (suit === 'm' || suit === 'p' || suit === 's') {
    return `${rank}${suit}`;
  }

  return null;
}

function mjaiTileToLocal(tileCode) {
  if (typeof tileCode !== 'string' || !tileCode) return null;
  const normalized = String(tileCode);

  if (MJAI_TO_HONOR[normalized]) {
    return MJAI_TO_HONOR[normalized];
  }

  const redMatch = normalized.match(/^5([mps])r$/);
  if (redMatch) {
    return `${redMatch[1]}0`;
  }

  const suitMatch = normalized.match(/^([1-9])([mps])$/);
  if (suitMatch) {
    return `${suitMatch[2]}${suitMatch[1]}`;
  }

  return null;
}

module.exports = {
  HONOR_TO_MJAI,
  MJAI_TO_HONOR,
  normalizeLocalTileCode,
  localTileToMjai,
  mjaiTileToLocal
};
