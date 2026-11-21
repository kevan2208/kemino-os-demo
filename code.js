// The Code screen: per GitHub repo, the branch graph (main is the trunk, each branch forks off it). Active by default, "+N merged" folded behind a stub,
// filter chips + search, and a thread chip on a branch whose name EXACTLY matches a thread's branch (tap = open that chat). READ-ONLY: it only shows what /api/code says.
// All text goes in as text nodes; the SVG is built with attributes only (no inline style, no innerHTML, no handlers in markup: CSP).

/** "3 d ago", "today", "unknown". Pure. */
export function agoShort(iso, now = Date.now()) {
  const t = Date.parse(iso || "");
  if (!Number.isFinite(t)) return "unknown";
  const d = Math.max(0, (now - t) / 86_400_000);
  return d < 1 ? "today" : d < 2 ? "yesterday" : Math.round(d) + " d ago";
}
/** "+3 merged · 1 stale" for the folded rows. Pure. */
export function stubText(fold) {
  const m = fold.filter((b) => b.state === "merged").length, s = fold.filter((b) => b.state === "stale").length;
  return "+" + m + " merged" + (s ? " · " + s + " stale" : "");
}
/** Which rows to draw: `main` for the chip + search, `fold` (Active chip only) for the stub. Search reads names and commit messages. Pure. */
export function filterBranches(branches, flt, q) {
  const s = String(q || "").trim().toLowerCase();
  const hit = (b) => !s || (b.name + " " + (b.commits || []).map((c) => c.msg).join(" ") + " " + (b.pr?.title || "")).toLowerCase().includes(s);
  const inF = (b) => flt === "all" || b.state === flt;
  return { main: branches.filter((b) => inF(b) && hit(b)), fold: flt === "active" ? branches.filter((b) => b.state !== "active" && hit(b)) : [] };
}
/** Lane geometry in a 0..100 box: how far back it forks from the tip of main (behind) and how long it runs (ahead). Square-root scale so one huge branch does not flatten the rest. Pure. */
export function branchLanes(b) {
  const sc = (n) => Math.min(44, Math.sqrt(Math.max(0, n)) * 6);
  return { back: Math.round(sc(b.behind) * 10) / 10, len: Math.max(3, Math.round(sc(b.ahead) * 10) / 10) };
}

