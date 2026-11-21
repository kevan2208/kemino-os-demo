// Map view: the chain of command. You, then the head, then its foreman and project leads, then their workers (finished workers fold into a "+N done" chip).
// Drawn as a vertical, scrollable tree of rounded pills with curved lines (fits a phone; wider screens simply get more room).
// mapModel() is pure (plain Today data in, positions out, tested in Node). renderMap() uses createElementNS only: no HTML strings, no inline style (CSP).

import { textWidth, fitText, whoLine, longLived } from "./office.js";
import { aiOf } from "./buddies.js";
import { contextText } from "./context.js";
import { titleText, labelOf } from "./labels.js";
import { savePicture } from "./mappic.js";
const W = 360, ROW = 44, PILL_H = 32, INDENT = 26, PAD = 10, RAD = 12, CHAR_W = 7.2, MAX_LABEL = 38;
const RANK = { "needs-you": 0, failed: 1, stalled: 2, working: 3, done: 4 };
/** The word under a node: a finished long-lived role (head, foreman, lead) reads "idle", not "done". */
export const wordOf = (n) => (n.status === "done" && n.kind === "thread" && longLived(n) ? "idle" : n.status ? STATUS_WORD[n.status] || n.status : "");
export const STATUS_WORD = { "needs-you": "needs you", working: "working", stalled: "no progress", failed: "failed", done: "done" };

const clip = (t, n) => (t.length > n ? t.slice(0, Math.max(1, n - 1)) + "…" : t);
const worst = (list) => list.reduce((a, s) => (RANK[s] < RANK[a] ? s : a), "done");

/** Every thread of the Today data as a tree: roots (working + done groups, plus a lone "needs you" thread) with their helpers nested by parentId. Returns { roots, byId } after "reports to" and the orphan rule. */
function threadTrees(d, match) {
  const roots = [...(d.working || []), ...(d.done || [])].map((g) => ({ ...g }));
  // A lone thread that only waits for a yes lives in `needs`, not in `working`: it still belongs on the map.
  for (const n of d.needs || []) if (n.id === n.rootId && !roots.some((g) => g.id === n.id)) roots.push({ id: n.id, title: n.title, project: n.project, status: "needs-you", helpers: [], activityAt: n.since, model: n.model, context: n.context });
  const out = [], byId = new Map();
  for (const g of roots) {
    if (!match(g.title, g.project, ...(g.helpers || []).map((x) => x.title))) continue;
    const kids = new Map();
    const ids = new Set([g.id, ...(g.helpers || []).map((x) => x.id)]);
    for (const x of g.helpers || []) {
      const p = x.parentId && ids.has(x.parentId) && x.parentId !== x.id ? x.parentId : g.id; // an unknown parent hangs on the root
      (kids.get(p) ?? kids.set(p, []).get(p)).push(x);
    }
    const seen = new Set();
    const build = (t, depth) => {
      seen.add(t.id);
      const children = (kids.get(t.id) || []).filter((k) => !seen.has(k.id)).map((k) => build(k, depth + 1));
      const node = { id: t.id, title: t.title || "(untitled)", model: t.model || null, context: t.context || null, status: t.status, at: t.activityAt || 0, children, link: "spawn", project: g.project || "(no project)", parent: null };
      for (const c of children) c.parent = node;
      byId.set(t.id, node);
      return node;
    };
    out.push(build(g, 0));
  }
  const left = attachReports(out, byId, d.reportsTo);
  return { roots: reattachOrphans(left, byId, { headId: d.headId, reportsTo: d.reportsTo }), byId };
}

const sortKids = (n) => { n.children.sort((a, b) => RANK[a.status] - RANK[b.status] || (b.at || 0) - (a.at || 0)); n.children.forEach(sortKids); };
/**
 * "Reports to" (chain.json): a thread moves under its chain-of-command parent (both on the map; the parent may be in ANOTHER project, e.g.
 * a project lead under the head thread: the Map is one tree), keeping its own helpers; the edge is marked link:"report". A pair whose parent sits below the child (a loop) is ignored. Returns the roots that are left.
 */
export function attachReports(roots, byId, rt) {
  const pairs = rt && typeof rt === "object" ? Object.entries(rt).filter(([c, p]) => typeof c === "string" && typeof p === "string").sort((a, b) => (a[0] < b[0] ? -1 : 1)) : [];
  for (const [c, p] of pairs) {
    const cn = byId.get(c), pn = byId.get(p);
    if (!cn || !pn || cn === pn || isBelow(pn, cn)) continue;
    if (cn.parent) cn.parent.children = cn.parent.children.filter((k) => k !== cn);
    else roots = roots.filter((r) => r !== cn);
    cn.parent = pn; cn.link = "report"; pn.children.push(cn);
  }
  roots.forEach(sortKids);
  return roots;
}
const isBelow = (n, anc) => { for (let cur = n, g = 0; cur && g < 60; g++) { if (cur === anc) return true; cur = cur.parent; } return false; };

