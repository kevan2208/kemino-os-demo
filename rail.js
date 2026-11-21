// DESKTOP SHELL ("B: persistent left strip", You 8 Nov): a left strip on every screen (buddies + pace, ONE decision card, thread list),
// the chosen view on the right. This file holds the PURE parts (tested in Node) and a few small DOM builders that take the app's h() and data as
// arguments, so app.js only has small hooks. Desktop only (>= 900px): nothing here is ever drawn on the phone. Elements only: no HTML strings, no inline styles.

export const RAIL_KEY = "ko.rail";
/** Top to bottom, always in this order (You's rule). */
export const RAIL_ORDER = ["buddies", "decision", "threads"];
/** The four views, in the order of the top-bar tabs. */
export const VIEW_TABS = [["list", "Today"], ["office", "Office"], ["map", "Map"], ["all", "All"]];

/** Is the strip collapsed on this device? Anything unreadable means "open". */
export function readCollapsed(storage = globalThis.localStorage) {
  try { return storage.getItem(RAIL_KEY) === "collapsed"; } catch { return false; }
}
export function writeCollapsed(on, storage = globalThis.localStorage) {
  try { storage.setItem(RAIL_KEY, on ? "collapsed" : "open"); return true; } catch { return false; }
}

const num = (v) => typeof v === "number" && Number.isFinite(v);
const WEEK_MS = 7 * 86400_000;
const isWeekly = (label) => /week|7\s*d/i.test(String(label || ""));

/** Is this plan ahead of pace? The server decides (pace.ts, same maths as plan/head/pace.py: weekly used% vs share of the week passed; Kemino at or under, kbb 10+ points under)
 *  and sends it as `plan.pace`; plans without one (Codex, Antigravity, an old reading) fall back to aheadOfPace on their windows. Pure. */
export function planAhead(p, now = Date.now()) {
  if (!p) return false;
  if (p.pace && typeof p.pace.ahead === "boolean") return p.pace.ahead;
  return (p.windows || []).some((w) => aheadOfPace(w, now));
}

/** THE fallback pace rule for plans the server does not pace (also used by the running-hot nudge in hot.js): a weekly window with an exact reset time that is used faster than the week has passed
 *  (10 points of slack, and at least 25% used; early in the week a few points are noise). Pure. */
export function aheadOfPace(w, now = Date.now()) {
  if (!w || !isWeekly(w.label) || !num(w.usedPct)) return false;
  const end = w.resetsAt ? Date.parse(w.resetsAt) : NaN;
  if (!Number.isFinite(end)) return false;
  const passed = Math.min(1, Math.max(0, 1 - (end - now) / WEEK_MS)) * 100;
  return w.usedPct >= 25 && w.usedPct > passed + 10;
}

/**
 * The ONE pace line under the buddies, from the usage the app already reads (/api/usage). Pure.
 * - "<Name> ahead of pace": a weekly window that has an exact reset time and is used faster than the week has passed (10 points of slack, and at least 25% used).
 * - "<Name> wk 25% left": the lowest weekly window under 40% left (so Codex, which only gives a reset day, is still named).
 * Returns { text, tone: "amber" | "calm" } ("calm" = nothing to flag: "All on pace"), or null when there is no reading at all.
 */
export function paceLine(usage, now = Date.now()) {
  const plans = (usage && usage.plans) || [];
  if (!plans.length) return null;
  const ahead = [], low = [];
  for (const p of plans) {
    if (p.limited || p.limitedUntil) continue;
    if (planAhead(p, now) && !ahead.includes(p.name)) ahead.push(p.name);
    for (const w of p.windows || []) {
      if (!isWeekly(w.label) || !num(w.usedPct) || !num(w.leftPct)) continue;
      if (w.leftPct < 40) low.push({ name: p.name, left: Math.round(w.leftPct) });
    }
  }
  low.sort((a, b) => a.left - b.left);
  const parts = [];
  if (ahead.length) parts.push(ahead.length > 1 ? ahead.slice(0, -1).join(", ") + " and " + ahead[ahead.length - 1] + " ahead of pace" : ahead[0] + " ahead of pace");
  // name the lowest weekly window, but not twice when it is the one already named as ahead of pace and nothing else is low
  const worst = low.find((x) => !ahead.includes(x.name)) || low[0];
  if (worst) parts.push(worst.name + " wk " + worst.left + "% left");
  if (!parts.length) return { text: "All on pace", tone: "calm" };
  return { text: parts.join(" · "), tone: "amber" };
}

