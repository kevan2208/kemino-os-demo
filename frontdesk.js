// FRONT DESK: the status card shown in a thread's chat while You's message waits behind the step that is running.
// Pure helpers first (Node tests them), then the card builder. Text goes in only as text nodes; styling is classes only (CSP).
// Facts come from the chat payload's `frontDesk` (server/frontdesk.ts, read from T3's own run list). Nothing here is guessed:
// no start time = no elapsed line, too few finished turns = no "usually" line, unknown queue place = no number.

export const PICKED_MS = 5000; // how long "Your message was picked up" stays
export const UNSEEN_MS = 20000; // a just-sent message that T3's queue never showed within this long is treated as already started

/** 130000 -> "2 min 10 s", 45000 -> "45 s", 3900000 -> "1 h 05 min". */
export function fmtElapsed(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "";
  const s = Math.floor(ms / 1000);
  if (s < 60) return s + " s";
  const m = Math.floor(s / 60);
  if (m < 60) return m + " min " + String(s % 60).padStart(2, "0") + " s";
  return Math.floor(m / 60) + " h " + String(m % 60).padStart(2, "0") + " min";
}
/** 180000 -> "~3 min"; under a minute rounds up to "~1 min"; two hours or more -> "~2 h". */
export function fmtTypical(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const m = Math.max(1, Math.round(ms / 60000));
  return m >= 120 ? "~" + Math.round(m / 60) + " h" : "~" + m + " min";
}

/** Milliseconds since the run started, on the server's clock (`offset` = server clock minus this device's clock). Null = unknown. */
export function elapsedNow(fd, nowLocal, offset = 0) {
  if (!fd || !fd.busy || !Number.isFinite(fd.runStartedAt)) return null;
  const d = nowLocal + offset - fd.runStartedAt;
  return d >= -2000 ? Math.max(0, d) : null;
}

/**
 * One step of the per-thread record: `rec` = { tracked: [{ id, at, seen }], wasQueued }, `fd` = the chat's frontDesk (or undefined).
 * Returns { rec, picked }. `picked` is true when a message we were watching has left the queue, or the thread went idle under it.
 */
export function step(rec, fd, now) {
  const queued = fd && Array.isArray(fd.queued) ? fd.queued : [];
  const busy = !!(fd && fd.busy);
  let picked = false;
  const tracked = [];
  for (const e of rec?.tracked || []) {
    if (queued.some((q) => q.messageId === e.id)) { tracked.push({ ...e, seen: true }); continue; }
    if (e.seen || !busy || now - e.at > UNSEEN_MS) picked = true; // was in the queue and left it, or nothing is running any more, or it never showed
    else tracked.push(e); // just sent, T3's list does not show it yet
  }
  if (!tracked.length && rec?.wasQueued && !queued.length) picked = true; // no tracking (page reloaded), but the queue we showed has emptied
  return { rec: { tracked, wasQueued: queued.length > 0 || tracked.length > 0 }, picked };
}

/**
 * What the card says. `title` = the thread's name; `rec` as in step(); `pickedUntil` = when the "picked up" note ends (0 = not showing).
 * Returns null (no card), { kind: "picked", headline } or { kind: "busy", headline, elapsed, typical, nextId, hideKey, canAct }.
 */
export function cardModel({ title, fd, rec, pickedUntil = 0, now, offset = 0 }) {
  const queued = fd && Array.isArray(fd.queued) ? fd.queued : [];
  const tracked = rec?.tracked || [];
  if (!queued.length && !tracked.length) return pickedUntil > now ? { kind: "picked", headline: "Your message was picked up" } : null;
  if (!(fd && fd.busy)) return pickedUntil > now ? { kind: "picked", headline: "Your message was picked up" } : null;
  const name = String(title || "This thread");
  let tail;
  if (queued.length === 1) tail = "your message is #" + queued[0].position;
  else if (queued.length > 1) tail = "your " + queued.length + " messages are waiting (#1 to #" + queued.length + ")";
  else tail = tracked.length > 1 ? "queued behind your earlier messages" : "your message is queued";
  const el = elapsedNow(fd, now, offset);
  const ty = Number.isFinite(fd.typicalMs) && fd.typicalMs > 0 ? fmtTypical(fd.typicalMs) : "";
  return {
    kind: "busy", headline: name + " is busy · " + tail,
    elapsed: el === null ? "" : "Working for " + fmtElapsed(el),
    typical: ty ? "usually " + ty + " per turn" : "",
    nextId: queued.length ? queued[0].messageId : null,
    /** "Keep waiting" is remembered under this key: a new message joining the queue changes it, so the button comes back. */
    hideKey: queued.length ? queued[0].messageId + "#" + queued.length : null,
    canAct: queued.length > 0, // "Send now" needs a place in T3's queue to point at
  };
}