/** A thread the chain has moved on from: its title reads "Old <role> (retired <date>)". */
export const isRetired = (title) => /^\s*old\b.*\bretired\b/i.test(String(title || ""));
/** The chain role a title names: foreman, head, or "" when it names none. */
export const roleOf = (title) => (/foreman/i.test(title || "") ? "foreman" : /\bhead\b/i.test(title || "") ? "head" : "");
/** The live thread that holds the foreman seat: reports to the head, titled like a foreman, not retired; the newest one wins. */
export function currentForeman(byId, headId) {
  const head = byId.get(headId);
  if (!head) return null;
  let best = null;
  for (const c of head.children) if (c.link === "report" && roleOf(c.title) === "foreman" && !isRetired(c.title) && (!best || (c.at || 0) > (best.at || 0))) best = c;
  return best;
}
/**
 * The orphan rule (real data: an archived parent is dropped from /api/state, so its helpers arrive as parentless roots; some may also hang
 * under a thread titled "Old ... (retired ...)"). Such a helper moves under the CURRENT holder of its parent's role: a foreman's helper
 * under the current foreman, a head's helper under the head, an unknown parent (or none) under the head. Threads of the live chain
 * keep their place; helpers of a live thread stay with it. A move that would put a thread under itself or its own helper is ignored.
 * Returns the roots that are left (just the head when it is on the map).
 */
export function reattachOrphans(roots, byId, { headId } = {}) {
  const head = headId && byId.get(headId);
  if (!head) return roots;
  const foreman = currentForeman(byId, headId);
  const holder = (title) => (roleOf(title) === "foreman" && foreman ? foreman : head);
  const move = (n, dest) => {
    if (!dest || dest === n || n === head || isBelow(dest, n) || n.parent === dest) return;
    if (n.parent) n.parent.children = n.parent.children.filter((k) => k !== n); else roots = roots.filter((r) => r !== n);
    n.parent = dest; n.link = "spawn"; dest.children.push(n);
  };
  for (const n of [...byId.values()]) if (n.parent && isRetired(n.parent.title) && !isRetired(n.title)) move(n, holder(n.parent.title)); // helpers of a retired seat
  for (const r of [...roots]) if (r !== head) move(r, head); // roots that are in no chain and have no live parent: direct reports of the head
  roots.forEach(sortKids);
  return roots;
}

const allDone = (n) => n.status === "done" && n.children.every(allDone);
const countBelow = (n) => n.children.reduce((a, c) => a + 1 + countBelow(c), 0);
export const doneChipId = (id) => "done:" + id;

/**
 * d: Today data (already focused). opts.toggled: Set of node ids whose open/closed state differs from the default
 * (default: a subtree where everything is done is closed; each parent folds its finished helpers into one "+N done" chip, id "done:<parent>").
 * opts.match(title, project, ...helperTitles) is the filter box.
 * Returns { nodes, edges, width, height, counts, empty }. Tree: You -> head -> {foreman, leads, ...} -> workers.
 */
