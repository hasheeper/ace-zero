const domTitle = document.getElementById('log-title');
const domStatus = document.getElementById('log-status');
const domDesc = document.getElementById('log-desc');
const domMeta = document.getElementById('log-meta');
const logBox = document.getElementById('log-box');
const statusBlock = document.getElementById('status-block');
const cmdGrid = document.getElementById('cmd-grid');
const deckTitle = document.getElementById('deck-title');
const visualStage = document.querySelector('.visual-stage');
const terminalPanel = document.querySelector('.terminal-panel');
const mobileSpacer = document.querySelector('.mobile-spacer');
const detailsGroup = document.getElementById('details-group');
const headerBlock = document.querySelector('.header-block');
const terminalBg = document.querySelector('.terminal-bg');
const metaBox = document.getElementById('meta-box');
const rosterTrack = document.getElementById('roster-track');
const btnLeft = document.getElementById('nav-btn-left');
const btnRight = document.getElementById('nav-btn-right');
const pageOverview = document.getElementById('dashboard-page-overview');
const pageDossier = document.getElementById('dashboard-page-dossier');
const pageExpansion = document.getElementById('dashboard-page-expansion');
const pageBtnOverview = document.getElementById('page-btn-overview');
const pageBtnDossier = document.getElementById('page-btn-dossier');
const pageBtnExpansion = document.getElementById('page-btn-expansion');
const kazuWatermark = document.getElementById('kazu-watermark');
const kazuTerminalPanel = document.getElementById('kazu-terminal-panel');
const kazuLedgerPanel = document.getElementById('kazu-ledger-panel');
const dashboardBridge = window.ACE0DashboardBridge || {};
const dossierPageApi = window.ACE0DashboardDossierPage || {};
const expansionPageApi = window.ACE0DashboardExpansionPage || {};
const dashboardUtils = window.ACE0DashboardUtils || {};
const normalizeMetricDefaults = dashboardUtils.normalizeMetricDefaults || function normalizeMetricDefaultsFallback(metric) {
  if (!metric || typeof metric !== 'object') return {};
  const normalized = { ...metric };
  normalized.score = normalized.score != null ? normalized.score : normalized.value;
  delete normalized.value;
  return normalized;
};
const getMetricScore = dashboardUtils.getMetricScore || function getMetricScoreFallback(metric, fallback = 0) {
  if (!metric || typeof metric !== 'object') return clampPercent(fallback);
  return clampPercent(metric.score != null ? metric.score : metric.value);
};
const normalizeDashboardString = dashboardUtils.normalizeDashboardString || function normalizeDashboardStringFallback(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
};
const escapeDashboardHtml = dashboardUtils.escapeDashboardHtml || function escapeDashboardHtmlFallback(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};
const clampPercent = dashboardUtils.clampPercent || function clampPercentFallback(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
};
const formatTime = dashboardUtils.formatTime || function formatTimeFallback(totalSeconds) {
  if (Number.isNaN(totalSeconds) || totalSeconds < 0 || !Number.isFinite(totalSeconds)) return '00:00';
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = Math.floor(totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
};

const bgmLibrary = {
  general: [],
  exclusive: {
    cota: { name: 'COTA · EXCLUSIVE', url: 'https://files.catbox.moe/78bs6x.mp3' },
    eulalia: { name: 'EULALIA · EXCLUSIVE', url: 'https://files.catbox.moe/9amsja.mp3' },
    kako: { name: 'KAKO · EXCLUSIVE', url: 'https://files.catbox.moe/9y713d.mp3' },
    kuzuha: { name: 'KUZUHA · EXCLUSIVE', url: 'https://files.catbox.moe/kcdhpv.mp3' },
    poppy: { name: 'POPPY · EXCLUSIVE', url: 'https://files.catbox.moe/w80b4m.mp3' },
    rino: { name: 'RINO · EXCLUSIVE', url: 'https://files.catbox.moe/o9l9we.mp3' },
    sia: { name: 'SIA · EXCLUSIVE', url: 'https://files.catbox.moe/9oy3wt.mp3' },
    trixie: { name: 'TRIXIE · EXCLUSIVE', url: 'https://files.catbox.moe/8qakdi.mp3' },
    vv: { name: 'VEBLEN · EXCLUSIVE', url: 'https://files.catbox.moe/79xh1n.mp3' },
    veblen: { name: 'VEBLEN · EXCLUSIVE', url: 'https://files.catbox.moe/79xh1n.mp3' }
  }
};

const characters = window.dashboardCharacters || {};
const svgLibrary = window.svgLibrary || {};
const DASHBOARD_KEY_ALIASES = {
  veblen: 'vv'
};
const rosterOrder = ['kazu', 'rino', 'sia', 'poppy', 'vv', 'trixie', 'eulalia', 'kako', 'cota', 'kuzuha'];
const rosterCharacters = rosterOrder.map((key) => characters[key]).filter(Boolean);

let currentCharacterKey = normalizeDashboardKey(window.activeDashboardCharacter) || 'rino';
if (!characters[currentCharacterKey]) {
  currentCharacterKey = rosterCharacters[0]?.key || Object.keys(characters)[0] || 'rino';
}

const bgmUI = {
  widget: document.getElementById('bgm-widget'),
  bubble: document.getElementById('bgm-bubble'),
  disc: document.getElementById('bgm-disc'),
  panel: document.getElementById('bgm-panel'),
  statusDot: document.getElementById('bgm-status-dot'),
  autoToggle: document.getElementById('bgm-auto-toggle'),
  playerBox: document.getElementById('bgm-player'),
  trackList: document.getElementById('bgm-track-list'),
  npText: document.getElementById('bgm-np-text'),
  visualizer: document.getElementById('bgm-visualizer'),
  playBtn: document.getElementById('bgm-btn-playpause'),
  iconPlay: document.getElementById('icon-play'),
  iconPause: document.getElementById('icon-pause'),
  progress: document.getElementById('bgm-progress'),
  timeCur: document.getElementById('time-current'),
  timeTot: document.getElementById('time-total')
};

function getStoredBgmAutoExclusive() {
  try {
    return window.localStorage.getItem('dashboard-bgm-auto-exclusive') === '1';
  } catch (error) {
    return false;
  }
}

const BGM_TARGET_VOLUME = 0.82;
const BGM_FADE_DURATION = 320;

const bgmState = {
  audio: new Audio(),
  currentTrackId: null,
  currentTrackName: '',
  isPlaying: false,
  isDragging: false,
  activeCharKey: currentCharacterKey,
  memoryByCharacter: {},
  pendingSeekTime: 0,
  autoExclusiveEnabled: getStoredBgmAutoExclusive(),
  transitionToken: 0,
  fadeTimer: null,
  targetVolume: BGM_TARGET_VOLUME
};

bgmState.audio.loop = true;
bgmState.audio.preload = 'auto';
bgmState.audio.volume = bgmState.targetVolume;
const SHEET_BREAKPOINT = 1100;
let lockedLogId = null;
let cmdCards = [];
let logData = {};
let kazuOverviewCards = [];
let kazuOverviewLogData = {};
let rosterItems = [];
let ignoreRosterScroll = false;
let rosterScrollReleaseTimer = null;
let currentDashboardPage = 'overview';
let dashboardExtensions = typeof expansionPageApi.getBuiltinTabs === 'function'
  ? expansionPageApi.getBuiltinTabs()
  : [];

const DASHBOARD_MESSAGE_TYPES = dashboardBridge.MESSAGE_TYPES || {
  init: 'ACE0_DASHBOARD_INIT',
  refresh: 'ACE0_DASHBOARD_REFRESH',
  ready: 'ACE0_DASHBOARD_READY',
  request: 'ACE0_DASHBOARD_REQUEST_DATA',
  actCommit: 'ACE0_DASHBOARD_ACT_COMMIT',
  actCommitResult: 'ACE0_DASHBOARD_ACT_COMMIT_RESULT'
};

const HERO_CODE_TO_DASHBOARD_KEY = {
  KAZU: 'kazu',
  RINO: 'rino',
  SIA: 'sia',
  POPPY: 'poppy',
  VV: 'vv',
  TRIXIE: 'trixie',
  COTA: 'cota',
  EULALIA: 'eulalia',
  KAKO: 'kako',
  KUZUHA: 'kuzuha'
};

const DASHBOARD_KEY_TO_HERO_CODE = Object.entries(HERO_CODE_TO_DASHBOARD_KEY).reduce((result, [heroCode, dashboardKey]) => {
  result[dashboardKey] = heroCode;
  return result;
}, {});

const DASHBOARD_DEFAULT_STATE = Object.keys(characters).reduce((result, key) => {
  const character = characters[key] || {};
  result[key] = {
    dashboardState: { ...(character.dashboardState || {}) },
    level: character.level ?? 0,
    resource: { ...(character.variables?.resource || {}) },
    common: normalizeMetricDefaults(character.variables?.common),
    exclusive: normalizeMetricDefaults(character.variables?.exclusive)
  };
  return result;
}, {});

const dashboardOverviewConfig = {
  kazu: {
    watermark: 'NULL',
    subtitle: 'THE VOID GUARDIAN',
    suit: '♣',
    attribute: 'VOID · PSYCHE',
    name: 'KAZU',
    ident: 'KAZU',
    manaPool: 'N/A',
    debt: '- 395,000,000',
    debtUnit: 'FL',
    debtTitle: 'DEBT',
    debtLock: '[ OVERFLOW ]',
    assets: {
      gold: { label: 'GOLD FLORINS', cn: '金弗', value: '14', unit: 'G' },
      silver: { label: 'DECIMAL', cn: '小数', value: '.02', unit: '' }
    },
    cards: [
      {
        id: 'kazu-card-1',
        accent: 'void',
        type: 'MAIN TRAIT · VOID',
        name: '零号体质',
        svgId: 'kazu-card-1',
        title: '特质 · 零号体质',
        desc: '幸运效果 -20%。每街首次受到 hostile Curse 或作用于自身的 fortune 时，抹除该力量 30%，并将被抹除力量值的 20% 转为 mana（直接进位）。',
        meta: '[ 主手特质 / Lv.2 ]'
      },
      {
        id: 'kazu-card-2',
        accent: 'void',
        type: 'SUB TRAIT · SUPPORT',
        name: '不动心',
        svgId: 'kazu-card-2',
        title: '特质 · 不动心',
        desc: '被动 mana 回复 +4/回合，前台角色受 curse 伤害 -15%，自身幸运效果 -15%。退到后台时提供更稳定的魔力支援与保守控盘。',
        meta: '[ 副手特质 / Lv.3 ]'
      },
      {
        id: 'kazu-card-3',
        accent: 'danger',
        type: 'T0 · VOID · OVERRIDE',
        name: '现实',
        svgId: 'kazu-card-3',
        title: '技能 · 现实',
        desc: '清除所有非 Void 效果，让局面回归纯随机。KAZU 的强制归零手段，整局限 1 次。',
        meta: '[ T0 / 主动 / 整局限1次 ]'
      },
      {
        id: 'kazu-card-4',
        accent: 'void',
        type: 'T0 · VOID · TOGGLE',
        name: '绝缘',
        svgId: 'kazu-card-4',
        title: '技能 · 绝缘',
        desc: '不对称抑制命运场：我方 fortune -15% / curse -35%，敌方 fortune -35% / curse -15%。更偏保护与控场，不再是粗暴的全场腰斩。',
        meta: '[ T0 / 开关 / MANA 0 ]'
      }
    ],
    log: {
      title: 'SYSTEM IDLE',
      desc: 'AWAITING DIRECTIVE...',
      note: '[ Hover or Tap protocol to decrypt. ]'
    }
  },
  nodes: [
    { key: 'rino', primary: true, ...(characters.rino?.dashboardState || {}) },
    { key: 'kuzuha', exclusiveLabel: 'Debtbind', exclusiveChinese: '债缚度', ...(characters.kuzuha?.dashboardState || {}) },
    { key: 'poppy', exclusiveLabel: 'Nesting', exclusiveChinese: '寄生度', ...(characters.poppy?.dashboardState || {}) },
    { key: 'sia', exclusiveLabel: 'Custody', exclusiveChinese: '接管度', ...(characters.sia?.dashboardState || {}) },
    { key: 'vv', displayName: 'VEBLEN', exclusiveLabel: 'Majority Stake', exclusiveChinese: '控股度', ...(characters.vv?.dashboardState || {}) },
    { key: 'trixie', exclusiveLabel: 'Mania', exclusiveChinese: '妄执度', ...(characters.trixie?.dashboardState || {}) },
    { key: 'kako', exclusiveLabel: 'Complicity', exclusiveChinese: '包庇度', ...(characters.kako?.dashboardState || {}) },
    { key: 'eulalia', exclusiveLabel: 'Entrust', exclusiveChinese: '寄托度', ...(characters.eulalia?.dashboardState || {}) },
    { key: 'cota', exclusiveLabel: 'Retention', exclusiveChinese: '留存度', ...(characters.cota?.dashboardState || {}) }
  ]
};

function normalizeDashboardKey(key) {
  const normalized = String(key || '').trim().toLowerCase();
  return DASHBOARD_KEY_ALIASES[normalized] || normalized;
}

function isHeroMacroToken(value) {
  return value === '{{user}}' || value === '<user>';
}

function resolveDashboardHeroDisplayName(hero) {
  const aliasName = normalizeDashboardString(hero?.aliases?.KAZU, '');
  if (aliasName && !isHeroMacroToken(aliasName)) return aliasName;
  const explicit = normalizeDashboardString(hero?.heroDisplayName, '');
  return explicit || 'KAZU';
}

function replaceDashboardHeroLabel(text, hero) {
  if (typeof text !== 'string' || !text) return text;
  const heroDisplayName = resolveDashboardHeroDisplayName(hero);
  return text
    .replace(/\bKAZU\b/g, heroDisplayName)
    .replace(/\bKazu\b/g, heroDisplayName)
    .replace(/\bkazu\b/g, heroDisplayName);
}

function getDashboardKeyFromHeroCode(heroCode) {
  return HERO_CODE_TO_DASHBOARD_KEY[String(heroCode || '').trim().toUpperCase()] || null;
}

function getHeroCodeFromDashboardKey(dashboardKey) {
  return DASHBOARD_KEY_TO_HERO_CODE[normalizeDashboardKey(dashboardKey)] || null;
}

function cloneCharacterDefaults(characterKey) {
  const snapshot = DASHBOARD_DEFAULT_STATE[normalizeDashboardKey(characterKey)] || {};
  return {
    dashboardState: { ...(snapshot.dashboardState || {}) },
    level: snapshot.level ?? 0,
    resource: { ...(snapshot.resource || {}) },
    common: normalizeMetricDefaults(snapshot.common),
    exclusive: normalizeMetricDefaults(snapshot.exclusive)
  };
}

function syncOverviewNodesFromCharacters() {
  (dashboardOverviewConfig.nodes || []).forEach((node) => {
    const state = characters[normalizeDashboardKey(node.key)]?.dashboardState || {};
    node.introduced = state.introduced === true;
    node.present = state.present === true;
    node.inParty = state.inParty === true;
    node.miniKnown = state.miniKnown === true;
  });
}

function formatFundsSegments(funds) {
  const numericFunds = Number(funds);
  const safeFunds = Number.isFinite(numericFunds) ? Math.max(0, Math.round(numericFunds * 100) / 100) : 0;
  const fixedFunds = safeFunds.toFixed(2);
  const [whole = '0', fraction = '00'] = fixedFunds.split('.');
  return {
    gold: Number(whole).toLocaleString(),
    silver: `.${fraction}`
  };
}

function updateKazuOverviewFromHero(hero) {
  const funds = formatFundsSegments(hero?.funds);
  const heroDisplayName = resolveDashboardHeroDisplayName(hero);
  const kazuRoster = hero?.roster?.KAZU || {};
  const manaCur = Math.max(0, Math.round(Number(kazuRoster.mana) || 0));
  const manaMax = Math.max(0, Math.round(Number(kazuRoster.maxMana) || 0));
  const kazuLevel = Math.max(0, Math.round(Number(kazuRoster.level) || 0));

  // Legacy overview config (kept for any residual references)
  if (dashboardOverviewConfig?.kazu) {
    dashboardOverviewConfig.kazu.assets.gold.value = funds.gold;
    dashboardOverviewConfig.kazu.assets.silver.value = funds.silver;
    dashboardOverviewConfig.kazu.name = heroDisplayName;
    dashboardOverviewConfig.kazu.ident = `${heroDisplayName} LV.${kazuLevel}`;
    dashboardOverviewConfig.kazu.manaPool = `${manaCur} / ${manaMax}`;
  }

  // Live dossier character (kazu in shared/characters.js) — this is what Dossier page 2 renders
  const kazuChar = characters.kazu;
  if (kazuChar) {
    kazuChar.name = heroDisplayName || 'KAZU';
    kazuChar.watermark = (heroDisplayName || 'NULL').toUpperCase();
    kazuChar.level = kazuLevel;
    if (!kazuChar.heroBlock) kazuChar.heroBlock = {};
    kazuChar.heroBlock.identValue = heroDisplayName || 'KAZU';
    kazuChar.heroBlock.manaValue = `${manaCur} / ${manaMax}`;
    if (!kazuChar.heroBlock.assets) kazuChar.heroBlock.assets = {};
    if (!kazuChar.heroBlock.assets.gold) kazuChar.heroBlock.assets.gold = {};
    if (!kazuChar.heroBlock.assets.silver) kazuChar.heroBlock.assets.silver = {};
    kazuChar.heroBlock.assets.gold.value = funds.gold;
    kazuChar.heroBlock.assets.silver.value = funds.silver;
  }
}

function getEncounterDashboardStateFromWorld(world, heroCode) {
  const act = world?.act && typeof world.act === 'object' ? world.act : null;
  const encounter = act?.characterEncounter && typeof act.characterEncounter === 'object'
    ? act.characterEncounter
    : null;
  const encounterChar = encounter?.characters?.[heroCode];
  if (!encounterChar || typeof encounterChar !== 'object') return null;

  const routeHistory = Array.isArray(act.route_history) ? act.route_history : [];
  const nodeIndex = Math.max(1, Math.round(Number(act.nodeIndex) || 1));
  const currentNodeId = routeHistory[nodeIndex - 1] || routeHistory[routeHistory.length - 1] || '';
  const introducedNodeId = typeof encounterChar.introducedNodeId === 'string' ? encounterChar.introducedNodeId : '';
  const isIntroduced = encounterChar.firstMeetDone === true
    || encounterChar.status === 'introduced'
    || encounterChar.status === 'first_meet'
    || Boolean(act.pendingFirstMeet?.[heroCode]);
  if (!isIntroduced) return null;

  return {
    activated: true,
    introduced: true,
    present: encounterChar.status === 'first_meet'
      || Boolean(act.pendingFirstMeet?.[heroCode])
      || (introducedNodeId && introducedNodeId === currentNodeId),
    inParty: false,
    miniKnown: false
  };
}

function applyMvuHero(hero, world = null) {
  if (!hero || typeof hero !== 'object') return;

  updateKazuOverviewFromHero(hero);

  Object.entries(characters).forEach(([dashboardKey, character]) => {
    const heroCode = getHeroCodeFromDashboardKey(dashboardKey);
    const defaults = cloneCharacterDefaults(dashboardKey);
    const castNode = heroCode ? (hero?.cast?.[heroCode] || null) : null;
    const rosterNode = heroCode ? (hero?.roster?.[heroCode] || null) : null;
    const relationNode = heroCode ? (hero?.relationship?.[heroCode] || null) : null;
    const encounterState = heroCode ? getEncounterDashboardStateFromWorld(world, heroCode) : null;

    character.dashboardState = {
      ...defaults.dashboardState,
      ...(castNode && typeof castNode === 'object' ? {
        activated: true,
        introduced: castNode.introduced === true,
        present: castNode.present === true,
        inParty: castNode.inParty === true,
        miniKnown: castNode.miniKnown === true
      } : {}),
      ...(encounterState || {})
    };

    character.level = rosterNode?.level != null ? Math.max(0, Math.round(Number(rosterNode.level) || 0)) : defaults.level;

    if (!character.variables) character.variables = {};
    character.variables.resource = {
      ...defaults.resource,
      label: 'MANA',
      current: rosterNode?.mana != null ? Math.max(0, Math.round(Number(rosterNode.mana) || 0)) : (defaults.resource.current ?? 0),
      max: rosterNode?.maxMana != null ? Math.max(0, Math.round(Number(rosterNode.maxMana) || 0)) : (defaults.resource.max ?? 0)
    };

    character.variables.common = {
      ...defaults.common,
      score: relationNode?.entanglement != null ? clampPercent(relationNode.entanglement) : clampPercent(defaults.common.score)
    };

    character.variables.exclusive = {
      ...defaults.exclusive,
      score: relationNode?.exclusive != null ? clampPercent(relationNode.exclusive) : clampPercent(defaults.exclusive.score)
    };
  });

  syncOverviewNodesFromCharacters();
  renderOverviewPage();
  bindOverviewJumpNodes();
  renderRosterDock();
  try { window.__acezeroHomeRefreshIntel?.(); } catch (_) {}

  const fallbackKey = Object.keys(characters).find((key) => !checkIsUnintroduced(key)) || 'rino';
  const nextKey = characters[currentCharacterKey] ? currentCharacterKey : fallbackKey;
  activateCharacter(nextKey, { centerDock: true, dockBehavior: 'auto' });
}

function extractHeroFromPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (payload.hero && typeof payload.hero === 'object') return payload.hero;
  if (payload.stat_data?.hero && typeof payload.stat_data.hero === 'object') return payload.stat_data.hero;
  if (payload.data?.hero && typeof payload.data.hero === 'object') return payload.data.hero;
  if (payload.data?.stat_data?.hero && typeof payload.data.stat_data.hero === 'object') return payload.data.stat_data.hero;
  return null;
}

function extractWorldFromPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (payload.world && typeof payload.world === 'object') return payload.world;
  if (payload.stat_data?.world && typeof payload.stat_data.world === 'object') return payload.stat_data.world;
  if (payload.data?.world && typeof payload.data.world === 'object') return payload.data.world;
  if (payload.data?.stat_data?.world && typeof payload.data.stat_data.world === 'object') return payload.data.stat_data.world;
  return null;
}

function postExpansionFrameData(messageType = 'ACE0_ACT_REFRESH') {
  if (typeof expansionPageApi.postFrameData === 'function') {
    return expansionPageApi.postFrameData(messageType);
  }
  return false;
}

function postExpansionFrameMessage(messageType, payload) {
  if (typeof expansionPageApi.postFrameMessage === 'function') {
    return expansionPageApi.postFrameMessage(messageType, payload);
  }
  return false;
}

function attachExpansionFrameActCommitBridge() {
  if (typeof expansionPageApi.attachActCommitBridge === 'function') {
    return expansionPageApi.attachActCommitBridge();
  }
  return false;
}

function handleHostPayloadMessage({ messageType, hostPayload }) {
  if (typeof expansionPageApi.setHostPayload === 'function') {
    expansionPageApi.setHostPayload(hostPayload);
  }
  const hero = extractHeroFromPayload(hostPayload);
  const world = extractWorldFromPayload(hostPayload);
  if (hero) applyMvuHero(hero, world);
  dashboardExtensions = typeof expansionPageApi.extractExtensionsFromPayload === 'function'
    ? expansionPageApi.extractExtensionsFromPayload(hostPayload)
    : dashboardExtensions;
  renderExpansionPage();
  attachExpansionFrameActCommitBridge();
  postExpansionFrameData(messageType === DASHBOARD_MESSAGE_TYPES.init ? 'ACE0_ACT_INIT' : 'ACE0_ACT_REFRESH');
}

