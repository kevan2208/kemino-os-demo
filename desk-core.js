// Quick-chat desk, layer 0 (no AI, no network, no keys). PURE functions, tested in Node: the typed commands and the answer builders.
// Every answer comes ONLY from Kemino's own data (usage reading, Today data, the repo's plan files) and says how old that data is.
export const COMMANDS = ["status", "next", "usage", "jobs"];
export const CHIPS = [["status", "Status"], ["next", "Next"], ["usage", "Usage"], ["jobs", "Running jobs"]];
export const FREE_HINT = "free \u00b7 instant";

const num = (v) => typeof v === "number" && Number.isFinite(v);
const WEEK_MS = 7 * 86400_000;
const isWeekly = (l) => /week|7\s*d/i.test(String(l || ""));
const isFive = (l) => /5\s*h|hour/i.test(String(l || ""));

/** "/usage", "usage", "/Jobs " -> "usage"/"jobs"; "/help" or "/" -> "help"; any other /word -> "unknown"; plain text -> "text". Empty -> null. */
export function parseCommand(text) {
  const t = String(text || "").trim();
  if (!t) return null;
  if (!t.startsWith("/")) { const w = t.toLowerCase().replace(/[?!.\s]+$/g, ""); return COMMANDS.includes(w) ? w : "text"; }
  const w = t.slice(1).trim().split(/\s+/)[0].toLowerCase();
  if (!w || w === "help" || w === "?") return "help";
  return COMMANDS.includes(w) ? w : "unknown";
}

/** "just now", "5 min ago", "2 h ago", "3 d ago"; "unknown age" without a time. */
export function ago(ms, now = Date.now()) {
  if (!num(ms) || ms <= 0) return "unknown age";
  const m = Math.max(0, Math.round((now - ms) / 60000));
  return m < 1 ? "just now" : m < 60 ? m + " min ago" : m < 1440 ? Math.round(m / 60) + " h ago" : Math.round(m / 1440) + " d ago";
}
/** "Wed 23:00" style reset text from an ISO time (local time of the device). */
export function resetText(iso) {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return "";
  const d = new Date(t);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()] + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}

const planOf = (usage, id) => ((usage && usage.plans) || []).find((p) => p.id === id) || null;
const win = (plan, test) => ((plan && plan.windows) || []).find((w) => test(w.label) && num(w.usedPct)) || null;
const pct = (v) => Math.round(v);

/** Age of the usage reading in ms-since-epoch: the newest "read at" the server stamped, minus the stale minutes of a plan served from the last good reading. */
export function usageAsOf(usage, now = Date.now()) {
  if (!usage || !num(usage.readAt)) return 0;
  const stale = Math.max(0, ...((usage.plans || []).map((p) => (num(p.staleMin) ? p.staleMin : 0))));
  return usage.readAt - stale * 60000 > 0 ? usage.readAt - stale * 60000 : 0;
}

/** Is Claude out? Every Claude plan we can see (Kemino, kbb) is limited or has a window used up. One account still fine = not out. Returns { out, until } (until = soonest reset text, "" if unknown). */
export function claudeOut(usage, now = Date.now()) {
  const plans = ((usage && usage.plans) || []).filter((p) => p.id === "claude" || p.id === "claude_2");
  if (!plans.length) return { out: false, until: "" };
  const gone = (p) => !!(p.limited || p.limitedUntil || (p.windows || []).some((w) => num(w.leftPct) && w.leftPct <= 0));
  if (!plans.every(gone)) return { out: false, until: "" };
  const times = plans.map((p) => p.limitedUntil || ((p.windows || []).filter((w) => num(w.leftPct) && w.leftPct <= 0 && w.resetsAt).map((w) => w.resetsAt)[0]) || "")
    .map((s) => Date.parse(s)).filter((t) => Number.isFinite(t) && t > now).sort((a, b) => a - b);
  return { out: true, until: times.length ? resetText(new Date(times[0]).toISOString()) : "" };
}

function planLine(p, now) {
  if (p.limited || p.limitedUntil) return p.name + " is limited" + (p.limitedUntil ? " until " + resetText(p.limitedUntil) : "");
  const wk = win(p, isWeekly), fh = win(p, isFive), any = !wk && !fh ? (p.windows || []).find((w) => num(w.usedPct)) : null;
  const parts = [];
  if (wk) parts.push(pct(wk.usedPct) + "% weekly");
  if (fh) parts.push(pct(fh.usedPct) + "% of 5 h");
  if (any) parts.push(pct(any.usedPct) + "% of " + String(any.label).toLowerCase());
  if (!parts.length) return p.name + ": " + (p.note || "no reading");
  let s = p.name + " " + parts.join(" \u00b7 ");
  if (p.pace && num(p.pace.gapPts)) s += p.pace.gapPts > 0 ? " (+" + Math.round(p.pace.gapPts) + " ahead of pace)" : " (" + Math.abs(Math.round(p.pace.gapPts)) + " under pace)";
  return s;
}

