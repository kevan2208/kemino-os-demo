// Kemino OS web app. No framework, no innerHTML (thread titles and messages come from agents: untrusted), no inline script or style (CSP).
const $ = (s, r = document) => r.querySelector(s);
const SVGNS = "http://www.w3.org/2000/svg";

function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "text") el.textContent = v;
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}
/** Replace an element's children; accepts nested arrays and skips null/false, like h(). */
function fill(el, ...kids) { el.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false).map((k) => (k.nodeType ? k : document.createTextNode(String(k))))); }
function svg(w, paths, extra = {}) {
  const s = document.createElementNS(SVGNS, "svg");
  s.setAttribute("viewBox", extra.viewBox || "0 0 16 16"); s.setAttribute("width", w); s.setAttribute("height", w);
  s.setAttribute("aria-hidden", "true"); s.setAttribute("class", extra.class || "");
  for (const [tag, attrs] of paths) {
    const n = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    s.append(n);
  }
  return s;
}
const stroke = { fill: "none", stroke: "currentColor", "stroke-width": "1.8", "stroke-linecap": "round", "stroke-linejoin": "round" };
const ICONS = {
  chev: (w = 14) => svg(w, [["path", { d: "M6 3.5 10.5 8 6 12.5", ...stroke }]]),
  back: (w = 20) => svg(w, [["path", { d: "M10 3 5 8l5 5", ...stroke }]]),
  send: (w = 18) => svg(w, [["path", { d: "M8 13V3M3.5 7.5 8 3l4.5 4.5", ...stroke }]]),
  list: (w = 18) => svg(w, [["path", { d: "M5.5 4.5h8M5.5 8h8M5.5 11.5h8M2.5 4.5h.01M2.5 8h.01M2.5 11.5h.01", ...stroke }]]),
  office: (w = 18) => svg(w, [["rect", { x: "2.5", y: "3", width: "11", height: "8", rx: "1.5", ...stroke }], ["path", { d: "M6 13.5h4M8 11v2.5", ...stroke }]]),
  map: (w = 18) => svg(w, [["circle", { cx: "3.5", cy: "8", r: "1.6", ...stroke }], ["circle", { cx: "12.5", cy: "4", r: "1.6", ...stroke }], ["circle", { cx: "12.5", cy: "12", r: "1.6", ...stroke }], ["path", { d: "M5 7.4 11 4.6M5 8.6l6 2.8", ...stroke }]]),
};
/** One shape per status, so it reads without colour. */
function badge(status, size = 16) {
  const c = { "needs-you": "var(--saf)", working: "var(--run)", stalled: "var(--stall)", failed: "var(--fail)", done: "var(--done)" }[status] || "var(--done)";
  const parts = {
    "needs-you": [["circle", { class: "halo", cx: 8, cy: 8, r: 7, fill: "none", stroke: c, "stroke-width": 1.5 }], ["circle", { cx: 8, cy: 8, r: 4.2, fill: c }]],
    working: [["circle", { cx: 8, cy: 8, r: 6, fill: "none", stroke: c, "stroke-width": 1.8, opacity: 0.25 }], ["path", { class: "arc", d: "M8 2a6 6 0 0 1 6 6", fill: "none", stroke: c, "stroke-width": 1.8, "stroke-linecap": "round" }]],
    stalled: [["circle", { cx: 8, cy: 8, r: 6, fill: "none", stroke: c, "stroke-width": 1.8, "stroke-dasharray": "2.4 2.2" }]],
    failed: [["path", { d: "M8 1.8 14.2 8 8 14.2 1.8 8Z", fill: c }]],
    done: [["circle", { cx: 8, cy: 8, r: 3, fill: c }]],
  }[status] || [];
  const s = svg(size, parts, { class: "bd " + status });
  const t = document.createElementNS(SVGNS, "title"); t.textContent = ({ "needs-you": "Needs you", working: "Working", stalled: "No progress", failed: "Failed", done: "Done" })[status] || status;
  s.setAttribute("role", "img"); s.prepend(t); s.removeAttribute("aria-hidden");
  return s;
}