function renderExpansionPage() {
  if (typeof expansionPageApi.renderPage === 'function') {
    dashboardExtensions = expansionPageApi.renderPage() || dashboardExtensions;
  }
}

const handleDashboardHostMessage = typeof dashboardBridge.createDashboardHostMessageHandler === 'function'
  ? dashboardBridge.createDashboardHostMessageHandler({
      getFrame: () => (typeof expansionPageApi.getFrame === 'function' ? expansionPageApi.getFrame() : null),
      onHostPayload: handleHostPayloadMessage
    })
  : function noopDashboardHostMessage() {};

function notifyDashboardReady() {
  if (typeof dashboardBridge.notifyDashboardReady === 'function') {
    dashboardBridge.notifyDashboardReady();
  }
}

function isSheetLayout() {
  return window.innerWidth <= SHEET_BREAKPOINT;
}

function resolveOverviewStatus(nodeConfig = {}) {
  const normalizedStatus = String(nodeConfig.status || '').trim().toLowerCase();
  const hasStructuredState = ['introduced', 'present', 'inParty', 'miniKnown'].some((key) => typeof nodeConfig[key] === 'boolean');

  let introduced = nodeConfig.introduced;
  let present = nodeConfig.present;
  let inParty = nodeConfig.inParty;
  let miniKnown = nodeConfig.miniKnown;

  if (!hasStructuredState && normalizedStatus) {
    if (normalizedStatus === 'party' || normalizedStatus === 'in_party' || normalizedStatus === 'in-party') {
      introduced = true;
      present = true;
      inParty = true;
    } else if (normalizedStatus === 'present' || normalizedStatus === 'onsite' || normalizedStatus === 'onstage') {
      introduced = true;
      present = true;
      inParty = false;
    } else if (normalizedStatus === 'offstage' || normalizedStatus === 'introduced' || normalizedStatus === 'introduced_offstage') {
      introduced = true;
      present = false;
      inParty = false;
    } else if (normalizedStatus === 'unintroduced' || normalizedStatus === 'not_introduced' || normalizedStatus === 'not-introduced') {
      introduced = false;
      present = false;
      inParty = false;
    }
  }

  if (miniKnown === true) {
    return { text: 'UNKNOWN', tone: 'unintroduced' };
  }

  if (introduced === true && present === true && inParty === true) {
    return { text: 'IN PARTY', tone: 'party' };
  }

  if (introduced === true && present === true) {
    return { text: 'PRESENT', tone: 'present' };
  }

  if (introduced === true && present === false) {
    return { text: 'OFFSTAGE', tone: 'offstage' };
  }

  if (introduced === false) {
    return { text: 'NOT INTRODUCED', tone: 'unintroduced' };
  }

  if (nodeConfig.statusText) {
    return { text: String(nodeConfig.statusText), tone: String(nodeConfig.statusTone || '').trim().toLowerCase() || 'custom' };
  }

  return { text: 'PRESENT', tone: 'present' };
}

function getOverviewNodeConfig(characterKey) {
  const normalizedKey = normalizeDashboardKey(characterKey);
  return dashboardOverviewConfig.nodes.find((node) => normalizeDashboardKey(node.key) === normalizedKey) || {};
}

function getCharacterDashboardStatus(characterKey) {
  return resolveOverviewStatus(getOverviewNodeConfig(characterKey));
}

function checkIsUnintroduced(characterKey) {
  return getCharacterDashboardStatus(characterKey).tone === 'unintroduced';
}

function isCharacterBgmUnlocked(characterKey) {
  return getCharacterDashboardStatus(characterKey).tone !== 'unintroduced';
}