export function mapModel(d, opts = {}) {
  const toggled = opts.toggled || new Set(), match = opts.match || (() => true);
  if (!d) return { nodes: [], edges: [], width: W, height: 0, counts: {}, empty: true };
  const { roots } = threadTrees(d, match);
  roots.sort((a, b) => (a.id === d.headId ? -1 : b.id === d.headId ? 1 : 0) || RANK[a.status] - RANK[b.status] || b.at - a.at);
  const nodes = [], edges = [];
  const counts = { "needs-you": 0, working: 0, stalled: 0, failed: 0, done: 0 };
  const projects = new Set();
  let row = 0;
  const place = (n) => { n.y = PAD + row * ROW; row++; nodes.push(n); return n; };
  const finish = (n) => {
    const maxChars = Math.max(6, Math.min(MAX_LABEL, Math.floor((W - PAD - n.x - 52) / CHAR_W)));
    n.label = clip(n.kind === "thread" ? titleText(n.id, n.title) : n.title, maxChars);
    n.w = Math.min(W - PAD - n.x, Math.round(n.label.length * CHAR_W + (n.kind === "kevan" ? 28 : 44) + (n.hasKids ? 30 : 0) + (labelOf(n.id).isHead ? 46 : 0)));
    n.h = PILL_H;
  };
  const link = (p, c) => {
    const px = p.x + 14, py = p.y + PILL_H, cy = c.y + PILL_H / 2;
    edges.push({ id: c.id, kind: c.link === "report" ? "report" : "spawn", hot: c.status === "needs-you", from: { x: px, y: py }, to: { x: c.x, y: cy }, d: `M${px},${py}V${cy - RAD}Q${px},${cy} ${px + RAD},${cy}H${c.x}` });
  };
  const tally = (x) => { counts[x.status] = (counts[x.status] || 0) + 1; x.children.forEach(tally); };
  const addThread = (t, parent, depth) => {
    const closedByDefault = allDone(t);
    const hasKids = t.children.length > 0;
    const collapsed = hasKids && (closedByDefault !== toggled.has(t.id));
    counts[t.status] = (counts[t.status] || 0) + 1;
    projects.add(t.project);
    const n = place({ id: t.id, kind: "thread", link: t.link, title: t.title, status: t.status, depth, x: PAD + Math.min(depth, 6) * INDENT, parentId: parent.id, hasKids, collapsed, below: countBelow(t), project: t.project, model: t.model, context: t.context });
    finish(n); link(parent, n);
    if (collapsed) { t.children.forEach(tally); return; }
    // finished helpers fold into ONE chip per parent (chain members, link "report", always stay); working / needs-you / failed / stalled stay on the map
    const fin = t.children.filter((c) => allDone(c) && c.link !== "report"), open = toggled.has(doneChipId(t.id));
    for (const c of t.children) if (open || !fin.includes(c)) addThread(c, n, depth + 1); else tally(c);
    if (fin.length) {
      const cnt = fin.reduce((a, c) => a + 1 + countBelow(c), 0), cid = doneChipId(t.id);
      const chip = place({ id: cid, kind: "chip", link: "spawn", title: open ? `Hide ${cnt} done` : `+${cnt} done`, status: "done", depth: depth + 1, x: PAD + Math.min(depth + 1, 6) * INDENT, parentId: t.id, hasKids: false, collapsed: !open, count: cnt, owner: t.title, below: 0 });
      finish(chip); link(n, chip);
    }
  };

  const kevan = place({ id: "kevan", kind: "kevan", title: "You", status: null, depth: 0, x: PAD, parentId: null, hasKids: false, collapsed: false, below: 0 });
  finish(kevan);
  for (const r of roots) addThread(r, kevan, 1);
  kevan.hasKids = roots.length > 0;
  kevan.w = 84;
  return { nodes, edges, width: W, height: PAD * 2 + row * ROW - (ROW - PILL_H), counts, empty: roots.length === 0, multiProject: projects.size > 1 };
}

// ---------- tree layout (top-down or left-right) ----------
// treeLayout() is pure: the mapModel() tree in, boxes and elbow lines out. Same tree for both directions, only the axes swap.
const SIZE = { kevan: { w: 132, h: 44 }, project: { w: 220, h: 44 }, chip: { w: 150, h: 44 }, thread: { w: 224, h: 98 } };
const OUT_IN = 28, OUT_GAP = 36; // phone outline: indent per level, space between rows (the fold button sits in it)
const STACK_AT = 3, STACK_GAP = 12, STACK_IN = 30;
const GAP_X = 20, GAP_Y_DOWN = 52, GAP_Y_RIGHT = 76, EDGE_PAD = 20;
export const MAP_DIR_KEY = "ko.mapdir";
export const normDir = (v) => (v === "right" ? "right" : "down");
/** The remembered switch ("down" = top-down, the default; "right" = left-right). Storage can be missing or throw: then the default. */
export function readDir(storage) { try { return normDir(storage && storage.getItem(MAP_DIR_KEY)); } catch { return "down"; } }
export function writeDir(storage, dir) { try { storage.setItem(MAP_DIR_KEY, normDir(dir)); return true; } catch { return false; } }