const FILTERS = [["active", "Active"], ["merged", "Merged"], ["stale", "Stale"], ["all", "All"]];
const SVGNS = "http://www.w3.org/2000/svg";
const S = (tag, attrs, parent) => { const e = document.createElementNS(SVGNS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.append(e); return e; };
const TH_STATUS = { working: "working", "needs-you": "needs you", done: "done", failed: "failed", stalled: "stalled", idle: "idle" };

const wideNow = () => matchMedia("(min-width:900px)").matches;
/** `wide` (>= 900 px, the full page): the same geometry stretched over a 360-wide box so the lanes use the room (longer bars, wider forks). */
function laneSvg(b, wide) {
  const { back, len } = branchLanes(b), W = wide ? 360 : 140, k = W / 140, svg = S("svg", { viewBox: "0 0 " + W + " 16", width: "100%", height: "16", "aria-hidden": "true", class: "cd-lane " + b.state, preserveAspectRatio: "xMinYMid meet" });
  const fx = Math.max(6, 60 - back * 1.2) * k, ex = Math.min(134 * k, fx + (12 + len * 1.4) * k), fw = 12 * (wide ? 2 : 1);
  S("path", { class: "cd-trunk", d: "M2 3H" + (W - 2) }, svg);
  S("path", { class: "cd-fork", d: "M" + fx + " 3C" + fx + " 10 " + (fx + 3) + " 12 " + (fx + fw) + " 12L" + Math.max(ex, fx + fw) + " 12" }, svg);
  S("circle", { class: "cd-end", cx: Math.max(ex, fx + fw), cy: 12, r: 3 }, svg);
  return svg;
}

/** deps: { h, toast, toLogin, openThread, onClose }. */
export function openCode({ h, toast, toLogin, openThread, onClose, opener: from }) {
  if (document.querySelector(".cd-wrap")) return;
  let D = null, repo = null, flt = "active", q = "", openStub = false, sel = null;
  const opener = from || document.activeElement; // focus goes in when the screen opens and back to what opened it on close
  const mq = matchMedia("(min-width:900px)"), onMq = () => { if (D) draw(); };
  mq.addEventListener("change", onMq);
  const close = () => {
    mq.removeEventListener("change", onMq);
    onClose?.(); wrap.classList.remove("in"); setTimeout(() => wrap.remove(), 200); removeEventListener("keydown", onKey, true);
    // The opener (the Menu item or More button) is gone or re-rendered: find the live More control again by a stable attribute and retry for ~1.5 s while focus is lost.
    const live = () => (opener?.isConnected && opener !== document.body ? opener : opener?.dataset?.act ? document.querySelector('[data-act="' + opener.dataset.act + '"]') : opener?.dataset?.tab ? document.querySelector('[data-tab="' + opener.dataset.tab + '"]') : null) || document.querySelector('[data-act="more"]') || document.querySelector('[data-tab="more"]');
    const t0 = Date.now(), tryFocus = () => { const a = document.activeElement; if ((!a || a === document.body) && !document.querySelector(".np-wrap")) { try { live()?.focus({ preventScroll: true }); } catch { /* gone */ } } if (Date.now() - t0 < 1500) setTimeout(tryFocus, 150); };
    setTimeout(tryFocus, 60);
  };
  const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
  const status = h("p", { class: "cd-status", role: "status", "aria-live": "polite" }, "Loading the branches…");
  const body = h("div", { class: "cd-body" });
  const wrap = h("div", { class: "np-wrap cd-wrap", role: "dialog", "aria-modal": "true", "aria-label": "Code", onclick: (e) => { if (e.target === wrap) close(); } },
    h("div", { class: "np-card cd-card" },
      h("div", { class: "np-head" }, h("strong", {}, "Code"), h("button", { class: "np-x", "aria-label": "Close", onclick: close }, "×")),
      status, body));
  addEventListener("keydown", onKey, true);
  document.body.append(wrap);
  requestAnimationFrame(() => wrap.classList.add("in"));
  wrap.querySelector(".np-x").focus({ preventScroll: true });

  async function load() {
    try {
      const r = await fetch("/api/code");
      if (r.status === 401) { toLogin(); return; }
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "The branch map could not be read.");
      D = j; repo = D.repos.find((x) => x.repo === repo)?.repo ?? D.repos[0]?.repo ?? null;
      status.textContent = ""; draw();
    } catch (e) { status.textContent = e.message; status.classList.add("err"); }
  }

  /** Which button has focus inside the body, as a selector that finds its twin after a redraw (repo, filter, branch row, stub). */
  const focusKey = () => {
    const a = document.activeElement; if (!a || !body.contains(a)) return null;
    if (a.dataset.repo) return '[data-repo="' + CSS.escape(a.dataset.repo) + '"]';
    if (a.dataset.flt) return '[data-flt="' + a.dataset.flt + '"]';
    if (a.dataset.stub) return '[data-stub]';
    const li = a.closest(".cd-item[data-branch]");
    return li && a.classList.contains("cd-row") ? '.cd-item[data-branch="' + CSS.escape(li.dataset.branch) + '"] .cd-row' : null;
  };
  const refocus = (k) => { if (k) body.querySelector(k)?.focus({ preventScroll: true }); };

  /** The branch's facts: inline under its row on a phone, in the right-hand column on the full page. */
  function detail(b, now) {
    return h("div", { class: "cd-detail" },
      h("div", { class: "cd-kv" }, "State: ", h("b", {}, b.state === "merged" ? "merged / nothing new" : b.state), b.pr ? " · Open PR: " : "", b.pr ? h("b", {}, "#" + b.pr.number + " " + b.pr.title) : null),
      b.threads.length ? h("div", { class: "cd-threads" }, b.threads.map((t) => h("button", { class: "cd-th " + t.status, type: "button", onclick: () => { close(); openThread(t.id); } }, h("b", {}, t.title), h("span", {}, (TH_STATUS[t.status] || t.status) + " · open chat")))) : h("div", { class: "cd-kv" }, "Thread: ", h("b", {}, "no thread on this exact branch name")),
      b.commits.length ? h("ul", { class: "cd-commits" }, b.commits.map((c) => h("li", {}, c.msg || "(no message)", h("small", {}, agoShort(c.at, now) + (c.by ? " · " + c.by : ""))))) : null);
  }
  function row(b, now, wide) {
    const open = sel === b.name;
    const chips = [
      b.pr ? h("span", { class: "cd-chip pr" }, "PR #" + b.pr.number) : null,
      ...b.threads.slice(0, 1).map((t) => h("button", { class: "cd-chip th " + t.status, type: "button", "data-thread": t.id, title: "Open this chat", onclick: (e) => { e.stopPropagation(); close(); openThread(t.id); } }, h("i", { "aria-hidden": "true" }), t.title)),
      b.threads.length > 1 ? h("span", { class: "cd-chip" }, "+" + (b.threads.length - 1)) : null,
    ].filter(Boolean);
    const meta = (b.state === "merged" ? "in " + (D.repos.find((x) => x.repo === repo)?.def || "main") : b.unread ? "could not compare" : "+" + b.ahead + (b.behind ? " / −" + b.behind : "")) + (b.tipAt ? " · " + agoShort(b.tipAt, now) : "");
    return h("li", { class: "cd-item " + b.state + (open ? " open" : ""), "data-branch": b.name },
      h("button", { class: "cd-row", type: "button", [wide ? "aria-pressed" : "aria-expanded"]: String(open), onclick: () => { sel = open ? null : b.name; draw(); } },
        h("span", { class: "cd-name" }, b.name), h("span", { class: "cd-meta" }, meta), laneSvg(b, wide), h("span", { class: "cd-chips" }, chips)),
      open && !wide ? detail(b, now) : null);
  }

  /** Keep the card from jumping when the list gets shorter (repo/filter switch): remember its tallest height as min-height and its scroll position. */
  let tall = 0;
  const steady = () => { if (wideNow()) return; const card = wrap.querySelector(".cd-card"), top = card.scrollTop; tall = Math.max(tall, card.offsetHeight); card.style.minHeight = Math.min(tall, parseFloat(getComputedStyle(card).maxHeight) || tall) + "px"; card.scrollTop = top; };
  function draw() {
    const wide = wideNow(), g0 = body.querySelector(".cd-graph"), gTop = g0 ? g0.scrollTop : 0, s0 = body.querySelector(".cd-side"), sTop = s0 ? s0.scrollTop : 0;
    const card0 = wrap.querySelector(".cd-card"), top0 = card0 ? card0.scrollTop : 0;
    if (card0 && !wide) card0.style.minHeight = card0.offsetHeight + "px"; // freeze at the current height while the body is rebuilt
    const fk = focusKey();
    const r = D.repos.find((x) => x.repo === repo);
    const seg = h("div", { class: "cd-seg", role: "group", "aria-label": "Repository" }, D.repos.map((x) => h("button", { type: "button", "aria-pressed": String(x.repo === repo), "data-repo": x.repo, onclick: () => { repo = x.repo; sel = null; openStub = false; draw(); } }, x.repo.split("/")[1])));
    if (!r) { body.replaceChildren(seg, h("p", { class: "cd-status" }, "No repos listed. Add them to " + D.configFile)); return; }
    const chips = h("div", { class: "cd-seg", role: "group", "aria-label": "Filter" }, FILTERS.map(([k, label]) => h("button", { type: "button", "aria-pressed": String(flt === k), "data-flt": k, onclick: () => { flt = k; sel = null; openStub = false; draw(); } }, label, h("small", {}, String(k === "all" ? r.counts.all : r.counts[k])))));
    const input = h("input", { class: "cd-q", type: "search", placeholder: "Search branch or commit", "aria-label": "Search branches and commits", autocomplete: "off", value: q, oninput: (e) => { q = e.target.value; sel = null; drawList(); if (wide) fillSide(); } });
    const list = h("ul", { class: "cd-list" });
    const trunk = h("div", { class: "cd-trunkline" }, h("b", {}, r.def), " (trunk) · last push " + agoShort(r.trunkTipAt, D.now));
    const notes = [D.configError ? h("p", { class: "cd-status err" }, D.configError) : null, r.truncated ? h("p", { class: "cd-status" }, "Showing the first 60 branches.") : null, r.hidden ? h("p", { class: "cd-status" }, r.hidden + (r.hidden === 1 ? " branch hidden" : " branches hidden") + " (names the map does not read).") : null, h("p", { class: "cd-note" }, D.note)].filter(Boolean);
    const top = h("div", { class: "cd-top" }, seg, h("div", { class: "cd-bar" }, chips, input));
    const side = h("aside", { class: "cd-side", "aria-label": "Branch detail" });
    const fillSide = () => { const b = sel && r.ok ? r.branches.find((x) => x.name === sel) : null; side.replaceChildren(...(b ? [h("div", { class: "cd-sidehead" }, h("strong", { class: "cd-name" }, b.name), h("button", { class: "cd-sideclose", type: "button", "aria-label": "Close branch detail", onclick: () => { sel = null; draw(); } }, "×")), detail(b, D.now)] : [h("p", { class: "cd-hint" }, "Pick a branch to see its commits, its pull request and the chats on it.")])); };
    if (wide) { fillSide(); body.replaceChildren(top, h("div", { class: "cd-main" }, h("div", { class: "cd-graph" }, trunk, list, ...notes), side)); }
    else body.replaceChildren(seg, h("div", { class: "cd-bar" }, chips, input), trunk, list, ...notes);
    function drawList() {
      const fk2 = focusKey();
      if (!r.ok) { list.replaceChildren(h("li", { class: "cd-empty" }, r.error || "This repo could not be read.")); return; }
      const { main, fold } = filterBranches(r.branches, flt, q);
      const kids = main.map((b) => row(b, D.now, wide));
      if (fold.length) {
        kids.push(h("li", { class: "cd-item stub" }, h("button", { class: "cd-row cd-stubrow", type: "button", "aria-expanded": String(openStub), "data-stub": "1", onclick: () => { openStub = !openStub; drawList(); } }, h("span", { class: "cd-name" }, stubText(fold)), h("span", { class: "cd-meta" }, openStub ? "tap to fold" : "tap to show"))));
        if (openStub) for (const b of fold) kids.push(row(b, D.now, wide));
      }
      if (!kids.length) kids.push(h("li", { class: "cd-empty" }, q ? "No branch or commit matches “" + q + "”." : flt === "active" ? "No active branches. Everything is merged or stale." : "Nothing here."));
      list.replaceChildren(...kids.filter(Boolean));
      refocus(fk2);
    }
    drawList();
    refocus(fk);
    if (wide) { const g = body.querySelector(".cd-graph"), sd = body.querySelector(".cd-side"); if (g) g.scrollTop = gTop; if (sd && sel) sd.scrollTop = sTop; return; }
    if (card0) { card0.scrollTop = top0; requestAnimationFrame(() => { steady(); card0.scrollTop = top0; }); } else requestAnimationFrame(steady);
  }
  load();
}