// ---------- state ----------
const store = (k, v) => { try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || "null"); localStorage.setItem(k, JSON.stringify(v)); } catch { return null; } };
const S = {
  data: null, scope: store("ko.scope") || "day", conn: "connecting", // connecting | live | offline
  openId: null, chat: null, chats: new Map(), drafts: new Map(), sel: null,
  expanded: new Set(store("ko.expanded") || []), later: store("ko.later") || {}, showLater: false,
  confirming: new Map(), sending: new Set(), msgConfirm: null, filter: "", openMore: new Set(),
};
const isDesk = () => matchMedia("(min-width: 900px)").matches;
const canType = () => matchMedia("(hover: hover)").matches;
const live = () => S.conn === "live" && S.data && S.data.connected;

function ago(ts) {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return Math.round(s / 60) + " min";
  if (s < 86400) return Math.round(s / 3600) + " h";
  return Math.round(s / 86400) + " d";
}
const clock = (iso) => { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); };
function modelLabel(m) {
  const r = /^claude-([a-z]+)-(\d+)-(\d+)$/.exec(m || "");
  if (r) return r[1][0].toUpperCase() + r[1].slice(1) + " " + r[2] + "." + r[3];
  return m || "unknown";
}
const INSTANCES = { claudeAgent: "Kemino", claudeAgent_2: "kbb" };
const modelTag = (m) => [modelLabel(m.model), m.effort].filter(Boolean).join(" · ");

function toast(msg, err = false) {
  const t = $("#toast"); t.textContent = msg; t.className = "on" + (err ? " err" : "");
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.className = ""), err ? 4200 : 2200);
}

// ---------- data ----------
let es = null;
function connectState() {
  es?.close();
  const cached = store("ko.state." + S.scope);
  if (cached && !S.data) { S.data = { ...cached, connected: false, stale: true }; renderAll(); }
  es = new EventSource("/api/events?scope=" + S.scope);
  es.addEventListener("state", (e) => {
    S.data = JSON.parse(e.data); S.conn = "live";
    store("ko.state." + S.scope, S.data);
    renderAll();
  });
  es.onerror = () => { S.conn = "offline"; renderTop(); renderList(); renderDock(); };
  es.onopen = () => { S.conn = "live"; renderTop(); };
}

let tes = null;
function connectChat(id) {
  tes?.close(); tes = null;
  if (!id) return;
  tes = new EventSource("/api/thread/events?id=" + encodeURIComponent(id));
  tes.addEventListener("chat", (e) => {
    const c = JSON.parse(e.data);
    S.chats.set(c.head.id, c);
    saveChat(c);
    if (S.openId === c.head.id) { S.chat = c; renderChat(); }
  });
}
function saveChat(c) {
  const idx = store("ko.chatidx") || [];
  const next = [c.head.id, ...idx.filter((x) => x !== c.head.id)].slice(0, 8);
  for (const gone of idx.filter((x) => !next.includes(x))) { try { localStorage.removeItem("ko.chat." + gone); } catch { /* ignore */ } }
  store("ko.chatidx", next); store("ko.chat." + c.head.id, c);
}
function prefetchChat(id) {
  if (S.chats.has(id) || navigator.connection?.saveData) return;
  fetch("/api/thread?id=" + encodeURIComponent(id)).then((r) => (r.ok ? r.json() : null)).then((c) => { if (c) { S.chats.set(id, c); saveChat(c); } }).catch(() => {});
}

async function post(path, body, e) {
  if (!e || !e.isTrusted) throw new Error("Writes need a real click or key press.");
  const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json", "x-kemino": "1" }, body: JSON.stringify({ ...body, gesture: true }) });
  const j = await r.json().catch(() => ({}));
  if (r.status === 409 && j.needsConfirm) { const err = new Error("confirm"); err.needsConfirm = true; err.kinds = j.kinds; throw err; }
  if (!r.ok) throw new Error(j.error || "failed (" + r.status + ")");
  return j;
}

// ---------- later (snooze) ----------
const laterActive = (id) => (S.later[id] || 0) > Date.now();
function setLater(id, on) { if (on) S.later[id] = Date.now() + 2 * 3600_000; else delete S.later[id]; store("ko.later", S.later); renderList(); }

