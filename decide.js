// Decision session (plan/research-decision-session.md, option A; mock design/topics-decision). Agents file decisions (POST /api/decisions/pending); Today shows ONE
// "N decisions are ready for you" card; "Ready" opens the session: one card at a time, the agent's default already picked, progress "3 of 7", three exits
// (answer, Later, Decide for me), "Send all defaults" (lists every default first), Undo after every exit, and a "Done" end.
// Phone: a full screen. Desktop (>= 900 px): a full panel with a rail of all decisions + one card + keys: Enter, 1-9, L, D, Z, Esc. Never a small box over a blurred page.
// The server owns everything that matters (validation, the 10 s undo window, delivery to the asking thread, the Decisions log). This file draws and sequences.
// Pure helpers first (Node tests them). No innerHTML (CSP, agent text is untrusted).

import { returnFocus, moreControl } from "./keepfocus.js";

export const MIN_PER_CARD = 0.45;
export const UNDO_MS = 10_000;

/** "About 3 min" for the Ready card. */
export const etaMin = (n) => Math.max(1, Math.ceil(Math.max(0, n) * MIN_PER_CARD));
export const readyTitle = (n) => (n === 1 ? "1 decision to make" : n + " decisions to make");

/** What a key does in the session, given the view ("card" | "later" | "all" | ...). Pure, so Node tests it.
 *  Esc closes the Later presets first (a second Esc closes the session). While the presets are open, digits, D and Z are inert (Enter on a focused preset button still clicks it) (no accidental answer); L toggles back. */
export function keyAction(key, view) {
  const k = String(key).toLowerCase();
  if (key === "Escape") return view === "later" ? "later-close" : "close";
  if (view === "later") return /^([1-9]|d|z)$/.test(k) ? "inert" : k === "l" ? "later-close" : null;
  if (/^[1-9]$/.test(k)) return "pick";
  if (k === "l") return view === "card" ? "later-open" : null;
  if (k === "d") return "decide";
  if (k === "z") return "undo";
  if (k === "enter") return "use";
  return null;
}

/** The Later choices, same times as the app's snooze presets (snooze.ts). `time` is what the button shows under the name. */
export function laterPresets(now = Date.now()) {
  const hm = (d) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  return [{ id: "later-today", name: "Later today", time: hm(new Date(now + 3 * 3600_000)) }, { id: "tomorrow", name: "Tomorrow", time: "07:30" }, { id: "monday", name: "Monday", time: "07:30" }];
}

