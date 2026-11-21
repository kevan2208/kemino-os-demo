// "All threads": every thread of every project, grouped by project, newest first, helpers under their parent. No innerHTML, no inline style (CSP):
// everything is built with h() and classes. The pure part (grouping, chips, search, which snippets to ask for) is tested in Node.
// Data: GET /api/threads?archived=0|1 (the list, no message text) and GET /api/threads/snippets?ids=a,b,c (short last-message text, lazily).

export const CHIPS = [["all", "All"], ["working", "Working"], ["done", "Done"]];
const LIVE = new Set(["needs-you", "working", "stalled"]);
/** A thread that is asking, running or stuck (the "Working" chip); everything else, failed included, is "Done". */
export const isLiveStatus = (s) => LIVE.has(s);
export const chipMatch = (chip, t) => (chip === "working" ? isLiveStatus(t.status) : chip === "done" ? !isLiveStatus(t.status) : true);

export const DEEP_MIN = 3, DEEP_DEBOUNCE_MS = 400;
export const SNIPPET_BATCH = 30, FIRST_SNIPPETS = 25, QUERY_SNIPPET_CAP = 120, REFRESH_MS = 15_000;

/**
 * Rows grouped by project. `threads`: the server rows ({id,title,project,projectId,status,activityAt,parentId,model,archived}).
 * Options: chip ("all"|"working"|"done"), archived (show archived rows), query (lower-case; matches title, project, branch and snippet),
 * snippets (Map id -> {text}). A helper whose parent is filtered out stands as its own row; a parent loop is cut. Pure, never mutates its input.
 */
export function buildAllList(threads, { chip = "all", archived = false, query = "", snippets = new Map() } = {}) {
  const q = String(query || "").trim().toLowerCase();
  const text = (t) => [t.title, t.project, t.branch, t.worktree, snippets.get?.(t.id)?.text].filter(Boolean).join("\n").toLowerCase();
  const rows = (Array.isArray(threads) ? threads : []).filter((t) => t && t.id && (archived || !t.archived) && chipMatch(chip, t) && (!q || text(t).includes(q)));
  const ids = new Set(rows.map((t) => t.id));
  const kids = new Map();
  for (const t of rows) if (t.parentId && t.parentId !== t.id && ids.has(t.parentId)) (kids.get(t.parentId) || kids.set(t.parentId, []).get(t.parentId)).push(t);
  const newest = (a, b) => b.activityAt - a.activityAt || (a.id < b.id ? -1 : 1);
  const subtree = new Map();
  const reach = (t, seen) => {
    if (subtree.has(t.id)) return subtree.get(t.id);
    seen.add(t.id);
    let at = t.activityAt || 0;
    for (const k of kids.get(t.id) || []) if (!seen.has(k.id)) at = Math.max(at, reach(k, seen));
    subtree.set(t.id, at);
    return at;
  };
  const byProject = new Map();
  for (const t of rows) {
    const key = t.projectId || t.project || "";
    (byProject.get(key) || byProject.set(key, []).get(key)).push(t);
  }
  const groups = [];
  for (const [key, list] of byProject) {
    const inGroup = new Set(list.map((t) => t.id));
    const isRoot = (t) => !(t.parentId && t.parentId !== t.id && ids.has(t.parentId) && inGroup.has(t.parentId));
    const out = [], seen = new Set();
    const walk = (t, depth) => {
      if (seen.has(t.id)) return;
      seen.add(t.id);
      out.push({ t, depth, snippet: snippets.get?.(t.id)?.text || "", branchHit: branchMatched(t, q) });
      for (const k of (kids.get(t.id) || []).filter((x) => inGroup.has(x.id)).sort(newest)) walk(k, depth + 1);
    };
    const roots = list.filter(isRoot);
    for (const r of roots) reach(r, new Set());
    for (const r of roots.sort((a, b) => subtree.get(b.id) - subtree.get(a.id) || (a.id < b.id ? -1 : 1))) walk(r, 0);
    for (const t of list.sort(newest)) walk(t, 0); // members of a parent loop: nobody is a root, so they are listed on their own
    groups.push({ key, name: list[0].project || "(no project)", rows: out, count: out.length, at: Math.max(...list.map((t) => t.activityAt || 0)) });
  }
  groups.sort((a, b) => b.at - a.at || (a.name < b.name ? -1 : 1));
  return { groups, total: rows.length, working: rows.filter((t) => isLiveStatus(t.status)).length, projects: groups.length };
}