// ---------- actions ----------
async function answer(need, decision, e, confirm = false) {
  if (!live() || !need.requestId || S.sending.has(need.id)) return;
  if (decision !== "decline" && need.risky && !confirm) { S.confirming.set(need.id, need.riskKinds); renderAll(); return; }
  S.sending.add(need.id); renderAll();
  try {
    await post("/api/respond", { threadId: need.id, requestId: need.requestId, decision, confirm }, e);
    S.confirming.delete(need.id);
    toast(decision === "decline" ? "Sent: no" : "Sent: yes");
  } catch (err) {
    if (err.needsConfirm) S.confirming.set(need.id, err.kinds);
    else toast(err.message, true);
  } finally { S.sending.delete(need.id); renderAll(); }
}
async function sendText(text, e, confirm = false) {
  const id = S.openId, clean = text.trim();
  if (!id || !clean || !live()) return false;
  try {
    const r = await post("/api/send", { threadId: id, text: clean, confirm }, e);
    S.msgConfirm = null; S.drafts.delete(id);
    toast(r.queued ? "Queued: it will run after the current step" : "Sent");
    return true;
  } catch (err) {
    if (err.needsConfirm) { S.msgConfirm = { text: clean, kinds: err.kinds }; renderDock(); }
    else toast(err.message, true);
    return false;
  }
}
async function changeModel(sel, e) {
  const head = S.chat?.head; if (!head) return;
  const model = $("#sel-model").value, effort = $("#sel-effort").value || null;
  try { await post("/api/model", { threadId: head.id, instanceId: head.model.instanceId, model, effort }, e); toast("Model: " + modelLabel(model) + (effort ? " · " + effort : "")); }
  catch (err) { toast(err.message, true); }
}

// ---------- layout ----------
function buildShell() {
  const app = $("#app");
  fill(app, 
    h("header", { class: "top", id: "top" }),
    h("div", { class: "shell" },
      h("section", { class: "pane pane-list", "aria-label": "Today" },
        h("div", { class: "scroll", id: "list-scroll" }, h("div", { class: "list-in", id: "list" }))),
      h("section", { class: "pane pane-chat", "aria-label": "Chat" },
        h("div", { id: "chat-head", class: "chat-head" }),
        h("div", { class: "scroll", id: "chat-scroll" }, h("div", { class: "msgs", id: "msgs" })),
        h("div", { class: "dock", id: "dock" }))),
    h("div", { class: "capw phone-only", id: "capw" }),
  );
  buildCapsule();
  buildComposer();
}

function renderTop() {
  const live_ = live();
  const label = S.conn === "offline" || !S.data ? (S.data?.stale ? "Offline · last data" : S.conn === "connecting" ? "Connecting" : "Offline")
    : !S.data.connected ? "T3 offline · " + (S.data.lastSeen ? "last seen " + ago(S.data.lastSeen) : "not seen") : "Live";
  const pill = h("span", { class: "pill " + (live_ ? "live" : S.conn === "connecting" ? "" : "off"), role: "status" }, h("i"), label);
  const scope = h("div", { class: "sg desk-only", role: "group", "aria-label": "Scope" },
    h("button", { "aria-pressed": S.scope === "day", onclick: () => setScope("day") }, "Last 24 h"),
    h("button", { "aria-pressed": S.scope === "all", onclick: () => setScope("all") }, "All history"));
  const views = h("div", { class: "sg desk-only", role: "group", "aria-label": "View" },
    h("button", { "aria-pressed": "true" }, "List + chat"),
    h("button", { disabled: true, title: "Office: a later day" }, "Office", h("small", {}, "soon")),
    h("button", { disabled: true, title: "Map: a later day" }, "Map", h("small", {}, "soon")));
  fill($("#top"), h("span", { class: "brand" }, "Kemino OS"), views, h("span", { class: "grow" }), h("span", { class: "keys desk-only" },
    h("span", {}, h("kbd", {}, "J"), h("kbd", {}, "K"), "move"), h("span", {}, h("kbd", {}, "Y"), h("kbd", {}, "N"), "answer"), h("span", {}, h("kbd", {}, "L"), "later")), scope, pill);
}
function setScope(s) { if (S.scope === s) return; S.scope = s; store("ko.scope", s); S.data = null; connectState(); renderAll(); }

