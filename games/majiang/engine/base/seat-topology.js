(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }

  root.AceMahjongSeatTopology = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const CANONICAL_SEATS = ['bottom', 'right', 'top', 'left'];

  function clampTableSize(value) {
    const parsed = Number(value);
    if (parsed === 2 || parsed === 3 || parsed === 4) return parsed;
    return 4;
  }

  function resolveThreePlayerSeats(layout) {
    if (layout === 'bottom-right-top') return ['bottom', 'right', 'top'];
    return ['bottom', 'right', 'left'];
  }

  function createSeatTopology(options = {}) {
    const tableSize = clampTableSize(options.tableSize);
    const threePlayerLayout = typeof options.threePlayerLayout === 'string'
      ? options.threePlayerLayout
      : 'bottom-right-left';

    const activeSeats = tableSize === 2
      ? ['bottom', 'top']
      : tableSize === 3
        ? resolveThreePlayerSeats(threePlayerLayout)
        : CANONICAL_SEATS.slice();

    const hiddenSeats = CANONICAL_SEATS.filter((seatKey) => !activeSeats.includes(seatKey));

    return {
      tableSize,
      activeSeats,
      hiddenSeats,
      canonicalSeats: CANONICAL_SEATS.slice(),
      threePlayerLayout,
      getSeatIndex(seatKey) {
        return activeSeats.indexOf(seatKey);
      },
      getSeatKey(boardIndex) {
        return activeSeats[boardIndex] || null;
      },
      isActiveSeat(seatKey) {
        return activeSeats.includes(seatKey);
      },
      getNextSeat(seatKey) {
        const currentIndex = activeSeats.indexOf(seatKey);
        if (currentIndex < 0) return activeSeats[0] || 'bottom';
        return activeSeats[(currentIndex + 1) % activeSeats.length] || activeSeats[0] || 'bottom';
      },
      getPreviousSeat(seatKey) {
        const currentIndex = activeSeats.indexOf(seatKey);
        if (currentIndex < 0) return activeSeats[activeSeats.length - 1] || 'bottom';
        return activeSeats[(currentIndex + activeSeats.length - 1) % activeSeats.length] || activeSeats[0] || 'bottom';
      }
    };
  }

  return {
    CANONICAL_SEATS,
    clampTableSize,
    createSeatTopology
  };
});
