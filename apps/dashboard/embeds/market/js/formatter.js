const COMPACT_SUFFIXES = [
  { value: 1e12, suffix: "T" },
  { value: 1e9, suffix: "B" },
  { value: 1e6, suffix: "M" },
  { value: 1e3, suffix: "K" },
];

export function formatCompactNumber(value, { digits = 2, forceSign = false } = {}) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "--";
  }

  const abs = Math.abs(numeric);
  const sign = numeric < 0 ? "-" : forceSign && numeric > 0 ? "+" : "";
  if (abs < 1000) {
    return `${sign}${trimTrailingZeros(abs.toFixed(abs < 100 ? digits : 1))}`;
  }

  const unit = COMPACT_SUFFIXES.find((item) => abs >= item.value) || COMPACT_SUFFIXES[COMPACT_SUFFIXES.length - 1];
  const scaled = abs / unit.value;
  const decimals = scaled >= 100 ? 0 : scaled >= 10 ? 1 : digits;
  return `${sign}${scaled.toFixed(decimals)}${unit.suffix}`;
}

export function formatMoney(value, { compact = true, digits = 2, forceSign = false } = {}) {
  if (compact) {
    return formatCompactNumber(value, { digits, forceSign });
  }

  return formatFullNumber(value, { digits, forceSign });
}

export function formatUnits(value, { compact = true, digits = 2, forceSign = false } = {}) {
  if (compact) {
    return formatCompactNumber(value, { digits, forceSign });
  }

  return formatFullNumber(value, { digits, forceSign });
}

export function formatFullNumber(value, { digits = 1, forceSign = false } = {}) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "--";
  }

  const sign = numeric < 0 ? "-" : forceSign && numeric > 0 ? "+" : "";
  const abs = Math.abs(numeric);
  const fixed = abs.toFixed(digits);
  const [integerPart, fractionPart] = fixed.split(".");
  const grouped = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fractionPart && Number(fractionPart) !== 0
    ? `${sign}${grouped}.${fractionPart}`
    : `${sign}${grouped}`;
}

function trimTrailingZeros(text) {
  return text.replace(/(\.\d*?[1-9])0+$/u, "$1").replace(/\.0+$/u, "");
}
