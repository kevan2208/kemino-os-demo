// Kemino OS web app. No framework, no innerHTML (thread titles and messages come from agents: untrusted), no inline script or style (CSP).
import { renderMarkdown } from "./md.js";
import { renderCard, reconcile } from "./renders.js";
import { officeModel, renderOfficeLayout, askList, stepAsk, scrollToWorker } from "./office.js";
import { initRefresh } from "./refresh.js";
import { openSheet, closeSheet, sheetOpenId, refreshSheet } from "./sheet.js";
import { mapModel, mapBlock, readDir, writeDir } from "./map.js";
import { openNotifyPanel } from "./notify.js";
import { openAutomations } from "./automations.js";
import { openInsights } from "./insights.js";
import { skillsTab } from "./skills.js";
import { appsTab } from "./apps.js";
import { leadTab } from "./leadfiles.js";
import { openQueue } from "./queue.js";
import { openNewThread } from "./newthread.js";
import { createSlash } from "./slash.js";
import { openProviders } from "./providers.js";
import { usageTab } from "./usage.js";
import { tidyTab } from "./tidy.js";
import { openDecisions } from "./decisions.js";
import { keyAction, SHORTCUTS } from "./keys.js";
import { escapeTarget } from "./layers.js";
import { openTour } from "./tour.js";
import { applyFocus, projectsOf } from "./focus.js";
import { bannerNodes } from "./banners.js";
import { openSnoozeSheet, pendingUntil } from "./snooze.js";
import { FEATURES, isMain, menuGroups, openFeatures } from "./features.js";
import { openGoogle, resultText } from "./google.js";
import { openLife, lifeSummary } from "./life.js";
import { openCode } from "./code.js";
import { watchFullpages } from "./fullpage.js";
import { heardLine, ledgerTab } from "./ledgerline.js";
import { plainCause } from "./cause.js";
import { contextBadge, contextHead } from "./context.js";
import { briefLine, openBriefSheet, summaryText } from "./briefsheet.js";
import { openStopToday } from "./stoptoday.js";
import { step as fdStep, cardModel as fdCardModel, frontDeskCard, PICKED_MS, msgStatus, unsentAdd, unsentResult, unsentFail, unsentRetry, unsentRemove, unsentReconcile, unsentView, unsentLoad, unsentSave } from "./frontdesk.js";
import { hoursRow } from "./hours.js";
import { isRelayed, relayedNode } from "./relayed.js";
import { layoutTurns, lastReplyIds, workSummary, jumpVisible, workingText, runStart, quickReplies, dockRow } from "./chatparts.js";
import { questionBar, permissionBar, secretBar, newDraft, draftSig, readable, summary } from "./questions.js";
import { attachSheetDrag } from "./sheetdrag.js";
import { isSunday } from "./weekly.js";
import { voiceButton } from "./voice.js";
import { viewportState, atBottom, stickDecision, REMEASURE_MS, buildBar, searchButton, renderChip, openSearch, dotOf, barSig } from "./tabbar.js";
import { createBuddies, aiOf } from "./buddies.js";
import { writingToNode, writingToModel } from "./writingto.js";
import { hotCard } from "./hot.js";
import { tidyLine } from "./tidyline.js";
import { readCollapsed, writeCollapsed, paceLine, chipIds, inspectorModel, tabCounts, desktopTopBar, collapsedRail, inspectorNode } from "./rail.js";
import { createDesk } from "./desk.js";
import { claudeOut } from "./desk-core.js";
import { createAllThreads } from "./allthreads.js";
import { setLabelsFrom, titleNode as tn, titleText as tt } from "./labels.js";
import { queueItems, splitQueue, stepNews, newsStart, freshLine, failGroupTitle, retryUntil } from "./onecard.js";
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
  clip: (w = 18) => svg(w, [["path", { d: "M12.5 7.5 8 12a2.8 2.8 0 0 1-4-4l5-5a1.9 1.9 0 0 1 2.7 2.7L6.8 10.6a.9.9 0 0 1-1.3-1.3L10 4.8", ...stroke }]]),
  copy: (w = 14) => svg(w, [["rect", { x: "5.5", y: "5.5", width: "8", height: "8", rx: "2", ...stroke }], ["path", { d: "M10.5 5.5V4a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5", ...stroke }]]),
  chat: (w = 15) => svg(w, [["path", { d: "M2.5 3.5h11v8h-6l-3.5 2.5v-2.5h-1.5z", ...stroke }]]),
  info: (w = 20) => svg(w, [["circle", { cx: "8", cy: "8", r: "6", ...stroke }], ["path", { d: "M8 7.5v3.5M8 5.2v.01", ...stroke }]]),
  spark: (w = 16) => svg(w, [["path", { d: "M8 1.8 9.6 6.4 14.2 8 9.6 9.6 8 14.2 6.4 9.6 1.8 8 6.4 6.4z", fill: "currentColor", stroke: "none" }]]),
  down: (w = 20) => svg(w, [["path", { d: "M4 6.2 8 10.2l4-4", ...stroke }]]),
  plus: (w = 20) => svg(w, [["path", { d: "M8 3v10M3 8h10", ...stroke }]]),
  panel: (w = 20) => svg(w, [["rect", { x: "2", y: "3", width: "12", height: "10", rx: "2", ...stroke }], ["path", { d: "M10 3v10", ...stroke }]]),
  dots: (w = 18) => svg(w, [["path", { d: "M3.5 8h.01M8 8h.01M12.5 8h.01", ...stroke, "stroke-width": "2.6" }]]),
  bell: (w = 16) => svg(w, [["path", { d: "M4 11.5V7a4 4 0 0 1 8 0v4.5l1 1H3zM6.5 14a1.5 1.5 0 0 0 3 0", ...stroke }]]),
  x: (w = 12) => svg(w, [["path", { d: "m4 4 8 8M12 4l-8 8", ...stroke }]]),
  office: (w = 18) => svg(w, [["rect", { x: "2.5", y: "3", width: "11", height: "8", rx: "1.5", ...stroke }], ["path", { d: "M6 13.5h4M8 11v2.5", ...stroke }]]),
  all: (w = 18) => svg(w, [["path", { d: "M2.5 4.5h11M2.5 8h11M2.5 11.5h11", ...stroke }], ["path", { d: "M5 2.5v11", ...stroke, "stroke-width": "1.2" }]]),
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
  mode: ["office", "map", "all"].includes(store("ko.mode")) ? store("ko.mode") : "list", // left pane: Today list, all threads, the pixel office or the map
  mapToggled: new Set(store("ko.map") || []), // map nodes opened or closed against their default
  expanded: new Set(store("ko.expanded") || []), doneOpen: store("ko.doneopen") === true, doneKids: new Set(), later: store("ko.later") || {}, showLater: false,
  flags: null, ledger: null, unconfirmed: [], unsent: (() => { try { return unsentLoad(localStorage); } catch { return {}; } })(), hoursOpen: false, // feature freeze (from /api/flags), the cost ledger line, writes T3 did not show back
  brief: {}, sheetKind: null, week: null, usage: null, health: null, stop: null, hours: null, pics: new Map(), // threadId -> pictures waiting to be sent
  confirming: new Map(), remembering: new Set(), sending: new Set(), chosen: new Map(), msgConfirm: null, filter: "", openMore: new Set(), tapAt: new Set(), openTools: new Set(), lastReplies: null, infoOpen: false, runTick: 0, // chat redesign: replies tapped open, tool rows left open, last reply of each turn, the info sheet, the Working pill timer
  focus: store("ko.focus") || "", // Focus mode: one project only
  spot: null, spotSeen: new Set(), // office: the asking worker that is zoomed and highlighted; who was already asking when we last drew
  stopAsk: false, stopping: false, newAsk: null, // quick actions in the thread chat
  fd: new Map(), fdAsk: false, fdSending: false, fdHide: new Set(), fdSig: "", // front desk card: per-thread record, the one-confirm step, "Keep waiting" (by queued message id)
  rail: readCollapsed(), insp: false, // desktop: the left strip is collapsed (per device); the chat Inspector is open (never remembered: closed by default)
  answered: new Set(), dismissed: store("ko.dismissed") || {}, openFailGroups: new Set(), news: newsStart(), showAll: store("ko.showall") === true, // one question at a time: answered request ids, failures marked seen, held news, the Mac's "Show all"
};
const isDesk = () => matchMedia("(min-width: 900px)").matches;
const canType = () => matchMedia("(hover: hover)").matches;
const live = () => S.conn === "live" && S.data && S.data.connected;
/** The Today data the list, office and counts draw: all of it, or only the focused project. */
let fdCache = { src: null, focus: "", out: null };
function fd() {
  if (fdCache.src !== S.data || fdCache.focus !== S.focus) fdCache = { src: S.data, focus: S.focus, out: applyFocus(S.data, S.focus) };
  return fdCache.out;
}
function setFocus(name) {
  S.focus = name || ""; store("ko.focus", S.focus);
  officeSig = "";
  renderTop(); renderList();
}

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
/** "Kemino · Opus 5.5" (account first). Unknown instance: today's text. */
const whoTag = (m) => { const a = aiOf(m); return a ? [a.name, modelTag(m)].join(" · ") : modelTag(m); };
/** The AI's static idle face (small), or nothing for an unknown instance. */
const aiFace = (m, cls = "") => { const a = aiOf(m), px = cls.includes("sm") ? 28 : 36; return a ? h("img", { class: "ai-face " + cls, src: a.idleUrl, alt: "", width: px, height: px, "aria-hidden": "true" }) : null; };

function toast(msg, err = false) {
  const t = $("#toast"); t.textContent = msg ?? ""; t.className = "on" + (err ? " err" : "");
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.className = ""), err ? 4200 : 2200);
}

/** After a plain yes to something a rule may cover: a bar in plain words with one tap to remember it. Nothing is saved until "Remember" is tapped. */
function showOffer(need, offer) {
  document.querySelector(".offer")?.remove();
  clearTimeout(showOffer.t);
  const bar = h("div", { class: "offer", role: "status" },
    h("span", { class: "offer-say" }, offer.say),
    h("button", { class: "b y offer-yes", onclick: async (e) => {
      e.stopPropagation();
      try { const r = await post("/api/rules/remember", { threadId: need.id, requestId: offer.requestId }, e); toast(r.remembered ? "Remembered. Remove it any time under Decisions." : "Not remembered: " + (r.rememberWhy || "not allowed"), !r.remembered); }
      catch (err) { toast(err.message, true); }
      bar.remove();
    } }, "Remember"),
    h("button", { class: "b m offer-no", "aria-label": "No thanks", onclick: () => bar.remove() }, "No thanks"));
  // The chat pane is display:none while Today is showing (phone): then the bar sits in-flow under the Today list, above the tab bar.
  const chatSlot = $("#offer-slot"), slot = chatSlot && chatSlot.closest(".pane-chat")?.offsetParent !== null ? chatSlot : $("#offer-slot-today") || chatSlot || document.body;
  slot.append(bar);
  showOffer.t = setTimeout(() => bar.remove(), 15000);
}

// "2026-11-07T14:29+00:00" -> "Sat 18:29" in the phone's own time; unparseable text passes through.
function untilText(v) {
  const d = new Date(v);
  if (isNaN(d)) return String(v);
  return d.toLocaleDateString([], { weekday: "short" }) + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** "18:29" (today) or "Sat 18:29" (another day), in the phone's local time. */
function untilClock(v) {
  const d = new Date(v);
  if (isNaN(d)) return String(v);
  const t = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  return d.toDateString() === new Date().toDateString() ? t : d.toLocaleDateString([], { weekday: "short" }) + " " + t;
}

// ---------- login ----------
// The server wants a session (Face ID) and a CSRF token on every write. A 401 means the session ended: go to the login page.
let csrf = "", whoKind = "";
/** Forget every cached copy of data on this device (threads, chats, Today, brief...). Called on logout and on any 401, so nothing of the last session stays behind. */
function wipeLocal() {
  try { for (const k of Object.keys(localStorage)) if (k.startsWith("ko.state.") || k.startsWith("ko.chat.") || k === "ko.chatidx") localStorage.removeItem(k); } catch { /* ignore */ }
  S.chats.clear(); S.data = null; S.chat = null;
}
const toLogin = () => { wipeLocal(); location.replace("login.html"); };
async function checkLogin() {
  try {
    const r = await fetch("/api/auth/me");
    if (r.status === 401) return toLogin();
    if (r.ok) { const j = await r.json(); csrf = j.csrf || ""; if (whoKind !== j.kind) { whoKind = j.kind; if ($("#top")) renderTop(); } }
  } catch { /* offline: stay on the cached page */ }
}

/** Log out: ends the session on the server (needs the CSRF token), wipes the cached threads on this device, back to the login page. */
async function logout(e) {
  try { await post("/api/auth/logout", {}, e); }
  catch (err) { if (!/Logged out/.test(err.message)) { toast(err.message, true); return; } }
  toLogin();
}

// ---------- data ----------
// Live feed is SSE. Some tunnels (Cloudflare quick tunnels) don't carry SSE, so if no state arrives in 1.5 s
// or the stream errors, fall back to polling /api/state and /api/thread every second (304 when unchanged).
// The choice is remembered for the session so a reload skips the wait.
let es = null, poll = (() => { try { return sessionStorage.getItem("ko.poll") === "1"; } catch { return false; } })(), pollT = null, esT = null;
/** Side data (usage, hours, brief, health, stop) is kept like Today: shown at once from the last copy, replaced when the fresh one lands. Wiped with the rest. */
const keep = (name, v) => store("ko.state." + name, v);
const gotState = (d) => { setLabelsFrom(d); S.data = d; S.conn = "live"; store("ko.state." + S.scope, S.data); renderAll(); warmChats(); };
async function pollState() {
  clearTimeout(pollT);
  const scope = S.scope; // the scope this request is for: if You switches while it is in flight, its answer (and its next tick) belong to nobody
  try {
    const r = await fetch("/api/state?scope=" + scope);
    if (scope !== S.scope) return; // the switch already started its own poll loop
    if (r.status === 401) return toLogin();
    if (r.status === 304) { if (S.conn !== "live") { S.conn = "live"; renderTop(); } }
    else if (r.ok) { const d = await r.json(); if (scope !== S.scope) return; gotState(d); } else throw new Error(String(r.status));
  } catch { if (scope !== S.scope) return; S.conn = "offline"; renderTop(); renderList(); renderDock(); }
  pollT = setTimeout(pollState, document.hidden ? 10000 : 1000);
}
function startPolling() {
  if (poll) return;
  poll = true; try { sessionStorage.setItem("ko.poll", "1"); } catch { /* ignore */ }
  es?.close(); es = null; clearTimeout(esT);
  pollState();
  if (S.openId) connectChat(S.openId);
}
function connectState() {
  es?.close(); clearTimeout(esT);
  const cached = store("ko.state." + S.scope);
  if (cached && !S.data) { setLabelsFrom(cached); S.data = { ...cached, connected: false, stale: true }; renderAll(); }
  if (poll) return pollState();
  es = new EventSource("/api/events?scope=" + S.scope);
  esT = setTimeout(startPolling, 1500);
  es.addEventListener("state", (e) => { clearTimeout(esT); gotState(JSON.parse(e.data)); });
  es.onerror = () => { checkLogin(); startPolling(); };
  es.onopen = () => { S.conn = "live"; renderTop(); };
}

let tes = null, tpollT = null;
async function pollChat(id) {
  clearTimeout(tpollT);
  if (S.openId !== id) return;
  try {
    const r = await fetch("/api/thread?id=" + encodeURIComponent(id));
    if (r.status !== 304 && r.ok) { const c = await r.json(); fdStamp(c); S.chats.set(c.head.id, c); saveChat(c); if (S.openId === c.head.id) { S.chat = c; renderChat(); } }
  } catch { /* next tick retries */ }
  tpollT = setTimeout(() => pollChat(id), document.hidden ? 10000 : 1000);
}
function connectChat(id) {
  tes?.close(); tes = null; clearTimeout(tpollT);
  if (!id) return;
  if (poll) return pollChat(id);
  tes = new EventSource("/api/thread/events?id=" + encodeURIComponent(id));
  tes.addEventListener("chat", (e) => {
    const c = JSON.parse(e.data);
    fdStamp(c);
    S.chats.set(c.head.id, c);
    saveChat(c);
    if (S.openId === c.head.id) { S.chat = c; renderChat(); }
  });
}
/** Server clock minus this device's clock, noted when a chat arrives, so "working for ..." does not depend on the phone's clock being right. */
function fdStamp(c) { if (c && c.frontDesk && Number.isFinite(c.frontDesk.now)) c.frontDesk.off = c.frontDesk.now - Date.now(); }
function saveChat(c) {
  c = { ...c, frontDesk: undefined }; // the front-desk facts are live-only: a stored copy would show a stale "busy" card
  const idx = store("ko.chatidx") || [];
  let next = [c.head.id, ...idx.filter((x) => x !== c.head.id)].slice(0, 12);
  const drop = (ids) => { for (const gone of ids) { try { localStorage.removeItem("ko.chat." + gone); } catch { /* ignore */ } } };
  drop(idx.filter((x) => !next.includes(x)));
  try { localStorage.setItem("ko.chat." + c.head.id, JSON.stringify(c)); }
  catch { drop(next.slice(Math.ceil(next.length / 2))); next = next.slice(0, Math.ceil(next.length / 2)); try { localStorage.setItem("ko.chat." + c.head.id, JSON.stringify(c)); } catch { next = next.filter((x) => x !== c.head.id); } } // storage full: keep the newest half
  store("ko.chatidx", next);
}
const prefetching = new Set();
/** Warm a chat before it is opened: the copy lands in memory and on disk, so opening it paints at once and the live feed only refreshes it. */
function prefetchChat(id) {
  if (!id || S.chats.has(id) || prefetching.has(id) || navigator.connection?.saveData) return;
  prefetching.add(id);
  fetch("/api/thread?id=" + encodeURIComponent(id)).then((r) => { if (r.status === 401) toLogin(); return r.ok ? r.json() : null; }).then((c) => { if (c && c.head) { fdStamp(c); if (!S.chats.has(id)) S.chats.set(id, c); saveChat(c); if (S.openId === id && !S.chat) { S.chat = c; renderChat(); } } }).catch(() => {}).finally(() => prefetching.delete(id));
}
// Intent: a finger on a row, a mouse resting on it for a moment, or the keyboard arriving on it. One listener for every list, the office and the map.
{
  let hoverT = null;
  const idOf = (e) => e.target?.closest?.("[data-id]")?.getAttribute("data-id") || null;
  addEventListener("pointerdown", (e) => prefetchChat(idOf(e)), true);
  addEventListener("pointerover", (e) => { if (e.pointerType !== "mouse") return; clearTimeout(hoverT); const id = idOf(e); if (id) hoverT = setTimeout(() => prefetchChat(id), 60); }, true);
  addEventListener("focusin", (e) => prefetchChat(idOf(e)), true);
}
/** After the first screen: quietly warm the chats You is most likely to open next (what needs him, then what is working), a few, spaced out. */
let warmed = false;
function warmChats() {
  if (warmed || !S.data || S.data.stale || navigator.connection?.saveData) return;
  warmed = true;
  const ids = [...S.data.needs.map((n) => n.id), ...S.data.working.map((g) => g.id)].filter((x, i, a) => a.indexOf(x) === i).slice(0, 4);
  (window.requestIdleCallback || ((f) => setTimeout(f, 800)))(() => ids.forEach((id, i) => setTimeout(() => prefetchChat(id), i * 400)), { timeout: 3000 });
}

async function post(path, body, e) {
  if (!e || !e.isTrusted) throw new Error("Writes need a real click or key press.");
  if (!csrf) await checkLogin();
  const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json", "x-kemino": "1", "x-csrf": csrf }, body: JSON.stringify({ ...body, gesture: true }) });
  if (r.status === 401) { toLogin(); throw new Error("Logged out. Opening the login page."); }
  const j = await r.json().catch(() => ({}));
  if (r.status === 409 && j.needsConfirm) { const err = new Error("confirm"); err.needsConfirm = true; err.kinds = j.kinds; throw err; }
  if (!r.ok) throw new Error(j.error || "failed (" + r.status + ")");
  return j;
}

/** DELETE with the same guards as post(): custom header, CSRF token, and only from a real click or key. */
async function del(path, e) {
  if (!e || !e.isTrusted) throw new Error("Writes need a real click or key press.");
  if (!csrf) await checkLogin();
  const r = await fetch(path, { method: "DELETE", headers: { "x-kemino": "1", "x-csrf": csrf, "x-gesture": "1" } });
  if (r.status === 401) { toLogin(); throw new Error("Logged out. Opening the login page."); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "failed (" + r.status + ")");
  return j;
}

// ---------- pictures ----------
// Same limits the server enforces (and T3 itself): png, jpeg, webp, gif; 10 MB each; 4 per message. The server checks them again.
const PIC_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"], PIC_MAX = 10 * 1024 * 1024, PIC_COUNT = 4;
const picsOf = (id) => S.pics.get(id) || [];
const picsReady = (id) => picsOf(id).filter((p) => p.status === "ready");
function readDataUrl(file) { return new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = () => res(""); fr.readAsDataURL(file); }); }
async function addPictures(files, e) {
  const id = S.openId;
  if (!id || !live()) return;
  if (!e || !e.isTrusted) { toast("Pictures need a real tap.", true); return; }
  for (const file of [...files]) {
    const list = picsOf(id);
    if (list.length >= PIC_COUNT) { toast("At most " + PIC_COUNT + " pictures per message.", true); break; }
    if (!PIC_TYPES.includes(file.type)) { toast((/heic|heif/i.test(file.type) ? "T3 doesn't take HEIC. Pick the photo as JPEG." : "Only png, jpeg, webp or gif pictures.") , true); continue; }
    if (file.size > PIC_MAX) { toast("That picture is over 10 MB.", true); continue; }
    const pic = { key: Math.random().toString(36).slice(2), name: file.name || "image", status: "uploading", id: null, thumb: "" };
    S.pics.set(id, [...list, pic]); renderDock();
    pic.thumb = await readDataUrl(file); renderDock();
    uploadPicture(id, pic, file);
  }
}
async function uploadPicture(threadId, pic, file) {
  try {
    if (!csrf) await checkLogin();
    const r = await fetch("/api/upload?threadId=" + encodeURIComponent(threadId) + "&name=" + encodeURIComponent(pic.name), { method: "POST", headers: { "content-type": file.type, "x-kemino": "1", "x-csrf": csrf, "x-gesture": "1" }, body: file });
    if (r.status === 401) return toLogin();
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || "upload failed (" + r.status + ")");
    pic.id = j.id; pic.status = "ready";
    if (j.confirmed === false) wrote("Picture " + pic.name, j);
  } catch (err) {
    S.pics.set(threadId, picsOf(threadId).filter((p) => p !== pic));
    toast(err.message, true);
  }
  renderDock();
}
function removePicture(threadId, pic) { S.pics.set(threadId, picsOf(threadId).filter((p) => p !== pic)); renderDock(); }
function picStrip() {
  const list = picsOf(S.openId);
  if (!list.length) return null;
  return h("div", { class: "pics", role: "list", "aria-label": "Pictures to send" }, list.map((p) => h("div", { class: "pic " + p.status, role: "listitem" },
    p.thumb ? h("img", { src: p.thumb, alt: p.name }) : h("span", { class: "ph" }),
    p.status === "uploading" ? h("span", { class: "up" }, "…") : null,
    h("button", { class: "rm", "aria-label": "Remove " + p.name, onclick: () => removePicture(S.openId, p) }, ICONS.x()))));
}