export function treeLayout(model, dir = "down", opts = {}) {
  dir = normDir(dir);
  const down = dir === "down";
  const byId = new Map(model.nodes.map((n) => [n.id, { ...n, ...SIZE[n.kind || "thread"], kids: [] }]));
  let root = null;
  for (const n of byId.values()) {
    const p = n.parentId && byId.get(n.parentId);
    if (p) p.kids.push(n); else if (!root) root = n;
  }
  if (!root) return { nodes: [], edges: [], width: 0, height: 0, dir };
  if (down && opts.narrow) { // a phone: a plain outline (one card per row, indented per level) keeps the cards big enough to read
    const out = []; let y = EDGE_PAD;
    const walk = (n, depth) => { n.x = EDGE_PAD + depth * OUT_IN; n.y = y; y += n.h + OUT_GAP; out.push(n); n.kids.forEach((k) => walk(k, depth + 1)); };
    walk(root, 0);
    const edges = out.filter((n) => n !== root && byId.get(n.parentId)).map((n) => {
      const p = byId.get(n.parentId), a = { x: p.x + 14, y: p.y + p.h }, b = { x: n.x, y: n.y + n.h / 2 };
      return { id: n.id, kind: n.kind === "thread" && n.link === "report" ? "report" : "spawn", hot: n.status === "needs-you", from: a, to: b, d: `M${a.x},${a.y}V${b.y}H${b.x}` };
    });
    return { nodes: out.map(({ kids, ...n }) => n), edges, width: Math.max(...out.map((n) => n.x + n.w)) + EDGE_PAD, height: y - OUT_GAP + EDGE_PAD, dir, narrow: true };
  }
  const cs = (n) => (down ? n.w : n.h), ms = (n) => (down ? n.h : n.w); // cross-axis and main-axis size
  const crossGap = down ? GAP_X : 14, mainGap = down ? GAP_Y_DOWN : GAP_Y_RIGHT;
  const level = [];
  const measure = (n, depth) => {
    n.depth2 = depth; level[depth] = Math.max(level[depth] || 0, n.stacked ? 0 : ms(n));
    // top-down: many workers with no helpers of their own would make the tree very wide; they stack in a column under their lead instead
    if (down && n.kids.length > STACK_AT && n.kids.every((k) => !k.kids.length)) {
      n.stack = true; n.kids.forEach((k) => { k.stacked = true; k.depth2 = depth + 1; });
      level[depth + 1] = Math.max(level[depth + 1] || 0, n.kids.length * (n.kids[0].h + STACK_GAP) - STACK_GAP);
      n.extent = Math.max(cs(n), STACK_IN + n.kids[0].w);
      return n.extent;
    }
    n.extent = n.kids.length ? Math.max(cs(n), n.kids.reduce((a, k) => a + measure(k, depth + 1), 0) + crossGap * (n.kids.length - 1)) : cs(n);
    return n.extent;
  };
  measure(root, 0);
  const mainAt = []; let acc = 0;
  level.forEach((sz, i) => { mainAt[i] = acc; acc += sz + mainGap; });
  const out = [];
  const place = (n, start) => {
    const cross = start + (n.extent - cs(n)) / 2, main = mainAt[n.depth2] + (level[n.depth2] - ms(n)) / 2;
    n.x = (down ? cross : main) + EDGE_PAD; n.y = (down ? main : cross) + EDGE_PAD;
    out.push(n);
    if (n.stack) {
      n.kids.forEach((k, i) => { k.x = n.x + STACK_IN; k.y = mainAt[n.depth2 + 1] + EDGE_PAD + i * (k.h + STACK_GAP); out.push(k); });
      return;
    }
    const total = n.kids.reduce((a, k) => a + k.extent, 0) + crossGap * Math.max(0, n.kids.length - 1);
    let at = start + (n.extent - total) / 2;
    for (const k of n.kids) { place(k, at); at += k.extent + crossGap; }
  };
  place(root, 0);
  const edges = [];
  for (const n of out) {
    const p = n.parentId && byId.get(n.parentId);
    if (!p) continue;
    if (n.stacked) { // a column of workers: the line runs down the left side of the column
      const a = { x: p.x + 14, y: p.y + p.h }, b = { x: n.x, y: n.y + n.h / 2 };
      edges.push({ id: n.id, kind: n.link === "report" ? "report" : "spawn", hot: n.status === "needs-you", from: a, to: b, d: `M${a.x},${a.y}V${b.y}H${b.x}` });
      continue;
    }
    const a = down ? { x: p.x + p.w / 2, y: p.y + p.h } : { x: p.x + p.w, y: p.y + p.h / 2 };
    const b = down ? { x: n.x + n.w / 2, y: n.y } : { x: n.x, y: n.y + n.h / 2 };
    const d = down ? `M${a.x},${a.y}V${(a.y + b.y) / 2}H${b.x}V${b.y}` : `M${a.x},${a.y}H${(a.x + b.x) / 2}V${b.y}H${b.x}`;
    edges.push({ id: n.id, kind: n.kind === "thread" && n.link === "report" ? "report" : "spawn", hot: n.status === "needs-you", from: a, to: b, d });
  }
  const width = Math.max(...out.map((n) => n.x + n.w)) + EDGE_PAD, height = Math.max(...out.map((n) => n.y + n.h)) + EDGE_PAD;
  return { nodes: out.map(({ kids, extent, depth2, stack, stacked, ...n }) => n), edges, width, height, dir };
}

