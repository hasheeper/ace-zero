(function(global) {
  'use strict';

  const PANEL_ID = 'luck-panel';
  const WIND_STORAGE_KEY = 'acezero.majiang.luckPanelState';

  const LAYERS = ['fortune', 'curse'];
  const SYSTEM_MODES = ['on', 'auto', 'off'];
  const WIND_MODES = ['speed', 'value', 'safety', 'commit'];
  const CURSE_TARGET_SEATS = ['top', 'left', 'right'];
  const INTENSITIES = ['light', 'medium', 'strong'];
  const COMMIT_ROUTE_IDS = [
    'auto',
    'shape-sequence',
    'shape-pair',
    'shape-triplet',
    'suit-m',
    'suit-p',
    'suit-s',
    'honor',
    'seat-wind',
    'round-wind',
    'yakuhai',
    'dora'
  ];
  const INTENSITY_HEIGHT = {
    light: '33.33%',
    medium: '66.66%',
    strong: '100%'
  };
  const INTENSITY_WEIGHT = {
    light: 1,
    medium: 2,
    strong: 3
  };
  const FOCUS_BUDGET = 3;
  const MANA_MAX = 1000;

  const LAYER_LABELS = {
    fortune: '运',
    curse: '厄'
  };

  const MODE_LABELS = {
    auto: '自动',
    speed: '速',
    value: '值',
    safety: '守',
    commit: '定'
  };

  const INTENSITY_LABELS = {
    light: '轻',
    medium: '中',
    strong: '强'
  };

  const CURSE_TARGET_LABELS = {
    top: '上',
    left: '左',
    right: '右'
  };

  const COMMIT_ROUTE_LABELS = {
    auto: '自动',
    'shape-sequence': '顺子',
    'shape-pair': '对子',
    'shape-triplet': '刻子',
    'suit-m': '万染',
    'suit-p': '筒染',
    'suit-s': '索染',
    honor: '字牌',
    'seat-wind': '自风',
    'round-wind': '场风',
    yakuhai: '役牌',
    dora: '宝牌'
  };

  const CURSE_POWER_BY_INTENSITY = {
    light: 60,
    medium: 100,
    strong: 140
  };
  const FORTUNE_POWER_BY_INTENSITY = {
    light: 60,
    medium: 100,
    strong: 140
  };

  const DEFAULT_STATE = Object.freeze({
    focusBudget: FOCUS_BUDGET,
    activeLayer: 'fortune',
    fortune: {
      systemMode: 'auto',
      mode: 'speed',
      intensity: 'light',
      commitRouteId: 'auto'
    },
    curse: {
      selectedTargetSeat: 'top',
      targets: {
        top: { systemMode: 'off', intensity: 'light' },
        left: { systemMode: 'off', intensity: 'light' },
        right: { systemMode: 'off', intensity: 'light' }
      }
    },
    mana: MANA_MAX
  });

  const PANEL_HTML = `
    <aside class="luck-array-container" id="${PANEL_ID}" aria-label="魔运风向面板">
      <div class="luck-v-tubes-station">
        <div class="luck-tech-track luck-mana-track" aria-hidden="true">
          <div class="luck-mana-energy" id="luck-mana-energy"></div>
          <div class="luck-track-cutters"></div>
        </div>
        <div class="luck-v-mana-val" aria-label="Mana">
          <div class="digit" id="luck-mana-digit">1000</div>
          <div class="lbl">MANA</div>
        </div>

        <div class="luck-tech-track luck-intent-track" aria-label="注意力">
          <div class="luck-intent-ghost" id="luck-intent-ghost"></div>
          <div class="luck-intent-solid" id="luck-intent-solid"></div>
          <div class="luck-track-cutters"></div>
          <div class="luck-focus-pips" id="luck-focus-pips" aria-hidden="true">
            <div class="luck-focus-pip" data-focus-slot="3"></div>
            <div class="luck-focus-pip" data-focus-slot="2"></div>
            <div class="luck-focus-pip" data-focus-slot="1"></div>
          </div>
          <div class="luck-intent-hitboxes" id="luck-intent-hitboxes">
            <button class="luck-sub-hit" type="button" data-intensity="strong" data-val="100%" aria-label="强"></button>
            <button class="luck-sub-hit" type="button" data-intensity="medium" data-val="66.66%" aria-label="中"></button>
            <button class="luck-sub-hit" type="button" data-intensity="light" data-val="33.33%" aria-label="轻"></button>
          </div>
        </div>
      </div>

      <div class="luck-v-console" role="group" aria-label="魔运设置">
        <div class="luck-v-console-axis"></div>
        <button class="luck-v-title-writing" id="luck-layer-title" type="button" aria-label="切换运厄层">运</button>
        <div class="luck-layer-switch" aria-label="术式切换">
          <button class="luck-layer-btn" type="button" data-layer="fortune">运</button>
          <button class="luck-layer-btn is-curse" type="button" data-layer="curse">厄</button>
        </div>

        <div class="luck-panel-section luck-switch-section" aria-label="魔运开关">
          <div class="luck-section-kicker">开关</div>
          <div class="luck-sys-array">
            <button class="luck-opt-txt" type="button" data-system-mode="on" aria-label="开启魔运">ON</button>
            <button class="luck-opt-txt" type="button" data-system-mode="auto" aria-label="自动魔运">AUTO</button>
            <button class="luck-opt-txt" type="button" data-system-mode="off" aria-label="关闭魔运">OFF</button>
          </div>
        </div>

        <div class="luck-divider-diamond"></div>

        <div class="luck-panel-section luck-wind-section" aria-label="风向">
          <div class="luck-section-kicker" id="luck-mode-section-kicker">风向</div>
          <div class="luck-wind-col">
            <button class="luck-wind-btn dir-speed" type="button" data-mode="speed"><span>速</span></button>
            <button class="luck-wind-btn dir-value" type="button" data-mode="value"><span>值</span></button>
            <button class="luck-wind-btn dir-safety" type="button" data-mode="safety"><span>守</span></button>
            <button class="luck-wind-btn dir-commit" type="button" data-mode="commit"><span>定</span></button>
          </div>
          <div class="luck-curse-target-col" hidden>
            <button class="luck-curse-target-btn target-top" type="button" data-target-seat="top"><span>上</span></button>
            <button class="luck-curse-target-btn target-left" type="button" data-target-seat="left"><span>左</span></button>
            <button class="luck-curse-target-btn target-right" type="button" data-target-seat="right"><span>右</span></button>
          </div>
          <div class="luck-commit-route-box" id="luck-commit-route-box" hidden>
            <div class="luck-commit-route-kicker">收束</div>
            <div class="luck-commit-route-grid" id="luck-commit-route-grid"></div>
          </div>
        </div>

        <div class="luck-divider-diamond"></div>

        <div class="luck-panel-section luck-intensity-section" aria-label="风向强度">
          <div class="luck-section-kicker">强度</div>
          <div class="luck-intensity-col">
            <button class="luck-intensity-btn" type="button" data-intensity="strong">强</button>
            <button class="luck-intensity-btn" type="button" data-intensity="medium">中</button>
            <button class="luck-intensity-btn" type="button" data-intensity="light">轻</button>
          </div>
        </div>
      </div>
    </aside>`;

  let mounted = false;
  let panelEl = null;
  let manaEnergyEl = null;
  let manaDigitEl = null;
  let intentGhostEl = null;
  let intentSolidEl = null;
  let focusPipsEl = null;
  let layerTitleEl = null;
  let modeSectionKickerEl = null;
  let commitRouteBoxEl = null;
  let commitRouteGridEl = null;
  let unsubscribeRuntimeRefresh = null;
  let runtimeRefreshBindAttempts = 0;
  let runtimeLuckSyncing = false;
  let lastRuntimeLuckSyncSignature = '';
  let currentState = clone(DEFAULT_STATE);

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function normalizeBoolean(value, fallback) {
    if (typeof value === 'boolean') return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return fallback;
  }

  function getIntensityCost(intensity) {
    return INTENSITY_WEIGHT[intensity] || INTENSITY_WEIGHT.light;
  }

  function normalizeSystemMode(value, fallback = 'off') {
    return SYSTEM_MODES.includes(value) ? value : fallback;
  }

  function normalizeCommitRouteId(value, fallback = 'auto') {
    return COMMIT_ROUTE_IDS.includes(value) ? value : fallback;
  }

  function getActiveLayer() {
    return LAYERS.includes(currentState.activeLayer) ? currentState.activeLayer : DEFAULT_STATE.activeLayer;
  }

  function normalizeCurseTargetState(source = {}) {
    const target = source && typeof source === 'object' ? source : {};
    return {
      systemMode: normalizeSystemMode(
        target.systemMode,
        normalizeBoolean(target.enabled, false) ? 'on' : 'off'
      ),
      intensity: INTENSITIES.includes(target.intensity) ? target.intensity : DEFAULT_STATE.curse.targets.top.intensity
    };
  }

  function normalizeCurseTargets(source = {}) {
    const targets = source && typeof source === 'object' ? source : {};
    return CURSE_TARGET_SEATS.reduce((result, seat) => {
      result[seat] = normalizeCurseTargetState(targets[seat]);
      return result;
    }, {});
  }

  function normalizeCurseState(source = {}) {
    const curse = source && typeof source === 'object' ? source : {};
    const selectedTargetSeat = CURSE_TARGET_SEATS.includes(curse.selectedTargetSeat)
      ? curse.selectedTargetSeat
      : CURSE_TARGET_SEATS.includes(curse.targetSeat)
        ? curse.targetSeat
        : DEFAULT_STATE.curse.selectedTargetSeat;
    const targets = normalizeCurseTargets(curse.targets);

    if (!curse.targets && CURSE_TARGET_SEATS.includes(curse.targetSeat)) {
      targets[curse.targetSeat] = normalizeCurseTargetState({
        systemMode: curse.systemMode,
        enabled: curse.enabled,
        intensity: curse.intensity
      });
    }

    return {
      selectedTargetSeat,
      targets
    };
  }

  function getLayerState(layer = getActiveLayer()) {
    const normalizedLayer = LAYERS.includes(layer) ? layer : DEFAULT_STATE.activeLayer;
    const fallback = DEFAULT_STATE[normalizedLayer] || {};
    const source = currentState[normalizedLayer] && typeof currentState[normalizedLayer] === 'object'
      ? currentState[normalizedLayer]
      : {};
    if (normalizedLayer === 'curse') {
      return normalizeCurseState({
        ...fallback,
        ...source
      });
    }
    return {
      ...fallback,
      ...source
    };
  }

  function getSelectedCurseTargetSeat(curseState = getLayerState('curse')) {
    return CURSE_TARGET_SEATS.includes(curseState.selectedTargetSeat)
      ? curseState.selectedTargetSeat
      : DEFAULT_STATE.curse.selectedTargetSeat;
  }

  function getCurseTargetState(seat, curseState = getLayerState('curse')) {
    const targets = curseState && curseState.targets && typeof curseState.targets === 'object'
      ? curseState.targets
      : {};
    return normalizeCurseTargetState(targets[seat]);
  }

  function normalizeLayerPatch(layer, patch = {}) {
    const next = {};
    const fallbackLayerState = getLayerState(layer);
    if (Object.prototype.hasOwnProperty.call(patch, 'systemMode') && SYSTEM_MODES.includes(patch.systemMode)) {
      next.systemMode = patch.systemMode;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'enabled')) {
      next.systemMode = normalizeBoolean(patch.enabled, fallbackLayerState.systemMode !== 'off') ? 'on' : 'off';
    }
    if (layer === 'fortune' && Object.prototype.hasOwnProperty.call(patch, 'mode') && WIND_MODES.includes(patch.mode)) {
      next.mode = patch.mode;
    }
    if (layer === 'fortune' && Object.prototype.hasOwnProperty.call(patch, 'commitRouteId')) {
      next.commitRouteId = normalizeCommitRouteId(patch.commitRouteId, fallbackLayerState.commitRouteId || 'auto');
    }
    if (layer === 'curse' && Object.prototype.hasOwnProperty.call(patch, 'targetSeat') && CURSE_TARGET_SEATS.includes(patch.targetSeat)) {
      next.selectedTargetSeat = patch.targetSeat;
    }
    if (layer === 'curse' && Object.prototype.hasOwnProperty.call(patch, 'selectedTargetSeat') && CURSE_TARGET_SEATS.includes(patch.selectedTargetSeat)) {
      next.selectedTargetSeat = patch.selectedTargetSeat;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'intensity') && INTENSITIES.includes(patch.intensity)) {
      if (layer === 'curse') {
        const selectedTargetSeat = next.selectedTargetSeat || getSelectedCurseTargetSeat(fallbackLayerState);
        next.targets = {
          ...(next.targets || {}),
          [selectedTargetSeat]: {
            ...getCurseTargetState(selectedTargetSeat, fallbackLayerState),
            intensity: patch.intensity
          }
        };
      } else {
        next.intensity = patch.intensity;
      }
    }
    if (layer === 'curse' && Object.prototype.hasOwnProperty.call(patch, 'systemMode') && SYSTEM_MODES.includes(patch.systemMode)) {
      const selectedTargetSeat = next.selectedTargetSeat || getSelectedCurseTargetSeat(fallbackLayerState);
      next.targets = {
        ...(next.targets || {}),
        [selectedTargetSeat]: {
          ...getCurseTargetState(selectedTargetSeat, fallbackLayerState),
          ...(next.targets && next.targets[selectedTargetSeat] ? next.targets[selectedTargetSeat] : {}),
          systemMode: patch.systemMode
        }
      };
      delete next.systemMode;
    }
    if (layer === 'curse' && Object.prototype.hasOwnProperty.call(patch, 'enabled')) {
      const selectedTargetSeat = next.selectedTargetSeat || getSelectedCurseTargetSeat(fallbackLayerState);
      next.targets = {
        ...(next.targets || {}),
        [selectedTargetSeat]: {
          ...getCurseTargetState(selectedTargetSeat, fallbackLayerState),
          ...(next.targets && next.targets[selectedTargetSeat] ? next.targets[selectedTargetSeat] : {}),
          systemMode: normalizeBoolean(patch.enabled, false) ? 'on' : 'off'
        }
      };
      delete next.systemMode;
    }
    if (layer === 'curse' && patch.targets && typeof patch.targets === 'object') {
      next.targets = {
        ...(next.targets || {}),
        ...CURSE_TARGET_SEATS.reduce((result, seat) => {
          if (patch.targets[seat] && typeof patch.targets[seat] === 'object') {
            result[seat] = normalizeCurseTargetState({
              ...getCurseTargetState(seat, fallbackLayerState),
              ...patch.targets[seat]
            });
          }
          return result;
        }, {})
      };
    }
    return next;
  }

  function normalizeStatePatch(patch = {}, options = {}) {
    const source = patch && typeof patch === 'object' ? patch : {};
    const patchLayer = LAYERS.includes(source.layer)
      ? source.layer
      : LAYERS.includes(options.layer)
        ? options.layer
        : getActiveLayer();
    const next = {};
    if (Object.prototype.hasOwnProperty.call(source, 'activeLayer') && LAYERS.includes(source.activeLayer)) {
      next.activeLayer = source.activeLayer;
    }
    if (source.fortune && typeof source.fortune === 'object') {
      next.fortune = normalizeLayerPatch('fortune', source.fortune);
    }
    if (source.curse && typeof source.curse === 'object') {
      next.curse = normalizeLayerPatch('curse', source.curse);
    }
    const hasLegacyLayerPatch = ['systemMode', 'enabled', 'mode', 'commitRouteId', 'targetSeat', 'selectedTargetSeat', 'intensity'].some((key) => (
      Object.prototype.hasOwnProperty.call(source, key)
    ));
    if (hasLegacyLayerPatch) {
      const inferredLayer = Object.prototype.hasOwnProperty.call(source, 'targetSeat')
        ? 'curse'
        : Object.prototype.hasOwnProperty.call(source, 'mode')
          ? 'fortune'
          : patchLayer;
      next[inferredLayer] = {
        ...(next[inferredLayer] || {}),
        ...normalizeLayerPatch(inferredLayer, source)
      };
    }
    if (Object.prototype.hasOwnProperty.call(source, 'mana')) {
      const mana = Number(source.mana);
      if (Number.isFinite(mana)) next.mana = Math.max(0, Math.min(MANA_MAX, Math.round(mana)));
    }
    if (Object.prototype.hasOwnProperty.call(source, 'focusBudget')) {
      const focusBudget = Number(source.focusBudget);
      if (Number.isFinite(focusBudget)) next.focusBudget = Math.max(0, Math.round(focusBudget));
    }
    return next;
  }

  function calculateFocusSummary(state = currentState) {
    const source = state && typeof state === 'object' ? state : currentState;
    const fortuneState = source.fortune && typeof source.fortune === 'object'
      ? { ...DEFAULT_STATE.fortune, ...source.fortune }
      : getLayerState('fortune');
    const curseState = source.curse && typeof source.curse === 'object'
      ? normalizeCurseState(source.curse)
      : getLayerState('curse');
    const budget = Math.max(0, Number(source.focusBudget || FOCUS_BUDGET) || FOCUS_BUDGET);
    const fortuneCost = fortuneState.systemMode === 'on' ? getIntensityCost(fortuneState.intensity) : 0;
    const curseTargets = CURSE_TARGET_SEATS.map((seat) => {
      const target = getCurseTargetState(seat, curseState);
      const cost = target.systemMode === 'on' ? getIntensityCost(target.intensity) : 0;
      return {
        seat,
        label: CURSE_TARGET_LABELS[seat] || seat,
        systemMode: target.systemMode,
        intensity: target.intensity,
        cost
      };
    });
    const curseCost = curseTargets.reduce((sum, target) => sum + target.cost, 0);
    const used = fortuneCost + curseCost;
    return {
      budget,
      used,
      remaining: Math.max(0, budget - used),
      over: Math.max(0, used - budget),
      full: used >= budget,
      fortuneCost,
      curseCost,
      curseTargets
    };
  }

  function clampStateToFocusBudget(state) {
    const source = state && typeof state === 'object' ? state : clone(DEFAULT_STATE);
    const focusSummary = calculateFocusSummary(source);
    if (focusSummary.used <= focusSummary.budget) return source;

    const next = {
      ...source,
      fortune: {
        ...DEFAULT_STATE.fortune,
        ...(source.fortune || {})
      },
      curse: normalizeCurseState(source.curse || DEFAULT_STATE.curse)
    };
    let remaining = Math.max(0, focusSummary.budget);

    if (next.fortune.systemMode === 'on') {
      const fortuneCost = getIntensityCost(next.fortune.intensity);
      if (fortuneCost <= remaining) {
        remaining -= fortuneCost;
      } else {
        next.fortune.systemMode = 'off';
      }
    }

    next.curse.targets = CURSE_TARGET_SEATS.reduce((targets, seat) => {
      const target = getCurseTargetState(seat, next.curse);
      if (target.systemMode !== 'on') {
        targets[seat] = target;
        return targets;
      }
      const cost = getIntensityCost(target.intensity);
      if (cost <= remaining) {
        remaining -= cost;
        targets[seat] = target;
      } else {
        targets[seat] = {
          ...target,
          systemMode: 'off'
        };
      }
      return targets;
    }, {});

    return next;
  }

  function readStoredState() {
    if (!global.localStorage || typeof global.localStorage.getItem !== 'function') return {};
    try {
      const raw = global.localStorage.getItem(WIND_STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return {};
      const next = { ...parsed };
      delete next.mana;
      return next;
    } catch (error) {
      return {};
    }
  }

  function persistState() {
    if (!global.localStorage || typeof global.localStorage.setItem !== 'function') return;
    try {
      global.localStorage.setItem(WIND_STORAGE_KEY, JSON.stringify({
        activeLayer: getActiveLayer(),
        focusBudget: currentState.focusBudget || FOCUS_BUDGET,
        fortune: getLayerState('fortune'),
        curse: getLayerState('curse')
      }));
    } catch (error) {
      // Storage failure should never block the table UI.
    }
  }

  function resolveLuckRuntime(runtime) {
    if (!runtime || typeof runtime !== 'object') return null;
    if (typeof runtime.getSeatHandCodes === 'function' || typeof runtime.setLuckWindState === 'function') {
      return runtime;
    }
    if (typeof runtime.getRuntime === 'function') {
      const childRuntime = runtime.getRuntime();
      if (childRuntime && childRuntime !== runtime) return resolveLuckRuntime(childRuntime);
    }
    return runtime;
  }

  function getRuntime() {
    const publicUi = global.AceZeroMahjongUI || null;
    const runtimeApi = publicUi && publicUi.runtime ? publicUi.runtime : null;
    const runtime = runtimeApi && typeof runtimeApi.getRuntime === 'function'
      ? runtimeApi.getRuntime()
      : null;
    return resolveLuckRuntime(runtime);
  }

  function syncManaFromRuntime(options = {}) {
    const runtime = getRuntime();
    if (!runtime || typeof runtime.getLuckManaState !== 'function') return false;
    const manaState = runtime.getLuckManaState();
    const bottom = manaState
      && manaState.seats
      && manaState.seats.bottom
      && typeof manaState.seats.bottom === 'object'
        ? manaState.seats.bottom
        : null;
    if (!bottom || !Number.isFinite(Number(bottom.mana))) return false;
    setState({ mana: Number(bottom.mana) }, {
      reason: 'runtime-mana-sync',
      emit: options.emit === true
    });
    if (panelEl) {
      panelEl.classList.toggle('is-mana-locked', Boolean(bottom.manaLocked));
    }
    return true;
  }

  function buildCommitRouteInput() {
    const runtime = getRuntime();
    if (!runtime) return null;
    const seat = 'bottom';
    const board = runtime.board && typeof runtime.board === 'object' ? runtime.board : {};
    const activeSeats = runtime.topology && Array.isArray(runtime.topology.activeSeats)
      ? runtime.topology.activeSeats.slice()
      : Array.isArray(runtime.activeSeats)
        ? runtime.activeSeats.slice()
        : ['bottom', 'right', 'top', 'left'];
    const roundConfig = runtime.roundConfig && typeof runtime.roundConfig === 'object'
      ? clone(runtime.roundConfig)
      : {};

    if (board && Number.isFinite(Number(board.zhuangfeng))) roundConfig.zhuangfeng = Number(board.zhuangfeng);
    if (board && Number.isFinite(Number(board.jushu))) roundConfig.jushu = Number(board.jushu);

    return {
      seat,
      activeSeats,
      dealerSeat: typeof runtime.getDealerSeat === 'function'
        ? runtime.getDealerSeat()
        : activeSeats[0] || 'bottom',
      handCodes: typeof runtime.getSeatHandCodes === 'function'
        ? runtime.getSeatHandCodes(seat)
        : [],
      wallState: typeof runtime.getWallState === 'function'
        ? runtime.getWallState()
        : {},
      roundConfig
    };
  }

  function getFallbackCommitRouteSelection(routeId = 'auto') {
    const selectedRouteId = normalizeCommitRouteId(routeId, 'auto');
    return {
      requestedRouteId: selectedRouteId,
      selectedRouteId,
      routeConfidence: 0,
      blockedReason: null,
      selectedRoute: {
        routeId: selectedRouteId,
        label: COMMIT_ROUTE_LABELS[selectedRouteId] || selectedRouteId,
        family: selectedRouteId === 'auto' ? 'auto' : 'unknown',
        confidence: 0,
        selectable: selectedRouteId === 'auto'
      },
      routes: [{
        routeId: 'auto',
        label: COMMIT_ROUTE_LABELS.auto,
        family: 'auto',
        confidence: 0,
        selectable: true
      }]
    };
  }

  function getCommitRouteSelection(routeId = null) {
    const fortuneState = getLayerState('fortune');
    const requestedRouteId = normalizeCommitRouteId(routeId || fortuneState.commitRouteId || 'auto', 'auto');
    const evaluator = global.AceMahjongLuckCommitRouteEvaluator || null;
    if (!evaluator || typeof evaluator.buildCommitRouteSelection !== 'function') {
      return getFallbackCommitRouteSelection(requestedRouteId);
    }
    const input = buildCommitRouteInput();
    if (!input) return getFallbackCommitRouteSelection(requestedRouteId);
    try {
      return evaluator.buildCommitRouteSelection(input, requestedRouteId);
    } catch (error) {
      return getFallbackCommitRouteSelection(requestedRouteId);
    }
  }

  function getWindState() {
    const fortuneState = getLayerState('fortune');
    const effectiveMode = fortuneState.systemMode === 'auto' ? 'auto' : fortuneState.mode;
    const focusSummary = calculateFocusSummary();
    const commitRouteSelection = getCommitRouteSelection(fortuneState.commitRouteId || 'auto');
    const commitRoute = commitRouteSelection && commitRouteSelection.selectedRoute
      ? commitRouteSelection.selectedRoute
      : null;
    return {
      enabled: fortuneState.systemMode !== 'off',
      systemMode: fortuneState.systemMode,
      mode: effectiveMode,
      modeLabel: MODE_LABELS[effectiveMode] || effectiveMode,
      intensity: fortuneState.intensity,
      intensityLabel: INTENSITY_LABELS[fortuneState.intensity] || fortuneState.intensity,
      commitRouteId: fortuneState.commitRouteId || 'auto',
      commitRouteLabel: commitRoute
        ? commitRoute.label
        : COMMIT_ROUTE_LABELS[fortuneState.commitRouteId] || COMMIT_ROUTE_LABELS.auto,
      routeConfidence: commitRouteSelection ? commitRouteSelection.routeConfidence : 0,
      selectedCommitRouteId: commitRouteSelection ? commitRouteSelection.selectedRouteId : null,
      commitRouteBlockedReason: commitRouteSelection ? commitRouteSelection.blockedReason : null,
      attentionCost: focusSummary.fortuneCost,
      mana: currentState.mana
    };
  }

  function getForceState() {
    const fortuneState = getLayerState('fortune');
    const curseState = getLayerState('curse');
    const selectedTargetSeat = getSelectedCurseTargetSeat(curseState);
    const selectedTarget = getCurseTargetState(selectedTargetSeat, curseState);
    const focusSummary = calculateFocusSummary();
    const activeForces = [];

    if (fortuneState.systemMode === 'on') {
      const power = FORTUNE_POWER_BY_INTENSITY[fortuneState.intensity] || FORTUNE_POWER_BY_INTENSITY.light;
      activeForces.push({
        id: 'player-bottom-fortune-self',
        kind: 'fortune',
        sourceSeat: 'bottom',
        targetSeat: 'bottom',
        tier: 1,
        power,
        precision: 1,
        metadata: {
          source: 'luck-panel',
          layer: 'fortune',
          systemMode: fortuneState.systemMode,
          mode: fortuneState.mode,
          modeLabel: MODE_LABELS[fortuneState.mode] || fortuneState.mode,
          intensity: fortuneState.intensity,
          attentionCost: getIntensityCost(fortuneState.intensity)
        }
      });
    }

    CURSE_TARGET_SEATS.forEach((targetSeat) => {
      const target = getCurseTargetState(targetSeat, curseState);
      if (target.systemMode !== 'on') return;
      const power = CURSE_POWER_BY_INTENSITY[target.intensity] || CURSE_POWER_BY_INTENSITY.light;
      activeForces.push({
        id: `player-bottom-curse-${targetSeat}`,
        kind: 'curse',
        sourceSeat: 'bottom',
        targetSeat,
        tier: 1,
        power,
        precision: 1,
        metadata: {
          source: 'luck-panel',
          layer: 'curse',
          systemMode: target.systemMode,
          intensity: target.intensity,
          targetLabel: CURSE_TARGET_LABELS[targetSeat] || targetSeat,
          attentionCost: getIntensityCost(target.intensity)
        }
      });
    });

    return {
      enabled: activeForces.length > 0,
      systemMode: activeForces.length > 0 ? 'on' : selectedTarget.systemMode,
      kind: activeForces.some((force) => force.kind === 'fortune') && activeForces.some((force) => force.kind === 'curse')
        ? 'mixed'
        : activeForces.some((force) => force.kind === 'fortune')
          ? 'fortune'
          : 'curse',
      sourceSeat: 'bottom',
      targetSeat: selectedTargetSeat,
      targetLabel: CURSE_TARGET_LABELS[selectedTargetSeat] || selectedTargetSeat,
      selectedTargetSeat,
      fortune: clone(fortuneState),
      intensity: selectedTarget.intensity,
      intensityLabel: INTENSITY_LABELS[selectedTarget.intensity] || selectedTarget.intensity,
      attentionCost: getIntensityCost(selectedTarget.intensity),
      targets: clone(curseState.targets),
      focus: focusSummary,
      activeForces
    };
  }

  function createRuntimeLuckSyncSignature(windState, forceState) {
    try {
      return JSON.stringify({
        windState,
        forceState
      });
    } catch (error) {
      return '';
    }
  }

  function trySyncRuntimeLuckState(options = {}) {
    if (runtimeLuckSyncing) return false;
    const publicUi = global.AceZeroMahjongUI || null;
    const runtimeApi = publicUi && publicUi.runtime ? publicUi.runtime : null;
    const runtime = resolveLuckRuntime(
      runtimeApi && typeof runtimeApi.getRuntime === 'function'
        ? runtimeApi.getRuntime()
        : null
    );
    if (!runtime) return false;
    const windState = getWindState();
    const forceState = getForceState();
    const signature = createRuntimeLuckSyncSignature(windState, forceState);
    if (signature && options.force !== true && signature === lastRuntimeLuckSyncSignature) {
      return false;
    }
    const synced = {
      wind: false,
      force: false
    };
    runtimeLuckSyncing = true;
    try {
      if (typeof runtime.setLuckWindState === 'function') {
        runtime.setLuckWindState('bottom', {
          enabled: windState.enabled,
          systemMode: windState.systemMode,
          mode: windState.mode,
          intensity: windState.intensity,
          commitRouteId: windState.commitRouteId,
          routeConfidence: windState.routeConfidence,
          selectedCommitRouteId: windState.selectedCommitRouteId,
          commitRouteBlockedReason: windState.commitRouteBlockedReason,
          mana: currentState.mana,
          source: 'luck-panel'
        }, { silent: true });
        synced.wind = true;
      }
      if (typeof runtime.setLuckForceState === 'function') {
        runtime.setLuckForceState('bottom', {
          ...forceState,
          source: 'luck-panel'
        }, { silent: true });
        synced.force = true;
      }
      if ((synced.wind || synced.force) && signature) {
        lastRuntimeLuckSyncSignature = signature;
      }
    } finally {
      runtimeLuckSyncing = false;
    }
    return synced.wind || synced.force ? synced : false;
  }

  function emitChange(reason) {
    const detail = {
      reason: reason || 'state-change',
      seat: 'bottom',
      activeLayer: getActiveLayer(),
      focus: calculateFocusSummary(),
      windState: getWindState(),
      forceState: getForceState(),
      runtimeSynced: trySyncRuntimeLuckState()
    };
    if (typeof global.CustomEvent === 'function' && typeof global.dispatchEvent === 'function') {
      global.dispatchEvent(new CustomEvent('ace-mahjong:luck-panel-change', { detail }));
    }
    return detail;
  }

  function queryAll(selector) {
    return panelEl ? Array.from(panelEl.querySelectorAll(selector)) : [];
  }

  function getRenderableCommitRoutes(selection) {
    const fallback = getFallbackCommitRouteSelection('auto');
    const source = selection && Array.isArray(selection.routes) && selection.routes.length
      ? selection
      : fallback;
    const routes = source.routes || fallback.routes;
    const autoRoute = routes.find((route) => route.routeId === 'auto') || fallback.routes[0];
    const selectedId = source.requestedRouteId || source.selectedRouteId || 'auto';
    const visible = [autoRoute].concat(
      routes
        .filter((route) => route.routeId !== 'auto' && route.selectable)
        .sort((left, right) => Number(right.confidence || 0) - Number(left.confidence || 0))
        .slice(0, 5)
    );
    const selectedRoute = routes.find((route) => route.routeId === selectedId);
    if (selectedRoute && !visible.some((route) => route.routeId === selectedRoute.routeId)) {
      visible.push(selectedRoute);
    }
    return visible;
  }

  function getRouteConfidenceLevel(route) {
    const confidence = Number(route && route.confidence);
    if (!Number.isFinite(confidence) || confidence <= 0) return 0;
    if (confidence < 0.45) return 1;
    if (confidence < 0.68) return 2;
    return 3;
  }

  function renderCommitRoutes(selection) {
    if (!commitRouteGridEl) return;
    const fortuneState = getLayerState('fortune');
    const selectedId = fortuneState.commitRouteId || 'auto';
    const routes = getRenderableCommitRoutes(selection);
    commitRouteGridEl.innerHTML = '';
    routes.forEach((route) => {
      const button = global.document.createElement('button');
      button.type = 'button';
      button.className = 'luck-commit-route-btn';
      button.dataset.commitRouteId = route.routeId;
      button.dataset.level = String(getRouteConfidenceLevel(route));
      button.textContent = route.label || COMMIT_ROUTE_LABELS[route.routeId] || route.routeId;
      button.classList.toggle('is-active', route.routeId === selectedId);
      button.classList.toggle('is-auto-route', route.routeId === 'auto');
      button.classList.toggle('is-muted', route.routeId !== 'auto' && !route.selectable);
      button.disabled = route.routeId !== 'auto' && route.selectable === false;
      button.setAttribute('aria-pressed', route.routeId === selectedId ? 'true' : 'false');
      commitRouteGridEl.appendChild(button);
    });
  }

  function setActiveButtons() {
    const activeLayer = getActiveLayer();
    const fortuneState = getLayerState('fortune');
    const curseState = getLayerState('curse');
    const selectedTargetSeat = getSelectedCurseTargetSeat(curseState);
    const selectedTarget = getCurseTargetState(selectedTargetSeat, curseState);
    const layerSystemMode = activeLayer === 'curse' ? selectedTarget.systemMode : fortuneState.systemMode;
    const layerIntensity = activeLayer === 'curse' ? selectedTarget.intensity : fortuneState.intensity;
    queryAll('.luck-layer-btn').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.layer === activeLayer);
    });
    queryAll('.luck-opt-txt').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.systemMode === layerSystemMode);
    });
    queryAll('.luck-wind-btn').forEach((button) => {
      const isMode = button.dataset.mode === fortuneState.mode;
      const level = fortuneState.systemMode === 'on' && isMode ? getIntensityCost(fortuneState.intensity) : 0;
      button.classList.toggle('is-active', activeLayer === 'fortune' && level > 0);
      button.classList.toggle('is-selected', activeLayer === 'fortune' && isMode);
      button.dataset.level = String(level);
    });
    queryAll('.luck-curse-target-btn').forEach((button) => {
      const targetSeat = button.dataset.targetSeat;
      const target = getCurseTargetState(targetSeat, curseState);
      const isSelected = targetSeat === selectedTargetSeat;
      const level = target.systemMode === 'on' ? getIntensityCost(target.intensity) : 0;
      button.classList.toggle('is-active', activeLayer === 'curse' && level > 0);
      button.classList.toggle('is-selected', activeLayer === 'curse' && isSelected);
      button.classList.toggle('is-auto', target.systemMode === 'auto');
      button.dataset.level = String(level);
      button.dataset.systemMode = target.systemMode;
      button.dataset.intensity = target.intensity;
    });
    queryAll('.luck-intensity-btn').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.intensity === layerIntensity);
    });
    queryAll('.luck-commit-route-btn').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.commitRouteId === (fortuneState.commitRouteId || 'auto'));
    });
  }

  function renderFocusMeter(focusSummary) {
    const safeBudget = Math.max(1, focusSummary.budget || FOCUS_BUDGET);
    const usedHeight = Math.max(0, Math.min(100, (focusSummary.used / safeBudget) * 100));
    if (intentSolidEl) {
      intentSolidEl.style.height = `${usedHeight}%`;
    }
    if (intentGhostEl) {
      intentGhostEl.style.height = '0%';
    }
    if (focusPipsEl) {
      Array.from(focusPipsEl.querySelectorAll('.luck-focus-pip')).forEach((pip) => {
        const slot = Number(pip.dataset.focusSlot || 0);
        pip.classList.toggle('is-filled', focusSummary.used >= slot);
        pip.classList.toggle('is-over', focusSummary.over > 0);
      });
    }
  }

  function render() {
    if (!panelEl) return;
    const activeLayer = getActiveLayer();
    const fortuneState = getLayerState('fortune');
    const curseState = getLayerState('curse');
    const selectedTargetSeat = getSelectedCurseTargetSeat(curseState);
    const selectedTarget = getCurseTargetState(selectedTargetSeat, curseState);
    const layerSystemMode = activeLayer === 'curse' ? selectedTarget.systemMode : fortuneState.systemMode;
    const layerIntensity = activeLayer === 'curse' ? selectedTarget.intensity : fortuneState.intensity;
    const focusSummary = calculateFocusSummary();
    const windCol = panelEl.querySelector('.luck-wind-col');
    const targetCol = panelEl.querySelector('.luck-curse-target-col');
    const commitRouteSelection = getCommitRouteSelection(fortuneState.commitRouteId || 'auto');
    panelEl.classList.toggle('is-disabled', layerSystemMode === 'off');
    panelEl.classList.toggle('is-auto', layerSystemMode === 'auto');
    panelEl.classList.toggle('is-curse-layer', activeLayer === 'curse');
    panelEl.classList.toggle('is-commit-route-active', activeLayer === 'fortune' && fortuneState.mode === 'commit');
    panelEl.classList.toggle('is-focus-full', focusSummary.full);
    panelEl.dataset.layer = activeLayer;
    panelEl.dataset.systemMode = layerSystemMode;
    panelEl.dataset.mode = activeLayer === 'fortune'
      ? (fortuneState.systemMode === 'auto' ? 'auto' : fortuneState.mode)
      : 'curse';
    panelEl.dataset.targetSeat = selectedTargetSeat;
    panelEl.dataset.intensity = layerIntensity;
    panelEl.dataset.enabled = layerSystemMode === 'off' ? 'false' : 'true';
    panelEl.dataset.focusUsed = String(focusSummary.used);
    panelEl.dataset.focusBudget = String(focusSummary.budget);
    panelEl.dataset.focusRemaining = String(focusSummary.remaining);

    if (layerTitleEl) {
      layerTitleEl.textContent = LAYER_LABELS[activeLayer] || '运';
      layerTitleEl.setAttribute('aria-label', activeLayer === 'curse' ? '切换到运层' : '切换到厄层');
    }
    if (modeSectionKickerEl) {
      modeSectionKickerEl.textContent = activeLayer === 'curse' ? '目标' : '风向';
    }
    if (windCol) {
      windCol.hidden = activeLayer !== 'fortune';
    }
    if (targetCol) {
      targetCol.hidden = activeLayer !== 'curse';
    }
    if (commitRouteBoxEl) {
      commitRouteBoxEl.hidden = activeLayer !== 'fortune' || fortuneState.mode !== 'commit';
    }
    renderCommitRoutes(commitRouteSelection);

    if (manaEnergyEl) {
      manaEnergyEl.style.height = `${Math.max(0, Math.min(100, (currentState.mana / MANA_MAX) * 100))}%`;
    }
    if (manaDigitEl) {
      manaDigitEl.textContent = String(Math.round(currentState.mana));
    }
    renderFocusMeter(focusSummary);
    setActiveButtons();
  }

  function flashBudgetBlocked() {
    if (!panelEl || typeof global.setTimeout !== 'function') return;
    panelEl.classList.remove('is-budget-blocked');
    // Force class restart for repeated rejected clicks.
    void panelEl.offsetWidth;
    panelEl.classList.add('is-budget-blocked');
    global.setTimeout(() => {
      if (panelEl) panelEl.classList.remove('is-budget-blocked');
    }, 360);
  }

  function mergeStatePatch(baseState, nextPatch) {
    const source = baseState && typeof baseState === 'object' ? baseState : clone(DEFAULT_STATE);
    const patch = nextPatch && typeof nextPatch === 'object' ? nextPatch : {};
    return {
      focusBudget: Object.prototype.hasOwnProperty.call(patch, 'focusBudget') ? patch.focusBudget : (source.focusBudget || FOCUS_BUDGET),
      activeLayer: LAYERS.includes(patch.activeLayer) ? patch.activeLayer : getActiveLayer(),
      fortune: {
        ...DEFAULT_STATE.fortune,
        ...(source.fortune || {}),
        ...(patch.fortune || {})
      },
      curse: normalizeCurseState({
        ...normalizeCurseState(source.curse || DEFAULT_STATE.curse),
        ...(patch.curse || {}),
        targets: {
          ...normalizeCurseState(source.curse || DEFAULT_STATE.curse).targets,
          ...((patch.curse && patch.curse.targets) || {})
        }
      }),
      mana: Object.prototype.hasOwnProperty.call(patch, 'mana') ? patch.mana : source.mana
    };
  }

  function setState(patch = {}, options = {}) {
    const nextPatch = normalizeStatePatch(patch, options);
    let nextState = mergeStatePatch(currentState, nextPatch);
    const focusSummary = calculateFocusSummary(nextState);
    if (focusSummary.used > focusSummary.budget && options.allowOverBudget !== true) {
      flashBudgetBlocked();
      if (options.emit !== false && typeof global.CustomEvent === 'function' && typeof global.dispatchEvent === 'function') {
        global.dispatchEvent(new CustomEvent('ace-mahjong:luck-panel-reject', {
          detail: {
            reason: 'focus-budget-exceeded',
            attempted: clone(nextPatch),
            focus: focusSummary
          }
        }));
      }
      return getState();
    }
    if (focusSummary.used > focusSummary.budget) {
      nextState = clampStateToFocusBudget(nextState);
    }
    currentState = nextState;
    render();
    persistState();
    if (options.emit !== false) {
      emitChange(options.reason || 'set-state');
    }
    return getState();
  }

  function getState() {
    return clone({
      ...currentState,
      focus: calculateFocusSummary(),
      windState: getWindState(),
      forceState: getForceState()
    });
  }

  function handleEnabledClick(event) {
    const button = event.currentTarget;
    setState({ systemMode: button.dataset.systemMode || 'auto' }, { reason: 'system-mode-change', layer: getActiveLayer() });
  }

  function handleLayerClick(event) {
    const button = event.currentTarget;
    setState({ activeLayer: button.dataset.layer || 'fortune' }, { reason: 'layer-change' });
  }

  function handleLayerTitleClick() {
    setState({ activeLayer: getActiveLayer() === 'curse' ? 'fortune' : 'curse' }, { reason: 'layer-toggle' });
  }

  function handleModeClick(event) {
    const button = event.currentTarget;
    setState({ mode: button.dataset.mode || 'speed', systemMode: 'on' }, { reason: 'mode-change', layer: 'fortune' });
  }

  function handleCommitRouteClick(event) {
    const button = event.target && event.target.closest
      ? event.target.closest('.luck-commit-route-btn')
      : null;
    if (!button || button.disabled) return;
    setState({
      mode: 'commit',
      systemMode: 'on',
      commitRouteId: button.dataset.commitRouteId || 'auto'
    }, { reason: 'commit-route-change', layer: 'fortune' });
  }

  function handleTargetClick(event) {
    const button = event.currentTarget;
    setState({ selectedTargetSeat: button.dataset.targetSeat || 'top' }, { reason: 'curse-target-change', layer: 'curse' });
  }

  function handleIntensityClick(event) {
    const button = event.currentTarget;
    const layer = getActiveLayer();
    const layerState = getLayerState(layer);
    const selectedTarget = layer === 'curse'
      ? getCurseTargetState(getSelectedCurseTargetSeat(layerState), layerState)
      : null;
    const systemMode = layer === 'curse'
      ? (selectedTarget.systemMode === 'off' ? 'on' : selectedTarget.systemMode)
      : (layerState.systemMode === 'off' ? 'on' : layerState.systemMode);
    setState({
      intensity: button.dataset.intensity || 'medium',
      systemMode
    }, { reason: 'intensity-change', layer });
  }

  function bindIntentHitboxes() {
    const hits = queryAll('.luck-sub-hit');
    hits.forEach((hit) => {
      hit.addEventListener('mouseenter', () => {
        if (!intentGhostEl || !intentSolidEl) return;
        const activeLayer = getActiveLayer();
        const layerState = getLayerState(activeLayer);
        const selectedTarget = activeLayer === 'curse'
          ? getCurseTargetState(getSelectedCurseTargetSeat(layerState), layerState)
          : null;
        const hoverIntensity = hit.dataset.intensity || 'medium';
        const previewPatch = activeLayer === 'curse'
          ? {
              curse: {
                selectedTargetSeat: getSelectedCurseTargetSeat(layerState),
                targets: {
                  [getSelectedCurseTargetSeat(layerState)]: {
                    ...selectedTarget,
                    systemMode: selectedTarget.systemMode === 'off' ? 'on' : selectedTarget.systemMode,
                    intensity: hoverIntensity
                  }
                }
              }
            }
          : {
              fortune: {
                ...layerState,
                systemMode: layerState.systemMode === 'off' ? 'on' : layerState.systemMode,
                intensity: hoverIntensity
              }
            };
        const previewState = mergeStatePatch(currentState, normalizeStatePatch(previewPatch));
        const currentFocus = calculateFocusSummary(currentState);
        const previewFocus = calculateFocusSummary(previewState);
        const safeBudget = Math.max(1, currentFocus.budget || FOCUS_BUDGET);
        const currentHeight = Math.max(0, Math.min(100, (currentFocus.used / safeBudget) * 100));
        const hoverHeight = Math.max(0, Math.min(100, (previewFocus.used / safeBudget) * 100));
        intentSolidEl.style.height = `${Math.min(currentHeight, hoverHeight)}%`;
        intentGhostEl.style.height = `${Math.max(currentHeight, hoverHeight)}%`;
        panelEl.classList.toggle('is-budget-preview-blocked', previewFocus.used > previewFocus.budget);
      });
      hit.addEventListener('click', handleIntensityClick);
    });

    const hitArea = panelEl ? panelEl.querySelector('#luck-intent-hitboxes') : null;
    if (hitArea) {
      hitArea.addEventListener('mouseleave', () => {
        const layerState = getLayerState(getActiveLayer());
        const focusSummary = calculateFocusSummary();
        renderFocusMeter(focusSummary);
        if (panelEl) panelEl.classList.remove('is-budget-preview-blocked');
        if (intentGhostEl) {
          intentGhostEl.style.height = '0%';
        }
      });
    }
  }

  function bindControls() {
    if (layerTitleEl) {
      layerTitleEl.addEventListener('click', handleLayerTitleClick);
    }
    queryAll('.luck-layer-btn').forEach((button) => button.addEventListener('click', handleLayerClick));
    queryAll('.luck-opt-txt').forEach((button) => button.addEventListener('click', handleEnabledClick));
    queryAll('.luck-wind-btn').forEach((button) => button.addEventListener('click', handleModeClick));
    queryAll('.luck-curse-target-btn').forEach((button) => button.addEventListener('click', handleTargetClick));
    queryAll('.luck-intensity-btn').forEach((button) => button.addEventListener('click', handleIntensityClick));
    if (commitRouteGridEl) {
      commitRouteGridEl.addEventListener('click', handleCommitRouteClick);
    }
    bindIntentHitboxes();
  }

  function bindRuntimeRefresh() {
    if (unsubscribeRuntimeRefresh) return;
    const runtimeApi = global.AceZeroMahjongUI && global.AceZeroMahjongUI.runtime
      ? global.AceZeroMahjongUI.runtime
      : null;
    const runtime = getRuntime();
    if (!runtime || typeof runtime.getLuckManaState !== 'function') {
      runtimeRefreshBindAttempts += 1;
      if (runtimeRefreshBindAttempts <= 30 && typeof global.setTimeout === 'function') {
        global.setTimeout(bindRuntimeRefresh, 500);
      }
      return;
    }
    if (typeof runtimeApi.subscribe === 'function') {
      unsubscribeRuntimeRefresh = runtimeApi.subscribe(() => {
        if (!panelEl) return;
        syncManaFromRuntime({ emit: false });
        const fortuneState = getLayerState('fortune');
        if (fortuneState.mode === 'commit') {
          render();
          if (!runtimeLuckSyncing) {
            trySyncRuntimeLuckState();
          }
        }
      });
      syncManaFromRuntime({ emit: false });
      return;
    }
    runtimeRefreshBindAttempts += 1;
    if (runtimeRefreshBindAttempts <= 30 && typeof global.setTimeout === 'function') {
      global.setTimeout(bindRuntimeRefresh, 500);
    }
  }

  function mount() {
    if (mounted) return getState();
    if (global.document && global.document.getElementById(PANEL_ID)) {
      panelEl = global.document.getElementById(PANEL_ID);
    } else if (global.document && global.document.body) {
      const template = global.document.createElement('template');
      template.innerHTML = PANEL_HTML.trim();
      panelEl = template.content.firstElementChild;
      global.document.body.insertBefore(panelEl, global.document.body.firstChild);
    }

    if (!panelEl) return getState();

    manaEnergyEl = panelEl.querySelector('#luck-mana-energy');
    manaDigitEl = panelEl.querySelector('#luck-mana-digit');
    intentGhostEl = panelEl.querySelector('#luck-intent-ghost');
    intentSolidEl = panelEl.querySelector('#luck-intent-solid');
    focusPipsEl = panelEl.querySelector('#luck-focus-pips');
    layerTitleEl = panelEl.querySelector('#luck-layer-title');
    modeSectionKickerEl = panelEl.querySelector('#luck-mode-section-kicker');
    commitRouteBoxEl = panelEl.querySelector('#luck-commit-route-box');
    commitRouteGridEl = panelEl.querySelector('#luck-commit-route-grid');
    currentState = clampStateToFocusBudget(mergeStatePatch(clone(DEFAULT_STATE), normalizeStatePatch(readStoredState())));
    bindControls();
    if (typeof global.setTimeout === 'function') {
      global.setTimeout(bindRuntimeRefresh, 0);
    }
    mounted = true;
    syncManaFromRuntime({ emit: false });
    render();
    persistState();
    emitChange('mount');
    return getState();
  }

  const api = {
    mount,
    getState,
    setState,
    setMana(value) {
      return setState({ mana: value }, { reason: 'mana-change' });
    },
    getWindState() {
      return clone(getWindState());
    },
    getForceState() {
      return clone(getForceState());
    },
    refreshMana() {
      return syncManaFromRuntime({ emit: false });
    }
  };

  global.AceMahjongLuckPanel = api;

  if (global.document && global.document.readyState === 'loading') {
    global.document.addEventListener('DOMContentLoaded', () => mount(), { once: true });
  } else {
    mount();
  }
})(typeof window !== 'undefined' ? window : globalThis);
