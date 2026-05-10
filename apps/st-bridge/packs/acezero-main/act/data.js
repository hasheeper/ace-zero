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
      minNodeIndex: 5,
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
      minNodeIndex: 7,
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
      minNodeIndex: 4,
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
      minNodeIndex: 4,
      optionalGeo: ['THE_EXCHANGE', 'THE_COURT', 'THE_STREET'],
      requiredTags: ['赌场', 'casino', 'gambling hall', 'gambling_hall', '赌桌', 'card_table', '荷官', 'dealer'],
      laneWeights: ['mid_high', 'high', 'low', 'mid_low'],
      priority: 38,
      rarity: 1,
      debugLabel: 'COTA / table contact',
      firstMeetHint: 'COTA 首次在主角视野里出现。她依附赌场、赌桌或荷官场景，不要写成已经熟悉的联系人。'
    },
    VV: {
      category: 'hybrid',
      minNodeIndex: 9,
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
      minNodeIndex: 7,
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
      minNodeIndex: 10,
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
      minNodeIndex: 11,
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
      joinParty: ['RINO'],
      miniKnown: ['COTA']
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
        subtitle: 'ENTRY NIGHT'
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
      narrative: {
        title: 'ENTRY NIGHT',
        subtitle: '进场弄钱',
        overview: '{{user}} 和 RINO 还在中市，但手里快没钱了。这节的任务就是进赌场，而且目的很明确：必须赢钱，越多越好。',
        guidance: '交代开场。写清楚中市赌场的环境长什么样，以及两人今晚就是来弄钱的，禁止牵扯其他剧情。'
      },
      phases: [
        {
          index: 0,
          slot: null,
          fixed: false,
          cast: { present: ['RINO'] },
          event: {
            id: 'entry_target',
            title: '节点1 · 一段 · 今晚的目标',
            direction: '从赌场外或者刚进门的地方开始。让 RINO 交代今晚的任务：必须赢一笔能接着用的本钱，不然明天连站在这层的资格都没了。说完就带 {{user}} 进场。',
            castDirective: '主角 / RINO。',
            mustEnd: '要赢钱的目标讲明白，然后进赌场，必须发生在中市层。'
          }
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
        subtitle: 'HOT FLOOR'
      },
      next: { mode: 'forced', nodeId: 'node3-descent' },
      cast: {
        onEnter: {
          present: ['RINO']
        }
      },
      narrative: {
        title: 'HOT FLOOR',
        subtitle: '上桌连赢',
        overview: 'RINO 带着 {{user}} 在赌场里换着桌子玩。主打德州，中间穿插小游戏。RINO 负责看桌子、算钱、催进度。',
        guidance: '真打牌赢钱。不要让 RINO 要算账、挑肥点的人下手，剧情主要围着赢钱转。'
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
        subtitle: 'SIDE MACHINES'
      },
      next: { mode: 'forced', nodeId: 'node3-descent' },
      cast: {
        onEnter: {
          present: ['RINO']
        }
      },
      narrative: {
        title: 'SIDE MACHINES',
        subtitle: '小游戏区',
        overview: 'RINO 没有一头扎进最热的大桌，而是带着 {{user}} 先从侧厅、小游戏区和更容易快进快出的台子里捞钱。',
        guidance: '把这一条写得更像“小游戏区”的快节奏路线。节奏相对快，RINO 会根据台子状态和人群热度不断换位置。'
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
        subtitle: 'LAST RECEIPT'
      },
      next: { mode: 'none' },
      cast: {
        onEnter: {
          present: ['RINO']
        }
      },
      narrative: {
        title: 'LAST RECEIPT',
        subtitle: '算账走人',
        overview: '到此为止手上应该有一定启动资金了，接下来不该继续困在中市里，而是顺着这笔钱往更深处走。',
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
          cast: { present: ['RINO'] },
          event: {
            id: 'descent_drop',
            title: '节点3 · 三段 · 往下走',
            direction: '把场景放在散场后的柜台、走廊或者门口。RINO 清点刚才赢的钱，发现中市太贵，各种名目的杂费和规矩很快就能把这笔钱扣完。她直接决定离开中市，让 {{user}} 跟着她往下层走。',
            castDirective: '主角 / RINO。',
            mustEnd: '写完两人决定去下层并开始离开的经过，后续沿着下行路线继续推进。'
          }
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
    title: 'EXCHANGE NIGHT',
    charter: {
      theme: '两人今晚在中市赌场，任务就是上桌弄一笔起步金。环境是金碧辉煌但处处要收钱的高级赌城。',
      ironLaws: [
        '德州扑克和小游戏要有具体的对局过程。',
        'RINO 负责带路挑桌，她清楚留下来的花销很高。'
      ],
      successCriterion: '赢到起步金，并顺着离开中市后的路线继续向下推进。',
      bounds: {
        focus: '赌桌对决、RINO 的本色发挥以及筹码的变化。',
        forbid: [
          '牵扯任何大阴谋或拯救世界',
          '让其他主要角色出场',
          '跑到中市外面去'
        ],
        closeWhen: [
          '玩过德州和小游戏',
          '手里的钱变多了',
          '离开中市的路线真正跑起来了'
        ]
      }
    },

    stageGuides: {
      executing: '按 [命运事件] 写这一段。RINO 得一直在场。只有当事情真的有进展，比如真的赢了钱、真的弄清了花费、真的定了去哪，才推进进度；如果只是瞎聊或者没变化，就不要推进，继续写。到了结局就果断收尾，不往下多写。',
      route: '初章前半段在第二节点进入赌场路线分支；后半段会进入由种子生成的后续路径。若进入 route，只在当前节点给出的候选路径里选定一路继续写。',
      complete: '初章完成时，必须收在整条 24 节点路线的最终收束点上。'
    }
  }
};

  global.ACE0ActPluginData = Object.assign({}, global.ACE0ActPluginData || {}, {
    ENCOUNTER_RULES,
    DEFAULT_WORLD_ACT,
    PROLOGUE_EXCHANGE_CHAPTER
  });
})(typeof window !== 'undefined' ? window : globalThis);