/** Ids to zoom on first on a phone: the head (the first thread under You) and its direct reports; Fit still shows everything. */
export function focusIds(model) {
  const kids = (id) => model.nodes.filter((n) => n.parentId === id && n.kind === "thread");
  const head = kids("kevan")[0] || model.nodes.find((n) => n.kind === "thread");
  if (!head) return [];
  return [head.id, ...model.nodes.filter((n) => n.parentId === head.id).map((n) => n.id)];
}
/** The box around some nodes of a layout. */
export function boxOf(layout, ids) {
  const ns = layout.nodes.filter((n) => !ids || ids.includes(n.id));
  if (!ns.length) return { x: 0, y: 0, w: layout.width, h: layout.height };
  const x0 = Math.min(...ns.map((n) => n.x)), y0 = Math.min(...ns.map((n) => n.y));
  return { x: x0, y: y0, w: Math.max(...ns.map((n) => n.x + n.w)) - x0, h: Math.max(...ns.map((n) => n.y + n.h)) - y0 };
}
export const READABLE_K = 0.5, FOCUS_MIN_K = 0.93; // 14 px node names x 0.93 = 13 px on screen
/**
 * The view the Map opens with (pure). `saved` (an explicit view You made) always wins.
 * Desktop (>= 600 px wide): everything, if that stays readable (k >= READABLE_K); otherwise zoomed on the head and its direct reports.
 * Phone: always zoomed on the head and its direct reports (k 0.93..1: text >= 13 px, cards >= 44 pt), You's node at the top; Fit shows everything.
 * When the focused nodes are wider than the view the head (not the left edge of the box) is centred, so nothing is lost off one side.
 */
export function initialView(layout, ids, vw, vh, saved = null) {
  if (saved) return { ...saved };
  if (!layout || !layout.nodes || !layout.nodes.length) return { k: 1, x: 0, y: 0 };
  const all = fitView(boxOf(layout), vw, vh);
  if (vw >= 600 && (all.k >= READABLE_K || !ids.length)) return all;
  if (!ids.length) return all;
  const pad = 12, fb = boxOf(layout, ids), head = layout.nodes.find((n) => n.id === ids[0]) || layout.nodes[0];
  const kev = layout.nodes.find((n) => n.kind === "kevan");
  const k = Math.max(FOCUS_MIN_K, Math.min(1, (vw - pad * 2) / Math.max(1, fb.w), (vh - pad * 2) / Math.max(1, fb.h)));
  const x = fb.w * k <= vw - pad * 2 ? (vw - fb.w * k) / 2 - fb.x * k : vw / 2 - (head.x + head.w / 2) * k;
  return { k, x, y: pad - Math.min(head.y, kev ? kev.y : head.y) * k };
}
export const MIN_K = 0.2, MAX_K = 2.5;
/** Scale and offset that centre `box` in a view of vw x vh with some air around it; scale is clamped (never bigger than 1.15 so a lone node stays calm). */
export function fitView(box, vw, vh, pad = 16, maxK = 1.15, minK = MIN_K, top = false) {
  const k = Math.max(minK, Math.min(maxK, (vw - pad * 2) / Math.max(1, box.w), (vh - pad * 2) / Math.max(1, box.h)));
  // when the content is bigger than the view even at minK, start at its top-left instead of cutting it evenly on both sides
  const at = (view, size, o) => (size * k <= view - pad * 2 ? (view - size * k) / 2 - o * k : pad - o * k);
  return { k, x: at(vw, box.w, box.x), y: top ? pad - box.y * k : at(vh, box.h, box.y) };
}
/** Zoom by factor f keeping the screen point (cx, cy) still. */
export function zoomAt(v, f, cx, cy) {
  const k = Math.max(MIN_K, Math.min(MAX_K, v.k * f)), r = k / v.k;
  return { k, x: cx - (cx - v.x) * r, y: cy - (cy - v.y) * r };
}
/** A title on at most two lines (word wrap by estimated width; the second line gets the ellipsis). */
export function wrapTitle(t, px, maxW) {
  const words = String(t).split(/\s+/).filter(Boolean);
  let l1 = "", i = 0;
  for (; i < words.length; i++) {
    const t2 = l1 ? l1 + " " + words[i] : words[i];
    if (textWidth(t2, px, true) > maxW && l1) break;
    l1 = t2;
  }
  if (textWidth(l1, px, true) > maxW) return [fitText(l1, px, maxW, true)];
  const rest = words.slice(i).join(" ");
  return rest ? [l1, fitText(rest, px, maxW, true)] : [l1];
}

// ---------- drawing ----------
const NS = "http://www.w3.org/2000/svg";
const sn = (tag, attrs = {}, ...kids) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) n.setAttribute(k, v); for (const k of kids.flat()) if (k != null) n.append(k.nodeType ? k : document.createTextNode(k)); return n; };
const hn = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