/**
 * The card's DOM. `h(tag, props, ...kids)` is the app's builder; `face` is the AI's small face node or null.
 * `ask` = the one-confirm step is showing; `hidden` = "Keep waiting" was tapped (buttons gone); `busy` = a send-now call is in flight.
 */
export function frontDeskCard({ h, face, card, ask, hidden, busy, live, onAsk, onGo, onKeep }) {
  if (!card) return null;
  if (card.kind === "picked") return h("div", { class: "fd-card picked", role: "status" }, face, h("div", { class: "fd-body" }, h("b", { class: "fd-head" }, card.headline)));
  const sub = [card.elapsed ? h("span", { class: "fd-elapsed" }, card.elapsed) : null, card.typical ? h("span", { class: "fd-typ" }, card.typical) : null].filter(Boolean);
  const parts = [];
  sub.forEach((n, i) => { if (i) parts.push(h("span", { class: "fd-dot", "aria-hidden": "true" }, " · ")); parts.push(n); });
  const rows = [];
  if (card.canAct && !hidden) {
    if (ask) {
      rows.push(h("p", { class: "fd-ask" }, "Interrupt the step that is running and run your message now?"));
      rows.push(h("div", { class: "acts" }, h("button", { class: "b danger y fd-yes", disabled: busy || !live, onclick: (e) => onGo(e) }, busy ? "Sending" : "Yes, send now"),
        h("button", { class: "b fd-no", disabled: busy, onclick: () => onKeep() }, "Keep waiting")));
    } else {
      rows.push(h("div", { class: "acts" }, h("button", { class: "b fd-go", disabled: !live, onclick: () => onAsk() }, "Send now (interrupts the step)"),
        h("button", { class: "b fd-no", onclick: () => onKeep() }, "Keep waiting")));
    }
  }
  return h("div", { class: "fd-card", role: "status", "aria-live": "polite" }, face,
    h("div", { class: "fd-body" }, h("b", { class: "fd-head" }, card.headline), parts.length ? h("small", { class: "fd-sub" }, ...parts) : null, ...rows));
}

/**
 * The quiet line under one of your own message bubbles (iMessage-style), no popup:
 *   "Queued #2" (T3's queue says so) | "Queued" (just sent, thread busy, queue not shown yet) | "Not delivered" + retry (T3 never showed it back)
 *   | "\u2713 Sent" (his latest message, or one this page just sent, for 10 minutes) | null.
 * in: { id, at (ISO), fd (chat.frontDesk), tracked: ids this page just sent to this thread, unconfirmed: [{ id, inline, check:{messageId} }], lastOwnId, now }
 */
export function msgStatus({ id, at, fd, tracked = [], unconfirmed = [], lastOwnId = null, now = Date.now() }) {
  const q = fd && Array.isArray(fd.queued) ? fd.queued.find((x) => x.messageId === id) : null;
  if (q) return { kind: "queued", text: "Queued #" + q.position };
  const bad = unconfirmed.find((u) => u.inline && u.check && u.check.messageId === id);
  if (bad) return { kind: "bad", text: "Not delivered", retry: bad.id };
  if (tracked.includes(id)) return fd && fd.busy ? { kind: "queued", text: "Queued" } : { kind: "sent", text: "\u2713 Sent" };
  const t = Date.parse(at);
  if (id === lastOwnId && Number.isFinite(t) && now - t < 600_000) return { kind: "sent", text: "\u2713 Sent" };
  return null;
}

// ---------- Unsent messages: what You typed stays IN the thread until T3 shows it back (iOS "Not Delivered") ----------
// State: { [threadId]: [{ id, text, pics (count), status: "sending" | "sent" | "failed", at (ms), messageId?, check?, why? }] }.
// "sending" = the server is still looking for it in T3 (about 6 s). "sent" = confirmed, kept only until the real message shows in the chat (no gap, no twin).
// "failed" = T3 did not show it back (or the call failed): red "Not delivered" with Send again / Remove. Never dropped by itself, only by Remove, a confirmation, or 7 days.
export const UNSENT_KEY = "ko.unsent";
export const UNSENT_MAX_AGE_MS = 7 * 86_400_000;
const SENT_GRACE_MS = 15_000;

