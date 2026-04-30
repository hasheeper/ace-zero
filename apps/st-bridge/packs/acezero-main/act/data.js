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
      minDay: 3,
      minNodeIndex: 5,
      spentWeights: { combat: 2, rest: 1, asset: 1, vision: 2 },
      minSpentScore: 15,
      laneWeights: ['mid_low', 'low', 'mid_high', 'high'],
      rarity: 2,
      debugLabel: 'SIA / anomaly audit',
      firstMeetHint: 'SIA 首次在主角视野里具象化。她不是旧识，也不是熟络同伴；她带着管理局式的冷静，把当前异常行动纳入审视。'
    },
    TRIXIE: {
      category: 'condition',
      minDay: 3,
      minNodeIndex: 7,
      spentWeights: { combat: 5, rest: 0, asset: 0, vision: 1 },
      minSpentScore: 35,
      crisisMin: 26,
      laneWeights: ['low', 'mid_low', 'mid_high', 'high'],
      rarity: 4,
      debugLabel: 'TRIXIE / crisis noise',
      firstMeetHint: 'TRIXIE 首次在主角视野里出现。她像从混乱规则的缝里钻出来，不要写成早已认识的玩笑伙伴。'
    },
    POPPY: {
      category: 'geo',
      minNodeIndex: 4,
      minFunds: 51,
      requiredGeo: 'THE_RUST',
      laneWeights: ['mid_low', 'low', 'mid_high', 'high'],
      rarity: 1,
      debugLabel: 'POPPY / rust contact',
      firstMeetHint: 'POPPY 首次在主角视野里出现。她属于底层生态，不是旧识；她的出现应像玩家踩进了她的活动范围。'
    },
    COTA: {
      category: 'geo',
      minNodeIndex: 4,
      requiredTags: ['赌场', 'casino', 'gambling hall', '赌桌', '荷官'],
      laneWeights: ['mid_high', 'high', 'low', 'mid_low'],
      rarity: 1,
      debugLabel: 'COTA / table contact',
      firstMeetHint: 'COTA 首次在主角视野里出现。她依附赌场、赌桌或荷官场景，不要写成已经熟悉的联系人。'
    },
    VV: {
      category: 'hybrid',
      minDay: 4,
      minNodeIndex: 9,
      minFunds: 2501,
      spentWeights: { combat: 1, rest: 2, asset: 3, vision: 2 },
      minSpentScore: 45,
      crisisMin: 26,
      laneWeights: ['mid_high', 'high', 'mid_low', 'low'],
      preSignalPreferred: true,
      rarity: 3,
      debugLabel: 'VV / asset signal',
      firstMeetHint: 'VV 首次在主角视野里出现。她以估值、套利与风险的方式看人，不要写成旧交或熟络商谈。'
    },
    KUZUHA: {
      category: 'hybrid',
      minDay: 3,
      minNodeIndex: 7,
      requiredGeo: 'THE_RUST',
      requiredIntroduced: ['POPPY'],
      spentWeights: { combat: 2, rest: 2, asset: 1, vision: 2 },
      minSpentScore: 30,
      laneWeights: ['mid_low', 'low', 'high', 'mid_high'],
      rarity: 3,
      debugLabel: 'KUZUHA / rust order',
      firstMeetHint: 'KUZUHA 首次在主角视野里出现。她代表底层秩序与地盘规矩，不要写成已加入队伍的熟人。'
    },
    KAKO: {
      category: 'hybrid',
      minDay: 4,
      minNodeIndex: 10,
      requiredIntroduced: ['SIA'],
      spentWeights: { combat: 4, rest: 1, asset: 1, vision: 3 },
      minSpentScore: 50,
      crisisMin: 36,
      laneWeights: ['mid_low', 'mid_high', 'high', 'low'],
      rarity: 4,
      debugLabel: 'KAKO / audit escalation',
      firstMeetHint: 'KAKO 首次在主角视野里出现。她是管理局审计升级的具象化，不要写成 SIA 之外的既有熟人。'
    },
    EULALIA: {
      category: 'hybrid',
      minDay: 5,
      minNodeIndex: 11,
      spentWeights: { combat: 1, rest: 4, asset: 1, vision: 2 },
      minSpentScore: 60,
      requiresChurchEvent: true,
      laneWeights: ['high', 'mid_high', 'mid_low', 'low'],
      rarity: 5,
      debugLabel: 'EULALIA / church signal',
      firstMeetHint: 'EULALIA 首次在主角视野里出现。她必须带着教廷事件的包裹感，不要裸刷成普通路人。'
    }
  };

const DEFAULT_WORLD_ACT = {
    id: DEFAULT_CHAPTER_ID,
    seed: 'AUTO',
    // 节点序列索引（1..totalNodes）——与世界时钟 world.current_time 无关
    nodeIndex: 1,
    // 随机池消耗记录：{ [nodeId]: { [phaseIndex]: candidateId } }
    pickedPacks: {},
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
    crisis: 0,
    crisisSignals: [],
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
    pendingFirstMeet: {},
    pendingResolutions: [],
    resolutionHistory: [],
    narrativeTension: 0
  };