/** The status as a SHAPE (never colour alone): filled circle working, diamond needs you, square failed, ring no progress, ring with a tick done. */
function statusShape(status, cx, cy) {
  const c = "mp-shape " + status;
  if (status === "needs-you") return sn("path", { class: c, d: `M${cx},${cy - 7}L${cx + 7},${cy}L${cx},${cy + 7}L${cx - 7},${cy}Z` });
  if (status === "failed") return sn("rect", { class: c, x: cx - 6, y: cy - 6, width: 12, height: 12, rx: 2 });
  if (status === "working") return sn("circle", { class: c, cx, cy, r: 6 });
  if (status === "done") return sn("g", {}, sn("circle", { class: c, cx, cy, r: 7 }), sn("path", { class: "mp-tick", d: `M${cx - 3.5},${cy}L${cx - 1},${cy + 3}L${cx + 3.5},${cy - 3}` }));
  return sn("circle", { class: c, cx, cy, r: 6 });
}

/** One card as SVG. `n` is a layout node. */
/** Invisible hit shapes stay at least 44 screen points whatever the zoom: the fold handles' circle and the finished-threads chips' box grow as the map shrinks. */
export function hitSizes(world, k) {
  const f = Math.max(1, 1 / (k || 1));
  for (const c of world.querySelectorAll(".mp-tog .mp-hit")) c.setAttribute("r", String(22 * f));
  for (const r of world.querySelectorAll(".mp-chip-hit")) { const h0 = Number(r.getAttribute("data-h")) || 44, h = Math.max(h0, 44 * f); r.setAttribute("height", String(h)); r.setAttribute("y", String((h0 - h) / 2)); }
}
function drawNode(n, dir, { open, toggle, reveal, multiProject }) {
  const isThread = n.kind === "thread", isChip = n.kind === "chip", canToggle = n.hasKids && n.kind !== "kevan";
  const word = wordOf(n);
  const who = isThread ? whoLine(n.model) : "";
  const dt = isThread ? titleText(n.id, n.title) : n.title, isHead = isThread && labelOf(n.id).isHead;
  const full = isThread ? [dt + (isHead ? " (Head)" : ""), who, word].filter(Boolean).join(" · ") : n.title + (word ? " · " + word : "");
  const act = isThread ? () => open(n.id) : canToggle || isChip ? () => toggle(n.id) : null;
  const g = sn("g", { class: `mp-node ${n.kind} ${n.status || ""}`, "data-id": n.id, transform: `translate(${n.x},${n.y})`, tabindex: act ? "0" : null, role: act ? "button" : null,
    "aria-label": n.kind === "kevan" ? "You" : isThread ? `${full}. Open chat` : isChip ? `${n.collapsed ? "Show" : "Hide"} ${n.count} finished thread${n.count === 1 ? "" : "s"} of ${n.owner}` : `${full}. ${n.collapsed ? "Show" : "Hide"} its threads` });
  g.append(sn("title", {}, full), sn("rect", { class: "mp-card", width: n.w, height: n.h, rx: 14 }));
  if (n.kind === "kevan") g.append(sn("text", { class: "mp-name kevan", x: n.w / 2, y: n.h / 2 + 5, "text-anchor": "middle" }, "You"));
  else if (isChip) g.append(statusShape("done", 22, n.h / 2), sn("text", { class: "mp-name", x: 40, y: n.h / 2 + 5 }, n.title), sn("rect", { class: "mp-hit mp-chip-hit", x: 0, y: 0, width: n.w, height: n.h, "data-h": n.h })); // invisible: grows to a 44 pt touch height when the map is zoomed out (see apply)
  else if (n.kind === "project") {
    g.append(statusShape(n.status, 20, n.h / 2), sn("text", { class: "mp-name", x: 38, y: n.h / 2 + 5 }, fitText(n.title, 14, n.w - 38 - 44, true)));
  } else {
    const ai = aiOf(n.model);
    if (ai) g.append(sn("image", { href: ai.idleUrl, x: 10, y: 10, width: 36, height: 36, class: "mp-face", "shape-rendering": "crispEdges" }));
    else g.append(sn("circle", { class: "mp-noface", cx: 28, cy: 28, r: 17 }), sn("text", { class: "mp-name", x: 28, y: 33, "text-anchor": "middle" }, (n.title || "?")[0].toUpperCase()));
    const lines = wrapTitle(dt, 14, n.w - 56 - (isHead ? 56 : 12));
    lines.forEach((t, i) => g.append(sn("text", { class: "mp-name", x: 54, y: 24 + i * 18 }, t)));
    if (isHead) g.append(sn("text", { class: "mp-hd", x: n.w - 46, y: 20 }, "Head"));
    if (who) g.append(sn("text", { class: "mp-who", x: 12, y: 66 }, fitText(who, 13, n.w - 24)));
    const proj = multiProject && n.project && !(contextText(n.context) || {}).row ? fitText(n.project, 12, 84, true) : ""; // the project as a small chip (only when there is more than one)
    if (proj) { const pw = Math.round(textWidth(proj, 12, true) + 16); g.append(sn("rect", { class: "mp-proj", x: n.w - 10 - pw, y: 73, width: pw, height: 20, rx: 10 }), sn("text", { class: "mp-proj-t", x: n.w - 10 - pw / 2, y: 87, "text-anchor": "middle" }, proj)); }
    g.append(statusShape(n.status || "done", 19, 84), sn("text", { class: "mp-word " + n.status, x: 33, y: 89 }, word));
    const c = contextText(n.context); // only when it is growing or big: a calm map otherwise
    if (c && c.row) {
      const w = Math.min(n.w - 33 - 14 - textWidth(word, 13, true) - 14, Math.round(textWidth(c.row, 13) + 14));
      if (w > 40) {
        const x = n.w - 10 - w;
        g.append(sn("rect", { class: "mp-ctx " + c.level, x, y: 72, width: w, height: 22, rx: 11 }), sn("text", { class: "mp-ctx-t " + c.level, x: x + w / 2, y: 88, "text-anchor": "middle" }, fitText(c.row, 13, w - 10)));
      }
    }
  }
  if (canToggle) {
    const at = dir === "outline" ? { x: n.w - 30, y: n.h + 17 } : dir === "down" ? { x: n.w / 2, y: n.h + 15 } : { x: n.w + 17, y: n.h / 2 }; // just outside the card, never over its text
    const word2 = n.collapsed ? `Show ${n.below} thread${n.below === 1 ? "" : "s"} below ${n.title}` : `Hide the ${n.below} thread${n.below === 1 ? "" : "s"} below ${n.title}`;
    const b = sn("g", { class: "mp-tog", transform: `translate(${at.x},${at.y})`, role: "button", tabindex: "0", "aria-label": word2, "aria-expanded": String(!n.collapsed) },
      sn("title", {}, word2), sn("circle", { class: "mp-hit", r: 22 }), sn("circle", { class: "mp-tog-c", r: n.collapsed ? 15 : 12 }),
      sn("text", { y: 5, "text-anchor": "middle" }, n.collapsed ? "+" + Math.min(n.below, 99) : "–"));
    b.addEventListener("click", (e) => { e.stopPropagation(); toggle(n.id); });
    b.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(n.id); } });
    g.append(b);
  }
  if (act) {
    g.addEventListener("click", act);
    g.addEventListener("keydown", (e) => { if (e.target === g && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); act(); } });
  }
  g.addEventListener("focus", () => reveal(n));
  return g;
}

