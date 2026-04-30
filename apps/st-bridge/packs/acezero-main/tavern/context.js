/**
 * AceZero Tavern context runtime.
 *
 * Owns prompt-facing hero, relationship, world, and location summaries. The main
 * Tavern plugin keeps same-named wrappers so the event flow remains stable.
 */
(function installAceZeroTavernContextRuntime(global) {
  'use strict';

  function createAceZeroTavernContextRuntime(options = {}) {
    const data = options.data || global.ACE0TavernPluginData || {};
    const constants = options.constants || {};
    const deps = options.deps || {};
    const HERO_INTERNAL_KEY = constants.HERO_INTERNAL_KEY || 'KAZU';
    const WORLD_LAYERS = constants.WORLD_LAYERS || data.WORLD_LAYERS || ['THE_COURT', 'THE_EXCHANGE', 'THE_STREET', 'THE_RUST'];
    const DEFAULT_WORLD_LOCATION = constants.DEFAULT_WORLD_LOCATION || data.DEFAULT_WORLD_LOCATION || { layer: 'THE_STREET', site: '' };
    const LOCATION_LAYER_META = constants.LOCATION_LAYER_META || data.LOCATION_LAYER_META || {};
    const DEFAULT_WORLD_CLOCK = constants.DEFAULT_WORLD_CLOCK || { day: 1, phase: 'MORNING' };
    const MANA_LOW_RATIO = constants.MANA_LOW_RATIO ?? data.MANA_LOW_RATIO ?? 0.3;
    const REL_STAGE_ENT = constants.REL_STAGE_ENT || data.REL_STAGE_ENT || [];
    const REL_STAGE_EX_BY_CHAR = constants.REL_STAGE_EX_BY_CHAR || data.REL_STAGE_EX_BY_CHAR || {};
    const REL_META = constants.REL_META || data.REL_META || {};
    const REL_DELTA_META = constants.REL_DELTA_META || data.REL_DELTA_META || {};
    const getCastNode = typeof deps.getCastNode === 'function' ? deps.getCastNode : () => ({});
    const getWorldState = typeof deps.getWorldState === 'function' ? deps.getWorldState : () => ({});
    const getWorldClock = typeof deps.getWorldClock === 'function' ? deps.getWorldClock : () => DEFAULT_WORLD_CLOCK;
    const _getPartyRoster = typeof deps.getPartyRoster === 'function' ? deps.getPartyRoster : () => [];
    const _normalizeFundsAmount = typeof deps.normalizeFundsAmount === 'function' ? deps.normalizeFundsAmount : (value) => Math.max(0, Number(value) || 0);
    const _formatFunds = typeof deps.formatFunds === 'function' ? deps.formatFunds : (value) => String(value);
    const _formatFundsNumber = typeof deps.formatFundsNumber === 'function' ? deps.formatFundsNumber : (value) => String(value);

  function getRelStageName(score, table) {
    const v = Math.max(0, Math.min(100, Math.round(Number(score) || 0)));
    for (const s of table) {
      if (v <= s.max) return s.name;
    }
    return table[table.length - 1].name;
  }

  function getRelStage(score, table) {
    const v = Math.max(0, Math.min(100, Math.round(Number(score) || 0)));
    for (const s of table) {
      if (v <= s.max) return s;
    }
    return table[table.length - 1];
  }

  function buildRelationshipStateSummary(eraVars) {
    if (!eraVars) return '';
    const hero = eraVars.hero || {};
    const rel = hero.relationship || {};
    const characterBlocks = [];
    const order = ['RINO', 'VV', 'POPPY', 'KUZUHA', 'SIA', 'EULALIA', 'COTA', 'KAKO', 'TRIXIE'];

    for (const key of order) {
      const castNode = getCastNode(hero, key);
      if (castNode.activated !== true || castNode.introduced !== true) continue;

      const meta = REL_META[key];
      if (!meta) continue;
      const node = rel[key] || {};
      const ent = Math.max(0, Math.min(100, Math.round(Number(node.entanglement) || 0)));
      const exVal = Math.max(0, Math.min(100, Math.round(Number(node.exclusive) || 0)));
      const exStages = REL_STAGE_EX_BY_CHAR[key] || REL_STAGE_EX_BY_CHAR.RINO;
      const entStage = getRelStage(ent, REL_STAGE_ENT);
      const exStage = getRelStage(exVal, exStages);
      const deltaMeta = REL_DELTA_META[key] || {};
      characterBlocks.push(
`${key}:
[当前关系值]
  [${key}] 牵连度(entanglement)=${ent}(${entStage.name}) | ${meta.cn}(exclusive)=${exVal}(${exStage.name})
[基本关系定义]
  [${key}.exclusive] ${meta.definition}
    - 增加逻辑: ${deltaMeta.increaseMeaning || '（未定义）'}
    - 减少逻辑: ${deltaMeta.decreaseMeaning || '（未定义）'}
[当前阶段定义]
    - 牵连度阶段说明(${entStage.name}): ${entStage.desc}
    - ${meta.cn}阶段说明(${exStage.name}): ${exStage.desc}`
      );
    }

    const characterSection = characterBlocks.length > 0
      ? characterBlocks.join('\n\n')
      : '（当前无已入场角色关系块）';

    const entanglementDefinition = [
      '牵连度衡量的是，Kazu 与某角色在日常、行动、风险与生活结构上的卷入程度。',
      '它反映的是双方是否已形成稳定接触、默认存在感、相处惯性与现实中的相互影响。',
      '牵连度不是爱意，也不是控制，而是说明这个人是否已经走进你的现实。'
    ].join('');

    return `
<ace0_relationship_state>
[牵连度定义]
  ${entanglementDefinition}
[关系变化通用规则]
  牵连度增加 = 双方在日常、行动、风险与生活结构上的卷入加深。代表接触更稳定、共处更常态化、彼此开始默认对方会在场。
  牵连度减少 = 双方从彼此现实中部分脱嵌。代表接触减少、默认存在感下降、相互影响减弱。不等于厌恶，只表示没那么进入彼此生活。
  关系变量路径统一为 hero.relationship.<角色>.entanglement 与 hero.relationship.<角色>.exclusive。
  专属值(exclusive)增加 = 该角色以其自身逻辑，将 Kazu 更深地纳入自己的秩序、职责、欲望、异常、依赖。
  专属值(exclusive)减少 = 该角色对 Kazu 的特殊定位松动、后撤、失效或被压回一般关系。
[角色关系分块]
${characterSection}
</ace0_relationship_state>`;
  }

  function buildHeroSummary(eraVars) {
    if (!eraVars) return null;

    const hero = eraVars.hero || {};
    const funds = _normalizeFundsAmount(hero.funds);
    const assets = _normalizeFundsAmount(hero.assets);
    const debt = _normalizeFundsAmount(hero.debt);
    const majorDebt = _normalizeFundsAmount(hero.majorDebt);
    const roster = _getPartyRoster(hero);

    if (roster.length === 0) return null;

    const presentLines = [];
    const notIntroducedLines = [];
    const inPartyLines = [];

    for (const member of roster) {
      if (member.activated === true && member.introduced === true && member.present === true) {
        presentLines.push(`  ${member.name}`);
      } else if (member.activated === true && member.introduced !== true) {
        notIntroducedLines.push(`  ${member.name}`);
      }

      if (member.activated === true && member.inParty === true) {
        let manaStr = '';
        if (member.maxMana != null) {
          const ratio = member.maxMana > 0 ? member.mana / member.maxMana : 1;
          const warn = member.maxMana > 0 && ratio < MANA_LOW_RATIO ? ' ⚠️魔运不足，可能影响技能发动' : '';
          manaStr = ` | 魔运: ${member.mana}/${member.maxMana}${warn}`;
        }
        inPartyLines.push(`  ${member.name} Lv.${member.level}${manaStr}`);
      }
    }

    const presentSection = presentLines.length > 0 ? presentLines.join('\n') : '  （无）';
    const notIntroducedSection = notIntroducedLines.length > 0 ? notIntroducedLines.join('\n') : '  （无）';
    const inPartySection = inPartyLines.length > 0 ? inPartyLines.join('\n') : '  （无）';

    return `<ace0_hero_state>
[主角状态]
  资金: ${_formatFunds(funds)} (${_formatFundsNumber(funds)} funds)
  资产: ${_formatFunds(assets)} (${_formatFundsNumber(assets)} assets)
  债务: ${_formatFunds(debt)} (${_formatFundsNumber(debt)} debt)
  主债务: ${_formatFunds(majorDebt)} (${_formatFundsNumber(majorDebt)} majorDebt)
[PRESENT(present=true)]
${presentSection}
[NOT INTRODUCED(introduced=false)]
${notIntroducedSection}
[IN PARTY(inParty=true)]
${inPartySection}
</ace0_hero_state>`;
  }

  function getWorldLocation(eraVars) {
    const world = getWorldState(eraVars);
    const raw = world.location && typeof world.location === 'object'
      ? world.location
      : DEFAULT_WORLD_LOCATION;
    const layer = typeof raw.layer === 'string' && WORLD_LAYERS.includes(raw.layer.trim().toUpperCase())
      ? raw.layer.trim().toUpperCase()
      : DEFAULT_WORLD_LOCATION.layer;
    const site = typeof raw.site === 'string' ? raw.site.trim() : '';
    return { layer, site };
  }

  function buildWorldContextSummary(eraVars) {
    const location = getWorldLocation(eraVars);
    const meta = LOCATION_LAYER_META[location.layer] || LOCATION_LAYER_META.THE_STREET;
    const siteLine = location.site ? location.site : '（未指定具体场所）';
    const clock = getWorldClock(eraVars);

    return `<ace0_world_context>
[WORLD CONTEXT]
  当前位于 ${meta.label} / ${meta.english} / ${location.layer}
  当前场所: ${siteLine}
  当前时间: DAY ${clock.day} / ${clock.phase}
</ace0_world_context>`;
  }

  function buildLocationDocSummary(eraVars) {
    const location = getWorldLocation(eraVars);
    const meta = LOCATION_LAYER_META[location.layer] || LOCATION_LAYER_META.THE_STREET;
    return typeof meta.fullDoc === 'string' ? meta.fullDoc.trim() : '';
  }

    return {
      getRelStageName,
      getRelStage,
      buildRelationshipStateSummary,
      buildHeroSummary,
      getWorldLocation,
      buildWorldContextSummary,
      buildLocationDocSummary
    };
  }

  global.ACE0TavernContextRuntime = Object.assign({}, global.ACE0TavernContextRuntime || {}, {
    create: createAceZeroTavernContextRuntime
  });
})(typeof window !== 'undefined' ? window : globalThis);
