// Pixel office: one glowing room per project, a pixel worker per thread at a desk, helpers below their parent with chain lines.
// officeModel() is pure (plain data in, positions out, tested in Node). renderOffice() turns it into SVG with createElementNS only
// (no innerHTML, no inline style), so it follows the same CSP as the rest of the app.
import { legItem, legBadge } from "./legend.js";
import { aiOf } from "./buddies.js";
import { addDeskContext } from "./context.js";
import { titleText, labelOf } from "./labels.js";
const CELL_W = 80, CELL_H = 88, BADGE_H = 28, COLS = 4, W = CELL_W * COLS, MAX_HELPERS = 16, PAD_TOP = 6;
// Helper rows get CHAIN_GAP extra room above them: the chain line runs from under the parent's caption (CAP_END) to just above the helper's head (HEAD_UP).
const CHAIN_GAP = 32, CAP_END = 90, HEAD_UP = 8;
const UP_W = CELL_W - 8; // phone tree: the "reports to" badge under a desk
const RANK = { "needs-you": 0, failed: 1, stalled: 2, working: 3, done: 4 };

/** The [child, parent] pairs of a reports-to map: only string pairs. Sorted by child id so the result never depends on key order. */
export const reportEdges = (rt) => (rt && typeof rt === "object" ? Object.entries(rt).filter(([c, p]) => typeof c === "string" && typeof p === "string" && c && p).sort((a, b) => (a[0] < b[0] ? -1 : 1)) : []);
/** True when `id` is `anc` or sits below it (follows parentId up; capped so a bad loop cannot hang). */
const descends = (all, id, anc) => { for (let cur = id, g = 0; cur && g < 40; g++) { if (cur === anc) return true; cur = all.get(cur)?.parentId; } return false; };


/** RULE (You 8 Nov): an AI worker is NEVER drawn as the generic human, not even for one frame. The last known model per thread is remembered (memory + localStorage),
 *  and a thread whose model is still unknown gets a neutral buddy, never the person sprite. */
const MODEL_KEY = "kemino.officeModels";
const MODELS = new Map();
let modelsLoaded = false;
const loadModels = () => { if (modelsLoaded) return; modelsLoaded = true; try { const o = JSON.parse(globalThis.localStorage?.getItem(MODEL_KEY) || "{}"); for (const [k, v] of Object.entries(o)) if (v && typeof v === "object") MODELS.set(k, v); } catch { /* private mode: memory only */ } };
const saveModels = () => { try { const o = Object.fromEntries([...MODELS].slice(-300)); globalThis.localStorage?.setItem(MODEL_KEY, JSON.stringify(o)); } catch { /* ignore */ } };
/** The model to draw for thread `id`: the given one when it names a known AI (and remember it), else the last known one for that thread, else null. */
export function knownModel(id, m) {
  loadModels();
  if (m && aiOf(m)) { const old = MODELS.get(id); if (!old || old.instanceId !== m.instanceId || old.model !== m.model) { MODELS.set(id, { instanceId: m.instanceId, model: m.model || "", effort: m.effort ?? null }); saveModels(); } return m; }
  return MODELS.get(id) || m || null;
}
export const _resetKnownModels = () => { MODELS.clear(); modelsLoaded = true; };
/** Neutral buddy for a worker whose AI is not known yet. */
export const NEUTRAL_AI = { id: "neutral", name: "", folder: "termi", idleUrl: "buddy/termi/idle.png" };