/** Long ids and links that must wrap and read as a small code chip: t3-thread://… links and 24+ char tokens that mix letters and digits (uuid-like). */
export const ID_RE = /(?:t3-[a-z]+:\/\/\S+|\b(?=[\w%:.-]*\d)[A-Za-z0-9][\w%:.-]{23,}\b)/g;
/** Split a text into plain and id parts. Pure. A trailing . , ; ) stays outside the chip. */
export function idParts(text) {
  const out = []; let last = 0; const s = String(text ?? "");
  for (const m of s.matchAll(ID_RE)) {
    let v = m[0];
    const tail = /[.,;:)\]]+$/.exec(v);
    if (tail) v = v.slice(0, v.length - tail[0].length);
    if (!v) continue;
    if (m.index > last) out.push({ id: false, text: s.slice(last, m.index) });
    out.push({ id: true, text: v });
    last = m.index + v.length;
  }
  if (last < s.length) out.push({ id: false, text: s.slice(last) });
  return out;
}
/** Turn raw ids inside the text nodes of a rendered message into <code class="idchip">. Skips code, pre, links and chips already made. */
export function chipIds(root) {
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, 4 /* SHOW_TEXT */);
  const todo = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.parentElement && n.parentElement.closest("code, pre, a, .idchip")) continue;
    ID_RE.lastIndex = 0;
    if (ID_RE.test(n.nodeValue)) todo.push(n);
  }
  for (const n of todo) {
    const parts = idParts(n.nodeValue);
    if (!parts.some((p) => p.id)) continue;
    const frag = doc.createDocumentFragment();
    for (const p of parts) {
      if (!p.id) { frag.append(doc.createTextNode(p.text)); continue; }
      const c = doc.createElement("code"); c.className = "idchip"; c.textContent = p.text; frag.append(c);
    }
    n.replaceWith(frag);
  }
}

/** What the Inspector can honestly show for the open thread. Pure. Only data the app already has:
 *  helpers = the open thread's own helper threads (from the Today state); files = paths of its "Edited file" steps in the loaded messages;
 *  tokens = null because neither the state nor the chat payload carries token usage yet. */
export function inspectorModel({ openId, data, chat }) {
  const all = data ? [...(data.working || []), ...(data.done || [])] : [];
  const root = all.find((g) => g.id === openId);
  const kid = !root ? all.flatMap((g) => g.helpers || []).find((k) => k.id === openId) : null;
  const helpers = root ? (root.helpers || []).map((k) => ({ id: k.id, title: k.title, status: k.status })) : [];
  const files = [];
  for (const it of (chat && chat.items) || []) {
    if (it.role === "tool" && it.tool === "file" && it.text && it.text !== "edited files" && !files.includes(it.text)) files.push(it.text);
  }
  const u = chat && chat.usage;
  const tokens = u && (num(u.total) || num(u.input) || num(u.output)) ? { total: u.total ?? (u.input || 0) + (u.output || 0), input: u.input ?? null, output: u.output ?? null } : null;
  return { helpers, isHelper: !!kid, files, loaded: !!chat, filesNote: chat && chat.total > chat.items.length ? "from the latest " + chat.items.length + " of " + chat.total + " items" : "", tokens };
}

/** The tab counts. Today = what needs him, Office = threads at work, Map = none, All = every thread once the list is loaded. Pure. */
export function tabCounts({ need = 0, working = 0, all = 0 }) {
  return { list: need || 0, office: working || 0, map: 0, all: all || 0 };
}

