// Clear thread labels. One pure helper decides how a thread title is SHOWN; stored titles are never touched.
//  - the head thread (by headId from chain.json) gets isHead = true (the page draws a quiet "Head" chip)
//  - threads that share a title (trim, collapse spaces, case-fold) get a calm suffix: " · 8 Nov", or " · 8 Nov 07:20" when two share a day
//  - archived threads, titles saying old/retired, and threads without a created date get no suffix.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase();
const stamp = (ms) => (Number.isFinite(ms) && ms > 0 ? new Date(ms) : null);
const dayOf = (d) => d.getFullYear() + "-" + d.getMonth() + "-" + d.getDate();
const pad = (n) => String(n).padStart(2, "0");
const OLD = /\b(old|retired)\b/i;

/** threads: [{ id, title, createdAt (ms, optional), archived? }]. Returns Map(id -> { text, isHead }). */
export function displayTitles(threads, headId) {
  const out = new Map(), groups = new Map();
  for (const t of threads || []) {
    if (!t || t.id == null) continue;
    const title = String(t.title ?? "");
    out.set(t.id, { text: title, isHead: typeof headId === "string" && headId !== "" && t.id === headId });
    const k = norm(title);
    if (k) (groups.get(k) ?? groups.set(k, []).get(k)).push(t);
  }
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    for (const t of g) {
      const d = stamp(t.createdAt);
      if (!d || t.archived || OLD.test(String(t.title))) continue;
      const sameDay = g.some((o) => o !== t && !o.archived && !OLD.test(String(o.title)) && stamp(o.createdAt) && dayOf(stamp(o.createdAt)) === dayOf(d));
      const e = out.get(t.id);
      e.text = String(t.title) + " · " + d.getDate() + " " + MONTHS[d.getMonth()] + (sameDay ? " " + pad(d.getHours()) + ":" + pad(d.getMinutes()) : "");
    }
  }
  return out;
}

// ---- page-wide registry for the Today/Office/Map/chat views (the All threads list builds its own) ----
let cur = new Map();
/** Rebuild from the state payload: groups, helpers and needs, plus the head id. */
export function setLabelsFrom(d) {
  const seen = new Map();
  const add = (t) => { if (t && t.id && !seen.has(t.id)) seen.set(t.id, { id: t.id, title: t.title, createdAt: t.createdAt }); };
  for (const g of [...(d?.working || []), ...(d?.done || [])]) { add(g); (g.helpers || []).forEach(add); }
  for (const n of d?.needs || []) add(n);
  cur = displayTitles([...seen.values()], d?.headId);
}
/** Display text for a thread (falls back to the plain title when unknown). */
export const labelOf = (id, title) => cur.get(id) || { text: String(title ?? ""), isHead: false };
export const titleText = (id, title) => labelOf(id, title).text;
/** Children for a heading: the text plus a quiet "Head" chip on the head thread. */
export function titleNode(id, title) {
  const l = labelOf(id, title);
  if (!l.isHead) return l.text;
  const e = document.createElement("em");
  e.className = "hd-tag"; e.textContent = "Head";
  return [l.text, e];
}