// ---------- feature freeze, tap counts, ledger line, read-back ----------
const main = (key) => isMain(S.flags, key);
/** Counts one use of a feature (a name and a number on the server, nothing else). Never blocks, never shows an error. */
function tap(key) {
  if (!csrf) return;
  fetch("/api/tap", { method: "POST", headers: { "content-type": "application/json", "x-kemino": "1", "x-csrf": csrf }, body: JSON.stringify({ key }), keepalive: true }).catch(() => {});
}
/** Awake override: while the page is visible and he touches/types/clicks, tell the server at most once a minute so a "needs you" push is not held by quiet hours. */
let lastSeenPing = 0;
function seenPing() {
  if (!csrf || document.visibilityState !== "visible" || Date.now() - lastSeenPing < 60_000) return;
  lastSeenPing = Date.now();
  fetch("/api/seen", { method: "POST", headers: { "content-type": "application/json", "x-kemino": "1", "x-csrf": csrf }, body: "{}", keepalive: true }).catch(() => {});
}
for (const ev of ["pointerdown", "keydown", "touchstart"]) addEventListener(ev, seenPing, { passive: true, capture: true });
async function loadFlags() {
  try {
    const r = await fetch("/api/flags");
    if (r.status === 401) return toLogin();
    if (r.ok) { S.flags = (await r.json()).features; keep("flags", S.flags); if ($("#top")) { renderTop(); buildCapsule(); renderList(); } }
  } catch { /* offline: keep the last choice, or the defaults */ }
}
/** The small line under the usage chips: "Last heard from T3: just now". Always shown, muted; red after 5 minutes of silence. Redrawn by a timer too, so it ages even when nothing else changes. The ledger moved to More > Insights. */
function refreshMeta() {
  const el = document.getElementById("todaymeta");
  if (!el) return;
  const hl = heardLine(S.data?.lastHeard || S.data?.lastSeen || 0, Date.now());
  el.replaceChildren(h("span", { class: "tm-heard" + (hl.red ? " red" : ""), "data-line": "heard", role: "status" }, hl.text));
}
/** The outcome of a write: "Sent" when T3 showed it back, otherwise a "Not confirmed" banner with Check again (and, for a message, Send again). */
function wrote(msg, r, extra = {}) {
  if (!r || r.confirmed !== false || !r.check) { if (!extra.quiet) toast(msg); return; } // a confirmed send needs no popup: the message / card shows it
  const id = Math.random().toString(36).slice(2, 9);
  S.unconfirmed = [...S.unconfirmed.filter((u) => JSON.stringify(u.check) !== JSON.stringify(r.check)), { id, label: msg, check: r.check, ...extra }].slice(-4);
  if (extra.inline) { if (S.openId) renderChat(true); return; } // a message: "Not delivered · retry" shows under it in the chat, no popup, no banner
  toast(msg + " · not confirmed yet", true); renderBanners();
}
async function recheck(id, e) {
  const u = S.unconfirmed.find((x) => x.id === id);
  if (!u) return;
  try {
    const r = await post("/api/recheck", { check: u.check }, e);
    if (r.confirmed) { S.unconfirmed = S.unconfirmed.filter((x) => x.id !== id); toast("Confirmed: " + u.label); renderBanners(); }
    else toast("Still not confirmed", true);
  } catch (err) { toast(err.message, true); }
}
function sendAgain(id, e) {
  const u = S.unconfirmed.find((x) => x.id === id);
  if (!u || !u.resend) return;
  S.unconfirmed = S.unconfirmed.filter((x) => x.id !== id); renderBanners();
  void post("/api/send", u.resend, e).then((r) => { if (r.queued) fdNoteQueued(u.resend.threadId, r); return wrote("Sent again", r, r.check ? { quiet: true, inline: true, canResend: false } : { quiet: true }); }).catch((err) => toast(err.message, true));
}
const featuresScreen = () => openFeatures({ h, post, toast, toLogin }, (features) => { S.flags = features; keep("flags", features); renderTop(); buildCapsule(); renderList(); });
const autoDeps = () => ({ h, post, toast, toLogin, wrote });

// ---------- later (snooze) ----------
// The server holds the snooze (the data folder/snooze.json, src/snooze.ts), so it survives restarts and shows on every device. S.later is only the old local hide ("Retry later" on a failed group).
const snzPending = {}; // id -> { until, at }: instant feedback for 15 s after a tap, before T3's state arrives
const laterUntil = (id) => {
  const n = S.data?.needs.find((x) => x.id === id);
  return Math.max(n?.snoozedUntil || 0, S.later[id] || 0, pendingUntil(snzPending, id));
};
const laterActive = (id) => laterUntil(id) > Date.now();
/** "Later": the sheet with the wake-time choices. Waking now (on = false) asks T3 to unsnooze. */
function setLater(id, on, e) {
  const title = tn(id, S.data?.needs.find((x) => x.id === id)?.title || "this thread");
  if (!on) {
    delete S.later[id]; store("ko.later", S.later); delete snzPending[id]; renderList();
    void post("/api/unsnooze", { threadId: id }, e).then((r) => wrote("Woken", r)).catch((err) => toast(err.message, true));
    return;
  }
  openSnoozeSheet({ h, title, choose: (until) => {
    snzPending[id] = { until, at: Date.now() }; renderList();
    return post("/api/snooze", { threadId: id, until: new Date(until).toISOString() }, e)
      .then((r) => { wrote("Back " + untilClock(new Date(until).toISOString()), r); })
      .catch((err) => { delete snzPending[id]; renderList(); toast(err.message, true); });
  } });
}

// ---------- actions ----------
async function answer(need, decision, e, confirm = false, remember = false) {
  if (!live() || !need.requestId || S.sending.has(need.id)) return false;
  if (decision !== "decline" && need.risky && !confirm) { S.confirming.set(need.id, need.riskKinds); renderAll(); return false; }
  S.sending.add(need.id); renderAll();
  let ok = false;
  try {
    const r = await post("/api/respond", { threadId: need.id, requestId: need.requestId, decision, confirm, remember: remember && decision === "accept", device: isDesk() ? "mac" : "phone" }, e);
    S.confirming.delete(need.id); S.remembering.delete(need.id);
    if (need.requestId) S.answered.add(need.requestId); // the next card comes up now, before the server's next push
    tap("approve");
    wrote(decision === "decline" ? "Sent: no" : remember ? (r.remembered ? "Sent: yes. Remembered for this project." : "Sent: yes. Not remembered: " + (r.rememberWhy || "not allowed")) : "Sent: yes", r, { quiet: !remember });
    ok = true;
    if (r.offer && decision === "accept" && !remember) showOffer(need, r.offer);
  } catch (err) {
    if (err.needsConfirm) S.confirming.set(need.id, err.kinds);
    else toast(err.message, true);
  } finally { S.sending.delete(need.id); renderAll(); }
  return ok;
}
/** Unsent messages (iOS "Not Delivered"): the text You sent stays IN the thread, grey "Sending…", then the real message, or red "Not delivered" with Send again / Remove. Kept per thread, saved on this device. */
function setUnsent(next, id) {
  S.unsent = next;
  try { unsentSave(localStorage, S.unsent); } catch { /* no storage: it stays while the app is open */ }
  if (id && S.openId === id) { S.stickUntil = Math.max(S.stickUntil || 0, Date.now() + 3000); renderChat(); }
}
/** The server's answer for one unsent entry. `then` runs the same follow-ups as before (queue card, fast re-read of the chat). */
function unsentAnswer(threadId, uid, r, resend) {
  setUnsent(unsentResult(S.unsent, threadId, uid, r), threadId);
  if (r.queued || S.chat?.running || S.chat?.frontDesk?.busy) fdNoteQueued(threadId, r);
  showSentSoon(threadId);
  wrote(r.queued ? "Queued: it will run after the current step" : "Sent", r, { quiet: true, inline: true, canResend: true, resend });
}
async function sendText(text, e, confirm = false, pics = [], onAdded = null) {
  const id = S.openId, clean = text.trim();
  if (!id || (!clean && !pics.length) || !live()) return false;
  const uid = "u" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const body = { threadId: id, text: clean, confirm, images: pics.map((p) => p.id) };
  setUnsent(unsentAdd(S.unsent, id, { id: uid, text: clean, pics: pics.length }), id);
  S.drafts.delete(id); onAdded?.();
  try {
    const r = await post("/api/send", body, e);
    S.msgConfirm = null; S.pics.delete(id);
    tap("chat");
    unsentAnswer(id, uid, r, body);
    return true;
  } catch (err) {
    if (err.needsConfirm) { setUnsent(unsentRemove(S.unsent, id, uid), id); S.msgConfirm = { text: clean, kinds: err.kinds, pics }; renderDock(); return false; }
    // The call itself failed (T3 offline, refused): the text stays in the thread as "Not delivered", never only a toast.
    setUnsent(unsentFail(S.unsent, id, uid, err.message), id);
    toast(err.message, true);
    return true;
  }
}
/** "Send again" on a Not delivered bubble: look once more (T3 may have it by now: then no second copy), otherwise send it again through the same path. */
async function unsentSendAgain(threadId, uid, e) {
  const u = (S.unsent[threadId] || []).find((x) => x.id === uid);
  if (!u || u.status === "sending") return;
  setUnsent(unsentRetry(S.unsent, threadId, uid), threadId);
  try {
    if (u.check) {
      const c = await post("/api/recheck", { check: u.check }, e);
      if (c.confirmed) { setUnsent(unsentResult(S.unsent, threadId, uid, { confirmed: true, check: u.check }), threadId); showSentSoon(threadId); toast("T3 already has it"); return; }
    }
    const body = { threadId, text: u.text, confirm: true, images: [] }; // he already chose to send this text; pictures are not kept across a retry
    const r = await post("/api/send", body, e);
    unsentAnswer(threadId, uid, r, body);
  } catch (err) { setUnsent(unsentFail(S.unsent, threadId, uid, err.message), threadId); toast(err.message, true); }
}
/** The bubbles of the open thread that T3 has not shown yet; drops the ones the chat now has (matched by message id or text). */
function unsentNodes(items) {
  const id = S.openId; if (!id) return [];
  const rc = unsentReconcile(S.unsent, id, items);
  if (rc.state !== S.unsent) { S.unsent = rc.state; try { unsentSave(localStorage, S.unsent); } catch { /* memory only */ } }
  if (rc.shown.length) S.unconfirmed = S.unconfirmed.filter((u) => !(u.inline && u.check && rc.shown.includes(u.check.messageId)));
  return unsentView(S.unsent, id).map((u) => {
    const bad = u.kind === "bad";
    return h("div", { class: "m user unsent " + u.kind, "data-unsent": u.id },
      u.text ? h("div", { class: "txt" }, u.text) : null,
      u.pics ? h("div", { class: "un-pics" }, u.pics + (u.pics === 1 ? " picture" : " pictures")) : null,
      u.kind === "sent" ? null : h("span", { class: "at" }, h("span", { class: "st " + (bad ? "bad" : "sending"), role: "status" }, bad ? "Not delivered" + (u.why ? " \u00b7 " + u.why : "") : "Sending\u2026")),
      bad ? h("div", { class: "un-acts" },
        h("button", { class: "un-btn", type: "button", "data-act": "unsent-again", onclick: (e) => unsentSendAgain(id, u.id, e) }, "Send again"),
        h("button", { class: "un-btn", type: "button", "data-act": "unsent-remove", onclick: () => setUnsent(unsentRemove(S.unsent, id, u.id), id) }, "Remove")) : null);
  });
}
/** FRONT DESK. A message sent to a running thread is queued by T3; remember its id so the card can say when it is picked up. */
/** Right after a send: fetch the chat again at once (the new message shows now, not when the thread next does something) and keep the view at the bottom for a few seconds. */
function showSentSoon(id) {
  S.stickUntil = Date.now() + 8000;
  for (const ms of [0, 400, 1600, 5000]) setTimeout(async () => {
    if (S.openId !== id) return;
    try {
      const r = await fetch("/api/thread?id=" + encodeURIComponent(id));
      if (r.status === 304 || !r.ok) return;
      const c = await r.json(); fdStamp(c); S.chats.set(c.head.id, c); saveChat(c);
      if (S.openId === c.head.id) { S.chat = c; renderChat(); }
    } catch { /* the stream or the next poll catches up */ }
  }, ms);
}
function fdNoteQueued(threadId, r) {
  const id = r?.check?.messageId;
  if (!id || !threadId) return;
  const rec = S.fd.get(threadId) || { tracked: [], wasQueued: false, pickedUntil: 0 };
  rec.tracked = [...rec.tracked.filter((x) => x.id !== id), { id, at: Date.now(), seen: false }];
  rec.pickedUntil = 0;
  S.fd.set(threadId, rec);
  if (S.openId === threadId) renderChat(true);
}
/** The card of the open thread right now, or null. Steps the thread's record (queued, picked up) against the chat's front-desk facts. */
function fdView() {
  const id = S.openId, c = S.chat;
  if (!id || !c || c.head?.id !== id) return null;
  const now = Date.now(), fd = c.frontDesk, old = S.fd.get(id) || { tracked: [], wasQueued: false, pickedUntil: 0 };
  if (!fd && !old.tracked.length && !old.wasQueued) return null; // a chat restored from storage carries no front-desk facts: no card from it
  const { rec, picked } = fdStep(old, fd, now);
  rec.pickedUntil = picked ? now + PICKED_MS : old.pickedUntil;
  S.fd.set(id, rec);
  const card = fdCardModel({ title: c.head.title, fd, rec, pickedUntil: rec.pickedUntil, now, offset: fd?.off || 0 });
  return card ? { card, fd } : null;
}
function fdSigOf(v) { return v ? [v.card.kind, v.card.headline, v.card.canAct, v.card.nextId, !!v.card.elapsed, !!v.card.typical, S.fdAsk, S.fdSending, v.card.hideKey && S.fdHide.has(v.card.hideKey)].join("|") : ""; }
function fdNode() {
  const v = fdView();
  S.fdSig = fdSigOf(v);
  if (!v) return null;
  const nextId = v.card.nextId;
  return frontDeskCard({ h, face: aiFace(S.chat.head.model, "sm"), card: v.card, ask: S.fdAsk, hidden: !!v.card.hideKey && S.fdHide.has(v.card.hideKey), busy: S.fdSending, live: live(),
    onAsk: () => { S.fdAsk = true; renderChat(true); },
    onKeep: () => { S.fdAsk = false; if (v.card.hideKey) S.fdHide.add(v.card.hideKey); renderChat(true); },
    onGo: (e) => sendNowGo(nextId, e) });
}
/** Every second: tick the elapsed time in place; redraw only when what the card says (or whether it exists) changed. */
function fdTick() {
  if (document.hidden || !S.chat) return;
  const v = fdView();
  if (fdSigOf(v) !== S.fdSig) { renderChat(true); return; }
  const el = v && document.querySelector(".fd-elapsed");
  if (el && v.card.elapsed && el.textContent !== v.card.elapsed) el.textContent = v.card.elapsed;
}
/** "Send now": interrupt the running step so the already-queued message runs next. One confirm tap (the server insists on it too); the message is never sent a second time. */
async function sendNowGo(messageId, e) {
  const id = S.openId;
  if (!id || !live() || S.fdSending) return;
  S.fdSending = true; renderChat(true);
  try {
    const r = await post("/api/sendnow", { threadId: id, messageId, confirm: true }, e);
    toast(r.started ? "Step interrupted. Your message is running now." : "Step interrupted. Your message starts as soon as T3 is ready.");
  } catch (err) { toast(err.message, true); }
  finally { S.fdAsk = false; S.fdSending = false; renderChat(true); }
}
/** Quick action: stop the run that is going on. Needs one confirm tap (the page asks first; the server insists on it too). */
async function stopRun(e, confirm) {
  const id = S.openId;
  if (!id || !live() || S.stopping) return;
  if (!confirm) { S.stopAsk = true; renderDock(); return; }
  S.stopping = true; renderDock();
  try { await post("/api/stop", { threadId: id, confirm: true }, e); toast("Stop sent"); }
  catch (err) { toast(err.message, true); }
  finally { S.stopAsk = false; S.stopping = false; renderDock(); }
}
/** Quick action: the text in the box becomes the first message of a NEW thread in the same project (same model and mode). */
async function newThreadFrom(text, e, confirm = false) {
  const id = S.openId, clean = text.trim();
  if (!id || !clean || !live()) return;
  try {
    const r = await post("/api/newthread", { threadId: id, text: clean, confirm }, e);
    S.newAsk = null; S.drafts.delete(id); ta.value = ""; grow(); syncSend();
    toast("New thread started");
    if (r.threadId) openThread(r.threadId);
  } catch (err) {
    if (err.needsConfirm) { S.newAsk = { text: clean, kinds: err.kinds }; renderDock(); }
    else toast(err.message, true);
  }
}
async function changeModel(sel, e) {
  const head = S.chat?.head; if (!head) return;
  const model = $("#sel-model").value, effort = $("#sel-effort").value || null;
  try { const r = await post("/api/model", { threadId: head.id, instanceId: head.model.instanceId, model, effort }, e); wrote("Model: " + modelLabel(model) + (effort ? " · " + effort : ""), r); }
  catch (err) { toast(err.message, true); }
}

