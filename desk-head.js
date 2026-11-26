// Quick desk layer 2, "Send to head" (no AI, no key): the pure parts the page uses to show where a sent message stands. Tested in Node.
// The message itself is built on the server (server/deskhead.ts); this file only turns the server's status into words for the card.
export const POLL_MS = 3000;
export const GIVE_UP_MS = 20 * 60000;
export const SEND_HINT = "One message to the head thread. Free, no AI.";

/** The card for one sent message. status = { state: waiting|queued|working|replied|unknown, position, reply: {text, at}|null, title }, timedOut = we stopped looking. */
export function headCard(status, sentAt, now = Date.now(), timedOut = false) {
  const s = status || { state: "waiting" };
  const head = (s.title && String(s.title)) || "the head";
  // a reply that exists wins over a stale "waiting"/"working" state (the poll may have saved the text before the state caught up)
  if (s.reply && s.reply.text && (s.state === "replied" || s.state === "waiting" || s.state === "working" || s.state === "queued" || !s.state)) {
    const lines = String(s.reply.text).split(/\n+/).map((x) => x.trim()).filter(Boolean).slice(0, 12);
    return { tone: "replied", title: "Head replied", lines, tags: ["from " + head], done: true };
  }
  if (s.state === "unknown") return { tone: "late", title: "Sent to head", lines: [String(s.text || "Open the head thread")], tags: ["see the head thread"], done: true };
  if (timedOut) return { tone: "late", title: "Sent to head", lines: ["No reply yet. The message is in the head thread; open it there to see more."], tags: ["stopped looking"], done: true };
  if (s.state === "queued") return { tone: "queued", title: "Queued", lines: ["The head is busy. Your message waits" + (s.position > 1 ? " (number " + s.position + " in line)." : " and goes next.")], tags: ["sent"], done: false };
  if (s.state === "working") return { tone: "working", title: "Sent to head", lines: ["The head is working on it."], tags: ["sent"], done: false };
  return { tone: "waiting", title: "Sent to head", lines: ["Delivered. Waiting for the head to pick it up."], tags: ["sent"], done: false };
}

/** Why the Send button is greyed (one line), or "" when it can send. info = GET /api/desk/head. */
export function sendBlock(info) {
  if (!info) return "Checking the head thread…";
  if (info.available === false) return info.why || "The head thread is not reachable.";
  return "";
}
