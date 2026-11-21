// One question at a time (pure functions, no DOM). You's top rule: he never sees several open questions at once.
//  - queueItems: everything waiting on him, in the order he should see it: questions and approvals first (oldest first), then failures, GROUPED by cause (one cause = one item).
//  - splitQueue: ONE card in front, the rest only as a count (or a list behind "Show all" on the Mac).
//  - stepNews: helper/agent news that arrives while a question is open is held (a small count) and becomes ONE summary line after he answers.
import { plainCause } from "./cause.js";
export const FAIL_WINDOW_MS = 24 * 3600_000;

/**
 * Cards waiting on You. `data` is the Today view; `later` maps id -> snooze-until; `answered` holds request ids already answered here
 * (so the next card comes up before the server catches up); `dismissed` maps a failed thread id -> the activityAt he already saw.
 */
export function queueItems(data, { later = {}, answered = new Set(), dismissed = {}, now = Date.now(), match = () => true } = {}) {
  if (!data) return [];
  const asks = [], fails = [];
  for (const n of data.needs || []) {
    if (n.held || (n.requestId && answered.has(n.requestId)) || (later[n.id] || 0) > now || !match(n.title, n.rootTitle, n.detail)) continue;
    asks.push({ kind: n.kind, id: n.id, since: n.since, need: n });
  }
  for (const g of data.done || []) {
    if (g.status !== "failed" || now - g.activityAt > FAIL_WINDOW_MS) continue;
    if (dismissed[g.id] === g.activityAt || (later[g.id] || 0) > now || !match(g.title, g.project)) continue;
    fails.push(g);
  }
  const byAge = (a, b) => a.since - b.since || (a.id < b.id ? -1 : 1);
  return [...asks.sort(byAge), ...groupFailures(fails)];
}

/** Questions and approvals come first, oldest first. Failures come after, grouped by plain cause: one cause = ONE item, however many threads. */
export function groupFailures(fails) {
  const by = new Map();
  for (const g of fails) {
    const c = plainCause(g.reason);
    const key = c.key + ":" + c.text;
    if (!by.has(key)) by.set(key, { key, cause: c, threads: [] });
    by.get(key).threads.push(g);
  }
  const items = [...by.values()].map((x) => {
    const threads = x.threads.sort((a, b) => b.activityAt - a.activityAt || (a.id < b.id ? -1 : 1));
    const since = threads[0].activityAt; // the newest failure in the group
    // A single failure keeps its own card (its title and chat); two or more become one group card.
    return threads.length === 1
      ? { kind: "failed", id: threads[0].id, since, group: threads[0], cause: x.cause, threads }
      : { kind: "failgroup", id: "fg:" + x.key, since, cause: x.cause, threads };
  });
  return items.sort((a, b) => b.threads.length - a.threads.length || a.since - b.since || (a.id < b.id ? -1 : 1));
}

/** "15 failed, Codex hitting its usage limit" */
export const failGroupTitle = (it) => it.threads.length + " failed, " + it.cause.text;

/** How long "Retry later" hides a failure group: until the failing AI's next reset (usage plans), else a fixed wait. */
export const RETRY_FALLBACK_MS = 2 * 3600_000;
const PLAN_FOR = { Codex: ["codex"], Claude: ["claude", "claude_2"], Antigravity: ["antigravity"], Copilot: ["copilot"] };
export function retryUntil(cause, usage, now = Date.now()) {
  if (cause && cause.key === "limit") {
    const m = /^(Codex|Claude|Antigravity|Copilot)\b/.exec(cause.text || "");
    const ids = m ? PLAN_FOR[m[1]] : null;
    const times = [];
    for (const p of (usage && usage.plans) || []) {
      if (ids && !ids.includes(p.id)) continue;
      if (p.limitedUntil) times.push(Date.parse(p.limitedUntil));
      else for (const w of p.windows || []) if (w.resetsAt && w.leftPct <= 5) times.push(Date.parse(w.resetsAt));
    }
    const next = times.filter((t) => Number.isFinite(t) && t > now).sort((a, b) => a - b)[0];
    if (next) return next + 60_000; // a minute after the reset
  }
  return now + RETRY_FALLBACK_MS;
}

/** One card in front; `waiting` is a number only. With `showAll` (the Mac toggle) the rest is listed too. */
export function splitQueue(items, showAll = false) {
  return { front: items[0] || null, waiting: Math.max(0, items.length - 1), rest: showAll ? items.slice(1) : [] };
}

/** id -> status for every thread (roots and helpers) in the Today view. */
export function snapshot(data) {
  const m = {};
  if (!data) return m;
  for (const g of [...(data.working || []), ...(data.done || [])]) {
    m[g.id] = g.status;
    for (const k of g.helpers || []) m[k.id] = k.status;
  }
  return m;
}

/** What changed between two snapshots, in words You counts: threads that finished, started or failed. `skip` = ids already shown as cards. */
export function diffNews(base, cur, skip = new Set()) {
  const d = { finished: 0, started: 0, failed: 0 };
  for (const [id, st] of Object.entries(cur)) {
    if (skip.has(id) || base[id] === st) continue;
    if (st === "done") d.finished++;
    else if (st === "failed") d.failed++;
    else if (st === "working" && base[id] !== "needs-you" && base[id] !== "stalled") d.started++;
  }
  return d;
}
export const newsCount = (d) => d.finished + d.started + d.failed;
export function newsLine(d) {
  const parts = [d.finished && `${d.finished} finished`, d.started && `${d.started} started`, d.failed && `${d.failed} failed`].filter(Boolean);
  return parts.length ? "While you answered: " + parts.join(", ") : "";
}

export const newsStart = () => ({ base: null, frontId: null, line: "", lineAt: 0, pending: 0 });
export const LINE_SHOW_MS = 30_000;

/**
 * One step of the news rule. Call it every time the data or the queue changed.
 *  - no question open: nothing is held, the baseline follows the data;
 *  - a question is open: the baseline stays, `pending` counts what is being held (shown as a small badge);
 *  - the open question was answered or put off: ONE summary line of what was held, then the baseline moves on.
 */
export function stepNews(st, data, items, now = Date.now()) {
  const cur = snapshot(data), frontId = items[0] ? items[0].id : null;
  if (!st.base) return { ...st, base: cur, frontId, pending: 0 };
  const skip = new Set(items.flatMap((i) => [i.id, ...(i.threads || []).map((g) => g.id)]));
  if (st.frontId !== null && !skip.has(st.frontId)) {
    const text = newsLine(diffNews(st.base, cur, skip));
    return { base: cur, frontId, line: text || st.line, lineAt: text ? now : st.lineAt, pending: 0 };
  }
  if (frontId === null) return { ...st, base: cur, frontId: null, pending: 0 };
  return { ...st, frontId, pending: newsCount(diffNews(st.base, cur, skip)) };
}
/** The summary line, only while it is fresh. */
export const freshLine = (st, now = Date.now()) => (st.line && now - st.lineAt < LINE_SHOW_MS ? st.line : "");
