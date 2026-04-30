    window.AceMahjongFrontendConfig = Object.assign({
      debugPanelEnabled: true,
      assetBase: '../../assets',
      advancedMode: false,
      handOrderPolicy: {
        mode: 'sorted'
      }
    }, window.AceMahjongFrontendConfig || {});

    const bottomRiverTiles = [
      { asset: 'Shaa', label: '西', kind: 'flat' },
      { asset: 'Pei', label: '北', kind: 'flat' },
      { asset: 'Man1', label: '一万', kind: 'flat' },
      { asset: 'Man9', label: '九万', kind: 'flat' },
      { asset: 'Chun', label: '中', kind: 'flat' },
      { asset: 'Pin5-Dora', label: '赤五筒', kind: 'flat' },
      { asset: 'Sou2', label: '二索', kind: 'flat' },
      { asset: 'Pin3', label: '三筒', kind: 'flat' },
      { asset: 'Haku', label: '白', kind: 'flat' },
      { asset: 'Man6', label: '六万', kind: 'flat' }
    ];

    const bottomSeatState = {
      riichi: {
        active: false,
        tileIndex: -1,
        displayMode: 'flat',
        stickVisible: false
      }
    };

    const bottomSeatMeta = {
      title: '雀士',
      name: '南宫'
    };

    const bottomHandTiles = [
      { asset: 'Man2', label: '二万', kind: 'stand' },
      { asset: 'Man3', label: '三万', kind: 'stand' },
      { asset: 'Man4', label: '四万', kind: 'stand' },
      { asset: 'Man5-Dora', label: '赤五万', kind: 'stand' },
      { asset: 'Man6', label: '六万', kind: 'stand' },
      { asset: 'Man7', label: '七万', kind: 'stand' },
      { asset: 'Pin2', label: '二筒', kind: 'stand' },
      { asset: 'Pin3', label: '三筒', kind: 'stand' },
      { asset: 'Sou4', label: '四索', kind: 'stand' },
      { asset: 'Sou5', label: '五索', kind: 'stand' },
      { asset: 'Sou6', label: '六索', kind: 'stand', extraClass: 'hand-gap' }
    ];

    const tableInfoState = {
      tableSize: 4,
      activeSeats: ['bottom', 'right', 'top', 'left'],
      hiddenSeats: [],
      ruleset: 'riichi-4p',
      tableLayout: '4p-octagon',
      uiMode: 'standard',
      advancedMode: false,
      roundText: '東一',
      honba: 0,
      riichiSticks: 2,
      centerRiichiVisible: false,
      centerDoraVisible: false,
      remaining: 64,
      doraTiles: [
        { asset: 'Man5', label: '五万', open: true },
        { open: false },
        { open: false },
        { open: false },
        { open: false }
      ],
      scores: {
        top: 32100,
        left: 19500,
        right: 24000,
        bottom: 25000
      },
      turnSeat: 'bottom'
    };

    const defaultDebugHandTiles = [
      { asset: 'Man2', label: '二万' },
      { asset: 'Man3', label: '三万' },
      { asset: 'Man4', label: '四万' },
      { asset: 'Man5-Dora', label: '赤五万' },
      { asset: 'Man6', label: '六万' },
      { asset: 'Man7', label: '七万' },
      { asset: 'Pin2', label: '二筒' },
      { asset: 'Pin2', label: '二筒' },
      { asset: 'Pin3', label: '三筒' },
      { asset: 'Sou4', label: '四索' },
      { asset: 'Sou5', label: '五索' },
      { asset: 'Sou6', label: '六索' },
      { asset: 'Sou6', label: '六索' },
      { asset: 'Sou7', label: '七索', isDrawn: true }
    ];

    const defaultDebugActions = [
      ...(window.AceMahjongFrontendConfig && window.AceMahjongFrontendConfig.advancedMode
        ? [{ key: 'ryukyoku', label: '九种九牌', bgChar: '流', textLayout: 'len-4', row: 0 }]
        : []),
      { key: 'riichi', label: '立直', bgChar: '立', textLayout: 'len-2', variant: 'riichi', row: 0 },
      { key: 'zimo', label: '自摸', bgChar: '摸', textLayout: 'len-2', variant: 'alert-red', row: 0 },
      { key: 'rong', label: '荣', bgChar: '荣', variant: 'alert-red', row: 0 },
      { key: 'chi', label: '吃', bgChar: '吃', row: 1 },
      { key: 'peng', label: '碰', bgChar: '碰', row: 1 },
      { key: 'minggang', label: '明杠', bgChar: '杠', textLayout: 'len-2', row: 1 },
      { key: 'angang', label: '暗杠', bgChar: '暗', textLayout: 'len-2', row: 1 },
      { key: 'jiagang', label: '加杠', bgChar: '加', textLayout: 'len-2', row: 1 },
      { key: 'skip', label: '过', bgChar: '过', variant: 'skip', row: 1 }
    ];

    function createHiddenHandTiles(length = 14) {
      return Array.from({ length }, (_, index) => ({
        kind: 'stand',
        hidden: true,
        extraClass: index === length - 1 ? 'hand-gap' : ''
      }));
    }

    const baseBottomMelds = [
      {
        type: 'chi',
        source: 'left',
        tiles: [
          { asset: 'Sou4', label: '四索' },
          { asset: 'Sou5', label: '五索' },
          { asset: 'Sou6', label: '六索' }
        ]
      }
    ];

    const opponentSeats = [
      {
        targetId: 'seat-right',
        riverLabel: '下家 牌河',
        handLabel: '下家 背牌',
        meldLabel: '下家 副露',
        title: '大师',
        name: '隐僧',
        riverTiles: [
          { asset: 'Sou3', label: '三索', kind: 'flat' },
          { asset: 'Pin9', label: '九筒', kind: 'flat' },
          { asset: 'Hatsu', label: '发', kind: 'flat' },
          { asset: 'Man6', label: '六万', kind: 'flat' },
          { asset: 'Sou8', label: '八索', kind: 'flat' },
          { asset: 'Pin4', label: '四筒', kind: 'flat' },
          { asset: 'Man1', label: '一万', kind: 'flat' },
          { asset: 'Sou9', label: '九索', kind: 'flat' },
          { asset: 'Nan', label: '南', kind: 'flat' },
          { asset: 'Pin1', label: '一筒', kind: 'flat' }
        ],
        handTiles: createHiddenHandTiles(10),
        riichi: {
          active: false,
          tileIndex: -1,
          displayMode: 'flat',
          stickVisible: false
        },
        melds: [
          {
            type: 'pon',
            source: 'across',
            tiles: [
              { asset: 'Ton', label: '东' },
              { asset: 'Ton', label: '东' },
              { asset: 'Ton', label: '东' }
            ]
          }
        ]
      },
      {
        targetId: 'seat-top',
        riverLabel: '对家 牌河',
        handLabel: '对家 背牌',
        meldLabel: '对家 副露',
        title: '魂天',
        name: '幽兰',
        riverTiles: [
          { asset: 'Pin2', label: '二筒', kind: 'flat' },
          { asset: 'Nan', label: '南', kind: 'flat' },
          { asset: 'Sou6', label: '六索', kind: 'flat' },
          { asset: 'Man8', label: '八万', kind: 'flat' },
          { asset: 'Haku', label: '白', kind: 'flat' },
          { asset: 'Pin8', label: '八筒', kind: 'flat' },
          { asset: 'Sou1', label: '一索', kind: 'flat' },
          { asset: 'Chun', label: '中', kind: 'flat' },
          { asset: 'Man2', label: '二万', kind: 'flat' },
          { asset: 'Sou7', label: '七索', kind: 'flat' }
        ],
        handTiles: createHiddenHandTiles(10),
        riichi: {
          active: false,
          tileIndex: -1,
          displayMode: 'flat',
          stickVisible: false
        },
        melds: [
          {
            type: 'kan-open',
            source: 'right',
            tiles: [
              { asset: 'Pin7', label: '七筒' },
              { asset: 'Pin7', label: '七筒' },
              { asset: 'Pin7', label: '七筒' },
              { asset: 'Pin7', label: '七筒' }
            ]
          }
        ]
      },
      {
        targetId: 'seat-left',
        riverLabel: '上家 牌河',
        handLabel: '上家 背牌',
        meldLabel: '上家 副露',
        title: '雀豪',
        name: '剑客',
        riverTiles: [
          { asset: 'Sou1', label: '一索', kind: 'flat' },
          { asset: 'Man3', label: '三万', kind: 'flat' },
          { asset: 'Pei', label: '北', kind: 'flat' },
          { asset: 'Pin6', label: '六筒', kind: 'flat' },
          { asset: 'Chun', label: '中', kind: 'flat' },
          { asset: 'Sou4', label: '四索', kind: 'flat' },
          { asset: 'Man5', label: '五万', kind: 'flat' },
          { asset: 'Pin2', label: '二筒', kind: 'flat' },
          { asset: 'Ton', label: '东', kind: 'flat' },
          { asset: 'Sou8', label: '八索', kind: 'flat' }
        ],
        handTiles: createHiddenHandTiles(9),
        riichi: {
          active: false,
          tileIndex: -1,
          displayMode: 'flat',
          stickVisible: false
        },
        melds: [
          {
            type: 'kan-concealed',
            tiles: [
              { asset: 'Man9', label: '九万' },
              { asset: 'Man9', label: '九万' },
              { asset: 'Man9', label: '九万' },
              { asset: 'Man9', label: '九万' }
            ]
          }
        ]
      }
    ];
