(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('../../majiang-core/lib'),
      require('./draw-policy'),
      require('./ruleset-profile'),
      require('./seat-topology')
    );
    return;
  }

  root.AceMahjongWallService = factory(
    root.Majiang,
    root.AceMahjongDrawPolicy,
    root.AceMahjongRulesetProfile,
    root.AceMahjongSeatTopology
  );
})(typeof globalThis !== 'undefined' ? globalThis : this, function(Majiang, drawPolicyApi, rulesetProfileApi, seatTopologyApi) {
  'use strict';

  if (!Majiang || !Majiang.Shan || !Majiang.Shoupai) {
    throw new Error('AceMahjongWallService requires Majiang.Shan and Majiang.Shoupai.');
  }

  function createFallbackLogger() {
    return function levelAwareLog(level, message, detail) {
      if (typeof console === 'undefined') return;
      const method = level === 'error' ? 'error'
        : level === 'warn' ? 'warn'
        : level === 'debug' ? 'debug'
        : 'info';
      if (detail == null) console[method](`[MahjongWallService] ${message}`);
      else console[method](`[MahjongWallService] ${message}`, detail);
    };
  }

  function normalizeLogger(logger) {
    return typeof logger === 'function' ? logger : createFallbackLogger();
  }

  function normalizeExtensionManager(extensionManager) {
    return extensionManager && typeof extensionManager.runHook === 'function'
      ? extensionManager
      : null;
  }

  function normalizeInitialHandsResult(result) {
    if (!result) return null;
    if (Array.isArray(result)) return { haipai: result };
    if (!Array.isArray(result.haipai)) return null;
    return {
      ...result,
      haipai: result.haipai
    };
  }

  function resolveRulesetProfile(options = {}) {
    if (options.rulesetProfile && typeof options.rulesetProfile === 'object') {
      return { ...options.rulesetProfile };
    }
    if (rulesetProfileApi && typeof rulesetProfileApi.getRulesetProfile === 'function') {
      return rulesetProfileApi.getRulesetProfile({
        id: options.ruleset,
        tableSize: options.tableSize || (options.topology && options.topology.tableSize)
      });
    }
    return {
      id: typeof options.ruleset === 'string' && options.ruleset ? options.ruleset : 'riichi-4p',
      seatCount: Number(options.tableSize || (options.topology && options.topology.tableSize) || 4) || 4,
      tableSize: Number(options.tableSize || (options.topology && options.topology.tableSize) || 4) || 4,
      handSize: 13,
      deadWallSize: 14
    };
  }

  function resolveTopology(options = {}, rulesetProfile) {
    if (options.topology && typeof options.topology === 'object') {
      return options.topology;
    }
    if (seatTopologyApi && typeof seatTopologyApi.createSeatTopology === 'function') {
      return seatTopologyApi.createSeatTopology({
        tableSize: options.tableSize || rulesetProfile.tableSize || rulesetProfile.seatCount || 4,
        threePlayerLayout: options.threePlayerLayout || null
      });
    }
    return {
      tableSize: Number(options.tableSize || rulesetProfile.tableSize || rulesetProfile.seatCount || 4) || 4,
      activeSeats: ['bottom', 'right', 'top', 'left'],
      hiddenSeats: []
    };
  }

  function getRedTileConfig(rule) {
    const hongpai = rule && rule['赤牌'] && typeof rule['赤牌'] === 'object'
      ? rule['赤牌']
      : {};
    return {
      m: Number(hongpai.m || 0) || 0,
      p: Number(hongpai.p || 0) || 0,
      s: Number(hongpai.s || 0) || 0
    };
  }

  function buildTilePool(rule, rulesetProfile) {
    const redTileConfig = getRedTileConfig(rule);
    const tileSetId = rulesetProfile && typeof rulesetProfile.tileSet === 'string'
      ? rulesetProfile.tileSet
      : 'riichi-4p-standard';
    const removeManzuMiddle = tileSetId === 'riichi-3p-sanma-2to8m-removed';
    const usePinzuHonorOnly = tileSetId === 'riichi-2p-pinzu-honor-only';
    const pool = [];

    for (const suit of ['m', 'p', 's', 'z']) {
      if (usePinzuHonorOnly && suit !== 'p' && suit !== 'z') continue;
      const maxRank = suit === 'z' ? 7 : 9;
      for (let rank = 1; rank <= maxRank; rank += 1) {
        if (removeManzuMiddle && suit === 'm' && rank >= 2 && rank <= 8) continue;
        for (let copy = 0; copy < 4; copy += 1) {
          if (rank === 5 && suit !== 'z' && copy < redTileConfig[suit]) pool.push(`${suit}0`);
          else pool.push(`${suit}${rank}`);
        }
      }
    }

    return pool;
  }

  function shuffleTiles(tiles = []) {
    const pool = tiles.slice();
    for (let index = pool.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      const current = pool[index];
      pool[index] = pool[swapIndex];
      pool[swapIndex] = current;
    }
    return pool;
  }

  function getInitialWallTiles(rule, rulesetProfile, providedShan = null) {
    if (providedShan && Array.isArray(providedShan._pai) && providedShan._pai.length > 0) {
      return providedShan._pai.slice();
    }
    const tileSetId = rulesetProfile && typeof rulesetProfile.tileSet === 'string'
      ? rulesetProfile.tileSet
      : 'riichi-4p-standard';
    if (tileSetId === 'riichi-4p-standard') {
      const shan = new Majiang.Shan(rule);
      return Array.isArray(shan._pai) ? shan._pai.slice() : [];
    }

    return shuffleTiles(buildTilePool(rule, rulesetProfile));
  }

  function createManagedWallState(rule, rulesetProfile, providedShan = null) {
    const tileSetId = rulesetProfile && typeof rulesetProfile.tileSet === 'string'
      ? rulesetProfile.tileSet
      : 'riichi-4p-standard';
    const allTiles = getInitialWallTiles(rule, rulesetProfile, providedShan);
    const deadWallSize = Number(rulesetProfile && rulesetProfile.deadWallSize || 14) || 14;

    if (!Array.isArray(allTiles) || allTiles.length <= deadWallSize) {
      throw new Error(`Invalid wall size for tile set: ${tileSetId}`);
    }

    return {
      rule,
      tileSetId,
      deadWallSize,
      deadWall: allTiles.slice(0, deadWallSize),
      liveWall: allTiles.slice(deadWallSize),
      supplementQueue: [0, 1, 2, 3],
      revealedDoraCount: 1,
      kaigangPending: false,
      closed: false,
      uraEnabled: Boolean(rule && rule['裏ドラあり']),
      managed: true
    };
  }

  function getManagedBaopai(state) {
    return Array.from(
      { length: Math.max(0, Math.min(5, Number(state && state.revealedDoraCount || 0))) },
      (_, index) => state && Array.isArray(state.deadWall) ? state.deadWall[4 + index] || '' : ''
    ).filter(Boolean);
  }

  function getManagedFubaopai(state, options = {}) {
    const shouldExpose = Boolean(options.force || (state && state.closed));
    if (!state || !state.uraEnabled || !shouldExpose) return null;
    return Array.from(
      { length: Math.max(0, Math.min(5, Number(state.revealedDoraCount || 0))) },
      (_, index) => Array.isArray(state.deadWall) ? state.deadWall[9 + index] || '' : ''
    ).filter(Boolean);
  }

  function composeManagedPaiArray(state) {
    if (!state) return [];
    return state.deadWall.concat(state.liveWall);
  }

  function applyManagedPaiArray(state, tileArray) {
    if (!state || !Array.isArray(tileArray) || tileArray.length < state.deadWallSize) return;
    state.deadWall = tileArray.slice(0, state.deadWallSize);
    state.liveWall = tileArray.slice(state.deadWallSize);
    state.supplementQueue = [0, 1, 2, 3].filter((slotIndex) => state.deadWall[slotIndex]);
    state.revealedDoraCount = Math.max(1, Math.min(5, getManagedBaopai(state).length || 1));
  }

  function drawManagedSupplementTile(state, options = {}) {
    if (!state || state.closed) throw new Error(options.shan || state);
    const queue = Array.isArray(state.supplementQueue) ? state.supplementQueue : [];
    const slotIndex = queue.shift();
    if (!Number.isInteger(slotIndex) || slotIndex < 0) {
      throw new Error(options.shan || state);
    }
    const tileCode = state.deadWall[slotIndex] || null;
    if (!tileCode) {
      throw new Error(options.shan || state);
    }
    const replenishedTile = state.liveWall.length > 0 ? state.liveWall.shift() || null : null;
    state.deadWall[slotIndex] = replenishedTile;
    if (replenishedTile) {
      queue.push(slotIndex);
    }
    return tileCode;
  }

  function hasManagedSupplementTileAvailable(state) {
    if (!state || !Array.isArray(state.supplementQueue) || !Array.isArray(state.deadWall)) return false;
    return state.supplementQueue.some((slotIndex) => (
      Number.isInteger(slotIndex)
        && slotIndex >= 0
        && slotIndex < state.deadWall.length
        && Boolean(state.deadWall[slotIndex])
    ));
  }

  function attachManagedWallState(shan, rule, rulesetProfile, providedShan = null) {
    const state = createManagedWallState(rule, rulesetProfile, providedShan);
    Object.defineProperty(shan, '__aceWallState', {
      value: state,
      configurable: true,
      enumerable: false,
      writable: true
    });
    shan._rule = rule;

    Object.defineProperties(shan, {
      _pai: {
        configurable: true,
        enumerable: true,
        get() {
          return composeManagedPaiArray(state);
        },
        set(value) {
          applyManagedPaiArray(state, Array.isArray(value) ? value.slice() : []);
        }
      },
      _baopai: {
        configurable: true,
        enumerable: true,
        get() {
          return getManagedBaopai(state);
        },
        set(value) {
          const indicators = Array.isArray(value) ? value.slice(0, 5) : [];
          const nextCount = Math.max(1, indicators.length || 1);
          for (let index = 0; index < indicators.length; index += 1) {
            state.deadWall[4 + index] = indicators[index];
          }
          state.revealedDoraCount = nextCount;
        }
      },
      _fubaopai: {
        configurable: true,
        enumerable: true,
        get() {
          return getManagedFubaopai(state, { force: true });
        },
        set(value) {
          if (value == null) {
            state.uraEnabled = false;
            return;
          }
          state.uraEnabled = true;
          const indicators = Array.isArray(value) ? value.slice(0, 5) : [];
          for (let index = 0; index < indicators.length; index += 1) {
            state.deadWall[9 + index] = indicators[index];
          }
        }
      },
      _weikaigang: {
        configurable: true,
        enumerable: true,
        get() {
          return Boolean(state.kaigangPending);
        },
        set(value) {
          state.kaigangPending = Boolean(value);
        }
      },
      _closed: {
        configurable: true,
        enumerable: true,
        get() {
          return Boolean(state.closed);
        },
        set(value) {
          state.closed = Boolean(value);
        }
      },
      paishu: {
        configurable: true,
        enumerable: true,
        get() {
          return state.liveWall.length;
        }
      },
      baopai: {
        configurable: true,
        enumerable: true,
        get() {
          return getManagedBaopai(state);
        }
      },
      fubaopai: {
        configurable: true,
        enumerable: true,
        get() {
          return getManagedFubaopai(state);
        },
        set(value) {
          if (value == null) {
            state.uraEnabled = false;
            return;
          }
          state.uraEnabled = true;
          const indicators = Array.isArray(value) ? value.slice(0, 5) : [];
          for (let index = 0; index < indicators.length; index += 1) {
            state.deadWall[9 + index] = indicators[index];
          }
        }
      }
    });

    shan.zimo = function zimo() {
      if (state.closed || state.liveWall.length === 0 || state.kaigangPending) throw new Error(this);
      return state.liveWall.pop();
    };

    shan.gangzimo = function gangzimo() {
      if (state.closed || state.liveWall.length === 0 || state.kaigangPending) throw new Error(this);
      if (state.revealedDoraCount >= 5) throw new Error(this);
      state.kaigangPending = Boolean(state.rule && state.rule['カンドラあり']);
      return drawManagedSupplementTile(state, { shan: this });
    };

    shan.kaigang = function kaigang() {
      if (state.closed || !state.kaigangPending) throw new Error(this);
      state.revealedDoraCount = Math.min(5, state.revealedDoraCount + 1);
      state.kaigangPending = false;
      return this;
    };

    shan.close = function close() {
      state.closed = true;
      return this;
    };

    return shan;
  }

  function createWallService(options = {}) {
    const rule = options.rule || Majiang.rule({ '場数': 0 });
    const logger = normalizeLogger(options.logger);
    const extensionManager = normalizeExtensionManager(options.extensionManager);
    const rulesetProfile = resolveRulesetProfile(options);
    const topology = resolveTopology(options, rulesetProfile);
    const policy = options.drawPolicy
      || (drawPolicyApi && typeof drawPolicyApi.createNoOpDrawPolicy === 'function'
        ? drawPolicyApi.createNoOpDrawPolicy()
        : null);
    const shan = attachManagedWallState(options.shan || new Majiang.Shan(rule), rule, rulesetProfile, options.shan || null);
    const defaultSeatCount = Number(options.seatCount || rulesetProfile.seatCount || topology.tableSize || 4) || 4;
    const defaultHandSize = Number(options.handSize || rulesetProfile.handSize || 13) || 13;
    const deadWallSize = Number(rulesetProfile.deadWallSize || 14) || 14;
    const totalIndicatorSlots = 5;
    const totalRinshanSlots = 4;
    let rinshanDrawCount = 0;

    function buildWallState() {
      const managedState = shan && shan.__aceWallState ? shan.__aceWallState : null;
      const baopai = Array.isArray(shan.baopai) ? shan.baopai.slice() : [];
      const fubaopai = Array.isArray(shan.fubaopai) ? shan.fubaopai.slice() : [];
      return {
        remaining: shan.paishu,
        liveWallRemaining: shan.paishu,
        deadWallSize,
        baopai,
        fubaopai,
        doraIndicators: Array.from({ length: totalIndicatorSlots }, (_, index) => baopai[index] || null),
        uraDoraIndicators: Array.from({ length: totalIndicatorSlots }, (_, index) => fubaopai[index] || null),
        revealedDoraCount: baopai.length,
        revealedUraDoraCount: fubaopai.length,
        rinshanTotal: totalRinshanSlots,
        rinshanRemaining: managedState && Array.isArray(managedState.supplementQueue)
          ? managedState.supplementQueue.length
          : Math.max(0, totalRinshanSlots - rinshanDrawCount)
      };
    }

    function log(level, message, detail) {
      return logger(level, message, detail);
    }

    function removeTileFromWall(tileCode) {
      const managedState = shan && shan.__aceWallState ? shan.__aceWallState : null;
      if (!tileCode || !managedState) return null;
      const liveIndex = managedState.liveWall.lastIndexOf(tileCode);
      if (liveIndex >= 0) {
        return managedState.liveWall.splice(liveIndex, 1)[0] || null;
      }
      const deadIndex = managedState.deadWall.lastIndexOf(tileCode);
      if (deadIndex < 0) return null;
      const removedTile = managedState.deadWall[deadIndex] || null;
      managedState.deadWall[deadIndex] = managedState.liveWall.length > 0
        ? managedState.liveWall.shift() || null
        : null;
      if (deadIndex >= 0 && deadIndex <= 3) {
        managedState.supplementQueue = [0, 1, 2, 3].filter((slotIndex) => managedState.deadWall[slotIndex]);
      }
      return removedTile;
    }

    function createContext(extra = {}) {
      const contextSeatCount = Number(extra.seatCount || defaultSeatCount) || defaultSeatCount;
      const contextHandSize = Number(extra.handSize || defaultHandSize) || defaultHandSize;
      return {
        rule,
        rulesetProfile: { ...rulesetProfile },
        topology: {
          ...topology,
          activeSeats: Array.isArray(topology.activeSeats) ? topology.activeSeats.slice() : [],
          hiddenSeats: Array.isArray(topology.hiddenSeats) ? topology.hiddenSeats.slice() : []
        },
        seatCount: contextSeatCount,
        handSize: contextHandSize,
        deadWallSize: Number(rulesetProfile.deadWallSize || 14) || 14,
        remaining: shan.paishu,
        baopai: shan.baopai.slice(),
        wallState: buildWallState(),
        peekDrawStack: Array.isArray(shan._pai) ? shan._pai.slice(-24) : [],
        takeTile: removeTileFromWall,
        service: api,
        ...extra
      };
    }

    function runExtensionHook(hookName, payload = {}, extra = {}) {
      if (!extensionManager) return null;
      try {
        const execution = extensionManager.runHook(hookName, payload, {
          ruleset: rulesetProfile.id,
          seatKeys: Array.isArray(topology.activeSeats) ? topology.activeSeats.slice() : [],
          wallState: buildWallState(),
          meta: {
            deadWallSize,
            handSize: defaultHandSize,
            seatCount: defaultSeatCount,
            ...extra.meta
          },
          ...extra
        });
        return execution && execution.result ? execution.result : null;
      } catch (error) {
        log('warn', '扩展 hook 执行失败，已忽略', {
          hookName,
          error: error && error.message ? error.message : String(error)
        });
        return null;
      }
    }

    function normalizeExtensionInitialHands(result) {
      if (!result || !Array.isArray(result.initialHands)) return null;
      return normalizeInitialHandsResult({
        haipai: result.initialHands
      });
    }

    function chooseTileFromPolicy(hookName, context = {}) {
      if (!policy || typeof policy[hookName] !== 'function') return null;

      const candidate = policy[hookName](createContext(context));
      if (!candidate) return null;
      if (typeof candidate !== 'string') {
        log('warn', '摸牌策略返回了非法牌编码，已忽略', {
          hookName,
          candidate
        });
        return null;
      }

      const takenTile = removeTileFromWall(candidate);
      if (!takenTile) {
        log('warn', '摸牌策略请求的牌不在剩余牌山中，已回退到正常摸牌', {
          hookName,
          candidate
        });
        return null;
      }

      return {
        tileCode: takenTile,
        source: `policy:${policy.id || hookName}`,
        meta: {
          hook: hookName,
          policyId: policy.id || 'unknown',
          policyName: policy.name || 'Unknown Draw Policy'
        }
      };
    }

    function buildDealResult(haipai, source, meta = {}) {
      return {
        source,
        haipai: haipai.map((tiles) => tiles.slice()),
        shoupai: haipai.map((tiles) => new Majiang.Shoupai(tiles).toString()),
        baopai: shan.baopai.slice(),
        remaining: shan.paishu,
        meta: {
          rulesetId: rulesetProfile.id,
          tableSize: rulesetProfile.tableSize,
          seatCount: defaultSeatCount,
          handSize: defaultHandSize,
          ...meta
        }
      };
    }

    function dealInitialHands({ seatCount = defaultSeatCount, handSize = defaultHandSize, context = {} } = {}) {
      if (policy && typeof policy.beforeRoundStart === 'function') {
        policy.beforeRoundStart(createContext({
          seatCount,
          handSize,
          stage: 'round-start',
          ...context
        }));
      }

      const extensionDealPatch = runExtensionHook('beforeInitialDeal', {
        seatCount,
        handSize
      }, {
        actorSeat: context.actorSeat || null,
        payload: {
          seatCount,
          handSize
        },
        meta: {
          stage: 'initial-deal',
          context
        }
      });

      const scripted = normalizeInitialHandsResult(
        normalizeExtensionInitialHands(extensionDealPatch)
        || (
        !context.forceRandomFallback && policy && typeof policy.chooseInitialHands === 'function'
          ? policy.chooseInitialHands(createContext({
              seatCount,
              handSize,
              stage: 'initial-deal',
              ...context
            }))
          : null
        )
      );

      if (scripted && Array.isArray(scripted.haipai) && scripted.haipai.length === seatCount) {
        const haipai = scripted.haipai.map((tiles) => (tiles || []).slice(0, handSize));
        for (const seatTiles of haipai) {
          for (const tileCode of seatTiles) {
            if (!removeTileFromWall(tileCode)) {
              log('warn', '预设起手牌不在牌山中，回退到真实顺序发牌', {
                tileCode,
                scripted
              });
              return dealInitialHands({
                seatCount,
                handSize,
                context: {
                  ...context,
                  forceRandomFallback: true
                }
              });
            }
          }
        }

        const scriptedResult = buildDealResult(haipai, `policy:${policy.id || 'initial-deal'}`, {
          policyId: policy && policy.id ? policy.id : 'unknown',
          policyName: policy && policy.name ? policy.name : 'Unknown Draw Policy'
        });
        if (policy && typeof policy.afterInitialDeal === 'function') {
          policy.afterInitialDeal(createContext({
            seatCount,
            handSize,
            result: scriptedResult,
            stage: 'initial-deal:done',
            ...context
          }));
        }
        runExtensionHook('afterInitialDeal', {
          seatCount,
          handSize,
          result: scriptedResult
        }, {
          actorSeat: context.actorSeat || null,
          meta: {
            stage: 'initial-deal:done',
            context
          }
        });
        return scriptedResult;
      }

      const haipai = Array.from({ length: seatCount }, () => []);
      for (let seatIndex = 0; seatIndex < seatCount; seatIndex += 1) {
        for (let drawIndex = 0; drawIndex < handSize; drawIndex += 1) {
          haipai[seatIndex].push(shan.zimo());
        }
      }

      const result = buildDealResult(haipai, 'live-shan', {
        policyId: policy && policy.id ? policy.id : 'noop-random',
        policyName: policy && policy.name ? policy.name : 'No-Op Random Draw Policy'
      });
      if (policy && typeof policy.afterInitialDeal === 'function') {
        policy.afterInitialDeal(createContext({
          seatCount,
          handSize,
          result,
          stage: 'initial-deal:done',
          ...context
        }));
      }
      runExtensionHook('afterInitialDeal', {
        seatCount,
        handSize,
        result
      }, {
        actorSeat: context.actorSeat || null,
        meta: {
          stage: 'initial-deal:done',
          context
        }
      });
      return result;
    }

    function drawTile(context = {}) {
      const extensionDrawPatch = runExtensionHook('beforeDraw', {
        stage: 'draw'
      }, {
        actorSeat: context.actorSeat || context.seatKey || null,
        meta: {
          stage: 'draw',
          context
        }
      });
      let extensionResult = null;
      if (extensionDrawPatch && typeof extensionDrawPatch.tileCode === 'string') {
        const takenTile = removeTileFromWall(extensionDrawPatch.tileCode);
        if (takenTile) {
          extensionResult = {
            tileCode: takenTile,
            source: extensionDrawPatch.source || 'extension:beforeDraw',
            meta: {
              hook: 'beforeDraw',
              extensionTags: Array.isArray(extensionDrawPatch.tags) ? extensionDrawPatch.tags.slice() : [],
              ...(extensionDrawPatch.metadata && typeof extensionDrawPatch.metadata === 'object'
                ? extensionDrawPatch.metadata
                : {})
            }
          };
        }
      }

      const policyResult = extensionResult || chooseTileFromPolicy('chooseDraw', context);
      const result = policyResult || {
        tileCode: shan.zimo(),
        source: 'live-shan',
        meta: {
          hook: 'draw',
          policyId: policy && policy.id ? policy.id : 'noop-random',
          policyName: policy && policy.name ? policy.name : 'No-Op Random Draw Policy'
        }
      };

      result.remaining = shan.paishu;
      result.baopai = shan.baopai.slice();
      result.wallState = buildWallState();

      if (policy && typeof policy.afterDraw === 'function') {
        policy.afterDraw(createContext({
          result,
          stage: 'draw',
          ...context
        }));
      }

      runExtensionHook('afterDraw', {
        stage: 'draw',
        result
      }, {
        actorSeat: context.actorSeat || context.seatKey || null,
        meta: {
          stage: 'draw',
          context
        }
      });

      return result;
    }

    function drawGangTile(context = {}) {
      const policyResult = chooseTileFromPolicy('chooseGangDraw', context);
      let result = null;

      if (policyResult) {
        const consumedSupplementTile = shan.gangzimo();
        const managedState = shan && shan.__aceWallState ? shan.__aceWallState : null;
        if (consumedSupplementTile != null) {
          if (managedState && Array.isArray(managedState.liveWall)) {
            managedState.liveWall.unshift(consumedSupplementTile);
          } else if (Array.isArray(shan._pai)) {
            shan._pai.unshift(consumedSupplementTile);
          }
        }
        result = policyResult;
      } else {
        result = {
          tileCode: shan.gangzimo(),
          source: 'live-shan:gang',
          meta: {
            hook: 'gang-draw',
            policyId: policy && policy.id ? policy.id : 'noop-random',
            policyName: policy && policy.name ? policy.name : 'No-Op Random Draw Policy'
          }
        };
      }

      rinshanDrawCount = Math.min(totalRinshanSlots, rinshanDrawCount + 1);
      result.remaining = shan.paishu;
      result.baopai = shan.baopai.slice();
      result.wallState = buildWallState();

      if (policy && typeof policy.afterDraw === 'function') {
        policy.afterDraw(createContext({
          result,
          stage: 'gang-draw',
          ...context
        }));
      }

      return result;
    }

    function drawKitaTile(context = {}) {
      const managedState = shan && shan.__aceWallState ? shan.__aceWallState : null;
      if (!managedState) throw new Error('Managed wall state is unavailable for kita draw.');
      const tileCode = drawManagedSupplementTile(managedState, { shan });

      const result = {
        tileCode,
        source: 'live-shan:kita-rinshan',
        meta: {
          hook: 'kita-draw',
          policyId: policy && policy.id ? policy.id : 'noop-random',
          policyName: policy && policy.name ? policy.name : 'No-Op Random Draw Policy'
        }
      };

      rinshanDrawCount = Math.min(totalRinshanSlots, rinshanDrawCount + 1);
      result.remaining = shan.paishu;
      result.baopai = shan.baopai.slice();
      result.wallState = buildWallState();

      if (policy && typeof policy.afterDraw === 'function') {
        policy.afterDraw(createContext({
          result,
          stage: 'kita-draw',
          ...context
        }));
      }

      return result;
    }

    function revealDora(context = {}) {
      shan.kaigang();
      return {
        tileCode: shan.baopai.slice(-1)[0] || null,
        source: 'live-shan:kaigang',
        remaining: shan.paishu,
        baopai: shan.baopai.slice(),
        wallState: buildWallState(),
        meta: {
          stage: 'reveal-dora',
          policyId: policy && policy.id ? policy.id : 'noop-random',
          policyName: policy && policy.name ? policy.name : 'No-Op Random Draw Policy',
          context
        }
      };
    }

    const api = {
      rule,
      rulesetProfile,
      topology,
      shan,
      policy,
      dealInitialHands,
      drawTile,
      drawGangTile,
      drawKitaTile,
      canDrawSupplementTile() {
        const managedState = shan && shan.__aceWallState ? shan.__aceWallState : null;
        return hasManagedSupplementTileAvailable(managedState);
      },
      revealDora,
      getState() {
        return {
          ...buildWallState(),
          rulesetProfile: { ...rulesetProfile },
          topology: {
            ...topology,
            activeSeats: Array.isArray(topology.activeSeats) ? topology.activeSeats.slice() : [],
            hiddenSeats: Array.isArray(topology.hiddenSeats) ? topology.hiddenSeats.slice() : []
          },
          policy: policy && typeof policy.getDebugState === 'function'
            ? policy.getDebugState()
            : {
                id: policy && policy.id ? policy.id : 'noop-random',
                name: policy && policy.name ? policy.name : 'No-Op Random Draw Policy'
              }
        };
      }
    };

    return api;
  }

  return {
    createWallService
  };
});