/** A fresh session over the decisions waiting now. `cur` = the card in front. */
export function startSession(items) {
  const ids = (items || []).map((x) => x.id);
  return { ids, byId: Object.fromEntries((items || []).map((x) => [x.id, x])), done: {}, pick: {}, cur: ids[0] || null, v: ids.length ? "card" : "clear", note: null, undoIds: [], undoUntil: 0, problems: [] };
}
export const isDone = (st, id) => Object.prototype.hasOwnProperty.call(st.done, id);
export const remaining = (st) => st.ids.filter((id) => !isDone(st, id));
export const doneCount = (st) => st.ids.length - remaining(st).length;
/** "3 of 7": the card in front is number (answered so far + 1). */
export const position = (st) => (st.v === "clear" ? { pos: st.ids.length, total: st.ids.length } : { pos: Math.min(doneCount(st) + 1, st.ids.length), total: st.ids.length });
/** The option You has picked on a card (his tap, else the agent's default). */
export const pickIndex = (st, id) => { const it = st.byId[id]; return it ? (st.pick[id] ?? it.default) : 0; };
export const pickLabel = (st, id) => { const it = st.byId[id]; return it ? it.options[pickIndex(st, id)] : ""; };
/** The next card after `id`: the next waiting one in order, else the first waiting one, else null. */
export function nextId(st, id) {
  const rest = remaining(st);
  if (!rest.length) return null;
  const at = st.ids.indexOf(id);
  return st.ids.slice(at + 1).find((x) => !isDone(st, x)) || rest[0];
}
/** Mark ids done with a kind ("def" the agent's default, "ans" another answer, "later", "agent" decided for him) and move on. Returns the new state. */
export function applyDone(st, entries, note, undoUntil = 0, now = Date.now()) {
  const done = { ...st.done };
  for (const e of entries) done[e.id] = { kind: e.kind, label: e.label };
  const nx = { ...st, done, undoIds: entries.map((e) => e.id), undoUntil: undoUntil || now + UNDO_MS, note: note || null };
  nx.cur = nextId(nx, st.cur);
  nx.v = nx.cur ? "card" : "clear";
  return nx;
}
/** Take the last action back: its cards are waiting again and the first of them is in front. */
export function applyUndo(st) {
  const done = { ...st.done };
  for (const id of st.undoIds) delete done[id];
  const first = st.ids.find((id) => st.undoIds.includes(id)) || st.cur;
  return { ...st, done, cur: first, v: "card", note: null, undoIds: [], undoUntil: 0 };
}
export const canUndo = (st, now = Date.now()) => st.undoIds.length > 0 && st.undoUntil > now;
/** The live list moved (new asks, answers elsewhere): new ones join at the end; ones that are no longer waiting (and not done here) count as done. */
export function syncSession(st, items) {
  const live = new Set((items || []).map((x) => x.id));
  const byId = { ...st.byId };
  const ids = [...st.ids];
  for (const it of items || []) { byId[it.id] = it; if (!ids.includes(it.id)) ids.push(it.id); }
  const done = { ...st.done };
  // A card the server still lists as waiting is NOT done, whatever this screen believed: a failed or partial Undo (or one made on another device) put it back.
  // Without this the session could say "Done" while decisions are still open.
  for (const id of ids) if (live.has(id) && Object.prototype.hasOwnProperty.call(done, id)) delete done[id];
  for (const id of ids) if (!live.has(id) && !Object.prototype.hasOwnProperty.call(done, id)) done[id] = { kind: "else", label: "answered elsewhere" };
  const nx = { ...st, ids, byId, done, undoIds: st.undoIds.filter((id) => !live.has(id)) };
  if (!nx.cur) nx.cur = remaining(nx)[0] || null;
  else if (isDone(nx, nx.cur)) nx.cur = nextId(nx, nx.cur);
  if (nx.v !== "clear" && !nx.cur) nx.v = "clear";
  if (nx.v === "clear" && nx.cur) nx.v = "card";
  return nx;
}
/** Counts for the end screen. */
export function summary(st) {
  const c = { answered: 0, later: 0, agent: 0 };
  for (const d of Object.values(st.done)) { if (d.kind === "later") c.later++; else if (d.kind === "agent") c.agent++; else if (d.kind !== "else") c.answered++; }
  return c;
}
export const laterLabel = (id) => ({ "later-today": "Later today", tomorrow: "Tomorrow 07:30", monday: "Monday 07:30" })[id] || "Later";

/** One short plain line for a failed delivery: the server's reason, cut to fit one card line. */
export const shortReason = (e) => { const t = String(e || "").replace(/\s+/g, " ").trim(); return t.length > 60 ? t.slice(0, 59) + "…" : t || "no reason given"; };
/** "Not delivered" (the answer did NOT reach the asking thread) is never shown as "Answered". unsure = it may have arrived (see the server's 'sending' note). */
export const problemText = (p) => (p.delivery === "unsure" ? "May not have arrived" : "Didn't get through: " + shortReason(p.error));
export const problemAction = (p) => (p.delivery === "unsure" ? "Send again" : "Try again");
/** The decisions whose answer did not arrive, from the server's `problems` list (new array, plain objects). */
export const problemsOf = (list) => (Array.isArray(list) ? list : []).filter((p) => p && (p.delivery === "failed" || p.delivery === "unsure")).map((p) => ({ id: p.id, title: p.title, delivery: p.delivery, error: p.error || "", text: problemText(p), action: problemAction(p) }));

/** The Ready card on Today (the same look as a needs-you card). Null when nothing waits. */
export function readyCard({ h, count, go, notNow }) {
  if (!count) return null;
  return h("div", { class: "need ds-ready", "data-act": "ready-card" },
    h("h3", {}, h("i", { class: "ds-ring", "aria-hidden": "true" }), readyTitle(count)),
    h("p", { class: "ch" }, "About " + etaMin(count) + " min · I've picked a suggested answer for each"),
    h("div", { class: "acts" }, h("button", { type: "button", class: "b y", "data-act": "ready-go", onclick: (e) => go(e) }, "Start"),
      h("button", { type: "button", class: "b m", "data-act": "ready-later", onclick: (e) => notNow(e) }, "Not now")));
}