/** Rooms from the live Today state. Done helpers are hidden (the office shows who is at their desk now). */
export function officeModel(d, match = () => true) {
  if (!d) return { rooms: [], doneCount: 0, width: W };
  const roots = d.working.map((g) => ({ ...g }));
  // A lone thread that only waits for a yes lives in `needs`, not in `working`: give it a desk too.
  for (const n of d.needs || []) if (n.id === n.rootId && !roots.some((g) => g.id === n.id)) roots.push({ id: n.id, title: n.title, project: n.project, status: "needs-you", model: n.model || (n.provider ? { instanceId: n.provider, model: "", effort: null } : null), helpers: [], activityAt: n.since });
  const byProject = new Map();
  for (const g of roots) {
    if (!match(g.title, g.project, ...(g.helpers || []).map((h) => h.title))) continue;
    (byProject.get(g.project || "(no project)") || byProject.set(g.project || "(no project)", []).get(g.project || "(no project)")).push(g);
  }
  // Everybody the state knows (any project), for the "↑ reports to" badge of a desk whose boss sits in another room.
  const everyone = new Map();
  for (const g of [...d.working, ...(d.done || []), ...roots]) for (const t of [g, ...(g.helpers || [])]) if (!everyone.has(t.id)) everyone.set(t.id, { id: t.id, title: t.title, status: t.status, model: t.model, project: (t.project ?? g.project) || "(no project)", context: t.context ?? null });
  const rooms = [];
  for (const [name, groups] of byProject) {
    // visible nodes: roots + live helpers (best first, capped); every helper attaches to its nearest visible ancestor
    const all = new Map();
    for (const g of groups) { all.set(g.id, { id: g.id, title: g.title, status: g.status, model: g.model, parentId: null, depth: 0, at: g.activityAt, rootId: g.id, link: "spawn" }); }
    const helpers = groups.flatMap((g) => (g.helpers || []).map((h) => ({ ...h, rootId: g.id }))).filter((h) => h.status !== "done");
    helpers.sort((a, b) => RANK[a.status] - RANK[b.status] || b.activityAt - a.activityAt);
    const shown = helpers.slice(0, MAX_HELPERS), shownIds = new Set(shown.map((h) => h.id));
    const parentOf = new Map(helpers.map((h) => [h.id, h.parentId]));
    for (const h of shown) {
      let p = h.parentId, guard = 0;
      while (p && !all.has(p) && !shownIds.has(p) && guard++ < 30) p = parentOf.get(p) ?? null; // hidden parent: climb
      all.set(h.id, { id: h.id, title: h.title, status: h.status, model: h.model, parentId: p && (all.has(p) || shownIds.has(p)) ? p : h.rootId, depth: 0, at: h.activityAt, rootId: h.rootId, link: "spawn" });
    }
    // "Reports to" (chain.json, via d.reportsTo) moves a desk under its chain-of-command parent, even a parent that is idle (a finished desk is pulled in for it).
    const pool = new Map();
    for (const g of [...(d.done || []), ...d.working]) for (const t of [g, ...(g.helpers || [])]) if (!pool.has(t.id)) pool.set(t.id, { ...t, rootId: g.id });
    const edges0 = reportEdges(d.reportsTo);
    for (let pass = 0, changed = true; changed && pass < 8; pass++) { // a parent pulled in by one pair can be the child of the next
      changed = false;
      for (const [c, p] of edges0) {
        const cn = all.get(c);
        if (!cn || c === p || (cn.link === "report" && cn.parentId === p)) continue;
        let pn = all.get(p);
        if (pn) { if (descends(all, p, c)) continue; } // a loop in the file is ignored
        else {
          const t = pool.get(p);
          if (!t || (t.project || "(no project)") !== name) continue; // unknown thread, or another project's room
          all.set(p, { id: t.id, title: t.title, status: t.status, model: t.model, parentId: null, depth: 0, at: t.activityAt, rootId: t.rootId, link: "spawn" });
        }
        cn.parentId = p; cn.link = "report"; changed = true;
      }
    }
    // A desk whose boss sits in ANOTHER project's room gets a badge instead of a line (no lines across rooms); the boss's desk counts those leads.
    const leadsOf = new Map();
    for (const [c, p] of edges0) {
      const cn = all.get(c), pe = everyone.get(p);
      if (cn && !all.has(p) && pe && pe.project !== name) cn.up = { id: pe.id, title: pe.title, status: pe.status, model: pe.model, project: pe.project };
      const ce = everyone.get(c);
      if (all.has(p) && ce && ce.project !== name && c !== p) leadsOf.set(p, (leadsOf.get(p) || 0) + 1);
    }
    for (const [id, k] of leadsOf) all.get(id).leads = k;
    const hasBadge = [...all.values()].some((n) => n.up), rowH = CELL_H + (hasBadge ? BADGE_H : 0);
    // depth = distance to the root; layout level by level, ordered by the parent's position
    const depthOf = (n, g = 0) => (n.parentId && all.get(n.parentId) && g < 30 ? 1 + depthOf(all.get(n.parentId), g + 1) : 0);
    for (const n of all.values()) n.depth = depthOf(n);
    const levels = [];
    for (const n of all.values()) (levels[n.depth] ||= []).push(n);
    let y = PAD_TOP;
    const nodes = [];
    levels.forEach((lv, depth) => {
      if (!lv) return;
      if (depth > 0) y += CHAIN_GAP;
      lv.sort(depth
        ? (a, b) => all.get(a.parentId).idx - all.get(b.parentId).idx || RANK[a.status] - RANK[b.status]
        : (a, b) => RANK[a.status] - RANK[b.status] || b.at - a.at);
      lv.forEach((n, i) => {
        n.idx = i;
        const inRow = Math.min(COLS, lv.length - Math.floor(i / COLS) * COLS); // centre each row
        n.x = ((COLS - inRow) / 2 + (i % COLS)) * CELL_W + CELL_W / 2;
        n.y = y + Math.floor(i / COLS) * rowH;
        nodes.push(n);
      });
      y += Math.ceil(lv.length / COLS) * rowH;
    });
    const pos = new Map(nodes.map((n) => [n.id, n]));
    const edges = nodes.filter((n) => n.parentId && pos.get(n.parentId)).map((n) => {
      const p = pos.get(n.parentId), top = p.y + CAP_END + (p.up ? BADGE_H : 0), end = n.y - HEAD_UP, mid = Math.round((top + end) / 2);
      return { id: n.id, kind: n.link === "report" ? "report" : "spawn", hot: n.status === "needs-you", d: `M${p.x},${top}V${mid}H${n.x}V${end}`, from: { x: p.x, y: top }, to: { x: n.x, y: end } };
    });
    const counts = { "needs-you": 0, working: 0, stalled: 0, failed: 0 };
    for (const n of nodes) if (n.status in counts) counts[n.status]++;
    for (const n of nodes) { n.context = everyone.get(n.id)?.context ?? null; n.model = knownModel(n.id, n.model); if (n.up) n.up.model = knownModel(n.up.id, n.up.model); }
    rooms.push({ name, counts, nodes, edges, height: Math.max(y, rowH) + 4, more: Math.max(0, helpers.length - shown.length), score: counts["needs-you"] * 1000 + counts.failed * 100 + counts.working });
  }
  rooms.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return { rooms, doneCount: (d.done || []).length, width: W };
}

