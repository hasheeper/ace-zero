const commonPhases = [
  { min: 0, max: 19, name: '接触', english: 'Contact' },
  { min: 20, max: 39, name: '熟络', english: 'Familiarization' },
  { min: 40, max: 59, name: '惯性', english: 'Habituation' },
  { min: 60, max: 79, name: '卷入', english: 'Involvement' },
  { min: 80, max: 100, name: '嵌合', english: 'Enmeshment' }
];

const exclusivePhases = {
  rino: [
    { min: 0, max: 19, name: '占用', english: 'Appropriation' },
    { min: 20, max: 39, name: '固着', english: 'Fixing' },
    { min: 40, max: 59, name: '偏移', english: 'Tilt' },
    { min: 60, max: 79, name: '倒悬', english: 'Inversion Hanging' },
    { min: 80, max: 100, name: '覆位', english: 'Overturned Seat' }
  ],
  sia: [
    { min: 0, max: 19, name: '看管', english: 'Watchkeeping' },
    { min: 20, max: 39, name: '接手', english: 'Taking Over' },
    { min: 40, max: 59, name: '收拢', english: 'Consolidation' },
    { min: 60, max: 79, name: '截留', english: 'Interception' },
    { min: 80, max: 100, name: '归管', english: 'Custody' }
  ],
  poppy: [
    { min: 0, max: 19, name: '试附', english: 'Test Attach' },
    { min: 20, max: 39, name: '贴靠', english: 'Cling' },
    { min: 40, max: 59, name: '栖入', english: 'Nest In' },
    { min: 60, max: 79, name: '护食', english: 'Food Guarding' },
    { min: 80, max: 100, name: '共巢', english: 'Shared Nest' }
  ],
  vv: [
    { min: 0, max: 19, name: '估值', english: 'Valuation' },
    { min: 20, max: 39, name: '布局', english: 'Positioning' },
    { min: 40, max: 59, name: '增持', english: 'Accumulation' },
    { min: 60, max: 79, name: '控盘', english: 'Control' },
    { min: 80, max: 100, name: '锁仓', english: 'Locked Position' }
  ],
  trixie: [
    { min: 0, max: 19, name: '猎奇', english: 'Curiosity Hunt' },
    { min: 20, max: 39, name: '逗弄', english: 'Torment Play' },
    { min: 40, max: 59, name: '死锁', english: 'Deadlock' },
    { min: 60, max: 79, name: '溃边', english: 'Boundary Collapse' },
    { min: 80, max: 100, name: '同殉', english: 'Mutual Ruin' }
  ],
  eulalia: [
    { min: 0, max: 19, name: '留意', english: 'Noticing' },
    { min: 20, max: 39, name: '依凭', english: 'Reliance' },
    { min: 40, max: 59, name: '安放', english: 'Placement' },
    { min: 60, max: 79, name: '倚寄', english: 'Leaning Entrustment' },
    { min: 80, max: 100, name: '系心', english: 'Heartbound' }
  ],
  kako: [
    { min: 0, max: 19, name: '备案', english: 'Filed' },
    { min: 20, max: 39, name: '压件', english: 'Held Back' },
    { min: 40, max: 59, name: '篡栏', english: 'Tampered Ledger' },
    { min: 60, max: 79, name: '斡旋', english: 'Intercession' },
    { min: 80, max: 100, name: '共罪', english: 'Shared Guilt' }
  ],
  cota: [
    { min: 0, max: 19, name: '识别', english: 'Recognition' },
    { min: 20, max: 39, name: '停留', english: 'Lingering' },
    { min: 40, max: 59, name: '保留', english: 'Retention' },
    { min: 60, max: 79, name: '留待', english: 'Saving for Next Time' },
    { min: 80, max: 100, name: '沉存', english: 'Settled Retention' }
  ],
  kuzuha: [
    { min: 0, max: 19, name: '容留', english: 'Sheltering' },
    { min: 20, max: 39, name: '蓄养', english: 'Keeping' },
    { min: 40, max: 59, name: '累账', english: 'Accumulated Debt' },
    { min: 60, max: 79, name: '留缚', english: 'Binding Stay' },
    { min: 80, max: 100, name: '圈留', english: 'Enclosed Retention' }
  ]
};

const roleStatePhases = {
  rino: [
    { min: 0, max: 19, name: '占位', english: 'Seat Claim' },
    { min: 20, max: 39, name: '代偿', english: 'Compensation' },
    { min: 40, max: 59, name: '偏位', english: 'Drift' },
    { min: 60, max: 79, name: '倒悬', english: 'Hanging' },
    { min: 80, max: 100, name: '依存', english: 'Dependence' }
  ],
  sia: [
    { min: 0, max: 19, name: '看护', english: 'Supervision' },
    { min: 20, max: 39, name: '接手', english: 'Takeover' },
    { min: 40, max: 59, name: '封存', english: 'Sealing' },
    { min: 60, max: 79, name: '穿透', english: 'Penetration' },
    { min: 80, max: 100, name: '归管', english: 'Custody Lock' }
  ],
  poppy: [
    { min: 0, max: 19, name: '觅活', english: 'Scavenge' },
    { min: 20, max: 39, name: '回捡', english: 'Recover' },
    { min: 40, max: 59, name: '命大', english: 'Lucky Break' },
    { min: 60, max: 79, name: '续命', english: 'Survival' },
    { min: 80, max: 100, name: '共巢', english: 'Nest Hold' }
  ],
  vv: [
    { min: 0, max: 19, name: '估价', english: 'Pricing' },
    { min: 20, max: 39, name: '建仓', english: 'Position Build' },
    { min: 40, max: 59, name: '偏离', english: 'Deviation' },
    { min: 60, max: 79, name: '清算', english: 'Liquidation' },
    { min: 80, max: 100, name: '锁仓', english: 'Lock-In' }
  ],
  trixie: [
    { min: 0, max: 19, name: '试噪', english: 'Noise Test' },
    { min: 20, max: 39, name: '混演', english: 'Mixed Play' },
    { min: 40, max: 59, name: '鬼牌', english: 'Joker Stack' },
    { min: 60, max: 79, name: '失控', english: 'Unstable' },
    { min: 80, max: 100, name: '爆裂', english: 'Burst' }
  ],
  eulalia: [
    { min: 0, max: 19, name: '承接', english: 'Receive' },
    { min: 20, max: 39, name: '归存', english: 'Preserve' },
    { min: 40, max: 59, name: '厄运', english: 'Nominal Ruin' },
    { min: 60, max: 79, name: '赦免', english: 'Absolution' },
    { min: 80, max: 100, name: '分摊', english: 'Redistribute' }
  ],
  kako: [
    { min: 0, max: 19, name: '立卷', english: 'File' },
    { min: 20, max: 39, name: '红章', english: 'Red Seal' },
    { min: 40, max: 59, name: '改判', english: 'Reclassify' },
    { min: 60, max: 79, name: '总务', english: 'General Ruling' },
    { min: 80, max: 100, name: '共责', english: 'Shared Liability' }
  ],
  cota: [
    { min: 0, max: 19, name: '发牌', english: 'Deal' },
    { min: 20, max: 39, name: '编列', english: 'Arrange' },
    { min: 40, max: 59, name: '故障', english: 'Fault' },
    { min: 60, max: 79, name: '收牌', english: 'Gather' },
    { min: 80, max: 100, name: '爆牌', english: 'Burst' }
  ],
  kuzuha: [
    { min: 0, max: 19, name: '上账', english: 'Open Tab' },
    { min: 20, max: 39, name: '滚利', english: 'Accrue' },
    { min: 40, max: 59, name: '催收', english: 'Collection' },
    { min: 60, max: 79, name: '债缚', english: 'Debtbind' },
    { min: 80, max: 100, name: '圈留', english: 'Enclosure' }
  ]
};