/** Today: answers that did not reach their thread ("Not delivered: <reason> · Retry"). Null when all arrived. */
export function problemCard({ h, problems, retry }) {
  if (!problems || !problems.length) return null;
  return h("div", { class: "need ds-ready ds-badcard", "data-act": "bad-card", role: "alert" },
    h("h3", {}, h("i", { class: "ds-ring", "aria-hidden": "true" }), problems.length === 1 ? "1 answer didn't get through" : problems.length + " answers didn't get through"),
    problems.slice(0, 3).map((p) => h("p", { class: "ch" }, h("b", {}, p.title), " · " + p.text)),
    h("div", { class: "acts" }, h("button", { type: "button", class: "b y", "data-act": "bad-retry", onclick: (e) => retry(problems.map((p) => p.id), e) }, problems.every((p) => p.delivery === "unsure") ? "Send again" : "Try again")));
}

const LABELS = { def: "Suggested", ans: "Answered", later: "Later", agent: "Decided for you", else: "Answered elsewhere" };
const ICON = { def: "✓", ans: "✓", later: "↷", agent: "◆", else: "✓" };

let current = null; // the open session's close(): a second open must end the first one properly (its key listener and poll timer would otherwise live on)

/**
 * deps: { h, get(path)->{ok,status,j}, post(path, body, event)->json, toast(msg, isError), toLogin(), openTour(), opener() -> element to give focus back to }.
 * Returns { close, refresh }.
 */
