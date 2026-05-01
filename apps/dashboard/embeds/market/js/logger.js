const STORAGE_KEY = "acezero-market-dev-log-v1";
const MAX_ENTRIES = 500;

let memoryFallback = [];

export function logMarketEvent(type, message, details = {}) {
  const entry = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    ts: new Date().toISOString(),
    type,
    message,
    details: sanitizeDetails(details),
  };

  const entries = getMarketLogEntries();
  entries.unshift(entry);
  persistEntries(entries.slice(0, MAX_ENTRIES));
  return entry;
}

export function getMarketLogEntries() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [...memoryFallback];
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      memoryFallback = [...parsed];
      return [...parsed];
    }
    return [];
  } catch {
    return [...memoryFallback];
  }
}

export function clearMarketLog() {
  memoryFallback = [];
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
  } catch {
    // no-op
  }
}

export function initGlobalLogHandlers() {
  window.addEventListener("error", (event) => {
    logMarketEvent("runtime-error", event.message || "Unknown runtime error", {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    logMarketEvent("promise-rejection", "Unhandled promise rejection", {
      reason: reason?.message || String(reason),
    });
  });
}

function persistEntries(entries) {
  memoryFallback = [...entries];
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // no-op
  }
}

function sanitizeDetails(details) {
  if (!details || typeof details !== "object") {
    return details;
  }

  try {
    return JSON.parse(JSON.stringify(details));
  } catch {
    return { note: "unserializable-details" };
  }
}