/** True when the query is found in the branch (or worktree folder) of the thread and NOT in its title: the row then shows a branch chip. */
export function branchMatched(t, q) {
  if (!q) return false;
  const has = (v) => typeof v === "string" && v.toLowerCase().includes(q);
  return (has(t.branch) || has(t.worktree)) && !has(t.title);
}

/** [before, match, after] of an excerpt, for a mark element (text nodes only). Out-of-range positions give the whole text unmarked. */
export function markParts(text, at, len) {
  const s = String(text ?? "");
  if (!Number.isInteger(at) || !Number.isInteger(len) || at < 0 || len <= 0 || at + len > s.length) return [s, "", ""];
  return [s.slice(0, at), s.slice(at, at + len), s.slice(at + len)];
}

/** The deeper hits worth showing under the quick list: known threads (and archived ones only when shown) that the quick list does not already contain. Order kept. Pure. */
export function deepRows(hits, rowOf, shown, archived) {
  const out = [];
  for (const h of Array.isArray(hits) ? hits : []) {
    const t = h && rowOf(h.id);
    if (!t || shown.has(t.id) || (t.archived && !archived)) continue;
    out.push({ t, hit: h });
  }
  return out;
}

/** The honest line under the deeper results. */
export function deepNote(d) {
  if (!d) return "";
  if (d.error) return "Deeper search failed: " + d.error;
  if (d.loading) return "Searching thread text…";
  const n = (d.searched | 0), m = (d.of | 0);
  return d.partial ? "Searched " + plural(n, "recent thread") + " of " + m + ". Narrow the word or open the thread to look further." : "Searched " + plural(n, "recent thread") + ".";
}

/** Ordered row ids of a built list (what J / K walk through). */
export const listIds = (built) => built.groups.flatMap((g) => g.rows.map((r) => r.t.id));

/**
 * Which rows still need a snippet: no entry yet, or an entry that is old and the thread has moved on, or an empty entry older than 60 s.
 * Never an id asked for a moment ago (`busy`). In list order, at most `limit`. Pure.
 */
export function wantSnippets(ids, rowOf, have, busy, now, limit = SNIPPET_BATCH) {
  const out = [];
  for (const id of ids) {
    if (out.length >= limit) break;
    const r = rowOf(id), e = have.get(id);
    if (!r || busy.has(id)) continue;
    if (!e || (e.key !== r.activityAt && now - e.at > 20_000) || (!e.text && now - e.at > 60_000)) out.push(id);
  }
  return out;
}

const plural = (n, w) => n + " " + w + (n === 1 ? "" : "s");

/**
 * The view. deps: h, aiFace(model, cls), whoTag(model), badge(status, size), ago(ms), openThread(id), toLogin(), getSel(), getFilter(), setFilter(v), rerender(), isDesk(),
 * fetchImpl (tests). Keeps its own header (the Filter box is not rebuilt on every redraw, so typing is not interrupted) and the list below it.
 */
const wired = new WeakSet();
import { displayTitles } from "./labels.js";

