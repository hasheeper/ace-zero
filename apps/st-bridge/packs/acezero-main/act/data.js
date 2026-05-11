/**
 * AceZero ACT plugin static data.
 *
 * Loaded before act/plugin.js by st-bridge manifest. Keep large, mostly
 * declarative campaign/encounter data here so the runtime plugin remains easier
 * to navigate.
 */
(function installAceZeroActPluginData(global) {
  'use strict';

  const DEFAULT_CHAPTER_ID = 'chapter0_exchange';
  const SHARED_CAMPAIGN_SEED = 'ACEZERO-SHARD-SEED-V24';

const ENCOUNTER_RULES = {
    SIA: {
      category: 'condition',
      minNodeIndex: 2,
      spentWeights: { combat: 2, rest: 1, asset: 1, vision: 2 },
      minSpentScore: 9,
      laneWeights: ['mid_low', 'low', 'mid_high', 'high'],
      priority: 20,
      rarity: 2,
      debugLabel: 'SIA / anomaly audit',
      firstMeetHint: 'SIA 首次在主角视野里具象化。她不是旧识，也不是熟络同伴；她带着管理局式的冷静，把当前异常行动纳入审视。'
    },
    TRIXIE: {
      category: 'condition',
      minNodeIndex: 4,
      spentWeights: { combat: 5, rest: 0, asset: 0, vision: 1 },
      minSpentScore: 26,
      laneWeights: ['low', 'mid_low', 'mid_high', 'high'],
      priority: 30,
      rarity: 4,
      debugLabel: 'TRIXIE / combat noise',
      firstMeetHint: 'TRIXIE 首次在主角视野里出现。她像从混乱规则的缝里钻出来，不要写成早已认识的玩笑伙伴。'
    },
    POPPY: {
      category: 'geo',
      minNodeIndex: 1,
      minFunds: 51,
      requiredGeo: 'THE_RUST',
      laneWeights: ['mid_low', 'low', 'mid_high', 'high'],
      priority: 40,
      rarity: 1,
      debugLabel: 'POPPY / rust contact',
      firstMeetHint: 'POPPY 首次在主角视野里出现。她属于底层生态，不是旧识；她的出现应像玩家踩进了她的活动范围。'
    },
    COTA: {
      category: 'geo',
      minNodeIndex: 1,
      optionalGeo: ['THE_EXCHANGE', 'THE_COURT', 'THE_STREET'],
      requiredTags: ['赌场', 'casino', 'gambling hall', 'gambling_hall', '赌桌', 'card_table', '荷官', 'dealer', '中市'],
      spentWeights: { combat: 2, rest: 2, asset: 2, vision: 2 },
      laneWeights: ['mid_high', 'high', 'low', 'mid_low'],
      priority: 170,
      rarity: 1,
      debugLabel: 'COTA / table contact',
      firstMeetHint: 'COTA 首次在主角视野里出现。她依附赌场、赌桌或荷官场景，不要写成已经熟悉的联系人。'
    },
    VV: {
      category: 'hybrid',
      minNodeIndex: 6,
      minFunds: 2501,
      spentWeights: { combat: 1, rest: 2, asset: 3, vision: 2 },
      minSpentScore: 32,
      laneWeights: ['mid_high', 'high', 'mid_low', 'low'],
      preSignalPreferred: true,
      priority: 25,
      rarity: 3,
      debugLabel: 'VV / asset signal',
      preSignalHint: 'VV 的估值信号先出现：有人开始从资产、赔率和风险角度观察主角，但这还不是正式会面。',
      firstMeetHint: 'VV 首次在主角视野里出现。她以估值、套利与风险的方式看人，不要写成旧交或熟络商谈。'
    },
    KUZUHA: {
      category: 'hybrid',
      minNodeIndex: 4,
      requiredGeo: 'THE_RUST',
      requiredCharacters: ['POPPY'],
      spentWeights: { combat: 2, rest: 2, asset: 1, vision: 2 },
      minSpentScore: 18,
      laneWeights: ['mid_low', 'low', 'high', 'mid_high'],
      priority: 28,
      rarity: 3,
      debugLabel: 'KUZUHA / rust order',
      firstMeetHint: 'KUZUHA 首次在主角视野里出现。她代表底层秩序与地盘规矩，不要写成已加入队伍的熟人。'
    },
    KAKO: {
      category: 'hybrid',
      minNodeIndex: 7,
      requiredCharacters: ['SIA'],
      spentWeights: { combat: 4, rest: 1, asset: 1, vision: 3 },
      minSpentScore: 38,
      laneWeights: ['mid_low', 'mid_high', 'high', 'low'],
      priority: 26,
      rarity: 4,
      debugLabel: 'KAKO / audit escalation',
      preSignalPreferred: true,
      preSignalHint: 'KAKO 的审计前兆出现：管理局视线升级，但她本人尚未正式进入主角关系网。',
      firstMeetHint: 'KAKO 首次在主角视野里出现。她是管理局审计升级的具象化，不要写成 SIA 之外的既有熟人。'
    },
    EULALIA: {
      category: 'hybrid',
      minNodeIndex: 8,
      spentWeights: { combat: 1, rest: 4, asset: 1, vision: 2 },
      minSpentScore: 36,
      requiredFlags: ['church_event_triggered'],
      requiredAny: [
        { requiredCharacters: ['VV'] },
        { minSpentScore: 42 }
      ],
      laneWeights: ['high', 'mid_high', 'mid_low', 'low'],
      priority: 22,
      rarity: 5,
      debugLabel: 'EULALIA / church signal',
      preSignalPreferred: true,
      preSignalHint: 'EULALIA 的教廷前置信号出现：像是仪式、委托或凝视先抵达，不要直接写成正式相识。',
      firstMeetHint: 'EULALIA 首次在主角视野里出现。她必须带着教廷事件的包裹感，不要裸刷成普通路人。'
    }
  };

const DEFAULT_WORLD_ACT = {
    id: DEFAULT_CHAPTER_ID,
    seed: 'AUTO',
    // 节点序列索引（1..totalNodes）——与世界时钟 world.current_time 无关
    nodeIndex: 1,
    route_history: [],
    limited: {
      combat: 0,
      rest: 0,
      asset: 0,
      vision: 0
    },
    reserve: {
      combat: 0,
      rest: 0,
      asset: 0,
      vision: 0
    },
    reserve_progress: {
      combat: 0,
      rest: 0,
      asset: 0,
      vision: 0
    },
    income_rate: {
      combat: 0.2,
      rest: 0.2,
      asset: 0.2,
      vision: 0.2
    },
    income_progress: {
      combat: 0,
      rest: 0,
      asset: 0,
      vision: 0
    },
    phase_slots: [null, null, null, null],
    phase_index: 0,
    phase_advance: 0,
    phasePlanLock: {
      nodeId: '',
      nodeIndex: 0,
      locked: false,
      confirmedPhaseIndex: 0
    },
    eventTree: {
      nodeGoals: {
        current: { goal: '', tendency: '' },
        next: { goal: '', tendency: '' }
      },
      phaseWindow: {
        nodeId: '',
        phases: []
      }
    },
    stage: 'executing',
    controlledNodes: {},
    vision: {
      baseSight: 1,
      bonusSight: 0,
      jumpReady: false,
      pendingReplace: null
    },
    resourceSpent: {
      combat: 0,
      rest: 0,
      asset: 0,
      vision: 0
    },
    characterEncounter: {},
    pendingResolutions: [],
    pendingAssetDeckCommands: [],
    resolutionHistory: [],
    narrativeTension: 0
  };

const PROLOGUE_EXCHANGE_CHAPTER = {
  id: 'chapter0_exchange',
  meta: {
    title: '命运 · FATE SPREAD',
    totalNodes: 24
  },

  runtime: {
    seed: SHARED_CAMPAIGN_SEED,
    rules: {
      requireScheduleAllLimited: true,
      reserveGrowthTiming: 'end_of_node'
    },
    initialState: {
      seed: SHARED_CAMPAIGN_SEED,
      route_history: ['node1-entry'],
      stage: 'executing'
    },
    generatedTail: {
      enabled: true,
      mode: 'lane_backbone',
      attachFromNodeIds: ['node3-descent'],
      startNodeIndex: 4,
      totalNodes: 24,
      laneNodeIndex: {
        opening: 4,
        fullLaneStart: 5,
        fullLaneEnd: 22,
        collapse: 23,
        finale: 24
      }
    },
    reserveGrowthByNode: [],
    managedCharacters: ['RINO', 'COTA'],
    initialCast: {
      activate: ['RINO'],
      introduce: ['RINO'],
      present: ['RINO'],
      joinParty: ['RINO']
    }
  },

  nodes: {
    'node1-entry': {
      id: 'node1-entry',
      nodeIndex: 1,
      kind: 'random',
      key: 'random',
      ui: {
        label: 'NODE_01',
        subtitle: 'OPENING'
      },
      next: {
        mode: 'choice',
        options: ['node2-floor-high', 'node2-floor-side']
      },
      cast: {
        onEnter: {
          present: ['RINO']
        }
      },
      phases: [
        {
          index: 0,
          slot: null,
          fixed: false,
          cast: { present: ['RINO'] }
        },
        {
          index: 1,
          slot: null,
          fixed: false
        },
        {
          index: 2,
          slot: null,
          fixed: false
        },
        {
          index: 3,
          slot: null,
          fixed: false
        }
      ]
    },

    'node2-floor-high': {
      id: 'node2-floor-high',
      nodeIndex: 2,
      kind: 'random',
      key: 'random',
      ui: {
        label: 'NODE_02_A',
        subtitle: 'ROUTE A'
      },
      next: { mode: 'forced', nodeId: 'node3-descent' },
      cast: {
        onEnter: {
          present: ['RINO']
        }
      },
      phases: [
        {
          index: 0,
          slot: null,
          fixed: false
        },
        {
          index: 1,
          slot: null,
          fixed: false
        },
        {
          index: 2,
          slot: null,
          fixed: false
        },
        {
          index: 3,
          slot: null,
          fixed: false
        }
      ]
    },

    'node2-floor-side': {
      id: 'node2-floor-side',
      nodeIndex: 2,
      kind: 'random',
      key: 'random',
      ui: {
        label: 'NODE_02_B',
        subtitle: 'ROUTE B'
      },
      next: { mode: 'forced', nodeId: 'node3-descent' },
      cast: {
        onEnter: {
          present: ['RINO']
        }
      },
      phases: [
        {
          index: 0,
          slot: null,
          fixed: false
        },
        {
          index: 1,
          slot: null,
          fixed: false
        },
        {
          index: 2,
          slot: null,
          fixed: false
        },
        {
          index: 3,
          slot: null,
          fixed: false
        }
      ]
    },

    'node3-descent': {
      id: 'node3-descent',
      nodeIndex: 3,
      kind: 'random',
      key: 'random',
      ui: {
        label: 'NODE_03',
        subtitle: 'ANCHOR'
      },
      next: { mode: 'none' },
      cast: {
        onEnter: {
          present: ['RINO']
        }
      },
      phases: [
        {
          index: 0,
          slot: null,
          fixed: false
        },
        {
          index: 1,
          slot: null,
          fixed: false
        },
        {
          index: 2,
          slot: null,
          fixed: false,
          cast: { present: ['RINO'] }
        },
        {
          index: 3,
          slot: null,
          fixed: false
        }
      ]
    }
  },

  narrative: {
    title: 'ACT ROUTE',
    stageGuides: {
      executing: '',
      route: '进入选路相时，只在当前节点给出的候选路径里选定一路继续写。',
      complete: '章节完成时，收在整条路线的最终收束点上。'
    }
  }
};

  global.ACE0ActPluginData = Object.assign({}, global.ACE0ActPluginData || {}, {
    ENCOUNTER_RULES,
    DEFAULT_WORLD_ACT,
    PROLOGUE_EXCHANGE_CHAPTER
  });
})(typeof window !== 'undefined' ? window : globalThis);
