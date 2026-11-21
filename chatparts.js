// CHAT PARTS: the pure decisions behind the redesigned chat (You, Nov 2026). No DOM here, so Node can test every line.
// Turn = everything between one "user" item (You's or a relayed one) and the next. All tool rows of a turn fold into ONE quiet "Worked for 32s" row.

/** "32s", "2m 5s", "1h 3m". Under a second is "1s" (never "0s"). */
export function fmtDur(ms) {
  const s = Math.max(1, Math.round((Number(ms) || 0) / 1000));
  if (s < 60) return s + "s";
  const m = Math.floor(s / 60);
  if (m < 60) return m + "m" + (s % 60 ? " " + (s % 60) + "s" : "");
  return Math.floor(m / 60) + "h" + (m % 60 ? " " + (m % 60) + "m" : "");
}

const ts = (x) => { const n = Date.parse(x?.at); return Number.isFinite(n) ? n : null; };

/**
 * The summary of one turn's tool rows. `endAt` = when the turn ended (ms; the last reply of the turn, or now while running).
 * { label, steps, add, del, failed, ms }: label is "Worked for 32s" (or "Worked · 3 steps" when no time is known, "Working · 3 steps" while running).
 */
export function workSummary(tools, { endAt = null, running = false } = {}) {
  const steps = tools.length;
  let add = 0, del = 0, failed = false;
  for (const t of tools) { add += Number(t.add) > 0 ? Number(t.add) : 0; del += Number(t.del) > 0 ? Number(t.del) : 0; if (t.state === "failed") failed = true; }
  const first = ts(tools[0]), lastT = ts(tools[steps - 1]);
  const end = endAt != null && Number.isFinite(endAt) ? Math.max(endAt, lastT ?? 0) : lastT;
  const ms = first != null && end != null && end > first ? end - first : null;
  const label = running ? "Working" + (ms ? " for " + fmtDur(ms) : " · " + steps + (steps === 1 ? " step" : " steps"))
    : ms ? "Worked for " + fmtDur(ms) : "Worked · " + steps + (steps === 1 ? " step" : " steps");
  return { label, steps, add, del, failed, ms };
}

/**
 * Lays out the chat: [{ type: "item", it } | { type: "work", tools, id, endAt }].
 * Every tool row of a turn moves into one "work" entry, placed where the turn's first tool row was.
 * `running` + `now`: the last turn's work row is still going (its end is "now").
 */
export function layoutTurns(items, { running = false, now = Date.now() } = {}) {
  const out = [];
  let turn = null; // { work: entry|null, lastAt: ms|null }
  const close = () => { if (turn?.work && turn.lastAt != null) turn.work.endAt = turn.lastAt; };
  for (const it of items) {
    if (it.role === "user") { close(); turn = { work: null, lastAt: null }; out.push({ type: "item", it }); continue; }
    if (!turn) turn = { work: null, lastAt: null };
    if (it.role === "tool") {
      if (!turn.work) { turn.work = { type: "work", tools: [], id: it.id, endAt: null }; out.push(turn.work); }
      turn.work.tools.push(it);
      continue;
    }
    if (it.role === "assistant") turn.lastAt = ts(it) ?? turn.lastAt;
    out.push({ type: "item", it });
  }
  const lastWork = turn?.work;
  if (lastWork && running) lastWork.endAt = now; else close();
  if (lastWork) lastWork.live = !!running;
  return out;
}

/** The ids of the last assistant reply of each turn: only these get the tiny time + copy line. */
export function lastReplyIds(items) {
  const ids = new Set();
  let cur = null;
  for (const it of items) {
    if (it.role === "user") { if (cur) ids.add(cur); cur = null; }
    else if (it.role === "assistant" && String(it.text ?? "").trim()) cur = it.id;
  }
  if (cur) ids.add(cur);
  return ids;
}

/** One-line chip text for a relayed message: sender plus the first words, no markdown noise. */
export function relayChipText(text, max = 90) {
  const t = String(text ?? "").replace(/```[\s\S]*?```/g, " ").replace(/[*_`#>~]|\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1).replace(/\s+\S*$/, "") + "…" : t;
}

/** Show the jump-to-latest chevron when the reader is more than `gap` px above the bottom. */
export function jumpVisible({ scrollHeight, scrollTop, clientHeight }, gap = 240) {
  return scrollHeight - scrollTop - clientHeight > gap;
}

/** "Working 22s" for the floating pill; `since` and `now` in ms. Null when nothing runs or the start is unknown (the pill then says just "Working"). */
export function workingText(since, now) {
  if (!Number.isFinite(since) || !Number.isFinite(now)) return "Working";
  return "Working " + fmtDur(Math.max(0, now - since));
}

/** When did the running turn start? The newest user item's time, or null. */
export function runStart(items) {
  for (let i = items.length - 1; i >= 0; i--) if (items[i].role === "user") return ts(items[i]);
  return null;
}

/** Which quick replies make sense right now. Stop only while running; Go/Yes/Continue only while a plain QUESTION waits.
 * A permission or a secret has its own buttons (a typed "Yes" approves nothing; for a secret it is wrong), so no chips there. */
export function quickReplies({ running, waiting, kind = "question", secret = false }) {
  return { stop: !!running, answers: waiting && kind === "question" && !secret ? ["Go", "Yes", "Continue"] : [] };
}

/** The chips row above the composer: shown while the thread runs (Working chip + Stop), while quick answers apply, or while the jump chevron is needed. Pure. */
export function dockRow({ running, far, answers }) {
  const a = answers?.length || 0;
  return { show: !!running || !!far || a > 0, working: !!running, jump: !!far, answers: a };
}