// ---------- layout ----------
function buildShell() {
  const app = $("#app");
  fill(app, 
    h("header", { class: "top", id: "top" }),
    h("div", { class: "banners", id: "banners" }),
    h("div", { class: "fchip-w phone-only", id: "fchip" }),
    h("div", { class: "appbody", id: "appbody" }, h("div", { class: "shell" },
      h("section", { class: "pane pane-list", "aria-label": "Today" },
        h("div", { class: "scroll", id: "list-scroll", "data-ptr": "view" }, h("div", { class: "list-in", id: "list" })),
        h("div", { class: "offer-slot offer-slot-today", id: "offer-slot-today" })),
      h("section", { class: "pane pane-chat", "aria-label": "Chat" },
        h("div", { id: "chat-head", class: "chat-head" }),
        h("div", { class: "scroll", id: "chat-scroll" }, h("div", { class: "msgs", id: "msgs" })),
        h("div", { class: "offer-slot", id: "offer-slot" }),
        h("div", { class: "dock", id: "dock" }),
        h("div", { class: "info-wrap", id: "info", inert: true }),
        h("aside", { class: "insp", id: "insp", "aria-label": "Inspector", inert: true }),
        h("div", { class: "scroll", id: "view-scroll", "data-ptr": "view" }, h("div", { class: "view-in", id: "view" }))))),
    h("div", { class: "capw tbw phone-only", id: "capw" }),
  );
  app.dataset.rail = S.rail ? "collapsed" : "open";
  buildCapsule();
  buildComposer();
  $("#chat-scroll").addEventListener("scroll", renderJump, { passive: true });
  watchKeyboard(); watchFullpages();
}

/**
 * iOS keyboard: the layout viewport does not shrink, the page is panned instead. So while the keyboard is up (visual viewport much shorter than the window)
 * the app is pinned to the visible area (class kb-open + --vvh/--vvt, set like refresh.js sets --ptr): the header stays under the status bar and the dock sits flush on the keyboard (no safe-area strip).
 */
let pictureHold = 0; // until this time: the chat does not jump back to the bottom (a picture was just scrolled into view above the question sheet)
function watchKeyboard() {
  const vv = window.visualViewport; if (!vv) return;
  const root = document.documentElement, now = () => Date.now();
  let lastScrollAt = 0, burstUntil = 0, raf = 0, burstStick = false;
  const chatBox = () => document.getElementById("chat-scroll");
  const wantBottom = () => { // measured BEFORE the layout changes
    const sc = chatBox(); if (!sc || !S.openId) return false;
    return stickDecision({ near: atBottom(sc, 140), nearScreen: atBottom(sc, sc.clientHeight), justOpened: !!S.justOpened, stickUntil: S.stickUntil || 0, now: now(), lastScrollAt });
  };
  const apply = () => {
    const sc = chatBox(), stick = now() > pictureHold && (burstStick || wantBottom());
    const st = viewportState({ inner: window.innerHeight, vvHeight: vv.height, vvTop: vv.offsetTop, scale: vv.scale });
    root.classList.toggle("kb-open", st.open);
    if (st.open) { root.style.setProperty("--vvh", st.vvh + "px"); root.style.setProperty("--vvt", st.vvt + "px"); }
    else { root.style.removeProperty("--vvh"); root.style.removeProperty("--vvt"); }
    const pg = document.scrollingElement; // iOS pans the page itself on focus: put it back so the pinned shell is never off-screen
    if (st.open && pg && pg.scrollTop !== 0) { pg.scrollTop = 0; window.scrollTo(0, 0); }
    if (stick && sc) sc.scrollTop = sc.scrollHeight; // the last message stays right above the dock
  };
  /** Do not trust events alone: re-read the viewport every frame for a short while after any trigger. */
  const burst = () => {
    if (!burstUntil || now() > burstUntil) burstStick = wantBottom(); // a burst already running keeps the first answer
    burstUntil = now() + REMEASURE_MS;
    if (raf) return;
    const tick = () => { apply(); if (now() < burstUntil) raf = requestAnimationFrame(tick); else { raf = 0; burstUntil = 0; burstStick = false; apply(); } };
    raf = requestAnimationFrame(tick);
  };
  const box = chatBox();
  if (box) {
    box.addEventListener("scroll", () => { lastScrollAt = now(); }, { passive: true });
    const manual = () => { burstStick = false; }; // the finger takes over: stop following the bottom
    box.addEventListener("touchstart", manual, { passive: true }); box.addEventListener("wheel", manual, { passive: true });
  }
  vv.addEventListener("resize", burst); vv.addEventListener("scroll", burst);
  window.addEventListener("scroll", () => { if (root.classList.contains("kb-open")) apply(); }, { passive: true });
  window.addEventListener("orientationchange", burst); window.addEventListener("resize", burst); window.addEventListener("hashchange", burst);
  document.addEventListener("focusin", burst); document.addEventListener("focusout", burst);
  apply();
}

// ---------- quick desk (layer 0: no AI) ----------
const deskCtx = () => ({ usage: S.usage, vms: buddies.vms().map((v) => ({ name: v.name, running: v.running || [], needs: v.needs || [] })), needCount: S.data ? queueNow().length : 0, connected: live() });
// The side desk (400px) needs room: below 1200px it takes the phone form (a full-height sheet) so the chat is not crushed.
const deskSide = () => matchMedia("(min-width: 1200px)").matches;
const desk = createDesk({
  h, fill, isDesk: deskSide, canType,
  ctx: deskCtx,
  host: () => (deskSide() ? $("#appbody") : $("#app")),
  refresh: () => loadUsage(),
  post: (path, body, e) => post(path, body, e),
  screen: () => (S.openId ? "chat" : S.mode === "all" ? "all" : S.mode === "office" ? "office" : S.mode === "map" ? "map" : "today"),
  headInfo: async (id) => { try { const r = await fetch("/api/desk/head" + (id ? "?id=" + encodeURIComponent(id) : "")); if (r.status === 401) { toLogin(); return null; } return r.ok ? await r.json() : null; } catch { return null; } },
  loadNext: async () => { try { const r = await fetch("/api/desk/next"); if (r.status === 401) { toLogin(); return null; } return r.ok ? await r.json() : null; } catch { return null; } },
});
const deskOut = () => { try { return claudeOut(S.usage, Date.now()).out; } catch { return false; } };

function renderTop() {
  if (document.activeElement?.closest?.("#top select, #top input")) return; // an open Focus picker (or the search box being typed in) must not be rebuilt under the finger
  const live_ = live();
  const label = S.data?.stale ? (S.conn === "offline" ? "Offline · last data" : "Last data · updating")
    : S.conn === "offline" || !S.data ? (S.conn === "connecting" ? "Connecting" : "Offline")
    : !S.data.connected ? "T3 offline · " + (S.data.lastSeen ? "last seen " + ago(S.data.lastSeen) : "not seen") : "Live";
  const pill = h("span", { class: "pill " + (live_ ? "live" : S.conn === "connecting" ? "" : "off"), role: "status" }, h("i"), label);
  if (isDesk()) return renderTopDesk(pill);
  // Desktop: ALL FOUR views are always there, in this order (You, 7 Nov). The phone capsule still follows the "main screen" feature choices.
  const views = h("div", { class: "sg desk-only", role: "group", "aria-label": "View" },
    h("button", { "aria-pressed": S.mode === "list", "data-view": "list", onclick: () => setMode("list"), title: "Today (Alt+1)" }, "Today"),
    h("button", { "aria-pressed": S.mode === "all", "data-view": "all", onclick: () => setMode("all"), title: "Every thread in every project (A, or Alt+2)" }, "All"),
    h("button", { "aria-pressed": S.mode === "office", "data-view": "office", onclick: () => setMode("office"), title: "The pixel office (Alt+3)" }, "Office"),
    h("button", { "aria-pressed": S.mode === "map", "data-view": "map", onclick: () => setMode("map"), title: "Who reports to whom (Alt+4)" }, "Map"));
  const names = projectsOf(S.data);
  if (S.focus && !names.includes(S.focus)) names.unshift(S.focus);
  const focus = h("span", { class: "focus desk-only" },
    h("span", { class: "sel-wrap" }, h("select", { "aria-label": "Focus on a project", title: "Focus: show one project only", onchange: (e) => setFocus(e.target.value) },
      h("option", { value: "", selected: !S.focus }, "All projects"), names.map((n) => h("option", { value: n, selected: n === S.focus }, n)))),
    S.focus ? h("button", { class: "pill logout", "aria-label": "Clear focus", title: "Show all projects", onclick: () => setFocus("") }, ICONS.x(10), "Clear") : null);
  fill($("#top"), h("span", { class: "brand" }, "Kemino OS"), h("div", { class: "buddy-row buddy-top", id: "buddy-top" }), views, focus, h("span", { class: "grow" }), h("span", { class: "keys desk-only" },
    h("span", {}, h("kbd", {}, "/"), "type"), h("span", {}, h("kbd", {}, "\u2191"), h("kbd", {}, "\u2193"), "move"), h("span", {}, h("kbd", {}, "Y"), h("kbd", {}, "N"), "answer"), h("span", {}, h("kbd", {}, "L"), "later")), searchButton({ h, open: openPhoneSearch }), desk.button(), pill,
    h("button", { class: "pill logout desk-only", "aria-label": "Keyboard shortcuts", title: "Keyboard shortcuts (?)", onclick: openKeysHelp }, "?"),
    h("button", { class: "pill logout desk-only tour-btn", onclick: startTour, title: "Go through everything waiting on you, one card at a time" }, "Tour", tourCount() ? h("small", { class: "tc" }, tourCount()) : null),
    main("decisions") ? h("button", { class: "pill logout desk-only", onclick: () => openFeature("decisions"), title: "Your answers and saved rules" }, "Decisions") : null,
    main("automations") ? h("button", { class: "pill logout desk-only", onclick: () => openFeature("automations"), title: "Scheduled tasks in T3" }, "Automations") : null,
    main("queue") ? h("button", { class: "pill logout desk-only", "data-act": "queue", onclick: () => openFeature("queue"), title: "Park an approved job until a reset" }, "Queue") : null,
    main("insights") ? h("button", { class: "pill logout desk-only", "data-act": "insights", onclick: () => openFeature("insights"), title: "Skills, usage per project and tidy-up preview (read-only)" }, "Insights") : null,
    ["tidy", "apps", "skills", "weekly", "hours", "code"].filter(main).map((k) => h("button", { class: "pill logout desk-only", "data-act": k, onclick: () => openFeature(k) }, FEATURES.find((f) => f.key === k).label)),
    main("stop-today") || S.stop?.stopped ? h("button", { class: "pill logout desk-only stop-btn", "data-act": "stop-today", onclick: () => openFeature("stop-today"), title: S.stop?.stopped ? "Turn the paused automations back on" : "Pause tonight's automations until 07:00" }, S.stop?.stopped ? "Resume" : "Stop for today") : null,
    h("button", { class: "pill logout desk-only", "data-act": "more", onclick: () => openMenu(), title: "Everything else, and the Features switch" }, "More"),
    main("notifications") ? h("button", { class: "pill logout bell", "data-act": "bell", onclick: () => openFeature("notifications"), "aria-label": "Notifications", title: "Notifications" }, ICONS.bell()) : null,
    whoKind === "session" ? h("button", { class: "pill logout", onclick: logout, "aria-label": "Log out" }, "Log out") : null);
  mountBuddies();
}
/** Desktop top bar: ONE line (You, 8 Nov). Tour, shortcuts and the rarely used buttons live in More. */
function renderTopDesk(pill) {
  const names = projectsOf(S.data);
  if (S.focus && !names.includes(S.focus)) names.unshift(S.focus);
  const focusEl = h("span", { class: "focus desk-only" },
    h("span", { class: "sel-wrap" }, h("select", { "aria-label": "Focus on a project", title: "Focus: show one project only", onchange: (e) => setFocus(e.target.value) },
      h("option", { value: "", selected: !S.focus }, "All projects"), names.map((n) => h("option", { value: n, selected: n === S.focus }, n)))),
    S.focus ? h("button", { class: "pill logout", "aria-label": "Clear focus", title: "Show all projects", onclick: () => setFocus("") }, ICONS.x(10), "Clear") : null);
  const search = h("input", { type: "search", class: "topsearch", id: "topsearch", value: S.filter || null, placeholder: "Search", "aria-label": "Search threads", autocomplete: "off",
    oninput: (e) => { S.filter = e.target.value.toLowerCase(); renderList(); } });
  const vms = buddies.vms(), counts = tabCounts({ need: queueNow().length, working: vms.reduce((n, v) => n + v.running.length, 0), all: allView.state.built?.total || 0 });
  const bell = main("notifications") ? h("button", { class: "pill logout bell", "data-act": "bell", onclick: () => openFeature("notifications"), "aria-label": "Notifications", title: "Notifications" }, ICONS.bell()) : null;
  const code = main("code") ? h("button", { class: "pill logout codebtn", "data-act": "code", onclick: () => openFeature("code"), title: "Branches, pull requests and the threads on them" }, "Code") : null;
  const resume = S.stop?.stopped ? h("button", { class: "pill logout stop-btn", "data-act": "stop-today", onclick: () => openFeature("stop-today"), title: "Turn the paused automations back on" }, "Resume") : null;
  fill($("#top"), desktopTopBar({ h, mode: S.openId ? "" : S.mode, counts, setMode, pill, focusEl, search, bell, resume, code, ask: desk.button(), update: !!S.updateReady, onMore: () => openMenu(), onNew: startNewThread }));
  mountBuddies();
}
/** "+ New thread" / the chat's "New thread" button / the menu: the picker sheet (newthread.js). Opens with the box's text and the open thread's project, AI and mode. */
function startNewThread() {
  const head = S.openId ? S.chat?.head : null;
  openNewThread({ h, post, toast, toLogin, usage: S.usage, text: S.openId ? ta.value : "", openThread,
    head: head ? { project: head.project, runtimeMode: head.runtimeMode, model: head.model } : null });
}
const INSIGHT_TABS = [usageTab, ledgerTab, skillsTab, tidyTab, appsTab, leadTab];
/** How each switchable feature opens. Every way in (main button or More) goes through openFeature(), which also counts the tap. */
const OPEN = {
  map: () => setMode("map"), office: () => setMode("office"),
  notifications: () => openNotifyPanel({ h, post, toast, opener: menuFrom }),
  decisions: () => openDecisions({ h, del, post, toast, toLogin }),
  automations: () => openAutomations(autoDeps()),
  queue: () => queue(), insights: () => insights(),
  tidy: () => insights("tidy"), apps: () => insights("apps"), skills: () => insights("skills"),
  "stop-today": () => openStop(),
  weekly: () => showSheet("week"),
  hours: () => { S.hoursOpen = true; $("#list-scroll")?.scrollTo(0, 0); renderList(); },
  brief: () => showSheet(new Date().getHours() < 12 ? "morning" : "evening"),
  google: () => openGoogle({ h, post, del, toast, toLogin }),
  code: () => openCode({ h, toast, toLogin, openThread, opener: menuFrom }),
  life: () => openLife({ h, post, toast, toLogin, opener: menuFrom, onClose: () => { LIFE.at = 0; renderList(); } }),
};
function openFeature(key) { tap(key); OPEN[key]?.(); }
// Google sends the browser back to /?google=<result>: say it quietly, clean the address, show the card.
{ const g = new URLSearchParams(location.search).get("google"); if (g) { history.replaceState(null, "", location.pathname + location.hash); setTimeout(() => { toast(resultText(g) || "Google", g === "error" || g === "denied"); openFeature("google"); }, 700); } }
const queue = () => openQueue({ h, post, toast, toLogin, models: S.data?.models });
const insights = (tab) => openInsights({ h, toLogin, post, toast }, INSIGHT_TABS, tab);
function setMode(m) {
  if (isDesk() && S.openId) location.hash = "#/"; // a tab always shows its view in the right pane: leave the open chat
  if (S.mode === m) return;
  S.mode = m; store("ko.mode", m);
  if (m !== "all") tap(m === "list" ? "today" : m);
  officeSig = "";
  $("#list-scroll")?.scrollTo(0, 0); $("#view-scroll")?.scrollTo(0, 0);
  renderTop(); buildCapsule(); renderList();
  $("#app").dataset.mode = m;
}
/** The "Last 24 h / All history" switch: desktop only, in the Today list header (it only changes that list). */
function scopeSwitch() {
  return h("div", { class: "sg desk-only scope-sg", role: "group", "aria-label": "Scope" },
    h("button", { "aria-pressed": S.scope === "day", onclick: () => setScope("day") }, "Last 24 h"),
    h("button", { "aria-pressed": S.scope === "all", onclick: () => setScope("all") }, "All history"));
}
function setScope(s) { if (S.scope === s) return; S.scope = s; store("ko.scope", s); S.data = null; connectState(); renderAll(); }

// ---------- tour ----------
let tourApi = null;
const tourCount = () => (S.data?.needs || []).filter((n) => !n.held && !laterActive(n.id)).length;
function startTour() {
  tourApi = openTour({ h, getNeeds: () => S.data?.needs || [], answer, live, openThread, toast, isLater: (n) => laterActive(n.id) });
}

