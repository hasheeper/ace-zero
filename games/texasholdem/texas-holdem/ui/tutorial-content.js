(function (global) {
  'use strict';

  global.AceTutorialContent = {
    noviceBasicsPanel: {
      title: '欢迎来到牌桌：基本规则',
      subtitle: 'TEXAS HOLD\'EM BASICS',
      sections:[
        {
          kind: 'keypoints',
          title: '怎么赢下底池？',
          items:[
            { label: '让对手弃牌', copy: '通过下注或加注施压。如果其他玩家都弃牌，底池里的筹码就归你。' },
            { label: '摊牌比大小', copy: '如果有多名玩家一直打到最后，就会进入摊牌阶段。能组成更大牌型的人获胜。' },
            { label: '只比最强的 5 张', copy: '每局你有 2 张底牌和 5 张公共牌。最后会从这 7 张牌里选出最强的 5 张来比大小。' }
          ]
        },
        {
          kind: 'paragraph',
          title: '先打一手看看',
          body: '接下来会通过一局标准的德州扑克对局，带你熟悉发牌、看牌和下注的基本流程。'
        },
        {
          kind: 'keypoints',
          title: '位置与行动顺序',
          items:[
            { label: '六人桌座位', copy: '六人桌按顺时针依次是：庄位(BTN)、小盲(SB)、大盲(BB)、枪口(UTG)、HJ、CO。' },
            { label: '翻牌前', copy: '公共牌发出前，由大盲左侧的枪口位(UTG)先行动，大盲位(BB)最后行动。' },
            { label: '翻牌后', copy: '公共牌发出后，每一轮都从庄位左侧仍在局中的第一名玩家开始行动。庄位通常能最后行动，因此有位置优势。' }
          ]
        },
        {
          kind: 'rankList',
          title: '牌型大小（从大到小）',
          items:[
            { order: '1', name: '皇家同花顺', note: '同一花色的 A-K-Q-J-10' },
            { order: '2', name: '同花顺', note: '5 张花色相同且点数连续的牌' },
            { order: '3', name: '四条', note: '4 张点数相同的牌' },
            { order: '4', name: '葫芦', note: '三条加一对' },
            { order: '5', name: '同花', note: '5 张花色相同，但点数不连续' },
            { order: '6', name: '顺子', note: '5 张点数连续的牌，花色不限' },
            { order: '7', name: '三条', note: '3 张点数相同的牌' },
            { order: '8', name: '两对', note: '2 个不同点数的对子' },
            { order: '9', name: '一对', note: '2 张点数相同的牌' },
            { order: '10', name: '高牌', note: '没有组成任何牌型时，比最大的单张' }
          ]
        },
        {
          kind: 'keypoints',
          title: '牌一样大时怎么比？',
          items:[
            { label: '先看牌型', copy: '大牌型一定胜过小牌型。比如顺子再小，也一定大过三条。' },
            { label: '同牌型比主要部分', copy: '如果双方牌型相同，就比较组成牌型的主要部分。比如都是对子，就看谁的对子更大；都是顺子，就看谁的最大牌更大。' },
            { label: '再比踢脚', copy: '如果主要部分也一样，再依次比较剩下的单牌，也就是踢脚。踢脚更大的一方获胜。' }
          ]
        }
      ]
    },

    novice: {
      startMessage: '即将进入基础教学。这里准备了 3 局练习牌，帮助你熟悉界面和基本流程。',
      startBody: '这部分会依次带你了解一手牌是怎么进行的、拿到好牌时怎么主动加注，以及牌不好时怎么及时弃牌。',
      courseStart: {
        'holdem-basics': {
          message: '第一阶段：3 局基础练习。',
          body: '这一部分只讲最基本的德州扑克内容：看底牌、看位置、做下注决定，最后进行摊牌。'
        },
        'magic-basics': {
          message: '进阶阶段一：加入 Mana 和技能。',
          body: '接下来会介绍好运、厄运和灵视，看看这些技能会怎样影响后续发牌。'
        },
        'mental-special': {
          message: '进阶阶段二：加入心理战和角色搭配。',
          body: '这一部分会介绍怎样影响对手的行动选择，以及主手和副手的基本配合。最后会安排一局完整练习。'
        }
      },
      hands: {
        intro: {
          label: '热身局',
          startSequenceTitle: '一手牌的基本流程',
          startSequenceBody: '1. 每人先拿到 2 张只有自己能看到的底牌。\n2. 翻牌前先进行第一轮行动。\n3. 接着分三次发出 5 张公共牌：翻牌 3 张、转牌 1 张、河牌 1 张。\n4. 你可以通过下注让对手弃牌，也可以打到最后进行摊牌比大小。',
          holeTitle: '查看底牌',
          holeBody: '这是你的 2 张底牌。后面的继续、加注还是弃牌，都要根据这两张牌来判断。',
          dealerTitle: '你在庄位 (BTN)',
          dealerBody: '这一手你坐在庄位（BTN）。在两人桌里，庄位会在翻牌前先行动，翻牌后后行动。行动越靠后，通常能看到越多信息。',
          preflopActionTitle: '翻牌前：先做决定',
          preflopActionBody: '这一手先简单跟进。点击 [看牌 (CHECK) / 跟注 (CALL)]，进入翻牌圈。',
          flopBoardTitle: '翻牌圈：公共牌发出',
          flopBoardBody: '桌面发出了 2♣、7♦、J♥。结合你的底牌 A♥、7♣，你现在组成了一对 7。',
          streetActionTitles: {
            flop: '翻牌圈：继续观察',
            turn: '转牌圈：再看一张',
            river: '河牌圈：最后一张'
          },
          streetActionBodies: {
            flop: '你现在有一对 7，可以继续看下去。这里点击 [看牌 (CHECK)]，把这一轮的决定交给对手。',
            turn: '第四张公共牌已经发出。这里继续点击 [看牌 (CHECK)]，先保持当前局面。',
            river: '5 张公共牌已经全部发完。这里继续点击 [看牌 (CHECK)]，进入摊牌。'
          },
          showdownWinReason: '你赢下了这一局。你的一对 7 大过了对手的高牌。',
          showdownLoseReason: '这一局由对手获胜。摊牌后可以看到，对手组成了比你一对 7 更大的牌。'
        },

        ahead: {
          preflopTitle: '好起手牌：主动加注',
          preflopBody: 'A-K 是一手很不错的起手牌。这一手建议选择 [加注 (RAISE)]，主动把节奏拿在自己手里。',
          preflopActionTitle: '先做一次加注',
          preflopActionBody: '拿到强牌时，不要轻易让对手便宜看牌。先加注，让这一手打得更主动一些。',
          preflopConfirmTitle: '确认加注金额',
          preflopConfirmBody: '系统已经预设好了 40 的加注额，直接点击确认即可。',
          flopBoardTitle: '翻牌圈：你中了顶对',
          flopBoardBody: '公共牌是 A♣、7♦、2♠。结合你的底牌 A♠、K♦，你现在有一对 A，而且踢脚是 K。这是一个不错的牌面。对手跟注后先行动，你先看他的决定。',
          streetActionTitles: {
            "flop": "翻牌圈：先跟住",
            "turn": "转牌圈：继续观察",
            "river": "河牌圈：进入摊牌"
          },
          streetActionBodies: {
            "flop": "对手在翻前跟了你的加注，说明这手牌他还愿意继续。这里先点 [跟注 (CALL)]，继续往下看。",
            "turn": "转牌圈对手没有继续下注。这里点 [看牌 (CHECK)]，先不把底池打大。",
            "river": "5 张公共牌已经发完。这里继续点 [看牌 (CHECK)]，进入摊牌。"
          },
          showdownWinReason: '你赢下了这一局。你的一对 A，配合 K 踢脚，足以压过对手。',
          showdownLoseReason: '这一局你输了。虽然起手牌不错，但最后对手组成了更大的牌。'
        },

        behind: {
          preflopTitle: '一般起手牌：先跟注',
          preflopBody: 'K-8 不算强牌。这一手先跟注入池，看看翻牌再决定后面的动作。',
          preflopActionTitle: '先跟进去',
          preflopActionBody: '点击 [跟注 (CALL)]，用较小的代价进入翻牌圈。',
          flopBoardTitle: '翻牌圈：没有击中',
          flopBoardBody: '公共牌是 A♠、7♣、2♦。这几张牌没能帮你组成对子，也没有明显的继续空间。如果对手继续施压，你会比较被动。',
          foldTitle: '这里可以弃牌',
          foldBody: '这手牌没有形成优势，继续跟注通常只会投入更多筹码。点击 [弃牌 (FOLD)]，结束这一局。'
        }
      }
    },

    expert: {
      startMessage: '接下来进入进阶教学。',
      startBody: '从这一部分开始，牌局中会加入 Mana 和技能面板。除了看牌和下注，你还需要学会在合适的时机使用技能。',
      courseStart: {
        'magic-basics': {
          message: '先学习技能系统。',
          body: '接下来的几局会介绍好运、厄运和灵视，看看这些技能会怎样影响后续的发牌结果。'
        },
        'mental-special': {
          message: '最后学习心理战和角色搭配。',
          body: '这部分会介绍怎样影响对手的行动倾向，以及主手和副手的基本搭配方式。最后还有一局完整练习。'
        }
      },
      gameStartMessage: '开局还是正常的看牌和下注流程。等到可以使用技能时，界面会提示你打开对应面板。',

      magicBasicsPanel: {
        title: '技能教学：好运（Fortune）',
        subtitle: 'MAGIC BASICS / FORTUNE',
        sections:[
          {
            kind: 'keypoints',
            title: '先了解这一部分',
            items:[
              { label: '技能会影响牌局', copy: '技能可以影响后续发牌，或者帮你获取更多信息，但最后输赢还是按德州扑克的基本规则来判定。' },
              { label: '好运（Fortune）的作用', copy: '好运不会直接把好牌发到你手里，而是让接下来更有机会发出对你有利的牌。' },
              { label: '这一局要做什么', copy: '这一局只需要使用一次好运，然后看一遍命运结算面板，最后回到牌桌完成后续操作。' }
            ]
          },
          {
            kind: 'paragraph',
            title: '这一局的重点',
            body: '进入技能阶段后，先使用一次好运。接着看看命运结算面板里出现了什么变化，确认这次技能怎样影响了下一张牌。看完后，回到牌桌跟注一次即可。'
          },
          {
            kind: 'keypoints',
            title: '几个基础词',
            items:[
              { label: '法力值（Mana）', copy: '使用技能会消耗 Mana。技能越强，消耗通常越高。' },
              { label: 'Mana 反噬', copy: '如果 Mana 爆满失控，或者降到 0，都会触发一次魔运反噬。接下来的 3 回合里，你会承受强诅咒效果，所以要注意控制 Mana。' },
              { label: '三种基础属性', copy: '好运（Moirai）更容易帮你接到想要的牌，厄运（Chaos）会干扰对手接牌，灵视（Psyche）可以看信息，也能挡掉厄运。' },
              { label: '属性克制', copy: '狂厄克制天命，天命克制灵视，灵视克制狂厄。双方效果同时出现时，克制关系会影响最后结果。' },
              { label: '技能阶级', copy: '部分通用技能分为 T3 / T2 / T1 三个等级，数字越小，等级越高。高阶技能通常效果更强，也更容易压过低阶技能。' }
            ]
          },
          {
            kind: 'keypoints',
            title: '这一局会用到的天命（Moirai）技能',
            items:[
              { label: 'T3：小吉', copy: '基础的好运技能。消耗较少，只会小幅影响后续发牌。' },
              { label: 'T2：大吉', copy: '效果更强的好运技能，能更明显地提高发到有利牌的机会。' },
              { label: 'T1：天命', copy: '最高阶的好运技能。效果最强，在同属性对抗时也更占优势。' }
            ]
          }
        ]
      },

      curseBasicsPanel: {
        title: '技能教学：厄运（Curse）',
        subtitle: 'MAGIC BASICS / CURSE',
        sections:[
          {
            kind: 'keypoints',
            title: '先了解这一部分',
            items:[
              { label: '厄运的作用', copy: '厄运不会直接帮你拿到好牌，它的作用是让对手更难接到自己想要的牌。' },
              { label: '会影响对手成牌', copy: '当对手需要某几张牌来继续变强时，厄运会让这些牌更不容易出现。' },
              { label: '注意结算变化', copy: '如果同一个目标同时受到好运和厄运影响，命运结算面板会显示这两种效果最后是怎样互相影响的。' }
            ]
          },
          {
            kind: 'paragraph',
            title: '这一局的重点',
            body: '这一局对对手使用一次厄运技能。然后观察命运结算面板，看看哪些原本对他有帮助的牌变得不容易发出。'
          },
          {
            kind: 'keypoints',
            title: '这一局会用到的狂厄（Chaos）技能',
            items:[
              { label: 'T3：小凶', copy: '基础的厄运技能。消耗较少，只会小幅干扰对手后续接牌。' },
              { label: 'T2：大凶', copy: '效果更强的厄运技能，能更明显地影响对手后续成牌。' },
              { label: 'T1：灾变', copy: '最高阶的厄运技能。效果最强，在同属性对抗时也更占优势。' }
            ]
          }
        ]
      },

      psycheBasicsPanel: {
        title: '技能教学：灵视（Psyche）',
        subtitle: 'MAGIC BASICS / PSYCHE',
        sections:[
          {
            kind: 'keypoints',
            title: '先认几个术语',
            items:[
              { label: '读牌精度（READS）', copy: 'VAGUE 是模糊范围，RANGE 是缩小后的范围，PERFECT 是基本看清。' },
              { label: '口袋对子', copy: '两张底牌本身就是一对，比如 9♠ 9♥。这类起手通常不差。' },
              { label: '高张', copy: '10、J、Q、K、A 这类大牌，翻前本身就更有成强牌的潜力。' },
              { label: '摊牌价值', copy: '就算不主动开火，打到亮牌时也还有机会赢的牌。' },
              { label: '听牌 / 强听牌', copy: '只差一张就能成牌叫听牌；同时有多种成牌机会，就算强听牌。' },
              { label: '范围', copy: '不是只猜对手具体两张，而是判断他大概会拿哪一类牌。' }
            ]
          },
          {
            kind: 'keypoints',
            title: '先了解这一部分',
            items:[
              { label: '灵视的作用', copy: '灵视（Psyche）既可以查看对手的信息，也可以保护指定目标，挡掉打向这个目标的厄运。' },
              { label: '折射怎么使用', copy: '使用“折射”时，需要先选择一个守护目标（比如自己），再选择一个查看目标（对手）。' },
              { label: '拦下后会有转化', copy: '灵视克制狂厄。成功挡下厄运后，其中一部分效果会转成对你有利的好运。' }
            ]
          },
          {
            kind: 'paragraph',
            title: '这一局的重点',
            body: '这一局里，对手会对你使用厄运。你需要用“折射”保护自己。之后留意结算面板里的提示，确认这次拦截和转化有没有成功。'
          },
          {
            kind: 'keypoints',
            title: '这一局会用到的灵视（Psyche）技能',
            items:[
              { label: 'T3：澄澈', copy: '基础的灵视技能。可以查看对方胜率，并清除较弱的厄运效果。' },
              { label: 'T2：折射', copy: '效果更强的灵视技能。可以查看对方手牌强度，挡下厄运后，还能把其中一部分转成你的好运。' },
              { label: 'T1：真理', copy: '最高阶的灵视技能。可以直接清除厄运，在对抗中也更占优势。' }
            ]
          },
          {
            kind: 'keypoints',
            title: '关于专属技能（T0）',
            items:[
              { label: 'T0 是角色专属技能', copy: '部分角色拥有自己的 T0 技能，例如 VV 的“泡沫清算”。这类技能通常只会在后面的实战中出现。' }
            ]
          }
        ]
      },

      mentalBasicsPanel: {
        title: '心理战教学',
        subtitle: 'MENTAL / AI TENDENCY',
        sections:[
          {
            kind: 'keypoints',
            title: '先了解这一部分',
            items:[
              { label: '心理战会影响行动选择', copy: '心理战不会改变已经发出的牌，但会干扰对手的判断，让对手更偏向某些行动。' },
              { label: '四种基础指令', copy: '压场会让对手更保守；挑衅会让对手更容易做出激进动作；试探会让对手的判断变得不稳定；定神用来恢复自己的状态。' },
              { label: '对手的定力（Composure）', copy: '心理战的效果和对手当前的定力有关。定力越低，对手越容易受到影响。' }
            ]
          },
          {
            kind: 'paragraph',
            title: '这一局的重点',
            body: '先正常跟注进入翻牌圈。然后打开 MENTAL 面板，对对手使用一次【压场】。之后观察对手的行动，看看他会不会变得更保守。'
          },
          {
            kind: 'keypoints',
            title: '心理战对你的影响',
            items:[
              { label: '不会替你做决定', copy: '即使你受到心理战影响，系统也不会强制替你选择弃牌、加注或跟注。最后的决定仍然由你自己来做。' },
              { label: '面板信息可能不稳定', copy: '当你的状态受到影响时，界面上的“预计胜率”可能会出现跳动和偏差。不要只依赖这一项数字。' }
            ]
          }
        ]
      },

      roleContrastPanel: {
        title: '角色系统：主手与副手',
        subtitle: 'VANGUARD / REARGUARD',
        sections:[
          {
            kind: 'keypoints',
            title: '先了解这一部分',
            items:[
              { label: '主手位（Vanguard）', copy: '主手是当前上桌打牌的角色，只会生效这个角色的主手被动。' },
              { label: '副手位（Rearguard）', copy: '副手不会直接上桌，但会在后台提供支援，并生效自己的副手被动。' },
              { label: '共用 Mana', copy: '主手和副手使用同一个 Mana 池。Mana 上限会按两名角色中较高的一方计算。' },
              { label: '技能放在一起使用', copy: '主手和副手的可用技能会一起显示在面板里，你可以根据情况自由选择。' }
            ]
          },
          {
            kind: 'keypoints',
            title: '搭配时要看什么',
            items:[
              { label: '两边的特点要互补', copy: '有的角色更擅长回复 Mana，有的角色更擅长使用高消耗技能。把两种特点搭在一起，通常会更顺手。' },
              { label: '这一局的示例', copy: '这一局使用的是 KAZU（主手）和 RINO（副手）。KAZU 更擅长把受到的影响转成 Mana，RINO 更擅长打出高消耗的好运技能，这组搭配比较适合一起使用。' }
            ]
          }
        ]
      },

      liveMatchPanel: {
        title: '完整对局练习',
        subtitle: 'LIVE MATCH / KAZU + RINO',
        sections:[
          {
            kind: 'keypoints',
            title: '这一局要注意什么',
            items:[
              { label: '本局不再逐步提示', copy: '进入牌局后，不会再像前面的教学那样一步步停下来说明操作。' },
              { label: '胜负规则没有变化', copy: '即使加入了技能和 Mana，最后底池归谁，仍然要看牌型大小和双方的下注结果。' },
              { label: '自己判断使用时机', copy: '什么时候继续跟注，什么时候使用技能，都要根据手牌、公共牌和场上情况自己决定。' }
            ]
          }
        ]
      },

      mentalGlossaryPanel: {
        title: '心理战机制说明',
        subtitle: 'MENTAL PRESSURE / AI RESPONSE',
        sections:[
          {
            kind: 'keypoints',
            title: '定力（Composure）',
            items:[
              { label: '定力会逐步下降', copy: '对手在持续受到心理战影响时，定力会一步步降低。定力越低，越容易被后续指令影响。' },
              { label: '四种状态', copy: '定力状态分为稳定（stable）、动摇（shaken）、不稳（unsteady）和崩溃（broken）。状态越差，对手的判断越不稳定。' },
              { label: '每轮只能用一次', copy: '心理战通常每个发牌轮次只能使用一次，所以更适合连续施压，而不是一次解决。' }
            ]
          },
          {
            kind: 'keypoints',
            title: '四种基础指令',
            items:[
              { label: '压场（Presence）', copy: '让对手变得更保守，更少主动加注，也更容易选择看牌或弃牌。' },
              { label: '挑衅（Taunt）', copy: '让对手更容易冲动行动，用一般的牌继续跟注，或者做出更激进的加注。' },
              { label: '试探（Probe）', copy: '让对手对局势的判断变得更乱，更容易做出不稳定的决定。' },
              { label: '定神（Center）', copy: '用来恢复自己的状态，减少心理战对你的影响，让面板信息重新稳定下来。' }
            ]
          },
          {
            kind: 'keypoints',
            title: '玩家受到影响时',
            items:[
              { label: '预计胜率会偏移', copy: '当你受到心理战影响时，界面上的“预计胜率”可能会出现跳动和偏差，不能完全照着它来判断。' },
              { label: '真理（Truth）状态', copy: '在特定状态下，或者受到真理效果影响时，这些显示偏差会被清除，面板会恢复得更准确。' }
            ]
          }
        ]
      },

      glossaryPanel: {
        title: '德州术语',
        subtitle: 'HOLD\'EM TERMS',
        sections:[
          {
            kind: 'keypoints',
            title: '常见词解释',
            items:[
              { label: '读牌精度（READS）', copy: '部分技能会提供对手信息。VAGUE 表示只能看到模糊范围，RANGE 表示可以缩小到一定范围，PERFECT 表示能准确看清。' },
              { label: '位置（Position）', copy: '指你在一轮行动中的先后顺序。通常越晚行动，能获得的信息越多。' },
              { label: '口袋对子（Pocket Pair）', copy: '发下来的两张底牌本身就是一对，例如 9♠ 9♥。这类起手牌通常较强。' },
              { label: '高张（Broadway）', copy: '通常指 10、J、Q、K、A 这些大牌。翻牌前拿到这类牌，后续组成强牌的机会通常更高。' },
              { label: '顶对（Top Pair）', copy: '指你用手牌配合公共牌，组成了牌面最大点数的对子。' },
              { label: '踢脚（Kicker）', copy: '当双方组成相同牌型时，用来比较大小的剩余单牌。例如都有一对 A 时，就要比踢脚。' },
              { label: '摊牌价值（Showdown Value）', copy: '指一手牌即使不主动加注，打到摊牌时也有一定机会赢下底池。' },
              { label: '听牌（Draw）', copy: '当前还没成牌，但只差一张就能组成目标牌型，例如听顺或听同花。' },
              { label: '强听牌（Combo Draw）', copy: '同时有不止一种成牌机会的听牌，例如既能成顺子，也能成同花。这类牌通常有较强的继续空间。' },
              { label: '范围（Range）', copy: '不是只猜对手具体拿着哪两张牌，而是根据他的行动，判断他可能持有哪些类型的牌。' },
              { label: '诈唬（Bluff）', copy: '在牌力不足时，通过下注或加注让对手弃牌，从而直接赢下底池。' },
              { label: '带胜率的诈唬（Bluff with Equity）', copy: '虽然当前还没成牌，但后续仍有机会变强。这类诈唬比纯粹空牌诈唬更常见。' }
            ]
          }
        ]
      },

      openMagicTitle: '打开技能面板',
      openMagicBody: '点击侧边栏的秘典图标。这里可以看到本局可用的技能，以及你当前的 Mana。',
      cardTitle: '使用技能',
      cardBody: '在面板中选择一个技能，再确认使用目标。技能会在后续发牌时生效。',

      hands: {
        'fortune-intro': {
          introMessage: '第一课：学习好运技能的基本用法。',
          preflopTitle: '先正常跟注',
          preflopBody: '你拿到了 A♥ Q♥。先点击 [跟注 (CALL)]，进入下一轮后再使用技能。',
          introPanelTitle: '好运教学',
          introPanelDismissText: '开始',
          openMagicTitle: '打开技能面板',
          openMagicBody: '现在可以使用技能了。点击右下角的 GRIMOIRE（秘典）。',
          fortuneCardTitle: '选择好运（Fortune）',
          fortuneCardBody: '选择一张好运技能并确认使用。这会消耗 1 点 Mana，并让接下来的发牌更容易出现对你有利的牌。',
          proceedTitle: '继续发牌',
          proceedBody: '技能使用后，点击 [继续发牌]，查看这次结算结果。',
          forcePanelTitle: '命运结算面板',
          forcePanelBody: 'DESTINY RECALIBRATION 用来显示这一轮下一张牌是怎么选出来的。\n\n可以先看 4 个部分：\n1. 中间的列表是“下一张可能发出的牌”。\n2. 排名越靠上，代表这一张牌这次越容易发出。\n3. 左边的 Active Protocols 是当前对你有利的效果；右边的 Hostile Intent 是当前对你不利的效果。\n4. 最后被箭头和高亮标出的那一行，就是这次实际发出的牌。\n\n你可以把这个面板理解成：系统会先比较哪些牌对当前局面更有利，再结合双方效果，决定下一张牌更可能发出什么。',
          forceGuidePanel: {
            title: '怎么看命运结算面板',
            subtitle: 'DESTINY RECALIBRATION / QUICK GUIDE',
            sections: [
              {
                kind: 'imageCompass',
                title: '先看这 4 个位置',
                src: 'https://files.catbox.moe/ztaxe1.jpg',
                alt: '命运结算面板说明图',
                top: {
                  label: '上方',
                  copy: '右上角的 幸 / 凶 显示这一轮的总幸运和总厄运；最上面一排通常是中立区域。'
                },
                left: {
                  label: '左侧',
                  copy: 'Active Protocols 显示当前对你有利的效果，例如好运、保护和拦截。'
                },
                right: {
                  label: '右侧',
                  copy: 'Hostile Intent 显示当前对你不利的效果，例如厄运和反噬。'
                },
                bottom: {
                  label: '下方',
                  copy: '这里会列出下一张可能发出的牌。位置越靠上，越容易被选中；箭头指向的那一行就是最后发出的牌。'
                }
              }
            ]
          },
          flopResultTitle: '结果已经发出',
          flopResultBody: '这次结算让你接到了更有利的牌。技能只会影响发牌机会，后面的下注和比牌仍然要靠你自己完成。',
          freePlayTitle: '接下来由你继续操作',
          freePlayBody: '技能演示到这里结束。后面的行动不再提示，请根据当前牌面自己决定。'
        },

        'curse-pressure': {
          introMessage: '第二课：学习厄运技能的基本用法。',
          preflopTitle: '先正常跟注',
          preflopBody: '这一手先点击 [跟注 (CALL)]。到了翻牌圈，再使用厄运技能。',
          introPanelTitle: '厄运教学',
          introPanelDismissText: '开始',
          openMagicTitle: '打开技能面板',
          openMagicBody: '这一轮我们来使用狂厄（Chaos）技能。点击右下角的技能面板。',
          curseCardTitle: '选择技能并指定目标',
          curseCardBody: '选择一张厄运技能，然后点击对手作为目标。这样一来，后续发牌时，对手会更难接到自己想要的牌。',
          proceedTitle: '继续发牌',
          proceedBody: '技能使用后，点击 [继续发牌]，查看这次结算结果。',
          forcePanelTitle: '查看 Hostile Intent',
          forcePanelBody: '注意右侧的 Hostile Intent。厄运生效后，对手更有利的牌会变得不容易发出。',
          flopResultTitle: '厄运已经生效',
          flopResultBody: '这一轮的结果对对手不太有利。你可以看到，他没有接到能继续增强牌力的牌。',
          freePlayTitle: '接下来由你继续操作',
          freePlayBody: '教学到这里结束。后面的行动不再提示，请根据当前牌面自己决定。'
        },

        'mental-basics': {
          introMessage: '这一课会介绍心理战的基本用法。',
          preflopTitle: '先跟注进入翻牌圈',
          preflopBody: '这一手先点击 [跟注 (CALL)]。看到翻牌后，再打开心理战面板。',
          introPanelTitle: '心理战教学',
          introPanelDismissText: '开始',
          openMentalTitle: '打开 MENTAL 面板',
          openMentalBody: '点击右下角的 MENTAL。这里可以使用影响对手行动选择的心理战指令。',
          mentalSkillTitle: '使用【压场】',
          mentalSkillBody: '这名对手的定力较低。对他使用一次 [压场]，看看他的行动会不会变得更保守。',
          mentalResultTitle: '观察对手变化',
          mentalResultBody: '压场生效后，对手会更少主动加注，也更容易选择看牌或弃牌。',
          freePlayTitle: '接下来由你继续操作',
          freePlayBody: '心理战演示已经结束。后面的行动不再提示，请根据当前局面自己决定。'
        },

        'kazu-rino-contrast': {
          introMessage: '这一课会介绍主手和副手是怎样一起发挥作用的。',
          preflopTitle: '先跟注入池',
          preflopBody: '先点击 [跟注 (CALL)]，把注意力放在这一局的角色提示和技能面板上。',
          introPanelTitle: '主手与副手',
          introPanelDismissText: '查看说明',
          freePlayTitle: '接下来可以自己尝试',
          freePlayBody: '这一局不再逐步提示。请尝试使用主手和副手的技能，熟悉共用 Mana 和技能一起使用的方式。'
        },

        'special-live-match': {
          introMessage: '这是最后一局完整练习。接下来不会再有逐步提示，需要你自己完成整局对战。',
          introPanelTitle: '完整对局练习',
          introPanelDismissText: '进入牌桌',
          freePlayTitle: '接下来由你自己操作',
          freePlayBody: '这一局不会再弹出提示。注意 Mana 的使用，根据手牌、公共牌和场上情况，自己决定什么时候跟注、加注或使用技能。',
          showdownWinReason: '你赢下了这一局，说明你已经能够把前面学过的内容用到实战里。',
          showdownLoseReason: '这一局你输了。可以再试一次，看看是下注、技能使用，还是牌面判断出了问题。'
        },

        'psyche-convert': {
          introMessage: '第三课：学习灵视的基本用法。灵视可以查看对手信息，也可以用来挡住厄运。',
          preflopTitle: '先跟注留在局里',
          preflopBody: '先点击 [跟注 (CALL)]。这一手稍后会用灵视来应对对手的厄运。',
          introPanelTitle: '灵视教学',
          introPanelDismissText: '开始',
          openMagicTitle: '打开技能面板',
          openMagicBody: '这一轮对手会对你使用厄运。打开技能面板，找到灵视（Psyche）里的【折射】。',
          psycheCardTitle: '先选守护目标，再选查看目标',
          psycheCardBody: '使用 [折射] 后，先点击自己，把自己设为【守护】；再点击对手，把对手设为【透视】。',
          proceedTitle: '继续发牌',
          proceedBody: '设置完成后，点击 [继续发牌]，查看这次结算结果。',
          forcePanelTitle: '查看结算结果',
          forcePanelBody: '注意面板中的结算信息。成功生效后，这次厄运会被折射挡下，其中一部分还会转成对你有利的好运效果。',
          flopResultTitle: '折射已经生效',
          flopResultBody: '这次你成功挡住了对手的厄运，还得到了额外的好运加成。灵视既能保护自己，也能在合适的时候帮你争取优势。',
          freePlayTitle: '接下来由你继续操作',
          freePlayBody: '灵视的演示到这里结束。后面的行动不再提示，请根据当前牌面自己决定。'
        }
      }
    }
  };
})(window);