const PROLOGUE_EXCHANGE_CHAPTER = {
  id: 'chapter0_exchange',
  meta: {
    title: '命运 · FATE SPREAD',
    totalNodes: 16
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
      totalNodes: 16,
      laneNodeIndex: {
        opening: 4,
        fullLaneStart: 5,
        fullLaneEnd: 14,
        collapse: 15,
        finale: 16
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
      kind: 'vision',
      key: 'vision',
      ui: {
        label: 'NODE_01',
        subtitle: 'ENTRY NIGHT'
      },
      rewards: { vision: 1, combat: 1 },
      planner: {
        limited: []
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
          slot: 'vision',
          fixed: true,
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
      rewards: { combat: 1, vision: 1 },
      planner: {
        limited: []
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
      rewards: { vision: 1, combat: 1 },
      planner: {
        limited: []
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
      kind: 'vision',
      key: 'vision',
      ui: {
        label: 'NODE_03',
        subtitle: 'LAST RECEIPT'
      },
      rewards: { vision: 1 },
      planner: {
        limited: []
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
          slot: 'vision',
          fixed: true,
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
      complete: '初章完成时，必须收在整条 16 节点路线的最终收束点上。'
    },

    phaseGuides: {
      combat: {
        summary: '德州段',
        candidates: [
          {
            id: 'combat_exchange_clerks',
            weight: 2,
            direction: '中市职员桌：对面是刚下班的交易员或柜台经理。写清楚赌场环境，接着按 <ACE0_BATTLE> 开打。',
            mustEnd: '让 {{user}} 在这张桌上顺利赢到钱。'
          },
          {
            id: 'combat_courier_shift',
            weight: 1,
            direction: '杂鱼桌：跑腿或者小掮客在休息。RINO 觉得好打，直接让 {{user}} 上，接着按 <ACE0_BATTLE> 开打。',
            mustEnd: '钱变多了，也让 RINO 的眼光得到验证。'
          },
          {
            id: 'combat_salon_side_table',
            weight: 1,
            direction: '常客桌：几个中市的常客在玩。RINO 把 {{user}} 推上桌，接着按 <ACE0_BATTLE> 开打。',
            mustEnd: '赢得很爽，也很干脆。'
          }
        ]
      },

      asset: {
        summary: '结算段',
        candidates: [
          {
            id: 'asset_room_extension',
            weight: 2,
            direction: '柜台账单：写服务员来确认相关的费用，让两人的花销直接标上数字。',
            mustEnd: '讲清楚继续留在这层有多贵。'
          },
          {
            id: 'asset_chip_hold',
            weight: 1,
            direction: '窗口手续：写换筹码要交的手续费或保证金，让 RINO 发现继续留在这层会一直掉钱。',
            mustEnd: '把花销的规矩落到眼前。'
          },
          {
            id: 'asset_day_pass',
            weight: 1,
            direction: '通行证规定：给他们看一份中市的短期停留规矩，说明待在这里条件很苛刻。',
            mustEnd: '讲明白中市待不下去的具体原因。'
          }
        ]
      },

      rest: {
        summary: '喘息段',
        candidates: [
          {
            id: 'rest_staff_coffee',
            weight: 2,
            direction: '咖啡机旁休息：站着喝口水。RINO 趁这个时间算算刚才赢了多少，下一步还差多少钱。',
            mustEnd: '喘口气，顺便清点一下钱。'
          },
          {
            id: 'rest_counting_corner',
            weight: 1,
            direction: '靠墙数钱：清点赢来的筹码和票据，讨论接下来拿这笔钱去哪。',
            mustEnd: '把钱和接下来的打算讲清楚。'
          },
          {
            id: 'rest_afterglow_walk',
            weight: 1,
            direction: '走廊休息：刚赢完有点放松，一边往外走，一边准备算接下来的账。',
            mustEnd: '给算账和离开做铺垫。'
          }
        ]
      },

      vision: {
        summary: '小游戏段',
        candidates: [
          {
            id: 'vision_dice_lane',
            weight: 2,
            direction: '小游戏区：去玩玩骰子、轮盘或者机器。玩法要爽，来钱要快。',
            mustEnd: '换换节奏，用小游戏快速赢一笔。'
          },
          {
            id: 'vision_bonus_machine',
            weight: 1,
            direction: '选机器：RINO 专门挑来钱快的机器让 {{user}} 玩。',
            mustEnd: '把 RINO 会看机器会挑选这一点写出来。'
          },
          {
            id: 'vision_crowd_heat',
            weight: 1,
            direction: '人多的热闹玩法：围观的多，赢的也快。让两人在人堆里赚一笔。',
            mustEnd: '把赌场热闹的部分和赢钱的感觉一起写出来。'
          }
        ]
      }
    }
  }
};

  global.ACE0ActPluginData = Object.assign({}, global.ACE0ActPluginData || {}, {
    ENCOUNTER_RULES,
    DEFAULT_WORLD_ACT,
    PROLOGUE_EXCHANGE_CHAPTER
  });
})(typeof window !== 'undefined' ? window : globalThis);