let capInput; // desktop only now: the phone search lives in the sheet (tabbar.js)
let tabSig = "";
/** Phone bottom tab bar (replaces the old capsule). Rebuilt only when the active tab or the Today dot changes. */
function buildCapsule() {
  const dot = dotOf(buddies.vms(), S.data ? queueNow().length : 0), sig = barSig(S.mode, S.openId, dot, S.updateReady);
  if (sig === tabSig && $("#capw")?.firstChild) return;
  tabSig = sig;
  fill($("#capw"), buildBar({ h, mode: S.mode, openId: S.openId, dot, update: !!S.updateReady, setMode, openMore: () => openMenu() }));
}
/** The phone's one way to change the filter: same S.filter and the same renderList as the desktop box. */
function applyFilter(v) {
  S.filter = String(v || "").toLowerCase();
  const top = document.getElementById("topsearch"); if (top && top.value !== v) top.value = v;
  renderChipNow(); renderList();
}
function renderChipNow() { const el = $("#fchip"); if (el) renderChip({ h, el, filter: S.filter, clear: () => applyFilter(""), open: openPhoneSearch }); }
function openPhoneSearch() { openSearch({ h, getFilter: () => S.filter, setFilter: applyFilter, voiceButton, toast }); }

function menuProjects() { const n = projectsOf(S.data); if (S.focus && !n.includes(S.focus)) n.unshift(S.focus); return n; }
/** Phone menu (also works on desktop): a small sheet with the things that do not fit in the capsule. */
let menuFrom = null; // the control that opened the Menu: a sheet opened from a Menu item returns focus there on Esc (the item itself is gone)
function openMenu() {
  if (document.querySelector(".mn-wrap")) return;
  const from = document.activeElement;
  const close = () => { wrap.remove(); removeEventListener("keydown", onKey, true); };
  const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
  const item = (label, fn) => h("button", { class: "np-btn mn-item", onclick: (e) => { menuFrom = from; close(); try { fn(e); } finally { menuFrom = null; } } }, label);
  const groups = menuGroups(S.flags);
  if (!isDesk()) for (const k of ["shortcuts", "more"]) groups[k] = groups[k].filter((f) => f.key !== "map" && f.key !== "office"); // the phone tab bar already has these two
  const menuLabel = (f) => (f.key === "stop-today" && S.stop?.stopped ? "Resume (turn automations back on)" : f.label);
  const wrap = h("div", { class: "np-wrap mn-wrap", role: "dialog", "aria-modal": "true", "aria-label": "Menu", onclick: (e) => { if (e.target === wrap) close(); } },
    h("div", { class: "np-card" },
      h("div", { class: "np-head" }, h("strong", {}, "Menu"), h("button", { class: "np-x", "aria-label": "Close", onclick: close }, "×")),
      h("div", { class: "mn-list" },
        updateRow(),
        h("label", { class: "mn-focus" }, h("span", {}, "Focus on a project"),
          h("span", { class: "sel-wrap" }, h("select", { "aria-label": "Focus on a project", onchange: (e) => { setFocus(e.target.value); close(); } },
            h("option", { value: "", selected: !S.focus }, "All projects"), menuProjects().map((n) => h("option", { value: n, selected: n === S.focus }, n)))),
          S.focus ? h("button", { class: "np-btn", onclick: () => { setFocus(""); close(); } }, "Clear focus") : null),
        item("New thread", () => startNewThread()),
        item("Providers: what T3 knows about each AI", () => openProviders({ h, toLogin })),
        item("Tour: go through what waits on you", () => startTour()),
        !groups.more.some((f) => f.key === "notifications") ? item("Notifications", () => openFeature("notifications")) : null,
        isMain(S.flags, "google") ? item("Life: mail, calendar and Drive", () => openFeature("life")) : null,
        isDesk() ? item("Keyboard shortcuts", () => openKeysHelp()) : null,
        groups.shortcuts.length ? h("div", { class: "mn-sec" }, "Shortcuts") : null,
        groups.shortcuts.map((f) => item(menuLabel(f), () => openFeature(f.key))),
        groups.more.length ? h("div", { class: "mn-sec" }, "More") : null,
        groups.more.map((f) => item(menuLabel(f), () => openFeature(f.key))),
        item("Features: choose what stays on the main screen", () => featuresScreen()),
        whoKind === "session" ? item("Log out", (e) => logout(e)) : null)));
  addEventListener("keydown", onKey, true);
  document.body.append(wrap);
}

// ---------- brief ----------
async function loadBrief(kind) {
  const b = S.brief[kind];
  if (b && Date.now() - b.at < 120000) return;
  try {
    const r = await fetch("/api/brief?kind=" + kind);
    if (r.status === 401) return toLogin();
    if (!r.ok) return;
    S.brief[kind] = { at: Date.now(), data: await r.json() };
    keep("brief." + kind, S.brief[kind].data);
    renderList(); refreshBriefSheet();
  } catch { /* offline: no card */ }
}
/** The Sunday weekly review (server builds it from the week's journal, decisions, hours, usage and skills). Cached for 5 minutes. */
async function loadWeek() {
  if (S.week && Date.now() - S.week.at < 300000) return;
  S.week = { at: Date.now(), data: S.week?.data || null }; // stamp first so a slow answer is not asked for twice
  try {
    const r = await fetch("/api/brief?kind=weekly");
    if (r.status === 401) return toLogin();
    if (!r.ok) { S.week.at = 0; return; }
    S.week = { at: Date.now(), data: await r.json() };
    keep("brief.weekly", S.week.data);
    renderList(); refreshBriefSheet();
  } catch { S.week.at = 0; /* offline: no card */ }
}
// The home shows ONE line per brief (tap = a bottom sheet with the full text). The week line shows on Sundays; any other day it opens from More.
const weekOnHome = () => main("weekly") && isSunday();
let sheetCtl = null;
function showSheet(kind) {
  if (kind === "week") loadWeek(); else loadBrief(kind);
  const data = () => (kind === "week" ? S.week?.data : S.brief[kind]?.data) || null;
  sheetCtl = openBriefSheet({ h }, kind, data(), { onClose: () => { sheetCtl = null; } });
  S.sheetKind = kind;
}
/** The home's brief and week lines. Morning before noon, evening wrap after; the sheet can be opened for either from More. */
function briefLines() {
  const out = [];
  if (main("brief")) {
    const kind = new Date().getHours() < 12 ? "morning" : "evening";
    loadBrief(kind);
    out.push(briefLine({ h }, kind, summaryText(S.brief[kind]?.data, kind === "morning" ? "Morning brief" : "Evening wrap"), () => { tap("brief"); showSheet(kind); }));
  }
  if (weekOnHome()) { loadWeek(); out.push(briefLine({ h }, "week", summaryText(S.week?.data, "Week in review"), () => showSheet("week"))); }
  return out;
}
/** A fresh answer arrived while its sheet is open: fill the sheet in. */
function refreshBriefSheet() {
  if (!sheetCtl) return;
  const k = S.sheetKind, data = k === "week" ? S.week?.data : S.brief[k]?.data;
  if (data) sheetCtl.update(data);
}

// ---------- banners: T3 update watcher ----------
/** /api/t3/health: the version Kemino last checked and, after a T3 update, the result of the read-only self-check. */
async function loadHealth() {
  try {
    const r = await fetch("/api/t3/health");
    if (r.status === 401) return toLogin();
    if (r.ok) { S.health = await r.json(); keep("health", S.health); renderBanners(); }
  } catch { /* offline: keep the last banner */ }
}
/** /api/stop-today: is "Stop for today" on, what it paused, how many threads are still running. */
async function loadStop() {
  try {
    const r = await fetch("/api/stop-today");
    if (r.status === 401) return toLogin();
    if (r.ok) { S.stop = await r.json(); keep("stop", S.stop); renderBanners(); if ($("#top")) renderTop(); }
  } catch { /* offline: keep the last banner */ }
}
const stopDeps = () => ({ h, post, toast, toLogin, onChange: loadStop });
const openStop = () => openStopToday(stopDeps(), S.stop?.stopped ? "resume" : "stop");
function renderBanners() {
  const el = $("#banners");
  if (!el) return;
  const nodes = bannerNodes({ h }, { health: S.health, dismissedHealth: store("ko.t3dismiss"), stop: S.stop, unconfirmed: S.unconfirmed.filter((u) => !u.inline) }, {
    recheck: (id, e) => recheck(id, e), sendAgain: (id, e) => sendAgain(id, e), dismissUnconfirmed: (id) => { S.unconfirmed = S.unconfirmed.filter((x) => x.id !== id); renderBanners(); },
    dismissHealth: () => { store("ko.t3dismiss", S.health?.banner || ""); renderBanners(); },
    resume: () => openStopToday(stopDeps(), "resume"),
  });
  el.replaceChildren(...nodes.filter((k) => k != null && k !== false));
}

// ---------- hours meter ----------
/** /api/hours: this week's active hours per day (from your own message times). A failure keeps the last row. */
async function loadHours() {
  try {
    const r = await fetch("/api/hours");
    if (r.status === 401) return toLogin();
    if (r.ok) { const j = await r.json(); S.hours = j; keep("hours", j); if (S.mode === "list") renderList(); }
  } catch { /* offline or not available: no row */ }
}

// ---------- usage strip ----------
/** One dot + "% left" per AI plan, from /api/usage (server caches 60 s). Never blocks: a failure just keeps the last strip. */
async function loadUsage() {
  try {
    const r = await fetch("/api/usage");
    if (r.status === 401) return toLogin();
    if (r.ok) { S.usage = await r.json(); keep("usage", S.usage); fillBuddyRow(); }
  } catch { /* offline: keep the last strip */ }
}
/** The quiet "Tidied N finished helpers · Undo" line (24 h). Read-only GET; a failure keeps the last line. */
async function loadTidyAuto() {
  try {
    const r = await fetch("/api/tidy/auto");
    if (r.ok) { const j = await r.json(); if (JSON.stringify(j) !== JSON.stringify(S.tidyAuto)) { S.tidyAuto = j; renderList(); } }
  } catch { /* offline: keep the last line */ }
}
async function undoTidyLine(batch, e) {
  try { const r = await post("/api/tidy/undo", { batch, confirm: true }, e); toast("Brought back " + (r.restored || 0)); } catch (err) { toast(err.message, true); }
  await loadTidyAuto();
}
// The quiet Life line under the decision card: "2 need you · next: Sat 09:00 Dentist". Only while the Google switch is on and connected; tap opens Life.
const LIFE = { line: "", at: 0, busy: false };
async function lifeGet(path) { const r = await fetch(path); if (r.status === 401) { toLogin(); throw new Error("Logged out."); } return { ok: r.ok, status: r.status, j: await r.json().catch(() => ({})) }; }
function lifeLine_() {
  if (!isMain(S.flags, "google")) { LIFE.line = ""; return null; }
  if (!LIFE.busy && Date.now() - LIFE.at > 5 * 60_000) {
    LIFE.busy = true;
    lifeSummary(lifeGet).then((l) => { const changed = l !== LIFE.line; LIFE.line = l; LIFE.at = Date.now(); LIFE.busy = false; if (changed) renderList(); }).catch(() => { LIFE.busy = false; LIFE.at = Date.now(); });
  }
  return LIFE.line ? h("button", { class: "lifeline", type: "button", "data-act": "life-line", title: "Open Life", onclick: () => openFeature("life") }, h("span", {}, LIFE.line), h("span", { class: "lifeline-go", "aria-hidden": "true" }, "›")) : null;
}
const tidyLine_ = () => tidyLine({ h, auto: S.tidyAuto, undo: undoTidyLine });
/** The buddies: one face per AI with its state and "% left" (they replaced the usage chips). Two rows share the same five nodes' states: #buddy-row under the Today title, #buddy-top in the Mac top bar. */
const buddies = createBuddies({ h, openThread: (id) => openThread(id), lastHeard: () => S.data?.lastHeard || S.data?.lastSeen || 0 });
// All threads (the 4th view): the list and its snippets come from /api/threads (allthreads.js). It shares the Filter box and the chat pane with Today.
const allView = createAllThreads({ h, contextBadge, aiFace, whoTag, badge, ago, openThread: (id) => openThread(id), toLogin: () => toLogin(), getSel: () => S.sel, getHeadId: () => S.data?.headId, getFilter: () => S.filter,
  setFilter: (v) => applyFilter(v), rerender: () => { if (S.mode === "all") renderList(); } });
function mountBuddies() { buddies.mount("home", document.getElementById("buddy-row")); buddies.mount("top", document.getElementById("buddy-top")); buddies.mount("rail", document.getElementById("buddy-rail")); }
function fillBuddyRow() { buddies.update({ usage: S.usage, data: S.data }); mountBuddies(); }
// ---------- Today ----------
const matches = (...s) => !S.filter || s.some((x) => String(x || "").toLowerCase().includes(S.filter));

/** A thread waiting on a T3 secret request (request_secret): explains where to enter it. No input here: the value is typed in T3 only and never reaches Kemino. */
const secretLink = (threadId) => { const env = S.data && S.data.t3EnvId; return env && threadId ? "t3-thread://v2/" + env + "/" + threadId : null; };
function secretNote(sec, threadId) {
  // One tap to T3 AT THIS THREAD: T3's deep link t3-thread://v2/<environment>/<thread>; the value itself is typed in T3 only.
  const link = secretLink(threadId);
  const copy = (e) => { e.stopPropagation(); try { navigator.clipboard.writeText(link); toast("Link copied. Paste it into T3."); } catch { /* no clipboard: the Open button still works */ } };
  return h("div", { class: "secret-note", role: "note" },
    h("div", { class: "cmd" }, "This thread needs a secret: " + (sec && sec.label ? sec.label : "a secret")),
    sec && sec.reason ? h("p", { class: "hint" }, sec.reason) : null,
    link ? h("div", { class: "acts" }, h("a", { class: "b y", href: link, onclick: (e) => e.stopPropagation() }, "Open this thread in T3"), h("button", { class: "b", onclick: copy }, "Copy link")) : null,
    h("p", { class: "hint" }, "Enter it in T3 (the secret box on this thread). Kemino never sees, takes or stores it."));
}
function needCard(n, selected, ctx = {}) {
  const sending = S.sending.has(n.id), conf = S.confirming.get(n.id);
  const q = n.kind === "question";
  const canAct = live() && n.requestId && !n.held;
  const open = () => openThread(n.id);
  const later = ctx.sheet ? (e) => { setLater(n.id, true, e); closeSheet(); } : (e) => setLater(n.id, true, e); // from the office sheet, "Later" also closes it
  const card = h("div", { class: "need" + (selected ? " sel" : "") + (n.held ? " held" : ""), "data-id": n.id, role: "group", "aria-label": tt(n.id, n.title) },
    h("h3", {}, badge("needs-you"), h("span", { class: "grow" }, tn(n.id, n.title)), h("span", { class: "age" }, ago(n.since))),
    n.chain.length > 1 ? h("div", { class: "ch" }, n.chain.map((c) => tt(c.id, c.title)).join("  ›  ")) : h("div", { class: "ch" }, n.project + (n.secret ? " · needs a secret" : q ? " · asks a question" : " · wants permission")),
    n.secret ? secretNote(n.secret, n.id) : null,
    n.detail && !n.secret ? h("div", { class: "cmd" }, n.detail.slice(0, 700)) : null,
    n.risky ? h("div", { class: "risk" }, "Risky: " + n.riskKinds.join(", ")) : null,
    n.held ? h("p", { class: "hint" }, "Answered. Waiting for the agent to move on.") : S.remembering.has(n.id) ? h("div", { class: "confirm" }, h("p", {}, "Always say yes to this exact command in " + (n.project || "this project") + "? Anything different still asks you. You can remove it under Decisions."),
      h("div", { class: "acts" }, h("button", { class: "b y", disabled: sending, onclick: (e) => { e.stopPropagation(); answer(n, "accept", e, false, true); } }, "Yes, always allow"),
        h("button", { class: "b", onclick: (e) => { e.stopPropagation(); S.remembering.delete(n.id); renderAll(); } }, "Cancel")))
      : conf ? h("div", { class: "confirm" }, h("p", {}, "This will " + conf.join(" and ") + ". Run it?"),
      h("div", { class: "acts" }, h("button", { class: "b danger y", disabled: sending, onclick: (e) => { e.stopPropagation(); answer(n, "accept", e, true); } }, "Yes, run it"),
        h("button", { class: "b", onclick: (e) => { e.stopPropagation(); S.confirming.delete(n.id); renderAll(); } }, "Cancel")))
      : h("div", { class: "acts" },
        q || n.secret ? h("button", { class: "b y", onclick: (e) => { e.stopPropagation(); open(); } }, "Open chat")
          : h("button", { class: "b y", disabled: !canAct || sending, onclick: (e) => { e.stopPropagation(); answer(n, "accept", e); } }, sending ? "Sending" : n.risky ? "Review" : "Yes", h("kbd", {}, "Y")),
        q || n.secret ? null : h("button", { class: "b", disabled: !canAct || sending, onclick: (e) => { e.stopPropagation(); answer(n, "decline", e); } }, "No", h("kbd", {}, "N")),
        h("button", { class: "b m", onclick: (e) => { e.stopPropagation(); later(e); } }, "Later", h("kbd", {}, "L")),
        !q && n.rememberable && !n.risky ? h("button", { class: "b m always", disabled: !canAct || sending, title: "Say yes to this exact command in this project from now on", onclick: (e) => { e.stopPropagation(); S.remembering.add(n.id); renderAll(); } }, "Always allow here") : null),
  );
  if (!ctx.sheet) { card.addEventListener("click", open); }
  return card;
}

const isLive = (st) => st !== "done";
function kidRow(k) {
  return h("button", { class: "kid" + (k.status === "needs-you" ? " hot" : ""), "data-id": k.id, onclick: () => openThread(k.id) },
    badge(k.status, 16), aiFace(k.model, "sm"),
    h("span", { class: "mid" }, h("b", { class: "nm" }, k.depth > 1 ? "› ".repeat(k.depth - 1) + tt(k.id, k.title) : tn(k.id, k.title)), h("small", {}, [whoTag(k.model), ago(k.activityAt)].filter(Boolean).join(" · ")), contextBadge(k.context)));
}
/** Helpers of one thread, inline: the ones still active, then ONE folded line for the finished ones (tap to list them). */
function helperRows(g) {
  const active = g.helpers.filter((k) => isLive(k.status)), finished = g.helpers.length - active.length;
  const shown = active.slice(0, 12), listDone = S.doneKids.has(g.id);
  return h("div", { class: "kids" }, shown.map(kidRow),
    active.length > shown.length ? h("div", { class: "more" }, "+" + (active.length - shown.length) + " more helpers") : null,
    finished ? h("button", { class: "kid fold-done", "data-act": "done-helpers", "aria-expanded": listDone, onclick: () => { S.doneKids.has(g.id) ? S.doneKids.delete(g.id) : S.doneKids.add(g.id); renderList(); } },
      h("span", { class: "plus", "aria-hidden": "true" }, listDone ? "–" : "+"), h("span", { class: "mid" }, h("b", { class: "nm" }, finished + " done " + (finished === 1 ? "helper" : "helpers")), h("small", {}, listDone ? "tap to fold" : "folded · tap to list"))) : null,
    listDone ? g.helpers.filter((k) => !isLive(k.status)).slice(0, 40).map(kidRow) : null);
}

