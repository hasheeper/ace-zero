/**
 * Shared AceZero currency/chip utility.
 * Internal unit: 1 = 1 silver.
 * Display unit: gold funds with up to 2 decimals.
 */
(function (global) {
  'use strict';

  const CHIP_TABLE = [
    { value: 100000, color: 'black', label: '黑晶', lore: '1000金' },
    { value: 10000, color: 'purple', label: '紫晶', lore: '100金' },
    { value: 1000, color: 'red', label: '绯红', lore: '10金' },
    { value: 100, color: 'blue', label: '深蓝', lore: '1金' },
    { value: 10, color: 'green', label: '翠绿', lore: '10银' },
    { value: 1, color: 'white', label: '纯白', lore: '1银' }
  ];

  const SILVER_PER_GOLD = 100;

  function _normalizeSilverValue(silver) {
    return Math.round(Number(silver) || 0);
  }

  function _formatGoldStringFromSilver(silver) {
    var gold = _normalizeSilverValue(silver) / SILVER_PER_GOLD;
    return gold.toFixed(2).replace(/\.?0+$/, '');
  }

  function formatCurrency(silver, opts) {
    opts = opts || {};
    var mode = opts.mode || 'short';
    var val = _normalizeSilverValue(silver);
    var negative = val < 0;
    if (negative) val = -val;

    if (mode === 'chip') return (negative ? '-' : '') + _formatChipDecompose(val);

    var unit = mode === 'full' ? '金弗' : '金';
    return (negative ? '-' : '') + _formatGoldStringFromSilver(val) + unit;
  }

  function formatCompact(silver) {
    var val = _normalizeSilverValue(silver);
    var negative = val < 0;
    if (negative) val = -val;
    return (negative ? '-' : '') + _formatGoldStringFromSilver(val) + '金';
  }

  function formatAmount(silver) {
    var val = _normalizeSilverValue(silver);
    var negative = val < 0;
    if (negative) val = -val;
    return (negative ? '-' : '') + _formatGoldStringFromSilver(val) + '金';
  }

  function decomposeChips(silver) {
    var remaining = Math.round(silver) || 0;
    var result = [];
    for (var i = 0; i < CHIP_TABLE.length; i++) {
      var chip = CHIP_TABLE[i];
      if (remaining >= chip.value) {
        var count = Math.floor(remaining / chip.value);
        remaining = remaining % chip.value;
        result.push({ color: chip.color, label: chip.label, count: count, value: chip.value });
      }
    }
    return result;
  }

  function _formatChipDecompose(silver) {
    var stacks = decomposeChips(silver);
    if (stacks.length === 0) return '0';
    return stacks.map(function (s) { return s.count + '×' + s.label; }).join(' + ');
  }

  function getChipColor(silver) {
    var val = Math.abs(Math.round(silver)) || 0;
    if (val >= 100000) return 'black';
    if (val >= 10000) return 'purple';
    if (val >= 1000) return 'red';
    if (val >= 100) return 'blue';
    if (val >= 10) return 'green';
    return 'white';
  }

  function getChipVisual(silver) {
    var val = Math.abs(Math.round(silver)) || 0;
    var count = 2;
    if (val > 100) count = 3;
    if (val > 500) count = 4;
    if (val > 2000) count = 5;
    if (val > 5000) count = 6;
    return { count: count, color: getChipColor(val) };
  }

  var GOLD_CSS = 'color:#CFB53B;font-weight:700';
  var SILVER_CSS = 'color:#C0C0C0;font-weight:700';

  function formatHtml(silver) {
    var val = _normalizeSilverValue(silver);
    var negative = val < 0;
    if (negative) val = -val;
    var goldString = _formatGoldStringFromSilver(val);
    var parts = goldString.split('.');
    var whole = parts[0] || '0';
    var fraction = parts[1] || '';
    var prefix = negative ? '-' : '';

    if (!fraction) {
      return prefix + '<span style="' + GOLD_CSS + '">' + whole + '金</span>';
    }
    return prefix
      + '<span style="' + GOLD_CSS + '">' + whole + '</span>'
      + '<span style="' + SILVER_CSS + '">.' + fraction + '金</span>';
  }

  function formatHtmlAmount(silver) {
    var val = _normalizeSilverValue(silver);
    var negative = val < 0;
    if (negative) val = -val;
    return (negative ? '-' : '') + '<span style="' + GOLD_CSS + '">' + _formatGoldStringFromSilver(val) + '金</span>';
  }

  global.Currency = {
    CHIP_TABLE: CHIP_TABLE,
    SILVER_PER_GOLD: SILVER_PER_GOLD,
    format: formatCurrency,
    compact: formatCompact,
    amount: formatAmount,
    html: formatHtml,
    htmlAmount: formatHtmlAmount,
    decompose: decomposeChips,
    chipColor: getChipColor,
    chipVisual: getChipVisual
  };
})(typeof window !== 'undefined' ? window : global);