let capInput;
function buildCapsule() {
  capInput = h("input", { type: "search", placeholder: "Filter threads", "aria-label": "Filter threads", enterkeyhint: "search", autocomplete: "off", oninput: (e) => { S.filter = e.target.value.toLowerCase(); renderList(); } });
  fill($("#capw"), h("div", { class: "capsule" }, capInput, h("div", { class: "vs", role: "group", "aria-label": "View" },
    h("button", { "aria-pressed": "true", "aria-label": "List" }, ICONS.list()),
    h("button", { disabled: true, "aria-label": "Office (soon)", title: "Office: a later day" }, ICONS.office()),
    h("button", { disabled: true, "aria-label": "Map (soon)", title: "Map: a later day" }, ICONS.map()))));
}

// ---------- Today ----------
const matches = (...s) => !S.filter || s.some((x) => String(x || "").toLowerCase().includes(S.filter));

function needCard(n, selected) {
  const sending = S.sending.has(n.id), conf = S.confirming.get(n.id);
  const q = n.kind === "question";
  const canAct = live() && n.requestId && !n.held;
  const open = () => openThread(n.id);
  const card = h("div", { class: "need" + (selected ? " sel" : "") + (n.held ? " held" : ""), "data-id": n.id, role: "group", "aria-label": n.title },
    h("h3", {}, badge("needs-you"), h("span", { class: "grow" }, n.title), h("span", { class: "age" }, ago(n.since))),
    n.chain.length > 1 ? h("div", { class: "ch" }, n.chain.map((c) => c.title).join("  ›  ")) : h("div", { class: "ch" }, n.project + (q ? " · asks a question" : " · wants permission")),
    n.detail ? h("div", { class: "cmd" }, n.detail.slice(0, 700)) : null,
    n.risky ? h("div", { class: "risk" }, "Risky: " + n.riskKinds.join(", ")) : null,
    n.held ? h("p", { class: "hint" }, "Answered. Waiting for the agent to move on.") : conf ? h("div", { class: "confirm" }, h("p", {}, "This will " + conf.join(" and ") + ". Run it?"),
      h("div", { class: "acts" }, h("button", { class: "b danger y", disabled: sending, onclick: (e) => { e.stopPropagation(); answer(n, "accept", e, true); } }, "Yes, run it"),
        h("button", { class: "b", onclick: (e) => { e.stopPropagation(); S.confirming.delete(n.id); renderList(); } }, "Cancel")))
      : h("div", { class: "acts" },
        q ? h("button", { class: "b y", onclick: (e) => { e.stopPropagation(); open(); } }, "Open chat")
          : h("button", { class: "b y", disabled: !canAct || sending, onclick: (e) => { e.stopPropagation(); answer(n, "accept", e); } }, sending ? "Sending" : n.risky ? "Review" : "Yes", h("kbd", {}, "Y")),
        q ? null : h("button", { class: "b", disabled: !canAct || sending, onclick: (e) => { e.stopPropagation(); answer(n, "decline", e); } }, "No", h("kbd", {}, "N")),
        h("button", { class: "b m", onclick: (e) => { e.stopPropagation(); setLater(n.id, true); } }, "Later", h("kbd", {}, "L"))),
  );
  card.addEventListener("click", open);
  card.addEventListener("pointerdown", () => prefetchChat(n.id));
  return card;
}

function helperRows(g) {
  const kids = g.helpers;
  const shown = kids.slice(0, 12);
  return h("div", { class: "kids" }, shown.map((k) => h("button", { class: "kid" + (k.status === "needs-you" ? " hot" : ""), onclick: () => openThread(k.id), onpointerdown: () => prefetchChat(k.id) },
    k.depth > 1 ? h("span", { class: "t" }, "›".repeat(k.depth - 1)) : null, badge(k.status, 14), h("span", { class: "nm" }, k.title), h("span", { class: "t" }, ago(k.activityAt)))),
    kids.length > shown.length ? h("div", { class: "more" }, "+" + (kids.length - shown.length) + " more helpers") : null);
}