function groupRow(g, selected, forceOpen = false) {
  const n = g.helpers.length, open = forceOpen || S.expanded.has(g.id), c = g.counts || {};
  const line2 = [g.project, whoTag(g.model), ago(g.activityAt)];
  if (g.status === "stalled") line2.push(g.reason); else if (g.status === "failed" && g.reason) line2.push(plainCause(g.reason).text); // raw error text only inside the thread itself
  const line3 = n ? h("small", { class: "h" }, n + (n === 1 ? " helper" : " helpers"), " · " + (c.working || 0) + " working · ", h("span", { class: c.failed ? "bad" : "" }, (c.failed || 0) + " failed"), c.stalled ? " · " + c.stalled + " stalled" : "", c["needs-you"] ? " · " + c["needs-you"] + " ask" : "") : h("small", { class: "h" }, "no helpers");
  const row = h("div", { class: "row" + (selected ? " sel" : "") + (open ? " open" : ""), "data-id": g.id, role: "button", tabindex: "0", onclick: () => openThread(g.id),
    onkeydown: (e) => { if (e.key === "Enter" && e.target === row) openThread(g.id); } },
    badge(g.status, 22), aiFace(g.model),
    h("div", { class: "mid" }, h("b", {}, tn(g.id, g.title)), h("small", {}, line2.filter(Boolean).join(" · ")), contextBadge(g.context), line3),
    n && !forceOpen ? h("button", { class: "fold", "aria-expanded": open, "aria-label": (open ? "Hide" : "Show") + " helpers of " + tt(g.id, g.title), onclick: (e) => { e.stopPropagation(); toggleFold(g.id); } }, ICONS.chev(16)) : null);
  return h("div", { class: "grp" + (open ? " open" : "") }, row, n && open ? helperRows(g) : null);
}
function toggleFold(id) { S.expanded.has(id) ? S.expanded.delete(id) : S.expanded.add(id); store("ko.expanded", [...S.expanded].slice(-60)); renderList(); }
function toggleDone() { S.doneOpen = !S.doneOpen; store("ko.doneopen", S.doneOpen); renderList(); }
/** "Done today", folded to one line: how many, and per project. Tap to list them. */
function doneFold(done, scope) {
  const open = S.doneOpen || !!S.filter, per = {};
  for (const g of done) per[g.project || "other"] = (per[g.project || "other"] || 0) + 1;
  const where = Object.entries(per).sort((a, b) => b[1] - a[1]).map(([p, k]) => p + " " + k).join(" · ");
  return h("div", { class: "dn" + (open ? " open" : "") },
    h("button", { class: "dn-h", "data-act": "done-fold", "aria-expanded": open, onclick: toggleDone },
      h("span", { class: "tx" }, h("b", {}, scope === "all" ? "Finished" : "Done today", h("em", {}, done.length || "")), h("small", {}, done.length ? where : "Nothing finished in this window.")),
      done.length ? h("span", { class: "fold" }, ICONS.chev(16)) : null),
    open && done.length ? done.map((g) => groupRow(g, S.sel === g.id)) : null);
}

function flatIds() {
  if (S.mode === "all") return allView.ids();
  const d = fd(); if (!d) return [];
  return [...visibleNeeds().map((n) => n.id), ...d.working.filter((g) => matches(g.title, g.project)).map((g) => g.id), ...d.done.filter((g) => matches(g.title, g.project)).map((g) => g.id)];
}
// ---- one question at a time: ONE card in front; the rest is a count (the Mac can list them behind "Show all") ----
const laterMap = () => { const m = { ...S.later }; for (const n of S.data?.needs || []) { const u = laterUntil(n.id); if (u) m[n.id] = u; } return m; };
const queueNow = () => queueItems(fd(), { later: laterMap(), answered: S.answered, dismissed: S.dismissed, match: matches });
const showAllOn = () => isDesk() && S.showAll;
const shownQueue = () => { const q = splitQueue(queueNow(), showAllOn()); return q.front ? [q.front, ...q.rest] : []; };
const visibleNeeds = () => shownQueue().filter((i) => i.need).map((i) => i.need);
function toggleShowAll() { S.showAll = !S.showAll; store("ko.showall", S.showAll); renderList(); }
function dismissFail(g) {
  S.dismissed[g.id] = g.activityAt;
  trimDismissed(); renderList();
}
function trimDismissed() {
  const keys = Object.keys(S.dismissed); if (keys.length > 200) for (const k of keys.slice(0, keys.length - 200)) delete S.dismissed[k];
  store("ko.dismissed", S.dismissed);
}
/** A failed thread that blocks work, as a card in the same queue: open it, put it off, or mark it seen. */
function failCard(it, selected) {
  const g = it.group;
  const card = h("div", { class: "need fail" + (selected ? " sel" : ""), "data-id": g.id, "data-kind": "failed", role: "group", "aria-label": tt(g.id, g.title) },
    h("h3", {}, badge("failed"), h("span", { class: "grow" }, tn(g.id, g.title)), h("span", { class: "age" }, ago(g.activityAt))),
    h("div", { class: "ch" }, [g.project, "failed", g.reason ? plainCause(g.reason).text : ""].filter(Boolean).join(" · ")),
    h("div", { class: "acts" },
      h("button", { class: "b y", onclick: (e) => { e.stopPropagation(); openThread(g.id); } }, "Open chat"),
      h("button", { class: "b m", onclick: (e) => { e.stopPropagation(); setLater(g.id, true, e); } }, "Later"),
      h("button", { class: "b m", "data-act": "seen", title: "I know about this one", onclick: (e) => { e.stopPropagation(); dismissFail(g); } }, "Seen")));
  card.addEventListener("click", () => openThread(g.id));
  return card;
}
/** Retry later: the work queue starts NEW threads from a written message and cannot re-run a failed one, so the group is hidden until the failing AI's next reset instead. */
function retryFailGroup(it) {
  const until = retryUntil(it.cause, S.usage, Date.now());
  for (const g of it.threads) S.later[g.id] = until;
  store("ko.later", S.later); toast("Hidden until " + untilClock(new Date(until).toISOString()) + ". It comes back then."); renderList();
}
function dismissFailGroup(it) {
  for (const g of it.threads) S.dismissed[g.id] = g.activityAt;
  trimDismissed(); renderList();
}
/** Several failures with the same cause as ONE card: "15 failed, Codex hitting its usage limit". */
function failGroupCard(it) {
  const open = S.openFailGroups.has(it.id), projects = [...new Set(it.threads.map((g) => g.project).filter(Boolean))];
  const card = h("div", { class: "need fail group", "data-id": it.id, "data-kind": "failgroup", role: "group", "aria-label": failGroupTitle(it) },
    h("h3", {}, badge("failed"), h("span", { class: "grow" }, failGroupTitle(it)), h("span", { class: "age" }, ago(it.since))),
    h("div", { class: "ch" }, projects.slice(0, 3).join(", ") + (projects.length > 3 ? " +" + (projects.length - 3) : "")),
    h("div", { class: "acts" },
      h("button", { class: "b y", "data-act": "fg-list", "aria-expanded": open, onclick: (e) => { e.stopPropagation(); open ? S.openFailGroups.delete(it.id) : S.openFailGroups.add(it.id); renderList(); } }, open ? "Hide list" : "Open list"),
      h("button", { class: "b m", "data-act": "fg-retry", title: "Hide until the AI's limit resets", onclick: (e) => { e.stopPropagation(); retryFailGroup(it); } }, "Retry later"),
      h("button", { class: "b m", "data-act": "fg-dismiss", title: "I know about these", onclick: (e) => { e.stopPropagation(); dismissFailGroup(it); } }, "Dismiss")),
    open ? h("ul", { class: "fg-list" }, it.threads.map((g) => h("li", {}, h("button", { class: "fg-row", "data-id": g.id, onclick: (e) => { e.stopPropagation(); openThread(g.id); } }, h("b", {}, tn(g.id, g.title)), h("small", {}, [g.project, ago(g.activityAt)].filter(Boolean).join(" · ")))))) : null);
  return card;
}
const queueCard = (it, sel) => (it.kind === "failgroup" ? failGroupCard(it) : it.kind === "failed" ? failCard(it, sel === it.id) : needCard(it.need, sel === it.id));

function toggleMapNode(id) {
  if (S.mapToggled.has(id)) S.mapToggled.delete(id); else S.mapToggled.add(id);
  store("ko.map", [...S.mapToggled].slice(-200));
  officeSig = ""; renderList();
}
function renderMapView(el, d) {
  const model = mapModel(d, { toggled: S.mapToggled, match: matches });
  const dir = readDir(localStorage);
  const sig = JSON.stringify([model, d.scope, d.stale, dir, matchMedia("(max-width: 700px)").matches]);
  if (sig === officeSig) return; // nothing visible changed: keep the drawing and the scroll position
  officeSig = sig;
  const c = model.counts, bits = [c["needs-you"] && c["needs-you"] + " need you", c.working && c.working + " working", c.failed && c.failed + " failed"].filter(Boolean);
  fill(el,
    h("div", { class: "title" }, h("h1", {}, "Map"), focusChip()),
    h("p", { class: "sub" }, [bits.length ? bits.join(" · ") : "Nothing running", "finished work is folded", d.stale ? "showing last saved data" : null].filter(Boolean).join(" · ")),
    model.empty ? h("div", { class: "map" }, h("div", { class: "clear" }, h("b", {}, "The map is empty"), "Threads appear here when agents have worked in this window.")) : mapBlock(model, { dir, narrow: matchMedia("(max-width: 700px)").matches, open: openThread, toggle: toggleMapNode, setDir: (v) => { writeDir(localStorage, v); officeSig = ""; renderList(); } }),
    h("div", { class: "foot" }, "Tap a card to open its chat. Drag to move, pinch to zoom. ", h("button", { onclick: () => setMode("list") }, "Open the list")));
}

let officeSig = "";
function renderOfficeView(el, d) {
  const model = officeModel(d, matches);
  const asks = askList(model);
  // Somebody new asks for You: zoom to them (once per ask). Not while a sheet is open or the page is in the background.
  const fresh = asks.filter((id) => !S.spotSeen.has(id));
  S.spotSeen = new Set(asks); // forget workers who stopped asking, so a second ask zooms again
  if (S.spot && !asks.includes(S.spot) && S.spot !== sheetOpenId()) S.spot = null;
  let scroll = S.spotScroll || null; S.spotScroll = null;
  if (fresh.length && !sheetOpenId() && !document.hidden) { S.spot = fresh[0]; scroll = fresh[0]; }
  const sig = JSON.stringify([model, d.scope, d.stale, d.done.length, S.spot, isDesk()]);
  if (sig === officeSig) return; // nothing visible changed: keep the drawing (and the animations) as is
  officeSig = sig;
  const busy = model.rooms.reduce((n, r) => n + r.counts.working, 0);
  const pos = asks.indexOf(S.spot), who = model.rooms.flatMap((r) => r.nodes).find((n) => n.id === S.spot);
  const askbar = asks.length ? h("div", { class: "askbar", role: "group", "aria-label": "Workers who need you" },
    h("button", { class: "os-arrow", "data-act": "ask-prev", "aria-label": "Previous worker who needs you", title: "Previous who needs you", onclick: () => gotoAsk(-1) }, "‹"),
    h("span", { class: "askbar-t" }, h("b", {}, pos >= 0 ? (pos + 1) + " of " + asks.length + " need you" : asks.length + " need you"), who ? h("small", {}, tt(who.id, who.title)) : h("small", {}, "tap › to jump to the first")),
    h("button", { class: "os-arrow", "data-act": "ask-next", "aria-label": "Next worker who needs you", title: "Next who needs you", onclick: () => gotoAsk(1) }, "›")) : null;
  fill(el,
    h("div", { class: "title" }, h("h1", {}, "Office"), focusChip()),
    h("p", { class: "sub" }, [asks.length ? asks.length + " need you" : "Nobody needs you", busy ? busy + " at work" : null, d.stale ? "showing last saved data" : null].filter(Boolean).join(" · ")),
    askbar,
    h("div", { class: "office" }, model.rooms.length ? renderOfficeLayout(model, openOfficeSheet, S.spot, (id) => { if (!scrollToWorker(el, id)) openOfficeSheet(id); }) : h("div", { class: "clear" }, h("b", {}, "The office is empty"), "Rooms appear when agents are working.")),
    h("div", { class: "foot" }, model.doneCount + " finished " + (d.scope === "all" ? "in history" : "today") + ", not drawn. ", h("button", { onclick: () => setMode("list") }, "Open the list")));
  if (scroll) requestAnimationFrame(() => scrollToWorker(el, scroll));
}

// ---------- office: zoom to the asking worker + the mini chat sheet ----------
let asksCache = { src: null, focus: "", filter: "", ids: [] };
function currentAsks() {
  const d = fd(); if (!d) return [];
  if (asksCache.src !== d || asksCache.filter !== S.filter) asksCache = { src: d, focus: S.focus, filter: S.filter, ids: askList(officeModel(d, matches)) };
  return asksCache.ids;
}
/** Zoom + highlight one worker in the office (and scroll to it). */
function setSpot(id, scroll = true) {
  S.spot = id; S.spotScroll = scroll ? id : null; officeSig = "";
  if (S.mode === "office") renderList();
}
/** The "next" arrow: the next worker who needs You, round and round. If the sheet is open it moves to that worker. */
function gotoAsk(dir) {
  const next = stepAsk(currentAsks(), sheetOpenId() || S.spot, dir);
  if (!next) return;
  S.sel = next;
  setSpot(next, true);
  if (sheetOpenId()) openOfficeSheet(next);
}
const headOfThread = (id) => {
  const d = S.data; if (!d) return null;
  const hit = [...d.working, ...d.done].flatMap((g) => [g, ...g.helpers]).find((t) => t.id === id) || d.needs.find((n) => n.id === id);
  return hit ? { title: hit.title, status: d.needs.some((n) => n.id === id && !n.held) ? "needs-you" : hit.status, project: hit.project } : null;
};
function sheetNeed(id, chat) {
  const n = S.data?.needs.find((x) => x.id === id);
  if (n) return n;
  const pend = chat?.pending;
  // The live state is the truth: once it no longer lists the ask (answered), a not-yet-refreshed chat must not bring it back.
  if (!S.data && pend && pend.kind === "permission" && chat.head?.id === id) return { id, requestId: pend.requestId, risky: pend.risky, riskKinds: pend.riskKinds, rememberable: pend.rememberable, detail: pend.detail, kind: pend.kind, title: chat.head.title, chain: chat.head.chain, rootId: "", project: chat.head.project, since: Date.parse(pend.createdAt), held: false };
  return null;
}
const sheetDeps = () => ({
  h, post, toast, toLogin, badge, ago, live,
  cachedChat: (id) => S.chats.get(id) || null,
  headOf: headOfThread,
  needFor: sheetNeed,
  needCard,
  voice: (field, after) => voiceButton({ h, toast }, field, after),
  asks: currentAsks,
  stateKey: (id) => [S.sending.has(id), S.confirming.get(id) || null, S.remembering.has(id), laterActive(id)],
  goto: gotoAsk,
  openFull: (id) => { closeSheet(); openThread(id); },
  onClose: () => { renderAll(); },
});
function openOfficeSheet(id) {
  S.sel = id; S.spot = id; officeSig = "";
  openSheet(sheetDeps(), id);
  renderList();
}

/** "Focus: my-project ×" under the page title while a focus is on (phone and desktop). */
function focusChip() {
  return S.focus ? h("button", { class: "focus-chip", "aria-label": "Clear focus on " + S.focus, title: "Show all projects", onclick: () => setFocus("") }, "Focus: " + S.focus, ICONS.x(10)) : null;
}

/** "Sat 7 Nov": built by hand so the comma some browsers add never shows. */
function todayDate() { try { const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).formatToParts(new Date()).map((x) => [x.type, x.value])); return p.weekday + " " + p.day + " " + p.month; } catch { return ""; } }

// ---------- desktop: the left strip (always) + the chosen view on the right ----------
function toggleRail() {
  S.rail = !S.rail; writeCollapsed(S.rail);
  $("#app").dataset.rail = S.rail ? "collapsed" : "open";
  renderList();
  requestAnimationFrame(() => document.querySelector(S.rail ? "[data-act=rail-expand]" : "[data-act=rail-collapse]")?.focus());
}
/** The strip, top to bottom: buddies (usage + the one pace line), his ONE decision card (the rest as "+N waiting"), then the thread list. */
function renderRail(d) {
  const el = $("#list");
  if (S.rail) { fill(el, collapsedRail({ h, vms: buddies.vms(), needCount: d ? queueNow().length : 0, expand: toggleRail, openSheet: (id) => buddies.openSheet(id) })); return; }
  const toggle = h("button", { class: "rail-toggle", type: "button", "data-act": "rail-collapse", "aria-expanded": "true", "aria-label": "Collapse the side strip", title: "Collapse the side strip", onclick: toggleRail }, "\u2039");
  const pace = paceLine(S.usage);
  const head = [h("div", { class: "rail-top" }, h("div", { class: "todaymeta", id: "todaymeta" }), toggle),
    pace ? h("div", { class: "pace " + pace.tone, role: "status", "data-act": "pace" }, pace.tone === "amber" ? h("span", { class: "pace-i", "aria-hidden": "true" }, "\u25B2") : null, pace.text) : null];
  if (!d) { fill(el, head, h("div", { class: "skel" }), h("div", { class: "skel" })); mountBuddies(); refreshMeta(); return; }
  const queue = queueNow(), q = splitQueue(queue, showAllOn()), snoozed = d.needs.filter((n) => laterActive(n.id));
  const working = d.working.filter((g) => matches(g.title, g.project)), done = d.done.filter((g) => matches(g.title, g.project));
  const sel = S.sel, newsLine_ = freshLine(S.news);
  fill(el, head,
    h("div", { class: "sec hot" }, h("span", { class: "sec-t" }, "Needs you"), queue.length ? h("span", { class: "n" }, queue.length) : null,
      S.news.pending ? h("span", { class: "newsb", "data-act": "news-badge", title: "News from your helpers is held until you answer" }, S.news.pending + " news") : null,
      q.waiting ? h("button", { "data-act": "show-all", "aria-pressed": S.showAll, title: "List every card that is waiting", onclick: toggleShowAll }, S.showAll ? "Show one" : "Show all") : null,
      snoozed.length ? h("button", { onclick: () => { S.showLater = !S.showLater; renderList(); } }, (S.showLater ? "Hide" : "Later") + " (" + snoozed.length + ")") : null),
    newsLine_ ? h("div", { class: "newsline", "data-act": "news-line", role: "status" }, h("span", {}, newsLine_), h("button", { "aria-label": "Dismiss", onclick: () => { S.news = { ...S.news, line: "" }; renderList(); } }, ICONS.x(10))) : null,
    q.front ? queueCard(q.front, sel) : h("div", { class: "clear" }, h("b", {}, "You're clear"), "Nothing needs you."),
    hotCard({ h, usage: S.usage }), // running-hot nudge: directly under the decision card
    tidyLine_(),
    lifeLine_(),
    q.waiting && !S.showAll ? h("button", { class: "waiting", "data-act": "waiting", "aria-live": "polite", title: "Go through them one by one", onclick: startTour }, "+" + q.waiting + " waiting", ICONS.chev(14)) : null,
    q.rest.map((it) => queueCard(it, sel)),
    S.showLater ? snoozed.map((n) => h("div", { class: "row", "data-id": n.id }, badge("needs-you"), h("div", { class: "mid" }, h("b", {}, tn(n.id, n.title)), h("small", {}, "Later until " + untilClock(new Date(laterUntil(n.id)).toISOString()))), h("button", { class: "b m", onclick: (e) => setLater(n.id, false, e) }, "Wake now"))) : null,
    h("div", { class: "sec" }, "Working", h("span", { class: "n" }, working.length || "")),
    working.length ? working.map((g) => groupRow(g, sel === g.id)) : h("div", { class: "more" }, "No agents running right now."),
    doneFold(done, d.scope));
  mountBuddies(); refreshMeta();
}
/** The right pane when no chat is open: Office, Map, All threads, or on Home a calm Today summary in a ~720px column. */
function renderHomeView(el, d) {
  const queue = queueNow(), nWork = d.working.filter((g) => g.status === "working" || g.status === "stalled").length;
  const working = d.working.filter((g) => matches(g.title, g.project)), done = d.done.filter((g) => matches(g.title, g.project));
  const hgroups = working.filter((g) => g.helpers && g.helpers.length); // the working list itself is in the strip; only the helper rows live here
  const sub = [todayDate(), queue.length ? queue.length + " need you" : "Nothing needs you", nWork ? nWork + " working" : null, d.stale ? "showing last saved data" : null].filter(Boolean).join(" \u00b7 ");
  fill(el, h("div", { class: "home-col" },
    h("div", { class: "title" }, h("h1", {}, d.scope === "all" ? "All history" : "Today"), focusChip(), scopeSwitch()),
    h("p", { class: "sub", "data-act": "home-sub" }, sub),
    briefLines(),
    main("hours") || S.hoursOpen ? hoursRow({ h }, S.hours) : null,
    hgroups.length ? [h("div", { class: "sec" }, "Helpers at work", h("span", { class: "n" }, hgroups.length)), ...hgroups.map((g) => h("div", { class: "grp open" }, h("div", { class: "more hg-t" }, tn(g.id, g.title), " \u00b7 " + g.project), helperRows(g)))] : null,
    doneFold(done, d.scope), // one folded line like at 390: "Done today 5 . tap to show"
    h("div", { class: "foot" }, d.hiddenRoots ? d.hiddenRoots + " older or background threads hidden." : "Everything in this window is shown.",
      d.scope === "day" ? h("button", { onclick: () => setScope("all") }, "Show all history") : h("button", { onclick: () => setScope("day") }, "Back to last 24 h"))));
}
let topSig = "";
function renderDesk(d) {
  $("#app").dataset.rail = S.rail ? "collapsed" : "open";
  renderRail(d);
  // the tab counts follow the data: rebuild the top bar only when something it shows changed
  const sig = JSON.stringify([S.openId ? "" : S.mode, d ? queueNow().length : 0, buddies.vms().map((v) => v.running.length), allView.state.built?.total || 0, S.focus, S.conn, live(), !!S.stop?.stopped, deskOut()]);
  if (sig !== topSig) { topSig = sig; renderTop(); }
  if (S.openId) return; // the chat fills the right pane; the view underneath stays as it was
  const el = $("#view");
  if (S.mode === "office" && d) return renderOfficeView(el, d);
  if (S.mode === "map" && d) return renderMapView(el, d);
  officeSig = "";
  if (S.mode === "all") return allView.render(el);
  if (!d) { fill(el, h("div", { class: "home-col" }, h("div", { class: "title" }, h("h1", {}, "Today")), h("div", { class: "skel" }), h("div", { class: "skel" }))); return; }
  renderHomeView(el, d);
}