// the pan/zoom state survives a redraw when You has moved the view himself
let kept = null;

/**
 * The whole Map block: switch, zoom buttons, the pannable drawing and the legend.
 * opts: { open(id), toggle(id), setDir(dir), dir, phone? }. `view` is read from the box size once it is in the page.
 */
export function mapBlock(model, opts) {
  const dir = normDir(opts.dir), layout = { ...treeLayout(model, dir, { narrow: !!opts.narrow }), multiProject: model.multiProject }, drawDir = layout.narrow ? "outline" : dir;
  const wrap = hn("div", "mapx");
  const bar = hn("div", "map-bar");
  const sw = hn("div", "map-switch"); sw.setAttribute("role", "group"); sw.setAttribute("aria-label", "Map layout");
  for (const [v, label] of [["down", "Top-down"], ["right", "Left-right"]]) {
    const b = hn("button", "map-seg", label); b.type = "button"; b.setAttribute("aria-pressed", String(v === dir));
    b.addEventListener("click", () => { if (v !== dir) opts.setDir(v); });
    sw.append(b);
  }
  const box = hn("div", "map-box"); box.setAttribute("role", "region"); box.setAttribute("aria-label", "Map of who reports to whom. Drag to move, pinch or use the zoom buttons.");
  box.tabIndex = -1;
  const svg = sn("svg", { class: "map-svg", width: "100%", height: "100%", role: "group", "aria-label": "Map nodes" });
  const world = sn("g", { class: "mp-world" });
  svg.append(world);
  for (const e of layout.edges) world.append(sn("path", { d: e.d, class: "mp-edge" + (e.hot ? " hot" : "") + (e.kind === "report" ? " report" : "") }));
  const view = { k: 1, x: 0, y: 0 };
  let moved = kept && kept.dir === dir && kept.user ? { ...kept.view } : null;
  let hitK = 0; // pan moves only translate: the hit shapes are resized when the zoom changes
  const apply = () => { world.setAttribute("transform", `translate(${view.x},${view.y}) scale(${view.k})`); if (view.k !== hitK) { hitK = view.k; hitSizes(world, hitK); } kept = { dir, user: !!moved, view: { ...view } }; };
  const size = () => { const r = box.getBoundingClientRect(); return { w: r.width || 360, h: r.height || 480 }; };
  const set = (v, user) => { Object.assign(view, v); if (user) moved = { ...view }; apply(); };
  const fit = () => { const s = size(); moved = null; set(fitView(boxOf(layout), s.w, s.h)); };
  const initial = () => { const s = size(); set(initialView(layout, focusIds(model), s.w, s.h, moved)); };
  const reveal = (n) => { // keyboard focus: bring the card into view
    const s = size(), l = view.x + n.x * view.k, t = view.y + n.y * view.k;
    if (l < 0 || t < 0 || l + n.w * view.k > s.w || t + n.h * view.k > s.h) set({ k: view.k, x: s.w / 2 - (n.x + n.w / 2) * view.k, y: s.h / 2 - (n.y + n.h / 2) * view.k }, true);
  };
  for (const n of layout.nodes) world.append(drawNode(n, drawDir, { open: opts.open, toggle: opts.toggle, reveal, multiProject: model.multiProject }));
  box.append(svg);

  const ctl = hn("div", "map-ctl"); ctl.setAttribute("role", "group"); ctl.setAttribute("aria-label", "Zoom");
  const btn = (txt, label, fn, cls = "") => { const b = hn("button", "map-zb " + cls, txt); b.type = "button"; b.setAttribute("aria-label", label); b.title = label; b.addEventListener("click", fn); return b; };
  const mid = () => { const s = size(); return [s.w / 2, s.h / 2]; };
  ctl.append(btn("+", "Zoom in", () => set(zoomAt(view, 1.3, ...mid()), true)), btn("−", "Zoom out", () => set(zoomAt(view, 1 / 1.3, ...mid()), true)), btn("Fit", "Fit the whole map", fit, "fit"));
  bar.append(ctl); // zoom buttons live in the toolbar strip above the canvas, never over a node

  // drag to pan, two fingers to pinch, wheel to zoom. Capture the pointer only once it really moves, so a tap still reaches its card.
  const ptrs = new Map(); let pinch = null, drag = null;
  const local = (e) => { const r = box.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  svg.addEventListener("pointerdown", (e) => {
    if (e.target.closest && e.target.closest(".map-ctl")) return;
    ptrs.set(e.pointerId, local(e));
    if (ptrs.size === 1) drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, on: false };
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, v: { ...view } }; drag = null; }
  });
  svg.addEventListener("pointermove", (e) => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, local(e));
    if (pinch && ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y) || 1, cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      set(zoomAt(pinch.v, d / pinch.d, cx, cy), true); return;
    }
    if (drag && drag.id === e.pointerId) {
      const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (!drag.on && Math.hypot(dx, dy) > 6) { drag.on = true; try { svg.setPointerCapture(e.pointerId); } catch { /* old browser */ } box.classList.add("panning"); }
      if (drag.on) set({ k: view.k, x: drag.vx + dx, y: drag.vy + dy }, true);
    }
  });
  const end = (e) => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; if (!ptrs.size) { drag = null; box.classList.remove("panning"); } };
  svg.addEventListener("pointerup", end); svg.addEventListener("pointercancel", end);
  svg.addEventListener("wheel", (e) => { e.preventDefault(); const p = local(e); set(zoomAt(view, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016)), p.x, p.y), true); }, { passive: false });

  const save = hn("button", "map-seg map-save", "Save as picture"); save.type = "button"; save.setAttribute("aria-label", "Save the map as a picture");
  save.addEventListener("click", async () => {
    save.disabled = true; const was = save.textContent; save.textContent = "Saving…";
    try { const r = await savePicture(layout, { wrapTitle, whoLine, titleText, labelOf, aiOf, contextText, textWidth, fitText, STATUS_WORD, wordOf }); save.textContent = r === "shared" ? "Shared" : r === "cancelled" ? was : "Saved"; }
    catch { save.textContent = "Could not save"; }
    setTimeout(() => { save.textContent = was; save.disabled = false; }, 1800);
  });
  bar.append(sw, save);
  wrap.append(bar, box, mapLegend());
  // measure after the block is in the page (the box has no size before that)
  const ready = () => { initial(); if (typeof ResizeObserver === "function") { let first = true; new ResizeObserver(() => { if (first) { first = false; return; } if (!moved) initial(); }).observe(box); } };
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(ready); else ready();
  return wrap;
}

/** The small legend: dashed = reports to, solid = started by. Always shown (13px). */
export function mapLegend() {
  const lg = hn("p", "map-leg");
  for (const [report, words] of [[true, "dashed: reports to"], [false, "solid: started by"]]) {
    const it = hn("span", "lg-item"), a = hn("i", "lg-line" + (report ? " report" : ""));
    it.append(a, words); lg.append(it);
  }
  return lg;
}
