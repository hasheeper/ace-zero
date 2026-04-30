/**
 * ACEZERO TAVERN CHARACTER RUNTIME
 *
 * Owns hero naming, character cast/roster helpers, character prompt docs,
 * and worldbook-backed full character document caching.
 */
(function () {
  'use strict';

  const root = typeof window !== 'undefined' ? window : globalThis;

  root.ACE0TavernCharacterRuntime = {
    create(options = {}) {
      const pluginName = options.pluginName || '[ACE0]';
      const data = options.data || {};
      const constants = options.constants || {};
      const deps = options.deps || {};
      const {
        HERO_INTERNAL_KEY = 'KAZU',
        HERO_MACRO_NAME = '{{user}}',
        HERO_MACRO_ALT = '<user>',
        CHAR_DOC_INJECT_IDS = {
          RINO: 'ace0_char_doc_rino',
          SIA: 'ace0_char_doc_sia',
          POPPY: 'ace0_char_doc_poppy',
          VV: 'ace0_char_doc_vv',
          TRIXIE: 'ace0_char_doc_trixie',
          COTA: 'ace0_char_doc_cota',
          EULALIA: 'ace0_char_doc_eulalia',
          KAKO: 'ace0_char_doc_kako',
          KUZUHA: 'ace0_char_doc_kuzuha'
        },
        FULL_DOC_WORLDBOOK_NAME = 'AceZeroInfo-MVUVer-1.2.4',
        FULL_DOC_UIDS = {
          RINO: 10,
          SIA: 12,
          POPPY: 8,
          VV: 14,
          TRIXIE: 16,
          EULALIA: 23,
          KAKO: 24,
          COTA: 25,
          KUZUHA: 26
        }
      } = constants;
      const {
        normalizeTrimmedString = (value, fallback = '') => (typeof value === 'string' ? value.trim() : fallback),
        getWorldbook = root.getWorldbook
      } = deps;

      let fullDocWorldbookCache = null;
      let fullDocWorldbookNameLoaded = null;

  function isHeroMacroToken(value) {
    return value === HERO_MACRO_NAME || value === HERO_MACRO_ALT;
  }

  function resolveCurrentUserDisplayName(fallback = HERO_INTERNAL_KEY) {
    try {
      const ctx = typeof getContext === 'function' ? getContext() : null;
      const candidates = [
        ctx?.name1,
        ctx?.userName,
        ctx?.user_name,
        ctx?.chat_metadata?.user_name,
        globalThis?.name1,
        globalThis?.userName,
        globalThis?.user_name,
        globalThis?.chat_metadata?.user_name,
        globalThis?.power_user?.persona?.name,
      ];
      for (const candidate of candidates) {
        const normalized = normalizeTrimmedString(candidate, '');
        if (normalized) return normalized;
      }
    } catch (error) {
      console.warn(`${pluginName} 读取当前酒馆 user 名失败:`, error);
    }
    return fallback;
  }

  function resolveHeroDisplayName(fallback = HERO_INTERNAL_KEY) {
    return fallback;
  }

  function resolveHeroAliasDisplayName(hero, fallback = HERO_INTERNAL_KEY) {
    const aliasName = normalizeTrimmedString(hero?.aliases?.KAZU, '');
    if (aliasName) {
      return isHeroMacroToken(aliasName)
        ? resolveCurrentUserDisplayName(fallback)
        : aliasName;
    }

    const explicit = normalizeTrimmedString(hero?.heroDisplayName, '');
    if (explicit && !isHeroMacroToken(explicit)) return explicit;
    return resolveHeroDisplayName(fallback);
  }

  function normalizeHeroCharacterKey(rawName, hero) {
    const normalized = normalizeTrimmedString(rawName, '');
    if (!normalized) return '';
    if (normalized.toUpperCase() === HERO_INTERNAL_KEY) return HERO_INTERNAL_KEY;
    if (isHeroMacroToken(normalized)) return HERO_INTERNAL_KEY;

    const aliasName = normalizeTrimmedString(hero?.aliases?.KAZU, '');
    if (aliasName && !isHeroMacroToken(aliasName) && normalized.toLowerCase() === aliasName.toLowerCase()) {
      return HERO_INTERNAL_KEY;
    }

    const explicitName = normalizeTrimmedString(hero?.heroDisplayName, '');
    if (explicitName && !isHeroMacroToken(explicitName) && normalized.toLowerCase() === explicitName.toLowerCase()) {
      return HERO_INTERNAL_KEY;
    }

    const currentUserDisplayName = resolveCurrentUserDisplayName('');
    if (currentUserDisplayName && normalized.toLowerCase() === currentUserDisplayName.toLowerCase()) {
      return HERO_INTERNAL_KEY;
    }

    return normalized.toUpperCase();
  }

  function replaceHeroPromptMacro(text) {
    if (typeof text !== 'string' || !text) return text;
    return text
      .replace(/\bKAZU\b/g, HERO_MACRO_NAME)
      .replace(/\bKazu\b/g, HERO_MACRO_NAME)
      .replace(/\bkazu\b/g, HERO_MACRO_NAME);
  }

  function resolveDisplayCharacterName(charKey) {
    return String(charKey || '').toUpperCase() === HERO_INTERNAL_KEY
      ? resolveCurrentUserDisplayName(HERO_INTERNAL_KEY)
      : charKey;
  }

  function resolveFrontendCharacterName(charKey, hero) {
    return String(charKey || '').toUpperCase() === HERO_INTERNAL_KEY
      ? resolveHeroAliasDisplayName(hero, HERO_INTERNAL_KEY)
      : charKey;
  }

  // ==========================================================
  //  角色状态系统 (Cast / Party System)
  //  hero.cast 控制叙事状态，hero.roster 控制战斗数值
  // ==========================================================

  const NON_PLAYER_CHARACTER_KEYS = ['RINO', 'SIA', 'POPPY', 'VV', 'TRIXIE', 'COTA', 'EULALIA', 'KAKO', 'KUZUHA'];
  const ALL_CHARACTER_KEYS = ['KAZU', ...NON_PLAYER_CHARACTER_KEYS];
  const DEFAULT_CAST_NODE = {
    activated: false,
    introduced: false,
    present: false,
    inParty: false,
    miniKnown: false,
  };
  const DEFAULT_ROSTER_NODE = {
    level: 0,
    mana: 0,
    maxMana: 0
  };
  const CHARACTER_PROMPT_DOCS = data.CHARACTER_PROMPT_DOCS || {};

  function getRelationshipTierIndex(score) {
    const value = Math.max(0, Math.min(100, Math.round(Number(score) || 0)));
    if (value >= 80) return 4;
    if (value >= 60) return 3;
    if (value >= 40) return 2;
    if (value >= 20) return 1;
    return 0;
  }

  async function getFullCharacterDoc(charKey, fallbackDoc = null) {
    const key = String(charKey || '').toUpperCase();
    const uid = FULL_DOC_UIDS[key];
    if (uid == null) {
      return fallbackDoc?.full || '';
    }

    try {
      if (!fullDocWorldbookCache || fullDocWorldbookNameLoaded !== FULL_DOC_WORLDBOOK_NAME) {
        fullDocWorldbookCache = await getWorldbook(FULL_DOC_WORLDBOOK_NAME);
        fullDocWorldbookNameLoaded = FULL_DOC_WORLDBOOK_NAME;
      }

      const entry = Array.isArray(fullDocWorldbookCache)
        ? fullDocWorldbookCache.find(item => item && item.uid === uid)
        : null;
      const content = typeof entry?.content === 'string' ? entry.content.trim() : '';
      if (content) return content;
    } catch (error) {
      console.warn(`${pluginName} worldbook full doc 读取失败: ${key} (uid=${uid})`, error);
    }

    return fallbackDoc?.full || '';
  }

  async function getCharacterPromptDoc(charKey, state = {}, options = {}) {
    const key = String(charKey || '').toUpperCase();
    const doc = CHARACTER_PROMPT_DOCS[key];
    if (!doc) return '';

    // 四档逻辑：
    //   isFirstMeet=true                   → mini（首见瞬间只做轮廓垫底，full 由后续轮承接）
    //   introduced=true, present=false     → mini（已认识但此刻不在场的垫底感知）
    //   present=true                       → full
    //   miniKnown=true, introduced=false   → mini（只投喂 mini 人设，不算正式登场）

    // 首见帧本轮不投喂 full 人设：<ace0_first_meet> 已单独承担登场文案，
    // 这里若再甩完整人设等于提前倾倒所有设定、破坏首见帧节奏。
    if (options?.isFirstMeet === true) {
      return [doc.mini].filter(Boolean).join('\n\n');
    }

    if (state?.present === true && state?.introduced === true) {
      return await getFullCharacterDoc(key, doc);
    }

    if (state?.introduced === true || state?.miniKnown === true) {
      return [doc.mini].filter(Boolean).join('\n\n');
    }

    return '';
  }


  async function buildCharacterPromptInjections(eraVars, firstMeetKeys = null) {
    const hero = eraVars?.hero || {};
    const prompts = [];
    const firstMeetSet = firstMeetKeys instanceof Set
      ? firstMeetKeys
      : new Set(Array.isArray(firstMeetKeys) ? firstMeetKeys : []);

    for (const charKey of NON_PLAYER_CHARACTER_KEYS) {
      const state = getCastNode(hero, charKey);
      const content = await getCharacterPromptDoc(charKey, state, {
        isFirstMeet: firstMeetSet.has(charKey)
      });
      if (!content || !content.trim()) continue;

      const injectId = CHAR_DOC_INJECT_IDS[charKey];
      if (!injectId) continue;

      prompts.push({
        id: injectId,
        position: 'in_chat',
        depth: 4,
        role: 'system',
        content: content.trim(),
        should_scan: false
      });
    }

    return prompts;
  }

  function getHeroCast(hero) {
    return hero && hero.cast && typeof hero.cast === 'object' ? hero.cast : {};
  }

  function getHeroRoster(hero) {
    return hero && hero.roster && typeof hero.roster === 'object' ? hero.roster : {};
  }

  function getCastNode(hero, charKey) {
    if (charKey === HERO_INTERNAL_KEY) {
      return {
        ...DEFAULT_CAST_NODE,
        activated: true,
        introduced: true,
        present: true,
        inParty: true,
      };
    }

    const cast = getHeroCast(hero);
    const node = cast[charKey] && typeof cast[charKey] === 'object' ? cast[charKey] : null;

    return {
      ...DEFAULT_CAST_NODE,
      ...(node || {})
    };
  }

  function getRosterNode(hero, charKey) {
    if (!charKey) return { ...DEFAULT_ROSTER_NODE };

    const roster = getHeroRoster(hero);
    const node = roster[charKey] && typeof roster[charKey] === 'object'
      ? roster[charKey]
      : null;

    return {
      ...DEFAULT_ROSTER_NODE,
      ...(node || {})
    };
  }

  /**
   * 从 hero 对象中提取「在队」角色名列表
   * KAZU 始终在队（主角本体），其余角色优先由 hero.cast[char].inParty 控制
   */
  function _getHeroCharNames(hero) {
    const names = [HERO_INTERNAL_KEY];
    for (const charKey of NON_PLAYER_CHARACTER_KEYS) {
      const castNode = getCastNode(hero, charKey);
      if (castNode.activated === true && castNode.inParty === true) {
        names.push(charKey);
      }
    }
    return names;
  }

  /**
   * 获取完整队伍花名册（含未入队角色），用于 AI 上下文注入
   * 返回 { name, introduced, present, inParty, level, mana, maxMana }[]
   */
  function _getPartyRoster(hero) {
    return ALL_CHARACTER_KEYS.map(charKey => {
      const castNode = getCastNode(hero, charKey);
      const rosterNode = getRosterNode(hero, charKey);
      return {
        name: charKey,
        activated: castNode.activated === true,
        introduced: castNode.introduced === true,
        present: castNode.present === true,
        inParty: castNode.inParty === true,
        level: rosterNode.level || 0,
        mana: rosterNode.mana,
        maxMana: rosterNode.maxMana
      };
    });
  }

      function clearFullDocCache() {
        fullDocWorldbookCache = null;
        fullDocWorldbookNameLoaded = null;
        return true;
      }

      return {
        CHAR_DOC_INJECT_IDS,
        NON_PLAYER_CHARACTER_KEYS,
        ALL_CHARACTER_KEYS,
        DEFAULT_CAST_NODE,
        DEFAULT_ROSTER_NODE,
        CHARACTER_PROMPT_DOCS,
        isHeroMacroToken,
        resolveCurrentUserDisplayName,
        resolveHeroDisplayName,
        resolveHeroAliasDisplayName,
        normalizeHeroCharacterKey,
        replaceHeroPromptMacro,
        resolveDisplayCharacterName,
        resolveFrontendCharacterName,
        getRelationshipTierIndex,
        getFullCharacterDoc,
        getCharacterPromptDoc,
        buildCharacterPromptInjections,
        getHeroCast,
        getHeroRoster,
        getCastNode,
        getRosterNode,
        getHeroCharNames: _getHeroCharNames,
        getPartyRoster: _getPartyRoster,
        clearFullDocCache
      };
    }
  };
})();