function renderList() {
  const el = $("#list"), d = fd();
  buddies.update({ usage: S.usage, data: S.data }); // every AI's face follows the same data as the list (all projects, not only the focus)
  if (d && !d.stale && d.connected !== false) S.news = stepNews(S.news, d, queueNow()); // helper news waits while a question is open
  if (isDesk()) return renderDesk(d);
  buildCapsule(); renderChipNow(); // phone tab bar (dot) and the active-search chip follow the data
  if (S.mode === "office" && d) return renderOfficeView(el, d);
  if (S.mode === "map" && d) return renderMapView(el, d);
  officeSig = "";
  if (S.mode === "all") return allView.render(el);
  if (!d) { fill(el, h("div", { class: "title" }, h("h1", {}, "Today")), h("div", { class: "skel" }), h("div", { class: "skel" }), h("div", { class: "skel" })); return; }
  const queue = queueNow(), q = splitQueue(queue, showAllOn()), snoozed = d.needs.filter((n) => laterActive(n.id));
  const working = d.working.filter((g) => matches(g.title, g.project)), done = d.done.filter((g) => matches(g.title, g.project));
  const nWork = d.working.filter((g) => g.status === "working" || g.status === "stalled").length;
  const sub = [todayDate(), queue.length ? queue.length + " need you" : "Nothing needs you", nWork ? nWork + " working" : null, d.stale ? "showing last saved data" : null].filter(Boolean).join(" · ");
  const sel = S.sel;
  const newsLine_ = freshLine(S.news);
  fill(el, 
    h("div", { class: "title" }, h("h1", {}, d.scope === "all" ? "All history" : "Today"), focusChip(), scopeSwitch()),
    h("p", { class: "sub" }, sub),
    h("div", { class: "buddy-row", id: "buddy-row" }),
    h("div", { class: "todaymeta", id: "todaymeta" }),
    h("div", { class: "sec hot" }, h("span", { class: "sec-t" }, "Needs you"), h("span", { class: "n" }, queue.length || ""),
      S.news.pending ? h("span", { class: "newsb", "data-act": "news-badge", title: "News from your helpers is held until you answer" }, S.news.pending + " news") : null,
      isDesk() && q.waiting ? h("button", { "data-act": "show-all", "aria-pressed": S.showAll, title: "List every card that is waiting", onclick: toggleShowAll }, S.showAll ? "Show one" : "Show all") : null,
      snoozed.length ? h("button", { onclick: () => { S.showLater = !S.showLater; renderList(); } }, (S.showLater ? "Hide" : "Later") + " (" + snoozed.length + ")") : null),
    newsLine_ ? h("div", { class: "newsline", "data-act": "news-line", role: "status" }, h("span", {}, newsLine_), h("button", { "aria-label": "Dismiss", onclick: () => { S.news = { ...S.news, line: "" }; renderList(); } }, ICONS.x(10))) : null,
    q.front ? queueCard(q.front, sel) : h("div", { class: "clear" }, h("b", {}, "You're clear"), "Agents will show up here when they need a yes or an answer."),
    hotCard({ h, usage: S.usage }), // running-hot nudge: one card below the decision card, above the list
    tidyLine_(),
    lifeLine_(),
    q.waiting && !S.showAll ? h("button", { class: "waiting", "data-act": "waiting", "aria-live": "polite", title: "Go through them one by one", onclick: startTour }, "+" + q.waiting + " waiting", ICONS.chev(14)) : null,
    q.rest.map((it) => queueCard(it, sel)),
    S.showLater ? snoozed.map((n) => h("div", { class: "row", "data-id": n.id }, badge("needs-you"), h("div", { class: "mid" }, h("b", {}, tn(n.id, n.title)), h("small", {}, "Later until " + untilClock(new Date(laterUntil(n.id)).toISOString()))), h("button", { class: "b m", onclick: (e) => setLater(n.id, false, e) }, "Wake now"))) : null,
    briefLines(),
    main("hours") || S.hoursOpen ? hoursRow({ h }, S.hours) : null,
    h("div", { class: "sec" }, "Working", h("span", { class: "n" }, working.length || "")),
    working.length ? working.map((g) => groupRow(g, sel === g.id)) : h("div", { class: "more" }, "No agents running right now."),
    doneFold(done, d.scope),
    h("div", { class: "foot" }, d.hiddenRoots ? d.hiddenRoots + " older or background threads hidden." : "Everything in this window is shown.",
      d.scope === "day" ? h("button", { onclick: () => setScope("all") }, "Show all history") : h("button", { onclick: () => setScope("day") }, "Back to last 24 h")),
  );
  mountBuddies();
  refreshMeta();
}

// ---------- chat ----------
// ---- messages: assistant = full-width Markdown, you = right-aligned bubble, images = tappable thumbnails ----
const IMG_MD = /!\[([^\]]*)\]\(t3-context:\/\/v1\/image\/([A-Za-z0-9_-]+)\)/g;
const attUrl = (id) => "/api/attachment?id=" + encodeURIComponent(id);
function lightbox(src, name) {
  const close = () => { box.remove(); removeEventListener("keydown", onKey, true); };
  const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
  const box = h("div", { class: "lightbox", role: "dialog", "aria-label": name || "Image", onclick: close },
    h("img", { src, alt: name || "" }), h("button", { class: "lb-x", "aria-label": "Close", onclick: close }, "×"));
  addEventListener("keydown", onKey, true);
  document.body.append(box);
}
function thumb(im) {
  const src = attUrl(im.id);
  const img = h("img", { src, alt: im.name, loading: "lazy", decoding: "async" });
  const btn = h("button", { class: "thumb", "aria-label": "Open image " + im.name, onclick: () => lightbox(src, im.name) }, img);
  img.addEventListener("error", () => btn.replaceWith(h("span", { class: "chip" }, "Image: " + im.name)));
  return btn;
}
/** Splits a user message into its text (image markdown removed) and its images. */
function userParts(m) {
  const byRef = new Map((m.images || []).map((i) => [i.ref, i])), shown = new Set(), pics = [];
  const text = m.text.replace(IMG_MD, (_all, name, ref) => {
    const im = byRef.get(ref);
    if (im) { if (!shown.has(im.id)) { shown.add(im.id); pics.push(thumb(im)); } } else pics.push(h("span", { class: "chip" }, "Image: " + (name || "attached")));
    return "";
  }).trim();
  for (const im of m.images || []) if (!shown.has(im.id)) pics.push(thumb(im));
  return { text, pics };
}
/** One message, plus (desktop only) long ids turned into small code chips so they wrap and read as ids. */
function msgNode(m) {
  const n = msgNode0(m);
  if (isDesk()) chipIds(n);
  return n;
}
function msgNode0(m) {
  // An agent's html page (html_render): a card with the page in a sandboxed frame.
  if (m.role === "render") return renderCard({ h, m, threadId: S.openId });
  // An answered question: one quiet line, no bubble ("✓ You chose: Bundle them").
  if (m.role === "note") return h("div", { class: "m note", "data-request": m.requestId || null }, h("span", { class: "tick", "aria-hidden": "true" }, "\u2713"), h("span", {}, m.text));
  // Another thread's (or the server's) message: its own left-hand card, never You's purple bubble.
  if (isRelayed(m)) return relayedNode({ h, m, md: renderMarkdown, time: clock(m.at), open: S.openMore.has(m.id), icon: () => ICONS.chat(15), chev: () => ICONS.chev(12),
    onToggle: () => { S.openMore.has(m.id) ? S.openMore.delete(m.id) : S.openMore.add(m.id); renderChat(true); } });
  const long = m.text.length > 12000 /* 7 Nov: text he reads and chooses from is not folded (only absurdly long output) */, open = S.openMore.has(m.id), clamp = long && !open ? " clamp" : "";
  let body, pics = [];
  if (m.role === "assistant") { pics = (m.images || []).map(thumb); body = m.text.trim() ? h("div", { class: "txt md" + clamp }, renderMarkdown(m.text)) : null; }
  else { const u = userParts(m); pics = u.pics; body = u.text ? h("div", { class: "txt" + clamp }, u.text) : null; }
  const mine = m.role === "user", st = mine ? stNode(m) : null;
  // Tiny time + copy only under the last reply of a turn (or after a tap on any reply); under your own message only the send status, when there is one.
  const meta = mine ? (st ? h("span", { class: "at" }, st) : null)
    : S.lastReplies?.has(m.id) || S.tapAt.has(m.id) ? h("span", { class: "at" }, h("span", { class: "clk" }, clock(m.at)), copyBtn(m.text)) : null;
  return h("div", { class: "m " + m.role, onclick: mine ? null : (e) => tapMessage(m.id, e) }, pics.length ? h("div", { class: "pics" }, pics) : null, body,
    long ? h("button", { class: "moreb", onclick: () => { open ? S.openMore.delete(m.id) : S.openMore.add(m.id); renderChat(true); } }, open ? "Show less" : "Show more") : null, meta);
}
function copyBtn(text) {
  return h("button", { class: "cp", type: "button", "aria-label": "Copy this reply", title: "Copy", onclick: async (e) => {
    e.stopPropagation();
    try { await navigator.clipboard.writeText(text); toast("Copied"); } catch { toast("Could not copy", true); }
  } }, ICONS.copy(14));
}
/** A tap on a reply shows or hides its time + copy line (replies that are not the last of a turn have none until tapped). Selecting text does not count. */
function tapMessage(id, e) {
  if (e.target.closest?.("a,button,summary,.tablewrap,pre") || String(getSelection?.() || "")) return;
  if (S.lastReplies?.has(id)) return;
  S.tapAt.has(id) ? S.tapAt.delete(id) : S.tapAt.add(id);
  renderChat(true);
}
/** iMessage-style status under his own bubble: "✓ Sent" / "Queued #1" / "Not delivered · retry". Never a popup. */
function stNode(m) {
  const st = msgStatus({ id: m.id, at: m.at, fd: S.chat?.frontDesk, tracked: (S.fd.get(S.openId)?.tracked || []).map((x) => x.id), unconfirmed: S.unconfirmed, lastOwnId: S.lastOwnId, now: Date.now() });
  if (!st) return null;
  return h("span", { class: "st " + st.kind }, " \u00b7 ", st.text, st.retry ? h("span", {}, " \u2014 ", h("button", { class: "st-retry", type: "button", onclick: (e) => sendAgain(st.retry, e) }, "retry")) : null);
}

// ---- work rows between messages: one collapsed line per run of steps, tap to expand ----
const TOOL_ICON = { command: "cmd", file: "edit", read: "read", search: "find", web: "web", tool: "tool" };
function toolRow(t) {
  const first = String(t.text || "").split("\n")[0];
  return h("li", { class: t.state === "failed" ? "bad" : "" }, h("span", { class: "tk " + (t.tool || "tool") }, t.label || "Step"), first ? h("code", {}, t.text.slice(0, 400)) : null);
}
/** ONE quiet row per turn: "Worked for 32s ›" with +N −N; tap opens the detailed list. Its open state survives a redraw. */
function toolsNode(w) {
  const sum = workSummary(w.tools, { endAt: w.endAt, running: w.live });
  const open = S.openTools.has(w.id);
  const det = h("details", { class: "tools" + (sum.failed ? " failed" : ""), open: open ? "" : null, ontoggle: () => { det.open ? S.openTools.add(w.id) : S.openTools.delete(w.id); } },
    h("summary", {}, h("span", { class: "wl" }, sum.label), ICONS.chev(12),
      sum.add || sum.del ? h("span", { class: "df" }, sum.add ? h("s", {}, "+" + sum.add) : null, sum.del ? h("u", {}, "\u2212" + sum.del) : null) : null),
    h("ol", {}, w.tools.map(toolRow)));
  return det;
}

function chatHeadInfo() {
  const c = S.chat, id = S.openId;
  if (c?.head) return c.head;
  const d = S.data; if (!d || !id) return null;
  const hit = [...d.working, ...d.done].flatMap((g) => [g, ...g.helpers]).find((t) => t.id === id);
  return hit ? { id, context: hit.context, title: hit.title, status: hit.status, reason: hit.reason, project: hit.project, branch: hit.branch, model: hit.model, chain: [{ id, title: hit.title }] } : { id, title: "Thread", status: "done", chain: [], model: { instanceId: "", model: "", effort: null } };
}

/** A thread opened before its messages arrive: show what the list already knows (what it is waiting for, why it stopped) instead of a blank. */
function previewNodes() {
  const id = S.openId, t = chatHeadInfo(), need = S.data?.needs.find((n) => n.id === id && !n.held);
  const bits = [need && (need.kind === "question" ? "Asks: " : "Wants to run: ") + (need.detail || need.title), t?.reason && t.status !== "needs-you" ? t.reason : null].filter(Boolean);
  return h("div", { class: "preview", "data-act": "preview" }, bits.map((b) => h("p", {}, String(b).slice(0, 400))), h("small", {}, "Loading the rest…"));
}
let headSig = "";
/** 'New version ready · Reload' (info sheet + the More page). Exists only while an update waits; Reload goes at once (his choice), and says so when text would be lost. */
const updateRow = () => S.updateReady ? h("div", { class: "upd-row", role: "group", "aria-label": "Update" },
  h("div", { class: "upd-t" }, h("b", {}, "New version ready"), hasDraft() ? h("small", {}, "Your unsent text will be lost") : null),
  h("button", { class: "qa", type: "button", "data-act": "reload-update", onclick: () => location.reload() }, "Reload")) : null;
const hasDraft = () => [...document.querySelectorAll("textarea, input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=hidden])")].some((el) => el.offsetParent !== null && String(el.value || "").trim());
/** The controls that used to crowd the header: model + effort, who runs it, branch, why it stopped, context size, New thread. Shown in the info sheet (phone) or the Inspector (desktop). */
function infoControls(t) {
  const models = S.data?.models, opts = (models?.byInstance?.[t.model.instanceId] || []).slice();
  if (t.model.model && !opts.includes(t.model.model)) opts.unshift(t.model.model);
  const efforts = (models?.efforts || ["low", "medium", "high"]).slice();
  if (t.model.effort && !efforts.includes(t.model.effort)) efforts.push(t.model.effort);
  const dis = !live() || !S.chat;
  const sm = h("select", { id: "sel-model", "aria-label": "Model", disabled: dis, onchange: (e) => changeModel(null, e) }, opts.map((m) => h("option", { value: m, selected: m === t.model.model }, modelLabel(m))));
  const se = h("select", { id: "sel-effort", "aria-label": "Effort", disabled: dis, onchange: (e) => changeModel(null, e) },
    h("option", { value: "", selected: !t.model.effort }, "default effort"), efforts.map((x) => h("option", { value: x, selected: x === t.model.effort }, x)));
  return h("div", { class: "info-in" },
    updateRow(),
    t.chain.length > 1 ? h("div", { class: "chain" }, t.chain.map((c) => h("u", {}, tt(c.id, c.title)))) : null,
    h("div", { class: "ctl" }, h("span", { class: "sel-wrap" }, sm), h("span", { class: "sel-wrap" }, se),
      INSTANCES[t.model.instanceId] ? h("span", { class: "chip" }, INSTANCES[t.model.instanceId]) : null,
      t.branch ? h("span", { class: "chip", title: t.branch }, t.branch) : null,
      t.reason && t.status !== "needs-you" ? h("span", { class: "chip" }, t.reason) : null),
    contextHead(t.context),
    h("div", { class: "info-acts" }, newBtn));
}
/** The info icon: a bottom sheet on the phone, the Inspector panel on the Mac (it carries the same controls). */
function openInfo(open = !(isDesk() ? S.insp : S.infoOpen)) {
  if (isDesk()) { if (S.insp !== open) toggleInspector(); return; }
  S.infoOpen = open; headSig = ""; renderChatHead();
}
function renderInfoSheet(t) {
  const box = $("#info"); if (!box) return;
  const on = S.infoOpen && !isDesk() && !!t;
  box.classList.toggle("on", on); box.inert = !on;
  if (!on) { fill(box); return; }
  fill(box, h("div", { class: "info-scrim", onclick: () => openInfo(false) }),
    h("div", { class: "info-sheet", role: "dialog", "aria-label": "Thread info" },
      h("div", { class: "info-top" }, h("b", {}, tn(t.id, t.title)), h("button", { class: "insp-x", type: "button", "aria-label": "Close", onclick: () => openInfo(false) }, ICONS.x(12))),
      infoControls(t)));
}
function renderChatHead() {
  const head = $("#chat-head"), t = S.openId && chatHeadInfo();
  const sig = JSON.stringify([t, live(), !!S.chat, S.data?.models, S.insp, S.infoOpen, isDesk(), !!S.updateReady, deskOut()]);
  if (sig === headSig) return; // do not rebuild the pickers while one is open
  headSig = sig;
  if (!t) { fill(head, h("div", { class: "hrow" }, h("h2", {}, "Chat"))); renderInfoSheet(null); return; }
  const sub = [t.project, INSTANCES[t.model.instanceId]].filter(Boolean).join(" \u00b7 ");
  const infoOn = isDesk() ? S.insp : S.infoOpen;
  fill(head,
    h("div", { class: "hrow" }, h("button", { class: "back", "aria-label": "Back to Today", onclick: () => { location.hash = "#/"; } }, ICONS.back()),
      h("div", { class: "ht" }, h("h2", {}, badge(t.status, 14), h("span", { class: "tt" }, tn(t.id, t.title))), sub ? h("small", {}, aiFace(t.model, "hd-face"), sub) : null),
      isDesk() ? null : desk.button(),
      h("button", { class: "ib", type: "button", "data-act": "inspector", "aria-pressed": infoOn, "aria-label": "Thread info: model, size, files" + (S.updateReady ? ", update ready" : ""), title: "Model, size, helpers and files of this thread", onclick: () => openInfo() }, ICONS.info(20), S.updateReady ? h("i", { class: "upd-dot", "aria-hidden": "true" }) : null)));
  renderInfoSheet(t);
}