/** Ids of the workers who ask for You, in the order the office shows them (room by room, desk by desk). The "next" arrow cycles through this list. */
export function askList(model) {
  const out = [];
  for (const r of model.rooms) for (const n of r.nodes) if (n.status === "needs-you" && !out.includes(n.id)) out.push(n.id);
  return out;
}

/** Step through a list of ids from `cur` in direction `dir` (+1 / -1), wrapping around. No current: first (forward) or last (back). Empty list: null. */
export function stepAsk(ids, cur, dir) {
  if (!ids.length) return null;
  const i = ids.indexOf(cur);
  if (i < 0) return dir < 0 ? ids[ids.length - 1] : ids[0];
  return ids[(i + (dir < 0 ? -1 : 1) + ids.length) % ids.length];
}

// ---------- drawing ----------
const NS = "http://www.w3.org/2000/svg";
const sn = (tag, attrs = {}, ...kids) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) n.setAttribute(k, v); for (const k of kids.flat()) if (k != null) n.append(k.nodeType ? k : document.createTextNode(k)); return n; };
const HAIR = ["#2a1d18", "#6b3f1d", "#d9b34a", "#1b2a4a", "#8a2f2f", "#4a4a52"];
const hash = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
/** Shirt colour tells the provider at a glance. */
const SHIRT = [[/^claudeAgent/, "#d0805f"], [/codex/i, "#6a98e0"], [/copilot/i, "#9a7ae0"], [/antigravity|gemini/i, "#4fbf9f"]];
const shirtOf = (m) => (SHIRT.find(([re]) => re.test(m?.instanceId || "")) || [0, "#8a86a8"])[1];
const GLYPH = { "needs-you": "!", failed: "×", stalled: "…" };
const SCREEN = { working: "run", "needs-you": "saf", failed: "fail", stalled: "stall", done: "done" };