function getMaskedExclusiveTrackName(characterKey) {
  return isCharacterBgmUnlocked(characterKey) ? (getExclusiveTrack(characterKey)?.name || 'EXCLUSIVE TRACK') : 'CLASSIFIED SIGNAL';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getCharacterTermCatalog(character) {
  if (!character) return [];
  const catalog = Array.isArray(character.termCatalog) ? character.termCatalog : [];
  const seen = new Set();
  return catalog.filter((entry) => {
    if (!entry || !entry.label) return false;
    const key = `${entry.label}::${entry.tone || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((left, right) => right.label.length - left.label.length);
}

function highlightLoreText(text, character) {
  const source = String(text ?? '');
  const catalog = getCharacterTermCatalog(character);
  if (!catalog.length) {
    return escapeHtml(source).replace(/\n/g, '<br>');
  }

  let output = '';
  let index = 0;

  while (index < source.length) {
    const matched = catalog.find((entry) => source.startsWith(entry.label, index));
    if (matched) {
      output += `<span class="term-chip tone-${escapeHtml(matched.tone || 'exclusive')}">${escapeHtml(matched.label)}</span>`;
      index += matched.label.length;
      continue;
    }

    const char = source[index];
    output += char === '\n' ? '<br>' : escapeHtml(char);
    index += 1;
  }

  return output;
}

function getItemToneColors(item = {}) {
  switch (String(item.accent || '').toLowerCase()) {
    case 'trait':
      return { border: 'var(--semantic-trait)', text: 'var(--semantic-trait)' };
    case 'moirai':
      return { border: 'var(--semantic-fortune)', text: 'var(--semantic-fortune)' };
    case 'chaos':
      return { border: 'var(--semantic-curse)', text: 'var(--semantic-curse)' };
    case 'psyche':
      return { border: 'var(--semantic-mana)', text: 'var(--semantic-mana)' };
    case 'warning':
    case 'danger':
      return { border: 'var(--semantic-warning)', text: 'var(--semantic-warning)' };
    case 'void':
      return { border: 'var(--semantic-void)', text: 'var(--semantic-void)' };
    default:
      return { border: 'var(--semantic-skill)', text: 'var(--semantic-skill)' };
  }
}

function renderStatusRow(metric = {}, value = 0, phaseInfo = { index: 0, phase: { name: '', english: '' } }, options = {}) {
  const rowClass = options.rowClass ? ` ${options.rowClass}` : '';
  const headerClass = options.headerClass ? ` ${options.headerClass}` : '';
  const trackClass = options.segmented === true ? 'track-segmented' : 'track-thin';
  const phase = phaseInfo.phase || { name: '', english: '' };
  const noteHtml = metric.detail ? `<div class="s-note">${escapeHtml(metric.detail)}</div>` : '';
  const trackAccent = options.color || metric.color || '#aaa';
  const primaryLabel = metric.chineseLabel || metric.englishLabel || '状态';
  const labelEnRaw = options.labelEn != null ? options.labelEn : (metric.englishLabel || '');
  const labelEn = String(labelEnRaw || '').trim().toUpperCase();
  const phaseZh = options.phaseLabelZh != null ? options.phaseLabelZh : (phase.name || '');
  const phaseEnRaw = options.phaseLabelEn != null ? options.phaseLabelEn : (phase.english || '');
  const phaseEn = String(phaseEnRaw || '').trim().toUpperCase();

  return `
    <div class="status-row${rowClass}" style="--row-accent: ${trackAccent};">
      <div class="s-header${headerClass}">
        <div class="s-title-group">
          <div class="s-label">${escapeHtml(primaryLabel)}</div>
          ${labelEn && labelEn !== String(primaryLabel).trim().toUpperCase() ? `<div class="label-en">${escapeHtml(labelEn)}</div>` : ''}
          ${phaseZh || phaseEn ? `<div class="title-sep" aria-hidden="true">·</div>` : ''}
          ${phaseZh ? `<div class="phase-zh">${escapeHtml(phaseZh)}</div>` : ''}
          ${phaseEn ? `<div class="phase-en">${escapeHtml(phaseEn)}</div>` : ''}
        </div>
        <div class="s-perc">${value}%</div>
      </div>
      <div class="${trackClass}">
        <div class="fill" style="width: ${value}%; background: ${trackAccent}; box-shadow: 0 0 8px ${trackAccent};"></div>
        ${options.segmented === true
          ? `<div class="grid-cuts"><div></div><div></div><div></div><div></div><div></div></div><div class="indicator-line" style="left: ${value}%;"></div>`
          : `<div class="nodes">${renderNodePoints(value)}</div>`}
      </div>
      ${noteHtml}
    </div>
  `;
}

function renderOverviewStatRow(type, label, chineseLabel, value) {
  const safeValue = clampPercent(value);
  const labelHtml = chineseLabel
    ? `${escapeHtml(label)} <span>(${escapeHtml(chineseLabel)})</span>`
    : escapeHtml(label);
  const trackClass = type === 'exclusive' ? 'kazu-track-exclusive' : 'kazu-track-common';
  const cuts = type === 'exclusive'
    ? '<div class="kazu-grid-cuts"><div></div><div></div><div></div><div></div><div></div></div>'
    : '';

  return `
    <div class="kazu-stat-row ${type}">
      <div class="kazu-stat-info"><span class="kazu-stat-label">${labelHtml}</span><span class="kazu-stat-perc">${safeValue}%</span></div>
      <div class="${trackClass}"><div class="fill" style="width: ${safeValue}%;"></div>${cuts}</div>
    </div>
  `;
}

function getOverviewNodeOrder(nodeConfig) {
  const character = characters[nodeConfig.key];
  const status = resolveOverviewStatus(nodeConfig);
  const commonValue = getMetricScore(character?.variables?.common);
  const exclusiveValue = getMetricScore(character?.variables?.exclusive);
  const total = commonValue + exclusiveValue;
  const rosterIndex = rosterOrder.indexOf(nodeConfig.key);
  const statusWeight = {
    party: 0,
    present: 1,
    offstage: 2,
    unintroduced: 3
  }[status.tone] ?? 4;

  return {
    statusWeight,
    total,
    rosterIndex: rosterIndex === -1 ? Number.MAX_SAFE_INTEGER : rosterIndex
  };
}

function getSortedOverviewNodes() {
  return dashboardOverviewConfig.nodes
    .slice()
    .sort((left, right) => {
      const leftOrder = getOverviewNodeOrder(left);
      const rightOrder = getOverviewNodeOrder(right);
      if (leftOrder.statusWeight !== rightOrder.statusWeight) {
        return leftOrder.statusWeight - rightOrder.statusWeight;
      }
      if (rightOrder.total !== leftOrder.total) {
        return rightOrder.total - leftOrder.total;
      }
      return leftOrder.rosterIndex - rightOrder.rosterIndex;
    });
}

function renderOverviewNode(nodeConfig) {
  const character = characters[nodeConfig.key];
  if (!character) return '';

  const commonValue = getMetricScore(character.variables?.common);
  const exclusiveValue = getMetricScore(character.variables?.exclusive);
  const color = character.theme?.accent || '#888';
  const displayName = nodeConfig.displayName || character.watermark || character.name;
  const overviewStatus = resolveOverviewStatus(nodeConfig);
  const statusText = overviewStatus.text;
  const statusTone = overviewStatus.tone;
  const statusToneClass = overviewStatus.tone ? ` kazu-node-status-${overviewStatus.tone}` : '';
  const nodeToneClass = statusTone ? ` tone-${statusTone}` : '';
  const statusClass = statusText
    ? `kazu-node-status${statusToneClass}${nodeConfig.statusPulse ? ' pulse' : ''}${nodeConfig.dimStatus ? ' kazu-node-status-muted' : ''}`
    : '';
  const statusHtml = statusText
    ? `<span class="${statusClass}">ST: <span>${escapeHtml(statusText)}</span></span>`
    : '';
  const isParty = statusTone === 'party';
  const isUnintroduced = statusTone === 'unintroduced';
  const maskedName = isUnintroduced ? '???' : displayName;
  const avatarToneClass = isUnintroduced ? ' tone-unintroduced' : '';
  const avatarAlt = isUnintroduced ? 'Unknown Character' : character.name;
  const safeCommonValue = isUnintroduced ? 0 : commonValue;
  const safeExclusiveValue = isUnintroduced ? 0 : exclusiveValue;
  const commonLabel = isUnintroduced ? 'UNKNOWN' : (character.variables?.common?.englishLabel || 'ENTANGLEMENT');
  const exclusiveLabel = isUnintroduced ? 'CLASSIFIED' : (nodeConfig.exclusiveLabel || character.variables?.exclusive?.englishLabel || 'EXCLUSIVE');
  const exclusiveChinese = isUnintroduced ? '???' : (nodeConfig.exclusiveChinese || character.variables?.exclusive?.chineseLabel || '');
  const resource = character.variables?.resource || {};
  const levelText = isUnintroduced ? '?' : String(character.level ?? 0);
  const resourceLabel = isUnintroduced ? 'UNKNOWN' : String(resource.label || 'FORTUNE');
  const resourceCurrent = isUnintroduced ? '?' : String(resource.current ?? 0);
  const resourceMax = isUnintroduced ? '?' : String(resource.max ?? 0);

  if (isParty) {
    return `
      <button class="kazu-link-node primary${nodeToneClass}" type="button" style="--c: ${color};" data-jump-character="${character.key}">
        <div class="kazu-node-avatar kazu-node-avatar-primary${avatarToneClass}"><img src="${escapeHtml(character.avatarUrl || character.portraitUrl || '')}" alt="${escapeHtml(avatarAlt)}"></div>
        <div class="kazu-node-info kazu-node-info-primary">
          <span class="kazu-primary-name">${escapeHtml(maskedName)}</span>
          <div class="kazu-primary-meta">
            <span class="kazu-primary-meta-item">LV <span>${escapeHtml(levelText)}</span></span>
            <span class="kazu-primary-meta-divider" aria-hidden="true"></span>
            <span class="kazu-primary-meta-item">${escapeHtml(resourceLabel)} <span>${escapeHtml(resourceCurrent)} / ${escapeHtml(resourceMax)}</span></span>
          </div>
          <span class="kazu-node-status kazu-node-status-pill${statusToneClass}${nodeConfig.statusPulse ? ' pulse' : ''}">ST: <span>${escapeHtml(statusText || 'PRESENT')}</span></span>
        </div>
        <div class="kazu-node-bars kazu-node-bars-primary">
          ${renderOverviewStatRow('common', commonLabel, '', safeCommonValue)}
          ${renderOverviewStatRow('exclusive', exclusiveLabel, exclusiveChinese, safeExclusiveValue)}
        </div>
      </button>
    `;
  }

  return `
    <button class="kazu-link-node${nodeToneClass}" type="button" style="--c: ${color};" data-jump-character="${character.key}">
      <div class="kazu-node-avatar${avatarToneClass}"><img src="${escapeHtml(character.avatarUrl || character.portraitUrl || '')}" alt="${escapeHtml(avatarAlt)}"></div>
      <div class="kazu-node-info">
        <div class="kazu-node-name">${escapeHtml(maskedName)}</div>
        ${statusHtml}
      </div>
      <div class="kazu-node-bars">
        ${renderOverviewStatRow('common', commonLabel, '', safeCommonValue)}
        ${renderOverviewStatRow('exclusive', exclusiveLabel, exclusiveChinese, safeExclusiveValue)}
      </div>
    </button>
  `;
}

function updateKazuOverviewCardState(activeId = '') {
  kazuOverviewCards.forEach((card) => {
    const isActive = card.dataset.kazuLogId === activeId;
    card.classList.toggle('locked', isActive);
  });
}

function resetKazuOverviewLog() {
  const title = document.getElementById('kazu-log-title');
  const desc = document.getElementById('kazu-log-desc');
  const meta = document.getElementById('kazu-log-meta');
  if (!title || !desc) return;

  title.textContent = dashboardOverviewConfig.kazu.log.title;
  desc.textContent = dashboardOverviewConfig.kazu.log.desc;
  if (meta) meta.textContent = dashboardOverviewConfig.kazu.log.note || '';
  updateKazuOverviewCardState('');
}

function showKazuOverviewLog(id) {
  const entry = kazuOverviewLogData[id];
  const title = document.getElementById('kazu-log-title');
  const desc = document.getElementById('kazu-log-desc');
  const meta = document.getElementById('kazu-log-meta');
  if (!entry || !title || !desc) return;

  title.textContent = entry.title;
  desc.innerHTML = escapeHtml(replaceDashboardHeroLabel(entry.desc, { heroDisplayName: dashboardOverviewConfig.kazu.name }));
  if (meta) meta.textContent = replaceDashboardHeroLabel(entry.meta || '', { heroDisplayName: dashboardOverviewConfig.kazu.name });
  updateKazuOverviewCardState(id);
}

function initializeKazuOverviewInteractions() {
  kazuOverviewCards = Array.from(document.querySelectorAll('.kazu-cmd-card[data-kazu-log-id]'));
  kazuOverviewLogData = {};
  dashboardOverviewConfig.kazu.cards.forEach((card) => {
    kazuOverviewLogData[card.id] = {
      title: replaceDashboardHeroLabel(card.title, { heroDisplayName: dashboardOverviewConfig.kazu.name }),
      desc: replaceDashboardHeroLabel(card.desc, { heroDisplayName: dashboardOverviewConfig.kazu.name }),
      meta: replaceDashboardHeroLabel(card.meta, { heroDisplayName: dashboardOverviewConfig.kazu.name })
    };
  });

  kazuOverviewCards.forEach((card) => {
    const id = card.dataset.kazuLogId;
    card.addEventListener('mouseenter', () => showKazuOverviewLog(id));
    card.addEventListener('mouseleave', () => resetKazuOverviewLog());
    card.addEventListener('focus', () => showKazuOverviewLog(id));
    card.addEventListener('blur', () => resetKazuOverviewLog());
    card.addEventListener('click', () => showKazuOverviewLog(id));
  });

  resetKazuOverviewLog();
}

function renderOverviewPage() {
  if (!kazuTerminalPanel || !kazuLedgerPanel) return;

  const kazu = dashboardOverviewConfig.kazu;
  if (kazuWatermark) {
    kazuWatermark.textContent = kazu.watermark;
  }

  kazuTerminalPanel.innerHTML = `
    <div class="kazu-header-block">
      <div class="kazu-name-zone">
        <div class="kazu-sub-name"><span class="kazu-sub-heart">${escapeHtml(kazu.suit)}</span>${escapeHtml(kazu.subtitle)}<span class="kazu-sub-slash">·</span><span class="kazu-sub-attr">${escapeHtml(kazu.attribute)}</span></div>
        <h1>${escapeHtml(kazu.name)}</h1>
      </div>
      <div class="kazu-meta-box">
        <span class="kazu-meta-label">IDENT <span class="kazu-meta-val kazu-meta-val-inline">${escapeHtml(kazu.ident)}</span></span>
        <div class="kazu-meta-divider"></div>
        <div class="kazu-meta-label">MANA_POOL <span class="kazu-meta-val kazu-meta-val-dim">${escapeHtml(kazu.manaPool)}</span></div>
      </div>
    </div>

    <div class="kazu-deck-title kazu-deck-title-tight">GLOBAL_VARIABLE_01</div>
    <div class="kazu-debt-container">
      <div class="kazu-debt-header">${escapeHtml(kazu.debtTitle)}</div>
      <div class="kazu-debt-val-row">
        <h2 class="kazu-debt-number">${escapeHtml(kazu.debt)}</h2>
        <span class="kazu-debt-unit">${escapeHtml(kazu.debtUnit)}</span>
      </div>
      <div class="kazu-debt-lock">${escapeHtml(kazu.debtLock)}</div>
      <div class="kazu-debt-track"><div class="fill"></div><div class="kazu-grid-cuts"><div></div><div></div><div></div><div></div><div></div></div></div>
    </div>

    <div class="kazu-econ-grid">
      <div class="kazu-econ-box gold">
        <div class="kazu-econ-label">${escapeHtml(kazu.assets.gold.label)}<span class="cn">${escapeHtml(kazu.assets.gold.cn)}</span></div>
        <div class="kazu-econ-val">${escapeHtml(kazu.assets.gold.value)}<span class="kazu-econ-unit">${escapeHtml(kazu.assets.gold.unit)}</span></div>
      </div>
      <div class="kazu-econ-box silver">
        <div class="kazu-econ-label">${escapeHtml(kazu.assets.silver.label)}<span class="cn">${escapeHtml(kazu.assets.silver.cn)}</span></div>
        <div class="kazu-econ-val">${escapeHtml(kazu.assets.silver.value)}<span class="kazu-econ-unit">${escapeHtml(kazu.assets.silver.unit)}</span></div>
      </div>
    </div>

    <div class="kazu-deck-title">ACTIVE PROTOCOLS</div>
    <div class="kazu-cmd-grid">
      ${kazu.cards.map((card) => `
        <button class="kazu-cmd-card ${escapeHtml(card.accent)}" type="button" data-kazu-log-id="${card.id}">${card.svgId && svgLibrary[card.svgId] ? `<div class="bg-svg-slot" data-svg-id="${card.svgId}" aria-hidden="true"></div>` : ''}<span class="kazu-cmd-type">${escapeHtml(replaceDashboardHeroLabel(card.type, kazu))}</span><span class="kazu-cmd-name">${escapeHtml(replaceDashboardHeroLabel(card.name, kazu))}</span></button>
      `).join('')}
    </div>

    <div class="kazu-log-panel">
      <div class="kazu-log-title" id="kazu-log-title">${escapeHtml(kazu.log.title)}</div>
      <div class="kazu-log-desc" id="kazu-log-desc">${escapeHtml(kazu.log.desc)}</div>
      <span class="kazu-log-cursor" aria-hidden="true"></span>
      <div class="kazu-log-meta" id="kazu-log-meta">${escapeHtml(kazu.log.note)}</div>
    </div>
  `;

  kazuLedgerPanel.innerHTML = `
    <div class="kazu-deck-title kazu-ledger-title">ANOMALOUS_LINKS</div>
    <div class="kazu-link-grid">
      ${getSortedOverviewNodes().map((node) => renderOverviewNode(node)).join('')}
    </div>
  `;

  kazuTerminalPanel.querySelectorAll('.bg-svg-slot').forEach((slot) => {
    const svgId = slot.dataset.svgId;
    if (svgLibrary[svgId]) slot.innerHTML = svgLibrary[svgId];
  });

  initializeKazuOverviewInteractions();
}

function getPhaseInfo(value, phases = []) {
  const score = clampPercent(value);
  const index = phases.findIndex((phase) => score >= phase.min && score <= phase.max);
  if (index >= 0) {
    return { index, phase: phases[index] };
  }
  const fallbackIndex = phases.length > 0 ? phases.length - 1 : 0;
  return { index: fallbackIndex, phase: phases[fallbackIndex] || { name: '', english: '' } };
}

function getPhase(value, phases = []) {
  return getPhaseInfo(value, phases).phase;
}

function renderNodePoints(value) {
  const score = clampPercent(value);
  return [20, 40, 60, 80]
    .map((point) => `<div class="node${score >= point ? ' active' : ''}" style="left: ${point}%;"></div>`)
    .join('');
}

function buildThemeVars(character, options = {}) {
  const theme = character.theme || {};
  const semantic = theme.semantic || {};
  const masked = options.masked === true;
  const resolvedTheme = masked
    ? {
        ...theme,
        goldMain: '#b8b8b8',
        goldDim: '#6e6e6e',
        goldGlow: 'rgba(255, 255, 255, 0.10)',
        accent: '#9a9a9a',
        accentGlow: 'rgba(255, 255, 255, 0.10)',
        accentText: '#cfcfcf',
        manaBlue: '#9a9a9a',
        semantic: {
          fortune: '#c2c2c2',
          curse: '#a7a7a7',
          mana: '#b5b5b5',
          exclusive: '#cfcfcf',
          trait: '#d2d2d2',
          skill: '#bdbdbd',
          status: '#adadad',
          warning: '#c4c4c4',
          void: '#b7b7b7'
        }
      }
    : theme;
  const resolvedSemantic = resolvedTheme.semantic || semantic;
  return {
    '--bg-void': resolvedTheme.bgVoid || '#0b0c10',
    '--gold-main': resolvedTheme.goldMain || '#CFB53B',
    '--gold-dim': resolvedTheme.goldDim || '#7a6e35',
    '--gold-glow': resolvedTheme.goldGlow || 'rgba(207, 181, 59, 0.15)',
    '--theme-name-color': resolvedTheme.nameColor || resolvedTheme.goldMain || '#CFB53B',
    '--theme-name-glow': resolvedTheme.nameGlow || resolvedTheme.goldGlow || 'rgba(207, 181, 59, 0.15)',
    '--deck-title-color': resolvedTheme.nameColor || resolvedTheme.goldMain || '#CFB53B',
    '--rino-magic': resolvedTheme.accent || '#9B59B6',
    '--rino-glow': resolvedTheme.accentGlow || 'rgba(155, 89, 182, 0.4)',
    '--rino-text': resolvedTheme.accentText || '#d28eff',
    '--mana-blue': resolvedTheme.manaBlue || '#4d94ff',
    '--theme-page-glow': resolvedTheme.pageGlow || resolvedTheme.accentGlow || resolvedTheme.goldGlow || 'rgba(155, 89, 182, 0.12)',
    '--theme-watermark-stroke': resolvedTheme.watermarkStroke || resolvedTheme.accentGlow || 'rgba(155, 89, 182, 0.12)',
    '--theme-panel-edge': resolvedTheme.panelEdge || resolvedTheme.goldGlow || 'rgba(207, 181, 59, 0.12)',
    '--theme-track-accent-bg': (resolvedTheme.accentGlow || 'rgba(155, 89, 182, 0.28)').replace(/0?\.\d+\)/, '0.12)'),
    '--semantic-fortune': resolvedSemantic.fortune || '#ebc970',
    '--semantic-curse': resolvedSemantic.curse || '#d26f7b',
    '--semantic-mana': resolvedSemantic.mana || resolvedTheme.manaBlue || '#4d94ff',
    '--semantic-exclusive': resolvedSemantic.exclusive || resolvedTheme.accentText || '#d28eff',
    '--semantic-trait': resolvedSemantic.trait || resolvedTheme.goldMain || '#CFB53B',
    '--semantic-skill': resolvedSemantic.skill || resolvedTheme.accentText || '#d28eff',
    '--semantic-status': resolvedSemantic.status || '#a4bac8',
    '--semantic-warning': resolvedSemantic.warning || '#f0ac59',
    '--semantic-void': resolvedSemantic.void || '#b5c0d8',
    '--standing-art-url': character.portraitUrl ? `url('${character.portraitUrl}')` : null
  };
}

function applyArtStyle(character) {
  if (!character) return;

  const root = document.documentElement;
  const artStyle = character.artStyle || {};
  const desktop = artStyle.desktop || {};
  const sheet = artStyle.sheet || {};

  const vars = {
    '--art-desktop-width': desktop.width || '100%',
    '--art-desktop-height': desktop.height || '105%',
    '--art-desktop-bottom': desktop.bottom || '-5%',
    '--art-desktop-left': desktop.left || '50%',
    '--art-desktop-offset-x': desktop.offsetX || '0px',
    '--art-desktop-offset-y': desktop.offsetY || '0px',
    '--art-desktop-scale': desktop.scale || '1',
    '--art-desktop-size': desktop.backgroundSize || 'contain',
    '--art-desktop-position': desktop.backgroundPosition || 'bottom center',
    '--art-sheet-width': sheet.width || 'min(90vw, 760px)',
    '--art-sheet-height': sheet.height || '104%',
    '--art-sheet-bottom': sheet.bottom || '-7%',
    '--art-sheet-left': sheet.left || '50%',
    '--art-sheet-offset-x': sheet.offsetX || '0px',
    '--art-sheet-offset-y': sheet.offsetY || '0px',
    '--art-sheet-scale': sheet.scale || '1',
    '--art-sheet-size': sheet.backgroundSize || 'contain',
    '--art-sheet-position': sheet.backgroundPosition || 'center bottom'
  };

  Object.entries(vars).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
}

function applyTheme(character, options = {}) {
  if (!character) return;

  const root = document.documentElement;
  Object.entries(buildThemeVars(character, options)).forEach(([key, value]) => {
    if (value) {
      root.style.setProperty(key, value);
    } else {
      root.style.removeProperty(key);
    }
  });

  applyArtStyle(character);
  document.documentElement.dataset.character = character.key || '';
  document.body.dataset.character = character.key || '';
  document.body.classList.toggle('is-hero-character', !character.portraitUrl);
  document.title = `${character.name || 'Character'} Dossier`;
}

function getDossierPageContext() {
  return {
    refs: {
      domTitle,
      domStatus,
      domDesc,
      domMeta,
      logBox,
      statusBlock,
      cmdGrid,
      deckTitle,
      visualStage,
      terminalPanel,
      mobileSpacer,
      detailsGroup,
      headerBlock,
      terminalBg,
      metaBox,
      rosterTrack,
      btnLeft,
      btnRight
    },
    data: {
      characters,
      rosterCharacters,
      svgLibrary
    },
    helpers: {
      escapeHtml,
      getMetricScore,
      getPhaseInfo,
      renderStatusRow,
      highlightLoreText,
      getItemToneColors,
      normalizeDashboardKey,
      getCharacterDashboardStatus,
      isSheetLayout
    },
    actions: {
      checkIsUnintroduced,
      applyTheme,
      syncBgmCharacter,
      renderEncryptedLog,
      showLog,
      clearLog,
      updateCardLockState
    },
    getState() {
      return {
        logData,
        cmdCards,
        lockedLogId,
        currentCharacterKey,
        rosterItems,
        ignoreRosterScroll,
        rosterScrollReleaseTimer
      };
    },
    setState(patch = {}) {
      if (Object.prototype.hasOwnProperty.call(patch, 'logData')) logData = patch.logData;
      if (Object.prototype.hasOwnProperty.call(patch, 'cmdCards')) cmdCards = patch.cmdCards;
      if (Object.prototype.hasOwnProperty.call(patch, 'lockedLogId')) lockedLogId = patch.lockedLogId;
      if (Object.prototype.hasOwnProperty.call(patch, 'currentCharacterKey')) currentCharacterKey = patch.currentCharacterKey;
      if (Object.prototype.hasOwnProperty.call(patch, 'rosterItems')) rosterItems = patch.rosterItems;
      if (Object.prototype.hasOwnProperty.call(patch, 'ignoreRosterScroll')) ignoreRosterScroll = patch.ignoreRosterScroll;
      if (Object.prototype.hasOwnProperty.call(patch, 'rosterScrollReleaseTimer')) rosterScrollReleaseTimer = patch.rosterScrollReleaseTimer;
    }
  };
}

function renderEncryptedLog() {
  if (typeof dossierPageApi.renderEncryptedLog === 'function') {
    return dossierPageApi.renderEncryptedLog(getDossierPageContext());
  }
}

function renderHeader(character, isUnintroduced = false) {
  if (typeof dossierPageApi.renderHeader === 'function') {
    return dossierPageApi.renderHeader(getDossierPageContext(), character, isUnintroduced);
  }
}

function renderStatusBlock(character, isUnintroduced = false) {
  if (typeof dossierPageApi.renderStatusBlock === 'function') {
    return dossierPageApi.renderStatusBlock(getDossierPageContext(), character, isUnintroduced);
  }
}

function renderCards(character, isUnintroduced = false) {
  if (typeof dossierPageApi.renderCards === 'function') {
    return dossierPageApi.renderCards(getDossierPageContext(), character, isUnintroduced);
  }
}

function updateCardLockState() {
  if (typeof dossierPageApi.updateCardLockState === 'function') {
    return dossierPageApi.updateCardLockState(getDossierPageContext());
  }
}

function showLog(id) {
  if (typeof dossierPageApi.showLog === 'function') {
    return dossierPageApi.showLog(getDossierPageContext(), id);
  }
}

function clearLog() {
  if (typeof dossierPageApi.clearLog === 'function') {
    return dossierPageApi.clearLog(getDossierPageContext());
  }
}

window.toggleLog = function(id) {
  if (!isSheetLayout()) return;

  if (lockedLogId === id) {
    lockedLogId = null;
    updateCardLockState();
    clearLog();
    return;
  }

  lockedLogId = id;
  updateCardLockState();
  showLog(id);
};

function resetDepthEffect() {
  if (typeof dossierPageApi.resetDepthEffect === 'function') {
    return dossierPageApi.resetDepthEffect(getDossierPageContext());
  }
}

function syncDepthEffect() {
  if (typeof dossierPageApi.syncDepthEffect === 'function') {
    return dossierPageApi.syncDepthEffect(getDossierPageContext());
  }
}

function getCurrentCharacter() {
  if (typeof dossierPageApi.getCurrentCharacter === 'function') {
    return dossierPageApi.getCurrentCharacter(getDossierPageContext());
  }
  return characters[normalizeDashboardKey(currentCharacterKey)] || rosterCharacters[0] || Object.values(characters)[0] || null;
}

function updateRosterActiveState() {
  if (typeof dossierPageApi.updateRosterActiveState === 'function') {
    return dossierPageApi.updateRosterActiveState(getDossierPageContext());
  }
}

function updateRosterArrowsState() {
  if (typeof dossierPageApi.updateRosterArrowsState === 'function') {
    return dossierPageApi.updateRosterArrowsState(getDossierPageContext());
  }
}

function centerRosterElement(element, behavior = 'smooth') {
  if (typeof dossierPageApi.centerRosterElement === 'function') {
    return dossierPageApi.centerRosterElement(getDossierPageContext(), element, behavior);
  }
}

function centerRosterByKey(key, behavior = 'smooth') {
  if (typeof dossierPageApi.centerRosterByKey === 'function') {
    return dossierPageApi.centerRosterByKey(getDossierPageContext(), key, behavior);
  }
}

function syncDashboardPageUI() {
  const isOverview = currentDashboardPage === 'overview';
  const isDossier = currentDashboardPage === 'dossier';
  const isExpansion = currentDashboardPage === 'expansion';

  document.documentElement.classList.toggle('is-overview-page', isOverview);
  document.body.classList.toggle('is-overview-page', isOverview);
  document.documentElement.classList.toggle('is-home-page', isOverview);
  document.body.classList.toggle('is-home-page', isOverview);
  document.documentElement.classList.toggle('is-expansion-page', isExpansion);
  document.body.classList.toggle('is-expansion-page', isExpansion);

  if (typeof window.__acezeroHomePageActive === 'function') {
    window.__acezeroHomePageActive(isOverview);
  }

  if (pageOverview) pageOverview.classList.toggle('is-active', isOverview);
  if (pageDossier) pageDossier.classList.toggle('is-active', isDossier);
  if (pageExpansion) pageExpansion.classList.toggle('is-active', isExpansion);
  if (pageBtnOverview) pageBtnOverview.classList.toggle('is-active', isOverview);
  if (pageBtnDossier) pageBtnDossier.classList.toggle('is-active', isDossier);
  if (pageBtnExpansion) pageBtnExpansion.classList.toggle('is-active', isExpansion);
  if (pageBtnOverview) pageBtnOverview.setAttribute('aria-pressed', String(isOverview));
  if (pageBtnDossier) pageBtnDossier.setAttribute('aria-pressed', String(isDossier));
  if (pageBtnExpansion) {
    pageBtnExpansion.setAttribute('aria-pressed', String(isExpansion));
    pageBtnExpansion.toggleAttribute('hidden', dashboardExtensions.length <= 0);
  }
}

function syncBgmWidgetCollapsedState() {
  if (!bgmUI.widget) return;

  if (currentDashboardPage === 'overview' || currentDashboardPage === 'expansion') {
    bgmUI.widget.classList.add('hide-on-scroll');
    bgmUI.widget.classList.remove('expanded');
    if (bgmUI.panel) bgmUI.panel.classList.remove('active');
    return;
  }

  if (!isSheetLayout()) {
    bgmUI.widget.classList.remove('hide-on-scroll');
    return;
  }

  const scrollY = window.scrollY || window.pageYOffset;
  const spacerHeight = mobileSpacer?.offsetHeight || window.innerHeight * 0.82;
  const revealThreshold = Math.max(6, Math.min(18, Math.round(spacerHeight * 0.02)));

  if (scrollY > revealThreshold) {
    bgmUI.widget.classList.add('hide-on-scroll');
  } else {
    bgmUI.widget.classList.remove('hide-on-scroll');
  }
}

function setDashboardPage(pageKey, options = {}) {
  const nextPage = pageKey === 'dossier'
    ? 'dossier'
    : (pageKey === 'expansion' ? 'expansion' : 'overview');
  currentDashboardPage = nextPage;
  syncDashboardPageUI();

  if (nextPage === 'overview') {
    syncBgmWidgetCollapsedState();
    window.scrollTo({ top: 0, behavior: 'auto' });
    return;
  }

  if (nextPage === 'expansion') {
    renderExpansionPage();
    syncBgmWidgetCollapsedState();
    window.scrollTo({ top: 0, behavior: 'auto' });
    return;
  }

  syncBgmWidgetCollapsedState();

  if (options.characterKey) {
    activateCharacter(options.characterKey, { centerDock: true, dockBehavior: options.dockBehavior || 'smooth' });
  }

  requestAnimationFrame(() => {
    syncDepthEffect();
    syncBgmWidgetCollapsedState();
    centerRosterByKey(currentCharacterKey, options.dockBehavior || 'auto');
  });
}

function bindOverviewJumpNodes() {
  document.querySelectorAll('[data-jump-character]').forEach((node) => {
    if (node.dataset.jumpBound === '1') return;
    node.dataset.jumpBound = '1';
    node.addEventListener('click', () => {
      const characterKey = node.dataset.jumpCharacter;
      setDashboardPage('dossier', { characterKey, dockBehavior: 'smooth' });
    });
  });
}

function initializeDashboardPages() {
  if (pageBtnOverview) {
    pageBtnOverview.addEventListener('click', () => setDashboardPage('overview'));
  }

  if (pageBtnDossier) {
    pageBtnDossier.addEventListener('click', () => setDashboardPage('dossier', { dockBehavior: 'auto' }));
  }

  if (pageBtnExpansion) {
    pageBtnExpansion.addEventListener('click', () => setDashboardPage('expansion'));
  }

  renderOverviewPage();
  renderExpansionPage();
  bindOverviewJumpNodes();
  syncDashboardPageUI();
}

function activateCharacter(key, options = {}) {
  if (typeof dossierPageApi.activateCharacter === 'function') {
    return dossierPageApi.activateCharacter(getDossierPageContext(), key, options);
  }
}

function triggerRosterChange(element, options = {}) {
  if (typeof dossierPageApi.triggerRosterChange === 'function') {
    return dossierPageApi.triggerRosterChange(getDossierPageContext(), element, options);
  }
}

function findClosestRosterItem() {
  if (typeof dossierPageApi.findClosestRosterItem === 'function') {
    return dossierPageApi.findClosestRosterItem(getDossierPageContext());
  }
  return null;
}

function renderRosterDock() {
  if (typeof dossierPageApi.renderRosterDock === 'function') {
    return dossierPageApi.renderRosterDock(getDossierPageContext());
  }
}


function getExclusiveTrackKey(characterKey) {
  return `exclusive:${normalizeDashboardKey(characterKey)}`;
}

function getExclusiveTrack(characterKey) {
  const normalizedKey = normalizeDashboardKey(characterKey);
  return bgmLibrary.exclusive[normalizedKey] || bgmLibrary.exclusive[characterKey] || null;
}

function syncBgmAutoToggleUI() {
  if (!bgmUI.autoToggle) return;
  bgmUI.autoToggle.classList.toggle('active', bgmState.autoExclusiveEnabled);
  bgmUI.autoToggle.setAttribute('aria-pressed', String(bgmState.autoExclusiveEnabled));
}

function persistBgmAutoExclusive() {
  try {
    window.localStorage.setItem('dashboard-bgm-auto-exclusive', bgmState.autoExclusiveEnabled ? '1' : '0');
  } catch (error) {
    console.warn('Unable to persist BGM auto-exclusive mode:', error);
  }
}

function stopBgmFade() {
  if (bgmState.fadeTimer) {
    window.clearInterval(bgmState.fadeTimer);
    bgmState.fadeTimer = null;
  }
}

function fadeBgmVolume(targetVolume, duration = BGM_FADE_DURATION, token = bgmState.transitionToken) {
  stopBgmFade();
  const boundedTarget = Math.max(0, Math.min(bgmState.targetVolume, targetVolume));
  if (duration <= 0) {
    bgmState.audio.volume = boundedTarget;
    return Promise.resolve(token === bgmState.transitionToken);
  }

  return new Promise((resolve) => {
    const startVolume = Number.isFinite(bgmState.audio.volume) ? bgmState.audio.volume : 0;
    const startedAt = performance.now();

    bgmState.fadeTimer = window.setInterval(() => {
      if (token !== bgmState.transitionToken) {
        stopBgmFade();
        resolve(false);
        return;
      }

      const elapsed = performance.now() - startedAt;
      const progress = Math.min(elapsed / duration, 1);
      const eased = progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;

      bgmState.audio.volume = startVolume + ((boundedTarget - startVolume) * eased);

      if (progress >= 1) {
        bgmState.audio.volume = boundedTarget;
        stopBgmFade();
        resolve(true);
      }
    }, 16);
  });
}

function waitForBgmCanPlay(token = bgmState.transitionToken) {
  if (bgmState.audio.readyState >= 3) {
    return Promise.resolve(token === bgmState.transitionToken);
  }

  return new Promise((resolve) => {
    const cleanup = () => {
      bgmState.audio.removeEventListener('canplay', handleReady);
      bgmState.audio.removeEventListener('error', handleError);
      window.clearTimeout(timeoutId);
    };

    const handleReady = () => {
      cleanup();
      resolve(token === bgmState.transitionToken);
    };

    const handleError = () => {
      cleanup();
      resolve(false);
    };

    const timeoutId = window.setTimeout(() => {
      cleanup();
      resolve(false);
    }, 10000);

    bgmState.audio.addEventListener('canplay', handleReady, { once: true });
    bgmState.audio.addEventListener('error', handleError, { once: true });
  });
}

function resolveTrackById(characterKey, trackId) {
  if (!trackId) return null;
  if (trackId.startsWith('exclusive:')) {
    const exclusiveKey = trackId.split(':')[1] || characterKey;
    const track = getExclusiveTrack(exclusiveKey);
    return track ? { trackId, trackData: track } : null;
  }
  const track = bgmLibrary.general.find((item) => item.id === trackId);
  return track ? { trackId, trackData: track } : null;
}

function saveBgmMemory(characterKey = bgmState.activeCharKey) {
  if (!characterKey) return;
  if (!bgmState.currentTrackId) {
    bgmState.memoryByCharacter[characterKey] = null;
    return;
  }

  bgmState.memoryByCharacter[characterKey] = {
    trackId: bgmState.currentTrackId,
    currentTime: Number.isFinite(bgmState.audio.currentTime) ? bgmState.audio.currentTime : 0,
    wasPlaying: bgmState.isPlaying
  };
}

async function restoreBgmMemory(characterKey) {
  const memory = bgmState.memoryByCharacter[characterKey];
  if (!memory || !memory.trackId) {
    resetBgmToIdle();
    return;
  }

  const resolved = resolveTrackById(characterKey, memory.trackId);
  if (!resolved) {
    resetBgmToIdle();
    return;
  }

  await preloadAndPlayBgm(resolved.trackId, resolved.trackData, {
    autoplay: memory.wasPlaying,
    seekTime: memory.currentTime || 0
  });
}

function resetBgmProgress() {
  if (!bgmUI.progress || !bgmUI.playerBox) return;
  bgmUI.progress.value = 0;
  bgmUI.progress.max = 100;
  bgmUI.timeCur.textContent = '00:00';
  bgmUI.timeTot.textContent = '00:00';
  bgmUI.playerBox.style.setProperty('--progress-perc', '0%');
}

function resetBgmToIdle() {
  if (!bgmUI.npText) return;
  bgmState.transitionToken += 1;
  stopBgmFade();
  bgmState.currentTrackId = null;
  bgmState.currentTrackName = '';
  bgmState.isPlaying = false;
  bgmState.pendingSeekTime = 0;
  bgmState.audio.pause();
  bgmState.audio.removeAttribute('src');
  bgmState.audio.volume = bgmState.targetVolume;
  bgmUI.npText.textContent = 'SYSTEM IDLE';
  bgmUI.npText.className = 'bgm-np-title';
  bgmUI.playBtn.disabled = true;
  bgmUI.progress.disabled = true;
  resetBgmProgress();
  syncBgmUIState();
}

function syncBgmUIState() {
  if (!bgmUI.playBtn) return;

  if (bgmState.isPlaying) {
    bgmUI.iconPlay.style.display = 'none';
    bgmUI.iconPause.style.display = 'block';
    bgmUI.playBtn.classList.add('playing');
    bgmUI.playerBox.classList.add('is-active');
    bgmUI.disc.classList.add('playing');
    bgmUI.statusDot.classList.add('playing');
    bgmUI.npText.classList.add('playing');
    bgmUI.visualizer.classList.add('active');
  } else {
    bgmUI.iconPlay.style.display = 'block';
    bgmUI.iconPause.style.display = 'none';
    bgmUI.playBtn.classList.remove('playing');
    bgmUI.playerBox.classList.remove('is-active');
    bgmUI.disc.classList.remove('playing');
    bgmUI.statusDot.classList.remove('playing');
    bgmUI.npText.classList.remove('playing');
    bgmUI.visualizer.classList.remove('active');
  }

  syncBgmAutoToggleUI();
  renderBgmTrackList();
}

function renderBgmTrackList() {
  if (!bgmUI.trackList) return;

  bgmUI.trackList.innerHTML = '';

  const currentExclusiveKey = bgmState.currentTrackId?.startsWith('exclusive:')
    ? bgmState.currentTrackId.split(':')[1]
    : null;

  if (currentExclusiveKey && currentExclusiveKey !== bgmState.activeCharKey) {
    const carryTrack = getExclusiveTrack(currentExclusiveKey);
    if (carryTrack) {
      const carryElement = document.createElement('div');
      carryElement.className = 'bgm-track exclusive playing';
      carryElement.textContent = `${getMaskedExclusiveTrackName(currentExclusiveKey)} · CURRENT`;
      carryElement.addEventListener('click', () => preloadAndPlayBgm(getExclusiveTrackKey(currentExclusiveKey), carryTrack));
      bgmUI.trackList.appendChild(carryElement);
    }
  }

  const exclusiveTrack = getExclusiveTrack(bgmState.activeCharKey);
  if (exclusiveTrack && isCharacterBgmUnlocked(bgmState.activeCharKey)) {
    const exclusiveTrackId = getExclusiveTrackKey(bgmState.activeCharKey);
    const exclusiveElement = document.createElement('div');
    exclusiveElement.className = `bgm-track exclusive ${bgmState.currentTrackId === exclusiveTrackId ? 'playing' : ''}`;
    exclusiveElement.textContent = getMaskedExclusiveTrackName(bgmState.activeCharKey);
    exclusiveElement.addEventListener('click', () => preloadAndPlayBgm(exclusiveTrackId, exclusiveTrack));
    bgmUI.trackList.appendChild(exclusiveElement);
  }

  bgmLibrary.general.forEach((track) => {
    const trackElement = document.createElement('div');
    trackElement.className = `bgm-track ${bgmState.currentTrackId === track.id ? 'playing' : ''}`;
    trackElement.textContent = track.name;
    trackElement.addEventListener('click', () => preloadAndPlayBgm(track.id, track));
    bgmUI.trackList.appendChild(trackElement);
  });
}

async function fadeOutCurrentBgm(token, duration = BGM_FADE_DURATION) {
  if (!bgmState.audio.src) return true;
  if (!bgmState.audio.paused) {
    const completed = await fadeBgmVolume(0, duration, token);
    if (!completed || token !== bgmState.transitionToken) return false;
  }
  bgmState.audio.pause();
  bgmState.audio.volume = bgmState.targetVolume;
  bgmState.isPlaying = false;
  syncBgmUIState();
  return token === bgmState.transitionToken;
}

async function preloadAndPlayBgm(trackId, trackData, options = {}) {
  if (!trackData || !bgmUI.npText) return;

  const autoplay = options.autoplay !== false;
  const seekTime = Number.isFinite(options.seekTime) ? options.seekTime : 0;

  if (bgmState.currentTrackId === trackId) {
    if (seekTime > 0 && Number.isFinite(bgmState.audio.duration)) {
      bgmState.audio.currentTime = Math.min(seekTime, bgmState.audio.duration || seekTime);
    }
    if (autoplay) {
      await performPlayBgm();
    }
    return;
  }

  saveBgmMemory();
  const token = ++bgmState.transitionToken;
  const fadedOut = await fadeOutCurrentBgm(token);
  if (!fadedOut || token !== bgmState.transitionToken) return;

  bgmState.currentTrackId = trackId;
  bgmState.currentTrackName = trackData.name;
  bgmState.pendingSeekTime = seekTime;
  bgmState.audio.src = trackData.url;
  bgmState.audio.volume = autoplay ? 0 : bgmState.targetVolume;

  bgmUI.npText.textContent = `${trackData.name} (BUFFERING...)`;
  bgmUI.npText.className = 'bgm-np-title loading';
  bgmUI.playBtn.disabled = true;
  bgmUI.progress.disabled = true;
  resetBgmProgress();
  bgmUI.timeTot.textContent = '--:--';
  bgmState.audio.load();
  renderBgmTrackList();

  const ready = await waitForBgmCanPlay(token);
  if (!ready || token !== bgmState.transitionToken) return;

  if (seekTime > 0) {
    const safeTime = Number.isFinite(bgmState.audio.duration)
      ? Math.min(seekTime, bgmState.audio.duration || seekTime)
      : seekTime;
    bgmState.audio.currentTime = safeTime;
    bgmState.pendingSeekTime = 0;
  }

  bgmUI.npText.textContent = bgmState.currentTrackName;
  bgmUI.npText.className = 'bgm-np-title';
  bgmUI.playBtn.disabled = false;
  bgmUI.progress.disabled = false;

  if (!autoplay) {
    bgmState.isPlaying = false;
    bgmState.audio.pause();
    bgmState.audio.volume = bgmState.targetVolume;
    saveBgmMemory();
    syncBgmUIState();
    return;
  }

  try {
    await bgmState.audio.play();
  } catch (error) {
    console.warn('BGM play interrupted:', error);
    bgmState.audio.volume = bgmState.targetVolume;
    return;
  }

  if (token !== bgmState.transitionToken) return;
  bgmState.isPlaying = true;
  syncBgmUIState();
  await fadeBgmVolume(bgmState.targetVolume, BGM_FADE_DURATION + 120, token);
  saveBgmMemory();
}

async function performPlayBgm() {
  if (!bgmState.audio.src) return;
  const token = ++bgmState.transitionToken;
  stopBgmFade();
  bgmState.audio.volume = 0;
  try {
    await bgmState.audio.play();
  } catch (error) {
    console.warn('BGM play interrupted:', error);
    bgmState.audio.volume = bgmState.targetVolume;
    return;
  }
  if (token !== bgmState.transitionToken) return;
  bgmState.isPlaying = true;
  syncBgmUIState();
  await fadeBgmVolume(bgmState.targetVolume, BGM_FADE_DURATION, token);
  saveBgmMemory();
}

async function performPauseBgm() {
  if (!bgmState.audio.src) return;
  const token = ++bgmState.transitionToken;
  const completed = await fadeBgmVolume(0, BGM_FADE_DURATION, token);
  if (!completed || token !== bgmState.transitionToken) return;
  bgmState.audio.pause();
  bgmState.audio.volume = bgmState.targetVolume;
  bgmState.isPlaying = false;
  saveBgmMemory();
  syncBgmUIState();
}

function togglePlayPauseBgm() {
  if (!bgmState.currentTrackId) return;
  if (bgmState.audio.paused) {
    void performPlayBgm();
  } else {
    void performPauseBgm();
  }
}

function setBgmAutoExclusiveEnabled(enabled, options = {}) {
  bgmState.autoExclusiveEnabled = Boolean(enabled);
  persistBgmAutoExclusive();
  syncBgmAutoToggleUI();

  if (options.applyCurrent && bgmState.autoExclusiveEnabled) {
    if (!isCharacterBgmUnlocked(bgmState.activeCharKey)) {
      resetBgmToIdle();
      return;
    }
    const exclusiveTrack = getExclusiveTrack(bgmState.activeCharKey);
    if (exclusiveTrack) {
      void preloadAndPlayBgm(getExclusiveTrackKey(bgmState.activeCharKey), exclusiveTrack, { autoplay: true });
    }
  }
}

function syncBgmCharacter(characterKey) {
  const previousCharacterKey = bgmState.activeCharKey;
  if (previousCharacterKey && previousCharacterKey !== characterKey) {
    saveBgmMemory(previousCharacterKey);
  }

  bgmState.activeCharKey = characterKey;

  if (previousCharacterKey === characterKey) return;

  if (bgmState.autoExclusiveEnabled) {
    if (!isCharacterBgmUnlocked(characterKey)) {
      resetBgmToIdle();
      renderBgmTrackList();
      return;
    }
    const exclusiveTrack = getExclusiveTrack(characterKey);
    if (exclusiveTrack) {
      void preloadAndPlayBgm(getExclusiveTrackKey(characterKey), exclusiveTrack, { autoplay: true });
      return;
    }
  }

  if (bgmState.currentTrackId) {
    saveBgmMemory(characterKey);
  }

  renderBgmTrackList();
}
function initializeBgmWidget() {
  if (!bgmUI.bubble) return;

  const toggleBgmPanel = () => {
    bgmUI.panel.classList.toggle('active');
    const expanded = bgmUI.panel.classList.contains('active');
    bgmUI.widget.classList.toggle('expanded', expanded);

    const currentScrollY = window.scrollY || window.pageYOffset;
    const spacerHeight = mobileSpacer?.offsetHeight || window.innerHeight * 0.82;
    const revealThreshold = Math.max(6, Math.min(18, Math.round(spacerHeight * 0.02)));

    if (!expanded) return;
    if (!isSheetLayout() || currentScrollY <= revealThreshold) {
      bgmUI.widget.classList.remove('hide-on-scroll');
    } else {
      bgmUI.widget.classList.add('hide-on-scroll');
    }
  };

  bgmUI.bubble.addEventListener('click', toggleBgmPanel);

  bgmUI.bubble.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleBgmPanel();
    }
  });

  bgmUI.playBtn.addEventListener('click', togglePlayPauseBgm);

  if (bgmUI.autoToggle) {
    bgmUI.autoToggle.addEventListener('click', (event) => {
      event.stopPropagation();
      setBgmAutoExclusiveEnabled(!bgmState.autoExclusiveEnabled, { applyCurrent: true });
    });
  }

  bgmUI.progress.addEventListener('input', (event) => {
    bgmState.isDragging = true;
    bgmUI.timeCur.textContent = formatTime(Number(event.target.value));
    const max = parseFloat(bgmUI.progress.max) || 1;
    bgmUI.playerBox.style.setProperty('--progress-perc', `${(Number(event.target.value) / max) * 100}%`);
  });

  bgmUI.progress.addEventListener('change', (event) => {
    bgmState.isDragging = false;
    bgmState.audio.currentTime = Number(event.target.value);
  });

  bgmState.audio.addEventListener('canplay', () => {
    if (!bgmState.currentTrackId) return;
    if (bgmState.pendingSeekTime > 0) {
      const safeTime = Math.min(bgmState.pendingSeekTime, Number.isFinite(bgmState.audio.duration) ? bgmState.audio.duration || bgmState.pendingSeekTime : bgmState.pendingSeekTime);
      bgmState.audio.currentTime = safeTime;
      bgmState.pendingSeekTime = 0;
    }
    bgmUI.npText.textContent = bgmState.currentTrackName;
    bgmUI.npText.className = 'bgm-np-title';
    bgmUI.playBtn.disabled = false;
    bgmUI.progress.disabled = false;
  });

  bgmState.audio.addEventListener('timeupdate', () => {
    const duration = bgmState.audio.duration;
    if (Number.isNaN(duration) || !Number.isFinite(duration) || duration <= 0) return;

    if (Number(bgmUI.progress.max) !== duration) {
      bgmUI.progress.max = duration;
      bgmUI.timeTot.textContent = formatTime(duration);
    }

    if (!bgmState.isDragging) {
      bgmUI.progress.value = bgmState.audio.currentTime;
      bgmUI.timeCur.textContent = formatTime(bgmState.audio.currentTime);
      bgmUI.playerBox.style.setProperty('--progress-perc', `${(bgmState.audio.currentTime / duration) * 100}%`);
      saveBgmMemory();
    }
  });

  bgmState.audio.addEventListener('pause', () => {
    if (!bgmState.isDragging) {
      bgmState.isPlaying = false;
      syncBgmUIState();
    }
  });

  bgmState.audio.addEventListener('play', () => {
    bgmState.isPlaying = true;
    saveBgmMemory();
    syncBgmUIState();
  });

  syncBgmAutoToggleUI();
  renderBgmTrackList();
  bgmState.memoryByCharacter[bgmState.activeCharKey] = null;
  resetBgmToIdle();
}

window.addEventListener('scroll', syncDepthEffect, { passive: true });
window.addEventListener('message', handleDashboardHostMessage);
window.addEventListener('resize', () => {
  if (!isSheetLayout() && lockedLogId) {
    lockedLogId = null;
    updateCardLockState();
    clearLog();
  }

  updateRosterArrowsState();
  centerRosterByKey(currentCharacterKey, 'auto');
  syncDepthEffect();
});

renderRosterDock();
initializeBgmWidget();
initializeDashboardPages();
activateCharacter(getCurrentCharacter()?.key || 'rino', { centerDock: true, dockBehavior: 'auto' });
setDashboardPage('overview');
syncDepthEffect();
notifyDashboardReady();

window.addEventListener('load', () => {
  window.focus();
  document.body.click();
  centerRosterByKey(currentCharacterKey, 'auto');
  syncDepthEffect();
  notifyDashboardReady();
});


(function initBgmScrollHide() {
  const widgetEl = document.getElementById('bgm-widget');
  const spacerEl = document.querySelector('.mobile-spacer');
  if (!widgetEl) return;

  let lastScrollY = window.scrollY || window.pageYOffset;

  window.addEventListener('scroll', () => {
    if (typeof isSheetLayout === 'function' && !isSheetLayout()) {
      widgetEl.classList.remove('hide-on-scroll');
      if (bgmUI.panel) bgmUI.panel.classList.remove('active');
      widgetEl.classList.remove('expanded');
      return;
    }

    const currentScrollY = window.scrollY || window.pageYOffset;
    const spacerHeight = spacerEl?.offsetHeight || window.innerHeight * 0.82;
    const revealThreshold = Math.max(6, Math.min(18, Math.round(spacerHeight * 0.02)));
    const hideThreshold = Math.max(88, Math.round(spacerHeight * 0.14));

    if (currentScrollY <= revealThreshold) {
      widgetEl.classList.remove('hide-on-scroll');
    } else if (currentScrollY > hideThreshold && currentScrollY >= lastScrollY) {
      widgetEl.classList.add('hide-on-scroll');
      if (bgmUI.panel) bgmUI.panel.classList.remove('active');
      widgetEl.classList.remove('expanded');
    }

    lastScrollY = currentScrollY;
  }, { passive: true });
})();
