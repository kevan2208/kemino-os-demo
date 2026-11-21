// Context health badges: how big a thread has grown and whether its cache is warm. The server sends `context` per thread
// ({ usedTokens, maxTokens, level: ok|warn|hot, cacheWarm, cacheKnown, cacheLeftMs, coldForMs, reason }); this file only words and draws it.
// Pure text helpers are tested in Node. Classes only, no inline style, no innerHTML. Colours live in context.css (never teal: teal means "needs you").

/** 112000 -> "112K", 1250000 -> "1.3M". */
export function fmtTokens(n) {
  n = Math.max(0, Number(n) || 0);
  return n >= 1_000_000 ? (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M" : n >= 1000 ? Math.round(n / 1000) + "K" : String(n);
}

/** Minutes up to an hour, then hours, then days: "41m", "3h", "2d". */
export function fmtSpan(ms) {
  const m = Math.max(0, Math.round((Number(ms) || 0) / 60_000));
  return m < 60 ? Math.max(1, m) + "m" : m < 48 * 60 ? Math.round(m / 60) + "h" : Math.round(m / 1440) + "d";
}

/**
 * The words for one thread. `row` is the short badge for lists and desks (null while level is ok);
 * `head` is the line for the chat header (always present when there is data: ok shows size and cache only);
 * `reason` is the one-line explanation, only for warn and hot.
 */
export function contextText(c) {
  if (!c || !Number.isFinite(c.usedTokens)) return null;
  const size = fmtTokens(c.usedTokens), level = c.level === "hot" || c.level === "warn" ? c.level : "ok";
  const cache = !c.cacheKnown ? "" : c.cacheWarm ? "cache warm " + fmtSpan(c.cacheLeftMs) : "cache cold " + fmtSpan(c.coldForMs);
  const word = level === "hot" ? "big" : level === "warn" ? "growing" : "";
  const head = [size, word, cache].filter(Boolean).join(" · ");
  const row = level === "ok" ? null : [size, word, !c.cacheWarm && c.cacheKnown ? cache : ""].filter(Boolean).join(" · ");
  return { level, size, head, row, reason: level === "ok" ? null : c.reason || null, aria: "Context " + head + (level === "ok" ? "" : ". " + (c.reason || "")) };
}

const make = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

/** Small badge for a list row, a helper row or an office desk: only when warn or hot, otherwise null. */
export function contextBadge(c) {
  const t = contextText(c);
  if (!t || !t.row) return null;
  const b = make("span", "ctx ctx-" + t.level, t.row);
  b.setAttribute("data-ctx", t.level);
  b.title = t.reason || "";
  b.setAttribute("aria-label", t.aria);
  return b;
}

/** Chat header line: always the tiny muted size and cache; for warn and hot also the reason on a second line. Null with no data. */
export function contextHead(c) {
  const t = contextText(c);
  if (!t) return null;
  const box = make("div", "ctx-head");
  box.setAttribute("data-ctx", t.level);
  box.append(make("span", "ctx ctx-" + t.level, t.head));
  if (t.reason) box.append(make("span", "ctx-why", t.reason));
  return box;
}

/** Office desk: put the badge on the state line (same row, no extra height). */
export function addDeskContext(stateEl, c) {
  const b = contextBadge(c);
  if (b) stateEl.append(b);
}
