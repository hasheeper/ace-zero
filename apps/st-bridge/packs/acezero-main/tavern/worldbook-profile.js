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
    prod: 'AceZeroInfo-MVUVer-2.0-alpha',
    local: 'AceZeroInfo-MVUVer-2.0-alpha-Test'
  });

  function normalizeString(value, fallback = '') {
    return typeof value === 'string' ? value.trim() : fallback;
  }

  function normalizeEnv(value) {
    const normalized = normalizeString(value, '').toLowerCase();
    return normalized === 'local' ? 'local' : 'prod';
  }

  function isExplicitWorldbookSource(value) {
    return value === 'query' || value === 'globalOverride';
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
    const bridgeSource = normalizeString(bridgeState?.fullDocWorldbookSource, '');
    const bridgeName = normalizeString(bridgeState?.fullDocWorldbookName, '');
    const overrideName = root.ACE0_FULL_DOC_WORLDBOOK_OVERRIDE === true ? currentName : '';
    const explicitSource = isExplicitWorldbookSource(bridgeSource) && bridgeName
      ? bridgeSource
      : (overrideName ? 'globalOverride' : '');
    const explicitName = explicitSource
      ? (explicitSource === 'globalOverride' ? overrideName : bridgeName)
      : '';
    const nextName = resolveFullDocWorldbookName(env, explicitName);
    const nextSource = explicitSource || 'profile';

    root.ACE0_FULL_DOC_WORLDBOOK_NAME = nextName;

    if (bridgeState) {
      bridgeState.fullDocWorldbookName = nextName;
      bridgeState.fullDocWorldbookSource = nextSource;
    }
    if (root.STBridge && root.STBridge.utils) {
      root.STBridge.utils.fullDocWorldbookName = nextName;
      root.STBridge.utils.fullDocWorldbookSource = nextSource;
    }
    return nextName;
  }

  const profile = Object.freeze({
    names: FULL_DOC_WORLDBOOK_NAMES,
    resolveFullDocWorldbookName,
    applyFullDocWorldbookProfile
  });

  root.ACE0WorldbookProfile = profile;
  applyFullDocWorldbookProfile();
})(typeof window !== 'undefined' ? window : globalThis);