export function openDecideSession({ h, get, post, toast, toLogin, openTour, opener, onClose = () => {} }) {
  if (current) { const c = current; current = null; c(true); } // end the old session: key listener, poll timer, its box
  const prev = document.querySelector(".ds");
  if (prev) prev.remove();
  let st = startSession([]), loaded = false, busy = false, existing = null, err = "", poll = null, noteT = null, sig = "";
  const root = h("div", { class: "ds", role: "dialog", "aria-modal": "true", "aria-label": "Decisions" });

  const close = (replaced = false) => {
    clearInterval(poll); clearTimeout(noteT);
    removeEventListener("keydown", onKey, true);
    if (current === close) current = null;
    root.remove();
    if (replaced === true) return; // a new session is taking its place: no focus hand-back, no onClose refresh
    onClose();
    // Focus goes back to the Ready button, and stays there even when Today re-draws later (returnFocus watches for ~6 s while nothing else holds focus).
    returnFocus(() => (opener && opener()) || document.querySelector('[data-act="ready-go"]') || moreControl());
  };

  async function load(first) {
    try {
      const r = await get("/api/decisions/pending");
      if (r.status === 401) return toLogin();
      if (!r.ok) throw new Error(r.j?.error || "Couldn't load (" + r.status + ")");
      const probs = problemsOf(r.j.problems);
      const s = JSON.stringify([(r.j.items || []).map((x) => x.id), r.j.existing && r.j.existing.total, probs.map((p) => p.id + p.delivery + p.error)]);
      const same = !first && loaded && !err && s === sig;
      sig = s; existing = r.j.existing || null; err = "";
      if (same) return; // nothing changed: keep the drawing (and the keyboard focus) as it is
      st = { ...(first ? startSession(r.j.items) : syncSession(st, r.j.items)), problems: probs };
      loaded = true;
    } catch (e) { if (loaded && !first && !err && e.message) return; err = e.message; loaded = true; }
    draw();
  }

  const expireNote = () => { clearTimeout(noteT); const left = st.undoUntil - Date.now(); if (st.note && left > 0) noteT = setTimeout(() => { if (st.undoUntil <= Date.now()) { st = { ...st, note: null, undoIds: [] }; draw(); } else expireNote(); }, left + 50); };

  async function run(fn) {
    if (busy) return;
    busy = true; draw();
    try { await fn(); } catch (e) { toast(e.message, true); await load(false); }
    busy = false; draw();
  }
  const item = () => (st.cur ? st.byId[st.cur] : null);

  const use = (e) => run(async () => {
    const it = item(); if (!it || st.v !== "card") return;
    const i = pickIndex(st, it.id), label = it.options[i];
    const r = await post("/api/decisions/answer", { id: it.id, choice: label }, e);
    st = applyDone(st, [{ id: it.id, kind: i === it.default ? "def" : "ans", label }], "Sent: " + label, r.decisions?.[0]?.undoUntil);
    expireNote();
  });
  const later = (preset, e) => run(async () => {
    const it = item(); if (!it) return;
    const r = await post("/api/decisions/answer", { id: it.id, choice: "later", preset }, e);
    st = applyDone(st, [{ id: it.id, kind: "later", label: laterLabel(preset) }], "Moved to " + laterLabel(preset) + ". It'll be back then.", r.decisions?.[0]?.undoUntil);
    expireNote();
  });
  const decide = (e) => run(async () => {
    const it = item(); if (!it || st.v !== "card") return;
    const r = await post("/api/decisions/answer", { id: it.id, choice: "decide" }, e);
    const label = it.options[it.default];
    st = applyDone(st, [{ id: it.id, kind: "agent", label }], "Decided for you: " + label + ". It's in Decisions.", r.decisions?.[0]?.undoUntil);
    expireNote();
  });
  const sendAll = (e) => run(async () => {
    const ids = remaining(st);
    if (!ids.length) return;
    const r = await post("/api/decisions/answer", { all: true, choice: "default", ids }, e);
    const got = new Set((r.decisions || []).map((d) => d.id));
    const entries = ids.filter((id) => got.has(id)).map((id) => ({ id, kind: "def", label: st.byId[id].options[st.byId[id].default] }));
    st = applyDone(st, entries, (entries.length === 1 ? "Sent 1 suggested answer." : "Sent " + entries.length + " suggested answers. You can undo for 10 s."), (r.decisions || [])[0]?.undoUntil);
    expireNote();
  });
  const undo = (e) => run(async () => {
    if (!canUndo(st)) { st = { ...st, note: null, undoIds: [] }; return; }
    await post("/api/decisions/undo", { ids: st.undoIds }, e);
    st = applyUndo(st); clearTimeout(noteT);
    await load(false);
  });
  const retry = (id, e) => run(async () => { await post("/api/decisions/resend", { id }, e); toast("Sending again…"); await load(false); });
  const view = (v) => { if (busy) return; st = { ...st, v }; draw(); };
  const pick = (j) => { const it = item(); if (!it || st.v !== "card" || j < 0 || j >= it.options.length) return; st = { ...st, pick: { ...st.pick, [it.id]: j } }; draw(); };
  const jump = (id) => { if (busy || isDone(st, id)) return; st = { ...st, cur: id, v: "card" }; draw(); };

  function onKey(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    const act = keyAction(e.key, st.v);
    if (act === "close") { e.stopPropagation(); e.preventDefault(); close(); return; }
    if (act === "later-close") { e.stopPropagation(); e.preventDefault(); view("card"); return; } // Esc / L closes only the presets
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "")) return;
    if (act === "inert") { e.preventDefault(); e.stopPropagation(); return; } // presets open: no answer by accident
    if (k === "enter") { if (document.activeElement?.closest?.("button") || st.v !== "card") return; e.preventDefault(); e.stopPropagation(); use(e); return; } // on a focused button, Enter is that button's click
    if (!/^[1-9ldz]$/.test(k)) return;
    e.preventDefault(); e.stopPropagation();
    if (act === "pick") pick(Number(k) - 1);
    else if (act === "later-open") view("later");
    else if (act === "decide") decide(e);
    else if (act === "undo") undo(e);
  }
  addEventListener("keydown", onKey, true);
  root.escNow = () => { if (st.v === "later") view("card"); else close(); }; // the central Esc handler (app.js) calls this instead of clicking Close

  // ---- drawing ----
  const kbd = (t) => h("kbd", { "aria-hidden": "true" }, t);
  function noteBar() {
    return st.note ? h("div", { class: "ds-note", role: "status" }, h("span", {}, st.note), canUndo(st) ? h("button", { type: "button", "data-act": "ds-undo", disabled: busy, onclick: (e) => undo(e) }, "Undo") : null) : null;
  }
  /** One line per answer that did not arrive: "Not delivered: <reason> · Retry". Shown over every screen, the "Done" one too. */
  function problemBars() {
    const ps = st.problems || [];
    return ps.length ? h("div", { class: "ds-bad-wrap" }, ps.map((p) => h("div", { class: "ds-bad", role: "alert", "data-act": "ds-bad" }, h("span", {}, h("b", {}, p.title), " · " + p.text),
      h("button", { type: "button", "data-act": "ds-retry", disabled: busy, onclick: (e) => retry(p.id, e) }, p.action)))) : null;
  }
  function cardView() {
    const it = item();
    if (!it) return null;
    const p = pickIndex(st, it.id);
    const ops = it.options.map((o, j) => h("button", { type: "button", class: "ds-op" + (j === p ? " sel" : ""), role: "radio", "aria-checked": j === p ? "true" : "false", "data-act": "ds-opt", "data-j": String(j), onclick: () => pick(j) },
      h("span", { class: "ds-rb", "aria-hidden": "true" }), h("span", { class: "ds-ol" }, o), j === it.default ? h("span", { class: "ds-tag" }, "Suggested") : null, kbd(String(j + 1))));
    const acts = st.v === "later"
      ? h("div", { class: "ds-pre" }, laterPresets().map((x) => h("button", { type: "button", class: "b", "data-act": "ds-preset", "data-preset": x.id, disabled: busy, onclick: (e) => later(x.id, e) }, x.name, h("small", {}, x.time))),
          h("button", { type: "button", class: "b m ds-cancel", "data-act": "ds-cancel", onclick: () => view("card") }, "Cancel"))
      : [h("button", { type: "button", class: "b y ds-use", "data-act": "ds-use", disabled: busy, onclick: (e) => use(e) }, h("span", { class: "ds-use-t" }, "Go with: " + pickLabel(st, it.id)), kbd("⏎")),
        h("div", { class: "ds-two" }, h("button", { type: "button", class: "b", "data-act": "ds-later", disabled: busy, onclick: () => view("later") }, "Later", kbd("L")),
          h("button", { type: "button", class: "b", "data-act": "ds-decide", disabled: busy, onclick: (e) => decide(e) }, "Decide for me", kbd("D")))];
    return h("div", { class: "ds-card", "data-act": "ds-card" },
      h("span", { class: "ds-chip" }, it.topic || it.from), h("h3", {}, it.title), it.detail ? h("p", {}, it.detail) : null,
      h("div", { class: "ds-ops", role: "radiogroup", "aria-label": "Answers" }, ops), acts);
  }
  function allView() {
    const ids = remaining(st);
    return h("div", { class: "ds-card", "data-act": "ds-all" },
      h("span", { class: "ds-chip" }, "Send all suggested"), h("h3", {}, "Send " + ids.length + (ids.length === 1 ? " answer?" : " answers?")), h("p", {}, "These are the suggested answers. Nothing else changes."),
      h("div", { class: "ds-lst" }, ids.map((id) => h("div", {}, h("small", {}, st.byId[id].topic || st.byId[id].from), st.byId[id].options[st.byId[id].default]))),
      h("button", { type: "button", class: "b y ds-use", "data-act": "ds-sendall", disabled: busy || !ids.length, onclick: (e) => sendAll(e) }, "Send " + ids.length + (ids.length === 1 ? " answer" : " answers")),
      h("div", { class: "ds-two" }, h("button", { type: "button", class: "b m", "data-act": "ds-back", onclick: () => view("card") }, "Back")));
  }
  function clearView() {
    const c = summary(st);
    return h("div", { class: "ds-clear", "data-act": "ds-clear" },
      h("div", { class: "ds-ck", "aria-hidden": "true" }, "✓"), h("h3", {}, "Done"), existing && existing.total ? null : h("p", {}, "That's everything."),
      h("div", { class: "ds-sm" }, c.answered ? h("span", { class: "ds-chip" }, c.answered + " answered") : null, c.later ? h("span", { class: "ds-chip" }, c.later + " for later") : null, c.agent ? h("span", { class: "ds-chip" }, c.agent + " decided for you") : null),
      c.later ? h("p", { class: "ds-fine" }, "The ones you put off come back later.") : null,
      existing && existing.total ? h("button", { type: "button", class: "b ds-tour", "data-act": "ds-tour", onclick: () => { close(); openTour(); } }, existing.total + (existing.total === 1 ? " more needs you" : " more need you")) : null,
      h("div", { class: "ds-two ds-end" }, h("button", { type: "button", class: "b y", "data-act": "ds-done", onclick: () => close() }, "Done")));
  }
  function railView() {
    const { pos, total } = position(st);
    return h("nav", { class: "ds-rail", "aria-label": "All decisions" },
      h("div", { class: "ds-rh" }, h("b", {}, "Decisions"), h("span", {}, st.v === "clear" ? "done" : pos + " of " + total)),
      st.ids.map((id) => { const it = st.byId[id], d = st.done[id], cur = id === st.cur && st.v !== "clear";
        return h("button", { type: "button", class: "ds-rl" + (cur ? " c" : "") + (d && d.kind !== "later" ? " dn" : ""), "aria-current": cur ? "step" : null, disabled: !!d || busy, onclick: () => jump(id) },
          h("span", { class: "ds-ri", "aria-hidden": "true" }, d ? ICON[d.kind] : cur ? "●" : "○"), h("span", { class: "ds-rt" }, it.title, h("small", {}, (it.topic || it.from) + (d ? " · " + (d.kind === "later" ? d.label : LABELS[d.kind] + ": " + d.label) : ""))));
      }),
      remaining(st).length && st.v !== "clear" ? h("div", { class: "ds-rsend" }, h("button", { type: "button", class: "b", "data-act": "ds-all-rail", disabled: busy, onclick: () => view("all") }, "Send all suggested")) : null);
  }

  function draw() {
    const hadFocus = root.contains(document.activeElement) && document.activeElement !== document.body;
    const { pos, total } = position(st), left = remaining(st).length;
    const main = !loaded ? h("div", { class: "ds-load" }, "Loading…")
      : err ? h("div", { class: "ds-clear" }, h("p", {}, err), h("button", { type: "button", class: "b", onclick: () => load(true) }, "Try again"))
      : st.v === "clear" ? clearView() : st.v === "all" ? allView() : cardView();
    const showCount = loaded && !err && st.v !== "clear";
    root.replaceChildren(...[
      railView(),
      h("div", { class: "ds-main" },
        h("div", { class: "ds-head" },
          h("button", { type: "button", class: "ds-x", "data-act": "ds-close", "aria-label": "Close", title: "Close (Esc)", onclick: () => close() }, "✕", h("span", { class: "ds-xt" }, "Close")),
          h("div", { class: "ds-cnt", "aria-live": "polite" }, st.v === "clear" ? "Done" : showCount ? pos + " of " + total : "", showCount && left ? h("small", {}, "about " + etaMin(left) + " min left") : null),
          showCount && st.v !== "all" && left ? h("button", { type: "button", class: "ds-lk", "data-act": "ds-all", disabled: busy, onclick: () => view("all") }, "Send all suggested") : h("span", { class: "ds-lk-gap" }),
          h("span", { class: "ds-keys" }, "Esc closes · Z undoes")),
        showCount || st.v === "clear" ? h("div", { class: "ds-pg", "aria-hidden": "true" }, st.ids.map((id) => h("i", { class: isDone(st, id) ? "d" : id === st.cur ? "c" : "" }))) : null,
        h("div", { class: "ds-body" }, problemBars(), noteBar(), main))].filter(Boolean));
    // keep keyboard focus inside after the cards change: on the main button of the new card
    if (!hadFocus || document.activeElement === document.body) (root.querySelector(".ds-use") || root.querySelector(".ds-pre .b") || root.querySelector(".ds-ck ~ .ds-end .y") || root.querySelector("[data-act=ds-done]") || root.querySelector(".ds-x"))?.focus({ preventScroll: true });
  }

  current = close;
  document.body.append(root);
  draw();
  load(true).then(() => { if (root.isConnected) (root.querySelector(".ds-use") || root.querySelector("[data-act=ds-done]"))?.focus({ preventScroll: true }); });
  poll = setInterval(() => { if (!busy && root.isConnected) load(false); }, 6000);
  return { close: () => close(), refresh: () => load(false) };
}