function groupRow(g, selected) {
  const n = g.helpers.length, open = S.expanded.has(g.id);
  const bits = [g.project, modelTag(g.model)];
  if (n) bits.push(n + (n === 1 ? " helper" : " helpers") + helperSummary(g));
  if (g.status === "stalled" || (g.status === "failed" && g.reason)) bits.push(g.reason);
  const row = h("div", { class: "row" + (selected ? " sel" : ""), "data-id": g.id, role: "button", tabindex: "0", onclick: () => openThread(g.id), onpointerdown: () => prefetchChat(g.id),
    onkeydown: (e) => { if (e.key === "Enter" && e.target === row) openThread(g.id); } },
    badge(g.status),
    h("div", { class: "mid" }, h("b", {}, g.title), h("small", {}, bits.filter(Boolean).join(" · "))),
    h("span", { class: "t" }, ago(g.activityAt)),
    n ? h("button", { class: "fold", "aria-expanded": open, "aria-label": (open ? "Hide" : "Show") + " helpers of " + g.title, onclick: (e) => { e.stopPropagation(); toggleFold(g.id); } }, ICONS.chev()) : null);
  return h("div", {}, row, n && open ? helperRows(g) : null);
}
const helperSummary = (g) => { const c = g.counts, bits = []; if (c.working) bits.push(c.working + " working"); if (c.stalled) bits.push(c.stalled + " stalled"); if (c["needs-you"]) bits.push(c["needs-you"] + " ask"); if (c.failed) bits.push(c.failed + " failed"); return bits.length ? " (" + bits.join(", ") + ")" : ""; };
function toggleFold(id) { S.expanded.has(id) ? S.expanded.delete(id) : S.expanded.add(id); store("ko.expanded", [...S.expanded].slice(-60)); renderList(); }

function flatIds() {
  const d = S.data; if (!d) return [];
  return [...visibleNeeds().map((n) => n.id), ...d.working.filter((g) => matches(g.title, g.project)).map((g) => g.id), ...d.done.filter((g) => matches(g.title, g.project)).map((g) => g.id)];
}
const visibleNeeds = () => (S.data?.needs || []).filter((n) => !laterActive(n.id) && matches(n.title, n.rootTitle, n.detail));

function renderList() {
  const el = $("#list"), d = S.data;
  if (!d) { fill(el, h("div", { class: "title" }, h("h1", {}, "Today")), h("div", { class: "skel" }), h("div", { class: "skel" }), h("div", { class: "skel" })); return; }
  const needs = visibleNeeds(), snoozed = d.needs.filter((n) => laterActive(n.id));
  const working = d.working.filter((g) => matches(g.title, g.project)), done = d.done.filter((g) => matches(g.title, g.project));
  const nWork = d.working.filter((g) => g.status === "working" || g.status === "stalled").length;
  const sub = [needs.length ? needs.length + " need you" : "Nothing needs you", nWork ? nWork + " working" : null, d.stale ? "showing last saved data" : null].filter(Boolean).join(" · ");
  const sel = S.sel;
  fill(el, 
    h("div", { class: "title" }, h("h1", {}, d.scope === "all" ? "All history" : "Today")),
    h("p", { class: "sub" }, sub),
    h("div", { class: "sec hot" }, "Needs you", h("span", { class: "n" }, needs.length || ""),
      snoozed.length ? h("button", { onclick: () => { S.showLater = !S.showLater; renderList(); } }, (S.showLater ? "Hide" : "Later") + " (" + snoozed.length + ")") : null),
    needs.length ? needs.map((n) => needCard(n, sel === n.id)) : h("div", { class: "clear" }, h("b", {}, "You're clear"), "Agents will show up here when they need a yes or an answer."),
    S.showLater ? snoozed.map((n) => h("div", { class: "row", "data-id": n.id }, badge("needs-you"), h("div", { class: "mid" }, h("b", {}, n.title), h("small", {}, "Later until " + clock(S.later[n.id]))), h("button", { class: "b m", onclick: () => setLater(n.id, false) }, "Bring back"))) : null,
    h("div", { class: "sec" }, "Working", h("span", { class: "n" }, working.length || "")),
    working.length ? working.map((g) => groupRow(g, sel === g.id)) : h("div", { class: "more" }, "No agents running right now."),
    h("div", { class: "sec" }, d.scope === "all" ? "Finished" : "Done today", h("span", { class: "n" }, done.length || "")),
    done.length ? done.map((g) => groupRow(g, sel === g.id)) : h("div", { class: "more" }, "Nothing finished in this window."),
    h("div", { class: "foot" }, d.hiddenRoots ? d.hiddenRoots + " older or background threads hidden." : "Everything in this window is shown.",
      d.scope === "day" ? h("button", { onclick: () => setScope("all") }, "Show all history") : h("button", { onclick: () => setScope("day") }, "Back to last 24 h")),
  );
}