// ---- Inspector (desktop): a right-hand panel for the open thread. Closed by default. Real data only (rail.js inspectorModel). ----
let inspSig = "";
function toggleInspector() { S.insp = !S.insp; headSig = ""; renderChatHead(); renderInspector(); }
function renderInspector() {
  const box = $("#insp"), pane = $(".pane-chat");
  if (!box || !pane) return;
  const open = S.insp && !!S.openId && isDesk();
  pane.classList.toggle("insp-open", open);
  box.inert = !open;
  if (!open) return;
  const model = inspectorModel({ openId: S.openId, data: S.data, chat: S.chat });
  const info = chatHeadInfo();
  const sig = JSON.stringify([S.openId, model, info, live(), !!S.chat, S.data?.models]);
  if (sig === inspSig) return;
  inspSig = sig;
  fill(box, h("div", { class: "insp-head" }, h("strong", {}, "Inspector"), h("button", { class: "insp-x", type: "button", "aria-label": "Close the Inspector", onclick: toggleInspector }, ICONS.x(12))), info ? infoControls(info) : null, inspectorNode({ h, model, openThread, badge, tn }));
}

function renderChat(keepScroll) {
  renderChatHead();
  const box = $("#chat-scroll"), msgs = $("#msgs");
  if (!S.openId) { fill(msgs, h("div", { class: "empty-chat" }, h("b", {}, "Pick a thread"), "Open any agent on the left to read it and reply here.")); renderInspector(); renderDock(); return; }
  const near = box.scrollHeight - box.scrollTop - box.clientHeight < 140;
  const c = S.chat;
  if (!c) { fill(msgs, previewNodes(), h("div", { class: "skel" }), h("div", { class: "skel" })); renderInspector(); renderDock(); return; }
  S.lastOwnId = null; for (const it of c.items) if (it.role === "user" && !isRelayed(it)) S.lastOwnId = it.id;
  const nodes = [];
  S.lastReplies = lastReplyIds(c.items);
  if (c.total > c.items.length) nodes.push(h("div", { class: "more" }, "Showing the latest " + c.items.length + " of " + c.total + " items."));
  for (const e of layoutTurns(c.items, { running: !!c.running })) nodes.push(e.type === "work" ? toolsNode(e) : msgNode(e.it));
  const unsent = unsentNodes(c.items); nodes.push(...unsent);
  const fdn = fdNode(); if (fdn) nodes.push(fdn);
  if (!c.items.length && !unsent.length) nodes.push(h("div", { class: "more" }, "No messages yet."));
  const picOk = !!document.querySelector(".qsheet") && (() => { const p = latestPicture(); return !!p && p.el.getBoundingClientRect().top >= box.getBoundingClientRect().top - 1; })(); // the picture is on screen above the open question sheet: a refresh must not scroll it away
  if (nodes.some((n) => n.classList?.contains("render"))) reconcile(msgs, nodes); else fill(msgs, nodes);
  if (!keepScroll && !picOk && (near || S.justOpened || Date.now() < (S.stickUntil || 0))) box.scrollTop = box.scrollHeight;
  S.justOpened = false;
  renderInspector();
  renderDock();
  renderJump();
}

/** The "Working 22s" chip and the jump-to-latest chevron. Both live INSIDE the dock's chips row (in the flow, above the composer); nothing floats over the messages. The two nodes persist; renderDock places them in the row. */
const wkBox = h("span", { class: "wk-slot" }), jumpBox = h("span", { class: "jump-slot" });
let jumpSig = "", rowSig = "";
function renderJump() {
  const sc = $("#chat-scroll"); if (!sc) return;
  const running = !!(S.openId && S.chat?.running), since = running ? runStart(S.chat.items) : null;
  const far = !!S.openId && jumpVisible(sc), txt = running ? workingText(since, Date.now()) : "";
  const sig = far + "|" + txt;
  if (sig !== jumpSig) {
    jumpSig = sig;
    fill(wkBox, running ? h("span", { class: "wk-pill", role: "status" }, h("i", { class: "wk-dot", "aria-hidden": "true" }), txt) : null);
    fill(jumpBox, far ? h("button", { class: "jump-btn", type: "button", "aria-label": "Jump to the latest message", onclick: () => sc.scrollTo({ top: sc.scrollHeight, behavior: "smooth" }) }, ICONS.down(20)) : null);
    const rs = dockRow({ running, far, waiting: false }).show + "|" + far; // the row appears or goes away only when its need changes
    if (rs !== rowSig) { rowSig = rs; dockSig = ""; renderDock(); }
  }
  if (running && !S.runTick) S.runTick = setInterval(renderJump, 1000);
  else if (!running && S.runTick) { clearInterval(S.runTick); S.runTick = 0; }
}

let ta, sendBtn, fileIn, attachBtn, newBtn, micBtn, modelBtn, slash;
function buildComposer() {
  ta = h("textarea", { id: "ta", rows: "1", placeholder: "Ask anything", "aria-label": "Message", enterkeyhint: "send",
    oninput: () => { grow(); if (S.openId) S.drafts.set(S.openId, ta.value); syncSend(); },
    onkeydown: (e) => { if (e.key === "Enter" && !e.shiftKey && canType() && !e.isComposing) { e.preventDefault(); submit(e); } } });
  slash = createSlash({ h, ta, threadId: () => S.openId });
  sendBtn = h("button", { class: "send", "aria-label": "Send", onclick: (e) => submit(e) }, ICONS.send());
  fileIn = h("input", { type: "file", class: "file-in", accept: "image/png,image/jpeg,image/webp,image/gif", multiple: true, "aria-hidden": "true", tabindex: "-1",
    onchange: (e) => { const f = [...fileIn.files]; fileIn.value = ""; addPictures(f, e); } });
  newBtn = h("button", { class: "qa", title: "Start a new thread: pick the project, the AI and the mode", onclick: () => startNewThread() }, "New thread");
  micBtn = voiceButton({ h, toast }, ta, null); // null where the browser has no speech recognition: no button at all
  attachBtn = h("button", { class: "attach", "aria-label": "Attach a picture", title: "Attach a picture", onclick: () => fileIn.click() }, ICONS.plus(20));
  modelBtn = h("button", { class: "mdl", type: "button", "aria-label": "Model and thread info", title: "Model, effort and size of this thread", onclick: () => openInfo(true) }, ICONS.spark(16));
  ta.addEventListener("paste", (e) => { const f = [...(e.clipboardData?.files || [])].filter((x) => x.type.startsWith("image/")); if (f.length) { e.preventDefault(); addPictures(f, e); } });
}
function grow() { ta.style.height = "42px"; if (ta.value) ta.style.height = Math.min(Math.max(ta.scrollHeight, 42), 160) + "px"; }
function syncSend() { const pics = picsOf(S.openId); sendBtn.disabled = !live() || (!ta.value.trim() && !picsReady(S.openId).length) || pics.some((p) => p.status === "uploading") || !S.openId; attachBtn.disabled = !live() || !S.openId || pics.length >= PIC_COUNT; newBtn.disabled = !live(); if (micBtn) micBtn.disabled = !live() || !S.openId; ta.disabled = !live(); ta.placeholder = live() ? "Ask anything" : "T3 is offline"; }
const clearComposer = () => { ta.value = ""; grow(); syncSend(); };
/** Typing is never blocked: with ONE open question waiting, the composer text IS the answer ("Other", free text). A longer set goes as a plain message, as before. */
function typedAnswerTarget(text, id) {
  const pend = S.chat?.pending;
  if (!pend || pend.kind !== "question" || pend.secret || !readable(pend.questions) || pend.questions.length !== 1 || S.answered.has(pend.requestId)) return null;
  if (!text.trim() || text.length > 500 || picsReady(id).length || S.openId !== id) return null;
  return pend;
}
async function submit(e) {
  if (sendBtn.disabled) return;
  const typed = typedAnswerTarget(ta.value, S.openId);
  if (typed) {
    const q = typed.questions[0], t = ta.value.trim(), d = qdrafts.get(typed.requestId) || newDraft();
    qdrafts.set(typed.requestId, d); d.picks[q.question] = q.multiSelect ? [t] : t;
    const answers = { [q.question]: q.multiSelect ? [t] : t };
    clearComposer();
    const ok = await sendAnswer(typed, answers, false, e, { defaultsUsed: false, receipt: (t.length > 40 ? t.slice(0, 40) + "\u2026" : t) });
    if (!ok && qConfirm) { qopen.add(typed.requestId); dockSig = ""; renderDock(); } // a risky text waits for a second tap inside the sheet
    else if (!ok && !ta.value) { ta.value = t; grow(); syncSend(); } // not sent: the text comes back
    return;
  }
  const text = ta.value, id = S.openId, ok = await sendText(text, e, false, picsReady(id), clearComposer);
  if (!ok && S.openId === id && !ta.value) { ta.value = text; S.drafts.set(id, text); grow(); syncSend(); } // not sent at all (waiting for his yes): the text goes back
}

let dockSig = "";
const qopen = new Set(); // requestIds whose question sheet is unfolded (default: the slim bar only)
const qpulsed = new Set(); // requestIds whose bar already pulsed once
let qfocus = false; // focus the sheet's Close button after the next draw (only right after the person opened it)
const qdrafts = new Map(); // requestId -> what is ticked so far on that question card (questions.js)
let qConfirm = null; // { requestId, kinds }: the free-text answer mentions something risky and waits for a second tap
/** Send the answers of a question card. The server checks them again against T3's own copy of the question. */
async function sendAnswer(pend, answers, confirm, e, meta = null) {
  const id = S.openId;
  if (!id || !live() || S.sending.has(id) || S.answered.has(pend.requestId)) return false;
  S.sending.add(id); renderAll(); renderDock();
  let ok = false;
  try {
    const r = await post("/api/answer", { threadId: id, requestId: pend.requestId, answers, confirm, defaultsUsed: !!meta?.defaultsUsed, device: isDesk() ? "mac" : "phone" }, e);
    qConfirm = null; qdrafts.delete(pend.requestId); qopen.delete(pend.requestId);
    S.answered.add(pend.requestId); // "answered, updating" now, before the server's next push
    tap("approve");
    S.chosen.set(pend.requestId, meta?.receipt || summary(answers) || "your answer"); // the card collapses to "✓ You chose: ..." in place (renderDock); no popup
    wrote("Sent: " + (meta?.receipt || summary(answers) || "answer"), r, { quiet: true });
    ok = true;
  } catch (err) {
    if (err.needsConfirm) qConfirm = { requestId: pend.requestId, kinds: err.kinds || ["something risky"] };
    else toast(err.message, true);
  } finally { S.sending.delete(id); renderAll(); dockSig = ""; renderDock(); }
  return ok;
}
const qshown = new Set(); // requestIds whose sheet already slid in once (a redraw never replays the slide)
/** The chat above the sheet gets bottom padding = the part of the sheet that shows, so the last message or picture is never hidden; a picture the agent just showed is scrolled into view above the sheet. */
/** The picture an agent just showed (an image or a render card in one of the last 3 messages), or null. h = rendered height (an image that has not loaded yet counts at its 240px cap). */
function latestPicture() {
  const sc = $("#chat-scroll"); if (!sc) return null;
  const vis = sc.querySelectorAll(".m.render, .m img"), last = vis[vis.length - 1];
  const tail = [...(sc.querySelector(".msgs")?.children || [])].slice(-3);
  if (!last || !tail.some((m) => m.contains(last))) return null;
  const el = last.closest(".render, .thumb") || last, loaded = last.tagName !== "IMG" || last.complete;
  const h = Math.round(el.getBoundingClientRect().height) || (loaded ? 0 : 240);
  return h > 0 ? { el, h, top: sc.getBoundingClientRect().top } : null;
}
/** "View picture": the picture does not fit above the sheet even at its lowest stop, so one clear tap opens it in the viewer it already has (image zoom / full-screen render). */
function viewPictureBtn(sheet, cap) {
  sheet.querySelector(".qs-view")?.remove();
  const pic = cap.fits ? null : latestPicture(); if (!pic) return;
  const open = pic.el.matches(".thumb") ? pic.el : pic.el.querySelector(".rfull");
  if (!open) return;
  sheet.querySelector(".qs-in")?.prepend(h("button", { class: "qs-view", type: "button", onclick: () => open.click() }, "View picture"));
}
function sheetPad(px, reveal = false) {
  const root = document.documentElement, was = root.style.getPropertyValue("--sheet-h");
  const next = px ? Math.round(px) + 8 + "px" : "";
  if (was === next && !reveal) return;
  reveal = reveal || was !== next; // opening the sheet or moving it to another stop: the picture above it is brought back into view each time
  if (next) root.style.setProperty("--sheet-h", next); else root.style.removeProperty("--sheet-h");
  const sc = $("#chat-scroll"); if (!sc || !next) return;
  const nearEnd = sc.scrollHeight - sc.scrollTop - sc.clientHeight < 120 + (parseInt(was, 10) || 0);
  const vis = sc.querySelectorAll(".m.render, .m img"), last = vis[vis.length - 1];
  const tail = [...(sc.querySelector(".msgs")?.children || [])].slice(-3);
  if (reveal && last && tail.some((m) => m.contains(last))) {
    const el = last.closest(".render, .thumb") || last;
    S.stickUntil = 0; S.justOpened = false; pictureHold = Date.now() + 1500; // the thread's "stick to the bottom for a few seconds after opening" must not drag the picture back behind the sheet
    const show = () => { // top of the picture inside the chat, above the sheet (a tall one shows from its top); the chat's own stick-to-bottom may move it back, so check again after it settles
      if (!el.isConnected || !document.querySelector(".qsheet")) return;
      const sr = sc.getBoundingClientRect(), er = el.getBoundingClientRect(), top = sr.bottom - (parseInt(getComputedStyle(document.documentElement).getPropertyValue("--sheet-h"), 10) || 0);
      if (er.top < sr.top || (er.bottom > top && er.height <= top - sr.top)) el.scrollIntoView({ block: er.height > top - sr.top ? "start" : "nearest" });
    };
    show(); [150, 450, 900].forEach((ms) => setTimeout(show, ms));
  }
  else if (nearEnd) sc.scrollTop = sc.scrollHeight;
}
/** setOpen for a bar keyed by request id: open adds it to qopen (and asks for focus on Close), fold removes it. */
const barToggle = (rid) => (v) => {
  if (!v) { const sh = document.querySelector(".qsheet"); if (sh?.foldNow) { sh.foldNow(); return; } } // fold with the ease-out settle, not a snap
  if (v) { qopen.add(rid); qfocus = true; } else qopen.delete(rid); dockSig = ""; renderDock();
};
function renderDock() {
  const dock = $("#dock");
  const pend = S.chat?.pending, need = pend && S.data?.needs.find((n) => n.requestId === pend.requestId);
  // Rebuild only when something visible changed, so a state push never steals focus from the text box.
  const sig = JSON.stringify([S.openId, pend, draftSig(qdrafts.get(pend?.requestId)), pend && qopen.has(pend.requestId), pend && S.answered.has(pend.requestId), qConfirm, need?.detail, live(), [...S.sending], [...S.confirming], [...S.remembering], S.msgConfirm, S.stopAsk, S.stopping, S.newAsk, !!S.chat?.running, S.data?.headId ?? null, S.openId && jumpVisible($("#chat-scroll")), S.chat?.head?.title, S.chat?.goal, S.openId && tt(S.openId, ""), picsOf(S.openId).map((p) => [p.key, p.status, !!p.thumb])]);
  if (sig === dockSig) { syncSend(); return; }
  dockSig = sig;
  if (!S.openId) { fill(dock, ); return; }
  const nodes = []; let qbar = null;
  if (pend && pend.secret) {
    const rid = pend.requestId || "secret:" + S.openId, pulse = !qpulsed.has(rid); qpulsed.add(rid);
    qbar = secretBar({ h, open: qopen.has(rid), pulse, secretLabel: pend.secret.label, link: secretLink(S.openId), setOpen: barToggle(rid),
      card: h("div", { class: "need" }, h("h3", {}, badge("needs-you"), h("span", { class: "grow" }, "Needs a secret")), secretNote(pend.secret, S.openId)) });
  } else if (pend && pend.kind === "question") {
    if (S.answered.has(pend.requestId) && S.chosen.has(pend.requestId)) {
      // Answered, T3 not caught up yet: the card collapses in place to one quiet line (the chat shows the same line once T3 has it).
      nodes.push(h("div", { class: "chosen", role: "status" }, h("span", { class: "tick", "aria-hidden": "true" }, "\u2713"), h("span", {}, "Sent: " + S.chosen.get(pend.requestId))));
    } else if (readable(pend.questions)) {
      let d = qdrafts.get(pend.requestId); if (!d) { d = newDraft(); qdrafts.set(pend.requestId, d); if (qdrafts.size > 20) qdrafts.delete(qdrafts.keys().next().value); }
      const rid = pend.requestId, pulse = !qpulsed.has(rid); qpulsed.add(rid);
      qbar = questionBar({ h, badge, questions: pend.questions, draft: d, busy: S.sending.has(S.openId), answered: S.answered.has(rid), confirm: qConfirm && qConfirm.requestId === rid ? qConfirm.kinds : null, open: qopen.has(rid), pulse,
        setOpen: barToggle(rid),
        send: (answers, confirm, e, meta) => sendAnswer(pend, answers, confirm, e, meta), redraw: () => { dockSig = ""; renderDock(); }, cancelConfirm: () => { qConfirm = null; dockSig = ""; renderDock(); } });
    } else {
      // The questions could not be read here (odd shape or too big): show the text and point to T3.
      nodes.push(h("div", { class: "need" }, h("h3", {}, badge("needs-you"), h("span", { class: "grow" }, "This thread needs something only T3 can give")),
        pend.detail ? h("div", { class: "cmd" }, pend.detail.slice(0, 700)) : null,
        h("p", { class: "hint" }, "Kemino can't show an answer box for this. Open the thread in T3 to answer it, or send a message below.")));
    }
  }
  if (pend && pend.kind === "permission") {
    const n = need || { id: S.openId, requestId: pend.requestId, risky: pend.risky, riskKinds: pend.riskKinds, rememberable: pend.rememberable, detail: pend.detail, kind: pend.kind, title: S.chat.head.title, chain: S.chat.head.chain, rootId: "", project: S.chat.head.project, since: Date.parse(pend.createdAt), held: false };
    const rid = pend.requestId, pulse = !qpulsed.has(rid); qpulsed.add(rid);
    const nn = { ...n, detail: pend.detail ?? n.detail, id: S.openId };
    qbar = permissionBar({ h, open: qopen.has(rid), pulse, detail: nn.detail, risky: !!nn.risky, busy: S.sending.has(S.openId), canAct: live() && !!rid && !nn.held, answered: S.answered.has(rid) || !!nn.held,
      setOpen: barToggle(rid), onYes: (e) => answer(nn, "accept", e), onNo: (e) => answer(nn, "decline", e), card: needCard(nn, false) });
  }
  if (S.msgConfirm) nodes.push(h("div", { class: "confirm" }, h("p", {}, "This message mentions " + S.msgConfirm.kinds.join(" and ") + ". Send it?"),
    h("div", { class: "acts" }, h("button", { class: "b danger y", onclick: async (e) => { const mc = S.msgConfirm; S.msgConfirm = null; await sendText(mc.text, e, true, mc.pics || [], clearComposer); } }, "Yes, send"),
      h("button", { class: "b", onclick: () => { S.msgConfirm = null; renderDock(); } }, "Edit"))));
  if (S.stopAsk) nodes.push(h("div", { class: "confirm" }, h("p", {}, "Stop what this thread is doing right now?"),
    h("div", { class: "acts" }, h("button", { class: "b danger y", disabled: S.stopping, onclick: (e) => stopRun(e, true) }, S.stopping ? "Stopping" : "Yes, stop"),
      h("button", { class: "b", disabled: S.stopping, onclick: () => { S.stopAsk = false; renderDock(); } }, "Keep going"))));
  if (S.newAsk) nodes.push(h("div", { class: "confirm" }, h("p", {}, "This new thread's message mentions " + S.newAsk.kinds.join(" and ") + ". Start it?"),
    h("div", { class: "acts" }, h("button", { class: "b danger y", onclick: (e) => newThreadFrom(S.newAsk.text, e, true) }, "Yes, start it"),
      h("button", { class: "b", onclick: () => { S.newAsk = null; renderDock(); } }, "Edit"))));
  // Quick replies only when they mean something: Stop while it runs, Go / Yes / Continue while a question or permission waits. Never a permanent row.
  const qr = quickReplies({ running: !!S.chat?.running, waiting: !!pend && !S.answered.has(pend.requestId) && !qbar, kind: pend?.kind, secret: !!pend?.secret });
  const far = !!S.openId && jumpVisible($("#chat-scroll")), row = dockRow({ running: qr.stop, far, answers: qr.answers });
  if (row.show) nodes.push(h("div", { class: "quick" }, qr.stop ? wkBox : null, qr.answers.map((q) => h("button", { disabled: !live(), onclick: (e) => sendText(q, e) }, q)),
    qr.stop ? h("button", { class: "qa stop", disabled: !live() || S.stopping, onclick: (e) => stopRun(e, false) }, "Stop") : null, far ? jumpBox : null));
  const goal = S.chat?.goal;
  if (goal) nodes.push(h("div", { class: "goalcard", role: "status" }, h("span", { class: "gtext", title: goal.objective }, h("b", {}, "Goal: "), goal.objective + " \u00b7 " + goal.status),
    h("button", { type: "button", title: "Puts /goal clear in the message box; you still press Send", onclick: () => slash.fill("/goal clear") }, "Clear goal")));
  nodes.push(picStrip());
  // "Writing to:" stays, tiny, and only when it matters: this is not the head thread (a send here goes to a different place than usual).
  const wtHead = S.chat?.head && { ...S.chat.head, title: tt(S.chat.head.id, S.chat.head.title) };
  if (writingToModel(wtHead, S.data?.headId)?.tinted) nodes.push(writingToNode(h, wtHead, S.data?.headId, null));
  if (qbar) nodes.push(qbar);
  nodes.push(h("div", { class: "composer-wrap" }, slash.el, h("div", { class: "composer" }, attachBtn, fileIn, ta, modelBtn, micBtn, sendBtn)));
  const oldTop = dock.querySelector(".qs-in")?.scrollTop || 0;
  const hadFocus = document.activeElement === ta, selA = ta.selectionStart, selB = ta.selectionEnd; // fill() re-attaches the textarea: a focused one would lose focus (and the keyboard) mid-typing
  fill(dock, h("div", { class: "dock-in" }, nodes));
  if (hadFocus && ta.isConnected && document.activeElement !== ta) { ta.focus({ preventScroll: true }); try { ta.setSelectionRange(selA, selB); } catch { /* not a text type */ } }
  const sheet = dock.querySelector(".qsheet"), scr = sheet?.querySelector(".qs-in");
  if (sheet) {
    const rid = pend?.requestId || "secret:" + S.openId, first = !qshown.has(rid); qshown.add(rid);
    if (first) sheet.classList.add("fresh");
    scr.scrollTop = oldTop;
    attachSheetDrag(sheet, { key: rid, picture: latestPicture, onPicture: (cap) => viewPictureBtn(sheet, cap), topLimit: () => document.getElementById("chat-head")?.getBoundingClientRect().bottom || 0, onClose: () => { qopen.delete(rid); sheetPad(0); dockSig = ""; renderDock(); }, onSettle: (px) => { sheetPad(px, first); } });
    if (qfocus) sheet.querySelector(".qclose, .qs-grab")?.focus({ preventScroll: true });
    const d = pend && qdrafts.get(pend.requestId);
    if (d && d.adv != null) { scr.querySelector('.q[data-i="' + d.adv + '"]')?.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); d.adv = null; }
  } else sheetPad(0);
  qfocus = false;
  syncSend();
}
// Fold the question sheet: Esc, or a tap anywhere outside it (the chat above is not blocked: this only listens, it never stops the touch).
function foldQuestion() { const sh = document.querySelector(".qsheet"); if (sh?.foldNow) { sh.foldNow(); return; } const pd = S.chat?.pending, id = pd && (pd.requestId || (pd.secret ? "secret:" + S.openId : null)); if (id && qopen.delete(id)) { dockSig = ""; renderDock(); } }
// Tap outside folds the sheet and is SWALLOWED: the click that follows must not also hit the chat underneath (it used to expand "Worked . 1 step").
let swallowUntil = 0;
document.addEventListener("pointerdown", (e) => { if (document.querySelector(".qsheet") && !e.target.closest?.(".qsheet, .qbar, .composer-wrap, .quick, [role=dialog], .ask, .dk-sheet")) { foldQuestion(); swallowUntil = e.timeStamp + 700; } }, true);
document.addEventListener("click", (e) => { if (swallowUntil && e.timeStamp < swallowUntil) { swallowUntil = 0; e.stopPropagation(); e.preventDefault(); } }, true);

