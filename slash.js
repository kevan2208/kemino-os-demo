// Slash autocomplete for the message box, plus the small "Goal" card's helper. A calm list above the box (max 6 rows). Choosing a row only puts
// text such as `/review ` into the box; it NEVER sends. The list comes from the server (GET /api/slash?thread=, read-only, cached there 60 s).
// No innerHTML, no inline script or style (CSP).
export const MAX_ROWS = 6;
const FRESH_MS = 60_000;

/** What the box text asks for: { query, only } or null. `/xyz` (no space yet) lists commands; `/goal xyz` lists only the `goal …` sub-commands. Pure. */
export function triggerOf(text) {
  const t = String(text ?? "");
  let m = /^\/([^\s/]*)$/.exec(t);
  if (m) return { query: m[1], only: null };
  m = /^\/goal ([^\s]*)$/i.exec(t);
  if (m) return { query: m[1], only: "goal " };
  return null;
}

/** Fuzzy score of `q` in `name` (higher is better, -1 = no match): prefix, then word start, then substring, then letters in order. Pure. */
export function score(name, q) {
  const n = name.toLowerCase(), s = q.toLowerCase();
  if (!s) return 1;
  if (n.startsWith(s)) return 100 - n.length / 100;
  const w = n.search(new RegExp("[\\s:_.-]" + s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  if (w >= 0) return 80 - w / 100;
  const i = n.indexOf(s);
  if (i >= 0) return 60 - i / 100;
  let at = 0;
  for (const ch of s) { at = n.indexOf(ch, at) + 1; if (!at) return -1; }
  return 20;
}

/** The rows to show for this text from the server's list: ranked, at most MAX_ROWS. Pure. */
export function rowsFor(list, text) {
  const t = triggerOf(text);
  if (!t) return [];
  const pool = (Array.isArray(list) ? list : []).filter((c) => (t.only ? c.name.startsWith(t.only) : !c.name.includes(" ") || false));
  const out = [];
  pool.forEach((c, i) => {
    const sub = t.only ? c.name.slice(t.only.length) : c.name;
    const sc = score(sub, t.query);
    if (sc >= 0) out.push({ c, sc, i });
  });
  out.sort((a, b) => b.sc - a.sc || a.i - b.i);
  return out.slice(0, MAX_ROWS).map((x) => x.c);
}

/** Text to put in the box for a row: `/name ` (a command that takes input) or `/name` for a finished one such as `/goal clear`. Pure. */
export function insertText(c) { return "/" + c.name + (c.name.includes(" ") ? "" : " "); }

/**
 * createSlash({ h, ta, threadId }) -> { el, key(e), fill(text), sync() }. `el` goes just above the composer (its parent is position:relative).
 * `key(e)` is called first from the box's keydown: true means "handled, do nothing else" (so Enter never sends while the list picks a row).
 */
export function createSlash({ h, ta, threadId, fetchJson }) {
  const get = fetchJson || (async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(String(r.status)); return r.json(); });
  const cache = new Map(); // thread -> { at, list }
  let rows = [], sel = 0, dismissed = "", token = 0;
  const ul = h("ul", { class: "slash-list", id: "slash-list", role: "listbox", "aria-label": "Commands" });
  const el = h("div", { class: "slash", hidden: true }, ul);

  function hide() { el.hidden = true; ta.setAttribute("aria-expanded", "false"); ta.removeAttribute("aria-activedescendant"); rows = []; }
  function draw() {
    if (!rows.length) return hide();
    ul.replaceChildren(...rows.map((c, i) => h("li", { class: "slash-row", id: "slash-" + i, role: "option", "aria-selected": i === sel ? "true" : "false",
      // mousedown is stopped so the box keeps focus (and the phone keyboard stays up); the tap itself inserts.
      onmousedown: (e) => e.preventDefault(), onclick: () => pick(c) },
      h("span", { class: "slash-name" }, "/" + c.name), c.description ? h("span", { class: "slash-desc" }, c.description) : null)));
    el.hidden = false; ta.setAttribute("aria-expanded", "true"); ta.setAttribute("aria-activedescendant", "slash-" + sel);
  }
  function pick(c) {
    const text = insertText(c);
    ta.value = text; ta.focus(); ta.setSelectionRange(text.length, text.length);
    ta.dispatchEvent(new Event("input", { bubbles: true })); // the app's own draft/size/send-button handling; this never sends
  }
  async function listFor(id) {
    const hit = cache.get(id);
    if (hit && Date.now() - hit.at < FRESH_MS) return hit.list;
    try { const j = await get("/api/slash?thread=" + encodeURIComponent(id)); const list = Array.isArray(j?.commands) ? j.commands : []; cache.set(id, { at: Date.now(), list }); return list; }
    catch { return hit?.list || []; }
  }
  async function sync() {
    const text = ta.value, id = threadId();
    if (!id || !triggerOf(text) || dismissed === text || ta.disabled) return hide();
    const my = ++token;
    const list = await listFor(id);
    if (my !== token) return; // a newer keystroke is already handling it
    rows = rowsFor(list, ta.value);
    if (rows.length === 1 && insertText(rows[0]) === ta.value) rows = []; // already exactly typed: nothing left to offer
    sel = Math.min(sel, Math.max(rows.length - 1, 0));
    draw();
  }
  ta.setAttribute("aria-haspopup", "listbox"); ta.setAttribute("aria-controls", "slash-list"); ta.setAttribute("aria-expanded", "false");
  ta.addEventListener("input", () => { sel = 0; dismissed = ""; void sync(); });
  ta.addEventListener("blur", () => { token++; hide(); });
  function key(e) {
    if (el.hidden || !rows.length || e.isComposing) return false;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { sel = (sel + (e.key === "ArrowDown" ? 1 : rows.length - 1)) % rows.length; e.preventDefault(); draw(); return true; }
    if ((e.key === "Enter" && !e.shiftKey) || e.key === "Tab") { e.preventDefault(); pick(rows[sel]); return true; }
    if (e.key === "Escape") { e.preventDefault(); dismissed = ta.value; hide(); return true; }
    return false;
  }
  // Capture phase: at the target, capture listeners run before the box's own Enter-sends handler, and a handled key stops there.
  ta.addEventListener("keydown", (e) => { if (key(e)) e.stopImmediatePropagation(); }, true);
  /** Put text in the box without sending (the Goal card's "Clear goal"). */
  function fill(text) { ta.value = text; ta.focus(); ta.setSelectionRange(text.length, text.length); ta.dispatchEvent(new Event("input", { bubbles: true })); }
  return { el, key, fill, sync };
}
