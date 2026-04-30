(function(global) {
  'use strict';

  const DEFAULT_SEAT_ORDER = ['bottom', 'right', 'top', 'left'];
  const DEFAULT_SEAT_LABELS = {
    bottom: '自家',
    right: '下',
    top: '对家',
    left: '上'
  };
  const ROUND_WIND_LABELS = ['东', '南', '西', '北'];
  const TILE_ASSET_MAP = {
    m: { '0': 'Man5-Dora', '1': 'Man1', '2': 'Man2', '3': 'Man3', '4': 'Man4', '5': 'Man5', '6': 'Man6', '7': 'Man7', '8': 'Man8', '9': 'Man9' },
    p: { '0': 'Pin5-Dora', '1': 'Pin1', '2': 'Pin2', '3': 'Pin3', '4': 'Pin4', '5': 'Pin5', '6': 'Pin6', '7': 'Pin7', '8': 'Pin8', '9': 'Pin9' },
    s: { '0': 'Sou5-Dora', '1': 'Sou1', '2': 'Sou2', '3': 'Sou3', '4': 'Sou4', '5': 'Sou5', '6': 'Sou6', '7': 'Sou7', '8': 'Sou8', '9': 'Sou9' },
    z: { '1': 'Ton', '2': 'Nan', '3': 'Shaa', '4': 'Pei', '5': 'Haku', '6': 'Hatsu', '7': 'Chun' }
  };
  const TILE_LABEL_MAP = {
    m: { '0': '赤五万', '1': '一万', '2': '二万', '3': '三万', '4': '四万', '5': '五万', '6': '六万', '7': '七万', '8': '八万', '9': '九万' },
    p: { '0': '赤五筒', '1': '一筒', '2': '二筒', '3': '三筒', '4': '四筒', '5': '五筒', '6': '六筒', '7': '七筒', '8': '八筒', '9': '九筒' },
    s: { '0': '赤五索', '1': '一索', '2': '二索', '3': '三索', '4': '四索', '5': '五索', '6': '六索', '7': '七索', '8': '八索', '9': '九索' },
    z: { '1': '东', '2': '南', '3': '西', '4': '北', '5': '白', '6': '发', '7': '中' }
  };
  const YAKU_NAME_MAP = {
    'ダブル立直': '两立直',
    '門前清自摸和': '门前清自摸',
    '一発': '一发',
    '海底摸月': '海底摸月',
    '河底撈魚': '河底捞鱼',
    '嶺上開花': '岭上开花',
    '槍槓': '抢杠',
    '場風 東': '场风 东',
    '場風 南': '场风 南',
    '場風 西': '场风 西',
    '場風 北': '场风 北',
    '自風 東': '自风 东',
    '自風 南': '自风 南',
    '自風 西': '自风 西',
    '自風 北': '自风 北',
    '対々和': '对对和',
    '三色同順': '三色同顺',
    '混老頭': '混老头',
    '清老頭': '清老头',
    '小三元': '小三元',
    '混全帯幺九': '混全带幺九',
    '純全帯幺九': '纯全带幺九',
    '混一色': '混一色',
    '清一色': '清一色',
    '断幺九': '断幺九',
    '平和': '平和',
    '一盃口': '一杯口',
    '二盃口': '二杯口',
    'ドラ': '宝牌',
    '裏ドラ': '里宝牌',
    '赤ドラ': '红宝牌'
  };

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function formatScore(value) {
    return Number(value || 0).toLocaleString('en-US');
  }

  function localizeText(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    if (YAKU_NAME_MAP[text]) return YAKU_NAME_MAP[text];
    return text
      .replace(/場/g, '场')
      .replace(/東/g, '东')
      .replace(/風/g, '风')
      .replace(/順/g, '顺')
      .replace(/対/g, '对')
      .replace(/發/g, '发')
      .replace(/発/g, '发')
      .replace(/嶺/g, '岭')
      .replace(/槓/g, '杠')
      .replace(/裏/g, '里')
      .replace(/萬/g, '万')
      .replace(/國/g, '国');
  }

  function normalizeTileCode(code) {
    const value = String(code || '').trim().toLowerCase();
    const match = value.match(/^[mpsz][0-9]/);
    return match ? match[0] : null;
  }

  function getTileAsset(code) {
    const normalized = normalizeTileCode(code);
    if (!normalized) return null;
    return TILE_ASSET_MAP[normalized[0]] ? TILE_ASSET_MAP[normalized[0]][normalized[1]] || null : null;
  }

  function getTileLabel(code) {
    const normalized = normalizeTileCode(code);
    if (!normalized) return code ? String(code) : '';
    return TILE_LABEL_MAP[normalized[0]] ? TILE_LABEL_MAP[normalized[0]][normalized[1]] || normalized : normalized;
  }

  function normalizeTile(tile, options = {}) {
    if (!tile) {
      return null;
    }
    if (typeof tile === 'string') {
      const code = normalizeTileCode(tile);
      return code ? {
        code,
        asset: getTileAsset(code),
        label: getTileLabel(code),
        hidden: false,
        kind: options.kind || 'flat',
        extraClass: options.extraClass || ''
      } : null;
    }
    if (typeof tile !== 'object') return null;
    const code = normalizeTileCode(tile.code || tile.tileCode || tile.label || '');
    return {
      code,
      asset: tile.asset || getTileAsset(code),
      label: tile.label || getTileLabel(code),
      hidden: Boolean(tile.hidden),
      kind: tile.kind || options.kind || 'flat',
      size: tile.size || options.size || '',
      extraClass: tile.extraClass || options.extraClass || ''
    };
  }

  function normalizeTileList(tiles, options = {}) {
    return Array.isArray(tiles)
      ? tiles.map((tile) => normalizeTile(tile, options)).filter(Boolean)
      : [];
  }

  function normalizeIndicatorTiles(tiles) {
    return Array.from({ length: 5 }, (_, index) => {
      const tile = Array.isArray(tiles) ? tiles[index] || null : null;
      if (!tile) {
        return { hidden: true, label: '牌背', size: 'small' };
      }
      if (typeof tile === 'object' && tile.open === false) {
        const normalized = normalizeTile(tile, { size: 'small' }) || {};
        return {
          ...normalized,
          hidden: true,
          size: 'small'
        };
      }
      const normalized = normalizeTile(tile, { size: 'small' });
      return normalized || { hidden: true, label: '牌背', size: 'small' };
    });
  }

  function getRoundReasonLabel(reason) {
    const labels = {
      'exhaustive-draw': '荒牌平局',
      'nine-kinds': '九种九牌',
      'four-riichi': '四家立直',
      'four-wind': '四风连打',
      'four-kan-draw': '四杠散了',
      'triple-ron': '三家和了',
      draw: '流局'
    };
    return labels[reason] || reason || '流局';
  }

  function deriveRankLabel(result, payload = {}) {
    if (payload && payload.rankLabel) return payload.rankLabel;
    if (!result) return '';
    const damanguan = Number(result.damanguan || 0);
    if (damanguan > 0) {
      return damanguan > 1 ? `${damanguan}倍役满` : '役满';
    }
    const fanshu = Number(result.fanshu || 0);
    const fu = Number(result.fu || 0);
    if (fanshu >= 13) return '累计役满';
    if (fanshu >= 11) return '三倍满';
    if (fanshu >= 8) return '倍满';
    if (fanshu >= 6) return '跳满';
    if (fanshu >= 5) return '满贯';
    if (fanshu === 4 && fu >= 40) return '满贯';
    if (fanshu === 3 && fu >= 70) return '满贯';
    if (fu > 0) return `${fu}符`;
    if (fanshu > 0) return `${fanshu}番`;
    return '';
  }

  function buildScoreRows(payload, winnerSeat, scoreMap, fenpei, winnerSeatSet = null) {
    const seatOrder = Array.isArray(payload.seatOrder) && payload.seatOrder.length
      ? payload.seatOrder.slice()
      : DEFAULT_SEAT_ORDER.slice();
    const seatLabels = payload.seatLabels && typeof payload.seatLabels === 'object'
      ? payload.seatLabels
      : DEFAULT_SEAT_LABELS;
    const seatNames = payload.seatNames && typeof payload.seatNames === 'object'
      ? payload.seatNames
      : {};

    return seatOrder.map((seatKey, seatIndex) => {
      const finalScore = Number(scoreMap && scoreMap[seatKey] || 0);
      const delta = payload.seatDeltaMap && typeof payload.seatDeltaMap === 'object'
        ? Number(payload.seatDeltaMap[seatKey] || 0)
        : Number(Array.isArray(fenpei) ? fenpei[seatIndex] || 0 : 0);
      const isWinner = winnerSeatSet instanceof Set ? winnerSeatSet.has(seatKey) : seatKey === winnerSeat;
      return {
        seatKey,
        seat: seatLabels[seatKey] || seatKey,
        name: seatNames[seatKey] || '',
        base: formatScore(finalScore - delta),
        finalScore: formatScore(finalScore),
        delta,
        winner: isWinner
      };
    }).sort((left, right) => Number(Boolean(right.winner)) - Number(Boolean(left.winner)));
  }

  function buildRoundLabel(roundResult = {}, fallbackText = '') {
    if (fallbackText) return `${fallbackText}局`;
    const wind = ROUND_WIND_LABELS[Number(roundResult.zhuangfeng || 0)] || '东';
    const jushu = Number(roundResult.jushu || 0) + 1;
    return `${wind}${jushu}局`;
  }

  function buildYakuList(result) {
    return result && Array.isArray(result.hupai)
      ? result.hupai.map((item) => ({
          name: localizeText(item && item.name ? item.name : ''),
          han: item && item.fanshu != null ? item.fanshu : ''
        })).filter((item) => item.name)
      : [];
  }

  function getWinnerHands(payload) {
    return payload && payload.winnerHands && typeof payload.winnerHands === 'object'
      ? payload.winnerHands
      : {};
  }

  function buildSingleWinnerModel(payload, roundResult, winnerSeat, seatNames, scoreRows) {
    const result = roundResult && roundResult.result ? roundResult.result : null;
    const winnerHands = getWinnerHands(payload);
    const handTiles = normalizeTileList(
      payload.handTiles || winnerHands[winnerSeat] || [],
      { kind: 'flat' }
    );
    const winningTile = normalizeTileList(
      payload.winningTile
        ? [payload.winningTile]
        : [roundResult && (roundResult.rongpai || roundResult.tileCode || null)].filter(Boolean)
    , { kind: 'flat', extraClass: 'is-winning' });

    return {
      mode: 'single-hule',
      winner: {
        seat: winnerSeat,
        name: seatNames[winnerSeat] || ''
      },
      showWinner: true,
      handTiles,
      winningTile,
      winners: [
        {
          seat: winnerSeat,
          name: seatNames[winnerSeat] || '',
          fromSeat: roundResult && roundResult.fromSeat ? roundResult.fromSeat : null,
          fromName: roundResult && roundResult.fromSeat ? (seatNames[roundResult.fromSeat] || '') : '',
          handTiles,
          winningTile,
          yakuList: buildYakuList(result),
          total: {
            stamp: deriveRankLabel(result, payload),
            han: result && Number(result.fanshu || 0),
            pointText: formatScore(result && result.defen),
            unit: payload.defenUnit || '点'
          }
        }
      ],
      titleWords: Array.isArray(payload.titleWords) && payload.titleWords.length
        ? payload.titleWords.map(localizeText)
        : (result && Array.isArray(result.hupai)
          ? result.hupai.slice(0, 2).map((item) => localizeText(item && item.name)).filter(Boolean)
          : ['和了']),
      subtitle: roundResult && roundResult.fromSeat
        ? `点和 · 放铳 ${seatNames[roundResult.fromSeat] || roundResult.fromSeat}`
        : '自摸和牌',
      yakuList: buildYakuList(result),
      total: {
        stamp: deriveRankLabel(result, payload),
        han: result && Number(result.fanshu || 0),
        pointText: formatScore(result && result.defen),
        unit: payload.defenUnit || '点'
      },
      scoreRows
    };
  }

  function buildMultiWinnerModel(payload, roundResult, seatNames, scoreRows) {
    const winnerHands = getWinnerHands(payload);
    const winners = Array.isArray(roundResult && roundResult.winners)
      ? roundResult.winners.map((entry) => {
          const seat = entry && entry.winnerSeat ? entry.winnerSeat : null;
          const result = entry && entry.result ? entry.result : null;
          const handTiles = normalizeTileList(winnerHands[seat] || [], { kind: 'flat' });
          const winningTile = normalizeTileList([entry && (entry.rongpai || entry.tileCode || null)].filter(Boolean), {
            kind: 'flat',
            extraClass: 'is-winning'
          });
          return {
            seat,
            name: seat ? (seatNames[seat] || '') : '',
            fromSeat: entry && entry.fromSeat ? entry.fromSeat : null,
            fromName: entry && entry.fromSeat ? (seatNames[entry.fromSeat] || '') : '',
            handTiles,
            winningTile,
            yakuList: buildYakuList(result),
            total: {
              stamp: deriveRankLabel(result, payload),
              han: result && Number(result.fanshu || 0),
              pointText: formatScore(result && result.defen),
              unit: payload.defenUnit || '点'
            }
          };
        }).filter((entry) => entry.seat)
      : [];

    return {
      mode: 'multi-hule',
      winner: winners[0] || null,
      showWinner: false,
      winners,
      handTiles: [],
      winningTile: [],
      titleWords: [`${Math.max(2, Number(roundResult && roundResult.winnerCount || winners.length || 2))}家`, '和了'],
      subtitle: roundResult && roundResult.fromSeat
        ? `多家点和 · 放铳 ${seatNames[roundResult.fromSeat] || roundResult.fromSeat}`
        : '多家和牌',
      yakuList: [],
      total: null,
      scoreRows
    };
  }

  function buildDrawModel(payload, roundResult, seatNames, scoreRows) {
    const reasonLabel = getRoundReasonLabel(roundResult && roundResult.reason);
    return {
      mode: 'draw',
      winner: null,
      showWinner: false,
      winners: [],
      handTiles: [],
      winningTile: [],
      titleWords: [reasonLabel],
      subtitle: Array.isArray(roundResult && roundResult.tenpaiSeats) && roundResult.tenpaiSeats.length
        ? `${roundResult.tenpaiSeats.length}家听牌`
        : '流局',
      yakuList: [
        {
          name: reasonLabel,
          han: Array.isArray(roundResult && roundResult.tenpaiSeats) && roundResult.tenpaiSeats.length
            ? `${roundResult.tenpaiSeats.length}家听牌`
            : '流局'
        }
      ],
      total: {
        stamp: reasonLabel,
        han: '',
        pointText: '',
        unit: payload.defenUnit || '点'
      },
      scoreRows,
      drawSummary: {
        tenpaiSeats: Array.isArray(roundResult && roundResult.tenpaiSeats)
          ? roundResult.tenpaiSeats.map((seatKey) => ({
              seatKey,
              name: seatNames[seatKey] || seatKey
            }))
          : [],
        notenSeats: Array.isArray(roundResult && roundResult.notenSeats)
          ? roundResult.notenSeats.map((seatKey) => ({
              seatKey,
              name: seatNames[seatKey] || seatKey
            }))
          : []
      }
    };
  }

  function buildSettlementViewModel(payload = {}) {
    const roundResult = payload && payload.roundResult ? clone(payload.roundResult) : null;
    if (!roundResult || !roundResult.type) return null;

    const seatNames = payload.seatNames && typeof payload.seatNames === 'object'
      ? payload.seatNames
      : {};
    const winnerSeat = roundResult.winnerSeat || null;
    const winnerSeatSet = roundResult.multiHule && Array.isArray(roundResult.winners)
      ? new Set(roundResult.winners.map((entry) => entry && entry.winnerSeat).filter(Boolean))
      : new Set(winnerSeat ? [winnerSeat] : []);
    const result = roundResult && roundResult.result ? roundResult.result : null;
    const scoreMap = roundResult && roundResult.scores ? roundResult.scores : {};
    const fenpei = roundResult.type === 'draw'
      ? (Array.isArray(roundResult.fenpei) ? roundResult.fenpei.slice() : [0, 0, 0, 0])
      : (result && Array.isArray(result.fenpei) ? result.fenpei.slice() : [0, 0, 0, 0]);
    const scoreRows = buildScoreRows(payload, winnerSeat, scoreMap, fenpei, winnerSeatSet);
    const base = {
      type: roundResult.type,
      roundLabel: buildRoundLabel(roundResult, localizeText(payload.roundText || '')),
      omoteDoraTiles: normalizeIndicatorTiles(
        payload.doraIndicators || payload.baopai || (payload.wallState && payload.wallState.doraIndicators) || []
      ),
      uraDoraTiles: normalizeIndicatorTiles(
        payload.uraDoraIndicators || payload.fubaopai || (payload.wallState && payload.wallState.uraDoraIndicators) || []
      ),
      controls: {
        canContinue: true,
        canSkipAnimation: true
      },
      paoSummary: roundResult.baojiaSeat
        ? `包牌: ${seatNames[roundResult.baojiaSeat] || roundResult.baojiaSeat}${roundResult.baojiaYaku ? ` / ${localizeText(roundResult.baojiaYaku)}` : ''}`
        : ''
    };

    if (roundResult.type === 'draw') {
      return {
        ...base,
        ...buildDrawModel(payload, roundResult, seatNames, scoreRows)
      };
    }

    if (roundResult.multiHule && Array.isArray(roundResult.winners) && roundResult.winners.length > 1) {
      return {
        ...base,
        ...buildMultiWinnerModel(payload, roundResult, seatNames, scoreRows)
      };
    }

    return {
      ...base,
      ...buildSingleWinnerModel(payload, roundResult, winnerSeat, seatNames, scoreRows)
    };
  }

  global.AceMahjongBuildSettlementViewModel = buildSettlementViewModel;
})(window);
