/**
 * Runtime Module: RuntimeFlow
 * 角色：运行时事件总线。
 *
 * 职责：
 * - 暴露游戏生命周期中的统一事件入口
 * - 让角色模块通过 hooks 接入手牌流程，而不是侵入主引擎函数
 *
 * 暴露：
 * - `window.RuntimeFlow`
 *
 * 边界：
 * - 只负责事件订阅与派发
 * - 不保存角色状态与业务逻辑
 */
(function(global) {
  'use strict';

  function RuntimeFlow() {
    this._handlers = Object.create(null);
  }

  RuntimeFlow.prototype.on = function(event, callback) {
    if (!event || typeof callback !== 'function') return function() {};
    if (!this._handlers[event]) this._handlers[event] = [];
    this._handlers[event].push(callback);
    var self = this;
    return function() {
      self._handlers[event] = (self._handlers[event] || []).filter(function(cb) {
        return cb !== callback;
      });
    };
  };

  RuntimeFlow.prototype.emit = function(event, payload) {
    var handlers = this._handlers[event];
    if (!handlers || handlers.length === 0) return;
    for (var i = 0; i < handlers.length; i++) {
      try {
        handlers[i](payload);
      } catch (err) {
        console.error('[RuntimeFlow] Hook error:', event, err);
      }
    }
  };

  RuntimeFlow.prototype.clear = function() {
    this._handlers = Object.create(null);
  };

  global.RuntimeFlow = RuntimeFlow;
})(window);
