/**
 * Runtime Module: AssetLedger
 * 角色：持续资源账本。
 *
 * 职责：
 * - 存储跨街、跨手存在的专属资源
 * - 为角色模块提供 add / consume / clear / snapshot 接口
 * - 在资源变化时向 RuntimeFlow 透传 asset 事件
 *
 * 暴露：
 * - `window.AssetLedger`
 *
 * 边界：
 * - 只做资产容器
 * - 不自动决定何时衰减、何时清空，这些应由角色模块通过 hooks 控制
 */
(function(global) {
  'use strict';

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function AssetLedger(options) {
    options = options || {};
    this._assets = new Map();
    this._emitter = typeof options.emitter === 'function' ? options.emitter : null;
  }

  AssetLedger.prototype._emit = function(event, payload) {
    if (!this._emitter) return;
    this._emitter(event, payload);
  };

  AssetLedger.prototype._getBucket = function(ownerId) {
    if (!this._assets.has(ownerId)) this._assets.set(ownerId, Object.create(null));
    return this._assets.get(ownerId);
  };

  AssetLedger.prototype.getAsset = function(ownerId, key) {
    var bucket = this._assets.get(ownerId);
    if (!bucket || !bucket[key]) return null;
    return Object.assign({}, bucket[key]);
  };

  AssetLedger.prototype.getValue = function(ownerId, key) {
    var asset = this.getAsset(ownerId, key);
    return asset ? Number(asset.value || 0) : 0;
  };

  AssetLedger.prototype.setAsset = function(ownerId, key, value, meta) {
    if (ownerId == null || !key) return null;
    var bucket = this._getBucket(ownerId);
    var next = Object.assign({}, bucket[key] || {}, meta || {}, {
      key: key,
      value: Math.max(0, Number(value || 0))
    });
    bucket[key] = next;
    this._emit('asset:set', { ownerId: ownerId, key: key, asset: Object.assign({}, next) });
    return Object.assign({}, next);
  };

  AssetLedger.prototype.addAsset = function(ownerId, key, value, meta) {
    var current = this.getValue(ownerId, key);
    return this.setAsset(ownerId, key, current + Number(value || 0), meta);
  };

  AssetLedger.prototype.consumeAsset = function(ownerId, key, value, meta) {
    var current = this.getValue(ownerId, key);
    var nextValue = Math.max(0, current - Number(value || 0));
    var next = this.setAsset(ownerId, key, nextValue, meta);
    this._emit('asset:consume', {
      ownerId: ownerId,
      key: key,
      delta: Math.max(0, Number(value || 0)),
      asset: next ? Object.assign({}, next) : null
    });
    return next;
  };

  AssetLedger.prototype.clearAsset = function(ownerId, key) {
    var bucket = this._assets.get(ownerId);
    if (!bucket || !bucket[key]) return;
    delete bucket[key];
    if (Object.keys(bucket).length === 0) this._assets.delete(ownerId);
    this._emit('asset:clear', { ownerId: ownerId, key: key });
  };

  AssetLedger.prototype.clearAll = function() {
    this._assets.clear();
    this._emit('asset:clear_all', {});
  };

  AssetLedger.prototype.snapshot = function() {
    var out = {};
    for (var _iterator = this._assets.entries(), _step; !(_step = _iterator.next()).done;) {
      var entry = _step.value;
      out[entry[0]] = clone(entry[1]);
    }
    return out;
  };

  global.AssetLedger = AssetLedger;
})(window);
