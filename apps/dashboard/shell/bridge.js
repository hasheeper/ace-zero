(function () {
  'use strict';

  const MESSAGE_TYPES = {
    init: 'ACE0_DASHBOARD_INIT',
    refresh: 'ACE0_DASHBOARD_REFRESH',
    ready: 'ACE0_DASHBOARD_READY',
    request: 'ACE0_DASHBOARD_REQUEST_DATA',
    actCommit: 'ACE0_DASHBOARD_ACT_COMMIT',
    actCommitResult: 'ACE0_DASHBOARD_ACT_COMMIT_RESULT'
  };

  function getFrameWindow(frame) {
    return frame?.contentWindow || null;
  }

  function postDashboardMessageUpstream(messageType, payload) {
    const targets = [];
    if (window.parent && window.parent !== window) {
      targets.push(window.parent);
    }
    if (window.top && window.top !== window && !targets.includes(window.top)) {
      targets.push(window.top);
    }

    targets.forEach((targetWindow) => {
      try {
        targetWindow.postMessage({ type: messageType, payload }, '*');
      } catch (error) {
        console.warn('[ACE0 Dashboard] upstream postMessage failed:', error);
      }
    });

    return targets.length > 0;
  }

  function resolveDashboardActCommitBridge() {
    const candidates = [window];
    try {
      if (window.parent && window.parent !== window) candidates.push(window.parent);
    } catch (_) {}
    try {
      if (window.top && window.top !== window && !candidates.includes(window.top)) candidates.push(window.top);
    } catch (_) {}

    for (const candidate of candidates) {
      try {
        if (typeof candidate.ACE0DashboardCommitActState === 'function') {
          return candidate.ACE0DashboardCommitActState.bind(candidate);
        }
      } catch (_) {}
    }

    return null;
  }

  function attachExpansionFrameActCommitBridge(frame) {
    const targetWindow = getFrameWindow(frame);
    if (!targetWindow) return false;

    try {
      targetWindow.ACE0DashboardCommitActState = async (commitPayload) => {
        const bridge = resolveDashboardActCommitBridge();
        if (!bridge) {
          throw new Error('Dashboard act commit bridge is unavailable.');
        }
        return bridge(commitPayload);
      };
      return true;
    } catch (_) {
      return false;
    }
  }

  function postExpansionFrameMessage(frame, messageType, payload) {
    const targetWindow = getFrameWindow(frame);
    if (!targetWindow) return false;

    targetWindow.postMessage({ type: messageType, payload }, '*');
    return true;
  }

  function postExpansionFrameData(frame, latestDashboardHostPayload, messageType = 'ACE0_ACT_REFRESH') {
    const targetWindow = getFrameWindow(frame);
    if (!targetWindow || !latestDashboardHostPayload) return false;

    targetWindow.postMessage({
      type: messageType,
      payload: latestDashboardHostPayload
    }, '*');

    targetWindow.postMessage({
      type: messageType === 'ACE0_ACT_INIT' ? MESSAGE_TYPES.init : MESSAGE_TYPES.refresh,
      payload: latestDashboardHostPayload
    }, '*');

    return true;
  }

  function createDashboardHostMessageHandler(options = {}) {
    const {
      getFrame,
      onHostPayload
    } = options;

    return function handleDashboardHostMessage(event) {
      const payload = event?.data;
      if (!payload || typeof payload !== 'object') return;

      const frame = typeof getFrame === 'function' ? getFrame() : null;

      if (payload.type === 'ACE0_ACT_COMMIT') {
        const didForward = postDashboardMessageUpstream(
          MESSAGE_TYPES.actCommit,
          payload.payload || payload.data || payload
        );
        if (!didForward) {
          postExpansionFrameMessage(frame, 'ACE0_ACT_COMMIT_RESULT', {
            ok: false,
            requestId: payload.payload?.requestId || payload.data?.requestId || '',
            error: 'Dashboard could not find a parent/top host window.'
          });
        }
        return;
      }

      if (payload.type === MESSAGE_TYPES.actCommitResult) {
        postExpansionFrameMessage(frame, 'ACE0_ACT_COMMIT_RESULT', payload.payload || payload.data || payload);
        return;
      }

      if (payload.type !== MESSAGE_TYPES.init && payload.type !== MESSAGE_TYPES.refresh) return;

      const hostPayload = payload.payload || payload.data || payload;
      if (typeof onHostPayload === 'function') {
        onHostPayload({
          messageType: payload.type,
          hostPayload,
          frame
        });
      }
    };
  }

  function notifyDashboardReady() {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: MESSAGE_TYPES.ready }, '*');
      window.parent.postMessage({ type: MESSAGE_TYPES.request }, '*');
    }
  }

  window.ACE0DashboardBridge = {
    MESSAGE_TYPES,
    postDashboardMessageUpstream,
    resolveDashboardActCommitBridge,
    attachExpansionFrameActCommitBridge,
    postExpansionFrameMessage,
    postExpansionFrameData,
    createDashboardHostMessageHandler,
    notifyDashboardReady
  };
})();