/** Usage: one line per provider, read from the same reading as the top-bar pace line. */
export function usageAnswer({ usage, now = Date.now() }) {
  const plans = (usage && usage.plans) || [];
  if (!plans.length) return { kind: "usage", title: "Usage", lines: [usage && usage.error ? usage.error : "No usage reading yet."], tags: [], asOf: 0, empty: true };
  const kem = planOf(usage, "claude"), wk = win(kem, isWeekly);
  const tags = ["read from ai-usage"];
  const reset = wk && wk.resetsAt ? resetText(wk.resetsAt) : "";
  if (reset) tags.push("Kemino resets " + reset);
  return { kind: "usage", title: "Usage", lines: plans.map((p) => planLine(p, now)), tags, bar: wk ? pct(wk.usedPct) : null, asOf: usageAsOf(usage, now) };
}

/** Running jobs, from the buddies' view of T3: vms = [{ name, running: [{id,title}], needs: [{id,title}] }]. */
export function jobsAnswer({ vms, connected = true, now = Date.now() }) {
  const run = [], ask = [];
  for (const v of vms || []) {
    for (const j of v.running || []) run.push((v.name || "AI") + ": " + (j.title || j.id));
    for (const j of v.needs || []) ask.push((v.name || "AI") + ": " + (j.title || j.id));
  }
  const lines = run.slice(0, 8);
  if (run.length > 8) lines.push("+" + (run.length - 8) + " more");
  if (!run.length) lines.push(connected ? "Nothing is running right now." : "T3 is offline: no live list.");
  const tags = [run.length + " running"];
  if (ask.length) tags.push(ask.length + " waiting for you");
  return { kind: "jobs", title: "Running jobs", lines, tags, asOf: connected ? now : 0, live: true };
}

/** Next: the numbered "Next" items from the repo's HANDOFF. next = { available, asOf, next: [..], running: [..], waiting }. */
export function nextAnswer({ next, now = Date.now() }) {
  if (!next || !next.available) return { kind: "next", title: "Next", lines: ["The plan files are not on this machine, so I cannot read the Next list."], tags: [], asOf: 0, empty: true };
  const lines = (next.next || []).slice(0, 3);
  if (!lines.length) lines.push("The handoff lists no open Next item.");
  const tags = ["from HANDOFF.md"];
  if (next.running && next.running.length) tags.push(next.running.length + " on the board");
  if (next.waiting) tags.push(next.waiting + " waiting for a release");
  return { kind: "next", title: "Next", lines, tags, asOf: next.asOf || 0 };
}

/** Status: the one-glance line. */
export function statusAnswer({ usage, vms, needCount = 0, connected = true, now = Date.now() }) {
  const kem = planOf(usage, "claude"), wk = win(kem, isWeekly), fh = win(kem, isFive);
  const run = (vms || []).reduce((n, v) => n + (v.running || []).length, 0);
  const out = claudeOut(usage, now);
  const lines = [];
  if (kem && (kem.limited || kem.limitedUntil)) lines.push("Kemino is limited" + (kem.limitedUntil ? " until " + resetText(kem.limitedUntil) : "") + ".");
  else if (wk) lines.push("Kemino " + pct(wk.usedPct) + "% weekly" + (kem.pace && num(kem.pace.gapPts) ? (kem.pace.gapPts > 0 ? ", " + Math.round(kem.pace.gapPts) + " ahead of pace" : ", " + Math.abs(Math.round(kem.pace.gapPts)) + " under pace") : "") + (fh ? " \u00b7 5 h window " + pct(fh.usedPct) + "%" : "") + ".");
  else lines.push("No Kemino usage reading yet.");
  lines.push(connected ? run + " running \u00b7 " + (needCount ? needCount + " need you" : "nothing needs you") + "." : "T3 is offline: running jobs unknown.");
  const tags = [];
  if (wk && wk.resetsAt) tags.push("weekly resets " + resetText(wk.resetsAt));
  if (out.out) tags.push("Claude is out");
  return { kind: "status", title: "Status", lines, tags, bar: wk ? pct(wk.usedPct) : null, asOf: usageAsOf(usage, now) || (connected ? now : 0) };
}

export const BUILDERS = { status: statusAnswer, next: nextAnswer, usage: usageAnswer, jobs: jobsAnswer };
/** One call for the UI: command word -> answer card model. Anything else -> a plain "not a command" note (no AI in this layer). */
export function answerFor(cmd, ctx) {
  if (BUILDERS[cmd]) return BUILDERS[cmd](ctx);
  if (cmd === "help") return { kind: "note", title: "What I can answer", lines: ["/status, /next, /usage and /jobs: answered instantly from Kemino's own data. No AI yet, so free text cannot be answered."], tags: [], asOf: 0 };
  if (cmd === "unknown") return { kind: "note", title: "Unknown command", lines: ["Try /status, /next, /usage or /jobs."], tags: [], asOf: 0 };
  return { kind: "note", title: "No AI yet", lines: ["This desk answers /status, /next, /usage and /jobs from Kemino's own data. Free-text questions come later."], tags: [], asOf: 0 };
}
/** "as of 3 min ago" for the card footer; live data says "live". */
export function asOfLine(a, now = Date.now()) {
  if (!a.asOf) return "";
  return a.live ? "live" : "as of " + ago(a.asOf, now);
}
