(function () {
  'use strict';

  function normalizeDashboardString(value, fallback = '') {
    return typeof value === 'string' ? value.trim() : fallback;
  }

  function escapeDashboardHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function clampPercent(value) {
    return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  }

  function normalizeMetricDefaults(metric) {
    if (!metric || typeof metric !== 'object') return {};

    const normalized = { ...metric };
    normalized.score = normalized.score != null ? normalized.score : normalized.value;
    delete normalized.value;
    return normalized;
  }

  function getMetricScore(metric, fallback = 0) {
    if (!metric || typeof metric !== 'object') return clampPercent(fallback);
    return clampPercent(metric.score != null ? metric.score : metric.value);
  }

  function formatTime(totalSeconds) {
    if (Number.isNaN(totalSeconds) || totalSeconds < 0 || !Number.isFinite(totalSeconds)) return '00:00';
    const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const seconds = Math.floor(totalSeconds % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  }

  window.ACE0DashboardUtils = {
    normalizeDashboardString,
    escapeDashboardHtml,
    clampPercent,
    normalizeMetricDefaults,
    getMetricScore,
    formatTime
  };
})();