// ---------------- DOM builders (browser only; h = the app's element builder) ----------------

/** The top bar on the desktop: ONE line. brand | tabs with counts | project | search | spacer | + New thread | Live | More. */
export function desktopTopBar({ h, mode, counts, setMode, pill, focusEl, search, onNew, onMore, bell, resume, code = null, ask = null, update = false }) {
  const tabs = h("div", { class: "tabs", role: "tablist", "aria-label": "View" }, VIEW_TABS.map(([k, label], i) => {
    const n = counts[k];
    return h("button", { class: "tab", role: "tab", "aria-selected": String(mode === k), "data-view": k, onclick: () => setMode(k), title: label + " (Alt+" + (i + 1) + ")" },
      label, n ? h("span", { class: "tcount", "aria-label": n + (k === "list" ? " need you" : k === "office" ? " working" : "") }, String(n)) : null);
  }));
  return [h("span", { class: "brand" }, "Kemino OS"), h("div", { class: "buddy-row buddy-top", id: "buddy-top" }), tabs, focusEl, search, h("span", { class: "grow" }),
    resume, h("button", { class: "newbtn", "data-act": "new-thread", onclick: onNew, title: "Start a new thread in the open thread's project" }, h("span", { "aria-hidden": "true" }, "+"), h("span", { class: "nb-t" }, " New thread")),
    ask, pill, code, bell, h("button", { class: "morebtn", "data-act": "more", onclick: onMore, "aria-label": update ? "More, update ready" : null, title: "Tour, shortcuts, features and everything else" }, "More", update ? h("i", { class: "upd-dot", "aria-hidden": "true" }) : null)];
}

/** The collapsed strip: a slim rail with the expand button and the needs-you count (the buddies live in the top bar). */
export function collapsedRail({ h, vms, needCount, expand, openSheet }) {
  return h("div", { class: "rail-c" },
    h("button", { class: "rail-toggle", type: "button", "data-act": "rail-expand", "aria-expanded": "false", "aria-label": "Expand the side strip", title: "Expand the side strip", onclick: expand }, "›"),
    needCount ? h("div", { class: "rc-need", role: "status", title: needCount + " need you" }, h("i", { class: "rc-dot", "aria-hidden": "true" }), h("b", {}, String(needCount)), h("span", { class: "sr" }, " need you")) : null);
}

/** One section of the Inspector: a heading and either rows or a quiet "not available yet". */
function inspSection({ h, title, rows, empty, note }) {
  return h("section", { class: "insp-sec" }, h("h3", {}, title), rows && rows.length ? h("ul", {}, rows) : h("p", { class: "insp-none" }, empty), note ? h("p", { class: "insp-note" }, note) : null);
}
/** The right-hand Inspector: helpers, files touched, token usage. Real data only. */
export function inspectorNode({ h, model, openThread, badge, tn }) {
  const helperRows = model.helpers.slice(0, 40).map((k) => h("li", {}, h("button", { class: "insp-link", type: "button", onclick: () => openThread(k.id) }, badge ? badge(k.status, 16) : null, h("span", {}, tn ? tn(k.id, k.title) : k.title))));
  const fileRows = model.files.slice(0, 40).map((f) => h("li", {}, h("code", { class: "idchip", title: f }, f)));
  return [
    inspSection({ h, title: "Helpers", rows: helperRows, empty: model.isHelper ? "This is a helper thread." : "No helpers on this thread." }),
    inspSection({ h, title: "Files touched", rows: fileRows, empty: model.loaded ? "No file edits in the loaded messages." : "Loading…", note: fileRows.length ? model.filesNote : "" }),
    inspSection({ h, title: "Token usage", rows: model.tokens ? [h("li", {}, "Total " + model.tokens.total.toLocaleString("en-GB"))] : null, empty: "Not available yet." }),
  ];
}