/** One pixel worker at a desk (20x21 grid, scaled 2.6). The monitor colour and the animation show the status. */
function worker(n, small) {
  const hair = HAIR[hash(n.id) % HAIR.length], shirt = shirtOf(n.model), sc = SCREEN[n.status] || "done";
  const eyes = n.status === "failed"
    ? [sn("path", { d: "M8 3.8l1.6 1.8M9.6 3.8L8 5.6M11.6 3.8l1.6 1.8M13.2 3.8l-1.6 1.8", class: "sp-eyeline" })]
    : [sn("rect", { x: 8, y: 4, width: 1.4, height: 1.7, class: "sp-eye" }), sn("rect", { x: 11.6, y: 4, width: 1.4, height: 1.7, class: "sp-eye" })];
  const arm = n.status === "needs-you"
    ? sn("g", { class: "wave" }, sn("rect", { x: 15, y: 3.5, width: 1.2, height: 5.5, fill: shirt }), sn("rect", { x: 14.8, y: 1.6, width: 2, height: 2, class: "sp-skin" }))
    : sn("rect", { x: 15, y: 8, width: 1.2, height: 4, fill: shirt });
  const s = small ? 2.3 : 2.6;
  // A known AI sits at the desk as its own buddy (working / needs-you poses, idle otherwise); an unknown one keeps the generic pixel person.
  const ai = aiOf(n.model) || NEUTRAL_AI;
  const pose = n.status === "working" ? "working" : n.status === "needs-you" ? "needsyou" : "idle";
  const img = (name, cls) => sn("image", { href: ai.idleUrl.replace(/idle\.png$/, name + ".png"), x: 3.5, y: -2.5, width: 13, height: 13, class: "ai-img " + cls, "shape-rendering": "crispEdges" });
  // working = a 2-frame typing loop (frame a / frame b swap by CSS; reduced motion keeps frame a only)
  const person = sn("g", { class: "bo ai-bo" }, img(pose, "fa"), n.status === "working" ? img("working-b", "fb") : null, n.status === "needs-you" ? arm : null);
  return sn("g", { class: "sprite", transform: `translate(${-10 * s},0) scale(${s})`, "shape-rendering": "crispEdges" },
    person,
    sn("rect", { x: 1, y: 12, width: 18, height: 2, class: "sp-desk" }), sn("rect", { x: 1, y: 14, width: 18, height: 1, class: "sp-desk2" }),
    sn("rect", { x: 2, y: 15, width: 1, height: 4, class: "sp-desk2" }), sn("rect", { x: 17, y: 15, width: 1, height: 4, class: "sp-desk2" }),
    sn("rect", { x: 7, y: 10, width: 6, height: 3, class: "sp-mon" }), sn("rect", { x: 8, y: 11, width: 4, height: 1, class: "scr sc-" + sc }),
    sn("rect", { x: 6, y: 12, width: 2, height: 1, class: "sp-skin hand" }), sn("rect", { x: 12, y: 12, width: 2, height: 1, class: "sp-skin" }));
}
/** "Kemino · Opus 5.5" under the desk title; empty for an unknown AI. */
export function whoLine(m) {
  const a = aiOf(m);
  if (!a) return "";
  const r = /^claude-([a-z]+)-(\d+)-(\d+)$/.exec(m.model || "");
  const model = r ? r[1][0].toUpperCase() + r[1].slice(1) + " " + r[2] + "." + r[3] : m.model || "";
  return [a.name, model].filter(Boolean).join(" · ");
}
/** Rough width in px of `t` at font size `px` (UI font; `bold` adds a little). Pure, so Node can test the label fitting. */
export const textWidth = (t, px, bold = false) => { let w = 0; for (const ch of String(t)) w += /[iljI.,'!|:;·]/.test(ch) ? 0.3 : /[ftrJ()\- ]/.test(ch) ? 0.38 : /[mwMW@]/.test(ch) ? 0.84 : /[A-Z0-9]/.test(ch) ? 0.66 : 0.53; return w * px * (bold ? 1.04 : 1); };
/** `t` cut with an ellipsis so it is at most `maxW` px wide at size `px`. Full text stays in the title / aria-label. */
export const fitText = (t, px, maxW, bold = false) => { t = String(t); if (textWidth(t, px, bold) <= maxW) return t; let s = t; while (s.length > 1 && textWidth(s + "…", px, bold) > maxW) s = s.slice(0, -1); return s.trimEnd() + "…"; };


// ---------- Office A "open studio": pure label helpers (tested in Node) ----------
const STATE = { "needs-you": { word: "Needs you", cls: "st-ask" }, working: { word: "Working", cls: "st-run" }, stalled: { word: "Idle", cls: "st-idle" }, failed: { word: "Failed", cls: "st-fail" }, done: { word: "Done", cls: "st-done" } };
/** The state word and class of a status. Always a word (never colour alone). */
export const stateOf = (status) => STATE[status] || STATE.done;
/** Long-lived roles (the head, or a foreman/lead that reports to the head) never read "Done": between turns they are "Idle". */
export const longLived = (n) => !!n && (n.link === "report" || !!(n.id && labelOf(n.id).isHead));
/** The state word + class for a node: stateOf, except a finished long-lived role is Idle. */
export const stateFor = (n, hasKids = false) => (n && n.status === "done" && longLived(n) ? { word: "Idle", cls: "st-idle" } : stateOf(n && n.status));
/** "14m", "3h", "2d" since `at` (epoch ms); "<1m" under a minute; "" when the time is unknown. */
export function elapsedText(at, now = Date.now()) {
  if (!Number.isFinite(at) || !at || at <= 0) return "";
  const s = Math.max(0, (now - at) / 1000);
  if (s < 60) return "<1m";
  if (s < 3600) return Math.floor(s / 60) + "m";
  if (s < 48 * 3600) return Math.floor(s / 3600) + "h";
  return Math.floor(s / 86400) + "d";
}
/** Head = a root desk; Lead = a helper with helpers of its own; Worker = a helper without. */
export const roleOf = (n, hasKids) => (n.depth === 0 ? "Head" : hasKids ? "Lead" : "Worker");
/** Everything a desk (or a phone row) prints, as plain strings: role, full "account · model", ONE task line with elapsed, state word. */
export function deskText(n, hasKids = false, now = Date.now()) {
  const st = stateFor(n, hasKids), el = elapsedText(n.at, now), who = whoLine(n.model);
  const role = roleOf(n, hasKids);
  const aria = [titleText(n.id, n.title), role, who, st.word, el && "for " + el].filter(Boolean).join(", ") + ". Open chat";
  return { role, who, task: titleText(n.id, n.title), elapsed: el, taskLine: titleText(n.id, n.title) + (el ? " · " + el : ""), word: st.word, cls: st.cls, aria };
}
/** Which statuses a level shows: all = everything drawn; busy = only active, failed and needs-you; calm = everything drawn, dimmed except the one who asks. */
export const LEVELS = ["calm", "busy", "all"];
export const levelShows = (level, status) => (level === "busy" ? status !== "stalled" && status !== "done" : true);

// ---------- drawing (DOM, classes only: the CSP forbids inline styles) ----------
const el = (tag, cls, ...kids) => { const n = document.createElement(tag); if (cls) n.className = cls; for (const k of kids.flat()) if (k != null && k !== false) n.append(k.nodeType ? k : document.createTextNode(k)); return n; };
const LEVEL_KEY = "ko.officeLevel";
const loadLevel = () => { try { const v = localStorage.getItem(LEVEL_KEY); return LEVELS.includes(v) ? v : "all"; } catch { return "all"; } };
const saveLevel = (v) => { try { localStorage.setItem(LEVEL_KEY, v); } catch { /* private mode: fine */ } };
const px = (rects) => rects.map(([x, y, w, h, f]) => sn("rect", { x, y, width: w, height: h, fill: f }));
const CROWN = () => sn("svg", { class: "oa-ico", viewBox: "0 0 10 8", width: 14, height: 11, "aria-hidden": "true", "shape-rendering": "crispEdges" }, px([[0, 2, 2, 6, "#e8c25a"], [4, 0, 2, 8, "#e8c25a"], [8, 2, 2, 6, "#e8c25a"], [0, 6, 10, 2, "#c9a13c"]]));
const WRENCH = () => sn("svg", { class: "oa-ico", viewBox: "0 0 10 10", width: 13, height: 13, "aria-hidden": "true", "shape-rendering": "crispEdges" }, px([[1, 0, 2, 2, "#b7b4d0"], [5, 0, 2, 2, "#b7b4d0"], [1, 2, 6, 2, "#b7b4d0"], [3, 4, 2, 6, "#b7b4d0"]]));
const PLANT = () => sn("svg", { class: "oa-prop", viewBox: "0 0 30 45", width: 30, height: 45, "aria-hidden": "true", "shape-rendering": "crispEdges" }, px([[9, 30, 12, 14, "#8a5a3a"], [13, 12, 4, 18, "#2f8f5a"], [5, 14, 8, 8, "#47d983"], [17, 8, 8, 8, "#47d983"], [9, 3, 6, 8, "#2f8f5a"]]));
const MUG = () => sn("svg", { class: "oa-prop", viewBox: "0 0 16 16", width: 22, height: 22, "aria-hidden": "true", "shape-rendering": "crispEdges" }, px([[2, 5, 9, 9, "#d9d4ea"], [11, 7, 3, 5, "#d9d4ea"], [4, 7, 5, 5, "#6b3f1d"], [4, 1, 1, 3, "#8a86a8"], [7, 0, 1, 4, "#8a86a8"]]));

/** One desk: [sprite | role + leads / account · model] over the ONE task line, over the state (dot + word). */
function desk(n, hasKids, now, spot, open, goto) {
  const t = deskText(n, hasKids, now), st = stateFor(n, hasKids);
  const d = el("div", "oa-desk " + n.status + " " + (n.link === "report" ? "lk-report" : "lk-spawn") + (n.depth > 0 ? " sub" : ""));
  d.setAttribute("data-id", n.id); d.setAttribute("data-st", n.status);
  d.tabIndex = 0; d.setAttribute("role", "button"); d.setAttribute("aria-label", t.aria); d.title = t.task + " · " + st.word;
  if (n.id === spot) d.classList.add("spot");
  const sprite = sn("svg", { class: "oa-sprite", viewBox: "-30 -10 60 62", width: 60, height: 62, "aria-hidden": "true" }, sn("g", { class: "zm" }, worker(n, n.depth > 0)));
  const nameRow = el("div", "oa-name", el("span", "oa-role", t.role === "Worker" ? WRENCH() : CROWN(), t.role));
  if (n.leads) nameRow.append(el("span", "oa-leads", "↓ " + n.leads + (n.leads === 1 ? " lead" : " leads")));
  const idn = el("div", "oa-id", nameRow, t.who ? el("div", "oa-who", t.who) : null);
  const state = el("div", "oa-state " + st.cls, el("i", "oa-dot"), el("span", "oa-word", t.word));
  addDeskContext(state, n.context);
  d.append(el("div", "oa-top", sprite, idn), el("div", "oa-task", el("span", "oa-task-t", headlineOf(t.task)), labelOf(n.id).isHead ? el("em", "hd-tag", "Head") : null, t.elapsed ? el("span", "oa-el", " · " + t.elapsed) : null), state);
  if (n.up) {
    const u = el("button", "oa-up"); u.type = "button"; u.setAttribute("data-up", n.up.id);
    u.setAttribute("aria-label", `${n.title} reports to ${n.up.title} in ${n.up.project}. Go to it`);
    u.append(el("span", "oa-up-a", "↑ reports to "), el("span", "oa-up-t", n.up.title), el("span", "oa-up-p", " · " + n.up.project));
    u.addEventListener("click", (e) => { e.stopPropagation(); goto(n.up.id); });
    u.addEventListener("keydown", (e) => e.stopPropagation());
    d.append(u);
  }
  d.addEventListener("click", () => open(n.id));
  d.addEventListener("keydown", (e) => { if (e.target === d && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); open(n.id); } });
  return d;
}

/** `open(id)` is called when a desk is tapped or activated with the keyboard. `spot` is the worker highlighted (the one asking).
 *  `goto(id)` is called when a "↑ reports to" badge is tapped (the boss sits in another room); it defaults to `open`. `now` is for tests. */
export function renderOffice(model, open, spot = null, goto = open, now = Date.now()) {
  const root = el("div", "oa");
  let level = loadLevel();
  const redraws = [];
  const apply = () => {
    root.setAttribute("data-level", level);
    for (const d of root.querySelectorAll(".oa-desk")) d.hidden = !levelShows(level, d.getAttribute("data-st"));
    for (const b of root.querySelectorAll(".oa-seg button")) b.setAttribute("aria-pressed", String(b.getAttribute("data-level") === level));
    for (const f of redraws) f();
  };
  const seg = el("div", "oa-seg"); seg.setAttribute("role", "group"); seg.setAttribute("aria-label", "How much of the office to show");
  for (const l of LEVELS) { const b = el("button", "", l[0].toUpperCase() + l.slice(1)); b.type = "button"; b.setAttribute("data-level", l); b.addEventListener("click", () => { level = l; saveLevel(l); apply(); }); seg.append(b); }
  const kindsAll = new Set(model.rooms.flatMap((r) => r.edges.map((e) => e.kind)));
  const leg = el("p", "oa-leg");
  if (model.rooms.some((r) => r.nodes.some((n) => n.up))) leg.append(legBadge());
  if (kindsAll.has("report")) leg.append(el("span", "lg-item", el("i", "lg-line report"), "reports to"));
  if (kindsAll.has("spawn")) leg.append(el("span", "lg-item", el("i", "lg-line"), "started by"));
  root.append(el("div", "oa-bar", leg, seg));

  model.rooms.forEach((r) => {
    const c = r.counts;
    const counts = [c["needs-you"] && c["needs-you"] + " needs you", c.failed && c.failed + " failed", c.working && c.working + " working", c.stalled && c.stalled + " idle"].filter(Boolean).join(" · ") || "quiet";
    const wb = el("div", "oa-wb"); wb.setAttribute("aria-hidden", "true"); wb.append(el("b", "", r.name), el("span", "", counts));
    const head = el("div", "oa-room-h", el("h2", "", r.name), el("span", "oa-room-c", counts), el("span", "oa-props", PLANT(), wb, MUG()));
    const floor = el("div", "oa-floor");
    const lines = sn("svg", { class: "oa-chain", "aria-hidden": "true" });
    floor.append(lines);
    const kids = new Set(r.nodes.map((n) => n.parentId).filter(Boolean));
    const byDepth = [];
    for (const n of r.nodes) (byDepth[n.depth] ||= []).push(n);
    const els = new Map();
    byDepth.forEach((lv) => {
      if (!lv) return;
      const row = el("div", "oa-lv");
      for (const n of lv) { const d = desk(n, kids.has(n.id), now, spot, open, goto); els.set(n.id, d); row.append(d); }
      floor.append(row);
    });
    // chain lines are measured from the real desk boxes, so they follow whatever width the pane has
    const redraw = () => {
      lines.replaceChildren();
      const fr = floor.getBoundingClientRect();
      if (!fr.width) return;
      lines.setAttribute("width", Math.round(fr.width)); lines.setAttribute("height", Math.round(fr.height));
      for (const n of r.nodes) {
        const c = els.get(n.id), p = n.parentId && els.get(n.parentId);
        if (!c || !p || c.hidden || p.hidden || !c.offsetParent || !p.offsetParent) continue;
        const cr = c.getBoundingClientRect(), pr = p.getBoundingClientRect();
        const x1 = Math.round(pr.left + pr.width / 2 - fr.left), y1 = Math.round(pr.bottom - fr.top), x2 = Math.round(cr.left + cr.width / 2 - fr.left), y2 = Math.round(cr.top - fr.top);
        if (y2 <= y1) continue;
        const mid = y2 - 18 > y1 ? y2 - 18 : Math.round((y1 + y2) / 2), hot = n.status === "needs-you" ? " hot" : "", rep = n.link === "report" ? " report" : "";
        lines.append(sn("path", { d: `M${x1},${y1}V${mid}H${x2}V${y2}`, class: "oa-l" + rep + hot }), sn("circle", { cx: x1, cy: y1, r: 3.5, class: "oa-dt" + hot }), sn("circle", { cx: x2, cy: y2, r: 3.5, class: "oa-dt" + hot }));
      }
    };
    redraws.push(redraw);
    if (typeof ResizeObserver === "function") new ResizeObserver(redraw).observe(floor);
    const section = el("section", "oa-room", head, floor);
    section.setAttribute("aria-label", "Room " + r.name);
    if (r.more) section.append(el("p", "oa-more", "+" + r.more + " more helpers not drawn"));
    root.append(section);
  });
  apply();
  const frag = document.createDocumentFragment(); frag.append(root);
  return frag;
}

// ---------- the Tree layout: head on top, one column per project, a dashed "reports to head" line for other projects (HTML, classes only) ----------
const LAYOUTS = ["tree", "rows"];
const LAYOUT_KEY = "ko.officeLayout";
/** Remembered layout for this device; Rows is the default (it reads best on a phone). */
export const loadLayout = () => { try { const v = localStorage.getItem(LAYOUT_KEY); return LAYOUTS.includes(v) ? v : "rows"; } catch { return "rows"; } };
const saveLayout = (v) => { try { localStorage.setItem(LAYOUT_KEY, v); } catch { /* private mode: fine */ } };

/** A readable one-line task for a desk. A worktree builder is titled by its branch ("feat/slash-autocomplete", "t3/6ac35d2c"): show it as words instead.
 *  Normal titles pass through. (The state payload carries only the title, so this is the best headline available.) */
export function headlineOf(title) {
  const t = String(title ?? "").trim();
  if (!t || /\s/.test(t) || !/^[\w.-]+\/[\w./-]+$/.test(t)) return t;
  const tail = t.split("/").slice(1).join(" ").replace(/[-_./]+/g, " ").trim();
  if (!tail || /^[0-9a-f]{6,}$/i.test(tail)) return "Worktree builder";
  return tail[0].toUpperCase() + tail.slice(1);
}

/** The tree as plain data: { head, cols:[{ room, counts, cross, forest:[{n,kids}] }] }. Pure, tested in Node. */
export function treeModel(model) {
  const all = model.rooms.flatMap((r) => r.nodes.map((n) => ({ n, room: r.name })));
  const head = (all.find((x) => x.n.leads) || all.find((x) => labelOf(x.n.id).isHead) || null);
  const headId = head?.n.id ?? null;
  const cols = model.rooms.map((r) => {
    const ids = new Set(r.nodes.filter((n) => n.id !== headId).map((n) => n.id));
    const build = (pid) => r.nodes.filter((n) => ids.has(n.id) && (pid === null ? !n.parentId || n.parentId === headId || !ids.has(n.parentId) : n.parentId === pid)).map((n) => ({ n, kids: build(n.id) }));
    const forest = build(null);
    const cross = !!head && r.name !== head.room && r.nodes.some((n) => n.up && n.up.id === headId);
    return { room: r.name, counts: r.counts, cross, forest };
  }).filter((c) => c.forest.length);
  return { head: head ? head.n : null, headRoom: head ? head.room : null, cols };
}

function treeCard(n, hasKids, cross, now, spot, open, goto, isHead) {
  const t = deskText(n, hasKids, now), st = stateFor(n, hasKids);
  const d = el("div", "ot-card " + n.status + (n.id === spot ? " spot" : ""));
  d.setAttribute("data-id", n.id); d.setAttribute("data-st", n.status);
  d.tabIndex = 0; d.setAttribute("role", "button"); d.setAttribute("aria-label", t.aria); d.title = t.task + " · " + st.word;
  const sprite = sn("svg", { class: "ot-sprite", viewBox: "-30 -10 60 62", width: 40, height: 41, "aria-hidden": "true" }, sn("g", { class: "zm" }, worker(n, true)));
  const tags = el("span", "ot-tags");
  if (isHead || labelOf(n.id).isHead) tags.append(el("em", "hd-tag", "Head"));
  if (cross) tags.append(el("em", "hd-tag up", "↑ Head"));
  if (n.leads) tags.append(el("em", "hd-tag", "↓ " + n.leads + (n.leads === 1 ? " lead" : " leads")));
  const state = el("div", "oa-state " + st.cls, el("i", "oa-dot"), el("span", "oa-word", t.word + (t.elapsed ? " · " + t.elapsed : "")));
  addDeskContext(state, n.context);
  d.append(el("div", "ot-top", sprite, el("div", "ot-id", el("div", "ot-name", headlineOf(t.task)), t.who ? el("div", "oa-who", t.who) : null)));
  if (tags.childNodes.length) d.append(tags);
  d.append(state);
  d.addEventListener("click", () => open(n.id));
  d.addEventListener("keydown", (e) => { if (e.target === d && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); open(n.id); } });
  return d;
}

