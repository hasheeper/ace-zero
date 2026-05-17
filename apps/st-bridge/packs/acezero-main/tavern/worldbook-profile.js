/**
 * AceZero full-doc worldbook profile.
 *
 * Keep worldbook names centralized here. Runtime code, smoke tests, and docs
 * should refer to this profile instead of repeating literal worldbook names.
 */
(function installAceZeroWorldbookProfile(global) {
  'use strict';

  const root = global || (typeof window !== 'undefined' ? window : globalThis);

  const FULL_DOC_WORLDBOOK_NAMES = Object.freeze({
    prod: 'AceZeroInfo-MVUVer-alpha2.0',
    local: 'AceZeroInfo-MVUVer-alpha2.0-Test'
  });

  function normalizeString(value, fallback = '') {
    return typeof value === 'string' ? value.trim() : fallback;
  }

  function normalizeEnv(value) {
    const normalized = normalizeString(value, '').toLowerCase();
    return normalized === 'local' ? 'local' : 'prod';
  }

  function resolveFullDocWorldbookName(env, explicitName = '') {
    const explicit = normalizeString(explicitName, '');
    if (explicit) return explicit;
    return FULL_DOC_WORLDBOOK_NAMES[normalizeEnv(env)] || FULL_DOC_WORLDBOOK_NAMES.prod;
  }

  function applyFullDocWorldbookProfile() {
    const bridgeState = root.STBridge && root.STBridge.state ? root.STBridge.state : null;
    const env = normalizeEnv(root.ST_BRIDGE_ENV || bridgeState?.env);
    const currentName = normalizeString(root.ACE0_FULL_DOC_WORLDBOOK_NAME, '');
    const previousApplied = root.__ACE0_APPLIED_FULL_DOC_WORLDBOOK__;
    const hasExplicitName = Boolean(currentName && (!previousApplied || previousApplied.name !== currentName));
    const nextName = hasExplicitName
      ? currentName
      : resolveFullDocWorldbookName(env);

    root.ACE0_FULL_DOC_WORLDBOOK_NAME = nextName;
    root.__ACE0_APPLIED_FULL_DOC_WORLDBOOK__ = { env, name: nextName };

    if (bridgeState) {
      bridgeState.fullDocWorldbookName = nextName;
    }
    if (root.STBridge && root.STBridge.utils) {
      root.STBridge.utils.fullDocWorldbookName = nextName;
    }
    return nextName;
  }

  const profile = Object.freeze({
    names: FULL_DOC_WORLDBOOK_NAMES,
    resolveFullDocWorldbookName,
    applyFullDocWorldbookProfile
  });

  root.ACE0WorldbookProfile = profile;
  root.ACE0_WORLDBOOK_PROFILE = profile;
  applyFullDocWorldbookProfile();
})(typeof window !== 'undefined' ? window : globalThis);
