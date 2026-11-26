// Topics board (You's pick: mock option B). A few long-lived topic threads (Salon, Cars, Life, the head ...) shown as quiet rows under the decision card on Today
// (name, ONE status line shown whole, a lilac dot until opened, a chevron), plus a full Topics board: big cards on the phone, list left + chat right on the desktop.
// The server (GET /api/topics) owns names, status lines and the unread flag; this file only draws. Pure helpers first (Node tests them). No innerHTML (CSP).

/** Lilac dot = something new; cyan stays reserved for "needs you". */
export const unreadCount = (topics) => (Array.isArray(topics) ? topics : []).filter((t) => t && t.unread).length;
export const hasTopics = (topics) => Array.isArray(topics) && topics.length > 0;

/** The topic with this id opened by You: dot off (new array; the server is told separately). */
export const markOpened = (topics, id) => (topics || []).map((t) => (t.id === id ? { ...t, unread: false } : t));

/**
 * A read of /api/topics that STARTED at `startedAt` must not bring back a dot for a topic You opened since: the server may not have had his "seen" yet.
 * `opened`: topic id -> the time its "seen" write finished (Infinity while it is still in flight). A read that started after that time is the truth.
 * `openThreadId`: the thread on screen right now; its topic never shows a dot (he is looking at it).
 */
export function keepOpened(topics, opened, startedAt, openThreadId = null) {
  return (topics || []).map((t) => (t.unread && ((opened && opened[t.id] !== undefined && startedAt <= opened[t.id]) || (openThreadId && t.threadId === openThreadId)) ? { ...t, unread: false } : t));
}

/** One of six fixed colour classes per topic, the same every time (CSP: no inline colours). */
export function colorClass(id) {
  let n = 0;
  for (const c of String(id || "")) n = (n * 31 + c.charCodeAt(0)) >>> 0;
  return "tp-c" + (n % 6);
}
export const initial = (name) => ([...String(name || "?").trim()][0] || "?").toUpperCase();

/** "12 min ago", "2 h ago", "3 d ago"; "" when unknown. */
export function agoText(ms, now = Date.now()) {
  if (!ms) return "";
  const s = Math.max(0, (now - ms) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return Math.round(s / 60) + " min ago";
  if (s < 86400) return Math.round(s / 3600) + " h ago";
  return Math.round(s / 86400) + " d ago";
}
/** What the row says when T3 has no message to show. */
export const statusOf = (t) => (t && t.status ? t.status : "No news yet");
const label = (t) => t.name + (t.unread ? ", new" : "") + ". " + statusOf(t);

/** The avatar: the head gets a pixel face (the app passes `headFace`, so the demo build keeps its stand-in sprites), the others a coloured initial. */
function avatar(h, t, headFace) {
  const face = t.head && headFace ? headFace() : null;
  return face ? h("span", { class: "tp-av tp-head", "aria-hidden": "true" }, face) : h("span", { class: "tp-av " + colorClass(t.id), "aria-hidden": "true" }, initial(t.name));
}

/** Today: the section header ("Topics", a count of what is new, "Board ›") and ONE group of rows. Null when there are no topics. */
export function topicsGroup({ h, topics, open, board, headFace = null }) {
  if (!hasTopics(topics)) return null;
  const n = unreadCount(topics);
  return [
    h("div", { class: "sec tp-sec" }, h("span", { class: "sec-t" }, "Topics"), n ? h("span", { class: "n tp-new", "data-act": "topics-new" }, n + " new") : null,
      h("button", { type: "button", "data-act": "topics-board", "aria-label": "Open the Topics board", onclick: (e) => board(e) }, "Board ›")),
    h("div", { class: "tp-grp", role: "list", "data-act": "topics-rows" }, topics.map((t) =>
      h("button", { type: "button", role: "listitem", class: "tp-row" + (t.unread ? " unread" : " read"), "data-act": "topic-row", "data-topic": t.id, "aria-label": label(t), onclick: (e) => open(t, e) },
        avatar(h, t, headFace), h("span", { class: "tp-mid" }, h("span", { class: "tp-n" }, t.name, t.head ? h("small", { class: "tp-tag" }, "head") : null), h("span", { class: "tp-st" }, statusOf(t))),
        t.unread ? h("i", { class: "tp-dot", title: "New", "aria-hidden": "true" }) : null, h("span", { class: "tp-ch", "aria-hidden": "true" }, "›")))),
  ];
}

/** The board: a title, a one-line summary and one big card per topic. `sel` = the thread id of the open chat (desktop: highlighted). */
export function topicsBoard({ h, topics, open, back, sel = null, now = Date.now(), headFace = null }) {
  const n = unreadCount(topics || []);
  return h("div", { class: "tp-board", "data-act": "topics-board-page" },
    h("div", { class: "tp-nav" }, h("button", { type: "button", class: "tp-back", "data-act": "topics-back", "aria-label": "Back to Today", onclick: (e) => back(e) }, "‹ Today")),
    h("div", { class: "title" }, h("h1", {}, "Topics")),
    h("p", { class: "sub" }, !hasTopics(topics) ? "No topics yet." : n ? n + " with news" : "Nothing new"),
    (topics || []).map((t) =>
      h("button", { type: "button", class: "tp-card" + (t.unread ? " unread" : " read") + (t.head ? " head" : "") + (sel && sel === t.threadId ? " sel" : ""), "data-act": "topic-card", "data-topic": t.id, "aria-label": label(t), onclick: (e) => open(t, e) },
        h("span", { class: "tp-ctop" }, avatar(h, t, headFace), h("span", { class: "tp-n" }, t.name, t.head ? h("small", { class: "tp-tag" }, "· head") : null), t.unread ? h("i", { class: "tp-dot", title: "New", "aria-hidden": "true" }) : null),
        h("span", { class: "tp-cst" }, statusOf(t)),
        h("span", { class: "tp-ctm" }, agoText(t.updatedAt, now)))));
}
