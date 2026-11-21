import { relayChipText } from "./chatparts.js";
// RELAYED MESSAGES: a message another thread sent (t3_thread_send) or the server made is NOT You's. It gets its own left-hand card
// (sender's face + "From <thread>", a small tag, teal edge), shown IN FULL (he reads through them and chooses; You 7 Nov: no "Show more"),
// NEVER folded: reports, answers, anything with a question or options (You 7 Nov). Only the noisy automatic "Delegated task node:… [completed]" notices fold:
// a clean one-line title ("Task finished: <title>", no raw ids) with the result clamped to two lines and a toggle. your own messages stay purple on the right.
// the server classifies (chat.ts messageKind: item.kind "user" | "agent" | "system"); this file only draws. Display only, classes only (CSP), text as text nodes.

/** The automatic notice T3 posts when a delegated task ends: "Delegated task node:<long id> (<title>) [completed]:\n<result>". Null for anything else. */
export function parseSystemNotice(text) {
  const m = /^\s*Delegated task node:\S+(?:\s+\(([^)\n]*)\))?\s+\[([a-z_-]+)\]:?\s*([\s\S]*)$/i.exec(String(text ?? ""));
  if (!m) return null;
  const state = m[2].toLowerCase(), title = (m[1] || "").trim();
  const word = state === "completed" ? "Task finished" : state === "failed" ? "Task failed" : state === "cancelled" || state === "canceled" ? "Task cancelled" : "Task " + state;
  return { title: title ? word + ": " + title : word, state, body: m[3].trim() };
}
/** Only a parsed automatic notice with a result longer than two lines ever folds. Reports, answers and options from agents are always shown in full. */
export function needsToggle(text, kind) {
  if (kind !== "system") return false;
  const n = parseSystemNotice(text);
  if (!n || !n.body) return false;
  return n.body.split("\n").filter((l) => l.trim()).length > 2 || n.body.length > 160;
}

/** Is this a message that did NOT come from You? (kind "agent" or "system"; anything else, including a missing kind, is You's.) */
export const isRelayed = (m) => m?.role === "user" && (m.kind === "agent" || m.kind === "system");


/** Who to name on the card: { name, tag, system }. Unknown sender thread: "another thread". An automatic task notice gets a clean title, never raw ids. */
export function relayedWho(m) {
  if (m?.kind === "system") { const n = parseSystemNotice(m.text); return { name: n ? n.title : "System message", tag: "automatic", system: true }; }
  const title = m?.from?.title;
  return { name: "From " + (title ? title : "another thread"), tag: "agent", system: false };
}

/**
 * A relayed message is ONE collapsed line by default (You, Nov 2026): icon + sender + first words + chevron. Tap = the full text in a quiet card
 * (tap the head again to fold it). deps: h, md (renderMarkdown or null), time (already formatted), open (expanded?), onToggle, icon / chev (node factories, optional).
 * No face or buddy in the chat view. The expanded text is never clamped: he reads through these and chooses.
 */
export function relayedNode({ h, md, time, m, open, onToggle, icon, chev }) {
  const who = relayedWho(m);
  const notice = m.kind === "system" ? parseSystemNotice(m.text) : null, shown = notice ? notice.body : String(m.text);
  if (!open) {
    return h("button", { class: "m relay rchip" + (who.system ? " sys" : ""), type: "button", "data-kind": m.kind, "aria-expanded": "false", onclick: onToggle },
      icon ? icon() : null, h("em", { class: "rn" }, who.name), h("span", { class: "rs" }, relayChipText(shown || who.name)), chev ? chev() : null);
  }
  const body = !shown ? null : md ? h("div", { class: "rb md" }, md(shown)) : h("div", { class: "rb" }, shown);
  return h("div", { class: "m relay open" + (who.system ? " sys" : ""), "data-kind": m.kind },
    h("button", { class: "rh", type: "button", "aria-expanded": "true", onclick: onToggle }, icon ? icon() : null, h("span", { class: "rn" }, who.name), h("em", { class: "rtag" }, who.tag), h("span", { class: "rt" }, time), chev ? chev() : null),
    body);
}
