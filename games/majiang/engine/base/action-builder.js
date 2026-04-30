(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }

  root.AceMahjongActionBuilder = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function buildStyleFields(source = {}) {
    return {
      bgChar: typeof source.bgChar === 'string' && source.bgChar ? source.bgChar : undefined,
      variant: typeof source.variant === 'string' ? source.variant : undefined,
      textLayout: typeof source.textLayout === 'string' ? source.textLayout : undefined,
      row: Number.isFinite(source.row) ? Number(source.row) : undefined
    };
  }

  function normalizeAction(action = {}, index = 0) {
    const source = action && typeof action === 'object' ? action : {};
    const type = typeof source.type === 'string' && source.type ? source.type : 'ui-action';
    const payload = source.payload && typeof source.payload === 'object'
      ? clone(source.payload)
      : {};
    const key = typeof source.key === 'string' && source.key
      ? source.key
      : `${type}:${index}`;

    return {
      type,
      key,
      label: typeof source.label === 'string' && source.label ? source.label : key,
      group: typeof source.group === 'string' && source.group ? source.group : 'default',
      priority: Number.isFinite(source.priority) ? Number(source.priority) : 0,
      payload,
      enabled: source.enabled !== false,
      visible: source.visible !== false,
      ...buildStyleFields(source)
    };
  }

  function createUiAction(options = {}) {
    const actionKey = typeof options.actionKey === 'string' && options.actionKey
      ? options.actionKey
      : (typeof options.key === 'string' && options.key ? options.key : 'ui-action');

    return normalizeAction({
      type: options.type || 'ui-action',
      key: options.key || actionKey,
      label: options.label || actionKey,
      group: options.group || 'primary',
      priority: Number.isFinite(options.priority) ? Number(options.priority) : 0,
      payload: {
        actionKey,
        ...(options.payload || {})
      },
      bgChar: options.bgChar,
      variant: options.variant,
      textLayout: options.textLayout,
      row: options.row,
      enabled: options.enabled,
      visible: options.visible
    });
  }

  function createRiichiAction(options = {}) {
    return createUiAction({
      key: 'riichi',
      actionKey: 'riichi',
      label: '立直',
      group: 'primary',
      priority: 100,
      bgChar: '立',
      textLayout: 'len-2',
      variant: 'riichi',
      row: 0,
      ...options
    });
  }

  function createPassAction(options = {}) {
    return normalizeAction({
      type: options.type || 'pass',
      key: options.key || 'pass',
      label: options.label || '跳过',
      group: options.group || 'reaction',
      priority: Number.isFinite(options.priority) ? Number(options.priority) : 0,
      payload: options.payload || {},
      bgChar: options.bgChar || '过',
      variant: options.variant || 'skip',
      row: Number.isFinite(options.row) ? Number(options.row) : 1,
      enabled: options.enabled,
      visible: options.visible
    });
  }

  function createReactionAction(options = {}) {
    return normalizeAction({
      type: options.type || 'call',
      key: options.key || `${options.type || 'call'}:${options.seat || 'unknown'}`,
      label: options.label || options.type || 'reaction',
      group: options.group || 'reaction',
      priority: Number.isFinite(options.priority) ? Number(options.priority) : 0,
      payload: {
        ...(options.payload || {}),
        seat: options.seat || (options.payload && options.payload.seat) || null
      },
      bgChar: options.bgChar,
      variant: options.variant,
      textLayout: options.textLayout,
      row: options.row,
      enabled: options.enabled,
      visible: options.visible
    });
  }

  function createActionWindow(actionWindow = {}) {
    const source = actionWindow && typeof actionWindow === 'object' ? actionWindow : {};
    const actions = Array.isArray(source.actions)
      ? source.actions.map((action, index) => normalizeAction(action, index))
      : [];

    return {
      visible: source.visible !== false && actions.some((action) => action.visible !== false),
      layout: typeof source.layout === 'string' && source.layout ? source.layout : 'single',
      actions,
      activeActionKey: typeof source.activeActionKey === 'string' ? source.activeActionKey : null
    };
  }

  return {
    normalizeAction,
    createUiAction,
    createRiichiAction,
    createPassAction,
    createReactionAction,
    createActionWindow,
    normalizeActionWindow: createActionWindow
  };
});