/** `open(id)` is called when a worker is tapped or activated with the keyboard. `spot` is the worker that is highlighted (the one asking).
 *  `goto(id)` is called when a "reports to" badge is tapped (a boss that is not drawn in the tree). */
export function renderOfficeTree(model, open, spot = null, goto = open, now = Date.now()) {
  const tm = treeModel(model), root = el("div", "ot");
  if (tm.head) { const hw = el("div", "ot-headwrap", treeCard(tm.head, true, false, now, spot, open, goto, true)); root.append(hw, el("div", "ot-stem")); }
  const cols = el("div", "ot-cols" + (tm.head ? " has-head" : ""));
  const list = (items, cross, top) => {
    const ul = el("ul", "ot-list");
    for (const { n, kids } of items) {
      const li = el("li", "ot-li");
      const c = treeCard(n, kids.length > 0, top && cross, now, spot, open, goto, false);
      if (n.up && !(cross && top)) { // a boss that is not drawn in this tree: keep the tappable badge
        const u = el("button", "oa-up"); u.type = "button"; u.setAttribute("data-up", n.up.id);
        u.setAttribute("aria-label", `${n.title} reports to ${n.up.title} in ${n.up.project}. Go to it`);
        u.append(el("span", "oa-up-a", "↑ reports to "), el("span", "oa-up-t", n.up.title), el("span", "oa-up-p", " · " + n.up.project));
        u.addEventListener("click", (e) => { e.stopPropagation(); goto(n.up.id); }); u.addEventListener("keydown", (e) => e.stopPropagation());
        c.append(u);
      }
      li.append(c); if (kids.length) li.append(list(kids, cross, false));
      ul.append(li);
    }
    return ul;
  };
  for (const col of tm.cols) {
    const c = col.counts;
    const counts = [c["needs-you"] && c["needs-you"] + " needs you", c.failed && c.failed + " failed", c.working && c.working + " working", c.stalled && c.stalled + " idle"].filter(Boolean).join(" · ") || "quiet";
    const sec = el("section", "ot-col" + (col.cross ? " cross" : ""), el("h2", "ot-room", col.room), el("span", "ot-rc", counts), list(col.forest, col.cross, true));
    sec.setAttribute("aria-label", "Room " + col.room);
    cols.append(sec);
  }
  root.append(cols);
  const leg = el("p", "oa-leg");
  if (tm.cols.some((c) => c.cross)) leg.append(el("span", "lg-item", el("i", "lg-line report"), "reports to head"));
  if (tm.cols.some((c) => c.forest.some((f) => f.kids.length))) leg.append(el("span", "lg-item", el("i", "lg-line"), "started by"));
  if (leg.childNodes.length) root.append(leg);
  const frag = document.createDocumentFragment(); frag.append(root);
  return frag;
}