const globalTerms = [
  { label: 'Fortune', tone: 'fortune' },
  { label: 'fortune', tone: 'fortune' },
  { label: 'Curse', tone: 'curse' },
  { label: 'curse', tone: 'curse' },
  { label: 'Mana', tone: 'mana' },
  { label: 'mana', tone: 'mana' },
  { label: 'Void', tone: 'void' },
  { label: 'Psyche', tone: 'skill' },
  { label: 'Chaos', tone: 'skill' },
  { label: 'Moirai', tone: 'skill' }
];

function dedupeTerms(items = []) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item || !item.label) return false;
    const key = `${item.label}::${item.tone || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function makeTheme(config) {
  return {
    bgVoid: config.bgVoid,
    goldMain: config.goldMain,
    goldDim: config.goldDim,
    goldGlow: config.goldGlow,
    nameColor: config.nameColor,
    nameGlow: config.nameGlow,
    pageGlow: config.pageGlow,
    panelEdge: config.panelEdge,
    watermarkStroke: config.watermarkStroke,
    accent: config.accent,
    accentGlow: config.accentGlow,
    accentText: config.accentText,
    manaBlue: config.manaBlue,
    semantic: {
      fortune: config.semantic?.fortune || '#ebc970',
      curse: config.semantic?.curse || '#d26f7b',
      mana: config.semantic?.mana || config.manaBlue || '#78baff',
      exclusive: config.semantic?.exclusive || config.accentText || config.accent,
      trait: config.semantic?.trait || config.goldMain,
      skill: config.semantic?.skill || config.accentText || config.accent,
      status: config.semantic?.status || '#a4bac8',
      warning: config.semantic?.warning || '#f0ac59',
      void: config.semantic?.void || '#b5c0d8'
    }
  };
}

function term(label, tone = 'exclusive') {
  return { label, tone };
}

function trait(id, name, slot, unlock, desc, options = {}) {
  return {
    id,
    kind: 'trait',
    accent: options.accent || 'trait',
    attrClass: 'trait',
    type: slot === '主手' ? 'MAIN TRAIT' : 'SUB TRAIT',
    name,
    svgId: options.svgId || '',
    title: `TRAIT · ${name}`,
    desc,
    meta: `[ PASSIVE : ${slot} / UNLOCK ${unlock} ]`,
    terms: dedupeTerms(options.terms || [])
  };
}

function skill(id, name, tier, attr, mana, cd, desc, options = {}) {
  const manaText = mana === 0 ? '0' : mana;
  const cdText = cd || '—';
  return {
    id,
    kind: 'skill',
    accent: options.accent || String(attr || 'skill').toLowerCase(),
    attrClass: String(attr || 'skill').toLowerCase(),
    type: `${tier} · ${String(attr).toUpperCase()} · MANA ${manaText}`,
    name,
    svgId: options.svgId || '',
    title: `SKILL · ${name}`,
    desc,
    meta: `[ ATTR : ${String(attr).toUpperCase()} / CD : ${cdText} ]`,
    terms: dedupeTerms(options.terms || [])
  };
}

function roleState(config = {}) {
  return {
    englishLabel: config.englishLabel || 'Role State',
    chineseLabel: config.chineseLabel || '专属状态',
    score: config.score ?? 0,
    color: config.color || 'var(--semantic-exclusive)',
    detail: config.detail || '',
    phases: config.phases || commonPhases
  };
}

function createCharacterBase(config) {
  const traits = (config.traits || []).map((item, index) => ({
    ...item,
    svgId: item.svgId || `${config.key}-trait-${index + 1}`
  }));
  const skills = (config.skills || []).map((item, index) => ({
    ...item,
    svgId: item.svgId || `${config.key}-skill-${index + 1}`
  }));

  return {
    key: config.key,
    name: config.name,
    dashboardState: {
      introduced: config.dashboardState?.introduced === true,
      present: config.dashboardState?.present === true,
      inParty: config.dashboardState?.inParty === true,
      miniKnown: config.dashboardState?.miniKnown === true,
      activated: config.dashboardState?.activated !== false
    },
    watermark: config.watermark || config.name.toUpperCase(),
    subtitle: config.subtitle,
    attribute: config.attribute,
    level: config.level ?? 5,
    deckTitle: config.deckTitle || 'Active Protocols',
    portraitUrl: config.portraitUrl,
    avatarUrl: config.avatarUrl || config.portraitUrl,
    suitSymbol: config.suitSymbol || '♥',
    suitClass: config.suitClass || 'heart',
    heroBlock: config.heroBlock || null,
    artStyle: {
      desktop: {
        width: config.artStyle?.desktop?.width || '100%',
        height: config.artStyle?.desktop?.height || '105%',
        bottom: config.artStyle?.desktop?.bottom || '-5%',
        left: config.artStyle?.desktop?.left || '50%',
        offsetX: config.artStyle?.desktop?.offsetX || '0px',
        offsetY: config.artStyle?.desktop?.offsetY || '0px',
        scale: config.artStyle?.desktop?.scale || '1',
        backgroundSize: config.artStyle?.desktop?.backgroundSize || 'contain',
        backgroundPosition: config.artStyle?.desktop?.backgroundPosition || 'bottom center'
      },
      sheet: {
        width: config.artStyle?.sheet?.width || 'min(90vw, 760px)',
        height: config.artStyle?.sheet?.height || '104%',
        bottom: config.artStyle?.sheet?.bottom || '-7%',
        left: config.artStyle?.sheet?.left || '50%',
        offsetX: config.artStyle?.sheet?.offsetX || '0px',
        offsetY: config.artStyle?.sheet?.offsetY || '0px',
        scale: config.artStyle?.sheet?.scale || '1',
        backgroundSize: config.artStyle?.sheet?.backgroundSize || 'contain',
        backgroundPosition: config.artStyle?.sheet?.backgroundPosition || 'center bottom'
      }
    },
    summary: config.summary,
    theme: config.theme,
    termCatalog: dedupeTerms([
      ...globalTerms,
      ...(config.terms || []),
      ...traits.flatMap((item) => item.terms || []),
      ...skills.flatMap((item) => item.terms || [])
    ]),
    variables: {
      resource: {
        label: config.resourceLabel || 'MANA',
        current: config.resourceCurrent ?? 72,
        max: config.resourceMax ?? 100
      },
      common: {
        englishLabel: 'Entanglement',
        chineseLabel: '牵连度',
        score: config.commonValue ?? 0,
        color: config.commonColor || '#aaa',
        phases: commonPhases
      },
      exclusive: {
        englishLabel: config.exclusiveEnglishLabel,
        chineseLabel: config.exclusiveChineseLabel,
        score: config.exclusiveValue ?? 0,
        color: config.exclusiveColor || 'var(--semantic-exclusive)',
        poles: config.poles || ['LEFT', 'RIGHT'],
        phases: exclusivePhases[config.key] || commonPhases
      },
      roleState: config.roleState || null
    },
    traits,
    skills
  };
}

window.dashboardCharacters = {
  kazu: createCharacterBase({
    key: 'kazu',
    dashboardState: { introduced: true, present: true, inParty: true },
    name: 'KAZU',
    watermark: 'NULL',
    subtitle: 'The Void Guardian',
    attribute: 'Void / Psyche',
    level: 3,
    portraitUrl: '',
    avatarUrl: '',
    suitSymbol: '♣',
    suitClass: 'club',
    heroBlock: {
      identLabel: 'IDENT',
      identValue: 'KAZU',
      manaLabel: 'MANA_POOL',
      manaValue: '0 / 0',
      debt: {
        title: 'GLOBAL_VARIABLE_01',
        headerLabel: 'DEBT',
        valueText: '- 395,000,000',
        unit: 'FL',
        lockText: '[ OVERFLOW ]'
      },
      assets: {
        gold: { label: 'GOLD FLORINS', cn: '金弗', value: '0', unit: 'G' },
        silver: { label: 'DECIMAL', cn: '小数', value: '.00', unit: '' }
      }
    },
    summary: 'KAZU 是被本命之场淘汰后仍能回归牌桌的"零号"存在，用 Void 与不动心压制整场命运波动。',
    theme: makeTheme({
      goldMain: '#C5C6C7',
      goldDim: '#5C677D',
      goldGlow: 'rgba(197, 198, 199, 0.15)',
      accent: '#7AA7D9',
      accentGlow: 'rgba(122, 167, 217, 0.35)',
      accentText: '#B5C0D8',
      manaBlue: '#7AA7D9',
      semantic: {
        fortune: '#C5C6C7',
        curse: '#7A7F8A',
        mana: '#7AA7D9',
        exclusive: '#B5C0D8',
        trait: '#9CA2AD',
        skill: '#B5C0D8',
        status: '#A4BAC8',
        warning: '#C7A97A',
        void: '#D9E4F5'
      }
    }),
    commonValue: 0,
    exclusiveEnglishLabel: 'Void Signature',
    exclusiveChineseLabel: '零号痕',
    exclusiveValue: 0,
    poles: ['INERT ◄', '► OVERRIDE'],
    terms: [term('零号体质', 'exclusive'), term('不动心', 'exclusive')],
    traits: [
      trait('void_body', '零号体质', '主手', 'Lv.2', [
        '[常驻] 幸运效果 -20%。',
        '[每街] 首次受到 hostile Curse 或作用于自身的 Fortune 时，抹除该力量 30%。',
        '[转化] 被抹除力量值的 20% 直接进位为 Mana。'
      ].join('\n'), { svgId: 'kazu-card-1' }),
      trait('still_heart', '不动心', '副手', 'Lv.3', [
        '[常驻] 被动 Mana 回复 +4 / 回合。',
        '[前台] 前台角色受 Curse 伤害 -15%。',
        '[代价] 自身 Fortune 效果 -15%。',
        '[设计] 退到后台时提供更稳定的魔力支援与保守控盘。'
      ].join('\n'), { svgId: 'kazu-card-2' })
    ],
    skills: [
      skill('reality', '现实', 'T0', 'Void', 0, '1次/局', [
        '[主动/Void/T0/OVERRIDE] 清除所有非 Void 效果。',
        '[效果] 让本街局面回归纯随机基准。',
        '[限制] 整局限 1 次。'
      ].join('\n'), { svgId: 'kazu-card-3' }),
      skill('insulation', '绝缘', 'T0', 'Void', 0, '开关', [
        '[主动/Void/T0/TOGGLE] 不对称抑制命运场。',
        '[效果] 我方 Fortune -15% / Curse -35%。',
        '[效果] 敌方 Fortune -35% / Curse -15%。',
        '[设计] 偏保护与控场，不再是粗暴的全场腰斩。'
      ].join('\n'), { svgId: 'kazu-card-4' })
    ]
  }),
  rino: createCharacterBase({
    key: 'rino',
    dashboardState: { introduced: true, present: true, inParty: true },
    name: 'RINO',
    subtitle: 'The Deadlock Host',
    attribute: 'Moirai',
    level: 5,
    portraitUrl: 'https://files.catbox.moe/12p92p.png',
    avatarUrl: 'https://files.catbox.moe/2a05ay.png',
    suitSymbol: '♥',
    suitClass: 'heart',
    artStyle: {
      desktop: { width: '100%', height: '105%', bottom: '-8%', left: '55%', backgroundPosition: 'bottom center' },
      sheet: { scale: '1.01', height: '104%', bottom: '-9%', backgroundPosition: 'center bottom' }
    },
    summary: 'Rino 是失去王座后，仍死抓主位与命运解释权不放的旧支配者。',
    theme: makeTheme({
      goldMain: '#C7A64C',
      goldDim: '#7D6028',
      goldGlow: 'rgba(199, 166, 76, 0.14)',
      accent: '#7B57A0',
      accentGlow: 'rgba(123, 87, 160, 0.3)',
      accentText: '#D2B2EA',
      manaBlue: '#8F93D9',
      semantic: {
        fortune: '#E7C86E',
        curse: '#B56F88',
        mana: '#9397DC',
        exclusive: '#D2B2EA',
        trait: '#CDB760',
        skill: '#C298DE',
        status: '#9F91B8',
        warning: '#F49C67'
      }
    }),
    commonValue: 84,
    exclusiveEnglishLabel: 'Inversion',
    exclusiveChineseLabel: '反转度',
    exclusiveValue: 68,
    poles: ['NOMINAL MASTER ◄', '► DEPENDENCE'],
    roleState: roleState({
      chineseLabel: '主位偏移',
      score: 74,
      color: 'var(--semantic-exclusive)',
      phases: roleStatePhases.rino
    }),
    terms: [term('绝对天命', 'exclusive')],
    traits: [
      trait('crimson_crown', '天宫血统', '主手', 'Lv.2', [
        '[常驻] 自身 Fortune 效果 +35%。',
        '[代价] 受到的 Curse 效果 +20%。'
      ].join('\n')),
      trait('obsessive_love', '执念之爱', '副手', 'Lv.3', [
        '[常驻] 主手角色 Fortune 效果 +20%。',
        '[条件] 优势状态时，额外获得 Fortune(P15) · 1次/街。',
        '[条件] 劣势状态时，对敌方施加 Curse(P15) · 1次/街。'
      ].join('\n'))
    ],
    skills: [
      skill('royal_decree', '敕令', 'T0', 'Moirai', 25, '1次/局', [
        '[主动/Moirai/T0] 施加绝对天命 Fortune(P70)。',
        '[效果] 生效时压制敌方 T1 / T2 / T3 技能。',
        '[限制] 25 Mana · 1次/局。'
      ].join('\n')),
      skill('heart_read', '命运感知', 'T2', 'Psyche', 15, '1回合', [
        '[主动/T2] 读取目标的胜率、下注倾向与当前决策状态。',
        '[效果] 消除敌方 T3 / T2 Curse。',
        '[限制] 15 Mana · CD 1。'
      ].join('\n'))
    ]
  }),
  sia: createCharacterBase({
    key: 'sia',
    dashboardState: { introduced: false, present: false, inParty: false, activated: true },
    name: 'SIA',
    subtitle: 'The Quiet Custodian',
    attribute: 'Custody',
    level: 5,
    portraitUrl: 'https://files.catbox.moe/44dynm.png',
    avatarUrl: 'https://files.catbox.moe/sdngxk.png',
    suitSymbol: '♠',
    suitClass: 'spade',
    artStyle: {
      desktop: { width: '98%', height: '104%', bottom: '-4%', left: '51%', backgroundPosition: 'bottom center' },
      sheet: { scale: '1.08', height: '103%', bottom: '-12%', backgroundPosition: 'center bottom' }
    },
    summary: 'Sia 会先把人拖进一局冤家牌，再慢慢把退路和主动权一层层接过去。',
    theme: makeTheme({
      goldMain: '#B8C7D9',
      goldDim: '#667789',
      goldGlow: 'rgba(184, 199, 217, 0.15)',
      accent: '#7EC8E3',
      accentGlow: 'rgba(126, 200, 227, 0.35)',
      accentText: '#A9ECFF',
      manaBlue: '#80CFFF',
      semantic: {
        fortune: '#DCE7AA',
        curse: '#80A8D8',
        mana: '#7EC8E3',
        exclusive: '#A9ECFF',
        trait: '#C9D7E7',
        skill: '#7EC8E3',
        status: '#9AC0D1',
        warning: '#C7D982'
      }
    }),
    commonValue: 76,
    exclusiveEnglishLabel: 'Custody',
    exclusiveChineseLabel: '接管度',
    exclusiveValue: 62,
    poles: ['DUTY ◄', '► CUSTODY'],
    roleState: roleState({
      chineseLabel: '冤家牌链',
      score: 58,
      color: 'var(--semantic-mana)',
      phases: roleStatePhases.sia
    }),
    terms: [term('【冤家牌】', 'exclusive')],
    traits: [
      trait('death_ledger', '死亡账簿', '主手', 'Lv.2', [
        '[常驻] 自身 Curse 对目标的 Void 减伤与 Psyche 反制获得 15% 穿透。',
        '[条件] 若目标携带【冤家牌】，该次穿透额外 +15%。'
      ].join('\n'), { terms: [term('【冤家牌】')] }),
      trait('binding_protocol', '拘束协议', '副手', 'Lv.3', [
        '[常驻] 自身主动技能 Mana 消耗 -40%。',
        '[代价] 自身主动技能 Power -10%。'
      ].join('\n'))
    ],
    skills: [
      skill('cooler', '冤家牌', 'T2', 'Chaos', 18, '2回合', [
        '[主动/T2] 为目标附加【冤家牌】。',
        '[效果] 本手目标更易形成次优有效牌型，并遭遇高位压制。',
        '[限制] 18 Mana · CD 2。'
      ].join('\n'), { terms: [term('【冤家牌】')] }),
      skill('skill_seal', '冻结令', 'T2', 'Chaos', 20, '3回合', [
        '[主动/T2] 冻结目标主动技能 2 回合。',
        '[条件] 若目标携带【冤家牌】，持续时间额外 +1 回合。',
        '[限制] 20 Mana · CD 3。'
      ].join('\n'), { terms: [term('【冤家牌】')] })
    ]
  }),
  poppy: createCharacterBase({
    key: 'poppy',
    dashboardState: { introduced: false, present: false, inParty: false, activated: true },
    name: 'POPPY',
    subtitle: 'The Ruin Nestling',
    attribute: 'Nesting',
    level: 4,
    portraitUrl: 'https://files.catbox.moe/2jeu8x.png',
    avatarUrl: 'https://files.catbox.moe/vd3x9r.png',
    suitSymbol: '♣',
    suitClass: 'club',
    artStyle: {
      desktop: { scale: '0.94', height: '102%', bottom: '-5%', left: '54%', backgroundPosition: 'bottom center' },
      sheet: { scale: '0.95', height: '101%', bottom: '-5%', backgroundPosition: 'center bottom' }
    },
    summary: 'Poppy 的核心不是被爱，而是先靠命大和回捡把自己挂在局里活下来。',
    theme: makeTheme({
      goldMain: '#D7B66A',
      goldDim: '#8B6B2F',
      goldGlow: 'rgba(215, 182, 106, 0.16)',
      accent: '#97BE84',
      accentGlow: 'rgba(151, 190, 132, 0.28)',
      accentText: '#D7E7B3',
      manaBlue: '#8FBE94',
      semantic: {
        fortune: '#F3D56D',
        curse: '#D57C92',
        mana: '#8FBE94',
        exclusive: '#D7E7B3',
        trait: '#D7B66A',
        skill: '#B4D19A',
        status: '#B6B792',
        warning: '#F0A55D'
      }
    }),
    commonValue: 54,
    exclusiveEnglishLabel: 'Nesting',
    exclusiveChineseLabel: '寄生度',
    exclusiveValue: 47,
    poles: ['SCAVENGE ◄', '► NEST'],
    roleState: roleState({
      chineseLabel: '续命链',
      score: 52,
      color: 'var(--semantic-fortune)',
      phases: roleStatePhases.poppy
    }),
    terms: [term('【命大局】', 'exclusive')],
    traits: [
      trait('four_leaf_clover', '四叶草', '主手', 'Lv.2', [
        '[条件] 筹码 >150%：Fortune -15%，受 Curse +15%。',
        '[条件] 筹码 <100%：Fortune +15%，并获得常驻 Fortune(P5)。',
        '[条件] 筹码 ≤50%：Fortune +30%，并获得常驻 Fortune(P10)。'
      ].join('\n')),
      trait('cockroach', '不死身', '副手', 'Lv.3', [
        '[效果] 继续入局血线由 10% 降至 5%。',
        '[结算] 若本局结算时自身血线 ≤50%，回收本街全场总 Mana 消耗的 15%（上限 8），转为 Mana。',
        '[结算] 回收本街被 Psyche 转化的 Chaos 总值的 50%，转为 Fortune。'
      ].join('\n'))
    ],
    skills: [
      skill('lucky_find', '捡到了！', 'T2', 'Moirai', 5, '每街结算', [
        '[被动/T2] 每街结算时，按当前 Mana 值进行触发判定（上限 60%）。',
        '[成功] 获得 Fortune(P20)，并消耗 5 Mana。',
        '[限制] 1次/街。'
      ].join('\n')),
      skill('miracle', '命大', 'T0', 'Moirai', 0, '1次/局', [
        '[被动/T0] 本局首次进入 25% 血线后触发。',
        '[结算] 于下一手开始时，清空当前全部 Mana，并按 ×1.5 转化为持续 3 街的 Fortune。',
        '[状态] 进入【命大局】。'
      ].join('\n'), { terms: [term('【命大局】')] })
    ]
  }),
  vv: createCharacterBase({
    key: 'vv',
    dashboardState: { introduced: false, present: false, inParty: false, activated: true },
    name: 'Veblen',
    watermark: 'VEBLEN',
    subtitle: 'The Capital Ego',
    attribute: 'Majority Stake',
    level: 6,
    portraitUrl: 'https://files.catbox.moe/b4nt8h.png',
    avatarUrl: 'https://files.catbox.moe/2klui2.png',
    suitSymbol: '♦',
    suitClass: 'diamond',
    artStyle: {
      desktop: { scale: '1.02', height: '106%', bottom: '-6%', left: '54%', backgroundPosition: 'bottom center' },
      sheet: { scale: '1.04', height: '104%', bottom: '-7%', backgroundPosition: 'center bottom' }
    },
    summary: 'VV 看人的第一眼不是感情判断，而是估值、建仓和清算空间。',
    theme: makeTheme({
      goldMain: '#E0C37A',
      goldDim: '#92773A',
      goldGlow: 'rgba(224, 195, 122, 0.18)',
      accent: '#E74C3C',
      accentGlow: 'rgba(231, 76, 60, 0.28)',
      accentText: '#FFB2A9',
      manaBlue: '#E0C37A',
      semantic: {
        fortune: '#F0D387',
        curse: '#E07461',
        mana: '#E0C37A',
        exclusive: '#FFB2A9',
        trait: '#F0C56A',
        skill: '#F2A082',
        status: '#D4AD77',
        warning: '#FF9A62'
      }
    }),
    commonValue: 63,
    exclusiveEnglishLabel: 'Majority Stake',
    exclusiveChineseLabel: '控股度',
    exclusiveValue: 71,
    poles: ['VALUATION ◄', '► LOCKED POSITION'],
    roleState: roleState({
      chineseLabel: '建仓/清算',
      score: 67,
      color: 'var(--semantic-mana)',
      phases: roleStatePhases.vv
    }),
    terms: [
      term('【估价眼】'),
      term('【投资轮基准】'),
      term('【泡沫 Mana】'),
      term('【泡沫 Fortune】'),
      term('【泡沫 Chaos】'),
      term('【泡沫清算】')
    ],
    traits: [
      trait('laser_eye', '单片镜', '主手', 'Lv.2', [
        '[常驻] 发动【估价眼】时，必须同时选择建仓档位（1 / 2 / 3）与隐藏清算方向（增值 / 减值）。',
        '[效果] 档位越高，注入的泡沫资源越多；若方向错误，清算收益下降。'
      ].join('\n'), { svgId: 'veblen-trait-1', terms: [term('【估价眼】')] }),
      trait('service_fee', '手续费', '副手', 'Lv.3', [
        '[常驻] 任意角色通过主动技能获得 Fortune、Mana 或 Curse→Fortune 时，VV 抽取其中 12% 作为供血。',
        '[效果] 抽取的 Fortune 转为 VV 的 Fortune；抽取的 Mana 转为 VV 的 Mana。',
        '[限制] 单次最多抽取 10 Mana；【泡沫清算】不触发此效果。'
      ].join('\n'), { svgId: 'veblen-trait-2', terms: [term('【泡沫清算】')] })
    ],
    skills: [
      skill('clairvoyance', '估价眼', 'T2', 'Psyche', 12, '2回合', [
        '[主动/T2] 查看目标手牌与当前 Force 概况。',
        '[效果] 记录该目标的【投资轮基准】，并选择建仓档位与隐藏清算方向。',
        '[效果] 向目标注入等量【泡沫 Mana / 泡沫 Fortune / 泡沫 Chaos】；档位越高，注入越多。'
      ].join('\n'), {
        svgId: 'veblen-skill-1',
        terms: [term('【投资轮基准】'), term('【泡沫 Mana】'), term('【泡沫 Fortune】'), term('【泡沫 Chaos】')]
      }),
      skill('bubble_liquidation', '泡沫清算', 'T0', 'Chaos', 16, '1次/局', [
        '[主动/T0] 对目标当前投资轮执行统一清算。',
        '[判定] 根据目标相对【投资轮基准】的筹码份额变化，结算为增值偏离 / 减值偏离 / 0级偏离。',
        '[效果] 若方向命中，则按偏离等级放大回收或爆破收益；若错向或未形成偏离，则仅部分追回泡沫资源。'
      ].join('\n'), {
        svgId: 'veblen-skill-2',
        terms: [term('【投资轮基准】')]
      })
    ]
  }),
  trixie: createCharacterBase({
    key: 'trixie',
    dashboardState: { introduced: false, present: false, inParty: false, activated: true },
    name: 'TRIXIE',
    subtitle: 'The Causal Wreck',
    attribute: 'Mania',
    level: 6,
    portraitUrl: 'https://files.catbox.moe/1zmxdm.png',
    avatarUrl: 'https://files.catbox.moe/h1jb3g.png',
    suitSymbol: '🃏',
    suitClass: 'joker',
    artStyle: {
      desktop: { scale: '0.94', height: '106%', bottom: '-6%', left: '56%', backgroundPosition: 'bottom center' },
      sheet: { scale: '0.95', height: '104%', bottom: '-6%', left: '52%', backgroundPosition: 'center bottom' }
    },
    summary: 'Trixie 的乐子来自因果翻车，她会把 Fortune、Curse 和【鬼牌】搅成一锅。',
    theme: makeTheme({
      bgVoid: '#090806',
      goldMain: '#FFE27A',
      goldDim: '#D4B23A',
      goldGlow: 'rgba(255, 228, 122, 0.30)',
      nameColor: '#FFF9EE',
      nameGlow: 'rgba(255, 236, 160, 0.24)',
      pageGlow: 'rgba(255, 226, 110, 0.26)',
      panelEdge: 'rgba(255, 239, 170, 0.34)',
      watermarkStroke: 'rgba(255, 232, 150, 0.18)',
      accent: '#F3ECDD',
      accentGlow: 'rgba(190, 56, 170, 0.20)',
      accentText: '#FFF8EB',
      manaBlue: '#E0BF58',
      semantic: {
        fortune: '#FFE27A',
        curse: '#A93E8E',
        mana: '#E0BF58',
        exclusive: '#FFF8EB',
        trait: '#FFDF72',
        skill: '#FFE8A8',
        status: '#E1C46A',
        warning: '#C94DB4'
      }
    }),
    commonValue: 59,
    exclusiveEnglishLabel: 'Mania',
    exclusiveChineseLabel: '妄执度',
    exclusiveValue: 64,
    poles: ['PLAY ◄', '► RUIN'],
    roleState: roleState({
      chineseLabel: '鬼牌载荷',
      score: 61,
      color: 'var(--semantic-exclusive)',
      phases: roleStatePhases.trixie
    }),
    terms: [term('【鬼牌】')],
    traits: [
      trait('paradox_frame', '悖论体', '主手', 'Lv.2', [
        '[常驻] 本街承受的 Fortune +25%。',
        '[常驻] 本街承受的 Curse +25%。'
      ].join('\n')),
      trait('improvised_stage', '即兴表演', '副手', 'Lv.3', [
        '[条件] 若本街同时承受过 Fortune 与 Curse，且两者原始总值均 >40，【鬼牌】额外 +25。',
        '[条件] 若本街同时承受过 Fortune 与 Curse，且两者原始总值均 >80，【鬼牌】额外 +50。'
      ].join('\n'), { terms: [term('【鬼牌】')] })
    ],
    skills: [
      skill('rule_rewrite', '规则篡改', 'T2', 'Chaos', 10, '1回合', [
        '[主动/T2] 每街结束时，将本街承受的 Fortune 与 Curse 总值的 50%（↑）转为【鬼牌】。',
        '[效果] 消耗当前全部【鬼牌】作为 Power，转为自身 Fortune（×1）或对指定敌人施加 Curse（×1.33）。',
        '[限制] 10 Mana · CD 1。'
      ].join('\n'), { terms: [term('【鬼牌】')] }),
      skill('blind_box', '盲盒派对', 'T0', 'Chaos', 50, '1次/局', [
        '[主动/T0] 消耗整张【鬼牌】发动资源置换。',
        '[效果] 交换两名角色当前 50% 的筹码与 50% 的 Mana，持续 3 街或至本局结束。',
        '[限制] 50 Mana · 1次/局。'
      ].join('\n'), { terms: [term('【鬼牌】')] })
    ]
  }),
  eulalia: createCharacterBase({
    key: 'eulalia',
    dashboardState: { introduced: false, present: false, inParty: false, activated: true },
    name: 'EULALIA',
    subtitle: 'The Quiet Reliquary',
    attribute: 'Entrustment',
    level: 5,
    portraitUrl: 'https://files.catbox.moe/089l6s.png',
    avatarUrl: 'https://files.catbox.moe/3ctoga.png',
    suitSymbol: '♥',
    suitClass: 'heart',
    artStyle: {
      desktop: { width: '96%', height: '103%', bottom: '-3%', backgroundPosition: 'bottom center' },
      sheet: { width: 'min(86vw, 720px)', height: '102%', bottom: '-5%', backgroundPosition: 'center bottom' }
    },
    summary: 'Eulalia 会把痛苦、赦免与厄运都安放成可托付的结构。',
    theme: makeTheme({
      goldMain: '#E6DEC7',
      goldDim: '#958B6E',
      goldGlow: 'rgba(230, 222, 199, 0.16)',
      accent: '#A88CFF',
      accentGlow: 'rgba(168, 140, 255, 0.28)',
      accentText: '#D0C0FF',
      manaBlue: '#9EC5FF',
      semantic: {
        fortune: '#F4E1A8',
        curse: '#B794C4',
        mana: '#9EC5FF',
        exclusive: '#D0C0FF',
        trait: '#E8DFC8',
        skill: '#C6B4FF',
        status: '#C5B9D6',
        warning: '#E5A26C'
      }
    }),
    commonValue: 57,
    exclusiveEnglishLabel: 'Entrustment',
    exclusiveChineseLabel: '寄托度',
    exclusiveValue: 66,
    poles: ['PRAYER ◄', '► ENTRUSTMENT'],
    roleState: roleState({
      chineseLabel: '承灾链',
      score: 63,
      color: 'var(--semantic-exclusive)',
      phases: roleStatePhases.eulalia
    }),
    terms: [term('【名义厄运】'), term('【承灾值】'), term('【赦免】')],
    traits: [
      trait('martyr_frame', '殉道体质', '主手', 'Lv.2', [
        '[街开始] 按上一街继承的【名义厄运】分层。',
        '[效果] 每持有 10 点【名义厄运】，自身 Fortune 效果倍率 +0.15。',
        '[限制] 该层数仅对本街生效，不累积到下一街。'
      ].join('\n'), { terms: [term('【名义厄运】')] }),
      trait('sanctuary_core', '庇护所', '副手', 'Lv.3', [
        '[街开始] 按上一街继承的【名义厄运】分层。',
        '[效果] 每持有 10 点【名义厄运】，恢复 3 Mana。',
        '[限制] 该层数仅对本街生效，不累积到下一街。'
      ].join('\n'), { terms: [term('【名义厄运】')] })
    ],
    skills: [
      skill('absolution', '赦免', 'T0', 'Moirai', 35, '1次/局', [
        '[主动/T0] 吸取本街全场当前存在的 Curse，并在接下来的 2 街内继续接管新产生的 Curse，转为自身【承灾值】。',
        '[结算] 每街结束时，先承受本街【承灾值】的 50%；该值同时转为下一街的【名义厄运】。',
        '[终结] 第三街结束时，将赦免期间累计【承灾值】总值的 50% 平均分摊给其他在场角色。'
      ].join('\n'), { terms: [term('【承灾值】'), term('【名义厄运】')] }),
      skill('benediction', '祝福', 'T2', 'Moirai', 15, '1回合', [
        '[主动/T2] 指定一名非自身目标，施加 Fortune（P35 × 当前 Fortune 倍率）。',
        '[效果] 同时吸取该目标发出的 Curse 与其当前对手身上的 Curse，并记为 EULALIA 本街【承灾值】。',
        '[联动] 若处于【赦免】状态，该部分承灾同时计入累计【承灾值】。'
      ].join('\n'), { terms: [term('【承灾值】'), term('【赦免】')] })
    ]
  }),
  kako: createCharacterBase({
    key: 'kako',
    dashboardState: { introduced: false, present: false, inParty: false, activated: true },
    name: 'KAKO',
    subtitle: 'The Ledger Forger',
    attribute: 'Complicity',
    level: 5,
    portraitUrl: 'https://files.catbox.moe/dtjcqj.png',
    avatarUrl: 'https://files.catbox.moe/m8en9u.png',
    suitSymbol: '♠',
    suitClass: 'spade',
    artStyle: {
      desktop: { width: '97%', height: '104%', bottom: '-4%', backgroundPosition: 'bottom center' },
      sheet: { width: 'min(87vw, 725px)', height: '103%', bottom: '-6%', backgroundPosition: 'center bottom' }
    },
    summary: 'Kako 用档案、改判和红章，把包庇做成一种能落账的制度动作。',
    theme: makeTheme({
      bgVoid: '#161113',
      goldMain: '#E7E1D6',
      goldDim: '#6A5559',
      goldGlow: 'rgba(231, 225, 214, 0.14)',
      nameColor: '#F9EEE8',
      nameGlow: 'rgba(255, 226, 220, 0.05)',
      pageGlow: 'rgba(210, 56, 78, 0.16)',
      panelEdge: 'rgba(255, 214, 220, 0.14)',
      watermarkStroke: 'rgba(224, 78, 100, 0.14)',
      accent: '#C93A52',
      accentGlow: 'rgba(201, 58, 82, 0.12)',
      accentText: '#F3DBDE',
      manaBlue: '#A9AEB5',
      semantic: {
        fortune: '#EFE7D8',
        curse: '#C93A52',
        mana: '#A9AEB5',
        exclusive: '#F3DBDE',
        trait: '#D9D1C5',
        skill: '#DA6678',
        status: '#8E888C',
        warning: '#D98764'
      }
    }),
    commonValue: 52,
    exclusiveEnglishLabel: 'Complicity',
    exclusiveChineseLabel: '包庇度',
    exclusiveValue: 61,
    poles: ['PROTOCOL ◄', '► COVER-UP'],
    roleState: roleState({
      chineseLabel: '红章率',
      score: 56,
      color: 'var(--semantic-status)',
      phases: roleStatePhases.kako
    }),
    terms: [term('【红章】'), term('【红章率】'), term('【裁定时刻】')],
    traits: [
      trait('redline_file', '红线卷宗', '主手', 'Lv.2', [
        '[增幅] 对携带【红章】的目标发动技能时，本次效果额外获得 +33% × 当前【红章率】。'
      ].join('\n'), { terms: [term('【红章】'), term('【红章率】')] }),
      trait('signoff_flow', '签批流程', '副手', 'Lv.3', [
        '[街结算] 每街结束时，恢复 Mana = ⌈当前【红章率】 × 6⌉。'
      ].join('\n'), { terms: [term('【红章率】')] })
    ],
    skills: [
      skill('reclassification', '改判', 'T2', 'Psyche', 16, '1回合', [
        '[主动/T2] 对目标插入一次发牌前【裁定时刻】，仅审查其本街主动技能新增的 Fortune / Curse。',
        '[条件] 无【红章】时，自动裁定较高项（同值优先 Curse）。',
        '[条件] 有【红章】时，可自选裁定 Fortune 或 Curse。'
      ].join('\n'), { terms: [term('【裁定时刻】'), term('【红章】')] }),
      skill('general_ruling', '总务裁定', 'T1', 'Psyche', 36, '1次/局', [
        '[主动/T1] 立即对全场所有携带【红章】的目标执行一次统一裁定。',
        '[方向] 可指定本次总务方向为“统一通过”或“统一不通过”，并选择作用类型（Fortune / Curse）。',
        '[增幅] 所有裁定均享受【红线卷宗】增幅。'
      ].join('\n'), { terms: [term('【红章】')] })
    ]
  }),
  cota: createCharacterBase({
    key: 'cota',
    dashboardState: { introduced: false, present: false, inParty: false, activated: true },
    name: 'COTA',
    subtitle: 'The Soft Retention',
    attribute: 'Retention',
    level: 4,
    portraitUrl: 'https://files.catbox.moe/m0w5dt.png',
    avatarUrl: 'https://files.catbox.moe/i2zzui.png',
    suitSymbol: '♦',
    suitClass: 'diamond',
    artStyle: {
      desktop: { scale: '0.97', height: '102%', bottom: '-3%', left: '54%', backgroundPosition: 'bottom center' },
      sheet: { scale: '0.97', height: '101%', bottom: '-4%', backgroundPosition: 'center bottom' }
    },
    summary: 'Cota 把保留和整理做成一列会出故障的牌组，温柔里带着可控爆裂。',
    theme: makeTheme({
      bgVoid: '#171113',
      goldMain: '#D7B48E',
      goldDim: '#A47A66',
      goldGlow: 'rgba(215, 180, 142, 0.16)',
      nameColor: '#FFF7F8',
      nameGlow: 'rgba(255, 228, 240, 0.12)',
      pageGlow: 'rgba(222, 142, 172, 0.18)',
      panelEdge: 'rgba(233, 183, 199, 0.16)',
      watermarkStroke: 'rgba(216, 142, 170, 0.14)',
      accent: '#D48DA9',
      accentGlow: 'rgba(212, 141, 169, 0.24)',
      accentText: '#EDBFD0',
      manaBlue: '#D7A8B8',
      semantic: {
        fortune: '#E5C49F',
        curse: '#CD7E9C',
        mana: '#D7A8B8',
        exclusive: '#EDBFD0',
        trait: '#DFC1B3',
        skill: '#E3A8BD',
        status: '#C9A2AE',
        warning: '#E0A14F'
      }
    }),
    commonValue: 48,
    exclusiveEnglishLabel: 'Retention',
    exclusiveChineseLabel: '留存度',
    exclusiveValue: 58,
    poles: ['FLOW ◄', '► RETENTION'],
    roleState: roleState({
      chineseLabel: '牌列状态',
      score: 69,
      color: 'var(--semantic-warning)',
      phases: roleStatePhases.cota
    }),
    terms: [
      term('【收牌】'),
      term('【铺牌】'),
      term('【发牌】'),
      term('【故障态】', 'warning'),
      term('【爆牌】', 'warning'),
      term('吉牌', 'status'),
      term('厄牌', 'status'),
      term('杂牌', 'warning')
    ],
    traits: [
      trait('contract_template', '契约模板', '主手', 'Lv.2', [
        '[效果] 执行【收牌】或【铺牌】后，所有吉牌 / 厄牌额外获得 +1 基础点数。',
        '[增幅] 若当前牌列中存在 2 张及以上同类牌，则该类牌结算效果额外 +15%。'
      ].join('\n'), { terms: [term('【收牌】'), term('【铺牌】'), term('吉牌', 'status'), term('厄牌', 'status')] }),
      trait('dealer_hands_fault', '发牌员失误', '副手', 'Lv.3', [
        '[故障态] 牌列中存在杂牌时自动进入；杂牌清空后退出。',
        '[效果] 进入【故障态】时基础爆牌率为 10%；在【故障态】下，每次执行【发牌】/【收牌】/【铺牌】后，爆牌率额外 +10%。',
        '[爆牌] 触发时，所有在场牌立即结算并清空。'
      ].join('\n'), {
        terms: [term('【故障态】', 'warning'), term('【发牌】'), term('【收牌】'), term('【铺牌】'), term('杂牌', 'warning')]
      })
    ],
    skills: [
      skill('deal_card', '发牌', 'T2', 'Psyche', 8, '每街1次', [
        '[主动/T2] 向一个空牌槽发入 1 张功能牌：吉牌 / 厄牌 / 杂牌。',
        '[牌列] 发入后的牌会作为常驻资产保留，不会在手牌结算后自动消失；仅在爆牌清空或后续整理时移除。',
        '[限制] 1次/街 · 8 Mana · CD 0。'
      ].join('\n'), { terms: [term('吉牌', 'status'), term('厄牌', 'status'), term('杂牌', 'warning')] }),
      skill('gather_or_spread', '收牌 / 铺牌', 'T2', 'Psyche', 10, '1回合', [
        '[主动/T2] 选择执行【收牌】或【铺牌】。',
        '[收牌] 牌槽 -1；全牌基础点数 +6；结算 Mana 消耗 +2。',
        '[铺牌] 牌槽 +1；全牌基础点数 -3；结算 Mana 消耗 -1。'
      ].join('\n'), { terms: [term('【收牌】'), term('【铺牌】')] })
    ]
  }),
  kuzuha: createCharacterBase({
    key: 'kuzuha',
    dashboardState: { introduced: false, present: false, inParty: false, activated: true },
    name: 'KUZUHA',
    subtitle: 'The Gentle Gravity',
    attribute: 'Debtbind',
    level: 5,
    portraitUrl: 'https://files.catbox.moe/v8wbu4.png',
    avatarUrl: 'https://files.catbox.moe/hwptuk.png',
    suitSymbol: '♦♣',
    suitClass: 'mixed',
    artStyle: {
      desktop: { scale: '1.03', height: '104%', bottom: '-2%', left: '54%', backgroundPosition: 'bottom center' },
      sheet: { scale: '1.04', height: '103%', bottom: '-3%', backgroundPosition: 'center bottom' }
    },
    summary: 'Kuzuha 给你的好处会慢慢长成账，账又会慢慢长成人情重力。',
    theme: makeTheme({
      goldMain: '#D6B980',
      goldDim: '#8A6B32',
      goldGlow: 'rgba(214, 185, 128, 0.17)',
      accent: '#C46B6B',
      accentGlow: 'rgba(196, 107, 107, 0.28)',
      accentText: '#F0B6B6',
      manaBlue: '#D59D6A',
      semantic: {
        fortune: '#E7C878',
        curse: '#C46B6B',
        mana: '#D59D6A',
        exclusive: '#F0B6B6',
        trait: '#D8BD88',
        skill: '#E7B07A',
        status: '#C49778',
        warning: '#F0A75B'
      }
    }),
    commonValue: 66,
    exclusiveEnglishLabel: 'Debtbind',
    exclusiveChineseLabel: '债缚度',
    exclusiveValue: 72,
    poles: ['SHELTER ◄', '► BIND'],
    roleState: roleState({
      chineseLabel: '债蚀压力',
      score: 64,
      color: 'var(--semantic-curse)',
      phases: roleStatePhases.kuzuha
    }),
    terms: [term('【债蚀】')],
    traits: [
      trait('house_tab', '赌场规矩', '主手', 'Lv.2', [
        '[效果] KUZUHA 对敌方施加 Fortune 或 Curse 时：若目标当前无【债蚀】，额外附加【债蚀】+8。',
        '[效果] 若目标已持有【债蚀】，则本次效果的 25%（↑）转化为额外【债蚀】。'
      ].join('\n'), { terms: [term('【债蚀】')] }),
      trait('grace_period', '人情账簿', '副手', 'Lv.3', [
        '[街结算] 所有持有【债蚀】的敌方先结算债蚀。',
        '[效果] KUZUHA 恢复 Mana = ⌈本街【债蚀】实际结算总值 × 12%⌉。',
        '[条件] 若本街至少有 1 名目标【债蚀】≥40，额外获得 Fortune(P8)。'
      ].join('\n'), { terms: [term('【债蚀】')] })
    ],
    skills: [
      skill('house_edge', '抽水', 'T2', 'Chaos', 18, '1回合', [
        '[主动/T2] 对指定敌方施加 Curse(P18)，并附加【债蚀】。',
        '[债蚀] 目标无【债蚀】时附加 +12；目标已有【债蚀】时改为附加 +18。',
        '[限制] 18 Mana · CD 1。'
      ].join('\n'), { terms: [term('【债蚀】')] }),
      skill('debt_call', '催收', 'T1', 'Chaos', 34, '3回合', [
        '[主动/T1] 对持有【债蚀】的敌方执行立即催收。',
        '[兑现] 以当前【债蚀】总值为基准，其中 66% 立即结算为 Curse，同时其中 66% 转化为 KUZUHA 的 Fortune。',
        '[效果] 结算后，该目标【债蚀】减少 66%，剩余部分继续保留。'
      ].join('\n'), { terms: [term('【债蚀】')] })
    ]
  })
};

window.activeDashboardCharacter = 'rino';
