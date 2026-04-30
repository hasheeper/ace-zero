/**
 * Runtime Module: RuntimeModuleRegistry
 * 角色：运行时模块注册器。
 *
 * 职责：
 * - 统一注册 / 卸载 hooks、ai、assets、cleanup
 * - 维护运行时模块生命周期
 * - 为后续 VV / POPPY / TRIXIE 这类复杂角色提供标准接入口
 *
 * 暴露：
 * - `window.RuntimeModuleRegistry`
 *
 * 边界：
 * - 只做模块装配与清理
 * - 不承担具体角色业务逻辑
 */
(function(global) {
  'use strict';

  function normalizeHooks(hooks) {
    if (!hooks) return [];
    if (Array.isArray(hooks)) return hooks.slice();
    return Object.keys(hooks).map(function(event) {
      return { event: event, handler: hooks[event] };
    });
  }

  function RuntimeModuleRegistry(runtimeApi) {
    this.runtimeApi = runtimeApi || null;
    this.modules = new Map();
    this.states = new Map();
  }

  RuntimeModuleRegistry.prototype.setRuntimeAPI = function(runtimeApi) {
    this.runtimeApi = runtimeApi || null;
  };

  RuntimeModuleRegistry.prototype._getRuntimeAPI = function() {
    return this.runtimeApi || global.AceRuntimeAPI || {};
  };

  RuntimeModuleRegistry.prototype.registerRuntimeModule = function(module) {
    if (!module || !module.id) {
      throw new Error('registerRuntimeModule(module) requires a stable module.id');
    }

    if (this.modules.has(module.id)) {
      this.unregisterRuntimeModule(module.id);
    }

    var runtimeApi = this._getRuntimeAPI();
    var state = {
      id: module.id,
      hookUnsubs: [],
      aiPrevious: [],
      profilePrevious: [],
      aiCleanup: null,
      assetCleanup: null
    };

    var flow = runtimeApi.runtimeFlow;
    normalizeHooks(module.hooks).forEach(function(entry) {
      if (!entry || !entry.event || typeof entry.handler !== 'function' || !flow || typeof flow.on !== 'function') return;
      var off = flow.on(entry.event, function(payload) {
        entry.handler(payload, runtimeApi);
      });
      state.hookUnsubs.push(off);
    });

    var director = global.NpcRoleDirector;
    if (module.ai && director) {
      if (typeof module.ai === 'function') {
        state.aiCleanup = module.ai({
          runtimeApi: runtimeApi,
          director: director,
          module: module
        }) || null;
      } else {
        Object.keys(module.ai).forEach(function(roleId) {
          var handler = module.ai[roleId];
          if (!handler) return;
          var prev = typeof director.getRoleHandler === 'function' ? director.getRoleHandler(roleId) : null;
          state.aiPrevious.push({ roleId: roleId, handler: prev });
          director.registerRole(roleId, handler);
        });
      }
    }

    if (module.profiles && director) {
      Object.keys(module.profiles).forEach(function(profileId) {
        var handler = module.profiles[profileId];
        if (!handler) return;
        var prev = typeof director.getProfileHandler === 'function' ? director.getProfileHandler(profileId) : null;
        state.profilePrevious.push({ profileId: profileId, handler: prev });
        if (typeof director.registerProfile === 'function') {
          director.registerProfile(profileId, handler);
        }
      });
    }

    if (module.assets) {
      if (typeof module.assets === 'function') {
        state.assetCleanup = module.assets(runtimeApi) || null;
      } else if (typeof module.assets.init === 'function') {
        state.assetCleanup = module.assets.init(runtimeApi) || null;
      }
    }

    if (typeof module.init === 'function') {
      module.init(runtimeApi);
    }

    this.modules.set(module.id, module);
    this.states.set(module.id, state);
    return module;
  };

  RuntimeModuleRegistry.prototype.unregisterRuntimeModule = function(moduleId) {
    var state = this.states.get(moduleId);
    var runtimeApi = this._getRuntimeAPI();
    var module = this.modules.get(moduleId);

    if (!state) return;

    state.hookUnsubs.forEach(function(off) {
      try { if (typeof off === 'function') off(); } catch (err) {
        console.error('[RuntimeModuleRegistry] hook cleanup failed:', moduleId, err);
      }
    });

    var director = global.NpcRoleDirector;
    if (director) {
      state.aiPrevious.forEach(function(entry) {
        if (entry.handler) {
          director.registerRole(entry.roleId, entry.handler);
        } else if (typeof director.unregisterRole === 'function') {
          director.unregisterRole(entry.roleId);
        }
      });

      state.profilePrevious.forEach(function(entry) {
        if (entry.handler) {
          if (typeof director.registerProfile === 'function') {
            director.registerProfile(entry.profileId, entry.handler);
          }
        } else if (typeof director.unregisterProfile === 'function') {
          director.unregisterProfile(entry.profileId);
        }
      });
    }

    if (typeof state.aiCleanup === 'function') {
      try { state.aiCleanup(runtimeApi); } catch (err1) {
        console.error('[RuntimeModuleRegistry] ai cleanup failed:', moduleId, err1);
      }
    }

    if (typeof state.assetCleanup === 'function') {
      try { state.assetCleanup(runtimeApi); } catch (err2) {
        console.error('[RuntimeModuleRegistry] asset cleanup failed:', moduleId, err2);
      }
    }

    if (module && typeof module.cleanup === 'function') {
      try { module.cleanup(runtimeApi); } catch (err3) {
        console.error('[RuntimeModuleRegistry] module cleanup failed:', moduleId, err3);
      }
    }

    this.states.delete(moduleId);
    this.modules.delete(moduleId);
  };

  RuntimeModuleRegistry.prototype.listModules = function() {
    return Array.from(this.modules.keys());
  };

  global.RuntimeModuleRegistry = RuntimeModuleRegistry;
})(window);