// ---------- chat ----------
function renderText(text) {
  const frag = document.createDocumentFragment();
  text.split(/```[\w-]*\n?([\s\S]*?)```/g).forEach((part, i) => {
    if (i % 2) { frag.append(h("pre", {}, part.replace(/\n$/, ""))); return; }
    part.split(/`([^`\n]+)`/g).forEach((p, j) => frag.append(j % 2 ? h("code", {}, p) : document.createTextNode(p)));
  });
  return frag;
}
function msgNode(m) {
  const long = m.text.length > 1500, open = S.openMore.has(m.id);
  const body = h("div", { class: "txt" + (long && !open ? " clamp" : "") }, renderText(m.text));
  return h("div", { class: "m " + m.role }, body,
    long ? h("button", { class: "moreb", onclick: () => { open ? S.openMore.delete(m.id) : S.openMore.add(m.id); renderChat(true); } }, open ? "Show less" : "Show more") : null,
    h("span", { class: "at" }, clock(m.at)));
}
function toolsNode(group) {
  const last = group[group.length - 1];
  return h("details", { class: "tools" },
    h("summary", {}, ICONS.chev(12), h("span", {}, group.length === 1 ? (last.tool === "file" ? "Edited files" : "Ran: " + last.text.split("\n")[0]) : "Ran " + group.length + " steps · latest: " + last.text.split("\n")[0])),
    h("ol", {}, group.map((t) => h("li", {}, t.text || (t.tool === "file" ? "edited files" : "step")))));
}

function chatHeadInfo() {
  const c = S.chat, id = S.openId;
  if (c?.head) return c.head;
  const d = S.data; if (!d || !id) return null;
  const hit = [...d.working, ...d.done].flatMap((g) => [g, ...g.helpers]).find((t) => t.id === id);
  return hit ? { id, title: hit.title, status: hit.status, reason: hit.reason, project: hit.project, branch: hit.branch, model: hit.model, chain: [{ id, title: hit.title }] } : { id, title: "Thread", status: "done", chain: [], model: { instanceId: "", model: "", effort: null } };
}

let headSig = "";
function renderChatHead() {
  const head = $("#chat-head"), t = S.openId && chatHeadInfo();
  const sig = JSON.stringify([t, live(), !!S.chat, S.data?.models]);
  if (sig === headSig) return; // do not rebuild the pickers while one is open
  headSig = sig;
  if (!t) { fill(head, h("div", { class: "hrow" }, h("h2", {}, "Chat"))); return; }
  const models = S.data?.models, opts = (models?.byInstance?.[t.model.instanceId] || []).slice();
  if (t.model.model && !opts.includes(t.model.model)) opts.unshift(t.model.model);
  const efforts = (models?.efforts || ["low", "medium", "high"]).slice();
  if (t.model.effort && !efforts.includes(t.model.effort)) efforts.push(t.model.effort);
  const dis = !live() || !S.chat;
  const sm = h("select", { id: "sel-model", "aria-label": "Model", disabled: dis, onchange: (e) => changeModel(null, e) }, opts.map((m) => h("option", { value: m, selected: m === t.model.model }, modelLabel(m))));
  const se = h("select", { id: "sel-effort", "aria-label": "Effort", disabled: dis, onchange: (e) => changeModel(null, e) },
    h("option", { value: "", selected: !t.model.effort }, "default effort"), efforts.map((x) => h("option", { value: x, selected: x === t.model.effort }, x)));
  fill(head, 
    h("div", { class: "hrow" }, h("button", { class: "back", "aria-label": "Back to Today", onclick: () => { location.hash = "#/"; } }, ICONS.back()), badge(t.status, 18), h("h2", {}, t.title)),
    t.chain.length > 1 ? h("div", { class: "chain" }, t.chain.map((c) => h("u", {}, c.title))) : null,
    h("div", { class: "ctl" }, h("span", { class: "sel-wrap" }, sm), h("span", { class: "sel-wrap" }, se),
      INSTANCES[t.model.instanceId] ? h("span", { class: "chip" }, INSTANCES[t.model.instanceId]) : null,
      t.branch ? h("span", { class: "chip", title: t.branch }, t.branch) : null,
      t.reason && t.status !== "needs-you" ? h("span", { class: "chip" }, t.reason) : null));
}

function renderChat(keepScroll) {
  renderChatHead();
  const box = $("#chat-scroll"), msgs = $("#msgs");
  if (!S.openId) { fill(msgs, h("div", { class: "empty-chat" }, h("b", {}, "Pick a thread"), "Open any agent on the left to read it and reply here.")); renderDock(); return; }
  const near = box.scrollHeight - box.scrollTop - box.clientHeight < 140;
  const c = S.chat;
  if (!c) { fill(msgs, h("div", { class: "skel" }), h("div", { class: "skel" }), h("div", { class: "skel" })); renderDock(); return; }
  const nodes = []; let group = [];
  const flush = () => { if (group.length) { nodes.push(toolsNode(group)); group = []; } };
  if (c.total > c.items.length) nodes.push(h("div", { class: "more" }, "Showing the latest " + c.items.length + " of " + c.total + " items."));
  for (const it of c.items) { if (it.role === "tool") group.push(it); else { flush(); nodes.push(msgNode(it)); } }
  flush();
  if (c.running) nodes.push(h("div", { class: "typing" }, badge("working", 14), "Working…"));
  if (!c.items.length) nodes.push(h("div", { class: "more" }, "No messages yet."));
  fill(msgs, nodes);
  if (!keepScroll && (near || S.justOpened)) box.scrollTop = box.scrollHeight;
  S.justOpened = false;
  renderDock();
}

let ta, sendBtn;
function buildComposer() {
  ta = h("textarea", { id: "ta", rows: "1", placeholder: "Message this thread", "aria-label": "Message", enterkeyhint: "send",
    oninput: () => { grow(); if (S.openId) S.drafts.set(S.openId, ta.value); syncSend(); },
    onkeydown: (e) => { if (e.key === "Enter" && !e.shiftKey && canType() && !e.isComposing) { e.preventDefault(); submit(e); } } });
  sendBtn = h("button", { class: "send", "aria-label": "Send", onclick: (e) => submit(e) }, ICONS.send());
}
function grow() { ta.style.height = "42px"; if (ta.value) ta.style.height = Math.min(Math.max(ta.scrollHeight, 42), 160) + "px"; }
function syncSend() { sendBtn.disabled = !live() || !ta.value.trim() || !S.openId; ta.disabled = !live(); ta.placeholder = live() ? "Message this thread" : "T3 is offline"; }
async function submit(e) { if (sendBtn.disabled) return; const ok = await sendText(ta.value, e); if (ok) { ta.value = ""; grow(); syncSend(); } }

let dockSig = "";
function renderDock() {
  const dock = $("#dock");
  const pend = S.chat?.pending, need = pend && S.data?.needs.find((n) => n.requestId === pend.requestId);
  // Rebuild only when something visible changed, so a state push never steals focus from the text box.
  const sig = JSON.stringify([S.openId, pend, need?.detail, live(), [...S.sending], [...S.confirming], S.msgConfirm]);
  if (sig === dockSig) { syncSend(); return; }
  dockSig = sig;
  if (!S.openId) { fill(dock, ); return; }
  const nodes = [];
  if (pend && pend.kind === "question") {
    nodes.push(h("div", { class: "need" }, h("h3", {}, badge("needs-you"), h("span", { class: "grow" }, "This thread asks a question")),
      pend.detail ? h("div", { class: "cmd" }, pend.detail.slice(0, 700)) : null,
      h("p", { class: "hint" }, "Answering structured questions is not built yet. Reply in T3, or send a message below.")));
  }
  if (pend && pend.kind === "permission") {
    const n = need || { id: S.openId, requestId: pend.requestId, risky: pend.risky, riskKinds: pend.riskKinds, detail: pend.detail, kind: pend.kind, title: S.chat.head.title, chain: S.chat.head.chain, rootId: "", project: S.chat.head.project, since: Date.parse(pend.createdAt), held: false };
    nodes.push(needCard({ ...n, detail: pend.detail ?? n.detail, id: S.openId }, false));
  }
  if (S.msgConfirm) nodes.push(h("div", { class: "confirm" }, h("p", {}, "This message mentions " + S.msgConfirm.kinds.join(" and ") + ". Send it?"),
    h("div", { class: "acts" }, h("button", { class: "b danger y", onclick: async (e) => { const ok = await sendText(S.msgConfirm.text, e, true); if (ok) { ta.value = ""; grow(); syncSend(); } } }, "Yes, send"),
      h("button", { class: "b", onclick: () => { S.msgConfirm = null; renderDock(); } }, "Edit"))));
  nodes.push(h("div", { class: "quick" }, ["Go", "Yes", "Continue"].map((q) => h("button", { disabled: !live(), onclick: (e) => sendText(q, e) }, q))));
  nodes.push(h("div", { class: "composer" }, ta, sendBtn));
  fill(dock, h("div", { class: "dock-in" }, nodes));
  syncSend();
}

// ---------- routing, selection ----------
function openThread(id) { location.hash = "#/t/" + encodeURIComponent(id); }
function route() {
  const m = /^#\/t\/(.+)$/.exec(location.hash);
  const id = m ? decodeURIComponent(m[1]) : null;
  const changed = id !== S.openId;
  if (S.openId) S.drafts.set(S.openId, ta.value);
  S.openId = id; S.sel = id || S.sel;
  $("#app").dataset.view = id ? "chat" : "today";
  if (changed) {
    S.msgConfirm = null; S.justOpened = true;
    S.chat = id ? S.chats.get(id) || store("ko.chat." + id) || null : null;
    if (S.chat) S.chats.set(id, S.chat);
    connectChat(id);
    ta.value = (id && S.drafts.get(id)) || ""; grow();
  }
  renderChat();
  renderList();
  document.title = id && S.chat ? S.chat.head.title + " · Kemino OS" : "Kemino OS";
}

function renderAll() { renderTop(); renderList(); renderChatHead(); renderDock(); }

function moveSel(dir) {
  const ids = flatIds(); if (!ids.length) return;
  const i = ids.indexOf(S.sel);
  const next = ids[Math.min(ids.length - 1, Math.max(0, i < 0 ? 0 : i + dir))];
  S.sel = next;
  if (isDesk()) openThread(next); else { renderList(); }
  $(`[data-id="${CSS.escape(next)}"]`)?.scrollIntoView({ block: "nearest" });
}
function selectedNeed() { const id = S.openId || S.sel; return S.data?.needs.find((n) => n.id === id && !laterActive(n.id)); }

addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
  if (e.key === "Escape") { if (typing) document.activeElement.blur(); else if (S.openId && !isDesk()) location.hash = "#/"; return; }
  if (typing) return;
  const k = e.key.toLowerCase();
  if (k === "j") moveSel(1);
  else if (k === "k") moveSel(-1);
  else if (k === "y" || k === "n") { const n = selectedNeed(); if (n && n.kind === "permission") { e.preventDefault(); answer(n, k === "y" ? "accept" : "decline", e); } }
  else if (k === "l") { const n = selectedNeed(); if (n) setLater(n.id, true); }
  else if (k === "/") { e.preventDefault(); (isDesk() ? ta : capInput)?.focus(); }
  else if (e.key === "Enter" && S.sel && !S.openId) openThread(S.sel);
});
addEventListener("hashchange", route);
setInterval(() => { if (!document.hidden) { renderTop(); renderList(); } }, 30_000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) renderAll(); });
matchMedia("(min-width: 900px)").addEventListener("change", () => renderAll());

buildShell();
renderTop();
renderList();
route();
connectState();