export function createAllThreads(deps) {
  const { h } = deps;
  const f = () => (deps.fetchImpl ? deps.fetchImpl : fetch.bind(globalThis));
  const st = { data: null, error: null, loading: false, loadedAt: 0, withArchived: false, chip: "all", archived: false, snips: new Map(), busy: new Set(), blockedUntil: 0, lastAsk: 0, queryTimer: 0, built: null, again: false, deep: null, deepCache: new Map(), deepTimer: 0, deepSeq: 0 };
  let labels = new Map(), root = null, subEl = null, chipsEl = null, listEl = null, input = null, scroller = null, scrollTimer = 0;

  async function load(force = false) {
    const now = Date.now();
    if (st.loading) { if (force) st.again = true; return; }
    if (!force && st.data && now - st.loadedAt < REFRESH_MS && (!st.archived || st.withArchived)) return;
    st.loading = true;
    let login = false;
    try {
      const r = await f()("/api/threads?archived=" + (st.archived ? "1" : "0"));
      if (r.status === 401) login = true;
      else {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || "could not load (" + r.status + ")");
        st.data = j; st.withArchived = !!j.archivedIncluded; st.error = null;
      }
    } catch (e) { st.error = e.message || "could not load"; }
    finally { st.loading = false; st.loadedAt = Date.now(); }
    if (login) return deps.toLogin?.();
    if (st.again) { st.again = false; load(true); }
    deps.rerender();
  }

  const rowOf = (id) => st.data?.threads?.find((t) => t.id === id);

  /** Ask the server for these snippets (one request), then redraw. A failure, a 429 or a missing thread simply leaves no snippet. */
  async function askSnippets(ids) {
    const now = Date.now();
    if (!ids.length || now < st.blockedUntil) return;
    st.lastAsk = now;
    for (const id of ids) st.busy.add(id);
    try {
      const r = await f()("/api/threads/snippets?ids=" + ids.map(encodeURIComponent).join(","));
      if (r.status === 401) return deps.toLogin?.();
      if (r.status === 429) { st.blockedUntil = Date.now() + 30_000; return; }
      const j = r.ok ? await r.json().catch(() => ({})) : {};
      const at = Date.now();
      for (const id of ids) st.snips.set(id, { text: (j.snippets && j.snippets[id]?.text) || "", key: rowOf(id)?.activityAt ?? 0, at });
    } catch { /* offline: no snippets */ }
    finally { for (const id of ids) st.busy.delete(id); }
    deps.rerender();
  }

  /** Deeper search (the server reads the text of recent threads on demand). Debounced; one request per query and archived setting, cached for this page's life. */
  function pumpDeep(q) {
    const w = String(q || "").trim().toLowerCase();
    if (w.length < DEEP_MIN) { clearTimeout(st.deepTimer); st.deepSeq++; st.deep = null; return; }
    const key = w + "|" + (st.archived ? 1 : 0);
    if (st.deep && st.deep.key === key) return;
    const cached = st.deepCache.get(key);
    if (cached && Date.now() - cached.at < 60_000) { st.deep = cached; return; }
    st.deep = { key, q: w, loading: true, hits: [] };
    clearTimeout(st.deepTimer);
    const seq = ++st.deepSeq;
    st.deepTimer = setTimeout(async () => {
      let d;
      try {
        const r = await f()("/api/search?q=" + encodeURIComponent(w) + (st.archived ? "&archived=1" : ""));
        if (r.status === 401) return deps.toLogin?.();
        const j = await r.json().catch(() => ({}));
        d = r.ok ? { key, q: w, loading: false, hits: j.hits || [], searched: j.searched, of: j.of, partial: !!j.partial, at: Date.now() } : { key, q: w, loading: false, hits: [], error: j.error || "could not search (" + r.status + ")" };
      } catch (e) { d = { key, q: w, loading: false, hits: [], error: "could not search" }; }
      if (seq !== st.deepSeq) return; // a newer query took over
      if (!d.error) st.deepCache.set(key, d);
      st.deep = d;
      deps.rerender();
    }, DEEP_DEBOUNCE_MS);
  }

  function deepSection(q) {
    const d = st.deep;
    if (!d) return null;
    const rows = deepRows(d.hits, rowOf, new Set(ids()), st.archived).map(({ t, hit }) => {
      const [a, m, z] = markParts(hit.excerpt, hit.at, hit.len), lab = labels.get(t.id);
      const open = () => deps.openThread(t.id);
      const el = h("div", { class: "row at-row at-deep", "data-id": t.id, "data-field": hit.field, role: "button", tabindex: "0", onclick: open, onkeydown: (e) => { if (e.key === "Enter" && e.target === el) open(); } },
        deps.aiFace(t.model, ""),
        h("div", { class: "mid" },
          h("b", {}, lab ? lab.text : t.title, t.archived ? h("em", { class: "atag" }, "archived") : null),
          h("small", {}, t.project || "(no project)", hit.field === "branch" || t.branch ? h("em", { class: "atag at-branch" }, t.branch || t.worktree || "") : null),
          h("small", { class: "snip at-excerpt" }, a, m ? h("mark", {}, m) : null, z)),
        h("span", { class: "t" }, deps.ago(t.activityAt)));
      return el;
    });
    return h("section", { class: "at-grp at-deepgrp", "aria-label": "Deeper results" },
      h("div", { class: "pj" }, h("span", {}, "In thread text"), h("span", {}, d.loading ? "…" : plural(rows.length, "more thread"))),
      rows, h("p", { class: "sub at-note", role: "status" }, deepNote(d)));
  }

  const ids = () => (st.built ? listIds(st.built) : []);
  /** The first rows of the list (all of them when searching, up to a cap, in batches), and later the ones scrolled near. */
  function pump() {
    if (!st.built) return;
    const now = Date.now(), q = (deps.getFilter() || "").trim();
    const order = ids();
    pumpDeep(q);
    if (q.length >= 2) {
      clearTimeout(st.queryTimer);
      st.queryTimer = setTimeout(async () => {
        // searching: the snippet text decides what matches, so read the rest too (a few batches, in order, spaced out by the server's own limit)
        for (let n = 0; n < Math.ceil(QUERY_SNIPPET_CAP / SNIPPET_BATCH); n++) {
          const w = wantSnippets(allRowIds(), rowOf, st.snips, st.busy, Date.now(), SNIPPET_BATCH).slice(0, SNIPPET_BATCH);
          if (!w.length || Date.now() < st.blockedUntil) break;
          await askSnippets(w);
        }
      }, 350);
      return;
    }
    const w = wantSnippets(order.slice(0, FIRST_SNIPPETS), rowOf, st.snips, st.busy, now);
    if (w.length) askSnippets(w);
  }
  /** Every row of the current chip, in server order, up to the search cap. */
  function allRowIds() {
    return (st.data?.threads || []).filter((t) => (st.archived || !t.archived) && chipMatch(st.chip, t)).slice(0, QUERY_SNIPPET_CAP).map((t) => t.id);
  }
  /** Rows near the viewport that still have no snippet. Throttled; a no-op where the DOM cannot measure (tests). */
  function onScroll() {
    if (scrollTimer) return;
    scrollTimer = setTimeout(() => {
      scrollTimer = 0;
      if (!scroller?.getBoundingClientRect || !listEl?.querySelectorAll || Date.now() - st.lastAsk < 1500) return;
      const box = scroller.getBoundingClientRect(), pad = box.height;
      const near = [...listEl.querySelectorAll(".at-row")].filter((el) => { const r = el.getBoundingClientRect(); return r.bottom > box.top - pad && r.top < box.bottom + pad; }).map((el) => el.dataset.id);
      const w = wantSnippets(near, rowOf, st.snips, st.busy, Date.now());
      if (w.length) askSnippets(w);
    }, 200);
  }

  function setChip(c) { st.chip = c; deps.rerender(); }
  function toggleArchived() { st.archived = !st.archived; if (st.archived && !st.withArchived) load(true); deps.rerender(); }

  function chips() {
    return h("div", { class: "sg chips", role: "group", "aria-label": "Show" },
      CHIPS.map(([k, label]) => h("button", { type: "button", "data-chip": k, "aria-pressed": st.chip === k, onclick: () => setChip(k) }, label)),
      h("button", { type: "button", "data-chip": "archived", "aria-pressed": st.archived, onclick: toggleArchived }, "Archived"));
  }

  /** One row. `entry` = { t, depth, snippet }. Helpers (depth > 0) are indented with the small face. */
  function row(entry) {
    const { t, depth, snippet } = entry, lab = labels.get(t.id), sm = depth > 0, sel = deps.getSel() === t.id;
    const open = () => deps.openThread(t.id);
    const el = h("div", { class: "row at-row" + (sel ? " sel" : "") + (sm ? " at-sub" : "") + (t.archived ? " at-arch" : ""), "data-id": t.id, "data-status": t.status, role: "button", tabindex: "0", onclick: open,
      onkeydown: (e) => { if (e.key === "Enter" && e.target === el) open(); } },
      isLiveStatus(t.status) ? h("span", { class: "at-spin" }, deps.badge(t.status, 16)) : null,
      deps.aiFace(t.model, sm ? "sm" : ""),
      h("div", { class: "mid" },
        h("b", {}, lab ? lab.text : t.title, lab && lab.isHead ? h("em", { class: "hd-tag" }, "Head") : null, t.archived ? h("em", { class: "atag" }, "archived") : null),
        h("small", {}, deps.whoTag(t.model)),
        entry.branchHit ? h("small", {}, h("em", { class: "atag at-branch" }, t.branch || t.worktree)) : null,
        h("small", { class: "snip" }, snippet || ""),
        deps.contextBadge ? deps.contextBadge(t.context) : null),
      h("span", { class: "t" }, deps.ago(t.activityAt)));
    return el;
  }

  function header(built) {
    const d = st.data;
    const bits = [plural(built.projects, "project"), plural(built.total, "thread"), built.working ? built.working + " working" : null];
    return bits.filter(Boolean).join(" · ") + (d && d.complete === false ? " · recent threads only" : "");
  }

  function ensureRoot() {
    if (root) return;
    subEl = h("p", { class: "sub" });
    chipsEl = h("div", { class: "at-chips" });
    listEl = h("div", { class: "at-list", id: "at-list" });
    input = h("input", { type: "search", class: "at-search desk-only", placeholder: "Search threads, branches, text", "aria-label": "Search threads", enterkeyhint: "search", autocomplete: "off",
      oninput: (e) => { deps.setFilter(e.target.value.toLowerCase()); } });
    root = h("div", { class: "at" }, h("div", { class: "title" }, h("h1", {}, "All threads")), subEl, input, chipsEl, listEl);
  }

  /** Draws into `el` (the list pane's content). Safe to call as often as the app redraws. */
  function render(el) {
    ensureRoot();
    if (root.parentNode !== el) {
      el.replaceChildren(root);
      scroller = el.closest?.(".scroll") || null;
      if (scroller?.addEventListener && !wired.has(scroller)) { wired.add(scroller); scroller.addEventListener("scroll", onScroll, { passive: true }); }
    }
    if (!st.data && !st.error) load();
    else if (Date.now() - st.loadedAt > REFRESH_MS) load();
    const q = deps.getFilter() || "";
    if (input && input.value !== q && globalThis.document?.activeElement !== input) input.value = q;
    chipsEl.replaceChildren(chips());
    if (!st.data) {
      subEl.textContent = st.error ? "" : "Loading…";
      listEl.replaceChildren(...(st.error ? [h("div", { class: "clear" }, h("b", {}, "Could not load threads"), st.error, h("div", {}, h("button", { type: "button", class: "b m", "data-act": "retry", onclick: () => { st.error = null; load(true); deps.rerender(); } }, "Try again")))] : [h("div", { class: "skel" }, ""), h("div", { class: "skel" }, ""), h("div", { class: "skel" }, "")]));
      st.built = null;
      return;
    }
    labels = displayTitles(st.data.threads.filter((t) => st.archived || !t.archived), deps.getHeadId?.());
    const built = st.built = buildAllList(st.data.threads, { chip: st.chip, archived: st.archived, query: q, snippets: st.snips });
    subEl.textContent = header(built);
    const kids = built.groups.map((g) => h("section", { class: "at-grp", "data-project": g.key },
      h("div", { class: "pj" }, h("span", {}, g.name), h("span", {}, plural(g.count, "thread"))),
      g.rows.map(row)));
    if (!kids.length && !(st.deep && (st.deep.loading || st.deep.hits?.length)) ) kids.push(h("div", { class: "clear" }, h("b", {}, q ? "Nothing matches" : st.chip === "working" ? "Nothing is working" : "No threads"), q ? "Try a different word, or another filter." : st.archived ? "" : "Archived threads stay hidden until you turn that chip on."));
    const deep = deepSection(q);
    if (deep) kids.push(deep);
    listEl.replaceChildren(...kids.filter((k) => k != null && k !== false));
    pump();
  }

  return { render, ids, load, state: st, setChip, toggleArchived, row, buildNow: () => st.built };
}