// ---------- routing, selection ----------
function openThread(id) { location.hash = "#/t/" + encodeURIComponent(id); }
/** A view switch drops a plain toast at once (it belonged to the screen he left); an error toast keeps its usual time. */
function dropToast() { const t = $("#toast"); if (t && t.className === "on") { clearTimeout(toast.t); t.className = ""; } }
function route() {
  const m = /^#\/t\/(.+)$/.exec(location.hash);
  const id = m ? decodeURIComponent(m[1]) : null;
  const changed = id !== S.openId;
  if (S.openId) S.drafts.set(S.openId, ta.value);
  S.openId = id; S.sel = id || S.sel;
  $("#app").dataset.view = id ? "chat" : "today";
  $("#app").dataset.mode = S.mode;
  if (changed) {
    dropToast();
    S.msgConfirm = null; S.stopAsk = false; S.newAsk = null; S.fdAsk = false; S.justOpened = true;
    S.chat = id ? S.chats.get(id) || store("ko.chat." + id) || null : null;
    if (S.chat) S.chats.set(id, S.chat);
    connectChat(id);
    ta.value = (id && S.drafts.get(id)) || ""; grow();
  }
  renderChat();
  renderList();
  if (isDesk()) renderTop();
  document.title = id && S.chat ? S.chat.head.title + " · Kemino OS" : "Kemino OS";
}

function renderAll() { renderTop(); renderList(); renderChatHead(); renderInspector(); renderDock(); tourApi?.refresh(); refreshSheet(); }

function moveSel(dir) {
  const ids = flatIds(); if (!ids.length) return;
  const i = ids.indexOf(S.sel);
  const next = ids[Math.min(ids.length - 1, Math.max(0, i < 0 ? 0 : i + dir))];
  S.sel = next;
  if (isDesk()) openThread(next); else { renderList(); }
  $(`[data-id="${CSS.escape(next)}"]`)?.scrollIntoView({ block: "nearest" });
}
/** Y / N / L answer the card in front (or, inside a chat, that thread's own ask): never a card further back in the line. */
function selectedNeed() {
  if (S.openId) return S.data?.needs.find((n) => n.id === S.openId && !laterActive(n.id));
  const f = splitQueue(queueNow()).front;
  return f && f.need ? f.need : undefined;
}

/** The "?" list of keyboard shortcuts (a small dialog; Esc or a tap outside closes it). */
function openKeysHelp() {
  if (document.querySelector(".kh-wrap")) return;
  const close = () => { wrap.remove(); removeEventListener("keydown", onKey, true); };
  const onKey = (e) => { if (e.key === "Escape" || e.key === "?" || e.key === "h" || e.key === "H" || ((e.metaKey || e.ctrlKey) && e.key === "/")) { e.stopPropagation(); e.preventDefault(); close(); } };
  const wrap = h("div", { class: "np-wrap kh-wrap", role: "dialog", "aria-modal": "true", "aria-label": "Keyboard shortcuts", onclick: (e) => { if (e.target === wrap) close(); } },
    h("div", { class: "np-card" },
      h("div", { class: "np-head" }, h("strong", {}, "Keyboard shortcuts"), h("button", { class: "np-x", "aria-label": "Close", onclick: close }, "\u00d7")),
      h("div", { class: "kh-list" }, SHORTCUTS.map(([k, what]) => h("div", { class: "kh-row" }, h("kbd", {}, k), h("span", {}, what))))));
  addEventListener("keydown", onKey, true);
  document.body.append(wrap);
}

// ---- Escape: ONE central handler for every layer (sheets, dialogs, menus, lightbox, tour, search, quick chat, question sheet, info sheet, Inspector). Registered first, so it runs before any sheet's own listener. ----
function openLayers() {
  const out = [], all = [...document.querySelectorAll("[role=dialog]")];
  all.forEach((el, order) => {
    if (el.closest("[inert]") || el.hidden) return;
    out.push({ kind: el.classList.contains("info-sheet") ? "info" : el.classList.contains("qsheet") ? "question" : "modal", order, el });
  });
  if (isDesk() && S.insp) out.push({ kind: "inspector", order: 0 });
  return out;
}
function closeLayer(l) {
  if (l.kind === "inspector") return toggleInspector();
  if (l.kind === "info") return openInfo(false);
  if (l.kind === "question") { const sh = document.querySelector(".qsheet"); return sh?.escNow ? sh.escNow() : foldQuestion(); }
  const x = l.el.querySelector(".np-x, .rfs-x, .sz-x, .srch-done, .dk-x, [aria-label=Close]");
  if (x) x.click(); else l.el.click(); // no close button (lightbox, tour backdrop): the same tap that closes it
}
addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || e.isComposing) return;
  const top = escapeTarget(openLayers(), { typing: !!document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) });
  if (!top && (S.stopAsk || S.msgConfirm || S.newAsk) && !S.stopping) { // an inline "Yes, stop / Keep going" style confirm: Esc = the safe answer (Keep going / Edit / cancel)
    e.preventDefault(); e.stopImmediatePropagation();
    S.stopAsk = false; S.msgConfirm = null; S.newAsk = null; renderDock(); return;
  }
  if (!top) return; // nothing open: keys.js decides (leave the box / back)
  e.preventDefault(); e.stopImmediatePropagation();
  closeLayer(top);
}, true);
// Focus goes back to what opened a layer, however it was closed (Esc, tap outside, its own button).
{
  let trig = null;
  const note = (e) => { const t = e.target && e.target.closest ? e.target.closest("button,a,input,select,textarea,[role=button],[role=tab],[tabindex]") : null; if (t) trig = { el: t, sel: t.dataset && t.dataset.act ? `[data-act="${t.dataset.act}"]` : t.getAttribute("aria-label") ? `[aria-label="${t.getAttribute("aria-label").replace(/"/g, "")}"]` : "" }; };
  addEventListener("pointerdown", note, true); addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") note(e); else if (e.key.length === 1) trig = null; }, true); // a shortcut key ("?") opened it: nothing to return to
  const mark = (n) => n.nodeType === 1 && (n.matches("[role=dialog]") ? [n] : [...n.querySelectorAll("[role=dialog]")]);
  new MutationObserver((muts) => {
    for (const m of muts) {
      for (const n of m.addedNodes) for (const d of mark(n) || []) if (!d.__opener && trig) d.__opener = trig;
      for (const n of m.removedNodes) for (const d of mark(n) || []) {
        const o = d.__opener; if (!o) continue;
        const back = () => {
          const a = document.activeElement;
          if (a && a !== document.body && a.isConnected && !d.contains(a)) return; // focus already lives somewhere useful
          const el = o.el.isConnected ? o.el : o.sel ? document.querySelector(o.sel) : null;
          if (el && !el.closest("[inert]")) el.focus({ preventScroll: true });
        };
        back(); for (const ms of [80, 250, 600]) setTimeout(back, ms); // the page re-draws its top bar right after a close and drops the focus: ask again
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
}

addEventListener("keydown", (e) => {
  const ae = document.activeElement;
  const typing = !!ae && (/^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) || ae.isContentEditable === true);
  const need = S.openId ? selectedNeed() : null;
  const act = keyAction(e, { typing, dialogOpen: !!document.querySelector("[role=dialog]"), chatOpen: !!S.openId, hover: canType(), needKind: need ? need.kind : null, hasSel: !!S.sel });
  if (!act) return;
  if (act.prevent) e.preventDefault();
  if (act.do === "blur") ae.blur();
  else if (act.do === "back") location.hash = "#/";
  else if (act.do === "composer") { const box = S.openId && ta && ta.isConnected ? ta : (isDesk() ? document.getElementById("topsearch") || ta : null); if (box) box.focus(); else openPhoneSearch(); }
  else if (act.do === "help") openKeysHelp();
  else if (act.do === "desk") desk.toggle();
  else if (act.do === "mode") setMode(act.mode);
  else if (act.do === "move") moveSel(act.dir);
  else if (act.do === "open") openThread(S.sel);
  else if (act.do === "toggleAll") setMode(S.mode === "all" ? "list" : "all");
  else if (act.do === "answer") { const n = selectedNeed(); if (n && n.kind === "permission") answer(n, act.yes ? "accept" : "decline", e); }
  else if (act.do === "later") { const n = selectedNeed(); if (n) setLater(n.id, true, e); }
});
addEventListener("hashchange", route);
setInterval(() => { if (!document.hidden) { renderTop(); renderList(); } }, 30_000);
setInterval(fdTick, 1000); // front desk card: elapsed time
document.addEventListener("visibilitychange", () => { if (document.hidden) return; renderAll(); if (poll) { pollState(); if (S.openId) pollChat(S.openId); } });
matchMedia("(min-width: 1200px)").addEventListener("change", () => desk.resized());
matchMedia("(min-width: 900px)").addEventListener("change", () => { desk.resized(); headSig = ""; officeSig = ""; topSig = ""; renderAll(); renderChat(true); });

checkLogin();
loadUsage(); loadTidyAuto(); setInterval(() => { if (!document.hidden) { loadUsage(); loadTidyAuto(); } }, 60000);
loadHealth(); setInterval(() => { if (!document.hidden) loadHealth(); }, 60000);
loadFlags(); setInterval(() => { if (!document.hidden) loadFlags(); }, 300000);
setInterval(() => { if (!document.hidden) refreshMeta(); }, 20000); // "last heard" turns red by the clock, not by an event
loadHours(); setInterval(() => { if (!document.hidden) loadHours(); }, 300000);
loadStop(); setInterval(() => { if (!document.hidden) loadStop(); }, 30000);
// Home-screen install: a service worker that keeps only the app shell (never /api). Harmless where it cannot register (the demo).
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js", { scope: "./" }).catch(() => {});
  // A new version installs in the background; refresh.js checks again when the app comes back, reloads quietly when the app is hidden and nothing is unsent (else a cyan dot on the (i) button + a row in the info sheet) and does swipe-to-refresh.
  initRefresh({
    h,
    // Unsent text anywhere (composer, new-thread box, queue form, search) or a picture still uploading: never reload over it.
    draft: () => hasDraft() || !!(S.openId && picsOf(S.openId).some((p) => p.status === "uploading")),
    sheetOpen: () => !!document.querySelector("[role=dialog]"),
    questionOpen: () => !!document.querySelector(".qcard:not(.held), .secret-note, .pane-chat .need:not(.held)"),
    onPending: (on) => { S.updateReady = on; headSig = ""; renderChatHead(); buildCapsule(); renderTop(); const ml = document.querySelector(".mn-list"); if (ml) { ml.querySelector(".upd-row")?.remove(); const r = updateRow(); if (r) ml.prepend(r); } },
    refreshData: () => { connectState(); loadUsage(); loadHealth(); loadStop(); refreshMeta(); return new Promise((r) => setTimeout(r, 300)); },
    reload: () => location.reload(),
    conn: () => S.conn,
  });
  // Tapping a notification while the app is open: the service worker asks us to open that thread.
  navigator.serviceWorker.addEventListener("message", (e) => {
    const u = e.data && e.data.type === "open" && typeof e.data.url === "string" ? e.data.url : "";
    if (/^#\/t\/[\w%.~!*'()-]{1,200}$/.test(u)) location.hash = u; else if (u === "./") location.hash = "#/";
  });
}

// Everything seen last time paints in this same frame, before any network: Today, the side data, and (in route) the open chat.
{
  const cached = store("ko.state." + S.scope);
  if (cached) { setLabelsFrom(cached); S.data = { ...cached, connected: false, stale: true }; }
  S.flags = store("ko.state.flags"); S.ledger = store("ko.state.ledger"); S.usage = store("ko.state.usage"); S.hours = store("ko.state.hours"); S.stop = store("ko.state.stop"); S.health = store("ko.state.health");
  for (const k of ["morning", "evening", "weekly"]) { const b = store("ko.state.brief." + k); if (b) { if (k === "weekly") S.week = { at: 0, data: b }; else S.brief[k] = { at: 0, data: b }; } }
}
buildShell();
renderBanners();
renderTop();
renderList();
route();
connectState();
