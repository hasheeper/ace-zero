(function () {
  'use strict';

  const frame = document.getElementById('legacy-game-frame');
  const entry = document.body && document.body.dataset ? document.body.dataset.legacyEntry : '';
  const title = document.body && document.body.dataset ? document.body.dataset.gameTitle : '';
  const pendingMessages = [];
  let frameReady = false;

  if (!frame || !entry) {
    console.error('[AceZero Game Module] Missing legacy frame or entry.');
    return;
  }

  if (title) {
    document.title = title + ' - AceZero';
    frame.title = title;
  }

  function buildFrameUrl() {
    const target = new URL(entry, location.href);
    const params = new URLSearchParams(location.search || '');
    for (const [key, value] of params.entries()) {
      if (key === 'legacyEntry') continue;
      target.searchParams.set(key, value);
    }
    return target.href;
  }

  function postToFrame(message) {
    if (!message || !frame.contentWindow) return;
    if (!frameReady) {
      pendingMessages.push(message);
      return;
    }
    try {
      frame.contentWindow.postMessage(message, '*');
    } catch (error) {
      console.warn('[AceZero Game Module] Failed to forward message to legacy frame:', error);
    }
  }

  function flushPendingMessages() {
    while (pendingMessages.length) {
      postToFrame(pendingMessages.shift());
    }
  }

  frame.addEventListener('load', () => {
    frameReady = true;
    flushPendingMessages();
  });

  window.addEventListener('message', (event) => {
    const message = event && event.data;
    if (!message) return;

    if (event.source === frame.contentWindow) {
      try {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage(message, '*');
        }
      } catch (_) {}
      return;
    }

    postToFrame(message);
  });

  frame.src = buildFrameUrl();

  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'acezero-data-request' }, '*');
    }
  } catch (_) {}
})();