/** A new entry in "sending". Returns the new state (never mutates the old one). */
export function unsentAdd(state, threadId, { id, text, pics = 0, now = Date.now() }) {
  const list = (state[threadId] || []).filter((u) => u.id !== id);
  return { ...state, [threadId]: [...list, { id, text, pics, status: "sending", at: now }] };
}
const patch = (state, threadId, id, fn) => state[threadId] ? { ...state, [threadId]: state[threadId].map((u) => u.id === id ? fn(u) : u) } : state;
/** The server answered: confirmed -> "sent" (until the real message shows), not confirmed -> "failed". `r` = the /api/send reply: { confirmed, check }. */
export function unsentResult(state, threadId, id, r) {
  const messageId = r && r.check && typeof r.check.messageId === "string" ? r.check.messageId : undefined;
  const ok = !!r && r.confirmed !== false;
  return patch(state, threadId, id, (u) => ({ ...u, status: ok ? "sent" : "failed", messageId: messageId || u.messageId, check: r && r.check ? r.check : u.check, why: undefined, doneAt: ok ? (r.now || Date.now()) : u.doneAt }));
}
/** The call itself failed (offline, refused): the text still stays, as "failed", with the reason. */
export function unsentFail(state, threadId, id, why) { return patch(state, threadId, id, (u) => ({ ...u, status: "failed", why: String(why || "") || undefined })); }
/** Send again: back to "sending" (quiet grey), same bubble, same place. */
export function unsentRetry(state, threadId, id, now = Date.now()) { return patch(state, threadId, id, (u) => ({ ...u, status: "sending", why: undefined, at: now })); }
export function unsentRemove(state, threadId, id) {
  if (!state[threadId]) return state;
  const rest = state[threadId].filter((u) => u.id !== id), next = { ...state };
  if (rest.length) next[threadId] = rest; else delete next[threadId];
  return next;
}
/**
 * Drop the entries the chat now shows (no twin bubble). Match: the message id T3 reports, else (sending/failed from before a reload) the same text sent after the entry.
 * Also drops "sent" entries older than the grace time. Returns { state, shown: [ids of entries that arrived] } so the caller can clear its own "unconfirmed" notes.
 */
export function unsentReconcile(state, threadId, items, now = Date.now()) {
  const list = state[threadId];
  if (!list || !list.length) return { state, shown: [] };
  const mine = (items || []).filter((m) => m && m.role === "user");
  const shown = [];
  const keep = list.filter((u) => {
    const byId = u.messageId && mine.some((m) => m.id === u.messageId);
    const byText = !u.messageId && !!u.text && mine.some((m) => String(m.text || "").trim() === u.text && Date.parse(m.at) >= u.at - 2000);
    if (byId || byText) { shown.push(u.messageId || u.id); return false; }
    return !(u.status === "sent" && now - (u.doneAt || u.at) > SENT_GRACE_MS);
  });
  if (keep.length === list.length) return { state, shown };
  const next = { ...state };
  if (keep.length) next[threadId] = keep; else delete next[threadId];
  return { state: next, shown };
}
/** What to draw for a thread: [{ id, text, pics, kind: "sending" | "bad", why }] (a "sent" entry looks like a normal sent message and has kind "sent"). */
export function unsentView(state, threadId) {
  return (state[threadId] || []).map((u) => ({ id: u.id, text: u.text, pics: u.pics || 0, kind: u.status === "failed" ? "bad" : u.status, why: u.why || "" }));
}
/** Read the saved state. Storage may be missing or throw (private window): then an empty state. A saved "sending" becomes "failed" (the page was closed mid-send, nobody knows). Old entries go. */
export function unsentLoad(storage, now = Date.now()) {
  let raw = null;
  try { raw = JSON.parse(storage.getItem(UNSENT_KEY) || "null"); } catch { return {}; }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  for (const [tid, list] of Object.entries(raw)) {
    if (!Array.isArray(list)) continue;
    const ok = list.filter((u) => u && typeof u.id === "string" && typeof u.text === "string" && Number.isFinite(u.at) && now - u.at < UNSENT_MAX_AGE_MS && u.status !== "sent")
      .map((u) => ({ id: u.id, text: u.text, pics: Number(u.pics) || 0, status: "failed", at: u.at, messageId: typeof u.messageId === "string" ? u.messageId : undefined, check: u.check && typeof u.check === "object" ? u.check : undefined }));
    if (ok.length) out[tid] = ok;
  }
  return out;
}
/** Save the state. Returns false when storage refused; the page then keeps working from memory while it stays open. */
export function unsentSave(storage, state) {
  try { const keepOnly = {}; for (const [t, l] of Object.entries(state)) if (l.length) keepOnly[t] = l; storage.setItem(UNSENT_KEY, JSON.stringify(keepOnly)); return true; } catch { return false; }
}
