(function(global) {
  'use strict';

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function normalizeNumber(value, fallback = 0) {
    return Number.isFinite(Number(value)) ? Number(value) : fallback;
  }

  function buildRoundDescriptorFromSnapshot(snapshot = null) {
    const info = snapshot && snapshot.info && typeof snapshot.info === 'object' ? snapshot.info : null;
    const zhuangfeng = normalizeNumber(info && info.zhuangfeng, 0);
    const jushu = normalizeNumber(info && info.jushu, 0);
    return {
      id: `z${zhuangfeng}-j${jushu}`,
      label: `${['东', '南', '西', '北'][zhuangfeng] || '东'}${jushu + 1}局`,
      zhuangfeng,
      jushu
    };
  }

  function createCoachContextStore() {
    let activeRoundContext = null;
    let eventSeq = 0;

    function resetRoundContext(snapshot = null, initialDeal = null) {
      const round = buildRoundDescriptorFromSnapshot(snapshot);
      eventSeq = 0;
      activeRoundContext = {
        round,
        initialDeal: initialDeal ? clone(initialDeal) : null,
        runtimeEvents: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        phase: snapshot && snapshot.phase ? snapshot.phase : null,
        turnSeat: snapshot && snapshot.info && snapshot.info.turnSeat ? snapshot.info.turnSeat : null
      };
      return clone(activeRoundContext);
    }

    function appendRuntimeEvent(event = null) {
      if (!event || typeof event !== 'object') return clone(activeRoundContext);
      const snapshot = event.snapshot && typeof event.snapshot === 'object' ? event.snapshot : null;
      if (!activeRoundContext) {
        resetRoundContext(snapshot, null);
      }
      eventSeq += 1;
      activeRoundContext.runtimeEvents.push({
        seq: eventSeq,
        type: event.type || 'unknown',
        payload: event.payload ? clone(event.payload) : null,
        meta: event.meta ? clone(event.meta) : null,
        timestamp: Number.isFinite(Number(event.timestamp)) ? Number(event.timestamp) : Date.now()
      });
      if (snapshot) {
        activeRoundContext.phase = snapshot.phase || activeRoundContext.phase;
        activeRoundContext.turnSeat = snapshot.info && snapshot.info.turnSeat
          ? snapshot.info.turnSeat
          : activeRoundContext.turnSeat;
        activeRoundContext.round = buildRoundDescriptorFromSnapshot(snapshot);
      }
      activeRoundContext.updatedAt = Date.now();
      return clone(activeRoundContext);
    }

    function setInitialDeal(initialDeal = null, snapshot = null) {
      if (!activeRoundContext) {
        resetRoundContext(snapshot, initialDeal);
      } else {
        activeRoundContext.initialDeal = initialDeal ? clone(initialDeal) : null;
        if (snapshot) {
          activeRoundContext.round = buildRoundDescriptorFromSnapshot(snapshot);
          activeRoundContext.phase = snapshot.phase || activeRoundContext.phase;
          activeRoundContext.turnSeat = snapshot.info && snapshot.info.turnSeat
            ? snapshot.info.turnSeat
            : activeRoundContext.turnSeat;
        }
        activeRoundContext.updatedAt = Date.now();
      }
      return clone(activeRoundContext);
    }

    function getActiveRoundContext() {
      return clone(activeRoundContext);
    }

    function clear() {
      activeRoundContext = null;
      eventSeq = 0;
      return null;
    }

    return {
      resetRoundContext,
      appendRuntimeEvent,
      setInitialDeal,
      getActiveRoundContext,
      clear
    };
  }

  global.AceMahjongCreateCoachContextStore = createCoachContextStore;
})(window);