/** The Office page body: a small "Tree | Rows" switch (remembered per device, default Rows) over the chosen layout. */
export function renderOfficeLayout(model, open, spot = null, goto = open, now = Date.now()) {
  const wrap = el("div", "ol"), body = el("div", "ol-body");
  let layout = loadLayout();
  const seg = el("div", "oa-seg ol-seg"); seg.setAttribute("role", "group"); seg.setAttribute("aria-label", "Office layout");
  const draw = () => {
    body.replaceChildren((layout === "tree" ? renderOfficeTree : renderOffice)(model, open, spot, goto, now));
    for (const b of seg.querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.getAttribute("data-layout") === layout));
  };
  for (const l of LAYOUTS) { const b = el("button", "", l[0].toUpperCase() + l.slice(1)); b.type = "button"; b.setAttribute("data-layout", l); b.addEventListener("click", () => { if (layout === l) return; layout = l; saveLayout(l); draw(); }); seg.append(b); }
  wrap.append(el("div", "ol-bar", seg), body);
  draw();
  const frag = document.createDocumentFragment(); frag.append(wrap);
  return frag;
}

/** Scrolls a worker to the middle of the screen. The highlight and the zoom come from the `spot` class (set by renderOffice). */
export function scrollToWorker(root, id) {
  const e = [...root.querySelectorAll(".oa-desk[data-id], .ot-card[data-id]")].find((n) => n.getAttribute("data-id") === id);
  if (!e) return false;
  const calm = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  e.scrollIntoView({ block: "center", inline: "center", behavior: calm ? "auto" : "smooth" });
  return true;
}
